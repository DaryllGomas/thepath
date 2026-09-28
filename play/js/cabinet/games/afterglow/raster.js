// THE NODE · world 1 · AFTERGLOW · THE SPRITE WORKSHOP: low-poly models baked into palette sprites, and the
// scaled + rotated blitter that throws them at the tube.
//
// This is how 1987 did it: the art was drawn from 3D references into sprites at a handful of angles, and
// the board scaled them. Here the references are tiny meshes (models.js) that a flat-shaded, z-buffered
// software rasterizer bakes ONCE (lazily, cached per angle) into palette-indexed sprites with a 1 px ink
// outline. Every frame after that is only nearest-neighbour scaled/rotated blits: chunky when a jet comes
// close, a speck at the horizon. Lighting is fixed in VIEW space (top-left, like hand-drawn sprites), each
// material is a 4-step ramp (bright > dark), so nothing ever leaves the palette.
//
//   Mesh        vert(), poly(mat, [i...], bias); builders loft / slab / fin / box / tube
//   bake(mesh, {roll, pitch, yaw, elev, scale, mats, ink, pts, edges}) -> Sprite {w, h, ax, ay, px, pts}
//   cached(key, make)                        one bake per key, for the life of the page
//   Screen      a Uint32 view of a PixelSurface with the 8 px safe-area clip
//   blit(sc, spr, cx, cy, scale, angle, remap, tint)   anchor at (cx, cy), angle clockwise (y down)
import { PAL32 } from './palette.js';

// ------------------------------------------------------------------ meshes
export class Mesh {
    constructor() { this.v = []; this.f = []; }
    vert(x, y, z) { this.v.push(x, y, z); return this.v.length / 3 - 1; }
    poly(mat, idx, bias = 0) { this.f.push({ mat, idx, bias }); }
}

// a lofted body along z: stations {z, w, h, y=0, x=0, mat?}; rings of `sides` points (flat top/bottom when
// sides is even). half = the upper half only (a canopy). caps: capFront / capBack = material names.
export function loft(m, mat, st, sides, o = {}) {
    const rings = [];
    const n = o.half ? sides + 1 : sides;
    for (const s of st) {
        const ring = [];
        for (let k = 0; k < n; k++) {
            const a = o.half ? Math.PI * k / sides : (k + 0.5) / sides * Math.PI * 2;
            ring.push(m.vert((s.x || 0) + s.w * Math.cos(a), (s.y || 0) + s.h * Math.sin(a), s.z));
        }
        rings.push(ring);
    }
    for (let i = 0; i + 1 < rings.length; i++) {
        const a = rings[i], b = rings[i + 1], mt = st[i].mat || mat;
        for (let k = 0; k < sides; k++) {
            const k1 = o.half ? k + 1 : (k + 1) % sides;
            m.poly(mt, [a[k], a[k1], b[k1], b[k]], o.bias || 0);
        }
    }
    if (o.capFront) m.poly(o.capFront, [...rings[0]].reverse(), o.bias || 0);
    if (o.capBack) m.poly(o.capBack, rings[rings.length - 1], (o.bias || 0) - 0.02);
    return rings;
}

// a flat plate (wing, stabiliser): coplanar polygon pts [[x,y,z]...], thickened along axis (unit vector)
export function slab(m, mat, pts, axis, thick, mirror = false, bias = 0, edgeMat = null) {
    const make = sx => {
        const h = thick / 2, top = [], bot = [];
        for (const p of pts) {
            top.push(m.vert(sx * p[0] + sx * axis[0] * h, p[1] + axis[1] * h, p[2] + axis[2] * h));
            bot.push(m.vert(sx * p[0] - sx * axis[0] * h, p[1] - axis[1] * h, p[2] - axis[2] * h));
        }
        m.poly(mat, top, bias);
        m.poly(mat, [...bot].reverse(), bias);
        for (let i = 0; i < pts.length; i++) {
            const j = (i + 1) % pts.length;
            m.poly(edgeMat || mat, [top[i], top[j], bot[j], bot[i]], bias);
        }
    };
    make(1);
    if (mirror) make(-1);
}

