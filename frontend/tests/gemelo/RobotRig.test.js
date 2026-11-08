import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import * as THREE from "three";
import { RobotRig, SEM_COLORS } from "../../js/views/twin/RobotRig.js";
import { PROFILES } from "../../js/views/twin/robotProfiles.js";
import { ROBOTS } from "../../js/core/paseoSim.js";
import { stubCanvas, stubFetchGlb, glbBytes, glbResponse, freshProfile } from "./helpers.js";

let canvas;
beforeEach(() => {
  canvas = stubCanvas();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function cargar(modelo = "go2", opts) {
  stubFetchGlb(opts);
  const rig = new RobotRig(freshProfile(PROFILES[modelo]));
  await rig.load();
  return rig;
}

const near = (a, b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const world = (obj) => obj.getWorldPosition(new THREE.Vector3());

/** Escena mínima con la misma forma que la que genera tools/convert_robot_models.mjs. */
function sceneSintetica({ conExtras = true } = {}) {
  const scene = new THREE.Group();
  const root = new THREE.Group();
  root.name = "mjcf_root";
  if (conExtras) root.userData = { actuators: ["a_joint", "b_joint"], joints: ["a_joint", "b_joint"] };
  const base = new THREE.Group();
  base.name = "base";
  base.userData = { body: "base" };
  base.position.set(5, 5, 5);
  const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x123456 }));
  baseMesh.userData = { geom: "base_0" };
  baseMesh.material.userData = { mjcfMaterial: "desconocido" };
  const leg = new THREE.Group();
  leg.name = "leg";
  leg.position.set(0.2, 0, 0);
  leg.userData = { body: "leg", joint: { name: "a_joint", axis: [0, 2, 0], range: [-1, 1] }, contacts: [[0, 0, -0.3, 0.02]] };
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), new THREE.MeshStandardMaterial());
  foot.userData = { geom: "foot" };
  foot.position.set(0, 0, -0.15);
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial());
  shin.userData = { geom: "shin" };
  const leg2 = new THREE.Group();
  leg2.name = "leg2";
  leg2.position.set(-0.2, 0, 0);
  leg2.userData = { body: "leg2", joint: { name: "b_joint", axis: [1, 0, 0], range: [-1, 1] } };
  leg.add(foot, shin);
  base.add(baseMesh, leg, leg2);
  root.add(base);
  scene.add(root);
  return { scene, root, base, baseMesh, leg, leg2, foot, shin };
}

const perfilSintetico = (extra = {}) => ({
  url: "file:///no/existe.glb",
  jointFor: (n) => `${n}_joint`,
  feet: { P: "leg", Q: "leg2", X: "no_existe" },
  footGeom: "foot",
  padRadius: 0.05,
  restPose: { a: 0.3 },
  markerRadius: () => 0.03,
  materialFor: () => undefined,
  ...extra,
});

