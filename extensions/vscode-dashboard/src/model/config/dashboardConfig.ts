/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DashboardReleaseSource = 'main' | 'tags';

export interface DashboardConfig {
	owner: string;
	repo: string;
	token: string | null;
	releaseSource: DashboardReleaseSource;
}
