# VSCode Knowledge Map

En proyectos open source de gran escala, el conocimiento técnico queda distribuido entre múltiples artefactos: issues, pull requests, releases, documentación. Cada uno vive en su lugar y se consulta por separado. El resultado es que reconstruir la historia de un cambio, entender por qué se tomó una decisión o saber qué issues resolvió una versión específica requiere buscar manualmente en varios lugares a la vez.

VSCode es un caso concreto de ese problema. Tiene miles de issues, cientos de PRs por semana y releases frecuentes, pero no hay ninguna forma visual de ver cómo se conectan entre sí. Un desarrollador que quiere entender qué cambió en la versión 1.90 tiene que abrir el changelog, buscar PRs relacionados, navegar a cada uno por separado y rastrear manualmente los issues que mencionan. No existe una vista unificada que muestre todo junto.

Esta herramienta resuelve eso. Descarga datos reales desde la API de GitHub, detecta las relaciones entre esos artefactos y las muestra como un grafo interactivo navegable en el navegador.


## Caso de uso principal

**Actor:** Desarrollador que trabaja con el repositorio de VSCode y necesita entender la historia o el estado actual del proyecto.

**Escenario típico:** El actor quiere saber qué issues resolvió un release específico o qué PRs están abiertos y qué problemas intentan resolver. En lugar de navegar manualmente por GitHub, corre los scripts, abre el grafo y puede ver de un vistazo todas las relaciones.

## Requerimientos

### Funcionales

- Descargar releases, pull requests e issues reales del repositorio de VSCode desde la API de GitHub.
- Detectar automáticamente qué issues cierra cada PR a partir de su descripción.
- Asignar cada PR mergeado al release correspondiente según su fecha de merge.
- Mostrar el trabajo en progreso: PRs abiertos e issues que esos PRs intentan resolver.
- Visualizar los artefactos como un grafo interactivo con jerarquía.
- Permitir filtrar el grafo por tipo de nodo (releases, PRs, issues).
- Mostrar el detalle de cada nodo al hacer click.

### No funcionales

- **Rendimiento:** El grafo debe cargar instantáneamente en el navegador.
- **Usabilidad:** La herramienta debe poder levantarse con comandos sin configuración adicional más allá del token.
- **Mantenibilidad:** La descarga de datos y la construcción del grafo están separadas para poder modificar una sin afectar la otra.


## Qué muestra

El grafo tiene tres niveles:

- **Releases** — Las versiones publicadas de VSCode
- **Pull Requests mergeados** — Los cambios de código incluidos en esas versiones
- **Issues cerrados** — Los bugs o features que esos PRs resolvieron

Las conexiones se detectan automáticamente. Si un PR dice `closes #123`, `fixes #456` o `resolves #789` en su descripción, se dibuja una flecha de ese PR hacia ese issue y según la fecha en que fue mergeado se lo conecta con la release correspondiente.

Además del trabajo ya cerrado, el grafo también muestra los PRs abiertos e issues en progreso al momento de correr el script. Aparecen con borde punteado y colores más oscuros para distinguirlos de lo que ya está mergeado.


## Cómo funciona

Son tres pasos que se corren en orden:

**1. `fetch_data.py` — Baja los datos de GitHub**

Consulta la API pública de GitHub y descarga:
- Los 5 releases más recientes de VSCode.
- Todos los PRs cerrados y mergeados del período que cubren esas releases
  (pagina de a 100 hasta llegar al PR más viejo anterior al release más antiguo).
- Los 100 PRs abiertos más recientes para mostrar el trabajo en progreso.
- Los issues que aparecen referenciados en esos PRs.

Los issues se descargan por separado porque suelen ser más viejos que los PRs y no aparecen en la lista de issues recientes de la API.

**2. `build_graph.py` — Construye las conexiones**

Lee los datos descargados y arma el grafo:
- Asigna cada PR mergeado al release correspondiente según su fecha de merge.
- Busca en el cuerpo de cada PR si menciona `closes #X`, `fixes #X` o `resolves #X` y conecta ese PR con ese issue.
- Descarta los PRs que fueron cerrados sin mergear.
- Conecta los PRs abiertos al release más reciente como trabajo pendiente.
- Calcula las posiciones de cada nodo en una grilla jerárquica: releases arriba, PRs en el medio, issues abajo.

Todo eso se guarda en `graph.json`, que es lo que lee el navegador.

