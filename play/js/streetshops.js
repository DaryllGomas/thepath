// SHOP FRONTS AND THE TOWN (look batch 3a). Main street's eight shops were dark boxes with flat window quads (three wore a photograph of a
// storefront); the town behind them eleven plain boxes. This builds what a 1982 small-town block has: brick fronts with real window frames,
// sills and heads; display windows that are shallow boxes with goods in them, lit; recessed doors with OPEN / CLOSED cards; striped awnings;
// painted signs under gooseneck lamps; cornices and parapets; roofs with their tanks, chimneys and vents. The three photo facades keep
// their photograph and gain what a picture cannot have: frames, sills, ledges, an awning, pilasters, lamps and neon in front of it.
// Everything is drawn into one Mesher (js/streetkit.js) by material, so the whole of it is a handful of draw calls. Metres, three's axes:
// the shops' fronts face +z (the street), their face is at z = WALL.
import * as THREE from 'three';
import { lin, mulc, WHITE, lerp, clamp, lcg } from './streetkit.js';
import { atlasUv } from './streettex.js';

export const WALL = -167.2, GY = -36.99, RY = -37.06;
export const K = {
  cream: lin('#a79f8a'), white: lin('#e4dfce'), stone: lin('#a8a290'), conc: lin('#8f8b80'), black: lin('#121214'), iron: lin('#26282a'), alum: lin('#a3a7aa'),
  green: lin('#1c3a2b'), navy: lin('#1c2a52'), maroon: lin('#4a1a1e'), brown: lin('#3a281a'), tin: lin('#6d7378'), tar: lin('#2a2826'), wood: lin('#4a3524'),
  red: lin('#a21c1c'), glassBlue: lin('#3a5a62'), brick: lin('#7a3a2c'),
};
const LIT = { u: 1.3, d: 0.45, f: 1, b: 1, l: 0.8, r: 0.8 };            // a lit interior: tops catch the lamps, undersides do not
const warm = (k) => [1.0 * k, 0.72 * k, 0.42 * k];
const TINT = [1.0, 0.8, 0.55];                                            // the colour of what lights a display: tungsten

// ---- small parts
export function glassWin(M, WA, cell, x0, x1, y0, y1, z, col = WHITE) {
  M.quad('glass', [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], atlasUv(WA.rect(cell), x0, x1, y0, y1, 0), col);
}
export function signQuad(M, SA, name, x0, x1, y0, y1, z, col = WHITE) {
  M.quad('sign', [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], atlasUv(SA.rect(name), x0, x1, y0, y1, 0), col);
}
// a sign standing out from a wall (its face to -x or +x): z0..z1 across, y0..y1 up, both faces
export function bladeSign(M, SA, name, x, z0, z1, y0, y1, col = WHITE, name2 = null) {
  for (const s of [-1, 1]) {
    const xs = x + s * 0.006;
    M.quad('sign', [[xs, y0, z0], [xs, y0, z1], [xs, y1, z1], [xs, y1, z0]], [s, 0, 0], atlasUv(SA.rect(name2 && s > 0 ? name2 : name), z0, z1, y0, y1, 2, s > 0), col);
  }
}
// a gooseneck lamp over a sign: the arm up and out, a shade, a bulb
export function gooseneck(M, x, y, z, k = 1) {
  M.rod('metal', [x, y, z], [x, y + 0.2, z + 0.4], 0.012, 4, K.iron);
  M.cyl('metal', x, y + 0.1, z + 0.42, 0.15, 0.03, 0.12, 8, lin('#1e3a2e'), { open: true });
  M.cyl('glow', x, y + 0.085, z + 0.42, 0.04, 0.04, 0.03, 5, [3.2 * k, 2.3 * k, 1.2 * k], { open: true });
}
// a striped canvas awning on the wall at z0, top edge at yTop, standing out `proj`, falling `drop`; a valance and sides; its underside lit from the window
export function awning(M, x0, x1, z0, yTop, proj, drop, cA, cB, o = {}) {
  const pitch = o.pitch || 0.3, n = Math.max(2, Math.round((x1 - x0) / pitch)), dx = (x1 - x0) / n, val = o.valance ?? 0.22, yL = yTop - drop;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * dx, b = a + dx, c = i % 2 ? cB : cA, t = 0.94 + 0.06 * Math.sin(i * 12.9898) ;
    const col = [c[0] * t, c[1] * t, c[2] * t], uv = (p) => [p[0], p[2]];
    M.quad('awning', [[a, yTop, z0], [b, yTop, z0], [b, yL, z0 + proj], [a, yL, z0 + proj]], [0, 0.6, 0.8], uv, col);
    M.quad('awning', [[a, yL, z0 + proj], [b, yL, z0 + proj], [b, yL - val, z0 + proj + 0.03], [a, yL - val, z0 + proj + 0.03]], [0, 0, 1], uv, mulc(col, 0.9));
  }
  for (const x of [x0, x1]) M.quad('awning', [[x, yTop, z0], [x, yL, z0 + proj], [x, yL - val, z0 + proj + 0.03]], [x === x0 ? -1 : 1, 0, 0], (p) => [p[2], p[1]], mulc(cA, 0.7));
  // under the canvas: the window's light on it, fading toward the street
  for (let s = 0; s < 4; s++) {
    const t0 = s / 4, t1 = (s + 1) / 4, k = 0.2 * Math.pow(1 - t0, 1.6) + 0.02;
    M.quad('glow', [[x0, yTop - drop * t0 - 0.02, z0 + proj * t0], [x1, yTop - drop * t0 - 0.02, z0 + proj * t0], [x1, yTop - drop * t1 - 0.02, z0 + proj * t1], [x0, yTop - drop * t1 - 0.02, z0 + proj * t1]], [0, -1, 0], (p) => [0, 0], o.under ? mulc(warm(o.under), k) : warm(k));
  }
  for (const x of [x0 + 0.12, x1 - 0.12]) M.rod('metal', [x, yTop - 0.04, z0 + 0.02], [x, yL - 0.02, z0 + proj], 0.014, 5, K.iron);
}
// a window set in a brick wall: frame, sash bars, sill, head. (x centre, sill y, size) at the wall's face z0; the glass is behind the frame
export function windowSet(M, WA, cx, y0, w, h, z0, cell, col, o = {}) {
  const f = o.frame ?? 0.07, t = o.thick ?? 0.08, c = o.paint || K.cream;
  glassWin(M, WA, cell, cx - w / 2, cx + w / 2, y0, y0 + h, z0 + 0.012, col);
  M.box('paint', cx - w / 2 - f, y0 - f, z0, cx - w / 2, y0 + h + f, z0 + t, { col: c, faces: 'blru' });
  M.box('paint', cx + w / 2, y0 - f, z0, cx + w / 2 + f, y0 + h + f, z0 + t, { col: c, faces: 'brlu' });
  M.box('paint', cx - w / 2, y0 + h, z0, cx + w / 2, y0 + h + f, z0 + t, { col: c, faces: 'bu' });
  M.box('paint', cx - w / 2, y0 - f, z0, cx + w / 2, y0, z0 + t, { col: c, faces: 'b' });
  M.box('paint', cx - 0.014, y0, z0 + 0.012, cx + 0.014, y0 + h, z0 + t * 0.7, { col: c, faces: 'blr' });                      // the meeting rail's upright
  M.box('paint', cx - w / 2, y0 + h * 0.5 - 0.014, z0 + 0.012, cx + w / 2, y0 + h * 0.5 + 0.014, z0 + t * 0.7, { col: c, faces: 'bu' });  // and the meeting rails
  const sill = o.sill ?? 0.2;
  M.box('conc', cx - w / 2 - f - 0.05, y0 - f - 0.06, z0, cx + w / 2 + f + 0.05, y0 - f, z0 + sill, { col: K.stone, faces: 'bulr' });
  if (o.head !== false) M.box('conc', cx - w / 2 - f - 0.06, y0 + h + f, z0, cx + w / 2 + f + 0.06, y0 + h + f + 0.11, z0 + 0.12, { col: K.stone, faces: 'bulrd' });
}

