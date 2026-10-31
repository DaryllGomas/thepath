// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE GAME (ICabinetSim).
// Started as a 1:1 port of HyperDriftSim.cs (Staging/Batch3/hyperdrift); the car's handling is still that
// code, floats as C# floats (f32). The 2026-10-18 build-out made one road into a five-leg rally.
//
// A top-down, vertically scrolling road racer. The road scrolls down the screen, so your car drives up
// it. A COIN BUYS A RALLY of five legs (legs.js), each its own country and its own trouble:
//   1 DESERT RUN    trucks, oil, road works, a bridge, the fork, four hairpins (the teaching leg)
//   2 NIGHT CITY    the dark: your headlights and the street lamps are all you see; tunnels; taxis that
//                   pull out from the kerb (the indicator blinks first); boost pads
//   3 THE COAST     rain: the road is slick (less grip); puddles (aquaplaning: no steering for a moment);
//                   three bridges over the inlets
//   4 SNOW PASS     ice (the wheel does nothing on it); snowbanks (leave the road and you're stuck);
//                   six hairpins up the pass
//   5 CANYON FINAL  rockfalls (a shadow grows, then the rock lands and stays); two jumps over crevasses
//                   (hit the ramp fast or fall in); from the dash gate on, THE RIVAL races you to the flag
// Each leg: the CARD (leg, name, what's new, a hint), 3-2-1-GO, the race to the CHECKPOINT with an
// EXTENDED TIME gate half way, then the TALLY (the time left drains into points, the bonuses pop).
// Clearing the last leg ahead of the rival wins the game (RALLY CHAMPION).
//
// CARS (lives): 3. A car is lost to a WRECK (a head-on, a boulder, a rock on the roof, a fall into a
// crevasse, the rival at the flag first) or when THE CLOCK RUNS OUT (the next car gets a refill). A
// SPIN-OUT (a car side-on, oil, cones, a rail or a wall, leaving the road) costs time, never a car.
// An extra car at 20,000 and every 40,000 after.
//
//   stick left/right  steer (the car slides sideways toward stick x grip, with a little inertia)
//   stick up / down   accelerate / brake (nothing held: the car coasts down slowly)
//   A (held)          DRIFT: a short handbrake, up to 1 s. Tighter turn, speed bleeds away.
//                     Normal grip turns at most 0.9 px across per px up (and 110 px/s across);
//                     a drift turns 2.2 (150 px/s). The hairpins need about 1.3: drift or spin.
//
// SCORE: 1 a 5 px of new road, 100 x the leg a clean pass, 250 x the leg for drifting a hairpin without a
// spin, 50 a boost pad, 500 the extend gate; the tally: 100 x the leg a second left, 1,000 x the leg for a
// leg without a spin or a wreck; at the flag 10,000 for beating the rival and 5,000 a car left.
//
// MERCY (Core): spec.js's knobs ease the clock, the margin, the traffic and the rival per lost game.
// Credit 5: no traffic and no hazards, a slow rival, the clock cannot run out (it holds at 1) and the
// last car cannot be lost. You can still spin; you cannot lose.
//
// Round life: Card + Countdown (Intro) -> Racing (Playing) -> Tally / Wreck / OutOfTime / GameOver
// (Interlude) -> the next leg's Card ... -> Result (Card) -> Over. Result is set when the Result card
// begins, never before.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { HyperDriftTrack, HyperDriftScroll, ZoneKind } from './track.js';
import { LEGS, Terrain, Slick as SlickKind, JumpSpeed } from './legs.js';

const Phase = Object.freeze({ Idle: 0, Card: 1, Countdown: 2, Racing: 3, Wreck: 4, OutOfTime: 5, Tally: 6, GameOver: 7, Result: 8, Over: 9 });
const SpinCause = Object.freeze({ None: 0, Car: 1, Road: 2, Oil: 3, Cones: 4, Rail: 5, Snow: 6 });
const WreckCause = Object.freeze({ None: 0, HeadOn: 1, Boulder: 2, Rockfall: 3, Fell: 4, Beaten: 5 });
const HazardKind = Object.freeze({ Oil: 0, Puddle: 1, Ice: 2, Boulder: 3 });
const VehKind = Object.freeze({ Car: 0, Truck: 1, Taxi: 2 });
// what the particles are (the renderer picks the colours)
const Fx = Object.freeze({ Smoke: 0, Fire: 1, Spark: 2, Debris: 3, Water: 4, Snow: 5, Dust: 6, Flame: 7 });

const HalfWidth = HyperDriftTrack.HalfWidth, LaneOffset = HyperDriftTrack.LaneOffset;
const SkidCap = 640, FxCap = 180, Legs = HyperDriftTrack.Legs;

// the C# float literals this file uses (a bare 0.3 in JS would be a double)
const F0_1 = f32(0.1), F0_2 = f32(0.2), F0_3 = f32(0.3), F0_35 = f32(0.35), F0_4 = f32(0.4);
const F0_45 = f32(0.45), F0_55 = f32(0.55), F0_6 = f32(0.6), F0_78 = f32(0.78), F0_85 = f32(0.85);
const F1_2 = f32(1.2), F1_9 = f32(1.9), F2_2 = f32(2.2), F2_4 = f32(2.4);

export class Vehicle {
    constructor() {
        this.id = 0;
        this.kind = VehKind.Car;
        this.dir = 0;                      // +1 your way, -1 oncoming
        this.s = 0; this.x = 0; this.lane = 0;   // lane = perpendicular offset from the road centre
        this.speed = 0; this.baseSpeed = 0;     // along the road, px/s (>0)
        this.cur = 0;                      // the speed it actually moved at this step
        this.passed = false; this.hit = false; this.stopped = false; this.held = false;
        this.knockT = 0; this.knockDir = 0; this.wobble = 0;
        this.parked = false; this.signalT = -1;    // a taxi at the kerb: its indicator, then it pulls out
    }
    get truck() { return this.kind === VehKind.Truck; }
    get halfW() { return this.kind === VehKind.Truck ? 7 : 6; }
    get halfL() { return this.kind === VehKind.Truck ? 14 : 10; }
}

// a patch on the road: oil (spin), a puddle (aquaplane), ice (no grip), a boulder (a wreck)
export class Hazard {
    constructor(kind, s, x) {
        this.kind = kind; this.s = s; this.x = x;
        this.rx = Hazard.RX[kind]; this.rs = Hazard.RS[kind];
    }
}
Hazard.RX = [11, 10, 13, 7];                // half the sprite: oil, puddle, ice, boulder
Hazard.RS = [5, 4, 7, 5];

