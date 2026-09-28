// THE NODE · world 1 · SUNSET DRIVE on the Cabinet Engine · THE ROUND (ICabinetSim).
//
// A ROUND = one run from the start gantry to the GOAL arch before the clock runs out.
//   countdown  the START gantry's lamps: 3 red, then green (Tick Tick Tick Start). The grid cars wait.
//   drive      stage 1 (PALM COAST) > CHECKPOINT (EXTENDED TIME) > the FORK (the side of the median you
//              are on is your road) > stage 2 (CANYON RUN or VISTA HILLS) > CHECKPOINT > stage 3 (SUNSET
//              BAY) > GOAL. The sun sets as you go.
//   finish     over the goal line the car rolls to a stop (Win), or at 0 s the clock stops the car (Die)
//   card       the result, the score, the route; then Over
// WIN = reach the goal. LOSE = the time runs out. Crashes never end a round: they cost the time the car
// spends tumbling plus the climb back to speed.
//
// Driving: stick left/right steers (the car slides toward the outside of a bend, more the faster you go),
// A or stick UP = gas, B or stick DOWN = brake. Two-speed automatic (LOW to about 165 km/h, then HIGH).
// Off the road the sand/grass holds you under about 110 km/h. Roadside things and a hard rear-ending
// are crashes (the car tumbles); a soft touch on a car is a bump (speed lost, sparks).
//
// MERCY (spec.js knobs, eased per round lost on this cabinet): a longer start clock and bigger extensions,
// less traffic, a lighter pull in the bends, shorter tumbles, softer rear-endings. CREDIT 5 cannot be
// lost (credit.unlosable): the clock is off (FREE DRIVE), the traffic is thin, and whenever the player's
// hands leave the stick the car steers itself (and with no pedal either, it cruises by itself).
//
// Cues (the SDK's eight): Tick = countdown and the last five seconds, Start = GO, Hit = crash or bump,
// Miss = a skid starting, Bonus = checkpoint, Win = the goal line, Die = time up. The engine is a loop the
// host pitches from `engineRpm` (0..1) and `speedKmh`. `sfx` also lists this step's game-level names
// ('engine' is continuous and not listed): 'go' 'skid' 'crash' 'bump' 'checkpoint' 'goal' 'timeup' 'shift' 'beep'.
import { CabinetState, RoundResult, SoundCue, CueBuffer, Pad, SystemRandom, fmt } from '../../sdk/index.js';
import { SEG, CAR_Z, MAXS, KMH, CAR_HALF, CAR_LEN, DRAW, Ter } from './constants.js';
import { Course, segAt, roadAt } from './course.js';
import { Art } from './art.js';

const Phase = Object.freeze({ Idle: 0, Countdown: 1, Running: 2, Finish: 3, TimeUp: 4, Card: 5, Over: 6 });

// the car
const ACC_LO = 0.34, ACC_HI = 0.12, SHIFT = 0.56;    // fractions of top speed per second
const COAST = 0.10, BRAKE = 0.80, OFF_MAX = 0.38, OFF_DRAG = 0.75;
const STEER = 2.15;                                  // road half-widths per second at full lock
const CF = 0.44;                                     // centrifugal pull per unit of curve at top speed
const CLAMP = 2.55;                                  // how far off the road the car can wander

const START_SEG = 12.6;                              // the back of the grid; the START line is at segment 30
const LANES = [-0.62, 0, 0.62];

export class SunsetRound {
    constructor() {
        this.countStep = 0.85;
        this.goalBeat = 3.2;
        this.timeUpBeat = 3.0;
        this.cardSeconds = 4.0;
        this.checkpointBonus = 3000;
        this.passBonus = 300;

        this._cues = new CueBuffer();
        this.sfx = [];
        this.p = Phase.Idle;
        this._result = RoundResult.None;
        this._time = 0;
        this.credit = null;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Countdown: return CabinetState.Intro;
            case Phase.Running: return CabinetState.Playing;
            case Phase.Finish: case Phase.TimeUp: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this.scoreBase + Math.floor(this.scoreF); }
    get lives() { return 1; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const route = this.branch === 0 ? '-' : this.branch < 0 ? 'canyon' : 'hills';
        return r + ' score ' + this.score + ' ' + fmt(this._time, 1) + 's stage ' + (this.stage + 1) + ' route ' + route +
            ' left ' + fmt(Math.max(0, this.timeLeft), 1) + 's crashes ' + this.stats.crashes + ' bumps ' + this.stats.bumps +
            ' passed ' + this.stats.passed + ' km ' + fmt(this.playerZ / 100000, 2);
    }

