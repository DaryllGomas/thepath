// THE NODE · THE LABYRINTH · THE PICTURE (three.js, the look kit). Reads the round, never changes it.
//
//   const view = new LabyrinthView(kit); await view.ready;      kit = createLookKit(renderer, { ...LABYRINTH_LOOK })
//   view.update(sim, dt, t, ui)       ui = { mode: 'attract' | 'play', hi, last }
//
// The layers (the painted plate + live light, PIPELINES.md section 10):
//   the plate: the tube, the dark teal glass, the haze, the faint sacred watermark. The light you gather lights it: the
//   haze lifts and the watermark's lines wake a little (the figure you're uncovering)
//   the walls: clean built geometry (layout.js): each lane's two walls, mitred where lanes meet, cyan at the rim of the
//   maze and teal toward its heart; the heart's ring in pale violet-blue
//   the rooms: each turning room's own walls, a faint dotted rim, its door leaves (which slide shut and open as it turns).
//   Before a turn the room's lines brighten and shimmer slowly, its rim's dots creep the way it will turn
//   the heart's still pen: a small vesica piscis and two lenses round a gold diamond (the echo of the whole figure)
//   the light: small gold diamonds along the lanes, the four power diamonds in the shrines (breathing slowly)
//   the crisp layer (kit.overlay, no persistence): the ship (a cyan arrow, a dotted wake), the red tri-blade pursuers with
//   red dotted trails; pale when they flee, warming slowly back to red as it ends
//   the score (7-segment, gold, top left, where the concept has it), lives as small ships (top right), banners, cards
//   THE LABYRINTH OPENS: the walls let go and the whole sacred figure draws itself in gold on the watermark
// Safety: nothing steps or blinks. Pursuers are a steady red; their pale spell ends as a slow colour ease (2.2 s), never a
// flicker. The warning shimmer is a 0.7 Hz swell; the turn is a 1.15 s eased rotation. Gathering light never flashes.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, ellipse, star, GlowDots, MotionTrail, drawDigits, Backdrop, FillBatch, bezier } from '../../lookkit/index.js';
import { FRAME, CENTRE, SECTIONS, SACRED, fixedWalls, roomWalls, openAfter } from './layout.js';
import { TUNE } from './spec.js';
import { drawText } from '../hearth/font.js';

export const PLATE_URL = new URL('../../../../assets/looktest/labyrinth_plate.png', import.meta.url).href;

