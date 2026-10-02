// THE NODE · HEARTH (cabinet level 1) · THE ROUND (ICabinetSim). Deterministic, headless, no DOM, no three.js.
//
// A Berzerk/Robotron raid around a fire. THE FIRE is your life and your light: it burns down; fuel shards out in the
// dark feed it (the farther out, the more they're worth; several dropped in at once multiply). Shades come out of the
// cave's openings, drift to the fire and bite it; they hunt you a little, and a touch knocks your fuel loose and stuns
// you. A = WARD: a push-back ring that costs a little fire. Fire over WAKE: the bull leaves the wall and charges its
// lane, goring shades. Fire at BLAZE: the deer wakes too; hold blaze for TUNE.blazeHold s in total and the hearth holds (CLEAR). The minute
// ends: blazing = clear, otherwise OVERTIME (everything at full tilt) until it blazes or goes out. Out = LOST.
//
//   reset(seed, credit, knobs)   step(dt, input)    input = CabinetInput (latched by the host)
//   state result score lives time cues summary     collectStats(into)
//   read-only for views and bots: fire, player, shards, shades, bull, deer, levelTime, overtime, blazeTime, mult,
//   events (this step's: { kind, ... }), phase ('ready' | 'play' | 'card'), woke { bull, deer }
//
// FIXED TICK: step(dt) runs whole 1/60 s ticks, so a round plays the same at any frame rate; a WARD press between
// ticks is held until the next tick. Every die comes from the round's own SystemRandom (seed).
import { CabinetState, RoundResult, SoundCue, CueBuffer, Pad, CreditInfo, KnobValues, SystemRandom } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { HEARTH, FEED, BITE, OPENINGS, BULL_LANE, DEER_LANE, walkable, eDist, inPoly } from './layout.js';

const T = TUNE, STEP = T.step;
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };

export class HearthRound {
  constructor() { this._cues = new CueBuffer(); this.reset(1, new CreditInfo(), new KnobValues()); }

  reset(seed, credit, knobs) {
    this.seed = seed || 1;
    this.rng = new SystemRandom(this.seed);
    this.credit = credit || new CreditInfo();
    const k = knobs || new KnobValues();
    this.k = { burn: k.get('burn', 1), bite: k.get('bite', 1), shades: k.get('shades', 1), floor: k.get('floor', 0) };
    if (this.credit.unlosable && this.k.floor <= 0) this.k.floor = 0.06;
    this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0;
    this._result = RoundResult.None; this._cues.resetTotals();
    this.fire = T.fireStart; this.levelTime = 0; this.overtime = false; this.blazeTime = 0; this.time = 0; this._wasBlaze = false; this._blazeTold = 0;
    this.score = 0; this.mult = 1; this.nextId = 1;
    this.player = { x: 626, y: 640, vx: 0, vy: 0, face: -Math.PI / 2, stun: 0, invuln: 0, carry: [], wardCd: 0, wardAt: -9, moving: false };
    this.shards = []; this.shades = [];
    this.bull = this._animal(BULL_LANE, T.animal.bullReach);
    this.deer = this._animal(DEER_LANE, T.animal.deerReach);
    this.woke = { bull: 0, deer: 0 };
    this.stats = { delivered: 0, deliveries: 0, bites: 0, wards: 0, wardHits: 0, knocked: 0, gored: 0, bestMult: 1, minFire: this.fire };
    this.spawnT = OPENINGS.map((_, i) => 1.0 + i * 0.8);
    this.fuelT = 0;
    this.events = []; this._acc = 0; this._wardReq = false;
    for (let i = 0; i < 3; i++) this._spawnShard();
    this.fireCurve = [];                 // fire once a second (bench)
  }

  _animal(lane, reach) { return { lane, reach, st: 'rest', t: 0, pass: 0, cool: 0, x: lane.a[0], y: lane.a[1], dir: 1, glow: 0 }; }

