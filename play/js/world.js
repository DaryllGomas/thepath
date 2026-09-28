// The basement, rebuilt from the Unity scene dump (tools/build_basement.mjs).
// Static meshes are merged by material; the door, Lightning, the kibble and the five screens stay live.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCRTMaterial } from './crt.js';

const DEG = Math.PI / 180;
const LM_RANGE = 4;                   // lightmaps were written as sRGB(value / 4)

export async function loadBasement(base, opts, onProgress) {
  const meta = await (await fetch(base + 'assets/basement.json')).json();

  // ---- progress over the glb + every texture
  const texFiles = new Set(meta.lightmaps.map((l) => l.file));
  for (const m of meta.materials) {
    if (m.map) texFiles.add('tex/' + m.map);
    if (m.emissiveMap) texFiles.add('tex/' + m.emissiveMap);
  }
  const weights = { glb: 0.6, tex: 0.4 };
  let glbFrac = 0, texDone = 0;
  const report = () => onProgress && onProgress(glbFrac * weights.glb + (texDone / texFiles.size) * weights.tex);

  const texLoader = new THREE.TextureLoader();
  const textures = {};
  const texPromise = Promise.all([...texFiles].map((f) => new Promise((res) => {
    texLoader.load(base + 'assets/' + f, (t) => { textures[f] = t; texDone++; report(); res(); },
      undefined, () => { texDone++; report(); res(); });
  })));

  const loader = new GLTFLoader();
  // the compressed file needs WebAssembly; where a page policy forbids it, load the plain one
  const wasm = !/[?&]plain/.test(location.search) && await Promise.race([MeshoptDecoder.ready.then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 4000))]);
  if (wasm) loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((res, rej) => loader.load(base + (wasm ? 'assets/basement.gltf.json' : 'assets/basement_plain.gltf.json'), res,
    (e) => { if (e.total) { glbFrac = e.loaded / e.total; report(); } }, rej));
  glbFrac = 1; report();
  await texPromise;

  // ---- textures: every UV was flipped to glTF's top-left origin, so nothing is flipped on upload
  for (const [f, t] of Object.entries(textures)) {
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = opts.anisotropy || 4;
    if (f.startsWith('tex/lm')) { t.channel = 1; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    t.needsUpdate = true;
  }
  const flatLM = new THREE.DataTexture(new Uint8Array([74, 68, 60, 255]), 1, 1);   // ~0.25 linear bounce for the few unbaked props (the door, Lightning, the kibble)
  flatLM.colorSpace = THREE.SRGBColorSpace; flatLM.channel = 1; flatLM.needsUpdate = true;

  // ---- materials, one per (material, lightmap) pair
  const matCache = new Map();
  const metals = [];
  function litMaterial(mi, lm) {
    const key = mi + '|' + lm;
    if (matCache.has(key)) return matCache.get(key);
    const m = meta.materials[mi];
    const mat = new THREE.MeshStandardMaterial({ name: m.name });
    mat.color.setRGB(m.color[0], m.color[1], m.color[2], THREE.LinearSRGBColorSpace);
    if (m.map && textures['tex/' + m.map]) {
      const t = textures['tex/' + m.map].clone();
      const [sx, sy, ox, oy] = m.st;
      t.repeat.set(sx, sy); t.offset.set(ox, 1 - sy - oy);
      t.needsUpdate = true;
      mat.map = t;
    }
    mat.roughness = Math.min(1, Math.max(0.04, m.rough));
    mat.metalness = m.metal;
    if (m.metal > 0.3) metals.push(mat);
    if (m.emissive) {
      const mx = Math.max(m.emissive[0], m.emissive[1], m.emissive[2], 1e-4);
      mat.emissive.setRGB(m.emissive[0] / mx, m.emissive[1] / mx, m.emissive[2] / mx, THREE.LinearSRGBColorSpace);
      mat.emissiveIntensity = mx;
      if (m.emissiveMap && textures['tex/' + m.emissiveMap]) mat.emissiveMap = textures['tex/' + m.emissiveMap];
    }
    if (m.transparent) { mat.transparent = true; mat.opacity = m.alpha; mat.depthWrite = false; }
    if (m.clip > 0) mat.alphaTest = m.clip;
    if (m.doubleSided) mat.side = THREE.DoubleSide;
    mat.lightMap = lm >= 0 ? textures[meta.lightmaps[lm].file] : flatLM;
    mat.lightMapIntensity = Math.PI * LM_RANGE;
    matCache.set(key, mat);
    return mat;
  }

  // ---- walk the glTF: classify every mesh
  gltf.scene.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  const buckets = new Map();        // material -> geometries (static, merged)
  const live = [];                  // meshes that stay separate
  const screens = {};
  const byPath = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    let n = o; while (n && n.userData.lm === undefined && n.parent) n = n.parent;
    const ud = n.userData || {};
    const path = n.name || o.name;
    const mi = parseInt((o.material && o.material.name || 'm-1').slice(1), 10);
    const m = meta.materials[mi];
    const geo = toFloat(o.geometry).applyMatrix4(o.matrixWorld);
    if (m && m.kind === 'crt') {
      const mesh = new THREE.Mesh(geo, null);
      mesh.name = path;
      screens[m.name] = { mesh, crt: m.crt };
      live.push(mesh);
      return;
    }
    const mat = m ? litMaterial(mi, ud.lm ?? -1) : new THREE.MeshStandardMaterial();
    const dynamic = !ud.active || /^Areaway\/AreawayHinge|^Lightning\/|Kibble/.test(path);
    if (dynamic) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = path; mesh.visible = !!ud.active;
      mesh.castShadow = !!ud.cast; mesh.receiveShadow = true;
      live.push(mesh);
      (byPath[path] = byPath[path] || []).push(mesh);
      return;
    }
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push({ geo, cast: !!ud.cast });
  });

  let drawCalls = 0;
  for (const [mat, list] of buckets) {
    const casters = list.filter((g) => g.cast).map((g) => g.geo);
    const others = list.filter((g) => !g.cast).map((g) => g.geo);
    for (const [geos, cast] of [[casters, true], [others, false]]) {
      if (!geos.length) continue;
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      scene.add(mesh); drawCalls++;
    }
  }
  for (const m of live) scene.add(m);

  // ---- the areaway door swings on its hinge (inward, 100 degrees, 0.6 s: DoorSwing)
  const door = new THREE.Group(); door.position.set(3.33, 1.01, -6.97); scene.add(door);
  for (const m of live) if (/^Areaway\/AreawayHinge/.test(m.name)) door.attach(m);

  // ---- Lightning: five poses on one pivot (Unity yaw psi == three rotation.y of -psi)
  const cat = new THREE.Group(); cat.position.set(2.05, 0, 6.1); cat.rotation.y = -250 * DEG; scene.add(cat);
  cat.updateMatrixWorld(true);
  const poses = {};
  for (const m of live) {
    const k = /^Lightning\/Pose_(\w+)/.exec(m.name);
    if (k) { cat.attach(m); (poses[k[1]] = poses[k[1]] || []).push(m); }
  }
  const kibble = live.filter((m) => /Kibble/.test(m.name));

  // ---- screens: a CRT material each, plus where to stand to look into it
  for (const s of Object.values(screens)) {
    const g = s.mesh.geometry; g.computeBoundingBox();
    const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
    const n = new THREE.Vector3(); const na = g.attributes.normal;
    for (let i = 0; i < na.count; i++) n.x += na.getX(i), n.y += na.getY(i), n.z += na.getZ(i);
    n.normalize();
    const size = new THREE.Vector3(); g.boundingBox.getSize(size);
    s.center = c; s.normal = n; s.size = size;
    s.material = makeCRTMaterial(s.crt);
    s.mesh.material = s.material;
  }

  // ---- lights (URP units: three needs x pi for the same diffuse)
  const lights = {};
  for (const L of meta.lights) {
    if (!L.on) continue;
    const col = new THREE.Color().setRGB(L.color[0], L.color[1], L.color[2], THREE.SRGBColorSpace);
    let light;
    if (L.type === 'Spot') {
      light = new THREE.SpotLight(col, L.intensity * Math.PI, L.range, (L.spot / 2) * DEG, 0.4, 2);
      light.target.position.set(L.pos[0] + L.dir[0], L.pos[1] + L.dir[1], L.pos[2] + L.dir[2]);
      scene.add(light.target);
    } else {
      light = new THREE.PointLight(col, L.intensity * Math.PI, L.range, 2);
    }
    light.position.set(L.pos[0], L.pos[1], L.pos[2]);
    light.name = L.name;
    if (L.name === 'LampLight') {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.002; light.shadow.normalBias = 0.02; light.shadow.radius = 3;
      light.shadow.camera.near = 0.08; light.shadow.camera.far = 12;
    }
    light.userData.base = light.intensity;
    scene.add(light); lights[L.name] = light;
  }

  const fc = meta.render.fogColor;
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(fc[0], fc[1], fc[2], THREE.SRGBColorSpace), 0.03);
  scene.background = scene.fog.color.clone();

  return { scene, meta, screens, door, cat, poses, kibble, lights, metals, drawCalls,
    lightmaps: meta.lightmaps.map((l) => textures[l.file]),
    colliders: meta.colliders.filter((c) => c.kind === 'box' && c.on && !c.trigger) };
}

