// THE NODE · HEARTH · THE PICTURE (three.js, the look kit). Reads the round, never changes it.
//
//   const view = new HearthView(kit); await view.ready;      kit = createLookKit(renderer, { ...HEARTH_LOOK })
//   view.update(sim, dt, t, ui)       ui = { mode: 'attract' | 'play', hi, last, reduced }
//
// The approved layered look (js/cabinet/looktest/hearth.js), driven by the game:
//   the plate, LIT BY THE FIRE: its light radius and the cave's brightness follow the fire (low fire = a dark cave)
//   the fire: crystals seated in the pit (the front stones are drawn again over their base), sized by the fire
//   the floor rings: the inner ring is the FIRE GAUGE (lit share = the fire, ticks at WAKE and BLAZE); the middle ring
//     fills white-gold as blaze is held; the rings keep turning
//   the player, the fuel (dimmer out in the dark), the shades with their trails, the ward ring, bites, feeds
//   the wall wakes: the traced bull / deer glow over the painted ones; their spirits charge the lanes
//   the score (7-segment, top left), the minute (top right), and the cards in a vector stroke font
// Safety: every light change is eased (no steps), nothing blinks; the ward ring is a thin line once per 0.8 s at most.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, ellipse, arc, polygon, star, EmberField, GlowDots, drawTrail, MotionTrail,
  drawDigits, Backdrop, FillBatch } from '../../lookkit/index.js';
import { TRACED } from '../../looktest/hearth_plate_traced.js';
import { FRAME, HEARTH, PIT, POSTS, inPoly } from './layout.js';
import { TUNE } from './spec.js';
import { drawText } from './font.js';

export const PLATE_URL = new URL('../../../../assets/looktest/hearth_plate.png', import.meta.url).href;