    // ------------------------------------------------------------------ setup
    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.seed = seed | 0;
        this.timeStart = k.get('timeStart', 46);
        this.extend1 = k.get('extend1', 42);
        this.extend2 = k.get('extend2', 32);
        this.density = k.get('traffic', 1);
        this.grip = k.get('grip', 1);
        this.crashSeconds = k.get('crashSeconds', 2.6);
        this.crashRel = k.get('crashRel', 0.4);
        this.assist = credit.unlosable || k.get('assist', 0) > 0.5;

        this.track = Course.tracks[-1];              // the prefix is shared: either track draws the same
        this.branch = 0;
        this.roadIdx = 0;
        this.pos = START_SEG * SEG - CAR_Z;
        this.x = 0; this.speed = 0; this.steerV = 0; this.lean = 0;
        this.gas = false; this.braking = false; this.gear = 0; this.engineRpm = 0; this.rev = 0;
        this.offroad = false; this.skid = 0; this._skidOn = false; this._skidCue = -9;
        this.crash = null; this.invulnUntil = 0; this.bumpAt = -9; this.bumpSide = 0;
        this.smoke = []; this._smokeT = 0; this.sparks = [];
        this.bgX = 0;                               // the parallax heading (the layers slide as the road bends)
        this.bgX0 = 0;                              // the heading when SUNSET BAY began (its skyline is anchored there)

        this.timeLeft = credit.unlosable ? 99 : this.timeStart;
        this.scoreF = 0; this.scoreBase = 0;
        this.stage = 0; this.cp1 = false; this.tip = false; this.cp2 = false; this.goal = false;
        this.forkWarned = false;
        this.msg = null;
        this.skyFrom = Ter.Coast; this.skyTo = Ter.Coast; this.skyT0 = -99;
        this.lastBonus = 0; this.goalBonus = 0;
        this.countdown = 3; this.lights = 0;

        this.stats = { crashes: 0, crashCar: 0, cp1Sec: 0, cp2Sec: 0, bumps: 0, passed: 0, offroadSec: 0, stage: 1, route: 0, finishSec: 0, timeLeftAtGoal: 0, topKmh: 0 };
        this.cars = [];
        this._spawnT = 0;
        this._gridCars();
        this._prefill();

