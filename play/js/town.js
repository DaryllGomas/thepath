// THE TOWN BEHIND MAIN STREET (look batch 4, 2026-11-07). Eleven blocks, Town_0..10, were flat dark boxes from Unity with four to eight window quads,
// standing in bare grass. This draws what a 1982 small-town block has, in code, with fixed seeds, into the same Mesher as main street (js/mainstreet.js):
//   walls     brick, painted brick, stucco, in varied 1982 colours, on every face (the Unity box is not drawn; its collider stays)
//   windows   a full grid on every face: recessed glass with frames, sills and heads; about 45 in 100 lit (the window atlas rooms), some dark, some blinds
//   ground    shop fronts with signs, awnings and lit displays; doors with stoops and lamps; roll-up loading doors; blank brick with a downspout
//   roofs     flat with parapets and a setback penthouse, or pitched (a gable), with the old tanks, chimneys, vents; the HOTEL and bank signs stay
//   streets   asphalt for the lane behind the shops, Cedar Lane, the side street's end, aprons and parking in front of each block, sidewalks, kerbs, stall
//             lines, and streetlights on poles under the lamps buildTownLights always had
// ?town=0 draws the town as it was. Everything is merged by material: about five more draw calls. Metres, three's axes; the blocks face +z.
import * as THREE from 'three';
import { lin, mulc, WHITE, lerp, clamp, lcg, paint, tex, speckle, Mesher } from './streetkit.js';
import { brickMaps, Atlas, atlasUv } from './streettex.js';
import { K, awning, rooftop, signQuad } from './streetshops.js';

const warm = (k) => [1.0 * k, 0.72 * k, 0.42 * k];
const boost = (hex, k = 1.5) => mulc(lin(hex), k);

// ---- the blocks: wall kind, colour (sRGB hex, a little lifted for the night), trim, roof
const SPEC = [
  { wall: 'stucco', col: '#c9a35e', trim: '#efe6cf', roof: 'gable', door: '#3a5a42' },
  { wall: 'brick', col: '#ffffff', trim: '#e6dcc2', roof: 'flat', door: '#5a2a1e' },
  { wall: 'pbrick', col: '#a9bba4', trim: '#f0ede0', roof: 'flat', top: true, door: '#26407a' },
  { wall: 'brick', col: '#c9a898', trim: '#d9cfb6', roof: 'flat', door: '#1c3a2b' },
  { wall: 'pbrick', col: '#d4bd93', trim: '#f2eee2', roof: 'flat', door: '#4a1a1e' },
  { wall: 'stucco', col: '#cfa497', trim: '#f0e6d6', roof: 'gable', door: '#2c4660' },
  { wall: 'brick', col: '#f0d8c8', trim: '#e0d6bc', roof: 'flat', top: true, door: '#3a281a' },
  { wall: 'pbrick', col: '#9fb6cb', trim: '#f2f0e6', roof: 'gable', door: '#7a2a24' },
  { wall: 'brick', col: '#b88a78', trim: '#d6ccb2', roof: 'flat', door: '#1c2a52' },
  { wall: 'stucco', col: '#cfcabb', trim: '#f4f0e4', roof: 'flat', door: '#3a281a' },
  { wall: 'stucco', col: '#a3b078', trim: '#efe9d4', roof: 'gable', door: '#5a2a1e' },
];
const AWN = [['#8e1f26', '#cdc6ac'], ['#1f4a38', '#cfc8ae'], ['#1c2a52', '#d2ccb2'], ['#c48f14', '#d6cfb4'], ['#4a1a1e', '#cdc6ac']];
const SIGNS = [['hardware', 'HARDWARE', '#1c3a2b', '#e8dfc0'], ['laundromat', 'LAUNDROMAT', '#1c2a52', '#f0ead2'], ['pizza', 'PIZZA & SUBS', '#8e1f26', '#f4e8c8'],
  ['tvrepair', 'TV & RADIO REPAIR', '#2a2826', '#e8c860'], ['fivedime', 'FIVE & DIME', '#a21c1c', '#f6eed2'], ['insurance', 'INSURANCE', '#3a281a', '#e0d4a8'],
  ['shoerepair', 'SHOE REPAIR', '#4a3524', '#ecdcae'], ['bakery', 'BAKERY', '#d8cfae', '#6a2a24'], ['florist', 'FLORIST', '#2d4a30', '#f4e6e0'], ['records', 'RECORDS & TAPES', '#26407a', '#f4ecd0']];

let _SA = null;
const townSA = () => (_SA = _SA || townSigns());
function townSigns() {
  const A = new Atlas(1024, 480);
  for (const [name, text, bg, fg] of SIGNS) A.add(name, 512, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.globalAlpha = 0.75; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12); g.globalAlpha = 1;
    let fs = 54; g.font = `bold ${fs}px Georgia, serif`; while (g.measureText(text).width > w - 40 && fs > 20) { fs -= 2; g.font = `bold ${fs}px Georgia, serif`; }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
    const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(8,4,2,0.35)'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  return A;
}

