// The basement, rebuilt from the Unity scene dump (tools/build_basement.mjs).
// Static meshes are merged by material; the door, Lightning, the kibble and the five screens stay live.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCRTMaterial } from './crt.js';
import { buildBasementProps } from './basementprops.js';

const DEG = Math.PI / 180;
const LM_RANGE = 4;                   // lightmaps were written as sRGB(value / 4)

// ---- look batch 3c --------------------------------------------------------------------------------------------------------------------------------
// ?props=0 / ?grade=0 / ?dq=0 switch the new clutter, the wall and floor grade and the lightmap clean-up off (A/B pictures and costs from one build).
const Q = typeof location !== 'undefined' ? location.search : '';
const OPT = { props: !/[?&]props=0/.test(Q), grade: !/[?&]grade=0/.test(Q), dq: !/[?&]dq=0/.test(Q) };

// The baked lightmaps are 8-bit sRGB(value / 4): two bits of the value are gone, and a slow gradient (the ceiling's pool of lamp light, the wall wash
// by the cabinets) steps in bands that the lamp-light gain makes plain. This re-reads each one on the GPU as a CONSTRAINED smoothing, in the sRGB code
// domain: blur the map, then clamp every texel back to within +-0.55 of a code of what the file says (the true value is somewhere in that quantisation
// interval, so nothing in there can be wrong), and repeat. The staircase relaxes into the ramp it came from, and no texel ever moves by more than half a
// code, so a shadow edge or a chart border keeps exactly the sharpness the bake gave it. (The first version of this was an edge-keeping bilateral blur: it
// also sharpened every soft shadow edge, turning the ceiling's soft beam shadow into a hard diagonal line across the room. The numbers: the step across
// that line went from 0.6 codes/texel in the file to 1.3 after the bilateral and 0.37 after this.) Written to a half-float target, same linear values,
// no 8-bit steps. The lightmaps are shared with the outdoors (outside.js borrows them), so the yard gains it too.
function dequantizeLightmaps(renderer, textures, meta) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), qs = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; qs.add(quad);
  const vs = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const enc = 'vec3 enc(vec3 l) { return mix(l * 12.92, 1.055 * pow(max(l, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l)); }\n'
    + 'vec3 dec(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }\n';
  // the state is kept as the sRGB code / 255 (not linear), so the blur and the clamp both work in the domain the quantisation lives in
  const blurFS = `uniform sampler2D tSrc; uniform vec2 dir; uniform float sigS; varying vec2 vUv;
    void main() {
      vec3 acc = texture2D(tSrc, vUv).rgb; float ws = 1.0;
      for (int i = 1; i <= 14; i++) { float g = exp(-float(i * i) / (2.0 * sigS * sigS)); acc += g * (texture2D(tSrc, vUv + dir * float(i)).rgb + texture2D(tSrc, vUv - dir * float(i)).rgb); ws += 2.0 * g; }
      gl_FragColor = vec4(acc / ws, 1.0);
    }`;
  const clampFS = `uniform sampler2D tSrc, tOrig; uniform float slack; uniform bool last; varying vec2 vUv;
    ${enc}
    void main() {
      vec3 c0 = enc(texture2D(tOrig, vUv).rgb), c = clamp(texture2D(tSrc, vUv).rgb, c0 - slack / 255.0, c0 + slack / 255.0);
      gl_FragColor = vec4(last ? dec(c) : c, 1.0);
    }`;
  const origFS = `uniform sampler2D tSrc; varying vec2 vUv;\n${enc}\nvoid main() { gl_FragColor = vec4(enc(texture2D(tSrc, vUv).rgb), 1.0); }`;
  const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const mBlur = mk(blurFS, { tSrc: { value: null }, dir: { value: new THREE.Vector2() }, sigS: { value: 6 } });
  const mClamp = mk(clampFS, { tSrc: { value: null }, tOrig: { value: null }, slack: { value: 0.55 }, last: { value: false } });
  const mOrig = mk(origFS, { tSrc: { value: null } });
  const prevRT = renderer.getRenderTarget();
  const mkRT = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const pass = (mat, to) => { quad.material = mat; renderer.setRenderTarget(to); renderer.render(qs, cam); };
  const ITER = 4;
  for (const l of meta.lightmaps) {
    const src = textures[l.file]; if (!src || !src.image) continue;
    const w = src.image.width, h = src.image.height, X = mkRT(w, h), Y = mkRT(w, h), Z = mkRT(w, h);
    mOrig.uniforms.tSrc.value = src; pass(mOrig, X);                                     // X = the file's own codes: where the iteration starts (the file itself stays the constraint)
    mClamp.uniforms.tOrig.value = src;
    for (let it = 0; it < ITER; it++) {
      mBlur.uniforms.tSrc.value = X.texture; mBlur.uniforms.dir.value.set(1 / w, 0); pass(mBlur, Y);
      mBlur.uniforms.tSrc.value = Y.texture; mBlur.uniforms.dir.value.set(0, 1 / h); pass(mBlur, Z);
      mClamp.uniforms.tSrc.value = Z.texture; mClamp.uniforms.last.value = it === ITER - 1; pass(mClamp, X);
    }
    const done = X; Y.dispose(); Z.dispose();
    const t = done.texture; t.channel = 1; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    src.dispose(); textures[l.file] = t;
  }
  renderer.setRenderTarget(prevRT);
  for (const m of [mBlur, mClamp, mOrig]) m.dispose();
  quad.geometry.dispose();
}

