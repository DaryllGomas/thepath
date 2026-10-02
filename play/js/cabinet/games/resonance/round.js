// THE NODE · THE RESONANCE (cabinet level 5) · THE ROUND (ICabinetSim). Deterministic, headless, no DOM, no three.js.
//
// Space Invaders, reshaped by the story: you don't shoot the invaders down, you TUNE THE SIGNAL. A glowing wave (the Signal)
// drifts across the middle of the glass. Red kites hang on threads from the top in loose ranks and come slowly down. Your
// emitter slides along the ground; FIRE sends a short pulse straight up (two in flight at most). A shape is RESONANT while a
// crest of the wave passes under it AND REACHES it: the crest within its window left or right (bigger shapes have a wider
// window) and the shape's lowest point within the crest's reach (the crest node's upward ray), so the high shapes must come
// down to the wave first. Hit it while it's resonant and it SHATTERS: points (x the chain), and the chain grows. Hit it
// OFF-PHASE and the attack gets worse: a big shape splits into two smaller ones, a middle one into two small ones, a small
// one is cut loose; whatever an off-phase hit touches is cut from its thread and falls faster. The pulse takes time to
// climb, so you LEAD the crest: reading the motion, not a beat. A shape whose middle falls through the wave has SLIPPED
// THROUGH: no crest can tune it, it falls faster, and a hit only breaks it (no points, the chain untouched). Now and then a
// hanging shape lets a small red shard fall straight down (never aimed): step aside. A shape that reaches the ground, or a
// shard that strikes the emitter, costs a life. TUNE.target clean hits: CLEAR. Out of lives: LOST.
//
//   reset(seed, credit, knobs)   step(dt, pad)    pad = ResonancePad (latched by the host)
//   state result score lives cues summary     collectStats(into)
//   read-only for views and bots: emitter, pulses, shapes, shards, wave ({ phase, A, v }), tuned, target, chain, bestChain,
//   livesLeft, phase, phaseTime, readyDur, time, levelTime, why, events (this step's: { kind, ... }), k (the resolved knobs),
//   stats; isResonant(s), inReach(s), windowOf(s), crestY, reachY, passY, fallSpeed(s), shapeXAt(s, dt), shapeYAt(s, dt),
//   phaseAhead(dt), crestOffsetAt(x)
//
// FIXED TICK: step(dt) runs whole 1/60 s ticks, so a round plays the same at any frame rate; a FIRE press between ticks is
// held (briefly) until the next tick that can fire. Every die comes from the round's own SystemRandom (seed).
import { CabinetState, RoundResult, SoundCue, CueBuffer, CreditInfo, KnobValues, SystemRandom } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { WAVE, EMITTER, TIP, groundY, glassTopAt, kiteDims, kiteContains, crestOffset, FORMATION, PLAY_X, emitterContains, CX } from './layout.js';

const T = TUNE, STEP = T.step, TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** The panel: a stick (x: left / right), FIRE (a, or b), START. Held states; latch() keeps this step and the last, so
 *  pressed() is an edge. */
export class ResonancePad {
  constructor() { this.cur = ResonancePad.frame(); this.prev = ResonancePad.frame(); }
  static frame(o = {}) { return { x: clamp(+o.x || 0, -1, 1), y: clamp(+o.y || 0, -1, 1), a: !!o.a, b: !!o.b, start: !!o.start }; }
  latch(o) { this.prev = this.cur; this.cur = ResonancePad.frame(o || {}); }
  clear() { this.cur = ResonancePad.frame(); this.prev = ResonancePad.frame(); }
  get x() { return this.cur.x; }
  get y() { return this.cur.y; }
  held(k) { return this.cur[k]; }
  pressed(k) { return this.cur[k] && !this.prev[k]; }
}

const SIZES = T.shapes.sizes, SMALLER = { L: 'M', M: 'S', S: null };
/** Where a shape may hang: below the score (top left) and the lives (top right), never over them. */
function hudClear(x, y, h) {
  const a = kiteDims(h).a;
  if (x < 310) return Math.max(y, 160 + a);
  if (x > 1060) return Math.max(y, 118 + a);
  return y;
}

export class ResonanceRound {
  constructor() {
    this._cues = new CueBuffer();
    this.reset(1, new CreditInfo(), new KnobValues());
  }

