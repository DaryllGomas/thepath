// THE NODE · THE CONSTELLATION · THE PICTURE (three.js, the look kit). Reads the round, never changes it.
//
//   const view = new ConstellationView(kit); await view.ready;      kit = createLookKit(renderer, { ...CONSTELLATION_LOOK })
//   view.update(sim, dt, t, ui)       ui = { mode: 'attract' | 'play', hi, last }
//
// The layers (the painted plate + live light, PIPELINES.md §10):
//   the plate (the night sky, the faint blue figure, the dim gold stars); a star that falls darkens its painted self
//   the stars: the traced gold strokes glow over the painted ones while alive (a warm swell when they fire); shot pips
//   the figure: each cleared wave's lines light in gold, a spark rising from their star first, then drawn out from it
//   the shapes (red wireframe solids, turning slowly, dotted trails), the counter-shots (thin gold arcs, a bright head,
//   the target's x), the rings (grow, hold, FADE), shatters, impacts, the crosshair
//   the score (7-segment, top left), the waves (top right), banners and cards in the vector stroke font
// Safety: nothing steps or blinks. Every ring eases in (0.1 s) and fades (0.6 s); the rings' total light is capped and
// eased (many bursts at once never add up to a flash); red shapes are steady, and they shatter into shards that fade.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, ellipse, star, GlowDots, MotionTrail, drawDigits, Backdrop, FillBatch } from '../../lookkit/index.js';
import { FRAME, STARS, BASES, TEMPLE, STROKES, GROUND_Y, polyLen } from './layout.js';
import { TUNE } from './spec.js';
import { drawText } from '../hearth/font.js';

export const PLATE_URL = new URL('../../../../assets/looktest/constellation_plate.png', import.meta.url).href;

export const CONSTELLATION_LOOK = {
  frame: FRAME,
  overlay: true,              // crisp layer after the phosphor pass: shapes, rings, crosshair leave no ghost copies
  bloom: { strength: 0.5, radius: 0.5, threshold: 1.0, tint: [1.0, 0.78, 0.5] },
  phosphor: { tau: [0.045, 0.036, 0.028] },
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.12, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

// HDR light. The glow-line core multiplies by hot [1, 1.7, 12]: a colour's green and small blue decide how white it burns.
const C = {
  gold: [1.15, 0.55, 0.045], fig: [1.0, 0.44, 0.032], shot: [1.1, 0.68, 0.085], burst: [1.3, 0.74, 0.1],
  red: [1.3, 0.12, 0.008], ember: [0.9, 0.2, 0.012], score: [1.35, 0.5, 0.03], text: [1.25, 0.58, 0.05],
  white: [1.45, 0.95, 0.11], cross: [1.2, 0.78, 0.09], ring: [1.2, 0.44, 0.03], grain: [1.3, 0.55, 0.028],
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ---- the red solids (model coords, y UP, unit size) ----
const CUBE = (() => {
  const v = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x * 0.72, y * 0.72, z * 0.72]);
  const e = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    let diff = 0; for (let k = 0; k < 3; k++) if (v[i][k] !== v[j][k]) diff++;
    if (diff === 1) e.push([i, j]);
  }
  return { v, e };
})();
const RING = (n, r, y) => Array.from({ length: n }, (_, i) => [Math.cos(i * Math.PI * 2 / n) * r, y, Math.sin(i * Math.PI * 2 / n) * r]);
const SOLIDS = {
  normal: { v: [[1, 0, 0], [-1, 0, 0], [0, 1.4, 0], [0, -1.4, 0], [0, 0, 1], [0, 0, -1]],
    e: [[0, 2], [0, 3], [1, 2], [1, 3], [4, 2], [4, 3], [5, 2], [5, 3], [0, 4], [4, 1], [1, 5], [5, 0]], size: 16 },
  split: { ...CUBE, size: 21 },
  fast: { v: [[0, -1.35, 0], ...RING(3, 1.0, 0.55)], e: [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [3, 1]], size: 14 },
  kid: { v: [[0, -1.35, 0], ...RING(3, 1.0, 0.55)], e: [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [3, 1]], size: 11 },
  weave: { v: [[0, 1.25, 0], [0, -1.25, 0], ...RING(5, 0.95, 0)],
    e: [[2, 3], [3, 4], [4, 5], [5, 6], [6, 2], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6]], size: 16 },
};
const SHOT = { dash: 7, gap: 2.6, width: 0.8, speed: 0 };
const FIG = { dash: 3.2, gap: 3.4, width: 0.8, speed: 0 };      // lit lines keep the painting's dotted texture, in gold
const _P = [], EDGE = { dash: 1, gap: 0, width: 0.62, speed: 0 };
function solid(b, kind, x, y, ang, tilt, col, k = 1) {
  const S = SOLIDS[kind] ?? SOLIDS.normal, s = S.size * k, ca = Math.cos(ang), sa = Math.sin(ang), cb = Math.cos(tilt), sb = Math.sin(tilt);
  for (let i = 0; i < S.v.length; i++) {
    const [vx, vy, vz] = S.v[i], x1 = vx * ca + vz * sa, z1 = -vx * sa + vz * ca, y2 = vy * cb - z1 * sb, z2 = vy * sb + z1 * cb;
    _P[i] = [x + x1 * s, y - y2 * s, z2];
  }
  for (const [i, j] of S.e) {
    const p = _P[i], q = _P[j], depth = 0.5 + 0.5 * clamp01(((p[2] + q[2]) / 2 + 1) / 2);
    const c = mul(col, depth);
    b.seg(p[0], p[1], q[0], q[1], c, c, EDGE);
  }
}

