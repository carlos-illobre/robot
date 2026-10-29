#!/usr/bin/env node
/**
 * Convierte los modelos MuJoCo OFICIALES de Unitree (MJCF + mallas OBJ/STL)
 * en un único .glb liviano por robot, para el Gemelo 3D del dashboard.
 *
 * Por qué existe: los modelos de la cátedra pesan 28 MB (Go2) y 18 MB (G1) en
 * mallas de texto/STL sin comprimir. Un navegador no necesita esa resolución
 * para mostrar el robot a 10 Hz, así que acá:
 *
 *   1. Se lee el MJCF (go2.xml / g1_29dof.xml) resolviendo las clases
 *      <default>/childclass igual que MuJoCo: posición y cuaternión de cada
 *      <body>, eje y rango de cada <joint>, y los <geom> visibles.
 *   2. Cada malla se suelda (vértices repetidos), se SIMPLIFICA con
 *      meshoptimizer (error geométrico acotado) y se le recalculan normales
 *      "con pliegue" (bordes vivos donde el CAD los tiene).
 *   3. Se arma un glTF cuya jerarquía de nodos ES la cadena cinemática del
 *      MJCF: un nodo por <body> (con `extras.joint` = nombre/eje/rango) y un
 *      nodo hijo por <geom>. En el navegador basta con rotar el nodo del body.
 *   4. Se cuantiza (KHR_mesh_quantization) y se comprime con
 *      EXT_meshopt_compression. Three.js lo abre con GLTFLoader + MeshoptDecoder.
 *
 * Uso (desde la raíz del repo):
 *   npm --prefix tools ci
 *   node tools/convert_robot_models.mjs --src <ruta a unitree_mujoco/unitree_robots> \
 *        [--out frontend/assets/robots] [--robot go2|g1]
 *
 * Es determinista: misma entrada → mismo .glb.
 */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { meshopt, prune, dedup } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

/* ------------------------------------------------------------------ */
/* Configuración por robot                                             */
/* ------------------------------------------------------------------ */

/**
 * `keep`: fracción mínima de triángulos que se intenta conservar;
 * `error`: error máximo de simplificación, relativo al tamaño de cada malla.
 * Valores elegidos mirando el resultado: por debajo se notan facetas en las
 * piezas curvas (muslos del Go2, manos del G1).
 */
const ROBOTS = {
  go2: { xml: "go2/go2.xml", keep: 0.12, error: 0.004, minTris: 400 },
  g1: { xml: "g1/g1_29dof.xml", keep: 0.14, error: 0.004, minTris: 300 },
};

/** Ángulo (grados) a partir del cual una arista se considera "viva". */
const CREASE_DEG = 38;

/* ------------------------------------------------------------------ */
/* XML mínimo (el MJCF es XML simple: sin CDATA ni entidades raras)     */
/* ------------------------------------------------------------------ */

