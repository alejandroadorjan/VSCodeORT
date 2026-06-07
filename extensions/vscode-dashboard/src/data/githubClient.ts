/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubCommit, GitHubIssue, GitHubRelease, GitHubRepo, GitHubTag, GitHubWorkflowRun } from '../model/github';
import type { GitHubCompareResponse, GitHubRunsResponse, GitHubSearchResponse } from './githubClient.responses';
import type { GitHubClientOptions, GitHubFetchLike } from './githubClient.types';

export type { GitHubClientOptions, GitHubFetchLike } from './githubClient.types';

const DEFAULT_PER_PAGE = 100;

const USER_AGENT = 'VSCode-Dashboard';

function createHeaders(token?: string | null): Record<string, string> {
	const headers: Record<string, string> = {
		'User-Agent': USER_AGENT,
	};

	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}

	return headers;
}

async function requestJson<T>(url: string, options: GitHubClientOptions): Promise<T> {
	const fetchImpl = options.fetchImpl ?? (fetch as GitHubFetchLike);
	const response = await fetchImpl(url, { headers: createHeaders(options.token) });

	if (!response.ok) {
		let message = '';
		try {
			message = await response.text();
		} catch {
			// Ignore response body read failures when building the HTTP error.
		}
		throw new Error(`HTTP ${response.status} ${response.statusText}${message ? ` - ${message}` : ''}`);
	}

	return await response.json() as T;
}

function buildRepoUrl(owner: string, repo: string, suffix = ''): string {
	return `https://api.github.com/repos/${owner}/${repo}${suffix}`;
}

export async function getRepo(options: GitHubClientOptions): Promise<GitHubRepo> {
	return requestJson<GitHubRepo>(buildRepoUrl(options.owner, options.repo), options);
}

export async function getOpenIssuesCount(options: GitHubClientOptions): Promise<number> {
	const result = await requestJson<GitHubSearchResponse>(
		`https://api.github.com/search/issues?q=repo:${options.owner}/${options.repo}+is:issue+is:open&per_page=1`,
		options
	);

	return result.total_count ?? 0;
}

export async function getOpenPullRequestsCount(options: GitHubClientOptions): Promise<number> {
	const result = await requestJson<GitHubSearchResponse>(
		`https://api.github.com/search/issues?q=repo:${options.owner}/${options.repo}+is:pr+is:open&per_page=1`,
		options
	);

	return result.total_count ?? 0;
}

export async function getClosedIssues(options: GitHubClientOptions): Promise<GitHubIssue[]> {
	const issues = await requestJson<GitHubIssue[]>(
		buildRepoUrl(options.owner, options.repo, '/issues?state=closed&per_page=20&sort=updated&direction=desc'),
		options
	);

	return issues.filter((issue) => !issue.pull_request);
}

export async function getCommits(options: GitHubClientOptions): Promise<GitHubCommit[]> {
	return requestJson<GitHubCommit[]>(
		buildRepoUrl(options.owner, options.repo, '/commits?per_page=10'),
		options
	);
}

export async function getReleases(options: GitHubClientOptions): Promise<GitHubRelease[]> {
	return requestJson<GitHubRelease[]>(
		buildRepoUrl(options.owner, options.repo, '/releases?per_page=20'),
		options
	);
}

export async function getTags(options: GitHubClientOptions): Promise<GitHubTag[]> {
	return requestJson<GitHubTag[]>(
		buildRepoUrl(options.owner, options.repo, '/tags?per_page=100'),
		options
	);
}

export async function getCompareCommits(options: GitHubClientOptions, base: string, head: string): Promise<GitHubCommit[]> {
	const compare = await requestJson<GitHubCompareResponse>(
		buildRepoUrl(options.owner, options.repo, `/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`),
		options
	);

	return compare.commits ?? [];
}

async function getWorkflowRunsFromSuffix(options: GitHubClientOptions, suffix: string): Promise<GitHubWorkflowRun[]> {
	const perPage = options.perPage ?? DEFAULT_PER_PAGE;
	const maxPages = options.maxPages ?? 3;
	const runs: GitHubWorkflowRun[] = [];

	for (let page = 1; page <= maxPages; page++) {
		const response = await requestJson<GitHubRunsResponse>(
			buildRepoUrl(options.owner, options.repo, `${suffix}&per_page=${perPage}&page=${page}`),
			options
		);
		const pageRuns = response.workflow_runs ?? [];

		if (pageRuns.length === 0) {
			break;
		}

		runs.push(...pageRuns);

		if (pageRuns.length < perPage) {
			break;
		}
	}

	return runs;
}

export async function getWorkflowRuns(options: GitHubClientOptions): Promise<GitHubWorkflowRun[]> {
	return getWorkflowRunsFromSuffix(options, '/actions/runs?');
}

export async function getWorkflowRunsForBranch(options: GitHubClientOptions, branch: string): Promise<GitHubWorkflowRun[]> {
	return getWorkflowRunsFromSuffix(options, `/actions/runs?branch=${encodeURIComponent(branch)}`);
}
