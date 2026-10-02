// THE NODE · THE BEACON (cabinet level 3) · THE ROUND (ICabinetSim). Deterministic, headless, no DOM, no three.js.
//
// Star Castle, reshaped: you don't destroy the Beacon, you LIGHT it. Three rings of shields turn around a core (the inner
// and outer one way, the middle the other). Your ship flies outside them: LEFT / RIGHT turn, UP thrusts (it keeps its
// momentum), FIRE shoots short-lived shots; the ship and its shots wrap at the edges of the glass. A shot that meets a
// shield chips it (a few hits and it breaks, leaving a gap); a ring broken all the way round reforms. A shot that threads
// every ring and reaches the core LIGHTS THE BEACON: the scene swells brighter, part of the sacred figure draws outward,
// and every ring reforms (turning a little faster). Light it TUNE.lights times: CLEAR.
// The core fights back: when its (hidden) aim comes round to you it gathers light at its heart and sends a slow red
// homing shard (shoot it down or outfly it). The core itself never turns or looks at you (held, not hunted: its vesica
// is still); only the shard's flight is aimed. Touching a live shield, the core or a shard costs a ship. Out of ships: LOST.
//
//   reset(seed, credit, knobs)   step(dt, pad)    pad = BeaconPad (latched by the host)
//   state result score lives cues summary     collectStats(into)
//   read-only for views and bots: ship, ships, shots, shards, rings, core, phase, phaseTime, time, levelTime, why,
//   events (this step's: { kind, ... }), k (the resolved knobs), litCount
//
// FIXED TICK: step(dt) runs whole 1/60 s ticks, so a round plays the same at any frame rate; a FIRE press between ticks is
// held until the next tick. Every die comes from the round's own SystemRandom (seed).
import { CabinetState, RoundResult, SoundCue, CueBuffer, CreditInfo, KnobValues, SystemRandom } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { RINGS, CENTRE, CORE, FIG, WRAP, SPAWNS, ringLocal, slotAt, segSpan, segAngle, wrapAngle } from './layout.js';

const T = TUNE, STEP = T.step, TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** The panel: a stick (x = turn, y > 0 = thrust), FIRE (a, or b), START. Held states; latch() keeps this step and the
 *  last, so pressed() is an edge. */
export class BeaconPad {
  constructor() { this.cur = BeaconPad.frame(); this.prev = BeaconPad.frame(); }
  static frame(o = {}) { return { x: clamp(+o.x || 0, -1, 1), y: clamp(+o.y || 0, -1, 1), a: !!o.a, b: !!o.b, start: !!o.start }; }
  latch(o) { this.prev = this.cur; this.cur = BeaconPad.frame(o || {}); }
  clear() { this.cur = BeaconPad.frame(); this.prev = BeaconPad.frame(); }
  get x() { return this.cur.x; }
  get y() { return this.cur.y; }
  held(k) { return this.cur[k]; }
  pressed(k) { return this.cur[k] && !this.prev[k]; }
}

/** Wrap a point into the playfield (the ship and its shots). */
export function wrapXY(p) {
  const w = WRAP.x1 - WRAP.x0, h = WRAP.y1 - WRAP.y0;
  if (p.x < WRAP.x0) p.x += w; else if (p.x > WRAP.x1) p.x -= w;
  if (p.y < WRAP.y0) p.y += h; else if (p.y > WRAP.y1) p.y -= h;
}

/** Which live shield (if any) a circle of radius rad at (x, y) touches: { ring, j } or null (nearest slot first). */
export function shieldAt(rings, x, y, rad) {
  for (let i = 0; i < RINGS.length; i++) {
    const R = RINGS[i], loc = ringLocal(i, x, y);
    if (Math.abs(loc.r - R.R) > R.h + rad) continue;
    // exactly the drawn shield: a gap you can see is a gap a shot (or a daring ship) can thread
    const ring = rings[i], { j, off } = slotAt(i, loc.a, ring.rot), w = TAU / R.n, span = segSpan(i) + rad / R.R;
    for (const d of [0, -1, 1]) {
      const jj = (j + d + R.n) % R.n, s = ring.segs[jj];
      if (s.alive && Math.abs(off - d * w) <= span) return { ring: i, j: jj };
    }
  }
  return null;
}

