// THE NODE · world 1 · SUNSET DRIVE on the Cabinet Engine · THE BOT: a modelled average driver.
//
// It plays only through the InputFrame a person makes (stick left/right, A = gas, B = brake), reads the
// round and never writes to it; its dice are its own (this.rng).
//   look      every 0.13-0.27 s it looks again (reaction time) and only then changes what it holds
//   line      it aims for a lane of its road a little ahead, cutting partly toward the inside of a bend;
//             how much it allows for the bend's pull is a per-look guess (`pullGuess`), so it drifts wide
//             or clips the inside like a thumb on a key
//   steer     digital: left or right, held until the next look, with a dead zone and no feel for the
//             car's sideways speed beyond a rough guess
//   traffic   a car in its lane within ~30 segments is noticed with `notice` per look; then it picks the
//             lane that looks clearest (mostly right); sometimes it just does not see it
//   pedals    gas held; ahead of a hard bend at speed it lifts (`lift`) or brakes briefly (`brake`),
//             otherwise it charges in and slides wide
//   lapses    now and then its attention goes (`lapse` per second) and it holds what it had for 0.3-0.8 s
//   the fork  it picks a side when the fork is announced (half and half) and holds to it
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { SunsetRound } from './round.js';
import { segAt, roadAt } from './course.js';
import { SEG, MAXS } from './constants.js';

const Phase = SunsetRound.Phase;
const LANES = [-0.62, 0, 0.62];

export class SunsetBot extends CabinetBotBase {
    constructor() {
        super();
        this.lookMin = 0.13; this.lookMax = 0.27;
        this.dead = 0.12;                 // dead zone around the target (road half-widths)
        this.aimErr = 0.09;               // lateral error of the chosen line, per look
        this.pullGuess = [0.45, 1.05];    // how much of the bend's pull it allows for (per look)
        this.notice = 0.72;               // chance per look it sees a car in its lane
        this.lift = 0.6;                  // ahead of a hard bend at speed: chance it lifts
        this.brake = 0.15;                // ... or brakes briefly
        this.panic = 0.5;                 // a car right in front, no way round: chance it brakes
        this.slideLift = 0.5;             // pushed wide in a bend: chance per look it lifts off
        this.lapse = 0.10;                // attention lapses per second
        this._reset();
    }

    get name() { return 'sd-average-driver'; }

    reset(seed) { super.reset(seed); this._reset(); }

