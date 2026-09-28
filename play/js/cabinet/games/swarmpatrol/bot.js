// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · THE BOT: a modelled average player.
// Port of SwarmPatrolBot.cs from Staging/Batch1/swarmpatrol.
//
// It plays through the panel (stick left/right, A held to fire) and only READS the sim.
//   Offence  strafe under any diver not in your column (leading it a little); with no diver
//            about, line up under the nearest alien in the ranks. Fire (hold A) whenever an
//            alien is dead ahead: inside its own half-width of the ship's column, with the
//            target the lowest one in that line (the first a shot meets, so always in reach).
//   Defence  it GLANCES at the lane every ~glance s (jittered). On a glance each bolt, diver or
//            open beam within alert px of the lane is noticed with chance notice (a miss can be
//            noticed on a later glance); a noticed threat is acted on react s later. Then it
//            picks the nearby spot with the least danger, reachable in time. So faster bolts and
//            divers leave it less time: dive speed matters, not only dive count.
//   Wobble   aimError px of error in where it lines up, re-rolled per target.
// Its dice are its own (CabinetBotBase.rng), never the sim's.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { SwarmPatrolRound } from './round.js';

const Phase = SwarmPatrolRound.Phase, AlienMode = SwarmPatrolRound.AlienMode, AlienKind = SwarmPatrolRound.AlienKind;
const ShipHalfW = SwarmPatrolRound.ShipHalfW, ShipHalfH = SwarmPatrolRound.ShipHalfH, ShipY = SwarmPatrolRound.ShipY, ShipSpeed = SwarmPatrolRound.ShipSpeed;
const ShipMinX = SwarmPatrolRound.ShipMinX, ShipMaxX = SwarmPatrolRound.ShipMaxX, ShotSpeed = SwarmPatrolRound.ShotSpeed;
const BeamHalfMax = SwarmPatrolRound.BeamHalfMax;

// a threat is the stretch of the lane [x0..x1] it sweeps while it can touch the ship, from t s on
class Threat {
    constructor(x0, x1, t, r) { this.x0 = x0; this.x1 = x1; this.t = t; this.r = r; }
    dist(x) { const lo = Math.min(this.x0, this.x1), hi = Math.max(this.x0, this.x1); return x < lo ? lo - x : x > hi ? x - hi : 0; }
}

export class SwarmPatrolBot extends CabinetBotBase {
    constructor() {
        super();
        this.glance = 0.3;             // mean s between looks at the lane
        this.notice = 0.8;             // chance, per look, that a threat in view is seen
        this.react = 0.2;              // s from seeing it to moving
        this.alert = 80;               // px above the lane it watches
        this.aimError = 3;             // px of aim wobble

        this._seen = new Map();        // id -> time seen
        this._aimId = -1;
        this._aimOffset = 0; this._nextLook = 0;
        this._looking = false;
        this._threats = [];
    }

    get name() { return 'sp-average-player'; }

    reset(seed) { super.reset(seed); this._seen.clear(); this._aimId = -1; this._aimOffset = 0; this._nextLook = 0; }

    _known(id, now) {
        let t0 = this._seen.get(id);
        if (t0 === undefined) {
            if (!this._looking || !this.chance(this.notice)) return false;
            t0 = now; this._seen.set(id, t0);
        }
        return now - t0 >= this.react;
    }

