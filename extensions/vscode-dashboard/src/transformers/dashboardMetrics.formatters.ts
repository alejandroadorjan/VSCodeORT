import type { GitHubIssue } from '../model/github';

export function formatDuration(seconds: number): string {
	if (seconds <= 0) {
		return '—';
	}

	if (seconds >= 60) {
		return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	}

	return `${seconds}s`;
}

export function formatClosedDate(closedAt?: string | null): string {
	if (!closedAt) {
		return '—';
	}

	return new Date(closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function createLabelMarkup(labels: GitHubIssue['labels']): string {
	return (labels ?? [])
		.slice(0, 2)
		.map(label => {
			const red = parseInt(label.color.slice(0, 2), 16);
			const green = parseInt(label.color.slice(2, 4), 16);
			const blue = parseInt(label.color.slice(4, 6), 16);
			return `<span class="issue-label" style="background:rgba(${red},${green},${blue},0.2);color:#${label.color}">${label.name}</span>`;
		})
		.join('');
}
