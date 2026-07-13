/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = require('vscode');

const contributingFile = 'CONTRIBUTING.md';

function activate(context) {
	context.subscriptions.push(vscode.commands.registerCommand('contributor-onboarding.openContributing', async () => {
		const uri = await findContributingUri();
		if (!uri) {
			await vscode.window.showWarningMessage(vscode.l10n.t('Open the VS Code repository folder to view CONTRIBUTING.md.'));
			return;
		}

		await vscode.commands.executeCommand('vscode.open', uri);
	}));
}

async function findContributingUri() {
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const uri = vscode.Uri.joinPath(folder.uri, contributingFile);
		try {
			await vscode.workspace.fs.stat(uri);
			return uri;
		} catch {
			// Continue looking in the next workspace folder.
		}
	}

	const matches = await vscode.workspace.findFiles(contributingFile, undefined, 1);
	return matches[0];
}

module.exports = {
	activate
};
