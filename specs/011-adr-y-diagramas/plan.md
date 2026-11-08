# Plan 011: ADR y diagramas

## Formato de los ADR

Se usa el formato de [Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
con la sección de alternativas de [MADR](https://adr.github.io/madr/), en castellano:

```
# ADR NNNN: título en forma de decisión
Estado · Fecha · Especificación relacionada
## Contexto
## Decisión
## Alternativas consideradas
## Consecuencias  (positivas, negativas)
## Referencias    (código, pruebas, specs)
```

- Numeración de 4 dígitos, nunca se reutiliza un número.
- Un ADR **no se edita** para cambiar la decisión: se escribe uno nuevo que lo **reemplaza** y el
  viejo pasa a estado "Reemplazado por ADR-NNNN".
- Las decisiones anteriores a la adopción de SDD se registran como **retroactivas** (fecha de
  registro y la aclaración "decidida al comenzar el proyecto, 2026-10-29").

## Diagramas

Todos en Mermaid dentro de `docs/arquitectura.md`, ordenados del más general al más particular,
al estilo del [modelo C4](https://c4model.com/):

| Diagrama | Tipo de Mermaid | Pregunta que responde |
|---|---|---|
| Contexto | `flowchart` | ¿Quién usa el sistema y con qué sistemas externos habla? |
| Contenedores | `flowchart` | ¿Qué piezas se ejecutan y por dónde se comunican? |
| Despliegue | `flowchart` | ¿Dónde corre cada pieza (laboratorio, Docker, GitHub Pages)? |
| Clases de los patrones | `classDiagram` | ¿Cómo están armados Adapter, Observer, Facade, Strategy y Factory Method? |
| Estados de la conexión | `stateDiagram-v2` | ¿Qué estados muestra el indicador y qué los cambia? |
| Cambio de fuente en caliente | `sequenceDiagram` | ¿Cómo se cambia de robot a demo sin quedar a ciegas? |
| Entrega | `flowchart` | ¿Qué le pasa a un cambio desde el branch hasta Pages? |

Los diagramas de componentes y de secuencia de una muestra ya están en el README; se enlazan, no se
duplican.

## Decisiones

| Decisión | Alternativa | Por qué |
|---|---|---|
| ADR en `docs/adr/`, un archivo por decisión | Dejar la tabla del README | La tabla no tiene lugar para contexto, consecuencias ni estado (ADR-0001) |
| Mermaid | PlantUML, draw.io, imágenes | GitHub lo dibuja solo, es texto (se revisa en un diff) y no hace falta instalar nada (constitución, IV) |
| La tabla del README queda, con un enlace por fila | Borrarla | Es el resumen que se lee en dos minutos; el ADR es el detalle |
