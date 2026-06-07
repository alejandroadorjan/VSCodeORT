/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type SkippedRunReasonKind = 'sameCommitFailure' | 'configOrEvent' | 'missingContext' | 'inconclusive';

export interface SkippedRunInsight {
	name: string;
	event: string;
	workflowPath: string;
	branch: string;
	commit: string;
	date: string;
	url: string;
	reasonKind: SkippedRunReasonKind;
	sameCommitFailures: string[];
	sameCommitRunCount: number;
	sameCommitSuccessCount: number;
}
