/**
 * Tests for signals.ts — all cases run against inline fixtures or the
 * sample-prs.json snapshot so no network calls are needed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import {
	ageDays,
	size,
	sizeBucket,
	linkedIssues,
	hasTests,
	isBlocked,
	isExternal,
	extractSignals,
} from '../src/signals.js';
import type { NormalizedPR } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'sample-prs.json');

function loadFixturePR(number: number): NormalizedPR {
	const snapshot = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
	const pr = snapshot.prs.find((p: NormalizedPR) => p.number === number);
	if (!pr) { throw new Error(`PR #${number} not found in fixture`); }
	return pr;
}

function makePR(overrides: Partial<NormalizedPR> = {}): NormalizedPR {
	return {
		number: 1,
		title: 'Test PR',
		url: 'https://github.com/microsoft/vscode/pull/1',
		author: 'someone',
		author_association: 'NONE',
		created_at: new Date().toISOString(),
		draft: false,
		mergeable_state: 'clean',
		additions: 10,
		deletions: 5,
		changed_files: 2,
		labels: [],
		milestone: null,
		body: '',
		reviews: [],
		files: [],
		...overrides,
	};
}

// Reference date for deterministic age tests (2026-01-15, same as fixture fetched_at)
const REF_DATE = new Date('2026-01-15T12:00:00.000Z');

// ---------------------------------------------------------------------------
// ageDays
// ---------------------------------------------------------------------------

describe('ageDays', () => {
	test('returns 0 for a PR created right now', () => {
		const pr = makePR({ created_at: REF_DATE.toISOString() });
		assert.equal(ageDays(pr, REF_DATE), 0);
	});

	test('returns correct whole days', () => {
		const created = new Date(REF_DATE.getTime() - 10 * 24 * 60 * 60 * 1000);
		const pr = makePR({ created_at: created.toISOString() });
		assert.equal(ageDays(pr, REF_DATE), 10);
	});

	test('fixture PR #100 is ~90 days old relative to ref date', () => {
		const pr = loadFixturePR(100);
		// created 2025-10-17, ref 2026-01-15 → 90 days
		const days = ageDays(pr, REF_DATE);
		assert.ok(days >= 88 && days <= 92, `Expected ~90 days, got ${days}`);
	});
});

// ---------------------------------------------------------------------------
// size / sizeBucket
// ---------------------------------------------------------------------------

describe('size', () => {
	test('sums additions + deletions', () => {
		const pr = makePR({ additions: 100, deletions: 50 });
		assert.equal(size(pr), 150);
	});
});

describe('sizeBucket', () => {
	test('XS for ≤20 lines', () => {
		assert.equal(sizeBucket(makePR({ additions: 10, deletions: 5 })), 'XS');
	});

	test('S for 21-100 lines', () => {
		assert.equal(sizeBucket(makePR({ additions: 50, deletions: 30 })), 'S');
	});

	test('M for 101-500 lines', () => {
		assert.equal(sizeBucket(makePR({ additions: 300, deletions: 100 })), 'M');
	});

	test('L for 501-1000 lines', () => {
		assert.equal(sizeBucket(makePR({ additions: 600, deletions: 200 })), 'L');
	});

	test('XL for >1000 lines', () => {
		assert.equal(sizeBucket(makePR({ additions: 1000, deletions: 500 })), 'XL');
	});
});

// ---------------------------------------------------------------------------
// linkedIssues
// ---------------------------------------------------------------------------

describe('linkedIssues', () => {
	test('finds "closes #N"', () => {
		const pr = makePR({ body: 'closes #42' });
		assert.deepEqual(linkedIssues(pr), [42]);
	});

	test('finds "Fixes #N" (uppercase)', () => {
		const pr = makePR({ body: 'Fixes #100' });
		assert.deepEqual(linkedIssues(pr), [100]);
	});

	test('finds "resolve #N"', () => {
		const pr = makePR({ body: 'resolve #7' });
		assert.deepEqual(linkedIssues(pr), [7]);
	});

	test('finds multiple distinct issues', () => {
		const pr = makePR({ body: 'fixes #1 and closes #2' });
		assert.deepEqual(linkedIssues(pr), [1, 2]);
	});

	test('deduplicates repeated references', () => {
		const pr = makePR({ body: 'closes #5\nAlso closes #5' });
		assert.deepEqual(linkedIssues(pr), [5]);
	});

	test('returns empty array for no links', () => {
		const pr = makePR({ body: 'Just a refactor, no issue.' });
		assert.deepEqual(linkedIssues(pr), []);
	});

	test('fixture PR #101 links issue #42', () => {
		const pr = loadFixturePR(101);
		assert.deepEqual(linkedIssues(pr), [42]);
	});
});

// ---------------------------------------------------------------------------
// hasTests
// ---------------------------------------------------------------------------

describe('hasTests', () => {
	test('detects .test. in filename', () => {
		const pr = makePR({ files: [{ filename: 'src/foo.test.ts' }] });
		assert.ok(hasTests(pr));
	});

	test('detects .spec. in filename', () => {
		const pr = makePR({ files: [{ filename: 'src/foo.spec.ts' }] });
		assert.ok(hasTests(pr));
	});

	test('detects test/ path prefix', () => {
		const pr = makePR({ files: [{ filename: 'test/unit/foo.ts' }] });
		assert.ok(hasTests(pr));
	});

	test('detects tests/ path segment', () => {
		const pr = makePR({ files: [{ filename: 'src/tests/foo.ts' }] });
		assert.ok(hasTests(pr));
	});

	test('detects "test" keyword in body', () => {
		const pr = makePR({ body: 'Adds a unit test for the new feature.' });
		assert.ok(hasTests(pr));
	});

	test('returns false for PRs with no test indicators', () => {
		const pr = makePR({
			files: [{ filename: 'src/foo.ts' }, { filename: 'README.md' }],
			body: 'Just a small refactor.',
		});
		assert.equal(hasTests(pr), false);
	});

	test('fixture PR #100 has tests (cursor.test.ts)', () => {
		assert.ok(hasTests(loadFixturePR(100)));
	});

	test('fixture PR #107 has no tests (CSS only, no body mention)', () => {
		assert.equal(hasTests(loadFixturePR(107)), false);
	});
});

// ---------------------------------------------------------------------------
// isBlocked
// ---------------------------------------------------------------------------

describe('isBlocked', () => {
	test('dirty mergeable_state blocks', () => {
		const pr = makePR({ mergeable_state: 'dirty' });
		assert.ok(isBlocked(pr));
	});

	test('conflicting mergeable_state blocks', () => {
		const pr = makePR({ mergeable_state: 'conflicting' });
		assert.ok(isBlocked(pr));
	});

	test('CHANGES_REQUESTED review blocks', () => {
		const pr = makePR({
			reviews: [{ state: 'CHANGES_REQUESTED', user: { login: 'reviewer' }, submitted_at: '2025-01-01T00:00:00Z' }],
		});
		assert.ok(isBlocked(pr));
	});

	test('APPROVED after CHANGES_REQUESTED clears the block', () => {
		const pr = makePR({
			reviews: [
				{ state: 'CHANGES_REQUESTED', user: { login: 'reviewer' }, submitted_at: '2025-01-01T00:00:00Z' },
				{ state: 'APPROVED', user: { login: 'reviewer' }, submitted_at: '2025-01-02T00:00:00Z' },
			],
		});
		assert.equal(isBlocked(pr), false);
	});

	test('clean PR with no blocking reviews is not blocked', () => {
		const pr = makePR({ mergeable_state: 'clean', reviews: [] });
		assert.equal(isBlocked(pr), false);
	});

	test('fixture PR #103 is blocked (mergeable_state: dirty)', () => {
		assert.ok(isBlocked(loadFixturePR(103)));
	});

	test('fixture PR #105 is blocked (CHANGES_REQUESTED)', () => {
		assert.ok(isBlocked(loadFixturePR(105)));
	});

	test('fixture PR #108 is blocked (conflicting)', () => {
		assert.ok(isBlocked(loadFixturePR(108)));
	});
});

// ---------------------------------------------------------------------------
// isExternal
// ---------------------------------------------------------------------------

describe('isExternal', () => {
	test('OWNER is internal', () => {
		assert.equal(isExternal(makePR({ author_association: 'OWNER' })), false);
	});

	test('MEMBER is internal', () => {
		assert.equal(isExternal(makePR({ author_association: 'MEMBER' })), false);
	});

	test('COLLABORATOR is internal', () => {
		assert.equal(isExternal(makePR({ author_association: 'COLLABORATOR' })), false);
	});

	test('CONTRIBUTOR is external', () => {
		assert.ok(isExternal(makePR({ author_association: 'CONTRIBUTOR' })));
	});

	test('NONE is external', () => {
		assert.ok(isExternal(makePR({ author_association: 'NONE' })));
	});

	test('FIRST_TIME_CONTRIBUTOR is external', () => {
		assert.ok(isExternal(makePR({ author_association: 'FIRST_TIME_CONTRIBUTOR' })));
	});

	test('fixture PR #104 (MEMBER) is internal', () => {
		assert.equal(isExternal(loadFixturePR(104)), false);
	});

	test('fixture PR #100 (CONTRIBUTOR) is external', () => {
		assert.ok(isExternal(loadFixturePR(100)));
	});
});

// ---------------------------------------------------------------------------
// extractSignals (integration)
// ---------------------------------------------------------------------------

describe('extractSignals', () => {
	test('returns consistent bundle for a clean external PR', () => {
		const pr = loadFixturePR(100);
		const signals = extractSignals(pr, REF_DATE);
		assert.ok(signals.ageDays >= 88);
		assert.ok(signals.hasTests);
		assert.ok(signals.isExternal);
		assert.equal(signals.isDraft, false);
		assert.equal(signals.isBlocked, false);
		assert.deepEqual(signals.linkedIssues, [88]);
		assert.equal(signals.milestone, 'November 2025');
	});

	test('draft PR has isDraft=true', () => {
		const pr = loadFixturePR(102);
		const signals = extractSignals(pr, REF_DATE);
		assert.ok(signals.isDraft);
	});
});
