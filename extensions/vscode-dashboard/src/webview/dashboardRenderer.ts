import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { DashboardViewModel } from '../model/dashboard';

function renderIssueList(model: DashboardViewModel): string {
	if (model.issueCards.length === 0) {
		return '<li class="no-data">No recent closed issues found.</li>';
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
				${issue.closedBy ? `<span class="issue-meta">${issue.closedBy}</span>` : ''}
				${issue.commentCount ? `<span class="issue-comments">${issue.commentCount}</span>` : ''}
			</span>
		</li>`).join('');
}

function renderRecentRuns(model: DashboardViewModel): string {
	if (model.recentRuns.length === 0) {
		return '<div class="no-data">No runs found.</div>';
	}

	return model.recentRuns.map((run) => `
		<div class="run-item">
			<span class="status-dot ${run.dotClass}"></span>
			<span class="run-name">${run.name}${run.branch}</span>
			<span class="run-dur">${run.duration}</span>
			<span class="badge ${run.badgeClass}">${run.statusLabel}</span>
		</div>`).join('');
}

function renderMetricPlaceholders(html: string, model: DashboardViewModel): string {
	const metrics = model.metrics;

	return html
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
		.replace(/__successPercent__/g, String(metrics.successRate))
		.replace(/__failedPercent__/g, String(metrics.failedRate))
		.replace(/__activeDevs__/g, String(metrics.activeDevs))
		.replace(/__resolvedIssues__/g, renderIssueList(model))
		.replace(/__recentRunsHtml__/g, renderRecentRuns(model))
		.replace(/__chartLabels__/g, JSON.stringify(model.chartLabels))
		.replace(/__chartSuccess__/g, JSON.stringify(model.chartSuccess))
		.replace(/__chartFailed__/g, JSON.stringify(model.chartFailure))
		.replace(/__chartDur__/g, JSON.stringify(model.chartDuration));
}

export function renderDashboardHtml(context: vscode.ExtensionContext, webview: vscode.Webview, model: DashboardViewModel): string {
	const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'dashboard.html');
	const stylesUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview', 'styles.css')));
	const webviewHtml = fs.readFileSync(htmlPath, 'utf8').replace(/__styles__/g, String(stylesUri));

	return renderMetricPlaceholders(webviewHtml, model);
}
