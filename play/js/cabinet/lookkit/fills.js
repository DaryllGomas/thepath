// lookkit/fills.js — dark solid faces under the glow lines (standing stones, boulders, stone rings).
// Vector screens can't draw fills; a painted look needs them so solid things hide what's behind them.
//
//   const fills = new FillBatch(capacityVerts)
//     fills.poly(points, [r, g, b, a])   convex polygon (fan-triangulated), frame coords, HDR linear colour + alpha
//     fills.hull(points, rgba)           convex hull of the points (e.g. a boulder's base ring + apex)
//     fills.commit(); fills.object       add to the kit scene; renderOrder decides what it covers
//   Normal blending (it darkens), transparent so it sorts with the lines by renderOrder.
import * as THREE from 'three';

export class FillBatch {
  constructor(capacity = 4096) {
    this.capacity = capacity; this.count = 0;
    this.pos = new Float32Array(capacity * 3); this.col = new Float32Array(capacity * 4);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, side: THREE.DoubleSide });
    this.object = new THREE.Mesh(g, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }
  clear() { this.count = 0; return this; }
  _v(p, c) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.pos[i * 3] = p[0]; this.pos[i * 3 + 1] = -p[1]; this.pos[i * 3 + 2] = 0;
    this.col[i * 4] = c[0]; this.col[i * 4 + 1] = c[1]; this.col[i * 4 + 2] = c[2]; this.col[i * 4 + 3] = c[3] ?? 1;
  }
  poly(pts, c) {
    for (let i = 1; i + 1 < pts.length; i++) { this._v(pts[0], c); this._v(pts[i], c); this._v(pts[i + 1], c); }
    return this;
  }
  hull(pts, c) { return this.poly(convexHull(pts), c); }
  commit() {
    this.geometry.setDrawRange(0, this.count);
    for (const a of [this.aPos, this.aCol]) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, this.count) * a.itemSize); a.needsUpdate = true; }
    return this;
  }
}

export function convexHull(points) {
  const p = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
