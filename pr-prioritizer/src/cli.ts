/**
 * CLI entry point — parses arguments and dispatches to fetch or analyze.
 *
 * Usage:
 *   tsx src/cli.ts fetch   --repo microsoft/vscode --limit 50 --out data/snapshot.json
 *   tsx src/cli.ts analyze --in data/snapshot.json  --out report/report.md  --top 25
 *   tsx src/cli.ts report  --repo microsoft/vscode --limit 50 --out report/report.md
 */

import fs from 'fs';
import path from 'path';
import type { Snapshot } from './types.js';
import { runFetch } from './fetch.js';
import { scorePRs } from './score.js';
import { buildReport } from './report.js';

/** Minimal flag parser — keeps zero extra deps */
function parseArgs(argv: string[]): Record<string, string> {
	const result: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const key = argv[i].slice(2);
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith('--')) {
				result[key] = next;
				i++;
			} else {
				result[key] = 'true';
			}
		}
	}
	return result;
}

function requireFlag(flags: Record<string, string>, name: string): string {
	const v = flags[name];
	if (!v) { throw new Error(`Missing required flag --${name}`); }
	return v;
}

async function cmdFetch(flags: Record<string, string>): Promise<void> {
	const token = process.env['GITHUB_TOKEN'] ?? '';
	if (!token) {
		console.warn('Warning: GITHUB_TOKEN not set. Rate limit will be very low (60 req/hour).');
	}
	await runFetch({
		repo: requireFlag(flags, 'repo'),
		limit: parseInt(flags['limit'] ?? '50', 10),
		out: flags['out'] ?? `data/snapshot-${new Date().toISOString().slice(0, 10)}.json`,
		token,
	});
}

function cmdAnalyze(flags: Record<string, string>): void {
	const inFile = flags['in'] ?? 'fixtures/sample-prs.json';
	const outFile = flags['out'] ?? 'report/report.md';
	const top = parseInt(flags['top'] ?? '25', 10);

	if (!fs.existsSync(inFile)) {
		throw new Error(`Snapshot file not found: ${inFile}`);
	}

	const snapshot: Snapshot = JSON.parse(fs.readFileSync(inFile, 'utf8'));
	const { ranked, filtered, internal } = scorePRs(snapshot.prs);
	const report = buildReport(snapshot, ranked, filtered, internal, { top });

	const outDir = path.dirname(outFile);
	if (outDir && !fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}
	fs.writeFileSync(outFile, report, 'utf8');

	console.log(`Report written to ${outFile}`);
	console.log(`  ${ranked.length} ranked | ${filtered.length} blocked | ${internal.length} internal`);
}

async function cmdReport(flags: Record<string, string>): Promise<void> {
	const snapshotPath = `data/snapshot-${new Date().toISOString().slice(0, 10)}.json`;
	await cmdFetch({ ...flags, out: flags['out-snapshot'] ?? snapshotPath });
	cmdAnalyze({ ...flags, in: snapshotPath });
}

async function main(): Promise<void> {
	const [, , command, ...rest] = process.argv;
	const flags = parseArgs(rest);

	switch (command) {
		case 'fetch':
			await cmdFetch(flags);
			break;
		case 'analyze':
			cmdAnalyze(flags);
			break;
		case 'report':
			await cmdReport(flags);
			break;
		default:
			console.error(`Unknown command: ${command ?? '(none)'}`);
			console.error('Usage: tsx src/cli.ts <fetch|analyze|report> [flags]');
			process.exit(1);
	}
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