    think(sim, dt) {
        const r = sim;
        if (r == null) return InputFrame.neutral;
        if (r.p !== Phase.Playing || !r.playerAlive) {
            if (r.p !== Phase.Playing) this._seen.clear();
            return InputFrame.neutral;
        }
        const now = r.time, sx = r.playerX, sy = ShipY;
        this._looking = now >= this._nextLook;
        if (this._looking) this._nextLook = now + this.glance * this.range(0.6, 1.4);

        // ---- what is coming
        this._threats.length = 0;
        for (const b of r.enemyShots) {
            // a 2x6 bolt can touch the ship from its top edge until it has fully passed the bottom,
            // drifting sideways all the while: watch that whole stretch, not one point
            const top = sy - ShipHalfH - 3, bottom = sy + ShipHalfH + 3;
            if (b.y > bottom || top - b.y > this.alert) continue;
            if (!this._known(b.id, now)) continue;
            const vy = Math.max(30, b.vy);
            const t0 = Math.max(0, top - b.y) / vy, t1 = (bottom - b.y) / vy;
            this._threats.push(new Threat(b.x + b.vx * t0, b.x + b.vx * t1, t0, ShipHalfW + 4));
        }
        for (const a of r.aliens) {
            if (!a.visible) continue;
            if (a.mode === AlienMode.Beam) {
                if (a.beamStage < 1 || a.beamStage > 2) continue;
                if (!this._known(a.id + 1000000, now)) continue;
                this._threats.push(new Threat(a.x, a.x, 0, BeamHalfMax + 6));
                continue;
            }
            if (a.mode !== AlienMode.Dive && a.mode !== AlienMode.Return && a.mode !== AlienMode.Peel) continue;
            if (a.y > sy + 10) continue;
            const ady = sy - a.y;
            if (ady > this.alert) continue;
            if (a.vy < 5 && ady > 20) continue;
            if (!this._known(a.id, now)) continue;
            const at = Math.max(0, ady) / Math.max(30, a.vy);
            const ax = a.x + a.vx * Math.min(at, 0.6);
            this._threats.push(new Threat(ax, ax, at, a.halfW + ShipHalfW + 4));
        }

        // ---- where it would like to be
        const want = this._offence(r, sx, sy);

        // ---- the least dangerous nearby spot, reachable in time
        let best = want;
        if (this._threats.length > 0) {
            let bestCost = Infinity;
            for (let k = -10; k <= 10; k++) {
                const c = sx + k * 6;
                if (c < ShipMinX || c > ShipMaxX) continue;
                let cost = 0.02 * Math.abs(c - want) + 0.004 * Math.abs(c - sx);
                const travel = Math.abs(c - sx) / ShipSpeed;
                const lo = Math.min(sx, c), hi = Math.max(sx, c);
                for (const th of this._threats) {
                    if (th.t > 1.2) continue;
                    const d = th.dist(c);
                    if (d < th.r) cost += (th.r - d) * (1 + 2 * (1.2 - th.t));
                    // crossing its line on the way, while it is arriving
                    if (Math.max(th.x0, th.x1) > lo - th.r && Math.min(th.x0, th.x1) < hi + th.r && travel > th.t && th.t < 0.5) cost += 6;
                }
                if (cost < bestCost) { bestCost = cost; best = c; }
            }
        }

        const diff = best - sx;
        const f = new InputFrame();
        if (diff > 1.5) f.x = 1; else if (diff < -1.5) f.x = -1;
        f.a = this._deadAhead(r, sx, sy);
        return f;
    }

    _offence(r, sx, sy) {
        // a diver not in my column: strafe under it (leading it a little)
        let dv = null, dvd = Infinity;
        for (const a of r.aliens) {
            if (!a.visible || a.mode !== AlienMode.Dive || a.y > sy - 40 || a.y < 60) continue;
            const d = Math.abs(a.x - sx);
            if (d < dvd) { dvd = d; dv = a; }
        }
        if (dv != null) {
            this._roll(dv.id);
            if (dvd <= dv.halfW) return sx;                    // already in my column: hold and fire
            const meet = (sy - dv.y) / (ShotSpeed + Math.max(0, dv.vy));
            return dv.x + dv.vx * meet + this._aimOffset;
        }
        // otherwise the nearest alien in the ranks (or on its way home)
        let tg = null, td = Infinity;
        for (const a of r.aliens) {
            if (!a.visible || a.mode === AlienMode.Enter || a.y > sy - 30) continue;
            const d = Math.abs(a.x - sx) + (3 - Math.min(3, a.row)) * 2;
            if (d < td) { td = d; tg = a; }
        }
        if (tg == null) return 160;
        this._roll(tg.id);
        const flight = (sy - tg.y) / ShotSpeed;
        return tg.x + tg.vx * flight * 0.5 + this._aimOffset;
    }

    _roll(id) {
        if (id === this._aimId) return;
        this._aimId = id;
        this._aimOffset = this.range(-this.aimError, this.aimError);
    }

    // an alien dead ahead of the ship (above it, inside its half-width of the column)
    _deadAhead(r, sx, sy) {
        for (const a of r.aliens)
            if (a.visible && a.y < sy - 12 && Math.abs(a.x - sx) <= a.halfW - 1) return true;
        return false;
    }
}
