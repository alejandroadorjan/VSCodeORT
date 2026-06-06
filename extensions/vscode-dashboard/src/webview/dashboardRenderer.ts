/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { DashboardViewModel } from '../model/dashboard';

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

	return model.runInsights.map((run) => {
		const runLink = run.url ? `<a class="run-link" href="${run.url}">${vscode.l10n.t('Open run')}</a>` : '';
		const duration = run.hasDuration ? run.duration : vscode.l10n.t('Duration unavailable');
		const details = [
			run.branch ? vscode.l10n.t('branch {0}', run.branch) : '',
			run.commit ? vscode.l10n.t('commit {0}', run.commit) : '',
			duration,
		].filter(Boolean).join(' · ');

		return `
			<div class="run-insight">
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
		.replace(/__changeFailureRate__/g, String(metrics.changeFailureRate))
		.replace(/__mttr__/g, String(metrics.mttrMinutes))
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
		.replace(/__runDiagnosticsHtml__/g, renderRunDiagnostics(model))
		.replace(/__runInsightsHtml__/g, renderRunInsights(model))
		.replace(/__mainAlertsHtml__/g, renderMainAlerts(model));
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
		['mean of (updated_at − run_started_at) for all runs with a conclusion.', vscode.l10n.t('mean of (updated_at − run_started_at) for all runs with a conclusion.')],
		['Runs tracked', vscode.l10n.t('Runs tracked')],
		['Pipeline overview', vscode.l10n.t('Pipeline overview')],
		['Project health', vscode.l10n.t('Project health')],
		['Pipeline stability', vscode.l10n.t('Pipeline stability')],
		['Pipeline stability (65% weight)', vscode.l10n.t('Pipeline stability (65% weight)')],
		['Based on the success rate of the last 100 workflow runs.', vscode.l10n.t('Based on the success rate of the last 100 workflow runs.')],
		['Higher success rate = higher stability score.', vscode.l10n.t('Higher success rate = higher stability score.')],
		['Build speed', vscode.l10n.t('Build speed')],
		['Build speed (35% weight)', vscode.l10n.t('Build speed (35% weight)')],
		['Measures how fast your builds are, capped at 180s for scoring purposes.', vscode.l10n.t('Measures how fast your builds are, capped at 180s for scoring purposes.')],
		['Recent run diagnosis', vscode.l10n.t('Recent run diagnosis')],
		['Each tile is one recent workflow run. Use status, commit, duration, and the GitHub link to jump to the exact run when something needs attention.', vscode.l10n.t('Each tile is one recent workflow run. Use status, commit, duration, and the GitHub link to jump to the exact run when something needs attention.')],
		['Runs needing attention', vscode.l10n.t('Runs needing attention')],
		['DORA metrics &amp; run detail', vscode.l10n.t('DORA metrics & run detail')],
		['DORA metrics', vscode.l10n.t('DORA metrics')],
		['Deployment frequency', vscode.l10n.t('Deployment frequency')],
		['successful runs / week', vscode.l10n.t('successful runs / week')],
		['Successful runs in the last 30 days divided by 4 weeks.', vscode.l10n.t('Successful runs in the last 30 days divided by 4 weeks.')],
		['Lead time', vscode.l10n.t('Lead time')],
		['commit → production', vscode.l10n.t('commit → production')],
		['Estimated time from commit to production. Static approximation (~2.1 days) — requires deeper commit/deploy tracking for real data.', vscode.l10n.t('Estimated time from commit to production. Static approximation (~2.1 days) — requires deeper commit/deploy tracking for real data.')],
		['MTTR — Mean Time To Recovery', vscode.l10n.t('MTTR — Mean Time To Recovery')],
		['failure → next success', vscode.l10n.t('failure → next success')],
		['Average minutes from a failed run\'s end to the next successful run\'s start.', vscode.l10n.t('Average minutes from a failed run\'s end to the next successful run\'s start.')],
		['Change failure rate', vscode.l10n.t('Change failure rate')],
		['failed / total runs', vscode.l10n.t('failed / total runs')],
		['Percentage of workflow runs that ended in failure.', vscode.l10n.t('Percentage of workflow runs that ended in failure.')],
		['Recent workflow runs', vscode.l10n.t('Recent workflow runs')],
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
		['Repository signals', vscode.l10n.t('Repository signals')],
		['Forks', vscode.l10n.t('Forks')],
		['Watchers', vscode.l10n.t('Watchers')],
		['Active devs (10 commits)', vscode.l10n.t('Active devs (10 commits)')],
		['Main branch alerts', vscode.l10n.t('Main branch alerts')],
		['Recent failed workflow runs on main only. Skipped, cancelled, action required, and currently running workflows are intentionally excluded.', vscode.l10n.t('Recent failed workflow runs on main only. Skipped, cancelled, action required, and currently running workflows are intentionally excluded.')],
	]);

	let localizedHtml = html;
	for (const [source, localized] of replacements) {
		localizedHtml = localizedHtml.replaceAll(source, localized);
	}

	return localizedHtml;
}