// ---- a brick wall (a quad at z facing +z) from y0 to y1 across x0..x1 with rectangular holes {u0, u1, y0, y1}
export function brickWall(M, x0, x1, y0, y1, z, holes, col = WHITE, nrm = [0, 0, 1], uvf = (p) => [p[0] / 0.9, p[1] / 0.9]) {
  const us = [x0, x1]; for (const h of holes) us.push(h.u0, h.u1);
  const cuts = [...new Set(us.filter((u) => u >= x0 - 1e-6 && u <= x1 + 1e-6).map((u) => +u.toFixed(4)))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b - a < 1e-4) continue;
    const hs = holes.filter((q) => q.u0 <= a + 1e-5 && q.u1 >= b - 1e-5).sort((p, q) => p.y0 - q.y0);
    let y = y0;
    for (const h of hs) { if (h.y0 > y + 1e-4) M.quad('brick', [[a, y, z], [b, y, z], [b, h.y0, z], [a, h.y0, z]], nrm, uvf, col); y = Math.max(y, h.y1); }
    if (y1 > y + 1e-4) M.quad('brick', [[a, y, z], [b, y, z], [b, y1, z], [a, y1, z]], nrm, uvf, col);
  }
}

// ---- what is in a display window. x0..x1 the glass, yF the floor, yT the ceiling, zb the back wall; depth how far the glass stands out
const PAL = { red: [0.7, 0.1, 0.08], yel: [0.9, 0.7, 0.12], grn: [0.14, 0.5, 0.18], blu: [0.14, 0.24, 0.62], wht: [0.82, 0.8, 0.72], org: [0.85, 0.38, 0.08], pnk: [0.8, 0.3, 0.45], brn: [0.34, 0.2, 0.1] };
const POOL = Object.values(PAL);
function displayCase(M, rand, theme, x0, x1, yF, yT, zb, depth, dim = 1) {
  const L = (c, k = 1) => [c[0] * k * dim * 0.16 * TINT[0], c[1] * k * dim * 0.16 * TINT[1], c[2] * k * dim * 0.16 * TINT[2]];
  const bx = (a, b, c, d, e, f, col, sh = LIT) => M.box('glow', a, b, c, d, e, f, { col: L(col), shade: sh, faces: 'bu' });
  const wall = { market: [0.78, 0.66, 0.4], shoes: [0.7, 0.66, 0.6], pharmacy: [0.7, 0.68, 0.56], barber: [0.66, 0.6, 0.52], variety: [0.8, 0.68, 0.46] }[theme];
  const w = x1 - x0, h = yT - yF;
  // back wall in three bands (the lamps are in the ceiling: brighter high), the sides, the floor and the ceiling
  for (let i = 0; i < 3; i++) { const a = yF + h * i / 3, b = yF + h * (i + 1) / 3; M.quad('glow', [[x0, a, zb], [x1, a, zb], [x1, b, zb], [x0, b, zb]], [0, 0, 1], () => [0, 0], L(wall, [0.6, 0.85, 1.1][i])); }
  for (const x of [x0, x1]) M.quad('glow', [[x, yF, zb], [x, yF, zb + depth], [x, yT, zb + depth], [x, yT, zb]], [x === x0 ? 1 : -1, 0, 0], () => [0, 0], L(wall, 0.55));
  M.quad('glow', [[x0, yF, zb], [x1, yF, zb], [x1, yF, zb + depth], [x0, yF, zb + depth]], [0, 1, 0], () => [0, 0], L(mulc(wall, 0.55)));
  M.quad('glow', [[x0, yT, zb], [x1, yT, zb], [x1, yT, zb + depth], [x0, yT, zb + depth]], [0, -1, 0], () => [0, 0], L([1.0, 0.9, 0.62], 1.15));
  for (const f of [0.25, 0.75]) M.box('glow', x0 + w * f - 0.1, yT - 0.03, zb + depth * 0.45 - 0.06, x0 + w * f + 0.1, yT, zb + depth * 0.45 + 0.06, { col: L([3.4, 2.7, 1.6]), faces: 'd' });
  const shelf = (y, a, b, d = 0.3) => M.box('glow', a, y - 0.02, zb, b, y, zb + d, { col: L([0.36, 0.26, 0.17]), faces: 'bu', shade: { u: 1.4, b: 0.9 } });
  if (theme === 'market') {
    for (const y of [yF + 0.62, yF + 1.12, yF + 1.62]) { shelf(y, x0 + 0.06, x1 - 0.06); for (let x = x0 + 0.1; x < x1 - 0.14; x += 0.15 + rand() * 0.05) { const c = POOL[Math.floor(rand() * POOL.length)], hh = 0.1 + rand() * 0.1; bx(x, y, zb + 0.04, x + 0.1, y + hh, zb + 0.14, c); } }
    for (let i = 0; i < 3 && x0 + 0.5 + i * 0.95 + 0.5 < x1; i++) {                             // crates of produce on the floor, tilted toward the glass
      const cx = x0 + 0.4 + i * 0.95, c = [PAL.org, PAL.red, PAL.grn][i % 3];
      bx(cx, yF, zb + 0.22, cx + 0.8, yF + 0.3, zb + 0.55, [0.5, 0.36, 0.2]);
      for (let k = 0; k < 9; k++) bx(cx + 0.06 + (k % 3) * 0.25, yF + 0.3, zb + 0.26 + Math.floor(k / 3) * 0.1, cx + 0.2 + (k % 3) * 0.25, yF + 0.44 + rand() * 0.04, zb + 0.34 + Math.floor(k / 3) * 0.1, c);
    }
  } else if (theme === 'shoes') {
    for (const y of [yF + 0.7, yF + 1.3]) { shelf(y, x0 + 0.06, x1 - 0.06, 0.34); for (let x = x0 + 0.1; x < x1 - 0.3; x += 0.34) bx(x, y, zb + 0.04, x + 0.3, y + 0.16 + rand() * 0.03, zb + 0.3, rand() < 0.7 ? PAL.wht : PAL.brn); }
    for (let i = 0; i < 3; i++) {                                                               // risers with a shoe or two each
      const cx = x0 + 0.5 + i * (w - 1.0) / 2; bx(cx - 0.3, yF, zb + 0.28, cx + 0.3, yF + 0.2 + i * 0.12, zb + 0.56, [0.55, 0.3, 0.2]);
      for (const sx of [-0.14, 0.12]) { bx(cx + sx, yF + 0.2 + i * 0.12, zb + 0.34, cx + sx + 0.1, yF + 0.27 + i * 0.12, zb + 0.5, i === 1 ? PAL.blu : PAL.brn); bx(cx + sx, yF + 0.27 + i * 0.12, zb + 0.34, cx + sx + 0.1, yF + 0.3 + i * 0.12, zb + 0.4, i === 1 ? PAL.blu : PAL.brn); }
    }
  } else if (theme === 'pharmacy') {
    for (const y of [yF + 0.7, yF + 1.3, yF + 1.9]) { shelf(y, x0 + 0.06, x1 - 0.06, 0.26); for (let x = x0 + 0.1; x < x1 - 0.16; x += 0.17 + rand() * 0.05) { const c = [[1.2, 0.2, 0.12], [0.2, 0.9, 0.35], [1.2, 0.7, 0.14], [0.2, 0.4, 1.1], [0.9, 0.9, 0.85]][Math.floor(rand() * 5)], hh = 0.18 + rand() * 0.2; M.cyl('glow', x + 0.05, y, zb + 0.12, 0.045, 0.04, hh, 5, L(c), { open: true }); } }
    for (const [fx, c] of [[0.28, [2.2, 0.22, 0.14]], [0.72, [0.2, 1.8, 0.5]]]) {                // the show globes
      const g = new THREE.SphereGeometry(0.17, 8, 6); M.geo('glow', g, new THREE.Matrix4().makeTranslation(x0 + w * fx, yT - 0.3, zb + depth * 0.55), L(c)); g.dispose(); M.rod('glow', [x0 + w * fx, yT - 0.13, zb + depth * 0.55], [x0 + w * fx, yT, zb + depth * 0.55], 0.008, 4, L([0.5, 0.4, 0.3]));
    }
  } else if (theme === 'barber') {
    M.quad('glow', [[x0 + 0.1, yF + 0.7, zb + 0.01], [x1 - 0.1, yF + 0.7, zb + 0.01], [x1 - 0.1, yT - 0.2, zb + 0.01], [x0 + 0.1, yT - 0.2, zb + 0.01]], [0, 0, 1], () => [0, 0], L([1.0, 0.95, 0.82], 0.9));   // the mirror
    bx(x0 + 0.08, yF + 0.64, zb, x1 - 0.08, yF + 0.72, zb + 0.22, [0.3, 0.22, 0.16]);
    for (let x = x0 + 0.2; x < x1 - 0.3; x += 0.2 + rand() * 0.06) { const c = [[0.2, 0.5, 1.1], [1.0, 0.3, 0.2], [0.2, 0.9, 0.4]][Math.floor(rand() * 3)]; M.cyl('glow', x, yF + 0.72, zb + 0.1, 0.035, 0.03, 0.17 + rand() * 0.06, 5, L(c), { open: true }); }
    for (const cx of [x0 + w * 0.3, x0 + w * 0.72]) {                                         // two chairs
      bx(cx - 0.28, yF + 0.32, zb + 0.3, cx + 0.28, yF + 0.5, zb + 0.78, [0.5, 0.08, 0.1]); bx(cx - 0.26, yF + 0.5, zb + 0.28, cx + 0.26, yF + 1.1, zb + 0.38, [0.5, 0.08, 0.1]);
      M.cyl('glow', cx, yF, zb + 0.55, 0.06, 0.06, 0.34, 8, L([0.8, 0.8, 0.8])); bx(cx - 0.22, yF, zb + 0.78, cx + 0.22, yF + 0.1, zb + 0.92, [0.7, 0.7, 0.7]);
    }
  } else {                                                                                    // variety: toys and housewares
    for (const y of [yF + 0.6, yF + 1.2, yF + 1.8]) { shelf(y, x0 + 0.06, x1 - 0.06, 0.3); for (let x = x0 + 0.1; x < x1 - 0.2; x += 0.3 + rand() * 0.12) { const c = POOL[Math.floor(rand() * POOL.length)]; bx(x, y, zb + 0.04, x + 0.18 + rand() * 0.08, y + 0.14 + rand() * 0.18, zb + 0.24, c); } }
    for (let i = 0; i < 3; i++) { const g = new THREE.SphereGeometry(0.15 + i * 0.03, 8, 6), c = [PAL.red, PAL.blu, PAL.yel][i]; M.geo('glow', g, new THREE.Matrix4().makeTranslation(x0 + 0.4 + i * (w - 0.8) / 2, yF + 0.2 + i * 0.02, zb + 0.5), L(c)); g.dispose(); }
    for (let i = 0; i < 3; i++) { const kx = x0 + 0.5 + i * (w - 1.0) / 2, c = [PAL.pnk, PAL.grn, PAL.yel][i]; M.quad('glow', [[kx, yT - 0.2, zb + depth * 0.5], [kx + 0.13, yT - 0.5, zb + depth * 0.5], [kx, yT - 0.8, zb + depth * 0.5], [kx - 0.13, yT - 0.5, zb + depth * 0.5]], [0, 0, 1], () => [0, 0], L(c)); }
  }
}

