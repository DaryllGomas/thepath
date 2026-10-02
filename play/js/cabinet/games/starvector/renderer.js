// THE NODE · THE JUNCTION · STARVECTOR (the super-scaler) · THE PICTURE: a software raster at 480 x 360 (4:3, nearest-neighbour up to the screen), drawn from the sim every frame.
// (the runner's own 320 x 240 surface gets a copy of every frame for the in-world tube; the page shows the 480 x 360 one: HI.)
//
// Everything is a sprite or a raster scanline, scaled with nearest-neighbour: the ground streaks to the horizon one scanline at a
// time (depth z per row), the canyon walls are columns, rocks / fighters / drones are pre-drawn sprites scaled out of the distance,
// the stones, pillars and arches are boxes with their side faces in perspective, the gates are drawn per pixel. The Wayfinder is
// a baked sprite atlas of the model (gfx.js). The renderer only READS the sim.
import { PixelFont, SurfaceDraw, PixelSurface, idiv } from '../../sdk/index.js';
import { CabinetState, RoundResult } from '../../sdk/index.js';
import { SV } from './sim.js';
import { StarvectorPalette } from './spec.js';
import * as G from './gfx.js';
const { pack, hex, mix, mul, add, BAYER, RAMPS } = G;
// the internal resolution is the old 320 x 240 times K. The module is loaded twice: plain (K = gfx's RK, 1.5 = 480 x 360: the in-world tube)
// and as renderer.js?k=2 (the sharp copy: the page and the full-screen view). The query picks K; renderer_fx.js follows it.
const KQ = (() => { try { const q = +new URL(import.meta.url).searchParams.get('k'); return q > 0 ? q : 0; } catch (e) { return 0; } })();
export const K = KQ || G.RK;
const { installFx } = await import('./renderer_fx.js' + (KQ ? '?k=' + KQ : ''));
const W = 320 * K, H = 240 * K, F = SV.F * K, ZS = SV.ZS, GY = SV.GY;
/** the floor and the walls are built in chunks (2 x 2 pixels at the old 480 x 360); the chunk grows with K so their cost stays what it was while the sprites, the ship, the glow and the text get K times sharper */
const CH = Math.max(2, Math.round(2 * K / 1.5));
/** the 480 x 360 frame the page shows; HI.fresh is set by every frame the renderer draws (the page clears it once shown) */
export const HI = { surface: null, fresh: false, W, H };
const hiSurface = () => HI.surface || (HI.surface = new PixelSurface(W, H));
/** the sky: baked at the old size (gfx.js), blown up K times once; the window the screen sees is W x H of it */
const SKYK = { W: Math.round(G.SKY.W * K), H: Math.round(G.SKY.H * K), X0: Math.round(G.SKY.X0 * K), Y0: Math.round(G.SKY.Y0 * K) };
const skyCacheK = [];
function skyK(act) {
    if (skyCacheK[act]) return skyCacheK[act];
    const src = G.buildSky(act), o = new Uint32Array(SKYK.W * SKYK.H), sw = G.SKY.W, sh = G.SKY.H;
    for (let y = 0; y < SKYK.H; y++) { const sy = Math.min(sh - 1, Math.floor(y / K)); for (let x = 0; x < SKYK.W; x++) o[y * SKYK.W + x] = src[sy * sw + Math.min(sw - 1, Math.floor(x / K))]; }
    return (skyCacheK[act] = o);
}
/** CALM: the backdrop (floor, walls, ridges, glow) is dimmed and a little greyed so the threats and the ship are the brightest things */
const CALM = [0, 0.6, 0.55, 0.62];
const calm = (r, g, b, k) => { const l = 0.3 * r + 0.59 * g + 0.11 * b; return [(r + (l - r) * 0.3) * k, (g + (l - g) * 0.3) * k, (b + (l - b) * 0.3) * k]; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const nt = G.ntex, GLOW = new Float32Array(64).map((_, i) => { const e = Math.exp(-(i / 8) * 0.55); return e * e; });
const FOG = [0, hex(0x2c2068), hex(0x8a3c1c), hex(0x0c3338)];      // (calmed: the far haze must not out-shine what is coming)
const FOG_FROM = [0, 34, 36, 20];
// per-act palettes: I cold violet/blue, II burning orange/red, III mystic teal + gold
const NEB = [0x05041a, 0x0e0a3a, 0x1c1470, 0x3a22a8, 0x4458dc, 0x62a8f2, 0xb8e4ff].map(hex);
const PLANET_A = [0x0a0a24, 0x1a1a4a, 0x34308a, 0x5a4cc0, 0x8a80e8, 0xc8c0ff, 0xf4f0ff].map(hex), PLANET_B = [0x120a20, 0x2c1646, 0x58306c, 0x8a4a86, 0xc07a98, 0xe8b0b0, 0xfff0e0].map(hex);
const HGLOW = [null, [70, 50, 235, 0.8], [255, 105, 28, 1.0], [60, 225, 190, 0.8]];
const RIDGES = [null,
    [{ par: 0.3, base: 5, amp: 22, freq: 0.06, spike: 2.2, seed: 3, c0: 0x1c1a60, c1: 0x2e2c90, rim: 0x6c7cff }, { par: 0.55, base: 3, amp: 26, freq: 0.09, spike: 2.6, seed: 5, c0: 0x100c44, c1: 0x1c186c, rim: 0x4ab0ff }],
    [{ par: 0.3, base: 14, amp: 30, freq: 0.05, spike: 1.3, seed: 2, c0: 0x6a1c10, c1: 0x401008, rim: 0xff7a28 }, { par: 0.5, base: 8, amp: 32, freq: 0.08, spike: 1.8, seed: 4, c0: 0x340c08, c1: 0x1e0706, rim: 0xe8501c }, { par: 0.8, base: 3, amp: 16, freq: 0.13, spike: 1.2, seed: 6, c0: 0x1a0504, c1: 0x120302, rim: 0xc83c14 }],
    [{ par: 0.3, base: 10, amp: 18, freq: 0.045, spike: 1, step: 5, seed: 7, c0: 0x1a5a58, c1: 0x0e3a3e, rim: 0xd8b868 }, { par: 0.5, base: 6, amp: 12, freq: 0.07, spike: 1, seed: 9, tp: 46, c0: 0x0c3438, c1: 0x082a30, rim: 0xe0b050 }, { par: 0.8, base: 3, amp: 8, freq: 0.12, spike: 1, seed: 11, c0: 0x061a1e, c1: 0x04141a, rim: 0x6ad8c0 }]];
const ROMAN = ['', 'I', 'II', 'III'], NAMES = ['', 'THE FIELD', 'THE VEIN', 'THE STONES'];
const GOLD = hex(0xf0b030), GOLD_HI = hex(0xfff0b0), GOLD_DIM = hex(0x6a4410), WHITE = hex(0xffffff);

// ---------------------------------------------------------------- the art, built once (lazily and in the background)
const ART = { ready: false, rocks: [], rocks2: [], fighter: null, drone: null, turret: null, turret2: null };
function artStep(i) {
    switch (i) {
        case 0: ART.rocks = [0, 1, 2, 3].map((s) => G.buildRock(s + 1, 'rock1', hex(0x2ec8d8))); return true;
        case 1: ART.rocks2 = [0, 1, 2, 3].map((s) => G.buildRock(s + 11, 'rock2', hex(0xff7a30))); return true;
        case 2: ART.fighter = G.buildFighter(); ART.drone = G.buildDrone(); ART.turret = G.buildTurret('steel'); ART.turret2 = G.buildTurret('rock2'); return true;
        case 3: G.buildSky(1); return true; case 4: G.buildSky(2); return true; case 5: G.buildSky(3); return true;
    }
    return false;
}
let artNext = 0;
function warmAll() { while (artStep(artNext)) artNext++; ART.ready = true; }
export function warmArt() { if (ART.ready) return; warmAll(); }
if (typeof setTimeout !== 'undefined' && typeof document !== 'undefined') {
    const tick = () => { if (artNext < 6 && !ART.ready) { if (artStep(artNext)) artNext++; setTimeout(tick, 16); } else if (artNext >= 6) ART.ready = true; };
    setTimeout(tick, 400);
}

export class StarvectorRenderer {
    constructor() {
        warmArt();
        this.sky = [null, skyK(1), skyK(2), skyK(3)];
        this.trail = []; this.colIdx = new Int32Array(1024);
        this.stars = []; for (let i = 0; i < 110; i++) this.stars.push([(G.hash2(i, 1, 5) - 0.5) * 2, (G.hash2(i, 2, 5) - 0.5) * 2, G.hash2(i, 3, 5) * 150]);
        this.embers = []; for (let i = 0; i < 46; i++) this.embers.push([(G.hash2(i, 1, 8) - 0.5) * 2, G.hash2(i, 2, 8), G.hash2(i, 3, 8) * 120, 0.5 + G.hash2(i, 4, 8)]);
        this.t = 0;
    }

    // ---------------------------------------------------------------- entry
    draw(sim, surface, t) {
        const hi = hiSurface(); this.sim = sim; this.s = hi; this.u = hi._u32; this.t = t;
        const act = sim.act, S = sim.ship;
        // the shake is half what it was; only a boss's death keeps the big one
        const big = sim.boss && sim.boss.state === 'dying', sh = Math.min(2, sim.shake) * (big ? 1 : 0.5), ox = sh > 0 ? Math.round(Math.sin(t * 90) * sh * 3 * K) : 0, oy = sh > 0 ? Math.round(Math.cos(t * 77) * sh * 3 * K) : 0;
        this.cx = SV.CX * K + ox; this.cy = SV.CY * K + oy; this.camX = sim.camX; this.camY = sim.camY; this.dist = sim.dist; this.act = act;
        this.fog = FOG[act]; this.fogFrom = FOG_FROM[act];
        this._sky(sim); this._stars(sim); this._ground(sim);
        if (act === 2) { this._walls(sim); this._embers(sim); }
        this.fxSpeed(sim);
        // everything with a depth, far to near (the ship sits at ZS)
        const L = this.list || (this.list = []); L.length = 0;
        for (const o of sim.objs) L.push([o.z, 0, o]);
        for (const s of sim.shots) L.push([s.z, 1, s]);
        for (const s of sim.eshots) L.push([s.z, 2, s]);
        for (const p of sim.parts) L.push([p.z, 3, p]);
                for (const h of sim.hz) L.push([ZS + 1.2, 7, h]);
        if (sim.light) L.push([sim.light.z, 5, sim.light]);
        L.push([ZS, 4, S]);
        L.sort((a, b) => b[0] - a[0]);
        this._shadow(sim);
        for (const e of L) {
            switch (e[1]) {
                case 0: this._obj(e[2]); break;
                case 1: this._shot(e[2]); break;
                case 2: this._eshot(e[2]); break;
                case 3: this._part(e[2]); break;
                case 4: this._ship(sim); break;
                case 5: this._light(e[2], sim); break;
                case 7: this.fxHazard(e[2]); break;
            }
        }
        this._reticle(sim); this.fxPops(sim); this.fxNear(sim);
        if (sim.flash > 0.01) this._flash(sim.flash);
        this._overlays(sim, hi);
        this.present(surface);
    }
    /** the 480 x 360 frame -> a copy on the runner's 320 x 240 surface (the in-world tube and the freeze read that one) */
    present(surface) {
        const hu = this.u, o = surface._u32, w = surface.width, h = surface.height;
        for (let y = 0; y < h; y++) { const so = Math.min(H - 1, Math.floor((y + 0.5) * K)) * W, d = y * w; for (let x = 0; x < w; x++) o[d + x] = hu[so + Math.min(W - 1, Math.floor((x + 0.5) * K))]; }
        HI.fresh = true;
    }

    // ---------------------------------------------------------------- pixels
    sx(x, z) { return this.cx + ((x - this.camX) * F) / z; }
    sy(y, z) { return this.cy - ((y - this.camY) * F) / z; }
    fogF(z) { return smooth(this.fogFrom, SV.ZSP + 10, z) * 0.92; }
    fogPx(c, z, x, y) {
        const f = this.fogF(z); if (f < 0.03) return c;
        const fq = Math.floor(f * 6 + BAYER[(y & 3) * 4 + (x & 3)]) / 6;
        return mix(c, this.fog, fq);
    }
    addPx(x, y, r, g, b) {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = y * W + x, c = this.u[i];
        this.u[i] = pack(Math.min(255, (c & 255) + r), Math.min(255, ((c >>> 8) & 255) + g), Math.min(255, ((c >>> 16) & 255) + b));
    }
    glow(cx, cy, rad, r, g, b, k = 1) {
        const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad)), y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
        const u = this.u, inv = 1 / rad, r2 = rad * rad;
        for (let y = y0; y <= y1; y++) {
            const dy = y - cy, dy2 = dy * dy; if (dy2 >= r2) continue;
            const xs = Math.sqrt(r2 - dy2), xa = Math.max(x0, Math.ceil(cx - xs)), xb = Math.min(x1, Math.floor(cx + xs)), br = (y & 3) * 4;
            for (let x = xa; x <= xb; x++) {
                const dx = x - cx, d = Math.sqrt(dx * dx + dy2) * inv;
                let a = (1 - d); a = a * a * k; a = Math.floor(a * 5 + BAYER[br + (x & 3)]) / 5; if (a <= 0) continue;
                const i = y * W + x, c = u[i];
                u[i] = pack(Math.min(255, (c & 255) + r * a), Math.min(255, ((c >>> 8) & 255) + g * a), Math.min(255, ((c >>> 16) & 255) + b * a));
            }
        }
    }
    disc(cx, cy, rad, c) {
        const r = Math.max(0.6, rad), x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), u = this.u;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) u[y * W + x] = c;
    }
    rect(x0, y0, x1, y1, c) {
        x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(W, Math.round(x1)); y1 = Math.min(H, Math.round(y1));
        const u = this.u; for (let y = y0; y < y1; y++) u.fill(c, y * W + x0, y * W + Math.max(x0, x1));
    }

    /** a sprite scaled by nearest neighbour; (cxs, cys) = its centre; f = fog 0..1; hit = flash 0..1 */
    spr(sp, cxs, cys, scale, f = 0, hit = 0, flipX = false, flipY = false) {
        const dw = Math.max(1, Math.round(sp.w * scale)), dh = Math.max(1, Math.round(sp.h * scale));
        const x0 = Math.round(cxs - dw / 2), y0 = Math.round(cys - dh / 2);
        const xa = Math.max(0, x0), xb = Math.min(W, x0 + dw), ya = Math.max(0, y0), yb = Math.min(H, y0 + dh);
        if (xa >= xb || ya >= yb) return;
        const u = this.u, d = sp.d, fog = this.fog;
        const fr = fog & 255, fg = (fog >>> 8) & 255, fb = (fog >>> 16) & 255, fi = Math.round(f * 256), hi = Math.round(hit * 256);
        for (let y = ya; y < yb; y++) {
            let sy = Math.floor(((y - y0) * sp.h) / dh); if (flipY) sy = sp.h - 1 - sy;
            const row = sy * sp.w, o = y * W;
            for (let x = xa; x < xb; x++) {
                let sxp = Math.floor(((x - x0) * sp.w) / dw); if (flipX) sxp = sp.w - 1 - sxp;
                let c = d[row + sxp];
                if (!(c >>> 24)) continue;
                if (fi > 4) { const ff = fi + (BAYER[(y & 3) * 4 + (x & 3)] - 0.5) * 70; const k = ff < 0 ? 0 : ff > 256 ? 256 : ff; c = pack((c & 255) + ((fr - (c & 255)) * k >> 8), ((c >>> 8) & 255) + ((fg - ((c >>> 8) & 255)) * k >> 8), ((c >>> 16) & 255) + ((fb - ((c >>> 16) & 255)) * k >> 8)); }
                if (hi) c = pack((c & 255) + ((255 - (c & 255)) * hi >> 8), ((c >>> 8) & 255) + ((255 - ((c >>> 8) & 255)) * hi >> 8), ((c >>> 16) & 255) + ((255 - ((c >>> 16) & 255)) * hi >> 8));
                u[o + x] = c;
            }
        }
    }

    // ---------------------------------------------------------------- the backdrop
    _sky(sim) {
        const sk = this.sky[this.act], u = this.u, SK = SKYK;
        const ox = clamp(SK.X0 - Math.round(this.camX * 1.6 * K) + (this.cx - SV.CX * K), 0, SK.W - W), oy = clamp(SK.Y0 - Math.round(this.camY * 2.2 * K) + (this.cy - SV.CY * K), 0, SK.H - H);
        for (let y = 0; y < H; y++) u.set(sk.subarray((y + oy) * SK.W + ox, (y + oy) * SK.W + ox + W), y * W);
    }
    _stars(sim) {
        const V = Math.max(10, sim.V), act = this.act; if (act === 2) { this._backdrop(sim); return; }
        const dim = act === 1 ? 0.7 : 0.8;
        for (const s of this.stars) {
            let z = ((s[2] - this.dist * 0.5) % 150 + 150) % 150 + 4; const x = (s[0] * 90), y = (s[1] * 60) + 6;
            const px = Math.round(this.cx + ((x - this.camX) * F) / z), py = Math.round(this.cy - ((y - this.camY * 0.5) * F) / z - 16 * K);
            if (py < 0 || py >= this.cy + 4 * K || px < 0 || px >= W) continue;
            const b = clamp(1.05 - z / 150, 0.18, 1) * dim, c = pack(150 + 105 * b, 160 + 95 * b, 200 + 55 * b);
            this.u[py * W + px] = c; if (z < 70 && px + 1 < W) this.u[py * W + px + 1] = c;
            if (z < 40) { const px2 = Math.round(this.cx + ((x - this.camX) * F) / (z + V * 0.035)), py2 = Math.round(this.cy - ((y - this.camY * 0.5) * F) / (z + V * 0.035) - 16 * K); const n = Math.max(Math.abs(px - px2), Math.abs(py - py2)); for (let i = 1; i < n && i < 12; i++) { const xx = Math.round(px + ((px2 - px) * i) / n), yy = Math.round(py + ((py2 - py) * i) / n); if (xx >= 0 && yy >= 0 && xx < W && yy < H) this.u[yy * W + xx] = mix(this.u[yy * W + xx], c, 1 - i / n); } }
        }
        this._backdrop(sim);
    }

    /** the horizon glow and the parallax ridges (distant spires / volcanoes / mesas and T-pillars): they drift at different rates with camX and dist */
    _backdrop(sim) {
        const act = this.act, u = this.u, cy = this.cy, HG = HGLOW[act];
        const HR = 24 * K;
        for (let y = Math.max(0, cy - HR); y <= cy; y++) {
            const k = Math.pow(1 - (cy - y) / HR, 2.2) * HG[3] * 0.55, o = y * W, r = HG[0] * k, g = HG[1] * k, b = HG[2] * k;
            for (let x = 0; x < W; x++) { const c = u[o + x]; u[o + x] = pack((c & 255) + r, ((c >>> 8) & 255) + g, ((c >>> 16) & 255) + b); }
        }
        for (const L of RIDGES[act]) this._ridge(L);
    }
    _ridge(L) {
        const u = this.u, cy = this.cy, off = -this.camX * L.par * 9 + this.dist * (L.drift || 0) + L.seed * 31, CR = 0.62;
        const c0 = L.cc0 || (L.cc0 = mul(hex(L.c0), CR)), c1 = L.cc1 || (L.cc1 = mul(hex(L.c1), CR)), rim = L.crim || (L.crim = mul(hex(L.rim), 0.7)), mid = mix(c0, c1, 0.5);
        for (let x = 0; x < W; x += 2) {
            const xl = x / K, q = (xl + off) * L.freq, n = nt(q, L.seed * 13), n2 = nt(q * 3.3 + 40, L.seed * 7 + 5);
            let h = L.base + L.amp * (0.72 * Math.pow(n, L.spike) * (L.spike > 1 ? 1.9 : 1) + 0.28 * n2);
            if (L.step) h = Math.round(h / L.step) * L.step;
            let barY0 = 0, barY1 = 0;
            if (L.tp) {
                const wx = xl + off, cell = Math.floor(wx / L.tp), rel = wx - cell * L.tp - L.tp / 2, hh = G.hash2(cell, L.seed, 5);
                if (hh > 0.45) { const ph = 12 + hh * 20; if (Math.abs(rel) < 1.7) h = Math.max(h, ph); else if (Math.abs(rel) < 5.5) { barY0 = Math.round(cy - ph * K); barY1 = barY0 + Math.round(3 * K); } }
            }
            h = Math.round(Math.min(60, h) * K);
            for (let j = 0; j < h; j++) {
                const y = cy - 1 - j; if (y < 0) break;
                const f = j / h, c = j >= h - 1 ? rim : f > 0.66 ? c1 : f > 0.3 ? mid : c0, o = y * W + x; u[o] = c; u[o + 1] = c;
            }
            for (let y = barY0; y < barY1; y++) { if (y < 0) continue; const o = y * W + x; u[o] = y === barY0 ? rim : c1; u[o + 1] = u[o]; }
        }
    }
    /** huge things sweeping past at the sides, built here from sim.dist (never in the sim, never in the way): they fill half the screen as they go by */
    _setpieces(sim) {
        const act = this.act, dist = this.dist, C = [0, 250, 210, 170][act], n0 = Math.floor((dist + 7) / C - 0.75), n1 = Math.floor((dist + 235) / C);
        for (let n = n0; n <= n1; n++) for (let side = -1; side <= 1; side += 2) {
            if (G.hash2(n, side + 5, 50 + act) > (act === 3 ? 0.62 : 0.55)) continue;
            const z = n * C + G.hash2(n, side, 71) * C * 0.7 - dist; if (z < 7 || z > 235) continue;
            const kind = Math.floor(G.hash2(n, side, 72) * 3), sz = 0.7 + G.hash2(n, side, 73) * 0.6;
            if (act === 1) this._piece1(side, z, kind, sz, n); else if (act === 2) this._piece2(side, z, kind, sz, n); else this._piece3(side, z, sz);
        }
    }
    _ball(cx, cy, r, pal, lx, ly, fogk, band) {
        const u = this.u, fog = this.fog, y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), NS = 10;
        for (let y = y0; y <= y1; y++) {
            const dy = (y + 0.5 - cy) / r, hw = Math.sqrt(Math.max(0, 1 - dy * dy)) * r; if (hw < 1) continue;
            const bd = band ? Math.floor((dy * 5 + band) * 2.2) & 1 : 0;
            for (let s = 0; s < NS; s++) {
                const xa = Math.max(0, Math.round(cx - hw + (hw * 2 * s) / NS)), xb = Math.min(W, Math.round(cx - hw + (hw * 2 * (s + 1)) / NS)); if (xb <= xa) continue;
                const nx = (-hw + (hw * 2 * (s + 0.5)) / NS) / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - dy * dy));
                let lit = clamp(0.12 + 0.95 * (nx * lx + dy * ly + nz * 0.55), 0, 1) + (bd ? 0.07 : -0.03);
                const c = mul(G.ramp(pal, lit, s, y), 0.66);
                u.fill(fogk > 0.02 ? mix(c, fog, fogk) : c, y * W + xa, y * W + xb);
            }
        }
    }
    _piece1(side, z, kind, sz, n) {
        const s = F / z, fogk = this.fogF(z) * 0.7;
        if (kind !== 1) {
            // a giant ringed planet sliding by (its limb fills the side of the screen)
            const R = 17 * sz, cx = this.sx(side * (30 + 8 * sz), z), cy = this.sy(10 + 5 * sz, z), r = R * s;
            if (cx + r < -60 || cx - r > W + 60) return;
            const ringed = kind === 0, tilt = 0.26, rr = r * 1.8, pal = ringed ? PLANET_A : PLANET_B;
            const drawRing = (front) => { const steps = Math.min(400, Math.max(60, Math.round(rr * 2.2))); for (let i = 0; i < steps; i++) { const a = (i / steps) * 6.2832, sa = Math.sin(a); if ((sa > 0) !== front) continue; for (let w = 0; w < 2; w++) { const px = cx + Math.cos(a) * (rr + w * r * 0.14), py = cy + sa * (rr + w * r * 0.14) * tilt; if (px < 0 || py < 0 || px >= W || py >= H) continue; this.rect(px, py, px + 2, py + 2, mix(w ? hex(0x6a5aa0) : hex(0xb8a8e0), this.fog, fogk)); } } };
            if (ringed) drawRing(false);
            this._ball(cx, cy, r, pal, -side * 0.55, -0.45, fogk, ringed ? 1 : 3);
            if (ringed) drawRing(true);
        } else {
            // a colossal derelict hull, dark, with a few lit ports and a dead engine's cold glow
            const wu = 40 * sz, x0 = side * (16 + 12 * sz), cxs = this.sx(x0, z), cys = this.sy(5 + 3 * sz, z), hw = wu * s * 0.5, hh = 4.2 * sz * s;
            if (cxs + hw < -20 || cxs - hw > W + 20) return;
            const P = (a, b) => [cxs + a * hw, cys + b * hh], fk = fogk;
            const dk = (c) => mix(c, this.fog, fk);
            this.poly([P(-1, 0.1), P(-0.72, -0.8), P(0.82, -0.7), P(1, 0.2), P(0.72, 0.9), P(-0.9, 0.8)], dk(hex(0x3a4668)), dk(hex(0x10162a)));
            this.poly([P(-0.72, -0.8), P(0.82, -0.7), P(0.6, -0.4), P(-0.6, -0.5)], dk(hex(0x6a78a0)), dk(hex(0x3a4668)));
            for (const q of [-0.5, 0.0, 0.45]) this.poly([P(q, -0.75), P(q + 0.05, -2.2), P(q + 0.1, -0.7)], dk(hex(0x2a3250)), dk(hex(0x10162a)));
            this.poly([P(-1, 0.1), P(-1.25, 0.35), P(-0.9, 0.8)], dk(hex(0x232a46)), dk(hex(0x0c1020)));
            for (let i = 0; i < 14; i++) { const px = P(-0.8 + (i % 7) * 0.25, -0.15 + Math.floor(i / 7) * 0.45); if (G.hash2(i, n, 9) > 0.45) this.rect(px[0], px[1], px[0] + Math.max(1, hw * 0.06), px[1] + Math.max(1, hh * 0.1), dk(hex(0xffc860))); }
            for (let i = 0; i < 3; i++) this.glow(P(0.8, -0.1 + i * 0.3)[0], P(0.8, -0.1 + i * 0.3)[1], hh * 0.5, 40, 120, 200, 0.4 * (1 - fk));
        }
    }
    _piece2(side, z, kind, sz, n) {
        if (z < 9) return;
        if (kind !== 2) {
            // a colossal fire-lit obelisk beside the canyon
            const x = side * (10.6 + 2 * sz), w = 1.6 + 1.3 * sz, top = -GY + 11 + 7 * sz;
            this.box(x - w, x + w, -GY, top, z - 2.2, z + 2.2, PILLAR_STYLE);
            this.glow(this.sx(x, z), this.sy(-GY, z), 22 * F / z, 255, 110, 30, 0.35);
        } else {
            // a huge arch sweeping overhead
            const top = 9 + 2 * sz, t0 = top - 2.8, hw = 14.5;
            this.box(-hw - 2.2, -hw, -GY, top, z - 2.4, z + 2.4, PILLAR_STYLE); this.box(hw, hw + 2.2, -GY, top, z - 2.4, z + 2.4, PILLAR_STYLE);
            this.box(-hw - 2.2, hw + 2.2, t0, top, z - 2.4, z + 2.4, ARCH_STYLE);
        }
    }
    _piece3(side, z, sz) {
        if (z < 9) return;
        // a colossal carved T-pillar (the sim's stones, but ten times the size)
        this._stone({ x: side * (13.5 + 4 * sz), z, dz: 2.6 * sz, w: 3.0 * sz, top: 15 + 5 * sz, cw: 7.4 * sz, great: true });
    }

    _embers(sim) {
        const t = this.t, dist = this.dist;
        for (let i = 0; i < 80; i++) {
            const h1 = G.hash2(i, 1, 8), h2 = G.hash2(i, 2, 8), h3 = G.hash2(i, 3, 8), h4 = 0.5 + G.hash2(i, 4, 8);
            const z = ((h3 * 120 - dist * 0.7) % 120 + 120) % 120 + 3, x = (h1 * 2 - 1) * (i & 1 ? 12 : 8), y = -GY + ((h2 * 9 + t * h4 * 1.7) % 9);
            const px = Math.round(this.sx(x, z)), py = Math.round(this.sy(y, z)); if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const b = clamp(1 - z / 120, 0.2, 1) * 0.6, fl = 0.7 + 0.3 * Math.sin(t * 9 + i); this.addPx(px, py, 255 * b * fl, 150 * b * fl, 40 * b * fl);
            if (z < 55) { this.addPx(px, py - 1, 200 * b, 90 * b, 20 * b); this.addPx(px + 1, py, 160 * b, 70 * b, 10 * b); }
            if (z < 22) { this.addPx(px + 1, py - 1, 255 * b, 160 * b, 40 * b); this.addPx(px, py + 1, 120 * b, 50 * b, 10 * b); this.glow(px, py, 3.5 * K, 255, 120, 30, 0.2); }
        }
        // heat shimmer: the air over the lava wobbles
        const u = this.u, cy = this.cy;
        for (let y = Math.max(0, cy - 8 * K); y < Math.min(H, cy + 70 * K); y++) {
            const a = (y - cy + 8 * K) / (78 * K), sh = Math.round(Math.sin(y * 0.6 / K + t * 7) * (0.7 + 1.1 * (1 - a)) * K * (y > cy + 40 * K ? 0.5 : 1)), o = y * W;
            if (sh > 0) u.copyWithin(o + sh, o, o + W - sh); else if (sh < 0) u.copyWithin(o, o - sh, o + W + sh);
        }
    }

    _ground(sim) {
        // the floor, one scanline at a time: z from the row, the world position from the column. Two pixels wide (a chunky
        // floor, half the work), the fog dithered in steps; every number it needs per row is worked out once per row.
        const act = this.act, u = this.u, cx = this.cx, cy = this.cy, camH = Math.max(0.9, GY + this.camY), dist = this.dist, t = this.t, camX = this.camX, fog = this.fog;
        const fr = fog & 255, fg = (fog >>> 8) & 255, fb = (fog >>> 16) & 255, sparkle = Math.floor(t * 3) & 1;
        const fq = this._fq || (this._fq = new Float32Array(4)), CK = CALM[act];
        for (let y = Math.max(0, cy + 1); y < H; y++) {
            const hr = y - cy, hrl = hr / K, o = y * W, yd = hrl > 26 ? Math.floor(y / CH) : y;       // (the row the dither sees: the rows of a chunk share one)
            if (hrl > 26 && (y % CH)) { u.copyWithin(o, o - W, o); continue; }          // the near floor is built in chunks (the other rows are the row above)
            const z = (F * camH) / hr, zw = z + dist, ff = this.fogF(z), k = z / F, br = (yd & 3) * 4;
            for (let i = 0; i < 4; i++) fq[i] = Math.floor(ff * 6 + BAYER[br + i]) / 6;
            const XS = hrl < 46 ? Math.round(3 * K / 1.5) : CH, kx = k * XS;                 // far rows: each pixel spans a lot of floor, so four-pixel cells are enough
            const ca = (f) => { const v = (3.5 - f * kx) * 0.4; return v < 0 ? 0 : v > 1 ? 1 : v; };       // band-limit the noise: a texture finer than the pixels fades to its mean (no shimmering far away)
            if (act === 1) {
                // THE NEBULA SEA: layered coloured cloud bands rolling toward you, light streaks rushing out of the vanishing point
                const hg = Math.max(0, 1 - hrl / 34), z1 = zw * 0.7, z2 = zw * 1.5 + 30, zst = zw * 0.2, c1 = ca(1.0), c2 = ca(3.1), cs = ca(4.2), pulse = 0.65 + 0.35 * Math.sin(zw * 0.05 - t * 1.6);
                for (let x = 0; x < W; x += XS) {
                    const ci = (x / XS) | 0;
                    const wx = camX + (x + XS * 0.5 - cx) * k;
                    const a = 0.5 + (nt(wx * 1.0 + 40, z1) - 0.5) * c1, b = 0.5 + (nt(wx * 3.1 + 7, z2) - 0.5) * c2;
                    const v = clamp((a * 0.64 + b * 0.36 - 0.22) * 1.7, 0, 1) * (0.78 + 0.22 * pulse);
                    let c = G.ramp(NEB, v * 0.78 + hg * 0.28, ci, yd), r = c & 255, g = (c >>> 8) & 255, bl = (c >>> 16) & 255;
                    const mg = (b - 0.56) * 3.2 * c2; if (mg > 0) { r += 85 * mg; g -= 22 * mg; bl += 20 * mg; }       // magenta veins in the gas
                    const st = 0.5 + (nt(wx * 4.2 + 5, zst) - 0.5) * cs;
                    if (st > 0.7) { const q = (st - 0.7) * 3.4, w = st > 0.84 ? 1 : 0; r += (60 + 140 * w) * q; g += (140 - 70 * w) * q; bl += 235 * q; }
                    { const l_ = 0.3 * r + 0.59 * g + 0.11 * bl; r = (r + (l_ - r) * 0.3) * CK; g = (g + (l_ - g) * 0.3) * CK; bl = (bl + (l_ - bl) * 0.3) * CK; } const q = fq[ci & 3];
                    c = pack(r + (fr - r) * q, g + (fg - g) * q, bl + (fb - bl) * q); for (let j = 0; j < XS; j++) u[o + x + j] = c;
                }
            } else if (act === 2) {
                const cf = 1.8 * Math.sin(zw * 0.045) + 0.9 * Math.sin(zw * 0.11), wf = 0.95 + 0.4 * Math.sin(zw * 0.07 + 1), band = (Math.floor(zw / 7) & 1) ? 1 : 0.86;
                const zl = zw * 0.8 - t * 2.4, zl2 = zw * 2 - t * 3, zr = zw * 13.6, zr2 = zw * 40, zr3 = zw * 90, z3 = zw * 1.5, z4 = zw * 3.1 + 7, zp = zw * 0.9, pulse = 0.72 + 0.28 * Math.sin(t * 3 + zw * 0.06), cl1 = ca(10.4), cl2 = ca(24), cr1 = ca(13.6), cf1 = ca(3.4), cf2 = ca(6.4);
                for (let x = 0; x < W; x += XS) {
                    const ci = (x / XS) | 0;
                    const wx = camX + (x + XS * 0.5 - cx) * k, d = Math.abs(wx - cf) - wf;
                    let r, g, b;
                    if (d < 0) {
                        const n = 0.5 + (nt(wx * 10.4, zl * 8) - 0.5) * cl1, n2 = 0.5 + (nt(wx * 24 + 70, zl2 * 8) - 0.5) * cl2, v = 0.38 + 0.5 * n + 0.18 * n2 + (d < -wf * 0.5 ? 0.12 : -0.08 * (1 + d / wf));
                        const c = G.ramp(RAMPS.fire, v * 0.95, ci, yd); r = c & 255; g = (c >>> 8) & 255; b = (c >>> 16) & 255; r *= 0.72; g *= 0.72; b *= 0.72;      // (the lava river itself is dimmed again: it is the loudest thing on the floor)
                    } else {
                        const n = 0.5 + (nt(wx * 13.6, zr) - 0.5) * cr1, glow = GLOW[Math.min(63, (d * 8) | 0)], pl = n;
                        r = (30 + n * 52) * band * (0.72 + 0.5 * pl) + 190 * glow * 0.75; g = (14 + n * 20) * band * (0.72 + 0.5 * pl) + 66 * glow * 0.6; b = (12 + n * 14) * band + 10 * glow * 0.3;
                        if (n > 0.8 && nt(wx * 90, zr3) > 0.8) { r += 70; g += 24; }
                        // glowing fissure BRANCHES: cracks in the crust, lit from below
                        const l1 = Math.abs(nt(wx * 3.4 + 11, z3) - 0.5), l2 = Math.abs(nt(wx * 6.4 + 50, z4) - 0.5);
                        let fis = l1 < 0.045 ? (1 - l1 / 0.045) * cf1 : 0; if (l2 < 0.03) fis = Math.max(fis, 0.85 * (1 - l2 / 0.03) * cf2);
                        const halo = fis > 0 ? 0.5 : Math.max(0, 0.15 - Math.min(l1, l2 * 1.4)) * 3.2;
                        r += 255 * fis * pulse + 80 * halo; g += 105 * fis * pulse + 22 * halo; b += 14 * fis;
                    }
                    { const l_ = 0.3 * r + 0.59 * g + 0.11 * b; r = (r + (l_ - r) * 0.3) * CK; g = (g + (l_ - g) * 0.3) * CK; b = (b + (l_ - b) * 0.3) * CK; } const q = fq[ci & 3];
                    const c = pack(r + (fr - r) * q, g + (fg - g) * q, b + (fb - b) * q); for (let j = 0; j < XS; j++) u[o + x + j] = c;
                }
            } else {
                // THE STONES: a dark teal floor, glowing LEY LINES running out to the vanishing point (the gate), a pulse travelling along them
                const cv = Math.floor(zw / 6), alt = (cv & 1) ? 1 : 0.8, spark = z > 28, zc = Math.floor(zw * 3), pz = 0.55 + 0.45 * Math.sin(zw * 0.28 - t * 4), fzc = zw / 18 - Math.floor(zw / 18), cross = fzc < 0.022 || fzc > 0.985, z1 = zw * 1.1, cn = ca(2.0), hw1 = Math.max(0.11, kx * 0.8), hw2 = Math.max(0.38, kx * 1.6), amp = Math.min(1, 0.11 / hw1 * 2.2), amp2 = Math.min(1, 0.38 / hw2 * 1.6);
                let lastC = -99999, hh = 0;
                for (let x = 0; x < W; x += XS) {
                    const ci = (x / XS) | 0;
                    const wx = camX + (x + XS * 0.5 - cx) * k, w4 = wx / 3.2, lx = w4 - Math.floor(w4), d = (lx < 0.5 ? lx : 1 - lx) * 3.2, nn = 0.5 + (nt(wx * 2.0 + 9, z1) - 0.5) * cn;
                    let r = (4 + 12 * nn) * alt, g = (16 + 36 * nn) * alt, b = (22 + 38 * nn) * alt;
                    if (d < hw1) { const kk = (1 - d / hw1) * amp; r += 215 * pz * kk; g += 175 * pz * kk; b += 70 * pz * kk; }
                    if (d < hw2) { const kk = (1 - d / hw2) * amp2; r += 12 * kk; g += 120 * kk * pz; b += 105 * kk * pz; }
                    if (cross) { r += 90; g += 150; b += 120; }
                    if (spark) { const cc = Math.floor(wx * 3); if (cc !== lastC) { lastC = cc; hh = G.hash2(cc, zc, 11 + sparkle); } if (hh > 0.997) { r += 120; g += 140; b += 140; } }
                    { const l_ = 0.3 * r + 0.59 * g + 0.11 * b; r = (r + (l_ - r) * 0.3) * CK; g = (g + (l_ - g) * 0.3) * CK; b = (b + (l_ - b) * 0.3) * CK; } const q = fq[ci & 3];
                    const c = pack(r + (fr - r) * q, g + (fg - g) * q, b + (fb - b) * q); for (let j = 0; j < XS; j++) u[o + x + j] = c;
                }
            }
        }
        if (!(sim.boss && sim.boss.state !== 'intro')) this._setpieces(sim);       // (the colossal passers-by sit out the boss fight)
    }

    _walls(sim) {
        const u = this.u, cx = this.cx, cy = this.cy, Wc = 12.5, HW = 20, dist = this.dist, t = this.t, camX = this.camX, camY = this.camY;
        const fog = this.fog, fr = fog & 255, fg = (fog >>> 8) & 255, fb = (fog >>> 16) & 255, fq = this._fq || (this._fq = new Float32Array(4));
        for (let x = 0; x < W; x += CH) {                                       // a chunk of columns at a time
            const off = x + CH / 2 - cx; if (Math.abs(off) < 1.5 * K) continue;
            let z = off > 0 ? (F * (Wc - camX)) / off : (F * (Wc + camX)) / -off;
            if (z > 190) continue; z = Math.max(z, 1.6);
            const top = cy - ((HW - camY) * F) / z, bot = cy + ((GY + camY) * F) / z;
            const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bot)), span = Math.max(1, bot - top), inv = 1 / span;
            const zw = z + dist, ff = this.fogF(z), cold = Math.floor(zw / 3.5), side = off > 0 ? 1 : 0, sx0 = zw * 7.2 + side * 200, sx1 = zw * 24 + side * 90, sx2 = zw * 3.3 + side * 47;
            const strata = nt(zw * 1.8 + side * 100, 24) * 6, flick = 0.75 + 0.25 * Math.sin(t * 5 + cold * 1.3);
            for (let y = y0 - (y0 % CH); y < y1; y += CH) {                         // and a chunk of rows: the wall is chunky
                const wy = (y + CH / 2 - top) * inv, hy = wy * HW;
                const nn = nt(sx0, hy * 8.8), nm = nt(sx1, hy * 20), nk = nt(sx2, hy * 5 + 40);
                const stp = (Math.floor(hy * 1.05 + strata * 0.35) & 1) ? 0.72 : 1;       // hard strata: layered bands of rock
                const bright = (0.28 + nn * 0.55 + nm * 0.2 + (Math.sin(hy * 1.7 + strata) * 0.5 + 0.5) * 0.15) * stp;
                const w2 = wy * wy, lowGlow = w2 * w2, lg = lowGlow * flick;
                let r = 44 * bright + 220 * lg * (0.4 + nn), g = 21 * bright + 78 * lg * (0.3 + nn * 0.7), b = 16 * bright + 14 * lowGlow;
                if (nm > 0.47 && nm < 0.5) { r += 175 * flick; g += 66 * flick; b += 8; }              // glow seams
                const ck = Math.abs(nk - 0.5); if (ck < 0.02) { r *= 0.3; g *= 0.3; b *= 0.3; } else if (ck < 0.032) { r += 90 * flick; g += 30 * flick; }   // cracks, lit at the lip
                if (y < y0 + CH && top > 0) { r += 70; g += 30; }
                { const l_ = 0.3 * r + 0.59 * g + 0.11 * b; r = (r + (l_ - r) * 0.3) * 0.62; g = (g + (l_ - g) * 0.3) * 0.62; b = (b + (l_ - b) * 0.3) * 0.62; }
                const q = Math.floor(ff * 6 + BAYER[(Math.floor(y / CH) & 3) * 4 + (Math.floor(x / CH) & 3)]) / 6;
                const c = pack(r + (fr - r) * q, g + (fg - g) * q, b + (fb - b) * q), i = y * W + x;
                for (let dy = 0; dy < CH; dy++) { const yy = y + dy; if (yy < y0 || yy >= y1) continue; const o = i + dy * W; for (let dx = 0; dx < CH; dx++) u[o + dx] = c; }
            }
        }
    }

    // ---------------------------------------------------------------- the ship
    /** a soft dark ellipse on the floor under a thing at world (x, y, z) with world radius r: it shrinks and fades as the thing is higher or further (so you read where it is, and how far) */
    _gs(x, y, z, r, strength = 0.6) {
        if (z < 2.5 || z > 150) return;
        const s = F / z, gx = this.sx(x, z), gy = this.sy(-GY, z); if (gy <= this.cy + 1 || gy > H + 30) return;
        const h = Math.max(0, y + GY), lift = clamp(1 - h * 0.05, 0.62, 1), rx = Math.max(2.5 * K, r * s * 1.1) * lift, ry = Math.max(1.2 * K, rx * 0.3);
        if (gx + rx < 0 || gx - rx > W) return;
        const dk = clamp(strength - h * 0.035, 0.22, 0.7) * (1 - this.fogF(z) * 0.6), u = this.u, cyy = this.cy;
        for (let yy = Math.max(Math.floor(cyy) + 1, Math.floor(gy - ry)); yy <= Math.min(H - 1, Math.ceil(gy + ry)); yy++) {
            const dy = (yy - gy) / ry, dy2 = dy * dy; if (dy2 >= 1) continue;
            const half = Math.sqrt(1 - dy2) * rx, xa = Math.max(0, Math.ceil(gx - half)), xb = Math.min(W - 1, Math.floor(gx + half)), o = yy * W;
            for (let xx = xa; xx <= xb; xx++) {
                const dx = (xx - gx) / rx, d = dx * dx + dy2, f = 1 - dk * Math.min(1, (1 - d) * 2.2), c = u[o + xx];
                u[o + xx] = pack((c & 255) * f, ((c >>> 8) & 255) * f, ((c >>> 16) & 255) * f);
            }
        }
    }
    _shadow(sim) {
        // under everything that is coming at you (rocks, enemies, bullets, the boss), then your own
        for (const o of sim.objs) {
            switch (o.k) {
                case 'rock': this._gs(o.x, o.y, o.z, o.r * 1.05); break;
                case 'fighter': this._gs(o.x, o.y, o.z, o.r * 2.0); break;
                case 'drone': this._gs(o.x, o.y, o.z, o.r * 1.5); break;
                case 'turret': this._gs(o.x, o.y, o.z, o.r * 1.6); break;
                case 'mine': this._gs(o.x, o.y, o.z, o.r * 1.2); break;
            }
        }
        for (const e of sim.eshots) this._gs(e.x, e.y, e.z, 0.7, 0.5);
        const b = sim.boss;
        if (b) {
            if (b.type === 'gunship') { this._gs(b.x, b.y, b.z, 7.5, 0.55); }
            else if (b.type === 'serpent') { for (const g of b.segs) this._gs(g.x, g.y, g.z, g.r * 1.1, 0.5); this._gs(b.parts[0].x, b.parts[0].y, b.parts[0].z, 2.6, 0.6); }
            else this._gs(b.x, -GY + 4 * (b.rise || 0), b.z, 4.2, 0.55);
        }
        const S = sim.ship; if (!S.alive) return;
        const gx = this.sx(S.x, ZS), gy = this.sy(-GY, ZS), alt = clamp(1 - (S.y + GY) / 6, 0.25, 1);
        const rx = (22 * alt + 6) * K, ry = (4.5 * alt + 1.5) * K, u = this.u;
        for (let y = Math.max(0, Math.floor(gy - ry)); y <= Math.min(H - 1, Math.ceil(gy + ry)); y++) for (let x = Math.max(0, Math.floor(gx - rx)); x <= Math.min(W - 1, Math.ceil(gx + rx)); x++) {
            const d = ((x - gx) / rx) ** 2 + ((y - gy) / ry) ** 2; if (d > 1 || y <= this.cy) continue;
            const i = y * W + x, c = u[i], k = d < 0.5 ? 0.38 : 0.62;
            u[i] = pack((c & 255) * k, ((c >>> 8) & 255) * k, ((c >>> 16) & 255) * k);
        }
    }
    _ship(sim) {
        const S = sim.ship;
        if (!S.alive) return;
        const rolling = S.rollT > 0;
        let bank = S.bank, flipY = false;
        if (rolling) { const p = 1 - S.rollT / S.rollTotal, th = p * Math.PI * 2 * S.rollDir; bank = Math.sin(th); flipY = Math.cos(th) < 0; }
        const spx = this.sx(S.x, ZS), spy = this.sy(S.y, ZS);
        if (S.invuln > 0 && !rolling && (Math.floor(this.t * 14) & 1) && S.invuln < 3.5 && S.shieldFlash <= 0) { this._trail(spx, spy); return; }
        this.shipAt(spx, spy, bank, S.pitch, K, flipY, S.hitFlash > 0.5 ? 0.6 : 0);
        this.fxShield(sim, spx, spy);
    }
    /** the Wayfinder, from its baked sprite atlas: bank -1..1, pitch -1..1; a cool halo behind it, a strong cyan engine-ring glow, a glow trail (swelling with sim.ship.boost) */
    shipAt(spx, spy, bank, pitch, sc, flipY, hit) {
        const A = G.ShipAtlas, S = this.sim && this.sim.ship, bo = S ? clamp(S.boost || 0, 0, 1) : 0;
        const col = clamp(Math.round(((bank + 1) / 2) * (A.cols - 1)), 0, A.cols - 1), row = pitch > 0.4 ? 0 : pitch < -0.4 ? 2 : 1;
        const sp = A.ready ? A.frames[row * A.cols + col] : G.fallbackShip();
        const eng = A.ready ? A.engines[row * A.cols + col] : { l: [24, 38], r: [48, 38] };
        const ox = spx - sp.w * sc / 2, oy = spy - sp.h * sc / 2, fl = 0.78 + 0.22 * Math.sin(this.t * 40);
        this.glow(spx, spy + 2 * sc, 38 * sc + 10 * bo, 50, 130, 255, 0.15 + 0.12 * bo);        // the halo: the ship is the brightest thing on the screen
        if (eng) for (const e of [eng.l, eng.r]) {
            const ex = ox + e[0] * sc, ey = flipY ? oy + (sp.h - e[1]) * sc : oy + e[1] * sc;
            this.glow(ex, ey, (14 + 12 * bo) * fl * sc, 30, 170, 255, 0.8);
            this.glow(ex, ey, (8 + 3 * bo) * sc, 170, 245, 255, 1.0);
        }
        this._trail(spx, spy, bo);
        this.spr(sp, spx, spy, sc, 0, hit, false, flipY);
        if (this.act === 2 && !flipY) this._uplight(sp, spx, spy, sc);
        if (eng) for (const e of [eng.l, eng.r]) {
            const ex = Math.round(ox + e[0] * sc), ey = Math.round(flipY ? oy + (sp.h - e[1]) * sc : oy + e[1] * sc), q = Math.max(1, Math.round(sc * 3));
            this.ring(ex, ey, 6.2 * sc + 2 * bo, 1.7 * sc, 80 * fl + 30, 225 * fl + 20, 255);       // the cyan engine ring
            this.ring(ex, ey, 9.4 * sc + 3 * bo, 1.1 * sc, 30, 120 * fl, 190 * fl);
            for (const [dx, dy] of [[-q, 0], [q, 0], [0, -q], [0, q], [-q + 1, -q + 1], [q - 1, q - 1], [-q + 1, q - 1], [q - 1, -q + 1]]) this.addPx(ex + dx, ey + dy, 60, 200 * fl, 255 * fl);
            this.addPx(ex, ey, 210, 255, 255); this.addPx(ex + 1, ey, 190, 255, 255); this.addPx(ex, ey + 1, 190, 255, 255);
        }
    }
    /** Act II: the lava's orange up-light on the belly of the ship */
    _uplight(sp, cx, cy, sc) {
        const dw = Math.max(1, Math.round(sp.w * sc)), dh = Math.max(1, Math.round(sp.h * sc)), x0 = Math.round(cx - dw / 2), y0 = Math.round(cy - dh / 2), d = sp.d, fl = 0.8 + 0.2 * Math.sin(this.t * 5), u = this.u;
        for (let y = Math.floor(dh * 0.36) & ~1; y < dh; y += 2) {
            const g = (y / dh - 0.36) / 0.64, sy = Math.floor((y * sp.h) / dh), py = y0 + y; if (py < 0 || py >= H - 1) continue;
            const k = g * g * 0.9 * fl, r = 230 * k, gg = 95 * k, bb = 18 * k;
            for (let x = 0; x < dw; x += 2) {
                const px = x0 + x; if (px < 0 || px >= W - 1) continue;
                if (!(d[sy * sp.w + Math.floor((x * sp.w) / dw)] >>> 24)) continue;
                const i = py * W + px, c = u[i], p = pack((c & 255) + r, ((c >>> 8) & 255) + gg, ((c >>> 16) & 255) + bb); u[i] = p; u[i + 1] = p; u[i + W] = p; u[i + W + 1] = p;
            }
        }
    }
    shieldRing(cx, cy, rad, a) {
        const ri = rad * 0.78, cy0 = Math.max(0, Math.floor(cy - rad)), cy1 = Math.min(H - 1, Math.ceil(cy + rad));
        for (let y = cy0; y <= cy1; y++) {
            const ddy = y - cy, o2 = rad * rad - ddy * ddy; if (o2 < 0) continue;
            const xo = Math.min(rad, 1.2 * Math.sqrt(o2)), i2 = ri * ri - ddy * ddy, xi = i2 > 0 ? 1.2 * Math.sqrt(i2) : 0;
            const sides = xi < xo ? [[Math.ceil(cx - xo), Math.floor(cx - xi)], [Math.ceil(cx + xi), Math.floor(cx + xo)]] : [];
            for (const [xa, xb] of sides) for (let x = Math.max(0, xa); x <= Math.min(W - 1, xb); x++) {
                const ddx = (x - cx) / 1.2, d = Math.sqrt(ddx * ddx + ddy * ddy) / rad; if (d > 1 || d < 0.78) continue;
                const k = ((d - 0.78) / 0.22) * a * (BAYER[(y & 3) * 4 + (x & 3)] + 0.35); this.addPx(x, y, 40 * k * 2, 190 * k * 2, 255 * k * 2);
            }
        }
    }
    _trail(spx, spy, bo = 0) {
        const T = this.trail; T.unshift([spx, spy]); if (T.length > 12) T.pop();
        for (let i = 2; i < T.length; i += 1) {
            const q = T[i], k = 1 - i / T.length, dx = q[0] - spx, dy = q[1] - spy;
            for (const side of [-1, 1]) {
                const ex = spx + side * 20 * K + dx * 0.95, ey = spy + 10 * K + dy * 0.95 + i * 0.6 * K;
                this.glow(ex, ey, (4.5 * k + 1.5 + bo * 3 * k) * K, 40, 170, 255, 0.7 * k);                        // the glow trail
                this.addPx(Math.round(ex), Math.round(ey), 230 * k, 190 * k, 70 * k); if (k > 0.5) this.addPx(Math.round(ex + 1), Math.round(ey), 200 * k, 150 * k, 40 * k);
            }
        }
    }
    _reticle(sim) {
        const S = sim.ship; if (!S.alive || sim.state === CabinetState.Card) return;
        const z = 52, x = this.sx(S.x, z), y = this.sy(S.y, z), a = 0.55 + 0.25 * Math.sin(this.t * 6);
        const c = pack(120 * a + 40, 255 * a, 255 * a), r = Math.round(5 * K), l = Math.round(3 * K), th = 2;
        for (const [dx, dy, w, h] of [[-r - l, 0, l, th], [r, 0, l, th], [0, -r - l, th, l], [0, r, th, l]]) this.rect(x + dx - (w === th ? 1 : 0), y + dy - (h === th ? 1 : 0), x + dx - (w === th ? 1 : 0) + w, y + dy - (h === th ? 1 : 0) + h, c);
    }
    _light(L, sim) {
        const z = L.z + ZS * 0 + 0.0, zz = Math.max(2.5, L.z); const x = this.sx(L.x, zz), y = this.sy(L.y + 0.9 + 0.3 * Math.sin(L.ph * 2.2), zz), s = F / zz;
        const r = clamp(1.05 * s, 4 * K, 46 * K), p = 0.85 + 0.15 * Math.sin(L.ph * 3);
        this.glow(x, y, r * 4.2 * p, 255, 200, 110, 0.7); this.glow(x, y, r * 2.2, 255, 232, 170, 0.9); this.glow(x, y, r * 1.1, 255, 255, 235, 1);
        this.disc(x, y, r * 0.5, pack(255, 252, 235));
        const gy = this.sy(-GY, zz); this.glow(x, gy, r * 5.5, 255, 215, 120, 0.4); this.glow(x, gy, r * 2.8, 120, 255, 225, 0.32);         // a pool of light on the ground under it
    }

    // ---------------------------------------------------------------- shots, particles
    _shot(s) {
        const z = Math.max(1.5, s.z), x = this.sx(s.x, z), y = this.sy(s.y, z), z2 = z + 5, x2 = this.sx(s.x, z2), y2 = this.sy(s.y, z2), w = Math.max(1, Math.round(0.28 * F / z));
        const n = Math.max(Math.abs(x2 - x), Math.abs(y2 - y), 1);
        for (let i = 0; i <= n; i++) {
            const px = Math.round(x + ((x2 - x) * i) / n), py = Math.round(y + ((y2 - y) * i) / n), k = 1 - (i / n) * 0.6;
            this.rect(px - w + 0, py - w + 0, px + w + 1, py + w + 1, pack(40 * k, 215 * k, 255 * k));          // YOURS: cyan with a gold core (the enemy's are hot pink with a white core)
            if (w > 1) this.rect(px - (w >> 1), py - (w >> 1), px + (w >> 1) + 1, py + (w >> 1) + 1, pack(255 * k, 226 * k, 120 * k));
        }
        if (z < 60) this.glow(x, y, 4 * K + w * 2, 20, 150, 220, 0.6);
    }
    /** an enemy bullet, the same in every act: a dark rim, a saturated hot-pink body, a white-hot core and a pink halo (nothing else on the screen looks like it) */
    eshotOrb(x, y, r, p = 1) {
        this.glow(x, y, r * 3.4, 255, 40, 120, 0.9 * p);
        this.disc(x, y, r * 1.38, hex(0x24000c)); this.disc(x, y, r * 1.18, hex(0xff1f6e)); this.disc(x, y, r * 0.82, hex(0xff7aa6)); this.disc(x, y, r * 0.56, WHITE);
    }
    _eshot(s) {
        const z = Math.max(1.5, s.z), x = this.sx(s.x, z), y = this.sy(s.y, z), r = Math.max(2.6 * K, 0.8 * F / z), p = 0.8 + 0.2 * Math.sin(this.t * 24 + s.x * 3);
        this.eshotOrb(x, y, r, p);
    }
    _part(p) {
        const z = Math.max(1.5, p.z), x = this.sx(p.x, z), y = this.sy(p.y, z), s = (p.size * F) / z, k = 1 - p.life / p.max;
        if (p.kind === 'flash') { const r = Math.min(34 * K, s * (0.5 + k * 1.4)); this.glow(x, y, r * 1.8, 255, 190, 90, 1 - k); this.disc(x, y, r * (1 - k) * 0.7, pack(255, 255, 220)); return; }
        if (p.kind === 'spark') { const q = clamp(s * 3, 1.5, 5 * K); this.rect(x, y, x + q, y + q, pack(255, 255, 200)); return; }
        if (p.kind === 'ring' || p.kind === 'smoke' || p.kind === 'debris') { this.fxPart(p); return; }
        const c = G.RAMPS.fire[clamp(Math.floor((1 - k) * 6.9), 1, 6)];
        const r = clamp(s * 0.5 * (1 - k * 0.4), 0.8 * K, 4 * K);
        this.rect(x - r, y - r, x + r, y + r, c);
    }

    // ---------------------------------------------------------------- objects
    _obj(o) {
        const z = o.z; if (z < SV.ZNEAR && o.k !== 'stone' && o.k !== 'pillar' && o.k !== 'arch' && o.k !== 'gate' && o.k !== 'diamond' && o.k !== 'boss') return;
        switch (o.k) {
            case 'rock': {
                const sp = (this.act === 2 ? ART.rocks2 : ART.rocks)[o.variant & 3]; if (!sp) return;
                const sc = (o.r * 2.7 * F) / z / 54; this.spr(sp, this.sx(o.x, z), this.sy(o.y, z), sc, this.fogF(z), o.hit > 0 ? 0.7 : 0, (Math.floor(o.spin * 1.5) & 1) === 1);
                return;
            }
            case 'fighter': {
                const sc = (o.r * 4.4 * F) / z / 64, bk = o.bank; this.spr(ART.fighter, this.sx(o.x, z), this.sy(o.y, z), sc, this.fogF(z), o.hit > 0 ? 0.7 : 0, bk > 0.35);
                if (z < 120) this.glow(this.sx(o.x, z), this.sy(o.y, z) + 4 * sc, 8 * sc, 255, 70, 30, 0.35);
                this.fxCharge(o, this.sx(o.x, z), this.sy(o.y, z) + 4 * sc, sc);
                return;
            }
            case 'drone': { const sc = (o.r * 3.2 * F) / z / 48, x = this.sx(o.x, z), y = this.sy(o.y, z); if (z < 130) this.glow(x, y, 16 * sc, 255, 190, 80, 0.45); this.spr(ART.drone, x, y, sc, this.fogF(z), o.hit > 0 ? 0.7 : 0); this.fxCharge(o, x, y, sc); return; }
            case 'turret': { const sc = (o.r * 3.6 * F) / z / 48; this.spr(this.act === 2 ? ART.turret2 : ART.turret, this.sx(o.x, z), this.sy(o.y, z) - 2 * sc, sc, this.fogF(z), o.hit > 0 ? 0.7 : 0); this.fxCharge(o, this.sx(o.x, z), this.sy(o.y, z) - 2 * sc, sc); return; }
            case 'pillar': this._pillar(o); return;
            case 'arch': this._arch(o); return;
            case 'stone': this._stone(o); return;
            case 'lava': this._lava(o); return;
            case 'gate': this._gate(o); return;
            case 'diamond': this._diamond(o); return;
            case 'boss': this.fxBoss(o); return;
            case 'mine': this.fxMine(o); return;
            case 'wave': this.fxWave(o); return;
        }
    }

    /** a 3D box with its side faces in perspective. style: { front(u,v,x,y,wu,wv,s), side(u,v,x,y,du,dv,s), top(u,v,x,y,wu,du,s), bottom(...) } -> packed colour.
     *  (u, v are 0..1 across the face; the last numbers are the face's size in world units, so the texture scales with the thing) */
    box(x0, x1, y0, y1, zf, zb, st) {
        zf = Math.max(zf, 1.4); if (zb <= zf + 0.05) zb = zf + 0.05;
        const u = this.u, cx = this.cx, cy = this.cy, camX = this.camX, camY = this.camY, fog = this.fog, wu = x1 - x0, hv = y1 - y0, du = zb - zf, sd = Math.floor(x0 * 7 + y1 * 3);
        const fp = (c, f, x, y) => (f < 0.03 ? c : mix(c, fog, Math.floor(f * 6 + BAYER[(y & 3) * 4 + (x & 3)]) / 6));
        // side faces first (behind the front face)
        for (const [xe, vis] of [[x0, x0 - camX > 0], [x1, x1 - camX < 0]]) {
            if (!vis) continue;
            const xa = Math.round(cx + ((xe - camX) * F) / zb), xb = Math.round(cx + ((xe - camX) * F) / zf);
            const lo = Math.max(0, Math.min(xa, xb)), hi = Math.min(W, Math.max(xa, xb));
            for (let x = lo; x < hi; x += 2) {
                const x1p = x + 1 < hi;
                let z = (F * (xe - camX)) / (x + 1 - cx); z = clamp(z, zf, zb); const tu = (z - zf) / du, ff = this.fogF(z);
                const ya = Math.max(0, Math.round(cy - ((y1 - camY) * F) / z)), yb = Math.min(H, Math.round(cy - ((y0 - camY) * F) / z)), sp = Math.max(1, yb - ya), top = Math.round(cy - ((y1 - camY) * F) / z);
                for (let y = ya; y < yb; y++) { const c = fp(st.side((y - top) / sp, tu, x, y, hv, du, sd), ff, x, y); u[y * W + x] = c; if (x1p) u[y * W + x + 1] = c; }
            }
        }
        if (y1 < camY) { // top face
            const ya = Math.round(cy + ((camY - y1) * F) / zb), yb = Math.round(cy + ((camY - y1) * F) / zf);
            for (let y = Math.max(0, ya); y < Math.min(H, yb); y++) {
                const z = (F * (camY - y1)) / (y + 0.5 - cy), xa = Math.round(cx + ((x0 - camX) * F) / z), xb = Math.round(cx + ((x1 - camX) * F) / z), ff = this.fogF(z), tz = (z - zf) / du, sp = Math.max(1, xb - xa);
                for (let x = Math.max(0, xa) & ~1; x < Math.min(W, xb); x += 2) { const c = fp(st.top((x - xa) / sp, tz, x, y, wu, du, sd), ff, x, y); u[y * W + x] = c; if (x + 1 < Math.min(W, xb)) u[y * W + x + 1] = c; }
            }
        }
        if (y0 > camY) { // underside
            const ya = Math.round(cy - ((y0 - camY) * F) / zf), yb = Math.round(cy - ((y0 - camY) * F) / zb);
            for (let y = Math.max(0, ya); y < Math.min(H, yb); y++) {
                const z = (F * (y0 - camY)) / (cy - y - 0.5), xa = Math.round(cx + ((x0 - camX) * F) / z), xb = Math.round(cx + ((x1 - camX) * F) / z), ff = this.fogF(z), tz = (z - zf) / du, sp = Math.max(1, xb - xa);
                for (let x = Math.max(0, xa) & ~1; x < Math.min(W, xb); x += 2) { const c = fp(st.bottom((x - xa) / sp, tz, x, y, wu, du, sd), ff, x, y); u[y * W + x] = c; if (x + 1 < Math.min(W, xb)) u[y * W + x + 1] = c; }
            }
        }
        // the front face
        const xa = Math.round(cx + ((x0 - camX) * F) / zf), xb = Math.round(cx + ((x1 - camX) * F) / zf), ya = Math.round(cy - ((y1 - camY) * F) / zf), yb = Math.round(cy - ((y0 - camY) * F) / zf);
        const w = Math.max(1, xb - xa), h = Math.max(1, yb - ya), ff = this.fogF(zf), ix = 1 / w, iy = 1 / h;
        const xe = Math.min(W, xb); for (let y = Math.max(0, ya); y < Math.min(H, yb); y++) { const v = (y - ya) * iy; for (let x = Math.max(0, xa) & ~1; x < xe; x += 2) { const c = fp(st.front(Math.max(0, (x - xa) * ix), v, x, y, wu, hv, sd), ff, x, y); if (x >= xa) u[y * W + x] = c; if (x + 1 < xe) u[y * W + x + 1] = c; } }
    }

    _pillar(o) {
        const st = this.act === 2 ? PILLAR_STYLE : STONE_STYLE;
        this.box(o.x - o.w, o.x + o.w, -GY, o.top, o.z - o.dz, o.z + o.dz, st);
    }
    _arch(o) {
        const half = o.half, lw = o.legw, zf = o.z - o.dz, zb = o.z + o.dz, st = PILLAR_STYLE;
        this.box(-half - lw, -half, -GY, o.top, zf, zb, st); this.box(half, half + lw, -GY, o.top, zf, zb, st);
        this.box(-half - lw, half + lw, o.yl, o.top, zf, zb, ARCH_STYLE);
    }
    _stone(o) {
        const zf = o.z - o.dz, zb = o.z + o.dz, great = !!o.great, barBottom = o.top - 2.3;
        // the little light lights what it passes: the nearer the stone (in x and in depth), the brighter its runes and its face
        const L = this.sim && this.sim.light; let k = 0;
        if (L) { const dx = L.x - o.x, dz = L.z - o.z; k = Math.exp(-(dx * dx / 70 + dz * dz / 130)); }
        LK.k = Math.min(1, k + (great ? 0.4 : 0)); LK.t = this.t;
        this.box(o.x - o.w * 1.4, o.x + o.w * 1.4, -GY, -GY + 0.8, zf - 0.12, zb + 0.12, SHAFT_T);          // the plinth
        this.box(o.x - o.w, o.x + o.w, -GY + 0.7, barBottom + 0.01, zf, zb, SHAFT_T);                       // the thick shaft
        this.box(o.x - o.w * 1.22, o.x + o.w * 1.22, barBottom - 0.6, barBottom + 0.05, zf - 0.08, zb + 0.08, COLLAR_T);   // the collar
        this.box(o.x - o.cw, o.x + o.cw, barBottom, o.top, zf - 0.15, zb + 0.15, HEAD_T);                   // the wide head
        if (k > 0.12 && zf > 2.2 && zf < 90) this.glow(this.sx(o.x, zf), this.sy(barBottom - 1.2, zf), 7 * F / zf * (0.5 + k), 255, 205, 110, 0.5 * k);
    }
    ring(cx, cy, r, w, rr, gg, bb) {
        const x0 = Math.max(0, Math.floor(cx - r - w)), x1 = Math.min(W - 1, Math.ceil(cx + r + w)), y0 = Math.max(0, Math.floor(cy - r - w)), y1 = Math.min(H - 1, Math.ceil(cy + r + w));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const ddx = x - cx, ddy = y - cy, d = Math.abs(Math.sqrt(ddx * ddx + ddy * ddy) - r); if (d < w * 0.6) this.u[y * W + x] = pack(rr, gg, bb); }
    }
    _lava(o) {
        const z = o.z; if (z < 1.6) return;
        const s = F / z, x = this.sx(o.x, z), y0 = this.sy(-GY, z);
        if (z > 72) { // bubbling: the ground glows, the crust heaves
            const k = 0.5 + 0.5 * Math.sin(this.t * 6 + o.seed), rr = o.r * s;
            this.glow(x, y0, rr * 3, 255, 90, 20, 0.45 + 0.3 * k); this.disc(x, y0, rr * 0.5 * (0.6 + 0.4 * k), hex(0xffa020)); return;
        }
        const grow = smooth(72, 58, z), h = o.hmax * grow, n = 14;
        this.glow(x, y0, o.r * s * 3.4, 255, 100, 20, 0.7 * grow);
        for (let i = 0; i < n; i++) {
            const f = i / (n - 1), wy = -GY + f * h, jig = Math.sin(this.t * 14 + i * 1.9 + o.seed) * 0.28 * (0.3 + f);
            const r = o.r * (1 - f * 0.55) * (0.78 + 0.22 * Math.sin(this.t * 11 + i)), c = G.RAMPS.fire[clamp(Math.floor((1 - f * 0.78) * 6.2 - 0.4), 1, 6)];
            this.disc(this.sx(o.x + jig, z), this.sy(wy, z), r * s * 0.85, c);
        }
        for (let i = 0; i < 6; i++) { const a = this.t * 3 + i * 1.7 + o.seed, wy = -GY + h * (0.55 + 0.5 * ((a * 0.7) % 1)); this.disc(this.sx(o.x + Math.sin(a * 2) * 1.8 * (0.5 + (a % 1)), z), this.sy(wy, z), Math.max(1, 0.12 * s), hex(0xffd070)); }
    }

    // ---------------------------------------------------------------- the gates (per pixel)
    _gate(o) {
        const z = o.z; if (z < 2.2) return;
        const s = F / z, cxg = this.sx(o.x, z), cyg = this.sy(o.y, z);
        if (o.kind === 'ring') this._ringBeacon(o, z, s, cxg, cyg);
        else if (o.kind === 'tri') this._frame(o, z, s, cxg, cyg, 'tri');
        else this._frame(o, z, s, cxg, cyg, 'square');
    }
    _ringBeacon(o, z, s, cxg, cyg) {
        const u = this.u, Rin = 6.6, Rout = 10.6, t = this.t, ff = this.fogF(z) * 0.55;
        const lit = o.passed ? 1 : 0;
        const rad = Rout * s + 2 * K, x0 = Math.max(0, Math.floor(cxg - rad)), x1 = Math.min(W, Math.ceil(cxg + rad)), y0 = Math.max(0, Math.floor(cyg - rad)), y1 = Math.min(H, Math.ceil(cyg + rad));
        const z2 = z + 3.2, s2 = F / z2, fog = this.fog;
        // a halo first (the beacon is lit from within)
        this.glow(cxg, cyg, Rout * s * 1.35, 255, 160, 60, 0.28 + 0.3 * lit);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const dx = x + 0.5 - cxg, dy = y + 0.5 - cyg, d = Math.hypot(dx, dy), rho = d / s;
            let c = 0;
            if (rho >= Rin && rho <= Rout) {
                const tt = (rho - Rin) / (Rout - Rin), ang = Math.atan2(dy, dx);
                const bevel = Math.sin(tt * Math.PI), lightA = Math.cos(ang + 2.35) * 0.28 * bevel;
                const seg = Math.floor((ang + Math.PI) / (Math.PI / 12)), segEdge = ((ang + Math.PI) / (Math.PI / 12)) % 1;
                let v = 0.2 + 0.5 * bevel + lightA + (G.hash2(seg, 4, 1) - 0.5) * 0.12 + (G.vnoise(x * 0.4, y * 0.4, 3) - 0.5) * 0.12;
                if (segEdge < 0.045 || segEdge > 0.97) v -= 0.22;
                c = G.ramp(RAMPS.stone3, v, x, y);
                // the inlay: a band of metal and gold running round the ring
                if (tt > 0.42 && tt < 0.58) { const gl = 0.55 + 0.45 * Math.sin(ang * 12 + t * 2 * (lit ? 4 : 1)); c = mix(hex(0x6a4a14), hex(0xffd070), (lit ? 0.55 : 0.25) + 0.45 * gl * (lit ? 1 : 0.6)); }
                else if (tt > 0.36 && tt < 0.64) c = mul(hex(0xd8b060), 0.55 + 0.3 * bevel);
            } else {
                const rho2 = d / s2;                         // the inner wall: the ring has depth
                if (rho2 >= Rin && rho2 <= Rout && rho < Rin) { const tt = (rho2 - Rin) / (Rout - Rin); c = G.ramp(RAMPS.stone3, 0.12 + 0.18 * (1 - tt) + (lit ? 0.12 : 0), x, y); if (tt < 0.12) c = mix(c, hex(0xffb050), 0.5 * (1 - tt / 0.12)); }
            }
            if (!c) continue;
            const fq = Math.floor(ff * 6 + BAYER[(y & 3) * 4 + (x & 3)]) / 6;
            u[y * W + x] = fq > 0 ? mix(c, fog, fq) : c;
        }
        // the three nodes: dim amber until the ring is flown, then white-gold
        for (let k = 0; k < 3; k++) {
            const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3, mr = (Rin + Rout) / 2, nx = cxg + Math.cos(a) * mr * s, ny = cyg + Math.sin(a) * mr * s, pr = 1.3 * s;
            const p = lit ? 1 : 0.55 + 0.35 * Math.sin(t * 3 + k * 2.1);
            this.glow(nx, ny, pr * 4, 255, 170, 60, 0.75 * p); this.glow(nx, ny, pr * 2, 255, 220, 140, 0.9 * p); this.disc(nx, ny, pr * 0.62, lit ? WHITE : hex(0xffd890));
        }
    }
    _frame(o, z, s, cxg, cyg, shape) {
        const u = this.u, t = this.t, ff = this.fogF(z) * 0.55, fog = this.fog, lit = o.passed ? 1 : 0;
        const aIn = shape === 'tri' ? 4.6 : 4.9, aOut = shape === 'tri' ? 6.5 : 6.8, ext = (shape === 'tri' ? aOut * 2 : aOut * 1.45) * s + 3 * K;
        const x0 = Math.max(0, Math.floor(cxg - ext)), x1 = Math.min(W, Math.ceil(cxg + ext)), y0 = Math.max(0, Math.floor(cyg - ext)), y1 = Math.min(H, Math.ceil(cyg + ext));
        const col = shape === 'tri' ? [hex(0x180a0a), hex(0x4a1a12), hex(0xff6a20), hex(0xffd070)] : [hex(0x120f24), hex(0x3a3260), hex(0xffd070), hex(0xfff2c0)];
        this.glow(cxg, cyg, aOut * s * (shape === 'tri' ? 1.9 : 1.6), shape === 'tri' ? 255 : 255, shape === 'tri' ? 90 : 190, shape === 'tri' ? 20 : 80, 0.25 + 0.35 * lit);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const px = (x + 0.5 - cxg) / s, py = (y + 0.5 - cyg) / s;          // py grows downward
            let m;
            if (shape === 'tri') m = Math.max(py, -0.866 * px - 0.5 * py, 0.866 * px - 0.5 * py);          // point-up: the bottom edge is +y
            else m = Math.max(Math.abs(px), Math.abs(py));
            if (m < aIn || m > aOut) continue;
            const tt = (m - aIn) / (aOut - aIn), bevel = Math.sin(tt * Math.PI);
            let v = 0.25 + 0.55 * bevel + (G.vnoise(x * 0.35, y * 0.35, 8) - 0.5) * 0.25;
            let c = G.ramp([col[0], col[1], mix(col[1], col[2], 0.4), mul(col[1], 1.6)], v * (1 - 0.0), x, y);
            if (tt > 0.4 && tt < 0.6) c = mix(col[2], col[3], (0.35 + 0.65 * Math.sin(t * 5 + (px + py) * 1.7) * 0.5 + 0.3) * (0.6 + 0.4 * lit));
            const fq = Math.floor(ff * 6 + BAYER[(y & 3) * 4 + (x & 3)]) / 6; u[y * W + x] = fq > 0 ? mix(c, fog, fq) : c;
        }
    }
    _diamond(o) {
        const z = o.z; if (z < 2.0) return;
        const s = F / z, cxg = this.sx(o.x, z), cyg = this.sy(o.y, z), t = this.t, u = this.u, ff = this.fogF(z) * 0.4, R = 4.9;
        const ext = R * 1.5 * s + 4 * K, x0 = Math.max(0, Math.floor(cxg - ext)), x1 = Math.min(W, Math.ceil(cxg + ext)), y0 = Math.max(0, Math.floor(cyg - ext)), y1 = Math.min(H, Math.ceil(cyg + ext));
        this.glow(cxg, cyg, R * s * 2.1, 255, 214, 130, 0.75);
        const lw = Math.max(0.085, 1.1 * K / s);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const px = (x + 0.5 - cxg) / s, py = (y + 0.5 - cyg) / s, rho = Math.hypot(px, py);
            const dia = Math.abs(px) + Math.abs(py), triM = Math.max(py, -0.866 * px - 0.5 * py, 0.866 * px - 0.5 * py), sqM = Math.max(Math.abs(px), Math.abs(py));
            let a = 0;
            if (Math.abs(rho - 4.4) < lw) a = 1;                       // the circle
            if (Math.abs(triM - 3.9) < lw) a = 1;                      // the triangle
            if (Math.abs(sqM - 3.1) < lw) a = 1;                       // the square
            if (Math.abs(dia - 4.4) < lw * 1.4) a = 1.3;               // the diamond they make
            const fillv = dia < 4.4 ? (1 - dia / 4.4) : 0;
            if (!a && fillv <= 0) continue;
            const k = Math.min(1, a + fillv * (0.55 + 0.15 * Math.sin(t * 3 + rho)));
            let c = mix(hex(0xffc060), hex(0xfffff0), clamp(k * 0.9 + fillv * 0.6, 0, 1));
            const prev = u[y * W + x], q = clamp(a ? 0.92 : k * 0.75, 0, 1);
            u[y * W + x] = mix(prev, c, q);
        }
        // the little light at its heart
        this.glow(cxg, cyg, 1.2 * s, 255, 240, 200, 1); this.disc(cxg, cyg, 0.28 * s, WHITE);
    }

    // ---------------------------------------------------------------- the flash, the HUD, the cards
    _flash(a) {
        const u = this.u, k = Math.round(clamp(a, 0, 1) * 255);
        for (let i = 0; i < u.length; i++) { const c = u[i]; u[i] = pack((c & 255) + ((255 - (c & 255)) * k >> 8), ((c >>> 8) & 255) + ((255 - ((c >>> 8) & 255)) * k >> 8), ((c >>> 16) & 255) + ((235 - ((c >>> 16) & 255)) * k >> 8)); }
    }
    /** one of the three symbols as a lit outline: kind 1 circle, 2 triangle, 3 square; r = its size in px, th = line width */
    emblem(kind, cx, cy, r, th, glow = 1, c0 = GOLD, c1 = GOLD_HI) {
        cx *= K; cy *= K; r *= K; th *= K; const GB = 5 * K;
        const x0 = Math.max(0, Math.floor(cx - r * 1.3 - th - GB)), x1 = Math.min(W, Math.ceil(cx + r * 1.3 + th + GB)), y0 = Math.max(0, Math.floor(cy - r * 1.3 - th - GB)), y1 = Math.min(H, Math.ceil(cy + r * 1.3 + th + GB)), u = this.u;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const px = x + 0.5 - cx, py = y + 0.5 - cy; let d;
            if (kind === 1) d = Math.abs(Math.hypot(px, py) - r);
            else if (kind === 2) d = Math.abs(Math.max(py, -0.866 * px - 0.5 * py, 0.866 * px - 0.5 * py) - r * 0.62);
            else d = Math.abs(Math.max(Math.abs(px), Math.abs(py)) - r * 0.8);
            if (d < th * 0.5) u[y * W + x] = mix(c0, c1, 1 - d / (th * 0.5) * 0.6);
            else if (glow > 0 && d < th * 0.5 + GB) { const a = (1 - (d - th * 0.5) / GB) * 0.55 * glow * (BAYER[(y & 3) * 4 + (x & 3)] + 0.3); this.addPx(x, y, 255 * a, 170 * a, 40 * a); }
        }
    }
    _overlays(sim, s) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, pal = StarvectorPalette, C = (n) => pal.get(n).packed;
        // (all the HUD is laid out on the old 320 x 240 grid: ht / htc / hrect take those numbers and scale them)
        // ---- the title card
        if (sim.cardT > 0 && sim.state !== CabinetState.Card) {
            const k = sim.cardT, a = Math.min(1, (SV.CARD - k) / 0.35, k / 0.5), y = 62;
            const u = this.u; for (let yy = Math.round((y - 6) * K); yy < Math.round((y + 44) * K); yy++) for (let x = 0; x < W; x++) { if (((x + yy) & 1) === 0 || a > 0.85) { const c = u[yy * W + x]; u[yy * W + x] = pack((c & 255) * 0.3, ((c >>> 8) & 255) * 0.3, ((c >>> 16) & 255) * 0.35); } }
            const rom = ROMAN[sim.act], name = NAMES[sim.act], tx = Math.round((1 - a) * 40), str = rom + '  ' + name;
            this.hrect(0, y + 38, 320 * Math.min(1, a * 1.3), y + 40, C('gold'));
            const xr = 160 - this.hmeasure(str, dsp, 3) / 2 + (a < 1 ? tx : 0);
            this.ht(str, xr + 2, y + 12, dsp, C('goldDim'), 3);
            this.ht(str, xr, y + 10, dsp, C('goldHi'), 3);
        }
        // ---- the symbol being lit (its big emblem and its name)
        if (sim.symbolShow) {
            const t = sim.symbolShow.t, n = sim.symbolShow.n, grow = smooth(0, 0.5, t), fade = 1 - smooth(2.9, 3.6, t), r = 18 + 58 * grow;
            this.emblem(n, 160, 86, r, 3 + 3 * grow, fade);
            if (t > 0.8) this.htc(['', 'THE CIRCLE', 'THE TRIANGLE', 'THE SQUARE'][n], 160, 156, dsp, C('goldHi'), 2);
        }
        // ---- the HUD
        this.ht('1UP', 14, 8, arc, C('gold'));
        this.ht(String(Math.min(999999, sim.score)).padStart(6, '0'), 14, 18, dsp, C('rock'));
        this.htc('HI-SCORE', 160, 8, arc, C('gold')); { const hi = Math.max(sim.hi || 0, sim.score); this.htc(hi ? String(hi).padStart(6, '0') : '------', 160, 18, dsp, C('rock')); }
        for (let i = 0; i < 3; i++) {
            const x = 256 + i * 20, lit = sim.knocks > i, fresh = lit && sim.symbolShow && sim.symbolShow.n === i + 1 && sim.symbolShow.t < 1;
            if (lit) this.emblem(i + 1, x + 6, 14, 6, 1.8, fresh ? 1 : 0.4); else this.emblem(i + 1, x + 6, 14, 6, 1.4, 0, hex(0x3a4258), hex(0x3a4258));
        }
        // the ships, the roll gauge, the act
        const A = G.ShipAtlas;
        for (let i = 0; i < sim.lives; i++) { const sp = A.ready ? A.frames[1 * A.cols + 4] : G.fallbackShip(); this.spr(sp, (24 + i * 22) * K, 224 * K, 0.36 * K); }
        const S = sim.ship, cd = clamp(S.rollCool / (sim.kn.rollCooldown + sim.kn.rollSeconds), 0, 1);
        this.ht('ROLL', 232, 226, PixelFont.Small, C('rockDim')); this.hrect(250, 226, 300, 230, C('navy')); this.hrect(250, 226, 250 + Math.round(50 * (1 - cd)), 230, cd > 0 ? C('cyanDim') : C('cyan'));
        this.fxHud(sim, s);
        // ---- the end
        if (sim.state === CabinetState.Card && sim.result === RoundResult.Lost) {
            const str = 'GAME OVER', w = this.hmeasure(str, dsp, 2), x = 160 - w / 2, y = 108;
            this.hrect(x - 6, y - 5, x + w + 6, y + 21, C('bg')); this.hrect(x - 6, y - 5, x + w + 6, y - 4, C('red')); this.hrect(x - 6, y + 20, x + w + 6, y + 21, C('red'));
            this.ht(str, x, y, dsp, C('white'), 2);
        }
    }
}

