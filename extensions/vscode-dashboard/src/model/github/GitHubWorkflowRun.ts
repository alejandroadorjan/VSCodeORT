/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface GitHubWorkflowRun {
	id?: number;
	name?: string;
	display_title?: string;
	event?: string;
	head_branch?: string;
	head_sha?: string;
	path?: string;
	conclusion?: string | null;
	status?: string;
	run_started_at?: string | null;
	updated_at?: string | null;
	workflow_name?: string;
	html_url?: string;
	jobs_url?: string;
}
