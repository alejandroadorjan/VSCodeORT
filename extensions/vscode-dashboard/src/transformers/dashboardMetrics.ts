/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardViewModel, MainFailureAlert, SkippedRunInsight, SkippedRunReasonKind } from '../model/dashboard';
import type { GitHubCommit, GitHubIssue, GitHubRepo, GitHubWorkflowRun } from '../model/github';
import { DEPLOYMENT_WEEKS_ESTIMATE, RECENT_RUN_COUNT } from './dashboardMetrics.constants';
import { createIssueCard, createRecentRunCard, createRunInsight } from './dashboardMetrics.cards';
import { buildRecentSuccessCount, buildWorkflowHistogram, calculateHealthScore, calculateMttrMinutes, isCompletedRun, runDurationSeconds, sortByStartDate } from './dashboardMetrics.compute';

const MAIN_BRANCH = 'main';
const MAIN_ALERT_COUNT = 5;
const SKIPPED_INSIGHT_COUNT = 5;

function getRunName(run: GitHubWorkflowRun): string {
	return run.name ?? run.workflow_name ?? 'Workflow';
}

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

function buildRunsByCommit(runs: GitHubWorkflowRun[]): Map<string, GitHubWorkflowRun[]> {
	const runsByCommit = new Map<string, GitHubWorkflowRun[]>();

	for (const run of runs) {
		if (!run.head_sha) {
			continue;
		}

		runsByCommit.set(run.head_sha, [...(runsByCommit.get(run.head_sha) ?? []), run]);
	}

	return runsByCommit;
}

function getRelatedRunsForCommit(run: GitHubWorkflowRun, runsByCommit: Map<string, GitHubWorkflowRun[]>): GitHubWorkflowRun[] {
	const sameCommitRuns = run.head_sha ? runsByCommit.get(run.head_sha) ?? [] : [];
	return sameCommitRuns.filter(relatedRun => relatedRun !== run);
}

function inferSkippedRunReason(relatedRuns: GitHubWorkflowRun[]): SkippedRunReasonKind {
	const sameCommitFailures = relatedRuns.filter(relatedRun => relatedRun.conclusion === 'failure');
	const sameCommitSuccessCount = relatedRuns.filter(relatedRun => relatedRun.conclusion === 'success').length;
	const inProgressCount = relatedRuns.filter(relatedRun => relatedRun.status === 'in_progress').length;

	if (sameCommitFailures.length > 0) {
		return 'sameCommitFailure';
	}

	if (sameCommitSuccessCount > 0) {
		return 'configOrEvent';
	}

	if (relatedRuns.length === 0 || inProgressCount > 0) {
		return 'missingContext';
	}

	return 'inconclusive';
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

function buildSkippedRunInsights(runs: GitHubWorkflowRun[], runsByCommit: Map<string, GitHubWorkflowRun[]>): SkippedRunInsight[] {
	return runs
		.filter(run => run.conclusion === 'skipped')
		.slice(-SKIPPED_INSIGHT_COUNT)
		.reverse()
		.map(run => {
			const relatedRuns = getRelatedRunsForCommit(run, runsByCommit);
			const sameCommitFailures = relatedRuns
				.filter(relatedRun => relatedRun.conclusion === 'failure')
				.map(relatedRun => getRunName(relatedRun).slice(0, 30));
			const sameCommitSuccessCount = relatedRuns.filter(relatedRun => relatedRun.conclusion === 'success').length;

			return {
				name: getRunName(run).slice(0, 38),
				event: run.event ?? '',
				workflowPath: run.path ?? '',
				branch: run.head_branch ?? '',
				commit: run.head_sha?.slice(0, 7) ?? '',
				date: formatRunDate(run),
				url: run.html_url ?? '',
				reasonKind: inferSkippedRunReason(relatedRuns),
				sameCommitFailures,
				sameCommitRunCount: relatedRuns.length,
				sameCommitSuccessCount,
			};
		});
}

function isRunNeedingAttention(run: GitHubWorkflowRun, runsByCommit: Map<string, GitHubWorkflowRun[]>): boolean {
	if (run.conclusion === 'failure' || run.conclusion === 'action_required') {
		return true;
	}

	if (run.conclusion !== 'skipped') {
		return false;
	}

	return inferSkippedRunReason(getRelatedRunsForCommit(run, runsByCommit)) === 'sameCommitFailure';
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
	const runsByCommit = buildRunsByCommit(sortedRuns);
	const healthRuns = sortedRuns.filter((run) => run.conclusion !== 'skipped' || inferSkippedRunReason(getRelatedRunsForCommit(run, runsByCommit)) !== 'configOrEvent');
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
	const healthCompletedRuns = healthRuns.filter((run) => isCompletedRun(run));
	const healthSuccessCount = healthRuns.filter((run) => run.conclusion === 'success').length;
	const healthSuccessRate = healthRuns.length > 0 ? Math.round((healthSuccessCount / healthRuns.length) * 100) : 0;
	const healthAverageDurationSeconds = healthCompletedRuns.length > 0
		? Math.round(healthCompletedRuns.reduce((total, run) => total + runDurationSeconds(run), 0) / healthCompletedRuns.length)
		: 0;
	const averageDurationSeconds = completedRuns.length > 0
		? Math.round(completedRuns.reduce((total, run) => total + runDurationSeconds(run), 0) / completedRuns.length)
		: 0;
	const recentSuccessCount = buildRecentSuccessCount(sortedRuns);
	const deploymentFrequency = recentSuccessCount > 0 ? Math.round((recentSuccessCount / DEPLOYMENT_WEEKS_ESTIMATE) * 10) / 10 : 0;
	const mttrMinutes = calculateMttrMinutes(sortedRuns);
	const changeFailureRate = failedRate;
	const health = calculateHealthScore(healthSuccessRate, healthAverageDurationSeconds);
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
			.filter(run => isRunNeedingAttention(run, runsByCommit))
			.slice(-5)
			.reverse()
			.map(createRunInsight),
		mainFailureAlerts: buildMainFailureAlerts(sortedRuns),
		skippedRunInsights: buildSkippedRunInsights(sortedRuns, runsByCommit),
		workflowSeries: buildWorkflowHistogram(sortedRuns),
	};
}
