// THE NODE · THE CONSTELLATION (cabinet level 2) · THE SKY'S LAYOUT, traced off assets/looktest/constellation_plate.png
// (tools/constellation_trace.py -> plate_traced.js). Pure data + geometry: shared by the sim (headless, Node-safe), the
// bots and the view. Coordinates are the plate's pixels (1266 x 952), x right, y DOWN.
//
//   STARS    the seven lights on the ground: six gold bases and the temple in the middle (index 3). Each: x, tip (where a
//            shot leaves / where a shape aims), foot (its span on the ground line), box (its painted area)
//   BASES    the six that shoot; GROUPS the three "silos" (left, middle, right pairs), as Missile Command had three
//   STROKES  the sacred figure in the sky, cut into the pieces that light in gold: { id, wave, tie, parts, glint? }
//            wave = which cleared wave lights it (0..3; 3 = the crown, lit when the last wave is cleared)
//            tie  = the star it hangs from: while that star is dark, the stroke can't light (and a lit one breaks)
//            parts = polylines, each starting at the end nearest its star (it draws outward from there)
import { TRACED } from './plate_traced.js';

export const FRAME = TRACED.frame;                       // [1266, 952]
export const GROUND_Y = TRACED.groundY;                  // the painted gold ground line
export const HORIZON_Y = 668;

// ---------------- the stars, built clean ----------------
// Never the raw trace (it reads as shaky squiggles). tools/constellation_trace.py MEASURES each painted star (mast, diamond
// finial, apex, corners, base line); these templates build it from those numbers as clean vector geometry: straight
// segments, exact angles, mirror-perfect about the mast. Returns [{ pts, k }] (k = brightness: frame 1, struts ~0.7).
const STRUT = 0.72;
function buildStar(p) {
  const out = [], { cx, apexY: ay, cornerHw: hw, cornerY: cy, baseY: by } = p;
  const P = (pts, k = 1) => out.push({ pts, k });
  const side = (s, f) => [cx + s * hw * f, ay + (cy - ay) * f];      // a point f of the way down one side (s = -1 / +1)
  const hwAt = (y) => hw * (y - ay) / (cy - ay);                      // the body's half-width at height y
  const diamond = (d, k = 1) => P([[cx, d.cy - d.hh], [cx + d.hw, d.cy], [cx, d.cy + d.hh], [cx - d.hw, d.cy], [cx, d.cy - d.hh]], k);
  const body = () => {
    P([[cx - hw, cy], [cx, ay], [cx + hw, cy]]);
    if (by - cy > 1) { P([[cx - hw, cy], [cx - hw, by]]); P([[cx + hw, cy], [cx + hw, by]]); }
    P([[cx - hw, by], [cx + hw, by]]);
  };
  if (p.kind === 'spire' || p.kind === 'spireW') {
    const d = p.diamond;
    P([[cx, p.mastTop], [cx, d.cy - d.hh]]);
    diamond(d);
    P([[cx, d.cy - d.hh], [cx, d.cy + d.hh]], STRUT);                  // the mast runs on through the diamond
    body();
    for (const s of [-1, 1]) {                                          // the lattice, mirrored
      const a = side(s, 0.5), b = side(s, 0.78);
      P([a, [a[0], by]], STRUT);
      P([b, [b[0], by]], STRUT);
    }
    if (p.kind === 'spire') {
      P([[cx, d.cy + d.hh], [cx, by]]);                                 // the mast down to the ground
      for (const s of [-1, 1]) { const a = side(s, 0.5); P([a, [cx + s * hw * 0.08, by]], STRUT); }   // braces to its foot
    } else {
      P([[cx, d.cy + d.hh], [cx, ay]]);
      P([side(-1, 0.5), [cx, by], side(1, 0.5)], STRUT);                // an inverted V under the apex
      P([[cx - d.hw * 1.25, d.cy], [cx + d.hw * 1.25, d.cy]], STRUT);   // the crossbar through the finial
    }
  } else if (p.kind === 'tent') {
    P([[cx, p.mastTop], [cx, ay]]);
    body();
    const y1 = ay + (cy - ay) * 0.3;
    P([[cx - hwAt(y1), y1], [cx + hwAt(y1), y1]], STRUT);               // the crossbar under the apex
    const l = side(-1, 0.65), r = side(1, 0.65);
    P([l, [cx, by], r], STRUT);                                         // the inverted V
    P([l, [l[0], by]], STRUT); P([r, [r[0], by]], STRUT);               // its legs
  } else {                                                              // THE TEMPLE
    const d = p.diamond, lintel = cy - 4, gable = ay + (cy - ay) * 0.36, colO = hw * 0.745, colI = hw * 0.46;
    const doorHw = hw * 0.2, doorSpring = by - 22;
    P([[cx, p.mastTop], [cx, d.cy - d.hh]]);
    diamond(d);
    P([[cx, d.cy - d.hh], [cx, ay]], STRUT);                            // the mast down to the roof's peak
    P([[cx - hw, cy], [cx, ay], [cx + hw, cy]]);                        // the roof, 45 degrees
    P([[cx - hwAt(lintel), lintel], [cx + hwAt(lintel), lintel]]);      // the lintel under the eaves
    for (const s of [-1, 1]) {
      P([[cx + s * colO, lintel], [cx + s * colO, by]]);                // the columns
      P([[cx + s * colI, lintel], [cx + s * colI, by]]);
      P([[cx + s * colO, lintel + 8], [cx + s * colI, lintel + 24]], STRUT);   // a brace between each pair
    }
    P([[cx - colI, lintel], [cx, gable], [cx + colI, lintel]], STRUT);  // the inner gable over the door
    P([[cx, gable], [cx, doorSpring - doorHw]], STRUT);                 // the axis down to the door's crown
    const arch = [[cx - doorHw, by], [cx - doorHw, doorSpring]];        // the door: straight jambs, a true half circle
    for (let i = 1; i <= 16; i++) { const a = Math.PI + i / 16 * Math.PI; arch.push([cx + Math.cos(a) * doorHw, doorSpring + Math.sin(a) * doorHw]); }
    arch.push([cx + doorHw, by]);
    P(arch);
    P([[cx - hw, by], [cx + hw, by]]);                                  // the base line
  }
  return out;
}

