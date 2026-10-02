// THE NODE · THE JUNCTION · STARVECTOR (the super-scaler) · the art, all made in code: colour helpers, noise, the sprites
// (rocks, our angular fighters, drones, a turret), the three skies and the Wayfinder's sprite atlas (baked from the model:
// tools/starvector_bake_ship.mjs -> assets/starvector/ship_atlas.png). Sprites are Uint32 RGBA (alpha 0 = clear), scaled by the
// renderer with nearest-neighbour, so they stay chunky at any size.

// ---------------------------------------------------------------- colour
export const pack = (r, g, b, a = 255) => ((a << 24) | ((b < 0 ? 0 : b > 255 ? 255 : b | 0) << 16) | ((g < 0 ? 0 : g > 255 ? 255 : g | 0) << 8) | (r < 0 ? 0 : r > 255 ? 255 : r | 0)) >>> 0;
export const hex = (h) => pack((h >> 16) & 255, (h >> 8) & 255, h & 255);
export const rOf = (c) => c & 255, gOf = (c) => (c >>> 8) & 255, bOf = (c) => (c >>> 16) & 255;
export function mix(a, b, t) {
    if (t <= 0) return a; if (t >= 1) return b;
    const u = 1 - t;
    return pack((a & 255) * u + (b & 255) * t, ((a >>> 8) & 255) * u + ((b >>> 8) & 255) * t, ((a >>> 16) & 255) * u + ((b >>> 16) & 255) * t);
}
export function mul(c, k) { return pack(Math.min(255, (c & 255) * k), Math.min(255, ((c >>> 8) & 255) * k), Math.min(255, ((c >>> 16) & 255) * k)); }
export function add(a, b, k = 1) { return pack(Math.min(255, (a & 255) + (b & 255) * k), Math.min(255, ((a >>> 8) & 255) + ((b >>> 8) & 255) * k), Math.min(255, ((a >>> 16) & 255) + ((b >>> 16) & 255) * k)); }
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** a ramp is an array of packed colours dark -> light; v 0..1 picks a step, dithered between steps */
export function ramp(r, v, x, y) {
    const n = r.length - 1, f = Math.min(1, Math.max(0, v)) * n, i = Math.floor(f), fr = f - i;
    return r[Math.min(n, i + (fr > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0))];
}

// ---------------------------------------------------------------- noise
export function hash2(x, y, s = 0) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
export function vnoise(x, y, s = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 0, oct = 4) {
    let a = 0.5, f = 1, t = 0, n = 0;
    for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
    return t / n;
}

// a tileable noise table (value noise, one lattice cell = 8 texels): a bilinear lookup is several times cheaper than vnoise, for the
// big per-pixel jobs (the lava, the canyon wall). ntex(x, y): x, y in texels (a lattice cell = 8).
const NT = new Float32Array(128 * 128);
(function () {
    const P = 16, lat = new Float32Array(P * P); for (let i = 0; i < P * P; i++) lat[i] = hash2(i % P, (i / P) | 0, 77);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const fx = x / 8, fy = y / 8, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
        const a = lat[(iy % P) * P + (ix % P)], b = lat[(iy % P) * P + ((ix + 1) % P)], c = lat[((iy + 1) % P) * P + (ix % P)], d = lat[((iy + 1) % P) * P + ((ix + 1) % P)];
        NT[y * 128 + x] = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
})();
export function ntex(x, y) {
    const fx = Math.floor(x), fy = Math.floor(y), tx = x - fx, ty = y - fy, x0 = fx & 127, y0 = (fy & 127) << 7, x1 = (x0 + 1) & 127, y1 = (((fy + 1) & 127) << 7);
    const a = NT[y0 + x0], b = NT[y0 + x1], c = NT[y1 + x0], d = NT[y1 + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

// ---------------------------------------------------------------- sprites
export class Sprite {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
}

function fillPoly(sp, pts, c) {
    let y0 = 1e9, y1 = -1e9;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(sp.h - 1, Math.ceil(y1));
    for (let y = y0; y <= y1; y++) {
        const yy = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + ((yy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.round(xs[k])); x < Math.min(sp.w, Math.round(xs[k + 1])); x++) sp.d[y * sp.w + x] = typeof c === 'function' ? c(x, y) : c;
    }
}
function lineSp(sp, x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n); if (x >= 0 && y >= 0 && x < sp.w && y < sp.h) sp.d[y * sp.w + x] = c; }
}
function outline(sp, c) {
    const src = sp.d.slice(), w = sp.w, h = sp.h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!(src[y * w + x] >>> 24)) {
        if ((x > 0 && src[y * w + x - 1] >>> 24) || (x < w - 1 && src[y * w + x + 1] >>> 24) || (y > 0 && src[(y - 1) * w + x] >>> 24) || (y < h - 1 && src[(y + 1) * w + x] >>> 24)) sp.d[y * w + x] = c;
    }
}

