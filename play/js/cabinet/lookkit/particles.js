// lookkit/particles.js — embers, soft glow dots and dotted motion trails.
//
//   new EmberField({ count, origin:[x,y], spread:[sx,sy], rise, life:[min,max], size:[min,max],
//                    young:[r,g,b], old:[r,g,b], drift, seed })
//       Rising sparks, animated entirely on the GPU from a time uniform (no per-frame CPU work).
//       field.object -> add to the kit scene; field.update(t); field.gain (e.g. the fire flicker).
//   new GlowDots(capacity)
//       Soft round additive dots (glints, the fire's heart, a carried shard's glow). One draw call.
//       dots.clear(); dots.add(x, y, radiusPx, [r,g,b]); dots.commit(); dots.object
//   drawTrail(batch, pts, color, style, { fadeTo })
//       Pushes a dotted trail (newest point first) into a LineBatch, fading to `fadeTo` (default black).
//   new MotionTrail(maxPoints, minStep)
//       Records a moving object's path for drawTrail: trail.push(x, y); trail.points (newest first).
//
// Sizes are reference px at a 768-px-tall target; the kit rescales them (setTargetHeight).
import * as THREE from 'three';
import { REF_HEIGHT } from './glowlines.js';

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export class EmberField {
  constructor(o = {}) {
    const n = o.count ?? 120, r = rng(o.seed ?? 7);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seeds[i] = r();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const life = o.life ?? [1.4, 2.8], size = o.size ?? [1.5, 3.5];
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, gain: { value: 1 }, pxScale: { value: 1 },
        origin: { value: new THREE.Vector2(...(o.origin ?? [0, 0])) },
        spread: { value: new THREE.Vector2(...(o.spread ?? [30, 8])) },
        rise: { value: o.rise ?? 160 }, drift: { value: o.drift ?? 18 },
        life: { value: new THREE.Vector2(...life) }, size: { value: new THREE.Vector2(...size) },
        young: { value: new THREE.Vector3(...(o.young ?? [3.0, 1.6, 0.5])) },
        old: { value: new THREE.Vector3(...(o.old ?? [1.4, 0.25, 0.02])) },
      },
      vertexShader: /* glsl */`
        attribute vec4 seed;
        uniform float time, rise, drift, pxScale, gain; uniform vec2 origin, spread, life, size;
        uniform vec3 young, old;
        varying vec3 vCol; varying float vA;
        void main() {
          float L = mix(life.x, life.y, seed.x);
          float ph = fract(time / L + seed.y);
          float cyc = floor(time / L + seed.y);
          float h1 = fract(sin(dot(vec2(seed.z, cyc), vec2(12.9898, 78.233))) * 43758.5453);
          float h2 = fract(sin(dot(vec2(seed.w, cyc), vec2(39.3468, 11.135))) * 24634.6345);
          vec2 p = origin + vec2((h1 - 0.5) * 2.0 * spread.x, (h2 - 0.5) * 2.0 * spread.y);
          float up = rise * (0.35 + 0.65 * seed.w) * (ph + 0.25 * ph * ph);
          p.y -= up;
          p.x += (h1 - 0.5) * up * 0.35 + drift * sin(time * (0.7 + seed.z) + seed.x * 6.28) * ph;
          vA = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.45, 1.0, ph));
          vCol = mix(young, old, smoothstep(0.1, 0.8, ph)) * gain;
          gl_PointSize = mix(size.x, size.y, seed.z) * (1.0 - 0.4 * ph) * pxScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, -p.y, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 > 1.0) discard;
          gl_FragColor = vec4(vCol * vA * exp(-r2 * 3.0), 1.0);
        }`,
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.object = new THREE.Points(g, this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 20;
  }
  update(t) { this.mat.uniforms.time.value = t; }
  get gain() { return this.mat.uniforms.gain.value; }
  set gain(v) { this.mat.uniforms.gain.value = v; }
  setTargetHeight(h) { this.mat.uniforms.pxScale.value = h / REF_HEIGHT; }
}

export class GlowDots {
  constructor(capacity = 256) {
    this.capacity = capacity; this.count = 0;
    this.pos = new Float32Array(capacity * 3); this.col = new Float32Array(capacity * 3); this.rad = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aRad = new THREE.BufferAttribute(this.rad, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('color', this.aCol); g.setAttribute('radius', this.aRad);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { pxScale: { value: 1 }, gain: { value: 1 } },
      vertexShader: /* glsl */`
        attribute vec3 color; attribute float radius; uniform float pxScale, gain; varying vec3 vCol;
        void main() { vCol = color * gain; gl_PointSize = radius * 2.0 * pxScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol;
        void main() { vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;
          float f = exp(-r2 * 4.0) - exp(-4.0); gl_FragColor = vec4(vCol * f, 1.0); }`,
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.object = new THREE.Points(g, this.mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 5;
  }
  clear() { this.count = 0; return this; }
  add(x, y, r, c) {
    if (this.count >= this.capacity) return this;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = -y; this.pos[i * 3 + 2] = 0;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.rad[i] = r;
    return this;
  }
  commit() {
    this.geometry.setDrawRange(0, this.count);
    for (const a of [this.aPos, this.aCol, this.aRad]) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, this.count) * a.itemSize); a.needsUpdate = true; }
    return this;
  }
  get gain() { return this.mat.uniforms.gain.value; }
  set gain(v) { this.mat.uniforms.gain.value = v; }
  setTargetHeight(h) { this.mat.uniforms.pxScale.value = h / REF_HEIGHT; }
}

/** Dotted trail, newest point first; colour fades toward fadeTo along its length. */
export function drawTrail(batch, pts, color, style = { dash: 3, gap: 6 }, o = {}) {
  if (pts.length < 2) return;
  batch.line(pts, color, style, o.fadeTo ?? [0, 0, 0], o.phase ?? 0);
}

export class MotionTrail {
  constructor(maxPoints = 24, minStep = 6) { this.max = maxPoints; this.step = minStep; this.points = []; }
  push(x, y) {
    const p = this.points[0];
    if (p && Math.hypot(p[0] - x, p[1] - y) < this.step) { p[0] = x; p[1] = y; return; }
    this.points.unshift([x, y]);
    if (this.points.length > this.max) this.points.pop();
  }
  reset() { this.points.length = 0; }
}
