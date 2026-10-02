// lookkit/glowlines.js — thin bright vector lines with a soft phosphor halo, batched into one draw call.
//
// API
//   const mat = new GlowLineMaterial({ width, coreFrac, haloFrac, coreGain, haloGain, hot, gain })
//       width     quad width in reference px (at a 768-px-tall target); the kit rescales it on resize
//       coreFrac  radius of the hot core, as a fraction of the half-width (0..1)
//       haloFrac  gaussian radius of the halo, as a fraction of the half-width
//       coreGain / haloGain  brightness of the core and of the halo
//       hot       [r,g,b] the core colour is multiplied by (pushes the core toward white-hot). With the default
//                 [1, 1.7, 12], a colour's own green and (small) blue decide how white its core burns:
//                 deep orange rock [1, .16, .005] stays orange; gold [1.2, .4, .02] burns cream-white.
//     mat.gain    overall brightness (animate it: breath, wake, flicker)
//     mat.time    seconds; drives the per-segment dash crawl (style.speed)
//   const batch = new LineBatch(mat, capacity)   everything pushed into one batch is one draw call
//     batch.clear()                                     start over (dynamic batches: every frame)
//     batch.line(points, color, style?, colorEnd?)      open polyline, frame coords [[x,y],...] (x right, y down)
//     batch.loop(points, color, style?)                 closed polyline
//     batch.seg(ax, ay, bx, by, colA, colB?, style?, d0?)  one segment; colours are HDR [r,g,b] (may exceed 1)
//     batch.commit()                                    upload what was pushed
//     batch.object                                      the THREE object to add to the kit scene
//   style = { dash, gap, width, speed }   dash/gap in frame units (gap 0 = solid), width multiplier,
//                                         speed = dash crawl in frame units per second (rings "turn")
//   Shape helpers (return point arrays): ellipse, arc, bezier, catmull, polygon; star() pushes a glint.
//
// Additive blending, no depth test. Line ends are square (no round caps), so curves don't bead at joints.
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

export const REF_HEIGHT = 768;

