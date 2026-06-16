/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Capa 3 — Registro de comandos y componentes de UI.
 */
import * as vscode from 'vscode';
import { ReadinessTreeProvider } from './treeView';

export interface ReadinessUi {
	tree: ReadinessTreeProvider;
	statusBar: vscode.StatusBarItem;
}

export function registerReadinessUi(context: vscode.ExtensionContext): ReadinessUi {
	const tree = new ReadinessTreeProvider();

	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBar.command = 'prReadiness.evaluate';
	statusBar.text = '$(rocket) PR Readiness';
	statusBar.tooltip = 'Evaluar qué tan listo está el cambio para un PR';
	statusBar.show();

	context.subscriptions.push(
		statusBar,
		vscode.window.registerTreeDataProvider('prReadiness.panel', tree),
		vscode.commands.registerCommand('prReadiness.openIssue', async (url: string) => {
			if (url) {
				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
		})
	);

	return { tree, statusBar };
}
