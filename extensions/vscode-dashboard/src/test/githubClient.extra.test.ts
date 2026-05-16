import * as assert from 'assert';
import { getRepo } from '../data/githubClient';

export async function runGitHubClientExtraTests() {
  await testRequestErrorPath();
  await testAuthHeaderPresent();
}

async function testRequestErrorPath() {
  const fetchImpl: any = async () => ({ ok: false, status: 500, statusText: 'Server Error', text: async () => 'boom' });
  let thrown = false;
  try {
    await getRepo({ owner: 'o', repo: 'r', fetchImpl });
  } catch (err: any) {
    thrown = true;
    assert.ok(/HTTP 500/.test(err.message));
  }

  assert.strictEqual(thrown, true);
}

async function testAuthHeaderPresent() {
  const fetchImpl: any = async (_url: string, init?: any) => {
    assert.ok(init && init.headers && init.headers.Authorization === 'Bearer tok123');
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ full_name: 'o/r' }), text: async () => '' };
  };

  const repo = await getRepo({ owner: 'o', repo: 'r', fetchImpl, token: 'tok123' });
  assert.strictEqual(repo.full_name, 'o/r');
}
