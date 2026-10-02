// THE NODE · THE ASCENT · THE PICTURE (three.js, the look kit). Reads the round, never changes it.
//
//   const view = new AscentView(kit); await view.ready;      kit = createLookKit(renderer, { ...ASCENT_LOOK })
//   view.update(sim, dt, t, ui)       ui = { mode: 'attract' | 'play', hi, last }
//
// THE HEARTH PRINCIPLE: the painting carries the look; code draws only what moves or lights up (PIPELINES.md section 10).
//   the plate: the tube, the stars and a faint deep-teal sea-glow along the bottom. The sea-glow swells when Atlantis rises.
//   THE ISLANDS ARE PAINTED PIECES (assets/ascent/, cut by tools/ascent_cut_sprites.py from ChatGPT's two sheets in the
//   concept's own style). Each piece is a textured quad drawn in two passes, back to front: its SOLID silhouette first (black,
//   normal blend: it hides the stars and any piece behind it), then its painting (additive, in the plate's light space, so it
//   shows exactly as painted). Each piece carries a LIT and an UNLIT painting in exact register (the unlit one is computed: the
//   gold dimmed to a sleeping amber); a pad island crossfades unlit -> lit over 0.8 s when its pad is lit, the temple when it
//   opens. Rest islands are shown as painted. The pieces drift as wholes (layout.js islandAt), exactly where the round has them.
//   live light over the paint: a faint breathing ring on each sleeping pad (land here), the pad's glow when it is lit and a
//   ring that spreads from it, the tower's carving brightening, the temple's centre and its dotted beam when it opens
//   the crisp layer (kit.overlay, no persistence): the lander (the concept's: a flat-topped cabin, splayed legs; gold legs
//   while your descent is safe, red-orange while it is too fast: steady colours, never a blink), its flame and dotted
//   exhaust, the crystals (faceted prisms, steady, dotted trails), the shatter (a soft white burst and red pieces that only
//   fade), the crash, the score (7-segment, cyan, top left), N TO RISE, the fuel gauge, ships, banners, cards
//   ATLANTIS RISES: the painted islands draw together and fade while PLATO'S rings (exact circles, the canal, the axis) grow.
// Safety: nothing steps or blinks. Every light change is eased; the shatter's bright part is white, eased in over 60 ms and
// out over 0.8 s, small; red pieces only fade; no full-screen flash anywhere.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, arc, GlowDots, drawDigits, Backdrop, FillBatch } from '../../lookkit/index.js';
import { FRAME, CX, ISLANDS, FIGURE } from './layout.js';
import { MEASURED } from './plate_measured.js';
import { TUNE } from './spec.js';
import { drawText, textWidth } from '../hearth/font.js';

/** drawText, with a '+' (the stroke font has none): a plus drawn from two strokes before the number. */
function drawScore(b, text, x, y, o) {
  if (text[0] !== '+') return drawText(b, text, x, y, o);
  const h = o.h ?? 13, rest = text.slice(1), pw = h * 0.75, w = textWidth(rest, h, o.track ?? 1), x0 = x - (w + pw) / 2;
  const cx = x0 + pw * 0.35, cy = y + h * 0.5, r = h * 0.3;
  b.seg(cx - r, cy, cx + r, cy, o.color, o.color); b.seg(cx, cy - r, cx, cy + r, o.color, o.color);
  return drawText(b, rest, x0 + pw + w / 2, y, o);
}

const ROOT = new URL('../../../../', import.meta.url);
export const PLATE_URL = new URL('assets/looktest/ascent_plate.png', ROOT).href;

