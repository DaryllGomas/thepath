// looktest/hearth.js — the HEARTH look test, LAYERED like a real arcade game: a painted background plate
// (assets/looktest/hearth_plate.png: the cave with the fire out) under live glowing layers built with the look kit.
// Matches docs/pitch/cabinet_seven_games_v1/img/hearth_game.png. A LOOK test: no input, no rules.
// The earlier every-pixel-live version is js/cabinet/looktest/hearth_vector.js (looktest_hearth.html?mode=vector).
//
//   const hearth = createHearth(kit);  await hearth.ready    kit from createLookKit(renderer, { ...HEARTH_LOOK })
//   hearth.update(t, dt)            everything is a pure function of t (seek anywhere, same picture)
//   HERO_T                          the moment that matches the concept's composition
//
// Layers, bottom to top:
//   1. the plate, LIT BY THE FIRE: an exposure pool around the hearth (flickering gently) on top of the cave light
//   2. the fire: crystals sitting in the plate's empty hearth ring, glow, embers
//   3. the floor rings (turning), the player and the shard, the red shades out of the plate's openings, the score
//   4. the animals WAKING: live strokes traced from the plate (tools/looktest_trace_hearth.py --source plate) that sit
//      exactly on the painted ones and glow up over them, then settle back to the painting
// Coordinates are the plate's own pixels (1266 x 952, x right, y down). The plate already carries the tube's curve and
// bezel, so the kit's CRT pass adds no curvature and no glass edge here.
// Safety: the fire's flicker is aperiodic, under ~1.5 Hz and a few % of light; the red shades fade over >= 0.7 s.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, ellipse, arc, catmull, polygon, star,
  EmberField, GlowDots, drawTrail, drawDigits, Backdrop } from '../lookkit/index.js';
import { TRACED } from './hearth_plate_traced.js';

export const FRAME = [1266, 952];
export const HERO_T = 30.0;
export const PLATE_URL = new URL('../../../assets/looktest/hearth_plate.png', import.meta.url).href;

