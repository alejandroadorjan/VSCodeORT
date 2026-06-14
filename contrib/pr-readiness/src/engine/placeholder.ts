/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Capa 2 — Motor de scoring híbrido (dueño: Tommy).
 *
 * Combina señales locales deterministas con evaluación semántica por IA.
 * Si la IA no está disponible, degrada graciosamente a fallback determinista.
 *
 * Contrato fijo (no cambiar la firma): evaluate(context, ai) → ReadinessResult
 */
import type {
	AiClient,
	ChecklistItem,
	ChecklistStatus,
	ReadinessResult,
	RepoContext,
	ScoreSignal,
} from '../types';

// ---------------------------------------------------------------------------
// Señales locales deterministas
// ---------------------------------------------------------------------------

/** Pesos relativos de cada señal. Deben sumar 1. */
const WEIGHTS = {
	size: 0.25,
	tests: 0.25,
	issue: 0.20,
	branchNaming: 0.15,
	focus: 0.15,
} as const;

function sizeScore(context: RepoContext): { score: number; detail: string } {
	const totalLines = context.modifiedFiles.reduce(
		(n, f) => n + f.additions + f.deletions,
		0
	);
	const fileCount = context.modifiedFiles.length;

	let score: number;
	if (totalLines <= 50) { score = 100; }
	else if (totalLines <= 200) { score = 85; }
	else if (totalLines <= 500) { score = 65; }
	else if (totalLines <= 1000) { score = 40; }
	else { score = 20; }

	if (fileCount > 20) { score = Math.max(10, score - 20); }
	else if (fileCount > 10) { score = Math.max(10, score - 10); }

	return {
		score,
		detail: `${fileCount} archivo${fileCount !== 1 ? 's' : ''}, ~${totalLines} líneas`,
	};
}

function testsScore(context: RepoContext): { score: number; detail: string } {
	if (context.hasTestChanges) {
		return { score: 100, detail: 'incluye archivos de test' };
	}
	const sourceFiles = context.modifiedFiles.filter(
		(f) =>
			/\.(ts|tsx|js|jsx|mts|mjs)$/.test(f.path) &&
			!f.path.includes('/test/') &&
			!f.path.includes('/tests/')
	);
	if (sourceFiles.length === 0) {
		return { score: 100, detail: 'no aplica (sin cambios en código fuente)' };
	}
	return { score: 40, detail: 'sin archivos de test' };
}

function issueScore(context: RepoContext): { score: number; detail: string } {
	if (context.referencedIssue) {
		return { score: 100, detail: `#${context.referencedIssue}` };
	}
	return { score: 0, detail: 'no detectado en nombre de rama' };
}

function branchNamingScore(context: RepoContext): { score: number; detail: string } {
	const branch = context.branch ?? '';
	const hasPrefix = /^(fix|feat|chore|docs|refactor|test|perf|build|ci|style)\//.test(branch);
	const hasNumber = /\d{3,}/.test(branch);

	if (hasPrefix && hasNumber) {
		return { score: 100, detail: `"${branch}" sigue la convención` };
	}
	if (hasPrefix) {
		return { score: 70, detail: `"${branch}" tiene prefijo pero sin número de issue` };
	}
	if (hasNumber) {
		return { score: 50, detail: `"${branch}" tiene número pero falta prefijo (fix/feat/...)` };
	}
	if (!branch) {
		return { score: 50, detail: 'no se detectó rama (¿detached HEAD?)' };
	}
	return { score: 20, detail: `"${branch}" no sigue la convención fix/NNNNN-descripción` };
}

function focusScore(context: RepoContext): { score: number; detail: string } {
	const areaCount = context.featureAreas.length;
	let score: number;
	if (areaCount === 0) { score = 80; }
	else if (areaCount === 1) { score = 100; }
	else if (areaCount === 2) { score = 75; }
	else if (areaCount === 3) { score = 50; }
	else { score = 20; }

	const areasStr = context.featureAreas.length
		? context.featureAreas.join(', ')
		: 'sin áreas clasificadas';
	return { score, detail: areasStr };
}

