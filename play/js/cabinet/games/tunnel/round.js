// THE NODE · THE TUNNEL (cabinet level 7, the finale) · THE ROUND (ICabinetSim). Deterministic, headless, no DOM, no three.js.
//
// Tempest, reshaped by the story. You ride the RIM of the painted tunnel (18 lanes, layout.js), lane by lane: LEFT / RIGHT
// (a tap moves one lane, holding moves on smoothly). FIRE sends a shot straight down your lane (a press fires at once; held,
// it fires again every TUNE.shot.auto s). Six short waves of ECHOES climb out of the centre up the lanes, one earlier game
// each (spec.js). A shot breaks the first echo it meets in its lane. An echo that reaches the rim CRAWLS along it toward you
// (the short way round; the Ascent's crystals FLIP, Tempest's flippers): if it stays in your lane for TUNE.grab s it TAKES A
// SHIP (shoot it first: a shot at the rim breaks it at once). Each broken echo lets a MOTE of gold light flow down its lane
// into the HEART; the heart wakes as they arrive (heartLight / heartNeed).
// After the sixth wave: THE LET-GO. The echoes stop; shots dissolve into light before they land (nothing to hit anyway). A
// ring round the heart FILLS while no control is held (after TUNE.letgo.quiet s of stillness, full in TUNE.letgo.fill s) and
// DRAINS gently while any is. Nothing here can hurt you. Full: THE FALL (TUNE.fall.dur s: the ship leaves the rim and falls into
// the heart; the controls do nothing), then THE PASSAGE (the win). Out of ships in the waves: THE HEART SLEEPS (the loss).
//
//   reset(seed, credit, knobs)   step(dt, pad)    pad = TunnelPad (latched by the host): x (left / right), a / b (fire), start
//   read-only for views and bots: ship {pos, lane, target, alive, ward, lastShot}, shots, echoes, motes, wave (0..5), waveName,
//   waveLeft (echoes still to break this wave), wavesCleared, heartLight, heartNeed, wake (0..1), ring (0..1), quiet, busy,
//   hint, letgoT, fallT, phase ('ready' | 'play' | 'lost' | 'letgo' | 'fall' | 'card'), phaseTime, readyDur, time, levelTime,
//   events (this step's), k (the resolved knobs), stats, score, livesLeft; echoLanes(e) (the lanes an echo occupies)
//
// FIXED TICK: step(dt) runs whole 1/60 s ticks, so a round plays the same at any frame rate. A FIRE press between ticks is
// held briefly until a tick can fire it. Every die comes from the round's own SystemRandom (seed).
import { CabinetState, RoundResult, SoundCue, CueBuffer, CreditInfo, KnobValues, SystemRandom } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { N, mod, laneDist, W_SPAWN, W_HEART } from './layout.js';

const T = TUNE, STEP = T.step, E = T.echoes;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** The panel: a stick (x: left / right), FIRE (a, or b), START. Held states; latch() keeps this step and the last. */
export class TunnelPad {
  constructor() { this.cur = TunnelPad.frame(); this.prev = TunnelPad.frame(); }
  static frame(o = {}) { return { x: clamp(+o.x || 0, -1, 1), y: clamp(+o.y || 0, -1, 1), a: !!o.a, b: !!o.b, start: !!o.start }; }
  latch(o) { this.prev = this.cur; this.cur = TunnelPad.frame(o || {}); }
  clear() { this.cur = TunnelPad.frame(); this.prev = TunnelPad.frame(); }
  get x() { return this.cur.x; }
  get y() { return this.cur.y; }
  held(k) { return this.cur[k]; }
  pressed(k) { return this.cur[k] && !this.prev[k]; }
}

export class TunnelRound {
  constructor() {
    this._cues = new CueBuffer();
    this.reset(1, new CreditInfo(), new KnobValues());
  }

