/**
 * PLACEHOLDER — Capa 2 (dueño: Tommy).
 *
 * Motor mínimo para que el slice vertical funcione el Día 1. Calcula un score
 * determinista trivial a partir de señales locales y NO usa IA todavía.
 *
 * Tommy: reemplazá esto por el motor real (señales + pesos + prompt a la IA +
 * checklist semántico). La firma `evaluate(context, ai)` y el tipo de retorno
 * `ReadinessResult` son el contrato — manteneselos.
 */
import type { AiClient, ReadinessResult, RepoContext } from '../types';

export async function evaluate(context: RepoContext, _ai: AiClient): Promise<ReadinessResult> {
	const fileCount = context.modifiedFiles.length;
	const totalLines = context.modifiedFiles.reduce((n, f) => n + f.additions + f.deletions, 0);

	// Señal trivial: cambios chicos puntúan mejor (placeholder).
	const sizeScore = Math.max(0, 100 - Math.min(100, totalLines / 5));
	const testsScore = context.hasTestChanges ? 100 : 50;
	const issueScore = context.referencedIssue ? 100 : 40;
	const score = Math.round(sizeScore * 0.5 + testsScore * 0.25 + issueScore * 0.25);

	return {
		score,
		summary: '',
		mode: 'fallback',
		breakdown: [
			{ id: 'size', label: 'Tamaño del cambio', weight: 0.5, contribution: sizeScore * 0.5, detail: `${fileCount} archivos, ${totalLines} líneas` },
			{ id: 'tests', label: 'Tests asociados', weight: 0.25, contribution: testsScore * 0.25, detail: context.hasTestChanges ? 'incluye tests' : 'sin tests' },
			{ id: 'issue', label: 'Issue referenciado', weight: 0.25, contribution: issueScore * 0.25, detail: context.referencedIssue ? `#${context.referencedIssue}` : 'no detectado' }
		],
		checklist: [
			{ id: 'issue-ref', label: 'Referencia un issue', status: context.referencedIssue ? 'ok' : 'warn', source: 'local', hint: context.referencedIssue ? undefined : 'Incluí el número de issue en la rama (ej. fix/123456-...).' },
			{ id: 'tests', label: 'Incluye o modifica tests', status: context.hasTestChanges ? 'ok' : 'warn', source: 'local' }
		]
	};
}
