import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PRFile } from './types';

const execAsync = promisify(exec);

export async function runGit(cwd: string, args: string): Promise<string> {
	const { stdout } = await execAsync(`git ${args}`, { cwd, maxBuffer: 5 * 1024 * 1024 });
	return stdout;
}

export function normalizePath(p: string): string {
	return p.replace(/\\/g, '/');
}

export function matchesPattern(pattern: string, filename: string): boolean {
	pattern = pattern.replace(/^\//, '');
	filename = filename.replace(/^\//, '');
	if (pattern === '*') return true;
	if (pattern.endsWith('/')) return filename.startsWith(pattern);
	if (pattern.includes('*')) {
		const re = new RegExp(
			'^' + pattern.split('*').map(s => s.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')).join('.*') + '$'
		);
		return re.test(filename);
	}
	return filename === pattern || filename.startsWith(pattern + '/');
}

export async function parseCodeowners(repoRoot: string): Promise<Record<string, string[]>> {
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
	} catch {
		return {};
	}
}

async function parseGitNumstat(
	cwd: string,
	numstatArg: string,
	nameStatusArg: string
): Promise<Map<string, PRFile>> {
	const files = new Map<string, PRFile>();
	try {
		const [numstat, nameStatus] = await Promise.all([
			runGit(cwd, numstatArg),
			runGit(cwd, nameStatusArg),
		]);

		const statusMap = new Map<string, string>();
		for (const line of nameStatus.trim().split('\n').filter(Boolean)) {
			const parts = line.split('\t');
			statusMap.set(parts[parts.length - 1], parts[0].charAt(0));
		}

		for (const line of numstat.trim().split('\n').filter(Boolean)) {
			const [adds, dels, filename] = line.split('\t');
			if (!filename) continue;
			files.set(filename, {
				filename,
				status: statusMap.get(filename) ?? 'M',
				additions: parseInt(adds) || 0,
				deletions: parseInt(dels) || 0,
			});
		}
	} catch {
		// no changes of this type
	}
	return files;
}

async function parseUntrackedFiles(repoRoot: string): Promise<Map<string, PRFile>> {
	const files = new Map<string, PRFile>();
	try {
		const untracked = await runGit(repoRoot, 'ls-files --others --exclude-standard');
		for (const filename of untracked.trim().split('\n').filter(Boolean)) {
			let additions = 0;
			try {
				const content = await fs.readFile(path.join(repoRoot, filename), 'utf8');
				additions = content.split('\n').length;
			} catch {
				// binary or unreadable
			}
			files.set(filename, { filename, status: '?', additions, deletions: 0 });
		}
	} catch {
		// no untracked files
	}
	return files;
}

function mergeFileMaps(target: Map<string, PRFile>, source: Map<string, PRFile>): void {
	for (const [filename, file] of source) {
		const existing = target.get(filename);
		if (existing) {
			existing.additions += file.additions;
			existing.deletions += file.deletions;
		} else {
			target.set(filename, { ...file });
		}
	}
}

export async function getChangedFiles(repoRoot: string): Promise<PRFile[]> {
	const files = new Map<string, PRFile>();

	mergeFileMaps(files, await parseGitNumstat(repoRoot, 'diff --cached --numstat', 'diff --cached --name-status'));
	mergeFileMaps(files, await parseGitNumstat(repoRoot, 'diff --numstat', 'diff --name-status'));
	mergeFileMaps(files, await parseUntrackedFiles(repoRoot));

	return Array.from(files.values());
}
