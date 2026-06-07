/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { DashboardViewModel } from '../model/dashboard';

const RUN_INSIGHTS_PAGE_SIZE = 5;
const TOP_FAILING_WORKFLOWS_LIMIT = 6;

function renderIssueList(model: DashboardViewModel): string {
	if (model.issueCards.length === 0) {
		return `<li class="no-data">${vscode.l10n.t('No recent closed issues found.')}</li>`;
	}

	return model.issueCards.map((issue) => `
		<li>
			<span class="issue-title">
				<span class="issue-num">#${issue.number}</span>
				${issue.title}
			</span>
			<span class="issue-right">
				${issue.labels}
				<span class="issue-meta">${issue.closedDate}</span>
				${issue.closedBy ? `<span class="issue-meta">${vscode.l10n.t('by {0}', issue.closedBy)}</span>` : ''}
				${issue.commentCount ? `<span class="issue-comments">${issue.commentCount}</span>` : ''}
			</span>
		</li>`).join('');
}

function renderRecentRuns(model: DashboardViewModel): string {
	if (model.recentRuns.length === 0) {
		return `<div class="no-data">${vscode.l10n.t('No runs found.')}</div>`;
	}

	return model.recentRuns.map((run) => `
		<div class="run-item">
			<span class="status-dot ${run.dotClass}"></span>
			<span class="run-name">${run.name}${run.branch}</span>
			<span class="run-dur">${run.duration}</span>
			<span class="badge ${run.badgeClass}">${localizeRunStatus(run.statusLabel)}</span>
		</div>`).join('');
}

function renderRunInsights(model: DashboardViewModel): string {
	if (model.runInsights.length === 0) {
		return `<div class="no-data">${vscode.l10n.t('No recent runs need attention.')}</div>`;
	}

	return model.runInsights.map((run, index) => {
		const page = Math.floor(index / RUN_INSIGHTS_PAGE_SIZE);
		const runLink = run.url ? `<a class="run-link" href="${run.url}">${vscode.l10n.t('Open run')}</a>` : '';
		const duration = run.hasDuration ? run.duration : vscode.l10n.t('Duration unavailable');
		const details = [
			run.branch ? vscode.l10n.t('branch {0}', run.branch) : '',
			run.commit ? vscode.l10n.t('commit {0}', run.commit) : '',
			duration,
		].filter(Boolean).join(' · ');

		return `
			<div class="run-insight ${page > 0 ? 'hidden' : ''}" data-page="${page}">
				<span class="status-dot ${run.dotClass}"></span>
				<div class="run-insight-main">
					<div class="run-insight-title">${run.name}</div>
					<div class="run-insight-meta">${details}</div>
				</div>
				<span class="badge ${run.badgeClass}">${localizeRunStatus(run.statusLabel)}</span>
				${runLink}
			</div>`;
	}).join('');
}

function renderRunInsightsPager(model: DashboardViewModel): string {
	if (model.runInsights.length <= RUN_INSIGHTS_PAGE_SIZE) {
		return '';
	}

	const pageCount = Math.ceil(model.runInsights.length / RUN_INSIGHTS_PAGE_SIZE);
	return `
		<div class="run-insights-pager" id="runInsightsPager" data-page-size="${RUN_INSIGHTS_PAGE_SIZE}" data-page-count="${pageCount}">
			<button class="pager-button" id="runInsightsPrev" type="button" aria-label="${vscode.l10n.t('Previous page')}">‹</button>
			<span class="pager-status" id="runInsightsPageStatus">${vscode.l10n.t('Page {0} of {1}', 1, pageCount)}</span>
			<button class="pager-button" id="runInsightsNext" type="button" aria-label="${vscode.l10n.t('Next page')}">›</button>
		</div>`;
}

