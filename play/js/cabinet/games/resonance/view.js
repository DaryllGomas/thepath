// THE NODE · THE RESONANCE · THE PICTURE (three.js, the look kit). Reads the round, never changes it.
//
//   const view = new ResonanceView(kit); await view.ready;      kit = createLookKit(renderer, { ...RESONANCE_LOOK })
//   view.update(sim, dt, t, ui)       ui = { mode: 'attract' | 'play', hi, last }
//
// The layers (the painted plate + live light, PIPELINES.md section 10):
//   the plate: the tube, the starfield, the faint ground curve and corner arcs. The wave lights it (a soft blue band of
//   haze along the centre line, breathing with the wave's height); the chain wakes the painted ground and arcs a little
//   THE WAVE (the Signal), clean parametric curves: the bright double trace, four faint dashed echoes (their dashes held
//   still on the glass: they never crawl), 4-point star nodes on every crest and trough. The crest's upward ray is its REACH
//   (how high it can tune a shape). The chain's second trace (3:2 against the wave, drifting the other way, fainter,
//   violet-blue) grows as clean hits chain up: the first hint of a Lissajous figure
//   the reach: while a shape is resonant a line of light joins the crest to the shape, the shape's outline burns white-hot
//   and the crest node swells (soft, eased: never a blink)
//   the crisp layer (kit.overlay, no persistence): the kites on their dotted threads (steady red; through the wave: dim, no
//   thread), shards, the emitter riding the ground circle, pulses (a bright head and a dashed trail whose dashes are held
//   still on the glass), the shatter (a soft white-blue starburst, red pieces that only fade and fall), the score
//   (7-segment, blue, top left), N TO TUNE, the chain, lives (small emitters), banners, cards
//   THE SIGNAL IS CLEAR: the wave and the chain's trace fold into a Lissajous figure and settle into a still hexafoil (six
//   vesica petals from exact compass arcs) inside its circle (the echoes)
// Safety: nothing steps or blinks. Crests pass any point at most 0.2 times a second; node swells are eased; the shatter's
// bright part is white-blue, eased in over 60 ms and out over 0.7 s, small; red pieces only fade.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, arc, GlowDots, drawDigits, Backdrop, FillBatch } from '../../lookkit/index.js';
import { FRAME, GLASS, CX, WAVE, EMITTER, groundY, groundPts, glassTopAt, glassLeftAt, glassRightAt, kitePts, crestsAt, crestOffset } from './layout.js';
import { MEASURED } from './plate_measured.js';
import { TUNE } from './spec.js';
import { drawText } from '../hearth/font.js';

export const PLATE_URL = new URL('../../../../assets/looktest/resonance_plate.png', import.meta.url).href;

