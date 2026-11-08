# Dashboard: notas del director de arte

Hay tres variantes, cada una en computadora (1366 × 768) y en celular (390 px). La variante N del
celular es la misma página que la N de la computadora: el mismo `index.html` cambia de
disposición con media queries. Cada carpeta se abre sola, sin internet: tiene su `index.html`, el
simulador (`sim.js`, que produce el JSON exacto de `docs/API.md` con el robot paseando solo), los
íconos (`icons.js`, símbolos Lucide copiados) y las fuentes en `fonts/`.

- Comparaciones: `desktop-comparison.png`, `phone-comparison.png`.
- Fuentes: Inter y JetBrains Mono (1), Manrope e IBM Plex Mono (2), Space Grotesk y JetBrains Mono (3).
  Se bajaron de Google Fonts (solo el subconjunto latino, en woff2).
- Íconos: Lucide (licencia ISC), copiados de su repositorio en GitHub. **unpkg y jsDelivr estaban
  bloqueados por la red**; Google Fonts y GitHub, no.
- En todas: `C`/`Espacio` captura, `E` exporta, `W` cambia WebSocket ↔ polling, `G` cambia
  Go2 ↔ G1, `T` cambia el tema, `D` simula un corte de conexión (es solo de la demo) y `?` abre la ayuda.
  Las animaciones respetan `prefers-reduced-motion`.

## Las tres ideas

### 1 · Consola (`variant-1-console`): la evolución
Los cuatro paneles de la consigna, ordenados como una consola de Grafana o Linear: la tabla de
motores alta a la izquierda, agrupada por pata; a la derecha, IMU, batería y patas. Arriba hay una
franja de estado que en calma dice «Todo en rango · el más caliente es…» y que con una alarma se
vuelve roja y te lleva a la fila. Abajo hay una barra con el endpoint, el `ts` y los atajos a la vista.
Usa las ideas del catálogo 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 24 y 25.

### 2 · Cuerpo (`variant-2-body`): la reinvención
El robot es la interfaz. El Go2 se ve desde arriba y en grande. Cada articulación es un punto con el
color del semáforo, unido por una línea a una tarjeta con su temperatura y su torque. Las patas se
rellenan cuando apoyan, con una onda en el momento del apoyo. El cuerpo es la batería y se llena
según el SOC. El dibujo entero se inclina en 3D con el roll y el pitch, y el anillo de rumbo gira
con el yaw. Abajo, una **línea de tiempo** de 30 s pone en el mismo eje la inclinación, el rumbo,
la marcha (un diagrama de apoyos) y el motor más caliente. Las capturas quedan clavadas en esa línea
como alfileres numerados, y con `R` se graba de corrido. La consigna se lee en lenguaje natural en
una frase arriba.
Usa las ideas del catálogo 1, 2, 3, 6, 7, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21 y 25.

### 3 · Piloto (`variant-3-pilot`): la que nadie se animaría
No hay paneles ni cajas. La pantalla entera es el horizonte artificial: el cielo y la tierra se
inclinan con el robot, exagerados ×4. Arriba, la cinta de rumbo de un avión. A la izquierda, la
batería en una cinta vertical. A la derecha, una sola escala térmica de 25 a 75 °C con las tres
zonas del semáforo, donde cada motor es una marca. En el centro, la silueta del robot rodeada por un
**anillo de motores**: cada segmento es un motor, ubicado en el cuadrante de su pata, con el color de
su temperatura. Un arco interior muestra su torque. Las patas se encienden en las diagonales. Un
osciloscopio abajo dibuja roll y pitch con 120 muestras. Se captura con `Espacio`. Hay **sonido**
opcional: cada pata suena al apoyar (el trote se escucha) y una alarma doble suena sobre 60 °C. La
tabla existe, pero vive detrás de `M`. Tiene modo noche y modo día.
Usa las ideas del catálogo 1, 3, 6, 7, 10, 13, 22, 23, 26, 27, 28, 29, 30 y 31.

### Mi preferida: la 2, Cuerpo
Es la única donde **lo que el robot está haciendo se entiende de un vistazo sin leer números**:
qué motor calienta se ve en la rodilla de la pata, qué patas apoyan se ve en los pies y la batería
se ve en el cuerpo. Y aun así cumple la consigna completa: la tabla con las cuatro magnitudes está
siempre a la derecha, y la línea de tiempo tiene más de 60 muestras. La línea de tiempo con las
capturas como alfileres convierte «capturar» y «exportar» en algo que se ve, no en un contador
escondido. Para el docente, la frase de arriba («Caminando y doblando al trote, 2 patas
apoyadas · RL_calf a 65 °C…») es el resumen en 5 segundos. La 1 es la apuesta segura para
aprobar. De la 3 tomaría el anillo de motores, el sonido de las pisadas y el horizonte a pantalla
completa para el modo proyector.

