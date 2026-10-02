// looktest/hearth_vector.js — the PURE-VECTOR HEARTH (every pixel drawn live; ?mode=vector). Level 1 of the cabinet (Berzerk-like cave around a fire), built
// with the look kit to match docs/pitch/cabinet_seven_games_v1/img/hearth_game.png. A LOOK test: no input, no rules.
//
//   const hearth = createHearth(kit)      kit from createLookKit(renderer, { frame: FRAME, ... HEARTH_LOOK })
//   hearth.update(t, dt)                  everything is a pure function of t (seek anywhere, same picture)
//   HERO_T                                the moment that matches the concept's composition
//
// Coordinates are the concept picture's own pixels (1266 x 952, x right, y down), so the layout can be read
// straight off the painting. Safety: the fire's flicker is aperiodic, under ~1.5 Hz and under 10% swing;
// the red shades fade in and out over >= 0.7 s and never flash; the floor rings turn slowly.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, ellipse, arc, bezier, catmull, polygon, star,
  EmberField, GlowDots, drawTrail, drawDigits, Backdrop, FillBatch } from '../lookkit/index.js';
import { TRACED } from './hearth_traced.js';   // bull, deer, top cave mouth: traced from the concept (tools/looktest_trace_hearth.py)

export const FRAME = [1266, 952];
export const HERO_T = 30.0;

/** Kit settings tuned for this screen. */
export const HEARTH_LOOK = {
  frame: FRAME,
  bloom: { strength: 0.38, radius: 0.5, threshold: 1.0, tint: [1.0, 0.42, 0.07] },
  phosphor: { tau: [0.042, 0.034, 0.027] },
  crt: { curve: 0.0, glassCurve: 0.05, glass: [0.97, 0.98], corner: 0.085, vignette: 0.9, scan: 0.035, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0.012, 0.014, 0.03], grain: 0.018 },
};

// ---------- palette: HDR linear light, before the tube's tone map ----------
const C = {            // keep blue small: with the kit's default core heat, green + blue decide how white a core burns
  rock: [0.62, 0.11, 0.0035],
  rockDim: [0.36, 0.06, 0.002],
  floorRock: [0.72, 0.14, 0.004],
  gold: [1.15, 0.35, 0.017],
  post: [0.95, 0.26, 0.01],
  ring: [1.05, 0.26, 0.006],
  fire: [1.3, 0.17, 0.005],
  red: [1.3, 0.1, 0.016],
  score: [1.35, 0.24, 0.012],
  player: [1.3, 0.42, 0.016],
  shard: [1.4, 0.62, 0.035],
  star: [1.5, 0.7, 0.03],
};
const FILL = { face: [0.075, 0.024, 0.001, 1], side: [0.045, 0.014, 0.0006, 1], top: [0.14, 0.045, 0.002, 1],
  stone: [0.1, 0.03, 0.001, 1], boulder: [0.05, 0.016, 0.0006, 0.55] };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; }

/** Aperiodic fire flicker: incommensurate slow sines + smooth noise, all below ~1.5 Hz, swing < 10%. */
export function fireFlicker(t) {
  return 1 + 0.028 * Math.sin(t * 2.31 + 0.4) + 0.022 * Math.sin(t * 4.97 + 1.9) + 0.016 * Math.sin(t * 8.3 + 4.1)
    + 0.03 * (vnoise1(t * 1.3) - 0.5);
}

// ---------- the layout (read off the concept) ----------
const FIRE = [626, 500];
const OPENINGS = [ // [cx, cy, rx, ry]
  [682, 156, 53, 92], [98, 535, 52, 74], [1136, 530, 52, 80], [302, 808, 58, 60], [900, 802, 68, 54],
];
const FLOOR = [[150, 405], [250, 358], [335, 342], [440, 348], [500, 300], [570, 272], [650, 262], [745, 266],
  [825, 300], [885, 362], [930, 410], [1000, 412], [1080, 428], [1112, 470], [1098, 600], [1062, 652], [1012, 694],
  [960, 736], [880, 764], [800, 800], [700, 826], [600, 836], [480, 816], [400, 780], [330, 738], [282, 676],
  [232, 640], [168, 600], [150, 500]];
const MURALS = [[300, 175, 335, 220], [1015, 195, 255, 250]];
const R_NEAR = 250;
const FLOOR_CLS = FLOOR.map(([x, y]) => [640 + (x - 640) * 1.07, 540 + (y - 540) * 1.07]);

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const eD = (x, y, e) => ((x - e[0]) / e[2]) ** 2 + ((y - e[1]) / e[3]) ** 2;
function classify(x, y) {
  if (OPENINGS.some((e) => eD(x, y, e) < 1)) return 'H';
  if (inPoly(x, y, FLOOR_CLS)) return 'F';
  if (MURALS.some((e) => eD(x, y, e) < 1)) return 'M';
  return 'W';
}
const DRAWN = new Set(['WW', 'WF', 'FW', 'WM', 'MW', 'WH', 'HW', 'MF', 'FM', 'FH', 'HF', 'MH', 'HM']);

// ---------- Voronoi rock cells (half-plane clipping; each edge remembers its neighbour) ----------
function makeSeeds() {
  const r = mulberry(1981), seeds = [];
  let row = 0;
  for (let y = -60; y < FRAME[1] + 80; row++) {
    const sp = y < 300 ? 175 : y > 680 ? 98 : 116;
    for (let x = -70 + (row % 2) * sp * 0.5; x < FRAME[0] + 80; x += sp) {
      const px = x + (r() - 0.5) * sp * 0.62, py = y + (r() - 0.5) * sp * 0.55;
      seeds.push({ x: px, y: py, cls: classify(px, py), tone: r() * 2 - 1 });
    }
    y += sp * 0.84;
  }
  return seeds;
}
function voronoi(seeds, bounds) {
  const cells = [];
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    let poly = [[bounds[0], bounds[1], -1], [bounds[2], bounds[1], -1], [bounds[2], bounds[3], -1], [bounds[0], bounds[3], -1]];
    const near = [];
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const d = (seeds[j].x - s.x) ** 2 + (seeds[j].y - s.y) ** 2;
      if (d < R_NEAR * R_NEAR) near.push([j, d]);
    }
    near.sort((a, b) => a[1] - b[1]);
    for (const [j] of near) {
      const q = seeds[j], mx = (s.x + q.x) / 2, my = (s.y + q.y) / 2, dx = q.x - s.x, dy = q.y - s.y;
      const f = (p) => (p[0] - mx) * dx + (p[1] - my) * dy;
      const out = [];
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length], fa = f(A), fb = f(B);
        if (fa <= 0) out.push(A);
        if ((fa <= 0) !== (fb <= 0)) {
          const t = fa / (fa - fb);
          out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, fa <= 0 ? j : A[2]]);
        }
      }
      poly = out;
      if (poly.length < 3) break;
    }
    cells.push(poly);
  }
  return cells;
}

