/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface WorkflowDurationInsight {
	name: string;
	branch: string;
	commit: string;
	duration: string;
	durationSeconds: number;
	url: string;
}
