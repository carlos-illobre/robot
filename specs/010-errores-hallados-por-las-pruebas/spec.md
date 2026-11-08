# Especificación 010: Errores hallados al llevar la cobertura al 100 %

| | |
|---|---|
| **Branch** | `fix/hallazgos-frontend` · `fix/hallazgos-backend` |
| **Estado** | 🔄 En curso |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Especificación 007 |

## Contexto

Escribir pruebas unitarias para cada rama del código (spec 007) obligó a mirar casos que nadie
había ejercitado. Aparecieron **17 errores reales**. Durante la spec 007 se documentaron sin
corregirlos (las pruebas de cobertura no cambian comportamiento). Esta especificación los corrige,
**cada uno con una prueba que falla antes del arreglo**.

## Requisitos funcionales

### Frontend

| ID | Dónde | Error | Comportamiento esperado |
|---|---|---|---|
| FR-001 | Barra (`AppBar`) | El botón «Fuente de datos…» del menú del robot abre el panel y el mismo clic lo cierra (el clic sigue hasta `document`, donde se interpreta como "clic afuera") | El panel queda abierto |
| FR-002 | Consola | Al entrar a la vista con capturas previas cuya última es manual, se dispara el destello de "foto" | El destello solo aparece con una captura nueva |
| FR-003 | Consola | «Borrar las 1 capturas» | «Borrar la captura» con una; «Borrar las N capturas» con más |
| FR-004 | Consola (IMU) | «1 muestras» | «1 muestra» |
| FR-005 | Consola, Cuerpo, Piloto | `−0` y `−0 mA` cuando el valor redondea a cero | `0` y `0 mA`, sin signo |
| FR-006 | Piloto | «1 tibios», «1 calientes» | singular con 1 |
| FR-007 | Piloto | Sin dato de corriente, la batería dice «— en reposo» | «—» sin sentido de la corriente |
| FR-008 | Piloto | Con umbral de torque 0 el anillo escribe `stroke-width="NaN"` | Ancho válido (umbral mínimo para la escala) |
| FR-009 | Cuerpo | «undefined muestras» si la línea de tiempo todavía no tiene tamaño | Cuenta real de muestras |
| FR-010 | Cuerpo | `onTheme()` después de `destroy()` lanza una excepción | No hace nada |
| FR-011 | Polling | `stop()` + `start()` con un pedido en vuelo deja **dos** ciclos de polling en paralelo | Un solo ciclo: la respuesta de un pedido abortado se descarta |
| FR-012 | `TelemetryService` | Si se desconecta mientras espera `/info`, queda vivo el temporizador de "sin datos" | No se crea |

### Backend

| ID | Dónde | Error | Comportamiento esperado |
|---|---|---|---|
| FR-013 | `telemetry_reader` / `GET /fuentes` | Un `.simulador_activo.json` que no es un objeto (`[9000]`) produce un 500 | Se ignora: simulador "no abierto" |
| FR-014 | `iniciar.py` | `--puerto=9000` se pisa con `--puerto 8001` y el navegador abre el puerto equivocado | Se respeta `--opcion=valor` |
| FR-015 | Lector DDS | `cerrar()` no cierra el suscriptor de la batería: queda abierto en cada cambio de fuente | Cierra los dos suscriptores |
| FR-016 | `POST /fuente` | `"interfaz": ""` llega como `""` a la fábrica (en la línea de comandos, `""` es "automática") | `""` → `None` (automática) |
| FR-017 | Lectores reales | `esperar_primer_dato(timeout=0)` devuelve `False` aunque ya haya un dato | `True` si ya hay dato |

## Criterios de aceptación

Para cada FR: **dado** el caso descrito, **cuando** se ejecuta, **entonces** se observa el
comportamiento esperado; verificado por una prueba unitaria cuyo nombre cita el FR. La cobertura
sigue en 100 % y el puntaje de mutación no baja.

## Fuera de alcance

- Detalles sin efecto observable en el uso real (p. ej. la franja de temperatura de la última
  muestra, que se pinta con la muestra siguiente; o `performance.now() === 0`, que no ocurre en un
  navegador).