// ---------- a path you can ride by arc length ----------
class Path {
  constructor(ctrl, n = 10, closed = false) {
    this.p = catmull(ctrl, n, closed);
    this.len = [0];
    for (let i = 1; i < this.p.length; i++) this.len.push(this.len[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
    this.total = this.len[this.len.length - 1];
  }
  at(u) {
    const L = clamp01(u) * this.total, len = this.len;
    let lo = 0, hi = len.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (len[m] <= L) lo = m; else hi = m; }
    const a = this.p[lo], b = this.p[hi], t = (L - len[lo]) / Math.max(1e-6, len[hi] - len[lo]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  closest(x, y) {
    let best = 0, bd = 1e18;
    for (let i = 0; i < this.p.length; i++) { const d = (this.p[i][0] - x) ** 2 + (this.p[i][1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    return this.len[best] / this.total;
  }
}

// ---------- static art ----------
function drawRock(batch, seeds, cells) {
  const r = mulberry(77);
  for (let i = 0; i < cells.length; i++) {
    const poly = cells[i], ci = seeds[i].cls;
    for (let k = 0; k < poly.length; k++) {
      const A = poly[k], B = poly[(k + 1) % poly.length], j = A[2];
      if (j < 0 || j < i) continue;
      const cj = seeds[j].cls;
      if (!DRAWN.has(ci + cj)) continue;
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (len < 2) continue;
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      if (OPENINGS.some((e) => eD(mx, my, e) < 0.8) || inPoly(mx, my, TRACED.cave.interior)) continue;
      // one kink per edge so the rock reads hand-cut, not computed
      const t = 0.35 + r() * 0.3, nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len, off = (r() - 0.5) * len * 0.14;
      const M = [A[0] + (B[0] - A[0]) * t + nx * off, A[1] + (B[1] - A[1]) * t + ny * off];
      const isLedge = (ci === 'F') !== (cj === 'F');
      const k2 = (0.7 + r() * 0.45) * (isLedge ? 1.1 : 1);
      const style = r() < 0.7 ? { dash: 40 + r() * 50, gap: 3 + r() * 3, width: 0.8 } : { dash: 13 + r() * 8, gap: 4, width: 0.8 };
      batch.line([[A[0], A[1]], M, [B[0], B[1]]], mul(C.rock, k2), style, null, r() * 40);
    }
    // an inset top face on some wall cells: they read as faceted boulders, like the painting's rock band
    if (ci === 'W' && poly.length > 3 && seeds[i].y > 560 && r() < 0.35) {
      let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= poly.length; cy /= poly.length;
      const k = 0.5 + r() * 0.15, lift = 5 + r() * 6;
      const inset = poly.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k - lift]);
      const col = mul(C.rockDim, 0.8 + r() * 0.4);
      batch.loop(inset, col, { dash: 20 + r() * 20, gap: 4, width: 0.8 });
      for (let q = 0; q < poly.length; q++) if (r() < 0.55) batch.line([[poly[q][0], poly[q][1]], inset[q]], mul(col, 0.8), { dash: 1, gap: 0, width: 0.75 });
      continue;
    }
    // facet lines inside some wall cells near the floor: they read as faceted boulders
    if (ci === 'W' && poly.length > 4 && r() < 0.45) {
      const n = poly.length, a = Math.floor(r() * n), b = (a + 2 + Math.floor(r() * (n - 3))) % n;
      let cx = 0, cy = 0; for (const p of poly) { cx += p[0]; cy += p[1]; } cx /= n; cy /= n;
      const c = [cx + (r() - 0.5) * 20, cy + (r() - 0.5) * 20];
      batch.line([[poly[a][0], poly[a][1]], c, [poly[b][0], poly[b][1]]], mul(C.rockDim, 0.7 + r() * 0.4), { dash: 18, gap: 5, width: 0.8 });
    }
  }
}

/** Low faceted boulder standing on the floor: base ring (squashed), an apex, wireframe edges. */
function boulder(batch, fills, cx, cy, w, h, seed, color = C.floorRock, n = 5) {
  const r = mulberry(seed), base = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const rr = w * 0.5 * (0.8 + r() * 0.3);
    base.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.42]);
  }
  const apex = [cx + (r() - 0.5) * w * 0.25, cy - h];
  fills?.hull([...base, apex], FILL.boulder);
  const col = mul(color, 0.95);
  batch.loop(base, col);
  for (const p of base) batch.line([p, apex], mul(col, p[1] >= cy - 2 ? 1 : 0.55));
  if (r() < 0.5) { const m = base[Math.floor(r() * n)], q = [apex[0] + (m[0] - apex[0]) * 0.45, apex[1] + (m[1] - apex[1]) * 0.45]; batch.line([base[(base.indexOf(m) + 2) % n], q], mul(col, 0.6)); }
}

/** Standing stone: front face, one side face (toward the fire), top. */
function post(batch, fills, bl, br, h, lean, depth, cracks, color) {
  const tl = [bl[0] + lean + 4, bl[1] - h], tr = [br[0] + lean - 3, br[1] - h - 3];
  const f = [bl, br, tr, tl];
  const D = (p) => [p[0] + depth[0], p[1] + depth[1]];
  const side = depth[0] > 0 ? [br, D(br), D(tr), tr] : [bl, D(bl), D(tl), tl];
  fills.poly(side, FILL.side); fills.poly(f, FILL.face); fills.poly([tl, tr, D(tr), D(tl)], FILL.top);
  batch.loop(f, color);
  batch.line(side, mul(color, 0.85));
  batch.line(depth[0] > 0 ? [tl, D(tl), D(tr), tr] : [tr, D(tr), D(tl), tl], mul(color, 0.9));
  // a bevel line just under the top, like the painting's chipped cap
  batch.line([[tl[0] + 1, tl[1] + 9], [tr[0] - 1, tr[1] + 10]], mul(color, 0.55), { dash: 9, gap: 3 });
  for (const c of cracks) batch.line(c, mul(color, 0.55), { dash: 7, gap: 3 });
}

function drawOpenings(b) {
  // jagged rims around the tunnel mouths, open on the side that faces the floor
  const spans = [[2.1, 7.3], [0.7, 5.58], [3.85, 8.7], [0.0, 4.6], [4.6, 9.2]];
  // the top mouth: the traced arch as straight rock edges, pushed out a few px, open at the floor, lit by the fire
  const ap = TRACED.cave.arch;
  let mx = 0, my = 0; for (const [x, y] of ap) { mx += x; my += y; } mx /= ap.length; my /= ap.length;
  const out = ap.map(([x, y]) => { const dx = x - mx, dy = y - my, l = Math.hypot(dx, dy) || 1; return [x + dx / l * 5, y + dy / l * 5]; });
  const runs = [[]];
  for (const q of out) { if (q[1] > 238) { if (runs[runs.length - 1].length) runs.push([]); } else runs[runs.length - 1].push(q); }
  if (runs.length > 1 && runs[runs.length - 1].length && out[0][1] <= 238) runs[0] = runs.pop().concat(runs[0]);   // join across the wrap
  for (const run of runs) if (run.length > 1) b.line(run, mul(C.rock, 1.9), { dash: 40, gap: 4, width: 0.9 });
  const sp = mulberry(91);
  out.forEach((q, i) => {                         // spokes: the rim's corners run on into the rock cells
    if (q[1] > 230 || i % 2) return;
    const dx = q[0] - mx, dy = q[1] - my, l = Math.hypot(dx, dy) || 1, len = 14 + sp() * 22;
    b.line([q, [q[0] + dx / l * len + (sp() - 0.5) * 10, q[1] + dy / l * len + (sp() - 0.5) * 10]], mul(C.rock, 1.3), { dash: 30, gap: 4, width: 0.85 });
  });
  OPENINGS.forEach(([cx, cy, rx, ry], i) => {
    if (i === 0) return;
    const r = mulberry(500 + i), [a0, a1] = spans[i], n = 9, pts = [];
    for (let k = 0; k <= n; k++) {
      const a = a0 + (a1 - a0) * k / n, f = 1.04 + r() * 0.14;
      pts.push([cx + Math.cos(a) * rx * f, cy + Math.sin(a) * ry * f]);
    }
    b.line(pts, mul(C.rock, 1.0), { dash: 30, gap: 5, width: 0.8 });
  });
}

function drawStatic(b, up, fills) {
  drawOpenings(b);
  // --- floor rings around the fire (they turn: dash crawl) ---
  b.line(ellipse(626, 503, 158, 60, 120), mul(C.ring, 0.95), { dash: 5, gap: 9, speed: 9 });
  b.line(ellipse(622, 515, 246, 114, 160), mul(C.ring, 0.8), { dash: 12, gap: 10, speed: -6 });
  b.line(arc(620, 520, 345, 170, 0.05, 1.25, 60), mul(C.ring, 0.55), { dash: 16, gap: 12, speed: 4 });
  b.line(arc(620, 520, 345, 170, 1.9, 3.05, 60), mul(C.ring, 0.55), { dash: 16, gap: 12, speed: 4 });
  b.line(arc(620, 520, 345, 170, 3.5, 4.1, 30), mul(C.ring, 0.5), { dash: 16, gap: 12, speed: 4 });

  // --- the standing stones ---
  post(up, fills, [474, 520], [518, 517], 140, 4, [17, -12], [], C.post);
  post(up, fills, [726, 515], [768, 512], 146, -3, [-18, -12], [
    [[733, 392], [740, 410], [735, 428], [746, 446], [741, 462]],
    [[758, 405], [752, 425], [760, 452], [755, 470]],
    [[716, 420], [712, 440], [719, 458]],
    [[740, 480], [750, 492], [746, 505]],
  ], C.post);
  // rune on the left stone: ring with a cross and an arrow down
  up.line(ellipse(500, 428, 10, 10, 24), mul(C.gold, 1.0));
  up.line([[500, 398], [500, 476]], mul(C.gold, 0.95));
  up.line([[489, 428], [511, 428]], mul(C.gold, 0.9));
  up.line([[491, 466], [500, 478], [509, 466]], mul(C.gold, 0.95));
  // rubble at the stones' feet
  boulder(up, fills, 458, 516, 34, 22, 11, C.post);
  boulder(up, fills, 530, 522, 26, 14, 12, C.post);
  boulder(up, fills, 778, 505, 40, 34, 13, C.post);
  boulder(up, fills, 745, 522, 24, 12, 14, C.post);

  // --- floor rocks ---
  boulder(up, fills, 252, 478, 92, 34, 21, C.floorRock, 4);
  boulder(up, fills, 362, 668, 64, 32, 22, C.floorRock, 4);
  boulder(up, fills, 553, 306, 54, 24, 23, C.floorRock, 4);
  boulder(up, fills, 477, 322, 36, 18, 24, C.rock, 4);
  boulder(up, fills, 862, 356, 54, 26, 25);
  boulder(up, fills, 880, 548, 46, 40, 26);
  boulder(up, fills, 922, 670, 64, 32, 27, C.floorRock, 4);
  boulder(up, fills, 128, 632, 56, 50, 28);
  boulder(up, fills, 1104, 580, 66, 56, 29);
  boulder(up, fills, 458, 824, 70, 58, 30);
  boulder(up, fills, 1060, 824, 110, 80, 31);

  // --- dashed contour lines on the walls (the painted ledges around the animals) ---
  b.line(catmull([[503, 146], [518, 205], [490, 262], [458, 292]], 8), mul(C.gold, 0.55), { dash: 9, gap: 8 });
  b.line(catmull([[892, 150], [872, 250], [880, 330], [910, 385]], 8), mul(C.gold, 0.55), { dash: 8, gap: 9 });
  b.line(catmull([[740, 300], [800, 318], [850, 322]], 8), mul(C.gold, 0.45), { dash: 10, gap: 8 });
  b.line(catmull([[960, 420], [1030, 440], [1100, 470]], 8), mul(C.gold, 0.45), { dash: 10, gap: 8 });

  // --- runes ---
  const R = mul(C.gold, 0.95);
  b.line(arc(400, 52, 28, 26, 0, Math.PI, 20), R, { dash: 9, gap: 4 });            // above the bull
  b.line([[400, 18], [400, 92]], R);
  b.line([[391, 36], [400, 48], [409, 36]], R);
  b.line(catmull([[100, 186], [109, 204], [100, 226], [91, 204], [100, 186]], 6), R);   // left of the bull: leaf
  b.line([[100, 226], [100, 302]], R); b.line([[86, 262], [116, 262]], R); b.line([[106, 208], [118, 208]], R);
  b.line(arc(515, 178, 11, 10, 0, Math.PI, 12), R); b.line([[515, 160], [515, 196]], R);   // small cup
  b.line([[845, 66], [845, 205]], R);                                                     // deer: arrow rune
  b.line([[834, 84], [845, 66], [856, 84]], R); b.line([[833, 94], [857, 94]], R); b.line([[831, 112], [859, 112]], R);
  b.line(ellipse(845, 142, 12, 8, 20), R);
  b.line(ellipse(1028, 105, 16, 16, 28), R);                                              // sun
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; b.line([[1028 + Math.cos(a) * 20, 105 + Math.sin(a) * 20], [1028 + Math.cos(a) * 29, 105 + Math.sin(a) * 29]], R); }
  b.line([[1028, 56], [1028, 84]], R); b.line([[1028, 126], [1028, 160]], R);
  b.line(ellipse(1058, 162, 45, 45, 60), mul(R, 0.8), { dash: 6, gap: 6 });               // crosshair in a dotted ring
  b.line(ellipse(1058, 172, 11, 11, 20), R); b.line([[1044, 172], [1072, 172]], R); b.line([[1058, 150], [1058, 196]], R);
  b.line([[1183, 280], [1183, 392]], R);                                                  // right edge rune
  b.line([[1173, 298], [1183, 282], [1193, 298]], R); b.line([[1172, 316], [1194, 316]], R); b.line([[1172, 334], [1194, 334]], R);
  b.loop([[1170, 356], [1196, 356], [1183, 374]], R);

