"""Pruebas de `api/telemetry_adapter.py` y `api/utils/imu_utils.py`: del snapshot crudo al contrato JSON."""

from __future__ import annotations

import math

import pytest

import telemetry_adapter
from telemetry_adapter import _completar, adaptar_telemetria
from utils.imu_utils import quaternion_a_euler


# ---------- _completar ----------
def test_completar_rellena_con_el_valor_por_defecto():
    assert _completar([1, 2], 4) == [1, 2, 0.0, 0.0]
    assert _completar([1], 3, default=9) == [1, 9, 9]


def test_completar_recorta_lo_que_sobra():
    assert _completar([1, 2, 3, 4, 5], 3) == [1, 2, 3]


def test_completar_acepta_none_y_tuplas():
    assert _completar(None, 2) == [0.0, 0.0]
    assert _completar((7, 8), 2) == [7, 8]
    assert _completar([], 0) == []


# ---------- quaternion_a_euler ----------
def test_cuaternion_identidad_es_cero_grados():
    assert quaternion_a_euler(1, 0, 0, 0) == (0.0, 0.0, 0.0)


def test_cuaternion_de_rotaciones_simples():
    s = math.sin(math.radians(30) / 2)
    c = math.cos(math.radians(30) / 2)
    assert quaternion_a_euler(c, s, 0, 0) == (30.0, 0.0, 0.0)
    assert quaternion_a_euler(c, 0, s, 0) == (0.0, 30.0, 0.0)
    assert quaternion_a_euler(c, 0, 0, s) == (0.0, 0.0, 30.0)
    assert quaternion_a_euler(c, -s, 0, 0) == (-30.0, 0.0, 0.0)


def test_cuaternion_combinado_redondea_a_dos_decimales():
    # 10°, 20°, 30° (convención ZYX) armado a mano
    r, p, y = (math.radians(v) / 2 for v in (10, 20, 30))
    w = math.cos(r) * math.cos(p) * math.cos(y) + math.sin(r) * math.sin(p) * math.sin(y)
    x = math.sin(r) * math.cos(p) * math.cos(y) - math.cos(r) * math.sin(p) * math.sin(y)
    yy = math.cos(r) * math.sin(p) * math.cos(y) + math.sin(r) * math.cos(p) * math.sin(y)
    z = math.cos(r) * math.cos(p) * math.sin(y) - math.sin(r) * math.sin(p) * math.cos(y)
    assert quaternion_a_euler(w, x, yy, z) == (10.0, 20.0, 30.0)


def test_cuaternion_en_el_bloqueo_de_cardan_satura_el_pitch():
    h = math.sqrt(0.5)
    assert quaternion_a_euler(h, 0, h, 0)[1] == 90.0
    assert quaternion_a_euler(h, 0, -h, 0)[1] == -90.0
    # sinp > 1 por redondeo: no explota con asin
    assert quaternion_a_euler(0.8, 0, 0.8, 0)[1] == 90.0


# ---------- adaptar_telemetria ----------
SNAP = {
    "timestamp": 1_000_105.0,
    "motor_state": [
        {"q": math.pi / 2, "dq": 1.23456, "tau_est": -3.14159, "temperature": 41.26},
        {"q": -math.pi, "dq": -0.0004, "tau_est": 0.005, "temperature": 30},
    ],
    "imu": {"quaternion": [1, 0, 0, 0], "accelerometer": [0.12345, -9.8126, 0.5]},
    "bms": {"soc": 87, "current": -1500, "temperature": 31.26, "cell_vol": [3712, 3698.6]},
    "foot_force": [10, 10.5, 0, 200],
}


@pytest.fixture
def inicio(monkeypatch):
    monkeypatch.setattr(telemetry_adapter, "_INICIO", 1_000_000.0)


def test_modelo_desconocido_falla():
    with pytest.raises(ValueError, match="Modelo desconocido: h1"):
        adaptar_telemetria(SNAP, "h1")


