// THE NODE · world 1 · WARLORD'S ROAD · the sprite RASTERIZER: shaded primitives -> a palette-indexed sprite.
//
// A character is built as a list of primitives in model space (facing RIGHT, the ground point between the
// feet at (0,0), y DOWN). Each primitive carries a four-step ramp and a GROUP (its layer; higher = nearer).
// raster() paints them back to front, shading each pixel from a sphere/cylinder normal against one light
// (above, in front), then draws a dark line where a nearer group overlaps a farther one and a 1 px ink
// outline round the whole silhouette: the hard-edged, outlined look of a late-'80s board sprite.
//
//   cap(ax,ay,bx,by, ra,rb, ramp, g, shift)     a capsule (limbs, hafts, necks)
//   ell(cx,cy, rx,ry, rotDeg, ramp, g, shift)   a rotated ellipse (heads, chests, bellies)
//   poly(points, ramp, g, tone, bevel)          a flat polygon, lit top edge / dark bottom edge
//   blade(ax,ay,bx,by, hw, ramp, g, tip)        a sword blade: lit edge, dark edge, fuller, point
//   marks: [x, y, paletteIndex] pixels painted over (eyes, brows, rivets, rib lines)
// "shift" darkens the ramp by one step (the far arm and leg). Sprites store palette indices; 255 = clear.
// No DOM, no Node: runs in the browser and in the Lab. A pure function of its input (no dice).
import { C } from './palette.js';

export const CLEAR = 255;

export class Sprite {
    constructor(w, h, ax, ay, data) {
        this.w = w; this.h = h;          // size in pixels
        this.ax = ax; this.ay = ay;      // the model origin (ground point) inside the sprite
        this.data = data;                // Uint8Array w*h of palette indices, CLEAR = transparent
    }
}

const LX = 0.45, LY = -0.62, LZ = 0.64;   // the light: above and in front
const LN = Math.hypot(LX, LY, LZ);
const lx = LX / LN, ly = LY / LN, lz = LZ / LN;

function toneOf(nx, ny, nz) {
    const s = nx * lx + ny * ly + nz * lz;
    return s > 0.86 ? 3 : s > 0.42 ? 2 : s > -0.05 ? 1 : 0;
}

export const cap = (ax, ay, bx, by, ra, rb, ramp, g, shift = 0) => ({ t: 0, ax, ay, bx, by, ra, rb, ramp, g, shift });
export const ell = (cx, cy, rx, ry, rot, ramp, g, shift = 0) => ({ t: 1, cx, cy, rx, ry, rot: rot * Math.PI / 180, ramp, g, shift });
export const poly = (pts, ramp, g, tone = 2, bevel = true) => ({ t: 2, pts, ramp, g, tone, bevel });
export const blade = (ax, ay, bx, by, hw, ramp, g, tip = 0.3) => ({ t: 3, ax, ay, bx, by, hw, ramp, g, tip });

function bounds(p) {
    switch (p.t) {
        case 0: { const r = Math.max(p.ra, p.rb); return [Math.min(p.ax, p.bx) - r, Math.min(p.ay, p.by) - r, Math.max(p.ax, p.bx) + r, Math.max(p.ay, p.by) + r]; }
        case 1: { const r = Math.max(p.rx, p.ry); return [p.cx - r, p.cy - r, p.cx + r, p.cy + r]; }
        case 2: { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of p.pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; }
        default: return [Math.min(p.ax, p.bx) - p.hw, Math.min(p.ay, p.by) - p.hw, Math.max(p.ax, p.bx) + p.hw, Math.max(p.ay, p.by) + p.hw];
    }
}

// scale every coordinate of a primitive list (and its marks) about the origin
export function scalePrims(prims, marks, k) {
    if (k === 1) return;
    for (const p of prims) {
        switch (p.t) {
            case 0: p.ax *= k; p.ay *= k; p.bx *= k; p.by *= k; p.ra *= k; p.rb *= k; break;
            case 1: p.cx *= k; p.cy *= k; p.rx *= k; p.ry *= k; break;
            case 2: p.pts = p.pts.map(([x, y]) => [x * k, y * k]); break;
            default: p.ax *= k; p.ay *= k; p.bx *= k; p.by *= k; p.hw *= k; break;
        }
    }
    for (const m of marks) { m[0] *= k; m[1] *= k; if (m.length > 3) { m[3] *= k; m[4] *= k; } }
}

function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