export const ASCENT_LOOK = {
  frame: FRAME,
  overlay: true,              // crisp layer after the phosphor pass: the lander, crystals and shots leave no ghost copies
  // the paintings carry their own glow: the kit's bloom only catches the hottest cores (the lander, the bursts), so the
  // painted islands stay as crisp as the sheets
  bloom: { strength: 0.32, radius: 0.34, threshold: 2.6, tint: [1.0, 0.85, 0.6] },
  phosphor: { tau: [0.03, 0.035, 0.045] },
  // the plate already shows the tube and its bezel: no curvature, no glass edge of the kit's own
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.1, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

// HDR light. hot: how white a colour's line core burns
const HOT_GOLD = [1.0, 1.9, 7.0], HOT_CYAN = [2.4, 1.7, 1.25], HOT_RED = [1.15, 2.0, 2.6], HOT_LANDER = [1.8, 1.5, 1.2], HOT_LEGS = [1.45, 1.55, 1.5];
const C = {
  gold: [0.85, 0.5, 0.05], goldHot: [1.15, 0.74, 0.11], goldDim: [0.42, 0.25, 0.03],
  cyan: [0.07, 0.5, 0.68], cyanDim: [0.05, 0.3, 0.42],
  lander: [0.45, 0.85, 1.2], legs: [0.47, 0.86, 1.15], legSafe: [1.15, 0.78, 0.12], legFast: [1.5, 0.3, 0.05],
  red: [1.25, 0.13, 0.068], dim: [0.5, 0.06, 0.04],
  white: [0.75, 0.92, 1.1], score: [0.14, 0.62, 0.78], text: [0.12, 0.58, 0.75], sea: [0.06, 0.4, 0.5],
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
const TAU = Math.PI * 2;

const SOLID = { dash: 1, gap: 0, width: 1, speed: 0 };
const THIN = { dash: 1, gap: 0, width: 0.66, speed: 0 };
const FINE = { dash: 1, gap: 0, width: 0.5, speed: 0 };
const BOLD = { dash: 1, gap: 0, width: 1.25, speed: 0 };
const AXIS = { dash: 2.2, gap: 6.8, width: 0.9, speed: 0 };

// the lander, after the concept: a flat-topped cabin with a crossbar and a window, an engine skirt, splayed legs with feet
// (local px, y down, 0,0 = the collision centre; the feet stand exactly TUNE.lander.r below it, on the walk line)
const R = TUNE.lander.r;
const LANDER = {
  cabin: [[-4.5, -18], [4.5, -18], [15, 5], [-15, 5]],
  body: [[[-4.5, -18], [4.5, -18], [15, 5], [-15, 5], [-4.5, -18]], [[-8.3, -9.5], [8.3, -9.5]], [[-12, 5], [-10, 9.5], [10, 9.5], [12, 5]],
    [[-4, 9.5], [-5.5, 13], [5.5, 13], [4, 9.5]]],
  legs: [[[-11, 5], [-21.5, R]], [[11, 5], [21.5, R]], [[-26, R], [-17, R]], [[17, R], [26, R]]],
};
// a crystal, after the concept: an elongated faceted prism, a flat end and a pointed cap (local px, long axis down)
const GEM = [[-12, -22], [1, -29], [14, -21], [13, 12], [1, 30], [-13, 13]];
const GEM_IN = [[[-12, -22], [1, -15]], [[1, -15], [14, -21]], [[1, -15], [0, 19]], [[-13, 13], [0, 19]], [[0, 19], [13, 12]], [[0, 19], [1, 30]]];

// ---- the painted pieces: one strip texture per piece, [lit | unlit | solid mask] ----
// (the glass: the plate's lit tube face as a rounded rectangle, fitted to plate_measured.js; nothing is painted onto the bezel)
const GLASS_GLSL = /* glsl */`
  float glassMask(vec2 f) {
    const float R = 120.0;
    vec2 q = abs(f - vec2(634.0, 473.5)) - (vec2(570.0, 431.5) - vec2(R));
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - R;
    return 1.0 - smoothstep(-5.0, -1.5, d);
  }`;
const PIECE_VERT = /* glsl */`varying vec2 vUv; varying vec2 vF;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vF = vec2(w.x, -w.y); gl_Position = projectionMatrix * viewMatrix * w; }`;
const PAINT_FRAG = /* glsl */`
  uniform sampler2D map; uniform float lit, gain, alpha;
  varying vec2 vUv; varying vec2 vF;
  ${GLASS_GLSL}
  void main() {
    vec2 u = vec2(vUv.x / 3.0, vUv.y);
    vec3 on = texture2D(map, u).rgb, off = texture2D(map, u + vec2(1.0 / 3.0, 0.0)).rgb;
    vec3 v = mix(off, on, lit) * gain;
    vec3 x = -log(max(vec3(1.0) - v, vec3(0.03)));            // the painting -> light (the tone map gives it back)
    gl_FragColor = vec4(x * alpha * glassMask(vF), 1.0);
  }`;
const SOLID_FRAG = /* glsl */`
  uniform sampler2D map; uniform float alpha;
  varying vec2 vUv; varying vec2 vF;
  ${GLASS_GLSL}
  void main() { float m = texture2D(map, vec2(vUv.x / 3.0 + 2.0 / 3.0, vUv.y)).r; gl_FragColor = vec4(0.0, 0.0, 0.0, m * alpha * glassMask(vF)); }`;

function loadTexture(url) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  const ready = new Promise((resolve, reject) => {
    new THREE.ImageLoader().load(url, (img) => { tex.image = img; tex.needsUpdate = true; resolve(); }, undefined, reject);
  });
  return { tex, ready };
}

class Piece {
  constructor(def, tex, rank, scene) {
    this.def = def;
    const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5, -0.5, 0);           // (the origin at the top-left corner)
    this.uPaint = { map: { value: tex }, lit: { value: 1 }, gain: { value: 1 }, alpha: { value: 1 } };
    this.uSolid = { map: { value: tex }, alpha: { value: 1 } };
    this.solid = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.uSolid, vertexShader: PIECE_VERT, fragmentShader: SOLID_FRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending }));
    this.paint = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.uPaint, vertexShader: PIECE_VERT, fragmentShader: PAINT_FRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }));
    this.solid.renderOrder = 1 + rank * 0.02; this.paint.renderOrder = 1.01 + rank * 0.02;
    for (const m of [this.solid, this.paint]) { m.frustumCulled = false; scene.add(m); }
    this.k = def.kind === 'rest' ? 1 : 0;                                        // the eased unlit -> lit (0..1)
  }
  /** Place the painting so its anchor (the walk line's centre) sits on (x, y), at scale sc. */
  place(x, y, sc, lit, gain, alpha) {
    const d = this.def, left = x - d.anchor[0] * sc, top = y - d.anchor[1] * sc;
    for (const m of [this.solid, this.paint]) { m.position.set(left, -top, 0); m.scale.set(d.size[0] * sc, d.size[1] * sc, 1); m.visible = alpha > 0.002 && sc > 0.001; }
    this.uPaint.lit.value = lit; this.uPaint.gain.value = gain; this.uPaint.alpha.value = alpha; this.uSolid.alpha.value = alpha;
  }
}

