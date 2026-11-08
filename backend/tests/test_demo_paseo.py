"""Pruebas de `api/demo_paseo.py`: el paseo simulado (guion, marcha, modelo térmico, batería).

El azar se reemplaza por un `random` falso y el hilo de 50 Hz se apaga: cada
paso de la simulación se da a mano y los valores se pueden calcular.
"""

from __future__ import annotations

import math

import pytest

import demo_paseo
from conftest import EventoFalso
from demo_paseo import (FRECUENCIA_SIM, GUION, K_CALOR, T_AMBIENTE, PaseoDemoReader, _euler_a_cuaternion,
                        _Motor, _suavizar)
from utils.imu_utils import quaternion_a_euler

BUCLE = PaseoDemoReader._bucle   # el original, antes de que la fixture lo apague


class AzarFalso:
    """uniform() devuelve el punto medio (o un valor fijo); gauss() devuelve mu + k·sigma."""

    def __init__(self):
        self.semillas = []
        self.uniforme = None
        self.k = 0.0

    def seed(self, s):
        self.semillas.append(s)

    def uniform(self, a, b):
        return (a + b) / 2 if self.uniforme is None else self.uniforme

    def gauss(self, mu, sigma):
        return mu + self.k * sigma


@pytest.fixture
def azar(monkeypatch):
    falso = AzarFalso()
    monkeypatch.setattr(demo_paseo, "random", falso)
    return falso


@pytest.fixture
def paseo(monkeypatch, azar):
    monkeypatch.setattr(PaseoDemoReader, "_bucle", lambda self: None)
    monkeypatch.setattr(demo_paseo.time, "time", lambda: 777.0)

    def crear(modelo="go2", **kw):
        r = PaseoDemoReader(modelo, **kw)
        r._hilo.join(1)
        return r

    return crear


def aprox(valores):
    return pytest.approx(valores, abs=1e-9)


# ---------- funciones sueltas ----------
def test_constantes_del_modelo():
    assert (T_AMBIENTE, K_CALOR, FRECUENCIA_SIM) == (30.0, 1.75, 50.0)
    assert sum(d for d, *_ in GUION) == 63.0
    assert [e for *_, e in GUION] == ["quieto", "camina", "curva izquierda", "trota", "gira derecha",
                                      "quieto", "camina rapido", "quieto"]


def test_suavizar_es_un_filtro_de_primer_orden():
    assert _suavizar(0.0, 10.0, 0.8, 0.8) == pytest.approx(10 * (1 - math.exp(-1)))
    assert _suavizar(2.0, 4.0, 0.5, 1.0) == pytest.approx(2 + 2 * (1 - math.exp(-0.5)))
    assert _suavizar(5.0, 5.0, 1.0, 1.0) == 5.0
    assert _suavizar(3.0, 9.0, 0.0, 1.0) == 3.0


def test_euler_a_cuaternion():
    assert _euler_a_cuaternion(0, 0, 0) == [1.0, 0.0, 0.0, 0.0]
    assert _euler_a_cuaternion(math.pi, 0, 0) == aprox([0, 1, 0, 0])
    assert _euler_a_cuaternion(0, math.pi, 0) == aprox([0, 0, 1, 0])
    assert _euler_a_cuaternion(0, 0, math.pi) == aprox([0, 0, 0, 1])


def test_euler_a_cuaternion_es_la_inversa_de_imu_utils():
    q = _euler_a_cuaternion(*(math.radians(v) for v in (10, -20, 30)))
    assert quaternion_a_euler(*q) == (10.0, -20.0, 30.0)
    assert sum(v * v for v in q) == pytest.approx(1.0)


def test_motor_arranca_algo_por_encima_del_ambiente(azar):
    m = _Motor(k_calor=2.0, tau_nominal=5.0, tau_termica=10.0)
    assert (m.k_calor, m.tau_nominal, m.tau_termica) == (2.0, 5.0, 10.0)
    assert m.temperatura == 32.5            # 30 + uniform(1, 4)