export class HyperDriftSim {
    constructor() {
        // ------------------------------------------------------------------ the machine's numbers (not mercy knobs)
        this.cardSeconds = f32(2.6); this.countdownStep = f32(0.5); this.goHold = f32(0.35);
        this.wreckSeconds = f32(2.0); this.outSeconds = f32(1.8); this.gameOverSeconds = f32(2.4); this.resultSeconds = f32(3.5);
        this.spinSeconds = f32(2.0); this.snowSeconds = f32(1.0); this.ghostSeconds = f32(1.2); this.respawnGhost = f32(2.2);
        this.accel = f32(95); this.brake = f32(260); this.coast = f32(28); this.driftDecel = f32(60); this.driftMax = f32(1.0); this.driftCool = f32(0.2);
        this.tanNormal = f32(0.9); this.gripNormal = f32(110); this.tanDrift = f32(2.2); this.gripDrift = f32(150);
        this.latAcc = f32(520); this.latAccDrift = f32(700); this.lowSpeedGrip = f32(55);
        this.boostSeconds = f32(1.6); this.boostTop = f32(1.28); this.boostAccel = f32(2.4);
        this.aquaSeconds = f32(0.55); this.wreckClosing = f32(185);
        this.passPoints = 100; this.driftPoints = 250; this.pxPerPoint = 5; this.padPoints = 50; this.extendPoints = 500;
        this.timePoints = 100; this.cleanPoints = 1000; this.rivalPoints = 10000; this.carPoints = 5000;
        this.extraFirst = 20000; this.extraEvery = 40000; this.maxCars = 6;
        this.refillSeconds = f32(20);

        // ------------------------------------------------------------------ read-only state
        this.leg = 0;                      // 0..4
        this.def = LEGS[0];
        this.track = Legs[0];
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.countdownLeft = 0;
        this.credit = null;
        this.isDemo = false;               // the attract demo (AttractMode sets it before reset): it starts on a later leg
        this.cars = 3;
        this.legsCleared = 0;

        this.clockK = 1; this.clock = 0; this.clockStart = 0; this.margin = 0; this.vMax = 0; this.trafficDensity = 0; this.hazardDensity = 0;
        this.rivalPace = 1; this.gripK = 1;

        // your car
        this.x = 0; this.s = 0;
        this.v = 0;                        // up the road, px/s
        this.vx = 0;                       // across, px/s
        this.bodyAngle = 0;                // radians clockwise from up (drawing)
        this.drifting = false; this.driftTime = 0; this.driftCooldown = 0;
        this.spinLeft = 0; this.lastSpin = SpinCause.None; this.spinAngle = 0;
        this.ghostLeft = 0; this.onKerb = false; this.maxS = 0;
        this.throttle = 0;                 // -1 brake, 0, +1 gas (for the tail lights)
        this.boostLeft = 0;                // a boost pad's turbo
        this.aquaLeft = 0; this.onIce = false; this._iceLeft = 0;
        this.airLeft = 0; this.airTime = 0;     // over a crevasse
        this.wreckCause = WreckCause.None;
        this.goT = 0;                      // the GO! flash after the countdown

        this.traffic = [];
        this.hazards = [];                 // Hazard, sorted by s
        this.rocks = [];                   // { s, x, t, state 0 waiting / 1 falling / 2 landed }
        this.rival = null;                 // the final leg's rival (from the dash gate on)
        this.rivalAhead = false;
        this.padTaken = [];
        this.popups = [];                  // { text, x, s, t, big }
        this.banner = null;                // { text, t, kind: 0 news, 1 danger, 2 good, 3 rival }
        this.fx = [];                      // particles { k, x, s, vx, vs, life, max }
        this.shake = 0; this.flash = 0;
        this.tally = null;
        this.recordEvents = false; this.events = [];

        // skid marks: a ring of world points
        this.skidX = new Float32Array(SkidCap); this.skidS = new Float32Array(SkidCap);
        this.skidCount = 0;
        this._skidHead = 0;

        // tallies
        this.passes = 0; this.hairpinDrifts = 0; this.hairpinsSeen = 0; this.boosts = 0; this.jumps = 0; this.extraCars = 0;
        this.spinsCar = 0; this.spinsRoad = 0; this.spinsOil = 0; this.spinsCones = 0; this.spinsRail = 0; this.spinsSnow = 0;
        this.wrecksHeadOn = 0; this.wrecksBoulder = 0; this.wrecksRock = 0; this.wrecksFell = 0; this.beaten = 0; this.timeOuts = 0;
        this.legPasses = 0; this.legDrifts = 0; this.legSpins = 0; this.legWrecks = 0;
        this.extendDone = false;

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._score = 0; this._distPoints = 0; this._nextId = 0; this._extraNext = 0;
        this._time = 0;
        this._rng = null; this._fxRng = null;
        this._sameTimer = 0; this._oncTimer = 0;
        this._hpDrifted = null; this._hpSpoiled = null; this._hpDone = null;
        this._seen = new Set();            // landmark events already said this leg
        this._taxiSpots = [];
        this._prevS = 0; this._dashClock = 0; this._hurry = false; this._cardSaid = false;
        this._cause = SpinCause.None;      // clearance's `out cause`
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get won() { return this._result === RoundResult.Won; }
    get spinning() { return this.spinLeft > 0; }
    get airborne() { return this.airLeft > 0; }
    get spins() { return this.spinsCar + this.spinsRoad + this.spinsOil + this.spinsCones + this.spinsRail + this.spinsSnow; }
    get wrecks() { return this.wrecksHeadOn + this.wrecksBoulder + this.wrecksRock + this.wrecksFell + this.beaten; }
    get finalLeg() { return this.leg === LEGS.length - 1; }
    get checkpoint() { return this.track.checkpoint; }
    get legNo() { return this.leg + 1; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Card: case Phase.Countdown: return CabinetState.Intro;
            case Phase.Racing: return CabinetState.Playing;
            case Phase.Wreck: case Phase.OutOfTime: case Phase.Tally: case Phase.GameOver: return CabinetState.Interlude;
            case Phase.Result: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this.cars; }
    get time() { return this._time; }
    get cues() { return this._cues; }
    get legProgress() { return Math.min(1, Math.max(0, f32(this.maxS / this.checkpoint))); }
    get progress() { return Math.min(1, f32(f32(this.legsCleared + (this.legsCleared >= LEGS.length ? 0 : this.legProgress)) / LEGS.length)); }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's legs ' + this.legsCleared + '/' + LEGS.length +
            ' (leg ' + this.legNo + ' at ' + fmt(f32(this.legProgress * 100), 0, F32) + '%) cars ' + this.cars +
            ' spins ' + this.spins + ' (car ' + this.spinsCar + ' road ' + this.spinsRoad + ' oil ' + this.spinsOil + ' cones ' + this.spinsCones +
            ' rail ' + this.spinsRail + ' snow ' + this.spinsSnow + ') wrecks ' + this.wrecks + ' (head-on ' + this.wrecksHeadOn + ' boulder ' + this.wrecksBoulder +
            ' rock ' + this.wrecksRock + ' fell ' + this.wrecksFell + ' beaten ' + this.beaten + ') time-outs ' + this.timeOuts +
            ' passes ' + this.passes + ' hairpins ' + this.hairpinDrifts + '/' + this.hairpinsSeen + ' boosts ' + this.boosts + ' jumps ' + this.jumps;
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        this._fxRng = new SystemRandom(this._rng.next(1 << 30) + 1);
        this.clockK = k.get('clock');
        this.margin = k.get('margin');
        this.vMax = k.get('vmax');
        this.trafficDensity = k.get('traffic');
        this.hazardDensity = k.get('hazards');
        this.rivalPace = k.get('rival');
        this.cars = Math.max(1, roundEven(k.get('cars')));

        this._score = 0; this._time = 0; this._nextId = 0; this._extraNext = this.extraFirst;
        this._result = RoundResult.None;
        this.legsCleared = 0;
        this.passes = 0; this.hairpinDrifts = 0; this.hairpinsSeen = 0; this.boosts = 0; this.jumps = 0; this.extraCars = 0;
        this.spinsCar = this.spinsRoad = this.spinsOil = this.spinsCones = this.spinsRail = this.spinsSnow = 0;
        this.wrecksHeadOn = this.wrecksBoulder = this.wrecksRock = this.wrecksFell = this.beaten = this.timeOuts = 0;
        this.popups.length = 0; this.fx.length = 0; this.events.length = 0; this.banner = null;
        this._cues.resetTotals();

        // the attract demo shows the later legs (the variety); a real coin always starts in the desert
        const first = this.isDemo ? 1 + ((seed >>> 0) % (LEGS.length - 1)) : 0;
        this._startLeg(first);
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    // ------------------------------------------------------------------ a leg
    _startLeg(i) {
        this.leg = i;
        this.def = LEGS[i];
        const tr = this.track = Legs[i];
        this.gripK = f32(this.def.grip);
        this.clockStart = f32(this.def.clock * this.clockK);
        this.clock = this.clockStart;

        this.x = tr.laneX(0, +1); this.s = 0; this.v = 0; this.vx = 0; this.bodyAngle = 0;
        this.drifting = false; this.driftTime = 0; this.driftCooldown = 0; this.spinLeft = 0; this.ghostLeft = 0; this.lastSpin = SpinCause.None;
        this.maxS = 0; this.onKerb = false; this.throttle = 0; this._prevS = 0;
        this.boostLeft = 0; this.aquaLeft = 0; this.onIce = false; this._iceLeft = 0; this.airLeft = 0; this.airTime = 0;
        this.traffic.length = 0; this.hazards.length = 0; this.rocks.length = 0; this.rival = null; this.rivalAhead = false;
        this.padTaken = tr.pads.map(() => false);
        this.skidCount = 0; this._skidHead = 0;
        this._distPoints = 0;
        this.legPasses = 0; this.legDrifts = 0; this.legSpins = 0; this.legWrecks = 0;
        this.extendDone = false; this._hurry = false; this.tally = null; this.goT = 0;
        const hp = tr.hairpins.length;
        this._hpDrifted = new Array(hp).fill(false); this._hpSpoiled = new Array(hp).fill(false); this._hpDone = new Array(hp).fill(false);
        this._seen.clear();
        this._dealHazards();

        this._sameTimer = f32(2.5); this._oncTimer = f32(1.5);
        this.p = Phase.Card; this.phaseTime = 0; this.countdownLeft = 3;
        this._cues.emit(SoundCue.Tick);
        this._cardSaid = false;
    }

    // oil, puddles or ice in the leg's slick zones; rocks waiting in the canyon; taxis at the city's kerbs
    _dealHazards() {
        const tr = this.track, rng = this._rng, k = this.hazardDensity;
        const kind = this.def.slick === SlickKind.Puddle ? HazardKind.Puddle : this.def.slick === SlickKind.Ice ? HazardKind.Ice : HazardKind.Oil;
        const spacing = kind === HazardKind.Ice ? 120 : 90;
        if (k > 0)
            for (const z of tr.slickZones) {
                const n = roundEven(f32((1 + rng.next(kind === HazardKind.Oil ? 2 : 3)) * k));
                for (let i = 0; i < n; i++) {
                    const s = f32(z.s0 + f32(f32(rng.nextDouble()) * (z.s1 - z.s0)));
                    if (tr.isWalled(s) || tr.isWorks(s) || tr.zoneAt(ZoneKind.Hairpin, s) !== null) continue;
                    const lane = rng.next(2) === 0 ? -1 : 1;
                    const off = f32(lane * LaneOffset + f32(f32(f32(rng.nextDouble()) - 0.5) * 10));
                    let clash = false;
                    for (const o of this.hazards) if (Math.abs(f32(o.s - s)) < spacing) clash = true;
                    if (clash) continue;
                    this.hazards.push(new Hazard(kind, s, f32(tr.cx(s) + f32(off * tr.f(s)))));
                }
            }
        this.hazards.sort((a, b) => a.s < b.s ? -1 : a.s > b.s ? 1 : 0);
        if (k > 0)
            for (const z of tr.rockZones) {
                let s = f32(z.s0 + f32(f32(rng.nextDouble()) * 120));
                while (s < z.s1) {
                    if (tr.zoneAt(ZoneKind.Hairpin, s) === null && tr.zoneAt(ZoneKind.Gap, f32(s - 40)) === null && tr.zoneAt(ZoneKind.Gap, f32(s + 40)) === null) {
                        const lane = rng.next(2) === 0 ? -1 : 1;
                        this.rocks.push({ s, x: f32(tr.laneX(s, lane) + f32(f32(f32(rng.nextDouble()) - 0.5) * 8)), t: 0, state: 0 });
                    }
                    s = f32(s + f32(220 + f32(f32(rng.nextDouble()) * 200)));
                }
            }
        this._taxiSpots.length = 0;
        if (this.trafficDensity > 0)
            for (const z of tr.taxiZones) {
                let s = f32(z.s0 + f32(f32(rng.nextDouble()) * 80));
                while (s < z.s1) {
                    if (rng.nextDouble() < 0.7) this._taxiSpots.push(s);
                    s = f32(s + f32(200 + f32(f32(rng.nextDouble()) * 140)));
                }
            }
    }

    // ------------------------------------------------------------------ the step
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > F0_1) dt = F0_1;
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        for (let i = this.popups.length - 1; i >= 0; i--) if (f32(this._time - this.popups[i].t) > F1_2) this.popups.splice(i, 1);
        if (this.banner !== null && f32(this._time - this.banner.t) > 2.2) this.banner = null;
        if (this.shake > 0) this.shake = Math.max(0, f32(this.shake - dt));
        if (this.flash > 0) this.flash = Math.max(0, f32(this.flash - dt));
        if (this.goT > 0) this.goT = Math.max(0, f32(this.goT - dt));
        this._stepFx(dt);