// ---------------------------------------------------------------- stone styles (front / side / top faces): u, v across the face, then its size in world units
const RK = G.RAMPS.rock2, ST = G.RAMPS.stone3;
const stoneN = (a, b, s) => nt(a * 11 + s, b * 11 + s * 2) * 0.26 + nt(a * 38 + s * 3, b * 38 + s) * 0.12;
// THE T-PILLARS of Act III (an echo of Gobekli Tepe): cool teal-grey stone, carved glyphs in gold that the little light wakes
const STT = [0x05090d, 0x0d1a20, 0x18323a, 0x2a4e56, 0x44767a, 0x6ea29c, 0xb8d8c8].map(hex);
const LK = { k: 0, t: 0 };
const goldA = (a) => { a = a > 1 ? 1 : a; return pack(255 * a, 205 * a, 90 * a * a + 20 * a); };
let gmK = -1, gmS = -1, gmV = 0;
const gid = (k, s, salt) => { const key = k * 8 + salt; if (key !== gmK || s !== gmS) { gmK = key; gmS = s; gmV = Math.floor(G.hash2(k, s, salt) * 6); } return gmV; };
const glyph = (fu, fv, id) => {
    switch (id) {
        case 0: return Math.abs(fv - 0.5) < 0.13 && fu > 0.12 && fu < 0.88;
        case 1: return Math.abs(fu - 0.5) < 0.13 && fv > 0.12 && fv < 0.88;
        case 2: return (Math.abs(fv - 0.5) < 0.1 && fu > 0.15 && fu < 0.85) || (Math.abs(fu - 0.5) < 0.1 && fv > 0.15 && fv < 0.85);
        case 3: { const d = Math.hypot(fu - 0.5, fv - 0.5); return d > 0.2 && d < 0.34; }
        case 4: { const d = Math.abs(fu - 0.5) + Math.abs(fv - 0.5); return d > 0.28 && d < 0.4; }
        default: return Math.abs(fu - 0.5) < 0.1 ? (fv > 0.15 && fv < 0.85) : (Math.abs(fu - 0.5) < 0.34 && Math.abs(fv - 0.5) < 0.1);
    }
};
const stFace = (v, u, x, y, hv, du, s) => G.ramp(STT, 0.14 + stoneN(u * du, v * hv, s + 5) * 0.9 + 0.1 * (1 - v) + LK.k * 0.16, x, y);
const SHAFT_T = {
    front(u, v, x, y, wu, hv, s) {
        const pu = (u - 0.5) * wu, edgeD = (u < 0.07 || u > 0.93) ? -0.12 : 0, inset = Math.abs(pu) < wu * 0.36 && v > 0.05 && v < 0.95, lip = inset && (Math.abs(pu) > wu * 0.36 - 0.08 || v < 0.075 || v > 0.925) ? 0.16 : 0;
        const c = G.ramp(STT, 0.34 + stoneN(u * wu, v * hv, s) * 1.1 - 0.1 * v + edgeD + lip + LK.k * 0.22, x, y);
        if (inset && Math.abs(pu) < 0.33) {
            const cell = 0.85, gy = Math.floor((v * hv) / cell), fv = (v * hv) / cell - gy, fu = (pu + 0.33) / 0.66;
            if (glyph(fu, fv, gid(gy, s, 5))) return goldA(0.34 + LK.k * 0.95 + 0.1 * Math.sin(LK.t * 3 + gy));
        }
        return c;
    },
    side: stFace,
    top(u, t, x, y, wu, du, s) { return G.ramp(STT, 0.52 + stoneN(u * wu, t * du, s + 9) * 0.8 + LK.k * 0.15, x, y); },
    bottom(u, t, x, y) { return G.ramp(STT, 0.1, x, y); },
};
const COLLAR_T = {
    front(u, v, x, y, wu, hv, s) { const line = v > 0.4 && v < 0.62; return line ? goldA(0.3 + LK.k * 0.8) : G.ramp(STT, 0.3 + stoneN(u * wu, v * hv, s + 1) + LK.k * 0.2, x, y); },
    side: stFace, top: SHAFT_T.top, bottom: SHAFT_T.bottom,
};
const HEAD_T = {
    front(u, v, x, y, wu, hv, s) {
        const cap = v < 0.08 ? 0.12 : v > 0.9 ? -0.1 : 0, endd = (u < 0.035 || u > 0.965) ? -0.14 : 0;
        if (v > 0.1 && v < 0.9) {
            if ((v > 0.14 && v < 0.2) || (v > 0.8 && v < 0.86)) return goldA(0.28 + LK.k * 0.7);             // inlaid gold lines top and bottom
            if (v > 0.26 && v < 0.74) { const cell = 0.9, gx = Math.floor((u * wu) / cell), fu = (u * wu) / cell - gx, fv = (v - 0.26) / 0.48; if (u > 0.05 && u < 0.95 && glyph(fu, fv, gid(gx, s, 9))) return goldA(0.36 + LK.k * 1.0 + 0.1 * Math.sin(LK.t * 3 + gx)); }
        }
        return G.ramp(STT, 0.38 + stoneN(u * wu, v * hv, s + 2) * 1.0 + cap + endd + LK.k * 0.2, x, y);
    },
    side: stFace, top: SHAFT_T.top, bottom: SHAFT_T.bottom,
};
const STONE_STYLE = SHAFT_T, BAR_STYLE = HEAD_T, GREAT_STYLE = SHAFT_T;
const PILLAR_STYLE = {
    front(u, v, x, y, wu, hv, s) {
        const n = nt(u * wu * 12 + s, v * hv * 12), glow = Math.pow(v, 2.6), strata = Math.sin(v * hv * 5 + n * 5) * 0.5 + 0.5;
        const base = G.ramp(RK, 0.12 + n * 0.28 + strata * 0.06 + glow * 0.42, x, y);
        const sm = Math.abs(nt(u * wu * 4 + s, v * hv * 1.6) - 0.5);
        if (sm < 0.022) return hex(0xffa040);                                       // a glowing seam in the rock
        return (u < 0.05 || u > 0.95) ? mul(base, 0.6) : base;
    },
    side(v, u, x, y, hv, du, s) { const n = nt(u * du * 12 + s, v * hv * 12); return G.ramp(RK, 0.05 + n * 0.16 + Math.pow(v, 2.2) * 0.36, x, y); },
    top(u, t, x, y, wu, du, s) { return G.ramp(RK, 0.28 + nt(u * wu * 14 + s, t * du * 14) * 0.2, x, y); },
    bottom(u, t, x, y) { return G.ramp(RK, 0.2, x, y); },
};
const ARCH_STYLE = {
    front(u, v, x, y, wu, hv, s) { const n = nt(u * wu * 8 + s, v * hv * 12); const keystone = Math.abs(u - 0.5) < 0.03 ? 0.1 : 0; const under = v > 0.88 ? 0.2 : 0; return G.ramp(RK, 0.2 + n * 0.22 + keystone + under, x, y); },
    side: PILLAR_STYLE.side, top: PILLAR_STYLE.top,
    bottom(u, t, x, y, wu, du, s) { return G.ramp(RK, 0.34 + nt(u * wu * 10 + s, t * du * 14) * 0.2 + (1 - t) * 0.2, x, y); },
};

