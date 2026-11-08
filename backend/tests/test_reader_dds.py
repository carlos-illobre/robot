"""Pruebas de `api/telemetry_reader_dds.py`: lector del robot real por DDS y DemoReader.

El SDK de Unitree (`unitree_sdk2py`) se reemplaza por módulos falsos en
`sys.modules`: se verifica qué canales abre y con qué tipos, y se le pasan
mensajes armados a mano a los handlers.
"""

from __future__ import annotations

import math
import sys
import types
from types import SimpleNamespace

import pytest

import telemetry_reader_dds as dds
from telemetry_reader_dds import DemoReader, TelemetryReader, _lista, _temperatura, _valor


# ---------- SDK falso ----------
class SDKFalso:
    def __init__(self):
        self.inicializaciones = []
        self.suscriptores = []
        sdk = self

        class ChannelSubscriber:
            def __init__(self, topico, tipo):
                self.topico, self.tipo = topico, tipo
                self.inits = []
                self.cerrado = 0
                sdk.suscriptores.append(self)

            def Init(self, handler, profundidad):
                self.inits.append((handler, profundidad))

            def Close(self):
                self.cerrado += 1

        def ChannelFactoryInitialize(dominio, interfaz):
            sdk.inicializaciones.append((dominio, interfaz))

        self.ChannelSubscriber = ChannelSubscriber
        self.modulos = {}
        self._modulo("unitree_sdk2py")
        self._modulo("unitree_sdk2py.core")
        self._modulo("unitree_sdk2py.core.channel",
                     ChannelFactoryInitialize=ChannelFactoryInitialize,
                     ChannelSubscriber=ChannelSubscriber)
        for familia in ("unitree_go", "unitree_hg"):
            self._modulo(f"unitree_sdk2py.idl.{familia}")
            self._modulo(f"unitree_sdk2py.idl.{familia}.msg")
            self._modulo(f"unitree_sdk2py.idl.{familia}.msg.dds_",
                         LowState_=type(f"LowState_{familia}", (), {}),
                         BmsState_=type(f"BmsState_{familia}", (), {}))
        self._modulo("unitree_sdk2py.idl")

    def _modulo(self, nombre, **atributos):
        m = types.ModuleType(nombre)
        m.__dict__.update(atributos)
        self.modulos[nombre] = m

    def tipo(self, familia, nombre):
        return getattr(self.modulos[f"unitree_sdk2py.idl.{familia}.msg.dds_"], nombre)


@pytest.fixture
def sdk(monkeypatch):
    falso = SDKFalso()
    for nombre, modulo in falso.modulos.items():
        monkeypatch.setitem(sys.modules, nombre, modulo)
    return falso


# ---------- helpers del IDL ----------
class Campos:
    def __init__(self, **kw):
        self.__dict__.update(kw)


def test_valor_lee_atributos_y_metodos():
    msg = Campos(soc=80, current=lambda: -300)
    assert _valor(msg, "soc") == 80
    assert _valor(msg, "current") == -300


def test_valor_faltante_o_que_falla_devuelve_el_defecto():
    def roto():
        raise TypeError("firma vieja")

    msg = Campos(roto=roto)
    assert _valor(msg, "nada") is None
    assert _valor(msg, "nada", 7) == 7
    assert _valor(msg, "roto", "x") == "x"
    assert _valor(None, "soc", 0) == 0


def test_lista_de_escalares_iterables_y_basura():
    assert _lista(5) == [5]
    assert _lista(2.5) == [2.5]
    assert _lista((1, 2)) == [1, 2]
    assert _lista(x for x in "ab") == ["a", "b"]
    assert _lista(None) == []
    assert _lista(None, (9, 8)) == [9, 8]
    assert _lista(object(), [1]) == [1]


def test_lista_de_un_iterable_que_falla_con_valueerror():
    def falla():
        yield 1
        raise ValueError("corrupto")

    assert _lista(falla(), [0]) == [0]


