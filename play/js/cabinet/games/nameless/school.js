// THE NODE · the cabinet with no name · THE SCHOOL: sacred-geometry forms as vector strokes.
//
// Every form writes into a Pen: a handful of per-style path buckets (one stroke() call per colour a frame, the
// cheap way to draw hundreds of lines on a 2D canvas). Coordinates are the cabinet's logical 320x240 units; a
// form is placed with an Xf (centre, rotation, scale, offset), which is how the renderer lets the forms drift
// apart when resonance is low and lock together, into one mandala, as it rises.
//
//   seedOfLife  flower(19/37)  vesica  metatron (13 circles + 78 lines)  hexagram  polygon  nestedPolygons
//   goldenSpiral  phyllotaxis  radial  lotus  sriYantra (4 up + 5 down triangles, lotus, gates)
// No DOM here beyond Path2D, which the Pen asks its host for (so the Lab's pixel renderer can reuse the forms
// with a Pen that rasterises instead).

const TAU = Math.PI * 2;
export const PHI = (1 + Math.sqrt(5)) / 2;

export class Xf {
    constructor(cx = 160, cy = 120, rot = 0, k = 1, dx = 0, dy = 0) { this.set(cx, cy, rot, k, dx, dy); }
    set(cx, cy, rot = 0, k = 1, dx = 0, dy = 0) {
        this.cx = cx + dx; this.cy = cy + dy; this.k = k; this.c = Math.cos(rot) * k; this.s = Math.sin(rot) * k; this.rot = rot;
        return this;
    }
    x(x, y) { return this.cx + x * this.c - y * this.s; }
    y(x, y) { return this.cy + x * this.s + y * this.c; }
}

// A Pen that builds Path2D buckets (the canvas renderer). style(key) selects the bucket for what follows.
export class PathPen {
    constructor(makePath) { this.makePath = makePath; this.buckets = new Map(); this.cur = null; this.order = []; }
    begin() { for (const b of this.buckets.values()) { b.path = null; b.used = false; } this.order.length = 0; }
    style(key, color, alpha, width, fill = false, op = null) {
        let b = this.buckets.get(key);
        if (!b) { b = { key, path: null, used: false }; this.buckets.set(key, b); }
        b.color = color; b.alpha = alpha; b.width = width; b.fill = fill; b.op = op;
        if (!b.used) { b.used = true; b.path = this.makePath(); this.order.push(b); }
        this.cur = b;
        return this;
    }
    to(key) { this.cur = this.buckets.get(key); return this; }
    // a bucket per alpha step (1/20): for things drawn in one colour at many brightnesses
    styleQ(key, color, alpha, width, fill = false) {
        const q = Math.max(0, Math.min(20, Math.round(alpha * 20)));
        return this.style(key + q, color, q / 20, width, fill);
    }
    line(x0, y0, x1, y1) { const p = this.cur.path; p.moveTo(x0, y0); p.lineTo(x1, y1); }
    poly(pts, closed) {
        const p = this.cur.path;
        p.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
        if (closed) p.closePath();
    }
    circle(x, y, r) { if (r <= 0) return; const p = this.cur.path; p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); }
    arc(x, y, r, a0, a1) { if (r <= 0) return; const p = this.cur.path; p.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0)); p.arc(x, y, r, a0, a1); }
    // flush every bucket used this frame onto ctx (which already carries the logical transform)
    flush(ctx, alphaK = 1) {
        for (const b of this.order) {
            if (!b.path || b.alpha * alphaK <= 0.003) continue;
            ctx.globalAlpha = Math.min(1, b.alpha * alphaK);
            if (b.op) ctx.globalCompositeOperation = b.op;
            if (b.fill) { ctx.fillStyle = b.color; ctx.fill(b.path); }
            else { ctx.strokeStyle = b.color; ctx.lineWidth = b.width; ctx.stroke(b.path); }
            if (b.op) ctx.globalCompositeOperation = 'lighter';
        }
        ctx.globalAlpha = 1;
    }
}

// ---------------------------------------------------------------- the forms (each draws with the pen's current style)
export function circleAt(pen, xf, x, y, r) { pen.circle(xf.x(x, y), xf.y(x, y), r * xf.k); }

export function seedOfLife(pen, xf, r) {
    circleAt(pen, xf, 0, 0, r);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 - Math.PI / 2; circleAt(pen, xf, r * Math.cos(a), r * Math.sin(a), r); }
}

