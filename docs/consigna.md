# Consigna — TP Robótica: Dashboard Web de Telemetría

> Transcripción del enunciado entregado por la cátedra.

En el ámbito de la robótica y los sistemas embebidos, los datos de telemetría son fundamentales
para supervisar el estado de los equipos, detectar anomalías y tomar decisiones en tiempo real.
Herramientas como el monitor de motores Unitree (electroSim) —desarrollado en la cátedra con
Python y PyQt6— permiten visualizar en tiempo real el ángulo, velocidad, torque y temperatura de
cada motor del robot, junto con datos del sistema inercial (IMU), la batería (BMS) y las fuerzas de
contacto por pata.

Este TPO propone construir la versión web de ese mismo monitor: una aplicación cliente-servidor
donde un backend en Python expone los datos del robot como un servicio REST y un frontend en
HTML/JS consume esos datos para construir un dashboard interactivo en el navegador. La división
entre backend (proveedor de datos) y frontend (visualizador) es el patrón central de la materia:
el alumno experimenta directamente qué significa integrar componentes independientes a través de
una interfaz de servicio definida.

El modo demo del servidor —sin necesidad del robot físico— permite desarrollar y probar el
dashboard completo durante el taller, replicando la estrategia usada en la app de escritorio
original.

## Objetivos generales

- Construir una arquitectura cliente-servidor donde un servicio Python expone telemetría del robot
  y un frontend web la consume y visualiza.
- Aplicar patrones de integración (Adapter, Observer, Facade) para desacoplar la fuente de datos
  del robot de la capa de presentación web.
- Implementar visualización de datos en tiempo real con gráficos de línea históricos, indicadores
  semafóricos y tablas actualizables.
- Incorporar funcionalidades de exportación de datos (CSV) replicando la capacidad de captura y
  exportación presente en el monitor de escritorio.

## Objetivos específicos

- Levantar el servidor FastAPI provisto por la cátedra (basado en la arquitectura de electroSim) y
  verificar que responde correctamente a los endpoints de telemetría.
- Implementar el panel de motores: tabla con temperatura (semáforo verde/amarillo/rojo igual al
  monitor de escritorio), ángulo, velocidad y torque de cada motor.
- Implementar el panel IMU: visualización de roll, pitch y yaw en tiempo real con indicadores
  numéricos y gráfico de línea histórico.
- Implementar el panel BMS: nivel de carga (%), corriente, temperatura y voltajes individuales de
  celda.
- Implementar el panel de fuerzas por pata: indicadores de contacto para las cuatro patas
  (FR, FL, RR, RL).
- Implementar la exportación CSV de los datos capturados durante la sesión, replicando la
  funcionalidad de captura de electroSim.
- Reemplazar el polling por WebSocket (extensión) para recibir los datos del servidor en modo
  push, eliminando la latencia del intervalo fijo.

## Modalidad de trabajo

**Organización:** equipos de 2 a 3 personas. Roles sugeridos: un integrante lidera el backend
(configuración del servidor FastAPI, endpoints, modo demo), otro el frontend (HTML/CSS/JS,
paneles, Chart.js) y el tercero la integración y exportación CSV.

**Modalidad tecnológica:**

- **Modo demo:** el servidor FastAPI corre en modo simulación sin robot físico. Los datos varían de
  forma realista para poder probar todos los paneles del dashboard.
- **Con robot real:** el servidor se conecta al robot vía DDS/SDK. El frontend no cambia; solo
  cambia la fuente de datos del backend. Disponible en laboratorio bajo supervisión docente.

## Consigna

Construyan un dashboard web que replique en el navegador las capacidades del monitor de motores
Unitree (electroSim). El backend (servidor FastAPI) es provisto por la cátedra; ustedes construyen
el frontend. El dashboard debe tener cuatro paneles funcionales:

1. **Panel de motores:** tabla con temperatura (semáforo: verde < 40 °C, amarillo 40–60 °C,
   rojo > 60 °C, igual a electroSim), ángulo (°), velocidad angular (rad/s) y torque estimado
   (N·m) para cada motor del robot seleccionado (12 motores para Go2, 29 para G1).
2. **Panel IMU:** valores numéricos de roll, pitch y yaw con un gráfico de línea histórico de al
   menos 60 muestras.
3. **Panel BMS:** nivel de carga (%), corriente (mA), temperatura de batería y voltajes
   individuales de celda.
4. **Panel de fuerzas por pata:** indicadores de contacto para FR (delantera derecha),
   FL (delantera izquierda), RR (trasera derecha) y RL (trasera izquierda).

**Requisitos transversales:** actualización automática mediante polling a `/telemetria` (máx.
500 ms de intervalo) o WebSocket; botón de **Capturar muestra** que guarda el estado actual; botón
de **Exportar CSV** que descarga todas las muestras capturadas. El dashboard debe funcionar
correctamente en modo demo del servidor.
