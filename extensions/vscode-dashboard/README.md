<!--
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
-->

# VS Code Dashboard Extension

Engineering observability dashboard for GitHub repositories.

This extension adds a command that opens a webview dashboard with key repository and workflow metrics (runs, success/failure rate, workflow health, workflow-based delivery proxies, open issues/PRs, stars, forks, watchers, and more).

## What It Does

- Loads repository data from GitHub APIs.
- Aggregates CI/workflow metrics into a dashboard view model.
- Renders a webview dashboard inside VS Code.

## Metric Definitions

The dashboard is intentionally based on GitHub data that is available from the repository APIs. Workflow metrics use the latest workflow runs returned by GitHub Actions, up to 300 runs (`per_page=100`, `maxPages=3`), across all branches. This is a recent-activity sample, not a fixed calendar window.

### Repository Signals

- Stars: `repo.stargazers_count`.
- Forks: `repo.forks_count`.
- Watchers: `repo.subscribers_count` when available, otherwise `repo.watchers_count`.
- Open issues: GitHub Search API count for `is:issue is:open`; pull requests are excluded.
- Open PRs: GitHub Search API count for `is:pr is:open`.
- Active devs: unique commit author logins from the latest 10 commits returned by GitHub.

### Workflow Outcomes

- Runs tracked: workflow runs with either `conclusion` or `status`.
- Success count: runs where `conclusion === "success"`.
- Failure count: runs where `conclusion === "failure"`.
- In progress count: runs where `status === "in_progress"`.
- Other count: tracked runs that are not success, failure, or in progress. This includes skipped, cancelled, action required, neutral, timed out, stale, and other non-success/failure outcomes.
- Success rate: `success_count / tracked_runs * 100`.
- Failure rate: `failure_count / tracked_runs * 100`.
- In progress rate: `in_progress_count / tracked_runs * 100`.
- Other rate: remainder to 100 after rounded success, failure, and in-progress percentages.

### Build Duration

- Completed run: a run with `run_started_at`, `updated_at`, and `conclusion`.
- Run duration: `max(0, updated_at - run_started_at)` in seconds.
- Average build time: mean duration across completed workflow runs.

### Workflow Health

Workflow Health is a composite score from 0 to 100:

```text
Workflow Health = (reliability * 0.65) + (build_speed * 0.35)
```

- Reliability uses only success and failure outcomes from health-relevant runs: `successes / (successes + failures) * 100`.
- Skipped runs that are likely caused by workflow configuration or event filters are excluded from the health input.
- Cancelled, skipped, and in-progress runs are excluded from reliability because they do not represent a success/failure execution outcome.
- Build speed normalizes average duration against a 900 second cap: `((900 - min(avg_duration_seconds, 900)) / 900) * 100`.

### CI/CD and Release Metrics

The dashboard separates CI/CD observability from release-based DORA-inspired metrics.

CI/CD observability uses GitHub Actions workflow runs:

- CI success rate: successful completed workflow runs divided by completed workflow runs.
- CI failure rate: failed completed workflow runs divided by completed workflow runs.
- Time to feedback: average workflow duration for completed runs.
- Failure concentration: failures from the most failing workflow divided by all workflow failures.
- CI recovery time: average time from a failed workflow run to the next successful run of the same workflow.

Release and DORA-inspired metrics use GitHub Releases as the primary source and versioned tags as fallback:

- Release frequency: versioned releases/tags in the last 30 days divided by 4 weeks.
- Average days between releases: average gap between consecutive versioned releases.
- Lead time for changes proxy: average and median `release_date - commit_date` for commits between `previousTag..currentTag`.
- Post-release correction rate: stable releases followed by a patch release within 7 days divided by stable releases.
- Service recovery metrics are shown as unavailable until a public incident source is configured.

For VS Code, `main` is treated as CI integration, not production. Releases/tags are used as the production delivery proxy. These metrics are DORA-inspired, not strict DORA, and do not infer causality between releases and production incidents.

Main command:

- `dashboard.open` -> Opens **Engineering Dashboard**.

## Requirements

- VS Code `^1.70.0`
- Node.js (for local development/build)
- Optional GitHub token for higher API limits/private repos

## Quick Start

1. Open the extension project in VS Code.
2. Build the extension:

```bash
npm install
npm run compile
```

3. Run the extension in Extension Development Host (F5 in VS Code).
4. Open Command Palette and run `Open Dashboard`.

## Configuration

The extension reads these settings from `dashboard.*`:

- `dashboard.owner`: GitHub org/user (default: `microsoft`)
- `dashboard.repo`: repository name (default: `vscode`)
- `dashboard.githubToken`: optional token
- `dashboard.releaseSource`: release proxy for DORA-inspired metrics, either `tags` or `main` (default: `tags`)

Example workspace settings:

```json
{
	"dashboard.owner": "microsoft",
	"dashboard.repo": "vscode",
	"dashboard.githubToken": "<your_token_optional>",
	"dashboard.releaseSource": "tags"
}
```

## Scripts

- `npm run compile`: typecheck + lint + esbuild bundle
- `npm run watch`: runs watch tasks in parallel
- `npm run watch:esbuild`: esbuild watch
- `npm run watch:tsc`: TypeScript watch (`--noEmit`)
- `npm run package`: production bundle
- `npm run unit-test`: compile tests and run unit tests

Recommended local watcher setup (inside this extension folder):

```bash
npm run watch:esbuild
npm run watch:tsc
```

## Testing

Run unit tests:

```bash
npm run unit-test
```

## Project Structure

High-level module layout:

- `src/extension.ts`: activation and command registration
- `src/config/`: configuration access
- `src/data/`: GitHub API client and transport types/responses
- `src/model/`: domain models (dashboard, github, config)
- `src/services/`: orchestration logic
- `src/transformers/`: metric computation and view model mapping
- `src/webview/`: HTML/CSS renderer and template
- `src/test/`: unit tests

## Troubleshooting

- If root workspace watch fails, run extension-local watchers instead (`watch:esbuild` and `watch:tsc`).
- If GitHub API returns rate limit errors, configure `dashboard.githubToken`.
- If dashboard opens but data is empty, verify `dashboard.owner` and `dashboard.repo` values.

## License

MIT. See the repository license files for details.
