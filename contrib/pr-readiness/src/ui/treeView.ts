/**
 * PLACEHOLDER — Capa 3 (dueño: Nico).
 *
 * TreeView mínimo que muestra el `ReadinessResult` (score, breakdown, checklist)
 * para validar el slice vertical. Nico: enriquecé esto (íconos, badges local/ai,
 * indicador de `mode`, sugerencias accionables, onboarding) o migralo a Webview.
 * El contrato es el `ReadinessResult` que recibís en `update()`.
 */
import * as vscode from 'vscode';
import type { ReadinessResult } from '../types';

export class ReadinessTreeProvider implements vscode.TreeDataProvider<TreeNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private result: ReadinessResult | undefined;

	update(result: ReadinessResult): void {
		this.result = result;
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(node: TreeNode): vscode.TreeItem {
		return node;
	}

	getChildren(node?: TreeNode): TreeNode[] {
		if (!this.result) {
			return [leaf('Ejecutá "PR Readiness: Evaluar cambio actual"')];
		}
		if (!node) {
			const r = this.result;
			return [
				leaf(`Score: ${r.score}/100  (${r.mode})`, vscode.TreeItemCollapsibleState.None, 'star-full'),
				section('Desglose del score', r.breakdown.map((s) => leaf(`${s.label}: +${s.contribution.toFixed(0)} ${s.detail ? `(${s.detail})` : ''}`))),
				section('Checklist pre-PR', r.checklist.map((c) => leaf(`${c.label}`, vscode.TreeItemCollapsibleState.None, iconFor(c.status), c.hint)))
			];
		}
		return node.children ?? [];
	}
}

interface TreeNode extends vscode.TreeItem {
	children?: TreeNode[];
}

function leaf(label: string, collapsible = vscode.TreeItemCollapsibleState.None, icon?: string, tooltip?: string): TreeNode {
	const item: TreeNode = new vscode.TreeItem(label, collapsible);
	if (icon) {
		item.iconPath = new vscode.ThemeIcon(icon);
	}
	if (tooltip) {
		item.tooltip = tooltip;
	}
	return item;
}

function section(label: string, children: TreeNode[]): TreeNode {
	const item = leaf(label, vscode.TreeItemCollapsibleState.Expanded);
	item.children = children;
	return item;
}

function iconFor(status: string): string {
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
