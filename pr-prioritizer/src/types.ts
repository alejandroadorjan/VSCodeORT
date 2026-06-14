/**
 * Core types for the PR prioritizer snapshot format and normalized PR model.
 *
 * The snapshot is produced by `fetch` and consumed offline by `analyze`.
 * Keeping them in a single file makes the data contract explicit.
 */

/** Association between a user and the repo — used to distinguish external contributors. */
export type AuthorAssociation =
	| 'OWNER'
	| 'MEMBER'
	| 'COLLABORATOR'
	| 'CONTRIBUTOR'
	| 'FIRST_TIMER'
	| 'FIRST_TIME_CONTRIBUTOR'
	| 'MANNEQUIN'
	| 'NONE';

/** A single review on a PR as returned by /pulls/{n}/reviews */
export interface RawReview {
	state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
	user: { login: string } | null;
	submitted_at: string | null;
}

/** A single file entry from /pulls/{n}/files */
export interface RawFile {
	filename: string;
}

/** A label as returned by the GitHub API */
export interface RawLabel {
	name: string;
}

/**
 * Normalized PR record stored in the snapshot.
 * Fields are chosen to be the minimum needed by signals.ts + score.ts.
 */
export interface NormalizedPR {
	number: number;
	title: string;
	url: string;
	author: string;
	author_association: AuthorAssociation;
	created_at: string;
	draft: boolean;
	/** mergeable_state from the PR detail endpoint */
	mergeable_state: string;
	additions: number;
	deletions: number;
	changed_files: number;
	labels: string[];
	milestone: string | null;
	body: string;
	reviews: RawReview[];
	files: RawFile[];
}

/** Top-level snapshot written by `fetch` and read by `analyze` */
export interface Snapshot {
	repo: string;
	fetched_at: string;
	total_open: number;
	prs: NormalizedPR[];
}
