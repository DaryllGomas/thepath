// THE NODE · THE TUNNEL (cabinet level 7) · THE TUNNEL'S GEOMETRY: the lanes, the rim, the depth, the fall. Pure data +
// geometry, shared by the round (headless, Node-safe), the bots and the view. Coordinates are the FRAME: the pixels of the
// plate's first save (1266 x 952), x right, y DOWN; the full-size plate (1448 x 1086) maps onto it by PLATE (a scale and a
// shift, measured). Everything is BUILT from the measurements of the painted web (plate_measured.js, tools/tunnel_measure.py):
//
//   N = 18 lanes. The painted web has eighteen spokes; lane j runs between spoke j and spoke j + 1 (the spokes' angles grow
//   counter-clockwise on the glass, so lane j + 1 is to the RIGHT of lane j along the bottom of the rim).
//   DEPTH w: the rim is w = 1; the painted rings sit at w = MEASURED.w[k] (their size ~ 1 / w: the tunnel's perspective,
//   measured); the echoes appear at about 4.15 and the heart is at W_HEART. Between two painted rings a point is placed by
//   perspective: its LATERAL offset X (= (P - C) w) is interpolated between the two rings' measured offsets, then P = C + X / w.
//   At every painted ring that lands exactly on the painted junctions (vertices) and on the painted ring at the lane's centre
//   (mids: where the painter bowed a ring, the lane's centre stays on the paint, not on the chord).
//   THE CAMERA (the fall): with the camera moved `cam` down the tunnel, P = C + X / (w - cam).
//
//   laneAt(q, w, cam)       the centre of lane q at depth w; q may be fractional (between lanes: the path runs through the
//                           spoke's junction, so on the rim it follows the painted rim)
//   vertexAt(j, w, cam)     spoke j's junction at depth w
//   laneFrame(q, w)         { x, y, ax, ay (across the lane, unit), nx, ny (inward, toward the centre, unit), width }
//   ringPts(w, cam)         the 18 junctions of a ring at depth w (a live ring, the painted shape)
//   laneDist(a, b)          the signed short way round from lane a to lane b (-9..9)
//   fallAt(t)               THE FALL at t s: { cam, shipW, shipX (0..1: 1 = its rim lane, 0 = the axis), heart (its size
//                           x), open (the vesica opening, 0..1), light (the passage's gold-white, 0..1), plate (the painted
//                           plate's share, 1 -> 0), stream (the live rings' share, 0 -> 1) }
import { MEASURED } from './plate_measured.js';

export const FRAME = MEASURED.frame;                  // [1266, 952]
export const N = MEASURED.n;                          // 18
export const C = MEASURED.centre;                     // the tunnel's centre (the vanishing point; the heart sits on it)
export const CX = C[0], CY = C[1];
export const RING_W = MEASURED.w;                     // the painted rings' depths (rim = 1)
export const GLASS = MEASURED.glass;                  // the tube face: |dx/a|^p + |dy/b|^p = 1
export const PLATE = MEASURED.plate;                  // the full-size plate: its px = frame * scale + offset; size [w, h]
// THE PAINTED LINES THEMSELVES (the crisp layer: traced and straightened, tools/tunnel_measure.py): CRISP.rings[k][j] = ring
// k's painted edge across lane j (a polyline from spoke j's crossing to spoke j + 1's; ring 0 = the rim, k < 3), CRISP.spokes[j]
// = the painted spoke j from the rim in to ring 2; CRISP.rgb = the paint's colour on them. They follow the paint where the
// clean layout (vertexAt) is a few px off it (the rim's top is bowed; a stroke can sit off its junction)
export const CRISP = MEASURED.crisp;
const K = RING_W.length;
export const W_HEART = 4.4;
export const W_SPAWN = 4.15;

const lat = (pts, k) => pts.map(([x, y]) => [(x - CX) * RING_W[k], (y - CY) * RING_W[k]]);
const XV = MEASURED.rings.map((r, k) => lat(r, k));   // the junctions' lateral offsets, per ring, per spoke
const XM = MEASURED.mids.map((r, k) => lat(r, k));    // the lanes' centres' lateral offsets, per ring, per lane
export const mod = (j) => ((j % N) + N) % N;