  reset(seed, credit, knobs) {
    this.seed = seed || 1;
    this.rng = new SystemRandom(this.seed);
    this.credit = credit || new CreditInfo();
    const k = knobs || new KnobValues();
    this.k = { fall: k.get('fall', 1), window: k.get('window', 1), lives: Math.round(k.get('lives', T.lives)),
      target: Math.round(k.get('target', T.target)), ward: k.get('ward', 0) };
    if (this.credit.unlosable) this.k.ward = 1;
    this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.ready;
    this._result = RoundResult.None; this._cues.resetTotals();
    this.time = 0; this.levelTime = 0; this.why = '';
    this.score = 0; this.livesLeft = this.k.lives; this.target = this.k.target;
    this.tuned = 0; this.chain = 0; this.bestChain = 0;
    // the wave: its phase starts anywhere; it drifts right from the first moment (the ready card too)
    const W = T.wave;
    this.wave = { phase: W.phase0[0] + this.rng.nextDouble() * (W.phase0[1] - W.phase0[0]), A: W.amp, v: W.v0 };
    this._waveTick(0);
    this.emitter = { x: CX, vx: 0, alive: true, ward: 0, wardAt: -9, lastShot: -9, want: 0 };
    this.pulses = []; this.shapes = []; this.shards = [];
    this.nextId = 1; this._fireAt = -9;
    this.spawnT = T.shapes.spawnEvery; this.shardT = T.shard.first;
    this.events = []; this._acc = 0;
    this.stats = { shots: 0, clean: 0, off: 0, splits: 0, cutLoose: 0, landed: 0, struck: 0, warded: 0, spawned: 0, shards: 0,
      missed: 0, passed: 0, broken: 0, deathsAt: [], cleanAt: [], chains: [] };
    // the opening ranks: they unspool from the top during the ready card, one after another
    FORMATION.forEach((f, i) => {
      const x = clamp(f.x + (this.rng.nextDouble() - 0.5) * 40, PLAY_X[0], PLAY_X[1]);
      const y = f.y + (this.rng.nextDouble() - 0.5) * 36;
      this._spawn(f.size, x, hudClear(x, y, SIZES[f.size].h), 0.15 + i * 0.22, 2.1);
    });
  }

  // ---- ICabinetSim ----
  get state() { return this._state; }
  get result() { return this._result; }
  get lives() { return this._state === CabinetState.Over || this._state === CabinetState.Card ? 0 : Math.max(0, this.livesLeft); }
  get cues() { return this._cues; }
  get summary() {
    return `tuned ${this.tuned}/${this.target} score ${this.score} t ${this.levelTime.toFixed(1)} lives ${this.livesLeft} ` +
      `best chain ${this.bestChain} off-phase ${this.stats.off} landed ${this.stats.landed} struck ${this.stats.struck} ` +
      `${this._result === RoundResult.Won ? 'CLEAR' : this._result === RoundResult.Lost ? 'LOST (' + this.why + ')' : ''}`;
  }
  collectStats(into) {
    const add = (n, v) => { into[n] = (into[n] || 0) + v; };
    add('seconds', this.levelTime); add('tuned', this.tuned); add('offPhase', this.stats.off); add('landed', this.stats.landed);
    add('struck', this.stats.struck); add('livesLeft', Math.max(0, this.livesLeft));
  }

