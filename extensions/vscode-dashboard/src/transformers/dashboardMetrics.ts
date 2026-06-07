/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardViewModel, MainFailureAlert, ReleaseChange, SkippedRunInsight, SkippedRunReasonKind } from '../model/dashboard';
import type { DashboardReleaseSource } from '../model/config/dashboardConfig';
import type { GitHubCommit, GitHubIssue, GitHubRelease, GitHubRepo, GitHubTag, GitHubWorkflowRun } from '../model/github';
import { DEPLOYMENT_WEEKS_ESTIMATE, DEPLOYMENT_WINDOW_DAYS, RECENT_RUN_COUNT } from './dashboardMetrics.constants';
import { createIssueCard, createRecentRunCard, createRunInsight, createWorkflowDurationInsight } from './dashboardMetrics.cards';
import { buildWorkflowHistogram, calculateHealthScore, isCompletedRun, runDurationSeconds, sortByStartDate } from './dashboardMetrics.compute';

const MAIN_BRANCH = 'main';
const MAIN_ALERT_COUNT = 5;
const SKIPPED_INSIGHT_COUNT = 5;
const WORKFLOW_DURATION_INSIGHT_COUNT = 4;
const POST_RELEASE_CORRECTION_DAYS = 7;

interface DeploymentAttempt {
	sha: string;
	status: 'success' | 'failure';
	completedAt: number;
}

interface VersionParts {
	major: number;
	minor: number;
	patch: number;
}

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

function getRunTimestamp(run: GitHubWorkflowRun): number {
	return new Date(run.updated_at ?? run.run_started_at ?? run.created_at ?? '').getTime();
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

function parseVersionTag(name: string): VersionParts | undefined {
	const match = /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:[-+].*)?$/.exec(name);
	if (!match?.groups) {
		return undefined;
	}

	return {
		major: Number(match.groups.major),
		minor: Number(match.groups.minor),
		patch: Number(match.groups.patch),
	};
}

function getReleaseDate(release: GitHubRelease): string | undefined {
	return release.published_at ?? release.created_at ?? undefined;
}

function getVersionedReleases(releases: GitHubRelease[]): Array<GitHubRelease & { tag_name: string }> {
	return releases
		.filter((release): release is GitHubRelease & { tag_name: string } => Boolean(release.tag_name && parseVersionTag(release.tag_name) && getReleaseDate(release)))
		.sort((left, right) => new Date(getReleaseDate(left) ?? '').getTime() - new Date(getReleaseDate(right) ?? '').getTime());
}

function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0
		? Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10
		: Math.round(sorted[middle] * 10) / 10;
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

function calculateCiRecoveryTimeMinutes(runs: GitHubWorkflowRun[]): number {
	let recoverySum = 0;
	let recoveryCount = 0;
	const runsByWorkflow = new Map<string, GitHubWorkflowRun[]>();

	for (const run of runs) {
		const workflowName = getRunName(run);
		runsByWorkflow.set(workflowName, [...(runsByWorkflow.get(workflowName) ?? []), run]);
	}

	for (const workflowRuns of runsByWorkflow.values()) {
		const sortedWorkflowRuns = sortByStartDate(workflowRuns);
		for (let index = 0; index < sortedWorkflowRuns.length; index++) {
			const failedRun = sortedWorkflowRuns[index];
			if (failedRun.conclusion !== 'failure' || !Number.isFinite(getRunTimestamp(failedRun))) {
				continue;
			}

			const nextSuccess = sortedWorkflowRuns.slice(index + 1).find(run => run.conclusion === 'success' && Number.isFinite(getRunTimestamp(run)));
			if (!nextSuccess) {
				continue;
			}

			recoverySum += (getRunTimestamp(nextSuccess) - getRunTimestamp(failedRun)) / 60000;
			recoveryCount++;
		}
	}

	return recoveryCount > 0 ? Math.max(1, Math.round(recoverySum / recoveryCount)) : 0;
}

function getDeploymentCandidateRuns(runs: GitHubWorkflowRun[], releaseSource: DashboardReleaseSource, releaseTags: GitHubTag[]): GitHubWorkflowRun[] {
	if (releaseSource === 'tags') {
		const releaseShas = new Set(releaseTags.map(tag => tag.commit?.sha).filter((sha): sha is string => Boolean(sha)));
		const releaseNames = new Set(releaseTags.map(tag => tag.name).filter((name): name is string => Boolean(name)));
		return runs.filter(run => Boolean((run.head_sha && releaseShas.has(run.head_sha)) || (run.head_branch && releaseNames.has(run.head_branch))));
	}

	return runs.filter(run => run.head_branch === MAIN_BRANCH && Boolean(run.head_sha));
}