  // ---- ICabinetSim ----
  get state() { return this._state; }
  get result() { return this._result; }
  get lives() { return this._state === CabinetState.Playing || this._state === CabinetState.Intro ? 1 : 0; }
  get cues() { return this._cues; }
  get summary() {
    return `fire ${this.fire.toFixed(2)} score ${this.score} t ${this.levelTime.toFixed(1)}${this.overtime ? ' OT' : ''} ` +
      `delivered ${this.stats.delivered} bites ${this.stats.bites} bull ${this.woke.bull} deer ${this.woke.deer} ` +
      `${this._result === RoundResult.Won ? 'CLEAR' : this._result === RoundResult.Lost ? 'OUT' : ''}`;
  }
  collectStats(into) {
    const add = (n, v) => { into[n] = (into[n] || 0) + v; };
    add('seconds', this.levelTime); add('delivered', this.stats.delivered); add('bites', this.stats.bites);
    add('wards', this.stats.wards); add('gored', this.stats.gored); add('bullWakes', this.woke.bull); add('deerWakes', this.woke.deer);
  }

  step(dt, input) {
    this.events.length = 0;
    this._cues.clear();
    if (input && input.pressed && input.pressed(Pad.A)) this._wardReq = true;
    this._acc += Math.min(Math.max(dt, 0), 0.25);
    while (this._acc >= STEP) { this._acc -= STEP; this._tick(input); }
  }

  // ---- one tick ----
  _tick(input) {
    const dt = STEP;
    this.time += dt; this.phaseTime += dt;
    if (this._state === CabinetState.Intro) {
      if (this.phaseTime >= T.ready) { this._state = CabinetState.Playing; this.phase = 'play'; this.phaseTime = 0; this._cues.emit(SoundCue.Start); }
      this._wardReq = false;
      this._animals(dt);
      return;
    }
    if (this._state === CabinetState.Card) {
      this._animals(dt); this._shadesMove(dt, true);
      if (this.phaseTime >= (this._result === RoundResult.Won ? T.card.won : T.card.lost)) { this._state = CabinetState.Over; }
      return;
    }
    if (this._state !== CabinetState.Playing) return;

    this.levelTime += dt;
    const p = clamp01(this.levelTime / T.levelSeconds);
    if (Math.floor(this.levelTime) !== Math.floor(this.levelTime - dt)) this.fireCurve.push(+this.fire.toFixed(3));
    if (!this.overtime && this.levelTime > T.levelSeconds - 5 && Math.floor(this.levelTime) !== Math.floor(this.levelTime - dt)) this._cues.emit(SoundCue.Tick);

    // the fire burns
    const burn = lerp(T.burn[0], T.burn[1], p) * this.k.burn * (this.overtime ? T.overtimeBurn : 1);
    this._fire(-burn * dt);

    this._player(dt, input);
    this._fuel(dt, p);
    this._spawnShades(dt, p);
    this._shadesMove(dt, false, p);
    this._animals(dt);
    this.stats.minFire = Math.min(this.stats.minFire, this.fire);

    // the result: from the fire, never from the clock
    if (this.fire <= 0) return this._end(RoundResult.Lost);
    const isBlaze = this.fire >= T.blaze;
    if (isBlaze && !this._wasBlaze) { this.events.push({ kind: 'blaze', first: this._blazeTold === 0 }); this._blazeTold++; }
    this._wasBlaze = isBlaze;
    if (isBlaze) { this.blazeTime += dt; if (this.blazeTime >= T.blazeHold) return this._end(RoundResult.Won); }
    else this.blazeTime = Math.max(0, this.blazeTime - dt * 0.5);
    if (!this.overtime && this.levelTime >= T.levelSeconds) {
      if (this.fire >= T.blaze) return this._end(RoundResult.Won);
      this.overtime = true; this.events.push({ kind: 'overtime' });
    }
  }

  _fire(d) {
    this.fire = Math.min(1, this.fire + d);
    if (this.k.floor > 0 && this.fire < this.k.floor) this.fire = this.k.floor;
  }

