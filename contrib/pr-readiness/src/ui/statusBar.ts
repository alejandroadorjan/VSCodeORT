/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Capa 3 — Status bar del PR Readiness Score.
 */
import * as vscode from 'vscode';
import type { ReadinessResult } from '../types';

export function applyReadinessToStatusBar(item: vscode.StatusBarItem, result: ReadinessResult): void {
	const icon = scoreIcon(result.score);
	const modeHint = result.mode === 'ai' ? 'evaluado con IA' : 'modo fallback (solo señales locales)';
	item.text = `$(rocket) PR Readiness: ${result.score}/100 ${icon}`;
	item.tooltip = `PR Readiness Score: ${result.score}/100 (${modeHint}). Click para re-evaluar.`;
	item.backgroundColor =
		result.score >= 80
			? undefined
			: result.score >= 60
				? new vscode.ThemeColor('statusBarItem.warningBackground')
				: new vscode.ThemeColor('statusBarItem.errorBackground');
}

function scoreIcon(score: number): string {
	if (score >= 80) {
		return '$(pass-filled)';
	}
	if (score >= 60) {
		return '$(warning)';
	}
	return '$(error)';
}
