/**
 * Subconjunto de las typings de la Git Extension API de VS Code
 * (extensión `vscode.git`). La API completa NO está en `@types/vscode`;
 * el archivo oficial es `extensions/git/src/api/git.d.ts` en el repo de vscode.
 *
 * Acá declaramos solo lo que usa la Capa 1. Si necesitás más, copiá las
 * definiciones del archivo oficial en vez de improvisar.
 */
import { Uri, Event } from 'vscode';

export interface Git {
	readonly path: string;
}

export interface Change {
	readonly uri: Uri;
	readonly originalUri: Uri;
	readonly renameUri: Uri | undefined;
	/** Numérico; mapea al enum `Status` (ver status.ts para los valores en runtime). */
	readonly status: number;
}

export const enum RefType {
	Head,
	RemoteHead,
	Tag
}

export interface Ref {
	readonly type: RefType;
	readonly name?: string;
	readonly commit?: string;
	readonly remote?: string;
}

export interface Commit {
	readonly hash: string;
	readonly message: string;
	readonly parents: string[];
}

export interface RepositoryState {
	readonly HEAD: Ref | undefined;
	readonly workingTreeChanges: Change[];
	readonly indexChanges: Change[];
	readonly untrackedChanges: Change[];
	readonly onDidChange: Event<void>;
}

export interface Repository {
	readonly rootUri: Uri;
	readonly state: RepositoryState;

	/** Diff de todo el working tree contra HEAD. */
	diffWithHEAD(): Promise<string>;
	/** Diff de un path puntual contra HEAD. */
	diffWithHEAD(path: string): Promise<string>;

	getCommit(ref: string): Promise<Commit>;
}

export interface API {
	readonly state: 'uninitialized' | 'initialized';
	readonly repositories: Repository[];
	readonly onDidOpenRepository: Event<Repository>;
	getRepository(uri: Uri): Repository | null;
}

export interface GitExtension {
	readonly enabled: boolean;
	readonly onDidChangeEnablement: Event<boolean>;
	getAPI(version: 1): API;
}