def test_motor_calienta_con_el_cuadrado_del_torque_y_enfria_hacia_el_ambiente(azar):
    m = _Motor(k_calor=2.0, tau_nominal=5.0, tau_termica=10.0)
    m.integrar(torque=10.0, dt=0.5)         # calor 2·2² = 8; enfriamiento 2.5/10
    assert m.temperatura == pytest.approx(32.5 + (8 - 0.25) * 0.5)
    m.temperatura = 40.0
    m.integrar(torque=-10.0, dt=0.5)        # el signo del torque no importa
    assert m.temperatura == pytest.approx(40 + (8 - 1.0) * 0.5)
    m.temperatura = 40.0
    m.integrar(torque=0.0, dt=1.0)
    assert m.temperatura == pytest.approx(39.0)


# ---------- construcción ----------
def test_modelo_desconocido_falla():
    with pytest.raises(ValueError, match="Modelo desconocido: h1"):
        PaseoDemoReader("h1")


def test_construccion_siembra_el_azar_y_deja_un_dato_listo(paseo, azar):
    r = paseo()
    assert azar.semillas == [7]
    assert r.modelo == "go2" and r.acelerar == 1.0
    assert r._hilo.daemon is True
    assert r.mensajes_leidos == 1
    assert r._t == pytest.approx(0.02)
    assert r._yaw == 0.0                   # radians(uniform(-30, 30))
    assert r._celdas_offset == [0.0] * 5 + [-14.0] + [0.0] * 2
    snap = r.obtener_snapshot()
    assert snap["timestamp"] == 777.0
    assert [m["dq"] for m in snap["motor_state"]] == [0.0] * 12
    assert [m["id"] for m in snap["motor_state"]] == list(range(12))


def test_semilla_y_aceleracion_configurables(paseo, azar):
    r = paseo("g1", semilla=3, acelerar=10.0)
    assert azar.semillas == [3]
    assert r.acelerar == 10.0
    assert r._t == pytest.approx(0.2)
    assert len(r.obtener_snapshot()["motor_state"]) == 29


def test_misma_semilla_mismo_paseo(monkeypatch):
    monkeypatch.setattr(PaseoDemoReader, "_bucle", lambda self: None)
    def recorrer():
        r = PaseoDemoReader("go2", semilla=11)
        for _ in range(20):
            r._paso()
        return r.obtener_snapshot()

    sa, sb = recorrer(), recorrer()
    assert sa["motor_state"] == sb["motor_state"] and sa["bms"] == sb["bms"]


def test_torque_nominal_y_calor_por_articulacion_del_go2(paseo):
    r = paseo("go2")
    k = K_CALOR * 1.025                    # dispersion: uniform(0.85, 1.20)
    hip, thigh, calf = r._motores[:3]
    assert (hip.tau_nominal, thigh.tau_nominal, calf.tau_nominal) == (9.0, 20.0, 22.0)
    assert hip.k_calor == pytest.approx(k) and thigh.k_calor == pytest.approx(k)
    assert calf.k_calor == pytest.approx(k * 1.25)
    assert hip.tau_termica == 42.5         # uniform(35, 50)


def test_torque_nominal_y_calor_por_articulacion_del_g1(paseo):
    r = paseo("g1")
    nombres = r.config["motores_nombres"]
    nominal = {n: m.tau_nominal for n, m in zip(nombres, r._motores)}
    assert nominal["L_knee"] == 36.0 and nominal["R_knee"] == 36.0
    assert nominal["L_hip_pitch"] == 26.0
    assert nominal["L_ankle_pitch"] == 20.0 and nominal["R_ankle_roll"] == 20.0
    assert nominal["L_hip_roll"] == nominal["torso_yaw"] == nominal["L_elbow"] == 9.0
    k = {n: m.k_calor for n, m in zip(nombres, r._motores)}
    assert k["L_knee"] == pytest.approx(K_CALOR * 1.025 * 1.25)
    assert k["L_hip_pitch"] == pytest.approx(K_CALOR * 1.025)


