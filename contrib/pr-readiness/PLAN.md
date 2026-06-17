# PR Readiness Assistant — Plan de trabajo

Extensión de VS Code que asiste al contribuyente open source **antes** de abrir un Pull Request.
Caso de estudio: `microsoft/vscode`. Aterriza la propuesta vscode **#314420** (módulos del lado del contribuyente).

- **Equipo:** Antonio (antoniofontes2001) · Tommy (@tommygertner) · Nico (@nicopinto15)
- **Rama:** `feature/pr-readiness-assistant` (desde `development`) → PR a `development`
- **Code freeze:** **2026-06-07** · Plan: 2026-06-04 → sprint de ~3 días, MVP primero.

## Validación con el profesor (Marcelo, 27–28/05/2026)
1. **Elegir ciertos puntos** del `CONTRIBUTING.md` para chequear, **no todo**.
2. **Usar una API de IA** para chequear/validar el cambio.
3. **Generar el score con IA.**

> Esto define la arquitectura: motor **híbrido** = señales objetivas locales + **IA** que evalúa lo semántico y produce el score interpretable.

---

## Principio rector
**Asiste, no decide.** Orienta al contribuyente; no bloquea ni reemplaza el code review humano.
Reglas derivadas de la documentación pública real de VS Code (`CONTRIBUTING.md`, *How to Contribute* y *Coding Guidelines* del wiki, *Source Code Organization*).

## Higiene git (monorepo compartido de la clase)
- **NUNCA** `git add .` ni `git add -A`. Stagear solo lo nuestro: `git add contrib/pr-readiness`.
- Motivo: archivos LFS (`extensions/copilot/test/simulation/cache/*.sqlite`) con objetos borrados del server; un add masivo arrastra borrados ajenos al commit.
- PRs siempre a `development`, no a `main`.

---

## Arquitectura — 3 capas, 1 dueño por capa

```
Capa 3 · UI + GitHub      → Nico     (TreeView, status bar, onboarding, GitHub API)
Capa 2 · Rules Engine+IA  → Tommy    (señales locales, prompt, score IA, checklist)
Capa 1 · Data / Git + AiClient → Antonio (scaffolding, Git API, tipos, cliente IA)
```

Contratos tipados (fijar en Fase 0 → trabajar en paralelo con mocks):

```ts
// Capa 1 produce → Capa 2 consume
interface FileChange { path: string; additions: number; deletions: number; status: 'A'|'M'|'D'|'R'; }
interface RepoContext {
  branch: string;
  modifiedFiles: FileChange[];
  diff: string;
  featureAreas: string[];          // inferidas por path (src/vs/editor, extensions/git, ...)
  hasTestChanges: boolean;         // señal local barata
  referencedIssue?: number;        // parseado de rama/commit (ej. fix/12345-...)
}

// Capa 1 expone → Capa 2 usa (abstracción del proveedor de IA)
interface AiClient {
  // Llama al modelo y devuelve JSON estructurado validado contra el schema.
  complete<T>(opts: { system: string; user: string; schema: object }): Promise<T>;
  available: boolean;              // false si no hay API key → engine usa fallback
}

// Capa 2 produce → Capa 3 consume
interface ScoreSignal { id: string; label: string; weight: number; contribution: number; detail?: string; }
interface ChecklistItem { id: string; label: string; status: 'ok'|'warn'|'fail'|'na'; hint?: string; source: 'local'|'ai'; }
interface ReadinessResult {
  score: number;                   // 0–100, interpretable (no caja negra)
  summary: string;                 // narrativa corta generada por IA
  breakdown: ScoreSignal[];
  checklist: ChecklistItem[];
  mode: 'ai' | 'fallback';         // transparencia: si corrió con IA o degradado
}
```

---

## Motor de scoring híbrido (núcleo del proyecto)

**Paso 1 — Señales locales (deterministas, sin IA).** Baratas, confiables, y sirven de *grounding* para la IA:
- Tamaño del cambio (líneas/archivos).
- Feature areas afectadas (por path).
- ¿Incluye/modifica tests? (`hasTestChanges`).
- Convención de nombre de rama + issue referenciado (regex).
- (Opcional) resultado de ESLint local.

**Paso 2 — Evaluación con IA.** Se arma un prompt con: el diff (acotado), las señales locales y los **puntos seleccionados** del CONTRIBUTING/Coding Guidelines. La IA devuelve **JSON estructurado** (tool use / JSON schema): `score`, `summary`, evaluación de los checklist semánticos con `status` + `hint` accionable.

**Decisiones de implementación:**
- **Proveedor:** Claude API (Anthropic SDK) — structured output confiable + **prompt caching** del system prompt y las guidelines (son constantes entre llamadas → ahorro de costo/latencia). Swappable detrás de `AiClient`. *(Decisión abierta: quién paga la API key / si se usa otra.)*
- **API key:** vía `Settings` de VS Code (o `SecretStorage`), nunca hardcodeada ni commiteada.
- **Fallback determinista:** si `AiClient.available === false` (sin key / offline), el engine calcula un score solo con las señales locales y marca `mode: 'fallback'`. La demo nunca se cae.

