/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { exec, execFileSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export type PRFile = {
	filename: string;
	status: string;
	additions?: number;
	deletions?: number;
};

export type RiskConfig = {
	pathScores?: Record<string, number>;
	lines?: { minor?: number; major?: number };
	labels?: { low?: string; medium?: string; high?: string };
	thresholds?: { medium?: number; high?: number };
};

const MAX_BUFFER = 5 * 1024 * 1024;

async function ghApi(path: string): Promise<any> {
	const { stdout } = await execAsync(`gh api -H "Accept: application/vnd.github+json" ${path} --paginate`, { maxBuffer: MAX_BUFFER });
	return JSON.parse(stdout);
}

async function getPullRequestFiles(repository: string, prNumber: string): Promise<PRFile[]> {
	return ghApi(`/repos/${repository}/pulls/${prNumber}/files`) as Promise<PRFile[]>;
}

function normalizePath(p: string) {
	return p.replace(/\\\\/g, '/');
}

function matchesPattern(pattern: string, filename: string): boolean {
	// simple matcher: prefix, exact, or simple glob '*' support
	pattern = pattern.replace(/^\//, '');
	filename = filename.replace(/^\//, '');
	if (pattern === '*') { return true; }
	if (pattern.endsWith('/')) {
		return filename.startsWith(pattern);
	}
	if (pattern.includes('*')) {
		const re = new RegExp('^' + pattern.split('*').map(s => s.replace(/[-\\/\\^$+?.()|[\]{}]/g, '\\$&')).join('.*') + '$');
		return re.test(filename);
	}
	return filename === pattern || filename.startsWith(pattern + '/');
}

export function computePathScore(files: PRFile[], pathScores: Record<string, number>): number {
	let s1 = 0;
	for (const f of files) {
		const p = normalizePath(f.filename);
		for (const pattern of Object.keys(pathScores)) {
			if (matchesPattern(pattern, p)) {
				s1 = Math.max(s1, pathScores[pattern]);
			}
		}
	}
	return s1;
}

export function computeSurfaceScore(files: PRFile[], config: { minor?: number; major?: number }): { s2: number; totalLines: number; hasDts: boolean } {
	const minor = config.minor ?? 200;
	const major = config.major ?? 500;
	let totalLines = 0;
	let hasDts = false;
	for (const f of files) {
		totalLines += (f.additions || 0) + (f.deletions || 0);
		if (f.filename.endsWith('.d.ts')) { hasDts = true; }
	}
	let s2 = 0;
	if (totalLines > major) { s2 += 2; }
	else if (totalLines > minor) { s2 += 1; }
	if (hasDts) { s2 += 1; }
	return { s2, totalLines, hasDts };
}

export async function computeS3(files: PRFile[], repository: string): Promise<number> {
	const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
	let s3 = 0;
	await Promise.all(files.map(async f => {
		if (s3) { return; }
		const cmd = `/repos/${repository}/commits?path=${encodeURIComponent(f.filename)}&since=${since}&per_page=6`;
		try {
			const commits = await ghApi(cmd) as any[];
			const fixCommits = (commits || []).filter((c: any) => (c.commit?.message || '').toLowerCase().includes('fix'));
			if (fixCommits.length > 5) { s3 = 1; }
		} catch (e) {
			// ignore errors per-file
		}
	}));
	return s3;
}

export function computeS4(files: PRFile[]): number {
	const modifiesSrcVs = files.some(f => f.filename.startsWith('src/vs/') && (f.filename.endsWith('.ts') || f.filename.endsWith('.tsx')));
	const modifiesTests = files.some(f => f.filename.includes('/test/') || f.filename.includes('.test.ts') || f.filename.includes('.spec.ts'));
	return (modifiesSrcVs && !modifiesTests) ? 1 : 0;
}

export function determineLabel(total: number, config: RiskConfig): string {
	const thresholds = config.thresholds || {};
	const thresholdMedium = thresholds.medium ?? 3;
	const thresholdHigh = thresholds.high ?? 5;
	let label = config.labels?.low || 'risk:low';
	if (total >= thresholdHigh) { label = config.labels?.high || 'risk:high'; }
	else if (total >= thresholdMedium) { label = config.labels?.medium || 'risk:medium'; }
	return label;
}

export function buildComment(total: number, label: string, s1: number, s2: number, s3: number, s4: number, totalLines: number, hasDts: boolean, owners: string[], isHigh: boolean): string {
	const highRiskChecklist = isHigh ? `\n\n### Review Checklist\n- [ ] Verify backward compatibility\n- [ ] Add or update tests\n- [ ] Review API surface changes\n- [ ] Ensure documentation is updated\n` : '';
	const ownerLine = owners.length ? `\n\n**Suggested owners:** ${owners.map(o => `@${o}`).join(' ')}` : '';
	return `<!-- pr-risk-scoring -->\n**PR Risk Score**: ${total} (${label})\n\n- S1 (path): ${s1}\n- S2 (size/.d.ts): ${s2} (lines=${totalLines}, hasDTS=${hasDts})\n- S3 (recent fixes): ${s3}\n- S4 (tests absent): ${s4}${ownerLine}${highRiskChecklist}`;
}

async function parseCodeowners(): Promise<Record<string, string[]>> {
	try {
		const raw = await fs.readFile('.github/CODEOWNERS', 'utf8');
		const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
		const map: Record<string, string[]> = {};
		for (const line of lines) {
			const parts = line.split(/\s+/);
			if (parts.length >= 2) {
				const pattern = parts[0];
				const owners = parts.slice(1).map(o => o.replace(/^@/, ''));
				map[pattern] = owners;
			}
		}
		return map;
	} catch (e) {
		return {};
	}
}

async function suggestOwnersForFiles(files: PRFile[]) {
	const codeowners = await parseCodeowners();
	const suggested = new Set<string>();
	for (const pattern of Object.keys(codeowners)) {
		for (const f of files) {
			if (matchesPattern(pattern, f.filename)) {
				for (const o of codeowners[pattern]) { suggested.add(o); }
			}
		}
	}
	return Array.from(suggested);
}

async function run() {
	const repository = process.env['REPOSITORY'];
	const pr = process.env['PULL_REQUEST'];
	const doApply = (process.env['DO_APPLY'] || 'false').toLowerCase() === 'true';

	if (!repository || !pr) {
		console.error('Missing REPOSITORY or PULL_REQUEST environment variables');
		process.exit(1);
	}

	const configRaw = await fs.readFile('.github/pr-risk-config.json', 'utf8').catch(() => '{}');
	const config = JSON.parse(configRaw || '{}');

	const files = await getPullRequestFiles(repository, pr);

	const s1 = computePathScore(files, config.pathScores || {});
	const { s2, totalLines, hasDts } = computeSurfaceScore(files, config.lines || {});
	const s3 = await computeS3(files, repository);
	const s4 = computeS4(files);
	const total = s1 + s2 + s3 + s4;
	const label = determineLabel(total, config);

	const owners = await suggestOwnersForFiles(files);

	const summary = {
		repository,
		pr,
		s1, s2, s3, s4,
		total,
		label,
		owners
	};

	console.log(JSON.stringify(summary, null, 2));

	if (doApply) {
		try {
			// Apply label
			execFileSync('gh', ['api', '-X', 'POST', `/repos/${repository}/issues/${pr}/labels`, '--input', '-'], { input: JSON.stringify({ labels: [label] }), maxBuffer: MAX_BUFFER });
		} catch (e) {
			console.warn('Failed to apply label:', (e as Error).message || e);
		}

		// Only post comment for medium and high risk
		if (label === (config.labels?.low || 'risk:low')) {
			console.log('Low risk: label applied, skipping comment.');
		} else {
			try {
				const isHigh = label === (config.labels?.high || 'risk:high');
				const commentBody = buildComment(total, label, s1, s2, s3, s4, totalLines, hasDts, owners, isHigh);
				const marker = '<!-- pr-risk-scoring -->';

				// find existing comment
				const comments = await ghApi(`/repos/${repository}/issues/${pr}/comments`);
				const existing = (comments || []).find((c: any) => (c.body || '').includes(marker));
				if (existing) {
					execFileSync('gh', ['api', '-X', 'PATCH', `/repos/${repository}/issues/comments/${existing.id}`, '--input', '-'], { input: commentBody, maxBuffer: MAX_BUFFER });
				} else {
					execFileSync('gh', ['api', '-X', 'POST', `/repos/${repository}/issues/${pr}/comments`, '--input', '-'], { input: commentBody, maxBuffer: MAX_BUFFER });
				}
			} catch (e) {
				console.warn('Failed to post comment:', (e as Error).message || e);
			}
		}
	} else {
		console.log('Dry run (DO_APPLY!=true). To apply changes set DO_APPLY=true in the workflow or env.');
		console.log('\nComment preview:\n');
		const isHigh = label === (config.labels?.high || 'risk:high');
		console.log(buildComment(total, label, s1, s2, s3, s4, totalLines, hasDts, owners, isHigh));
	}
}

const isMainScript = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainScript) {
	run().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
