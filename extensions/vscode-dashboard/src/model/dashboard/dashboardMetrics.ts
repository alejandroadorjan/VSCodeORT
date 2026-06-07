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
	otherCount: number;
	successRate: number;
	failedRate: number;
	ciSuccessRate: number;
	ciFailureRate: number;
	inProgressRate: number;
	otherRate: number;
	averageDurationSeconds: number;
	timeToFeedbackSeconds: number;
	failureConcentrationRate: number;
	ciRecoveryTimeMinutes: number;
	mostFailingWorkflow: string;
	slowestWorkflow: string;
	deploymentFrequency: number;
	averageDaysBetweenReleases: number;
	averageLeadTimeDays: number;
	medianLeadTimeDays: number;
	postReleaseCorrectionRate: number;
	serviceIncidentCount: number | null;
	serviceRecoveryTimeMinutes: number | null;
	mttrMinutes: number;
	changeFailureRate: number;
	healthScore: number;
	healthColor: string;
	activeDevs: number;
	recentSuccessCount: number;
	openIssuesCount: number;
	openPullRequestsCount: number;
	repoFullName: string;
	repoDescription: string | null;
	repoPrivate: boolean;
	stars: number;
	forks: number;
	watchers: number;
}
