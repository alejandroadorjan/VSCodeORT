/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardViewModel, MainFailureAlert } from '../model/dashboard';
import type { GitHubCommit, GitHubIssue, GitHubRepo, GitHubWorkflowRun } from '../model/github';
import { DEPLOYMENT_WEEKS_ESTIMATE, RECENT_RUN_COUNT } from './dashboardMetrics.constants';
import { createIssueCard, createRecentRunCard, createRunInsight } from './dashboardMetrics.cards';
import { buildRecentSuccessCount, buildWorkflowHistogram, calculateHealthScore, calculateMttrMinutes, isCompletedRun, runDurationSeconds, sortByStartDate } from './dashboardMetrics.compute';

const MAIN_BRANCH = 'main';
const MAIN_ALERT_COUNT = 5;

function formatRunDate(run: GitHubWorkflowRun): string {
	const timestamp = run.updated_at ?? run.run_started_at;
	if (!timestamp) {
		return 'n/a';
	}

	return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusClasses(status: string): { dotClass: string; badgeClass: string } {
	if (status === 'failure') {
		return { dotClass: 'red', badgeClass: 'badge-red' };
	}

	if (status === 'in_progress') {
		return { dotClass: 'blue', badgeClass: 'badge-blue' };
	}

	return { dotClass: 'amber', badgeClass: 'badge-amber' };
}

function buildMainFailureAlerts(runs: GitHubWorkflowRun[]): MainFailureAlert[] {
	return runs
		.filter(run => run.head_branch === MAIN_BRANCH && run.conclusion === 'failure')
		.slice(-MAIN_ALERT_COUNT)
		.reverse()
		.map(run => {
			const statusLabel = run.conclusion ?? run.status ?? 'unknown';
			const classes = getStatusClasses(statusLabel);
			const durationSeconds = runDurationSeconds(run);

			return {
				name: (run.name ?? run.workflow_name ?? 'Workflow').slice(0, 38),
				statusLabel,
				badgeClass: classes.badgeClass,
				dotClass: classes.dotClass,
				commit: run.head_sha?.slice(0, 7) ?? '',
				date: formatRunDate(run),
				duration: isCompletedRun(run) ? `${durationSeconds}s` : 'n/a',
				url: run.html_url ?? '',
			};
		});
}

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
	const otherCount = Math.max(0, totalRuns - successCount - failureCount - inProgressCount);
	const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;
	const failedRate = totalRuns > 0 ? Math.round((failureCount / totalRuns) * 100) : 0;
	const inProgressRate = totalRuns > 0 ? Math.round((inProgressCount / totalRuns) * 100) : 0;
	const otherRate = totalRuns > 0 ? Math.max(0, 100 - successRate - failedRate - inProgressRate) : 0;
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
	const recentRuns = sortedRuns.slice(-RECENT_RUN_COUNT).reverse();

	return {
		metrics: {
			totalRuns,
			successCount,
			failureCount,
			cancelledCount,
			inProgressCount,
			otherCount,
			successRate,
			failedRate,
			inProgressRate,
			otherRate,
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
		recentRuns: recentRuns.map(createRecentRunCard),
		runDiagnostics: recentRuns.map(createRunInsight),
		runInsights: sortedRuns
			.filter(run => run.conclusion !== 'success')
			.slice(-5)
			.reverse()
			.map(createRunInsight),
		mainFailureAlerts: buildMainFailureAlerts(sortedRuns),
		workflowSeries: buildWorkflowHistogram(sortedRuns),
	};
}
