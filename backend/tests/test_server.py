"""Pruebas de `api/telemetry_server.py`: rutas REST, WebSocket, ciclo de vida y estadísticas."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

SNAP = {
    "timestamp": None,
    "motor_state": [{"q": 0.0, "dq": 0.0, "tau_est": 1.0, "temperature": 35}],
    "imu": {"quaternion": [1, 0, 0, 0], "accelerometer": [0, 0, 9.81]},
    "bms": {"soc": 77, "current": 900, "temperature": 30.0, "cell_vol": [3700]},
    "foot_force": [50, 0, 50, 0],
}


class LectorFalso:
    def __init__(self, snapshots=(SNAP,), mensajes=0):
        self._snapshots = list(snapshots)
        self.mensajes_leidos = mensajes
        self.cerrado = 0

    def obtener_snapshot(self):
        valor = self._snapshots.pop(0) if len(self._snapshots) > 1 else self._snapshots[0]
        if isinstance(valor, Exception):
            raise valor
        return valor

    def cerrar(self):
        self.cerrado += 1


@pytest.fixture
def ts(servidor_limpio):
    return servidor_limpio


def test_configurar_inyecta_lector_modelo_y_modo(ts):
    lector = LectorFalso()
    ts.configurar(lector, "g1", "real")
    assert (ts.reader, ts.modelo_activo, ts.modo_activo) == (lector, "g1", "real")


def test_al_apagar_el_servidor_se_cierra_el_lector(ts):
    lector = LectorFalso()
    ts.configurar(lector, "go2", "demo")
    with TestClient(ts.app):
        assert lector.cerrado == 0
    assert lector.cerrado == 1


def test_sin_datos_todavia_responde_503(ts):
    ts.configurar(LectorFalso([None]), "go2", "simulador")
    with TestClient(ts.app) as c:
        for ruta in ("/telemetria", "/motores", "/imu", "/bms", "/fuerzas"):
            r = c.get(ruta)
            assert r.status_code == 503
            assert r.json() == {"detail": "Aun no se recibio telemetria del robot"}


def test_modelo_invalido_y_modelo_ajeno(ts):
    ts.configurar(LectorFalso(), "go2", "demo")
    with TestClient(ts.app) as c:
        r = c.get("/telemetria?modelo=h1")
        assert (r.status_code, r.json()["detail"]) == (400, "Modelo valido: go2 o g1")
        r = c.get("/telemetria?modelo=g1")
        assert r.status_code == 409
        assert r.json()["detail"] == "El servidor esta conectado a go2, no a g1"
        assert c.get("/telemetria?modelo=go2").status_code == 200


def test_rutas_parciales_salen_del_mismo_snapshot(ts):
    ts.configurar(LectorFalso(), "go2", "demo")
    with TestClient(ts.app) as c:
        motores = c.get("/motores").json()
        assert motores["modelo"] == "go2" and motores["n_motores"] == 12
        assert motores["motores"][0]["torque"] == 1.0
        assert c.get("/imu").json() == {"roll": 0.0, "pitch": 0.0, "yaw": 0.0, "ax": 0.0, "ay": 0.0, "az": 9.81}
        assert c.get("/bms").json() == {"soc": 77, "corriente": 900, "temperatura": 30.0, "celdas": [3.7]}
        assert c.get("/fuerzas").json() == {"FR": 1, "FL": 0, "RR": 1, "RL": 0}


def test_info_y_modo(ts):
    ts.configurar(LectorFalso(), "g1", "simulador")
    with TestClient(ts.app) as c:
        info = c.get("/info").json()
        assert info["modelo"] == "g1" and info["nombre"] == "Unitree G1 EDU"
        assert info["tipo"] == "humanoide" and info["n_motores"] == 29
        assert info["patas"] == ["R_foot", "L_foot"]
        assert info["frecuencia_hz"] == 10 and info["modo"] == "simulador"
        assert c.get("/modo").json() == {"modo": "simulador", "robot": "g1"}


def test_cors_abierto(ts):
    ts.configurar(LectorFalso(), "go2", "demo")
    with TestClient(ts.app) as c:
        r = c.get("/info", headers={"Origin": "http://otra.maquina"})
        assert r.headers["access-control-allow-origin"] == "*"


def test_websocket_espera_datos_y_sigue_si_el_cliente_habla(ts):
    """Sin snapshot no manda nada; un mensaje del cliente no corta la conexión."""
    ts.configurar(LectorFalso([None, None, SNAP]), "go2", "demo")
    with TestClient(ts.app) as c:
        with c.websocket_connect("/ws") as ws:
            assert ts.active_websockets
            ws.send_text("hola")
            ws.send_text("sigo acá")
            dato = ws.receive_json()
            assert dato["modelo"] == "go2" and dato["bms"]["soc"] == 77
    assert ts.active_websockets == set()
    assert ts.clientes_totales >= 1


def test_websocket_que_falla_se_descarta_sin_romper_el_servidor(ts):
    ts.configurar(LectorFalso([RuntimeError("lector roto")]), "go2", "demo")
    antes = ts.clientes_totales
    with TestClient(ts.app) as c:
        with c.websocket_connect("/ws"):
            pass
        assert c.get("/modo").status_code == 200
    assert ts.active_websockets == set()
    assert ts.clientes_totales == antes + 1


def test_estadisticas(ts):
    ts.configurar(LectorFalso(mensajes=123), "go2", "demo")
    ts.clientes_totales = 4
    ts.active_websockets.add("ws-falso")
    assert ts.estadisticas() == {"snapshots": 123, "clientes_totales": 4, "websockets_activos": 1}
