// The picture: scene -> HDR target at the look's resolution -> bloom -> one grading pass to the screen.
// Grade follows the Unity post volume: bloom 0.55 @ 0.9, +0.55 EV, contrast 8, saturation -10, warm filter,
// ACES, vignette 0.3, thin grain. RETRO renders at 360 lines, FULL RETRO at 240, both with a 4x4 ordered dither.
import * as THREE from 'three';

const quadVert = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const brightFrag = /* glsl */`
  uniform sampler2D tSrc; uniform float threshold; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float b = max(c.r, max(c.g, c.b));
    float k = clamp((b - threshold * 0.6) / (threshold * 0.8), 0.0, 1.0);
    gl_FragColor = vec4(c * k * k, 1.0);
  }`;

const blurFrag = /* glsl */`
  uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 0.227027;
    s += texture2D(tSrc, vUv + dir * 1.3846).rgb * 0.3162162; s += texture2D(tSrc, vUv - dir * 1.3846).rgb * 0.3162162;
    s += texture2D(tSrc, vUv + dir * 3.2308).rgb * 0.0702703; s += texture2D(tSrc, vUv - dir * 3.2308).rgb * 0.0702703;
    gl_FragColor = vec4(s, 1.0);
  }`;

const finalFrag = /* glsl */`
  uniform sampler2D tScene; uniform sampler2D tBloom;
  uniform vec2 res; uniform float time, exposure, bloom, vignette, grain, dither, levels, fade;
  uniform vec3 filterCol; uniform vec3 fadeCol;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 fit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces(vec3 c) {
    const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    c /= 0.6; c = I * c; c = fit(c); c = O * c; return clamp(c, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  float bayer(vec2 p) {
    int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
    for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0;
    return 0.5;
  }
  void main() {
    vec2 px = floor(vUv * res);
    vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
    c *= exposure * filterCol;
    c = 0.18 * pow(max(c, vec3(1e-6)) / 0.18, vec3(1.08));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 0.9);
    c = aces(c);
    c = toSRGB(c);
    vec2 d = vUv - 0.5; d.x *= res.x / res.y * 0.75;
    c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d));
    c += (hash(px + fract(time) * 91.7) - 0.5) * grain;
    if (dither > 0.5) c = floor(c * levels + bayer(px)) / levels;
    c = mix(c, fadeCol, fade);
    gl_FragColor = vec4(c, 1.0);
  }`;

export class Pipeline {
  constructor(renderer) {
    this.r = renderer;
    this.mode = 'soft';
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.qscene = new THREE.Scene(); this.qscene.add(this.quad);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mBright = mk(brightFrag, { tSrc: { value: null }, threshold: { value: 0.9 } });
    this.mBlur = mk(blurFrag, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mFinal = mk(finalFrag, {
      tScene: { value: null }, tBloom: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 },
      exposure: { value: Math.pow(2, 0.55) }, bloom: { value: 0.55 }, vignette: { value: 0.3 }, grain: { value: 0.035 },
      dither: { value: 1 }, levels: { value: 31 }, fade: { value: 0 },
      filterCol: { value: new THREE.Vector3(1, 0.913, 0.787) }, fadeCol: { value: new THREE.Vector3(0, 0, 0) },
    });
    this.w = 0; this.h = 0;
  }
  setMode(mode) { this.mode = mode; this.resize(this.w, this.h, true); }
  resize(w, h, force) {
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.r.setSize(w, h, false);
    const pr = this.r.getPixelRatio();
    const lines = this.mode === 'full' ? 240 : this.mode === 'soft' ? 360 : Math.round(h * pr);
    // leaning into a tube (a cabinet or the board): enough lines to read 320x240 pixels cleanly
    const want = this.boost && this.mode !== 'clean' ? Math.max(lines, 480) : lines;
    const ih = Math.max(120, Math.min(want, Math.round(h * pr))), iw = Math.round(ih * w / h);
    const retro = this.mode !== 'clean';
    const filt = retro ? THREE.NearestFilter : THREE.LinearFilter;
    for (const t of [this.rtScene, this.rtA, this.rtB]) t && t.dispose();
    this.rtScene = new THREE.WebGLRenderTarget(iw, ih, { type: THREE.HalfFloatType, magFilter: filt, minFilter: THREE.LinearFilter, samples: retro ? 0 : 4 });
    const bw = Math.max(32, iw >> 2), bh = Math.max(24, ih >> 2);
    this.rtA = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.rtB = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    const u = this.mFinal.uniforms;
    u.res.value.set(iw, ih); u.dither.value = retro ? 1 : 0; u.levels.value = this.mode === 'full' ? 24 : 40;
    u.grain.value = retro ? 0.02 : 0.01;
    this.iw = iw; this.ih = ih;
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qscene, this.cam); }
  render(scene, camera, time) {
    this.r.setRenderTarget(this.rtScene); this.r.render(scene, camera);
    this.mBright.uniforms.tSrc.value = this.rtScene.texture; this.pass(this.mBright, this.rtA);
    for (let i = 0; i < 2; i++) {
      this.mBlur.uniforms.tSrc.value = this.rtA.texture; this.mBlur.uniforms.dir.value.set(1 / this.rtA.width, 0); this.pass(this.mBlur, this.rtB);
      this.mBlur.uniforms.tSrc.value = this.rtB.texture; this.mBlur.uniforms.dir.value.set(0, 1 / this.rtA.height); this.pass(this.mBlur, this.rtA);
    }
    const u = this.mFinal.uniforms;
    u.tScene.value = this.rtScene.texture; u.tBloom.value = this.rtA.texture; u.time.value = time;
    this.pass(this.mFinal, null);
  }
}
