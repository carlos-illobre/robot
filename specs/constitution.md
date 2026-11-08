# Constitución del proyecto

> Principios que **ninguna** especificación, plan ni commit puede violar. Si una tarea necesita
> romper uno, primero se modifica esta constitución, en su propio branch y con su justificación.

**Versión:** 1.0.0 · **Ratificada:** 2026-11-08 · **Proyecto:** TP05 Dashboard de telemetría Unitree
(Desarrollo de Aplicaciones II · UADE)

---

## I. La especificación es la fuente de verdad

- Toda funcionalidad, corrección o cambio de proceso empieza por una especificación en
  `specs/NNN-nombre/` ([proceso](README.md)).
- La especificación dice **qué** y **por qué**, con criterios de aceptación verificables. No dice
  *cómo*: eso es el plan.
- Si el código y la especificación no coinciden, hay un error: o se corrige el código o se corrige
  (primero) la especificación.

## II. El contrato de la API manda

- [`docs/API.md`](../docs/API.md) es el contrato entre backend y frontend. Ninguno de los dos lo
  puede romper.
- El frontend **no sabe** de dónde vienen los datos (robot real, MuJoCo, demo o navegador):
  recibe muestras normalizadas por el Adapter (`normalizeFrame`).
- Los patrones de integración pedidos por la consigna (Adapter, Observer, Facade) no se eliminan
  ni se "atajan".

## III. Probado o no existe

- **Cobertura unitaria del 100 %** de líneas, ramas, funciones y sentencias, en backend y frontend.
  CI falla si baja un solo punto.
- El código que no se puede cubrir con una prueba unitaria **se rediseña** (se extrae la lógica a
  una función pura, se inyecta la dependencia) **o se elimina**. No se usan comentarios para
  excluir líneas de la cobertura salvo lo enumerado y justificado en la especificación 007.
- Lo que de verdad no se puede probar en una unitaria (navegador real, backend real, red real) va a
  una prueba **E2E**, que es la excepción y no la regla.
- Las pruebas se evalúan a sí mismas con **pruebas de mutación**: una prueba que no detecta
  mutantes no está probando nada.

## IV. Sin pasos de compilación, sin internet

- El frontend se sirve tal cual (HTML + ES modules). No se agregan bundlers ni frameworks.
- Todo lo que el dashboard necesita en tiempo de ejecución está en el repositorio (fuentes,
  Chart.js, Three.js, modelos). Las herramientas de desarrollo (pruebas, cobertura, mutación) son
  `devDependencies` y nunca llegan al navegador.

## V. Funciona en el celular

- Toda vista se usa con una mano en un teléfono de 375 px de ancho: nada se desborda, **todo se
  puede desplazar con el dedo desde cualquier punto** y los controles quedan al alcance del pulgar.
- Las regresiones de diseño adaptable se cubren con pruebas E2E a tamaño de teléfono.

## VI. Historial profesional

- Una tarea = un branch con nombre descriptivo (`tipo/descripcion-corta`), mergeado a `main` con
  `--no-ff` cuando cumple la definición de terminado ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).
- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) en castellano y
  referencia al requisito (`FR-…`) que implementan.
- `main` siempre está en verde.

## VII. Documentado en castellano

- Código, comentarios, especificaciones, commits y documentación en castellano rioplatense, como el
  enunciado de la cátedra. Los identificadores siguen el idioma del código existente.

---

## Enmiendas

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0.0 | 2026-11-08 | Adopción de SDD. Principios I a VII. |
