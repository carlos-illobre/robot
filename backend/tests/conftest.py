"""Fixtures compartidas de las pruebas unitarias del backend (spec 007).

Las pruebas importan los módulos igual que el servidor: `backend/` y
`backend/api/` en `sys.path`, y la raíz del repo para `iniciar.py`.
"""

from __future__ import annotations

import importlib
import importlib.abc
import importlib.util
import sys
from pathlib import Path

import pytest

BASE = Path(__file__).resolve().parents[1]
API = BASE / "api"
RAIZ = BASE.parent
for _sub in (RAIZ, BASE, API):
    if str(_sub) not in sys.path:
        sys.path.insert(0, str(_sub))


class _AliasCanonico(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    """`import config` → el módulo `backend.api.config` (solo bajo mutmut; spec 008).

    El backend importa módulos "planos" (`from config import ROBOTS`) gracias a `sys.path`.
    mutmut asocia cada prueba con sus mutantes por el nombre completo del módulo, derivado de
    la ruta (`backend.api.config`): con este alias `import config` devuelve ese mismo módulo
    y la asociación funciona. Fuera de mutmut no se instala y las pruebas importan como el
    servidor.
    """

    @staticmethod
    def canonico(nombre):
        raiz = nombre.partition(".")[0]
        if raiz == "api":
            return "backend." + nombre
        if (API / f"{raiz}.py").exists() or (API / raiz).is_dir():
            return "backend.api." + nombre
        if raiz != "tests" and (BASE / f"{raiz}.py").exists():
            return "backend." + nombre
        return None

    def find_spec(self, nombre, path=None, target=None):
        if self.canonico(nombre) is None:
            return None
        return importlib.util.spec_from_loader(nombre, self)

    def create_module(self, spec):
        return importlib.import_module(self.canonico(spec.name))

    def exec_module(self, module):
        """El módulo canónico ya se ejecutó al importarlo."""


if "mutmut" in sys.modules:
    sys.meta_path.insert(0, _AliasCanonico())


def cargar_copia(ruta: Path, nombre: str):
    """Ejecuta el archivo `ruta` como un módulo nuevo llamado `nombre`.

    Sirve para cubrir lo que pasa al importar (p. ej. un `except ImportError`)
    sin tocar el módulo que ya usan las demás pruebas. La cobertura se mide por
    archivo, así que cuenta igual.
    """
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.fixture
def servidor_limpio():
    """Guarda y restaura el estado global de `telemetry_server` (lector, modelo, modo)."""
    import telemetry_server

    antes = (telemetry_server.reader, telemetry_server.modelo_activo,
             telemetry_server.modo_activo, telemetry_server.clientes_totales)
    yield telemetry_server
    (telemetry_server.reader, telemetry_server.modelo_activo,
     telemetry_server.modo_activo, telemetry_server.clientes_totales) = antes
    telemetry_server.active_websockets.clear()


class EventoFalso:
    """Reemplazo de `threading.Event`: `is_set()` y `wait()` responden según dos guiones.

    Cuando un guion se agota responde True (cortado), así ningún bucle queda colgado.
    """

    def __init__(self, is_set=(), wait=()):
        self._is_set = list(is_set)
        self._wait = list(wait)
        self.esperas = []
        self.seteado = False

    @staticmethod
    def _siguiente(guion):
        return guion.pop(0) if guion else True

    def is_set(self):
        return self._siguiente(self._is_set)

    def wait(self, timeout=None):
        self.esperas.append(timeout)
        return self._siguiente(self._wait)

    def set(self):
        self.seteado = True


class RelojFalso:
    """Reemplazo del módulo `time`: el tiempo solo avanza cuando se duerme."""

    def __init__(self, inicio: float = 1000.0):
        self.ahora = inicio
        self.siestas = []

    def time(self):
        return self.ahora

    def monotonic(self):
        return self.ahora

    def sleep(self, segundos):
        self.siestas.append(segundos)
        self.ahora += segundos


@pytest.fixture
def reloj():
    return RelojFalso()
