// THE NODE · THE CONSTELLATION (cabinet level 2) · THE ROUND (ICabinetSim). Deterministic, headless, no DOM, no three.js.
//
// Missile Command, reshaped. Red faceted shapes fall on angled paths at the seven stars on the ground: six gold BASES and
// the TEMPLE between them. A crosshair moves over the sky (a pointer, like a trackball, or the stick); FIRE sends a gold
// counter-shot arcing from the nearest living base with shots left (or from the LEFT / MIDDLE / RIGHT pair, the three
// silos) to the crosshair, where it bursts into a ring that grows, holds, and fades; a shape the ring touches shatters
// and bursts small in turn (chains). Each base has TUNE.ammo shots a wave. A base hit goes dark; the temple takes
// TUNE.templeHp hits. Four waves with a breath between (the bases reload). Every wave cleared lights part of the sacred
// figure in the sky in gold, a line or arc at a time; each line hangs from one star and can't light while that star is
// dark (a lit one breaks when its star falls). Clear the fourth wave and the crown lights: THE PATTERN HOLDS (CLEAR).
// LOST: the temple falls, or every base goes dark.
//
//   reset(seed, credit, knobs)   step(dt, pad)    pad = ConstellationPad (latched by the host)
//   state result score lives cues summary     collectStats(into)
//   read-only for views and bots: cross, stars, shapes, shots, bursts, strokes, wave, waveTime, levelTime, phase,
//   phaseTime, time, why, events (this step's: { kind, ... }), k (the resolved knobs)
//
// FIXED TICK: step(dt) runs whole 1/60 s ticks, so a round plays the same at any frame rate; a FIRE press between ticks
// is held until the next tick. Every die comes from the round's own SystemRandom (seed).
import { CabinetState, RoundResult, SoundCue, CueBuffer, CreditInfo, KnobValues, SystemRandom } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { STARS, BASES, GROUPS, TEMPLE, STROKES, WAVE_STROKES, SKY, SPAWN, aimPoint } from './layout.js';

const T = TUNE, STEP = T.step;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clamp01 = (x) => clamp(x, 0, 1);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };

/** The panel: a stick, a pointer (absolute, frame coords; NaN = none), FIRE (a, or b) and the three silo buttons
 *  (l, m, r), START. Held states; latch() keeps this step and the last, so pressed() is an edge. */
export class ConstellationPad {
  constructor() { this.cur = ConstellationPad.frame(); this.prev = ConstellationPad.frame(); }
  static frame(o = {}) {
    return { x: +o.x || 0, y: +o.y || 0, px: Number.isFinite(o.px) ? +o.px : NaN, py: Number.isFinite(o.py) ? +o.py : NaN,
      a: !!o.a, b: !!o.b, l: !!o.l, m: !!o.m, r: !!o.r, start: !!o.start };
  }
  latch(o) { this.prev = this.cur; this.cur = ConstellationPad.frame(o || {}); }
  clear() { this.cur = ConstellationPad.frame(); this.prev = ConstellationPad.frame(); }
  get x() { return this.cur.x; }
  get y() { return this.cur.y; }
  get pointer() { return Number.isFinite(this.cur.px) && Number.isFinite(this.cur.py) ? [this.cur.px, this.cur.py] : null; }
  held(k) { return this.cur[k]; }
  pressed(k) { return this.cur[k] && !this.prev[k]; }
}

/** The counter-shot's arc from a base's spire to the target: a quadratic curve that leaves steep and bends over to it
 *  (as the concept paints them), sampled for constant speed. Returns { pts, cum, L }. */
