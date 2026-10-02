// THE NODE · THE BEACON · the pilots (ICabinetBot): they play through exactly what a player has (a stick that turns and
// thrusts, FIRE), one frame a step, and only READ the round.
//
//   new BeaconBot('idle')     does nothing (the do-nothing bar: the Beacon must stay dark)
//   new BeaconBot('good')     holds a post outside the rings, turns to the core and fires through whatever is in the way;
//                             turns to meet each shard as it comes and shoots it down (leading it), flies home after a
//                             bounce (the attract demo and the Lab's measure)
//   new BeaconBot('sloppy')   slow to notice, a loose hand: aims a little off, meets shards late (and sometimes not at all),
//                             fires wide more often, holds FIRE instead of tapping; both get out of a shard's way late
import { CabinetBotBase } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { CENTRE, SPAWNS, RINGS, ringLocal, wrapAngle } from './layout.js';

const PROFILES = {
  good: { gain: 9, engage: 380, react: 0.15, ignore: 0, aimNoise: 0.012, tol: 0.05, shardTol: 0.07, home: 70, tap: true, dodge: 95, notice: 1 },
  sloppy: { gain: 5.5, engage: 250, react: 0.45, ignore: 0.2, aimNoise: 0.06, tol: 0.12, shardTol: 0.14, home: 150, tap: false, dodge: 85, notice: 0.5 },
};
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export class BeaconBot extends CabinetBotBase {
  constructor(kind = 'good') { super(); this.kind = kind; this.P = PROFILES[kind] ?? PROFILES.good; this._init(); }
  get name() { return 'beacon-' + this.kind; }
  reset(seed) { super.reset(seed); this._init(); }
  _init() { this.seen = new Map(); this.skip = new Set(); this.noticed = new Map(); this.noise = 0; this.noiseT = 0; this.post = null; this.fire = false; }

  think(sim, dt) {
    if (this.kind === 'idle') return { x: 0, y: 0, a: false };
    const P = this.P, sh = sim.ship;
    this.noiseT -= dt;
    if (this.noiseT <= 0) { this.noise = (this.rng.nextDouble() - 0.5) * 2 * P.aimNoise; this.noiseT = 0.35 + this.rng.nextDouble() * 0.4; }
    if (!sh.alive || sim.phase === 'card') { this.post = null; return { x: 0, y: 0, a: false }; }
    const toCore = Math.atan2(CENTRE[1] - sh.y, CENTRE[0] - sh.x);
    if (sim.phase === 'ready') return this._turn(sh, toCore, 0, false);

    // the post: the nearest place a ship comes in (outside the rings, a clear view of the core)
    if (!this.post) {
      let best = SPAWNS[0], bd = 1e18;
      for (const p of SPAWNS) { const d = (p[0] - sh.x) ** 2 + (p[1] - sh.y) ** 2; if (d < bd) { bd = d; best = p; } }
      this.post = best;
    }

    // 1) a shard coming: meet it (lead it with the shot's speed) and shoot it down
    for (const d of sim.shards) if (!this.seen.has(d.id)) { this.seen.set(d.id, sim.time); if (this.rng.nextDouble() < P.ignore) this.skip.add(d.id); }
    let threat = null, td = 1e9;
    for (const d of sim.shards) {
      if (d.dying >= 0 || this.skip.has(d.id) || sim.time - this.seen.get(d.id) < P.react) continue;
      const dist = Math.hypot(d.x - sh.x, d.y - sh.y);
      if (dist < P.engage && dist < td) { td = dist; threat = d; }
    }
    // a shard about to reach you that you aren't already lined up on: get out of its way (thrust across its path)
    for (const d of sim.shards) {
      if (d.dying >= 0) continue;
      const dx = sh.x - d.x, dy = sh.y - d.y, dist = Math.hypot(dx, dy), closing = Math.cos(d.a) * dx + Math.sin(d.a) * dy > 0;
      if (dist > P.dodge || !closing) continue;
      if (!this.noticed?.has(d.id)) { (this.noticed ??= new Map()).set(d.id, this.rng.nextDouble() < P.notice); }
      if (!this.noticed.get(d.id)) continue;
      if (d === threat && Math.abs(wrapAngle(this._lead(sh, d) - sh.a)) < P.shardTol * 2) break;   // about to shoot it
      const across = d.a + (wrapAngle(Math.atan2(dy, dx) - d.a) > 0 ? 1 : -1) * Math.PI / 2;
      const err = wrapAngle(across - sh.a);
      return { x: clamp(err * P.gain, -1, 1), y: Math.abs(err) < 0.9 ? 1 : 0, a: false };
    }
    if (threat) {
      const aim = this._lead(sh, threat);
      return this._turn(sh, aim + this.noise, 0, sim.phase === 'play', P.shardTol);
    }
    if (sim.phase === 'lit') return this._goHome(sh, toCore, false);

    // 2) away from the post (a bounce, a drift): fly back to it
    const home = Math.hypot(this.post[0] - sh.x, this.post[1] - sh.y);
    if (home > P.home) return this._goHome(sh, toCore, true);

    // 3) at the post: turn to the core and fire through whatever is in the way
    return this._turn(sh, toCore + this.noise, 0, true, P.tol);
  }

  /** Turn toward heading `want`; FIRE (held) once within tol. */
  _turn(sh, want, thrust, fire, tol = 0.05) {
    const err = wrapAngle(want - sh.a);
    const x = clamp(err * this.P.gain, -1, 1);
    let a = fire && Math.abs(err) < tol;
    if (a && this.P.tap) { this.fire = !this.fire; a = this.fire; }     // a quick hand taps (a tap fires faster than a hold)
    return { x, y: thrust, a };
  }

  _goHome(sh, toCore, fire) {
    const p = this.post, dx = p[0] - sh.x, dy = p[1] - sh.y, dist = Math.hypot(dx, dy), v = Math.hypot(sh.vx, sh.vy);
    const toward = (sh.vx * dx + sh.vy * dy) / Math.max(1, dist);
    // don't fly through the rings: if the straight line home crosses them, go round (tangent) first
    let want = Math.atan2(dy, dx);
    const mid = ringLocal(2, (sh.x + p[0]) / 2, (sh.y + p[1]) / 2);
    if (mid.r < RINGS[2].R + 70) {
      const me = ringLocal(2, sh.x, sh.y), side = wrapAngle(ringLocal(2, p[0], p[1]).a - me.a) > 0 ? 1 : -1;
      want = Math.atan2(Math.sin(me.a + side * 0.6) * RINGS[2].sy * (RINGS[2].R + 150) + CENTRE[1] - sh.y,
        Math.cos(me.a + side * 0.6) * (RINGS[2].R + 150) + CENTRE[0] - sh.x);
    }
    if (dist < 40 || (toward > 0 && dist < v * 1.3)) return this._turn(sh, toCore, 0, fire, this.P.tol);   // coast in
    const err = wrapAngle(want - sh.a);
    return { x: clamp(err * this.P.gain, -1, 1), y: Math.abs(err) < 0.35 && v < 260 ? 1 : 0, a: false };
  }

  /** The heading that meets shard d with a shot (the shot leaves the nose at TUNE.shot.speed). */
  _lead(sh, d) {
    const S = TUNE.shot.speed, vx = Math.cos(d.a) * d.speed, vy = Math.sin(d.a) * d.speed;
    let t = Math.hypot(d.x - sh.x, d.y - sh.y) / S;
    for (let k = 0; k < 4; k++) t = Math.hypot(d.x + vx * t - sh.x, d.y + vy * t - sh.y) / S;
    return Math.atan2(d.y + vy * t - sh.y, d.x + vx * t - sh.x);
  }
}