# ---------- guion ----------
@pytest.mark.parametrize("t, esperado", [
    (0.0, (0.0, 0.0, "quieto")),
    (5.99, (0.0, 0.0, "quieto")),
    (6.0, (0.55, 0.0, "camina")),
    (16.0, (0.55, 18.0, "curva izquierda")),
    (21.0, (1.0, 0.0, "trota")),
    (33.0, (0.30, -30.0, "gira derecha")),
    (37.0, (0.0, 0.0, "quieto")),
    (44.0, (0.85, 6.0, "camina rapido")),
    (58.0, (0.0, 0.0, "quieto")),
    (62.99, (0.0, 0.0, "quieto")),
    (63.0 + 6.5, (0.55, 0.0, "camina")),   # el guion se repite
])
def test_tramo_actual_sigue_el_guion(paseo, t, esperado):
    r = paseo()
    r._t = t
    assert r._tramo_actual() == esperado
    assert r.tramo == esperado[2]


def test_ultimo_tramo_del_guion_se_respeta(paseo, monkeypatch):
    monkeypatch.setattr(demo_paseo, "GUION", [(1.0, 0.1, 1.0, "a"), (2.0, 0.2, 2.0, "b")])
    r = paseo()
    r._t = 2.5
    assert r._tramo_actual() == (0.2, 2.0, "b")
    r._t = 3.5
    assert r._tramo_actual() == (0.1, 1.0, "a")


# ---------- bucle y paso ----------
def test_bucle_da_un_paso_cada_cincuentavo_de_segundo_hasta_que_lo_cortan(paseo):
    r = paseo()
    pasos = []
    r._paso = lambda: pasos.append(1)
    r._cortar = EventoFalso(wait=[False, False, True])
    BUCLE(r)
    assert len(pasos) == 2
    assert r._cortar.esperas == [0.02] * 3


def test_quieto_no_avanza_la_marcha(paseo):
    r = paseo()
    for _ in range(10):
        r._paso()
    assert r._fase == 0.0 and r._velocidad == 0.0
    assert r.mensajes_leidos == 11


def _guion_fijo(monkeypatch, vel, giro=0.0):
    monkeypatch.setattr(demo_paseo, "GUION", [(100.0, vel, giro, "fijo")])
    monkeypatch.setattr(demo_paseo, "_suavizar", lambda actual, objetivo, dt, tau: objetivo)


def test_velocidad_minima_para_que_haya_marcha(paseo, monkeypatch):
    _guion_fijo(monkeypatch, 0.02)
    r = paseo()
    r._paso()
    assert r._fase == 0.0
    _guion_fijo(monkeypatch, 0.03)
    r._paso()
    assert r._fase == pytest.approx(2 * math.pi * (1.6 + 0.9 * 0.03) * 0.02)


def test_la_marcha_se_acelera_con_la_velocidad_y_da_la_vuelta(paseo, monkeypatch):
    _guion_fijo(monkeypatch, 1.0)
    r = paseo(acelerar=5.0)                # dt = 0.1
    r._fase = 2 * math.pi - 0.1
    r._paso()
    assert r._fase == pytest.approx((2 * math.pi - 0.1 + 2 * math.pi * 2.5 * 0.1) % (2 * math.pi))
    assert 0 <= r._fase < 2 * math.pi


def test_el_giro_integra_el_yaw_y_lo_mantiene_entre_menos_pi_y_pi(paseo, monkeypatch):
    _guion_fijo(monkeypatch, 0.0, giro=90.0)
    r = paseo()
    r._yaw = 0.0
    r._paso()
    assert r._giro == 90.0
    assert r._yaw == pytest.approx(math.radians(90) * 0.02)
    r._yaw = math.pi - 0.01
    r._paso()
    assert r._yaw == pytest.approx(-math.pi - 0.01 + math.radians(90) * 0.02)


