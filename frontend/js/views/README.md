# Contrato de las vistas

El dashboard tiene **cuatro vistas** (Consola, Cuerpo, Piloto, Gemelo 3D) que muestran **los mismos
datos** de la misma conexión. Cambiar de vista no corta la conexión, no borra el historial ni las
capturas: solo cambia la *estrategia de presentación* (patrón **Strategy**).

Cada vista es una clase en `js/views/<id>/<Nombre>View.js`, exportada por defecto, con sus estilos
en `css/views/<id>.css` **siempre anidados bajo `.view-<id>`** (el contenedor recibe esa clase), y
registrada en `js/views/registry.js`.

## El contexto que recibe

```js
constructor(ctx)
// ctx = {
//   state,     // estado compartido, SOLO LECTURA (ver abajo)
//   actions,   // lo único que la vista puede "hacer"
//   history,   // RingBuffer con las últimas 600 muestras normalizadas (≈ 60 s)
//   captures,  // CaptureStore: .size, .samples, .subscribe(fn) → desuscribir
//   bus,       // EventBus (normalmente no hace falta: el gestor llama a los hooks)
//   service,   // TelemetryService (no usarlo para conectar: usar actions)
// }
```

### `state` (solo lectura)

| Campo | Qué es |
|---|---|
| `info` | respuesta de `GET /info`: `{ modelo, nombre, tipo, n_motores, motores_nombres, patas, frecuencia_hz, modo }` |
| `latest` | la última muestra normalizada (ver forma abajo) |
| `paused`, `recording` | booleanos |
| `connection` | `{ state: "live"|"connecting"|"reconnecting"|"stale"|"offline", detail, transport, baseUrl }` |
| `stats` | `{ hz, gapMs, rttMs, frames, errors }` |
| `alerts` | alarmas activas `[{ key, level: "warn"|"crit", message }]` |
| `events` | bitácora, la más nueva primero `[{ at: Date, level, message }]` |
| `torqueAlarm` | umbral de alarma de torque en N·m |
| `excel` | si el CSV se exporta en formato Excel en castellano |
| `figure` | ilustración del robot: `"esquema"` (SVG de la vista) o `"3d"` (modelo real); tecla **G** |
| `transport`, `intervalMs`, `baseUrl` | configuración de la conexión |

### `actions`

`capture()` · `toggleRecording()` · `exportCsv({ excel })` · `exportJson()` · `clearCaptures()` ·
`setExcel(bool)` · `togglePause()` · `setTransport("websocket"|"polling", ms)` ·
`toggleTransport()` · `setTorqueAlarm(nm)` · `setFigureMode("esquema"|"3d")` · `toggleFigure()` ·
`toggleTheme()` · `openHelp()` · `switchView(id)`.

Las teclas globales (**C** capturar, **R** grabar, **E** exportar, **Espacio** pausar, **W**
transporte, **T** tema, **1–4** vistas, **?** ayuda) ya las maneja `main.js`. Una vista **no** las
vuelve a registrar.

## Ciclo de vida (lo llama `main.js`)

| Método | Obligatorio | Cuándo |
|---|:---:|---|
| `mount(container)` | ✅ | al entrar a la vista; construir el DOM dentro de `container` |
| `setInfo(info)` | ✅ | al conectar o si cambió el robot (Go2 ↔ G1): reconstruir lo que dependa de los motores |
| `update(frame)` | ✅ | en un `requestAnimationFrame`, con la última muestra (≤ 60 veces por segundo, normalmente 10) |
| `destroy()` | ✅ | al salir: cancelar timers, `requestAnimationFrame`, `ResizeObserver`, gráficos, suscripciones |
| `onConnection(conn)` | | cambió el estado de la conexión |
| `onStats(stats)` | | cada 500 ms |
| `onAlerts({ raised, cleared, active })` | | se activó o normalizó una alarma |
| `onRecording(bool)`, `onPause(bool)` | | |
| `onEvent(ev)` | | nueva entrada en la bitácora |
| `onTheme(theme)` | | cambió el tema (`"dark"` / `"light"`, en `<html data-theme>`) |
| `onFigureMode(mode)` | | cambió la ilustración: `"esquema"` o `"3d"` (ver `ui/FigureSwitch.js`) |
| `onKey(event)` → `true` si la consumió | | teclas propias de la vista (antes que las globales) |
| `static id`, `static shortcuts = [["M", "Abrir tabla"], …]` | | para la ayuda |

