// THE NODE · THE RESONANCE (cabinet level 5) · THE FIELD'S LAYOUT, built from numbers MEASURED off the empty plate
// (tools/resonance_measure.py -> plate_measured.js; nothing here is a raw trace). Pure data + geometry: shared by the round
// (headless, Node-safe), the bots and the view. Coordinates are the plate's pixels (1266 x 952), x right, y DOWN.
//
//   GLASS           the lit tube face [x0, y0, x1, y1]; glassTopAt(x), glassLeftAt(y), glassRightAt(y): its curved edges
//   GROUND          the painted ground curve as a TRUE circle (centre, radius; fit residual 0.8 px median): groundY(x)
//   EMITTER         the player's cannon, built clean (the concept's proportions): a triangle on the ground, a collar, a
//                   barrel, a small ring and its spokes; the range it slides along the ground; the barrel's tip (pulses
//                   leave from there); emitterContains(ex, px, py) = what a shard can strike
//   KITE            the red shapes: kitePts(x, y, h) (top, right, bottom, left; (x, y) = where the cross's bar meets the spine),
//                   kiteContains(x, y, h, px, py, margin), kiteBottomAt(x, y, h, px) (where a pulse rising at px meets it)
//   WAVE            the wave's fixed geometry (centre line, wavelength) and crestOffset(phase, x): signed px from x to the
//                   nearest crest (a crest is where y = y0 - A: sin(k x - phase) = 1)
import { MEASURED } from './plate_measured.js';
import { TUNE } from './spec.js';

export const FRAME = MEASURED.frame;                  // [1266, 952]
export const GLASS = MEASURED.glass;                  // [36, 16, 1227, 928]
export const CX = (GLASS[0] + GLASS[2]) / 2;          // the glass's middle (x)

const table = (o) => Object.entries(o).map(([k, v]) => [+k, v]).filter(([, v]) => v != null).sort((a, b) => a[0] - b[0]);
const lerpTable = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; return va + (vb - va) * (x - a) / (b - a); }
  return T[T.length - 1][1];
};
// the top edge: the plate's far-right corner sample (1200: 120) is the bezel's corner, not the edge: extrapolate past 1160
const TOP = table(MEASURED.glassTop).filter(([x]) => x <= 1160);
const LEFT = table(MEASURED.glassLeft), RIGHT = table(MEASURED.glassRight);
export function glassTopAt(x) {
  if (x > 1160) { const [a, va] = TOP[TOP.length - 2], [b, vb] = TOP[TOP.length - 1]; return vb + (vb - va) * (x - b) / (b - a); }
  return lerpTable(TOP, x);
}
export const glassLeftAt = (y) => lerpTable(LEFT, y);
export const glassRightAt = (y) => lerpTable(RIGHT, y);

// ---- the ground: the painted curve, as the true circle it was measured to be ----
export const GROUND = Object.freeze({ cx: MEASURED.ground.cx, cy: MEASURED.ground.cy, r: MEASURED.ground.r });
export function groundY(x) { const d = x - GROUND.cx; return GROUND.cy + Math.sqrt(GROUND.r * GROUND.r - d * d); }
/** Points along the ground circle from x0 to x1 (clean: the circle itself, sampled). */
export function groundPts(x0, x1, n = 48) { const out = []; for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; out.push([x, groundY(x)]); } return out; }