  step(dt, pad) {
    this.events.length = 0;
    this._cues.clear();
    this._pad = pad;
    // FIRE's edge, from either panel (ResonancePad: cur / prev; the SDK's CabinetInput: current / previous)
    const cur = pad && (pad.cur ?? pad.current), prev = pad && (pad.prev ?? pad.previous);
    if (cur && (cur.a || cur.b) && !(prev && (prev.a || prev.b))) this._fireAt = this.time;
    this._acc += clamp(dt, 0, 0.25);
    while (this._acc >= STEP) { this._acc -= STEP; this._tick(pad); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  _tick(pad) {
    const dt = STEP;
    this.time += dt; this.phaseTime += dt;
    if (this._state === CabinetState.Over) return;
    this._waveTick(dt);
    this._enterTick();
    if (this._state === CabinetState.Card) {
      if (this.phaseTime >= (this._result === RoundResult.Won ? T.card.won : T.card.lost)) this._state = CabinetState.Over;
      return;
    }
    if (this._state === CabinetState.Intro) {
      this._move(dt, pad);                                // you can take your place during READY (no firing yet)
      if (this.phaseTime >= this.readyDur) {
        this._state = CabinetState.Playing; this.phase = 'play'; this.phaseTime = 0;
        this.events.push({ kind: 'go' }); this._cues.emit(SoundCue.Start);
      }
      return;
    }
    if (this._state === CabinetState.Interlude) {         // A LIFE LOST: everything holds while it breaks
      if (this.phaseTime >= T.lost) {
        if (this.livesLeft <= 0) { this._end(RoundResult.Lost, this.why || 'lives'); return; }
        this.emitter.alive = true; this.emitter.vx = 0;
        this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.readyAgain;
        this.events.push({ kind: 'again' });
      }
      return;
    }
    // THE PLAY
    this.levelTime += dt;
    const e = this.emitter;
    if (e.ward > 0) e.ward = Math.max(0, e.ward - dt);
    this._move(dt, pad);
    this._fire();
    this._pulsesTick(dt);
    if (this._state !== CabinetState.Playing) return;
    this._shapesTick(dt);
    if (this._state !== CabinetState.Playing) return;
    this._shardsTick(dt);
    if (this._state !== CabinetState.Playing) return;
    this._spawnTick(dt);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the wave: speed eased up over the level, height breathing slowly; the phase always moves on (never a jump)
  _waveTick(dt) {
    const W = T.wave, w = this.wave;
    w.v = this._speedAt(this.levelTime);
    w.A = W.amp * (1 + W.breath * Math.sin(TAU * this.time / W.breathPeriod));
    w.phase += WAVE.k * w.v * dt;
    if (w.phase > 1e4) w.phase -= TAU * Math.floor(w.phase / TAU);
  }
  _speedAt(lt) { const W = T.wave; return W.v0 + (W.v1 - W.v0) * ease(lt / W.ramp); }
  /** The wave's phase dt seconds from now (as long as play goes on). The drift eases so slowly that the midpoint rule
   *  is exact enough (the bots read this; a player reads the motion). */
  phaseAhead(dt) { return this.wave.phase + WAVE.k * dt * this._speedAt(this.levelTime + dt / 2); }
  crestOffsetAt(x, phase = this.wave.phase) { return crestOffset(phase, x); }
  /** How far (px, left or right) a crest may be from a shape and still be under it. */
  windowOf(s) { return (T.resonance.base + T.resonance.perHalf * s.hw) * this.k.window; }
  /** The crest's height (its node) and how high its reach goes: a shape's lowest point must be at or below reachY. */
  get crestY() { return WAVE.y0 - this.wave.A; }
  get reachY() { return WAVE.y0 - this.wave.A - T.resonance.reach; }
  /** Past this line (a shape's middle) it has slipped through the wave. */
  get passY() { return WAVE.y0 + T.resonance.pass * T.wave.amp; }
  inReach(s, y = s.y) { return !s.passed && y + s.b >= this.reachY && y <= this.passY; }
  isResonant(s, phase = this.wave.phase) { return this.inReach(s) && Math.abs(crestOffset(phase, s.x)) <= this.windowOf(s); }

  // ---- the emitter ----
  _move(dt, pad) {
    const e = this.emitter, S = T.emitter;
    if (!e.alive) { e.vx = 0; return; }
    const want = (pad ? clamp(pad.x, -1, 1) : 0) * S.speed;
    e.want = want;
    const dv = want - e.vx, lim = S.accel * dt;
    e.vx += clamp(dv, -lim, lim);
    e.x += e.vx * dt;
    if (e.x < EMITTER.x0) { e.x = EMITTER.x0; e.vx = Math.max(0, e.vx); }
    if (e.x > EMITTER.x1) { e.x = EMITTER.x1; e.vx = Math.min(0, e.vx); }
  }
  _fire() {
    const e = this.emitter, P = T.pulse;
    if (!e.alive || this.time - this._fireAt > 0.12) return;             // a press waits this long at most for a free slot
    if (this.time - e.lastShot < P.cooldown || this.pulses.length >= P.maxLive) return;
    const gy = groundY(e.x);
    this.pulses.push({ id: this.nextId++, x: e.x, y: gy - TIP, y0: gy - TIP, born: this.time });
    e.lastShot = this.time; this._fireAt = -9; this.stats.shots++;
    this.events.push({ kind: 'fire', x: e.x, y: gy - TIP });
  }

  // ---- the pulses: straight up, a few sub-steps a tick (a pulse never skips over a shape's edge) ----
  _pulsesTick(dt) {
    const P = T.pulse, h = dt / P.sub;
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      let gone = false;
      for (let q = 0; q < P.sub && !gone; q++) {
        p.y -= P.speed * h;
        // the first shape it meets (a pulse stops at the lowest one in its way)
        let hit = null, hy = -1;
        for (const s of this.shapes) {
          if (!s.alive || !kiteContains(s.x, s.y, s.h, p.x, p.y, 3)) continue;
          if (s.y > hy) { hy = s.y; hit = s; }
        }
        if (hit) { gone = true; this._hit(hit, p); }
        else if (p.y < glassTopAt(p.x) - 8) { gone = true; this.stats.missed++; this.events.push({ kind: 'gone', id: p.id, x: p.x, y0: p.y0 }); }
      }
      if (gone) this.pulses.splice(i, 1);
      if (this._state !== CabinetState.Playing) return;
    }
  }

  _hit(s, p) {
    const crest = crestOffset(this.wave.phase, s.x);
    if (s.passed) {
      // through the wave already: the crest can't tune it; a hit just breaks it (no points, the chain untouched)
      s.alive = false; this.stats.broken++;
      this.events.push({ kind: 'broken', id: s.id, x: s.x, y: s.y, h: s.h, size: s.size, pulse: p.id, pulseX: p.x, pulseY0: p.y0, hitY: p.y });
      this._cues.emit(SoundCue.Tick);
      return;
    }
    if (this.inReach(s) && Math.abs(crest) <= this.windowOf(s)) {
      // RESONANT: it shatters
      s.alive = false;
      this.chain++; this.bestChain = Math.max(this.bestChain, this.chain);
      const mult = Math.min(this.chain, T.score.chainMax), pts = SIZES[s.size].pts * mult;
      this.score += pts; this.tuned++; this.stats.clean++; this.stats.cleanAt.push(+this.levelTime.toFixed(1));
      this.events.push({ kind: 'shatter', id: s.id, x: s.x, y: s.y, h: s.h, size: s.size, pts, mult, chain: this.chain,
        crestX: s.x - crest, pulse: p.id, pulseX: p.x, pulseY0: p.y0, hitY: p.y });
      this._cues.emit(SoundCue.Hit);
      if (this.chain % T.score.bonusEvery === 0) this._cues.emit(SoundCue.Bonus);
      const left = this.target - this.tuned;
      if (left > 0 && left <= 3 && !this._almost) { this._almost = true; this.events.push({ kind: 'almost', left }); }
      if (this.tuned >= this.target) this._end(RoundResult.Won, 'tuned');
      return;
    }
    // OFF-PHASE: the attack gets worse
    this.stats.off++;
    if (this.chain > 0) { this.stats.chains.push(this.chain); this.events.push({ kind: 'chainBreak', chain: this.chain, why: 'off' }); }
    this.chain = 0;
    const smaller = SMALLER[s.size];
    this.events.push({ kind: 'offphase', id: s.id, x: s.x, y: p.y, sx: s.x, sy: s.y, h: s.h, size: s.size, split: !!smaller,
      pulse: p.id, pulseX: p.x, pulseY0: p.y0, hitY: p.y });
    this._cues.emit(SoundCue.Tick);
    if (smaller) {
      s.alive = false; this.stats.splits++;
      const sp = T.shapes.split.spread, kids = [];
      for (const dir of [-1, 1]) {
        const x1 = clamp(s.x + dir * sp, PLAY_X[0], PLAY_X[1]);
        const c = this._spawn(smaller, s.x, s.y, 0, 0, true);
        c.loose = true; c.looseK = T.shapes.loose; c.splitFrom = s.x; c.splitTo = x1; c.splitT = 0; c.parent = s.id;
        kids.push(c.id);
      }
      this.events.push({ kind: 'split', id: s.id, kids, x: s.x, y: s.y });
    } else {
      // the small one: cut loose (or, loose already, falls faster still)
      if (!s.loose) { s.loose = true; s.looseK = T.shapes.loose; this.stats.cutLoose++; }
      else s.looseK = Math.min(s.looseK * T.shapes.looseAgain, 3);
      s.jolt = this.time;
      this.events.push({ kind: 'cut', id: s.id, x: s.x, y: s.y });
    }
  }

  // ---- the shapes ----
  _spawn(size, x, y, delay = 0, enter = T.shapes.enter, instant = false) {
    const h = SIZES[size].h, d = kiteDims(h);
    const s = { id: this.nextId++, size, h, hw: d.hw, a: d.a, b: d.b, x, y, alive: true, loose: false, looseK: 1,
      born: this.time, enter: 0, dropAt: -1, tellAt: -9, jolt: -9, splitT: -1, splitFrom: x, splitTo: x, passed: false, passedAt: -9 };
    if (instant) { s.enter = 0; s.y = y; }
    else {
      const top = glassTopAt(x) + 3 + d.a;                  // it unspools from the top of the glass down to its place
      s.enter = { from: top, to: y, t0: this.time + delay, dur: enter };
      s.y = top;
    }
    this.shapes.push(s); this.stats.spawned++;
    this.events.push({ kind: 'spawn', id: s.id, size });
    return s;
  }
  /** entering shapes come down to their place (clocked by the round's time: they unspool during READY too) */
  _enterTick() {
    for (const s of this.shapes) {
      if (!s.enter) continue;
      const u = (this.time - s.enter.t0) / s.enter.dur;
      s.y = s.enter.from + (s.enter.to - s.enter.from) * ease(u);
      if (u >= 1) { s.y = s.enter.to; s.enter = 0; }
    }
  }
  fallSpeed(s) {
    const S = T.shapes;
    return SIZES[s.size].fall * (1 + S.ramp * ease(this.levelTime / 60)) * this.k.fall * (s.loose ? s.looseK : 1);
  }
  /** Where a shape will be dt s from now (play going on): x (a split half drifting apart), y (entering / falling). */
  shapeXAt(s, dt) {
    if (s.splitT < 0 || s.splitT >= T.shapes.split.time) return s.x;
    return s.splitFrom + (s.splitTo - s.splitFrom) * ease((s.splitT + dt) / T.shapes.split.time);
  }
  shapeYAt(s, dt) {
    if (!s.passed && !s.enter) {                           // it may slip through the wave (and speed up) on the way
      const v = this.fallSpeed(s), y1 = s.y + v * dt;
      if (y1 <= this.passY) return y1;
      const tp = (this.passY - s.y) / v, v2 = v / (s.loose ? s.looseK : 1) * Math.max(s.looseK, T.shapes.passed);
      return this.passY + v2 * (dt - tp);
    }
    if (s.enter) {
      const u = (this.time + dt - s.enter.t0) / s.enter.dur;
      if (u < 1) return s.enter.from + (s.enter.to - s.enter.from) * ease(u);
      return s.enter.to + this.fallSpeed(s) * (this.time + dt - s.enter.t0 - s.enter.dur);
    }
    return s.y + this.fallSpeed(s) * dt;
  }

  _shapesTick(dt) {
    const S = T.shapes;
    for (const s of this.shapes) {
      if (!s.alive) continue;
      if (s.splitT >= 0 && s.splitT < S.split.time) {
        s.splitT += dt;
        s.x = s.splitFrom + (s.splitTo - s.splitFrom) * ease(s.splitT / S.split.time);
      }
      if (!s.enter) s.y += this.fallSpeed(s) * dt;
      // THROUGH THE WAVE: the crest can't reach it any more; cut loose, it falls faster toward the ground
      if (!s.passed && s.y > this.passY) {
        s.passed = true; s.loose = true; s.looseK = Math.max(s.looseK, T.shapes.passed); s.passedAt = this.time; s.dropAt = -1;
        this.stats.passed++;
        this.events.push({ kind: 'passed', id: s.id, x: s.x, y: s.y });
      }
      // the shard it's gathering (the tell is over): let it fall
      if (s.dropAt >= 0 && this.time >= s.dropAt) {
        s.dropAt = -1;
        this.shards.push({ id: this.nextId++, x: s.x, y: s.y + s.b + 4, vy: T.shard.speed, born: this.time, from: s.id });
        this.stats.shards++;
        this.events.push({ kind: 'shard', x: s.x, y: s.y + s.b + 4, from: s.id });
      }
      // LANDED: its lowest point touches the ground
      if (s.y + s.b >= groundY(s.x) - 1) {
        s.alive = false;
        this.events.push({ kind: 'landed', id: s.id, x: s.x, y: s.y, h: s.h, size: s.size });
        this._loseLife('landed', s.x, groundY(s.x));
        if (this._state !== CabinetState.Playing) break;
      }
    }
    this.shapes = this.shapes.filter((s) => s.alive);
  }

  // ---- shards: sparse, slow, straight down; a tell first (the shape's lowest point gathers a little red light) ----
  _shardsTick(dt) {
    const H = T.shard;
    this.shardT -= dt;
    if (this.shardT <= 0) {
      const busy = this.shards.length + this.shapes.filter((s) => s.dropAt >= 0).length;
      const cand = this.shapes.filter((s) => s.alive && !s.enter && !s.passed && s.dropAt < 0);
      if (busy < H.maxLive && cand.length) {
        const s = cand[Math.floor(this.rng.nextDouble() * cand.length)];
        s.tellAt = this.time; s.dropAt = this.time + H.tell;
        this.events.push({ kind: 'tell', id: s.id });
      }
      const u = ease(this.levelTime / 60);
      this.shardT = (H.every[0] + (H.every[1] - H.every[0]) * u) * (0.8 + 0.4 * this.rng.nextDouble());
    }
    const e = this.emitter;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      sh.y += sh.vy * dt;
      if (e.alive && e.ward <= 0 && emitterContains(e.x, sh.x, sh.y, 2)) {
        this.shards.splice(i, 1);
        this.events.push({ kind: 'struck', x: e.x, y: groundY(e.x), sx: sh.x, sy: sh.y });
        this._loseLife('struck', e.x, groundY(e.x));
        if (this._state !== CabinetState.Playing) return;
        continue;
      }
      if (sh.y >= groundY(sh.x)) { this.shards.splice(i, 1); this.events.push({ kind: 'shardGround', x: sh.x, y: groundY(sh.x) }); }
    }
  }

  // ---- new shapes unspool from the top while there are fewer than wanted, in the widest open space ----
  _spawnTick(dt) {
    const S = T.shapes;
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = S.spawnEvery;
    const want = Math.round(S.want[0] + (S.want[1] - S.want[0]) * ease(this.levelTime / 60));
    const live = this.shapes.filter((s) => s.alive);
    if (live.length >= want || live.length >= S.max) return;
    const r = this.rng.nextDouble();
    const size = r < S.sizeOdds.L ? 'L' : r < S.sizeOdds.L + S.sizeOdds.M ? 'M' : 'S';
    const hy = S.hangY[0] + (S.hangY[1] - S.hangY[0]) * this.rng.nextDouble();
    let best = -1, bx = CX;
    for (let x = PLAY_X[0]; x <= PLAY_X[1]; x += 20) {
      let m = 400;
      for (const s of live) { const dy = Math.abs(s.y - hy); m = Math.min(m, Math.abs(s.x - x) * (dy < 170 ? 1 : 2.2)); }
      const sc = m + this.rng.nextDouble() * 45;
      if (sc > best) { best = sc; bx = x; }
    }
    this._spawn(size, bx, hudClear(bx, hy, SIZES[size].h));
  }

  // ---- a life ----
  _loseLife(why, x, y) {
    if (this.k.ward > 0 && this.livesLeft <= 1) {          // MERCY: the last life is warded
      this.stats.warded++;
      if (why === 'struck') { this.emitter.ward = 1.6; this.emitter.wardAt = this.time; }
      this.events.push({ kind: 'ward', why, x, y });
      this._cues.emit(SoundCue.Miss);
      return;
    }
    if (this.chain > 0) { this.stats.chains.push(this.chain); this.events.push({ kind: 'chainBreak', chain: this.chain, why }); }
    this.chain = 0;
    this.livesLeft--; this.why = why;
    if (why === 'landed') this.stats.landed++; else this.stats.struck++;
    this.stats.deathsAt.push(+this.levelTime.toFixed(1));
    if (why === 'struck') this.emitter.alive = false;
    for (const p of this.pulses) this.events.push({ kind: 'gone', id: p.id, x: p.x, y0: p.y0 });
    this.pulses.length = 0; this.shards.length = 0;
    for (const s of this.shapes) { s.dropAt = -1; s.tellAt = -9; }
    this.events.push({ kind: 'lifeLost', why, x, y, left: this.livesLeft });
    this._cues.emit(SoundCue.Miss);
    this._state = CabinetState.Interlude; this.phase = 'lost'; this.phaseTime = 0;
  }

  _end(result, why) {
    this._result = result; this._state = CabinetState.Card; this.phase = 'card'; this.phaseTime = 0; this.why = why;
    if (this.chain > 0) this.stats.chains.push(this.chain);
    if (result === RoundResult.Won) {
      const bonus = T.score.clear + T.score.lifeLeft * Math.max(0, this.livesLeft);
      this.score += bonus;
      this.pulses.length = 0; this.shards.length = 0;
      this._cues.emit(SoundCue.Win); this.events.push({ kind: 'clear', bonus, lives: this.livesLeft });
    } else { this._cues.emit(SoundCue.Die); this.events.push({ kind: 'out', why }); }
  }
}
