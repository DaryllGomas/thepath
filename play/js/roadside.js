// THE ROADSIDE (look batch 3b, 2026-10-31): the hill road the kid rides down, and what stands beside it.
// Unity gave the hill one grass texture, a road ribbon laid 7 cm over the ground (a razor seam at both edges), and a few big trees: nothing
// passed the eye between the trees, so nothing said how fast he was going. This builds the road's own edge and furniture at load, from fixed
// seeds (drawn textures, no files, no network), and puts all of it on the ground with the hill's own triangles:
//   - a gravel and dirt SHOULDER draped over the 7 cm lip, ragged into the grass (one mesh, with the track from the yard to the road's start
//     and the mouths of two driveways)
//   - GRASS and WEEDS: crossed cut-out cards, 1 500 of them, thick at the verge, creeping over the asphalt's edge, taller and sparser outward
//   - ROCKS, BUSHES, SAPLINGS, a post-and-rail FENCE along the uphill verge, white DELINEATOR posts, a W-beam GUARD RAIL on the outside of the
//     bend, a field GATE, a rural MAILBOX, and period US SIGNS (speed limit, curve, advisory speed, chevrons)
//   - the AREAWAY (js/areaway.js) and the yard's ground (the foot of the house over the void; the seam where the lawn slab meets the hill)
// Everything repeated is instanced (grass, rocks, bushes, saplings, fence parts); the rest is one merged mesh per material. Total: ten draw calls.
// Coordinates are three's (x, y, z), the hill road runs from (7, -26) at the yard down to (3, -150) at main street.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lerp, clamp, smooth01, lcg, vnoise, Terrain, canvas, cutoutTexture, paintTexture } from './roadfx.js';
import { buildAreaway, AREAWAY_OLD } from './areaway.js';

// what Unity drew that this replaces: the areaway's bare slabs (its rails, posts, lights and its collision stay)
export const ROADSIDE_OLD = AREAWAY_OLD;

const TREE = /^Outside\/Trees\/(Yard)?Tree\d+$/;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------- the road, as sections
// Unity's ribbon: 113 cross sections, two vertices each (u = 0 and u = 1), 5 m wide. Section 0 is at the yard, the last at main street.
function roadSections(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, byV = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = Math.round(uv.getY(i) * 1e5); let s = byV.get(key); if (!s) byV.set(key, s = { v: uv.getY(i) });
    s[uv.getX(i) < 0.5 ? 'a' : 'b'] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
  }
  const secs = [...byV.values()].filter((s) => s.a && s.b).sort((p, q) => q.v - p.v);
  if (secs[0].a[1] < secs[secs.length - 1].a[1]) secs.reverse();           // the yard end is the high one
  secs.forEach((s, k) => {
    s.c = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2];
    const p = secs[Math.max(0, k - 1)], n = secs[Math.min(secs.length - 1, k + 1)];
    let tx = (n.a[0] + n.b[0]) - (p.a[0] + p.b[0]), tz = (n.a[2] + n.b[2]) - (p.a[2] + p.b[2]); const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    s.t = [tx, tz]; s.r = [-tz, tx];                                          // heading, and the right of it (facing -z, +x is on the right)
    const right = (s.b[0] - s.a[0]) * s.r[0] + (s.b[2] - s.a[2]) * s.r[1] > 0;
    s.R = right ? s.b : s.a; s.L = right ? s.a : s.b;
  });
  let d = 0; secs.forEach((s, k) => { if (k) d += Math.hypot(s.c[0] - secs[k - 1].c[0], s.c[2] - secs[k - 1].c[2]); s.s = d; });
  return secs;
}

