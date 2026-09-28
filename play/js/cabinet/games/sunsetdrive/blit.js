// THE NODE · world 1 · SUNSET DRIVE · fast drawing helpers (this game's own; the SDK stays untouched).
//
// The road and the sprite scaler write packed RGBA straight into a Uint32Array view of the surface
// (PixelSurface.data is the public buffer), always inside the 8 px safe area. Colours are packed
// palette entries (palette.js P()), so nothing off-palette can ever be written.
//   u32Of(surface)                        the cached Uint32Array view
//   hspan(u, y, x0, x1, c)                one row, [x0, x1) rounded, clipped to the view
//   blitScaled(u, spr, x, y, w, h, flip, clipTop, clipBottom)   nearest-neighbour sprite scaler
//   Spr                                   a packed sprite (0 = transparent)
//   Canvas                                build sprites at load time: pixels, lines, discs, polygons, text
import { VIEW_X0, VIEW_Y0, VIEW_X1, VIEW_Y1 } from './constants.js';

const views = new WeakMap();
export function u32Of(s) {
    let v = views.get(s);
    if (!v) { v = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height); views.set(s, v); }
    return v;
}

export const W = 320;

export function hspan(u, y, x0, x1, c) {
    if (y < VIEW_Y0 || y >= VIEW_Y1 || !(x1 > x0)) return;           // (also refuses NaN: fill() would start at 0)
    let a = Math.round(x0), b = Math.round(x1);
    if (a < VIEW_X0) a = VIEW_X0;
    if (b > VIEW_X1) b = VIEW_X1;
    if (b <= a) return;
    u.fill(c, y * W + a, y * W + b);
}

// a vertical run [y0, y1) at column x
export function vspan(u, x, y0, y1, c) {
    if (x < VIEW_X0 || x >= VIEW_X1) return;
    if (y0 < VIEW_Y0) y0 = VIEW_Y0;
    if (y1 > VIEW_Y1) y1 = VIEW_Y1;
    for (let y = y0, o = y0 * W + x; y < y1; y++, o += W) u[o] = c;
}

export function px(u, x, y, c) {
    if (x < VIEW_X0 || x >= VIEW_X1 || y < VIEW_Y0 || y >= VIEW_Y1) return;
    u[y * W + x] = c;
}

export function box(u, x, y, w, h, c) {
    for (let j = 0; j < h; j++) hspan(u, y + j, x, x + w, c);
}

export class Spr {
    constructor(w, h) { this.w = w; this.h = h; this.px = new Uint32Array(w * h); }
}

const COLS = new Int32Array(W);

// Draw spr scaled into the box (x, y, w, h) (floats: the box is rounded once), mirrored if flip.
// Rows outside [clipTop, clipBottom) are skipped: that is how a crest hides the far side of the road.
export function blitScaled(u, spr, x, y, w, h, flip = false, clipTop = VIEW_Y0, clipBottom = VIEW_Y1) {
    const x0 = Math.round(x), y0 = Math.round(y);
    let dw = Math.round(x + w) - x0, dh = Math.round(y + h) - y0;
    if (dw < 1) dw = 1;
    if (dh < 1) dh = 1;
    const cx0 = x0 < VIEW_X0 ? VIEW_X0 : x0, cx1 = x0 + dw > VIEW_X1 ? VIEW_X1 : x0 + dw;
    let cy0 = y0 < clipTop ? clipTop : y0, cy1 = y0 + dh > clipBottom ? clipBottom : y0 + dh;
    if (cy0 < VIEW_Y0) cy0 = VIEW_Y0;
    if (cy1 > VIEW_Y1) cy1 = VIEW_Y1;
    if (cx0 >= cx1 || cy0 >= cy1) return;
    const sw = spr.w, sh = spr.h, src = spr.px;
    const kx = sw / dw, ky = sh / dh;
    for (let xx = cx0; xx < cx1; xx++) {
        let sx = ((xx - x0 + 0.5) * kx) | 0;
        if (sx >= sw) sx = sw - 1;
        COLS[xx] = flip ? sw - 1 - sx : sx;
    }
    for (let yy = cy0; yy < cy1; yy++) {
        let sy = ((yy - y0 + 0.5) * ky) | 0;
        if (sy >= sh) sy = sh - 1;
        const row = sy * sw, o = yy * W;
        for (let xx = cx0; xx < cx1; xx++) {
            const p = src[row + COLS[xx]];
            if (p !== 0) u[o + xx] = p;
        }
    }
}

