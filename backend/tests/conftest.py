"""Fixtures compartidas de las pruebas unitarias del backend (spec 007).

Las pruebas importan los módulos igual que el servidor: `backend/` y
`backend/api/` en `sys.path`, y la raíz del repo para `iniciar.py`.
"""

from __future__ import annotations

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
    """Reemplazo de `threading.Event` que responde `is_set()`/`wait()` según un guion."""

    def __init__(self, respuestas):
        self._respuestas = list(respuestas)
        self.esperas = []
        self.seteado = False

    def _siguiente(self):
        return self._respuestas.pop(0) if self._respuestas else True

    def is_set(self):
        return self._siguiente()

    def wait(self, timeout=None):
        self.esperas.append(timeout)
        return self._siguiente()

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