  reset(seed, credit, knobs) {
    this.seed = seed || 1;
    this.rng = new SystemRandom(this.seed);
    this.credit = credit || new CreditInfo();
    const k = knobs || new KnobValues();
    this.k = { speed: k.get('speed', 1), count: k.get('count', 1), grab: k.get('grab', 1), lives: Math.round(k.get('lives', T.lives)),
      ward: k.get('ward', 0) };
    if (this.credit.unlosable) this.k.ward = 1;
    this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.ready;
    this._result = RoundResult.None; this._cues.resetTotals();
    this.time = 0; this.levelTime = 0; this.why = '';
    this.score = 0; this.livesLeft = this.k.lives;
    this.ship = { pos: T.ship.start, lane: T.ship.start, target: T.ship.start, dir: 0, alive: true, ward: 0, lastShot: -9, heldFor: 0 };
    this.shots = []; this.echoes = []; this.motes = [];
    this.nextId = 1; this._fireAt = -9; this._fireHeld = false; this._moveTap = 0;
    // the waves: how many of each (the mercy's count knob; three at the least), and the plan's total motes (the heart's need)
    this.plan = T.waves.map((w) => ({ ...w, count: Math.max(3, Math.round(w.count * this.k.count)) }));
    this.heartNeed = this.plan.reduce((a, w) => a + w.count * (w.kind === 'kite' ? 2 : 1), 0);
    this.heartLight = 0; this.wavesCleared = 0;
    this._startWave(0, 0.6);
    // the let-go and the fall
    this.ring = 0; this.quiet = 0; this.busy = 0; this.hint = false; this.letgoT = 0; this.fallT = 0;
    this.events = []; this._acc = 0;
    this.stats = { shots: 0, kills: 0, rimKills: 0, crawled: 0, grabs: 0, warded: 0, spawned: 0, dissolved: 0, deathsAt: [], waveAt: [],
      letgoAt: -1, fallAt: -1, letgoSeconds: 0, ringMaxWhileBusy: 0, busySeconds: 0, splits: 0, cracks: 0, hops: 0 };
  }

  // ---- ICabinetSim ----
  get state() { return this._state; }
  get result() { return this._result; }
  get lives() { return this._state === CabinetState.Over || this._state === CabinetState.Card ? 0 : Math.max(0, this.livesLeft); }
  get cues() { return this._cues; }
  get summary() {
    return `wave ${Math.min(6, this.wavesCleared + (this.phase === 'play' ? 1 : 0))}/6 score ${this.score} t ${this.levelTime.toFixed(1)} ships ${this.livesLeft} ` +
      `kills ${this.stats.kills} (rim ${this.stats.rimKills}) grabs ${this.stats.grabs} letgo ${this.stats.letgoSeconds.toFixed(1)}s ` +
      `${this._result === RoundResult.Won ? 'CLEAR' : this._result === RoundResult.Lost ? 'LOST (' + this.why + ')' : ''}`;
  }
  collectStats(into) {
    const add = (n, v) => { into[n] = (into[n] || 0) + v; };
    add('seconds', this.levelTime); add('waves', this.wavesCleared); add('kills', this.stats.kills); add('grabs', this.stats.grabs);
    add('livesLeft', Math.max(0, this.livesLeft));
  }

  /** How awake the heart is (0 asleep .. 1): the gold light that has arrived, of what the six waves hold. */
  get wake() { return this.phase === 'letgo' || this.phase === 'fall' || (this.phase === 'card' && this._result === RoundResult.Won) ? 1 : Math.min(1, this.heartLight / this.heartNeed); }
  get waveName() { return this.plan[Math.min(5, this.wave)].name; }
  /** The echoes still to break this wave (queued + on the glass; a kite counts its two halves). */
  get waveLeft() {
    let n = this.queue.length;
    for (const e of this.echoes) if (e.alive) n += e.kind === 'kite' ? 2 : 1;
    return n;
  }
  /** The lanes an echo occupies right now (a shard spans two). */
  echoLanes(e) {
    const l = e.slide ? mod(e.to) : mod(Math.round(e.q));          // (a kite's half belongs to its new lane the moment it splits)
    return e.kind === 'shard' ? [l, mod(l + 1)] : [l];
  }

