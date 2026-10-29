#!/usr/bin/env python3
"""Arranque en un paso, igual en Windows, macOS y Linux.

    python iniciar.py                  # demo con el Go2 (recomendado)
    python iniciar.py --robot g1       # demo con el humanoide G1
    python iniciar.py --real --interfaz eth0
    python iniciar.py --sin-navegador  # no abrir el navegador
    python iniciar.py --instalar-sdk   # instala el SDK de Unitree (para el robot real) y sale

La primera vez crea un entorno virtual (.venv) e instala las dependencias de
requirements.txt; las veces siguientes arranca directo (no necesita internet).
Después levanta el backend (backend/servidor.py) y abre el dashboard.

Cualquier opción que no sea de este script se le pasa tal cual a
backend/servidor.py (ver `python backend/servidor.py --help`).
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import threading
import time
import urllib.request
import venv
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
VENV = RAIZ / ".venv"
REQUISITOS = RAIZ / "requirements.txt"
MARCA = VENV / ".requisitos.sha256"   # para no reinstalar si no cambió nada
PYTHON_MINIMO = (3, 10)
SDK_UNITREE = "git+https://github.com/unitreerobotics/unitree_sdk2_python.git"


def python_del_venv() -> Path:
    """Ruta del intérprete del entorno virtual (distinta en Windows)."""
    if os.name == "nt":
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def paso(texto: str) -> None:
    print(f"» {texto}", flush=True)


def verificar_python() -> None:
    if sys.version_info < PYTHON_MINIMO:
        version = ".".join(map(str, sys.version_info[:3]))
        sys.exit(
            f"Hace falta Python {PYTHON_MINIMO[0]}.{PYTHON_MINIMO[1]} o superior (tenés {version}).\n"
            "Descargalo de https://www.python.org/downloads/ "
            "(en Windows, tildá «Add python.exe to PATH»)."
        )


def ver_paquetes_del_sistema() -> None:
    """Hace que .venv vea también los paquetes instalados en el Python del sistema.

    Así, si el SDK de Unitree ya estaba instalado en la notebook (por ejemplo, la
    preparó la cátedra), el modo «Robot real» lo detecta sin reinstalarlo. Las
    dependencias del proyecto, instaladas dentro de .venv, siguen teniendo
    prioridad. También corrige entornos creados con versiones anteriores de
    este script.
    """
    cfg = VENV / "pyvenv.cfg"
    if not cfg.exists():
        return
    lineas = cfg.read_text().splitlines()
    nuevas = [l for l in lineas if not l.strip().startswith("include-system-site-packages")]
    nuevas.append("include-system-site-packages = true")
    if nuevas != lineas:
        cfg.write_text("\n".join(nuevas) + "\n")


def preparar_entorno() -> Path:
    """Crea .venv e instala dependencias solo si hace falta."""
    py = python_del_venv()
    if not py.exists():
        paso("Creando el entorno virtual (.venv), solo la primera vez…")
        venv.EnvBuilder(with_pip=True, system_site_packages=True).create(VENV)
    ver_paquetes_del_sistema()

    huella = hashlib.sha256(REQUISITOS.read_bytes()).hexdigest()
    if not MARCA.exists() or MARCA.read_text().strip() != huella:
        paso("Instalando dependencias (necesita internet, solo la primera vez)…")
        pip = [str(py), "-m", "pip", "install", "--disable-pip-version-check", "-q"]
        subprocess.run([*pip, "--upgrade", "pip"], check=True)
        subprocess.run([*pip, "-r", str(REQUISITOS)], check=True)
        MARCA.write_text(huella)
    return py


def opcion(args: list[str], nombre: str, defecto: str) -> str:
    """Valor de una opción tipo `--puerto 8001` dentro de la lista de argumentos."""
    if nombre in args:
        i = args.index(nombre)
        if i + 1 < len(args):
            return args[i + 1]
    return defecto


def abrir_navegador_cuando_responda(url: str) -> None:
    """Espera a que el backend conteste y recién ahí abre el navegador."""
    def esperar():
        for _ in range(60):
            try:
                urllib.request.urlopen(f"{url}/info", timeout=1)
                webbrowser.open(url)
                return
            except OSError:
                time.sleep(0.5)
    threading.Thread(target=esperar, daemon=True).start()


def instalar_sdk(py: Path) -> int:
    """Instala el SDK de Unitree (y CycloneDDS) DENTRO de .venv: lo necesita el modo robot real."""
    paso("Instalando el SDK de Unitree (necesita internet, una sola vez)…")
    r = subprocess.run([str(py), "-m", "pip", "install", "--disable-pip-version-check", SDK_UNITREE])
    if r.returncode != 0:
        print(
            "\nNo se pudo instalar el SDK. Lo más común es que falle CycloneDDS:\n"
            "  · en Linux, probá con Python 3.10 (la versión que recomienda Unitree), o\n"
            "  · seguí la guía de https://github.com/unitreerobotics/unitree_sdk2_python\n"
            "El resto del dashboard (demo, simulador) funciona igual sin el SDK."
        )
        return 1
    paso("SDK instalado. Ya podés elegir «Robot real» en el dashboard.")
    return 0


def main() -> int:
    verificar_python()
    args = sys.argv[1:]
    if "--instalar-sdk" in args:
        try:
            return instalar_sdk(preparar_entorno())
        except subprocess.CalledProcessError:
            print("\nNo se pudieron instalar las dependencias. ¿Hay conexión a internet?")
            return 1
    abrir = "--sin-navegador" not in args
    args = [a for a in args if a != "--sin-navegador"]
    if not any(a in args for a in ("--demo", "--demo-catedra", "--real", "--simulador")):
        args.insert(0, "--demo")
    # "--simulador" es un alias legible del modo por defecto de servidor.py
    args = [a for a in args if a != "--simulador"]

    try:
        py = preparar_entorno()
    except subprocess.CalledProcessError:
        print("\nNo se pudieron instalar las dependencias. ¿Hay conexión a internet?")
        return 1

    puerto = opcion(args, "--puerto", "8001")
    if "--puerto" not in args:
        args += ["--puerto", puerto]
    if abrir:
        abrir_navegador_cuando_responda(f"http://localhost:{puerto}")

    paso("Levantando el backend (Ctrl+C para cerrar)…")
    try:
        return subprocess.call([str(py), str(RAIZ / "backend" / "servidor.py"), *args], cwd=RAIZ)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
