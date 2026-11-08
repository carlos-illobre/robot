# Especificación 005: Fuentes de datos intercambiables

| | |
|---|---|
| **Estado** | ✅ Implementada (especificación retroactiva) |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Consigna: "Modalidad tecnológica" (modo demo y robot real) |

## Historias de usuario

### HU-1 · Desarrollar sin el robot (P1)

1. **Dado** `python backend/servidor.py --demo`, **entonces** los datos varían de forma realista y recorren los tres colores del semáforo.
2. **Dado** GitHub Pages (sin servidor), **entonces** el dashboard usa la simulación del navegador con el mismo contrato.

### HU-2 · Cambiar de fuente sin reiniciar (P1)

1. **Dado** el panel de fuentes, **cuando** elijo robot real, MuJoCo o demo, y Go2 o G1, **entonces** el backend cambia en caliente.
2. **Dado** que el servidor se lanzó con una fuente fija, **entonces** no se puede cambiar y lo dice.
3. **Dado** `--real` sin el SDK de Unitree, **entonces** falla con un mensaje que explica cómo instalarlo.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | Demo "paseo" con marcha, modelo térmico y batería | `test_api.py` › `test_paseo_recorre_los_tres_colores_del_semaforo`, `test_yaw_cambia_al_girar` |
| FR-002 | Cambio de fuente en caliente | `test_api.py` › `test_cambiar_la_fuente_en_caliente`; E2E "Go2 → G1 → Go2" |
| FR-003 | Fuente fija no se puede cambiar | `test_api.py` › `test_fuente_fija_no_se_puede_cambiar` |
| FR-004 | `--real` sin SDK falla con mensaje claro | `test_api.py` › `test_modo_real_sin_sdk_falla_con_un_mensaje_claro` |
| FR-005 | La simulación del navegador cumple el contrato | `sim.test.js` › "respeta el contrato…" |

## Código

`backend/servidor.py`, `backend/fuentes.py`, `backend/api/telemetry_reader*.py`,
`backend/api/demo_paseo.py`, `frontend/js/core/paseoSim.js`, `frontend/js/services/SimTransport.js`.