  step(dt, pad) {
    this.events.length = 0;
    this._cues.clear();
    // FIRE's edge and hold, from either panel (TunnelPad: cur / prev; the SDK's CabinetInput: current / previous)
    const cur = pad && (pad.cur ?? pad.current), prev = pad && (pad.prev ?? pad.previous);
    if (cur && (cur.a || cur.b) && !(prev && (prev.a || prev.b))) this._fireAt = this.time;
    this._fireHeld = !!(cur && (cur.a || cur.b));
    // LEFT / RIGHT's edge too: a one-frame tap on a frame that runs no whole tick still moves a lane on the next tick
    const dn = cur ? (cur.x > 0.5 ? 1 : cur.x < -0.5 ? -1 : 0) : 0, dp = prev ? (prev.x > 0.5 ? 1 : prev.x < -0.5 ? -1 : 0) : 0;
    if (dn !== 0 && dn !== dp) this._moveTap = dn;
    this._acc += clamp(dt, 0, 0.25);
    while (this._acc >= STEP) { this._acc -= STEP; this._tick(pad); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  _tick(pad) {
    const dt = STEP;
    this.time += dt; this.phaseTime += dt;
    if (this._state === CabinetState.Over) return;
    this._motesTick(dt);
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
    if (this._state === CabinetState.Interlude) {         // A SHIP LOST: everything holds while it breaks
      if (this.phaseTime >= T.lost) {
        if (this.livesLeft <= 0) { this._end(RoundResult.Lost, this.why || 'ships'); return; }
        this.ship.alive = true;
        this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.readyAgain;
        this.events.push({ kind: 'again' });
      }
      return;
    }
    // PLAYING: the waves, the let-go or the fall
    this.levelTime += dt;
    if (this.phase === 'fall') {
      this.fallT += dt;
      this._shotsTick(dt);
      if (this.fallT >= T.fall.dur) this._end(RoundResult.Won, 'passage');
      return;
    }
    const s = this.ship;
    if (s.ward > 0) s.ward = Math.max(0, s.ward - dt);
    this._move(dt, pad);
    this._fire();
    this._shotsTick(dt);
    if (this.phase === 'letgo') { this._letgoTick(dt, pad); return; }
    this._echoesTick(dt);
    if (this._state !== CabinetState.Playing) return;
    this._waveTick(dt);
  }

  // ---- the ship: lane to lane round the rim ----
  _move(dt, pad) {
    const s = this.ship;
    if (!s.alive) return;
    const x = pad ? pad.x : 0;
    let dir = x > 0.5 ? 1 : x < -0.5 ? -1 : 0;
    if (dir === 0 && this._moveTap && s.dir === 0) dir = this._moveTap;          // (a tap no tick saw)
    this._moveTap = 0;
    if (dir !== 0) {
      if (dir !== s.dir) s.target = Math.round(s.pos) + dir;                 // a fresh press: one lane over
      else if (Math.abs(s.target - s.pos) < 0.35) s.target += dir;            // held: on to the next, without a pause
      s.heldFor += dt;
    } else s.heldFor = 0;
    s.dir = dir;
    const d = s.target - s.pos, v = T.ship.speed * dt;
    s.pos += Math.abs(d) <= v ? d : Math.sign(d) * v;
    // keep the numbers small (the lanes wrap round)
    if (s.pos > 4 * N || s.pos < -4 * N) { const sh = N * Math.floor(s.pos / N); s.pos -= sh; s.target -= sh; }
    const lane = mod(Math.round(s.pos));
    if (lane !== s.lane) { s.lane = lane; this.events.push({ kind: 'lane', lane }); }
  }

  // ---- shots ----
  _fire() {
    const s = this.ship, P = T.shot;
    if (!s.alive) return;
    const pressed = this.time - this._fireAt <= 0.12;
    const auto = this._fireHeld && this.time - s.lastShot >= P.auto;
    if (!pressed && !auto) return;
    if (this.time - s.lastShot < P.cooldown || this.shots.length >= P.maxLive) return;
    const lane = s.lane;
    const shot = { id: this.nextId++, lane, w: 1, born: this.time, dissolve: this.phase === 'letgo' };
    s.lastShot = this.time; this._fireAt = -9; this.stats.shots++;
    this.events.push({ kind: 'fire', lane, id: shot.id, dissolve: shot.dissolve });
    // point blank: an echo at the rim in this lane breaks at once
    if (!shot.dissolve) {
      const hit = this._rimEchoIn(lane);
      if (hit) { this._hit(hit, shot); return; }
    }
    this.shots.push(shot);
  }
  _rimEchoIn(lane) {
    for (const e of this.echoes) if (e.alive && e.rim && this.echoLanes(e).includes(lane)) return e;
    return null;
  }
  _shotsTick(dt) {
    const P = T.shot, h = dt / P.sub;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      let gone = false;
      for (let q = 0; q < P.sub && !gone; q++) {
        const w0 = sh.w; sh.w += P.speed * h;
        if (sh.dissolve) {                               // THE LET-GO: it turns to light before it lands
          if (sh.w >= T.letgo.dissolveW) { gone = true; this.stats.dissolved++; this.events.push({ kind: 'dissolve', id: sh.id, lane: sh.lane, w: sh.w }); }
          continue;
        }
        // the first echo it meets in its lane (the nearest: the smallest w it has passed)
        let hit = null;
        for (const e of this.echoes) {
          if (!e.alive || e.rim || e.w < 0 || !this.echoLanes(e).includes(sh.lane)) continue;
          if (e.w + P.hitW >= w0 && e.w - P.hitW <= sh.w && (!hit || e.w < hit.w)) hit = e;
        }
        if (hit) { gone = true; this._hit(hit, sh); }
        else if (sh.w >= P.end) { gone = true; this.events.push({ kind: 'gone', id: sh.id, lane: sh.lane }); }
      }
      if (gone) this.shots.splice(i, 1);
      if (this._state !== CabinetState.Playing) return;
    }
  }

  // ---- the echoes ----
  _spawnEcho(kind, lane, o = {}) {
    const e = { id: this.nextId++, kind, q: lane, w: o.w ?? W_SPAWN, alive: true, rim: false, born: this.time, hp: kind === 'shard' ? E.shard.hp : 1,
      from: lane, to: lane, moveT: -1, restT: 0, grabT: 0, hopT: 0, crackedAt: -9, parent: o.parent ?? 0, flip: 0 };
    if (kind === 'hunter') e.hopT = this._range(E.hunter.hop);
    if (kind === 'half') { e.from = o.from; e.to = lane; e.q = o.from; e.moveT = 0; e.slide = true; }
    this.echoes.push(e); this.stats.spawned++;
    this.events.push({ kind: 'spawn', id: e.id, echo: kind, lane, w: e.w });
    return e;
  }
  _range([a, b]) { return a + (b - a) * this.rng.nextDouble(); }
  _speed(e) { return E[e.kind].speed * this.k.speed; }

  _echoesTick(dt) {
    const s = this.ship;
    for (const e of this.echoes) {
      if (!e.alive) continue;
      const D = E[e.kind];
      // a lane change in progress (a hunter's hop, a half's slide, a crawl or flip along the rim)
      if (e.moveT >= 0) {
        const dur = e.slide ? E.half.slide : e.rim ? D.move : E.hunter.hopT;
        e.moveT += dt;
        const u = Math.min(1, e.moveT / dur);
        e.q = e.from + (e.to - e.from) * (u * u * (3 - 2 * u));
        if (e.kind === 'crystal' && e.rim) e.flip = u;
        if (u >= 1) { e.q = e.to = mod(e.to); e.from = e.q; e.moveT = -1; e.slide = false; e.restT = 0; e.flip = 0; }
      }
      if (!e.rim) {
        // CLIMB
        e.w -= this._speed(e) * dt;
        if (e.kind === 'hunter' && e.moveT < 0 && e.w > 1.25) {
          e.hopT -= dt;
          if (e.hopT <= 0) {
            e.hopT = this._range(D.hop);
            const toward = laneDist(Math.round(e.q), s.lane);
            const dir = (toward !== 0 && this.rng.nextDouble() < D.toward) ? Math.sign(toward) : (this.rng.nextDouble() < 0.5 ? -1 : 1);
            e.from = e.q; e.to = e.q + dir; e.moveT = 0; this.stats.hops++;
            this.events.push({ kind: 'hop', id: e.id, from: mod(e.from), to: mod(e.to) });
          }
        }
        if (e.w <= 1) {
          e.w = 1; e.rim = true; e.restT = 0; e.rimAt = this.time; this.stats.crawled++;
          this.events.push({ kind: 'rim', id: e.id, echo: e.kind, lane: mod(Math.round(e.q)) });
        }
        continue;
      }
      // ON THE RIM: pause, then cross to the next lane toward the ship (the short way round)
      if (e.moveT < 0 && s.alive) {
        const lanes = this.echoLanes(e);
        const here = lanes.includes(s.lane);
        if (!here) {
          e.restT += dt;
          if (e.restT >= D.rest) {
            let d = laneDist(mod(Math.round(e.q)), s.lane);
            if (e.kind === 'shard' && d > 0) d -= 1;                      // (it spans q and q+1)
            if (d !== 0) { e.from = e.q; e.to = e.q + Math.sign(d); e.moveT = 0; this.events.push({ kind: e.kind === 'crystal' ? 'flip' : 'crawl', id: e.id, from: mod(e.from), to: mod(e.to) }); }
          }
        }
      }
      // THE GRAB: in the ship's lane (arrived, or the ship moved in) for TUNE.grab s: a ship
      const inLane = s.alive && this.echoLanes(e).includes(s.lane);
      e.grabT = inLane ? e.grabT + dt : 0;
      if (inLane && e.grabT >= T.grab * this.k.grab && s.ward <= 0) {
        this._grab(e);
        if (this._state !== CabinetState.Playing) return;
      }
    }
    this.echoes = this.echoes.filter((e) => e.alive);
  }

  _hit(e, shot) {
    const D = E[e.kind], lane = shot.lane;
    if (e.kind === 'shard' && e.hp > 1) {                  // THE BEACON's shard: the first hit cracks it
      e.hp--; e.crackedAt = this.time; this.stats.cracks++;
      this.score += D.pts;
      this.events.push({ kind: 'crack', id: e.id, lane, w: e.w, q: e.q, pts: D.pts });
      this._cues.emit(SoundCue.Tick);
      return;
    }
    e.alive = false;
    if (e.kind === 'kite') {                               // THE RESONANCE's kite: it splits, the halves slide either side
      this.stats.splits++;
      this.score += D.pts;
      const l = mod(Math.round(e.q)), kids = [];
      for (const d of [-1, 1]) kids.push(this._spawnEcho('half', l + d, { w: e.w, from: l, parent: e.id }).id);
      this.events.push({ kind: 'split', id: e.id, lane: l, w: e.w, q: e.q, kids, pts: D.pts });
      this._cues.emit(SoundCue.Hit);
      return;
    }
    const pts = D.pts;
    this.score += pts; this.stats.kills++; if (e.rim) this.stats.rimKills++;
    this.events.push({ kind: 'kill', id: e.id, echo: e.kind, lane: mod(Math.round(e.q)), q: e.q, w: e.w, rim: e.rim, pts });
    this._cues.emit(SoundCue.Hit);
    // its light flows down its lane into the heart
    this.motes.push({ id: e.id, q: e.kind === 'shard' ? e.q + 0.5 : e.q, w: Math.max(1, e.w), born: this.time });
  }

  _grab(e) {
    const s = this.ship;
    if (this.k.ward > 0 && this.livesLeft <= 1) {           // MERCY: the last ship is warded: the echo breaks on it
      e.alive = false; this.stats.warded++; s.ward = 1.4;
      this.events.push({ kind: 'ward', id: e.id, echo: e.kind, lane: s.lane, q: e.q });
      this._cues.emit(SoundCue.Miss);
      this.motes.push({ id: e.id, q: e.q, w: 1, born: this.time });
      return;
    }
    this.stats.grabs++;
    this.livesLeft--; this.why = 'grabbed'; s.alive = false;
    this.stats.deathsAt.push(+this.levelTime.toFixed(1));
    this.events.push({ kind: 'lifeLost', why: 'grabbed', echo: e.kind, id: e.id, lane: s.lane, left: this.livesLeft });
    this._cues.emit(SoundCue.Miss);
    // the echoes sink back down the tunnel: this wave's live ones go back in its queue (a split kite's halves come again as
    // halves), and the ones in flight are gone
    for (const o of this.echoes) {
      if (!o.alive) continue;
      o.alive = false;
      this.events.push({ kind: 'sink', id: o.id, echo: o.kind, q: o.q, w: o.w });
      this.queue.unshift(o.kind === 'half' ? 'half' : o.kind);
    }
    for (const sh of this.shots) this.events.push({ kind: 'gone', id: sh.id, lane: sh.lane });
    this.shots.length = 0;
    this.echoes = [];
    this.spawnT = Math.max(this.spawnT, 0.6);
    this._state = CabinetState.Interlude; this.phase = 'lost'; this.phaseTime = 0;
  }

  // ---- the waves ----
  _startWave(i, gap) {
    this.wave = i;
    const W = this.plan[i];
    this.queue = new Array(W.count).fill(W.kind);
    this.spawnT = gap;
    this._lastLane = -9;
    this._bannerDue = true;
  }
  _waveTick(dt) {
    if (this._bannerDue) {
      this._bannerDue = false;
      this.events.push({ kind: 'wave', wave: this.wave, name: this.plan[this.wave].name, echo: this.plan[this.wave].kind });
      this.stats.waveAt.push(+this.levelTime.toFixed(1));
    }
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0) {
      this.spawnT = this.plan[this.wave].every;
      const kind = this.queue.shift();
      // a lane: not the last one used, and (early on) not right on top of the ship
      let lane = 0;
      for (let tries = 0; tries < 12; tries++) {
        lane = Math.floor(this.rng.nextDouble() * N);
        if (lane === this._lastLane || (kind === 'shard' && lane === mod(this._lastLane + 1))) continue;
        if (Math.abs(laneDist(lane, this.ship.lane)) < 2 && tries < 6) continue;
        break;
      }
      this._lastLane = lane;
      if (kind === 'half') {                               // (a returning half: it climbs again as a half, from the centre)
        const e = this._spawnEcho('half', lane, { from: lane }); e.moveT = -1; e.slide = false; e.q = lane;
      } else this._spawnEcho(kind, lane);
    }
    if (this.queue.length === 0 && this.echoes.length === 0) {
      this.wavesCleared++;
      const bonus = T.score.waveClear * this.wavesCleared;
      this.score += bonus;
      this.events.push({ kind: 'waveClear', wave: this.wave, bonus });
      this._cues.emit(SoundCue.Bonus);
      if (this.wave + 1 < this.plan.length) this._startWave(this.wave + 1, T.waveGap);
      else this._startLetGo();
    }
  }

