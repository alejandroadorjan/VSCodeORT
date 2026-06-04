/**
 * Valores en runtime del enum `Status` de la Git Extension API.
 *
 * El orden DEBE coincidir exactamente con el de `git.d.ts` oficial de vscode,
 * porque el git API devuelve estos valores numéricos en `Change.status`.
 * (`git.d.ts` solo declara tipos; esbuild no puede importar valores de un `.d.ts`,
 * por eso el enum vive acá como módulo real.)
 */
export enum Status {
	INDEX_MODIFIED,
	INDEX_ADDED,
	INDEX_DELETED,
	INDEX_RENAMED,
	INDEX_COPIED,
	MODIFIED,
	DELETED,
	UNTRACKED,
	IGNORED,
	INTENT_TO_ADD,
	INTENT_TO_RENAME,
	TYPE_CHANGED,
	ADDED_BY_US,
	ADDED_BY_THEM,
	DELETED_BY_US,
	DELETED_BY_THEM,
	BOTH_ADDED,
	BOTH_DELETED,
	BOTH_MODIFIED
}
