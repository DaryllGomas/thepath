// THE NODE · THE BEACON (cabinet level 3) · THE FIELD'S LAYOUT, built from numbers MEASURED off the empty plate
// (tools/beacon_measure.py -> plate_measured.js; nothing here is a raw trace). Pure data + geometry: shared by the round
// (headless, Node-safe), the bots and the view. Coordinates are the plate's pixels (1266 x 952), x right, y DOWN.
//
//   CENTRE        where the painted crosshair lines cross: the core
//   RINGS         the three shield rings, inner -> outer, each an ellipse sitting on its painted guide circle (the plate
//                 carries the tube's slight horizontal stretch: sy = ry / rx). Angles are "ring angles": measured in the
//                 ring's own round space (u = x - cx, v = (y - cy) / sy), radians, increasing CLOCKWISE on screen (y down)
//   FIGURE        the core's sacred figure (the small circle, the figure circle, the eight rays) and the parts of the
//                 greater figure each lighting draws outward to the guide circles
//   WRAP          the playfield rectangle the ship and the shots wrap around (inside the plate's lit glass)
//   SPAWNS        where a ship comes in (outside the rings, facing the core)
//
//   ringLocal(i, x, y) -> { r, a }       ringPoint(i, r, a) -> [x, y]       segSpan(i) (half-angle of a segment)
//   capsule(i, a0, a1, o)                a rounded shield bent along ring i (clean built geometry), screen points
import { MEASURED } from './plate_measured.js';

export const FRAME = MEASURED.frame;                          // [1266, 952]
export const CENTRE = MEASURED.centre;                        // [660.45, 442.91]
const M = MEASURED.circles;

// The outer guide circle is painted ~6 px left of the crosshair centre (the painting's own wobble); the rings share ONE
// true centre (they turn about the core), so the outer ring sits within 7 px of its paint (inside its 23-px band).
const ringDef = (name, n, h, dir) => ({ name, R: M[name].rx, sy: M[name].ry / M[name].rx, n, h, dir });
export const RINGS = [
  ringDef('inner', 8, 10.5, 1),         // the concept's eight long inner shields
  ringDef('middle', 12, 11, -1),        // turns the other way
  ringDef('outer', 14, 11.5, 1),
];
export const SEG_GAP = 24;              // px between neighbouring shields along the ring (the concept's open seams)
export const CORNER = 3.5;              // px: the capsule's corner radius (the concept's ends are nearly square)

export const CORE = { r: 30 };          // the core's hit radius (the bright heart inside the small circle)
export const FIG = {
  small: (M.core.rx + M.core.ry) / 2,   // the painted small circle (r ~45)
  circle: { R: M.figure.rx, sy: M.figure.ry / M.figure.rx },   // the painted figure circle (r ~147)
};

const g = MEASURED.glass;
export const WRAP = { x0: g[0] + 20, y0: g[1] + 14, x1: g[2] - 18, y1: Math.min(g[3], FRAME[1]) - 28 };
export const SPAWNS = [[232, 766], [1090, 766], [214, 128], [1108, 128]];   // bottom-left first (the concept's ship)

const TAU = Math.PI * 2;
export const wrapAngle = (a) => { a %= TAU; return a < -Math.PI ? a + TAU : a > Math.PI ? a - TAU : a; };

/** A point in ring i's round space: its radius and ring angle (clockwise on screen). i may be a ring or { R, sy }. */
export function ringLocal(i, x, y) {
  const sy = (typeof i === 'number' ? RINGS[i].sy : i.sy);
  const u = x - CENTRE[0], v = (y - CENTRE[1]) / sy;
  return { r: Math.hypot(u, v), a: Math.atan2(v, u) };
}
export function ringPoint(i, r, a) {
  const sy = (typeof i === 'number' ? RINGS[i].sy : i.sy);
  return [CENTRE[0] + Math.cos(a) * r, CENTRE[1] + Math.sin(a) * r * sy];
}
/** Half the angle one shield covers (its slot minus the gap). */
export function segSpan(i) { const R = RINGS[i]; return Math.PI / R.n - SEG_GAP / 2 / R.R; }
/** The centre angle of shield j of ring i at rotation rot. */
export function segAngle(i, j, rot) { return rot + (j + 0.5) * TAU / RINGS[i].n; }
/** Which shield slot of ring i the ring angle a falls in, and how far from that shield's centre (radians). */
export function slotAt(i, a, rot) {
  const n = RINGS[i].n, w = TAU / n;
  let u = (a - rot) % TAU; if (u < 0) u += TAU;
  const j = Math.min(n - 1, Math.floor(u / w));
  return { j, off: u - (j + 0.5) * w };
}

/** A shield: a rounded capsule bent along ring i, from ring angle a0 to a1 (radial half-thickness o.h, default the ring's).
 *  Built in (s = arc length along the centre line, t = radial offset) and mapped onto the ellipse: true arcs, straight
 *  radial ends, quarter-circle corners. A closed loop of screen points (last != first). */