// marks: [x, y, c] one pixel, or [x0, y0, c, x1, y1] a line; painted over opaque pixels only
export function raster(prims, marks = [], opts = {}) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of prims) {
        const b = bounds(p);
        x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    const pad = 2;
    const ox = Math.floor(x0) - pad, oy = Math.floor(y0) - pad;
    const w = Math.ceil(x1) - ox + pad + 1, h = Math.ceil(y1) - oy + pad + 1;
    const idx = new Uint8Array(w * h).fill(CLEAR);
    const grp = new Uint8Array(w * h);

    for (const p of prims) {
        const b = bounds(p);
        const i0 = Math.max(0, Math.floor(b[0]) - ox), i1 = Math.min(w - 1, Math.ceil(b[2]) - ox);
        const j0 = Math.max(0, Math.floor(b[1]) - oy), j1 = Math.min(h - 1, Math.ceil(b[3]) - oy);
        const ramp = p.ramp, sh = p.shift || 0;
        if (p.t === 0) {
            const dx = p.bx - p.ax, dy = p.by - p.ay, L2 = dx * dx + dy * dy || 1e-9;
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const cx = i + ox + 0.5, cy = j + oy + 0.5;
                let t = ((cx - p.ax) * dx + (cy - p.ay) * dy) / L2;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                const ex = cx - (p.ax + dx * t), ey = cy - (p.ay + dy * t), r = p.ra + (p.rb - p.ra) * t;
                const d2 = ex * ex + ey * ey;
                if (d2 > r * r) continue;
                const nx = ex / r, ny = ey / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
                const k = j * w + i;
                idx[k] = ramp[Math.max(0, toneOf(nx, ny, nz) - sh)]; grp[k] = p.g;
            }
        } else if (p.t === 1) {
            const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const qx = i + ox + 0.5 - p.cx, qy = j + oy + 0.5 - p.cy;
                const u = (qx * cs + qy * sn) / p.rx, v = (-qx * sn + qy * cs) / p.ry;
                const d2 = u * u + v * v;
                if (d2 > 1) continue;
                const nx = u * cs - v * sn, ny = u * sn + v * cs, nz = Math.sqrt(Math.max(0, 1 - d2));
                const k = j * w + i;
                idx[k] = ramp[Math.max(0, toneOf(nx, ny, nz) - sh)]; grp[k] = p.g;
            }
        } else if (p.t === 2) {
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const cx = i + ox + 0.5, cy = j + oy + 0.5;
                if (!inPoly(p.pts, cx, cy)) continue;
                let tone = p.tone;
                if (p.bevel) {
                    if (!inPoly(p.pts, cx, cy - 1)) tone++;
                    else if (!inPoly(p.pts, cx, cy + 1) || !inPoly(p.pts, cx - 1, cy)) tone--;
                }
                const k = j * w + i;
                idx[k] = ramp[Math.max(0, Math.min(3, tone))]; grp[k] = p.g;
            }
        } else {
            const dx = p.bx - p.ax, dy = p.by - p.ay, L = Math.hypot(dx, dy) || 1e-9;
            const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
            const litSide = nx * lx + ny * ly > 0 ? 1 : -1;
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                const cx = i + ox + 0.5 - p.ax, cy = j + oy + 0.5 - p.ay;
                const along = cx * ux + cy * uy, side = cx * nx + cy * ny;
                if (along < 0 || along > L) continue;
                const f = along / L;
                const hw = f < 1 - p.tip ? p.hw : p.hw * (1 - f) / p.tip;
                if (Math.abs(side) > hw + 0.05) continue;
                const s = side * litSide;
                let tone = s > hw * 0.3 ? 3 : s < -hw * 0.45 ? 1 : 2;
                if (p.hw >= 1.9 && Math.abs(side) < 0.5 && f > 0.06 && f < 0.62) tone = 1;   // the fuller
                const k = j * w + i;
                idx[k] = p.ramp[tone]; grp[k] = p.g;
            }
        }
    }

    // marks (eyes, brows, rivets): only over paint
    const mark = (x, y, c) => {
        const i = Math.floor(x) - ox, j = Math.floor(y) - oy;
        if (i < 0 || j < 0 || i >= w || j >= h) return;
        const k = j * w + i;
        if (idx[k] !== CLEAR) idx[k] = c;
    };
    for (const m of marks) {
        if (m.length <= 3) { mark(m[0], m[1], m[2]); continue; }
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(m[3] - m[0]), Math.abs(m[4] - m[1]))));
        for (let s = 0; s <= n; s++) mark(m[0] + (m[3] - m[0]) * s / n, m[1] + (m[4] - m[1]) * s / n, m[2]);
    }

    // a dark line where a nearer group overlaps a farther one
    const ink = opts.ink !== undefined ? opts.ink : C.ink;
    if (opts.inner !== false) {
        const line = new Uint8Array(w * h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const k = j * w + i, g = grp[k];
            if (g === 0) continue;
            if ((i > 0 && grp[k - 1] > g) || (i < w - 1 && grp[k + 1] > g) || (j > 0 && grp[k - w] > g) || (j < h - 1 && grp[k + w] > g)) line[k] = 1;
        }
        for (let k = 0; k < w * h; k++) if (line[k]) idx[k] = ink;
    }
    // the silhouette outline
    const out = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (idx[k] !== CLEAR) continue;
        if ((i > 0 && idx[k - 1] !== CLEAR) || (i < w - 1 && idx[k + 1] !== CLEAR) || (j > 0 && idx[k - w] !== CLEAR) || (j < h - 1 && idx[k + w] !== CLEAR)) out[k] = 1;
    }
    for (let k = 0; k < w * h; k++) if (out[k]) idx[k] = ink;
    return new Sprite(w, h, -ox, -oy, idx);
}
