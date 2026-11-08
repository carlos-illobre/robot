"""Pruebas de `api/telemetry_reader.py`: el lector que le pregunta al simulador MuJoCo por socket."""

from __future__ import annotations

import io
import json
import sys
from types import SimpleNamespace

import pytest

import telemetry_reader
from conftest import API, EventoFalso, cargar_copia
from telemetry_reader import HOST, PUERTO, TelemetryReader, _puerto_del_simulador

BUCLE = TelemetryReader._bucle   # el original, antes de que la fixture lo apague


# ---------- puerto anotado por el simulador ----------
def _archivo(monkeypatch, contenido=None, error=None):
    abiertos = []

    def abrir(ruta, encoding=None):
        abiertos.append((ruta, encoding))
        if error:
            raise error
        return io.StringIO(contenido)

    monkeypatch.setattr(telemetry_reader, "open", abrir, raising=False)
    return abiertos


def test_puerto_sale_del_archivo_que_deja_el_simulador(monkeypatch):
    abiertos = _archivo(monkeypatch, '{"puerto": 9123}')
    assert _puerto_del_simulador() == 9123
    ruta, encoding = abiertos[0]
    assert encoding == "utf-8"
    assert ruta.name == ".simulador_activo.json"
    assert ruta.parent == API.parent / "sim"


def test_puerto_como_texto_se_convierte(monkeypatch):
    _archivo(monkeypatch, '{"puerto": "8800"}')
    assert _puerto_del_simulador() == 8800


@pytest.mark.parametrize("contenido", ["{}", '{"otro": 1}'])
def test_puerto_ausente_usa_el_de_siempre(monkeypatch, contenido):
    _archivo(monkeypatch, contenido)
    assert _puerto_del_simulador() == PUERTO == 8765


@pytest.mark.parametrize("contenido", ["no es json", '{"puerto": "abc"}', '{"puerto": null}', ""])
def test_archivo_ilegible_usa_el_puerto_de_siempre(monkeypatch, contenido):
    _archivo(monkeypatch, contenido)
    assert _puerto_del_simulador() == 8765


@pytest.mark.parametrize("contenido", ["[9000]", '"9000"', "9000", "null"])
def test_fr013_json_que_no_es_objeto_se_ignora(monkeypatch, contenido):
    _archivo(monkeypatch, contenido)
    assert _puerto_del_simulador() == 8765


def test_sin_archivo_usa_el_puerto_de_siempre(monkeypatch):
    _archivo(monkeypatch, error=FileNotFoundError("no hay simulador"))
    assert _puerto_del_simulador() == 8765


# ---------- construcción ----------
@pytest.fixture
def lector(monkeypatch):
    """Lector cuyo hilo no hace nada: el bucle se prueba aparte."""
    monkeypatch.setattr(TelemetryReader, "_bucle", lambda self: None)

    def crear(modelo="go2"):
        r = TelemetryReader(modelo, network_interface="lo")
        r._hilo.join(1)
        return r

    return crear


def test_modelo_desconocido_falla():
    with pytest.raises(ValueError, match="Modelo desconocido: h1"):
        TelemetryReader("h1")


def test_arranca_un_hilo_demonio_sin_datos(lector):
    r = lector("g1")
    assert r.modelo == "g1" and r.config["n_motores"] == 29
    assert r._hilo.daemon is True
    assert r.obtener_snapshot() is None
    assert r.mensajes_leidos == 0
    assert r._cortar.is_set() is False
    r.cerrar()
    assert r._cortar.is_set() is True


def test_la_interfaz_de_red_es_opcional(monkeypatch):
    monkeypatch.setattr(TelemetryReader, "_bucle", lambda self: None)
    assert TelemetryReader("go2").modelo == "go2"


