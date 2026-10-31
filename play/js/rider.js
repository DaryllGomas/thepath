// THE RIDER (look batch 2): what you stare at for the whole ride. Proper 1982 BMX bars (chrome, smooth), ribbed rubber grips with flanges,
// a brake lever and its cable, a foam crossbar pad, and the kid's hands: padded red-and-white BMX gloves closed round the grips and the
// sweatshirt sleeves running out of the bottom of the frame (assets/bike/hands.glb, built by tools/build_bike_hands.py: procedural, no
// downloads). The bars go on the parked bike too; the hands and sleeves only on the bike under you.
//
// Metres, in the bike's own frame (x right, y up, -z ahead), the same frame as the cloned Outside/Bike meshes in main.js. The bars keep
// the old model's shape: 58 cm wide, the stem at y 0.752, risers leaning out to y 0.92, the crossbar between them at y 0.855, and the ends
// swept back to grips at y 0.955. Everything that turns with the handlebars (bars, grips, lever, hands, bell, walkie, fork, front wheel)
// hangs from `steer`, which pivots about the steering axis; the sleeves stay put at the elbow and aim at the wrist (RiderKit.update).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
export const RIDER = {
  pivot: V(0, 0, -0.49),         // the steering axis (a vertical line through the stem and the front hub)
  maxSteer: 9 * DEG,             // the bars' turn at full lock, for the eye: a few degrees reads as steering
  barR: 0.0111,                  // 22.2 mm tube
  gripR: 0.0176,
  gripInset: 0.012,              // the grip starts this far along the bar's last run
  // the right half of the bar's centre line; the left is its mirror. Corners are filleted (the number is the fillet's reach in m)
  path: [[0, 0.752, -0.490, 0], [0.066, 0.752, -0.490, 0.024], [0.134, 0.920, -0.470, 0.032], [0.176, 0.954, -0.425, 0.020], [0.297, 0.962, -0.396, 0]],
  crossY: 0.855,
  hand: { shift: 0.004 },              // the hand's origin sits this far outboard of the grip's middle (m)
  bell: V(-0.322, 0.027, -0.034),      // the bell moves to the left bar (the right one now carries the brake lever and the walkie): added to its position
  bellBase: 0.026,                     // the bell mesh's origin is this far above its clamp's base; it is squashed to bellFlat of its height about that base (5.2 cm across stays, the dish sits lower)
  bellFlat: 0.86,
};
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);

