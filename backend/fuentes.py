"""Elegir la fuente de datos del backend desde el dashboard, en caliente.

El backend de la catedra recibe UN lector al arrancar (`configurar()`). Este
modulo agrega dos rutas, sin modificar `telemetry_server.py`:

    GET  /fuentes   que fuentes hay, cual esta activa y por que alguna no esta disponible
    POST /fuente    cambia la fuente: {"modo": "real", "robot": "go2", "interfaz": "eth0"}

La API de telemetria sigue siendo de SOLO LECTURA respecto del robot: cambiar
la fuente decide de donde LEE el backend, nunca mueve al robot. Como afecta a
todos los dashboards conectados, se puede bloquear con `--fuente-fija`.

El cambio es transaccional: el lector nuevo tiene que entregar datos antes de
reemplazar al viejo. Si el robot no responde, se informa el error y se sigue
mostrando la fuente anterior (el dashboard nunca queda "a ciegas").
"""

from __future__ import annotations

import importlib.util
import socket
import threading

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

FUENTES = {
    "real": {
        "nombre": "Robot real",
        "descripcion": "Lee el robot por DDS a través del cable de red (laboratorio).",
        "medido": True,
    },
    "simulador": {
        "nombre": "Simulador MuJoCo",
        "descripcion": "El simulador 3D de la cátedra, corriendo en esta máquina.",
        "medido": False,
    },
    "demo": {
        "nombre": "Demo «paseo»",
        "descripcion": "Simulación con marcha, temperatura y batería coherentes. No necesita nada.",
        "medido": False,
    },
    "demo-catedra": {
        "nombre": "Demo de la cátedra",
        "descripcion": "El DemoReader original: señales senoidales.",
        "medido": False,
    },
}


class PedidoFuente(BaseModel):
    modo: str = Field(description="real | simulador | demo | demo-catedra")
    robot: str = Field(default="go2", description="go2 | g1")
    interfaz: str | None = Field(default=None, description="placa de red hacia el robot (solo real)")


def _sdk_instalado() -> bool:
    return importlib.util.find_spec("unitree_sdk2py") is not None


def _simulador_abierto() -> bool:
    """El simulador de la catedra escucha en un socket local: ¿responde?"""
    try:
        from telemetry_reader import HOST, _puerto_del_simulador
        with socket.create_connection((HOST, _puerto_del_simulador()), timeout=0.3):
            return True
    except (OSError, ImportError):
        return False


def disponibilidad(modo: str) -> tuple[bool, str]:
    """(disponible, motivo legible si no lo está)."""
    if modo == "real" and not _sdk_instalado():
        return False, ("Falta el SDK de Unitree en la máquina del backend. Instalalo con "
                       "«python iniciar.py --instalar-sdk» y volvé a arrancar el backend.")
    if modo == "simulador" and not _simulador_abierto():
        return False, "El simulador MuJoCo de la cátedra no está abierto en esta máquina."
    return True, ""


RED_DEL_ROBOT = "192.168.123."  # red por cable de los robots Unitree


def interfaces_de_red() -> list[dict]:
    """Placas de red con IPv4, marcando la que está en la red del robot.

    Usa la función de la cátedra (`config.interfaces_ipv4`), que funciona en
    Linux, el sistema de la notebook del laboratorio. En otros sistemas
    devuelve una lista vacía y el dashboard muestra un campo de texto.
    """
    try:
        from config import interfaces_ipv4
        placas = interfaces_ipv4()
    except Exception:  # noqa: BLE001 - sin lista, se escribe a mano
        return []
    return sorted(
        ({"nombre": n, "ip": ip, "robot": ip.startswith(RED_DEL_ROBOT)} for n, ip in placas.items()),
        key=lambda p: (not p["robot"], p["nombre"]),
    )


def crear_router(crear_lector, configurar, estado: dict, cambiable: bool = True) -> APIRouter:
    """Arma las rutas. Recibe las dependencias por parámetro (inyección)."""
    router = APIRouter(tags=["fuente de datos"])
    candado = threading.Lock()

    @router.get("/fuentes")
    def fuentes():
        lista = []
        for modo, meta in FUENTES.items():
            ok, motivo = disponibilidad(modo)
            lista.append({"modo": modo, **meta, "disponible": ok, "motivo": motivo})
        placas = interfaces_de_red()
        sugerida = next((p["nombre"] for p in placas if p["robot"]), None)
        return {
            "actual": {k: estado[k] for k in ("modo", "robot", "interfaz")},
            "cambiable": cambiable,
            "fuentes": lista,
            "robots": ["go2", "g1"],
            "interfaces": placas,
            "interfaz_sugerida": sugerida,
        }

    @router.post("/fuente")
    def cambiar_fuente(pedido: PedidoFuente):
        if not cambiable:
            raise HTTPException(403, "Este servidor tiene la fuente fija (--fuente-fija).")
        if pedido.modo not in FUENTES:
            raise HTTPException(400, f"Fuente desconocida: {pedido.modo}")
        if pedido.robot not in ("go2", "g1"):
            raise HTTPException(400, "Robot válido: go2 o g1")
        ok, motivo = disponibilidad(pedido.modo)
        if not ok:
            raise HTTPException(409, motivo)

        with candado:  # dos dashboards cambiando a la vez no se pisan
            try:
                nuevo = crear_lector(pedido.modo, pedido.robot, pedido.interfaz)
            except Exception as exc:  # noqa: BLE001 - se informa tal cual al usuario
                raise HTTPException(409, str(exc)) from exc
            if not nuevo.esperar_primer_dato(timeout=5.0):
                nuevo.cerrar()
                raise HTTPException(504, "La fuente no envió datos en 5 s. Se mantiene la anterior.")

            viejo = estado.get("lector")
            configurar(nuevo, pedido.robot, "demo" if pedido.modo.startswith("demo") else pedido.modo)
            estado.update(lector=nuevo, modo=pedido.modo, robot=pedido.robot, interfaz=pedido.interfaz)
            if viejo is not None and viejo is not nuevo:
                viejo.cerrar()
        print(f"[FUENTE] Ahora: {FUENTES[pedido.modo]['nombre']} · {pedido.robot}")
        return fuentes()

    return router