## Qué contradice la consigna
- **3 · Piloto**: no tiene «cuatro paneles», y la tabla de motores no está a la vista (se abre con
  `M`). El gráfico de IMU es un osciloscopio sin ejes numéricos, y el horizonte exagera la
  inclinación ×4 (está rotulado). Suma sonido. El botón «Capturar muestra» no tiene texto: en la
  computadora es la tecla `Espacio` y en el celular un obturador.
- **2 · Cuerpo**: los paneles no son cajas. El panel de IMU está repartido: los números van bajo el
  robot y el histórico en la línea de tiempo. El de BMS está partido entre el cuerpo del robot y la
  columna. La tabla está ordenada por temperatura y no por id. En el celular la tabla oculta ángulo
  y velocidad (están en el detalle del motor).
- **1 · Consola**: cumple. En el celular oculta la columna de ángulo para entrar en 390 px.
- Fuera de la consigna en todas: la autonomía estimada, la alarma de celda baja (Δ en mV), el
  estado deducido (camina, dobla o está quieto) y la simulación de corte.

## Movimiento por interacción (cómo se mueve y qué se siente)
- **Llega un dato (10 Hz)**: los números no bailan (cifras tabulares). Las barras y los arcos se
  deslizan en 200 ms y se siente como un instrumento, no como una planilla.
- **Motor pasa 60 °C**: en la 1, la franja superior se tiñe de rojo y el ícono late. En la 2, la
  articulación emite un pulso y su línea se vuelve roja. En la 3, el segmento late y el marco de la
  pantalla respira en rojo. Es la única cosa que se mueve sin que la toques, y por eso se nota.
- **Pata que apoya**: el pie se rellena y crece un 8 % (1). En la 2 sale una onda de 500 ms, como
  una pisada en el agua. En la 3 el punto se enciende y, con sonido, hace «tic».
- **Capturar**: en la 1, un marco de color recorre la pantalla (450 ms), el contador salta y aparece
  un aviso. En la 2, un destello de papel, como un obturador, y un alfiler numerado se clava en la
  línea de tiempo. En la 3, el marco del obturador se cierra, suena un clic y la marca queda sobre
  el osciloscopio.
- **Exportar**: se descarga el CSV y un aviso dice el nombre del archivo y cuántas muestras tiene.
- **Grabar (2)**: el botón se pone azul y el punto parpadea. La línea de tiempo se sombrea donde
  grabaste. En el celular, si mantenés el obturador medio segundo, empieza a grabar.
- **Pausar**: el punto de «en vivo» se apaga en gris y todo queda quieto. Se siente como congelar
  la imagen, no como un error.
- **Corte de conexión**: los datos se desaturan y pierden opacidad (la 1 y la 2) o la cabina pasa a
  gris con «SIN ENLACE» (3). Así queda claro que lo que se ve es viejo.
- **WebSocket ↔ polling**: cambia el rótulo, la frecuencia y la latencia. En polling, los gráficos
  avanzan a saltos de 500 ms y se ve la diferencia que pide la consigna.
- **Elegir motor**: en la 1, tocar la fila suma su curva al gráfico (hasta 3 colores). En la 2,
  tocar la articulación o la fila cambia el detalle; también con ← →. En la 3, tocar el segmento
  lo marca en el anillo y en la escala térmica.
- **Inclinación**: en la 2, el robot se inclina en 3D y su sombra se corre. En la 3, el horizonte
  entero se mueve con suavizado.

## Autocrítica (lo más flojo de la primera versión, ya corregido)
- 1: la barra superior desbordaba (botones partidos en dos líneas) y la tabla no entraba en 768 px.
  La compacté, bajé las filas a 24 px y saqué el atajo del botón pausar (está en la barra inferior).
  El dibujo de las patas era una caja. Lo rehice con hombros, articulaciones y cabeza.
- Todas: el trote a 2,2 Hz, muestreado a 10 Hz, dibujaba gráficos que parecían ruido. Bajé la marcha
  simulada a 1,25 Hz para que la curva y el diagrama de apoyos se lean. Con el robot real el
  gráfico va a verse más «nervioso»: es un punto a decidir (¿suavizar? ¿graficar a más
  frecuencia?).
- 2: las líneas de las tarjetas de las patas delanteras se cruzaban. Invertí el orden (rodilla
  arriba) para que vayan casi paralelas. Todavía se cruzan un poco en las caderas.
