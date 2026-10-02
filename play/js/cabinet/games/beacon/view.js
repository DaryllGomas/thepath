// THE NODE · THE BEACON · THE PICTURE (three.js, the look kit). Reads the round, never changes it.
//
//   const view = new BeaconView(kit); await view.ready;      kit = createLookKit(renderer, { ...BEACON_LOOK })
//   view.update(sim, dt, t, ui)       ui = { mode: 'attract' | 'play', hi, last }
//
// The layers (the painted plate + live light, PIPELINES.md section 10):
//   the plate (the starfield, the faint blue guide circles and crosshair); the core's light lights it (a soft blue glow
//   that breathes), each lighting lifts it a step and wakes the painted guide circle it reached
//   the lit figure: each lighting draws more of the sacred figure outward from the core, on the guide circles
//   the core: the small circle, the figure circle, the eight rays, and a still VESICA PISCIS (two equal circles, each
//   through the other's centre): the eye emerges from the geometry itself, the light gathers in its lens, and it never
//   turns or tracks (held, not hunted). Before a shard, light gathers at the heart and the lens rim warms
//   the nebula: soft concentric shells on the glass (the Helix: a blue-white heart, fainter blue shells, a warm rim),
//   breathing slowly outward (an 8 s cycle)
//   the rings: clean built capsules (layout.js), dimmer and then dashed as they're chipped; broken ones shed their outline
//   as drifting fragments; reforming ones fade back in, dotted, then solid
//   the crisp layer (kit.overlay, no persistence): the ship, its thrust, the shots, the red shards
//   sparks (red, brief, fading), the score (7-segment, top left), ships left, the three lights (top right), banners, cards
// Safety: nothing steps or blinks. The lighting SWELLS (0.6 s up, ~1.6 s down). A struck shield dims in steps (no pulse per
// hit). Sparks ease in and fade, and their total light is capped and eased; red shards are steady; invulnerability is a
// steady dim, never a blink.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, ellipse, star, GlowDots, MotionTrail, drawDigits, Backdrop, FillBatch } from '../../lookkit/index.js';
import { FRAME, CENTRE, RINGS, FIG, RAYS8, LIT_FIGURE, capsule, segSpan, segAngle, ellipseArc, vesicaPiscis } from './layout.js';
import { TUNE } from './spec.js';
import { drawText } from '../hearth/font.js';

export const PLATE_URL = new URL('../../../../assets/looktest/beacon_plate.png', import.meta.url).href;

