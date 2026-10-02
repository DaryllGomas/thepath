// THE NODE · THE JUNCTION · STARVECTOR · THE FIGHT'S PICTURE: the bosses, the layered explosions, the score
// pop-ups, the speed lines and the fight HUD (multiplier, shield, boss health bar, WARNING). Installed onto
// StarvectorRenderer (renderer.js) as methods; it only READS the sim. Raster only, chunky and crisp like everything else.
import { PixelFont } from '../../sdk/index.js';
import { SV } from './sim.js';
import * as Boss from './boss.js';
import * as G from './gfx.js';
const { pack, hex, mix, mul, BAYER } = G;
const KQ = (() => { try { const q = +new URL(import.meta.url).searchParams.get('k'); return q > 0 ? q : 0; } catch (e) { return 0; } })();
const K = KQ || G.RK, W = 320 * K, H = 240 * K, F = SV.F * K, ZS = SV.ZS, GY = SV.GY;      // (physical pixels: 480 x 360; the HUD is laid out on the old 320 x 240 grid and scaled by ht / htc / hrect)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const WHITE = hex(0xffffff);
const STEEL = [hex(0x141a2c), hex(0x232c46), hex(0x34405e), hex(0x4a5a80), hex(0x6e82ac)];
const NAMES = Boss.NAMES;
// the waking stone: a cold teal-grey rock laced with glowing gold veins (it must not read as the corridor's stones)
const nt = G.ntex, GR = [hex(0x10181c), hex(0x1c2c30), hex(0x2c4448), hex(0x44686c), hex(0x6a9a98)];
const vein = (a, b, s) => { const n = nt(a * 7 + s, b * 7 + s * 2); return Math.abs(n - 0.5) < 0.035 ? 1 : 0; };
const GUARD_STYLE = {
    front(u, v, x, y, wu, hv, s) { const n = nt(u * wu * 3 + s, v * hv * 3) * 0.55 + nt(u * wu * 12 + s, v * hv * 12) * 0.2; if (vein(u * wu, v * hv, s)) return hex(0xffc860); return G.ramp(GR, 0.28 + n - 0.1 * v, x, y); },
    side(v, u, x, y, hv, du, s) { return G.ramp(GR, 0.12 + nt(u * du * 3 + s, v * hv * 3) * 0.4, x, y); },
    top(u, t, x, y, wu, du, s) { return G.ramp(GR, 0.5 + nt(u * wu * 3 + s, t * du * 3) * 0.4, x, y); },
    bottom(u, t, x, y) { return G.ramp(GR, 0.1, x, y); },
};

