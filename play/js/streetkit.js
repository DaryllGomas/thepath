// STREET KIT (look batch 3a): the small tools js/mainstreet.js and js/streetcars.js share. A mesher (faces collected per material, one mesh
// each: the whole street is a handful of draw calls), a lofter for the cars' rounded bodies, canvas helpers for the textures drawn at load (fixed
// seeds: no files, no network), and one material patch that lets metal and paint reflect the night (the outdoors has no environment map, and a
// mirror finish on a bare scene is black). Coordinates are three's (x east, y up, z south; the street runs along x, the hill is at +z).
import * as THREE from 'three';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth01 = (x) => { const s = clamp(x, 0, 1); return s * s * (3 - 2 * s); };
export const lcg = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const c8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
export const rgba = (c, m = 1, a = 1) => `rgba(${c8(c[0] * m)},${c8(c[1] * m)},${c8(c[2] * m)},${a})`;
export const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };     // an sRGB hex as the linear colour a vertex carries
export const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const WHITE = [1, 1, 1];

// ---- canvas helpers
export function paint(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
export function tex(c, aniso, o = {}) {
  const t = new THREE.CanvasTexture(c); t.anisotropy = aniso;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (!o.data) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const speckle = (rand, g, w, h, n, a, len = 1) => { for (let i = 0; i < n; i++) { g.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.8})`; g.fillRect(rand() * w, rand() * h, len + rand() * len, 1 + rand() * 1.5); } };

// ---- a mesher: faces collected per material, built into one geometry each. Flat faces carry their own normal; uv(p) gives a face its texture
// coordinates from the point, so panels of one wall share one texture without a seam. Vertex colours tint (linear).
export class Mesher {
  constructor() { this.b = new Map(); }
  bucket(k) { if (!this.b.has(k)) this.b.set(k, { p: [], n: [], u: [], c: [], i: [] }); return this.b.get(k); }
  tris() { let n = 0; for (const B of this.b.values()) n += B.i.length / 3; return n; }
  // one flat convex face; the winding is turned to face `out`, so corners may be given in any order
  quad(k, pts, out, uv, col = WHITE) {
    const [a, b, c] = pts;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz); if (l < 1e-12) return;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { pts = pts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    const B = this.bucket(k), base = B.p.length / 3;
    for (const p of pts) { B.p.push(p[0], p[1], p[2]); B.n.push(nx / l, ny / l, nz / l); const t = uv(p); B.u.push(t[0], t[1]); B.c.push(col[0], col[1], col[2]); }
    for (let i = 1; i < pts.length - 1; i++) B.i.push(base, base + i, base + i + 1);
  }
  // a box (x0..x1, y0..y1, z0..z1). o: s = metres per texture repeat [u, v]; col = vertex colour; faces = which of f(-z) b(+z) l(-x) r(+x) u d to make;
  // yaw = turned about its own centre; uv = a function of the point instead of s
  box(k, x0, y0, z0, x1, y1, z1, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const s = o.s || [1, 1], col = o.col || WHITE, faces = o.faces || 'fblrud';
    let P = (p) => p, N = (v) => v;
    if (o.yaw) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, co = Math.cos(o.yaw), si = Math.sin(o.yaw);
      P = (p) => { const dx = p[0] - cx, dz = p[2] - cz; return [cx + dx * co + dz * si, p[1], cz - dx * si + dz * co]; };
      N = (v) => [v[0] * co + v[2] * si, v[1], -v[0] * si + v[2] * co];
    }
    const U = o.uv, sh = o.shade;      // shade: a brightness for each face, { u, d, f, b, l, r } (a lit interior: tops bright, undersides dark)
    const F = {
      f: [[[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], U || ((p) => [p[0] / s[0], p[1] / s[1]])],
      b: [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], U || ((p) => [p[0] / s[0], p[1] / s[1]])],
      l: [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], U || ((p) => [p[2] / s[0], p[1] / s[1]])],
      r: [[[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0], U || ((p) => [p[2] / s[0], p[1] / s[1]])],
      u: [[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], U || ((p) => [p[0] / s[0], p[2] / s[1]])],
      d: [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], U || ((p) => [p[0] / s[0], p[2] / s[1]])],
    };
    for (const f of faces) { const [pts, out, uv] = F[f]; this.quad(k, pts.map(P), N(out), uv, sh && sh[f] !== undefined ? [col[0] * sh[f], col[1] * sh[f], col[2] * sh[f]] : col); }
  }
  // a three.js geometry placed by a matrix, tinted by a colour (or by col(point, vertex index))
  geo(k, g, m, col = WHITE, rect = null) {      // rect: [u0, v0, u1, v1], the part of an atlas the geometry's own 0..1 uv is laid over
    const B = this.bucket(k), base = B.p.length / 3, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m); B.p.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); B.n.push(v.x, v.y, v.z);
      const c = typeof col === 'function' ? col(v, i) : col;
      let u = ua ? ua.getX(i) : 0, w = ua ? ua.getY(i) : 0; if (rect) { u = rect[0] + u * (rect[2] - rect[0]); w = rect[1] + w * (rect[3] - rect[1]); }
      B.u.push(u, w); B.c.push(c[0], c[1], c[2]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) B.i.push(base + g.index.getX(i)); else for (let i = 0; i < pa.count; i++) B.i.push(base + i);
  }
  // an upright cylinder (or a cone: r1 at the top), `seg` sides, from y0 up h
  cyl(k, x, y0, z, r0, r1, h, seg, col = WHITE, o = {}) {
    const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, !!o.open);
    const m = new THREE.Matrix4().makeTranslation(x, y0 + h / 2, z);
    if (o.rotZ) m.multiply(new THREE.Matrix4().makeRotationZ(o.rotZ)); if (o.rotX) m.multiply(new THREE.Matrix4().makeRotationX(o.rotX));
    this.geo(k, g, m, col); g.dispose();
  }
  // a cylinder between two points
  rod(k, a, b, r, seg, col = WHITE, o = {}) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(); if (len < 1e-6) return;
    const g = new THREE.CylinderGeometry(o.r1 ?? r, r, len, seg, 1, o.open ?? true);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.geo(k, g, new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1)), col); g.dispose();
  }
  // a smooth surface through rings of points (a grid: rings[i][j], j going round and closing on itself when o.closed). Each quad has its own four
  // vertices (so a quad can carry its own colour) but the normals are smooth: the surface's own, taken across neighbouring points.
  // o: col = colour or (i, j, point) -> colour per quad, uv = point -> [u, v], closed (default true), flip = the opposite way out
  loft(k, rings, o = {}) {
    const R = rings.length, n = rings[0].length, closed = o.closed !== false, colf = typeof o.col === 'function' ? o.col : () => o.col || WHITE, uv = o.uv || ((p) => [p[0], p[2]]);
    const V = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], X = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const J = (j) => (closed ? (j + n) % n : clamp(j, 0, n - 1));
    const Nn = rings.map((ring, i) => ring.map((p, j) => {
      const dj = V(ring[J(j + 1)], ring[J(j - 1)]), di = V(rings[Math.min(R - 1, i + 1)][j], rings[Math.max(0, i - 1)][j]);
      const c = X(dj, di), l = Math.hypot(c[0], c[1], c[2]) || 1; return [c[0] / l, c[1] / l, c[2] / l];
    }));
    // which way is out: the ring's centroid decides, once, for the whole surface
    let sgn = 0;
    for (let i = 0; i < R; i++) { const ring = rings[i], c = [0, 0, 0]; for (const p of ring) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c[0] /= n; c[1] /= n; c[2] /= n;
      for (let j = 0; j < n; j++) sgn += Nn[i][j][0] * (ring[j][0] - c[0]) + Nn[i][j][1] * (ring[j][1] - c[1]) + Nn[i][j][2] * (ring[j][2] - c[2]); }
    const s = (sgn < 0 ? -1 : 1) * (o.flip ? -1 : 1);
    const B = this.bucket(k);
    for (let i = 0; i + 1 < R; i++) for (let j = 0; j < (closed ? n : n - 1); j++) {
      const j2 = J(j + 1), pts = [rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]], nn = [Nn[i][j], Nn[i][j2], Nn[i + 1][j2], Nn[i + 1][j]];
      const d1 = V(pts[1], pts[0]), d2 = V(pts[3], pts[0]), fc = X(d1, d2), fl = Math.hypot(fc[0], fc[1], fc[2]); if (fl < 1e-12) continue;
      const avg = [nn[0][0] + nn[1][0] + nn[2][0] + nn[3][0], nn[0][1] + nn[1][1] + nn[2][1] + nn[3][1], nn[0][2] + nn[1][2] + nn[2][2] + nn[3][2]];
      const flipFace = (fc[0] * avg[0] + fc[1] * avg[1] + fc[2] * avg[2]) * s < 0;       // wind the triangles so the face looks the way the normals do
      const col = colf(i, j, [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (pts[0][2] + pts[2][2]) / 2]), base = B.p.length / 3;
      for (let q = 0; q < 4; q++) { B.p.push(pts[q][0], pts[q][1], pts[q][2]); B.n.push(nn[q][0] * s, nn[q][1] * s, nn[q][2] * s); const t = uv(pts[q]); B.u.push(t[0], t[1]); B.c.push(col[0], col[1], col[2]); }
      if (!flipFace) B.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else B.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  // a flat cap over a ring (a fan round its middle), facing `out`
  cap(k, ring, out, col = WHITE, uv = (p) => [p[1], p[2]]) {
    const c = [0, 0, 0]; for (const p of ring) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c[0] /= ring.length; c[1] /= ring.length; c[2] /= ring.length;
    for (let j = 0; j < ring.length; j++) this.quad(k, [c, ring[j], ring[(j + 1) % ring.length]], out, uv, col);
  }
  // everything another mesher holds, placed by a matrix (a car built about its own origin, set down on the street)
  append(other, m) {
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m), flip = m.determinant() < 0;
    for (const [k, S] of other.b) {
      const B = this.bucket(k), base = B.p.length / 3;
      for (let i = 0; i < S.p.length; i += 3) {
        v.set(S.p[i], S.p[i + 1], S.p[i + 2]).applyMatrix4(m); B.p.push(v.x, v.y, v.z);
        v.set(S.n[i], S.n[i + 1], S.n[i + 2]).applyMatrix3(nm).normalize(); B.n.push(v.x, v.y, v.z);
      }
      B.u.push(...S.u); B.c.push(...S.c);
      for (let i = 0; i < S.i.length; i += 3) { if (flip) B.i.push(base + S.i[i], base + S.i[i + 2], base + S.i[i + 1]); else B.i.push(base + S.i[i], base + S.i[i + 1], base + S.i[i + 2]); }
    }
  }
  build(k) {
    const B = this.b.get(k), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.setIndex(B.i.length > 65000 ? new THREE.Uint32BufferAttribute(B.i, 1) : new THREE.Uint16BufferAttribute(B.i, 1));
    g.computeBoundingSphere(); return g;
  }
}

// the points of a rounded rectangle in (z, y), going round: half width w about zc, y0..y1, corner radius r, `arc` points a corner
export function ringRR(w, y0, y1, r, arc = 3, zc = 0, mids = []) {
  r = Math.max(0.001, Math.min(r, w - 1e-3, (y1 - y0) / 2 - 1e-3));
  const out = [], corners = [[w - r, y0 + r, -90], [w - r, y1 - r, 0], [-(w - r), y1 - r, 90], [-(w - r), y0 + r, 180]];
  const inner = mids.map((y) => Math.min(Math.max(y, y0 + r), y1 - r)).sort((a, b) => a - b);      // (clamped, so every station's ring has the same number of points)
  corners.forEach(([cz, cy, a0], ci) => {
    for (let i = 0; i < arc; i++) { const a = (a0 + (i / (arc - 1)) * 90) * Math.PI / 180; out.push([zc + cz + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    if (ci === 0) for (const y of inner) out.push([zc + w, y]);                      // extra points up the right flank (a colour can change there)
    if (ci === 2) for (const y of inner.slice().reverse()) out.push([zc - w, y]);    // and down the left
  });
  return out;
}

// ---- the night's reflection, for paint and chrome. The outdoors has no environment map; this adds, to a standard material, what a polished
// surface would show of the street at night: the sodium-lit street below the horizon, a band of haze at it, a dark sky above, a trace of
// THE JUNCTION's red to the east. It rides on the material's own Fresnel and roughness, and is eased to a ceiling (the post's bloom treats
// anything over 0.54 as a lamp). k scales it all; gloss is how much of it a rough surface keeps.
export function nightReflect(mat, { k = 1, ceil = 0.5, key = 'nr' } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.nrK = { value: k };
    sh.fragmentShader = 'uniform float nrK;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `{
		vec3 nrV = normalize( vViewPosition ), nrR = inverseTransformDirection( reflect( -nrV, normalize( normal ) ), viewMatrix );
		float nrH = nrR.y;
		vec3 nrSod = vec3( 0.55, 0.34, 0.16 );
		vec3 nrEnv = nrH < 0.0 ? nrSod * ( 0.12 + 0.28 * smoothstep( -0.9, -0.05, nrH ) ) : vec3( 0.012, 0.016, 0.04 ) + vec3( 0.035, 0.026, 0.018 ) * exp( -nrH * 5.0 );
		nrEnv += nrSod * 0.5 * exp( -nrH * nrH * 55.0 );
		nrEnv += vec3( 0.75, 0.07, 0.05 ) * smoothstep( 0.8, 1.0, nrR.x / max( length( nrR.xz ), 1e-3 ) ) * exp( -nrH * nrH * 10.0 ) * 0.5;
		vec3 nrF = material.specularColor + ( vec3( 1.0 ) - material.specularColor ) * pow( 1.0 - clamp( dot( normalize( normal ), nrV ), 0.0, 1.0 ), 5.0 );
		vec3 nrAdd = nrF * nrEnv * nrK * ( 1.0 - 0.75 * material.roughness );
		const float nrC = ${ceil.toFixed(3)};
		outgoingLight += nrAdd * ( nrC / ( nrC + max( nrAdd.r, max( nrAdd.g, nrAdd.b ) ) ) );
	}
	#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `${key}|${k}|${ceil}`;
  return mat;
}
