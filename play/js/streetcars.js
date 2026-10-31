// PARKED CARS (look batch 3a): four 1970s-80s cars for main street's curbs, built in code. A rounded body is a loft through a few cross-sections;
// the cabin another, with the glass laid on it; then bumpers, grille, lamps, trim and wheels as boxes and short cylinders. No brand, badge or
// logo anywhere. Each car is built about its own origin (x the way it faces, y up from the ground, z across) and costs ~2 000 triangles.
//   wagon  the wood-panelled station wagon, forest green     pickup  a full-size two-tone pickup, white over blue
//   sedan  a big 1977 sedan, champagne gold, vinyl roof       compact a 1980 hatchback, orange
import * as THREE from 'three';
import { Mesher, ringRR, lin, mulc, WHITE, lerp } from './streetkit.js';

const C = {
  chrome: lin('#e6e8ee'), black: lin('#0d0d0f'), rubber: lin('#141416'), glass: lin('#161a22'), plate: lin('#c9c6a8'), tire: lin('#101012'), rim: lin('#9aa0a8'),
  amber: lin('#d98a1c'), red: lin('#b3121a'), grille: lin('#1a1b1e'), seat: lin('#3a2b22'),
};

// ring of the lower body at one station: [x, yBottom, yTop, halfWidth, cornerRadius]
const sec = ([x, yb, yt, w, r], mids) => ringRR(w, yb, yt, r, 3, 0, mids).map(([z, y]) => [x, y, z]);
// ring of the cabin at one station: a trapezoid, wider at the belt than at the roof, the roof's corners eased
function cabRing(x, yb, yt, wB, wT) {
  const h = Math.max(0.02, yt - yb), e = Math.min(0.045, h * 0.3);
  const half = [[wB, yb], [wB * 0.996, yb + h * 0.5], [wT, yt - e], [wT * 0.72, yt]];
  return [...half.map(([z, y]) => [x, y, -z]), ...half.slice().reverse().map(([z, y]) => [x, y, z])];
}