function computeLocalSignals(context: RepoContext): {
	signals: ScoreSignal[];
	score: number;
} {
	const size = sizeScore(context);
	const tests = testsScore(context);
	const issue = issueScore(context);
	const branch = branchNamingScore(context);
	const focus = focusScore(context);

	const signals: ScoreSignal[] = [
		{
			id: 'size',
			label: 'Tamaño del cambio',
			weight: WEIGHTS.size,
			contribution: size.score * WEIGHTS.size,
			detail: size.detail,
		},
		{
			id: 'tests',
			label: 'Tests asociados',
			weight: WEIGHTS.tests,
			contribution: tests.score * WEIGHTS.tests,
			detail: tests.detail,
		},
		{
			id: 'issue',
			label: 'Issue referenciado',
			weight: WEIGHTS.issue,
			contribution: issue.score * WEIGHTS.issue,
			detail: issue.detail,
		},
		{
			id: 'branch-naming',
			label: 'Naming de rama',
			weight: WEIGHTS.branchNaming,
			contribution: branch.score * WEIGHTS.branchNaming,
			detail: branch.detail,
		},
		{
			id: 'focus',
			label: 'Foco (un concern)',
			weight: WEIGHTS.focus,
			contribution: focus.score * WEIGHTS.focus,
			detail: focus.detail,
		},
	];

	const score = Math.round(signals.reduce((sum, s) => sum + s.contribution, 0));
	return { signals, score };
}

// ---------------------------------------------------------------------------
// Checklist en modo fallback (solo señales locales)
// ---------------------------------------------------------------------------

function buildFallbackChecklist(context: RepoContext): ChecklistItem[] {
	const issueStatus: ChecklistStatus = context.referencedIssue ? 'ok' : 'warn';
	const areaCount = context.featureAreas.length;
	const focusStatus: ChecklistStatus = areaCount <= 2 ? 'ok' : 'warn';
	const testsStatus: ChecklistStatus = context.hasTestChanges ? 'ok' : 'warn';

	return [
		{
			id: 'issue-ref',
			label: 'Referencia un issue existente',
			status: issueStatus,
			source: 'local',
			hint:
				issueStatus === 'warn'
					? 'Incluí el número de issue en la rama (ej. fix/123456-descripción).'
					: undefined,
		},
		{
			id: 'single-concern',
			label: 'Un único concern por PR',
			status: focusStatus,
			source: 'local',
			hint:
				focusStatus === 'warn'
					? `El cambio toca ${areaCount} áreas (${context.featureAreas.join(', ')}). Considerá dividirlo en PRs más pequeños.`
					: undefined,
		},
		{
			id: 'tests',
			label: 'Incluye o modifica tests',
			status: testsStatus,
			source: 'local',
			hint:
				testsStatus === 'warn'
					? 'VS Code requiere tests para cambios en código fuente. Agregá tests o justificá por qué no aplican.'
					: undefined,
		},
		{
			id: 'coding-guidelines',
			label: 'Respeta las Coding Guidelines',
			status: 'na',
			source: 'local',
			hint: 'No evaluable sin IA. Revisá https://github.com/microsoft/vscode/wiki/Coding-Guidelines',
		},
		{
			id: 'lint',
			label: 'Pasa lint (ESLint)',
			status: 'na',
			source: 'local',
			hint: 'Corré `npm run lint` en la raíz del repo antes de hacer el PR.',
		},
	];
}

// ---------------------------------------------------------------------------
// Prompt + JSON Schema para la IA
// ---------------------------------------------------------------------------

/**
 * System prompt constante (se cachea via prompt caching en el AiClient).
 * Incluye las guidelines seleccionadas del CONTRIBUTING de VS Code.
 */
