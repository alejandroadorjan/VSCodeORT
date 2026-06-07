/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface MainFailureAlert {
	name: string;
	statusLabel: string;
	badgeClass: string;
	dotClass: string;
	commit: string;
	date: string;
	duration: string;
	url: string;
}