// ---------------------------------------------------------------------------------------------------------------- drawn textures
// grass, weeds, seed heads: four cut-out cards side by side (green tuft, tall dry grass, weeds with flowers, short sparse tuft)
function grassAtlas(anisotropy) {
  const C = 256, cv = canvas(C * 6, C), g = cv.getContext('2d'), R = lcg(31);
  const blade = (x0, y0, x1, y1, w, c0, c1, bend) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.beginPath();
    const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
    g.moveTo(x0 - w / 2, y0); g.quadraticCurveTo(mx - w / 3, my, x1, y1); g.quadraticCurveTo(mx + w / 3, my, x0 + w / 2, y0); g.closePath(); g.fill();
  };
  const greens = [['#121c07', '#4a6422'], ['#18260a', '#425a1d'], ['#101a06', '#56702a'], ['#1c280c', '#63792f']];
  const straw = [['#2a2810', '#8a7740'], ['#211f0b', '#756632'], ['#2e2a13', '#9a8852'], ['#1a2509', '#566c27']];
  const clump = (ox, n, hMin, hMax, spread, wMin, wMax, pal) => {
    for (let i = 0; i < n; i++) {
      const bx = ox + C / 2 + (R() - 0.5) * spread * 0.55, h = hMin + R() * (hMax - hMin), a = (R() - 0.5) * spread / 128;
      const tx = clamp(bx + a * h * 0.55 + (R() - 0.5) * 18, ox + 8, ox + C - 8), p = pal[(R() * pal.length) | 0];
      blade(bx, C, tx, C - h, wMin + R() * (wMax - wMin), p[0], p[1], (R() - 0.5) * 40);
    }
  };
  clump(0, 24, 120, 244, 190, 7, 13, greens);                                                       // 0: green tuft
  clump(C, 18, 150, 252, 150, 5, 10, straw);                                                        // 1: tall dry grass, with plumes
  for (let i = 0; i < 7; i++) {
    const bx = C + C / 2 + (R() - 0.5) * 70, top = 18 + R() * 42, tx = bx + (R() - 0.5) * 50;
    g.strokeStyle = '#8a7a3e'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(bx, C); g.quadraticCurveTo((bx + tx) / 2, C / 2, tx, top); g.stroke();
    for (let k = 0; k < 16; k++) { const a = -Math.PI / 2 + (R() - 0.5) * 1.5, l = 10 + R() * 18; g.strokeStyle = k % 3 ? '#a39565' : '#85774a'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(tx, top + 16 + R() * 20); g.lineTo(tx + Math.cos(a) * l, top + 16 - Math.sin(a) * -l * 0.2 + Math.sin(a) * l); g.stroke(); }
  }
  // 2: weeds: broad leaves at the foot, three tall stalks, flower heads (pale umbels, one yellow)
  const ox2 = C * 2;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.6, l = 55 + R() * 60, bx = ox2 + C / 2 + (R() - 0.5) * 24, ex = bx + Math.cos(a) * l, ey = C - 6 + Math.sin(a) * l;
    const gr = g.createLinearGradient(bx, C, ex, ey); gr.addColorStop(0, '#16240a'); gr.addColorStop(1, '#41601f'); g.fillStyle = gr; g.beginPath();
    const nx = -Math.sin(a) * l * 0.2, ny = Math.cos(a) * l * 0.2; g.moveTo(bx, C - 4); g.quadraticCurveTo((bx + ex) / 2 + nx, (C + ey) / 2 + ny, ex, ey); g.quadraticCurveTo((bx + ex) / 2 - nx, (C + ey) / 2 - ny, bx, C - 4); g.fill();
    g.strokeStyle = 'rgba(120,150,70,0.45)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(bx, C - 4); g.lineTo(ex, ey); g.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const bx = ox2 + C / 2 + (R() - 0.5) * 30, tx = ox2 + C / 2 + (i - 1) * 46 + (R() - 0.5) * 12, top = 36 + R() * 60;
    g.strokeStyle = '#33481b'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(bx, C - 8); g.quadraticCurveTo(bx + (tx - bx) * 0.2, C * 0.55, tx, top); g.stroke();
    const yellow = i === 1;
    for (let k = 0; k < 15; k++) { const a = R() * TAU, r = Math.sqrt(R()) * 13; g.fillStyle = yellow ? (k % 2 ? '#8e7516' : '#a98f24') : (k % 2 ? '#a9a590' : '#bab69f'); g.beginPath(); g.arc(tx + Math.cos(a) * r, top + Math.sin(a) * r * 0.6, 2.6 + R() * 2, 0, TAU); g.fill(); }
  }
  clump(C * 3, 11, 50, 140, 150, 7, 12, greens);                                                    // 3: short, sparse
  // cells 4 and 5: two far trees (a round broadleaf and a tall one): a few big lobes, each built of small leaf clumps so the outline is ragged, lit a little from above
  const tree = (ox, lobes, cx, cy, spread, rMin, rMax, tall) => {
    g.strokeStyle = '#1a120a'; g.lineCap = 'round'; g.lineWidth = 8; g.beginPath(); g.moveTo(ox + cx, C); g.lineTo(ox + cx + 2, cy + 22); g.stroke();
    const L = [];
    for (let i = 0; i < lobes; i++) { const a = R() * TAU, r = Math.sqrt(R()); L.push([ox + cx + Math.cos(a) * r * spread, cy + Math.sin(a) * r * spread * (tall ? 1.9 : 0.62), rMin + R() * (rMax - rMin)]); }
    L.sort((p, q) => q[1] - p[1]);                                                          // the low lobes first, the high ones over them
    for (const [lx, ly, lr] of L) {
      g.fillStyle = '#0d1607'; g.beginPath(); g.arc(lx, ly, lr * 0.82, 0, TAU); g.fill();   // a solid core, so the canopy has weight
      for (let k = 0; k < 70; k++) {
        const a = R() * TAU, d = Math.sqrt(R()) * lr, x = lx + Math.cos(a) * d, y = ly + Math.sin(a) * d * 0.9, rad = 5 + R() * 9, top = clamp((ly - y) / lr * 0.5 + 0.5, 0, 1);
        const gr = g.createRadialGradient(x - rad * 0.25, y - rad * 0.3, 0, x, y, rad); gr.addColorStop(0, `rgb(${20 + top * 34 | 0},${36 + top * 52 | 0},${12 + top * 20 | 0})`); gr.addColorStop(1, `rgb(${10 + top * 8 | 0},${20 + top * 14 | 0},${7 + top * 5 | 0})`);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
      }
    }
  };
  tree(C * 4, 15, 128, 150, 70, 20, 36, false);
  tree(C * 5, 13, 128, 128, 22, 16, 28, true);
  return cutoutTexture(cv, anisotropy);
}
// leaf clusters (green, grey-green), bark, a dark core: one 2 x 2 atlas for the bushes and saplings
function foliageAtlas(anisotropy) {
  const C = 256, cv = canvas(C * 2, C * 2), g = cv.getContext('2d'), R = lcg(77);
  const leaf = (x, y, a, l, w, c0, c1) => {
    g.save(); g.translate(x, y); g.rotate(a);
    const gr = g.createLinearGradient(0, 0, l, 0); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.45, -w, l, 0); g.quadraticCurveTo(l * 0.45, w, 0, 0); g.fill();
    g.strokeStyle = 'rgba(190,210,120,0.4)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(l * 0.92, 0); g.stroke(); g.restore();
  };
  const cluster = (ox, pal) => {
    for (let i = 0; i < 46; i++) {
      const a = R() * TAU, r = Math.sqrt(R()) * 98, x = ox + C / 2 + Math.cos(a) * r, y = C / 2 + Math.sin(a) * r, p = pal[(R() * pal.length) | 0];
      leaf(x, y, R() * TAU, 34 + R() * 24, 9 + R() * 6, p[0], p[1]);
    }
  };
  cluster(0, [['#111b07', '#3c5c1c'], ['#142108', '#335319'], ['#1a270c', '#4a6a24'], ['#0e1706', '#2d4817']]);
  cluster(C, [['#20250e', '#56622c'], ['#262a12', '#626e34'], ['#1b220a', '#445524'], ['#2a2810', '#6b6a38']]);
  g.fillStyle = '#4a3828'; g.fillRect(0, C, C, C);                                                  // bark: opaque, streaked
  for (let i = 0; i < 260; i++) { const x = R() * C, l = 30 + R() * 140, y = C + R() * C; g.strokeStyle = `rgba(${20 + R() * 40},${14 + R() * 26},${8 + R() * 18},${0.2 + R() * 0.3})`; g.lineWidth = 1 + R() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 6, Math.min(C * 2, y + l)); g.stroke(); }
  g.fillStyle = '#26361a'; g.fillRect(C, C, C, C);                                                  // the dark core of a bush
  for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(${40 + R() * 30},${60 + R() * 40},${20 + R() * 20},0.5)`; g.beginPath(); g.arc(C + R() * C, C + R() * C, 4 + R() * 12, 0, TAU); g.fill(); }
  return cutoutTexture(cv, anisotropy);
}
// the signs, and flat colour: one atlas. layout = where each cell sits (canvas px), read back as uv rectangles below
const ATLAS = { w: 1024, h: 1024, flat: [0, 0, 32, 32], wood: [40, 0, 32, 32], metal: [80, 0, 32, 32], curve: [0, 64, 448, 448], speed: [480, 64, 384, 480],
  chevron: [0, 560, 320, 400], plaque: [352, 560, 384, 288] };
const cell = (k) => { const [x, y, w, h] = ATLAS[k]; return [x / ATLAS.w, 1 - (y + h) / ATLAS.h, (x + w) / ATLAS.w, 1 - y / ATLAS.h]; };    // u0, v0, u1, v1
function signAtlas(anisotropy) {
  const cv = canvas(ATLAS.w, ATLAS.h), g = cv.getContext('2d'), R = lcg(5);
  g.fillStyle = '#05050a'; g.fillRect(0, 0, ATLAS.w, ATLAS.h);
  const noisy = (k, base, amp) => { const [x, y, w, h] = ATLAS[k]; g.fillStyle = base; g.fillRect(x, y, w, h);
    for (let i = 0; i < 160; i++) { const v = 128 + (R() - 0.5) * amp; g.fillStyle = `rgba(${v},${v},${v},0.35)`; g.fillRect(x + R() * w, y + R() * h, 1 + R() * 3, 1 + R() * 2); } };
  noisy('flat', '#cfcfcf', 10); noisy('metal', '#b9bcbf', 14);
  { const [x, y, w, h] = ATLAS.wood; g.fillStyle = '#8a8070'; g.fillRect(x, y, w, h); for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${60 + R() * 60},${52 + R() * 50},${40 + R() * 40},0.5)`; g.fillRect(x + R() * w, y, 1 + R() * 2, h); } }
  const FONT = 'bold {S}px "Arial Narrow","Liberation Sans Narrow","DejaVu Sans Condensed",Arial,Helvetica,sans-serif';
  const font = (s) => FONT.replace('{S}', s);
  // a rounded plate: field colour, then a black border 5 % in
  const plate = (k, field, border = true) => {
    const [x, y, w, h] = ATLAS[k]; g.fillStyle = field; g.fillRect(x, y, w, h);
    if (border) { g.strokeStyle = '#0a0a0a'; g.lineWidth = w * 0.028; g.lineJoin = 'round'; g.strokeRect(x + w * 0.05, y + w * 0.05, w * 0.9, h - w * 0.1); }
  };
  // W1-2: the curve. A yellow diamond (the mesh is cut as one: its corners are the cell's edge midpoints), a black border along its sides, the arrow bending left
  {
    const [x, y, w, h] = ATLAS.curve; g.fillStyle = '#f0bf0a'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#0a0a0a'; g.lineWidth = w * 0.03; g.lineJoin = 'round'; g.beginPath();
    g.moveTo(x + w * 0.5, y + h * 0.05); g.lineTo(x + w * 0.95, y + h * 0.5); g.lineTo(x + w * 0.5, y + h * 0.95); g.lineTo(x + w * 0.05, y + h * 0.5); g.closePath(); g.stroke();
    g.strokeStyle = '#0a0a0a'; g.lineWidth = w * 0.085; g.lineCap = 'butt'; g.beginPath();
    g.moveTo(x + w * 0.56, y + h * 0.78); g.lineTo(x + w * 0.56, y + h * 0.56); g.quadraticCurveTo(x + w * 0.56, y + h * 0.40, x + w * 0.40, y + h * 0.33); g.stroke();
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.moveTo(x + w * 0.27, y + h * 0.26); g.lineTo(x + w * 0.45, y + h * 0.20); g.lineTo(x + w * 0.42, y + h * 0.43); g.closePath(); g.fill();
  }
  // R2-1: SPEED LIMIT 25
  plate('speed', '#eeeee6');
  { const [x, y, w, h] = ATLAS.speed; g.fillStyle = '#0a0a0a'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = font(86); g.fillText('SPEED', x + w / 2, y + h * 0.27); g.fillText('LIMIT', x + w / 2, y + h * 0.43); g.font = font(236); g.fillText('25', x + w / 2, y + h * 0.82); }
  // W1-8: a chevron, yellow, black, pointing the way the road goes (left)
  plate('chevron', '#f0bf0a');
  { const [x, y, w, h] = ATLAS.chevron; g.strokeStyle = '#0a0a0a'; g.lineWidth = w * 0.17; g.lineJoin = 'miter'; g.lineCap = 'butt'; g.beginPath();
    g.moveTo(x + w * 0.68, y + h * 0.22); g.lineTo(x + w * 0.32, y + h * 0.5); g.lineTo(x + w * 0.68, y + h * 0.78); g.stroke(); }
  // W13-1: the advisory speed under the curve
  plate('plaque', '#f0bf0a');
  { const [x, y, w, h] = ATLAS.plaque; g.fillStyle = '#0a0a0a'; g.textAlign = 'center'; g.font = font(168); g.fillText('20', x + w / 2, y + h * 0.60); g.font = font(74); g.fillText('MPH', x + w / 2, y + h * 0.88); }
  return paintTexture(cv, anisotropy);
}
// a plank's grain, for the fence: dark streaks along u
function woodTexture(anisotropy) {
  const cv = canvas(256, 64), g = cv.getContext('2d'), R = lcg(404);
  g.fillStyle = '#6b655a'; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 90; i++) { const y = R() * 64, l = 40 + R() * 200, x = R() * 256, v = 60 + R() * 55; g.strokeStyle = `rgba(${v},${v * 0.92},${v * 0.8},${0.25 + R() * 0.35})`; g.lineWidth = 0.6 + R() * 1.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (R() - 0.5) * 3); g.stroke(); }
  for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(50,40,30,0.5)'; g.beginPath(); g.ellipse(R() * 256, R() * 64, 5 + R() * 6, 2 + R() * 2, 0, 0, TAU); g.fill(); }   // knots
  return paintTexture(cv, anisotropy, true);
}

