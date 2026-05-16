export interface GitHubWorkflowRun {
	id?: number;
	name?: string;
	head_branch?: string;
	conclusion?: string | null;
	status?: string;
	run_started_at?: string | null;
	updated_at?: string | null;
	workflow_name?: string;
}
