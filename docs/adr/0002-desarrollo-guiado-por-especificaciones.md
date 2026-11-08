# ADR 0002: Desarrollar guiados por especificaciones (SDD)

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 |
| **Especificación** | [Proceso](../../specs/README.md) · [Constitución](../../specs/constitution.md) |

## Contexto

El proyecto empezó como un TP con un README extenso como única documentación. Al crecer (cuatro
vistas, cuatro fuentes de datos, gemelo 3D) se hizo difícil saber **qué** tenía que hacer cada
parte y **cómo** comprobar que lo hacía. La cátedra vio Spec-Driven Development en clase.

## Decisión

Toda tarea empieza por una especificación en `specs/NNN-nombre/`: `spec.md` (qué y por qué, con
criterios "Dado / cuando / entonces" y requisitos `FR-…`), `plan.md` (cómo) y `tasks.md` (pasos).
Es el **primer commit** del branch. Una [constitución](../../specs/constitution.md) fija los
principios que ninguna tarea puede romper. Las funcionalidades previas se especificaron de forma
retroactiva (specs 001 a 005).

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Seguir solo con el README | Mezcla manual de uso, arquitectura y requisitos; no dice cuándo algo está terminado |
| Historias de usuario en issues de GitHub | Quedan fuera del repositorio y no se versionan con el código |
| Especificar solo lo nuevo | Lo existente quedaría sin criterios de aceptación contra los cuales probar |

## Consecuencias

**A favor**

- Trazabilidad: requisito → tarea → commit (`Spec: NNN · FR-…`) → prueba.
- Las pruebas se escriben contra criterios conocidos de antemano.

**En contra**

- Más documentación por tarea; para cambios mínimos el costo es proporcionalmente alto.

## Referencias

- [`specs/README.md`](../../specs/README.md), [`specs/_plantillas/`](../../specs/_plantillas)
- [ADR-0003](0003-historial-git-profesional.md)