        this._time = 0; this.phaseTime = 0;
        this._result = RoundResult.None;
        this._cues.resetTotals(); this.sfx = [];
        this.p = Phase.Countdown;
        this._emit(SoundCue.Tick, 'beep');
    }

    get playerZ() { return this.pos + CAR_Z; }
    get speedKmh() { return Math.round(this.speed / MAXS * KMH); }
    get progress() { return Math.min(1, this.playerZ / this.track.goalZ); }
    get roadCentre() { return roadAt(this.track, this.roadIdx, this.playerZ); }
    get ter() { return this.track.stageTer[this.stage]; }

    _emit(cue, name) { if (cue !== null) this._cues.emit(cue); if (name) this.sfx.push(name); }

    // ------------------------------------------------------------------ the step
    step(dt, input) {
        this.sfx = [];
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (!(dt > 0)) return;
        this._time += dt;
        this.phaseTime += dt;

        switch (this.p) {
            case Phase.Countdown: {
                const gas = input != null && (input.held(Pad.A) || input.held(Pad.Up));
                this.rev += ((gas ? 1 : 0.15) - this.rev) * Math.min(1, dt * 6);
                this.engineRpm = this.rev * 0.8;
                const lit = Math.min(4, 1 + Math.floor(this.phaseTime / this.countStep));
                if (lit !== this.lights) {
                    this.lights = lit;
                    if (lit < 4) { this.countdown = 4 - lit; this._emit(SoundCue.Tick, 'beep'); }
                }
                if (this.phaseTime >= this.countStep * 3) {
                    this.lights = 4; this.countdown = 0;
                    this.p = Phase.Running; this.phaseTime = 0;
                    this._emit(SoundCue.Start, 'go');
                    this._say('go');
                    for (const c of this.cars) c.wait = false;
                }
                break;
            }
            case Phase.Running: {
                this._drive(dt, input, 0);
                if (!this.mercyActive) {
                    const before = this.timeLeft;
                    this.timeLeft -= dt;
                    const sec = Math.ceil(this.timeLeft);
                    if (sec <= 5 && sec >= 1 && sec < Math.ceil(before)) this._emit(SoundCue.Tick, 'beep');
                }
                this._events();
                if (this.goal) {
                    this.p = Phase.Finish; this.phaseTime = 0;
                    this.goalBonus = this.mercyActive ? 5000 : Math.ceil(Math.max(0, this.timeLeft)) * 1000;
                    this.scoreBase += this.goalBonus;
                    this.stats.finishSec = this._time; this.stats.timeLeftAtGoal = Math.max(0, this.timeLeft);
                    this._emit(SoundCue.Win, 'goal');
                    this._say('goal');
                } else if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this.p = Phase.TimeUp; this.phaseTime = 0;
                    this._emit(SoundCue.Die, 'timeup');
                    this._say('timeup');
                }
                break;
            }
            case Phase.Finish:
                this._drive(dt, null, 1);
                if (this.phaseTime >= this.goalBeat) { this._result = RoundResult.Won; this.p = Phase.Card; this.phaseTime = 0; }
                break;
            case Phase.TimeUp:
                this._drive(dt, null, 2);
                if (this.phaseTime >= this.timeUpBeat) { this._result = RoundResult.Lost; this.p = Phase.Card; this.phaseTime = 0; }
                break;
            case Phase.Card:
                this._drive(dt, null, 2);
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
        this._traffic(dt);
        this.stats.stage = this.stage + 1;
    }

    _say(id, a = 0, b = '') { this.msg = { id, t0: this._time, a, b }; }

    // mode 0 = the player (or the mercy autopilot), 1 = rolling to a stop after the goal, 2 = the clock stopped the car
    _drive(dt, input, mode) {
        const tr = this.track;
        let steer = 0, gas = false, brake = false, hands = false;
        if (mode === 0 && input != null) {
            const sx = input.x;
            steer = sx > 0.2 || sx < -0.2 ? Math.max(-1, Math.min(1, sx)) : 0;
            gas = input.held(Pad.A) || input.held(Pad.Up);
            brake = input.held(Pad.B) || input.held(Pad.Down);
            hands = steer !== 0 || gas || brake;
            if (this.assist && steer === 0) steer = this.suggestSteer();
            if (this.assist && !hands) gas = this.speed < MAXS * 0.78;
        } else if (mode === 1) {
            steer = this.suggestSteer() * 0.6;
            brake = this.speed > MAXS * 0.05;
        } else if (mode === 2) {
            steer = this.suggestSteer() * 0.5;
        }
        this.gas = gas && !brake; this.braking = brake && this.speed > 1;

        const z0 = this.playerZ;
        if (this.crash) this._tumble(dt);
        else {
            let sp = this.speed / MAXS;
            // pedals (a two-speed automatic)
            if (brake) sp -= BRAKE * dt;
            else if (gas) sp += (sp < SHIFT ? ACC_LO : ACC_HI * Math.max(0.15, (1.04 - sp) / (1.04 - SHIFT))) * dt;
            else sp -= (mode === 2 ? 0.28 : COAST) * dt;
            // off the road: the sand drags you down
            const c = roadAt(tr, this.roadIdx, z0);
            this.offroad = !this._onRoad(z0);
            if (this.offroad && sp > OFF_MAX) sp = Math.max(OFF_MAX, sp - OFF_DRAG * dt);
            if (this.offroad && sp > 0.05) this.stats.offroadSec += dt;
            sp = Math.max(0, Math.min(1, sp));
            const gear = sp >= SHIFT ? 1 : 0;
            if (gear !== this.gear) { this.gear = gear; if (gear === 1) this.sfx.push('shift'); }
            this.speed = sp * MAXS;
            // steering against the pull of the bend
            const want = steer * STEER * Math.min(1, sp * 2.6);
            this.steerV += (want - this.steerV) * Math.min(1, dt * 11);
            const curve = segAt(tr, z0).curve;
            this.bgX += curve * sp * dt * 14;
            const pull = curve * sp * sp * CF * this.grip;
            this.x += (this.steerV - pull) * dt;
            // skid: the tyres fight a hard pull
            const skid = sp > 0.5 && Math.abs(pull) > 0.95 && Math.abs(this.steerV) > 1.0 && Math.sign(this.steerV) === Math.sign(pull) ? Math.min(1, (Math.abs(pull) - 0.8) * 1.6) : 0;
            this.skid = skid;
            if (skid > 0 && !this._skidOn && this._time - this._skidCue > 0.7) { this._emit(SoundCue.Miss, 'skid'); this._skidCue = this._time; }
            this._skidOn = skid > 0;
            this.lean += ((steer * 2 + (this.steerV - pull) * 0.25) - this.lean) * Math.min(1, dt * 8);
            if (Math.abs(c - this.x) > CLAMP) this.x = c + Math.sign(this.x - c) * CLAMP;
            this.engineRpm = gear === 0 ? 0.25 + 0.75 * sp / SHIFT : 0.45 + 0.55 * (sp - SHIFT) / (1 - SHIFT);
        }
        this.stats.topKmh = Math.max(this.stats.topKmh, this.speedKmh);

        // move, and let the road carry the car sideways where it bends apart (the fork)
        this.pos += this.speed * dt;
        const z1 = this.playerZ;
        this.x += roadAt(tr, this.roadIdx, z1) - roadAt(tr, this.roadIdx, z0);
        this._pickRoad(z1);
        if (mode === 0) this.scoreF += this.speedKmh * dt * 3;
        if (!this.crash) this._hitRoadside(z0, z1);
        this._puffs(dt);
    }

    _onRoad(z) {
        const tr = this.track, s = segAt(tr, z);
        for (let k = 0; k < s.n; k++) {
            if (k === s.gh) continue;
            if (Math.abs(this.x - roadAt(tr, k, z)) <= 1.0) return true;
        }
        return false;
    }

    // before the fork tip the nearest road is yours; after it, the one you chose
    _pickRoad(z) {
        const tr = this.track, s = segAt(tr, z);
        if (this.tip) { this.roadIdx = tr.mainIdx; return; }
        if (s.n === 2) this.roadIdx = this.x < (roadAt(tr, 0, z) + roadAt(tr, 1, z)) / 2 ? 0 : 1;
        else this.roadIdx = 0;
    }

    _hitRoadside(z0, z1) {
        const tr = this.track, i0 = segAt(tr, z0).i, i1 = segAt(tr, z1).i;
        for (let i = i0; i <= i1; i++) {
            const s = tr.segs[i];
            for (const o of s.sprites) {
                const k = Art.K[o.k];
                if (k.coll <= 0) continue;
                if (Math.abs(o.x - this.x) < k.coll + CAR_HALF * 0.8) {
                    if (this.speed > MAXS * 0.22) { this._startCrash(o.x); return; }
                    // a slow touch: the car stops against it
                    this.speed = 0; this.x += Math.sign(this.x - o.x || 1) * 0.05;
                    this.bumpAt = this._time; this.bumpSide = Math.sign(o.x - this.x);
                    return;
                }
            }
        }
    }

    // kind 0: something at the roadside (the full tumble); 1: a car (a shorter, lower roll)
    _startCrash(hitX, kind = 0) {
        const tr = this.track, z = this.playerZ;
        const c = roadAt(tr, this.roadIdx, z);
        const d = Math.max(-0.55, Math.min(0.55, this.x - c));
        this.crash = { t: 0, kind, dur: this.crashSeconds * (kind === 1 ? 0.68 : 1), d0: this.x - c, d1: d, x1: c + d, roll: this.x > hitX ? 1 : -1, v0: this.speed, t0: this._time, seed: (this.seed ^ Math.imul(this.stats.crashes + 1, 0x9E3779B1)) | 0 };
        this.sparks.push({ t0: this._time, seed: this.crash.seed, big: true });
        if (this.sparks.length > 6) this.sparks.shift();
        this.stats.crashes++;
        this.skid = 0; this.steerV = 0;
        this._emit(SoundCue.Hit, 'crash');
    }

    _tumble(dt) {
        const k = this.crash;
        k.t += dt;
        const u = Math.min(1, k.t / k.dur);
        this.speed = k.v0 * Math.max(0, 1 - u * 1.6) * 0.55;
        const s = u * u * (3 - 2 * u);
        this.x = roadAt(this.track, this.roadIdx, this.playerZ) + k.d0 + (k.d1 - k.d0) * s;
        this.lean = 0; this.engineRpm = 0.2; this.offroad = false;
        if (k.t >= k.dur) {
            this.x = roadAt(this.track, this.roadIdx, this.playerZ) + k.d1;
            this.crash = null; this.speed = 0; this.steerV = 0;
            this.invulnUntil = this._time + 1.2;
        }
    }

    _puffs(dt) {
        this._smokeT -= dt;
        const sp = this.speed / MAXS;
        let kind = -1;
        if (this.crash && this.crash.t < this.crash.dur * 0.7) kind = 2;
        else if (this.offroad && sp > 0.12) kind = 1;
        else if (this.skid > 0) kind = 0;
        if (kind < 0 || this._smokeT > 0) return;
        this._smokeT = kind === 2 ? 0.05 : 0.045;
        const side = (this.smoke.length & 1) ? 1 : -1;
        this.smoke.push({ t0: this._time, x: this.x + side * CAR_HALF * (kind === 2 ? 0.3 : 0.8), z: this.playerZ - (kind === 2 ? 60 : 130), kind, ter: this.ter, side });
        if (this.smoke.length > 40) this.smoke.shift();
    }

    // ------------------------------------------------------------------ the course's events
    _events() {
        const tr = this.track, z = this.playerZ;
        if (this.cp1 && !this.tip && !this.forkWarned && this.msg && this._time - this.msg.t0 > 1.8) { this.forkWarned = true; this._say('fork'); }
        if (!this.cp1 && z >= tr.cp1Z) { this.cp1 = true; this.stats.cp1Sec = this._time; this._checkpoint(); }
        if (!this.tip && z >= tr.tipZ) {
            // the side of the median you are on is your road
            const mid = (roadAt(tr, 0, z) + roadAt(tr, 1, z)) / 2;
            this.branch = this.x < mid ? -1 : 1;
            this.track = Course.tracks[this.branch];
            this.tip = true; this.roadIdx = this.track.mainIdx;
            this.stats.route = this.branch;
            this.stage = 1;
            this._sky(this.track.stageTer[1]);
            this._say('stage', 2, this.track.stageName[1]);
        }
        if (this.tip && !this.cp2 && z >= this.track.cp2Z) { this.cp2 = true; this.stage = 2; this.stats.cp2Sec = this._time; this.bgX0 = this.bgX; this._checkpoint(); this._sky(Ter.Bay); }
        if (this.tip && !this.goal && z >= this.track.goalZ) this.goal = true;
    }

    _checkpoint() {
        const ext = this.cp2 ? this.extend2 : this.extend1;
        if (!this.mercyActive) this.timeLeft += ext;
        this.lastBonus = ext;
        this.scoreBase += this.checkpointBonus;
        this._emit(SoundCue.Bonus, 'checkpoint');
        this._say('cp', Math.round(ext), this.cp2 ? this.track.stageName[2] : '');
    }

    _sky(ter) { this.skyFrom = this.skyTo; this.skyTo = ter; this.skyT0 = this._time; }

    // ------------------------------------------------------------------ traffic
    _gridCars() {
        const pz = this.playerZ;
        const grid = [[-0.62, 3.4], [0.62, 3.4], [-0.62, 8.2], [0.62, 8.2]];
        for (let g = 0; g < grid.length; g++) {
            const kind = Art.CARS[(this.rng.next(6)) % 6];          // sedans on the grid
            const cruise = MAXS * (0.5 + this.rng.nextDouble() * 0.1);
            this.cars.push({ k: kind.id, z: pz + grid[g][1] * SEG, lane: grid[g][0], lo: grid[g][0], road: 0, speed: 0, cruise, wait: true, accel: MAXS * (0.14 + this.rng.nextDouble() * 0.06), decided: false, passed: false, weave: false, laneT: 0 });
        }
    }

    _want() {
        const base = [6, 4, 7, 6][this.ter];
        return Math.max(1, Math.round(base * this.density));
    }

    _prefill() {
        const n = this._want(), pz = this.playerZ;
        for (let i = 0; i < n; i++) this._spawn(pz + (30 + (DRAW - 30) * (i + 0.5) / n) * SEG);
    }

    _spawn(z) {
        const tr = this.track;
        if (z > tr.segs.length * SEG - (DRAW + 40) * SEG) return false;
        if (!this.tip && z > tr.forkEndZ - 20 * SEG) return false;
        if (z > tr.tipZ - 60 * SEG && z < tr.tipZ + 24 * SEG) return false;
        if (this.tip && z > tr.goalZ - 30 * SEG) return false;
        const r = this.rng;
        const u = r.nextDouble();
        const pool = Art.CARS, idx = u < 0.45 ? r.next(6) : u < 0.7 ? 6 + r.next(4) : u < 0.88 ? 10 + r.next(3) : 13 + r.next(3);
        const kind = pool[idx];
        let lane = LANES[r.next(3)];
        const s = segAt(tr, z);
        let road = this.tip ? tr.mainIdx : 0, decided = false;
        if (s.n === 2 && s.gh < 0 && !this.tip) { road = r.nextDouble() < 0.5 ? 0 : 1; decided = true; }
        // keep a gap to cars already in that lane
        for (const c of this.cars) if (Math.abs(c.z - z) < 7 * SEG && Math.abs(c.lo - lane) < 0.3 && c.road === road) return false;
        const cruise = MAXS * (kind.speedLo + r.nextDouble() * (kind.speedHi - kind.speedLo));
        this.cars.push({ k: kind.id, z, lane, lo: lane, road, speed: cruise, cruise, wait: false, accel: MAXS * 0.2, decided, passed: false, weave: r.nextDouble() < 0.25, laneT: 2 + r.nextDouble() * 4 });
        return true;
    }

    _traffic(dt) {
        const tr = this.track, pz = this.playerZ, r = this.rng;
        const running = this.p !== Phase.Countdown;
        for (const c of this.cars) {
            if (c.wait) { c.x = roadAt(tr, c.road, c.z) + c.lo; continue; }
            if (c.speed < c.cruise) c.speed = Math.min(c.cruise, c.speed + c.accel * dt);
            c.z += c.speed * dt;
            if (!c.decided && !this.tip) {
                const s = segAt(tr, c.z);
                if (s.n === 2 && s.r1 - s.r0 > 0.05) { c.road = r.nextDouble() < 0.5 ? 0 : 1; c.decided = true; }
            }
            if (c.weave && running) {
                c.laneT -= dt;
                if (c.laneT <= 0) {
                    c.laneT = 3 + r.nextDouble() * 4;
                    const li = LANES.indexOf(c.lane);
                    c.lane = LANES[Math.max(0, Math.min(2, li + (r.nextDouble() < 0.5 ? -1 : 1)))];
                }
                const d = c.lane - c.lo, st = 0.45 * dt;
                c.lo += Math.abs(d) < st ? d : Math.sign(d) * st;
            }
            // do not drive through the car in front: take its speed
            for (const o of this.cars) {
                if (o === c || o.road !== c.road || o.z <= c.z || o.z - c.z > 3 * SEG || Math.abs(o.lo - c.lo) > 0.4) continue;
                if (o.speed < c.speed) c.speed = o.speed;
            }
            c.x = roadAt(tr, c.road, c.z) + c.lo;
        }
        // retire the ones far behind, off on the other road, or past the end
        this.cars = this.cars.filter(c => {
            if (c.z < pz - 14 * SEG) return false;
            if (this.tip && c.road !== tr.mainIdx && c.z > tr.forkEndZ + 90 * SEG) return false;
            if (this.tip && c.road !== tr.mainIdx && c.z < pz - 2 * SEG) return false;
            if (c.z > tr.segs.length * SEG - (DRAW + 8) * SEG) return false;
            return true;
        });
        // overtakes, and the cars you hit
        const mine = this.crash == null && this._time >= this.invulnUntil && this.p !== Phase.Countdown;
        for (const c of this.cars) {
            if (c.x === undefined) c.x = roadAt(tr, c.road, c.z) + c.lo;
            const k = Art.CARS[c.k];
            if (!c.passed && c.z < pz - CAR_LEN && c.road === this.roadIdx) {
                c.passed = true;
                if (this.p === Phase.Running) { this.stats.passed++; this.scoreBase += this.passBonus; }
            }
            if (!mine) continue;
            const dz = c.z - pz, dx = c.x - this.x;
            if (Math.abs(dz) > CAR_LEN * 0.9 || Math.abs(dx) > k.coll + CAR_HALF * 0.8) continue;
            if (this.speed > c.speed + MAXS * 0.02) {
                const rel = (this.speed - c.speed) / MAXS;
                if (rel > this.crashRel) { this._startCrash(c.x, 1); this.stats.crashCar++; break; }
                this.speed = c.speed * 0.72;
                this.pos -= Math.max(0, CAR_LEN * 0.9 - dz) * 0.6;
                this.x -= Math.sign(dx || 1) * 0.07;
                this.bumpAt = this._time; this.bumpSide = Math.sign(dx);
                this.sparks.push({ t0: this._time, seed: (this.seed ^ Math.imul(this.stats.bumps + 7, 0x85EBCA6B)) | 0, big: false });
                if (this.sparks.length > 6) this.sparks.shift();
                this.stats.bumps++;
                this._emit(SoundCue.Hit, 'bump');
            } else {
                this.x = c.x - Math.sign(dx || 1) * (k.coll + CAR_HALF * 0.81);
                this.speed *= 0.97;
            }
        }
        // new traffic at the far end of the view
        if (running) {
            this._spawnT -= dt;
            if (this._spawnT <= 0) {
                let ahead = 0;
                for (const c of this.cars) if (c.z > pz && c.road === (this.tip ? tr.mainIdx : c.road)) ahead++;
                if (ahead < this._want()) this._spawn(pz + (DRAW - r.nextDouble() * 10) * SEG);
                this._spawnT = 0.25 + r.nextDouble() * 0.4;
            }
        }
    }

    // ------------------------------------------------------------------ helpers the bot and the autopilot read
    // how far ahead (segments) the lane around x is free of traffic, up to `range`
    clearAhead(x, range = 40, halfW = 0.42) {
        const pz = this.playerZ;
        let best = range;
        for (const c of this.cars) {
            const dz = (c.z - pz) / SEG;
            if (dz < -1 || dz > range) continue;
            const k = Art.CARS[c.k];
            // where it will be when we get there (it moves too): only the closing speed matters
            if (Math.abs(c.x - x) < k.coll + halfW) best = Math.min(best, Math.max(0, dz));
        }
        return best;
    }

    // the stick the autopilot would hold: toward a free lane of your road, leaning into the bend
    suggestSteer() {
        const tr = this.track, z = this.playerZ, sp = this.speed / MAXS;
        const look = z + (8 + sp * 14) * SEG;
        const c = roadAt(tr, this.roadIdx, z);                  // x is measured from the road here
        let target = c, best = -1;
        for (const l of LANES) {
            const clear = this.clearAhead(c + l, 28);
            const score = clear * 10 - Math.abs(c + l - this.x) * 6;
            if (score > best) { best = score; target = c + l; }
        }
        // before the tip: stay off the median (keep to the side you are on)
        if (!this.tip) {
            const s = segAt(tr, look);
            if (s.n === 2) {
                const k = this.x < (roadAt(tr, 0, z) + roadAt(tr, 1, z)) / 2 ? 0 : 1;
                target = roadAt(tr, k, z) + (k === 0 ? -0.2 : 0.2);
            }
        }
        const curve = segAt(tr, z).curve;
        const need = (target - this.x) * 2.2 + curve * sp * sp * CF * this.grip;
        return Math.max(-1, Math.min(1, need / STEER));
    }

    collectStats(into) {
        const s = this.stats;
        add(into, 'crashes', s.crashes); add(into, 'crashCar', s.crashCar); add(into, 'cp1Sec', s.cp1Sec); add(into, 'cp2Sec', s.cp2Sec); add(into, 'bumps', s.bumps); add(into, 'passed', s.passed);
        add(into, 'offroadSec', s.offroadSec); add(into, 'stageReached', s.stage);
        add(into, 'routeCanyon', s.route < 0 ? 1 : 0); add(into, 'topKmh', s.topKmh);
        add(into, 'goalSec', s.finishSec); add(into, 'leftAtGoal', s.timeLeftAtGoal);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

SunsetRound.Phase = Phase;
