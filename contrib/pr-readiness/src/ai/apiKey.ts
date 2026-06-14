/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Resolución segura de la API key de Anthropic.
 *
 * Orden de prioridad:
 *   1. SecretStorage de VS Code (cifrada, vía comando "Configurar API Key"). ← recomendado
 *   2. Variable de entorno ANTHROPIC_API_KEY.
 *   3. Setting `prReadiness.apiKey` (texto plano, desaconsejado).
 *
 * La key NUNCA se hardcodea ni se commitea.
 */
import * as vscode from 'vscode';

/** Clave bajo la que se guarda el secreto en SecretStorage. */
const SECRET_KEY = 'prReadiness.anthropicApiKey';

export async function resolveApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	const fromSecret = await context.secrets.get(SECRET_KEY);
	if (fromSecret) {
		return fromSecret;
	}
	const fromEnv = process.env.ANTHROPIC_API_KEY;
	if (fromEnv) {
		return fromEnv;
	}
	const fromSetting = vscode.workspace.getConfiguration('prReadiness').get<string>('apiKey');
	return fromSetting || undefined;
}

/** Pide la key por un input box y la guarda cifrada en SecretStorage. */
export async function promptAndStoreApiKey(context: vscode.ExtensionContext): Promise<boolean> {
	const value = await vscode.window.showInputBox({
		title: 'Anthropic API Key',
		prompt: 'Pegá tu API key de Anthropic (console.anthropic.com → Settings → API Keys). Se guarda cifrada en SecretStorage.',
		placeHolder: 'sk-ant-...',
		password: true,
		ignoreFocusOut: true,
		validateInput: (v) =>
			v.trim().startsWith('sk-ant-') ? undefined : 'La key debería empezar con "sk-ant-".'
	});
	if (!value) {
		return false;
	}
	await context.secrets.store(SECRET_KEY, value.trim());
	return true;
}

/** Borra la key de SecretStorage. */
export async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
	await context.secrets.delete(SECRET_KEY);
}
