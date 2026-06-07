/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubLabel } from './githubLabel';
import type { GitHubUser } from './githubUser';

export interface GitHubIssue {
	number: number;
	title: string;
	closed_at?: string | null;
	comments?: number;
	labels?: GitHubLabel[];
	closed_by?: GitHubUser | null;
	pull_request?: object;
}
