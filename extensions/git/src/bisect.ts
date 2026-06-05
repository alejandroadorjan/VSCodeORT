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

type MarkBisectMessage = {
	type: 'mark';
	commitHash: string;
	verdict: 'good' | 'bad';
};

type BranchItem = {
	name: string;
	current: boolean;
};

export class Bisect implements Disposable {

	private disposables: Disposable[];

	constructor(private readonly context: ExtensionContext) {
		this.disposables = [];
	}

	startBisect(repository: Repository): void {
		const repositoryPath: string = repository.root;

		let commits: CommitItem[] = [];
		let currentCommitHash = '';

		const panel = window.createWebviewPanel(
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

		const messageDisposable = panel.webview.onDidReceiveMessage(async message => {
			switch (message.type) {
				case 'ready': {
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
							message: 'No se pudieron cargar las ramas del repositorio.'
						});
					}

					break;
				}
				case 'start': {
					try {
						const startMessage = message as StartBisectMessage;

						const result = await this.startGitBisect(
							repositoryPath,
							startMessage.branch,
							startMessage.commitsBack
						);

						commits = result.commits;
						currentCommitHash = result.currentCommitHash;

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
							message: this.toErrorMessage(error, 'No se pudo iniciar git bisect.')
						});
					}

					break;
				}
				case 'reset': {
					try {
						await this.execGit(repositoryPath, ['bisect', 'reset']).catch(() => undefined);

						const branches = await this.getBranches(repositoryPath);
						const currentBranch = branches.find(branch => branch.current)?.name ?? branches[0]?.name ?? '';

						commits = [];
						currentCommitHash = '';

						panel.webview.postMessage({
							type: 'init',
							branches,
							currentBranch,
							message: 'Bisect reiniciado.'
						});
					} catch (error) {
						console.error(error);

						panel.webview.postMessage({
							type: 'error',
							message: this.toErrorMessage(error, 'No se pudo reiniciar git bisect.')
						});
					}

					break;
				}
				case 'mark': {
					try {
						const markMessage = message as MarkBisectMessage;

						commits = commits.map(commit => {
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
							const resultHash = this.extractFirstBadCommitHash(output) ?? currentCommitHash;
							const resultCommit = commits.find(commit => commit.hash === resultHash);

							panel.webview.postMessage({
								type: 'finished',
								commits,
								result: {
									hash: resultHash,
									subject: resultCommit?.subject,
									rawOutput: output
								},
								message: 'Git bisect termino.'
							});

							break;
						}

						currentCommitHash = await this.execGit(repositoryPath, ['rev-parse', 'HEAD']);

						panel.webview.postMessage({
							type: 'step',
							commits,
							currentCommitHash,
							message: `Commit marcado como ${markMessage.verdict}.`
						});
					} catch (error) {
						console.error(error);

						panel.webview.postMessage({
							type: 'error',
							message: this.toErrorMessage(error, 'No se pudo marcar el commit.')
						});
					}

					break;
				}
			}
		});

		this.disposables.push(panel, messageDisposable);

		panel.webview.html = this.getHtml(panel);
	}

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
			throw new Error('La rama seleccionada necesita al menos 2 commits para iniciar git bisect.');
		}

		const requestedIndex = normalizedCommitsBack;
		const availableOldestIndex = commitsNewestToOldest.length - 1;
		const goodIndex = Math.min(requestedIndex, availableOldestIndex);

		const badCommit = commitsNewestToOldest[0];
		const goodCommit = commitsNewestToOldest[goodIndex];

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
			? `Se pidieron ${normalizedCommitsBack} commits hacia atras, pero solo hay ${effectiveCommitsBack} disponibles. Se uso el commit mas antiguo disponible.`
			: `Bisect iniciado entre ${goodCommit.hash.substring(0, 7)} y ${badCommit.hash.substring(0, 7)}.`;

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
