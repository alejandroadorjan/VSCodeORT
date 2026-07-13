# Dependency Lens

Extensión de VS Code que **detecta dependencias circulares** en el grafo de imports de un proyecto TypeScript, usando el algoritmo de **Tarjan para componentes fuertemente conexas (SCC)**. Caso de estudio: el core de `microsoft/vscode` (`src/vs`).

Una dependencia circular (`A → B → A`) degrada el tiempo de arranque, rompe el tree-shaking del bundle y hace el código más frágil de refactorizar. VS Code las combate activamente, pero no hay forma nativa de **verlas y navegarlas** desde el editor. Esta extensión llena ese hueco.

## Qué hace

1. Escanea los archivos TypeScript del workspace (respetando `.gitignore` y los excludes).
2. Extrae los imports relativos de cada archivo y los resuelve a módulos reales (replicando la resolución de TypeScript, incluida la reescritura ESM `'./x.js'` → `x.ts`).
3. Construye el grafo dirigido de dependencias.
4. Corre Tarjan (O(V+E)) para encontrar **todos** los ciclos.
5. Los muestra en un panel navegable: cada ciclo lleva al import exacto que hay que romper.

## Resultado real sobre `src/vs`

```
Módulos analizados : 4578
Imports (aristas)  : 59875
Ciclos detectados  : 86
Tiempo             : ~800 ms
```

Ejemplos de ciclos reales que detecta (verificables a mano):
- `base/common/arrays.ts ↔ base/common/arraysFind.ts`
- `platform/instantiation/common/instantiation.ts ↔ platform/instantiation/common/serviceCollection.ts`

## Arquitectura

| Módulo | Responsabilidad |
|--------|-----------------|
| [src/graph/tarjan.ts](src/graph/tarjan.ts) | Algoritmo de Tarjan (SCC) **iterativo** + extracción del ciclo representativo (BFS del más corto). |
| [src/graph/types.ts](src/graph/types.ts) | Contratos del grafo (`ModuleNode`, `DependencyEdge`, `DependencyCycle`). |
| [src/scanner/importParser.ts](src/scanner/importParser.ts) | Extracción de imports relativos (estáticos, dinámicos, re-exports). |
| [src/scanner/graphBuilder.ts](src/scanner/graphBuilder.ts) | Resolución de módulos + construcción del grafo. Testeable con un FS en memoria. |
| [src/scanner/vscodeFileSystem.ts](src/scanner/vscodeFileSystem.ts) | Implementación de `FileSystem` sobre la API de VS Code. |
| [src/ui/treeView.ts](src/ui/treeView.ts) | Panel navegable de ciclos. |
| [src/extension.ts](src/extension.ts) | Punto de entrada + comando + progreso. |

La lógica de análisis (grafo + scanner) **no depende de `vscode`**: es TypeScript puro, lo que permite testearla en Node sin el host de la extensión.

### Por qué Tarjan y no una DFS ingenua

Una DFS que busca "camino que vuelve al origen" desde cada nodo es O(V·(V+E)) y reporta el mismo ciclo muchas veces. Tarjan encuentra **todas** las componentes fuertemente conexas (donde vive cada ciclo) en **una sola pasada O(V+E)**, que es óptimo. La implementación es **iterativa** (pila explícita) en vez de recursiva porque `src/vs` tiene cadenas de import lo bastante profundas como para desbordar el call stack de Node — hay un test que lo verifica con una cadena de 20.000 módulos.

## Puesta en marcha

```bash
cd contrib/dependency-lens
npm install
npm run build          # bundle con esbuild → dist/extension.js
```

Para correrla: abrí **esta carpeta** en VS Code y apretá **F5** (Run Dependency Lens Extension). En la ventana de Extension Development Host:

1. Abrí el repo de VS Code (o cualquier proyecto TypeScript).
2. Abrí el panel **Dependency Lens** (barra lateral, ícono de grafo).
3. Ejecutá el comando **"Dependency Lens: Analizar workspace"** o el botón ▶ del panel.
4. Explorá los ciclos: click en cada salto abre el archivo en la línea del import.

## Tests

```bash
npm test               # compila tsconfig.test.json y corre node --test
```

17 tests unitarios cubren el algoritmo de ciclos (DAG, ciclo simple, self-loop, ciclos disjuntos, deduplicación, cadena profunda sin stack overflow) y el constructor de grafo (resolución de extensiones, index, re-exports, imports externos ignorados). Requiere Node 18+ para el test runner nativo.

También hay un script de prueba end-to-end contra el código real:

```bash
node --experimental ... scripts/run-on-vscode.mjs   # corre sobre ../../src/vs
```

## Configuración

- `dependencyLens.include` — glob de archivos a analizar (default `src/vs/**/*.ts`).
- `dependencyLens.exclude` — glob de exclusión (default tests, node_modules, `.d.ts`).