// the lofted car: lower body stations, cabin stations, and where the glass goes
function bodyAndCabin(L, spec, col) {
  const M = L.M, S = spec;
  const rings = S.body.map((st) => sec(st, S.mids));
  const colf = typeof col === 'function' ? col : () => col;
  M.loft('carPaint', rings, { col: (i, j, p) => colf(p), uv: (p) => [p[0], p[1]] });
  M.cap('carPaint', rings[0], [-1, 0, 0], colf([0, 0.7, 0])); M.cap('carPaint', rings[rings.length - 1], [1, 0, 0], colf([0, 0.7, 0]));
  // the cabin
  const yb = S.belt, cab = S.cab.map(([x, yt]) => cabRing(x, yb, yt, S.wB, S.wT));
  M.loft('carPaint', cab, { col: (i, j, p) => (S.roofCol || col), uv: (p) => [p[0], p[2]] });
  const first = cab[0], last = cab[cab.length - 1];
  M.cap('carPaint', first, [-1, 0, 0], S.roofCol || col); M.cap('carPaint', last, [1, 0, 0], S.roofCol || col);
  // a point on the cabin's skin: x along, t up the side (0 belt .. 1 roof edge), side = -1 | 1
  const yt = (x) => { const c = S.cab; for (let i = 1; i < c.length; i++) if (x <= c[i][0]) return lerp(c[i - 1][1], c[i][1], (x - c[i - 1][0]) / (c[i][0] - c[i - 1][0])); return c[c.length - 1][1]; };
  const cabZ = (t, h) => { const e = Math.min(0.045, Math.max(0.02, h) * 0.3), tE = 1 - e / Math.max(0.02, h); return t < 0.5 ? lerp(S.wB, S.wB * 0.996, t / 0.5) : lerp(S.wB * 0.996, S.wT, Math.min(1, (t - 0.5) / Math.max(0.05, tE - 0.5))); };
  const surf = (x, t, side) => { const h = yt(x) - yb; return [x, yb + h * t, side * cabZ(t, h)]; };
  const out = (pts, sidePush, dirOut) => {                                     // a glass quad laid 4 mm proud of the skin
    const a = pts[0], b = pts[1], c = pts[2];
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (nx * dirOut[0] + ny * dirOut[1] + nz * dirOut[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    M.quad('carGlass', pts.map((p) => [p[0] + nx * 0.005, p[1] + ny * 0.005, p[2] + nz * 0.005]), [nx, ny, nz], (p) => [p[0], p[1]], C.glass);
  };
  // (the skin has a knee at half height, so each opening is two quads, one each side of it, and lies on it)
  for (const side of [-1, 1]) for (const [x0, x1] of S.side) for (const [ta, tb] of [[0.1, 0.5], [0.5, 0.93]]) {
    out([surf(x0, ta, side), surf(x1, ta, side), surf(x1, tb, side), surf(x0, tb, side)], 0, [0, 0, side]);
  }
  // the windshield and the backlight lie on the roof's own slope (the crown between two cabin stations), not on a side skin: a quad laid by the
  // side-window rule sat 9 cm inside the car, which is why the hatchback's windshield showed body paint and a black streak
  const crown = (xa, xb, nrm) => {
    const zw = S.wT * 0.8, ya = yt(xa) + 0.004, yb2 = yt(xb) + 0.004;
    out([[xa, ya, -zw], [xa, ya, zw], [xb, yb2, zw], [xb, yb2, -zw]], 0, nrm);
  };
  crown(S.ws[0], S.ws[1], [1, 0.5, 0]);
  if (S.bkCap) { const x = S.cab[0][0], zw = S.wT * 0.8; out([[x, yb + 0.14, -zw], [x, yb + 0.14, zw], [x, S.cab[0][1] - 0.1, zw], [x, S.cab[0][1] - 0.1, -zw]], 0, [-1, 0, 0]); }   // a cab's flat back wall
  else crown(S.bk[0], S.bk[1], [-1, 0.5, 0]);
  // a little interior behind the glass would read as black: the seats' headrests stand up in it
  for (const x of S.seats || []) for (const z of [-0.42, 0.42]) M.box('trim', x - 0.1, yb + 0.12, z - 0.14, x + 0.1, yb + 0.52, z + 0.14, { col: C.seat });
  return { surf, yt };
}

// a wheel on the side `side` of a body whose flank is at bodyW: the tyre stands 2 cm proud of it, a dark ring of wheel arch round it
function wheel(L, x, side, bodyW, r = 0.335, w = 0.24) {
  const M = L.M, y = r, zc = side * (bodyW + 0.02 - w / 2), zo = side * (bodyW + 0.02);
  const g = new THREE.CylinderGeometry(r, r, w, 12, 1); g.rotateX(Math.PI / 2);
  M.geo('trim', g, new THREE.Matrix4().makeTranslation(x, y, zc), C.tire); g.dispose();
  const g2 = new THREE.CylinderGeometry(r * 0.64, r * 0.64, w + 0.01, 10, 1, true); g2.rotateX(Math.PI / 2);
  M.geo('chrome', g2, new THREE.Matrix4().makeTranslation(x, y, zc), [0.55, 0.57, 0.6]); g2.dispose();
  const g3 = new THREE.CylinderGeometry(r * 0.36, r * 0.42, 0.03, 8, 1); g3.rotateX(Math.PI / 2);
  M.geo('chrome', g3, new THREE.Matrix4().makeTranslation(x, y, zo + side * 0.012), WHITE); g3.dispose();
  const g4 = new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.012, 10, 1); g4.rotateX(Math.PI / 2);                 // the dark of the wheel arch round the tyre
  M.geo('trim', g4, new THREE.Matrix4().makeTranslation(x, y + 0.04, side * (bodyW + 0.004)), C.black); g4.dispose();
}

function bumper(L, x, dir, wHalf, y0, y1, depth, o = {}) {
  const M = L.M, xc = x + dir * depth * 0.55, r = (y1 - y0) * 0.42, yc = (y0 + y1) / 2;
  const g = new THREE.CapsuleGeometry(r, wHalf * 2 - r * 2 + 0.1, 3, 8); g.rotateX(Math.PI / 2);
  M.geo('chrome', g, new THREE.Matrix4().makeTranslation(xc, yc, 0).multiply(new THREE.Matrix4().makeScale(1.3, 1, 1)), WHITE); g.dispose();
  M.box('trim', Math.min(xc, xc + dir * r * 1.4), yc - r * 0.35, -wHalf * 0.5, Math.max(xc, xc + dir * r * 1.4), yc + r * 0.35, wHalf * 0.5, { col: C.rubber });                    // the rubber strip
  if (o.guards) for (const s of [-1, 1]) M.box('chrome', Math.min(xc, xc + dir * 0.09), yc + r * 0.6, s * wHalf * 0.62 - 0.03, Math.max(xc, xc + dir * 0.09), yc + r + 0.18, s * wHalf * 0.62 + 0.03, { col: WHITE });
}

function plate(L, x, dir, y) {
  const M = L.M, x0 = x, x1 = x + dir * 0.012;
  M.box('trim', Math.min(x0, x1), y, -0.17, Math.max(x0, x1), y + 0.17, 0.17, { col: C.plate });
}

function lamps(L, S, o) {
  const M = L.M, xf = S.nose, xr = S.tail;
  // front: grille, four headlamps (or two), parking lamps, side markers
  M.box('trim', xf - 0.03, o.gy0, -o.gw, xf + 0.012, o.gy1, o.gw, { col: C.grille });
  for (let i = 0; i < 4; i++) M.box('chrome', xf, o.gy0 + (o.gy1 - o.gy0) * (0.15 + 0.22 * i), -o.gw, xf + 0.02, o.gy0 + (o.gy1 - o.gy0) * (0.2 + 0.22 * i), o.gw, { col: WHITE });
  for (const s of [-1, 1]) {
    for (const zz of o.hz) {
      const g = new THREE.CylinderGeometry(0.115, 0.115, 0.05, 8, 1); g.rotateZ(Math.PI / 2);
      M.geo('chrome', g, new THREE.Matrix4().makeTranslation(xf - 0.005, o.hy, s * zz), WHITE); g.dispose();
      const g2 = new THREE.CylinderGeometry(0.092, 0.092, 0.03, 8, 1); g2.rotateZ(Math.PI / 2);
      M.geo('carGlass', g2, new THREE.Matrix4().makeTranslation(xf + 0.02, o.hy, s * zz), [0.9, 0.9, 0.85]); g2.dispose();
    }
    M.box('lampAmber', xf - 0.01, o.hy - 0.16, s * (o.hz[0] + 0.15) - 0.07, xf + 0.012, o.hy - 0.1, s * (o.hz[0] + 0.15) + 0.07, { col: WHITE });
    M.box('lampAmber', xf - 0.2, S.sideMark, s * (o.w + 0.002) - 0.001, xf - 0.1, S.sideMark + 0.06, s * (o.w + 0.012), { col: WHITE });
    M.box('lampRed', xr + 0.2, S.sideMark, s * (o.w + 0.002) - 0.001, xr + 0.1, S.sideMark + 0.06, s * (o.w + 0.012), { col: WHITE });
  }
  // rear: the lamp clusters, the plate recess, reflectors on the bumper
  for (const s of [-1, 1]) {
    M.box('lampRed', xr - 0.012, o.ty0, s * 0.3 - 0.0, xr + 0.015, o.ty1, s * (o.w - 0.05), { col: WHITE });
    M.box('trim', xr - 0.016, o.ty0 + (o.ty1 - o.ty0) * 0.35, s * (o.w - 0.36) - 0.0, xr - 0.012, o.ty0 + (o.ty1 - o.ty0) * 0.65, s * (o.w - 0.2), { col: [0.8, 0.8, 0.75] });   // the reverse lamp
    M.box('lampRed', xr - 0.03, S.bumperY + 0.02, s * (o.w - 0.14) - 0.04, xr - 0.015, S.bumperY + 0.07, s * (o.w - 0.14) + 0.04, { col: WHITE });
  }
}

function finish(L, S, o) {
  const M = L.M, w = o.w;
  // shut lines and handles on both sides, a beltline moulding
  for (const s of [-1, 1]) {
    for (const x of S.shut) M.box('trim', x - 0.005, 0.36, s * (w + 0.0), x + 0.005, S.belt - 0.06, s * (w + 0.004), { col: C.black });
    for (const x of S.handles) M.box('chrome', x - 0.08, S.belt - 0.12, s * (w + 0.003), x + 0.08, S.belt - 0.09, s * (w + 0.02), { col: WHITE });
    if (S.moulding) M.box('chrome', S.moulding[0], S.belt - 0.2, s * (w + 0.001), S.moulding[1], S.belt - 0.185, s * (w + 0.008), { col: WHITE });
    if (S.mirror) { M.box('trim', S.mirror - 0.04, S.belt + 0.1, s * (w + 0.02), S.mirror + 0.07, S.belt + 0.25, s * (w + 0.1), { col: C.black }); M.box('chrome', S.mirror - 0.05, S.belt + 0.1, s * (w + 0.09), S.mirror + 0.07, S.belt + 0.25, s * (w + 0.1), { col: WHITE }); }
  }
}

// ---- the specs. Stations are [x, yBottom, yTop, halfWidth, radius]; the cabin's are [x, roofHeight].
const SPECS = {
  sedan: {
    body: [[-2.75, 0.52, 0.92, 0.84, 0.18], [-2.6, 0.4, 1.04, 0.95, 0.16], [-2.1, 0.27, 1.08, 1.0, 0.14], [-1.0, 0.25, 1.0, 1.0, 0.12], [0.6, 0.25, 1.0, 1.0, 0.12], [1.5, 0.27, 1.01, 1.0, 0.12], [2.15, 0.3, 1.0, 0.985, 0.14], [2.55, 0.4, 0.92, 0.94, 0.18], [2.75, 0.52, 0.8, 0.86, 0.2]],
    cab: [[-1.95, 1.08], [-1.5, 1.37], [-1.0, 1.4], [0.0, 1.41], [0.55, 1.39], [1.05, 1.04]], belt: 0.98, wB: 0.93, wT: 0.8,
    side: [[0.5, -0.24], [-0.36, -1.08], [-1.14, -1.4]], ws: [0.58, 1.02], bk: [-1.52, -1.92], seats: [0.2, -0.7],
    nose: 2.75, tail: -2.75, sideMark: 0.66, bumperY: 0.36, shut: [0.62, -0.3, -1.2], handles: [0.3, -0.56], moulding: [-2.3, 2.3], mirror: 0.8,
    axles: [1.5, -1.65], w: 1.0,
  },
  wagon: {
    body: [[-2.7, 0.5, 0.95, 0.86, 0.16], [-2.55, 0.38, 1.1, 0.96, 0.14], [-2.0, 0.27, 1.12, 1.0, 0.14], [-1.0, 0.25, 1.0, 1.0, 0.12], [0.6, 0.25, 1.0, 1.0, 0.12], [1.5, 0.27, 1.0, 1.0, 0.12], [2.1, 0.3, 0.98, 0.985, 0.14], [2.5, 0.4, 0.9, 0.94, 0.18], [2.7, 0.52, 0.8, 0.86, 0.2]],
    cab: [[-2.52, 1.14], [-2.46, 1.42], [-0.2, 1.43], [0.5, 1.42], [1.0, 1.05]], belt: 0.98, wB: 0.94, wT: 0.85,
    side: [[0.46, -0.24], [-0.34, -1.02], [-1.1, -2.34]], ws: [0.54, 0.98], bk: [-2.465, -2.515], seats: [0.2, -0.7, -1.7],
    nose: 2.7, tail: -2.7, sideMark: 0.66, bumperY: 0.36, shut: [0.58, -0.3, -1.06, -2.4], handles: [0.3, -0.54, -1.3], moulding: null, mirror: 0.8,
    axles: [1.5, -1.6], w: 1.0,
  },
  compact: {
    body: [[-1.95, 0.46, 0.88, 0.74, 0.16], [-1.85, 0.34, 0.95, 0.79, 0.14], [-1.2, 0.26, 0.93, 0.8, 0.12], [0.6, 0.26, 0.92, 0.8, 0.12], [1.3, 0.28, 0.9, 0.79, 0.12], [1.75, 0.38, 0.8, 0.76, 0.14], [1.95, 0.48, 0.7, 0.7, 0.16]],
    cab: [[-1.78, 1.0], [-1.28, 1.32], [-0.2, 1.34], [0.45, 1.3], [0.98, 0.93]], belt: 0.9, wB: 0.74, wT: 0.64,
    side: [[0.42, -0.2], [-0.3, -0.85], [-0.92, -1.2]], ws: [0.5, 0.94], bk: [-1.3, -1.74], seats: [0.1, -0.6],
    nose: 1.95, tail: -1.95, sideMark: 0.6, bumperY: 0.34, shut: [0.5, -0.25, -0.95], handles: [0.22, -0.5], moulding: null, mirror: 0.7,
    axles: [1.2, -1.2], w: 0.8,
  },
};

// ---- the four builders. `look` = { body, roof?, lower? } colours as sRGB hex.
export function buildCar(kind, look) {
  const L = { M: new Mesher() }, M = L.M;
  const boxes = [];
  if (kind === 'pickup') return buildPickup(L, look);
  const S = SPECS[kind], body = lin(look.body), roof = look.roof ? lin(look.roof) : null;
  S.roofCol = roof;
  bodyAndCabin(L, S, body);
  const w = S.w;
  bumper(L, S.nose - 0.0, 1, w * 0.97, 0.34, 0.52, 0.17, { guards: kind !== 'compact' });
  bumper(L, S.tail + 0.0, -1, w * 0.97, 0.34, 0.52, 0.17, { guards: kind !== 'compact' });
  if (kind === 'compact') { M.box('trim', S.nose, 0.34, -w * 0.96, S.nose + 0.14, 0.5, w * 0.96, { col: C.rubber }); }
  lamps(L, S, kind === 'compact' ? { gy0: 0.52, gy1: 0.68, gw: 0.4, hz: [0.55], hy: 0.62, w: w, ty0: 0.7, ty1: 0.84 } : { gy0: 0.6, gy1: 0.8, gw: 0.52, hz: [0.76, 0.56], hy: 0.72, w: w, ty0: 0.72, ty1: 0.88 });
  plate(L, S.nose + 0.215, 1, 0.38); plate(L, S.tail - 0.215, -1, 0.52);
  finish(L, S, { w });
  for (const x of S.axles) for (const s of [-1, 1]) wheel(L, x, s, w);
  // the quiet details: an exhaust tip, the antenna on the front fender
  M.cyl('chrome', S.tail - 0.12, 0.3, -w * 0.55, 0.035, 0.035, 0.2, 8, WHITE, { rotZ: Math.PI / 2 });
  M.rod('chrome', [S.nose - 0.9, S.belt, -w * 0.9], [S.nose - 0.97, S.belt + 0.85, -w * 0.92], 0.004, 4, WHITE);
  if (kind === 'wagon') {
    // wood: the side panels (a dark frame and the grain), the roof rack
    for (const s of [-1, 1]) {
      M.quad('wood', [[-2.42, 0.46, s * 1.004], [1.7, 0.46, s * 1.004], [1.7, 0.86, s * 1.004], [-2.42, 0.86, s * 1.004]], [0, 0, s], (p) => [p[0] / 1.2, p[1] / 0.6], WHITE);
      for (const y of [0.45, 0.86]) M.box('trim', -2.44, y - 0.012, s * 1.002, 1.72, y + 0.012, s * 1.01, { col: lin('#1d1409') });
      for (const x of [0.58, -0.3, -1.06]) M.box('trim', x - 0.012, 0.46, s * 1.003, x + 0.012, 0.86, s * 1.012, { col: lin('#1d1409') });
    }
    M.quad('wood', [[-2.7, 0.5, 0.2], [-2.7, 0.9, 0.2], [-2.7, 0.9, -0.2], [-2.7, 0.5, -0.2]], [-1, 0, 0], (p) => [p[2], p[1]], WHITE);
    for (const z of [-0.55, 0.55]) M.box('chrome', -2.2, 1.43, z - 0.025, 0.4, 1.47, z + 0.025, { col: WHITE });
    for (const x of [-2.0, -1.2, -0.4, 0.3]) M.box('trim', x - 0.03, 1.43, -0.6, x + 0.03, 1.46, 0.6, { col: C.black });
  }
  if (kind === 'sedan') {                                                      // the vinyl roof: its own darker skin is the roof colour; add the landau bars
    for (const s of [-1, 1]) M.box('chrome', -1.38, 1.02, s * 0.935, -1.24, 1.2, s * 0.945, { col: WHITE });
  }
  const hw = S.w, h = kind === 'compact' ? 1.34 : 1.43;
  boxes.push([S.tail, 0.26, -hw, S.nose, S.belt + 0.04, hw], [S.cab[0][0] + 0.2, S.belt, -hw * 0.9, S.cab[S.cab.length - 1][0] - 0.1, h, hw * 0.9]);
  return { M, boxes, len: S.nose - S.tail, wid: hw * 2, spec: S };
}

function buildPickup(L, look) {
  const M = L.M, upper = lin(look.body), lower = lin(look.lower || look.body);
  const S = {
    mids: [0.72], body: [[-0.9, 0.3, 1.1, 0.96, 0.1], [0.2, 0.28, 1.12, 1.0, 0.09], [1.2, 0.27, 1.12, 1.0, 0.09], [2.1, 0.3, 1.1, 0.99, 0.09], [2.62, 0.34, 1.07, 0.97, 0.1], [2.76, 0.4, 1.02, 0.95, 0.12]],
    cab: [[-0.92, 1.68], [-0.86, 1.72], [0.0, 1.73], [0.5, 1.22]], belt: 1.07, wB: 0.93, wT: 0.85,
    side: [[-0.02, -0.5], [-0.56, -0.82]], ws: [0.08, 0.46], bk: [-0.88, -0.9], bkCap: true, seats: [-0.4],
    nose: 2.75, tail: -2.75, sideMark: 0.62, bumperY: 0.34, shut: [0.28, -0.56], handles: [0.0], moulding: null, mirror: 0.66, w: 1.0,
  };
  // two-tone: white above the belt moulding line (y > 0.66), blue below, the cab in the upper colour
  const two = (p) => (p[1] > 0.7 ? upper : lower);
  bodyAndCabin(L, { ...S, roofCol: upper }, two);
  // the bed: floor, two sides with their wheel humps, the bulkhead, the tailgate
  const fy = 0.72, T = 0.06;
  M.box('carPaint', -2.74, fy - 0.04, -0.93, -0.94, fy, 0.93, { col: lin('#2a2a2c') });                           // the floor (dark)
  for (const s of [-1, 1]) {
    M.box('carPaint', -2.74, 0.42, s * 0.95 - T / 2 * 1, -0.94, 1.12, s * 0.95 + T / 2, { col: lower, faces: s > 0 ? 'fbrul' : 'fblur' });
    M.box('carPaint', -2.74, 0.42, s * 0.95 - T / 2, -0.94, 1.12, s * 0.95 + T / 2, { col: s > 0 ? lower : lower, faces: 'u' });
    M.box('trim', -2.2, fy, s * 0.93 - 0.16, -1.5, fy + 0.18, s * 0.93, { col: C.black });                           // the wheel humps inside
    M.box('chrome', -2.74, 1.11, s * 0.95 - 0.045, -0.94, 1.135, s * 0.95 + 0.045, { col: WHITE });                  // the rail caps
  }
  M.box('carPaint', -1.0, fy, -0.93, -0.94, 1.12, 0.93, { col: upper });                                              // the bulkhead behind the cab
  M.box('carPaint', -2.76, 0.46, -0.95, -2.7, 1.1, 0.95, { col: lower });                                              // the tailgate
  M.box('chrome', -2.77, 0.88, -0.1, -2.75, 0.94, 0.1, { col: WHITE });
  // step bumper at the back, a chrome one at the front, grille and lamps
  M.box('chrome', -2.98, 0.3, -0.95, -2.78, 0.42, 0.95, { col: WHITE }); M.box('trim', -2.98, 0.42, -0.4, -2.8, 0.46, 0.4, { col: C.rubber });
  bumper(L, 2.75, 1, 0.97, 0.34, 0.52, 0.17, { guards: true });
  lamps(L, S, { gy0: 0.56, gy1: 0.92, gw: 0.55, hz: [0.78, 0.52], hy: 0.82, w: 1.0, ty0: 0.76, ty1: 0.92 });
  plate(L, 2.98, 1, 0.38);  plate(L, -2.99, -1, 0.5);
  finish(L, S, { w: 1.0 });
  for (const x of [1.55, -1.85]) for (const s of [-1, 1]) wheel(L, x, s, 1.0, 0.36, 0.26);
  // a two-tone trim line along the belt, a roof marker bar, the antenna
  for (const s of [-1, 1]) M.box('chrome', -2.72, 0.69, s * 1.003, 2.2, 0.705, s * 1.008, { col: WHITE });
  M.rod('chrome', [2.0, 1.0, -0.92], [1.95, 1.9, -0.95], 0.004, 4, WHITE);
  return { M, boxes: [[-2.98, 0.28, -1.0, 2.9, 1.14, 1.0], [-0.95, 1.1, -0.9, 0.55, 1.74, 0.9]], len: 5.9, wid: 2.0, spec: S };
}

// a car's materials (one set for the street's cars)
export function carMaterials(THREE_, nightReflect, aniso, woodTex) {
  const T = THREE_;
  const paint = nightReflect(new T.MeshStandardMaterial({ name: 'M_CarPaint', vertexColors: true, roughness: 0.3, metalness: 0.12 }), { k: 1.35, ceil: 0.45, key: 'carPaint' });
  const glass = nightReflect(new T.MeshStandardMaterial({ name: 'M_CarGlass', vertexColors: true, roughness: 0.1, metalness: 0.0 }), { k: 2.0, ceil: 0.5, key: 'carGlass' });
  const chrome = nightReflect(new T.MeshStandardMaterial({ name: 'M_CarChrome', vertexColors: true, roughness: 0.2, metalness: 1.0 }), { k: 1.6, ceil: 0.55, key: 'carChrome' });
  const trim = new T.MeshStandardMaterial({ name: 'M_CarTrim', vertexColors: true, roughness: 0.75, metalness: 0.0 });
  const wood = nightReflect(new T.MeshStandardMaterial({ name: 'M_CarWood', map: woodTex, vertexColors: true, roughness: 0.55, metalness: 0 }), { k: 0.5, ceil: 0.3, key: 'carWood' });
  const red = new T.MeshStandardMaterial({ name: 'M_CarLampRed', color: 0xb01218, roughness: 0.25, metalness: 0, emissive: 0x6a0408, emissiveIntensity: 0.9 });
  const amber = new T.MeshStandardMaterial({ name: 'M_CarLampAmber', color: 0xd88a1a, roughness: 0.25, metalness: 0, emissive: 0x7a3c04, emissiveIntensity: 0.7 });
  return { carPaint: paint, carGlass: glass, chrome, trim, wood, lampRed: red, lampAmber: amber };
}
