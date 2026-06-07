/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { DashboardConfig, DashboardReleaseSource } from '../model/config/dashboardConfig';

const DEFAULT_OWNER = 'microsoft';
const DEFAULT_REPO = 'vscode';
const DEFAULT_RELEASE_SOURCE: DashboardReleaseSource = 'tags';
const TOKEN_LINE_PATTERN = /^(?<key>DASHBOARD_GITHUB_TOKEN|GITHUB_TOKEN)=(?<value>.*)$/;

function getReleaseSource(value: string | undefined): DashboardReleaseSource {
	return value === 'main' || value === 'tags' ? value : DEFAULT_RELEASE_SOURCE;
}

function normalizeEnvToken(value: string): string {
	const trimmedValue = value.trim();
	if ((trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) || (trimmedValue.startsWith('\'') && trimmedValue.endsWith('\''))) {
		return trimmedValue.slice(1, -1);
	}

	return trimmedValue;
}

function getTokenFromEnvContents(contents: string): string | null {
	for (const line of contents.split(/\r?\n/)) {
		const match = TOKEN_LINE_PATTERN.exec(line.trim());
		const value = match?.groups?.value ? normalizeEnvToken(match.groups.value) : '';
		if (value) {
			return value;
		}
	}

	return null;
}

function getWorkspaceEnvToken(): string | null {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		return null;
	}

	try {
		const envPath = path.join(workspaceFolder.uri.fsPath, '.env');
		return getTokenFromEnvContents(fs.readFileSync(envPath, 'utf8'));
	} catch {
		return null;
	}
}

function getToken(configuredToken: string | undefined): string | null {
	return configuredToken || process.env.DASHBOARD_GITHUB_TOKEN || process.env.GITHUB_TOKEN || getWorkspaceEnvToken();
}

export function getDashboardConfig(): DashboardConfig {
	const configuration = vscode.workspace.getConfiguration('dashboard');

	return {
		owner: configuration.get<string>('owner') ?? DEFAULT_OWNER,
		repo: configuration.get<string>('repo') ?? DEFAULT_REPO,
		token: getToken(configuration.get<string>('githubToken')),
		releaseSource: getReleaseSource(configuration.get<string>('releaseSource')),
	};
}
