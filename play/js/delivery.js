// THE DELIVERY (docs/THE_PLAN/CANON.md item 7), 3D pass: once THE ARCADE ANSWERS (js/answer.js: Starvector's last wave), a black van
// rolls up the street from out of sight, brakes, its rear doors open on a cabinet lying on a hand truck, two men in black suits
// (the Unity suits kit, skinned to a walking rig: js/delivery_rig.js) wheel it in through Flynn's front doors, stand it in the
// empty spot at the back, wheel the empty truck out, climb back in, and the van drives off. ?dlv=0 plays the old sequence
// (js/delivery_old.js) for before/after.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildRig, STEP } from './delivery_rig.js';

const DEG = Math.PI / 180;
const up = new THREE.Vector3(0, 1, 0);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const yawTo = (d) => Math.atan2(-d.x, -d.z);            // yaw that points local -Z along d
const lerp = (a, b, k) => a + (b - a) * k;
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; };

// where things happen (web coordinates: Unity's with z flipped)
const LANE_Z = -159.6, STOP_X = 79.2, START_X = 0, LEAVE_X = 330;
const V0 = 7.6, BRAKE_D = 20;                              // arrives at 7.6 m/s (27 km/h), brakes over 20 m
const AISLE_X = 83.3;
const RX = STOP_X - 2.56, SILL = 0.6;                      // the van's rear face, and its cargo floor above the road
const WALK = 1.15;
const CARGO_TILT = -50, BACK_OUT = 0.66, BACK_CARGO = 0.52;                     // the truck lies a little steeper in the cargo, and the pusher stands a little nearer its handles, so a moderate knee bend reaches them (11-08)
const HL_K = 5;                                              // the same light on the baked floor and walls (a shader term, not candela)
const SWEEP_I = 2500;                                        // candela of the headlight sweep through the windows (tuned by the pixel readings in tools/b5_delivery.mjs)

export async function loadDeliveryModels() {
  const loader = new GLTFLoader();
  const get = (f) => new Promise((res) => loader.load(f, (g) => res(g.scene), undefined, () => res(null)));
  const [van, dolly] = await Promise.all([get('assets/models/van.glb'), get('assets/models/dolly.glb')]);
  return { van, dolly };
}

// a small night environment (dusk sky, a warm street lamp, a cool strip, the Junction's magenta) so the van's paint and chrome have something to reflect
function nightEnv(renderer) {
  const sc = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 top = vec3(0.025,0.028,0.035), mid = vec3(0.08,0.08,0.09), low = vec3(0.025,0.025,0.03); vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, h)) : mix(mid*0.6, low, smoothstep(0.0, -0.4, h)); gl_FragColor = vec4(c, 1.0); }',
  }));
  sc.add(sky);
  const panel = (c, w, h, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); };
  panel(new THREE.Color(3.5, 2.8, 1.8), 6, 3, -25, 18, 10);        // sodium lamp
  panel(new THREE.Color(2.2, 2.3, 2.5), 22, 2, 5, 22, -30);      // cool strip
  panel(new THREE.Color(1.6, 1.3, 1.0), 10, 2, 28, 10, 20);
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(sc, 0.03); pm.dispose();
  sky.geometry.dispose();
  return rt.texture;
}

// headlight cone: additive, brightest at the lamp, soft at the edge, fading with length
function beamCone(len, r1) {
  const g = new THREE.CylinderGeometry(0.1, r1, len, 20, 1, true); g.translate(0, -len / 2, 0); g.rotateX(-Math.PI / 2);   // along +Z, apex at the origin
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uK: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.93, 0.78) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vT; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vT = clamp(position.z / ' + len.toFixed(2) + ', 0.0, 1.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uK; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vT; void main(){ vec3 n = vN / max(length(vN), 1e-4), v = vV / max(length(vV), 1e-4); float e = pow(clamp(abs(dot(n, v)), 0.0, 1.0), 2.2); float a = e * pow(1.0 - vT, 1.7) * (0.35 + 0.65 * (1.0 - vT)) * uK; gl_FragColor = vec4(uCol * clamp(a, 0.0, 4.0), clamp(a, 0.0, 1.0)); }',
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 20; return mesh;
}

