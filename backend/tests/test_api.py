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


def test_modo_real_sin_sdk_falla_con_un_mensaje_claro(monkeypatch):
    """Sin unitree_sdk2py, --real no se cuelga: avisa qué falta y sale con error."""
    import builtins

    import servidor

    original = builtins.__import__

    def sin_sdk(nombre, *args, **kwargs):
        if nombre.startswith("unitree_sdk2py"):
            raise ImportError(nombre)
        return original(nombre, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", sin_sdk)
    with pytest.raises(RuntimeError, match="unitree_sdk2py"):
        servidor.crear_lector("real", "go2", "eth0")
    assert servidor.main(["--real", "--robot", "go2"]) == 1


def test_cambiar_la_fuente_en_caliente():
    """POST /fuente cambia de Go2 a G1 sin reiniciar, y una fuente no disponible se rechaza."""
    import servidor
    from fuentes import crear_router
    from fastapi import FastAPI

    app = FastAPI()
    lector = PaseoDemoReader("go2")
    telemetry_server.configurar(lector, "go2", "demo")
    estado = {"lector": lector, "modo": "demo", "robot": "go2", "interfaz": None}
    app.include_router(crear_router(servidor.crear_lector, telemetry_server.configurar, estado))
    app.mount("/api", telemetry_server.app)

    with TestClient(app) as c:
        assert c.get("/fuentes").json()["actual"]["robot"] == "go2"
        r = c.post("/fuente", json={"modo": "demo", "robot": "g1"})
        assert r.status_code == 200, r.text
        assert c.get("/api/info").json()["n_motores"] == 29
        assert len(c.get("/api/telemetria").json()["motores"]) == 29
        disponibles = {f["modo"]: f["disponible"] for f in c.get("/fuentes").json()["fuentes"]}
        if not disponibles["real"]:
            assert c.post("/fuente", json={"modo": "real", "robot": "go2"}).status_code == 409
        assert c.post("/fuente", json={"modo": "xyz"}).status_code == 400
    estado["lector"].cerrar()


def test_fuente_fija_no_se_puede_cambiar():
    import servidor
    from fuentes import crear_router
    from fastapi import FastAPI

    app = FastAPI()
    estado = {"lector": None, "modo": "demo", "robot": "go2", "interfaz": None}
    app.include_router(crear_router(servidor.crear_lector, telemetry_server.configurar, estado, cambiable=False))
    with TestClient(app) as c:
        assert c.get("/fuentes").json()["cambiable"] is False
        assert c.post("/fuente", json={"modo": "demo", "robot": "g1"}).status_code == 403


def test_g1_nombra_la_cadera_en_el_orden_real_de_unitree():
    """El SDK y g1_29dof.xml ordenan la cadera pitch, roll, yaw (config.py original: yaw, roll, pitch)."""
    from config import ROBOTS

    nombres = ROBOTS["g1"]["motores_nombres"]
    assert nombres[:3] == ["L_hip_pitch", "L_hip_roll", "L_hip_yaw"]
    assert nombres[6:9] == ["R_hip_pitch", "R_hip_roll", "R_hip_yaw"]
    assert len(nombres) == len(set(nombres)) == 29


def test_simulador_go2_se_reordena_al_orden_del_sdk():
    """El simulador publica FL, FR, RL, RR; el contrato espera FR, FL, RR, RL."""
    from servidor import OrdenSimulador

    orden_mjcf = ["FL", "FR", "RL", "RR"]
    publicado = [{"id": i, "q": float(i)} for i in range(12)]   # q = índice en el simulador

    class LectorFalso:
        def obtener_snapshot(self):
            return {"motor_state": [dict(m) for m in publicado]}

        mensajes_leidos = 7

    snap = OrdenSimulador(LectorFalso()).obtener_snapshot()
    patas = [orden_mjcf[int(m["q"]) // 3] for m in snap["motor_state"]]
    assert patas == ["FR"] * 3 + ["FL"] * 3 + ["RR"] * 3 + ["RL"] * 3
    assert [m["id"] for m in snap["motor_state"]] == list(range(12))
    assert OrdenSimulador(LectorFalso()).mensajes_leidos == 7


def test_fuentes_lista_las_placas_de_red_y_sugiere_la_del_robot(monkeypatch):
    """El dashboard ofrece un desplegable de placas y preselecciona la red 192.168.123.x."""
    import config
    import fuentes

    monkeypatch.setattr(config, "interfaces_ipv4", lambda: {"wlp2s0": "10.0.0.7", "enp3s0": "192.168.123.99"})
    placas = fuentes.interfaces_de_red()
    assert placas[0] == {"nombre": "enp3s0", "ip": "192.168.123.99", "robot": True}
    assert [p["nombre"] for p in placas] == ["enp3s0", "wlp2s0"]
