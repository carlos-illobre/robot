/**
 * Registro de vistas (patrón Strategy).
 *
 * Las cuatro vistas muestran LOS MISMOS datos (mismo servicio, mismo historial,
 * mismas capturas) de tres formas distintas. Cambiar de vista no corta la
 * conexión ni pierde el historial: solo cambia la estrategia de presentación.
 *
 * Cada módulo se carga recién cuando se usa (import dinámico).
 */
export const VIEWS = [
  {
    id: "console",
    label: "Consola",
    hint: "Los cuatro paneles, densos y ordenados",
    key: "1",
    icon: "list",
    theme: "dark",
    load: () => import("./console/ConsoleView.js"),
  },
  {
    id: "body",
    label: "Cuerpo",
    hint: "El robot es la interfaz",
    key: "2",
    icon: "robot",
    theme: "light",
    load: () => import("./body/BodyView.js"),
  },
  {
    id: "pilot",
    label: "Piloto",
    hint: "Instrumental de cabina a pantalla completa",
    key: "3",
    icon: "compass",
    theme: "dark",
    load: () => import("./pilot/PilotView.js"),
  },
  {
    id: "twin",
    label: "Gemelo 3D",
    hint: "El robot en 3D, movido por los ángulos reales de sus motores",
    key: "4",
    icon: "cube",
    theme: "dark",
    load: () => import("./twin/TwinView.js"),
  },
  {
    id: "manual",
    label: "Manual",
    hint: "Cómo leer cada dato y usar el dashboard, con capturas",
    key: "5",
    icon: "book",
    theme: "light",
    load: () => import("./manual/ManualView.js"),
  },
];

export const viewById = (id) => VIEWS.find((v) => v.id === id) ?? VIEWS[0];
