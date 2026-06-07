/**
 * Capa 3 — GitHub REST API (sin auth en MVP).
 *
 * Busca good-first-issues del repositorio de estudio, opcionalmente filtradas por
 * las feature areas del cambio local. Cache en memoria por sesión para respetar
 * rate limits (60 req/h sin token).
 */
import * as vscode from 'vscode';
import { DEFAULT_GITHUB_REPO, GOOD_FIRST_ISSUE_LABELS, githubLabelsForArea } from './labels';

export interface GoodFirstIssue {
	number: number;
	title: string;
	htmlUrl: string;
	/** Label de área usada en la búsqueda, si aplica. */
	area?: string;
}

interface GitHubSearchResponse {
	items?: Array<{
		number: number;
		title: string;
		html_url: string;
	}>;
}

const SESSION_CACHE = new Map<string, GoodFirstIssue[]>();
const MAX_ISSUES = 8;
const PER_AREA_LIMIT = 4;

function repoFromSettings(): string {
	return vscode.workspace.getConfiguration('prReadiness').get<string>('githubRepo', DEFAULT_GITHUB_REPO);
}

function cacheKey(repo: string, areas: string[]): string {
	return `${repo}::${areas.slice().sort().join(',')}`;
}

async function searchIssues(repo: string, queryParts: string[]): Promise<GoodFirstIssue[]> {
	const q = [`repo:${repo}`, 'is:issue', 'is:open', ...queryParts].join(' ');
	const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${MAX_ISSUES}&sort=updated`;

	const response = await fetch(url, {
		headers: {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'pr-readiness-assistant-vscode-extension',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});

	if (!response.ok) {
		throw new Error(`GitHub API ${response.status}: ${response.statusText}`);
	}

	const body = (await response.json()) as GitHubSearchResponse;
	return (body.items ?? []).map((item) => ({
		number: item.number,
		title: item.title,
		htmlUrl: item.html_url
	}));
}

function goodFirstIssueQuery(): string {
	// Cualquiera de las labels aceptadas por el repo de estudio.
	const labelClause = GOOD_FIRST_ISSUE_LABELS.map((l) => `label:"${l}"`).join(' ');
	return `(${labelClause})`;
}

/** Busca good-first-issues relevantes para las feature areas del cambio. */
export async function fetchGoodFirstIssues(featureAreas: string[]): Promise<GoodFirstIssue[]> {
	const repo = repoFromSettings();
	const key = cacheKey(repo, featureAreas);
	const cached = SESSION_CACHE.get(key);
	if (cached) {
		return cached;
	}

	const collected = new Map<number, GoodFirstIssue>();

	const tryAdd = (issues: GoodFirstIssue[], area?: string): void => {
		for (const issue of issues) {
			if (collected.size >= MAX_ISSUES) {
				return;
			}
			if (!collected.has(issue.number)) {
				collected.set(issue.number, { ...issue, area });
			}
		}
	};

	try {
		for (const area of featureAreas) {
			if (collected.size >= MAX_ISSUES) {
				break;
			}
			for (const label of githubLabelsForArea(area)) {
				const areaIssues = await searchIssues(repo, [goodFirstIssueQuery(), `label:${label}`]);
				tryAdd(areaIssues.slice(0, PER_AREA_LIMIT), area);
				if (areaIssues.length > 0) {
					break;
				}
			}
		}

		if (collected.size === 0) {
			const fallback = await searchIssues(repo, [goodFirstIssueQuery()]);
			tryAdd(fallback);
		}
	} catch {
		// Sin auth el rate limit o errores de red no deben tumbar la evaluación.
		SESSION_CACHE.set(key, []);
		return [];
	}

	const result = [...collected.values()];
	SESSION_CACHE.set(key, result);
	return result;
}
