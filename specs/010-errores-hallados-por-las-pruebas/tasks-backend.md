# Tareas 010 · Backend: errores hallados por las pruebas

> Branch `fix/hallazgos-backend`. Cada FR tiene una prueba que falló antes del arreglo y un commit
> `fix(backend): …` que la cita. Cobertura de líneas y ramas: 100 %.

- [x] FR-013 Un `.simulador_activo.json` que no es objeto se ignora y GET /fuentes no da 500 — `backend/tests/test_reader_simulador.py` › `test_fr013_json_que_no_es_objeto_se_ignora`; `backend/tests/test_fuentes.py` › `test_fr013_get_fuentes_con_marca_que_no_es_objeto_no_da_500`
- [x] FR-014 `iniciar.py` respeta `--puerto=valor` (y sigue con `--puerto valor`) — `backend/tests/test_iniciar.py` › `test_fr014_opcion_lee_la_forma_con_igual`, `test_fr014_tiene_opcion_reconoce_las_dos_formas`, `test_fr014_respeta_el_puerto_pedido_con_igual`
- [x] FR-015 El lector DDS cierra también el suscriptor de la batería — `backend/tests/test_reader_dds.py` › `test_fr015_cerrar_tambien_cierra_el_suscriptor_de_la_bateria`, `test_fr015_cerrar_sin_suscriptor_de_bateria`
- [x] FR-016 POST /fuente con `"interfaz": ""` pide la interfaz automática (`None`) — `backend/tests/test_fuentes.py` › `test_fr016_interfaz_vacia_es_automatica`
- [x] FR-017 `esperar_primer_dato(timeout=0)` devuelve `True` si ya hay dato en los dos lectores reales — `backend/tests/test_reader_simulador.py` › `test_fr017_timeout_cero_con_dato_responde_true`, `test_fr017_timeout_cero_sin_dato_no_espera`; `backend/tests/test_reader_dds.py` › `test_fr017_timeout_cero_con_dato_responde_true`
