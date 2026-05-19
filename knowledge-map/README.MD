# VSCode Knowledge Map

En proyectos open source de gran escala, el conocimiento técnico queda distribuido entre múltiples artefactos: issues, pull requests, releases, documentación. Cada uno vive en su lugar y se consulta por separado. El resultado es que reconstruir la historia de un cambio, entender por qué se tomó una decisión o saber qué issues resolvió una versión específica requiere buscar manualmente en varios lugares a la vez.

VSCode es un caso concreto de ese problema. Tiene miles de issues, cientos de PRs por semana y releases frecuentes, pero no hay ninguna forma visual de ver cómo se conectan entre sí.

Esta herramienta resuelve eso. Baja datos reales desde la API de GitHub, detecta las relaciones entre esos artefactos y las muestra como un grafo interactivo navegable en el navegador.


## Qué muestra

El grafo tiene tres niveles:

- **Releases** — Las versiones publicadas de VSCode
- **Pull Requests mergeados** — Los cambios de código incluidos en esas versiones
- **Issues cerrados** — Los bugs o features que esos PRs resolvieron

Las conexiones se detectan automáticamente. Si un PR dice `closes #123`, `fixes #456` o `resolves #789` en su descripción, se dibuja una flecha de ese PR hacia ese issue y según la fecha en que fue mergeado se lo conecta con la release correspondiente.

Además del trabajo ya cerrado, el grafo también muestra los PRs abiertos e issues
en progreso al momento de correr el script. Aparecen con borde punteado y colores
más oscuros para distinguirlos de lo que ya está mergeado.


## Cómo funciona

Son tres pasos que se corren en orden:

**1. `fetch_data.py` — Baja los datos de GitHub**

Consulta la API pública de GitHub y descarga:
- Los 5 releases más recientes de VSCode.
- Todos los PRs cerrados y mergeados del período que cubren esas releases
  (pagina de a 100 hasta llegar al PR más viejo anterior al release más antiguo).
- Los 100 PRs abiertos más recientes para mostrar el trabajo en progreso.
- Los issues que aparecen referenciados en esos PRs.

Los issues se descargan por separado porque suelen ser más viejos que los PRs
y no aparecen en la lista de issues recientes de la API.

**2. `build_graph.py` — Construye las conexiones**

Lee los datos descargados y arma el grafo:
- Asigna cada PR mergeado al release correspondiente según su fecha de merge.
- Busca en el cuerpo de cada PR si menciona `closes #X`, `fixes #X` o
  `resolves #X` y conecta ese PR con ese issue.
- Descarta los PRs que fueron cerrados sin mergear
- Conecta los PRs abiertos al release más reciente como trabajo pendiente.
- Calcula las posiciones de cada nodo en una grilla jerárquica. Los releases van arriba, los PRs en el medio y los issues abajo.

Todo eso se guarda en `graph.json`, que es lo que lee el navegador.

**3. `index.html` — Muestra el grafo**

Carga el `graph.json` y dibuja el grafo. Las posiciones ya vienen calculadas desde Python, así que el navegador solo las renderiza.

Desde la interfaz se puede:
- Filtrar por tipo de nodo (Releases, Pull Requests, Issues).
- Clickear cualquier nodo para ver su título, número, estado, etiquetas y un link directo a GitHub.


## Cómo correrlo

### Requisitos

- Python 3.8 o superior
- Token de GitHub: Settings → Developer settings → Personal access tokens → Generate new token.

### Instalación

```bash
pip install requests python-dotenv
```

### Token

Crear un archivo `.env` dentro de `knowledge-map/`:

```
GITHUB_TOKEN=tu_token_aqui
```


### Correr

```bash
python3 fetch_data.py
python3 build_graph.py
python3 -m http.server 8000
```

Abrir `http://localhost:8000` en el navegador.

Al correr `fetch_data.py` se ve en la consola el progreso de la descarga página por página hasta cubrir el período de los 5 releases. Al correr `build_graph.py` se muestra cuántos nodos y conexiones tiene el grafo, separado entre mergeados y pendientes.


## Decisiones técnicas

#### API REST de GitHub

Para obtener los datos del repositorio se usó la API REST de GitHub, que es la interfaz pública que GitHub ofrece para acceder a la información de cualquier repositorio. Expone directamente los endpoints que necesitamos, uno para releases, uno para pull requests y uno para issues. Con REST, cada consulta es una llamada HTTP independiente que devuelve un JSON con los datos.

#### Detección de conexiones PR -> Issue por regex

La API de GitHub no indica directamente qué issues cierra un PR. La única forma de obtener esa relación es leyendo el texto de la descripción del PR y buscando palabras como `closes`, `fixes` o `resolves` seguidas de un número de issue. Esa es la convención estándar que usa GitHub para cerrar issues automáticamente cuando se mergea un PR. Para detectar ese patrón se usó regex, que es una técnica que permite buscar secuencias de texto con un formato específico dentro de un string. Se eligió porque el patrón a detectar es siempre el mismo y no requiere nada más complejo.

#### Pipeline en dos scripts separados

La herramienta se divide en dos scripts que se ejecutan en orden, `fetch_data.py` descarga los datos y los guarda en archivos JSON locales y `build_graph.py` lee esos archivos y construye el grafo. Son dos scripts separados a propósito ya que si se quiere cambiar cómo se detectan las conexiones o cómo se posicionan los nodos, no se tiene que volver a llamar a la API.

#### Layout pre calculado en Python

Las posiciones de cada nodo en el grafo se calculan en Python y se guardan en el archivo `graph.json`. Cuando el navegador carga la página,dibuja los nodos en las coordenadas que ya vienen definidas. La alternativa era usar el motor de física de vis-network, que acomoda los nodos simulando fuerzas de atracción y repulsión. El problema es que con alrededor de 300 nodos esa simulación tardaba varios minutos en estabilizarse y producía un resultado diferente cada vez que se recargaba la página. Con el layout pre calculado el grafo aparece instantáneamente y siempre con la misma estructura jerárquica: releases arriba, pull requests en el medio e issues abajo.

#### vis-network como librería de visualización

Para renderizar el grafo en el navegador se usó vis-network, una librería de JavaScript diseñada para visualizar grafos interactivos. Soporta posiciones fijas de nodos, zoom, drag, eventos de click por nodo y estilos visuales distintos por tipo de nodo.

#### HTML estático con `http.server`

La visualización es una página HTML que carga el archivo `graph.json` y lo dibuja en el navegador. No hace falta un servidor con lógica de backend porque todo el procesamiento ya fue hecho por los scripts de Python. El navegador simplemente lee el JSON y renderiza el grafo. Para servir esa página alcanza con el servidor HTTP que viene incluido en Python, que se levanta con un solo comando y no requiere instalar nada extra.

#### Testing

Nuestra solución no incluye tests. La validación se hizo de forma manual verificando que el grafo generado refleje las relaciones reales del repositorio, contrastando los resultados con los datos directamente en GitHub.

## Equipo

- Florencia Jasinski — 286670
- Julieta Trostchansky — 266993
- Eugenia Herrmann — 211811