// The floor's own baked light (the carpet's lightmap texel under each spot) = the bounce a prop standing there should get, so the new clutter is lit like
// the room is. Read once into a half-metre grid; bounceAt(x, y, z) -> linear rgb 'value' (what a lightmapped surface there would reflect).
function floorBounce(geo, img) {
  try {
    const w = img.width, h = img.height, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0); const d = cx.getImageData(0, 0, w, h).data;
    const lut = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; lut[i] = (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * LM_RANGE; }
    const P = geo.attributes.position, U = geo.attributes.uv1, I = geo.index;
    const tris = []; const n = I ? I.count : P.count;
    for (let i = 0; i < n; i += 3) { const k = [0, 1, 2].map((j) => (I ? I.getX(i + j) : i + j)); tris.push(k.map((v) => [P.getX(v), P.getZ(v), U.getX(v), U.getY(v)])); }
    const tex = (u, v) => {                                   // bilinear read of the 8-bit lightmap (v from the top, as the file is)
      const fx = Math.min(w - 1.001, Math.max(0, u * w - 0.5)), fy = Math.min(h - 1.001, Math.max(0, v * h - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, out = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        const q = (x, y) => lut[d[(y * w + x) * 4 + c]];
        out[c] = (q(x0, y0) * (1 - tx) + q(x0 + 1, y0) * tx) * (1 - ty) + (q(x0, y0 + 1) * (1 - tx) + q(x0 + 1, y0 + 1) * tx) * ty;
      }
      return out;
    };
    const at = (x, z) => {
      for (const [a, b, c] of tris) {
        const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(det) < 1e-9) continue;
        const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        return tex(l1 * a[2] + l2 * b[2] + l3 * c[2], l1 * a[3] + l2 * b[3] + l3 * c[3]);
      }
      return [0.05, 0.04, 0.03];
    };
    const GX = 37, GZ = 29, grid = new Float32Array(GX * GZ * 3);                  // cell centres every half a metre over x -9..9, z -7..7
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
      const x = -9 + i * 0.5, z = -7 + j * 0.5, acc = [0, 0, 0];
      for (const [ox, oz] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) { const v = at(Math.max(-8.95, Math.min(8.95, x + ox)), Math.max(-6.95, Math.min(6.95, z + oz))); acc[0] += v[0] / 5; acc[1] += v[1] / 5; acc[2] += v[2] / 5; }
      grid.set(acc, (j * GX + i) * 3);
    }
    return (x, y, z) => {
      const fx = Math.max(0, Math.min(GX - 1.001, (x + 9) / 0.5)), fz = Math.max(0, Math.min(GZ - 1.001, (z + 7) / 0.5)), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = 1 + 0.22 * Math.max(0, Math.min(2.6, y));
      const g = (a, b, c) => grid[((j + b) * GX + i + a) * 3 + c];
      return [0, 1, 2].map((c) => Math.max(0.03, ((g(0, 0, c) * (1 - tx) + g(1, 0, c) * tx) * (1 - tz) + (g(0, 1, c) * (1 - tx) + g(1, 1, c) * tx) * tz) * k));
    };
  } catch (e) { console.warn('[basement] the floor bounce could not be read', e); return null; }
}

