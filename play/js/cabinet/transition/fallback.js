// THE REDRAW · the simple FALLBACK, for comparison: the win shrinks into a gold light, the light drops into its dot, a
// fade through black, then the next game's name card (the storyboard's f2) over its picture, which then clears to the
// game's own ready card.
//
//   const fb = createFallback(renderer, fromGame, toGame, { index, heart, card: { numeral, title, line } })
//   fb.begin() · fb.update(dt) -> u · fb.done · fb.blit() · fb.handoff() -> ProgressRow · fb.end()      (as redraw.js)
// The old picture is fromGame's last frame (its kit texture), shrunk in a composite; the light, the row and the card are
// drawn in toGame's own kit (so the row and the picture hand over exactly), over a dimmer that is gone at the end.
// Safety: all fades are >= 0.5 s; the light grows as the picture shrinks (no flash); nothing red.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { LineBatch, GlowDots, GlowLineMaterial, FillBatch } from '../lookkit/index.js';
import { drawText } from '../games/hearth/font.js';
import { ProgressRow } from './progress.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const span = (t, a, b) => ease((t - a) / (b - a));

export const FALLBACK_DEFAULTS = {
  index: 0, lit: [], heart: [627, 468],
  row: { count: 7, y: 872, spacing: 64, cx: 633 },
  // seconds
  shrink: [0.0, 0.9], drop: [0.75, 1.55], rowIn: [0.55, 1.0], cardIn: [1.75, 2.35], cardOut: [3.55, 4.15], end: 4.15,
  card: { numeral: 'II', title: 'THE CONSTELLATION', line: 'PROTECT THE TEMPLE · LIGHT THE SKY' },
  cardDim: 0.62,
};

