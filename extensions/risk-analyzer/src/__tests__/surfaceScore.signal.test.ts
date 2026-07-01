import { describe, it, expect } from 'vitest';
import { SurfaceScoreSignal } from '../signals/surfaceScore.signal';
import { PRFile, RiskConfig } from '../types';

const signal = new SurfaceScoreSignal();

const baseConfig: RiskConfig = {
	pathScores: {},
	lines: { minor: 200, major: 500 },
	labels: { low: 'risk:low', medium: 'risk:medium', high: 'risk:high' },
	thresholds: { medium: 3, high: 5 },
};

function file(name: string, adds: number, dels = 0): PRFile {
	return { filename: name, status: 'M', additions: adds, deletions: dels };
}

describe('SurfaceScoreSignal', () => {
	it('scores 0 when total lines below minor threshold', async () => {
		const result = await signal.compute([file('a.ts', 10, 5)], '', baseConfig);
		expect(result.score).toBe(0);
	});

	it('scores 1 when total lines between minor and major', async () => {
		const result = await signal.compute([file('a.ts', 150, 100)], '', baseConfig);
		expect(result.score).toBe(1);
	});

	it('scores 2 when total lines exceed major threshold', async () => {
		const result = await signal.compute([file('a.ts', 400, 200)], '', baseConfig);
		expect(result.score).toBe(2);
	});

	it('adds 1 when a .d.ts file is present', async () => {
		const result = await signal.compute([
			file('a.ts', 10),
			file('types.d.ts', 0),
		], '', baseConfig);
		expect(result.score).toBe(1);
	});

	it('detail shows line count', async () => {
		const result = await signal.compute([file('a.ts', 30, 20)], '', baseConfig);
		expect(result.detail).toContain('50 lines changed');
	});

	it('detail mentions .d.ts when present', async () => {
		const result = await signal.compute([file('a.d.ts', 5)], '', baseConfig);
		expect(result.detail).toContain('.d.ts');
	});
});
