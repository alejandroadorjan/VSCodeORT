import type { GitHubUser } from './GitHubUser';

export interface GitHubCommit {
	author?: GitHubUser | null;
}
