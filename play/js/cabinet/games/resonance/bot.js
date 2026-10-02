// THE NODE · THE RESONANCE · the pilots (ICabinetBot): they play through exactly what a player has (left / right, FIRE),
// one frame a step, and only READ the round.
//
//   new ResonanceBot('idle')     does nothing (the do-nothing bar: the shapes come down and land; the round is lost)
//   new ResonanceBot('good')     the decent hand: it reads the wave's drift and FIRES ONLY WHEN ITS PULSE WILL ARRIVE WHILE
//                                THE TARGET IS RESONANT (it leads the crest by the pulse's climb), picks the soonest such
//                                shot (the low shapes first when they get close to landing), never sends two pulses at one
//                                shape, keeps its column clear of a shape in the way, and steps out from under a shard
//   new ResonanceBot('sloppy')   a looser hand: re-plans less often, times its shots roughly (and now and then fires when the
//                                shape is resonant NOW, forgetting the climb), aims a little off, notices shards late or not
import { CabinetBotBase } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { EMITTER, TIP, groundY, crestOffset, kiteBottomAt } from './layout.js';

const PROFILES = {
  good: { every: 0.1, react: 0.18, timeNoise: 0.04, aimNoise: 3, margin: 0.55, notice: 1, naive: 0, wild: 0, horizon: 3.4 },
  sloppy: { every: 0.3, react: 0.35, timeNoise: 0.3, aimNoise: 10, margin: 0.9, notice: 0.45, naive: 0.45, wild: 0.05, horizon: 2.4 },
};
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const DT = 1 / 30;

export class ResonanceBot extends CabinetBotBase {
  constructor(kind = 'good') { super(); this.kind = kind; this.P = PROFILES[kind] ?? PROFILES.good; this._init(); }
  get name() { return 'resonance-' + this.kind; }
  reset(seed) { super.reset(seed); this._init(); }
  _init() { this.plan = null; this.planAt = -9; this.pending = new Map(); this.noticed = new Map(); this.lastA = false; this.t = 0; this.ph = []; }

  think(sim, dt) {
    this.t += dt;
    if (this.kind === 'idle') return { x: 0, a: false };
    if (sim.phase !== 'play' && sim.phase !== 'ready') { this.plan = null; this.lastA = false; return { x: 0, a: false }; }
    const e = sim.emitter, P = this.P;
    if (!e.alive) return { x: 0, a: false };
    // forget pulses that have resolved
    for (const [id, until] of this.pending) if (sim.time > until) this.pending.delete(id);
    if (this.plan && !sim.shapes.some((s) => s.id === this.plan.id)) this.plan = null;
    // re-plan now and then, but a shot that's close is COMMITTED (a hand that keeps changing its mind never fires)
    const committed = this.plan && this.plan.fireAt - sim.time < 0.7;
    if (sim.phase === 'play' && !committed && (this.t - this.planAt >= P.every || !this.plan)) { this._plan(sim); this.planAt = this.t; }

    // where to stand: the plan's column, or out from under a shard
    let goal = this.plan ? this.plan.x : (this.idleX ?? e.x);
    const dodge = this._dodge(sim, goal);
    if (dodge != null) goal = dodge;
    const dx = goal - e.x;
    const x = Math.abs(dx) < 1.5 ? 0 : clamp(dx / 14, -1, 1);
    // fire: in place (not sliding), on time, a free slot
    let a = false;
    const pl = this.plan;
    if (pl && sim.phase === 'play' && dodge == null && Math.abs(e.x - pl.x) < 3.5 && Math.abs(e.vx) < 60 && sim.time >= pl.fireAt - 1 / 120 &&
      sim.pulses.length < TUNE.pulse.maxLive && sim.time - e.lastShot >= TUNE.pulse.cooldown) {
      if (sim.time <= pl.fireAt + 0.25) {
        a = !this.lastA;
        if (a) { this.pending.set(pl.id, pl.arrive + 0.15); this.plan = null; this.planAt = -9; }
      } else this.plan = null;                                  // missed the moment: plan again
    }
    // the sloppy hand fires wild now and then
    if (!a && P.wild > 0 && sim.phase === 'play' && this.rng.nextDouble() < P.wild * dt * 10 && sim.pulses.length < TUNE.pulse.maxLive) a = !this.lastA;
    this.lastA = a;
    return { x, a };
  }

  /** A shard coming down on the emitter, or across its way to the goal: where to stand instead (null: no need). The shard
   *  fills the emitter's height for `span` s once it reaches the barrel's tip; the emitter is in its column (52 px either
   *  side) from tIn to tOut on the way to the goal. */
  _dodge(sim, goal) {
    const e = sim.emitter, P = this.P, speed = TUNE.emitter.speed, R = 54;
    let out = null;
    for (const sh of sim.shards) {
      if (!this.noticed.has(sh.id)) this.noticed.set(sh.id, this.rng.nextDouble() < P.notice ? sim.time + P.react : Infinity);
      if (sim.time < this.noticed.get(sh.id)) continue;
      const gy = groundY(sh.x);
      if (sh.y > gy) continue;
      const tHit = (gy - TIP - 12 - sh.y) / sh.vy, span = (TIP + 16) / sh.vy;
      if (tHit > 1.8) continue;
      const d0 = sh.x - e.x, near = Math.abs(d0) < R;
      if (near) {                                   // under it: step out to the side with room (toward the goal if it can)
        let side = goal < sh.x ? sh.x - R - 14 : sh.x + R + 14;
        if (side < EMITTER.x0) side = sh.x + R + 14; if (side > EMITTER.x1) side = sh.x - R - 14;
        out = side; continue;
      }
      // not under it: would the way to the goal cross its column while it's at the emitter's height? then wait short of it
      const between = Math.min(e.x, goal) - R < sh.x && sh.x < Math.max(e.x, goal) + R;
      if (!between) continue;
      const tIn = (Math.abs(d0) - R) / speed, tOut = (Math.abs(d0) + R) / speed;
      if (tIn < tHit + span + 0.1 && tOut > tHit - 0.1) out = sh.x - Math.sign(d0) * (R + 14);
    }
    return out;
  }

