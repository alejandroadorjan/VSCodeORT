/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { buildDashboardViewModel } from '../transformers/dashboardMetrics';

export async function runDashboardMetricsTests() {
	await testViewModelBuildsWorkflowConcentration();
	await testRecentRunsOrdering();
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
