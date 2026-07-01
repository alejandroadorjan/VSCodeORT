import { IRiskSignal, SignalResult } from './signal.interface';
import { PRFile, RiskConfig } from '../types';
import { normalizePath, matchesPattern } from '../gitUtils';

export class PathScoreSignal implements IRiskSignal {
	readonly id = 'S1';
	readonly description = 'Critical path';

	async compute(files: PRFile[], _repoRoot: string, config: RiskConfig): Promise<SignalResult> {
		let score = 0;
		const matched: string[] = [];
		for (const f of files) {
			const p = normalizePath(f.filename);
			for (const pattern of Object.keys(config.pathScores)) {
				if (matchesPattern(pattern, p)) {
					const patternScore = config.pathScores[pattern];
					if (patternScore > score) score = patternScore;
					matched.push(`${f.filename} (pattern "${pattern}", score ${patternScore})`);
				}
			}
		}
		return {
			score,
			detail: matched.length > 0 ? matched.join('\n') : 'No files match critical path patterns',
		};
	}
}
