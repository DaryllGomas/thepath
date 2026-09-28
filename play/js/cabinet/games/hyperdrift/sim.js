// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of HyperDriftSim.cs (Staging/Batch3/hyperdrift), 1:1, floats as C# floats (f32 everywhere).
//
// A top-down, vertically scrolling road racer: Spy Hunter's road without the weapons. The road
// scrolls down the screen, so your car drives up it. ONE STAGE: reach the checkpoint before the clock
// runs out. THE CLOCK IS THE LIFE: at 0 the round is lost. Hitting a car or leaving the road is a
// SPIN-OUT (2 s of spinning while the clock keeps running), never a life.
//
//   stick left/right  steer (the car slides sideways toward stick x grip, with a little inertia)
//   stick up / down   accelerate / brake (nothing held: the car coasts down slowly)
//   A (held)          DRIFT: a short handbrake, up to 1 s. Tighter turn, speed bleeds away.
//                     Normal grip turns at most 0.9 px across per px up (and 110 px/s across);
//                     a drift turns 2.2 (150 px/s). The hairpins need about 1.3: drift or spin.
//
// On the road: slow trucks and cars in your lane to pass, oncoming cars in the far lane, oil slicks
// (spin), two road works (cones shut your lane; a flagman holds the oncoming traffic above the works
// while you're in them), a bridge over a river (rails, no shoulder), a fork (the right branch is empty
// but twistier) and four hairpins, each with a chevron sign before it.
//
// SCORE: 1 a 5 px of new road (about 2,060 for the stage), 100 a clean pass (a car or truck going your
// way, overtaken without touching it), 250 for drifting through a hairpin without a spin.
//
// MERCY (Core): the clock is x1.10 per lost round, the road's margin (how far the car may hang off the
// asphalt before it spins) +3 px per lost round. Credit 5: the road is empty (no traffic, no oil) and
// the clock cannot run out (it holds at 1). You can still spin; you cannot lose.
//
// Round life: Countdown (Intro) -> Racing (Playing) -> Finish (Interlude: CHECKPOINT or TIME UP, 1.6 s)
// -> Card -> Over. Result is set when the Card begins, never before.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { HyperDriftTrack, HyperDriftScroll, ZoneKind } from './track.js';

const Phase = Object.freeze({ Idle: 0, Countdown: 1, Racing: 2, Finish: 3, Card: 4, Over: 5 });
const SpinCause = Object.freeze({ None: 0, Car: 1, Road: 2, Oil: 3, Cones: 4, Rail: 5 });
const Ev = Object.freeze({ Start: 0, Pass: 1, DriftStart: 2, HairpinDrift: 3, Spin: 4, WorksEnter: 5, BridgeEnter: 6, ForkEnter: 7, Checkpoint: 8, TimeUp: 9 });
const EvNames = Object.freeze(['Start', 'Pass', 'DriftStart', 'HairpinDrift', 'Spin', 'WorksEnter', 'BridgeEnter', 'ForkEnter', 'Checkpoint', 'TimeUp']);

const HalfWidth = HyperDriftTrack.HalfWidth, LaneOffset = HyperDriftTrack.LaneOffset, Checkpoint = HyperDriftTrack.Checkpoint;
const SkidCap = 640;

// the C# float literals this file uses (a bare 0.3 in JS would be a double)
const F0_05 = f32(0.05), F0_1 = f32(0.1), F0_2 = f32(0.2), F0_3 = f32(0.3), F0_35 = f32(0.35), F0_4 = f32(0.4);
const F0_45 = f32(0.45), F0_55 = f32(0.55), F0_6 = f32(0.6), F0_78 = f32(0.78), F0_85 = f32(0.85);
const F1_2 = f32(1.2), F1_9 = f32(1.9), F2_2 = f32(2.2), F2_4 = f32(2.4);
void F0_05;

export class Vehicle {
    constructor() {
        this.id = 0;
        this.truck = false;
        this.dir = 0;                      // +1 your way, -1 oncoming
        this.s = 0; this.x = 0; this.lane = 0;   // lane = perpendicular offset from the road centre
        this.speed = 0; this.baseSpeed = 0;     // along the road, px/s (>0)
        this.cur = 0;                      // the speed it actually moved at this step
        this.passed = false; this.hit = false; this.stopped = false; this.held = false;
        this.knockT = 0; this.knockDir = 0; this.wobble = 0;
    }
    get halfW() { return this.truck ? 7 : 6; }
    get halfL() { return this.truck ? 14 : 10; }
}