// ---- the grade of the room's shell: panelling lifted and warmed, carpet cooled and a touch darker, and a little contact darkening along the corners and
// the baseboards, so the walls and the floor stop being one brown. SHELL_U is the uniform set every shell material shares (W.grade tunes it live).
const SHELL = {
  M_Board0: ['wall', [1.25, 1.10, 0.95], 1.25], M_Board1: ['wall', [1.25, 1.10, 0.95], 1.25], M_Board2: ['wall', [1.25, 1.10, 0.95], 1.25],
  M_WallNS: ['wall', [1.25, 1.10, 0.95], 1.25], M_WallEW: ['wall', [1.25, 1.10, 0.95], 1.25],
  M_Shag: ['floor', [0.80, 1.05, 1.00], 1.0], M_Ceiling: ['ceil', [1.0, 0.97, 0.9], 1.0],
};
// uLift*: a little light added to what the baked map gives (the far walls' bake is almost black and flat; a gain would only lift the lit parts too). Values are
// lightmap 'value' units x pi, so a lifted wall reads like a wall with that much more bounce on it.
const SHELL_U = { uBase: { value: 0.42 }, uTopK: { value: 0.16 }, uAoEdge: { value: 0.42 }, uAoCorner: { value: 0.3 },
  uLiftW: { value: new THREE.Vector3(0.10, 0.07, 0.04).multiplyScalar(Math.PI) }, uLiftF: { value: new THREE.Vector3(0.012, 0.014, 0.010).multiplyScalar(Math.PI) }, uLiftC: { value: new THREE.Vector3(0, 0, 0) } };
