import { describe, it, expect } from 'vitest';
import { TestCoverageSignal } from '../signals/testCoverage.signal';
import { PRFile, RiskConfig } from '../types';

const signal = new TestCoverageSignal();
const dummyConfig: RiskConfig = {
	pathScores: {},
	lines: { minor: 200, major: 500 },
	labels: { low: 'risk:low', medium: 'risk:medium', high: 'risk:high' },
	thresholds: { medium: 3, high: 5 },
};

function file(name: string, status = 'M'): PRFile {
	return { filename: name, status, additions: 10, deletions: 0 };
}

describe('TestCoverageSignal', () => {
	it('scores 0 when no src/vs/ files are changed', async () => {
		const result = await signal.compute([file('src/other/foo.ts')], '', dummyConfig);
		expect(result.score).toBe(0);
		expect(result.detail).toBe('No src/vs/ changes');
	});

	it('scores 0 when src/vs/ is changed WITH test files', async () => {
		const files = [
			file('src/vs/workbench/editor.ts'),
			file('src/vs/workbench/test/editor.test.ts'),
		];
		const result = await signal.compute(files, '', dummyConfig);
		expect(result.score).toBe(0);
		expect(result.detail).toContain('tests present');
	});

	it('scores 1 when src/vs/ is changed WITHOUT test files', async () => {
		const result = await signal.compute([file('src/vs/workbench/editor.ts')], '', dummyConfig);
		expect(result.score).toBe(1);
		expect(result.detail).toContain('no test files');
	});

	it('recognizes .tsx files in src/vs/', async () => {
		const result = await signal.compute([file('src/vs/workbench/panel.tsx')], '', dummyConfig);
		expect(result.score).toBe(1);
	});

	it('recognizes .spec.ts files as tests', async () => {
		const files = [
			file('src/vs/workbench/editor.ts'),
			file('src/vs/workbench/editor.spec.ts'),
		];
		const result = await signal.compute(files, '', dummyConfig);
		expect(result.score).toBe(0);
	});
});