export class Slick {
    constructor(s, x) { this.s = s; this.x = x; }
}
Slick.RX = 11; Slick.RS = 5;

export class HyperDriftSim {
    constructor() {
        // ------------------------------------------------------------------ the machine's numbers (not mercy knobs)
        this.countdownStep = f32(0.8); this.goHold = f32(0.5); this.finishSeconds = f32(1.6); this.cardSeconds = f32(3.0);
        this.spinSeconds = f32(2.0); this.ghostSeconds = f32(1.2);
        this.accel = f32(95); this.brake = f32(260); this.coast = f32(28); this.driftDecel = f32(60); this.driftMax = f32(1.0); this.driftCool = f32(0.2);
        this.tanNormal = f32(0.9); this.gripNormal = f32(110); this.tanDrift = f32(2.2); this.gripDrift = f32(150);
        this.latAcc = f32(520); this.latAccDrift = f32(700); this.lowSpeedGrip = f32(55);
        this.passPoints = 100; this.driftPoints = 250; this.pxPerPoint = 5;

        // ------------------------------------------------------------------ read-only state
        this.track = HyperDriftTrack.Course;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.countdownLeft = 0;
        this.credit = null;
        this.finishedAtCheckpoint = false;

        this.clockStart = 0; this.clock = 0; this.margin = 0; this.vMax = 0; this.trafficDensity = 0;

        // your car
        this.x = 0; this.s = 0;
        this.v = 0;                        // up the road, px/s
        this.vx = 0;                       // across, px/s
        this.bodyAngle = 0;                // radians clockwise from up (drawing)
        this.drifting = false; this.driftTime = 0; this.driftCooldown = 0;
        this.spinLeft = 0; this.lastSpin = SpinCause.None; this.spinAngle = 0;
        this.ghostLeft = 0; this.onKerb = false; this.maxS = 0;
        this.throttle = 0;                 // -1 brake, 0, +1 gas (for the tail lights)

        this.traffic = [];
        this.oil = [];
        this.popups = [];                  // { text, x, s, t, big }
        this.log = [];                     // { t, kind, s, x, info }

        // skid marks: a ring of world points
        this.skidX = new Float32Array(SkidCap); this.skidS = new Float32Array(SkidCap);
        this.skidCount = 0;
        this._skidHead = 0;

        // tallies
        this.passes = 0; this.hairpinDrifts = 0;
        this.spinsCar = 0; this.spinsRoad = 0; this.spinsOil = 0; this.spinsCones = 0; this.spinsRail = 0;

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._score = 0; this._distPoints = 0; this._nextId = 0;
        this._time = 0;
        this._rng = null;
        this._sameTimer = 0; this._oncTimer = 0;
        this._hpDrifted = null; this._hpSpoiled = null; this._hpDone = null;
        this._worksSeen0 = false; this._worksSeen1 = false; this._bridgeSeen = false; this._forkSeen = false;
        this._cause = SpinCause.None;      // Clearance's `out cause`
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get won() { return this._result === RoundResult.Won; }
    get spinning() { return this.spinLeft > 0; }
    get spins() { return this.spinsCar + this.spinsRoad + this.spinsOil + this.spinsCones + this.spinsRail; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Countdown: return CabinetState.Intro;
            case Phase.Racing: return CabinetState.Playing;
            case Phase.Finish: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return Math.max(0, Math.ceil(this.clock)); }          // the clock is the life
    get time() { return this._time; }
    get cues() { return this._cues; }
    get progress() { return Math.min(1, Math.max(0, f32(this.maxS / Checkpoint))); }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's clock ' + fmt(this.clock, 1, F32) + '/' + fmt(this.clockStart, 1, F32) +
            ' at ' + fmt(f32(this.progress * 100), 0, F32) + '% spins ' + this.spins + ' (car ' + this.spinsCar + ' road ' + this.spinsRoad + ' oil ' + this.spinsOil +
            ' cones ' + this.spinsCones + ' rail ' + this.spinsRail + ') passes ' + this.passes + ' hairpins ' + this.hairpinDrifts + '/' + this.track.hairpins.length;
    }

