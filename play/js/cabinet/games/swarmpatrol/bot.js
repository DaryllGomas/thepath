// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · THE BOT: a modelled average player.
// Started as a port of SwarmPatrolBot.cs; built out on 2026-10-18 to play the whole eight-stage game.
//
// It plays through the panel (stick left/right, A held to fire) and only READS the sim.
//   Offence  strafe under any diver not in your column (leading it a little); with no diver about, line up under the
//            nearest alien in the ranks. In a challenge stage it picks the flier it can meet soonest and leads it. On the
//            queen it clears the guard in its way, then a live wing (and, with both wings gone, waits under her eye).
//            Fire (hold A) whenever a target will be dead ahead when a shot gets there: inside its half-width of a gun's
//            column (both guns as a twin), the target the lowest one in that line, so always in reach. It holds fire
//            at the queen's eye while it is shut.
//   Defence  it GLANCES at the lane every ~glance s (jittered). On a glance each bolt, diver, mite, open beam or marked
//            sting-beam spot within alert px of the lane is noticed with chance notice (a miss can be noticed on a later
//            glance); a noticed threat is acted on react s later. Then it picks the nearby spot with the least danger,
//            reachable in time. So faster bolts and divers leave it less time: dive speed matters, not only dive count.
//   Wobble   aimError px of error in where it lines up, re-rolled per target.
// It never plans a rescue: a twin comes when it happens to shoot a captor out of the ranks, as for most players.
// Its dice are its own (CabinetBotBase.rng), never the sim's.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { SwarmPatrolRound } from './round.js';
import { HiveQueen } from './queen.js';