// ---- one custom shop. cx the centre, hw half the width, top the roof's y. spec: { theme, sign, awn: [hexA, hexB], open: bool, dim, neon, rx, pole }
export function customShop(ctx, i, o, spec) {
  const { M, SA, WA, rand, lights, colliders, fade } = ctx;
  const cx = o.pos[0], hw = o.scale[0] / 2, top = o.pos[1] + o.scale[1] / 2, z0 = WALL, g = GY;
  const x0 = cx - hw, x1 = cx + hw, pier = 0.6, ent = 0.88, dep = 0.55;
  const dL = [x0 + pier, cx - ent], dR = [cx + ent, x1 - pier];
  const yF = g + 0.62, yT = g + 2.85, rel = top - g;
  const headY = Math.min(g + 6.1, top - 0.95), sillY = headY - 1.4, wxs = [-hw * 0.56, 0, hw * 0.56].map((u) => cx + u);
  const dim = spec.dim ?? 1;
  // the brick wall (a hair proud of the old face), with holes for the two displays, the door and three upper windows
  const holes = [{ u0: dL[0], u1: dL[1], y0: yF, y1: yT }, { u0: dR[0], u1: dR[1], y0: yF, y1: yT }, { u0: cx - ent + 0.02, u1: cx + ent - 0.02, y0: g, y1: yT + 0.1 }];
  for (const wx of wxs) holes.push({ u0: wx - 0.55, u1: wx + 0.55, y0: sillY, y1: headY });
  brickWall(M, x0, x1, g - 0.05, top, z0 + 0.004, holes, lin('#c8bdb0'));
  // pilasters at the ends and a string course at the sign band
  for (const [a, b] of [[x0, x0 + 0.22], [x1 - 0.22, x1]]) M.box('brick', a, g - 0.05, z0, b, top, z0 + 0.14, { col: lin('#b0a498'), uv: (p) => [(p[0] + p[2]) / 0.9, p[1] / 0.9], faces: 'fblr' });
  // the base, the stall risers and their sills, the lintel over the displays
  for (const [a, b] of [dL, dR]) {
    M.box('paint', a - 0.04, g - 0.05, z0, b + 0.04, yF - 0.04, z0 + dep + 0.04, { col: spec.base || K.green, faces: 'frlbu' });
    M.box('metal', a - 0.06, yF - 0.04, z0, b + 0.06, yF, z0 + dep + 0.06, { col: K.alum });
    M.box('paint', a - 0.06, yT, z0, b + 0.06, yT + 0.3, z0 + dep + 0.06, { col: spec.base || K.green, faces: 'frlbd' });
    for (const x of [a, b]) M.box('metal', x - 0.025, yF, z0 + dep, x + 0.025, yT, z0 + dep + 0.05, { col: K.alum });            // the glass's frame
    M.box('metal', a, yF, z0 + dep, b, yF + 0.05, z0 + dep + 0.05, { col: K.alum }); M.box('metal', a, yT - 0.05, z0 + dep, b, yT, z0 + dep + 0.05, { col: K.alum });
    M.box('metal', (a + b) / 2 - 0.02, yF, z0 + dep, (a + b) / 2 + 0.02, yT, z0 + dep + 0.04, { col: K.alum });
    displayCase(M, rand, spec.theme, a, b, yF, yT, z0 + 0.03, dep, dim);
    // the glass: a faint reflection of the street lamps across it, and the window's light spilling onto the pavement
    M.quad('spill', [[a, yF, z0 + dep + 0.01], [lerp(a, b, 0.3), yF, z0 + dep + 0.01], [lerp(a, b, 0.55), yT, z0 + dep + 0.01], [a, yT, z0 + dep + 0.01]], [0, 0, 1], () => [0, 0], [0.05, 0.035, 0.02]);
    for (let s = 0; s < 4; s++) { const t0 = s * 0.5, t1 = t0 + 0.5, k = (0.2 * Math.pow(1 - s / 4, 1.8) + 0.01) * dim; M.quad('spill', [[a - 0.1, g + 0.004, z0 + dep + t0], [b + 0.1, g + 0.004, z0 + dep + t0], [b + 0.1 - 0.05 * s, g + 0.004, z0 + dep + t1], [a + 0.1 + 0.05 * s, g + 0.004, z0 + dep + t1]], [0, 1, 0], () => [0, 0], warm(k)); }
    colliders.push([a - 0.06, g - 0.1, z0, b + 0.06, yT + 0.3, z0 + dep + 0.06]);
  }
  // the entry: the door at the old wall, a transom, a lit glass leaf with a card on it, a stone step; the entry's own ceiling light
  const dx0 = cx - ent + 0.04, dx1 = cx + ent - 0.04, dz = z0 + 0.03;
  const dk = spec.open === false ? 0.3 : 1;
  M.box('paint', dx0, g, dz - 0.03, dx0 + 0.07, yT + 0.1, dz + 0.04, { col: K.iron, faces: 'frb' }); M.box('paint', dx1 - 0.07, g, dz - 0.03, dx1, yT + 0.1, dz + 0.04, { col: K.iron, faces: 'flb' });
  M.quad('glow', [[dx0 + 0.07, g + 0.5, dz + 0.01], [dx1 - 0.07, g + 0.5, dz + 0.01], [dx1 - 0.07, g + 2.1, dz + 0.01], [dx0 + 0.07, g + 2.1, dz + 0.01]], [0, 0, 1], () => [0, 0], mulc([0.17, 0.11, 0.055], dk * dim));
  M.quad('glow', [[dx0 + 0.07, g, dz + 0.01], [dx1 - 0.07, g, dz + 0.01], [dx1 - 0.07, g + 0.5, dz + 0.01], [dx0 + 0.07, g + 0.5, dz + 0.01]], [0, 0, 1], () => [0, 0], K.iron);
  M.quad('glow', [[dx0 + 0.07, g + 2.25, dz + 0.01], [dx1 - 0.07, g + 2.25, dz + 0.01], [dx1 - 0.07, yT, dz + 0.01], [dx0 + 0.07, yT, dz + 0.01]], [0, 0, 1], () => [0, 0], mulc([0.2, 0.14, 0.07], dk * dim));
  for (const y of [g + 2.1, g + 2.25]) M.box('paint', dx0 + 0.07, y - 0.03, dz - 0.01, dx1 - 0.07, y + 0.03, dz + 0.05, { col: K.iron, faces: 'fub' });
  M.box('paint', cx - 0.02, g + 0.5, dz, cx + 0.02, g + 2.1, dz + 0.05, { col: K.iron, faces: 'fblr' });
  M.box('metal', cx + 0.08, g + 1.0, dz + 0.05, cx + 0.12, g + 1.2, dz + 0.09, { col: K.alum });
  M.box('conc', dx0 - 0.06, g - 0.05, z0, dx1 + 0.06, g + 0.03, z0 + 0.45, { col: K.stone, faces: 'fblru' });
  M.quad('glow', [[dx0, yT + 0.02, z0], [dx1, yT + 0.02, z0], [dx1, yT + 0.02, z0 + dep], [dx0, yT + 0.02, z0 + dep]].reverse(), [0, -1, 0], () => [0, 0], mulc([1.0, 0.85, 0.55], 0.4 * dim));
  M.box('glow', cx - 0.12, yT - 0.0, z0 + 0.26, cx + 0.12, yT + 0.02, z0 + 0.34, { col: mulc([3.4, 2.7, 1.6], dk * dim), faces: 'd' });
  signQuad(M, SA, spec.open === false ? 'closed_card' : 'open_card', cx + 0.16, cx + 0.5, g + 1.4, g + 1.62, dz + 0.052, WHITE);
  M.quad('spill', [[dx0, g + 0.004, z0 + 0.45], [dx1, g + 0.004, z0 + 0.45], [dx1 + 0.2, g + 0.004, z0 + 1.3], [dx0 - 0.2, g + 0.004, z0 + 1.3]].reverse(), [0, 1, 0], () => [0, 0], warm(0.16 * dk * dim));
  // the sign band and its lamps
  const sy0 = g + 3.4, sy1 = g + 4.15;
  M.box('paint', x0 + 0.1, sy0, z0, x1 - 0.1, sy1, z0 + 0.22, { col: lin('#2a2b2c'), faces: 'brlud' });
  signQuad(M, SA, spec.sign, cx - 2.6, cx + 2.6, sy0 + 0.05, sy1 - 0.05, z0 + 0.222);
  for (const f of [0.22, 0.5, 0.78]) gooseneck(M, lerp(x0, x1, f), sy1 + 0.02, z0 + 0.2, dim);
  // the upper windows
  const cells = spec.windows || ['lamp', 'tv', 'shade'];
  wxs.forEach((wx, k) => windowSet(M, WA, wx, sillY, 1.1, 1.4, z0 + 0.004, cells[k] || 'dark', mulc(WHITE, 0.62 + 0.1 * rand())));
  // awning
  awning(M, x0 + 0.15, x1 - 0.15, z0 + 0.22, g + 3.4, 1.08, 0.6, lin(spec.awn[0]), lin(spec.awn[1]), { under: dim });
  // cornice, parapet and roof
  cornice(M, x0, x1, z0, top, rand);
  // OPEN neon / pole / blade sign
  if (spec.neon) signQuad(M, SA, spec.neon, cx - 0.78, cx - 0.78 + 0.62, yF + 1.55, yF + 1.55 + 0.23, z0 + dep - 0.02);
  if (spec.rx) bladeSign(M, SA, 'rx_blade', x1 - 0.5, z0 + 0.22, z0 + 1.06, g + 3.7, g + 4.5, WHITE);
  if (spec.pole) barberPole(M, SA, x1 - 0.42, z0 + 0.36, g + 1.2);
  // the light that falls from the shop onto the street
  lights.push({ name: `ShopGlow_${i}`, pos: [cx, g + 2.3, z0 + 1.7], color: [1, 0.78, 0.5], range: 10, intensity: 1.25 * dim });
}