# ---------- bucle con reintentos ----------
def test_bucle_reintenta_cada_segundo_y_avisa_una_sola_vez(lector, capsys):
    r = lector()
    sesiones = []

    def sesion():
        sesiones.append(1)
        raise ConnectionRefusedError("rechazada")

    r._sesion = sesion
    r._cortar = EventoFalso(is_set=[False, False, False, True], wait=[False] * 3)
    BUCLE(r)
    assert len(sesiones) == 3
    assert r._cortar.esperas == [1.0, 1.0, 1.0]
    salida = capsys.readouterr().out
    assert salida.count("[TELEMETRIA]") == 1
    assert "Sin conexion con el simulador (ConnectionRefusedError: rechazada). Reintentando..." in salida


def test_bucle_vuelve_a_avisar_despues_de_reconectar(lector, capsys):
    r = lector()
    resultados = [OSError("1"), None, OSError("2")]

    def sesion():
        res = resultados.pop(0)
        if res is None:
            r._aviso_dado = False      # lo que hace _sesion al conectar
            return
        raise res

    r._sesion = sesion
    r._cortar = EventoFalso(is_set=[False, False, False, True], wait=[False] * 3)
    BUCLE(r)
    assert capsys.readouterr().out.count("Sin conexion") == 2


def test_bucle_cortado_no_intenta_conectar(lector):
    r = lector()
    r._sesion = lambda: pytest.fail("no debía conectarse")
    r._cortar = EventoFalso(is_set=[True])
    BUCLE(r)
    assert r._cortar.esperas == []


# ---------- sesión por socket ----------
class CanalFalso:
    def __init__(self, lineas):
        self.lineas = list(lineas)
        self.escrito = []
        self.flushes = 0

    def write(self, datos):
        self.escrito.append(datos)

    def flush(self):
        self.flushes += 1

    def readline(self):
        return self.lineas.pop(0)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class SocketFalso:
    def __init__(self, canal):
        self.canal = canal
        self.timeouts = []
        self.modos = []

    def settimeout(self, t):
        self.timeouts.append(t)

    def makefile(self, modo):
        self.modos.append(modo)
        return self.canal

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _conexion(monkeypatch, lineas, puerto=9001):
    canal = CanalFalso(lineas)
    sock = SocketFalso(canal)
    pedidos = []

    def conectar(direccion, timeout):
        pedidos.append((direccion, timeout))
        return sock

    monkeypatch.setattr(telemetry_reader, "socket", SimpleNamespace(create_connection=conectar))
    monkeypatch.setattr(telemetry_reader, "_puerto_del_simulador", lambda: puerto)
    return canal, sock, pedidos


def _linea(datos):
    return (json.dumps(datos) + "\n").encode("utf-8")


TELE = {
    "motor_state": [{"q": float(i)} for i in range(14)],
    "imu": {"quaternion": [1, 0, 0, 0]},
    "bms": {"soc": 50},
    "foot_force": [1, 2, 3, 4],
}


def test_sesion_pide_telemetria_y_guarda_cada_respuesta(lector, monkeypatch, reloj):
    r = lector()
    monkeypatch.setattr(telemetry_reader, "time", reloj)
    r._aviso_dado = True
    canal, sock, pedidos = _conexion(monkeypatch, [
        _linea({"telemetria": TELE}),
        _linea({"telemetria": {}}),          # respuesta vacía: no pisa el dato
        _linea({"telemetria": None}),
        _linea({"otra": 1}),
        b"",                                  # el simulador cerró
    ])
    r._cortar = EventoFalso(is_set=[False] * 10)
    r._sesion()
    assert pedidos == [((HOST, 9001), 3.0)]
    assert HOST == "127.0.0.1"
    assert sock.timeouts == [3.0] and sock.modos == ["rwb"]
    assert canal.escrito == [b'{"orden": "telemetria"}\n'] * 5
    assert canal.flushes == 5
    assert reloj.siestas == [0.05] * 4
    assert r._aviso_dado is False
    assert r.mensajes_leidos == 1
    snap = r.obtener_snapshot()
    assert [m["q"] for m in snap["motor_state"]] == [float(i) for i in range(12)]
    assert snap["imu"] == {"quaternion": [1, 0, 0, 0]}
    assert snap["bms"] == {"soc": 50}
    assert snap["foot_force"] == [1, 2, 3, 4]
    assert snap["timestamp"] == 1000.0