export function installFx(R, styles) {
    const P = R.prototype;

    // ---------------------------------------------------------------- little drawing helpers
    P.poly = function (pts, c0, c1) {
        let ya = 1e9, yb = -1e9; for (const p of pts) { if (p[1] < ya) ya = p[1]; if (p[1] > yb) yb = p[1]; }
        const top = ya, span = Math.max(1, yb - ya), u = this.u, n = pts.length;
        ya = Math.max(0, Math.floor(ya)); yb = Math.min(H - 1, Math.ceil(yb));
        for (let y = ya; y <= yb; y++) {
            const yy = y + 0.5; let xa = 1e9, xb = -1e9;
            for (let i = 0; i < n; i++) {
                const p = pts[i], q = pts[(i + 1) % n];
                if ((p[1] <= yy && q[1] > yy) || (q[1] <= yy && p[1] > yy)) { const x = p[0] + ((yy - p[1]) * (q[0] - p[0])) / (q[1] - p[1]); if (x < xa) xa = x; if (x > xb) xb = x; }
            }
            if (xb < xa) continue;
            const c = c1 === undefined ? c0 : mix(c0, c1, Math.floor(clamp((yy - top) / span, 0, 1) * 5) / 5);
            const x0 = Math.max(0, Math.round(xa)), x1 = Math.min(W, Math.round(xb)); if (x1 > x0) u.fill(c, y * W + x0, y * W + x1);
        }
    };
    /** an additive ring, w px thick, stepped round by angle (cheap at any size) */
    P.ringAdd = function (cx, cy, r, w, rr, gg, bb) {
        const n = Math.max(12, Math.min(420, Math.round(r * 6.283))), th = Math.max(1, Math.round(w));
        for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832, x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r); for (let q = 0; q < th; q++) this.addPx(x + (q & 1), y + (q >> 1), rr, gg, bb); }
    };
    /** a soft-edged translucent disc (smoke) */
    P.blendDisc = function (cx, cy, rad, c, a) {
        const r = Math.max(1, rad), x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r)), u = this.u;
        const cr = c & 255, cg = (c >>> 8) & 255, cb = (c >>> 16) & 255;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const d = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) / (r * r); if (d > 1) continue;
            const k = (1 - d) * a, q = u[y * W + x], kk = k > 0.5 ? 0.62 : k > 0.22 ? 0.34 : 0.0; if (kk <= 0) continue;
            u[y * W + x] = pack((q & 255) + (cr - (q & 255)) * kk, ((q >>> 8) & 255) + (cg - ((q >>> 8) & 255)) * kk, ((q >>> 16) & 255) + (cb - ((q >>> 16) & 255)) * kk);
        }
    };
    P.line2 = function (x0, y0, x1, y1, c, th = 1) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) | 0;
        for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; this.rect(x, y, x + th, y + th, c); }
    };
    P.brackets = function (cx, cy, r, c, len = 4) {
        const x0 = Math.round(cx - r), x1 = Math.round(cx + r), y0 = Math.round(cy - r), y1 = Math.round(cy + r);
        for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { this.rect(Math.min(x, x + dx * len), y, Math.max(x, x + dx * len) + 1, y + 1, c); this.rect(x, Math.min(y, y + dy * len), x + 1, Math.max(y, y + dy * len) + 1, c); }
    };
    /** text straight into the frame, any colour (packed): font = PixelFont.*, returns the width */
    P.txt = function (s, x, y, font, c, scale = 1, shadow = 0) {
        const u = this.u; let px = x | 0;
        for (let k = 0; k < s.length; k++) {
            const g = font.glyph(s[k]);
            if (g) for (let row = 0; row < font.cellH; row++) { const bits = g[row]; if (!bits) continue;
                for (let col = 0; col < font.cellW; col++) if (bits & (1 << (font.cellW - 1 - col))) {
                    for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) {
                        const X = px + col * scale + xx, Y = (y | 0) + row * scale + yy;
                        if (shadow && X + 1 < W && Y + 1 < H) u[(Y + 1) * W + X + 1] = shadow;
                        if (X >= 0 && X < W && Y >= 0 && Y < H) u[Y * W + X] = c;
                    }
                } }
            px += font.advance * scale;
        }
        return font.measure(s, scale);
    };
    P.txtC = function (s, cx, y, font, c, scale = 1, shadow = hex(0x101020)) { const w = font.measure(s, scale); this.txt(s, Math.round(cx - w / 2), y, font, c, scale, shadow); };
    /** the HUD, on the old 320 x 240 grid: x, y and scale are in those units, the pixels written are physical (the Small font rounds up so it stays readable) */
    const pscale = (font, scale) => Math.max(1, Math.round(scale * K * (font === PixelFont.Small ? 1 : 0.85)));
    P.hmeasure = function (s, font, scale = 1) { return font.measure(s, pscale(font, scale)) / K; };
    P.ht = function (s, x, y, font, c, scale = 1, shadow = 0) { return this.txt(s, Math.round(x * K), Math.round(y * K), font, c, pscale(font, scale), shadow) / K; };
    P.htc = function (s, cx, y, font, c, scale = 1, shadow = hex(0x101020)) { const ps = pscale(font, scale), w = font.measure(s, ps); this.txt(s, Math.round(cx * K - w / 2), Math.round(y * K), font, c, ps, shadow); };
    P.hrect = function (x0, y0, x1, y1, c) { this.rect(x0 * K, y0 * K, x1 * K, y1 * K, c); };

    // ---------------------------------------------------------------- speed lines, the near flash
    P.fxSpeed = function (sim) {
        const fx = sim.speedFx; if (fx < 0.12) return;
        const n = Math.round((10 + 26 * fx) * 0.4), t = this.t, cx = this.cx, cy = this.cy, boost = sim.ship.boost;      // (60% fewer, and fainter)
        for (let i = 0; i < n; i++) {
            const a = G.hash2(i, 1, 21) * 6.2832, ph = (G.hash2(i, 2, 21) + t * (0.9 + fx * 1.4)) % 1, r0 = (30 + ph * ph * 190) * K, len = (4 + ph * 34 * (0.6 + fx)) * K;
            const ca = Math.cos(a), sa = Math.sin(a) * 0.82, al = Math.min(1, ph * 2.2) * (0.35 + 0.65 * fx) * (1 - smooth(0.9, 1, ph));
            const k = (boost > 0.3 ? 1.35 : 1) * al * 0.7, c = this.act === 2 ? [255, 150, 70] : this.act === 3 ? [130, 230, 220] : [150, 190, 255];
            const n2 = Math.max(2, len | 0);
            for (let j = 0; j < n2; j += 1) { const rr = r0 + j, x = Math.round(cx + ca * rr), y = Math.round(cy + sa * rr); if (x < 0 || y < 0 || x >= W || y >= H) break; const q = k * (0.45 + 0.55 * (j / n2)); this.addPx(x, y, c[0] * q * 0.7, c[1] * q * 0.7, c[2] * q * 0.7); }
        }
    };
    P.fxNear = function (sim) {
        const a = sim.nearFlash; if (a <= 0.02) return;
        const u = this.u, d = Math.round(10 * a * K);
        for (let y = 0; y < H; y++) { const e = Math.min(y, H - 1 - y); for (let x = 0; x < W; x += (e < d ? 1 : W - 1)) { const ex = Math.min(x, W - 1 - x); if (Math.min(e, ex) >= d) continue; const k = 1 - Math.min(e, ex) / d; this.addPx(x, y, 50 * k * a, 170 * k * a, 255 * k * a); } }
    };

    // ---------------------------------------------------------------- particles (the layered explosion's other layers)
    P.fxPart = function (p) {
        const z = Math.max(1.5, p.z), x = this.sx(p.x, z), y = this.sy(p.y, z), s = (p.size * F) / z, k = 1 - p.life / p.max;
        if (p.kind === 'ring') { const r = Math.min(70 * K, s * (0.3 + k * 1.5)), a = (1 - k) * (1 - k); this.ringAdd(x, y, r, Math.min(3 * K, Math.max(1, s * 0.05)), 255 * a, 170 * a, 80 * a); return; }
        if (p.kind === 'smoke') { const a = (1 - k) * 0.9; this.blendDisc(x, y, clamp(s * (0.5 + k * 0.7), 1.5 * K, 26 * K), hex(0x3a3640), a); return; }
        if (p.kind === 'debris') { const r = clamp(s * 1.2, 1.5, 4 * K); this.rect(x, y, x + r + 1, y + r + 1, k > 0.6 ? hex(0xff9a40) : hex(0xd8c8a8)); this.addPx(Math.round(x - 1), Math.round(y - 1), 140 * (1 - k), 70 * (1 - k), 20); return; }
    };

    // ---------------------------------------------------------------- enemy bullets (the boss's: globs and shards), the enemies' charge
    P.fxEshot = function (s, x, y, r) {
        // the boss's globs and shards use the same bullet as everyone's (hot pink, white core): one look, readable on every floor
        const big = s.kind === 'glob' ? 1.15 : 1;
        this.eshotOrb(x, y, r * big, 0.85 + 0.15 * Math.sin(this.t * 24 + s.x * 3));
    };
    P.fxCharge = function (o, x, y, sc) {
        if (o.fire === undefined || o.fire > 0.42 || o.fire <= 0 || o.z > 150 || o.z < 14) return;
        const k = 1 - o.fire / 0.42, f = (Math.floor(this.t * 20) & 1) ? 1 : 0.7;
        this.glow(x, y, 6 * K + 20 * sc * k, 255, 50, 30, 0.45 + 0.55 * k * f);
        if (k > 0.55) this.disc(x, y + 3 * sc, Math.max(1.5, 4 * sc * k), hex(0xff8040));
    };
    P.fxMine = function (o) {
        const z = o.z; if (z < 1.6) return;
        const x = this.sx(o.x, z), y = this.sy(o.y, z), s = F / z, r = Math.max(2, o.r * s), t = this.t, blink = (Math.floor(t * 6 + o.seed) & 1) ? 1 : 0.35;
        this.glow(x, y, r * 2.2, 255, 50, 40, 0.25 + 0.35 * blink);
        for (let i = 0; i < 8; i++) { const a = i * 0.785 + t * 0.8; this.line2(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, hex(0xa0a6b8), Math.max(1, r * 0.15)); }
        this.disc(x, y, r, hex(0x2a3044)); this.disc(x - r * 0.2, y - r * 0.2, r * 0.7, hex(0x4a5878)); this.disc(x, y, r * 0.35, mix(hex(0x601810), hex(0xff3020), blink));
        if (o.hit > 0) this.disc(x, y, r, WHITE);
    };
    P.fxWave = function (o) {
        // a shockwave racing along the ground: a ridge of glowing stone with a gap you can slip through
        const z = Math.max(1.4, o.z), s = F / z, y0 = this.sy(-GY, z), y1 = this.sy(o.top, z), t = this.t;
        const segs = [[-16, o.gx - o.gw], [o.gx + o.gw, 16]];
        for (const [a, b] of segs) {
            if (b <= a) continue;
            const xa = this.sx(a, z), xb = this.sx(b, z);
            this.poly([[xa, y1], [xb, y1], [xb, y0], [xa, y0]], hex(0xffb050), hex(0x5a2410));
            this.rect(xa, y1, xb, y1 + Math.max(1, s * 0.12), hex(0xfff0b0));
            for (let i = 0; i < 6; i++) { const q = a + ((b - a) * (i + 0.5)) / 6, px = this.sx(q, z); this.rect(px, y1 + 2, px + Math.max(1, s * 0.08), y0, hex(0xc8601c)); }
            this.glow((xa + xb) / 2, (y0 + y1) / 2, Math.min(150, (xb - xa) * 0.3 + 20), 255, 130, 40, 0.18);
        }
        // the lane: bright posts at the gap's edges
        for (const e of [o.gx - o.gw, o.gx + o.gw]) { const px = this.sx(e, z); this.rect(px, y1 - s * 0.3, px + Math.max(1, s * 0.12), y0, hex(0x80ffe0)); }
        this.glow(this.sx(o.gx, z), y0, s * 2.2, 80, 255, 200, 0.35 + 0.1 * Math.sin(t * 20));
    };

    // ---------------------------------------------------------------- the boss's timed hazards (beams, tail sweeps, lunge marks)
    P.fxHazard = function (h) {
        const t = this.t, armed = h.arm > 0, blink = (Math.floor(t * 14) & 1) ? 1 : 0.55;
        if (h.kind === 'beam') {
            const xa = this.sx(h.x0, ZS), xb = this.sx(h.x1, ZS), xm = (xa + xb) / 2;
            if (armed) {
                const k = 1 - h.arm / Math.max(0.2, h.total + h.arm * 0 + 0.01), w = Math.max(1, (xb - xa) * 0.08);
                for (let y = 0; y < H; y += 6 * K) this.rect(xm - w, y, xm + w + 1, y + 3 * K, pack(255, 120 * blink, 80 * blink));
                this.glow(xm, 22 * K, 22 * K, 255, 80, 60, 0.5 * blink); this.glow(xm, H - 28 * K, 22 * K, 255, 80, 60, 0.5 * blink);
                this.txt('!', Math.round(xm - 3), Math.round(6 * K), PixelFont.Display, pack(255, 220, 120), 3);
            } else {
                const f = 0.75 + 0.25 * Math.sin(t * 60);
                this.rect(xa, 0, xb, H, pack(255, 120 * f, 60 * f)); this.rect(xa + (xb - xa) * 0.18, 0, xb - (xb - xa) * 0.18, H, pack(255, 230, 160)); this.rect(xa + (xb - xa) * 0.38, 0, xb - (xb - xa) * 0.38, H, WHITE);
                this.glow(xm, H / 2, (xb - xa) * 2.4, 255, 120, 60, 0.6);
            }
            return;
        }
        if (h.kind === 'sweep') {
            const ya = this.sy(h.y1, ZS), yb = this.sy(h.y0, ZS), ym = (ya + yb) / 2;
            if (armed) {
                const a = 0.18 + 0.2 * blink; for (let y = Math.max(0, Math.floor(ya)); y < Math.min(H, Math.ceil(yb)); y++) for (let x = (y & 1); x < W; x += 2) this.addPx(x, y, 255 * a, 40 * a, 20 * a);
                this.rect(0, ya, W, ya + 1, pack(255, 120, 60)); this.rect(0, yb, W, yb + 1, pack(255, 120, 60));
                const ex = h.dir > 0 ? 6 * K : W - 18 * K; for (let i = 0; i < 3; i++) this.txt(h.dir > 0 ? '>' : '<', Math.round(ex + (h.dir > 0 ? i * 7 * K : -i * 7 * K)), Math.round(ym - 4 * K), PixelFont.Display, pack(255, 220, 120), 1);
                const tx = h.dir > 0 ? (-8 + (1 - Math.min(1, h.arm / 1.1)) * 28) * K : W + (8 - (1 - Math.min(1, h.arm / 1.1)) * 28) * K; this.disc(tx, ym, 10 * K, hex(0x5a2a1a)); this.glow(tx, ym, 20 * K, 255, 100, 30, 0.7);
            } else this.tailAt(h);
            return;
        }
        if (h.kind === 'lunge') {
            const x = this.sx(h.lx, ZS + 1), y = this.sy(h.ly, ZS + 1), k = armed ? 1 - h.arm / 0.6 : 1, r = (44 - 4 * clamp(k, 0, 1)) * K;
            if (armed) { this.ring(x, y, r, 2.2 * K, 255 * blink, 70, 40); this.ring(x, y, r * 0.55, 1.6 * K, 255, 150, 60); this.brackets(x, y, r * 0.9, pack(255, 220, 120), 6 * K); }
        }
    };
    P.tailAt = function (h) {
        // the sweeping tail: a chain of rock-crusted segments whipping across, the tip leading
        const dir = h.dir, y = h.yc, t = this.t;
        for (let i = 9; i >= 0; i--) {
            const x = h.cx - dir * i * 1.35, z = ZS + 1.4 + i * 0.1, s = F / z, r = (0.55 + i * 0.09) * s, px = this.sx(x, z), py = this.sy(y + 0.12 * Math.sin(t * 9 + i), z);
            this.glow(px, py, r * 1.9, 255, 90, 20, 0.5); this.disc(px, py, r, hex(0x3a1a12)); this.disc(px - r * 0.15, py - r * 0.2, r * 0.72, hex(0x6a3220)); this.ring(px, py, r * 0.9, 1.2, 255, 130, 40);
        }
        const z = ZS + 1.4, s = F / z, px = this.sx(h.cx + dir * 0.6, z), py = this.sy(y, z); this.glow(px, py, s * 1.5, 255, 200, 90, 0.8); this.disc(px, py, s * 0.4, hex(0xffd070));
    };

    // ---------------------------------------------------------------- the bosses
    P.fxBoss = function (b) {
        if (b.type === 'gunship') this.bossGunship(b);
        else if (b.type === 'serpent') this.bossSerpent(b);
        else this.bossGuardian(b);
    };
    const weak = function (R, p, x, y, s) {
        // the weak point's pulse, and the flash when it is hit
        if (p.dead) return;
        const ex = Boss.exposed(p.boss, p), t = R.t;
        if (ex) { const a = 0.55 + 0.45 * Math.sin(t * 9); R.ring(x, y, p.r * s * 1.18 + 1.5 * K, 1.4 * K, 255 * a, 230 * a, 120 * a); }
        if (p.hit > 0) { R.glow(x, y, p.r * s * 2.2, 255, 255, 255, 0.8 * (p.hit / 0.12)); R.disc(x, y, p.r * s * 0.7, WHITE); }
    };

    P.bossGunship = function (b) {
        const z = Math.max(8, b.z), s = F / z, cxp = this.sx(b.x, z), cyp = this.sy(b.y, z), t = this.t, a = b.atk;
        const X = (u, v) => [cxp + u * s, cyp - v * s], flash = b.hit > 0 ? 0.35 : 0;
        const tint = (c) => (flash ? mix(c, WHITE, flash) : c);
        // engines, glowing behind the hull
        for (const sx of [-1, 1]) { const [ex, ey] = X(sx * 3.6, -1.7); this.glow(ex, ey, 14 * s / 6 * (0.85 + 0.15 * Math.sin(t * 30)), 60, 170, 255, 0.9); this.glow(ex, ey, 7 * s / 6, 190, 240, 255, 0.9); }
        // wings
        for (const sx of [-1, 1]) {
            this.poly([X(sx * 3.2, 1.7), X(sx * 8.8, 0.9), X(sx * 8.8, -0.2), X(sx * 7.2, -1.1), X(sx * 3.2, -1.0)].map((q) => q), tint(STEEL[3]), tint(STEEL[1]));
            this.poly([X(sx * 3.2, 1.7), X(sx * 8.8, 0.9), X(sx * 8.4, 0.62), X(sx * 3.2, 1.25)], tint(STEEL[4]), tint(STEEL[3]));
            for (let i = 1; i < 4; i++) { const [lx, ly] = X(sx * (3.2 + i * 1.4), 1.5 - i * 0.18), [lx2, ly2] = X(sx * (3.2 + i * 1.4), -1.0); this.rect(lx, ly, lx + 1, ly2, STEEL[0]); }
            const [fx, fy] = X(sx * 8.0, 0.35); this.disc(fx, fy, Math.max(1.5, 0.22 * s), hex(0xff3a2e));         // wing-tip lights
        }
        // hull
        this.poly([X(-3.7, 2.0), X(3.7, 2.0), X(4.4, 0.2), X(3.4, -2.0), X(-3.4, -2.0), X(-4.4, 0.2)], tint(STEEL[3]), tint(STEEL[0]));
        this.poly([X(-3.7, 2.0), X(3.7, 2.0), X(3.9, 1.5), X(-3.9, 1.5)], tint(STEEL[4]), tint(STEEL[3]));
        for (const v of [0.85, -0.55, -1.4]) { const [l, y] = X(-4.2, v), [r] = X(4.2, v); this.rect(l, y, r, y + 1, STEEL[0]); }
        for (const sx of [-1, 1]) for (const v of [1.6, 0.4, -0.9]) { const [rx, ry] = X(sx * 3.9, v); this.rect(rx, ry, rx + 1, ry + 1, STEEL[4]); }
        // the bridge
        this.poly([X(-1.5, 2.0), X(1.5, 2.0), X(0.95, 3.2), X(-0.95, 3.2)], tint(STEEL[2]), tint(STEEL[1]));
        { const [ex, ey] = X(0, 2.55); this.rect(ex - 0.7 * s, ey, ex + 0.7 * s, ey + Math.max(1, 0.18 * s), hex(0xff3a2e)); }
        // the core, behind two shutters
        const core = b.parts.find((p) => p.main), open = b.open ? 1 : 0; b._ro = (b._ro || 0) + (open - (b._ro || 0)) * 0.12; const ro = b._ro;
        const [kx, ky] = X(0, -0.1), kr = 1.7 * s;
        this.disc(kx, ky, kr, hex(0x0a0c14));
        if (!core.dead) {
            const pulse = 0.6 + 0.4 * Math.sin(t * (a && a.name === 'ring' ? 22 : 5)), chg = a && a.name === 'ring' ? a.k : 0;
            if (ro > 0.05) { this.glow(kx, ky, kr * (1.8 + chg * 1.2), 255, 70 + 90 * chg, 30, 0.5 + 0.4 * pulse * ro); this.disc(kx, ky, kr * 0.78 * ro, mix(hex(0xff5018), hex(0xffe090), chg + 0.2 * pulse)); this.disc(kx, ky, kr * 0.4 * ro, hex(0xffffe0)); }
            const gap = ro * 1.45 * s;
            this.poly([[kx - kr - 1, ky - kr], [kx - gap, ky - kr], [kx - gap, ky + kr], [kx - kr - 1, ky + kr]], tint(STEEL[2]), tint(STEEL[1]));
            this.poly([[kx + gap, ky - kr], [kx + kr + 1, ky - kr], [kx + kr + 1, ky + kr], [kx + gap, ky + kr]], tint(STEEL[2]), tint(STEEL[1]));
            for (let i = 0; i < 4; i++) { const yy = ky - kr + (i + 0.5) * kr * 0.5; this.rect(kx - kr - 1, yy, kx - gap, yy + 1, hex(0xc8a030)); this.rect(kx + gap, yy, kx + kr + 1, yy + 1, hex(0xc8a030)); }
            weak(this, core, kx, ky, s);
        } else this.glow(kx, ky, kr * 1.4, 255, 120, 30, 0.5 + 0.3 * Math.sin(t * 17));
        // the turrets
        for (const p of b.parts) {
            if (p.kind !== 'turret') continue;
            const px = this.sx(p.x, z), py = this.sy(p.y, z), r = p.r * s;
            if (p.dead) { this.disc(px, py, r * 0.8, hex(0x1a1410)); this.glow(px, py, r * 1.4, 255, 90 + 40 * Math.sin(t * 13 + p.dx), 20, 0.4); continue; }
            const chg = a && a.name === 'volley' ? a.k : 0;
            this.glow(px, py, r * 1.8 + chg * r, 255, 50, 30, 0.2 + 0.7 * chg);
            this.disc(px, py, r, tint(STEEL[1])); this.disc(px, py, r * 0.8, tint(STEEL[3])); this.disc(px - r * 0.15, py - r * 0.2, r * 0.45, tint(STEEL[4]));
            this.rect(px - r * 0.18, py, px + r * 0.18 + 1, py + r * 0.95, tint(STEEL[0])); this.disc(px, py + r * 0.9, Math.max(1, r * 0.2), mix(hex(0x601410), hex(0xff6a30), chg));
            weak(this, p, px, py, s);
        }
        // the telegraphs: the safe place to be for the ring volley
        if (a && a.name === 'ring') { const sx2 = this.sx(a.safeX, ZS + 3), sy2 = this.sy(a.safeY, ZS + 3), q = 0.55 + 0.45 * Math.sin(t * 12); this.ring(sx2, sy2, 26 * K, 1.6 * K, 90 * q, 255 * q, 150 * q); this.ring(sx2, sy2, 17 * K, 1.2 * K, 60 * q, 220 * q, 120 * q); this.txt('SAFE', Math.round(sx2 - 8 * K), Math.round(sy2 - 3 * K), PixelFont.Small, pack(120, 255, 170), 2, hex(0x101020)); }
    };

    P.bossSerpent = function (b) {
        const t = this.t, a = b.atk, head = b.parts[0];
        // the fissure it came from: a glowing wound in the floor under it
        const gz = b.tz + 3, gx = this.sx(b.x * 0.5, gz), gy = this.sy(-GY, gz); this.glow(gx, gy, (70 * b.rise + 10) * K, 255, 90, 20, 0.35 * (0.6 + 0.4 * Math.sin(t * 4)));
        // far to near: the body (it undulates toward the camera), then the head if it is nearest
        const items = b.segs.map((s) => ({ z: s.z, seg: s })); items.push({ z: head.z, head: true });
        items.sort((p, q) => q.z - p.z);
        for (const it of items) {
            if (it.head) { this.serpHead(b, head, a, t); continue; }
            const g = it.seg, z = Math.max(4, g.z), s = F / z, x = this.sx(g.x, z), y = this.sy(g.y, z), r = g.r * s, i = g.i;
            this.glow(x, y, r * 1.9, 255, 100, 30, 0.6 + 0.2 * Math.sin(t * 3 + i));
            this.disc(x, y, r, hex(0x140806)); this.disc(x - r * 0.08, y - r * 0.1, r * 0.9, hex(0x8a3a22)); this.disc(x - r * 0.22, y - r * 0.28, r * 0.52, hex(0xc4643c));
            for (let q = 0; q < 6; q++) { const aa = q * 1.047 + i * 0.5 + 0.3; this.rect(x + Math.cos(aa) * r * 0.8, y + Math.sin(aa) * r * 0.8, x + Math.cos(aa) * r * 0.8 + Math.max(1, r * 0.12), y + Math.sin(aa) * r * 0.8 + Math.max(1, r * 0.12), (Math.floor(t * 5 + q + i) & 3) ? hex(0xff7a20) : hex(0xffd070)); }
            this.ring(x, y, r * 0.98, 1.5 * K, 255, 130, 50);
        }
    };
    P.serpHead = function (b, head, a, t) {
        const z = Math.max(3, head.z), s = F / z, x = this.sx(head.x, z), y = this.sy(head.y, z), r = head.r * s, flash = head.hit > 0 ? 0.6 : 0;
        const mouth = a && (a.name === 'spit' || a.name === 'lunge') ? a.k : 0.15 + 0.1 * Math.sin(t * 3);
        this.glow(x, y, r * 2.4, 255, 100, 30, 0.6 + 0.3 * mouth);
        // horns
        for (const sx of [-1, 1]) this.poly([[x + sx * r * 0.55, y - r * 0.6], [x + sx * r * 1.25, y - r * 1.25], [x + sx * r * 0.95, y - r * 0.3]], hex(0x4a2418), hex(0x1a0c08));
        this.disc(x, y, r, hex(0x2a1410)); this.disc(x - r * 0.1, y - r * 0.14, r * 0.9, flash ? mix(hex(0x6a3626), WHITE, flash) : hex(0x5a2c1e)); this.disc(x - r * 0.28, y - r * 0.32, r * 0.5, flash ? WHITE : hex(0x7a4430));
        // the jaw: a glowing mouth that opens wide to spit and to lunge
        const mh = r * (0.18 + 0.5 * mouth);
        this.poly([[x - r * 0.62, y + r * 0.2], [x + r * 0.62, y + r * 0.2], [x + r * 0.5, y + r * 0.2 + mh], [x - r * 0.5, y + r * 0.2 + mh]], mix(hex(0xff5a1a), hex(0xfff0a0), mouth), hex(0xff3a0a));
        for (let i = -2; i <= 2; i++) this.poly([[x + i * r * 0.22 - r * 0.08, y + r * 0.2], [x + i * r * 0.22 + r * 0.08, y + r * 0.2], [x + i * r * 0.22, y + r * 0.2 + r * 0.28]], hex(0xf0e8d0), hex(0xb8a888));
        // eyes
        for (const sx of [-1, 1]) { const ex = x + sx * r * 0.42, ey = y - r * 0.2; this.glow(ex, ey, r * 0.5, 255, 230, 90, 0.8); this.disc(ex, ey, Math.max(1.2, r * 0.17), hex(0xfff0a0)); }
        weak(this, head, x, y, s);
    };

    const wakeK = (r) => 0.4 + 0.6 * r;
    P.bossGuardian = function (b) {
        const t = this.t, a = b.atk, rise = b.rise, yo = -(1 - rise) * 8.5, z = b.z, zf = z - 1.8, zb = z + 1.8;
        // dust at its feet while it wakes
        if (rise < 1) this.glow(this.sx(b.x, z), this.sy(-GY, z), 60 * K, 200, 150, 90, 0.4 * (1 - rise));
        this.box(b.x - 2.3, b.x + 2.3, -GY + yo, 0.9 + yo, zf, zb, GUARD_STYLE);            // the shaft
        this.box(b.x - 6.7, b.x + 6.7, 0.2 + yo, 3.0 + yo, zf - 0.2, zb + 0.2, GUARD_STYLE);   // the bar
        this.box(b.x - 1.9, b.x + 1.9, 3.0 + yo, 5.8 + yo, zf - 0.1, zb, GUARD_STYLE);       // the head
        const zr = Math.max(4, zf - 0.2), s = F / zr;
        // carved glow on the shaft and the head (the stone's own marks), brightening as it wakes
        const wake = smooth(0.2, 1, rise), gx = this.sx(b.x, zr);
        for (let i = 0; i < 4; i++) { const yy = this.sy(-0.6 - i * 0.7 + yo, zr); this.rect(gx - 1.0 * s, yy, gx + 1.0 * s, yy + Math.max(1, 0.12 * s), pack(220 * wake, 150 * wake, 60 * wake)); }
        this.ring(gx, this.sy(4.4 + yo, zr), 0.8 * s, Math.max(1, 0.14 * s), 255 * wake, 190 * wake, 80 * wake);
        for (const sx of [-1, 1]) { const ex = this.sx(b.x + sx * 0.8, zr), ey = this.sy(4.3 + yo, zr); this.glow(ex, ey, 0.9 * s, 255, 200, 90, 0.6 * wake); this.disc(ex, ey, Math.max(1.2, 0.18 * s), pack(255, 250, 200)); }
        // the runes (the weak points) and the heart
        for (const p of b.parts) {
            const px = this.sx(p.x, zr), py = this.sy(p.y + yo, zr), r = p.r * s;
            const chg = a && (a.name === 'shards' || a.name === 'shards2') ? a.k : 0;
            if (p.dead) { this.ring(px, py, r * 0.9, 1.2, 70, 50, 40); this.glow(px, py, r * 1.5, 200, 90, 30, 0.25 + 0.15 * Math.sin(t * 9 + p.dx)); continue; }
            const ex = Boss.exposed(b, p), lit = p.kind === 'heart' ? (ex ? 1 : 0.3) : 0.8 + 0.2 * Math.sin(t * 4 + p.dx);
            this.glow(px, py, r * 2.2, 255 * lit, 190 * lit, 70 * lit, 0.5 + 0.3 * chg);
            this.ring(px, py, r, Math.max(1.4, 0.16 * s), 255 * lit, 200 * lit, 90 * lit); this.ring(px, py, r * 0.55, Math.max(1, 0.1 * s), 255 * lit, 230 * lit, 140 * lit);
            this.rect(px - r * 0.12, py - r, px + r * 0.12 + 1, py + r, pack(255 * lit, 210 * lit, 100 * lit)); this.rect(px - r, py - r * 0.1, px + r + 1, py + r * 0.1 + 1, pack(255 * lit, 210 * lit, 100 * lit));
            if (p.kind === 'heart' && ex) this.disc(px, py, r * 0.5 * (0.8 + 0.2 * Math.sin(t * 8)), pack(255, 250, 210));
            weak(this, p, px, py, s);
        }
        // the slam telegraph: the lane (the safe gap) lit along the ground, from the stone to you
        if (a && (a.name === 'slam' || a.name === 'slam2')) {
            const q = 0.5 + 0.5 * Math.sin(t * 14), k = a.k;
            for (const gxw of a.name === 'slam2' ? [a.gx, a.gx2] : [a.gx]) {
                const zn = ZS + 1.2, zfar = b.z - 1.5;
                this.poly([[this.sx(gxw - 1.7, zfar), this.sy(-GY, zfar)], [this.sx(gxw + 1.7, zfar), this.sy(-GY, zfar)], [this.sx(gxw + 1.7, zn), this.sy(-GY, zn)], [this.sx(gxw - 1.7, zn), this.sy(-GY, zn)]], pack(60 * (0.4 + 0.6 * k), 255 * (0.4 + 0.6 * k * q), 190 * (0.4 + 0.6 * k)), pack(30, 160 * k + 40, 120 * k + 20));
            }
            const cx0 = this.sx(b.x, zr), cy0 = this.sy(-GY, zr); this.glow(cx0, cy0, (70 * k + 10) * K, 255, 150, 60, 0.6 * k);
            this.txt('SLAM', Math.round(this.sx(a.gx, ZS + 3) - 8 * K), Math.round(this.sy(-GY, ZS + 3) - 10 * K), PixelFont.Small, pack(120, 255, 200), 2, hex(0x101020));
        }
    };


    // ---------------------------------------------------------------- the ship's shield: a ring while it is up, a crackle when it takes a hit, an arc filling while it recharges
    P.fxShield = function (sim, cx, cy) {
        const S = sim.ship, t = this.t, rad = 36 * K;
        if (S.shieldOn) {
            const a = 0.3 + 0.08 * Math.sin(t * 6) + (S.shieldUpFlash > 0 ? 0.7 * S.shieldUpFlash : 0);
            this.shieldRing(cx, cy, rad + (S.shieldUpFlash > 0 ? 8 * K * (1 - S.shieldUpFlash) : 0), a);
        }
        if (S.shieldFlash > 0) {
            const k = S.shieldFlash; this.shieldRing(cx, cy, rad + 6 * K * (1 - k), Math.min(1.3, k * 1.4)); this.glow(cx, cy, rad * 1.5, 80, 200, 255, 0.5 * k);
            for (let i = 0; i < 26; i++) { const a = G.hash2(i, Math.floor(t * 30), 31) * 6.2832, r = rad * (0.85 + 0.3 * G.hash2(i, 5, 31)); this.rect(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r, cx + Math.cos(a) * r * 1.15 + 2, cy + Math.sin(a) * r + 2, pack(220, 250, 255)); }
        }
        if (!S.shieldOn && S.alive) {
            const f = 1 - clamp(S.shieldT / sim.kn.shieldRecharge, 0, 1), n = 48, a0 = -Math.PI / 2;
            for (let i = 0; i < n; i++) {
                const th = a0 + (i / n) * 6.2832, on = i / n < f, px = Math.round(cx + Math.cos(th) * (rad + 1) * 1.2), py = Math.round(cy + Math.sin(th) * (rad + 1));
                if (on) { this.rect(px, py, px + 2, py + 2, pack(70, 215, 255)); this.addPx(px - 1, py, 10, 60, 90); this.addPx(px, py - 1, 10, 60, 90); } else if (i % 2 === 0) this.rect(px, py, px + 1, py + 1, pack(40, 95, 130));
            }
        }
    };

    // ---------------------------------------------------------------- score pop-ups
    P.fxPops = function (sim) {
        const f = PixelFont.Small, ar = PixelFont.Arcade;
        for (const p of sim.pops) {
            const z = Math.max(3, p.z), x = this.sx(p.x, z), y = this.sy(p.y, z), k = p.t / p.life, a = 1 - smooth(0.7, 1, k);
            if (a <= 0.02) continue;
            const c = p.kind === 0 ? pack(255, 244, 190) : p.kind === 1 ? ((Math.floor(this.t * 14) & 1) ? pack(255, 200, 60) : pack(255, 255, 255)) : p.kind === 2 ? pack(150, 245, 255) : pack(120, 255, 190);
            const font = p.kind >= 2 ? ar : f, ps = p.kind >= 2 ? 1 : 2, w = font.measure(p.text, ps), px = clamp(Math.round(x - w / 2), 2, W - w - 2), py = clamp(Math.round(y), 40 * K, H - 24 * K);
            this.txt(p.text, px, py, font, c, ps, hex(0x100810));
        }
    };

    // ---------------------------------------------------------------- the fight HUD
    P.fxHud = function (sim, s) {
        const t = this.t, S = sim.ship, dsp = PixelFont.Display, arc = PixelFont.Arcade, sm = PixelFont.Small;
        // the multiplier under the score
        if (sim.mult > 1) {
            const m = sim.mult, c = m >= 6 ? ((Math.floor(t * 12) & 1) ? pack(255, 120, 60) : pack(255, 230, 120)) : m >= 4 ? pack(255, 200, 60) : pack(255, 244, 190);
            this.ht('X' + m, 14, 30, dsp, c, 2, hex(0x201008));
            const w = 38 * clamp(sim.comboT / 2.4, 0, 1); this.hrect(14, 48, 14 + 38, 50, hex(0x302410)); this.hrect(14, 48, 14 + w, 50, c);
        }
        // the shield (a ring on the ship, a bar here)
        const by = 226;
        this.ht('SHLD', 112, by, sm, S.shieldOn ? hex(0x3CDCFF) : hex(0x5E88A8));
        { const k = S.shieldOn ? 1 : 1 - clamp(S.shieldT / sim.kn.shieldRecharge, 0, 1), f = S.shieldUpFlash > 0 ? 1 : 0; this.hrect(134, by, 134 + 40, by + 4, hex(0x14214E)); this.hrect(134, by, 134 + Math.round(40 * k), by + 4, S.shieldOn ? (f ? WHITE : hex(0x3CDCFF)) : hex(0x0E5470)); }
        // the boss's health bar
        const b = sim.boss;
        if (b) {
            const intro = b.state === 'intro' ? smooth(0, 1, 1 - b.introT / b.introDur) : 1, f = Boss.hpFrac(b) * intro, w = 156, x0 = 82, y0 = 32;
            this.hrect(x0 - 2, y0 - 2, x0 + w + 2, y0 + 8, hex(0x05060e)); this.hrect(x0 - 1, y0 - 1, x0 + w + 1, y0 + 7, hex(0x5E88A8)); this.hrect(x0, y0, x0 + w, y0 + 6, hex(0x2a0c10));
            const hot = b.hit > 0 || (b.parts.some((p) => p.hit > 0));
            this.hrect(x0, y0, x0 + Math.round(w * f), y0 + 6, hot ? hex(0xffe9b0) : f > 0.3 ? hex(0xff3a2e) : hex(0xff8a30)); this.hrect(x0, y0, x0 + Math.round(w * f), y0 + 2, hot ? WHITE : hex(0xff9a80));
            for (const q of [0.62, 0.3]) this.hrect(x0 + Math.round(w * q), y0 - 1, x0 + Math.round(w * q) + 1, y0 + 7, hex(0x05060e));
            this.htc(NAMES[b.act], 160, y0 + 11, sm, hex(0xFFF0B0), 1);
            if (b.state === 'fight' && !b.open && b.type !== 'serpent') this.htc(b.type === 'gunship' ? 'CORE SHIELDED - BREAK THE TURRETS' : 'HEART SEALED - BREAK THE RUNES', 160, y0 + 19, sm, hex(0x8a9ac0), 1);
        }
        // WARNING
        if (sim.warnT > 0 && b) {
            const k = sim.warnT / 2.4, a = smooth(0, 0.2, 1 - k) * (1 - smooth(0.85, 1, 1 - k)), blink = ((t * 4) % 1) < 0.72;
            const u = this.u, y0 = Math.round(78 * K), y1 = Math.round(118 * K), cw = 16 * K;
            for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const q = u[y * W + x]; u[y * W + x] = pack((q & 255) * 0.35 + 70 * a * 0.4, ((q >>> 8) & 255) * 0.3, ((q >>> 16) & 255) * 0.3); }
            for (let x = -((t * 40 * K) | 0) % cw; x < W; x += cw) { this.poly([[x, y0], [x + cw / 2, y0], [x + cw / 4, y0 + 4 * K], [x - cw / 4, y0 + 4 * K]], pack(255, 200, 40)); this.poly([[x, y1 - 4 * K], [x + cw / 2, y1 - 4 * K], [x + cw / 4, y1], [x - cw / 4, y1]], pack(255, 200, 40)); }
            if (blink || a < 1) this.htc('WARNING', 160, 78 + 9, dsp, pack(255, 70, 50), 3, hex(0x200808));
            this.htc(NAMES[b.act], 160, 78 + 31, arc, pack(255, 240, 190), 1);
        }
    };
}