// the ramps (dark -> light), one per material
export const RAMPS = {
    rock1: [0x0c0a1a, 0x201a38, 0x383058, 0x56497a, 0x7c6ea0, 0xa89cc8, 0xd8d0ee].map(hex),
    rock2: [0x120504, 0x2c0e0a, 0x501c10, 0x7c3016, 0xb04c1e, 0xe07a30, 0xffb860].map(hex),
    steel: [0x080c18, 0x14203a, 0x23375a, 0x37548a, 0x5882b8, 0x8fbbe0, 0xe0f4ff].map(hex),
    stone3: [0x0a0912, 0x1c1826, 0x332c3c, 0x4e4350, 0x6e6060, 0x947e72, 0xd8b890].map(hex),
    fire: [0x000000, 0x4a0a08, 0xa01c0c, 0xe85a10, 0xffa820, 0xffe060, 0xffffff].map(hex),
};

/** an irregular shaded asteroid: lit from the top-left, a rim light from the nebula, craters */
export function buildRock(seed, rampName, rim) {
    const N = 64, sp = new Sprite(N, N), R = RAMPS[rampName], c0 = N / 2 - 0.5;
    const craters = []; for (let i = 0; i < 5; i++) craters.push([(hash2(i, seed, 1) - 0.5) * 1.3, (hash2(i, seed, 2) - 0.5) * 1.3, 0.12 + hash2(i, seed, 3) * 0.2]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let nx = (x - c0) / 31, ny = (y - c0) / 31;
        const th = Math.atan2(ny, nx), ra = Math.hypot(nx, ny);
        const edge = 0.80 + 0.2 * (fbm(Math.cos(th) * 1.6 + seed * 3.1, Math.sin(th) * 1.6 + seed * 1.7, seed, 3) - 0.4) * 1.6;
        if (ra > edge) continue;
        const q = ra / edge, nz = Math.sqrt(Math.max(0.02, 1 - q * q));
        let bx = nx / edge, by = ny / edge;
        const e = 0.02, hgt = (u, v) => fbm(u * 4 + seed * 9, v * 4 + seed * 5, seed, 3);
        const gx = (hgt(bx + e, by) - hgt(bx - e, by)) / (2 * e) * 0.05, gy = (hgt(bx, by + e) - hgt(bx, by - e)) / (2 * e) * 0.05;
        let cr = 0;
        for (const k of craters) { const d = Math.hypot(bx - k[0], by - k[1]) / k[2]; if (d < 1.15) { cr += d < 0.8 ? -0.5 * (1 - d) : 0.7 * (1 - Math.abs(d - 0.95) * 5); } }
        let nn = [bx * 0.9 - gx * 3, by * 0.9 - gy * 3, nz * 1.0];
        const l = Math.hypot(nn[0], nn[1], nn[2]); nn = [nn[0] / l, nn[1] / l, nn[2] / l];
        let lit = nn[0] * -0.55 + nn[1] * -0.6 + nn[2] * 0.58;
        lit = Math.max(0, lit) * 0.9 + 0.1 + cr * 0.25 * (bx * -0.5 + by * -0.6 > 0 ? -1 : 1) * 0.5;
        lit += (fbm(bx * 7 + seed, by * 7, seed + 4, 3) - 0.5) * 0.28;
        let col = ramp(R, Math.min(1, Math.max(0, lit)), x, y);
        // the rim light: a cool glow on the dark lower-right edge
        const rimv = Math.max(0, q - 0.72) * Math.max(0, bx * 0.55 + by * 0.6) * 3.4;
        if (rim && rimv > 0.12) col = mix(col, rim, Math.min(0.85, rimv * (BAYER[(y & 3) * 4 + (x & 3)] + 0.5)));
        sp.d[y * N + x] = col;
    }
    outline(sp, mul(R[0], 0.8));
    return sp;
}

