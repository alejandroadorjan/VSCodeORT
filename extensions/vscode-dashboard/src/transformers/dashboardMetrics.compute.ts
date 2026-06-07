/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubWorkflowRun } from '../model/github';
import type { WorkflowFailureRun, WorkflowHistogramItem } from '../model/dashboard';
import { BUILD_DURATION_CAP_SECONDS, DEPLOYMENT_WINDOW_DAYS } from './dashboardMetrics.constants';

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
	const durationScore = Math.max(0, Math.round(((BUILD_DURATION_CAP_SECONDS - Math.min(averageDurationSeconds, BUILD_DURATION_CAP_SECONDS)) / BUILD_DURATION_CAP_SECONDS) * 100));
	const score = Math.min(100, Math.round((successRate * 0.65) + (durationScore * 0.35)));

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
		failures: createWorkflowFailures(workflowRuns),
	})).sort((left, right) => right.failure - left.failure || right.durationSeconds - left.durationSeconds);
}

function createWorkflowFailures(runs: GitHubWorkflowRun[]): WorkflowFailureRun[] {
	return runs
		.filter(run => run.conclusion === 'failure')
		.sort((left, right) => getRunTimestamp(right) - getRunTimestamp(left))
		.map(run => ({
			title: run.display_title ?? run.name ?? run.workflow_name ?? 'Workflow run',
			branch: run.head_branch ?? '',
			commit: run.head_sha ? run.head_sha.slice(0, 7) : '',
			date: formatRunDate(run),
			duration: formatRunDuration(run),
			url: run.html_url ?? '',
		}));
}

function getRunTimestamp(run: GitHubWorkflowRun): number {
	return new Date(run.updated_at ?? run.run_started_at ?? run.created_at ?? '').getTime();
}

function formatRunDate(run: GitHubWorkflowRun): string {
	const timestamp = run.updated_at ?? run.run_started_at ?? run.created_at;
	if (!timestamp) {
		return '';
	}

	return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRunDuration(run: GitHubWorkflowRun): string {
	if (!run.run_started_at || !run.updated_at) {
		return '';
	}

	const seconds = runDurationSeconds(run);
	return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}