describe("carga del Go2 real (go2.glb)", () => {
  test("arma la jerarquía root → zUp → attitude → mjcf_root con los 12 joints", async () => {
    const rig = await cargar("go2");
    expect(rig.root.name).toBe("robot");
    expect(rig.root.children[0]).toBe(rig.zUp);
    expect(rig.zUp.children[0]).toBe(rig.attitude);
    expect(rig.attitude.getObjectByName("mjcf_root")).toBeTruthy();
    expect([...rig.joints.keys()].sort()).toEqual(ROBOTS.go2.motores_nombres.map((n) => `${n}_joint`).sort());
    expect(rig.actuators).toEqual(ROBOTS.go2.motores_nombres.map((n) => `${n}_joint`));
    expect(rig.jointNames).toHaveLength(12);
  });

  test("el MJCF es Z-arriba: +Z del modelo queda como +Y del mundo", async () => {
    const rig = await cargar("go2");
    rig.attitude.position.set(0, 0, 0);
    rig.root.updateMatrixWorld(true);
    const up = rig.attitude.localToWorld(new THREE.Vector3(0, 0, 1));
    near(up.x, 0);
    near(up.y, 1);
    near(up.z, 0);
  });

  test("la base flota: base_link queda en el origen del MJCF", async () => {
    const rig = await cargar("go2");
    const base = rig.attitude.getObjectByName("base_link");
    expect(base.position.toArray()).toEqual([0, 0, 0]);
  });

  test("reemplaza los materiales del MJCF por la paleta PBR con sombras", async () => {
    const rig = await cargar("go2");
    expect(rig.meshes.length).toBeGreaterThan(20);
    const base = rig.attitude.getObjectByName("base_link#0");
    expect(base.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(base.material.color.getHex()).toBe(0x1a1d23);
    expect(base.material.roughness).toBe(0.55);
    expect(base.material.envMapIntensity).toBe(0.9);
    expect(base.material.userData.baseEmissive.getHex()).toBe(0);
    expect(base.castShadow).toBe(true);
    expect(base.receiveShadow).toBe(true);
    const hip = rig.attitude.getObjectByName("FL_hip#0");
    expect(hip.material.color.getHex()).toBe(0xc9ced6);
    expect(hip.material.metalness).toBe(0.75);
  });

  test("aplica la pose de pie de la cátedra mientras no llega un dato", async () => {
    const rig = await cargar("go2");
    expect(rig.joints.get("FR_thigh_joint").angle).toBe(0.8);
    expect(rig.joints.get("RL_calf_joint").angle).toBe(-1.55);
    expect(rig.joints.get("FR_hip_joint").angle).toBe(0);
  });

  test("cada joint guarda eje normalizado, rango, reposo y los materiales de su eslabón", async () => {
    const rig = await cargar("go2");
    const calf = rig.joints.get("FR_calf_joint");
    expect(calf.name).toBe("FR_calf_joint");
    expect(calf.body.name).toBe("FR_calf");
    expect(calf.axis.toArray()).toEqual([0, 1, 0]);
    expect(calf.range).toEqual([-2.7227, -0.83776]);
    expect(calf.materials).toHaveLength(3);
    expect(calf.motor).toBeNull();
  });

  test("un anillo y una esfera de selección por articulación, con el radio del perfil", async () => {
    const rig = await cargar("go2");
    expect(rig.markerGroup).toHaveLength(12);
    expect(rig.hitTargets).toHaveLength(12);
    const hip = rig.joints.get("FR_hip_joint");
    expect(hip.marker.geometry.parameters.radius).toBe(0.034);
    expect(hip.marker.geometry.parameters.tube).toBeCloseTo(0.034 * 0.09);
    expect(hip.marker.material.color.getHex()).toBe(SEM_COLORS.unknown);
    expect(hip.marker.material.depthTest).toBe(false);
    expect(hip.marker.renderOrder).toBe(10);
    expect(hip.marker.userData.joint).toBe("FR_hip_joint");
    // El anillo es perpendicular al eje: su Z local apunta al eje del joint.
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(hip.marker.quaternion);
    near(z.distanceTo(hip.axis), 0);
    const hit = rig.hitTargets.find((t) => t.userData.joint === "FR_hip_joint");
    expect(hit.scale.x).toBeCloseTo(0.034 * 1.25);
    expect(hit.parent).toBe(hip.body);
    // Los anillos del mismo radio comparten geometría.
    expect(rig.joints.get("FR_calf_joint").marker.geometry).toBe(rig.joints.get("FR_thigh_joint").marker.geometry);
    expect(rig.joints.get("FR_calf_joint").marker.geometry).not.toBe(hip.marker.geometry);
  });

  test("el radio mínimo del tubo del anillo es 2,8 mm", () => {
    const rig = new RobotRig(perfilSintetico({ markerRadius: () => 0.01 }));
    rig._build(sceneSintetica().scene);
    expect(rig.joints.get("a_joint").marker.geometry.parameters.tube).toBe(0.0028);
  });

  test("cuatro patas con halo en el piso y la malla foot como material que brilla", async () => {
    const rig = await cargar("go2");
    expect([...rig.feet.keys()]).toEqual(["FR", "FL", "RR", "RL"]);
    const fr = rig.feet.get("FR");
    expect(fr.contacts).toHaveLength(1);
    expect(fr.contacts[0].r).toBe(0.022);
    expect(fr.contacts[0].local.toArray()).toEqual([-0.002, 0, -0.213]);
    expect(fr.footMaterials).toHaveLength(1);
    expect(fr.footMaterials[0]).toBe(rig.attitude.getObjectByName("FR_calf#4").material);
    expect(fr.pad.parent).toBe(rig.root);
    expect(fr.pad.scale.x).toBeCloseTo(0.07 * 2.6);
    expect(fr.pad.material.opacity).toBe(0);
    expect(fr.pad.material.blending).toBe(THREE.AdditiveBlending);
    expect(rig.allContacts).toHaveLength(4);
  });

  test("dibuja el halo con un degradé radial en un canvas de 128 px", async () => {
    await cargar("go2");
    const ctx = canvas.contexts2d.at(-1);
    expect(ctx.createRadialGradient).toHaveBeenCalledWith(64, 64, 0, 64, 64, 64);
    expect(ctx.gradient.addColorStop.mock.calls.map((c) => c[0])).toEqual([0, 0.35, 0.7, 1]);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 128, 128);
    expect(ctx.fillStyle).toBe(ctx.gradient);
  });
});

