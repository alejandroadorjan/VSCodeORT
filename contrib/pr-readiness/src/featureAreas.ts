/**
 * Inferencia de "feature areas" a partir de los paths de un cambio.
 *
 * Caso de estudio: microsoft/vscode. Las reglas se derivan de la sección
 * "Source Code Organization" del wiki del proyecto. El motor es extensible:
 * para apuntar a otro repo, se reemplaza `AREA_RULES`.
 */

interface AreaRule {
	/** Prefijo de path (con `/`). El más largo que matchea gana. */
	prefix: string;
	/** Nombre legible del área. */
	area: string;
}

/** Ordenadas de más específica a más general (el match toma el prefijo más largo). */
const AREA_RULES: AreaRule[] = [
	{ prefix: 'src/vs/editor', area: 'editor' },
	{ prefix: 'src/vs/workbench/contrib', area: 'workbench/contrib' },
	{ prefix: 'src/vs/workbench/services', area: 'workbench/services' },
	{ prefix: 'src/vs/workbench/api', area: 'workbench/api' },
	{ prefix: 'src/vs/workbench', area: 'workbench' },
	{ prefix: 'src/vs/platform', area: 'platform' },
	{ prefix: 'src/vs/base', area: 'base' },
	{ prefix: 'src/vs/code', area: 'code' },
	{ prefix: 'src/vs/server', area: 'server' },
	{ prefix: 'extensions/git', area: 'extensions/git' },
	{ prefix: 'extensions/markdown-language-features', area: 'extensions/markdown' },
	{ prefix: 'extensions/typescript-language-features', area: 'extensions/typescript' },
	{ prefix: 'extensions', area: 'extensions' },
	{ prefix: 'build', area: 'build' },
	{ prefix: 'test', area: 'test' },
	{ prefix: 'cli', area: 'cli' }
];

/** Normaliza separadores a `/` (Windows usa `\`). */
function normalize(path: string): string {
	return path.replace(/\\/g, '/');
}

/** Devuelve el área de un único path, o `undefined` si no matchea ninguna regla. */
export function areaForPath(path: string): string | undefined {
	const p = normalize(path);
	let best: AreaRule | undefined;
	for (const rule of AREA_RULES) {
		if (p.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
			best = rule;
		}
	}
	return best?.area;
}

/** Devuelve las feature areas únicas afectadas por un conjunto de paths. */
export function inferFeatureAreas(paths: string[]): string[] {
	const areas = new Set<string>();
	for (const path of paths) {
		const area = areaForPath(path);
		if (area) {
			areas.add(area);
		}
	}
	return [...areas].sort();
}

/** Heurística local: ¿este path es un archivo de test? */
export function isTestPath(path: string): boolean {
	const p = normalize(path).toLowerCase();
	return (
		/\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
		p.includes('/test/') ||
		p.includes('/tests/') ||
		p.endsWith('.test.ts') ||
		p.endsWith('.test.js')
	);
}
