# PR Readiness Assistant

Extensión de VS Code que asiste al contribuyente open source **antes** de abrir un Pull Request:
calcula un **PR Readiness Score** con IA (Claude) y un **checklist pre-PR** derivado de las
convenciones reales del proyecto. Caso de estudio: `microsoft/vscode`.

> Plan completo y división de tareas: [PLAN.md](./PLAN.md).

## Arquitectura (3 capas)

| Capa | Carpeta | Dueño | Qué hace |
|------|---------|-------|----------|
| 1 · Data/Git + AiClient | [src/git/](src/git/), [src/ai/](src/ai/), [src/types.ts](src/types.ts) | Antonio | Lee el repo, infiere feature areas, expone `AiClient` (Claude) |
| 2 · Engine | [src/engine/](src/engine/) | Tommy | Score híbrido + checklist (hoy placeholder) |
| 3 · UI | [src/ui/](src/ui/) | Nico | TreeView + status bar (hoy placeholder) |

Los contratos (`RepoContext`, `ReadinessResult`, `AiClient`) viven en [src/types.ts](src/types.ts).

## Puesta en marcha

```bash
cd contrib/pr-readiness
npm install
npm run build        # bundle con esbuild → dist/extension.js
```

Para correrla: abrí **esta carpeta** (`contrib/pr-readiness`) en VS Code y apretá **F5**
("Run PR Readiness Extension"). Se abre una ventana de Extension Development Host.

En esa ventana:
1. Abrí cualquier repo Git con cambios sin commitear.
2. Click en el ícono 🚀 de la status bar, o comando **"PR Readiness: Evaluar cambio actual"**.
3. Mirá el panel **PR Readiness** (barra lateral) y el output channel "PR Readiness".

## ¿Dónde pongo la API key de Anthropic?

Tres opciones (en orden de prioridad). **Recomendada: la 1.**

1. **SecretStorage (cifrada, recomendada):** comando **"PR Readiness: Configurar Anthropic API Key"**
   y pegá la key (`sk-ant-...`). Queda cifrada en tu máquina, fuera del repo.
2. **Variable de entorno:** exportá `ANTHROPIC_API_KEY` antes de abrir VS Code.
   - PowerShell: `$env:ANTHROPIC_API_KEY = "sk-ant-..."`
3. **Setting `prReadiness.apiKey`** (texto plano, desaconsejado). Si la usás, **NO** commitees tu `settings.json`.

La key se obtiene en [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys.
Sin key, la extensión funciona en **modo fallback** (solo señales locales, sin IA).

## Configuración

- `prReadiness.model`: `claude-opus-4-8` (default) · `claude-sonnet-4-6` (más barato) · `claude-haiku-4-5`.
- `prReadiness.effort`: `low` · `medium` (default) · `high`.
