# VS Code Dashboard Extension

Engineering observability dashboard for GitHub repositories.

This extension adds a command that opens a webview dashboard with key repository and workflow metrics (runs, success/failure rate, MTTR, deployment frequency, open issues/PRs, stars, forks, watchers, and more).

## What It Does

- Loads repository data from GitHub APIs.
- Aggregates CI/workflow metrics into a dashboard view model.
- Renders a webview dashboard inside VS Code.

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

Example workspace settings:

```json
{
	"dashboard.owner": "microsoft",
	"dashboard.repo": "vscode",
	"dashboard.githubToken": "<your_token_optional>"
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
