/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Tipos del grafo de dependencias.
 *
 * El grafo es dirigido: un nodo es un módulo (archivo) y una arista `A → B`
 * significa "A importa a B". Sobre esta estructura corre la detección de ciclos
 * (Tarjan) y las métricas topológicas.
 */

/** Identificador estable de un módulo dentro del grafo (path relativo a la raíz escaneada). */
export type ModuleId = string;

/** Una arista dirigida del grafo: `from` importa a `to`. Guarda la línea para navegar al import. */
export interface DependencyEdge {
	from: ModuleId;
	to: ModuleId;
	/** Línea (0-based) del `import` en el archivo `from`, para saltar al origen del ciclo. */
	line: number;
	/** Texto del specifier tal como aparece en el código (ej. `'../foo/bar'`). */
	specifier: string;
}

/** Un módulo (nodo) del grafo con sus dependencias salientes. */
export interface ModuleNode {
	id: ModuleId;
	/** Path absoluto en disco (para abrir el archivo en el editor). */
	absPath: string;
	/** Aristas salientes (imports de este módulo hacia otros del grafo). */
	edges: DependencyEdge[];
}

/**
 * Un ciclo detectado: la secuencia de módulos que se importan en círculo,
 * más las aristas concretas que lo forman (para navegación).
 *
 * `modules` está normalizado (empieza siempre por el id lexicográficamente menor)
 * para que dos detecciones del mismo ciclo sean iguales y deduplicables.
 */
export interface DependencyCycle {
	/** Módulos del ciclo en orden de recorrido, normalizado. Longitud >= 2 (o 1 si es self-import). */
	modules: ModuleId[];
	/** Aristas que cierran el ciclo, en el mismo orden que `modules`. */
	edges: DependencyEdge[];
	/** Longitud del ciclo (cantidad de módulos involucrados). */
	length: number;
}

/** Resultado completo de un análisis del grafo. */
export interface GraphAnalysis {
	/** Todos los nodos indexados por id. */
	nodes: Map<ModuleId, ModuleNode>;
	/** Ciclos detectados, ordenados de más corto a más largo (los cortos son los más graves). */
	cycles: DependencyCycle[];
	/** Cantidad total de aristas (imports resueltos dentro del grafo). */
	edgeCount: number;
}
