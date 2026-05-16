import type { GitHubWorkflowRun } from '../model/github';
import type { WorkflowHistogramItem } from '../model/dashboard';
import { BUILD_DURATION_CAP_SECONDS, CHART_POINTS, DEPLOYMENT_WINDOW_DAYS } from './dashboardMetrics.constants';

export function isCompletedRun(run: GitHubWorkflowRun): boolean {
	return Boolean(run.run_started_at && run.updated_at && run.conclusion);
}

export function runDurationSeconds(run: GitHubWorkflowRun): number {
	if (!run.run_started_at || !run.updated_at) {
		return 0;
	}

	return Math.max(0, Math.round((new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime()) / 1000));
}

export function calculateHealthScore(successRate: number, averageDurationSeconds: number): { score: number; color: string } {
	const score = Math.min(100, Math.round((successRate * 0.65) + ((100 - Math.min(averageDurationSeconds, BUILD_DURATION_CAP_SECONDS)) * 0.35)));

	if (score > 85) {
		return { score, color: '#7ec850' };
	}

	if (score > 65) {
		return { score, color: '#e0a030' };
	}

	return { score, color: '#e05c5c' };
}

export function sortByStartDate(runs: GitHubWorkflowRun[]): GitHubWorkflowRun[] {
	return [...runs].sort((left, right) => new Date(left.run_started_at ?? '').getTime() - new Date(right.run_started_at ?? '').getTime());
}

export function buildLastRunsSeries(runs: GitHubWorkflowRun[]): GitHubWorkflowRun[] {
	return sortByStartDate(runs)
		.filter(run => isCompletedRun(run))
		.slice(-CHART_POINTS);
}

export function buildRecentSuccessCount(runs: GitHubWorkflowRun[]): number {
	const threshold = Date.now() - (DEPLOYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
	return runs.filter(run => run.conclusion === 'success' && run.run_started_at && new Date(run.run_started_at).getTime() >= threshold).length;
}

export function calculateMttrMinutes(sortedRuns: GitHubWorkflowRun[]): number {
	let recoverySum = 0;
	let recoveryCount = 0;

	for (let index = 0; index < sortedRuns.length; index++) {
		const currentRun = sortedRuns[index];
		if (currentRun.conclusion !== 'failure' || !currentRun.updated_at) {
			continue;
		}

		const nextSuccessfulRun = sortedRuns.slice(index + 1).find(run => run.conclusion === 'success' && run.run_started_at);
		if (!nextSuccessfulRun?.run_started_at) {
			continue;
		}

		recoverySum += (new Date(nextSuccessfulRun.run_started_at).getTime() - new Date(currentRun.updated_at).getTime()) / 60000;
		recoveryCount++;
	}

	return recoveryCount > 0 ? Math.max(1, Math.round(recoverySum / recoveryCount)) : 0;
}

export function buildWorkflowHistogram(runs: GitHubWorkflowRun[]): WorkflowHistogramItem[] {
	const groupedRuns = new Map<string, GitHubWorkflowRun[]>();

	for (const run of runs) {
		const key = run.workflow_name ?? run.name ?? 'Workflow';
		const group = groupedRuns.get(key) ?? [];
		group.push(run);
		groupedRuns.set(key, group);
	}

	return [...groupedRuns.entries()].map(([label, workflowRuns]) => ({
		label,
		success: workflowRuns.filter(run => run.conclusion === 'success').length,
		failure: workflowRuns.filter(run => run.conclusion === 'failure').length,
		durationSeconds: Math.round(workflowRuns.filter(run => isCompletedRun(run)).reduce((total, run) => total + runDurationSeconds(run), 0) / Math.max(1, workflowRuns.filter(run => isCompletedRun(run)).length)),
	})).sort((left, right) => right.failure - left.failure || right.durationSeconds - left.durationSeconds);
}

export function buildChartData(runs: GitHubWorkflowRun[]): { labels: string[]; success: number[]; failure: number[]; duration: number[] } {
	const lastRuns = buildLastRunsSeries(runs);

	return {
		labels: lastRuns.map(run => {
			const startedAt = run.run_started_at ? new Date(run.run_started_at) : new Date();
			return `${startedAt.getMonth() + 1}/${startedAt.getDate()}`;
		}),
		success: lastRuns.map(run => run.conclusion === 'success' ? 1 : 0),
		failure: lastRuns.map(run => run.conclusion === 'failure' ? 1 : 0),
		duration: lastRuns.map(run => runDurationSeconds(run)),
	};
}