/** OUR angular fighter, nose toward you: swept wings, a hot red eye, wingtip cannons (64 x 44) */
export function buildFighter(variant = 0) {
    const W = 64, H = 44, sp = new Sprite(W, H);
    const dark = hex(0x1b1530), mid = hex(0x30284e), lite = hex(0x4e4478), hi = hex(0x7a6ca8), red = hex(0xff3a2e), hot = hex(0xffb060), steel = hex(0x8aa0c8);
    const sym = (pts, c) => { fillPoly(sp, pts, c); fillPoly(sp, pts.map((p) => [W - p[0], p[1]]), typeof c === 'function' ? (x, y) => c(W - 1 - x, y) : c); };
    // the wings: two facets each
    sym([[32, 22], [3, 26], [1, 34], [10, 40], [32, 33]], dark);
    sym([[32, 22], [4, 26], [10, 31], [32, 27]], lite);
    sym([[32, 27], [10, 31], [11, 37], [32, 33]], mid);
    sym([[3, 26], [1, 34], [5, 31]], hi);
    // spikes and cannons at the wingtips
    sym([[1, 25], [-1, 20], [4, 23]], steel);
    sym([[6, 33], [10, 33], [10, 41], [6, 41]], dark); sym([[7, 34], [9, 34], [9, 38], [7, 38]], (x, y) => (y < 36 ? hot : red));
    // the fuselage: a pointed prow toward you, a dorsal fin
    fillPoly(sp, [[32, 4], [41, 19], [40, 33], [32, 40], [24, 33], [23, 19]], mid);
    fillPoly(sp, [[32, 4], [41, 19], [32, 22]], lite);
    fillPoly(sp, [[32, 4], [23, 19], [32, 22]], dark);
    fillPoly(sp, [[32, 22], [41, 19], [40, 33], [32, 40]], dark);
    fillPoly(sp, [[32, 22], [23, 19], [24, 33], [32, 40]], hex(0x241d3c));
    lineSp(sp, 32, 6, 32, 38, hi);
    // the eye: a hot slit with a bright core
    fillPoly(sp, [[26, 24], [38, 24], [36, 29], [28, 29]], hex(0x120a10));
    fillPoly(sp, [[27, 25], [37, 25], [35, 28], [29, 28]], red);
    fillPoly(sp, [[30, 25], [34, 25], [33, 27], [31, 27]], hex(0xffe0a0));
    // armour plates on the nose
    lineSp(sp, 27, 14, 32, 10, steel); lineSp(sp, 37, 14, 32, 10, steel);
    outline(sp, hex(0x0a0716));
    return sp;
}

/** a guardian drone: a shaded orb with a gold ring and a bright core (48 x 48) */
export function buildDrone() {
    const N = 48, sp = new Sprite(N, N), R = RAMPS.steel;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const nx = (x - 23.5) / 17, ny = (y - 23.5) / 17, r = Math.hypot(nx, ny);
        if (r > 1) continue;
        const nz = Math.sqrt(1 - r * r), lit = Math.max(0, nx * -0.5 + ny * -0.6 + nz * 0.62) * 0.95 + 0.08;
        const seam = Math.abs(Math.sin(Math.atan2(ny, nx) * 3 + nz * 2)) < 0.07 ? -0.18 : 0;
        sp.d[y * N + x] = ramp(R, lit + seam, x, y);
    }
    // the core
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - 23.5, y - 23.5); if (d < 6.5) sp.d[y * N + x] = d < 3 ? hex(0xffffff) : d < 5 ? hex(0xffe8a0) : hex(0xffb030); }
    // the tilted ring
    for (let a = 0; a < 6.2832; a += 0.012) { const x = Math.round(23.5 + Math.cos(a) * 23), y = Math.round(23.5 + Math.sin(a) * 6.5 + Math.cos(a) * 2.5); const front = Math.sin(a) > -0.2; if (x >= 0 && x < N && y >= 0 && y < N && front) { sp.d[y * N + x] = hex(0xf0b030); if (y + 1 < N) sp.d[(y + 1) * N + x] = hex(0x8a5a14); } }
    outline(sp, hex(0x060a14));
    return sp;
}