function renderTopFailingWorkflows(model: DashboardViewModel): string {
	const failingWorkflows = model.workflowSeries
		.filter(workflow => workflow.failure > 0)
		.slice(0, TOP_FAILING_WORKFLOWS_LIMIT);

	if (failingWorkflows.length === 0) {
		return `<div class="no-data">${vscode.l10n.t('No failing workflows found in the current sample.')}</div>`;
	}

	const maxFailures = Math.max(...failingWorkflows.map(workflow => workflow.failure));
	return failingWorkflows.map((workflow, index) => {
		const width = Math.max(6, Math.round((workflow.failure / maxFailures) * 100));
		const detailsId = `workflowFailures${index}`;
		return `
			<div class="workflow-failure-row">
				<div class="workflow-failure-summary">
					<div class="workflow-failure-name">${workflow.label}</div>
					<div class="workflow-failure-actions">
						<span class="workflow-failure-count">${vscode.l10n.t('{0} failed', workflow.failure)}</span>
						<button class="workflow-failure-toggle" type="button" aria-expanded="false" aria-controls="${detailsId}" data-collapsed="${vscode.l10n.t('View failures')}" data-expanded="${vscode.l10n.t('Hide failures')}">${vscode.l10n.t('View failures')}</button>
					</div>
				</div>
				<div class="workflow-failure-bar" aria-hidden="true">
					<span class="workflow-failure-fill" style="--failure-width: ${width}%"></span>
				</div>
				<div class="workflow-failure-details hidden" id="${detailsId}">
					${renderWorkflowFailureRuns(workflow)}
				</div>
			</div>`;
	}).join('');
}

function renderWorkflowFailureRuns(workflow: DashboardViewModel['workflowSeries'][number]): string {
	if (workflow.failures.length === 0) {
		return `<div class="no-data">${vscode.l10n.t('No direct run links available.')}</div>`;
	}

	return workflow.failures.map(failure => {
		const runLink = failure.url ? `<a class="run-link" href="${failure.url}">${vscode.l10n.t('Open run')}</a>` : '';
		const details = [
			failure.date,
			failure.branch ? vscode.l10n.t('branch {0}', failure.branch) : '',
			failure.commit ? vscode.l10n.t('commit {0}', failure.commit) : '',
			failure.duration || vscode.l10n.t('Duration unavailable'),
		].filter(Boolean).join(' · ');

		return `
			<div class="workflow-failure-run">
				<div class="workflow-failure-run-main">
					<div class="workflow-failure-run-title">${failure.title}</div>
					<div class="workflow-failure-run-meta">${details}</div>
				</div>
				${runLink}
			</div>`;
	}).join('');
}

function renderRunDiagnostics(model: DashboardViewModel): string {
	if (model.runDiagnostics.length === 0) {
		return `<div class="no-data">${vscode.l10n.t('No recent workflow runs found.')}</div>`;
	}

	return model.runDiagnostics.map((run) => {
		const runLink = run.url ? `<a class="diagnostic-link" href="${run.url}">${vscode.l10n.t('Open')}</a>` : '';
		const duration = run.hasDuration ? run.duration : vscode.l10n.t('No duration');
		const branch = run.branch || vscode.l10n.t('no branch');
		const commit = run.commit || vscode.l10n.t('no commit');

		return `
			<div class="diagnostic-tile ${run.dotClass}">
				<div class="diagnostic-top">
					<span class="status-dot ${run.dotClass}"></span>
					<span class="badge ${run.badgeClass}">${localizeRunStatus(run.statusLabel)}</span>
				</div>
				<div class="diagnostic-name">${run.name}</div>
				<div class="diagnostic-meta">${branch} · ${commit}</div>
				<div class="diagnostic-bottom">
					<span>${duration}</span>
					${runLink}
				</div>
			</div>`;
	}).join('');
}