export const HEARTH_LOOK = {
  frame: FRAME,
  bloom: { strength: 0.42, radius: 0.5, threshold: 1.0, tint: [1.0, 0.42, 0.07] },
  phosphor: { tau: [0.042, 0.034, 0.027] },
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.12, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

const C = {
  gold: [1.15, 0.35, 0.017], ring: [1.05, 0.26, 0.006], fire: [1.3, 0.2, 0.006], red: [1.3, 0.1, 0.016],
  score: [1.35, 0.24, 0.012], player: [1.3, 0.42, 0.016], shard: [1.4, 0.62, 0.035], star: [1.5, 0.7, 0.03],
  text: [1.3, 0.36, 0.014], white: [1.5, 0.95, 0.12],
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; }
/** Aperiodic fire flicker: incommensurate slow sines + smooth noise, all below ~1.5 Hz, swing < 10%. */
export function fireFlicker(t) {
  return 1 + 0.028 * Math.sin(t * 2.31 + 0.4) + 0.022 * Math.sin(t * 4.97 + 1.9) + 0.016 * Math.sin(t * 8.3 + 4.1) + 0.03 * (vnoise1(t * 1.3) - 0.5);
}
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const FRONT_STONES = [[577, 514], [584, 519], [600, 526], [612, 530], [628, 530], [643, 528], [660, 523], [676, 517], [683, 511],
  [709, 519], [701, 535], [686, 544], [652, 553], [628, 556], [597, 551], [566, 542], [551, 532], [542, 518]];
const POST_SHAPES = [[[466, 370], [538, 366], [542, 548], [460, 548]], [[702, 354], [804, 356], [804, 540], [702, 544]]];
const CRYSTALS = [[616, 505, 12, 610, 466, 1, 0.7], [642, 505, 12, 648, 468, 1, 0.7], [606, 512, 18, 598, 450, 1, 0.9],
  [652, 512, 18, 660, 452, 1, 0.9], [629, 513, 34, 629, 410, 2, 1.0], [614, 521, 10, 609, 492, 1, 0.8], [642, 522, 10, 647, 494, 1, 0.8]];
const BULL_STARS = [[344, 229, 24, 1.0], [415, 136, 5, 0.9], [262, 231, 9, 0.5]];
const DEER_STARS = [[939, 248, 24, 1.0], [1018, 275, 12, 0.65], [1075, 290, 8, 0.5], [948, 128, 4, 0.8]];
const RING1 = { x: HEARTH[0], y: HEARTH[1] + 3, rx: 158, ry: 60 }, RING2 = { x: HEARTH[0] - 4, y: HEARTH[1] + 15, rx: 246, ry: 114 };

function hiddenByPost(q, cy) { return q[1] < cy && POST_SHAPES.some((p) => inPoly(q[0], q[1], p)); }

/** The traced animal: strokes at their painted brightness, the sacred circles as exact arcs, glints. */
function drawTraced(b, t, stars, ox = 0, oy = 0, s = 1) {
  const G = C.gold, P = ([x, y]) => [(x - ox) * s, (y - oy) * s];
  for (const line of t.lines) { const [bright, ...pts] = line; b.line(pts.map(P), mul(G, 0.55 + 0.45 * bright)); }
  for (const [cx, cy, a, bb, th, arcs] of t.ellipses) {
    const full = arcs.length === 1 && arcs[0][1] - arcs[0][0] > 6.2;
    for (const [t0, t1] of arcs) {
      const n = Math.max(6, Math.round((t1 - t0) * 30)), pts = [];
      for (let i = 0; i <= n; i++) {
        const u = t0 + (t1 - t0) * i / n, ca = Math.cos(u), sa = Math.sin(u);
        pts.push(P([cx + a * ca * Math.cos(th) - bb * sa * Math.sin(th), cy + a * ca * Math.sin(th) + bb * sa * Math.cos(th)]));
      }
      b.line(pts, mul(G, full ? 1.0 : 0.8), full ? { dash: 34 * s, gap: 3 * s } : { dash: 18 * s, gap: 4 * s });
    }
  }
  for (const [x, y, len, k] of stars) { const [px, py] = P([x, y]); star(b, px, py, len * s, mul(C.star, k), 4, 0.1); }
}

function arrowPts(x, y, a, s = 1) {
  const c = Math.cos(a), sn = Math.sin(a), P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
  return { out: [P(28, 0), P(-18, -15), P(-8, 0), P(-18, 15)], fold: [P(28, 0), P(-8, 0)] };
}
function shadePts(x, y, a, s) {
  const c = Math.cos(a), sn = Math.sin(a), P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
  return { tri: [P(1, 0), P(-0.75, -0.8), P(-0.75, 0.8)], o: P(-0.18, 0), inner: [P(0.25, 0), P(-0.45, -0.3), P(-0.45, 0.3)], lw: P(-0.75, -0.8), rw: P(-0.75, 0.8) };
}
function diamond(b, x, y, s, c) {
  const top = [x, y - 28 * s], r = [x + 13 * s, y - 6 * s], bot = [x, y + 23 * s], l = [x - 13 * s, y - 6 * s], m = [x, y - 6 * s];
  b.loop([top, r, bot, l], c); b.line([l, m, r], mul(c, 0.7)); b.line([top, m, bot], mul(c, 0.7));
}
function drop(b, x, y, s, col) {
  b.line([[x, y - s * 1.6], [x + s * 0.8, y], ...arc(x, y, s * 0.8, s * 0.8, 0, Math.PI, 8).slice(1), [x, y - s * 1.6]], col);
}

export class HearthView {
  constructor(kit) {
    this.kit = kit;
    const { scene } = kit;

    // ---- layer 1: the plate, lit by the fire ----
    const plate = new THREE.Texture();
    plate.colorSpace = THREE.NoColorSpace; plate.minFilter = THREE.LinearMipmapLinearFilter; plate.magFilter = THREE.LinearFilter;
    this.ready = new Promise((resolve, reject) => {
      new THREE.ImageLoader().load(PLATE_URL, (img) => { plate.image = img; plate.needsUpdate = true; resolve(); }, undefined, reject);
    });
    this.backdrop = new Backdrop({
      frame: FRAME, map: plate,
      uniforms: { fireC: { value: new THREE.Vector2(...HEARTH) }, fireGain: { value: 1 }, caveGain: { value: 1 },
        poolS: { value: 130 }, reachS: { value: 220 } },
      shade: /* glsl */`
        vec3 x = -log(max(vec3(1.0) - tex.rgb, vec3(0.03)));      // the painting -> light (the tone map gives it back)
        vec2 d = (f - fireC) * vec2(1.0, 1.9);
        float r = length(d);
        float pool = exp(-r * r / (2.0 * poolS * poolS));
        float reach = exp(-r / reachS);
        float light = caveGain * (1.3 + 0.75 * reach) + fireGain * 1.5 * pool;
        vec3 col = x * light;
        vec2 v1 = (f - vec2(300.0, 812.0)) / vec2(62.0, 52.0), v2 = (f - vec2(902.0, 808.0)) / vec2(70.0, 50.0);
        col *= 1.0 - 0.6 * (1.0 - smoothstep(0.35, 1.0, length(v1))) - 0.6 * (1.0 - smoothstep(0.35, 1.0, length(v2)));
        col += fireGain * vec3(1.0, 0.36, 0.04) * 0.1 * exp(-r * r / (2.0 * 70.0 * 70.0));
        return col;`,
    });
    scene.add(this.backdrop.object);
    {   // the front stones again, over the fire's base
      const tri = THREE.ShapeUtils.triangulateShape(FRONT_STONES.map(([x, y]) => new THREE.Vector2(x, y)), []);
      const pos = [], uv = [];
      for (const t of tri) for (const i of t) { const [x, y] = FRONT_STONES[i]; pos.push(x, -y, 0); uv.push(x / FRAME[0], 1 - y / FRAME[1]); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      const mat = this.backdrop.material.clone(); mat.uniforms = this.backdrop.material.uniforms; mat.transparent = true;
      const front = new THREE.Mesh(g, mat); front.renderOrder = 4.5; front.frustumCulled = false; scene.add(front);
    }

    // ---- live layers ----
    const T = (o) => kit.track(new GlowLineMaterial(o));
    this.matRings = T({ width: 7.5 }); this.matBull = T({ width: 8.5 }); this.matDeer = T({ width: 8.5 });
    this.matBullRun = T({ width: 8 }); this.matDeerRun = T({ width: 8 }); this.matFire = T({ width: 8.5, coreGain: 3.0 });
    this.matDyn = T({ width: 9 }); this.matUI = T({ width: 9 });
    this.sRings = new LineBatch(this.matRings, 400);
    this.sRings.line(arc(HEARTH[0] - 6, HEARTH[1] + 20, 345, 170, 0.05, 1.25, 60), mul(C.ring, 0.55), { dash: 16, gap: 12, speed: 4 });
    this.sRings.line(arc(HEARTH[0] - 6, HEARTH[1] + 20, 345, 170, 1.9, 3.05, 60), mul(C.ring, 0.55), { dash: 16, gap: 12, speed: 4 });
    this.sRings.commit();
    this.sBull = new LineBatch(this.matBull, 1400); drawTraced(this.sBull, TRACED.bull, BULL_STARS); this.sBull.commit();
    this.sDeer = new LineBatch(this.matDeer, 1400); drawTraced(this.sDeer, TRACED.deer, DEER_STARS); this.sDeer.commit();
    // the spirits that leave the wall: the same strokes, small, drawn about their hooves (they run the lane on them)
    this.sBullRun = new LineBatch(this.matBullRun, 1400); drawTraced(this.sBullRun, TRACED.bull, BULL_STARS, 300, 385, 0.4); this.sBullRun.commit();
    this.sDeerRun = new LineBatch(this.matDeerRun, 1400); drawTraced(this.sDeerRun, TRACED.deer, DEER_STARS, 1030, 420, 0.42); this.sDeerRun.commit();
    this.sFire = new LineBatch(this.matFire, 800);
    this.sDyn = new LineBatch(this.matDyn, 4000);
    this.sUI = new LineBatch(this.matUI, 2500);
    this.dots = kit.track(new GlowDots(160));
    this.embers = kit.track(new EmberField({ count: 170, origin: [PIT[0], PIT[1] - 10], spread: [30, 6], rise: 250, life: [1.6, 3.6],
      size: [1.6, 3.8], young: [1.6, 0.6, 0.12], old: [0.9, 0.12, 0.01], drift: 14, seed: 5 }));
    this.overlay = new FillBatch(12); this.overlay.object.renderOrder = 30;
    const ro = [[this.sRings, 1], [this.sBull, 3], [this.sDeer, 3], [this.sFire, 4], [this.sBullRun, 11], [this.sDeerRun, 11], [this.sDyn, 12], [this.sUI, 40]];
    for (const [b, o] of ro) { b.object.renderOrder = o; scene.add(b.object); }
    scene.add(this.dots.object, this.embers.object, this.overlay.object);

    this.vf = 0.55; this.ptrail = new MotionTrail(30, 7); this.trails = new Map(); this.fx = []; this.spirit = { bull: 0, deer: 0 };
    this.lastFace = new Map(); this.banner = null;
  }

  /** One frame. sim = the round being shown (the attract demo or the real one). */
  update(sim, dt, t, ui = {}) {
    const k = this.kit, pl = sim.player;
    if (sim !== this._sim) {            // a different round on the glass: forget the last one's trails and effects
      this._sim = sim; this.trails.clear(); this.lastFace.clear(); this.fx = []; this.ptrail.reset(); this.banner = null;
      this.vf = sim.fire; this.spirit = { bull: 0, deer: 0 };
    }
    this.matRings.time = t; this.matDyn.time = t;
    const flick = fireFlicker(t);
    // the fire the eye sees eases toward the fire the game has: no light steps
    // (eased, and never faster than 0.22 of the fire a second: a big fuel drop swells the light, it doesn't flash it)
    const dv = (sim.fire - this.vf) * (1 - Math.exp(-2.5 * dt)), cap = 0.22 * dt;
    this.vf += Math.max(-cap, Math.min(cap, dv));
    const vf = Math.max(0, this.vf), lit = Math.sqrt(vf);
    const u = this.backdrop.uniforms;
    u.caveGain.value = (0.04 + 1.13 * Math.pow(vf, 1.2)) * (1 + 0.3 * (flick - 1));      // low fire: a dark cave
    u.fireGain.value = (0.15 + 1.0 * vf) * flick;
    u.poolS.value = 50 + 110 * vf; u.reachS.value = 90 + 170 * vf;
    this.matRings.gain = 0.35 + 0.65 * vf;
    this.embers.update(t); this.embers.gain = Math.min(1.2, vf * 1.4) * flick;
    this.embers.mat.uniforms.rise.value = 100 + 180 * vf;

    // events -> effects
    for (const e of sim.events) {
      if (e.kind === 'ward') this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 0.4, r0: 18, r1: TUNE.ward.radius, c: C.player });
      else if (e.kind === 'feed') {
        this.fx.push({ k: 'ring', x: HEARTH[0], y: HEARTH[1] - 4, t0: t, dur: 0.7, r0: 95, r1: 150, c: C.gold });
        if (e.n > 1) this.fx.push({ k: 'text', text: 'x' + e.mult.toFixed(1), x: e.x, y: e.y - 60, t0: t, dur: 1.4, c: C.white });
      } else if (e.kind === 'bite') this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 0.5, r0: 14, r1: 50, c: mul(C.red, 0.8) });
      else if (e.kind === 'knocked') this.fx.push({ k: 'burst', x: e.x, y: e.y, t0: t, dur: 0.5, c: C.player });
      else if (e.kind === 'gore') this.fx.push({ k: 'burst', x: e.x, y: e.y, t0: t, dur: 0.6, c: C.gold });
      else if (e.kind === 'wake') this.banner = { text: e.who === 'bull' ? 'THE BULL WAKES' : 'THE DEER WAKES', t0: t, dur: 2.2 };
      else if (e.kind === 'overtime') this.banner = { text: 'THE FIRE MUST BLAZE', t0: t, dur: 3.0 };
      else if (e.kind === 'blaze') this.banner = { text: e.first ? 'BLAZE!  HOLD IT' : 'BLAZE', t0: t, dur: e.first ? 2.6 : 1.4 };
    }

    // ---- the fire: crystals sized by the fire ----
    const fk = (0.35 + 0.85 * vf) * flick, h = 0.25 + 0.75 * lit;
    this.matFire.gain = vf > 0.01 ? fk : 0;
    this._buildFire(t, h);

    // ---- the wall wakes, the spirits run ----
    const breath = (w, ph) => w * (0.78 + 0.03 * Math.sin(t * 1.5 + ph));
    this.matBull.gain = breath(sim.bull.glow, 0); this.matDeer.gain = breath(sim.deer.glow, 1);
    this.sBull.object.visible = sim.bull.glow > 0.002; this.sDeer.object.visible = sim.deer.glow > 0.002;
    for (const [name, an, mat, batch] of [['bull', sim.bull, this.matBullRun, this.sBullRun], ['deer', sim.deer, this.matDeerRun, this.sDeerRun]]) {
      const target = an.st === 'charge' ? 1 : 0;
      this.spirit[name] += (target - this.spirit[name]) * (1 - Math.exp(-8 * dt));
      mat.gain = this.spirit[name];
      batch.object.visible = this.spirit[name] > 0.01;
      const bob = name === 'deer' ? -Math.abs(Math.sin(t * 7)) * 10 : Math.sin(t * 9) * 2;
      batch.object.position.set(an.x, -(an.y + bob), 0);
      batch.object.scale.set(an.dir, 1, 1);
    }

    // ---- dynamic: rings (gauge), fuel, shades, player, effects ----
    const b = this.sDyn; b.clear(); this.dots.clear();
    this._rings(b, sim, vf);
    this.dots.add(PIT[0], PIT[1] - 16, 32, mul([0.55, 0.14, 0.01], fk));
    this.dots.add(PIT[0], PIT[1] - 40, 120, mul([0.1, 0.025, 0.002], fk));
    this.dots.add(PIT[0], PIT[1] - 2, 11, mul([1.2, 0.45, 0.07], fk));
    for (let i = 0; i < 6; i++) {        // drops over the fire
      const per = 4.4 + i * 0.37, off = i * 0.17, q = (((t / per) + off) % 1 + 1) % 1;
      const a = smooth(0, 0.15, q) * (1 - smooth(0.6, 1, q)) * Math.min(1, vf * 1.5);
      if (a > 0.02) drop(b, 590 + i * 14 + Math.sin(t * 0.9 + i * 3) * 6, PIT[1] - 62 - q * (80 + 110 * vf), 3.2, mul(C.fire, 0.75 * a));
    }
    // fuel: dim out in the dark, bright near the fire
    for (const s of sim.shards) {
      const r = Math.hypot(s.x - HEARTH[0], (s.y - HEARTH[1]) * 1.9);
      const light = Math.min(1, (0.04 + 1.13 * Math.pow(vf, 1.2)) * (0.6 + 0.4 * Math.exp(-r / (90 + 170 * vf))) + 0.5 * vf * Math.exp(-r * r / (2 * (50 + 110 * vf) ** 2)));
      const vis = (0.4 + 0.6 * light) * (s.lock > sim.time ? 0.5 : 1) * Math.min(1, (sim.time - s.born) * 2 + 0.2);
      const size = 0.5 + 0.35 * clamp01((s.value - TUNE.fuel.value[0]) / (TUNE.fuel.value[1] - TUNE.fuel.value[0]));
      const bob = Math.sin(t * 2.1 + s.id) * 2.5;
      diamond(b, s.x, s.y - 8 + bob, size, mul(C.shard, vis));
      this.dots.add(s.x, s.y - 10 + bob, 14, mul([0.35, 0.11, 0.015], vis));
    }
    this._shades(b, sim, dt, t);
    this._player(b, sim, dt, t);
    this._effects(b, t);
    b.commit(); this.dots.commit();
    this._ui(sim, t, ui);
  }

  _buildFire(t, h) {
    const f = this.sFire; f.clear();
    if (this.matFire.gain <= 0) { f.commit(); return; }
    const r = mulberry(404), HOT = C.fire;
    const add = (a, b2, k) => { const s = k * (1 + 0.1 * Math.sin(t * (1.3 + r() * 5) + r() * 6.28)); f.seg(a[0], a[1], b2[0], b2[1], mul(HOT, s), mul(HOT, s)); };
    const sub = (a, b2, c, level, k) => {
      if (level <= 0) return;
      const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ab = m(a, b2), bc = m(b2, c), ca = m(c, a);
      add(ab, bc, k); add(bc, ca, k); add(ca, ab, k);
      sub(a, ab, ca, level - 1, k * 0.85); sub(ab, b2, bc, level - 1, k * 0.85); sub(ca, bc, c, level - 1, k * 0.85); sub(ab, bc, ca, level - 1, k * 0.85);
    };
    for (const [bx, by, br0, ax0, ay0, lv, k] of CRYSTALS) {
      const br = br0 * (0.6 + 0.4 * h), ax = bx + (ax0 - bx) * h, ay = by + (ay0 - by) * h;
      const base = [[bx + br, by], [bx, by + br * 0.42], [bx - br, by], [bx, by - br * 0.42]], apex = [ax, ay];
      add(base[0], base[1], k); add(base[1], base[2], k); add(apex, base[0], k); add(apex, base[1], k * 1.15); add(apex, base[2], k); add(apex, base[3], k * 0.3);
      sub(apex, base[0], base[1], lv, k * 0.62); sub(apex, base[1], base[2], lv, k * 0.62);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, cx = PIT[0], cy = PIT[1] + 5;
      f.seg(cx, cy, cx + Math.cos(a) * 20 * h, cy + Math.sin(a) * 9 * h, [1.4, 0.6, 0.02], [0, 0, 0]);
    }
    f.commit();
  }

  /** Inner ring = the fire gauge (lit share, ticks at WAKE and BLAZE); middle ring fills as blaze is held. */
  _rings(b, sim, vf) {
    const gauge = (R, frac, lit, dim, style, n) => {
      const pts = ellipse(R.x, R.y, R.rx, R.ry, n);
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[i + 1];
        if (hiddenByPost(p, R.y) || hiddenByPost(q, R.y)) continue;
        const a = (i + 0.5) / n * Math.PI * 2, share = (((a - Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
        const c = share < frac ? lit : dim;
        b.seg(p[0], p[1], q[0], q[1], c, c, style, i * (Math.hypot(q[0] - p[0], q[1] - p[1])));
      }
    };
    gauge(RING1, vf, mul(C.ring, 1.1), mul(C.ring, 0.22), { dash: 5, gap: 9, speed: 9 }, 160);
    for (const th of [TUNE.wakeBull, TUNE.blaze]) {              // the two marks the fire must reach
      const a = Math.PI / 2 + th * Math.PI * 2, x = RING1.x + Math.cos(a) * RING1.rx, y = RING1.y + Math.sin(a) * RING1.ry;
      if (hiddenByPost([x, y], RING1.y)) continue;
      const nx = Math.cos(a), ny = Math.sin(a) * 0.4, m = Math.hypot(nx, ny);
      b.seg(x - nx / m * 6, y - ny / m * 6, x + nx / m * 9, y + ny / m * 9, mul(C.gold, vf >= th ? 1.3 : 0.6));
    }
    const hold = clamp01(sim.blazeTime / TUNE.blazeHold);
    const lift = vf >= TUNE.blaze ? 1.25 + 0.35 * hold : 0.9;     // the hold ring burns brighter while you're holding blaze
    gauge(RING2, hold, mul(C.white, lift), mul(C.ring, 0.8), { dash: 12, gap: 10, speed: -6 }, 200);
  }

  _shades(b, sim, dt, t) {
    const live = new Set();
    for (const s of sim.shades) {
      live.add(s.id);
      let tr = this.trails.get(s.id); if (!tr) { tr = new MotionTrail(14, 6); this.trails.set(s.id, tr); }
      tr.push(s.x, s.y);
      const sp = Math.hypot(s.vx, s.vy);
      let face = sp > 8 ? Math.atan2(s.vy, s.vx) : (this.lastFace.get(s.id) ?? Math.PI / 2);
      if (s.st === 'stun') face += t * 3;
      this.lastFace.set(s.id, face);
      const alpha = s.alpha * (s.st === 'stun' ? 0.6 : 1);
      if (alpha < 0.01) continue;
      const col = mul(C.red, alpha), P = shadePts(s.x, s.y, face, 25);
      const pts = tr.points;
      for (const w of [-1, 1]) {
        const side = pts.map((p, i) => {
          const q = pts[Math.min(pts.length - 1, i + 1)], a = Math.atan2(p[1] - q[1], p[0] - q[0]) || face;
          return [p[0] - Math.sin(a) * w * 12, p[1] + Math.cos(a) * w * 12];
        });
        if (side.length > 2) drawTrail(b, side.slice(1), mul(C.red, 0.7 * alpha), { dash: 3, gap: 6 });
      }
      b.loop(P.tri, col);
      b.line([P.tri[0], P.o], mul(col, 0.75)); b.line([P.lw, P.o], mul(col, 0.75)); b.line([P.rw, P.o], mul(col, 0.75));
      b.loop(P.inner, mul(col, 0.8));
      this.dots.add(s.x, s.y, 22, mul([0.07, 0.003, 0.001], alpha));
    }
    for (const id of this.trails.keys()) if (!live.has(id)) { this.trails.delete(id); this.lastFace.delete(id); }
  }

  _player(b, sim, dt, t) {
    const pl = sim.player, sp = Math.hypot(pl.vx, pl.vy);
    if (sp > 15) this.ptrail.push(pl.x, pl.y); else if (this.ptrail.points.length) this.ptrail.points.pop();
    const stun = pl.stun > 0, k = stun ? 0.45 : 1;
    if (this.ptrail.points.length > 2) drawTrail(b, this.ptrail.points, mul(C.player, 1.0 * k), { dash: 10, gap: 7 });
    const a = pl.face + (stun ? Math.sin(t * 9) * 0.25 : 0);
    const ar = arrowPts(pl.x, pl.y, a, 1.1);
    b.loop(ar.out, mul(C.player, k)); b.line(ar.fold, mul(C.player, 0.6 * k));
    if (sp > 120 && !stun) for (const side of [-1, 1]) {
      const bx = pl.x - Math.cos(a) * 22, by = pl.y - Math.sin(a) * 22, nx = -Math.sin(a) * side * 9, ny = Math.cos(a) * side * 9;
      b.line([[bx - Math.cos(a) * 8 + nx, by - Math.sin(a) * 8 + ny], [bx - Math.cos(a) * 26 + nx, by - Math.sin(a) * 26 + ny]], mul(C.player, 0.5), undefined, [0, 0, 0]);
    }
    if (stun) for (let i = 0; i < 3; i++) { const q = t * 4 + i * 2.094; star(b, pl.x + Math.cos(q) * 22, pl.y - 26 + Math.sin(q) * 7, 4, mul(C.player, 0.8), 2, q); }
    // the fuel you carry rides behind you
    pl.carry.forEach((c, i) => {
      const d = 26 + i * 13, sx = pl.x - Math.cos(a) * d, sy = pl.y - Math.sin(a) * d - 10 + Math.sin(t * 5 + i) * 2;
      diamond(b, sx, sy, 0.45, mul(C.shard, 0.95));
    });
    this.dots.add(pl.x, pl.y, 22, mul([0.22, 0.06, 0.008], k));
  }

  _effects(b, t) {
    this.fx = this.fx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.fx) {
      const u = (t - e.t0) / e.dur, fade = 1 - u;
      if (e.k === 'ring') { const r = e.r0 + (e.r1 - e.r0) * Math.sqrt(u); b.loop(ellipse(e.x, e.y, r, r * 0.55, 48).slice(0, 48), mul(e.c, fade)); }
      else if (e.k === 'burst') for (let i = 0; i < 6; i++) {
        const a = i * 1.047 + 0.3, r0 = 8 + 30 * u, r1 = r0 + 10;
        b.seg(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * 0.6, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1 * 0.6, mul(e.c, fade), [0, 0, 0]);
      } else if (e.k === 'text') drawText(b, e.text, e.x, e.y - u * 30, { h: 18, color: mul(e.c, fade) });
    }
  }

  _ui(sim, t, ui) {
    const s = this.sUI; s.clear();
    drawDigits(s, String(sim.score), 102, 60, { h: 29, w: 20, pitch: 27, slant: 0.12, gap: 1.6, hollow: false, color: mul(C.score, 1.45),
      style: { dash: 1, gap: 0, width: 1.6 } });
    const left = sim.overtime ? '--' : String(Math.max(0, Math.ceil(TUNE.levelSeconds - sim.levelTime))).padStart(2, '0');
    drawDigits(s, left, 1098, 60, { h: 24, w: 16, pitch: 22, slant: 0.12, gap: 1.4, hollow: false, color: mul(C.score, 0.9),
      style: { dash: 1, gap: 0, width: 1.4 } });
    let dark = 0;
    if (this.banner && t - this.banner.t0 < this.banner.dur) {
      const u = (t - this.banner.t0) / this.banner.dur, a = smooth(0, 0.12, u) * (1 - smooth(0.75, 1, u));
      drawText(s, this.banner.text, 633, 250, { h: 22, color: mul(C.white, a), track: 1 });
    }
    if (ui.mode === 'attract') {
      dark = 0.55;
      const breathe = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
      drawText(s, 'HEARTH', 633, 250, { h: 72, color: mul(C.text, 1.3), track: 2 });
      drawText(s, 'KEEP THE FIRE', 633, 360, { h: 20, color: mul(C.text, 0.9), track: 2 });
      drawText(s, this.inCabinet ? (this.cabinetStart ?? 'INSERT COIN') : 'PRESS START', 633, 470, { h: 24, color: mul(C.white, breathe), track: 2 });
      drawText(s, 'ARROWS OR WASD  MOVE', 633, 560, { h: 14, color: mul(C.text, 0.7), track: 1 });
      drawText(s, 'SPACE  WARD  (IT COSTS FIRE)', 633, 590, { h: 14, color: mul(C.text, 0.7), track: 1 });
      drawText(s, 'FEED THE FIRE TO BLAZE · HOLD IT TO WIN', 633, 620, { h: 14, color: mul(C.text, 0.7), track: 1 });
      drawText(s, 'HI ' + ui.hi + (ui.last ? '   LAST ' + ui.last : ''), 633, 690, { h: 16, color: mul(C.score, 0.9), track: 2 });
    } else if (sim.phase === 'ready') {
      const a = smooth(0, 0.3, sim.phaseTime) * (1 - smooth(TUNE.ready - 0.4, TUNE.ready, sim.phaseTime));
      drawText(s, 'FEED THE FIRE TO BLAZE', 633, 250, { h: 24, color: mul(C.white, a), track: 2 });
      drawText(s, 'HOLD IT TILL THE RING FILLS', 633, 300, { h: 18, color: mul(C.text, 0.95 * a), track: 2 });
    } else if (sim.phase === 'card') {
      const a = smooth(0, 0.6, sim.phaseTime); dark = 0.45 * a;
      const won = sim.result === 2;
      drawText(s, won ? 'THE HEARTH HOLDS' : 'THE FIRE WENT OUT', 633, 330, { h: 44, color: mul(won ? C.white : C.text, a), track: 2 });
      const line = won ? [sim.woke.bull ? 'THE BULL WOKE' : '', sim.woke.deer ? 'THE DEER WOKE' : ''].filter(Boolean).join(' · ')
        : sim.woke.bull ? 'I WOKE THE BULL AND STILL BURNED' : 'THE DARK TOOK THE CAVE';
      if (line) drawText(s, line, 633, 420, { h: 18, color: mul(C.text, 0.9 * a), track: 1 });
      drawText(s, 'SCORE ' + sim.score, 633, 480, { h: 22, color: mul(C.score, a), track: 2 });
    }
    s.commit();
    const o = this.overlay; o.clear();
    if (dark > 0.001) o.poly([[0, 0], [FRAME[0], 0], [FRAME[0], FRAME[1]], [0, FRAME[1]]], [0, 0, 0, dark]);
    o.commit();
  }
}
