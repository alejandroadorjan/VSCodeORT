/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubUser } from './githubUser';

export interface GitHubCommit {
	sha?: string;
	author?: GitHubUser | null;
	commit?: {
		author?: {
			date?: string | null;
		};
		committer?: {
			date?: string | null;
		};
	};
}
