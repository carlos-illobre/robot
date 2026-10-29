"""Pruebas del backend: el contrato de docs/API.md se cumple con el lector demo.

Correr con:  python -m pytest backend/tests -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BASE = Path(__file__).resolve().parents[1]
for sub in (BASE, BASE / "api"):
    sys.path.insert(0, str(sub))

from fastapi.testclient import TestClient  # noqa: E402

import telemetry_server  # noqa: E402
from demo_paseo import GUION, PaseoDemoReader  # noqa: E402
from telemetry_adapter import adaptar_telemetria  # noqa: E402

CLAVES = {"modelo", "ts", "motores", "imu", "bms", "fuerzas"}


@pytest.fixture(params=["go2", "g1"])
def cliente(request):
    lector = PaseoDemoReader(request.param)
    telemetry_server.configurar(lector, request.param, "demo")
    with TestClient(telemetry_server.app) as c:
        yield request.param, c
    lector.cerrar()


def test_info_coincide_con_el_robot(cliente):
    modelo, c = cliente
    info = c.get("/info").json()
    assert info["modelo"] == modelo
    assert info["n_motores"] == (12 if modelo == "go2" else 29)
    assert len(info["motores_nombres"]) == info["n_motores"]


def test_telemetria_respeta_el_contrato(cliente):
    modelo, c = cliente
    t = c.get("/telemetria").json()
    assert set(t) == CLAVES
    assert t["modelo"] == modelo
    motor = t["motores"][0]
    assert set(motor) == {"id", "nombre", "angulo", "velocidad", "torque", "temperatura"}
    assert set(t["imu"]) == {"roll", "pitch", "yaw", "ax", "ay", "az"}
    assert set(t["bms"]) == {"soc", "corriente", "temperatura", "celdas"}
    assert all(v in (0, 1) for v in t["fuerzas"].values())
    assert 0 < t["bms"]["soc"] <= 100
    assert all(3.0 < v < 4.3 for v in t["bms"]["celdas"])


def test_endpoints_parciales(cliente):
    _, c = cliente
    assert set(c.get("/imu").json()) == {"roll", "pitch", "yaw", "ax", "ay", "az"}
    assert "soc" in c.get("/bms").json()
    assert isinstance(c.get("/fuerzas").json(), dict)
    assert len(c.get("/motores").json()["motores"]) == c.get("/info").json()["n_motores"]


def test_modelo_equivocado_devuelve_409(cliente):
    modelo, c = cliente
    otro = "g1" if modelo == "go2" else "go2"
    assert c.get(f"/telemetria?modelo={otro}").status_code == 409
    assert c.get("/telemetria?modelo=xyz").status_code == 400


def test_websocket_empuja_telemetria(cliente):
    modelo, c = cliente
    with c.websocket_connect("/ws") as ws:
        primero = ws.receive_json()
        segundo = ws.receive_json()
    assert set(primero) == CLAVES and primero["modelo"] == modelo
    assert segundo["ts"] >= primero["ts"]


def _simular(modelo: str, segundos: float) -> list[dict]:
    """Avanza el paseo sin esperar tiempo real y devuelve las muestras adaptadas."""
    lector = PaseoDemoReader(modelo)
    lector.cerrar()  # se detiene el hilo: se integra a mano
    muestras = []
    for i in range(int(segundos * 50)):
        lector._paso()
        if i % 25 == 0:
            muestras.append((lector.tramo, adaptar_telemetria(lector.obtener_snapshot(), modelo)))
    return muestras


def test_paseo_recorre_los_tres_colores_del_semaforo():
    temps = [m["temperatura"] for _, t in _simular("go2", 240) for m in t["motores"]]
    assert min(temps) < 40 < 60 < max(temps)


def test_quieto_apoya_las_cuatro_patas_y_caminando_no():
    muestras = _simular("go2", sum(d for d, *_ in GUION))
    quieto = [t for tramo, t in muestras if tramo == "quieto"][-1]
    assert sum(quieto["fuerzas"].values()) == 4
    trotando = [sum(t["fuerzas"].values()) for tramo, t in muestras if tramo == "trota"]
    assert min(trotando) <= 2


def test_yaw_cambia_al_girar():
    yaws = [t["imu"]["yaw"] for tramo, t in _simular("go2", 40) if "curva" in tramo]
    assert max(yaws) - min(yaws) > 20