def test_sesion_termina_cuando_se_cierra_el_lector(lector, monkeypatch, reloj):
    r = lector()
    monkeypatch.setattr(telemetry_reader, "time", reloj)
    canal, _, _ = _conexion(monkeypatch, [_linea({"telemetria": TELE})] * 3)
    r._cortar = EventoFalso(is_set=[False, True])
    r._sesion()
    assert len(canal.escrito) == 1
    assert r.mensajes_leidos == 1


def test_sesion_con_respuesta_rota_propaga_el_error(lector, monkeypatch):
    r = lector()
    _conexion(monkeypatch, [b"{roto\n"])
    r._cortar = EventoFalso(is_set=[False])
    with pytest.raises(json.JSONDecodeError):
        r._sesion()


# ---------- guardado y lectura ----------
def test_guardar_completa_lo_que_falta(lector, monkeypatch, reloj):
    r = lector("g1")
    monkeypatch.setattr(telemetry_reader, "time", reloj)
    r._guardar({"motor_state": [{"q": 1}] * 40})
    snap = r.obtener_snapshot()
    assert len(snap["motor_state"]) == 29
    assert snap["imu"] == {} and snap["bms"] == {} and snap["foot_force"] == []
    r._guardar({})
    assert r.obtener_snapshot()["motor_state"] == []
    assert r.mensajes_leidos == 2


def test_obtener_snapshot_devuelve_una_copia(lector):
    r = lector()
    r._guardar({"imu": {"quaternion": [1, 0, 0, 0]}})
    copia = r.obtener_snapshot()
    copia["imu"]["quaternion"][0] = 99
    assert r.obtener_snapshot()["imu"]["quaternion"][0] == 1


def test_esperar_primer_dato_con_dato_responde_enseguida(lector, monkeypatch, reloj):
    r = lector()
    monkeypatch.setattr(telemetry_reader, "time", reloj)
    r._guardar({})
    assert r.esperar_primer_dato(timeout=5.0) is True
    assert reloj.siestas == []


def test_esperar_primer_dato_sin_dato_vence_a_tiempo(lector, monkeypatch, reloj):
    r = lector()
    monkeypatch.setattr(telemetry_reader, "time", reloj)
    assert r.esperar_primer_dato(timeout=0.35) is False
    assert reloj.siestas == [0.1] * 4


def test_esperar_primer_dato_por_defecto_espera_cinco_segundos(lector, monkeypatch, reloj):
    r = lector()
    monkeypatch.setattr(telemetry_reader, "time", reloj)
    assert r.esperar_primer_dato() is False
    assert 49 <= len(reloj.siestas) <= 51


def test_esperar_primer_dato_que_llega_a_mitad_de_camino(lector, monkeypatch, reloj):
    r = lector()

    def dormir(segundos):
        reloj.ahora += segundos
        if len(reloj.siestas) == 2:
            r._guardar({})
        reloj.siestas.append(segundos)

    monkeypatch.setattr(telemetry_reader, "time",
                        SimpleNamespace(time=reloj.time, monotonic=reloj.monotonic, sleep=dormir))
    assert r.esperar_primer_dato(timeout=5.0) is True
    assert reloj.siestas == [0.1] * 3


def test_esperar_primer_dato_con_timeout_cero_no_espera(lector, monkeypatch, reloj):
    r = lector()
    monkeypatch.setattr(telemetry_reader, "time", reloj)
    r._guardar({})
    assert r.esperar_primer_dato(timeout=0) is False


# ---------- DemoReader reexportado ----------
def test_reexporta_el_demo_reader_del_laboratorio():
    import telemetry_reader_dds

    assert telemetry_reader.DemoReader is telemetry_reader_dds.DemoReader


def test_sin_lector_del_laboratorio_el_demo_queda_en_none(monkeypatch):
    monkeypatch.setitem(sys.modules, "telemetry_reader_dds", None)
    copia = cargar_copia(API / "telemetry_reader.py", "telemetry_reader_sin_dds")
    assert copia.DemoReader is None
    assert copia.PUERTO == 8765