const SYSTEM_PROMPT = `Sos un experto revisor de Pull Requests para el repositorio open source microsoft/vscode.
Tu tarea es evaluar un cambio de código y devolver un JSON estructurado con un PR Readiness Score y un checklist semántico.

## Criterios — 5 puntos del checklist de VS Code

### 1. issue-coherence
¿El cambio es coherente con el issue referenciado (convención CONTRIBUTING "Look for an existing issue")?
- ok: el diff resuelve claramente el problema del issue.
- warn: el diff parece relacionado pero excede el scope del issue.
- fail: no hay issue referenciado o el diff no tiene relación con él.
- na: contexto insuficiente para evaluar.

### 2. single-concern
¿El PR aborda un único concern (convención CONTRIBUTING "single issue per problem")?
- ok: propósito único y cohesivo.
- warn: mezcla 2 preocupaciones distintas (ej. fix + refactor no relacionado).
- fail: mezcla 3 o más concerns claramente separables.

### 3. tests-applicable
¿Aplican tests para este cambio (How-to-Contribute / Coding Guidelines)?
- ok: se agregaron/modificaron tests acordes al cambio.
- warn: el cambio modifica código fuente sin tests; probablemente necesarios.
- fail: faltan tests para un cambio significativo en lógica.
- na: solo docs, configuración o tipos, sin lógica nueva.

### 4. coding-guidelines
¿Sigue las Coding Guidelines de VS Code (wiki)?
Verificá: naming (camelCase variables, PascalCase clases/interfaces), tipos explícitos en TS,
sin 'any' masivo, sin magic strings, sin console.log en código de producción, errores manejados,
imports ordenados, funciones pequeñas y con nombre descriptivo.
- ok: sigue las convenciones.
- warn: desviaciones menores.
- fail: violaciones claras.
- na: sin código nuevo evaluable.

## Scoring
El score (0-100) debe reflejar la PR Readiness global, considerando los 4 ítems
y el contexto de las señales locales que se te dan. Penalizá más los fail que los warn.
Un PR con issue, tests, concern único y buen código → 80-100.
Un PR sin issue, sin tests y con múltiples concerns → 20-40.

## Formato de respuesta
Respondé ÚNICAMENTE con el JSON (sin markdown, sin texto extra). Los hints deben ser en español,
concisos (1-2 oraciones) y orientados a la acción del contribuyente.`;

const AI_RESPONSE_SCHEMA: Record<string, unknown> = {
	type: 'object',
	properties: {
		score: {
			type: 'number',
			description: 'PR Readiness score de 0 a 100.',
		},
		summary: {
			type: 'string',
			description: 'Narrativa de 2-3 oraciones para el contribuyente, en español.',
		},
		checklist: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						enum: ['issue-coherence', 'single-concern', 'tests-applicable', 'coding-guidelines'],
					},
					status: { type: 'string', enum: ['ok', 'warn', 'fail', 'na'] },
					hint: { type: 'string' },
				},
				required: ['id', 'status'],
			},
			minItems: 4,
			maxItems: 4,
		},
	},
	required: ['score', 'summary', 'checklist'],
};

interface AiResponse {
	score: number;
	summary: string;
	checklist: Array<{ id: string; status: ChecklistStatus; hint?: string }>;
}

function buildUserPrompt(context: RepoContext, localSignals: ScoreSignal[]): string {
	const signalLines = localSignals
		.map(
			(s) =>
				`- ${s.label}: ${s.detail ?? '—'} (score local: ${Math.round(s.contribution / s.weight)}/100)`
		)
		.join('\n');

	const fileLines = context.modifiedFiles
		.slice(0, 30)
		.map((f) => `  [${f.status}] ${f.path} (+${f.additions}/-${f.deletions})`)
		.join('\n');
	const extraFiles =
		context.modifiedFiles.length > 30
			? `\n  ... y ${context.modifiedFiles.length - 30} archivos más`
			: '';

	return `## Contexto del cambio

**Rama:** ${context.branch ?? '(desconocida)'}
**Issue referenciado:** ${context.referencedIssue !== undefined ? `#${context.referencedIssue}` : 'no detectado'}
**Feature areas afectadas:** ${context.featureAreas.join(', ') || 'sin clasificar'}

## Señales locales (deterministas)
${signalLines}

## Archivos modificados
${fileLines}${extraFiles}

## Diff (puede estar truncado a 60 000 caracteres)
\`\`\`diff
${context.diff || '(sin diff disponible)'}
\`\`\`

Evaluá el PR Readiness según los 4 criterios del sistema y devolvé el JSON.`;
}

