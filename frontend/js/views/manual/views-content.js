/**
 * Secciones del manual que explican cada vista con capturas anotadas.
 * Las marcas [x, y] están en porcentaje del ancho y alto de la captura.
 */
const A = "assets/manual";

export const VIEW_SECTIONS = [
  {
    id: "vistas",
    toc: "Las vistas",
    kicker: "3",
    title: "Las cuatro vistas, una por una",
    lead: "Todas muestran los mismos datos. Cada una está pensada para una situación distinta.",
    blocks: [],
  },
  {
    id: "vista-consola",
    level: 2,
    toc: "Consola",
    title: "Consola: todos los números, ordenados",
    blocks: [
      { type: "figure", src: `${A}/console-desktop.png`, alt: "Vista Consola", markers: [], legend: [] },
      { type: "try", view: "console", label: "Abrir la Consola", key: "1" },
    ],
  },
  {
    id: "vista-cuerpo",
    level: 2,
    toc: "Cuerpo",
    title: "Cuerpo: el robot es la interfaz",
    blocks: [
      { type: "figure", src: `${A}/body-desktop.png`, alt: "Vista Cuerpo", markers: [], legend: [] },
      { type: "try", view: "body", label: "Abrir el Cuerpo", key: "2" },
    ],
  },
  {
    id: "vista-piloto",
    level: 2,
    toc: "Piloto",
    title: "Piloto: instrumental de cabina",
    blocks: [
      { type: "figure", src: `${A}/pilot-desktop.png`, alt: "Vista Piloto", markers: [], legend: [] },
      { type: "try", view: "pilot", label: "Abrir el Piloto", key: "3" },
    ],
  },
  {
    id: "vista-gemelo",
    level: 2,
    toc: "Gemelo 3D",
    title: "Gemelo 3D: el robot en tres dimensiones",
    blocks: [
      { type: "figure", src: `${A}/twin-desktop.png`, alt: "Vista Gemelo 3D", markers: [], legend: [] },
      { type: "try", view: "twin", label: "Abrir el Gemelo 3D", key: "4" },
    ],
  },
];
