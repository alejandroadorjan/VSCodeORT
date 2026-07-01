import { describe, it, expect, vi } from 'vitest';
import { FixHistorySignal } from '../signals/fixHistory.signal';
import { PRFile } from '../types';

vi.mock('../gitUtils', () => ({
	runGit: vi.fn(),
}));

const signal = new FixHistorySignal();

const dummyConfig = {} as any;

function file(name: string): PRFile {
	return { filename: name, status: 'M', additions: 10, deletions: 0 };
}

describe('FixHistorySignal', () => {
	it('scores 0 when there are few fix commits', async () => {
		const { runGit } = await import('../gitUtils');
		vi.mocked(runGit).mockResolvedValue(
			'abc111 fix button\nabc222 tweak style\nabc333 add feature'
		);
		const result = await signal.compute([file('src/main.ts')], '/repo', dummyConfig);
		expect(result.score).toBe(0);
		expect(result.detail).toContain('No files with >5 fix-commits');
	});

	it('scores 1 when a file has more than 5 fix commits in 90 days', async () => {
		const { runGit } = await import('../gitUtils');
		vi.mocked(runGit).mockResolvedValue(
			Array.from({ length: 7 }, (_, i) => `abc${i} fix commit ${i}`).join('\n')
		);
		const result = await signal.compute([file('src/main.ts')], '/repo', dummyConfig);
		expect(result.score).toBe(1);
		expect(result.detail).toContain('src/main.ts');
		expect(result.detail).toContain('fix commits');
	});

	it('handles git errors gracefully', async () => {
		const { runGit } = await import('../gitUtils');
		vi.mocked(runGit).mockRejectedValue(new Error('git error'));
		const result = await signal.compute([file('src/main.ts')], '/repo', dummyConfig);
		expect(result.score).toBe(0);
	});
});
