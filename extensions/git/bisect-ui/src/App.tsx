/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import './App.css';

type CommitStatus = 'good' | 'bad' | 'unknown';
type Verdict = 'good' | 'bad';
type BisectPhase = 'setup' | 'starting' | 'running' | 'finished';

type BranchOption = {
	readonly name: string;
	readonly current?: boolean;
};

type CommitItem = {
	readonly hash: string;
	readonly subject: string;
	readonly authorDate?: string;
	readonly status: CommitStatus;
};

type BisectResult = {
	readonly hash: string;
	readonly subject?: string;
	readonly rawOutput?: string;
};

type BisectUiState = {
	readonly branches: BranchOption[];
	readonly selectedBranch: string;
	readonly commitsBack: number;
	readonly phase: BisectPhase;
	readonly setupCollapsed: boolean;
	readonly commits: CommitItem[];
	readonly currentCommitHash: string | null;
	readonly selectedVerdict: Verdict | '';
	readonly result: BisectResult | null;
	readonly busy: boolean;
	readonly message: string | null;
	readonly error: string | null;
};

type WebviewToExtensionMessage =
	| { readonly type: 'ready' }
	| { readonly type: 'start'; readonly branch: string; readonly commitsBack: number }
	| { readonly type: 'mark'; readonly commitHash: string; readonly verdict: Verdict }
	| { readonly type: 'reset' }
	| { readonly type: 'checkoutCommit'; readonly commitHash: string };

type ExtensionToWebviewMessage =
	| { readonly type: 'init'; readonly branches: BranchOption[]; readonly currentBranch?: string }
	| { readonly type: 'started'; readonly commits: CommitItem[]; readonly currentCommitHash: string; readonly message?: string }
	| { readonly type: 'step'; readonly commits: CommitItem[]; readonly currentCommitHash: string; readonly message?: string }
	| { readonly type: 'finished'; readonly commits: CommitItem[]; readonly result: BisectResult; readonly message?: string }
	| { readonly type: 'checkedOut'; readonly commitHash: string; readonly message?: string }
	| { readonly type: 'error'; readonly message: string };

declare const acquireVsCodeApi: <TState = unknown>() => {
	postMessage: (message: WebviewToExtensionMessage) => void;
	getState: () => TState | undefined;
	setState: (state: TState) => void;
};

const defaultState: BisectUiState = {
	branches: [],
	selectedBranch: '',
	commitsBack: 10,
	phase: 'setup',
	setupCollapsed: false,
	commits: [],
	currentCommitHash: null,
	selectedVerdict: '',
	result: null,
	busy: false,
	message: null,
	error: null,
};

const vscode = typeof acquireVsCodeApi === 'function'
	? acquireVsCodeApi<BisectUiState>()
	: {
		postMessage: (): void => undefined,
		getState: (): BisectUiState | undefined => undefined,
		setState: (): void => undefined,
	};

function shortHash(hash: string): string {
	return hash.length > 8 ? hash.substring(0, 8) : hash;
}

function getStatusLabel(status: CommitStatus): string {
	if (status === 'good') {
		return 'good';
	}

	if (status === 'bad') {
		return 'bad';
	}

	return 'pendiente';
}

