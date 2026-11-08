"""Pruebas de `iniciar.py`: arranque multiplataforma (venv, dependencias, navegador, backend).

Todo lo que toca el sistema se reemplaza por dobles: `venv`, `subprocess`,
`urllib`, `webbrowser`, `threading`, `time`, `os.name` y `sys`. Los archivos
(.venv, requirements.txt, la marca) viven en un directorio temporal.
"""

from __future__ import annotations

import hashlib
import runpy
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

import iniciar
from conftest import RAIZ


# ---------- constantes y utilidades ----------
def test_rutas_y_constantes():
    assert iniciar.RAIZ == RAIZ
    assert iniciar.VENV == RAIZ / ".venv"
    assert iniciar.REQUISITOS == RAIZ / "requirements.txt"
    assert iniciar.MARCA == RAIZ / ".venv" / ".requisitos.sha256"
    assert iniciar.PYTHON_MINIMO == (3, 10)
    assert iniciar.SDK_UNITREE == "git+https://github.com/unitreerobotics/unitree_sdk2_python.git"


def test_python_del_venv_en_linux_y_macos(monkeypatch):
    monkeypatch.setattr(iniciar, "os", SimpleNamespace(name="posix"))
    assert iniciar.python_del_venv() == iniciar.VENV / "bin" / "python"


def test_python_del_venv_en_windows(monkeypatch):
    monkeypatch.setattr(iniciar, "os", SimpleNamespace(name="nt"))
    assert iniciar.python_del_venv() == iniciar.VENV / "Scripts" / "python.exe"


def test_paso_imprime_con_flush(monkeypatch):
    impresos = []
    monkeypatch.setattr(iniciar, "print", lambda *a, **k: impresos.append((a, k)), raising=False)
    iniciar.paso("Hola")
    assert impresos == [(("» Hola",), {"flush": True})]


def _sys(monkeypatch, argv=("iniciar.py",), version=(3, 12, 1, "final", 0)):
    falso = SimpleNamespace(argv=list(argv), version_info=version, exit=sys.exit)
    monkeypatch.setattr(iniciar, "sys", falso)
    return falso


@pytest.mark.parametrize("version", [(3, 10, 0), (3, 12, 4, "final", 0), (4, 0, 0)])
def test_python_suficiente_sigue(monkeypatch, version):
    _sys(monkeypatch, version=version)
    assert iniciar.verificar_python() is None


@pytest.mark.parametrize("version, texto", [((3, 9, 18, "final", 0), "3.9.18"), ((2, 7, 18), "2.7.18")])
def test_python_viejo_sale_con_instrucciones(monkeypatch, version, texto):
    _sys(monkeypatch, version=version)
    with pytest.raises(SystemExit) as e:
        iniciar.verificar_python()
    assert e.value.code == (
        f"Hace falta Python 3.10 o superior (tenés {texto}).\n"
        "Descargalo de https://www.python.org/downloads/ "
        "(en Windows, tildá «Add python.exe to PATH»)."
    )


@pytest.mark.parametrize("args, esperado", [
    (["--puerto", "9000"], "9000"),
    (["--demo", "--puerto", "9000", "--robot", "g1"], "9000"),
    (["--puerto"], "8001"),
    (["--demo"], "8001"),
    ([], "8001"),
])
def test_opcion_lee_el_valor_que_sigue(args, esperado):
    assert iniciar.opcion(args, "--puerto", "8001") == esperado


@pytest.mark.parametrize("args, esperado", [
    (["--puerto=9000"], "9000"),
    (["--demo", "--puerto=9000", "--robot", "g1"], "9000"),
    (["--puertos=9000"], "8001"),
])
def test_fr014_opcion_lee_la_forma_con_igual(args, esperado):
    assert iniciar.opcion(args, "--puerto", "8001") == esperado


@pytest.mark.parametrize("args, esperado", [
    (["--puerto", "9000"], True),
    (["--puerto=9000"], True),
    (["--puertos=9000", "--demo"], False),
    ([], False),
])
def test_fr014_tiene_opcion_reconoce_las_dos_formas(args, esperado):
    assert iniciar.tiene_opcion(args, "--puerto") is esperado


# ---------- pyvenv.cfg ----------
@pytest.fixture
def venv_tmp(monkeypatch, tmp_path):
    venv = tmp_path / ".venv"
    monkeypatch.setattr(iniciar, "VENV", venv)
    monkeypatch.setattr(iniciar, "MARCA", venv / ".requisitos.sha256")
    requisitos = tmp_path / "requirements.txt"
    requisitos.write_text("fastapi\nuvicorn\n", encoding="utf-8")
    monkeypatch.setattr(iniciar, "REQUISITOS", requisitos)
    py = venv / "bin" / "python"
    monkeypatch.setattr(iniciar, "python_del_venv", lambda: py)
    return SimpleNamespace(venv=venv, py=py, requisitos=requisitos, cfg=venv / "pyvenv.cfg",
                           marca=venv / ".requisitos.sha256")


