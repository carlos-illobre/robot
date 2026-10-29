# Encargo: que la maqueta se pueda navegar

Carlos abre las maquetas de `docs/design/mockups/`. Te pasan qué variantes hacer navegables.
Quiere que **funcionen los botones y los controles** (capturar, exportar, pausar, cambiar de
transporte, elegir motores, cambiar de robot Go2/G1, abrir la ayuda de teclado) para ver cómo
funciona visualmente. No hace falta conexión real: que se vea lo que pasaría.

## Dónde
- Tu pantalla está en `docs/design/mockups/<screen>/`, con `desktop/` y `phone/` y una carpeta
  por variante. Trabajás **solo ahí**: los `index.html` de cada variante (y `states.html` si
  hay), más un `.js` o `.css` propio de la pantalla si hace falta, con nombre en inglés.
- No toques `docs/design/common/` ni otras pantallas. No uses git. No publiques nada.
- Antes de empezar, leé `art-director-notes.md` de tu pantalla (dice cómo se mueve cada
  interacción) y `docs/design/visual-language.md` si existe.

## Qué hacer en cada variante (computadora y celular)
1. **Lo que abre algo:** diálogos (ayuda de teclado, detalle de un motor, vista previa del CSV),
   hojas que suben, paneles, menús: que se abra al tocarlo y se cierre con su botón, tocando
   afuera y con Escape.
2. **Lo que agrega:** «Capturar» agrega una muestra con los valores del instante y actualiza el
   contador y la lista; «Grabar» agrega muestras continuamente mientras está activo.
3. **Lo que confirma o descarga** (Exportar CSV): muestra el estado de después (aviso, archivo
   descargado con el nombre que tendría).
4. **Pestañas, filtros, segmentos y conmutadores** de la propia pantalla: cambian lo que se ve
   (métrica del gráfico, ventana de muestras, Go2 ↔ G1, tema claro/oscuro).
5. **Estados de conexión:** un control oculto (o una tecla) para simular "conexión perdida" y
   "reconectando", porque es lo que el docente va a probar apagando el servidor.
6. Movimiento: el que describe `art-director-notes.md`, corto y solo con transform y opacity en la
   interfaz; respetá `prefers-reduced-motion`.
- **Quieta, la maqueta se tiene que ver igual que hoy**: no rediseñes ni muevas nada.
- JavaScript simple al pie de la página (sin librerías ni internet). Nada de `alert`.

## Sin pruebas
No escribas pruebas ni compares capturas. Abrí cada variante una vez en Chromium y
mirá que la consola no tenga errores; nada más.

## Respuesta final
Corta y en castellano: por variante, qué se puede tocar y qué hace, y lo que quedó sin simular.
