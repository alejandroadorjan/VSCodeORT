import type { GitHubSearchResult, GitHubWorkflowRun } from '../model/github';

export interface GitHubSearchResponse extends GitHubSearchResult {
	items?: unknown[];
}

export interface GitHubRunsResponse {
	workflow_runs?: GitHubWorkflowRun[];
}