def test_sin_pyvenv_cfg_no_hace_nada(venv_tmp):
    iniciar.ver_paquetes_del_sistema()
    assert not venv_tmp.cfg.exists()


def test_activa_los_paquetes_del_sistema(venv_tmp):
    venv_tmp.venv.mkdir()
    venv_tmp.cfg.write_text("home = /usr/bin\ninclude-system-site-packages = false\nversion = 3.12.1\n")
    iniciar.ver_paquetes_del_sistema()
    assert venv_tmp.cfg.read_text() == (
        "home = /usr/bin\nversion = 3.12.1\ninclude-system-site-packages = true\n")


def test_agrega_la_linea_si_no_estaba(venv_tmp):
    venv_tmp.venv.mkdir()
    venv_tmp.cfg.write_text("home = /usr/bin")
    iniciar.ver_paquetes_del_sistema()
    assert venv_tmp.cfg.read_text() == "home = /usr/bin\ninclude-system-site-packages = true\n"


def test_reemplaza_la_linea_aunque_tenga_espacios_delante(venv_tmp):
    venv_tmp.venv.mkdir()
    venv_tmp.cfg.write_text("  include-system-site-packages = false\nhome = x")
    iniciar.ver_paquetes_del_sistema()
    assert venv_tmp.cfg.read_text() == "home = x\ninclude-system-site-packages = true\n"


def test_si_ya_estaba_bien_no_reescribe(venv_tmp):
    venv_tmp.venv.mkdir()
    venv_tmp.cfg.write_text("home = x\ninclude-system-site-packages = true")   # sin \n final
    iniciar.ver_paquetes_del_sistema()
    assert venv_tmp.cfg.read_text() == "home = x\ninclude-system-site-packages = true"


# ---------- preparar_entorno ----------
class Constructor:
    creados = []

    def __init__(self, **kw):
        self.kw = kw

    def create(self, ruta):
        Constructor.creados.append((self.kw, ruta))
        Path(ruta).mkdir(parents=True)
        (Path(ruta) / "pyvenv.cfg").write_text("include-system-site-packages = false\n")


@pytest.fixture
def herramientas(monkeypatch):
    Constructor.creados = []
    d = SimpleNamespace(run=[], call=[], fallar=None, codigo=0)

    def run(cmd, check=False):
        d.run.append((cmd, check))
        if d.fallar:
            raise subprocess.CalledProcessError(1, cmd)
        return SimpleNamespace(returncode=d.codigo)

    def call(cmd, cwd=None):
        d.call.append((cmd, cwd))
        if isinstance(d.codigo, BaseException):
            raise d.codigo
        return d.codigo

    monkeypatch.setattr(iniciar, "venv", SimpleNamespace(EnvBuilder=Constructor))
    monkeypatch.setattr(iniciar, "subprocess", SimpleNamespace(
        run=run, call=call, CalledProcessError=subprocess.CalledProcessError))
    return d


def _pip(py, *resto):
    return [str(py), "-m", "pip", "install", "--disable-pip-version-check", "-q", *resto]


def test_primera_vez_crea_el_venv_e_instala(venv_tmp, herramientas, capsys):
    assert iniciar.preparar_entorno() == venv_tmp.py
    assert Constructor.creados == [({"with_pip": True, "system_site_packages": True}, venv_tmp.venv)]
    assert venv_tmp.cfg.read_text() == "include-system-site-packages = true\n"
    assert herramientas.run == [
        (_pip(venv_tmp.py, "--upgrade", "pip"), True),
        (_pip(venv_tmp.py, "-r", str(venv_tmp.requisitos)), True),
    ]
    huella = hashlib.sha256(b"fastapi\nuvicorn\n").hexdigest()
    assert venv_tmp.marca.read_text() == huella
    salida = capsys.readouterr().out
    assert "» Creando el entorno virtual (.venv), solo la primera vez…" in salida
    assert "» Instalando dependencias (necesita internet, solo la primera vez)…" in salida


def test_con_todo_instalado_no_toca_nada(venv_tmp, herramientas, capsys):
    venv_tmp.py.parent.mkdir(parents=True)
    venv_tmp.py.write_text("")
    venv_tmp.marca.write_text(hashlib.sha256(b"fastapi\nuvicorn\n").hexdigest() + "\n")
    assert iniciar.preparar_entorno() == venv_tmp.py
    assert Constructor.creados == [] and herramientas.run == []
    assert capsys.readouterr().out == ""


