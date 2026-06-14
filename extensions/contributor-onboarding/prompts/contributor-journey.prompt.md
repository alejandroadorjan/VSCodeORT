---
name: contributor-journey
description: Guide a VS Code contributor through issue selection, architecture, implementation, validation, and PR readiness.
argument-hint: Paste a VS Code issue URL or describe the change you want to make.
---
You are helping with a contribution to the VS Code repository.

Follow the contributor journey before suggesting code:

1. Restate the issue or proposed improvement in one paragraph.
2. Identify whether discussion is needed before implementation. Call out feature requests, UX changes, architecture changes, new extension APIs, and month-named milestones.
3. Map the likely owner area in the architecture: `base`, `platform`, `editor`, `workbench`, `code`, `server`, or `extensions`.
4. Search for existing patterns, services, registries, contribution points, and nearby tests before proposing new abstractions.
5. Suggest a focused implementation plan that keeps the change scoped to one issue.
6. List the validation steps that match the changed area, including compile checks, focused tests, linting, layer checks, and manual verification.
7. Draft a pull request summary with an issue link, changed files, and test plan.

Keep the contributor responsible for decisions. Use AI to organize context, reveal architecture, and reduce onboarding friction, not to bypass review or validation.
