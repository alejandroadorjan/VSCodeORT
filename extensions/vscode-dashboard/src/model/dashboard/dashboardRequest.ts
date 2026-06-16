/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardReleaseSource } from '../config/dashboardConfig';

export interface DashboardRequest {
	owner: string;
	repo: string;
	token: string | null;
	releaseSource: DashboardReleaseSource;
}