@pytest.mark.parametrize("valor, esperado", [
    (41, 41), (41.9, 41), ("38", 38), (None, 0), (0, 0),
    ([30, 45], 45), ((50, 20), 50), ([40.7], 40), ([], 0), (["a", None], 0),
    ([33, "x", 36.2], 36), ("abc", 0), (object(), 0),
])
def test_temperatura_escalar_go2_o_lista_g1(valor, esperado):
    assert _temperatura(valor) == esperado


# ---------- construcción ----------
def test_modelo_desconocido_falla():
    with pytest.raises(ValueError, match="Modelo desconocido: h1"):
        TelemetryReader("h1")


def test_go2_se_suscribe_al_lowstate_y_a_la_bateria(sdk):
    r = TelemetryReader("go2", network_interface="eth0")
    assert sdk.inicializaciones == [(0, "eth0")]
    low, bms = sdk.suscriptores
    assert (low.topico, low.tipo) == ("rt/lf/lowstate", sdk.tipo("unitree_go", "LowState_"))
    assert low.inits == [(r._on_low_state, 10)]
    assert (bms.topico, bms.tipo) == ("rt/lf/bmsstate", sdk.tipo("unitree_go", "BmsState_"))
    assert bms.inits == [(r._on_bms, 5)]
    assert r._subscriber is low and r._sub_bms is bms
    assert r.obtener_snapshot() is None and r.mensajes_leidos == 0


def test_g1_usa_los_mensajes_unitree_hg(sdk):
    TelemetryReader("g1")
    assert sdk.inicializaciones == [(0, None)]
    low, bms = sdk.suscriptores
    assert low.tipo is sdk.tipo("unitree_hg", "LowState_")
    assert bms.tipo is sdk.tipo("unitree_hg", "BmsState_")


def test_topico_de_bateria_configurable(sdk, monkeypatch):
    monkeypatch.setitem(dds.ROBOTS["go2"], "topic_bmsstate", "rt/bms_propio")
    TelemetryReader("go2")
    assert sdk.suscriptores[1].topico == "rt/bms_propio"


def test_sin_sdk_avisa_que_instalar(monkeypatch):
    monkeypatch.setitem(sys.modules, "unitree_sdk2py", None)
    with pytest.raises(RuntimeError, match="No se encontro unitree_sdk2py. Instale requirements.txt o use --demo.") as e:
        TelemetryReader("go2")
    assert isinstance(e.value.__cause__, ImportError)


def test_sdk_sin_mensajes_del_g1_tambien_avisa(sdk, monkeypatch):
    monkeypatch.setitem(sys.modules, "unitree_sdk2py.idl.unitree_hg.msg.dds_", None)
    with pytest.raises(RuntimeError, match="unitree_sdk2py"):
        TelemetryReader("g1")
    assert sdk.inicializaciones == []


def test_sin_bateria_el_resto_funciona(sdk, monkeypatch, capsys):
    del sdk.modulos["unitree_sdk2py.idl.unitree_go.msg.dds_"].BmsState_
    r = TelemetryReader("go2")
    assert len(sdk.suscriptores) == 1
    assert r._sub_bms is None and r._subscriber is sdk.suscriptores[0]
    salida = capsys.readouterr().out
    assert salida.startswith("[TELEMETRIA] Sin lectura de bateria (")
    assert "BmsState_" in salida
    assert salida.rstrip().endswith("El resto de la telemetria funciona igual.")


# ---------- bateria (rt/lf/bmsstate) ----------
def test_on_bms_toma_la_temperatura_maxima_y_filtra_basura(sdk):
    r = TelemetryReader("g1")
    r._on_bms(Campos(soc=81, current=lambda: -1200, temperature=[22, 31, "x"],
                     cell_vol=[3700, None, 3710.5]))
    assert r._bms == {"soc": 81, "current": -1200, "cell_vol": [3700, 3710.5], "temperature": 31}


def test_on_bms_vacio(sdk):
    r = TelemetryReader("g1")
    r._on_bms(Campos(soc=None))
    assert r._bms == {"soc": 0, "current": 0, "cell_vol": [], "temperature": 0}


