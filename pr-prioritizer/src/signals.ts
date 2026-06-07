/**
 * Pure signal extractors — no I/O, no side-effects.
 * Each function takes a NormalizedPR and returns a derived fact.
 * Keeping these pure makes them trivially testable without mocks.
 */

import type { AuthorAssociation, NormalizedPR } from './types.js';

/** Internal author associations (not external contributors) */
const INTERNAL_ASSOCIATIONS: ReadonlySet<AuthorAssociation> = new Set([
	'OWNER',
	'MEMBER',
	'COLLABORATOR',
]);

/** Regex that matches GitHub's "closes/fixes/resolves #NNN" linking keywords (case-insensitive) */
const LINKED_ISSUE_RE =
	/(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi;

/** Regex that matches test file paths or test mentions in the PR body */
const TEST_FILE_RE = /\.test\.|\.spec\.|(^|\/)tests?\//i;

/** Number of whole days between `created_at` and `now` */
export function ageDays(pr: NormalizedPR, now: Date = new Date()): number {
	const created = new Date(pr.created_at);
	return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

/** Total lines changed (additions + deletions) */
export function size(pr: NormalizedPR): number {
	return pr.additions + pr.deletions;
}

/** Rough size bucket for display purposes */
export function sizeBucket(pr: NormalizedPR): 'XS' | 'S' | 'M' | 'L' | 'XL' {
	const s = size(pr);
	if (s <= 20) { return 'XS'; }
	if (s <= 100) { return 'S'; }
	if (s <= 500) { return 'M'; }
	if (s <= 1000) { return 'L'; }
	return 'XL';
}

/** Issue number(s) linked in the body via closing keywords, or empty array */
export function linkedIssues(pr: NormalizedPR): number[] {
	const body = pr.body ?? '';
	const matches: number[] = [];
	let m: RegExpExecArray | null;
	LINKED_ISSUE_RE.lastIndex = 0;
	while ((m = LINKED_ISSUE_RE.exec(body)) !== null) {
		matches.push(parseInt(m[1], 10));
	}
	return [...new Set(matches)];
}

/**
 * True if the PR touches at least one test file, or the PR body explicitly
 * mentions tests. Test-file detection uses the path — not file content.
 */
export function hasTests(pr: NormalizedPR): boolean {
	if (pr.files.some(f => TEST_FILE_RE.test(f.filename))) {
		return true;
	}
	const body = pr.body ?? '';
	return /\btest(s|ing)?\b/i.test(body);
}

/**
 * True if the PR is blocked from being merged:
 *   - The last review from any reviewer is CHANGES_REQUESTED, OR
 *   - mergeable_state is 'dirty' (conflicts) or 'conflicting'
 *
 * Note: we look at the most recent review per reviewer, not the global last
 * review, so an approval after a change-request clears the block.
 */
export function isBlocked(pr: NormalizedPR): boolean {
	if (pr.mergeable_state === 'dirty' || pr.mergeable_state === 'conflicting') {
		return true;
	}

	// Collect the latest review state per reviewer
	const latestByReviewer = new Map<string, string>();
	for (const review of pr.reviews) {
		const login = review.user?.login ?? '__unknown__';
		if (review.state !== 'PENDING' && review.state !== 'COMMENTED') {
			latestByReviewer.set(login, review.state);
		}
	}

	return [...latestByReviewer.values()].some(s => s === 'CHANGES_REQUESTED');
}

/** True when the author is NOT an owner, member, or collaborator */
export function isExternal(pr: NormalizedPR): boolean {
	return !INTERNAL_ASSOCIATIONS.has(pr.author_association);
}

/** Consolidated signals object for a PR — consumed by score.ts */
export interface Signals {
	ageDays: number;
	size: number;
	sizeBucket: 'XS' | 'S' | 'M' | 'L' | 'XL';
	linkedIssues: number[];
	hasTests: boolean;
	isBlocked: boolean;
	isExternal: boolean;
	isDraft: boolean;
	labels: string[];
	milestone: string | null;
}

/** Extract all signals for a PR in one call */
export function extractSignals(pr: NormalizedPR, now: Date = new Date()): Signals {
	return {
		ageDays: ageDays(pr, now),
		size: size(pr),
		sizeBucket: sizeBucket(pr),
		linkedIssues: linkedIssues(pr),
		hasTests: hasTests(pr),
		isBlocked: isBlocked(pr),
		isExternal: isExternal(pr),
		isDraft: pr.draft,
		labels: pr.labels,
		milestone: pr.milestone,
	};
}