// ---------------------------------------------------------------- the title screen (the attract's first page): the logo, in code
let _title = null;
export function drawTitle(surface, time, attract) {
    const R = _title || (_title = new StarvectorRenderer());
    R.titleScene(surface, time, attract);
}
StarvectorRenderer.prototype.titleScene = function (surface, time, attract) {
    const hi = hiSurface(), u = hi._u32, t = time, pal = StarvectorPalette, C = (n) => pal.get(n).packed, arc = PixelFont.Arcade, dsp = PixelFont.Display;
    this.s = hi; this.u = u; this.t = t; this.cx = SV.CX * K; this.cy = SV.CY * K; this.camX = Math.sin(t * 0.5) * 1.2; this.camY = -0.6; this.dist = t * 34; this.act = 1; this.fog = FOG[1]; this.fogFrom = FOG_FROM[1];
    this.sim = null;
    this._sky({}); this._stars({ V: 34 }); this._ground({});
    // the ring beacon on the horizon, far and small
    const bz = 150 - (t * 3) % 6;
    this._ringBeacon({ passed: false }, bz, F / bz, this.sx(0, bz), this.sy(-0.9, bz));
    // the Wayfinder from behind, swaying
    const bank = Math.sin(t * 0.9) * 0.55, sx = (160 + Math.sin(t * 0.9) * 22) * K, sy = (168 + Math.sin(t * 1.7) * 3) * K;
    this.shipAt(sx, sy, bank, 0, 1.6 * K, false, 0);
    // the logo: STARVECTOR, chrome over gold, extruded (built once; only the shine moves)
    const L = buildLogo(dsp), lx0 = Math.round(W / 2 - L.w / 2), ly0 = Math.round(38 * K);
    for (let y = 0; y < L.h; y++) { const py = ly0 + y; if (py < 0 || py >= H) continue; for (let x = 0; x < L.w; x++) { const c = L.base[y * L.w + x]; if (c) u[py * W + lx0 + x] = c; } }
    for (let i = 0; i < L.shineIdx.length; i += 3) {
        const x = L.shineIdx[i], y = L.shineIdx[i + 1], sh = Math.max(0, 1 - Math.abs(((x + t * 70 * K) % (260 * K)) - 130 * K - y * 1.4) / (9 * K));
        if (sh > 0.2) u[(ly0 + y) * W + lx0 + x] = mix(L.base[y * L.w + x], WHITE, sh * 0.85);
    }
    if (SurfaceDraw.blink(t)) this.htc('INSERT COIN', 160, 196, arc, C('gold'), 2);
    this.htc(StarvectorSpecLine, 160, 222, PixelFont.Small, C('rockDim'));
    this.ht('1UP', 14, 8, arc, C('gold')); this.ht(String(attract ? attract.lastScore || 0 : 0).padStart(6, '0'), 14, 18, dsp, C('rock'));
    this.htc('HI-SCORE', 160, 8, arc, C('gold')); this.htc(attract && attract.table && attract.table.topBlank ? '------' : String(attract && attract.table ? attract.table.top : 0).padStart(6, '0'), 160, 18, dsp, C('rock'));
    this.present(surface);
};
const StarvectorSpecLine = '© 1982 ORBITAL ELECTRONICS';