export class AscentView {
  constructor(kit) {
    this.kit = kit;
    const { scene } = kit;
    // ---- layer 1: the plate ----
    const plate = loadTexture(PLATE_URL);
    this.backdrop = new Backdrop({
      frame: FRAME, map: plate.tex,
      uniforms: { sea: { value: 0.3 }, open: { value: 0 }, dark: { value: 0 } },
      shade: /* glsl */`
        vec3 x = -log(max(vec3(1.0) - tex.rgb, vec3(0.03)));      // the painting -> light (the tone map gives it back)
        // the sea-glow: deep teal along the bottom (the plate's own, lifted a little), rising when Atlantis rises
        x += sea * vec3(0.0, 0.0045, 0.006) * smoothstep(560.0, 930.0, f.y);
        vec2 d = f - vec2(${FIGURE.cx.toFixed(1)}, ${FIGURE.cy.toFixed(1)});
        x += open * vec3(0.006, 0.011, 0.016) * exp(-dot(d, d) / (2.0 * 260.0 * 260.0));
        return x * (1.0 - 0.45 * dark);`,
    });
    scene.add(this.backdrop.object);
    // the painted stars the live layer lifts a little (steady: stars never twinkle here); under the islands (they hide them)
    this.starDots = kit.track(new GlowDots(120)); this.starDots.object.renderOrder = -5;
    scene.add(this.starDots.object);
    this.stars = MEASURED.stars.slice(0, 44);

    // ---- layer 2: the painted islands, back to front ----
    const loads = [plate.ready];
    const order = [...ISLANDS].sort((a, b) => a.z - b.z);
    this.pieces = new Array(ISLANDS.length);
    order.forEach((def, rank) => {
      const T = loadTexture(new URL(`assets/ascent/${def.sprite}.png`, ROOT).href);
      loads.push(T.ready);
      this.pieces[def.id] = new Piece(def, T.tex, rank, scene);
    });
    this.ready = Promise.all(loads);

    // ---- live light over the paint ----
    const T = (o) => kit.track(new GlowLineMaterial(o));
    this.matGold = T({ width: 3.5, coreFrac: 0.16, coreGain: 2.6, haloGain: 0.5, hot: HOT_GOLD });
    this.matCyan = T({ width: 3.3, coreFrac: 0.15, coreGain: 2.3, haloGain: 0.42, hot: HOT_CYAN });
    this.matLander = T({ width: 5.6, coreFrac: 0.2, coreGain: 2.4, haloGain: 0.8, hot: HOT_LANDER });
    this.matLegs = T({ width: 5.6, coreFrac: 0.2, coreGain: 2.4, haloGain: 0.8, hot: HOT_LEGS });
    this.matCrystal = T({ width: 3.9, coreFrac: 0.17, coreGain: 2.2, haloGain: 0.9, hot: HOT_RED });
    this.matFrag = T({ width: 4.6, coreFrac: 0.18, coreGain: 2.4, haloGain: 0.8, hot: HOT_RED });
    this.matFx = T({ width: 5.0, coreGain: 2.8, haloGain: 0.7, hot: HOT_CYAN });
    this.matFxGold = T({ width: 5.0, coreGain: 2.8, haloGain: 0.8, hot: HOT_GOLD });
    this.matUI = T({ width: 7.0, coreGain: 3.0, haloGain: 0.8, hot: HOT_CYAN });
    this.matText = T({ width: 6.4, coreGain: 2.8, haloGain: 0.8, hot: HOT_CYAN });

    const B = (mat, n, order) => { const b = new LineBatch(mat, n); b.object.renderOrder = order; return b; };
    this.sCyan = B(this.matCyan, 1600, 8); this.sGold = B(this.matGold, 2400, 10);
    this.dots = kit.track(new GlowDots(400)); this.dots.object.renderOrder = 12;
    scene.add(this.sCyan.object, this.sGold.object, this.dots.object);
    // the crisp layer
    this.fills = new FillBatch(240); this.fills.object.renderOrder = 13;
    this.sCrystal = B(this.matCrystal, 900, 14); this.sFrag = B(this.matFrag, 900, 15); this.sFx = B(this.matFx, 1400, 16);
    this.sFxGold = B(this.matFxGold, 700, 17);
    this.sLegs = B(this.matLegs, 400, 19); this.sLander = B(this.matLander, 500, 20);
    this.crispDots = kit.track(new GlowDots(500)); this.crispDots.object.renderOrder = 21;
    this.band = new FillBatch(96); this.band.object.renderOrder = 30;
    this.sUI = B(this.matUI, 1400, 40); this.sText = B(this.matText, 3600, 41);
    (kit.overlay ?? scene).add(this.fills.object, this.sCrystal.object, this.sFrag.object, this.sFx.object, this.sFxGold.object, this.sLegs.object,
      this.sLander.object, this.crispDots.object, this.band.object, this.sUI.object, this.sText.object);
    this._reset();
  }

  _reset() {
    this.fx = []; this.banner = null; this.lower = null;
    this.cv = new Map();                       // crystal id -> { born }
    this.m1 = 0; this.m2 = 0; this.lostK = 0; this.legK = [...C.legs]; this.warnK = 0; this.thrK = 0; this.landerK = 1; this.sideK = 0;
    this.uiIn = 0; this.dimK = 0.35; this.openK = 0;
    for (const p of this.pieces ?? []) if (p) p.k = p.def.kind === 'rest' ? 1 : 0;
  }

  /** One frame. sim = the round being shown (the attract demo or the real one). */
  update(sim, dt, t, ui = {}) {
    if (sim !== this._sim) { this._sim = sim; this._reset(); this.kit.resetPersistence?.(); }
    this._dt = dt; this._t = t;
    const batches = [this.sCyan, this.sGold, this.sCrystal, this.sFrag, this.sFx, this.sFxGold, this.sLegs, this.sLander];
    for (const b of batches) b.clear();
    this.dots.clear(); this.crispDots.clear(); this.fills.clear(); this.starDots.clear();
    this._events(sim, t);
    this._state(sim, dt, t, ui);
    this._stars();
    this._islands(sim, dt, t);
    this._figure(sim, t);
    this._crystals(sim, dt, t);
    this._lander(sim, dt, t);
    this._effects(sim, dt, t);
    for (const b of batches) b.commit();
    this.dots.commit(); this.crispDots.commit(); this.fills.commit(); this.starDots.commit();
    this._ui(sim, t, ui);
  }