describe("carga del G1 real (g1.glb)", () => {
  test("29 joints, dos pies, y todo el eslabón del tobillo se ilumina", async () => {
    const rig = await cargar("g1");
    expect(rig.joints.size).toBe(29);
    expect([...rig.feet.keys()]).toEqual(["R_foot", "L_foot"]);
    const r = rig.feet.get("R_foot");
    const ankle = rig.attitude.getObjectByName("right_ankle_roll_link");
    expect(r.footMaterials).toEqual(ankle.children.filter((c) => c.isMesh && c.userData.geom).map((c) => c.material));
    expect(r.footMaterials.length).toBeGreaterThan(0);
    expect(r.contacts.length).toBeGreaterThan(1);
  });

  test("grafito para los grises oscuros del MJCF y aluminio para los claros", async () => {
    const rig = await cargar("g1");
    expect(rig.attitude.getObjectByName("pelvis#0").material.color.getHex()).toBe(0x24272e);
    expect(rig.attitude.getObjectByName("pelvis#1").material.color.getHex()).toBe(0xc4c8d0);
  });

  test("pose de reposo con los brazos un poco abiertos", async () => {
    const rig = await cargar("g1");
    expect(rig.joints.get("left_elbow_joint").angle).toBe(1);
    expect(rig.joints.get("right_shoulder_roll_joint").angle).toBe(-0.18);
  });
});

describe("cinemática", () => {
  test("FR_calf gira FR_calf_joint sobre su eje: la rodilla queda quieta y el pie describe un arco", async () => {
    const rig = await cargar("go2");
    const calf = rig.joints.get("FR_calf_joint");
    const contact = rig.feet.get("FR").contacts[0];
    const footWorld = () => {
      rig.root.updateMatrixWorld(true);
      return contact.local.clone().applyMatrix4(calf.body.matrixWorld);
    };
    const knee0 = world(calf.body);
    const foot0 = footWorld();
    rig.setJoint(calf, -0.9);
    const knee1 = world(calf.body);
    const foot1 = footWorld();
    near(knee0.distanceTo(knee1), 0);
    expect(foot0.distanceTo(foot1)).toBeGreaterThan(0.05);
    near(knee0.distanceTo(foot0), knee1.distanceTo(foot1));
    // reposo · rotación(eje, q), como un hinge de MuJoCo
    const esperado = calf.rest.clone().multiply(new THREE.Quaternion().setFromAxisAngle(calf.axis, -0.9));
    near(calf.body.quaternion.angleTo(esperado), 0);
    expect(calf.angle).toBe(-0.9);
  });

  test("con q = 0 el eslabón vuelve a su cuaternión de reposo", async () => {
    const rig = await cargar("go2");
    const thigh = rig.joints.get("FL_thigh_joint");
    rig.setJoint(thigh, 0);
    near(thigh.body.quaternion.angleTo(thigh.rest), 0);
  });

  test("setPose mueve los joints conocidos e ignora los que no existen", async () => {
    const rig = await cargar("go2");
    rig.setPose({ FR_hip_joint: 0.2, cola_joint: 1 });
    expect(rig.joints.get("FR_hip_joint").angle).toBe(0.2);
    expect(rig.joints.has("cola_joint")).toBe(false);
  });

  test("setAttitude usa la convención ZYX del backend (yaw → pitch → roll)", async () => {
    const rig = await cargar("go2");
    rig.setAttitude(0.1, -0.2, 1.3);
    const esperado = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.2, 1.3, "ZYX"));
    near(rig.attitude.quaternion.angleTo(esperado), 0);
    // Con solo yaw, el frente del robot (+X del MJCF) gira alrededor de +Y del mundo.
    rig.setAttitude(0, 0, Math.PI / 2);
    rig.root.updateMatrixWorld(true);
    const o = rig.attitude.localToWorld(new THREE.Vector3(0, 0, 0));
    const fwd = rig.attitude.localToWorld(new THREE.Vector3(1, 0, 0)).sub(o);
    near(fwd.x, 0);
    near(fwd.z, -1);
  });
});

