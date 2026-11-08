// A walking rig for the Unity suits kit's two men (js/delivery.js). The kit ships each man as a few merged meshes in one
// stride pose (legs and arms are not separate), so the rig skins those meshes to a small skeleton by where each vertex sits:
//   root -> torso (hip pivot; leans, carries the shoulders) -> two shoulders (one straight arm each, swing or reach a point)
//   root -> two legs: hip -> knee -> ankle (two-bone IK to a foot target, so a planted foot stays planted)
// The gait is driven by the distance the figure actually moved, one step per STEP metres, so feet do not skate.
import * as THREE from 'three';

const X = new THREE.Vector3(1, 0, 0);
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const ang = (v) => Math.atan2(-v.z, -v.y);                     // angle of a segment from straight down, forward (-Z) positive
export const STEP = 0.48;                                       // metres per step (half a stride)

const B = { root: 0, torso: 1, sh: [2, 3], hip: [4, 7], knee: [5, 8], ank: [6, 9] };

export function buildRig(O, key, { briefcase = true } = {}) {
  const parts = O.templates[key] || [];
  if (!parts.length) return null;
  // 1. bake each part into the figure's frame
  const rawDbg = [];
  const geos = parts.map((p) => { p.geo.computeBoundingBox(); const rb = p.geo.boundingBox; const g = p.geo.clone(); for (const nm of Object.keys(g.attributes)) { const a = g.attributes[nm]; if (!(a.array instanceof Float32Array) || a.isInterleavedBufferAttribute) { const out = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k); g.setAttribute(nm, new THREE.BufferAttribute(out, a.itemSize)); } } g.applyMatrix4(p.matrix); g.computeBoundingBox(); rawDbg.push({ raw: [rb.min.toArray(), rb.max.toArray()].map((a) => a.map((x) => +x.toFixed(2))), m: p.matrix.elements.map((x) => +x.toFixed(2)), after: [g.boundingBox.min.toArray(), g.boundingBox.max.toArray()].map((a) => a.map((x) => +x.toFixed(2))) }); return g; });
  const info = geos.map((g, i) => {
    g.computeBoundingBox(); const b = g.boundingBox;
    return { g, mat: parts[i].mat, b, n: g.attributes.position.count };
  });
  for (const f of info) {
    f.case = f.b.max.y <= 0.86 && f.b.min.y >= 0.3 && Math.abs(f.b.min.x + f.b.max.x) > 0.3 && f.b.min.y > 0.25;   // the briefcase (and its handle)
    f.skin = f.b.min.y < 1.0 && f.b.max.y > 1.7;
    f.suit = false;
  }
  const suit = info.filter((f) => !f.case && !f.skin).sort((a, b) => b.n - a.n)[0]; if (suit) suit.suit = true;
  const skin = info.find((f) => f.skin);
  // 2. rest joints, read off the stride pose
  const avg = (f, test) => { const p = f.g.attributes.position, s = new THREE.Vector3(); let n = 0, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (test(v)) { s.add(v); n++; } } return n ? s.multiplyScalar(1 / n) : null; };
  const rest = { hip: [], knee: [], ankle: [], sho: [], hand: [], footPitch: [], armLen: [] };
  for (const sd of [0, 1]) {
    const sg = sd ? 1 : -1, side = (v) => (sd ? v.x > 0 : v.x < 0);
    const hip = new THREE.Vector3(0.1 * sg, 0.82, 0);
    const knee = (suit && avg(suit, (v) => side(v) && v.y > 0.42 && v.y < 0.5)) || new THREE.Vector3(0.1 * sg, 0.45, 0);
    const ankle = (suit && avg(suit, (v) => side(v) && v.y < 0.11)) || new THREE.Vector3(0.1 * sg, 0.08, 0);
    knee.x = hip.x; ankle.x = hip.x;
    const sho = new THREE.Vector3(0.2 * sg, 1.38, 0);
    const hand = (skin && avg(skin, (v) => side(v) && v.y < 1.0 && Math.abs(v.x) > 0.15)) || new THREE.Vector3(0.25 * sg, 0.78, 0);
    // the shoe's pitch in the kit pose: principal axis of its (forward, up) scatter
    let pitch = 0;
    const shoe = info.find((f) => !f.case && !f.skin && !f.suit && f.b.max.y < 0.3 && f.b.max.y > 0.1 && f.b.min.y < 0.02 && (f.b.max.z - f.b.min.z) > 0.6);
    if (shoe) {
      const p = shoe.g.attributes.position, pts = []; for (let i = 0; i < p.count; i++) if (side(new THREE.Vector3().fromBufferAttribute(p, i))) pts.push([-p.getZ(i), p.getY(i)]);
      if (pts.length > 8) { const mx = pts.reduce((a, q) => a + q[0], 0) / pts.length, my = pts.reduce((a, q) => a + q[1], 0) / pts.length; let sxx = 0, syy = 0, sxy = 0; for (const q of pts) { sxx += (q[0] - mx) ** 2; syy += (q[1] - my) ** 2; sxy += (q[0] - mx) * (q[1] - my); } pitch = 0.5 * Math.atan2(2 * sxy, sxx - syy); if (Math.abs(pitch) > 0.6) pitch = 0; }
    }
    rest.hip.push(hip); rest.knee.push(knee); rest.ankle.push(ankle); rest.sho.push(sho); rest.hand.push(hand); rest.footPitch.push(pitch);
    rest.armLen.push(sho.distanceTo(hand) + 0.06);
  }
  const TORSO = new THREE.Vector3(0, 0.84, 0);
  // 3. skeleton
  const bones = []; const mk = (name, pos, parent) => { const b = new THREE.Bone(); b.name = name; b.position.copy(pos); if (parent) parent.add(b); bones.push(b); return b; };
  const root = mk('root', new THREE.Vector3(), null);
  const torso = mk('torso', TORSO, root);
  const sh = [0, 1].map((s) => mk('sh' + s, rest.sho[s].clone().sub(TORSO), torso));
  const leg = [0, 1].map((s) => {
    const hip = mk('hip' + s, rest.hip[s], root), knee = mk('knee' + s, rest.knee[s].clone().sub(rest.hip[s]), hip), ank = mk('ank' + s, rest.ankle[s].clone().sub(rest.knee[s]), knee);
    return { hip, knee, ank };
  });
  // bones array must follow the B index map
  const ordered = [root, torso, sh[0], sh[1], leg[0].hip, leg[0].knee, leg[0].ank, leg[1].hip, leg[1].knee, leg[1].ank];
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(ordered);
  skeleton.calculateInverses();
  // 4. skin weights
  const group = new THREE.Group(); group.name = 'rigMeshes';
  const meshes = [];
  for (const f of info) {
    const g = f.g, p = g.attributes.position, n = p.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i);
      const w = new Map();
      const add = (bi, v) => { if (v > 1e-4) w.set(bi, (w.get(bi) || 0) + v); };
      if (f.case) { const sd = (f.b.min.x + f.b.max.x) > 0 ? 1 : 0; add(B.sh[sd], 1); }
      else {
        const sd = sm((x + 0.035) / 0.07) > 0.5 ? 1 : 0, sRight = sm((x + 0.035) / 0.07);
        const wl = sm((0.80 - y) / 0.14);
        const wa = sm((Math.abs(x) - 0.16) / 0.07) * sm((y - 0.70) / 0.10) * sm((1.50 - y) / 0.10);
        const A = wa * (1 - wl), Tt = Math.max(0, 1 - wl - A) * sm((y - 0.74) / 0.12), R = Math.max(0, 1 - wl - A - Tt);
        add(B.root, R); add(B.torso, Tt); add(B.sh[x > 0 ? 1 : 0], A);
        const wAnk = sm((0.20 - y) / 0.10), wKn = sm((0.52 - y) / 0.12);
        const hipW = 1 - wKn, ankW = wAnk, kneeW = Math.max(0, wKn - wAnk);
        for (const s of [0, 1]) { const sideW = s ? sRight : 1 - sRight; add(B.hip[s], wl * sideW * hipW); add(B.knee[s], wl * sideW * kneeW); add(B.ank[s], wl * sideW * ankW); }
      }
      // keep the four strongest
      const arr = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const tot = arr.reduce((a, q) => a + q[1], 0) || 1;
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = arr[k] ? arr[k][0] : 0; sw[i * 4 + k] = arr[k] ? arr[k][1] / tot : 0; }
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(g, f.mat); mesh.frustumCulled = false; mesh.castShadow = true;
    group.add(mesh); meshes.push({ mesh, case: f.case });
    if (f.case && !briefcase) mesh.visible = false;
  }
  const fig = new THREE.Group(); fig.add(group); fig.add(root);
  for (const m of meshes) m.mesh.bind(skeleton, new THREE.Matrix4());
  const legL = rest.knee.map((k, s) => [k.distanceTo(rest.hip[s]), rest.ankle[s].distanceTo(k)]);
  const rig = {
    fig, group, root, torso, sh, leg, skeleton, rest, meshes, u: 0, speed: 0, ready: true,
    hipRestY: 0.82,
    // distance-driven gait. moved: metres travelled this frame; b: 0..1 how much walking (0 standing); stoop: 0..1 crouch under a low roof;
    // lean: forward lean of the torso (radians, positive = forward); reach: [worldTargetOrNull, ...] per side; swing: arm swing amplitude
    pose(moved, b, { stoop = 0, lean = 0, reach = [null, null], reachW = [1, 1], swing = 0.32, lift = 0.07, stepUp = 0 } = {}) {
      this.u += Math.max(0, moved) / (2 * STEP);
      const S = STEP / 2;
      const f = [0, 0], y = [0, 0], pitch = [0, 0];
      for (const s of [0, 1]) {
        const p = ((this.u + s * 0.5) % 1 + 1) % 1;
        let fo, lf = 0, pt = 0;
        if (p < 0.5) { const k = p / 0.5; fo = S - 2 * S * k; pt = k > 0.78 ? -0.28 * sm((k - 0.78) / 0.22) : 0; }                      // stance: the foot goes back at body speed
        else { const k = (p - 0.5) / 0.5; const e = k * k * k * (k * (k * 6 - 15) + 10); fo = -S + 2 * S * e; lf = Math.sin(Math.PI * Math.min(1, k * 1.0)) * (lift + stepUp * 0.22); pt = k < 0.25 ? -0.28 * (1 - k / 0.25) : (k > 0.8 ? 0.18 * sm((k - 0.8) / 0.2) * (1 - (k - 0.8) / 0.2 * 0.0) : 0); }
        f[s] = fo * b; y[s] = lf * b; pitch[s] = pt * b;
      }
      // hip height: the highest both legs can reach, lowered to a crouch under a low roof
      let H = 9;
      for (const s of [0, 1]) { const L = legL[s][0] + legL[s][1]; const aY = rest.ankle[s].y + y[s]; H = Math.min(H, aY + Math.sqrt(Math.max(0.01, (0.985 * L) ** 2 - f[s] * f[s]))); }
      H = Math.min(H, this.hipRestY);
      const Hc = H * (1 - stoop) + 0.47 * stoop;
      root.position.y = Hc - this.hipRestY;
      torso.rotation.set(-(lean + 0.66 * stoop), 0, 0);
      for (const s of [0, 1]) {
        const [L1, L2] = legL[s]; const aY = rest.ankle[s].y + y[s];
        const h = Hc - aY, fo = f[s];
        let d = Math.sqrt(fo * fo + h * h); d = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, d));
        const base = Math.atan2(fo, h);
        const a1 = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))), a2 = Math.acos(Math.min(1, Math.max(-1, (L2 * L2 + d * d - L1 * L1) / (2 * L2 * d))));
        const thigh = base + a1, calf = base - a2;
        const dT = thigh - ang(rest.knee[s].clone().sub(rest.hip[s])), dC = calf - ang(rest.ankle[s].clone().sub(rest.knee[s])), dF = pitch[s] - rest.footPitch[s];
        leg[s].hip.quaternion.setFromAxisAngle(X, dT); leg[s].knee.quaternion.setFromAxisAngle(X, dC - dT); leg[s].ank.quaternion.setFromAxisAngle(X, dF - dC);
      }
      // arms: swing against the legs, or reach a world point (hand truck handle, the cabinet's flank)
      fig.updateMatrixWorld(true);
      const phase = this.u * 2 * Math.PI;
      // each hand takes the handle on its own side (11-08, Daryll: the pusher's "arms are crossed")
      if (reach[0] && reach[1]) {
        const w0 = sh[0].getWorldPosition(new THREE.Vector3()), w1 = sh[1].getWorldPosition(new THREE.Vector3());
        if (w0.distanceTo(reach[1]) + w1.distanceTo(reach[0]) < w0.distanceTo(reach[0]) + w1.distanceTo(reach[1])) { reach = [reach[1], reach[0]]; reachW = [reachW[1], reachW[0]]; }
      }
      for (const s of [0, 1]) {
        // a free arm hangs straight down at the side and swings fore and aft from there (the kit's stride pose held the arms out and
        // away, so swinging that pose about X waved the hands sideways: 11-08, Daryll: "the hands are just like waving")
        const out = Math.sign(rest.sho[s].x) || (s ? 1 : -1);
        const restDir = rest.hand[s].clone().sub(rest.sho[s]).normalize();
        const qDown = new THREE.Quaternion().setFromUnitVectors(restDir, new THREE.Vector3(0.1 * out, -1, 0.03).normalize());
        const swingA = Math.sin(phase + (s ? 0 : Math.PI)) * Math.min(swing, 0.22) * b;
        const qs = new THREE.Quaternion().setFromAxisAngle(X, swingA).multiply(qDown);
        const tgt = reach[s];
        if (tgt) {
          const loc = sh[s].parent.worldToLocal(tgt.clone()); const v = loc.sub(sh[s].position); const dist = v.length();
          const qr = new THREE.Quaternion().setFromUnitVectors(restDir, v.normalize());
          sh[s].quaternion.copy(qs).slerp(qr, Math.min(1, Math.max(0, reachW[s])));
          this['reachGap' + s] = Math.max(0, dist - rest.armLen[s]);
        } else sh[s].quaternion.copy(qs);
      }
    },
    handWorld(s) { const v = rest.hand[s].clone(); return fig.localToWorld(v); },
  };
  rig.rawDbg = rawDbg;
  rig.debug = info.map((f) => ({ n: f.n, case: f.case, skin: f.skin, suit: f.suit, min: f.b.min.toArray().map((x) => +x.toFixed(2)), max: f.b.max.toArray().map((x) => +x.toFixed(2)) }));
  fig.userData.rig = rig;
  return rig;
}
