# Contributing to VS Code

Welcome, and thank you for your interest in contributing to VS Code!

There are several ways in which you can contribute, beyond writing code. The goal of this document is to provide a high-level overview of how you can get involved.

## Contributor Journey

Use this journey as a map for a first code contribution. It follows the order most contributors need: choosing work, understanding the system, preparing a local build, validating the change, opening a pull request, and following the monthly project cycle. It does not replace the detailed wiki pages; it shows how those pages fit together.

### 1. Find Work That Fits

Start with the [issues labeled `good first issue`](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3A%22good%20first%20issue%22) or [`help wanted`](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3A%22help%20wanted%22). They are the clearest signal that the team considers the issue suitable for an external contribution. The [Where to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute#where-to-contribute) guide explains why some issues are better candidates than others.

Before starting, search for related issues and pull requests. When you decide to take an issue, comment that you are working on it so others do not duplicate the same work.

### 2. Know When to Discuss First

Ask in the issue before implementing when the change is a feature request, user experience change, architectural change, new extension API, issue already assigned to a month-named milestone, or issue that is not labeled `help wanted` or `bug`. This saves review time and helps confirm that the approach fits the project direction.

The [issue triaging](https://github.com/microsoft/vscode/wiki/Issues-Triaging) documentation explains how labels, feature areas, milestones, `Backlog`, `On Deck`, and `Backlog Candidates` are used. Those signals help you understand whether a contribution is accepted, still under discussion, or waiting for broader community input.

### 3. Build a Mental Model of the Repository

VS Code is a layered TypeScript application that runs on web APIs, Node.js, and Electron. The open source repository builds Code - OSS; the Visual Studio Code product is a distribution of that code with Microsoft-specific customizations.

Important root folders:

* `src/`: the core application code.
* `src/vs/`: the layered VS Code core.
* `extensions/`: built-in extensions that ship with VS Code.
* `test/`: test runners and test infrastructure.
* `build/`, `scripts/`, and `resources/`: build, automation, and static assets.

The core layers are described in [Source Code Organization](https://github.com/microsoft/vscode/wiki/source-code-organization):

* `src/vs/base/`: shared utilities and UI building blocks.
* `src/vs/platform/`: services, dependency injection, and cross-cutting platform infrastructure.
* `src/vs/editor/`: Monaco Editor Core.
* `src/vs/workbench/`: the main VS Code workbench, including views, panels, services, and contributions.
* `src/vs/code/`: desktop entry points such as the Electron main process and CLI.
* `src/vs/server/`: server entry points for remote development.

Code is also separated by target environment. Files under `common` should avoid runtime-specific APIs. Files under `browser` can use browser APIs. Files under `node` can use Node.js APIs. Electron-specific code belongs in the appropriate `electron-*` folders. Keeping code in the right environment is part of keeping VS Code available on desktop, web, and remote targets.

#### Architecture Map for Contributors

When you start investigating a change, read the architecture from the bottom up:

* `base` contains low-level primitives that should not depend on VS Code workbench concepts.
* `platform` defines reusable services such as storage, configuration, files, telemetry, commands, dialogs, and lifecycle.
* `editor` contains the standalone editor, text model, editor widgets, language integration points, and editor-specific contributions.
* `workbench` composes the product experience: activity bar, side bar, panels, editor groups, views, commands, menus, keybindings, and feature contributions.
* `code`, `server`, and the Electron-specific folders host entry points for desktop, CLI, remote, and server scenarios.
* `extensions` contains built-in extensions that use the same extension model available to external extensions.

Most dependencies should point downward in that list. A lower layer should not import from a higher layer, because that would make the lower layer depend on product-specific behavior. When in doubt, run `npm run valid-layers-check` and compare your imports with nearby files.

The workbench has its own internal structure:

* `src/vs/workbench/contrib/<feature>/` contains feature implementations such as search, SCM, terminal, notebooks, debug, comments, and preferences.
* `src/vs/workbench/services/<service>/` contains shared services used by multiple workbench features.
* `src/vs/workbench/browser/parts/` contains major shell UI parts such as the activity bar, editor area, panel, side bar, and status bar.
* `src/vs/workbench/api/` contains the bridge between the VS Code extension API and the extension host.
* `src/vs/workbench/test/` contains workbench tests and test utilities.

Built-in extensions follow normal extension boundaries. Their contribution points live in `package.json`; their runtime code lives in the extension folder; and they should communicate with the workbench through the VS Code API unless the extension is explicitly part of the core development surface.

Use this quick map when deciding where a change belongs:

* Text buffer, cursor, selections, editor rendering, or editor widgets: start in `src/vs/editor/`.
* Commands, menus, views, panels, settings UI, workbench layout, or product UI: start in `src/vs/workbench/contrib/` or `src/vs/workbench/browser/parts/`.
* Shared workbench state or cross-feature behavior: look for an existing service in `src/vs/workbench/services/` or `src/vs/platform/`.
* Files, configuration, commands, storage, telemetry, dialogs, or lifecycle infrastructure: start in `src/vs/platform/`.
* Built-in language features, grammars, snippets, debuggers, Git integration, or extension tests: start in `extensions/`.
* Desktop startup, native windows, CLI behavior, or Electron main-process work: start in `src/vs/code/`.
* Remote or server behavior: start in `src/vs/server/` and check whether a workbench or platform abstraction already exists.

Before writing code, answer these design questions:

* Which layer owns the behavior?
* Which runtime must support it: desktop, web, remote, extension host, or all of them?
* Is there an existing service, registry, contribution point, or extension API that should be reused?
* Does the change need a new public API, or can it stay internal?
* Which tests already cover the nearest behavior?

### 4. Locate the Right Boundary

Use the issue labels, the feature area, and nearby tests to find the likely owner area. Most workbench features live under `src/vs/workbench/contrib/<feature>/`, shared workbench services live under `src/vs/workbench/services/`, editor features live under `src/vs/editor/`, and built-in extension behavior lives under `extensions/<extension>/`.

Before adding new code, look for existing services, registries, contribution points, and helpers. VS Code favors small contributions that fit existing boundaries. In particular:

* Workbench contributions should expose a small internal API from their `common` area instead of having other code reach into private implementation files.
* New services should be introduced only when a real shared boundary is needed.
* Service dependencies should flow through constructor injection.
* Desktop-only or web-only code should stay isolated so shared code keeps working in all supported environments.

### 5. Prepare the Local Environment

Follow [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) to fork the repository, clone your fork, use the correct version of Node.js, install dependencies, build, and run Code - OSS. You can also use the [development container](.devcontainer/README.md) when you prefer an isolated setup.

Once the build is running, launch the development version of VS Code and reproduce the issue before changing code. For UI and multi-process behavior, use the [debugging](https://github.com/microsoft/vscode/wiki/How-to-Contribute#debugging) guidance to choose the right process: renderer, extension host, search process, shared process, or Electron main process.

### 6. Make a Focused Change

Keep the pull request scoped to one issue and one root cause. Follow the [Coding Guidelines](https://github.com/microsoft/vscode/wiki/Coding-Guidelines), including naming, tabs for indentation, small exports, localized user-facing strings, and title-style capitalization for commands and menu items.

Prefer existing patterns over new abstractions. Add tests when the change affects behavior. Avoid broad formatting-only edits, unrelated refactors, or moving files unless the issue requires it.

### 7. Validate Locally

Use the validation that matches the area you changed:

* Run the build or compile check before running tests.
* Use the [test README](test/README.md) to choose unit, integration, smoke, or sanity tests.
* Use [Writing Tests](https://github.com/microsoft/vscode/wiki/Writing-Tests) for guidance on adding coverage.
* Run [linting](https://github.com/microsoft/vscode/wiki/How-to-Contribute#linting) when the changed area needs it.
* Run `npm run valid-layers-check` when imports cross architectural boundaries.

Manual validation matters too. Verify the original issue, the expected behavior, and any important desktop, web, remote, or extension-host scenario affected by the change.

### 8. Open the Pull Request

Read the [pull request guidelines](https://github.com/microsoft/vscode/wiki/How-to-Contribute#pull-requests). Create one pull request per issue, link the issue, keep your branch up to date with `main`, explain the change, and include clear steps for how reviewers can test it. The pull request template will remind you about the required details and the Contributor License Agreement check will run automatically.

### 9. Follow Review and Project Flow

Watch the pull request for CI results, reviewer comments, and requested changes. Respond to review by updating the code, tests, and PR description when needed.

Your issue and pull request may also move through the [issue tracking](https://github.com/microsoft/vscode/wiki/Issue-Tracking) workflow. VS Code plans work through the [roadmap](https://github.com/microsoft/vscode/wiki/Roadmap), [monthly iteration plans](https://github.com/microsoft/vscode/wiki/Iteration-Plans), and [endgame](https://github.com/microsoft/vscode/wiki/Running-the-Endgame). Month-named milestones show work planned for a specific iteration, while `Backlog` and `On Deck` show accepted work that is not yet necessarily scheduled for the current month.

## Asking Questions


Have a question? Instead of opening an issue, please ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/visual-studio-code) using the tag `visual-studio-code`.

The active community will be eager to assist you. Your well-worded question will serve as a resource to others searching for help.

## Providing Feedback

Your comments and feedback are welcome, and the development team is available via a handful of different channels.

See the [Feedback Channels](https://github.com/microsoft/vscode/wiki/Feedback-Channels) wiki page for details on how to share your thoughts.

## Reporting Issues

Have you identified a reproducible problem in VS Code? Do you have a feature request? We want to hear about it! Here's how you can report your issue as effectively as possible.

### Identify Where to Report

The VS Code project is distributed across multiple repositories. Try to file the issue against the correct repository. Check the list of [Related Projects](https://github.com/microsoft/vscode/wiki/Related-Projects) if you aren't sure which repo is correct.

Can you recreate the issue even after [disabling all extensions](https://code.visualstudio.com/docs/editor/extension-gallery#_disable-an-extension)? If you find the issue is caused by an extension you have installed, please file an issue on the extension's repo directly.

### Look For an Existing Issue

Before you create a new issue, please do a search in [open issues](https://github.com/microsoft/vscode/issues) to see if the issue or feature request has already been filed.

Be sure to scan through the [most popular](https://github.com/microsoft/vscode/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request+sort%3Areactions-%2B1-desc) feature requests.

If you find your issue already exists, make relevant comments and add your [reaction](https://github.com/blog/2119-add-reactions-to-pull-requests-issues-and-comments). Use a reaction in place of a "+1" comment:

* 👍 - upvote
* 👎 - downvote

If you cannot find an existing issue that describes your bug or feature, create a new issue using the guidelines below.

### Writing Good Bug Reports and Feature Requests

File a single issue per problem and feature request. Do not enumerate multiple bugs or feature requests in the same issue.

Do not add your issue as a comment to an existing issue unless it's for the identical input. Many issues look similar but have different causes.

The more information you can provide, the more likely someone will be successful at reproducing the issue and finding a fix.

The built-in tool for reporting an issue, which you can access by using `Report Issue` in VS Code's Help menu, can help streamline this process by automatically providing the version of VS Code, all your installed extensions, and your system info. Additionally, the tool will search among existing issues to see if a similar issue already exists.

Please include the following with each issue:

* Version of VS Code
* Your operating system
* List of extensions that you have installed
* Reproducible steps (1... 2... 3...) that cause the issue
* What you expected to see, versus what you actually saw
* Images, animations, or a link to a video showing the issue occurring
* A code snippet that demonstrates the issue or a link to a code repository the developers can easily pull down to recreate the issue locally
  * **Note:** Because the developers need to copy and paste the code snippet, including a code snippet as a media file (i.e. .gif) is not sufficient.
* Errors from the Dev Tools Console (open from the menu: Help > Toggle Developer Tools)

### Creating Pull Requests

* Please refer to the article on [creating pull requests](https://github.com/microsoft/vscode/wiki/How-to-Contribute#pull-requests) and contributing to this project.

### Final Checklist

Please remember to do the following:

* [ ] Search the issue repository to ensure your report is a new issue
* [ ] Recreate the issue after disabling all extensions
* [ ] Simplify your code around the issue to better isolate the problem

Don't feel bad if the developers can't reproduce the issue right away. They will simply ask for more information!

### Follow Your Issue

Once submitted, your report will go into the [issue tracking](https://github.com/microsoft/vscode/wiki/Issue-Tracking) workflow. Be sure to understand what will happen next, so you know what to expect and how to continue to assist throughout the process.

## Automated Issue Management

We use GitHub Actions to help us manage issues. These Actions and their descriptions can be [viewed here](https://github.com/microsoft/vscode-github-triage-actions). Some examples of what these Actions do are:

* Automatically close any issue marked `info-needed` if there has been no response in the past 7 days.
* Automatically lock issues 45 days after they are closed.
* Automatically implement the VS Code [feature request pipeline](https://github.com/microsoft/vscode/wiki/Issues-Triaging#managing-feature-requests).

If you believe the bot got something wrong, please open a new issue and let us know.

## Contributing Fixes

If you are interested in writing code to fix issues, please see [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) in the wiki.

## Thank You

Your contributions to open source, large or small, make great projects like this possible. Thank you for taking the time to contribute.
