/**
 * Capa 3 — Onboarding hint para contribuyentes nuevos en una feature area.
 *
 * Si es la primera vez que el workspace toca un área inferida del cambio, muestra
 * un aviso con enlace a Source Code Organization y good-first-issues.
 */
import * as vscode from 'vscode';
import { SOURCE_CODE_ORGANIZATION_URL } from '../github/labels';

const WORKSPACE_SEEN_AREAS_KEY = 'prReadiness.seenFeatureAreas';

export async function showOnboardingForNewAreas(
	extensionContext: vscode.ExtensionContext,
	featureAreas: string[]
): Promise<void> {
	if (featureAreas.length === 0) {
		return;
	}

	const seen = extensionContext.workspaceState.get<string[]>(WORKSPACE_SEEN_AREAS_KEY, []);
	const novel = featureAreas.filter((area) => !seen.includes(area));
	if (novel.length === 0) {
		return;
	}

	const areaList = novel.join(', ');
	const choice = await vscode.window.showInformationMessage(
		`Primera vez trabajando en: ${areaList}. Revisá la organización del código y issues para principiantes.`,
		'Source Code Organization',
		'Ver good-first-issues'
	);

	if (choice === 'Source Code Organization') {
		await vscode.env.openExternal(vscode.Uri.parse(SOURCE_CODE_ORGANIZATION_URL));
	} else if (choice === 'Ver good-first-issues') {
		await vscode.commands.executeCommand('workbench.view.extension.prReadiness');
	}

	await extensionContext.workspaceState.update(WORKSPACE_SEEN_AREAS_KEY, [...seen, ...novel]);
}
