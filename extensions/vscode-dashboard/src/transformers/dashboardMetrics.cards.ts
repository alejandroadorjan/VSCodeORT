/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IssueCard, RunCard, RunInsight } from '../model/dashboard';
import type { GitHubIssue, GitHubWorkflowRun } from '../model/github';
import { createLabelMarkup, formatClosedDate, formatDuration } from './dashboardMetrics.formatters';
import { isCompletedRun, runDurationSeconds } from './dashboardMetrics.compute';

function getWorkflowDisplayName(run: GitHubWorkflowRun): string {
	return (run.name ?? run.workflow_name ?? 'Workflow').slice(0, 30);
}

function getWorkflowStatus(run: GitHubWorkflowRun): string {
	return run.conclusion ?? run.status ?? 'unknown';
}

function getStatusClasses(status: string): { dotClass: string; badgeClass: string } {
	if (status === 'success') {
		return { dotClass: 'green', badgeClass: 'badge-green' };
	}

	if (status === 'failure') {
		return { dotClass: 'red', badgeClass: 'badge-red' };
	}

	return { dotClass: 'amber', badgeClass: 'badge-amber' };
}

export function createRecentRunCard(run: GitHubWorkflowRun): RunCard {
	const statusLabel = getWorkflowStatus(run);
	const classes = getStatusClasses(statusLabel);
	const durationSeconds = runDurationSeconds(run);

	return {
		name: getWorkflowDisplayName(run),
		branch: run.head_branch ? ` / ${run.head_branch}` : '',
		duration: formatDuration(durationSeconds),
		badgeClass: classes.badgeClass,
		statusLabel,
		dotClass: classes.dotClass,
	};
}

export function createRunInsight(run: GitHubWorkflowRun): RunInsight {
	const statusLabel = getWorkflowStatus(run);
	const classes = getStatusClasses(statusLabel);
	const durationSeconds = runDurationSeconds(run);

	return {
		name: getWorkflowDisplayName(run),
		title: run.display_title ?? run.name ?? run.workflow_name ?? 'Workflow',
		statusLabel,
		badgeClass: classes.badgeClass,
		dotClass: classes.dotClass,
		branch: run.head_branch ?? '',
		commit: run.head_sha?.slice(0, 7) ?? '',
		duration: formatDuration(durationSeconds),
		hasDuration: isCompletedRun(run),
		url: run.html_url ?? '',
	};
}

export function createIssueCard(issue: GitHubIssue): IssueCard {
	const closedBy = issue.closed_by?.login ? `@${issue.closed_by.login}` : '';
	const comments = issue.comments && issue.comments > 0 ? String(issue.comments) : '';

	return {
		number: issue.number,
		title: issue.title,
		closedDate: formatClosedDate(issue.closed_at),
		labels: createLabelMarkup(issue.labels),
		closedBy,
		commentCount: comments,
	};
}
