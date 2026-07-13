/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Detección de dependencias circulares mediante el algoritmo de Tarjan para
 * Componentes Fuertemente Conexas (SCC).
 *
 * Fundamento: en un grafo dirigido, un ciclo existe si y solo si dos o más nodos
 * pertenecen a la misma componente fuertemente conexa (o un nodo tiene una arista
 * a sí mismo). Tarjan encuentra todas las SCC en una sola pasada O(V + E), que es
 * óptimo: no se puede detectar ciclos mirando menos que todos los nodos y aristas.
 *
 * La implementación es ITERATIVA (con una pila explícita) en vez de recursiva,
 * porque el grafo de `src/vs` tiene miles de módulos y una DFS recursiva
 * desbordaría el call stack de Node en cadenas de import profundas.
 *
 * Referencia: Tarjan, R. E. (1972). "Depth-first search and linear graph algorithms".
 * SIAM Journal on Computing.
 */
import type { DependencyCycle, DependencyEdge, GraphAnalysis, ModuleId, ModuleNode } from './types';

/** Estado por nodo durante el recorrido de Tarjan. */
interface TarjanNodeState {
	/** Orden de descubrimiento (índice DFS). -1 = no visitado. */
	index: number;
	/** El menor índice alcanzable desde este nodo (el "low-link"). */
	lowlink: number;
	/** ¿Está actualmente en la pila de SCC? */
	onStack: boolean;
}

/**
 * Encuentra todas las componentes fuertemente conexas con más de un nodo
 * (o con un self-loop), que son exactamente los ciclos del grafo.
 *
 * @param nodes grafo indexado por id.
 * @returns las SCC no triviales, cada una como un array de ids.
 */
export function findStronglyConnectedComponents(nodes: Map<ModuleId, ModuleNode>): ModuleId[][] {
	const state = new Map<ModuleId, TarjanNodeState>();
	for (const id of nodes.keys()) {
		state.set(id, { index: -1, lowlink: -1, onStack: false });
	}

	let nextIndex = 0;
	const sccStack: ModuleId[] = [];
	const components: ModuleId[][] = [];

	// Marco de trabajo para simular la recursión de Tarjan con una pila explícita.
	interface Frame {
		node: ModuleId;
		/** Índice de la próxima arista saliente a procesar. */
		edgeIndex: number;
	}

	for (const rootId of nodes.keys()) {
		if (state.get(rootId)!.index !== -1) {
			continue; // ya visitado en un árbol DFS anterior
		}

		const callStack: Frame[] = [{ node: rootId, edgeIndex: 0 }];

		while (callStack.length > 0) {
			const frame = callStack[callStack.length - 1];
			const nodeState = state.get(frame.node)!;

			// Primera vez que entramos a este nodo: lo numeramos y lo apilamos.
			if (frame.edgeIndex === 0) {
				nodeState.index = nextIndex;
				nodeState.lowlink = nextIndex;
				nextIndex++;
				sccStack.push(frame.node);
				nodeState.onStack = true;
			}

			const edges = nodes.get(frame.node)!.edges;

			// ¿Quedan aristas por explorar desde este nodo?
			if (frame.edgeIndex < edges.length) {
				const target = edges[frame.edgeIndex].to;
				frame.edgeIndex++;

				const targetState = state.get(target);
				if (!targetState) {
					continue; // arista hacia un nodo fuera del grafo escaneado: se ignora
				}

				if (targetState.index === -1) {
					// Sucesor no visitado: "descendemos" apilando un nuevo frame.
					callStack.push({ node: target, edgeIndex: 0 });
				} else if (targetState.onStack) {
					// Sucesor en la pila actual: forma parte de la SCC en construcción.
					nodeState.lowlink = Math.min(nodeState.lowlink, targetState.index);
				}
				continue;
			}

			// Terminamos todas las aristas de este nodo: es momento de "volver".
			callStack.pop();

			// Propagamos el low-link al padre (equivalente al retorno de la recursión).
			if (callStack.length > 0) {
				const parentState = state.get(callStack[callStack.length - 1].node)!;
				parentState.lowlink = Math.min(parentState.lowlink, nodeState.lowlink);
			}

			// Si este nodo es la raíz de una SCC, la desapilamos entera.
			if (nodeState.lowlink === nodeState.index) {
				const component: ModuleId[] = [];
				let popped: ModuleId;
				do {
					popped = sccStack.pop()!;
					state.get(popped)!.onStack = false;
					component.push(popped);
				} while (popped !== frame.node);

				// Solo nos interesan las SCC que son ciclos reales:
				// más de un nodo, o un único nodo con arista a sí mismo (self-import).
				if (component.length > 1 || hasSelfLoop(nodes.get(frame.node)!)) {
					components.push(component);
				}
			}
		}
	}

	return components;
}

