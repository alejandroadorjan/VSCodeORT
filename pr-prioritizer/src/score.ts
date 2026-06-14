/**
 * Scoring engine — pure functions, no I/O.
 *
 * Design rationale:
 *   - All weights live in a single exported `WEIGHTS` constant so they can be
 *     overridden at call sites (e.g. from a config file) and documented in the
 *     academic paper.
 *   - The function returns a per-signal breakdown, not just the total, so the
 *     Markdown report can justify every ranking decision transparently.
 *   - Hard filters (draft, blocked) are applied before scoring; filtered PRs
 *     get a `reason` string instead of a numeric score.
 */

import type { NormalizedPR } from './types.js';
import { extractSignals } from './signals.js';
import type { Signals } from './signals.js';

/**
 * Scoring weights.
 * Each entry describes the maximum points a signal can contribute.
 * Total intentionally sums to 100 for easy percentage interpretation.
 *
 * Tuning guidance:
 *   - `age`:     Rewards long-waiting PRs. Capped at 90 days to avoid infinite
 *                inflation for very old stale PRs.
 *   - `size`:    Rewards small PRs — reviewers can turn them around faster.
 *                Capped at 1000 lines; beyond that the penalty is maximum.
 *   - `issue`:   A linked closing issue signals the PR is intentional, scoped,
 *                and tracks community intent.
 *   - `tests`:   Evidence of validation reduces reviewer risk.
 *   - `milestone`: Milestone attachment means the fix is scheduled, increasing
 *                  urgency.
 *   - `labels`:  Any label means the PR has been triaged; small bonus.
 */
export const WEIGHTS = {
	/** Points for age. Formula: min(ageDays, 90) / 90 * weight */
	age: 30,
	/** Points for small size. Formula: (1 - min(size, 1000) / 1000) * weight */
	size: 25,
	/** Flat bonus when at least one closing issue is linked */
	issue: 15,
	/** Flat bonus when test files are present or tests are mentioned */
	tests: 15,
	/** Flat bonus when a milestone is set */
	milestone: 10,
	/** Flat bonus when at least one label is present */
	labels: 5,
} as const;

/** Per-signal score contribution for one PR */
export interface ScoreBreakdown {
	age: number;
	size: number;
	issue: number;
	tests: number;
	milestone: number;
	labels: number;
	total: number;
}

/** A PR that passed the hard filters and received a numeric score */
export interface RankedPR {
	kind: 'ranked';
	pr: NormalizedPR;
	signals: Signals;
	breakdown: ScoreBreakdown;
}

/** A PR that was excluded by a hard filter (draft or blocked) */
export interface FilteredPR {
	kind: 'filtered';
	pr: NormalizedPR;
	signals: Signals;
	reason: string;
}

export type ScoredPR = RankedPR | FilteredPR;

/**
 * Compute the score breakdown for a single set of signals.
 * This function is intentionally separated so tests can call it directly
 * without constructing a full NormalizedPR.
 */
export function computeBreakdown(signals: Signals, weights: typeof WEIGHTS = WEIGHTS): ScoreBreakdown {
	const age = (Math.min(signals.ageDays, 90) / 90) * weights.age;
	const size = (1 - Math.min(signals.size, 1000) / 1000) * weights.size;
	const issue = signals.linkedIssues.length > 0 ? weights.issue : 0;
	const tests = signals.hasTests ? weights.tests : 0;
	const milestone = signals.milestone !== null ? weights.milestone : 0;
	const labels = signals.labels.length > 0 ? weights.labels : 0;

	return {
		age: parseFloat(age.toFixed(2)),
		size: parseFloat(size.toFixed(2)),
		issue,
		tests,
		milestone,
		labels,
		total: parseFloat((age + size + issue + tests + milestone + labels).toFixed(2)),
	};
}

/**
 * Score all PRs in a snapshot.
 *
 * Internal PRs (owner/member/collaborator) are excluded entirely and returned
 * as a separate list. External PRs go through the hard filters first, then
 * the weighted scoring.
 *
 * @param prs       Array of normalized PRs from the snapshot
 * @param weights   Weight table (defaults to `WEIGHTS`)
 * @param now       Reference date for age calculation (injectable for tests)
 * @returns         { ranked, filtered, internal } — ranked is sorted desc by score
 */
export function scorePRs(
	prs: NormalizedPR[],
	weights: typeof WEIGHTS = WEIGHTS,
	now: Date = new Date(),
): {
	ranked: RankedPR[];
	filtered: FilteredPR[];
	internal: NormalizedPR[];
} {
	const ranked: RankedPR[] = [];
	const filtered: FilteredPR[] = [];
	const internal: NormalizedPR[] = [];

	for (const pr of prs) {
		const signals = extractSignals(pr, now);

		if (!signals.isExternal) {
			internal.push(pr);
			continue;
		}

		if (signals.isDraft) {
			filtered.push({ kind: 'filtered', pr, signals, reason: 'Draft' });
			continue;
		}

		if (signals.isBlocked) {
			const detail =
				pr.mergeable_state === 'dirty' || pr.mergeable_state === 'conflicting'
					? `Merge conflict (mergeable_state: ${pr.mergeable_state})`
					: 'Changes requested';
			filtered.push({ kind: 'filtered', pr, signals, reason: detail });
			continue;
		}

		const breakdown = computeBreakdown(signals, weights);
		ranked.push({ kind: 'ranked', pr, signals, breakdown });
	}

	ranked.sort((a, b) => b.breakdown.total - a.breakdown.total);

	return { ranked, filtered, internal };
}