  // ---- THE LET-GO ----
  _startLetGo() {
    this.phase = 'letgo'; this.phaseTime = 0; this.letgoT = 0; this.ring = 0; this.quiet = 0; this.busy = 0; this.hint = false;
    this.stats.letgoAt = +this.levelTime.toFixed(2);
    this.events.push({ kind: 'letgo' });
  }
  _letgoTick(dt, pad) {
    const L = T.letgo, c = pad && (pad.cur ?? pad.current);
    const any = !!c && (Math.abs(c.x) > 0.2 || Math.abs(c.y) > 0.2 || c.a || c.b || c.start);
    this.letgoT += dt; this.stats.letgoSeconds += dt;
    if (any) this.quiet = 0; else this.quiet += dt;
    if (this.quiet < L.quiet) { this.busy += dt; this.stats.busySeconds += dt; }      // a hand on the controls (or just off them)
    if (this.letgoT >= L.intro) {
      if (this.quiet >= L.quiet) {
        const u = Math.min(1, (this.quiet - L.quiet) / (L.settle - L.quiet)), ease = u * u * (3 - 2 * u);
        this.ring = Math.min(1, this.ring + ease * dt / L.fill);
      } else this.ring = Math.max(0, this.ring - L.drain * dt);
    }
    if (any) this.stats.ringMaxWhileBusy = Math.max(this.stats.ringMaxWhileBusy, this.ring);
    if (!this.hint && this.busy >= L.hintAfter && this.ring < 0.2) { this.hint = true; this.events.push({ kind: 'hint' }); }
    if (!any && this.quiet > 1.5) this.busy = Math.max(0, this.busy - dt);
    if (this.ring >= 1) {
      this.phase = 'fall'; this.fallT = 0; this.stats.fallAt = +this.levelTime.toFixed(2);
      this.events.push({ kind: 'fall', lane: this.ship.lane });
      this._cues.emit(SoundCue.Bonus);
    }
  }

  // ---- the gold light: down the lane into the heart ----
  _motesTick(dt) {
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.w += T.mote.speed * dt * (0.55 + 0.45 * Math.min(1, (this.time - m.born) / 0.4));
      if (m.w >= T.mote.heartW) {
        this.motes.splice(i, 1);
        this.heartLight++;
        this.events.push({ kind: 'arrive', id: m.id, light: this.heartLight, need: this.heartNeed });
      }
    }
  }

  _end(result, why) {
    this._result = result; this._state = CabinetState.Card; this.phase = 'card'; this.phaseTime = 0; this.why = why;
    if (result === RoundResult.Won) {
      const bonus = T.score.passage + T.score.shipLeft * Math.max(0, this.livesLeft);
      this.score += bonus;
      this.shots.length = 0;
      this._cues.emit(SoundCue.Win); this.events.push({ kind: 'clear', bonus, lives: this.livesLeft });
    } else { this._cues.emit(SoundCue.Die); this.events.push({ kind: 'out', why }); }
  }
}
export { W_HEART };