export class BeaconRound {
  constructor() { this._cues = new CueBuffer(); this.reset(1, new CreditInfo(), new KnobValues()); }

  reset(seed, credit, knobs) {
    this.seed = seed || 1;
    this.rng = new SystemRandom(this.seed);
    this.credit = credit || new CreditInfo();
    const k = knobs || new KnobValues();
    this.k = { shards: k.get('shards', 1), spin: k.get('spin', 1), ships: Math.round(k.get('ships', T.ships)), shield: k.get('shield', 0) };
    if (this.credit.unlosable) this.k.shield = 1;
    this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0;
    this._result = RoundResult.None; this._cues.resetTotals();
    this.time = 0; this.levelTime = 0; this.why = '';
    this.score = 0; this.nextId = 1;
    this.ships = this.k.ships;
    this.ship = { x: 0, y: 0, vx: 0, vy: 0, a: 0, alive: true, thrust: 0, invuln: 0, lastShot: -9, diedAt: -9, respawnAt: -1, bornAt: 0, shieldAt: -9 };
    this._place(0);
    this.ship.invuln = 0;
    const spin0 = this.rng.nextDouble() * TAU;
    this.rings = RINGS.map((R, i) => ({
      rot: spin0 * (i + 1) * 0.37 % TAU, spin: T.rings[i].spin * R.dir * this.k.spin, spinK: 1, spinTarget: 1,
      clearedAt: -1,
      segs: Array.from({ length: R.n }, () => ({ alive: true, hp: T.rings[i].hp, hpMax: T.rings[i].hp, form: 1, formAt: -1, hitAt: -9, brokeAt: -9 })),
    }));
    // aim: where the next shard will be sent, turning a little late toward the ship. NEVER drawn (the core doesn't look)
    const aim0 = ringLocal(FIG.circle, this.ship.x, this.ship.y).a;
    this.core = { aim: aim0, charge: 0, cd: T.core.first, lit: 0, litAt: -9, chargeStart: -9 };
    this.shots = []; this.shards = [];
    this.events = []; this._acc = 0; this._tapAt = -9;
    this.stats = { shots: 0, chips: 0, breaks: 0, ringClears: 0, shardsFired: 0, shardsKilled: 0, deaths: 0, shielded: 0,
      coreHits: 0, lightTimes: [], bounces: 0, deathBy: { shard: 0, shield: 0, core: 0 } };
  }

  // ---- ICabinetSim ----
  get state() { return this._state; }
  get result() { return this._result; }
  get lives() { return this._state === CabinetState.Over || this._state === CabinetState.Card ? 0 : Math.max(0, this.ships); }
  get cues() { return this._cues; }
  get litCount() { return this.core.lit; }
  get summary() {
    return `lit ${this.core.lit}/${T.lights} score ${this.score} t ${this.levelTime.toFixed(1)} ships ${this.ships} ` +
      `shots ${this.stats.shots} breaks ${this.stats.breaks} shards ${this.stats.shardsKilled}/${this.stats.shardsFired} deaths ${this.stats.deaths} ` +
      `${this._result === RoundResult.Won ? 'CLEAR' : this._result === RoundResult.Lost ? 'LOST (' + this.why + ')' : ''}`;
  }
  collectStats(into) {
    const add = (n, v) => { into[n] = (into[n] || 0) + v; };
    add('seconds', this.levelTime); add('lit', this.core.lit); add('shots', this.stats.shots); add('breaks', this.stats.breaks);
    add('deaths', this.stats.deaths); add('shipsLeft', Math.max(0, this.ships));
  }

