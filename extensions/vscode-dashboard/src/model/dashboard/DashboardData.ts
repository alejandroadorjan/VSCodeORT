/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubCommit, GitHubIssue, GitHubRepo, GitHubWorkflowRun } from '../github';

export interface DashboardData {
	repo: GitHubRepo;
	workflowRuns: GitHubWorkflowRun[];
	closedIssues: GitHubIssue[];
	openIssuesCount: number;
	openPullRequestsCount: number;
	commits: GitHubCommit[];
}
