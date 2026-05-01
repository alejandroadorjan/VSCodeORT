import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

  const command = vscode.commands.registerCommand('dashboard.open', async () => {

    // ── Auth token (optional, raises rate limit from 60 → 5000 req/hr) ───────
    const token = vscode.workspace.getConfiguration('dashboard').get<string>('githubToken');
    const headers: Record<string, string> = { 'User-Agent': 'VSCode-Dashboard' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // ── Fetch all data in parallel ────────────────────────────────────────────
    const [repo, runsData, closedIssuesData, openIssuesData, prsData, commitsData] = await Promise.all([
      fetch('https://api.github.com/repos/microsoft/vscode', { headers }).then(r => r.json()),
      fetch('https://api.github.com/repos/microsoft/vscode/actions/runs?per_page=100', { headers }).then(r => r.json()),
      // Fetch more issues (20) so after filtering out PRs we still have plenty
      fetch('https://api.github.com/repos/microsoft/vscode/issues?state=closed&per_page=20&sort=updated&direction=desc', { headers }).then(r => r.json()),
      fetch('https://api.github.com/search/issues?q=repo:microsoft/vscode+is:issue+is:open&per_page=1', { headers }).then(r => r.json()),
      fetch('https://api.github.com/search/issues?q=repo:microsoft/vscode+is:pr+is:open&per_page=1', { headers }).then(r => r.json()),
      fetch('https://api.github.com/repos/microsoft/vscode/commits?per_page=10', { headers }).then(r => r.json()),
    ]);

    // ── Runs ──────────────────────────────────────────────────────────────────
    const runs: any[] = Array.isArray(runsData.workflow_runs) ? runsData.workflow_runs : [];
    const totalRuns   = runs.length;

    const success        = runs.filter(r => r.conclusion === 'success').length;
    const failed         = runs.filter(r => r.conclusion === 'failure').length;
    const cancelled      = runs.filter(r => r.conclusion === 'cancelled').length;
    const inProgress     = runs.filter(r => r.status === 'in_progress').length;
    const successRate    = totalRuns ? Math.round((success / totalRuns) * 100) : 0;
    const successPercent = successRate;
    const failedPercent  = totalRuns ? Math.round((failed / totalRuns) * 100) : 0;

    // ── Avg build duration ─────────────────────────────────────────────────────
    const completedRuns = runs.filter(r => r.run_started_at && r.updated_at && r.conclusion);
    const avgDuration   = completedRuns.length ? Math.round(
      completedRuns.reduce((acc, r) =>
        acc + (new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()), 0
      ) / completedRuns.length / 1000
    ) : 0;

    // ── Deployment frequency ──────────────────────────────────────────────────
    const cutoff30d     = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentSuccess = runs.filter(r =>
      r.conclusion === 'success' && r.run_started_at &&
      new Date(r.run_started_at).getTime() >= cutoff30d
    ).length;
    const deploymentFrequency = recentSuccess
      ? Math.round((recentSuccess / 4) * 10) / 10
      : 0;

    // ── MTTR ──────────────────────────────────────────────────────────────────
    const orderedRuns = [...runs]
      .filter(r => r.run_started_at && r.updated_at && r.conclusion)
      .sort((a, b) => new Date(a.run_started_at).getTime() - new Date(b.run_started_at).getTime());

    let recoverySum = 0, recoveryCount = 0;
    for (let i = 0; i < orderedRuns.length; i++) {
      if (orderedRuns[i].conclusion === 'failure') {
        const next = orderedRuns.slice(i + 1).find(r => r.conclusion === 'success');
        if (next) {
          recoverySum += (new Date(next.run_started_at).getTime() - new Date(orderedRuns[i].updated_at).getTime()) / 60000;
          recoveryCount++;
        }
      }
    }
    const mttr = recoveryCount ? Math.max(1, Math.round(recoverySum / recoveryCount)) : 0;

    // ── Change failure rate ────────────────────────────────────────────────────
    const changeFailureRate = totalRuns ? Math.round((failed / totalRuns) * 100) : 0;

    // ── Health score ──────────────────────────────────────────────────────────
    // Pipeline stability: success rate contributes 65% of the score
    // Build speed: faster builds (under 180s cap) contribute 35%
    const healthScore = Math.min(100, Math.round(
      (successRate * 0.65) +
      ((100 - Math.min(avgDuration, 180)) * 0.35)
    ));
    const healthColor =
      healthScore > 85 ? '#7ec850' :
      healthScore > 65 ? '#e0a030' :
                         '#e05c5c';

    // ── Repo signals ──────────────────────────────────────────────────────────
    const realOpenIssues = openIssuesData?.total_count ?? repo.open_issues_count;
    const openPRs        = prsData?.total_count ?? '—';
    const forks          = repo.forks_count ?? 0;
    const watchers       = repo.subscribers_count ?? repo.watchers_count ?? 0;
    const stars          = repo.stargazers_count ?? 0;

    // ── Closed issues HTML ─────────────────────────────────────────────────────
    // Fetch up to 20 from API, filter PRs client-side, show up to 8 real issues
    const closedIssues: any[] = Array.isArray(closedIssuesData)
      ? closedIssuesData.filter((i: any) => !i.pull_request)
      : [];

    const resolvedIssuesHtml = closedIssues.slice(0, 8).map((issue: any) => {
      const closedDate = issue.closed_at
        ? new Date(issue.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

      // Labels (up to 2)
      const labelHtml = (issue.labels || []).slice(0, 2).map((l: any) => {
        const r = parseInt(l.color.slice(0, 2), 16);
        const g = parseInt(l.color.slice(2, 4), 16);
        const b = parseInt(l.color.slice(4, 6), 16);
        return `<span class="issue-label" style="background:rgba(${r},${g},${b},0.2);color:#${l.color}">${l.name}</span>`;
      }).join('');

      // Closed by (user who closed it — from closed_by field if available)
      const closedBy = issue.closed_by?.login
        ? `<span class="issue-meta">by @${issue.closed_by.login}</span>`
        : '';

      // Comment count
      const commentCount = issue.comments > 0
        ? `<span class="issue-comments">
             <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" style="opacity:.5"><path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
             ${issue.comments}
           </span>`
        : '';

      return `<li>
        <span class="issue-title">
          <span class="issue-num">#${issue.number}</span>
          ${issue.title}
        </span>
        <span class="issue-right">
          ${labelHtml}
          <span class="issue-meta">${closedDate}</span>
          ${closedBy}
          ${commentCount}
        </span>
      </li>`;
    }).join('') || '<li class="no-data">No recent closed issues found.</li>';

    // ── Last 10 real runs for the chart ───────────────────────────────────────
    const last10 = [...runs]
      .filter(r => r.run_started_at && r.conclusion)
      .sort((a, b) => new Date(a.run_started_at).getTime() - new Date(b.run_started_at).getTime())
      .slice(-10);

    const chartLabels  = JSON.stringify(last10.map(r => {
      const d = new Date(r.run_started_at);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }));
    const chartSuccess = JSON.stringify(last10.map(r => r.conclusion === 'success' ? 1 : 0));
    const chartFailed  = JSON.stringify(last10.map(r => r.conclusion === 'failure' ? 1 : 0));
    const chartDur     = JSON.stringify(last10.map(r => {
      if (!r.run_started_at || !r.updated_at) return 0;
      return Math.round((new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()) / 1000);
    }));

    // ── Recent runs HTML ──────────────────────────────────────────────────────
    const recentRunsHtml = runs.slice(0, 6).map((r: any) => {
      const dur = r.run_started_at && r.updated_at
        ? Math.round((new Date(r.updated_at).getTime() - new Date(r.run_started_at).getTime()) / 1000)
        : null;
      const durStr     = dur ? (dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`) : '—';
      const conclusion = r.conclusion || r.status || 'unknown';
      const dotClass   = conclusion === 'success' ? 'green' : conclusion === 'failure' ? 'red' : 'amber';
      const badgeClass = conclusion === 'success' ? 'badge-green' : conclusion === 'failure' ? 'badge-red' : 'badge-amber';
      const name       = (r.name || 'Workflow').slice(0, 30);
      const branch     = r.head_branch ? ` / ${r.head_branch}` : '';
      return `<div class="run-item">
        <span class="status-dot ${dotClass}"></span>
        <span class="run-name">${name}${branch}</span>
        <span class="run-dur">${durStr}</span>
        <span class="badge ${badgeClass}">${conclusion}</span>
      </div>`;
    }).join('') || '<div class="no-data">No runs found.</div>';

    // ── Active devs ───────────────────────────────────────────────────────────
    const commits: any[] = Array.isArray(commitsData) ? commitsData : [];
    const activeDevs = [...new Set(commits.map((c: any) => c?.author?.login).filter(Boolean))].length;

    // ── Load HTML & create panel ──────────────────────────────────────────────
    const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'dashboard.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const panel = vscode.window.createWebviewPanel(
      'dashboard',
      'Engineering Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    const stylesUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview', 'styles.css'))
    );
    html = html.replace(/__styles__/g, String(stylesUri));

    const inject = (key: string, value: any) =>
      html = html.replace(new RegExp(`__${key}__`, 'g'), String(value));

    inject('stars',               stars.toLocaleString());
    inject('openIssues',          realOpenIssues.toLocaleString());
    inject('openPRs',             openPRs.toLocaleString());
    inject('forks',               forks.toLocaleString());
    inject('watchers',            watchers.toLocaleString());
    inject('successRate',         successRate);
    inject('avgDuration',         avgDuration);
    inject('success',             success);
    inject('failed',              failed);
    inject('cancelled',           cancelled);
    inject('inProgress',          inProgress);
    inject('totalRuns',           totalRuns);
    inject('healthScore',         healthScore);
    inject('healthColor',         healthColor);
    inject('deploymentFrequency', deploymentFrequency);
    inject('changeFailureRate',   changeFailureRate);
    inject('mttr',                mttr);
    inject('successPercent',      successPercent);
    inject('failedPercent',       failedPercent);
    inject('activeDevs',          activeDevs);
    inject('resolvedIssues',      resolvedIssuesHtml);
    inject('recentRunsHtml',      recentRunsHtml);
    inject('chartLabels',         chartLabels);
    inject('chartSuccess',        chartSuccess);
    inject('chartFailed',         chartFailed);
    inject('chartDur',            chartDur);

    panel.webview.html = html;
  });

  context.subscriptions.push(command);
}

export function deactivate() {}
