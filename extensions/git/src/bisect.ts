/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, ExtensionContext, Uri, ViewColumn, WebviewPanel, window } from 'vscode';
import { Repository } from './repository';

export class Bisect implements Disposable {

	private disposables: Disposable[];

	constructor(private readonly context: ExtensionContext) {
		this.disposables = [];
	}

	startBisect(repository: Repository): void {
		const repositoryPath: string = repository.root;

		console.log(repositoryPath);

		const panel = window.createWebviewPanel(
			'gitBisect',
			'Git Bisect',
			ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [
					Uri.joinPath(this.context.extensionUri, 'bisect-ui', 'dist')
				]
			}
		);

		this.disposables.push(panel);

		panel.webview.html = this.getHtml(panel);
	}

	private getHtml(panel: WebviewPanel): string {
		const scriptUri = panel.webview.asWebviewUri(
			Uri.joinPath(
				this.context.extensionUri,
				'bisect-ui',
				'dist',
				'assets',
				'bisect.js'
			)
		);

		return `
			<!DOCTYPE html>
			<html>
			<body>
				<div id="root"></div>

				<script
					type="module"
					src="${scriptUri}"
				></script>
			</body>
			</html>
		`;
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
