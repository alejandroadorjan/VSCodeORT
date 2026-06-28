import * as vscode from 'vscode';
import { RiskViewProvider } from './riskViewProvider';
import { RiskConfig, RiskResult } from './gitAnalyzer';

function getConfig(): RiskConfig {
	const cfg = vscode.workspace.getConfiguration('gitRiskAnalyzer');
	return {
		pathScores: cfg.get<Record<string, number>>('pathScores') ?? {
			'src/vscode-dts/': 3,
			'src/vs/code/electron-main/': 2,
			'src/vs/workbench/': 1,
			'src/vs/base/': 0,
		},
		lines: cfg.get<{ minor: number; major: number }>('lines') ?? { minor: 200, major: 500 },
		labels: cfg.get<{ low: string; medium: string; high: string }>('labels') ?? {
			low: 'risk:low',
			medium: 'risk:medium',
			high: 'risk:high',
		},
		thresholds: cfg.get<{ medium: number; high: number }>('thresholds') ?? { medium: 3, high: 5 },
	};
}

function getRepoRoot(): string | undefined {
	return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function activate(context: vscode.ExtensionContext): void {
	// Status bar item — always visible in the bottom bar
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBar.command = 'gitRisk.refresh';
	statusBar.tooltip = 'Git Risk Analyzer — click to refresh';
	statusBar.text = '$(shield) risk:—';
	statusBar.show();
	context.subscriptions.push(statusBar);

	let lastLabel: string | undefined;

	function onResult(result: RiskResult | null): void {
		if (!result) {
			statusBar.text = '$(shield) risk:—';
			statusBar.backgroundColor = undefined;
			lastLabel = undefined;
			return;
		}

		const cfg = getConfig();
		const isHigh = result.label === cfg.labels.high;
		const isMedium = result.label === cfg.labels.medium;

		// Update status bar
		const icon = isHigh ? '$(warning)' : isMedium ? '$(info)' : '$(pass)';
		statusBar.text = `${icon} ${result.label} (${result.total})`;
		statusBar.backgroundColor = isHigh
			? new vscode.ThemeColor('statusBarItem.errorBackground')
			: isMedium
				? new vscode.ThemeColor('statusBarItem.warningBackground')
				: undefined;

		// Notify only when transitioning to high risk (avoid spamming on every refresh)
		if (isHigh && lastLabel !== result.label) {
			vscode.window.showWarningMessage(
				`Git Risk Analyzer: high risk detected (score ${result.total}). Review your changes before committing.`,
				'Open Panel'
			).then(action => {
				if (action === 'Open Panel') {
					vscode.commands.executeCommand('gitRisk.riskView.focus');
				}
			});
		}

		lastLabel = result.label;
	}

	const provider = new RiskViewProvider(context.extensionUri, getConfig, getRepoRoot, onResult);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(RiskViewProvider.viewType, provider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('gitRisk.refresh', () => provider.refresh())
	);

	// Auto-refresh when the staging area changes (.git/index)
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		const gitIndexPattern = new vscode.RelativePattern(workspaceFolder, '.git/index');
		const watcher = vscode.workspace.createFileSystemWatcher(gitIndexPattern);
		watcher.onDidChange(() => provider.refresh());
		watcher.onDidCreate(() => provider.refresh());
		context.subscriptions.push(watcher);
	}

	// Re-analyze when extension settings change
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('gitRiskAnalyzer')) {
				provider.refresh();
			}
		})
	);
}

export function deactivate(): void { }