// ---- the extra materials: painted brick (the street's brick map without its red), stucco, asphalt, the shop signs
export function townMaterials(A, THREE_, brickRaw) {
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const rand = lcg(404), SA = townSA();
  const grey = paint(512, 516, (g, w, h) => { g.filter = 'grayscale(1) brightness(1.75) contrast(0.9)'; g.drawImage(brickRaw.color, 0, 0); g.filter = 'none'; });
  const stucco = paint(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(214,208,198)'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = 150 + rand() * 90; g.fillStyle = `rgba(${v | 0},${(v * 0.97) | 0},${(v * 0.92) | 0},0.5)`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3); }
    for (let i = 0; i < 10; i++) { const x = rand() * w, grd = g.createLinearGradient(x, 0, x, h); grd.addColorStop(0, 'rgba(30,24,18,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x, 0, 4 + rand() * 12, h); }
  });
  const asph = paint(256, 256, (g, w, h) => {
    g.fillStyle = 'rgb(62,60,58)'; g.fillRect(0, 0, w, h);
    speckle(rand, g, w, h, 7000, 0.22, 1.5);
    for (let i = 0; i < 14; i++) { const x = rand() * w, y = rand() * h; g.strokeStyle = 'rgba(8,8,10,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) g.lineTo(x + (rand() - 0.5) * 70, y + (rand() - 0.5) * 70); g.stroke(); }
    for (let i = 0; i < 6; i++) { const x = rand() * w, y = rand() * h, r = 12 + rand() * 30; g.fillStyle = 'rgba(20,20,22,0.3)'; g.beginPath(); g.ellipse(x, y, r, r * 0.6, rand() * 3, 0, 7); g.fill(); }
  });
  const sg = tex(SA.c, A, { clamp: true });
  const bump = tex(brickRaw.height, A, { data: true });
  return {
    sa: SA,
    mats: {
      pbrick: S({ name: 'M_TownPaintedBrick', map: tex(grey, A), bumpMap: bump, bumpScale: 0.012, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      stucco: S({ name: 'M_TownStucco', map: tex(stucco, A), vertexColors: true, roughness: 0.96, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      asph: S({ name: 'M_TownAsphalt', map: tex(asph, A), vertexColors: true, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
      tsign: new THREE.MeshBasicMaterial({ name: 'M_TownSign', map: sg, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }),
    },
  };
}

// ---- parts, all in a face's own frame: the wall is the plane z = 0 facing +z, x runs across (centre 0), y is world height
const quadZ = (M, key, x0, x1, y0, y1, z, uv, col) => { if (y1 - y0 > 1e-4 && x1 - x0 > 1e-4) M.quad(key, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], uv, col); };
function wallHoles(M, key, x0, x1, y0, y1, holes, col, uv) {
  const cuts = [...new Set([x0, x1, ...holes.flatMap((h) => [h.x0, h.x1])].filter((v) => v >= x0 - 1e-6 && v <= x1 + 1e-6).map((v) => +v.toFixed(4)))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1]; if (b - a < 1e-4) continue;
    const hs = holes.filter((h) => h.x0 <= a + 1e-5 && h.x1 >= b - 1e-5).sort((p, q) => p.y0 - q.y0);
    let y = y0; for (const h of hs) { quadZ(M, key, a, b, y, h.y0, 0, uv, col); y = h.y1; } quadZ(M, key, a, b, y, y1, 0, uv, col);
  }
}
// a window: a recess in the wall with the room's glass at the back, a casing, a sill and a head, a meeting rail. Returns its hole.
function windowAt(M, F, cx, y0, w, h, o) {
  const d = 0.13, f = o.f ?? 0.08, trim = o.trim, x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h, rv = mulc(o.wall, 0.45);
  const L = F.litP, r = F.rand();
  let cell, k;
  if (r < L) { cell = F.cells[Math.floor(F.rand() * F.cells.length)]; k = 0.62 + 0.3 * F.rand(); } else { cell = 'dark'; k = 0.5 + 0.2 * F.rand(); }
  M.quad('glass', [[x0, y0, -d], [x1, y0, -d], [x1, y1, -d], [x0, y1, -d]], [0, 0, 1], atlasUv(F.WA.rect(cell), x0, x1, y0, y1, 0), mulc(WHITE, k));
  M.quad('paint', [[x0, y0, 0], [x0, y0, -d], [x0, y1, -d], [x0, y1, 0]], [1, 0, 0], () => [0, 0], rv);
  M.quad('paint', [[x1, y0, 0], [x1, y0, -d], [x1, y1, -d], [x1, y1, 0]], [-1, 0, 0], () => [0, 0], rv);
  M.quad('paint', [[x0, y1, 0], [x1, y1, 0], [x1, y1, -d], [x0, y1, -d]], [0, -1, 0], () => [0, 0], mulc(rv, 0.6));
  M.quad('paint', [[x0, y0, 0], [x1, y0, 0], [x1, y0, -d], [x0, y0, -d]], [0, 1, 0], () => [0, 0], mulc(rv, 1.2));
  M.box('paint', x0 - f, y0 - f, 0, x0, y1 + f, 0.06, { col: trim, faces: 'blu' });
  M.box('paint', x1, y0 - f, 0, x1 + f, y1 + f, 0.06, { col: trim, faces: 'bru' });
  M.box('paint', x0, y1, 0, x1, y1 + f, 0.06, { col: trim, faces: 'bu' });
  M.box('paint', x0 - f - 0.04, y0 - f - 0.05, 0, x1 + f + 0.04, y0 - f + 0.01, 0.16, { col: o.sill || K.stone, faces: 'bulrd' });
  if (o.head) M.box('paint', x0 - f - 0.05, y1 + f, 0, x1 + f + 0.05, y1 + f + 0.1, 0.1, { col: o.sill || K.stone, faces: 'bulr' });
  M.box('paint', cx - 0.016, y0, -d + 0.01, cx + 0.016, y1, -d + 0.045, { col: trim, faces: 'b' });
  M.box('paint', x0, (y0 + y1) / 2 - 0.016, -d + 0.01, x1, (y0 + y1) / 2 + 0.016, -d + 0.045, { col: trim, faces: 'b' });
  if (F.rand() < 0.18 && o.shut) {                                   // shutters on the clapboard-and-stucco ones
    M.box('paint', x0 - f - 0.5, y0 - f, 0, x0 - f - 0.02, y1 + f, 0.05, { col: o.shut, faces: 'b' }); M.box('paint', x1 + f + 0.02, y0 - f, 0, x1 + f + 0.5, y1 + f, 0.05, { col: o.shut, faces: 'b' });
  }
  return { x0, x1, y0, y1 };
}
function lampOn(M, x, y, k = 1) {                                      // a wall lamp: bracket, shade, bulb, and its pool of light on the wall
  M.box('metal', x - 0.08, y - 0.06, 0, x + 0.08, y + 0.1, 0.18, { col: K.iron, faces: 'bulrf' });
  M.box('glow', x - 0.05, y - 0.05, 0.19, x + 0.05, y + 0.02, 0.22, { col: [3.0 * k, 2.1 * k, 1.1 * k], faces: 'b' });
  M.quad('pool', [[x - 1.6, y - 1.5, 0.03], [x + 1.6, y - 1.5, 0.03], [x + 1.6, y + 1.5, 0.03], [x - 1.6, y + 1.5, 0.03]], [0, 0, 1], (p) => [(p[0] - x) / 3.2 + 0.5, (p[1] - y) / 3 + 0.5], warm(0.5 * k));
}
function doorAt(M, F, cx, y0, w, h, col, trim, o = {}) {
  M.box('conc', cx - w / 2 - 0.25, y0 - 0.02, 0, cx + w / 2 + 0.25, y0 + 0.17, 0.75, { col: K.stone, faces: 'bulrf' });               // the stoop
  M.box('paint', cx - w / 2 - 0.08, y0, 0, cx + w / 2 + 0.08, y0 + h + 0.08, 0.08, { col: trim, faces: 'blru' });                      // the casing
  M.box('paint', cx - w / 2, y0 + 0.17, 0.02, cx + w / 2, y0 + h, 0.1, { col, faces: 'blr' });                                       // the door
  M.box('paint', cx - w / 2 + 0.12, y0 + h * 0.5, 0.1, cx + w / 2 - 0.12, y0 + h - 0.12, 0.115, { col: K.black, faces: 'b' });          // its glass, dark
  M.quad('glass', [[cx - w / 2 + 0.12, y0 + h * 0.5, 0.118], [cx + w / 2 - 0.12, y0 + h * 0.5, 0.118], [cx + w / 2 - 0.12, y0 + h - 0.12, 0.118], [cx - w / 2 + 0.12, y0 + h - 0.12, 0.118]], [0, 0, 1],
    atlasUv(F.WA.rect(o.cell || 'bulb'), cx - w / 2 + 0.12, cx + w / 2 - 0.12, y0 + h * 0.5, y0 + h - 0.12, 0), mulc(WHITE, 0.55));
  M.box('metal', cx + w / 2 - 0.17, y0 + h * 0.42, 0.1, cx + w / 2 - 0.08, y0 + h * 0.42 + 0.05, 0.19, { col: K.alum, faces: 'bu' });  // the handle
  if (o.lamp !== false) lampOn(M, cx - w / 2 - 0.55, y0 + h + 0.15, 0.9);
  for (let s = 0; s < 3; s++) M.quad('spill', [[cx - w / 2 - 0.3, y0 + 0.004, 0.8 + s * 0.5], [cx + w / 2 + 0.3, y0 + 0.004, 0.8 + s * 0.5], [cx + w / 2 + 0.3, y0 + 0.004, 1.3 + s * 0.5], [cx - w / 2 - 0.3, y0 + 0.004, 1.3 + s * 0.5]], [0, 1, 0], () => [0, 0], warm(0.1 * (1 - s / 3)));
}
function garageAt(M, cx, y0, w, h, col) {                                // a roll-up door: the slats, a lintel
  M.box('paint', cx - w / 2 - 0.1, y0, 0, cx - w / 2, y0 + h + 0.12, 0.1, { col: K.stone, faces: 'blru' }); M.box('paint', cx + w / 2, y0, 0, cx + w / 2 + 0.1, y0 + h + 0.12, 0.1, { col: K.stone, faces: 'blru' });
  M.box('paint', cx - w / 2 - 0.1, y0 + h, 0, cx + w / 2 + 0.1, y0 + h + 0.14, 0.12, { col: K.stone, faces: 'bul' });
  for (let y = y0; y < y0 + h - 0.01; y += 0.22) M.box('metal', cx - w / 2, y, 0.015, cx + w / 2, y + 0.2, 0.05, { col: col, faces: 'bu' });
}
function shopBay(M, F, x0, x1, gf, y0, sign, awn, o) {                  // one shop front across x0..x1: display window, door, sign, awning, lamp
  const bw = x1 - x0, dw = Math.min(1.05, bw * 0.28), winX1 = x1 - dw - 0.7, winX0 = x0 + 0.3, hole = [];
  const wy0 = y0 + 0.62, wy1 = y0 + 2.4;
  const cells = ['lamp', 'kitchen', 'office', 'tv', 'bulb'], cell = cells[Math.floor(F.rand() * cells.length)];
  M.quad('glass', [[winX0, wy0, -0.16], [winX1, wy0, -0.16], [winX1, wy1, -0.16], [winX0, wy1, -0.16]], [0, 0, 1], atlasUv(F.WA.rect(cell), winX0, winX1, wy0, wy1, 0), mulc(WHITE, 0.85));
  hole.push({ x0: winX0, x1: winX1, y0: wy0, y1: wy1 });
  const dk = mulc(F.spec.wallc, 0.35);
  for (const [a, b, c, d, n] of [[winX0, wy0, winX0, wy1, [1, 0, 0]], [winX1, wy0, winX1, wy1, [-1, 0, 0]]]) M.quad('paint', [[a, b, 0], [a, b, -0.16], [c, d, -0.16], [c, d, 0]], n, () => [0, 0], dk);
  M.quad('paint', [[winX0, wy1, 0], [winX1, wy1, 0], [winX1, wy1, -0.16], [winX0, wy1, -0.16]], [0, -1, 0], () => [0, 0], dk);
  M.box('paint', winX0 - 0.1, wy0 - 0.1, 0, winX1 + 0.1, wy0, 0.12, { col: F.spec.base, faces: 'bulr' });                              // the stall riser under the glass: painted wood
  M.box('paint', winX0 - 0.1, wy0 - 0.62, 0, winX1 + 0.1, wy0 - 0.1, 0.05, { col: F.spec.base, faces: 'bu' });
  M.box('paint', winX0 - 0.1, wy1, 0, winX1 + 0.1, wy1 + 0.1, 0.1, { col: F.spec.base, faces: 'bul' });
  for (const x of [winX0 - 0.1, winX1]) M.box('paint', x, wy0, 0, x + 0.1, wy1, 0.1, { col: F.spec.base, faces: 'blr' });
  const n = Math.max(1, Math.round((winX1 - winX0) / 1.4));
  for (let i = 1; i < n; i++) { const x = lerp(winX0, winX1, i / n); M.box('paint', x - 0.025, wy0, -0.12, x + 0.025, wy1, -0.07, { col: F.spec.base, faces: 'b' }); }
  doorAt(M, F, x1 - dw / 2 - 0.25, y0, dw, 2.2, F.spec.doorc, F.spec.base, { cell: 'dark', lamp: o.lamp });
  // sign board above, an awning over the window
  const sx0 = x0 + 0.2, sx1 = x1 - 0.2, sy0 = y0 + 2.5, sy1 = Math.min(y0 + gf - 0.12, sy0 + 0.62);
  M.box('paint', sx0 - 0.05, sy0 - 0.05, 0, sx1 + 0.05, sy1 + 0.05, 0.1, { col: F.spec.base, faces: 'blru' });
  M.quad('tsign', [[sx0, sy0, 0.105], [sx1, sy0, 0.105], [sx1, sy1, 0.105], [sx0, sy1, 0.105]], [0, 0, 1], atlasUv(F.SA.rect(sign), sx0, sx1, sy0, sy1, 0), mulc(WHITE, 1.0));
  if (awn) awning(M, winX0 - 0.1, winX1 + 0.1, 0.02, y0 + 2.46, 1.0, 0.45, lin(awn[0]), lin(awn[1]), { under: 0.8 });
  for (let s = 0; s < 4; s++) M.quad('spill', [[winX0, y0 + 0.004, 0.2 + s * 0.45], [winX1, y0 + 0.004, 0.2 + s * 0.45], [winX1, y0 + 0.004, 0.65 + s * 0.45], [winX0, y0 + 0.004, 0.65 + s * 0.45]], [0, 1, 0], () => [0, 0], warm(0.14 * (1 - s / 4)));
  return hole;
}

// ---- one face of a block. kind: 'front' (shops), 'side', 'back'. Returns a Mesher in the face's own frame.
function faceMesh(ctx, spec, w, y0, top, kind, nF, seedKey) {
  const { WA } = ctx, SA = townSA(), S = new Mesher(), rand = lcg(1982 + seedKey * 31);
  const F = { WA, SA, rand, litP: kind === 'front' ? 0.52 : 0.42, cells: ['lamp', 'lamp', 'blinds', 'tv', 'bulb', 'shade', 'kitchen', 'office'], spec };
  const gf = Math.max(3.5, (top - y0) / nF + 0.3), fu = (top - y0 - gf) / Math.max(1, nF - 1);
  const wk = spec.wall, wsc = spec.wall === 'stucco' ? 2.4 : 0.9, wallUv = (p) => [(p[0] + seedKey * 3.1) / wsc, p[1] / wsc];
  const holes = [];
  const trim = spec.trimc, wallc = spec.wallc;
  // the upper floors: a window per column
  const ncol = Math.max(2, Math.round((w - 1.4) / (kind === 'front' ? 2.3 : 2.9)));
  for (let k = 1; k < nF; k++) {
    const fy = y0 + gf + (k - 1) * fu, avail = fu - (k === nF - 1 ? 0.55 : 0), wh = clamp(avail - 1.15, 1.2, 1.9), sillY = fy + (avail - wh) / 2 + 0.05;
    for (let c = 0; c < ncol; c++) {
      const cx = -w / 2 + 0.7 + (w - 1.4) * (c + 0.5) / ncol;
      holes.push(windowAt(S, F, cx, sillY, 1.1, wh, { trim, wall: wallc, sill: K.stone, head: k === nF - 1 || spec.wall !== 'brick', shut: spec.wall === 'stucco' ? mulc(wallc, 0.4) : null }));
    }
    if (k < nF) S.box('paint', -w / 2, fy - 0.07, 0, w / 2, fy + 0.07, 0.09, { col: mulc(trim, 0.8), faces: 'bud' });             // a string course at each floor line
  }
  // the ground floor
  if (kind === 'front') {
    const nb = Math.max(2, Math.round((w - 0.8) / 4.6)), bw = (w - 0.8) / nb;
    const signs = rand() * SIGNS.length | 0;
    for (let b = 0; b < nb; b++) {
      const x0 = -w / 2 + 0.4 + b * bw, x1 = x0 + bw, t = (b + seedKey) % 5;
      if (t === 2 && nb > 2) {                                          // an apartment door and a window by it
        doorAt(S, F, x0 + bw * 0.62, y0, 1.1, 2.25, spec.doorc, trim);
        holes.push(windowAt(S, F, x0 + bw * 0.2, y0 + 1.0, 0.95, 1.35, { trim, wall: wallc, sill: K.stone }));
      } else if (t === 4 && nb > 2) {                                   // a loading door
        garageAt(S, x0 + bw / 2, y0, Math.min(3.2, bw - 0.6), 2.7, mulc(lin('#8a8c88'), 1.0));
        lampOn(S, x0 + 0.35, y0 + 3.0, 0.8);
      } else {
        for (const h of shopBay(S, F, x0 + 0.05, x1 - 0.05, gf, y0, SIGNS[(signs + b * 3 + seedKey) % SIGNS.length][0], rand() < 0.65 ? AWN[(b + seedKey) % AWN.length] : null, { lamp: b % 2 === 0 })) holes.push(h);
      }
    }
  } else {
    const nc = Math.max(2, Math.floor((w - 1.0) / 3.2)), cw = (w - 1.0) / nc;
    let doors = 0;
    for (let c = 0; c < nc; c++) {
      const cx = -w / 2 + 0.5 + cw * (c + 0.5), r = rand();
      if ((c === 0 && kind === 'back') || (r < 0.28 && doors < 2) || (c === nc - 1 && doors === 0)) { doors++; doorAt(S, F, cx, y0, 1.0, 2.15, spec.doorc, trim, { cell: 'dark' }); }
      else if (r < 0.45 && kind === 'back') { garageAt(S, cx, y0, Math.min(2.8, cw - 0.5), 2.5, lin('#7f817c')); lampOn(S, cx - 1.7, y0 + 2.9, 0.7); }
      else if (r < 0.8) holes.push(windowAt(S, F, cx, y0 + 1.15, 1.0, 1.25, { trim, wall: wallc, sill: K.stone, shut: spec.wall === 'stucco' ? mulc(wallc, 0.4) : null }));
      else { M_pipe(S, cx, y0, y0 + gf + (nF - 1) * fu); }
    }
  }
  wallHoles(S, wk, -w / 2, w / 2, y0 - 0.25, top, holes, wallc, wallUv);
  // the base course, quoins at the corners, the cornice
  S.box('conc', -w / 2, y0 - 0.25, 0, w / 2, y0 + 0.42, 0.06, { col: mulc(K.stone, 0.8), faces: 'bu' });
  for (const sx of [-1, 1]) S.box('paint', sx < 0 ? -w / 2 : w / 2 - 0.34, y0, 0, sx < 0 ? -w / 2 + 0.34 : w / 2, top, 0.05, { col: mulc(trim, 0.78), faces: 'b' });
  S.box('paint', -w / 2 - 0.1, top - 0.5, 0, w / 2 + 0.1, top - 0.12, 0.24, { col: mulc(trim, 0.7), faces: 'bud' });
  S.box('paint', -w / 2 - 0.14, top - 0.12, 0, w / 2 + 0.14, top + 0.08, 0.4, { col: trim, faces: 'bulrud' });
  // the street's light washing up the face: a soft warm pool from the lamp at the foot of it
  S.quad('pool', [[-w / 2, y0 - 0.2, 0.05], [w / 2, y0 - 0.2, 0.05], [w / 2, Math.min(top, y0 + 8.5), 0.05], [-w / 2, Math.min(top, y0 + 8.5), 0.05]], [0, 0, 1], (p) => [(p[0] + w / 2 + 2) / (w + 4), (p[1] - y0 + 4) / 12.5], warm(kind === 'front' ? 0.26 : 0.16));
  return S;
}
function M_pipe(S, x, y0, y1) { S.rod('metal', [x, y0, 0.09], [x, y1 - 0.4, 0.09], 0.05, 6, K.iron); S.box('metal', x - 0.07, y0 + 0.25, 0.04, x + 0.07, y0 + 0.28, 0.14, { col: K.iron, faces: 'bu' }); }

// ---- a streetlight on a pole (the head sits where buildTownLights' lamp dot always floated), its pool of light on the ground
function streetlight(ctx, x, z, y0, h = 4.5, arm = [0.0, 0.0]) {
  const { M } = ctx;
  M.rod('metal', [x, y0 - 0.1, z], [x, y0 + h, z], 0.07, 6, K.iron);
  M.box('metal', x - 0.14, y0, z - 0.14, x + 0.14, y0 + 0.5, z + 0.14, { col: K.iron, faces: 'fblrud' });
  M.box('metal', x - 0.17, y0 + h - 0.08, z - 0.08, x + 0.17, y0 + h, z + 0.08, { col: K.iron, faces: 'fblrud' });
  M.box('glow', x - 0.17, y0 + h + 0.02, z - 0.17, x + 0.17, y0 + h + 0.18, z + 0.17, { col: [3.4, 2.1, 0.9], faces: 'fblrud' });
  void arm;
  ctx.colliders.push([x - 0.16, y0 - 0.1, z - 0.16, x + 0.16, y0 + h, z + 0.16]);
  const R = 6.5;
  M.quad('pool', [[x - R, y0 + 0.025, z - R], [x + R, y0 + 0.025, z - R], [x + R, y0 + 0.025, z + R], [x - R, y0 + 0.025, z + R]], [0, 1, 0], (p) => [(p[0] - x) / (2 * R) + 0.5, (p[2] - z) / (2 * R) + 0.5], warm(0.6));
}

const specOf = (i) => {
  const S = SPEC[i % SPEC.length], k = S.wall === 'brick' ? 3.0 : S.wall === 'pbrick' ? 1.9 : 1.9;      // the night's light is weak: the walls' albedo is lifted to read in it
  return { ...S, wallc: mulc(lin(S.col), k), trimc: boost(S.trim, 1.35), doorc: lin(S.door), base: lin(S.door) };
};
// ---- the whole town
export function buildTown(ctx, O, groundAt) {
  const { M, WA, rand } = ctx;
  const blocks = [];
  for (let i = 0; i <= 10; i++) {
    const o = O.get('Outside/Town/Town_' + i); if (!o) continue;
    const [cx, cy, cz] = o.pos, [sx, sy, sz] = o.scale;
    blocks.push({ i, cx, cz, sx, sy, sz, x0: cx - sx / 2, x1: cx + sx / 2, zf: cz + sz / 2, zb: cz - sz / 2, y0: cy - sy / 2, top: cy + sy / 2, o });
  }
  const gY = (x, z, d = -37.1) => { const y = groundAt ? groundAt(x, z) : null; return (y == null ? d : y); };
  let calls = 0;
  for (const b of blocks) {
    const spec = specOf(b.i);
    const { x0, x1, zf, zb, y0, top, sx, sz, cx, cz } = b, nF = clamp(Math.round((top - y0) / 3.3), 2, 4), gy = y0;
    const place = (S, px, pz, yaw) => { M.append(S, new THREE.Matrix4().makeTranslation(px, 0, pz).multiply(new THREE.Matrix4().makeRotationY(yaw))); };
    place(faceMesh(ctx, spec, sx, gy, top, 'front', nF, b.i * 4 + 0), cx, zf, 0);
    place(faceMesh(ctx, spec, sz, gy, top, 'side', nF, b.i * 4 + 1), x1, cz, Math.PI / 2);
    place(faceMesh(ctx, spec, sz, gy, top, 'side', nF, b.i * 4 + 2), x0, cz, -Math.PI / 2);
    place(faceMesh(ctx, spec, sx, gy, top, 'back', nF, b.i * 4 + 3), cx, zb, Math.PI);
    // the roof
    const wk = spec.wall, wsc = spec.wall === 'stucco' ? 2.4 : 0.9, wuv = (p) => [(p[0] + p[2]) / wsc, p[1] / wsc];
    if (spec.roof === 'gable') {
      const rise = Math.min(2.3, sz * 0.2), ov = 0.35, zc = cz, hy = top + rise;
      M.quad('roof', [[x0 - ov, top - 0.1, zf + ov], [x1 + ov, top - 0.1, zf + ov], [x1 + ov, hy, zc], [x0 - ov, hy, zc]], [0, 0.6, 0.8], (p) => [p[0] / 1.2, p[2] / 1.2 + p[1] / 1.5], WHITE);
      M.quad('roof', [[x0 - ov, top - 0.1, zb - ov], [x1 + ov, top - 0.1, zb - ov], [x1 + ov, hy, zc], [x0 - ov, hy, zc]], [0, 0.6, -0.8], (p) => [p[0] / 1.2, -p[2] / 1.2 + p[1] / 1.5], WHITE);
      for (const [x, nx] of [[x0, -1], [x1, 1]]) {
        M.quad(wk, [[x, top, zb], [x, top, zf], [x, hy - 0.08, zc]], [nx, 0, 0], (p) => [p[2] / wsc, p[1] / wsc], spec.wallc);
        M.quad('paint', [[x + nx * 0.03, top - 0.05, zf + ov], [x + nx * 0.03, hy + 0.02, zc], [x + nx * 0.03, top - 0.05, zb - ov]], [nx, 0, 0], () => [0, 0], mulc(spec.trimc, 0.6));
      }
      M.box('paint', x0 - ov, hy - 0.06, zc - 0.1, x1 + ov, hy + 0.08, zc + 0.1, { col: K.tar, faces: 'u' });
      rooftop(M, rand, 'chimney', lerp(x0 + 1.5, x1 - 1.5, 0.3 + 0.4 * rand()), zc + (rand() < 0.5 ? 0.6 : -0.6), top + rise * 0.55);
    } else {
      const p = 0.62;                                                  // the parapet and its coping, all round; the roof inside
      M.box(wk, x0, top, zf - 0.22, x1, top + p, zf, { col: spec.wallc, uv: wuv, faces: 'fbu' }); M.box(wk, x0, top, zb, x1, top + p, zb + 0.22, { col: spec.wallc, uv: wuv, faces: 'fb' });
      M.box(wk, x0, top, zb, x0 + 0.22, top + p, zf, { col: spec.wallc, uv: wuv, faces: 'lr' }); M.box(wk, x1 - 0.22, top, zb, x1, top + p, zf, { col: spec.wallc, uv: wuv, faces: 'lr' });
      for (const [a, c, d, e] of [[x0 - 0.06, zf - 0.28, x1 + 0.06, zf + 0.06], [x0 - 0.06, zb - 0.06, x1 + 0.06, zb + 0.28], [x0 - 0.06, zb, x0 + 0.28, zf], [x1 - 0.28, zb, x1 + 0.06, zf]]) M.box('conc', a, top + p, c, d, top + p + 0.07, e, { col: K.stone, faces: 'ud' });
      M.quad('roof', [[x0 + 0.22, top + 0.012, zf - 0.22], [x1 - 0.22, top + 0.012, zf - 0.22], [x1 - 0.22, top + 0.012, zb + 0.22], [x0 + 0.22, top + 0.012, zb + 0.22]], [0, 1, 0], (q) => [q[0], q[2]], WHITE);
      if (spec.top) {                                                  // a setback: the stair and machine room on the back half
        const px0 = lerp(x0, x1, 0.12), px1 = lerp(x0, x1, 0.5), pz0 = zb + 1.2, pz1 = zb + sz * 0.45, ph = 2.5;
        M.box(wk, px0, top, pz0, px1, top + ph, pz1, { col: mulc(spec.wallc, 0.9), uv: wuv, faces: 'fblr' });
        M.quad('roof', [[px0 - 0.1, top + ph + 0.012, pz0 - 0.1], [px1 + 0.1, top + ph + 0.012, pz0 - 0.1], [px1 + 0.1, top + ph + 0.012, pz1 + 0.1], [px0 - 0.1, top + ph + 0.012, pz1 + 0.1]], [0, 1, 0], (q) => [q[0], q[2]], WHITE);
        M.box('paint', px0 - 0.1, top + ph - 0.08, pz0 - 0.1, px1 + 0.1, top + ph + 0.03, pz1 + 0.1, { col: spec.trimc, faces: 'fblrud' });
        M.box('paint', px0 + 0.6, top, pz1, px0 + 1.6, top + 2.0, pz1 + 0.06, { col: spec.doorc, faces: 'b' });
      }
      const kinds = [['ac', 'vent'], ['tank'], ['vent'], ['tank', 'ac'], ['skylight', 'vent', 'ac'], ['antenna'], ['ac', 'skylight'], ['vent', 'chimney'], ['tank', 'vent'], ['antenna', 'ac'], ['chimney']][b.i % 11];
      kinds.forEach((k, j) => rooftop(M, rand, k, lerp(x0 + 1.5, x1 - 1.5, (j + 0.5) / kinds.length) + (rand() - 0.5) * 1.2, lerp(zb + 1.5, zf - 1.6, 0.3 + 0.4 * rand()), top));
    }
    calls++;
    // the streetlight at the block's front corner (where the night lights' lamp dot hangs)
    streetlight(ctx, x0 - 1.3, zf + 1.3, y0, 4.5);
    // the sidewalk along the front, with a kerb; the apron of asphalt in front of it
    const sw1 = zf + 2.4;
    M.quad('walk', [[x0 - 0.6, gy + 0.03, zf], [x1 + 0.6, gy + 0.03, zf], [x1 + 0.6, gy + 0.03, sw1], [x0 - 0.6, gy + 0.03, sw1]], [0, 1, 0], (q) => [q[0], Math.abs(q[2] - sw1)], WHITE);
    M.box('conc', x0 - 0.6, gy, sw1, x1 + 0.6, gy + 0.14, sw1 + 0.15, { col: K.conc, faces: 'fbu' });
    b.apron = sw1 + 0.15;
  }
  // the backs of the eight shops, which face the lane: the same walls, windows, back doors and loading doors, as a veneer 0.2 m proud of Unity's box
  for (let i = 0; i <= 7; i++) {
    const o = O.get('Outside/MainStreet/Shop_' + i); if (!o) continue;
    const [cx, cy, cz] = o.pos, [sx, sy, sz] = o.scale, top = cy + sy / 2, y0 = cy - sy / 2, spec = specOf([1, 3, 6, 8, 1, 6, 3, 8][i]);
    M.append(faceMesh(ctx, spec, sx, y0, top, 'back', clamp(Math.round(sy / 3.3), 2, 3), 60 + i), new THREE.Matrix4().makeTranslation(cx, 0, cz - sz / 2 - 0.2).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
  }
  // the shops' end walls on the lane and the side street (drawn dark by mainstreet.js's sideWall): the lamps' light on them
  for (const [i, side] of [[0, -1], [1, 1], [2, -1], [7, 1]]) {
    const o = O.get('Outside/MainStreet/Shop_' + i); if (!o) continue;
    const x = side < 0 ? o.pos[0] - o.scale[0] / 2 : o.pos[0] + o.scale[0] / 2, top = o.pos[1] + o.scale[1] / 2, yb = o.pos[1] - o.scale[1] / 2, xs = x + side * 0.07;
    M.quad('pool', [[xs, yb, -167.2], [xs, yb, -176.2], [xs, Math.min(top, yb + 8.5), -176.2], [xs, Math.min(top, yb + 8.5), -167.2]], [side, 0, 0], (p) => [(-p[2] - 167.2 + 4) / 17, (p[1] - yb + 4) / 12.5], warm(0.15));
  }
  // ---- asphalt: laid in 4 m cells that follow the ground, kept out of the blocks
  const rects = blocks.map((b) => [b.x0 - 0.7, b.x1 + 0.7, b.zb - 0.7, b.zf + 2.7]);
  const asphalt = (xa, xb, za, zb2) => {
    const step = 5;
    for (let x = xa; x < xb - 1e-6; x += step) for (let z = za; z < zb2 - 1e-6; z += step) {
      const x1 = Math.min(xb, x + step), z1 = Math.min(zb2, z + step), cxm = (x + x1) / 2, czm = (z + z1) / 2;
      if (rects.some((r) => cxm > r[0] && cxm < r[1] && czm > r[2] && czm < r[3])) continue;
      const P = [[x, z], [x1, z], [x1, z1], [x, z1]].map(([px, pz]) => [px, gY(px, pz) + 0.035, pz]);
      M.quad('asph', P, [0, 1, 0], (q) => [q[0] / 5, q[2] / 5], mulc(WHITE, 0.95 + 0.1 * Math.sin(x * 1.7 + z * 2.3)));
    }
  };
  asphalt(-76, 76, -188.5, -177.5);            // the lane behind the shops
  asphalt(-0.5, 6.0, -228, -188);               // Cedar Lane, running up between the blocks
  asphalt(62.5, 69.5, -204.4, -184);              // the side street, on past the lane
  for (const b of blocks) asphalt(b.x0 - 1, b.x1 + 1, b.apron, b.apron + 7);   // a lot in front of each block
  // stall lines and a few lane marks along the back lane's north side; a centre line down Cedar Lane
  for (let x = -62; x <= 60; x += 2.9) if (!(x > -3 && x < 8) && !(x > 60 && x < 71)) M.quad('roadpaint', [[x - 0.05, gY(x, -188.4) + 0.045, -188.3], [x + 0.05, gY(x, -188.4) + 0.045, -188.3], [x + 0.05, gY(x, -185.6) + 0.045, -185.5], [x - 0.05, gY(x, -185.6) + 0.045, -185.5]], [0, 1, 0], () => [0, 0], mulc(WHITE, 0.8));
  for (let z = -190; z > -225; z -= 3) M.quad('roadpaint', [[2.65, gY(2.8, z) + 0.045, z], [2.85, gY(2.8, z) + 0.045, z], [2.85, gY(2.8, z - 1.5) + 0.045, z - 1.5], [2.65, gY(2.8, z - 1.5) + 0.045, z - 1.5]], [0, 1, 0], () => [0, 0], mulc([0.9, 0.78, 0.3], 0.8));
  // streetlights along the back lane and Cedar Lane, the side street's end
  for (const [x, z] of [[-60, -178], [-40, -178], [-20, -178], [14, -178], [34, -178], [54, -178], [7.0, -200], [-1.2, -215], [71, -196]]) streetlight(ctx, x, z, gY(x, z), 5.2);
  void calls; void signQuad;
  return { blocks };
}