/** A polyline drawn only up to `len` along it (the rest not yet drawn). */
function partial(b, pts, len, col, style) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], q = pts[i], l = Math.hypot(q[0] - a[0], q[1] - a[1]);
    if (acc + l <= len) { b.seg(a[0], a[1], q[0], q[1], col, col, style, acc); acc += l; continue; }
    const u = (len - acc) / l;
    if (u > 0) b.seg(a[0], a[1], a[0] + (q[0] - a[0]) * u, a[1] + (q[1] - a[1]) * u, col, col, style, acc);
    return [a[0] + (q[0] - a[0]) * u, a[1] + (q[1] - a[1]) * u];
  }
  return pts[pts.length - 1];
}

/** The star, built clean (layout.js): straight segments, exact angles, mirror-symmetric; struts a little dimmer. */
function drawStar(b, star, col) { for (const { pts, k } of star.lines) b.line(pts, mul(col, k)); }

export class ConstellationView {
  constructor(kit) {
    this.kit = kit;
    const { scene } = kit;

    // ---- layer 1: the plate; a fallen star darkens its painted self (and its reflection under the ground) ----
    const plate = new THREE.Texture();
    plate.colorSpace = THREE.NoColorSpace; plate.minFilter = THREE.LinearMipmapLinearFilter; plate.magFilter = THREE.LinearFilter;
    this.ready = new Promise((resolve, reject) => {
      new THREE.ImageLoader().load(PLATE_URL, (img) => { plate.image = img; plate.needsUpdate = true; resolve(); }, undefined, reject);
    });
    const boxes = STARS.map((s) => { const [x0, y0, x1] = s.box; return `vec4(${(x0 - 4).toFixed(1)}, ${(y0 - 8).toFixed(1)}, ${(x1 + 4).toFixed(1)}, ${(GROUND_Y + 3).toFixed(1)})`; });
    const lifeOf = (i) => (i < 4 ? `lifeA[${i}]` : `lifeB[${i - 4}]`);
    this.backdrop = new Backdrop({
      frame: FRAME, map: plate,
      uniforms: { lifeA: { value: new THREE.Vector4(1, 1, 1, 1) }, lifeB: { value: new THREE.Vector4(1, 1, 1, 1) }, plateGain: { value: 1 } },
      shade: /* glsl */`
        vec3 x = -log(max(vec3(1.0) - tex.rgb, vec3(0.03)));      // the painting -> light (the tone map gives it back)
        float k = 1.0;
        float warm = smoothstep(0.03, 0.15, tex.r - tex.b);         // only the painted gold, never the sky behind it
        // under a living star the painted gold is a faint underlay (its clean lines are drawn live over it; the painting's
        // own wobbly struts must not show through); a fallen star's painted self and its reflection go dark
        ${STARS.map((s, i) => `{ vec4 r = ${boxes[i]};
          float inBox = smoothstep(r.x - 10.0, r.x + 4.0, f.x) * (1.0 - smoothstep(r.z - 4.0, r.z + 10.0, f.x))
                      * smoothstep(r.y - 10.0, r.y + 4.0, f.y) * (1.0 - smoothstep(r.w - 1.0, r.w + 3.0, f.y));
          float refl = (1.0 - smoothstep(10.0, 22.0, abs(f.x - ${s.x.toFixed(1)}))) * step(r.w, f.y) * (1.0 - smoothstep(r.w + 60.0, r.w + 120.0, f.y));
          float above = 1.0 - smoothstep(${(s.shape.baseY - 2).toFixed(1)}, ${(s.shape.baseY + 1).toFixed(1)}, f.y);
          k *= 1.0 - warm * max(mix(0.8, 0.6, ${lifeOf(i)}) * inBox * above, 0.8 * (1.0 - ${lifeOf(i)}) * max(inBox, refl)); }`).join('\n        ')}
        return x * k * plateGain;`,
    });
    scene.add(this.backdrop.object);

    // ---- live layers ----
    const T = (o) => kit.track(new GlowLineMaterial(o));
    this.matStars = STARS.map(() => T({ width: 7.5, coreGain: 3.2 }));
    this.sStars = STARS.map((s, i) => { const b = new LineBatch(this.matStars[i], 900); drawStar(b, s, C.gold); b.commit(); b.object.renderOrder = 3; scene.add(b.object); return b; });
    this.matFig = T({ width: 6, coreGain: 3.0 }); this.matDyn = T({ width: 7.5 }); this.matUI = T({ width: 9 });
    this.sFig = new LineBatch(this.matFig, 3000); this.sDyn = new LineBatch(this.matDyn, 6000); this.sUI = new LineBatch(this.matUI, 3000);
    for (const [b, o] of [[this.sFig, 4], [this.sDyn, 12], [this.sUI, 40]]) { b.object.renderOrder = o; scene.add(b.object); }
    this.dots = kit.track(new GlowDots(420));
    this.overlay = new FillBatch(64); this.overlay.object.renderOrder = 30;
    scene.add(this.dots.object, this.overlay.object);
    // the crisp layer (kit.overlay: no persistence): the solids, the rings and the crosshair stay sharp in motion (a flick
    // of the mouse doesn't print a row of crosshairs, a falling solid doesn't smear into a streak); trails, sparks and
    // shards stay in the persistent layer
    this.matCrisp = T({ width: 7 });
    this.sCrisp = new LineBatch(this.matCrisp, 4000); this.crispDots = kit.track(new GlowDots(64));
    this.sCrisp.object.renderOrder = 12; this.crispDots.object.renderOrder = 13;
    (kit.overlay ?? scene).add(this.sCrisp.object, this.crispDots.object);
    this.strokeLen = STROKES.map((s) => s.parts.map(polyLen));
    this._reset();
  }