def test_on_bms_ilegible_no_pisa_el_dato_anterior(sdk):
    r = TelemetryReader("g1")
    r._bms = {"soc": 50}
    r._on_bms(Campos(soc="abc"))
    assert r._bms == {"soc": 50}


# ---------- LowState ----------
def _motor(q=0.1, dq=0.2, tau=0.3, temp=40):
    return Campos(q=q, dq=dq, tau_est=tau, temperature=temp)


def test_low_state_completo_del_go2(sdk, monkeypatch):
    monkeypatch.setattr(dds.time, "time", lambda: 1234.5)
    r = TelemetryReader("go2")
    msg = Campos(
        motor_state=[_motor(q=float(i), temp=30 + i) for i in range(20)],
        imu_state=Campos(quaternion=(1, 0, 0, 0), accelerometer=[0.1, 0.2, 9.8], gyroscope=lambda: [0, 0, 0.5]),
        bms_state=Campos(soc=90, current=1500, cell_vol=[3800, 3810], temperature=[25, 27]),
        foot_force=[10, 20, 30, 40],
    )
    r._on_low_state(msg)
    snap = r.obtener_snapshot()
    assert snap["timestamp"] == 1234.5
    assert len(snap["motor_state"]) == 12
    assert snap["motor_state"][11] == {"id": 11, "q": 11.0, "dq": 0.2, "tau_est": 0.3, "temperature": 41}
    assert snap["imu"] == {"quaternion": [1, 0, 0, 0], "accelerometer": [0.1, 0.2, 9.8], "gyroscope": [0, 0, 0.5]}
    assert snap["bms"] == {"soc": 90, "current": 1500, "cell_vol": [3800, 3810], "temperature": 27}
    assert snap["foot_force"] == [10, 20, 30, 40]
    assert r.mensajes_leidos == 1


def test_low_state_con_campos_vacios_usa_valores_neutros(sdk):
    r = TelemetryReader("go2")
    r._on_low_state(Campos(motor_state=[Campos(q=None, dq=None, tau_est=None, temperature=None)]))
    snap = r.obtener_snapshot()
    assert snap["motor_state"] == [{"id": 0, "q": 0.0, "dq": 0.0, "tau_est": 0.0, "temperature": 0}]
    assert snap["imu"] == {"quaternion": [1, 0, 0, 0], "accelerometer": [0, 0, 0], "gyroscope": [0, 0, 0]}
    assert snap["bms"] == {"soc": 0, "current": 0, "cell_vol": [], "temperature": 0}
    assert snap["foot_force"] == []


def test_low_state_bateria_con_el_campo_temp(sdk):
    r = TelemetryReader("go2")
    r._on_low_state(Campos(bms_state=Campos(soc=10, temperature=[], temp=[33, 35])))
    assert r.obtener_snapshot()["bms"]["temperature"] == 35


def test_low_state_bateria_sin_temperaturas(sdk):
    r = TelemetryReader("go2")
    r._on_low_state(Campos(bms_state=Campos(soc=10)))
    assert r.obtener_snapshot()["bms"] == {"soc": 10, "current": 0, "cell_vol": [], "temperature": 0}


def test_low_state_prefiere_la_bateria_del_topico_propio(sdk):
    r = TelemetryReader("g1")
    r._on_bms(Campos(soc=66, current=1, cell_vol=[3700], temperature=[30]))
    r._on_low_state(Campos(bms_state=Campos(soc=10)))
    assert r.obtener_snapshot()["bms"] == {"soc": 66, "current": 1, "cell_vol": [3700], "temperature": 30}


def test_temperatura_del_g1_como_lista_no_mata_el_hilo(sdk):
    """Regresión: el G1 reporta dos sensores por motor; int(lista) mataba el hilo DDS."""
    r = TelemetryReader("g1")
    r._on_low_state(Campos(motor_state=[_motor(temp=[41, 47])] * 29))
    assert [m["temperature"] for m in r.obtener_snapshot()["motor_state"]] == [47] * 29


