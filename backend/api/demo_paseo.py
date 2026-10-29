"""Modo demo con "paseo": telemetria sintetica coherente con un robot que camina.

El `DemoReader` de la catedra genera senoidales independientes: sirve para
probar que el dashboard dibuja, pero la temperatura nunca pasa de ~43 °C (el
semaforo jamas se pone amarillo ni rojo) y las patas no siguen una marcha.

`PaseoDemoReader` replica lo que hace el simulador MuJoCo de la catedra, pero
sin MuJoCo: el robot recorre un **guion de tramos** (camina, gira, trota,
frena) y de ese estado se derivan todos los datos de forma fisicamente
coherente:

    velocidad del robot ──► amplitud de la marcha ──► angulo / velocidad de motor
                       └──► esfuerzo ──► torque ──► temperatura (modelo termico)
                                    └──► corriente ──► bateria (SOC, celdas)
    fase de la marcha ──► patas apoyadas ──► fuerzas
    giro ──► yaw (integrado)          oscilacion de la marcha ──► roll / pitch

Expone **exactamente la misma interfaz** que `TelemetryReader` y
`DemoReader` (patron *Adapter* / sustitucion de Liskov): `obtener_snapshot()`,
`esperar_primer_dato()`, `mensajes_leidos` y `cerrar()`. Por eso
`telemetry_server.py` y `telemetry_adapter.py` no se modifican: el snapshot
tiene la misma forma "cruda" que devuelve el robot por DDS (radianes, mV,
cuaternion, fuerzas en N).
"""

from __future__ import annotations

import copy
import math
import random
import threading
import time

from config import ROBOTS

# ---------------------------------------------------------------------------
# Guion del paseo: (duracion_s, velocidad_normalizada 0..1, giro_grados_por_s, etiqueta)
# Corto y variado a proposito: con tramos largos los graficos se ven planos.
# ---------------------------------------------------------------------------
GUION = [
    (6.0, 0.00, 0.0, "quieto"),
    (10.0, 0.55, 0.0, "camina"),
    (5.0, 0.55, 18.0, "curva izquierda"),
    (12.0, 1.00, 0.0, "trota"),
    (4.0, 0.30, -30.0, "gira derecha"),
    (7.0, 0.00, 0.0, "quieto"),
    (14.0, 0.85, 6.0, "camina rapido"),
    (5.0, 0.00, 0.0, "quieto"),
]

T_AMBIENTE = 30.0      # °C
K_CALOR = 1.75         # °C/s a torque nominal (calibrado para ver los 3 colores)
FRECUENCIA_SIM = 50.0  # Hz del integrador interno (el WebSocket emite a 10 Hz)


def _suavizar(actual: float, objetivo: float, dt: float, tau: float) -> float:
    """Filtro de primer orden: evita escalones bruscos entre tramos del guion."""
    return actual + (objetivo - actual) * (1.0 - math.exp(-dt / tau))


def _euler_a_cuaternion(roll: float, pitch: float, yaw: float) -> list[float]:
    """(roll, pitch, yaw) en radianes -> [w, x, y, z]. Inversa de imu_utils."""
    cr, sr = math.cos(roll / 2), math.sin(roll / 2)
    cp, sp = math.cos(pitch / 2), math.sin(pitch / 2)
    cy, sy = math.cos(yaw / 2), math.sin(yaw / 2)
    return [
        cr * cp * cy + sr * sp * sy,
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
    ]


class _Motor:
    """Estado termico de un motor. Modelo de primer orden (ley de Newton):

        dT/dt = k_calor * (tau / tau_nominal)**2  -  (T - T_ambiente) / tau_termica

    El calor generado es proporcional a tau**2 (perdidas Joule: I**2 * R, y el
    torque es proporcional a la corriente). Se normaliza por el torque nominal
    de cada articulacion para que una rodilla de G1 (40 Nm) y una cadera de Go2
    (10 Nm) calienten en la misma escala. Asi la temperatura *sube al
    caminar y baja al frenar*, con la inercia de un motor real.
    """

    def __init__(self, k_calor: float, tau_nominal: float, tau_termica: float):
        self.k_calor = k_calor
        self.tau_nominal = tau_nominal
        self.tau_termica = tau_termica
        self.temperatura = T_AMBIENTE + random.uniform(1.0, 4.0)

    def integrar(self, torque: float, dt: float) -> None:
        carga = torque / self.tau_nominal          # fraccion del torque nominal
        calor = self.k_calor * carga * carga
        enfriamiento = (self.temperatura - T_AMBIENTE) / self.tau_termica
        self.temperatura += (calor - enfriamiento) * dt


