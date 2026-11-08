# ADR 0010: El backend sirve el frontend en `/dashboard`

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [001](../../specs/001-telemetria-tiempo-real/spec.md) |

## Contexto

Los módulos ES no cargan desde `file://` (el navegador los bloquea por seguridad), así que abrir
`index.html` con doble clic no funciona. Un segundo servidor para el frontend agrega CORS y otro
puerto que explicar en clase.

## Decisión

FastAPI monta `frontend/` como archivos estáticos en `/dashboard` y redirige `/` ahí. El
dashboard y la API comparten **origen**: el frontend llama a `/telemetria` y `/ws` sin dominio.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Abrir `index.html` con doble clic | Los módulos ES no cargan desde `file://` |
| `python -m http.server` aparte | Dos procesos, dos puertos y CORS |
| nginx delante | Un componente más para instalar en el laboratorio |

## Consecuencias

**A favor**

- Un solo comando (`python iniciar.py`) y una sola URL que se puede compartir con el celular.

**En contra**

- El backend de la cátedra se toca en un punto (`montar_dashboard` en `backend/servidor.py`,
  fuera de `telemetry_server.py`). Para usar el dashboard con otro backend, la dirección se
  cambia desde el propio dashboard.

## Referencias

- `backend/servidor.py` › `montar_dashboard`