// a barber's pole on a bracket: caps, and a glass cylinder wearing the stripes
function barberPole(M, SA, x, z, y) {
  M.cyl('metal', x, y - 0.06, z, 0.05, 0.05, 0.06, 8, K.alum); M.cyl('metal', x, y + 0.8, z, 0.05, 0.05, 0.06, 8, K.alum);
  M.rod('metal', [x, y + 0.4, z - 0.34], [x, y + 0.4, z], 0.015, 5, K.iron);
  const g = new THREE.CylinderGeometry(0.075, 0.075, 0.74, 12, 1);
  M.geo('sign', g, new THREE.Matrix4().makeTranslation(x, y + 0.4, z), WHITE, SA.rect('barber_pole')); g.dispose();
  M.cyl('metal', x, y + 0.86, z, 0.07, 0.0, 0.07, 8, K.alum);
}

// the cornice and parapet over a front x0..x1 at z0, the roof's y; a dentil row of corbels under the cap
export function cornice(M, x0, x1, z0, top, rand, col = K.cream) {
  M.box('paint', x0, top - 0.55, z0, x1, top - 0.1, z0 + 0.12, { col: lin('#8c846f'), faces: 'bud' });
  M.box('paint', x0 - 0.02, top - 0.1, z0 - 0.0, x1 + 0.02, top + 0.1, z0 + 0.42, { col, faces: 'fblrud' });
  M.box('paint', x0, top + 0.1, z0, x1, top + 0.62, z0 + 0.22, { col: lin('#7d7663'), faces: 'fblru' });
  M.box('paint', x0 - 0.02, top + 0.62, z0 - 0.04, x1 + 0.02, top + 0.7, z0 + 0.26, { col, faces: 'fblrud' });
  for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.62) M.box('paint', x, top - 0.52, z0 + 0.1, x + 0.16, top - 0.1, z0 + 0.34, { col, faces: 'blr' });
  // the roof: tar and gravel inside the parapet
  const zb = z0 - 9.0;
  M.quad('roof', [[x0, top + 0.012, z0 + 0.22], [x1, top + 0.012, z0 + 0.22], [x1, top + 0.012, zb], [x0, top + 0.012, zb]], [0, 1, 0], (p) => [p[0], p[2]], WHITE);
  M.box('paint', x0, top, zb, x1, top + 0.55, zb + 0.2, { col: lin('#625c4d'), faces: 'fblru' });                      // the back parapet
}

