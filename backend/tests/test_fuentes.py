"""Pruebas de `fuentes.py`: GET /fuentes y POST /fuente para cambiar la fuente en caliente."""

from __future__ import annotations

import sys
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import fuentes
import telemetry_reader
from fuentes import FUENTES, PedidoFuente, crear_router, disponibilidad, interfaces_de_red

MOTIVO_SDK = ("Falta el SDK de Unitree en la máquina del backend. Instalalo con "
              "«python iniciar.py --instalar-sdk» y volvé a arrancar el backend.")
MOTIVO_SIM = "El simulador MuJoCo de la cátedra no está abierto en esta máquina."


# ---------- disponibilidad ----------
def test_sdk_instalado_busca_unitree_sdk2py(monkeypatch):
    buscados = []

    def find_spec(nombre):
        buscados.append(nombre)
        return object() if nombre == "unitree_sdk2py" else None

    monkeypatch.setattr(fuentes.importlib.util, "find_spec", find_spec)
    assert fuentes._sdk_instalado() is True
    monkeypatch.setattr(fuentes.importlib.util, "find_spec", lambda n: buscados.append(n))
    assert fuentes._sdk_instalado() is False
    assert buscados == ["unitree_sdk2py", "unitree_sdk2py"]


class Conexion:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_simulador_abierto_si_responde_el_socket(monkeypatch):
    pedidos = []

    def conectar(direccion, timeout):
        pedidos.append((direccion, timeout))
        return Conexion()

    monkeypatch.setattr(fuentes, "socket", SimpleNamespace(create_connection=conectar))
    monkeypatch.setattr(telemetry_reader, "_puerto_del_simulador", lambda: 9555)
    assert fuentes._simulador_abierto() is True
    assert pedidos == [(("127.0.0.1", 9555), 0.3)]


def test_simulador_cerrado(monkeypatch):
    def rechazar(direccion, timeout):
        raise ConnectionRefusedError()

    monkeypatch.setattr(fuentes, "socket", SimpleNamespace(create_connection=rechazar))
    monkeypatch.setattr(telemetry_reader, "_puerto_del_simulador", lambda: 9555)
    assert fuentes._simulador_abierto() is False


def test_simulador_sin_el_lector_del_paquete(monkeypatch):
    monkeypatch.setitem(sys.modules, "telemetry_reader", None)
    assert fuentes._simulador_abierto() is False


@pytest.fixture
def entorno(monkeypatch):
    """Por defecto: con SDK y con simulador. Cada prueba cambia lo que necesita."""
    estado = SimpleNamespace(sdk=True, simulador=True)
    monkeypatch.setattr(fuentes, "_sdk_instalado", lambda: estado.sdk)
    monkeypatch.setattr(fuentes, "_simulador_abierto", lambda: estado.simulador)
    monkeypatch.setattr(fuentes, "interfaces_de_red", lambda: [])
    return estado


def test_disponibilidad_de_cada_fuente(entorno):
    for modo in ("real", "simulador", "demo", "demo-catedra"):
        assert disponibilidad(modo) == (True, "")
    entorno.sdk = False
    entorno.simulador = False
    assert disponibilidad("real") == (False, MOTIVO_SDK)
    assert disponibilidad("simulador") == (False, MOTIVO_SIM)
    assert disponibilidad("demo") == (True, "")
    assert disponibilidad("demo-catedra") == (True, "")


def test_disponibilidad_no_pregunta_lo_que_no_hace_falta(monkeypatch):
    monkeypatch.setattr(fuentes, "_sdk_instalado", lambda: pytest.fail("no hacía falta el SDK"))
    monkeypatch.setattr(fuentes, "_simulador_abierto", lambda: pytest.fail("no hacía falta el simulador"))
    assert disponibilidad("demo") == (True, "")


# ---------- placas de red ----------
def test_interfaces_ordenadas_primero_las_del_robot(monkeypatch):
    import config

    monkeypatch.setattr(config, "interfaces_ipv4", lambda: {
        "wlp2s0": "10.0.0.7", "eth1": "192.168.123.5", "enp3s0": "192.168.123.99", "docker0": "172.17.0.1"})
    assert interfaces_de_red() == [
        {"nombre": "enp3s0", "ip": "192.168.123.99", "robot": True},
        {"nombre": "eth1", "ip": "192.168.123.5", "robot": True},
        {"nombre": "docker0", "ip": "172.17.0.1", "robot": False},
        {"nombre": "wlp2s0", "ip": "10.0.0.7", "robot": False},
    ]


