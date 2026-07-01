import { IRiskSignal, SignalResult } from './signal.interface';
import { PRFile, RiskConfig } from '../types';

export class TestCoverageSignal implements IRiskSignal {
	readonly id = 'S4';
	readonly description = 'Test coverage';

	async compute(files: PRFile[], _repoRoot: string, _config: RiskConfig): Promise<SignalResult> {
		const modifiesSrcVs = files.some(
			f => f.filename.startsWith('src/vs/') && (f.filename.endsWith('.ts') || f.filename.endsWith('.tsx'))
		);
		const modifiesTests = files.some(
			f => (f.filename.endsWith('.ts') || f.filename.endsWith('.tsx')) &&
				(f.filename.includes('/test/') || f.filename.endsWith('.test.ts') || f.filename.endsWith('.spec.ts'))
		);
		const score = modifiesSrcVs && !modifiesTests ? 1 : 0;
		let detail: string;
		if (!modifiesSrcVs) {
			detail = 'No src/vs/ changes';
		} else if (modifiesTests) {
			detail = 'src/vs/ modified with tests present';
		} else {
			detail = 'src/vs/ modified but no test files touched';
		}
		return { score, detail };
	}
}
