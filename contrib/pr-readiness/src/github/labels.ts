/**
 * Mapeo de feature areas (Capa 1) a labels de GitHub para buscar good-first-issues.
 *
 * Caso de estudio: microsoft/vscode. Las labels de área siguen la convención del
 * wiki de triage (ej. `editor`, `workbench`, `extensions/*`).
 */

/** Wiki de Source Code Organization — onboarding para contribuyentes nuevos. */
export const SOURCE_CODE_ORGANIZATION_URL =
	'https://github.com/microsoft/vscode/wiki/Source-Code-Organization';

/** Repo por defecto para good-first-issues (configurable vía `prReadiness.githubRepo`). */
export const DEFAULT_GITHUB_REPO = 'microsoft/vscode';

/**
 * Labels de GitHub que refuerzan la búsqueda por área.
 * Se prueba la primera que devuelva resultados; si ninguna matchea, cae al repo completo.
 */
const AREA_GITHUB_LABELS: Record<string, string[]> = {
	editor: ['editor'],
	'workbench/contrib': ['workbench'],
	'workbench/services': ['workbench'],
	'workbench/api': ['workbench'],
	workbench: ['workbench'],
	platform: ['platform'],
	base: ['base'],
	code: ['code'],
	server: ['server'],
	'extensions/git': ['extensions'],
	'extensions/markdown': ['extensions'],
	'extensions/typescript': ['extensions'],
	extensions: ['extensions'],
	build: ['build'],
	test: ['testing'],
	cli: ['workbench-cli']
};

/** Labels de good-first-issue en microsoft/vscode (existen variantes con espacio e hyphen). */
export const GOOD_FIRST_ISSUE_LABELS = ['good first issue', 'good-first-issue'];

/** Devuelve labels de área candidatas para una feature area inferida localmente. */
export function githubLabelsForArea(area: string): string[] {
	return AREA_GITHUB_LABELS[area] ?? [area.replace(/\//g, '-')];
}
