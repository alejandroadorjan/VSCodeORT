# Architecture Map

Read the repository from the lower layers upward:

* `src/vs/base`: reusable primitives and low-level utilities
* `src/vs/platform`: services and dependency injection infrastructure
* `src/vs/editor`: Monaco editor, text model, and editor contributions
* `src/vs/workbench`: product UI, commands, views, panels, and feature contributions
* `src/vs/code`: desktop and Electron entry points
* `src/vs/server`: remote and server entry points
* `extensions`: built-in extensions using the extension API

Most dependencies should point downward. If an import crosses an architectural boundary, validate it with `npm run valid-layers-check`.
