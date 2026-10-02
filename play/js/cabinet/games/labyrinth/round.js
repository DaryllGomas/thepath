// THE NODE · THE LABYRINTH (cabinet level 4) · THE ROUND (ICabinetSim). Deterministic, headless, no DOM, no three.js.
//
// Pac-Man, reshaped: a sacred maze of glowing corridors, and you GATHER THE LIGHT (the gold nodes along the lanes). Four
// red pursuers hunt you, each its own way (the Hunter chases, the Ambush heads you off, the Warden keeps the heart until
// you come near, the Drifter comes and goes), in a scatter / chase rhythm, a little faster as the round goes on. Four
// gold diamonds wait in the corner shrines: take one and for a few seconds the pursuers turn pale and flee, and you can
// BANISH them (they re-form in the heart). THE REBUILD: every ~11 s one group of rooms (the four shrines, then the two
// wings, then the heart) brightens, then turns a quarter: some doors close, others open. The rooms keep their hidden
// skeleton, so the maze comes round again (the same few arrangements). A turning room carries whatever is inside it; it
// only turns once no one stands in its doorways. Gather TUNE.share of the light: CLEAR. Caught with no lives left: LOST.
//
//   reset(seed, credit, knobs)   step(dt, pad)    pad = LabyrinthPad (latched by the host)
//   state result score lives cues summary     collectStats(into)
//   read-only for views and bots: player, pursuers, light, gathered, total, target, secK, rebuild, open, phase, phaseTime,
//   time, levelTime, mode, why, events (this step's: { kind, ... }), k (the resolved knobs), apsp; roomAngle(sec),
//   worldAt(e, s) (a turning room carries what's on it), emergeIn(q) (the tell)
//
// FIXED TICK: step(dt) runs whole 1/60 s ticks, so a round plays the same at any frame rate. Every die comes from the
// round's own SystemRandom (seed).
import { CabinetState, RoundResult, SoundCue, CueBuffer, CreditInfo, KnobValues, SystemRandom } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { NODES, EDGES, SECTIONS, GROUPS, GROUP_SECTIONS, HEART, START, CHASER_START, DIM, other, leaveDir, edgePoint, rotAbout,
  openAfter, placeLight, apspFor, pointToNode } from './layout.js';

const T = TUNE, STEP = T.step, HALF_PI = Math.PI / 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));   // the rooms turn smoothly (never a jump)

/** The panel: a stick (x, y: y > 0 = DOWN; the last pressed direction, or the stick), START, a button. */
export class LabyrinthPad {
  constructor() { this.cur = LabyrinthPad.frame(); this.prev = LabyrinthPad.frame(); }
  static frame(o = {}) { return { x: clamp(+o.x || 0, -1, 1), y: clamp(+o.y || 0, -1, 1), a: !!o.a, b: !!o.b, start: !!o.start }; }
  latch(o) { this.prev = this.cur; this.cur = LabyrinthPad.frame(o || {}); }
  clear() { this.cur = LabyrinthPad.frame(); this.prev = LabyrinthPad.frame(); }
  get x() { return this.cur.x; }
  get y() { return this.cur.y; }
  held(k) { return this.cur[k]; }
  pressed(k) { return this.cur[k] && !this.prev[k]; }
}

/** The four pursuers: their way of hunting and the corner they fall back to when they scatter. */
export const PURSUERS = Object.freeze([
  { name: 'HUNTER', kind: 'chase', corner: 'TR' },
  { name: 'AMBUSH', kind: 'ambush', corner: 'TL' },
  { name: 'WARDEN', kind: 'patrol', corner: 'BR' },
  { name: 'DRIFTER', kind: 'wander', corner: 'BL' },
]);
const cornerNode = (tag) => {
  const sx = tag[1] === 'L' ? -1 : 1, sy = tag[0] === 'T' ? -1 : 1;
  return NODES.find((n) => n.sec < 0 && Math.abs(n.lx - sx * (DIM.SIDE - DIM.CH)) < 0.5 && Math.abs(n.ly - sy * DIM.TOP) < 0.5).id;
};
const CORNERS = Object.fromEntries(['TL', 'TR', 'BL', 'BR'].map((t) => [t, cornerNode(t)]));
// the Warden's beat: the octagon round the heart, clockwise
export const RING_VERTS = ['vN', 'vE', 'vS', 'vW'].map((k) => HEART.slots[k]);
const OCTAGON = NODES.filter((n) => n.sec < 0 && Math.abs(Math.max(Math.abs(n.lx), Math.abs(n.ly)) - (DIM.RH + 20)) < 0.5 &&
  Math.min(Math.abs(n.lx), Math.abs(n.ly)) <= DIM.OCT + 0.5 && n.doorOf == null)
  .map((n) => ({ id: n.id, ang: Math.atan2(n.ly, n.lx) })).sort((a, b) => a.ang - b.ang);

