/**
 * GitHub API client — thin wrapper around @octokit/rest.
 * All network calls live here; the rest of the codebase is offline-capable.
 */

import { Octokit } from '@octokit/rest';
import type { NormalizedPR, RawReview, RawFile } from './types.js';

export function createClient(token: string): Octokit {
	return new Octokit({ auth: token });
}

/**
 * List the first `perPage` open PRs for a repo (page 1 only).
 * Returns raw API objects — normalization happens in fetch.ts.
 */
export async function listOpenPRs(
	client: Octokit,
	owner: string,
	repo: string,
	perPage: number,
): Promise<Awaited<ReturnType<Octokit['rest']['pulls']['list']>>['data']> {
	const { data } = await client.rest.pulls.list({
		owner,
		repo,
		state: 'open',
		per_page: perPage,
		sort: 'created',
		direction: 'asc',
	});
	return data;
}

/**
 * Fetch the full PR detail for a single PR number.
 * Provides additions, deletions, changed_files, mergeable_state.
 */
export async function getPRDetail(
	client: Octokit,
	owner: string,
	repo: string,
	pull_number: number,
): Promise<Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data']> {
	const { data } = await client.rest.pulls.get({ owner, repo, pull_number });
	return data;
}

/**
 * Fetch all reviews for a PR.
 *
 * NOTE — N+1 pattern: we call this once per PR, meaning `limit` PRs = `limit`
 * extra API requests. At the default limit of 50 that costs 50 review calls +
 * 50 file calls + 1 list call = 101 requests total. GitHub's unauthenticated
 * rate limit is 60 req/hour; authenticated is 5000 req/hour. Always use a
 * token (GITHUB_TOKEN env var) or this will fail for any non-trivial limit.
 */
export async function getPRReviews(
	client: Octokit,
	owner: string,
	repo: string,
	pull_number: number,
): Promise<RawReview[]> {
	const { data } = await client.rest.pulls.listReviews({ owner, repo, pull_number });
	return data.map(r => ({
		state: r.state as RawReview['state'],
		user: r.user ? { login: r.user.login } : null,
		submitted_at: r.submitted_at ?? null,
	}));
}

/**
 * Fetch the list of files changed by a PR (up to 3000 — GitHub API cap).
 */
export async function getPRFiles(
	client: Octokit,
	owner: string,
	repo: string,
	pull_number: number,
): Promise<RawFile[]> {
	const { data } = await client.rest.pulls.listFiles({
		owner,
		repo,
		pull_number,
		per_page: 100,
	});
	return data.map(f => ({ filename: f.filename }));
}

/** Parse "owner/repo" string into { owner, repo } */
export function parseRepo(repoArg: string): { owner: string; repo: string } {
	const parts = repoArg.split('/');
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error(`Invalid repo format "${repoArg}". Expected "owner/repo".`);
	}
	return { owner: parts[0], repo: parts[1] };
}

/**
 * Normalize a raw PR list item + detail + reviews + files into a NormalizedPR.
 */
export function normalizePR(
	list: Awaited<ReturnType<Octokit['rest']['pulls']['list']>>['data'][number],
	detail: Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data'],
	reviews: RawReview[],
	files: RawFile[],
): NormalizedPR {
	return {
		number: list.number,
		title: list.title,
		url: list.html_url,
		author: list.user?.login ?? 'unknown',
		author_association: list.author_association as NormalizedPR['author_association'],
		created_at: list.created_at,
		draft: list.draft ?? false,
		mergeable_state: detail.mergeable_state ?? 'unknown',
		additions: detail.additions,
		deletions: detail.deletions,
		changed_files: detail.changed_files,
		labels: list.labels.map(l => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
		milestone: list.milestone?.title ?? null,
		body: list.body ?? '',
		reviews,
		files,
	};
}
