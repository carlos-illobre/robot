"""Pruebas de `api/config.py`: robots, placas de red y detección de interfaz."""

from __future__ import annotations

import socket
import struct
import sys
from types import SimpleNamespace

import pytest

import config
from conftest import API, cargar_copia


def test_robots_tienen_la_cantidad_de_motores_y_nombres_del_sdk():
    go2, g1 = config.ROBOTS["go2"], config.ROBOTS["g1"]
    assert go2["n_motores"] == len(go2["motores_nombres"]) == 12
    assert g1["n_motores"] == len(g1["motores_nombres"]) == 29
    assert go2["patas"] == ["FR", "FL", "RR", "RL"]
    assert g1["patas"] == ["R_foot", "L_foot"]
    assert go2["msg_type"] == "unitree_go" and g1["msg_type"] == "unitree_hg"
    assert go2["topic_lowstate"] == g1["topic_lowstate"] == "rt/lf/lowstate"
    assert go2["motores_nombres"][:3] == ["FR_hip", "FR_thigh", "FR_calf"]


def test_valores_por_defecto_del_servidor():
    assert config.ROBOT_ACTIVO == "go2"
    assert config.NETWORK_INTERFACE is None
    assert (config.API_HOST, config.API_PORT) == ("0.0.0.0", 8001)
    assert config.API_CORS_ORIGINS == ["*"]
    assert config.TELEMETRY_RATE_HZ == config.WEBSOCKET_RATE_HZ == 10


class SocketFalso:
    def __init__(self, *args):
        self.args = args
        self.cerrado = False

    def fileno(self):
        return 42

    def close(self):
        self.cerrado = True


def _red_falsa(monkeypatch, ioctl):
    creados = []

    def crear(*args):
        s = SocketFalso(*args)
        creados.append(s)
        return s

    monkeypatch.setattr(config, "socket", SimpleNamespace(
        AF_INET=socket.AF_INET, SOCK_DGRAM=socket.SOCK_DGRAM,
        socket=crear, inet_ntoa=socket.inet_ntoa))
    monkeypatch.setattr(config, "fcntl", SimpleNamespace(ioctl=ioctl))
    return creados


def test_ipv4_de_una_interfaz_se_lee_con_siocgifaddr(monkeypatch):
    llamadas = []

    def ioctl(fd, pedido, arg):
        llamadas.append((fd, pedido, arg))
        return b"\0" * 20 + bytes([192, 168, 123, 18]) + b"\0" * 8

    creados = _red_falsa(monkeypatch, ioctl)
    assert config._ipv4_interfaz("enp3s0") == "192.168.123.18"
    assert creados[0].args == (socket.AF_INET, socket.SOCK_DGRAM)
    assert llamadas == [(42, 0x8915, struct.pack("256s", b"enp3s0"))]
    assert creados[0].cerrado


def test_ipv4_recorta_el_nombre_a_15_caracteres(monkeypatch):
    llamadas = []

    def ioctl(fd, pedido, arg):
        llamadas.append(arg)
        return b"\0" * 20 + bytes([10, 0, 0, 1])

    _red_falsa(monkeypatch, ioctl)
    assert config._ipv4_interfaz("a" * 20) == "10.0.0.1"
    assert llamadas == [struct.pack("256s", b"a" * 15)]


def test_ipv4_de_una_interfaz_sin_direccion_es_none_y_cierra_el_socket(monkeypatch):
    def ioctl(*_):
        raise OSError("sin IPv4")

    creados = _red_falsa(monkeypatch, ioctl)
    assert config._ipv4_interfaz("wlan0") is None
    assert creados[0].cerrado


def test_ipv4_sin_poder_crear_el_socket_es_none(monkeypatch):
    def sin_socket(*_):
        raise PermissionError("no")

    monkeypatch.setattr(config, "socket", SimpleNamespace(
        AF_INET=socket.AF_INET, SOCK_DGRAM=socket.SOCK_DGRAM, socket=sin_socket))
    monkeypatch.setattr(config, "fcntl", SimpleNamespace(ioctl=None))
    assert config._ipv4_interfaz("eth0") is None


def test_ipv4_sin_fcntl_no_intenta_nada(monkeypatch):
    def prohibido(*_):
        raise AssertionError("no debía abrir un socket")

    monkeypatch.setattr(config, "fcntl", None)
    monkeypatch.setattr(config, "socket", SimpleNamespace(socket=prohibido))
    assert config._ipv4_interfaz("eth0") is None


def test_interfaces_ipv4_lista_las_que_tienen_ip_y_saltea_lo(monkeypatch, tmp_path):
    for nombre in ("lo", "eth0", "wlan0", "docker0"):
        (tmp_path / nombre).mkdir()
    ips = {"eth0": "192.168.123.99", "docker0": "172.17.0.1", "lo": "127.0.0.1"}
    pedidas = []

    def ipv4(nombre):
        pedidas.append(nombre)
        return ips.get(nombre)

    monkeypatch.setattr(config, "Path", lambda _ruta: tmp_path)
    monkeypatch.setattr(config, "_ipv4_interfaz", ipv4)
    assert config.interfaces_ipv4() == {"eth0": "192.168.123.99", "docker0": "172.17.0.1"}
    assert "lo" not in pedidas


def test_interfaces_ipv4_usa_sys_class_net(monkeypatch, tmp_path):
    rutas = []

    def ruta(r):
        rutas.append(r)
        return tmp_path / "no-existe"

    monkeypatch.setattr(config, "Path", ruta)
    assert config.interfaces_ipv4() == {}
    assert rutas == ["/sys/class/net"]


def test_detectar_interfaz_red_en_el_paquete_siempre_es_lo():
    assert config.detectar_interfaz_red() == "lo"
    assert config.detectar_interfaz_red("go2", interfaz="eth0") == "lo"


def test_sin_fcntl_el_modulo_carga_igual(monkeypatch):
    """En Windows no existe `fcntl`: config.py se importa igual y no lee placas."""
    monkeypatch.setitem(sys.modules, "fcntl", None)
    copia = cargar_copia(API / "config.py", "config_sin_fcntl")
    assert copia.fcntl is None
    assert copia._ipv4_interfaz("eth0") is None
    assert copia.ROBOTS["go2"]["n_motores"] == 12


@pytest.mark.skipif(sys.platform != "linux", reason="fcntl solo en Linux")
def test_en_linux_fcntl_esta_disponible():
    import fcntl

    assert config.fcntl is fcntl