def test_red_parecida_no_es_la_del_robot(monkeypatch):
    import config

    monkeypatch.setattr(config, "interfaces_ipv4", lambda: {"eth0": "192.168.12.3"})
    assert interfaces_de_red() == [{"nombre": "eth0", "ip": "192.168.12.3", "robot": False}]
    assert fuentes.RED_DEL_ROBOT == "192.168.123."


def test_interfaces_que_fallan_dan_lista_vacia(monkeypatch):
    import config

    def falla():
        raise OSError("sin /sys")

    monkeypatch.setattr(config, "interfaces_ipv4", falla)
    assert interfaces_de_red() == []


# ---------- rutas ----------
class Lector:
    def __init__(self, nombre, responde=True):
        self.nombre = nombre
        self.responde = responde
        self.esperas = []
        self.cerrado = 0

    def esperar_primer_dato(self, timeout):
        self.esperas.append(timeout)
        return self.responde

    def cerrar(self):
        self.cerrado += 1


class Fabrica:
    def __init__(self, resultado=None, error=None):
        self.resultado = resultado
        self.error = error
        self.pedidos = []

    def __call__(self, modo, robot, interfaz):
        self.pedidos.append((modo, robot, interfaz))
        if self.error:
            raise self.error
        return self.resultado


def _cliente(fabrica, estado, cambiable=True):
    configurados = []
    app = FastAPI()
    app.include_router(crear_router(fabrica, lambda *a: configurados.append(a), estado, cambiable=cambiable))
    return TestClient(app), configurados


def _estado(modo="demo", lector=None):
    return {"lector": lector, "modo": modo, "robot": "go2", "interfaz": None}


def test_get_fuentes_describe_cada_fuente(entorno):
    entorno.sdk = False
    c, _ = _cliente(Fabrica(), _estado())
    r = c.get("/fuentes").json()
    assert r["actual"] == {"modo": "demo", "robot": "go2", "interfaz": None}
    assert r["cambiable"] is True
    assert r["robots"] == ["go2", "g1"]
    assert r["interfaces"] == [] and r["interfaz_sugerida"] is None
    assert [f["modo"] for f in r["fuentes"]] == ["real", "simulador", "demo"]
    real = r["fuentes"][0]
    assert real == {"modo": "real", "nombre": "Robot real",
                    "descripcion": "Lee el robot por DDS a través del cable de red (laboratorio).",
                    "medido": True, "disponible": False, "motivo": MOTIVO_SDK}
    assert r["fuentes"][1]["disponible"] is True and r["fuentes"][1]["motivo"] == ""


def test_la_demo_de_la_catedra_solo_aparece_si_se_arranco_con_ella(entorno):
    c, _ = _cliente(Fabrica(), _estado(modo="demo-catedra"))
    lista = c.get("/fuentes").json()["fuentes"]
    catedra = [f for f in lista if f["modo"] == "demo-catedra"]
    assert catedra == [{"modo": "demo-catedra", "nombre": "Demo de la cátedra",
                        "descripcion": "El DemoReader original de la cátedra: señales senoidales.",
                        "medido": False, "disponible": True, "motivo": ""}]
    assert "oculta" not in catedra[0]


def test_sugiere_la_primera_placa_en_la_red_del_robot(entorno, monkeypatch):
    placas = [{"nombre": "wlan0", "ip": "10.0.0.2", "robot": False},
              {"nombre": "eth0", "ip": "192.168.123.7", "robot": True},
              {"nombre": "eth1", "ip": "192.168.123.8", "robot": True}]
    monkeypatch.setattr(fuentes, "interfaces_de_red", lambda: placas)
    c, _ = _cliente(Fabrica(), _estado())
    r = c.get("/fuentes").json()
    assert r["interfaces"] == placas
    assert r["interfaz_sugerida"] == "eth0"


def test_fuente_fija_rechaza_el_cambio(entorno):
    fabrica = Fabrica(Lector("nuevo"))
    c, configurados = _cliente(fabrica, _estado(), cambiable=False)
    assert c.get("/fuentes").json()["cambiable"] is False
    r = c.post("/fuente", json={"modo": "demo"})
    assert (r.status_code, r.json()["detail"]) == (403, "Este servidor tiene la fuente fija (--fuente-fija).")
    assert fabrica.pedidos == [] and configurados == []


@pytest.mark.parametrize("cuerpo, detalle", [
    ({"modo": "xyz"}, "Fuente desconocida: xyz"),
    ({"modo": "demo", "robot": "h1"}, "Robot válido: go2 o g1"),
])
def test_pedidos_invalidos_dan_400(entorno, cuerpo, detalle):
    fabrica = Fabrica(Lector("nuevo"))
    c, _ = _cliente(fabrica, _estado())
    r = c.post("/fuente", json=cuerpo)
    assert (r.status_code, r.json()["detail"]) == (400, detalle)
    assert fabrica.pedidos == []


