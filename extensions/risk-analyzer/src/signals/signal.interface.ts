import { PRFile, RiskConfig } from '../types';

export type SignalResult = {
	score: number;
	detail: string;
};

export interface IRiskSignal {
	readonly id: string;
	readonly description: string;
	compute(files: PRFile[], repoRoot: string, config: RiskConfig): Promise<SignalResult>;
}
