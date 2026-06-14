/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Capa 1 — Implementación de `AiClient` sobre la Claude API (Anthropic SDK).
 *
 * Lo provee Antonio; lo usa el motor de reglas de Tommy (Capa 2) para generar
 * el score y evaluar el checklist semántico. Características:
 *   - Structured output: la respuesta se valida contra un JSON Schema.
 *   - Prompt caching: el system prompt (instrucciones + guidelines) es constante
 *     y se cachea con `cache_control: ephemeral`, abaratando llamadas repetidas.
 *   - Thinking adaptativo: Claude decide cuánto razonar; `effort` ajusta el gasto.
 *   - Key segura: resuelta desde SecretStorage / env / setting (ver apiKey.ts).
 *
 * Nota: el SDK estructura todo a través de `messages.create`. Si `npm run typecheck`
 * marca `output_config` / `thinking.adaptive`, actualizá `@anthropic-ai/sdk` — el
 * bundle de esbuild (que no chequea tipos) corre igual.
 */
import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { AiUnavailableError, type AiClient, type AiCompleteOptions } from '../types';
import { resolveApiKey } from './apiKey';

type Effort = 'low' | 'medium' | 'high';

export class AnthropicAiClient implements AiClient {
	constructor(private readonly context: vscode.ExtensionContext) {}

	async isAvailable(): Promise<boolean> {
		return Boolean(await resolveApiKey(this.context));
	}

	async complete<T>(opts: AiCompleteOptions): Promise<T> {
		const apiKey = await resolveApiKey(this.context);
		if (!apiKey) {
			throw new AiUnavailableError();
		}

		const config = vscode.workspace.getConfiguration('prReadiness');
		const model = config.get<string>('model', 'claude-opus-4-8');
		const effort = config.get<Effort>('effort', 'medium');

		const client = new Anthropic({ apiKey });

		const params: Anthropic.MessageCreateParamsNonStreaming = {
			model,
			max_tokens: opts.maxTokens ?? 4096,
			thinking: { type: 'adaptive' },
			output_config: {
				effort,
				format: { type: 'json_schema', schema: opts.schema }
			},
			// El system prompt es constante entre llamadas → se cachea.
			system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
			messages: [{ role: 'user', content: opts.user }]
		};

		const response = await client.messages.create(params);

		const text = response.content.find((b) => b.type === 'text')?.text;
		if (!text) {
			throw new Error('La IA no devolvió contenido de texto.');
		}

		try {
			return JSON.parse(text) as T;
		} catch {
			throw new Error(`La IA devolvió un JSON inválido: ${text.slice(0, 200)}`);
		}
	}
}
