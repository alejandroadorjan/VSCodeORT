/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface DashboardMetrics {
	totalRuns: number;
	successCount: number;
	failureCount: number;
	cancelledCount: number;
	inProgressCount: number;
	successRate: number;
	failedRate: number;
	averageDurationSeconds: number;
	deploymentFrequency: number;
	mttrMinutes: number;
	changeFailureRate: number;
	healthScore: number;
	healthColor: string;
	activeDevs: number;
	recentSuccessCount: number;
	openIssuesCount: number;
	openPullRequestsCount: number;
	stars: number;
	forks: number;
	watchers: number;
}