/** a ground turret: a dome with a barrel aimed at you (48 x 40) */
export function buildTurret(rampName = 'steel') {
    const W = 48, H = 40, sp = new Sprite(W, H), R = RAMPS[rampName];
    fillPoly(sp, [[3, 39], [8, 30], [40, 30], [45, 39]], (x, y) => ramp(R, 0.25 + (y - 30) / 40, x, y));
    for (let y = 8; y < 32; y++) for (let x = 0; x < W; x++) {
        const nx = (x - 23.5) / 16, ny = (y - 30) / 22; const r = Math.hypot(nx, ny * 1.0);
        if (r > 1 || ny > 0.05) continue; const nz = Math.sqrt(1 - r * r); const lit = Math.max(0, nx * -0.5 + ny * -0.6 + nz * 0.62) + 0.12;
        sp.d[y * W + x] = ramp(R, lit, x, y);
    }
    fillPoly(sp, [[19, 12], [29, 12], [28, 24], [20, 24]], hex(0x0a0f1c)); fillPoly(sp, [[21, 14], [27, 14], [27, 22], [21, 22]], hex(0x2a0a08));
    fillPoly(sp, [[22, 16], [26, 16], [26, 20], [22, 20]], hex(0xff4a28)); sp.d[17 * W + 24] = hex(0xffe0a0);
    outline(sp, hex(0x05080f));
    return sp;
}

// ---------------------------------------------------------------- the Wayfinder
export const ShipAtlas = { ready: false, cols: 9, rows: 3, cw: 96, ch: 72, frames: null, engines: null, failed: false };

/** grade the Wayfinder's baked pixels so it pops: brighter gold trim, lifted highlights, a touch more contrast */
function gradeShip(p) {
    let R = p & 255, G = (p >>> 8) & 255, B = (p >>> 16) & 255; const a = p >>> 24;
    if (!a) return p;
    const gold = R > 110 && R >= G * 1.04 && G > B * 1.22;
    if (gold) { R = R * 1.38 + 28; G = G * 1.32 + 20; B = B * 0.92; }
    else {
        const l = (R + G + B) / 3, k = l > 150 ? 1.18 : l > 80 ? 1.1 : 1.02;
        R = (R - 90) * 1.08 * k + 96; G = (G - 90) * 1.08 * k + 98; B = (B - 90) * 1.08 * k + 108;
        if (B > R + 20 && l > 90) { B += 14; G += 8; }          // the cold highlights glint a little cyan
    }
    return pack(R, G, B, a);
}
function atlasFromImageData(id, W, H) {
    const A = ShipAtlas, u = new Uint32Array(id.data.buffer.slice(0));
    A.frames = []; A.engines = [];
    for (let r = 0; r < A.rows; r++) for (let c = 0; c < A.cols; c++) {
        const sp = new Sprite(A.cw, A.ch);
        let lx = 0, ly = 0, ln = 0, rx = 0, ry = 0, rn = 0;
        for (let y = 0; y < A.ch; y++) for (let x = 0; x < A.cw; x++) {
            const p0 = u[(r * A.ch + y) * W + c * A.cw + x], p = p0 >>> 24 && !(((p0 & 255) > 215) && (((p0 >>> 8) & 255) > 200) && (((p0 >>> 16) & 255) > 150)) ? gradeShip(p0) : p0; sp.d[y * A.cw + x] = p;
            if (!(p >>> 24)) continue;
            const R = p & 255, G = (p >>> 8) & 255, B = (p >>> 16) & 255;
            if (R > 215 && G > 200 && B > 150) { if (x < A.cw / 2) { lx += x; ly += y; ln++; } else { rx += x; ry += y; rn++; } }
        }
        A.frames.push(sp); A.engines.push(ln > 1 && rn > 1 ? { l: [lx / ln, ly / ln], r: [rx / rn, ry / rn] } : null);
    }
    A.ready = true;
}
let _loading = null;
export function loadShipAtlas() {
    if (_loading) return _loading;
    if (typeof document === 'undefined' || typeof Image === 'undefined') return (_loading = Promise.resolve(false));
    _loading = new Promise((res) => {
        const img = new Image();
        img.onload = () => {
            try { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); atlasFromImageData(g.getImageData(0, 0, img.width, img.height), img.width, img.height); res(true); }
            catch (e) { ShipAtlas.failed = true; res(false); }
        };
        img.onerror = () => { ShipAtlas.failed = true; res(false); };
        img.src = new URL('../../../../assets/starvector/ship_atlas.png', import.meta.url).href;
    });
    return _loading;
}
loadShipAtlas();