export class LabyrinthRound {
  constructor() {
    this._cues = new CueBuffer();
    this.reset(1, new CreditInfo(), new KnobValues());
    if (!LabyrinthRound._warm) { LabyrinthRound._warm = true; this._warmPaths(); this.reset(1, new CreditInfo(), new KnobValues()); }
  }

  /** Every door arrangement a round can reach (each group's two arrangements x which group, if any, is mid-turn) has its
   *  shortest paths computed once, up front (page load), so no frame in play ever pays for a new one (~4 ms each). */
  _warmPaths() {
    const groups = GROUPS.map((g) => GROUP_SECTIONS[g]);
    for (let m = 0; m < 8; m++) for (let turn = -1; turn < groups.length; turn++) {
      groups.forEach((secs, gi) => { for (const s of secs) { this.secK[s] = (m >> gi) & 1; this.turning[s] = gi === turn ? 1 : 0; } });
      this._refreshOpen();
    }
  }

  reset(seed, credit, knobs) {
    this.seed = seed || 1;
    this.rng = new SystemRandom(this.seed);
    this.credit = credit || new CreditInfo();
    const k = knobs || new KnobValues();
    this.k = { pace: k.get('pace', 1), lives: Math.round(k.get('lives', T.lives)), share: k.get('share', T.share), ward: k.get('ward', 0) };
    if (this.credit.unlosable) this.k.ward = 1;
    this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.ready;
    this._result = RoundResult.None; this._cues.resetTotals();
    this.time = 0; this.levelTime = 0; this.why = '';
    this.score = 0; this.livesLeft = this.k.lives;
    // the maze's state: every room at its base arrangement, every door as it opens
    this.secK = SECTIONS.map(() => 0);
    this.open = new Uint8Array(EDGES.length);
    this.warned = new Uint8Array(SECTIONS.length);      // pursuers keep out of a warned / turning room
    this.turning = new Uint8Array(SECTIONS.length);
    this.rebuild = { gi: 0, nextAt: T.rebuild.first, cur: null, count: 0 };
    this._refreshOpen();
    // the light
    this.light = placeLight().map((l) => ({ ...l, eaten: false, at: -9 }));
    this.total = this.light.length; this.gathered = 0;
    this.target = Math.ceil(this.total * this.k.share - 1e-9);
    // the ship and the pursuers
    this.player = { e: 0, s: 0, dir: 1, moving: false, heading: [-1, 0], want: null, x: 0, y: 0, alive: true, ward: 0, wardAt: -9, lastEat: -9 };
    this.pursuers = PURSUERS.map((d, i) => ({ i, name: d.name, kind: d.kind, corner: CORNERS[d.corner], st: 'pen', e: 0, s: 0, dir: 1,
      heading: [1, 0], x: 0, y: 0, t: 0, frightUntil: -9, frightAt: -9, releaseAt: 0, rev: false, beat: 0, formedAt: -9, bornAt: -9 }));
    this._placeAll();
    this.mode = 'scatter'; this.modeIdx = 0; this.modeT = 0;
    this.powerN = 0;                   // banishes in this power (200, 400, 800, 1600)
    this.events = []; this._acc = 0; this._dp = null;
    this.stats = { gathered: 0, power: 0, banished: 0, caught: 0, warded: 0, rebuilds: 0, holds: 0, forced: 0, carriedPlayer: 0,
      carriedLight: 0, stranded: 0, trapped: 0, turns: [], deathsAt: [] };
    this._updateWorld();
  }

  // ---- ICabinetSim ----
  get state() { return this._state; }
  get result() { return this._result; }
  get lives() { return this._state === CabinetState.Over || this._state === CabinetState.Card ? 0 : Math.max(0, this.livesLeft); }
  get cues() { return this._cues; }
  get summary() {
    return `light ${this.gathered}/${this.total} (target ${this.target}) score ${this.score} t ${this.levelTime.toFixed(1)} lives ${this.livesLeft} ` +
      `rebuilds ${this.stats.rebuilds} banished ${this.stats.banished} caught ${this.stats.caught} ` +
      `${this._result === RoundResult.Won ? 'CLEAR' : this._result === RoundResult.Lost ? 'LOST (' + this.why + ')' : ''}`;
  }
  collectStats(into) {
    const add = (n, v) => { into[n] = (into[n] || 0) + v; };
    add('seconds', this.levelTime); add('gathered', this.gathered); add('caught', this.stats.caught); add('rebuilds', this.stats.rebuilds);
    add('livesLeft', Math.max(0, this.livesLeft));
  }