export function arcPath(x0, y0, tx, ty, n = 20) {
  const dx = tx - x0, dy = ty - y0;
  const cx = x0 + dx * 0.14, cy = y0 + dy * 0.8;
  const pts = [], cum = [0];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * x0 + 2 * u * t * cx + t * t * tx, u * u * y0 + 2 * u * t * cy + t * t * ty]);
    if (i > 0) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, cum, L: cum[n] };
}
/** The point `d` along an arcPath. */
export function arcAt(path, d) {
  const { pts, cum } = path, n = pts.length - 1;
  if (d <= 0) return pts[0];
  if (d >= cum[n]) return pts[n];
  let i = 1; while (cum[i] < d) i++;
  const u = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), a = pts[i - 1], b = pts[i];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
/** Where a shape is `d` along its path (a weaver swings side to side, easing in after it enters and out before it lands). */
export function shapeAt(s, d) {
  const u = Math.min(Math.max(d, 0), s.dist);
  let x = s.ox + s.ux * u, y = s.oy + s.uy * u;
  if (s.amp > 0) {
    const env = smooth(u / 90) * smooth((s.dist - u) / 140);
    const off = s.amp * Math.sin((u / s.speed) / s.per * Math.PI * 2 + s.ph) * env;
    x += -s.uy * off; y += s.ux * off;
  }
  return [x, y];
}
/** Where a shape will be `dt` seconds from now (what a player reads off its path; bots use it to lead). */
export function predictShape(s, dt) { return shapeAt(s, s.d + s.speed * dt); }

export class ConstellationRound {
  constructor() { this._cues = new CueBuffer(); this.reset(1, new CreditInfo(), new KnobValues()); }

  reset(seed, credit, knobs) {
    this.seed = seed || 1;
    this.rng = new SystemRandom(this.seed);
    this.credit = credit || new CreditInfo();
    const k = knobs || new KnobValues();
    this.k = { speed: k.get('speed', 1), count: k.get('count', 1), ammo: Math.round(k.get('ammo', T.ammo)),
      temple: Math.round(k.get('temple', T.templeHp)), shield: k.get('shield', 0) };
    if (this.credit.unlosable) this.k.shield = 1;
    this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0;
    this._result = RoundResult.None; this._cues.resetTotals();
    this.time = 0; this.levelTime = 0; this.wave = 0; this.waveTime = 0; this.why = '';
    this.score = 0; this.nextId = 1;
    this.stars = STARS.map((s) => ({ alive: true, hp: s.temple ? this.k.temple : 1, hpMax: s.temple ? this.k.temple : 1,
      ammo: s.temple ? 0 : this.k.ammo, fired: -9, diedAt: -9, hitAt: -9, shieldAt: -9 }));
    this.cross = { x: 633, y: 400, vx: 0, vy: 0 };
    this.shapes = []; this.shots = []; this.bursts = [];
    this.strokes = STROKES.map(() => ({ lit: false, at: -9, broken: false, brokeAt: -9 }));
    this.events = []; this._acc = 0; this._fire = []; this._schedule = []; this._reloadT = 0;
    this.stats = { kills: 0, chainKills: 0, bestChain: 0, shots: 0, impacts: 0, basesLost: 0, templeHits: 0, dry: 0,
      shielded: 0, lit: 0, broke: 0, splits: 0, spawned: 0, wavesCleared: 0, waveTimes: [] };
  }

  // ---- ICabinetSim ----
  get state() { return this._state; }
  get result() { return this._result; }
  get lives() { return this._state === CabinetState.Over || this._state === CabinetState.Card ? 0 : 1; }
  get cues() { return this._cues; }
  get basesAlive() { let n = 0; for (const i of BASES) if (this.stars[i].alive) n++; return n; }
  get litCount() { let n = 0; for (const s of this.strokes) if (s.lit) n++; return n; }
  get summary() {
    const t = this.stars[TEMPLE];
    return `wave ${this.wave + 1} score ${this.score} t ${this.levelTime.toFixed(1)} bases ${this.basesAlive} temple ${t.alive ? t.hp : 0} ` +
      `kills ${this.stats.kills} shots ${this.stats.shots} lit ${this.litCount} ` +
      `${this._result === RoundResult.Won ? 'CLEAR' : this._result === RoundResult.Lost ? 'LOST (' + this.why + ')' : ''}`;
  }
  collectStats(into) {
    const add = (n, v) => { into[n] = (into[n] || 0) + v; };
    add('seconds', this.levelTime); add('kills', this.stats.kills); add('shots', this.stats.shots);
    add('basesLeft', this.basesAlive); add('lit', this.litCount); add('waves', this.stats.wavesCleared);
  }