describe("apoyo en el piso", () => {
  const lowest = (rig) => {
    rig.root.updateMatrixWorld(true);
    return Math.min(...rig.allContacts.map((c) => c.local.clone().applyMatrix4(c.body.matrixWorld).y - c.r));
  };

  test("ground(1) deja el punto de apoyo más bajo justo en y = 0", async () => {
    const rig = await cargar("go2");
    rig.ground(1);
    near(lowest(rig), 0);
    expect(rig.groundOffset).toBeGreaterThan(0.2);
    expect(rig.attitude.position.z).toBe(rig.groundOffset);
  });

  test("con suavizado se acerca de a poco y converge", async () => {
    const rig = await cargar("go2");
    rig.groundOffset = 0;
    rig.attitude.position.z = 0;
    const antes = -lowest(rig);
    rig.ground(0.5);
    near(rig.groundOffset, antes * 0.5);
    for (let i = 0; i < 40; i++) rig.ground(0.5);
    near(lowest(rig), 0, 1e-5);
  });

  test("al flexionar las rodillas el robot baja", async () => {
    const rig = await cargar("go2");
    rig.ground(1);
    const alto = rig.groundOffset;
    for (const leg of ["FR", "FL", "RR", "RL"]) rig.setJoint(rig.joints.get(`${leg}_calf_joint`), -2.4);
    rig.ground(1);
    expect(rig.groundOffset).toBeLessThan(alto - 0.05);
  });

  test("sin puntos de apoyo no se mueve", () => {
    const rig = new RobotRig(perfilSintetico({ feet: {} }));
    rig._build(sceneSintetica().scene);
    rig.groundOffset = 0.3;
    rig.attitude.position.z = 0.3;
    rig.ground(1);
    expect(rig.groundOffset).toBe(0.3);
    expect(rig.attitude.position.z).toBe(0.3);
  });
});