// a fin: outline [[z, y]...] standing at x, canted outward by `cant` radians (x grows with height)
export function fin(m, mat, zy, x, cant, thick, mirror = false, bias = 0) {
    const y0 = zy[0][1], t = Math.tan(cant);
    const pts = zy.map(([z, y]) => [x + (y - y0) * t, y, z]);
    const c = Math.cos(cant), s = Math.sin(cant);
    slab(m, mat, pts, [c, -s, 0], thick, mirror, bias);
}

export function box(m, mat, x0, x1, y0, y1, z0, z1, frontMat = null, backMat = null, bias = 0) {
    const v = [
        m.vert(x0, y0, z0), m.vert(x1, y0, z0), m.vert(x1, y1, z0), m.vert(x0, y1, z0),
        m.vert(x0, y0, z1), m.vert(x1, y0, z1), m.vert(x1, y1, z1), m.vert(x0, y1, z1),
    ];
    m.poly(backMat || mat, [v[0], v[1], v[2], v[3]], bias);   // z0 face
    m.poly(frontMat || mat, [v[5], v[4], v[7], v[6]], bias);  // z1 face
    m.poly(mat, [v[4], v[5], v[1], v[0]], bias);              // bottom
    m.poly(mat, [v[3], v[2], v[6], v[7]], bias);              // top
    m.poly(mat, [v[4], v[0], v[3], v[7]], bias);              // x0 side
    m.poly(mat, [v[1], v[5], v[6], v[2]], bias);              // x1 side
}

// a tube along z from z0 (front) to z1 (back), radius r0 > r1, with a back cap (e.g. a glowing nozzle)
export function tube(m, mat, x, y, z0, z1, r0, r1, sides, capMat, bias = 0) {
    loft(m, mat, [{ z: z0, w: r0, h: r0, x, y }, { z: z1, w: r1, h: r1, x, y }], sides, { capBack: capMat, capFront: mat, bias });
}

// ------------------------------------------------------------------ the bake
const LIGHT = (() => { const l = [-0.42, 0.78, -0.46]; const n = Math.hypot(...l); return l.map(v => v / n); })();

