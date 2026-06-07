/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface WorkflowFailureRun {
	title: string;
	branch: string;
	commit: string;
	date: string;
	duration: string;
	url: string;
}

export interface WorkflowHistogramItem {
	label: string;
	success: number;
	failure: number;
	durationSeconds: number;
	failures: WorkflowFailureRun[];
}