  _reset() {
    this.life = STARS.map(() => 1); this.glowFire = STARS.map(() => 0); this.templeV = 1;
    this.pips = STARS.map(() => new Array(8).fill(0));
    this.fig = STROKES.map(() => ({ g: 0, prog: 0 }));
    this.fx = []; this.trails = new Map(); this.seen = new Map(); this.gFx = 1; this.banner = null; this.sub = null; this.clearAt = -1;
  }

  /** One frame. sim = the round being shown (the attract demo or the real one). */
  update(sim, dt, t, ui = {}) {
    if (sim !== this._sim) { this._sim = sim; this._reset(); this.kit.resetPersistence?.(); }
    this.matDyn.time = t; this.matFig.time = t;
    this.sCrisp.clear(); this.crispDots.clear();
    this._events(sim, t);
    this._stars(sim, dt, t);
    this._figure(sim, dt, t);
    const b = this.sDyn; b.clear(); this.dots.clear();
    this._pips(b, sim, dt);
    this._shapes(b, sim, t);
    this._shots(b, sim);
    this._bursts(b, sim, dt);
    this._effects(b, t);
    this._crosshair(this.sCrisp, sim, ui);
    b.commit(); this.dots.commit(); this.sCrisp.commit(); this.crispDots.commit();
    this._ui(sim, t, ui);
  }