def test_si_cambian_los_requisitos_reinstala(venv_tmp, herramientas):
    venv_tmp.py.parent.mkdir(parents=True)
    venv_tmp.py.write_text("")
    venv_tmp.marca.write_text(hashlib.sha256(b"fastapi\n").hexdigest())
    iniciar.preparar_entorno()
    assert Constructor.creados == []
    assert len(herramientas.run) == 2
    assert venv_tmp.marca.read_text() == hashlib.sha256(b"fastapi\nuvicorn\n").hexdigest()


def test_si_falla_pip_no_deja_la_marca(venv_tmp, herramientas):
    herramientas.fallar = True
    with pytest.raises(subprocess.CalledProcessError):
        iniciar.preparar_entorno()
    assert not venv_tmp.marca.exists()
    assert len(herramientas.run) == 1


# ---------- navegador ----------
class Hilo:
    creados = []

    def __init__(self, target, daemon):
        self.target, self.daemon = target, daemon
        self.iniciado = False
        Hilo.creados.append(self)

    def start(self):
        self.iniciado = True


@pytest.fixture
def navegador(monkeypatch):
    Hilo.creados = []
    d = SimpleNamespace(pedidos=[], abiertos=[], siestas=[], fallas=0)

    def urlopen(url, timeout):
        d.pedidos.append((url, timeout))
        if d.fallas:
            d.fallas -= 1
            raise ConnectionRefusedError()
        return object()

    monkeypatch.setattr(iniciar, "threading", SimpleNamespace(Thread=Hilo))
    monkeypatch.setattr(iniciar, "urllib", SimpleNamespace(request=SimpleNamespace(urlopen=urlopen)))
    monkeypatch.setattr(iniciar, "webbrowser", SimpleNamespace(open=d.abiertos.append))
    monkeypatch.setattr(iniciar, "time", SimpleNamespace(sleep=d.siestas.append))
    return d


def test_abre_el_navegador_en_segundo_plano(navegador):
    iniciar.abrir_navegador_cuando_responda("http://localhost:8001")
    (hilo,) = Hilo.creados
    assert hilo.daemon is True and hilo.iniciado is True
    assert navegador.pedidos == []                     # todavía no corrió
    hilo.target()
    assert navegador.pedidos == [("http://localhost:8001/info", 1)]
    assert navegador.abiertos == ["http://localhost:8001"]
    assert navegador.siestas == []


def test_espera_a_que_el_backend_responda(navegador):
    navegador.fallas = 3
    iniciar.abrir_navegador_cuando_responda("http://localhost:9000")
    Hilo.creados[0].target()
    assert len(navegador.pedidos) == 4
    assert navegador.siestas == [0.5] * 3
    assert navegador.abiertos == ["http://localhost:9000"]


def test_si_el_backend_nunca_responde_se_rinde_a_los_30_segundos(navegador):
    navegador.fallas = 1000
    iniciar.abrir_navegador_cuando_responda("http://localhost:8001")
    Hilo.creados[0].target()
    assert len(navegador.pedidos) == 60
    assert navegador.siestas == [0.5] * 60
    assert navegador.abiertos == []


# ---------- SDK de Unitree ----------
def test_instalar_sdk(herramientas, capsys):
    py = Path("/x/.venv/bin/python")
    assert iniciar.instalar_sdk(py) == 0
    assert herramientas.run == [([str(py), "-m", "pip", "install", "--disable-pip-version-check",
                                  iniciar.SDK_UNITREE], False)]
    salida = capsys.readouterr().out
    assert "» Instalando el SDK de Unitree (necesita internet, una sola vez)…" in salida
    assert "» SDK instalado. Ya podés elegir «Robot real» en el dashboard." in salida


def test_instalar_sdk_que_falla_explica_por_que(herramientas, capsys):
    herramientas.codigo = 1
    assert iniciar.instalar_sdk(Path("py")) == 1
    salida = capsys.readouterr().out
    assert "No se pudo instalar el SDK. Lo más común es que falle CycloneDDS:" in salida
    assert "probá con Python 3.10" in salida
    assert "El resto del dashboard (demo, simulador) funciona igual sin el SDK." in salida
    assert "SDK instalado" not in salida


# ---------- main ----------
@pytest.fixture
def arranque(monkeypatch, herramientas):
    d = SimpleNamespace(verificado=0, preparado=0, sdk=[], navegador=[], error=None, py=Path("/v/bin/python"))

    def verificar():
        d.verificado += 1

    def preparar():
        d.preparado += 1
        if d.error:
            raise d.error
        return d.py

    def instalar(py):
        d.sdk.append(py)
        return 7

    monkeypatch.setattr(iniciar, "verificar_python", verificar)
    monkeypatch.setattr(iniciar, "preparar_entorno", preparar)
    monkeypatch.setattr(iniciar, "instalar_sdk", instalar)
    monkeypatch.setattr(iniciar, "abrir_navegador_cuando_responda", d.navegador.append)
    d.herramientas = herramientas
    return d


