import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

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
	s1: number;
	s2: number;
	s3: number;
	s4: number;
	total: number;
	label: string;
	totalLines: number;
	hasDts: boolean;
	owners: string[];
	signals: SignalDetail[];
};

async function runGit(cwd: string, args: string): Promise<string> {
	const { stdout } = await execAsync(`git ${args}`, { cwd, maxBuffer: 5 * 1024 * 1024 });
	return stdout;
}

export async function getChangedFiles(repoRoot: string): Promise<PRFile[]> {
	const files = new Map<string, PRFile>();

	// Staged files: git diff --cached
	try {
		const numstat = await runGit(repoRoot, 'diff --cached --numstat');
		const nameStatus = await runGit(repoRoot, 'diff --cached --name-status');

		const statusMap = new Map<string, string>();
		for (const line of nameStatus.trim().split('\n').filter(Boolean)) {
			const parts = line.split('\t');
			// R100\told\tnew — take the last part as filename
			statusMap.set(parts[parts.length - 1], parts[0].charAt(0));
		}

		for (const line of numstat.trim().split('\n').filter(Boolean)) {
			const [adds, dels, filename] = line.split('\t');
			if (!filename) { continue; }
			files.set(filename, {
				filename,
				status: statusMap.get(filename) ?? 'M',
				additions: parseInt(adds) || 0,
				deletions: parseInt(dels) || 0,
			});
		}
	} catch (_) {
		// no staged changes
	}

	// Unstaged tracked changes: git diff (working tree vs index)
	try {
		const numstat = await runGit(repoRoot, 'diff --numstat');
		const nameStatus = await runGit(repoRoot, 'diff --name-status');

		const statusMap = new Map<string, string>();
		for (const line of nameStatus.trim().split('\n').filter(Boolean)) {
			const parts = line.split('\t');
			statusMap.set(parts[parts.length - 1], parts[0].charAt(0));
		}

		for (const line of numstat.trim().split('\n').filter(Boolean)) {
			const [adds, dels, filename] = line.split('\t');
			if (!filename) { continue; }
			const existing = files.get(filename);
			if (existing) {
				// file is both staged and modified in working tree — add the working-tree delta
				existing.additions += parseInt(adds) || 0;
				existing.deletions += parseInt(dels) || 0;
			} else {
				files.set(filename, {
					filename,
					status: statusMap.get(filename) ?? 'M',
					additions: parseInt(adds) || 0,
					deletions: parseInt(dels) || 0,
				});
			}
		}
	} catch (_) {
		// no unstaged changes
	}

	// Untracked (new, not yet staged)
	try {
		const untracked = await runGit(repoRoot, 'ls-files --others --exclude-standard');
		for (const filename of untracked.trim().split('\n').filter(Boolean)) {
			if (files.has(filename)) { continue; }
			let additions = 0;
			try {
				const content = await fs.readFile(path.join(repoRoot, filename), 'utf8');
				additions = content.split('\n').length;
			} catch (_) {
				// binary or unreadable file
			}
			files.set(filename, { filename, status: '?', additions, deletions: 0 });
		}
	} catch (_) {
		// no untracked files
	}

	return Array.from(files.values());
}

function normalizePath(p: string): string {
	return p.replace(/\\/g, '/');
}

