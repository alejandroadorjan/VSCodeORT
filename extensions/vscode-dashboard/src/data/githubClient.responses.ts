/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubSearchResult, GitHubWorkflowRun } from '../model/github';

export interface GitHubSearchResponse extends GitHubSearchResult {
	items?: object[];
}

export interface GitHubRunsResponse {
	workflow_runs?: GitHubWorkflowRun[];
}
