/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ExtensionContext, Uri, ViewColumn, WebviewPanel, window } from 'vscode';
import { Repository } from './repository';
import { execFile } from 'child_process';

type CommitItem = {
	hash: string;
	subject: string;
	authorDate?: string;
	status: 'good' | 'bad' | 'unknown';
};

type StartBisectMessage = {
	type: 'start';
	branch: string;
	commitsBack: number;
};

type CheckoutCommitMessage = {
	type: 'checkoutCommit';
	commitHash: string;
};

type MarkBisectMessage = {
	type: 'mark';
	commitHash: string;
	verdict: 'good' | 'bad';
};

type BranchItem = {
	name: string;
	current: boolean;
};

type BisectSessionState = {
	commits: CommitItem[];
	currentCommitHash: string;
};

export class Bisect implements Disposable {

	private disposables: Disposable[];

	constructor(private readonly context: ExtensionContext) {
		this.disposables = [];
	}

	startBisect(repository: Repository): void {
		const repositoryPath: string = repository.root;

		const sessionState: BisectSessionState = {
			commits: [],
			currentCommitHash: ''
		};

		const panel: WebviewPanel = this.createWebviewPanel();

		const messageDisposable = this.prepareOnDidReceiveMessage(panel, repositoryPath, sessionState);

		this.disposables.push(panel, messageDisposable);

		panel.webview.html = this.getHtml(panel);
	}