function matchesPattern(pattern: string, filename: string): boolean {
	pattern = pattern.replace(/^\//, '');
	filename = filename.replace(/^\//, '');
	if (pattern === '*') { return true; }
	if (pattern.endsWith('/')) { return filename.startsWith(pattern); }
	if (pattern.includes('*')) {
		const re = new RegExp(
			'^' + pattern.split('*').map(s => s.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')).join('.*') + '$'
		);
		return re.test(filename);
	}
	return filename === pattern || filename.startsWith(pattern + '/');
}

export function computePathScore(
	files: PRFile[],
	pathScores: Record<string, number>
): { score: number; matchedFiles: string[] } {
	let score = 0;
	const matchedFiles: string[] = [];
	for (const f of files) {
		const p = normalizePath(f.filename);
		for (const pattern of Object.keys(pathScores)) {
			if (matchesPattern(pattern, p)) {
				const patternScore = pathScores[pattern];
				if (patternScore > score) {
					score = patternScore;
				}
				matchedFiles.push(`${f.filename} (pattern "${pattern}", score ${patternScore})`);
			}
		}
	}
	return { score, matchedFiles };
}

export function computeSurfaceScore(
	files: PRFile[],
	config: { minor: number; major: number }
): { score: number; totalLines: number; hasDts: boolean } {
	let totalLines = 0;
	let hasDts = false;
	for (const f of files) {
		totalLines += f.additions + f.deletions;
		if (f.filename.endsWith('.d.ts')) { hasDts = true; }
	}
	let score = 0;
	if (totalLines > config.major) { score += 2; }
	else if (totalLines > config.minor) { score += 1; }
	if (hasDts) { score += 1; }
	return { score, totalLines, hasDts };
}

export async function computeFixHistory(
	files: PRFile[],
	repoRoot: string
): Promise<{ score: number; hotFiles: string[] }> {
	const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
	// git accepts YYYY-MM-DD for --since
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
		} catch (_) {
			// ignore per-file errors
		}
	}));

	return { score, hotFiles };
}

export function computeTestCoverage(files: PRFile[]): { score: number; detail: string } {
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

export function determineLabel(
	total: number,
	labels: RiskConfig['labels'],
	thresholds: RiskConfig['thresholds']
): string {
	if (total >= thresholds.high) { return labels.high; }
	if (total >= thresholds.medium) { return labels.medium; }
	return labels.low;
}

async function parseCodeowners(repoRoot: string): Promise<Record<string, string[]>> {
	try {
		const raw = await fs.readFile(path.join(repoRoot, '.github', 'CODEOWNERS'), 'utf8');
		const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
		const map: Record<string, string[]> = {};
		for (const line of lines) {
			const parts = line.trim().split(/\s+/);
			if (parts.length >= 2) {
				map[parts[0]] = parts.slice(1).map(o => o.replace(/^@/, ''));
			}
		}
		return map;
	} catch (_) {
		return {};
	}
}

export async function analyzeRisk(repoRoot: string, config: RiskConfig): Promise<RiskResult> {
	const files = await getChangedFiles(repoRoot);

	const { score: s1, matchedFiles } = computePathScore(files, config.pathScores);
	const { score: s2, totalLines, hasDts } = computeSurfaceScore(files, config.lines);
	const { score: s3, hotFiles } = await computeFixHistory(files, repoRoot);
	const { score: s4, detail: testDetail } = computeTestCoverage(files);

	const total = s1 + s2 + s3 + s4;
	const label = determineLabel(total, config.labels, config.thresholds);

	// Suggest owners from CODEOWNERS
	const codeowners = await parseCodeowners(repoRoot);
	const suggested = new Set<string>();
	for (const [pattern, owners] of Object.entries(codeowners)) {
		for (const f of files) {
			if (matchesPattern(pattern, normalizePath(f.filename))) {
				owners.forEach(o => suggested.add(o));
			}
		}
	}

	const signals: SignalDetail[] = [
		{
			id: 'S1',
			score: s1,
			description: 'Critical path',
			detail: matchedFiles.length > 0
				? matchedFiles.join('\n')
				: 'No files match critical path patterns',
		},
		{
			id: 'S2',
			score: s2,
			description: 'Change surface',
			detail: `${totalLines} lines changed${hasDts ? ' · includes .d.ts files' : ''}`,
		},
		{
			id: 'S3',
			score: s3,
			description: 'Recent fix history',
			detail: hotFiles.length > 0
				? hotFiles.join('\n')
				: 'No files with >5 fix-commits in the last 90 days',
		},
		{
			id: 'S4',
			score: s4,
			description: 'Test coverage',
			detail: testDetail,
		},
	];

	return {
		files,
		s1, s2, s3, s4,
		total,
		label,
		totalLines,
		hasDts,
		owners: Array.from(suggested),
		signals,
	};
}
