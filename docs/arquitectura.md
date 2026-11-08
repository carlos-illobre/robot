# Arquitectura

Diagramas del sistema, del más general al más particular (al estilo del
[modelo C4](https://c4model.com/)). Todos están en [Mermaid](https://mermaid.js.org/): GitHub los
dibuja solo y, como son texto, se revisan en el mismo diff que el código. El **porqué** de cada
pieza está en los [ADR](adr/README.md).

| Diagrama | Responde | Decisiones |
|---|---|---|
| [Contexto](#contexto) | ¿Quién usa el sistema y con qué sistemas externos habla? | — |
| [Contenedores](#contenedores) | ¿Qué piezas se ejecutan y por dónde se comunican? | [0010](adr/0010-el-backend-sirve-el-frontend.md), [0012](adr/0012-transporte-intercambiable.md) |
| [Despliegue](#despliegue) | ¿Dónde corre cada pieza? | [0007](adr/0007-reportes-en-github-pages.md), [0022](adr/0022-arranque-con-un-script-en-python.md) |
| [Componentes y una muestra](#componentes-y-recorrido-de-una-muestra) | ¿Qué hace cada módulo con un dato? | [0011](adr/0011-patrones-adapter-observer-facade.md), [0014](adr/0014-rendimiento-del-dibujo.md) |
| [Clases de los patrones](#clases-de-los-patrones) | ¿Cómo están armados Adapter, Observer, Facade, Strategy y Factory Method? | [0011](adr/0011-patrones-adapter-observer-facade.md), [0012](adr/0012-transporte-intercambiable.md), [0016](adr/0016-vistas-como-estrategias.md), [0019](adr/0019-fuente-de-datos-inyectada-y-cambio-en-caliente.md) |
| [Estados de la conexión](#estados-de-la-conexión) | ¿Qué muestra el indicador de conexión y qué lo cambia? | [0013](adr/0013-polling-encadenado-y-backoff.md) |
| [Cambio de fuente en caliente](#cambio-de-fuente-en-caliente) | ¿Cómo se pasa de la demo al robot sin quedar a ciegas? | [0019](adr/0019-fuente-de-datos-inyectada-y-cambio-en-caliente.md) |
| [Capas del cliente](#capas-del-cliente) | ¿Qué módulo puede depender de cuál? | [0015](adr/0015-nucleo-sin-dom.md) |
| [Entrega](#entrega-de-un-cambio) | ¿Qué le pasa a un cambio desde el branch hasta GitHub Pages? | [0003](adr/0003-historial-git-profesional.md), [0007](adr/0007-reportes-en-github-pages.md) |

---

## Contexto

```mermaid
flowchart TB
  Est(["👩‍🎓 Estudiante / operador<br/>usa el dashboard en clase"])
  Doc(["👨‍🏫 Docente<br/>evalúa el TP y los reportes"])
  Sys["📊 Dashboard de telemetría Unitree<br/>backend FastAPI + frontend web"]
  Robot["🤖 Robot Unitree Go2 o G1<br/>publica su estado por DDS"]
  Sim["🧪 Simulador MuJoCo de la cátedra<br/>publica el estado simulado"]
  GH["🐙 GitHub<br/>repositorio, Actions y Pages"]

  Est -- "navegador: ve telemetría, captura, exporta CSV" --> Sys
  Doc -- "navegador: dashboard, cobertura, mutación" --> GH
  Sys -- "lee (solo lectura) por cable de red" --> Robot
  Sys -- "lee por socket local" --> Sim
  GH -- "publica /app (sin servidor) y /coverage" --> Doc
```

El sistema **solo lee**: ninguna ruta de la API mueve al robot.

## Contenedores

```mermaid
flowchart LR
  subgraph Navegador["Navegador (PC, proyector o celular)"]
    FE["Frontend<br/>HTML + módulos ES<br/>frontend/"]
  end
  subgraph Notebook["Notebook del laboratorio · python iniciar.py"]
    BE["Backend FastAPI<br/>backend/servidor.py"]
    ST[("Archivos estáticos<br/>/dashboard")]
    LEC["Lector de la fuente activa<br/>DDS · simulador · demo"]
  end
  RB["Robot<br/>DDS LowState"]

  FE -- "GET /dashboard/* (HTML, JS, modelos 3D)" --> ST
  FE -- "WS /ws · push 10 Hz" --> BE
  FE -- "GET /telemetria · pull" --> BE
  FE -- "GET /info, GET /fuentes, POST /fuente" --> BE
  BE --- ST
  BE -- "obtener_snapshot()" --> LEC
  LEC -- "DDS por cable (modo real)" --> RB
```

El contrato entre frontend y backend es [`docs/API.md`](API.md).

## Despliegue

```mermaid
flowchart LR
  subgraph Lab["Laboratorio"]
    direction LR
    R["🤖 Robot"] -- "cable RJ-45 · DDS" --> N
    subgraph N["💻 Notebook Linux · puerto 8001"]
      direction TB
      P1["Opción A · python iniciar.py<br/>venv + backend"]
      P2["Opción B · docker compose<br/>imagen con SDK + MuJoCo<br/>network_mode: host"]
    end
    W["📱 💻 📽 Navegadores<br/>de la misma red"] -- "IP de la notebook, puerto 8001" --> N
  end
  subgraph Nube["GitHub"]
    direction TB
    A["Actions · ci.yml<br/>pruebas en cada push"]
    PG["Actions · pages.yml<br/>solo main"]
    S[("GitHub Pages<br/>/ maquetas<br/>/app dashboard con simulador<br/>/coverage reportes")]
    PG --> S
  end
  D["👨‍🏫 Docente"] -- "navegador" --> S
```

En GitHub Pages no hay backend: `/app/` usa `SimTransport`, el simulador del navegador, con la
misma interfaz que los transportes reales.

## Componentes y recorrido de una muestra

Los diagramas de componentes y de la secuencia de una muestra por WebSocket están en el README,
sección [Arquitectura](../README.md#-arquitectura).

## Clases de los patrones

```mermaid
classDiagram
  direction LR

  class TelemetryService {
    <<Facade>>
    +connect(options)
    +setTransport(name, intervalMs)
    +disconnect()
    +refreshInfo()
    +stats()
    -onData(raw, meta)
    -checkStale()
  }
  class Transport {
    <<interface · Strategy>>
    +name
    +start()
    +stop()
    onData(raw, meta)
    onState(state, detail)
  }
  class WebSocketTransport {
    +backoffDelay(attempt, min, max, random)$
  }
  class PollingTransport
  class SimTransport {
    +info()
  }
  class ApiClient {
    +info()
    +telemetria()
    +fuentes()
    +cambiarFuente(pedido)
  }
  class EventBus {
    <<Observer>>
    +on(event, handler) unsubscribe
    +off(event, handler)
    +emit(event, payload)
  }
  class normalizeFrame {
    <<Adapter · función>>
    raw JSON → frame + derived
  }
  class View {
    <<interface · Strategy>>
    +mount(container)
    +setInfo(info)
    +update(frame)
    +destroy()
  }
  class ConsoleView
  class BodyView
  class PilotView
  class TwinView
  class ManualView

  Transport <|.. WebSocketTransport
  Transport <|.. PollingTransport
  Transport <|.. SimTransport
  TelemetryService o--> Transport : elige en tiempo de ejecución
  TelemetryService --> ApiClient : /info
  TelemetryService ..> normalizeFrame : cada muestra
  TelemetryService --> EventBus : emit frame, connection, info, stats
  PollingTransport --> ApiClient
  View <|.. ConsoleView
  View <|.. BodyView
  View <|.. PilotView
  View <|.. TwinView
  View <|.. ManualView
  EventBus ..> View : main.js reenvía la última muestra por cuadro
```

Del lado del servidor:

```mermaid
classDiagram
  direction LR
  class Lector {
    <<interface>>
    +obtener_snapshot() dict
    +esperar_primer_dato(timeout) bool
    +mensajes_leidos int
    +cerrar()
  }
  class LectorDDS {
    telemetry_reader_dds.TelemetryReader
    robot real · unitree_sdk2py
  }
  class LectorSimulador {
    telemetry_reader.TelemetryReader
    simulador MuJoCo · socket
  }
  class OrdenSimulador {
    <<Adapter>>
    reordena patas del Go2
  }
  class PaseoDemoReader {
    demo con física coherente
  }
  class DemoReader {
    demo de la cátedra
  }
  class servidor {
    <<Factory Method>>
    +crear_lector(modo, robot, interfaz) Lector
  }
  class telemetry_server {
    +configurar(lector, modelo, modo)
    GET /telemetria · WS /ws · GET /info
  }
  class telemetry_adapter {
    <<Adapter>>
    +adaptar_telemetria(snapshot) dict
  }
  class fuentes {
    +crear_router(crear_lector, configurar, estado)
    GET /fuentes · POST /fuente
  }

  Lector <|.. LectorDDS
  Lector <|.. LectorSimulador
  Lector <|.. OrdenSimulador
  Lector <|.. PaseoDemoReader
  Lector <|.. DemoReader
  OrdenSimulador o--> LectorSimulador : envuelve
  servidor ..> Lector : crea
  telemetry_server o--> Lector : inyectado
  telemetry_server ..> telemetry_adapter
  fuentes ..> servidor : recibe crear_lector
  fuentes ..> telemetry_server : recibe configurar
```

## Estados de la conexión

Lo que muestra el indicador de conexión de la barra superior (`TelemetryService` publica
`connection` en el `EventBus`):

```mermaid
stateDiagram-v2
  [*] --> offline
  offline --> connecting : connect()
  connecting --> live : primera muestra / WS abierto
  connecting --> reconnecting : error o cierre
  live --> stale : sin muestras hace más de 2 s
  stale --> live : llega una muestra
  live --> reconnecting : WS cerrado / petición fallida
  stale --> reconnecting : WS cerrado / petición fallida
  reconnecting --> connecting : vence la espera (WS)
  reconnecting --> live : la siguiente petición responde (polling)
  connecting --> offline : disconnect()
  live --> offline : disconnect()
  stale --> offline : disconnect()
  reconnecting --> offline : disconnect()
  note right of reconnecting
    WebSocket espera min(8 s, 0,5 s · 2^n) ± 25 %
    Polling reintenta en el próximo intervalo
  end note
```

`setTransport()` vuelve a `connecting` con la nueva estrategia sin perder el historial.

## Cambio de fuente en caliente

```mermaid
sequenceDiagram
  autonumber
  actor U as Operador
  participant FE as Dashboard
  participant F as fuentes.py · POST /fuente
  participant Fab as crear_lector()
  participant N as Lector nuevo (robot)
  participant S as telemetry_server
  participant V as Lector viejo (demo)

  U->>FE: elige "Robot real · go2 · eth0"
  FE->>F: POST /fuente {modo, robot, interfaz}
  F->>F: ¿fuente fija? ¿disponible? (SDK, simulador)
  F->>F: toma el candado
  F->>Fab: crear_lector("real", "go2", "eth0")
  Fab-->>F: lector nuevo
  F->>N: esperar_primer_dato(5 s)
  alt llega un dato
    N-->>F: true
    F->>S: configurar(nuevo, "go2", "real")
    F->>V: cerrar()
    F-->>FE: 200 · fuentes con la nueva activa
  else no responde en 5 s
    N-->>F: false
    F->>N: cerrar()
    F-->>FE: 504 · "Se mantiene la anterior"
    Note over FE,V: los dashboards siguen viendo la demo
  end
```

## Capas del cliente

```mermaid
flowchart TB
  M["Composición · js/main.js<br/>crea y conecta todo"]
  V["Vistas · js/views/<br/>Consola · Cuerpo · Piloto · Gemelo 3D · Manual"]
  U["UI común · js/ui/, js/shell/<br/>gráficos, avisos, tema, barra"]
  S["Servicios · js/services/<br/>TelemetryService, transportes, ApiClient"]
  C["Núcleo · js/core/<br/>modelo, EventBus, RingBuffer, capturas, CSV, alarmas<br/>sin DOM"]
  M --> V & U & S & C
  V --> U & C
  U --> C
  S --> C
```

Las flechas son dependencias permitidas: nadie depende de una capa de arriba, y el núcleo no conoce
el navegador.

## Entrega de un cambio

```mermaid
flowchart LR
  A["Branch tipo/descripcion<br/>desde main"] --> B["docs(spec)<br/>spec, plan, tasks"]
  B --> C["test(...)<br/>pruebas que fallan"]
  C --> D["feat / fix<br/>Spec: NNN · FR-…"]
  D --> E{"Definición de terminado<br/>test:all · cobertura 100 %<br/>mutación ≥ umbral"}
  E -- no --> C
  E -- sí --> F["git merge --no-ff<br/>a main"]
  F --> G["push"]
  G --> H["ci.yml<br/>backend 3.10 y 3.12 · frontend · E2E"]
  G --> I["pages.yml (solo main)<br/>cobertura + Stryker + mutmut"]
  I --> J[("GitHub Pages<br/>/app · /coverage")]
```