    reset(seed, credit, k) {
        const tr = this.track;
        this.credit = credit;
        this._rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        this.clockStart = k.get('clock');
        this.clock = this.clockStart;
        this.margin = k.get('margin');
        this.vMax = k.get('vmax');
        this.trafficDensity = k.get('traffic');
        const oilDensity = k.get('oil');

        this.x = tr.laneX(0, +1); this.s = 0; this.v = 0; this.vx = 0; this.bodyAngle = 0;
        this.drifting = false; this.driftTime = 0; this.driftCooldown = 0; this.spinLeft = 0; this.ghostLeft = 0; this.lastSpin = SpinCause.None;
        this.maxS = 0; this.onKerb = false; this.throttle = 0;
        this.traffic.length = 0; this.oil.length = 0; this.popups.length = 0; this.log.length = 0;
        this.skidCount = 0; this._skidHead = 0;
        this.passes = 0; this.hairpinDrifts = 0; this.spinsCar = this.spinsRoad = this.spinsOil = this.spinsCones = this.spinsRail = 0;
        this._score = 0; this._distPoints = 0; this._nextId = 0; this._time = 0;
        this._result = RoundResult.None; this.finishedAtCheckpoint = false;
        const hp = tr.hairpins.length;
        this._hpDrifted = new Array(hp).fill(false); this._hpSpoiled = new Array(hp).fill(false); this._hpDone = new Array(hp).fill(false);
        this._worksSeen0 = this._worksSeen1 = this._bridgeSeen = this._forkSeen = false;
        this._cues.resetTotals();

        // the oil is dealt per round: 1-2 slicks per patch (x density), in either lane
        const rng = this._rng;
        if (oilDensity > 0)
            for (const z of tr.oilPatches) {
                const n = roundEven(f32((1 + rng.next(2)) * oilDensity));
                for (let i = 0; i < n; i++) {
                    const s = f32(z.s0 + f32(f32(rng.nextDouble()) * (z.s1 - z.s0)));
                    if (tr.isBridge(s) || tr.isWorks(s) || tr.zoneAt(ZoneKind.Hairpin, s) !== null) continue;
                    const lane = rng.next(2) === 0 ? -1 : 1;
                    const off = f32(lane * LaneOffset + f32(f32(f32(rng.nextDouble()) - 0.5) * 10));
                    let clash = false;
                    for (const o of this.oil) if (Math.abs(f32(o.s - s)) < 90) clash = true;
                    if (clash) continue;
                    this.oil.push(new Slick(s, f32(tr.cx(s) + f32(off * tr.f(s)))));
                }
            }
        this.oil.sort((a, b) => a.s < b.s ? -1 : a.s > b.s ? 1 : 0);   // |ds| >= 90 between slicks: no ties

        this._sameTimer = f32(2.5); this._oncTimer = f32(1.5);
        this.p = Phase.Countdown; this.phaseTime = 0; this.countdownLeft = 3;
        this._cues.emit(SoundCue.Tick);
    }