def test_paso_calcula_velocidad_de_motor_y_temperatura(paseo, monkeypatch):
    _guion_fijo(monkeypatch, 1.0)
    r = paseo()
    q_antes = list(r._q_prev)
    temp_antes = [m.temperatura for m in r._motores]
    r._paso()
    snap = r.obtener_snapshot()
    for i, m in enumerate(snap["motor_state"]):
        assert m["dq"] == pytest.approx((m["q"] - q_antes[i]) / 0.02)
        assert m["q"] == r._q_prev[i]
        assert m["temperature"] == int(round(r._motores[i].temperatura))
        assert r._motores[i].temperatura != temp_antes[i]
    assert snap["foot_force"] == [round(f, 1) for f in snap["foot_force"]]


def test_fuerzas_se_redondean_a_un_decimal(paseo, azar):
    azar.uniforme = 0.04                   # 60 + 0.04
    r = paseo()
    assert r.obtener_snapshot()["foot_force"] == [60.0] * 4
    azar.uniforme = 0.06
    r._paso()
    assert r.obtener_snapshot()["foot_force"] == [60.1] * 4


# ---------- cinemática ----------
def test_cuadrupedo_quieto_apoya_las_cuatro_patas(paseo):
    r = paseo()
    r._velocidad, r._fase = 0.0, 0.0
    q, tau, fuerzas = r._cuadrupedo()
    lado = [1, 1, 1, -1, -1, -1, 1, 1, 1, -1, -1, -1]   # FR, FL, RR, RL
    assert q[0::3] == aprox([math.radians(1.5 * s) for s in lado[0::3]])
    assert q[1::3] == aprox([math.radians(45)] * 4)
    assert q[2::3] == aprox([math.radians(-88)] * 4)
    assert tau[0::3] == aprox([1.2, -1.2, 1.2, -1.2])
    assert tau[1::3] == aprox([6.0] * 4)
    assert tau[2::3] == aprox([-9.0] * 4)
    assert fuerzas == [60.0] * 4


def test_cuadrupedo_trotando_levanta_las_diagonales(paseo):
    r = paseo()
    r._velocidad, r._fase = 1.0, math.pi / 2
    q, tau, fuerzas = r._cuadrupedo()
    assert fuerzas == [0.0, 95.0, 95.0, 0.0]          # FR y RL en el aire
    fr, fl = slice(0, 3), slice(3, 6)
    assert q[fr] == aprox([math.radians(1.5), math.radians(67), math.radians(-116)])
    assert q[fl] == aprox([math.radians(-1.5), math.radians(23), math.radians(-88)])
    assert tau[fr] == aprox([1.2, 10.5, -8.75])
    assert tau[fl] == aprox([-1.2, 15.0, -15.5])


def test_cuadrupedo_suma_ruido_al_torque(paseo, azar):
    r = paseo()
    r._velocidad, r._fase = 0.0, 0.0
    azar.k = 1.0
    _, tau, _ = r._cuadrupedo()
    assert tau[1::3] == aprox([6.15] * 4)


@pytest.mark.parametrize("a, fase, en_aire", [
    (0.05, math.pi / 2, False),           # muy lento: no despega
    (0.06, math.pi / 2, True),
    (1.0, math.asin(0.14), False),        # pata apenas arriba del suelo
    (1.0, math.asin(0.16), True),
])
def test_cuadrupedo_umbral_para_levantar_la_pata(paseo, a, fase, en_aire):
    r = paseo()
    r._velocidad, r._fase = a, fase
    _, _, fuerzas = r._cuadrupedo()
    assert (fuerzas[0] == 0.0) is en_aire


def _por_nombre(r, valores):
    return dict(zip(r.config["motores_nombres"], valores))


