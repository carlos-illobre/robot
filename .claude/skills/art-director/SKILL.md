---
name: art-director
description: Director de arte de interfaces del dashboard de telemetría. Hace tres versiones de cada pantalla, en la computadora y en el celular, para que Carlos elija. Corre antes de programar o rediseñar una pantalla, y cuando Carlos escribe /art-director.
---

# Director de arte

> Adaptado de la skill homónima de otro proyecto de Carlos (Ferrebress) al dominio de este
> repositorio: un dashboard web de telemetría de robots Unitree (Go2 / G1) para el TP05 de
> Desarrollo de Aplicaciones II (UADE).

**Las maquetas no llevan pruebas.** Ni unitarias, ni de punta a punta, ni scripts que recorran
los botones, ni comparación de capturas píxel a píxel. Se abre cada maqueta una vez y se mira que
la consola no tenga errores. Quien lance a un agente de maquetas le copia esta regla en el
encargo. (El código del dashboard, en `frontend/`, sí tiene pruebas: esta regla es solo para
`docs/design/`.)

**Cuándo corre:** antes de programar o rediseñar una pantalla del dashboard, o cuando Carlos lo
pide con `/art-director`. Propone; Carlos elige.

**Una pantalla por vez.** Hoy la aplicación tiene una sola pantalla, `dashboard` (los cuatro
paneles de la consigna, la barra de conexión y las capturas). Si en el futuro hay más (por
ejemplo, `replay` para reproducir un CSV), se diseñan de a una y en el orden en que se usan.

**Se miran funcionando, no en capturas.** Cada variante se navega y tiene sus animaciones y sus
datos moviéndose como llegarían del robot (10 muestras por segundo). Se publican en el visor de
maquetas (`docs/design/index.html`), que muestra las variantes de cada pantalla en la computadora
y en el celular. A Carlos se le pasa el enlace (o la ruta, para abrirlo con
`python3 -m http.server -d docs/design`).

Argumentos: la pantalla y el dispositivo (`desktop`, `phone` o los dos; si no lo dice, los dos).
Ejemplo: `/art-director dashboard, desktop`.

## Cómo se corre

1. **Un subagente por pantalla** (herramienta Agent, `general-purpose`, en segundo plano), con
   este mensaje: «Leé y seguí `.claude/skills/art-director/prompt.md` (tu rol) y
   `.claude/skills/art-director/brief.md` (el entorno)», más la entrada: la pantalla, la carpeta
   donde va (`docs/design/mockups/<screen>/`), el dispositivo y qué hace la pantalla en una
   línea. Las reglas están en `docs/consigna.md` y el contrato de datos en `docs/API.md`. Va como
   subagente a propósito: no ve el código ni la conversación, para que lo de hoy no lo sesgue.
2. **Varias pantallas a la vez:** en paralelo, todas sobre el lenguaje común de
   `docs/design/visual-language.md` (si todavía no existe, la primera pantalla elegida lo define).
3. **Al terminar cada una**, antes de subir:
   - que no haya datos personales (correos) ni rutas absolutas en los archivos;
   - que cada variante se abra sola (sin internet, rutas relativas) y tenga su
     `screenshot.png`, y que la pantalla tenga `desktop-comparison.png`, `phone-comparison.png` y
     `art-director-notes.md`;
   - que la pantalla esté en `docs/design/mockups/index.json` (el índice del visor), con sus
     variantes;
   - commit y push a la rama de trabajo.
4. **A Carlos:** el enlace del visor y, por variante, la idea en una frase, la preferida del agente
   y lo que contradice una regla de la consigna. Antes de pasárselo, quien lanzó al agente abre
   las tres y comprueba que de verdad son tres ideas distintas y que la audaz rompe algo; si no,
   la devuelve.
5. **Cuando Carlos elige,** se anota la variante en `docs/design/decisions.md`. **El director de
   arte no ajusta su maqueta:** diseña sin restricciones. Lo que Carlos pida cambiar y lo que la
   consigna exija lo aplica el maquetador (agente `mockup-builder`), que construye la maqueta
   final en `final/`; después se lleva a `frontend/`.

## Hacer navegable una variante

Cuando Carlos pide «hacé navegable la variante X», un subagente sigue
`.claude/skills/art-director/navigable.md` sobre esa carpeta.

Las maquetas no se modifican ni se borran hasta que Carlos lo pida, aunque una pantalla ya esté
elegida y programada.