// ---- the emitter (the concept's cannon, measured off the concept at its hero position, built clean) ----
// local frame: origin = the middle of its base on the ground, y up is NEGATIVE (screen y down)
export const EMITTER = Object.freeze({
  x0: 128, x1: 1134,                          // how far it slides (its base stays inside the glass's lit face)
  base: 36.5,                                 // the triangle's half-base
  apex: 62,                                   // the triangle's sides rise to the collar's foot
  collar: { foot: 7.5, top: 66.5, half: 14 }, // the small V collar under the barrel
  barrel: { half: 4, top: 123 },              // the barrel (a slim capsule) up to its tip: pulses leave from here
  ring: { y: 23, r: 9.5 },                    // the small ring inside the triangle
  arcs: [79, 106],                            // its two dashed half-rings (live, they move with it)
});
export const TIP = EMITTER.barrel.top + 2;     // pulses start this far above the ground
/** Can a point strike the emitter standing at ex? (the triangle, the collar and the barrel, a little generous) */
export function emitterContains(ex, px, py, m = 4) {
  const gy = groundY(ex), h = gy - py, dx = Math.abs(px - ex);
  if (h < -m || h > EMITTER.barrel.top + m) return false;
  if (h <= EMITTER.collar.top) return dx <= EMITTER.base * (1 - Math.max(0, h) / (EMITTER.collar.top + 8)) + m + 2;
  return dx <= EMITTER.barrel.half + m;
}

// ---- the kites ----
export const KITE = Object.freeze({ half: 0.335, up: 0.37 });   // half-width / height; the bar sits 0.37 of the way down
export function kiteDims(h) { return { hw: KITE.half * h, a: KITE.up * h, b: (1 - KITE.up) * h }; }
export function kitePts(x, y, h) { const { hw, a, b } = kiteDims(h); return [[x, y - a], [x + hw, y], [x, y + b], [x - hw, y]]; }
export function kiteContains(x, y, h, px, py, m = 3) {
  const { hw, a, b } = kiteDims(h), dx = Math.abs(px - x);
  if (py < y) { const u = (py - (y - a - m)) / (a + m); return u >= 0 && dx <= (hw + m) * u; }
  const u = ((y + b + m) - py) / (b + m); return u >= 0 && dx <= (hw + m) * u;
}
/** Where a pulse rising at px first meets the kite's lower edges (null if it passes beside it). */
export function kiteBottomAt(x, y, h, px, m = 3) {
  const { hw, b } = kiteDims(h), dx = Math.abs(px - x);
  if (dx > hw + m) return null;
  return y + (b + m) * (1 - dx / (hw + m));
}

// ---- the wave ----
export const WAVE = Object.freeze({
  y0: TUNE.wave.y0, k: (2 * Math.PI) / TUNE.wave.lambda,
  x0: glassLeftAt(TUNE.wave.y0) + 1, x1: glassRightAt(TUNE.wave.y0) - 1,
});
const TAU = Math.PI * 2;
/** Signed px from the nearest crest to x (> 0: x is to the RIGHT of that crest). */
export function crestOffset(phase, x) {
  let d = (WAVE.k * x - phase - Math.PI / 2) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d / WAVE.k;
}
/** The crests' x on the glass (plus one beyond each side) for a phase. */
export function crestsAt(phase, x0 = WAVE.x0 - 60, x1 = WAVE.x1 + 60, crest = true) {
  const out = [], lam = TAU / WAVE.k, off = crest ? Math.PI / 2 : -Math.PI / 2;
  let x = (phase + off) / WAVE.k;
  x -= Math.ceil((x - x0) / lam) * lam;
  for (; x <= x1; x += lam) if (x >= x0) out.push(x);
  return out;
}
export const waveY = (phase, A, x) => WAVE.y0 - A * Math.sin(WAVE.k * x - phase);

// ---- the opening formation: two loose ranks (sizes and slots; the round jitters them per seed) ----
export const FORMATION = Object.freeze([
  { size: 'M', x: 190, y: 178 }, { size: 'L', x: 330, y: 150 }, { size: 'S', x: 470, y: 250 }, { size: 'M', x: 590, y: 190 },
  { size: 'L', x: 745, y: 140 }, { size: 'S', x: 900, y: 262 }, { size: 'L', x: 1060, y: 170 },
]);
export const PLAY_X = Object.freeze([EMITTER.x0 + 22, EMITTER.x1 - 22]);   // where shapes hang (the emitter can reach under all)