def test_mensaje_ilegible_se_descarta_y_avisa_una_vez(sdk, capsys):
    r = TelemetryReader("go2")
    roto = Campos(motor_state=[Campos(q="no es un número")])
    r._on_low_state(roto)
    r._on_low_state(roto)
    salida = capsys.readouterr().out
    assert salida.count("[TELEMETRIA]") == 1
    assert "No pude leer un mensaje del robot (ValueError: " in salida
    assert "Se descarta y se sigue escuchando." in salida
    assert r.obtener_snapshot() is None and r.mensajes_leidos == 0
    r._on_low_state(Campos())
    assert r.mensajes_leidos == 1


def test_obtener_snapshot_es_una_copia(sdk):
    r = TelemetryReader("go2")
    r._on_low_state(Campos(foot_force=[1, 2]))
    r.obtener_snapshot()["foot_force"].append(3)
    assert r.obtener_snapshot()["foot_force"] == [1, 2]


# ---------- espera y cierre ----------
def test_esperar_primer_dato(sdk, monkeypatch, reloj):
    monkeypatch.setattr(dds, "time", reloj)
    r = TelemetryReader("go2")
    assert r.esperar_primer_dato(timeout=0.22) is False
    assert reloj.siestas == [0.05] * 5
    r._on_low_state(Campos())
    reloj.siestas.clear()
    assert r.esperar_primer_dato(timeout=0.2) is True
    assert reloj.siestas == []


def test_fr017_timeout_cero_con_dato_responde_true(sdk, monkeypatch, reloj):
    monkeypatch.setattr(dds, "time", reloj)
    r = TelemetryReader("go2")
    assert r.esperar_primer_dato(timeout=0) is False
    r._on_low_state(Campos())
    assert r.esperar_primer_dato(timeout=0) is True
    assert reloj.siestas == []


def test_esperar_primer_dato_por_defecto_son_cinco_segundos(sdk, monkeypatch, reloj):
    monkeypatch.setattr(dds, "time", reloj)
    r = TelemetryReader("go2")
    assert r.esperar_primer_dato() is False
    assert 99 <= len(reloj.siestas) <= 101


def test_esperar_primer_dato_que_llega_mientras_espera(sdk, monkeypatch, reloj):
    r = TelemetryReader("go2")

    def dormir(s):
        reloj.siestas.append(s)
        reloj.ahora += s
        r._on_low_state(Campos())

    monkeypatch.setattr(dds, "time", SimpleNamespace(time=reloj.time, monotonic=reloj.monotonic, sleep=dormir))
    assert r.esperar_primer_dato(timeout=1.0) is True
    assert reloj.siestas == [0.05]


def test_cerrar_usa_close_y_es_idempotente(sdk):
    r = TelemetryReader("go2")
    low = sdk.suscriptores[0]
    r.cerrar()
    r.cerrar()
    assert low.cerrado == 1
    assert r._subscriber is None


def test_fr015_cerrar_tambien_cierra_el_suscriptor_de_la_bateria(sdk):
    r = TelemetryReader("go2")
    low, bms = sdk.suscriptores
    r.cerrar()
    r.cerrar()
    assert (low.cerrado, bms.cerrado) == (1, 1)
    assert r._subscriber is None and r._sub_bms is None


def test_fr015_cerrar_sin_suscriptor_de_bateria(sdk):
    r = TelemetryReader("go2")
    low = sdk.suscriptores[0]
    r._sub_bms = None   # como queda si el tópico de la batería no se pudo abrir
    r.cerrar()
    assert low.cerrado == 1


def test_cerrar_con_un_sdk_que_usa_close_en_minuscula():
    llamadas = []
    r = object.__new__(TelemetryReader)
    r._sub_bms = None
    r._subscriber = SimpleNamespace(Close="no es invocable", close=lambda: llamadas.append("close"))
    r.cerrar()
    assert llamadas == ["close"]


