export type PRFile = {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
};

export type RiskConfig = {
	pathScores: Record<string, number>;
	lines: { minor: number; major: number };
	labels: { low: string; medium: string; high: string };
	thresholds: { medium: number; high: number };
};

export type SignalDetail = {
	id: string;
	score: number;
	description: string;
	detail: string;
};

export type RiskResult = {
	files: PRFile[];
	total: number;
	label: string;
	owners: string[];
	signals: SignalDetail[];
};