**3. `index.html` — Muestra el grafo**

Carga el `graph.json` y dibuja el grafo. Las posiciones ya vienen calculadas desde Python, así que el navegador solo las renderiza.

Desde la interfaz se puede:
- Filtrar por tipo de nodo (Releases, Pull Requests, Issues).
- Clickear cualquier nodo para ver su título, número, estado, etiquetas y un link directo a GitHub.


## Cómo correrlo

### Dependencias

- Python 3.8 o superior
- [requests](https://pypi.org/project/requests/) — Para llamar a la API de GitHub
- [python-dotenv](https://pypi.org/project/python-dotenv/) — Para leer el token desde el archivo `.env`
- [vis-network 9.1.9](https://visjs.github.io/vis-network/docs/network/) — Librería de JavaScript para renderizar el grafo

```bash
pip install requests python-dotenv
```

### Token de GitHub

La API de GitHub requiere autenticación para hacer más de 60 requests por hora. Para este proyecto que el token es obligatorio.

Para obtenerlo: **GitHub → Settings → Developer settings → Personal access tokens → Generate new token**. Más información: [https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

Una vez obtenido, crear un archivo `.env` dentro de `knowledge-map/`:

```
GITHUB_TOKEN=tu_token_aqui
```

Este archivo está en `.gitignore` y no se sube al repositorio.

### Correr

```bash
cd knowledge-map
python3 fetch_data.py
python3 build_graph.py
python3 -m http.server 8000
```

Abrir `http://localhost:8000` en el navegador.

Al correr `fetch_data.py` se ve en la consola el progreso de la descarga página por página hasta cubrir el período de los 5 releases. Al correr `build_graph.py` se muestra cuántos nodos y conexiones tiene el grafo, separado entre mergeados y pendientes.


## Decisiones técnicas

#### Por qué Python

Python fue elegido para el pipeline de datos por su ecosistema de librerías para consumir APIs HTTP y manipular JSON. La librería `requests` simplifica las llamadas a la API de GitHub a una sola línea por endpoint y el manejo nativo de diccionarios y listas hace que transformar los datos descargados en nodos y edges sea directo. No se necesita compilación ni configuración de entorno compleja.

#### Por qué vis-network

Para renderizar el grafo en el navegador se usó [vis-network](https://visjs.github.io/vis-network/docs/network/), una librería de JavaScript diseñada específicamente para visualizar grafos interactivos. Soporta posiciones fijas de nodos, zoom, drag, eventos de click por nodo y estilos visuales distintos por tipo de nodo.

#### API REST de GitHub

Para obtener los datos del repositorio se usó la API REST de GitHub, que expone directamente los endpoints necesarios: uno para releases, uno para pull requests y uno para issues. Con REST, cada consulta es una llamada HTTP independiente que devuelve un JSON con los datos.

#### Detección de conexiones PR -> Issue por regex

La API de GitHub no indica directamente qué issues cierra un PR. La única forma de obtener esa relación es leyendo la descripción del PR y buscando palabras como `closes`, `fixes` o `resolves` seguidas de un número de issue. Esa es la convención estándar que usa GitHub para cerrar issues automáticamente cuando se mergea un PR. Se usó regex porque el patrón a detectar es fijo y no requiere nada más complejo.

#### Pipeline en dos scripts separados

`fetch_data.py` y `build_graph.py` son independientes por diseño. Separar la descarga del procesamiento permite experimentar con el layout o las conexiones del grafo sin volver a llamar a la API cada vez, lo que evita tiempos de espera innecesarios y consumir el rate limit de GitHub.

#### Layout pre calculado en Python

Las posiciones de los nodos se calculan en Python y se guardan en `graph.json`. La alternativa era usar el motor de física de vis-network para que los nodos se acomodaran solos en el browser, pero con ~300 nodos la simulación tardaba varios segundos, producía un resultado diferente cada vez y no garantizaba la jerarquía visual deseada. Con el layout pre-calculado el grafo aparece instantáneamente y siempre con la misma estructura.

#### Testing

La solución no incluye tests automatizados. La validación se hizo de forma manual verificando que el grafo refleje las relaciones reales del repositorio, contrastando los resultados con los datos directamente en GitHub.

## Equipo

- Florencia Jasinski — 286670
- Julieta Trostchansky — 266993
- Eugenia Herrmann — 211811