---

## Checklist seleccionado (5 puntos, NO todo el CONTRIBUTING)

| # | Punto | Fuente | Evalúa |
|---|-------|--------|--------|
| 1 | El cambio referencia un issue existente/aceptado (no feature no solicitada) | CONTRIBUTING "Look for an existing issue" + How-to-Contribute | **local** (issue en rama/commit) + IA (coherencia con el cambio) |
| 2 | Un único concern por PR (no mezcla varios arreglos) | CONTRIBUTING "single issue per problem" | **IA** (analiza el diff) |
| 3 | Incluye o modifica tests cuando aplica | How-to-Contribute / Coding Guidelines | **local** (hasTestChanges) + IA (¿aplicaba?) |
| 4 | Respeta las Coding Guidelines (naming, estilo, etc.) | Coding Guidelines (wiki) | **IA** (sobre el diff) |
| 5 | Pasa lint (ESLint plugin local) | repo | **local** (corre eslint) |

---

## Responsabilidades

### 🟦 Antonio — Capa 1: Core, Git Context, AiClient, Lead
- Scaffolding (`package.json`, activación, comando, build esbuild).
- Importar `git.d.ts` (Git Extension API **no** está en `@types/vscode`) → `RepoContext` real: rama, files, diff, `hasTestChanges`, `referencedIssue`, feature areas por path.
- **`AiClient`**: wrapper del Anthropic SDK + lectura de API key desde Settings/SecretStorage + `available`. (Desbloquea a Tommy temprano.)
- Dueño de los tipos compartidos. Integración final + **release versionado**.

### 🟩 Tommy — Capa 2: Motor de reglas + IA
- Señales locales y sus pesos (grounding).
- **Prompt + JSON schema** para la IA; parseo/validación de la respuesta.
- **Score híbrido interpretable** (`breakdown` + `summary`) y evaluación de los checklist semánticos (#2, #4, parte de #1 y #3).
- **Fallback determinista** (`mode: 'fallback'`). Motor extensible (puntos del checklist como config).

### 🟨 Nico — Capa 3: UI + GitHub + Onboarding
- **TreeView** (MVP) + **status bar** con el score; muestra score, `summary`, breakdown, checklist (badge `local`/`ai`) e indicador de `mode`.
- **Onboarding hint**: primer cambio en una feature area → enlaza *Source Code Organization* + good-first-issues.
- **GitHub REST API**: good-first-issues del área (sin auth en MVP; auth opcional luego).

### 🤝 Compartido
- Artículo IEEE (máx. 12 pp) · ADRs en `contrib/pr-readiness/docs/` + grabación · README + release.

---

## Recorte de scope

| ✅ MVP | 🟡 Si sobra | ❌ Post-freeze |
|---|---|---|
| Git context + señales locales | Onboarding hint | Motor 100% configurable por archivo |
| 1 llamada IA → score + checklist | good-first-issues (GitHub API) | Soporte multi-repo |
| Fallback determinista | Correr ESLint real | Auth GitHub con token / fine-tuning |
| TreeView + status bar | Prompt caching afinado | Suite de tests extensa |

---

## Roadmap día por día

### Día 1 — Jue 4 (HOY): slice vertical
- **Antonio:** scaffolding + `git.d.ts` + `RepoContext` real + esqueleto de `AiClient`. *Bloqueante → primero.* Publicar tipos mock.
- **Tommy:** engine que recibe `RepoContext` (mock) → score determinista con 1–2 señales. Estructura para enchufar la IA.
- **Nico:** TreeView + comando + status bar con `ReadinessResult` (mock).
- **Cierre:** 3 capas integradas con datos reales mostrando un número.

### Día 2 — Vie 5: IA + checklist
- **Antonio:** `AiClient` real (Anthropic SDK + API key por Settings + prompt caching). Feature areas. Empezar ADRs.
- **Tommy:** prompt + schema + parseo → **score híbrido por IA** + checklist semántico + **fallback**.
- **Nico:** checklist en UI (badges local/ai, `mode`) + good-first-issues vía GitHub API.

### Día 3 — Sáb 6: pulido + entregables
- Onboarding hint si da el tiempo. **Freeze sábado a la noche.**
- Los 3: README, **demo grabada**, sección IEEE, ADRs. **Antonio:** release versionado.

### Dom 7: solo cierre (cero código nuevo).

**Hito clave:** cerrar el slice vertical (Día 1) cuanto antes.

---

## Riesgos
- **Git Extension API** fuera de `@types/vscode` → import manual de `git.d.ts`. Antonio primero.
- **IA:** costo/latencia/no-determinismo → prompt caching, diff acotado, temperatura baja + **fallback determinista**.
- **API key:** nunca commitear; definir quién la provee.
- **Rate limit GitHub** sin token → auth opcional.
- **Acoplamiento UI↔Engine** → respetar `ReadinessResult`.
- **Monorepo compartido** → disciplina de staging.
