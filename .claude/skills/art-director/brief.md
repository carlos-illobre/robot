# El entorno del director de arte (no es parte de su rol)

- **Dónde trabajás:** solo en la carpeta de la pantalla que te pasaron,
  `docs/design/mockups/<screen>/`. Cada variante va en
  `<screen>/<device>/variant-N-<idea>/index.html` (`device` es `desktop` o `phone`; `idea`, una o
  dos palabras en inglés). No escribas en ningún otro lugar del repositorio, no anotes tareas y no
  uses git: de eso se encarga quien te llamó. No publiques páginas.
- **Nombres de archivos y carpetas en inglés;** los textos de la maqueta, en castellano
  rioplatense ("capturá", "exportá").
- **Lenguaje común:** si existe `docs/design/visual-language.md`, es obligatorio, y lo común va en
  `docs/design/common/` (que no se modifica). Si no existe, cada variante es autocontenida y
  propone su paleta; la primera variante que Carlos elija define el lenguaje común.
  Las variantes se diferencian en la idea, no solo en el estilo.
- **Qué podés leer:** `docs/` (la consigna en `docs/consigna.md`, el contrato de datos en
  `docs/API.md`). El código no (`frontend/`, `backend/`), ni la aplicación funcionando.
- **Internet:** podés bajar fuentes e íconos de fuentes libres (Google Fonts, Lucide,
  Phosphor) y mirar referencias. Si la red te bloquea un sitio, usá fuentes del sistema
  (`system-ui`, `ui-monospace`) e íconos SVG dibujados a mano, y decilo en las notas.
  **Nunca pongas datos personales (correos, nombres de personas reales) en pedidos a internet ni
  en las maquetas.**
- **Dispositivos:** computadora 1366×768; celular 390 px de ancho. Tres variantes por dispositivo
  pedido, como mínimo.
- **Una sola aplicación:** la computadora y el celular son la misma pantalla con otra
  disposición (media queries). Las variantes de la computadora y las del celular se emparejan por
  número (la variante 1 del celular es la misma idea que la 1 de la computadora) y muestran lo
  mismo.
- **Capturas:** Playwright (Python o Node; ya está instalado: `require('playwright')` en Node, o
  `playwright` en Python si está), con el Chromium de `/opt/pw-browsers/chromium` si no encuentra
  otro, abriendo con `file://`; celular con `device_scale_factor` 2. Esperá ~2 s antes de capturar
  para que los datos simulados se muevan. Cada variante con su `screenshot.png`; además
  `desktop-comparison.png` y `phone-comparison.png` con las variantes lado a lado. Los scripts,
  fuera del repositorio (en tu carpeta temporal).
- **Sin pruebas:** no escribas pruebas ni compares capturas píxel a píxel.
- **Funcionando:** cada variante se puede tocar: botones (capturar, exportar, pausar, cambiar de
  WebSocket a polling, elegir motores para el gráfico), campos, lo que se abre y se cierra, y las
  animaciones. Datos simulados con la forma del JSON de `docs/API.md`, sin conexión real.
- **Solo la pantalla pedida.**
- **Teclado:** en la computadora, todo con el teclado y las teclas a la vista. Un gesto nuevo se
  suma, no lo reemplaza.
- **Peso:** cada variante, menos de 400 KB sin contar fuentes; sin videos.
- **`<screen>/art-director-notes.md`:** lo que le dirías a Carlos (idea de cada variante, preferida
  y por qué, movimiento por interacción, autocrítica) y el catálogo de ideas numerado.
- **Respuesta final, corta y en castellano:** las rutas de las comparaciones y de las notas, y en
  pocas líneas las variantes, tu preferida y lo que contradice la consigna.
