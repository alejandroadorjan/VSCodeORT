/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface GitHubRepo {
	open_issues_count?: number;
	forks_count?: number;
	subscribers_count?: number;
	watchers_count?: number;
	stargazers_count?: number;
	full_name?: string;
}