/** The lateral offset of table T (per ring, per index) at index j, depth w (interpolated between the painted rings). */
function lerpX(T, j, w, out) {
  if (w <= RING_W[0]) { out[0] = T[0][j][0]; out[1] = T[0][j][1]; return out; }
  for (let k = 0; k < K - 1; k++) {
    if (w <= RING_W[k + 1]) {
      const t = (w - RING_W[k]) / (RING_W[k + 1] - RING_W[k]), a = T[k][j], b = T[k + 1][j];
      out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; return out;
    }
  }
  out[0] = T[K - 1][j][0]; out[1] = T[K - 1][j][1]; return out;
}
const _a = [0, 0], _b = [0, 0];
/** Spoke j's junction at depth w (camera at cam). */
export function vertexAt(j, w, cam = 0, out = [0, 0]) {
  lerpX(XV, mod(j), w, _a); const d = Math.max(1e-3, w - cam);
  out[0] = CX + _a[0] / d; out[1] = CY + _a[1] / d; return out;
}
/** The centre of lane q at depth w; a fractional q runs lane centre -> the spoke's junction -> the next lane's centre. */
export function laneAt(q, w, cam = 0, out = [0, 0]) {
  const j0 = Math.floor(q), u = q - j0, d = Math.max(1e-3, w - cam);
  if (u < 1e-6) { lerpX(XM, mod(j0), w, _a); out[0] = CX + _a[0] / d; out[1] = CY + _a[1] / d; return out; }
  if (u < 0.5) { lerpX(XM, mod(j0), w, _a); lerpX(XV, mod(j0 + 1), w, _b); }
  else { lerpX(XV, mod(j0 + 1), w, _a); lerpX(XM, mod(j0 + 1), w, _b); }
  const t = u < 0.5 ? u * 2 : (u - 0.5) * 2;
  out[0] = CX + (_a[0] + (_b[0] - _a[0]) * t) / d; out[1] = CY + (_a[1] + (_b[1] - _a[1]) * t) / d; return out;
}
/** The lane's frame at depth w: its centre, the unit vector across it (spoke j -> spoke j+1), the unit vector inward (toward
 *  the centre, square to across) and its width (the junction-to-junction length). Fractional q blends two lanes' frames. */
export function laneFrame(q, w, cam = 0) {
  const j0 = Math.floor(q), u = q - j0;
  const f0 = frame1(mod(j0), w, cam), f1 = u > 1e-6 ? frame1(mod(j0 + 1), w, cam) : f0;
  const p = laneAt(q, w, cam);
  let ax = f0.ax + (f1.ax - f0.ax) * u, ay = f0.ay + (f1.ay - f0.ay) * u;
  const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
  let nx = -ay, ny = ax;                                         // square to across; flip toward the centre
  if (nx * (CX - p[0]) + ny * (CY - p[1]) < 0) { nx = -nx; ny = -ny; }
  return { x: p[0], y: p[1], ax, ay, nx, ny, width: f0.width + (f1.width - f0.width) * u };
}
function frame1(j, w, cam) {
  const a = vertexAt(j, w, cam), b = vertexAt(j + 1, w, cam);
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  return { ax: dx / L, ay: dy / L, width: L };
}
/** A ring at depth w: its 18 junctions (the painted ring's shape, measured), camera at cam. */
export function ringPts(w, cam = 0) { const out = []; for (let j = 0; j < N; j++) out.push(vertexAt(j, w, cam)); return out; }
/** THE PAINTED RINGS BY DIRECTION: RADII[k][i] = ring k's radius from the centre along the ray at angle i * 360 / NA - 180
 *  degrees (atan2 in frame coords, y down), through the measured polygon (junctions and lane centres). The fall's shader
 *  inverts it per pixel, so the painting dives in exact register with the live rings. */