export class Delivery {
  constructor({ O, models, renderer = null, groundY = -37.06 }) {
    this.O = O; this.t = -1; this.done = false; this.groundY = groundY; this.ph = 'van';
    this.root = new THREE.Group(); this.root.name = 'delivery'; this.root.visible = false; O.group.add(this.root);
    const env = renderer ? nightEnv(renderer) : null; this.env = env;
    // ---- the van: front faces +Z in the glb; drives along +X
    this.van = models.van ? models.van.clone(true) : null;
    this.hand = []; this.partsHidden = [];
    if (this.van) {
      this.van.rotation.order = 'YXZ'; this.van.rotation.y = 90 * DEG; this.root.add(this.van);
      this.wheels = []; this.doors = {};
      let head = null, tail = null; const bodyNodes = [];
      this.van.traverse((o) => {
        if (/^Wheel_/.test(o.name) && o.parent && /Van|Scene/.test(o.parent.name || 'Scene')) this.wheels.push(o);
        if (o.name === 'DoorRL' || o.name === 'DoorRR') this.doors[o.name] = { o, rest: o.rotation.y };
        if (o.isMesh && o.name === 'Headlights') head = o; if (o.isMesh && o.name === 'Taillights') tail = o;
        if (o.isMesh) {
          const nm = o.material && o.material.name;
          const tune = (props, phys) => { const old = o.material; const m = phys ? new THREE.MeshPhysicalMaterial({ name: old.name }) : old.clone(); Object.assign(m, props); if (env && (props.envMapIntensity !== undefined)) m.envMap = env; o.material = m; };
          if (nm === 'Paint_Van') tune({ color: new THREE.Color(0x2a2a30), roughness: 0.3, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.16, envMapIntensity: 1.0 }, true);
          else if (nm === 'Chrome') tune({ envMapIntensity: 1.0 });
          else if (nm === 'Wheel_Steel') tune({ color: new THREE.Color(0x3c3c40), envMapIntensity: 0.6 });
          else if (nm === 'Trim_Black') tune({ color: new THREE.Color(0x1c1c1f), roughness: 0.4, envMapIntensity: 0.4 });
          else if (nm === 'Rubber') tune({ color: new THREE.Color(0x1b1b1d), envMapIntensity: 0.2 });
          else if (nm === 'Glass_Tint') tune({ color: new THREE.Color(0x182030), roughness: 0.04, metalness: 0.3, envMapIntensity: 1.0 });
          else if (nm === 'Interior') tune({ color: new THREE.Color(0x585550), roughness: 0.8 });
        }
      });
      // body pitch: everything but the wheels rides on a group that pivots at axle height, so the nose can dip while the tyres stay down
      const vanNode = this.van.getObjectByName('Van') || this.van;
      this.bodyG = new THREE.Group(); this.bodyG.position.set(0, 0.5, 0);
      for (const c of [...vanNode.children]) if (!/^Wheel_/.test(c.name)) { vanNode.remove(c); c.position.y -= 0.5; this.bodyG.add(c); }
      vanNode.add(this.bodyG);
      if (head) {
        head.material = head.material.clone(); head.material.emissive = new THREE.Color(0xfff2d0); head.material.emissiveIntensity = 3; this.headMat = head.material;
        // two lamp centres, a lens ring each, and a cone from each
        const p = head.geometry.attributes.position; head.geometry.computeBoundingBox(); const hb = head.geometry.boundingBox;
        const hw = head.getWorldPosition(new THREE.Vector3());
        this.lamps = [];
        for (const sg of [-1, 1]) {
          const pts = []; for (let i = 0; i < p.count; i++) if (Math.sign(p.getX(i)) === sg) pts.push([p.getX(i), p.getY(i)]);
          const cx = pts.reduce((a, q) => a + q[0], 0) / (pts.length || 1), cy = pts.reduce((a, q) => a + q[1], 0) / (pts.length || 1);
          const r = Math.max(0.08, (pts.length ? Math.max(...pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy))) : 0.13));
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.12, 0.014, 6, 24), new THREE.MeshStandardMaterial({ color: 0xcfd2d8, metalness: 1, roughness: 0.25, envMap: env, envMapIntensity: 1.6 }));
          ring.position.set(cx, cy, hb.max.z + 0.002); head.parent.add(ring);
          const cone = beamCone(11, 1.9); cone.position.set(cx, cy, hb.max.z + 0.03); cone.rotation.x = 0.045; head.parent.add(cone);
          this.lamps.push({ ring, cone, cx, cy });
        }
      }
      if (tail) { tail.material = tail.material.clone(); tail.material.emissive = new THREE.Color(0xff2a1a); tail.material.emissiveIntensity = 3; this.tailMat = tail.material; }
      // lights the van carries / casts: the beam on the street, a sweep through Flynn's windows onto its floor, a cool rim at the kerb, a follow glow for the cargo
      const spot = (col, dist, ang, pen) => { const l = new THREE.SpotLight(col, 0, dist, ang * DEG, pen, 2); O.group.add(l); O.group.add(l.target); return l; };
      this.beam = spot(0xfff0d0, 34, 40, 1.0);
      this.sweep = spot(0xfff0d8, 70, 16, 0.7);
      this.rim = new THREE.PointLight(0xdde4ff, 0, 7, 2); O.group.add(this.rim);
      this.glow = new THREE.PointLight(0xffd9a0, 0, 4.5, 2); O.group.add(this.glow);
    }
    // ---- the hand truck: pivots about its axle; the cabinet rides on its nose plate, back against the frame, screen forward
    this.dolly = new THREE.Group(); this.root.add(this.dolly);                    // yaw + position, at the wheels' contact
    this.tilt = new THREE.Group(); this.dolly.add(this.tilt);                    // pivots at the axle
    this.dmodel = models.dolly ? models.dolly.clone(true) : new THREE.Group(); this.tilt.add(this.dmodel);
    this.axle = new THREE.Vector3(0, 0.13, 0.0);
    if (models.dolly) {
      this.dolly.updateMatrixWorld(true);
      const wb = new THREE.Box3(); this.dmodel.traverse((o) => { if (o.isMesh && /^Wheel_/.test(o.name)) wb.expandByObject(o); });
      if (!wb.isEmpty()) { const c = wb.getCenter(new THREE.Vector3()); this.axle.set(0, c.y, c.z); }
    }
    this.tilt.position.copy(this.axle); this.dmodel.position.copy(this.axle).negate();
    // the cabinet: a copy of the real one, re-framed around its base
    const visualPath = 'Outside/Flynns/FlynnsInterior/PolybiusSpot/Visual';
    const vo = O.obj(visualPath);
    this.spot = new THREE.Vector3(...vo.pos); this.spotQ = new THREE.Quaternion(...vo.rot);
    const rootM = new THREE.Matrix4().compose(new THREE.Vector3(...vo.pos), new THREE.Quaternion(...vo.rot), new THREE.Vector3(1, 1, 1));
    const inv = rootM.clone().invert();
    this.cab = new THREE.Group();
    this.realVisual = []; this.emptySpot = []; const lifted = new Map();
    for (const [p, ms] of Object.entries(O.byPath)) {
      if (p.startsWith(visualPath + '/')) for (const m of ms) {
        this.realVisual.push(m);
        // the cabinet with no name is black but not nothing: lift near-black parts so its edges and bezel read (one cloned material per original)
        const mt = m.material;
        if (mt && mt.color && !mt.map && mt.emissive && mt.emissive.getHex() === 0 && mt.color.getHex() < 0x0a0a0a) {
          if (!lifted.has(mt)) { const c = mt.clone(); c.color.set(0x08080b); c.roughness = 0.8; lifted.set(mt, c); }
          m.material = lifted.get(mt);
        }
        const c = new THREE.Mesh(m.geometry, m.material); c.matrixAutoUpdate = true;
        inv.clone().multiply(m.matrix).decompose(c.position, c.quaternion, c.scale); this.cab.add(c);
      }
      if (p.startsWith('Outside/Flynns/FlynnsInterior/PolybiusSpot/EmptySpot')) this.emptySpot.push(...ms);
    }
    const bb = new THREE.Box3().setFromObject(this.cab);
    this.cabDepth = bb.max.z - bb.min.z; this.cabBackZ = bb.min.z; this.cabHalfW = (bb.max.x - bb.min.x) / 2; this.cabH = bb.max.y - bb.min.y;
    this.nose = 0.04;
    if (models.dolly) { const db = new THREE.Box3().setFromObject(this.dmodel); this.nose = Math.max(0.02, db.min.y + this.axle.y + 0.03); }
    this.cabPos = new THREE.Vector3(0, this.nose, -this.cabBackZ + 0.06);
    this.cab.position.copy(this.cabPos).sub(this.axle);
    this.tilt.add(this.cab);
    this.endDolly = this.spot.clone().sub(this.cabPos);
    // ---- the two men
    this.men = [];
    for (const [key, keep] of [['Suits/manOne_A', false], ['Suits/manTwo_A', true]]) {
      const rig = buildRig(O, key, { briefcase: keep });
      let g;
      if (rig) g = rig.fig;
      else { g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.28, 4, 10), new THREE.MeshStandardMaterial({ color: 0x0d0d12, roughness: 0.6 })); c.position.y = 0.9; g.add(c); g.add(new THREE.Group()); }
      this.root.add(g); this.men.push({ g, rig, last: new THREE.Vector3(), blend: new THREE.Vector3(), blendT: 9, has: false, stoop: 0 });
    }
    // handle points on the rails (dolly-model coordinates) for the pusher's hands
    this.handles = [new THREE.Vector3(-0.235, 0.98, -0.1), new THREE.Vector3(0.235, 0.98, -0.1)];
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
  }

  // fixed things made visible once, so every shader variant is built before the first look (js/main.js precompileOutside)
  warm() {
    const seen = []; this.root.traverse((o) => { seen.push([o, o.visible]); o.visible = true; });
    const rv = this.root.visible; this.root.visible = true;
    const l = [this.beam, this.sweep, this.rim, this.glow].filter(Boolean).map((x) => [x, x.intensity]);
    return () => { for (const [o, v] of seen) o.visible = v; this.root.visible = rv; };
  }

  // ---------------------------------------------------------------- routes
  // a polyline with its corners rounded (a quadratic bend of up to r metres each side), sampled by arc length
  curve(pts, r = 0.85) {
    const out = [pts[0].clone()];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const la = a.distanceTo(b), lc = b.distanceTo(c); const rr = Math.min(r, 0.45 * la, 0.45 * lc);
      const p0 = b.clone().lerp(a, rr / la), p2 = b.clone().lerp(c, rr / lc);
      for (let k = 0; k <= 8; k++) { const q = k / 8; out.push(new THREE.Vector3().addScaledVector(p0, (1 - q) * (1 - q)).addScaledVector(b, 2 * q * (1 - q)).addScaledVector(p2, q * q)); }
    }
    out.push(pts[pts.length - 1].clone());
    const len = [0]; for (let i = 1; i < out.length; i++) len.push(len[i - 1] + out[i].distanceTo(out[i - 1]));
    return { pts: out, len, total: len[len.length - 1] };
  }
  sample(c, s) {
    s = Math.min(c.total, Math.max(0, s)); let i = 1; while (i < c.len.length - 1 && c.len[i] < s) i++;
    const a = c.pts[i - 1], b = c.pts[i], k = (s - c.len[i - 1]) / Math.max(1e-6, c.len[i] - c.len[i - 1]);
    const p = a.clone().lerp(b, Math.min(1, Math.max(0, k)));
    // the heading blends the central-difference tangents of the two samples around p, so it turns smoothly (a per-segment heading stepped
    // at every sample point, and the pusher, standing behind the handles, swung about a hand-width at each step round a bend)
    const tan = (j) => { const u = c.pts[Math.max(0, j - 1)], w = c.pts[Math.min(c.pts.length - 1, j + 1)]; const t = w.clone().sub(u).setY(0); if (t.lengthSq() < 1e-8) t.set(0, 0, -1); return t.normalize(); };
    const kk = Math.min(1, Math.max(0, k)); const d = tan(i - 1).lerp(tan(i), kk); if (d.lengthSq() < 1e-6) d.copy(tan(i)); d.normalize();
    return { p, d };
  }
  routeIn() {
    const g = this.groundY, f = -36.99, nz = this.spot.z;
    return [new THREE.Vector3(RX + 1.25, g, LANE_Z), new THREE.Vector3(RX - 0.5, g, LANE_Z), new THREE.Vector3(STOP_X - 4.9, g, LANE_Z),
      new THREE.Vector3(STOP_X - 4.9, g, -162.4), new THREE.Vector3(80.4, g, -162.4), new THREE.Vector3(82, g, -165.4), new THREE.Vector3(82, f, -168.6),
      new THREE.Vector3(AISLE_X, f, -170.4), new THREE.Vector3(AISLE_X, f, nz + 2.4), new THREE.Vector3(this.spot.x + 0.3, f, nz + 1.35)];
  }
  // the road's height under a point near the van: the cargo floor is SILL above it, with a short step over the rear lip
  floorOf(p, base) {
    if (Math.abs(p.z - LANE_Z) > 1.15) return base;
    return base + SILL * smooth((p.x - (RX - 0.8)) / 0.8);
  }
  // (the lane band's edge eases out over half a metre: a hard edge popped the men upright in one frame as the route bent away)
  stoopOf(p) { return (1 - smooth((Math.abs(p.z - LANE_Z) - 0.8) / 0.5)) * smooth((p.x - (RX - 0.9)) / 0.9); }

  // the crouch itself: a man ducks only while he is actually under the cargo roof (the van's rear face RX on, inside its walls), easing in
  // over a third of a metre at the rear lip and out at the side walls; the lane band above (stoopOf) still drives the truck's tilt and the walking pace
  crouchOf(p) { return (1 - smooth((Math.abs(p.z - LANE_Z) - 0.9) / 0.3)) * smooth((p.x - (RX - 0.3)) / 0.5); }

  start(onDoors, onDone) {
    if (this.t >= 0) return;
    this.t = 0; this.root.visible = true; this.onDoors = onDoors; this.onDone = onDone;
    this.routeA = this.curve(this.routeIn());
    this.routeB = this.curve([...this.routeIn()].reverse().map((p) => p.clone()));        // out the way it came in
    this.dolly.visible = false; for (const m of this.men) m.g.visible = false;
    const xb = STOP_X - BRAKE_D;
    const T = { cruise: (xb - START_X) / V0, brake: 2 * BRAKE_D / V0 };
    T.arrive = T.cruise + T.brake; T.doors = T.arrive + 1.1; T.open = T.doors + 1.2; T.walk = T.open + 0.3;
    this.T = T; this.xb = xb;
    this.s = 0; this.v = 0; this.ph = 'van'; this.phT = 0; this.sB = 0; this.vanV = 0;
    this.doorsAt = T.doors; this.closeAt = 1e9; this.driveAt = 1e9; this.vanX = START_X;
    this.tiltCur = CARGO_TILT * DEG;
  }

  vanState(t) {
    const T = this.T; let x, brake = 0;
    if (this.ph !== 'leaving' && this.driveAt > 1e8) {
      if (t < T.cruise) x = START_X + V0 * t;
      else if (t < T.arrive) { const k = (t - T.cruise) / T.brake; x = this.xb + BRAKE_D * (1 - (1 - k) * (1 - k)); brake = 1; }
      else x = STOP_X;
    } else {
      const k = Math.max(0, t - this.driveAt); const A = 2.4, vm = 14;     // leaves: 2.4 m/s^2 up to 14 m/s
      const tm = vm / A; x = STOP_X + (k < tm ? 0.5 * A * k * k : 0.5 * A * tm * tm + vm * (k - tm));
    }
    return { x, brake };
  }

  update(dt) {
    if (this.t < 0 || this.done) return;
    this.t += dt; const t = this.t, T = this.T; const O = this.O;
    // ---------------------------------------------------------------- the van
    if (this.van) {
      const vs = this.vanState(t); const x = vs.x;
      const vx = this.vanPrev === undefined ? 0 : (x - this.vanPrev) / Math.max(dt, 1e-4); this.vanPrev = x; this.vanX = x;
      this.van.position.set(x, this.groundY, LANE_Z);
      for (const w of this.wheels) w.rotation.x += (vx / 0.36) * dt;
      const open = t < this.doorsAt ? 0 : t < this.closeAt ? smooth((t - this.doorsAt) / 1.2) : 1 - smooth((t - this.closeAt) / 1.0);
      if (this.doors.DoorRL) this.doors.DoorRL.o.rotation.y = this.doors.DoorRL.rest - open * 105 * DEG;
      if (this.doors.DoorRR) this.doors.DoorRR.o.rotation.y = this.doors.DoorRR.rest + open * 105 * DEG;
      // nose dip: a quick 1.5 degrees as it brakes, settling back (a little overshoot) after the stop
      let pitch = 0;
      if (t < T.cruise) pitch = 0; else if (t < T.arrive) pitch = 1.5 * smooth((t - T.cruise) / 1.2);
      else { const q = t - T.arrive; pitch = 1.5 * Math.exp(-q / 0.45) * Math.cos(q * 2 * Math.PI / 1.1); }
      if (this.driveAt < 1e8 && t > this.driveAt) pitch = -1.2 * smooth((t - this.driveAt) / 0.8) * Math.exp(-(t - this.driveAt) / 3);
      this.bodyG.rotation.x = pitch * DEG;
      const fade = 1 - smooth((x - 90) / 100);
      const braking = (t >= T.cruise - 0.1 && t < T.arrive + 0.5);
      // brake lights flare while braking; the tails sit at 3, the headlamps at 3 with a lens ring
      if (this.tailMat) this.tailMat.emissiveIntensity = lerp(this.tailMat.emissiveIntensity, (braking ? 8 : 3) * fade, 1 - Math.exp(-dt * 14));
      const gone = x > 215;
      const lampK = t < T.arrive ? 1 : (this.driveAt < 1e8 ? 1 : 0.75);
      if (this.headMat) this.headMat.emissiveIntensity = 3 * fade;
      for (const L of this.lamps || []) L.cone.material.uniforms.uK.value = gone ? 0 : 0.5 * lampK * fade;
      // the street beam: a wide soft cone from the bumper, aimed low so the pool starts at the van
      const fx = x + 2.6, fy = this.groundY + 0.85;
      this.beam.position.set(fx, fy, LANE_Z - 0.3); this.beam.target.position.set(fx + 9, this.groundY, LANE_Z - 0.8);
      const fadeIn = clamp01((t - 1.0) / 2.5);
      this.beam.intensity = (gone ? 0 : 55) * fadeIn;
      // sweep: the van's headlights through Flynn's front windows. One spot stands in for the beams, high on the street side of the glass; it
      // slides along the front with the van, and its pool slides across the floor, the cabinets and the stairs the same way (swinging to the
      // back as the van brakes), holds while it is stopped, then lets go (11-08, Daryll: "the headlights don't sweep across the floor").
      const kS = smooth((x - 38) / (STOP_X - 38)), kT = smooth((x - (STOP_X - 14)) / 14);            // approach, and the last stretch (the brake)
      const fadeS = smooth((x - 34) / 8) * (1 - smooth((t - T.arrive - 0.6) / 2.0));
      const lampX = lerp(64, 88, kS);
      this.sweep.position.set(lampX, this.groundY + 5.0, LANE_Z + 3.6);
      this.sweep.target.position.set(lerp(67, 88, kS), this.groundY - 0.1, lerp(-172.5, -176.5, kT));
      this.sweep.intensity = SWEEP_I * fadeS;
      const HL = O.headlight;                                 // the same spot, drawn onto the baked floor and walls (js/outside.js withHeadlight)
      if (HL) {
        HL.hlPos.value.copy(this.sweep.position); HL.hlDir.value.copy(this.sweep.target.position).sub(this.sweep.position).normalize();
        const ca = Math.cos(this.sweep.angle), ci = Math.cos(this.sweep.angle * (1 - this.sweep.penumbra)); HL.hlCone.value.set(ca, ci);
        HL.hlK.value = gone ? 0 : HL_K * fadeS;
      }
      // a cool rim over the kerb side near the stop, on while the van is there
      this.rim.position.set(STOP_X + 0.5, this.groundY + 4.2, LANE_Z - 3.3);
      this.rim.intensity = 14 * smooth((x - 60) / 14) * (gone ? 0 : 1) * (1 - smooth((x - STOP_X - 1) / 6)) * (t < T.walk + 3 ? 1 : 1 - smooth((t - T.walk - 3) / 1.5)) * (this.driveAt < 1e8 ? 0 : 1);
      this.van.visible = !gone;
      if (t > T.arrive && !this.saidArrived) { this.saidArrived = true; this.onArrive && this.onArrive(); }
      // the glow: a warm dome in the cargo, then it follows the cabinet
      this.glowW = 0;
    }
    // ---------------------------------------------------------------- who is where
    this.runMen(dt, t);
    if (this.van) {
      const dome = this.glowOn ? 1 : 0;
      this.glowI = lerp(this.glowI || 0, dome, 1 - Math.exp(-dt * 6));
      this.glow.intensity = 8 * this.glowI;
    }
    if (this.ph === 'done') { this.done = true; this.root.visible = false; for (const l of [this.beam, this.sweep, this.rim, this.glow]) if (l) l.intensity = 0; this.onDone && this.onDone(); }
  }

  // ---------------------------------------------------------------- the men, the hand truck and the cabinet
  reachPts(carry) {
    // world points for the hands
    this.dmodel.updateWorldMatrix(true, false);
    const hL = this.dmodel.localToWorld(this.handles[0].clone()), hR = this.dmodel.localToWorld(this.handles[1].clone());
    return { hL, hR };
  }
  place(m, p, yaw, moved, b, opts) {
    const g = m.g; g.visible = true;
    g.position.copy(p); g.rotation.set(0, yaw, 0); g.updateMatrixWorld(true);
    if (m.rig) m.rig.pose(moved, b, opts);
  }
  runMen(dt, t) {
    const T = this.T, A = this.routeA;
    const [m1, m2] = this.men; const w = this.tmp;
    this.phT += dt;
    const cabGlow = () => { this.tilt.updateWorldMatrix(true, false); this.cab.getWorldPosition(w.a); this.glow.position.copy(w.a).add(new THREE.Vector3(0, 0.9, 0)); };
    const moveOf = (m, p) => { const d = m.has ? m.last.distanceTo(p) : 0; m.last.copy(p); m.has = true; return d; };
    // ---- waiting for the doors
    if (this.ph === 'van') {
      if (t >= T.doors) { // everything loaded behind the closing doors; men and truck wait inside, lying low
        this.dolly.visible = true;
        const a = this.sample(A, 0);
        this.s = 0; this.tiltCur = CARGO_TILT * DEG; this.layout(a, 0, 1);
      }
      if (t >= T.walk) { this.ph = 'in'; this.phT = 0; }
      return;
    }
    if (this.ph === 'in') {
      const ramp = smooth(this.phT / 1.2);
      const stoopHere = this.stoopOf(this.sample(A, this.s).p);
      const v = WALK * (0.55 + 0.45 * (1 - stoopHere)) * ramp; this.s = Math.min(A.total, this.s + v * dt);
      this.layout(this.sample(A, this.s), v / WALK, 1);
      const sp = this.sample(A, this.s).p;
      if (sp.z < -163.4 && this.onDoors) { this.onDoors(); this.onDoors = null; }
      if (this.s >= A.total - 1e-3) { this.ph = 'turn'; this.phT = 0; this.turn0 = { p: this.dolly.position.clone(), yaw: this.dolly.rotation.y, m1: m1.g.position.clone(), m2: m2.g.position.clone(), y1: m1.g.rotation.y, y2: m2.g.rotation.y }; }
      return;
    }
    if (this.ph === 'turn') {
      // turn the truck about, stand the cabinet up on its spot; the men let go and step aside
      this.glowOn = false; const k = smooth(this.phT / 1.8), end = this.sample(A, A.total);
      const yaw0 = this.turn0.yaw; this.dolly.position.copy(this.turn0.p).lerp(this.endDolly, k);
      this.dolly.rotation.set(0, angLerp(yaw0, 0, k), 0);
      this.tilt.rotation.x = lerp(this.tiltCur, 0, k);
      cabGlow();
      const side = new THREE.Vector3().crossVectors(up, end.d).normalize();
      const aim = (m, base, yaw, off, face) => { const tgt = base.clone().addScaledVector(side, off * k); const mv = moveOf(m, tgt); this.place(m, tgt, angLerp(yaw, face, k), mv, mv > 1e-4 ? 1 : 0, { reach: [null, null] }); };
      aim(m1, this.turn0.m1, this.turn0.y1, 0.75, yawTo(new THREE.Vector3(0, 0, 1)) + 0.4);
      aim(m2, this.turn0.m2, this.turn0.y2, -0.2, yawTo(new THREE.Vector3(0, 0, 1)) - 0.3);
      if (this.phT >= 1.8) { this.ph = 'drop'; this.phT = 0; this.drop0 = { m1: m1.g.position.clone(), m2: m2.g.position.clone(), y1: m1.g.rotation.y, y2: m2.g.rotation.y }; }
      return;
    }
    if (this.ph === 'drop') {
      // the cabinet settles on the floor; the empty truck tips back and slides out from under it; the real cabinet takes over at the same pose
      const k = smooth(this.phT / 1.4);
      const kSet = smooth(this.phT / 0.5), kSlide = smooth((this.phT - 0.3) / 1.1);
      const out0 = this.sample(A, A.total); const exitP = this.routeB.pts[0];
      this.cab.position.y = (this.cabPos.y - this.axle.y) - 0.04 * kSet;
      // the truck is dragged back along the cabinet's own axis toward the aisle, turning to face out
      const toAisle = new THREE.Vector3(AISLE_X - 0.9 - this.endDolly.x, 0, 0);
      const exitPose = this.sample(this.routeB, 0);
      const target = this.endDolly.clone().add(new THREE.Vector3(1.05, 0, 1.1));
      this.dolly.position.copy(this.endDolly).lerp(target, kSlide);
      this.dolly.rotation.set(0, angLerp(0, Math.atan2(exitPose.d.x, exitPose.d.z), kSlide), 0);
      this.tilt.rotation.x = lerp(0, -12 * DEG, kSlide);
      if (kSlide > 0.02 && !this.cabDetached) { this.cabDetached = true; this.cab.removeFromParent(); this.root.add(this.cab); this.cab.position.copy(this.spot); this.cab.rotation.set(0, 0, 0); this.cab.quaternion.copy(this.spotQ); this.cab.position.y = this.spot.y + 0.0; }
      if (this.cabDetached) { this.cab.position.set(this.spot.x, this.spot.y + 0.04 * (1 - kSet), this.spot.z); }
      cabGlow(); this.glow.position.set(this.spot.x + 0.6, this.spot.y + 1.2, this.spot.z + 1.0);
      const handle = this.reachPts();
      // men: the first walks round to the handles, the second steps back and watches
      const e = this.sample(this.routeB, 0);
      const tgt1 = handle.hL.clone().add(handle.hR).multiplyScalar(0.5); const dd = new THREE.Vector3(Math.sin(this.dolly.rotation.y), 0, Math.cos(this.dolly.rotation.y));
      const p1 = tgt1.clone().addScaledVector(dd, -0.56); p1.y = this.groundY + (this.spot.y - this.groundY);
      const mv1 = moveOf(m1, p1.clone().lerp(m1.g.position, 0.0)); // distance bookkeeping only
      const q1 = m1.g.position.clone().lerp(p1, kSlide > 0 ? 0.25 : 0);
      this.place(m1, kSlide > 0 ? q1 : m1.g.position.clone(), angLerp(this.drop0.y1, yawTo(dd), Math.min(1, kSlide * 3)), q1.distanceTo(m1.g.position), kSlide > 0 ? 1 : 0, { reach: kSlide > 0.3 ? [handle.hL, handle.hR] : [null, null], reachW: [smooth((kSlide - 0.3) / 0.4), smooth((kSlide - 0.3) / 0.4)] });
      this.place(m2, m2.g.position.clone(), m2.g.rotation.y, 0, 0, { reach: [null, null] });
      if (this.phT >= 1.4) {
        this.placed = true; this.cab.visible = false;
        for (const m of this.realVisual) m.visible = true;
        for (const m of this.emptySpot) m.visible = false;
        this.O.polyPlaced = true; this.onPlaced && this.onPlaced();
        this.ph = 'out'; this.phT = 0; this.sB = 0; this.vB = 0;
        for (const m of this.men) { m.blend.copy(m.g.position); m.blendT = 0; m.hasBlend = true; }
        this.glowOn = false;
      }
      return;
    }
    if (this.ph === 'out') {
      const Bc = this.routeB; const ramp = smooth((this.phT - 0.4) / 1.0);
      const here = this.sample(Bc, this.sB); const stoopHere = this.stoopOf(here.p);
      const v = WALK * (0.65 + 0.35 * (1 - stoopHere)) * ramp; this.sB = Math.min(Bc.total, this.sB + v * dt);
      // the truck leads, tipped back a touch, flat to lie in the cargo; man one behind it, man two a step behind and aside
      const cur = this.sample(Bc, this.sB);
      this.layout(cur, v / WALK, 0);
      if (this.sB >= Bc.total - 1e-3) { this.ph = 'shut'; this.phT = 0; this.closeAt = t + 0.9; }
      return;
    }
    if (this.ph === 'shut') {
      // inside the cargo, still; the doors close; then the van goes
      const cur = this.sample(this.routeB, this.routeB.total); this.layout(cur, 0, 0, true);
      this.glowOn = true;
      if (t > this.closeAt + 1.0 && this.driveAt > 1e8) { this.driveAt = t + 0.4; }
      if (t > this.closeAt + 1.1) { for (const m of this.men) m.g.visible = false; this.dolly.visible = false; this.glowOn = false; }
      if (this.driveAt < 1e8 && t > this.driveAt) { this.ph = 'leaving'; this.phT = 0; }
      return;
    }
    if (this.ph === 'leaving') {
      if (this.vanX > 215) this.ph = 'done';
      return;
    }
  }

  // the formation for a walk along a curve: dolly at s, pusher behind its handles, helper alongside
  // arriving = true: carrying the cabinet in (helper steadies it); false: leaving with the empty truck
  layout(a, wk, arriving, still = false) {
    const A = arriving ? this.routeA : this.routeB; const m1 = this.men[0], m2 = this.men[1];
    const s = arriving ? this.s : this.sB;
    const dpos = a.p.clone(); const yaw = Math.atan2(a.d.x, a.d.z);
    dpos.y = this.floorOf(dpos, dpos.y);
    // the truck lies in the cargo, tips up over the lip, carried at 24 degrees with the cabinet; empty it trails at 12
    const inCargo = this.stoopOf(a.p);
    const out = arriving ? -24 * DEG : -14 * DEG;
    const target = lerp(out, CARGO_TILT * DEG, inCargo);
    this.tiltCur = target; this.glowOn = inCargo > 0.05;
    this.dolly.position.copy(dpos); this.dolly.rotation.set(0, yaw, 0); this.tilt.rotation.x = target;
    this.cab.visible = arriving ? true : false;
    this.dolly.updateMatrixWorld(true);
    const hd = this.reachPts();
    // pusher: stands behind the mid-point of the handles, at the foot of the slope
    const mid = hd.hL.clone().add(hd.hR).multiplyScalar(0.5);
    const dirH = new THREE.Vector3(a.d.x, 0, a.d.z);
    const back = lerp(BACK_OUT, BACK_CARGO, inCargo);
    const p1 = mid.clone().addScaledVector(dirH, -back); p1.y = this.floorOf(p1, this.groundY + (a.p.y - this.groundY));
    // (floor under his feet along the route: the route carries the sill step)
    const mv1 = this.moveOf2(m1, p1);
    // he ducks under the roof, and while he stands on the loading lip above the truck's wheels (the handles then sit low at his knees); never beside the van
    const lipH = (p1.y - dpos.y) / 0.5;
    const st1 = Math.max(this.crouchOf(p1), this.crouchOf(mid), clamp01(lipH) * (1 - smooth((Math.abs(p1.z - LANE_Z) - 0.9) / 0.3)));
    const reach1 = [hd.hL, hd.hR];
    this.place(m1, p1, yawTo(dirH), mv1, still ? 0 : wk, { stoop: st1, lean: 0.12 * (1 - st1), reach: reach1, reachW: [1, 1], stepUp: this.stepUpAt(p1) });
    // helper: alongside (left of travel), a little ahead of the handles' line; hand on the cabinet's flank while it travels
    const sH = Math.max(0, Math.min(A.total, s + 0.1)); const ah = this.sample(A, sH);
    const side = new THREE.Vector3().crossVectors(up, ah.d).normalize();
    const lat = arriving ? this.cabHalfW + 0.5 : 0.8;
    const lag = arriving ? 0.25 : 0.1;
    const q = this.sample(A, Math.max(0, s - lag)); const sideQ = new THREE.Vector3().crossVectors(up, q.d).normalize();
    const p2 = q.p.clone().addScaledVector(sideQ, lat); p2.y = this.floorOf(p2, this.groundY + (q.p.y - this.groundY));
    if (!arriving && Math.abs(p2.z - LANE_Z) < 1.15) p2.z = LANE_Z - 0.45;          // inside the cargo they stand one behind the other: keep him on his own side of the truck
    const mv2 = this.moveOf2(m2, p2); const st2 = this.crouchOf(p2);
    let reach2 = [null, null];
    if (arriving) { this.tilt.updateWorldMatrix(true, true); const pt = this.cab.localToWorld(new THREE.Vector3(this.cabHalfW + 0.02, Math.min(this.cabH * 0.62, 1.0), 0.0)); reach2 = [null, pt]; }
    this.place(m2, p2, yawTo(new THREE.Vector3(ah.d.x, 0, ah.d.z)), mv2, still ? 0 : wk, { stoop: st2, lean: 0.03, reach: reach2, reachW: [1, arriving ? 1 : 0], stepUp: this.stepUpAt(p2) });
    if (arriving) { this.glow.position.copy(dpos).add(new THREE.Vector3(0, 1.0, 0)); }
    else { this.glow.position.set(dpos.x, dpos.y + 1.1, dpos.z); }
  }
  moveOf2(m, p) { const d = m.has ? m.last.distanceTo(p) : 0; m.last.copy(p); m.has = true; return d > 1 ? 0 : d; }
  stepUpAt(p) { return Math.abs(p.z - LANE_Z) > 1.2 ? 0 : (1 - Math.abs(smooth((p.x - (RX - 0.8)) / 0.8) - 0.5) * 2); }
}