// the chimney, the tank, the vents: seeded by the shop's number
export function rooftop(M, rand, kind, x, z, top) {
  if (kind === 'tank') {                                                      // a wooden water tank on a steel frame
    for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) M.rod('metal', [x + dx, top, z + dz], [x + dx * 0.9, top + 2.2, z + dz * 0.9], 0.05, 5, K.iron);
    M.rod('metal', [x - 0.9, top + 1.2, z - 0.9], [x + 0.9, top + 1.2, z + 0.9], 0.02, 4, K.iron); M.rod('metal', [x + 0.9, top + 1.2, z - 0.9], [x - 0.9, top + 1.2, z + 0.9], 0.02, 4, K.iron);
    M.cyl('pole', x, top + 2.2, z, 1.2, 1.2, 1.9, 16, mulc(WHITE, 0.55));
    for (const yy of [0.35, 1.0, 1.6]) M.cyl('metal', x, top + 2.2 + yy, z, 1.23, 1.23, 0.05, 16, K.iron);
    M.cyl('pole', x, top + 4.1, z, 1.2, 0.0, 0.8, 16, mulc(WHITE, 0.4));
  } else if (kind === 'chimney') {
    M.box('brick', x - 0.4, top, z - 0.4, x + 0.4, top + 2.2, z + 0.4, { col: lin('#a08070'), uv: (p) => [(p[0] + p[2]) / 0.9, p[1] / 0.9], faces: 'fblr' });
    M.box('paint', x - 0.48, top + 2.2, z - 0.48, x + 0.48, top + 2.34, z + 0.48, { col: K.stone });
    M.box('paint', x - 0.3, top + 2.34, z - 0.3, x + 0.3, top + 2.4, z + 0.3, { col: K.black, faces: 'u' });
  } else if (kind === 'ac') {
    M.box('metal', x - 0.7, top, z - 0.5, x + 0.7, top + 0.7, z + 0.5, { col: K.tin, faces: 'fblru' }); M.cyl('metal', x - 0.2, top + 0.7, z, 0.32, 0.32, 0.04, 10, K.iron); M.box('paint', x - 0.75, top, z - 0.55, x + 0.75, top + 0.06, z + 0.55, { col: K.iron });
  } else if (kind === 'vent') {
    M.cyl('metal', x, top, z, 0.09, 0.09, 0.8, 6, K.tin); M.cyl('metal', x, top + 0.8, z, 0.16, 0.0, 0.14, 6, K.tin);
  } else if (kind === 'skylight') {
    M.box('metal', x - 0.8, top, z - 0.6, x + 0.8, top + 0.25, z + 0.6, { col: K.tin, faces: 'fblr' }); M.quad('glow', [[x - 0.7, top + 0.38, z - 0.5], [x + 0.7, top + 0.38, z - 0.5], [x + 0.7, top + 0.25, z + 0.5], [x - 0.7, top + 0.25, z + 0.5]], [0, 1, 0], () => [0, 0], [0.04, 0.05, 0.07]);
  } else if (kind === 'antenna') {
    M.rod('metal', [x, top, z], [x, top + 3.4, z], 0.02, 4, K.iron);
    for (const [y, l] of [[2.4, 0.9], [2.9, 0.75], [3.3, 0.55], [1.9, 1.0]]) M.rod('metal', [x - l / 2, top + y, z], [x + l / 2, top + y, z], 0.01, 3, K.iron);
  }
}