function renderMainAlerts(model: DashboardViewModel): string {
	if (model.mainFailureAlerts.length === 0) {
		return `
			<div class="main-alert-clear">
				<span class="status-dot green"></span>
				<span>${vscode.l10n.t('No recent failed runs found on main.')}</span>
			</div>`;
	}

	return model.mainFailureAlerts.map((run) => {
		const runLink = run.url ? `<a class="run-link" href="${run.url}">${vscode.l10n.t('Open run')}</a>` : '';
		const commit = run.commit || vscode.l10n.t('no commit');

		return `
			<div class="main-alert">
				<span class="status-dot ${run.dotClass}"></span>
				<div class="main-alert-main">
					<div class="main-alert-title">${run.name}</div>
					<div class="main-alert-meta">${vscode.l10n.t('{0} · commit {1} · {2}', run.date, commit, run.duration)}</div>
				</div>
				<span class="badge ${run.badgeClass}">${localizeRunStatus(run.statusLabel)}</span>
				${runLink}
			</div>`;
	}).join('');
}

function renderSkippedRuns(model: DashboardViewModel): string {
	if (model.skippedRunInsights.length === 0) {
		return `<div class="no-data">${vscode.l10n.t('No recent skipped runs found.')}</div>`;
	}

	return model.skippedRunInsights.map((run) => {
		const runLink = run.url ? `<a class="run-link" href="${run.url}">${vscode.l10n.t('Open run')}</a>` : '';
		const commit = run.commit || vscode.l10n.t('no commit');
		const event = run.event || vscode.l10n.t('unknown event');
		const workflowPath = run.workflowPath || vscode.l10n.t('unknown workflow file');
		const branch = run.branch || vscode.l10n.t('unknown branch');
		const reason = getSkippedRunReason(run);

		return `
			<div class="skipped-run">
				<span class="status-dot amber"></span>
				<div class="skipped-run-main">
					<div class="skipped-run-title">${run.name}</div>
					<div class="skipped-run-reason">${reason.label}</div>
					<div class="skipped-run-evidence">${reason.evidence}</div>
					<div class="skipped-run-meta">${vscode.l10n.t('{0} · {1} · {2}', event, branch, commit)}</div>
					<div class="skipped-run-path">${workflowPath}</div>
				</div>
				<span class="skipped-run-date">${run.date}</span>
				${runLink}
			</div>`;
	}).join('');
}

function getSkippedRunReason(run: DashboardViewModel['skippedRunInsights'][number]): { label: string; evidence: string } {
	switch (run.reasonKind) {
		case 'sameCommitFailure':
			return {
				label: vscode.l10n.t('Likely related to failing workflows on the same commit'),
				evidence: vscode.l10n.t('{0} failed on this commit: {1}', run.sameCommitFailures.length, run.sameCommitFailures.join(', ')),
			};
		case 'configOrEvent':
			return {
				label: vscode.l10n.t('Likely skipped by workflow configuration or event filters'),
				evidence: vscode.l10n.t('{0} other workflow runs succeeded on this same commit.', run.sameCommitSuccessCount),
			};
		case 'missingContext':
			return {
				label: vscode.l10n.t('Not enough same-commit context'),
				evidence: vscode.l10n.t('{0} comparable workflow runs found for this commit.', run.sameCommitRunCount),
			};
		case 'inconclusive':
			return {
				label: vscode.l10n.t('Skip cause is inconclusive'),
				evidence: vscode.l10n.t('{0} comparable workflow runs found, but none clearly explains the skip.', run.sameCommitRunCount),
			};
	}
}

function localizeRunStatus(status: string): string {
	switch (status) {
		case 'success':
			return vscode.l10n.t('success');
		case 'failure':
			return vscode.l10n.t('failure');
		case 'cancelled':
			return vscode.l10n.t('cancelled');
		case 'in_progress':
			return vscode.l10n.t('in progress');
		case 'unknown':
			return vscode.l10n.t('unknown');
		default:
			return status;
	}
}

