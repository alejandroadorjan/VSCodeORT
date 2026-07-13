/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Tests del detector de ciclos (Tarjan SCC).
 *
 * Cubren los casos que importan para la corrección topológica: grafo acíclico,
 * ciclo simple, self-loop, dos ciclos disjuntos, y una cadena profunda (que
 * validaría un desborde de stack si la implementación fuese recursiva).
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { analyzeCycles } from '../graph/tarjan';
import type { DependencyEdge, ModuleId, ModuleNode } from '../graph/types';

/** Helper: construye un grafo a partir de una lista de adyacencia `{ A: ['B','C'] }`. */
function graph(adjacency: Record<string, string[]>): Map<ModuleId, ModuleNode> {
	const nodes = new Map<ModuleId, ModuleNode>();
	for (const id of Object.keys(adjacency)) {
		nodes.set(id, { id, absPath: `/${id}`, edges: [] });
	}
	for (const [from, targets] of Object.entries(adjacency)) {
		const edges: DependencyEdge[] = targets.map((to, i) => ({ from, to, line: i, specifier: `./${to}` }));
		nodes.get(from)!.edges = edges;
	}
	return nodes;
}

/** Representa un ciclo como set de módulos, para comparar sin depender del orden. */
function cycleSet(modules: ModuleId[]): string {
	return [...modules].sort().join(',');
}

describe('analyzeCycles', () => {
	it('no reporta ciclos en un grafo acíclico (DAG)', () => {
		const g = graph({ A: ['B', 'C'], B: ['D'], C: ['D'], D: [] });
		assert.strictEqual(analyzeCycles(g).length, 0);
	});

	it('detecta un ciclo simple A → B → A', () => {
		const g = graph({ A: ['B'], B: ['A'] });
		const cycles = analyzeCycles(g);
		assert.strictEqual(cycles.length, 1);
		assert.strictEqual(cycleSet(cycles[0].modules), 'A,B');
		assert.strictEqual(cycles[0].length, 2);
	});

	it('detecta un self-loop A → A', () => {
		const g = graph({ A: ['A'] });
		const cycles = analyzeCycles(g);
		assert.strictEqual(cycles.length, 1);
		assert.deepStrictEqual(cycles[0].modules, ['A']);
		assert.strictEqual(cycles[0].length, 1);
	});

	it('detecta un ciclo de tres A → B → C → A', () => {
		const g = graph({ A: ['B'], B: ['C'], C: ['A'] });
		const cycles = analyzeCycles(g);
		assert.strictEqual(cycles.length, 1);
		assert.strictEqual(cycleSet(cycles[0].modules), 'A,B,C');
	});

	it('detecta dos ciclos disjuntos', () => {
		const g = graph({ A: ['B'], B: ['A'], X: ['Y'], Y: ['X'], A2: ['X'] });
		const cycles = analyzeCycles(g);
		assert.strictEqual(cycles.length, 2);
		const sets = cycles.map((c) => cycleSet(c.modules)).sort();
		assert.deepStrictEqual(sets, ['A,B', 'X,Y']);
	});

	it('ordena los ciclos de más corto a más largo', () => {
		const g = graph({
			A: ['B'], B: ['C'], C: ['A'], // ciclo de 3
			X: ['Y'], Y: ['X'],           // ciclo de 2
		});
		const cycles = analyzeCycles(g);
		assert.strictEqual(cycles[0].length, 2);
		assert.strictEqual(cycles[1].length, 3);
	});

	it('no reporta un mismo ciclo dos veces desde caminos distintos', () => {
		// A y B se importan mutuamente y ambos importan a C (que no cierra ciclo).
		const g = graph({ A: ['B', 'C'], B: ['A', 'C'], C: [] });
		const cycles = analyzeCycles(g);
		assert.strictEqual(cycles.length, 1);
		assert.strictEqual(cycleSet(cycles[0].modules), 'A,B');
	});

	it('maneja una cadena profunda sin desbordar el stack (implementación iterativa)', () => {
		// 20.000 nodos en cadena lineal + una arista que cierra el ciclo al inicio.
		const adjacency: Record<string, string[]> = {};
		const N = 20000;
		for (let i = 0; i < N; i++) {
			adjacency[`n${i}`] = i < N - 1 ? [`n${i + 1}`] : ['n0'];
		}
		const g = graph(adjacency);
		const cycles = analyzeCycles(g);
		// Toda la cadena es una única SCC gigante.
		assert.strictEqual(cycles.length, 1);
		assert.strictEqual(cycles[0].length, N);
	});

	it('ignora aristas hacia nodos fuera del grafo escaneado', () => {
		const g = graph({ A: ['B'], B: [] });
		// Agregamos una arista de A hacia un módulo externo inexistente.
		g.get('A')!.edges.push({ from: 'A', to: 'external', line: 9, specifier: 'vscode' });
		const cycles = analyzeCycles(g);
		assert.strictEqual(cycles.length, 0);
	});
});
