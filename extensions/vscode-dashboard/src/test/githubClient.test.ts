/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { type GitHubFetchLike, getClosedIssues, getRepo, getWorkflowRuns } from '../data/githubClient';
import type { GitHubResponseLike } from '../data/githubClient.types';

function createOkResponse(body: object): GitHubResponseLike {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		json: async () => body,
		text: async () => '',
	};
}

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
			return createOkResponse({ workflow_runs: [{ id: 1 }, { id: 2 }] });
		}

		if (page === 2) {
			return createOkResponse({ workflow_runs: [{ id: 3 }] });
		}

		return createOkResponse({ workflow_runs: [] });
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
	});

	const issues = await getClosedIssues({ owner: 'o', repo: 'r', fetchImpl });
	assert.strictEqual(issues.length, 1);
	assert.strictEqual(issues[0].number, 1);
}

async function testRepoFetch() {
	const fetchImpl: GitHubFetchLike = async () => createOkResponse({ full_name: 'o/r', stargazers_count: 10 });

	const repo = await getRepo({ owner: 'o', repo: 'r', fetchImpl });
	assert.strictEqual(repo.full_name, 'o/r');
	assert.strictEqual(repo.stargazers_count, 10);
}