/** the fallback / test ship if the model's atlas has not loaded: a faithful low-poly of its silhouette (a long dagger hull, two round engine pods with cyan rings) */
let _fallback = null;
export function fallbackShip() {
    if (_fallback) return _fallback;
    const W = 96, H = 72, sp = new Sprite(W, H), gun = hex(0x3a4254), gun2 = hex(0x252b3a), gold = hex(0xd8a030), cy = hex(0x40e0ff);
    fillPoly(sp, [[36, 8], [44, 38], [36, 46], [28, 38]], gun);
    fillPoly(sp, [[36, 8], [44, 38], [36, 30]], hex(0x566078)); fillPoly(sp, [[36, 8], [28, 38], [36, 30]], gun2);
    fillPoly(sp, [[30, 30], [4, 36], [2, 38], [30, 38]], gun2); fillPoly(sp, [[42, 30], [68, 36], [70, 38], [42, 38]], gun2);
    lineSp(sp, 2, 37, 30, 31, gold); lineSp(sp, 70, 37, 42, 31, gold);
    for (const cx of [24, 48]) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, (y - 38) * 1.05); if (d < 9) sp.d[y * W + x] = ramp(RAMPS.steel, 0.3 + (cx - x) / -40 + 0.2, x, y); if (d > 4 && d < 5.4) sp.d[y * W + x] = cy; if (d < 3) sp.d[y * W + x] = hex(0xffffff); } }
    outline(sp, hex(0x050810));
    _fallback = sp; return sp;
}

