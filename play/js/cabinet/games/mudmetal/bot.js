// THE NODE · world 1 · MUD & METAL · THE BOT: a modelled average player, through the panel only.
// Port of MudMetalBot.cs.
//
// The brief's three habits:
//   HEAT    hold turbo (A+B) until the gauge reads near its top, let go of B just long enough for
//           the heat to drop one segment, then back on turbo. It only watches the gauge on the
//           ground: in the air its hands are busy leaning, so a long jump can carry it over the line.
//   JUMPS   at every takeoff it judges where it will land and leans back (or, now and then,
//           forward) to meet the ground level. The judgement is a player's: a timing error on
//           every jump, bigger when the lean it needs is long.
//   RIVALS  change lane away from a rider ahead in its lane, once it notices him closing.
// And like people: it steers round mud about half the time, and each round it is a slightly
// different player (a steadier or a shakier hand, a quicker or slower eye), drawn from its own dice.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { Lanes } from './track.js';
import { MudMetalSim } from './sim.js';

export class MudMetalBot extends CabinetBotBase {
    constructor() {
        super();
        // the population (tuned so credit 1 is won by roughly a third of players)
        this.leanErrAbs = 0.075;       // s: timing error of a lean, 1 sigma, for a typical player
        this.leanErrRel = 0.16;        // x the lean's length, 1 sigma
        this.handMin = 0.4; this.handMax = 4.0;    // the per-round player's hand (x the lean errors)
        this.handSkew = 2.0;                       // hand = min + range * u^skew: most players steadier, a long shaky tail
        this.eyeSpread = 0.5;          // the same player's eye (rivals, the gauge), mostly tied to the hand
        this.flagCare = 0.75;          // share of players who stop redlining in sight of the flag
        this.gaugeFrac = 0.78;         // releases B when the heat reads this far up the gauge
        this.gaugeFracSd = 0.07;
        this.gaugeLook = 5;            // looks at the gauge this often per second (ground only)
        this.rivalNotice = 4.5;        // per second: noticing a closing rider ahead
        this.mudAvoid = 0.5;
        this.turboChance = 1;

        this._hand = 0; this._eye = 0; this._gaugeFrac = 0; this._careful = false;
        this._cool = false; this._coolTo = 0;
        this._wasAir = false; this._leanLeft = 0; this._leanDelay = 0; this._leanDir = 0;
        this._laneCooldown = 0; this._decidedMud = -1; this._dodgeMud = false;
        this._lastPhase = -1;
    }

    get name() { return 'mm-average-player'; }

    reset(seed) {
        super.reset(seed);
        const u = this.rng.nextDouble();
        this._hand = this.handMin + (this.handMax - this.handMin) * Math.pow(u, this.handSkew);
        this._eye = Math.exp(((u - 0.5) * 2.4 + this._gauss() * 0.6) * this.eyeSpread);
        this._careful = this.chance(this.flagCare);
        this._gaugeFrac = Math.max(0.55, Math.min(0.95, this.gaugeFrac + this._gauss() * this.gaugeFracSd + (this._eye - 1) * 0.05));
        this._cool = false; this._coolTo = 0; this._wasAir = false; this._leanLeft = 0; this._leanDelay = 0; this._leanDir = 0;
        this._laneCooldown = 0; this._decidedMud = -1; this._dodgeMud = false; this._lastPhase = -1;
    }