def test_pedido_sin_modo_lo_rechaza_la_validacion(entorno):
    c, _ = _cliente(Fabrica(), _estado())
    assert c.post("/fuente", json={"robot": "go2"}).status_code == 422


def test_fuente_no_disponible_da_409_con_el_motivo(entorno):
    entorno.simulador = False
    fabrica = Fabrica(Lector("nuevo"))
    c, _ = _cliente(fabrica, _estado())
    r = c.post("/fuente", json={"modo": "simulador"})
    assert (r.status_code, r.json()["detail"]) == (409, MOTIVO_SIM)
    assert fabrica.pedidos == []


def test_error_al_crear_el_lector_se_informa_tal_cual(entorno):
    viejo = Lector("viejo")
    estado = _estado(lector=viejo)
    c, configurados = _cliente(Fabrica(error=RuntimeError("No se encontro unitree_sdk2py.")), estado)
    r = c.post("/fuente", json={"modo": "real", "robot": "g1", "interfaz": "eth0"})
    assert (r.status_code, r.json()["detail"]) == (409, "No se encontro unitree_sdk2py.")
    assert estado["lector"] is viejo and estado["modo"] == "demo"
    assert configurados == [] and viejo.cerrado == 0


def test_fuente_que_no_manda_datos_se_descarta_y_queda_la_anterior(entorno):
    viejo, nuevo = Lector("viejo"), Lector("nuevo", responde=False)
    estado = _estado(lector=viejo)
    c, configurados = _cliente(Fabrica(nuevo), estado)
    r = c.post("/fuente", json={"modo": "real", "interfaz": "eth0"})
    assert (r.status_code, r.json()["detail"]) == (504, "La fuente no envió datos en 5 s. Se mantiene la anterior.")
    assert nuevo.esperas == [5.0] and nuevo.cerrado == 1
    assert viejo.cerrado == 0 and estado["lector"] is viejo and configurados == []


def test_cambio_exitoso_reemplaza_y_cierra_el_lector_viejo(entorno, capsys):
    viejo, nuevo = Lector("viejo"), Lector("nuevo")
    estado = _estado(lector=viejo)
    fabrica = Fabrica(nuevo)
    c, configurados = _cliente(fabrica, estado)
    r = c.post("/fuente", json={"modo": "real", "robot": "g1", "interfaz": "enp3s0"})
    assert r.status_code == 200
    assert fabrica.pedidos == [("real", "g1", "enp3s0")]
    assert configurados == [(nuevo, "g1", "real")]
    assert estado == {"lector": nuevo, "modo": "real", "robot": "g1", "interfaz": "enp3s0"}
    assert viejo.cerrado == 1 and nuevo.cerrado == 0
    assert r.json()["actual"] == {"modo": "real", "robot": "g1", "interfaz": "enp3s0"}
    assert "[FUENTE] Ahora: Robot real · g1" in capsys.readouterr().out


@pytest.mark.parametrize("modo, informado", [("demo", "demo"), ("demo-catedra", "demo"), ("simulador", "simulador")])
def test_los_dos_demos_se_informan_como_demo(entorno, modo, informado):
    nuevo = Lector("nuevo")
    c, configurados = _cliente(Fabrica(nuevo), _estado())
    assert c.post("/fuente", json={"modo": modo}).status_code == 200
    assert configurados == [(nuevo, "go2", informado)]


def test_sin_lector_previo_no_cierra_nada(entorno):
    nuevo = Lector("nuevo")
    estado = _estado(lector=None)
    c, _ = _cliente(Fabrica(nuevo), estado)
    assert c.post("/fuente", json={"modo": "demo"}).status_code == 200
    assert estado["lector"] is nuevo and nuevo.cerrado == 0


def test_si_la_fabrica_devuelve_el_mismo_lector_no_se_cierra(entorno):
    mismo = Lector("mismo")
    c, _ = _cliente(Fabrica(mismo), _estado(lector=mismo))
    assert c.post("/fuente", json={"modo": "demo"}).status_code == 200
    assert mismo.cerrado == 0


def test_pedido_fuente_valores_por_defecto():
    p = PedidoFuente(modo="demo")
    assert (p.modo, p.robot, p.interfaz) == ("demo", "go2", None)


def test_catalogo_de_fuentes():
    assert list(FUENTES) == ["real", "simulador", "demo", "demo-catedra"]
    assert FUENTES["real"]["medido"] is True
    assert [m for m, f in FUENTES.items() if f.get("oculta")] == ["demo-catedra"]
    assert not any(FUENTES[m]["medido"] for m in ("simulador", "demo", "demo-catedra"))
