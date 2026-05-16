import { getClosedIssues, getCommits, getOpenIssuesCount, getOpenPullRequestsCount, getRepo, getWorkflowRuns } from '../data/githubClient';
import type { DashboardData, DashboardRequest } from '../model/dashboard';

export async function loadDashboardData(request: DashboardRequest): Promise<DashboardData> {
	const options = {
		owner: request.owner,
		repo: request.repo,
		token: request.token,
	};

	const [repo, workflowRuns, closedIssues, openIssuesCount, openPullRequestsCount, commits] = await Promise.all([
		getRepo(options),
		getWorkflowRuns({ ...options, perPage: 100, maxPages: 3 }),
		getClosedIssues(options),
		getOpenIssuesCount(options),
		getOpenPullRequestsCount(options),
		getCommits(options),
	]);

	return {
		repo,
		workflowRuns,
		closedIssues,
		openIssuesCount,
		openPullRequestsCount,
		commits,
	};
}
