# 🐳 Versión dockerizada (con el SDK de Unitree incluido)

> **Opcional.** La forma recomendada de usar el proyecto sigue siendo `python iniciar.py` (ver el
> [README principal](../README.md)). Esta carpeta es una alternativa para quien prefiere Docker,
> o para no tener que instalar el SDK de Unitree a mano: **la imagen ya lo trae compilado**.

## Qué trae la imagen

| Pieza | Detalle |
|---|---|
| Python 3.10 | La versión que recomienda Unitree para su SDK |
| CycloneDDS 0.10.x | La librería de comunicación del robot, **compilada** (el SDK lo exige) |
| SDK de Unitree (`unitree_sdk2py`) | Ya instalado: en el panel de fuentes, **Robot real** aparece habilitado |
| Backend + dashboard | Los mismos de siempre (`backend/` y `frontend/`) |

Se arma en dos etapas: la primera compila CycloneDDS y el SDK; la imagen final solo copia lo
compilado, sin compiladores.

## Requisitos

- [Docker](https://docs.docker.com/get-docker/) (con `docker compose`).
- **Para el robot real: Linux.** El contenedor tiene que usar la red del equipo
  (`network_mode: host`) para que DDS vea la placa conectada al robot, y eso solo funciona igual
  que sin Docker en Linux. En Windows y macOS, Docker corre dentro de una máquina virtual y no ve
  el cable del robot: ahí sirve **solo para el modo demo**.

## Uso

Todos los comandos se corren desde la **carpeta raíz** del proyecto.

### Modo demo (cualquier sistema)

```bash
docker compose -f docker/docker-compose.yml up --build demo
```

Abrir **http://localhost:8001**. Con el G1:

```bash
ROBOT=g1 docker compose -f docker/docker-compose.yml up --build demo
```

### Robot real (Linux, en la notebook conectada al robot)

Antes: conectar el cable, encender el robot y darle a la placa del cable una IP de la red del
robot (paso 4 de la [guía del README](../README.md#-usar-el-dashboard-con-el-robot-real--paso-a-paso)).
Después, indicando el modelo y la placa de red:

```bash
ROBOT=go2 INTERFAZ=enp3s0 docker compose -f docker/docker-compose.yml --profile robot up --build robot
```

(`ip -br addr` muestra el nombre de la placa; es la que tiene una IP `192.168.123.x`. Si no se
indica `INTERFAZ`, la elige el SDK automáticamente.)

Abrir **http://localhost:8001**: la etiqueta de arriba dice **Real**, en verde. Las otras
computadoras del aula usan `http://IP-DE-LA-NOTEBOOK:8001`.

También se puede arrancar en demo y elegir **Robot real** desde el panel del dashboard (clic en
*Simulado ▾*), siempre que el contenedor use la red del equipo (el servicio `robot`, o
`--network host`).

### Sin docker compose

```bash
docker build -f docker/Dockerfile -t tp05-dashboard .
```

```bash
docker run --rm -p 8001:8001 tp05-dashboard
```

```bash
docker run --rm --network host tp05-dashboard --real --robot go2 --interfaz enp3s0
```

Todo lo que va después del nombre de la imagen son opciones de `backend/servidor.py`
(`--demo`, `--real`, `--robot`, `--interfaz`, `--fuente-fija`, `--puerto`).

## Problemas frecuentes

| Qué pasa | Qué hacer |
|---|---|
| `429 Too Many Requests` al descargar `python:3.10-slim` | Docker Hub limita las descargas desde IPs compartidas. Usar el espejo de Google: `docker build --build-arg PYTHON_IMAGE=mirror.gcr.io/library/python:3.10-slim -f docker/Dockerfile -t tp05-dashboard .` |
| «No llegan datos del robot por DDS» | El contenedor no ve al robot: ¿se usó la red del equipo (`--network host` / servicio `robot`)? ¿Es Linux? ¿La placa es la correcta y tiene IP `192.168.123.x`? |
| En Windows/macOS «Robot real» no recibe datos | Es esperable: Docker Desktop no comparte la placa del cable. Usar `python iniciar.py` en esa máquina, o una notebook con Linux |
| La primera construcción tarda | Compila CycloneDDS (unos minutos). Las siguientes reutilizan la caché |

## Qué se probó y qué no

- ✅ La imagen se construye y el SDK queda instalado (`import unitree_sdk2py, cyclonedds`).
- ✅ Modo demo: el backend responde, sirve el dashboard y **Robot real** aparece habilitado en el
  panel.
- ✅ Modo real **sin robot conectado**: inicializa DDS sobre la placa elegida, espera y avisa que no
  llegan datos (sin colgarse).
- ⚠️ **No se probó con un robot real** (no había uno disponible al prepararla): conviene hacer una
  prueba en el laboratorio antes del día de la presentación.
