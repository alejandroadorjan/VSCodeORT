/**
 * Capa 3 — Orquestación post-evaluación (UI + GitHub + onboarding).
 *
 * Recibe el `ReadinessResult` del motor y actualiza panel, status bar, hints y
 * good-first-issues sin acoplar la Capa 2 a la presentación.
 */
import * as vscode from 'vscode';
import { fetchGoodFirstIssues } from '../github/goodFirstIssues';
import { showOnboardingForNewAreas } from './onboarding';
import { applyReadinessToStatusBar } from './statusBar';
import { ReadinessTreeProvider } from './treeView';
import type { ReadinessResult, RepoContext } from '../types';

export function presentEvaluation(
	extensionContext: vscode.ExtensionContext,
	tree: ReadinessTreeProvider,
	statusBar: vscode.StatusBarItem,
	repoContext: RepoContext,
	result: ReadinessResult
): void {
	tree.update({
		result,
		featureAreas: repoContext.featureAreas,
		issuesLoading: true
	});
	applyReadinessToStatusBar(statusBar, result);

	void showOnboardingForNewAreas(extensionContext, repoContext.featureAreas);
	void refreshGoodFirstIssues(tree, result, repoContext.featureAreas);
}

async function refreshGoodFirstIssues(
	tree: ReadinessTreeProvider,
	result: ReadinessResult,
	featureAreas: string[]
): Promise<void> {
	const issues = await fetchGoodFirstIssues(featureAreas);
	tree.update({
		result,
		featureAreas,
		goodFirstIssues: issues,
		issuesLoading: false
	});
}
