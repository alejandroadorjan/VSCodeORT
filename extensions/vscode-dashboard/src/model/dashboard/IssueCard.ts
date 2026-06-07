/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IssueCard {
	number: number;
	title: string;
	closedDate: string;
	labels: string;
	closedBy: string;
	commentCount: string;
}
