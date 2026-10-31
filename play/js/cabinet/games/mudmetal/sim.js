// THE NODE · world 1 · MUD & METAL (Redline Coin-Op, 1984) · THE RULES (ICabinetSim).
// Port of MudMetalSim.cs, built out (2026-10-18) from one qualifying lap into a six-race championship.
//
// Side-view motocross on four lanes (track.js), six tracks (stages.js).
//   STICK UP/DOWN   change lane (four lanes; on the ground only)
//   STICK LEFT      lean back in the air (nose up)      STICK RIGHT  lean forward (nose down)
//   A               throttle                            B            TURBO: faster, but the heat climbs
// Heat: turbo raises it, the throttle cools it, off-throttle cools it faster, a FORD (water) cools it
// fastest. Hit the red line and the engine STALLS for 1.5 s, then restarts at half heat.
// Jumps: a lip launches you (any lip: the ground falls away faster than gravity can pull you down it).
// In the air the bike follows its own arc (nose down as it falls) plus whatever lean you add; land
// within LandTol degrees of the ground's slope or CRASH (2 s down, the clock keeps running). Within half
// of that = CLEAN (100 x the combo of clean landings in a row, up to x5); beyond it = ROUGH (you lose
// speed, the combo is gone). Clear a gap, a creek, a step-up, a double or a triple: a GAP bonus.
// Mud caps your speed. A CREEK in a gap's pit: land in it, or roll into it, and you SPLASH (a crash).
// A HAY BALE in your lane is a crash unless you are over it in the air. Run into the back of a rider:
// crash. Steer into a rider beside you: you BUMP him (he wobbles off a lane, +150); a pushy rider
// (stadium, final) flashes "!" and then leans into you: you are SHOVED a lane and lose speed.
//
// THE GAME (a coin): tries (3) -> stage 1 .. 6, each:
//   CARD     the stage card: number, name, a hint, the par (Intro)
//   COUNT    3-2-1 -> GO (Intro)
//   RACE     (Playing) ... CRASH (Interlude) ... back to RACE
//   FINISH   over the line: FINISH!, then the TALLY counts the bonuses into the score (Interlude)
//   FAIL     the qualifying clock reached PAR (TIME OVER), you coasted over the line stalled (ENGINE
//            BLOWN), or in the final three riders finished before you (BEATEN): a try is lost (Interlude)
//            and the same stage is ridden again from its card, or with none left the GAME OVER card.
//   RESULT   the last stage's tally done -> the CHAMPION card (Won); out of tries -> GAME OVER (Lost)
// An extra try at extraAt points and every extraEvery after. The result comes from the game, never
// the clock: the clock only ever fails one race.
//
// MERCY: the knobs (spec.js) ease every lost coin. CREDIT 5 (CreditInfo.unlosable): the engine cannot
// overheat, the rider cannot crash (a bad landing is a rough one, a rider or a bale is shoved aside, a
// creek only slows you), the bike rolls on by itself off the throttle, no race can be failed, and the
// championship counts whatever place you take.
import { f32, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, SystemRandom } from '../../sdk/index.js';
import { Skew, Lanes, Wake, FeatureKind, RiderKind, BaleLen, BaleHigh } from './track.js';
import { Stages } from './stages.js';
import { PlayerScreenX, StartCamX } from './scroll.js';

// what the popups and the particles read (sim.log); the sound reads sim.events (_emit)
export const MudEvent = Object.freeze({
    Go: 0, Takeoff: 1, Clean: 2, Rough: 3, CrashLanding: 4, Clip: 5, Pass: 6, MudIn: 7,
    Overheat: 8, EngineBack: 9, Remount: 10, Finish: 11, TimeOver: 12, EngineBlown: 13, Bump: 14,
    Splash: 15, BaleHit: 16, Gap: 17, Shoved: 18, ShoveWarn: 19, WaterIn: 20, Extra: 21, Lap: 22, Beaten: 23,
    Record: 24, Hot: 25,
});

const Phase = Object.freeze({ Idle: 0, Card: 1, Countdown: 2, Race: 3, Crash: 4, Finish: 5, Fail: 6, Result: 7, Over: 8 });
const FailKind = Object.freeze({ None: 0, TimeOver: 1, EngineBlown: 2, Beaten: 3 });
const CrashKind = Object.freeze({ None: 0, Landing: 1, Clip: 2, Splash: 3, Bale: 4 });

// ------------------------------------------------------------ the machine (not mercy knobs)
const G = 380;              // px/s^2
const LeanRate = 120;       // deg/s of lean in the air
const MinJumpAir = 0.30;    // shorter hops are rollers: no landing judged
const LaneRate = 6;         // lanes/s
const LaneRepeatSeconds = 0.24;
const CardSeconds = 2.8, RerunCardSeconds = 2.2;
const CountdownStep = 0.6;
const CrashSeconds = 2.0;
const StallSeconds = 1.5;
const StallRestart = 0.55;  // heat after a stall, x HeatCap
const FinishBanner = 1.3, TallyRow = 0.5, TallyHold = 1.7;
const FailSeconds = 3.0;
const ResultSeconds = 5.0;
const InvulnSeconds = 1.0;
const AccGas = 115, AccTurbo = 150, Drag = 70, MudDecel = 360, CoastDrag = 110;
const HeatIdleCool = 2.0;   // segments/s off the throttle
const RoughKeep = 0.72;     // speed kept after a rough landing
const CreepMul = 0.6;       // credit 5: the bike rolls on at this x top speed
const SubStep = f32(1 / 120);
const WarnSegments = 3;     // the orange end of the gauge
const ShoveTell = 0.45;     // s a pushy rider flashes "!" before he leans in
const BaleWarnAhead = 220;  // px: a bale in your lane this close gets its warning blip
const PointsClean = 100, ComboMax = 5, PointsPass = 200, PointsBump = 150, PointsGap = 300;
const PointsPerTenthUnder = 50, PointsNoCrash = 2000, PointsRecord = 5000;
const PlaceBonus = [20000, 12000, 8000];
const Surge = 0.04;         // a racer's pace breathes: a slow sine on it, +-4 %