// the hexagonal lattice of circle centres within `rings` steps of the centre (1: 7, 2: 19, 3: 37)
const latticeCache = new Map();
export function hexLattice(rings) {
    if (latticeCache.has(rings)) return latticeCache.get(rings);
    const out = [];
    for (let q = -rings; q <= rings; q++)
        for (let r = -rings; r <= rings; r++) {
            const s = -q - r;
            if (Math.abs(s) > rings) continue;
            out.push([q + r / 2, r * Math.sqrt(3) / 2, Math.max(Math.abs(q), Math.abs(r), Math.abs(s))]);
        }
    latticeCache.set(rings, out);
    return out;
}

// the Flower of Life: circles of radius r on the lattice; `grow` 0..1 reveals the outer ring of circles
export function flower(pen, xf, r, rings, grow = 1, enclose = true) {
    for (const [x, y, d] of hexLattice(rings)) {
        if (d === rings && grow < 1) { if (((x * 7.1 + y * 3.3) % 1 + 1) % 1 > grow) continue; }
        circleAt(pen, xf, x * r, y * r, r);
    }
    if (enclose) { circleAt(pen, xf, 0, 0, r * (rings + 1)); circleAt(pen, xf, 0, 0, r * (rings + 1) + r * 0.08); }
}

export function vesica(pen, xf, r, ang, sep = 1) {
    const dx = Math.cos(ang) * r * 0.5 * sep, dy = Math.sin(ang) * r * 0.5 * sep;
    circleAt(pen, xf, -dx, -dy, r); circleAt(pen, xf, dx, dy, r);
}

// the lens (almond) of a vesica of radius r whose circles sit at x = -d/2 and x = +d/2 (vertical almond), as points
export function lensPoints(r, d, n = 24) {
    const pts = [];
    if (d <= 0) return pts;
    const half = Math.acos(Math.min(1, d / 2 / r));
    // right edge of the lens = arc of the LEFT circle, left edge = arc of the RIGHT circle
    for (let i = 0; i <= n; i++) { const a = -half + 2 * half * i / n; pts.push(-d / 2 + r * Math.cos(a), r * Math.sin(a)); }
    for (let i = 0; i <= n; i++) { const a = Math.PI - half + 2 * half * i / n; pts.push(d / 2 + r * Math.cos(a), r * Math.sin(a)); }
    return pts;
}

const METATRON = (() => {
    const c = [[0, 0]];
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 - Math.PI / 2; c.push([Math.cos(a), Math.sin(a)]); }
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 - Math.PI / 2; c.push([2 * Math.cos(a), 2 * Math.sin(a)]); }
    const e = [];
    for (let i = 0; i < 13; i++) for (let j = i + 1; j < 13; j++) e.push([i, j]);
    return { c, e };
})();

// Metatron's Cube: 13 circles of the Fruit of Life (spacing d) and every line between their centres (78)
export function metatron(pen, xf, d, lines = true, circles = true, lineFrac = 1) {
    const C = METATRON.c;
    if (circles) for (const [x, y] of C) circleAt(pen, xf, x * d, y * d, d * 0.5);
    if (!lines) return;
    const n = Math.round(METATRON.e.length * lineFrac);
    for (let k = 0; k < n; k++) {
        const [i, j] = METATRON.e[k];
        pen.line(xf.x(C[i][0] * d, C[i][1] * d), xf.y(C[i][0] * d, C[i][1] * d), xf.x(C[j][0] * d, C[j][1] * d), xf.y(C[j][0] * d, C[j][1] * d));
    }
}

export function polygon(pen, xf, n, R, rot0 = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = rot0 + (i % n) * TAU / n; pts.push(xf.x(R * Math.cos(a), R * Math.sin(a)), xf.y(R * Math.cos(a), R * Math.sin(a))); }
    pen.poly(pts, false);
}

export function hexagram(pen, xf, R) { polygon(pen, xf, 3, R, -Math.PI / 2); polygon(pen, xf, 3, R, Math.PI / 2); }

// the cube seen down its diagonal: a hexagon and three inner edges (Metatron's cube's hidden solid)
export function cubeY(pen, xf, R) {
    polygon(pen, xf, 6, R, -Math.PI / 2);
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; pen.line(xf.x(0, 0), xf.y(0, 0), xf.x(R * Math.cos(a), R * Math.sin(a)), xf.y(R * Math.cos(a), R * Math.sin(a))); }
}

export function radial(pen, xf, n, r0, r1, rot0 = -Math.PI / 2) {
    for (let i = 0; i < n; i++) {
        const a = rot0 + i * TAU / n, c = Math.cos(a), s = Math.sin(a);
        pen.line(xf.x(c * r0, s * r0), xf.y(c * r0, s * r0), xf.x(c * r1, s * r1), xf.y(c * r1, s * r1));
    }
}

