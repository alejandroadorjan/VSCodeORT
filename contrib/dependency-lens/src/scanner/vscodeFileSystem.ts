/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Implementación de `FileSystem` sobre la API de VS Code.
 *
 * Usa `vscode.workspace.findFiles` (que respeta `.gitignore` y los excludes del
 * usuario) para enumerar los TypeScript del workspace, y `workspace.fs` para leer.
 * Mantiene un set de existencia en memoria para que la resolución de imports no
 * golpee el disco una vez enumerados los archivos.
 */
import * as vscode from 'vscode';
import type { FileSystem } from './graphBuilder';

export class VscodeFileSystem implements FileSystem {
	private fileSet: Set<string> | undefined;

	constructor(
		/** Glob de inclusión relativo a la raíz (ej. `src/vs/**\/*.ts`). */
		private readonly includeGlob: string,
		/** Glob de exclusión (tests, node_modules, etc.). */
		private readonly excludeGlob: string
	) {}

	async listFiles(): Promise<string[]> {
		const uris = await vscode.workspace.findFiles(this.includeGlob, this.excludeGlob);
		const paths = uris.map((u) => u.fsPath).sort();
		this.fileSet = new Set(paths);
		return paths;
	}

	async readFile(absPath: string): Promise<string> {
		const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absPath));
		return Buffer.from(bytes).toString('utf8');
	}

	async fileExists(absPath: string): Promise<boolean> {
		// La resolución solo pregunta por archivos que ya fueron enumerados, así que
		// el set en memoria alcanza y evita un `stat` por cada candidato de extensión.
		if (this.fileSet) {
			return this.fileSet.has(absPath);
		}
		try {
			await vscode.workspace.fs.stat(vscode.Uri.file(absPath));
			return true;
		} catch {
			return false;
		}
	}
}