// a blank side wall of brick (a shop at the end of the row, seen from the lane or the side street), with a drainpipe and a few small windows
export function sideWall(M, WA, rand, x, zA, zB, g, top, dir) {
  const nrm = [dir, 0, 0], u = (p) => [p[2] / 0.9, p[1] / 0.9], xs = x + dir * 0.004;
  const holes = [];
  const n = Math.max(1, Math.floor(Math.abs(zB - zA) / 3.2));
  for (let k = 0; k < n; k++) { const zc = zA + (zB - zA) * (k + 0.5) / n; holes.push({ u0: Math.min(zc - 0.4, zc + 0.4), u1: Math.max(zc - 0.4, zc + 0.4), y0: g + 4.4, y1: g + 5.8 }); }
  // (the holes are across z here: lay the wall out in z, then place each strip's quads on the x plane)
  const zs = [Math.min(zA, zB), Math.max(zA, zB)];
  const cuts = [zs[0], zs[1], ...holes.flatMap((h) => [h.u0, h.u1])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b - a < 1e-4) continue;
    const h = holes.find((q) => q.u0 <= a + 1e-5 && q.u1 >= b - 1e-5);
    const strip = (y0, y1) => { if (y1 - y0 > 1e-4) M.quad('brick', [[xs, y0, a], [xs, y0, b], [xs, y1, b], [xs, y1, a]], nrm, u, lin('#9a8c80')); };
    if (!h) strip(g - 0.05, top); else { strip(g - 0.05, h.y0); strip(h.y1, top); }
  }
  for (const h of holes) {
    const zc = (h.u0 + h.u1) / 2;
    M.quad('glass', [[xs, h.y0, h.u0], [xs, h.y0, h.u1], [xs, h.y1, h.u1], [xs, h.y1, h.u0]], nrm, atlasUv(WA.rect(rand() < 0.5 ? 'dark' : 'lamp'), h.u0, h.u1, h.y0, h.y1, 2, dir < 0), mulc(WHITE, 0.8));
    M.box('paint', xs - (dir > 0 ? 0 : 0.07), h.y0 - 0.06, h.u0 - 0.06, xs + (dir > 0 ? 0.07 : 0), h.y0, h.u1 + 0.06, { col: K.stone });
  }
  M.rod('metal', [x + dir * 0.06, g - 0.05, zA + (zB - zA) * 0.06], [x + dir * 0.06, top - 0.3, zA + (zB - zA) * 0.06], 0.045, 6, K.iron);
  // a lamp on a bracket over a door nobody uses: its bulb, and the pool it throws on the brick (three nested soft squares, added)
  const lz = zA + (zB - zA) * 0.62, ly = g + 3.2, px = x + dir * 0.012;
  M.rod('metal', [x + dir * 0.02, ly, lz], [x + dir * 0.34, ly + 0.1, lz], 0.014, 4, K.iron);
  M.cyl('metal', x + dir * 0.36, ly + 0.0, lz, 0.13, 0.04, 0.12, 8, lin('#1e3a2e'), { open: true });
  M.cyl('glow', x + dir * 0.36, ly - 0.02, lz, 0.04, 0.04, 0.03, 5, [3.4, 2.4, 1.3], { open: true });
  {
    const P = [[px, ly - 3.2, lz - 2.8], [px, ly - 3.2, lz + 2.8], [px, ly + 1.4, lz + 2.8], [px, ly + 1.4, lz - 2.8]], UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    M.quad('pool', P, [dir, 0, 0], (p) => UV[P.findIndex((q) => q[1] === p[1] && q[2] === p[2])], warm(0.55));
  }
}

