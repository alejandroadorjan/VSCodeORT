#!/usr/bin/env bash
set -euo pipefail
trap 'echo "Error: $0 falló en la línea ${LINENO}." >&2' ERR

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

echo "Iniciando Knowledge Map..."

if [[ ! -f ".env" ]]; then
  echo "Error: no se encontró el archivo .env en ${script_dir}." >&2
  echo "Crea .env con GITHUB_TOKEN=tu_token_aqui" >&2
  exit 1
fi

if [[ -f "fetch_data.py" ]]; then
  :
else
  echo "Error: no se encontró fetch_data.py en ${script_dir}." >&2
  exit 1
fi

if [[ -f "build_graph.py" ]]; then
  :
else
  echo "Error: no se encontró build_graph.py en ${script_dir}." >&2
  exit 1
fi

if command -v python3 >/dev/null 2>&1; then
  python_bin=python3
elif command -v python >/dev/null 2>&1; then
  python_bin=python
else
  echo "Error: Python no está instalado o no está en PATH." >&2
  exit 1
fi

echo "Usando Python: $($python_bin --version)"

echo "Descargando datos de GitHub..."
"$python_bin" fetch_data.py

echo "Construyendo el grafo..."
"$python_bin" build_graph.py

echo
echo "Servidor iniciado en http://localhost:8000"
echo "Abre esa URL en tu navegador para ver el Knowledge Map."

echo "Iniciando servidor web... (Ctrl+C para detener)"
exec "$python_bin" -m http.server 8000