function App() {
	const [state, setState] = useState<BisectUiState>(() => vscode.getState() ?? defaultState);

	const currentCommit = useMemo(
		() => state.commits.find(commit => commit.hash === state.currentCommitHash) ?? null,
		[state.commits, state.currentCommitHash]
	);

	const canStart = state.selectedBranch.trim().length > 0 && state.commitsBack > 0 && !state.busy;
	const canMark = state.phase === 'running' && state.currentCommitHash !== null && state.selectedVerdict !== '' && !state.busy;

	useEffect(() => {
		vscode.setState(state);
	}, [state]);

	useEffect(() => {
		const listener = (event: MessageEvent<ExtensionToWebviewMessage>): void => {
			const message = event.data;

			if (message.type === 'init') {
				setState(previous => {
					const selectedBranch = previous.selectedBranch
						|| message.currentBranch
						|| message.branches.find(branch => branch.current)?.name
						|| message.branches[0]?.name
						|| '';

					return {
						...previous,
						branches: message.branches,
						selectedBranch,
						error: null,
					};
				});
				return;
			}

			if (message.type === 'started') {
				setState(previous => ({
					...previous,
					phase: 'running',
					setupCollapsed: true,
					commits: message.commits,
					currentCommitHash: message.currentCommitHash,
					selectedVerdict: '',
					busy: false,
					message: message.message ?? 'Git bisect iniciado. Marca el commit seleccionado.',
					error: null,
					result: null,
				}));
				return;
			}

			if (message.type === 'step') {
				setState(previous => ({
					...previous,
					phase: 'running',
					commits: message.commits,
					currentCommitHash: message.currentCommitHash,
					selectedVerdict: '',
					busy: false,
					message: message.message ?? 'Git bisect selecciono otro commit.',
					error: null,
				}));
				return;
			}

			if (message.type === 'finished') {
				setState(previous => ({
					...previous,
					phase: 'finished',
					commits: message.commits,
					currentCommitHash: null,
					selectedVerdict: '',
					busy: false,
					message: message.message ?? 'Git bisect termino.',
					error: null,
					result: message.result,
				}));
				return;
			}

			if (message.type === 'checkedOut') {
				setState(previous => ({
					...previous,
					currentCommitHash: message.commitHash,
					selectedVerdict: '',
					busy: false,
					message: message.message ?? `Checkout realizado en ${shortHash(message.commitHash)}.`,
					error: null,
				}));
				return;
			}

			if (message.type === 'error') {
				setState(previous => ({
					...previous,
					phase: previous.commits.length > 0 ? previous.phase : 'setup',
					setupCollapsed: previous.commits.length > 0,
					busy: false,
					error: message.message,
				}));
			}
		};

		window.addEventListener('message', listener);
		vscode.postMessage({ type: 'ready' });

		return () => window.removeEventListener('message', listener);
	}, []);

	function updateState(patch: Partial<BisectUiState>): void {
		setState(previous => ({ ...previous, ...patch }));
	}

	function onBranchChange(event: ChangeEvent<HTMLSelectElement>): void {
		updateState({ selectedBranch: event.target.value });
	}

	function onCommitsBackChange(event: ChangeEvent<HTMLInputElement>): void {
		const parsedValue = Number(event.target.value);
		const commitsBack = Number.isFinite(parsedValue) ? Math.max(1, parsedValue) : 10;
		updateState({ commitsBack });
	}

	function onVerdictChange(event: ChangeEvent<HTMLInputElement>): void {
		updateState({ selectedVerdict: event.target.value as Verdict });
	}

	function onStart(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();

		if (!canStart) {
			return;
		}

		updateState({
			phase: 'starting',
			setupCollapsed: true,
			busy: true,
			message: 'Iniciando git bisect...',
			error: null,
			result: null,
			commits: [],
			currentCommitHash: null,
		});

		vscode.postMessage({
			type: 'start',
			branch: state.selectedBranch,
			commitsBack: state.commitsBack,
		});
	}

	function onMarkCommit(): void {
		if (!canMark || state.currentCommitHash === null) {
			return;
		}

		const commitHash = state.currentCommitHash;
		const verdict = state.selectedVerdict;

		setState(previous => ({
			...previous,
			commits: previous.commits.map(commit => commit.hash === commitHash ? { ...commit, status: verdict } : commit),
			busy: true,
			message: `Marcando ${shortHash(commitHash)} como ${verdict}...`,
			error: null,
		}));

		vscode.postMessage({ type: 'mark', commitHash, verdict });
	}

	function onReset(): void {
		setState(previous => ({
			...defaultState,
			branches: previous.branches,
			selectedBranch: previous.selectedBranch,
		}));
		vscode.postMessage({ type: 'reset' });
	}

	function onTimelineCommitClick(commitHash: string): void {
		if (state.phase !== 'finished' || state.busy) {
			return;
		}

		setState(previous => ({
			...previous,
			currentCommitHash: commitHash,
			busy: true,
			message: `Haciendo checkout de ${shortHash(commitHash)}...`,
			error: null,
		}));

		vscode.postMessage({
			type: 'checkoutCommit',
			commitHash,
		});
	}

	return (
		<main className='bisect-container'>
			<header className='bisect-header'>
				<div>
					<h1 className='bisect-title'>Git Bisect</h1>
					<p className='bisect-subtitle'>Selecciona un commit reciente malo y un commit anterior bueno para iniciar la busqueda.</p>
				</div>

				<button className='secondary-button' type='button' onClick={onReset}>
					Reiniciar
				</button>
			</header>

			<section className={state.setupCollapsed ? 'card card-collapsed' : 'card'}>
				<div className='card-header'>
					<div>
						<h2>Configuracion inicial</h2>
						<p>La rama seleccionada sera el extremo rojo. El numero indica cuantos commits hacia atras se usara como extremo verde.</p>
					</div>
					{state.setupCollapsed && <span className='summary-pill'>{state.selectedBranch} · {state.commitsBack} commits</span>}
				</div>

				{!state.setupCollapsed && (
					<form className='setup-form' onSubmit={onStart}>
						<label className='field'>
							<span>Rama roja</span>
							<select value={state.selectedBranch} onChange={onBranchChange} disabled={state.busy}>
								<option value='' disabled>{state.branches.length === 0 ? 'Cargando ramas...' : 'Seleccionar rama'}</option>
								{state.branches.map(branch => (
									<option key={branch.name} value={branch.name}>{branch.current ? `${branch.name} (actual)` : branch.name}</option>
								))}
							</select>
						</label>

						<label className='field small-field'>
							<span>Commit verde hacia atras</span>
							<input min={1} type='number' value={state.commitsBack} onChange={onCommitsBackChange} disabled={state.busy} />
						</label>

						<button className='primary-button' type='submit' disabled={!canStart}>Iniciar bisect</button>
					</form>
				)}
			</section>

			<section className={state.phase === 'setup' ? 'card disabled-card' : 'card'}>
				<div className='card-header'>
					<div>
						<h2>Linea de commits</h2>
						<p>Verde significa good, rojo significa bad y gris significa pendiente.</p>
					</div>
					{state.currentCommitHash && <span className='current-pill'>Commit actual: {shortHash(state.currentCommitHash)}</span>}
				</div>

				{state.commits.length === 0 && (
					<div className='empty-state'>{state.phase === 'setup' ? 'Inicia el bisect para ver la linea de commits.' : 'Esperando commits del backend...'}</div>
				)}

				{state.commits.length > 0 && (
					<div className='timeline-wrapper'>
						<ol className='timeline'>
							{state.commits.map((commit, index) => (
								<li className='timeline-item' key={commit.hash}>
									<button
										className={`commit-dot status-${commit.status}${commit.hash === state.currentCommitHash ? ' current' : ''}${state.phase === 'finished' ? ' clickable' : ''}`}
										title={`${shortHash(commit.hash)} · ${commit.subject}`}
										type='button'
										onClick={() => onTimelineCommitClick(commit.hash)}
										disabled={state.phase !== 'finished' || state.busy}
									>
										<span>{index + 1}</span>
									</button>

									<div className='commit-card'>
										<strong>{shortHash(commit.hash)}</strong>
										<span>{commit.subject}</span>
										<small>{getStatusLabel(commit.status)}{commit.authorDate ? ` · ${commit.authorDate}` : ''}</small>
									</div>
								</li>
							))}
						</ol>
					</div>
				)}
			</section>

			{state.phase === 'running' && currentCommit && (
				<section className='card action-card'>
					<h2>Clasificar commit seleccionado</h2>
					<p>El repositorio ya deberia estar parado en <strong>{shortHash(currentCommit.hash)}</strong>. Proba manualmente ese estado y marca el resultado.</p>

					<div className='verdict-options'>
						<label>
							<input type='radio' name='verdict' value='good' checked={state.selectedVerdict === 'good'} onChange={onVerdictChange} disabled={state.busy} />
							<span>Good / verde</span>
						</label>
						<label>
							<input type='radio' name='verdict' value='bad' checked={state.selectedVerdict === 'bad'} onChange={onVerdictChange} disabled={state.busy} />
							<span>Bad / rojo</span>
						</label>
					</div>

					<button className='primary-button' type='button' onClick={onMarkCommit} disabled={!canMark}>Confirmar resultado</button>
				</section>
			)}

			{state.result && (
				<section className='card result-card'>
					<h2>Resultado</h2>
					<p>Primer commit malo encontrado: <strong>{shortHash(state.result.hash)}</strong>{state.result.subject ? ` · ${state.result.subject}` : ''}</p>
					{state.result.rawOutput && <pre>{state.result.rawOutput}</pre>}
				</section>
			)}

			{state.message && <p className='status-message'>{state.message}</p>}
			{state.error && <p className='error-message'>{state.error}</p>}
		</main>
	);
}

export default App;