// ---- a photo facade (hardware 2, diner 3, video 5): the picture stays; frames, sills, ledges, pilasters, an awning, lamps and signs go in front of it
const PHOTO = {
  2: { win: [[122, 265], [440, 580], [760, 900]], wy: [120, 365], disp: [[66, 400], [632, 955]], dy: [575, 870], door: [440, 600, 575, 975], awn: ['#2a5a3c', '#cdc5a8'], ledge: 872, lamps: [-1.74, 0, 1.7], lampV: 468 },
  3: { win: [[128, 265], [445, 580], [770, 905]], wy: [108, 320], disp: [[90, 710]], dy: [565, 785], door: [780, 940, 570, 985], awn: ['#1f6b78', '#d2cbb4'], ledge: 790, neon: 'diner_neon', lamps: [-0.99, 0, 1.04], lampV: 398 },
  5: { win: [[135, 282], [438, 585], [745, 890]], wy: [130, 345], disp: [[50, 400], [620, 975]], dy: [565, 838], door: [435, 590, 625, 985], awn: ['#5c2c78', '#cfc7ae'], ledge: 845, neon: 'open_neon', sign: 'rentals', lamps: [-2.33, 0, 2.36], lampV: 420 },
};
export function photoShop(ctx, i, o) {
  const { M, SA, WA, rand, lights, colliders } = ctx, P = PHOTO[i];
  const cx = o.pos[0], hw = o.scale[0] / 2, top = o.pos[1] + o.scale[1] / 2, g = GY, pz = WALL + 0.05;
  const px = (u) => cx - 3.5 + (u / 1024) * 7, py = (v) => -30.05 - (v / 1024) * 7;
  // wings (the photo is 7 m of a 9 m shop), pilasters, base
  const wing = [[cx - hw, cx - 3.5], [cx + 3.5, cx + hw]];
  for (const [a, b] of wing) brickWall(M, a, b, g - 0.05, top, pz + 0.004, [], lin('#b5a89a'));
  for (const [a, b] of [[cx - hw, cx - hw + 0.34], [cx + hw - 0.34, cx + hw]]) M.box('brick', a, g - 0.05, WALL, b, top, pz + 0.12, { col: lin('#a89a8c'), uv: (p) => [(p[0] + p[2]) / 0.9, p[1] / 0.9], faces: 'fblr' });
  cornice(M, cx - hw, cx + hw, WALL, top, rand);
  // the upper windows: stone sills, a 4 cm bead, and the dark of a reveal at the head
  for (const [a, b] of P.win) {
    const xa = px(a), xb = px(b), w = xb - xa, sy = py(P.wy[1]);
    M.box('conc', xa - 0.08, sy - 0.07, pz, xb + 0.08, sy, pz + 0.22, { col: K.stone, faces: 'fblrud' });
    M.box('paint', xa - 0.03, py(P.wy[0]) - 0.0, pz, xb + 0.03, py(P.wy[0]) + 0.06, pz + 0.08, { col: K.stone, faces: 'fblru' });
  }
  // display windows: ledge, side posts that stand out, and the shop door's step
  for (const [a, b] of P.disp) {
    const xa = px(a), xb = px(b), ly = py(P.ledge);
    M.box('conc', xa - 0.12, ly - 0.08, pz, xb + 0.12, ly, pz + 0.26, { col: K.stone, faces: 'fblrud' });
    M.box('metal', xa - 0.04, py(P.dy[1]), pz, xa + 0.02, py(P.dy[0]), pz + 0.1, { col: K.alum, faces: 'bl' }); M.box('metal', xb - 0.02, py(P.dy[1]), pz, xb + 0.04, py(P.dy[0]), pz + 0.1, { col: K.alum, faces: 'br' });
    M.box('metal', xa, py(P.dy[0]) - 0.03, pz, xb, py(P.dy[0]) + 0.03, pz + 0.1, { col: K.alum, faces: 'bud' });
    const sp = 0.14;
    for (let s = 0; s < 3; s++) M.quad('spill', [[xa, g + 0.004, pz + 0.2 + s * 0.5], [xb, g + 0.004, pz + 0.2 + s * 0.5], [xb, g + 0.004, pz + 0.7 + s * 0.5], [xa, g + 0.004, pz + 0.7 + s * 0.5]], [0, 1, 0], () => [0, 0], warm(sp * (1 - s / 3)));
  }
  const [d0, d1, dt, db] = P.door; M.box('conc', px(d0) - 0.05, g - 0.05, WALL, px(d1) + 0.05, g + 0.04, pz + 0.4, { col: K.stone, faces: 'fblru' });
  // the awning over the display windows, a card on the door, the signs, the lamps
  awning(M, cx - 3.4, cx + 3.4, pz + 0.02, py(556), 1.15, 0.5, lin(P.awn[0]), lin(P.awn[1]), { under: 1 });
  for (const f of P.lamps) gooseneck(M, cx + f, py(P.lampV), pz + 0.02, 0.9);
  if (i === 2) signQuad(M, SA, 'closed_card', px(493), px(493) + 0.4, py(760), py(760) + 0.27, pz + 0.04);
  if (P.neon) { const a = px(P.disp[0][0] + 40); signQuad(M, SA, P.neon, a, a + (i === 3 ? 1.05 : 0.8), py(715), py(715) + (i === 3 ? 0.31 : 0.3), pz + 0.03); }
  if (P.sign) { const x0 = px(34), x1 = px(990); signQuad(M, SA, P.sign, x0, x1, py(520), py(436), pz + 0.012); }
  colliders.push([cx - hw, g - 0.1, WALL, cx + hw, g + 0.5, pz + 0.3]);
  void d0; void dt; void db;
}