  // --- score ---
  drawDigits(b, '3840', 102, 60, { h: 29, w: 20, pitch: 27, slant: 0.12, gap: 1.6, hollow: false, color: mul(C.score, 1.45), style: { dash: 1, gap: 0, width: 1.6 } });
}

/** Draws a traced animal: strokes at their painted brightness, the sacred circles as exact arcs, the glints. */
function drawTraced(b, dots, t, big) {
  const G = C.gold;
  for (const line of t.lines) {
    const [bright, ...pts] = line;
    b.line(pts, mul(G, 0.8 + 0.5 * bright));
  }
  for (const [cx, cy, a, bb, th, arcs] of t.ellipses) {
    const full = arcs.length === 1 && arcs[0][1] - arcs[0][0] > 6.2;
    for (const [t0, t1] of arcs) {
      const n = Math.max(6, Math.round((t1 - t0) * 30)), pts = [];
      for (let i = 0; i <= n; i++) {
        const u = t0 + (t1 - t0) * i / n, ca = Math.cos(u), sa = Math.sin(u);
        pts.push([cx + a * ca * Math.cos(th) - bb * sa * Math.sin(th), cy + a * ca * Math.sin(th) + bb * sa * Math.cos(th)]);
      }
      b.line(pts, mul(G, full ? 1.0 : 0.8), full ? { dash: 34, gap: 3 } : { dash: 18, gap: 4 });
    }
  }
  for (const [x, y, size] of t.glints) {
    if (size >= big) { star(b, x, y, 24, mul(C.star, 1.0), 4, 0.0); dots.add(x, y, 9, [0.9, 0.4, 0.1]); }
    else if (size >= 25) { b.line(ellipse(x, y, 1.8, 1.8, 8), mul(C.star, 0.9)); dots.add(x, y, 5, [0.7, 0.3, 0.06]); }
    else dots.add(x, y, 3.5, [0.45, 0.18, 0.03]);
  }
}
function drawBull(b, dots) { drawTraced(b, dots, TRACED.bull, 60); }
function drawDeer(b, dots) { drawTraced(b, dots, TRACED.deer, 60); }