// A soft ceiling on a material's outgoing light. A mirror finish on a thin curved piece (a bar's bend, the bell, the lever) catches the sun or the
// horizon in a few pixels at many times what the picture can show, and post.js blooms anything over 0.54 in the scene, so it reads as a lamp. Below
// the knee nothing changes; above it the light eases up to `cap` (kept under the bloom threshold) and no further.
function ceiling(mat, cap) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>',
      `{ const float K = 0.26; const float C = ${cap.toFixed(3)}; vec3 over = max(outgoingLight - K, 0.0); outgoingLight = min(outgoingLight, vec3(K)) + (C - K) * (1.0 - exp(-over / (C - K))); }
       #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `rider-ceiling-${cap}`;
  return mat;
}

// ---- a dusk-sky environment for the chrome (the outdoors has none: a mirror finish on a bare scene is black)
function duskEnvironment(renderer, sunDir) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { sun: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 sun;
      void main(){ vec3 n = normalize(d); float h = n.y;
        vec3 zen = vec3(0.16, 0.12, 0.34), mid = vec3(0.72, 0.36, 0.34), hor = vec3(0.62, 0.40, 0.21), gnd = vec3(0.045, 0.03, 0.03);
        vec3 c = h > 0.0 ? mix(hor, mix(mid, zen, smoothstep(0.12, 0.8, h)), smoothstep(0.0, 0.22, h)) : mix(hor * 0.25, gnd, smoothstep(0.0, -0.35, h));
        float s = max(dot(n, sun), 0.0); c += vec3(1.0, 0.7, 0.4) * (pow(s, 6.0) * 0.25 + pow(s, 60.0) * 0.5);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.03).texture;
  pm.dispose(); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); mat.dispose();
  return tex;
}

// a path of straight runs and rounded corners (points: [x, y, z, fillet]); TubeGeometry walks it
function roundedPath(pts) {
  const cp = new THREE.CurvePath();
  let cur = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i], f = b.f || 0;
    if (f > 0 && i < pts.length - 1) {
      const a = pts[i - 1], c = pts[i + 1];
      const d1 = b.clone().sub(cur).normalize(), d2 = c.clone().sub(b).normalize();
      const t1 = Math.min(f, b.distanceTo(cur) * 0.48), t2 = Math.min(f, b.distanceTo(c) * 0.48);
      const p1 = b.clone().addScaledVector(d1, -t1), p2 = b.clone().addScaledVector(d2, t2);
      if (p1.distanceTo(cur) > 1e-6) cp.add(new THREE.LineCurve3(cur.clone(), p1));
      cp.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
      cur = p2;
    } else { cp.add(new THREE.LineCurve3(cur.clone(), b.clone())); cur = b.clone(); }
  }
  return cp;
}

function gripGeometry(L) {
  // along +Y from the inboard end (0) to the outboard end (L): a flange, a ribbed body, a bulb and a closed bar-end plug
  const R = RIDER.gripR, pr = [];
  const add = (r, y) => pr.push(new THREE.Vector2(r, y));
  add(0.0, 0.0); add(0.0150, 0.0); add(0.0208, 0.0006); add(0.0218, 0.0028); add(0.0214, 0.0050); add(0.0190, 0.0066); add(R, 0.0080);
  const y0 = 0.0105, y1 = L - 0.0095, n = 11, pitch = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {                       // ribs: a rounded ridge, a narrow groove
    const y = y0 + i * pitch;
    add(R + 0.0003, y + pitch * 0.12); add(R + 0.0011, y + pitch * 0.32); add(R + 0.0011, y + pitch * 0.62); add(R + 0.0003, y + pitch * 0.82); add(R - 0.0007, y + pitch * 0.94);
  }
  add(R, y1); add(R + 0.0008, L - 0.0078); add(0.0192, L - 0.0058); add(0.0205, L - 0.0036); add(0.0198, L - 0.0014); add(0.0170, L - 0.0001);
  add(0.0120, L + 0.0012); add(0.0070, L + 0.0020); add(0.0, L + 0.0022);
  return new THREE.LatheGeometry(pr, 28);
}

function foamPad(len, r) {            // a foam roll: flat ends with a soft round-over, a little fatter in the middle
  const pr = [], h = len / 2, e = 0.0065, n = 7;
  pr.push(new THREE.Vector2(0, -h));
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pr.push(new THREE.Vector2(r - e + e * Math.sin(a), -h + e - e * Math.cos(a))); }
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pr.push(new THREE.Vector2(r - e + e * Math.cos(a), h - e + e * Math.sin(a))); }
  pr.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pr, 32); g.rotateZ(-Math.PI / 2); return g;
}

// the middle of one end ring of the sleeve (56 vertices a ring, SLEEVE_SEG in tools/build_bike_hands.py; the first ring at the cuff)
function ring(geo, which) {
  const p = geo.attributes.position, seg = 56, n = p.count / seg, r = which < 0 ? n - 1 : which, c = new THREE.Vector3();
  for (let i = 0; i < seg; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, r * seg + i));
  return c.multiplyScalar(1 / seg);
}

export class RiderKit {
  constructor(renderer, sunDir) {
    this.env = duskEnvironment(renderer, sunDir || V(-0.3, 0.25, -0.9));
    const env = this.env;
    this.mat = {
      chrome: ceiling(new THREE.MeshStandardMaterial({ color: 0xe8eaf0, metalness: 1.0, roughness: 0.3, envMap: env, envMapIntensity: 1.1 }), 0.5),
      rubber: new THREE.MeshStandardMaterial({ color: 0x1a1a1d, metalness: 0, roughness: 0.78, envMap: env, envMapIntensity: 0.5 }),
      // the small bright parts (the bell, the brake lever) get a satin finish: a mirror finish on a thin curved piece catches the horizon and the sun
      // in a few pixels and the bloom turns it into a lamp (see ceiling() above)
      satin: ceiling(new THREE.MeshStandardMaterial({ color: 0xc2c6ce, metalness: 1.0, roughness: 0.5, envMap: env, envMapIntensity: 0.5 }), 0.4),
      pad: new THREE.MeshStandardMaterial({ color: 0x23469a, metalness: 0, roughness: 0.72, envMap: env, envMapIntensity: 0.35 }),
      cable: new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0, roughness: 0.55, envMap: env, envMapIntensity: 0.5 }),
      glove: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.8, envMap: env, envMapIntensity: 0.4 }),
      sleeve: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.95, envMap: env, envMapIntensity: 0.3 }),
    };
    this.envBase = Object.fromEntries(Object.entries(this.mat).map(([k, m]) => [k, m.envMapIntensity]));
    this.geo = this._geometries();
    this.hands = null;             // set by loadHands
  }

  _geometries() {
    const P = RIDER.path.map(([x, y, z, f]) => { const v = V(x, y, z); v.f = f; return v; });
    const pts = [];                                    // the whole bar: the left half mirrored, then the right half
    for (let i = P.length - 1; i >= 1; i--) { const m = V(-P[i].x, P[i].y, P[i].z); m.f = P[i].f; pts.push(m); }
    for (let i = 0; i < P.length; i++) { const m = V(P[i].x, P[i].y, P[i].z); m.f = i === 0 ? 0 : P[i].f; pts.push(m); }
    const path = roundedPath(pts);
    const bar = new THREE.TubeGeometry(path, 200, RIDER.barR, 18, false);
    // the crossbar, between the risers (where they are at that height)
    const cy = RIDER.crossY, a = P[1], b = P[2];
    const t = (cy - a.y) / (b.y - a.y), cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
    const cross = new THREE.CylinderGeometry(0.0090, 0.0090, cx * 2, 18, 1); cross.rotateZ(Math.PI / 2); cross.translate(0, cy, cz);
    // the grip: along the last run of the bar
    const p3 = V(P[3].x, P[3].y, P[3].z), p4 = V(P[4].x, P[4].y, P[4].z);
    const dir = p4.clone().sub(p3); const runLen = dir.length(); dir.normalize();
    const L = runLen - RIDER.gripInset - 0.0022;
    const grip = gripGeometry(L);
    const start = p3.clone().addScaledVector(dir, RIDER.gripInset);
    // stem: a clamp body round the bar's middle, with a bolt
    const stem = new THREE.CylinderGeometry(0.0245, 0.0245, 0.092, 28, 1); stem.rotateX(Math.PI / 2); stem.translate(0, 0.752, -0.490);
    const bolt = new THREE.CylinderGeometry(0.0095, 0.0095, 0.018, 8); bolt.translate(0, 0.752 + 0.0245 + 0.006, -0.490);
    const cap = new THREE.CylinderGeometry(0.0185, 0.0185, 0.006, 24); cap.translate(0, 0.752 - 0.045, -0.490);
    // the crossbar's foam pad
    const pad = foamPad(0.164, 0.0245); pad.translate(0, cy, cz);
    // brake lever: a collar on the bar, a perch, the blade along the grip's front, and the cable down to the frame
    const lp = p3.clone().lerp(V(P[2].x, P[2].y, P[2].z), 0.32);
    const ld = p3.clone().sub(V(P[2].x, P[2].y, P[2].z)).normalize();
    const collar = new THREE.CylinderGeometry(0.0158, 0.0158, 0.024, 24); collar.translate(0, 0, 0);
    const perch = new THREE.BoxGeometry(0.028, 0.016, 0.020); perch.translate(0.004, -0.010, -0.014);
    const bladeOff = V(0, -0.0165, -0.0325);
    const bp = [];
    for (let s = 0; s <= 1.0001; s += 0.25) bp.push(start.clone().addScaledVector(dir, 0.004 + s * (L - 0.016)).add(bladeOff).add(V(0, -0.0035 * Math.pow(Math.max(0, s - 0.6) / 0.4, 2), -0.004 * s)));
    bp[0].add(V(-0.012, 0, -0.012));
    const blade = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 24, 0.0047, 10, false);
    const barrel = new THREE.CylinderGeometry(0.0055, 0.0055, 0.016, 12); barrel.rotateX(Math.PI / 2);
    const cb = [V(0.168, 0.931, -0.458), V(0.174, 0.906, -0.470), V(0.162, 0.866, -0.482), V(0.124, 0.812, -0.502), V(0.072, 0.764, -0.520), V(0.028, 0.716, -0.526), V(0.004, 0.652, -0.510)];
    const cable = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cb, false, 'centripetal'), 70, 0.0031, 8, false);
    return { bar, cross, grip, gripPos: start, gripDir: dir, gripLen: L, stem, bolt, cap, pad, collar, perch, blade, barrel, cable, lever: { pos: lp, dir: ld }, p3, p4 };
  }

  // the bars and controls as a group in the bike's frame (the geometry is shared between the bikes)
  bars() {
    const g = new THREE.Group(), G = this.geo, M = this.mat;
    const mesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; g.add(m); return m; };
    mesh(G.bar, M.chrome, 'bar'); mesh(G.cross, M.chrome, 'crossbar'); mesh(G.stem, M.chrome, 'stem'); mesh(G.bolt, M.chrome, 'stemBolt'); mesh(G.cap, M.chrome, 'stemCap');
    mesh(G.pad, M.pad, 'crossPad');
    for (const sx of [1, -1]) {
      const grip = mesh(G.grip, M.rubber, 'grip');
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), G.gripDir);
      grip.quaternion.copy(q); grip.position.copy(G.gripPos);
      if (sx < 0) { grip.position.x *= -1; const d = G.gripDir.clone(); d.x *= -1; grip.quaternion.setFromUnitVectors(V(0, 1, 0), d); }
    }
    // the right-hand brake lever
    const lv = new THREE.Group(); lv.position.copy(G.lever.pos); lv.quaternion.setFromUnitVectors(V(0, 1, 0), G.lever.dir);
    const collar = new THREE.Mesh(G.collar, M.satin); lv.add(collar);
    const perch = new THREE.Mesh(G.perch, M.satin); lv.add(perch);
    g.add(lv);
    const blade = new THREE.Mesh(G.blade, M.satin); blade.name = 'brakeBlade'; g.add(blade);
    const barrel = new THREE.Mesh(G.barrel, M.satin); barrel.position.set(0.1715, 0.9345, -0.4585); barrel.rotation.set(0.35, 0.3, 0); g.add(barrel);
    mesh(G.cable, M.cable, 'brakeCable');
    return g;
  }

  loadHands(url) {
    return new Promise((resolve) => {
      new GLTFLoader().load(url, (gltf) => {
        const geo = {};
        gltf.scene.traverse((o) => { if (o.isMesh) geo[o.name] = o.geometry; });
        if (!geo.glove || !geo.sleeve) { console.warn('[rider] hands.glb has no glove or sleeve'); resolve(null); return; }
        this.hands = geo; resolve(geo);
      }, undefined, (e) => { console.warn('[rider] hands.glb failed', e); resolve(null); });
    });
  }

  // the gloved hands and their sleeves for the bike under you. `rig` is the bike's group, `steer` the group that turns with the bars
  // (its origin is at RIDER.pivot). Returns what update() drives.
  attachHands(rig, steer) {
    const G = this.geo, H = this.hands, M = this.mat;
    if (!H) return null;
    // the hand frame: x along the grip, y up (as far as the bar's tilt allows), z toward the rider
    const ex = G.gripDir.clone().normalize();
    const up = V(0, 1, 0).addScaledVector(ex, -ex.y).normalize();
    const ez = new THREE.Vector3().crossVectors(ex, up);
    const basis = new THREE.Matrix4().makeBasis(ex, up, ez);
    const mid = G.gripPos.clone().addScaledVector(G.gripDir, G.gripLen * 0.5 + RIDER.hand.shift);
    const sides = [];
    for (const sx of [1, -1]) {
      const root = new THREE.Group(); root.name = sx > 0 ? 'rightHand' : 'leftHand';
      if (sx < 0) root.scale.x = -1;                                   // the left hand is the right one mirrored
      const hand = new THREE.Group(); hand.position.copy(mid).sub(RIDER.pivot); hand.quaternion.setFromRotationMatrix(basis);
      const glove = new THREE.Mesh(H.glove, M.glove); glove.name = 'glove'; hand.add(glove);
      root.add(hand); steer.add(root);
      // the sleeve: its own group in the bike's frame, restitched each frame between the elbow (fixed) and the wrist (turns with the bars)
      const sroot = new THREE.Group(); sroot.name = sx > 0 ? 'rightSleeve' : 'leftSleeve';
      if (sx < 0) sroot.scale.x = -1;
      const sleeve = new THREE.Mesh(H.sleeve, M.sleeve); sleeve.name = 'sleeve'; sleeve.matrixAutoUpdate = false;
      // rest transform of the hand (in the bike's frame, right-hand coordinates)
      const rest = new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromRotationMatrix(basis), V(1, 1, 1));
      sleeve.matrix.copy(rest); sleeve.matrixWorldNeedsUpdate = true;
      sroot.add(sleeve); rig.add(sroot);
      sides.push({ sx, root, sroot, sleeve, rest, elbow: ring(H.sleeve, -1).applyMatrix4(rest), cuff: ring(H.sleeve, 0).applyMatrix4(rest) });
    }
    this.sides = sides;
    return sides;
  }

  // per frame: the bars turn, the sleeves follow the wrists, the metal and cloth dim as the dusk goes to night
  update(steer, steerAngle, night) {
    steer.rotation.y = -steerAngle;
    if (this.sides) {
      const rot = new THREE.Matrix4(), tmp = new THREE.Matrix4();
      for (const s of this.sides) {
        // the wrist (a point on the sleeve's cuff) moved with the bars; the elbow did not. Aim the sleeve from the elbow at the new wrist.
        const th = -steerAngle * s.sx;                                   // (mirrored on the left: the group's scale flips the turn)
        const c = s.cuff.clone().sub(RIDER.pivot).applyAxisAngle(V(0, 1, 0), th).add(RIDER.pivot);
        const a = s.cuff.clone().sub(s.elbow), b = c.clone().sub(s.elbow);
        const q = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
        const k = b.length() / a.length();
        rot.compose(V(0, 0, 0), q, V(k, k, k));
        // sleeve = T(elbow) * R * T(-elbow) * rest
        tmp.makeTranslation(s.elbow.x, s.elbow.y, s.elbow.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-s.elbow.x, -s.elbow.y, -s.elbow.z)).multiply(s.rest);
        s.sleeve.matrix.copy(tmp);
      }
    }
    const k = Math.max(0, Math.min(1, night || 0)), f = 1 - 0.65 * k;
    for (const [name, m] of Object.entries(this.mat)) m.envMapIntensity = this.envBase[name] * f;
  }

  show(on) { if (this.sides) for (const s of this.sides) { s.root.visible = on; s.sroot.visible = on; } }
}