export class GlowLineMaterial extends LineMaterial {
  constructor(o = {}) {
    super({ vertexColors: true, dashed: true, transparent: true, depthTest: false, depthWrite: false,
      toneMapped: false, linewidth: o.width ?? 11 });
    this.blending = THREE.CustomBlending;
    this.blendEquation = THREE.AddEquation;
    this.blendSrc = THREE.OneFactor;
    this.blendDst = THREE.OneFactor;
    this.baseWidth = o.width ?? 11;
    Object.assign(this.uniforms, {
      gain: { value: o.gain ?? 1 },
      time: { value: 0 },
      coreFrac: { value: o.coreFrac ?? 0.14 },
      haloFrac: { value: o.haloFrac ?? 0.42 },
      coreGain: { value: o.coreGain ?? 3.5 },
      haloGain: { value: o.haloGain ?? 0.8 },
      hot: { value: new THREE.Vector3(...(o.hot ?? [1.0, 1.7, 12.0])) },
    });
    this.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('attribute vec3 instanceStart;', 'attribute vec3 instanceStart;\nattribute vec4 instanceStyle;\nvarying vec4 vStyle;')
        .replace('void main() {', 'void main() {\n  vStyle = instanceStyle;')
        .replace('offset *= linewidth;', 'offset *= linewidth * instanceStyle.z;');
      sh.fragmentShader = sh.fragmentShader
        .replace('uniform float linewidth;', `uniform float linewidth;
          uniform float gain, time, coreFrac, haloFrac, coreGain, haloGain;
          uniform vec3 hot;
          varying vec4 vStyle;`)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  float fw = fwidth( vUv.x );')
        .replace('if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX',
          'if ( vStyle.y > 0.0 && mod( vLineDistance + dashOffset + time * vStyle.w, vStyle.x + vStyle.y ) > vStyle.x ) discard;')
        .replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );', `
          float ax = abs( vUv.x );
          float core = 1.0 - smoothstep( coreFrac - fw, coreFrac + fw, ax );
          float halo = exp( - ax * ax / ( haloFrac * haloFrac ) ) * ( 1.0 - ax * ax );
          vec3 c = diffuseColor.rgb;
          vec3 col = ( c * hot * core * coreGain + c * halo * haloGain ) * gain;
          gl_FragColor = vec4( col, 1.0 );`);
    };
  }
  get gain() { return this.uniforms.gain.value; }
  set gain(v) { this.uniforms.gain.value = v; }
  get time() { return this.uniforms.time.value; }
  set time(v) { this.uniforms.time.value = v; }
  /** Called by the kit on resize so widths stay the same fraction of the screen. */
  setTargetHeight(h) { this.linewidth = this.baseWidth * (h / REF_HEIGHT); }
  customProgramCacheKey() { return 'lookkit-glowline'; }
}

const SOLID = { dash: 1, gap: 0, width: 1, speed: 0 };

export class LineBatch {
  constructor(material, capacity = 1024) {
    this.material = material;
    this.capacity = capacity;
    this.count = 0;
    const geo = new LineSegmentsGeometry();
    this.pos = new Float32Array(capacity * 6);
    this.col = new Float32Array(capacity * 6);
    this.dist = new Float32Array(capacity * 2);
    this.sty = new Float32Array(capacity * 4);
    const mk = (arr, stride) => { const b = new THREE.InstancedInterleavedBuffer(arr, stride, 1); b.setUsage(THREE.DynamicDrawUsage); return b; };
    this.bPos = mk(this.pos, 6); this.bCol = mk(this.col, 6); this.bDist = mk(this.dist, 2); this.bSty = mk(this.sty, 4);
    geo.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.bPos, 3, 0));
    geo.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.bPos, 3, 3));
    geo.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(this.bCol, 3, 0));
    geo.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(this.bCol, 3, 3));
    geo.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(this.bDist, 1, 0));
    geo.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(this.bDist, 1, 1));
    geo.setAttribute('instanceStyle', new THREE.InterleavedBufferAttribute(this.bSty, 4, 0));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e6, -1e6, -1), new THREE.Vector3(1e6, 1e6, 1));
    geo.instanceCount = 0;
    this.geometry = geo;
    this.object = new LineSegments2(geo, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
  }
  clear() { this.count = 0; return this; }
  seg(ax, ay, bx, by, ca, cb = ca, style = SOLID, d0 = 0) {
    const len = Math.hypot(bx - ax, by - ay);
    if (this.count >= this.capacity) return d0 + len;
    const i = this.count++;
    const p = this.pos, c = this.col, d = this.dist, s = this.sty;
    p[i * 6] = ax; p[i * 6 + 1] = -ay; p[i * 6 + 2] = 0; p[i * 6 + 3] = bx; p[i * 6 + 4] = -by; p[i * 6 + 5] = 0;
    c[i * 6] = ca[0]; c[i * 6 + 1] = ca[1]; c[i * 6 + 2] = ca[2]; c[i * 6 + 3] = cb[0]; c[i * 6 + 4] = cb[1]; c[i * 6 + 5] = cb[2];
    d[i * 2] = d0; d[i * 2 + 1] = d0 + len;
    s[i * 4] = style.dash ?? 1; s[i * 4 + 1] = style.gap ?? 0; s[i * 4 + 2] = style.width ?? 1; s[i * 4 + 3] = style.speed ?? 0;
    return d0 + len;
  }
  /** Open polyline. colorEnd (optional) fades the colour along the line (black = fade out). */
  line(pts, color, style = SOLID, colorEnd = null, d0 = 0) {
    const n = pts.length; if (n < 2) return d0;
    let total = 0;
    if (colorEnd) for (let i = 1; i < n; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let d = d0, acc = 0;
    const ca = [0, 0, 0], cb = [0, 0, 0];
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1], b = pts[i];
      if (colorEnd) {
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const u0 = total > 0 ? acc / total : 0, u1 = total > 0 ? (acc + l) / total : 1; acc += l;
        for (let k = 0; k < 3; k++) { ca[k] = color[k] + (colorEnd[k] - color[k]) * u0; cb[k] = color[k] + (colorEnd[k] - color[k]) * u1; }
        d = this.seg(a[0], a[1], b[0], b[1], ca, cb, style, d);
      } else d = this.seg(a[0], a[1], b[0], b[1], color, color, style, d);
    }
    return d;
  }
  loop(pts, color, style = SOLID) { return this.line([...pts, pts[0]], color, style); }
  commit() {
    this.geometry.instanceCount = this.count;
    for (const b of [this.bPos, this.bCol, this.bDist, this.bSty]) {
      b.clearUpdateRanges(); b.addUpdateRange(0, Math.max(1, this.count) * b.stride); b.needsUpdate = true;
    }
    return this;
  }
}

// ---------- shape helpers (frame coords: x right, y down) ----------
export function ellipse(cx, cy, rx, ry, n = 64, rot = 0) { return arc(cx, cy, rx, ry, 0, Math.PI * 2, n, rot); }
export function arc(cx, cy, rx, ry, a0, a1, n = 32, rot = 0) {
  const out = [], cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return out;
}
export function bezier(p0, p1, p2, p3, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
/** Smooth curve through the points (Catmull-Rom), n samples per span. */
export function catmull(pts, n = 8, closed = false) {
  const out = [], m = pts.length;
  const P = (i) => closed ? pts[(i + m) % m] : pts[Math.max(0, Math.min(m - 1, i))];
  const spans = closed ? m : m - 1;
  for (let s = 0; s < spans; s++) {
    const p0 = P(s - 1), p1 = P(s), p2 = P(s + 1), p3 = P(s + 2);
    for (let i = 0; i < n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(closed ? [...out[0]] : [...pts[m - 1]]);
  return out;
}
export function polygon(cx, cy, r, n, rot = 0, sy = 1) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * sy]); }
  return out;
}
/** A glint: crossed rays fading from a bright centre to nothing (reads as a lens star). */
export function star(batch, x, y, len, color, rays = 4, rot = 0, style) {
  const zero = [0, 0, 0];
  for (let i = 0; i < rays * 2; i++) {
    const a = rot + i * Math.PI / rays, l = len * (i % 2 ? 0.5 : 1);
    batch.seg(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, color, zero, style);
  }
}
