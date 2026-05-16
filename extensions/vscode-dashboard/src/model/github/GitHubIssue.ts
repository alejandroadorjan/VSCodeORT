import type { GitHubLabel } from './GitHubLabel';
import type { GitHubUser } from './GitHubUser';

export interface GitHubIssue {
	number: number;
	title: string;
	closed_at?: string | null;
	comments?: number;
	labels?: GitHubLabel[];
	closed_by?: GitHubUser | null;
	pull_request?: unknown;
}