  // ---------------- events -> effects ----------------
  _events(sim, t) {
    for (const e of sim.events) {
      if (e.kind === 'kill') {
        const r = hash1(e.id * 3.1), n = 8 + Math.floor(r * 4);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + hash1(e.id + i) * 0.8, v = 35 + 75 * hash1(e.id * 7 + i);
          this.fx.push({ k: 'shard', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, rot: a, vr: (hash1(i + e.id) - 0.5) * 5,
            s: 5 + 5 * hash1(e.id * 5 + i), t0: t, dur: 1.0 + 0.45 * hash1(e.id + i * 3) });
        }
        const tr = this.trails.get(e.id);
        if (tr) this.fx.push({ k: 'trail', pts: tr.pts.slice(), t0: t, dur: 0.6 });
        if (e.chain > 0) this.fx.push({ k: 'text', text: 'x' + (e.chain + 1), x: e.x, y: e.y - 34, t0: t, dur: 1.0, c: C.white });
      } else if (e.kind === 'impact') {
        const hot = e.effect === 'base' || e.effect === 'temple';
        this.fx.push({ k: 'ring', x: e.x, y: e.y, t0: t, dur: hot ? 1.1 : 0.8, r0: 10, r1: hot ? 80 : 46, c: mul(C.ember, hot ? 0.55 : 0.35), sy: 0.45 });
        if (e.effect === 'shield') this.fx.push({ k: 'dome', x: STARS[e.star].x, y: GROUND_Y - 4, t0: t, dur: 1.2, r: e.star === TEMPLE ? 95 : 70 });
        if (hot) for (let i = 0; i < 6; i++) this.fx.push({ k: 'ember', x: e.x + (hash1(e.id + i) - 0.5) * 50, y: e.y + (hash1(e.id * 2 + i) - 0.5) * 30,
          vy: 18 + 20 * hash1(i * 9 + e.id), t0: t, dur: 1.4 + 0.6 * hash1(e.id + i * 5) });
        const tr = this.trails.get(e.id);
        if (tr) this.fx.push({ k: 'trail', pts: tr.pts.slice(), t0: t, dur: 0.7 });
      } else if (e.kind === 'waveStart' && e.wave > 0) {
        this.banner = { text: e.wave === TUNE.waves.length - 1 ? 'THE LAST WAVE' : 'WAVE ' + (e.wave + 1), t0: t, dur: 1.9 };
        this.sub = null;
      } else if (e.kind === 'waveClear') {
        if (e.last) { this.clearAt = t; this.banner = null; this.sub = null; continue; }
        this.banner = { text: ['THE PATTERN FORMS', 'THE PATTERN GROWS', 'THE CROWN IS NEXT'][e.wave] ?? 'THE PATTERN GROWS', t0: t, dur: 3.2 };
        this.sub = { text: 'BONUS ' + e.bonus + (e.dark ? '   ' + e.dark + ' LINE' + (e.dark > 1 ? 'S' : '') + ' LOST WITH ' + (e.dark > 1 ? 'THEIR STARS' : 'ITS STAR') : ''), t0: t, dur: 3.2 };
      } else if (e.kind === 'dry') this.fx.push({ k: 'text', text: 'NO SHOTS', x: sim.cross.x, y: sim.cross.y - 30, t0: t, dur: 1.0, c: C.text });
    }
  }

  // ---------------- the stars ----------------
  _stars(sim, dt, t) {
    const a = 1 - Math.exp(-dt / 0.35);
    STARS.forEach((s, i) => {
      const st = sim.stars[i];
      const target = st.alive ? 1 : 0;
      // a falling star goes out over ~0.9 s (never a step); the plate under it dims with it
      this.life[i] += (target - this.life[i]) * (target < this.life[i] ? 1 - Math.exp(-dt / 0.3) : a);
      const fired = sim.time - st.fired, fireGlow = fired >= 0 && fired < 1 ? smooth(0, 0.06, fired) * Math.exp(-fired / 0.3) : 0;
      this.glowFire[i] = fireGlow;
      let g = this.life[i] * (0.82 + 0.03 * Math.sin(t * 0.9 + i * 1.7)) + 0.35 * fireGlow * this.life[i];
      if (s.temple) {
        const hpT = st.alive ? 0.45 + 0.55 * st.hp / st.hpMax : 0;
        this.templeV += (hpT - this.templeV) * (1 - Math.exp(-dt / 0.4));
        g = this.templeV * (0.85 + 0.03 * Math.sin(t * 0.7));
      }
      this.matStars[i].gain = g;
      if (fireGlow > 0.01 && !s.temple) {           // the launch: a small glint on the spire as the arc leaves it
        star(this.sCrisp, s.tip[0], s.tip[1] - 2, 16 * fireGlow, mul([1.4, 0.85, 0.16], fireGlow), 4, 0, EDGE);
        this.crispDots.add(s.tip[0], s.tip[1] - 2, 7, mul([1.2, 0.8, 0.25], fireGlow));
      }
      this.sStars[i].object.visible = g > 0.004;
    });
    const u = this.backdrop.uniforms;
    u.lifeA.value.set(this.life[0], this.life[1], this.life[2], Math.max(0.25, this.templeV));
    u.lifeB.value.set(this.life[4], this.life[5], this.life[6], 1);
  }

  _pips(b, sim, dt) {
    const max = sim.k.ammo, a = 1 - Math.exp(-dt / 0.08);
    for (const i of BASES) {
      const st = sim.stars[i], x0 = STARS[i].x - (max - 1) * 4.5, y = GROUND_Y + 13;
      for (let k = 0; k < max; k++) {
        const want = st.alive && k < st.ammo ? 1 : 0;
        this.pips[i][k] += (want - this.pips[i][k]) * a;
        const v = this.pips[i][k] * this.life[i];
        if (v < 0.02) continue;
        const x = x0 + k * 9, c = mul(C.gold, 1.1 * v), s = 2.6;
        b.loop([[x, y - s], [x + s, y], [x, y + s], [x - s, y]], c, { width: 0.75 });
      }
    }
  }

  // ---------------- the figure in the sky ----------------
  _figure(sim, dt, t) {
    const f = this.sFig; f.clear();
    const now = sim.time;
    STROKES.forEach((S, si) => {
      const s = sim.strokes[si], v = this.fig[si], L = this.strokeLen[si], Lmax = Math.max(...L);
      const drawDur = 0.25 + Lmax / 700;
      if (s.lit) {
        const since = now - s.at;
        if (since < 0) {                                   // the spark rises from its star to where the line begins
          const u = smooth(-0.35, 0, since);
          if (since > -0.35) {
            const from = STARS[S.tie].tip, to = S.parts[0][0];
            const x = from[0] + (to[0] - from[0]) * u, y = from[1] + (to[1] - from[1]) * u;
            this.dots.add(x, y, 6, mul([1.2, 0.7, 0.15], 0.9));
            const bx = from[0] + (to[0] - from[0]) * Math.max(0, u - 0.18), by = from[1] + (to[1] - from[1]) * Math.max(0, u - 0.18);
            f.seg(bx, by, x, y, [0, 0, 0], mul(C.fig, 0.9));
          }
          v.prog = 0; v.g = 0;
        } else {
          v.prog = clamp01(since / drawDur);
          const swell = 0.28 * (1 - smooth(drawDur, drawDur + 0.9, since)) * smooth(0, 0.2, since);
          v.g = (0.92 + 0.04 * Math.sin(t * 0.8 + si * 0.9)) * (1 + swell);
        }
      } else if (s.broken) {
        v.g = Math.max(0, v.g - dt / 1.0); v.prog = 1;
      } else { v.g = 0; v.prog = 0; }
      if (v.g <= 0.003 || v.prog <= 0) return;
      const col = mul(C.fig, 0.8 * v.g);
      if (S.glint) {
        const [gx, gy] = S.glint, len = 18 * smooth(0, 1, v.prog);
        star(f, gx, gy, len, mul([1.4, 0.8, 0.12], v.g), 4, 0);
        this.dots.add(gx, gy, 9, mul([0.6, 0.35, 0.06], v.g));
        return;
      }
      S.parts.forEach((pts, pi) => {
        const head = partial(f, pts, v.prog * L[pi], col, FIG);
        if (v.prog < 1 && s.lit) this.dots.add(head[0], head[1], 5, mul([1.2, 0.7, 0.15], 0.8));
      });
    });
    f.commit();
  }

  // ---------------- the shapes ----------------
  _shapes(b, sim, t) {
    const live = new Set(), now = sim.time;
    for (const s of sim.shapes) {
      live.add(s.id);
      let tr = this.trails.get(s.id);
      if (!tr) { tr = { mt: new MotionTrail(60, 10), pts: [] }; this.trails.set(s.id, tr); }
      const dying = s.dying >= 0 ? clamp01((now - s.dying) / 0.9) : 0;
      const alpha = smooth(0, 0.35, now - s.born) * (1 - dying);
      if (alpha < 0.01) continue;
      // the dotted trail back up the path (straight shapes: to where it came in; weavers: the path they swung)
      if (s.amp > 0) { tr.mt.push(s.x, s.y); tr.pts = tr.mt.points; } else tr.pts = [[s.x, s.y], [s.ox, s.oy]];
      if (tr.pts.length > 1) b.line(tr.pts, mul(C.red, 1.0 * alpha), { dash: 2.6, gap: 6.5, width: 0.9 }, mul(C.red, 0.1 * alpha));
      const ang = s.spin + s.spinRate * (now - s.born);
      solid(this.sCrisp, s.kind, s.x, s.y, ang, s.tilt, mul(C.red, alpha), 1.2);
      this.dots.add(s.x, s.y, 24, mul([0.1, 0.006, 0.002], alpha));
    }
    for (const id of this.trails.keys()) if (!live.has(id)) this.trails.delete(id);
  }

  // ---------------- the counter-shots ----------------
  _shots(b, sim) {
    for (const s of sim.shots) {
      const pts = s.path.pts, trail = [];
      for (let i = 0; i < pts.length && s.path.cum[i] < s.d; i++) trail.push(pts[i]);
      trail.push([s.x, s.y]);
      trail.reverse();
      if (trail.length > 1) b.line(trail, mul(C.shot, 1.35), SHOT, mul(C.shot, 0.4));
      if (trail.length > 1) {                     // a small arrowhead, as the concept draws the heads
        const [hx, hy] = trail[0], q = trail[1], a = Math.atan2(hy - q[1], hx - q[0]), h = 9, c = mul(C.shot, 1.3);
        for (const side of [-1, 1]) this.sCrisp.seg(hx, hy, hx - Math.cos(a + side * 0.5) * h, hy - Math.sin(a + side * 0.5) * h, c, c, EDGE);
      }
      this.dots.add(s.x, s.y, 7, [1.2, 0.85, 0.3]);
      this.dots.add(s.x, s.y, 16, [0.2, 0.12, 0.03]);
      const m = 6, c = mul(C.cross, 0.8);          // the target's x
      this.sCrisp.seg(s.tx - m, s.ty - m, s.tx + m, s.ty + m, c, c, EDGE);
      this.sCrisp.seg(s.tx - m, s.ty + m, s.tx + m, s.ty - m, c, c, EDGE);
    }
  }

  // ---------------- the rings ----------------
  _bursts(b, sim, dt) {
    // the light budget: rings ease in, hold, and fade; together they never exceed ~2.5 full rings, and the cap itself
    // eases (so a crowd of bursts dims gently instead of stepping)
    const env = (x) => smooth(0, 0.1, x.t) * (x.t < x.grow + x.hold ? 1 : 1 - smooth(0, x.fade, x.t - x.grow - x.hold));
    let E = 0;
    for (const x of sim.bursts) E += env(x) * (x.r / TUNE.burst.r);
    const want = Math.min(1, 2.5 / Math.max(E, 1e-3));
    this.gFx += (want - this.gFx) * (1 - Math.exp(-dt / (want < this.gFx ? 0.08 : 0.3)));
    for (const x of sim.bursts) {
      const e = env(x) * this.gFx;
      if (x.path && x.t < 0.8) {                          // the arc that brought it, fading
        const k = 1 - smooth(0, 0.8, x.t);
        b.line([...x.path.pts].reverse(), mul(C.shot, 1.35 * k), SHOT, mul(C.shot, 0.4 * k));
      }
      if (e < 0.004) continue;
      const fadeU = x.t > x.grow + x.hold ? (x.t - x.grow - x.hold) / x.fade : 0;
      const r = Math.max(2, x.r * (1 + 0.12 * fadeU)), main = x.chain > 0 ? 0.7 : 1, c = this.sCrisp;
      c.loop(ellipse(x.x, x.y, r, r, 56).slice(0, 56), mul(C.ring, 0.95 * e * main), EDGE);
      // the heart: a hot glint that shrinks as the ring grows (the concept's starburst), and a soft light
      const heart = e * (1 - 0.65 * clamp01(x.t / (x.grow + x.hold)));
      star(c, x.x, x.y, (x.chain === 0 ? 32 : 18) * (0.6 + 0.4 * heart), mul([1.4, 0.85, 0.14], heart), 4, 0.4, EDGE);
      this.crispDots.add(x.x, x.y, x.chain === 0 ? 15 : 9, mul([1.35, 0.9, 0.35], heart));
      this.dots.add(x.x, x.y, x.chain === 0 ? 34 : 20, mul([0.45, 0.24, 0.05], heart));
      this.dots.add(x.x, x.y, r * 0.9, mul([0.2, 0.12, 0.028], e));
      // the spark cloud: gold grains that sit still and catch light as the ring sweeps past them (no smear)
      const n = x.chain === 0 ? 38 : 14;
      for (let i = 0; i < n; i++) {
        const a = hash1(x.id * 13 + i) * Math.PI * 2, rr = x.rmax * (0.15 + 1.0 * Math.sqrt(hash1(x.id * 7 + i)));
        const lit = smooth(rr - 6, rr + 2, r), k = e * lit * (0.45 + 0.55 * hash1(i + x.id));
        if (k < 0.01) continue;
        const px = x.x + Math.cos(a) * rr, py = x.y + Math.sin(a) * rr;
        if (i % 2 === 0) { const g = 2.0, cc = mul(C.grain, k); b.loop([[px - g, py - g], [px + g, py - g], [px + g, py + g], [px - g, py + g]], cc, EDGE); }
        else this.dots.add(px, py, 2.2 + 1.3 * hash1(i * 3 + x.id), mul([1.3, 0.8, 0.2], k));
      }
    }
  }

  _effects(b, t) {
    this.fx = this.fx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.fx) {
      const u = (t - e.t0) / e.dur, fade = 1 - smooth(0, 1, u);
      if (e.k === 'shard') {
        const age = t - e.t0, x = e.x + e.vx * age, y = e.y + e.vy * age + 30 * age * age, a = e.rot + e.vr * age, s = e.s * (1 - 0.4 * u);
        const col = [C.red[0] * fade, (C.red[1] + 0.25 * u) * fade, C.red[2] * fade];
        b.loop([[x + Math.cos(a) * s, y + Math.sin(a) * s], [x + Math.cos(a + 2.2) * s * 0.8, y + Math.sin(a + 2.2) * s * 0.8],
          [x + Math.cos(a + 4.1) * s * 0.7, y + Math.sin(a + 4.1) * s * 0.7]], col, { width: 0.8 });
      } else if (e.k === 'trail') {
        if (e.pts.length > 1) b.line(e.pts, mul(C.red, 1.0 * fade), { dash: 2.6, gap: 6.5, width: 0.9 }, mul(C.red, 0.1 * fade));
      } else if (e.k === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * Math.sqrt(u);
        b.loop(ellipse(e.x, e.y, r, r * (e.sy ?? 1), 48).slice(0, 48), mul(e.c, fade * smooth(0, 0.1, u * e.dur)));
      } else if (e.k === 'dome') {
        const pts = []; for (let i = 0; i <= 32; i++) { const a = Math.PI + i / 32 * Math.PI; pts.push([e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r * 0.8]); }
        b.line(pts, mul(C.gold, 0.9 * fade * smooth(0, 0.12, u * e.dur)));
      } else if (e.k === 'ember') {
        const age = t - e.t0;
        this.dots.add(e.x, e.y + e.vy * age, 3, mul([0.9, 0.22, 0.02], fade));
      } else if (e.k === 'text') drawText(b, e.text, e.x, e.y - u * 24, { h: 14, color: mul(e.c, fade * smooth(0, 0.1, u * e.dur)) });
    }
  }

  _crosshair(b, sim, ui) {
    if (sim.phase === 'card') return;
    let ammo = 0; for (const i of BASES) if (sim.stars[i].alive) ammo += sim.stars[i].ammo;
    const k = (sim.phase === 'wave' ? (ammo > 0 ? 0.95 : 0.4) : 0.55) * (ui.mode === 'attract' ? 0.7 : 1);
    const { x, y } = sim.cross, c = mul(C.cross, k), r = 11;
    b.loop(ellipse(x, y, r, r, 28).slice(0, 28), c, { width: 0.75 });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.seg(x + dx * (r + 4), y + dy * (r + 4), x + dx * (r + 11), y + dy * (r + 11), c, c, { width: 0.75 });
    this.crispDots.add(x, y, 2.2, mul([1.2, 0.8, 0.2], k));
  }

  // ---------------- score, waves, banners, cards ----------------
  _ui(sim, t, ui) {
    const s = this.sUI; s.clear();
    const o = this.overlay; o.clear();
    drawDigits(s, String(sim.score), 116, 56, { h: 26, w: 18, pitch: 25, slant: 0.1, gap: 1.6, hollow: false, color: mul(C.score, 1.4),
      style: { dash: 1, gap: 0, width: 1.2 } });
    // the waves, top right: cleared = gold, the one being fought = bright, the rest = dim
    const W = TUNE.waves.length;
    for (let i = 0; i < W; i++) {
      const x = 1112 + i * 24, y = 68, cleared = i < sim.stats.wavesCleared, cur = i === sim.wave && sim.phase === 'wave';
      const c = mul(C.score, cleared ? 1.1 : cur ? 1.3 : 0.35), sz = 7;
      s.loop([[x, y - sz], [x + sz * 0.7, y], [x, y + sz], [x - sz * 0.7, y]], c);
      if (cleared) s.seg(x, y - sz * 0.45, x, y + sz * 0.45, c, c);
    }
    const band = (y0, y1, a) => {           // a soft dark band behind card text (the figure stays visible above and below)
      if (a <= 0.001) return;
      const steps = [[0, 0.35], [14, 0.65], [28, 1]];
      for (const [d, k] of steps) o.poly([[0, y0 + d], [FRAME[0], y0 + d], [FRAME[0], y1 - d], [0, y1 - d]], [0, 0, 0, a * k * 0.42]);
    };
    const cx = FRAME[0] / 2;
    if (this.banner && t - this.banner.t0 < this.banner.dur) {
      const u = (t - this.banner.t0) / this.banner.dur, a = smooth(0, 0.12, u) * (1 - smooth(0.78, 1, u));
      drawText(s, this.banner.text, cx, 250, { h: 24, color: mul(C.white, a), track: 1 });
      if (this.sub && t - this.sub.t0 < this.sub.dur) drawText(s, this.sub.text, cx, 300, { h: 14, color: mul(C.text, 0.9 * a), track: 1 });
    }
    if (ui.mode === 'attract') {
      band(170, 720, 1.0);
      const breathe = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
      drawText(s, 'CONSTELLATION', cx, 220, { h: 60, color: mul(C.text, 1.3), track: 2 });
      drawText(s, 'SAVE THE PATTERN', cx, 318, { h: 20, color: mul(C.text, 0.9), track: 2 });
      drawText(s, this.inCabinet ? (this.cabinetStart ?? 'INSERT COIN') : 'PRESS START', cx, 420, { h: 24, color: mul(C.white, breathe), track: 2 });
      drawText(s, 'MOUSE OR ARROWS  AIM', cx, 510, { h: 14, color: mul(C.text, 0.75), track: 1 });
      drawText(s, 'CLICK OR SPACE  FIRE FROM THE NEAREST BASE', cx, 540, { h: 14, color: mul(C.text, 0.75), track: 1 });
      drawText(s, 'A  S  D   FIRE FROM THE LEFT · MIDDLE · RIGHT', cx, 570, { h: 14, color: mul(C.text, 0.75), track: 1 });
      drawText(s, 'HI ' + ui.hi + (ui.last ? '   LAST ' + ui.last : ''), cx, 650, { h: 16, color: mul(C.score, 0.9), track: 2 });
    } else if (sim.phase === 'ready') {
      const a = smooth(0, 0.3, sim.phaseTime) * (1 - smooth(TUNE.ready - 0.45, TUNE.ready, sim.phaseTime));
      band(210, 400, a);
      drawText(s, 'PROTECT THE TEMPLE', cx, 240, { h: 28, color: mul(C.white, a), track: 2 });
      drawText(s, 'LIGHT THE SKY', cx, 300, { h: 20, color: mul(C.text, a), track: 2 });
      drawText(s, 'EVERY WAVE YOU CLEAR DRAWS MORE OF THE PATTERN', cx, 350, { h: 12, color: mul(C.text, 0.8 * a), track: 1 });
    } else if (sim.phase === 'card') {
      const won = sim.result === 2, delay = won ? 1.8 : 0.5;
      const a = smooth(delay, delay + 0.7, sim.phaseTime);
      band(430, 640, a);
      const lit = sim.litCount, stars = sim.basesAlive;
      drawText(s, won ? 'THE PATTERN HOLDS' : sim.why === 'temple' ? 'THE TEMPLE FELL' : 'THE STARS WENT OUT', cx, 460, { h: 40, color: mul(won ? C.white : C.text, a), track: 2 });
      drawText(s, won ? stars + ' OF 6 STARS · ' + lit + ' OF ' + STROKES.length + ' LINES LIT' : 'THE PATTERN BREAKS', cx, 540, { h: 16, color: mul(C.text, 0.9 * a), track: 1 });
      drawText(s, 'SCORE ' + sim.score, cx, 585, { h: 22, color: mul(C.score, a), track: 2 });
    }
    s.commit(); o.commit();
  }
}
