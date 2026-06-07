/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface RunInsight {
	name: string;
	title: string;
	statusLabel: string;
	badgeClass: string;
	dotClass: string;
	branch: string;
	commit: string;
	duration: string;
	hasDuration: boolean;
	url: string;
}
