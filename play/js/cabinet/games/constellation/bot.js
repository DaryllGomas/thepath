// THE NODE · THE CONSTELLATION · the pilots (ICabinetBot): they play through exactly what a player has (a pointer that
// moves at a hand's speed, FIRE and the three silo buttons), one frame a step, and only READ the round.
//
//   new ConstellationBot('idle')     does nothing (the do-nothing bar: the pattern must break)
//   new ConstellationBot('good')     reads each shape's path and leads it, picks the silo that gets there first, doesn't
//                                    fire at a shape a ring already has, ignores shapes falling on dark bases, takes the
//                                    nearest threat first (the attract demo and the Lab's measure)
//   new ConstellationBot('sloppy')   a slow hand and a late eye: under-leads, aims loosely, always fires the nearest base,
//                                    sometimes misses a shape entirely, sometimes fires twice at the same one
import { CabinetBotBase } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { STARS, BASES, GROUPS, SKY } from './layout.js';
import { predictShape, arcPath } from './round.js';

const PROFILES = {
  good: { speed: 2000, react: 0.22, noise: 7, lead: 0.95, groups: true, ignore: 0, cooldown: 0.16, recheck: 1, skipDark: true, near: 6, holdoff: 1.3 },
  sloppy: { speed: 1400, react: 0.38, noise: 22, lead: 0.6, groups: false, ignore: 0.15, cooldown: 0.32, recheck: 0.5, skipDark: false, near: 12, holdoff: 0.8 },
};
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const BUTTON = ['l', 'm', 'r'];

export class ConstellationBot extends CabinetBotBase {
  constructor(kind = 'good') { super(); this.kind = kind; this.P = PROFILES[kind] ?? PROFILES.good; this._init(); }
  get name() { return 'constellation-' + this.kind; }
  reset(seed) { super.reset(seed); this._init(); }
  _init() { this.px = 633; this.py = 400; this.plan = null; this.claims = new Map(); this.seen = new Map(); this.skip = new Set(); this.recheck = new Map(); this.cd = 0; this._last = null; this.nx = 0; this.ny = 0; }

  think(sim, dt) {
    if (this.kind === 'idle') return { x: 0, y: 0 };
    const P = this.P;
    if (sim.phase !== 'wave') { this.plan = null; this._last = null; return this._frame(null); }
    this.cd -= dt;
    const live = new Set();
    for (const s of sim.shapes) {
      live.add(s.id);
      if (!this.seen.has(s.id)) {
        this.seen.set(s.id, sim.time);
        if (this.rng.nextDouble() < P.ignore) this.skip.add(s.id);
        this.recheck.set(s.id, this.rng.nextDouble() < P.recheck);
      }
    }
    for (const id of this.claims.keys()) if (!live.has(id)) this.claims.delete(id);
    if (this.plan && !live.has(this.plan.id)) this.plan = null;
    if (!this.plan) this.plan = this._choose(sim);
    if (!this.plan) return this._frame(null);

    const s = sim.shapes.find((q) => q.id === this.plan.id);
    const g = this._pick(sim, s);
    if (!g) { this.plan = null; return this._frame(null); }
    this.plan.aim = g;
    // move the hand toward the aim point (a hand's speed, a little wobble)
    const ax = clamp(g.x + this.nx, SKY.x0, SKY.x1), ay = clamp(g.y + this.ny, SKY.y0, SKY.y1);
    const dx = ax - this.px, dy = ay - this.py, d = Math.hypot(dx, dy), stepLen = P.speed * dt;
    if (d > stepLen) { this.px += dx / d * stepLen; this.py += dy / d * stepLen; } else { this.px = ax; this.py = ay; }
    if (d <= P.near && this.cd <= 0) {
      const btn = P.groups ? BUTTON[g.group] : 'a';
      if (this._last === btn) return this._frame(null);            // a press must be an EDGE: release a step first
      this.claims.set(s.id, sim.time); this.plan = null; this.cd = P.cooldown;
      this.nx = (this.rng.nextDouble() - 0.5) * 2 * P.noise; this.ny = (this.rng.nextDouble() - 0.5) * 2 * P.noise;
      return this._frame(btn);
    }
    return this._frame(null);
  }