def _main(monkeypatch, *argv):
    _sys(monkeypatch, argv=("iniciar.py", *argv))
    return iniciar.main()


def _backend(py, *args):
    return ([str(py), str(RAIZ / "backend" / "servidor.py"), *args], RAIZ)


def test_sin_opciones_arranca_la_demo_y_abre_el_navegador(monkeypatch, arranque, capsys):
    assert _main(monkeypatch) == 0
    assert arranque.verificado == 1 and arranque.preparado == 1
    assert arranque.herramientas.call == [_backend(arranque.py, "--demo", "--puerto", "8001")]
    assert arranque.navegador == ["http://localhost:8001"]
    assert "» Levantando el backend (Ctrl+C para cerrar)…" in capsys.readouterr().out


def test_sin_navegador(monkeypatch, arranque):
    _main(monkeypatch, "--robot", "g1", "--sin-navegador")
    assert arranque.navegador == []
    assert arranque.herramientas.call == [_backend(arranque.py, "--demo", "--robot", "g1", "--puerto", "8001")]


@pytest.mark.parametrize("modo", ["--demo", "--demo-catedra", "--real"])
def test_con_un_modo_explicito_no_agrega_demo(monkeypatch, arranque, modo):
    _main(monkeypatch, modo)
    assert arranque.herramientas.call == [_backend(arranque.py, modo, "--puerto", "8001")]


def test_simulador_es_el_modo_por_defecto_de_servidor(monkeypatch, arranque):
    _main(monkeypatch, "--simulador", "--robot", "g1")
    assert arranque.herramientas.call == [_backend(arranque.py, "--robot", "g1", "--puerto", "8001")]


def test_respeta_el_puerto_pedido(monkeypatch, arranque):
    _main(monkeypatch, "--real", "--interfaz", "eth0", "--puerto", "9100")
    assert arranque.herramientas.call == [_backend(arranque.py, "--real", "--interfaz", "eth0", "--puerto", "9100")]
    assert arranque.navegador == ["http://localhost:9100"]


def test_fr014_respeta_el_puerto_pedido_con_igual(monkeypatch, arranque):
    _main(monkeypatch, "--real", "--puerto=9000")
    assert arranque.herramientas.call == [_backend(arranque.py, "--real", "--puerto=9000")]
    assert arranque.navegador == ["http://localhost:9000"]


def test_devuelve_el_codigo_del_backend(monkeypatch, arranque):
    arranque.herramientas.codigo = 3
    assert _main(monkeypatch) == 3


def test_ctrl_c_cierra_sin_error(monkeypatch, arranque):
    arranque.herramientas.codigo = KeyboardInterrupt()
    assert _main(monkeypatch) == 0


def test_sin_internet_para_instalar_dependencias(monkeypatch, arranque, capsys):
    arranque.error = subprocess.CalledProcessError(1, ["pip"])
    assert _main(monkeypatch) == 1
    assert arranque.herramientas.call == [] and arranque.navegador == []
    assert "No se pudieron instalar las dependencias. ¿Hay conexión a internet?" in capsys.readouterr().out


def test_instalar_sdk_y_salir(monkeypatch, arranque):
    assert _main(monkeypatch, "--instalar-sdk") == 7
    assert arranque.sdk == [arranque.py]
    assert arranque.herramientas.call == [] and arranque.navegador == []


def test_instalar_sdk_sin_internet(monkeypatch, arranque, capsys):
    arranque.error = subprocess.CalledProcessError(1, ["pip"])
    assert _main(monkeypatch, "--instalar-sdk") == 1
    assert arranque.sdk == []
    assert "No se pudieron instalar las dependencias. ¿Hay conexión a internet?" in capsys.readouterr().out


def test_python_viejo_corta_antes_de_hacer_nada(monkeypatch, arranque):
    def viejo():
        raise SystemExit("Hace falta Python 3.10")

    monkeypatch.setattr(iniciar, "verificar_python", viejo)
    with pytest.raises(SystemExit):
        _main(monkeypatch)
    assert arranque.preparado == 0


def test_ejecutado_como_script(monkeypatch):
    """`python iniciar.py` llama a main(); con un Python viejo sale antes de tocar el disco."""
    monkeypatch.setattr(sys, "version_info", (3, 9, 0, "final", 0))
    monkeypatch.setattr(sys, "argv", ["iniciar.py"])
    with pytest.raises(SystemExit) as e:
        runpy.run_path(str(RAIZ / "iniciar.py"), run_name="__main__")
    assert "Hace falta Python 3.10 o superior (tenés 3.9.0)." in str(e.value.code)
