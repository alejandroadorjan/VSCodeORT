/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { DashboardConfig, DashboardReleaseSource } from '../model/config/dashboardConfig';

const DEFAULT_OWNER = 'microsoft';
const DEFAULT_REPO = 'vscode';
const DEFAULT_RELEASE_SOURCE: DashboardReleaseSource = 'tags';

function getReleaseSource(value: string | undefined): DashboardReleaseSource {
	return value === 'main' || value === 'tags' ? value : DEFAULT_RELEASE_SOURCE;
}

export function getDashboardConfig(): DashboardConfig {
	const configuration = vscode.workspace.getConfiguration('dashboard');

	return {
		owner: configuration.get<string>('owner') ?? DEFAULT_OWNER,
		repo: configuration.get<string>('repo') ?? DEFAULT_REPO,
		token: configuration.get<string>('githubToken') ?? null,
		releaseSource: getReleaseSource(configuration.get<string>('releaseSource')),
	};
}