// ---------------------------------------------------------------------------------------------------------------- geometry helpers
const NI = (g) => (g.index ? g.toNonIndexed() : g);                                              // merged geometries must all be indexed or all not
const upNormals = (n) => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a[i * 3 + 1] = 1; return new THREE.BufferAttribute(a, 3); };
// three vertical cards crossed 60 degrees apart, 1 wide, 1 high, standing on y = 0; normals up (it is lit like the ground it grows from)
function tuftGeometry(cards = 3) {
  const pos = [], uv = [], idx = [];
  for (let c = 0; c < cards; c++) {
    const a = c * Math.PI / cards, cx = Math.cos(a) * 0.5, sz = Math.sin(a) * 0.5, b = pos.length / 3;
    pos.push(-cx, 0, -sz, cx, 0, sz, cx, 1, sz, -cx, 1, -sz); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', upNormals(pos.length / 3)); g.setIndex(idx); return g;
}
// a lumpy rock: an icosahedron pushed about by a few sine waves, flat-shaded, its underside flattened (it is sunk into the ground)
function rockGeometry(seed) {
  const R = lcg(seed), g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, ph = [R() * TAU, R() * TAU, R() * TAU, R() * TAU];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
    const k = 1 + 0.2 * Math.sin(x * 3.1 + ph[0]) * Math.cos(z * 2.7 + ph[1]) + 0.12 * Math.sin(y * 4.3 + x * 2.2 + ph[2]) + 0.07 * Math.sin((x + z) * 6.1 + ph[3]);
    p.setXYZ(i, x * k, Math.max(y * k * 0.8, -0.28), z * k);
  }
  const f = g.toNonIndexed(); f.deleteAttribute('uv'); f.computeVertexNormals(); return f;
}
// a tube through points (radius r0 at the first, r1 at the last): for trunks and branches
function tubeGeometry(pts, r0, r1, sides, uvr) {
  const pos = [], nor = [], uv = [], idx = [], up = new THREE.Vector3(0, 1, 0);
  const rings = pts.length;
  for (let i = 0; i < rings; i++) {
    const p = pts[i], t = (pts[Math.min(rings - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)])).normalize();
    const a = Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, u = new THREE.Vector3().crossVectors(a, t).normalize(), v = new THREE.Vector3().crossVectors(t, u), r = lerp(r0, r1, i / (rings - 1));
    for (let k = 0; k <= sides; k++) {
      const an = k / sides * TAU, n = u.clone().multiplyScalar(Math.cos(an)).addScaledVector(v, Math.sin(an));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r); nor.push(n.x, n.y, n.z); uv.push(lerp(uvr[0], uvr[2], k / sides), lerp(uvr[1], uvr[3], i / (rings - 1)));
    }
  }
  for (let i = 0; i < rings - 1; i++) for (let k = 0; k < sides; k++) { const a = i * (sides + 1) + k, b = a + sides + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
// a card of leaves: size x size, centred on c, facing along n, rolled; its normal points outward from `ctr` (soft shading, like the blob it stands for)
function leafCard(c, n, size, roll, uvr, ctr) {
  const u = new THREE.Vector3().crossVectors(Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0), n).normalize(), v = new THREE.Vector3().crossVectors(n, u);
  const cr = Math.cos(roll), sr = Math.sin(roll), uu = u.clone().multiplyScalar(cr).addScaledVector(v, sr), vv = v.clone().multiplyScalar(cr).addScaledVector(u, -sr), h = size / 2;
  const nn = c.clone().sub(ctr).normalize(), pos = [], nor = [], uv = [];
  for (const [a, b, tu, tv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
    pos.push(c.x + (uu.x * a + vv.x * b) * h, c.y + (uu.y * a + vv.y * b) * h, c.z + (uu.z * a + vv.z * b) * h); nor.push(nn.x, nn.y, nn.z); uv.push(lerp(uvr[0], uvr[2], tu), lerp(uvr[1], uvr[3], tv));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex([0, 1, 2, 0, 2, 3]); return g;
}
const FOL = { leaf: [0, 0.5, 0.5, 1], dry: [0.5, 0.5, 1, 1], bark: [0.02, 0.02, 0.48, 0.48], core: [0.52, 0.02, 0.98, 0.48] };     // uv rectangles in the foliage atlas (v up)
function bushGeometry(seed) {
  const R = lcg(seed), parts = [], ctr = new THREE.Vector3(0, 0.42, 0);
  const core = new THREE.IcosahedronGeometry(1, 1), cp = core.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), k = 1 + 0.16 * Math.sin(x * 4 + seed) * Math.cos(z * 3.3 + y * 2); cp.setXYZ(i, x * 0.4 * k, 0.42 + Math.max(y, -0.2) * 0.34 * k, z * 0.4 * k); }
  core.deleteAttribute('uv'); const cu = []; for (let i = 0; i < cp.count; i++) cu.push(lerp(FOL.core[0], FOL.core[2], 0.5), lerp(FOL.core[1], FOL.core[3], 0.5)); core.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
  core.computeVertexNormals(); parts.push(core);
  for (let i = 0; i < 26; i++) {
    const a = R() * TAU, e = Math.asin(R() * 0.95 - 0.12), r = 0.36 + R() * 0.18, c = new THREE.Vector3(Math.cos(a) * Math.cos(e) * r * 1.1, 0.42 + Math.sin(e) * r * 0.9, Math.sin(a) * Math.cos(e) * r * 1.1);
    parts.push(leafCard(c, c.clone().sub(ctr).normalize().add(new THREE.Vector3((R() - 0.5) * 0.5, (R() - 0.3) * 0.4, (R() - 0.5) * 0.5)).normalize(), 0.42 + R() * 0.22, R() * TAU, R() < 0.8 ? FOL.leaf : FOL.dry, ctr));
  }
  return mergeGeometries(parts.map(NI), false);
}
function saplingGeometry(seed) {
  const R = lcg(seed), parts = [], lean = (R() - 0.5) * 0.18, H = 2.2 + R() * 0.9;
  const trunk = [0, 0.33, 0.66, 1].map((f) => new THREE.Vector3(lean * f * f * 1.4 + (R() - 0.5) * 0.03, f * H, (R() - 0.5) * 0.05));
  parts.push(tubeGeometry(trunk, 0.045, 0.013, 5, FOL.bark));
  const tops = [];
  for (let i = 0; i < 3; i++) {                                                        // branches off the upper trunk, each ending in a cluster
    const f = 0.5 + i * 0.18, seg = Math.min(2, Math.floor(f * 3)), from = trunk[seg].clone().lerp(trunk[seg + 1], f * 3 - seg), a = R() * TAU + i * 2.1, l = 0.35 + R() * 0.3;
    const to = from.clone().add(new THREE.Vector3(Math.cos(a) * l, 0.15 + R() * 0.25, Math.sin(a) * l));
    parts.push(tubeGeometry([from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.06, 0)), to], 0.016, 0.006, 4, FOL.bark)); tops.push(to);
  }
  tops.push(trunk[3].clone());
  const ctr = trunk[3].clone().setY(H * 0.78);
  for (const t of tops) for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + R(), c = t.clone().add(new THREE.Vector3(Math.cos(a) * 0.12, 0.04 + R() * 0.12, Math.sin(a) * 0.12));
    parts.push(leafCard(c, new THREE.Vector3(Math.cos(a), 0.4 + R() * 0.6, Math.sin(a)).normalize(), 0.62 + R() * 0.3, R() * TAU, R() < 0.85 ? FOL.leaf : FOL.dry, ctr));
  }
  return mergeGeometries(parts.map(NI), false);
}

