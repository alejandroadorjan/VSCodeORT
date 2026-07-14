/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Tests del constructor de grafo y la resolución de imports, con un filesystem
 * en memoria (sin tocar el disco). Validan que el grafo resultante refleje los
 * imports reales y que la resolución replique la de TypeScript.
 */
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { GraphBuilder, joinAndNormalize, type FileSystem } from '../scanner/graphBuilder';

/** Filesystem en memoria: recibe un mapa `{ '/abs/path.ts': 'contenido' }`. */
class MemoryFileSystem implements FileSystem {
	constructor(private readonly files: Record<string, string>) {}
	async listFiles(): Promise<string[]> {
		return Object.keys(this.files).sort();
	}
	async readFile(absPath: string): Promise<string> {
		return this.files[absPath] ?? '';
	}
	async fileExists(absPath: string): Promise<boolean> {
		return Object.hasOwn(this.files, absPath);
	}
}

describe('joinAndNormalize', () => {
	it('resuelve ../ y ./ correctamente', () => {
		assert.strictEqual(joinAndNormalize('/root/a/b.ts', './c'), '/root/a/c');
		assert.strictEqual(joinAndNormalize('/root/a/b.ts', '../d'), '/root/d');
		assert.strictEqual(joinAndNormalize('/root/a/b.ts', '../../e'), '/e');
	});
});

describe('GraphBuilder', () => {
	it('construye aristas para imports relativos resueltos', async () => {
		const fs = new MemoryFileSystem({
			'/root/a.ts': `import { b } from './b';`,
			'/root/b.ts': `export const b = 1;`,
		});
		const analysis = await new GraphBuilder(fs, '/root').build();
		assert.strictEqual(analysis.nodes.size, 2);
		assert.strictEqual(analysis.edgeCount, 1);
		assert.deepStrictEqual(analysis.nodes.get('a.ts')!.edges[0].to, 'b.ts');
	});

	it('resuelve imports de directorio vía index.ts', async () => {
		const fs = new MemoryFileSystem({
			'/root/a.ts': `import { x } from './lib';`,
			'/root/lib/index.ts': `export const x = 1;`,
		});
		const analysis = await new GraphBuilder(fs, '/root').build();
		assert.strictEqual(analysis.nodes.get('a.ts')!.edges[0].to, 'lib/index.ts');
	});

	it('ignora imports externos (no relativos)', async () => {
		const fs = new MemoryFileSystem({
			'/root/a.ts': `import * as vscode from 'vscode';\nimport { b } from './b';`,
			'/root/b.ts': ``,
		});
		const analysis = await new GraphBuilder(fs, '/root').build();
		assert.strictEqual(analysis.edgeCount, 1); // solo ./b, no 'vscode'
	});

	it('detecta un ciclo real construido desde archivos', async () => {
		const fs = new MemoryFileSystem({
			'/root/a.ts': `import { b } from './b';`,
			'/root/b.ts': `import { a } from './a';`,
		});
		const analysis = await new GraphBuilder(fs, '/root').build();
		assert.strictEqual(analysis.cycles.length, 1);
		assert.deepStrictEqual([...analysis.cycles[0].modules].sort(), ['a.ts', 'b.ts']);
	});

	it('resuelve specifiers ESM .js al archivo fuente .ts (el caso de src/vs)', async () => {
		const fs = new MemoryFileSystem({
			'/root/a.ts': `import { b } from './b.js';`,
			'/root/b.ts': `export const b = 1;`,
		});
		const analysis = await new GraphBuilder(fs, '/root').build();
		assert.strictEqual(analysis.edgeCount, 1);
		assert.strictEqual(analysis.nodes.get('a.ts')!.edges[0].to, 'b.ts');
	});

	it('captura re-exports (export ... from) como dependencias', async () => {
		const fs = new MemoryFileSystem({
			'/root/a.ts': `export { thing } from './b';`,
			'/root/b.ts': `export const thing = 1;`,
		});
		const analysis = await new GraphBuilder(fs, '/root').build();
		assert.strictEqual(analysis.edgeCount, 1);
	});

	it('reporta progreso por cada archivo procesado', async () => {
		const fs = new MemoryFileSystem({ '/root/a.ts': ``, '/root/b.ts': `` });
		const seen: number[] = [];
		await new GraphBuilder(fs, '/root').build((done) => seen.push(done));
		assert.deepStrictEqual(seen, [1, 2]);
	});
});