export const BEACON_LOOK = {
  frame: FRAME,
  overlay: true,              // crisp layer after the phosphor pass: the ship, shots and shards leave no ghost copies
  bloom: { strength: 0.55, radius: 0.5, threshold: 1.0, tint: [0.5, 0.72, 1.0] },
  phosphor: { tau: [0.03, 0.037, 0.047] },
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.12, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

// HDR light. Blue lines use hot [2.4, 1.9, 1.3]: a blue's small red and green decide how white its core burns.
const HOT_BLUE = [2.4, 1.9, 1.3], HOT_RED = [1.4, 2.4, 3.2];
const C = {
  ring: [0.14, 0.42, 1.25], fig: [0.14, 0.38, 1.1], lit: [0.26, 0.52, 1.1], lens: [0.22, 0.5, 1.15], rose: [1.2, 0.3, 0.26],
  ship: [0.3, 0.6, 1.2], shot: [0.55, 0.8, 1.35], red: [1.25, 0.1, 0.05], score: [0.28, 0.58, 1.25], text: [0.26, 0.55, 1.15],
  white: [0.62, 0.85, 1.35], frag: [0.2, 0.46, 1.05],
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

const DOT = { dash: 3.2, gap: 3.4, width: 0.8, speed: 0 };        // the painting's dotted guide texture, lit
const FINE = { dash: 2.2, gap: 2.2, width: 0.75, speed: 0 };
const SOLIDISH = { dash: 1, gap: 0, width: 0.85, speed: 0 };      // the concept's core figure burns solid
const DASH = { dash: 5, gap: 3.4, width: 0.75, speed: 0 };
const CRACK = { dash: 7, gap: 3.2, width: 1, speed: 0 };          // a shield with one hit left
const FORMING = { dash: 2.5, gap: 3.5, width: 0.9, speed: 0 };
const EDGE = { dash: 1, gap: 0, width: 0.7, speed: 0 };
const THIN = { dash: 1, gap: 0, width: 0.55, speed: 0 };

// the ship, in its own frame (x forward, y right): a kite with a spine and a cross-bar (the concept's diamond ship)
const SHIP = { outer: [[19, 0], [-3, 9.5], [-10, 0], [-3, -9.5]], inner: [[[19, 0], [-10, 0]], [[-3, 9.5], [-3, -9.5]], [[8, 0], [-3, 4.5]], [[8, 0], [-3, -4.5]]] };
const SHIP_K = 2.2;           // the concept's ship is big and readable (round.js: TUNE.ship.r matches it)
function shipPts(x, y, a, k = 1) {
  const ca = Math.cos(a), sa = Math.sin(a), P = ([u, v]) => [x + (u * ca - v * sa) * k, y + (u * sa + v * ca) * k];
  return { outer: SHIP.outer.map(P), inner: SHIP.inner.map((l) => l.map(P)) };
}

export class BeaconView {
  constructor(kit) {
    this.kit = kit;
    const { scene } = kit;

    // ---- layer 1: the plate, lit by the core ----
    const plate = new THREE.Texture();
    plate.colorSpace = THREE.NoColorSpace; plate.minFilter = THREE.LinearMipmapLinearFilter; plate.magFilter = THREE.LinearFilter;
    this.ready = new Promise((resolve, reject) => {
      new THREE.ImageLoader().load(PLATE_URL, (img) => { plate.image = img; plate.needsUpdate = true; resolve(); }, undefined, reject);
    });
    const R = RINGS;
    this.backdrop = new Backdrop({
      frame: FRAME, map: plate,
      uniforms: { plateGain: { value: 1 }, coreGlow: { value: 1 }, wake: { value: new THREE.Vector3(0, 0, 0) }, dark: { value: 0 },
        shells: { value: new THREE.Vector4(1, 1, 1, 1) } },
      shade: /* glsl */`
        vec3 x = -log(max(vec3(1.0) - tex.rgb, vec3(0.03)));      // the painting -> light (the tone map gives it back)
        vec2 d = f - vec2(${CENTRE[0].toFixed(2)}, ${CENTRE[1].toFixed(2)});
        float paint = smoothstep(0.015, 0.08, tex.b - 0.5 * (tex.r + tex.g));   // only the painted blue lines and stars
        // a lighting wakes the painted guide circle it reached (a band on each ellipse)
        float r1 = length(vec2(d.x, d.y / ${R[0].sy.toFixed(4)})), r2 = length(vec2(d.x, d.y / ${R[1].sy.toFixed(4)})), r3 = length(vec2(d.x, d.y / ${R[2].sy.toFixed(4)}));
        float b1 = exp(-pow((r1 - ${R[0].R.toFixed(1)}) / 5.0, 2.0)), b2 = exp(-pow((r2 - ${R[1].R.toFixed(1)}) / 5.0, 2.0)), b3 = exp(-pow((r3 - ${(R[2].R - 3).toFixed(1)}) / 7.0, 2.0));
        x *= plateGain * (1.0 + paint * 2.2 * (wake.x * b1 + wake.y * b2 + wake.z * b3));
        // THE NEBULA (after the Helix): soft concentric shells of light on the glass: a blue-white heart drawn a little
        // long along the lens, a blue inner shell, a fainter outer shell, a warm rim; lumpy like gas (a still pattern: it
        // never crawls), each shell breathing slowly, the breath moving outward (shells.xyzw)
        float rc = length(vec2(d.x, d.y / 0.965)), rl = length(vec2(d.x * 1.25, d.y / 1.05)), ang = atan(d.y, d.x);
        float lump1 = 0.66 + 0.34 * sin(ang * 3.0 + 1.1) * sin(ang * 5.0 - 0.4 + rc * 0.013);
        float lump2 = 0.66 + 0.34 * sin(ang * 4.0 - 0.7) * sin(ang * 7.0 + 2.1 - rc * 0.011);
        float lump3 = 0.6 + 0.4 * sin(ang * 6.0 + 0.3) * sin(ang * 2.0 - 1.7 + rc * 0.02);
        vec3 neb = vec3(0.02, 0.05, 0.14) * exp(-rl * rl / (2.0 * 62.0 * 62.0)) * shells.x
                 + vec3(0.018, 0.058, 0.155) * exp(-pow((rc - 108.0) / 26.0, 2.0)) * lump1 * shells.y
                 + vec3(0.012, 0.036, 0.1) * exp(-pow((rc - 162.0) / 30.0, 2.0)) * lump2 * shells.z
                 + vec3(0.075, 0.028, 0.015) * exp(-pow((rc - 198.0) / 16.0, 2.0)) * lump3 * shells.w
                 + vec3(0.002, 0.005, 0.014) * exp(-rc * rc / (2.0 * 420.0 * 420.0));
        x += coreGlow * neb;
        return x * (1.0 - 0.35 * dark);`,
    });
    scene.add(this.backdrop.object);

    // ---- live layers ----
    const T = (o) => kit.track(new GlowLineMaterial(o));
    this.matLit = T({ width: 6, coreGain: 3.0, haloGain: 0.7, hot: HOT_BLUE });
    this.matCore = T({ width: 6, coreGain: 3.2, haloGain: 0.8, hot: HOT_BLUE });
    this.matRings = T({ width: 6.5, coreGain: 3.0, haloGain: 1.0, hot: HOT_BLUE });
    this.matFx = T({ width: 6, hot: HOT_BLUE });
    this.matRed = T({ width: 5, coreGain: 2.8, haloGain: 0.7, hot: HOT_RED });
    this.matUI = T({ width: 8, coreGain: 3.0, hot: HOT_BLUE });
    this.sLit = new LineBatch(this.matLit, 2500); this.sCore = new LineBatch(this.matCore, 400);
    // the core's still figure (built once; its material's gain breathes): the axes burn solid out past the figure circle
    // (the concept's cross), the diagonals are dashed, the small circle and the figure circle
    this.matStill = T({ width: 6, coreGain: 3.2, haloGain: 0.8, hot: HOT_BLUE });
    this.sStill = new LineBatch(this.matStill, 1000);
    this.vp = vesicaPiscis();
    {
      const b = this.sStill, [cx, cy] = CENTRE, fc = FIG.circle;
      for (const a of RAYS8) {
        const axis = Math.abs(Math.sin(2 * a)) < 1e-6, r1 = axis ? fc.R + 16 : fc.R;
        const p0 = [cx + Math.cos(a) * 8, cy + Math.sin(a) * 8 * fc.sy], p1 = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * fc.sy];
        if (axis) b.line([p0, p1], mul(C.fig, 1.15), SOLIDISH, mul(C.fig, 0.75));
        else b.line([p0, p1], mul(C.fig, 0.8), DASH);
      }
      b.loop(ellipse(cx, cy, FIG.small, FIG.small, 72).slice(0, 72), C.fig, SOLIDISH);
      b.loop(ellipseArc(fc.R, fc.sy, 0, Math.PI * 2, 0.02).slice(0, -1), mul(C.fig, 1.05), SOLIDISH);
      for (const c of this.vp.circles) b.loop(c, mul(C.fig, 0.85), SOLIDISH);   // the vesica piscis: two circles, still
      b.commit(); b.object.renderOrder = 6; scene.add(b.object);
    }
    this.sRings = new LineBatch(this.matRings, 4200); this.sFx = new LineBatch(this.matFx, 2500);
    this.sRed = new LineBatch(this.matRed, 2500); this.sUI = new LineBatch(this.matUI, 3000);
    for (const [b, o] of [[this.sLit, 4], [this.sCore, 6]]) { b.object.renderOrder = o; scene.add(b.object); }
    // the rings turn: in the crisp layer (no persistence) their ends stay sharp instead of smearing into hatching
    this.sRings.object.renderOrder = 10; (kit.overlay ?? scene).add(this.sRings.object);
    this.dots = kit.track(new GlowDots(900));
    this.band = new FillBatch(64); this.band.object.renderOrder = 30;
    scene.add(this.dots.object);
    // the crisp layer: the ship, the shots, the shards
    this.matShip = T({ width: 7, coreGain: 3.2, hot: HOT_BLUE });
    this.matShard = T({ width: 6.5, coreGain: 2.6, haloGain: 0.9, hot: HOT_RED });
    this.sShip = new LineBatch(this.matShip, 1200); this.sShard = new LineBatch(this.matShard, 600); this.crispDots = kit.track(new GlowDots(160));
    this.sShip.object.renderOrder = 12; this.sShard.object.renderOrder = 13; this.crispDots.object.renderOrder = 14;
    // the red sparks fly fast: crisp too (in the persistent layer they smear into wedges)
    this.sRed.object.renderOrder = 13; this.sparkDots = kit.track(new GlowDots(700)); this.sparkDots.object.renderOrder = 15;
    // the cards' dark band and the text go last, in the crisp layer too, so the band dims the turning rings behind a card
    this.sUI.object.renderOrder = 40; this.sFx.object.renderOrder = 11;   // moving effects (fragments, waves, wakes) stay crisp too
    (kit.overlay ?? scene).add(this.sFx.object, this.sShip.object, this.sShard.object, this.crispDots.object, this.sRed.object, this.sparkDots.object,
      this.band.object, this.sUI.object);

    // the shields, precomputed once per ring in polar form (angle offset from the shield's centre, radius): per frame
    // they only turn. Full / cracked share the outline; the ring's own ellipse squash is applied on the way out.
    this.shape = RINGS.map((ring, i) => {
      const span = segSpan(i), pts = capsule(i, -span, span, { arcStep: 0.028 });
      return pts.map(([x, y]) => { const u = x - CENTRE[0], v = (y - CENTRE[1]) / ring.sy, da = Math.atan2(v, u), r = Math.hypot(u, v); return [da, r, Math.cos(da) * r, Math.sin(da) * r]; });
    });
    this._pts = this.shape.map((sh) => sh.map(() => [0, 0]));
    this._reset();
  }

  _reset() {
    this.fx = []; this.sparks = []; this.trails = new Map(); this.banner = null; this.sub = null;
    this.segV = RINGS.map((r) => new Array(r.n).fill(1));     // eased shield brightness (follows hp)
    this.lit = 0; this.litE = 0; this.swellAt = -9; this.swellN = 0; this.dark = 0; this.gFx = 1; this.shipV = 0; this.flame = 0; this.gather = 0;
    this.stageAt = [-9, -9, -9, -9];
  }

  /** One frame. sim = the round being shown (the attract demo or the real one). */
  update(sim, dt, t, ui = {}) {
    if (sim !== this._sim) { this._sim = sim; this._reset(); this.kit.resetPersistence?.(); this.lit = sim.core.lit; this.litE = this.lit; for (let k = 1; k <= this.lit; k++) this.stageAt[k] = -99; }
    this.matLit.time = t; this.matCore.time = t;
    this.sShip.clear(); this.sShard.clear(); this.crispDots.clear(); this.sparkDots.clear(); this.sFx.clear(); this.sRed.clear(); this.dots.clear();
    this._events(sim, t);
    this._light(sim, dt, t);
    this._litFigure(sim, t);
    this._core(sim, dt, t);
    this._rings(sim, dt, t);
    this._shots(sim);
    this._shards(sim, t);
    this._ship(sim, dt, t);
    this._effects(sim, dt, t);
    this.sFx.commit(); this.sRed.commit(); this.dots.commit(); this.sShip.commit(); this.sShard.commit(); this.crispDots.commit(); this.sparkDots.commit();
    this._ui(sim, t, ui);
  }

  // ---------------- events -> effects ----------------
  _events(sim, t) {
    for (const e of sim.events) {
      if (e.kind === 'chip') this._sparkBurst(e.x, e.y, e, 9, 0.8);
      else if (e.kind === 'break') {
        this._sparkBurst(e.x, e.y, e, 16, 1.0);
        // the shield sheds its outline: six pieces drift outward and fade
        const ring = RINGS[e.ring], sh = this.shape[e.ring], n = sh.length, pieces = 6;
        for (let p = 0; p < pieces; p++) {
          const pts = [];
          for (let q = Math.floor(p * n / pieces); q <= Math.floor((p + 1) * n / pieces) && q < n + 1; q++) { const [da, r] = sh[q % n]; pts.push([da + e.a, r]); }
          const mid = pts[Math.floor(pts.length / 2)], seed = e.ring * 31 + e.j * 7 + p;
          this.fx.push({ k: 'frag', ring: e.ring, pts, t0: t, dur: 0.5 + 0.2 * hash1(seed), va: (hash1(seed * 3) - 0.5) * 0.3,
            vr: 40 + 60 * hash1(seed * 5), pivot: mid });
        }
      } else if (e.kind === 'shardKill') this._sparkBurst(e.x, e.y, null, 14, 0.9);
      else if (e.kind === 'die') {
        const p = shipPts(e.x, e.y, e.a, SHIP_K), segs = [];
        const o = p.outer; for (let k = 0; k < 4; k++) segs.push([o[k], o[(k + 1) % 4]]);
        segs.push(...p.inner.slice(0, 2));
        segs.forEach(([a, b], k) => {
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ang = Math.atan2(my - e.y, mx - e.x) + (hash1(k + t) - 0.5) * 0.6, v = 35 + 45 * hash1(k * 3 + t);
          this.fx.push({ k: 'shipFrag', a, b, x: mx, y: my, vx: Math.cos(ang) * v + e.vx * 0.25, vy: Math.sin(ang) * v + e.vy * 0.25, vr: (hash1(k * 7 + t) - 0.5) * 4, t0: t, dur: 1.4 });
        });
        this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 1.0, r0: 8, r1: 70, c: C.ship });
        this._sparkBurst(e.x, e.y, null, 18, 1.0);
      } else if (e.kind === 'shield') this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 1.2, r0: 16, r1: 46, c: C.white });
      else if (e.kind === 'respawn') this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 0.9, r0: 60, r1: 18, c: mul(C.ship, 0.7) });
      else if (e.kind === 'light') {
        this.swellAt = t; this.swellN = e.n; this.stageAt[e.n] = t;
        this.banner = { text: e.last ? 'THE BEACON BURNS' : 'THE BEACON LIGHTS · ' + e.n + ' OF ' + TUNE.lights, t0: t + 0.35, dur: e.last ? 2.4 : 3.1 };
        this.sub = { text: '+' + e.points, t0: t + 0.35, dur: e.last ? 2.4 : 3.1 };
        this.fx.push({ k: 'wave', t0: t, dur: 1.1, n: e.n });
      } else if (e.kind === 'ringClear') this.fx.push({ k: 'text', text: 'THE RING REFORMS', x: CENTRE[0], y: 890, t0: t + 0.3, dur: 1.6, c: C.text });
    }
  }

  _sparkBurst(x, y, e, n, k) {
    // red sparks spray back out of the struck face (away from the core), with a few scattered embers (the concept's look)
    const out = Math.atan2(y - CENTRE[1], x - CENTRE[0]), seed = x * 0.37 + y * 0.11 + this.sparks.length;
    for (let i = 0; i < n; i++) {
      const a = out + (hash1(seed + i) - 0.5) * 2.2, v = 90 + 190 * hash1(seed * 2 + i);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: this._t, dur: 0.35 + 0.45 * hash1(seed * 3 + i), k: k * (0.6 + 0.4 * hash1(i + seed * 5)),
        dot: i % 3 === 0 });
    }
    // embers: short red dashes thrown wider that drift and linger a little (the concept's scattered red)
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      const a = out + (hash1(seed * 7 + i) - 0.5) * 3.4, v = 40 + 90 * hash1(seed * 11 + i);
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: this._t, dur: 0.8 + 0.5 * hash1(seed * 13 + i), k: k * 0.8, ember: true,
        ang: hash1(seed * 17 + i) * Math.PI });
    }
    this.sparks.push({ x, y, vx: 0, vy: 0, t0: this._t, dur: 0.3, k: k, heart: true });
  }

  // ---------------- the Beacon's light: the swell, the steps, the dark ----------------
  _light(sim, dt, t) {
    this._t = t;
    const lit = sim.core.lit;
    if (lit < this.lit) { this.lit = lit; this.litE = lit; }
    this.lit = lit;
    this.litE += (this.lit - this.litE) * (1 - Math.exp(-dt / 1.4));          // each lighting lifts the scene a step, eased
    const since = t - this.swellAt;
    this.swell = since >= 0 && since < 4 ? smooth(0, 0.6, since) * (1 - smooth(0.9, 2.5, since)) : 0;   // SWELL, never a flash
    const lost = sim.phase === 'card' && sim.result === 1;
    this.dark += ((lost ? 1 : 0) - this.dark) * (1 - Math.exp(-dt / 1.2));
    const BREATH = 8;                                                          // s: the heart breathes, slowly (6-10 s)
    this.breath = 1 + 0.08 * Math.sin(t * Math.PI * 2 / BREATH);
    // the nebula's shells breathe with it, the breath moving outward shell by shell
    const sh = (k) => 1 + 0.14 * Math.sin(t * Math.PI * 2 / BREATH - 0.75 * k);
    const u = this.backdrop.uniforms;
    u.plateGain.value = (1 + 0.13 * this.litE + 0.1 * this.swell) * (1 - 0.3 * this.dark);
    u.coreGlow.value = (0.85 + 0.2 * this.litE) * this.breath * (1 + 1.3 * this.swell) * (1 - 0.6 * this.dark);
    const w = (k) => clamp01(this.litE - (k - 1)) * (0.55 + 0.45 * smooth(0, 1, t - this.stageAt[k] - 0.4));
    u.wake.value.set(w(1), w(2), w(3));
    u.dark.value = this.dark;
    u.shells.value.set(sh(0), sh(1), sh(2), sh(3));
  }

  // ---------------- the lit figure ----------------
  _litFigure(sim, t) {
    const b = this.sLit; b.clear();
    const g = (1 + 0.25 * this.swell) * (1 - 0.5 * this.dark);
    for (const P of LIT_FIGURE) {
      if (P.stage > this.lit) continue;
      const since = t - this.stageAt[P.stage] - 0.35 - P.delay;
      if (since <= 0) continue;
      const dur = P.kind === 'circle' ? 0.55 : P.kind === 'star' ? 0.9 : 0.5, u = clamp01(since / dur);
      const col = mul(P.kind === 'star' ? C.white : C.lit, (0.7 + 0.35 * (1 - smooth(0, 2.5, since - dur))) * g * (0.94 + 0.06 * this.breath));
      for (const pts of P.parts) {
        const head = partial(b, pts, u, col, DOT);
        if (u < 1) this.dots.add(head[0], head[1], 5, mul([0.5, 0.75, 1.3], 0.9));
      }
    }
    b.commit();
  }

  // ---------------- the core ----------------
  _core(sim, dt, t) {
    const b = this.sCore; b.clear();
    const lit = 1 + 0.12 * this.litE, sw = 1 + 1.0 * this.swell, dk = 1 - 0.55 * this.dark;
    const g = this.breath * lit * dk;
    const [cx, cy] = CENTRE, fc = FIG.circle;
    this.matStill.gain = g;
    // the light gathers before a shard (it rises with the charge; it leaves with the shard, easing out)
    const ch = sim.core.charge;
    this.gather += (ch - this.gather) * (1 - Math.exp(-dt / (ch > this.gather ? 0.05 : 0.3)));
    const q = this.gather;
    // THE LENS: where the two circles overlap the light concentrates (an almond glow); its rim warms as light gathers
    b.loop(this.vp.lens, mul(C.lens, (1.1 - 0.8 * q) * g * (1 + 0.2 * this.swell)), SOLIDISH);
    const tipY = this.vp.tips[1][1] - cy;
    for (let k = -3; k <= 3; k++) {
      const y = cy + tipY * k / 4.4, w = 1 - Math.abs(k) / 4.4;
      this.dots.add(cx, y, 30 * w + 6, mul([0.05, 0.12, 0.3], (0.5 + 0.5 * w) * g * (1 + 0.6 * this.swell)));
    }
    // the heart: a star of light, breathing slowly; the lighting swells it
    const hk = g * sw;
    this.dots.add(cx, cy, 80, mul([0.03, 0.075, 0.21], hk));
    if (this.swell > 0.005) this.dots.add(cx, cy, 230, mul([0.02, 0.05, 0.14], this.swell * dk));   // the lighting's bloom of light
    this.dots.add(cx, cy, 34, mul([0.3, 0.52, 1.1], hk));
    this.dots.add(cx, cy, 13, mul([1.3, 1.5, 1.9], hk));
    star(b, cx, cy, 40 * (0.9 + 0.1 * hk), mul([0.75, 0.95, 1.45], 0.95 * hk), 4, 0, THIN);
    star(b, cx, cy, 24 * (0.9 + 0.1 * hk), mul([0.5, 0.72, 1.25], 0.75 * hk), 4, Math.PI / 4, THIN);
    // gathering: light closes in on the heart and the lens rim runs rose (never aimed anywhere; the shard is born here).
    // It rises with the charge (0.6 s) and eases out after the shard leaves: a swell, never a blink.
    if (q > 0.01) {
      const deep = [0.72, 0.06, 0.09];                                  // a deep rose: its line core stays pink, not white
      this.sRed.loop(this.vp.lens, mul(deep, 1.1 * q), EDGE);
      const r = 16 + 110 * (1 - q) * (1 - q);
      this.sRed.loop(ellipse(cx, cy, r, r * fc.sy, 64).slice(0, 64), mul(deep, 0.95 * q), THIN);
      this.dots.add(cx, cy, 16 + 22 * q, mul([1.0, 0.2, 0.16], 0.8 * q));
      this.dots.add(cx, cy, 44 + 24 * q, mul([0.3, 0.06, 0.05], 0.6 * q));
    }
    b.commit();
  }

  // ---------------- the rings ----------------
  _rings(sim, dt, t) {
    const b = this.sRings; b.clear();
    const a = 1 - Math.exp(-dt / 0.18), g = (1 + 0.06 * this.litE + 0.12 * this.swell) * (1 - 0.35 * this.dark);
    RINGS.forEach((ring, i) => {
      const rs = sim.rings[i], sh = this.shape[i], [cx, cy] = CENTRE, sy = ring.sy;
      rs.segs.forEach((s, j) => {
        const want = s.alive ? 0.55 + 0.45 * s.hp / s.hpMax : 0;
        this.segV[i][j] += (want - this.segV[i][j]) * a;
        let v = this.segV[i][j], style = EDGE;
        if (!s.alive) {
          if (s.form <= 0.001) return;
          v = 0.75 * smooth(0, 1, s.form); style = FORMING;                   // reforming: fades in, dotted
        } else if (s.hp < s.hpMax && s.hp <= Math.ceil(s.hpMax / 2)) style = CRACK;   // nearly broken: its outline cracks
        if (v < 0.01) return;
        const ac = segAngle(i, j, rs.rot), col = mul(C.ring, v * g), ca = Math.cos(ac), sa = Math.sin(ac), pts = this._pts[i];
        for (let k = 0; k < sh.length; k++) { const q = sh[k], p = pts[k]; p[0] = cx + ca * q[2] - sa * q[3]; p[1] = cy + (sa * q[2] + ca * q[3]) * sy; }
        b.loop(pts, col, style);
      });
    });
    b.commit();
  }

  // ---------------- the shots ----------------
  _shots(sim) {
    for (const s of sim.shots) {
      const v = Math.hypot(s.vx, s.vy), ux = s.vx / v, uy = s.vy / v, L = 20, W = 4.2;
      const k = smooth(0, 0.03, s.t) * (1 - smooth(TUNE.shot.life - 0.12, TUNE.shot.life, s.t));
      const c = mul(C.shot, 1.3 * k);
      // a bright lozenge, as the concept paints them
      this.sShip.loop([[s.x + ux * L, s.y + uy * L], [s.x - uy * W, s.y + ux * W], [s.x - ux * L * 0.8, s.y - uy * L * 0.8], [s.x + uy * W, s.y - ux * W]], c, THIN);
      this.crispDots.add(s.x, s.y, 9, mul([0.8, 0.95, 1.5], k));
      // its dotted wake back toward the ship (not across a wrap)
      const back = Math.min(120, v * s.t * 0.9, s.wrapped != null ? v * (sim.time - s.wrapped) : 1e9);
      if (back > 8) this.sFx.line([[s.x - ux * L, s.y - uy * L], [s.x - ux * back, s.y - uy * back]], mul(C.shot, 0.7 * k), FINE, [0, 0, 0]);
    }
  }

  // ---------------- the shards ----------------
  _shards(sim, t) {
    const live = new Set();
    for (const d of sim.shards) {
      live.add(d.id);
      let tr = this.trails.get(d.id);
      if (!tr) { tr = new MotionTrail(22, 7); this.trails.set(d.id, tr); }
      const born = smooth(0, 0.3, d.t), dying = d.dying >= 0 ? clamp01((sim.time - d.dying) / TUNE.shard.fade) : 0;
      const k = born * (1 - smooth(0, 1, dying));
      if (k < 0.01) continue;
      if (d.dying < 0) tr.push(d.x, d.y);
      const ca = Math.cos(d.a), sa = Math.sin(d.a), L = 11, W = 4;
      const c = mul(C.red, 1.05 * k);
      this.sShard.loop([[d.x + ca * L, d.y + sa * L], [d.x - sa * W, d.y + ca * W], [d.x - ca * L * 0.7, d.y - sa * L * 0.7], [d.x + sa * W, d.y - ca * W]], c, THIN);
      this.sShard.seg(d.x + ca * L, d.y + sa * L, d.x - ca * L * 0.7, d.y - sa * L * 0.7, mul(c, 0.7), mul(c, 0.7), THIN);
      this.crispDots.add(d.x, d.y, 9, mul([0.9, 0.08, 0.04], 0.7 * k));
      if (tr.points.length > 1) this.sRed.line(tr.points, mul(C.red, 0.55 * k), { dash: 2.4, gap: 5, width: 0.8 }, [0, 0, 0]);
    }
    for (const id of this.trails.keys()) if (!live.has(id)) this.trails.delete(id);
  }

  // ---------------- the ship ----------------
  _ship(sim, dt, t) {
    const s = sim.ship;
    this.shipV += ((s.alive ? 1 : 0) - this.shipV) * (1 - Math.exp(-dt / (s.alive ? 0.12 : 0.03)));
    if (!s.alive || this.shipV < 0.01) return;
    // invulnerable after it comes in: a steady dimmer ship inside a thin ring that fades (never a blink)
    const inv = s.invuln > 0 && sim.phase === 'play' ? smooth(0, 0.5, s.invuln) : 0;
    const k = this.shipV * (1 - 0.35 * inv);
    const p = shipPts(s.x, s.y, s.a, SHIP_K), c = mul(C.ship, 1.15 * k);
    this.sShip.loop(p.outer, c, EDGE);
    for (const l of p.inner) this.sShip.line(l, mul(c, 0.7), THIN);
    this.crispDots.add(s.x, s.y, 12, mul([0.08, 0.18, 0.45], k));
    if (inv > 0.01) this.sShip.loop(ellipse(s.x, s.y, 40, 40, 48).slice(0, 48), mul(C.ship, 0.35 * inv), THIN);
    // thrust: a small steady blue flame behind the tail (eased, no flicker)
    this.flame += (s.thrust - this.flame) * (1 - Math.exp(-dt / 0.07));
    if (this.flame > 0.02) {
      const ca = Math.cos(s.a), sa = Math.sin(s.a), tx = s.x - ca * 10 * SHIP_K, ty = s.y - sa * 10 * SHIP_K, L = 20 * this.flame;
      const fc = mul([0.4, 0.62, 1.3], this.flame * k);
      this.sShip.line([[tx - sa * 5, ty + ca * 5], [tx - ca * L, ty - sa * L], [tx + sa * 5, ty - ca * 5]], fc, THIN);
      this.crispDots.add(tx - ca * L * 0.4, ty - sa * L * 0.4, 6, mul([0.3, 0.5, 1.2], this.flame * k));
    }
  }

  // ---------------- sparks, fragments, waves ----------------
  _effects(sim, dt, t) {
    // the light budget: sparks together never add up to more than ~2.5 fresh bursts, and the cap itself eases
    this.sparks = this.sparks.filter((p) => t - p.t0 < p.dur);
    let E = 0; for (const p of this.sparks) if (p.heart) E += 1 - clamp01((t - p.t0) / p.dur);
    const want = Math.min(1, 2.5 / Math.max(E, 1e-3));
    this.gFx += (want - this.gFx) * (1 - Math.exp(-dt / (want < this.gFx ? 0.06 : 0.3)));
    for (const p of this.sparks) {
      const age = t - p.t0, u = age / p.dur, fade = (1 - smooth(0, 1, u)) * smooth(0, 0.04, age) * this.gFx * p.k;
      if (p.heart) {                                                    // the struck point: a small hot star that fades
        this.sparkDots.add(p.x, p.y, 10 * (1 - 0.5 * u), mul([1.2, 0.45, 0.4], 0.8 * fade));
        star(this.sRed, p.x, p.y, 14 * (1 - 0.4 * u), mul([1.3, 0.35, 0.3], 0.8 * fade), 4, p.x * 0.1, THIN);
        continue;
      }
      const d = age * (1 - 0.45 * u), x = p.x + p.vx * d, y = p.y + p.vy * d + 30 * age * age;   // decelerating
      if (p.ember) { const L = 3.5, ca = Math.cos(p.ang + age * 2), sa = Math.sin(p.ang + age * 2); this.sRed.seg(x - ca * L, y - sa * L, x + ca * L, y + sa * L, mul(C.red, 1.2 * fade), mul(C.red, 1.2 * fade), THIN); }
      else if (p.dot) this.sparkDots.add(x, y, 2.8, mul([1.3, 0.1, 0.05], 1.0 * fade));
      else {                                                            // a ray back toward the struck point (a fan)
        const tail = 0.22 + 0.3 * u;
        this.sRed.seg(p.x + p.vx * d * tail, p.y + p.vy * d * tail, x, y, mul(C.red, 0.35 * fade), mul(C.red, 1.6 * fade), THIN);
      }
    }
    this.fx = this.fx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.fx) {
      const age = t - e.t0, u = age / e.dur, fade = 1 - smooth(0, 1, u);
      if (age < 0) continue;
      if (e.k === 'frag') {
        const ring = RINGS[e.ring], dr = e.vr * age, da = e.va * age, [cx, cy] = CENTRE;
        const pts = e.pts.map(([a, r]) => [cx + Math.cos(a + da) * (r + dr), cy + Math.sin(a + da) * (r + dr) * ring.sy]);
        this.sFx.line(pts, mul(C.frag, 1.25 * fade * fade), THIN);
      } else if (e.k === 'shipFrag') {
        const x = e.x + e.vx * age, y = e.y + e.vy * age, r = e.vr * age, ca = Math.cos(r), sa = Math.sin(r);
        const P = (q) => { const dx = q[0] - e.x, dy = q[1] - e.y; return [x + dx * ca - dy * sa, y + dx * sa + dy * ca]; };
        this.sFx.line([P(e.a), P(e.b)], mul(C.ship, 1.0 * fade), EDGE);
      } else if (e.k === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * Math.sqrt(u);
        this.sFx.loop(ellipse(e.x, e.y, r, r, 40).slice(0, 40), mul(e.c, 0.6 * fade * smooth(0, 0.1, age)), THIN);
      } else if (e.k === 'wave') {
        // a thin ring of light runs out from the core to the guide circle this lighting reached
        const to = RINGS[Math.min(e.n, 3) - 1], r = FIG.small + (to.R - FIG.small) * smooth(0, 1, u);
        this.sFx.loop(ellipseArc(r, to.sy, 0, Math.PI * 2, 0.025).slice(0, -1), mul(C.white, 0.5 * fade * smooth(0, 0.15, age)), FINE);
      } else if (e.k === 'text') drawText(this.sFx, e.text, e.x, e.y, { h: 13, color: mul(e.c, 0.85 * fade * smooth(0, 0.12, age)), track: 1 });
    }
  }

  // ---------------- score, ships, lights, banners, cards ----------------
  _ui(sim, t, ui) {
    const s = this.sUI; s.clear();
    const o = this.band; o.clear();
    drawDigits(s, String(sim.score), 112, 62, { h: 27, w: 17, pitch: 24, slant: 0.14, gap: 1.8, hollow: false, color: mul(C.score, 1.15),
      style: { dash: 1, gap: 0, width: 0.9 } });
    // ships left: small kites under the score
    const ships = Math.max(0, sim.ships);
    for (let k = 0; k < ships; k++) { const p = shipPts(122 + k * 26, 120, -Math.PI / 2, 0.62); s.loop(p.outer, mul(C.ship, 0.95)); s.line(p.inner[0], mul(C.ship, 0.6)); }
    // the three lights, top right: a tiny vesica piscis in a circle; lit = bright with a heart
    for (let k = 0; k < TUNE.lights; k++) {
      const x = 1092 + k * 36, y = 76, on = k < sim.core.lit, c = mul(C.score, on ? 1.2 : 0.3);
      s.loop(ellipse(x, y, 11, 11, 28).slice(0, 28), c);
      s.loop(ellipse(x - 2.6, y, 5.2, 5.2, 16).slice(0, 16), mul(c, 0.85)); s.loop(ellipse(x + 2.6, y, 5.2, 5.2, 16).slice(0, 16), mul(c, 0.85));
      if (on) this.dots.add(x, y, 5, mul([0.8, 1.0, 1.5], 0.8));
    }
    const band = (y0, y1, a) => {           // a soft dark band behind card text (the Beacon stays visible above and below)
      if (a <= 0.001) return;
      for (const [d, k] of [[0, 0.35], [14, 0.65], [28, 1]]) o.poly([[0, y0 + d], [FRAME[0], y0 + d], [FRAME[0], y1 - d], [0, y1 - d]], [0, 0, 0, a * k * 0.45]);
    };
    const cx = FRAME[0] / 2;
    if (this.banner && t - this.banner.t0 < this.banner.dur && t >= this.banner.t0 && ui.mode !== 'attract') {
      const u = (t - this.banner.t0) / this.banner.dur, a = smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u));
      band(826, 926, a * 0.9);
      drawText(s, this.banner.text, cx, 846, { h: 24, color: mul(C.white, a), track: 1 });
      if (this.sub) drawText(s, this.sub.text, cx, 886, { h: 14, color: mul(C.text, 0.9 * a), track: 1 });
    }
    if (ui.mode === 'attract') {
      band(170, 740, 1.0);
      const breathe = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
      drawText(s, 'THE BEACON', cx, 220, { h: 60, color: mul(C.text, 1.3), track: 2 });
      drawText(s, 'LIGHT THE BEACON', cx, 318, { h: 20, color: mul(C.text, 0.9), track: 2 });
      drawText(s, this.inCabinet ? (this.cabinetStart ?? 'INSERT COIN') : 'PRESS START', cx, 420, { h: 24, color: mul(C.white, breathe), track: 2 });
      drawText(s, 'SHOOT THROUGH THE RINGS · HIT THE CORE', cx, 500, { h: 14, color: mul(C.text, 0.8), track: 1 });
      drawText(s, 'LEFT RIGHT  TURN     UP  THRUST     SPACE  FIRE', cx, 540, { h: 14, color: mul(C.text, 0.75), track: 1 });
      drawText(s, "DON'T TOUCH THE RINGS · SHOOT THE RED SHARDS", cx, 580, { h: 14, color: mul(C.text, 0.75), track: 1 });
      drawText(s, 'HI ' + ui.hi + (ui.last ? '   LAST ' + ui.last : ''), cx, 660, { h: 16, color: mul(C.score, 0.9), track: 2 });
    } else if (sim.phase === 'ready') {
      const a = smooth(0, 0.3, sim.phaseTime) * (1 - smooth(TUNE.ready - 0.45, TUNE.ready, sim.phaseTime));
      band(590, 780, a);
      drawText(s, 'SHOOT THROUGH THE RINGS', cx, 620, { h: 28, color: mul(C.white, a), track: 2 });
      drawText(s, 'LIGHT THE BEACON', cx, 680, { h: 20, color: mul(C.text, a), track: 2 });
      drawText(s, "HIT THE CORE 3 TIMES · DON'T TOUCH THE RINGS", cx, 726, { h: 14, color: mul(C.text, 0.85 * a), track: 1 });
    } else if (sim.phase === 'card') {
      const won = sim.result === 2, delay = won ? 2.3 : 0.6;
      const a = smooth(delay, delay + 0.7, sim.phaseTime);
      band(620, 820, a);
      drawText(s, won ? 'THE BEACON BURNS' : 'THE BEACON GOES DARK', cx, 648, { h: 40, color: mul(won ? C.white : C.text, a), track: 2 });
      drawText(s, won ? '3 OF 3 LIT · ' + sim.ships + ' SHIP' + (sim.ships === 1 ? '' : 'S') + ' LEFT' : sim.core.lit + ' OF 3 LIT · OUT OF SHIPS', cx, 718, { h: 16, color: mul(C.text, 0.9 * a), track: 1 });
      drawText(s, 'SCORE ' + sim.score, cx, 760, { h: 22, color: mul(C.score, a), track: 2 });
    }
    s.commit(); o.commit();
  }
}

/** A polyline drawn only up to fraction u of its length (the rest not yet drawn); returns the head. */
function partial(b, pts, u, col, style) {
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const len = u * L;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], q = pts[i], l = Math.hypot(q[0] - a[0], q[1] - a[1]);
    if (acc + l <= len) { b.seg(a[0], a[1], q[0], q[1], col, col, style, acc); acc += l; continue; }
    const f = (len - acc) / l;
    if (f > 0) b.seg(a[0], a[1], a[0] + (q[0] - a[0]) * f, a[1] + (q[1] - a[1]) * f, col, col, style, acc);
    return [a[0] + (q[0] - a[0]) * f, a[1] + (q[1] - a[1]) * f];
  }
  return pts[pts.length - 1];
}
