import { IRiskSignal, SignalResult } from './signal.interface';
import { PRFile, RiskConfig } from '../types';

export class SurfaceScoreSignal implements IRiskSignal {
	readonly id = 'S2';
	readonly description = 'Change surface';

	async compute(files: PRFile[], _repoRoot: string, config: RiskConfig): Promise<SignalResult> {
		let totalLines = 0;
		let hasDts = false;
		for (const f of files) {
			totalLines += f.additions + f.deletions;
			if (f.filename.endsWith('.d.ts')) hasDts = true;
		}
		let score = 0;
		if (totalLines > config.lines.major) score += 2;
		else if (totalLines > config.lines.minor) score += 1;
		if (hasDts) score += 1;

		let detail = `${totalLines} lines changed`;
		if (hasDts) detail += ' · includes .d.ts files';

		return { score, detail };
	}
}
