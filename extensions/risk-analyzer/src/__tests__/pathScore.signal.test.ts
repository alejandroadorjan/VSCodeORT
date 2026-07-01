import { describe, it, expect } from 'vitest';
import { PathScoreSignal } from '../signals/pathScore.signal';
import { PRFile, RiskConfig } from '../types';

const signal = new PathScoreSignal();

const baseConfig: RiskConfig = {
	pathScores: {
		'src/vs/workbench/': 2,
		'src/vscode-dts/': 3,
	},
	lines: { minor: 200, major: 500 },
	labels: { low: 'risk:low', medium: 'risk:medium', high: 'risk:high' },
	thresholds: { medium: 3, high: 5 },
};

function file(name: string, status = 'M'): PRFile {
	return { filename: name, status, additions: 0, deletions: 0 };
}

describe('PathScoreSignal', () => {
	it('scores 0 when no files match any pattern', async () => {
		const result = await signal.compute([file('src/other/foo.ts')], '', baseConfig);
		expect(result.score).toBe(0);
		expect(result.detail).toBe('No files match critical path patterns');
	});

	it('scores the highest matching pattern score', async () => {
		const result = await signal.compute([file('src/vscode-dts/types.d.ts')], '', baseConfig);
		expect(result.score).toBe(3);
	});

	it('picks the max score when a file matches multiple patterns', async () => {
		const files = [file('src/vs/workbench/editor.ts')];
		const result = await signal.compute(files, '', baseConfig);
		expect(result.score).toBe(2);
	});

	it('returns max score across multiple files', async () => {
		const files = [file('src/vs/workbench/a.ts'), file('src/vscode-dts/b.ts')];
		const result = await signal.compute(files, '', baseConfig);
		expect(result.score).toBe(3);
	});

	it('detail includes matched file info when there is a match', async () => {
		const result = await signal.compute([file('src/vscode-dts/x.d.ts')], '', baseConfig);
		expect(result.detail).toContain('src/vscode-dts/x.d.ts');
		expect(result.detail).toContain('score 3');
	});
});
