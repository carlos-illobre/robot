# ADR 0008: Frontend en JavaScript sin framework, con módulos ES nativos y sin compilación

| | |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-08 · retroactiva (decidida al comenzar el proyecto, 2026-10-29) |
| **Especificación** | [Constitución, principio IV](../../specs/constitution.md) |

## Contexto

El TP trata sobre **integrar componentes a través de una interfaz** (backend ↔ frontend) con los
patrones Adapter, Observer y Facade. Un framework trae su propio modelo de estado y de
actualización, que esconde justamente ese flujo. El dashboard además tiene que abrirse en las
máquinas del laboratorio sin instalar Node.

## Decisión

HTML + CSS + JavaScript con **módulos ES nativos** (`import`/`export`), servidos tal cual. No hay
bundler, transpilador ni framework. Las dependencias de desarrollo (Vitest, Stryker, Playwright)
nunca llegan al navegador.

## Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| React / Vue + Vite | El flujo de datos queda dentro del framework; exige compilar antes de servir |
| TypeScript | Obliga a un paso de compilación; los tipos se documentan con JSDoc |
| Web Components | Agregan shadow DOM y un ciclo de vida propio; para vistas que se montan y desmontan enteras alcanza una clase con `mount`/`destroy` |

## Consecuencias

**A favor**

- Cualquiera abre un archivo y ve todo el camino de un dato, del WebSocket al DOM.
- Cero dependencias en tiempo de ejecución propias del proyecto; nada que actualizar por seguridad.

**En contra**

- La actualización del DOM es manual: cada vista crea los nodos una vez y después solo cambia
  textos y atributos (contrato en `frontend/js/views/README.md`).
- Sin tipos estáticos: los errores de tipo se detectan con pruebas (cobertura 100 %).

## Referencias

- `frontend/index.html`, `frontend/js/main.js`, `frontend/js/views/README.md`