// ---------------------------------------------------------------- the skies (a 400 x 260 backdrop per act, the horizon at row 124)
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const RK = (typeof globalThis !== 'undefined' && +globalThis.__SV_RK) || 1.5;      // the in-world tube's internal resolution scale (1.5 = 480 x 360); the sharp view is a second copy of the renderer at js/.../renderer.js?k=N (cartridge.js: Sharp)
export const SKY = { W: 400, H: 260, HY: 124, X0: 40, Y0: 20 };
const skyCache = [];
export function buildSky(act) {
    if (skyCache[act]) return skyCache[act];
    const { W, H, HY } = SKY, d = new Uint32Array(W * H);
    const q = (v, n, x, y) => { const f = Math.min(1, Math.max(0, v)) * n, i = Math.floor(f); return (i + (f - i > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0)) / n; };
    const star = (x, y, dens, big) => {
        const h = hash2(x, y, 99);
        if (h > dens) return 0;
        return 0.35 + (h / dens) * 0.65;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let r, g, b;
        const v = Math.min(1, y / HY);
        if (act === 1) {
            r = 3 + 30 * v * v; g = 4 + 12 * v * v; b = 16 + 60 * v;
            const n1 = fbm(x * 0.011, y * 0.013, 5, 5), n2 = fbm(x * 0.017 + 9, y * 0.012 + 3, 8, 4);
            const c1 = Math.max(0, n1 - 0.42) * 2.4, c2 = Math.max(0, n2 - 0.46) * 2.6, band = Math.exp(-Math.pow((y - 62) / 58, 2));
            r += (30 * c1 + 150 * c2) * (0.4 + band); g += (120 * c1 + 24 * c2) * (0.4 + band); b += (150 * c1 + 120 * c2) * (0.4 + band);
            const o = Math.max(0, fbm(x * 0.03, y * 0.02 + 40, 3, 3) - 0.62) * 3; r += 200 * o * v; g += 110 * o * v; b += 30 * o * v;
        } else if (act === 2) {
            const hv = Math.pow(v, 1.6);
            r = 9 + 235 * hv; g = 2 + 92 * hv * hv; b = 4 + 26 * hv * hv * hv;
            const n = fbm(x * 0.009, y * 0.02, 12, 5), cl = Math.max(0, n - 0.46) * 3.2;
            const edge = Math.max(0, fbm(x * 0.009, y * 0.02 + 0.012, 12, 5) - n) * 40;
            const k = 1 - Math.min(0.9, cl * (0.6 + 0.5 * v)); r *= k; g *= k; b *= k;
            r += 120 * edge * v; g += 50 * edge * v;
        } else {
            r = 3 + 14 * v * v; g = 6 + 22 * v * v; b = 18 + 46 * v;
            // the milky band (kept dim) and two curtains of aurora: teal-green below, violet at the fringe, rippling in x
            const dx = x - 200, dy = y - 70, along = (dx * 0.8 + dy * 0.6), across = -dx * 0.6 + dy * 0.8;
            const band = Math.exp(-Math.pow(across / 50, 2)) * (0.4 + 0.6 * fbm(along * 0.02 + 3, across * 0.05, 21, 4));
            r += 30 * band; g += 50 * band; b += 80 * band;
            for (let c = 0; c < 2; c++) {
                const yc = 38 + c * 34 + 26 * Math.sin(x * 0.017 + c * 2.1) + 34 * (fbm(x * 0.006 + c * 7, 3, 61 + c, 3) - 0.5), t = (y - yc) / (13 + c * 5);
                const streak = 0.35 + 0.65 * fbm(x * 0.07 + c * 11, y * 0.006, 63 + c, 3);
                const cur = Math.exp(-t * t) * streak * (t > 0 ? 1 : 0.55 + 0.45 * Math.exp(t * 0.8)) * (c ? 0.7 : 1);
                const up = clamp01((-t + 0.6) * 0.7);
                r += cur * (40 + 150 * up) * 0.9; g += cur * (210 - 60 * up); b += cur * (140 + 90 * up);
            }
            const gl = Math.pow(v, 5); r += 150 * gl; g += 120 * gl; b += 40 * gl;     // a warm gold glow on the horizon
        }
        // quantise to chunky steps (a rich palette, banded and dithered)
        r = q(r / 255, 22, x, y) * 255; g = q(g / 255, 22, x, y) * 255; b = q(b / 255, 22, x, y) * 255;
        d[y * W + x] = pack(r, g, b);
    }
    // stars
    const dens = act === 3 ? 0.02 : act === 1 ? 0.011 : 0.0022;
    for (let y = 0; y < HY + 6; y++) for (let x = 0; x < W; x++) {
        const s = star(x, y, dens);
        if (!s) continue;
        const t = hash2(x, y, 7), col = t < 0.2 ? [255, 214, 160] : t < 0.35 ? [180, 210, 255] : [255, 255, 255];
        const a = s * (act === 2 ? 0.7 : 1), p = pack(col[0] * a, col[1] * a, col[2] * a);
        d[y * W + x] = p;
        if (s > 0.93 && x > 0 && x < W - 1 && y > 0 && y < H - 1) { const dim = pack(col[0] * a * 0.5, col[1] * a * 0.5, col[2] * a * 0.5); d[y * W + x - 1] = dim; d[y * W + x + 1] = dim; d[(y - 1) * W + x] = dim; d[(y + 1) * W + x] = dim; }
    }
    // the great bodies
    const disc = (cx, cy, R, shade) => {
        for (let y = Math.max(0, Math.floor(cy - R - 8)); y < Math.min(H, cy + R + 8); y++) for (let x = Math.max(0, Math.floor(cx - R - 8)); x < Math.min(W, cx + R + 8); x++) {
            const nx = (x - cx) / R, ny = (y - cy) / R, r = Math.hypot(nx, ny), idx = y * W + x;
            if (r > 1) { const g = shade(nx, ny, r, x, y, true); if (g) d[idx] = add(d[idx], g); continue; }
            d[idx] = shade(nx, ny, r, x, y, false);
        }
    };
    if (act === 1) {
        disc(296, 96, 82, (nx, ny, r, x, y, outside) => {
            if (outside) { const g = Math.max(0, 1 - (r - 1) * 9); return g > 0 ? pack(30 * g * g, 150 * g * g, 220 * g * g) : 0; }
            const nz = Math.sqrt(1 - r * r), lit = Math.max(0, nx * -0.62 + ny * -0.35 + nz * 0.7);
            const lat = fbm(x * 0.02, y * 0.11 + 5, 31, 4), sw = fbm(x * 0.05 + lat * 3, y * 0.09, 32, 3);
            const base = [[10, 30, 62], [30, 90, 130], [90, 170, 190], [200, 230, 235]], t = Math.min(0.999, (0.25 + sw * 0.75) * (0.28 + lit * 0.9)) * 3, i = Math.floor(t), f = t - i;
            let c = [0, 1, 2].map((k) => base[i][k] + (base[i + 1][k] - base[i][k]) * f);
            const atm = Math.pow(r, 6) * 1.1; c = [c[0] + 20 * atm * lit, c[1] + 120 * atm * (0.3 + lit), c[2] + 190 * atm * (0.3 + lit)];
            return pack(Math.round(c[0] / 12) * 12, Math.round(c[1] / 12) * 12, Math.round(c[2] / 12) * 12);
        });
        disc(78, 58, 15, (nx, ny, r, x, y, outside) => { if (outside) return 0; const lit = Math.max(0, nx * -0.6 + ny * -0.5 + Math.sqrt(1 - r * r) * 0.6); const c = 40 + 170 * lit; return pack(c, c * 0.92, c * 0.95); });
    } else if (act === 2) {
        disc(112, 66, 60, (nx, ny, r, x, y, outside) => {
            if (outside) { const g = Math.max(0, 1 - (r - 1) * 7); return g > 0 ? pack(160 * g * g, 40 * g * g, 10 * g * g) : 0; }
            const nz = Math.sqrt(1 - r * r), lit = Math.max(0, nx * 0.4 + ny * 0.7 + nz * 0.5) * 0.55 + Math.max(0, nx * -0.5 + ny * -0.4 + nz * 0.6) * 0.5;
            const cr = fbm(x * 0.09, y * 0.09, 41, 4), c2 = Math.max(0, 0.5 - Math.abs(fbm(x * 0.22, y * 0.22, 43, 2) - 0.5)) * 1.1;
            const v = Math.min(1, lit * (0.55 + cr * 0.7) * (1 - c2 * 0.35));
            return pack(Math.round((30 + 200 * v + 40 * (1 - nz) * (ny > 0 ? 1 : 0)) / 14) * 14, Math.round((24 + 150 * v) / 14) * 14, Math.round((24 + 125 * v * (1 - (ny > 0 ? 0.35 : 0))) / 14) * 14);
        });
    } else {
        // (no sun: the stones and the light are the only bright things)
    }
    // CALM: the sky is a backdrop, never the loudest thing on the screen (readability pass): dimmer and a little greyer
    for (let i = 0; i < d.length; i++) { const c = d[i]; let r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255; const l = 0.3 * r + 0.59 * g + 0.11 * b; r = (r + (l - r) * 0.3) * 0.58; g = (g + (l - g) * 0.3) * 0.58; b = (b + (l - b) * 0.3) * 0.58; d[i] = pack(r, g, b); }
    skyCache[act] = d;
    return d;
}
