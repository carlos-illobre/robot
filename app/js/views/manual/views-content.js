/**
 * Secciones del manual que explican cada vista con capturas anotadas.
 *
 * Las capturas y la posición de las marcas las genera tools/capturas_manual.mjs
 * (`marks: "<vista>"` toma las posiciones de assets/manual/marcas.json). El orden
 * de la leyenda tiene que coincidir con el orden de los elementos en ese script.
 */
const A = "assets/manual";

export const VIEW_SECTIONS = [
  {
    id: "vistas",
    toc: "Las vistas",
    kicker: "3",
    title: "Las cuatro vistas, una por una",
    lead: "Todas muestran los mismos datos, de la misma conexión. Cada una está pensada para una situación distinta. Pasá el mouse por un número para ubicarlo en la captura.",
    blocks: [
      {
        type: "callout",
        kind: "tip",
        html: "<b>Esquema o 3D real.</b> En Consola, Cuerpo y Piloto el robot se puede ver como un <b>esquema</b> simplificado o como el <b>modelo 3D real</b> de Unitree, movido por los ángulos de sus motores. Se cambia con el botón <i>Esquema | 3D</i> o con la tecla <kbd>G</kbd>, y vale para todas las vistas a la vez.",
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "vista-consola",
    level: 2,
    toc: "Consola",
    title: "Consola: los cuatro paneles, con todos los números",
    blocks: [
      { type: "p", html: "<b>Para qué sirve:</b> analizar y corregir. Tiene los cuatro paneles de la consigna, numerados y con un color cada uno: <b>① Motores</b> (azul), <b>② Inclinación</b> (violeta), <b>③ Batería</b> (turquesa) y <b>④ Patas</b> (rosa). Ninguno usa verde, amarillo ni rojo: esos colores son exclusivos del semáforo." },
      {
        type: "figure",
        src: `${A}/console-desktop.png`,
        alt: "Vista Consola con sus cuatro paneles",
        marks: "console",
        legend: [
          ["Franja de estado", "A la izquierda, si el robot camina o está quieto (deducido de la velocidad de los motores) y hacia dónde dobla. Al lado, un resumen: <i>Todo en rango</i> en calma; se pone <b>roja</b> si un motor pasa 60 °C (con un botón que lleva a su fila), <b>ámbar</b> si un torque supera el umbral o si se perdió la conexión."],
          ["Acciones", "<b>Pausar</b> (<kbd>Espacio</kbd>) congela la imagen; <b>Grabar</b> (<kbd>R</kbd>) guarda cada muestra; <b>Capturar</b> (<kbd>C</kbd>) guarda la actual y muestra cuántas hay; <b>Exportar CSV</b> (<kbd>E</kbd>). La flecha ▾ ofrece formato Excel, JSON o borrar las capturas."],
          ["① Motores", "Un renglón por motor (12 en el Go2, 29 en el G1), agrupados por pata o parte del cuerpo, con si esa pata está apoyada. <i>Por calor</i> (tecla <kbd>S</kbd>) los ordena del más caliente al más frío."],
          ["Temperatura con semáforo", "Punto de color, barra de 25 a 75 °C (con marcas en 40 y 60) y el número. <b>Verde</b> &lt; 40 °C, <b>amarillo</b> 40–60 °C, <b>rojo</b> &gt; 60 °C: la fila entera se tiñe de rojo. Después vienen ángulo (°), velocidad (rad/s) y torque (N·m)."],
          ["Alarma de torque", "El umbral en N·m (se puede cambiar y se recuerda). Si un torque lo supera, el número y su barra se ponen ámbar."],
          ["Gráfico de motores elegidos", "Tildá hasta 3 filas para graficarlas. Arriba elegís la magnitud: temperatura (con las zonas del semáforo sombreadas), ángulo, velocidad o torque (con el umbral punteado). El eje va en segundos hacia atrás."],
          ["② Horizonte artificial", "Como el de un avión: el cielo y la tierra se inclinan con el <b>roll</b> y suben o bajan con el <b>pitch</b>, exagerados ×4 para que se note. Si la línea está horizontal y centrada, el robot está nivelado."],
          ["② Roll, pitch y yaw", "Los tres ángulos en grados y su historia en el gráfico (al menos 60 muestras, como pide la consigna). Los botones de arriba muestran u ocultan cada curva; el yaw va en el eje derecho, de −180° a 180°."],
          ["③ Carga de la batería", "El anillo es el SOC en %: neutro desde 50 %, ámbar por debajo de 50 % y rojo por debajo de 20 %. Al lado: corriente (mA, positiva al descargar), temperatura, tensión del pack y potencia."],
          ["③ Celdas", "Una barra por celda con su tensión en V. Arriba, la más baja y el desbalance Δ en mV; si supera 25 mV, la celda más baja se pinta de ámbar."],
          ["④ Patas: el robot visto desde arriba", "Pata rellena = apoyada; hueca = en el aire. Con <i>3D</i> se ve el modelo real en su lugar."],
          ["④ Diagrama de apoyos", "Los últimos 4 s de cada pata: cada segmento lleno es un instante apoyada. Al trotar se ve cómo se alternan las diagonales (FR+RL, FL+RR)."],
          ["Barra inferior", "De dónde llegan los datos (<code>ws://…/ws</code> o el polling), el tiempo del servidor, las capturas y los atajos de teclado."],
        ],
      },
      { type: "try", view: "console", label: "Abrir la Consola", key: "1" },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "vista-cuerpo",
    level: 2,
    toc: "Cuerpo",
    title: "Cuerpo: el robot es la interfaz",
    blocks: [
      { type: "p", html: "<b>Para qué sirve:</b> entender de un vistazo, sin leer números, qué le pasa al robot. Cada dato está dibujado <i>donde ocurre</i>: la temperatura en la articulación, el apoyo en el pie, la batería en el cuerpo." },
      {
        type: "figure",
        src: `${A}/body-desktop.png`,
        alt: "Vista Cuerpo con el robot en el centro",
        marks: "body",
        legend: [
          ["La frase de arriba", "El resumen en castellano: si camina, dobla o está quieto; cuántas patas apoya; el motor más caliente (en rojo si pasa 60 °C) y la batería."],
          ["Articulación", "Un punto por motor, con el color del semáforo de su temperatura. Si pasa 60 °C, late. Al tocarlo, ese motor pasa a ser la <i>articulación elegida</i> (también con <kbd>←</kbd> <kbd>→</kbd>)."],
          ["Pie", "Relleno = apoyado; hueco = en el aire. Al apoyar sale una onda."],
          ["El cuerpo es la batería", "Se llena hasta el porcentaje de carga (SOC) y lo muestra en el centro. Amarillo por debajo de 50 %, rojo por debajo de 20 %."],
          ["Anillo de rumbo", "Gira con el <b>yaw</b> para que el robot siempre mire hacia arriba. Además el dibujo entero se inclina con el roll y el pitch (exagerados ×3)."],
          ["Tarjetas de cada pata", "Por motor: temperatura con semáforo, torque en N·m y una barra de esfuerzo. La línea que la une con su articulación se pone roja si ese motor pasa 60 °C."],
          ["Inclinación (IMU)", "Roll, pitch y yaw en grados, con el punto cardinal aproximado."],
          ["Esquema | 3D real", "Cambia el dibujo por el modelo 3D real de Unitree (tecla <kbd>G</kbd>). Las tarjetas siguen ahí."],
          ["Articulación elegida", "Temperatura (grande), ángulo, velocidad y torque del motor tocado, y la curva de su temperatura en los últimos 30 s con las líneas de 40 y 60 °C."],
          ["Tabla de motores", "Los cuatro datos de todos los motores, agrupados por pata. «Ordenar por temperatura» (o <kbd>O</kbd>) pone arriba el más caliente."],
          ["Batería (BMS)", "Carga, corriente (con su sentido: descargando o cargando), temperatura, tensión del pack y cada celda, con el rango y el desbalance Δ."],
          ["Línea de tiempo", "Los últimos 30 s en un mismo eje: <b>roll y pitch</b> (con escala en grados), <b>yaw</b>, el <b>diagrama de apoyos</b> de cada pata y el color del <b>motor más caliente</b>. Las capturas aparecen como alfileres numerados y lo grabado, sombreado."],
          ["Botones", "Pausar, Grabar, Capturar (con el contador) y Exportar CSV, con la opción de formato Excel."],
        ],
      },
      { type: "try", view: "body", label: "Abrir el Cuerpo", key: "2" },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "vista-piloto",
    level: 2,
    toc: "Piloto",
    title: "Piloto: instrumental de cabina",
    blocks: [
      { type: "p", html: "<b>Para qué sirve:</b> proyectar en clase o mirar desde lejos. No hay paneles: la pantalla entera es un instrumento. <b>De fondo</b>, el horizonte artificial (cielo y tierra) se inclina con el robot, exagerado ×4. Si hay una alarma, el marco de la pantalla <i>respira</i> en rojo." },
      {
        type: "figure",
        src: `${A}/pilot-desktop.png`,
        alt: "Vista Piloto, a pantalla completa",
        marks: "pilot",
        legend: [
          ["Cinta de rumbo", "Hacia dónde mira el robot (yaw), como en un avión: el valor bajo el triángulo, de 000° a 359°, con N, E, S y O."],
          ["Batería", "Carga en % con su cinta vertical, corriente (mA, «descarga») y temperatura. Abajo, las celdas con su mínimo y el desbalance."],
          ["Escala térmica", "De 25 a 75 °C con las tres zonas del semáforo. <b>Cada rayita es un motor</b> a la altura de su temperatura; arriba, el más caliente."],
          ["Anillo de motores", "Un segmento por motor, en el cuadrante de su pata, con el color de su temperatura (late si pasa 60 °C). El arco gris de adentro es el torque: más grueso, más esfuerzo. Tocá un segmento para marcarlo."],
          ["Patas", "Los círculos en las diagonales: rellenos = apoyadas. En el G1 son dos pies."],
          ["Centro", "<i>Camina</i> o <i>Quieto</i>, sobre la silueta (o el modelo 3D real, con <kbd>G</kbd>). Debajo del anillo, la línea de estado: tipo de marcha, patas apoyadas y alarmas."],
          ["Osciloscopio", "Roll y pitch de las últimas 120 muestras con escala ±5°, y los tres valores en grados sin exagerar. Las capturas aparecen como líneas numeradas."],
          ["Botones", "Capturar (<kbd>C</kbd>), Grabar (<kbd>R</kbd>), Exportar CSV (<kbd>E</kbd>) y Pausa (<kbd>Espacio</kbd>)."],
          ["Arriba a la derecha", "Muestras capturadas, <i>Esquema | 3D</i>, <b>Sonido</b> (<kbd>S</kbd>: cada pata suena al apoyar —el trote se escucha— y una alarma doble sobre 60 °C) y <b>Tabla</b> (<kbd>M</kbd>: todos los motores y la batería completa)."],
        ],
      },
      { type: "try", view: "pilot", label: "Abrir el Piloto", key: "3" },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "vista-gemelo",
    level: 2,
    toc: "Gemelo 3D",
    title: "Gemelo 3D: el robot real, en tres dimensiones",
    blocks: [
      { type: "p", html: "<b>Para qué sirve:</b> ver el robot como en la ventana del simulador, pero dentro del dashboard. Es el <b>modelo 3D oficial de Unitree</b>; cada articulación gira según el ángulo que informa su motor, 10 veces por segundo (suavizado entre muestras). Funciona igual con el demo, el simulador y el robot real. La telemetría no informa la posición en el piso, así que el robot camina en su lugar: la grilla del piso se desplaza para mostrar que avanza." },
      {
        type: "figure",
        src: `${A}/twin-desktop.png`,
        alt: "Vista Gemelo 3D con el Go2",
        marks: "twin",
        legend: [
          ["Robot y estado", "El modelo conectado y si está <i>en marcha</i> o <i>quieto</i>."],
          ["Roll y pitch", "En grados, con una marca sobre una escala de ±20°. El número se pone ámbar sobre 8° y rojo sobre 15° (peligro de vuelco)."],
          ["Yaw", "El rumbo, con una brújula chica."],
          ["Más caliente", "El motor de mayor temperatura, con su color del semáforo."],
          ["Patas apoyadas y semáforo", "Una pastilla por pata (encendida = apoyada) y cuántos motores hay en verde, amarillo y rojo."],
          ["El robot", "Los <b>anillos</b> en cada articulación tienen el color del semáforo y están perpendiculares a su eje de giro (muestran alrededor de qué gira). Bajo una pata apoyada, el piso brilla. <b>Pasá el mouse</b> por una articulación para ver nombre, temperatura, ángulo, torque y velocidad. Arrastrá para girar la cámara y usá la rueda para el zoom."],
          ["Panel Motores", "Todos los motores con ángulo y temperatura (tecla <kbd>M</kbd>). Al pasar por una fila, se resalta esa articulación en el robot."],
          ["Cámara", "Vistas Perspectiva, Arriba, Lateral y Frente (<kbd>V</kbd>), volver al inicio (<kbd>0</kbd>), <i>Seguir</i> al robot cuando gira (<kbd>F</kbd>) y mostrar u ocultar los anillos (<kbd>J</kbd>). A la derecha: Capturar, Grabar y Exportar CSV."],
        ],
      },
      { type: "callout", kind: "info", html: "Sin placa de video (máquinas virtuales o notebooks viejas) la vista baja sola la calidad (resolución y sombras) para que el resto del dashboard siga recibiendo los 10 datos por segundo." },
      { type: "try", view: "twin", label: "Abrir el Gemelo 3D", key: "4" },
    ],
  },
];