function renderMetricPlaceholders(html: string, model: DashboardViewModel): string {
	const metrics = model.metrics;
	const formatSeconds = (seconds: number): string => seconds >= 60 ? vscode.l10n.t('{0}m {1}s', Math.floor(seconds / 60), seconds % 60) : vscode.l10n.t('{0}s', seconds);

	return html
		.replace(/__dashboardText__/g, JSON.stringify({
			runsDetail: vscode.l10n.t('{0} ok · {1} failed'),
			fast: vscode.l10n.t('Fast'),
			moderate: vscode.l10n.t('Moderate'),
			slow: vscode.l10n.t('Slow'),
			excellent: vscode.l10n.t('Excellent'),
			fair: vscode.l10n.t('Fair'),
			atRisk: vscode.l10n.t('At risk'),
			noData: vscode.l10n.t('No data'),
			elite: vscode.l10n.t('Elite'),
			high: vscode.l10n.t('High'),
			medium: vscode.l10n.t('Medium'),
			low: vscode.l10n.t('Low'),
			notAvailable: vscode.l10n.t('N/A'),
			success: vscode.l10n.t('Success'),
			failed: vscode.l10n.t('Failed'),
			other: vscode.l10n.t('Skipped / other'),
			inProgress: vscode.l10n.t('In progress'),
		}))
		.replace(/__stars__/g, String(metrics.stars.toLocaleString()))
		.replace(/__openIssues__/g, String(metrics.openIssuesCount.toLocaleString()))
		.replace(/__openPRs__/g, String(metrics.openPullRequestsCount.toLocaleString()))
		.replace(/__forks__/g, String(metrics.forks.toLocaleString()))
		.replace(/__watchers__/g, String(metrics.watchers.toLocaleString()))
		.replace(/__successRate__/g, String(metrics.successRate))
		.replace(/__avgDuration__/g, String(metrics.averageDurationSeconds))
		.replace(/__totalRuns__/g, String(metrics.totalRuns))
		.replace(/__healthScore__/g, String(metrics.healthScore))
		.replace(/__healthColor__/g, metrics.healthColor)
		.replace(/__deploymentFrequency__/g, String(metrics.deploymentFrequency))
		.replace(/__releaseFrequency__/g, String(metrics.deploymentFrequency))
		.replace(/__leadTimeDays__/g, String(metrics.averageLeadTimeDays))
		.replace(/__changeFailureRate__/g, String(metrics.changeFailureRate))
		.replace(/__mttr__/g, String(metrics.mttrMinutes))
		.replace(/__ciFailureRate__/g, String(metrics.ciFailureRate))
		.replace(/__timeToFeedback__/g, formatSeconds(metrics.timeToFeedbackSeconds))
		.replace(/__failureConcentration__/g, String(metrics.failureConcentrationRate))
		.replace(/__ciRecoveryTime__/g, String(metrics.ciRecoveryTimeMinutes))
		.replace(/__mostFailingWorkflow__/g, metrics.mostFailingWorkflow)
		.replace(/__leadTimeAverage__/g, String(metrics.averageLeadTimeDays))
		.replace(/__leadTimeMedian__/g, String(metrics.medianLeadTimeDays))
		.replace(/__postReleaseCorrectionRate__/g, String(metrics.postReleaseCorrectionRate))
		.replace(/__success__/g, String(metrics.successCount.toLocaleString()))
		.replace(/__failed__/g, String(metrics.failureCount.toLocaleString()))
		.replace(/__cancelled__/g, String(metrics.cancelledCount.toLocaleString()))
		.replace(/__inProgress__/g, String(metrics.inProgressCount.toLocaleString()))
		.replace(/__other__/g, String(metrics.otherCount.toLocaleString()))
		.replace(/__successPercent__/g, String(metrics.successRate))
		.replace(/__failedPercent__/g, String(metrics.failedRate))
		.replace(/__inProgressPercent__/g, String(metrics.inProgressRate))
		.replace(/__otherPercent__/g, String(metrics.otherRate))
		.replace(/__activeDevs__/g, String(metrics.activeDevs))
		.replace(/__resolvedIssues__/g, renderIssueList(model))
		.replace(/__recentRunsHtml__/g, renderRecentRuns(model))
		.replace(/__topFailingWorkflowsHtml__/g, renderTopFailingWorkflows(model))
		.replace(/__runDiagnosticsHtml__/g, renderRunDiagnostics(model))
		.replace(/__runInsightsHtml__/g, renderRunInsights(model))
		.replace(/__runInsightsPager__/g, renderRunInsightsPager(model))
		.replace(/__runInsightsToggle__/g, renderRunInsightsPager(model))
		.replace(/__mainAlertsHtml__/g, renderMainAlerts(model))
		.replace(/__skippedRunsHtml__/g, renderSkippedRuns(model));
}

