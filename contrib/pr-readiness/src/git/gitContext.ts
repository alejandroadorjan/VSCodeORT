/**
 * Capa 1 — Lectura del contexto del repositorio vía Git Extension API.
 *
 * Produce un `RepoContext` (rama, archivos modificados, diff, feature areas,
 * señales locales) sin pedirle al usuario que corra comandos de git.
 */
import * as vscode from 'vscode';
import type { API, Change, GitExtension, Repository } from './git';
import { Status } from './status';
import { inferFeatureAreas, isTestPath } from '../featureAreas';
import type { FileChange, FileStatus, RepoContext } from '../types';

/** Diff acotado para no inflar el prompt de la IA (caracteres). */
const MAX_DIFF_CHARS = 60_000;

/** Obtiene la API de la extensión `vscode.git`, activándola si hace falta. */
export async function getGitApi(): Promise<API | undefined> {
	const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
	if (!ext) {
		return undefined;
	}
	const exports = ext.isActive ? ext.exports : await ext.activate();
	if (!exports.enabled) {
		return undefined;
	}
	return exports.getAPI(1);
}

/**
 * Elige el repositorio relevante: el del archivo activo si existe, si no el primero.
 */
export function pickRepository(api: API): Repository | undefined {
	const activeUri = vscode.window.activeTextEditor?.document.uri;
	if (activeUri) {
		const repo = api.getRepository(activeUri);
		if (repo) {
			return repo;
		}
	}
	return api.repositories[0];
}

/** Mapea el `Status` del git API a nuestro `FileStatus` simplificado. */
function mapStatus(status: number): FileStatus {
	switch (status) {
		case Status.INDEX_ADDED:
		case Status.INTENT_TO_ADD:
		case Status.UNTRACKED:
			return 'A';
		case Status.INDEX_DELETED:
		case Status.DELETED:
		case Status.DELETED_BY_US:
		case Status.DELETED_BY_THEM:
			return 'D';
		case Status.INDEX_RENAMED:
			return 'R';
		case Status.MODIFIED:
		case Status.INDEX_MODIFIED:
		case Status.TYPE_CHANGED:
			return 'M';
		default:
			return 'U';
	}
}

/** Ruta relativa a la raíz del repo, con `/` como separador. */
function relPath(repo: Repository, change: Change): string {
	const root = repo.rootUri.fsPath.replace(/\\/g, '/');
	const file = (change.renameUri ?? change.uri).fsPath.replace(/\\/g, '/');
	const rel = file.startsWith(root) ? file.slice(root.length).replace(/^\//, '') : file;
	return rel;
}

/**
 * Une working tree + staged + untracked en una sola lista deduplicada por path.
 * (No tenemos additions/deletions por archivo desde esta API sin parsear el diff;
 * los dejamos en 0 — Tommy puede refinar parseando el diff si lo necesita.)
 */
function collectFileChanges(repo: Repository): FileChange[] {
	const byPath = new Map<string, FileChange>();
	const all: Change[] = [
		...repo.state.indexChanges,
		...repo.state.workingTreeChanges,
		...repo.state.untrackedChanges
	];
	for (const change of all) {
		const path = relPath(repo, change);
		if (!byPath.has(path)) {
			byPath.set(path, {
				path,
				additions: 0,
				deletions: 0,
				status: mapStatus(change.status)
			});
		}
	}
	return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Cuenta additions/deletions por archivo parseando el diff unificado.
 * Mejora las cifras que `collectFileChanges` deja en 0.
 */
function annotateLineCounts(files: FileChange[], diff: string): void {
	const byPath = new Map(files.map((f) => [f.path, f]));
	let current: FileChange | undefined;
	for (const line of diff.split('\n')) {
		const header = line.match(/^\+\+\+ b\/(.+)$/);
		if (header) {
			current = byPath.get(header[1]);
			continue;
		}
		if (!current) {
			continue;
		}
		if (line.startsWith('+') && !line.startsWith('+++')) {
			current.additions++;
		} else if (line.startsWith('-') && !line.startsWith('---')) {
			current.deletions++;
		}
	}
}

/** Parsea el primer número de issue de 3+ dígitos de la rama (ej. `fix/123456-...`). */
function parseReferencedIssue(branch: string | undefined): number | undefined {
	if (!branch) {
		return undefined;
	}
	const match = branch.match(/(\d{3,})/);
	return match ? Number(match[1]) : undefined;
}

/** Lee el `RepoContext` completo del repositorio dado. */
export async function readRepoContext(repo: Repository): Promise<RepoContext> {
	const branch = repo.state.HEAD?.name;
	const modifiedFiles = collectFileChanges(repo);

	let diff = '';
	try {
		diff = await repo.diffWithHEAD();
	} catch {
		// En repos sin commits o estados raros, diffWithHEAD puede fallar; seguimos sin diff.
		diff = '';
	}
	if (diff.length > MAX_DIFF_CHARS) {
		diff = diff.slice(0, MAX_DIFF_CHARS) + '\n... [diff truncado]';
	}
	annotateLineCounts(modifiedFiles, diff);

	const paths = modifiedFiles.map((f) => f.path);
	return {
		branch,
		modifiedFiles,
		diff,
		featureAreas: inferFeatureAreas(paths),
		hasTestChanges: paths.some(isTestPath),
		referencedIssue: parseReferencedIssue(branch)
	};
}