export function bake(mesh, o) {
    const scale = o.scale, margin = 2;
    const cr = Math.cos(o.roll || 0), sr = Math.sin(o.roll || 0);
    const cp = Math.cos(o.pitch || 0), sp = Math.sin(o.pitch || 0);
    const cy = Math.cos(o.yaw || 0), sy = Math.sin(o.yaw || 0);
    const ce = Math.cos(o.elev || 0), se = Math.sin(o.elev || 0);
    const xf = (x, y, z) => {
        const x1 = x * cr + y * sr, y1 = -x * sr + y * cr, z1 = z;           // roll: +roll = right wing down
        const y2 = y1 * cp + z1 * sp, z2 = -y1 * sp + z1 * cp;               // pitch: +pitch = nose up
        const x3 = x1 * cy + z2 * sy, z3 = -x1 * sy + z2 * cy;               // yaw: +yaw = nose right, PI = head-on
        const y4 = y2 * ce + z3 * se, z4 = -y2 * se + z3 * ce;               // view elevation: seen from above
        return [x3, y4, z4];
    };
    const nv = mesh.v.length / 3;
    const T = new Float64Array(nv * 3);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < nv; i++) {
        const p = xf(mesh.v[i * 3], mesh.v[i * 3 + 1], mesh.v[i * 3 + 2]);
        T[i * 3] = p[0] * scale; T[i * 3 + 1] = -p[1] * scale; T[i * 3 + 2] = p[2];
        minX = Math.min(minX, T[i * 3]); maxX = Math.max(maxX, T[i * 3]);
        minY = Math.min(minY, T[i * 3 + 1]); maxY = Math.max(maxY, T[i * 3 + 1]);
    }
    const ox = Math.ceil(-minX) + margin, oy = Math.ceil(-minY) + margin;
    const w = Math.ceil(maxX) + ox + margin + 1, h = Math.ceil(maxY) + oy + margin + 1;
    const px = new Int16Array(w * h).fill(-1);
    const zb = new Float32Array(w * h).fill(Infinity);

    for (const f of mesh.f) {
        const ids = f.idx;
        if (ids.length < 3) continue;
        // Newell normal in view space (y up, unscaled depth)
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < ids.length; k++) {
            const a = ids[k], b = ids[(k + 1) % ids.length];
            const ax = T[a * 3], ay = -T[a * 3 + 1], az = T[a * 3 + 2] * scale;
            const bx = T[b * 3], by = -T[b * 3 + 1], bz = T[b * 3 + 2] * scale;
            nx += (ay - by) * (az + bz); ny += (az - bz) * (ax + bx); nz += (ax - bx) * (ay + by);
        }
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-9) continue;
        nx /= nl; ny /= nl; nz /= nl;
        if (nz > 0) { nx = -nx; ny = -ny; nz = -nz; }            // the side we see faces the camera (-z)
        const ramp = o.mats[f.mat];
        if (!ramp) throw new Error('bake: no material ' + f.mat);
        const lit = 0.18 + 0.82 * Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        const lv = lit >= 0.8 ? 0 : lit >= 0.56 ? 1 : lit >= 0.34 ? 2 : 3;
        const col = ramp[lv];
        const bias = f.bias || 0;
        for (let k = 1; k + 1 < ids.length; k++) tri(T, ids[0], ids[k], ids[k + 1], ox, oy, w, h, px, zb, col, bias);
    }
    // internal edges: a depth step across a pixel boundary inks the far pixel (big models only)
    if (o.edges) {
        const out = px.slice();
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (px[i] < 0) continue;
                const z = zb[i];
                if (x + 1 < w && px[i + 1] >= 0 && Math.abs(zb[i + 1] - z) > o.edges) out[zb[i + 1] > z ? i + 1 : i] = o.ink;
                if (y + 1 < h && px[i + w] >= 0 && Math.abs(zb[i + w] - z) > o.edges) out[zb[i + w] > z ? i + w : i] = o.ink;
            }
        px.set(out);
    }
    // the ink outline around the silhouette
    if (o.ink !== undefined && o.ink !== null) {
        const out = px.slice();
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (px[i] >= 0) continue;
                if ((x > 0 && px[i - 1] >= 0) || (x + 1 < w && px[i + 1] >= 0) || (y > 0 && px[i - w] >= 0) || (y + 1 < h && px[i + w] >= 0)) out[i] = o.ink;
            }
        px.set(out);
    }
    const pts = (o.pts || []).map(p => { const q = xf(p[0], p[1], p[2]); return [q[0] * scale, -q[1] * scale, q[2]]; });
    return { w, h, ax: ox, ay: oy, px, pts, scale };
}

function tri(T, a, b, c, ox, oy, w, h, px, zb, col, bias) {
    const x0 = T[a * 3] + ox, y0 = T[a * 3 + 1] + oy, z0 = T[a * 3 + 2] + bias;
    const x1 = T[b * 3] + ox, y1 = T[b * 3 + 1] + oy, z1 = T[b * 3 + 2] + bias;
    const x2 = T[c * 3] + ox, y2 = T[c * 3 + 1] + oy, z2 = T[c * 3 + 2] + bias;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;
    const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
    const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
    const inv = 1 / area;
    for (let y = miny; y <= maxy; y++) {
        const py = y + 0.5;
        for (let x = minx; x <= maxx; x++) {
            const qx = x + 0.5;
            const w0 = ((x1 - qx) * (y2 - py) - (x2 - qx) * (y1 - py)) * inv;
            const w1 = ((x2 - qx) * (y0 - py) - (x0 - qx) * (y2 - py)) * inv;
            const w2 = 1 - w0 - w1;
            if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
            const z = w0 * z0 + w1 * z1 + w2 * z2;
            const i = y * w + x;
            if (z < zb[i]) { zb[i] = z; px[i] = col; }
        }
    }
}

