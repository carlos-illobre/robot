"""Pruebas de `servidor.py`: fábrica de lectores, reordenamiento del simulador, dashboard y arranque.

uvicorn, la red y los lectores reales se reemplazan por dobles: nada escucha
en un puerto ni abre un socket.
"""

from __future__ import annotations

import runpy
import socket
import sys
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.demo_paseo
import api.telemetry_reader
import api.telemetry_reader_dds
import api.telemetry_server
import fuentes
import servidor
from conftest import API, BASE
from servidor import ORDEN_SIM_GO2, OrdenSimulador, crear_lector, montar_dashboard


# ---------- rutas ----------
def test_rutas_del_backend_y_del_frontend():
    assert servidor.BASE == BASE
    assert servidor.FRONTEND == BASE.parent / "frontend"
    assert str(BASE) in sys.path and str(API) in sys.path


# ---------- IP de la máquina ----------
class SocketUDP:
    def __init__(self, *args, falla=False):
        self.args = args
        self.falla = falla
        self.destinos = []

    def connect(self, destino):
        self.destinos.append(destino)
        if self.falla:
            raise OSError("sin red")

    def getsockname(self):
        return ("192.168.0.42", 50123)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _red(monkeypatch, falla=False):
    creados = []

    def crear(*args):
        s = SocketUDP(*args, falla=falla)
        creados.append(s)
        return s

    monkeypatch.setattr(servidor, "socket", SimpleNamespace(
        AF_INET=socket.AF_INET, SOCK_DGRAM=socket.SOCK_DGRAM, socket=crear))
    return creados


def test_ip_de_la_maquina_sale_de_la_ruta_por_defecto(monkeypatch):
    creados = _red(monkeypatch)
    assert servidor.ip_de_la_maquina() == "192.168.0.42"
    assert creados[0].args == (socket.AF_INET, socket.SOCK_DGRAM)
    assert creados[0].destinos == [("8.8.8.8", 80)]


def test_ip_de_la_maquina_sin_red_es_localhost(monkeypatch):
    _red(monkeypatch, falla=True)
    assert servidor.ip_de_la_maquina() == "127.0.0.1"


# ---------- fábrica de lectores ----------
class Registro:
    """Clase falsa que anota con qué argumentos se la construyó."""

    def __init__(self, *args, **kwargs):
        self.args, self.kwargs = args, kwargs


def test_fabrica_demo(monkeypatch):
    monkeypatch.setattr(api.demo_paseo, "PaseoDemoReader", Registro)
    lector = crear_lector("demo", "g1")
    assert isinstance(lector, Registro) and lector.args == ("g1",) and lector.kwargs == {}


def test_fabrica_demo_de_la_catedra(monkeypatch):
    monkeypatch.setattr(api.telemetry_reader_dds, "DemoReader", Registro)
    lector = crear_lector("demo-catedra", "go2", "eth0")
    assert isinstance(lector, Registro) and lector.args == ("go2",)


def test_fabrica_robot_real_por_dds(monkeypatch):
    monkeypatch.setattr(api.telemetry_reader_dds, "TelemetryReader", Registro)
    lector = crear_lector("real", "g1", "enp3s0")
    assert lector.args == ("g1",) and lector.kwargs == {"network_interface": "enp3s0"}
    assert crear_lector("real", "go2").kwargs == {"network_interface": None}


def test_fabrica_simulador_go2_reordena_las_patas(monkeypatch):
    monkeypatch.setattr(api.telemetry_reader, "TelemetryReader", Registro)
    lector = crear_lector("simulador", "go2")
    assert isinstance(lector, OrdenSimulador)
    assert lector._lector.args == ("go2",) and lector._lector.kwargs == {"network_interface": "lo"}


def test_fabrica_simulador_g1_no_reordena(monkeypatch):
    monkeypatch.setattr(api.telemetry_reader, "TelemetryReader", Registro)
    lector = crear_lector("simulador", "g1", "eth0")
    assert isinstance(lector, Registro)
    assert lector.kwargs == {"network_interface": "lo"}


# ---------- OrdenSimulador ----------
class LectorFijo:
    def __init__(self, snap):
        self.snap = snap
        self.cerrado = False

    def obtener_snapshot(self):
        return self.snap

    def cerrar(self):
        self.cerrado = True


def test_orden_del_simulador_al_del_sdk():
    assert ORDEN_SIM_GO2 == [3, 4, 5, 0, 1, 2, 9, 10, 11, 6, 7, 8]
    publicado = [{"id": i, "q": i * 0.1, "temperature": 30 + i} for i in range(12)]
    snap = OrdenSimulador(LectorFijo({"motor_state": publicado, "imu": {"x": 1}})).obtener_snapshot()
    assert [m["temperature"] for m in snap["motor_state"]] == [30 + j for j in ORDEN_SIM_GO2]
    assert [m["id"] for m in snap["motor_state"]] == list(range(12))
    assert snap["imu"] == {"x": 1}
    assert publicado[0]["id"] == 0 and publicado[3]["id"] == 3     # no toca el original