function buildDeploymentAttempts(runs: GitHubWorkflowRun[], releaseSource: DashboardReleaseSource, releaseTags: GitHubTag[]): DeploymentAttempt[] {
	const deploymentRunsByCommit = buildRunsByCommit(getDeploymentCandidateRuns(runs, releaseSource, releaseTags));
	const attempts: DeploymentAttempt[] = [];

	for (const [sha, commitRuns] of deploymentRunsByCommit) {
		const timedRuns = commitRuns.filter(run => Number.isFinite(getRunTimestamp(run)));
		if (timedRuns.length === 0) {
			continue;
		}

		const hasFailure = timedRuns.some(run => run.conclusion === 'failure' || run.conclusion === 'action_required');
		const hasSuccess = timedRuns.some(run => run.conclusion === 'success');
		if (!hasFailure && !hasSuccess) {
			continue;
		}

		attempts.push({
			sha,
			status: hasFailure ? 'failure' : 'success',
			completedAt: Math.max(...timedRuns.map(getRunTimestamp)),
		});
	}

	return attempts.sort((left, right) => left.completedAt - right.completedAt);
}

function calculateAverageDaysBetweenReleases(releases: GitHubRelease[]): number {
	const versionedReleases = getVersionedReleases(releases);
	if (versionedReleases.length < 2) {
		return 0;
	}

	const gaps = versionedReleases.slice(1).map((release, index) => {
		const currentDate = new Date(getReleaseDate(release) ?? '').getTime();
		const previousDate = new Date(getReleaseDate(versionedReleases[index]) ?? '').getTime();
		return (currentDate - previousDate) / 86400000;
	});

	return Math.round((gaps.reduce((total, gap) => total + gap, 0) / gaps.length) * 10) / 10;
}

function calculateLeadTimeDays(releaseChanges: ReleaseChange[]): { average: number; median: number } {
	const leadTimes = releaseChanges.flatMap(change => {
		const releaseDate = new Date(change.releaseDate).getTime();
		return change.commitDates
			.map(commitDate => (releaseDate - new Date(commitDate).getTime()) / 86400000)
			.filter(value => Number.isFinite(value) && value >= 0);
	});

	if (leadTimes.length === 0) {
		return { average: 0, median: 0 };
	}

	return {
		average: Math.round((leadTimes.reduce((total, value) => total + value, 0) / leadTimes.length) * 10) / 10,
		median: median(leadTimes),
	};
}

function calculatePostReleaseCorrectionRate(releases: GitHubRelease[]): number {
	const versionedReleases = getVersionedReleases(releases);
	const stableReleases = versionedReleases.filter(release => parseVersionTag(release.tag_name)?.patch === 0);
	if (stableReleases.length === 0) {
		return 0;
	}

	const correctedStableReleases = stableReleases.filter(stableRelease => {
		const stableVersion = parseVersionTag(stableRelease.tag_name);
		const stableDate = new Date(getReleaseDate(stableRelease) ?? '').getTime();
		if (!stableVersion || !Number.isFinite(stableDate)) {
			return false;
		}

		return versionedReleases.some(candidateRelease => {
			const candidateVersion = parseVersionTag(candidateRelease.tag_name);
			const candidateDate = new Date(getReleaseDate(candidateRelease) ?? '').getTime();
			if (!candidateVersion || !Number.isFinite(candidateDate)) {
				return false;
			}

			const daysAfterStableRelease = (candidateDate - stableDate) / 86400000;
			return candidateVersion.major === stableVersion.major
				&& candidateVersion.minor === stableVersion.minor
				&& candidateVersion.patch > stableVersion.patch
				&& daysAfterStableRelease > 0
				&& daysAfterStableRelease <= POST_RELEASE_CORRECTION_DAYS;
		});
	});

	return Math.round((correctedStableReleases.length / stableReleases.length) * 100);
}

