// THE NODE · THE ASCENT (cabinet level 6) · THE SKY'S LAYOUT: the painted islands, where they float, their drift. Pure data +
// geometry, shared by the round (headless, Node-safe), the bots and the view. Coordinates are the plate's pixels (1266 x 952), x
// right, y DOWN. The plate is only the tube, the stars and the sea-glow (plate_measured.js, tools/ascent_measure.py); every
// island is a PAINTED PIECE cut from the two ChatGPT sheets (tools/ascent_cut_sprites.py -> assets/ascent/, sprites_measured.js).
//
//   PLACE        the composition (after the concept): which piece, where its walk line's centre floats, its scale, its depth
//                order (z: higher is nearer), its role (the temple, a PAD with its order, a REST island), its slow bob and slide
//   ISLANDS      the islands the round plays with, built from PLACE + the measurements:
//                  x, y        the walk line's centre at rest (the lander's feet stand on y)
//                  w           the walk line's length (the walkable top, measured from the painted top face)
//                  poly        the convex outline below the walk line (what the lander bumps), relative to (x, y)
//                  pad         { dx, r, order, rx }: the painted pad (dx from x), the landing tolerance, which pad it is
//                  carve       { dx, dy }: the tower's carving (it brightens when the pad is lit)
//                  anchor/size the piece's panel pixels: the view draws the painting so anchor lands on (x, y), scaled by s
//   START        the ledge the lander starts on (and returns to after a lost ship)
//   islandAt(def, t)   { x, y, vx, vy } at time t (the drift is a closed form: the same island at the same time, always)
//   islandPoly(x, y, def)   the convex outline the lander collides with
//   glassLeftAt / glassRightAt / glassTopAt   the lit tube face's edges
import { MEASURED } from './plate_measured.js';
import { SPRITES } from './sprites_measured.js';

export const FRAME = MEASURED.frame;                  // [1266, 952]
export const CX = 633;
const table = (o) => Object.entries(o).map(([k, v]) => [+k, v]).filter(([, v]) => v != null).sort((a, b) => a[0] - b[0]);
const lerpTable = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; return va + (vb - va) * (x - a) / (b - a); }
  return T[T.length - 1][1];
};
const TOP = table(MEASURED.glassTop).filter(([x]) => x >= 160 && x <= 1120);
const LEFT = table(MEASURED.glassLeft).filter(([y]) => y >= 160 && y <= 840), RIGHT = table(MEASURED.glassRight).filter(([y]) => y >= 160 && y <= 840);
export const glassTopAt = (x) => lerpTable(TOP, x);
export const glassLeftAt = (y) => lerpTable(LEFT, y);
export const glassRightAt = (y) => lerpTable(RIGHT, y);
export const GLASS = [glassLeftAt(480), glassTopAt(640), glassRightAt(480), 905];

// ---- the composition (the concept: the temple big in the centre-bottom, the towers left and right, small islands high,
// tiny pyramids scattered, two big foreground blocks framing the bottom corners) ----
// sprite: the piece; x, y: the walk line's centre; s: scale (the paintings are only ever shown smaller); z: depth (higher =
// nearer, drawn later); pad: the pad's order (5 pads; mercy drops the highest orders first); bob {ay, per, ph}; slide {ax, per, ph}
export const PLACE = Object.freeze([
  { sprite: 'temple', kind: 'temple', x: 643, y: 606, s: 0.7, z: 9, bob: { ay: 3, per: 9, ph: 0.5 }, slide: null },
  { sprite: 'tower_sun', kind: 'pad', pad: 0, x: 222, y: 480, s: 0.66, z: 7, bob: { ay: 5, per: 11, ph: 2.1 }, slide: null },
  { sprite: 'block_ring', kind: 'pad', pad: 1, x: 1092, y: 798, s: 0.6, z: 10, bob: { ay: 4, per: 12, ph: 4.4 }, slide: null },
  { sprite: 'tower_diamond', kind: 'pad', pad: 2, x: 1018, y: 372, s: 0.62, z: 8, bob: { ay: 5, per: 12.5, ph: 4.0 }, slide: null },
  { sprite: 'spire_ring', kind: 'pad', pad: 3, x: 822, y: 425, s: 0.5, z: 4, bob: { ay: 5, per: 9.5, ph: 3.3 }, slide: { ax: 16, per: 27, ph: 2.4 } },
  { sprite: 'spire_pad', kind: 'pad', pad: 4, x: 470, y: 205, s: 0.55, z: 2, bob: { ay: 5, per: 8.5, ph: 1.2 }, slide: { ax: 40, per: 32, ph: 0.4 } },
  { sprite: 'block_obelisk', kind: 'rest', x: 212, y: 805, s: 0.84, z: 11, bob: { ay: 3, per: 12, ph: 0.9 }, slide: null },
  { sprite: 'twin_spires', kind: 'rest', x: 920, y: 215, s: 0.42, z: 1, bob: { ay: 4, per: 9, ph: 2.7 }, slide: { ax: 12, per: 23, ph: 3.6 } },
  { sprite: 'obelisk_pad', kind: 'rest', x: 962, y: 715, s: 0.45, z: 6, bob: { ay: 4, per: 10, ph: 5.0 }, slide: { ax: 14, per: 21, ph: 1.0 } },
  { sprite: 'pyramid_pad', kind: 'rest', x: 362, y: 312, s: 0.38, z: 3, bob: { ay: 4, per: 13, ph: 0.3 }, slide: { ax: 16, per: 25, ph: 1.9 } },
  { sprite: 'pyramid_spire', kind: 'rest', x: 150, y: 238, s: 0.36, z: 0, bob: { ay: 3, per: 14, ph: 3.1 }, slide: { ax: 14, per: 19, ph: 5.2 } },
  { sprite: 'pyramid_plain', kind: 'rest', x: 1138, y: 598, s: 0.38, z: 5, bob: { ay: 4, per: 11, ph: 4.4 }, slide: { ax: 10, per: 22, ph: 0.7 } },
]);
// the lander starts standing on the big foreground ledge (block_obelisk), right of its obelisk (the sky straight above it is
// clear up to the left tower's underside: a first take-off never bumps)
export const START = Object.freeze({ sprite: 'block_obelisk', dx: 80 });