// ------------------------------------------------------------------ the cache
const CACHE = new Map();
export function cached(key, make) {
    let s = CACHE.get(key);
    if (s === undefined) { s = make(); CACHE.set(key, s); }
    return s;
}

// ------------------------------------------------------------------ the tube
// A Uint32 view of a PixelSurface plus the safe-area clip (the outer 8 px stay background).
export class Screen {
    constructor() { this.surface = null; this.u32 = null; this.W = 320; this.x0 = 8; this.y0 = 8; this.x1 = 312; this.y1 = 232; }
    bind(s) {
        if (this.surface !== s || this.u32 === null || this.u32.buffer !== s.data.buffer) {
            this.surface = s;
            this.u32 = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height);
            this.W = s.width;
        }
        return this;
    }
}

// Blit a sprite with its anchor at (cx, cy), scaled and rotated clockwise by `angle` (screen y down).
// remap: palette-index -> palette-index table (a recolour); tint >= 0 draws the silhouette in one colour;
// dither = every other pixel (a checkerboard: the 1987 shadow).
export function blit(sc, spr, cx, cy, scale, angle = 0, remap = null, tint = -1, dither = false) {
    if (!(scale > 0.015) || spr == null) return;
    const ca = Math.cos(angle), sa = Math.sin(angle), inv = 1 / scale;
    const l = -spr.ax * scale, t = -spr.ay * scale, r = (spr.w - spr.ax) * scale, b = (spr.h - spr.ay) * scale;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    const cs = [l, t, r, t, l, b, r, b];
    for (let k = 0; k < 8; k += 2) {
        const qx = cs[k], qy = cs[k + 1];
        const dx = qx * ca - qy * sa, dy = qx * sa + qy * ca;
        if (dx < minx) minx = dx; if (dx > maxx) maxx = dx;
        if (dy < miny) miny = dy; if (dy > maxy) maxy = dy;
    }
    const x0 = Math.max(sc.x0, Math.floor(cx + minx)), x1 = Math.min(sc.x1, Math.ceil(cx + maxx) + 1);
    const y0 = Math.max(sc.y0, Math.floor(cy + miny)), y1 = Math.min(sc.y1, Math.ceil(cy + maxy) + 1);
    if (x0 >= x1 || y0 >= y1) return;
    const u32 = sc.u32, W = sc.W, w = spr.w, h = spr.h, px = spr.px, ax = spr.ax, ay = spr.ay;
    const du = ca * inv, dv = -sa * inv;
    const tintC = tint >= 0 ? PAL32[tint] : 0;
    for (let y = y0; y < y1; y++) {
        const dy = y + 0.5 - cy, dx = x0 + 0.5 - cx;
        let su = (dx * ca + dy * sa) * inv + ax, sv = (-dx * sa + dy * ca) * inv + ay;
        let o = y * W + x0;
        for (let x = x0; x < x1; x++, su += du, sv += dv, o++) {
            if (su < 0 || sv < 0 || su >= w || sv >= h) continue;
            const v = px[(sv | 0) * w + (su | 0)];
            if (v < 0 || (dither && ((x + y) & 1) !== 0)) continue;
            u32[o] = tint >= 0 ? tintC : PAL32[remap !== null ? remap[v] : v];
        }
    }
}

// where a baked point (bake's pts, sprite px relative to the anchor) lands on the screen
export function spritePoint(spr, k, cx, cy, scale, angle) {
    const p = spr.pts[k], ca = Math.cos(angle), sa = Math.sin(angle);
    const x = p[0] * scale, y = p[1] * scale;
    return [cx + x * ca - y * sa, cy + x * sa + y * ca];
}