  _frame(btn) {
    this._last = btn;
    const f = { x: 0, y: 0, px: this.px, py: this.py, a: false, l: false, m: false, r: false };
    if (btn) f[btn] = true;
    return f;
  }

  /** The next shape to deal with: the soonest to land on a living star that no ring is already going to take. */
  _choose(sim) {
    const P = this.P;
    let best = null, bs = 1e9;
    for (const s of sim.shapes) {
      if (sim.time - this.seen.get(s.id) < P.react || this.skip.has(s.id)) continue;
      if (this.claims.has(s.id) && sim.time - this.claims.get(s.id) < P.holdoff) continue;
      const star = sim.stars[s.target];
      if (P.skipDark && !star.alive) continue;
      if (this.recheck.get(s.id) && this._covered(sim, s)) continue;
      const tti = (s.dist - s.d) / s.speed - (STARS[s.target].temple ? 0.9 : 0) - (s.kind === 'split' ? 0.5 : 0);
      if (tti < bs) { bs = tti; best = s; }
    }
    return best ? { id: best.id } : null;
  }

  /** Where to aim and from which silo: the base the sim would pick (nearest with shots, in that group), led. */
  _pick(sim, s) {
    const P = this.P;
    let best = null;
    const groups = P.groups ? [0, 1, 2] : [-1];
    for (const g of groups) {
      const aimNow = this._lead(s, STARS[3].tip);
      let base = -1, bd = 1e18;
      for (const i of (g < 0 ? BASES : GROUPS[g])) {
        const st = sim.stars[i]; if (!st.alive || st.ammo <= 0) continue;
        const tip = STARS[i].tip, d = (tip[0] - aimNow.x) ** 2 + (tip[1] - aimNow.y) ** 2;
        if (d < bd) { bd = d; base = i; }
      }
      if (base < 0) continue;
      const a = this._lead(s, STARS[base].tip);
      if (!best || a.tau < best.tau) best = { ...a, base, group: g };
    }
    return best;
  }

  _lead(s, tip) {
    let tau = 0.5, q = [s.x, s.y];
    for (let it = 0; it < 6; it++) {
      q = predictShape(s, tau * this.P.lead);
      q = [clamp(q[0], SKY.x0, SKY.x1), clamp(q[1], SKY.y0, SKY.y1)];
      tau = arcPath(tip[0], tip[1], q[0], q[1], 8).L / TUNE.shot.speed + TUNE.burst.grow * 0.45;
    }
    return { x: q[0], y: q[1], tau };
  }

  /** Will a shot already flying, or a ring already burning, take this shape? */
  _covered(sim, s) {
    const B = TUNE.burst;
    for (const sh of sim.shots) {
      const tArr = sh.dur - sh.t;
      for (const f of [0.4, 0.7, 1.0, 1.4]) {
        const u = Math.min(1, f), r = B.r * (1 - (1 - u) ** 3), q = predictShape(s, tArr + B.grow * f);
        if (Math.hypot(q[0] - sh.tx, q[1] - sh.ty) < r * 0.85 + s.r) return true;
      }
    }
    for (const b of sim.bursts) {
      if (!b.lethal) continue;
      const rem = b.grow + b.hold - b.t;
      for (const f of [0, 0.5, 1]) {
        const tt = rem * f, u = Math.min(1, (b.t + tt) / b.grow), r = b.rmax * (1 - (1 - u) ** 3), q = predictShape(s, tt);
        if (Math.hypot(q[0] - b.x, q[1] - b.y) < r * 0.9 + s.r) return true;
      }
    }
    return false;
  }
}