/** ¿Este nodo tiene una arista hacia sí mismo (self-import)? */
function hasSelfLoop(node: ModuleNode): boolean {
	return node.edges.some((e) => e.to === node.id);
}

/**
 * A partir de una SCC (conjunto de nodos mutuamente alcanzables), reconstruye
 * un ciclo concreto y navegable: una secuencia `A → B → ... → A` con las aristas
 * reales que lo forman.
 *
 * Una SCC puede contener muchos ciclos entrelazados; para el usuario reportamos
 * uno representativo (el más corto encontrado por BFS dentro de la componente),
 * que es el más accionable para romper la circularidad.
 */
export function extractRepresentativeCycle(
	component: ModuleId[],
	nodes: Map<ModuleId, ModuleNode>
): DependencyCycle | undefined {
	const inScc = new Set(component);

	// Self-loop: A → A.
	if (component.length === 1) {
		const only = component[0];
		const selfEdge = nodes.get(only)!.edges.find((e) => e.to === only);
		if (!selfEdge) {
			return undefined;
		}
		return { modules: [only], edges: [selfEdge], length: 1 };
	}

	// Buscamos el ciclo más corto dentro de la SCC con BFS desde el nodo "menor"
	// (así el resultado es determinista y deduplicable).
	const start = [...component].sort()[0];
	const shortest = shortestCycleFrom(start, inScc, nodes);
	if (!shortest) {
		return undefined;
	}
	return normalizeCycle(shortest, nodes);
}

/** BFS que encuentra el ciclo más corto que vuelve a `start`, restringido a la SCC. */
function shortestCycleFrom(
	start: ModuleId,
	inScc: Set<ModuleId>,
	nodes: Map<ModuleId, ModuleNode>
): ModuleId[] | undefined {
	const prev = new Map<ModuleId, ModuleId>();
	const queue: ModuleId[] = [start];
	const visited = new Set<ModuleId>([start]);

	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const edge of nodes.get(current)!.edges) {
			const next = edge.to;
			if (!inScc.has(next)) {
				continue;
			}
			if (next === start) {
				// Cerramos el ciclo: reconstruimos el camino start → ... → current → start.
				const path = [current];
				let cursor = current;
				while (cursor !== start) {
					cursor = prev.get(cursor)!;
					path.push(cursor);
				}
				path.reverse();
				return path;
			}
			if (!visited.has(next)) {
				visited.add(next);
				prev.set(next, current);
				queue.push(next);
			}
		}
	}
	return undefined;
}

/**
 * Normaliza un ciclo para que empiece por el id lexicográficamente menor y
 * adjunta las aristas concretas. Así el mismo ciclo detectado por caminos
 * distintos produce el mismo objeto y se puede deduplicar.
 */
function normalizeCycle(path: ModuleId[], nodes: Map<ModuleId, ModuleNode>): DependencyCycle {
	// Rotamos el array para que arranque en el elemento mínimo.
	let minIdx = 0;
	for (let i = 1; i < path.length; i++) {
		if (path[i] < path[minIdx]) {
			minIdx = i;
		}
	}
	const rotated = [...path.slice(minIdx), ...path.slice(0, minIdx)];

	// Reconstruimos las aristas del ciclo cerrado (último → primero incluido).
	const edges: DependencyEdge[] = [];
	for (let i = 0; i < rotated.length; i++) {
		const from = rotated[i];
		const to = rotated[(i + 1) % rotated.length];
		const edge = nodes.get(from)!.edges.find((e) => e.to === to);
		if (edge) {
			edges.push(edge);
		}
	}

	return { modules: rotated, edges, length: rotated.length };
}

/**
 * Punto de entrada del análisis de ciclos: corre Tarjan y devuelve los ciclos
 * representativos, ordenados de más corto a más largo (los más cortos son los
 * más graves y fáciles de arreglar).
 */
export function analyzeCycles(nodes: Map<ModuleId, ModuleNode>): DependencyCycle[] {
	const components = findStronglyConnectedComponents(nodes);
	const cycles: DependencyCycle[] = [];

	for (const component of components) {
		const cycle = extractRepresentativeCycle(component, nodes);
		if (cycle) {
			cycles.push(cycle);
		}
	}

	cycles.sort((a, b) => a.length - b.length);
	return cycles;
}

/** Ensambla el resultado completo del análisis a partir del grafo de nodos. */
export function buildAnalysis(nodes: Map<ModuleId, ModuleNode>): GraphAnalysis {
	let edgeCount = 0;
	for (const node of nodes.values()) {
		edgeCount += node.edges.length;
	}
	return { nodes, cycles: analyzeCycles(nodes), edgeCount };
}
