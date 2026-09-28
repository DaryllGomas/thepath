// THE NODE · world 1 · STARVECTOR on the Cabinet Engine · THE SHAPES: the vector models every picture draws
// from (the renderer each frame, the spec's title art once at load). Pure geometry, no palette, no surface.
//
//   DODECA / OCTA     unit polyhedra { V vertices, N face normals, F faces, E edges (a, b, f1, f2) }
//   rockMatrix(rock)  the 3x3 rotation of a tumbling rock: spin(axis, ang) * Rz(e2) Ry(e1) Rx(e0)
//   rockEdges(...)    hidden-line projection: calls line(x0, y0, x1, y1) for every visible edge
//   SHIP / SHIP_K     the paper dart in (forward, right) units; SHIP_K scales it on the tube
//   rasterRows(w, h, draw)   a tiny char-grid rasterizer for PixelSprite.fromRows (title art)
const PHI = (1 + Math.sqrt(5)) / 2;

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function buildPoly(V, N, F) {
    const edges = new Map();
    for (let f = 0; f < F.length; f++) {
        const face = F[f];
        for (let i = 0; i < face.length; i++) {
            const a = face[i], b = face[(i + 1) % face.length];
            const key = a < b ? a * 64 + b : b * 64 + a;
            const e = edges.get(key);
            if (e) e.f2 = f; else edges.set(key, { a: Math.min(a, b), b: Math.max(a, b), f1: f, f2: -1 });
        }
    }
    return { V, N, F, E: [...edges.values()] };
}

function buildDodeca() {
    const ia = 1 / PHI;
    const V = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push(norm([x, y, z]));
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        V.push(norm([0, s1 * ia, s2 * PHI])); V.push(norm([s1 * ia, s2 * PHI, 0])); V.push(norm([s1 * PHI, 0, s2 * ia]));
    }
    const N = [];                                   // the dual icosahedron: one direction per pentagon
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        N.push(norm([0, s1 * PHI, s2])); N.push(norm([s1 * PHI, s2, 0])); N.push(norm([s1, 0, s2 * PHI]));
    }
    const F = N.map(n => {
        const idx = V.map((v, i) => [dot(v, n), i]).sort((p, q) => q[0] - p[0]).slice(0, 5).map(p => p[1]);
        const u = norm(Math.abs(n[0]) < 0.9 ? [0, -n[2], n[1]] : [-n[2], 0, n[0]]);
        const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
        return idx.sort((i, j) => Math.atan2(dot(V[i], w), dot(V[i], u)) - Math.atan2(dot(V[j], w), dot(V[j], u)));
    });
    return buildPoly(V, N, F);
}

function buildOcta() {
    const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const N = [], F = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        N.push(norm([sx, sy, sz]));
        F.push([sx > 0 ? 0 : 1, sy > 0 ? 2 : 3, sz > 0 ? 4 : 5]);
    }
    return buildPoly(V, N, F);
}

export const DODECA = buildDodeca();
export const OCTA = buildOcta();

// { ang, ax, ay, az, e0, e1, e2 } -> a row-major 3x3 rotation
export function rockMatrix(k, out = new Array(9)) {
    const c0 = Math.cos(k.e0), s0 = Math.sin(k.e0), c1 = Math.cos(k.e1), s1 = Math.sin(k.e1), c2 = Math.cos(k.e2), s2 = Math.sin(k.e2);
    const B0 = c2 * c1, B1 = c2 * s1 * s0 - s2 * c0, B2 = c2 * s1 * c0 + s2 * s0;
    const B3 = s2 * c1, B4 = s2 * s1 * s0 + c2 * c0, B5 = s2 * s1 * c0 - c2 * s0;
    const B6 = -s1, B7 = c1 * s0, B8 = c1 * c0;
    const ca = Math.cos(k.ang), sa = Math.sin(k.ang), C = 1 - ca, x = k.ax, y = k.ay, z = k.az;
    const S = [
        ca + x * x * C, x * y * C - z * sa, x * z * C + y * sa,
        y * x * C + z * sa, ca + y * y * C, y * z * C - x * sa,
        z * x * C - y * sa, z * y * C + x * sa, ca + z * z * C,
    ];
    for (let i = 0; i < 3; i++) {
        const a = S[i * 3], b = S[i * 3 + 1], c = S[i * 3 + 2];
        out[i * 3] = a * B0 + b * B3 + c * B6;
        out[i * 3 + 1] = a * B1 + b * B4 + c * B7;
        out[i * 3 + 2] = a * B2 + b * B5 + c * B8;
    }
    return out;
}

// hidden-line wireframe: every edge with at least one face toward the viewer
const _P = new Float64Array(40), _Z = new Uint8Array(20), _R = new Array(9);
export function rockEdges(poly, k, cx, cy, scale, lumps, line) {
    const R = rockMatrix(k, _R);
    for (let i = 0; i < poly.V.length; i++) {
        const v = poly.V[i], m = scale * (lumps ? lumps[i] : 1);
        _P[i * 2] = cx + (R[0] * v[0] + R[1] * v[1] + R[2] * v[2]) * m;
        _P[i * 2 + 1] = cy + (R[3] * v[0] + R[4] * v[1] + R[5] * v[2]) * m;
    }
    for (let f = 0; f < poly.N.length; f++) {
        const n = poly.N[f];
        _Z[f] = R[6] * n[0] + R[7] * n[1] + R[8] * n[2] > 0 ? 1 : 0;
    }
    for (const e of poly.E) {
        if (!_Z[e.f1] && !(e.f2 >= 0 && _Z[e.f2])) continue;
        line(_P[e.a * 2], _P[e.a * 2 + 1], _P[e.b * 2], _P[e.b * 2 + 1]);
    }
}

// the ship, in (forward, right) units x SHIP_K: nose 13 ahead, wing tips 10 back and 9 out, the notch 6 back
// (x1.25 = 30 px nose to tail on the tube: Unity's 14 px dart was too small to read across a room)
export const SHIP_K = 1.25;
export const SHIP = {
    hull: [[13, 0, -10, -9], [13, 0, -10, 9], [-10, -9, -6, 0], [-10, 9, -6, 0]],
    folds: [[13, 0, -7.8, -4], [13, 0, -7.8, 4]],
    keel: [[13, 0, -6, 0]],
    pods: [[-7.8, -4, -11, -4], [-6, 0, -10, 0], [-7.8, 4, -11, 4]],
};

// a char grid for PixelSprite.fromRows: draw(line(x0, y0, x1, y1, ch), dot(x, y, ch)) then rows
export function rasterRows(w, h, draw) {
    const g = [];
    for (let y = 0; y < h; y++) g.push(new Array(w).fill('.'));
    const dotc = (x, y, ch) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = ch; };
    const line = (x0, y0, x1, y1, ch) => {
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 4096; guard++) {
            dotc(x0, y0, ch);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    };
    draw(line, dotc);
    return g.map(r => r.join(''));
}
