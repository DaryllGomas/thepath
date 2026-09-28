// THE NODE · world 1 · MUD & METAL (Redline Coin-Op, 1984) · THE RULES (ICabinetSim).
// Port of MudMetalSim.cs.
//
// Side-view motocross, one qualifying lap on a fixed track (track.js's MudMetalTrack).
//   STICK UP/DOWN   change lane (four lanes; on the ground only)
//   STICK LEFT      lean back in the air (nose up)      STICK RIGHT  lean forward (nose down)
//   A               throttle                            B            TURBO: faster, but the heat climbs
// Heat: turbo raises it, the throttle cools it, off-throttle cools it faster. Hit the red line
// and the engine STALLS for 1.5 s, then restarts at half heat.
// Jumps: a lip launches you. In the air the bike follows its own arc (nose down as it falls) plus
// whatever lean you add; land within LandTol degrees of the ground's slope or CRASH (2 s down, the
// clock keeps running). Within half of that = CLEAN (+50); beyond it = ROUGH (you lose speed).
// Mud caps your speed. Run into the back of a rival and you crash; pass him (+100) or jump him.
//
// THE ROUND: countdown 3-2-1 -> GO -> the lap -> the card.
//   WON   cross the line under the qualifying time (PAR) with the engine running (not stalled)
//   LOST  the lap clock reaches PAR (TIME OVER), or you coast over the line stalled (ENGINE BLOWN)
// A crash costs time, never the round. Score: 100 per second under par (in tenths), 50 per clean
// landing, 100 per rival passed.
//
// MERCY: PAR +10% per lost round and the heat gauge's safe zone widens (knobs). CREDIT 5
// (CreditInfo.unlosable): the engine cannot overheat, the rider cannot crash (a bad landing is a
// rough one, a rival is shoved aside), the bike rolls on by itself off the throttle, and the lap
// counts whatever the clock says.
import { f32, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, SystemRandom } from '../../sdk/index.js';
import { MudMetalTrack, Skew, Lanes, Wake } from './track.js';
import { PlayerScreenX, StartCamX } from './scroll.js';

export const MudEvent = Object.freeze({
    Go: 0, Takeoff: 1, Clean: 2, Rough: 3, CrashLanding: 4, Clip: 5, Pass: 6, MudIn: 7,
    Overheat: 8, EngineBack: 9, Remount: 10, Finish: 11, TimeOver: 12, EngineBlown: 13, Bump: 14,
});

const Phase = Object.freeze({ Idle: 0, Countdown: 1, Race: 2, Crash: 3, Card: 4, Over: 5 });
const CardKind = Object.freeze({ None: 0, Finish: 1, TimeOver: 2, EngineBlown: 3 });
const CrashKind = Object.freeze({ None: 0, Landing: 1, Clip: 2 });

// ------------------------------------------------------------ the machine (not mercy knobs)
const G = 380;              // px/s^2
const LeanRate = 120;       // deg/s of lean in the air
const MinJumpAir = 0.30;    // shorter hops are rollers: no landing judged
const LaneRate = 6;         // lanes/s
const LaneRepeatSeconds = 0.24;
const CountdownStep = 0.7;
const CrashSeconds = 2.0;
const StallSeconds = 1.5;
const StallRestart = 0.55;  // heat after a stall, x HeatCap
const CardSeconds = 4.5;
const InvulnSeconds = 1.0;
const AccGas = 115, AccTurbo = 150, Drag = 70, MudDecel = 360, CoastDrag = 110;
const HeatIdleCool = 2.0;   // segments/s off the throttle
const RoughKeep = 0.72;     // speed kept after a rough landing
const CreepMul = 0.6;       // credit 5: the bike rolls on at this x top speed
const SubStep = f32(1 / 120);
const PointsClean = 50, PointsPass = 100, PointsPerSecondUnder = 100;
const WarnSegments = 3;     // the orange end of the gauge