  step(dt, pad) {
    this.events.length = 0;
    this._cues.clear();
    this._pad = pad;
    // FIRE's edge, from either panel (BeaconPad: cur / prev; the SDK's CabinetInput: current / previous, whose pressed('a')
    // reads START, so the frames are read directly)
    const cur = pad && (pad.cur ?? pad.current), prev = pad && (pad.prev ?? pad.previous);
    if (cur && (cur.a || cur.b) && !(prev && (prev.a || prev.b))) this._tapAt = this.time;
    this._acc += clamp(dt, 0, 0.25);
    while (this._acc >= STEP) { this._acc -= STEP; this._tick(pad); }
  }

  // ---- one tick ----
  _tick(pad) {
    const dt = STEP;
    this.time += dt; this.phaseTime += dt;
    this._rings(dt);
    if (this._state === CabinetState.Over) return;
    if (this._state === CabinetState.Card) {
      this._shipMove(dt, null, false);
      this._shards(dt, false);
      this._shotsMove(dt, false);
      if (this.phaseTime >= (this._result === RoundResult.Won ? T.card.won : T.card.lost)) this._state = CabinetState.Over;
      return;
    }
    if (this._state === CabinetState.Intro) {
      this._shipMove(dt, pad, false);
      this._aim(dt, false);
      if (this.phaseTime >= T.ready) {
        this._state = CabinetState.Playing; this.phase = 'play'; this.phaseTime = 0;
        this.events.push({ kind: 'go' }); this._cues.emit(SoundCue.Start);
      }
      return;
    }
    this.levelTime += dt;
    if (this._state === CabinetState.Interlude) {        // THE LIGHTING: fly on, safe; the rings reform
      this._shipMove(dt, pad, true);
      this._bounce();
      this._shards(dt, false);
      this._shotsMove(dt, false);
      this._aim(dt, false);
      this._regrow(dt);
      if (this.phaseTime >= T.lit) {
        this._state = CabinetState.Playing; this.phase = 'play'; this.phaseTime = 0;
        this.core.cd = Math.max(this.core.cd, 1.6);
        this.events.push({ kind: 'go' }); this._cues.emit(SoundCue.Start);
      }
      return;
    }
    // THE PLAY
    const sh = this.ship;
    if (sh.alive) {
      this._shipMove(dt, pad, true);
      this._fire(pad);
    } else if (sh.respawnAt >= 0 && this.time >= sh.respawnAt) this._respawn();
    if (sh.invuln > 0) sh.invuln = Math.max(0, sh.invuln - dt);
    this._shotsMove(dt, true);
    if (this._state !== CabinetState.Playing) return;
    this._regrow(dt);
    this._aim(dt, true);
    this._shards(dt, true);
    if (this._state !== CabinetState.Playing) return;
    if (sh.alive && sh.invuln <= 0) this._shipHazards();
  }

  // ---- the rings ----
  _rings(dt) {
    for (const r of this.rings) {
      r.spinK += (r.spinTarget - r.spinK) * (1 - Math.exp(-dt / 1.2));
      r.rot = (r.rot + r.spin * r.spinK * dt) % TAU;
    }
  }

  /** A broken shield due to reform grows back; it only turns solid where the ship isn't (it waits for the ship to leave). */
  _regrow(dt) {
    this.rings.forEach((ring, i) => {
      ring.segs.forEach((s, j) => {
        if (s.alive || s.formAt < 0 || this.time < s.formAt) return;
        s.form = Math.min(1, s.form + dt / T.regrow.form);
        if (s.form < 1) return;
        if (this._overlapsShip(i, j)) { s.form = 0.999; return; }
        s.alive = true; s.form = 1; s.formAt = -1; s.hp = s.hpMax;
        this.events.push({ kind: 'formed', ring: i, j });
      });
      if (ring.clearedAt >= 0 && ring.segs.every((s) => s.alive)) ring.clearedAt = -1;
    });
  }