@pytest.mark.parametrize("snap", [None, {}, {"motor_state": None}, {"motor_state": [{"id": 0}] * 11},
                                  {"motor_state": [{"id": 0}] * 13}])
def test_orden_no_toca_lo_que_no_tiene_doce_motores(snap):
    import copy

    original = copy.deepcopy(snap)
    assert OrdenSimulador(LectorFijo(snap)).obtener_snapshot() == original


def test_orden_delega_el_resto_de_la_interfaz():
    interno = LectorFijo(None)
    interno.mensajes_leidos = 9
    envuelto = OrdenSimulador(interno)
    assert envuelto.mensajes_leidos == 9
    envuelto.cerrar()
    assert interno.cerrado is True
    with pytest.raises(AttributeError):
        envuelto.no_existe


# ---------- dashboard ----------
def test_sin_frontend_no_se_monta_nada(monkeypatch, tmp_path):
    monkeypatch.setattr(servidor, "FRONTEND", tmp_path / "no-existe")
    app = FastAPI()
    antes = len(app.routes)
    montar_dashboard(app)
    assert len(app.routes) == antes


def test_dashboard_se_sirve_en_dashboard_y_la_raiz_redirige(monkeypatch, tmp_path):
    (tmp_path / "index.html").write_text("<h1>tablero</h1>", encoding="utf-8")
    monkeypatch.setattr(servidor, "FRONTEND", tmp_path)
    app = FastAPI()
    montar_dashboard(app)
    with TestClient(app) as c:
        r = c.get("/", follow_redirects=False)
        assert r.status_code == 307 and r.headers["location"] == "/dashboard/"
        assert c.get("/dashboard/").text == "<h1>tablero</h1>"
        assert "/" not in c.get("/openapi.json").json()["paths"]


# ---------- main ----------
class LectorArranque:
    def __init__(self, responde=True):
        self.responde = responde
        self.esperas = []

    def esperar_primer_dato(self, timeout):
        self.esperas.append(timeout)
        return self.responde


@pytest.fixture
def arranque(monkeypatch):
    """Dobles de todo lo que toca main(): fábrica, servidor de la cátedra, uvicorn, red y router."""
    import uvicorn

    d = SimpleNamespace(lector=LectorArranque(), fabrica=[], configurados=[], uvicorn=[], routers=[],
                        app=FastAPI(), error=None)

    def fabrica(modo, robot, interfaz):
        d.fabrica.append((modo, robot, interfaz))
        if d.error:
            raise d.error
        return d.lector

    def router(crear, configurar, estado, cambiable=True):
        d.routers.append((crear, configurar, dict(estado), cambiable))
        return original_router(crear, configurar, estado, cambiable=cambiable)

    original_router = fuentes.crear_router
    monkeypatch.setattr(servidor, "crear_lector", fabrica)
    monkeypatch.setattr(servidor, "ip_de_la_maquina", lambda: "10.1.2.3")
    monkeypatch.setattr(api.telemetry_server, "app", d.app)
    monkeypatch.setattr(api.telemetry_server, "configurar", lambda *a: d.configurados.append(a))
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: d.uvicorn.append((app, kw)))
    monkeypatch.setattr(fuentes, "crear_router", router)
    return d


def test_main_demo_por_defecto_con_go2(arranque, capsys):
    assert servidor.main(["--demo"]) == 0
    assert arranque.fabrica == [("demo", "go2", None)]
    assert arranque.lector.esperas == []          # la demo no se espera
    assert arranque.configurados == [(arranque.lector, "go2", "demo")]
    assert arranque.uvicorn == [(arranque.app, {"host": "0.0.0.0", "port": 8001, "log_level": "warning"})]
    _, _, estado, cambiable = arranque.routers[0]
    assert estado == {"lector": arranque.lector, "modo": "demo", "robot": "go2", "interfaz": None}
    assert cambiable is True
    assert {"/fuentes", "/fuente"} <= set(arranque.app.openapi()["paths"])
    with TestClient(arranque.app) as c:
        assert c.get("/", follow_redirects=False).headers["location"] == "/dashboard/"
    salida = capsys.readouterr().out
    assert "BACKEND DE TELEMETRIA TP05 LISTO" in salida
    assert "Robot : go2   Modo: demo" in salida
    assert "DASHBOARD  ->  http://localhost:8001" in salida
    assert "(desde otra maquina de la red: http://10.1.2.3:8001)" in salida
    for e in ("/telemetria", "/motores", "/imu", "/bms", "/fuerzas", "/info"):
        assert f"GET  {e}\n" in salida
    assert "WS   ws://10.1.2.3:8001/ws" in salida
    assert "Documentacion OpenAPI: http://localhost:8001/docs" in salida


def test_main_le_pasa_al_router_la_fabrica_y_configurar_reales(arranque):
    servidor.main(["--demo"])
    crear, configurar, _, _ = arranque.routers[0]
    assert crear is servidor.crear_lector
    assert configurar is api.telemetry_server.configurar


