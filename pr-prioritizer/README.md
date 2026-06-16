# PR Prioritizer

Standalone CLI that fetches open pull requests for a GitHub repository and
produces a prioritized Markdown report, ranked by review-readiness.

Implements the prototype described in issue
[microsoft/vscode#314560](https://github.com/microsoft/vscode/issues/314560).

---

## Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Node.js | 22.x | `node --version` |
| npm | 10.x (ships with Node 22) | `npm --version` |
| Git | any recent version | `git --version` |

No global installs required beyond Node + npm.

---

## Step-by-step: try it from any machine

### 1. Clone the repository

```bash
git clone https://github.com/<your-fork>/vscode.git
cd vscode
```

If you already have the repo cloned, make sure you're on the right branch:

```bash
git fetch origin
git checkout feature/pr-prioritizer
```

### 2. Enter the tool folder

```bash
cd pr-prioritizer
```

All subsequent commands run from inside `pr-prioritizer/`. Do **not** run
`npm install` at the repo root — that's the VS Code build, not this tool.

### 3. Install dependencies

```bash
npm install
```

This installs only two runtime deps (`@octokit/rest`) and two dev deps
(`tsx`, `typescript`). It does **not** touch the VS Code build.

Expected output:
```
added 23 packages, and audited 24 packages in 5s
found 0 vulnerabilities
```

### 4. Run the tests

```bash
npm test
```

Expected output (66 tests, all passing):
```
ℹ tests 66
ℹ pass  66
ℹ fail  0
```

### 5. Generate a sample report (no GitHub token needed)

```bash
npm run analyze -- --in fixtures/sample-prs.json --out report/demo.md
```

Then open `report/demo.md` in any Markdown viewer (VS Code Preview, GitHub,
Obsidian, etc.) to see the ranked report.

Console output:
```
Report written to report/demo.md
  5 ranked | 4 blocked | 1 internal
```

---

## Step-by-step: fetch real data from GitHub

This step requires a GitHub account and a personal access token.

### 6. Create a GitHub token

1. Go to <https://github.com/settings/tokens> → **Generate new token (classic)**
2. Select scope: `public_repo` (read-only access to public repositories is enough)
3. Copy the token (starts with `ghp_…`)

Or use a fine-grained token: **Settings → Developer settings → Fine-grained tokens**,
grant **Read** access to `Pull requests` on the target repository.

### 7. Set the token in your environment

**Linux / macOS / Git Bash:**
```bash
export GITHUB_TOKEN=ghp_yourtoken
```

**Windows PowerShell:**
```powershell
$env:GITHUB_TOKEN = "ghp_yourtoken"
```

**Windows Command Prompt:**
```cmd
set GITHUB_TOKEN=ghp_yourtoken
```

### 8. Fetch live PRs and generate a report

```bash
# Fetch (writes data/snapshot-<date>.json)
npm run fetch -- --repo microsoft/vscode --limit 50

# Analyze the snapshot
npm run analyze -- --in data/snapshot-2026-01-15.json --out report/report.md --top 25
```

Or run both steps at once:

```bash
npm run report -- --repo microsoft/vscode --limit 50
```

> **Rate limit note:** each PR costs 3 API calls (detail + reviews + files),
> plus 1 for the listing. At `--limit 50` that is ~151 requests.
> GitHub's authenticated limit is **5 000 req/hour** — well within range.
> Without a token the limit is 60 req/hour (enough for ~19 PRs).

---

## All available commands

```
npm run fetch   -- --repo <owner/repo> [--limit N] [--out path]
npm run analyze -- [--in path] [--out path] [--top N]
npm run report  -- --repo <owner/repo> [--limit N] [--out path]
npm test
npm run typecheck
```

| Flag | Command | Default | Description |
|---|---|---|---|
| `--repo` | fetch, report | *(required)* | `owner/repo` format |
| `--limit` | fetch, report | `50` | Max PRs to fetch |
| `--out` | fetch | `data/snapshot-<date>.json` | Snapshot output path |
| `--in` | analyze | `fixtures/sample-prs.json` | Snapshot to read |
| `--out` | analyze, report | `report/report.md` | Report output path |
| `--top` | analyze | `25` | Max ranked PRs in report |

---

## How the scoring works

Each external PR receives a score out of 100:

| Signal | Max pts | Formula |
|---|---|---|
| Age | 30 | `min(ageDays, 90) / 90 × 30` — older = more urgent |
| Size | 25 | `(1 − min(lines, 1000) / 1000) × 25` — smaller = easier to review |
| Linked issue | 15 | flat — body contains `closes/fixes/resolves #N` |
| Tests | 15 | flat — any changed file is a test file, or body mentions "test" |
| Milestone | 10 | flat — PR is attached to a milestone |
| Labels | 5 | flat — at least one label is present |

**Hard filters** (excluded from ranking, appear in "Not Ready" section):
- Draft PRs
- PRs with `CHANGES_REQUESTED` (latest review per reviewer)
- PRs with merge conflicts (`mergeable_state: dirty` or `conflicting`)

**External** = `author_association` ∉ `{OWNER, MEMBER, COLLABORATOR}`.
Internal PRs are excluded from ranking entirely.

### Customizing weights

Edit `WEIGHTS` in [src/score.ts](src/score.ts):

```typescript
export const WEIGHTS = {
  age:       30,
  size:      25,
  issue:     15,
  tests:     15,
  milestone: 10,
  labels:     5,   // must sum to 100
};
```

---

## Project structure

```
pr-prioritizer/
  src/
    types.ts      Snapshot and PR types (shared contract)
    signals.ts    Pure signal extractors — no I/O, fully testable
    score.ts      WEIGHTS + pure scoring and ranking logic
    report.ts     Markdown report builder — no I/O
    github.ts     GitHub API client (Octokit) — only network code
    fetch.ts      fetch command — the only module that hits the network
    cli.ts        Argument parsing and command dispatch
  test/
    signals.test.ts   40 cases covering all signal extractors
    score.test.ts     26 cases covering scoring, filters, ranking order
  fixtures/
    sample-prs.json   10 deterministic PRs covering all edge cases
  data/             Generated snapshots (gitignored, except the fixture)
  report/           Generated reports (gitignored)
  RECON.md          Phase 0 repository reconnaissance notes
```

---

## Isolation from the VS Code build

This package is **fully isolated** from the `microsoft/vscode` root:

- Not listed in any `workspaces` field (the root doesn't use npm workspaces)
- Has its own `.npmrc` that overrides the root's Electron-targeting settings
- Not referenced by any root `tsconfig.json` or `eslint.config.js`
- `npm install` / `npm test` at the repo root has zero effect on this package

See [RECON.md](RECON.md) for the full reconnaissance findings.
