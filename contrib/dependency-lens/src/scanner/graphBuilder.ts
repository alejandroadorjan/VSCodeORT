/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Construcción del grafo de dependencias a partir de un conjunto de archivos.
 *
 * Responsabilidad: leer cada archivo, extraer sus imports relativos (importParser)
 * y resolver cada specifier a un `ModuleId` real del grafo. La resolución replica
 * la de TypeScript/Node para imports relativos: se prueban las extensiones y el
 * `index` de un directorio, en el mismo orden que usa el compilador.
 *
 * La resolución es puramente sintáctica sobre paths (no toca el disco más allá de
 * lo que provee el `FileSystem` inyectado), lo que hace la clase testeable con un
 * filesystem en memoria.
 */
import { analyzeCycles } from '../graph/tarjan';
import type { DependencyEdge, GraphAnalysis, ModuleId, ModuleNode } from '../graph/types';
import { parseImports } from './importParser';

/** Abstracción mínima del filesystem para poder testear con mocks. */
export interface FileSystem {
	/** Lista de paths absolutos de todos los archivos candidatos del análisis. */
	listFiles(): Promise<string[]>;
	/** Lee el contenido de un archivo. */
	readFile(absPath: string): Promise<string>;
	/** ¿Existe este path exacto como archivo? */
	fileExists(absPath: string): Promise<boolean>;
}

/** Extensiones que TypeScript prueba al resolver un import sin extensión, en orden. */
const RESOLUTION_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mts', '.mjs'];

/**
 * Reescritura de extensión de ESM/TypeScript: en el modo ESM moderno (el que usa
 * el core de VS Code) los imports apuntan al `.js` de salida (`'./foo.js'`) pero
 * el archivo en disco es el `.ts` fuente (`foo.ts`). TypeScript resuelve esto
 * mapeando la extensión de salida a la de fuente. Cada entrada es `[salida, [fuentes...]]`.
 */
const OUTPUT_TO_SOURCE_EXT: ReadonlyArray<readonly [string, readonly string[]]> = [
	['.js', ['.ts', '.tsx', '.d.ts']],
	['.jsx', ['.tsx']],
	['.mjs', ['.mts']],
	['.cjs', ['.cts']],
];

/** Une dos segmentos de path POSIX y normaliza `.`/`..`. */
export function joinAndNormalize(base: string, relative: string): string {
	const baseDir = base.slice(0, base.lastIndexOf('/'));
	const combined = `${baseDir}/${relative}`;
	const parts = combined.split('/');
	const stack: string[] = [];
	for (const part of parts) {
		if (part === '' || part === '.') {
			continue;
		}
		if (part === '..') {
			stack.pop();
		} else {
			stack.push(part);
		}
	}
	return '/' + stack.join('/');
}

export class GraphBuilder {
	constructor(
		private readonly fs: FileSystem,
		/** Raíz del análisis; los ids del grafo son paths relativos a ella. */
		private readonly root: string
	) {}

	/** Convierte un path absoluto en el id del grafo (relativo a la raíz, con `/`). */
	private toId(absPath: string): ModuleId {
		const rel = absPath.startsWith(this.root) ? absPath.slice(this.root.length) : absPath;
		return rel.replace(/^\/+/, '');
	}

	/**
	 * Resuelve un specifier relativo (desde `fromAbs`) a un path absoluto real,
	 * probando extensiones e `index`, igual que el resolver de TypeScript.
	 * Devuelve `undefined` si no resuelve a ningún archivo conocido.
	 */
	async resolve(fromAbs: string, specifier: string): Promise<string | undefined> {
		const target = joinAndNormalize(fromAbs, specifier);

		// 1. Reescritura de extensión ESM: `'./foo.js'` → `foo.ts` (el caso de src/vs).
		//    Se prueba ANTES del path exacto porque el `.js` casi nunca existe en disco
		//    en un proyecto TypeScript; el archivo real es el `.ts` fuente.
		for (const [outExt, sourceExts] of OUTPUT_TO_SOURCE_EXT) {
			if (target.endsWith(outExt)) {
				const base = target.slice(0, -outExt.length);
				for (const srcExt of sourceExts) {
					const candidate = base + srcExt;
					if (await this.fs.fileExists(candidate)) {
						return candidate;
					}
				}
			}
		}
		// 2. Path exacto (el specifier ya apuntaba a un archivo real con extensión).
		if (await this.fs.fileExists(target)) {
			return target;
		}
		// 3. Path + cada extensión candidata (specifier sin extensión).
		for (const ext of RESOLUTION_EXTENSIONS) {
			const candidate = target + ext;
			if (await this.fs.fileExists(candidate)) {
				return candidate;
			}
		}
		// 4. Directorio: target/index.<ext>.
		for (const ext of RESOLUTION_EXTENSIONS) {
			const candidate = `${target}/index${ext}`;
			if (await this.fs.fileExists(candidate)) {
				return candidate;
			}
		}
		return undefined;
	}

	/**
	 * Construye el grafo completo y corre el análisis de ciclos.
	 * @param onProgress callback opcional (archivos procesados, total) para la UI.
	 */
	async build(onProgress?: (done: number, total: number) => void): Promise<GraphAnalysis> {
		const files = await this.fs.listFiles();
		const nodes = new Map<ModuleId, ModuleNode>();

		// Pre-creamos todos los nodos para poder ignorar aristas hacia archivos
		// que no forman parte del conjunto escaneado.
		for (const absPath of files) {
			const id = this.toId(absPath);
			nodes.set(id, { id, absPath, edges: [] });
		}

		let done = 0;
		for (const absPath of files) {
			const id = this.toId(absPath);
			const node = nodes.get(id)!;
			const source = await this.fs.readFile(absPath);

			for (const imp of parseImports(source)) {
				const resolvedAbs = await this.resolve(absPath, imp.specifier);
				if (!resolvedAbs) {
					continue; // no resuelve a un archivo (o es externo): no es arista del grafo
				}
				const targetId = this.toId(resolvedAbs);
				if (!nodes.has(targetId) || targetId === id) {
					// Fuera del conjunto escaneado, o self-import trivial que igual
					// registramos abajo solo si apunta a un nodo del grafo.
					if (targetId !== id) {
						continue;
					}
				}
				const edge: DependencyEdge = {
					from: id,
					to: targetId,
					line: imp.line,
					specifier: imp.specifier,
				};
				node.edges.push(edge);
			}

			done++;
			onProgress?.(done, files.length);
		}

		let edgeCount = 0;
		for (const node of nodes.values()) {
			edgeCount += node.edges.length;
		}

		return { nodes, cycles: analyzeCycles(nodes), edgeCount };
	}
}
