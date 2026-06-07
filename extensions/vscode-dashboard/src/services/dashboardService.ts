/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getClosedIssues, getCommits, getCompareCommits, getOpenIssuesCount, getOpenPullRequestsCount, getReleases, getRepo, getTags, getWorkflowRuns, getWorkflowRunsForBranch, type GitHubClientOptions } from '../data/githubClient';
import type { DashboardData, DashboardRequest, ReleaseChange } from '../model/dashboard';
import type { GitHubCommit, GitHubRelease, GitHubTag, GitHubWorkflowRun } from '../model/github';

const DASHBOARD_DATA_CACHE_MS = 5 * 60 * 1000;
const WORKFLOW_RUNS_PER_PAGE = 50;
const WORKFLOW_RUN_PAGE_LIMIT = 2;
const RELEASE_WORKFLOW_RUN_LIMIT = 3;
const RELEASE_COMPARE_LIMIT = 4;

interface DashboardDataCacheEntry {
	readonly createdAt: number;
	readonly data: DashboardData;
}

const dashboardDataCache = new Map<string, DashboardDataCacheEntry>();

function getCacheKey(request: DashboardRequest): string {
	return [
		request.owner,
		request.repo,
		request.releaseSource,
		request.token ? 'authenticated' : 'anonymous',
	].join('/');
}

function isVersionTag(name: string): boolean {
	return /^v?\d+\.\d+\.\d+(?:[-+].*)?$/.test(name);
}

function getReleaseDate(release: GitHubRelease): string {
	return release.published_at ?? release.created_at ?? '';
}

function releasesToTags(releases: GitHubRelease[]): GitHubTag[] {
	return releases
		.filter((release): release is GitHubRelease & { tag_name: string } => Boolean(release.tag_name && isVersionTag(release.tag_name) && !release.draft))
		.map(release => ({ name: release.tag_name }));
}

function dedupeWorkflowRuns(runs: GitHubWorkflowRun[]): GitHubWorkflowRun[] {
	const seenIds = new Set<number>();
	const uniqueRuns: GitHubWorkflowRun[] = [];

	for (const run of runs) {
		if (run.id !== undefined && seenIds.has(run.id)) {
			continue;
		}

		if (run.id !== undefined) {
			seenIds.add(run.id);
		}
		uniqueRuns.push(run);
	}

	return uniqueRuns;
}

function getCommitDate(commit: GitHubCommit): string | undefined {
	return commit.commit?.author?.date ?? commit.commit?.committer?.date ?? undefined;
}

async function getReleaseChanges(options: GitHubClientOptions, releases: GitHubRelease[]): Promise<ReleaseChange[]> {
	const versionedReleases = releases
		.filter((release): release is GitHubRelease & { tag_name: string } => Boolean(release.tag_name && isVersionTag(release.tag_name) && getReleaseDate(release)))
		.sort((left, right) => new Date(getReleaseDate(left)).getTime() - new Date(getReleaseDate(right)).getTime())
		.slice(-RELEASE_COMPARE_LIMIT);
	const changes: ReleaseChange[] = [];

	for (let index = 1; index < versionedReleases.length; index++) {
		const previousRelease = versionedReleases[index - 1];
		const currentRelease = versionedReleases[index];
		const commits = await getCompareCommits(options, previousRelease.tag_name, currentRelease.tag_name);

		changes.push({
			releaseName: currentRelease.tag_name,
			releaseDate: getReleaseDate(currentRelease),
			commitDates: commits.map(getCommitDate).filter((date): date is string => Boolean(date)),
		});
	}

	return changes;
}

export async function loadDashboardData(request: DashboardRequest): Promise<DashboardData> {
	const cacheKey = getCacheKey(request);
	const cached = dashboardDataCache.get(cacheKey);
	if (cached && Date.now() - cached.createdAt < DASHBOARD_DATA_CACHE_MS) {
		return cached.data;
	}

	const options = {
		owner: request.owner,
		repo: request.repo,
		token: request.token,
	};

	const [repo, workflowRuns, releases, closedIssues, openIssuesCount, openPullRequestsCount, commits] = await Promise.all([
		getRepo(options),
		getWorkflowRuns({ ...options, perPage: WORKFLOW_RUNS_PER_PAGE, maxPages: WORKFLOW_RUN_PAGE_LIMIT }),
		request.releaseSource === 'tags' ? getReleases(options) : Promise.resolve([]),
		getClosedIssues(options),
		getOpenIssuesCount(options),
		getOpenPullRequestsCount(options),
		getCommits(options),
	]);
	const releaseTags = request.releaseSource === 'tags' ? releasesToTags(releases) : [];
	const fallbackTags = request.releaseSource === 'tags' && releaseTags.length === 0
		? (await getTags(options)).filter((tag): tag is GitHubTag & { name: string } => Boolean(tag.name && isVersionTag(tag.name)))
		: [];
	const doraReleaseTags = releaseTags.length > 0 ? releaseTags : fallbackTags;
	const releaseTagNames = doraReleaseTags.map(tag => tag.name).filter((name): name is string => Boolean(name));
	const releaseWorkflowRuns = request.releaseSource === 'tags'
		? (await Promise.all(releaseTagNames.slice(0, RELEASE_WORKFLOW_RUN_LIMIT).map(tagName => getWorkflowRunsForBranch({ ...options, perPage: WORKFLOW_RUNS_PER_PAGE, maxPages: 1 }, tagName)))).flat()
		: [];
	const releaseChanges = request.releaseSource === 'tags' && releases.length > 1 ? await getReleaseChanges(options, releases) : [];

	const data = {
		repo,
		workflowRuns: dedupeWorkflowRuns([...workflowRuns, ...releaseWorkflowRuns]),
		releaseSource: request.releaseSource,
		releases,
		releaseTags: doraReleaseTags,
		releaseChanges,
		closedIssues,
		openIssuesCount,
		openPullRequestsCount,
		commits,
	};

	dashboardDataCache.set(cacheKey, {
		createdAt: Date.now(),
		data,
	});

	return data;
}