  _plan(sim) {
    const P = this.P, e = sim.emitter, V = TUNE.pulse.speed, speed = TUNE.emitter.speed;
    // the wave's phase over the horizon (the drift, as a player reads it)
    const n = Math.ceil(P.horizon / DT) + 2;
    for (let i = 0; i <= n; i++) this.ph[i] = sim.phaseAhead(i * DT);
    const phaseAt = (t) => { const f = clamp(t / DT, 0, n), i = Math.floor(f), u = f - i; return i >= n ? this.ph[n] : this.ph[i] + (this.ph[i + 1] - this.ph[i]) * u; };
    const naive = this.rng.nextDouble() < P.naive;
    let best = null;
    const shapes = sim.shapes.filter((s) => s.alive);
    const reachY = sim.reachY + 8, passY = sim.passY - 6;        // a little margin: the wave's height breathes
    for (const s of shapes) {
      if (this.pending.has(s.id)) continue;
      const w = sim.windowOf(s) * P.margin, vf = sim.fallSpeed(s);
      const gy0 = groundY(s.x), ttl = (gy0 - (s.y + s.b)) / Math.max(1, vf);
      const urgency = ttl < 14 ? (14 - ttl) * 0.22 : 0;
      for (let i = 0; i * DT <= P.horizon; i++) {
        const tf = i * DT;
        const xs = clamp(sim.shapeXAt(s, tf), EMITTER.x0, EMITTER.x1);
        const travel = Math.abs(xs - e.x) / speed + P.react;
        if (tf < travel) continue;
        const ys = sim.shapeYAt(s, tf), tip = groundY(xs) - TIP;
        const yb = ys + s.b;
        if (yb >= tip - 4) break;                           // below the barrel's tip: out of reach now
        const vfa = s.passed ? vf : (ys > sim.passY ? vf * 1.8 : vf);
        const tfl = naive ? 0 : (tip - yb) / (V + vfa);
        const ta = tf + tfl, xa = sim.shapeXAt(s, ta), ya = sim.shapeYAt(s, ta);
        let cost;
        if (s.passed) {
          // through the wave: only a defensive break (no points), worth it when it's close to landing
          if (ttl > 9) break;
          cost = tf + 2.2 - (9 - ttl) * 0.5;
        } else {
          if (ya > passY) break;                            // it will have slipped through by then
          if (ya + s.b < reachY) continue;                  // the crest can't reach it yet: later
          if (Math.abs(crestOffset(phaseAt(ta), xa)) > w) continue;
          cost = tf - urgency + (ys < 200 ? 0.15 : 0);
        }
        // a shape in the way (lower, in the same column) would take the pulse first, unless it's resonant then too
        let blocked = false;
        for (const o of shapes) {
          if (o === s) continue;
          const ox = sim.shapeXAt(o, tf), oy = sim.shapeYAt(o, tf), ob = kiteBottomAt(ox, oy, o.h, xs, 4);
          if (ob == null || ob <= yb - 2 || ob > tip) continue;
          const ot = tf + (tip - ob) / (V + sim.fallSpeed(o)), oya = sim.shapeYAt(o, ot);
          const oRes = !o.passed && oya <= passY && oya + o.b >= reachY &&
            Math.abs(crestOffset(phaseAt(ot), sim.shapeXAt(o, ot))) <= sim.windowOf(o) * 0.8;
          if (!oRes && !o.passed) { blocked = true; break; }
        }
        if (blocked) continue;
        // a shard coming down on that column while we'd stand there
        let unsafe = false;
        for (const sh of sim.shards) {
          if (Math.abs(sh.x - xs) > 50) continue;
          const th = (groundY(xs) - TIP - 10 - sh.y) / sh.vy;
          if (th > travel - 0.4 && th < tf + 0.35) { unsafe = true; break; }
        }
        if (unsafe) continue;
        if (!best || cost < best.cost) {
          const noise = (this.rng.nextDouble() - 0.5) * 2;
          best = { id: s.id, x: clamp(xs + noise * P.aimNoise, EMITTER.x0, EMITTER.x1), fireAt: sim.time + tf + (this.rng.nextDouble() - 0.5) * 2 * P.timeNoise,
            arrive: sim.time + ta, cost, passed: s.passed };
        }
        break;                                               // the soonest shot at this shape
      }
    }
    this.plan = best;
    if (!best) {
      // nothing to shoot yet: wait under the lowest shape (the next likely shot)
      let low = null; for (const s of shapes) if (!low || s.y > low.y) low = s;
      this.idleX = low ? clamp(low.x, EMITTER.x0, EMITTER.x1) : sim.emitter.x;
    }
  }
}
