// THE REDRAW · the pieces' material: the look kit's GlowLineMaterial, plus a per-piece core and halo gain, and (for the
// pieces themselves) the whole motion evaluated on the GPU.
//
// RedrawLineMaterial: each game tunes its own line materials (Hearth's fire has coreGain 3.0, the Constellation's stars
// 3.2, most lines 3.5); the redraw draws every piece with ONE material, so each piece carries its own gains in two style
// slots a solid line never uses: style.dash -> core scale (x coreGain), style.speed -> halo scale (x haloGain). With gap
// 0 the dash test never runs. That keeps the first frame identical to the old game's and the last to the new one's.
//
// RedrawPieceMaterial + pieceMesh(plan, pick): the plan (plan.js) is uploaded ONCE as instance attributes; per frame the
// only input is the uniform `u` (0..1). The vertex shader moves both ends of every piece (whole -> parts -> details, the
// bow), mixes their colour, width and gains, and fades lifted / settling / surplus / growing pieces, with the same
// formulas plan.js documents. So thousands of pieces cost the CPU nothing per frame.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { GlowLineMaterial } from '../lookkit/index.js';
import { STRIDE, HEAD, END } from './plan.js';

export const BASE_W = 8, BASE_CORE = 3.5, BASE_HALO = 0.8;

export class RedrawLineMaterial extends GlowLineMaterial {
  constructor(o = {}) {
    super({ width: BASE_W, coreGain: BASE_CORE, haloGain: BASE_HALO, ...o });
    const base = this.onBeforeCompile;
    this.onBeforeCompile = (sh, r) => {
      base(sh, r);
      const from = 'vec3 col = ( c * hot * core * coreGain + c * halo * haloGain ) * gain;';
      if (!sh.fragmentShader.includes(from)) throw new Error('RedrawLineMaterial: the glow line shader changed');
      sh.fragmentShader = sh.fragmentShader.replace(from, 'vec3 col = ( c * hot * core * coreGain * vStyle.x + c * halo * haloGain * vStyle.w ) * gain;');
      this.patchVertex?.(sh);
    };
  }
  customProgramCacheKey() { return 'redraw-glowline'; }
}

const VERT_DECL = /* glsl */`
  uniform float rdU, rdFlightDim, rdPaintDim;
  uniform vec3 rdHot[24];
  varying vec3 vHot;
  attribute vec4 rd11;
  attribute vec4 rd0, rd1, rd2, rd3, rd4, rd5, rd6, rd7, rd8, rd9, rd10;
  float rdEase(float x) { x = clamp(x, 0.0, 1.0); return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }
  vec2 rdPos(vec2 S, vec2 G, vec2 P, vec2 R, vec2 B, float v) {
    float a1 = rdEase(v / 0.6), a2 = rdEase((v - 0.32) / 0.46), b = rdEase((v - 0.52) / 0.48);
    return S + G * a1 + B * sin(3.14159265 * a1) + P * a2 + R * b;
  }
  float rdK(float v, float mode) { return mode < 0.5 ? rdEase((v - 0.3) / 0.6) : (mode < 1.5 ? 0.0 : 1.0); }
  float rdF(float v, float mode, float flags) {
    float lift = mod(flags, 2.0) > 0.5 ? 1.0 : 0.0, settle = flags > 1.5 ? 1.0 : 0.0, s = sin(3.14159265 * v);
    if (mode < 0.5) return (1.0 - mix(rdFlightDim, rdPaintDim, lift) * s) * mix(1.0, rdEase(v / 0.16), lift)
      * mix(1.0, 1.0 - rdEase((v - 0.78) / 0.22), settle);
    if (mode < 1.5) return (lift > 0.5 ? rdEase(v / 0.12) * (1.0 - rdEase((v - 0.06) / 0.28)) : 1.0 - rdEase((v - 0.08) / 0.47))
      * (1.0 - rdFlightDim * s);
    return rdEase((v - 0.55) / 0.45);
  }
`;
const VERT_MAIN = /* glsl */`
  float rdVA = clamp((rdU - rd5.x) * rd5.z, 0.0, 1.0), rdVB = clamp((rdU - rd5.y) * rd5.w, 0.0, 1.0);
  vec3 rdStart = vec3(rdPos(rd0.xy, rd1.xy, rd2.xy, rd3.xy, rd4.xy, rdVA) * vec2(1.0, -1.0), 0.0);
  vec3 rdEnd = vec3(rdPos(rd0.zw, rd1.zw, rd2.zw, rd3.zw, rd4.zw, rdVB) * vec2(1.0, -1.0), 0.0);
  float rdKA = rdK(rdVA, rd6.w), rdKB = rdK(rdVB, rd6.w), rdKM = 0.5 * (rdKA + rdKB);
  vec3 rdColA = mix(rd6.xyz, rd8.xyz, rdKA) * rdF(rdVA, rd6.w, rd7.w);
  vec3 rdColB = mix(rd7.xyz, rd9.xyz, rdKB) * rdF(rdVB, rd6.w, rd7.w);
  vec4 rdStyle = vec4(mix(rd10.x, rd10.y, rdKM) / ${BASE_CORE.toFixed(4)}, 0.0, mix(rd8.w, rd9.w, rdKM) / ${BASE_W.toFixed(4)},
    mix(rd10.z, rd10.w, rdKM) / ${BASE_HALO.toFixed(4)});
  vStyle = rdStyle;
  vHot = mix(rdHot[int(rd11.x + 0.5)], rdHot[int(rd11.y + 0.5)], rdKM);`;