const Phase = SwarmPatrolRound.Phase, AlienMode = SwarmPatrolRound.AlienMode;
const ShipHalfW = SwarmPatrolRound.ShipHalfW, ShipHalfH = SwarmPatrolRound.ShipHalfH, ShipY = SwarmPatrolRound.ShipY, ShipSpeed = SwarmPatrolRound.ShipSpeed;
const ShipMinX = SwarmPatrolRound.ShipMinX, ShipMaxX = SwarmPatrolRound.ShipMaxX, ShotSpeed = SwarmPatrolRound.ShotSpeed;
const BeamHalfMax = SwarmPatrolRound.BeamHalfMax, TwinOffset = SwarmPatrolRound.TwinOffset;

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
        this.greed = 0.6;              // chance it sits in a tractor beam on purpose (a ship to spare, no twin yet)

        this._seen = new Map();        // id -> time seen
        this._aimId = -1;
        this._aimOffset = 0; this._nextLook = 0;
        this._looking = false;
        this._threats = [];
        this._qx = 160; this._qvx = 0;
        this._greedy = new Map();     // beam id -> true: let this one take the ship
        this._gamble = false;
    }

    get name() { return 'sp-average-player'; }

    reset(seed) { super.reset(seed); this._seen.clear(); this._greedy.clear(); this._aimId = -1; this._aimOffset = 0; this._nextLook = 0; this._qx = 160; this._qvx = 0; }

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
        const q = r.queen;
        if (q) { this._qvx = dt > 0 ? (q.x - this._qx) / dt : 0; this._qx = q.x; }
        if (r.p !== Phase.Playing || !r.playerAlive) {
            if (r.p !== Phase.Playing) this._seen.clear();
            return InputFrame.neutral;
        }
        const now = r.time, sx = r.playerX, sy = ShipY;
        const reach = r.twin ? ShipHalfW + TwinOffset : ShipHalfW;          // half the width of what can be hit
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
            this._threats.push(new Threat(b.x + b.vx * t0, b.x + b.vx * t1, t0, reach + 4));
        }
        for (const a of r.aliens) {
            if (!a.visible) continue;
            if (a.mode === AlienMode.Beam) {
                if (r.twin || a.beamStage < 1 || a.beamStage > 2) continue;
                if (!this._known(a.id + 1000000, now)) continue;
                if (this._wantsCapture(r, a)) continue;
                this._threats.push(new Threat(a.x, a.x, 0, BeamHalfMax + 6));
                continue;
            }
            if (a.mode !== AlienMode.Dive && a.mode !== AlienMode.Return && a.mode !== AlienMode.Peel &&
                a.mode !== AlienMode.Strike && a.mode !== AlienMode.Fall) continue;
            if (a.y > sy + 10) continue;
            const ady = sy - a.y;
            if (ady > this.alert) continue;
            if (a.vy < 5 && ady > 20) continue;
            if (!this._known(a.id, now)) continue;
            const at = Math.max(0, ady) / Math.max(30, a.vy);
            const ax = a.x + a.vx * Math.min(at, 0.6);
            this._threats.push(new Threat(ax, ax, at, a.halfW + reach + 4));
        }
        if (q && !q.dying) {
            if (q.atk && q.atk.name === 'strike' && q.atk.stage === 0 && this._known(2000000 + q.atk.id, now)) {
                const left = Math.max(0, HiveQueen.StrikeTele - q.atk.t);
                for (const x of q.atk.xs) this._threats.push(new Threat(x, x, left, HiveQueen.StrikeHalf + reach + 4));
            }
            for (const b of q.beams) if (this._known(2000000 + b.id, now)) this._threats.push(new Threat(b.x, b.x, 0, HiveQueen.StrikeHalf + reach + 4));
        }

        // ---- where it would like to be
        const want = this._offence(r, sx, sy);

        // ---- the least dangerous nearby spot, reachable in time
        let best = want;
        const lo0 = r.twin ? ShipMinX + TwinOffset : ShipMinX, hi0 = r.twin ? ShipMaxX - TwinOffset : ShipMaxX;
        if (this._threats.length > 0) {
            let bestCost = Infinity;
            for (let k = -10; k <= 10; k++) {
                const c = sx + k * 6;
                if (c < lo0 || c > hi0) continue;
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
        f.a = !this._gamble && this._deadAhead(r, sx, sy);           // sitting in a beam on purpose: hold fire
        return f;
    }

    // a Galaga player's gamble: with a ship to spare and no twin, now and then sit in the beam to be taken (then shoot
    // the captor when it next dives, and the ship comes back as a twin). Decided once per beam.
    _wantsCapture(r, a) {
        let g = this._greedy.get(a.id);
        if (g === undefined) { g = !r.twin && r.lives >= 2 && r.stage < 8 && this.chance(this.greed); this._greedy.set(a.id, g); }
        return g;
    }

    _offence(r, sx, sy) {
        this._gamble = false;
        for (const a of r.aliens)
            if (a.visible && a.mode === AlienMode.Beam && a.beamStage >= 1 && a.beamStage <= 2 && this._greedy.get(a.id)) { this._gamble = true; return a.x; }
        // a diver not in my column: strafe under it (leading it a little); a captor out of the ranks first of all
        let dv = null, dvd = Infinity;
        for (const a of r.aliens) {
            if (!a.visible || (a.mode !== AlienMode.Dive && a.mode !== AlienMode.Strike) || a.y > sy - 40 || a.y < 60) continue;
            const d = Math.abs(a.x - sx) - (a.carrying ? 80 : 0);
            if (d < dvd) { dvd = d; dv = a; }
        }
        if (dv != null) dvd = Math.abs(dv.x - sx);
        if (dv != null) {
            this._roll(dv.id);
            if (dvd <= dv.halfW) return sx;                    // already in my column: hold and fire
            const meet = (sy - dv.y) / (ShotSpeed + Math.max(0, dv.vy));
            return dv.x + dv.vx * meet + this._aimOffset;
        }
        // a challenge stage: the flier it can meet soonest
        if (r.challenge) {
            let tg = null, td = Infinity, tx = 160;
            for (const a of r.aliens) {
                if (a.mode !== AlienMode.Pass || a.y > sy - 40 || a.x < 14 || a.x > 306) continue;
                const flight = (sy - a.y) / ShotSpeed;
                const px = a.x + a.vx * flight;
                if (px < ShipMinX || px > ShipMaxX) continue;
                const d = Math.abs(px - sx) / ShipSpeed + flight * 0.3;
                if (d < td) { td = d; tg = a; tx = px; }
            }
            if (tg == null) return sx;
            this._roll(tg.id);
            return tx + this._aimOffset * 0.5;
        }
        // otherwise the nearest alien in the ranks (or on its way home), or a part of the queen
        let tg = null, td = Infinity, tx = 160;
        for (const a of r.aliens) {
            if (!a.visible || a.mode === AlienMode.Enter || a.mode === AlienMode.Fall || a.y > sy - 30) continue;
            const d = Math.abs(a.x - sx) + (3 - Math.min(3, a.row)) * 2;
            if (d < td) { td = d; tg = a; tx = a.x + a.vx * ((sy - a.y) / ShotSpeed) * 0.5; }
        }
        const q = r.queen;
        if (q && q.arrived && !q.dying) {
            const flight = (sy - q.y) / ShotSpeed, lead = this._qvx * flight;
            const parts = [];
            if (!q.wings[0].broken) parts.push(q.x - 23 + lead);
            if (!q.wings[1].broken) parts.push(q.x + 23 + lead);
            if (parts.length === 0) parts.push(q.x + lead);
            for (const px of parts) {
                const d = Math.abs(px - sx) + 14;
                if (d < td) { td = d; tg = q; tx = px; }
            }
        }
        if (tg == null) return 160;
        this._roll(tg === q ? -7 : tg.id);
        return tx + this._aimOffset;
    }

    _roll(id) {
        if (id === this._aimId) return;
        this._aimId = id;
        this._aimOffset = this.range(-this.aimError, this.aimError);
    }

    // something dead ahead of a gun (above it, inside its half-width of the column) when a shot gets there
    _deadAhead(r, sx, sy) {
        const xs = r.shipXs;
        for (const a of r.aliens) {
            if (!a.visible || a.y >= sy - 12) continue;
            if (a.carrying && a.mode === AlienMode.Formation && !r.twin) continue;      // not in the ranks: it would turn the captive
            const ax = a.x + a.vx * ((sy - a.y) / ShotSpeed);
            for (const x of xs) if (Math.abs(ax - x) <= a.halfW - 1) return true;
        }
        const q = r.queen;
        if (q && q.arrived && !q.dying) {
            const qx = q.x + this._qvx * ((sy - q.y) / ShotSpeed);
            for (const x of xs) {
                const d = Math.abs(x - qx);
                if (d > 12 && d < 34 && !q.wings[x < qx ? 0 : 1].broken) return true;
                if (d <= 5 && q.phase >= 3 && q.eye > 0.5) return true;
            }
        }
        return false;
    }
}
