// STREET TEXTURES (look batch 3a): everything js/mainstreet.js paints is drawn here at load, from fixed seeds. No files, no network, the same
// every run. Names on signs are invented (no real brand, shop or product anywhere).
import * as THREE from 'three';
import { lcg, paint, tex, speckle, c8, rgba, lerp } from './streetkit.js';

// value noise that wraps: an n x n field over a cells x cells lattice, 0..1
function tileNoise(n, cells, rand) {
  const lat = Float32Array.from({ length: cells * cells }, () => rand()), out = new Float32Array(n * n), s = cells / n;
  for (let y = 0; y < n; y++) {
    const fy = y * s, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ra = (y0 % cells) * cells, rb = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < n; x++) {
      const fx = x * s, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % cells, xb = (x0 + 1) % cells;
      out[y * n + x] = lerp(lerp(lat[ra + xa], lat[ra + xb], sx), lerp(lat[rb + xa], lat[rb + xb], sx), sy);
    }
  }
  return out;
}
// the one noise tile the pavement and the road paint read by world position: r grain, g slow drift, b mid wear (raw data, tiling)
export function noiseTexture(aniso) {
  const N = 256, rand = lcg(1982), slow = tileNoise(N, 6, rand), mid = tileNoise(N, 24, rand), fine = tileNoise(N, 64, rand);
  const c = paint(N, N, (g) => {
    const im = g.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      im.data[i * 4] = c8(255 * (0.5 + (rand() - 0.5) * 0.7 + (fine[i] - 0.5) * 0.6)); im.data[i * 4 + 1] = c8(255 * (0.5 + (slow[i] - 0.5) * 1.5));
      im.data[i * 4 + 2] = c8(255 * (0.5 + (mid[i] - 0.5) * 1.6)); im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
  return tex(c, aniso, { data: true });
}

// face brick in running bond, 0.9 m x 0.9 m a repeat; mortar is the low ground of the height map. A darker, dirtier red than the yard's: it is a street.
export function brickMaps() {
  const rand = lcg(11), W = 512, H = 516, rows = 12, bh = H / rows, bw = W / 4;
  const pal = [[128, 52, 38], [142, 62, 46], [112, 46, 36], [150, 74, 52], [100, 46, 38], [136, 58, 42], [90, 44, 38], [120, 60, 44]];
  const color = paint(W, H, (g) => {
    g.fillStyle = 'rgb(150,144,132)'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let b = -1; b < 4; b++) {
      const x = b * bw + (r % 2) * bw / 2, y = r * bh, c = pal[Math.floor(rand() * pal.length)], m = 0.82 + rand() * 0.34;
      g.fillStyle = rgba(c, m); g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 3, y + bh - 8, bw - 6, 5);
      g.fillStyle = 'rgba(255,230,200,0.09)'; g.fillRect(x + 3, y + 3, bw - 6, 3);
      if (rand() < 0.22) { g.fillStyle = 'rgba(24,14,14,0.32)'; g.fillRect(x + 3 + rand() * (bw - 30), y + 4 + rand() * 20, 14 + rand() * 24, 10 + rand() * 14); }
    }
    speckle(rand, g, W, H, 4500, 0.1, 1.5);
    for (let i = 0; i < 9; i++) { const x = rand() * W, r = 50 + rand() * 90, grd = g.createLinearGradient(x, 0, x, H); grd.addColorStop(0, 'rgba(20,16,12,0.20)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r / 6, 0, r / 3, H); }   // streaks of soot and rain
  });
  const height = paint(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let b = -1; b < 4; b++) { const x = b * bw + (r % 2) * bw / 2, y = r * bh; g.fillStyle = `rgb(${c8(190 + rand() * 65)},0,0)`; g.fillRect(x + 3, y + 3, bw - 6, bh - 6); }
  });
  return { color, height };
}

