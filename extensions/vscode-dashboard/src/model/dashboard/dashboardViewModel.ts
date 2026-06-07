/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DashboardMetrics } from './dashboardMetrics';
import type { IssueCard } from './issueCard';
import type { MainFailureAlert } from './mainFailureAlert';
import type { RunCard } from './runCard';
import type { RunInsight } from './runInsight';
import type { SkippedRunInsight } from './skippedRunInsight';
import type { WorkflowHistogramItem } from './workflowHistogramItem';

export interface DashboardViewModel {
	metrics: DashboardMetrics;
	issueCards: IssueCard[];
	recentRuns: RunCard[];
	runDiagnostics: RunInsight[];
	runInsights: RunInsight[];
	mainFailureAlerts: MainFailureAlert[];
	skippedRunInsights: SkippedRunInsight[];
	workflowSeries: WorkflowHistogramItem[];
}
