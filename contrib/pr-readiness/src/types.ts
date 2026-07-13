/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Contratos compartidos entre las 3 capas del PR Readiness Assistant.
 *
 * Dueño: Antonio (Capa 1). Cualquier cambio de forma se coordina con Tommy (Capa 2)
 * y Nico (Capa 3), porque estos tipos son el "pegamento" que permite trabajar en
 * paralelo con mocks.
 *
 *   Capa 1 (Git)   produce  RepoContext   ──▶  Capa 2 (Engine)
 *   Capa 1 (AI)    expone   AiClient      ──▶  Capa 2 (Engine)
 *   Capa 2 (Engine) produce ReadinessResult ─▶ Capa 3 (UI)
 */

/** Estado de un archivo dentro del cambio. */
export type FileStatus = 'A' | 'M' | 'D' | 'R' | 'U';

export interface FileChange {
	/** Ruta relativa a la raíz del repo (con `/` como separador). */
	path: string;
	additions: number;
	deletions: number;
	status: FileStatus;
}

/**
 * Estado local del repositorio, leído vía Git Extension API.
 * Lo produce la Capa 1 y lo consume el motor de reglas (Capa 2).
 */
export interface RepoContext {
	/** Nombre de la rama actual (o `undefined` en detached HEAD). */
	branch: string | undefined;
	/** Archivos modificados respecto de HEAD (working tree + staged, deduplicados). */
	modifiedFiles: FileChange[];
	/** Diff unificado del working tree contra HEAD (puede venir acotado). */
	diff: string;
	/** Feature areas afectadas, inferidas por path (ej. "editor", "extensions/git"). */
	featureAreas: string[];
	/** `true` si el cambio toca archivos de test. Señal local barata. */
	hasTestChanges: boolean;
	/** Número de issue referenciado, parseado de la rama o el último commit. */
	referencedIssue?: number;
}

/** Una señal que contribuye al score, con su peso y aporte. Hace el score interpretable. */
export interface ScoreSignal {
	id: string;
	label: string;
	/** Peso relativo de la señal (0..1). */
	weight: number;
	/** Aporte concreto de esta señal al score final. */
	contribution: number;
	detail?: string;
}

export type ChecklistStatus = 'ok' | 'warn' | 'fail' | 'na';

/** Un ítem del checklist pre-PR. `source` indica si lo evaluó una regla local o la IA. */
export interface ChecklistItem {
	id: string;
	label: string;
	status: ChecklistStatus;
	/** Sugerencia accionable para el contribuyente. */
	hint?: string;
	source: 'local' | 'ai';
}

/** Resultado completo que consume la UI (Capa 3). */
export interface ReadinessResult {
	/** Score 0..100, interpretable a través de `breakdown`. */
	score: number;
	/** Narrativa corta generada por la IA (vacía en modo fallback). */
	summary: string;
	breakdown: ScoreSignal[];
	checklist: ChecklistItem[];
	/** Transparencia: si el resultado se generó con IA o de forma degradada (solo señales locales). */
	mode: 'ai' | 'fallback';
}

/**
 * Abstracción del proveedor de IA. La implementa la Capa 1 (Antonio) y la usa
 * el motor (Tommy). Es swappable: hoy Claude, mañana otro proveedor, sin tocar
 * el motor.
 */
export interface AiClient {
	/**
	 * Llama al modelo y devuelve JSON estructurado validado contra `schema`.
	 * `schema` es un JSON Schema (objeto con `type: "object"`, `properties`, etc.).
	 * Lanza `AiUnavailableError` si no hay API key disponible.
	 */
	complete<T>(opts: AiCompleteOptions): Promise<T>;
	/** `true` si hay una API key configurada (SecretStorage, env var o setting). */
	isAvailable(): Promise<boolean>;
}

export interface AiCompleteOptions {
	/** Prompt de sistema constante (instrucciones + guidelines). Se cachea. */
	system: string;
	/** Contenido variable por request (el diff, las señales locales, etc.). */
	user: string;
	/** JSON Schema que la respuesta debe cumplir. */
	schema: Record<string, unknown>;
	/** Tope de tokens de salida. Default 4096. */
	maxTokens?: number;
}

/** Se lanza cuando se intenta usar la IA sin API key configurada. */
export class AiUnavailableError extends Error {
	constructor(message = 'No hay API key de Anthropic configurada.') {
		super(message);
		this.name = 'AiUnavailableError';
	}
}