// ---------- moving things ----------
function arrowPts(x, y, a, s = 1) {
  const c = Math.cos(a), sn = Math.sin(a);
  const P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
  return { out: [P(28, 0), P(-18, -15), P(-8, 0), P(-18, 15)], fold: [P(28, 0), P(-8, 0)] };
}
function shadePts(x, y, a, s) {
  const c = Math.cos(a), sn = Math.sin(a);
  const P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
  const nose = P(1, 0), lw = P(-0.75, -0.8), rw = P(-0.75, 0.8), o = P(-0.18, 0);
  const i1 = P(0.25, 0), i2 = P(-0.45, -0.3), i3 = P(-0.45, 0.3);
  return { tri: [nose, lw, rw], o, inner: [i1, i2, i3], lw, rw };
}
function smallTri(b, x, y, a, s, col) {
  b.loop(polygon(x, y, s, 3, a), col);
}
function drop(b, x, y, s, col) {
  b.line([[x, y - s * 1.6], [x + s * 0.8, y], ...arc(x, y, s * 0.8, s * 0.8, 0, Math.PI, 8).slice(1), [x, y - s * 1.6]], col);
}

export function createHearth(kit) {
  const { scene } = kit;
  const seeds = makeSeeds();
  const cells = voronoi(seeds, [-120, -120, FRAME[0] + 120, FRAME[1] + 120]);

  // backdrop: dim rock tone (R), openings (G), cracks (B), drawn once
  const canvas = paintBackdrop(seeds, cells);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const backdrop = new Backdrop({
    frame: FRAME, map: tex,
    uniforms: { fireC: { value: new THREE.Vector2(...FIRE) }, fireGain: { value: 1 }, time: { value: 0 } },
    shade: /* glsl */`
      float tone = tex.r, hole = tex.g, crack = tex.b;
      vec3 amb = vec3(1.0, 0.5, 0.03);
      vec3 fir = vec3(1.0, 0.36, 0.014);
      tone += (fract(sin(dot(floor(f * 0.85), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.16;
      vec2 d = (f - fireC) * vec2(1.0, 1.75);
      float r = length(d);
      float fire = fireGain * (0.4 * exp(-r / 190.0) + 0.38 * exp(-r * r / 9000.0));
      vec2 m = (f - vec2(633.0, 430.0)) * vec2(1.0, 1.25);
      float a = 0.05 + 0.06 * exp(-dot(m, m) / 180000.0);
      vec3 col = (amb * a + fir * fire) * (0.45 + 0.9 * tone);
      col *= 1.0 - 0.985 * hole;
      col += vec3(0.012, 0.0005, 0.0) * hole * hole;
      col *= 1.0 - 0.6 * crack;
      return col;`,
  });
  scene.add(backdrop.object);

  // materials: one program, several gains
  const matStatic = kit.track(new GlowLineMaterial({ width: 7.5 }));
  const matBull = kit.track(new GlowLineMaterial({ width: 8.5 }));
  const matDeer = kit.track(new GlowLineMaterial({ width: 8.5 }));
  const matFire = kit.track(new GlowLineMaterial({ width: 8.5, coreGain: 3.0 }));
  const matDyn = kit.track(new GlowLineMaterial({ width: 9 }));

  const dotsStatic = kit.track(new GlowDots(64));
  const fills = new FillBatch(3000);
  const sStatic = new LineBatch(matStatic, 6000);
  const sUpper = new LineBatch(matStatic, 1500);
  drawStatic(sStatic, sUpper, fills); drawRock(sStatic, seeds, cells);
  sStatic.commit(); sUpper.commit();
  sStatic.object.renderOrder = 1; sUpper.object.renderOrder = 3;
  const sBull = new LineBatch(matBull, 1200); drawBull(sBull, dotsStatic); sBull.commit();
  const sDeer = new LineBatch(matDeer, 1200); drawDeer(sDeer, dotsStatic); sDeer.commit();
  dotsStatic.commit();
  const sFire = new LineBatch(matFire, 800);
  const fireFills = buildFireFills(fills);
  fills.commit(); scene.add(fills.object);
  const sDyn = new LineBatch(matDyn, 2500);
  const dots = kit.track(new GlowDots(96));
  const embers = kit.track(new EmberField({ count: 110, origin: [626, 478], spread: [34, 12], rise: 215, life: [1.6, 3.4],
    size: [1.6, 3.8], young: [1.6, 0.6, 0.12], old: [0.9, 0.12, 0.01], drift: 14, seed: 5 }));

  for (const o of [sStatic.object, sUpper.object, sBull.object, sDeer.object, sFire.object, sDyn.object]) scene.add(o);
  sFire.object.renderOrder = 4; sDyn.object.renderOrder = 12;
  scene.add(dotsStatic.object, dots.object, embers.object);
  const bullPivot = [320, 230];

  // --- fire geometry (built once; drawn per frame with a per-line shimmer) ---
  const fireSegs = buildFire();

  // --- the player's loop: out to a shard, back to the fire ---
  const playerPath = new Path([[632, 566], [560, 588], [470, 612], [398, 640], [352, 686], [410, 708], [478, 714],
    [540, 706], [592, 676], [624, 640], [638, 604]], 10, true);
  const pickU = playerPath.closest(352, 686);
  const P_PERIOD = 10.0;
  const heroU = playerPath.closest(622, 642);
  // map time -> path fraction: the loop from the fire (u=0) to the pickup (pickU) and back (1), easing at each end
  const loopU = (t) => {
    const ph = ((t / P_PERIOD) % 1 + 1) % 1;
    const out = 0.46;                       // share of the period spent going out
    if (ph < out) return pickU * easeLeg(ph / out);
    return pickU + (1 - pickU) * easeLeg((ph - out) / (1 - out));
  };
  const easeLeg = (x) => { const y = clamp01((x - 0.06) / 0.88); return y * y * (3 - 2 * y) * 0.6 + y * 0.4; };
  // solve the player's phase so the hero frame puts the arrow where the painting has it
  let pOffset = 0;
  { let best = 1e9; for (let k = 0; k < 800; k++) { const tt = (k / 800) * P_PERIOD; const u = loopU(tt); const d = Math.abs(u - heroU); if (d < best) { best = d; pOffset = tt - HERO_T; } } }
  const playerAt = (t) => { const u = loopU(t + pOffset); return playerPath.at(u); };
  const carrying = (t) => { const u = loopU(t + pOffset); return u > pickU + 0.002 && u < 0.995; };

  // --- the shade lanes ---
  const lanes = [
    { ctrl: [[688, 92], [686, 150], [681, 198], [662, 250], [640, 300]], hero: [681, 197], D: 5.0, C: 7.0, chevrons: true,
      frags: [[0.12, 22, 1.0], [0.22, -4, 0.9], [0.36, -40, 0.8]] },
    { ctrl: [[190, 318], [262, 368], [330, 418], [392, 456], [440, 482]], hero: [332, 419], D: 5.6, C: 8.2,
      frags: [[0.18, 18, 0.9]] },
    { ctrl: [[74, 540], [128, 552], [176, 565], [250, 584], [330, 596]], hero: [176, 565], D: 5.2, C: 7.6,
      frags: [[0.12, 22, 0.9], [0.06, 44, 0.8], [0.2, 52, 0.7]] },
    { ctrl: [[292, 836], [332, 800], [395, 760], [452, 722], [505, 694]], hero: [395, 760], D: 5.0, C: 8.6,
      frags: [[0.15, -26, 0.9]] },
    { ctrl: [[1168, 522], [1112, 528], [1068, 532], [1010, 524], [965, 516], [900, 507], [840, 502]], hero: [1068, 532], D: 7.4, C: 9.0,
      frags: [[0.08, -40, 0.9], [0.1, 22, 0.8]], twin: 0.3 },
    { ctrl: [[962, 846], [884, 792], [842, 758], [786, 726], [742, 692], [702, 662]], hero: [786, 726], D: 5.6, C: 8.0,
      frags: [[0.1, 34, 0.9], [0.05, 70, 0.8], [0.02, -55, 0.7]] },
  ].map((L) => {
    const path = new Path(L.ctrl, 10);
    const uHero = path.closest(...L.hero);
    return { ...L, path, phase: uHero * L.D - HERO_T };
  });

  // --- ember glyphs (the painting's little drops above the fire) ---
  const glyphs = [[588, 5.2, 0.1], [640, 4.6, 0.55], [576, 6.0, 0.3], [604, 4.2, 0.8], [668, 5.6, 0.2], [650, 6.4, 0.7], [620, 5.0, 0.45]];

  function update(t, dt = 1 / 60) {
    const flick = fireFlicker(t);
    // feeding the fire: a slow swell when the shard lands (single, gentle: no flash)
    const ph = (((t + pOffset) / P_PERIOD) % 1 + 1) % 1;
    const feed = 0.1 * smooth(0.0, 0.05, ph) * (1 - smooth(0.05, 0.35, ph));
    const fireK = flick + feed;
    backdrop.uniforms.fireGain.value = 0.96 * fireK;
    backdrop.uniforms.time.value = t;
    matStatic.time = t;
    matFire.gain = fireK;
    embers.update(t); embers.gain = fireK;

    // the bull wakes over ~10 s, holds, settles (24 s cycle); a subtle breath while awake
    const bc = ((t % 24) + 24) % 24;
    const wake = smooth(0, 10, bc) * (1 - smooth(14, 22, bc));
    matBull.gain = 0.74 + 0.3 * wake + 0.03 * wake * Math.sin(t * 1.5);
    const s = 1 + 0.006 * wake * Math.sin(t * 1.5);
    sBull.object.scale.set(s, s, 1);
    sBull.object.position.set(bullPivot[0] * (1 - s), -bullPivot[1] * (1 - s), 0);
    matDeer.gain = 0.98;
    dotsStatic.gain = 0.85 + 0.25 * wake;

    // fire: per-line shimmer, slow and small
    sFire.clear();
    for (const f of fireSegs) {
      const k = f.k * (1 + 0.1 * Math.sin(t * f.w + f.p));
      sFire.seg(f.a[0], f.a[1], f.b[0], f.b[1], mul(f.c, k), mul(f.c2 ?? f.c, k), f.style);
    }
    sFire.commit();

    // dynamic: player, shard, shades, trails, glyphs
    sDyn.clear(); dots.clear();
    dots.add(626, 494, 34, mul([0.55, 0.14, 0.01], fireK));
    dots.add(626, 470, 120, mul([0.1, 0.025, 0.002], fireK));
    dots.add(626, 505, 12, mul([1.2, 0.45, 0.07], fireK));

    for (const [x0, per, off] of glyphs) {
      const q = (((t / per) + off) % 1 + 1) % 1;
      const a = smooth(0, 0.15, q) * (1 - smooth(0.6, 1, q));
      const x = x0 + Math.sin(t * 0.9 + off * 9) * 6, y = 450 - q * 185;
      if (a > 0.01) drop(sDyn, x, y, 3.2, mul(C.fire, 0.75 * a));
    }

    // player + trail
    const [px, py, pa] = playerAt(t);
    const trail = [];
    for (let k = 0; k <= 34; k++) { const p = playerAt(t - k * 0.06); trail.push([p[0], p[1]]); }
    const back = [px - Math.cos(pa) * 20, py - Math.sin(pa) * 20];
    trail[0] = back;
    drawTrail(sDyn, trail, mul(C.player, 1.15), { dash: 10, gap: 7 });
    for (const side of [-1, 0, 1]) {   // speed lines off the tail
      const nx = -Math.sin(pa) * side * 9, ny = Math.cos(pa) * side * 9, l0 = 16 + Math.abs(side) * 6, l1 = l0 + 16;
      sDyn.line([[back[0] - Math.cos(pa) * l0 + nx, back[1] - Math.sin(pa) * l0 + ny], [back[0] - Math.cos(pa) * l1 + nx, back[1] - Math.sin(pa) * l1 + ny]],
        mul(C.player, side === 0 ? 0.45 : 0.55), undefined, [0, 0, 0]);
    }
    const ar = arrowPts(px, py, pa, 1.3);
    sDyn.loop(ar.out, C.player); sDyn.line(ar.fold, mul(C.player, 0.6));
    dots.add(px, py, 22, [0.22, 0.06, 0.008]);
    // the shard: carried ahead-left of the tip, or waiting at the pickup, or flying into the fire
    const pick = playerPath.at(pickU);
    const u = loopU(t + pOffset);
    if (carrying(t)) shard(sDyn, dots, px + Math.cos(pa) * 36 + 12, py + Math.sin(pa) * 36 - 14, 1);
    else if (u < pickU) {
      const appear = smooth(0.05, 0.4, u / pickU);
      shard(sDyn, dots, pick[0] - 10, pick[1] - 16, appear);
    }
    if (ph < 0.06) {              // the delivered shard drops into the fire
      const q = ph / 0.06, sx = 648 + (626 - 648) * q, sy = 560 + (480 - 560) * q - Math.sin(q * Math.PI) * 30;
      shard(sDyn, dots, sx, sy, 1 - q * 0.8);
    }

    // shades
    for (const L of lanes) {
      const heads = L.twin ? [0, L.twin] : [0];
      for (const lag of heads) {
        const lt = (((t + L.phase - lag * L.D) % L.C) + L.C) % L.C;
        if (lt > L.D) continue;
        const uu = lt / L.D;
        const alpha = smooth(0, 0.16, uu) * (1 - smooth(0.78, 1, uu));
        if (alpha < 0.01) continue;
        const [x, y, a] = L.path.at(uu);
        const col = mul(C.red, alpha);
        const sp = shadePts(x, y, a, 25);
        // wing trails: dotted, along the lane behind
        for (const w of [-1, 1]) {
          const pts = [];
          for (let k = 0; k <= 12; k++) {
            const v = uu - k * 0.022; if (v < 0) break;
            const [qx, qy, qa] = L.path.at(v);
            pts.push([qx - Math.cos(qa) * 18 - Math.sin(qa) * w * 14, qy - Math.sin(qa) * 18 + Math.cos(qa) * w * 14]);
          }
          drawTrail(sDyn, pts, mul(C.red, 0.75 * alpha), { dash: 3, gap: 6 });
        }
        if (L.chevrons) for (let k = 1; k <= 7; k++) {      // a column of chevrons back up the tunnel
          const v = uu - k * 0.028; if (v < 0) break;
          const [qx, qy, qa] = L.path.at(v), f = alpha * (1 - k / 8), cs = Math.cos(qa), sn = Math.sin(qa), w = 5.5;
          const tip = [qx - cs * 30 + cs * 3, qy - sn * 30 + sn * 3];
          sDyn.line([[tip[0] - cs * 6 - sn * w, tip[1] - sn * 6 + cs * w], tip, [tip[0] - cs * 6 + sn * w, tip[1] - sn * 6 - cs * w]], mul([1.3, 0.3, 0.012], 0.8 * f));
        }
        sDyn.loop(sp.tri, col);
        sDyn.line([sp.tri[0], sp.o], mul(col, 0.75)); sDyn.line([sp.lw, sp.o], mul(col, 0.75)); sDyn.line([sp.rw, sp.o], mul(col, 0.75));
        sDyn.loop(sp.inner, mul(col, 0.8));
        dots.add(x, y, 22, mul([0.07, 0.003, 0.001], alpha));
        if (lag === 0) for (const [du, lat, k] of L.frags) {
          const v = uu - du; if (v < 0.02) continue;
          const [fx, fy, fa] = L.path.at(v);
          const fxl = fx - Math.sin(fa) * lat, fyl = fy + Math.cos(fa) * lat;
          const fal = smooth(0.02, 0.12, v) * alpha;
          smallTri(sDyn, fxl, fyl, fa + Math.PI, 7.5, mul(C.red, k * fal));
          const tp = [];
          for (let j = 0; j <= 5; j++) { const vv = v - j * 0.02; if (vv < 0) break; const [qx, qy, qa] = L.path.at(vv); tp.push([qx - Math.sin(qa) * lat, qy + Math.cos(qa) * lat]); }
          drawTrail(sDyn, tp, mul(C.red, 0.45 * k * fal), { dash: 2.5, gap: 6 });
        }
      }
    }
    sDyn.commit(); dots.commit();
  }

  return { update, backdrop, lanes, playerPath, materials: { matStatic, matBull, matDeer, matFire, matDyn }, batches: { sStatic, sUpper, sBull, sDeer, sFire, sDyn }, fills };
}