  _end(result) {
    this._result = result; this._state = CabinetState.Card; this.phase = 'card'; this.phaseTime = 0;
    if (result === RoundResult.Won) {
      const left = Math.max(0, T.levelSeconds - this.levelTime);
      this.score += T.score.clear + Math.round(left * T.score.perSecondLeft);
      this._cues.emit(SoundCue.Win); this.events.push({ kind: 'clear' });
    } else { this.fire = 0; this._cues.emit(SoundCue.Die); this.events.push({ kind: 'out' }); }
  }

  // ---- the player ----
  _player(dt, input) {
    const pl = this.player, P = T.player;
    pl.stun = Math.max(0, pl.stun - dt); pl.invuln = Math.max(0, pl.invuln - dt); pl.wardCd = Math.max(0, pl.wardCd - dt);
    let ix = input ? input.x : 0, iy = input ? -input.y : 0;         // stick +y is UP; the cave's y is down
    const m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; }
    const speed = P.speed * (1 - P.carrySlow * pl.carry.length);
    const tx = pl.stun > 0 ? 0 : ix * speed, ty = pl.stun > 0 ? 0 : iy * speed;
    const a = 1 - Math.exp(-P.accel * dt);
    pl.vx += (tx - pl.vx) * a; pl.vy += (ty - pl.vy) * a;
    pl.moving = Math.hypot(pl.vx, pl.vy) > 20;
    if (m > 0.2 && pl.stun <= 0) pl.face = Math.atan2(iy, ix);
    this._move(pl, dt);