function parseXml(text) {
  text = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "");
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<(\/?)([A-Za-z_][\w.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    const [, closing, tag, rawAttrs, selfClose] = m;
    if (closing) {
      if (cur.tag !== tag) throw new Error(`XML mal formado: </${tag}> cierra <${cur.tag}>`);
      cur = cur.parent;
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
    const el = { tag, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (!selfClose) cur = el;
  }
  return root;
}

const nums = (s) => s.trim().split(/\s+/).map(Number);
const find = (el, tag) => el.children.find((c) => c.tag === tag);
const findAll = (el, tag) => el.children.filter((c) => c.tag === tag);

/* ------------------------------------------------------------------ */
/* Clases <default> de MuJoCo                                          */
/* ------------------------------------------------------------------ */

/**
 * Devuelve `resolve(tipo, clase, attrsPropios)`: combina los defaults de la
 * cadena main → … → clase con los atributos del elemento, como hace MuJoCo.
 */
function buildDefaults(mujoco) {
  const classes = new Map(); // nombre → { parent, byTag: {joint: {...}, geom: {...}} }
  const walk = (el, name, parent) => {
    const byTag = {};
    for (const c of el.children) if (c.tag !== "default") byTag[c.tag] = { ...c.attrs };
    classes.set(name, { parent, byTag });
    for (const c of findAll(el, "default")) walk(c, c.attrs.class, name);
  };
  const top = find(mujoco, "default");
  classes.set("main", { parent: null, byTag: {} });
  if (top) {
    // El <default> de primer nivel puede ser "main" sin nombre o envolver clases.
    const name = top.attrs.class ?? "main";
    walk(top, name, name === "main" ? null : "main");
  }
  return (tag, cls, own) => {
    const chain = [];
    for (let c = cls ?? "main"; c; c = classes.get(c)?.parent) {
      if (!classes.has(c)) throw new Error(`Clase <default> desconocida: ${c}`);
      chain.unshift(classes.get(c).byTag[tag] ?? {});
    }
    return Object.assign({}, ...chain, own);
  };
}

/* ------------------------------------------------------------------ */
/* Lectura de mallas                                                   */
/* ------------------------------------------------------------------ */

/** OBJ → posiciones de triángulos (las normales del archivo se descartan: se recalculan). */
function readObj(file) {
  const verts = [];
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("v ")) verts.push(nums(line.slice(2)));
    else if (line.startsWith("f ")) {
      const idx = line.slice(2).trim().split(/\s+/).map((t) => {
        const i = Number.parseInt(t.split("/")[0], 10);
        return i < 0 ? verts.length + i : i - 1;
      });
      for (let k = 1; k + 1 < idx.length; k++) out.push(...verts[idx[0]], ...verts[idx[k]], ...verts[idx[k + 1]]);
    }
  }
  return new Float32Array(out);
}

/** STL binario o ASCII → posiciones de triángulos. */
function readStl(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  if (84 + n * 50 === buf.length) {
    const out = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12; // salta la normal
      for (let k = 0; k < 9; k++) out[i * 9 + k] = buf.readFloatLE(o + k * 4);
    }
    return out;
  }
  const out = [];
  for (const m of buf.toString("utf8").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) out.push(+m[1], +m[2], +m[3]);
  return new Float32Array(out);
}

/* ------------------------------------------------------------------ */
/* Simplificación + normales                                           */
/* ------------------------------------------------------------------ */

/**
 * Suelda, simplifica y recalcula normales con pliegue.
 * Se simplifica ANTES de calcular normales: así meshoptimizer trabaja sobre
 * la topología real y no se traba en las costuras de normales.
 */
function processMesh(triangles, { keep, error, minTris }) {
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(triangles, 3));
  g = mergeVertices(g, 1e-6);
  const pos = g.getAttribute("position").array;
  const idx = new Uint32Array(g.getIndex().array);
  const triCount = idx.length / 3;
  const target = Math.max(minTris, Math.round(triCount * keep)) * 3;
  let simplified = idx;
  if (target < idx.length) {
    [simplified] = MeshoptSimplifier.simplify(idx, pos, 3, target, error, ["LockBorder"]);
  }
  let s = new THREE.BufferGeometry();
  s.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  s.setIndex(new THREE.BufferAttribute(simplified, 1));
  s = toCreasedNormals(s.toNonIndexed(), THREE.MathUtils.degToRad(CREASE_DEG));
  s.deleteAttribute("uv");
  s = mergeVertices(s, 1e-6);
  return {
    position: new Float32Array(s.getAttribute("position").array),
    normal: new Float32Array(s.getAttribute("normal").array),
    index: new Uint32Array(s.getIndex().array),
    before: triCount,
    after: s.getIndex().count / 3,
  };
}

/** Cilindro de MuJoCo (eje Z, size = radio semialto) como malla. */
function cylinderMesh(radius, halfHeight) {
  const g = new THREE.CylinderGeometry(radius, radius, halfHeight * 2, 28, 1, false);
  g.rotateX(Math.PI / 2); // three.js lo crea sobre Y; MuJoCo, sobre Z
  g.deleteAttribute("uv");
  const m = mergeVertices(toCreasedNormals(g.toNonIndexed(), THREE.MathUtils.degToRad(CREASE_DEG)), 1e-6);
  return {
    position: new Float32Array(m.getAttribute("position").array),
    normal: new Float32Array(m.getAttribute("normal").array),
    index: new Uint32Array(m.getIndex().array),
    before: 0,
    after: m.getIndex().count / 3,
  };
}

/* ------------------------------------------------------------------ */
/* Conversión de un robot                                              */
/* ------------------------------------------------------------------ */

