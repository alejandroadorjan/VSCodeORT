/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { DashboardViewModel } from '../model/dashboard';
import type { GitHubWorkflowRun } from '../model/github';
import { buildDashboardViewModel } from '../transformers/dashboardMetrics';

export async function runDashboardMetricsTests() {
	await testViewModelBuildsWorkflowConcentration();
	await testRecentRunsOrdering();
	await testRunOutcomePercentagesAddToOneHundred();
	await testMainFailureAlerts();
	await testRunsNeedingAttentionFiltersExpectedStatuses();
	await testSkippedRunInsights();
	await testSkippedRunInsightsInferMissingContextAndInconclusiveReasons();
	await testConfigSkippedRunsDoNotLowerHealthScore();
	await testNonConfigSkippedRunsLowerHealthScore();
	await testHealthScoreNormalizesDurationBeforeApplyingCap();
}

function buildViewModel(workflowRuns: GitHubWorkflowRun[]): DashboardViewModel {
	return buildDashboardViewModel({
		repo: {},
		workflowRuns,
		closedIssues: [],
		openIssuesCount: 0,
		openPullRequestsCount: 0,
		commits: [],
	});
}

async function testViewModelBuildsWorkflowConcentration() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{ name: 'CI', workflow_name: 'CI', conclusion: 'failure', run_started_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:10:00Z' },
		{ name: 'CI', workflow_name: 'CI', conclusion: 'success', run_started_at: '2026-05-01T11:00:00Z', updated_at: '2026-05-01T11:08:00Z' },
		{ name: 'Tests', workflow_name: 'Tests', conclusion: 'failure', run_started_at: '2026-05-01T12:00:00Z', updated_at: '2026-05-01T12:05:00Z' },
	];

	// Act
	const viewModel = buildDashboardViewModel({
		repo: { stargazers_count: 25, forks_count: 3, subscribers_count: 2, watchers_count: 4 },
		workflowRuns,
		closedIssues: [],
		openIssuesCount: 4,
		openPullRequestsCount: 2,
		commits: [{ author: { login: 'dev1' } }, { author: { login: 'dev2' } }, { author: { login: 'dev1' } }],
	});

	// Assert
	assert.deepStrictEqual({
		totalRuns: viewModel.metrics.totalRuns,
		failureCount: viewModel.metrics.failureCount,
		activeDevs: viewModel.metrics.activeDevs,
		topWorkflow: viewModel.workflowSeries[0].label,
		topWorkflowFailures: viewModel.workflowSeries[0].failure,
	}, {
		totalRuns: 3,
		failureCount: 2,
		activeDevs: 2,
		topWorkflow: 'CI',
		topWorkflowFailures: 1,
	});
}

async function testRecentRunsOrdering() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{ name: 'Old', conclusion: 'success', run_started_at: '2026-05-01T10:00:00Z', updated_at: '2026-05-01T10:01:00Z' },
		{ name: 'New', conclusion: 'failure', run_started_at: '2026-05-02T10:00:00Z', updated_at: '2026-05-02T10:01:00Z' },
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual(viewModel.recentRuns.map(run => run.name), ['New', 'Old']);
}

async function testRunOutcomePercentagesAddToOneHundred() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{ name: 'Success 1', conclusion: 'success', status: 'completed' },
		{ name: 'Success 2', conclusion: 'success', status: 'completed' },
		{ name: 'Failure', conclusion: 'failure', status: 'completed' },
		{ name: 'Skipped', conclusion: 'skipped', status: 'completed' },
		{ name: 'Action Required', conclusion: 'action_required', status: 'completed' },
		{ name: 'Running', status: 'in_progress' },
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);
	const metrics = viewModel.metrics;

	// Assert
	assert.deepStrictEqual({
		successCount: metrics.successCount,
		failureCount: metrics.failureCount,
		otherCount: metrics.otherCount,
		inProgressCount: metrics.inProgressCount,
		outcomePercentTotal: metrics.successRate + metrics.failedRate + metrics.otherRate + metrics.inProgressRate,
		runDiagnosticsCount: viewModel.runDiagnostics.length,
		nonSuccessDiagnosticsCount: viewModel.runDiagnostics.filter(run => run.statusLabel === 'action_required' || run.statusLabel === 'skipped').length,
	}, {
		successCount: 2,
		failureCount: 1,
		otherCount: 2,
		inProgressCount: 1,
		outcomePercentTotal: 100,
		runDiagnosticsCount: 6,
		nonSuccessDiagnosticsCount: 2,
	});
}

