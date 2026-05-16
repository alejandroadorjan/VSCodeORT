import * as assert from 'assert';
import type { GitHubFetchLike } from '../data/githubClient';
import { getClosedIssues, getRepo, getWorkflowRuns } from '../data/githubClient';

export async function runGitHubClientTests() {
	await testWorkflowRunsPagination();
	await testClosedIssuesFiltering();
	await testRepoFetch();
}

async function testWorkflowRunsPagination() {
	let calls = 0;
	const fetchImpl: GitHubFetchLike = async (url: string) => {
		calls++;
		const page = Number(new URL(url).searchParams.get('page'));

		if (page === 1) {
			return {
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({ workflow_runs: [{ id: 1 }, { id: 2 }] }),
				text: async () => '',
			} as any;
		}

		if (page === 2) {
			return {
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({ workflow_runs: [{ id: 3 }] }),
				text: async () => '',
			} as any;
		}

		return {
			ok: true,
			status: 200,
			statusText: 'OK',
			json: async () => ({ workflow_runs: [] }),
			text: async () => '',
		} as any;
	};

	const runs = await getWorkflowRuns({ owner: 'o', repo: 'r', fetchImpl, maxPages: 5, perPage: 2 });
	assert.strictEqual(runs.length, 3);
	assert.strictEqual(calls >= 2, true);
}

async function testClosedIssuesFiltering() {
	const fetchImpl: GitHubFetchLike = async () => ({
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => ([
			{ number: 1, title: 'issue', pull_request: undefined },
			{ number: 2, title: 'pr', pull_request: {} },
		]),
		text: async () => '',
	}) as any;

	const issues = await getClosedIssues({ owner: 'o', repo: 'r', fetchImpl });
	assert.strictEqual(issues.length, 1);
	assert.strictEqual(issues[0].number, 1);
}

async function testRepoFetch() {
	const fetchImpl: GitHubFetchLike = async () => ({
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => ({ full_name: 'o/r', stargazers_count: 10 }),
		text: async () => '',
	}) as any;

	const repo = await getRepo({ owner: 'o', repo: 'r', fetchImpl });
	assert.strictEqual(repo.full_name, 'o/r');
	assert.strictEqual(repo.stargazers_count, 10);
}