let _logo = null;
function buildLogo(dsp) {
    if (_logo) return _logo;
    const name = 'STARVECTOR', k = Math.round(4 * K), adv = Math.round(30 * K), w = adv * (name.length - 1) + 7 * k, rows = 8 * k, EX = Math.round(4 * K), pw = w + EX + 2, ph = rows + EX + 2, PADX = 1;
    const mask = new Uint8Array(w * rows);
    for (let i = 0; i < name.length; i++) {
        const g = dsp.glyph(name[i]); if (!g) continue;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (g[r] & (1 << (7 - c))) for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) { const px = i * adv + c * k + xx, py = r * k + yy; if (px < w) mask[py * w + px] = 1; }
    }
    const chrome = [0xfffff4, 0xfff0b0, 0xffd860, 0xf0b030, 0x3a2208, 0x1a1004, 0xa86a1c, 0xe89a30, 0xffc850, 0xc87a20, 0x6a3a0c].map(hex);
    const base = new Uint32Array(pw * ph), shineIdx = [];
    const at = (x, y) => (y + 1) * pw + x + PADX;
    for (let e = EX; e >= 1; e--) for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) base[at(x + e, y + e)] = mix(hex(0x7a4a14), hex(0x2a1406), e / EX);
    for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
        const n = y / rows, band = n < 0.18 ? 0 : n < 0.3 ? 1 : n < 0.42 ? 2 : n < 0.5 ? 3 : n < 0.54 ? 4 : n < 0.62 ? 5 : n < 0.74 ? 6 : n < 0.86 ? 7 : n < 0.94 ? 8 : 9;
        base[at(x, y)] = chrome[band]; if (band < 5) shineIdx.push(x + PADX, y + 1, 0);
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= rows || !mask[yy * w + xx]) { const i = at(xx, yy); if (!base[i] || xx < 0 || yy < 0) base[i] = hex(0x1a0c04); } }
    return (_logo = { w: pw, h: ph, base, shineIdx });
}

installFx(StarvectorRenderer, { STONE: STONE_STYLE, GREAT: GREAT_STYLE, BAR: BAR_STYLE, PILLAR: PILLAR_STYLE });
