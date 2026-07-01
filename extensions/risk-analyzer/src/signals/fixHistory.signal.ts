import { IRiskSignal, SignalResult } from './signal.interface';
import { PRFile, RiskConfig } from '../types';
import { runGit } from '../gitUtils';

export class FixHistorySignal implements IRiskSignal {
	readonly id = 'S3';
	readonly description = 'Recent fix history';

	async compute(files: PRFile[], repoRoot: string, _config: RiskConfig): Promise<SignalResult> {
		const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
		const sinceStr = since.toISOString().split('T')[0];
		let score = 0;
		const hotFiles: string[] = [];

		await Promise.all(files.map(async f => {
			try {
				const log = await runGit(repoRoot, `log --oneline --since="${sinceStr}" -- "${f.filename}"`);
				const commits = log.trim().split('\n').filter(Boolean);
				const fixCount = commits.filter(c => c.toLowerCase().includes('fix')).length;
				if (fixCount > 5) {
					score = 1;
					hotFiles.push(`${f.filename} (${fixCount} fix commits in 90d)`);
				}
			} catch {
				// ignore per-file errors
			}
		}));

		return {
			score,
			detail: hotFiles.length > 0
				? hotFiles.join('\n')
				: 'No files with >5 fix-commits in the last 90 days',
		};
	}
}