def test_main_con_opciones(arranque, capsys):
    assert servidor.main(["--demo-catedra", "--robot", "g1", "--puerto", "9100",
                          "--host", "127.0.0.1", "--fuente-fija"]) == 0
    assert arranque.fabrica == [("demo-catedra", "g1", None)]
    assert arranque.configurados == [(arranque.lector, "g1", "demo")]
    assert arranque.uvicorn[0][1] == {"host": "127.0.0.1", "port": 9100, "log_level": "warning"}
    assert arranque.routers[0][3] is False
    assert arranque.routers[0][2]["modo"] == "demo-catedra"
    assert "Robot : g1   Modo: demo-catedra" in capsys.readouterr().out


def test_main_simulador_espera_ocho_segundos_el_primer_dato(arranque, capsys):
    assert servidor.main([]) == 0
    assert arranque.fabrica == [("simulador", "go2", None)]
    assert arranque.lector.esperas == [8.0]
    assert arranque.configurados == [(arranque.lector, "go2", "simulador")]
    assert "Modo: simulador" in capsys.readouterr().out


def test_main_simulador_cerrado_explica_que_hacer(arranque, capsys):
    arranque.lector.responde = False
    assert servidor.main(["--robot", "g1"]) == 1
    assert arranque.uvicorn == [] and arranque.configurados == []
    salida = capsys.readouterr().out
    assert "No llegan datos del simulador MuJoCo de la catedra." in salida
    assert "Fijate que la ventana del simulador siga abierta," in salida
    assert "python backend/servidor.py --demo" in salida


def test_main_robot_real(arranque, capsys):
    assert servidor.main(["--real", "--interfaz", "enp3s0"]) == 0
    assert arranque.fabrica == [("real", "go2", "enp3s0")]
    assert arranque.lector.esperas == [8.0]
    assert arranque.configurados == [(arranque.lector, "go2", "real")]
    assert arranque.routers[0][2]["interfaz"] == "enp3s0"


def test_main_interfaz_vacia_es_automatica(arranque):
    servidor.main(["--real", "--interfaz", ""])
    assert arranque.fabrica == [("real", "go2", None)]


def test_main_robot_real_que_no_responde(arranque, capsys):
    arranque.lector.responde = False
    assert servidor.main(["--real", "--interfaz", "eth0"]) == 1
    salida = capsys.readouterr().out
    assert "No llegan datos del robot por DDS." in salida
    assert "Verifica el cable, que el robot este encendido y la interfaz" in salida
    assert "(eth0): ip -br addr  muestra las interfaces." in salida
    assert "simulador" not in salida
    assert arranque.uvicorn == []


def test_main_robot_real_sin_interfaz_dice_automatica(arranque, capsys):
    arranque.lector.responde = False
    assert servidor.main(["--real"]) == 1
    assert "(automatica): ip -br addr" in capsys.readouterr().out


def test_main_sin_sdk_avisa_y_sale_con_error(arranque, capsys):
    arranque.error = RuntimeError("No se encontro unitree_sdk2py.")
    assert servidor.main(["--real"]) == 1
    assert capsys.readouterr().out == "\n  No se encontro unitree_sdk2py.\n\n"
    assert arranque.uvicorn == [] and arranque.configurados == []


@pytest.mark.parametrize("argv", [["--demo", "--real"], ["--robot", "h1"], ["--puerto", "abc"]])
def test_main_opciones_invalidas(arranque, argv, capsys):
    with pytest.raises(SystemExit) as e:
        servidor.main(argv)
    assert e.value.code == 2
    assert arranque.fabrica == []


# ---------- python backend/servidor.py ----------
def test_ejecutado_como_script_arma_sys_path_y_arranca(monkeypatch, capsys):
    import uvicorn

    corridas = []

    class Paseo:
        def __init__(self, robot):
            self.robot = robot

    app = FastAPI()
    configurados = []
    monkeypatch.setattr(api.demo_paseo, "PaseoDemoReader", Paseo)
    monkeypatch.setattr(api.telemetry_server, "app", app)
    monkeypatch.setattr(api.telemetry_server, "configurar", lambda *a: configurados.append(a))
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: corridas.append((app, kw)))
    monkeypatch.setattr(socket, "socket", lambda *a: SocketUDP(*a))
    monkeypatch.setattr(sys, "argv", ["servidor.py", "--demo", "--robot", "g1", "--puerto", "8123"])
    monkeypatch.setattr(sys, "path", [p for p in sys.path if p not in (str(BASE), str(API))])

    with pytest.raises(SystemExit) as e:
        runpy.run_path(str(BASE / "servidor.py"), run_name="__main__")
    assert e.value.code == 0
    assert sys.path[:2] == [str(API), str(BASE)]
    assert corridas == [(app, {"host": "0.0.0.0", "port": 8123, "log_level": "warning"})]
    assert configurados[0][1:] == ("g1", "demo") and configurados[0][0].robot == "g1"
    assert "http://192.168.0.42:8123" in capsys.readouterr().out


def test_importado_no_arranca_nada(monkeypatch):
    import uvicorn

    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: pytest.fail("no debía arrancar"))
    modulo = runpy.run_path(str(BASE / "servidor.py"), run_name="servidor_importado")
    assert callable(modulo["main"])