// 1:1 blit (the player's car, the clouds): no scaling, clipped to the view
export function blit1(u, spr, x, y, flip = false) {
    const x0 = Math.round(x), y0 = Math.round(y), sw = spr.w, src = spr.px;
    for (let j = 0; j < spr.h; j++) {
        const yy = y0 + j;
        if (yy < VIEW_Y0 || yy >= VIEW_Y1) continue;
        const o = yy * W, row = j * sw;
        for (let i = 0; i < sw; i++) {
            const xx = x0 + i;
            if (xx < VIEW_X0 || xx >= VIEW_X1) continue;
            const p = src[row + (flip ? sw - 1 - i : i)];
            if (p !== 0) u[o + xx] = p;
        }
    }
}

// ------------------------------------------------------------------ building sprites at load time
export class Canvas extends Spr {
    set(x, y, c) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        this.px[y * this.w + x] = c;
    }
    get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x]; }
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
    hline(x0, x1, y, c) { for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, c); }
    line(x0, y0, x1, y1, c) {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy, guard = 0;
        while (guard++ < 2048) {
            this.set(x0, y0, c);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
    // a filled ellipse centred on (cx, cy) (floats; a pixel is in when its centre is)
    ellipse(cx, cy, rx, ry, c) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
            for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
                if (u * u + v * v <= 1) this.set(x, y, c);
            }
    }
    disc(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
    // filled polygon [[x,y],...] (even-odd, pixel centres)
    poly(pts, c) {
        let y0 = Infinity, y1 = -Infinity;
        for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
        for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
            const yc = y + 0.5, xs = [];
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
            }
            xs.sort((p, q) => p - q);
            for (let k = 0; k + 1 < xs.length; k += 2)
                for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c);
        }
    }
    // text from an SDK PixelFont
    text(s, x, y, font, c, scale = 1) {
        for (let k = 0; k < s.length; k++) {
            const g = font.glyph(s[k]);
            if (g !== null)
                for (let row = 0; row < font.cellH; row++)
                    for (let col = 0; col < font.cellW; col++)
                        if ((g[row] & (1 << (font.cellW - 1 - col))) !== 0) this.rect(x + col * scale, y + row * scale, scale, scale, c);
            x += font.advance * scale;
        }
    }
    textW(s, font, scale = 1) { return (s.length * font.advance - (font.advance - font.cellW)) * scale; }
    // a 1 px outline in c around every opaque pixel (on transparent neighbours only)
    outline(c) {
        const w = this.w, h = this.h, src = this.px.slice();
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                if (src[y * w + x] !== 0) continue;
                if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) || (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x]))
                    this.px[y * w + x] = c;
            }
        return this;
    }
    // replace one colour by another everywhere (colour variants of one drawing)
    recolor(map) {
        const out = new Canvas(this.w, this.h);
        for (let i = 0; i < this.px.length; i++) { const p = this.px[i]; out.px[i] = map.has(p) ? map.get(p) : p; }
        return out;
    }
    mirrorX() {
        const out = new Canvas(this.w, this.h);
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.px[y * this.w + x] = this.px[y * this.w + this.w - 1 - x];
        return out;
    }
    // copy the left half onto the right, mirrored (symmetric drawings: cars from behind)
    symmetric() {
        const h2 = this.w >> 1;
        for (let y = 0; y < this.h; y++) for (let x = 0; x < h2; x++) this.px[y * this.w + this.w - 1 - x] = this.px[y * this.w + x];
        return this;
    }
    // stamp rows of letters through a map { letter: packed }
    rows(rows, map, ox = 0, oy = 0) {
        for (let j = 0; j < rows.length; j++)
            for (let i = 0; i < rows[j].length; i++) {
                const ch = rows[j][i];
                if (ch === '.' || ch === ' ') continue;
                const c = map[ch];
                if (c === undefined) throw new Error('sunsetdrive art: no colour for ' + ch);
                this.set(ox + i, oy + j, c);
            }
        return this;
    }
}

// deterministic 0..1 hash (drawing never rolls the sim's dice)
export function h01(a, b = 0) {
    let h = Math.imul(a ^ Math.imul(b + 1, 0x9E3779B1), 0x85EBCA6B);
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}