export const STAR_IDS = ['b0', 'b1', 'b2', 'temple', 'b3', 'b4', 'b5'];
export const TEMPLE = 3;
export const STARS = STAR_IDS.map((id, i) => {
  const s = TRACED.stars[id];
  return { i, id, temple: id === 'temple', x: s.shape.cx, tip: [s.shape.cx, s.shape.mastTop], top: s.top, foot: s.foot, box: s.box,
    shape: s.shape, lines: buildStar(s.shape) };
});
export const BASES = [0, 1, 2, 4, 5, 6];
export const GROUPS = [[0, 1], [2, 4], [5, 6]];          // the three silos: left, middle, right
export const GROUP_OF = [0, 0, 1, -1, 1, 2, 2];

/** Where the crosshair may go: the sky above the ground, below the top band where the shapes come in (so the fight
 *  happens mid-sky, as Missile Command's does, not at the very edge where they appear). */
export const SKY = { x0: 46, y0: 190, x1: 1220, y1: 705 };
/** Where the shapes come in: just above the top of the glass. */
export const SPAWN = { y: 22, x0: 70, x1: 1196 };
/** Where a falling shape hits a star (its aim point, a little under the tip). */
export function aimPoint(star, jitter = 0) { return [star.x + jitter, star.temple ? star.top + 34 : star.top + 22]; }

// ---------------- the figure ----------------
const F = TRACED.figure;
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const lineOf = (k) => { const l = F.lines[k]; return [[l[0], l[1]], [l[2], l[3]]]; };
function circlePts(k, a0, a1, step = 0.035) {
  const [cx, cy, r] = F.circles[k], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
/** The polyline between x = xa and x = xb (for curves that run left to right), cut exactly at both ends. */
function clipX(pts, xa, xb) {
  const lo = Math.min(xa, xb), hi = Math.max(xa, xb), out = [];
  const at = (p, q, x) => { const u = (x - p[0]) / (q[0] - p[0]); return [x, p[1] + (q[1] - p[1]) * u]; };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p[0] >= lo && p[0] <= hi) out.push(p);
    const q = pts[i + 1]; if (!q) break;
    for (const x of [lo, hi]) if ((p[0] - x) * (q[0] - x) < 0) out.push(at(p, q, x));
  }
  out.sort((a, b) => a[0] - b[0]);
  return xa <= xb ? out : out.reverse();
}
const orient = (pts, from) => (d2(pts[pts.length - 1], from) < d2(pts[0], from) ? [...pts].reverse() : pts);

