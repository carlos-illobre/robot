#!/usr/bin/env bash
# Arranque en un paso (Linux / macOS):  ./iniciar.sh [--robot g1] [--demo-catedra] ...
# Crea un entorno virtual la primera vez, instala dependencias, levanta el
# backend en modo demo y abre el dashboard en el navegador.
set -euo pipefail
cd "$(dirname "$0")"

PY=$(command -v python3 || command -v python || true)
if [ -z "$PY" ]; then
  echo "No encontré Python. Instalá Python 3.10 o superior: https://www.python.org/downloads/"
  exit 1
fi
if ! "$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  echo "Hace falta Python 3.10 o superior (tenés $("$PY" --version))."
  exit 1
fi

if [ ! -d .venv ]; then
  echo "» Creando entorno virtual (.venv)…"
  "$PY" -m venv .venv
fi
echo "» Instalando dependencias…"
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -r requirements.txt

PUERTO=8001
ARGS=("$@")
[ ${#ARGS[@]} -eq 0 ] && ARGS=(--demo)

URL="http://localhost:${PUERTO}"
( sleep 2
  if command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1
  elif command -v open >/dev/null; then open "$URL"
  fi ) &

exec .venv/bin/python backend/servidor.py --puerto "$PUERTO" "${ARGS[@]}"
