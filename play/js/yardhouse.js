// THE YARD HOUSE (look batch 2, 2026-10-31): the house behind the yard, and the yard's own furniture.
// Unity left a 32 m long, 16 cm thick beige facade with a flat black slab on it and three flat windows (12 triangles, no
// house behind it). This builds a real 1982 one-storey house in its place, seen from its back yard: a clapboard house on a
// concrete foundation with a gable roof of asphalt shingles, a brick chimney, a TV antenna, a back door with a concrete stoop
// and a screen door, a picture window, a lit kitchen, a lit bedroom, gutters and downspouts, and a one-car garage standing a
// little forward of the house at its east end so the long wall breaks into masses. The areaway keeps its place; at its foot
// the cellar door is now there. The yard gets a white picket fence (the posts and rails of Unity's fence kept where they were,
// the old square sticks gone) and a rural mailbox on a post, and shrubs, trash cans and a garage apron.
// Everything is drawn at load from fixed seeds (canvas textures, no files, no network). One mesher collects the faces per
// material, so the whole yard is ten draw calls and a few thousand triangles; the pickets are one instanced mesh.
// Coordinates are three's (x, y, z); the yard faces -z, so standing in it and looking at the house, +x is on your left.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180, TAN = Math.tan(22 * DEG), COS = Math.cos(22 * DEG);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (x) => { const s = Math.min(1, Math.max(0, x)); return s * s * (3 - 2 * s); };
const lcg = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const c8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgba = (c, m = 1, a = 1) => `rgba(${c8(c[0] * m)},${c8(c[1] * m)},${c8(c[2] * m)},${a})`;
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };      // an sRGB hex as the linear colour a vertex carries
const WHITE = [1, 1, 1];

// ---- where everything stands (metres). The wall line is where Unity's wall stood; the old wall's outer face is z -7.27.
const Y = { g: 2.89, floor: 3.36, plate: 6.05, tv: 0.12, fh: 0.17 };      // yard level, the floor, the top of the walls, the roof slab, the fascia
const ZF = -7.27, ZB = ZF + 11;                                            // the front wall's face and the back wall's (the body is 11 m deep)
const MAIN = { x0: -12.5, x1: 7.5, oh: 0.45, rake: 0.32 };                // the house: 20 m long
const GAR = { x0: 7.5, x1: 13.7, zf: -9.27, zb: -3.27, floor: 3.0, plate: 5.5, oh: 0.35, rake: 0.3 };   // the garage, 2 m forward of the house wall
const SHAFT = { x0: 3.08, x1: 4.52 };                                      // the areaway (Unity's): its cellar door is at its foot
const ZR = (ZF + ZB) / 2;                                                  // the main ridge (z)
const yU = (w, w0, wm, plate) => plate + (w <= wm ? w - w0 : (2 * wm - w0) - w) * TAN;   // the roof's underside at w, a gable with the wall tops at w0 and 2wm - w0

// ---- a mesher: faces collected per material, made into one mesh each. Flat faces carry their own normal; uv(p) gives a face its texture
// coordinates from the point (so panels of one wall share one texture without a seam).
class Mesher {
  constructor() { this.b = new Map(); }
  bucket(k) { if (!this.b.has(k)) this.b.set(k, { p: [], n: [], u: [], c: [], i: [] }); return this.b.get(k); }
  // one flat convex face; the winding is turned to face `out`, so corners may be given in any order
  quad(k, pts, out, uv, col = WHITE) {
    const [a, b, c] = pts;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz); if (l < 1e-9) return;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { pts = pts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    const B = this.bucket(k), base = B.p.length / 3;
    for (const p of pts) { B.p.push(p[0], p[1], p[2]); B.n.push(nx / l, ny / l, nz / l); const t = uv(p); B.u.push(t[0], t[1]); B.c.push(col[0], col[1], col[2]); }
    for (let i = 1; i < pts.length - 1; i++) B.i.push(base, base + i, base + i + 1);
  }
  // a box (x0..x1, y0..y1, z0..z1). o: s = metres per texture repeat [u, v]; vert = the grain runs up the box; col = vertex colour;
  // faces = which of f(-z) b(+z) l(-x) r(+x) u d to make; yaw = turned about its own centre
  box(k, x0, y0, z0, x1, y1, z1, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const s = o.s || [1, 1], col = o.col || WHITE, faces = o.faces || 'fblrud', sw = o.vert ? (a, b) => [b, a] : (a, b) => [a, b];
    let P = (p) => p, N = (v) => v;
    if (o.yaw) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, co = Math.cos(o.yaw), si = Math.sin(o.yaw);
      P = (p) => { const dx = p[0] - cx, dz = p[2] - cz; return [cx + dx * co + dz * si, p[1], cz - dx * si + dz * co]; };
      N = (v) => [v[0] * co + v[2] * si, v[1], -v[0] * si + v[2] * co];
    }
    const F = {
      f: [[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], (p) => sw(p[0] / s[0], p[1] / s[1])],
      b: [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], (p) => sw(p[0] / s[0], p[1] / s[1])],
      l: [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], (p) => sw(p[2] / s[0], p[1] / s[1])],
      r: [[[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0], (p) => sw(p[2] / s[0], p[1] / s[1])],
      u: [[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], (p) => sw(p[0] / s[0], p[2] / s[1])],
      d: [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], (p) => sw(p[0] / s[0], p[2] / s[1])],
    };
    for (const f of faces) { const [pts, out, uv] = F[f]; this.quad(k, pts.map(P), N(out), uv, col); }
  }
  // a three.js geometry, placed by a matrix, tinted by a colour (or by col(normal, vertex index) -> colour, a vertex at a time)
  geo(k, g, m, col = WHITE) {
    const B = this.bucket(k), base = B.p.length / 3, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m); B.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); B.n.push(v.x, v.y, v.z);
      const c = typeof col === 'function' ? col(v, i) : col;
      B.u.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0); B.c.push(c[0], c[1], c[2]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) B.i.push(base + g.index.getX(i)); else for (let i = 0; i < pa.count; i++) B.i.push(base + i);
  }
  build(k) {
    const B = this.b.get(k), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.setIndex(B.i.length > 65000 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1));
    g.computeBoundingSphere(); return g;
  }
}