function gradeShell(mat, kind) {
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, SHELL_U);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSw;').replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSw = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    const fn = kind === 'wall'
      ? `float h = vSw.y, dx = min( vSw.x + 9.0, 9.0 - vSw.x ), dz = min( vSw.z + 7.0, 7.0 - vSw.z );
	float k = mix( 1.0 - uBase, 1.0, smoothstep( 0.0, 0.6, h ) ) * mix( 1.0, 1.0 + uTopK, smoothstep( 1.3, 2.9, h ) );
	k *= mix( 1.0 - uAoCorner, 1.0, smoothstep( 0.0, 1.6, max( dx, dz ) ) );`
      : `float dx = min( vSw.x + 9.0, 9.0 - vSw.x ), dz = min( vSw.z + 7.0, 7.0 - vSw.z );
	float k = mix( 1.0 - uAoEdge, 1.0, smoothstep( 0.0, ${kind === 'ceil' ? '1.3' : '1.0'}, min( dx, dz ) ) );`;
    const lift = kind === 'wall' ? 'uLiftW * mix( 0.6, 1.0, smoothstep( 0.0, 1.0, vSw.y ) )' : kind === 'ceil' ? 'uLiftC' : 'uLiftF';
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSw;\nuniform float uBase, uTopK, uAoEdge, uAoCorner;\nuniform vec3 uLiftW, uLiftF, uLiftC;')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n#if defined( RE_IndirectDiffuse )\n\tirradiance += ' + lift + ';\n#endif')
      .replace('#include <color_fragment>', `#include <color_fragment>\n\t{ ${fn}\n\tdiffuseColor.rgb *= k; }`);
  };
  mat.customProgramCacheKey = () => 'shell-' + kind;
}

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
  // the room's own baked bounce, read from the carpet's lightmap (before the lightmaps are cleaned up) for the new clutter to be lit by
  let bounceAt = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (bounceAt || !o.isMesh) return;
    let n = o; while (n && n.userData.lm === undefined && n.parent) n = n.parent;
    if ((n.name || o.name) !== 'ShellFloor') return;
    const lm = meta.lightmaps[n.userData.lm], img = lm && textures[lm.file] && textures[lm.file].image;
    if (img) bounceAt = floorBounce(toFloat(o.geometry).applyMatrix4(o.matrixWorld), img);
  });
  if (OPT.dq && opts.renderer) {
    try { dequantizeLightmaps(opts.renderer, textures, meta); } catch (e) { console.warn('[basement] the lightmap clean-up failed; the 8-bit ones stay', e); }
  }
  const flatLM = new THREE.DataTexture(new Uint8Array([74, 68, 60, 255]), 1, 1);   // ~0.25 linear bounce for the few unbaked props (the door, Lightning, the kibble)
  flatLM.colorSpace = THREE.SRGBColorSpace; flatLM.channel = 1; flatLM.needsUpdate = true;

  // ---- materials, one per (material, lightmap) pair
  const matCache = new Map();
  const metals = [];
  const shell = [];
  function litMaterial(mi, lm) {
    const key = mi + '|' + lm;
    if (matCache.has(key)) return matCache.get(key);
    const m = meta.materials[mi];
    const mat = new THREE.MeshStandardMaterial({ name: m.name });
    const clockGlass = m.name === 'M_wall_clock_glass';   // the dump gave the glass the clock's own texture (it smeared the case over the dial): plain clear glass
    mat.color.setRGB(m.color[0], m.color[1], m.color[2], THREE.LinearSRGBColorSpace);
    if (clockGlass) mat.color.setRGB(1, 1, 1);
    if (m.map && !clockGlass && textures['tex/' + m.map]) {
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
    if (m.transparent) { mat.transparent = true; mat.opacity = clockGlass ? 0.04 : m.alpha; mat.depthWrite = false; }
    if (m.clip > 0) mat.alphaTest = m.clip;
    if (m.doubleSided) mat.side = THREE.DoubleSide;
    mat.lightMap = lm >= 0 ? textures[meta.lightmaps[lm].file] : flatLM;
    mat.lightMapIntensity = Math.PI * LM_RANGE;
    const sh = OPT.grade && SHELL[m.name];
    if (sh) {                                                    // the shell: the grade (albedo tint, a lightmap gain, contact darkening)
      mat.color.multiply(new THREE.Color().setRGB(sh[1][0], sh[1][1], sh[1][2], THREE.LinearSRGBColorSpace));
      mat.lightMapIntensity *= sh[2]; gradeShell(mat, sh[0]); shell.push({ mat, kind: sh[0], base: mat.color.clone(), lm: mat.lightMapIntensity });
    }
    matCache.set(key, mat);
    return mat;
  }

  // ---- walk the glTF: classify every mesh
  gltf.scene.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  let headBoard = null;
  const buckets = new Map();        // material -> geometries (static, merged)
  const live = [];                  // meshes that stay separate
  const screens = {};
  const byPath = {};
  const jukeParts = [];
  const bounds = {};                // world-space box per named prop (glTF node names, slashes dropped), for the things to look at
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    let n = o; while (n && n.userData.lm === undefined && n.parent) n = n.parent;
    const ud = n.userData || {};
    const path = n.name || o.name;
    const mi = parseInt((o.material && o.material.name || 'm-1').slice(1), 10);
    const m = meta.materials[mi];
    const geo = toFloat(o.geometry).applyMatrix4(o.matrixWorld);
    geo.computeBoundingBox();
    (bounds[path] = bounds[path] || new THREE.Box3()).union(geo.boundingBox);
    if (m && m.kind === 'crt') {
      const mesh = new THREE.Mesh(geo, null);
      mesh.name = path;
      screens[m.name] = { mesh, crt: m.crt };
      live.push(mesh);
      return;
    }
    const mat = m ? litMaterial(mi, ud.lm ?? -1) : new THREE.MeshStandardMaterial();
    if (path === 'ShellPanellingBN52') headBoard = { geo: geo.clone(), mat };       // (the boards over the areaway door's head are missing in the dump: see below)
    if (/^Jukebox/.test(path)) jukeParts.push({ geo: geo.clone(), mat });     // (kept aside: the Junction's jukebox is these same meshes, js/jukebox.js)
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

  // the wall over the areaway door is bare black backing in the dump (no boards from the frame's top to the cove): five copies of the board beside it, squeezed to
  // that height, close it (look batch 3c: the lifted walls made the gap a black hole)
  if (OPT.grade && headBoard) {
    for (let i = 1; i <= 5; i++) {
      const g = headBoard.geo.clone(), P = g.attributes.position;
      for (let v = 0; v < P.count; v++) { P.setY(v, 2.17 + P.getY(v) * (0.83 / 3.0)); P.setX(v, P.getX(v) + 0.2305 * i); }
      g.computeBoundingBox();
      if (!buckets.has(headBoard.mat)) buckets.set(headBoard.mat, []);
      buckets.get(headBoard.mat).push({ geo: g, cast: false });
    }
  }
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

  // ---- THE WALL CLOCK READS 3:33 (canon: every clock does). The Poly Haven model came without hands, so three are made here
  // to sit on its dial: black hour and minute, a red second hand. The dial faces -x (the room), 12 up, 3 toward +z.
  const clk = bounds['WallClockwall_clock'];
  if (clk) {
    const c = new THREE.Vector3(); clk.getCenter(c);
    const HX = clk.min.x + 0.0135;          // just in front of the dial (x 8.9784 of a box spanning 8.9567 .. 9.0036)
    const handMat = (hex) => { const m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, metalness: 0 }); m.lightMap = flatLM; m.lightMapIntensity = Math.PI * LM_RANGE; return m; };
    const black = handMat(0x000000), red = handMat(0xb00c12);
    // a hand: a slim tapered blade from `tail` behind the pivot to `len` past it, at clock angle `deg` (clockwise from 12)
    const hand = (mat, len, tail, w, dx, deg) => {
      const sh = new THREE.Shape(); sh.moveTo(-tail, -w * 0.5); sh.lineTo(len * 0.86, -w * 0.5); sh.lineTo(len, 0); sh.lineTo(len * 0.86, w * 0.5); sh.lineTo(-tail, w * 0.5); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.0012, bevelEnabled: false });   // shape x -> along the hand, z -> thickness
      g.translate(0, 0, -0.0006);
      const mesh = new THREE.Mesh(g, mat);
      // shape x -> world +y (12 o'clock), shape y -> world +z, extrusion z -> world +x (a right-handed frame)
      const a = deg * DEG;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.makeBasis(new THREE.Vector3(0, Math.cos(a), Math.sin(a)), new THREE.Vector3(0, -Math.sin(a), Math.cos(a)), new THREE.Vector3(1, 0, 0)).setPosition(HX - dx, c.y, c.z);
      mesh.receiveShadow = false; mesh.castShadow = false;
      return mesh;
    };
    const hh = 3 * 30 + 33 * 0.5, mm = 33 * 6, ss = 50 * 6;                                 // 3:33:50
    scene.add(hand(black, 0.070, 0.016, 0.0115, 0.0000, hh), hand(black, 0.112, 0.022, 0.0075, 0.0016, mm), hand(red, 0.124, 0.034, 0.0026, 0.0032, ss));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.0050, 20), red);
    cap.rotation.z = Math.PI / 2; cap.position.set(HX - 0.0036, c.y, c.z); scene.add(cap);
  }

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

  // ---- the 1982 clutter (js/basementprops.js): one group of five draw calls, four bare-bulb lights, boxes for the Player to bump into
  let props = null;
  if (OPT.props) {
    try {
      props = buildBasementProps({ anisotropy: opts.anisotropy, bounceAt });
      scene.add(props.group);
      for (const [n, l] of Object.entries(props.lights)) lights[n] = l;
      metals.push(...props.metals);
    } catch (e) { console.error('[basement] the props could not be built', e); props = null; }
  }

  return { scene, meta, screens, bounds, door, cat, poses, kibble, lights, metals, drawCalls, jukeParts, props, shell, shellU: SHELL_U, bounceAt,
    lightmaps: meta.lightmaps.map((l) => textures[l.file]),
    colliders: [...meta.colliders.filter((c) => c.kind === 'box' && c.on && !c.trigger), ...(props ? props.colliders : [])] };
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