  step(dt, pad) {
    this.events.length = 0;
    this._cues.clear();
    if (pad && pad.pressed) {
      if (pad.pressed('a') || pad.pressed('b')) this._fire.push(-1);
      if (pad.pressed('l')) this._fire.push(0);
      if (pad.pressed('m')) this._fire.push(1);
      if (pad.pressed('r')) this._fire.push(2);
    }
    this._acc += clamp(dt, 0, 0.25);
    while (this._acc >= STEP) { this._acc -= STEP; this._tick(pad); }
  }

  // ---- one tick ----
  _tick(pad) {
    const dt = STEP;
    this.time += dt; this.phaseTime += dt;
    if (this._state === CabinetState.Card) {
      this._shots(dt); this._bursts(dt, false);
      for (let i = this.shapes.length - 1; i >= 0; i--) if (this.time - this.shapes[i].dying > 1.0) this.shapes.splice(i, 1);
      if (this.phaseTime >= (this._result === RoundResult.Won ? T.card.won : T.card.lost)) this._state = CabinetState.Over;
      return;
    }
    if (this._state === CabinetState.Over) return;
    this._cross(dt, pad);
    if (this._state === CabinetState.Intro) {
      this._fire.length = 0;
      if (this.phaseTime >= T.ready) this._startWave(0);
      return;
    }
    this.levelTime += dt;
    if (this._state === CabinetState.Interlude) {
      this._fire.length = 0;
      this._shots(dt); this._bursts(dt, true);
      this._reload(dt);
      if (this.phaseTime >= T.breath) this._startWave(this.wave + 1);
      return;
    }
    // THE WAVE
    this.waveTime += dt;
    for (const g of this._fire) this._shoot(g);
    this._fire.length = 0;
    while (this._schedule.length && this._schedule[0].at <= this.waveTime) this._spawn(this._schedule.shift().kind);
    this._shots(dt);
    this._shapes(dt);
    if (this._state !== CabinetState.Playing) return;
    this._bursts(dt, true);
    if (this._state !== CabinetState.Playing) return;
    if (this._schedule.length === 0 && this.shapes.length === 0) this._clearWave();
  }

  _cross(dt, pad) {
    const c = this.cross, p = pad && pad.pointer;
    if (p) { c.x = clamp(p[0], SKY.x0, SKY.x1); c.y = clamp(p[1], SKY.y0, SKY.y1); c.vx = 0; c.vy = 0; return; }
    let ix = pad ? pad.x : 0, iy = pad ? -pad.y : 0;                 // stick +y is UP; the sky's y is down
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const a = 1 - Math.exp(-T.crosshair.accel * dt);
    c.vx += (ix * T.crosshair.speed - c.vx) * a; c.vy += (iy * T.crosshair.speed - c.vy) * a;
    c.x = clamp(c.x + c.vx * dt, SKY.x0, SKY.x1); c.y = clamp(c.y + c.vy * dt, SKY.y0, SKY.y1);
  }