function slopeDeg(slope) { return f32(Math.atan(slope) * 57.29578); }
function velDeg(vz, vx) { return f32(Math.atan2(vz, Math.max(1, vx)) * 57.29578); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function moveTowards(v, to, d) { return v < to ? Math.min(to, f32(v + d)) : Math.max(to, f32(v - d)); }

function newBike() {
    return { x: 0, laneF: 0, z: 0, vz: 0, speed: 0, laneTarget: 0, airborne: false, inMud: false,
             airTime: 0, offset: 0, pitch: 0, slope: 0 };
}
function newRival(spawn, index) {
    const b = newBike();
    b.index = index; b.spawn = spawn; b.active = spawn.x <= 0; b.passed = false;
    b.base = 0; b.weaveT = 0; b.bumpT = 0;
    b.x = spawn.x; b.laneF = spawn.lane; b.laneTarget = spawn.lane;
    return b;
}
function newRider() {
    const b = newBike();
    b.heat = 0; b.stallT = 0; b.invuln = 0; b.laneHold = 0; b.gas = false; b.turbo = false; b.lean = 0;
    return b;
}

export class MudMetalSim {
    constructor() {
        this.track = MudMetalTrack;
        this.player = newRider();
        this.rivals = [];
        this.log = [];

        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.countdownLeft = 0;
        this.lapTime = 0;
        this.credit = null;
        this.card = CardKind.None;
        this.lastCrash = CrashKind.None;
        this.crashT = 0; this.crashX = 0; this.crashZ = 0; this.crashSpeed = 0; this.crashLaneF = 0;
        this.cardCamX = 0; this.cardFromCrash = false;
        this.lastLandErr = 0;
        this.cleanJumps = 0; this.roughJumps = 0; this.crashes = 0; this.clips = 0; this.overheats = 0;
        this.passes = 0; this.timeBonus = 0; this.mudSeconds = 0;

        this.par = 0; this.heatCap = 0; this.heatRise = 0; this.heatCool = 0;
        this.topSpeed = 0; this.turboSpeed = 0; this.landTol = 0; this.mudSpeed = 0;

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._time = 0;
    }

    // ------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Countdown: return CabinetState.Intro;
            case Phase.Race: return CabinetState.Playing;
            case Phase.Crash: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this._result === RoundResult.Lost ? 0 : 1; }
    get time() { return this._time; }
    get cues() { return this._cues; }
    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get progress() { return Math.max(0, Math.min(1, (this.player.x + this.player.laneF * Skew) / this.track.length)); }

    // the race camera for this moment (the card freezes the camera where the lap ended)
    get raceCamX() {
        let cam = f32(this.player.x - PlayerScreenX);
        if (this.p === Phase.Crash || (this.p === Phase.Card && this.cardFromCrash)) cam = f32(this.crashX - PlayerScreenX);
        return Math.max(StartCamX, cam);
    }
    get camX() {
        if (this.p === Phase.Card || this.p === Phase.Over) return this.cardCamX;
        return this.raceCamX;
    }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const why = this.card === CardKind.TimeOver ? ' TIME OVER' : this.card === CardKind.EngineBlown ? ' ENGINE BLOWN' : '';
        return r + why + ' lap ' + fmt(this.lapTime, 1, F32) + 's/par ' + fmt(this.par, 1, F32) + ' score ' + this._score +
            ' clean ' + this.cleanJumps + ' rough ' + this.roughJumps + ' crash ' + this.crashes + ' (clip ' + this.clips +
            ') heat ' + this.overheats + ' pass ' + this.passes + ' ' + fmt(this._time, 1, F32) + 's';
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.par = k.get('parTime');
        this.heatCap = k.get('heatCap');
        this.heatRise = k.get('heatRise');
        this.heatCool = k.get('heatCool');
        this.topSpeed = k.get('topSpeed');
        this.turboSpeed = k.get('turboSpeed');
        this.landTol = k.get('landTol');
        this.mudSpeed = k.get('mudSpeed');
        const rivalSpeed = k.get('rivalSpeed');

        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this._result = RoundResult.None;
        this._score = 0; this._time = 0; this.lapTime = 0;
        this.card = CardKind.None; this.lastCrash = CrashKind.None; this.cardFromCrash = false;
        this.cleanJumps = this.roughJumps = this.crashes = this.clips = this.overheats = this.passes = this.timeBonus = 0;
        this.mudSeconds = 0; this.crashT = 0; this.lastLandErr = 0;
        this.log.length = 0;
        this._cues.resetTotals();

        const p = this.player;
        p.x = 0; p.laneF = 1; p.laneTarget = 1; p.z = 0; p.vz = 0; p.speed = 0;
        p.airborne = false; p.inMud = false; p.airTime = 0; p.offset = 0; p.pitch = 0; p.slope = 0;
        p.heat = 0; p.stallT = 0; p.invuln = 0; p.laneHold = 0; p.gas = p.turbo = false; p.lean = 0;

        this.rivals.length = 0;
        for (let i = 0; i < this.track.rivals.length; i++) {
            const spawn = this.track.rivals[i];
            const base = f32(f32(f32(this.topSpeed * spawn.speedMul) * rivalSpeed) * f32(1 + f32((this._rng.nextDouble() - 0.5) * 0.08)));
            const weaveT = f32(1.2 + f32(this._rng.nextDouble() * 1.6));
            const r = newRival(spawn, i);
            r.base = base; r.weaveT = weaveT;
            this.rivals.push(r);
        }

        this.p = Phase.Countdown; this.phaseTime = 0; this.countdownLeft = 3;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > 0.1) dt = 0.1;
        if (dt <= 0) return;
        this._readInput(input, dt);
        const n = Math.max(1, Math.ceil(dt / SubStep - 1e-3));
        const h = f32(dt / n);
        for (let i = 0; i < n && this.p !== Phase.Over; i++) this._sub(h);
    }

    _readInput(input, dt) {
        const p = this.player;
        if (input == null) { p.gas = p.turbo = false; p.lean = 0; return; }
        p.turbo = input.held(Pad.B);
        p.gas = input.held(Pad.A) || p.turbo;
        p.lean = input.held(Pad.Left) ? 1 : input.held(Pad.Right) ? -1 : 0;
        if (this.p !== Phase.Race || p.airborne) { p.laneHold = 0; return; }
        const dir = input.held(Pad.Up) ? -1 : input.held(Pad.Down) ? 1 : 0;
        if (dir === 0) { p.laneHold = 0; return; }
        const fresh = input.pressed(Pad.Up) || input.pressed(Pad.Down);
        if (fresh) { p.laneTarget = clamp(p.laneTarget + dir, 0, Lanes - 1); p.laneHold = LaneRepeatSeconds; }
        else {
            p.laneHold = f32(p.laneHold - dt);
            if (p.laneHold <= 0) { p.laneTarget = clamp(p.laneTarget + dir, 0, Lanes - 1); p.laneHold = LaneRepeatSeconds; }
        }
    }

    _sub(h) {
        this._time = f32(this._time + h);
        this.phaseTime = f32(this.phaseTime + h);
        switch (this.p) {
            case Phase.Countdown:
                if (this.phaseTime >= CountdownStep) {
                    this.phaseTime = f32(this.phaseTime - CountdownStep);
                    this.countdownLeft--;
                    if (this.countdownLeft <= 0) {
                        this.p = Phase.Race; this.phaseTime = 0;
                        this._cues.emit(SoundCue.Start);
                        this._add(MudEvent.Go, 0);
                    } else this._cues.emit(SoundCue.Tick);
                }
                break;
            case Phase.Race:
                this.lapTime = f32(this.lapTime + h);
                this._updateRivals(h);
                this._updateRider(h);
                if (this.p === Phase.Race) { this._collide(); this._countPasses(); }
                this._checkClock();
                break;
            case Phase.Crash:
                this.lapTime = f32(this.lapTime + h);
                this.crashT = f32(this.crashT + h);
                this.player.heat = Math.max(0, f32(this.player.heat - f32(HeatIdleCool * h)));
                this._updateRivals(h);
                if (this.crashT >= CrashSeconds) this._remount();
                this._checkClock();
                break;
            case Phase.Card:
                this._updateRivals(h);
                if (this.cardFromCrash) this.crashT = f32(this.crashT + h);
                else {
                    this.player.gas = this.player.turbo = false; this.player.lean = 0;
                    this._moveBike(this.player, h, 0, 0, true, CoastDrag);
                }
                if (this.phaseTime >= CardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // ------------------------------------------------------------ the player's bike
    _updateRider(h) {
        const p = this.player;
        if (p.invuln > 0) p.invuln = f32(p.invuln - h);
        if (p.stallT > 0) {
            p.stallT = f32(p.stallT - h);
            if (p.stallT <= 0) { p.stallT = 0; p.heat = f32(this.heatCap * StallRestart); this._add(MudEvent.EngineBack, 0); }
        }
        let stalled = p.stallT > 0;
        let turbo = !stalled && p.turbo, gas = !stalled && p.gas;
        if (!stalled) {
            if (turbo) p.heat = f32(p.heat + f32(this.heatRise * h));
            else if (gas) p.heat = f32(p.heat - f32(this.heatCool * h));
            else p.heat = f32(p.heat - f32(HeatIdleCool * h));
            if (p.heat < 0) p.heat = 0;
            if (p.heat >= this.heatCap) {
                if (this.mercyActive) p.heat = f32(this.heatCap - 0.01);       // credit 5: the engine cannot overheat
                else {
                    p.heat = this.heatCap; p.stallT = StallSeconds; this.overheats++;
                    this._cues.emit(SoundCue.Miss);
                    this._add(MudEvent.Overheat, 0);
                    stalled = true; turbo = gas = false;
                }
            }
        }
        let target = turbo ? this.turboSpeed : gas ? this.topSpeed : 0;
        if (this.mercyActive && !gas && !stalled) target = f32(this.topSpeed * CreepMul);
        const wasMud = p.inMud;
        this._moveBike(p, h, target, turbo ? AccTurbo : AccGas, true, Drag);
        if (this.p !== Phase.Race) return;
        if (p.inMud) { this.mudSeconds = f32(this.mudSeconds + h); if (!wasMud) this._add(MudEvent.MudIn, 0); }
        if (f32(p.x + f32(p.laneF * Skew)) >= this.track.length) this._finish();
    }

    // ground-follow, launch off lips, the arc, landings. Shared by the player and the rivals.
    _moveBike(b, h, target, acc, isPlayer, drag) {
        if (!b.airborne) {
            const lane = clamp(roundEven(b.laneF), 0, Lanes - 1);
            b.inMud = this.track.inMud(b.x, lane);
            if (b.inMud) target = Math.min(target, f32(this.mudSpeed * this.topSpeed));
            if (b.speed < target) b.speed = Math.min(target, f32(b.speed + f32(acc * h)));
            else b.speed = Math.max(target, f32(b.speed - f32((b.inMud ? MudDecel : drag) * h)));
            b.laneF = moveTowards(b.laneF, b.laneTarget, f32(LaneRate * h));
        }
        const nx = f32(b.x + f32(b.speed * h));
        if (!b.airborne) {
            const g0 = this.track.height(nx, b.laneF);
            const zb = f32(f32(b.z + f32(b.vz * h)) - f32(f32(f32(0.5 * G) * h) * h));
            if (zb > g0 + 0.25 && b.speed > 1) {
                b.airborne = true; b.airTime = 0; b.offset = 0; b.inMud = false;
                b.vz = f32(b.vz - f32(G * h)); b.z = zb; b.x = nx;
                if (isPlayer) this._add(MudEvent.Takeoff, 0);
            } else {
                b.x = nx; b.z = g0;
                b.slope = this.track.slope(nx, b.laneF);
                b.vz = f32(b.speed * b.slope);
            }
        } else {
            b.airTime = f32(b.airTime + h);
            b.vz = f32(b.vz - f32(G * h));
            b.z = f32(b.z + f32(b.vz * h));
            b.x = nx;
            if (isPlayer) b.offset = Math.max(-90, Math.min(90, f32(b.offset + f32(f32(b.lean * LeanRate) * h))));
            const g1 = this.track.height(nx, b.laneF);
            if (b.z <= g1) { this._land(b, g1, isPlayer); return; }
        }
        b.pitch = b.airborne ? f32(velDeg(b.vz, b.speed) + b.offset) : slopeDeg(b.slope);
    }

    _land(b, g, isPlayer) {
        const slope = this.track.slope(b.x, b.laneF);
        const surf = slopeDeg(slope);
        const pitch = f32(velDeg(b.vz, b.speed) + b.offset);
        const air = b.airTime;
        b.z = g; b.airborne = false; b.slope = slope; b.vz = f32(b.speed * slope); b.offset = 0; b.pitch = surf;
        if (!isPlayer || air < MinJumpAir || this.p !== Phase.Race) return;   // the card's coast is never judged
        const err = f32(pitch - surf);
        this.lastLandErr = err;
        const a = Math.abs(err);
        if (a > this.landTol && !this.mercyActive) { this._crash(CrashKind.Landing, roundEven(err)); return; }
        if (a > this.landTol * 0.5) {
            b.speed = f32(b.speed * RoughKeep); this.roughJumps++;
            this._add(MudEvent.Rough, roundEven(err));
        } else {
            this._score += PointsClean; this.cleanJumps++;
            this._cues.emit(SoundCue.Bonus);
            this._add(MudEvent.Clean, PointsClean);
        }
    }

    _crash(kind, value) {
        const p = this.player;
        this.lastCrash = kind;
        this.crashT = 0; this.crashX = p.x; this.crashSpeed = Math.max(p.speed, 40); this.crashLaneF = p.laneF;
        this.crashZ = this.track.height(p.x, p.laneF);
        this.crashes++;
        if (kind === CrashKind.Clip) { this.clips++; this._cues.emit(SoundCue.Hit); this._add(MudEvent.Clip, value); }
        else { this._cues.emit(SoundCue.Die); this._add(MudEvent.CrashLanding, value); }
        p.speed = 0; p.airborne = false; p.z = this.crashZ; p.vz = 0; p.offset = 0; p.stallT = 0;
        p.slope = this.track.slope(p.x, p.laneF); p.pitch = slopeDeg(p.slope);
        p.laneTarget = clamp(roundEven(p.laneF), 0, Lanes - 1); p.laneF = p.laneTarget;
        this.p = Phase.Crash; this.phaseTime = 0;
    }

    _remount() {
        const p = this.player;
        p.speed = 0; p.airborne = false; p.vz = 0;
        p.z = this.track.height(p.x, p.laneF); p.slope = this.track.slope(p.x, p.laneF); p.pitch = slopeDeg(p.slope);
        p.invuln = InvulnSeconds;
        this.p = Phase.Race; this.phaseTime = 0;
        this._add(MudEvent.Remount, 0);
    }

    _checkClock() {
        if ((this.p === Phase.Race || this.p === Phase.Crash) && !this.mercyActive && this.lapTime >= this.par) {
            this.lapTime = this.par;
            this.cardFromCrash = this.p === Phase.Crash;
            this._enterCard(CardKind.TimeOver, RoundResult.Lost);
            this._cues.emit(SoundCue.Die);
            this._add(MudEvent.TimeOver, 0);
        }
    }

    _finish() {
        const engineOk = !(this.player.stallT > 0);
        if (engineOk && (this.lapTime <= this.par || this.mercyActive)) {
            if (this.lapTime <= this.par) {
                const v = f32(f32(f32(this.par - this.lapTime) * 10) + 1e-3);
                this.timeBonus = Math.floor(v) * Math.trunc(PointsPerSecondUnder / 10);
            } else this.timeBonus = 0;
            this._score += this.timeBonus;
            this._enterCard(CardKind.Finish, RoundResult.Won);
            this._cues.emit(SoundCue.Win);
            this._add(MudEvent.Finish, this.timeBonus);
        } else {
            this._enterCard(engineOk ? CardKind.TimeOver : CardKind.EngineBlown, RoundResult.Lost);
            this._cues.emit(SoundCue.Die);
            this._add(engineOk ? MudEvent.TimeOver : MudEvent.EngineBlown, 0);
        }
    }

    _enterCard(kind, r) {
        this.card = kind; this._result = r;
        this.cardCamX = this.raceCamX;
        this.p = Phase.Card; this.phaseTime = 0;
    }

    // ------------------------------------------------------------ the other riders
    _updateRivals(h) {
        const p = this.player;
        const playerDown = this.p === Phase.Crash || (this.p === Phase.Card && this.cardFromCrash);
        for (let i = 0; i < this.rivals.length; i++) {
            const r = this.rivals[i];
            if (!r.active) {
                if (p.x < r.spawn.x - Wake) continue;
                r.active = true;
                r.x = r.spawn.x; r.laneF = r.laneTarget = r.spawn.lane;
                r.z = this.track.height(r.x, r.laneF); r.slope = this.track.slope(r.x, r.laneF);
                r.speed = f32(r.base * 0.8); r.vz = f32(r.speed * r.slope);
            }
            if (r.bumpT > 0) r.bumpT = f32(r.bumpT - h);
            let target = r.base;
            const dx = f32(p.x - r.x);
            const sameLane = Math.abs(p.laneF - r.laneF) < 0.7;
            if (!r.airborne && sameLane && dx > 0 && dx < 70 && (playerDown || p.speed < r.speed)) {
                // a rider behind you steers round you, or eases off
                const alt = this._freeLane(r, p);
                if (alt >= 0) r.laneTarget = alt;
                else target = Math.min(target, Math.max(20, f32(p.speed * 0.9)));
            }
            if (r.spawn.weaver && !r.airborne && r.x > 0) {
                r.weaveT = f32(r.weaveT - h);
                if (r.weaveT <= 0) {
                    r.weaveT = f32(1.6 + f32(this._rng.nextDouble() * 1.8));
                    const want = clamp(r.laneTarget + (this._rng.nextDouble() < 0.5 ? -1 : 1), 0, Lanes - 1);
                    const playerThere = Math.abs(p.laneF - want) < 0.7 && Math.abs(dx) < 60;
                    if (!playerThere && !this._riderNear(r, want, 50)) r.laneTarget = want;
                }
            }
            if (this.p === Phase.Card && !this.cardFromCrash && r.x > p.x + 200) target = r.base;   // ride on
            this._moveBike(r, h, target, f32(AccGas * 0.8), false, Drag);
        }
    }

    _freeLane(r, avoid) {
        const l = roundEven(r.laneF);
        const order = [l - 1, l + 1];
        if (this._rng.nextDouble() < 0.5) { const t = order[0]; order[0] = order[1]; order[1] = t; }
        for (const c of order)
            if (c >= 0 && c < Lanes && Math.abs(avoid.laneF - c) > 0.7 && !this._riderNear(r, c, 40)) return c;
        return -1;
    }

    _riderNear(self, lane, dist) {
        for (const o of this.rivals) {
            if (o === self || !o.active) continue;
            if (Math.abs(o.laneF - lane) < 0.7 && Math.abs(o.x - self.x) < dist) return true;
        }
        return false;
    }

    _collide() {
        const p = this.player;
        if (p.invuln > 0) return;
        for (let i = 0; i < this.rivals.length; i++) {
            const r = this.rivals[i];
            if (!r.active || r.bumpT > 0) continue;
            const dx = f32(r.x - p.x);
            if (Math.abs(p.laneF - r.laneF) < 0.6 && dx > -6 && dx < 18 && Math.abs(p.z - r.z) < 12) {
                if (this.mercyActive) {
                    p.speed = Math.min(p.speed, f32(r.speed * 0.85));
                    const alt = this._freeLane(r, p);
                    if (alt >= 0) r.laneTarget = alt;
                    r.bumpT = 1.2;
                    this._cues.emit(SoundCue.Hit);
                    this._add(MudEvent.Bump, 0);
                } else { this._crash(CrashKind.Clip, i); return; }
            }
        }
    }

    _countPasses() {
        const p = this.player;
        for (let i = 0; i < this.rivals.length; i++) {
            const r = this.rivals[i];
            if (!r.active || r.passed || p.x <= r.x + 20) continue;
            r.passed = true; this.passes++; this._score += PointsPass;
            this._cues.emit(SoundCue.Bonus);
            this._add(MudEvent.Pass, PointsPass);
        }
    }

    // where a bike in the air (or leaving now) comes down if nobody touches the stick: the flight
    // time left, the landing x, the ground's angle there and the arc's angle at touchdown
    predictLanding(b) {
        let x = b.x, z = b.z, vz = b.vz;
        const v = Math.max(1, b.speed);
        const dt = 1 / 240;
        let t = 0;
        for (let i = 0; i < 2400; i++) {
            t += dt; vz -= G * dt; z += vz * dt; x += v * dt;
            const g = this.track.height(x, b.laneF);
            if (z <= g) return { ok: true, t, landX: x, surfDeg: slopeDeg(this.track.slope(x, b.laneF)), velDeg: velDeg(vz, v) };
        }
        return { ok: false, t, landX: x, surfDeg: 0, velDeg: velDeg(vz, v) };
    }

    _add(kind, value) {
        this.log.push({ t: this._time, kind, x: this.player.x, z: this.player.z, laneF: this.player.laneF, value });
    }

    collectStats(into) {
        const finished = this.card === CardKind.Finish;
        add(into, 'finished', finished ? 1 : 0);
        add(into, 'timeOver', this.card === CardKind.TimeOver ? 1 : 0);
        add(into, 'blown', this.card === CardKind.EngineBlown ? 1 : 0);
        add(into, 'lapIfFinished', finished ? this.lapTime : 0);
        add(into, 'crashes', this.crashes);
        add(into, 'clips', this.clips);
        add(into, 'overheats', this.overheats);
        add(into, 'clean', this.cleanJumps);
        add(into, 'rough', this.roughJumps);
        add(into, 'passes', this.passes);
        add(into, 'mudSec', this.mudSeconds);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

MudMetalSim.Phase = Phase;
MudMetalSim.CardKind = CardKind;
MudMetalSim.CrashKind = CrashKind;
MudMetalSim.WarnSegments = WarnSegments;
MudMetalSim.LeanRate = LeanRate;
MudMetalSim.PointsClean = PointsClean;
MudMetalSim.PointsPass = PointsPass;
