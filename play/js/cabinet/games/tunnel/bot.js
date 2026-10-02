// THE NODE · THE TUNNEL · the pilots (ICabinetBot): they play through exactly what a player has (left / right, FIRE), one
// frame a step, and only READ the round.
//
//   new TunnelBot('idle')       does nothing (the do-nothing bar: the echoes reach the rim, crawl to the ship and take it)
//   new TunnelBot('good')       the decent hand: every 0.1 s it picks the most urgent echo (a rim crawler close to the ship,
//                               else the climber nearest the rim, lane travel counted), moves to its lane and taps FIRE at a
//                               human rate (every 0.14 s) while its lane holds an echo. At THE LET-GO it takes its hands off.
//   new TunnelBot('sloppy')     a looser hand: re-plans every 0.35 s, reacts late, taps slower, now and then drifts to the
//                               wrong lane or fires into an empty one, and notices a crawler late
//   new TunnelBot('stubborn')   plays the waves like 'good', but at THE LET-GO it keeps firing (and now and then moving) for
//                               `stubbornFor` s (default 12), then stops: the ring must drain, never pass, never punish
//   new TunnelBot('patient', { fireBelow })   plays like 'good' but holds its fire until an echo has climbed nearer than
//                               depth `fireBelow` (for pictures: the echoes get a good way up their lanes first)
import { CabinetBotBase } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { N, mod, laneDist } from './layout.js';

const PROFILES = {
  good: { every: 0.1, react: 0.12, tap: 0.14, wrong: 0, blind: 0, drift: 0, lapse: 0, lapseT: [0, 0], lazy: 0 },
  // lapse: the chance a crawler reaching the rim goes unseen for lapseT s; lazy: the share of the time it just HOLDS fire
  sloppy: { every: 0.4, react: 0.4, tap: 0.26, wrong: 0.2, blind: 0.3, drift: 0.18, lapse: 0.45, lapseT: [0.3, 0.9], lazy: 0.35 },
};

export class TunnelBot extends CabinetBotBase {
  constructor(kind = 'good', o = {}) {
    super(); this.kind = kind;
    this.P = PROFILES[kind === 'stubborn' || kind === 'patient' ? 'good' : kind] ?? PROFILES.good;
    this.stubbornFor = o.stubbornFor ?? 12;
    this.fireBelow = o.fireBelow ?? Infinity;
    this._init();
  }
  get name() { return 'tunnel-' + this.kind; }
  reset(seed) { super.reset(seed); this._init(); }
  _init() { this.goal = null; this.planAt = -9; this.t = 0; this.lastTap = -9; this.lastA = false; this.letgoFor = 0; this.seen = new Map(); this.rimSeen = new Map(); this.lazyFor = 0; this.lazyOn = false; }

  think(sim, dt) {
    this.t += dt;
    if (this.kind === 'idle') return { x: 0, a: false };
    if (sim.phase === 'letgo') {
      this.letgoFor += dt;
      if (this.kind === 'stubborn' && this.letgoFor < this.stubbornFor) {
        // keeps at it: taps FIRE, and now and then moves
        const a = !this.lastA && this.t - this.lastTap >= 0.16; if (a) this.lastTap = this.t; this.lastA = a;
        const x = Math.sin(this.letgoFor * 0.9) > 0.85 ? 1 : 0;
        return { x, a };
      }
      this.lastA = false;
      return { x: 0, a: false };                                   // HANDS OFF
    }
    if (sim.phase !== 'play' && sim.phase !== 'ready') { this.goal = null; this.lastA = false; return { x: 0, a: false }; }
    const s = sim.ship, P = this.P;
    if (!s.alive) return { x: 0, a: false };
    if (this.t - this.planAt >= P.every || this.goal == null) { this._plan(sim); this.planAt = this.t; }
    // move toward the goal lane (release once the ship is headed there)
    let x = 0;
    if (this.goal != null) {
      const d = laneDist(mod(Math.round(s.target)), this.goal);
      x = d > 0 ? 1 : d < 0 ? -1 : 0;
    }
    // fire: the ship's lane holds an echo (climbing, or on the rim), at a human tapping rate (the sloppy hand sometimes just
    // holds the button down for a while: the lazy fire)
    let a = false;
    if (P.lazy > 0) {
      this.lazyFor -= dt;
      if (this.lazyFor <= 0) { this.lazyOn = this.rng.nextDouble() < P.lazy; this.lazyFor = 1 + 2 * this.rng.nextDouble(); }
    }
    if (sim.phase === 'play' && this.lazyOn) a = true;
    else if (sim.phase === 'play' && Math.abs(s.pos - Math.round(s.pos)) < 0.2) {
      const busy = sim.echoes.some((e) => e.alive && this._noticed(sim, e) && sim.echoLanes(e).includes(s.lane) && e.w < Math.min(TUNE.spawnW - 0.05, this.fireBelow));
      const wild = P.wrong > 0 && this.rng.nextDouble() < P.wrong * dt * 3;
      if ((busy || wild) && this.t - this.lastTap >= P.tap && !this.lastA) { a = true; this.lastTap = this.t; }
    }
    this.lastA = a;
    return { x, a };
  }

  /** A sloppy hand sees a new echo late, and now and then loses track of one as it reaches the rim (a lapse). */
  _noticed(sim, e) {
    if (!this.seen.has(e.id)) this.seen.set(e.id, sim.time + this.P.react + (this.rng.nextDouble() < this.P.blind ? 0.6 : 0));
    if (sim.time < this.seen.get(e.id)) return false;
    if (e.rim) {
      if (!this.rimSeen.has(e.id)) {
        const [a, b] = this.P.lapseT;
        this.rimSeen.set(e.id, sim.time + (this.rng.nextDouble() < this.P.lapse ? a + (b - a) * this.rng.nextDouble() : 0));
      }
      return sim.time >= this.rimSeen.get(e.id);
    }
    return true;
  }

  _plan(sim) {
    const s = sim.ship, P = this.P, speed = TUNE.ship.speed;
    let best = null, bestCost = 1e9;
    for (const e of sim.echoes) {
      if (!e.alive || !this._noticed(sim, e)) continue;
      const lanes = sim.echoLanes(e);
      // the lane to shoot it from: the nearer of its lanes (a crawler: where it is now)
      let lane = lanes[0], dist = laneDist(s.lane, lanes[0]);
      for (const l of lanes) { const d = laneDist(s.lane, l); if (Math.abs(d) < Math.abs(dist)) { dist = d; lane = l; } }
      const travel = Math.abs(dist) / speed + P.react;
      let cost;
      if (e.rim) cost = Math.abs(dist) * 0.25 - 1.5;                         // a crawler: urgent, the nearer the more
      else {
        const toRim = (e.w - 1) / (TUNE.echoes[e.kind].speed * sim.k.speed);
        cost = toRim + travel * 1.4 + (e.kind === 'hunter' ? 0.2 : 0);
        if (e.w > TUNE.spawnW - 0.1) cost += 0.6;                            // (still coming out of the heart)
      }
      if (cost < bestCost) { bestCost = cost; best = lane; }
    }
    if (best != null && P.drift > 0 && this.rng.nextDouble() < P.drift) best = mod(best + (this.rng.nextDouble() < 0.5 ? 1 : -1));
    this.goal = best ?? this.goal ?? s.lane;
  }
}
