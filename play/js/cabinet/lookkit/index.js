// lookkit/index.js — the shared vector look for the seven cabinet games (render-to-texture + glow + tube).
//
//   const kit = createLookKit(renderer, {
//     width: 1024, height: 768,          // the cabinet's own render size (4:3)
//     frame: [1024, 768],                // world units across the screen; x right, y DOWN (use frame coords)
//     bloom: { strength, radius, threshold, tint: [r, g, b] },   // tint colours the haze (e.g. warm amber)
//     phosphor: { tau: [r, g, b] } | false,   // persistence decay times (s); false turns it off
//     crt: { curve, glass, corner, vignette, scan, scanCount, exposure, lift, bezel, grain },
//     renderScale: 1,                    // OPTIONAL: draw at renderScale x (width, height) for a sharper picture on a big
//                                        // screen (e.g. 1.5). The frame, the camera and every game coordinate stay the same;
//                                        // the targets, the phosphor and the tube pass run at the scaled size; the bloom's
//                                        // blur runs at the unscaled size (ScaledBloomPass: the same glow radius); point
//                                        // sizes follow. Line widths are NOT multiplied: three's LineSegments2 resolves them
//                                        // against the canvas (renderer viewport), which the scale doesn't change, so a line
//                                        // keeps exactly the width it had. Leave it out (or 1) and nothing changes.
//   });
//   kit.scene / kit.camera     put the game's objects here (GlowLineMaterial batches, EmberField, GlowDots, Backdrop,
//                              FillBatch); draw order = renderOrder (backdrop -10, fills 2, lines 10, dots 5, embers 20)
//   kit.overlay                only with { overlay: true }: a second scene drawn AFTER the phosphor pass (no persistence,
//                              still bloomed): things that move fast and must not leave ghost copies (a crosshair)
//   kit.track(obj)             anything with setTargetHeight(h) (materials, particles) keeps its px size on resize
//   kit.render(dt)             one frame into kit.texture: scene -> phosphor -> bloom -> CRT
//   kit.texture                a STABLE THREE.Texture (sRGB) for the arcade to put on the cabinet's CRT
//   kit.output                 the WebGLRenderTarget behind it (readbacks, perf syncs)
//   kit.blit(viewport?)        draw kit.texture to the canvas (look-test pages); viewport = [x, y, w, h] in px
//   kit.setSize(w, h, scale?)  change the render size (line widths and point sizes follow); scale = a new renderScale
//   kit.renderScale / kit.renderWidth / kit.renderHeight   the scale and the size actually drawn (kit.output's size)
//   kit.dispose()
//
// The pipeline is HDR (half float) until the CRT pass, which tone-maps per channel (1 - e^-x): hot orange
// saturates to yellow and then to white, which is how phosphor cores read. Nothing in the kit flashes.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { PhosphorPass, CRTPass, ScaledBloomPass } from './passes.js';

export { GlowLineMaterial, LineBatch, ellipse, arc, bezier, catmull, polygon, star, REF_HEIGHT } from './glowlines.js';
export { EmberField, GlowDots, drawTrail, MotionTrail } from './particles.js';
export { drawDigits } from './segdigits.js';
export { Backdrop } from './backdrop.js';
export { FillBatch, convexHull } from './fills.js';
export { PhosphorPass, CRTPass, ScaledBloomPass } from './passes.js';

// A HOST's default (optional): the seven-game cabinet (js/cabinet/seven/) makes each game through the game's own create function,
// and asks every look kit made inside fn() for a renderScale the game doesn't pass itself (the cabinet's glass at full screen).
// A kit's own o.renderScale still wins. Nothing sets it on the games' own pages, so they render exactly as before.
let HOST_DEFAULTS = null;
export function withLookKitDefaults(defaults, fn) {
  const keep = HOST_DEFAULTS; HOST_DEFAULTS = defaults || null;
  try { return fn(); } finally { HOST_DEFAULTS = keep; }
}

