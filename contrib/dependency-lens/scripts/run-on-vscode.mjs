/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Corre el analizador de ciclos contra el código real de VS Code (`src/vs`),
 * sin el host de la extensión. Sirve como prueba de humo end-to-end y para
 * generar las métricas que se muestran en la defensa.
 *
 * Uso:  node scripts/run-on-vscode.mjs [rutaAScanear]
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { GraphBuilder } from '../out-test/scanner/graphBuilder.js';

const ROOT = resolve(process.argv[2] ?? '../../src/vs');

/** Filesystem real basado en Node fs, con la misma interfaz que usa la extensión. */
class NodeFileSystem {
	#all = null;

	async listFiles() {
		const out = [];
		const walk = async (dir) => {
			for (const entry of await readdir(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) {
					if (entry.name === 'node_modules' || entry.name === 'test') {
						continue;
					}
					await walk(full);
				} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')) {
					out.push(full);
				}
			}
		};
		await walk(ROOT);
		out.sort();
		this.#all = new Set(out);
		return out;
	}
	async readFile(p) { return readFile(p, 'utf8'); }
	async fileExists(p) { return this.#all ? this.#all.has(p) : stat(p).then(() => true).catch(() => false); }
}

const started = Date.now();
const fs = new NodeFileSystem();
const builder = new GraphBuilder(fs, ROOT);
const analysis = await builder.build();
const elapsed = Date.now() - started;

console.log(`\n=== Dependency Lens sobre ${ROOT} ===`);
console.log(`Módulos analizados : ${analysis.nodes.size}`);
console.log(`Imports (aristas)  : ${analysis.edgeCount}`);
console.log(`Ciclos detectados  : ${analysis.cycles.length}`);
console.log(`Tiempo             : ${elapsed} ms`);

for (const [i, c] of analysis.cycles.slice(0, 15).entries()) {
	console.log(`\n  Ciclo #${i + 1} (${c.length} módulos):`);
	console.log('    ' + [...c.modules, c.modules[0]].join('\n      → '));
}
if (analysis.cycles.length > 15) {
	console.log(`\n  … y ${analysis.cycles.length - 15} ciclos más.`);
}
