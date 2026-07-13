/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Dependency Lens — punto de entrada de la extensión.
 *
 * Analiza el grafo de imports del workspace y detecta dependencias circulares
 * usando el algoritmo de Tarjan (SCC). El resultado se muestra en un panel
 * navegable: cada ciclo lleva al import exacto que hay que romper.
 *
 * Caso de estudio: el core de microsoft/vscode (`src/vs`), donde las dependencias
 * circulares degradan el tiempo de arranque y el tree-shaking del bundle.
 */
import * as vscode from 'vscode';
import { GraphBuilder } from './scanner/graphBuilder';
import { VscodeFileSystem } from './scanner/vscodeFileSystem';
import { DependencyLensTreeProvider } from './ui/treeView';

export function activate(context: vscode.ExtensionContext): void {
	const tree = new DependencyLensTreeProvider();
	const output = vscode.window.createOutputChannel('Dependency Lens');

	context.subscriptions.push(
		output,
		vscode.window.registerTreeDataProvider('dependencyLens.panel', tree),
		vscode.commands.registerCommand('dependencyLens.analyze', () => runAnalysis(tree, output))
	);
}

async function runAnalysis(tree: DependencyLensTreeProvider, output: vscode.OutputChannel): Promise<void> {
	const folder = vscode.workspace.workspaceFolders?.[0];
	if (!folder) {
		vscode.window.showWarningMessage('Dependency Lens: abrí una carpeta primero.');
		return;
	}

	const config = vscode.workspace.getConfiguration('dependencyLens');
	const includeGlob = config.get<string>('include', 'src/vs/**/*.ts');
	const excludeGlob = config.get<string>('exclude', '**/{node_modules,test,*.test.ts,*.d.ts}/**');

	tree.setScanning();

	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Dependency Lens', cancellable: false },
		async (progress) => {
			const root = folder.uri.fsPath;
			const fs = new VscodeFileSystem(includeGlob, excludeGlob);
			const builder = new GraphBuilder(fs, root);

			const started = Date.now();
			let lastPct = -1;

			const analysis = await builder.build((done, total) => {
				const pct = Math.floor((done / total) * 100);
				if (pct !== lastPct) {
					progress.report({ message: `Parseando imports… ${pct}% (${done}/${total})` });
					lastPct = pct;
				}
			});

			const elapsed = Date.now() - started;

			output.appendLine('=== Dependency Lens ===');
			output.appendLine(`Módulos: ${analysis.nodes.size} · Imports: ${analysis.edgeCount}`);
			output.appendLine(`Ciclos detectados: ${analysis.cycles.length}`);
			output.appendLine(`Tiempo de análisis: ${elapsed} ms`);
			for (const [i, cycle] of analysis.cycles.entries()) {
				output.appendLine(`  Ciclo #${i + 1} (${cycle.length}): ${cycle.modules.join(' → ')} → ${cycle.modules[0]}`);
			}

			tree.setResult(analysis);

			const msg =
				analysis.cycles.length === 0
					? `Sin dependencias circulares en ${analysis.nodes.size} módulos.`
					: `${analysis.cycles.length} dependencia(s) circular(es) en ${analysis.nodes.size} módulos.`;
			vscode.window.showInformationMessage(`Dependency Lens: ${msg}`);
		}
	);
}

export function deactivate(): void {
	// Nada que limpiar más allá de las subscriptions.
}
