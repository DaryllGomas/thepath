// THE AREAWAY (look batch 3b): the stairwell the kid climbs out of the basement by, and the first outdoor thing he sees.
// Unity built it from slabs (a floor, 17 boxes for steps, two walls) all wearing the basement's ceiling picture, which came out as orange
// shag. This draws it again in place, in concrete: poured walls (form-board seams, tie holes, water stains running down from the coping, a damp
// green foot, hairline cracks, efflorescence), 17 steps with a rounded, grooved nosing and a worn path down the middle, a coped wall top, a
// concrete pad at the head of the stairs, a floor with a cast-iron drain, and the autumn's leaves blown into the corners. The rails, the posts,
// the porch lamp and every collider stay Unity's (the ramp that carries the capsule up the stairs is untouched). Everything is drawn at load from
// fixed seeds: canvas textures mapped by world position, four draw calls.
import * as THREE from 'three';
import { lerp, clamp, smooth01, lcg, canvas, cutoutTexture, paintTexture } from './roadfx.js';

export const AREAWAY_OLD = /^Outside\/AreawayShaft\/(AwFloor|AwStep\d+|AwLanding|AwWall[WE])$/;

// Unity's numbers (metres): the shaft is 1.2 wide (x 3.2 .. 4.4) between 12 cm walls; 17 steps of 17 x 28 cm climb from the floor (y 0) at z -7.9 to the
// yard (y 2.89) at z -12.66; a landing runs on to z -13.45. The house's wall (and the cellar door) is at z -7.27.
const X0 = 3.2, X1 = 4.4, ZD = -7.12, ZE = -13.45, TOP = 2.95, YARD = 2.89, RISE = 0.17, RUN = 0.28, ZS = -7.9, NSTEP = 17;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------- textures
// poured concrete, 6.4 x 3.2 m on 2048 x 1024 (320 px/m); the canvas top is the wall's top (y 3.2)
function concreteTexture(anisotropy) {
  const W = 2048, H = 1024, cv = canvas(W, H), g = cv.getContext('2d'), R = lcg(42);
  g.fillStyle = 'rgb(98,95,89)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 320; i++) {                                                           // mottling: soft blotches, light and dark
    const x = R() * W, y = R() * H, r = 40 + R() * 200, dark = R() < 0.55, gr = g.createRadialGradient(x, y, 0, x, y, r);
    const c = dark ? '70,66,60' : '190,184,172'; gr.addColorStop(0, `rgba(${c},${0.05 + R() * 0.08})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let by = 0; by < H; by += 192) {                                                      // form boards 0.6 m tall: a seam at each joint, a little grain, a slight shift between boards
    g.fillStyle = `rgba(${R() < 0.5 ? '255,255,250' : '20,18,14'},${0.025 + R() * 0.03})`; g.fillRect(0, by, W, 192);
    for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(30,28,22,${0.02 + R() * 0.04})`; g.fillRect(R() * W, by + R() * 192, 100 + R() * 500, 1 + R() * 2); }
    g.fillStyle = 'rgba(20,18,14,0.5)'; g.fillRect(0, by, W, 2); g.fillStyle = 'rgba(210,205,195,0.25)'; g.fillRect(0, by + 2, W, 2);
    for (let x = 0; x < W; x += 24) if (R() < 0.18) { g.fillStyle = 'rgba(20,18,14,0.22)'; g.fillRect(x, by - 2, 10 + R() * 30, 4 + R() * 4); }     // grout fins at the joint
  }
  for (let ty = 96; ty < H; ty += 384) for (let tx = 192; tx < W; tx += 384) {              // form-tie holes
    g.fillStyle = 'rgba(20,18,15,0.55)'; g.beginPath(); g.arc(tx, ty, 6.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(215,208,196,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(tx, ty, 8.5, 0.2, 2.4); g.stroke();
    const st = g.createLinearGradient(tx, ty, tx, ty + 150); st.addColorStop(0, 'rgba(60,45,30,0.30)'); st.addColorStop(1, 'rgba(60,45,30,0)'); g.fillStyle = st; g.fillRect(tx - 4, ty, 8, 150);   // a rust weep below each
  }
  for (let i = 0; i < 90; i++) {                                                            // water running down from the coping: long soft streaks
    const x = R() * W, w = 3 + R() * 16, l = 150 + R() * 800, gr = g.createLinearGradient(0, 0, 0, l);
    gr.addColorStop(0, `rgba(36,34,28,${0.06 + R() * 0.11})`); gr.addColorStop(1, 'rgba(36,34,28,0)'); g.fillStyle = gr; g.save(); g.translate(x, 0); g.fillRect(-w / 2, 0, w, l); g.restore();
  }
  for (let i = 0; i < 40; i++) {                                                            // pale lime bloom (efflorescence) in streaks and patches
    const x = R() * W, y = 180 + R() * 800, r = 12 + R() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(228,226,214,${0.06 + R() * 0.08})`); gr.addColorStop(1, 'rgba(228,226,214,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r * 1.8, r * 2, r * 3.6);
  }
  const damp = g.createLinearGradient(0, H - 340, 0, H); damp.addColorStop(0, 'rgba(34,44,26,0)'); damp.addColorStop(0.6, 'rgba(34,44,26,0.28)'); damp.addColorStop(1, 'rgba(26,32,20,0.55)');
  g.fillStyle = damp; g.fillRect(0, H - 340, W, 340);                                       // the damp green foot of the wall
  for (let i = 0; i < 700; i++) { const x = R() * W, y = H - Math.pow(R(), 2.2) * 340; g.fillStyle = `rgba(${50 + R() * 40},${78 + R() * 50},${30 + R() * 20},${0.15 + R() * 0.3})`; g.beginPath(); g.arc(x, y, 1 + R() * 3, 0, TAU); g.fill(); }   // moss
  for (let i = 0; i < 9; i++) {                                                             // hairline cracks, with a branch or two
    let x = R() * W, y = 60 + R() * 700, a = (R() < 0.5 ? Math.PI / 2 : 0.2) + (R() - 0.5) * 0.9;
    g.strokeStyle = `rgba(18,16,12,${0.3 + R() * 0.2})`; g.lineWidth = 0.8 + R() * 0.9; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
    const n = 20 + (R() * 36 | 0); for (let k = 0; k < n; k++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * (5 + R() * 9); y += Math.sin(a) * (5 + R() * 9); g.lineTo(x, y); if (R() < 0.04) { g.stroke(); g.beginPath(); g.moveTo(x, y); a += (R() - 0.5) * 1.6; } } g.stroke();
    g.strokeStyle = 'rgba(210,204,190,0.18)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.stroke();
  }
  for (let i = 0; i < 26000; i++) { const v = R(); g.fillStyle = v < 0.5 ? `rgba(30,28,24,${0.1 + R() * 0.2})` : `rgba(230,225,215,${0.05 + R() * 0.1})`; g.fillRect(R() * W, R() * H, 1 + (R() < 0.2 ? 1 : 0), 1 + (R() < 0.2 ? 1 : 0)); }   // aggregate
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(24,22,18,${0.25 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * W, R() * H, 1.5 + R() * 4, 1 + R() * 3, R() * 3, 0, TAU); g.fill(); }  // pits (bug holes)
  return paintTexture(cv, anisotropy);
}
// a step's tread, 1.2 x 0.30 m on 768 x 192 (640 px/m): broom finish, the worn path, grooves along the nosing, dirt at the back and in the corners
// u runs across the stair (left to right as you climb), v from the nosing (0) back to the next riser (1) ... drawn with the nosing at the canvas bottom
function treadTexture(anisotropy) {
  const W = 768, H = 192, cv = canvas(W, 320), g = cv.getContext('2d'), R = lcg(8);       // the tread is the top 192 rows (its nosing at row 192); the riser's picture is the rows below
  g.fillStyle = 'rgb(106,103,97)'; g.fillRect(0, 0, W, 320);
  for (let i = 0; i < 70; i++) { const x = R() * W, y = R() * H, r = 20 + R() * 70, dark = R() < 0.5, gr = g.createRadialGradient(x, y, 0, x, y, r); const c = dark ? '90,86,78' : '196,190,178'; gr.addColorStop(0, `rgba(${c},${0.06 + R() * 0.08})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  for (let y = 0; y < H; y += 2) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,250' : '40,38,32'},${0.03 + R() * 0.05})`; g.fillRect(0, y, W, 1); }          // broom lines across the tread
  const path = g.createLinearGradient(W * 0.18, 0, W * 0.82, 0); path.addColorStop(0, 'rgba(210,205,194,0)'); path.addColorStop(0.5, 'rgba(210,205,194,0.22)'); path.addColorStop(1, 'rgba(210,205,194,0)');
  g.fillStyle = path; g.fillRect(0, 0, W, H);                                               // the worn path: feet have polished the middle
  const back = g.createLinearGradient(0, 0, 0, 60); back.addColorStop(0, 'rgba(40,36,28,0.5)'); back.addColorStop(1, 'rgba(40,36,28,0)'); g.fillStyle = back; g.fillRect(0, 0, W, 60);          // grime where the riser meets the tread
  for (const [x0, dir] of [[0, 1], [W, -1]]) { const gr = g.createLinearGradient(x0, 0, x0 + dir * 90, 0); gr.addColorStop(0, 'rgba(34,40,24,0.55)'); gr.addColorStop(1, 'rgba(34,40,24,0)'); g.fillStyle = gr; g.fillRect(Math.min(x0, x0 + dir * 90), 0, 90, H); }   // damp, green corners
  g.strokeStyle = 'rgba(20,18,14,0.55)'; g.lineWidth = 3;                                  // three anti-slip grooves, 2 to 4 cm from the nosing
  for (const y of [H - 26, H - 40, H - 54]) { g.beginPath(); g.moveTo(10, y); g.lineTo(W - 10, y); g.stroke(); }
  const lipGlow = g.createLinearGradient(0, H - 16, 0, H); lipGlow.addColorStop(0, 'rgba(222,216,204,0)'); lipGlow.addColorStop(1, 'rgba(222,216,204,0.28)'); g.fillStyle = lipGlow; g.fillRect(0, H - 16, W, 16);   // the rounded edge catches light
  for (let i = 0; i < 26; i++) { const x = R() * W, y = H - 2 - R() * 10; g.fillStyle = `rgba(24,22,18,${0.3 + R() * 0.25})`; g.beginPath(); g.ellipse(x, y, 2 + R() * 6, 1 + R() * 2.2, 0, 0, TAU); g.fill(); }   // chips out of the edge
  g.strokeStyle = 'rgba(18,16,12,0.4)'; g.lineWidth = 1.2; g.beginPath(); { let x = 90 + R() * 500, y = 0; g.moveTo(x, y); while (y < H) { x += (R() - 0.5) * 16; y += 6 + R() * 8; g.lineTo(x, y); } } g.stroke();    // a crack across
  for (let i = 0; i < 8000; i++) { g.fillStyle = R() < 0.5 ? `rgba(30,28,24,${0.1 + R() * 0.2})` : `rgba(235,230,220,${0.06 + R() * 0.12})`; g.fillRect(R() * W, R() * H, 1, 1); }
  {                                                                                          // the riser: 1.2 x 0.175 m, rows 200 to 312 (the same 640 px/m)
    const y0 = 200, h = 112;
    g.save(); g.beginPath(); g.rect(0, y0, W, h); g.clip();
    g.fillStyle = 'rgb(94,91,85)'; g.fillRect(0, y0, W, h);
    for (let i = 0; i < 40; i++) { const x = R() * W, y = y0 + R() * h, r = 14 + R() * 50, dark = R() < 0.55, gr = g.createRadialGradient(x, y, 0, x, y, r); const c = dark ? '60,57,52' : '176,170,158'; gr.addColorStop(0, `rgba(${c},${0.06 + R() * 0.08})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let i = 0; i < 22; i++) { const x = R() * W, w = 3 + R() * 18, gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, `rgba(34,32,26,${0.14 + R() * 0.14})`); gr.addColorStop(1, 'rgba(34,32,26,0)'); g.fillStyle = gr; g.fillRect(x - w / 2, y0, w, h); }       // the drip stains from the tread above
    const grime = g.createLinearGradient(0, y0 + h - 34, 0, y0 + h); grime.addColorStop(0, 'rgba(30,30,22,0)'); grime.addColorStop(1, 'rgba(30,30,22,0.5)'); g.fillStyle = grime; g.fillRect(0, y0 + h - 34, W, 34);      // dirt where it meets the tread below
    const lip = g.createLinearGradient(0, y0, 0, y0 + 16); lip.addColorStop(0, 'rgba(14,12,10,0.55)'); lip.addColorStop(1, 'rgba(14,12,10,0)'); g.fillStyle = lip; g.fillRect(0, y0, W, 16);                                 // the shadow under the nosing
    for (const [x0, dir] of [[0, 1], [W, -1]]) { const gr = g.createLinearGradient(x0, 0, x0 + dir * 70, 0); gr.addColorStop(0, 'rgba(34,40,24,0.5)'); gr.addColorStop(1, 'rgba(34,40,24,0)'); g.fillStyle = gr; g.fillRect(Math.min(x0, x0 + dir * 70), y0, 70, h); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,18,14,${0.3 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * W, y0 + R() * h, 1 + R() * 3, 1 + R() * 2, 0, 0, TAU); g.fill(); }
    for (let i = 0; i < 5000; i++) { g.fillStyle = R() < 0.5 ? `rgba(30,28,24,${0.1 + R() * 0.2})` : `rgba(235,230,220,${0.05 + R() * 0.1})`; g.fillRect(R() * W, y0 + R() * h, 1, 1); }
    g.restore();
  }
  return paintTexture(cv, anisotropy);
}
// the floor and its drain: 1.2 x 0.78 m on 512 x 332 (427 px/m); u across, v from the door (top) to the foot of the stairs (bottom). Drain at (0.5, 0.64) of it
function floorTexture(anisotropy) {
  const W = 512, H = 332, cv = canvas(W, H), g = cv.getContext('2d'), R = lcg(19);
  g.fillStyle = 'rgb(90,87,82)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) { const x = R() * W, y = R() * H, r = 20 + R() * 60, dark = R() < 0.6, gr = g.createRadialGradient(x, y, 0, x, y, r); const c = dark ? '60,58,52' : '186,180,168'; gr.addColorStop(0, `rgba(${c},${0.06 + R() * 0.08})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  const cx = W * 0.5, cy = H * 0.64, damp = g.createRadialGradient(cx, cy, 20, cx, cy, 150); damp.addColorStop(0, 'rgba(24,26,20,0.65)'); damp.addColorStop(0.55, 'rgba(24,26,20,0.28)'); damp.addColorStop(1, 'rgba(24,26,20,0)');
  g.fillStyle = damp; g.fillRect(0, 0, W, H);                                               // the floor is wet round the drain
  g.strokeStyle = 'rgba(16,14,10,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 96); g.lineTo(W, 100); g.stroke();                                  // a saw cut (control joint)
  g.strokeStyle = 'rgba(210,204,190,0.2)'; g.beginPath(); g.moveTo(0, 99); g.lineTo(W, 103); g.stroke();
  const edge = (x0, y0, x1, y1, gx, gy) => { const gr = g.createLinearGradient(x0, y0, x0 + gx, y0 + gy); gr.addColorStop(0, 'rgba(26,30,20,0.4)'); gr.addColorStop(1, 'rgba(26,30,20,0)'); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  edge(0, 0, 50, H, 50, 0); edge(W - 50, 0, W, H, -50, 0); edge(0, 0, W, 40, 0, 40); edge(0, H - 40, W, H, 0, -40);                                    // grime along the walls
  for (let i = 0; i < 4; i++) { let x = R() * W, y = R() * H, a = R() * TAU; g.strokeStyle = 'rgba(18,16,12,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 22; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); }
  // the drain: a cast-iron rim, a dark well, slots
  const r = 62;
  g.fillStyle = 'rgba(8,8,6,0.8)'; g.beginPath(); g.arc(cx, cy, r + 9, 0, TAU); g.fill();
  const rim = g.createRadialGradient(cx - 14, cy - 14, 10, cx, cy, r + 4); rim.addColorStop(0, '#6c6a64'); rim.addColorStop(1, '#2c2b27'); g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, r + 4, 0, TAU); g.fill();
  g.fillStyle = '#07070a'; g.beginPath(); g.arc(cx, cy, r - 8, 0, TAU); g.fill();
  g.fillStyle = '#55524b'; for (let k = -3; k <= 3; k++) { g.save(); g.beginPath(); g.arc(cx, cy, r - 8, 0, TAU); g.clip(); g.fillRect(cx - r, cy + k * 15 - 3.5, 2 * r, 7); g.restore(); }       // the bars
  g.strokeStyle = 'rgba(190,184,170,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r + 4, 3.5, 5.2); g.stroke();
  for (let i = 0; i < 3500; i++) { g.fillStyle = R() < 0.5 ? `rgba(30,28,24,${0.1 + R() * 0.2})` : `rgba(235,230,220,${0.08 + R() * 0.2})`; g.fillRect(R() * W, R() * H, 1, 1); }
  return paintTexture(cv, anisotropy);
}
// a leaf, grey, with its veins: the instance colour makes it rust, tan, ochre, olive or brown
function leafTexture(anisotropy) {
  const S = 128, cv = canvas(S, S), g = cv.getContext('2d');
  g.translate(S / 2, S / 2); g.rotate(-0.5);
  const gr = g.createLinearGradient(-50, 0, 50, 0); gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(1, '#d8d8d8'); g.fillStyle = gr;
  g.beginPath(); g.moveTo(-52, 0); g.bezierCurveTo(-34, -42, 20, -46, 52, 0); g.bezierCurveTo(20, 46, -34, 42, -52, 0); g.fill();
  g.strokeStyle = 'rgba(50,50,50,0.7)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-58, 0); g.lineTo(44, 0); g.stroke(); g.lineWidth = 1.2;
  for (let k = -3; k <= 3; k++) { if (!k) continue; g.beginPath(); g.moveTo(k * 12 - 10, 0); g.lineTo(k * 12 + 10, -22 * Math.sign(k)); g.stroke(); g.beginPath(); g.moveTo(k * 12 - 10, 0); g.lineTo(k * 12 + 10, 22 * Math.sign(k)); g.stroke(); }
  return cutoutTexture(cv, anisotropy);
}

// ---------------------------------------------------------------------------------------------------------------- the mesher (faces by material, a normal from the winding)
class Faces {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  // pts: 3 or 4 corners; out: the way the face must look; uvs: [u, v] per corner; cols: one colour per corner (or one for all)
  quad(pts, out, uvs, cols = [1, 1, 1]) {
    const [a, b, c] = pts;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz); if (l < 1e-12) return;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { pts = pts.slice().reverse(); uvs = uvs.slice().reverse(); if (Array.isArray(cols[0])) cols = cols.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    const base = this.p.length / 3;
    pts.forEach((p, k) => { this.p.push(p[0], p[1], p[2]); this.n.push(nx / l, ny / l, nz / l); this.u.push(uvs[k][0], uvs[k][1]); const cc = Array.isArray(cols[0]) ? cols[k] : cols; this.c.push(cc[0], cc[1], cc[2]); });
    for (let k = 1; k < pts.length - 1; k++) this.i.push(base, base + k, base + k + 1);
  }
  geometry() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); return g;
  }
}

export function buildAreaway({ anisotropy = 8, fill, fx = {} } = {}) {
  const group = new THREE.Group(); group.name = 'areaway';
  const stats = { calls: 0, tris: 0 }, colliders = [];
  const a2c = fx.a2c || null, msaaOnly = fx.msaaOnly || (() => {});
  const mk = (name, tex) => {
    const m = new THREE.MeshStandardMaterial({ name, map: tex, roughness: 0.93, metalness: 0, vertexColors: true });
    if (fill) {
      m.onBeforeCompile = (s) => { s.uniforms.gFill = { value: fill }; s.fragmentShader = 'uniform vec3 gFill;\n' + s.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * gFill * 0.2;
	#include <opaque_fragment>`); };
      m.customProgramCacheKey = () => 'awFill';
    }
    return m;
  };
  const wall = new Faces(), tread = new Faces(), floor = new Faces(), R = lcg(99);
  const wallU = (z) => (-z + ZD) / 6.4, wallV = (y) => y / 3.2;                              // the wall texture: 6.4 m along, 3.2 m up
  // vertex-colour ambient occlusion: darker toward the foot of the shaft and toward the house's wall
  const ao = (y, z) => lerp(0.5, 1, smooth01(y / 2.2)) * lerp(0.78, 1, smooth01((-z + ZD) / 2.4));

  // ---- the two walls: inner faces in an 8 x 5 grid (so the occlusion shades them), a coped top, an end
  for (const [x, dir] of [[X0, 1], [X1, -1]]) {
    const flip = dir < 0, NZ = 8, NY = 5, zs = Array.from({ length: NZ + 1 }, (_, i) => lerp(ZD, ZE, i / NZ)), ys = Array.from({ length: NY + 1 }, (_, i) => lerp(0, TOP, i / NY));
    const uv = (z, y) => [flip ? 1 - wallU(z) : wallU(z), wallV(y)];
    for (let i = 0; i < NZ; i++) for (let j = 0; j < NY; j++) {
      const c = (zi, yi) => { const v = ao(ys[yi], zs[zi]) * (flip ? 0.93 : 1.0); return [v, v, v]; };
      wall.quad([[x, ys[j], zs[i]], [x, ys[j], zs[i + 1]], [x, ys[j + 1], zs[i + 1]], [x, ys[j + 1], zs[i]]], [dir, 0, 0],
        [uv(zs[i], ys[j]), uv(zs[i + 1], ys[j]), uv(zs[i + 1], ys[j + 1]), uv(zs[i], ys[j + 1])], [c(i, j), c(i + 1, j), c(i + 1, j + 1), c(i, j + 1)]);
    }
    // the coping: a cap along the wall's top, 4 cm proud on the shaft's side, flush with the lawn below, 9 cm above it
    const xIn = x + dir * 0.04, xOut = x - dir * 0.16, y0 = YARD, y1 = TOP + 0.03, G = 0.88;
    const top = (z, xx) => [wallU(z), 0.5 + Math.abs(xx - 3.6) * 0.5];
    wall.quad([[xIn, y1, ZD], [xIn, y1, ZE], [xOut, y1, ZE], [xOut, y1, ZD]], [0, 1, 0], [top(ZD, xIn), top(ZE, xIn), top(ZE, xOut), top(ZD, xOut)], [1, 1, 1]);
    wall.quad([[xIn, y0, ZD], [xIn, y0, ZE], [xIn, y1, ZE], [xIn, y1, ZD]], [dir, 0, 0], [[wallU(ZD), 0.9], [wallU(ZE), 0.9], [wallU(ZE), 0.93], [wallU(ZD), 0.93]], [G, G, G]);          // its edge
    wall.quad([[xOut, y0, ZD], [xOut, y0, ZE], [xOut, y1, ZE], [xOut, y1, ZD]], [-dir, 0, 0], [[wallU(ZD), 0.9], [wallU(ZE), 0.9], [wallU(ZE), 0.93], [wallU(ZD), 0.93]], [G, G, G]);
    wall.quad([[x, y0, ZD], [x, y0, ZE], [xIn, y0, ZE], [xIn, y0, ZD]], [0, -1, 0], [[wallU(ZD), 0.9], [wallU(ZE), 0.9], [wallU(ZE), 0.92], [wallU(ZD), 0.92]], [0.45, 0.45, 0.45]);    // its underside, in shadow
    wall.quad([[xIn, y0, ZE], [xIn, y1, ZE], [xOut, y1, ZE], [xOut, y0, ZE]], [0, 0, -1], [[0.9, 0.9], [0.9, 0.93], [0.95, 0.93], [0.95, 0.9]], [G, G, G]);                                // its end
  }
  // ---- the stairs: for each step a riser, a rounded nosing in three facets (radius 2.5 cm) and the tread
  const RAD = 0.025, ARC = [0, 1, 2].map((t) => { const a = t * Math.PI / 4; return [Math.sin(a), 1 - Math.cos(a)]; });      // (dz, dy) along the quarter round, from the riser's top to the tread
  for (let i = 0; i < NSTEP; i++) {
    const yT = RISE * (i + 1), yB = RISE * i, zf = ZS - RUN * i, zb = zf - RUN, shade = lerp(0.74, 1.0, smooth01(i / 9)) * (0.94 + 0.06 * R());   // the lower steps are dirtier and damper
    const flipU = R() < 0.5, tu = (xx) => (flipU ? (X1 - xx) : (xx - X0)) / (X1 - X0);
    const rv0 = 0.025, rv1 = 0.375;                                                           // the riser's rows of the tread picture, v from the bottom
    tread.quad([[X0, yB, zf], [X1, yB, zf], [X1, yT - RAD, zf], [X0, yT - RAD, zf]], [0, 0, 1], [[tu(X0), rv0], [tu(X1), rv0], [tu(X1), lerp(rv0, rv1, (yT - RAD - yB) / RISE)], [tu(X0), lerp(rv0, rv1, (yT - RAD - yB) / RISE)]], [shade * 0.9, shade * 0.9, shade * 0.9]);
    const prof = ARC.map(([dz, dy]) => [zf - dz * RAD, yT - RAD + dy * RAD]); prof.push([zb, yT]);                // the curve, then the tread's back
    const v = (zz) => clamp((zf - zz) / RUN, 0, 1);                                         // 0 at the nosing .. 1 at the riser behind (the picture's canvas bottom is the nosing)
    for (let k = 0; k < prof.length - 1; k++) {
      const [za, ya] = prof[k], [zc, yc] = prof[k + 1];
      tread.quad([[X0, ya, za], [X1, ya, za], [X1, yc, zc], [X0, yc, zc]], [0, 1, k < 2 ? 0.7 : 0], [[tu(X0), 0.4 + 0.6 * v(za)], [tu(X1), 0.4 + 0.6 * v(za)], [tu(X1), 0.4 + 0.6 * v(zc)], [tu(X0), 0.4 + 0.6 * v(zc)]], [shade, shade, shade]);
    }
  }
  // ---- the floor at the foot (with the drain), and the pad at the head of the stairs
  {
    const fu = (xx, zz) => [(xx - X0) / (X1 - X0), 1 - (zz - ZD) / (ZS - ZD)];             // the floor's picture runs from the door (top) to the foot of step 0 (bottom)
    const fc = (zz) => { const v = lerp(0.8, 1, smooth01((ZD - zz) / 0.6)); return [v, v, v]; };
    floor.quad([[X0, 0, ZD], [X1, 0, ZD], [X1, 0, ZS], [X0, 0, ZS]], [0, 1, 0], [fu(X0, ZD), fu(X1, ZD), fu(X1, ZS), fu(X0, ZS)], [fc(ZD), fc(ZD), fc(ZS), fc(ZS)]);
    const pu = (xx, zz) => [(xx - X0) / (X1 - X0), 0.66 + (zz - ZE) / 0.95 * 0.3], ZP = YARD + 0.012;
    floor.quad([[X0, ZP, -12.66], [X1, ZP, -12.66], [X1, ZP, ZE], [X0, ZP, ZE]], [0, 1, 0], [pu(X0, -12.66), pu(X1, -12.66), pu(X1, ZE), pu(X0, ZE)], [0.92, 0.92, 0.92]);
    floor.quad([[X0, YARD, -12.66], [X1, YARD, -12.66], [X1, ZP, -12.66], [X0, ZP, -12.66]], [0, 0, 1], [[0, 0.62], [1, 0.62], [1, 0.64], [0, 0.64]], [0.7, 0.7, 0.7]);
  }
  const mkMesh = (F, mat, name) => {
    if (!F.p.length) return; const g = F.geometry(), m = new THREE.Mesh(g, mat); m.name = 'Areaway/' + name; m.matrixAutoUpdate = false; m.receiveShadow = true;
    group.add(m); stats.calls++; stats.tris += g.index.count / 3;
  };
  mkMesh(wall, mk('M_AwConcrete', concreteTexture(anisotropy)), 'walls');
  mkMesh(tread, mk('M_AwTread', treadTexture(anisotropy)), 'steps');
  mkMesh(floor, mk('M_AwFloor', floorTexture(anisotropy)), 'floor');

  // ---- leaves blown in: on the floor, drifted into the corners of the lower steps, a few higher up, a few on the pad
  {
    const mat = new THREE.MeshLambertMaterial({ name: 'M_AwLeaf', map: leafTexture(anisotropy), alphaTest: 0.5, side: THREE.DoubleSide });
    mat.alphaToCoverage = true; msaaOnly(mat);
    mat.onBeforeCompile = (s) => {
      if (fill) s.uniforms.gFill = { value: fill };
      s.fragmentShader = (fill ? 'uniform vec3 gFill;\n' : '') + (a2c ? s.fragmentShader.replace('#include <alphatest_fragment>', a2c) : s.fragmentShader).replace('#include <opaque_fragment>', `${fill ? 'outgoingLight += diffuseColor.rgb * gFill * 0.7;' : ''}
	#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'awLeaf';
    const list = [], Rl = lcg(303), side = () => (Rl() < 0.5 ? X0 + 0.06 + Rl() * 0.25 : X1 - 0.06 - Rl() * 0.25);
    const onStep = (i, xx, ang, sz) => { const zz = ZS - RUN * i - 0.03 - Rl() * (RUN - 0.06); list.push({ p: [xx, RISE * (i + 1) + 0.004 + Rl() * 0.004, zz], a: ang, s: sz }); };
    for (let n = 0; n < 34; n++) list.push({ p: [Rl() < 0.75 ? side() : lerp(X0 + 0.15, X1 - 0.15, Rl()), 0.004 + Rl() * 0.004, lerp(ZD - 0.05, ZS + 0.02, Rl())], a: Rl() * TAU, s: lerp(0.07, 0.12, Rl()) });
    for (let i = 0; i < 12; i++) for (let k = 0; k < Math.round(lerp(5, 1, i / 11)); k++) onStep(i, Rl() < 0.65 ? side() : lerp(X0 + 0.15, X1 - 0.15, Rl()), Rl() * TAU, lerp(0.06, 0.11, Rl()));
    for (let n = 0; n < 8; n++) onStep(12 + ((Rl() * 5) | 0), lerp(X0 + 0.15, X1 - 0.15, Rl()), Rl() * TAU, lerp(0.06, 0.1, Rl()));
    for (let n = 0; n < 12; n++) list.push({ p: [lerp(X0 + 0.08, X1 - 0.08, Rl()), YARD + 0.02 + Rl() * 0.004, lerp(-12.72, ZE + 0.1, Rl())], a: Rl() * TAU, s: lerp(0.07, 0.12, Rl()) });
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(g, mat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    const PAL = [[0.34, 0.14, 0.05], [0.38, 0.26, 0.1], [0.3, 0.2, 0.06], [0.2, 0.2, 0.07], [0.22, 0.12, 0.06], [0.42, 0.3, 0.08]];
    list.forEach((l, i) => {
      e.set((Rl() - 0.5) * 0.25, l.a, (Rl() - 0.5) * 0.25); q.setFromEuler(e); M.compose(new THREE.Vector3(...l.p), q, new THREE.Vector3(l.s, 1, l.s * lerp(0.7, 1, Rl()))); mesh.setMatrixAt(i, M);
      const p = PAL[(Rl() * PAL.length) | 0], j = lerp(0.7, 1.2, Rl()); col.setRGB(p[0] * j, p[1] * j, p[2] * j, THREE.LinearSRGBColorSpace); mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.name = 'Areaway/leaves'; mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    group.add(mesh); stats.calls++; stats.tris += 2 * list.length; stats.leaves = list.length;
  }
  return { group, colliders, stats };
}
