# Especificación 009: Reportes de calidad en GitHub Pages

| | |
|---|---|
| **Branch** | `ci/pages-coverage` |
| **Estado** | 🔄 En curso |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Especificaciones 007 (cobertura) y 008 (mutación) |

## Contexto y problema

Los reportes de cobertura y de mutación se generan en la máquina de quien corre las pruebas. El
docente no debería tener que clonar el repositorio, instalar Node y Python y esperar una hora de
pruebas de mutación para verlos.

## Historias de usuario

### HU-1 · Ver los reportes desde el navegador (P1)

**Como** docente **quiero** abrir una URL y recorrer los reportes HTML de cobertura y de mutación
del frontend y del backend **para** evaluar las pruebas sin instalar nada.

1. **Dado** el sitio publicado, **cuando** abro `https://carlos-illobre.github.io/robot/coverage/`, **entonces** veo una página con los cuatro reportes y sus cifras principales.
2. **Dado** esa página, **cuando** elijo un reporte, **entonces** navego el HTML completo (archivo por archivo, línea por línea o mutante por mutante).
3. **Dado** el README, **cuando** lo abro, **entonces** el enlace a esa página está al principio.

### HU-2 · Reportes siempre al día (P1)

1. **Dado** un merge a `main`, **cuando** termina la publicación, **entonces** los reportes corresponden a ese commit (y la página lo dice).

## Requisitos funcionales

| ID | Requisito |
|---|---|
| FR-001 | La publicación genera los cuatro reportes en la CI y los copia a `/coverage/` del sitio |
| FR-002 | `/coverage/index.html` muestra, para cada reporte, el porcentaje principal (leído de los JSON de resumen) y el enlace al HTML; si un JSON falta, igual muestra el enlace |
| FR-003 | La página dice de qué commit son los reportes y enlaza a ese commit |
| FR-004 | El sitio publica solo desde `main` (antes publicaba desde cualquier branch que tocara `frontend/`, y el último push de cualquier branch pisaba al anterior) |
| FR-005 | La URL de los reportes aparece al principio del README |
| FR-006 | La página funciona en el celular y en tema claro y oscuro |

## Fuera de alcance

- Historial de cobertura a lo largo del tiempo.
