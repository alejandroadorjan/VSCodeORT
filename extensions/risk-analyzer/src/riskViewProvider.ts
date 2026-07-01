import * as vscode from 'vscode';
import { analyzeRisk } from './riskAnalyzer';
import { RiskConfig, RiskResult } from './types';

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function statusLabel(status: string): string {
	switch (status) {
		case 'A': return 'A';
		case 'M': return 'M';
		case 'D': return 'D';
		case 'R': return 'R';
		case '?': return 'U';
		default: return status.charAt(0);
	}
}

function statusTitle(status: string): string {
	switch (status) {
		case 'A': return 'Added (staged)';
		case 'M': return 'Modified';
		case 'D': return 'Deleted';
		case 'R': return 'Renamed';
		case '?': return 'Untracked';
		default: return status;
	}
}

export class RiskViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitRisk.riskView';

	private _view?: vscode.WebviewView;
	private _analyzing = false;
	private _lastConfig?: RiskConfig;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _getConfig: () => RiskConfig,
		private readonly _getRepoRoot: () => string | undefined,
		private readonly _onResult?: (result: RiskResult | null) => void,
	) { }

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.onDidReceiveMessage(async msg => {
			switch (msg.type) {
				case 'openFile': {
					const repoRoot = this._getRepoRoot();
					if (!repoRoot) { return; }
					const uri = vscode.Uri.joinPath(vscode.Uri.file(repoRoot), msg.filename);
					try {
						await vscode.window.showTextDocument(uri);
					} catch (_) { /* binary or missing */ }
					break;
				}
				case 'saveSettings': {
					const cfg = vscode.workspace.getConfiguration('gitRiskAnalyzer');
					const target = vscode.ConfigurationTarget.Workspace;
					await Promise.all([
						cfg.update('pathScores', msg.config.pathScores, target),
						cfg.update('lines', msg.config.lines, target),
						cfg.update('thresholds', msg.config.thresholds, target),
						cfg.update('labels', msg.config.labels, target),
					]);
					// refresh is triggered automatically by onDidChangeConfiguration
					break;
				}
			}
		});

		this.refresh();
	}

	public async refresh(): Promise<void> {
		if (!this._view || this._analyzing) { return; }
		this._analyzing = true;

		const repoRoot = this._getRepoRoot();
		if (!repoRoot) {
			this._view.webview.html = this._buildShellHtml(
				this._view.webview,
				`<div class="state-message error">No git repository found in the current workspace.</div>`
			);
			this._analyzing = false;
			return;
		}

		this._view.webview.html = this._buildShellHtml(
			this._view.webview,
			`<div class="state-message">Analyzing changes...</div>`
		);

		const config = this._getConfig();
		this._lastConfig = config;

		try {
			const result = await analyzeRisk(repoRoot, config);
			this._view.webview.html = this._buildResultHtml(this._view.webview, result, config);
			this._onResult?.(result);
		} catch (err) {
			this._onResult?.(null);
			this._view.webview.html = this._buildShellHtml(
				this._view.webview,
				`<div class="state-message error">Error: ${escapeHtml(String(err))}</div>`
			);
		} finally {
			this._analyzing = false;
		}
	}

	private _buildShellHtml(webview: vscode.Webview, bodyContent: string): string {
		const nonce = getNonce();
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${styleUri}" rel="stylesheet">
</head>
<body>${bodyContent}</body>
</html>`;
	}

	private _buildResultHtml(webview: vscode.Webview, result: RiskResult, config: RiskConfig): string {
		const nonce = getNonce();
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

		const riskClass = result.label.includes('high')
			? 'risk-high'
			: result.label.includes('medium')
				? 'risk-medium'
				: 'risk-low';

		// --- Risk badge ---
		const badgeHtml = `
<div class="risk-badge ${riskClass}">
	<div class="risk-badge-label">${escapeHtml(result.label)}</div>
	<div class="risk-badge-score">Total score: ${result.total}</div>
</div>`;

		// --- Signals ---
		const signalsHtml = result.signals.map(s => {
			const activeClass = s.score > 0 ? 'signal-active' : '';
			const detailLines = s.detail.split('\n').map(l => `<div>${escapeHtml(l)}</div>`).join('');
			return `
<div class="signal ${activeClass}">
	<div class="signal-header">
		<span class="signal-id">${escapeHtml(s.id)}</span>
		<span class="signal-name">${escapeHtml(s.description)}</span>
		<span class="signal-score ${activeClass}">${s.score}</span>
	</div>
	<div class="signal-detail">${detailLines}</div>
</div>`;
		}).join('');

		// --- Files ---
		let filesHtml: string;
		if (result.files.length === 0) {
			filesHtml = '<div class="state-message">No staged or untracked changes detected.</div>';
		} else {
			filesHtml = result.files.map(f => {
				const sl = statusLabel(f.status);
				const title = statusTitle(f.status);
				const statusClass = f.status === '?' ? 'status-untracked' : `status-${f.status.toLowerCase()}`;
				const shortName = f.filename.length > 48
					? '...' + f.filename.slice(f.filename.length - 45)
					: f.filename;
				return `
<div class="file-row">
	<span class="file-status ${statusClass}" title="${title}">${sl}</span>
	<span class="file-name" title="${escapeHtml(f.filename)}">${escapeHtml(shortName)}</span>
	<span class="file-lines">+${f.additions} -${f.deletions}</span>
</div>`;
			}).join('');
		}

		// --- Owners ---
		const ownersHtml = result.owners.length > 0
			? `<section class="section">
	<h2>Suggested Owners</h2>
	<div class="owners">${result.owners.map(o => `<code>@${escapeHtml(o)}</code>`).join(' ')}</div>
</section>`
			: '';

		// --- Settings panel (config embedded as JSON for main.js to read) ---
		// Sanitize </script> sequences so JSON embedding in a script block is safe
		const configJson = JSON.stringify(config).replace(/<\/script>/gi, '<\\/script>');

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link href="${styleUri}" rel="stylesheet">
</head>
<body>

${badgeHtml}

<p class="tool-description">Computes 4 signals to estimate the risk of your staged and untracked changes before committing.</p>

<section class="section">
	<h2>Signals</h2>
	<div class="signals">${signalsHtml}</div>
</section>

<details class="settings-panel" id="settings-panel">
	<summary class="settings-summary">Settings</summary>
	<div class="settings-body">

		<div class="settings-group">
			<div class="settings-group-label">Path Scores <span class="settings-hint">(S1 — max matching score)</span></div>
			<div id="path-score-rows"></div>
			<button type="button" id="add-path-btn" class="btn-secondary">+ Add path</button>
		</div>

		<div class="settings-group">
			<div class="settings-group-label">Change Surface <span class="settings-hint">(S2 — line count thresholds)</span></div>
			<div class="settings-row">
				<label class="settings-label">Minor (&gt; N lines → +1)</label>
				<input type="number" id="lines-minor" class="settings-input-number" min="0">
			</div>
			<div class="settings-row">
				<label class="settings-label">Major (&gt; N lines → +2)</label>
				<input type="number" id="lines-major" class="settings-input-number" min="0">
			</div>
		</div>

		<div class="settings-group">
			<div class="settings-group-label">Risk Thresholds <span class="settings-hint">(total score)</span></div>
			<div class="settings-row">
				<label class="settings-label">Medium (score ≥)</label>
				<input type="number" id="threshold-medium" class="settings-input-number" min="0">
			</div>
			<div class="settings-row">
				<label class="settings-label">High (score ≥)</label>
				<input type="number" id="threshold-high" class="settings-input-number" min="0">
			</div>
		</div>

		<div class="settings-group">
			<div class="settings-group-label">Labels</div>
			<div class="settings-row">
				<label class="settings-label">Low</label>
				<input type="text" id="label-low" class="settings-input-text">
			</div>
			<div class="settings-row">
				<label class="settings-label">Medium</label>
				<input type="text" id="label-medium" class="settings-input-text">
			</div>
			<div class="settings-row">
				<label class="settings-label">High</label>
				<input type="text" id="label-high" class="settings-input-text">
			</div>
		</div>

		<button type="button" id="save-settings-btn" class="btn-primary">Save Settings</button>
		<div id="save-feedback" class="save-feedback"></div>

	</div>
</details>

<section class="section">
	<h2>Changed Files <span class="count">${result.files.length}</span></h2>
	<div class="file-list">${filesHtml}</div>
</section>

${ownersHtml}

<script nonce="${nonce}">window.__config = ${configJson};</script>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}
}
