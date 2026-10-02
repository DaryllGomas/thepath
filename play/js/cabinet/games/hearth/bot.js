// THE NODE · HEARTH · the pilots (ICabinetBot): they play through exactly what a player has, one InputFrame a step,
// and only READ the round.
//
//   new HearthBot('idle')     does nothing (the do-nothing bar: the fire must go out)
//   new HearthBot('good')     fetches the best fuel for the walk, brings 2-3 at a time, wards shades that come close
//                             or reach for the fire (the attract demo and the Lab's measure)
//   new HearthBot('greedy')   goes for the far, rich fuel, hoards 4 before coming home, wards late and not always,
//                             never guards the fire
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { HEARTH, FEED, BITE, RING, walkable, eDist } from './layout.js';

/** The point just outside the ring, on the side facing (x, y): stand there and the fuel goes in. */
function feedSpot(x, y, k = 1.18) {
  const dx = (x - RING.x) / RING.rx, dy = (y - RING.y) / RING.ry, m = Math.hypot(dx, dy) || 1;
  return [RING.x + dx / m * RING.rx * k, RING.y + dy / m * RING.ry * k];
}
import { TUNE } from './spec.js';

export class HearthBot extends CabinetBotBase {
  constructor(kind = 'good') { super(); this.kind = kind; this._aDown = false; this._react = 0; this._slow = 0; this._side = 0; }
  get name() { return 'hearth-' + this.kind; }

  think(sim, dt) {
    if (this.kind === 'idle' || sim.phase !== 'play') { this._aDown = false; return new InputFrame(); }
    const pl = sim.player, greedy = this.kind === 'greedy';
    const push = !greedy && sim.levelTime > 46 && sim.fire < TUNE.blaze + 0.04;     // the last stretch: blaze by the bell
    const home = pl.carry.length >= (greedy ? 4 : push ? 2 : 3) || (pl.carry.length > 0 && (sim.fire < 0.35 || sim.shards.length === 0))
      || (!greedy && pl.carry.length > 0 && this._nearestValue(sim) < 0.5);
    let tx, ty;

    // a shade reaching for the fire: go stand in its way (the good bot, with empty-ish hands)
    let threat = null;
    if (!greedy) for (const s of sim.shades) {
      if (s.st !== 'hunt') continue;
      const e = eDist(s.x, s.y, BITE), dp = Math.hypot(s.x - pl.x, s.y - pl.y);
      if (e < 1.8 && dp < 260 && (!threat || e < threat.e)) threat = { s, e };
    }
    if (threat && pl.carry.length < 2) [tx, ty] = feedSpot(threat.s.x, threat.s.y, 1.3);   // between it and the fire
    else if (home || sim.shards.length === 0) [tx, ty] = feedSpot(pl.x, pl.y, pl.carry.length ? 1.1 : 1.5);
    else {
      let best = null, bs = -1;
      for (const s of sim.shards) {
        if (s.lock > sim.time) continue;
        const d = Math.hypot(s.x - pl.x, s.y - pl.y);
        const score = greedy ? s.value * 10 - d * 0.002 : s.value / (d + (push ? 40 : 120));
        if (score > bs) { bs = score; best = s; }
      }
      if (best) { tx = best.x; ty = best.y; } else [tx, ty] = feedSpot(pl.x, pl.y, 1.5);
    }

    // steer: straight at it, with whiskers around the ring, the posts and the walls
    let dx = tx - pl.x, dy = ty - pl.y; const d = Math.hypot(dx, dy);
    let ix = 0, iy = 0;
    if (d > 6) {
      dx /= d; dy /= d;
      const look = 42;
      const ok = (ax, ay) => walkable(pl.x + ax * look, pl.y + ay * look);
      // pressed against something for a moment: go round it on one side for a while
      if (Math.hypot(pl.vx, pl.vy) < 40 && pl.stun <= 0) this._slow += dt; else this._slow = Math.max(0, this._slow - dt);
      if (this._slow > 0.3 && this._side === 0) this._side = this.rng.nextDouble() < 0.5 ? 1 : -1;
      if (this._slow === 0) this._side = 0;
      const order = this._side === 0 ? [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1] : [this._side * 1.2, this._side * 1.6, this._side * 2.1, 0];
      let best = null;
      for (const a of order) {
        const c = Math.cos(a), s = Math.sin(a), rx = dx * c - dy * s, ry = dx * s + dy * c;
        if (ok(rx, ry)) { best = [rx, ry]; break; }
      }
      if (best) { ix = best[0]; iy = best[1]; } else { ix = dx; iy = dy; }
    }

    // ward: a shade close by (the greedy bot reacts late and not always)
    let press = false;
    if (pl.wardCd <= 0 && sim.fire > 0.08) {
      let near = 1e9;
      for (const s of sim.shades) if (s.st === 'hunt') near = Math.min(near, Math.hypot(s.x - pl.x, s.y - pl.y));
      const reach = greedy ? 70 : 100;
      if (near < reach) {
        if (greedy) { this._react += dt; if (this._react > 0.2 && this.rng.nextDouble() < 0.7) { press = true; this._react = 0; } }
        else press = true;
      } else this._react = 0;
    }
    // A must be an EDGE: release for a step between presses
    const a = press && !this._aDown;
    this._aDown = a;
    return new InputFrame(ix, -iy, a, false, false);        // stick +y is UP
  }

  _nearestValue(sim) {
    const pl = sim.player; let best = 1e9;
    for (const s of sim.shards) best = Math.min(best, Math.hypot(s.x - pl.x, s.y - pl.y));
    return best < 160 ? 1 : 0;
  }
}
