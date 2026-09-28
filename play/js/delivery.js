// THE DELIVERY (docs/THE_GAME/THE_LINE_2026-09-26.md, beat 6): once three of ours are beaten, a black van pulls up
// outside Flynn's, two men in black suits wheel a black cabinet with no name in through the front doors on a hand
// truck, stand it in the empty spot at the back, walk out without a word, and the van drives off.
// The men are the Unity suits kit (two poses, swapped every stride, MenInSuits' numbers); the cabinet is the real
// Polybius cabinet from the scene; the van and the hand truck come from blender/basement/van_kit.py.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DEG = Math.PI / 180;
const up = new THREE.Vector3(0, 1, 0);
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const yawTo = (d) => Math.atan2(-d.x, -d.z);            // yaw that points local -Z along d

// where things happen (web coordinates: Unity's with z flipped)
const LANE_Z = -159.6, STOP_X = 79.2, ENTER_X = 20, LEAVE_X = 140;
const AISLE_X = 83.3;          // the open aisle between our rows (edge x 82.0) and the racers on the right

export async function loadDeliveryModels() {
  const loader = new GLTFLoader();
  const get = (f) => new Promise((res) => loader.load(f, (g) => res(g.scene), undefined, () => res(null)));
  const [van, dolly] = await Promise.all([get('assets/models/van.glb'), get('assets/models/dolly.glb')]);
  return { van, dolly };
}