  // ---------------- events -> effects ----------------
  _events(sim, t) {
    for (const e of sim.events) {
      if (e.kind === 'stomp') {
        this.fx.push({ k: 'burst', x: e.x, y: e.y, t0: t, dur: 0.85, seed: e.id, big: 1 });
        for (let i = 0; i < 6; i++) {                                    // the gem's facets fly out as red pieces that only fade
          const a = hash1(e.id * 11 + i) * TAU, v = 150 + 170 * hash1(e.id * 5 + i), j = (i + 1) % GEM.length;
          const p0 = GEM[i], p1 = GEM[j], cx = (p0[0] + p1[0]) / 3, cy = (p0[1] + p1[1]) / 3;
          this.fx.push({ k: 'piece', pts: [[p0[0] - cx, p0[1] - cy], [p1[0] - cx, p1[1] - cy], [-cx, -cy]], x: e.x + cx, y: e.y + cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
            vr: (hash1(e.id * 7 + i) - 0.5) * 3.4, t0: t, dur: 1.3, g: 170, drag: 0.3 });
        }
        for (let i = 0; i < 8; i++) {
          const a = hash1(e.id * 37 + i) * TAU, v = 130 + 230 * hash1(e.id * 41 + i);
          this.fx.push({ k: 'speck', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: t, dur: 0.9 + 0.5 * hash1(e.id * 43 + i), drag: 0.27 });
        }
        this.fx.push({ k: 'text', text: '+' + e.pts, x: e.x, y: e.y - 30, t0: t + 0.05, dur: 1.2, c: C.white });
        if (e.chain > 1) this.fx.push({ k: 'text', text: 'x' + e.chain + ' CHAIN', x: e.x, y: e.y - 8, t0: t + 0.12, dur: 1.1, c: C.goldHot, h: 11 });
      } else if (e.kind === 'lifeLost') {
        this.fx.push({ k: 'burst', x: e.x, y: e.y, t0: t, dur: 1.0, seed: 90 + e.left, big: 1.15, soft: true });
        const segs = [...LANDER.body.flatMap((l) => l.slice(1).map((p, i) => [l[i], p])), ...LANDER.legs.map((l) => [l[0], l[1]])];
        segs.forEach((sg, i) => {
          const mx = (sg[0][0] + sg[1][0]) / 2, my = (sg[0][1] + sg[1][1]) / 2;
          this.fx.push({ k: 'lFrag', a: [sg[0][0] - mx, sg[0][1] - my], b: [sg[1][0] - mx, sg[1][1] - my], x: e.x + mx, y: e.y + my, vx: mx * 5 + (hash1(i * 3 + e.left) - 0.5) * 60 + (e.vx ?? 0) * 0.3,
            vy: my * 5 - 60 - hash1(i * 7) * 60, vr: (hash1(i * 5 + e.left) - 0.5) * 6, t0: t, dur: 1.5, g: 340, leg: i >= segs.length - 4 });
        });
        this.lower = { a: e.why === 'hard' ? 'TOO FAST · THAT LANDING WAS HARD' : e.why === 'crystal' ? 'STRUCK BY A CRYSTAL · COME DOWN ON THEM' : 'LOST TO THE SEA', t0: t + 0.2, dur: 2.2 };
      } else if (e.kind === 'light') {
        this.fx.push({ k: 'padRing', id: e.id, t0: t, dur: 1.6 });
        this.fx.push({ k: 'text', text: '+' + e.pts, x: e.x, y: e.y - 70, t0: t + 0.1, dur: 1.3, c: C.goldHot });
      } else if (e.kind === 'open') {
        this.banner = { a: 'THE TEMPLE OPENS', b: 'LAND ON THE TEMPLE', t0: t + 0.5, dur: 3.4 };
      } else if (e.kind === 'almost') {
        this.banner = { a: 'ALMOST THERE', b: e.left + ' PAD' + (e.left === 1 ? '' : 'S') + ' TO RISE', t0: t + 0.4, dur: 2.6 };
      } else if (e.kind === 'soft') {
        this.fx.push({ k: 'dust', x: e.x, y: e.y + R, t0: t, dur: 0.6 });
      } else if (e.kind === 'bump') {
        this.fx.push({ k: 'spark', x: e.x, y: e.y, t0: t, dur: 0.35 });
      } else if (e.kind === 'dry') {
        this.lower = { a: 'OUT OF FUEL · FIND AN ISLAND', t0: t, dur: 2.4 };
      } else if (e.kind === 'ward') {
        this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 1.4, r0: 30, r1: 70, c: C.white });
        this.lower = { a: 'A WARD OF LIGHT HOLDS', t0: t, dur: 2.2 };
      } else if (e.kind === 'gone' || e.kind === 'hit') {
        this.fx.push({ k: 'gem', x: e.x, y: e.y, t0: t, dur: 0.7, a: this.cv.get(e.id)?.cur ?? 0 });
      }
    }
  }

  // ---------------- eased state: the win's morph, the loss, the title dim ----------------
  _state(sim, dt, t, ui) {
    const won = sim.phase === 'card' && sim.result === 2, lost = sim.phase === 'card' && sim.result === 1;
    const pt = won ? sim.phaseTime : -1;
    this.m1 = won ? smooth(0.5, 3.3, pt) : Math.max(0, this.m1 - dt * 1.5);
    this.m2 = won ? smooth(2.7, 5.6, pt) : Math.max(0, this.m2 - dt);
    this.lostK += ((lost ? 1 : 0) - this.lostK) * (1 - Math.exp(-dt / 1.1));
    // the title and the first ready card dim the islands (about 35%) so the words read cleanly
    const firstReady = sim.phase === 'ready' && sim.readyDur > 2 && sim.phaseTime < sim.readyDur - 0.5;
    const dimT = ui.mode === 'attract' || firstReady ? 0.35 : 1;
    this.dimK += (dimT - this.dimK) * (1 - Math.exp(-dt / 0.35));
    const u = this.backdrop.uniforms;
    u.sea.value = 0.35 + 0.9 * this.m2 + 0.25 * sim.padsLit / Math.max(1, sim.padsTotal);
    u.open.value = this.m2;
    u.dark.value = this.lostK;
  }
  /** the win's transform: the islands draw together (about the figure's centre) and fade; the loss sinks them a little */
  _wm(p) {
    if (this.m1 <= 0 && this.lostK <= 0.001) return p;
    const e = this.m1 * this.m1 * (3 - 2 * this.m1) * 0.94, sink = this.lostK * 26;
    return [FIGURE.cx + (p[0] - FIGURE.cx) * (1 - e), FIGURE.cy + (p[1] - FIGURE.cy) * (1 - e) + sink];
  }
  get _shrink() { const e = this.m1 * this.m1 * (3 - 2 * this.m1) * 0.94; return 1 - e; }
  get _alive() { return (1 - smooth(0.45, 1.0, this.m1)) * (1 - 0.45 * this.lostK); }

  _stars() {
    const k = (1 - 0.5 * this.lostK) * (1 - 0.25 * this.m2);
    for (const [x, y, b, kind] of this.stars) {
      const g = (clamp01(b / 60) * 0.6 + 0.2) * k;
      const c = kind === 'g' ? [1.0, 0.62, 0.12] : [0.15, 0.6, 0.9];
      this.starDots.add(x, y, 2.6, mul(c, 0.5 * g));
      this.starDots.add(x, y, 8, mul(c, 0.1 * g));
    }
  }

  // ---------------- THE ISLANDS: the painted pieces, and the light over them ----------------
  _islands(sim, dt, t) {
    const alive = this._alive, shrink = this._shrink, gain = this.dimK;
    const step = dt / 0.8;                                              // unlit -> lit in 0.8 s, eased (never a blink)
    // the temple wakes by degrees as the pads are lit (about half awake with one pad to go), fully when it opens
    const openT = sim.temple.open ? 1 : 0.55 * sim.padsLit / Math.max(1, sim.padsTotal);
    this.openK += Math.max(-dt / 1.6, Math.min(dt / 1.6, openT - this.openK));
    const left = Math.max(0, sim.padsTotal - sim.padsLit);
    for (const s of sim.islands) {
      const P = this.pieces[s.id], d = s.def;
      if (d.kind === 'pad') P.k = s.padOn ? (s.lit ? Math.min(1, P.k + step) : Math.max(0, P.k - step)) : 1;
      else if (d.kind === 'temple') P.k = this.openK;              // (the beam and the ring below wait for the opening itself)
      const lit = d.kind === 'rest' ? 1 : smooth(0, 1, P.k);
      const [x, y] = this._wm([s.x, s.y]);
      P.place(x, y, d.s * shrink, lit, gain, alive);
      if (alive < 0.01) continue;
      const sc = d.s * shrink, W = (dx, dy) => [x + dx * shrink, y + dy * shrink];
      const g = alive * gain;
      if (d.kind === 'pad' && s.padOn) {
        const c0 = W(d.ring.dx, d.ring.dy), rx = d.ring.rx * shrink, ry = rx * 0.3;
        if (lit < 0.999) {
          // a sleeping pad: a faint ring breathing slowly on the painted pad (land here); the last few call a little louder
          const call = left <= 2 ? 1.5 : 1, br = (0.75 + 0.25 * Math.sin(t * 1.6 + s.id * 1.3)) * (1 - lit);
          this.sGold.loop(arc(c0[0], c0[1], rx * 1.12, ry * 1.12, 0, TAU, 40).slice(0, 40), mul(C.gold, 0.55 * call * br * g), THIN);
          this.dots.add(c0[0], c0[1], 16 * shrink + 4, mul([0.5, 0.3, 0.05], 0.35 * call * br * g));
        }
        if (lit > 0.001) {                                             // lit: its glow, and the tower's carving brightens
          this.dots.add(c0[0], c0[1], 9 * shrink + 3, mul([1.1, 0.75, 0.2], 0.55 * lit * g));
          this.dots.add(c0[0], c0[1] - 4 * shrink, rx * 1.35, mul([0.2, 0.12, 0.02], lit * g));
          if (d.carve) {
            const cv = W(d.carve.dx, d.carve.dy);
            this.dots.add(cv[0], cv[1], 7 * shrink + 2, mul([1.3, 0.95, 0.4], 0.6 * lit * g));
            this.dots.add(cv[0], cv[1], 38 * shrink, mul([0.18, 0.11, 0.02], lit * g));
          }
        }
        void sc;
      } else if (d.kind === 'temple') {
        const c0 = W(d.ring.dx, d.ring.dy), k = sim.temple.open ? smooth(0.55, 1, this.openK) : 0;
        this.dots.add(c0[0], c0[1], 10 + 6 * k, mul([1.2, 0.8, 0.2], (0.1 + 0.45 * k) * g));
        this.dots.add(c0[0], c0[1], 50 + 40 * k, mul([0.16, 0.09, 0.012], (0.15 + 0.8 * k) * g));
        if (k > 0.01) {                                                // open: a dotted beam of light rises from the ring (land here)
          const n = 14;
          for (let i = 1; i <= n; i++) {
            const f = i / n, yy = c0[1] - 14 - f * 190 * k;
            this.dots.add(c0[0], yy, 2.4 - f, mul([1.2, 0.85, 0.3], (1 - f) * 0.8 * k * g));
          }
          const br = 0.8 + 0.2 * Math.sin(t * 1.4);
          this.sGold.loop(arc(c0[0], c0[1], d.ring.rx * 1.08 * shrink, d.ring.rx * 0.27 * shrink, 0, TAU, 56).slice(0, 56), mul(C.goldHot, 0.35 * k * br * g), THIN);
        }
      }
    }
  }

  // ---------------- PLATO'S ATLANTIS: the win's figure (exact circles) ----------------
  _figure(sim, t) {
    if (this.m2 <= 0.001) return;
    const F = FIGURE, m = this.m2, cx = F.cx, cy = F.cy;
    const rings = F.radii;
    rings.forEach((r0, i) => {
      const g = smooth(i * 0.08, 0.55 + i * 0.08, m), r = r0 * g;
      if (g <= 0.001) return;
      const water = i % 2 === 1;                                              // the rings of water are cyan, the rings of land gold
      const col = water ? mul(C.cyan, 1.05 * g) : mul(C.goldHot, 0.95 * g);
      // the canal: each ring is broken by the canal running straight down to the sea
      const gapA = Math.asin(Math.min(1, F.canal / Math.max(r, F.canal + 1)));
      const a0 = Math.PI / 2 + gapA, a1 = Math.PI / 2 + TAU - gapA, n = Math.max(56, Math.round(r / 1.6)), P = [];
      for (let j = 0; j <= n; j++) { const a = a0 + (a1 - a0) * j / n; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      (water ? this.sCyan : this.sGold).line(P, col, i === rings.length - 1 ? BOLD : SOLID);
      if (!water && i > 0) this.sGold.loop(arc(cx, cy, r - 7 * g, r - 7 * g, 0, TAU, 60).slice(0, 60), mul(col, 0.4), FINE);
    });
    // the canal to the sea and the axis (both stop short of the win card's words below the figure)
    const gc = smooth(0.4, 0.9, m), rr = rings[rings.length - 1];
    for (const sx of [-1, 1]) this.sGold.seg(cx + sx * F.canal, cy + rings[0], cx + sx * F.canal, cy + rr + 22 * gc, mul(C.goldHot, 0.7 * gc), mul(C.goldHot, 0.7 * gc), THIN);
    this.sGold.seg(cx, cy - rr - 60 * gc, cx, cy + rr + 28 * gc, mul(C.goldHot, 0.8 * gc), mul(C.goldHot, 0.8 * gc), AXIS);
    // the lights: the centre and the four points of the outer ring
    const k = smooth(0.55, 1, m);
    this.dots.add(cx, cy, 10, mul([1.3, 1.1, 0.6], 0.95 * k)); this.dots.add(cx, cy, 44, mul([0.14, 0.09, 0.02], k));
    for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2, x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); this.dots.add(x, y, 6, mul([1.2, 0.9, 0.4], 0.8 * k)); this.dots.add(x, y, 22, mul([0.1, 0.06, 0.01], k)); }
  }

  // ---------------- the crystals ----------------
  _crystals(sim, dt, t) {
    const live = new Set(), a0 = 1 - 0.6 * this.m1;
    for (const c of sim.crystals) {
      live.add(c.id);
      let v = this.cv.get(c.id); if (!v) { v = { born: t, a: (hash1(c.id * 3.1) < 0.5 ? -1 : 1) * (0.5 + 0.4 * hash1(c.id * 7.7)) }; this.cv.set(c.id, v); }
      const born = smooth(0, 0.9, t - v.born) * a0;
      // its dotted red trail (the recent path, dots held on the path: never a stripe field)
      for (let i = c.trail.length - 1, n = 0; i >= 0 && n < 10; i -= 8, n++) {
        const p = c.trail[i], f = (1 - n / 10) * 0.85 * born;
        if (n > 1) this.crispDots.add(p[0], p[1], 1.8, mul([1.3, 0.16, 0.08], f * 0.8));
      }
      const ang = v.a + 0.22 * Math.sin(t * 0.8 + c.ph) + c.vx * 0.0015, sn = Math.sin(ang), cs = Math.cos(ang);
      v.cur = ang;
      const T = (p) => [c.x + p[0] * cs - p[1] * sn, c.y + p[0] * sn + p[1] * cs];
      const pts = GEM.map(T);
      this.fills.poly(pts, [0, 0.002, 0.004, 0.85 * born]);                 // solid: it hides what is behind it
      this.sCrystal.loop(pts, mul(C.red, born), SOLID);
      for (const [p, q] of GEM_IN) { const a = T(p), b = T(q); this.sCrystal.seg(a[0], a[1], b[0], b[1], mul(C.red, 0.7 * born), mul(C.red, 0.7 * born), THIN); }
      this.crispDots.add(c.x, c.y, 26, mul([0.1, 0.012, 0.005], born));
    }
    for (const id of this.cv.keys()) if (!live.has(id)) this.cv.delete(id);
  }

  // ---------------- the lander ----------------
  _lander(sim, dt, t) {
    const l = sim.lander, fade = 1 - smooth(0.4, 0.9, this.m1);
    const show = l.alive && sim.phase !== 'lost';
    this.landerK += ((show ? 1 : 0) - this.landerK) * (1 - Math.exp(-dt / (show ? 0.25 : 0.03)));
    if (this.landerK < 0.01) { this._textLater = null; return; }
    const k = this.landerK * fade * (1 - 0.35 * this.lostK);
    let x = l.x, y = l.y;
    if (this.m1 > 0) { const w = this._wm([x, y]); x = w[0]; y = w[1]; }
    const sc = 1 - 0.85 * smooth(0.3, 1.0, this.m1);
    // the legs (and exhaust) tell you the descent: gold = safe to land, red-orange = too fast (a steady colour, eased)
    const descending = l.landed < 0 && l.vy > 30, safe = sim.isSoft ? sim.isSoft(l.vy, l.tilt) : true;
    const tgt = !descending ? C.legs : safe ? C.legSafe : C.legFast;
    const e = 1 - Math.exp(-dt / 0.13);
    for (let i = 0; i < 3; i++) this.legK[i] += (tgt[i] - this.legK[i]) * e;
    const warn = descending && !safe && (sim.groundBelow(l.x, l.y)?.gap ?? 999) < 200 ? 1 : 0;
    this.warnK += (warn - this.warnK) * (1 - Math.exp(-dt / 0.15));
    this.thrK += ((l.thrusting ? 1 : 0) - this.thrK) * (1 - Math.exp(-dt / 0.07));
    this.sideK += (l.side - this.sideK) * (1 - Math.exp(-dt / 0.08));
    const ang = l.tilt * 0.9, sn = Math.sin(ang), cs = Math.cos(ang);
    const Tp = (p) => [x + (p[0] * cs - p[1] * sn) * sc, y + (p[0] * sn + p[1] * cs) * sc];
    const body = mul(C.lander, k), legs = mul(this.legK, 1.05 * k);
    this.fills.poly(LANDER.cabin.map(Tp), [0, 0.003, 0.006, 0.9 * k]);         // solid: the cabin hides what is behind it
    for (const ln of LANDER.body) this.sLander.line(ln.map(Tp), body, SOLID);
    for (const ln of LANDER.legs) this.sLegs.line(ln.map(Tp), legs, SOLID);
    this.crispDots.add(...Tp([0, -2.5]), 2.2, mul([0.8, 1.0, 1.2], 0.85 * k));  // the window
    this.crispDots.add(x, y, 34 * sc, mul([0.01, 0.045, 0.075], k));
    // the flame (gold, just under the bell) and the dotted exhaust (held dots down the thrust, gold to cyan)
    if (this.thrK > 0.02 && sc > 0.5) {
      const f0 = Tp([0, 15]), f1 = Tp([0, 15 + 9 * this.thrK]);
      this.sLegs.seg(f0[0], f0[1], f1[0], f1[1], mul([1.3, 0.85, 0.25], this.thrK * k), mul([0.6, 0.3, 0.05], this.thrK * k), SOLID);
      this.crispDots.add(f0[0], f0[1] + 3, 7, mul([1.3, 0.85, 0.3], 0.5 * this.thrK * k));
      for (let i = 0; i < 6; i++) {
        const f = i / 6, p = Tp([0, 30 + i * (9 + 3 * this.thrK)]);
        const c = mix([1.1, 0.8, 0.35], [0.15, 0.65, 0.75], Math.min(1, f * 1.8));
        this.crispDots.add(p[0], p[1], 2.3 - 1.0 * f, mul(c, (1 - f * 0.85) * 0.95 * this.thrK * k));
      }
    }
    // a side thrust: a few dots off the shoulder on the far side
    if (Math.abs(this.sideK) > 0.12 && sc > 0.5) {
      const dir = -Math.sign(this.sideK), s0 = Tp([dir * 13, -4]);
      for (let i = 0; i < 4; i++) this.crispDots.add(s0[0] + dir * (5 + i * 7), s0[1] + i * 0.8, 2.0 - 0.3 * i, mul([0.9, 0.9, 1.1], (1 - i / 4) * 0.8 * Math.min(1, Math.abs(this.sideK)) * k));
    }
    // TOO FAST: a steady word under the lander while the descent is above the limit and an island is close below
    this._textLater = this.warnK > 0.02 ? { text: 'TOO FAST', x, y: y + 44, a: this.warnK * k } : null;
    // the ward (mercy): a steady ring while it holds (never a blink)
    if (l.ward > 0) this.sFx.loop(arc(x, y, 34, 34, 0, TAU, 40).slice(0, 40), mul(C.white, 0.5 * smooth(0, 0.6, l.ward) * k), THIN);
  }

  // ---------------- bursts, pieces, rings, words ----------------
  _effects(sim, dt, t) {
    this.fx = this.fx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.fx) {
      const age = t - e.t0, u = age / e.dur, fade = 1 - smooth(0, 1, u);
      if (age < 0) continue;
      if (e.k === 'burst') {
        // a soft white starburst: eased in over 60 ms, out over the rest; its rays grow a little as they fade
        const inK = smooth(0, 0.06, age), k = inK * Math.pow(1 - u, 1.5), big = (e.soft ? 0.7 : 0.8) * e.big;
        for (let i = 0; i < 18; i++) {
          const a = i * 2.39996 + hash1(e.seed * 3 + i) * 0.3, long = i % 3 === 0, L = (long ? 95 + 45 * hash1(e.seed + i) : 36 + 30 * hash1(e.seed * 2 + i)) * big;
          const r0 = 4 + 8 * u, r1 = r0 + L * (0.7 + 0.3 * u);
          this.sFx.seg(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1, mul(C.white, 1.3 * k), [0, 0, 0], long ? THIN : FINE);
        }
        this.crispDots.add(e.x, e.y, 15 + 10 * u, mul([1.1, 1.3, 1.6], 1.0 * k));
        this.crispDots.add(e.x, e.y, 56 + 20 * u, mul([0.1, 0.16, 0.34], k));
      } else if (e.k === 'piece') {
        const d = e.drag ? e.drag * (1 - Math.exp(-age / e.drag)) : age;
        const x = e.x + e.vx * d, y = e.y + e.vy * d + 0.5 * e.g * age * age, r = e.vr * age, ca = Math.cos(r), sa = Math.sin(r);
        this.sFrag.loop(e.pts.map(([px, py]) => [x + px * ca - py * sa, y + px * sa + py * ca]), mul(C.red, 0.95 * fade), THIN);
      } else if (e.k === 'lFrag') {
        const x = e.x + e.vx * age, y = e.y + e.vy * age + 0.5 * e.g * age * age, r = e.vr * age, ca = Math.cos(r), sa = Math.sin(r);
        const P = (q) => [x + q[0] * ca - q[1] * sa, y + q[0] * sa + q[1] * ca];
        this.sLander.seg(...P(e.a), ...P(e.b), mul(e.leg ? C.legs : C.lander, 0.95 * fade), mul(e.leg ? C.legs : C.lander, 0.95 * fade), SOLID);
      } else if (e.k === 'speck') {
        const d = e.drag * (1 - Math.exp(-age / e.drag)), x = e.x + e.vx * d, y = e.y + e.vy * d + 60 * age * age;
        this.sFrag.loop(arc(x, y, 2.2, 2.2, 0, TAU, 6).slice(0, 6), mul(C.red, 0.85 * fade), FINE);
      } else if (e.k === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * Math.sqrt(u);
        this.sFx.loop(arc(e.x, e.y, r, r, 0, TAU, 40).slice(0, 40), mul(e.c, 0.6 * fade * smooth(0, 0.08, age)), THIN);
      } else if (e.k === 'gem') {
        const sp = 1 + 0.4 * u, sn = Math.sin(e.a), cs = Math.cos(e.a);
        this.sFrag.loop(GEM.map(([px, py]) => [e.x + (px * cs - py * sn) * sp, e.y + (px * sn + py * cs) * sp]), mul(C.dim, 0.9 * fade), FINE);
      } else if (e.k === 'spark') {
        this.crispDots.add(e.x, e.y, 5 + 8 * u, mul([0.5, 0.7, 0.9], 0.6 * fade));
      } else if (e.k === 'dust') {
        const r = 12 + 34 * Math.sqrt(u);
        this.sFx.line(arc(e.x, e.y, r, r * 0.22, Math.PI, TAU, 24), mul(C.legSafe, 0.45 * fade), FINE);
      } else if (e.k === 'padRing') {
        // the lit pad's ring spreads across the painted top (flat, in its plane) and fades
        const s = sim.islands[e.id], d = s.def, c0 = this._wm([s.x + d.ring.dx, s.y + d.ring.dy]), sh = this._shrink;
        const rx = d.ring.rx * sh * (1 + 1.4 * Math.sqrt(u)), ry = rx * 0.3;
        this.sFxGold.loop(arc(c0[0], c0[1], rx, ry, 0, TAU, 48).slice(0, 48), mul(C.goldHot, 0.75 * fade * smooth(0, 0.1, age)), THIN);
      } else if (e.k === 'text') drawScore(this.sFx, e.text, e.x, e.y - 22 * u, { h: e.h ?? 13, color: mul(e.c, 0.95 * fade * smooth(0, 0.12, age)), track: 1 });
    }
  }

  // ---------------- score, what's left to raise, fuel, ships, banners, cards ----------------
  _ui(sim, t, ui) {
    const s = this.sUI, tx = this.sText; s.clear(); tx.clear();
    this.uiIn = Math.min(1, this.uiIn + (this._dt ?? 1 / 60) / 0.45);
    this.matUI.gain = this.matText.gain = smooth(0, 1, this.uiIn); this.band.material.opacity = smooth(0, 1, this.uiIn);
    const o = this.band; o.clear();
    const cx = CX;
    if (this._textLater) drawText(tx, this._textLater.text, this._textLater.x, this._textLater.y, { h: 11, color: mul(C.legFast, 0.95 * this._textLater.a), track: 1 });
    // the score where the concept has it: top left, cyan 7-segment
    drawDigits(s, String(sim.score), 112, 62, { h: 27, w: 17, pitch: 24, slant: 0.14, gap: 1.8, hollow: false, color: mul(C.score, 0.95),
      style: { dash: 1, gap: 0, width: 0.9 } });
    // ships: small landers, top, right of the score
    if (ui.mode !== 'attract') for (let k = 0; k < Math.max(0, sim.livesLeft); k++) {
      const x = 318 + k * 40, y = 76, T = (p) => [x + p[0] * 0.5, y + p[1] * 0.5];
      for (const ln of LANDER.body) s.line(ln.map(T), mul(C.lander, 0.6), SOLID);
      for (const ln of LANDER.legs) s.line(ln.map(T), mul(C.legs, 0.6), SOLID);
    }
    if (ui.mode !== 'attract') {
      const left = Math.max(0, sim.padsTotal - sim.padsLit), open = sim.temple.open, won = sim.phase === 'card' && sim.result === 2;
      if (sim.phase !== 'card' || !won) {
        drawText(tx, open ? 'LAND ON THE TEMPLE' : left + ' TO RISE', 113, 104, { h: 13, color: mul(open ? C.goldHot : C.white, 0.92), track: 1, align: 'left' });
        // the pads: one small diamond each, gold when lit
        for (let i = 0; i < sim.padsTotal; i++) {
          const x = 121 + i * 24, y = 134, lit = i < sim.padsLit, c = lit ? mul(C.goldHot, 1.0) : mul(C.goldDim, 1.3), r = lit ? 8 : 7;
          s.loop([[x, y - r], [x + r * 0.75, y], [x, y + r], [x - r * 0.75, y]], c, lit ? SOLID : THIN);
          if (lit) this.crispDots.add(x, y, 4, mul([1.2, 0.85, 0.3], 0.6));
        }
        // the fuel gauge: ten cells; steady colours (cyan; orange when low), drawn small under the pads
        const fp = clamp01(sim.lander.fuel / TUNE.fuel.max), low = fp < TUNE.fuel.low;
        drawText(tx, 'FUEL', 113, 156, { h: 10, color: mul(low ? C.legFast : C.text, 0.9), track: 1, align: 'left' });
        for (let i = 0; i < 10; i++) {
          const on = fp * 10 > i + 0.15, x = 168 + i * 9.5;
          s.seg(x, 156, x, 165, on ? mul(low ? C.legFast : C.score, 1.05) : mul(C.cyanDim, 0.45), on ? mul(low ? C.legFast : C.score, 1.05) : mul(C.cyanDim, 0.45), THIN);
        }
      }
    }
    const band = (y0, y1, a, x0 = 0, x1 = FRAME[0]) => {     // a soft dark band behind card text
      if (a <= 0.001) return;
      for (const [d, k] of [[0, 0.35], [14, 0.65], [28, 1]]) o.poly([[x0, y0 + d], [x1, y0 + d], [x1, y1 - d], [x0, y1 - d]], [0, 0, 0, a * k * 0.5]);
    };
    // banners (ALMOST THERE, THE TEMPLE OPENS; the lower ones: why a ship was lost, out of fuel)
    if (ui.mode !== 'attract') {
      for (const [Bn, y] of [[this.banner, 300], [this.lower, 612]]) {
        if (!Bn) continue;
        const u = (t - Bn.t0) / Bn.dur;
        if (u < 0 || u >= 1) continue;
        const a = smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u));
        band(y - 26, y + (Bn.b ? 74 : 44), a * 0.8, 300, 966);
        drawText(tx, Bn.a, cx, y, { h: Bn === this.banner ? 22 : 15, color: mul(Bn === this.banner ? C.goldHot : C.text, a), track: 1 });
        if (Bn.b) drawText(tx, Bn.b, cx, y + 36, { h: 14, color: mul(C.white, 0.9 * a), track: 1 });
      }
    }
    if (ui.mode === 'attract') {
      band(150, 740, 0.9, 160, 1106);
      const breathe = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
      drawText(tx, 'THE ASCENT', cx, 214, { h: 60, color: mul(C.goldHot, 1.05), track: 2 });
      drawText(tx, 'RAISE ATLANTIS', cx, 314, { h: 20, color: mul(C.white, 0.9), track: 2 });
      drawText(tx, this.inCabinet ? (this.cabinetStart ?? 'INSERT COIN') : 'PRESS START', cx, 400, { h: 24, color: mul(C.white, breathe), track: 2 });
      drawText(tx, 'LAND SOFT ON THE DIM GOLD PADS TO LIGHT THEM', cx, 480, { h: 14, color: mul(C.text, 0.95), track: 1 });
      drawText(tx, 'COME DOWN ON THE RED CRYSTALS · WATCH YOUR FUEL', cx, 518, { h: 14, color: mul(C.text, 0.85), track: 1 });
      drawText(tx, 'UP OR SPACE  THRUST     LEFT RIGHT  STEER', cx, 556, { h: 14, color: mul(C.text, 0.85), track: 1 });
      drawText(tx, sim.padsTotal + ' PADS RAISE THE TEMPLE · ONE LANDING RAISES ATLANTIS', cx, 594, { h: 14, color: mul(C.text, 0.85), track: 1 });
      drawText(tx, 'HI ' + ui.hi + (ui.last ? '   LAST ' + ui.last : ''), cx, 690, { h: 16, color: mul(C.score, 0.95), track: 2 });
    } else if (sim.phase === 'ready') {
      const first = sim.readyDur > 2;
      const a = smooth(0, 0.3, sim.phaseTime) * (1 - smooth(sim.readyDur - 0.45, sim.readyDur, sim.phaseTime));
      if (first) {
        band(232, 440, a, 200, 1066);
        drawText(tx, 'LAND SOFT ON THE DIM PADS', cx, 256, { h: 27, color: mul(C.goldHot, a), track: 2 });
        drawText(tx, sim.padsTotal + ' LIT PADS RAISE THE TEMPLE', cx, 312, { h: 19, color: mul(C.white, a), track: 2 });
        drawText(tx, 'COME DOWN ON THE RED · WATCH YOUR FUEL', cx, 358, { h: 14, color: mul(C.text, 0.95 * a), track: 1 });
        drawText(tx, 'UP OR SPACE THRUST · LEFT RIGHT STEER · GOLD LEGS ARE SAFE', cx, 388, { h: 12, color: mul(C.text, 0.85 * a), track: 1 });
      } else {
        band(300, 380, a, 300, 966);
        drawText(tx, 'READY', cx, 326, { h: 24, color: mul(C.white, a), track: 3 });
      }
    } else if (sim.phase === 'card') {
      const won = sim.result === 2, delay = won ? 4.6 : 0.9;
      const a = smooth(delay, delay + 0.8, sim.phaseTime);
      band(won ? 700 : 622, won ? 902 : 806, a);
      const y0 = won ? 722 : 648;
      drawText(tx, won ? 'ATLANTIS RISES' : 'ATLANTIS SLEEPS', cx, y0, { h: 36, color: mul(won ? C.goldHot : C.text, a), track: 2 });
      drawText(tx, won ? sim.padsLit + ' PADS LIT · ' + sim.stats.stomps + ' CRYSTALS BROKEN' : sim.padsLit + ' OF ' + sim.padsTotal + ' PADS LIT · ' + sim.stats.stomps + ' CRYSTALS BROKEN', cx, y0 + 66, { h: 15, color: mul(C.text, 0.9 * a), track: 1 });
      drawText(tx, 'SCORE ' + sim.score, cx, y0 + 106, { h: 22, color: mul(C.score, a), track: 2 });
    }
    s.commit(); tx.commit(); o.commit();
  }
}