// ---- textures, all drawn here
function paint(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
function tex(c, aniso, o = {}) {
  const t = new THREE.CanvasTexture(c); t.anisotropy = aniso;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (!o.data) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const jitter = (rand, g, w, h, n, a, len = 1) => { for (let i = 0; i < n; i++) { g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.8})`; g.fillRect(rand() * w, rand() * h, len + rand() * len, 1 + rand() * 1.5); } };

// lap siding, 3.2 m x 1.6 m a repeat: eight courses of 20 cm, two boards to a course with the joints in different places, the shade
// under the board above, the catch-light on each bottom edge, wood grain. Its height map is the lap's profile: thin at the top of a board,
// thick at the bottom edge, then a drop to the board below (relief 2.5 cm).
const SIDING = [148, 164, 146];
function sidingMaps() {
  const rand = lcg(1982), W = 1024, H = 512, N = 8, ch = H / N;
  const color = paint(W, H, (g) => {
    for (let r = 0; r < N; r++) {
      const y0 = r * ch, edges = [0, ...[rand() * W, rand() * W].sort((a, b) => a - b), W], tones = [0.93 + rand() * 0.14, 0.93 + rand() * 0.14]; tones.push(tones[0]);
      for (let p = 0; p < 3; p++) {
        const x0 = edges[p], w = edges[p + 1] - x0, t = tones[p], grd = g.createLinearGradient(0, y0, 0, y0 + ch);
        [[0, 0.52], [0.14, 0.8], [0.3, 1], [0.9, 0.97], [0.935, 1.1], [0.965, 0.88], [1, 0.46]].forEach(([k, m]) => grd.addColorStop(k, rgba(SIDING, m * t)));
        g.fillStyle = grd; g.fillRect(x0, y0, w, ch);
        for (let i = 0; i < w / 4; i++) { const gy = y0 + ch * (0.2 + rand() * 0.7), gx = x0 + rand() * w; g.fillStyle = rand() < 0.5 ? 'rgba(20,25,10,0.07)' : 'rgba(255,255,255,0.055)'; g.fillRect(gx, gy, Math.min(20 + rand() * 140, x0 + w - gx), 1); }
        if (p > 0) { g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x0, y0 + ch * 0.17, 1.5, ch * 0.8); }
      }
    }
    for (let i = 0; i < 26; i++) { const x = rand() * W, y = rand() * H, r = 40 + rand() * 120, grd = g.createRadialGradient(x, y, 0, x, y, r); const a = 0.05 + rand() * 0.05;
      grd.addColorStop(0, rand() < 0.6 ? `rgba(70,60,35,${a})` : `rgba(255,250,235,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  const height = paint(W, H, (g) => {
    for (let r = 0; r < N; r++) { const y0 = r * ch, grd = g.createLinearGradient(0, y0, 0, y0 + ch);
      [[0, 0.0], [0.9, 0.82], [0.94, 1], [0.955, 0.12], [1, 0]].forEach(([k, v]) => grd.addColorStop(k, `rgb(${c8(v * 255)},${c8(v * 255)},${c8(v * 255)})`)); g.fillStyle = grd; g.fillRect(0, y0, W, ch); }
  });
  return { color, height };
}
// asphalt shingles, 0.914 m x 1.02 m a repeat: eight courses (12.7 cm to the weather) of three tabs, every course shifted, a slot between tabs,
// the shadow of the course above, granules, a weathered charcoal-brown that varies tab by tab
const SHINGLE = [104, 96, 88];
function shingleMaps() {
  const rand = lcg(77), W = 512, H = 512, rows = 8, ch = H / rows, tabs = 3, tw = W / tabs;
  const tone = Array.from({ length: rows }, () => Array.from({ length: tabs }, () => 0.78 + rand() * 0.4));
  const off = Array.from({ length: rows }, (_, r) => ((r * 0.37 + 0.1 * rand()) % 1) * tw);
  const color = paint(W, H, (g) => {
    g.fillStyle = rgba(SHINGLE, 0.4); g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let k = -1; k < tabs; k++) {
      const x = k * tw + off[r], y = r * ch, t = tone[r][(k + tabs) % tabs], grd = g.createLinearGradient(0, y, 0, y + ch);
      [[0, 0.46], [0.3, 0.72], [0.34, 1], [0.92, 0.94], [1, 0.6]].forEach(([q, m]) => grd.addColorStop(q, rgba(SHINGLE, m * t)));
      g.fillStyle = grd; g.fillRect(x, y, tw, ch);
      g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(x - 1.5, y + ch * 0.42, 3, ch * 0.58);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y + ch - 2, tw, 2);
    }
    jitter(rand, g, W, H, 5000, 0.12, 1.5);
    for (let i = 0; i < 6; i++) { const x = rand() * W, y = rand() * H, r = 60 + rand() * 90, grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(90,100,60,0.07)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  const height = paint(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let k = -1; k < tabs; k++) {
      const x = k * tw + off[r], y = r * ch, grd = g.createLinearGradient(0, y, 0, y + ch);
      [[0, 0.2], [0.4, 0.65], [0.95, 1], [1, 0.2]].forEach(([q, v]) => grd.addColorStop(q, `rgb(${c8(v * 255)},${c8(v * 255)},${c8(v * 255)})`));
      g.fillStyle = grd; g.fillRect(x + 1.5, y, tw - 3, ch);
    }
  });
  return { color, height };
}
// face brick in running bond, 0.9 m x 0.9 m a repeat: four bricks across, twelve courses; mortar is the low ground in the height map
function brickMaps() {
  const rand = lcg(4), W = 512, H = 516, rows = 12, bh = H / rows, bw = W / 4, pal = [[138, 60, 44], [152, 70, 52], [120, 52, 40], [160, 84, 60], [112, 56, 46], [146, 66, 48], [98, 48, 42]];
  const color = paint(W, H, (g) => {
    g.fillStyle = 'rgb(168,160,146)'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let b = -1; b < 4; b++) {
      const x = b * bw + (r % 2) * bw / 2, y = r * bh, c = pal[Math.floor(rand() * pal.length)], m = 0.85 + rand() * 0.3;
      g.fillStyle = rgba(c, m); g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3, y + bh - 8, bw - 6, 5);
      g.fillStyle = 'rgba(255,230,200,0.1)'; g.fillRect(x + 3, y + 3, bw - 6, 3);
      if (rand() < 0.25) { g.fillStyle = 'rgba(30,18,18,0.3)'; g.fillRect(x + 3 + rand() * (bw - 30), y + 4 + rand() * 20, 14 + rand() * 20, 10 + rand() * 12); }
    }
    jitter(rand, g, W, H, 4000, 0.1, 1.5);
  });
  const height = paint(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let b = -1; b < 4; b++) { const x = b * bw + (r % 2) * bw / 2, y = r * bh; g.fillStyle = `rgb(${c8(190 + rand() * 65)},0,0)`; g.fillRect(x + 3, y + 3, bw - 6, bh - 6); }
  });
  return { color, height };
}
// poured concrete, 1 m a repeat: speckle, blotches, hairline cracks (also its own height map: the red channel)
function concreteMap() {
  const rand = lcg(31);
  return paint(256, 256, (g, W, H) => {
    g.fillStyle = 'rgb(150,148,140)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { const x = rand() * W, y = rand() * H, r = 18 + rand() * 50, grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, rand() < 0.5 ? 'rgba(60,56,48,0.12)' : 'rgba(230,226,214,0.14)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
    jitter(rand, g, W, H, 7000, 0.16, 1);
    g.strokeStyle = 'rgba(40,36,30,0.35)'; g.lineWidth = 1;
    for (let k = 0; k < 3; k++) { let x = rand() * W, y = rand() * H; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 9; i++) { x += (rand() - 0.5) * 30; y += 8 + rand() * 14; g.lineTo(x, y); } g.stroke(); }
  });
}
// painted wood, 0.5 m a repeat, the grain along u: the trim, the fascia, the pickets, the rails, the gutters (all tinted by their vertex colour)
function paintMap() {
  const rand = lcg(9);
  return paint(128, 128, (g, W, H) => {
    g.fillStyle = 'rgb(236,232,220)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { const y = rand() * H, len = 30 + rand() * 90, x = rand() * W; g.fillStyle = rand() < 0.5 ? 'rgba(80,70,50,0.09)' : 'rgba(255,255,255,0.12)'; g.fillRect(x, y, len, 1 + rand() * 1.5); if (x + len > W) g.fillRect(x - W, y, len, 1.5); }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(110,100,86,0.22)'; g.fillRect(rand() * W, rand() * H, 2 + rand() * 4, 1 + rand() * 2); }
  });
}
// the windows, one atlas of rooms seen from outside (4 x 2 cells of 256 px): a lamp-lit bedroom, a bright kitchen, a dark window with the sky in it,
// a TV in a dark room, frosted bathroom glass, dark with lace, the garage's panes, the cellar's
const CELL = { lamp: 0, kitchen: 1, dark: 2, tv: 3, bath: 4, lace: 5, garage: 6, cellar: 7 };
function glassAtlas() {
  const rand = lcg(55);
  return paint(1024, 512, (g) => {
    const cell = (i, fn) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 256); g.beginPath(); g.rect(0, 0, 256, 256); g.clip(); fn(); g.restore(); };
    const curtain = (x, w, c, c2) => { g.fillStyle = c; g.fillRect(x, 0, w, 256); for (let k = 0; k < w; k += 9) { g.fillStyle = c2; g.fillRect(x + k, 0, 3 + rand() * 2, 256); } };
    cell(CELL.lamp, () => {                                                                // a bedroom: lamp on, drapes, a picture
      const wall = g.createRadialGradient(160, 190, 5, 128, 150, 200); wall.addColorStop(0, 'rgb(255,226,150)'); wall.addColorStop(0.5, 'rgb(226,160,84)'); wall.addColorStop(1, 'rgb(120,66,36)');
      g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgb(120,70,40)'; g.fillRect(96, 40, 56, 40); g.fillStyle = 'rgb(205,170,110)'; g.fillRect(101, 45, 46, 30);
      g.fillStyle = 'rgb(255,248,220)'; g.beginPath(); g.moveTo(166, 150); g.lineTo(214, 150); g.lineTo(204, 190); g.lineTo(176, 190); g.fill();
      g.fillStyle = 'rgb(90,50,30)'; g.fillRect(188, 190, 4, 40); g.fillRect(170, 226, 40, 30);
      curtain(0, 54, 'rgb(150,76,36)', 'rgba(90,40,20,0.7)'); curtain(202, 54, 'rgb(150,76,36)', 'rgba(90,40,20,0.7)');
      g.fillStyle = 'rgb(110,54,26)'; g.fillRect(0, 0, 256, 22);
    });
    cell(CELL.kitchen, () => {                                                             // the kitchen: white light, cabinets, café curtains
      const wall = g.createLinearGradient(0, 0, 0, 256); wall.addColorStop(0, 'rgb(255,250,214)'); wall.addColorStop(1, 'rgb(236,206,128)'); g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgb(110,70,40)'; g.fillRect(0, 0, 256, 70); g.fillStyle = 'rgb(90,56,32)'; for (let x = 0; x < 256; x += 64) g.fillRect(x + 62, 0, 4, 70);
      g.fillStyle = 'rgb(196,170,120)'; g.fillRect(0, 215, 256, 41);
      for (let x = 0; x < 256; x += 16) for (let y = 112; y < 208; y += 16) { g.fillStyle = ((x + y) / 16) % 2 ? 'rgb(186,112,92)' : 'rgb(226,216,190)'; g.fillRect(x, y, 16, 16); }
      g.fillStyle = 'rgba(255,255,230,0.5)'; g.fillRect(0, 120, 256, 30);
    });
    cell(CELL.dark, () => {                                                                // dark glass: the dusk sky in it
      const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, 'rgb(84,76,128)'); sky.addColorStop(0.5, 'rgb(46,40,76)'); sky.addColorStop(1, 'rgb(14,12,24)'); g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(255,255,255,0.09)'; g.beginPath(); g.moveTo(40, 0); g.lineTo(110, 0); g.lineTo(0, 150); g.lineTo(0, 80); g.fill();
      curtain(0, 40, 'rgba(60,46,40,0.9)', 'rgba(30,22,20,0.6)'); curtain(216, 40, 'rgba(60,46,40,0.9)', 'rgba(30,22,20,0.6)');
    });
    cell(CELL.tv, () => {                                                                  // the television: blue light in a dark room
      g.fillStyle = 'rgb(18,16,22)'; g.fillRect(0, 0, 256, 256);
      const glow = g.createRadialGradient(128, 150, 10, 128, 150, 170); glow.addColorStop(0, 'rgba(140,180,255,0.75)'); glow.addColorStop(1, 'rgba(40,60,120,0)'); g.fillStyle = glow; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgb(20,20,24)'; g.fillRect(70, 118, 116, 84); g.fillStyle = 'rgb(176,206,255)'; g.fillRect(78, 126, 100, 66);
      g.fillStyle = 'rgba(80,110,200,0.4)'; for (let y = 126; y < 192; y += 4) g.fillRect(78, y, 100, 1.5);
      curtain(0, 40, 'rgba(70,40,40,0.85)', 'rgba(30,16,16,0.6)'); curtain(216, 40, 'rgba(70,40,40,0.85)', 'rgba(30,16,16,0.6)');
    });
    cell(CELL.bath, () => {                                                                // frosted glass, lit
      g.fillStyle = 'rgb(238,232,176)'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(190,180,110,0.3)'; g.fillRect(rand() * 256, rand() * 256, 3 + rand() * 5, 3 + rand() * 5); }
    });
    cell(CELL.lace, () => {                                                                // dark, a lace curtain behind the glass
      const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, 'rgb(70,64,100)'); sky.addColorStop(1, 'rgb(20,18,32)'); g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(200,190,170,0.22)'; g.fillRect(0, 0, 256, 256);
      for (let y = 6; y < 256; y += 12) for (let x = 6 + ((y / 12) % 2) * 6; x < 256; x += 12) { g.fillStyle = 'rgba(230,222,200,0.28)'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    });
    cell(CELL.garage, () => { const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, 'rgb(56,52,86)'); sky.addColorStop(1, 'rgb(12,12,20)'); g.fillStyle = sky; g.fillRect(0, 0, 256, 256); });
    cell(CELL.cellar, () => { g.fillStyle = 'rgb(16,20,24)'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(90,70,40,0.25)'; g.fillRect(0, 150, 256, 106); });
  });
}
// the doors, one atlas (1280 x 560): the garage's sectional door [0,640], the back door [640,880], the cellar door [880,1160]
const DOORS = { garage: [0, 0, 640, 560], back: [640, 0, 880, 560], cellar: [880, 0, 1160, 560], W: 1280, H: 560 };
function doorsMap() {
  const rand = lcg(21);
  return paint(DOORS.W, DOORS.H, (g) => {
    // the garage door: four sections of two raised panels each, the top one with a row of small panes; grime at the foot
    g.fillStyle = 'rgb(232,228,214)'; g.fillRect(0, 0, 640, 560);
    for (let s = 0; s < 4; s++) {
      const y = s * 140; g.fillStyle = 'rgba(30,28,24,0.55)'; g.fillRect(0, y + 136, 640, 4); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, y, 640, 2);
      for (let i = 0; i < 4; i++) {
        const x = 18 + i * 155, w = 140;
        if (s === 0) { g.fillStyle = 'rgb(246,244,236)'; g.fillRect(x - 3, y + 30, w + 6, 74); g.fillStyle = 'rgb(28,30,48)'; g.fillRect(x, y + 34, w, 66); g.fillStyle = 'rgba(160,170,230,0.28)'; g.beginPath(); g.moveTo(x, y + 34); g.lineTo(x + 60, y + 34); g.lineTo(x, y + 90); g.fill(); continue; }
        g.fillStyle = 'rgb(222,218,202)'; g.fillRect(x, y + 14, w, 108);
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y + 118, w, 4); g.fillRect(x + w - 4, y + 14, 4, 108);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x, y + 14, w, 3); g.fillRect(x, y + 14, 3, 108);
      }
    }
    const dirt = g.createLinearGradient(0, 490, 0, 560); dirt.addColorStop(0, 'rgba(40,34,24,0)'); dirt.addColorStop(1, 'rgba(40,34,24,0.45)'); g.fillStyle = dirt; g.fillRect(0, 490, 640, 70);
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(60,50,30,0.1)'; g.fillRect(rand() * 640, rand() * 560, 3, 40 + rand() * 90); }
    g.fillStyle = 'rgba(40,40,40,0.7)'; g.fillRect(24, 262, 34, 6);
    // the back door: stained wood, a six-light window up top lit from the kitchen, raised panels below
    g.save(); g.translate(640, 0); g.fillStyle = 'rgb(88,50,30)'; g.fillRect(0, 0, 240, 560);
    for (let i = 0; i < 90; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(30,14,6,0.25)' : 'rgba(180,110,70,0.14)'; g.fillRect(rand() * 240, rand() * 560, 1 + rand() * 2, 20 + rand() * 120); }
    g.fillStyle = 'rgba(20,10,4,0.5)'; g.fillRect(28, 34, 184, 252);
    const lite = g.createLinearGradient(0, 40, 0, 280); lite.addColorStop(0, 'rgb(255,222,150)'); lite.addColorStop(1, 'rgb(226,150,70)'); g.fillStyle = lite; g.fillRect(34, 40, 172, 240);
    g.fillStyle = 'rgb(70,40,24)'; g.fillRect(34, 114, 172, 7); g.fillRect(34, 196, 172, 7); g.fillRect(117, 40, 7, 240);
    for (const y of [316, 438]) { g.fillStyle = 'rgba(20,10,4,0.5)'; g.fillRect(28, y, 184, 108); g.fillStyle = 'rgb(100,58,36)'; g.fillRect(34, y + 6, 172, 96); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(34, y + 98, 172, 4); g.fillStyle = 'rgba(255,220,180,0.18)'; g.fillRect(34, y + 6, 172, 3); }
    g.restore();
    // the cellar door: painted boards, a Z brace, a small lit pane
    g.save(); g.translate(880, 0); g.fillStyle = 'rgb(62,74,58)'; g.fillRect(0, 0, 280, 560);
    for (let x = 0; x < 280; x += 40) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 0, 2, 560); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 2, 0, 3, 560); }
    for (let i = 0; i < 70; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(200,210,170,0.08)'; g.fillRect(rand() * 280, rand() * 560, 1 + rand() * 2, 20 + rand() * 100); }
    g.fillStyle = 'rgb(52,62,48)'; g.fillRect(0, 60, 280, 40); g.fillRect(0, 460, 280, 40); g.save(); g.translate(0, 100); g.rotate(Math.atan2(360, 280)); g.fillRect(0, -20, 460, 40); g.restore();
    g.fillStyle = 'rgb(240,232,210)'; g.fillRect(96, 120, 90, 90); g.fillStyle = 'rgb(255,214,130)'; g.fillRect(102, 126, 78, 78);
    g.restore();
  });
}
// a screen door's mesh: a faint dark weave, drawn with alpha
function screenMap() {
  return paint(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = 'rgba(20,20,20,0.16)'; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(30,30,30,0.55)'; for (let i = 0; i < 64; i += 4) { g.fillRect(i, 0, 1, 64); g.fillRect(0, i, 64, 1); } });
}

// ---- the build
export function buildYardHouse({ anisotropy = 8, objects = [] } = {}) {
  const t0 = performance.now(), M = new Mesher(), A = anisotropy;
  const col = { white: lin('#ebe7da'), cream: lin('#ddd5c0'), soffit: lin('#cfc9b6'), brown: lin('#4a2f22'), green: lin('#2c4631'), black: lin('#1c1c1e'), alum: lin('#b9bcbe'), rail: lin('#242426'),
    wood: lin('#74695a'), gray: lin('#8d9396'), red: lin('#c6261c'), tile: lin('#a85a3c'), gold: lin('#b79a52'), dirt: lin('#6a5f4c'), hose: lin('#2e6a3a') };
  const uvSiding = (p) => [p[0] / 3.2, (p[1] - 3.3) / 1.6], uvSidingX = (p) => [p[2] / 3.2, (p[1] - 3.3) / 1.6];
  const uvBrickZ = (p) => [p[0] / 0.9, p[1] / 0.9], uvBrickX = (p) => [p[2] / 0.9, p[1] / 0.9];
  const uvPaint = (p) => [(p[0] + p[2]) / 0.5, p[1] / 0.5], uvConc = (p) => [(p[0] + p[2]) / 1.0, p[1] / 1.0];
  const T = { s: [0.5, 0.5] };
  const colliders = [];                                           // [x0, y0, z0, x1, y1, z1]
  const lights = [];
  const atlas = (rect, W, H, x0, x1, y0, y1) => (p) => [(rect[0] + (x1 - p[0]) / (x1 - x0) * (rect[2] - rect[0])) / W, 1 - (rect[1] + (y1 - p[1]) / (y1 - y0) * (rect[3] - rect[1])) / H];
  const cellUv = (cell, x0, x1, y0, y1) => { const cx = (cell % 4) * 256, cy = Math.floor(cell / 4) * 256; return atlas([cx + 4, cy + 4, cx + 252, cy + 252], 1024, 512, x0, x1, y0, y1); };

  // panels of one wall around its holes: uvf(p) the texture, mk(u, y) the point, out the face's direction
  const panels = (key, u0, u1, yb, yt, holes, mk, out, uvf, c) => {
    const us = [u0, u1]; for (const h of holes) us.push(h.u0, h.u1);
    const cuts = [...new Set(us.filter((u) => u >= u0 - 1e-6 && u <= u1 + 1e-6).map((u) => +u.toFixed(4)))].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1]; if (b - a < 1e-4) continue;
      const h = holes.find((q) => q.u0 <= a + 1e-5 && q.u1 >= b - 1e-5);
      const strip = (y0, y1) => { if (y1 - y0 > 1e-4) M.quad(key, [mk(a, y0), mk(b, y0), mk(b, y1), mk(a, y1)], out, uvf, c); };
      if (!h) strip(yb, yt); else { strip(yb, Math.min(yt, h.y0)); strip(Math.max(yb, h.y1), yt); }
    }
  };
  const front = (u, y) => [u, y, ZF];

  // ---- foundation, the shaft's end wall and the cellar door
  M.box('concrete', MAIN.x0, 2.55, ZF + 0.03, SHAFT.x0, Y.floor, ZF + 0.5, { faces: 'fl', col: lin('#cfcdc4') });
  M.box('concrete', SHAFT.x1, 2.55, ZF + 0.03, MAIN.x1, Y.floor, ZF + 0.5, { faces: 'fr', col: lin('#cfcdc4') });
  M.box('concrete', MAIN.x0 + 0.02, 2.55, ZF + 0.5, MAIN.x1 - 0.02, Y.floor, ZB - 0.03, { faces: 'lrb', col: lin('#cfcdc4') });
  const door0 = { u0: 3.3, u1: 4.3, y0: 0.0, y1: 2.05 };
  panels('concrete', SHAFT.x0, SHAFT.x1, -0.3, Y.floor, [door0], front.bind(null), [0, 0, -1], (p) => [p[0], p[1]], lin('#cfcdc4'));
  for (const [x, dir] of [[door0.u0, 1], [door0.u1, -1]]) M.quad('paint', [[x, 0, ZF], [x, 0, ZF + 0.1], [x, 2.05, ZF + 0.1], [x, 2.05, ZF]], [dir, 0, 0], uvPaint, col.cream);
  M.quad('paint', [[door0.u0, 2.05, ZF], [door0.u1, 2.05, ZF], [door0.u1, 2.05, ZF + 0.1], [door0.u0, 2.05, ZF + 0.1]], [0, -1, 0], uvPaint, col.cream);
  M.quad('doors', [[door0.u0, 0.02, ZF + 0.1], [door0.u1, 0.02, ZF + 0.1], [door0.u1, 2.05, ZF + 0.1], [door0.u0, 2.05, ZF + 0.1]], [0, 0, -1], atlas(DOORS.cellar, DOORS.W, DOORS.H, door0.u0, door0.u1, 0.02, 2.05));
  M.box('paint', door0.u0 - 0.1, 0, ZF - 0.025, door0.u0, 2.15, ZF + 0.0, { col: col.cream, s: T.s, vert: true, faces: 'fu' });
  M.box('paint', door0.u1, 0, ZF - 0.025, door0.u1 + 0.1, 2.15, ZF + 0.0, { col: col.cream, s: T.s, vert: true, faces: 'fu' });
  M.box('paint', door0.u0 - 0.1, 2.05, ZF - 0.025, door0.u1 + 0.1, 2.17, ZF + 0.0, { col: col.cream, s: T.s, faces: 'fu' });
  M.box('plain', 4.14, 0.95, ZF + 0.04, 4.2, 1.01, ZF + 0.12, { col: col.gold });
  M.box('concrete', door0.u0 - 0.1, -0.05, ZF - 0.14, door0.u1 + 0.1, 0.03, ZF + 0.1, { col: lin('#bdbab0'), faces: 'fu' });
  colliders.push([SHAFT.x0, -0.5, ZF - 0.02, SHAFT.x1, 3.4, ZF + 0.2]);

  // ---- the front wall: lap siding with its windows and the back door cut out; the windows sit 9 cm in
  const REV = 0.09, F = Y.floor;
  const WINS = [
    { name: 'bedroom', x: -10.9, w: 1.25, y0: F + 0.8, h: 1.35, cell: CELL.lamp, shutters: true, lit: true },
    { name: 'bath', x: -8.45, w: 0.62, y0: F + 1.38, h: 0.62, cell: CELL.lace },
    { name: 'kitchen', x: -2.7, w: 1.4, y0: F + 1.0, h: 1.05, cell: CELL.kitchen, lit: true },
    { name: 'picture', x: 0.55, w: 2.4, y0: F + 0.72, h: 1.45, cell: CELL.tv, lit: true, mullions: 2 },
  ];
  const BD = { x: -6.0, w: 0.92, y0: F + 0.04, h: 2.03 };                    // the back door
  const holes = WINS.map((w) => ({ u0: w.x - w.w / 2, u1: w.x + w.w / 2, y0: w.y0, y1: w.y0 + w.h }));
  holes.push({ u0: BD.x - BD.w / 2, u1: BD.x + BD.w / 2, y0: F - 0.1, y1: BD.y0 + BD.h });
  panels('siding', MAIN.x0, MAIN.x1, 3.3, Y.plate, holes, front, [0, 0, -1], uvSiding);
  M.box('paint', MAIN.x0 - 0.0, 3.3, ZF - 0.035, MAIN.x1, 3.48, ZF, { col: col.white, s: T.s, faces: 'fu' });         // the skirt board over the foot of the siding
  M.box('paint', MAIN.x0, Y.plate - 0.12, ZF - 0.03, MAIN.x1, Y.plate, ZF, { col: col.white, s: T.s, faces: 'fd' });    // the frieze under the soffit
  M.box('paint', MAIN.x0 - 0.04, 3.3, ZF - 0.05, MAIN.x0 + 0.1, Y.plate, ZF + 0.0, { col: col.white, s: T.s, vert: true, faces: 'flr' });   // the west corner board
  for (const w of WINS) {                                                      // a window: reveals, the sash frames, the glass, the casing, the sill, the apron
    const x0 = w.x - w.w / 2, x1 = w.x + w.w / 2, y0 = w.y0, y1 = w.y0 + w.h, z = ZF + REV;
    M.quad('paint', [[x0, y0, ZF], [x0, y0, z], [x0, y1, z], [x0, y1, ZF]], [1, 0, 0], uvPaint, col.white);
    M.quad('paint', [[x1, y0, ZF], [x1, y0, z], [x1, y1, z], [x1, y1, ZF]], [-1, 0, 0], uvPaint, col.white);
    M.quad('paint', [[x0, y1, ZF], [x1, y1, ZF], [x1, y1, z], [x0, y1, z]], [0, -1, 0], uvPaint, col.white);
    M.quad('glass', [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, -1], cellUv(w.cell, x0, x1, y0, y1));
    const sash = (a, b, c, d) => M.box('paint', a, b, z - 0.045, c, d, z, { col: col.white, s: T.s, faces: 'fu' }), m = 0.05;
    sash(x0, y0, x1, y0 + m); sash(x0, y1 - m, x1, y1); sash(x0, y0, x0 + m, y1); sash(x1 - m, y0, x1, y1);
    sash(x0, (y0 + y1) / 2 - 0.02, x1, (y0 + y1) / 2 + 0.02);
    for (let k = 1; k <= (w.mullions || (w.w > 1.1 ? 1 : 0)); k++) { const xm = x0 + w.w * k / ((w.mullions || 1) + 1); sash(xm - 0.03, y0, xm + 0.03, y1); }
    M.box('paint', x0 - 0.12, y1, ZF - 0.03, x1 + 0.12, y1 + 0.12, ZF, { col: col.white, s: T.s, faces: 'fud' });          // the head casing, 12 cm
    M.box('paint', x0 - 0.17, y1 + 0.12, ZF - 0.05, x1 + 0.17, y1 + 0.16, ZF - 0.01, { col: col.white, s: T.s, faces: 'fu' });   // and its drip cap
    M.box('paint', x0 - 0.12, y0 - 0.1, ZF - 0.03, x0, y1, ZF, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', x1, y0 - 0.1, ZF - 0.03, x1 + 0.12, y1, ZF, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', x0 - 0.16, y0 - 0.05, ZF - 0.09, x1 + 0.16, y0, z, { col: col.white, s: T.s, faces: 'fudlr' });          // the sill, 9 cm out
    M.box('paint', x0 - 0.12, y0 - 0.15, ZF - 0.03, x1 + 0.12, y0 - 0.05, ZF, { col: col.white, s: T.s, faces: 'f' });      // the apron
    if (w.shutters) for (const sx of [x0 - 0.12 - 0.4, x1 + 0.12]) {
      M.box('paint', sx, y0 - 0.05, ZF - 0.035, sx + 0.4, y1 + 0.12, ZF, { col: col.green, s: T.s, vert: true, faces: 'flrud' });
      for (let y = y0; y < y1 + 0.08; y += 0.075) M.box('paint', sx + 0.03, y, ZF - 0.05, sx + 0.37, y + 0.012, ZF - 0.035, { col: lin('#1f3424'), s: T.s, faces: 'fu' });
    }
  }
  {                                                                           // the back door: a recessed slab, casing, the screen door, the stoop, the porch light
    const x0 = BD.x - BD.w / 2, x1 = BD.x + BD.w / 2, y0 = BD.y0, y1 = BD.y0 + BD.h, z = ZF + REV;
    M.quad('paint', [[x0, y0, ZF], [x0, y0, z], [x0, y1, z], [x0, y1, ZF]], [1, 0, 0], uvPaint, col.white);
    M.quad('paint', [[x1, y0, ZF], [x1, y0, z], [x1, y1, z], [x1, y1, ZF]], [-1, 0, 0], uvPaint, col.white);
    M.quad('paint', [[x0, y1, ZF], [x1, y1, ZF], [x1, y1, z], [x0, y1, z]], [0, -1, 0], uvPaint, col.white);
    M.quad('doors', [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, -1], atlas(DOORS.back, DOORS.W, DOORS.H, x0, x1, y0, y1));
    M.box('plain', x0 + 0.06, 3.38 + 1.0, z - 0.06, x0 + 0.13, 3.38 + 1.07, z, { col: col.gold });                      // the knob
    M.box('paint', x0 - 0.12, y0 - 0.04, ZF - 0.03, x0, y1 + 0.12, ZF, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', x1, y0 - 0.04, ZF - 0.03, x1 + 0.12, y1 + 0.12, ZF, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', x0 - 0.12, y1, ZF - 0.03, x1 + 0.12, y1 + 0.12, ZF, { col: col.white, s: T.s, faces: 'fud' });
    // the screen door: an aluminium frame in front of the slab, a dark mesh in it, a kick plate
    const zs = ZF - 0.07;
    M.box('paint', x0 - 0.02, y0 - 0.02, zs - 0.03, x1 + 0.02, y0 + 0.28, zs, { col: col.alum, s: T.s, faces: 'fu' });
    M.box('paint', x0 - 0.02, y0 + 0.9, zs - 0.03, x1 + 0.02, y0 + 0.95, zs, { col: col.alum, s: T.s, faces: 'fu' });
    M.box('paint', x0 - 0.02, y1 - 0.06, zs - 0.03, x1 + 0.02, y1 + 0.02, zs, { col: col.alum, s: T.s, faces: 'fu' });
    M.box('paint', x0 - 0.02, y0, zs - 0.03, x0 + 0.06, y1, zs, { col: col.alum, s: T.s, vert: true, faces: 'flru' });
    M.box('paint', x1 - 0.06, y0, zs - 0.03, x1 + 0.02, y1, zs, { col: col.alum, s: T.s, vert: true, faces: 'flru' });
    for (const [a, b] of [[y0 + 0.28, y0 + 0.9], [y0 + 0.95, y1 - 0.06]]) M.quad('screen', [[x0 + 0.06, a, zs - 0.012], [x1 - 0.06, a, zs - 0.012], [x1 - 0.06, b, zs - 0.012], [x0 + 0.06, b, zs - 0.012]], [0, 0, -1], (p) => [p[0] / 0.2, p[1] / 0.2]);
    M.box('plain', x0 + 0.04, y0 + 0.95, zs - 0.07, x0 + 0.08, y0 + 1.08, zs - 0.03, { col: col.alum });                // the pull
    // the stoop: a slab and one step, a black iron rail on each side
    M.box('concrete', BD.x - 1.0, Y.g - 0.05, ZF - 1.0, BD.x + 1.0, 3.28, ZF, { col: lin('#c9c6bc'), faces: 'flrud' });
    M.box('concrete', BD.x - 0.9, Y.g - 0.05, ZF - 1.34, BD.x + 0.9, 3.08, ZF - 1.0, { col: lin('#c9c6bc'), faces: 'flrud' });
    colliders.push([BD.x - 1.0, Y.g, ZF - 1.36, BD.x + 1.0, 3.3, ZF]);
    for (const sx of [BD.x - 0.95, BD.x + 0.95]) {
      M.box('paint', sx - 0.02, 3.28, ZF - 0.96, sx + 0.02, 4.2, ZF - 0.92, { col: col.rail, s: T.s, vert: true });
      M.box('paint', sx - 0.02, 3.28, ZF - 0.12, sx + 0.02, 4.2, ZF - 0.08, { col: col.rail, s: T.s, vert: true });
      M.box('paint', sx - 0.02, 4.16, ZF - 0.96, sx + 0.02, 4.2, ZF - 0.08, { col: col.rail, s: T.s });
      M.box('paint', sx - 0.015, 3.7, ZF - 0.96, sx + 0.015, 3.73, ZF - 0.08, { col: col.rail, s: T.s });
      for (let z = ZF - 0.9; z < ZF - 0.12; z += 0.11) M.box('paint', sx - 0.01, 3.73, z, sx + 0.01, 4.16, z + 0.02, { col: col.rail, s: T.s, vert: true, faces: 'flr' });
    }
    // the porch light beside the door
    M.box('plain', BD.x + 0.78, 4.76, ZF - 0.03, BD.x + 0.9, 4.9, ZF, { col: col.black });
    M.box('lamp', BD.x + 0.76, 4.5, ZF - 0.17, BD.x + 0.92, 4.74, ZF - 0.03, {});
    M.box('plain', BD.x + 0.74, 4.74, ZF - 0.19, BD.x + 0.94, 4.78, ZF - 0.01, { col: col.black });
    M.box('plain', BD.x + 0.74, 4.46, ZF - 0.19, BD.x + 0.94, 4.5, ZF - 0.01, { col: col.black });
    lights.push({ name: 'YardBackDoor', pos: [BD.x + 0.84, 4.55, ZF - 0.5], color: [1, 0.76, 0.46], range: 6.2, intensity: 0.95 });
  }
  M.box('plain', 4.93, 4.1, ZF - 0.035, 5.07, 4.34, ZF, { col: col.black });                // a plate behind the areaway's porch bulb (Unity's bracket stands in front of it)

  // ---- the ends and the back (siding), the main roof's gable ends
  const gableEnd = (x, outx, u0, u1, plate, zr, uvf) => M.quad('siding', [[x, 3.3, u0], [x, 3.3, u1], [x, plate, u1], [x, yU(zr, u0, zr, plate), zr], [x, plate, u0]], [outx, 0, 0], uvf);
  gableEnd(MAIN.x0, -1, ZF, ZB, Y.plate, ZR, uvSidingX);
  gableEnd(MAIN.x1, 1, ZF, ZB, Y.plate, ZR, uvSidingX);
  M.quad('siding', [[MAIN.x0, 3.3, ZB], [MAIN.x1, 3.3, ZB], [MAIN.x1, Y.plate, ZB], [MAIN.x0, Y.plate, ZB]], [0, 0, 1], uvSiding);
  M.box('paint', MAIN.x0 - 0.04, 3.3, ZF - 0.05, MAIN.x0 + 0.1, Y.plate, ZF, { col: col.white, s: T.s, vert: true, faces: 'f' });
  M.box('paint', MAIN.x0 - 0.045, 3.3, ZB - 0.1, MAIN.x0, Y.plate, ZB + 0.04, { col: col.white, s: T.s, vert: true, faces: 'lb' });
  M.box('paint', MAIN.x0 - 0.045, 3.3, ZF - 0.0, MAIN.x0, Y.plate, ZF + 0.1, { col: col.white, s: T.s, vert: true, faces: 'l' });
  for (const [x, o] of [[MAIN.x0, -1]]) { const yv = 7.15; M.box('paint', x - 0.05, yv, ZR - 0.3, x, yv + 0.62, ZR + 0.3, { col: col.white, s: T.s, faces: 'l' }); M.box('plain', x - 0.06, yv + 0.06, ZR - 0.24, x - 0.005, yv + 0.56, ZR + 0.24, { col: lin('#2a2a2c'), faces: 'l' }); }   // the gable vent

  // ---- roofs: a gable, thick, with a fascia, a soffit and rake boards; mk(u, w, y) places a point (u along the ridge, w across it)
  const gable = (o) => {
    const { u0, u1, w0, w1, plate, r0, r1, oh, mk } = o, wm = (w0 + w1) / 2;
    const yT = (w) => yU(w, w0, wm, plate) + Y.tv;
    const out = (a, b, c) => { const v = mk(a, b, c), z = mk(0, 0, 0); return [v[0] - z[0], v[1] - z[1], v[2] - z[2]]; };
    const uvR = (p) => { const [uu, ww] = o.inv(p), s = (ww <= wm ? ww - (w0 - oh) : (w1 + oh) - ww) / COS; return [uu / 0.9144, s / 1.016]; };
    const ua = u0 - r0, ub = u1 + r1;
    for (const side of [0, 1]) {
      const wt = side ? w1 + oh : w0 - oh, sg = side ? 1 : -1;                                    // the tail's w; the slope faces away from the ridge
      M.quad('roof', [mk(ua, wt, yT(wt)), mk(ub, wt, yT(wt)), mk(ub, wm, yT(wm)), mk(ua, wm, yT(wm))], out(0, sg * TAN, 1), uvR);
      M.quad('paint', [mk(ua, wt, yT(wt)), mk(ub, wt, yT(wt)), mk(ub, wt, yT(wt) - Y.fh), mk(ua, wt, yT(wt) - Y.fh)], out(0, sg, 0), uvPaint, col.white);                // the fascia
      const ys = yT(wt) - Y.fh, wb = side ? w1 : w0;
      M.quad('paint', [mk(ua, wt, ys), mk(ub, wt, ys), mk(ub, wb, ys), mk(ua, wb, ys)], out(0, 0, -1), uvPaint, col.soffit);                                          // the soffit
      for (const [uu, sgu, r] of [[ua, -1, r0], [ub, 1, r1]]) {
        M.quad('paint', [mk(uu, wt, yT(wt)), mk(uu, wm, yT(wm)), mk(uu, wm, yT(wm) - Y.fh), mk(uu, wt, yT(wt) - Y.fh)], out(sgu, 0, 0), uvPaint, col.white);            // the rake board
        if (r > 0) M.quad('paint', [mk(uu, wt, yT(wt) - Y.fh), mk(uu, wm, yT(wm) - Y.fh), mk(uu - sgu * r, wm, yT(wm) - Y.fh), mk(uu - sgu * r, wt, yT(wt) - Y.fh)], out(0, -sg * TAN, -1), uvPaint, col.soffit);   // its underside
      }
    }
    // the ridge cap
    const yr = yT(wm); M.quad('roof', [mk(ua, wm - 0.17, yr - 0.07), mk(ub, wm - 0.17, yr - 0.07), mk(ub, wm, yr + 0.045), mk(ua, wm, yr + 0.045)], out(0, -TAN, 1), uvR);
    M.quad('roof', [mk(ua, wm + 0.17, yr - 0.07), mk(ub, wm + 0.17, yr - 0.07), mk(ub, wm, yr + 0.045), mk(ua, wm, yr + 0.045)], out(0, TAN, 1), uvR);
    return { wm, yT };
  };
  const mainR = gable({ u0: MAIN.x0, u1: MAIN.x1, w0: ZF, w1: ZB, plate: Y.plate, r0: MAIN.rake, r1: 0, oh: MAIN.oh, mk: (u, w, y) => [u, y, w], inv: (p) => [p[0], p[2], p[1]] });
  // the garage: ridge along z, its gable front facing the yard
  const gp = GAR.plate, gc = (GAR.x0 + GAR.x1) / 2;
  const garR = gable({ u0: GAR.zf, u1: GAR.zb, w0: GAR.x0, w1: GAR.x1, plate: gp, r0: GAR.rake, r1: GAR.rake, oh: GAR.oh, mk: (u, w, y) => [w, y, u], inv: (p) => [p[2], p[0], p[1]] });
  // its walls: the front with the door (2.44 m x 2.13 m) cut out, a small window, the gable above; the sides; the back
  const GD = { x: gc - 0.4, w: 2.44, y0: GAR.floor + 0.03, h: 2.13 }, GW = { x: gc + 2.3, w: 0.9, y0: 4.15, h: 0.8 };
  const gfront = (u, y) => [u, y, GAR.zf];
  panels('siding', GAR.x0, GAR.x1, 2.95, gp, [{ u0: GD.x - GD.w / 2, u1: GD.x + GD.w / 2, y0: GD.y0, y1: GD.y0 + GD.h }, { u0: GW.x - GW.w / 2, u1: GW.x + GW.w / 2, y0: GW.y0, y1: GW.y0 + GW.h }], gfront, [0, 0, -1], uvSiding);
  M.quad('siding', [[GAR.x0, gp, GAR.zf], [GAR.x1, gp, GAR.zf], [gc, yU(gc, GAR.x0, gc, gp), GAR.zf]], [0, 0, -1], uvSiding);
  M.quad('siding', [[GAR.x0, 2.95, GAR.zf], [GAR.x0, 2.95, ZF], [GAR.x0, gp, ZF], [GAR.x0, gp, GAR.zf]], [-1, 0, 0], uvSidingX);
  M.quad('siding', [[GAR.x1, 2.95, GAR.zf], [GAR.x1, 2.95, GAR.zb], [GAR.x1, gp, GAR.zb], [GAR.x1, gp, GAR.zf]], [1, 0, 0], uvSidingX);
  M.quad('siding', [[GAR.x0, 2.95, GAR.zb], [GAR.x1, 2.95, GAR.zb], [GAR.x1, gp, GAR.zb], [gc, yU(gc, GAR.x0, gc, gp), GAR.zb], [GAR.x0, gp, GAR.zb]], [0, 0, 1], uvSiding);
  {
    const x0 = GD.x - GD.w / 2, x1 = GD.x + GD.w / 2, y0 = GD.y0, y1 = GD.y0 + GD.h, z = GAR.zf + 0.08;
    M.quad('paint', [[x0, y0, GAR.zf], [x0, y0, z], [x0, y1, z], [x0, y1, GAR.zf]], [1, 0, 0], uvPaint, col.white);
    M.quad('paint', [[x1, y0, GAR.zf], [x1, y0, z], [x1, y1, z], [x1, y1, GAR.zf]], [-1, 0, 0], uvPaint, col.white);
    M.quad('paint', [[x0, y1, GAR.zf], [x1, y1, GAR.zf], [x1, y1, z], [x0, y1, z]], [0, -1, 0], uvPaint, col.white);
    M.quad('doors', [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, -1], atlas(DOORS.garage, DOORS.W, DOORS.H, x0, x1, y0, y1));
    M.box('paint', x0 - 0.14, y0 - 0.02, GAR.zf - 0.03, x0, y1 + 0.16, GAR.zf, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', x1, y0 - 0.02, GAR.zf - 0.03, x1 + 0.14, y1 + 0.16, GAR.zf, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', x0 - 0.14, y1, GAR.zf - 0.03, x1 + 0.14, y1 + 0.16, GAR.zf, { col: col.white, s: T.s, faces: 'fud' });
    for (const lx of [x0 - 0.5, x1 + 0.5]) { M.box('plain', lx - 0.06, 4.74, GAR.zf - 0.03, lx + 0.06, 4.88, GAR.zf, { col: col.black }); M.box('lamp', lx - 0.07, 4.46, GAR.zf - 0.17, lx + 0.07, 4.72, GAR.zf - 0.03, {}); M.box('plain', lx - 0.09, 4.72, GAR.zf - 0.19, lx + 0.09, 4.76, GAR.zf - 0.01, { col: col.black }); M.box('plain', lx - 0.09, 4.42, GAR.zf - 0.19, lx + 0.09, 4.46, GAR.zf - 0.01, { col: col.black }); }
    lights.push({ name: 'YardGarage', pos: [GD.x, 4.7, GAR.zf - 1.3], color: [1, 0.76, 0.46], range: 7, intensity: 0.55 });
    const w = GW, wx0 = w.x - w.w / 2, wx1 = w.x + w.w / 2, wy1 = w.y0 + w.h, wz = GAR.zf + REV;
    M.quad('paint', [[wx0, w.y0, GAR.zf], [wx0, w.y0, wz], [wx0, wy1, wz], [wx0, wy1, GAR.zf]], [1, 0, 0], uvPaint, col.white);
    M.quad('paint', [[wx1, w.y0, GAR.zf], [wx1, w.y0, wz], [wx1, wy1, wz], [wx1, wy1, GAR.zf]], [-1, 0, 0], uvPaint, col.white);
    M.quad('glass', [[wx0, w.y0, wz], [wx1, w.y0, wz], [wx1, wy1, wz], [wx0, wy1, wz]], [0, 0, -1], cellUv(CELL.garage, wx0, wx1, w.y0, wy1));
    for (const [a, b, c, d] of [[wx0, w.y0, wx1, w.y0 + 0.05], [wx0, wy1 - 0.05, wx1, wy1], [wx0, w.y0, wx0 + 0.05, wy1], [wx1 - 0.05, w.y0, wx1, wy1], [w.x - 0.02, w.y0, w.x + 0.02, wy1]]) M.box('paint', a, b, wz - 0.045, c, d, wz, { col: col.white, s: T.s, faces: 'fu' });
    M.box('paint', wx0 - 0.1, w.y0 - 0.06, GAR.zf - 0.03, wx1 + 0.1, w.y0 - 0.0, wz, { col: col.white, s: T.s, faces: 'fud' });
    M.box('paint', wx0 - 0.1, wy1, GAR.zf - 0.03, wx1 + 0.1, wy1 + 0.1, GAR.zf, { col: col.white, s: T.s, faces: 'fud' });
    M.box('paint', wx0 - 0.1, w.y0, GAR.zf - 0.03, wx0, wy1, GAR.zf, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', wx1, w.y0, GAR.zf - 0.03, wx1 + 0.1, wy1, GAR.zf, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', GAR.x0 - 0.0, 2.95, GAR.zf - 0.05, GAR.x0 + 0.12, gp, GAR.zf, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('paint', GAR.x1 - 0.12, 2.95, GAR.zf - 0.05, GAR.x1 + 0.0, gp, GAR.zf, { col: col.white, s: T.s, vert: true, faces: 'flr' });
    M.box('concrete', GAR.x0, 2.78, GAR.zf - 0.02, GAR.x1, 3.0, GAR.zb, { col: lin('#bdbab0'), faces: 'fr' });
    M.box('concrete', GAR.x0 - 0.1, Y.g - 0.02, GAR.zf - 3.2, GAR.x1 + 0.1, Y.g + 0.045, GAR.zf - 0.02, { col: lin('#c4c1b6'), faces: 'furl' });        // the apron
    M.box('concrete', GAR.x0 - 0.1, Y.g + 0.045, GAR.zf - 3.2, GAR.x1 + 0.1, Y.g + 0.06, GAR.zf - 3.1, { col: lin('#b8b5aa'), faces: 'fu' });
  }
  colliders.push([MAIN.x0, Y.g - 0.2, ZF, MAIN.x1, 9.4, ZB], [GAR.x0, Y.g - 0.2, GAR.zf, GAR.x1, 7.4, GAR.zb]);

  // ---- the chimney, the antenna, the gutters
  {
    const cx = -7.6, cz = ZR - 0.3, hw = 0.5, hd = 0.4, top = mainR.yT(ZR) + 0.95, base = 7.7;
    M.quad('brick', [[cx - hw, base, cz - hd], [cx + hw, base, cz - hd], [cx + hw, top, cz - hd], [cx - hw, top, cz - hd]], [0, 0, -1], uvBrickZ, lin('#d9cfc4'));
    M.quad('brick', [[cx - hw, base, cz + hd], [cx + hw, base, cz + hd], [cx + hw, top, cz + hd], [cx - hw, top, cz + hd]], [0, 0, 1], uvBrickZ, lin('#d9cfc4'));
    M.quad('brick', [[cx - hw, base, cz - hd], [cx - hw, base, cz + hd], [cx - hw, top, cz + hd], [cx - hw, top, cz - hd]], [-1, 0, 0], uvBrickX, lin('#c8bdb2'));
    M.quad('brick', [[cx + hw, base, cz - hd], [cx + hw, base, cz + hd], [cx + hw, top, cz + hd], [cx + hw, top, cz - hd]], [1, 0, 0], uvBrickX, lin('#c8bdb2'));
    M.box('concrete', cx - hw - 0.07, top, cz - hd - 0.07, cx + hw + 0.07, top + 0.12, cz + hd + 0.07, { col: lin('#b4b1a6') });
    for (const dx of [-0.17, 0.17]) M.box('concrete', cx + dx - 0.14, top + 0.12, cz - 0.14, cx + dx + 0.14, top + 0.44, cz + 0.14, { col: lin('#b86a48') });
    M.box('paint', cx - hw - 0.04, mainR.yT(cz - hd) - 0.02, cz - hd - 0.04, cx + hw + 0.04, mainR.yT(cz - hd) + 0.12, cz - hd, { col: col.alum, s: T.s, faces: 'fu' });         // the flashing
    // the TV antenna on the ridge: a mast, and a Yagi on it (boom, a reflector, a folded dipole and directors)
    const ax = 0.9, ay = mainR.yT(ZR) + 0.04, az = ZR + 0.1, mast = 2.7;
    M.box('paint', ax - 0.012, ay, az - 0.012, ax + 0.012, ay + mast, az + 0.012, { col: col.alum, s: T.s, vert: true });
    M.box('paint', ax - 0.25, ay, az - 0.06, ax + 0.25, ay + 0.06, az + 0.06, { col: col.black, s: T.s, faces: 'fbud' });
    // a Yagi: a boom turned 22 degrees off the ridge, `n` elements across it that shorten toward the front (l0 .. l1 metres)
    const yagi = (yy, len, n, l0, l1, ang) => {
      M.box('paint', ax - len / 2, yy - 0.012, az - 0.012, ax + len / 2, yy + 0.012, az + 0.012, { col: col.alum, s: T.s, yaw: ang });                  // the boom
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), l = lerp(l0, l1, t), bx = -len / 2 + 0.06 + t * (len - 0.12), ex = ax + Math.cos(ang) * bx, ez = az - Math.sin(ang) * bx;
        M.box('paint', ex - 0.008, yy - 0.008, ez - l / 2, ex + 0.008, yy + 0.008, ez + l / 2, { col: col.alum, s: T.s, yaw: ang });
      }
    };
    yagi(ay + mast - 0.08, 1.9, 9, 1.55, 0.92, 22 * DEG); yagi(ay + mast - 0.85, 1.1, 7, 0.7, 0.45, 22 * DEG);
    // the front gutter, on the fascia (white, open on top), and its two downspouts
    const gt = mainR.yT(ZF - MAIN.oh), gz = ZF - MAIN.oh;
    M.box('paint', MAIN.x0 - MAIN.rake, gt - 0.22, gz - 0.1, MAIN.x1, gt - 0.04, gz - 0.005, { col: col.white, s: T.s, faces: 'fdlr' });
    M.box('plain', MAIN.x0 - MAIN.rake + 0.01, gt - 0.05, gz - 0.095, MAIN.x1 - 0.01, gt - 0.045, gz - 0.01, { col: lin('#1a1814'), faces: 'u' });
    for (const dx of [-12.2, 6.9]) {
      const zd = ZF - 0.05, zg = gz - 0.05;
      M.box('paint', dx - 0.04, gt - 0.5, zg - 0.04, dx + 0.04, gt - 0.2, zg + 0.04, { col: col.white, s: T.s, vert: true });                       // the drop from the gutter
      M.box('paint', dx - 0.04, gt - 0.52, zg - 0.04, dx + 0.04, gt - 0.4, zd + 0.04, { col: col.white, s: T.s, faces: 'fudlr' });                    // the offset in to the wall
      M.box('paint', dx - 0.04, Y.g + 0.3, zd - 0.04, dx + 0.04, gt - 0.4, zd + 0.04, { col: col.white, s: T.s, vert: true });                         // the run down the wall
      M.box('paint', dx - 0.04, Y.g + 0.2, zd - 0.04, dx + 0.04, Y.g + 0.3, zd - 0.3, { col: col.white, s: T.s, faces: 'fudlr' });                    // the elbow out
      M.box('concrete', dx - 0.22, Y.g - 0.02, zd - 0.7, dx + 0.22, Y.g + 0.06, zd - 0.28, { col: lin('#b5b2a8'), faces: 'fudlr' });                    // the splash block
    }
  }

  // ---- shrubs along the house, trash cans
  {
    const rand = lcg(66), leafG = new THREE.IcosahedronGeometry(1, 2); leafG.deleteAttribute('uv'); leafG.deleteAttribute('normal'); const ico = mergeVertices(leafG);
    const spots = [[-12.0, 0.6], [-9.7, 0.55], [-8.7, 0.5], [-4.1, 0.55], [-3.3, 0.45], [-1.6, 0.55], [-0.5, 0.5], [1.0, 0.55], [2.2, 0.48], [6.0, 0.55], [6.9, 0.5], [-14.5, 0.65]];
    for (const [x, r] of spots) {
      const g = ico.clone(), pa = g.attributes.position, v = new THREE.Vector3(), sd = rand() * 9;
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const n = 1 + 0.13 * Math.sin(v.x * 5 + sd) * Math.cos(v.y * 4 + sd * 2) + 0.08 * Math.sin(v.z * 7 + sd) + 0.04 * Math.sin((v.x + v.y) * 15 + sd); pa.setXYZ(i, v.x * n, v.y * n, v.z * n); }
      g.computeVertexNormals(); const uvs = new Float32Array(pa.count * 2); for (let i = 0; i < pa.count; i++) { uvs[i * 2] = (pa.getX(i) + pa.getZ(i)) * 1.6; uvs[i * 2 + 1] = pa.getY(i) * 1.6; } g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, Y.g + r * 0.55, ZF - 0.45 - r * 0.25), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), new THREE.Vector3(r * 1.1, r * 0.9, r * 0.85));
      const tone = 0.85 + rand() * 0.4, ph = rand() * 50;
      M.geo('leaf', g, m, (nrm, i) => { const q = Math.sin(pa.getX(i) * 23 + ph) * Math.sin(pa.getY(i) * 19 + ph * 2) * Math.sin(pa.getZ(i) * 27 + ph * 3), k = tone * (0.5 + 0.7 * Math.max(0, nrm.y * 0.5 + 0.5)) * (1 + 0.45 * q); return [k * 0.07, k * 0.12, k * 0.034]; });
    }
    for (const x of [-11.35, -10.75]) {                                                   // galvanised trash cans against the west end
      const cz = ZF - 0.55;
      M.geo('plain', new THREE.CylinderGeometry(0.27, 0.24, 0.7, 14, 1), new THREE.Matrix4().makeTranslation(x, Y.g + 0.35, cz), col.gray);
      for (const yy of [0.2, 0.45]) M.geo('plain', new THREE.CylinderGeometry(0.275, 0.275, 0.035, 14, 1), new THREE.Matrix4().makeTranslation(x, Y.g + yy, cz), lin('#a2a8ab'));
      M.geo('plain', new THREE.CylinderGeometry(0.265, 0.285, 0.07, 14, 1), new THREE.Matrix4().makeTranslation(x, Y.g + 0.735, cz), lin('#9aa1a4'));
      M.box('plain', x - 0.05, Y.g + 0.8, cz - 0.015, x + 0.05, Y.g + 0.83, cz + 0.015, { col: col.black });
    }
  }

  // ---- the fence: white pickets (one instanced mesh), the posts and rails where Unity's were
  const posts = [], runs = [];
  for (const o of objects) {
    if (/^Outside\/Yard\/(FencePost[NEW]|BikeFencePost\d)$/.test(o.path)) posts.push([o.pos[0], o.pos[2]]);
    else if (/^Outside\/Yard\/(FenceRail\w+_a|BikeFenceRail_a)$/.test(o.path)) {
      const alongX = o.scale[0] > o.scale[2], len = alongX ? o.scale[0] : o.scale[2];
      runs.push({ alongX, a: (alongX ? o.pos[0] : o.pos[2]) - len / 2, b: (alongX ? o.pos[0] : o.pos[2]) + len / 2, c: alongX ? o.pos[2] : o.pos[0], bike: /Bike/.test(o.path) });
    }
  }
  const FH = 1.0;                                                         // picket height
  const inward = (r) => (r.alongX ? 1 : (r.c < 0 ? 1 : -1));    // which way is the yard: +z for the road end, +x for the west fence, -x for the east
  const picketPts = [];
  for (const r of runs) {
    const sgn = inward(r), n = Math.max(1, Math.round((r.b - r.a) / 0.135));
    for (const yy of [Y.g + 0.3, Y.g + 0.76]) {                                      // two rails on the outside, 4 cm x 9 cm
      if (r.alongX) M.box('paint', r.a, yy - 0.045, r.c + sgn * 0.04 - 0.02, r.b, yy + 0.045, r.c + sgn * 0.04 + 0.02, { col: col.white, s: T.s, faces: 'fbud' });
      else M.box('paint', r.c + sgn * 0.04 - 0.02, yy - 0.045, r.a, r.c + sgn * 0.04 + 0.02, yy + 0.045, r.b, { col: col.white, s: T.s, faces: 'lrud' });
    }
    for (let i = 0; i < n; i++) { const t = r.a + (i + 0.5) * (r.b - r.a) / n; picketPts.push(r.alongX ? [t, r.c + sgn * 0.075, 0] : [r.c + sgn * 0.075, t, Math.PI / 2]); }
  }
  const postSpots = posts.slice(); for (const r of runs) for (const e of [r.a, r.b]) { const p = r.alongX ? [e, r.c] : [r.c, e]; if (!postSpots.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.3)) postSpots.push(p); }
  for (const [px, pz] of postSpots) {
    M.box('paint', px - 0.055, Y.g - 0.05, pz - 0.055, px + 0.055, Y.g + 1.14, pz + 0.055, { col: lin('#dcd7c8'), s: T.s, vert: true, faces: 'fblr' });
    M.box('paint', px - 0.075, Y.g + 1.14, pz - 0.075, px + 0.075, Y.g + 1.18, pz + 0.075, { col: lin('#e4dfd0'), s: T.s });
    M.box('paint', px - 0.04, Y.g + 1.18, pz - 0.04, px + 0.04, Y.g + 1.23, pz + 0.04, { col: lin('#e4dfd0'), s: T.s });
  }
  // one picket: 9 cm wide, a pointed top: a front and a back face 2 cm apart, no edges (6 triangles; seen edge-on it is 2 cm, which nobody will miss)
  const pk = new Mesher(), pw = 0.045, pt = 0.01, pb = 0.06, ptop = FH - 0.075, ptip = FH;
  {
    const sh = [[-pw, pb], [pw, pb], [pw, ptop], [0, ptip], [-pw, ptop]];
    pk.quad('p', sh.map(([x, y]) => [x, y, -pt]), [0, 0, -1], (p) => [p[1] / 0.5, p[0] / 0.5]);
    pk.quad('p', sh.map(([x, y]) => [x, y, pt]), [0, 0, 1], (p) => [p[1] / 0.5, p[0] / 0.5]);
  }
  const picketGeo = pk.build('p');

  // ---- the mailbox: a galvanised box with a rounded top and a red flag on a wooden post, where Unity's stood
  const mp = objects.find((o) => o.path === 'Outside/Yard/MailboxPost'), mb = objects.find((o) => o.path === 'Outside/Yard/Mailbox');
  if (mp && mb) {
    const mx = mp.pos[0], mz = mp.pos[2], top = mp.pos[1] + mp.scale[1] / 2, hl = 0.25, r = 0.1;
    M.box('paint', mx - 0.045, Y.g, mz - 0.045, mx + 0.045, top, mz + 0.045, { col: col.wood, s: [0.5, 0.5], vert: true, faces: 'fblr' });                      // the post, 9 cm
    M.box('paint', mx - 0.09, top - 0.02, mz - 0.3, mx + 0.09, top + 0.02, mz + 0.3, { col: col.wood, s: T.s });                                              // the plank under the box
    const by = top + 0.02, pts = [];
    pts.push([-r, 0]); for (let i = 0; i <= 10; i++) { const a = Math.PI - (i / 10) * Math.PI; pts.push([Math.cos(a) * r, 0.05 + Math.sin(a) * (r + 0.01)]); } pts.push([r, 0]);
    const body = lin('#aab1b4');
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, b] = [pts[i], pts[i + 1]], om = [(a[1] - b[1]), (b[0] - a[0]), 0];
      M.quad('plain', [[mx + a[0], by + a[1], mz - hl], [mx + b[0], by + b[1], mz - hl], [mx + b[0], by + b[1], mz + hl], [mx + a[0], by + a[1], mz + hl]], [om[0], om[1], 0], uvPaint, body);
    }
    for (const [zz, o] of [[mz + hl, 1], [mz - hl, -1]]) M.quad('plain', pts.map((p) => [mx + p[0], by + p[1], zz]), [0, 0, o], uvPaint, o > 0 ? lin('#c2c8ca') : body);        // the door end (lighter) and the back
    M.box('plain', mx - 0.012, by + 0.17, mz + hl + 0.005, mx + 0.012, by + 0.2, mz + hl + 0.03, { col: col.black });                                           // the latch
    M.box('plain', mx + r - 0.004, by + 0.05, mz - hl + 0.06, mx + r + 0.012, by + 0.215, mz - hl + 0.085, { col: col.gray });                                    // the flag's arm
    M.box('plain', mx + r - 0.004, by + 0.17, mz - hl + 0.02, mx + r + 0.012, by + 0.23, mz - hl + 0.15, { col: col.red });                                      // the red flag, up
  }

  // ---- the meshes
  const group = new THREE.Group(); group.name = 'YardHouse';
  const sd = sidingMaps(), sh = shingleMaps(), br = brickMaps(), conc = concreteMap(), pm = paintMap();
  const mats = {
    siding: new THREE.MeshStandardMaterial({ name: 'M_YardSiding', map: tex(sd.color, A), bumpMap: tex(sd.height, A, { data: true }), bumpScale: 0.03, roughness: 0.82, vertexColors: true }),
    roof: new THREE.MeshStandardMaterial({ name: 'M_YardShingles', map: tex(sh.color, A), bumpMap: tex(sh.height, A, { data: true }), bumpScale: 0.02, roughness: 0.95, vertexColors: true }),
    brick: new THREE.MeshStandardMaterial({ name: 'M_YardBrick', map: tex(br.color, A), bumpMap: tex(br.height, A, { data: true }), bumpScale: 0.012, roughness: 0.9, vertexColors: true }),
    concrete: new THREE.MeshStandardMaterial({ name: 'M_YardConcrete', map: tex(conc, A), bumpMap: tex(conc, A, { data: true }), bumpScale: 0.004, roughness: 0.95, vertexColors: true }),
    paint: new THREE.MeshStandardMaterial({ name: 'M_YardPaint', map: tex(pm, A), roughness: 0.62, vertexColors: true }),
    plain: new THREE.MeshStandardMaterial({ name: 'M_YardMetal', roughness: 0.5, metalness: 0.15, vertexColors: true }),
    doors: new THREE.MeshStandardMaterial({ name: 'M_YardDoors', map: tex(doorsMap(), A, { clamp: true }), roughness: 0.7, vertexColors: true }),
    glass: new THREE.MeshBasicMaterial({ name: 'M_YardGlass', map: tex(glassAtlas(), A, { clamp: true }), vertexColors: true }),
    lamp: new THREE.MeshBasicMaterial({ name: 'M_YardLamp', vertexColors: true }),
    screen: new THREE.MeshBasicMaterial({ name: 'M_YardScreen', map: tex(screenMap(), A), transparent: true, depthWrite: false, vertexColors: true }),
    leaf: new THREE.MeshStandardMaterial({ name: 'M_YardShrub', roughness: 0.95, vertexColors: true }),
  };
  mats.lamp.color.setRGB(2.6, 1.55, 0.6, THREE.LinearSRGBColorSpace);
  let tris = 0, calls = 0;
  for (const k of M.b.keys()) {
    const g = M.build(k), mesh = new THREE.Mesh(g, mats[k]); mesh.name = 'YardHouse/' + k; mesh.matrixAutoUpdate = false;
    if (k === 'screen') mesh.renderOrder = 2;
    group.add(mesh); tris += g.index.count / 3; calls++;
  }
  // the pickets: weathered by the picket (white to a greyed white), a hair of tilt and height
  {
    const rand = lcg(123), im = new THREE.InstancedMesh(picketGeo, new THREE.MeshStandardMaterial({ name: 'M_YardPickets', map: mats.paint.map, roughness: 0.62 }), picketPts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    picketPts.forEach(([x, z, yaw], i) => {
      e.set((rand() - 0.5) * 0.03, yaw, (rand() - 0.5) * 0.03); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, Y.g, z), q, new THREE.Vector3(1, 0.96 + rand() * 0.07, 1)); im.setMatrixAt(i, m);
      const t = rand() < 0.12 ? 0.62 + rand() * 0.2 : 0.8 + rand() * 0.2; im.setColorAt(i, c.setRGB(t, t * 0.985, t * 0.94, THREE.SRGBColorSpace));
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.name = 'YardHouse/pickets';
    group.add(im); tris += picketPts.length * 6; calls++;
  }
  // lit windows and lamps come up with the dusk: the glass is drawn unlit, so its brightness is set here
  const update = (t) => {
    mats.glass.color.setScalar(lerp(0.75, 1.2, smooth01(t / 0.8)));
    mats.lamp.color.setRGB(2.6, 1.55, 0.6, THREE.LinearSRGBColorSpace).multiplyScalar(lerp(0.6, 1.1, smooth01(t / 0.6)));
  };
  update(0);
  return { group, colliders, lights, update, mats, stats: { tris, calls, pickets: picketPts.length, posts: postSpots.length, buildMs: +(performance.now() - t0).toFixed(1) } };
}
// the old yard pieces this replaces: Unity's flat wall, roof, eave, windows and trims, the square fence sticks and the mailbox box
export const YARD_OLD = /^Outside\/(HouseSide(\/|$)|Yard\/(FencePost|FenceRail|BikeFencePost|BikeFenceRail|Mailbox))/;
export const YARD_OLD_COLLIDER = /^Outside\/HouseSide\/HouseWall$/;
