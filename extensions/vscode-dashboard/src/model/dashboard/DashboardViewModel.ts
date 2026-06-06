/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardMetrics } from './DashboardMetrics';
import type { IssueCard } from './IssueCard';
import type { MainFailureAlert } from './MainFailureAlert';
import type { RunCard } from './RunCard';
import type { RunInsight } from './RunInsight';
import type { WorkflowHistogramItem } from './WorkflowHistogramItem';

export interface DashboardViewModel {
	metrics: DashboardMetrics;
	issueCards: IssueCard[];
	recentRuns: RunCard[];
	runDiagnostics: RunInsight[];
	runInsights: RunInsight[];
	mainFailureAlerts: MainFailureAlert[];
	workflowSeries: WorkflowHistogramItem[];
}