function shard(b, dots, x, y, a) {
  if (a <= 0.01) return;
  const c = mul(C.shard, a);
  const top = [x, y - 28], r = [x + 13, y - 6], bot = [x, y + 23], l = [x - 13, y - 6], m = [x, y - 6];
  b.loop([top, r, bot, l], c);
  b.line([l, m, r], mul(c, 0.7)); b.line([top, m, bot], mul(c, 0.7));
  b.line([[x - 5, y - 14], m], mul(c, 0.5)); b.line([[x + 5, y - 14], m], mul(c, 0.5));
  dots.add(x, y - 2, 18, mul([0.45, 0.14, 0.02], a));
}

function buildFireFills(fills) {
  const cx = 626, cy = 500, n = 11, h = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + 0.05, a1 = ((i + 1) / n) * Math.PI * 2 - 0.05;
    const E = (rx, ry, a, lift) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry - lift];
    const top = [E(82, 38, a0, h), E(84, 39, (a0 + a1) / 2, h + 1), E(82, 38, a1, h), E(52, 22, a1, h), E(51, 21, (a0 + a1) / 2, h), E(52, 22, a0, h)];
    if (Math.sin((a0 + a1) / 2) > -0.1) fills.poly([E(82, 38, a0, h), E(82, 38, a0, 0), E(82, 38, a1, 0), E(82, 38, a1, h)], FILL.side);
    fills.poly(top, FILL.stone);
  }
  return true;
}