  // ---- waves ----
  _startWave(w) {
    this.wave = w; this.waveTime = 0;
    this._state = CabinetState.Playing; this.phase = 'wave'; this.phaseTime = 0;
    const W = T.waves[w], rng = this.rng;
    const n = Math.max(3, Math.round(W.n * this.k.count));
    const kinds = new Array(n).fill('normal');
    const place = (kind, count) => {       // special kinds never in the first salvo
      for (let c = 0; c < count; c++) for (let tries = 0; tries < 30; tries++) {
        const i = 2 + rng.next(Math.max(1, n - 2));
        if (i < n && kinds[i] === 'normal') { kinds[i] = kind; break; }
      }
    };
    place('split', W.split); place('fast', W.fast); place('weave', W.weave);
    this._schedule.length = 0;
    const salvos = [];
    for (let left = n; left > 0;) { const k = Math.min(left, W.salvo[0] + rng.next(W.salvo[1] - W.salvo[0] + 1)); salvos.push(k); left -= k; }
    const gap = salvos.length > 1 ? W.span / (salvos.length - 1) : 0;
    let i = 0;
    salvos.forEach((k, j) => {
      const t = T.firstSpawn + j * gap + (j > 0 && j < salvos.length - 1 ? (rng.nextDouble() - 0.5) * 0.5 * gap : 0);
      for (let q = 0; q < k; q++) this._schedule.push({ at: t + q * 0.18, kind: kinds[i++] });
    });
    this._schedule.sort((a, b) => a.at - b.at);
    this.events.push({ kind: 'waveStart', wave: w, n });
    this._cues.emit(SoundCue.Start);
  }

  _clearWave() {
    const w = this.wave;
    let shotsLeft = 0; for (const i of BASES) if (this.stars[i].alive) shotsLeft += this.stars[i].ammo;
    const bases = this.basesAlive, S = T.score;
    const bonus = (shotsLeft * S.shotLeft + bases * S.base + (this.stars[TEMPLE].alive ? S.temple : 0)) * (w + 1);
    this.score += bonus; this.stats.wavesCleared++; this.stats.waveTimes.push(+this.waveTime.toFixed(2));
    let k = 0, dark = 0;
    for (const si of WAVE_STROKES[w]) {
      const st = STROKES[si];
      if (this.stars[st.tie].alive) {
        const s = this.strokes[si]; s.lit = true; s.broken = false; s.at = this.time + 0.35 + k * 0.24; k++;
        this.events.push({ kind: 'light', stroke: si, at: s.at });
      } else dark++;
    }
    this.stats.lit += k;
    this.events.push({ kind: 'waveClear', wave: w, bonus, shotsLeft, bases, lit: k, dark, last: w === T.waves.length - 1 });
    this._cues.emit(SoundCue.Bonus);
    if (w === T.waves.length - 1) return this._end(RoundResult.Won, 'clear');
    this._state = CabinetState.Interlude; this.phase = 'breath'; this.phaseTime = 0; this._reloadT = 0;
  }

  _reload(dt) {
    if (this.phaseTime < T.reloadAt) return;
    this._reloadT -= dt;
    if (this._reloadT > 0) return;
    let best = -1;
    for (const i of BASES) { const s = this.stars[i]; if (s.alive && s.ammo < this.k.ammo && (best < 0 || s.ammo < this.stars[best].ammo)) best = i; }
    if (best < 0) return;
    this.stars[best].ammo++; this._reloadT = 0.055;
    this.events.push({ kind: 'reload', star: best });
    this._cues.emit(SoundCue.Tick);
  }

  _end(result, why) {
    this._result = result; this._state = CabinetState.Card; this.phase = 'card'; this.phaseTime = 0; this.why = why;
    for (const s of this.shapes) if (!(s.dying >= 0)) s.dying = this.time;
    this._schedule.length = 0;
    if (result === RoundResult.Won) {
      this.score += T.score.clear + this.litCount * T.score.stroke;
      this._cues.emit(SoundCue.Win); this.events.push({ kind: 'clear', lit: this.litCount });
    } else { this._cues.emit(SoundCue.Die); this.events.push({ kind: 'out', why }); }
  }

