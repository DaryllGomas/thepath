// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE BOT: a modelled average player.
// Started as the port of Staging/Batch4/nebularun/Games/NebulaRun/NebulaRunBot.cs; built out with the game (2026-10-18)
// to fly all five sectors and their bosses.
//
// It plays through the control panel like anyone else (stick, A held, B tapped) and decides 20 times a second, holding
// its input in between. Its dice are its own (this.rng, via chance/range).
//   GROUND   keeps the bomb sight on the nearest ground target it can reach (leading it for the 0.42 s fall and the
//            scroll), skips a domed gun (it bombs the generator instead), and drops when the sight is on it; drops on
//            a locked sight now and then too (which is how it finds a beacon, when it does).
//   PODS     goes for a falling pod when one is near and nothing is about to be bombed.
//   AIR      holds the air gun while an air target is in its column (the fan's spread counted); with nothing to bomb
//            it lines up under the nearest interceptor.
//   WEAVE    it only dodges what it has NOTICED (noticeRate per second for each thing on the tube, then reaction
//            seconds before it acts on it) and scores nine stick choices by the clearance they keep over the next half
//            second: shots, bodies, a flak shell's burst ring, a lightning column, an armed mine's ring. An interceptor
//            that holds its lane for more than a beat (laneBeat) pushes it a lane over.
//   BOSSES   the radar isle's cores in order; the crawler's flak towers then its heart (led); the prism's generators then
//            its heart; the thunderhead's pods then its eye (the gun, from low on the tube); the mother's generators,
//            then the iris, timing each bomb to land while the iris is open.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { NebulaRunRound, AirKind, GroundKind, airRadius, isShielded } from './round.js';
import { NebulaScroll } from './scroll.js';