- 3: en el celular, la etiqueta del motor caliente pisaba la cinta de batería y los textos de las
  esquinas se encimaban. Ahora el motor caliente se lee en la línea de estado y la esquina muestra
  solo «WS».
- Todavía flojo: la 3 dibuja en canvas, así que un lector de pantalla no lee los números (la tabla
  de `M` sí). En la 1, la columna de celdas ocupa mucho para tan poca información. Las líneas de la
  escalera de cabeceo de la 3 pueden parecer rayas sueltas.

## Paleta propuesta (todavía no hay `visual-language.md`)
Tomo la de la variante 1 como base para el lenguaje común, si Carlos no elige otra:
- Neutros grafito: fondo `#0A0C0F`, panel `#111418`, línea `#222831`, texto `#E8EBEF` / `#A1A9B4` / `#737C87`.
  En el tema claro: `#F3F4F6`, `#FFFFFF`, `#E4E7EB`, `#0D1117`.
- El semáforo es el único color «de estado»: verde `#34C47C`, amarillo `#F5B83D`, rojo `#FF5A52`.
  En el tema claro son `#17924F`, `#B87D00` y `#D9302A`.
- La acción y el «en vivo» van en azul `#5B8CFF`, para no competir con el semáforo. Las series son
  roll `#7AA7FF` y pitch `#C792EA`.
- Oscuro por defecto porque se proyecta: el fondo negro no lava el proyector y el rojo de la
  alarma resalta. El claro existe (`T`) para el laboratorio con luz de día. La 2 arranca en claro
  a propósito (lámina técnica).

## Observaciones sobre el contrato
- La consigna pide corriente en mA, pero `docs/API.md` no le da unidad, y el ejemplo trae
  `corriente: 0`, `temperatura: 0.0` y `celdas: []`. Las maquetas suponen mA, con signo negativo al
  descargar. El diseño tiene que tolerar celdas vacías.
- El G1 no reporta patas: las tres lo muestran explícitamente («El G1 no reporta contacto de patas»).
- Temperatura, torque, roll, pitch y fuerzas son **derivados** en el simulador. Ninguna maqueta lo
  dice en pantalla; la idea 25 lo propone.

## Catálogo de ideas
Por cada idea: qué es · qué problema resuelve · en qué variantes aparece · de dónde viene el patrón ·
cuántos clics ahorra · si está fuera de la consigna.

1. **Franja o frase de estado arriba**: resume el estado general y la alarma en una línea · se
   entiende en 5 s sin recorrer los paneles · 1 (franja), 2 (frase), 3 (línea bajo el anillo) ·
   banner de incidentes de Datadog o Vercel · ahorra buscar el motor caliente · fuera de la consigna.
2. **«Ver en la tabla» desde la alarma**: lleva a la fila del motor caliente y la centra · encontrar
   el motor sin buscarlo · 1 (2 lo resuelve resaltando la articulación) · Linear, enlaces de
   incidentes · ahorra 1 scroll · fuera.
3. **Motor más caliente deducido**: siempre visible, sin pedirlo · qué motor calienta · 1, 2 y 3 ·
   «top consumer» de Grafana · ahorra ordenar la tabla · fuera.
4. **Tabla agrupada por pata con el contacto en el encabezado**: FR / FL / RR / RL con «apoyada» o
   «en el aire» · relacionar esfuerzo con apoyo · 1 · telemetría de F1 por rueda · — · dentro.
5. **Semáforo triple en la celda**: punto, barra de 25 a 75 °C con marcas en 40 y 60, y número
   rojo en negrita sobre 60 · leer la temperatura a distancia (proyector) · 1 (2 y 3 con punto o
   segmento) · F1, temperatura de neumáticos · — · dentro.
6. **Torque como barra o arco proporcional**: se ve el esfuerzo sin leer el número · 1, 2 y 3 ·
   Tesla, potencia instantánea · — · dentro (refuerza).
7. **Estado deducido (camina, dobla o está quieto)** a partir de las velocidades de los motores y
   de `ay` · saber qué hace el robot · 1, 2 y 3 · Apple Salud, «caminando» · ahorra mirar el
   robot · fuera.
8. **Ícono de marcha de 2 × 2** en la barra superior que late con las patas · ver el trote de
   reojo · 1 · luces de estado de las consolas de SpaceX · — · fuera.
9. **Elegir motores para el gráfico tocando su fila o articulación**: hasta 3, con color propio ·
   comparar cómo calientan · 1 y 2 · leyendas de Grafana · ahorra un menú de selección · fuera.
10. **Horizonte artificial exagerado y rotulado (×3 o ×4)**: roll y pitch de 1 a 2° se vuelven
    visibles · 1 (círculo), 2 (el robot se inclina) y 3 (pantalla entera) · aviónica · — · dentro
    (la API lo sugiere).