export function createLookKit(renderer, o = {}) {
  let width = o.width ?? 1024, height = o.height ?? 768;
  // renderScale (optional): the picture is drawn at scale x the size; without it every path below is the original one
  const rs = o.renderScale !== undefined ? o.renderScale : HOST_DEFAULTS ? HOST_DEFAULTS.renderScale : undefined;
  const scaled = rs !== undefined;
  let scale = scaled ? Math.max(0.25, +rs || 1) : 1;
  const px = (v) => (scaled ? Math.max(1, Math.round(v * scale)) : v);
  let rw = px(width), rh = px(height);
  const frame = o.frame ?? [1024, 768];
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, frame[0], 0, -frame[1], -10, 10);
  camera.position.z = 5;

  const overlay = o.overlay ? new THREE.Scene() : null;
  const sceneRT = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, depthBuffer: false });
  const output = new THREE.WebGLRenderTarget(rw, rh, {
    depthBuffer: false, colorSpace: THREE.SRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  output.texture.name = 'lookkit.output';

  const composer = new EffectComposer(renderer, sceneRT);
  composer.setPixelRatio(1);
  composer.renderToScreen = false;
  const renderPass = new RenderPass(scene, camera, null, new THREE.Color(0, 0, 0), 1);
  const phosphor = new PhosphorPass(rw, rh, o.phosphor || {});
  const b = o.bloom ?? {};
  const bloom = scaled
    ? new ScaledBloomPass(new THREE.Vector2(width, height), b.strength ?? 0.9, b.radius ?? 0.55, b.threshold ?? 0.35, scale)
    : new UnrealBloomPass(new THREE.Vector2(width, height), b.strength ?? 0.9, b.radius ?? 0.55, b.threshold ?? 0.35);
  if (b.tint) for (const c of bloom.bloomTintColors) c.set(...b.tint);
  const crt = new CRTPass(output, o.crt ?? {});
  composer.addPass(renderPass);
  if (o.phosphor !== false) composer.addPass(phosphor);
  if (overlay) { const op = new RenderPass(overlay, camera); op.clear = false; composer.addPass(op); }
  composer.addPass(bloom);
  composer.addPass(crt);
  crt.mat.uniforms.res.value.set(rw, rh);

  // what a tracked object sizes itself by: point sizes are in the target's own pixels (the scaled height); line widths are
  // resolved by three against the canvas, not the target, so they keep the unscaled height (see renderScale above)
  const tracked = new Set();
  const heightFor = (obj) => (scaled && !obj.isLineMaterial ? rh : height);
  const track = (obj) => { tracked.add(obj); obj.setTargetHeight?.(heightFor(obj)); return obj; };

  const blitMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: output.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D t; varying vec2 vUv;
      vec3 enc(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() { gl_FragColor = vec4(enc(texture2D(t, vUv).rgb), 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const blitQuad = new FullScreenQuad(blitMat);
  const _vp = new THREE.Vector4();

  const kit = {
    scene, camera, composer, bloom, phosphor, crt, frame, overlay,
    get texture() { return output.texture; },
    get output() { return output; },          // the WebGLRenderTarget behind kit.texture (for readbacks)
    get width() { return width; }, get height() { return height; },
    get renderScale() { return scale; }, get renderWidth() { return rw; }, get renderHeight() { return rh; },
    track,
    render(dt = 1 / 60) {
      const prev = renderer.getRenderTarget();
      phosphor.dt = Math.min(Math.max(dt, 0), 0.1);
      composer.render(dt);
      renderer.setRenderTarget(prev);
    },
    blit(viewport) {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(null);
      if (viewport) { renderer.getViewport(_vp); renderer.setViewport(...viewport); }
      blitQuad.render(renderer);
      if (viewport) renderer.setViewport(_vp);
      renderer.setRenderTarget(prev);
    },
    setSize(w, h, s) {
      width = w; height = h;
      if (scaled && s !== undefined) { scale = Math.max(0.25, +s || 1); bloom.setScale(scale); }
      rw = px(w); rh = px(h);
      composer.setSize(rw, rh);
      output.setSize(rw, rh);
      for (const t of tracked) t.setTargetHeight?.(heightFor(t));
    },
    /** Clears the persistence history (after a jump in time, so no trail smears across the jump). */
    resetPersistence() { phosphor.reset = true; },
    dispose() {
      composer.dispose?.(); sceneRT.dispose(); output.dispose(); phosphor.dispose(); crt.dispose(); bloom.dispose();
      blitMat.dispose(); blitQuad.dispose();
    },
  };
  return kit;
}