function slopeDeg(slope) { return f32(Math.atan(slope) * 57.29578); }
function velDeg(vz, vx) { return f32(Math.atan2(vz, Math.max(1, vx)) * 57.29578); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function moveTowards(v, to, d) { return v < to ? Math.min(to, f32(v + d)) : Math.max(to, f32(v - d)); }
function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }

function newBike() {
    return { x: 0, laneF: 0, z: 0, vz: 0, speed: 0, laneTarget: 0, airborne: false, inMud: false, inWater: false, inCreek: false,
             airTime: 0, offset: 0, pitch: 0, slope: 0 };
}
function newRival(spawn, index) {
    const b = newBike();
    b.index = index; b.spawn = spawn; b.kind = spawn.kind; b.jersey = spawn.jersey; b.pushy = spawn.pushy;
    b.active = spawn.x <= 0 || spawn.kind !== RiderKind.Slow; b.passed = false;
    b.base = 0; b.weaveT = 0; b.bumpT = 0; b.wobbleT = 0; b.shoveT = 0; b.shoveLane = 0; b.coolT = 0; b.surge = 0;
    b.finished = false; b.place = 0;
    b.x = spawn.x; b.laneF = spawn.lane; b.laneTarget = spawn.lane;
    return b;
}
function newRider() {
    const b = newBike();
    b.heat = 0; b.stallT = 0; b.invuln = 0; b.laneHold = 0; b.gas = false; b.turbo = false; b.lean = 0; b.wobbleT = 0;
    return b;
}

export class MudMetalSim {
    constructor() {
        this.stages = Stages;
        this.stageIdx = 0;
        this.stage = Stages[0];
        this.track = Stages[0].track;
        this.player = newRider();
        this.rivals = [];
        this.bales = [];
        this.log = [];
        this.recordEvents = false; this.events = [];
        this.isDemo = false;

        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.countdownLeft = 0;
        this.lapTime = 0;
        this.credit = null;
        this.tries = 0; this.extraNext = 0; this.extraTries = 0;
        this.attempt = 0;              // 1 = the first ride of this stage
        this.fail = FailKind.None;
        this.lastCrash = CrashKind.None;
        this.crashT = 0; this.crashX = 0; this.crashZ = 0; this.crashSpeed = 0; this.crashLaneF = 0; this.remountX = 0;
        this.failDown = false;         // the race was failed with the rider on the ground
        this.frozenCamX = 0;
        this.lastLandErr = 0;
        this.combo = 0; this.bestCombo = 0;
        this.jumpFrom = null;
        this.tally = [];               // [{ label, value, pts }] for the finish card
        this.tallyShown = 0;
        this.place = 0; this.finishedCount = 0; this.position = 0;
        this.lap = 1;
        this.hot = false;
        this.stageTimes = [];
        // this stage
        this.cleanJumps = 0; this.roughJumps = 0; this.crashes = 0; this.passes = 0; this.bumps = 0; this.gaps = 0;
        // the whole game
        this.st = newStats();

        this.par = 0; this.parMul = 1; this.heatCap = 0; this.heatRise = 0; this.heatCool = 0; this.waterCool = 0;
        this.topSpeed = 0; this.turboSpeed = 0; this.landTol = 0; this.mudSpeed = 0; this.waterSpeed = 0;
        this.rivalSpeed = 1; this.fieldPace = 1; this.extraAt = 0; this.extraEvery = 0;

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._time = 0;
    }

