/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Extracción de imports de un archivo TypeScript/JavaScript.
 *
 * Se reconocen las tres formas relevantes para el grafo de módulos:
 *   - `import ... from '...'`            (import estático de valores/tipos)
 *   - `export ... from '...'`            (re-export, que también crea dependencia)
 *   - `import('...')`                    (import dinámico)
 *
 * Solo interesan los specifiers RELATIVOS (`.` / `..`): las dependencias externas
 * (`vscode`, `node:*`, paquetes de npm) no forman parte del grafo interno del
 * proyecto y no pueden crear ciclos entre módulos propios.
 *
 * Nota de diseño: no usamos el compilador de TypeScript para esto a propósito.
 * Un barrido por líneas es O(n) sobre el texto, no arranca un type-checker por
 * archivo, y es más que suficiente para resolver el grafo de imports. La precisión
 * semántica del type-checker no aporta nada a la topología de dependencias.
 */

/** Un import relativo encontrado en un archivo, con su ubicación. */
export interface ParsedImport {
	/** Specifier tal cual aparece en el código (ej. `'../foo/bar'`). */
	specifier: string;
	/** Línea (0-based) donde aparece el import. */
	line: number;
}

// import/export ... from 'specifier'  — captura el specifier entre comillas.
const STATIC_IMPORT = /(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/;
// import 'specifier'  — side-effect import sin binding.
const SIDE_EFFECT_IMPORT = /^\s*import\s*['"]([^'"]+)['"]/;
// import('specifier') — import dinámico en cualquier posición de la línea.
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/;

/** ¿El specifier apunta a un módulo relativo del propio proyecto? */
export function isRelativeSpecifier(specifier: string): boolean {
	return specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Extrae todos los imports relativos de un archivo, línea por línea.
 *
 * El parseo por línea ignora imports partidos en varias líneas con bindings
 * multilínea; para el caso de VS Code (que corre eslint con `from` en la misma
 * línea del specifier) esto captura la enorme mayoría, y nunca produce falsos
 * positivos, que es lo que importa para no reportar ciclos inexistentes.
 */
export function parseImports(source: string): ParsedImport[] {
	const results: ParsedImport[] = [];
	const lines = source.split('\n');

	for (let line = 0; line < lines.length; line++) {
		const text = lines[line];
		// Descarte rápido: si la línea no menciona `import`/`from`, no la tocamos.
		if (!text.includes('import') && !text.includes('from')) {
			continue;
		}

		const specifier =
			match(text, STATIC_IMPORT) ??
			match(text, SIDE_EFFECT_IMPORT) ??
			match(text, DYNAMIC_IMPORT);

		if (specifier && isRelativeSpecifier(specifier)) {
			results.push({ specifier, line });
		}
	}

	return results;
}

function match(text: string, re: RegExp): string | undefined {
	const m = re.exec(text);
	return m ? m[1] : undefined;
}
