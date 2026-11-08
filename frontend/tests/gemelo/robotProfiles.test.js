import { describe, test, expect, vi, afterEach } from "vitest";
import { PROFILES, profileFor, mappingMode, mapMotors } from "../../js/views/twin/robotProfiles.js";
import { ROBOTS } from "../../js/core/paseoSim.js";

afterEach(() => {
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("profileFor", () => {
  test("devuelve el perfil del Go2 y del G1 sin importar mayúsculas", () => {
    expect(profileFor("go2")).toBe(PROFILES.go2);
    expect(profileFor("GO2")).toBe(PROFILES.go2);
    expect(profileFor("G1")).toBe(PROFILES.g1);
  });

  test("devuelve null para un robot sin modelo 3D, vacío o sin modelo", () => {
    expect(profileFor("h1")).toBeNull();
    expect(profileFor("")).toBeNull();
    expect(profileFor(null)).toBeNull();
    expect(profileFor(undefined)).toBeNull();
  });
});

describe("perfiles", () => {
  test("las URL de los modelos apuntan a assets/robots/<modelo>/<modelo>.glb", () => {
    expect(PROFILES.go2.url).toMatch(/\/frontend\/assets\/robots\/go2\/go2\.glb$/);
    expect(PROFILES.g1.url).toMatch(/\/frontend\/assets\/robots\/g1\/g1\.glb$/);
    expect(PROFILES.go2.label).toBe("Unitree Go2");
    expect(PROFILES.g1.label).toBe("Unitree G1");
  });

  test("Go2: cada motor del contrato se llama igual que su joint con _joint", () => {
    expect(PROFILES.go2.jointFor("FR_hip")).toBe("FR_hip_joint");
    expect(PROFILES.go2.jointFor("RL_calf")).toBe("RL_calf_joint");
  });

  test("G1: L_/R_ pasan a left_/right_ y torso_ a waist_", () => {
    const j = PROFILES.g1.jointFor;
    expect(j("L_hip_pitch")).toBe("left_hip_pitch_joint");
    expect(j("R_wrist_yaw")).toBe("right_wrist_yaw_joint");
    expect(j("torso_yaw")).toBe("waist_yaw_joint");
    // Solo el prefijo: un "L_" en el medio no se toca.
    expect(j("xL_knee")).toBe("xL_knee_joint");
    expect(j("R_L_x")).toBe("right_L_x_joint");
  });

  test("Go2: radio del anillo más grande en la cadera que en el resto", () => {
    expect(PROFILES.go2.markerRadius("FR_hip_joint")).toBe(0.034);
    expect(PROFILES.go2.markerRadius("FR_calf_joint")).toBe(0.03);
  });

  test("G1: radio del anillo según la parte del cuerpo", () => {
    const r = PROFILES.g1.markerRadius;
    expect(r("left_wrist_roll_joint")).toBe(0.024);
    expect(r("left_shoulder_pitch_joint")).toBe(0.032);
    expect(r("right_elbow_joint")).toBe(0.032);
    expect(r("waist_yaw_joint")).toBe(0.05);
    expect(r("left_knee_joint")).toBe(0.042);
  });

  test("Go2: material PBR por nombre del MJCF, undefined si no lo conoce", () => {
    expect(PROFILES.go2.materialFor("black")).toEqual({ color: 0x1a1d23, roughness: 0.55, metalness: 0.15 });
    expect(PROFILES.go2.materialFor("metal")).toEqual({ color: 0xc9ced6, roughness: 0.32, metalness: 0.75 });
    expect(PROFILES.go2.materialFor("white").color).toBe(0xeef0f3);
    expect(PROFILES.go2.materialFor("gray").color).toBe(0x8c93a6);
    expect(PROFILES.go2.materialFor("rojo")).toBeUndefined();
  });

  test("G1: grafito si el gris del MJCF es oscuro (< 0,4), aluminio si es claro o no hay rgba", () => {
    const grafito = { color: 0x24272e, roughness: 0.5, metalness: 0.2 };
    const aluminio = { color: 0xc4c8d0, roughness: 0.36, metalness: 0.45 };
    expect(PROFILES.g1.materialFor(null, [0.2, 0.2, 0.2, 1])).toEqual(grafito);
    expect(PROFILES.g1.materialFor(null, [0.39, 0, 0, 1])).toEqual(grafito);
    expect(PROFILES.g1.materialFor(null, [0.4, 0, 0, 1])).toEqual(aluminio);
    expect(PROFILES.g1.materialFor(null, [0.7, 0.7, 0.7, 1])).toEqual(aluminio);
    expect(PROFILES.g1.materialFor(null, undefined)).toEqual(aluminio);
  });

  test("las patas de cada perfil son las de info.patas del simulador", () => {
    expect(Object.keys(PROFILES.go2.feet)).toEqual(ROBOTS.go2.patas);
    expect(Object.keys(PROFILES.g1.feet).sort()).toEqual([...ROBOTS.g1.patas].sort());
  });
});

describe("mappingMode", () => {
  test("por nombre si la URL no dice nada", () => {
    expect(mappingMode()).toBe("nombre");
  });

  test("por índice con ?mapeo=indice", () => {
    history.replaceState(null, "", "/?mapeo=indice");
    expect(mappingMode()).toBe("indice");
  });

  test("cualquier otro valor de ?mapeo= es por nombre", () => {
    history.replaceState(null, "", "/?mapeo=otro");
    expect(mappingMode()).toBe("nombre");
  });

  test("si no hay location (p. ej. en un worker) cae en por nombre", () => {
    vi.stubGlobal("location", undefined);
    expect(mappingMode()).toBe("nombre");
  });
});

describe("mapMotors", () => {
  const go2Joints = ROBOTS.go2.motores_nombres.map((n) => `${n}_joint`);

  test("Go2 por nombre: los 12 motores encuentran su joint", () => {
    const out = mapMotors(PROFILES.go2, ROBOTS.go2.motores_nombres, [], go2Joints);
    expect(out).toHaveLength(12);
    expect(out[0]).toEqual({ index: 0, nombre: "FR_hip", joint: "FR_hip_joint" });
    expect(out[11]).toEqual({ index: 11, nombre: "RL_calf", joint: "RL_calf_joint" });
  });

  test("un motor sin joint en el modelo queda en null", () => {
    const out = mapMotors(PROFILES.go2, ["FR_hip", "cola"], [], go2Joints);
    expect(out[1]).toEqual({ index: 1, nombre: "cola", joint: null });
  });

  test("por índice usa el orden de actuadores, no el nombre", () => {
    const actuators = ["left_hip_pitch_joint", "left_hip_roll_joint", "no_existe_joint"];
    const joints = ["left_hip_pitch_joint", "left_hip_roll_joint", "left_hip_yaw_joint"];
    const out = mapMotors(PROFILES.g1, ["L_hip_yaw", "L_hip_roll", "L_hip_pitch", "L_knee"], actuators, joints, "indice");
    expect(out.map((m) => m.joint)).toEqual(["left_hip_pitch_joint", "left_hip_roll_joint", null, null]);
  });

  test("por nombre (modo por defecto) el G1 traduce torso_ → waist_", () => {
    const out = mapMotors(PROFILES.g1, ["torso_yaw"], ["left_hip_pitch_joint"], ["waist_yaw_joint"]);
    expect(out).toEqual([{ index: 0, nombre: "torso_yaw", joint: "waist_yaw_joint" }]);
  });

  test("lista vacía de motores devuelve lista vacía", () => {
    expect(mapMotors(PROFILES.go2, [], [], go2Joints)).toEqual([]);
  });
});