function buildFire() {
  const segs = [], r = mulberry(404);
  const add = (a, b, c, k = 1, style) => segs.push({ a, b, c, k, w: 1.3 + r() * 5.0, p: r() * 6.28, style });
  const HOT = C.fire, WARM = [0.85, 0.15, 0.004];
  // the ring of stones: top faces + the near faces
  const cx = 626, cy = 500, n = 11, h = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + 0.05, a1 = ((i + 1) / n) * Math.PI * 2 - 0.05;
    const E = (rx, ry, a, lift) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry - lift];
    const o0 = E(82, 38, a0, h), o1 = E(82, 38, a1, h), i0 = E(52, 22, a0, h), i1 = E(52, 22, a1, h);
    const mid = (a0 + a1) / 2, near = Math.sin(mid) > -0.1;
    const om = E(84, 39, mid, h + 1), im = E(51, 21, mid, h);
    add(o0, om, WARM, 1); add(om, o1, WARM, 1); add(i0, im, WARM, 0.8); add(im, i1, WARM, 0.8);
    add(o0, i0, WARM, 0.8); add(o1, i1, WARM, 0.8);
    if (near) {
      const b0 = E(82, 38, a0, 0), b1 = E(82, 38, a1, 0);
      add(o0, b0, WARM, 0.8); add(o1, b1, WARM, 0.8); add(b0, b1, WARM, 0.9);
    }
  }
  // the crystals: faceted pyramids turned so a ridge faces you; front faces split into a triangle lattice
  const sub = (a, b, c, level, k) => {
    if (level <= 0) return;
    const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const ab = m(a, b), bc = m(b, c), ca = m(c, a);
    add(ab, bc, HOT, k); add(bc, ca, HOT, k); add(ca, ab, HOT, k);
    sub(a, ab, ca, level - 1, k * 0.85); sub(ab, b, bc, level - 1, k * 0.85); sub(ca, bc, c, level - 1, k * 0.85); sub(ab, bc, ca, level - 1, k * 0.85);
  };
  const crystal = (bx, by, br, ax, ay, level, k) => {
    const base = [[bx + br, by], [bx, by + br * 0.42], [bx - br, by], [bx, by - br * 0.42]];
    const apex = [ax, ay];
    add(base[0], base[1], HOT, k); add(base[1], base[2], HOT, k);          // front base edges
    add(apex, base[0], HOT, k); add(apex, base[1], HOT, k * 1.15); add(apex, base[2], HOT, k);
    add(apex, base[3], HOT, k * 0.3);                                        // the hidden back edge, faint
    sub(apex, base[0], base[1], level, k * 0.62); sub(apex, base[1], base[2], level, k * 0.62);
  };
  crystal(606, 497, 17, 598, 452, 1, 0.7);
  crystal(650, 497, 17, 657, 455, 1, 0.7);
  crystal(591, 511, 27, 582, 440, 1, 0.9);
  crystal(664, 511, 27, 673, 444, 1, 0.9);
  crystal(627, 506, 47, 628, 394, 2, 1.0);
  crystal(611, 523, 12, 605, 489, 1, 0.8);
  crystal(645, 524, 12, 650, 491, 1, 0.8);
  // the white-hot point where the big ridge meets the floor: short rays
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    segs.push({ a: [627, 526], b: [627 + Math.cos(a) * 20, 526 + Math.sin(a) * 9], c: [1.4, 0.6, 0.02], c2: [0, 0, 0], k: 1, w: 1 + r() * 3, p: r() * 6 });
  }
  return segs;
}