class PaseoDemoReader:
    """Lector demo con marcha, modelo termico y bateria. Hilo propio a 50 Hz."""

    def __init__(self, modelo: str = "go2", semilla: int = 7, acelerar: float = 1.0):
        if modelo not in ROBOTS:
            raise ValueError(f"Modelo desconocido: {modelo}")
        random.seed(semilla)
        self.modelo = modelo
        self.config = ROBOTS[modelo]
        self.acelerar = acelerar          # >1 adelanta el tiempo (tests)
        self._lock = threading.Lock()
        self._snapshot: dict | None = None
        self._mensajes = 0
        self._cortar = threading.Event()

        n = self.config["n_motores"]
        self._motores = [self._crear_motor(i) for i in range(n)]
        self._q_prev = [0.0] * n

        # Estado cinematico del "cuerpo"
        self._t = 0.0
        self._fase = 0.0                 # fase de la marcha [rad]
        self._velocidad = 0.0            # 0..1 suavizada
        self._giro = 0.0                 # °/s suavizado
        self._yaw = math.radians(random.uniform(-30, 30))

        # Bateria
        self._soc = 92.0
        self._bat_temp = 29.0
        self._celdas_offset = [random.uniform(-6, 6) for _ in range(8)]
        self._celdas_offset[5] -= 14     # una celda algo desbalanceada: realista

        self._paso()                     # primer dato disponible de inmediato
        self._hilo = threading.Thread(target=self._bucle, daemon=True)
        self._hilo.start()

    # ------------------------------------------------------------------
    # Construccion
    # ------------------------------------------------------------------
    def _crear_motor(self, indice: int) -> _Motor:
        nombre = self.config["motores_nombres"][indice]
        # Torque nominal aproximado por tipo de articulacion [Nm]
        if self.modelo == "go2":
            nominal = 22.0 if "calf" in nombre else 20.0 if "thigh" in nombre else 9.0
        elif "knee" in nombre:
            nominal = 36.0
        elif "hip_pitch" in nombre:
            nominal = 26.0
        elif "ankle" in nombre:
            nominal = 20.0
        else:
            nominal = 9.0
        # Los motores que cargan peso (rodilla / pantorrilla) calientan mas.
        k = K_CALOR * (1.25 if ("calf" in nombre or "knee" in nombre) else 1.0)
        k *= random.uniform(0.85, 1.20)  # dispersion de fabricacion
        return _Motor(k_calor=k, tau_nominal=nominal, tau_termica=random.uniform(35.0, 50.0))

    # ------------------------------------------------------------------
    # Guion
    # ------------------------------------------------------------------
    def _tramo_actual(self) -> tuple[float, float, str]:
        total = sum(d for d, *_ in GUION)
        t = self._t % total
        for duracion, vel, giro, etiqueta in GUION:
            if t < duracion:
                return vel, giro, etiqueta
            t -= duracion
        return 0.0, 0.0, "quieto"

    # ------------------------------------------------------------------
    # Hilo de simulacion
    # ------------------------------------------------------------------
    def _bucle(self) -> None:
        periodo = 1.0 / FRECUENCIA_SIM
        while not self._cortar.wait(periodo):
            self._paso()

    def _paso(self) -> None:
        dt = (1.0 / FRECUENCIA_SIM) * self.acelerar
        self._t += dt
        vel_obj, giro_obj, _ = self._tramo_actual()
        self._velocidad = _suavizar(self._velocidad, vel_obj, dt, 0.8)
        self._giro = _suavizar(self._giro, giro_obj, dt, 0.6)
        self._yaw += math.radians(self._giro) * dt
        self._yaw = (self._yaw + math.pi) % (2 * math.pi) - math.pi

        frecuencia_marcha = 1.6 + 0.9 * self._velocidad   # Hz
        if self._velocidad > 0.02:
            self._fase = (self._fase + 2 * math.pi * frecuencia_marcha * dt) % (2 * math.pi)

        if self.modelo == "go2":
            q, tau, contacto = self._cuadrupedo()
        else:
            q, tau, contacto = self._humanoide()

        motores = []
        for i, motor in enumerate(self._motores):
            motor.integrar(tau[i], dt)
            dq = (q[i] - self._q_prev[i]) / dt if self._mensajes else 0.0
            self._q_prev[i] = q[i]
            motores.append({
                "id": i,
                "q": q[i],
                "dq": dq,
                "tau_est": tau[i],
                "temperature": int(round(motor.temperatura)),
            })

        snapshot = {
            "timestamp": time.time(),
            "motor_state": motores,
            "imu": self._imu(),
            "bms": self._bateria(tau, dt),
            "foot_force": [round(f, 1) for f in contacto],
        }
        with self._lock:
            self._snapshot = snapshot
            self._mensajes += 1

    # ------------------------------------------------------------------
    # Cinematica de la marcha
    # ------------------------------------------------------------------
    def _cuadrupedo(self):
        """Trote: patas diagonales en fase (FR+RL) y (FL+RR) en contrafase."""
        a = self._velocidad
        desfase = {"FR": 0.0, "FL": math.pi, "RR": math.pi, "RL": 0.0}
        q, tau, fuerzas = [], [], []
        for pata in self.config["patas"]:
            fase = self._fase + desfase[pata]
            s, c = math.sin(fase), math.cos(fase)
            en_aire = a > 0.05 and s > 0.15
            lado = 1 if pata.endswith("R") else -1
            # hip (abduccion), thigh (cadera), calf (rodilla), en radianes
            q_hip = math.radians(lado * (1.5 + 3.0 * a * c))
            q_thigh = math.radians(45 + 22 * a * s)
            q_calf = math.radians(-88 - 28 * a * max(0.0, s))
            carga = 1.0 if not en_aire else 0.25
            t_hip = (1.2 + 2.5 * a * abs(c)) * lado
            t_thigh = 6.0 * carga + 9.0 * a * abs(s)
            t_calf = -(9.0 * carga + 13.0 * a * (0.5 + 0.5 * abs(c)))
            q += [q_hip, q_thigh, q_calf]
            tau += [t_hip, t_thigh, t_calf]
            fuerzas.append(0.0 if en_aire else 60.0 + 35.0 * a + random.uniform(-4, 4))
        return q, [t + random.gauss(0, 0.15) for t in tau], fuerzas

    def _humanoide(self):
        """Caminata bipeda: piernas en contrafase, brazos oscilan al reves."""
        a = self._velocidad
        s, c = math.sin(self._fase), math.cos(self._fase)
        q, tau = [], []
        for nombre in self.config["motores_nombres"]:
            signo = 1 if nombre.startswith("L_") else -1   # contrafase L/R
            sp = signo * s
            if "hip_pitch" in nombre:
                ang, t = -12 + 25 * a * sp, 8 + 10 * a * abs(sp)
            elif "knee" in nombre:
                ang, t = 28 + 30 * a * max(0.0, -sp), 18 + 14 * a * abs(sp)
            elif "ankle_pitch" in nombre:
                ang, t = -14 + 12 * a * sp, 9 + 8 * a * abs(c)
            elif "shoulder_pitch" in nombre:
                ang, t = 10 - 20 * a * sp, 1.5 + 1.5 * a * abs(sp)
            elif "elbow" in nombre:
                ang, t = 60 + 8 * a * c, 1.2 + 0.8 * a
            elif nombre.startswith("torso_yaw"):
                ang, t = 4 * a * s, 3 + 5 * a * abs(s)
            else:
                ang, t = 3 * a * signo * c, 1.0 + 1.5 * a * abs(c)
            q.append(math.radians(ang))
            tau.append(t + random.gauss(0, 0.15))
        en_aire_izq = a > 0.05 and s > 0.2
        en_aire_der = a > 0.05 and s < -0.2
        # patas del G1 en config: ["R_foot", "L_foot"]
        fuerzas = [0.0 if en_aire_der else 220.0, 0.0 if en_aire_izq else 220.0]
        return q, tau, fuerzas

    def _imu(self) -> dict:
        a = self._velocidad
        roll = math.radians(2.2 * a * math.sin(self._fase) + 0.25 * math.sin(self._t * 0.7))
        # Al acelerar el cuerpo cabecea un poco hacia adelante
        pitch = math.radians(-1.2 * a + 1.6 * a * math.cos(2 * self._fase)
                             + 0.2 * math.sin(self._t * 0.5))
        return {
            "quaternion": _euler_a_cuaternion(roll, pitch, self._yaw),
            "accelerometer": [
                0.35 * a * math.cos(self._fase) + random.gauss(0, 0.02),
                0.25 * a * math.sin(self._fase) + random.gauss(0, 0.02),
                9.81 + 0.9 * a * math.sin(2 * self._fase) + random.gauss(0, 0.03),
            ],
            "gyroscope": [0.0, 0.0, math.radians(self._giro)],
        }

    def _bateria(self, tau: list[float], dt: float) -> dict:
        esfuerzo = sum(abs(t) for t in tau) / max(1, len(tau))
        corriente = 1400 + 520 * esfuerzo + random.gauss(0, 40)       # mA
        # Descarga acelerada ~x40 para que en una clase se vea moverse el SOC.
        self._soc -= corriente / 1000.0 * dt * 0.0045
        if self._soc < 12:
            self._soc = 96.0                                         # "cambio de bateria"
        self._bat_temp = _suavizar(self._bat_temp, 28 + corriente / 900.0, dt, 60.0)
        v_base = 3300 + 9.0 * self._soc - corriente * 0.012           # mV por celda
        return {
            "soc": int(self._soc),
            "current": int(corriente),
            "temperature": round(self._bat_temp, 1),
            "cell_vol": [int(v_base + off + random.gauss(0, 1.5)) for off in self._celdas_offset],
        }

    # ------------------------------------------------------------------
    # Interfaz comun a todos los lectores
    # ------------------------------------------------------------------
    @property
    def tramo(self) -> str:
        return self._tramo_actual()[2]

    def obtener_snapshot(self) -> dict | None:
        with self._lock:
            return copy.deepcopy(self._snapshot)

    def esperar_primer_dato(self, timeout: float = 0) -> bool:
        return True

    @property
    def mensajes_leidos(self) -> int:
        with self._lock:
            return self._mensajes

    def cerrar(self) -> None:
        self._cortar.set()
