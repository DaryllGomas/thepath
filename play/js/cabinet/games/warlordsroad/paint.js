// THE NODE · world 1 · WARLORD'S ROAD · a tiny paint box for palette-indexed pictures (backdrops, cards).
// Everything is painted ONCE (at first use) into index canvases; the renderer only blits them.
// Deterministic: the "noise" is a hash of the coordinates, never a die.
import { CLEAR } from './raster.js';

export const BAYER = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

// a hash in [0, 1) of two ints and a salt
export function hash(x, y, s = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// smooth 1-D value noise in [0, 1)
export function noise1(x, s = 0) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(i, 0, s) * (1 - u) + hash(i + 1, 0, s) * u;
}

export class Cv {
    constructor(w, h, fill = CLEAR) { this.w = w; this.h = h; this.d = new Uint8Array(w * h).fill(fill); }

    px(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
    get(x, y) { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : CLEAR; }
    // paint only where something is already painted
    over(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] !== CLEAR) this.d[y * this.w + x] = c; }

    rect(x, y, w, h, c) {
        x = Math.floor(x); y = Math.floor(y);
        const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h);
        for (let j = y0; j < y1; j++) this.d.fill(c, j * this.w + x0, j * this.w + Math.max(x0, x1));
    }

    hline(x0, x1, y, c) { this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c); }
    vline(x, y0, y1, c) { this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c); }

    line(x0, y0, x1, y1, c) {
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let s = 0; s <= n; s++) this.px(x0 + (x1 - x0) * s / n, y0 + (y1 - y0) * s / n, c);
    }

    // Bayer-dithered fill: level 0 (none) .. 16 (solid)
    dither(x, y, w, h, c, level) {
        for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
            for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++)
                if (BAYER[(j & 3) * 4 + (i & 3)] < level) this.d[j * this.w + i] = c;
    }

    // a vertical sky: bands [[y, colour], ...] top down; each boundary is a 4-row dither ramp
    bands(x, w, list, ramp = 6) {
        for (let k = 0; k < list.length; k++) {
            const [y0, c] = list[k];
            const y1 = k + 1 < list.length ? list[k + 1][0] : this.h;
            this.rect(x, y0, w, y1 - y0, c);
            if (k + 1 < list.length) {
                const cn = list[k + 1][1];
                for (let r = 0; r < ramp; r++) {
                    const lvl = Math.round((r + 1) * 16 / (ramp + 1));
                    this.dither(x, y1 - ramp + r, w, 1, cn, lvl);
                }
            }
        }
    }

    poly(pts, c) {
        let y0 = 1e9, y1 = -1e9;
        for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
        y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(this.h - 1, Math.ceil(y1));
        const xs = [];
        for (let y = y0; y <= y1; y++) {
            const cy = y + 0.5;
            xs.length = 0;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const a = pts[i], b = pts[j];
                if ((a[1] > cy) !== (b[1] > cy)) xs.push(a[0] + (cy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
            }
            xs.sort((p, q) => p - q);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const xa = Math.max(0, Math.round(xs[k])), xb = Math.min(this.w, Math.round(xs[k + 1]));
                if (xb > xa) this.d.fill(c, y * this.w + xa, y * this.w + xb);
            }
        }
    }

    ellipse(cx, cy, rx, ry, c) {
        for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
            const v = (j + 0.5 - cy) / ry;
            if (v * v > 1) continue;
            const hw = rx * Math.sqrt(1 - v * v);
            this.rect(Math.round(cx - hw), j, Math.round(cx + hw) - Math.round(cx - hw), 1, c);
        }
    }

    circle(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }

    // stamp a raster Sprite (palette indices) at (x, y) = its origin
    sprite(s, x, y, flip = false, only = -1) {
        for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
            const v = s.data[j * s.w + (flip ? s.w - 1 - i : i)];
            if (v !== CLEAR) this.px(x - (flip ? s.w - 1 - s.ax : s.ax) + i, y - s.ay + j, only >= 0 ? only : v);
        }
    }

    // outline every painted region with c (1 px, outside)
    outline(c) {
        const w = this.w, h = this.h, d = this.d, m = new Uint8Array(w * h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const k = j * w + i;
            if (d[k] !== CLEAR) continue;
            if ((i > 0 && d[k - 1] !== CLEAR) || (i < w - 1 && d[k + 1] !== CLEAR) || (j > 0 && d[k - w] !== CLEAR) || (j < h - 1 && d[k + w] !== CLEAR)) m[k] = 1;
        }
        for (let k = 0; k < w * h; k++) if (m[k]) d[k] = c;
    }
}
