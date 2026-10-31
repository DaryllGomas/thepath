// Shared helpers for the roadside and the areaway (look batch 3b): seeded random numbers, value noise, drawn textures, and
// the one terrain sampler that puts everything on the ground. Nothing here touches the scene.
import * as THREE from 'three';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth01 = (x) => { const s = clamp(x); return s * s * (3 - 2 * s); };
export const lcg = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (n) => { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
// smooth 1-D value noise, 0..1 (the clumps and gaps along the road)
export const vnoise = (x, seed = 0) => {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f), o = seed * 668265263;
  return lerp(hash(Math.imul(i, 374761393) + o), hash(Math.imul(i + 1, 374761393) + o), s);
};

// ---- the terrain: the Hill's triangles in a 4 m bucket grid, so the height under any (x, z) is a lookup (the road's verge, every tuft and
// every post stands on it). Returns null where the hill has no triangle (the yard's lawn slab, the world beyond the hill).
export class Terrain {
  constructor(geos) {
    this.cs = 4; this.cells = new Map(); this.v = []; this.t = [];
    let base = 0;
    for (const g of geos) {
      const p = g.attributes.position, idx = g.index, n = idx ? idx.count : p.count;
      for (let i = 0; i < p.count; i++) this.v.push(p.getX(i), p.getY(i), p.getZ(i));
      for (let i = 0; i < n; i += 3) this.t.push(base + (idx ? idx.getX(i) : i), base + (idx ? idx.getX(i + 1) : i + 1), base + (idx ? idx.getX(i + 2) : i + 2));
      base += p.count;
    }
    const v = this.v, t = this.t, cs = this.cs;
    for (let k = 0; k < t.length; k += 3) {
      const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      const x0 = Math.min(v[a], v[b], v[c]), x1 = Math.max(v[a], v[b], v[c]), z0 = Math.min(v[a + 2], v[b + 2], v[c + 2]), z1 = Math.max(v[a + 2], v[b + 2], v[c + 2]);
      for (let cx = Math.floor(x0 / cs); cx <= Math.floor(x1 / cs); cx++) for (let cz = Math.floor(z0 / cs); cz <= Math.floor(z1 / cs); cz++) {
        const key = (cx + 2048) * 4096 + (cz + 2048); let l = this.cells.get(key); if (!l) this.cells.set(key, l = []); l.push(k);
      }
    }
  }
  y(x, z) {
    const l = this.cells.get((Math.floor(x / this.cs) + 2048) * 4096 + (Math.floor(z / this.cs) + 2048)); if (!l) return null;
    const v = this.v, t = this.t;
    for (const k of l) {
      const a = t[k] * 3, b = t[k + 1] * 3, c = t[k + 2] * 3;
      const d = (v[b + 2] - v[c + 2]) * (v[a] - v[c]) + (v[c] - v[b]) * (v[a + 2] - v[c + 2]); if (Math.abs(d) < 1e-12) continue;
      const l1 = ((v[b + 2] - v[c + 2]) * (x - v[c]) + (v[c] - v[b]) * (z - v[c + 2])) / d, l2 = ((v[c + 2] - v[a + 2]) * (x - v[c]) + (v[a] - v[c]) * (z - v[c + 2])) / d, l3 = 1 - l1 - l2;
      if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) return l1 * v[a + 1] + l2 * v[b + 1] + l3 * v[c + 1];
    }
    return null;
  }
}

// ---- drawn textures. A cut-out (grass blades, leaves) is drawn on a canvas, read back, and every transparent pixel is given the colour of the
// nearest opaque ones: a canvas keeps its colours premultiplied, so a clear pixel is black, and the mipmaps would then blacken every edge.
export const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function cutoutTexture(cv, anisotropy = 8) {
  const w = cv.width, h = cv.height, src = cv.getContext('2d').getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  // the colour at a clear pixel: the mean of the opaque ones in a 9 x 9 neighbourhood (cheap; two passes of a growing window would do as well)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = ((h - 1 - y) * w + x) * 4;       // a data texture's first row is the bottom
    out[o + 3] = src[i + 3];
    if (src[i + 3] > 8) { out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; continue; }
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 4; if (src[j + 3] > 40) { r += src[j]; g += src[j + 1]; b += src[j + 2]; n++; }
    }
    if (n) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; } else { out[o] = 60; out[o + 1] = 80; out[o + 2] = 30; }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = anisotropy; t.needsUpdate = true;
  return t;
}
export function paintTexture(cv, anisotropy = 8, repeat = false) {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t;
}