export const NA = 72;
export const RADII = (() => {
  const out = [];
  for (let k = 0; k < RING_W.length; k++) {
    const path = ringPath(RING_W[k]), row = [];
    for (let i = 0; i < NA; i++) {
      const th = i * 2 * Math.PI / NA - Math.PI, dx = Math.cos(th), dy = Math.sin(th);
      let best = 0;
      for (let q = 0; q < path.length; q++) {
        const [ax, ay] = path[q], [bx, by] = path[(q + 1) % path.length];
        const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const ox = ax - CX, oy = ay - CY, t = (ox * ey - oy * ex) / den, u = (ox * dy - oy * dx) / den;
        if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.max(best, t);
      }
      row.push(best);
    }
    out.push(row);
  }
  return out;
})();
/** A ring at depth w through the lane centres too (36 points: junction, lane centre, junction, ...): the painted shape. */
export function ringPath(w, cam = 0) {
  const out = [];
  for (let j = 0; j < N; j++) { out.push(vertexAt(j, w, cam)); out.push(laneAt(j, w, cam)); }
  return out;
}
/** The short way round from lane a to lane b: -N/2 .. N/2 (positive = increasing lane index). */
export function laneDist(a, b) { let d = mod(b - a); if (d > N / 2) d -= N; return d; }
/** Inside the glass (the tube face): 1 inside, 0 outside (soft edge `soft` in units of the superellipse's level). */
export function inGlass(x, y) {
  const G = GLASS, v = Math.pow(Math.abs((x - G.cx) / G.a), G.p) + Math.pow(Math.abs((y - G.cy) / G.b), G.p);
  return v < 1;
}

// ---- THE FALL: one timeline, shared by the round (it knows when it's over) and the view (it draws it) ----
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/** The camera's run (vection done safely: one direction, a nearly CONSTANT slow speed, gradual ramps): its speed eases up
 *  over `ramp` s (a smoothstep), holds, and eases down over the last `ramp` s as the heart fills the glass. The painted rings
 *  pass any one point at the camera's speed / their spacing (0.31 to 0.45 in w): at the cruise speed about 1.7 a second at
 *  the most, so no one-second window ever holds three. */
// (the painting dives first, in exact register (RADII), dimming as it goes, and hands over to the live rings drawn exactly on
// its rings; the fine rings inside the last measured one fade before the camera moves, so they never stream)
export const FALL = Object.freeze({ camEnd: 2.85, t0: 0.7, t1: 7.4, ramp: 1.5, openAt: [5.4, 8.2], lightAt: [5.6, 8.5], plateOut: [0.9, 3.8], plateIn: [0.2, 1.0],
  streamIn: [1.2, 3.0] });
const CRUISE = FALL.camEnd / (FALL.t1 - FALL.t0 - FALL.ramp);          // the speed that covers camEnd (w per s)
function camAt(t) {
  const T = FALL.t1 - FALL.t0, a = FALL.ramp, x = Math.min(Math.max(t - FALL.t0, 0), T);
  const up = (u) => a * (u * u * u - 0.5 * u * u * u * u);             // distance covered u of the way up a ramp (x cruise)
  if (x <= a) return CRUISE * up(x / a);
  if (x <= T - a) return CRUISE * (a / 2 + (x - a));
  return CRUISE * (T - a - up((T - x) / a));
}
export function fallAt(t, out = {}) {
  const cam = camAt(t);
  // the ship: it lifts off the rim and glides ahead of the camera toward the axis, into the heart
  const lift = smooth(0.0, 1.4, t), glide = smooth(0.2, 6.4, t);
  out.cam = cam;
  out.shipW = 1 + cam + 0.9 * lift + (W_HEART - 1 - FALL.camEnd - 0.9) * smooth(3.5, 7.2, t);   // ahead of the camera, then into the heart
  out.shipX = 1 - glide;
  out.shipFade = 1 - smooth(5.8, 7.0, t);
  // the heart's size (x its resting size): it grows as you near it, and holds once it begins to open (it parts in place while
  // the light floods out: its lattice never slides across the glass)
  out.heart = W_HEART / Math.max(0.2, W_HEART - Math.min(cam, camAt(FALL.openAt[0])));
  out.open = smooth(FALL.openAt[0], FALL.openAt[1], t);
  out.light = smooth(FALL.lightAt[0], FALL.lightAt[1], t);
  out.plate = (1 - smooth(FALL.plateOut[0], FALL.plateOut[1], t)) * (1 - 0.38 * smooth(0.3, 1.2, t));   // (dimmed as the dive begins: its rings stream softly)
  out.plateIn = 1 - smooth(FALL.plateIn[0], FALL.plateIn[1], t);     // (the fine rings inside the last measured ring go first)
  out.stream = smooth(FALL.streamIn[0], FALL.streamIn[1], t) * (1 - smooth(6.2, 7.6, t));
  return out;
}
/** The camera's speed (w per s) at t (for the ring-rate check). */
export function camSpeedAt(t, h = 1 / 120) { return (camAt(t + h) - camAt(t - h)) / (2 * h); }