export const RESONANCE_LOOK = {
  frame: FRAME,
  overlay: true,              // crisp layer after the phosphor pass: the emitter, pulses and shapes leave no ghost copies
  bloom: { strength: 0.55, radius: 0.42, threshold: 1.0, tint: [0.55, 0.72, 1.0] },
  phosphor: { tau: [0.03, 0.04, 0.055] },
  // the plate already shows the tube and its bezel: no curvature, no glass edge of the kit's own
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.1, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

// HDR light. hot: how white a colour's line core burns (a blue's small red and green decide it)
const HOT_BLUE = [2.4, 1.9, 1.3], HOT_RED = [1.4, 2.4, 3.2];
const C = {
  wave: [0.3, 0.56, 1.4], echo: [0.16, 0.34, 1.0], chain: [0.34, 0.32, 1.2], node: [0.55, 0.75, 1.4],
  red: [1.5, 0.1, 0.06], hotRed: [0.95, 0.55, 0.5], passed: [0.62, 0.05, 0.04], dull: [0.4, 0.36, 0.6],
  emitter: [0.26, 0.52, 1.3], pulse: [0.5, 0.8, 1.5], score: [0.28, 0.58, 1.25], text: [0.26, 0.55, 1.15],
  white: [0.62, 0.85, 1.35], ground: [0.16, 0.32, 1.0], figure: [0.34, 0.6, 1.45],
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
const TAU = Math.PI * 2, DEG = Math.PI / 180;

const SOLID = { dash: 1, gap: 0, width: 1, speed: 0 };
const THIN = { dash: 1, gap: 0, width: 0.6, speed: 0 };
const FINE = { dash: 1, gap: 0, width: 0.45, speed: 0 };
const THREAD = { dash: 2.2, gap: 5.8, width: 0.9, speed: 0 };      // the dotted threads (8-px period, held still)
const ARC_IN = { dash: 17, gap: 5, width: 0.7, speed: 0 };         // the emitter's half-rings
const ARC_OUT = { dash: 9, gap: 6, width: 0.6, speed: 0 };

// ---- the traces: every one a clean parametric curve over s in [0, 1] ----
// kinds: 0 main, 1 its double, 2-5 the echoes, 6 the chain's trace, 7 its double (the figure only)
const ECHO = [{ off: -13, amp: 1.05, ph: 0.09 }, { off: -25, amp: 1.1, ph: 0.17 }, { off: 12, amp: 0.95, ph: -0.08 }, { off: 24, amp: 0.9, ph: -0.16 }];
// THE FIGURE: a hexafoil (six vesica petals, each two 60-degree compass arcs of radius R through the centre) in its circle
const FIG = { cx: CX, cy: 402, R: 172 };
function hexafoil(s, first, out) {
  // three petals (every other one, starting at `first` degrees): centre -> tip on one arc, tip -> centre on the other
  const u6 = ((s % 1) + 1) % 1 * 6, arcI = Math.min(5, Math.floor(u6)), v = u6 - arcI;
  const petal = arcI >> 1, back = arcI & 1, al = (first + 120 * petal) * DEG, R = FIG.R;
  let q, a;
  if (!back) { q = al - 60 * DEG; a = al + 120 * DEG - 60 * DEG * v; } else { q = al + 60 * DEG; a = al - 60 * DEG - 60 * DEG * v; }
  out[0] = FIG.cx + R * Math.cos(q) + R * Math.cos(a); out[1] = FIG.cy + R * Math.sin(q) + R * Math.sin(a);
  return out;
}

// the kite's four pieces (split along its cross), for the shatter
function kitePieces(x, y, h) { const [t, r, b, l] = kitePts(x, y, h), c = [x, y]; return [[t, c, r], [r, c, b], [b, c, l], [l, c, t]]; }

/** The parts of a polyline inside the glass's lit face (left / right edges at each point's height): a list of runs. */
function clipToGlass(pts, m = 4) {
  const runs = []; let cur = null;
  for (const p of pts) {
    const inside = p[0] >= glassLeftAt(p[1]) + m && p[0] <= glassRightAt(p[1]) - m;
    if (inside) { if (!cur) { cur = []; runs.push(cur); } cur.push(p); } else cur = null;
  }
  return runs.filter((r) => r.length > 1);
}

export class ResonanceView {
  constructor(kit) {
    this.kit = kit;
    const { scene } = kit;

    // ---- layer 1: the plate, lit by the wave ----
    const plate = new THREE.Texture();
    plate.colorSpace = THREE.NoColorSpace; plate.minFilter = THREE.LinearMipmapLinearFilter; plate.magFilter = THREE.LinearFilter;
    plate.generateMipmaps = true;
    this.ready = new Promise((resolve, reject) => {
      new THREE.ImageLoader().load(PLATE_URL, (img) => { plate.image = img; plate.needsUpdate = true; resolve(); }, undefined, reject);
    });
    this.backdrop = new Backdrop({
      frame: FRAME, map: plate,
      uniforms: { plateGain: { value: 1 }, glow: { value: 1 }, waveA: { value: TUNE.wave.amp }, wake: { value: 0 }, open: { value: 0 }, dark: { value: 0 } },
      shade: /* glsl */`
        vec3 x = -log(max(vec3(1.0) - tex.rgb, vec3(0.03)));      // the painting -> light (the tone map gives it back)
        float paint = smoothstep(0.012, 0.06, tex.b - 0.5 * (tex.r + tex.g));   // the painted blue: stars, ground, arcs
        float low = smoothstep(700.0, 760.0, f.y);                             // the bottom band: the ground, the arcs
        x *= plateGain * (1.0 + paint * low * wake * 1.6);
        // the wave lights the glass: a soft blue haze along its centre line, as tall as the wave is high
        float dy = (f.y - ${WAVE.y0.toFixed(1)}) / (waveA + 80.0);
        float dx = (f.x - ${CX.toFixed(1)}) / 700.0;
        x += glow * vec3(0.0012, 0.003, 0.009) * exp(-dy * dy * 1.3) * (1.0 - 0.35 * dx * dx);
        // THE SIGNAL IS CLEAR: a quiet haze round the figure
        vec2 d = f - vec2(${FIG.cx.toFixed(1)}, ${FIG.cy.toFixed(1)});
        x += open * vec3(0.006, 0.013, 0.034) * exp(-dot(d, d) / (2.0 * 230.0 * 230.0));
        return x * (1.0 - 0.45 * dark);`,
    });
    scene.add(this.backdrop.object);

    // ---- live layers ----
    const T = (o) => kit.track(new GlowLineMaterial(o));
    this.matWave = T({ width: 6.8, coreFrac: 0.15, coreGain: 3.4, haloGain: 0.85, hot: HOT_BLUE });
    this.matEcho = T({ width: 5.2, coreGain: 2.3, haloGain: 0.55, hot: HOT_BLUE });
    this.matNode = T({ width: 6.0, coreGain: 3.2, haloGain: 0.9, hot: HOT_BLUE });
    this.matShape = T({ width: 6.6, coreGain: 2.9, haloGain: 1.3, hot: HOT_RED });
    this.matThread = T({ width: 5.0, coreGain: 2.6, haloGain: 0.6, hot: HOT_RED });
    this.matEmitter = T({ width: 7.4, coreGain: 3.2, haloGain: 1.1, hot: HOT_BLUE });
    this.matPulse = T({ width: 7.0, coreGain: 3.3, haloGain: 1.0, hot: HOT_BLUE });
    this.matFx = T({ width: 5.0, coreGain: 2.8, haloGain: 0.7, hot: HOT_BLUE });
    this.matFrag = T({ width: 5.2, coreGain: 2.6, haloGain: 0.8, hot: HOT_RED });
    this.matUI = T({ width: 7.5, coreGain: 3.0, haloGain: 0.8, hot: HOT_BLUE });
    this.matText = T({ width: 6.5, coreGain: 2.8, haloGain: 0.8, hot: HOT_BLUE });

    const B = (mat, n, order) => { const b = new LineBatch(mat, n); b.object.renderOrder = order; return b; };
    // the phosphor scene: the wave and its nodes (slow movers: a trace of persistence suits a scope)
    this.sEcho = B(this.matEcho, 2400, 6); this.sWave = B(this.matWave, 1400, 8); this.sNode = B(this.matNode, 900, 9);
    this.dots = kit.track(new GlowDots(400)); this.dots.object.renderOrder = 4;
    scene.add(this.sEcho.object, this.sWave.object, this.sNode.object, this.dots.object);
    // the crisp layer
    this.sThread = B(this.matThread, 200, 10); this.sShape = B(this.matShape, 400, 11); this.sFrag = B(this.matFrag, 900, 12);
    this.sFx = B(this.matFx, 1200, 13); this.sEmitter = B(this.matEmitter, 600, 14); this.sPulse = B(this.matPulse, 400, 15);
    this.crispDots = kit.track(new GlowDots(300)); this.crispDots.object.renderOrder = 16;
    this.band = new FillBatch(96); this.band.object.renderOrder = 30;
    this.sUI = B(this.matUI, 1200, 40); this.sText = B(this.matText, 3000, 41);
    (kit.overlay ?? scene).add(this.sThread.object, this.sShape.object, this.sFrag.object, this.sFx.object, this.sEmitter.object,
      this.sPulse.object, this.crispDots.object, this.band.object, this.sUI.object, this.sText.object);

    // the painted stars the live layer lifts a little (steady: stars never twinkle here)
    this.stars = MEASURED.stars.filter((s) => s[2] >= 120).slice(0, 26);
    this._pt = [0, 0];
    this._reset();
  }

  _reset() {
    this.fx = []; this.flares = []; this.banner = null; this.lower = null;
    this.shapeV = new Map();                  // id -> { res, born, cut } (the view's own eased state per shape)
    this.chainK = 0; this.chainPh = 0; this.m1 = 0; this.m2 = 0; this.lostK = 0; this.emitterV = 1;
    this.almostShown = false; this.passShown = false; this.uiIn = 0;
    this.lie = 0;                             // (the Lissajous stage's slow phase)
  }

  /** One frame. sim = the round being shown (the attract demo or the real one). */
  update(sim, dt, t, ui = {}) {
    if (sim !== this._sim) { this._sim = sim; this._reset(); this.kit.resetPersistence?.(); }
    this._dt = dt; this._t = t;
    for (const b of [this.sEcho, this.sWave, this.sNode, this.sThread, this.sShape, this.sFrag, this.sFx, this.sEmitter, this.sPulse]) b.clear();
    this.dots.clear(); this.crispDots.clear();
    this._events(sim, t);
    this._state(sim, dt, t);
    this._stars();
    this._waveDraw(sim, dt, t);
    this._shapes(sim, dt, t);
    this._shards(sim, t);
    this._emitter(sim, dt, t);
    this._pulses(sim);
    this._effects(sim, dt, t);
    for (const b of [this.sEcho, this.sWave, this.sNode, this.sThread, this.sShape, this.sFrag, this.sFx, this.sEmitter, this.sPulse]) b.commit();
    this.dots.commit(); this.crispDots.commit();
    this._ui(sim, t, ui);
  }

  // ---------------- events -> effects ----------------
  _events(sim, t) {
    for (const e of sim.events) {
      if (e.kind === 'shatter') {
        this.fx.push({ k: 'burst', x: e.x, y: e.y, t0: t, dur: 0.8, seed: e.id, big: e.h / 104 });
        const pieces = kitePieces(e.x, e.y, e.h);
        pieces.forEach((P, i) => {
          const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3;
          const a = Math.atan2(cy - e.y, cx - e.x), v = 300 + 140 * hash1(e.id * 5 + i);
          this.fx.push({ k: 'piece', pts: P.map(([x, y]) => [x - cx, y - cy]), x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
            vr: (hash1(e.id * 7 + i) - 0.5) * 3.2, t0: t, dur: 1.35, g: 150, drag: 0.28 });
        });
        for (let i = 0; i < 14; i++) {
          const a = hash1(e.id * 13 + i) * TAU, v = 260 + 380 * hash1(e.id * 17 + i), r = 6 + 8 * hash1(e.id * 19 + i);
          this.fx.push({ k: 'tri', x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, r,
            rot: hash1(e.id * 23 + i) * TAU, vr: (hash1(e.id * 29 + i) - 0.5) * 5, t0: t, dur: 1.0 + 0.7 * hash1(e.id * 31 + i), g: 120, drag: 0.26 });
        }
        for (let i = 0; i < 6; i++) {
          const a = hash1(e.id * 37 + i) * TAU, v = 200 + 260 * hash1(e.id * 41 + i);
          this.fx.push({ k: 'speck', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: t, dur: 0.9 + 0.5 * hash1(e.id * 43 + i), drag: 0.25 });
        }
        this.flares.push({ x: e.crestX, t0: t, v: sim.wave.v });
        this.fx.push({ k: 'text', text: '+' + e.pts, x: e.x, y: e.y - e.h * 0.5 - 16, t0: t + 0.05, dur: 1.2, c: C.white });
        if (e.mult > 1) this.fx.push({ k: 'text', text: 'x' + e.mult, x: e.x, y: e.y - e.h * 0.5 + 2, t0: t + 0.12, dur: 1.1, c: C.chain, h: 11 });
        this._trail(e, t);
      } else if (e.kind === 'offphase') {
        this.fx.push({ k: 'ring', x: e.pulseX, y: e.hitY, t0: t, dur: 0.6, r0: 8, r1: 34, c: C.dull });
        this.fx.push({ k: 'text', text: 'OFF-PHASE', x: e.sx, y: e.sy - e.h * 0.37 - 20, t0: t, dur: 1.3, c: C.dull, h: 11 });
        if (e.split) this.fx.push({ k: 'ghost', x: e.sx, y: e.sy, h: e.h, t0: t, dur: 0.4 });
        this._trail(e, t);
      } else if (e.kind === 'broken') {
        kitePieces(e.x, e.y, e.h).forEach((P, i) => {
          const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3, a = Math.atan2(cy - e.y, cx - e.x);
          this.fx.push({ k: 'piece', pts: P.map(([x, y]) => [x - cx, y - cy]), x: cx, y: cy, vx: Math.cos(a) * 45, vy: Math.sin(a) * 45,
            vr: (hash1(e.id * 7 + i) - 0.5) * 2, t0: t, dur: 0.8, g: 90, dim: true });
        });
        this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 0.5, r0: 6, r1: 28, c: C.dull });
        this._trail(e, t);
      } else if (e.kind === 'gone') this._trail({ pulseX: e.x, pulseY0: e.y0, hitY: glassTopAt(e.x) - 8 }, t);
      else if (e.kind === 'landed') {
        kitePieces(e.x, e.y, e.h).forEach((P, i) => {
          const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3;
          this.fx.push({ k: 'piece', pts: P.map(([x, y]) => [x - cx, y - cy]), x: cx, y: cy, vx: (cx - e.x) * 1.6, vy: 10,
            vr: (i % 2 ? 1 : -1) * 0.8, t0: t, dur: 1.4, g: 0, dim: true });
        });
        this.fx.push({ k: 'groundRing', x: e.x, t0: t, dur: 1.4 });
      } else if (e.kind === 'struck') {
        this._breakEmitter(e.x, t);
        this.fx.push({ k: 'ring', x: e.x, y: groundY(e.x) - 40, t0: t, dur: 1.2, r0: 10, r1: 60, c: C.emitter });
      } else if (e.kind === 'ward') this.fx.push({ k: 'ring', x: e.x, y: e.y - 40, t0: t, dur: 1.4, r0: 44, r1: 70, c: C.white });
      else if (e.kind === 'shardGround') this.fx.push({ k: 'spark', x: e.x, y: e.y, t0: t, dur: 0.45 });
      else if (e.kind === 'passed') {
        const v = this.shapeV.get(e.id); if (v && !v.cut) { v.cut = t; this.fx.push({ k: 'thread', x: e.x, y0: glassTopAt(e.x) + 2, y1: e.y, t0: t, dur: 0.6 }); }
        if (!this.passShown) { this.passShown = true; this.lower = { a: 'ONE SLIPPED THROUGH THE WAVE', b: 'SHOOT IT DOWN BEFORE IT LANDS', t0: t, dur: 3.0 }; }
      } else if (e.kind === 'cut' || e.kind === 'split') {
        const v = this.shapeV.get(e.id);
        if (v && !v.cut) { v.cut = t; this.fx.push({ k: 'thread', x: e.x, y0: glassTopAt(e.x) + 2, y1: e.y - 20, t0: t, dur: 0.6 }); }
      } else if (e.kind === 'almost') this.banner = { a: 'ALMOST THERE', b: e.left + ' CLEAN HIT' + (e.left === 1 ? '' : 'S') + ' TO GO', t0: t, dur: 2.6 };
      else if (e.kind === 'lifeLost') {
        this.lower = e.why === 'landed' ? { a: 'A SHAPE REACHED THE GROUND', b: '', t0: t + 0.2, dur: 2.2 } : { a: 'STRUCK BY A SHARD', b: '', t0: t + 0.2, dur: 2.2 };
      }
    }
  }
  _trail(e, t) { if (e.pulseX != null) this.fx.push({ k: 'trail', x: e.pulseX, y0: e.pulseY0, yh: e.hitY, t0: t, dur: 0.55 }); }
  _breakEmitter(x, t) {
    const gy = groundY(x), E = EMITTER, P = (u, v) => [x + u, gy + v];
    const segs = [[P(-E.base, 0), P(-E.collar.foot, -E.apex)], [P(E.base, 0), P(E.collar.foot, -E.apex)], [P(-E.base, 0), P(E.base, 0)],
      [P(-E.collar.half, -E.collar.top), P(E.collar.half, -E.collar.top)], [P(-E.barrel.half, -E.collar.top), P(-E.barrel.half, -E.barrel.top)],
      [P(E.barrel.half, -E.collar.top), P(E.barrel.half, -E.barrel.top)]];
    segs.forEach(([a, b], k) => {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ang = Math.atan2(my - (gy - 30), mx - x) + (hash1(k + t) - 0.5) * 0.6, v = 40 + 40 * hash1(k * 3 + t);
      this.fx.push({ k: 'eFrag', a, b, x: mx, y: my, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vr: (hash1(k * 7 + t) - 0.5) * 3, t0: t, dur: 1.5 });
    });
  }

  // ---------------- eased state: the chain, the win's morph, the loss ----------------
  _state(sim, dt, t) {
    const won = sim.phase === 'card' && sim.result === 2, lost = sim.phase === 'card' && sim.result === 1;
    const want = won ? 1 : clamp01((sim.chain - 1) / 5);
    const up = want > this.chainK;
    this.chainK += (want - this.chainK) * (1 - Math.exp(-dt / (up ? 0.9 : 1.3)));
    this.chainPh += dt * WAVE.k * sim.wave.v * 0.7;          // the chain's trace drifts the other way, a little slower
    const pt = won ? sim.phaseTime : -1;
    this.m1 = won ? smooth(0.5, 2.7, pt) : Math.max(0, this.m1 - dt);
    this.m2 = won ? smooth(2.9, 4.9, pt) : Math.max(0, this.m2 - dt);
    this.lie = won ? this.lie + dt * 0.35 * (1 - this.m2) : 0;
    this.lostK += ((lost ? 1 : 0) - this.lostK) * (1 - Math.exp(-dt / 1.1));
    const u = this.backdrop.uniforms;
    u.waveA.value = sim.wave.A * (1 - 0.85 * this.lostK) * (1 - this.m1);
    u.glow.value = (1 - 0.6 * this.lostK) * (1 - 0.7 * this.m1) + 0.3 * this.chainK;
    u.wake.value = 0.15 + 0.6 * this.chainK;
    u.open.value = this.m2;
    u.dark.value = this.lostK;
  }

  _stars() {
    const k = 1 - 0.5 * this.lostK;
    for (const [x, y, b] of this.stars) {
      const g = (b / 200) * k;
      this.dots.add(x, y, 3.2, mul([0.35, 0.55, 1.3], 0.55 * g));
      this.dots.add(x, y, 10, mul([0.03, 0.07, 0.22], g));
    }
  }

  // ---------------- THE WAVE ----------------
  /** A point of trace `kind` at s (0..1), blended wave -> Lissajous -> the hexafoil by the win's morph. */
  _P(kind, s, out) {
    const W = this._w;
    // the wave form
    const x = W.x0 + (W.x1 - W.x0) * s;
    let y;
    if (kind === 0) y = WAVE.y0 - W.A * Math.sin(WAVE.k * x - W.ph);
    else if (kind === 1) y = WAVE.y0 + 5.2 - W.A * 0.96 * Math.sin(WAVE.k * x - W.ph - 0.08);
    else if (kind <= 5) { const E = ECHO[kind - 2]; y = WAVE.y0 + E.off - W.A * E.amp * Math.sin(WAVE.k * x - W.ph - E.ph); }
    else y = WAVE.y0 - W.A2 * Math.sin(WAVE.k * 1.5 * x + this.chainPh + 1.3) + (kind === 7 ? 5 : 0);
    out[0] = x; out[1] = y;
    if (this.m1 <= 0) return out;
    // the Lissajous (the two oscillations, one against the other), then the figure
    let lx, ly, fx, fy;
    const R = FIG.R;
    if (kind >= 2 && kind <= 5) {
      const r = kind === 2 || kind === 4 ? R : R * 1.12, a = Math.PI + TAU * s * (kind === 4 || kind === 5 ? -1 : 1);
      lx = fx = FIG.cx + r * Math.cos(a); ly = fy = FIG.cy + r * Math.sin(a);
    } else {
      const sec = kind >= 6, sc = kind === 1 || kind === 7 ? 0.965 : 1;
      lx = FIG.cx + R * sc * Math.sin(TAU * (sec ? 3 : 2) * s + this.lie + (sec ? 0.9 : 0));
      ly = FIG.cy + R * sc * Math.sin(TAU * (sec ? 2 : 3) * s + (sec ? 0 : 0.4));
      hexafoil(s, sec ? -30 : -90, this._pt);
      fx = FIG.cx + (this._pt[0] - FIG.cx) * sc; fy = FIG.cy + (this._pt[1] - FIG.cy) * sc;
    }
    const m1 = this.m1, m2 = this.m2;
    const bx = x + (lx - x) * m1, by = y + (ly - y) * m1;
    out[0] = bx + (fx - bx) * m2; out[1] = by + (fy - by) * m2;
    return out;
  }

  _waveDraw(sim, dt, t) {
    const lostA = 1 - 0.85 * this.lostK;
    this._w = { x0: WAVE.x0, x1: WAVE.x1, ph: sim.wave.phase, A: sim.wave.A * lostA,
      A2: sim.wave.A * 0.85 * Math.max(this.chainK, this.m1) * lostA };
    const gain = (1 - 0.45 * this.lostK);
    const N = this.m1 > 0 ? 300 : 200, p = [0, 0];
    // the main double trace
    const main = [], dbl = [];
    for (let i = 0; i <= N; i++) { main.push([...this._P(0, i / N, p)]); dbl.push([...this._P(1, i / N, p)]); }
    const fig = this.m2;
    this.sWave.line(main, mul(mix(C.wave, C.figure, fig), 1.0 * gain), SOLID);
    this.sWave.line(dbl, mul(mix(C.wave, C.figure, fig), 0.8 * gain), THIN);
    // the echoes: dashed, the dashes held still on the glass (fixed in s: never crawling along the trace)
    const per = 8.5 / (WAVE.x1 - WAVE.x0), dash = 0.47 * per, n = Math.floor(1 / per);
    for (let k = 2; k <= 5; k++) {
      const inner = k === 2 || k === 4, col = mul(C.echo, (inner ? 0.62 : 0.4) * gain * (1 + 0.6 * fig));
      for (let i = 0; i < n; i++) {
        const s0 = i * per;
        const a = this._P(k, s0, [0, 0]), m = this._P(k, s0 + dash * 0.5, [0, 0]), b = this._P(k, s0 + dash, [0, 0]);
        this.sEcho.seg(a[0], a[1], m[0], m[1], col, col, FINE); this.sEcho.seg(m[0], m[1], b[0], b[1], col, col, FINE);
      }
    }
    // the chain's trace (3:2 against the wave, drifting the other way): the first hint of the figure. Its light follows its
    // height (a flat trace is never drawn); in the figure it burns as the main one does, with its own double stroke
    const ck = Math.max(this.chainK, this.m1);
    if (ck > 0.02) {
      const ch = [], ch2 = [], lit = smooth(0.02, 0.45, ck);
      for (let i = 0; i <= N; i++) ch.push([...this._P(6, i / N, p)]);
      const col = mix(C.chain, C.figure, fig), k = (0.42 * lit * (1 - fig) + fig) * gain;
      (fig > 0.5 ? this.sWave : this.sEcho).line(ch, mul(col, k), fig > 0.5 ? SOLID : THIN);
      if (fig > 0.01) { for (let i = 0; i <= N; i++) ch2.push([...this._P(7, i / N, p)]); this.sWave.line(ch2, mul(col, 0.8 * fig * gain), THIN); }
    }
    // the nodes: 4-point stars on every crest (bright; the upward ray is the crest's REACH) and trough (dimmer)
    const nk = (1 - this.m1) * gain;
    if (nk > 0.01) {
      const A = this._w.A, cy = WAVE.y0 - A, ty = WAVE.y0 + A, reach = TUNE.resonance.reach;
      for (const x of crestsAt(sim.wave.phase)) {
        let fl = 0;
        for (const F of this.flares) { const age = t - F.t0, fx = F.x + F.v * age; fl += Math.exp(-age / 0.45) * smooth(0, 0.06, age) * clamp01(1 - Math.abs(x - fx) / 70); }
        const res = this._crestRes?.get(Math.round(x)) ?? 0;
        const g = nk * (1 + 0.55 * Math.min(1, res) + 0.6 * Math.min(1, fl));
        this._node(x, cy, g, true, reach);
      }
      for (const x of crestsAt(sim.wave.phase, WAVE.x0 - 60, WAVE.x1 + 60, false)) this._node(x, ty, nk * 0.8, false, 0);
    }
    this.flares = this.flares.filter((F) => t - F.t0 < 2.5);
    // the figure's seven lights: the six petal tips and the centre (soft, once it has settled)
    if (this.m2 > 0.01) {
      const k = smooth(0.5, 1, this.m2);
      for (let j = 0; j < 6; j++) {
        const a = (-90 + 60 * j) * DEG, x = FIG.cx + FIG.R * Math.cos(a), y = FIG.cy + FIG.R * Math.sin(a);
        this.dots.add(x, y, 7, mul([1.0, 1.2, 1.8], 0.7 * k)); this.dots.add(x, y, 24, mul([0.06, 0.12, 0.34], k));
      }
      this.dots.add(FIG.cx, FIG.cy, 9, mul([1.1, 1.3, 1.9], 0.8 * k)); this.dots.add(FIG.cx, FIG.cy, 40, mul([0.07, 0.13, 0.36], k));
    }
  }
  _node(x, y, g, crest, reach) {
    if (x < WAVE.x0 - 4 || x > WAVE.x1 + 4) return;
    const b = this.sNode, c = mul(C.node, g), z = [0, 0, 0];
    // the vertical rays: the crest's upward one reaches exactly as high as the crest can tune (a solid spike, then a dotted
    // gauge to the reach); the others fade out
    const up = crest ? reach : 58, dn = 64;
    b.seg(x, y, x, y - 34, mul(c, 1.1), mul(c, 0.45), THIN);
    if (crest) b.seg(x, y - 34, x, y - up, mul(c, 0.42), mul(c, 0.16), { dash: 2.5, gap: 5.5, width: 0.55, speed: 0 }, 0);
    else b.seg(x, y - 34, x, y - up, mul(c, 0.45), z, { dash: 2.5, gap: 5.5, width: 0.5, speed: 0 }, 0);
    b.seg(x, y, x, y + 30, mul(c, 1.0), mul(c, 0.4), THIN);
    b.seg(x, y + 30, x, y + dn, mul(c, 0.4), z, { dash: 2.5, gap: 5.5, width: 0.5, speed: 0 }, 0);
    // the horizontal streak along the wave (a lens star) and short diagonals
    for (const [dx, dy, L, w] of [[1, 0, 44, 0.6], [-1, 0, 44, 0.6], [0.707, 0.707, 16, 0.45], [-0.707, 0.707, 16, 0.45], [0.707, -0.707, 16, 0.45], [-0.707, -0.707, 16, 0.45]]) {
      b.seg(x, y, x + dx * L, y + dy * L, mul(c, 1.0), z, { dash: 1, gap: 0, width: w, speed: 0 });
    }
    this.dots.add(x, y, 11, mul([1.5, 1.7, 2.3], 0.95 * g));
    this.dots.add(x, y, 34, mul([0.1, 0.18, 0.46], g));
  }

  // ---------------- the shapes ----------------
  _shapes(sim, dt, t) {
    const live = new Set(), won = sim.phase === 'card' && sim.result === 2;
    const fadeAll = won ? 1 - smooth(0.1, 0.9, sim.phaseTime) : 1;
    this._crestRes = new Map();
    for (const s of sim.shapes) {
      if (!s.alive) continue;
      live.add(s.id);
      let v = this.shapeV.get(s.id);
      if (!v) { v = { res: 0, born: t, cut: s.loose ? t - 9 : 0 }; this.shapeV.set(s.id, v); }
      const res = sim.phase === 'play' && sim.isResonant(s) ? 1 : 0;
      v.res += (res - v.res) * (1 - Math.exp(-dt / (res > v.res ? 0.09 : 0.2)));
      const bornK = smooth(0, 0.55, t - v.born) * fadeAll;
      if (bornK <= 0.005) continue;
      const passK = s.passed ? smooth(0, 0.5, sim.time - s.passedAt) : 0;
      const [top, right, bot, left] = kitePts(s.x, s.y, s.h);
      // its thread (hanging only): dotted, held still (dots counted from the top), faint high up
      if (!s.loose && !v.cut) {
        const y0 = glassTopAt(s.x) + 2;
        if (top[1] - y0 > 4) this.sThread.line([[s.x, y0], [s.x, top[1] - 3]], mul(C.red, 0.12 * bornK), THREAD, mul(C.red, 0.62 * bornK));
      }
      // the kite: steady red; resonant: the outline burns white-hot; through the wave: dim
      const r = v.res * (1 - passK);
      let col = mix(C.red, C.hotRed, r);
      col = mix(col, C.passed, passK);
      const g = bornK * (1 + 0.25 * r);
      this.sShape.loop([top, right, bot, left], mul(col, g), SOLID);
      this.sShape.seg(top[0], top[1], bot[0], bot[1], mul(col, 0.85 * g), mul(col, 0.85 * g), THIN);
      this.sShape.seg(left[0], left[1], right[0], right[1], mul(col, 0.85 * g), mul(col, 0.85 * g), THIN);
      this.crispDots.add(s.x, s.y + s.h * 0.1, s.h * 0.42, mul([0.2, 0.012, 0.01], bornK * (1 - 0.5 * passK)));
      // the shard it's gathering: its lowest point warms with a little red light (a slow swell, then it falls)
      if (s.dropAt >= 0) {
        const u = smooth(0, TUNE.shard.tell, sim.time - s.tellAt);
        this.crispDots.add(bot[0], bot[1] + 3, 5 + 7 * u, mul([0.9, 0.06, 0.04], 0.55 * u * bornK));
      }
      // the reach: while resonant, a line of light from the crest to the shape, and a soft white glow on it
      if (r > 0.01) {
        const cx = s.x - crestOffset(sim.wave.phase, s.x), cy = WAVE.y0 - sim.wave.A;
        this.sFx.seg(cx, cy - 4, s.x, bot[1] + 3, mul(C.white, 0.75 * r), mul(C.white, 0.35 * r), THIN);
        this.crispDots.add(s.x, s.y, s.h * 0.5, mul([0.1, 0.14, 0.3], r * bornK));
        for (const x of crestsAt(sim.wave.phase)) if (Math.abs(x - cx) < 2) this._crestRes.set(Math.round(x), Math.max(this._crestRes.get(Math.round(x)) ?? 0, r));
      }
    }
    for (const id of this.shapeV.keys()) if (!live.has(id)) this.shapeV.delete(id);
  }

  _shards(sim, t) {
    for (const sh of sim.shards) {
      const x = sh.x, y = sh.y, c = mul(C.red, 1.0);
      this.sShape.loop([[x, y - 8], [x + 3.2, y], [x, y + 9], [x - 3.2, y]], c, THIN);
      this.sThread.seg(x, y - 12, x, y - 34, mul(C.red, 0.4), [0, 0, 0], THREAD, 0);
      this.crispDots.add(x, y, 9, [0.28, 0.02, 0.015]);
    }
  }

  // ---------------- the emitter ----------------
  _emitter(sim, dt, t) {
    const e = sim.emitter, E = EMITTER;
    // the ground: the measured circle, live and faint edge to edge, lit where the emitter stands
    const gk = (1 - 0.5 * this.lostK) * (1 - 0.4 * this.m2);
    for (const r of clipToGlass(groundPts(GLASS[0], GLASS[2], 80))) this.sEmitter.line(r, mul(C.ground, 0.5 * gk), THIN);
    const lostHold = sim.phase === 'lost' ? 1 : 0;
    this.emitterV += ((e.alive ? 1 - 0.45 * lostHold : 0) - this.emitterV) * (1 - Math.exp(-dt / (e.alive ? 0.2 : 0.03)));
    if (this.emitterV < 0.01) return;
    const x = e.x, gy = groundY(x), k = this.emitterV * (1 - 0.5 * this.lostK) * (1 - 0.35 * this.m2);
    // the emitter's light along the ground (fading out both ways; clipped to the glass)
    for (const dir of [-1, 1]) {
      const pts = groundPts(x, x + dir * 190, 24);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (b[0] < glassLeftAt(b[1]) + 4 || b[0] > glassRightAt(b[1]) - 4) break;
        const ka = 1 - (i - 1) / 24, kb = 1 - i / 24;
        this.sEmitter.seg(a[0], a[1], b[0], b[1], mul(C.emitter, 0.95 * k * ka), mul(C.emitter, 0.95 * k * kb), THIN);
      }
    }
    const P = (u, v) => [x + u, gy - v], c = mul(C.emitter, 1.35 * k);
    // the triangle, its collar and the barrel (a slim capsule)
    this.sEmitter.line([P(-E.collar.foot, E.apex), P(-E.base, 0), P(E.base, 0), P(E.collar.foot, E.apex)], c, SOLID);
    this.sEmitter.loop([P(-E.collar.half, E.collar.top), P(E.collar.half, E.collar.top), P(E.collar.foot, E.apex), P(-E.collar.foot, E.apex)], c, SOLID);
    const bh = E.barrel.half, bt = E.barrel.top;
    this.sEmitter.line([P(-bh, E.collar.top), P(-bh, bt - bh), ...arc(x, gy - bt + bh, bh, bh, Math.PI, TAU, 8).slice(1, -1), P(bh, bt - bh), P(bh, E.collar.top)], mul(c, 1.05), SOLID);
    this.sEmitter.seg(x, gy - E.collar.top, x, gy - E.ring.y - E.ring.r, mul(c, 0.4), mul(c, 0.4), FINE);
    // the ring and its spokes to the base corners
    this.sEmitter.loop(arc(x, gy - E.ring.y, E.ring.r, E.ring.r, 0, TAU, 24).slice(0, 24), mul(c, 0.95), THIN);
    for (const sx of [-1, 1]) {
      const a = Math.atan2(E.ring.y, sx * E.base), r = E.ring.r + 2;
      this.sEmitter.seg(x + Math.cos(a) * r, gy - E.ring.y + Math.sin(a) * r, x + sx * (E.base - 4), gy - 2, mul(c, 0.4), mul(c, 0.4), FINE);
    }
    this.crispDots.add(x, gy - E.ring.y, 3, mul([0.9, 1.1, 1.6], 0.6 * k));
    this.crispDots.add(x - E.base, gy, 3.5, mul([0.9, 1.1, 1.6], 0.55 * k)); this.crispDots.add(x + E.base, gy, 3.5, mul([0.9, 1.1, 1.6], 0.55 * k));
    this.crispDots.add(x, gy - bt, 4, mul([0.9, 1.1, 1.6], 0.5 * k));
    // its two dashed half-rings
    for (const r of clipToGlass(arc(x, gy, E.arcs[0], E.arcs[0], Math.PI, TAU, 40))) this.sEmitter.line(r, mul(C.emitter, 1.0 * k), ARC_IN);
    for (const r of clipToGlass(arc(x, gy, E.arcs[1], E.arcs[1], Math.PI, TAU, 48))) this.sEmitter.line(r, mul(C.emitter, 0.7 * k), ARC_OUT);
    this.crispDots.add(x, gy - 40, 70, mul([0.012, 0.024, 0.07], k));
    // the ward (mercy): a steady ring while it holds (never a blink)
    if (e.ward > 0) this.sEmitter.loop(arc(x, gy - 50, 62, 62, 0, TAU, 48).slice(0, 48), mul(C.white, 0.5 * smooth(0, 0.6, e.ward)), THIN);
  }

  // ---------------- the pulses: a bright head, a dashed trail whose dashes are held still on the glass ----------------
  _pulses(sim) {
    for (const p of sim.pulses) this._pulseTrail(p.x, p.y0, p.y, 1, true);
  }
  _pulseTrail(x, y0, yh, fade, head) {
    const V = TUNE.pulse.speed, PER = 44, D = 22, tau = 0.2, L = Math.min(y0 - yh, 330), gTop = glassTopAt(x) + 5;
    if (yh + L <= gTop) return;
    if (head && yh >= gTop) {
      this.sPulse.seg(x, yh, x, yh + 22, mul(C.pulse, 1.35), mul(C.pulse, 1.0), SOLID);
      this.crispDots.add(x, yh + 4, 9, [0.7, 0.9, 1.5]);
      this.crispDots.add(x, yh + 8, 22, [0.05, 0.09, 0.22]);
    }
    const top = Math.max(gTop, yh + (head ? 30 : 0)), bot = yh + L;
    for (let k = Math.floor(top / PER); k * PER < bot; k++) {
      const a = Math.max(top, k * PER), b = Math.min(bot, k * PER + D);
      if (b <= a) continue;
      const ka = Math.exp(-((a - yh) / V) / tau) * fade, kb = Math.exp(-((b - yh) / V) / tau) * fade;
      if (ka < 0.02) continue;
      this.sPulse.seg(x, a, x, b, mul(C.pulse, 1.15 * ka), mul(C.pulse, 1.15 * kb), SOLID);
    }
  }

  // ---------------- bursts, pieces, rings, words ----------------
  _effects(sim, dt, t) {
    this.fx = this.fx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.fx) {
      const age = t - e.t0, u = age / e.dur, fade = 1 - smooth(0, 1, u);
      if (age < 0) continue;
      if (e.k === 'burst') {
        // a soft white-blue starburst: eased in over 60 ms, out over the rest; its rays grow a little as they fade
        const inK = smooth(0, 0.06, age), k = inK * Math.pow(1 - u, 1.5), big = 0.8 + 0.4 * e.big;
        for (let i = 0; i < 20; i++) {
          const a = i * 2.39996 + hash1(e.seed * 3 + i) * 0.3, long = i % 3 === 0, L = (long ? 110 + 50 * hash1(e.seed + i) : 40 + 34 * hash1(e.seed * 2 + i)) * big;
          const r0 = 4 + 8 * u, r1 = r0 + L * (0.7 + 0.3 * u);
          this.sFx.seg(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1,
            mul(C.white, 1.5 * k), [0, 0, 0], long ? THIN : FINE);
        }
        this.crispDots.add(e.x, e.y, 15 + 10 * u, mul([1.3, 1.45, 1.9], 1.2 * k));
        this.crispDots.add(e.x, e.y, 58 + 20 * u, mul([0.12, 0.18, 0.42], k));
      } else if (e.k === 'piece') {
        const d = e.drag ? e.drag * (1 - Math.exp(-age / e.drag)) : age;
        const x = e.x + e.vx * d, y = e.y + e.vy * d + 0.5 * e.g * age * age, r = e.vr * age, ca = Math.cos(r), sa = Math.sin(r);
        const pts = e.pts.map(([px, py]) => [x + px * ca - py * sa, y + px * sa + py * ca]);
        this.sFrag.loop(pts, mul(e.dim ? C.passed : C.red, 0.95 * fade), THIN);
      } else if (e.k === 'tri') {
        const d = e.drag ? e.drag * (1 - Math.exp(-age / e.drag)) : age;
        const x = e.x + e.vx * d, y = e.y + e.vy * d + 0.5 * e.g * age * age, a = e.rot + e.vr * age;
        const pts = [0, 1, 2].map((j) => [x + Math.cos(a + j * TAU / 3) * e.r, y + Math.sin(a + j * TAU / 3) * e.r]);
        this.sFrag.loop(pts, mul(C.red, 0.9 * fade), FINE);
      } else if (e.k === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * Math.sqrt(u);
        this.sFx.loop(arc(e.x, e.y, r, r, 0, TAU, 40).slice(0, 40), mul(e.c, 0.6 * fade * smooth(0, 0.08, age)), THIN);
      } else if (e.k === 'ghost') {                        // a split: the parent's outline opens out and fades (dull)
        const sp = 1 + 0.5 * u, [a, b, c, d] = kitePts(e.x, e.y, e.h).map(([x, y]) => [e.x + (x - e.x) * sp, e.y + (y - e.y) * sp]);
        this.sFrag.loop([a, b, c, d], mul(C.passed, 0.8 * fade), FINE);
      } else if (e.k === 'thread') {                       // a cut thread: it drops away and fades
        const dy = 40 * u * u;
        this.sThread.line([[e.x, e.y0 + dy], [e.x, e.y1 + dy]], mul(C.red, 0.1 * fade), THREAD, mul(C.red, 0.5 * fade));
      } else if (e.k === 'trail') this._pulseTrail(e.x, e.y0, e.yh, 1 - smooth(0, 1, u), false);
      else if (e.k === 'groundRing') {
        const r = 20 + 110 * Math.sqrt(u), gy = groundY(e.x);
        this.sFx.line(arc(e.x, gy, r, r * 0.16, Math.PI, TAU, 32), mul(C.dull, 0.8 * fade), THIN);
      } else if (e.k === 'spark') this.crispDots.add(e.x, e.y - 2, 6 + 6 * u, mul([0.5, 0.04, 0.03], 0.6 * fade));
      else if (e.k === 'speck') {
        const d = e.drag * (1 - Math.exp(-age / e.drag)), x = e.x + e.vx * d, y = e.y + e.vy * d + 60 * age * age;
        this.sFrag.loop(arc(x, y, 2.2, 2.2, 0, TAU, 6).slice(0, 6), mul(C.red, 0.85 * fade), FINE);
      }
      else if (e.k === 'eFrag') {
        const x = e.x + e.vx * age, y = e.y + e.vy * age, r = e.vr * age, ca = Math.cos(r), sa = Math.sin(r);
        const P = (q) => { const dx = q[0] - e.x, dy = q[1] - e.y; return [x + dx * ca - dy * sa, y + dx * sa + dy * ca]; };
        this.sEmitter.line([P(e.a), P(e.b)], mul(C.emitter, 1.0 * fade), SOLID);
      } else if (e.k === 'text') drawText(this.sFx, e.text, e.x, e.y - 22 * u, { h: e.h ?? 13, color: mul(e.c, 0.95 * fade * smooth(0, 0.12, age)), track: 1 });
    }
  }

  // ---------------- score, what's left to tune, the chain, lives, banners, cards ----------------
  _ui(sim, t, ui) {
    const s = this.sUI, tx = this.sText; s.clear(); tx.clear();
    this.uiIn = Math.min(1, this.uiIn + (this._dt ?? 1 / 60) / 0.45);
    this.matUI.gain = this.matText.gain = smooth(0, 1, this.uiIn); this.band.material.opacity = smooth(0, 1, this.uiIn);
    const o = this.band; o.clear();
    const cx = CX;
    // the score where the concept has it: top left, blue 7-segment
    drawDigits(s, String(sim.score), 112, 62, { h: 27, w: 17, pitch: 24, slant: 0.14, gap: 1.8, hollow: false, color: mul(C.score, 1.15),
      style: { dash: 1, gap: 0, width: 0.9 } });
    // lives: small emitters, top right
    for (let k = 0; k < Math.max(0, sim.livesLeft); k++) this._mini(s, 1128 - k * 36, 92, 0.34, mul(C.emitter, 1.0));
    if (ui.mode !== 'attract') {
      const left = Math.max(0, sim.target - sim.tuned), frac = clamp01(sim.tuned / Math.max(1, sim.target));
      if (sim.phase !== 'card') drawText(tx, left + ' TO TUNE', 113, 104, { h: 13, color: mul(C.white, 0.9), track: 1, align: 'left' });
      const x0 = 113, x1 = 253, y = 126;
      s.seg(x0, y, x0 + (x1 - x0) * frac, y, mul(C.score, 1.0), mul(C.score, 1.0), THIN);
      if (frac < 1) s.seg(x0 + (x1 - x0) * frac, y, x1, y, mul(C.score, 0.2), mul(C.score, 0.2), THIN);
      const chainA = smooth(0, 0.3, this.chainK + (sim.chain >= 2 ? 0.3 : 0)) * (sim.chain >= 2 ? 1 : 0);
      if (chainA > 0.01 && sim.phase !== 'card') drawText(tx, 'CHAIN ' + sim.chain, 113, 140, { h: 11, color: mul(C.chain, 1.1 * chainA), track: 1, align: 'left' });
    }
    const band = (y0, y1, a, x0 = 0, x1 = FRAME[0]) => {     // a soft dark band behind card text (the wave stays visible)
      if (a <= 0.001) return;
      for (const [d, k] of [[0, 0.35], [14, 0.65], [28, 1]]) o.poly([[x0, y0 + d], [x1, y0 + d], [x1, y1 - d], [x0, y1 - d]], [0, 0, 0, a * k * 0.5]);
    };
    // banners (ALMOST THERE; the lower ones: why a life was lost, the first shape through the wave)
    if (ui.mode !== 'attract') {
      for (const [B, y] of [[this.banner, 560], [this.lower, 610]]) {
        if (!B) continue;
        const u = (t - B.t0) / B.dur;
        if (u < 0 || u >= 1) continue;
        const a = smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u));
        band(y - 26, y + (B.b ? 70 : 44), a * 0.8);
        drawText(tx, B.a, cx, y, { h: B === this.banner ? 22 : 16, color: mul(B === this.banner ? C.white : C.text, a), track: 1 });
        if (B.b) drawText(tx, B.b, cx, y + 34, { h: 13, color: mul(C.text, 0.9 * a), track: 1 });
      }
    }
    if (ui.mode === 'attract') {
      band(40, 700, 1.7);
      const breathe = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
      drawText(tx, 'THE RESONANCE', cx, 214, { h: 54, color: mul(C.text, 1.3), track: 2 });
      drawText(tx, 'TUNE THE SIGNAL', cx, 306, { h: 20, color: mul(C.white, 0.9), track: 2 });
      drawText(tx, this.inCabinet ? (this.cabinetStart ?? 'INSERT COIN') : 'PRESS START', cx, 392, { h: 24, color: mul(C.white, breathe), track: 2 });
      drawText(tx, 'HIT THE RED SHAPES ON THE CREST OF THE WAVE', cx, 470, { h: 14, color: mul(C.text, 0.85), track: 1 });
      drawText(tx, 'LEFT RIGHT  MOVE     SPACE OR Z  FIRE', cx, 508, { h: 14, color: mul(C.text, 0.78), track: 1 });
      drawText(tx, "OFF-PHASE HITS SPLIT THEM · DON'T LET THEM LAND", cx, 546, { h: 14, color: mul(C.text, 0.78), track: 1 });
      drawText(tx, sim.target + ' CLEAN HITS TUNE THE SIGNAL', cx, 584, { h: 14, color: mul(C.text, 0.78), track: 1 });
      drawText(tx, 'HI ' + ui.hi + (ui.last ? '   LAST ' + ui.last : ''), cx, 662, { h: 16, color: mul(C.score, 0.95), track: 2 });
    } else if (sim.phase === 'ready') {
      const first = sim.readyDur > 2;
      const a = smooth(0, 0.3, sim.phaseTime) * (1 - smooth(sim.readyDur - 0.45, sim.readyDur, sim.phaseTime));
      if (first) {
        band(548, 738, a);
        drawText(tx, 'HIT THE SHAPES ON THE CREST', cx, 578, { h: 27, color: mul(C.white, a), track: 2 });
        drawText(tx, sim.target + ' CLEAN HITS TUNE THE SIGNAL', cx, 634, { h: 19, color: mul(C.text, a), track: 2 });
        drawText(tx, "OFF-PHASE HITS SPLIT THEM · DON'T LET THEM LAND", cx, 680, { h: 13, color: mul(C.text, 0.85 * a), track: 1 });
      } else {
        band(588, 668, a);
        drawText(tx, 'READY', cx, 614, { h: 24, color: mul(C.white, a), track: 3 });
      }
    } else if (sim.phase === 'card') {
      const won = sim.result === 2, delay = won ? 4.4 : 0.9;
      const a = smooth(delay, delay + 0.8, sim.phaseTime);
      band(622, 806, a);
      drawText(tx, won ? 'THE SIGNAL IS CLEAR' : 'THE SIGNAL IS LOST', cx, 648, { h: 36, color: mul(won ? C.white : C.text, a), track: 2 });
      const lostWhy = (sim.stats?.landed ?? 0) + ' LANDED · ' + (sim.stats?.struck ?? 0) + ' STRUCK';
      drawText(tx, won ? sim.tuned + ' CLEAN HITS · BEST CHAIN ' + sim.bestChain : sim.tuned + ' OF ' + sim.target + ' CLEAN HITS · ' + lostWhy, cx, 712, { h: 15, color: mul(C.text, 0.9 * a), track: 1 });
      drawText(tx, 'SCORE ' + sim.score, cx, 752, { h: 22, color: mul(C.score, a), track: 2 });
    }
    s.commit(); tx.commit(); o.commit();
  }
  /** a small emitter (lives) */
  _mini(b, x, y, k, c) {
    const E = EMITTER, P = (u, v) => [x + u * k, y - v * k];
    b.line([P(-E.collar.foot, E.apex), P(-E.base, 0), P(E.base, 0), P(E.collar.foot, E.apex)], c, SOLID);
    b.line([P(-E.collar.foot, E.apex), P(-E.barrel.half, E.collar.top), P(-E.barrel.half, E.barrel.top), P(E.barrel.half, E.barrel.top), P(E.barrel.half, E.collar.top), P(E.collar.foot, E.apex)], c, SOLID);
  }
}
