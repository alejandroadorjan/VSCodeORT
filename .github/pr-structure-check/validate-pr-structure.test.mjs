import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	loadConfig,
	parseSectionContents,
	stripHtmlComments,
	validatePrStructure
} from './validate-pr-structure.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, 'config.json');

/** @type {import('./validate-pr-structure.mjs').PrStructureConfig} */
const testConfig = {
	sections: [
		{ heading: '## Context', minContentLength: 50 },
		{ heading: '## Solution', minContentLength: 50 },
		{ heading: '## Impact', minContentLength: 50 },
		{ heading: '## Testing', minContentLength: 50 }
	]
};

const LONG = 'This text is long enough to satisfy the minimum character threshold.';

/**
 * @param {Partial<Record<'context' | 'solution' | 'impact' | 'testing', string>>} overrides
 */
function buildValidBody(overrides = {}) {
	return [
		`## Context\n${overrides.context ?? LONG}`,
		`## Solution\n${overrides.solution ?? LONG}`,
		`## Impact\n${overrides.impact ?? LONG}`,
		`## Testing\n${overrides.testing ?? LONG}`
	].join('\n\n');
}

describe('stripHtmlComments', () => {
	it('removes HTML comments from text', () => {
		const input = 'before <!-- hidden --> after';
		assert.equal(stripHtmlComments(input), 'before  after');
	});

	it('returns empty string for nullish input', () => {
		assert.equal(stripHtmlComments(null), '');
		assert.equal(stripHtmlComments(undefined), '');
	});
});

describe('parseSectionContents', () => {
	it('ignores H3 headings when splitting sections', () => {
		const body = `## Context
${LONG}

### Details
${LONG}`;

		const sections = parseSectionContents(body);
		assert.equal(sections.get('context'), `${LONG}\n\n### Details\n${LONG}`);
	});
});

describe('validatePrStructure', () => {
	it('accepts a valid PR body with all required sections', () => {
		const result = validatePrStructure(buildValidBody(), testConfig);
		assert.equal(result.valid, true);
		assert.deepEqual(result.errors, []);
	});

	it('loads and validates against the repo config.json', () => {
		const config = loadConfig(configPath);
		const result = validatePrStructure(buildValidBody(), config);
		assert.equal(result.valid, true);
	});

	it('reports all missing sections for an empty body', () => {
		const result = validatePrStructure('', testConfig);

		assert.equal(result.valid, false);
		assert.equal(result.errors.length, 4);
		assert.ok(result.errors.every(error => error.startsWith('Missing required section:')));
	});

	it('reports a missing section when one heading is absent', () => {
		const body = buildValidBody().replace(/## Impact[\s\S]*?(?=## Testing)/, '');

		const result = validatePrStructure(body, testConfig);

		assert.equal(result.valid, false);
		assert.ok(result.errors.some(error => error.includes('## Impact')));
	});

	it('reports insufficient content for a short section', () => {
		const result = validatePrStructure(buildValidBody({ testing: 'too short' }), testConfig);

		assert.equal(result.valid, false);
		assert.ok(result.errors.some(error =>
			error.includes('## Testing') && error.includes('insufficient content')
		));
	});

	it('does not count HTML comments as section content', () => {
		const result = validatePrStructure(buildValidBody({
			testing: '<!-- placeholder only -->'
		}), testConfig);

		assert.equal(result.valid, false);
		assert.ok(result.errors.some(error => error.includes('## Testing')));
	});

	it('accepts sections in any order', () => {
		const body = [
			`## Testing\n${LONG}`,
			`## Impact\n${LONG}`,
			`## Solution\n${LONG}`,
			`## Context\n${LONG}`
		].join('\n\n');

		const result = validatePrStructure(body, testConfig);
		assert.equal(result.valid, true);
	});

	it('concatenates duplicate section headers before measuring length', () => {
		const partOne = 'First chunk of testing notes with enough characters here.';
		const partTwo = 'Second chunk of testing notes with enough characters here.';
		const body = [
			buildValidBody().replace(`## Testing\n${LONG}`, ''),
			`## Testing\n${partOne}`,
			`## Testing\n${partTwo}`
		].join('\n\n');

		const result = validatePrStructure(body, testConfig);
		assert.equal(result.valid, true);
	});

	it('matches section headings case-insensitively', () => {
		const body = [
			`## context\n${LONG}`,
			`## SOLUTION\n${LONG}`,
			`## Impact\n${LONG}`,
			`## testing\n${LONG}`
		].join('\n\n');

		const result = validatePrStructure(body, testConfig);
		assert.equal(result.valid, true);
	});
});