        switch (this.p) {
            case Phase.Card:
                if (!this._cardSaid) { this._cardSaid = true; this._emit('card', { leg: this.legNo }); }     // (said on the first step: the host listens from then)
                if (this.phaseTime >= this.cardSeconds) { this.p = Phase.Countdown; this.phaseTime = 0; this.countdownLeft = 3; this._cues.emit(SoundCue.Tick); }
                break;
            case Phase.Countdown: {
                const hold = this.countdownLeft === 0 ? this.goHold : this.countdownStep;
                if (this.phaseTime >= hold) {
                    this.phaseTime = f32(this.phaseTime - hold);
                    this.countdownLeft--;
                    if (this.countdownLeft < 0) { this.p = Phase.Racing; this.phaseTime = 0; this.goT = f32(0.8); this._emit('go'); }
                    else this._cues.emit(this.countdownLeft === 0 ? SoundCue.Start : SoundCue.Tick);
                }
                break;
            }
            case Phase.Racing: {
                const before = this.clock;
                this.clock = f32(this.clock - dt);
                if (this.mercyActive && this.clock < 1) this.clock = 1;          // credit 5: the clock cannot run out
                if (this.clock < 10 && this.clock > 0 && Math.ceil(before) !== Math.ceil(this.clock)) this._cues.emit(SoundCue.Tick);
                if (!this._hurry && this.clock < 10 && !this.mercyActive) { this._hurry = true; this._emit('hurry'); }
                if (this.clock >= 10) this._hurry = false;
                this._prevS = this.s;
                this._driveCar(dt, input, true);
                this._moveTraffic(dt);
                if (this.p === Phase.Racing) this._moveRival(dt);
                if (this.p === Phase.Racing) this._stepRocks(dt);
                if (this.p === Phase.Racing) this._contacts();
                if (this.p === Phase.Racing) this._landmarks();
                if (this.p !== Phase.Racing) break;
                if (this.s >= this.checkpoint) this._beginTally();
                else if (this.clock <= 0) this._beginOutOfTime();
                break;
            }
            case Phase.Wreck:
                this._moveTraffic(dt);
                this._moveRival(dt);
                if (this.wreckCause === WreckCause.Beaten) this._driveCar(dt, null, false);
                if (this.phaseTime < 1.2 && this.wreckCause !== WreckCause.Fell && this.wreckCause !== WreckCause.Beaten && this._fxRng.nextDouble() < 0.5)
                    this._puff(Fx.Smoke, this.x, this.s, 1, 30);
                if (this.phaseTime >= this.wreckSeconds) {
                    if (this.cars <= 0) this._beginGameOver();
                    else this._respawn();
                }
                break;
            case Phase.OutOfTime:
                this._driveCar(dt, null, false);
                this._moveTraffic(dt);
                if (this.phaseTime >= this.outSeconds) {
                    if (this.cars <= 0) this._beginGameOver();
                    else {
                        this.clock = f32(this.refillSeconds * this.clockK);
                        this.p = Phase.Racing; this.phaseTime = 0; this.goT = f32(0.8);
                        this._say('+' + roundEven(this.clock) + ' SECONDS', 2);
                        this._emit('newCar', { refill: true });
                    }
                }
                break;
            case Phase.Tally:
                this._driveCar(dt, null, false);
                this._moveTraffic(dt);
                this._moveRival(dt);
                this._stepTally(dt);
                break;
            case Phase.GameOver:
                this._moveTraffic(dt);
                if (this.phaseTime >= this.gameOverSeconds) { this._result = RoundResult.Lost; this.p = Phase.Result; this.phaseTime = 0; }
                break;
            case Phase.Result:
                this._moveTraffic(dt);
                if (this.phaseTime >= this.resultSeconds) this.p = Phase.Over;
                break;
        }
    }

    // ------------------------------------------------------------------ the end of a leg: the tally
    _beginTally() {
        const goal = this.finalLeg;
        this.p = Phase.Tally; this.phaseTime = 0;
        this.drifting = false; this.boostLeft = 0;
        this.legsCleared++;
        const clean = this.legSpins === 0 && this.legWrecks === 0;
        this.tally = {
            goal, clock0: this.clock, rate: Math.max(f32(this.clock / 1.3), 12), paid: 0,
            timeBonus: roundEven(f32(this.clock * 10)) * 10 * this.legNo * (this.timePoints / 100),
            lines: [], shown: 0, stage: 0, at: 0, tick: 0,
        };
        if (clean) this.tally.lines.push(['NO SPIN BONUS', this.cleanPoints * this.legNo]);
        if (goal) {
            this.tally.lines.push(['RIVAL BEATEN', this.rivalPoints]);
            this.tally.lines.push(['CARS LEFT ' + this.cars + ' X ' + this.carPoints, this.carPoints * this.cars]);
        }
        this._cues.emit(SoundCue.Bonus);
        this._emit(goal ? 'goal' : 'checkpoint', { leg: this.legNo });
        for (let i = 0; i < 18; i++) this._puff(i & 1 ? Fx.Spark : Fx.Flame, f32(this.x + f32((this._fxRng.nextDouble() - 0.5) * 60)), f32(this.s + 30), 1, 60);
    }

    _stepTally(dt) {
        const T = this.tally, pt = this.phaseTime;
        if (pt < 1.0) return;                                    // CHECKPOINT! first
        if (T.stage === 0) {
            // the time left drains into points
            if (T.clock0 > 0 && this.clock > 0) {
                this.clock = Math.max(0, f32(this.clock - f32(T.rate * dt)));
                const want = this.clock <= 0 ? T.timeBonus : Math.trunc(f32(f32(T.clock0 - this.clock) / T.clock0) * T.timeBonus / 10) * 10;
                if (want > T.paid) { this._addScore(want - T.paid); T.paid = want; }
                T.tick = f32(T.tick + dt);
                if (T.tick >= 0.07) { T.tick = 0; this._emit('tallyTick'); }
            }
            if (this.clock <= 0 || T.clock0 <= 0) {
                this.clock = 0;
                if (T.timeBonus > T.paid) { this._addScore(T.timeBonus - T.paid); T.paid = T.timeBonus; }
                T.stage = 1; T.at = pt;
            }
            return;
        }
        // the bonus lines, one by one
        if (T.shown < T.lines.length && pt >= f32(T.at + f32(0.5 * (T.shown + 1)))) {
            this._addScore(T.lines[T.shown][1]);
            T.shown++;
            this._emit('tallyBonus', { n: T.shown });
            this._cues.emit(SoundCue.Bonus);
        }
        if (T.shown >= T.lines.length && pt >= f32(T.at + f32(0.5 * T.lines.length + (T.goal ? 1.8 : 1.4)))) {
            if (T.goal) {
                this._result = RoundResult.Won;
                this.p = Phase.Result; this.phaseTime = 0;
                this._cues.emit(SoundCue.Win);
                this._emit('champion');
            } else this._startLeg(this.leg + 1);
        }
    }

    _beginOutOfTime() {
        this.clock = 0;
        this.p = Phase.OutOfTime; this.phaseTime = 0;
        this.drifting = false;
        this.timeOuts++;
        this._loseCar();
        this._cues.emit(SoundCue.Die);
        this._emit('outOfTime', { cars: this.cars });
    }

    _beginGameOver() {
        this.p = Phase.GameOver; this.phaseTime = 0;
        this._emit('gameOver');
    }

    _loseCar() {
        if (this.mercyActive && this.cars <= 1) return;         // credit 5: the last car is never lost
        this.cars = Math.max(0, this.cars - 1);
    }

    _addScore(n) {
        this._score += n;
        while (this._score >= this._extraNext) {
            this._extraNext += this.extraEvery;
            if (this.cars < this.maxCars) {
                this.cars++; this.extraCars++;
                this._say('EXTRA CAR!', 2);
                this._emit('extraCar', { cars: this.cars });
            }
        }
    }

    _say(text, kind) { this.banner = { text, t: this._time, kind }; }

    // ------------------------------------------------------------------ wrecks and the next car
    _wreck(cause) {
        this.p = Phase.Wreck; this.phaseTime = 0;
        this.wreckCause = cause;
        this.drifting = false; this.spinLeft = 0; this.airLeft = 0; this.boostLeft = 0; this.aquaLeft = 0;
        this.legWrecks++;
        switch (cause) {
            case WreckCause.HeadOn: this.wrecksHeadOn++; break;
            case WreckCause.Boulder: this.wrecksBoulder++; break;
            case WreckCause.Rockfall: this.wrecksRock++; break;
            case WreckCause.Fell: this.wrecksFell++; break;
            default: this.beaten++; break;
        }
        this._loseCar();
        this._cues.emit(SoundCue.Die);
        if (cause === WreckCause.Beaten) {
            this._say('BEATEN AT THE FLAG', 3);
            this._emit('beaten', { cars: this.cars });
            return;
        }
        this.v = 0; this.vx = 0;
        this.shake = f32(0.5); this.flash = f32(0.22);
        if (cause === WreckCause.Fell) {
            for (let i = 0; i < 16; i++) this._puff(Fx.Dust, this.x, f32(this.s + 6), 1, 50);
        } else {
            for (let i = 0; i < 14; i++) this._puff(Fx.Fire, this.x, this.s, 1, 90);
            for (let i = 0; i < 12; i++) this._puff(Fx.Debris, this.x, this.s, 1, 120);
            for (let i = 0; i < 8; i++) this._puff(Fx.Spark, this.x, this.s, 1, 140);
        }
        this._emit('wreck', { cause, cars: this.cars });
    }

    _respawn() {
        const tr = this.track, W = this.wreckCause;
        let s = this.s;
        if (W === WreckCause.Fell) { const g = tr.nextGap(f32(s - 60)); if (g !== null) s = g.s1 + 30; }
        if (W === WreckCause.Beaten) {
            // the dash again: back to the gate, the rival waits there; the clock as it was at the gate
            s = this.def.dash - 60;
            this.rival = null; this.rivalAhead = false;
            this.clock = Math.max(this._dashClock, f32(12 * this.clockK));
            for (const r of this.rocks) if (r.s > this.def.dash) { r.state = 0; r.t = 0; }
            for (let i = this.hazards.length - 1; i >= 0; i--) if (this.hazards[i].kind === HazardKind.Boulder && this.hazards[i].s > this.def.dash) this.hazards.splice(i, 1);
            for (let i = 0; i < tr.pads.length; i++) if (tr.pads[i].s > this.def.dash) this.padTaken[i] = false;
            this._seen.delete('dash');
            this.skidCount = 0; this._skidHead = 0;
        }
        // the boulder you hit is gone (it went with the car)
        if (W === WreckCause.Boulder)
            for (let i = this.hazards.length - 1; i >= 0; i--) {
                const h = this.hazards[i];
                if (h.kind === HazardKind.Boulder && Math.abs(f32(h.s - s)) < 30 && Math.abs(f32(h.x - this.x)) < 24) this.hazards.splice(i, 1);
            }
        // your lane, unless the works shut it or a boulder sits in it
        let lane = +1;
        const co = tr.coneOff(s);
        if (!Number.isNaN(co) && co < LaneOffset + 10) lane = -1;
        for (const h of this.hazards)
            if (h.kind === HazardKind.Boulder && Math.abs(f32(h.s - s)) < 60 && Math.abs(f32(h.x - tr.laneX(s, lane))) < 16) lane = -lane;
        this.s = s; this.x = tr.laneX(s, lane); this._prevS = s;
        this.maxS = Math.max(this.maxS, s);
        this.v = 0; this.vx = 0; this.bodyAngle = 0;
        this.spinLeft = 0; this.drifting = false; this.driftCooldown = 0; this.airLeft = 0; this.aquaLeft = 0; this.onIce = false; this._iceLeft = 0;
        this.ghostLeft = this.respawnGhost;
        for (let i = this.traffic.length - 1; i >= 0; i--) {
            const t = this.traffic[i];
            if (Math.abs(f32(t.s - s)) < 160 || (t.dir < 0 && t.s > s && f32(t.s - s) < 330)) this.traffic.splice(i, 1);
        }
        this.p = Phase.Racing; this.phaseTime = 0; this.goT = f32(0.8);
        this._say(this.cars <= 1 && !this.mercyActive ? 'LAST CAR!' : 'CARS LEFT ' + this.cars, this.cars <= 1 ? 1 : 0);
        this._emit('newCar', { cars: this.cars });
    }

    // ------------------------------------------------------------------ your car
    _driveCar(dt, input, control) {
        const tr = this.track;
        let steer = 0, throttle = 0;
        let aHeld = false, aPressed = false;
        if (control && input != null) {
            steer = Math.max(-1, Math.min(1, input.x));
            if (Math.abs(steer) < F0_2) steer = 0;
            throttle = input.held(Pad.Up) ? 1 : input.held(Pad.Down) || input.held(Pad.B) ? -1 : 0;
            aHeld = input.held(Pad.A);
            aPressed = input.pressed(Pad.A);
        }
        if (!control) {
            // the tally: roll through the line, then brake; out of time: brake to a stop
            throttle = this.p === Phase.Tally ? (this.phaseTime < 0.8 ? 0 : -1) : -1;
            const want = f32(tr.laneX(f32(this.s + 30), +1) - this.x);
            if (!this.spinning) steer = Math.max(-1, Math.min(1, f32(want / 20)));
        }
        this.throttle = throttle;
        if (this.ghostLeft > 0) this.ghostLeft = Math.max(0, f32(this.ghostLeft - dt));
        if (this.boostLeft > 0) this.boostLeft = Math.max(0, f32(this.boostLeft - dt));
        if (this.aquaLeft > 0) this.aquaLeft = Math.max(0, f32(this.aquaLeft - dt));
        if (this._iceLeft > 0) this._iceLeft = Math.max(0, f32(this._iceLeft - dt));
        this.onIce = this._iceLeft > 0;

        // over a crevasse: no wheel, no gas; the car flies on at its speed
        if (this.airLeft > 0) {
            this.airLeft = f32(this.airLeft - dt);
            this.x = f32(this.x + f32(this.vx * dt)); this.s = f32(this.s + f32(this.v * dt));
            this.maxS = Math.max(this.maxS, this.s);
            this._tallyDistance();
            if (this.airLeft <= 0) this._land();
            return;
        }

        if (this.spinning) {
            this.spinLeft = f32(this.spinLeft - dt);
            if (this.lastSpin === SpinCause.Snow) {
                // ploughed into a snowbank: no spin, the car digs in and stops
                this.v = f32(this.v * f32(Math.exp(-6.0 * dt)));
                this.vx = f32(this.vx * f32(Math.exp(-8.0 * dt)));
                if (this._fxRng.nextDouble() < 0.4) this._puff(Fx.Snow, this.x, this.s, 1, 40);
            } else {
                const spinRate = f32(3 + f32(12 * Math.max(0, f32(this.spinLeft / this.spinSeconds))));
                this.spinAngle = f32(this.spinAngle + f32(spinRate * dt));
                this.v = f32(this.v * f32(Math.exp(-1.6 * dt)));
                this.vx = f32(this.vx * f32(Math.exp(-3.0 * dt)));
            }
            this.x = f32(this.x + f32(this.vx * dt)); this.s = f32(this.s + f32(this.v * dt));
            this._keepNearRoad();
            if (this.lastSpin !== SpinCause.Snow) this._addSkid();
            if (this.spinLeft <= 0) this._recover();
            this.maxS = Math.max(this.maxS, this.s);
            this._tallyDistance();
            return;
        }

        // the drift: a short handbrake while A is held
        if (this.driftCooldown > 0) this.driftCooldown = Math.max(0, f32(this.driftCooldown - dt));
        if (control && !this.drifting && aPressed && this.driftCooldown <= 0 && this.v > 40) {
            this.drifting = true; this.driftTime = 0;
            this._emit('drift');
            this._markHairpin(true);
        }
        if (this.drifting) {
            this.driftTime = f32(this.driftTime + dt);
            if (!control || !aHeld || this.driftTime >= this.driftMax || this.v < 30) { this.drifting = false; this.driftCooldown = this.driftCool; }
            else this._markHairpin(true);
        }

        // speed (on ice the pedals barely bite; a boost pad's turbo pushes harder and higher)
        const bite = this.onIce ? F0_3 : 1;
        const accel = f32(this.accel * (this.boostLeft > 0 ? this.boostAccel : 1));
        if (this.drifting) this.v = f32(this.v - f32(f32(this.driftDecel + (throttle < 0 ? f32(this.brake * 0.5) : 0)) * dt));
        else if (throttle > 0) this.v = f32(this.v + f32(f32(accel * bite) * dt));
        else if (throttle < 0) this.v = f32(this.v - f32(f32(this.brake * bite) * dt));
        else this.v = f32(this.v - f32(this.coast * dt));
        const top = f32(f32(this.vMax * (this.onKerb ? F0_78 : 1)) * (this.boostLeft > 0 ? this.boostTop : 1));
        if (this.v > top) this.v = Math.max(top, f32(this.v - f32(140 * dt)));
        if (this.v < 0) this.v = 0;

        // across (rain takes grip away; on ice or aquaplaning the wheel does nothing)
        // (a crawling car can still turn: at least lowSpeedGrip across once it's rolling)
        if (!this.onIce && this.aquaLeft <= 0) {
            const g = this.gripK;
            const low = f32(this.lowSpeedGrip * Math.min(1, f32(this.v / 25)));
            const cap = this.drifting ? Math.min(Math.max(f32(this.v * this.tanDrift), low), f32(this.gripDrift * g))
                                      : Math.min(Math.max(f32(this.v * f32(this.tanNormal * g)), low), f32(this.gripNormal * g));
            const target = f32(steer * cap);
            const acc = f32(f32((this.drifting ? this.latAccDrift : this.latAcc) * g) * dt);
            if (this.vx < target) this.vx = Math.min(target, f32(this.vx + acc)); else this.vx = Math.max(target, f32(this.vx - acc));
        }

        this.x = f32(this.x + f32(this.vx * dt)); this.s = f32(this.s + f32(this.v * dt));
        this.x = Math.max(HyperDriftScroll.PX0 + 6, Math.min(HyperDriftScroll.PX1 - 6, this.x));

        const travel = f32(Math.atan2(this.vx, Math.max(this.v, 1)));
        const want2 = f32(travel + (this.drifting ? f32(Math.sign(steer !== 0 ? steer : this.vx) * F0_55) : 0));
        const turn = f32(9 * dt);
        this.bodyAngle = f32(this.bodyAngle + Math.max(-turn, Math.min(turn, f32(want2 - this.bodyAngle))));
        if (this.drifting || (this.onIce && Math.abs(this.vx) > 30)) this._addSkid();
        if (this.boostLeft > 0 && this._fxRng.nextDouble() < 0.6) this._puff(Fx.Flame, this.x, f32(this.s - 13), 0, 20);
        this.maxS = Math.max(this.maxS, this.s);
        this._tallyDistance();

        // off the road?
        if (control) {
            const clr = this.clearance(this.x, this.s);
            const why = this._cause;
            this.onKerb = clr < f32(5 * tr.f(this.s)) && why !== SpinCause.Rail;
            if (clr < 0) this._startSpin(why === SpinCause.Road && this.def.terrain === Terrain.Snow ? SpinCause.Snow : why);
        }
    }

    _tallyDistance() {
        const want = Math.trunc(f32(this.maxS / this.pxPerPoint));
        if (want > this._distPoints) { this._addScore(want - this._distPoints); this._distPoints = want; }
    }

    // how far inside the drivable road the car's centre is (px, horizontal); <0 = it has left it.
    // (C#'s `out SpinCause cause` lands in this._cause)
    clearance(x, s) {
        const tr = this.track;
        const f = tr.f(s), c = tr.cx(s);
        const walled = tr.isWalled(s);                      // a bridge's rails, a tunnel's walls
        const allow = walled ? f32((HalfWidth - 3) + Math.min(this.margin, 3)) : f32((HalfWidth + 1) + this.margin);
        let clr = f32(f32(allow * f) - Math.abs(f32(x - c)));
        let cause = walled ? SpinCause.Rail : SpinCause.Road;
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
        this.spinLeft = why === SpinCause.Snow ? this.snowSeconds : this.spinSeconds;
        this.lastSpin = why;
        this.spinAngle = this.bodyAngle;
        this.drifting = false; this.driftCooldown = 0; this.boostLeft = 0;
        this.legSpins++;
        switch (why) {
            case SpinCause.Car: this.spinsCar++; this.v = f32(this.v * F0_3); this.vx = f32(this.vx * F0_3); this._cues.emit(SoundCue.Hit); break;
            case SpinCause.Oil: this.spinsOil++; this.v = f32(this.v * F0_85); this._cues.emit(SoundCue.Miss); break;
            case SpinCause.Cones: this.spinsCones++; this.v = f32(this.v * F0_35); this.vx = f32(f32(-Math.abs(this.vx) * F0_3) - 20); this._cues.emit(SoundCue.Hit); break;
            case SpinCause.Rail: this.spinsRail++; this.v = f32(this.v * F0_4); this.vx = f32(Math.sign(f32(this.track.cx(this.s) - this.x)) * 30); this._cues.emit(SoundCue.Hit); break;
            case SpinCause.Snow:
                this.spinsSnow++; this.v = f32(this.v * F0_4); this.vx = f32(Math.sign(f32(this._nearestLaneX(this.s) - this.x)) * 10);
                for (let i = 0; i < 12; i++) this._puff(Fx.Snow, this.x, this.s, 1, 80);
                this._cues.emit(SoundCue.Miss); break;
            default: this.spinsRoad++; this.v = f32(this.v * F0_4); this.vx = f32(Math.sign(f32(this._nearestLaneX(this.s) - this.x)) * 25); this._cues.emit(SoundCue.Hit); break;
        }
        if (why === SpinCause.Car || why === SpinCause.Rail || why === SpinCause.Cones) {
            this.shake = Math.max(this.shake, F0_2);
            for (let i = 0; i < 6; i++) this._puff(Fx.Spark, this.x, f32(this.s + 8), 1, 110);
        }
        this._emit('spin', { cause: why });
        this._markHairpin(false);
    }

    _recover() {
        this.spinLeft = 0;
        if (this.clearance(this.x, this.s) < 10) this.x = this._nearestLaneX(this.s);
        this.v = 25; this.vx = 0;
        this.bodyAngle = 0;
        this.ghostLeft = this.ghostSeconds;
    }

    _takeOff() {
        this.airTime = this.airLeft = Math.min(f32(0.85), f32(0.42 + f32(this.v / 420)));
        this.drifting = false; this.vx = f32(this.vx * F0_3);
        this.jumps++;
        this._emit('jump');
        for (let i = 0; i < 6; i++) this._puff(Fx.Dust, this.x, f32(this.s - 10), 1, 40);
    }

    _land() {
        this.airLeft = 0;
        this.shake = Math.max(this.shake, f32(0.25));
        for (let i = 0; i < 10; i++) this._puff(Fx.Dust, this.x, this.s, 1, 60);
        this._emit('land');
        if (this.track.isGap(this.s)) this._wreck(WreckCause.Fell);
        else if (this.clearance(this.x, this.s) < 0) this._startSpin(SpinCause.Road);
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

    // ------------------------------------------------------------------ particles (the sim's, so every frame grab sees the same)
    _puff(k, x, s, spread, speed) {
        if (this.fx.length >= FxCap) return;
        const r = this._fxRng;
        const a = f32(r.nextDouble() * Math.PI * 2), sp = f32(speed * f32(0.3 + 0.7 * r.nextDouble()));
        const life = k === Fx.Smoke ? f32(0.9 + 0.6 * r.nextDouble()) : k === Fx.Debris ? f32(0.7 + 0.5 * r.nextDouble()) : k === Fx.Flame ? f32(0.18 + 0.12 * r.nextDouble()) : f32(0.35 + 0.4 * r.nextDouble());
        this.fx.push({
            k, x: f32(x + f32((r.nextDouble() - 0.5) * 6 * spread)), s: f32(s + f32((r.nextDouble() - 0.5) * 6 * spread)),
            vx: f32(Math.cos(a) * sp), vs: k === Fx.Flame ? f32(-30 - 40 * r.nextDouble() + this.v * 0.9) : f32(f32(Math.sin(a) * sp) + (k === Fx.Smoke ? 0 : 0)),
            life, max: life,
        });
    }

    _stepFx(dt) {
        const F = this.fx;
        for (let i = F.length - 1; i >= 0; i--) {
            const p = F[i];
            p.life = f32(p.life - dt);
            if (p.life <= 0) { F[i] = F[F.length - 1]; F.pop(); continue; }
            const damp = p.k === Fx.Smoke ? f32(Math.exp(-2.5 * dt)) : f32(Math.exp(-3.5 * dt));
            p.vx = f32(p.vx * damp); p.vs = f32(p.vs * damp);
            if (p.k === Fx.Smoke) p.vs = f32(p.vs + f32(12 * dt));
            p.x = f32(p.x + f32(p.vx * dt)); p.s = f32(p.s + f32(p.vs * dt));
        }
    }

    // ------------------------------------------------------------------ traffic
    _moveTraffic(dt) {
        const tr = this.track, T = this.traffic, rng = this._rng, L = this.def.traffic;
        if (this.p === Phase.Racing && this.trafficDensity > 0) {
            this._sameTimer = f32(this._sameTimer - dt); this._oncTimer = f32(this._oncTimer - dt);
            if (this._sameTimer <= 0) { this._trySpawn(+1); this._sameTimer = f32(f32(F2_4 + f32(f32(rng.nextDouble()) * F2_2)) / f32(this.trafficDensity * L.same)); }
            if (this._oncTimer <= 0) { this._trySpawn(-1); this._oncTimer = f32(f32(F1_9 + f32(f32(rng.nextDouble()) * 2)) / f32(this.trafficDensity * L.onc)); }
            // the city's taxis: parked at the kerb until you come
            while (this._taxiSpots.length > 0 && f32(this._taxiSpots[0] - this.s) < 420) {
                const s0 = this._taxiSpots.shift();
                if (s0 < f32(this.s + 200)) continue;
                const v = new Vehicle();
                v.id = this._nextId++; v.kind = VehKind.Taxi; v.dir = 1; v.s = s0; v.lane = HalfWidth + 10;
                v.parked = true; v.passed = true; v.baseSpeed = f32(52 + f32(f32(rng.nextDouble()) * 16)); v.speed = 0; v.cur = 0;
                v.x = f32(tr.cx(s0) + f32(v.lane * tr.f(s0)));
                T.push(v);
            }
        }
        for (let i = T.length - 1; i >= 0; i--) {
            const v = T[i];
            const f = tr.f(v.s);
            if (v.parked) {
                // the indicator blinks 0.85 s, then it pulls out into your lane
                if (v.signalT < 0 && f32(v.s - this.s) < 205 && this.p === Phase.Racing) { v.signalT = 0; this._emit('taxi'); }
                if (v.signalT >= 0) {
                    v.signalT = f32(v.signalT + dt);
                    if (v.signalT >= F0_85) {
                        v.passed = false;
                        v.speed = Math.min(v.baseSpeed, f32(v.speed + f32(45 * dt)));
                        v.lane = Math.max(LaneOffset, f32(v.lane - f32(30 * dt)));
                        if (v.lane <= LaneOffset) v.parked = false;
                    }
                }
                v.cur = v.speed;
                v.s = f32(v.s + f32(f32(v.speed / f) * dt));
                v.x = f32(tr.cx(v.s) + f32(v.lane * tr.f(v.s)));
                if (v.s < f32(this.s - 110)) T.splice(i, 1);
                continue;
            }
            let spd = v.speed;
            if (v.dir > 0) {
                // your way: queue at the works taper (their lane is shut), follow whoever is ahead
                const co = tr.coneOff(f32(v.s + 34));
                if (!v.stopped && !Number.isNaN(co) && co < LaneOffset + 10 && v.lane > 0) v.stopped = true;
                if (v.stopped) spd = 0;
                for (const o of T)
                    if (o !== v && o.dir > 0 && !o.parked && o.s > v.s && f32(o.s - v.s) < 44 && Math.abs(f32(o.lane - v.lane)) < 10) spd = Math.min(spd, o.cur);
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
        if (s0 < 420 || s0 > this.checkpoint - 260) return;
        if (this.def.dash > 0 && s0 > this.def.dash - 80) return;              // the dash is the rival's road
        const lane = dir > 0 ? LaneOffset : -LaneOffset;
        if (dir > 0) {
            // nothing your way that you'd catch in the works, a hairpin or on a ramp
            for (const w of tr.works) if (s0 > w.s0 - 380 && s0 < w.s1 + 30) return;
            for (const h of tr.hairpins) if (h.s1 > f32(s0 - 50) && h.s0 < f32(s0 + 250)) return;
            for (const g of tr.gaps) if (g.s1 > f32(s0 - 50) && g.s0 < f32(s0 + 250)) return;
        } else {
            // nothing coming at you inside the works, nor down a hairpin you're about to take
            for (const w of tr.works) if (s0 > w.s0 - 20 && s0 < w.s1 + 60) return;
            for (const h of tr.hairpins) if (h.s1 > this.s && h.s0 < f32(s0 + 150)) return;
            for (const g of tr.gaps) if (g.s1 > this.s && g.s0 < f32(s0 + 60)) return;
        }
        for (const o of this.traffic) if (Math.abs(f32(o.s - s0)) < (o.dir === dir ? 80 : 30) && Math.abs(f32(o.lane - lane)) < 10) return;
        const v = new Vehicle();
        v.id = this._nextId++; v.dir = dir; v.s = s0; v.lane = lane;
        const trucks = this.def.traffic.trucks;
        if (dir > 0) {
            v.kind = rng.nextDouble() < trucks ? VehKind.Truck : VehKind.Car;
            v.baseSpeed = v.truck ? f32(48 + f32(f32(rng.nextDouble()) * 26)) : f32(72 + f32(f32(rng.nextDouble()) * 28));
        } else {
            v.kind = rng.nextDouble() < f32(trucks * 0.36) ? VehKind.Truck : VehKind.Car;
            v.baseSpeed = v.truck ? f32(48 + f32(f32(rng.nextDouble()) * 14)) : f32(58 + f32(f32(rng.nextDouble()) * 30));
        }
        v.speed = v.baseSpeed; v.cur = v.speed;
        v.x = f32(tr.cx(s0) + f32(lane * tr.f(s0)));
        this.traffic.push(v);
    }

    // ------------------------------------------------------------------ the rival (the final leg's dash)
    _spawnRival() {
        const tr = this.track;
        const myLane = this.x > tr.cx(this.s) ? 1 : -1;
        const s = f32(this.s + 26);
        this.rival = {
            id: -1, dir: 1, s, lane: -myLane * LaneOffset, laneTo: -myLane * LaneOffset, x: tr.laneX(s, -myLane),
            v: Math.max(f32(60), this.v), cur: this.v, halfL: 10, halfW: 6, wobble: 0, knockT: 0, knockDir: 0, airLeft: 0, airTime: 0,
        };
        this.rivalAhead = true;
        for (let i = this.traffic.length - 1; i >= 0; i--) if (this.traffic[i].s > f32(this.def.dash - 120)) this.traffic.splice(i, 1);
        this._dashClock = this.clock;
        this._say('THE RIVAL!', 3);
        this._emit('rival');
    }

    _moveRival(dt) {
        const R = this.rival;
        if (R === null) return;
        const tr = this.track;
        // its pace: the road's limit x its nerve; it eases off when well ahead and pushes when behind
        const gap = f32(R.s - this.s);
        let vt = Math.min(f32(f32(this.vMax * this.rivalPace) * 0.8 + 10), f32(f32(tr.vLimit(f32(R.s + 10)) * this.rivalPace) * 0.8));
        if (gap > 110) vt = f32(vt * 0.78);
        else if (gap < -120) vt = Math.min(this.vMax, f32(vt * 1.1));
        if (this.p === Phase.Wreck && this.wreckCause !== WreckCause.Beaten) vt = 0;    // the race waits while your next car comes
        else if (this.p === Phase.Tally) vt = 40;
        if (R.airLeft > 0) {
            R.airLeft = f32(R.airLeft - dt);
        } else if (R.v < vt) R.v = Math.min(vt, f32(R.v + f32(this.accel * dt)));
        else R.v = Math.max(vt, f32(R.v - f32(this.brake * dt)));
        // the jumps: it never misses one
        const prev = R.s;
        R.s = f32(R.s + f32(R.v * dt));
        for (const g of tr.gaps)
            if (prev < g.lip && R.s >= g.lip) {
                R.v = Math.max(R.v, f32(JumpSpeed + 12));
                R.airTime = R.airLeft = Math.min(f32(0.85), f32(0.42 + f32(R.v / 420)));
            }
        // boulders: it changes lane round one in its way
        for (const h of this.hazards)
            if (h.kind === HazardKind.Boulder && h.s > R.s && f32(h.s - R.s) < 120 && Math.abs(f32(f32(h.x - tr.cx(h.s)) / tr.f(h.s) - R.laneTo)) < 12) R.laneTo = -R.laneTo;
        if (R.knockT > 0) {
            R.knockT = f32(R.knockT - dt);
            R.wobble = f32(R.wobble + f32(f32(5 * dt) * R.knockDir));
        } else R.wobble = f32(R.wobble * f32(Math.exp(-4.0 * dt)));
        if (R.lane < R.laneTo) R.lane = Math.min(R.laneTo, f32(R.lane + f32(40 * dt)));
        else if (R.lane > R.laneTo) R.lane = Math.max(R.laneTo, f32(R.lane - f32(40 * dt)));
        R.cur = R.v;
        R.x = f32(tr.cx(R.s) + f32(R.lane * tr.f(R.s)));
        if (this.p !== Phase.Racing) return;
        const ahead = R.s > this.s;
        if (ahead !== this.rivalAhead) {
            this.rivalAhead = ahead;
            this._say(ahead ? 'THE RIVAL LEADS' : 'YOU LEAD!', ahead ? 3 : 2);
            this._emit('rivalPass', { lead: !ahead });
        }
        if (R.s >= this.checkpoint && this.s < this.checkpoint) this._wreck(WreckCause.Beaten);
    }

    // ------------------------------------------------------------------ rockfalls: a shadow grows, the rock lands and stays
    _stepRocks(dt) {
        for (const r of this.rocks) {
            if (r.state === 0) {
                if (f32(r.s - this.s) < 300) { r.state = 1; r.t = 0; this._emit('rockWarn'); }
            } else if (r.state === 1) {
                r.t = f32(r.t + dt);
                if (r.t >= RockFall) {
                    r.state = 2;
                    this.hazards.push(new Hazard(HazardKind.Boulder, r.s, r.x));
                    this.hazards.sort((a, b) => a.s < b.s ? -1 : a.s > b.s ? 1 : 0);
                    this.shake = Math.max(this.shake, f32(0.3));
                    for (let i = 0; i < 12; i++) this._puff(Fx.Dust, r.x, r.s, 2, 70);
                    this._emit('rockLand');
                    if (!this.airborne && this.ghostLeft <= 0 && Math.abs(f32(r.x - this.x)) < 12 && Math.abs(f32(r.s - this.s)) < 14) this._wreck(WreckCause.Rockfall);
                }
            }
        }
    }

    // ------------------------------------------------------------------ contacts, passes, pads, the hairpin bonus
    _contacts() {
        if (this.spinning || this.airborne) return;
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
                    // nose to nose with one coming the other way, fast: that car is gone, and so is yours
                    if (v.dir < 0 && f32(this.v + v.cur) >= this.wreckClosing) { this._wreck(WreckCause.HeadOn); return; }
                    this._startSpin(SpinCause.Car);
                    return;
                }
            }
            const R = this.rival;
            if (R !== null && R.airLeft <= 0 && R.knockT <= 0 && Math.abs(f32(X - R.x)) < 17 && Math.abs(f32(S - R.s)) < 20) {
                R.knockT = F0_45; R.knockDir = Math.sign(f32(R.x - X)) || 1; R.v = f32(R.v * F0_85);
                this._startSpin(SpinCause.Car);
                return;
            }
            for (const o of this.hazards) {
                if (Math.abs(f32(o.s - S)) > 24) continue;
                const ex = f32(f32(X - o.x) / (o.rx + 2)), es = f32(f32(S - o.s) / (o.rs + 7));
                if (f32(f32(ex * ex) + f32(es * es)) > 1) continue;
                switch (o.kind) {
                    case HazardKind.Oil: this._startSpin(SpinCause.Oil); return;
                    case HazardKind.Puddle:
                        if (this.aquaLeft <= 0) {
                            this.aquaLeft = this.aquaSeconds; this.v = f32(this.v * F0_85 + 10);
                            for (let i = 0; i < 10; i++) this._puff(Fx.Water, X, S, 2, 70);
                            this._emit('splash');
                        }
                        break;
                    case HazardKind.Ice:
                        if (this._iceLeft <= 0) this._emit('ice');
                        this._iceLeft = f32(0.3);
                        this.onIce = true;
                        break;
                    default:
                        if (this.v > 45) { this._wreck(WreckCause.Boulder); return; }
                        this.v = 0; this._startSpin(SpinCause.Car); return;
                }
            }
        }
        // boost pads (a ghost can take one too)
        for (let i = 0; i < tr.pads.length; i++) {
            const p = tr.pads[i];
            if (this.padTaken[i] || Math.abs(f32(p.s - S)) > 10 || Math.abs(f32(p.x - X)) > 13) continue;
            this.padTaken[i] = true;
            this.boostLeft = this.boostSeconds;
            this.boosts++;
            this._addScore(this.padPoints);
            this.popups.push({ text: 'BOOST', x: X, s: f32(S + 18), t: this._time, big: false });
            this._emit('boost');
        }
        for (const v of this.traffic)
            if (v.dir > 0 && !v.passed && S > f32(f32(v.s + v.halfL) + 12)) {
                v.passed = true;
                if (!v.hit) {
                    const pts = this.passPoints * this.legNo;
                    this.passes++; this.legPasses++; this._addScore(pts); this._cues.emit(SoundCue.Bonus);
                    this.popups.push({ text: String(pts), x: v.x, s: f32(v.s + 10), t: this._time, big: false });
                    this._emit('pass', { n: this.legPasses });
                }
            }
        for (const h of tr.hairpins)
            if (!this._hpDone[h.index] && S > h.s1) {
                this._hpDone[h.index] = true;
                this.hairpinsSeen++;
                if (this._hpDrifted[h.index] && !this._hpSpoiled[h.index]) {
                    const pts = this.driftPoints * this.legNo;
                    this.hairpinDrifts++; this.legDrifts++; this._addScore(pts); this._cues.emit(SoundCue.Bonus);
                    this.popups.push({ text: 'DRIFT ' + pts, x: X, s: f32(S + 20), t: this._time, big: true });
                    this._emit('hairpin', { n: this.legDrifts });
                }
            }
    }

    _landmarks() {
        const tr = this.track, S = this.s, def = this.def;
        // the crevasses: over the lip fast enough and you fly; too slow (or spinning) and you fall
        if (!this.airborne)
            for (const g of tr.gaps)
                if (this._prevS < g.lip && S >= g.lip) {
                    if (this.v >= JumpSpeed && !this.spinning) this._takeOff();
                    else { this._wreck(WreckCause.Fell); return; }
                }
        if (!this.extendDone && S >= def.extend) {
            this.extendDone = true;
            const add = f32(def.extendTime * this.clockK);
            this.clock = f32(this.clock + add);
            this._addScore(this.extendPoints);
            if (def.dash > 0) this._say('FINAL DASH  +' + roundEven(add) + ' SEC', 3);
            else this._say('EXTENDED TIME  +' + roundEven(add) + ' SEC', 2);
            this.popups.push({ text: '+' + roundEven(add) + ' SEC', x: this.x, s: f32(S + 24), t: this._time, big: true });
            this._emit('extend');
        }
        if (def.dash > 0 && S >= def.dash && !this._seen.has('dash')) { this._seen.add('dash'); this._spawnRival(); }
        const z = (key, kind) => { if (!this._seen.has(key)) { this._seen.add(key); this._emit(kind); } };
        for (const t of tr.tunnels) if (t.contains(S)) z('tunnel' + t.index, 'tunnel');
        for (const b of tr.bridges) if (b.contains(S)) z('bridge' + b.index, 'bridge');
        for (const w of tr.works) if (w.contains(S)) z('works' + w.index, 'works');
        if (tr.fork !== null && tr.hasFork(f32(S + 40))) z('fork', 'fork');
    }

    // ------------------------------------------------------------------ stats
    collectStats(into) {
        add(into, 'legs', this.legsCleared);
        add(into, 'spins', this.spins);
        add(into, 'spinCar', this.spinsCar);
        add(into, 'spinRoad', this.spinsRoad);
        add(into, 'spinOil', this.spinsOil);
        add(into, 'spinRail', this.spinsRail);
        add(into, 'spinSnow', this.spinsSnow);
        add(into, 'wrecks', this.wrecks);
        add(into, 'wHeadOn', this.wrecksHeadOn);
        add(into, 'wBoulder', this.wrecksBoulder);
        add(into, 'wRock', this.wrecksRock);
        add(into, 'wFell', this.wrecksFell);
        add(into, 'wBeaten', this.beaten);
        add(into, 'timeOuts', this.timeOuts);
        add(into, 'passes', this.passes);
        add(into, 'hairpinDrifts', this.hairpinDrifts);
        add(into, 'boosts', this.boosts);
        add(into, 'extraCars', this.extraCars);
        add(into, 'progress', this.progress);
    }
}

const RockFall = f32(1.2);              // seconds from the shadow to the landing

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

HyperDriftSim.Phase = Phase;
HyperDriftSim.SpinCause = SpinCause;
HyperDriftSim.WreckCause = WreckCause;
HyperDriftSim.HazardKind = HazardKind;
HyperDriftSim.VehKind = VehKind;
HyperDriftSim.Fx = Fx;
HyperDriftSim.RockFall = RockFall;
HyperDriftSim.SkidCap = SkidCap;
