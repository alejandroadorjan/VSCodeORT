/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { DashboardConfig } from '../model/config/DashboardConfig';

const DEFAULT_OWNER = 'microsoft';
const DEFAULT_REPO = 'vscode';

export function getDashboardConfig(): DashboardConfig {
	const configuration = vscode.workspace.getConfiguration('dashboard');

	return {
		owner: configuration.get<string>('owner') ?? DEFAULT_OWNER,
		repo: configuration.get<string>('repo') ?? DEFAULT_REPO,
		token: configuration.get<string>('githubToken') ?? null,
	};
}