/** quat MJCF [w x y z] → glTF [x y z w] */
const toGltfQuat = (q) => [q[1], q[2], q[3], q[0]];

/** MuJoCo normaliza los cuaterniones del XML (algunos vienen como "1 1 0 0"). */
const normalizeQuat = (q) => {
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
};

async function convert(id, srcRoot, outRoot) {
  const cfg = ROBOTS[id];
  const xmlPath = path.join(srcRoot, cfg.xml);
  const mujoco = find(parseXml(fs.readFileSync(xmlPath, "utf8")), "mujoco");
  const resolve = buildDefaults(mujoco);
  const compiler = find(mujoco, "compiler")?.attrs ?? {};
  if (compiler.angle && compiler.angle !== "radian") throw new Error("Solo se soporta compiler angle=radian");
  const meshDir = path.join(path.dirname(xmlPath), compiler.meshdir ?? "");

  // Materiales y mallas declarados en <asset>
  const asset = find(mujoco, "asset");
  const mjMaterials = Object.fromEntries(findAll(asset, "material").map((m) => [m.attrs.name, nums(m.attrs.rgba ?? "1 1 1 1")]));
  const meshFiles = Object.fromEntries(
    findAll(asset, "mesh").map((m) => [m.attrs.name ?? path.parse(m.attrs.file).name, path.join(meshDir, m.attrs.file)]),
  );

  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene(id);
  const root = doc.createNode("mjcf_root").setExtras({ upAxis: "Z", source: path.basename(cfg.xml) });
  scene.addChild(root);

  const gMaterials = new Map(); // clave → Material glTF
  const gMeshes = new Map(); // "malla|material" → Mesh glTF
  const processed = new Map(); // nombre de malla → geometría procesada
  const stats = { before: 0, after: 0 };
  const joints = [];

  const materialFor = (rgba, name) => {
    const key = name ?? `rgba(${rgba.join(",")})`;
    if (!gMaterials.has(key)) {
      // El color "real" lo decide el visor (paleta del dashboard); acá queda el del MJCF.
      gMaterials.set(
        key,
        doc.createMaterial(key).setBaseColorFactor(rgba).setMetallicFactor(0).setRoughnessFactor(0.6)
          .setExtras({ mjcfMaterial: name ?? null, rgba }),
      );
    }
    return gMaterials.get(key);
  };

  const meshFor = (meshName, material, geomFactory) => {
    const key = `${meshName}|${material.getName()}`;
    if (gMeshes.has(key)) return gMeshes.get(key);
    if (!processed.has(meshName)) {
      const geo = geomFactory();
      stats.before += geo.before;
      stats.after += geo.after;
      processed.set(meshName, {
        geo,
        position: doc.createAccessor(`${meshName}_pos`).setType("VEC3").setArray(geo.position),
        normal: doc.createAccessor(`${meshName}_nrm`).setType("VEC3").setArray(geo.normal),
        index: doc.createAccessor(`${meshName}_idx`).setType("SCALAR").setArray(
          geo.position.length / 3 < 65536 ? new Uint16Array(geo.index) : geo.index,
        ),
      });
    }
    const p = processed.get(meshName);
    const prim = doc.createPrimitive().setAttribute("POSITION", p.position).setAttribute("NORMAL", p.normal)
      .setIndices(p.index).setMaterial(material);
    const mesh = doc.createMesh(meshName).addPrimitive(prim);
    gMeshes.set(key, mesh);
    return mesh;
  };

  /** Recorre <body> recursivamente, heredando childclass. */
  const visitBody = (bodyEl, parentNode, childclass) => {
    const a = bodyEl.attrs;
    const cls = a.childclass ?? childclass;
    const node = doc.createNode(a.name).setTranslation(nums(a.pos ?? "0 0 0"));
    if (a.quat) node.setRotation(toGltfQuat(normalizeQuat(nums(a.quat))));
    if (a.euler || a.axisangle || a.xyaxes || a.zaxis) throw new Error(`Orientación no soportada en body ${a.name}`);
    parentNode.addChild(node);

    const extras = { body: a.name };
    // Articulaciones (hinge). La freejoint de la base no se modela: la orientación sale de la IMU.
    for (const j of findAll(bodyEl, "joint")) {
      const ja = resolve("joint", j.attrs.class ?? cls, j.attrs);
      const type = ja.type ?? "hinge";
      if (type !== "hinge") continue;
      if (ja.pos && nums(ja.pos).some((v) => Math.abs(v) > 1e-9)) throw new Error(`Joint ${ja.name} con pos≠0: no soportado`);
      const axis = new THREE.Vector3(...nums(ja.axis ?? "0 0 1")).normalize().toArray();
      extras.joint = { name: ja.name, axis, range: ja.range ? nums(ja.range) : null };
      joints.push(ja.name);
    }

    const contacts = [];
    findAll(bodyEl, "geom").forEach((gEl, gi) => {
      const ga = resolve("geom", gEl.attrs.class ?? cls, gEl.attrs);
      const type = ga.type ?? (ga.mesh ? "mesh" : "sphere");
      const group = Number(ga.group ?? 0);
      const pos = nums(ga.pos ?? "0 0 0");
      const size = ga.size ? nums(ga.size) : [];
      // Esferas chicas = puntos de apoyo del pie (sirven para apoyar el robot en el piso).
      if (type === "sphere" && size[0] <= 0.03) {
        contacts.push([...pos, size[0]]);
        return;
      }
      if (group === 3) return; // colisión: MuJoCo no la dibuja por defecto
      const rgba = ga.material ? mjMaterials[ga.material] : nums(ga.rgba ?? "0.5 0.5 0.5 1");
      const material = materialFor(rgba, ga.material);
      let mesh;
      if (type === "mesh") {
        // El G1 repite cada malla (una para ver y otra para colisión): se dibuja una sola vez.
        const dupKey = `${ga.mesh}|${ga.pos ?? ""}|${ga.quat ?? ""}`;
        extras._seen ??= new Set();
        if (extras._seen.has(dupKey)) return;
        extras._seen.add(dupKey);
        const file = meshFiles[ga.mesh];
        mesh = meshFor(ga.mesh, material, () =>
          processMesh(file.toLowerCase().endsWith(".stl") ? readStl(file) : readObj(file), cfg));
      } else if (type === "cylinder") {
        mesh = meshFor(`cyl_${size[0]}_${size[1]}`, material, () => cylinderMesh(size[0], size[1]));
      } else {
        return; // cajas/esferas grandes: solo colisión
      }
      const gNode = doc.createNode(`${a.name}#${gi}`).setTranslation(pos).setMesh(mesh);
      if (ga.quat) gNode.setRotation(toGltfQuat(normalizeQuat(nums(ga.quat))));
      node.addChild(gNode);
    });
    delete extras._seen;
    if (contacts.length) extras.contacts = contacts;
    node.setExtras(extras);

    for (const child of findAll(bodyEl, "body")) visitBody(child, node, cls);
  };

  for (const b of findAll(find(mujoco, "worldbody"), "body")) visitBody(b, root, b.attrs.childclass);

  // Orden de actuadores del MJCF = orden de motores del SDK de Unitree.
  const actuators = findAll(find(mujoco, "actuator") ?? { children: [] }, "motor").map((m) => m.attrs.joint);
  root.setExtras({ ...root.getExtras(), actuators, joints });

  await MeshoptEncoder.ready;
  await doc.transform(dedup(), prune({ keepLeaves: true, keepExtras: true }), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
  });
  const outDir = path.join(outRoot, id);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${id}.glb`);
  await io.write(outFile, doc);
  const bytes = fs.statSync(outFile).size;
  console.log(
    `${id}: ${stats.before.toLocaleString("es-AR")} → ${stats.after.toLocaleString("es-AR")} triángulos · ` +
      `${joints.length} articulaciones · ${(bytes / 1024).toFixed(0)} KiB → ${path.relative(process.cwd(), outFile)}`,
  );
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []),
);
if (!args.src) {
  console.error("Falta --src <ruta a unitree_mujoco/unitree_robots>");
  process.exit(1);
}
const outRoot = args.out ?? path.join(path.dirname(new URL(import.meta.url).pathname), "..", "frontend", "assets", "robots");
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready]);
for (const id of args.robot ? [args.robot] : Object.keys(ROBOTS)) await convert(id, args.src, outRoot);
