// Node/CRT (Unity Assets/Shaders/CRT.shader) ported to GLSL: barrel curve, chroma bleed, scanlines,
// aperture grille, rolling bar, snow, rounded vignette, HDR brightness so the bloom picks the tube up.
import * as THREE from 'three';

const vert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */`
  uniform sampler2D map; uniform sampler2D nextMap;
  uniform float blend, brightness, flicker, curve, scan, scanCount, grille, vignette, chroma, roll, noise, time, power;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 frame(vec2 uv) { return mix(texture2D(map, uv).rgb, texture2D(nextMap, uv).rgb, blend); }
  void main() {
    vec2 uv0 = vec2(vUv.x, 1.0 - vUv.y);            // back to Unity's bottom-left UVs
    vec2 c = uv0 * 2.0 - 1.0;
    float r2 = dot(c, c);
    c *= 1.0 + curve * r2;
    vec2 uv = c * 0.5 + 0.5;
    float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    vec3 col;
    col.r = frame(uv + vec2(chroma, 0.0)).r;
    col.g = frame(uv).g;
    col.b = frame(uv - vec2(chroma, 0.0)).b;
    float sc = 1.0 - scan * (0.5 + 0.5 * sin(uv.y * scanCount * 6.2831853));
    float px = mod(gl_FragCoord.x, 3.0);
    vec3 gr = 1.0 - grille * (1.0 - vec3(step(px, 1.0), step(1.0, px) * step(px, 2.0), step(2.0, px)));
    float ph = fract(uv.y * 0.5 - time * 0.08);
    float bar = 1.0 + roll * smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.2, ph));
    float snow = 1.0 + noise * (hash(uv * 400.0 + time) - 0.5);
    vec2 v = uv * (1.0 - uv);
    float vig = pow(clamp(v.x * v.y * 40.0, 0.0, 1.0), vignette * 0.35);
    col = col * sc * gr * bar * snow * vig * inside;
    col *= brightness * flicker * power;
    col += vec3(0.004, 0.006, 0.010) * inside;
    gl_FragColor = vec4(col, 1.0);
  }`;

const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;

export function makeCRTMaterial(p = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, fog: false,
    uniforms: {
      map: { value: blank }, nextMap: { value: blank }, blend: { value: 0 },
      brightness: { value: p.brightness ?? 2.2 }, flicker: { value: p.flicker ?? 1 }, curve: { value: p.curve ?? 0.12 },
      scan: { value: p.scan ?? 0.45 }, scanCount: { value: p.scanCount ?? 240 }, grille: { value: p.grille ?? 0.35 },
      vignette: { value: p.vignette ?? 0.9 }, chroma: { value: p.chroma ?? 0.0022 }, roll: { value: p.roll ?? 0.12 },
      noise: { value: p.noise ?? 0.08 }, time: { value: 0 }, power: { value: 1 },
    },
  });
}
