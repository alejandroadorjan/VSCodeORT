/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Capa 1 — Punto de entrada y cableado de las 3 capas (dueño: Antonio).
 *
 * Activa la extensión, registra comandos, construye el `AiClient` y conecta
 * Git (Capa 1) → Engine (Capa 2) → UI (Capa 3). Engine y UI son placeholders
 * hoy; el cableado y los contratos son lo definitivo.
 */
import * as vscode from 'vscode';
import { AnthropicAiClient } from './ai/aiClient';
import { clearApiKey, promptAndStoreApiKey } from './ai/apiKey';
import { evaluate } from './engine/placeholder';
import { getGitApi, pickRepository, readRepoContext } from './git/gitContext';
import { presentEvaluation } from './ui/present';
import { registerReadinessUi } from './ui/register';
import type { AiClient } from './types';

export function activate(context: vscode.ExtensionContext): void {
	const ai: AiClient = new AnthropicAiClient(context);
	const { tree, statusBar } = registerReadinessUi(context);
	const output = vscode.window.createOutputChannel('PR Readiness');

	context.subscriptions.push(
		output,
		vscode.commands.registerCommand('prReadiness.evaluate', () => runEvaluate(context, ai, tree, statusBar, output)),
		vscode.commands.registerCommand('prReadiness.setApiKey', async () => {
			if (await promptAndStoreApiKey(context)) {
				vscode.window.showInformationMessage('Anthropic API key guardada de forma segura.');
			}
		}),
		vscode.commands.registerCommand('prReadiness.clearApiKey', async () => {
			await clearApiKey(context);
			vscode.window.showInformationMessage('Anthropic API key borrada.');
		})
	);
}

async function runEvaluate(
	extensionContext: vscode.ExtensionContext,
	ai: AiClient,
	tree: ReturnType<typeof registerReadinessUi>['tree'],
	statusBar: vscode.StatusBarItem,
	output: vscode.OutputChannel
): Promise<void> {
	const api = await getGitApi();
	if (!api) {
		vscode.window.showErrorMessage('No se pudo acceder a la extensión Git de VS Code.');
		return;
	}
	const repo = pickRepository(api);
	if (!repo) {
		vscode.window.showWarningMessage('No hay ningún repositorio Git abierto.');
		return;
	}

	const repoContext = await readRepoContext(repo);
	output.appendLine('=== RepoContext ===');
	output.appendLine(JSON.stringify({ ...repoContext, diff: `${repoContext.diff.length} chars` }, null, 2));

	if (!(await ai.isAvailable())) {
		vscode.window
			.showInformationMessage(
				'Sin API key de Anthropic: se usará el modo fallback (solo señales locales).',
				'Configurar API key'
			)
			.then((choice) => {
				if (choice) {
					vscode.commands.executeCommand('prReadiness.setApiKey');
				}
			});
	}

	const result = await evaluate(repoContext, ai);
	presentEvaluation(extensionContext, tree, statusBar, repoContext, result);

	output.appendLine('=== ReadinessResult ===');
	output.appendLine(JSON.stringify(result, null, 2));
}

export function deactivate(): void {
	// nada que limpiar más allá de las subscriptions.
}
