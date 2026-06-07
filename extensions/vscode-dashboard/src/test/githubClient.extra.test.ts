/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { type GitHubFetchLike, getRepo } from '../data/githubClient';
import type { GitHubResponseLike } from '../data/githubClient.types';

function createResponse(response: Omit<GitHubResponseLike, 'json' | 'text'> & { body?: object; textBody?: string }): GitHubResponseLike {
	return {
		...response,
		json: async () => response.body ?? {},
		text: async () => response.textBody ?? '',
	};
}

export async function runGitHubClientExtraTests() {
	await testRequestErrorPath();
	await testAuthHeaderPresent();
}

async function testRequestErrorPath() {
	const fetchImpl: GitHubFetchLike = async () => createResponse({ ok: false, status: 500, statusText: 'Server Error', textBody: 'boom' });
	let thrown = false;
	try {
		await getRepo({ owner: 'o', repo: 'r', fetchImpl });
	} catch (err) {
		thrown = true;
		assert.ok(err instanceof Error);
		assert.ok(/HTTP 500/.test(err.message));
	}

	assert.strictEqual(thrown, true);
}

async function testAuthHeaderPresent() {
	const fetchImpl: GitHubFetchLike = async (_url, init) => {
		assert.ok(init && init.headers && init.headers.Authorization === 'Bearer tok123');
		return createResponse({ ok: true, status: 200, statusText: 'OK', body: { full_name: 'o/r' } });
	};

	const repo = await getRepo({ owner: 'o', repo: 'r', fetchImpl, token: 'tok123' });
	assert.strictEqual(repo.full_name, 'o/r');
}