describe("patas apoyadas (updateFeet)", () => {
  test("la pata apoyada enciende el halo debajo del pie y el pie brilla en cian", async () => {
    const rig = await cargar("go2");
    rig.ground(1);
    rig.updateFeet({ FR: 1, FL: 0, RR: 1, RL: 0 }, 1);
    const fr = rig.feet.get("FR");
    expect(fr.level).toBe(1);
    expect(fr.pad.visible).toBe(true);
    expect(fr.pad.material.opacity).toBeCloseTo(0.9);
    const foot = fr.contacts[0].local.clone().applyMatrix4(fr.contacts[0].body.matrixWorld);
    near(fr.pad.position.x, foot.x);
    near(fr.pad.position.z, foot.z);
    expect(fr.pad.position.y).toBe(0.002);
    const e = fr.footMaterials[0].emissive;
    expect([e.r, e.g, e.b].map((x) => +x.toFixed(4))).toEqual([0.05, 0.55, 0.65]);
    const fl = rig.feet.get("FL");
    expect(fl.level).toBe(0);
    expect(fl.pad.visible).toBe(false);
    expect(fl.footMaterials[0].emissive.getHex()).toBe(0);
  });

  test("el encendido es gradual: con dt chico sube una fracción (dt · 14)", async () => {
    const rig = await cargar("go2");
    rig.updateFeet({ FR: 1 }, 0.01);
    const fr = rig.feet.get("FR");
    expect(fr.level).toBeCloseTo(0.14);
    expect(fr.pad.material.opacity).toBeCloseTo(0.9 * 0.14);
    rig.updateFeet({ FR: 0 }, 0.01);
    expect(fr.level).toBeCloseTo(0.14 * 0.86);
  });

  test("el halo se oculta por debajo de 1 % de intensidad", async () => {
    const rig = await cargar("go2");
    const fr = rig.feet.get("FR");
    fr.level = 0.0105;
    rig.updateFeet({ FR: 1 }, 0);
    expect(fr.pad.visible).toBe(true);
    fr.level = 0.01;
    rig.updateFeet({ FR: 1 }, 0);
    expect(fr.pad.visible).toBe(false);
  });

  test("sin fuerzas (undefined) todas las patas se apagan", async () => {
    const rig = await cargar("go2");
    rig.updateFeet({ FR: 1, FL: 1, RR: 1, RL: 1 }, 1);
    rig.updateFeet(undefined, 1);
    expect([...rig.feet.values()].map((f) => f.level)).toEqual([0, 0, 0, 0]);
  });

  test("G1: el brillo del pie es más tenue (footGlow 0,25)", async () => {
    const rig = await cargar("g1");
    rig.updateFeet({ R_foot: 1, L_foot: 0 }, 1);
    const e = rig.feet.get("R_foot").footMaterials[0].emissive;
    expect(e.g).toBeCloseTo(0.55 * 0.25);
    expect(e.b).toBeCloseTo(0.65 * 0.25);
  });
});

describe("semáforo en las articulaciones (setJointLevel)", () => {
  test("rojo: anillo rojo y el eslabón teñido al 38 %", async () => {
    const rig = await cargar("go2");
    const j = rig.joints.get("FR_thigh_joint");
    rig.setJointLevel(j, "crit");
    expect(j.marker.material.color.getHex()).toBe(SEM_COLORS.crit);
    expect(j.marker.scale.x).toBe(1);
    const esperado = new THREE.Color(SEM_COLORS.crit).multiplyScalar(0.38);
    for (const m of j.materials) near(m.emissive.r, esperado.r);
    for (const m of j.materials) near(m.emissive.g, esperado.g);
  });

  test("amarillo: tinte al 16 %", async () => {
    const rig = await cargar("go2");
    const j = rig.joints.get("FR_thigh_joint");
    rig.setJointLevel(j, "warn");
    expect(j.marker.material.color.getHex()).toBe(SEM_COLORS.warn);
    near(j.materials[0].emissive.r, new THREE.Color(SEM_COLORS.warn).r * 0.16);
  });

  test("verde: anillo verde y sin tinte", async () => {
    const rig = await cargar("go2");
    const j = rig.joints.get("FR_thigh_joint");
    rig.setJointLevel(j, "crit");
    rig.setJointLevel(j, "ok");
    expect(j.marker.material.color.getHex()).toBe(SEM_COLORS.ok);
    expect(j.materials[0].emissive.getHex()).toBe(0);
  });

  test("un nivel desconocido pinta el anillo gris y no tiñe", async () => {
    const rig = await cargar("go2");
    const j = rig.joints.get("FR_thigh_joint");
    rig.setJointLevel(j, "raro");
    expect(j.marker.material.color.getHex()).toBe(SEM_COLORS.unknown);
    expect(j.materials[0].emissive.getHex()).toBe(0);
  });

  test("resaltado: anillo más grande (×1,35) y eslabón en azul", async () => {
    const rig = await cargar("go2");
    const j = rig.joints.get("FR_thigh_joint");
    rig.setJointLevel(j, "crit", true);
    expect(j.marker.scale.x).toBe(1.35);
    const e = j.materials[0].emissive;
    expect([e.r, e.g, e.b].map((x) => +x.toFixed(4))).toEqual([0.12, 0.2, 0.35]);
  });

  test("los colores del semáforo son los del dashboard", () => {
    expect(SEM_COLORS).toEqual({ ok: 0x22c55e, warn: 0xf59e0b, crit: 0xef4444, unknown: 0x8b93a7 });
  });

  test("setMarkersVisible muestra y oculta todos los anillos", async () => {
    const rig = await cargar("go2");
    rig.setMarkersVisible(false);
    expect(rig.markerGroup.every((r) => r.visible === false)).toBe(true);
    rig.setMarkersVisible(true);
    expect(rig.markerGroup.every((r) => r.visible === true)).toBe(true);
  });
});

