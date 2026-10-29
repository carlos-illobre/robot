/**
 * Contenido del manual, como datos.
 *
 * Cada sección: { id, title, toc?, kicker?, lead?, level? (1|2), blocks: [...] }
 * Tipos de bloque: p · callout · list · steps · table · diagram · cards · figure · try
 * Las figuras son capturas reales del dashboard (assets/manual/*.png) con
 * marcas en coordenadas porcentuales [x, y] y una leyenda [título, texto].
 */
import * as D from "./diagrams.js";
import { VIEW_SECTIONS } from "./views-content.js";

const A = "assets/manual";

export const SECTIONS = [
  /* ---------------------------------------------------------------- */
  {
    id: "inicio",
    toc: "Bienvenida",
    kicker: "Manual de uso · TP05",
    title: "Cómo leer y usar el dashboard de telemetría",
    lead:
      "Este dashboard muestra <b>en vivo</b> lo que le pasa a un robot Unitree mientras se mueve: el estado de cada motor, hacia dónde está inclinado, cuánta batería le queda y qué patas tiene apoyadas. Llegan <b>10 muestras por segundo</b> desde el servidor.",
    blocks: [
      {
        type: "p",
        html: "Hay <b>cuatro formas de mirar los mismos datos</b>. Todas comparten la misma conexión, el mismo historial y las mismas capturas: cambiar de vista no pierde nada. Usá la que mejor sirva para lo que estás haciendo:",
      },
      {
        type: "cards",
        items: [
          { view: "console", key: "1", title: "Consola", text: "Los cuatro paneles con todos los números. Para analizar y corregir.", img: `${A}/console-desktop.png` },
          { view: "body", key: "2", title: "Cuerpo", text: "El robot es la interfaz: se entiende de un vistazo qué motor calienta y qué pata apoya.", img: `${A}/body-desktop.png` },
          { view: "pilot", key: "3", title: "Piloto", text: "Instrumental de cabina a pantalla completa. Para proyectar en clase.", img: `${A}/pilot-desktop.png` },
          { view: "twin", key: "4", title: "Gemelo 3D", text: "El robot en 3D, movido por los ángulos reales de sus motores.", img: `${A}/twin-desktop.png` },
        ],
      },
      {
        type: "callout",
        kind: "tip",
        html: "<b>Recorrido sugerido para aprender:</b> leé <a href='#man-conceptos'>Conceptos</a> (10 minutos), después abrí la <b>Consola</b> con el robot caminando y buscá cada dato que se explica acá. Con las teclas <kbd>J</kbd> y <kbd>K</kbd> avanzás y retrocedés entre secciones.",
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "robot-real",
    toc: "★ Con el robot real",
    kicker: "Lo más importante",
    title: "Usar el dashboard con el robot real, paso a paso",
    lead: "Hace falta el robot encendido, <b>una notebook con Linux conectada al robot por cable</b> (corre el servidor) y, para mirar desde otras máquinas, solo un navegador.",
    blocks: [
      { type: "p", html: "<b>Antes del día</b> (una sola vez, con internet), en la notebook que se va a conectar al robot:" },
      {
        type: "steps",
        items: [
          "<b>Instalar el proyecto:</b> en la carpeta del proyecto, <code>python iniciar.py</code>. Si se ve el robot paseando, está bien; cerrar con <kbd>Ctrl</kbd>+<kbd>C</kbd>.",
          "<b>Instalar el SDK de Unitree</b>, lo que permite leer el robot por el cable: <code>python iniciar.py --instalar-sdk</code>. <b>Solo si hace falta:</b> si la notebook ya lo tiene, se detecta solo (en el panel de fuentes, <i>Robot real</i> no aparece gris). Si falla compilando CycloneDDS, usar Python 3.10.",
        ],
      },
      { type: "p", html: "<b>El día del laboratorio:</b>" },
      {
        type: "steps",
        start: 3,
        items: [
          "<b>Conectar el cable</b> entre la notebook y el robot, y encender el robot.",
          "<b>Darle a la notebook una IP de la red del robot</b>: la placa del cable con IP fija <code>192.168.123.222</code>, máscara <code>255.255.255.0</code> (Configuración → Red → Cableada → IPv4 → Manual). Comprobar con <code>ping 192.168.123.161</code>.",
          "<b>Arrancar:</b> <code>python iniciar.py</code>. Se abre el dashboard en modo demo: arriba dice <b>Simulado</b>.",
          "<b>Clic en «Simulado ▾»</b> → elegir <b>Robot real</b> → el modelo (<b>Go2</b> o <b>G1</b>, el que está conectado) → revisar la <b>placa de red</b> (se detecta sola y aparece marcada <i>(red del robot)</i>) → <b>Usar esta fuente</b>. En unos segundos la etiqueta cambia a <b>Real</b>, en verde.",
          "<b>Desde otras computadoras:</b> abrir la dirección que muestra la consola (<i>«desde otra maquina de la red: http://…:8001»</i>). Tiene que ser la IP de la WiFi del aula, no la del cable del robot.",
        ],
      },
      {
        type: "figure",
        src: `${A}/real-paso-1.png`,
        alt: "La etiqueta Simulado en la barra",
        strip: true,
        caption: "Paso 6: la etiqueta junto al nombre del robot. Haciendo clic se abre el panel.",
        markers: [[63, 50]],
        legend: [["Fuente de datos", "Dice <b>Simulado</b> (violeta) o <b>Real</b> (verde). Hacé clic para elegir otra fuente."]],
      },
      {
        type: "figure",
        src: `${A}/real-paso-2.png`,
        alt: "Panel de fuente de datos con Robot real elegido",
        ratio: "570 / 855",
        phone: true,
        caption: "Captura ilustrativa: el nombre de la placa y su IP dependen de cada notebook.",
        markers: [[4, 9], [4, 58.5], [4, 71], [4, 85.5]],
        legend: [
          ["Robot real", "La fuente que lee el robot por el cable. Si aparece gris, falta el SDK (paso 2)."],
          ["Modelo", "Go2 o G1: tiene que ser el robot conectado."],
          ["Placa de red", "Se detecta sola. La marcada <i>(red del robot)</i> es la del cable."],
          ["Usar esta fuente", "El servidor cambia solo si llegan datos en 5 s; si no, avisa y sigue con la fuente anterior."],
        ],
      },
      {
        type: "table",
        head: ["Qué pasa", "Qué hacer"],
        rows: [
          ["<b>Robot real</b> está gris", "Falta el SDK: paso 2."],
          ["«La fuente no envió datos en 5 s»", "Revisar el cable, la IP (paso 4, <code>ping</code>) y elegir la placa marcada <i>(red del robot)</i>."],
          ["Los números están quietos", "El robot está quieto: el dashboard es solo lectura, no lo mueve. Es normal."],
          ["Los motores no coinciden", "Se eligió G1 con un Go2 conectado (o al revés)."],
        ],
      },
      { type: "callout", kind: "info", html: "<b>¿Por qué algunas opciones del panel aparecen grises?</b> Gris no quiere decir roto: en <b>esa máquina</b> falta algo para usar esa fuente, y el motivo está escrito debajo del nombre. Robot real necesita el SDK de Unitree; Simulador MuJoCo, que el simulador de la cátedra esté abierto. La Demo siempre está disponible. Ver <a href='#man-fuentes'>Fuentes de datos</a>." },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "primeros-pasos",
    toc: "Primeros pasos",
    kicker: "1",
    title: "Primeros pasos",
    blocks: [
      { type: "p", html: "El dashboard necesita un <b>servidor de telemetría</b> (el backend FastAPI de la cátedra) que le mande los datos. Sin robot, ese servidor puede inventar datos realistas: es el <b>modo demo</b>." },
      {
        type: "steps",
        items: [
          "<b>Levantar el servidor.</b> En una terminal, dentro de la carpeta del proyecto: <code>python iniciar.py</code> (igual en Windows, macOS y Linux). La primera vez instala lo necesario; después arranca al instante.",
          "<b>Abrir el navegador</b> en <code>http://localhost:8001</code> (el script lo abre solo).",
          "<b>Mirar el indicador de conexión</b> arriba a la derecha: tiene que decir <i>En vivo · WS · 10 Hz</i> con un punto verde que late.",
          "<b>Elegir una vista</b> con los botones de arriba o las teclas <kbd>1</kbd> a <kbd>4</kbd>.",
        ],
      },
      {
        type: "figure",
        src: `${A}/appbar.png`,
        alt: "Barra superior del dashboard",
        caption: "La barra superior es la misma en todas las vistas.",
        strip: true,
        markers: [[2.3, 50], [20.5, 50], [55.3, 50], [86.1, 50], [94.3, 50], [97.8, 50]],
        legend: [
          ["Marca", "Nombre del dashboard."],
          ["Robot conectado", "Nombre y cantidad de motores, según <code>GET /info</code>. La etiqueta <b>DEMO</b> avisa que los datos son simulados."],
          ["Selector de vistas", "Cuatro formas de ver los mismos datos, más este manual. Teclas <kbd>1</kbd> a <kbd>5</kbd>."],
          ["Estado de la conexión", "Punto verde que late = llegan datos. Amarillo = reconectando o sin datos hace más de 2 s. Rojo = desconectado. Muestra el transporte (WS o Polling), la frecuencia real en Hz y, en polling, cuánto tarda cada pedido. <b>Hacé clic</b> para cambiar de servidor o de transporte."],
          ["Tema", "Claro u oscuro (tecla <kbd>T</kbd>). Cada vista recuerda el suyo."],
          ["Ayuda", "Todos los atajos de teclado (tecla <kbd>?</kbd>)."],
        ],
      },
      {
        type: "callout",
        kind: "info",
        html: "<b>El día del robot real</b> no cambia nada del dashboard: solo la dirección del servidor. Abrí <code>http://localhost:8001/?server=http://IP-DEL-ROBOT:8001</code> o escribila en el panel de conexión. <br><b>Ojo:</b> la versión publicada en GitHub Pages solo puede usar la simulación del navegador. Como la página es <code>https</code> y el robot está en <code>http</code>, el navegador bloquea la conexión por seguridad. Con el robot real, el dashboard se abre localmente con <code>python iniciar.py</code>.",
      },
      {
        type: "callout",
        kind: "tip",
        html: "<b>¿Robot real o simulación?</b> La etiqueta junto al nombre del robot lo dice siempre: <b>REAL</b> en verde (datos medidos) o <b>SIMULADO</b> en violeta. Haciendo clic se elige la <b>fuente de datos</b>: <i>Robot real</i> (por DDS, en el laboratorio), <i>Simulador MuJoCo</i> de la cátedra o <i>Demo</i> (el robot pasea solo). Una fuente no disponible aparece gris con el motivo, por ejemplo: «Falta el SDK de Unitree». También se elige ahí el robot: Go2 o G1.",
      },
      {
        type: "callout",
        kind: "info",
        html: "<b>¿Verlo desde otra computadora o un celular?</b> En la máquina del backend, la consola muestra una línea <i>«desde otra maquina de la red: http://192.168.0.23:8001»</i>. Abrí esa dirección en el navegador de la otra máquina, y listo: ya viene conectado. Si no carga, casi siempre es el firewall o que no están en la misma red (ver «Si algo no anda»).",
      },
      { type: "p", html: "<b>WebSocket o polling.</b> Son dos formas de recibir los datos. Con <b>WebSocket</b> el servidor <i>empuja</i> cada muestra apenas la tiene (10 por segundo, sin demora). Con <b>polling</b> el dashboard <i>pregunta</i> cada 100, 250 o 500 ms. WebSocket es mejor; polling sirve si una red bloquea WebSocket. Se cambia con <kbd>W</kbd>." },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "fuentes",
    level: 2,
    toc: "Fuentes de datos (modos)",
    title: "Fuentes de datos: ¿de dónde vienen los números?",
    blocks: [
      { type: "p", html: "El dashboard siempre muestra lo mismo, pero los datos pueden venir de tres <b>fuentes</b>. La etiqueta junto al nombre del robot dice cuál se está usando: <b>REAL</b> en verde (datos medidos) o <b>SIMULADO</b> en violeta. Al hacer clic en el nombre del robot (o en esa etiqueta) se elige otra fuente y otro robot, sin reiniciar nada." },
      {
        type: "table",
        head: ["Fuente", "Qué es", "Cuándo usarla", "Qué necesita"],
        rows: [
          ["<b>Robot real</b> <span style='color:var(--sem-ok)'>● medido</span>", "El servidor lee el robot por DDS, a través del cable de red.", "En el laboratorio, con el robot.", "Notebook conectada al robot por cable y el SDK de Unitree (<code>unitree_sdk2py</code>)."],
          ["<b>Simulador MuJoCo</b>", "El simulador 3D de la cátedra, corriendo en la misma máquina que el servidor. Mueve el robot de verdad (sin física completa).", "Practicar con datos parecidos a los del robot.", "El simulador de la cátedra abierto (<code>INICIAR_TP05</code>)."],
          ["<b>Demo</b>", "Simulación de este proyecto: el robot pasea (camina, trota, gira, frena) y los datos son coherentes entre sí: si trota, suben el torque y la temperatura. La calcula el servidor; si no hay servidor (por ejemplo, en GitHub Pages), la misma simulación corre en el navegador.", "Desarrollar, corregir y presentar.", "Nada."],
        ],
      },
      {
        type: "callout",
        kind: "info",
        html: "<b>¿Y la demo de la cátedra?</b> No está en el panel porque hace lo mismo que la Demo, pero peor: cada motor oscila con una senoidal suelta, sin marcha, el semáforo nunca pasa de verde y el robot 3D queda en poses imposibles (todos los motores alrededor de 0°: patas estiradas y rodillas sin doblar). Sigue disponible para comparar: <code>python iniciar.py --demo-catedra</code>.",
      },
      {
        type: "list",
        items: [
          "Una fuente que <b>no está disponible</b> aparece gris con el motivo (por ejemplo: «Falta el SDK de Unitree en la máquina del backend»).",
          "El cambio es <b>seguro</b>: el servidor solo pasa a la fuente nueva si entrega datos en 5 segundos; si no, sigue con la anterior.",
          "Cambiar la fuente del servidor <b>afecta a todos los dashboards conectados</b> a ese servidor. Para evitarlo en una clase, el servidor se puede arrancar con <code>--fuente-fija</code>.",
          "El <b>robot</b> (Go2 o G1) se elige en el mismo panel. Con el robot real tiene que coincidir con el que está conectado.",
        ],
      },
    ],
  },
  {
    id: "conceptos",
    toc: "Conceptos",
    kicker: "2",
    title: "Conceptos para leer la telemetría",
    lead: "Antes de mirar las vistas, conviene saber qué significa cada dato. Son siempre los mismos, en las cuatro vistas.",
    blocks: [],
  },
  {
    id: "motores",
    level: 2,
    toc: "Motores y articulaciones",
    title: "Motores y articulaciones",
    blocks: [
      { type: "p", html: "Cada articulación del robot tiene un motor. El <b>Go2</b> (perro) tiene <b>12</b>: tres por pata. El <b>G1</b> (humanoide) tiene <b>29</b>. El nombre de cada motor dice <b>qué pata</b> y <b>qué articulación</b> es:" },
      { type: "diagram", svg: D.LEG, caption: "Las tres articulaciones de una pata del Go2, vista de costado." },
      {
        type: "table",
        head: ["Parte del nombre", "Significa", "Ejemplo"],
        rows: [
          ["<code>FR</code> · <code>FL</code>", "Front Right / Front Left: delantera derecha / izquierda", "<code>FR_calf</code> = pantorrilla delantera derecha"],
          ["<code>RR</code> · <code>RL</code>", "Rear Right / Rear Left: trasera derecha / izquierda", "<code>RL_thigh</code> = muslo trasero izquierdo"],
          ["<code>hip</code>", "Cadera: abre y cierra la pata hacia el costado (abducción)", "se mueve poco"],
          ["<code>thigh</code>", "Muslo: lleva la pata hacia adelante y atrás", "el que más se mueve al caminar"],
          ["<code>calf</code>", "Pantorrilla (rodilla): dobla la pata", "el que más fuerza hace y más calienta"],
          ["G1: <code>L_</code> · <code>R_</code>", "izquierda / derecha del humanoide", "<code>L_knee</code> = rodilla izquierda"],
        ],
      },
    ],
  },
  {
    id: "magnitudes",
    level: 2,
    toc: "Los cuatro datos de cada motor",
    title: "Los cuatro datos de cada motor",
    blocks: [
      {
        type: "table",
        head: ["Dato", "Unidad", "Qué es", "Cómo leerlo"],
        rows: [
          ["<b>Ángulo</b>", "grados (°)", "Posición de la articulación. 0° es la posición de referencia del motor.", "Si oscila con un ritmo parejo, el robot camina. En el Go2 parado: muslo ≈ 45°, pantorrilla ≈ −88°."],
          ["<b>Velocidad</b>", "rad/s", "Qué tan rápido gira la articulación (1 rad/s ≈ 57°/s). El signo dice para qué lado.", "0 = quieta. Al trotar, los muslos llegan a 3–6 rad/s."],
          ["<b>Torque</b>", "N·m", "La fuerza de giro que hace el motor. El signo dice para qué lado empuja.", "Sube al caminar y cuando la pata está apoyada sosteniendo peso. La alarma salta si supera el umbral (por defecto 18 N·m)."],
          ["<b>Temperatura</b>", "°C", "Temperatura del motor.", "Sube mientras el motor trabaja y baja lentamente al frenar: <b>tiene inercia</b>, tarda decenas de segundos en reaccionar."],
        ],
      },
      { type: "diagram", svg: D.SEMAFORO, caption: "El semáforo de temperatura, igual al del monitor de escritorio electroSim." },
      {
        type: "callout",
        kind: "warn",
        html: "<b>Un motor en rojo</b> (más de 60 °C) no es una falla del dashboard: es la señal de que conviene frenar el robot para que enfríe. En el modo demo pasa a propósito después de trotar un rato, para poder probar las alarmas.",
      },
    ],
  },
  {
    id: "imu",
    level: 2,
    toc: "Inclinación (IMU)",
    title: "Inclinación: roll, pitch y yaw (IMU)",
    blocks: [
      { type: "p", html: "La <b>IMU</b> (unidad de medición inercial) es un sensor dentro del cuerpo del robot que mide su orientación con tres ángulos, como un avión:" },
      { type: "diagram", svg: D.RPY, caption: "Los tres ángulos de orientación del cuerpo." },
      {
        type: "table",
        head: ["Ángulo", "Gira alrededor de", "Ejemplo", "Valores normales"],
        rows: [
          ["<b>Roll</b> (alabeo)", "el eje que va de la cola a la cabeza", "el robot se inclina hacia un costado", "±3° caminando; más de 15° es peligro de vuelco"],
          ["<b>Pitch</b> (cabeceo)", "el eje que va de costado a costado", "baja o levanta la cabeza", "±3° caminando; negativo al acelerar"],
          ["<b>Yaw</b> (guiñada o rumbo)", "el eje vertical", "hacia dónde mira, como una brújula", "de −180° a 180°; cambia cuando el robot dobla"],
        ],
      },
      { type: "p", html: "Además trae la <b>aceleración</b> en tres ejes (<code>ax</code>, <code>ay</code>, <code>az</code>, en m/s²). Con el robot quieto, <code>az</code> vale ≈ 9,8: es la gravedad." },
      { type: "callout", kind: "tip", html: "<b>Para practicar:</b> en el gráfico histórico, el <b>yaw</b> hace escalones cuando el robot dobla, y <b>roll</b> y <b>pitch</b> se vuelven una onda pareja cuando trota." },
    ],
  },
  {
    id: "bateria",
    level: 2,
    toc: "Batería (BMS)",
    title: "Batería (BMS)",
    blocks: [
      { type: "p", html: "El <b>BMS</b> (sistema de gestión de batería) informa:" },
      {
        type: "table",
        head: ["Dato", "Unidad", "Cómo leerlo"],
        rows: [
          ["<b>Carga (SOC)</b>", "%", "State of Charge. Verde ≥ 50 %, amarillo 20–50 %, rojo &lt; 20 % (alarma)."],
          ["<b>Corriente</b>", "mA", "Cuánta corriente sale de la batería. Sube al caminar: es el consumo. 1.000 mA = 1 A."],
          ["<b>Temperatura</b>", "°C", "De la batería. Sube despacio con consumos altos."],
          ["<b>Celdas</b>", "V", "La batería está hecha de varias celdas en serie, cada una de ~3,7 a 4,2 V. Deberían estar parejas."],
          ["<b>Desbalance (Δ)</b>", "mV", "Diferencia entre la celda más alta y la más baja. Menos de 30 mV es bueno; si crece, una celda se está degradando."],
        ],
      },
      { type: "diagram", svg: D.CELLS, caption: "Celdas parejas, y una más baja: el Δ mide esa diferencia." },
    ],
  },
  {
    id: "patas",
    level: 2,
    toc: "Patas y marcha",
    title: "Patas apoyadas y la marcha al trote",
    blocks: [
      { type: "p", html: "Cada pata informa si está <b>apoyada</b> (1) o <b>en el aire</b> (0). Mirando cuáles apoyan a lo largo del tiempo se reconoce <b>cómo camina</b> el robot. El Go2 <b>trota</b>: mueve juntas las patas en diagonal." },
      { type: "diagram", svg: D.GAIT, caption: "Diagrama de marcha del trote: cada barra llena es una pata apoyada. FR y RL van juntas, y FL y RR también." },
      { type: "list", items: ["<b>Quieto:</b> las cuatro patas apoyadas todo el tiempo.", "<b>Trotando:</b> se alternan las diagonales; casi siempre hay dos apoyadas.", "<b>G1:</b> son dos pies (<code>R_foot</code>, <code>L_foot</code>) que se alternan al caminar."] },
    ],
  },
  {
    id: "real-derivado",
    level: 2,
    toc: "Qué es real y qué es simulado",
    title: "Qué es real y qué es simulado",
    blocks: [
      { type: "p", html: "Con el robot real, todos los datos se miden. En el <b>simulador</b> y en el <b>modo demo</b>, algunos son medidos y otros se <b>calculan</b> a partir de lo que hace el robot. Los calculados son <b>coherentes</b> (si camina, sube el torque) pero no son mediciones." },
      {
        type: "table",
        head: ["Dato", "Simulador MuJoCo", "Modo demo de este proyecto"],
        rows: [
          ["Ángulo y velocidad de motor", "real", "calculado de la marcha"],
          ["Yaw", "real", "integrado del giro"],
          ["Torque", "derivado del esfuerzo", "derivado de la carga de cada pata"],
          ["Temperatura", "derivada: sube con el uso", "modelo térmico (ley de Newton + efecto Joule)"],
          ["Roll / pitch", "oscilación al caminar", "oscilación al caminar"],
          ["Patas apoyadas", "de la fase de la marcha", "de la fase del trote"],
          ["Batería", "inventada (87 %, baja muy lento)", "baja con el consumo (acelerada para verse en clase)"],
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  ...VIEW_SECTIONS,

  /* ---------------------------------------------------------------- */
  {
    id: "capturas",
    toc: "Capturar y exportar",
    kicker: "4",
    title: "Capturar muestras y exportar a CSV",
    lead: "Como en electroSim: se guardan fotos del estado completo del robot para analizarlas después en Excel, LibreOffice, Python o MATLAB.",
    blocks: [
      {
        type: "table",
        head: ["Acción", "Tecla", "Qué hace"],
        rows: [
          ["<b>Capturar</b>", "<kbd>C</kbd>", "Guarda una copia completa del instante actual: los motores, la IMU, la batería y las patas."],
          ["<b>Grabar</b>", "<kbd>R</kbd>", "Guarda <b>todas</b> las muestras que llegan (10 por segundo) hasta que la vuelvas a apretar. Ideal para registrar una caminata entera."],
          ["<b>Exportar CSV</b>", "<kbd>E</kbd>", "Descarga un archivo <code>telemetria_go2_AAAA-MM-DD_hh-mm-ss.csv</code> con todas las muestras capturadas."],
        ],
      },
      { type: "p", html: "El CSV tiene <b>una fila por muestra</b> y <b>una columna por dato</b>, con la unidad en el nombre: <code>FR_calf_temperatura_C</code>, <code>imu_roll_deg</code>, <code>bms_celda_3_V</code>, <code>pata_RL_contacto</code>… Para el Go2 son unas 80 columnas; para el G1, más de 130." },
      { type: "callout", kind: "tip", html: "<b>¿Excel en castellano?</b> Activá <i>Formato Excel</i> antes de exportar: usa <code>;</code> como separador y coma decimal, y se abre con doble clic con cada dato en su columna." },
      { type: "callout", kind: "info", html: "Las capturas viven en la memoria del navegador: <b>si recargás la página se pierden</b>. Exportá antes de cerrar." },
    ],
  },
  {
    id: "alarmas",
    toc: "Alarmas",
    kicker: "5",
    title: "Alarmas",
    blocks: [
      {
        type: "table",
        head: ["Alarma", "Cuándo salta", "Qué hacer"],
        rows: [
          ["Temperatura de motor", "un motor supera 60 °C", "Frenar el robot y esperar a que enfríe. Mirar cuál es: suelen ser las pantorrillas."],
          ["Torque", "un motor supera el umbral (18 N·m por defecto, configurable)", "El motor está haciendo mucha fuerza: el robot puede estar trabado o cargando de más."],
          ["Batería baja", "la carga baja de 20 %", "Terminar la prueba y cargar."],
          ["Conexión perdida", "no llegan datos hace más de 2 s", "No hace falta recargar: el dashboard <b>reconecta solo</b>. Verificar que el servidor siga abierto."],
        ],
      },
      { type: "p", html: "Una alarma avisa <b>una sola vez</b> cuando empieza, y otra vez cuando se normaliza: no repite el aviso 10 veces por segundo." },
    ],
  },
  {
    id: "atajos",
    toc: "Atajos de teclado",
    kicker: "6",
    title: "Atajos de teclado",
    blocks: [
      {
        type: "table",
        head: ["Tecla", "Acción"],
        rows: [
          ["<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd>", "Consola · Cuerpo · Piloto · Gemelo 3D · Manual"],
          ["<kbd>C</kbd>", "Capturar muestra"],
          ["<kbd>R</kbd>", "Grabar / detener"],
          ["<kbd>E</kbd>", "Exportar CSV"],
          ["<kbd>Espacio</kbd>", "Pausar la vista (los datos se siguen recibiendo)"],
          ["<kbd>W</kbd>", "Cambiar WebSocket ↔ polling"],
          ["<kbd>T</kbd>", "Tema claro / oscuro"],
          ["<kbd>?</kbd>", "Ayuda"],
          ["<kbd>M</kbd> · <kbd>S</kbd>", "En Piloto: tabla de motores · sonido"],
        ],
      },
    ],
  },
  {
    id: "problemas",
    toc: "Si algo no anda",
    kicker: "7",
    title: "Si algo no anda",
    blocks: [
      {
        type: "table",
        head: ["Síntoma", "Causa probable", "Solución"],
        rows: [
          ["Indicador amarillo, <i>Reconectando…</i>", "El servidor se cerró o la dirección es otra", "Volver a levantar el servidor: el dashboard reconecta solo. Revisar la dirección en el panel de conexión."],
          ["Todos los gráficos planos", "El robot está quieto", "En el demo hay tramos quietos de 5 a 7 segundos: esperar."],
          ["No anda abriendo <code>index.html</code> con doble clic", "Los navegadores no cargan módulos desde <code>file://</code>", "Abrirlo desde el servidor: <code>http://localhost:8001</code>."],
          ["Error de CORS", "Dirección equivocada (otro puerto, https en vez de http)", "Abrir el dashboard desde el propio servidor."],
          ["Desde otra máquina no carga", "Firewall de la máquina del backend, o redes distintas", "Permitir Python en el firewall (puerto 8001) y conectar las dos máquinas a la misma red. Detalle en el README: «Ver el dashboard desde otra computadora»."],
          ["El Gemelo 3D no aparece", "El navegador no tiene WebGL", "Actualizar el navegador o activar la aceleración por hardware."],
        ],
      },
    ],
  },
  {
    id: "glosario",
    toc: "Glosario",
    kicker: "8",
    title: "Glosario",
    blocks: [
      {
        type: "table",
        head: ["Término", "Significado"],
        rows: [
          ["Telemetría", "Mediciones que un equipo envía a distancia mientras funciona."],
          ["Backend / frontend", "El servidor que provee los datos / la página que los muestra."],
          ["API REST", "Forma de pedir datos al servidor por HTTP (por ejemplo, <code>GET /telemetria</code>)."],
          ["WebSocket", "Conexión que queda abierta para que el servidor mande datos sin que se los pidan."],
          ["Polling", "Preguntar al servidor cada cierto intervalo si hay datos nuevos."],
          ["Hz", "Veces por segundo. 10 Hz = 10 muestras por segundo."],
          ["IMU", "Sensor de orientación y aceleración del cuerpo."],
          ["BMS", "Sistema de gestión de la batería."],
          ["SOC", "State of Charge: porcentaje de carga de la batería."],
          ["Torque", "Fuerza de giro de un motor, en newton·metro (N·m)."],
          ["Trote", "Marcha en la que las patas diagonales se mueven juntas."],
          ["Gemelo digital", "Copia virtual de un equipo real que se mueve con sus datos."],
          ["DDS", "Protocolo con el que el robot real publica sus datos en la red."],
        ],
      },
    ],
  },
];
