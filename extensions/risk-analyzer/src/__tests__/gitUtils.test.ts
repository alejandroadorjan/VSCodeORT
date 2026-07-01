import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

import { normalizePath, matchesPattern, getChangedFiles, parseCodeowners } from '../gitUtils';

describe('normalizePath', () => {
	it('converts backslashes to forward slashes', () => {
		expect(normalizePath('src\\vs\\workbench')).toBe('src/vs/workbench');
	});

	it('leaves forward slashes unchanged', () => {
		expect(normalizePath('src/vs/workbench')).toBe('src/vs/workbench');
	});

	it('handles mixed slashes', () => {
		expect(normalizePath('src\\vs/workbench\\editor.ts')).toBe('src/vs/workbench/editor.ts');
	});
});

describe('matchesPattern', () => {
	it('matches exact filename', () => {
		expect(matchesPattern('src/main.ts', 'src/main.ts')).toBe(true);
	});

	it('matches prefix with trailing slash', () => {
		expect(matchesPattern('src/vs/', 'src/vs/workbench/editor.ts')).toBe(true);
	});

	it('does not match prefix without trailing slash', () => {
		expect(matchesPattern('src/vs/', 'src/vsx/file.ts')).toBe(false);
	});

	it('matches wildcard *', () => {
		expect(matchesPattern('*', 'anything.ts')).toBe(true);
	});

	it('matches glob pattern', () => {
		expect(matchesPattern('src/**/*.ts', 'src/vs/workbench/editor.ts')).toBe(true);
	});

	it('does not match when pattern does not apply', () => {
		expect(matchesPattern('src/vs/', 'lib/foo.ts')).toBe(false);
	});
});

describe('getChangedFiles', () => {
	let tmpDir: string;

	beforeAll(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-risk-test-'));
		execSync('git init', { cwd: tmpDir });
		execSync('git config user.email test@test.com', { cwd: tmpDir });
		execSync('git config user.name "Test"', { cwd: tmpDir });
	});

	afterAll(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('detects staged new files', async () => {
		await fs.writeFile(path.join(tmpDir, 'index.ts'), 'line1\nline2\nline3\n');
		execSync('git add index.ts', { cwd: tmpDir });
		const files = await getChangedFiles(tmpDir);
		const match = files.find(f => f.filename === 'index.ts');
		expect(match).toBeDefined();
		expect(match!.additions).toBe(3);
		expect(match!.status).toBe('A');
	});

	it('detects untracked files', async () => {
		await fs.writeFile(path.join(tmpDir, 'untracked.ts'), 'hello');
		const files = await getChangedFiles(tmpDir);
		const match = files.find(f => f.filename === 'untracked.ts');
		expect(match).toBeDefined();
		expect(match!.status).toBe('?');
		expect(match!.additions).toBe(1);
	});

	it('merges staged and unstaged changes for the same file', async () => {
		const f = path.join(tmpDir, 'merge-test.ts');
		await fs.writeFile(f, 'line1\n');
		execSync('git add merge-test.ts', { cwd: tmpDir });
		execSync('git commit -m "initial"', { cwd: tmpDir });
		await fs.writeFile(f, 'line1\nline2\nline3\n');
		execSync('git add merge-test.ts', { cwd: tmpDir });
		await fs.appendFile(f, 'line4\n');
		const files = await getChangedFiles(tmpDir);
		const match = files.find(f => f.filename === 'merge-test.ts');
		expect(match).toBeDefined();
		expect(match!.additions).toBe(3);
	});
});

describe('parseCodeowners', () => {
	let tmpDir: string;

	beforeAll(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-risk-codeowners-'));
		await fs.mkdir(path.join(tmpDir, '.github'), { recursive: true });
		await fs.writeFile(
			path.join(tmpDir, '.github', 'CODEOWNERS'),
			'# comment\n*src/vs/ @team-core @team-platform\nsrc/vscode-dts/ @team-api\n'
		);
	});

	afterAll(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it('parses CODEOWNERS correctly', async () => {
		const owners = await parseCodeowners(tmpDir);
		expect(owners['*src/vs/']).toEqual(['team-core', 'team-platform']);
		expect(owners['src/vscode-dts/']).toEqual(['team-api']);
	});

	it('returns empty object when no CODEOWNERS exists', async () => {
		const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-risk-no-owners-'));
		try {
			const owners = await parseCodeowners(emptyDir);
			expect(owners).toEqual({});
		} finally {
			await fs.rm(emptyDir, { recursive: true, force: true });
		}
	});
});
