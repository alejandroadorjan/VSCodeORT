/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardMetrics } from './DashboardMetrics';
import type { IssueCard } from './IssueCard';
import type { RunCard } from './RunCard';
import type { WorkflowHistogramItem } from './WorkflowHistogramItem';

export interface DashboardViewModel {
	metrics: DashboardMetrics;
	issueCards: IssueCard[];
	recentRuns: RunCard[];
	workflowSeries: WorkflowHistogramItem[];
	chartLabels: string[];
	chartSuccess: number[];
	chartFailure: number[];
	chartDuration: number[];
}