// the room's own reflections for chrome and brass (metals only, so the bounce is not counted twice)
export function bakeReflections(renderer, scene, metals) {
  const rt = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.05, 30, rt);
  cam.position.set(0, 1.4, -2);
  scene.add(cam); cam.update(renderer, scene); scene.remove(cam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(rt.texture).texture;
  for (const m of metals) { m.envMap = env; m.envMapIntensity = 1.0; m.needsUpdate = true; }
  rt.dispose(); pmrem.dispose();
}

// quantized glTF attributes (int16 / int8 normalized) -> plain floats so everything merges
function toFloat(geo) {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo.attributes)) {
    const n = a.count, s = a.itemSize, arr = new Float32Array(n * s);
    for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) arr[i * s + k] = a.getComponent(i, k);
    out.setAttribute(name, new THREE.BufferAttribute(arr, s));
  }
  if (geo.index) out.setIndex(new THREE.BufferAttribute(new Uint32Array(geo.index.array), 1));
  for (const want of ['uv', 'uv1', 'normal']) if (!out.attributes[want]) {
    const n = out.attributes.position.count;
    out.setAttribute(want, new THREE.BufferAttribute(new Float32Array(n * (want === 'normal' ? 3 : 2)), want === 'normal' ? 3 : 2));
  }
  return out;
}