const Phase = NebulaRunRound.Phase;
const R = NebulaRunRound;
const Samples = [0.08, 0.2, 0.34, 0.5];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class NebulaRunBot extends CabinetBotBase {
    constructor() {
        super();
        this.noticeRate = 6;           // per second: how fast a new threat gets noticed
        this.reaction = 0.22;          // s from noticing a threat to dodging it
        this.decideEvery = 0.05;       // s between decisions (the stick is held between)
        this.margin = 7;               // px of clearance it tries to keep
        this.aimTol = 4;               // px: the sight is "on" the target
        this.laneBeat = 0.45;          // s an interceptor may hold the lane
        this.sprayChance = 0.25;       // chance per decision of firing with nothing lined up
        this.lapseChance = 0.02;       // chance per decision of a 0.3 s lapse (looking at the score)
        this.podGreed = 0.85;          // chance per decision of going for a pod in reach

        this._seen = new Map();
        this._hold = InputFrame.neutral;
        this._decideT = 0; this._clock = 0; this._laneT = 0; this._laneShiftT = 0; this._laneShift = 0;
        this._jitterX = 0; this._jitterT = 0; this._lapseT = 0;
    }

    get name() { return 'nr-average-player'; }

    reset(seed) {
        super.reset(seed);
        this._seen.clear(); this._hold = InputFrame.neutral;
        this._decideT = this._clock = this._laneT = this._laneShiftT = this._laneShift = this._jitterX = this._jitterT = this._lapseT = 0;
    }

    think(sim, dt) {
        this._clock += dt;
        const r = sim;
        if (r == null || r.p !== Phase.Playing) { this._seen.clear(); this._hold = InputFrame.neutral; this._decideT = 0; return InputFrame.neutral; }
        this._decideT -= dt;
        if (this._decideT > 0) { const f = this._hold.clone(); f.b = false; return f; }
        this._decideT += this.decideEvery;
        if (this._decideT < 0) this._decideT = 0;
        this._hold = this._decide(r);
        const o = this._hold.clone();
        this._hold.b = false;
        if (o.b && this.lastFrame.b) o.b = false;
        return o;
    }

    // ------------------------------------------------------------------ one decision
    _decide(r) {
        this._notice(r);
        if (this._lapseT > 0) { this._lapseT -= this.decideEvery; const hf = this._hold.clone(); hf.b = false; return hf; }
        if (this.chance(this.lapseChance)) this._lapseT = 0.3;

        this._jitterT -= this.decideEvery;
        if (this._jitterT <= 0) { this._jitterT = 0.6; this._jitterX = this.range(-3, 3); }

        const sx = r.shipX, sy = r.shipY;
        let gx, gy, bomb = false, gunTarget = null;
        const pick = r.bossZone && r.boss != null && !r.boss.dead ? this._pickBoss(r) : this._pickGround(r);
        const pod = this._pickPod(r, pick);
        if (pod != null) {
            gx = pod.x; gy = clamp(pod.y + 6, R.ShipMinY, R.ShipMaxY);
        } else if (pick.air != null) {
            // the thunderhead: under the part, low on the tube, the gun held
            gunTarget = pick.air;
            gx = pick.px + this._jitterX * 0.5; gy = 196;
        } else if (pick.tgt) {
            gx = pick.px + this._jitterX;
            gy = pick.py + R.SightDist;
            if (!r.bombActive && pick.ok && Math.abs(r.sightX - pick.px) < this.aimTol && Math.abs(r.sightY - pick.py) < this.aimTol + 2) bomb = true;
        } else if (pick.wait) {
            gx = pick.px; gy = R.ShipMaxY - 6;
        } else {
            const a = this._pickAir(r);
            gx = a != null ? a.x + this._jitterX : 160 + this._jitterX;
            gy = 190;
        }
        if (!bomb && !r.bombActive && r.sightMode !== 0 && r.sightMode !== 2 && this.chance(0.3)) bomb = true;

        // the lane: an interceptor sitting above us too long pushes us over
        let lane = null;
        for (const e of r.air)
            if (e.alive && !e.boss && e.y < sy - 10 && sy - e.y < 150 && Math.abs(e.x - sx) < 14 &&
                (e.kind === AirKind.Dart || (e.kind === AirKind.Spinner && e.mode < 2))) { lane = e; break; }
        if (lane != null) this._laneT += this.decideEvery; else this._laneT = 0;
        if (this._laneT > this.laneBeat && this._laneShiftT <= 0) {
            this._laneShiftT = 0.5;
            this._laneShift = (lane.x > sx ? -1 : 1) * 36;
            if (sx + this._laneShift < R.ShipMinX + 6 || sx + this._laneShift > R.ShipMaxX - 6) this._laneShift = -this._laneShift;
            this._laneT = 0;
        }
        if (this._laneShiftT > 0) { this._laneShiftT -= this.decideEvery; gx = sx + this._laneShift; }

        gx = clamp(gx, R.ShipMinX, R.ShipMaxX);
        gy = clamp(gy, R.ShipMinY, R.ShipMaxY);

        // score the nine stick choices
        let bestX = 0, bestY = 0, best = -Infinity;
        for (let ox = -1; ox <= 1; ox++)
            for (let oy = -1; oy <= 1; oy++) {
                let vx = ox, vy = oy;
                if (ox !== 0 && oy !== 0) { vx *= 0.7071; vy *= 0.7071; }
                const clear = this._clearance(r, sx, sy, vx, -vy);
                let s = 0;
                if (clear < this.margin) s -= (this.margin - clear) * 25;
                if (clear < 0) s -= 200;
                const t = 0.2;
                const nx = clamp(sx + vx * R.ShipSpeed * t, R.ShipMinX, R.ShipMaxX);
                const ny = clamp(sy - vy * R.ShipSpeed * t, R.ShipMinY, R.ShipMaxY);
                const d = Math.hypot(nx - gx, ny - gy);
                s -= d;
                if (ox === 0 && oy === 0 && Math.abs(sx - gx) < 2.5 && Math.abs(sy - gy) < 2.5) s += 3;   // settle, don't dither
                if (s > best) { best = s; bestX = ox; bestY = oy; }
            }

        const f = new InputFrame(bestX, bestY);
        // the air gun: anything in a lane's column (the fan widens with the distance)
        let lined = false;
        for (const e of r.air) {
            if (!e.alive || e.y > sy - 6 || e.locked) continue;
            const reach = airRadius(e) + 4 + (r.gunLevel === 2 ? 0.19 * (sy - e.y) : r.gunLevel === 1 ? 4 : 0);
            const lead = e.vx * (sy - e.y) / R.BulletSpeed;
            if (Math.abs(e.x + lead - sx) < reach) { lined = true; break; }
        }
        if (gunTarget != null && Math.abs(gunTarget.x - sx) < airRadius(gunTarget) + 6) lined = true;
        f.a = lined || (r.firing && this.chance(0.8)) || this.chance(this.sprayChance);
        f.b = bomb;
        return f;
    }

    _notice(r) {
        const p = 1 - Math.exp(-this.noticeRate * this.decideEvery);
        for (const s of r.shots) if (!this._seen.has(s.id) && this.chance(p)) this._seen.set(s.id, this._clock);
        for (const e of r.air) if (e.alive && e.y > NebulaScroll.FieldY - 4 && !this._seen.has(e.id) && this.chance(p)) this._seen.set(e.id, this._clock);
        for (const f of r.flak) if (!this._seen.has(f.id) && this.chance(p)) this._seen.set(f.id, this._clock);
        for (const b of r.bolts) if (!this._seen.has(b.id) && this.chance(p)) this._seen.set(b.id, this._clock);
        if (this._seen.size > 400) {
            const keep = new Map();
            for (const s of r.shots) if (this._seen.has(s.id)) keep.set(s.id, this._seen.get(s.id));
            for (const e of r.air) if (this._seen.has(e.id)) keep.set(e.id, this._seen.get(e.id));
            for (const f of r.flak) if (this._seen.has(f.id)) keep.set(f.id, this._seen.get(f.id));
            for (const b of r.bolts) if (this._seen.has(b.id)) keep.set(b.id, this._seen.get(b.id));
            this._seen = keep;
        }
    }

    _known(id) { return this._seen.has(id) && (this._clock - this._seen.get(id)) >= this.reaction; }

    // the smallest clearance (px beyond touching) over the next half second on this heading
    _clearance(r, sx, sy, vx, vyScreen) {
        let min = 60;
        const sp = R.ShipSpeed;
        for (const t of Samples) {
            const px = clamp(sx + vx * sp * t, R.ShipMinX, R.ShipMaxX);
            const py = clamp(sy + vyScreen * sp * t, R.ShipMinY, R.ShipMaxY);
            for (const s of r.shots) {
                if (Math.abs(s.x - sx) > 110 || Math.abs(s.y - sy) > 110 || !this._known(s.id)) continue;
                const dx = s.x + s.vx * t - px, dy = s.y + s.vy * t - py;
                const c = Math.hypot(dx, dy) - (R.ShotR + R.ShipR);
                if (c < min) min = c;
            }
            for (const e of r.air) {
                if (!e.alive || e.boss || Math.abs(e.x - sx) > 120 || Math.abs(e.y - sy) > 140 || !this._known(e.id)) continue;
                const dx = e.x + e.vx * t - px, dy = e.y + e.vy * t - py;
                let rad = airRadius(e) + R.ShipR;
                if (e.kind === AirKind.Mine) {
                    // keep out of a mine's reach (it arms); an armed one is a ring about to go
                    rad = e.armT >= 0 && R.MineFuse - e.armT < t + 0.15 ? R.MineBlast + R.ShipR + 14 : R.MineSense - 8;
                }
                const c = Math.hypot(dx, dy) - rad;
                if (c < min) min = c;
            }
            for (const f of r.flak) {
                if (!this._known(f.id)) continue;
                const tb = f.burst ? -f.bt : f.T - f.t;              // seconds to the burst (negative: bursting)
                if (t < tb - 0.06 || t > tb + R.FlakLethal + 0.04) continue;
                const c = Math.hypot(f.tx - px, f.ty - py) - (R.FlakR + R.ShipR - 2);
                if (c < min) min = c;
            }
            for (const b of r.bolts) {
                if (!this._known(b.id)) continue;
                const t0 = R.BoltWarn - b.t, t1 = t0 + R.BoltStrike;
                if (t < t0 - 0.08 || t > t1) continue;
                const c = Math.abs(b.x - px) - (R.BoltHalf + R.ShipR - 1);
                if (c < min) min = c;
            }
        }
        return min;
    }

    // a pod worth going for: in reach, nothing about to be bombed
    _pickPod(r, pick) {
        if (r.caps.length === 0 || !this.chance(this.podGreed)) return null;
        if (pick.tgt && pick.ok && Math.abs(r.sightX - pick.px) < 18 && Math.abs(r.sightY - pick.py) < 18) return null;
        let best = null, bd = Infinity;
        for (const c of r.caps) {
            if (c.y > R.ShipMaxY + 4 || c.y < NebulaScroll.FieldY + 4) continue;
            const d = Math.abs(c.x - r.shipX) + Math.abs(c.y - r.shipY) * 0.6;
            if (d < 150 && d < bd) { bd = d; best = c; }
        }
        return best;
    }

    // the nearest bombable ground target, and where it will be when a bomb dropped now lands
    _pickGround(r) {
        const out = { tgt: null, px: 0, py: 0, ok: true, air: null, wait: false };
        const sc = r.scroll;
        const drift = sc.parked ? 0 : sc.speed * R.BombFlight;
        const reachTop = R.ShipMinY - R.SightDist;          // 36
        const reachBottom = R.ShipMaxY - R.SightDist - 4;   // 146
        let bestD = Infinity;
        const sx = r.sightX, sy = r.sightY;
        for (const g of r.ground) {
            if (!g.alive || g.hidden || g.boss || isShielded(g)) continue;
            const gy = sc.toScreenY(g.mapY) + drift;
            if (gy < reachTop || gy > reachBottom) continue;
            const gx = g.x + (g.kind === GroundKind.Tank ? g.vx * R.BombFlight : 0);
            const d = Math.abs(gx - sx) + Math.abs(gy - sy) * 0.7;
            if (d < bestD) { bestD = d; out.tgt = g; out.px = gx; out.py = gy; }
        }
        return out;
    }

    // the boss's next part: the near ones first, the heart once its dome is down. While the boss rolls in, the parts are
    // led for the scroll like any ground target; until the first is in reach it waits low on the tube.
    _pickBoss(r) {
        const b = r.boss, sc = r.scroll;
        const out = { tgt: null, px: 0, py: 0, ok: true, air: null, wait: false };
        const drift = sc.parked ? 0 : sc.speed * R.BombFlight;
        const reachTop = R.ShipMinY - R.SightDist;
        const reachBottom = R.ShipMaxY - R.SightDist - 4;
        const syOf = (p) => sc.toScreenY(p.mapY) + drift;
        const near = (list) => {
            let best = null, bd = Infinity;
            for (const p of list) {
                if (!p.alive || isShielded(p)) continue;
                const d = Math.abs(p.x - r.sightX) + Math.abs(syOf(p) - r.sightY) * 0.7;
                if (d < bd) { bd = d; best = p; }
            }
            return best;
        };
        const ground = (p) => {
            const y = syOf(p);
            if (y < reachTop - 12) { out.wait = true; out.px = p.x; return out; }
            out.tgt = p; out.px = p.x + (p.vx || 0) * R.BombFlight; out.py = clamp(y, reachTop, reachBottom);
            out.ok = y >= reachTop - 2;
            return out;
        };
        switch (b.kind) {
            case 'radar': {
                // the bottom pair first: under a live top core is a long way from it, under a live bottom core is not
                let best = null;
                for (const c of b.req) if (c.alive && (best == null || syOf(c) > syOf(best) + 1 || (Math.abs(syOf(c) - syOf(best)) <= 1 && Math.abs(c.x - r.sightX) < Math.abs(best.x - r.sightX)))) best = c;
                if (best != null) return ground(best);
                break;
            }
            case 'crawler': case 'prism': {
                const g = near(b.req.filter(p => p !== b.core));
                if (g != null) return ground(g);
                if (b.core.alive && !isShielded(b.core)) return ground(b.core);
                break;
            }
            case 'mother': {
                const g = near(b.req.filter(p => p !== b.core));
                if (g != null) return ground(g);
                const iris = b.core;
                if (!iris.alive) break;
                ground(iris);
                // land the bomb while the iris is open
                const fall = R.BombFlight + 0.03;
                out.ok = out.ok && ((b.irisState === 2 && b.irisT > fall) || (b.irisState === 1 && b.irisT < fall - 0.06));
                return out;
            }
            case 'thunderhead': {
                if (!b.spawned) break;
                let best = null, bd = Infinity;
                for (const p of b.req) {
                    if (!p.alive || p.locked) continue;
                    const d = Math.abs(p.x - r.shipX);
                    if (d < bd) { bd = d; best = p; }
                }
                if (best != null) {
                    out.air = best;
                    out.px = best.x + best.vx * (r.shipY - best.y) / R.BulletSpeed;
                    return out;
                }
                break;
            }
        }
        return this._pickGround(r);
    }

    _pickAir(r) {
        let best = null, bd = Infinity;
        for (const e of r.air) {
            if (!e.alive || e.boss || e.y > r.shipY - 24 || e.y < NebulaScroll.FieldY) continue;
            if (e.kind === AirKind.Spinner && e.mode === 2) continue;
            if (e.kind === AirKind.Mine) continue;
            const d = Math.abs(e.x - r.shipX) + (r.shipY - e.y) * 0.3;
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }
}