function buildStrokes() {
  const S = [], tip = (i) => STARS[i].tip;
  const add = (id, wave, tie, parts, extra = {}) => S.push({ id, wave, tie, parts: parts.map((p) => orient(p, tip(tie))), ...extra });
  // wave 0 · THE GROUND: the horizon, cut between the stars (each piece drawn out from its own star), the small arch
  const hz = F.curves.horizon, xs = STARS.map((s) => s.x);
  const cuts = [hz[0][0], ...xs.slice(1).map((x, i) => (x + xs[i]) / 2), hz[hz.length - 1][0]];
  STARS.forEach((s, i) => add('horizon' + i, 0, i, [clipX(hz, s.x, cuts[i]), clipX(hz, s.x, cuts[i + 1])].filter((p) => p.length > 1)));
  const [, , , arcsS] = F.circles.archSmall, [a0s, a1s] = arcsS[0];
  add('archSmallL', 0, 2, [circlePts('archSmall', a0s, 1.5 * Math.PI)]);
  add('archSmallR', 0, 4, [circlePts('archSmall', a1s, 1.5 * Math.PI)]);
  // wave 1 · THE ARCHES: the great arch, the vesica sides, the posts, the lintel, the axis up to the middle star
  const ab = F.curves.archBig, abTop = ab.reduce((m, p) => (p[1] < m[1] ? p : m), ab[0]);
  add('archBigL', 1, 1, [clipX(ab, ab[0][0], abTop[0])]);
  add('archBigR', 1, 5, [clipX(ab, ab[ab.length - 1][0], abTop[0])]);
  add('vesL', 1, 2, [F.curves.vesL]);
  add('vesR', 1, 4, [F.curves.vesR]);
  add('v368', 1, 1, [lineOf('v368')]);
  add('v897', 1, 5, [lineOf('v897')]);
  const h548 = lineOf('h548'), mid548 = [(h548[0][0] + h548[1][0]) / 2, (h548[0][1] + h548[1][1]) / 2];
  add('h548', 1, TEMPLE, [[mid548, h548[0]], [mid548, h548[1]]]);
  const ax = lineOf('axis'), gm = F.glints.mid, gt = F.glints.top;
  const axBottom = ax[0][1] > ax[1][1] ? ax[0] : ax[1], axTop = ax[0][1] > ax[1][1] ? ax[1] : ax[0];
  const axAt = (y) => [axBottom[0] + (axTop[0] - axBottom[0]) * (y - axBottom[1]) / (axTop[1] - axBottom[1]), y];
  add('axisLow', 1, TEMPLE, [[axBottom, axAt(gm[1])]]);
  add('glintMid', 1, TEMPLE, [[axAt(gm[1] + 1), axAt(gm[1] - 1)]], { glint: gm });
  // wave 2 · THE RAYS: the great triangle's sides, the side beams, the tall posts
  add('triL', 2, 0, [lineOf('triL')]);
  add('triR', 2, 6, [lineOf('triR')]);
  add('h338L', 2, 0, [lineOf('h338L')]);
  add('h338R', 2, 6, [lineOf('h338R')]);
  add('v405', 2, 1, [F.curves.v405]);
  add('v852', 2, 5, [F.curves.v852]);
  // wave 3 · THE CROWN (the last wave cleared): the circle from its foot up both sides, its bar, the axis to the apex
  // (the painting leaves the top of the circle faint; lit, the two halves close it at the top)
  add('crownL', 3, 2, [circlePts('crown', Math.PI / 2, 1.5 * Math.PI)]);
  add('crownR', 3, 4, [circlePts('crown', Math.PI / 2, -0.5 * Math.PI)]);
  const h237 = lineOf('h237'), mid237 = [(h237[0][0] + h237[1][0]) / 2, (h237[0][1] + h237[1][1]) / 2];
  add('h237', 3, TEMPLE, [[mid237, h237[0]], [mid237, h237[1]]]);
  add('axisUp', 3, TEMPLE, [[axAt(gm[1]), axTop]]);
  add('glintTop', 3, TEMPLE, [[axAt(gt[1] + 1), axAt(gt[1] - 1)]], { glint: gt });
  return S;
}
export const STROKES = buildStrokes();
export const WAVE_STROKES = [0, 1, 2, 3].map((w) => STROKES.filter((s) => s.wave === w).map((s) => STROKES.indexOf(s)));

/** Polyline length. */
export function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