/** Une el checklist semántico de la IA con los ítems deterministas locales. */
function mergeChecklists(
	aiItems: AiResponse['checklist'],
	context: RepoContext
): ChecklistItem[] {
	const byId = new Map(aiItems.map((i) => [i.id, i]));

	const aiItem = (id: string, label: string): ChecklistItem => {
		const item = byId.get(id);
		return { id, label, status: item?.status ?? 'na', hint: item?.hint, source: 'ai' };
	};

	const issueCoherence = byId.get('issue-coherence');
	const issueStatus: ChecklistStatus = context.referencedIssue
		? (issueCoherence?.status ?? 'ok')
		: 'warn';

	return [
		// #1 — local (detección) + IA (coherencia semántica)
		{
			id: 'issue-ref',
			label: 'Referencia un issue existente',
			status: issueStatus,
			source: context.referencedIssue ? 'ai' : 'local',
			hint: context.referencedIssue
				? issueCoherence?.hint
				: 'Incluí el número de issue en la rama (ej. fix/123456-descripción).',
		},
		// #2 — IA
		aiItem('single-concern', 'Un único concern por PR'),
		// #3 — IA (puede afinar si aplica tests o no)
		{
			id: 'tests',
			label: 'Incluye o modifica tests',
			status: byId.get('tests-applicable')?.status ?? (context.hasTestChanges ? 'ok' : 'warn'),
			hint: byId.get('tests-applicable')?.hint,
			source: 'ai',
		},
		// #4 — IA
		aiItem('coding-guidelines', 'Respeta las Coding Guidelines'),
		// #5 — siempre local (no corremos ESLint desde la extensión en el MVP)
		{
			id: 'lint',
			label: 'Pasa lint (ESLint)',
			status: 'na',
			source: 'local',
			hint: 'Corré `npm run lint` en la raíz del repo antes de abrir el PR.',
		},
	];
}

// ---------------------------------------------------------------------------
// Punto de entrada (contrato con Capa 1 y Capa 3)
// ---------------------------------------------------------------------------

export async function evaluate(context: RepoContext, ai: AiClient): Promise<ReadinessResult> {
	const { signals, score: localScore } = computeLocalSignals(context);

	const available = await ai.isAvailable();
	if (!available) {
		return {
			score: localScore,
			summary: '',
			mode: 'fallback',
			breakdown: signals,
			checklist: buildFallbackChecklist(context),
		};
	}

	try {
		const userPrompt = buildUserPrompt(context, signals);
		const aiResponse = await ai.complete<AiResponse>({
			system: SYSTEM_PROMPT,
			user: userPrompt,
			schema: AI_RESPONSE_SCHEMA,
			maxTokens: 2048,
		});

		const finalScore = Math.round(Math.max(0, Math.min(100, aiResponse.score)));

		return {
			score: finalScore,
			summary: aiResponse.summary,
			mode: 'ai',
			breakdown: signals,
			checklist: mergeChecklists(aiResponse.checklist, context),
		};
	} catch (err) {
		// Degradación graceful: si la IA falla, usamos fallback sin romper la demo.
		return {
			score: localScore,
			summary: `(Error al contactar la IA: ${err instanceof Error ? err.message : String(err)})`,
			mode: 'fallback',
			breakdown: signals,
			checklist: buildFallbackChecklist(context),
		};
	}
}