async function testMainFailureAlerts() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{ name: 'Main success', head_branch: 'main', conclusion: 'success', status: 'completed', updated_at: '2026-05-01T10:00:00Z' },
		{ name: 'Main failure', head_branch: 'main', conclusion: 'failure', status: 'completed', updated_at: '2026-05-01T11:00:00Z' },
		{ name: 'Main skipped', head_branch: 'main', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T12:00:00Z' },
		{ name: 'Feature skipped', head_branch: 'feature/a', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-02T10:00:00Z' },
		{ name: 'Feature action', head_branch: 'feature/a', conclusion: 'action_required', status: 'completed', updated_at: '2026-05-02T11:00:00Z' },
		{ name: 'Feature running', head_branch: 'feature/a', status: 'in_progress', updated_at: '2026-05-02T12:00:00Z' },
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual(viewModel.mainFailureAlerts.map(alert => ({
		name: alert.name,
		statusLabel: alert.statusLabel,
		commit: alert.commit,
	})), [{
		name: 'Main failure',
		statusLabel: 'failure',
		commit: '',
	}]);
}

async function testRunsNeedingAttentionFiltersExpectedStatuses() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{ name: 'Config sibling success', head_branch: 'main', head_sha: 'config-sha', conclusion: 'success', status: 'completed', updated_at: '2026-05-01T10:00:00Z' },
		{ name: 'Config skip', head_branch: 'main', head_sha: 'config-sha', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T11:00:00Z' },
		{ name: 'Lonely skip', head_branch: 'main', head_sha: 'lonely-sha', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T12:00:00Z' },
		{ name: 'Compile failure', head_branch: 'main', head_sha: 'failure-sha', conclusion: 'failure', status: 'completed', updated_at: '2026-05-01T13:00:00Z' },
		{ name: 'Skipped after failure', head_branch: 'main', head_sha: 'failure-sha', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T14:00:00Z' },
		{ name: 'Manual approval needed', head_branch: 'main', head_sha: 'approval-sha', conclusion: 'action_required', status: 'completed', updated_at: '2026-05-01T15:00:00Z' },
		{ name: 'Cancelled cleanup', head_branch: 'main', head_sha: 'cancel-sha', conclusion: 'cancelled', status: 'completed', updated_at: '2026-05-01T16:00:00Z' },
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual(viewModel.runInsights.map(run => ({
		name: run.name,
		statusLabel: run.statusLabel,
	})), [
		{
			name: 'Manual approval needed',
			statusLabel: 'action_required',
		},
		{
			name: 'Skipped after failure',
			statusLabel: 'skipped',
		},
		{
			name: 'Compile failure',
			statusLabel: 'failure',
		},
	]);
}

async function testSkippedRunInsights() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
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
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual(viewModel.skippedRunInsights.map(run => ({
		name: run.name,
		event: run.event,
		workflowPath: run.workflowPath,
		branch: run.branch,
		commit: run.commit,
		url: run.url,
		reasonKind: run.reasonKind,
		sameCommitFailures: run.sameCommitFailures,
		sameCommitRunCount: run.sameCommitRunCount,
		sameCommitSuccessCount: run.sameCommitSuccessCount,
	})), [
		{
			name: 'Docs',
			event: 'push',
			workflowPath: '',
			branch: 'main',
			commit: '123456a',
			url: '',
			reasonKind: 'sameCommitFailure',
			sameCommitFailures: ['Compile'],
			sameCommitRunCount: 1,
			sameCommitSuccessCount: 0,
		},
		{
			name: 'API Proposal Version Check',
			event: 'issue_comment',
			workflowPath: '.github/workflows/api-proposal-version-check.yml',
			branch: 'main',
			commit: 'abcdef1',
			url: 'https://github.com/microsoft/vscode/actions/runs/1',
			reasonKind: 'configOrEvent',
			sameCommitFailures: [],
			sameCommitRunCount: 1,
			sameCommitSuccessCount: 1,
		},
	]);
}

async function testSkippedRunInsightsInferMissingContextAndInconclusiveReasons() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{ name: 'Lonely skip', head_branch: 'main', head_sha: 'no-context', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T10:00:00Z' },
		{ name: 'Cancelled sibling', head_branch: 'main', head_sha: 'mixed-context', conclusion: 'cancelled', status: 'completed', updated_at: '2026-05-01T11:00:00Z' },
		{ name: 'Inconclusive skip', head_branch: 'main', head_sha: 'mixed-context', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T12:00:00Z' },
		{ name: 'Running sibling', head_branch: 'main', head_sha: 'running-context', status: 'in_progress', updated_at: '2026-05-01T13:00:00Z' },
		{ name: 'Waiting skip', head_branch: 'main', head_sha: 'running-context', conclusion: 'skipped', status: 'completed', updated_at: '2026-05-01T14:00:00Z' },
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual(viewModel.skippedRunInsights.map(run => ({
		name: run.name,
		reasonKind: run.reasonKind,
		sameCommitRunCount: run.sameCommitRunCount,
	})), [
		{
			name: 'Waiting skip',
			reasonKind: 'missingContext',
			sameCommitRunCount: 1,
		},
		{
			name: 'Inconclusive skip',
			reasonKind: 'inconclusive',
			sameCommitRunCount: 1,
		},
		{
			name: 'Lonely skip',
			reasonKind: 'missingContext',
			sameCommitRunCount: 0,
		},
	]);
}

async function testConfigSkippedRunsDoNotLowerHealthScore() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
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
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual({
		skipReason: viewModel.skippedRunInsights[0].reasonKind,
		visibleSuccessRate: viewModel.metrics.successRate,
		healthScore: viewModel.metrics.healthScore,
	}, {
		skipReason: 'configOrEvent',
		visibleSuccessRate: 50,
		healthScore: 98,
	});
}

async function testNonConfigSkippedRunsLowerHealthScore() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{
			name: 'Compile',
			head_branch: 'main',
			head_sha: 'abcdef123456',
			conclusion: 'failure',
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
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual({
		skipReason: viewModel.skippedRunInsights[0].reasonKind,
		visibleFailedRate: viewModel.metrics.failedRate,
		healthScore: viewModel.metrics.healthScore,
	}, {
		skipReason: 'sameCommitFailure',
		visibleFailedRate: 50,
		healthScore: 34,
	});
}

async function testHealthScoreNormalizesDurationBeforeApplyingCap() {
	// Arrange
	const workflowRuns: GitHubWorkflowRun[] = [
		{
			name: 'Slow success',
			head_branch: 'main',
			conclusion: 'success',
			status: 'completed',
			run_started_at: '2026-05-01T10:00:00Z',
			updated_at: '2026-05-01T10:05:00Z',
		},
	];

	// Act
	const viewModel = buildViewModel(workflowRuns);

	// Assert
	assert.deepStrictEqual({
		averageDurationSeconds: viewModel.metrics.averageDurationSeconds,
		successRate: viewModel.metrics.successRate,
		healthScore: viewModel.metrics.healthScore,
	}, {
		averageDurationSeconds: 300,
		successRate: 100,
		healthScore: 65,
	});
}