    _emit(kind, info = 0) { this.log.push({ t: this._time, kind, s: this.s, x: this.x, info, toString: eventString }); }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > F0_1) dt = F0_1;
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        for (let i = this.popups.length - 1; i >= 0; i--) if (f32(this._time - this.popups[i].t) > F1_2) this.popups.splice(i, 1);

        switch (this.p) {
            case Phase.Countdown: {
                const hold = this.countdownLeft === 0 ? this.goHold : this.countdownStep;
                if (this.phaseTime >= hold) {
                    this.phaseTime = f32(this.phaseTime - hold);
                    this.countdownLeft--;
                    if (this.countdownLeft < 0) { this.p = Phase.Racing; this.phaseTime = 0; this._emit(Ev.Start); }
                    else this._cues.emit(this.countdownLeft === 0 ? SoundCue.Start : SoundCue.Tick);
                }
                break;
            }
            case Phase.Racing: {
                const before = this.clock;
                this.clock = f32(this.clock - dt);
                if (this.mercyActive && this.clock < 1) this.clock = 1;          // credit 5: the clock cannot run out
                if (this.clock < 10 && this.clock > 0 && Math.ceil(before) !== Math.ceil(this.clock)) this._cues.emit(SoundCue.Tick);
                this._driveCar(dt, input, true);
                this._moveTraffic(dt);
                this._contacts();
                this._landmarks();
                if (this.s >= Checkpoint) this._beginFinish(true);
                else if (this.clock <= 0) { this.clock = 0; this._beginFinish(false); }
                break;
            }
            case Phase.Finish:
                this._driveCar(dt, null, false);
                this._moveTraffic(dt);
                if (this.phaseTime >= this.finishSeconds) {
                    this._result = this.finishedAtCheckpoint ? RoundResult.Won : RoundResult.Lost;
                    this.p = Phase.Card; this.phaseTime = 0;
                    if (this._result === RoundResult.Won) this._cues.emit(SoundCue.Win);
                }
                break;
            case Phase.Card:
                this._moveTraffic(dt);
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _beginFinish(checkpoint) {
        this.finishedAtCheckpoint = checkpoint;
        this.p = Phase.Finish; this.phaseTime = 0;
        this.drifting = false;
        if (checkpoint) { this._emit(Ev.Checkpoint); this._cues.emit(SoundCue.Bonus); }
        else { this._emit(Ev.TimeUp); this._cues.emit(SoundCue.Die); }
    }

    // ------------------------------------------------------------------ your car
    _driveCar(dt, input, control) {
        const tr = this.track;
        let steer = 0, throttle = 0;
        let aHeld = false, aPressed = false;
        if (control && input != null) {
            steer = Math.max(-1, Math.min(1, input.x));
            if (Math.abs(steer) < F0_2) steer = 0;
            throttle = input.held(Pad.Up) ? 1 : input.held(Pad.Down) ? -1 : 0;
            aHeld = input.held(Pad.A);
            aPressed = input.pressed(Pad.A);
        }
        if (!control) {
            // the finish: roll through the checkpoint, or brake to a stop when the time is up
            steer = 0; throttle = this.finishedAtCheckpoint ? 0 : -1;
            const want = f32(tr.laneX(f32(this.s + 30), +1) - this.x);
            if (!this.spinning) steer = Math.max(-1, Math.min(1, f32(want / 20)));
        }
        this.throttle = throttle;
        if (this.ghostLeft > 0) this.ghostLeft = Math.max(0, f32(this.ghostLeft - dt));

        if (this.spinning) {
            this.spinLeft = f32(this.spinLeft - dt);
            const spinRate = f32(3 + f32(12 * Math.max(0, f32(this.spinLeft / this.spinSeconds))));
            this.spinAngle = f32(this.spinAngle + f32(spinRate * dt));
            this.v = f32(this.v * f32(Math.exp(-1.6 * dt)));
            this.vx = f32(this.vx * f32(Math.exp(-3.0 * dt)));
            this.x = f32(this.x + f32(this.vx * dt)); this.s = f32(this.s + f32(this.v * dt));
            this._keepNearRoad();
            this._addSkid();
            if (this.spinLeft <= 0) this._recover();
            this.maxS = Math.max(this.maxS, this.s);
            this._tallyDistance();
            return;
        }

        // the drift: a short handbrake while A is held
        if (this.driftCooldown > 0) this.driftCooldown = Math.max(0, f32(this.driftCooldown - dt));
        if (control && !this.drifting && aPressed && this.driftCooldown <= 0 && this.v > 40) {
            this.drifting = true; this.driftTime = 0;
            this._emit(Ev.DriftStart);
            this._markHairpin(true);
        }
        if (this.drifting) {
            this.driftTime = f32(this.driftTime + dt);
            if (!control || !aHeld || this.driftTime >= this.driftMax || this.v < 30) { this.drifting = false; this.driftCooldown = this.driftCool; }
            else this._markHairpin(true);
        }

        // speed
        if (this.drifting) this.v = f32(this.v - f32(f32(this.driftDecel + (throttle < 0 ? f32(this.brake * 0.5) : 0)) * dt));
        else if (throttle > 0) this.v = f32(this.v + f32(this.accel * dt));
        else if (throttle < 0) this.v = f32(this.v - f32(this.brake * dt));
        else this.v = f32(this.v - f32(this.coast * dt));
        const top = f32(this.vMax * (this.onKerb ? F0_78 : 1));
        if (this.v > top) this.v = Math.max(top, f32(this.v - f32(140 * dt)));
        if (this.v < 0) this.v = 0;

        // across
        // (a crawling car can still turn: at least lowSpeedGrip across once it's rolling)
        const low = f32(this.lowSpeedGrip * Math.min(1, f32(this.v / 25)));
        const cap = this.drifting ? Math.min(Math.max(f32(this.v * this.tanDrift), low), this.gripDrift)
                                  : Math.min(Math.max(f32(this.v * this.tanNormal), low), this.gripNormal);
        const target = f32(steer * cap);
        const acc = f32((this.drifting ? this.latAccDrift : this.latAcc) * dt);
        if (this.vx < target) this.vx = Math.min(target, f32(this.vx + acc)); else this.vx = Math.max(target, f32(this.vx - acc));

        this.x = f32(this.x + f32(this.vx * dt)); this.s = f32(this.s + f32(this.v * dt));
        this.x = Math.max(HyperDriftScroll.PX0 + 6, Math.min(HyperDriftScroll.PX1 - 6, this.x));

        const travel = f32(Math.atan2(this.vx, Math.max(this.v, 1)));
        const want2 = f32(travel + (this.drifting ? f32(Math.sign(steer !== 0 ? steer : this.vx) * F0_55) : 0));
        const turn = f32(9 * dt);
        this.bodyAngle = f32(this.bodyAngle + Math.max(-turn, Math.min(turn, f32(want2 - this.bodyAngle))));
        if (this.drifting) this._addSkid();
        this.maxS = Math.max(this.maxS, this.s);
        this._tallyDistance();

        // off the road?
        if (control) {
            const clr = this.clearance(this.x, this.s);
            const why = this._cause;
            this.onKerb = clr < f32(5 * tr.f(this.s)) && why !== SpinCause.Rail;
            if (clr < 0) this._startSpin(why);
        }
    }

    _tallyDistance() {
        const want = Math.trunc(f32(this.maxS / this.pxPerPoint));
        if (want > this._distPoints) { this._score += want - this._distPoints; this._distPoints = want; }
    }

    // how far inside the drivable road the car's centre is (px, horizontal); <0 = it has left it.
    // (C#'s `out SpinCause cause` lands in this._cause)
    clearance(x, s) {
        const tr = this.track;
        const f = tr.f(s), c = tr.cx(s);
        const bridge = tr.isBridge(s);
        const allow = bridge ? f32((HalfWidth - 3) + Math.min(this.margin, 3)) : f32((HalfWidth + 1) + this.margin);
        let clr = f32(f32(allow * f) - Math.abs(f32(x - c)));
        let cause = bridge ? SpinCause.Rail : SpinCause.Road;
        const co = tr.coneOff(s);
        if (!Number.isNaN(co)) {
            const lineX = f32(c + f32(co * f));
            const cclr = f32(f32(lineX - f32(x + 6)) + f32(f32(Math.min(this.margin, 6) * 0.5) * f));
            if (cclr < clr) { clr = cclr; cause = SpinCause.Cones; }
        }
        if (tr.hasFork(s)) {
            const c2 = tr.cx2(s), f2 = tr.f2(s);
            const clr2 = f32(f32(f32((HalfWidth + 1) + this.margin) * f2) - Math.abs(f32(x - c2)));
            if (clr2 > clr) { clr = clr2; cause = SpinCause.Road; }
        }
        this._cause = cause;
        return clr;
    }

    _keepNearRoad() {
        const clr = this.clearance(this.x, this.s);
        if (clr < -8) {
            // slide no further off than 8 px: the verge / rail / cones stop the car
            const c = this._nearestLaneX(this.s);
            const push = f32(-8 - clr);
            this.x = f32(this.x + f32(Math.sign(f32(c - this.x)) * push));
            this.vx = 0;
        }
    }

    _nearestLaneX(s) {
        const tr = this.track, X = this.x;
        let best = tr.laneX(s, +1), bd = Math.abs(f32(best - X));
        const co = tr.coneOff(s);
        if (!Number.isNaN(co) && co < LaneOffset + 8) { best = tr.laneX(s, -1); bd = Math.abs(f32(best - X)); }
        else {
            const l = tr.laneX(s, -1);
            if (Math.abs(f32(l - X)) < bd) { best = l; bd = Math.abs(f32(l - X)); }
        }
        if (tr.hasFork(s))
            for (let lane = -1; lane <= 1; lane += 2) {
                const b = tr.laneX(s, lane, 2);
                if (Math.abs(f32(b - X)) < bd) { best = b; bd = Math.abs(f32(b - X)); }
            }
        return best;
    }

    _startSpin(why) {
        this.spinLeft = this.spinSeconds;
        this.lastSpin = why;
        this.spinAngle = this.bodyAngle;
        this.drifting = false; this.driftCooldown = 0;
        switch (why) {
            case SpinCause.Car: this.spinsCar++; this.v = f32(this.v * F0_3); this.vx = f32(this.vx * F0_3); this._cues.emit(SoundCue.Hit); break;
            case SpinCause.Oil: this.spinsOil++; this.v = f32(this.v * F0_85); this._cues.emit(SoundCue.Miss); break;
            case SpinCause.Cones: this.spinsCones++; this.v = f32(this.v * F0_35); this.vx = f32(f32(-Math.abs(this.vx) * F0_3) - 20); this._cues.emit(SoundCue.Hit); break;
            case SpinCause.Rail: this.spinsRail++; this.v = f32(this.v * F0_4); this.vx = f32(Math.sign(f32(this.track.cx(this.s) - this.x)) * 30); this._cues.emit(SoundCue.Hit); break;
            default: this.spinsRoad++; this.v = f32(this.v * F0_4); this.vx = f32(Math.sign(f32(this._nearestLaneX(this.s) - this.x)) * 25); this._cues.emit(SoundCue.Hit); break;
        }
        this._emit(Ev.Spin, why);
        this._markHairpin(false);
    }

    _recover() {
        this.spinLeft = 0;
        if (this.clearance(this.x, this.s) < 10) this.x = this._nearestLaneX(this.s);
        this.v = 25; this.vx = 0;
        this.bodyAngle = 0;
        this.ghostLeft = this.ghostSeconds;
    }

    _addSkid() {
        const a = this.spinning ? this.spinAngle : this.bodyAngle;
        const sn = f32(Math.sin(a)), cs = f32(Math.cos(a));
        // the two rear wheels: 9 px behind the centre, 6 px either side
        for (let w = -1; w <= 1; w += 2) {
            const lx = w * 6, ly = 9;                          // in the car's frame (x right, y back)
            const wx = f32(f32(lx * cs) - f32(ly * sn)), ws = -f32(f32(lx * sn) + f32(ly * cs));
            this.skidX[this._skidHead] = f32(this.x + wx); this.skidS[this._skidHead] = f32(this.s + ws);
            this._skidHead = (this._skidHead + 1) % SkidCap;
            if (this.skidCount < SkidCap) this.skidCount++;
        }
    }

    // the i-th newest skid point (C# `SkidAt(i, out x, out s)`): fills out.x / out.s
    skidAt(i, out) {
        const k = (this._skidHead - 1 - i + SkidCap * 2) % SkidCap;
        out.x = this.skidX[k]; out.s = this.skidS[k];
        return out;
    }

    _markHairpin(drifted) {
        for (const h of this.track.hairpins)
            if (h.contains(this.s)) {
                if (drifted) this._hpDrifted[h.index] = true;
                else this._hpSpoiled[h.index] = true;
            }
    }

    // ------------------------------------------------------------------ traffic
    _moveTraffic(dt) {
        const tr = this.track, T = this.traffic, rng = this._rng;
        if (this.p === Phase.Racing && this.trafficDensity > 0) {
            this._sameTimer = f32(this._sameTimer - dt); this._oncTimer = f32(this._oncTimer - dt);
            if (this._sameTimer <= 0) { this._trySpawn(+1); this._sameTimer = f32(f32(F2_4 + f32(f32(rng.nextDouble()) * F2_2)) / this.trafficDensity); }
            if (this._oncTimer <= 0) { this._trySpawn(-1); this._oncTimer = f32(f32(F1_9 + f32(f32(rng.nextDouble()) * 2)) / this.trafficDensity); }
        }
        for (let i = T.length - 1; i >= 0; i--) {
            const v = T[i];
            const f = tr.f(v.s);
            let spd = v.speed;
            if (v.dir > 0) {
                // your way: queue at the works taper (their lane is shut), follow whoever is ahead
                const co = tr.coneOff(f32(v.s + 34));
                if (!v.stopped && !Number.isNaN(co) && co < LaneOffset + 10 && v.lane > 0) v.stopped = true;
                if (v.stopped) spd = 0;
                for (const o of T)
                    if (o !== v && o.dir > 0 && o.s > v.s && f32(o.s - v.s) < 44 && Math.abs(f32(o.lane - v.lane)) < 10) spd = Math.min(spd, o.cur);
                if (spd < 0) spd = 0;
                v.cur = spd;
                v.s = f32(v.s + f32(f32(spd / f) * dt));
            } else {
                // oncoming: the flagman holds them above the works while you're in or near them
                v.held = false;
                for (const w of tr.works) {
                    const hold = w.s1 + 60;
                    if (v.s >= hold - 2 && v.s < hold + 200 && this.s > w.s0 - 1400 && this.s < w.s1 + 40) {
                        v.held = true; spd = Math.max(0, Math.min(spd, f32(f32(v.s - hold) * 3)));
                    }
                }
                for (const o of T)
                    if (o !== v && o.dir < 0 && o.s < v.s && f32(v.s - o.s) < 44 && Math.abs(f32(o.lane - v.lane)) < 10) spd = Math.min(spd, o.cur);
                v.cur = spd;
                v.s = f32(v.s - f32(f32(spd / f) * dt));
            }
            if (v.knockT > 0) {
                v.knockT = f32(v.knockT - dt);
                v.lane = f32(v.lane + f32(f32(v.knockDir * 30) * dt));
                v.lane = Math.max(-HalfWidth + 7, Math.min(HalfWidth - 7, v.lane));
                v.wobble = f32(v.wobble + f32(f32(5 * dt) * v.knockDir));
            } else {
                // shaken but driving on: ease back into its own lane
                v.wobble = f32(v.wobble * f32(Math.exp(-4.0 * dt)));
                const home = v.dir > 0 ? LaneOffset : -LaneOffset;
                if (v.lane < home) v.lane = Math.min(home, f32(v.lane + f32(14 * dt)));
                else if (v.lane > home) v.lane = Math.max(home, f32(v.lane - f32(14 * dt)));
            }
            v.x = f32(tr.cx(v.s) + f32(v.lane * tr.f(v.s)));
            if (v.s < f32(this.s - 110) || v.s > f32(this.s + 460)) T.splice(i, 1);
        }
    }

    _trySpawn(dir) {
        const tr = this.track, rng = this._rng;
        const top = HyperDriftScroll.topS(this.s);
        const s0 = f32(f32(top + 24) + f32(f32(rng.nextDouble()) * 60));
        if (s0 < 420 || s0 > Checkpoint - 260) return;
        const lane = dir > 0 ? LaneOffset : -LaneOffset;
        if (dir > 0) {
            // nothing your way that you'd catch in the works or in a hairpin
            for (const w of tr.works) if (s0 > w.s0 - 380 && s0 < w.s1 + 30) return;
            for (const h of tr.hairpins) if (h.s1 > f32(s0 - 50) && h.s0 < f32(s0 + 250)) return;
        } else {
            // nothing coming at you inside the works, nor down a hairpin you're about to take
            for (const w of tr.works) if (s0 > w.s0 - 20 && s0 < w.s1 + 60) return;
            for (const h of tr.hairpins) if (h.s1 > this.s && h.s0 < f32(s0 + 150)) return;
        }
        for (const o of this.traffic) if (Math.abs(f32(o.s - s0)) < (o.dir === dir ? 80 : 30) && Math.abs(f32(o.lane - lane)) < 10) return;
        const v = new Vehicle();
        v.id = this._nextId++; v.dir = dir; v.s = s0; v.lane = lane;
        if (dir > 0) {
            v.truck = rng.nextDouble() < 0.55;
            v.baseSpeed = v.truck ? f32(48 + f32(f32(rng.nextDouble()) * 26)) : f32(72 + f32(f32(rng.nextDouble()) * 28));
        } else {
            v.truck = rng.nextDouble() < 0.2;
            v.baseSpeed = v.truck ? f32(48 + f32(f32(rng.nextDouble()) * 14)) : f32(58 + f32(f32(rng.nextDouble()) * 30));
        }
        v.speed = v.baseSpeed; v.cur = v.speed;
        v.x = f32(tr.cx(s0) + f32(lane * tr.f(s0)));
        this.traffic.push(v);
    }

    // ------------------------------------------------------------------ contacts, passes, the hairpin bonus
    _contacts() {
        if (this.spinning) return;
        const tr = this.track, X = this.x, S = this.s;
        const ghost = this.ghostLeft > 0;
        if (!ghost) {
            for (const v of this.traffic) {
                if (v.knockT > 0) continue;
                const a = f32(Math.atan(tr.slope(v.s)));
                const sn = f32(Math.sin(a)), cs = f32(Math.cos(a));
                const dx = f32(X - v.x), ds = f32(S - v.s);
                const along = f32(f32(dx * sn) + f32(ds * cs)), across = f32(f32(dx * cs) - f32(ds * sn));
                if (Math.abs(along) < v.halfL + 10 && Math.abs(across) < v.halfW + 5) {
                    v.hit = true; v.knockT = F0_45;
                    const sg = Math.sign(f32(v.x - X));
                    v.knockDir = sg === 0 ? 1 : sg;
                    v.speed = f32(v.speed * F0_6);
                    this._startSpin(SpinCause.Car);
                    return;
                }
            }
            for (const o of this.oil) {
                if (Math.abs(f32(o.s - S)) > 20) continue;
                const ex = f32(f32(X - o.x) / (Slick.RX + 2)), es = f32(f32(S - o.s) / (Slick.RS + 7));
                if (f32(f32(ex * ex) + f32(es * es)) <= 1) { this._startSpin(SpinCause.Oil); return; }
            }
        }
        for (const v of this.traffic)
            if (v.dir > 0 && !v.passed && S > f32(f32(v.s + v.halfL) + 12)) {
                v.passed = true;
                if (!v.hit) {
                    this.passes++; this._score += this.passPoints; this._cues.emit(SoundCue.Bonus);
                    this.popups.push({ text: String(this.passPoints), x: v.x, s: f32(v.s + 10), t: this._time, big: false });
                    this._emit(Ev.Pass, v.id);
                }
            }
        for (const h of tr.hairpins)
            if (!this._hpDone[h.index] && S > h.s1) {
                this._hpDone[h.index] = true;
                if (this._hpDrifted[h.index] && !this._hpSpoiled[h.index]) {
                    this.hairpinDrifts++; this._score += this.driftPoints; this._cues.emit(SoundCue.Bonus);
                    this.popups.push({ text: 'DRIFT ' + this.driftPoints, x: X, s: f32(S + 20), t: this._time, big: true });
                    this._emit(Ev.HairpinDrift, h.index);
                }
            }
    }

    _landmarks() {
        const tr = this.track, S = this.s;
        if (!this._bridgeSeen && tr.isBridge(S)) { this._bridgeSeen = true; this._emit(Ev.BridgeEnter); }
        if (!this._forkSeen && tr.hasFork(f32(S + 40))) { this._forkSeen = true; this._emit(Ev.ForkEnter); }
        if (tr.isWorks(S)) {
            const w = tr.zoneAt(ZoneKind.Works, S);
            if (w !== null && w.index === 0 && !this._worksSeen0) { this._worksSeen0 = true; this._emit(Ev.WorksEnter, 0); }
            if (w !== null && w.index === 1 && !this._worksSeen1) { this._worksSeen1 = true; this._emit(Ev.WorksEnter, 1); }
        }
    }

    // ------------------------------------------------------------------ stats
    collectStats(into) {
        add(into, 'spins', this.spins);
        add(into, 'spinCar', this.spinsCar);
        add(into, 'spinRoad', this.spinsRoad);
        add(into, 'spinOil', this.spinsOil);
        add(into, 'spinCones', this.spinsCones);
        add(into, 'spinRail', this.spinsRail);
        add(into, 'passes', this.passes);
        add(into, 'hairpinDrifts', this.hairpinDrifts);
        add(into, 'progress', this.progress);
        add(into, 'clockLeft', this._result === RoundResult.Won ? this.clock : 0);
        add(into, 'raceSec', this._result === RoundResult.Won ? f32(this.clockStart - this.clock) : this.clockStart);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

// C# Event.ToString(): "12.34 Pass s1234 x160 7"
function eventString() {
    return fmt(this.t, 2, F32) + ' ' + EvNames[this.kind] + ' s' + fmt(this.s, 0, F32) + ' x' + fmt(this.x, 0, F32) + ' ' + this.info;
}

HyperDriftSim.Phase = Phase;
HyperDriftSim.SpinCause = SpinCause;
HyperDriftSim.Ev = Ev;
HyperDriftSim.EvNames = EvNames;
HyperDriftSim.SkidCap = SkidCap;
