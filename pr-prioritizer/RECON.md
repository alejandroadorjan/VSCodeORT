# Phase 0 — Reconnaissance

> Explored before writing any implementation code.

---

## 1. Node, package manager, workspaces

| Item | Finding |
|---|---|
| **Node version** | `22.22.1` (from `.nvmrc` at repo root) |
| **Package manager** | `npm` — `package-lock.json` present, no `packageManager` field, no `.yarnrc`/`.pnpmrc` |
| **npm workspaces** | **NOT used** — root `package.json` has no `workspaces` field |

**Root `.npmrc` caveat:** The root `.npmrc` targets Electron's runtime (`runtime="electron"`, `target="39.8.8"`, `disturl="https://electronjs.org/headers"`). This means `npm install` at the repo root compiles native modules against Electron headers, not Node. Our isolated `pr-prioritizer/package.json` must ship its own clean `.npmrc` that opts out of these electron settings; otherwise any `npm install` run inside our subfolder that inherits the parent `.npmrc` could try to compile native deps against Electron and fail.

**Decision:** `pr-prioritizer/` ships an `.npmrc` with `runtime=` unset (overrides the parent). No workspace registration needed because the root never had workspaces to begin with.

---

## 2. Config to respect (or not collide with)

### TypeScript
- Root has no single `tsconfig.json`; individual projects have their own (e.g., `build/tsconfig.json`, `src/tsconfig.json`).
- `build/tsconfig.json` pattern: `"strict": true`, `"target": "es2024"`, `"module": "nodenext"`, `"noEmit": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"verbatimModuleSyntax": true`.
- Our `tsconfig.json` follows this pattern but **emits** (`noEmit: false`) to `dist/` because we need runnable JS output.

### ESLint
- Root uses **flat config** (`eslint.config.js`) with a custom in-tree plugin (`.eslint-plugin-local/`) and a Microsoft copyright header rule.
- `npm run eslint` runs `build/eslint.ts` which internally constructs paths — it likely targets `src/`, `build/`, `extensions/`. It does **not** automatically sweep every subfolder.
- `.eslint-ignore` does not mention `pr-prioritizer/`, but the flat config's path targeting means our folder is excluded by default.
- **Risk:** if someone runs `eslint pr-prioritizer/` explicitly, the Microsoft header rule would fire. Not a problem for isolated dev, but noted.

### Formatting
- `tsfmt.json` at root: **tabs** (tabSize 4, `convertTabsToSpaces: false`), no Prettier.
- Our code follows the same convention: tabs for indentation.

---

## 3. Test framework and standalone tooling

| Item | Finding |
|---|---|
| Root test runner | `mocha` (`test-node` script uses mocha with `--ui=tdd`) |
| Build test runner | `cd build && npm run test` (build has its own package.json) |
| Smoke / browser | Playwright-based |
| `node:test` usage | Not used at root, but Node 22 ships it natively — safe to use in our isolated package |

Standalone tooling in `build/` and `scripts/` is all **VS Code infrastructure** (gulp tasks, hygiene checkers, electron launchers). None of it is a natural home for an external-PR analysis tool.

**Chosen test runner for `pr-prioritizer/`:** `node:test` + `tsx` (Node 22 built-in, zero extra test-framework deps, pairs cleanly with `tsx` for on-the-fly TypeScript execution).

---

## 4. Alignment check: does `pr-prioritizer/` as an isolated folder fit?

**Yes — cleanly.** Rationale:

1. **No workspace collision:** the root never registered workspaces, so a new `package.json` in a subfolder is invisible to `npm install` at the root. No `--ignore-workspace-root-check` hacks needed.
2. **No tsconfig collision:** VS Code's root tsconfig covers `src/`, `build/`, etc. Our own `tsconfig.json` is fully self-contained and never referenced by any root config.
3. **No eslint collision:** the root flat-config doesn't glob into arbitrary subfolders; our folder won't be linted unless someone explicitly points eslint at it.
4. **No build collision:** the gulpfile never references arbitrary top-level subdirectories; our folder is invisible to `npm run compile`.
5. **One potential gotcha:** the root `.npmrc` (Electron headers). Mitigated by shipping our own `.npmrc` that resets `runtime` and `target`.

**No conflicts detected with the plan from the issue. Proceeding with implementation.**

---

## Decision: folder location

```
pr-prioritizer/   ← top-level, isolated, self-contained
  .npmrc          ← resets runtime/target away from Electron
  package.json    ← its own deps, scripts, NOT a workspace member
  tsconfig.json   ← strict, ES2022, nodenext, emits to dist/
  ...
```

This mirrors how other self-contained tooling lives at the top level of large mono-repos (e.g., `test/smoke/`, `build/`) — each with their own `package.json` and `node_modules`.
