/**
 * Markdown report builder — pure function, no I/O.
 * Takes the output of scorePRs() and produces a formatted Markdown string.
 */

import type { NormalizedPR, Snapshot } from './types.js';
import type { RankedPR, FilteredPR } from './score.js';
import { WEIGHTS } from './score.js';

export interface ReportOptions {
	/** Maximum ranked PRs to include in the main table (default: 25) */
	top?: number;
}

function mdLink(text: string, url: string): string {
	return `[${text}](${url})`;
}

function row(...cells: string[]): string {
	return '| ' + cells.join(' | ') + ' |';
}

function separator(widths: number[]): string {
	return '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |';
}

function fmtScore(n: number): string {
	return n.toFixed(1);
}

function fmtLabels(labels: string[]): string {
	if (labels.length === 0) { return '—'; }
	return labels.map(l => `\`${l}\``).join(' ');
}

/** Render the prioritized ranking table */
function renderRanked(ranked: RankedPR[], top: number): string {
	const visible = ranked.slice(0, top);
	if (visible.length === 0) {
		return '_No external PRs ready for review._\n';
	}

	const headers = ['Rank', 'PR', 'Author', 'Age (d)', 'Size', 'Tests', 'Issue', 'Milestone', 'Labels', 'Score'];
	const lines: string[] = [
		row(...headers),
		separator([4, 40, 20, 7, 5, 5, 5, 20, 30, 5]),
	];

	for (let i = 0; i < visible.length; i++) {
		const { pr, signals, breakdown } = visible[i];
		lines.push(row(
			String(i + 1),
			mdLink(`#${pr.number} ${pr.title.slice(0, 60)}`, pr.url),
			`@${pr.author}`,
			String(signals.ageDays),
			`${signals.sizeBucket} (${signals.size})`,
			signals.hasTests ? 'yes' : 'no',
			signals.linkedIssues.length > 0 ? signals.linkedIssues.map(n => `#${n}`).join(', ') : '—',
			signals.milestone ?? '—',
			fmtLabels(signals.labels),
			fmtScore(breakdown.total),
		));
	}

	return lines.join('\n') + '\n';
}

/** Render the score breakdown table for ranked PRs */
function renderBreakdown(ranked: RankedPR[], top: number): string {
	const visible = ranked.slice(0, top);
	if (visible.length === 0) { return ''; }

	const headers = ['PR', 'Age pts', 'Size pts', 'Issue pts', 'Tests pts', 'Milestone pts', 'Labels pts', 'Total'];
	const lines: string[] = [
		row(...headers),
		separator([10, 7, 8, 9, 9, 13, 10, 5]),
	];

	for (const { pr, breakdown } of visible) {
		lines.push(row(
			`#${pr.number}`,
			fmtScore(breakdown.age),
			fmtScore(breakdown.size),
			fmtScore(breakdown.issue),
			fmtScore(breakdown.tests),
			fmtScore(breakdown.milestone),
			fmtScore(breakdown.labels),
			fmtScore(breakdown.total),
		));
	}

	return lines.join('\n') + '\n';
}

/** Render the "not ready / blocked" section */
function renderFiltered(filtered: FilteredPR[]): string {
	if (filtered.length === 0) {
		return '_None._\n';
	}

	const headers = ['PR', 'Author', 'Reason'];
	const lines: string[] = [
		row(...headers),
		separator([10, 20, 30]),
	];

	for (const { pr, reason } of filtered) {
		lines.push(row(
			mdLink(`#${pr.number}`, pr.url),
			`@${pr.author}`,
			reason,
		));
	}

	return lines.join('\n') + '\n';
}

/** Render the methodology footnote */
function renderMethodology(): string {
	const entries = [
		`- **Age (max ${WEIGHTS.age} pts):** \`min(ageDays, 90) / 90 × ${WEIGHTS.age}\` — rewards long-waiting PRs, capped at 90 days`,
		`- **Size (max ${WEIGHTS.size} pts):** \`(1 − min(additions+deletions, 1000) / 1000) × ${WEIGHTS.size}\` — rewards small, reviewable PRs`,
		`- **Issue (${WEIGHTS.issue} pts flat):** linked closing keyword (\`closes/fixes/resolves #N\`) present in the body`,
		`- **Tests (${WEIGHTS.tests} pts flat):** any changed file matches \`.test.\`/\`.spec.\`/\`test(s)/\` pattern, or body mentions "test"`,
		`- **Milestone (${WEIGHTS.milestone} pts flat):** PR is attached to a milestone`,
		`- **Labels (${WEIGHTS.labels} pts flat):** at least one label is present (indicates triage happened)`,
		``,
		`**Hard filters (excluded from ranking):**`,
		`- Draft PRs`,
		`- PRs with an open \`CHANGES_REQUESTED\` review (per reviewer, latest wins)`,
		`- PRs with \`mergeable_state\` of \`dirty\` or \`conflicting\``,
		``,
		`**External definition:** author \`author_association\` ∉ \`{OWNER, MEMBER, COLLABORATOR}\``,
	];

	return entries.join('\n') + '\n';
}

/**
 * Build the complete Markdown report string.
 *
 * @param snapshot  The source snapshot (for repo, date, total_open)
 * @param ranked    Sorted ranked PRs from scorePRs()
 * @param filtered  Blocked/draft PRs from scorePRs()
 * @param internal  Internal-author PRs (excluded from ranking)
 * @param opts      Display options (top N)
 */
export function buildReport(
	snapshot: Snapshot,
	ranked: RankedPR[],
	filtered: FilteredPR[],
	internal: NormalizedPR[],
	opts: ReportOptions = {},
): string {
	const top = opts.top ?? 25;
	const lines: string[] = [];

	// Header
	lines.push(`# PR Prioritizer Report`);
	lines.push(``);
	lines.push(`| Field | Value |`);
	lines.push(`| --- | --- |`);
	lines.push(`| Repo | ${snapshot.repo} |`);
	lines.push(`| Snapshot date | ${snapshot.fetched_at} |`);
	lines.push(`| Report generated | ${new Date().toISOString()} |`);
	lines.push(`| Open PRs in snapshot | ${snapshot.total_open} |`);
	lines.push(`| External PRs | ${ranked.length + filtered.length} |`);
	lines.push(`| Ready for review | ${ranked.length} |`);
	lines.push(`| Blocked / draft | ${filtered.length} |`);
	lines.push(`| Internal (excluded) | ${internal.length} |`);
	lines.push(``);

	// Ranked table
	lines.push(`## Ready for Review (top ${Math.min(top, ranked.length)} of ${ranked.length})`);
	lines.push(``);
	lines.push(renderRanked(ranked, top));

	// Breakdown
	lines.push(`### Score Breakdown`);
	lines.push(``);
	lines.push(renderBreakdown(ranked, top));

	// Filtered / blocked
	lines.push(`## Not Ready / Blocked`);
	lines.push(``);
	lines.push(renderFiltered(filtered));

	// Methodology
	lines.push(`---`);
	lines.push(``);
	lines.push(`## Methodology`);
	lines.push(``);
	lines.push(renderMethodology());

	return lines.join('\n');
}
