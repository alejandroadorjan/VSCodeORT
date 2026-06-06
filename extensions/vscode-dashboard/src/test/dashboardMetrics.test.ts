/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { buildDashboardViewModel } from '../transformers/dashboardMetrics';

export async function runDashboardMetricsTests() {
	await testViewModelBuildsWorkflowConcentration();
	await testRecentRunsOrdering();
	await testRunOutcomePercentagesAddToOneHundred();
	await testMainFailureAlerts();
	await testSkippedRunInsights();
	await testConfigSkippedRunsDoNotLowerHealthScore();
}

async function testViewModelBuildsWorkflowConcentration() {
	const viewModel = buildDashboardViewModel({
		repo: { stargazers_count: 25, forks_count: 3, subscribers_count: 2, watchers_count: 4 },
		workflowRuns: [
			{ name: 'CI', workflow_name: 'CI', conclusion: 'failure', run_started_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:10:00Z' },
			{ name: 'CI', workflow_name: 'CI', conclusion: 'success', run_started_at: '2026-05-01T11:00:00Z', updated_at: '2026-05-01T11:08:00Z' },
			{ name: 'Tests', workflow_name: 'Tests', conclusion: 'failure', run_started_at: '2026-05-01T12:00:00Z', updated_at: '2026-05-01T12:05:00Z' },
		],
		closedIssues: [],
		openIssuesCount: 4,
		openPullRequestsCount: 2,
		commits: [{ author: { login: 'dev1' } }, { author: { login: 'dev2' } }, { author: { login: 'dev1' } }],
	});

	assert.strictEqual(viewModel.metrics.totalRuns, 3);
	assert.strictEqual(viewModel.metrics.failureCount, 2);
	assert.strictEqual(viewModel.metrics.activeDevs, 2);
	assert.strictEqual(viewModel.workflowSeries[0].label, 'CI');
	assert.strictEqual(viewModel.workflowSeries[0].failure >= 1, true);
}

async function testRecentRunsOrdering() {
	const viewModel = buildDashboardViewModel({
		repo: {},
		workflowRuns: [
			{ name: 'Old', conclusion: 'success', run_started_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:01:00Z' },
			{ name: 'New', conclusion: 'failure', run_started_at: '2026-05-02T10:00:00Z', updated_at: '2026-05-02T10:01:00Z' },
		],
		closedIssues: [],
		openIssuesCount: 0,
		openPullRequestsCount: 0,
		commits: [],
	});

	assert.strictEqual(viewModel.recentRuns[0].name, 'New');
	assert.strictEqual(viewModel.recentRuns[1].name, 'Old');
}

async function testRunOutcomePercentagesAddToOneHundred() {
	const viewModel = buildDashboardViewModel({
		repo: {},
		workflowRuns: [
			{ name: 'Success 1', conclusion: 'success', status: 'completed' },
			{ name: 'Success 2', conclusion: 'success', status: 'completed' },
			{ name: 'Failure', conclusion: 'failure', status: 'completed' },
			{ name: 'Skipped', conclusion: 'skipped', status: 'completed' },
			{ name: 'Action Required', conclusion: 'action_required', status: 'completed' },
			{ name: 'Running', status: 'in_progress' },
		],
		closedIssues: [],
		openIssuesCount: 0,
		openPullRequestsCount: 0,
		commits: [],
	});
	const metrics = viewModel.metrics;

	assert.strictEqual(metrics.successCount, 2);
	assert.strictEqual(metrics.failureCount, 1);
	assert.strictEqual(metrics.otherCount, 2);
	assert.strictEqual(metrics.inProgressCount, 1);
	assert.strictEqual(metrics.successRate + metrics.failedRate + metrics.otherRate + metrics.inProgressRate, 100);
	assert.strictEqual(viewModel.runDiagnostics.length, 6);
	assert.strictEqual(viewModel.runDiagnostics.filter(run => run.statusLabel === 'action_required' || run.statusLabel === 'skipped').length, 2);
}

async function testMainFailureAlerts() {
	const viewModel = buildDashboardViewModel({
		repo: {},
		workflowRuns: [
			{ name: 'Main success', head_branch: 'main', conclusion: 'success', status: 'completed', updated_at: '2026-05-01T10:00:00Z' },
			{ name: 'Main failure', head_branch: 'main', conclusion: 'failure', status: 'completed', updated_at: '2026-05-01T11:00:00Z' },
			{ name: 'Main skipped', head_branch: 'main', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T12:00:00Z' },
			{ name: 'Feature skipped', head_branch: 'feature/a', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-02T10:00:00Z' },
			{ name: 'Feature action', head_branch: 'feature/a', conclusion: 'action_required', status: 'completed', updated_at: '2026-05-02T11:00:00Z' },
			{ name: 'Feature running', head_branch: 'feature/a', status: 'in_progress', updated_at: '2026-05-02T12:00:00Z' },
		],
		closedIssues: [],
		openIssuesCount: 0,
		openPullRequestsCount: 0,
		commits: [],
	});
	const alerts = viewModel.mainFailureAlerts;

	assert.strictEqual(alerts.length, 1);
	assert.strictEqual(alerts[0].name, 'Main failure');
	assert.strictEqual(alerts[0].statusLabel, 'failure');
}

async function testSkippedRunInsights() {
	const viewModel = buildDashboardViewModel({
		repo: {},
		workflowRuns: [
			{ name: 'CI', head_branch: 'main', head_sha: 'abcdef123456', conclusion: 'success', status: 'completed', updated_at: '2026-05-01T10:00:00Z' },
			{
				name: 'API Proposal Version Check',
				head_branch: 'main',
				head_sha: 'abcdef123456',
				conclusion: 'skipped',
				status: 'completed',
				event: 'issue_comment',
				path: '.github/workflows/api-proposal-version-check.yml',
				updated_at: '2026-05-01T11:00:00Z',
				html_url: 'https://github.com/microsoft/vscode/actions/runs/1',
			},
			{ name: 'Compile', head_branch: 'main', head_sha: '123456abcdef', conclusion: 'failure', status: 'completed', updated_at: '2026-05-01T11:30:00Z' },
			{ name: 'Docs', head_branch: 'main', head_sha: '123456abcdef', conclusion: 'skipped', status: 'completed', event: 'push', updated_at: '2026-05-01T11:40:00Z' },
			{ name: 'Cancelled', head_branch: 'main', conclusion: 'cancelled', status: 'completed', updated_at: '2026-05-01T12:00:00Z' },
		],
		closedIssues: [],
		openIssuesCount: 0,
		openPullRequestsCount: 0,
		commits: [],
	});
	const skippedRuns = viewModel.skippedRunInsights;

	assert.strictEqual(skippedRuns.length, 2);
	assert.strictEqual(skippedRuns[0].name, 'Docs');
	assert.strictEqual(skippedRuns[0].reasonKind, 'sameCommitFailure');
	assert.deepStrictEqual(skippedRuns[0].sameCommitFailures, ['Compile']);
	assert.strictEqual(skippedRuns[1].name, 'API Proposal Version Check');
	assert.strictEqual(skippedRuns[1].event, 'issue_comment');
	assert.strictEqual(skippedRuns[1].workflowPath, '.github/workflows/api-proposal-version-check.yml');
	assert.strictEqual(skippedRuns[1].branch, 'main');
	assert.strictEqual(skippedRuns[1].commit, 'abcdef1');
	assert.strictEqual(skippedRuns[1].url, 'https://github.com/microsoft/vscode/actions/runs/1');
	assert.strictEqual(skippedRuns[1].reasonKind, 'configOrEvent');
	assert.strictEqual(skippedRuns[1].sameCommitSuccessCount, 1);
}

async function testConfigSkippedRunsDoNotLowerHealthScore() {
	const viewModel = buildDashboardViewModel({
		repo: {},
		workflowRuns: [
			{
				name: 'CI',
				head_branch: 'main',
				head_sha: 'abcdef123456',
				conclusion: 'success',
				status: 'completed',
				run_started_at: '2026-05-01T10:00:00Z',
				updated_at: '2026-05-01T10:00:10Z',
			},
			{
				name: 'Docs',
				head_branch: 'main',
				head_sha: 'abcdef123456',
				conclusion: 'skipped',
				status: 'completed',
				run_started_at: '2026-05-01T10:00:00Z',
				updated_at: '2026-05-01T10:00:00Z',
			},
		],
		closedIssues: [],
		openIssuesCount: 0,
		openPullRequestsCount: 0,
		commits: [],
	});

	assert.strictEqual(viewModel.skippedRunInsights[0].reasonKind, 'configOrEvent');
	assert.strictEqual(viewModel.metrics.successRate, 50);
	assert.strictEqual(viewModel.metrics.healthScore, 97);
}