  step(dt, pad) {
    this.events.length = 0;
    this._cues.clear();
    if (pad) {
      const x = pad.x, y = pad.y, m = Math.hypot(x, y);
      if (m > 0.35) this.player.want = [x / m, y / m];     // the buffered turn: kept until a junction takes it (or a new one)
    }
    this._acc += clamp(dt, 0, 0.25);
    while (this._acc >= STEP) { this._acc -= STEP; this._tick(); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  _tick() {
    const dt = STEP;
    this.time += dt; this.phaseTime += dt; this._dp = null;
    if (this._state === CabinetState.Over) return;
    if (this._state === CabinetState.Card) {
      if (this.phaseTime >= (this._result === RoundResult.Won ? T.card.won : T.card.lost)) this._state = CabinetState.Over;
      return;
    }
    if (this._state === CabinetState.Intro) {
      if (this.phaseTime >= this.readyDur) {
        this._state = CabinetState.Playing; this.phase = 'play'; this.phaseTime = 0;
        const p = this.player;
        if (!p.moving) this._startMove(p, p.want || p.heading);
        this.events.push({ kind: 'go' }); this._cues.emit(SoundCue.Start);
      }
      return;
    }
    if (this._state === CabinetState.Interlude) {        // CAUGHT: everything holds while the ship comes apart
      if (this.phaseTime >= T.caught) {
        if (this.livesLeft <= 0) { this._end(RoundResult.Lost, 'caught'); return; }
        this._placeAll();
        this._state = CabinetState.Intro; this.phase = 'ready'; this.phaseTime = 0; this.readyDur = T.readyAgain;
        this.events.push({ kind: 'again' });
      }
      return;
    }
    // THE PLAY
    this.levelTime += dt;
    this._rebuildTick(dt);
    this._modeTick(dt);
    this._playerTick(dt);
    this._eat();
    if (this._state !== CabinetState.Playing) return;
    this._pursuersTick(dt);
    this._updateWorld();
    this._collide();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the maze's doors
  _refreshOpen() {
    const O = this.open;
    for (const E of EDGES) O[E.id] = E.kind === 'sec' || E.kind === 'door' ? 0 : 1;
    for (const S of SECTIONS) {
      const open = openAfter(S.id, this.secK[S.id]);
      for (const e of open) O[e] = 1;
      if (this.turning[S.id]) continue;              // a turning room's doors are shut
      for (const d of S.doors) if (open.some((e) => EDGES[e].a === d.rim || EDGES[e].b === d.rim)) O[d.edge] = 1;
    }
    this.apsp = apspFor(O);
  }
  /** The angle a room is turned to right now (radians, clockwise on screen): 0 unless it's mid-turn. */
  roomAngle(sec) {
    const c = this.rebuild.cur;
    if (!c || c.phase !== 'turn' || !this.turning[sec]) return 0;
    return SECTIONS[sec].turn * HALF_PI * ease(c.t / T.rebuild.turn);
  }
  /** Where an entity (or a light) on edge e at s is on the glass (a turning room carries it round). */
  worldAt(e, s, out = [0, 0]) {
    edgePoint(e, s, out);
    const E = EDGES[e];
    if (E.kind === 'sec' && this.turning[E.sec]) rotAbout(E.sec, out, this.roomAngle(E.sec), out);
    return out;
  }
  _updateWorld() {
    const p = this.player, w = [0, 0];
    this.worldAt(p.e, p.s, w); p.x = w[0]; p.y = w[1];
    for (const q of this.pursuers) if (q.st !== 'pen') { this.worldAt(q.e, q.s, w); q.x = w[0]; q.y = w[1]; }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // THE REBUILD
  _rebuildTick(dt) {
    const R = this.rebuild, RB = T.rebuild;
    if (!R.cur) {
      if (this.levelTime < R.nextAt) return;
      const group = GROUPS[R.gi % GROUPS.length];
      R.cur = { group, secs: GROUP_SECTIONS[group], phase: 'warn', t: 0, n: R.gi, at: this.levelTime };
      R.gi++;
      for (const s of R.cur.secs) this.warned[s] = 1;
      this.events.push({ kind: 'warn', group, n: R.cur.n, first: R.cur.n === 0 });
      this._cues.emit(SoundCue.Tick);
      return;
    }
    const c = R.cur;
    c.t += dt;
    if (c.phase === 'warn') { if (c.t >= RB.warn) { c.phase = 'hold'; c.t = 0; } return; }
    if (c.phase === 'hold') {
      const clear = this._doorwaysClear(c.secs);
      if (!clear && c.t < RB.holdMax) return;
      if (!clear) { this._forceClear(c.secs); this.stats.forced++; }
      if (c.t > dt * 1.5) this.stats.holds++;
      c.phase = 'turn'; c.t = 0;
      for (const s of c.secs) this.turning[s] = 1;
      this._refreshOpen();
      const inside = this._roomOf(this.player);
      if (inside >= 0 && this.turning[inside]) this.stats.carriedPlayer++;
      this.events.push({ kind: 'turn', group: c.group, secs: c.secs });
      return;
    }
    // the turn
    if (c.t < RB.turn) return;
    for (const s of c.secs) this._commitTurn(s);
    for (const s of c.secs) { this.turning[s] = 0; this.warned[s] = 0; }
    this._refreshOpen();
    this._updateWorld();
    this.stats.rebuilds++; this.stats.turns.push(+this.levelTime.toFixed(2));
    this._checkReach();
    this.events.push({ kind: 'turned', group: c.group, secs: c.secs });
    R.cur = null; R.count++;
    R.nextAt = Math.max(c.at + T.rebuild.every, this.levelTime + 3);
  }

  /** Which room (if any) an entity is inside (on one of its own lanes). */
  _roomOf(ent) { const E = EDGES[ent.e]; return E.kind === 'sec' ? E.sec : -1; }

  /** Is anyone standing where a turning room's rim would sweep? (a doorway, or a room lane right at the rim) */
  _inDoorway(ent, secs) {
    const E = EDGES[ent.e];
    if (E.kind === 'door' && secs.includes(E.sec)) return true;
    if (E.kind === 'sec' && secs.includes(E.sec)) {
      const S = SECTIONS[E.sec], rimA = NODES[E.a].slot && NODES[E.a].slot[0] === 'r', rimB = NODES[E.b].slot && NODES[E.b].slot[0] === 'r';
      if (rimA && ent.s < T.rebuild.clearR) return true;
      if (rimB && E.L - ent.s < T.rebuild.clearR) return true;
      void S;
    }
    return false;
  }
  _doorwaysClear(secs) {
    const p = this.player;
    if (p.alive && this._inDoorway(p, secs)) return false;
    const pin = this._roomOf(p);
    for (const q of this.pursuers) {
      if (q.st === 'pen' || q.st === 'banished') continue;
      if (this._inDoorway(q, secs)) return false;
      const qin = this._roomOf(q);
      if (qin >= 0 && secs.includes(qin) && qin === pin) return false;   // never carry you round shut in with one
    }
    return true;
  }
  /** Held long enough: step anyone out of a doorway (to the corridor side, or inward), dissolve a pursuer shut in with you. */
  _forceClear(secs) {
    const pin = this._roomOf(this.player);
    const clearOne = (ent, isPlayer) => {
      const E = EDGES[ent.e];
      if (E.kind === 'door' && secs.includes(E.sec)) {
        // a door edge runs from the corridor's node (a) to the rim (b): stand at the corridor node, the door shut ahead
        ent.s = 0; ent.dir = -1;
        if (isPlayer) ent.moving = false;
        ent.heading = this._heading(ent);
      } else if (E.kind === 'sec' && secs.includes(E.sec)) {
        const rimA = NODES[E.a].slot && NODES[E.a].slot[0] === 'r';
        if (rimA && ent.s < T.rebuild.clearR) ent.s = T.rebuild.clearR;
        else if (!rimA && E.L - ent.s < T.rebuild.clearR) ent.s = E.L - T.rebuild.clearR;
      }
    };
    if (this.player.alive) clearOne(this.player, true);
    for (const q of this.pursuers) {
      if (q.st === 'pen' || q.st === 'banished') continue;
      const qin = this._roomOf(q);
      if (qin >= 0 && secs.includes(qin) && qin === pin) { this._banish(q, false); continue; }
      clearOne(q, false);
    }
  }
  /** The quarter turn lands: the room's arrangement advances; whatever rode on its lanes moves to the lanes they became. */
  _commitTurn(sec) {
    const S = SECTIONS[sec];
    const remap = (o) => {
      const E = EDGES[o.e];
      if (E.kind !== 'sec' || E.sec !== sec) return false;
      const m = S.emap.get(o.e), L = EDGES[m.e].L;
      o.e = m.e;
      if (m.flip) { o.s = L - o.s; if (o.dir != null) o.dir = -o.dir; }
      return true;
    };
    const p = this.player;
    if (remap(p)) { p.heading = this._heading(p); }
    for (const q of this.pursuers) if (q.st !== 'pen' && q.st !== 'banished' && remap(q)) q.heading = this._heading(q);
    for (const l of this.light) if (!l.eaten && remap(l)) this.stats.carriedLight++;
    this.secK[sec]++;
  }
  /** After a turn: every light still to gather must be reachable from the ship (the rooms guarantee it; this checks). */
  _checkReach() {
    const D = this._dist({ e: this.player.e, s: this.player.s });
    for (const l of this.light) {
      if (l.eaten) continue;
      const E = EDGES[l.e];
      if (!this.open[l.e] || (!Number.isFinite(D[E.a]) && !Number.isFinite(D[E.b]))) { this.stats.stranded++; }
    }
    // trapped: the ship can't reach at least two thirds of the maze's junctions
    let reach = 0, all = 0;
    for (const n of NODES) { if (n.sec >= 0) continue; all++; if (Number.isFinite(D[n.id])) reach++; }
    if (reach < all * 0.66) this.stats.trapped++;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // scatter / chase
  _modeTick(dt) {
    if (this.player.alive && this.pursuers.some((q) => q.frightUntil > this.levelTime)) return;   // the rhythm waits while they're pale
    if (this.modeIdx >= T.modes.length) return;
    this.modeT += dt;
    if (this.modeT < T.modes[this.modeIdx]) return;
    this.modeT = 0; this.modeIdx++;
    this.mode = this.modeIdx % 2 === 0 ? 'scatter' : 'chase';
    for (const q of this.pursuers) if (q.st === 'active') q.rev = true;    // the old tell: they all turn about
    this.events.push({ kind: 'mode', mode: this.mode });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // placing (start, after a catch)
  _placeAll() {
    const p = this.player;
    const left = NODES[START].edges.find((e) => leaveDir(e, START)[0] < -0.9);
    p.e = left; p.dir = EDGES[left].a === START ? 1 : -1; p.s = p.dir > 0 ? 0 : EDGES[left].L;
    p.heading = leaveDir(left, START); p.moving = false; p.alive = true; p.want = null;
    // the Hunter waits above the heart, heading left; the others in the heart
    this.pursuers.forEach((q, i) => {
      q.frightUntil = -9; q.rev = false; q.t = 0;
      if (i === 0) {
        const e = NODES[CHASER_START].edges.find((x) => leaveDir(x, CHASER_START)[0] < -0.9);
        q.e = e; q.dir = EDGES[e].a === CHASER_START ? 1 : -1; q.s = q.dir > 0 ? 0 : EDGES[e].L; q.heading = leaveDir(e, CHASER_START);
        q.st = 'active'; q.formedAt = this.time;
      } else { q.st = 'pen'; q.releaseAt = this.levelTime + T.release[i]; }
    });
    this.mode = 'scatter'; this.modeIdx = 0; this.modeT = 0; this.powerN = 0;
    this._updateWorld();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // moving along the graph
  _heading(ent) { const E = EDGES[ent.e], from = ent.dir > 0 ? E.a : E.b, d = leaveDir(ent.e, from); return [d[0], d[1]]; }
  _nodeAhead(ent) { const E = EDGES[ent.e]; return ent.dir > 0 ? E.b : E.a; }
  _atEnd(ent) { const E = EDGES[ent.e]; return ent.dir > 0 ? ent.s >= E.L - 1e-6 : ent.s <= 1e-6; }
  _exits(node) { const out = []; for (const e of NODES[node].edges) if (this.open[e]) out.push(e); return out; }

  /** Move ent `dist` along the graph; at each node `choose(ent, node, arrivedBy)` gives the next edge (or -1: stop). */
  _advance(ent, dist, choose) {
    for (let guard = 0; dist > 1e-9 && guard < 8; guard++) {
      const E = EDGES[ent.e];
      const rem = ent.dir > 0 ? E.L - ent.s : ent.s;
      if (dist < rem) { ent.s += ent.dir * dist; return true; }
      ent.s = ent.dir > 0 ? E.L : 0; dist -= rem;
      const node = ent.dir > 0 ? E.b : E.a;
      const next = choose(ent, node, ent.e);
      if (next < 0) return false;
      const N = EDGES[next];
      ent.dir = N.a === node ? 1 : -1;
      ent.e = next; ent.s = ent.dir > 0 ? 0 : N.L;
      ent.heading = leaveDir(next, node);
    }
    return true;
  }

  // ---- the ship ----
  _startMove(p, want) {
    if (!want) return;
    const E0 = EDGES[p.e];
    const node = p.s <= 1e-6 ? E0.a : p.s >= E0.L - 1e-6 ? E0.b : null;
    if (node == null) {                                  // mid-lane: go (or turn about) along it
      const h = this._heading(p);
      if (h[0] * want[0] + h[1] * want[1] < -0.3) { p.dir = -p.dir; p.heading = [-h[0], -h[1]]; }
      p.moving = true; return;
    }
    let best = -1, bd = T.player.wantDot;
    for (const e of this._exits(node)) { const d = leaveDir(e, node), dot = d[0] * want[0] + d[1] * want[1]; if (dot > bd) { bd = dot; best = e; } }
    if (best < 0) return;
    const N = EDGES[best];
    p.e = best; p.dir = N.a === node ? 1 : -1; p.s = p.dir > 0 ? 0 : N.L; p.heading = leaveDir(best, node); p.moving = true;
  }
  _playerChoose = (p, node, back) => {
    const cands = this._exits(node), want = p.want;
    if (want) {
      let best = -1, bd = T.player.wantDot;
      for (const e of cands) { const d = leaveDir(e, node), dot = d[0] * want[0] + d[1] * want[1]; if (dot > bd) { bd = dot; best = e; } }
      if (best >= 0) return best;
    }
    const fwd = cands.filter((e) => e !== back);
    if (fwd.length === 1) return fwd[0];                // a bend in the corridor: follow it
    let best = -1, bd = 0.9;
    for (const e of fwd) { const d = leaveDir(e, node), dot = d[0] * p.heading[0] + d[1] * p.heading[1]; if (dot > bd) { bd = dot; best = e; } }
    return best;                                        // straight on, or stop at the wall
  };
  _playerTick(dt) {
    const p = this.player;
    if (!p.alive) return;
    if (p.ward > 0) p.ward = Math.max(0, p.ward - dt);
    const w = p.want;
    if (w && p.moving) {                                // turn about at once (as the arcade let you)
      const h = this._heading(p);
      if (h[0] * w[0] + h[1] * w[1] < -0.7) { p.dir = -p.dir; p.heading = [-h[0], -h[1]]; }
    }
    if (!p.moving) { this._startMove(p, w); if (!p.moving) return; }
    const ok = this._advance(p, T.player.speed * dt, this._playerChoose);
    if (!ok) p.moving = false;
    p.heading = this._heading(p);
    const q = [0, 0]; this.worldAt(p.e, p.s, q); p.x = q[0]; p.y = q[1];
  }

  // ---- the light ----
  _eat() {
    const p = this.player;
    if (!p.alive) return;
    const pin = this._roomOf(p), r2 = T.player.eatR * T.player.eatR, w = [0, 0];
    for (const l of this.light) {
      if (l.eaten) continue;
      const E = EDGES[l.e];
      if (E.kind === 'sec' && this.turning[E.sec] && E.sec !== pin) continue;   // behind a turning room's shut doors
      this.worldAt(l.e, l.s, w);
      const dx = w[0] - p.x, dy = w[1] - p.y;
      if (dx * dx + dy * dy > r2) continue;
      l.eaten = true; l.at = this.time; this.gathered++; this.stats.gathered++; p.lastEat = this.time;
      if (l.power) {
        this.score += T.score.power; this.stats.power++; this.powerN = 0;
        for (const q of this.pursuers) if (q.st === 'active' || q.st === 'emerging') { q.frightUntil = this.levelTime + T.power.dur; q.frightAt = this.levelTime; if (q.st === 'active') q.rev = true; }
        this.events.push({ kind: 'power', id: l.id, x: w[0], y: w[1] });
        this._cues.emit(SoundCue.Bonus);
      } else {
        this.score += T.score.light;
        this.events.push({ kind: 'eat', id: l.id, x: w[0], y: w[1] });
      }
    }
    if (this.gathered >= this.target) this._end(RoundResult.Won, 'gathered');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // THE PURSUERS
  _speedK() {
    return Math.min(T.pursuer.maxK, T.pursuer.speed * (1 + T.pursuer.ramp * this.levelTime)) * this.k.pace;
  }
  _pursuersTick(dt) {
    const base = T.player.speed * this._speedK();
    for (const q of this.pursuers) {
      q.t += dt;
      if (q.st === 'pen') { if (this.levelTime >= q.releaseAt) this._tryEmerge(q); continue; }
      if (q.st === 'banished') { if (q.t >= T.pursuer.dissolve + T.pursuer.reform) this._tryEmerge(q); continue; }
      if (q.st === 'emerging') { if (q.t >= T.pursuer.emerge) { q.st = 'active'; q.t = 0; q.formedAt = this.time; } continue; }
      // active
      if (q.rev) {
        q.rev = false;
        const E = EDGES[q.e];
        if (!(E.kind === 'door' && this.turning[E.sec])) { q.dir = -q.dir; q.heading = this._heading(q); }
      }
      const E = EDGES[q.e];
      let v = base;
      if (E.kind === 'tunnel' || E.kind === 'wrap') v *= T.pursuer.tunnel;
      if (q.frightUntil > this.levelTime) v *= T.pursuer.fright;
      this._advance(q, v * dt, this._pursuerChoose);
    }
  }
  /** Leave the heart: re-form on its ring at the vertex farthest from the ship (never close to it), heading along the
   *  ring away from the ship. Not while the heart is turning. The view shows the light gathering in the pen first. */
  _tryEmerge(q) {
    if (this.turning[HEART.id]) return;
    const p = this.player;
    let best = -1, bd = -1;
    for (const v of RING_VERTS) {
      const N = NODES[v], d = Math.hypot(N.x - p.x, N.y - p.y);
      if (d < T.pursuer.keepAway && p.alive) continue;
      if (this.pursuers.some((o) => o !== q && (o.st === 'active' || o.st === 'emerging') && Math.hypot(o.x - N.x, o.y - N.y) < 44)) continue;
      if (d > bd) { bd = d; best = v; }
    }
    if (best < 0) return;
    const ring = NODES[best].edges.filter((e) => EDGES[e].kind === 'sec' && this.open[e] && NODES[other(e, best)].slot?.[0] === 'v');
    let pick = ring[0], fd = -1;
    for (const e of ring) { const M = NODES[other(e, best)], d = Math.hypot(M.x - p.x, M.y - p.y); if (d > fd) { fd = d; pick = e; } }
    const N = EDGES[pick];
    q.e = pick; q.dir = N.a === best ? 1 : -1; q.s = q.dir > 0 ? 0 : N.L; q.heading = leaveDir(pick, best);
    q.st = 'emerging'; q.t = 0; q.bornAt = this.time; q.rev = false;
    q.frightUntil = -9;                                   // it comes back red (it has been banished already)
    const w = [0, 0]; this.worldAt(q.e, q.s, w); q.x = w[0]; q.y = w[1];
    this.events.push({ kind: 'emerge', i: q.i, x: q.x, y: q.y });
  }
  /** How soon a pursuer in the heart will re-form (s), or Infinity: the tell the view shows (light gathering in the pen). */
  emergeIn(q) {
    if (q.st === 'pen') return Math.max(0, q.releaseAt - this.levelTime);
    if (q.st === 'banished') return Math.max(0, T.pursuer.dissolve + T.pursuer.reform - q.t);
    return Infinity;
  }
  /** Can a pursuer take edge e out of node? Not into a room that is warned or turning (it keeps out), not a shut door. */
  _pursuerCan(e, node) {
    if (!this.open[e]) return false;
    const E = EDGES[e];
    if (E.kind === 'door' && this.warned[E.sec] && NODES[node].doorOf) return false;
    return true;
  }
  _pursuerChoose = (q, node, back) => {
    const cands = [];
    for (const e of NODES[node].edges) if (e !== back && this._pursuerCan(e, node)) cands.push(e);
    if (!cands.length) return back;                      // a shut door ahead: turn about
    if (cands.length === 1) return cands[0];
    const frightened = q.frightUntil > this.levelTime;
    if (frightened) {                                    // flee: the way that leaves the ship farthest behind (a little random)
      const D = this._playerDist();
      let best = cands[0], bd = -Infinity;
      for (const e of cands) { const v = (D[other(e, node)] ?? 0) + EDGES[e].L + this.rng.nextDouble() * 60; if (v > bd) { bd = v; best = e; } }
      return best;
    }
    if (q.kind === 'wander' && this.rng.nextDouble() < 0.22) return cands[this.rng.next(cands.length)];
    const tgt = this._target(q);
    let best = cands[0], bd = Infinity;
    if (q.kind === 'chase') {                           // the Hunter: the true shortest way round the maze
      const D = this._dist(tgt);
      for (const e of cands) {
        let v;
        if (tgt.e === e) { const from0 = EDGES[e].a === node; v = from0 ? tgt.s : EDGES[e].L - tgt.s; }
        else v = EDGES[e].L + D[other(e, node)];
        if (v < bd - 1e-6) { bd = v; best = e; }
      }
      return best;
    }
    // the others steer as the arcade's did: at each junction, the way whose next junction is nearest the target as the
    // crow flies (learnable, a little late and a little soft)
    const tp = tgt.node != null ? [NODES[tgt.node].x, NODES[tgt.node].y] : edgePoint(tgt.e, tgt.s, [0, 0]);
    for (const e of cands) {
      const M = NODES[other(e, node)];
      const v = EDGES[e].kind === 'wrap' ? Math.hypot(tp[0] - M.x, tp[1] - M.y) + 60 : Math.hypot(tp[0] - M.x, tp[1] - M.y);
      if (v < bd - 1e-6) { bd = v; best = e; }
    }
    return best;
  };
  /** Where a pursuer is heading: { e, s } on the graph (or { node }). */
  _target(q) {
    const p = this.player;
    if (this.mode === 'scatter') return { node: q.corner };
    if (q.kind === 'chase') return { e: p.e, s: p.s };
    if (q.kind === 'ambush') return this._ahead(p, 150);
    const dp = this._playerDist()[this._nearNode(q)];
    if (q.kind === 'patrol') {
      if (dp < 210) return { e: p.e, s: p.s };
      // walk the octagon round the heart, clockwise: the next corner past this one
      const ang = Math.atan2(q.y - HEART.y, q.x - HEART.x);
      let best = OCTAGON[0].id, bd = 99;
      for (const o of OCTAGON) { let d = o.ang - ang; while (d <= 0.25) d += Math.PI * 2; if (d < bd) { bd = d; best = o.id; } }
      return { node: best };
    }
    // the Drifter: comes for you from afar, falls back to its corner when close
    return dp > 240 ? { e: p.e, s: p.s } : { node: q.corner };
  }
  _nearNode(q) { const E = EDGES[q.e]; return q.s < E.L / 2 ? E.a : E.b; }
  /** The point `dist` ahead of the ship along the way it's going (straight on at junctions, round bends). */
  _ahead(p, dist) {
    let e = p.e, s = p.s, dir = p.dir, h = p.heading;
    for (let guard = 0; guard < 6; guard++) {
      const E = EDGES[e], rem = dir > 0 ? E.L - s : s;
      if (dist <= rem) return { e, s: s + dir * dist };
      dist -= rem;
      const node = dir > 0 ? E.b : E.a;
      let best = -1, bd = -2;
      for (const x of this._exits(node)) { if (x === e) continue; const d = leaveDir(x, node), dot = d[0] * h[0] + d[1] * h[1]; if (dot > bd) { bd = dot; best = x; } }
      if (best < 0) return { e, s: dir > 0 ? E.L : 0 };
      e = best; dir = EDGES[e].a === node ? 1 : -1; s = dir > 0 ? 0 : EDGES[e].L; h = leaveDir(e, node);
    }
    return { e, s };
  }
  _playerDist() {
    if (!this._dp) this._dp = this._dist({ e: this.player.e, s: this.player.s }, this._dpBuf || (this._dpBuf = new Float64Array(NODES.length)));
    return this._dp;
  }
  /** Shortest open-maze distances from a point ({ e, s } or { node }) to every node (a lookup in the cached all-pairs). */
  _dist(src, out) {
    const n = NODES.length, A = this.apsp;
    const D = out || this._D || (this._D = new Float64Array(n));
    if (src.node != null) { for (let j = 0; j < n; j++) D[j] = A[src.node * n + j]; return D; }
    const E = EDGES[src.e], ra = E.a * n, rb = E.b * n, s = src.s, t = E.L - src.s;
    for (let j = 0; j < n; j++) { const x = s + A[ra + j], y = t + A[rb + j]; D[j] = x < y ? x : y; }
    return D;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // catching and banishing
  _collide() {
    const p = this.player;
    if (!p.alive) return;
    const r2 = T.pursuer.catchR * T.pursuer.catchR;
    for (const q of this.pursuers) {
      if (q.st !== 'active') continue;
      const dx = q.x - p.x, dy = q.y - p.y;
      if (dx * dx + dy * dy > r2) continue;
      if (q.frightUntil > this.levelTime) { this._banish(q, true); continue; }
      if (p.ward > 0) continue;
      this._caught(q);
      return;
    }
  }
  _banish(q, points) {
    q.st = 'banished'; q.t = 0; q.frightUntil = -9; q.banishedAt = this.time; q.bx = q.x; q.by = q.y;
    if (points) {
      const pts = T.score.banish[Math.min(this.powerN, T.score.banish.length - 1)];
      this.powerN++; this.score += pts; this.stats.banished++;
      this.events.push({ kind: 'banish', i: q.i, x: q.x, y: q.y, points: pts });
      this._cues.emit(SoundCue.Hit);
    } else this.events.push({ kind: 'expel', i: q.i, x: q.x, y: q.y });
  }
  _caught(q) {
    const p = this.player;
    if (this.k.ward > 0 && this.livesLeft <= 1) {         // MERCY: the last life is warded; the pursuer is banished
      p.ward = 1.8; p.wardAt = this.time; this.stats.warded++;
      this._banish(q, false);
      this.events.push({ kind: 'ward', x: p.x, y: p.y });
      this._cues.emit(SoundCue.Miss);
      return;
    }
    p.alive = false; this.livesLeft--; this.stats.caught++; this.stats.deathsAt.push(+this.levelTime.toFixed(1));
    this.events.push({ kind: 'caught', i: q.i, x: p.x, y: p.y, heading: p.heading });
    this._cues.emit(SoundCue.Miss);
    this._state = CabinetState.Interlude; this.phase = 'caught'; this.phaseTime = 0;
  }

  _end(result, why) {
    this._result = result; this._state = CabinetState.Card; this.phase = 'card'; this.phaseTime = 0; this.why = why;
    if (result === RoundResult.Won) {
      const bonus = T.score.clear + T.score.lifeLeft * Math.max(0, this.livesLeft);
      this.score += bonus;
      this._cues.emit(SoundCue.Win); this.events.push({ kind: 'clear', bonus, lives: this.livesLeft });
    } else { this._cues.emit(SoundCue.Die); this.events.push({ kind: 'out', why }); }
  }
}