/** Kit settings tuned for this screen. */
export const HEARTH_LOOK = {
  frame: FRAME,
  bloom: { strength: 0.42, radius: 0.5, threshold: 1.0, tint: [1.0, 0.42, 0.07] },
  phosphor: { tau: [0.042, 0.034, 0.027] },
  // the plate is already a curved tube in its bezel: no curve, no glass mask, only faint scan + grain
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.12, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

// ---------- palette: HDR linear light, before the tube's tone map (keep blue small: it sets core whiteness) ----------
const C = {
  gold: [1.15, 0.35, 0.017],
  ring: [1.05, 0.26, 0.006],
  fire: [1.3, 0.2, 0.006],
  red: [1.3, 0.1, 0.016],
  score: [1.35, 0.24, 0.012],
  player: [1.3, 0.42, 0.016],
  shard: [1.4, 0.62, 0.035],
  star: [1.5, 0.7, 0.03],
};
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

// ---------- the plate's layout (measured off hearth_plate.png) ----------
const HEARTH = [626, 519];                   // the painted ring of stones (floor rings and light centre here)
const PIT = [628, 513];                      // the hollow inside the ring: the fire sits here
// the front stones of the ring (inner front edge, then the outer front edge back): drawn again OVER the fire's base
const FRONT_STONES = [[577, 514], [584, 519], [600, 526], [612, 530], [628, 530], [643, 528], [660, 523], [676, 517], [683, 511],
  [709, 519], [701, 535], [686, 544], [652, 553], [628, 556], [597, 551], [566, 542], [551, 532], [542, 518]];
const POSTS = [[[466, 370], [538, 366], [542, 548], [460, 548]], [[702, 354], [804, 356], [804, 540], [702, 544]]];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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

// ---------- static live art: the floor rings (the painted posts hide their far side) + the score ----------
function ringArcs(b, cx, cy, rx, ry, n, color, style) {
  const pts = ellipse(cx, cy, rx, ry, n);
  let run = [];
  for (const q of pts) {
    const hidden = q[1] < cy && POSTS.some((p) => inPoly(q[0], q[1], p));
    if (hidden) { if (run.length > 1) b.line(run, color, style); run = []; } else run.push(q);
  }
  if (run.length > 1) b.line(run, color, style);
}
function drawStatic(b) {
  const [hx, hy] = HEARTH;
  ringArcs(b, hx, hy + 3, 158, 60, 160, mul(C.ring, 0.95), { dash: 5, gap: 9, speed: 9 });
  ringArcs(b, hx - 4, hy + 15, 246, 114, 200, mul(C.ring, 0.8), { dash: 12, gap: 10, speed: -6 });
  b.line(arc(hx - 6, hy + 20, 345, 170, 0.05, 1.25, 60), mul(C.ring, 0.55), { dash: 16, gap: 12, speed: 4 });
  b.line(arc(hx - 6, hy + 20, 345, 170, 1.9, 3.05, 60), mul(C.ring, 0.55), { dash: 16, gap: 12, speed: 4 });
  drawDigits(b, '3840', 102, 60, { h: 29, w: 20, pitch: 27, slant: 0.12, gap: 1.6, hollow: false, color: mul(C.score, 1.45),
    style: { dash: 1, gap: 0, width: 1.6 } });
}

/** The waking animal: traced strokes at their painted brightness, the sacred circles as exact arcs, the glints. */
function drawTraced(b, t, stars) {
  const G = C.gold;
  for (const line of t.lines) { const [bright, ...pts] = line; b.line(pts, mul(G, 0.55 + 0.45 * bright)); }
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
  for (const [x, y, len, k] of stars) star(b, x, y, len, mul(C.star, k), 4, 0.1);
}
const BULL_STARS = [[344, 229, 24, 1.0], [415, 136, 5, 0.9], [262, 231, 9, 0.5]];
const DEER_STARS = [[939, 248, 24, 1.0], [1018, 275, 12, 0.65], [1075, 290, 8, 0.5], [948, 128, 4, 0.8]];

// ---------- moving things ----------
function arrowPts(x, y, a, s = 1) {
  const c = Math.cos(a), sn = Math.sin(a);
  const P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
  return { out: [P(28, 0), P(-18, -15), P(-8, 0), P(-18, 15)], fold: [P(28, 0), P(-8, 0)] };
}
function shadePts(x, y, a, s) {
  const c = Math.cos(a), sn = Math.sin(a);
  const P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
  return { tri: [P(1, 0), P(-0.75, -0.8), P(-0.75, 0.8)], o: P(-0.18, 0), inner: [P(0.25, 0), P(-0.45, -0.3), P(-0.45, 0.3)], lw: P(-0.75, -0.8), rw: P(-0.75, 0.8) };
}
function drop(b, x, y, s, col) {
  b.line([[x, y - s * 1.6], [x + s * 0.8, y], ...arc(x, y, s * 0.8, s * 0.8, 0, Math.PI, 8).slice(1), [x, y - s * 1.6]], col);
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

/** The crystal fire: faceted pyramids turned so a ridge faces you, front faces split into a triangle lattice. */
function buildFire() {
  const segs = [], r = mulberry(404), HOT = C.fire;
  const add = (a, b, c, k = 1) => segs.push({ a, b, c, k, w: 1.3 + r() * 5.0, p: r() * 6.28 });
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
    add(base[0], base[1], HOT, k); add(base[1], base[2], HOT, k);
    add(apex, base[0], HOT, k); add(apex, base[1], HOT, k * 1.15); add(apex, base[2], HOT, k);
    add(apex, base[3], HOT, k * 0.3);
    sub(apex, base[0], base[1], level, k * 0.62); sub(apex, base[1], base[2], level, k * 0.62);
  };
  // seated in the pit: bases inside the stones' inner edge (the front ones dip behind the front stones)
  const C7 = [[616, 505, 12, 610, 466, 1, 0.7], [642, 505, 12, 648, 468, 1, 0.7], [606, 512, 18, 598, 450, 1, 0.9],
    [652, 512, 18, 660, 452, 1, 0.9], [629, 513, 34, 629, 410, 2, 1.0], [614, 521, 10, 609, 492, 1, 0.8], [642, 522, 10, 647, 494, 1, 0.8]];
  for (const [bx, by, br, ax, ay, lv, k] of C7) crystal(bx, by, br, ax, ay, lv, k);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, cx = PIT[0], cy = PIT[1] + 5;
    segs.push({ a: [cx, cy], b: [cx + Math.cos(a) * 20, cy + Math.sin(a) * 9], c: [1.4, 0.6, 0.02], c2: [0, 0, 0], k: 1, w: 1 + r() * 3, p: r() * 6 });
  }
  return segs;
}

