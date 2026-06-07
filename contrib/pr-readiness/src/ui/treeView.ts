/**
 * Capa 3 (dueño: Nico) — TreeView del panel PR Readiness.
 *
 * Muestra el `ReadinessResult` (score, summary, breakdown, checklist) con íconos,
 * badges local/ai, indicador de `mode`, good-first-issues y onboarding inline.
 * El contrato de entrada sigue siendo `ReadinessResult`; el resto es contexto de UI.
 */
import * as vscode from 'vscode';
import type { GoodFirstIssue } from '../github/goodFirstIssues';
import type { ChecklistItem, ChecklistStatus, ReadinessResult, ScoreSignal } from '../types';

/** Contexto completo del panel (resultado del engine + datos auxiliares de Capa 3). */
export interface PanelUpdate {
	result: ReadinessResult;
	featureAreas: string[];
	goodFirstIssues?: GoodFirstIssue[];
	issuesLoading?: boolean;
}

export class ReadinessTreeProvider implements vscode.TreeDataProvider<TreeNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private panel: PanelUpdate | undefined;

	update(panel: PanelUpdate): void {
		this.panel = panel;
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(node: TreeNode): vscode.TreeItem {
		return node;
	}

	getChildren(node?: TreeNode): TreeNode[] {
		if (!this.panel) {
			return [actionLeaf('Ejecutá "PR Readiness: Evaluar cambio actual"', 'prReadiness.evaluate', 'play')];
		}
		if (!node) {
			return this.buildRootNodes(this.panel);
		}
		return node.children ?? [];
	}

	private buildRootNodes(panel: PanelUpdate): TreeNode[] {
		const { result } = panel;
		const nodes: TreeNode[] = [
			scoreNode(result),
			summaryNode(result),
			section('Desglose del score', result.breakdown.map((s) => signalNode(s)), 'list-unordered'),
			section('Checklist pre-PR', result.checklist.map((c) => checklistNode(c)), 'tasklist')
		];

		if (panel.featureAreas.length > 0) {
			nodes.push(
				section(
					'Feature areas',
					panel.featureAreas.map((area) => leaf(area, { icon: 'folder' })),
					'folder'
				)
			);
		}

		nodes.push(issuesSection(panel));
		return nodes;
	}
}

interface TreeNode extends vscode.TreeItem {
	children?: TreeNode[];
}

function scoreNode(result: ReadinessResult): TreeNode {
	const modeLabel = result.mode === 'ai' ? 'IA' : 'fallback';
	const modeIcon = result.mode === 'ai' ? 'sparkle' : 'shield';
	const scoreIcon = result.score >= 80 ? 'pass-filled' : result.score >= 60 ? 'warning' : 'error';

	const item = leaf(`Score: ${result.score}/100`, {
		description: modeLabel,
		icon: scoreIcon,
		tooltip: `Modo: ${result.mode}. Click para re-evaluar.`
	});
	item.command = { command: 'prReadiness.evaluate', title: 'Re-evaluar' };
	item.contextValue = `score-${result.mode}`;

	const modeChild = leaf(`Modo: ${modeLabel}`, {
		description: result.mode === 'ai' ? 'Claude + señales locales' : 'solo señales locales',
		icon: modeIcon
	});
	item.children = [modeChild];
	item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
	return item;
}

function summaryNode(result: ReadinessResult): TreeNode {
	const text =
		result.summary.trim() ||
		(result.mode === 'fallback'
			? 'Sin resumen de IA (modo fallback). Configurá una API key para evaluación semántica.'
			: 'Sin resumen disponible.');

	return leaf(text, {
		icon: 'comment-discussion',
		tooltip: text
	});
}

function signalNode(signal: ScoreSignal): TreeNode {
	const weightPct = Math.round(signal.weight * 100);
	const detail = signal.detail ? ` — ${signal.detail}` : '';
	return leaf(signal.label, {
		description: `+${signal.contribution.toFixed(0)} (${weightPct}%)`,
		icon: 'symbol-numeric',
		tooltip: `${signal.label}: aporte ${signal.contribution.toFixed(1)} (peso ${weightPct}%)${detail}`
	});
}

function checklistNode(item: ChecklistItem): TreeNode {
	const sourceBadge = item.source === 'ai' ? 'IA' : 'local';
	const statusLabel = statusLabelFor(item.status);

	return leaf(item.label, {
		description: `${sourceBadge} · ${statusLabel}`,
		icon: iconForStatus(item.status),
		tooltip: item.hint ?? `${item.label} (${sourceBadge}, ${statusLabel})`
	});
}

function issuesSection(panel: PanelUpdate): TreeNode {
	if (panel.issuesLoading) {
		return section('Good first issues', [leaf('Buscando en GitHub…', { icon: 'loading~spin' })], 'github');
	}

	const issues = panel.goodFirstIssues ?? [];
	if (issues.length === 0) {
		const hint =
			panel.featureAreas.length > 0
				? 'No se encontraron issues (¿rate limit?). Probá más tarde o abrí el repo en GitHub.'
				: 'Evaluá cambios en una feature area para sugerencias más precisas.';
		return section('Good first issues', [leaf(hint, { icon: 'info' })], 'github');
	}

	const children = issues.map((issue) => issueNode(issue));
	return section('Good first issues', children, 'github');
}

function issueNode(issue: GoodFirstIssue): TreeNode {
	const prefix = issue.area ? `[${issue.area}] ` : '';
	const item = leaf(`#${issue.number} ${prefix}${issue.title}`, {
		description: 'abrir',
		icon: 'issues',
		tooltip: issue.title
	});
	item.command = {
		command: 'prReadiness.openIssue',
		title: 'Abrir issue',
		arguments: [issue.htmlUrl]
	};
	return item;
}

function section(label: string, children: TreeNode[], icon: string): TreeNode {
	const item = leaf(label, { icon, collapsible: vscode.TreeItemCollapsibleState.Expanded });
	item.children = children;
	return item;
}

interface LeafOptions {
	icon?: string;
	description?: string;
	tooltip?: string;
	collapsible?: vscode.TreeItemCollapsibleState;
}

function leaf(label: string, opts: LeafOptions = {}): TreeNode {
	const item: TreeNode = new vscode.TreeItem(label, opts.collapsible ?? vscode.TreeItemCollapsibleState.None);
	if (opts.icon) {
		item.iconPath = new vscode.ThemeIcon(opts.icon);
	}
	if (opts.description) {
		item.description = opts.description;
	}
	if (opts.tooltip) {
		item.tooltip = opts.tooltip;
	}
	return item;
}

function actionLeaf(label: string, command: string, icon: string): TreeNode {
	const item = leaf(label, { icon });
	item.command = { command, title: label };
	return item;
}

function iconForStatus(status: ChecklistStatus): string {
	switch (status) {
		case 'ok':
			return 'pass';
		case 'warn':
			return 'warning';
		case 'fail':
			return 'error';
		default:
			return 'circle-outline';
	}
}

function statusLabelFor(status: ChecklistStatus): string {
	switch (status) {
		case 'ok':
			return 'ok';
		case 'warn':
			return 'warn';
		case 'fail':
			return 'fail';
		default:
			return 'n/a';
	}
}