def test_humanoide_quieto(paseo):
    r = paseo("g1")
    r._velocidad, r._fase = 0.0, 0.0
    q, tau, fuerzas = r._humanoide()
    grados = _por_nombre(r, [math.degrees(v) for v in q])
    t = _por_nombre(r, tau)
    esperado = {
        "L_hip_pitch": (-12, 8), "L_knee": (28, 18), "L_ankle_pitch": (-14, 9),
        "L_shoulder_pitch": (10, 1.5), "L_elbow": (60, 1.2), "torso_yaw": (0, 3),
        "L_hip_roll": (0, 1.0), "L_ankle_roll": (0, 1.0), "torso_roll": (0, 1.0),
    }
    for nombre, (ang, torque) in esperado.items():
        assert grados[nombre] == pytest.approx(ang, abs=1e-9), nombre
        assert t[nombre] == pytest.approx(torque, abs=1e-9), nombre
    assert fuerzas == [220.0, 220.0]


def test_humanoide_caminando_en_contrafase(paseo):
    r = paseo("g1")
    r._velocidad, r._fase = 1.0, math.pi / 2
    q, tau, fuerzas = r._humanoide()
    grados = _por_nombre(r, [math.degrees(v) for v in q])
    t = _por_nombre(r, tau)
    esperado = {
        "L_hip_pitch": (13, 18), "R_hip_pitch": (-37, 18),
        "L_knee": (28, 32), "R_knee": (58, 32),
        "L_ankle_pitch": (-2, 9), "R_ankle_pitch": (-26, 9),
        "L_shoulder_pitch": (-10, 3), "R_shoulder_pitch": (30, 3),
        "L_elbow": (60, 2.0), "torso_yaw": (4, 8),
        "torso_roll": (0, 1.0), "R_wrist_roll": (0, 1.0),
    }
    for nombre, (ang, torque) in esperado.items():
        assert grados[nombre] == pytest.approx(ang, abs=1e-9), nombre
        assert t[nombre] == pytest.approx(torque, abs=1e-9), nombre
    assert fuerzas == [220.0, 0.0]         # [R_foot, L_foot]: el izquierdo en el aire
    r._fase = -math.pi / 2
    assert r._humanoide()[2] == [0.0, 220.0]


def test_humanoide_brazos_y_resto_con_coseno(paseo):
    r = paseo("g1")
    r._velocidad, r._fase = 1.0, 0.0       # s = 0, c = 1
    q, tau, _ = r._humanoide()
    grados = _por_nombre(r, [math.degrees(v) for v in q])
    t = _por_nombre(r, tau)
    assert grados["L_elbow"] == pytest.approx(68) and grados["L_hip_roll"] == pytest.approx(3)
    assert grados["R_hip_roll"] == pytest.approx(-3)
    assert t["L_hip_roll"] == pytest.approx(2.5) and t["L_ankle_pitch"] == pytest.approx(17)


@pytest.mark.parametrize("a, s, fuerzas", [
    (0.05, 1.0, [220.0, 220.0]),
    (0.06, 1.0, [220.0, 0.0]),
    (1.0, 0.19, [220.0, 220.0]),
    (1.0, 0.21, [220.0, 0.0]),
    (1.0, -0.19, [220.0, 220.0]),
    (1.0, -0.21, [0.0, 220.0]),
])
def test_humanoide_umbral_para_levantar_el_pie(paseo, a, s, fuerzas):
    r = paseo("g1")
    r._velocidad, r._fase = a, math.asin(s)
    assert r._humanoide()[2] == fuerzas


def test_humanoide_suma_ruido_al_torque(paseo, azar):
    r = paseo("g1")
    r._velocidad, r._fase = 0.0, 0.0
    azar.k = 1.0
    assert _por_nombre(r, r._humanoide()[1])["L_knee"] == pytest.approx(18.15)