export const LABYRINTH_LOOK = {
  frame: FRAME,
  overlay: true,              // crisp layer after the phosphor pass: the ship and the pursuers leave no ghost copies
  bloom: { strength: 0.5, radius: 0.42, threshold: 1.0, tint: [0.55, 0.95, 1.0] },
  phosphor: { tau: [0.035, 0.04, 0.045] },
  // the plate already shows the tube and its bezel: no curvature, no glass edge of the kit's own
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.1, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

// HDR light. hot: how white a colour's line core burns
const HOT_TEAL = [2.1, 1.45, 1.45], HOT_RED = [1.4, 2.4, 3.2], HOT_GOLD = [1.0, 1.35, 3.2];
const C = {
  teal: [0.1, 0.95, 0.72], sky: [0.3, 0.6, 1.25], heart: [0.5, 0.52, 1.3], rim: [0.16, 0.6, 0.85],
  gold: [1.35, 0.6, 0.08], goldHot: [1.55, 0.95, 0.3], score: [1.45, 0.6, 0.1],
  ship: [0.42, 1.05, 1.35], red: [1.55, 0.13, 0.08], pale: [0.72, 0.66, 1.45], text: [0.26, 1.0, 0.86], white: [0.75, 1.05, 1.15],
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

const [CX, CY] = CENTRE;
/** The walls' colour by where they are: teal toward the heart, cyan-blue at the rim of the maze (as the concept paints). */
function wallColour(x, y) {
  const u = smooth(230, 470, Math.abs(x - CX) * 0.82 + Math.abs(y - CY) * 0.55);
  return mix(C.teal, C.sky, u);
}

const SOLID = { dash: 1, gap: 0, width: 1, speed: 0 };
const WALL = { dash: 1, gap: 0, width: 1, speed: 0 };
const THIN = { dash: 1, gap: 0, width: 0.6, speed: 0 };
const FINE = { dash: 1, gap: 0, width: 0.5, speed: 0 };
const TRAIL = { dash: 2.6, gap: 9, width: 1.25, speed: 0 };

// the ship, in its own frame (x forward, y right): an arrowhead with a notched tail and a spine (the concept's arrow)
const SHIP = { outer: [[15, 0], [-9, 8.5], [-4, 0], [-9, -8.5]], inner: [[[11, 0], [-4, 0]]] };
const SHIP_K = 1.45;
function shipPts(x, y, a, k = SHIP_K) {
  const ca = Math.cos(a), sa = Math.sin(a), P = ([u, v]) => [x + (u * ca - v * sa) * k, y + (u * sa + v * ca) * k];
  return { outer: SHIP.outer.map(P), inner: SHIP.inner.map((l) => l.map(P)) };
}
// a pursuer: three swept blades round a small ring (the concept's red tri-blade), built once in its own frame
const BLADE = (() => {
  const P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3 - Math.PI / 2;
    const b1 = P(4.2, a - 0.62), b2 = P(4.2, a + 0.62), tip = P(15.5, a + 0.32);
    const lead = bezier(b1, P(9, a - 0.5), P(14, a - 0.05), tip, 8);
    const trail = bezier(tip, P(11, a + 0.62), P(7.5, a + 0.78), b2, 8);
    out.push([...lead, ...trail.slice(1)]);
  }
  return out;
})();
const BLADE_K = 1.32;
const BLADE_LINE = { dash: 1, gap: 0, width: 0.8, speed: 0 };

export class LabyrinthView {
  constructor(kit) {
    this.kit = kit;
    const { scene } = kit;

    // ---- layer 1: the plate, lit by the light you gather ----
    const plate = new THREE.Texture();
    plate.colorSpace = THREE.NoColorSpace; plate.minFilter = THREE.LinearMipmapLinearFilter; plate.magFilter = THREE.LinearFilter;
    plate.generateMipmaps = true;
    this.ready = new Promise((resolve, reject) => {
      new THREE.ImageLoader().load(PLATE_URL, (img) => { plate.image = img; plate.needsUpdate = true; resolve(); }, undefined, reject);
    });
    this.backdrop = new Backdrop({
      frame: FRAME, map: plate,
      uniforms: { haze: { value: 1 }, wake: { value: 0 }, gold: { value: 0 }, dark: { value: 0 } },
      shade: /* glsl */`
        vec3 x = -log(max(vec3(1.0) - tex.rgb, vec3(0.03)));      // the painting -> light (the tone map gives it back)
        vec3 lo = texture2D(map, vec2(uv.x, 1.0 - uv.y), 2.2).rgb;  // the painting, softened (a mip level down)
        vec2 d = f - vec2(${CX.toFixed(2)}, ${CY.toFixed(2)});
        float r = length(d * vec2(1.0, 1.25));
        // the watermark's faint lines: what stands a little above its own soft surroundings, only near the centre
        float paint = smoothstep(0.006, 0.03, tex.g - lo.g) * (1.0 - smoothstep(380.0, 470.0, r));
        x += paint * wake * vec3(0.035, 0.16, 0.13);                   // the light you gather wakes the figure (a little)
        x += paint * gold * vec3(0.42, 0.24, 0.05);                    // THE LABYRINTH OPENS: the figure glows gold
        // the glass: the concept's tube is near-black between its lines; the plate's painted haze is kept only faintly
        vec2 gq = abs(f - vec2(631.5, 460.5)) - vec2(528.5 - 95.0, 416.5 - 95.0);
        float gd = length(max(gq, 0.0)) + min(max(gq.x, gq.y), 0.0) - 95.0;
        float inGlass = 1.0 - smoothstep(-14.0, 2.0, gd);
        x *= mix(1.0, 0.42, inGlass);
        x += haze * vec3(0.0006, 0.005, 0.0045) * exp(-r * r / (2.0 * 240.0 * 240.0));
        x += gold * vec3(0.02, 0.012, 0.002) * exp(-r * r / (2.0 * 330.0 * 330.0));
        return x * (1.0 - 0.45 * dark);`,
    });
    scene.add(this.backdrop.object);

    // ---- live layers ----
    const T = (o) => kit.track(new GlowLineMaterial(o));
    this.matWall = T({ width: 5.4, coreFrac: 0.15, coreGain: 2.5, haloGain: 0.7, hot: HOT_TEAL });
    this.matRoom = T({ width: 5.4, coreFrac: 0.15, coreGain: 2.5, haloGain: 0.7, hot: HOT_TEAL });
    this.matDecor = T({ width: 5.2, coreGain: 2.4, haloGain: 0.7, hot: HOT_TEAL });
    this.matGold = T({ width: 5.0, coreGain: 2.6, haloGain: 0.8, hot: HOT_GOLD });
    this.matSacred = T({ width: 5.6, coreGain: 2.6, haloGain: 0.9, hot: HOT_GOLD });
    this.matShip = T({ width: 6.0, coreGain: 3.0, haloGain: 0.9, hot: HOT_TEAL });
    this.matRed = T({ width: 6.0, coreGain: 2.8, haloGain: 1.0, hot: HOT_RED });
    this.matUI = T({ width: 6.5, coreGain: 2.8, haloGain: 0.8, hot: HOT_GOLD });
    this.matText = T({ width: 6.5, coreGain: 2.8, haloGain: 0.8, hot: HOT_TEAL });

    // the fixed walls: built once (a gap at every door; the leaves close them)
    const fw = fixedWalls();
    this.leaves = fw.leaves.map((l) => ({ ...l, v: -1 }));
    this.sWall = new LineBatch(this.matWall, fw.segs.length + 8);
    for (const [x0, y0, x1, y1] of fw.segs) {
      const c = wallColour((x0 + x1) / 2, (y0 + y1) / 2);
      this.sWall.seg(x0, y0, x1, y1, c, c, WALL);
    }
    this.sWall.commit(); this.sWall.object.renderOrder = 8; scene.add(this.sWall.object);
    // each room's walls for each of its arrangements (base orientation), turned at draw time
    this.roomSegs = SECTIONS.map((S) => [0, 1, 2, 3].map((k) => roomWalls(S.id, openAfter(S.id, k))));
    this.roomG = SECTIONS.map(() => 1);
    this.sRoom = new LineBatch(this.matRoom, 1600); this.sRoom.object.renderOrder = 9;
    this.sDecor = new LineBatch(this.matDecor, 2600); this.sDecor.object.renderOrder = 7;
    this.sGold = new LineBatch(this.matGold, 2400); this.sGold.object.renderOrder = 6;
    this.sSacred = new LineBatch(this.matSacred, 3000); this.sSacred.object.renderOrder = 5;
    scene.add(this.sDecor.object, this.sGold.object, this.sSacred.object);
    this.dots = kit.track(new GlowDots(900)); this.dots.object.renderOrder = 4; scene.add(this.dots.object);
    // the crisp layer: the turning rooms (their ends stay sharp), the ship, the pursuers, their trails, the text
    this.sShip = new LineBatch(this.matShip, 900); this.sShip.object.renderOrder = 12;
    this.sRed = new LineBatch(this.matRed, 1800); this.sRed.object.renderOrder = 13;
    this.crispDots = kit.track(new GlowDots(200)); this.crispDots.object.renderOrder = 14;
    this.band = new FillBatch(96); this.band.object.renderOrder = 30;
    this.sUI = new LineBatch(this.matUI, 1400); this.sUI.object.renderOrder = 40;
    this.sText = new LineBatch(this.matText, 3000); this.sText.object.renderOrder = 41;
    (kit.overlay ?? scene).add(this.sRoom.object, this.sShip.object, this.sRed.object, this.crispDots.object, this.band.object, this.sUI.object, this.sText.object);

    // the heart's still pen: the whole figure's echo, small (fits inside the ring's inner wall at every turn)
    this.pen = buildPen();
    this._reset();
  }

  _reset() {
    this.fx = []; this.trails = new Map(); this.banner = null;
    this.paleNow = [0, 0, 0, 0];
    this.shipV = 1;
    this.lightE ??= 0; this.dark ??= 0; this.open ??= 0;      // kept across rounds: they ease to the new round's values
    this.shipTrail = new MotionTrail(10, 9);
    for (const l of this.leaves) l.v = -1;
    this.roomG = SECTIONS.map(() => 1);
  }

  /** One frame. sim = the round being shown (the attract demo or the real one). */
  update(sim, dt, t, ui = {}) {
    if (sim !== this._sim) { this._sim = sim; this._reset(); this.kit.resetPersistence?.(); this.uiIn = 0; }
    this._dt = dt;
    this._t = t;
    for (const m of [this.matRoom, this.matDecor, this.matGold]) m.time = t;
    this.sRoom.clear(); this.sDecor.clear(); this.sGold.clear(); this.sShip.clear(); this.sRed.clear(); this.dots.clear(); this.crispDots.clear();
    this._events(sim, t);
    this._light(sim, dt, t);
    this._rooms(sim, dt, t);
    this._pen(sim, dt, t);
    this._gates(sim, dt, t);
    this._lights(sim, dt, t);
    this._sacred(sim, dt, t);
    this._pursuers(sim, dt, t);
    this._ship(sim, dt, t);
    this._effects(sim, dt, t);
    this.sRoom.commit(); this.sDecor.commit(); this.sGold.commit(); this.sShip.commit(); this.sRed.commit(); this.dots.commit(); this.crispDots.commit();
    this._ui(sim, t, ui);
  }

  // ---------------- events -> effects ----------------
  _events(sim, t) {
    for (const e of sim.events) {
      if (e.kind === 'eat') this.fx.push({ k: 'spark', x: e.x, y: e.y, t0: t, dur: 0.35 });
      else if (e.kind === 'power') { this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 1.1, r0: 10, r1: 70, c: C.goldHot }); }
      else if (e.kind === 'banish') {
        this.fx.push({ k: 'dissolve', x: e.x, y: e.y, t0: t, dur: 0.7, i: e.i });
        this.fx.push({ k: 'text', text: String(e.points), x: e.x, y: e.y - 30, t0: t + 0.05, dur: 1.3, c: C.pale });
      } else if (e.kind === 'expel') this.fx.push({ k: 'dissolve', x: e.x, y: e.y, t0: t, dur: 0.7, i: e.i });
      else if (e.kind === 'caught') {
        const a = Math.atan2(e.heading[1], e.heading[0]), p = shipPts(e.x, e.y, a), segs = [];
        const o = p.outer; for (let k = 0; k < o.length; k++) segs.push([o[k], o[(k + 1) % o.length]]);
        segs.forEach(([a0, b0], k) => {
          const mx = (a0[0] + b0[0]) / 2, my = (a0[1] + b0[1]) / 2, ang = Math.atan2(my - e.y, mx - e.x) + (hash1(k + t) - 0.5) * 0.6, v = 22 + 26 * hash1(k * 3 + t);
          this.fx.push({ k: 'shipFrag', a: a0, b: b0, x: mx, y: my, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vr: (hash1(k * 7 + t) - 0.5) * 3, t0: t, dur: 1.5 });
        });
        this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 1.2, r0: 8, r1: 46, c: C.ship });
      } else if (e.kind === 'ward') this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: 1.4, r0: 30, r1: 44, c: C.white });
      else if (e.kind === 'warn') {
        const names = { shrines: 'THE SHRINES TURN', wings: 'THE WINGS TURN', heart: 'THE HEART TURNS' };
        this.banner = e.first ? { a: 'THE LABYRINTH', b: 'SHIFTS', t0: t + 0.1, dur: 2.9, big: true }
          : { a: names[e.group] ?? 'THE LABYRINTH SHIFTS', b: '', t0: t + 0.1, dur: 2.2 };
      } else if (e.kind === 'emerge') this.trails.get(e.i)?.reset();
    }
  }

  // ---------------- the plate's light: the gathered light, the dark, the opening ----------------
  _light(sim, dt, t) {
    const share = sim.total ? sim.gathered / Math.max(1, sim.target) : 0;
    this.lightE += (clamp01(share) - this.lightE) * (1 - Math.exp(-dt / 0.8));
    const lost = sim.phase === 'card' && sim.result === 1, won = sim.phase === 'card' && sim.result === 2;
    this.dark += ((lost ? 1 : 0) - this.dark) * (1 - Math.exp(-dt / 1.3));
    // THE OPENING: after the last light, the figure rises over ~2.4 s (a swell, never a flash)
    const openT = won ? sim.phaseTime : -1;
    this.open = won ? smooth(0.3, 2.7, openT) : Math.max(0, this.open - dt / 0.6);
    const u = this.backdrop.uniforms, BREATH = 9;
    u.haze.value = (0.8 + 0.55 * this.lightE) * (1 + 0.06 * Math.sin(t * Math.PI * 2 / BREATH)) * (1 + 0.6 * this.open);
    u.wake.value = 0.1 + 0.9 * this.lightE * this.lightE;
    u.gold.value = this.open;
    u.dark.value = this.dark;
    const gw = (1 - 0.4 * this.dark) * (1 - 0.72 * this.open);
    this.matWall.gain = gw;
    this.wallGain = gw;
  }

  // ---------------- the rooms: their walls (turning), rims, door leaves ----------------
  _rooms(sim, dt, t) {
    const R = sim.rebuild?.cur, RB = TUNE.rebuild;
    const b = this.sRoom, dec = this.sDecor, gw = this.wallGain;
    const a = 1 - Math.exp(-dt / 0.3);
    for (const S of SECTIONS) {
      const inGroup = R && R.secs.includes(S.id);
      // warn: brighten over 0.5 s and hold; after the turn ease back
      let want = 1;
      if (inGroup) want = R.phase === 'turn' ? 1.75 : 1 + 0.75 * smooth(0, 0.5, R.phase === 'warn' ? R.t : RB.warn);
      this.roomG[S.id] += (want - this.roomG[S.id]) * (want > this.roomG[S.id] ? 1 - Math.exp(-dt / 0.2) : a * 0.5);
      const g = this.roomG[S.id], ex = (g - 1) / 0.75;              // 0..1: how awake the room is
      const ang = sim.roomAngle ? sim.roomAngle(S.id) : 0, c = Math.cos(ang), s = Math.sin(ang);
      const segs = this.roomSegs[S.id][sim.secK[S.id] % 4];
      const base = S.kind === 'heart' ? C.heart : wallColour(S.x, S.y);
      for (let i = 0; i < segs.length; i++) {
        const [x0, y0, x1, y1] = segs[i];
        // the slow shimmer: a 0.7 Hz swell travelling round the room (low, smooth)
        const ph = Math.atan2((y0 + y1) / 2 - S.y, (x0 + x1) / 2 - S.x);
        const sh = 1 + 0.16 * ex * Math.sin(t * Math.PI * 2 * 0.7 - ph * S.turn);
        const col = mul(base, g * sh * gw);
        const ax = x0 - S.x, ay = y0 - S.y, bx = x1 - S.x, by = y1 - S.y;
        b.seg(S.x + ax * c - ay * s, S.y + ax * s + ay * c, S.x + bx * c - by * s, S.y + bx * s + by * c, col, col, WALL);
      }
      // the rim: a faint dotted circle; awake, its dots creep the way the room will turn
      const rimR = S.rim + (S.kind === 'heart' ? 0 : 1);
      const n = S.kind === 'heart' ? 120 : 56;
      const rimCol = mul(S.kind === 'heart' ? C.heart : C.rim, (S.kind === 'heart' ? 0.22 : 0.42) * (1 + 1.6 * ex) * gw * (1 + 0.6 * this.open));
      dec.loop(ellipse(S.x, S.y, rimR, rimR, n).slice(0, n), rimCol, { dash: 3, gap: 6, width: 0.65, speed: 14 * S.turn * ex });
    }
    // the door leaves: slide shut from both jambs as a room starts to turn, slide open as it lands
    const lb = b;
    for (const L of this.leaves) {
      const door = SECTIONS[L.sec].doors.find((d) => d.dir === L.dir);
      const shut = sim.open[door.edge] ? 0 : 1;
      if (L.v < 0) L.v = shut;
      L.v += (shut - L.v) * (1 - Math.exp(-dt / 0.09));
      if (L.v < 0.01) continue;
      const [x0, y0, x1, y1] = L.seg, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const g = this.roomG[L.sec], col = mul(wallColour(mx, my), Math.min(1.35, g) * gw);
      const k = Math.min(1, L.v) * 0.5;
      lb.seg(x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, col, col, WALL);
      lb.seg(x1, y1, x1 + (x0 - x1) * k, y1 + (y0 - y1) * k, col, col, WALL);
    }
  }

  // ---------------- the heart's still pen ----------------
  _pen(sim, dt, t) {
    const dec = this.sDecor, gw = this.wallGain * (1 - 0.3 * this.open);
    const g = (0.85 + 0.08 * Math.sin(t * Math.PI * 2 / 9)) * gw;
    for (const part of this.pen.lines) dec.line(part, mul(C.heart, 0.75 * g), THIN);
    // the jewel at the heart: a gold diamond with a star of light; it brightens as the light is gathered
    const [cx, cy] = CENTRE, J = 21, lk = 0.75 + 0.5 * this.lightE + 0.6 * this.open;
    this.sGold.loop([[cx, cy - J], [cx + J, cy], [cx, cy + J], [cx - J, cy]], mul(C.gold, 1.05 * lk), SOLID);
    this.sGold.loop([[cx, cy - J * 0.45], [cx + J * 0.45, cy], [cx, cy + J * 0.45], [cx - J * 0.45, cy]], mul(C.gold, 0.7 * lk), THIN);
    star(this.sGold, cx, cy, 17 * (0.9 + 0.1 * lk), mul(C.goldHot, 0.95 * lk), 4, 0, THIN);
    this.sGold.seg(cx - J, cy, cx + J, cy, mul(C.gold, 0.5 * lk), mul(C.gold, 0.5 * lk), FINE);
    this.sGold.seg(cx, cy - J, cx, cy + J, mul(C.gold, 0.5 * lk), mul(C.gold, 0.5 * lk), FINE);
    this.dots.add(cx, cy, 30, mul([0.3, 0.16, 0.03], lk));
    this.dots.add(cx, cy, 8, mul([1.4, 0.95, 0.4], 0.9 * lk));
    // the tell: a pursuer gathering itself in the pen before it comes back (a slow red swell at the heart)
    let gather = 0;
    for (const q of sim.pursuers) { const s = sim.emergeIn ? sim.emergeIn(q) : Infinity; if (s < 2.2) gather = Math.max(gather, 1 - s / 2.2); }
    this.gather = (this.gather ?? 0) + (gather - (this.gather ?? 0)) * (1 - Math.exp(-dt / 0.25));
    if (this.gather > 0.01) {
      const q = this.gather;
      this.dots.add(cx, cy, 20 + 26 * q, mul([0.6, 0.05, 0.03], 0.55 * q));
      this.sRed.loop(ellipse(cx, cy, 44 - 22 * q, 44 - 22 * q, 40).slice(0, 40), mul([0.8, 0.06, 0.05], 0.7 * q), FINE);
    }
  }

  // ---------------- the gates: the triangles at the top and bottom (in their wall blocks, on the watermark's own) ----------------
  _gates(sim, dt, t) {
    const dec = this.sDecor, gw = this.wallGain, lk = this.lightE;
    const col = mul(wallColour(CX, CY - 300), 0.95 * gw);
    for (const P of GATES.tris) dec.line(P.pts, mul(col, P.inner ? 0.62 : 1), P.inner ? THIN : WALL);
    for (const [x0, y0, x1, y1] of GATES.axes) dec.seg(x0, y0, x1, y1, mul(col, 0.7), mul(col, 0.25), THIN);
    // the gate lamps: dim at first, warming as the light is gathered (a quiet measure of how far you've come)
    for (const [x, y, big] of GATES.lamps) {
      const k = (0.4 + 0.9 * lk) * (1 + 0.5 * this.open) * gw + 0.5 * this.open;
      this.dots.add(x, y, big ? 7 : 5, mul([1.4, 0.75, 0.2], 0.8 * k));
      this.dots.add(x, y, big ? 18 : 12, mul([0.35, 0.14, 0.02], 0.8 * k));
    }
  }

  // ---------------- the light ----------------
  _lights(sim, dt, t) {
    const b = this.sGold, w = [0, 0], gw = 1 - 0.8 * this.open;
    if (gw <= 0.01) return;
    for (const l of sim.light) {
      if (l.eaten) continue;
      sim.worldAt(l.e, l.s, w);
      const [x, y] = w;
      if (l.power) {
        const br = 1 + 0.12 * Math.sin(t * Math.PI * 2 / 2.4 + l.id);      // breathing slowly (0.4 Hz)
        const H = 16 * br;
        b.loop([[x, y - H], [x + H, y], [x, y + H], [x - H, y]], mul(C.gold, 1.1 * gw), SOLID);
        b.seg(x - H, y, x + H, y, mul(C.gold, 0.55 * gw), mul(C.gold, 0.55 * gw), FINE);
        b.seg(x, y - H, x, y + H, mul(C.gold, 0.55 * gw), mul(C.gold, 0.55 * gw), FINE);
        star(b, x, y, 13 * br, mul(C.goldHot, 1.0 * gw), 4, 0, THIN);
        this.dots.add(x, y, 26, mul([0.32, 0.13, 0.02], br * gw));
        this.dots.add(x, y, 5, mul([1.5, 1.0, 0.45], gw));
      } else {
        // the last lights call you: once only a handful are left to the goal they glow brighter and breathe slowly
        // (0.5 Hz, a gentle swell: never a blink) so they can be found after the rooms have turned
        const left = Math.max(0, sim.target - sim.gathered), last = left <= 12 && sim.phase === 'play' ? 1 : 0;
        this.lastK = (this.lastK ?? 0) + (last - (this.lastK ?? 0)) * Math.min(1, dt / 0.8);
        const lk = this.lastK * (0.75 + 0.25 * Math.sin(t * Math.PI + l.id));
        const H = 4.6 + 1.6 * lk;
        b.loop([[x, y - H], [x + H, y], [x, y + H], [x - H, y]], mul(C.gold, (0.95 + 0.45 * lk) * gw), FINE);
        this.dots.add(x, y, 4.5 + 9 * lk, mul([0.7, 0.32, 0.04], (0.6 + 0.5 * lk) * gw));
      }
    }
  }

  // ---------------- THE LABYRINTH OPENS: the figure draws itself outward in gold ----------------
  _sacred(sim, dt, t) {
    const b = this.sSacred; b.clear();
    if (this.open <= 0.001) { b.commit(); return; }
    const won = sim.phase === 'card' && sim.result === 2, T0 = won ? sim.phaseTime - 0.4 : 99;
    for (const P of SACRED) {
      const start = 0.12 + P.r0 / 430 * 1.3;
      const u = won ? clamp01((T0 - start) / 1.1) : this.open;
      if (u <= 0) continue;
      const col = mul(P.kind === 'axis' ? C.goldHot : C.gold, (0.75 + 0.35 * (1 - smooth(0, 1.6, T0 - start - 1.1))) * this.open);
      const head = partial(b, P.pts, u, col, P.kind === 'axis' ? THIN : SOLID);
      if (u < 1) this.dots.add(head[0], head[1], 6, mul([1.3, 0.9, 0.35], 0.8));
    }
    // the rooms' rims close as gold circles: the hidden skeleton, shown
    for (const S of SECTIONS) {
      const u = won ? clamp01((T0 - 0.9 - Math.hypot(S.x - CX, S.y - CY) / 600) / 1.2) : this.open;
      if (u <= 0) continue;
      const n = S.kind === 'heart' ? 110 : 60, pts = ellipse(S.x, S.y, S.rim, S.rim, n);
      partial(b, pts, u, mul(C.gold, 0.6 * this.open), THIN);
    }
    b.commit();
  }

  // ---------------- the pursuers ----------------
  _pursuers(sim, dt, t) {
    const live = new Set(), lt = sim.levelTime;
    for (const q of sim.pursuers) {
      if (q.st === 'pen' || q.st === 'banished') { this.trails.get(q.i)?.reset(); continue; }
      live.add(q.i);
      let tr = this.trails.get(q.i);
      if (!tr) { tr = new MotionTrail(9, 10); this.trails.set(q.i, tr); }
      // born: fades in over the emergence; the win: fades away
      const born = q.st === 'emerging' ? smooth(0, TUNE.pursuer.emerge, q.t) : 1;
      const k = born * (1 - this.open) * (sim.phase === 'card' && sim.result === 1 ? 1 : 1);
      if (k < 0.01) continue;
      // pale while they flee; the last TUNE.power.ease s warm slowly back to red (a colour ease: never a blink)
      const left = q.frightUntil - lt;
      const pale = left > 0 ? smooth(0, TUNE.power.ease, left) : 0;
      const col = mix(C.red, C.pale, pale);
      this.paleNow[q.i] = pale;                                   // (read by the safety probe: the colour drawn)
      const last = tr.points[0];
      if (last && Math.hypot(last[0] - q.x, last[1] - q.y) > 60) tr.reset();       // came through the tunnel
      tr.push(q.x, q.y);
      const spin = t * (1.4 - 0.7 * pale) * (q.i % 2 ? -1 : 1) + q.i * 1.3, ca = Math.cos(spin), sa = Math.sin(spin);
      for (const bl of BLADE) {
        const pts = bl.map(([u, v]) => [q.x + (u * ca - v * sa) * BLADE_K, q.y + (u * sa + v * ca) * BLADE_K]);
        this.sRed.loop(pts, mul(col, 1.15 * k), BLADE_LINE);
      }
      this.sRed.loop(ellipse(q.x, q.y, 4.2, 4.2, 14).slice(0, 14), mul(col, 1.0 * k), THIN);
      this.crispDots.add(q.x, q.y, 16, mul(mix([0.5, 0.035, 0.025], [0.26, 0.24, 0.55], pale), 0.85 * k));
      if (tr.points.length > 1) this.sRed.line(tr.points, mul(col, 0.8 * k), TRAIL, [0, 0, 0]);
    }
    for (const id of this.trails.keys()) if (!live.has(id)) this.trails.delete(id);
  }

  // ---------------- the ship ----------------
  _ship(sim, dt, t) {
    const s = sim.player;
    this.shipV += ((s.alive ? 1 : 0) - this.shipV) * (1 - Math.exp(-dt / (s.alive ? 0.15 : 0.03)));
    if (!s.alive) { this.shipTrail.reset(); return; }
    if (this.shipV < 0.01) return;
    const a = Math.atan2(s.heading[1], s.heading[0]);
    const last = this.shipTrail.points[0];
    if (last && Math.hypot(last[0] - s.x, last[1] - s.y) > 60) this.shipTrail.reset();
    this.shipTrail.push(s.x, s.y);
    const k = this.shipV * (sim.phase === 'ready' && sim.readyDur > 2 ? smooth(0.2, 1.0, sim.phaseTime) : 1);
    const p = shipPts(s.x, s.y, a), c = mul(C.ship, 1.1 * k);
    this.sShip.loop(p.outer, c, WALL);
    for (const l of p.inner) this.sShip.line(l, mul(c, 0.55), THIN);
    this.crispDots.add(s.x, s.y, 12, mul([0.06, 0.2, 0.3], k));
    // its dotted wake (the concept's "· · ·" behind the ship)
    const pts = this.shipTrail.points;
    if (pts.length > 1) {
      const ca = Math.cos(a), sa = Math.sin(a), tail = [[s.x - ca * 12, s.y - sa * 12], ...pts.slice(1)];
      this.sShip.line(tail, mul(C.ship, 0.6 * k), TRAIL, [0, 0, 0]);
    }
    // the ward (mercy): a steady ring while it holds (never a blink)
    if (s.ward > 0) this.sShip.loop(ellipse(s.x, s.y, 30, 30, 40).slice(0, 40), mul(C.white, 0.45 * smooth(0, 0.6, s.ward)), THIN);
  }

  // ---------------- sparks, rings, fragments, rising numbers ----------------
  _effects(sim, dt, t) {
    this.fx = this.fx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.fx) {
      const age = t - e.t0, u = age / e.dur, fade = 1 - smooth(0, 1, u);
      if (age < 0) continue;
      if (e.k === 'spark') {                                  // a gathered light: a small gold glint that fades (no flash)
        this.dots.add(e.x, e.y, 7 + 8 * u, mul([0.9, 0.5, 0.1], 0.55 * fade));
      } else if (e.k === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * Math.sqrt(u);
        this.sShip.loop(ellipse(e.x, e.y, r, r, 40).slice(0, 40), mul(e.c, 0.55 * fade * smooth(0, 0.1, age)), THIN);
      } else if (e.k === 'dissolve') {                        // a banished pursuer: its blades drift apart and fade (pale)
        const sp = 1 + 1.6 * u;
        for (const bl of BLADE) {
          const pts = bl.map(([x, y]) => [e.x + x * BLADE_K * sp, e.y + y * BLADE_K * sp]);
          this.sRed.loop(pts, mul(C.pale, 0.7 * fade), FINE);
        }
      } else if (e.k === 'shipFrag') {
        const x = e.x + e.vx * age, y = e.y + e.vy * age, r = e.vr * age, ca = Math.cos(r), sa = Math.sin(r);
        const P = (q) => { const dx = q[0] - e.x, dy = q[1] - e.y; return [x + dx * ca - dy * sa, y + dx * sa + dy * ca]; };
        this.sShip.line([P(e.a), P(e.b)], mul(C.ship, 1.0 * fade), WALL);
      } else if (e.k === 'text') drawText(this.sShip, e.text, e.x, e.y - 18 * u, { h: 12, color: mul(e.c, 0.9 * fade * smooth(0, 0.12, age)), track: 1 });
    }
  }

  // ---------------- score, lives, the light, banners, cards ----------------
  _ui(sim, t, ui) {
    const s = this.sUI, tx = this.sText; s.clear(); tx.clear();
    this.uiIn = Math.min(1, (this.uiIn ?? 0) + (this._dt ?? 1 / 60) / 0.45);
    this.matUI.gain = this.matText.gain = smooth(0, 1, this.uiIn); this.band.material.opacity = smooth(0, 1, this.uiIn);
    const o = this.band; o.clear();
    const cx = FRAME[0] / 2;
    // the score where the concept has it: top left, gold 7-segment
    drawDigits(s, String(sim.score).padStart(5, ' ').trimStart(), 206, 66, { h: 24, w: 14, pitch: 21, slant: 0.0, gap: 1.6, hollow: false,
      color: mul(C.score, 1.0), style: { dash: 1, gap: 0, width: 0.85 } });
    // lives: small ships, top right (mirroring the score)
    const lives = Math.max(0, sim.livesLeft ?? 0);
    for (let k = 0; k < lives; k++) {
      const p = shipPts(1052 - k * 34, 79, 0, 0.9);
      s.loop(p.outer, mul(C.ship, 0.9)); s.line(p.inner[0], mul(C.ship, 0.5));
    }
    // the light gathered: a thin gold line under the score filling toward the goal
    const frac = clamp01(sim.gathered / Math.max(1, sim.target));
    if (ui.mode !== 'attract') {
      const x0 = 206, x1 = 306, y = 99;
      s.seg(x0, y, x0 + (x1 - x0) * frac, y, mul(C.gold, 0.9), mul(C.gold, 0.9), THIN);
      if (frac < 1) s.seg(x0 + (x1 - x0) * frac, y, x1, y, mul(C.gold, 0.18), mul(C.gold, 0.18), THIN);
      // how many lights are still needed to open it (the goal, always readable)
      const left = Math.max(0, sim.target - sim.gathered);
      if (sim.phase !== 'card') drawText(tx, left > 0 ? left + ' TO GO' : 'OPEN', 330, 74, { h: 14, color: mul(C.goldHot, 0.95), track: 1, align: 'left' });
      // ALMOST THERE: once, as you get close
      if (left > 0 && left <= 10 && !this.almostShown && sim.phase === 'play') {
        this.almostShown = true; this.banner = { a: 'ALMOST THERE', b: left + ' LIGHTS TO GO', t0: t, dur: 2.4, big: true };
      }
      if (sim.phase === 'ready' && sim.readyDur > 2) this.almostShown = false;
    }
    const band = (y0, y1, a) => {           // a soft dark band behind card text (the maze stays visible above and below)
      if (a <= 0.001) return;
      for (const [d, k] of [[0, 0.35], [14, 0.65], [28, 1]]) o.poly([[103, y0 + d], [1160, y0 + d], [1160, y1 - d], [103, y1 - d]], [0, 0, 0, a * k * 0.5]);
    };
    // banners: the rebuild's, in the top gate's block (clear of the lanes)
    if (this.banner && ui.mode !== 'attract') {
      const B = this.banner, u = (t - B.t0) / B.dur;
      if (u >= 0 && u < 1) {
        const a = smooth(0, 0.12, u) * (1 - smooth(0.78, 1, u));
        if (B.big) {
          drawText(tx, B.a, cx, 164, { h: 17, color: mul(C.white, 0.95 * a), track: 1 });
          drawText(tx, B.b, cx, 192, { h: 17, color: mul(C.white, 0.95 * a), track: 1 });
        } else drawText(tx, B.a, cx, 176, { h: 12, color: mul(C.text, 0.9 * a), track: 1 });
      }
    }
    if (ui.mode === 'attract') {
      band(236, 690, 1.65);
      const breathe = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
      drawText(tx, 'THE LABYRINTH', cx, 282, { h: 46, color: mul(C.text, 1.2), track: 2 });
      drawText(tx, 'GATHER THE GOLD LIGHT TO OPEN IT', cx, 372, { h: 20, color: mul(C.goldHot, 0.9), track: 2 });
      drawText(tx, this.inCabinet ? (this.cabinetStart ?? 'INSERT COIN') : 'PRESS START', cx, 440, { h: 24, color: mul(C.white, breathe), track: 2 });
      drawText(tx, 'ARROWS OR WASD MOVE · PRESS EARLY TO TURN', cx, 510, { h: 13, color: mul(C.text, 0.8), track: 1 });
      drawText(tx, 'THE GOLD DOTS OPEN IT · THE BIG DIAMONDS TURN THE HUNTERS', cx, 544, { h: 13, color: mul(C.text, 0.8), track: 1 });
      drawText(tx, "THE ROOMS TURN · DON'T GET WALLED IN", cx, 578, { h: 13, color: mul(C.text, 0.8), track: 1 });
      drawText(tx, 'HI ' + ui.hi + (ui.last ? '   LAST ' + ui.last : ''), cx, 632, { h: 16, color: mul(C.score, 0.9), track: 2 });
    } else if (sim.phase === 'ready') {
      const first = sim.readyDur > 2;
      const a = smooth(0, 0.3, sim.phaseTime) * (1 - smooth(sim.readyDur - 0.45, sim.readyDur, sim.phaseTime));
      if (first) {
        band(560, 760, a);
        drawText(tx, 'GATHER THE GOLD LIGHT', cx, 590, { h: 30, color: mul(C.goldHot, a), track: 2 });
        drawText(tx, sim.target + ' OF ' + sim.total + ' OPENS THE LABYRINTH', cx, 648, { h: 20, color: mul(C.text, a), track: 2 });
        drawText(tx, "DIAMONDS TURN THE HUNTERS · DON'T GET WALLED IN", cx, 696, { h: 13, color: mul(C.text, 0.85 * a), track: 1 });
      } else {
        band(600, 690, a);
        drawText(tx, 'READY', cx, 628, { h: 26, color: mul(C.white, a), track: 3 });
      }
    } else if (sim.phase === 'card') {
      const won = sim.result === 2, delay = won ? 3.0 : 0.8;
      const a = smooth(delay, delay + 0.8, sim.phaseTime);
      band(590, 790, a);
      drawText(tx, won ? 'THE LABYRINTH OPENS' : 'THE LABYRINTH CLOSES', cx, 620, { h: 31, color: mul(won ? C.goldHot : C.text, a), track: 2 });
      const got = sim.gathered + ' OF ' + sim.total + ' LIGHTS';
      drawText(tx, won ? 'THE LIGHT IS GATHERED · ' + got : got + ' · CAUGHT ' + (sim.stats?.caught ?? 3) + ' TIMES', cx, 684, { h: 15, color: mul(C.text, 0.9 * a), track: 1 });
      drawText(tx, 'SCORE ' + sim.score, cx, 724, { h: 22, color: mul(C.score, a), track: 2 });
    }
    s.commit(); tx.commit(); o.commit();
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

/** The pen: the watermark's figure (the upright vesica, the two lenses) at half size, inside the heart ring's inner wall. */
/** The gates: the measured triangles (outer and inner, top and bottom), a short axis from each base toward the heart's
 *  octagon, and the lamps at each apex and inside each triangle. */
const GATES = (() => {
  const tris = SACRED.filter((p) => p.kind === 'tri').map((p, i) => ({ pts: p.pts, inner: i % 2 === 1 }));
  const outer = SACRED.filter((p) => p.kind === 'tri').filter((_, i) => i % 2 === 0);
  const axes = [], lamps = [];
  for (const o of outer) {
    const apex = o.pts[0], base = o.pts[1][1], sg = Math.sign(base - apex[1]);
    axes.push([CX, base, CX, base + sg * 82]);
    lamps.push([CX, apex[1] + sg * 3, true], [CX, apex[1] + sg * 0.62 * Math.abs(base - apex[1]), false]);
  }
  return { tris, axes, lamps };
})();

function buildPen() {
  const [cx, cy] = CENTRE, K = 0.44, lines = [];
  const arc = (ox, oy, r, a0, a1, n = 28) => { const out = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + (ox + Math.cos(a) * r) * K, cy + (oy + Math.sin(a) * r) * K]); } return out; };
  // the vesica piscis (two circles, each through the other's centre) standing upright, and two lying lenses
  const vr = 134, vd = 60, al = Math.atan2(Math.sqrt(vr * vr - vd * vd), vd);
  lines.push(arc(vd, 0, vr, Math.PI - al, Math.PI + al), arc(-vd, 0, vr, -al, al));
  const lr = 80.3, lx = 82.5, ld = 41.8, lh = Math.sqrt(lr * lr - ld * ld);
  for (const sx of [1, -1]) for (const cyc of [ld, -ld]) {
    const tL = Math.atan2(-cyc, -lh), tR = Math.atan2(-cyc, lh);
    lines.push(arc(sx * lx, cyc, lr, Math.min(tL, tR), Math.max(tL, tR), 20));
  }
  return { lines };
}