    // WARD: a push-back ring (costs fire)
    if (this._wardReq) {
      this._wardReq = false;
      if (pl.wardCd <= 0 && pl.stun <= 0) {
        pl.wardCd = T.ward.cooldown; pl.wardAt = this.time; this.stats.wards++;
        this._fire(-T.ward.cost);
        let hits = 0;
        for (const s of this.shades) {
          if (s.st === 'die' || s.st === 'emerge') continue;
          const dx = s.x - pl.x, dy = s.y - pl.y, d = Math.hypot(dx, dy);
          if (d < T.ward.radius) {
            const nx = d > 1 ? dx / d : 1, ny = d > 1 ? dy / d : 0;
            s.vx = nx * T.ward.push; s.vy = ny * T.ward.push; s.st = 'stun'; s.t = 0; hits++;
          }
        }
        this.stats.wardHits += hits; this.score += hits * T.score.ward;
        this.events.push({ kind: 'ward', x: pl.x, y: pl.y, hits });
        this._cues.emit(hits > 0 ? SoundCue.Hit : SoundCue.Miss);
      }
    }
    // pick up fuel
    if (pl.stun <= 0) for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      if (pl.carry.length >= P.carryMax || s.lock > this.time) continue;
      if (Math.hypot(s.x - pl.x, s.y - pl.y) < T.fuel.pickup) {
        pl.carry.push({ value: s.value, points: s.points, id: s.id }); this.shards.splice(i, 1);
        this.events.push({ kind: 'pickup', x: s.x, y: s.y, id: s.id });
      }
    }
    // feed the fire
    if (pl.carry.length > 0 && eDist(pl.x, pl.y, FEED) < 1) {
      const n = pl.carry.length, mult = 1 + T.multStep * (n - 1);
      let v = 0, pts = 0; for (const c of pl.carry) { v += c.value; pts += c.points; }
      this._fire(v * mult); this.score += Math.round(pts * mult);
      this.mult = mult; this.stats.delivered += n; this.stats.deliveries++; this.stats.bestMult = Math.max(this.stats.bestMult, mult);
      this.events.push({ kind: 'feed', n, mult, value: v * mult, x: pl.x, y: pl.y });
      this._cues.emit(n >= 3 ? SoundCue.Bonus : SoundCue.Hit);
      pl.carry.length = 0;
    }
  }

  _move(b, dt) {
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    if (walkable(nx, ny)) { b.x = nx; b.y = ny; return; }
    if (walkable(nx, b.y)) { b.x = nx; b.vy *= 0.5; return; }
    if (walkable(b.x, ny)) { b.y = ny; b.vx *= 0.5; return; }
    b.vx *= 0.3; b.vy *= 0.3;
  }

  // ---- fuel ----
  _fuel(dt, p) {
    this.fuelT -= dt;
    if (this.fuelT <= 0 && this.shards.length < T.fuel.cap) { this._spawnShard(p); this.fuelT = T.fuel.every * (0.8 + 0.4 * this.rng.nextDouble()); }
  }
  _spawnShard(p = 0) {
    const F = T.fuel, dmin = lerp(F.minDist[0], F.minDist[1], p);
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rng.nextDouble() * Math.PI * 2, d = dmin + this.rng.nextDouble() * F.span;
      const x = HEARTH[0] + Math.cos(a) * d * 1.25, y = HEARTH[1] + Math.sin(a) * d * 0.62;
      if (!walkable(x, y) || !walkable(x + 18, y) || !walkable(x - 18, y)) continue;
      if (Math.hypot(x - this.player.x, y - this.player.y) < 70) continue;
      const dd = Math.hypot((x - HEARTH[0]) / 1.25, (y - HEARTH[1]) / 0.62);
      const dn = clamp01((dd - 120) / 480);
      this.shards.push({ id: this.nextId++, x, y, value: lerp(F.value[0], F.value[1], dn), points: Math.round(lerp(F.points[0], F.points[1], dn)),
        born: this.time, lock: 0 });
      return;
    }
  }
  _scatter() {
    const pl = this.player, n = pl.carry.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.nextDouble(), d = 40 + this.rng.nextDouble() * 30;
      let x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d * 0.7;
      if (!walkable(x, y)) { x = pl.x; y = pl.y; }
      const c = pl.carry[i];
      this.shards.push({ id: c.id, x, y, value: c.value, points: c.points, born: this.time, lock: this.time + 0.6, scattered: true });
    }
    pl.carry.length = 0;
  }

  // ---- shades ----
  _spawnShades(dt, p) {
    const S = T.shade, max = Math.round(lerp(S.max[0], S.max[1], this.overtime ? 1 : p));
    let live = 0; for (const s of this.shades) if (s.st !== 'die') live++;
    for (let i = 0; i < OPENINGS.length; i++) {
      if (!this.overtime && this.levelTime < T.openAt[i]) continue;
      this.spawnT[i] -= dt;
      if (this.spawnT[i] > 0 || live >= max) continue;
      const o = OPENINGS[i];
      this.shades.push({ id: this.nextId++, x: o.at[0], y: o.at[1], vx: 0, vy: 0, st: 'emerge', t: 0, from: o.at, to: o.exit, opening: i,
        alpha: 0, wob: this.rng.nextDouble() * 6.28 });
      this.events.push({ kind: 'shade', opening: i });
      live++;
      this.spawnT[i] = lerp(S.every[0], S.every[1], this.overtime ? 1 : p) * (0.75 + 0.5 * this.rng.nextDouble());
    }
  }
  _shadesMove(dt, calm, p = 1) {
    const S = T.shade, pl = this.player;
    const speed = lerp(S.speed[0], S.speed[1], this.overtime ? 1 : p) * this.k.shades, hunt = lerp(S.hunt[0], S.hunt[1], p);
    for (let i = this.shades.length - 1; i >= 0; i--) {
      const s = this.shades[i];
      s.t += dt;
      if (s.st === 'die') { s.alpha = Math.max(0, s.alpha - dt / 0.6); if (s.alpha <= 0) this.shades.splice(i, 1); continue; }
      if (calm) { s.st = 'die'; continue; }
      if (s.st === 'emerge') {
        const u = smooth(s.t / S.emerge);
        const nx = lerp(s.from[0], s.to[0], u), ny = lerp(s.from[1], s.to[1], u);
        s.vx = (nx - s.x) / dt; s.vy = (ny - s.y) / dt; s.x = nx; s.y = ny;
        s.alpha = Math.min(1, s.t / 0.6);
        if (s.t >= S.emerge) { s.st = 'hunt'; s.t = 0; }
        continue;
      }
      if (s.st === 'stun') {
        const k = Math.exp(-3 * dt); s.vx *= k; s.vy *= k;
        if (s.t >= T.ward.stun) { s.st = 'hunt'; s.t = 0; }
      } else {
        // drift to the fire; lean toward the player when close
        let dx = BITE.x - s.x, dy = BITE.y - s.y; const df = Math.hypot(dx, dy) || 1; dx /= df; dy /= df;
        const px = pl.x - s.x, py = pl.y - s.y, dp = Math.hypot(px, py) || 1;
        if (dp < S.huntRadius && pl.invuln <= 0) { const w = hunt * 1.4 * (1 - dp / S.huntRadius); dx += (px / dp) * w; dy += (py / dp) * w; }
        const wob = Math.sin(this.time * 1.3 + s.wob) * 0.35; dx += -dy * wob; dy += dx * wob;
        const dm = Math.hypot(dx, dy) || 1;
        const a = 1 - Math.exp(-2.5 * dt);
        s.vx += (dx / dm * speed - s.vx) * a; s.vy += (dy / dm * speed - s.vy) * a;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      // bite the fire
      if (eDist(s.x, s.y, BITE) < 1) {
        s.st = 'die'; this._fire(-T.bite * this.k.bite); this.stats.bites++;
        this.events.push({ kind: 'bite', x: s.x, y: s.y }); this._cues.emit(SoundCue.Miss);
        continue;
      }
      // touch the player: fuel scatters, a short stun
      if (s.alpha > 0.5 && pl.invuln <= 0 && Math.hypot(s.x - pl.x, s.y - pl.y) < S.touch) {
        const had = pl.carry.length;
        this._scatter(); pl.stun = T.player.stun; pl.invuln = T.player.invuln; this.stats.knocked++;
        const dx = s.x - pl.x, dy = s.y - pl.y, d = Math.hypot(dx, dy) || 1;
        s.vx = dx / d * 250; s.vy = dy / d * 250; s.st = 'stun'; s.t = 0;
        pl.vx = -dx / d * 180; pl.vy = -dy / d * 180;
        this.events.push({ kind: 'knocked', x: pl.x, y: pl.y, lost: had }); this._cues.emit(SoundCue.Miss);
      }
    }
  }

  // ---- the wall wakes ----
  _animals(dt) {
    const A = T.animal, playing = this._state === CabinetState.Playing;
    for (const [name, an, thr] of [['bull', this.bull, T.wakeBull], ['deer', this.deer, T.blaze]]) {
      an.t += dt; an.cool = Math.max(0, an.cool - dt);
      if (an.st === 'rest') {
        an.glow = Math.max(0, an.glow - dt / 1.5);
        if (playing && an.cool <= 0 && this.fire >= thr) {
          an.st = 'wake'; an.t = 0; this.woke[name]++;
          this.events.push({ kind: 'wake', who: name }); this._cues.emit(SoundCue.Bonus);
        }
      } else if (an.st === 'wake') {
        an.glow = Math.min(1, an.t / A.wake);
        if (an.t >= A.wake) { an.st = 'charge'; an.t = 0; an.pass = 0; }
      } else if (an.st === 'charge') {
        const u = smooth(an.t / A.pass), fwd = an.pass % 2 === 0;
        const s = fwd ? u : 1 - u;
        an.x = lerp(an.lane.a[0], an.lane.b[0], s); an.y = lerp(an.lane.a[1], an.lane.b[1], s); an.dir = fwd ? 1 : -1;
        for (const sh of this.shades) {
          if (sh.st === 'die' || sh.st === 'emerge') continue;
          if (Math.hypot(sh.x - an.x, (sh.y - an.y) * 1.3) < an.reach) {
            sh.st = 'die'; this.stats.gored++; this.score += A.kill;
            this.events.push({ kind: 'gore', who: name, x: sh.x, y: sh.y }); this._cues.emit(SoundCue.Hit);
          }
        }
        if (an.t >= A.pass) { an.t = 0; an.pass++; if (an.pass >= A.passes) { an.st = 'settle'; } }
      } else if (an.st === 'settle') {
        an.glow = Math.max(0, 1 - an.t / A.settle);
        if (an.t >= A.settle) { an.st = 'rest'; an.t = 0; an.cool = A.cool; }
      }
    }
  }
}