  // ---- the shapes ----
  _pickTarget(exclude) {
    const w = [];
    let sumB = 0;
    for (const i of BASES) {
      const v = exclude && exclude.includes(i) ? 0 : this.stars[i].alive ? 1 : T.target.deadBase;
      w.push([i, v]); sumB += v;
    }
    if (this.stars[TEMPLE].alive && !(exclude && exclude.includes(TEMPLE))) w.push([TEMPLE, sumB * T.target.temple / (1 - T.target.temple)]);
    let tot = 0; for (const [, v] of w) tot += v;
    let r = this.rng.nextDouble() * tot;
    for (const [i, v] of w) { r -= v; if (r < 0) return i; }
    return w[w.length - 1][0];
  }

  _spawn(kind, from = null, speed0 = 0, exclude = null) {
    const rng = this.rng, W = T.waves[this.wave];
    const target = this._pickTarget(exclude);
    const [ax, ay] = aimPoint(STARS[target], (rng.nextDouble() - 0.5) * 18);
    const ox = from ? from[0] : lerp(SPAWN.x0, SPAWN.x1, rng.nextDouble()), oy = from ? from[1] : SPAWN.y;
    let speed = speed0 || lerp(W.speed[0], W.speed[1], rng.nextDouble()) * this.k.speed;
    if (kind === 'fast') speed *= T.fastMul;
    const dx = ax - ox, dy = ay - oy, dist = Math.hypot(dx, dy) || 1;
    const s = { id: this.nextId++, kind, target, ox, oy, ax, ay, ux: dx / dist, uy: dy / dist, speed, dist, d: 0, x: ox, y: oy,
      splitY: kind === 'split' ? lerp(T.split.y[0], T.split.y[1], rng.nextDouble()) : 0,
      amp: kind === 'weave' ? lerp(T.weave.amp[0], T.weave.amp[1], rng.nextDouble()) : 0,
      per: lerp(T.weave.period[0], T.weave.period[1], rng.nextDouble()), ph: rng.nextDouble() * Math.PI * 2,
      spin: rng.nextDouble() * Math.PI * 2, spinRate: (0.35 + 0.35 * rng.nextDouble()) * (rng.nextDouble() < 0.5 ? -1 : 1),
      tilt: 0.35 + 0.3 * rng.nextDouble(), born: this.time, dying: -1,
      r: kind === 'kid' ? T.shape.rKid : T.shape.r };
    this.shapes.push(s); this.stats.spawned++;
    this.events.push({ kind: 'spawn', id: s.id, shape: kind });
    return s;
  }