def test_motores_se_convierten_a_grados_y_se_redondean(inicio):
    t = adaptar_telemetria(SNAP, "go2")
    assert t["modelo"] == "go2"
    assert t["motores"][0] == {
        "id": 0, "nombre": "FR_hip", "angulo": 90.0,
        "velocidad": 1.235, "torque": -3.14, "temperatura": 41.3,
    }
    assert t["motores"][1] == {
        "id": 1, "nombre": "FR_thigh", "angulo": -180.0,
        "velocidad": -0.0, "torque": 0.01, "temperatura": 30.0,
    }


def test_motores_faltantes_se_completan_en_cero(inicio):
    t = adaptar_telemetria(SNAP, "g1")
    assert len(t["motores"]) == 29
    assert t["motores"][28] == {
        "id": 28, "nombre": "R_wrist_yaw", "angulo": 0.0,
        "velocidad": 0.0, "torque": 0.0, "temperatura": 0.0,
    }


def test_imu_y_bateria(inicio):
    t = adaptar_telemetria(SNAP, "go2")
    assert t["imu"] == {"roll": 0.0, "pitch": 0.0, "yaw": 0.0, "ax": 0.123, "ay": -9.813, "az": 0.5}
    assert t["bms"] == {"soc": 87, "corriente": -1500, "temperatura": 31.3, "celdas": [3.712, 3.699]}


def test_fuerzas_se_vuelven_contacto_por_encima_de_10_newton(inicio):
    t = adaptar_telemetria(SNAP, "go2")
    assert t["fuerzas"] == {"FR": 0, "FL": 1, "RR": 0, "RL": 1}


def test_fuerzas_del_g1_usan_sus_dos_pies(inicio):
    t = adaptar_telemetria({"foot_force": [300]}, "g1")
    assert t["fuerzas"] == {"R_foot": 1, "L_foot": 0}


def test_ts_es_relativo_al_arranque_del_backend(inicio):
    assert adaptar_telemetria(SNAP, "go2")["ts"] == 105.0
    assert adaptar_telemetria({"timestamp": 1_000_000.004}, "go2")["ts"] == 0.0
    # un reloj atrasado no da tiempos negativos
    assert adaptar_telemetria({"timestamp": 999_000.0}, "go2")["ts"] == 0.0


def test_sin_timestamp_usa_la_hora_actual(inicio, monkeypatch):
    monkeypatch.setattr(telemetry_adapter.time, "time", lambda: 1_000_042.123)
    assert adaptar_telemetria({}, "go2")["ts"] == 42.12
    assert adaptar_telemetria({"timestamp": 0}, "go2")["ts"] == 42.12


def test_snapshot_vacio_da_valores_neutros(inicio):
    t = adaptar_telemetria(None, "go2")
    assert t["imu"]["roll"] == t["imu"]["pitch"] == t["imu"]["yaw"] == 0.0
    assert (t["imu"]["ax"], t["imu"]["ay"], t["imu"]["az"]) == (0.0, 0.0, 0.0)
    assert t["bms"] == {"soc": 0, "corriente": 0, "temperatura": 0.0, "celdas": []}
    assert t["fuerzas"] == {"FR": 0, "FL": 0, "RR": 0, "RL": 0}
    assert [m["angulo"] for m in t["motores"]] == [0.0] * 12


def test_cuaternion_nulo_se_toma_como_identidad(inicio):
    """[0, 0, 0, 0] no es una rotación: se reemplaza por [1, 0, 0, 0]."""
    t = adaptar_telemetria({"imu": {"quaternion": [0, 0, 0, 0]}}, "go2")
    assert (t["imu"]["roll"], t["imu"]["pitch"], t["imu"]["yaw"]) == (0.0, 0.0, 0.0)


def test_cuaternion_se_traduce_a_euler(inicio):
    s, c = math.sin(math.radians(20) / 2), math.cos(math.radians(20) / 2)
    t = adaptar_telemetria({"imu": {"quaternion": [c, 0, 0, s]}}, "go2")
    assert t["imu"]["yaw"] == 20.0
    # cuaternión incompleto: se completa con ceros
    t = adaptar_telemetria({"imu": {"quaternion": [0, 1]}}, "go2")
    assert t["imu"]["roll"] == 180.0
