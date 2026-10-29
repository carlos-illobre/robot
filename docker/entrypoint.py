"""Arranque del contenedor: el simulador MuJoCo de la cátedra (opcional) y el backend.

Si la variable SIMULADOR tiene un robot ("go2" o "g1"), primero levanta el
simulador de la cátedra SIN VENTANA (en un contenedor no hay pantalla: el
simulador lo detecta y dibuja el recorrido en texto). Así, en el panel de
fuentes del dashboard, «Simulador MuJoCo» queda disponible. Después levanta el
backend con las opciones recibidas (por defecto, --demo).

    SIMULADOR=go2 python docker/entrypoint.py --demo
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

CATEDRA = Path("/opt/catedra/entorno")
BACKEND = Path("/app/backend/servidor.py")


def levantar_simulador(robot: str) -> subprocess.Popen | None:
    if not (CATEDRA / "sim").exists():
        print("[contenedor] El simulador de la cátedra no está en la imagen; se sigue sin él.")
        return None
    print(f"[contenedor] Levantando el simulador MuJoCo de la cátedra ({robot}, sin ventana)…")
    log = open("/tmp/simulador.log", "w")
    proc = subprocess.Popen(
        [sys.executable, "-m", "sim", "--robot", robot, "--materia", "tp05", "--sin-ventana", "--silencioso"],
        cwd=CATEDRA, stdout=log, stderr=subprocess.STDOUT,
    )
    marca = CATEDRA / "sim" / ".simulador_activo.json"
    for _ in range(60):  # hasta 30 s: la primera vez MuJoCo compila el modelo
        if marca.exists() or proc.poll() is not None:
            break
        time.sleep(0.5)
    if proc.poll() is not None:
        print("[contenedor] El simulador no arrancó (ver /tmp/simulador.log); se sigue sin él.")
        return None
    print("[contenedor] Simulador listo.")
    return proc


def main() -> int:
    robot = os.environ.get("SIMULADOR", "").strip().lower()
    sim = levantar_simulador(robot) if robot in ("go2", "g1") else None
    try:
        return subprocess.call([sys.executable, str(BACKEND), *sys.argv[1:]], cwd="/app")
    finally:
        if sim is not None:
            sim.terminate()


if __name__ == "__main__":
    raise SystemExit(main())