    _gauss() {
        const u1 = 1 - this.rng.nextDouble(), u2 = this.rng.nextDouble();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    think(sim, dt) {
        const m = sim;
        if (m == null) return InputFrame.neutral;
        const phase = m.p;
        if (phase !== this._lastPhase) { this._lastPhase = phase; this._wasAir = false; this._cool = false; }
        if (m.p !== MudMetalSim.Phase.Race) return InputFrame.neutral;

        const p = m.player;
        const f = new InputFrame();
        if (this._laneCooldown > 0) this._laneCooldown -= dt;

        // ---- heat: turbo to the mark, ease off one segment, turbo again
        const stalled = p.stallT > 0;
        if (stalled) this._cool = false;
        else if (!p.airborne && this.chance(this.gaugeLook / this._eye * dt)) {
            const mark = m.heatCap * this._gaugeFrac;
            if (!this._cool && p.heat >= mark) { this._cool = true; this._coolTo = p.heat - 1; }
            else if (this._cool && p.heat <= this._coolTo) this._cool = false;
        }
        f.a = true;
        f.b = !this._cool && !stalled;
        if (this._careful && m.progress > 0.93 && p.heat > m.heatCap - MudMetalSim.WarnSegments - 1) f.b = false;   // not at the flag

        // ---- jumps: judge the landing at takeoff, lean to meet it
        if (p.airborne && !this._wasAir) {
            const pred = m.predictLanding(p);
            const need = pred.surfDeg - pred.velDeg;                       // degrees of lean to land level
            const dur = Math.abs(need) / MudMetalSim.LeanRate;
            const err = this._gauss() * this._hand * (this.leanErrAbs + this.leanErrRel * dur);
            this._leanDir = need >= 0 ? 1 : -1;
            this._leanLeft = Math.max(0, dur + err);
            this._leanDelay = Math.min(pred.t * 0.4, 0.04 + this.rng.nextDouble() * 0.12 * this._eye);
            if (Math.abs(need) < 4) this._leanLeft = 0;                    // near enough: leave it
        }
        this._wasAir = p.airborne;
        if (p.airborne) {
            if (this._leanDelay > 0) this._leanDelay -= dt;
            else if (this._leanLeft > 0) { f.x = this._leanDir > 0 ? -1 : 1; this._leanLeft -= dt; }
            return f;
        }

        // ---- lanes: away from a rider ahead, round the mud
        if (this._laneCooldown > 0 || Math.abs(p.laneF - p.laneTarget) > 0.05) return f;
        const lane = p.laneTarget;
        const look = 28 + Math.max(0, p.speed - 90) * 0.9;
        let ahead = null;
        for (const r of m.rivals) {
            if (!r.active || Math.abs(r.laneF - lane) > 0.6) continue;
            const dx = r.x - p.x;
            if (dx > 4 && dx < look && r.speed < p.speed + 5) { ahead = r; break; }
        }
        if (ahead != null && this.chance(this.rivalNotice / this._eye * dt)) {
            const to = this._pickLane(m, lane, ahead);
            if (to !== lane) return this._steer(f, to - lane);
        }
        const mud = m.track.mudAhead(p.x, lane, 70 + p.speed * 0.5);
        if (mud >= 0 && mud !== this._decidedMud) { this._decidedMud = mud; this._dodgeMud = this.chance(this.mudAvoid); }
        if (mud >= 0 && this._dodgeMud) {
            const to = this._pickLane(m, lane, null);
            if (to !== lane && m.track.mudAhead(p.x, to, 70 + p.speed * 0.5) < 0) { this._dodgeMud = false; return this._steer(f, to - lane); }
        }
        return f;
    }

    _steer(f, dir) {
        this._laneCooldown = 0.35;
        f.y = dir < 0 ? 1 : -1;       // stick up = the lane behind (lower index)
        return f;
    }

    // the neighbouring lane with nobody close in it (prefer the side away from the rider)
    _pickLane(m, lane, from) {
        let a = lane - 1, b = lane + 1;
        if (this.rng.nextDouble() < 0.5) { const t = a; a = b; b = t; }
        for (const to of [a, b]) {
            if (to < 0 || to >= Lanes) continue;
            let clear = true;
            for (const r of m.rivals)
                if (r.active && Math.abs(r.laneF - to) < 0.7 && r.x - m.player.x > -30 && r.x - m.player.x < 70) { clear = false; break; }
            if (clear) return to;
        }
        return lane;
    }
}