// the golden (logarithmic) spiral r = a * PHI^(theta / (pi/2)), from rMin out to rMax, turning `dir`
export function goldenSpiral(pen, xf, rMax, dir = 1, rot0 = 0, rMin = 1.5) {
    const b = Math.log(PHI) / (Math.PI / 2);
    const tMax = Math.log(rMax / rMin) / b, steps = Math.max(16, Math.ceil(tMax * 9)), pts = [];
    for (let i = 0; i <= steps; i++) {
        const th = tMax * i / steps, r = rMin * Math.exp(b * th), a = rot0 + dir * th;
        pts.push(xf.x(r * Math.cos(a), r * Math.sin(a)), xf.y(r * Math.cos(a), r * Math.sin(a)));
    }
    pen.poly(pts, false);
}

// the sunflower: n seeds at the golden angle, r = c * sqrt(i)
export function phyllotaxis(pen, xf, n, c, dotR = 0.55) {
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 1; i <= n; i++) { const r = c * Math.sqrt(i), a = i * ga; circleAt(pen, xf, r * Math.cos(a), r * Math.sin(a), dotR); }
}

// n petals between radii r0 and r1 (each two arcs meeting at the tip)
export function lotus(pen, xf, n, r0, r1, rot0 = -Math.PI / 2) {
    const half = Math.PI / n;
    for (let i = 0; i < n; i++) {
        const a = rot0 + i * TAU / n;
        const pts = [];
        for (let k = 0; k <= 8; k++) {         // left flank out to the tip
            const u = k / 8, r = r0 + (r1 - r0) * u, w = half * Math.sin(Math.PI * (1 - u) * 0.5) * (1 - u * 0.15);
            pts.push(xf.x(r * Math.cos(a - w), r * Math.sin(a - w)), xf.y(r * Math.cos(a - w), r * Math.sin(a - w)));
        }
        for (let k = 8; k >= 0; k--) {         // right flank back in
            const u = k / 8, r = r0 + (r1 - r0) * u, w = half * Math.sin(Math.PI * (1 - u) * 0.5) * (1 - u * 0.15);
            pts.push(xf.x(r * Math.cos(a + w), r * Math.sin(a + w)), xf.y(r * Math.cos(a + w), r * Math.sin(a + w)));
        }
        pen.poly(pts, false);
    }
}

// the Sri Yantra, radius R: nine interlocking triangles (four up, five down) round the bindu, then its lotus
// rings and the square with four gates. `grow` 0..1 builds it from the bindu out.
const SRI = {
    up: [[-0.98, 0.52], [-0.74, 0.37], [-0.52, 0.23], [-0.31, 0.10]],          // [apex y, base y]
    down: [[0.97, -0.60], [0.76, -0.45], [0.56, -0.31], [0.37, -0.17], [0.19, -0.03]],
};
export function sriYantra(pen, xf, R, grow = 1, outer = true) {
    const tri = (apex, base) => {
        const h = Math.abs(base - apex), w = Math.min(h * 0.64, Math.sqrt(Math.max(0, 1 - base * base)) * 0.98);
        const pts = [0, apex, w, base, -w, base, 0, apex];
        const out = [];
        for (let i = 0; i < pts.length; i += 2) out.push(xf.x(pts[i] * R, pts[i + 1] * R), xf.y(pts[i] * R, pts[i + 1] * R));
        pen.poly(out, false);
    };
    const all = [...SRI.up.map((t) => [t, Math.abs(t[0])]), ...SRI.down.map((t) => [t, Math.abs(t[0])])].sort((a, b) => a[1] - b[1]);
    const n = Math.max(1, Math.round(all.length * Math.max(0, Math.min(1, grow))));
    for (let i = 0; i < n; i++) tri(all[i][0][0], all[i][0][1]);
    circleAt(pen, xf, 0, 0, R * 0.035);
    if (!outer || grow < 0.6) return;
    circleAt(pen, xf, 0, 0, R);
    lotus(pen, xf, 8, R * 1.02, R * 1.28);
    lotus(pen, xf, 16, R * 1.28, R * 1.5, -Math.PI / 2 + Math.PI / 16);
    circleAt(pen, xf, 0, 0, R * 1.5); circleAt(pen, xf, 0, 0, R * 1.56);
}

// nested regular polygons 3..(3+count-1) between r0 and r1, each turned by its own angle
export function nestedPolygons(pen, xf, r0, r1, count, turns) {
    for (let i = 0; i < count; i++) {
        const n = 3 + i, R = r0 + (r1 - r0) * (count === 1 ? 0 : i / (count - 1));
        polygon(pen, xf, n, R, -Math.PI / 2 + (turns ? turns[i] || 0 : 0));
    }
}