describe("motores (setMotors)", () => {
  test("Go2: los 12 motores de info.motores_nombres quedan asignados a su joint", async () => {
    const rig = await cargar("go2");
    const motors = rig.setMotors(ROBOTS.go2.motores_nombres);
    expect(motors).toBe(rig.motors);
    expect(motors.every((m) => m.joint)).toBe(true);
    expect(rig.joints.get("FR_calf_joint").motor).toEqual({ index: 2, nombre: "FR_calf", joint: "FR_calf_joint" });
  });

  test("al reasignar, los joints que quedan sin motor vuelven a null", async () => {
    const rig = await cargar("go2");
    rig.setMotors(ROBOTS.go2.motores_nombres);
    rig.setMotors(["RL_calf", "cola"]);
    expect(rig.joints.get("FR_calf_joint").motor).toBeNull();
    expect(rig.joints.get("RL_calf_joint").motor.index).toBe(0);
    expect(rig.motors[1].joint).toBeNull();
  });

  test("G1 por índice: el motor i mueve el actuador i del MJCF", async () => {
    const rig = await cargar("g1");
    const motors = rig.setMotors(["L_hip_yaw", "L_hip_roll", "L_hip_pitch"], "indice");
    expect(motors.map((m) => m.joint)).toEqual(["left_hip_pitch_joint", "left_hip_roll_joint", "left_hip_yaw_joint"]);
    const porNombre = rig.setMotors(["L_hip_yaw"], "nombre");
    expect(porNombre[0].joint).toBe("left_hip_yaw_joint");
  });

  test("G1: los 29 motores del simulador encuentran su articulación", async () => {
    const rig = await cargar("g1");
    expect(rig.setMotors(ROBOTS.g1.motores_nombres).filter((m) => !m.joint)).toEqual([]);
  });
});

describe("selección con el puntero (pick)", () => {
  const rayHacia = (rig, punto, desde) => {
    const r = RobotRig.makeRaycaster();
    r.set(desde, punto.clone().sub(desde).normalize());
    return r;
  };

  test("makeRaycaster devuelve un Raycaster de three", () => {
    expect(RobotRig.makeRaycaster()).toBeInstanceOf(THREE.Raycaster);
  });

  test("un rayo a la articulación devuelve ese joint (gana el anillo)", async () => {
    const rig = await cargar("go2");
    rig.ground(1);
    rig.root.updateMatrixWorld(true);
    const j = rig.joints.get("FR_hip_joint");
    // Desde adelante (+X) y apenas corrido del centro (en el polo de la esfera el rayo roza vértices).
    const p = rig.jointWorldPosition(j).add(new THREE.Vector3(0, 0.003, 0.002));
    expect(rig.pick(rayHacia(rig, p, p.clone().add(new THREE.Vector3(3, 0, 0))))?.name).toBe("FR_hip_joint");
  });

  test("un rayo a la malla de un eslabón (lejos del anillo) devuelve su joint", () => {
    const rig = new RobotRig(perfilSintetico());
    const s = sceneSintetica();
    rig._build(s.scene);
    rig.root.updateMatrixWorld(true);
    const p = s.foot.localToWorld(new THREE.Vector3(0, 0, -0.12)); // mitad baja de la pierna
    const j = rig.pick(rayHacia(rig, p, p.clone().add(new THREE.Vector3(0, 0, 3))));
    expect(j?.name).toBe("a_joint");
    expect(j).toBe(rig.joints.get("a_joint"));
  });

  test("un rayo al cuerpo devuelve la base (siempre el mismo objeto)", async () => {
    const rig = await cargar("go2");
    rig.ground(1);
    rig.root.updateMatrixWorld(true);
    const base = rig.attitude.getObjectByName("base_link");
    const p = world(base);
    const a = rig.pick(rayHacia(rig, p, p.clone().add(new THREE.Vector3(0, 3, 0))));
    expect(a).toEqual({ name: "base_link", base: true, body: base });
    const b = rig.pick(rayHacia(rig, p, p.clone().add(new THREE.Vector3(0, 3, 0.001))));
    expect(b).toBe(a);
  });

  test("un rayo que no toca el robot devuelve null", async () => {
    const rig = await cargar("go2");
    rig.root.updateMatrixWorld(true);
    const r = RobotRig.makeRaycaster();
    r.set(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 1, 0));
    expect(rig.pick(r)).toBeNull();
  });

  test("una malla suelta sin eslabón con datos devuelve null", () => {
    const rig = new RobotRig(perfilSintetico());
    rig._build(sceneSintetica().scene);
    const suelta = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    rig.meshes = [suelta];
    rig.hitTargets = [];
    suelta.updateMatrixWorld(true);
    const r = RobotRig.makeRaycaster();
    r.set(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
    expect(rig.pick(r)).toBeNull();
  });

  test("jointWorldPosition escribe en el vector que se le pasa o en uno nuevo", async () => {
    const rig = await cargar("go2");
    const j = rig.joints.get("FL_hip_joint");
    const v = new THREE.Vector3();
    expect(rig.jointWorldPosition(j, v)).toBe(v);
    expect(rig.jointWorldPosition(j).toArray()).toEqual(v.toArray());
  });
});