// grained wood for the poles (vertical streaks) and for the wagon's side panels
export function poleMap() {
  const rand = lcg(5);
  return paint(64, 512, (g, W, H) => {
    g.fillStyle = 'rgb(122,96,70)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { const x = rand() * W, len = 60 + rand() * 300, y = rand() * H; g.fillStyle = rand() < 0.5 ? 'rgba(20,12,6,0.22)' : 'rgba(210,170,120,0.1)'; g.fillRect(x, y, 1 + rand() * 2, len); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(15,8,4,0.55)'; const x = rand() * W, y = rand() * H; g.beginPath(); g.ellipse(x, y, 3 + rand() * 4, 6 + rand() * 8, 0, 0, 7); g.fill(); }   // knots
    const grd = g.createLinearGradient(0, H * 0.7, 0, H); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(12,8,4,0.5)'); g.fillStyle = grd; g.fillRect(0, H * 0.7, W, H * 0.3);   // the creosote at the butt
  });
}
export function woodPanelMap() {
  const rand = lcg(9);
  return paint(256, 128, (g, W, H) => {
    g.fillStyle = 'rgb(138,92,54)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) { const y = rand() * H, len = 40 + rand() * 160, x = rand() * W; g.fillStyle = rand() < 0.5 ? 'rgba(50,26,10,0.22)' : 'rgba(235,190,130,0.13)'; g.fillRect(x, y, len, 1 + rand() * 1.5); }
    g.fillStyle = 'rgba(30,16,6,0.55)'; for (const y of [0, 32, 64, 96]) g.fillRect(0, y, W, 2);
  });
}

