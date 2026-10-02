// lookkit/passes.js — the two custom post passes of the look kit.
//
//   new PhosphorPass(w, h, { tau })     phosphor persistence: out = max(new, old * exp(-dt / tau)), per channel.
//       tau = [r, g, b] decay times in seconds; red lingers longest so fading trails cool toward deep orange.
//       pass.dt = frame delta (the kit sets it). HDR in, HDR out. Frame-rate independent.
//   new CRTPass(target, { curve, glassCurve, overscan, corner, vignette, scan, scanCount, exposure, bezel, grain })
//       curve bends the picture (barrel); glassCurve bends only the glass edge (defaults to curve). Art traced
//       from a picture of a curved tube already carries its curvature: use curve 0 and keep glassCurve.
//       the tube finish, last in the chain: per-channel exponential tone map (hot orange -> yellow -> white),
//       barrel curvature, rounded glass edge, vignette, near-invisible scanlines, bezel colour outside the glass.
//       Renders into `target` (the kit's stable output texture) or the canvas when target is null.
//
//   new ScaledBloomPass(res, strength, radius, threshold, scale)
//       three's UnrealBloomPass for a picture drawn at `scale` x the cabinet's size (the kit's renderScale). Its blur chain
//       runs at the UNSCALED size (from a box-filtered copy of the picture), so the glow's radius is the same fraction of the
//       screen at any scale; the glow is then added over the full-size picture. At scale 1 it IS UnrealBloomPass (nothing
//       overridden runs), so games that don't ask for a scale render exactly as before.
//
// Safety: nothing here flickers. Scanlines default to 3% contrast; grain is static per pixel (no crawl).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class PhosphorPass extends Pass {
  constructor(w, h, o = {}) {
    super();
    this.tau = new THREE.Vector3(...(o.tau ?? [0.11, 0.085, 0.06]));
    this.dt = 1 / 60;
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
    this.acc = [new THREE.WebGLRenderTarget(w, h, opt), new THREE.WebGLRenderTarget(w, h, opt)];
    this.i = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tNew: { value: null }, tOld: { value: null }, decay: { value: new THREE.Vector3() } },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tNew, tOld; uniform vec3 decay; varying vec2 vUv;
        void main() {
          vec3 n = texture2D(tNew, vUv).rgb;
          vec3 o = texture2D(tOld, vUv).rgb * decay;
          gl_FragColor = vec4(max(n, o), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.copy = new THREE.ShaderMaterial({
      uniforms: { t: { value: null } }, vertexShader: VERT,
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }',
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
    this.reset = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    const cur = this.acc[this.i], old = this.acc[1 - this.i];
    const k = this.reset ? 0 : 1;
    this.mat.uniforms.decay.value.set(k * Math.exp(-this.dt / this.tau.x), k * Math.exp(-this.dt / this.tau.y), k * Math.exp(-this.dt / this.tau.z));
    this.reset = false;
    this.mat.uniforms.tNew.value = readBuffer.texture;
    this.mat.uniforms.tOld.value = old.texture;
    this.quad.material = this.mat;
    renderer.setRenderTarget(cur); this.quad.render(renderer);
    this.copy.uniforms.t.value = cur.texture;
    this.quad.material = this.copy;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
    this.i = 1 - this.i;
  }
  setSize(w, h) { this.acc[0].setSize(w, h); this.acc[1].setSize(w, h); this.reset = true; }
  dispose() { this.acc.forEach((r) => r.dispose()); this.mat.dispose(); this.copy.dispose(); this.quad.dispose(); }
}

export class CRTPass extends Pass {
  constructor(target, o = {}) {
    super();
    this.target = target;
    this.needsSwap = false;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        res: { value: new THREE.Vector2(1024, 768) },
        curve: { value: o.curve ?? 0.035 },
        glassCurve: { value: o.glassCurve ?? o.curve ?? 0.035 },
        overscan: { value: o.overscan ?? 1.0 },
        glass: { value: new THREE.Vector2(...(o.glass ?? [0.965, 0.975])) },
        corner: { value: o.corner ?? 0.07 },
        vignette: { value: o.vignette ?? 0.5 },
        scan: { value: o.scan ?? 0.03 },
        scanCount: { value: o.scanCount ?? 300 },
        exposure: { value: new THREE.Vector3(...(o.exposure ?? [1, 1, 1])) },
        lift: { value: new THREE.Vector3(...(o.lift ?? [0, 0, 0])) },
        bezel: { value: new THREE.Color(...(o.bezel ?? [0, 0, 0])) },
        grain: { value: o.grain ?? 0.02 },
        linearOut: { value: target && target.texture.colorSpace === THREE.SRGBColorSpace ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 res, glass;
        uniform float curve, glassCurve, overscan, corner, vignette, scan, scanCount, grain, linearOut;
        uniform vec3 exposure, lift, bezel;
        varying vec2 vUv;
        vec3 dec(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 c = vUv * 2.0 - 1.0;
          float r2 = dot(c * vec2(1.0, 0.75), c * vec2(1.0, 0.75));
          vec2 s = c * (1.0 + curve * r2) * overscan;          // barrel: source coords bend outward at the rim
          vec2 suv = s * 0.5 + 0.5;
          // the glass: a rounded rectangle in tube space (bulges once the barrel is applied)
          vec2 sg = c * (1.0 + glassCurve * r2);
          vec2 q = abs(sg) - (glass - vec2(corner));
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
          float px = 2.0 / res.y;
          float inGlass = 1.0 - smoothstep(-px, px, d);
          vec3 hdr = texture2D(tDiffuse, clamp(suv, 0.0, 1.0)).rgb;
          vec2 v = suv * (1.0 - suv);
          hdr *= mix(1.0, clamp(pow(v.x * v.y * 18.0, 0.55), 0.0, 1.0), vignette);   // in light, so hot lines stay hot
          vec3 col = 1.0 - exp(-hdr * exposure);                 // per-channel: orange saturates to yellow, then white
          col += lift;
          float rim = smoothstep(-0.05, 0.0, d);                 // the glass darkens just inside its edge
          col *= 1.0 - 0.55 * rim;
          col *= 1.0 - scan * (0.5 + 0.5 * cos(suv.y * scanCount * 6.2831853));
          col += (hash(floor(vUv * res)) - 0.5) * grain * (0.25 + col);
          vec3 outc = mix(bezel, clamp(col, 0.0, 1.0), inGlass);
          gl_FragColor = vec4(linearOut > 0.5 ? dec(outc) : outc, 1.0);   // an sRGB target re-encodes on write
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    const toTarget = !this.renderToScreen && this.target;
    this.mat.uniforms.linearOut.value = toTarget && this.target.texture.colorSpace === THREE.SRGBColorSpace ? 1 : 0;
    renderer.setRenderTarget(toTarget ? this.target : null);
    this.quad.render(renderer);
  }
  setSize(w, h) { this.mat.uniforms.res.value.set(w, h); }
  dispose() { this.mat.dispose(); this.quad.dispose(); }
}

export class ScaledBloomPass extends UnrealBloomPass {
  constructor(res, strength, radius, threshold, scale = 1) {
    super(res, strength, radius, threshold);
    this.scale = scale;
    this.down = null;
    // the high pass reads the box-filtered small copy when the picture is scaled (UnrealBloomPass.render assigns the full
    // picture to this uniform; the getter hands it the small one instead)
    const u = this.highPassUniforms.tDiffuse, self = this;
    let v = u.value;
    Object.defineProperty(u, 'value', { get() { return self.scale !== 1 && self.down ? self.down.texture : v; }, set(x) { v = x; }, configurable: true });
  }
  setScale(s) { this.scale = s; }
  setSize(w, h) {
    if (this.scale === 1) { super.setSize(w, h); return; }
    const bw = Math.max(1, Math.round(w / this.scale)), bh = Math.max(1, Math.round(h / this.scale));
    super.setSize(bw, bh);
    if (!this.down) {
      this.down = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
      this.downMat = new THREE.ShaderMaterial({
        uniforms: { t: { value: null }, off: { value: new THREE.Vector2() } },
        vertexShader: VERT,
        // four bilinear taps a quarter of a small texel from its centre: a box over the big texels it covers
        fragmentShader: /* glsl */`
          uniform sampler2D t; uniform vec2 off; varying vec2 vUv;
          void main() {
            gl_FragColor = 0.25 * (texture2D(t, vUv + vec2(-off.x, -off.y)) + texture2D(t, vUv + vec2(off.x, -off.y)) +
                                   texture2D(t, vUv + vec2(-off.x, off.y)) + texture2D(t, vUv + vec2(off.x, off.y)));
          }`,
        depthTest: false, depthWrite: false,
      });
      this.downQuad = new FullScreenQuad(this.downMat);
    } else this.down.setSize(bw, bh);
    this.downMat.uniforms.off.value.set(0.25 / bw, 0.25 / bh);
  }
  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    if (this.scale !== 1 && this.down) {
      this.downMat.uniforms.t.value = readBuffer.texture;
      renderer.setRenderTarget(this.down);
      this.downQuad.render(renderer);
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
  dispose() { super.dispose(); this.down?.dispose(); this.downMat?.dispose(); this.downQuad?.dispose(); }
}