// ---------- the painted backdrop (once, at load) ----------
function paintBackdrop(seeds, cells) {
  const w = 640, h = 480, sx = FRAME[0] / w, sy = FRAME[1] / h;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  // value noise
  const lat = new Float32Array(256 * 256); const rr = mulberry(9); for (let i = 0; i < lat.length; i++) lat[i] = rr();
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const L = (i, j) => lat[((j & 255) << 8) | (i & 255)];
    return (L(xi, yi) * (1 - u) + L(xi + 1, yi) * u) * (1 - v) + (L(xi, yi + 1) * (1 - u) + L(xi + 1, yi + 1) * u) * v;
  };
  // bucket grid of seeds
  const B = 100, gw = Math.ceil((FRAME[0] + 400) / B), gh = Math.ceil((FRAME[1] + 400) / B), grid = Array.from({ length: gw * gh }, () => []);
  seeds.forEach((s, i) => { const gx = Math.floor((s.x + 200) / B), gy = Math.floor((s.y + 200) / B); if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) grid[gy * gw + gx].push(i); });
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const fx = (px + 0.5) * sx, fy = (py + 0.5) * sy;
      const gx = Math.floor((fx + 200) / B), gy = Math.floor((fy + 200) / B);
      let i1 = -1, i2 = -1, d1 = 1e18, d2 = 1e18;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const cell = grid[(gy + oy) * gw + gx + ox]; if (!cell) continue;
        for (const i of cell) {
          const d = (seeds[i].x - fx) ** 2 + (seeds[i].y - fy) ** 2;
          if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; }
        }
      }
      const s1 = seeds[i1], s2 = seeds[i2];
      const n = vn(fx / 38, fy / 38) * 0.55 + vn(fx / 13, fy / 13) * 0.3 + vn(fx / 4.5, fy / 4.5) * 0.15;
      const big = vn(fx / 160 + 7, fy / 160 + 3);
      let tone = 0.42 + (n - 0.5) * 0.34 + (big - 0.5) * 0.25;
      const cls = s1.cls;
      if (cls === 'W' || cls === 'H') {
        const ddx = FIRE[0] - s1.x, ddy = FIRE[1] - s1.y, dl = Math.hypot(ddx, ddy) || 1;
        const facet = ((fx - s1.x) * ddx + (fy - s1.y) * ddy) / dl / 60;
        tone += 0.07 * s1.tone + 0.12 * Math.max(-1, Math.min(1, facet));
      } else if (cls === 'M') tone += 0.05 * s1.tone;
      else tone += 0.03 * s1.tone;
      // crevice: darken just beside the drawn cell edges
      if (s2 && DRAWN.has(s1.cls + s2.cls)) {
        const dd = Math.hypot(s2.x - s1.x, s2.y - s1.y) || 1;
        const edge = (d2 - d1) / (2 * dd);
        tone *= 1 - 0.45 * Math.exp(-edge / 5);
      }
      let hole = 0;
      for (const e of OPENINGS.slice(1)) { const q = Math.sqrt(eD(fx, fy, e)); hole = Math.max(hole, 1 - smooth(0.45, 1.12, q)); }
      const o = (py * w + px) * 4;
      img.data[o] = Math.max(0, Math.min(255, tone * 255));
      img.data[o + 1] = hole * 255;
      img.data[o + 2] = 0;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // the top mouth: the traced arch, soft-edged, into the openings channel (green)
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(2.5px)';
  ctx.fillStyle = 'rgba(0,255,0,1)';
  ctx.beginPath(); TRACED.cave.interior.forEach(([x, y], i) => (i ? ctx.lineTo(x / sx, y / sy) : ctx.moveTo(x / sx, y / sy))); ctx.closePath(); ctx.fill();
  ctx.filter = 'none';
  // floor cracks, on the blue channel only
  ctx.strokeStyle = 'rgba(0,0,255,0.85)'; ctx.lineWidth = 1.1; ctx.lineJoin = 'round';
  const cracks = [
    [[790, 548], [806, 590], [798, 640], [812, 700], [805, 760], [826, 812]],
    [[806, 640], [840, 668], [872, 676]],
    [[560, 725], [610, 752], [668, 760], [712, 790]],
    [[340, 560], [390, 575], [430, 600]],
    [[980, 640], [1010, 690], [1000, 730]],
    [[520, 380], [560, 395], [585, 420]],
    [[720, 600], [760, 612], [790, 600]],
  ];
  for (const c of cracks) {
    ctx.beginPath(); c.forEach(([x, y], i) => (i ? ctx.lineTo(x / sx, y / sy) : ctx.moveTo(x / sx, y / sy))); ctx.stroke();
  }
  return cv;
}
