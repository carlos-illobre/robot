# Dashboard de telemetría + backend + SDK de Unitree (para el robot real), en una imagen.
#
#   docker compose -f docker/docker-compose.yml up demo     (ver docker/README.md)
#
# Dos etapas:
#   1. "sdk": compila CycloneDDS (la librería de comunicación del robot, que el
#      SDK de Unitree exige compilar desde el código fuente) y arma los paquetes
#      de Python del SDK.
#   2. la imagen final: solo copia lo compilado (sin compiladores) y el proyecto.
#
# Python 3.10 es la versión que recomienda Unitree para su SDK.

ARG PYTHON_IMAGE=python:3.10-slim

# ---------------------------------------------------------------- etapa 1
FROM ${PYTHON_IMAGE} AS sdk

RUN apt-get update \
 && apt-get install -y --no-install-recommends git cmake build-essential \
 && rm -rf /var/lib/apt/lists/*

# CycloneDDS 0.10.x: la versión que usa el SDK de Unitree (cyclonedds==0.10.2).
RUN git clone --depth 1 --branch releases/0.10.x https://github.com/eclipse-cyclonedds/cyclonedds /src/cyclonedds \
 && cmake -S /src/cyclonedds -B /src/build \
      -DCMAKE_INSTALL_PREFIX=/opt/cyclonedds -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_EXAMPLES=OFF -DBUILD_TESTING=OFF -DENABLE_SSL=OFF \
 && cmake --build /src/build --target install -j"$(nproc)" \
 && rm -rf /src

# El simulador MuJoCo de la cátedra (opcional, se usa con SIMULADOR=go2|g1): se descarga
# de su repositorio en el momento de construir la imagen; no se copia a este repo.
ARG CATEDRA_REPO=https://github.com/tsamaan/UadeRobotLab
RUN git clone --depth 1 --filter=blob:none --sparse "$CATEDRA_REPO" /src/lab \
 && cd /src/lab && git sparse-checkout set 05LaboratoriosTPs/TP05_Desarrollo_de_Aplicaciones_II/entorno/sim \
 && mkdir -p /opt/catedra/entorno \
 && mv 05LaboratoriosTPs/TP05_Desarrollo_de_Aplicaciones_II/entorno/sim /opt/catedra/entorno/sim \
 && rm -rf /src/lab

ENV CYCLONEDDS_HOME=/opt/cyclonedds
# Paquetes ("wheels") del SDK y de todas sus dependencias, listos para instalar sin compilar.
RUN pip wheel --no-cache-dir --wheel-dir /wheels \
      "git+https://github.com/unitreerobotics/unitree_sdk2_python.git"

# ---------------------------------------------------------------- etapa 2
FROM ${PYTHON_IMAGE}

COPY --from=sdk /opt/cyclonedds /opt/cyclonedds
COPY --from=sdk /opt/catedra /opt/catedra
COPY --from=sdk /wheels /tmp/wheels
ENV CYCLONEDDS_HOME=/opt/cyclonedds \
    LD_LIBRARY_PATH=/opt/cyclonedds/lib \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir /tmp/wheels/*.whl \
 && pip install --no-cache-dir "fastapi>=0.110" "uvicorn[standard]>=0.29" mujoco numpy \
 && rm -rf /tmp/wheels \
 && python -c "import unitree_sdk2py, cyclonedds, mujoco; print('SDK de Unitree y MuJoCo OK')"

WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend
COPY docker/entrypoint.py ./docker/entrypoint.py

EXPOSE 8001
# SIMULADOR=go2|g1 levanta además el simulador de la cátedra, sin ventana.
# Por defecto, modo demo. Para el robot real: --real --robot go2 --interfaz enp3s0
ENTRYPOINT ["python", "docker/entrypoint.py", "--host", "0.0.0.0", "--puerto", "8001"]
CMD ["--demo"]