  _overlapsShip(i, j) {
    const sh = this.ship; if (!sh.alive) return false;
    const R = RINGS[i], loc = ringLocal(i, sh.x, sh.y), rad = T.ship.r + 6;
    if (Math.abs(loc.r - R.R) > R.h + rad) return false;
    const off = wrapAngle(loc.a - segAngle(i, j, this.rings[i].rot));
    return Math.abs(off) <= segSpan(i) + rad / R.R;
  }

  _hpMax(i) { const E = T.escalate.hp; return T.rings[i].hp + (E[Math.min(this.core.lit, E.length - 1)] || 0); }

  // ---- the ship ----
  _place(k) {
    const sh = this.ship, [x, y] = SPAWNS[k];
    sh.x = x; sh.y = y; sh.vx = 0; sh.vy = 0;
    sh.a = Math.atan2(CENTRE[1] - y, CENTRE[0] - x);
    sh.alive = true; sh.thrust = 0; sh.invuln = T.ship.invuln; sh.bornAt = this.time; sh.respawnAt = -1;
  }

  _respawn() {
    // come in where the core's aim must come round the farthest to find you
    let best = 0, bd = -1;
    SPAWNS.forEach((p, k) => {
      const a = ringLocal(FIG.circle, p[0], p[1]).a, d = Math.abs(wrapAngle(a - this.core.aim));
      if (d > bd + 1e-6) { bd = d; best = k; }
    });
    this._place(best);
    this.events.push({ kind: 'respawn', x: this.ship.x, y: this.ship.y });
  }

  _shipMove(dt, pad, canThrust) {
    const sh = this.ship, S = T.ship;
    if (!sh.alive) return;
    const turn = pad ? clamp(pad.x, -1, 1) : 0, thrust = pad && canThrust ? clamp(pad.y, 0, 1) : 0;
    sh.a = wrapAngle(sh.a + turn * S.turn * dt);
    sh.thrust = thrust;
    if (thrust > 0) { sh.vx += Math.cos(sh.a) * S.thrust * thrust * dt; sh.vy += Math.sin(sh.a) * S.thrust * thrust * dt; }
    const d = Math.exp(-S.drag * dt); sh.vx *= d; sh.vy *= d;
    const v = Math.hypot(sh.vx, sh.vy); if (v > S.maxSpeed) { sh.vx *= S.maxSpeed / v; sh.vy *= S.maxSpeed / v; }
    sh.x += sh.vx * dt; sh.y += sh.vy * dt;
    wrapXY(sh);
  }

  /** During the lighting a shield can't take a ship: it bounces it clear instead. */
  _bounce() {
    const sh = this.ship; if (!sh.alive) return;
    const hit = shieldAt(this.rings, sh.x, sh.y, T.ship.r * 0.85);
    if (!hit) return;
    const R = RINGS[hit.ring], loc = ringLocal(hit.ring, sh.x, sh.y), out = loc.r >= R.R ? 1 : -1;
    const nx = Math.cos(loc.a), ny = Math.sin(loc.a) * R.sy, nl = Math.hypot(nx, ny), ux = nx / nl * out, uy = ny / nl * out;
    const vn = sh.vx * ux + sh.vy * uy;
    if (vn < 0) { sh.vx -= 1.6 * vn * ux; sh.vy -= 1.6 * vn * uy; }
    sh.vx += ux * 40; sh.vy += uy * 40;
    this.stats.bounces++;
  }