export function createHearth(kit) {
  const { scene } = kit;

  // ---- layer 1: the plate, lit by the fire ----
  const plate = new THREE.Texture();
  plate.colorSpace = THREE.NoColorSpace;                // raw display values; the shader turns them into light
  plate.minFilter = THREE.LinearMipmapLinearFilter; plate.magFilter = THREE.LinearFilter; plate.generateMipmaps = true;
  const ready = new Promise((resolve, reject) => {
    new THREE.ImageLoader().load(PLATE_URL, (img) => { plate.image = img; plate.needsUpdate = true; resolve(); }, undefined, reject);
  });
  const backdrop = new Backdrop({
    frame: FRAME, map: plate,
    uniforms: { fireC: { value: new THREE.Vector2(...HEARTH) }, fireGain: { value: 1 }, caveGain: { value: 1 } },
    shade: /* glsl */`
      // the painting's display value -> light, so the tube's tone map (1 - e^-x) gives the painting back unchanged
      vec3 x = -log(max(vec3(1.0) - tex.rgb, vec3(0.03)));
      vec2 d = (f - fireC) * vec2(1.0, 1.9);
      float r = length(d);
      float pool = exp(-r * r / (2.0 * 130.0 * 130.0));
      float reach = exp(-r / 220.0);
      float light = caveGain * (1.3 + 0.75 * reach) + fireGain * 1.5 * pool;   // the fire lights the whole cave
      vec3 col = x * light;
      // the two voids the lower shades climb out of (the concept has them; the plate's rock doesn't)
      vec2 v1 = (f - vec2(300.0, 812.0)) / vec2(62.0, 52.0), v2 = (f - vec2(902.0, 808.0)) / vec2(70.0, 50.0);
      col *= 1.0 - 0.6 * (1.0 - smoothstep(0.35, 1.0, length(v1))) - 0.6 * (1.0 - smoothstep(0.35, 1.0, length(v2)));
      col += fireGain * vec3(1.0, 0.36, 0.04) * 0.1 * exp(-r * r / (2.0 * 70.0 * 70.0));   // warm air over the hearth
      return col;`,
  });
  scene.add(backdrop.object);
  // the front stones again, over the fire's base: the same painting, the same firelight, so the fire sits IN the pit
  {
    const tri = THREE.ShapeUtils.triangulateShape(FRONT_STONES.map(([x, y]) => new THREE.Vector2(x, y)), []);
    const pos = [], uv = [];
    for (const t of tri) for (const i of t) { const [x, y] = FRONT_STONES[i]; pos.push(x, -y, 0); uv.push(x / FRAME[0], 1 - y / FRAME[1]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mat = backdrop.material.clone();
    mat.uniforms = backdrop.material.uniforms;          // same light, same flicker
    mat.transparent = true;                             // sorts with the lines, so renderOrder puts it over the fire
    const front = new THREE.Mesh(g, mat);
    front.renderOrder = 4.5; front.frustumCulled = false;
    backdrop.front = front;
    scene.add(front);
  }

  // ---- live layers ----
  const matStatic = kit.track(new GlowLineMaterial({ width: 7.5 }));
  const matBull = kit.track(new GlowLineMaterial({ width: 8.5 }));
  const matDeer = kit.track(new GlowLineMaterial({ width: 8.5 }));
  const matFire = kit.track(new GlowLineMaterial({ width: 8.5, coreGain: 3.0 }));
  const matDyn = kit.track(new GlowLineMaterial({ width: 9 }));
  const sStatic = new LineBatch(matStatic, 1500); drawStatic(sStatic); sStatic.commit();
  const sBull = new LineBatch(matBull, 1400); drawTraced(sBull, TRACED.bull, BULL_STARS); sBull.commit();
  const sDeer = new LineBatch(matDeer, 1400); drawTraced(sDeer, TRACED.deer, DEER_STARS); sDeer.commit();
  const sFire = new LineBatch(matFire, 800);
  const sDyn = new LineBatch(matDyn, 2500);
  const dots = kit.track(new GlowDots(96));
  const embers = kit.track(new EmberField({ count: 170, origin: [PIT[0], PIT[1] - 10], spread: [30, 6], rise: 250, life: [1.6, 3.6],
    size: [1.6, 3.8], young: [1.6, 0.6, 0.12], old: [0.9, 0.12, 0.01], drift: 14, seed: 5 }));
  sStatic.object.renderOrder = 1; sBull.object.renderOrder = 3; sDeer.object.renderOrder = 3; sFire.object.renderOrder = 4; sDyn.object.renderOrder = 12;
  for (const o of [sStatic.object, sBull.object, sDeer.object, sFire.object, sDyn.object]) scene.add(o);
  scene.add(dots.object, embers.object);
  const bullPivot = [330, 240], deerPivot = [1020, 250];
  const fireSegs = buildFire();

  // ---- the player's loop: out to a shard, back to the fire (the concept's path, moved to the plate's hearth) ----
  const oy = HEARTH[1] - 500;
  const playerPath = new Path([[632, 566], [560, 588], [470, 612], [398, 640], [352, 686], [410, 708], [478, 714],
    [540, 706], [592, 676], [624, 640], [638, 604]].map(([x, y]) => [x, y + oy]), 10, true);
  const pickU = playerPath.closest(352, 686 + oy);
  const P_PERIOD = 10.0;
  const heroU = playerPath.closest(622, 642 + oy);
  const easeLeg = (x) => { const y = clamp01((x - 0.06) / 0.88); return y * y * (3 - 2 * y) * 0.6 + y * 0.4; };
  const loopU = (t) => {
    const ph = ((t / P_PERIOD) % 1 + 1) % 1, out = 0.46;
    if (ph < out) return pickU * easeLeg(ph / out);
    return pickU + (1 - pickU) * easeLeg((ph - out) / (1 - out));
  };
  let pOffset = 0;
  { let best = 1e9; for (let k = 0; k < 800; k++) { const tt = (k / 800) * P_PERIOD, d = Math.abs(loopU(tt) - heroU); if (d < best) { best = d; pOffset = tt - HERO_T; } } }
  const playerAt = (t) => playerPath.at(loopU(t + pOffset));
  const carrying = (t) => { const u = loopU(t + pOffset); return u > pickU + 0.002 && u < 0.995; };

  // ---- the shades: out of the plate's three mouths, and up out of the dark rock below ----
  const lanes = [
    { ctrl: [[686, 92], [686, 150], [681, 200], [662, 252], [640, 304]], hero: [681, 200], D: 5.0, C: 7.0, chevrons: true,
      frags: [[0.12, 22, 1.0], [0.22, -4, 0.9], [0.36, -40, 0.8]] },
    { ctrl: [[180, 400], [262, 410], [330, 425], [392, 460], [440, 486]], hero: [330, 425], D: 5.6, C: 8.2, frags: [[0.18, 18, 0.9]] },
    { ctrl: [[70, 566], [124, 570], [176, 578], [250, 594], [330, 606]], hero: [176, 578], D: 5.2, C: 7.6,
      frags: [[0.12, 22, 0.9], [0.06, 44, 0.8], [0.2, 52, 0.7]] },
    { ctrl: [[292, 846], [332, 806], [395, 766], [452, 728], [505, 700]], hero: [395, 766], D: 5.0, C: 8.6, frags: [[0.15, -26, 0.9]] },
    { ctrl: [[1172, 556], [1118, 552], [1068, 546], [1010, 534], [965, 524], [900, 514], [840, 510]], hero: [1068, 546], D: 7.4, C: 9.0,
      frags: [[0.08, -40, 0.9], [0.1, 22, 0.8]], twin: 0.3 },
    { ctrl: [[962, 852], [884, 798], [842, 762], [786, 730], [742, 696], [702, 668]], hero: [786, 730], D: 5.6, C: 8.0,
      frags: [[0.1, 34, 0.9], [0.05, 70, 0.8], [0.02, -55, 0.7]] },
  ].map((L) => { const path = new Path(L.ctrl, 10); return { ...L, path, phase: path.closest(...L.hero) * L.D - HERO_T }; });

  const glyphs = [[588, 5.2, 0.1], [640, 4.6, 0.55], [576, 6.0, 0.3], [604, 4.2, 0.8], [668, 5.6, 0.2], [650, 6.4, 0.7], [620, 5.0, 0.45]];

  // waking: rises over 10 s, holds, settles over 8 s, rests (30 s cycle); phased so both are awake at HERO_T
  const wakeCurve = (c) => smooth(0, 10, c) * (1 - smooth(16, 24, c));
  const wakeAt = (t, lead) => wakeCurve((((t - HERO_T + lead) % 30) + 30) % 30);

  function update(t, dt = 1 / 60) {
    const flick = fireFlicker(t);
    const ph = (((t + pOffset) / P_PERIOD) % 1 + 1) % 1;
    const feed = 0.1 * smooth(0.0, 0.05, ph) * (1 - smooth(0.05, 0.35, ph));   // a shard lands: one slow swell
    const fireK = flick + feed;
    backdrop.uniforms.fireGain.value = fireK;
    backdrop.uniforms.caveGain.value = 1 + 0.3 * (fireK - 1);                 // the far cave barely follows the flicker
    matStatic.time = t;
    matFire.gain = fireK;
    embers.update(t); embers.gain = fireK;

    // the animals wake over the painting (gain 0 = only the plate shows) with a subtle breath while awake
    const wb = wakeAt(t, 12), wd = wakeAt(t, 10);
    matBull.gain = wb * (0.78 + 0.03 * Math.sin(t * 1.5));
    matDeer.gain = wd * (0.74 + 0.03 * Math.sin(t * 1.3 + 1));
    sBull.object.visible = wb > 0.002; sDeer.object.visible = wd > 0.002;
    for (const [o, w, pv] of [[sBull.object, wb, bullPivot], [sDeer.object, wd, deerPivot]]) {
      const s = 1 + 0.005 * w * Math.sin(t * 1.5);
      o.scale.set(s, s, 1); o.position.set(pv[0] * (1 - s), -pv[1] * (1 - s), 0);
    }

    // fire: per-line shimmer, slow and small
    sFire.clear();
    for (const f of fireSegs) {
      const k = f.k * (1 + 0.1 * Math.sin(t * f.w + f.p));
      sFire.seg(f.a[0], f.a[1], f.b[0], f.b[1], mul(f.c, k), mul(f.c2 ?? f.c, k));
    }
    sFire.commit();

    sDyn.clear(); dots.clear();
    const [hx, hy] = HEARTH;
    dots.add(PIT[0], PIT[1] - 16, 32, mul([0.55, 0.14, 0.01], fireK));
    dots.add(PIT[0], PIT[1] - 40, 120, mul([0.1, 0.025, 0.002], fireK));
    dots.add(PIT[0], PIT[1] - 2, 11, mul([1.2, 0.45, 0.07], fireK));
    for (const [x0, per, off] of glyphs) {
      const q = (((t / per) + off) % 1 + 1) % 1;
      const a = smooth(0, 0.15, q) * (1 - smooth(0.6, 1, q));
      if (a > 0.01) drop(sDyn, x0 + Math.sin(t * 0.9 + off * 9) * 6, PIT[1] - 62 - q * 185, 3.2, mul(C.fire, 0.75 * a));
    }

    // player + trail + speed lines + shard
    const [px, py, pa] = playerAt(t);
    const trail = [];
    for (let k = 0; k <= 34; k++) { const p = playerAt(t - k * 0.06); trail.push([p[0], p[1]]); }
    const back = [px - Math.cos(pa) * 20, py - Math.sin(pa) * 20];
    trail[0] = back;
    drawTrail(sDyn, trail, mul(C.player, 1.15), { dash: 10, gap: 7 });
    for (const side of [-1, 0, 1]) {
      const nx = -Math.sin(pa) * side * 9, ny = Math.cos(pa) * side * 9, l0 = 16 + Math.abs(side) * 6, l1 = l0 + 16;
      sDyn.line([[back[0] - Math.cos(pa) * l0 + nx, back[1] - Math.sin(pa) * l0 + ny], [back[0] - Math.cos(pa) * l1 + nx, back[1] - Math.sin(pa) * l1 + ny]],
        mul(C.player, side === 0 ? 0.45 : 0.55), undefined, [0, 0, 0]);
    }
    const ar = arrowPts(px, py, pa, 1.3);
    sDyn.loop(ar.out, C.player); sDyn.line(ar.fold, mul(C.player, 0.6));
    dots.add(px, py, 22, [0.22, 0.06, 0.008]);
    const pick = playerPath.at(pickU), u = loopU(t + pOffset);
    if (carrying(t)) shard(sDyn, dots, px + Math.cos(pa) * 36 + 12, py + Math.sin(pa) * 36 - 14, 1);
    else if (u < pickU) shard(sDyn, dots, pick[0] - 10, pick[1] - 16, smooth(0.05, 0.4, u / pickU));
    if (ph < 0.06) {
      const q = ph / 0.06, sx = 648 + (hx - 648) * q, sy = (560 + oy) + ((hy - 20) - (560 + oy)) * q - Math.sin(q * Math.PI) * 30;
      shard(sDyn, dots, sx, sy, 1 - q * 0.8);
    }

    // shades
    for (const L of lanes) {
      for (const lag of (L.twin ? [0, L.twin] : [0])) {
        const lt = (((t + L.phase - lag * L.D) % L.C) + L.C) % L.C;
        if (lt > L.D) continue;
        const uu = lt / L.D, alpha = smooth(0, 0.16, uu) * (1 - smooth(0.78, 1, uu));
        if (alpha < 0.01) continue;
        const [x, y, a] = L.path.at(uu), col = mul(C.red, alpha), sp = shadePts(x, y, a, 25);
        for (const w of [-1, 1]) {
          const pts = [];
          for (let k = 0; k <= 12; k++) {
            const v = uu - k * 0.022; if (v < 0) break;
            const [qx, qy, qa] = L.path.at(v);
            pts.push([qx - Math.cos(qa) * 18 - Math.sin(qa) * w * 14, qy - Math.sin(qa) * 18 + Math.cos(qa) * w * 14]);
          }
          drawTrail(sDyn, pts, mul(C.red, 0.75 * alpha), { dash: 3, gap: 6 });
        }
        if (L.chevrons) for (let k = 1; k <= 7; k++) {        // a column of chevrons back up the tunnel
          const v = uu - k * 0.028; if (v < 0) break;
          const [qx, qy, qa] = L.path.at(v), f = alpha * (1 - k / 8), cs = Math.cos(qa), sn = Math.sin(qa), w = 5.5;
          const tip = [qx - cs * 27, qy - sn * 27];
          sDyn.line([[tip[0] - cs * 6 - sn * w, tip[1] - sn * 6 + cs * w], tip, [tip[0] - cs * 6 + sn * w, tip[1] - sn * 6 - cs * w]], mul([1.3, 0.3, 0.012], 0.8 * f));
        }
        sDyn.loop(sp.tri, col);
        sDyn.line([sp.tri[0], sp.o], mul(col, 0.75)); sDyn.line([sp.lw, sp.o], mul(col, 0.75)); sDyn.line([sp.rw, sp.o], mul(col, 0.75));
        sDyn.loop(sp.inner, mul(col, 0.8));
        dots.add(x, y, 22, mul([0.07, 0.003, 0.001], alpha));
        if (lag === 0) for (const [du, lat, k] of L.frags) {
          const v = uu - du; if (v < 0.02) continue;
          const [fx, fy, fa] = L.path.at(v), fal = smooth(0.02, 0.12, v) * alpha;
          sDyn.loop(polygon(fx - Math.sin(fa) * lat, fy + Math.cos(fa) * lat, 7.5, 3, fa + Math.PI), mul(C.red, k * fal));
          const tp = [];
          for (let j = 0; j <= 5; j++) { const vv = v - j * 0.02; if (vv < 0) break; const [qx, qy, qa] = L.path.at(vv); tp.push([qx - Math.sin(qa) * lat, qy + Math.cos(qa) * lat]); }
          drawTrail(sDyn, tp, mul(C.red, 0.45 * k * fal), { dash: 2.5, gap: 6 });
        }
      }
    }
    sDyn.commit(); dots.commit();
  }

  return { ready, update, backdrop, lanes, playerPath, materials: { matStatic, matBull, matDeer, matFire, matDyn },
    batches: { sStatic, sBull, sDeer, sFire, sDyn } };
}