    _reset() {
        this._look = 0; this._steer = 0; this._gas = true; this._brakeT = 0; this._lapseT = 0;
        this._lane = 1; this._side = 0; this._liftUntil = -1; this._decidedCurve = -1;
    }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.track == null) return InputFrame.neutral;
        if (r.p === Phase.Countdown) return new InputFrame(0, 0, r.lights >= 2, false);      // revs on the lights
        if (r.p !== Phase.Running) return InputFrame.neutral;
        if (r.crash) { this._steer = 0; return new InputFrame(0, 0, true, false); }
        this._look -= dt;
        if (this._lapseT > 0) this._lapseT -= dt;
        else if (this._look <= 0) {
            this._look = this.range(this.lookMin, this.lookMax);
            if (this.chance(this.lapse * this._look)) this._lapseT = this.range(0.3, 0.8);
            else this._decide(r);
        }
        const out = new InputFrame(this._steer, 0, this._gas, false);
        if (this._brakeT > 0) { this._brakeT -= dt; out.a = false; out.b = true; }
        return out;
    }

    _decide(r) {
        const tr = r.track, pz = r.playerZ, sp = r.speed / MAXS;
        // the fork: choose once, when it is announced
        if (!r.tip && r.cp1 && this._side === 0) this._side = this.chance(0.5) ? -1 : 1;
        const look = pz + (7 + sp * 12) * SEG;
        const sAhead = segAt(tr, look);
        const forkLanes = !r.tip && sAhead.n === 2 && this._side !== 0;
        const k = forkLanes ? (this._side < 0 ? 0 : 1) : r.roadIdx;
        // x is measured from the road, so the road's centre HERE is the reference (curves do not move it)
        const c = roadAt(tr, k, pz);
        // before the fork tip only the two lanes away from the median are used
        const allowed = i => !forkLanes || (this._side < 0 ? i < 2 : i > 0);
        if (!allowed(this._lane)) this._lane = this._side < 0 ? 0 : 2;
        let blocked = false;
        if (this.chance(this.notice)) {
            // one lane at a time, like a person: move over only into a lane with room to merge and more road
            const mine = r.clearAhead(c + LANES[this._lane], 40, 0.34);
            if (mine < 30) {
                let best = this._lane, bestScore = mine + 4;
                for (const i of [this._lane - 1, this._lane + 1]) {
                    if (i < 0 || i > 2 || !allowed(i)) continue;
                    if (r.clearAhead(c + LANES[i], 12, 0.3) < 12) continue;
                    const cl = r.clearAhead(c + LANES[i], 40, 0.34) + (i === 2 ? 1 : 0);
                    if (cl > bestScore) { bestScore = cl; best = i; }
                }
                blocked = best === this._lane && mine < 10 && sp > 0.6;
                this._lane = best;
            }
        }
        // the bend ahead: the sharpest curve in the next 30 segments
        let bend = 0;
        for (let d = 4; d <= 30; d += 2) { const cv = segAt(tr, pz + d * SEG).curve; if (Math.abs(cv) > Math.abs(bend)) bend = cv; }
        const here = segAt(tr, pz).curve;
        // into a bend it drifts toward the inside lane when that lane is free
        if (Math.abs(bend) >= 2.5 && !forkLanes) {
            const inside = this._lane + (bend > 0 ? 1 : -1);
            if (inside >= 0 && inside < 3 && r.clearAhead(c + LANES[inside], 30, 0.34) >= 30 && this.chance(0.5)) this._lane = inside;
        }
        let target = c + LANES[this._lane] + Math.max(-0.1, Math.min(0.1, bend * 0.025)) + this.range(-this.aimErr, this.aimErr);
        // give a car in the next lane some room
        for (const dl of [-1, 1]) {
            const li = this._lane + dl;
            if (li >= 0 && li < 3 && r.clearAhead(c + LANES[li], 14, 0.3) < 14) target -= dl * 0.12;
        }
        // on the way to another lane: if a car is right there in the path, hold where it is
        // (a car beside it in the lane it is moving into; not the one it is getting away from)
        if (Math.abs(target - r.x) > 0.25 && r.clearAhead(target, 6, 0.28) < 6 && r.clearAhead(r.x, 8, 0.2) >= 8) target = r.x;
        // steer (digital), allowing roughly for the pull of the bend it is in
        const guess = this.range(this.pullGuess[0], this.pullGuess[1]);
        const pull = here * sp * sp * 0.5 * guess;
        const err = target - (r.x - pull * 0.15);
        this._steer = err > this.dead ? 1 : err < -this.dead ? -1 : 0;
        // off the road: get back on, now
        if (r.offroad) this._steer = r.x < r.roadCentre ? 1 : -1;
        // pedals: before a hard bend at speed it lifts or brakes (or does not); boxed in, it may brake
        this._gas = true;
        if (Math.abs(bend) >= 4 && sp > 0.86 && this._decidedCurve !== Math.floor(pz / (40 * SEG))) {
            this._decidedCurve = Math.floor(pz / (40 * SEG));
            if (this.chance(this.brake)) this._brakeT = this.range(0.15, 0.35);
            else if (this.chance(this.lift)) this._liftUntil = r.time + this.range(0.3, 0.8);
        }
        if (blocked && this.chance(this.panic)) this._brakeT = this.range(0.12, 0.3);
        // being pushed wide in a bend: lift off for a moment (most of the time)
        const wide = (r.x - target) * Math.sign(-here);                    // > 0: on the outside of the bend
        if (Math.abs(here) >= 2 && sp > 0.8 && wide > 0.25 && r.time >= this._liftUntil && this.chance(this.slideLift)) this._liftUntil = r.time + this.range(0.25, 0.5);
        if (r.time < this._liftUntil) this._gas = false;
    }
}