export function capsule(i, a0, a1, o = {}) {
  const ring = RINGS[i], R = ring.R, h = o.h ?? ring.h, rc = Math.min(o.corner ?? CORNER, h * 0.95);
  const L = (a1 - a0) * R;
  if (L <= 2 * rc + 0.5) return [];
  const step = o.arcStep ?? 0.03, sy = ring.sy;
  const P = (s, t) => { const a = a0 + s / R, r = R + t; return [CENTRE[0] + Math.cos(a) * r, CENTRE[1] + Math.sin(a) * r * sy]; };
  const out = [];
  const arcPts = (t, s0, s1) => { const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / (R + t) / step)); for (let k = 0; k <= n; k++) out.push(P(s0 + (s1 - s0) * k / n, t)); };
  const quarter = (cs, ct, q0, q1) => { for (let k = 1; k < 5; k++) { const q = q0 + (q1 - q0) * k / 5; out.push(P(cs + Math.cos(q) * rc, ct + Math.sin(q) * rc)); } };
  arcPts(h, rc, L - rc);                                 // outer edge, a0 -> a1
  quarter(L - rc, h - rc, Math.PI / 2, 0);               // corner down to the a1 end
  out.push(P(L, h - rc)); out.push(P(L, -h + rc));       // the a1 radial end (straight)
  quarter(L - rc, -h + rc, 0, -Math.PI / 2);
  arcPts(-h, L - rc, rc);                                // inner edge, a1 -> a0
  quarter(rc, -h + rc, -Math.PI / 2, -Math.PI);
  out.push(P(0, -h + rc)); out.push(P(0, h - rc));       // the a0 radial end
  quarter(rc, h - rc, Math.PI, Math.PI / 2);
  return out;
}

// ---------------- the sacred figure ----------------
// The eight rays: the painted crosshair axes and the diagonals, built exact (45 degrees in the rings' round space; the
// painting's own diagonals wander 40.9-48.8 degrees, measured, and are straightened here).
export const RAYS8 = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => k * Math.PI / 4);
export const RAYS16 = RAYS8.map((a) => a + Math.PI / 8);

/** An ellipse ring (R, sy) as screen points, from ring angle a0 to a1. */
export function ellipseArc(R, sy, a0, a1, step = 0.03) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([CENTRE[0] + Math.cos(a) * R, CENTRE[1] + Math.sin(a) * R * sy]); }
  return out;
}
const onEllipse = (R, sy, a) => [CENTRE[0] + Math.cos(a) * R, CENTRE[1] + Math.sin(a) * R * sy];
const guide = (k) => (k === 0 ? FIG.circle : RINGS[k - 1]);   // guide circle 0 = the figure circle, 1..3 = the rings

/** What each lighting draws, outward from the core: { stage, parts: [polylines], kind: 'ray' | 'circle' | 'star', delay }.
 *  Stage 1: the eight rays run out from the figure circle to the inner ring's guide circle, which then lights around.
 *  Stage 2: the rays run on to the middle guide; eight half-rays join them; the middle circle lights.
 *  Stage 3: the rays reach the outer guide; its circle lights; the eight-pointed star {8/3} closes the figure. */
function buildLitFigure() {
  const S = [];
  const ray = (stage, a, k0, k1, delay) => {
    const g0 = guide(k0), g1 = guide(k1);
    S.push({ stage, kind: 'ray', delay, parts: [[onEllipse(g0.R, g0.sy, a), onEllipse(g1.R, g1.sy, a)]] });
  };
  const circle = (stage, k, delay) => {
    const gd = guide(k);
    // lit as eight arcs, each starting at a ray's end and running clockwise to the next (so it closes as it draws)
    for (const a of RAYS8) S.push({ stage, kind: 'circle', delay, parts: [ellipseArc(gd.R, gd.sy, a, a + Math.PI / 4)] });
  };
  for (const a of RAYS8) ray(1, a, 0, 1, 0);
  circle(1, 1, 0.55);
  for (const a of RAYS8) ray(2, a, 1, 2, 0);
  for (const a of RAYS16) ray(2, a, 0, 2, 0.15);
  circle(2, 2, 0.6);
  for (const a of RAYS8) ray(3, a, 2, 3, 0);
  circle(3, 3, 0.5);
  const o = RINGS[2];
  for (let k = 0; k < 8; k++) {                          // the star {8/3} on the outer guide circle
    const a = RAYS8[k], b = RAYS8[(k + 3) % 8];
    S.push({ stage: 3, kind: 'star', delay: 1.0, parts: [[onEllipse(o.R, o.sy, a), onEllipse(o.R, o.sy, b)]] });
  }
  return S;
}
export const LIT_FIGURE = buildLitFigure();

/** THE VESICA PISCIS at the heart: two equal circles, each passing through the other's centre (radius rho, centres
 *  rho apart, side by side), sized so both sit just inside the figure circle (1.5 rho = its radius). Still: it never
 *  turns, never looks anywhere. The almond where they overlap (the lens) is where the light gathers.
 *  Returns screen points: { circles: [left, right] (closed, last != first), lens (closed loop), tips: [top, bottom] }. */
export const VESICA = { rho: FIG.circle.R * 2 / 3 };
export function vesicaPiscis(n = 110) {
  const r = VESICA.rho, sy = FIG.circle.sy, [cx, cy] = CENTRE;
  const circ = (ox, a0, a1, m) => { const out = []; for (let k = 0; k <= m; k++) { const a = a0 + (a1 - a0) * k / m; out.push([cx + ox + Math.cos(a) * r, cy + Math.sin(a) * r * sy]); } return out; };
  const lensL = circ(-r / 2, -Math.PI / 3, Math.PI / 3, 28), lensR = circ(r / 2, 2 * Math.PI / 3, 4 * Math.PI / 3, 28);   // top tip -> bottom tip -> top tip
  return {
    circles: [circ(-r / 2, 0, 2 * Math.PI, n).slice(0, -1), circ(r / 2, 0, 2 * Math.PI, n).slice(0, -1)],
    lens: [...lensL, ...lensR.slice(1, -1)],
    tips: [[cx, cy - r * Math.sqrt(3) / 2 * sy], [cx, cy + r * Math.sqrt(3) / 2 * sy]],
  };
}