export function renderDashboardHtml(context: vscode.ExtensionContext, webview: vscode.Webview, model: DashboardViewModel): string {
	const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'dashboard.html');
	const scriptPath = path.join(context.extensionPath, 'src', 'webview', 'dashboard.js');
	const stylesUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview', 'styles.css')));
	const scriptSource = fs.readFileSync(scriptPath, 'utf8');
	const webviewHtml = fs.readFileSync(htmlPath, 'utf8')
		.replace(/__styles__/g, String(stylesUri))
		.replace(/__script__/g, scriptSource);

	return renderMetricPlaceholders(localizeDashboardHtml(webviewHtml), model);
}

function localizeDashboardHtml(html: string): string {
	const replacements = new Map<string, string>([
		['Engineering Dashboard', vscode.l10n.t('Engineering Dashboard')],
		['public', vscode.l10n.t('public')],
		['Code editing. Redefined.', vscode.l10n.t('Code editing. Redefined.')],
		['running', vscode.l10n.t('running')],
		['Refreshed', vscode.l10n.t('Refreshed')],
		['Stars', vscode.l10n.t('Stars')],
		['popular', vscode.l10n.t('popular')],
		['Open issues', vscode.l10n.t('Open issues')],
		['real issues only', vscode.l10n.t('real issues only')],
		['Open PRs', vscode.l10n.t('Open PRs')],
		['in review', vscode.l10n.t('in review')],
		['Info', vscode.l10n.t('Info')],
		['Success rate', vscode.l10n.t('Success rate')],
		['Percentage of completed workflow runs (last 100) where', vscode.l10n.t('Percentage of completed workflow runs (last 100) where')],
		['Formula:', vscode.l10n.t('Formula:')],
		['successful runs ÷ total completed runs × 100', vscode.l10n.t('successful runs ÷ total completed runs × 100')],
		['Avg build time', vscode.l10n.t('Avg build time')],
		['Average duration of completed workflow runs.', vscode.l10n.t('Average duration of completed workflow runs.')],
		['mean of (updated_at - run_started_at) for all runs with a conclusion.', vscode.l10n.t('mean of (updated_at - run_started_at) for all runs with a conclusion.')],
		['Runs tracked', vscode.l10n.t('Runs tracked')],
		['Pipeline overview', vscode.l10n.t('Pipeline overview')],
		['Workflow Health', vscode.l10n.t('Workflow Health')],
		['Workflow reliability', vscode.l10n.t('Workflow reliability')],
		['Workflow reliability (65% weight)', vscode.l10n.t('Workflow reliability (65% weight)')],
		['Based on the success rate of the last 100 workflow runs.', vscode.l10n.t('Based on the success rate of the last 100 workflow runs.')],
		['Higher success rate = higher stability score.', vscode.l10n.t('Higher success rate = higher stability score.')],
		['Build speed', vscode.l10n.t('Build speed')],
		['Build speed (35% weight)', vscode.l10n.t('Build speed (35% weight)')],
		['Measures how fast your builds are, capped at 180s for scoring purposes.', vscode.l10n.t('Measures how fast your builds are, capped at 180s for scoring purposes.')],
		['65% Reliability + 35% Build Speed', vscode.l10n.t('65% Reliability + 35% Build Speed')],
		['Recent run diagnosis', vscode.l10n.t('Recent run diagnosis')],
		['Each tile is one recent workflow run. Use status, commit, duration, and the GitHub link to jump to the exact run when something needs attention.', vscode.l10n.t('Each tile is one recent workflow run. Use status, commit, duration, and the GitHub link to jump to the exact run when something needs attention.')],
		['Runs needing attention', vscode.l10n.t('Runs needing attention')],
		['CI/CD &amp; release metrics', vscode.l10n.t('CI/CD & release metrics')],
		['CI/CD Observability', vscode.l10n.t('CI/CD Observability')],
		['GitHub Actions failures are CI failures, not production failures.', vscode.l10n.t('GitHub Actions failures are CI failures, not production failures.')],
		['CI Failure Rate', vscode.l10n.t('CI Failure Rate')],
		['Failed workflow runs divided by completed workflow runs.', vscode.l10n.t('Failed workflow runs divided by completed workflow runs.')],
		['failed_completed_runs ÷ completed_runs × 100', vscode.l10n.t('failed_completed_runs ÷ completed_runs × 100')],
		['workflow failures / completed runs', vscode.l10n.t('workflow failures / completed runs')],
		['Time to Feedback', vscode.l10n.t('Time to Feedback')],
		['Average time from workflow creation/start to completion for completed workflow runs.', vscode.l10n.t('Average time from workflow creation/start to completion for completed workflow runs.')],
		['mean(completed_at - created_at)', vscode.l10n.t('mean(completed_at - created_at)')],
		['average workflow duration', vscode.l10n.t('average workflow duration')],
		['Failure Concentration', vscode.l10n.t('Failure Concentration')],
		['Share of all CI failures caused by the most failing workflow.', vscode.l10n.t('Share of all CI failures caused by the most failing workflow.')],
		['top_workflow_failures ÷ total_failures × 100', vscode.l10n.t('top_workflow_failures ÷ total_failures × 100')],
		['top failing workflow: __mostFailingWorkflow__', vscode.l10n.t('top failing workflow: {0}', '__mostFailingWorkflow__')],
		['CI Recovery Time', vscode.l10n.t('CI Recovery Time')],
		['Average time between a failed workflow run and the next successful run of the same workflow.', vscode.l10n.t('Average time between a failed workflow run and the next successful run of the same workflow.')],
		['failure → next same-workflow success', vscode.l10n.t('failure → next same-workflow success')],
		['Release &amp; DORA-inspired', vscode.l10n.t('Release & DORA-inspired')],
		['DORA-inspired, not strict DORA. Based on releases/tags, not production deployment telemetry.', vscode.l10n.t('DORA-inspired, not strict DORA. Based on releases/tags, not production deployment telemetry.')],
		['Release Frequency', vscode.l10n.t('Release Frequency')],
		['This approximates Deployment Frequency using GitHub Releases or versioned tags. It does not use merges to main because main is CI integration for VS Code.', vscode.l10n.t('This approximates Deployment Frequency using GitHub Releases or versioned tags. It does not use merges to main because main is CI integration for VS Code.')],
		['releases_in_window ÷ weeks_in_window', vscode.l10n.t('releases_in_window ÷ weeks_in_window')],
		['versioned releases / week', vscode.l10n.t('versioned releases / week')],
		['Lead Time for Changes Proxy', vscode.l10n.t('Lead Time for Changes Proxy')],
		['Approximates time from when a commit enters the repository until it is included in a release/tag. It does not guarantee real production deployment.', vscode.l10n.t('Approximates time from when a commit enters the repository until it is included in a release/tag. It does not guarantee real production deployment.')],
		['mean(release_date - commit_date) for commits between previousTag..currentTag', vscode.l10n.t('mean(release_date - commit_date) for commits between previousTag..currentTag')],
		['Lead Time Proxy', vscode.l10n.t('Lead Time Proxy')],
		['avg __leadTimeAverage__d · median __leadTimeMedian__d', vscode.l10n.t('avg {0}d · median {1}d', '__leadTimeAverage__', '__leadTimeMedian__')],
		['Post-release Correction Rate', vscode.l10n.t('Post-release Correction Rate')],
		['Proxy for Change Failure Rate. It does not prove a release caused a production failure; it only detects nearby patch releases after stable releases.', vscode.l10n.t('Proxy for Change Failure Rate. It does not prove a release caused a production failure; it only detects nearby patch releases after stable releases.')],
		['stable_releases_with_patch_within_7d ÷ stable_releases × 100', vscode.l10n.t('stable_releases_with_patch_within_7d ÷ stable_releases × 100')],
		['nearby patch releases', vscode.l10n.t('nearby patch releases')],
		['Service Recovery Time Proxy', vscode.l10n.t('Service Recovery Time Proxy')],
		['This requires public incident start and resolution timestamps. GitHub Actions is not a valid production recovery source.', vscode.l10n.t('This requires public incident start and resolution timestamps. GitHub Actions is not a valid production recovery source.')],
		['requires incident source', vscode.l10n.t('requires incident source')],
		['Not available', vscode.l10n.t('Not available')],
		['N/A', vscode.l10n.t('N/A')],
		['CI', vscode.l10n.t('CI')],
		['Recent workflow runs', vscode.l10n.t('Recent workflow runs')],
		['Top failing workflows', vscode.l10n.t('Top failing workflows')],
		['Most frequent workflow failures in the current GitHub Actions sample.', vscode.l10n.t('Most frequent workflow failures in the current GitHub Actions sample.')],
		['Run outcomes', vscode.l10n.t('Run outcomes')],
		['Scope: latest __totalRuns__ workflow runs returned by GitHub Actions across all branches; this is not a fixed time window.', vscode.l10n.t('Scope: latest {0} workflow runs returned by GitHub Actions across all branches; this is not a fixed time window.', '__totalRuns__')],
		['__success__ runs', vscode.l10n.t('{0} runs', '__success__')],
		['__failed__ runs', vscode.l10n.t('{0} runs', '__failed__')],
		['__other__ runs', vscode.l10n.t('{0} runs', '__other__')],
		['__inProgress__ runs', vscode.l10n.t('{0} runs', '__inProgress__')],
		['Success', vscode.l10n.t('Success')],
		['Failed', vscode.l10n.t('Failed')],
		['Skipped / other', vscode.l10n.t('Skipped / other')],
		['Skipped, cancelled, action required, neutral, timed out, stale, and other non-success/failure outcomes', vscode.l10n.t('Skipped, cancelled, action required, neutral, timed out, stale, and other non-success/failure outcomes')],
		['In progress', vscode.l10n.t('In progress')],
		['Recently closed issues', vscode.l10n.t('Recently closed issues')],
		['Source: GitHub Issues API · excludes PRs', vscode.l10n.t('Source: GitHub Issues API · excludes PRs')],
		['Issues &amp; repository signals', vscode.l10n.t('Issues & repository signals')],
		['Issues &amp; workflow signals', vscode.l10n.t('Issues & workflow signals')],
		['Repository signals', vscode.l10n.t('Repository signals')],
		['Forks', vscode.l10n.t('Forks')],
		['Watchers', vscode.l10n.t('Watchers')],
		['Active devs (10 commits)', vscode.l10n.t('Active devs (10 commits)')],
		['Main branch alerts', vscode.l10n.t('Main branch alerts')],
		['Recent failed workflow runs on main only. Skipped, cancelled, action required, and currently running workflows are intentionally excluded.', vscode.l10n.t('Recent failed workflow runs on main only. Skipped, cancelled, action required, and currently running workflows are intentionally excluded.')],
		['Skipped run diagnostics', vscode.l10n.t('Skipped run diagnostics')],
		['Probable causes inferred from other workflow runs on the same commit. GitHub does not expose a single skip reason in workflow run data.', vscode.l10n.t('Probable causes inferred from other workflow runs on the same commit. GitHub does not expose a single skip reason in workflow run data.')],
	]);

	let localizedHtml = html;
	for (const [source, localized] of replacements) {
		localizedHtml = localizedHtml.replaceAll(source, localized);
	}

	return localizedHtml;
}
