import { describe, it, expect, vi } from 'vitest';
import { RiskAnalyzer, createDefaultSignals } from '../riskAnalyzer';
import { IRiskSignal } from '../signals/signal.interface';
import { RiskConfig } from '../types';

vi.mock('../gitUtils', () => ({
	getChangedFiles: vi.fn().mockResolvedValue([
		{ filename: 'src/vs/workbench/editor.ts', status: 'M', additions: 10, deletions: 5 },
	]),
	parseCodeowners: vi.fn().mockResolvedValue({
		'src/vs/': ['team-core'],
	}),
	matchesPattern: vi.fn((pattern: string, file: string) => file.startsWith(pattern)),
	normalizePath: vi.fn((p: string) => p),
}));

const dummyConfig: RiskConfig = {
	pathScores: { 'src/vs/workbench/': 2 },
	lines: { minor: 200, major: 500 },
	labels: { low: 'risk:low', medium: 'risk:medium', high: 'risk:high' },
	thresholds: { medium: 3, high: 5 },
};

describe('RiskAnalyzer', () => {
	it('aggregates signal scores into total', async () => {
		const mockSignals: IRiskSignal[] = [
			{ id: 'T1', description: 'Test 1', compute: vi.fn().mockResolvedValue({ score: 2, detail: 'a' }) },
			{ id: 'T2', description: 'Test 2', compute: vi.fn().mockResolvedValue({ score: 3, detail: 'b' }) },
		];
		const analyzer = new RiskAnalyzer(mockSignals);
		const result = await analyzer.analyze('/repo', dummyConfig);
		expect(result.total).toBe(5);
		expect(result.signals).toHaveLength(2);
		expect(result.signals[0].id).toBe('T1');
	});

	it('resolves owners from CODEOWNERS', async () => {
		const analyzer = new RiskAnalyzer([]);
		const result = await analyzer.analyze('/repo', dummyConfig);
		expect(result.owners).toContain('team-core');
	});

	it('determines label based on total score', async () => {
		const lowSignal: IRiskSignal = {
			id: 'L', description: 'Low',
			compute: vi.fn().mockResolvedValue({ score: 0, detail: '' }),
		};
		const highSignal: IRiskSignal = {
			id: 'H', description: 'High',
			compute: vi.fn().mockResolvedValue({ score: 6, detail: '' }),
		};

		const lowAnalysis = await new RiskAnalyzer([lowSignal]).analyze('/repo', dummyConfig);
		expect(lowAnalysis.label).toBe('risk:low');

		const highAnalysis = await new RiskAnalyzer([highSignal]).analyze('/repo', dummyConfig);
		expect(highAnalysis.label).toBe('risk:high');
	});
});

describe('createDefaultSignals', () => {
	it('returns all 4 default signals', () => {
		const signals = createDefaultSignals();
		expect(signals).toHaveLength(4);
		const ids = signals.map(s => s.id);
		expect(ids).toEqual(['S1', 'S2', 'S3', 'S4']);
	});
});