# ---------- IMU ----------
def test_imu_quieto(paseo):
    r = paseo()
    r._velocidad, r._fase, r._t, r._yaw, r._giro = 0.0, 0.0, 0.0, 0.0, 0.0
    assert r._imu() == {"quaternion": [1.0, 0.0, 0.0, 0.0], "accelerometer": [0.0, 0.0, 9.81],
                        "gyroscope": [0.0, 0.0, 0.0]}


def test_imu_caminando(paseo):
    r = paseo()
    r._velocidad, r._fase, r._t, r._yaw, r._giro = 1.0, 0.0, 0.0, 0.3, 45.0
    imu = r._imu()
    assert imu["quaternion"] == aprox(_euler_a_cuaternion(0.0, math.radians(0.4), 0.3))
    assert imu["accelerometer"] == aprox([0.35, 0.0, 9.81])
    assert imu["gyroscope"] == [0.0, 0.0, math.radians(45.0)]


def test_imu_oscila_con_la_marcha_y_el_tiempo(paseo, azar):
    r = paseo()
    r._velocidad, r._fase, r._t, r._yaw = 1.0, math.pi / 4, 2.0, 0.0
    azar.k = 1.0
    imu = r._imu()
    roll = math.radians(2.2 * math.sin(math.pi / 4) + 0.25 * math.sin(1.4))
    pitch = math.radians(-1.2 + 1.6 * math.cos(math.pi / 2) + 0.2 * math.sin(1.0))
    assert imu["quaternion"] == aprox(_euler_a_cuaternion(roll, pitch, 0.0))
    assert imu["accelerometer"] == aprox([0.35 * math.cos(math.pi / 4) + 0.02,
                                          0.25 * math.sin(math.pi / 4) + 0.02,
                                          9.81 + 0.9 + 0.03])


# ---------- batería ----------
def test_bateria_corriente_segun_el_esfuerzo(paseo):
    r = paseo()
    r._soc, r._bat_temp = 92.0, 29.0
    b = r._bateria([1.0, -3.0], dt=1.0)
    assert b["current"] == 2440            # 1400 + 520 · 2
    assert r._soc == pytest.approx(92 - 2.44 * 0.0045)
    assert b["soc"] == 91
    assert r._bat_temp == pytest.approx(_suavizar(29.0, 28 + 2440 / 900, 1.0, 60.0))
    assert b["temperature"] == round(r._bat_temp, 1)
    v_base = 3300 + 9.0 * r._soc - 2440 * 0.012
    assert b["cell_vol"] == [int(v_base)] * 5 + [int(v_base - 14)] + [int(v_base)] * 2
    assert b["cell_vol"][0] == 4098 and b["cell_vol"][5] == 4084


def test_bateria_sin_motores_no_divide_por_cero(paseo):
    r = paseo()
    assert r._bateria([], dt=0.02)["current"] == 1400


def test_bateria_con_ruido(paseo, azar):
    r = paseo()
    azar.k = 1.0
    b = r._bateria([0.0], dt=0.0)
    assert b["current"] == 1440
    assert b["cell_vol"][0] == int(3300 + 9.0 * r._soc - 1440 * 0.012 + 1.5)


def test_bateria_casi_vacia_se_cambia(paseo):
    r = paseo()
    r._soc = 12.0
    assert r._bateria([0.0], dt=1.0)["soc"] == 96
    assert r._soc == 96.0
    r._soc = 12.1
    assert r._bateria([0.0], dt=1.0)["soc"] == 12


# ---------- interfaz común ----------
def test_interfaz_comun_de_los_lectores(paseo):
    r = paseo()
    assert r.esperar_primer_dato() is True
    assert r.esperar_primer_dato(timeout=3) is True
    copia = r.obtener_snapshot()
    copia["motor_state"].clear()
    assert len(r.obtener_snapshot()["motor_state"]) == 12
    assert r._cortar.is_set() is False
    r.cerrar()
    assert r._cortar.is_set() is True


def test_snapshot_vacio_antes_del_primer_paso(paseo):
    r = paseo()
    r._snapshot = None
    assert r.obtener_snapshot() is None