11. **Brújula del yaw con punto cardinal** (338° N) · dónde mira el robot · 1 · mapas, Tesla · — ·
    dentro.
12. **Autonomía estimada** a este consumo (SOC × capacidad ÷ corriente) · cuánto falta para cargar ·
    1 · Apple Batería, Tesla · — · fuera.
13. **Celda más baja resaltada y Δ en mV** · detectar el desbalance de la batería · 1, 2 y 3 · BMS
    industriales · — · fuera.
14. **El cuerpo del robot es la batería** y se llena según el SOC · un dato menos que buscar · 2 ·
    Apple Batería, el ícono que se llena · — · dentro (forma nueva).
15. **Articulaciones dibujadas sobre el robot con el color del semáforo** · ubicar el motor en el
    cuerpo · 2 (3 en abstracto) · diagramas de daños de F1 y Tesla · — · dentro.
16. **Tarjetas unidas a la articulación con una línea** (callouts) · número y lugar a la vez · 2 ·
    láminas técnicas, Apple en sus páginas de producto · — · dentro.
17. **Onda en el pie al apoyar** · sentir la marcha · 2 · respuesta táctil de iOS · — · dentro.
18. **Robot que se inclina en 3D con su sombra** · la IMU sin leer números · 2 · las pantallas de
    actitud de Tesla y DJI · — · dentro (forma nueva).
19. **Anillo de rumbo que gira (el robot siempre mira hacia arriba)** · orientación intuitiva ·
    2 · navegación con «rumbo arriba» · — · dentro.
20. **Línea de tiempo con pistas paralelas** (inclinación, rumbo, diagrama de apoyos, motor más
    caliente) · relacionar eventos (frenó → bajó la temperatura) · 2 · editores de video,
    telemetría de F1 por vuelta · — · fuera de la forma, cumple el histórico.
21. **Capturas como alfileres numerados en la línea de tiempo y grabación continua con `R`** · ver
    qué capturaste y cuándo; capturar una ráfaga sin apretar 50 veces · 2 (3 con marcas en el
    osciloscopio) · marcadores de Premiere y del osciloscopio · ahorra N clics al grabar · fuera.
22. **Pantalla entera como horizonte, sin paneles** · se lee desde el fondo del aula · 3 · HUD de
    caza, consolas de SpaceX · — · contradice los «cuatro paneles».
23. **Anillo de motores**: cada motor es un segmento en el cuadrante de su pata, con color y torque
    · ver los 12 (o 29) motores como una sola forma · 3 · relojes de actividad de Apple, mapas de
    calor radiales · — · contradice la tabla visible.
24. **Atajos de teclado a la vista** en botones y barra inferior, más ayuda con `?` · el docente
    descubre las acciones · 1, 2 y 3 · Linear y Superhuman · capturar = 1 tecla · fuera.
25. **Endpoint y modo visibles** (`ws://…/ws` o `GET /telemetria cada 500 ms`) · el docente ve que se
    cumple el requisito de WebSocket o polling · 1 (2 y 3 en la pastilla) · barras de estado de VS
    Code · — · fuera (refuerza). Extensión posible: rotular «derivado» en los datos que no son
    medidos (API, «Qué es real»).
26. **Escala térmica única con todos los motores como marcas** · ver la dispersión de temperaturas
    en un solo eje · 3 · altímetro de aviónica · — · fuera.
27. **Sonido**: un tic distinto por pata al apoyar y una alarma doble sobre 60 °C · enterarse sin
    mirar la pantalla, con el robot enfrente · 3 · sonares, sensores de estacionamiento · — · fuera.
28. **Tabla detrás de una tecla (`M`)**, en una hoja lateral · que la vista principal sea solo
    forma · 3 · inspectores de Figma y Linear · — · contradice la consigna.
29. **Osciloscopio de roll y pitch con 120 muestras** y las capturas marcadas · el histórico sin
    ejes pesados · 3 · instrumentos de laboratorio · — · dentro (≥ 60 muestras).
30. **Marco de la pantalla que respira en rojo** durante una alarma · la alarma se ve desde el fondo
    del aula · 3 · alertas de cabina · — · fuera.
31. **Obturador redondo bajo el pulgar** (celular), con «mantener para grabar» · capturar con una
    mano junto al robot · 2 y 3 · app Cámara de iOS · ahorra un toque al grabar · fuera.
32. **Corte de conexión visible**: los datos desaturados o «SIN ENLACE», sin borrar lo último que
    llegó · no confundir datos viejos con vivos · 1, 2 y 3 · Grafana «stale data» · — · fuera.