// ---------------------------------------------------------------------------------------------------------------- the yard's ground
// Unity's lawn is a 10 cm plank 7.7 m deep (z -15 to -7.33) with nothing under or behind it: the new house stands half on it and half on the void, and
// from the yard's corners its foot hangs over a black gap. This is the same lawn, carrying on behind the house: a slab as wide as the lawn, 52 m deep
// and 60 cm thick, its top at the lawn's (y 2.89), in the lawn's own material so the grass and the dirt run on unbroken.
export function buildYardGround(lawnMat) {
  const g = new THREE.BoxGeometry(260, 0.6, 52); g.translate(20, 2.89 - 0.3, -7.4 + 26);
  const m = new THREE.Mesh(g, lawnMat); m.name = 'Roadside/yardGround'; m.matrixAutoUpdate = false; m.receiveShadow = true; return m;
}

// ---------------------------------------------------------------------------------------------------------------- the module
export function buildRoadside({ anisotropy = 8, objects = new Map(), noise, hill = [], road = [], ground = {}, fx = {} } = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const group = new THREE.Group(); group.name = 'roadside';
  const stats = { calls: 0, tris: 0, parts: {}, ms: 0 };
  const colliders = [];
  const fill = ground.fill || new THREE.Color(0, 0, 0), a2c = fx.a2c || null, msaaOnly = fx.msaaOnly || (() => {});
  const terr = new Terrain(hill), secs = roadSections(road[0]), K = secs.length;
  const trees = [...objects.values()].filter((o) => TREE.test(o.path)).map((o) => [o.pos[0], o.pos[2]]);
  const nearTree = (x, z, r) => { for (const t of trees) if (Math.hypot(t[0] - x, t[1] - z) < r) return true; return false; };
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = { value: 0 };                                                                      // the grass's sway clock (a uniform every material shares)
  const add = (mesh, name, tris) => { mesh.name = 'Roadside/' + name; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); group.add(mesh); stats.calls++; stats.tris += tris; stats.parts[name] = tris; return mesh; };
  const trisOf = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  // crossed cut-out cards from an atlas of `cols` cells side by side (the instance picks its cell: aTuft.x), lit as the ground is, swaying a little in a breeze
  const cardMat = (name, atlas, cols, key, fillK, sway) => {
    const mat = new THREE.MeshLambertMaterial({ name, map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.alphaToCoverage = true; msaaOnly(mat);
    mat.onBeforeCompile = (s) => {
      s.uniforms.gFill = { value: fill }; s.uniforms.rsT = T;
      s.vertexShader = 'attribute vec2 aTuft;\nuniform float rsT;\n' + s.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
	vMapUv = vec2( ( uv.x + aTuft.x ) / ${cols.toFixed(1)}, uv.y );`).replace('#include <begin_vertex>', `#include <begin_vertex>
	#ifdef USE_INSTANCING
		float swS = max( length( instanceMatrix[ 0 ].xyz ), 1.0 );
	#else
		float swS = 1.0;
	#endif
	transformed.x += uv.y * uv.y * ${sway.toFixed(3)} * sin( rsT * 1.7 + aTuft.y * 6.283 ) * ( 0.6 + 0.4 * sin( rsT * 0.6 + aTuft.y * 13.0 ) ) / swS;`);
      s.fragmentShader = 'uniform vec3 gFill;\n' + (a2c ? s.fragmentShader.replace('#include <alphatest_fragment>', a2c) : s.fragmentShader).replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * gFill * ${fillK.toFixed(2)};
	#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  };

  // ---- where things go: a point s metres along the road (K sections), `side` +1 right / -1 left of the heading, `off` metres out from the road's edge
  const kOf = (s) => { let lo = 0, hi = K - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (secs[m].s <= s) lo = m; else hi = m; } return lo; };
  const frame = (s) => {
    s = clamp(s, 0, secs[K - 1].s); const k = kOf(s), a = secs[k], b = secs[Math.min(K - 1, k + 1)], f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0, mix = (p, q) => [lerp(p[0], q[0], f), lerp(p[1], q[1], f), lerp(p[2], q[2], f)];
    const tx = lerp(a.t[0], b.t[0], f), tz = lerp(a.t[1], b.t[1], f), l = Math.hypot(tx, tz) || 1;
    return { s, k, R: mix(a.R, b.R), L: mix(a.L, b.L), c: mix(a.c, b.c), t: [tx / l, tz / l], r: [-tz / l, tx / l] };
  };
  const LIFT = 0.04;
  // the height of the verge's skin at `off` metres out: the road's edge, easing down over a metre onto the ground (+ a little, so the strip rides above the triangles' flats)
  const skinY = (ey, ty, off) => off <= 0 ? ey : lerp(ey, ty + LIFT, smooth01(off / 0.9));
  const beside = (s, side, off, f = frame(s)) => {
    const e = side > 0 ? f.R : f.L, x = e[0] + side * f.r[0] * off, z = e[2] + side * f.r[1] * off, ty = terr.y(x, z);
    return { x, z, y: ty === null ? e[1] - 0.07 + (off <= 0 ? 0.07 : 0) : skinY(e[1], ty, off), ground: ty === null ? e[1] - 0.07 : ty, f, edgeY: e[1] };
  };
  const rowOf = (side, s, offs, w) => offs.map((o) => beside(s, side, o * w));
  const taper = (k) => 1 - smooth01((k - 86) / 8);                                              // the verge fades out at the foot of the hill (main street is another hand's)
  const R = lcg(1982);

  // ================================================================================================================ 1. the shoulder
  // a strip of gravel then dirt out from each edge, the ground and the road's lip stitched together; the grass shows through where it frays
  {
    const pos = [], uvs = [], ks = [], idx = [];
    const strip = (rows, uvOf, kOfV) => {                                                       // rows[i][j] = {x,y,z}; quads between rows; winding turned to face up
      const base = pos.length / 3, J = rows[0].length;
      rows.forEach((row, i) => row.forEach((p, j) => { pos.push(p.x, p.y, p.z); const u = uvOf(i, j, p); uvs.push(u[0], u[1]); const kk = kOfV(i, j, p); ks.push(kk[0], kk[1], kk[2]); }));
      for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < J - 1; j++) {
        const a = base + i * J + j, b = a + J, c = b + 1, d = a + 1, A = rows[i][j], B = rows[i + 1][j], C = rows[i + 1][j + 1];
        const ny = (B.z - A.z) * (C.x - A.x) - (B.x - A.x) * (C.z - A.z);                      // y of (B - A) x (C - A)
        if (ny >= 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
      }
    };
    // the verge: seven columns, the first on the edge itself
    const OFF = [0, 0.16, 0.5, 1.0, 1.6, 2.4, 3.3], FADE = [0, 0, 0.1, 0.32, 0.58, 0.82, 1], GRAV = [1, 1, 0.92, 0.65, 0.35, 0.12, 0];
    for (const side of [-1, 1]) {
      const rows = []; let along = [];
      for (let k = 0; k < K - 4; k++) {
        const w = taper(k) * lerp(0.55, 1.2, vnoise(secs[k].s * 0.045, side > 0 ? 3 : 4)), s = secs[k].s;
        const row = rowOf(side, s, OFF, Math.max(0.05, w)); rows.push(row); along.push(s);
        row[0].y = secs[k][side > 0 ? 'R' : 'L'][1];                                            // exactly the ribbon's own edge: no crack
      }
      strip(rows, (i, j) => [OFF[j], along[i]], (i, j) => [FADE[j], GRAV[j], 0]);
    }
    // the track from the yard's gate to the road's start (the ribbon ends in the middle of the lawn): two ruts and a grass hump, fraying at both ends
    {
      const s0 = secs[0], x0 = s0.c[0], z0 = s0.c[2], yardX = 6.6, yardZ = -14.2, n = 12, rows = [], O = [-3.6, -2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7, 3.6], FA = [1, 0.55, 0.12, 0.05, 0.05, 0.05, 0.12, 0.55, 1];
      for (let i = 0; i <= n; i++) {
        const f = i / n, cx = lerp(x0 + s0.t[0] * 0.0, yardX, f) + Math.sin(f * 3.1) * 0.5, cz = lerp(z0, yardZ, f), wid = lerp(1.0, 0.8, f), row = [];
        for (let j = 0; j < O.length; j++) {
          const x = cx + O[j] * wid, z = cz, ty = terr.y(x, z), y = ty === null ? 2.89 : ty;
          row.push({ x, z, y: i === 0 ? lerp(s0.c[1], y + LIFT, smooth01(Math.abs(O[j]) / 2.5)) : y + LIFT * (1 - 0.5 * f), f });
        }
        rows.push(row);
      }
      strip(rows, (i, j) => [O[j] * lerp(1.0, 0.8, i / n), i], (i, j) => [Math.max(FA[j], smooth01((i / n - 0.55) / 0.45)), 0.45, 1]);
    }
    // driveway mouths: gravel flaring out of the road's edge (the field gate's, uphill; the mailbox's, downhill)
    const mouth = (side, s, len, half) => {
      const rows = [], m = 7, O = [-1.0, -0.6, -0.2, 0.2, 0.6, 1.0];
      for (let i = 0; i <= m; i++) {
        const off = (i / m) * len, row = [], w = lerp(half * 1.7, half, smooth01(i / m * 1.2));
        for (let j = 0; j < O.length; j++) { const f = frame(s); const e = side > 0 ? f.R : f.L; const lat = O[j] * w;
          const x = e[0] + side * f.r[0] * off + f.t[0] * lat, z = e[2] + side * f.r[1] * off + f.t[1] * lat, ty = terr.y(x, z);
          row.push({ x, z, y: i === 0 ? e[1] : (ty === null ? e[1] : lerp(e[1], ty + LIFT, smooth01(off / 0.9))) }); }
        rows.push(row);
      }
      strip(rows, (i, j) => [O[j] * lerp(half * 1.7, half, smooth01(i / m * 1.2)), i * len / m], (i, j) => [Math.max(Math.abs(O[j]) > 0.8 ? 0.85 : 0, smooth01((i / m - 0.6) / 0.4) * 0.95), 0.75, 1]);
    };
    mouth(1, secs[20].s, 5.6, 1.8); mouth(-1, secs[74].s, 5.0, 1.6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('aK', new THREE.Float32BufferAttribute(ks, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ name: 'M_RoadShoulder', roughness: 1, metalness: 0, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.alphaToCoverage = true; msaaOnly(m);
    m.onBeforeCompile = (s) => {
      s.uniforms.asNoise = { value: noise }; s.uniforms.gFill = { value: fill }; s.uniforms.gGain = { value: (ground.hill ?? 2) * 0.62 };
      s.vertexShader = 'attribute vec3 aK;\nvarying vec3 vShK;\nvarying vec3 vShW;\nvarying vec2 vShU;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
	vShK = aK; vShU = uv; vShW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
      s.fragmentShader = 'uniform sampler2D asNoise;\nuniform vec3 gFill;\nuniform float gGain;\nvarying vec3 vShK;\nvarying vec3 vShW;\nvarying vec2 vShU;\n' +
        (a2c ? s.fragmentShader.replace('#include <alphatest_fragment>', a2c) : s.fragmentShader).replace('#include <map_fragment>', `#include <map_fragment>
	vec4 nA = texture2D( asNoise, vShW.xz * 0.9 ), nB = texture2D( asNoise, vShW.xz * 2.7 + vec2( 0.31, 0.77 ) ), nC = texture2D( asNoise, vShW.xz * 0.22 );
	float jit = 0.6 * nB.b + 0.4 * nA.b;
	float gravelK = clamp( vShK.y + ( nA.g - 0.5 ) * 0.8, 0.0, 1.0 );
	vec3 gravel = vec3( 0.052, 0.045, 0.035 ) * ( 0.5 + 1.0 * nA.r ) * ( 1.0 + 0.7 * step( 0.9, nB.r ) );     // grey-tan stones, a few pale
	vec3 dirt = vec3( 0.034, 0.024, 0.014 ) * ( 0.6 + 0.9 * nC.g + 0.5 * ( nA.r - 0.5 ) );
	vec3 col = mix( dirt, gravel, gravelK );
	if ( vShK.z > 0.5 ) {                                                                                      // a track: two wheel ruts of bare dirt, a hump of grass between
		float rut = 1.0 - smoothstep( 0.16, 0.44, abs( abs( vShU.x ) - 0.9 ) );
		col = mix( col, dirt * 0.65, rut * 0.85 );
		col = mix( col, vec3( 0.016, 0.026, 0.008 ) * ( 0.7 + 0.8 * nB.g ), ( 1.0 - smoothstep( 0.0, 0.55, abs( vShU.x ) ) ) * 0.5 * step( vShK.y, 0.6 ) );
	}
	diffuseColor.rgb = col;
	diffuseColor.a = ( 1.0 - vShK.x ) + ( jit - 0.5 ) * 1.0;`).replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * gFill * gGain;
	#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'roadShoulder';
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; add(mesh, 'shoulder', trisOf(g));
  }

  // ================================================================================================================ 2. grass, weeds, rocks, bushes, saplings
  const tufts = [];                                                                             // { x, y, z, w, h, yaw, v, c }
  {
    const Rg = lcg(2024), atlas = grassAtlas(anisotropy);
    // bands out from the edge: [from, to, per metre, scale range, variants]
    const BANDS = [[-0.4, 0.5, 0.9, [0.3, 0.65], [0, 0, 3, 3]], [0.3, 2.2, 3.2, [0.4, 0.95], [0, 0, 3, 1, 0, 3, 2]], [2.2, 6.5, 1.7, [0.6, 1.3], [0, 1, 1, 2, 0, 3]], [6.5, 14, 0.6, [1.0, 1.7], [1, 1, 0, 2]]];
    for (const side of [-1, 1]) for (let s = 0; s < secs[K - 1].s - 12; ) {
      const f = frame(s), kk = f.k, tp = taper(kk), clump = 0.25 + 1.5 * Math.pow(vnoise(s * 0.11, side > 0 ? 7 : 8), 1.3);
      for (const [o0, o1, per, sc, vars] of BANDS) {
        const n = per * 1.0 * clump * tp; let c = Math.floor(n) + (Rg() < n % 1 ? 1 : 0);
        while (c--) {
          const off = lerp(o0, o1, Rg()), ss = s + Rg() * 1.0, p = beside(ss, side, off), h = lerp(sc[0], sc[1], Rg()) * lerp(0.8, 1.2, vnoise(ss * 0.3, 11));
          if (nearTree(p.x, p.z, 1.3)) continue;
          const v = vars[(Rg() * vars.length) | 0], dry = vnoise(ss * 0.05, 21), j = 0.82 + Rg() * 0.36;
          tufts.push({ x: p.x, y: (off <= 0 ? p.y : p.y) - 0.04, z: p.z, w: h * (v === 2 ? 0.8 : 0.95) * lerp(0.9, 1.15, Rg()), h: h * (v === 1 ? 1.15 : 1), yaw: Rg() * TAU, v,
            c: [j * lerp(0.95, 1.2, dry), j * lerp(1, 0.9, dry), j * lerp(0.9, 0.62, dry)], ph: Rg() });
        }
      }
      s += 1.0;
    }
    // the hill's distance: trees (cells 4 and 5) up to 13 m tall on the slopes away from the road, cards like the grass: 6 triangles each
    {
      const Rt = lcg(4242), roadD = (x, z) => { let d = 1e9; for (const sc of secs) d = Math.min(d, Math.hypot(sc.c[0] - x, sc.c[2] - z)); return d; };
      let n = 0;
      for (let tries = 0; n < 240 && tries < 8000; tries++) {
        const x = lerp(-105, 145, Rt()), z = lerp(-148, -36, Rt()), y = terr.y(x, z);
        if (y === null || y < -33) continue;
        if (z > -48 && x > -26 && x < 32) continue;                                              // not in the yard
        const rd = roadD(x, z); if (rd < 22 || nearTree(x, z, 9)) continue;
        const h = lerp(6, 13, Rt()) * lerp(0.8, 1.15, Math.min(1, rd / 120)), k = lerp(0.65, 1.1, Rt());
        tufts.push({ x, y: y - 0.2, z, w: h * lerp(0.7, 1.0, Rt()), h, yaw: Rt() * TAU, v: Rt() < 0.7 ? 4 : 5, c: [k, k * 1.02, k * 0.9], ph: Rt() }); n++;
      }
      stats.farTrees = n;
    }
    const geo = tuftGeometry(), N = tufts.length, v = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
    const mat = cardMat('M_RoadGrass', atlas, 6, 'roadGrass6', 0.3, 0.07);
    const mesh = new THREE.InstancedMesh(geo, mat, N), M = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    tufts.forEach((t, i) => {
      M.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw), new THREE.Vector3(t.w, t.h, t.w)); mesh.setMatrixAt(i, M);
      col.setRGB(t.c[0], t.c[1], t.c[2], THREE.LinearSRGBColorSpace); mesh.setColorAt(i, col); v.setXY(i, t.v, t.ph);
    });
    geo.setAttribute('aTuft', v); mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false;
    mesh.onBeforeRender = () => { if (!reduced) T.value = performance.now() / 1000; };
    add(mesh, 'grass', trisOf(geo) * N); stats.tufts = N;
  }
  const scatter = (count, seed, bands, okFn, build) => {                                         // shared: place `count` things at random verge positions
    const Rr = lcg(seed), out = []; let tries = 0;
    while (out.length < count && tries++ < count * 40) {
      const side = Rr() < 0.5 ? -1 : 1, s = lerp(10, secs[K - 1].s - 70, Rr()), [o0, o1] = bands[(Rr() * bands.length) | 0], off = lerp(o0, o1, Rr()), p = beside(s, side, off);
      if (!okFn(p, s, side, off)) continue; out.push(build(p, Rr, s, side, off));
    }
    return out;
  };
  {                                                                                              // ---- rocks: small at the shoulder, a few boulders up the bank
    const geos = [rockGeometry(11)], rocks = [[]];
    const small = scatter(150, 505, [[0.4, 2.6], [0.4, 2.6], [2.6, 9]], (p) => !nearTree(p.x, p.z, 1.2) && p.f.k < 90, (p, Rr) => ({ p, sc: lerp(0.1, 0.34, Math.pow(Rr(), 1.5)), flat: lerp(0.55, 0.9, Rr()), yaw: Rr() * TAU, tilt: [(Rr() - 0.5) * 0.4, (Rr() - 0.5) * 0.4], g: 0, shade: lerp(0.7, 1.25, Rr()) }));
    const big = scatter(26, 606, [[3.5, 14]], (p) => !nearTree(p.x, p.z, 2.5) && p.f.k < 88, (p, Rr) => ({ p, sc: lerp(0.55, 1.5, Math.pow(Rr(), 1.2)), flat: lerp(0.55, 0.85, Rr()), yaw: Rr() * TAU, tilt: [(Rr() - 0.5) * 0.3, (Rr() - 0.5) * 0.3], g: 0, shade: lerp(0.6, 1.1, Rr()) }));
    for (const r of [...small, ...big]) rocks[r.g].push(r);
    const mat = new THREE.MeshStandardMaterial({ name: 'M_RoadRock', roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (s) => {
      s.uniforms.asNoise = { value: noise }; s.uniforms.gFill = { value: fill };
      s.vertexShader = 'varying vec3 vRkW;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
	vec4 rkw = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		rkw = instanceMatrix * rkw;
	#endif
	vRkW = ( modelMatrix * rkw ).xyz;`);
      s.fragmentShader = 'uniform sampler2D asNoise;\nuniform vec3 gFill;\nvarying vec3 vRkW;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
	vec4 rA = texture2D( asNoise, vRkW.xz * 1.7 + vRkW.y * 0.9 ), rB = texture2D( asNoise, vRkW.xz * 5.3 - vRkW.y * 1.3 );
	diffuseColor.rgb *= 0.55 + 0.9 * rA.r + 0.5 * ( rB.r - 0.5 ) + 0.25 * ( rA.b - 0.5 );`).replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * gFill * 0.3;
	#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'roadRock';
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    geos.forEach((geo, gi) => {
      const list = rocks[gi]; if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((r, i) => {
        e.set(r.tilt[0], r.yaw, r.tilt[1]); q.setFromEuler(e);
        M.compose(new THREE.Vector3(r.p.x, r.p.ground + r.sc * 0.12, r.p.z), q, new THREE.Vector3(r.sc, r.sc * r.flat, r.sc * lerp(0.8, 1.2, (r.yaw / TAU)))); mesh.setMatrixAt(i, M);
        col.setRGB(0.105 * r.shade, 0.108 * r.shade, 0.105 * r.shade, THREE.LinearSRGBColorSpace); mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false;
      add(mesh, 'rocks' + gi, trisOf(geo) * list.length);
    });
    stats.rocks = small.length + big.length;
  }
  {                                                                                              // ---- bushes and saplings, one leaf atlas
    const atlas = foliageAtlas(anisotropy);
    const mat = new THREE.MeshLambertMaterial({ name: 'M_RoadFoliage', map: atlas, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.alphaToCoverage = true; msaaOnly(mat);
    mat.onBeforeCompile = (s) => {
      s.uniforms.gFill = { value: fill }; s.uniforms.rsT = T;
      s.vertexShader = 'uniform float rsT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
	transformed.x += 0.012 * position.y * sin( rsT * 1.3 + position.x * 5.0 + position.z * 3.0 );`);
      s.fragmentShader = 'uniform vec3 gFill;\n' + (a2c ? s.fragmentShader.replace('#include <alphatest_fragment>', a2c) : s.fragmentShader).replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * gFill * 0.3;
	#include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'roadFoliage';
    const place = (geo, list, name) => {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
      list.forEach((b, i) => {
        M.compose(new THREE.Vector3(b.p.x, b.p.ground - 0.04, b.p.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw), new THREE.Vector3(b.sc, b.sc * b.tall, b.sc)); mesh.setMatrixAt(i, M);
        col.setRGB(b.shade, b.shade * lerp(0.95, 1.05, b.yaw / TAU), b.shade * 0.9, THREE.LinearSRGBColorSpace); mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; add(mesh, name, trisOf(geo) * list.length);
    };
    const bushes = scatter(52, 707, [[1.8, 4.5], [3, 9], [2, 6]], (p) => !nearTree(p.x, p.z, 2.2) && p.f.k < 88, (p, Rr) => ({ p, sc: lerp(0.8, 1.7, Rr()), tall: lerp(0.8, 1.2, Rr()), yaw: Rr() * TAU, shade: lerp(0.75, 1.15, Rr()) }));
    place(bushGeometry(5), bushes, 'bushes');
    const saps = scatter(36, 808, [[2.5, 7], [4, 11]], (p) => !nearTree(p.x, p.z, 2.6) && p.f.k < 88, (p, Rr) => ({ p, sc: lerp(0.8, 1.25, Rr()), tall: 1, yaw: Rr() * TAU, shade: lerp(0.8, 1.15, Rr()) }));
    place(saplingGeometry(9), saps, 'saplings');
    stats.bushes = bushes.length; stats.saplings = saps.length;
  }

  // ================================================================================================================ 3. fence, delineators, guard rail, gate, mailbox, signs
  const woodMat = new THREE.MeshLambertMaterial({ name: 'M_RoadWood', map: woodTexture(anisotropy) });
  woodMat.onBeforeCompile = (s) => { s.uniforms.gFill = { value: fill }; s.fragmentShader = 'uniform vec3 gFill;\n' + s.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * gFill * 0.35;
	#include <opaque_fragment>`); };
  woodMat.customProgramCacheKey = () => 'roadWood';
  {                                                                                              // ---- one InstancedMesh of boxes: fence posts and rails, white delineator posts and their reflectors
    const parts = [];                                                                            // { p: [x, y, z], s: [sx, sy, sz], q: Quaternion, c: [r, g, b] }
    const post = (x, y, z, w, h, lean, col, yaw = 0) => parts.push({ p: [x, y + h / 2, z], s: [h, w, w], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(lean[0], yaw, Math.PI / 2 + lean[1])), c: col });   // long axis along local x, stood up
    const rail = (a, b, w, hh, col) => {
      const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = d.length(); if (l < 0.01) return;
      parts.push({ p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [l, hh, w], q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()), c: col });
    };
    const Rf = lcg(1111);
    const fence = (side, k0, k1, off, spacing, hasGate) => {
      let last = null; const s0 = secs[k0].s, s1 = secs[k1].s, n = Math.floor((s1 - s0) / spacing);
      for (let i = 0; i <= n; i++) {
        const s = s0 + i * spacing + (Rf() - 0.5) * 0.15, p = beside(s, side, off + (Rf() - 0.5) * 0.25), wob = 0.9 + Rf() * 0.2, h = 1.2 * wob;
        if (hasGate && Math.abs(s - secs[20].s) < 2.6) { last = null; continue; }                // the gate stands in the fence here
        if (nearTree(p.x, p.z, 1.2)) { last = null; continue; }
        const shade = lerp(0.5, 0.85, Rf()), col = [shade, shade * 0.96, shade * 0.88], lean = [(Rf() - 0.5) * 0.1, (Rf() - 0.5) * 0.12];
        post(p.x, p.ground - 0.25, p.z, 0.12, h + 0.25, lean, col, Rf() * 0.4);
        if (last && Math.hypot(p.x - last.x, p.z - last.z) < spacing * 1.4) for (const [hf, sag] of [[0.55, 0], [0.98, 0.04]]) {
          const g0 = last.ground + hf * wob, g1 = p.ground + hf * wob;
          if (Rf() < 0.94) rail([last.x, g0 - sag, last.z], [p.x, g1 - sag * 0.6, p.z], 0.045, 0.1, [shade * 0.95, shade * 0.9, shade * 0.82]);   // a missing rail now and then
        }
        last = p;
      }
    };
    fence(1, 9, 38, 3.4, 2.5, true); fence(-1, 56, 88, 4.2, 2.6, false); fence(-1, 12, 30, 5.2, 3.0, false);
    // delineators: a white post with a reflector, every 14 m through the bends, both sides
    for (const side of [-1, 1]) for (let s = secs[34].s; s < secs[90].s; s += 14 + (side > 0 ? 3 : 0)) {
      const p = beside(s, side, 1.0); if (nearTree(p.x, p.z, 1)) continue;
      post(p.x, p.ground - 0.15, p.z, 0.075, 1.15, [0, 0], [0.55, 0.55, 0.52]);
    }
    const geo = new THREE.BoxGeometry(1, 1, 1), N = parts.length, mesh = new THREE.InstancedMesh(geo, woodMat, N), M = new THREE.Matrix4(), col = new THREE.Color();
    parts.forEach((o, i) => { M.compose(new THREE.Vector3(...o.p), o.q, new THREE.Vector3(...o.s)); mesh.setMatrixAt(i, M); col.setRGB(o.c[0], o.c[1], o.c[2], THREE.LinearSRGBColorSpace); mesh.setColorAt(i, col); });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; add(mesh, 'fence', 12 * N); stats.fenceParts = N;
  }
  {                                                                                              // ---- the merged props: guard rail, signs, gate, mailbox (one atlas, vertex-coloured)
    const sa = signAtlas(anisotropy), parts = [];
    const mat = new THREE.MeshStandardMaterial({ name: 'M_RoadProps', map: sa, roughness: 0.55, metalness: 0, vertexColors: true, side: THREE.FrontSide });
    mat.emissive.setRGB(1, 1, 1); mat.emissiveMap = sa; mat.emissiveIntensity = 0.06;            // the faces hold a little light (retro-reflective: the moon and the lamp find them)
    mat.onBeforeCompile = (s) => { s.uniforms.gFill = { value: fill }; s.fragmentShader = 'uniform vec3 gFill;\n' + s.fragmentShader.replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * gFill * 0.25;
	#include <opaque_fragment>`); };
    mat.customProgramCacheKey = () => 'roadProps';
    const mapUV = (g, rect) => { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, lerp(rect[0], rect[2], u.getX(i)), lerp(rect[1], rect[3], u.getY(i))); };
    const tint = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); };
    const put = (g, m) => { g.applyMatrix4(m); parts.push(g); };
    const xf = (p, yaw = 0, tiltX = 0, tiltZ = 0) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ)), new THREE.Vector3(1, 1, 1));
    // a box wearing one flat cell of the atlas on all faces (a post, a bar, a mailbox), tinted
    const flat = (w, h, d, c, m, cellName = 'flat') => { const g = new THREE.BoxGeometry(w, h, d); mapUV(g, cell(cellName)); tint(g, c); put(g, m); };
    const GAL = [0.55, 0.57, 0.58], STEEL = [0.22, 0.24, 0.26], PAINT = [0.28, 0.28, 0.27], WOOD = [0.7, 0.66, 0.58];
    // a sign: a steel post and a plate whose face looks back up the road, toward the rider. diamond: the plate is cut as a diamond (the curve sign's)
    const sign = (side, s, off, face, w, h, bottom, o = {}) => {
      const p = beside(s, side, off), yaw = Math.atan2(-p.f.t[0], -p.f.t[1]), cy = p.ground + bottom + h / 2, F = cell(face), fl = cell('metal');
      const top = o.diamond ? p.ground + bottom + h / 2 : p.ground + bottom + h - 0.15, y0 = p.ground - 0.1;                                    // the post ends at the plate's centre (diamond) or just under its top
      if (!o.noPost) flat(0.055, top - y0, 0.055, STEEL, xf([p.x, (top + y0) / 2, p.z], yaw), 'metal');
      const back = [p.x + p.f.t[0] * 0.045, p.z + p.f.t[1] * 0.045], at = [p.x - p.f.t[0] * 0.03, p.z - p.f.t[1] * 0.03];                       // the plate stands on the rider's side of the post
      if (o.diamond) {
        const hw = w / 2, hh = h / 2, P = [0, -hh, 0, hw, 0, 0, 0, hh, 0, -hw, 0, 0];
        const mkDiamond = (flip, rect, uvs, col, pos) => {
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
          g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, flip, 0, 0, flip, 0, 0, flip, 0, 0, flip], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
          g.setIndex(flip > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]); tint(g, col); g.applyMatrix4(xf([pos[0], cy, pos[1]], yaw)); parts.push(g);
        };
        mkDiamond(1, F, [lerp(F[0], F[2], 0.5), F[1], F[2], lerp(F[1], F[3], 0.5), lerp(F[0], F[2], 0.5), F[3], F[0], lerp(F[1], F[3], 0.5)], [1, 1, 1], at);
        mkDiamond(-1, fl, [fl[0], fl[1], fl[2], fl[1], fl[2], fl[3], fl[0], fl[3]], GAL, back);
      } else {
        const g = new THREE.BoxGeometry(w, h, 0.025), u = g.attributes.uv;
        for (let i = 0; i < u.count; i++) { const r = i >= 16 && i < 20 ? F : fl; u.setXY(i, lerp(r[0], r[2], u.getX(i)), lerp(r[1], r[3], u.getY(i))); }       // BoxGeometry's faces: +x -x +y -y +z -z, four vertices each: the front is +z
        tint(g, [1, 1, 1]); put(g, xf([at[0], cy, at[1]], yaw));
      }
      return p;
    };
    sign(1, secs[11].s, 2.2, 'speed', 0.6, 0.76, 1.55);                                         // SPEED LIMIT 25, near the top of the road
    sign(1, secs[37].s, 2.3, 'curve', 0.95, 0.95, 1.7, { diamond: true });                      // the curve, 45 m before the bend,
    sign(1, secs[37].s, 2.3, 'plaque', 0.6, 0.45, 0.95, { noPost: true });                      // and its advisory speed hung on the same post
    for (const k of [44, 47, 50]) sign(1, secs[k].s, 2.1, 'chevron', 0.6, 0.76, 1.2);           // chevrons on the outside of the bend
    // ---- the guard rail: a W-beam on the outside of the bend, wooden posts every 1.9 m
    {
      const kA = 52.6, kB = 63, PROF = [[-0.16, 0], [-0.115, 0], [-0.075, 0.045], [-0.03, 0.045], [0, 0], [0.03, 0.045], [0.075, 0.045], [0.115, 0], [0.16, 0]];
      const sA = lerp(secs[Math.floor(kA)].s, secs[Math.floor(kA) + 1].s, kA % 1), sB = secs[kB].s, n = Math.max(4, Math.round((sB - sA) / 1.9)), posts = [];
      for (let i = 0; i <= n; i++) posts.push(beside(lerp(sA, sB, i / n), 1, 1.7));
      for (const p of posts) { const g = new THREE.BoxGeometry(0.15, 1.05, 0.2); mapUV(g, cell('wood')); tint(g, WOOD); put(g, xf([p.x, p.ground + 0.38, p.z], Math.atan2(p.f.r[0], p.f.r[1]) + Math.PI / 2)); }
      // the beam: swept along the path 0.64 m up, on the road side of the posts, its height smoothed (a rail does not dip with every hummock)
      const path = []; for (let i = 0; i <= n * 3; i++) { const p = beside(lerp(sA, sB, i / (n * 3)), 1, 1.58); path.push(new THREE.Vector3(p.x, p.ground + 0.64, p.z)); }
      for (let pass = 0; pass < 6; pass++) for (let i = 1; i < path.length - 1; i++) path[i].y = (path[i - 1].y + path[i].y * 2 + path[i + 1].y) / 4;
      const pos = [], nor = [], uv = [], idx = [], gu = cell('metal');
      path.forEach((c, i) => {
        const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(), toRoad = new THREE.Vector3(t.z, 0, -t.x);   // the road lies to the left of the way down
        PROF.forEach(([dy, dz], j) => {
          const q = c.clone().addScaledVector(toRoad, dz); q.y += dy; pos.push(q.x, q.y, q.z);
          const slope = j > 0 && j < PROF.length - 1 ? (PROF[j + 1][1] - PROF[j - 1][1]) / (PROF[j + 1][0] - PROF[j - 1][0]) : 0, nrm = toRoad.clone().add(new THREE.Vector3(0, -slope * 0.8, 0)).normalize();
          nor.push(nrm.x, nrm.y, nrm.z); uv.push(lerp(gu[0], gu[2], 0.5), lerp(gu[1], gu[3], j / (PROF.length - 1)));
        });
      });
      const J = PROF.length;
      for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < J - 1; j++) { const a = i * J + j, b = a + J; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); tint(g, GAL);
      const g2 = g.clone(), ix = Array.from(g2.index.array); for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }    // the back of the beam, seen from the slope below the bend
      g2.setIndex(ix); const nn = g2.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
      parts.push(g, g2);
      for (let i = 0; i < posts.length - 1; i++) {                                              // the collision: a box the beam's length, 0.35 to 0.9 m up
        const a = posts[i], b = posts[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), box = new THREE.BoxGeometry(len, 0.55, 0.14);
        box.applyMatrix4(xf([(a.x + b.x) / 2, (a.ground + b.ground) / 2 + 0.62, (a.z + b.z) / 2], Math.atan2(-(b.z - a.z), b.x - a.x))); colliders.push(box);
      }
      stats.rail = { posts: posts.length, length: +(sB - sA).toFixed(1) };
    }
    // ---- the field gate, uphill in the fence line, between two posts: five bars and a brace
    {
      const s = secs[20].s, c = beside(s, 1, 3.4), hw = 1.9, ax = c.f.t[0], az = c.f.t[1], ang = Math.atan2(-az, ax);
      for (const sg of [-1, 1]) { const x = c.x + ax * hw * sg, z = c.z + az * hw * sg, gy = terr.y(x, z) ?? c.ground; flat(0.16, 1.7, 0.16, WOOD, xf([x, gy + 0.55, z]), 'wood'); }
      for (const h of [0.35, 0.65, 0.95, 1.2]) flat(2 * hw - 0.3, 0.06, 0.04, PAINT, xf([c.x, c.ground + h, c.z], ang));
      for (const sg of [-1, 1]) flat(0.05, 0.9, 0.04, PAINT, xf([c.x + ax * (hw - 0.2) * sg, c.ground + 0.78, c.z + az * (hw - 0.2) * sg], ang));
      flat(2 * hw * 0.9, 0.05, 0.04, PAINT, xf([c.x, c.ground + 0.78, c.z], ang, 0, 0.42));
    }
    // ---- a rural mailbox on a post at the downhill driveway's mouth, its flag up
    {
      const p = beside(secs[74].s - 3.4, -1, 1.5), yaw = Math.atan2(-p.f.t[0], -p.f.t[1]), GREEN = [0.1, 0.18, 0.13];
      flat(0.1, 1.15, 0.1, WOOD, xf([p.x, p.ground + 0.55, p.z], yaw), 'wood');
      flat(0.21, 0.13, 0.48, GREEN, xf([p.x, p.ground + 1.18, p.z], yaw), 'metal');
      flat(0.18, 0.07, 0.46, GREEN, xf([p.x, p.ground + 1.27, p.z], yaw), 'metal');
      flat(0.02, 0.15, 0.03, [0.7, 0.05, 0.03], xf([p.x - p.f.r[0] * 0.12, p.ground + 1.32, p.z - p.f.r[1] * 0.12], yaw));
    }
    for (const g of parts) { if (!g.attributes.normal) g.computeVertexNormals(); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.color) tint(g, [1, 1, 1]); }
    const merged = mergeGeometries(parts, false);
    add(new THREE.Mesh(merged, mat), 'props', trisOf(merged));
  }
  {                                                                                              // ---- reflectors on the delineator posts: they glow a little whatever the light (they catch the lamp, and the moon)
    const pts = [];
    for (const side of [-1, 1]) for (let s = secs[34].s; s < secs[90].s; s += 14 + (side > 0 ? 3 : 0)) { const p = beside(s, side, 1.0); if (!nearTree(p.x, p.z, 1)) pts.push({ p, side }); }
    const geo = new THREE.BoxGeometry(0.014, 0.11, 0.2), mat = new THREE.MeshBasicMaterial({ name: 'M_RoadReflector' }), mesh = new THREE.InstancedMesh(geo, mat, pts.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    pts.forEach(({ p, side }, i) => {
      q.setFromEuler(new THREE.Euler(0, Math.atan2(p.f.t[1], -p.f.t[0]), 0)); M.compose(new THREE.Vector3(p.x - p.f.t[0] * 0.05, p.ground + 0.98, p.z - p.f.t[1] * 0.05), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, M);
      col.setRGB(...(side > 0 ? [0.5, 0.04, 0.02] : [0.7, 0.4, 0.03]), THREE.LinearSRGBColorSpace); mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false; add(mesh, 'reflectors', 12 * pts.length);
  }

  // ================================================================================================================ 4. the areaway
  const aw = buildAreaway({ anisotropy, noise, fill, fx });
  group.add(aw.group); stats.calls += aw.stats.calls; stats.tris += aw.stats.tris; stats.areaway = aw.stats;
  for (const c of aw.colliders) colliders.push(c);

  stats.ms = typeof performance !== 'undefined' ? +(performance.now() - t0).toFixed(1) : 0;
  return { group, colliders, stats, terrain: terr, sections: secs, frame, beside };
}
