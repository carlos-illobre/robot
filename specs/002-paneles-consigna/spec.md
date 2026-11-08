# Especificación 002: Los cuatro paneles de la consigna

| | |
|---|---|
| **Estado** | ✅ Implementada (especificación retroactiva) |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Consigna, puntos 1 a 4 · Vista Consola |

## Contexto y problema

La consigna exige cuatro paneles funcionales que repliquen electroSim: motores, IMU, BMS y fuerzas
por pata.

## Historias de usuario

### HU-1 · Detectar un motor caliente (P1)

**Como** operador **quiero** ver la temperatura de cada motor con un semáforo **para** detectar de un
vistazo cuál se está calentando.

1. **Dado** un motor a 39,9 °C, **entonces** se ve verde; a 40 °C amarillo; a 60 °C amarillo; a 60,1 °C rojo.
2. **Dado** un Go2, **entonces** la tabla tiene 12 filas; **dado** un G1, 29.

### HU-2 · Ver la orientación del robot (P1)

1. **Dado** que llegan muestras, **entonces** se ven roll, pitch y yaw numéricos y un gráfico de al menos 60 muestras.

### HU-3 · Ver la batería (P1)

1. **Entonces** se ven carga (%), corriente (mA), temperatura y el voltaje de cada celda.

### HU-4 · Ver qué patas apoyan (P1)

1. **Entonces** hay un indicador de contacto para FR, FL, RR y RL.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | Semáforo: verde < 40 °C, amarillo 40–60 °C, rojo > 60 °C | `core.test.js` › "semáforo de temperatura igual a electroSim" |
| FR-002 | La cantidad de motores sale de `GET /info`, nunca se asume | `test_api.py` › `test_info_coincide_con_el_robot` |
| FR-003 | Gráfico IMU con ≥ 60 muestras (Consola: 150) | pruebas de las vistas |
| FR-004 | Panel BMS con SOC, corriente, temperatura y celdas | pruebas de las vistas |
| FR-005 | Indicadores de contacto FR, FL, RR, RL | `test_api.py` › `test_quieto_apoya_las_cuatro_patas_y_caminando_no` |
| FR-006 | Alarmas de temperatura con histéresis (no titilan alrededor de 60 °C) | `core.test.js` › "alarmas con histéresis" |

## Código

`frontend/js/views/console/*.js`, `frontend/js/core/telemetryModel.js`, `frontend/js/core/alerts.js`.
