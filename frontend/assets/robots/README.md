# Modelos 3D de los robots (Gemelo 3D)

| Archivo | Robot | Peso | Triángulos | Articulaciones |
|---|---|---|---|---|
| `go2/go2.glb` | Unitree Go2 | 655 KiB | 28.528 (de 196.748) | 12 |
| `g1/g1.glb` | Unitree G1 (29 GDL) | 1,35 MiB | 58.784 (de 370.714) | 29 |

## Procedencia

Son los modelos **oficiales de Unitree** que usa el simulador MuJoCo de la cátedra
(`UadeRobotLab/05LaboratoriosTPs/TP05_Desarrollo_de_Aplicaciones_II/entorno/sim/unitree_mujoco/unitree_robots/`,
originalmente del repositorio `unitreerobotics/unitree_mujoco`):

- Go2: `go2/go2.xml` + `go2/assets/*.obj` (28 MB).
- G1: `g1/g1_29dof.xml` + `g1/meshes/*.STL` (18 MB).

Licencia: **BSD-3-Clause**, © HangZhou YuShu Technology Co., Ltd. ("Unitree Robotics").
El texto completo está en `go2/LICENSE` y `g1/LICENSE` (exigido por la licencia al redistribuir).

## Conversión

Los genera `tools/convert_robot_models.mjs` (Node ≥ 18, sin internet una vez instalado):

```bash
npm --prefix tools ci
node tools/convert_robot_models.mjs --src <ruta>/unitree_mujoco/unitree_robots
```

Qué hace, en orden:

1. Lee el MJCF resolviendo las clases `<default>`/`childclass` como MuJoCo: `pos`/`quat` de cada
   `<body>`, `axis`/`range` de cada `<joint>`, y los `<geom>` visibles (descarta los de colisión,
   grupo 3, y las mallas duplicadas del G1).
2. Suelda vértices, **simplifica** cada malla con meshoptimizer (≈ 12–14 % de los triángulos, error
   geométrico ≤ 0,4 % del tamaño de la pieza) y recalcula normales con pliegue a 38°.
3. Escribe un glTF cuya **jerarquía de nodos es la cadena cinemática**: un nodo por `<body>` con
   `extras.joint = { name, axis, range }`, un nodo hijo por `<geom>` (`extras.geom` = malla), y en
   `mjcf_root.extras` el orden de actuadores del MJCF. Las esferas de contacto de los pies quedan en
   `extras.contacts` (sirven para apoyar el robot en el piso).
4. Cuantiza (`KHR_mesh_quantization`) y comprime (`EXT_meshopt_compression`). Three.js lo abre con
   `GLTFLoader` + `MeshoptDecoder` (ambos en `frontend/vendor/three/`, sin CDN).

Es determinista: misma entrada → mismo `.glb`. El MJCF es Z-arriba; el visor rota la raíz −90° en X.
