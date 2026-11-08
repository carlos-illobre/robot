# Especificación 011: Decisiones de arquitectura (ADR) y diagramas

| | |
|---|---|
| **Branch** | `docs/adr-y-diagramas` |
| **Estado** | ✅ Implementada |
| **Creada** | 2026-11-08 |
| **Relacionada con** | Constitución, principios I y VI · README, "Decisiones técnicas" y "Arquitectura" |

## Contexto y problema

Las decisiones técnicas del proyecto están resumidas en una tabla del README (decisión, alternativa
y por qué) y en las secciones "Decisiones" de los `plan.md`. Falta:

- el **contexto** que llevó a cada decisión y sus **consecuencias** (lo que se gana y lo que se
  paga);
- un **estado** por decisión, para poder reemplazarla sin borrar la historia;
- diagramas de **contexto**, de **contenedores**, de **clases** de los patrones, de **estados** de
  la conexión y del **camino de un cambio** hasta producción.

Quien corrige (o quien se suma al equipo) tiene que poder entender por qué el sistema es como es
sin leer el código ni el historial de git.

## Historias de usuario

### HU-1 · Entender una decisión (P1)

**Como** docente **quiero** leer por qué se tomó cada decisión técnica, qué alternativas se
consideraron y qué consecuencias tiene **para** evaluar el criterio de diseño del equipo.

1. **Dado** el repositorio, **cuando** abro `docs/adr/README.md`, **entonces** veo el índice de
   todas las decisiones con su estado.
2. **Dado** un ADR, **cuando** lo leo, **entonces** encuentro contexto, decisión, alternativas
   consideradas, consecuencias y enlaces al código y a las pruebas que la sostienen.
3. **Dado** cualquier fila de la tabla "Decisiones técnicas" del README, **cuando** busco su ADR,
   **entonces** existe y está enlazado.

### HU-2 · Ver la arquitectura de un vistazo (P1)

**Como** docente **quiero** diagramas que muestren el sistema en distintos niveles **para**
entender las piezas y cómo se comunican sin leer el código.

1. **Dado** `docs/arquitectura.md`, **cuando** lo abro en GitHub, **entonces** se dibujan los
   diagramas de contexto, contenedores, clases, estados de la conexión, cambio de fuente y camino
   de un cambio hasta `main` y GitHub Pages.

### HU-3 · Registrar decisiones nuevas (P2)

**Como** integrante del equipo **quiero** una plantilla y una regla clara **para** que las
decisiones futuras queden registradas igual que las anteriores.

1. **Dado** `CONTRIBUTING.md` y la plantilla de `plan.md`, **cuando** una tarea toma una decisión
   técnica, **entonces** las instrucciones piden registrarla como ADR y enlazarla.

## Requisitos funcionales

| ID | Requisito | Verificado por |
|---|---|---|
| FR-001 | DEBE existir `docs/adr/` con plantilla, índice y un ADR numerado por decisión | revisión |
| FR-002 | Cada ADR DEBE tener: estado, fecha, contexto, decisión, alternativas, consecuencias y referencias | revisión |
| FR-003 | Todas las filas de "Decisiones técnicas" del README y todos los patrones DEBEN tener su ADR | revisión |
| FR-004 | `docs/arquitectura.md` DEBE tener diagramas de contexto, contenedores, clases, estados, cambio de fuente y entrega | revisión en GitHub |
| FR-005 | Los diagramas DEBEN ser Mermaid (texto en el repo, sin herramientas externas) y coincidir con el código | revisión contra el código |
| FR-006 | `CONTRIBUTING.md` y la plantilla de `plan.md` DEBEN pedir un ADR por decisión nueva | revisión |
| FR-007 | El README y los `plan.md` DEBEN enlazar a los ADR | revisión |

## Criterios de éxito medibles

| ID | Métrica | Objetivo |
|---|---|---|
| SC-001 | Decisiones de la tabla del README sin ADR | 0 |
| SC-002 | Diagramas que no se dibujan en GitHub | 0 |
| SC-003 | Pruebas en verde después del cambio (`npm run test:all`) | 100 % |

## Fuera de alcance

- Cambiar código: esta especificación solo documenta.
- Diagramas de cada vista por dentro (están en `frontend/js/views/README.md` y en el manual).