export class RedrawPieceMaterial extends RedrawLineMaterial {
  constructor(o = {}) {
    super(o);
    Object.assign(this.uniforms, { rdHot: { value: Array.from({ length: 24 }, () => new THREE.Vector3(1, 1.7, 12)) }, rdU: { value: 0 }, rdFlightDim: { value: o.flightDim ?? 0.22 }, rdPaintDim: { value: o.paintDim ?? 0.4 } });
    this.patchVertex = (sh) => {
      // each piece's own hot colour (its material's, old -> new), not the one uniform
      sh.fragmentShader = sh.fragmentShader.replace('varying vec4 vStyle;', 'varying vec4 vStyle; varying vec3 vHot;').replace('c * hot * core * coreGain * vStyle.x', 'c * vHot * core * coreGain * vStyle.x');
      const rep = [
        ['attribute vec4 instanceStyle;', 'attribute vec4 instanceStyle;' + VERT_DECL],
        ['vStyle = instanceStyle;', VERT_MAIN],
        ['vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;', 'vColor.xyz = ( position.y < 0.5 ) ? rdColA : rdColB;'],
        ['vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;', 'vLineDistance = 0.0;'],
        ['vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );', 'vec4 start = modelViewMatrix * vec4( rdStart, 1.0 );'],
        ['vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );', 'vec4 end = modelViewMatrix * vec4( rdEnd, 1.0 );'],
        ['offset *= linewidth * instanceStyle.z;', 'offset *= linewidth * rdStyle.z;'],
      ];
      for (const [a, b] of rep) {
        if (!sh.vertexShader.includes(a)) throw new Error('RedrawPieceMaterial: the line shader changed (' + a + ')');
        sh.vertexShader = sh.vertexShader.replace(a, b);
      }
      // the line's own per-instance inputs are no longer read: drop their declarations too (some drivers count every
      // declared attribute against the limit of 16, and the pieces need 11 of their own)
      for (const d of ['attribute vec3 instanceStart;', 'attribute vec3 instanceEnd;', 'attribute vec3 instanceColorStart;',
        'attribute vec3 instanceColorEnd;', 'attribute float instanceDistanceStart;', 'attribute float instanceDistanceEnd;',
        'attribute vec4 instanceStyle;']) sh.vertexShader = sh.vertexShader.replace(d, '');
    };
  }
  get u() { return this.uniforms.rdU.value; }
  set u(v) { this.uniforms.rdU.value = v; }
  customProgramCacheKey() { return 'redraw-pieces'; }
}

/** The plan's pieces for which pick(i) is true, as one instanced line mesh (uploaded once). */
export function pieceMesh(plan, pick, material) {
  const hs = material.uniforms.rdHot.value;
  for (let i = 0; i < 24; i++) hs[i].set(plan.hots[i * 3] ?? 1, plan.hots[i * 3 + 1] ?? 1.7, plan.hots[i * 3 + 2] ?? 12);
  const P = plan.pieces, idx = [];
  for (let i = 0; i < plan.count; i++) if (pick(i)) idx.push(i);
  const n = Math.max(1, idx.length), W = 44, a = new Float32Array(n * W);
  idx.forEach((i, j) => {
    const b = i * STRIDE, A = b + HEAD, B = b + HEAD + END, o = j * W;
    const put = (k, x, y, z, w) => { a[o + k * 4] = x; a[o + k * 4 + 1] = y; a[o + k * 4 + 2] = z; a[o + k * 4 + 3] = w; };
    put(0, P[A], P[A + 1], P[B], P[B + 1]);                 // S
    put(1, P[A + 2], P[A + 3], P[B + 2], P[B + 3]);         // G whole-shape move
    put(2, P[A + 4], P[A + 5], P[B + 4], P[B + 5]);         // P part move
    put(3, P[A + 6], P[A + 7], P[B + 6], P[B + 7]);         // R settle
    put(4, P[A + 8], P[A + 9], P[B + 8], P[B + 9]);         // B bow
    put(5, P[A + 10], P[B + 10], 1 / Math.max(1e-4, P[A + 17]), 1 / Math.max(1e-4, P[B + 17]));   // delays, 1 / durations
    put(6, P[A + 11], P[A + 12], P[A + 13], P[b]);          // old colour (end A), mode
    put(7, P[B + 11], P[B + 12], P[B + 13], P[b + 9]);      // old colour (end B), flags
    put(8, P[A + 14], P[A + 15], P[A + 16], P[b + 2]);      // new colour (end A), old width
    put(9, P[B + 14], P[B + 15], P[B + 16], P[b + 3]);      // new colour (end B), new width
    put(10, P[b + 4], P[b + 5], P[b + 6], P[b + 7]);        // old / new core gain, old / new halo gain
  });
  const geo = new LineSegmentsGeometry();
  const buf = new THREE.InstancedInterleavedBuffer(a, W, 1);
  const hotAt = plan.hots, hot = new Float32Array(n * 4);
  idx.forEach((i, j) => { hot[j * 4] = P[i * STRIDE + HEAD + 2 * END]; hot[j * 4 + 1] = P[i * STRIDE + HEAD + 2 * END + 1]; });
  geo.setAttribute('rd11', new THREE.InterleavedBufferAttribute(new THREE.InstancedInterleavedBuffer(hot, 4, 1), 4, 0));
  for (let k = 0; k < 11; k++) geo.setAttribute('rd' + k, new THREE.InterleavedBufferAttribute(buf, 4, k * 4));
  geo.instanceCount = idx.length;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e6, -1e6, -1), new THREE.Vector3(1e6, 1e6, 1));
  const mesh = new LineSegments2(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}