  _fire(pad) {
    const sh = this.ship, S = T.shot, since = this.time - sh.lastShot;
    const tap = this.time - this._tapAt < 0.14 && since >= S.tap;
    const pc = pad && (pad.cur ?? pad.current);
    const held = pc && (pc.a || pc.b) && since >= S.auto;
    if (!(tap || held) || this.shots.length >= S.maxLive) return;
    const nx = Math.cos(sh.a), ny = Math.sin(sh.a);
    this.shots.push({ id: this.nextId++, x: sh.x + nx * 30, y: sh.y + ny * 30, vx: nx * S.speed, vy: ny * S.speed, t: 0, born: this.time,
      px: sh.x + nx * 30, py: sh.y + ny * 30 });
    sh.lastShot = this.time; this._tapAt = -9; this.stats.shots++;
    this.events.push({ kind: 'fire', x: sh.x + nx * 30, y: sh.y + ny * 30, a: sh.a });
  }

  // ---- the shots ----
  _shotsMove(dt, live) {
    const S = T.shot, sub = S.sub, h = dt / sub;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.t += dt; s.px = s.x; s.py = s.y;
      let gone = false;
      for (let q = 0; q < sub && !gone; q++) {
        s.x += s.vx * h; s.y += s.vy * h;
        const bx = s.x, by = s.y; wrapXY(s); if (s.x !== bx || s.y !== by) { s.px = s.x; s.py = s.y; s.wrapped = this.time; }
        if (!live) continue;
        gone = this._shotHits(s);
        if (this._state !== CabinetState.Playing) { this.shots.length = 0; return; }
      }
      if (gone || s.t >= S.life) { if (!gone) this.events.push({ kind: 'fizzle', x: s.x, y: s.y }); this.shots.splice(i, 1); }
    }
  }

  _shotHits(s) {
    const S = T.shot;
    // a shard
    for (const d of this.shards) {
      if (d.dying >= 0) continue;
      if (Math.hypot(d.x - s.x, d.y - s.y) <= T.shard.hitR) {
        d.dying = this.time; d.killed = true; this.stats.shardsKilled++;
        this.score += T.score.shard;
        this.events.push({ kind: 'shardKill', id: d.id, x: d.x, y: d.y, points: T.score.shard });
        this._cues.emit(SoundCue.Hit);
        return true;
      }
    }
    // the core
    const lc = ringLocal(FIG.circle, s.x, s.y);
    if (lc.r <= CORE.r) { this._light(s); return true; }
    // a shield
    const hit = shieldAt(this.rings, s.x, s.y, S.r);
    if (!hit) return false;
    const seg = this.rings[hit.ring].segs[hit.j];
    seg.hp--; seg.hitAt = this.time;
    const a = segAngle(hit.ring, hit.j, this.rings[hit.ring].rot);
    if (seg.hp <= 0) {
      seg.alive = false; seg.form = 0; seg.formAt = -1; seg.brokeAt = this.time; this.stats.breaks++;
      const pts = T.score.seg[hit.ring];
      this.score += pts;
      this.events.push({ kind: 'break', ring: hit.ring, j: hit.j, x: s.x, y: s.y, a, rot: this.rings[hit.ring].rot, points: pts });
      this._cues.emit(SoundCue.Hit);
      const ring = this.rings[hit.ring];
      if (ring.segs.every((q) => !q.alive)) {                  // broken all the way round: it reforms
        ring.clearedAt = this.time; this.stats.ringClears++;
        const R = RINGS[hit.ring], start = this.time + T.regrow.delay;
        ring.segs.forEach((q, j) => { q.formAt = start + ((j - hit.j + R.n) % R.n) * T.regrow.stagger; q.hpMax = this._hpMax(hit.ring); });
        this.events.push({ kind: 'ringClear', ring: hit.ring });
        this._cues.emit(SoundCue.Tick);
      }
    } else {
      this.stats.chips++;
      this.score += T.score.chip;
      this.events.push({ kind: 'chip', ring: hit.ring, j: hit.j, x: s.x, y: s.y, a, hp: seg.hp, hpMax: seg.hpMax });
      this._cues.emit(SoundCue.Hit);
    }
    return true;
  }

  // ---- THE LIGHTING ----
  _light(s) {
    const c = this.core;
    c.lit++; c.litAt = this.time; c.charge = 0; this.stats.coreHits++; this.stats.lightTimes.push(+this.levelTime.toFixed(2));
    const pts = T.score.light * c.lit;
    this.score += pts;
    this.events.push({ kind: 'light', n: c.lit, x: s.x, y: s.y, points: pts, last: c.lit >= T.lights });
    this._cues.emit(SoundCue.Bonus);
    for (const d of this.shards) if (d.dying < 0) { d.dying = this.time; this.events.push({ kind: 'shardFade', id: d.id, x: d.x, y: d.y }); }
    if (c.lit >= T.lights) { this._end(RoundResult.Won, 'lit'); return; }
    this._state = CabinetState.Interlude; this.phase = 'lit'; this.phaseTime = 0;
    // every ring reforms, a sweep from the core outward, and turns a little faster
    const F = T.reform;
    this.rings.forEach((ring, i) => {
      const hp = this._hpMax(i);
      ring.spinTarget = T.escalate.spin[Math.min(c.lit, T.escalate.spin.length - 1)];
      ring.segs.forEach((q, j) => {
        q.hpMax = hp;
        if (q.alive) { q.hp = hp; return; }
        q.formAt = this.time + F.start + i * 0.32 + j * F.stagger;
      });
    });
  }

  _end(result, why) {
    this._result = result; this._state = CabinetState.Card; this.phase = 'card'; this.phaseTime = 0; this.why = why;
    for (const d of this.shards) if (d.dying < 0) d.dying = this.time;
    if (result === RoundResult.Won) {
      const bonus = T.score.clear + T.score.shipLeft * Math.max(0, this.ships);
      this.score += bonus;
      this._cues.emit(SoundCue.Win); this.events.push({ kind: 'clear', bonus, ships: this.ships });
    } else { this._cues.emit(SoundCue.Die); this.events.push({ kind: 'out', why }); }
  }

  // ---- the core's aim (hidden) and its shards ----
  _aim(dt, live) {
    const c = this.core, sh = this.ship, lit = Math.min(c.lit, 2);
    if (sh.alive) {
      const want = ringLocal(FIG.circle, sh.x, sh.y).a, turn = T.core.aimTurn[lit] * dt;
      c.aim = wrapAngle(c.aim + clamp(wrapAngle(want - c.aim), -turn, turn));
    }
    if (!live) { c.charge = Math.max(0, c.charge - dt / 0.3); return; }
    c.cd -= dt;
    const aim = sh.alive ? Math.abs(wrapAngle(ringLocal(FIG.circle, sh.x, sh.y).a - c.aim)) : 9;
    const liveShards = this.shards.reduce((n, d) => n + (d.dying < 0 ? 1 : 0), 0);
    const can = sh.alive && sh.invuln <= 0 && c.cd <= 0 && liveShards < T.core.maxShards[lit];
    if (can && aim < T.core.lineUp) {
      if (c.charge === 0) { c.chargeStart = this.time; this.events.push({ kind: 'charge' }); this._cues.emit(SoundCue.Tick); }
      c.charge = Math.min(1, c.charge + dt / T.core.charge);
      if (c.charge >= 1) this._spawnShard();
    } else c.charge = Math.max(0, c.charge - dt / 0.35);
  }

  _spawnShard() {
    const c = this.core, lit = Math.min(c.lit, 2);
    const [x, y] = CENTRE;                                          // it leaves the heart, where the light gathered
    // it leaves sideways, alternating sides, and curves round to find you (never a straight shot down the line)
    this._side = -(this._side || 1);
    const L = T.shard.launch, a = Math.atan2(Math.sin(c.aim) * FIG.circle.sy, Math.cos(c.aim)) + this._side * (L[0] + (L[1] - L[0]) * this.rng.nextDouble());
    this.shards.push({ id: this.nextId++, x, y, a, speed: T.shard.speed[0] * this.k.shards, t: 0, born: this.time, dying: -1, killed: false,
      turn: T.shard.turn[lit] });
    c.charge = 0; c.cd = T.core.cooldown[lit] / this.k.shards; this.stats.shardsFired++;
    this.events.push({ kind: 'shard', x, y, a });
    this._cues.emit(SoundCue.Miss);
  }

  _shards(dt, live) {
    const S = T.shard, sh = this.ship;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const d = this.shards[i];
      d.t += dt;
      if (d.dying >= 0) {
        if (this.time - d.dying > S.fade) this.shards.splice(i, 1);
        else { d.x += Math.cos(d.a) * d.speed * 0.35 * dt; d.y += Math.sin(d.a) * d.speed * 0.35 * dt; }
        continue;
      }
      if (!live) { d.dying = this.time; continue; }
      if (sh.alive) {
        const u = Math.min(1, d.t / S.tighten), turn = (d.turn[0] + (d.turn[1] - d.turn[0]) * u * u) * dt;
        const want = Math.atan2(sh.y - d.y, sh.x - d.x);
        d.a = wrapAngle(d.a + clamp(wrapAngle(want - d.a), -turn, turn));
      }
      d.speed = Math.min(S.speed[1] * this.k.shards, d.speed + S.accel * this.k.shards * dt);
      d.x += Math.cos(d.a) * d.speed * dt; d.y += Math.sin(d.a) * d.speed * dt;
      const off = d.x < WRAP.x0 - 30 || d.x > WRAP.x1 + 30 || d.y < WRAP.y0 - 30 || d.y > WRAP.y1 + 30;
      if (d.t >= S.life || off) { d.dying = this.time; this.events.push({ kind: 'shardFade', id: d.id, x: d.x, y: d.y }); }
    }
  }

  // ---- what costs a ship ----
  _shipHazards() {
    const sh = this.ship, rs = T.ship.r;
    for (const d of this.shards) {
      if (d.dying >= 0) continue;
      if (Math.hypot(d.x - sh.x, d.y - sh.y) <= T.shard.r + rs * 0.8) { this._shipHit('shard', d); return; }
    }
    if (ringLocal(FIG.circle, sh.x, sh.y).r <= FIG.small + rs * 0.5) { this._shipHit('core', null); return; }
    const hit = shieldAt(this.rings, sh.x, sh.y, rs * 0.8);
    if (hit) this._shipHit('shield', hit);
  }

  _shipHit(cause, what) {
    const sh = this.ship;
    if (this.k.shield > 0 && this.ships <= 1) {            // MERCY: the last ship is thrown clear behind a shield
      sh.invuln = 1.6; sh.shieldAt = this.time; this.stats.shielded++;
      const loc = ringLocal(FIG.circle, sh.x, sh.y), ux = Math.cos(loc.a), uy = Math.sin(loc.a);
      sh.vx = ux * 300; sh.vy = uy * 300;
      if (cause === 'shard' && what) { what.dying = this.time; what.killed = true; }
      this.events.push({ kind: 'shield', x: sh.x, y: sh.y, cause });
      this._cues.emit(SoundCue.Miss);
      return;
    }
    sh.alive = false; sh.diedAt = this.time; sh.thrust = 0; this.ships--; this.stats.deaths++; this.stats.deathBy[cause]++;
    this.events.push({ kind: 'die', x: sh.x, y: sh.y, a: sh.a, vx: sh.vx, vy: sh.vy, cause, ring: what && what.ring });
    this._cues.emit(SoundCue.Miss);
    if (cause === 'shard' && what) { what.dying = this.time; what.killed = true; }
    for (const d of this.shards) if (d.dying < 0) { d.dying = this.time; this.events.push({ kind: 'shardFade', id: d.id, x: d.x, y: d.y }); }
    this.core.charge = 0;
    if (this.ships <= 0) { this._end(RoundResult.Lost, 'ships'); return; }
    sh.respawnAt = this.time + T.ship.respawn;
  }
}
