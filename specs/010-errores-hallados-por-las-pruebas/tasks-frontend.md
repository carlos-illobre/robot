# Tareas · Especificación 010 · Frontend

Cada FR tiene una prueba unitaria que falló antes del arreglo y pasa después.

- [x] FR-001 «Fuente de datos…» deja abierto el panel (el clic ya no llega al «clic afuera» de `document`) — `frontend/tests/shell/AppBar.test.js` › "FR-001: «Fuente de datos…» cierra el menú y deja abierto el panel en la fuente"
- [x] FR-002 Sin destello al entrar a la consola con capturas previas — `frontend/tests/consola/ConsoleView.test.js` › "FR-002: con capturas previas cuya última es manual, entrar a la vista no destella"
- [x] FR-003 «Borrar la captura» en singular — `frontend/tests/consola/ConsoleView.test.js` › "FR-003: con una captura dice «Borrar la captura»; con más, «Borrar las N capturas»"
- [x] FR-004 «1 muestra» en el panel IMU — `frontend/tests/consola/ImuPanel.test.js` › "FR-004: con una sola muestra dice «1 muestra» y el eje X muestra al menos 1 s"
- [x] FR-005 Sin `−0` en `grouped()` — `frontend/tests/consola/util.test.js` › "FR-005: grouped(%s), que redondea a cero, da «0» sin signo"
- [x] FR-005 Sin `−0 mA` en `milliamps()` del Cuerpo — `frontend/tests/cuerpo/format.test.js` › "FR-005: %s mA, que redondea a cero, da «0 mA» sin signo"
- [x] FR-005 Sin `−0 mA` en `milliamps()` del Piloto — `frontend/tests/piloto/format.test.js` › "FR-005: %s mA, que redondea a cero, da «0 mA» sin signo"
- [x] FR-006 «1 tibio» en la línea de estado del Piloto — `frontend/tests/piloto/PilotView.test.js` › "FR-006: con un solo motor tibio la línea de estado dice «1 tibio»"
- [x] FR-006 «1 tibio · 1 caliente» en la escala térmica — `frontend/tests/piloto/instruments.test.js` › "FR-006: con un motor tibio y uno caliente, la escala dice «1 tibio · 1 caliente»"
- [ ] FR-007 No es un error observable: `normalizeFrame` garantiza que `bms.corriente` es un número (sin dato → 0), así que el Piloto nunca recibe una corriente no numérica. No se cambió.
- [x] FR-008 Anillo de motores sin `stroke-width="NaN"` con umbral 0 — `frontend/tests/piloto/MotorRing.test.js` › "FR-008: con umbral de torque 0 el ancho es válido (escala con umbral mínimo de 1 N·m)"
- [x] FR-009 La línea de tiempo cuenta las muestras sin tamaño (`Timeline`) — `frontend/tests/cuerpo/timeline.test.js` › "FR-009: si el lienzo no tiene tamaño solo lo limpia, pero cuenta las muestras"
- [x] FR-009 El subtítulo del Cuerpo dice la cuenta real — `frontend/tests/cuerpo/BodyView.test.js` › "FR-009: sin tamaño todavía, la línea de tiempo dice la cuenta real de muestras"
- [x] FR-010 `onTheme()` después de `destroy()` no hace nada — `frontend/tests/cuerpo/BodyView.test.js` › "FR-010: onTheme() después de destroy() no hace nada"
- [x] FR-011 Un solo ciclo de polling tras `stop()` + `start()` — `frontend/tests/nucleo/PollingTransport.test.js` › "FR-011: stop() + start() con un pedido en vuelo deja un solo ciclo de polling"
- [x] FR-011 Se descarta la respuesta tardía del pedido abortado — `frontend/tests/nucleo/PollingTransport.test.js` › "FR-011: la respuesta tardía de un pedido abortado se descarta tras volver a arrancar"
- [x] FR-012 Sin temporizador de «sin datos» si se desconecta durante `/info` — `frontend/tests/nucleo/TelemetryService.test.js` › "FR-012: si se desconecta mientras espera /info, no crea el temporizador de «sin datos»"