const clampN = (x, a, b) => (x < a ? a : x > b ? b : x);
function build(p, id) {
  const S = SPRITES[p.sprite], s = p.s;
  const ax = (S.walk.x0 + S.walk.x1) / 2, ay = S.walk.y;                 // the anchor: the walk line's centre (panel px)
  const rel = ([px, py]) => [(px - ax) * s, (py - ay) * s];
  const poly = S.hull.map(rel);
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  const def = {
    id, kind: p.kind, sprite: p.sprite, s, z: p.z, x: p.x, y: p.y, w: (S.walk.x1 - S.walk.x0) * s,
    anchor: [ax, ay], size: S.size, poly, bx0: Math.min(...xs), bx1: Math.max(...xs), by1: Math.max(...ys),
    thick: 0, pyr: Math.max(...ys),                                            // (the old slab + pyramid depth, for the Lab's bars)
    top: (S.topmost - ay) * s, bottom: (S.bottom - ay) * s,
    bob: p.bob, slide: p.slide,
  };
  if (S.pad) {
    const rx = S.pad.rx * s;
    def.ring = { dx: (S.pad.x - ax) * s, dy: (S.pad.y - ay) * s, rx };      // the painted pad / ring (the view's glow sits on it)
    if (p.kind === 'pad') def.pad = { dx: def.ring.dx, r: clampN(rx * 0.85, 22, 40), order: p.pad, rx };
  }
  if (S.carve) def.carve = { dx: (S.carve.x - ax) * s, dy: (S.carve.y - ay) * s };
  return Object.freeze(def);
}
export const ISLANDS = Object.freeze(PLACE.map(build));
export const TEMPLE = ISLANDS[0];
export const START_ISLAND = ISLANDS.find((d) => d.sprite === START.sprite);

const TAU = Math.PI * 2;
/** The island's place at time t (s): the same closed form for the round, the view and the bots. Velocity is the derivative. */
export function islandAt(d, t, out = {}) {
  let x = d.x, y = d.y, vx = 0, vy = 0;
  if (d.slide) { const w = TAU / d.slide.per; x += d.slide.ax * Math.sin(w * t + d.slide.ph); vx = d.slide.ax * w * Math.cos(w * t + d.slide.ph); }
  if (d.bob) { const w = TAU / d.bob.per; y += d.bob.ay * Math.sin(w * t + d.bob.ph); vy = d.bob.ay * w * Math.cos(w * t + d.bob.ph); }
  out.x = x; out.y = y; out.vx = vx; out.vy = vy;
  return out;
}
/** The convex outline the lander collides with: the walk line on top, the painted underside's hull below it. */
export function islandPoly(x, y, d) {
  const P = d.poly, out = new Array(P.length);
  for (let i = 0; i < P.length; i++) out[i] = [x + P[i][0], y + P[i][1]];
  return out;
}
/** Where the pad is (physical x) for an island at x. */
export const padX = (isl, x) => x + isl.pad.dx;

// ---- the win's figure: PLATO'S ATLANTIS, rings of land and water round a centre (exact circles) ----
export const FIGURE = Object.freeze({ cx: 633, cy: 452, radii: [34, 76, 116, 168, 212], canal: 6 });
