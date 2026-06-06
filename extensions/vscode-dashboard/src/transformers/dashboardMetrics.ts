/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardViewModel } from '../model/dashboard';
import type { GitHubCommit, GitHubIssue, GitHubRepo, GitHubWorkflowRun } from '../model/github';
import { DEPLOYMENT_WEEKS_ESTIMATE, RECENT_RUN_COUNT } from './dashboardMetrics.constants';
import { createIssueCard, createRecentRunCard } from './dashboardMetrics.cards';
import { buildChartData, buildRecentSuccessCount, buildWorkflowHistogram, calculateHealthScore, calculateMttrMinutes, isCompletedRun, runDurationSeconds, sortByStartDate } from './dashboardMetrics.compute';

export function buildDashboardViewModel(input: {
	repo: GitHubRepo;
	workflowRuns: GitHubWorkflowRun[];
	closedIssues: GitHubIssue[];
	openIssuesCount: number;
	openPullRequestsCount: number;
	commits: GitHubCommit[];
}): DashboardViewModel {
	const sortedRuns = sortByStartDate(input.workflowRuns).filter((run) => run.conclusion !== undefined || run.status !== undefined);
	const totalRuns = sortedRuns.length;
	const successCount = sortedRuns.filter((run) => run.conclusion === 'success').length;
	const failureCount = sortedRuns.filter((run) => run.conclusion === 'failure').length;
	const cancelledCount = sortedRuns.filter((run) => run.conclusion === 'cancelled').length;
	const inProgressCount = sortedRuns.filter((run) => run.status === 'in_progress').length;
	const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;
	const failedRate = totalRuns > 0 ? Math.round((failureCount / totalRuns) * 100) : 0;
	const completedRuns = sortedRuns.filter((run) => isCompletedRun(run));
	const averageDurationSeconds = completedRuns.length > 0
		? Math.round(completedRuns.reduce((total, run) => total + runDurationSeconds(run), 0) / completedRuns.length)
		: 0;
	const recentSuccessCount = buildRecentSuccessCount(sortedRuns);
	const deploymentFrequency = recentSuccessCount > 0 ? Math.round((recentSuccessCount / DEPLOYMENT_WEEKS_ESTIMATE) * 10) / 10 : 0;
	const mttrMinutes = calculateMttrMinutes(sortedRuns);
	const changeFailureRate = failedRate;
	const health = calculateHealthScore(successRate, averageDurationSeconds);
	const activeDevs = new Set(input.commits.map((commit) => commit.author?.login).filter((login): login is string => Boolean(login))).size;
	const chartData = buildChartData(sortedRuns);

	return {
		metrics: {
			totalRuns,
			successCount,
			failureCount,
			cancelledCount,
			inProgressCount,
			successRate,
			failedRate,
			averageDurationSeconds,
			deploymentFrequency,
			mttrMinutes,
			changeFailureRate,
			healthScore: health.score,
			healthColor: health.color,
			activeDevs,
			recentSuccessCount,
			openIssuesCount: input.openIssuesCount,
			openPullRequestsCount: input.openPullRequestsCount,
			stars: input.repo.stargazers_count ?? 0,
			forks: input.repo.forks_count ?? 0,
			watchers: input.repo.subscribers_count ?? input.repo.watchers_count ?? 0,
		},
		issueCards: input.closedIssues.slice(0, 8).map(createIssueCard),
		recentRuns: sortedRuns.slice(-RECENT_RUN_COUNT).reverse().map(createRecentRunCard),
		workflowSeries: buildWorkflowHistogram(sortedRuns),
		chartLabels: chartData.labels,
		chartSuccess: chartData.success,
		chartFailure: chartData.failure,
		chartDuration: chartData.duration,
	};
}
