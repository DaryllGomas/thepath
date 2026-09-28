// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE BOT: a modelled average player.
// Port of Staging/Batch4/nebularun/Games/NebulaRun/NebulaRunBot.cs.
//
// It plays through the control panel like anyone else (stick, A held, B tapped) and decides 20
// times a second, holding its input in between. Its dice are its own (this.rng, via chance/range).
//   GROUND   keeps the bomb sight on the nearest ground target it can reach (leading it for the
//            0.42 s fall and the scroll) and drops when the sight is on it; drops on a locked
//            sight now and then too.
//   AIR      holds the air gun while an air target is in its column; with nothing to bomb it
//            lines up under the nearest interceptor.
//   WEAVE    it only dodges what it has NOTICED (noticeRate per second for each thing on the
//            tube, then reaction seconds before it acts on it) and scores nine stick choices
//            by the clearance they keep over the next half second. An interceptor that holds
//            its lane for more than a beat (laneBeat) pushes it a lane over.
//   FORTRESS strafes the cores in order (top-left, top-right, bottom-right, bottom-left),
//            skipping dead ones, bombing each until it goes.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { NebulaRunRound, AirKind, GroundKind, airRadius } from './round.js';
import { NebulaScroll } from './scroll.js';

const Phase = NebulaRunRound.Phase;
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
        let gx, gy, bomb = false;
        const pick = this._pickGround(r);
        if (pick.tgt) {
            gx = pick.px + this._jitterX;
            gy = pick.py + NebulaRunRound.SightDist;
            if (!r.bombActive && Math.abs(r.sightX - pick.px) < this.aimTol && Math.abs(r.sightY - pick.py) < this.aimTol + 2) bomb = true;
        } else {
            const a = this._pickAir(r);
            gx = a != null ? a.x + this._jitterX : 160 + this._jitterX;
            gy = 190;
        }
        if (!bomb && !r.bombActive && r.sightLocked && this.chance(0.3)) bomb = true;

        // the lane: an interceptor sitting above us too long pushes us over
        let lane = null;
        for (const e of r.air)
            if (e.alive && e.y < sy - 10 && sy - e.y < 150 && Math.abs(e.x - sx) < 14 &&
                (e.kind === AirKind.Dart || (e.kind === AirKind.Spinner && e.mode < 2))) { lane = e; break; }
        if (lane != null) this._laneT += this.decideEvery; else this._laneT = 0;
        if (this._laneT > this.laneBeat && this._laneShiftT <= 0) {
            this._laneShiftT = 0.5;
            this._laneShift = (lane.x > sx ? -1 : 1) * 36;
            if (sx + this._laneShift < NebulaRunRound.ShipMinX + 6 || sx + this._laneShift > NebulaRunRound.ShipMaxX - 6) this._laneShift = -this._laneShift;
            this._laneT = 0;
        }
        if (this._laneShiftT > 0) { this._laneShiftT -= this.decideEvery; gx = sx + this._laneShift; }

        gx = clamp(gx, NebulaRunRound.ShipMinX, NebulaRunRound.ShipMaxX);
        gy = clamp(gy, NebulaRunRound.ShipMinY, NebulaRunRound.ShipMaxY);

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
                const nx = clamp(sx + vx * NebulaRunRound.ShipSpeed * t, NebulaRunRound.ShipMinX, NebulaRunRound.ShipMaxX);
                const ny = clamp(sy - vy * NebulaRunRound.ShipSpeed * t, NebulaRunRound.ShipMinY, NebulaRunRound.ShipMaxY);
                const d = Math.hypot(nx - gx, ny - gy);
                s -= d;
                if (ox === 0 && oy === 0 && Math.abs(sx - gx) < 2.5 && Math.abs(sy - gy) < 2.5) s += 3;   // settle, don't dither
                if (s > best) { best = s; bestX = ox; bestY = oy; }
            }

        const f = new InputFrame(bestX, bestY);
        // the air gun
        let lined = false;
        for (const e of r.air)
            if (e.alive && e.y < sy - 6 && Math.abs(e.x - sx) < airRadius(e) + 4) { lined = true; break; }
        f.a = lined || (r.firing && this.chance(0.8)) || this.chance(this.sprayChance);
        f.b = bomb;
        return f;
    }

    _notice(r) {
        const p = 1 - Math.exp(-this.noticeRate * this.decideEvery);
        for (const s of r.shots) if (!this._seen.has(s.id) && this.chance(p)) this._seen.set(s.id, this._clock);
        for (const e of r.air) if (e.alive && e.y > NebulaScroll.FieldY - 4 && !this._seen.has(e.id) && this.chance(p)) this._seen.set(e.id, this._clock);
        if (this._seen.size > 400) {
            const keep = new Map();
            for (const s of r.shots) if (this._seen.has(s.id)) keep.set(s.id, this._seen.get(s.id));
            for (const e of r.air) if (this._seen.has(e.id)) keep.set(e.id, this._seen.get(e.id));
            this._seen = keep;
        }
    }

    _known(id) { return this._seen.has(id) && (this._clock - this._seen.get(id)) >= this.reaction; }

    // the smallest clearance (px beyond touching) over the next half second on this heading
    _clearance(r, sx, sy, vx, vyScreen) {
        let min = 60;
        const sp = NebulaRunRound.ShipSpeed;
        for (const s of r.shots) {
            if (Math.abs(s.x - sx) > 110 || Math.abs(s.y - sy) > 110 || !this._known(s.id)) continue;
            for (const t of Samples) {
                const px = clamp(sx + vx * sp * t, NebulaRunRound.ShipMinX, NebulaRunRound.ShipMaxX);
                const py = clamp(sy + vyScreen * sp * t, NebulaRunRound.ShipMinY, NebulaRunRound.ShipMaxY);
                const dx = s.x + s.vx * t - px, dy = s.y + s.vy * t - py;
                const c = Math.hypot(dx, dy) - (NebulaRunRound.ShotR + NebulaRunRound.ShipR);
                if (c < min) min = c;
            }
        }
        for (const e of r.air) {
            if (!e.alive || Math.abs(e.x - sx) > 120 || Math.abs(e.y - sy) > 140 || !this._known(e.id)) continue;
            for (const t of Samples) {
                const px = clamp(sx + vx * sp * t, NebulaRunRound.ShipMinX, NebulaRunRound.ShipMaxX);
                const py = clamp(sy + vyScreen * sp * t, NebulaRunRound.ShipMinY, NebulaRunRound.ShipMaxY);
                const dx = e.x + e.vx * t - px, dy = e.y + e.vy * t - py;
                const c = Math.hypot(dx, dy) - (airRadius(e) + NebulaRunRound.ShipR);
                if (c < min) min = c;
            }
        }
        return min;
    }

    // the nearest bombable ground target, and where it will be when a bomb dropped now lands
    _pickGround(r) {
        let px = 0, py = 0;
        const sc = r.scroll;
        const drift = sc.parked ? 0 : sc.speed * NebulaRunRound.BombFlight;
        const reachTop = NebulaRunRound.ShipMinY - NebulaRunRound.SightDist;          // 36
        const reachBottom = NebulaRunRound.ShipMaxY - NebulaRunRound.SightDist - 4;   // 146
        if (r.bossZone) {
            for (let i = 0; i < 4; i++) {
                const c = r.coreByIndex(i);
                if (c == null || !c.alive) continue;
                const cy = sc.toScreenY(c.mapY) + drift;
                if (cy < reachTop - 30) return { tgt: null, px: 0, py: 0 };            // not in reach yet: wait below
                px = c.x; py = Math.max(cy, reachTop);
                return { tgt: c, px, py };
            }
        }
        let best = null, bestD = Infinity;
        const sx = r.sightX, sy = r.sightY;
        for (const g of r.ground) {
            if (!g.alive || g.kind === GroundKind.Core) continue;
            const gy = sc.toScreenY(g.mapY) + drift;
            if (gy < reachTop || gy > reachBottom) continue;
            const gx = g.x + (g.kind === GroundKind.Tank ? g.vx * NebulaRunRound.BombFlight : 0);
            const d = Math.abs(gx - sx) + Math.abs(gy - sy) * 0.7;
            if (d < bestD) { bestD = d; best = g; px = gx; py = gy; }
        }
        return { tgt: best, px, py };
    }

    _pickAir(r) {
        let best = null, bd = Infinity;
        for (const e of r.air) {
            if (!e.alive || e.y > r.shipY - 24 || e.y < NebulaScroll.FieldY) continue;
            if (e.kind === AirKind.Spinner && e.mode === 2) continue;
            const d = Math.abs(e.x - r.shipX) + (r.shipY - e.y) * 0.3;
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }
}