    // ------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Card: case Phase.Countdown: return CabinetState.Intro;
            case Phase.Race: return CabinetState.Playing;
            case Phase.Crash: case Phase.Finish: case Phase.Fail: return CabinetState.Interlude;
            case Phase.Result: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this.tries; }
    get time() { return this._time; }
    get cues() { return this._cues; }
    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get isFinal() { return !!this.stage.final; }
    get progress() { return Math.max(0, Math.min(1, (this.player.x + this.player.laneF * Skew) / this.track.length)); }

    // the race camera for this moment (a crash holds it where the bike went down)
    get raceCamX() {
        let cam = f32(this.player.x - PlayerScreenX);
        if (this.p === Phase.Crash) {
            const u = clamp((this.crashT - 0.9) / 0.8, 0, 1);
            cam = f32(f32(this.crashX + f32((this.remountX - this.crashX) * f32(u * u * (3 - 2 * u)))) - PlayerScreenX);
        }
        return Math.max(StartCamX, cam);
    }
    get camX() {
        if (this.p === Phase.Card || this.p === Phase.Countdown) return StartCamX;
        if (this.p === Phase.Fail || this.p === Phase.Result || this.p === Phase.Over) return this.frozenCamX;
        return this.raceCamX;
    }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const s = this.st;
        return r + ' stage ' + this.stage.n + '/' + this.stages.length + ' score ' + this._score + ' tries ' + this.tries +
            ' (+' + this.extraTries + ') fails ' + s.fails + ' clean ' + s.clean + ' rough ' + s.rough + ' crash ' + s.crashes +
            ' (clip ' + s.clips + ' splash ' + s.splash + ' bale ' + s.bales + ') heat ' + s.overheats + ' pass ' + s.passes +
            ' bump ' + s.bumps + (this.place > 0 ? ' place ' + this.place : '') + ' ' + fmt(this._time, 1, F32) + 's' +
            ' | ' + this.stageTimes.join(' ');
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.parMul = k.get('parTime');
        this.heatCap = k.get('heatCap');
        this.heatRise = k.get('heatRise');
        this.heatCool = k.get('heatCool');
        this.waterCool = k.get('waterCool');
        this.topSpeed = k.get('topSpeed');
        this.turboSpeed = k.get('turboSpeed');
        this.landTol = k.get('landTol');
        this.mudSpeed = k.get('mudSpeed');
        this.waterSpeed = k.get('waterSpeed');
        this.rivalSpeed = k.get('rivalSpeed');
        this.fieldPace = k.get('fieldPace');
        this.extraAt = k.get('extraAt');
        this.extraEvery = k.get('extraEvery');

        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this._result = RoundResult.None;
        this._score = 0; this._time = 0;
        this.tries = Math.max(1, Math.floor(k.get('tries') + 0.001));
        this.extraNext = this.extraAt; this.extraTries = 0;
        this.st = newStats();
        this.stageTimes.length = 0;
        this.log.length = 0; this.events.length = 0;
        this.place = 0;
        this._cues.resetTotals();
        // the attract demo shows a later track (the variety); a credit always starts at the first
        const first = this.isDemo ? 1 + ((seed >>> 0) % (Stages.length - 1)) : 0;
        this._startStage(first, false);
    }

    _startStage(idx, rerun) {
        this.stageIdx = idx;
        this.stage = Stages[idx];
        this.track = this.stage.track;
        this.par = this.stage.final ? 0 : f32(this.stage.par * this.parMul);
        this.attempt = rerun ? this.attempt + 1 : 1;
        if (!rerun) this.st.reached = idx + 1;
        this.st.tries[idx]++;
        this.lapTime = 0; this.fail = FailKind.None; this.lastCrash = CrashKind.None;
        this.cleanJumps = this.roughJumps = this.crashes = this.passes = this.bumps = this.gaps = 0;
        this.combo = 0; this.bestCombo = 0; this.jumpFrom = null; this.hot = false;
        this.tally.length = 0; this.tallyShown = 0;
        this.finishedCount = 0; this.position = 0; this.lap = 1;
        this.crashT = 0; this.lastLandErr = 0; this.failDown = false;

        const p = this.player;
        p.x = 0; p.laneF = 1; p.laneTarget = 1; p.z = 0; p.vz = 0; p.speed = 0;
        p.airborne = false; p.inMud = false; p.inWater = false; p.inCreek = false; p.airTime = 0; p.offset = 0; p.pitch = 0; p.slope = 0;
        p.heat = 0; p.stallT = 0; p.invuln = 0; p.laneHold = 0; p.gas = p.turbo = false; p.lean = 0; p.wobbleT = 0;

        this.rivals.length = 0;
        const spawns = this.track.rivals;
        for (let i = 0; i < spawns.length; i++) {
            const sp = spawns[i];
            let base = f32(this.topSpeed * sp.speedMul);
            if (sp.kind === RiderKind.Slow) base = f32(f32(base * this.rivalSpeed) * f32(1 + f32((this._rng.nextDouble() - 0.5) * 0.08)));
            else if (sp.kind === RiderKind.Field) base = f32(f32(base * this.fieldPace) * f32(1 + f32((this._rng.nextDouble() - 0.5) * 0.06)));
            else base = f32(base * f32(1 + f32((this._rng.nextDouble() - 0.5) * 0.06)));
            const r = newRival(sp, i);
            r.base = base;
            r.weaveT = f32(1.2 + f32(this._rng.nextDouble() * 1.6));
            r.surge = f32(this._rng.nextDouble() * 6.28);
            r.coolT = f32(2 + f32(this._rng.nextDouble() * 3));
            r.z = this.track.height(r.x, r.laneF);
            this.rivals.push(r);
        }
        this.bales.length = 0;
        for (const b of this.track.bales) this.bales.push({ lane: b.lane, x: b.x, down: false, downT: 0, warned: false });

        this.p = Phase.Card; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
        this._emit('card', { stage: this.stage.n, rerun });
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
        if (this.log.length > 240) this.log.splice(0, 120);
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
            case Phase.Card:
                if (this.phaseTime >= (this.attempt > 1 ? RerunCardSeconds : CardSeconds)) {
                    this.p = Phase.Countdown; this.phaseTime = 0; this.countdownLeft = 3;
                    this._cues.emit(SoundCue.Tick);
                    this._emit('count', { n: 3 });
                }
                break;
            case Phase.Countdown:
                if (this.phaseTime >= CountdownStep) {
                    this.phaseTime = f32(this.phaseTime - CountdownStep);
                    this.countdownLeft--;
                    if (this.countdownLeft <= 0) {
                        this.p = Phase.Race; this.phaseTime = 0;
                        this._cues.emit(SoundCue.Start);
                        this._emit('go', { stage: this.stage.n });
                        this._add(MudEvent.Go, 0);
                    } else { this._cues.emit(SoundCue.Tick); this._emit('count', { n: this.countdownLeft }); }
                }
                break;
            case Phase.Race:
                this.lapTime = f32(this.lapTime + h);
                this._updateRivals(h);
                if (this.p !== Phase.Race) break;                   // the field beat you to the line
                this._updateRider(h);
                if (this.p === Phase.Race) { this._collide(); this._bales(); }
                if (this.p === Phase.Race) { this._countPasses(); this._standings(); }
                this._checkClock();
                break;
            case Phase.Crash:
                this.lapTime = f32(this.lapTime + h);
                this.crashT = f32(this.crashT + h);
                this.player.heat = Math.max(0, f32(this.player.heat - f32(HeatIdleCool * h)));
                this._updateRivals(h);
                if (this.p !== Phase.Crash) break;
                this._standings();
                if (this.crashT >= CrashSeconds) this._remount();
                this._checkClock();
                break;
            case Phase.Finish: {
                this._updateRivals(h);
                this._coast(h);
                const rows = this.tally.length;
                const due = this.phaseTime < FinishBanner ? 0 : Math.min(rows, 1 + Math.floor((this.phaseTime - FinishBanner) / TallyRow));
                while (this.tallyShown < due) {
                    const row = this.tally[this.tallyShown++];
                    if (row.pts > 0) this._addScore(row.pts);
                    this._cues.emit(SoundCue.Tick);
                    this._emit('tally', { row: this.tallyShown, pts: row.pts, record: !!row.record });
                    if (row.record) this._add(MudEvent.Record, row.pts);
                }
                if (this.tallyShown >= rows && this.phaseTime >= FinishBanner + rows * TallyRow + TallyHold) {
                    if (this.stageIdx + 1 >= Stages.length || this.isDemo && this.stage.final) this._enterResult(RoundResult.Won);
                    else this._startStage(this.stageIdx + 1, false);
                }
                break;
            }
            case Phase.Fail:
                this._updateRivals(h);
                if (this.failDown) this.crashT = f32(this.crashT + h);
                else this._coast(h);
                if (this.phaseTime >= FailSeconds) {
                    this.tries--;
                    if (this.tries <= 0) { this.tries = 0; this._enterResult(RoundResult.Lost); }
                    else this._startStage(this.stageIdx, true);
                }
                break;
            case Phase.Result:
                this._updateRivals(h);
                if (this.phaseTime >= ResultSeconds) this.p = Phase.Over;
                break;
        }
    }

    // ------------------------------------------------------------ the player's bike
    _updateRider(h) {
        const p = this.player;
        if (p.invuln > 0) p.invuln = f32(p.invuln - h);
        if (p.wobbleT > 0) p.wobbleT = f32(p.wobbleT - h);
        if (p.stallT > 0) {
            p.stallT = f32(p.stallT - h);
            if (p.stallT <= 0) { p.stallT = 0; p.heat = f32(this.heatCap * StallRestart); this._add(MudEvent.EngineBack, 0); this._emit('engineBack'); }
        }
        let stalled = p.stallT > 0;
        let turbo = !stalled && p.turbo, gas = !stalled && p.gas;
        if (!stalled) {
            if (turbo) p.heat = f32(p.heat + f32(this.heatRise * h));
            else if (gas) p.heat = f32(p.heat - f32(this.heatCool * h));
            else p.heat = f32(p.heat - f32(HeatIdleCool * h));
            if (p.inWater && !p.airborne) p.heat = f32(p.heat - f32(this.waterCool * h));
            if (p.heat < 0) p.heat = 0;
            if (p.heat >= this.heatCap) {
                if (this.mercyActive) p.heat = f32(this.heatCap - 0.01);       // credit 5: the engine cannot overheat
                else {
                    p.heat = this.heatCap; p.stallT = StallSeconds; this.st.overheats++;
                    this._cues.emit(SoundCue.Miss);
                    this._add(MudEvent.Overheat, 0);
                    this._emit('overheat');
                    stalled = true; turbo = gas = false;
                }
            }
            const warm = p.heat >= this.heatCap - WarnSegments;
            if (warm && !this.hot && !stalled) { this._add(MudEvent.Hot, 0); this._emit('hot'); }
            this.hot = warm;
        }
        let target = turbo ? this.turboSpeed : gas ? this.topSpeed : 0;
        if (this.mercyActive && !gas && !stalled) target = f32(this.topSpeed * CreepMul);
        const wasMud = p.inMud, wasWater = p.inWater;
        this._moveBike(p, h, target, turbo ? AccTurbo : AccGas, true, Drag);
        if (this.p !== Phase.Race) return;
        if (p.inMud) { this.st.mudSec = f32(this.st.mudSec + h); if (!wasMud) { this._add(MudEvent.MudIn, 0); this._emit('mud'); } }
        if (p.inWater && !wasWater) { this._add(MudEvent.WaterIn, 0); this._emit('water'); }
        const prog = f32(p.x + f32(p.laneF * Skew));
        if (this.track.lapAt > 0 && this.lap === 1 && prog >= this.track.lapAt) { this.lap = 2; this._add(MudEvent.Lap, 2); this._emit('lap'); }
        if (prog >= this.track.length) this._finish();
    }

    // ground-follow, launch off lips, the arc, landings. Shared by the player and the rivals.
    _moveBike(b, h, target, acc, isPlayer, drag) {
        if (!b.airborne) {
            const lane = clamp(roundEven(b.laneF), 0, Lanes - 1);
            b.inMud = this.track.inMud(b.x, lane);
            b.inWater = this.track.fordAt(b.x, b.laneF) >= 0;
            if (b.inMud) target = Math.min(target, f32(this.mudSpeed * this.topSpeed));
            if (b.inWater) target = Math.min(target, f32(this.waterSpeed * this.topSpeed));
            if (b.speed < target) b.speed = Math.min(target, f32(b.speed + f32(acc * h)));
            else b.speed = Math.max(target, f32(b.speed - f32((b.inMud ? MudDecel : drag) * h)));
            b.laneF = moveTowards(b.laneF, b.laneTarget, f32(LaneRate * h));
        }
        const nx = f32(b.x + f32(b.speed * h));
        if (!b.airborne) {
            const g0 = this.track.height(nx, b.laneF);
            const zb = f32(f32(b.z + f32(b.vz * h)) - f32(f32(f32(0.5 * G) * h) * h));
            let launch = zb > g0 + 0.25 && b.speed > 1;
            if (launch) { b.z = zb; }
            else {
                // over a lip the ground falls away faster than gravity can pull the bike down it: it flies
                const s1 = this.track.slope(nx, b.laneF);
                const vg = f32(b.speed * s1);
                if (b.speed > 1 && vg < f32(b.vz - f32(f32(G * h) * 1.5))) { launch = true; b.z = g0; }
                else { b.x = nx; b.z = g0; b.slope = s1; b.vz = vg; }
            }
            if (launch) {
                b.airborne = true; b.airTime = 0; b.offset = 0; b.inMud = false; b.inWater = false;
                b.vz = f32(b.vz - f32(G * h)); b.x = nx;
                if (isPlayer) {
                    this.jumpFrom = this.track.featureAt(f32(nx + f32(b.laneF * Skew)));
                    this._add(MudEvent.Takeoff, 0);
                    if (this.p === Phase.Race) this._emit('takeoff', { big: b.vz > 110 });
                }
            } else if (isPlayer) {
                const ck = this.track.creekAt(b.x, b.laneF) >= 0;
                if (ck && !b.inCreek && this.p === Phase.Race) {
                    b.inCreek = true;
                    this._splash(b);                                 // rolled off the bank into the creek
                    if (this.p !== Phase.Race) return;
                }
                b.inCreek = ck;
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
        if (!isPlayer || this.p !== Phase.Race) return;                       // the finish coast is never judged
        if (this.track.creekAt(b.x, b.laneF) >= 0) { b.inCreek = true; this.jumpFrom = null; this._splash(b); return; }
        const from = this.jumpFrom;
        this.jumpFrom = null;
        if (air < MinJumpAir) return;
        const err = f32(pitch - surf);
        this.lastLandErr = err;
        const a = Math.abs(err);
        if (a > this.landTol && !this.mercyActive) { this._crash(CrashKind.Landing, roundEven(err)); return; }
        if (a > this.landTol * 0.5) {
            b.speed = f32(b.speed * RoughKeep); this.roughJumps++; this.st.rough++; this.combo = 0;
            this._add(MudEvent.Rough, roundEven(err));
            this._emit('rough', { err: roundEven(err) });
        } else {
            this.combo = Math.min(ComboMax, this.combo + 1);
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            const pts = PointsClean * this.combo;
            this.cleanJumps++; this.st.clean++;
            this._addScore(pts);
            this._cues.emit(SoundCue.Bonus);
            this._add(MudEvent.Clean, pts, this.combo);
            this._emit('clean', { combo: this.combo, pts });
        }
        // a gap cleared: over the pit (or the middle hump) and down on the far side
        if (from != null && from.clear > 0 && f32(b.x + f32(b.laneF * Skew)) >= from.x0 + from.clear) {
            const pts = from.kind === FeatureKind.Double ? PointsGap - 100 : PointsGap;
            this.gaps++; this.st.gaps++;
            this._addScore(pts);
            this._add(MudEvent.Gap, pts, from.kind);
            this._emit('gap', { pts, feature: from.kind });
        }
    }

    _splash(b) {
        const c = this.track.creeks[this.track.creekAt(b.x, b.laneF)];
        if (this.mercyActive) {                                               // credit 5: a wet slog up the far bank
            b.speed = f32(b.speed * 0.5);
            this.combo = 0;
            this._add(MudEvent.Splash, 0);
            this._emit('splash', { crash: false });
            return;
        }
        this._crash(CrashKind.Splash, 0);
        this.remountX = f32(c.x1 + 6 - this.player.laneF * Skew);         // you are fished out on the far bank
    }

    _crash(kind, value) {
        const p = this.player;
        this.lastCrash = kind;
        this.crashT = 0; this.crashX = p.x; this.remountX = p.x; this.crashSpeed = Math.max(p.speed, 40); this.crashLaneF = p.laneF;
        this.crashZ = this.track.height(p.x, p.laneF);
        this.crashes++; this.st.crashes++; this.combo = 0;
        if (kind === CrashKind.Clip) { this.st.clips++; this._cues.emit(SoundCue.Hit); this._add(MudEvent.Clip, value); }
        else if (kind === CrashKind.Splash) { this.st.splash++; this._cues.emit(SoundCue.Die); this._add(MudEvent.Splash, 0); }
        else if (kind === CrashKind.Bale) { this.st.bales++; this._cues.emit(SoundCue.Hit); this._add(MudEvent.BaleHit, value); }
        else { this._cues.emit(SoundCue.Die); this._add(MudEvent.CrashLanding, value); }
        this._emit('crash', { cause: kind === CrashKind.Clip ? 'clip' : kind === CrashKind.Splash ? 'splash' : kind === CrashKind.Bale ? 'bale' : 'landing' });
        p.speed = 0; p.airborne = false; p.z = this.crashZ; p.vz = 0; p.offset = 0; p.stallT = 0; p.inWater = false; p.inMud = false;
        p.slope = this.track.slope(p.x, p.laneF); p.pitch = slopeDeg(p.slope);
        p.laneTarget = clamp(roundEven(p.laneF), 0, Lanes - 1); p.laneF = p.laneTarget;
        this.jumpFrom = null;
        this.p = Phase.Crash; this.phaseTime = 0;
    }

    _remount() {
        const p = this.player;
        p.x = this.remountX;
        p.speed = 0; p.airborne = false; p.vz = 0; p.inCreek = false;
        p.z = this.track.height(p.x, p.laneF); p.slope = this.track.slope(p.x, p.laneF); p.pitch = slopeDeg(p.slope);
        p.invuln = InvulnSeconds;
        this.p = Phase.Race; this.phaseTime = 0;
        this._add(MudEvent.Remount, 0);
        this._emit('remount');
    }

    // a finished bike rolls on, off the throttle
    _coast(h) {
        const p = this.player;
        p.gas = p.turbo = false; p.lean = 0;
        p.heat = Math.max(0, f32(p.heat - f32(HeatIdleCool * h)));
        this._moveBike(p, h, 0, 0, true, CoastDrag);
    }

    _checkClock() {
        if (this.isFinal || this.mercyActive) return;
        if ((this.p === Phase.Race || this.p === Phase.Crash) && this.lapTime >= this.par) {
            this.lapTime = this.par;
            this._failRace(FailKind.TimeOver);
        }
    }

    _failRace(kind) {
        this.fail = kind;
        this.failDown = this.p === Phase.Crash;
        this.frozenCamX = this.raceCamX;
        this.st.fails++;
        this._cues.emit(SoundCue.Die);
        this._add(kind === FailKind.TimeOver ? MudEvent.TimeOver : kind === FailKind.EngineBlown ? MudEvent.EngineBlown : MudEvent.Beaten, 0);
        this._emit('fail', { why: kind === FailKind.TimeOver ? 'time' : kind === FailKind.EngineBlown ? 'blown' : 'beaten', last: this.tries <= 1 });
        this.p = Phase.Fail; this.phaseTime = 0;
    }

    _finish() {
        const p = this.player;
        const engineOk = !(p.stallT > 0);
        if (!engineOk && !this.mercyActive) { this._failRace(FailKind.EngineBlown); return; }
        if (!this.isFinal && this.lapTime > this.par && !this.mercyActive) { this._failRace(FailKind.TimeOver); return; }
        this.st.cleared = this.stageIdx + 1;
        this.st.clr[this.stageIdx] = 1;
        this.stageTimes.push('S' + this.stage.n + '@' + fmt(this.lapTime, 1, F32));
        const T = this.tally;
        T.length = 0;
        T.push({ label: 'LAP TIME', value: clock(this.lapTime), pts: 0, big: true });
        if (this.isFinal) {
            this.place = this.finishedCount + 1;
            this.st.place = this.place;
            const pb = this.place <= 3 ? PlaceBonus[this.place - 1] : 5000;
            T.push({ label: 'PLACE', value: ordinal(this.place), pts: 0, big: true });
            T.push({ label: 'PLACE BONUS', value: '', pts: pb });
        } else {
            const v = f32(f32(f32(this.par - this.lapTime) * 10) + 1e-3);
            const tb = Math.max(0, Math.floor(v)) * PointsPerTenthUnder;
            T.push({ label: 'UNDER PAR', value: '', pts: tb });
        }
        T.push({ label: 'CLEAN JUMPS ' + this.cleanJumps + '  BEST X' + this.bestCombo, value: '', pts: 0, info: true });
        T.push({ label: this.crashes === 0 ? 'NO CRASH BONUS' : 'CRASHES ' + this.crashes, value: '', pts: this.crashes === 0 ? PointsNoCrash : 0 });
        if (this.lapTime < this.stage.record) T.push({ label: 'TRACK RECORD!', value: '', pts: PointsRecord, record: true });
        this.tallyShown = 0;
        this.p = Phase.Finish; this.phaseTime = 0;
        this.frozenCamX = this.raceCamX;
        this._cues.emit(SoundCue.Bonus);
        this._add(MudEvent.Finish, this.isFinal ? this.place : 0);
        this._emit('finish', { stage: this.stage.n, place: this.place, final: this.isFinal });
    }

    _enterResult(r) {
        this._result = r;
        if (this.p !== Phase.Fail) this.frozenCamX = this.raceCamX;
        this.p = Phase.Result; this.phaseTime = 0;
        if (r === RoundResult.Won) { this._cues.emit(SoundCue.Win); this._emit('champion'); }
        else this._emit('gameOver');
    }

    _addScore(pts) {
        this._score += pts;
        while (this.extraEvery > 0 && this._score >= this.extraNext) {
            this.extraNext += this.extraEvery;
            this.tries++; this.extraTries++;
            this._add(MudEvent.Extra, 0);
            this._emit('extra');
        }
    }

    // ------------------------------------------------------------ the other riders
    _updateRivals(h) {
        const p = this.player;
        const playerDown = this.p === Phase.Crash || this.p === Phase.Fail;
        const racing = this.p === Phase.Race;
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
            if (r.wobbleT > 0) r.wobbleT = f32(r.wobbleT - h);
            if (r.coolT > 0) r.coolT = f32(r.coolT - h);
            let target = r.base;
            if (r.kind !== RiderKind.Slow) target = f32(target * f32(1 + f32(Surge * Math.sin(f32(this._time * 0.6) + r.surge))));
            if (r.wobbleT > 0) target = f32(target * 0.8);
            const dx = f32(p.x - r.x);
            const sameLane = Math.abs(p.laneF - r.laneF) < 0.7;
            if (!r.airborne && sameLane && dx > 0 && dx < 70 && (playerDown || p.speed < r.speed)) {
                // a rider behind you steers round you, or eases off
                const alt = this._freeLane(r, p);
                if (alt >= 0 && Math.abs(r.laneF - r.laneTarget) < 0.05) r.laneTarget = alt;
                else target = Math.min(target, Math.max(20, f32(p.speed * 0.9)));
            }
            if (r.kind !== RiderKind.Slow && !r.airborne) this._raceLine(r);
            if (r.spawn.weaver && !r.airborne && r.x > 0) {
                r.weaveT = f32(r.weaveT - h);
                if (r.weaveT <= 0) {
                    r.weaveT = f32(1.6 + f32(this._rng.nextDouble() * 1.8));
                    const want = clamp(r.laneTarget + (this._rng.nextDouble() < 0.5 ? -1 : 1), 0, Lanes - 1);
                    const playerThere = Math.abs(p.laneF - want) < 0.7 && Math.abs(dx) < 60;
                    if (!playerThere && !this._riderNear(r, want, 50) && !this._baleAhead(r.x, want, 60)) r.laneTarget = want;
                }
            }
            // a standing bale ahead: round it
            if (!r.airborne && this.bales.length > 0 && Math.abs(r.laneF - r.laneTarget) < 0.05 && this._baleAhead(r.x, r.laneTarget, 70)) {
                for (const c of [r.laneTarget - 1, r.laneTarget + 1, r.laneTarget - 2, r.laneTarget + 2])
                    if (c >= 0 && c < Lanes && !this._baleAhead(r.x, c, 90) && !this._riderNear(r, c, 30)) { r.laneTarget = c; break; }
            }
            // the pushy ones: side by side with you, a flash of "!", then they lean in
            if (r.pushy && racing) this._pushy(r, h);
            this._moveBike(r, h, target, f32(AccGas * 0.8), false, Drag);
            if (!r.finished && f32(r.x + f32(r.laneF * Skew)) >= this.track.length) {
                r.finished = true;
                if (this.p === Phase.Race || this.p === Phase.Crash) {
                    r.place = ++this.finishedCount;
                    if (this.isFinal && this.finishedCount >= 3 && !this.mercyActive) {
                        this.frozenCamX = this.raceCamX;
                        this._failRace(FailKind.Beaten);
                    }
                }
            }
        }
    }

    // a racer (pack, field) keeps off the back of a slower rider and out of the mud when it can
    _raceLine(r) {
        if (Math.abs(r.laneF - r.laneTarget) > 0.05) return;
        const lane = r.laneTarget;
        let blocked = false;
        for (const o of this.rivals) {
            if (o === r || !o.active || Math.abs(o.laneF - lane) > 0.6) continue;
            const d = f32(o.x - r.x);
            if (d > 6 && d < 46 && o.speed < r.speed - 4) { blocked = true; break; }
        }
        const mud = !blocked && (r.index & 1) === 0 && this.track.mudAhead(r.x, lane, 60) >= 0;
        if (!blocked && !mud) return;
        for (const c of [lane - 1, lane + 1]) {
            if (c < 0 || c >= Lanes || this._riderNear(r, c, 34)) continue;
            if (Math.abs(this.player.laneF - c) < 0.7 && Math.abs(this.player.x - r.x) < 34) continue;
            if (mud && this.track.mudAhead(r.x, c, 60) >= 0) continue;
            r.laneTarget = c;
            return;
        }
        if (blocked) r.speed = Math.max(40, f32(r.speed - 2));
    }

    _pushy(r, h) {
        const p = this.player;
        if (r.shoveT > 0) {
            r.shoveT = f32(r.shoveT - h);
            if (r.shoveT <= 0) {
                r.shoveT = 0;
                if (Math.abs(p.x - r.x) < 30 && !p.airborne && !r.airborne) r.laneTarget = r.shoveLane;
                r.coolT = f32(3 + f32(this._rng.nextDouble() * 2.5));
            }
            return;
        }
        if (r.coolT > 0 || r.airborne || p.airborne || r.wobbleT > 0) return;
        if (Math.abs(r.laneF - r.laneTarget) > 0.05 || Math.abs(p.laneF - p.laneTarget) > 0.05) return;
        const dl = roundEven(p.laneF) - roundEven(r.laneF);
        if (Math.abs(dl) !== 1 || Math.abs(f32(p.x - r.x)) > 20 || p.invuln > 0) return;
        r.shoveT = ShoveTell; r.shoveLane = roundEven(p.laneF);
        this._add(MudEvent.ShoveWarn, r.index);
        this._emit('shoveWarn');
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

    // a standing bale in this lane between world x and x + ahead
    _baleAhead(x, lane, ahead) {
        for (const b of this.bales) {
            if (b.down || b.lane !== lane) continue;
            const wx = b.x - lane * Skew;
            if (wx + BaleLen >= x && wx <= x + ahead) return true;
        }
        return false;
    }

    _collide() {
        const p = this.player;
        if (p.invuln > 0) return;
        for (let i = 0; i < this.rivals.length; i++) {
            const r = this.rivals[i];
            if (!r.active || r.bumpT > 0) continue;
            const dx = f32(r.x - p.x), dl = f32(r.laneF - p.laneF);
            const dz = Math.abs(p.z - r.z);
            // side by side and one of you steering into the other: a bump, never a crash
            if (Math.abs(dl) < 0.95 && Math.abs(dl) > 0.02 && Math.abs(dx) < 20 && dz < 8 && !p.airborne && !r.airborne) {
                const pMoves = Math.abs(p.laneTarget - p.laneF) > 0.02 && sign(p.laneTarget - p.laneF) === sign(dl);
                const rMoves = Math.abs(r.laneTarget - r.laneF) > 0.02 && sign(r.laneTarget - r.laneF) === -sign(dl);
                if (pMoves) { this._bumpRival(r, sign(dl), false); continue; }
                if (rMoves) { this._shoved(r, -sign(dl)); continue; }
            }
            if (Math.abs(dl) < 0.6 && dx > -6 && dx < 18 && dz < 12) {
                if (this.mercyActive) { this._bumpRival(r, dl >= 0 ? 1 : -1, true); continue; }
                this._crash(CrashKind.Clip, i); return;
            }
        }
    }

    // you steer into a rider: he is knocked a lane on (or, with nowhere to go, you bounce back)
    _bumpRival(r, dir, rear) {
        const p = this.player;
        const to = roundEven(r.laneF) + dir;
        if (!rear && (to < 0 || to >= Lanes || this._riderNear(r, to, 30))) p.laneTarget = clamp(roundEven(p.laneF - dir * 0.5), 0, Lanes - 1);
        else if (rear) { const alt = this._freeLane(r, p); if (alt >= 0) r.laneTarget = alt; p.speed = Math.min(p.speed, f32(r.speed * 0.85)); }
        else r.laneTarget = to;
        r.speed = f32(r.speed * 0.78); r.bumpT = 0.8; r.wobbleT = 0.7;
        p.speed = f32(p.speed * 0.93);
        this.bumps++; this.st.bumps++;
        this._cues.emit(SoundCue.Hit);
        if (!rear) this._addScore(PointsBump);
        this._add(MudEvent.Bump, rear ? 0 : PointsBump);
        this._emit('bump', { by: 'you', pts: rear ? 0 : PointsBump });
    }

    // a rider leans into you: you go a lane over (or he bounces off you at the edge)
    _shoved(r, dir) {
        const p = this.player;
        const to = roundEven(p.laneF) + dir;
        if (to >= 0 && to < Lanes) p.laneTarget = to;
        else r.laneTarget = clamp(roundEven(r.laneF + dir * 0.5), 0, Lanes - 1);
        p.speed = f32(p.speed * 0.8); p.wobbleT = 0.5;
        r.bumpT = 0.8; r.coolT = Math.max(r.coolT, 3);
        this.st.shoved++;
        this._cues.emit(SoundCue.Hit);
        this._add(MudEvent.Shoved, 0);
        this._emit('bump', { by: 'rival', pts: 0 });
    }

    _bales() {
        const p = this.player;
        for (const b of this.bales) {
            if (b.down) continue;
            const wx = b.x - b.lane * Skew;
            const ahead = f32(wx - p.x);
            if (!b.warned && Math.abs(p.laneF - b.lane) < 0.6 && ahead > 0 && ahead < BaleWarnAhead) { b.warned = true; this._emit('baleNear'); }
            if (Math.abs(p.laneF - b.lane) >= 0.6 || p.invuln > 0) continue;
            if (p.x + 8 < wx || p.x - 8 > wx + BaleLen) continue;
            if (p.airborne && p.z - this.track.height(p.x, p.laneF) > BaleHigh) continue;
            b.down = true; b.downT = this._time;
            if (this.mercyActive) {
                p.speed = f32(p.speed * 0.7);
                this._add(MudEvent.Bump, 0);
                this._emit('bump', { by: 'bale', pts: 0 });
                continue;
            }
            this._crash(CrashKind.Bale, 0);
            return;
        }
    }

    _countPasses() {
        const p = this.player;
        for (let i = 0; i < this.rivals.length; i++) {
            const r = this.rivals[i];
            if (!r.active || r.passed || p.x <= r.x + 20) continue;
            r.passed = true; this.passes++; this.st.passes++;
            this._addScore(PointsPass);
            this._cues.emit(SoundCue.Bonus);
            this._add(MudEvent.Pass, PointsPass);
            this._emit('pass', { pts: PointsPass });
        }
    }

    // the championship: your place in the field as it stands
    _standings() {
        if (!this.isFinal) return;
        const p = this.player;
        const mine = f32(p.x + f32(p.laneF * Skew));
        let pos = 1;
        for (const r of this.rivals) if (r.finished || f32(r.x + f32(r.laneF * Skew)) > mine) pos++;
        if (this.position !== 0 && pos !== this.position) this._emit('pos', { pos, up: pos < this.position });
        this.position = pos;
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
            if (z <= g) return { ok: true, t, landX: x, surfDeg: slopeDeg(this.track.slope(x, b.laneF)), velDeg: velDeg(vz, v), creek: this.track.creekAt(x, b.laneF) >= 0 };
        }
        return { ok: false, t, landX: x, surfDeg: 0, velDeg: velDeg(vz, v), creek: false };
    }

    _add(kind, value, tag = 0) {
        this.log.push({ t: this._time, kind, x: this.player.x, z: this.player.z, laneF: this.player.laneF, value, tag });
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    collectStats(into) {
        const s = this.st;
        add(into, 'cleared', s.cleared);
        add(into, 'fails', s.fails);
        add(into, 'crashes', s.crashes);
        add(into, 'clips', s.clips);
        add(into, 'splash', s.splash);
        add(into, 'bales', s.bales);
        add(into, 'overheats', s.overheats);
        add(into, 'clean', s.clean);
        add(into, 'rough', s.rough);
        add(into, 'gaps', s.gaps);
        add(into, 'passes', s.passes);
        add(into, 'bumps', s.bumps);
        add(into, 'shoved', s.shoved);
        add(into, 'mudSec', s.mudSec);
        add(into, 'extraTries', this.extraTries);
        add(into, 'top3', s.place > 0 && s.place <= 3 ? 1 : 0);
        for (let i = 0; i < Stages.length; i++) { add(into, 'clr' + (i + 1), s.clr[i]); add(into, 'try' + (i + 1), s.tries[i]); }
    }
}

function newStats() {
    return { reached: 0, cleared: 0, fails: 0, crashes: 0, clips: 0, splash: 0, bales: 0, overheats: 0, clean: 0, rough: 0,
             gaps: 0, passes: 0, bumps: 0, shoved: 0, mudSec: 0, place: 0,
             clr: new Array(Stages.length).fill(0), tries: new Array(Stages.length).fill(0) };
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

export function clock(sec) {
    if (sec < 0) sec = 0;
    if (sec > 99.9) sec = 99.9;
    const tenths = Math.floor(sec * 10 + 1e-3);
    return String(Math.trunc(tenths / 10)).padStart(2, '0') + '.' + (tenths % 10);
}

export function ordinal(n) { return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'); }

MudMetalSim.Phase = Phase;
MudMetalSim.FailKind = FailKind;
MudMetalSim.CrashKind = CrashKind;
MudMetalSim.WarnSegments = WarnSegments;
MudMetalSim.LeanRate = LeanRate;
MudMetalSim.ShoveTell = ShoveTell;
MudMetalSim.PointsClean = PointsClean;
MudMetalSim.PointsPass = PointsPass;