export function buildDashboardViewModel(input: {
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
}): DashboardViewModel {
	const sortedRuns = sortByStartDate(input.workflowRuns).filter((run) => run.conclusion !== undefined || run.status !== undefined);
	const runsByCommit = buildRunsByCommit(sortedRuns);
	const healthRuns = sortedRuns.filter(run => {
		if (run.conclusion !== 'skipped') {
			return true;
		}

		return inferSkippedRunReason(
			getRelatedRunsForCommit(run, runsByCommit)
		) === 'sameCommitFailure';
	});
	const totalRuns = sortedRuns.length;
	const successCount = sortedRuns.filter((run) => run.conclusion === 'success').length;
	const failureCount = sortedRuns.filter((run) => run.conclusion === 'failure').length;
	const cancelledCount = sortedRuns.filter((run) => run.conclusion === 'cancelled').length;
	const inProgressCount = sortedRuns.filter((run) => run.status === 'in_progress').length;
	const otherCount = Math.max(0, totalRuns - successCount - failureCount - inProgressCount);
	const completedWorkflowRuns = sortedRuns.filter(run => run.status === 'completed' || Boolean(run.conclusion));
	const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;
	const failedRate = totalRuns > 0 ? Math.round((failureCount / totalRuns) * 100) : 0;
	const ciSuccessRate = completedWorkflowRuns.length > 0 ? Math.round((successCount / completedWorkflowRuns.length) * 100) : 0;
	const ciFailureRate = completedWorkflowRuns.length > 0 ? Math.round((failureCount / completedWorkflowRuns.length) * 100) : 0;
	const inProgressRate = totalRuns > 0 ? Math.round((inProgressCount / totalRuns) * 100) : 0;
	const otherRate = totalRuns > 0 ? Math.max(0, 100 - successRate - failedRate - inProgressRate) : 0;
	const completedRuns = sortedRuns.filter((run) => isCompletedRun(run));
	const healthCompletedRuns = healthRuns.filter((run) => isCompletedRun(run));
	const completedRunDurations = completedRuns.map(runDurationSeconds);
	const timeToFeedbackSeconds = completedRunDurations.length > 0
		? Math.round(completedRunDurations.reduce((total, duration) => total + duration, 0) / completedRunDurations.length)
		: 0;
	const workflowFailures = buildWorkflowHistogram(sortedRuns);
	const topFailingWorkflow = workflowFailures.find(workflow => workflow.failure > 0);
	const slowestWorkflow = [...workflowFailures].sort((left, right) => right.durationSeconds - left.durationSeconds)[0];
	const failureConcentrationRate = failureCount > 0 && topFailingWorkflow
		? Math.round((topFailingWorkflow.failure / failureCount) * 100)
		: 0;

	// Health success rate is based only on completed workflow executions.
	// Cancelled, skipped and in-progress runs do not represent a successful
	// or failed execution and are therefore excluded from the reliability metric.
	const healthRelevantRuns = healthRuns.filter(
		run =>
			run.conclusion === 'success' ||
			run.conclusion === 'failure'
	);
	const healthSuccessCount = healthRelevantRuns.filter(
		(run) => run.conclusion === 'success'
	).length;

	const healthSuccessRate = healthRelevantRuns.length > 0
		? Math.round((healthSuccessCount / healthRelevantRuns.length) * 100)
		: 0;
	const healthAverageDurationSeconds = healthCompletedRuns.length > 0
		? Math.round(healthCompletedRuns.reduce((total, run) => total + runDurationSeconds(run), 0) / healthCompletedRuns.length)
		: 0;
	const averageDurationSeconds = completedRuns.length > 0
		? Math.round(completedRuns.reduce((total, run) => total + runDurationSeconds(run), 0) / completedRuns.length)
		: 0;
	const deploymentAttempts = buildDeploymentAttempts(sortedRuns, input.releaseSource, input.releaseTags);
	const deploymentWindowThreshold = Date.now() - (DEPLOYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
	const recentDeploymentAttempts = deploymentAttempts.filter(attempt => attempt.completedAt >= deploymentWindowThreshold);
	const recentSuccessfulDeploymentCount = recentDeploymentAttempts.filter(attempt => attempt.status === 'success').length;
	const releaseFrequency = recentSuccessfulDeploymentCount > 0 ? Math.round((recentSuccessfulDeploymentCount / DEPLOYMENT_WEEKS_ESTIMATE) * 10) / 10 : 0;
	const leadTime = calculateLeadTimeDays(input.releaseChanges);
	const postReleaseCorrectionRate = calculatePostReleaseCorrectionRate(input.releases);
	const health = calculateHealthScore(healthSuccessRate, healthAverageDurationSeconds);
	const activeDevs = new Set(input.commits.map((commit) => commit.author?.login).filter((login): login is string => Boolean(login))).size;
	const recentRuns = sortedRuns.slice(-RECENT_RUN_COUNT).reverse();
	const workflowSeries = buildWorkflowHistogram(sortedRuns);
	const workflowDurationInsights = [...completedRuns]
		.sort((left, right) => runDurationSeconds(right) - runDurationSeconds(left))
		.slice(0, WORKFLOW_DURATION_INSIGHT_COUNT)
		.map(createWorkflowDurationInsight);

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
			ciSuccessRate,
			ciFailureRate,
			inProgressRate,
			otherRate,
			averageDurationSeconds,
			timeToFeedbackSeconds,
			failureConcentrationRate,
			ciRecoveryTimeMinutes: calculateCiRecoveryTimeMinutes(sortedRuns),
			mostFailingWorkflow: topFailingWorkflow?.label ?? 'n/a',
			slowestWorkflow: slowestWorkflow?.label ?? 'n/a',
			deploymentFrequency: releaseFrequency,
			averageDaysBetweenReleases: calculateAverageDaysBetweenReleases(input.releases),
			averageLeadTimeDays: leadTime.average,
			medianLeadTimeDays: leadTime.median,
			postReleaseCorrectionRate,
			serviceIncidentCount: null,
			serviceRecoveryTimeMinutes: null,
			mttrMinutes: 0,
			changeFailureRate: postReleaseCorrectionRate,
			healthScore: health.score,
			healthColor: health.color,
			activeDevs,
			recentSuccessCount: recentSuccessfulDeploymentCount,
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
			.reverse()
			.map(createRunInsight),
		mainFailureAlerts: buildMainFailureAlerts(sortedRuns),
		skippedRunInsights: buildSkippedRunInsights(sortedRuns, runsByCommit),
		workflowDurationInsights,
		workflowSeries,
	};
}
