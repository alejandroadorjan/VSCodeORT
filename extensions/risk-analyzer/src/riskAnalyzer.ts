import { PRFile, RiskConfig, RiskResult, SignalDetail } from './types';
import { getChangedFiles, parseCodeowners, matchesPattern, normalizePath } from './gitUtils';
import { IRiskSignal } from './signals/signal.interface';
import { PathScoreSignal } from './signals/pathScore.signal';
import { SurfaceScoreSignal } from './signals/surfaceScore.signal';
import { FixHistorySignal } from './signals/fixHistory.signal';
import { TestCoverageSignal } from './signals/testCoverage.signal';

function determineLabel(
	total: number,
	labels: RiskConfig['labels'],
	thresholds: RiskConfig['thresholds']
): string {
	if (total >= thresholds.high) return labels.high;
	if (total >= thresholds.medium) return labels.medium;
	return labels.low;
}

async function resolveOwners(files: PRFile[], repoRoot: string): Promise<string[]> {
	const codeowners = await parseCodeowners(repoRoot);
	const suggested = new Set<string>();
	for (const [pattern, owners] of Object.entries(codeowners)) {
		for (const f of files) {
			if (matchesPattern(pattern, normalizePath(f.filename))) {
				owners.forEach(o => suggested.add(o));
			}
		}
	}
	return Array.from(suggested);
}

export function createDefaultSignals(): IRiskSignal[] {
	return [
		new PathScoreSignal(),
		new SurfaceScoreSignal(),
		new FixHistorySignal(),
		new TestCoverageSignal(),
	];
}

export interface IRiskAnalyzer {
	analyze(repoRoot: string, config: RiskConfig): Promise<RiskResult>;
}

export class RiskAnalyzer implements IRiskAnalyzer {
	constructor(private readonly signals: IRiskSignal[]) {}

	async analyze(repoRoot: string, config: RiskConfig): Promise<RiskResult> {
		const files = await getChangedFiles(repoRoot);

		const signalResults: SignalDetail[] = await Promise.all(
			this.signals.map(s =>
				s.compute(files, repoRoot, config).then(r => ({
					id: s.id,
					score: r.score,
					description: s.description,
					detail: r.detail,
				}))
			)
		);

		const total = signalResults.reduce((sum, s) => sum + s.score, 0);
		const label = determineLabel(total, config.labels, config.thresholds);
		const owners = await resolveOwners(files, repoRoot);

		return { files, total, label, owners, signals: signalResults };
	}
}

export async function analyzeRisk(repoRoot: string, config: RiskConfig): Promise<RiskResult> {
	const analyzer = new RiskAnalyzer(createDefaultSignals());
	return analyzer.analyze(repoRoot, config);
}
