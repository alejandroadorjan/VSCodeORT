/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getDashboardConfig } from './config/dashboardConfig';
import { loadDashboardData } from './services/dashboardService';
import { buildDashboardViewModel } from './transformers/dashboardMetrics';
import { renderDashboardHtml } from './webview/dashboardRenderer';

export function activate(context: vscode.ExtensionContext) {
	const command = vscode.commands.registerCommand('dashboard.open', async () => {
		const config = getDashboardConfig();
		const dashboardData = await loadDashboardData(config);
		const viewModel = buildDashboardViewModel(dashboardData);

		const panel = vscode.window.createWebviewPanel(
			'dashboard',
			vscode.l10n.t('Engineering Dashboard'),
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);

		const html = renderDashboardHtml(context, panel.webview, viewModel);
		panel.webview.html = html;
	});

	context.subscriptions.push(command);
}

export function deactivate() { }
