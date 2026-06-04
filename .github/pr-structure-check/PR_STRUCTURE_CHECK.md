# PR Structure Check

GitHub Actions workflow that validates a minimum structure in pull request descriptions before merge.

## Layout

All feature files live under [`.github/pr-structure-check/`](./). GitHub requires the workflow file under [`.github/workflows/`](../workflows/).

```
.github/
├── pr-structure-check/
│   ├── PR_STRUCTURE_CHECK.md      ← this document
│   ├── config.json                ← versioned rules
│   ├── validate-pr-structure.mjs  ← validator (phase 2)
│   └── validate-pr-structure.test.mjs  ← unit tests (phase 3)
├── workflows/
│   └── pr-structure-check.yml     ← workflow (phase 4; must stay here)
└── pull_request_template.md       ← aligned in phase 5
```

## Required sections

Each PR description must include these markdown H2 sections (English):

| Section | Expected content |
|---------|------------------|
| `## Context` | Problem or need motivating the change; link to issue or discussion when applicable |
| `## Solution` | Approach taken; files or subsystems affected at a high level |
| `## Impact` | Risks for users, backwards compatibility, or visible behavior changes |
| `## Testing` | How the change was validated (automated, manual, environment) |

## Configuration

Rules live in [`config.json`](./config.json), not in the validator script. To change conventions, edit the config and the pull request template together.

### Config schema

- `bypassLabel` — label that skips validation (default: `skip-pr-check`)
- `sections[]` — required sections:
  - `heading` — exact H2 text (e.g. `## Context`)
  - `description` — human-readable hint (used in docs and error messages)
  - `minContentLength` — minimum characters after trim for that section

Initial thresholds: **50 characters** for all four sections.

## Design decisions

These decisions were agreed during planning and govern the implementation.

| Topic | Decision |
|-------|----------|
| Validator | Node ESM standalone (`validate-pr-structure.mjs` in this folder) |
| Section language | English headers |
| Header matching | Case-insensitive H2 (`## context` = `## Context`) |
| Section order | Any order is accepted |
| Duplicate headers | Content from duplicate occurrences is concatenated before length check |
| Content counting | Text after trim; only HTML comments are stripped; markdown syntax counts |
| Empty body | Fail with one error per missing section |
| Draft PRs | Skipped until marked "Ready for review" |
| Bot PRs | Skipped when author login ends with `[bot]` |
| Bypass | PR passes if `skip-pr-check` label is present; who can add labels is enforced by GitHub repo permissions |
| Failure feedback | PR comment + `::error::` annotations in the workflow log |
| Success feedback | Previous failure comment is updated to a resolved message |
| Error messages | English |
| Check name | `PR Structure Check` |
| Unit tests | `validate-pr-structure.test.mjs` with `node:test` (run locally) |

## STRICT_MODE (test vs production)

The workflow exposes `STRICT_MODE` (default: **`false`** for development).

| | `STRICT_MODE: false` (default) | `STRICT_MODE: true` (production) |
|---|---|---|
| Target branches | All pull requests | Only PRs targeting `main` and `release/*` |
| Config source | PR head branch | PR base branch |

**Why the default is `false`:** lets the team test the check on PRs into `development` (or other branches) without merging config to `main` first. Flip to `true` in [`.github/workflows/pr-structure-check.yml`](../workflows/pr-structure-check.yml) before treating the feature as production-ready.

## Local validation

Once the validator script exists:

```bash
node .github/pr-structure-check/validate-pr-structure.mjs \
  --config .github/pr-structure-check/config.json \
  --body "$(cat my-pr-body.md)"
```

Run unit tests:

```bash
node --test .github/pr-structure-check/validate-pr-structure.test.mjs
```

## Branch protection

The workflow creates a GitHub Check named **PR Structure Check**. To block merges, add that check as a required status in branch protection (Settings → Branches → `main`).

**Note:** PRs that add or change `.github/workflows/` may be blocked by [`no-engineering-system-changes.yml`](../workflows/no-engineering-system-changes.yml) unless the author has write access to the repository.

## Manual test checklist

1. Open a PR without sections → check fails with specific errors and a PR comment
2. Fill all four sections with enough content → check passes; failure comment is marked resolved
3. Add `skip-pr-check` label → check passes even with an empty description
4. Open as draft → check does not run
5. Edit the description → check re-runs automatically

## Implementation phases

| Phase | Commit | Deliverable |
|-------|--------|-------------|
| 1 | `docs: add PR structure check design and config schema` | This folder + `config.json` |
| 2 | `feat: add PR structure validator script` | `validate-pr-structure.mjs` |
| 3 | `test: add PR structure validator unit tests` | `validate-pr-structure.test.mjs` |
| 4 | `ci: add PR structure check workflow` | `../workflows/pr-structure-check.yml` |
| 5 | `chore: align pull request template with structure check` | `../pull_request_template.md` |

Work happens on branch `feature/pr-structure-check` from `development`.