export function createFallback(renderer, fromGame, toGame, opts = {}) {
  const o = { ...FALLBACK_DEFAULTS, ...opts, row: { ...FALLBACK_DEFAULTS.row, ...opts.row }, card: { ...FALLBACK_DEFAULTS.card, ...opts.card } };
  const kA = fromGame.kit, kB = toGame.kit, [FW, FH] = kB.frame;
  // the extras drawn in the new game's kit, above its picture
  const dim = new FillBatch(12); dim.object.renderOrder = 45;
  const mat = kB.track(new GlowLineMaterial({ width: 9 }));
  const card = new LineBatch(mat, 900); card.object.renderOrder = 50;
  const lightMat = kB.track(new GlowLineMaterial({ width: 8 }));
  const lightLines = new LineBatch(lightMat, 64); lightLines.object.renderOrder = 51;
  const light = kB.track(new GlowDots(8)); light.object.renderOrder = 51;
  const row = new ProgressRow({ ...o.row, renderOrder: 52 });
  // the composite: the old picture, shrunk about the heart, over the new kit's picture
  const comp = new THREE.ShaderMaterial({
    uniforms: { tA: { value: kA.texture }, tB: { value: kB.texture }, c: { value: new THREE.Vector2(o.heart[0] / FW, 1 - o.heart[1] / FH) },
      s: { value: 1 }, gA: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tA, tB; uniform vec2 c; uniform float s, gA; varying vec2 vUv;
      vec3 enc(vec3 x) { return mix(x * 12.92, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, x)); }
      void main() {
        vec2 ua = (vUv - c) / max(s, 1e-4) + c;
        float inA = step(0.0, ua.x) * step(ua.x, 1.0) * step(0.0, ua.y) * step(ua.y, 1.0);
        vec3 a = texture2D(tA, clamp(ua, 0.0, 1.0)).rgb * inA * gA;
        gl_FragColor = vec4(enc(a + texture2D(tB, vUv).rgb), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(comp);
  let t = 0, on = false, crisp = [];     // the new game's crisp overlay layer (drawn after the dimmer): its gains, to fade
  const lit = () => Array.from({ length: row.count }, (_, i) => (o.lit.includes(i) ? 1 : i === o.index ? span(t, o.drop[1] - 0.1, o.drop[1] + 0.35) : 0));

  function lightAt(s) {
    const P0 = o.heart, P3 = row.pos(o.index), P1 = [P0[0], P0[1] - 90], P2 = [P3[0], P3[1] - 240], w = 1 - s;
    return [0, 1].map((k) => w * w * w * P0[k] + 3 * w * w * s * P1[k] + 3 * w * s * s * P2[k] + s * s * s * P3[k]);
  }
  function drawCard(a) {
    card.clear();
    if (a > 0.002) {
      const C = [1.25, 0.58, 0.05], W = [1.45, 0.95, 0.11];
      // the numeral: straight strokes between two bars (a Roman numeral's serif look), as f2
      const n = o.card.numeral.length, h = 76, x0 = FW / 2, y0 = 300, gap = 30, bar = gap * (n - 1) / 2 + 16;
      card.line([[x0 - bar, y0], [x0 + bar, y0]], W.map((v) => v * a));
      card.line([[x0 - bar, y0 + h], [x0 + bar, y0 + h]], W.map((v) => v * a));
      for (let i = 0; i < n; i++) { const x = x0 + (i - (n - 1) / 2) * gap; card.line([[x, y0], [x, y0 + h]], W.map((v) => v * a)); }
      drawText(card, o.card.title, FW / 2, 425, { h: 46, color: C.map((v) => v * 1.15 * a), track: 2 });
      drawText(card, o.card.line, FW / 2, 515, { h: 20, color: C.map((v) => v * 0.9 * a), track: 2 });
    }
    card.commit();
  }

  const fb = {
    get u() { return clamp01(t / o.end); }, get done() { return t >= o.end; },
    begin() {
      fb.end();
      kB.scene.add(dim.object, card.object, lightLines.object, light.object); row.attach(kB);
      crisp = [];
      kB.overlay?.traverse((obj) => { const g = obj.material?.uniforms?.gain; if (g) crisp.push({ g, v: g.value }); });
      t = 0; on = true;
      kB.resetPersistence();
      fb._apply(0);
    },
    _apply(tt) {
      // the old picture shrinks into the light
      const s = 1 - 0.985 * span(tt, o.shrink[0], o.shrink[1]);
      comp.uniforms.s.value = s;
      comp.uniforms.gA.value = (1 - 0.35 * span(tt, o.shrink[0], o.shrink[1])) * (1 - span(tt, o.shrink[1] - 0.2, o.shrink[1] + 0.05));
      // the new picture: black until the card, dim under the card, clear at the end
      const cardA = span(tt, o.cardIn[0], o.cardIn[1]) * (1 - span(tt, o.cardOut[0], o.cardOut[1]));
      const up = span(tt, o.cardIn[0] - 0.1, o.cardIn[1]);
      const d = 1 - up * (1 - o.cardDim) - span(tt, o.cardOut[0], o.cardOut[1]) * o.cardDim;
      dim.clear(); if (d > 0.0005) dim.poly([[0, 0], [FW, 0], [FW, FH], [0, FH]], [0, 0, 0, clamp01(d)]); dim.commit();
      for (const c of crisp) c.g.value = c.v * (1 - clamp01(d));     // the crisp layer isn't under the dimmer: fade it too
      drawCard(cardA);
      // the light: grows at the heart as the picture shrinks into it, then drops into its dot
      light.clear(); lightLines.clear();
      const grow = span(tt, o.shrink[0] + 0.25, o.shrink[1]), sd = span(tt, o.drop[0], o.drop[1]);
      const g = grow * (1 - span(tt, o.drop[1], o.drop[1] + 0.3));
      if (g > 0.002) {
        const [x, y] = lightAt(sd);
        light.add(x, y, 30, [0.3 * g, 0.16 * g, 0.03 * g]); light.add(x, y, 9, [1.5 * g, 0.95 * g, 0.3 * g]);
        let prev = [x, y];
        if (sd > 0 && sd < 1) for (let k = 1; k <= 12; k++) {
          const p = lightAt(Math.max(0, sd - k * 0.014)), f = g * (1 - k / 13) ** 1.6;
          lightLines.seg(prev[0], prev[1], p[0], p[1], [1.2 * f, 0.7 * f, 0.14 * f]); prev = p;
        }
      }
      light.commit(); lightLines.commit();
      row.draw(lit(), span(tt, o.rowIn[0], o.rowIn[1]));
    },
    update(dt) {
      if (!on) return 1;
      t += Math.max(0, dt);
      fb._apply(t);
      kB.render(Math.min(Math.max(dt, 1e-4), 0.1));
      return fb.u;
    },
    blit() {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(null);
      comp.uniforms.tA.value = kA.texture; comp.uniforms.tB.value = kB.texture;
      quad.render(renderer);
      renderer.setRenderTarget(prev);
    },
    /** The row stays on in the new game's kit (it is already there, drawn as the fallback left it). */
    handoff() {
      row.draw(lit(), 1);
      detachExtras();
      detached = row;          // the row stays in the new game's kit; the caller detaches it when it is done with it
      return row;
    },
    end() {
      if (!on) return;
      detachExtras();
      if (detached !== row) row.detach(kB);
      detached = null;
      on = false;
    },
  };
  let detached = null;
  function detachExtras() {
    kB.scene.remove(dim.object, card.object, lightLines.object, light.object);
    for (const c of crisp) c.g.value = c.v;
    crisp = [];
  }
  return fb;
}