// ---- a town block behind the street: Town_i is a box (centre, size). Its front faces +z. Parapet and cornice, a roof, what stands on it, frames on its windows.
export function townBlock(ctx, i, o, wins) {
  const { M, rand } = ctx;
  const [cx, cy, cz] = o.pos, [sx, sy, sz] = o.scale, x0 = cx - sx / 2, x1 = cx + sx / 2, zf = cz + sz / 2, zb = cz - sz / 2, y0 = cy - sy / 2, top = cy + sy / 2;
  const dark = lin('#3b3430'), light = lin('#6a6256');
  // cornice, parapet all round, roof
  M.box('paint', x0 - 0.05, top - 0.5, zf - 0.02, x1 + 0.05, top - 0.12, zf + 0.14, { col: dark, faces: 'bud' });
  M.box('paint', x0 - 0.08, top - 0.12, zf - 0.1, x1 + 0.08, top + 0.1, zf + 0.4, { col: light, faces: 'fblrud' });
  M.box('paint', x0, top + 0.1, zf - 0.2, x1, top + 0.7, zf, { col: dark, faces: 'fblru' });
  M.box('paint', x0, top, zb, x1, top + 0.7, zb + 0.2, { col: dark, faces: 'fblru' });
  M.box('paint', x0, top, zb, x0 + 0.2, top + 0.7, zf, { col: dark, faces: 'brlu' }); M.box('paint', x1 - 0.2, top, zb, x1, top + 0.7, zf, { col: dark, faces: 'blru' });
  M.quad('roof', [[x0 + 0.2, top + 0.012, zf - 0.2], [x1 - 0.2, top + 0.012, zf - 0.2], [x1 - 0.2, top + 0.012, zb + 0.2], [x0 + 0.2, top + 0.012, zb + 0.2]], [0, 1, 0], (p) => [p[0], p[2]], WHITE);
  // string courses between the floors, pilasters at the corners
  for (let y = y0 + 3.4; y < top - 1; y += 3.4) M.box('paint', x0, y - 0.07, zf, x1, y + 0.07, zf + 0.1, { col: light, faces: 'bud' });
  for (const [a, b] of [[x0, x0 + 0.5], [x1 - 0.5, x1]]) M.box('paint', a, y0, zf, b, top, zf + 0.1, { col: lin('#4a423a'), faces: 'fblr' });
  // the roof's furniture
  const kinds = [['ac', 'vent'], ['tank'], ['chimney', 'vent'], ['tank', 'ac'], ['skylight', 'vent', 'ac'], ['chimney', 'antenna'], ['ac', 'skylight'], ['vent', 'chimney'], ['tank', 'vent'], ['antenna', 'ac'], ['chimney']][i % 11];
  kinds.forEach((k, j) => rooftop(M, rand, k, lerp(x0 + 1.5, x1 - 1.5, (j + 0.5) / kinds.length) + (rand() - 0.5) * 1.2, lerp(zb + 1.5, zf - 1.6, 0.3 + 0.4 * rand()), top));
  // frames on the windows Unity drew as flat quads, and some of them lit
  for (const w of wins) {
    const [wx, wy, wz] = w.pos, ww = w.scale[0], wh = w.scale[1], hw = ww / 2, hh = wh / 2;
    M.box('paint', wx - hw - 0.07, wy - hh - 0.07, wz, wx - hw, wy + hh + 0.07, wz + 0.1, { col: light, faces: 'br' });
    M.box('paint', wx + hw, wy - hh - 0.07, wz, wx + hw + 0.07, wy + hh + 0.07, wz + 0.1, { col: light, faces: 'bl' });
    M.box('paint', wx - hw, wy + hh, wz, wx + hw, wy + hh + 0.1, wz + 0.1, { col: light, faces: 'bu' });
    M.box('paint', wx - hw - 0.08, wy - hh - 0.1, wz, wx + hw + 0.08, wy - hh, wz + 0.2, { col: light, faces: 'bud' });
    const r = rand();
    if (r < 0.42) {                                                           // lit: a room behind the glass
      const cells = ['lamp', 'blinds', 'tv', 'bulb', 'shade', 'kitchen', 'office'], c = cells[Math.floor(rand() * cells.length)];
      M.quad('glass', [[wx - hw, wy - hh, wz + 0.015], [wx + hw, wy - hh, wz + 0.015], [wx + hw, wy + hh, wz + 0.015], [wx - hw, wy + hh, wz + 0.015]], [0, 0, 1], atlasUv(ctx.WA.rect(c), wx - hw, wx + hw, wy - hh, wy + hh, 0), mulc(WHITE, 0.55 + 0.2 * rand()));
    } else if (r < 0.7) M.quad('glass', [[wx - hw, wy - hh, wz + 0.015], [wx + hw, wy - hh, wz + 0.015], [wx + hw, wy + hh, wz + 0.015], [wx - hw, wy + hh, wz + 0.015]], [0, 0, 1], atlasUv(ctx.WA.rect('dark'), wx - hw, wx + hw, wy - hh, wy + hh, 0), mulc(WHITE, 0.55));
  }
  return { top };
}

// a fire escape up a block's front: landings at each floor, rails, and a stair between them
export function fireEscape(M, x, zf, y0, top) {
  const w = 2.4, d = 0.9;
  for (let y = y0 + 3.4; y < top - 1; y += 3.4) {
    M.box('metal', x - w / 2, y - 0.04, zf, x + w / 2, y, zf + d, { col: K.iron, faces: 'fblrud' });
    M.box('metal', x - w / 2, y, zf + d - 0.03, x + w / 2, y + 0.9, zf + d, { col: K.iron, faces: 'b' });
    for (let k = 0; k <= 4; k++) M.box('metal', x - w / 2 + k * w / 4 - 0.015, y, zf + d - 0.03, x - w / 2 + k * w / 4 + 0.015, y + 0.9, zf + d, { col: K.iron, faces: 'b' });
    M.box('metal', x - w / 2, y + 0.88, zf + d - 0.04, x + w / 2, y + 0.92, zf + d, { col: K.iron });
    const yn = y + 3.4; if (yn < top - 1) M.rod('metal', [x - 0.9, y, zf + d - 0.1], [x + 0.2, yn, zf + d - 0.1], 0.03, 4, K.iron), M.rod('metal', [x - 0.6, y, zf + d - 0.1], [x + 0.5, yn, zf + d - 0.1], 0.03, 4, K.iron);
  }
}
void clamp; void lcg; void THREE;
