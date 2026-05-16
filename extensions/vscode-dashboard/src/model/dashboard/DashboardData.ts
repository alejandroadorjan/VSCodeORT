import type { GitHubCommit, GitHubIssue, GitHubRepo, GitHubWorkflowRun } from '../github';

export interface DashboardData {
	repo: GitHubRepo;
	workflowRuns: GitHubWorkflowRun[];
	closedIssues: GitHubIssue[];
	openIssuesCount: number;
	openPullRequestsCount: number;
	commits: GitHubCommit[];
}