  _shapes(dt) {
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      s.d += s.speed * dt;
      [s.x, s.y] = shapeAt(s, s.d);
      if (s.kind === 'split' && s.y >= s.splitY) {
        this.shapes.splice(i, 1); this.stats.splits++;
        const used = [];
        for (let k = 0; k < T.split.kids; k++) {
          const kid = this._spawn('kid', [s.x, s.y], s.speed * T.split.speedMul, used.length < 6 ? used : null);
          used.push(kid.target);
        }
        this.events.push({ kind: 'split', x: s.x, y: s.y, id: s.id });
        continue;
      }
      if (s.d >= s.dist) {
        this.shapes.splice(i, 1);
        this._impact(s);
        if (this._state !== CabinetState.Playing) return;
      }
    }
  }

  _impact(s) {
    const i = s.target, st = this.stars[i], star = STARS[i];
    this.stats.impacts++;
    let effect = 'ground';
    if (st.alive) {
      if (star.temple) {
        if (this.k.shield > 0 && st.hp <= 1) { effect = 'shield'; st.shieldAt = this.time; this.stats.shielded++; }
        else {
          st.hp--; st.hitAt = this.time; this.stats.templeHits++; effect = 'temple';
          if (st.hp <= 0) { st.alive = false; st.diedAt = this.time; this._breakTied(i); }
        }
      } else if (this.k.shield > 0 && this.basesAlive <= 1) { effect = 'shield'; st.shieldAt = this.time; this.stats.shielded++; }
      else {
        st.alive = false; st.ammo = 0; st.diedAt = this.time; this.stats.basesLost++; effect = 'base';
        this._breakTied(i);
      }
    }
    this.events.push({ kind: 'impact', x: s.x, y: s.y, star: i, effect, id: s.id });
    this._cues.emit(SoundCue.Miss);
    if (!this.stars[TEMPLE].alive) return this._end(RoundResult.Lost, 'temple');
    if (this.basesAlive === 0) return this._end(RoundResult.Lost, 'dark');
  }

  _breakTied(i) {
    STROKES.forEach((st, si) => {
      const s = this.strokes[si];
      if (st.tie === i && s.lit) { s.lit = false; s.broken = true; s.brokeAt = this.time; this.stats.broke++; this.events.push({ kind: 'break', stroke: si }); }
    });
  }

  // ---- the counter-shots ----
  _shoot(g) {
    const c = this.cross;
    if (this.shots.length >= T.shot.maxLive) return;
    let best = -1, bd = 1e18;
    for (const i of (g < 0 ? BASES : GROUPS[g])) {
      const s = this.stars[i];
      if (!s.alive || s.ammo <= 0) continue;
      const tip = STARS[i].tip, d = (tip[0] - c.x) ** 2 + (tip[1] - c.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { this.stats.dry++; this.events.push({ kind: 'dry', group: g }); this._cues.emit(SoundCue.Miss); return; }
    const st = this.stars[best], tip = STARS[best].tip;
    st.ammo--; st.fired = this.time; this.stats.shots++;
    const path = arcPath(tip[0], tip[1], c.x, c.y);
    this.shots.push({ id: this.nextId++, base: best, tx: c.x, ty: c.y, path, d: 0, dur: path.L / T.shot.speed, t: 0,
      x: tip[0], y: tip[1], born: this.time });
    this.events.push({ kind: 'fire', base: best, tx: c.x, ty: c.y });
  }

  _shots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt; s.d = Math.min(s.path.L, s.d + T.shot.speed * dt);
      [s.x, s.y] = arcAt(s.path, s.d);
      if (s.t >= s.dur) { this.shots.splice(i, 1); this._burst(s.tx, s.ty, 0, s); }
    }
  }

  _burst(x, y, chain, shot = null) {
    const B = chain > 0 ? T.chain : T.burst;
    this.bursts.push({ id: this.nextId++, x, y, chain, rmax: B.r, grow: B.grow, hold: B.hold, fade: B.fade, t: 0, r: 0,
      lethal: true, kills: 0, born: this.time, base: shot ? shot.base : -1, path: shot ? shot.path : null });
    this.events.push({ kind: 'burst', x, y, chain, r: B.r });
  }

  _bursts(dt, live) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const u = clamp01(b.t / b.grow);
      b.r = b.rmax * (1 - (1 - u) * (1 - u) * (1 - u));
      b.lethal = live && b.t < b.grow + b.hold;
      if (b.t > b.grow + b.hold + b.fade) { this.bursts.splice(i, 1); continue; }
      if (!b.lethal) continue;
      for (let j = this.shapes.length - 1; j >= 0; j--) {
        const s = this.shapes[j];
        if (Math.hypot(s.x - b.x, s.y - b.y) > b.r + s.r) continue;
        this.shapes.splice(j, 1);
        b.kills++; this.stats.kills++;
        if (b.chain > 0) this.stats.chainKills++;
        this.stats.bestChain = Math.max(this.stats.bestChain, b.chain + 1);
        const points = T.score.kill * (this.wave + 1) + T.score.chainStep * b.chain;
        this.score += points;
        this.events.push({ kind: 'kill', x: s.x, y: s.y, id: s.id, shape: s.kind, chain: b.chain, points, spin: s.spin, spinRate: s.spinRate, tilt: s.tilt, born: s.born });
        this._cues.emit(SoundCue.Hit);
        if (b.chain < T.chain.depth) this._burst(s.x, s.y, b.chain + 1);
      }
    }
  }
}