// asphalt roofs: tar and gravel, 1 m a repeat
export function roofMap() {
  const rand = lcg(21);
  return paint(128, 128, (g, W, H) => {
    g.fillStyle = 'rgb(70,66,62)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { const v = 50 + rand() * 80; g.fillStyle = `rgba(${c8(v)},${c8(v * 0.96)},${c8(v * 0.9)},0.9)`; g.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 2); }
    for (let i = 0; i < 6; i++) { const x = rand() * W, y = rand() * H, r = 14 + rand() * 30, grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(10,10,12,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
}

// ---- an atlas: shelf-packed rectangles on one canvas, each drawn by its own function; rect(name) gives its uv box (v up)
export class Atlas {
  constructor(W, H) { this.W = W; this.H = H; this.items = {}; this.x = 0; this.y = 0; this.rowH = 0; this.c = document.createElement('canvas'); this.c.width = W; this.c.height = H; this.g = this.c.getContext('2d'); }
  add(name, w, h, fn) {
    if (this.x + w > this.W) { this.x = 0; this.y += this.rowH; this.rowH = 0; }
    const x = this.x, y = this.y; this.x += w; this.rowH = Math.max(this.rowH, h);
    const g = this.g; g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(g, w, h); g.restore();
    this.items[name] = [(x + 1) / this.W, 1 - (y + h - 1) / this.H, (x + w - 1) / this.W, 1 - (y + 1) / this.H];      // u0, v0 (bottom), u1, v1 (top)
  }
  rect(name) { const r = this.items[name]; if (!r) throw new Error('atlas: no ' + name); return r; }
}
// a point -> atlas uv, for a flat face spanned by (a0..a1 along `axis`, y0..y1 up); flipU turns it for faces seen from the other side
export const atlasUv = (r, a0, a1, y0, y1, axis = 0, flipU = false) => (p) => {
  let tu = (p[axis] - a0) / (a1 - a0), tv = (p[1] - y0) / (y1 - y0); if (flipU) tu = 1 - tu;
  return [r[0] + tu * (r[2] - r[0]), r[1] + tv * (r[3] - r[1])];
};

const txt = (g, s, x, y, font, col, align = 'center', base = 'middle') => { g.font = font; g.fillStyle = col; g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y); };
const neon = (g, s, x, y, font, col, glow) => {
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = glow; g.shadowBlur = 18; g.fillStyle = col; g.fillText(s, x, y); g.fillText(s, x, y);
  g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(s, x, y);
  g.globalCompositeOperation = 'source-over';
};
// a painted board lit from above: the lamps are over it, so it is brightest at the top and eases away below
function board(g, w, h, bg, edge, inner) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = edge; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12); if (inner) { g.lineWidth = 2; g.strokeStyle = inner; g.strokeRect(14, 14, w - 28, h - 28); }
}
function lightFromAbove(g, w, h, lo = 0.62) { const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(8,4,2,${1 - lo})`); g.fillStyle = grd; g.fillRect(0, 0, w, h); }

export function signAtlas() {
  const A = new Atlas(2048, 1024), rand = lcg(77);
  // the shop boards, 1024 x 128: painted, lit by gooseneck lamps
  A.add('market', 1024, 128, (g, w, h) => { board(g, w, h, 'rgb(34,84,58)', 'rgb(232,214,160)', 'rgb(232,214,160)'); txt(g, 'CORNER MARKET', w / 2, h * 0.5, 'bold 78px Georgia, serif', 'rgb(246,236,200)'); lightFromAbove(g, w, h); });
  A.add('shoes', 1024, 128, (g, w, h) => { board(g, w, h, 'rgb(28,44,92)', 'rgb(236,226,200)', 'rgb(236,226,200)'); txt(g, 'BELLAMY', 250, h * 0.5, 'bold 74px Georgia, serif', 'rgb(246,238,214)'); txt(g, 'SHOES', 640, h * 0.5, 'italic 74px Georgia, serif', 'rgb(236,184,72)'); txt(g, 'FAMILY FOOTWEAR', 905, h * 0.52, 'bold 21px Arial, sans-serif', 'rgb(214,208,190)'); lightFromAbove(g, w, h); });
  A.add('pharmacy', 1024, 128, (g, w, h) => { board(g, w, h, 'rgb(236,230,208)', 'rgb(32,86,62)', null); g.fillStyle = 'rgb(176,28,34)'; g.beginPath(); g.arc(98, h / 2, 40, 0, 7); g.fill(); txt(g, 'Rx', 98, h / 2 + 3, 'bold 46px Georgia, serif', 'rgb(250,244,230)'); txt(g, 'MAPLE PHARMACY', 580, h * 0.5, 'bold 70px Georgia, serif', 'rgb(30,86,62)'); lightFromAbove(g, w, h, 0.7); });
  A.add('barber', 1024, 128, (g, w, h) => { board(g, w, h, 'rgb(122,24,30)', 'rgb(236,226,200)', 'rgb(236,226,200)'); txt(g, "RAY'S BARBER SHOP", w / 2, h * 0.5, 'bold 70px Georgia, serif', 'rgb(246,238,214)'); lightFromAbove(g, w, h); });
  A.add('variety', 1024, 128, (g, w, h) => { board(g, w, h, 'rgb(232,186,52)', 'rgb(150,28,30)', 'rgb(150,28,30)'); txt(g, 'ECONOMY VARIETY', w / 2, h * 0.5, 'bold 76px Georgia, serif', 'rgb(150,26,30)'); lightFromAbove(g, w, h, 0.7); });
  // the video shop's blank sign panel, written on (the photo's own panel is a lit cream board)
  A.add('rentals', 1024, 96, (g, w, h) => { g.fillStyle = 'rgb(255,244,214)'; g.fillRect(0, 0, w, h); txt(g, 'VIDEO CLUB', 300, h * 0.5, 'bold 60px Arial, sans-serif', 'rgb(160,28,36)'); txt(g, 'MOVIES * GAMES * RENTALS', 745, h * 0.52, 'bold 30px Arial, sans-serif', 'rgb(40,52,110)'); g.fillStyle = 'rgba(190,150,80,0.25)'; g.fillRect(0, h - 14, w, 14); });
  // neon and small signs
  A.add('open_neon', 256, 96, (g, w, h) => { g.fillStyle = 'rgb(14,10,12)'; g.fillRect(0, 0, w, h); neon(g, 'OPEN', w / 2, h / 2, 'bold 62px Arial, sans-serif', 'rgb(255,86,70)', 'rgb(255,40,30)'); g.strokeStyle = 'rgb(255,70,60)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16); });
  A.add('diner_neon', 384, 112, (g, w, h) => { g.fillStyle = 'rgb(10,10,16)'; g.fillRect(0, 0, w, h); neon(g, 'OPEN', w * 0.5, h * 0.36, 'bold 54px Arial, sans-serif', 'rgb(255,110,170)', 'rgb(255,40,120)'); neon(g, '24 HOURS', w * 0.5, h * 0.74, 'bold 36px Arial, sans-serif', 'rgb(110,230,255)', 'rgb(30,170,255)'); });
  A.add('closed_card', 192, 128, (g, w, h) => { g.fillStyle = 'rgb(238,230,206)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgb(150,26,30)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); txt(g, 'CLOSED', w / 2, h * 0.42, 'bold 40px Arial, sans-serif', 'rgb(160,26,30)'); txt(g, 'PLEASE CALL AGAIN', w / 2, h * 0.74, 'bold 15px Arial, sans-serif', 'rgb(70,58,44)'); });
  A.add('open_card', 192, 128, (g, w, h) => { g.fillStyle = 'rgb(24,94,62)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgb(240,232,206)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); txt(g, 'OPEN', w / 2, h * 0.44, 'bold 52px Arial, sans-serif', 'rgb(246,240,220)'); txt(g, 'COME ON IN', w / 2, h * 0.78, 'bold 16px Arial, sans-serif', 'rgb(214,226,200)'); });
  A.add('rx_blade', 160, 160, (g, w, h) => { g.fillStyle = 'rgb(236,230,208)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgb(32,86,62)'; g.lineWidth = 9; g.beginPath(); g.arc(w / 2, h / 2, 66, 0, 7); g.stroke(); txt(g, 'Rx', w / 2, h / 2 + 3, 'bold 74px Georgia, serif', 'rgb(176,28,34)'); });
  A.add('barber_pole', 64, 256, (g, w, h) => { g.fillStyle = 'rgb(240,238,230)'; g.fillRect(0, 0, w, h); g.save(); g.beginPath(); g.rect(0, 0, w, h); g.clip(); for (let k = -4; k < 12; k++) { g.fillStyle = k % 3 === 0 ? 'rgb(190,28,34)' : k % 3 === 1 ? 'rgb(38,62,160)' : 'rgb(240,238,230)'; g.beginPath(); g.moveTo(0, k * 40 - 30); g.lineTo(w, k * 40 + 6); g.lineTo(w, k * 40 + 46); g.lineTo(0, k * 40 + 10); g.fill(); } g.restore(); });
  A.add('street_main', 256, 64, (g, w, h) => { g.fillStyle = 'rgb(22,90,58)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgb(236,240,232)'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); txt(g, 'MAIN ST', w / 2, h * 0.52, 'bold 36px Arial, sans-serif', 'rgb(240,244,236)'); });
  A.add('street_cedar', 256, 64, (g, w, h) => { g.fillStyle = 'rgb(22,90,58)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgb(236,240,232)'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); txt(g, 'CEDAR ST', w / 2, h * 0.52, 'bold 36px Arial, sans-serif', 'rgb(240,244,236)'); });
  A.add('stop', 128, 128, (g, w, h) => { g.fillStyle = 'rgb(188,22,28)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgb(244,240,232)'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); txt(g, 'STOP', w / 2, h / 2 + 2, 'bold 46px Arial, sans-serif', 'rgb(248,244,236)'); });
  A.add('news', 96, 64, (g, w, h) => { g.fillStyle = 'rgb(236,232,214)'; g.fillRect(0, 0, w, h); txt(g, 'DAILY NEWS', w / 2, 14, 'bold 14px Georgia, serif', 'rgb(30,30,34)'); g.fillStyle = 'rgb(60,60,64)'; for (let y = 26; y < 58; y += 5) g.fillRect(8, y, w - 16 - (y % 3) * 8, 2); });
  A.add('mail', 160, 64, (g, w, h) => { g.fillStyle = 'rgb(30,52,120)'; g.fillRect(0, 0, w, h); txt(g, 'MAIL', w / 2, h / 2 + 1, 'bold 36px Arial, sans-serif', 'rgb(240,238,230)'); });
  A.add('noparking', 64, 96, (g, w, h) => { g.fillStyle = 'rgb(240,238,230)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgb(176,28,34)'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); txt(g, 'NO', w / 2, 20, 'bold 22px Arial, sans-serif', 'rgb(176,28,34)'); txt(g, 'PARKING', w / 2, 44, 'bold 14px Arial, sans-serif', 'rgb(176,28,34)'); txt(g, '8AM-6PM', w / 2, 70, 'bold 11px Arial, sans-serif', 'rgb(40,40,44)'); });
  A.add('phone', 160, 40, (g, w, h) => { g.fillStyle = 'rgb(236,238,232)'; g.fillRect(0, 0, w, h); txt(g, 'TELEPHONE', w / 2, h / 2 + 1, 'bold 24px Arial, sans-serif', 'rgb(24,60,120)'); });
  A.add('hotel', 512, 160, (g, w, h) => { g.fillStyle = 'rgb(16,10,22)'; g.fillRect(0, 0, w, h); neon(g, 'HOTEL', w / 2, h / 2, 'bold 100px Arial, sans-serif', 'rgb(110,240,255)', 'rgb(30,160,255)'); });
  A.add('bank', 512, 128, (g, w, h) => { g.fillStyle = 'rgb(14,18,30)'; g.fillRect(0, 0, w, h); txt(g, 'TOWN & COUNTRY BANK', w / 2, h * 0.34, 'bold 38px Georgia, serif', 'rgb(250,236,190)'); txt(g, '9:41     58°', w / 2, h * 0.76, 'bold 46px "Courier New", monospace', 'rgb(255,120,70)'); });
  return A;
}

// ---- the windows, one atlas of rooms seen from outside (4 x 2 cells of 256 px)
export const WCELL = { lamp: 0, blinds: 1, tv: 2, dark: 3, bulb: 4, office: 5, shade: 6, kitchen: 7 };
export function windowAtlas() {
  const rand = lcg(55), A = new Atlas(1024, 512);
  const curtain = (g, x, w, c, c2) => { g.fillStyle = c; g.fillRect(x, 0, w, 256); for (let k = 0; k < w; k += 9) { g.fillStyle = c2; g.fillRect(x + k, 0, 3 + rand() * 2, 256); } };
  const room = (name, fn) => A.add(name, 256, 256, fn);
  room('lamp', (g) => {
    const wall = g.createRadialGradient(160, 190, 5, 128, 150, 200); wall.addColorStop(0, 'rgb(255,226,150)'); wall.addColorStop(0.5, 'rgb(226,160,84)'); wall.addColorStop(1, 'rgb(120,66,36)'); g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(120,70,40)'; g.fillRect(96, 40, 56, 40); g.fillStyle = 'rgb(205,170,110)'; g.fillRect(101, 45, 46, 30);
    g.fillStyle = 'rgb(255,248,220)'; g.beginPath(); g.moveTo(166, 150); g.lineTo(214, 150); g.lineTo(204, 190); g.lineTo(176, 190); g.fill(); g.fillStyle = 'rgb(90,50,30)'; g.fillRect(188, 190, 4, 40); g.fillRect(170, 226, 40, 30);
    curtain(g, 0, 54, 'rgb(150,76,36)', 'rgba(90,40,20,0.7)'); curtain(g, 202, 54, 'rgb(150,76,36)', 'rgba(90,40,20,0.7)'); g.fillStyle = 'rgb(110,54,26)'; g.fillRect(0, 0, 256, 22);
  });
  room('blinds', (g) => {
    const wall = g.createLinearGradient(0, 0, 0, 256); wall.addColorStop(0, 'rgb(255,236,170)'); wall.addColorStop(1, 'rgb(220,160,86)'); g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 150; y += 12) { g.fillStyle = 'rgb(246,226,170)'; g.fillRect(0, y, 256, 9); g.fillStyle = 'rgba(80,50,20,0.55)'; g.fillRect(0, y + 9, 256, 3); }
    g.fillStyle = 'rgba(80,50,20,0.7)'; g.fillRect(120, 150, 3, 106); g.fillStyle = 'rgb(90,54,30)'; g.fillRect(40, 200, 176, 56);
  });
  room('tv', (g) => {
    g.fillStyle = 'rgb(18,16,22)'; g.fillRect(0, 0, 256, 256); const glow = g.createRadialGradient(128, 150, 10, 128, 150, 170); glow.addColorStop(0, 'rgba(140,180,255,0.75)'); glow.addColorStop(1, 'rgba(40,60,120,0)'); g.fillStyle = glow; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(20,20,24)'; g.fillRect(70, 118, 116, 84); g.fillStyle = 'rgb(176,206,255)'; g.fillRect(78, 126, 100, 66); g.fillStyle = 'rgba(80,110,200,0.4)'; for (let y = 126; y < 192; y += 4) g.fillRect(78, y, 100, 1.5);
    curtain(g, 0, 40, 'rgba(70,40,40,0.85)', 'rgba(30,16,16,0.6)'); curtain(g, 216, 40, 'rgba(70,40,40,0.85)', 'rgba(30,16,16,0.6)');
  });
  room('dark', (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 256); sky.addColorStop(0, 'rgb(64,60,104)'); sky.addColorStop(0.5, 'rgb(34,30,58)'); sky.addColorStop(1, 'rgb(10,9,18)'); g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.moveTo(40, 0); g.lineTo(110, 0); g.lineTo(0, 150); g.lineTo(0, 80); g.fill();
    g.fillStyle = 'rgba(255,170,90,0.12)'; g.fillRect(0, 200, 256, 56);                                             // the street lamp in the glass
  });
  room('bulb', (g) => {
    const wall = g.createRadialGradient(128, 40, 4, 128, 90, 220); wall.addColorStop(0, 'rgb(255,252,224)'); wall.addColorStop(0.4, 'rgb(236,206,140)'); wall.addColorStop(1, 'rgb(120,84,48)'); g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(255,255,240)'; g.beginPath(); g.arc(128, 36, 14, 0, 7); g.fill(); g.fillStyle = 'rgb(60,40,28)'; g.fillRect(60, 180, 136, 76); g.fillRect(20, 120, 60, 136);
  });
  room('office', (g) => {
    const wall = g.createLinearGradient(0, 0, 0, 256); wall.addColorStop(0, 'rgb(226,236,206)'); wall.addColorStop(1, 'rgb(150,170,120)'); g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(54,92,64)'; g.beginPath(); g.moveTo(150, 120); g.lineTo(220, 120); g.lineTo(206, 160); g.lineTo(164, 160); g.fill(); g.fillRect(184, 160, 4, 60);
    g.fillStyle = 'rgb(90,70,50)'; g.fillRect(0, 200, 256, 56); g.fillStyle = 'rgb(46,50,46)'; g.fillRect(30, 140, 70, 60);
    for (let x = 0; x < 256; x += 22) { g.fillStyle = 'rgba(50,70,40,0.25)'; g.fillRect(x, 0, 2, 120); }
  });
  room('shade', (g) => {
    const wall = g.createLinearGradient(0, 0, 0, 256); wall.addColorStop(0, 'rgb(255,214,140)'); wall.addColorStop(1, 'rgb(236,170,96)'); g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(120,70,30,0.18)'; for (let i = 0; i < 40; i++) g.fillRect(rand() * 256, rand() * 256, 30 + rand() * 60, 2); g.fillStyle = 'rgb(200,138,70)'; g.fillRect(0, 210, 256, 46); g.fillStyle = 'rgb(150,100,56)'; g.fillRect(118, 210, 20, 12);
  });
  room('kitchen', (g) => {
    const wall = g.createLinearGradient(0, 0, 0, 256); wall.addColorStop(0, 'rgb(255,250,214)'); wall.addColorStop(1, 'rgb(236,206,128)'); g.fillStyle = wall; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgb(110,70,40)'; g.fillRect(0, 0, 256, 70); g.fillStyle = 'rgb(90,56,32)'; for (let x = 0; x < 256; x += 64) g.fillRect(x + 62, 0, 4, 70);
    g.fillStyle = 'rgb(196,170,120)'; g.fillRect(0, 215, 256, 41); g.fillStyle = 'rgba(255,255,230,0.5)'; g.fillRect(0, 120, 256, 30);
  });
  return A;
}

// ---- road decals, 4 cells of 128: a soft stain, a manhole cover, a storm grate, a patch
export function decalAtlas() {
  const rand = lcg(31), A = new Atlas(512, 128);
  A.add('blob', 128, 128, (g) => { g.clearRect(0, 0, 128, 128); const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62); grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.4)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128); });
  A.add('manhole', 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128); g.fillStyle = 'rgba(10,10,12,0.95)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.strokeStyle = 'rgba(70,66,62,0.9)'; g.lineWidth = 3; for (const r of [52, 40, 28, 16]) { g.beginPath(); g.arc(64, 64, r, 0, 7); g.stroke(); }
    g.strokeStyle = 'rgba(60,56,52,0.9)'; g.lineWidth = 3; for (let a = 0; a < 6.3; a += 0.5236) { g.beginPath(); g.moveTo(64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16); g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); g.stroke(); }
    g.strokeStyle = 'rgba(30,28,26,0.9)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.stroke();
  });
  A.add('grate', 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128); g.fillStyle = 'rgba(6,6,8,0.96)'; g.fillRect(6, 24, 116, 80);
    g.fillStyle = 'rgba(78,74,68,0.95)'; for (let x = 12; x < 120; x += 12) g.fillRect(x, 26, 5, 76); g.strokeStyle = 'rgba(50,46,42,0.95)'; g.lineWidth = 5; g.strokeRect(5, 23, 118, 82);
  });
  A.add('patch', 128, 128, (g) => {
    g.clearRect(0, 0, 128, 128); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(8, 20, 112, 88);
    g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 2.5; g.strokeRect(8, 20, 112, 88);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${c8(40 + rand() * 40)},${c8(40 + rand() * 40)},${c8(44 + rand() * 40)},0.55)`; g.fillRect(10 + rand() * 106, 22 + rand() * 84, 1 + rand() * 3, 1 + rand() * 3); }
  });
  return A;
}

// a soft round pool of light, white in the middle and nothing at the rim (added over a wall or a floor)
export function poolMap() {
  return paint(128, 128, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, '#fff'); grd.addColorStop(0.25, '#9a9a9a'); grd.addColorStop(0.6, '#303030'); grd.addColorStop(1, '#000');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  });
}
