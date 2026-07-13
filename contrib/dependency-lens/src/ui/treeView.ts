/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * TreeView del panel "Dependency Lens".
 *
 * Muestra los ciclos detectados agrupados y navegables: cada ciclo es un nodo
 * expandible cuyos hijos son los saltos `A → B` con la línea exacta del import,
 * de modo que un click abre el archivo en el punto donde romper la circularidad.
 */
import * as vscode from 'vscode';
import type { DependencyCycle, GraphAnalysis, ModuleNode } from '../graph/types';

interface TreeNode extends vscode.TreeItem {
	children?: TreeNode[];
}

export class DependencyLensTreeProvider implements vscode.TreeDataProvider<TreeNode> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private analysis: GraphAnalysis | undefined;
	private scanning = false;

	setScanning(): void {
		this.scanning = true;
		this.analysis = undefined;
		this._onDidChangeTreeData.fire();
	}

	setResult(analysis: GraphAnalysis): void {
		this.scanning = false;
		this.analysis = analysis;
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(node: TreeNode): vscode.TreeItem {
		return node;
	}

	getChildren(node?: TreeNode): TreeNode[] {
		if (this.scanning) {
			return [leaf('Analizando grafo de dependencias…', { icon: 'loading~spin' })];
		}
		if (!this.analysis) {
			return [actionLeaf('Ejecutá "Dependency Lens: Analizar workspace"', 'dependencyLens.analyze', 'play')];
		}
		if (!node) {
			return this.buildRootNodes(this.analysis);
		}
		return node.children ?? [];
	}

	private buildRootNodes(analysis: GraphAnalysis): TreeNode[] {
		const summary = summaryNode(analysis);

		if (analysis.cycles.length === 0) {
			return [
				summary,
				leaf('Sin dependencias circulares 🎉', { icon: 'pass-filled' }),
			];
		}

		const cycleNodes = analysis.cycles.map((cycle, i) => cycleToNode(cycle, i, analysis));
		return [summary, section(`Ciclos detectados (${analysis.cycles.length})`, cycleNodes, 'error')];
	}
}

function summaryNode(analysis: GraphAnalysis): TreeNode {
	const moduleCount = analysis.nodes.size;
	const item = leaf(`${moduleCount} módulos · ${analysis.edgeCount} imports`, {
		icon: 'graph',
		description: `${analysis.cycles.length} ciclo${analysis.cycles.length !== 1 ? 's' : ''}`,
		tooltip: `Grafo: ${moduleCount} nodos, ${analysis.edgeCount} aristas. ${analysis.cycles.length} dependencias circulares.`,
	});
	return item;
}

function cycleToNode(cycle: DependencyCycle, index: number, analysis: GraphAnalysis): TreeNode {
	const label = cycle.modules.map(shortName).join(' → ') + ` → ${shortName(cycle.modules[0])}`;
	const severity = cycle.length <= 2 ? 'error' : 'warning';

	const item = leaf(`Ciclo #${index + 1} (${cycle.length} módulos)`, {
		icon: severity,
		description: label,
		tooltip: label,
		collapsible: vscode.TreeItemCollapsibleState.Collapsed,
	});

	// Cada hijo es un salto del ciclo; abre el archivo en la línea del import.
	item.children = cycle.edges.map((edge) => {
		const fromNode = analysis.nodes.get(edge.from);
		const hop = leaf(`${shortName(edge.from)} → ${shortName(edge.to)}`, {
			icon: 'arrow-right',
			description: `línea ${edge.line + 1}`,
			tooltip: `${edge.from} importa '${edge.specifier}' (línea ${edge.line + 1})`,
		});
		if (fromNode) {
			hop.command = openAtLineCommand(fromNode, edge.line);
		}
		return hop;
	});

	return item;
}

function openAtLineCommand(node: ModuleNode, line: number): vscode.Command {
	const uri = vscode.Uri.file(node.absPath);
	const position = new vscode.Position(line, 0);
	return {
		command: 'vscode.open',
		title: 'Abrir import',
		arguments: [uri, { selection: new vscode.Range(position, position) }],
	};
}

/** Nombre corto y legible de un módulo (últimos dos segmentos del path). */
function shortName(id: string): string {
	const parts = id.split('/');
	return parts.slice(-2).join('/');
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

function section(label: string, children: TreeNode[], icon: string): TreeNode {
	const item = leaf(label, { icon, collapsible: vscode.TreeItemCollapsibleState.Expanded });
	item.children = children;
	return item;
}

function actionLeaf(label: string, command: string, icon: string): TreeNode {
	const item = leaf(label, { icon });
	item.command = { command, title: label };
	return item;
}