def test_cerrar_un_suscriptor_sin_metodo_de_cierre():
    r = object.__new__(TelemetryReader)
    r._sub_bms = None
    r._subscriber = SimpleNamespace()
    r.cerrar()
    assert r._subscriber is None


def test_cerrar_prefiere_Close_y_no_llama_a_los_dos():
    llamadas = []
    r = object.__new__(TelemetryReader)
    r._sub_bms = None
    r._subscriber = SimpleNamespace(Close=lambda: llamadas.append("Close"), close=lambda: llamadas.append("close"))
    r.cerrar()
    assert llamadas == ["Close"]


# ---------- DemoReader ----------
def test_demo_modelo_desconocido_falla():
    with pytest.raises(ValueError, match="Modelo desconocido: h1"):
        DemoReader("h1")


def test_demo_por_defecto_es_go2():
    assert DemoReader().modelo == "go2"


def test_demo_en_el_instante_cero(monkeypatch):
    monkeypatch.setattr(dds.time, "time", lambda: 500.0)
    d = DemoReader("go2")
    s = d.obtener_snapshot()
    assert s["timestamp"] == 500.0
    assert len(s["motor_state"]) == 12
    assert s["motor_state"][0] == {"id": 0, "q": 0.0, "dq": 2.2, "tau_est": 5.0, "temperature": 38}
    m1 = s["motor_state"][1]
    assert m1["q"] == pytest.approx(math.radians(28 * math.sin(0.45)))
    assert m1["dq"] == pytest.approx(2.2 * math.cos(0.45))
    assert m1["tau_est"] == pytest.approx(5 + 4 * math.sin(0.45))
    assert m1["temperature"] == 34 + int(9 * (1 + math.sin(0.45)) / 2)
    assert s["imu"] == {"quaternion": [1.0, 0.0, 0.0, 0.0], "accelerometer": [0.0, 0.1, 9.81],
                        "gyroscope": [0.02, 0.01, 0.0]}
    assert s["bms"]["soc"] == 92 and s["bms"]["current"] == 1100 and s["bms"]["temperature"] == 31.0
    assert s["bms"]["cell_vol"] == [int(3710 + 15 * math.sin(i)) for i in range(8)]
    assert s["foot_force"] == [80, 80, 80, 0]


def test_demo_avanza_con_el_tiempo(monkeypatch):
    ahora = [0.0]
    monkeypatch.setattr(dds.time, "time", lambda: ahora[0])
    d = DemoReader("g1")
    ahora[0] = 360.0
    s = d.obtener_snapshot()
    assert len(s["motor_state"]) == 29 and len(s["foot_force"]) == 2
    assert s["bms"]["soc"] == 90
    t = 360.0
    angulo = 0.04 * math.sin(t * 0.5)
    assert s["imu"]["quaternion"] == [math.cos(angulo / 2), 0.0, math.sin(angulo / 2), 0.0]
    assert s["imu"]["accelerometer"] == [0.15 * math.sin(t), 0.1 * math.cos(t), 9.81]
    assert s["bms"]["current"] == int(1100 + 350 * math.sin(t * 0.3))
    assert s["bms"]["temperature"] == round(31 + 2 * math.sin(t * 0.05), 1)


def test_demo_bateria_no_baja_de_cero(monkeypatch):
    ahora = [0.0]
    monkeypatch.setattr(dds.time, "time", lambda: ahora[0])
    d = DemoReader("go2")
    ahora[0] = 180.0 * 92
    assert d.obtener_snapshot()["bms"]["soc"] == 0
    ahora[0] = 180.0 * 200
    assert d.obtener_snapshot()["bms"]["soc"] == 0


def test_demo_cuenta_mensajes_y_siempre_tiene_datos():
    d = DemoReader("go2")
    assert d.mensajes_leidos == 0
    d.obtener_snapshot()
    d.obtener_snapshot()
    assert d.mensajes_leidos == 2
    assert d.esperar_primer_dato() is True
    assert d.esperar_primer_dato(timeout=0) is True
    assert d.cerrar() is None