export class Delivery {
  constructor({ O, models, groundY = -37.06 }) {
    this.O = O; this.t = -1; this.done = false; this.groundY = groundY;
    this.root = new THREE.Group(); this.root.name = 'delivery'; this.root.visible = false; O.group.add(this.root);
    // ---- the van: front faces +Z in the glb; drives along +X
    this.van = models.van ? models.van.clone(true) : null;
    if (this.van) {
      this.van.rotation.y = 90 * DEG; this.root.add(this.van);
      this.wheels = []; this.doors = {};
      this.van.traverse((o) => {
        if (/^Wheel_/.test(o.name)) this.wheels.push(o);
        if (o.name === 'DoorRL' || o.name === 'DoorRR') this.doors[o.name] = { o, rest: o.rotation.y };
        if (o.isMesh && /Headlights|Taillights/.test(o.name)) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(/Head/.test(o.name) ? 0xfff2d0 : 0xff2a1a); o.material.emissiveIntensity = /Head/.test(o.name) ? 6 : 3; }
      });
      // a light the van carries, so its arrival shows on the street and through Flynn's windows
      this.beam = new THREE.SpotLight(0xfff0d0, 0, 30, 32 * DEG, 0.5, 2); O.group.add(this.beam); O.group.add(this.beam.target);
    }
    // ---- the hand truck; the cabinet rides on its nose plate, back against the frame, screen forward
    this.dolly = models.dolly ? models.dolly.clone(true) : new THREE.Group();
    this.root.add(this.dolly);
    this.tilt = new THREE.Group(); this.dolly.add(this.tilt);
    // ---- the cabinet: a copy of the real one, re-framed around its base
    const visualPath = 'Outside/Flynns/FlynnsInterior/PolybiusSpot/Visual';
    const vo = O.obj(visualPath);
    this.spot = new THREE.Vector3(...vo.pos);                         // the nook (js/outside.js LAYOUT)
    const rootM = new THREE.Matrix4().compose(new THREE.Vector3(...vo.pos), new THREE.Quaternion(...vo.rot), new THREE.Vector3(1, 1, 1));
    const inv = rootM.clone().invert();
    this.cab = new THREE.Group();
    this.realVisual = []; this.emptySpot = [];
    for (const [p, ms] of Object.entries(O.byPath)) {
      if (p.startsWith(visualPath + '/')) for (const m of ms) {
        this.realVisual.push(m);
        const c = new THREE.Mesh(m.geometry, m.material); c.matrixAutoUpdate = true;
        inv.clone().multiply(m.matrix).decompose(c.position, c.quaternion, c.scale); this.cab.add(c);
      }
      if (p.startsWith('Outside/Flynns/FlynnsInterior/PolybiusSpot/EmptySpot')) this.emptySpot.push(...ms);
    }
    const bb = new THREE.Box3().setFromObject(this.cab);
    this.cabDepth = bb.max.z - bb.min.z; this.cabBackZ = bb.min.z;
    this.nose = 0.04;
    if (models.dolly) { const db = new THREE.Box3().setFromObject(this.dolly); this.nose = Math.max(0.02, db.min.y + 0.03); }
    this.cab.position.set(0, this.nose, -this.cabBackZ + 0.06);   // back of the cabinet 6 cm in front of the frame
    this.endDolly = this.spot.clone().sub(this.cab.position);             // where the truck stands so the cabinet lands exactly on its spot
    this.tilt.add(this.cab);
    // ---- the two men: pose meshes relative to each figure's feet (kit front = Unity +Z = web -Z)
    const fig = (a, b) => {
      const g = new THREE.Group(), poses = [];
      for (const key of [a, b]) {
        const pose = new THREE.Group();
        for (const part of O.templates[key] || []) {
          const mesh = new THREE.Mesh(part.geo, part.mat); mesh.matrixAutoUpdate = true;
          part.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale); pose.add(mesh);
        }
        g.add(pose); poses.push(pose);
      }
      poses[1].visible = false;
      if (!poses[0].children.length) {             // no kit: a dark capsule stands in (MenInSuits' own fallback)
        const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.28, 4, 10), new THREE.MeshStandardMaterial({ color: 0x0d0d12, roughness: 0.6 }));
        c.position.y = 0.9; poses[0].add(c);
      }
      this.root.add(g); return { g, poses };
    };
    this.men = [fig('Suits/manOne_A', 'Suits/manOne_B'), fig('Suits/manTwo_A', 'Suits/manTwo_B')];
  }

  // the route: from the van's back doors, in the front door, down the open aisle, round into the nook
  path() {
    const rear = new THREE.Vector3(STOP_X - 3.0, this.groundY, LANE_Z), f = -36.99, nz = this.spot.z;
    return [rear, new THREE.Vector3(80.4, this.groundY, -161.8), new THREE.Vector3(82, this.groundY, -165.4), new THREE.Vector3(82, f, -168.6),
      new THREE.Vector3(AISLE_X, f, -170.4), new THREE.Vector3(AISLE_X, f, nz + 2.4), new THREE.Vector3(this.spot.x + 0.3, f, nz + 1.35)];
  }
  start(onDoors, onDone) {
    if (this.t >= 0) return;
    this.t = 0; this.root.visible = true; this.onDoors = onDoors; this.onDone = onDone;
    this.route = this.path(); this.legs = [];
    let total = 0;
    for (let i = 1; i < this.route.length; i++) { const L = this.route[i].distanceTo(this.route[i - 1]); this.legs.push(L); total += L; }
    this.routeLen = total;
    this.dolly.visible = false; for (const m of this.men) m.g.visible = false;
    const nz = this.spot.z;
    this.exit = [new THREE.Vector3(this.spot.x + 0.5, -36.99, nz + 1.3), new THREE.Vector3(AISLE_X, -36.99, nz + 2.4), new THREE.Vector3(AISLE_X, -36.99, -170.4),
      new THREE.Vector3(82, -36.99, -168.6), new THREE.Vector3(82, this.groundY, -164.9), new THREE.Vector3(STOP_X - 3.0, this.groundY, LANE_Z)];
    let ex = 0; for (let i = 1; i < this.exit.length; i++) ex += this.exit[i].distanceTo(this.exit[i - 1]);
    const T = { arrive: 7.5, doors: 8.6, walk: 9.4, speed: 1.15 };
    T.inside = T.walk + total / T.speed; T.stand = T.inside + 1.6; T.out = T.stand + 0.6;
    T.boarded = T.out + ex / 1.3; T.close = T.boarded + 0.4; T.drive = T.close + 1.3; T.gone = T.drive + 8;
    this.T = T;
  }
  at(s) {                       // point along the route at distance s, and the direction there
    let i = 0; while (i < this.legs.length - 1 && s > this.legs[i]) { s -= this.legs[i]; i++; }
    const a = this.route[i], b = this.route[i + 1], k = Math.min(1, Math.max(0, s / this.legs[i]));
    return { p: a.clone().lerp(b, k), d: b.clone().sub(a).setY(0).normalize() };
  }
  walkMan(m, p, dir, t, offset = 0) {
    m.g.visible = true;
    const k = Math.floor(t / 0.35) & 1;
    m.poses[0].visible = k === 0 || m.poses[1].children.length === 0; m.poses[1].visible = !m.poses[0].visible;
    m.g.position.copy(p); m.g.position.y += Math.abs(Math.sin((t / 0.35) * Math.PI)) * 0.015;
    if (offset) m.g.position.addScaledVector(new THREE.Vector3().crossVectors(up, dir).normalize(), offset);
    m.g.rotation.set(0, yawTo(dir), 0);
  }
  update(dt) {
    if (this.t < 0 || this.done) return;
    this.t += dt; const t = this.t;
    const T = this.T;
    // ---- the van: rolls in and stops, doors open, waits, doors close, drives off
    if (this.van) {
      let x;
      if (t < T.arrive) { const k = t / T.arrive; x = ENTER_X + (STOP_X - ENTER_X) * (1 - (1 - k) * (1 - k)); }
      else if (t < T.drive) x = STOP_X;
      else { const k = (t - T.drive); x = STOP_X + 1.2 * k * k; }
      const vx = this.vanX === undefined ? 0 : (x - this.vanX) / Math.max(dt, 1e-4); this.vanX = x;
      this.van.position.set(x, this.groundY, LANE_Z);
      for (const w of this.wheels) w.rotation.x += (vx / 0.36) * dt;
      const open = t < T.doors ? 0 : t < T.close ? smooth((t - T.doors) / 1.0) : 1 - smooth((t - T.close) / 1.0);
      if (this.doors.DoorRL) this.doors.DoorRL.o.rotation.y = this.doors.DoorRL.rest - open * 105 * DEG;
      if (this.doors.DoorRR) this.doors.DoorRR.o.rotation.y = this.doors.DoorRR.rest + open * 105 * DEG;
      if (x > LEAVE_X) this.van.visible = false;
      this.beam.position.set(x + 2.7, this.groundY + 0.85, LANE_Z); this.beam.target.position.set(x + 14, this.groundY, LANE_Z);
      this.beam.intensity = this.van.visible ? 40 : 0;
      if (t > T.arrive && !this.saidArrived) { this.saidArrived = true; this.onArrive && this.onArrive(); }
    }
    // ---- in: the cabinet on the hand truck, one man pushing, one at its side
    if (t >= T.walk && t < T.inside) {
      const s = (t - T.walk) * T.speed; const { p, d } = this.at(s);
      if (s > 7.5 && this.onDoors) { this.onDoors(); this.onDoors = null; }
      this.dolly.visible = true;
      this.dolly.position.copy(p); this.dolly.rotation.set(0, Math.atan2(d.x, d.z), 0);
      this.tilt.rotation.x = -24 * DEG * smooth((t - T.walk) / 0.8);
      const behind = p.clone().addScaledVector(d, -0.95);
      this.walkMan(this.men[0], behind, d, t);
      this.walkMan(this.men[1], p.clone().addScaledVector(d, -0.2), d, t + 0.17, -0.85);
    }
    // ---- stand it up in the spot
    if (t >= T.inside && t < T.stand) {
      const k = smooth((t - T.inside) / (T.stand - T.inside));
      const end = this.at(this.routeLen);
      this.dolly.position.copy(end.p.clone().lerp(this.endDolly, k)); this.dolly.rotation.set(0, Math.atan2(end.d.x, end.d.z) * (1 - k), 0);
      this.tilt.rotation.x = -24 * DEG * (1 - k);
      for (const m of this.men) { for (const p of m.poses) p.visible = p === m.poses[0]; }
    }
    if (t >= T.stand && !this.placed) {
      this.placed = true;
      for (const m of this.realVisual) m.visible = true;
      for (const m of this.emptySpot) m.visible = false;
      this.cab.visible = false; this.dolly.visible = false; this.O.polyPlaced = true;
      this.onPlaced && this.onPlaced();
    }
    // ---- out: MenInSuits' walk (the spot to the front door), then down to the van
    if (t >= T.out && t < T.gone) {
      const exit = this.exit;
      let s = (t - T.out) * 1.3, i = 0;
      while (i < exit.length - 2 && s > exit[i].distanceTo(exit[i + 1])) { s -= exit[i].distanceTo(exit[i + 1]); i++; }
      const a = exit[i], b = exit[i + 1], k = Math.min(1, s / a.distanceTo(b));
      const p = a.clone().lerp(b, k), d = b.clone().sub(a).setY(0).normalize();
      const inVan = i === exit.length - 2 && k >= 1;
      this.walkMan(this.men[0], p, d, t, -0.45); this.walkMan(this.men[1], p, d, t + 0.17, 0.45);
      if (inVan) for (const m of this.men) m.g.visible = false;
    }
    if (t >= T.gone) { this.done = true; this.root.visible = false; if (this.beam) this.beam.intensity = 0; this.onDone && this.onDone(); }
  }
}
