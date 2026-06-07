/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardReleaseSource } from '../config/dashboardConfig';
import type { GitHubCommit, GitHubIssue, GitHubRelease, GitHubRepo, GitHubTag, GitHubWorkflowRun } from '../github';
import type { ReleaseChange } from './releaseChange';

export interface DashboardData {
	repo: GitHubRepo;
	workflowRuns: GitHubWorkflowRun[];
	releaseSource: DashboardReleaseSource;
	releases: GitHubRelease[];
	releaseTags: GitHubTag[];
	releaseChanges: ReleaseChange[];
	closedIssues: GitHubIssue[];
	openIssuesCount: number;
	openPullRequestsCount: number;
	commits: GitHubCommit[];
}