	private createWebviewPanel(): WebviewPanel {
		return window.createWebviewPanel(
			'gitBisect',
			'Git Bisect',
			ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [
					Uri.joinPath(this.context.extensionUri, 'bisect-ui', 'dist')
				]
			}
		);
	}

	private prepareOnDidReceiveMessage(panel: WebviewPanel, repositoryPath: string, sessionState: BisectSessionState): Disposable {
		return panel.webview.onDidReceiveMessage(async message => {
			switch (message.type) {
				case 'ready': {
					await this.readyEvent(panel, repositoryPath);
					break;
				}
				case 'start': {
					await this.startEvent(panel, repositoryPath, sessionState, message);
					break;
				}
				case 'reset': {
					await this.resetEvent(panel, repositoryPath, sessionState);
					break;
				}
				case 'checkoutCommit': {
					await this.checkoutCommitEvent(panel, repositoryPath, sessionState, message);
					break;
				}
				case 'mark': {
					await this.markEvent(panel, repositoryPath, sessionState, message);
					break;
				}
			}
		});
	}

	// Handles the initial webview ready event by loading repository branches and sending the initial UI state.
	private async readyEvent(panel: WebviewPanel, repositoryPath: string): Promise<void> {
		try {
			const branches = await this.getBranches(repositoryPath);
			const currentBranch = branches.find(branch => branch.current)?.name ?? branches[0]?.name ?? '';

			panel.webview.postMessage({
				type: 'init',
				branches,
				currentBranch
			});
		} catch (error) {
			console.error(error);

			panel.webview.postMessage({
				type: 'error',
				message: 'Could not load repository branches.'
			});
		}
	}

	// Starts the bisect workflow from a webview request, stores the initial session state, and notifies the UI.
	private async startEvent(panel: WebviewPanel, repositoryPath: string, sessionState: BisectSessionState, message: StartBisectMessage): Promise<void> {
		try {
			const startMessage = message as StartBisectMessage;

			const result = await this.startGitBisect(
				repositoryPath,
				startMessage.branch,
				startMessage.commitsBack
			);

			sessionState.commits = result.commits;
			sessionState.currentCommitHash = result.currentCommitHash;

			panel.webview.postMessage({
				type: 'started',
				commits: result.commits,
				currentCommitHash: result.currentCommitHash,
				message: result.message
			});
		} catch (error) {
			console.error(error);

			panel.webview.postMessage({
				type: 'error',
				message: this.toErrorMessage(error, 'Could not start git bisect.')
			});
		}
	}

	// Resets any active git bisect session, clears the in-memory timeline state, and reloads the branch list in the UI.
	private async resetEvent(panel: WebviewPanel, repositoryPath: string, sessionState: BisectSessionState): Promise<void> {
		try {
			await this.execGit(repositoryPath, ['bisect', 'reset']).catch(() => undefined);

			const branches = await this.getBranches(repositoryPath);
			const currentBranch = branches.find(branch => branch.current)?.name ?? branches[0]?.name ?? '';

			sessionState.commits = [];
			sessionState.currentCommitHash = '';

			panel.webview.postMessage({
				type: 'init',
				branches,
				currentBranch,
				message: 'Bisect reset.'
			});
		} catch (error) {
			console.error(error);

			panel.webview.postMessage({
				type: 'error',
				message: this.toErrorMessage(error, 'Could not reset git bisect.')
			});
		}
	}

	// Handles a timeline commit click after bisect finishes, resets bisect state, checks out the selected commit, and updates the UI.
	private async checkoutCommitEvent(panel: WebviewPanel, repositoryPath: string, sessionState: BisectSessionState, message: CheckoutCommitMessage): Promise<void> {
		try {
			const checkoutMessage = message as CheckoutCommitMessage;

			if (!sessionState.commits.some(commit => commit.hash === checkoutMessage.commitHash)) {
				throw new Error('The selected commit does not belong to the bisect timeline.');
			}

			await this.execGit(repositoryPath, ['bisect', 'reset']).catch(() => undefined);
			await this.execGit(repositoryPath, ['checkout', checkoutMessage.commitHash]);

			sessionState.currentCommitHash = checkoutMessage.commitHash;

			panel.webview.postMessage({
				type: 'checkedOut',
				commitHash: sessionState.currentCommitHash,
				message: `Checked out ${sessionState.currentCommitHash.substring(0, 7)}.`
			});
		} catch (error) {
			console.error(error);

			panel.webview.postMessage({
				type: 'error',
				message: this.toErrorMessage(error, 'Could not check out the commit.')
			});
		}
	}

	// Handles a user classification for the current bisect commit, advances git bisect, and updates the UI with either the next step or the final result.
	private async markEvent(panel: WebviewPanel, repositoryPath: string, sessionState: BisectSessionState, message: MarkBisectMessage): Promise<void> {
		try {
			const markMessage = message as MarkBisectMessage;

			sessionState.commits = sessionState.commits.map(commit => {
				if (commit.hash === markMessage.commitHash) {
					return {
						...commit,
						status: markMessage.verdict
					};
				}

				return commit;
			});

			const output = await this.execGit(repositoryPath, ['bisect', markMessage.verdict]);

			if (this.isBisectFinished(output)) {
				const resultHash = this.extractFirstBadCommitHash(output) ?? sessionState.currentCommitHash;

				sessionState.commits = this.resolveFinishedCommitStatuses(sessionState.commits, resultHash);

				const resultCommit = sessionState.commits.find(commit => commit.hash === resultHash);

				panel.webview.postMessage({
					type: 'finished',
					commits: sessionState.commits,
					result: {
						hash: resultHash,
						subject: resultCommit?.subject,
						rawOutput: output
					},
					message: 'Git bisect finished.'
				});

				return;
			}

			sessionState.currentCommitHash = await this.execGit(repositoryPath, ['rev-parse', 'HEAD']);

			panel.webview.postMessage({
				type: 'step',
				commits: sessionState.commits,
				currentCommitHash: sessionState.currentCommitHash,
				message: `Commit marked as ${markMessage.verdict}.`
			});
		} catch (error) {
			console.error(error);

			panel.webview.postMessage({
				type: 'error',
				message: this.toErrorMessage(error, 'Could not mark the commit.')
			});
		}
	}

	// Starts a git bisect session using the selected branch as the bad endpoint and an older commit as the good endpoint.
	private async startGitBisect(
		repositoryPath: string,
		branch: string,
		commitsBack: number
	): Promise<{ commits: CommitItem[]; currentCommitHash: string; message: string }> {
		const normalizedCommitsBack = Math.max(1, Math.floor(commitsBack || 1));

		await this.execGit(repositoryPath, ['bisect', 'reset']).catch(() => undefined);

		await this.execGit(repositoryPath, ['checkout', branch]);

		const rawCommits = await this.execGit(
			repositoryPath,
			[
				'log',
				branch,
				`--max-count=${normalizedCommitsBack + 1}`,
				'--pretty=format:%H%x1f%s%x1f%ad',
				'--date=short'
			]
		);

		const commitsNewestToOldest = rawCommits
			.split(/\r?\n/)
			.map(line => line.trim())
			.filter(Boolean)
			.map(line => {
				const [hash, subject, authorDate] = line.split('\x1f');

				return {
					hash,
					subject,
					authorDate,
					status: 'unknown' as const
				};
			});

		if (commitsNewestToOldest.length < 2) {
			throw new Error('The selected branch needs at least 2 commits to start git bisect.');
		}

		const requestedIndex = normalizedCommitsBack;
		const availableOldestIndex = commitsNewestToOldest.length - 1;
		const goodIndex = Math.min(requestedIndex, availableOldestIndex);

		const badCommit = commitsNewestToOldest[0];
		const goodCommit = commitsNewestToOldest[goodIndex];

		// Builds the commit list displayed in the UI, ordered from oldest to newest.
		const commitsOldestToNewest = commitsNewestToOldest
			.slice(0, goodIndex + 1)
			.reverse()
			.map(commit => {
				if (commit.hash === goodCommit.hash) {
					return {
						...commit,
						status: 'good' as const
					};
				}

				if (commit.hash === badCommit.hash) {
					return {
						...commit,
						status: 'bad' as const
					};
				}

				return commit;
			});

		await this.execGit(repositoryPath, ['bisect', 'start', badCommit.hash, goodCommit.hash]);

		const currentCommitHash = await this.execGit(repositoryPath, ['rev-parse', 'HEAD']);

		const effectiveCommitsBack = goodIndex;

		const message = effectiveCommitsBack < normalizedCommitsBack
			? `Requested ${normalizedCommitsBack} commits back, but only ${effectiveCommitsBack} are available. The oldest available commit was used.`
			: `Bisect started between ${goodCommit.hash.substring(0, 7)} and ${badCommit.hash.substring(0, 7)}.`;

		return {
			commits: commitsOldestToNewest,
			currentCommitHash,
			message
		};
	}

	private isBisectFinished(output: string): boolean {
		return output.includes('is the first bad commit')
			|| output.includes('first bad commit could be any of');
	}

	private extractFirstBadCommitHash(output: string): string | undefined {
		const match = output.match(/^([0-9a-f]{40}) is the first bad commit/m);

		return match?.[1];
	}

	// Executes a git command in the given repository path and returns the trimmed stdout.
	private execGit(repositoryPath: string, args: string[]): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(
				'git',
				args,
				{
					cwd: repositoryPath
				},
				(error, stdout, stderr) => {
					if (error) {
						reject(stderr || error.message);
						return;
					}

					resolve(stdout.trim());
				}
			);
		});
	}

	private toErrorMessage(error: unknown, fallback: string): string {
		if (typeof error === 'string' && error.trim().length > 0) {
			return error;
		}

		if (error instanceof Error && error.message.trim().length > 0) {
			return error.message;
		}

		return fallback;
	}

	private getBranches(repositoryPath: string): Promise<BranchItem[]> {
		return new Promise((resolve, reject) => {
			execFile(
				'git',
				[
					'branch',
					'--format=%(HEAD)|%(refname:short)'
				],
				{
					cwd: repositoryPath
				},
				(error, stdout, stderr) => {
					if (error) {
						reject(stderr || error.message);
						return;
					}

					const branches = stdout
						.split(/\r?\n/)
						.map(line => line.trim())
						.filter(Boolean)
						.map(line => {
							const [head, name] = line.split('|');

							return {
								name,
								current: head === '*'
							};
						});

					resolve(branches);
				}
			);
		});
	}

	// Resolves pending commit statuses to good or bad based on their position relative to the first bad commit.
	private resolveFinishedCommitStatuses(commits: CommitItem[], firstBadCommitHash: string): CommitItem[] {
		const firstBadIndex = commits.findIndex(commit => commit.hash === firstBadCommitHash);

		if (firstBadIndex < 0) {
			return commits;
		}

		return commits.map((commit, index) => {
			if (index < firstBadIndex) {
				return {
					...commit,
					status: 'good' as const
				};
			}

			return {
				...commit,
				status: 'bad' as const
			};
		});
	}

	private getHtml(panel: WebviewPanel): string {
		const scriptUri = panel.webview.asWebviewUri(
			Uri.joinPath(
				this.context.extensionUri,
				'bisect-ui',
				'dist',
				'assets',
				'bisect.js'
			)
		);

		const styleUri = panel.webview.asWebviewUri(
			Uri.joinPath(
				this.context.extensionUri,
				'bisect-ui',
				'dist',
				'assets',
				'index.css'
			)
		);

		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link rel="stylesheet" href="${styleUri}">
			</head>
			<body>
				<div id="root"></div>

				<script
					type="module"
					src="${scriptUri}"
				></script>
			</body>
			</html>
		`;
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
