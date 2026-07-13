# Dependency Lens — Detección de dependencias circulares en el core de VS Code

## Problema que aborda

En un codebase grande como `microsoft/vscode`, las **dependencias circulares** entre módulos (`A` importa `B`, `B` importa `A`, directa o indirectamente) son un problema real y silencioso:

- **Degradan el tiempo de arranque**, porque el orden de evaluación de los módulos deja de ser determinista y el bundler tiene que generar código defensivo.
- **Rompen el tree-shaking**: un ciclo obliga a incluir módulos enteros en el bundle aunque solo se use una parte.
- **Hacen el refactor frágil**: mover o dividir un módulo dentro de un ciclo puede romper el orden de inicialización de forma difícil de diagnosticar.

VS Code combate esto activamente, pero **no existe una forma nativa de ver y navegar los ciclos desde el editor**. Hoy la única señal es un warning de lint aislado, sin el contexto del ciclo completo ni el punto exacto donde romperlo.

## Propuesta

**Dependency Lens**: una extensión de VS Code que construye el grafo de imports del workspace, detecta **todas** las dependencias circulares y las muestra en un panel navegable donde cada ciclo lleva al import concreto que hay que eliminar para romperlo.

## Por qué es distinta a los aportes ya existentes

Los aportes del curso hasta ahora trabajan sobre la **metadata de los Pull Requests** (readiness, riesgo, estructura, priorización) o sobre **git/observabilidad**. Ninguno analiza la **estructura interna del código** en sí.

Dependency Lens mira el **grafo de dependencias del código fuente**, no los PRs. Es un territorio técnico distinto y complementario: en vez de evaluar *cómo se propone* un cambio, evalúa *la salud estructural del código* sobre el que se trabaja.

## Núcleo técnico

El corazón del aporte es un algoritmo, no una heurística:

- **Detección de ciclos con el algoritmo de Tarjan (SCC)** en O(V+E). Un ciclo existe si y solo si dos o más módulos pertenecen a la misma componente fuertemente conexa. Tarjan las encuentra todas en una sola pasada, que es óptimo.
- **Implementación iterativa** (pila explícita, no recursión), porque el grafo de `src/vs` tiene cadenas de import lo bastante profundas como para desbordar el call stack de Node. Hay un test que lo verifica con una cadena de 20.000 módulos.
- **Resolución de módulos fiel a TypeScript**, incluida la reescritura ESM (`'./foo.js'` → `foo.ts`) que usa el core de VS Code.
- **Extracción del ciclo representativo** (el más corto de cada componente, vía BFS) para reportar el más accionable.

La lógica de análisis es TypeScript puro sin dependencia de `vscode`, lo que permite **testearla en Node** de forma aislada (17 tests unitarios).

## Resultado sobre el código real

Corriendo el analizador contra `src/vs` del propio repo:

```
Módulos analizados : 4578
Imports (aristas)  : 59875
Ciclos detectados  : 86
Tiempo             : ~800 ms
```

Los ciclos detectados son reales y verificables a mano, por ejemplo:
- `base/common/arrays.ts ↔ base/common/arraysFind.ts`
- `platform/instantiation/common/instantiation.ts ↔ platform/instantiation/common/serviceCollection.ts`

## Alcance

- **Extensión**: panel en la barra lateral, comando de análisis, barra de progreso, navegación al import exacto de cada salto del ciclo.
- **Análisis**: grafo dirigido completo, detección de todos los ciclos, ordenados de más corto (más grave) a más largo.
- **Ingeniería**: 17 tests unitarios, typecheck estricto, build reproducible con esbuild, script de prueba end-to-end contra `src/vs`.

## Ubicación

`contrib/dependency-lens/` — extensión autocontenida, sin tocar el core (se ejecuta con F5 sobre el propio repo como caso de estudio).