describe("escena sin extras ni materiales conocidos", () => {
  test("sin actuators/joints en mjcf_root usa listas vacías y el color original del geom", () => {
    const rig = new RobotRig(perfilSintetico());
    const s = sceneSintetica({ conExtras: false });
    const original = s.baseMesh.material;
    const dispose = vi.spyOn(original, "dispose");
    rig._build(s.scene);
    expect(rig.actuators).toEqual([]);
    expect(rig.jointNames).toEqual([]);
    expect(s.baseMesh.material).not.toBe(original);
    expect(s.baseMesh.material.color.getHex()).toBe(0x123456);
    expect(dispose).toHaveBeenCalledOnce();
    expect(s.base.position.toArray()).toEqual([0, 0, 0]);
  });

  test("el eje del joint se normaliza", () => {
    const rig = new RobotRig(perfilSintetico());
    rig._build(sceneSintetica().scene);
    expect(rig.joints.get("a_joint").axis.toArray()).toEqual([0, 1, 0]);
    expect(rig.joints.get("a_joint").angle).toBe(0.3);
  });

  test("pata sin contactos: un punto en el origen del eslabón; pata inexistente: se omite", () => {
    const rig = new RobotRig(perfilSintetico());
    const s = sceneSintetica();
    rig._build(s.scene);
    expect([...rig.feet.keys()]).toEqual(["P", "Q"]);
    const q = rig.feet.get("Q");
    expect(q.contacts).toHaveLength(1);
    expect(q.contacts[0].local.toArray()).toEqual([0, 0, 0]);
    expect(q.contacts[0].r).toBe(0);
    expect(q.footMaterials).toEqual([]);
    // footGeom "foot": solo la malla del pie, no la canilla
    expect(rig.feet.get("P").footMaterials).toEqual([s.foot.material]);
  });

  test("pata con lista de contactos vacía: el halo se enciende pero no se mueve de lugar", () => {
    const rig = new RobotRig(perfilSintetico());
    const s = sceneSintetica();
    s.leg2.userData.contacts = [];
    rig._build(s.scene);
    const q = rig.feet.get("Q");
    expect(q.contacts).toEqual([]);
    q.pad.position.set(1, 2, 3);
    rig.updateFeet({ Q: 1 }, 1);
    expect(q.pad.position.toArray()).toEqual([1, 2, 3]);
    expect(q.pad.visible).toBe(true);
  });

  test("sin footGlow en el perfil el pie brilla con intensidad 1", () => {
    const rig = new RobotRig(perfilSintetico());
    const s = sceneSintetica();
    rig._build(s.scene);
    rig.updateFeet({ P: 1 }, 1);
    expect(s.foot.material.emissive.g).toBeCloseTo(0.55);
  });
});

