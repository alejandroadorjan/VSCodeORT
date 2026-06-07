/**
 * Fetch command — hits the GitHub API and writes a snapshot JSON to disk.
 * This is the ONLY module that performs network I/O.
 * `analyze` never calls this module; it reads the snapshot directly.
 */

import fs from 'fs';
import path from 'path';
import type { Snapshot } from './types.js';
import {
	createClient,
	parseRepo,
	listOpenPRs,
	getPRDetail,
	getPRReviews,
	getPRFiles,
	normalizePR,
} from './github.js';

export interface FetchOptions {
	repo: string;
	limit: number;
	out: string;
	token: string;
}

export async function runFetch(opts: FetchOptions): Promise<void> {
	const { owner, repo } = parseRepo(opts.repo);
	const client = createClient(opts.token);

	console.log(`Fetching open PRs for ${opts.repo} (limit: ${opts.limit})…`);

	// Step 1: list open PRs
	const rawList = await listOpenPRs(client, owner, repo, opts.limit);
	console.log(`  Found ${rawList.length} PRs in listing.`);

	// Step 2: for each PR, fetch detail + reviews + files (N+1 — see github.ts)
	const normalized = [];
	for (let i = 0; i < rawList.length; i++) {
		const listItem = rawList[i];
		const n = listItem.number;
		process.stdout.write(`  [${i + 1}/${rawList.length}] #${n} ${listItem.title.slice(0, 50)}…\r`);

		const [detail, reviews, files] = await Promise.all([
			getPRDetail(client, owner, repo, n),
			getPRReviews(client, owner, repo, n),
			getPRFiles(client, owner, repo, n),
		]);

		normalized.push(normalizePR(listItem, detail, reviews, files));
	}
	process.stdout.write('\n');

	// Step 3: build snapshot
	const snapshot: Snapshot = {
		repo: opts.repo,
		fetched_at: new Date().toISOString(),
		total_open: rawList.length,
		prs: normalized,
	};

	// Step 4: write to disk
	const outDir = path.dirname(opts.out);
	if (outDir && !fs.existsSync(outDir)) {
		fs.mkdirSync(outDir, { recursive: true });
	}
	fs.writeFileSync(opts.out, JSON.stringify(snapshot, null, 2), 'utf8');
	console.log(`Snapshot written to ${opts.out}`);
}