## La muestra normalizada (`frame`)

```js
{
  modelo: "go2", ts: 16.24, receivedAt: 1730222222222,
  motores: [{ id, nombre, angulo /*°*/, velocidad /*rad/s*/, torque /*N·m*/, temperatura /*°C*/ }],
  imu: { roll, pitch, yaw /*°*/, ax, ay, az /*m/s²*/ },
  bms: { soc /*%*/, corriente /*mA*/, temperatura /*°C*/, celdas: [/*V*/] },
  fuerzas: { FR: 1, FL: 0, RR: 0, RL: 1 },        // G1: { R_foot, L_foot }
  derived: { tempMax: {value, motor}, torqueMax: {value, motor}, tempLevels: {ok, warn, crit},
             meanSpeed, isMoving, contacts, legs, packVoltage, powerW,
             cellMin, cellMax, cellDeltaMv, tilt },
}
```

Helpers disponibles: `tempLevel(°C)` → `"ok"|"warn"|"crit"` y `socLevel`, `motorGroup(nombre)`,
`jointLabel(nombre)`, `LEG_LABELS` (en `core/telemetryModel.js`); `h()`, `s()`, `setText()`,
`fmt()`, `clamp()` (en `ui/dom.js`); `icon(nombre)` (en `ui/icons.js`); `createLineChart()`,
`drawSparkline()` (en `ui/charts.js`, Chart.js local en `globalThis.Chart`); `toast()`.

## Esquema | 3D real

`ui/FigureSwitch.js` permite que una vista muestre su dibujo SVG del robot **o** el modelo 3D
real de Unitree (el mismo componente `RobotScene` del Gemelo 3D, con fondo transparente):

```js
this.fig = new FigureSwitch(ctx, { host, schematic, preset: "arriba" });
header.append(figureToggle(ctx));          // botón "Esquema | 3D real"
// setInfo → this.fig.setInfo(info) · update → this.fig.update(frame)
// onFigureMode(m) → this.fig.setMode(m); toggle.set(m) · destroy → this.fig.destroy()
```

El módulo 3D se descarga recién la primera vez que alguien elige "3D real".

## Reglas

- **Semáforo** obligatorio e idéntico en todas: verde < 40 °C, amarillo 40–60 °C, rojo > 60 °C
  (`tempLevel`), con los colores `--sem-ok`, `--sem-warn`, `--sem-crit`.
- **Go2 y G1**: nada de 12 motores fijos. Todo sale de `info.motores_nombres` e `info.patas`.
  Nombres del G1: `L_hip_yaw`, `L_hip_roll`, `L_hip_pitch`, `L_knee`, `L_ankle_pitch`,
  `L_ankle_roll`, igual con `R_`, `torso_yaw/roll/pitch`, `L_shoulder_pitch/roll/yaw`, `L_elbow`,
  `L_wrist_roll/pitch/yaw`, igual con `R_`. Patas del G1: `R_foot`, `L_foot`.
- **Rendimiento**: `update()` corre a 10 Hz con 29 motores. Crear el DOM una vez en
  `mount`/`setInfo` y después solo actualizar textos, atributos y `transform`. Nada de
  `innerHTML` en `update()`.
- **Animaciones** de la interfaz solo con `transform` y `opacity`; respetar
  `prefers-reduced-motion`.
- **Accesible**: botones de verdad (`<button>`), `aria-label` en los íconos, contraste suficiente
  en los dos temas.
- **Celular**: tiene que verse bien a 390 px de ancho.