describe("descarga del modelo", () => {
  test("informa el progreso por pedazos, nunca llega a 1 antes de terminar", async () => {
    const fetch = stubFetchGlb({ chunks: 4 });
    const rig = new RobotRig(freshProfile(PROFILES.go2));
    const progress = [];
    await rig.load((p) => progress.push(p));
    expect(fetch).toHaveBeenCalledWith(rig.profile.url);
    expect(progress).toHaveLength(4);
    expect(progress[0]).toBeCloseTo(0.25, 2);
    expect(progress.at(-1)).toBe(0.99);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(rig.joints.size).toBe(12);
  });

  test("con gzip (Content-Length menor que lo leído) igual arma el robot completo", async () => {
    const bytes = glbBytes(PROFILES.go2.url);
    vi.stubGlobal("fetch", vi.fn(async () => glbResponse(bytes, { chunks: 3, contentLength: Math.round(bytes.length / 3) })));
    const rig = new RobotRig(freshProfile(PROFILES.go2));
    const progress = [];
    await rig.load((p) => progress.push(p));
    expect(progress.every((p) => p <= 0.99)).toBe(true);
    expect(progress.at(-1)).toBe(0.99);
    expect(rig.joints.size).toBe(12);
  });

  test("sin Content-Length lee el cuerpo entero (sin progreso intermedio)", async () => {
    stubFetchGlb();
    const rig = new RobotRig(freshProfile(PROFILES.go2));
    const onProgress = vi.fn();
    await rig.load(onProgress);
    expect(onProgress).not.toHaveBeenCalled();
    expect(rig.joints.size).toBe(12);
  });

  test("con Content-Length pero sin body también lee entero", async () => {
    const bytes = glbBytes(PROFILES.go2.url);
    const res = glbResponse(bytes);
    res.headers = new Headers({ "content-length": "100" });
    vi.stubGlobal("fetch", vi.fn(async () => res));
    const rig = await new RobotRig(freshProfile(PROFILES.go2)).load();
    expect(rig.joints.size).toBe(12);
  });

  test("el mismo modelo se descarga una sola vez (caché) aunque se pidan dos a la vez", async () => {
    const fetch = stubFetchGlb({ chunks: 2 });
    const profile = freshProfile(PROFILES.go2);
    const p1 = vi.fn();
    const p2 = vi.fn();
    const [a, b] = await Promise.all([new RobotRig(profile).load(p1), new RobotRig(profile).load(p2)]);
    await new RobotRig(profile).load();
    expect(fetch).toHaveBeenCalledOnce();
    expect(p1).toHaveBeenCalledTimes(2);
    expect(p2).toHaveBeenCalledTimes(2);
    expect(a.root).not.toBe(b.root);
    expect(a.joints.get("FR_hip_joint").body).not.toBe(b.joints.get("FR_hip_joint").body);
  });

  test("si el servidor responde error, rechaza con el código y permite reintentar", async () => {
    const profile = freshProfile(PROFILES.go2);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(new RobotRig(profile).load()).rejects.toThrow("No se pudo descargar el modelo (404)");
    const fetch = stubFetchGlb();
    const rig = await new RobotRig(profile).load();
    expect(fetch).toHaveBeenCalledOnce();
    expect(rig.joints.size).toBe(12);
  });
});

describe("dispose", () => {
  test("libera geometrías, materiales y texturas propias y saca el robot de la escena", async () => {
    const rig = await cargar("go2");
    const scene = new THREE.Scene();
    scene.add(rig.root);
    const tracked = [...rig._disposables];
    const spies = tracked.map((d) => vi.spyOn(d, "dispose"));
    expect(tracked.length).toBeGreaterThan(rig.meshes.length * 2);
    expect(tracked).toContain(rig.meshes[0].geometry);
    expect(tracked).toContain(rig.meshes[0].material);
    rig.dispose();
    expect(spies.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(rig._disposables.size).toBe(0);
    expect(rig.root.parent).toBeNull();
    expect(scene.children).not.toContain(rig.root);
  });

  test("tolera objetos sin dispose", () => {
    const rig = new RobotRig(perfilSintetico());
    rig._track({});
    expect(() => rig.dispose()).not.toThrow();
  });
});
