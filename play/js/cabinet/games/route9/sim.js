// THE NODE · world 1 · ROUTE 9 (Northgate Novelty Co., 1985) · THE ROUND (ICabinetSim).
// A seven-day route; the original Unity parity is retired.
//
// A paper route at dusk. The street runs bottom-left to top-right; the bike rolls forward on its
// own. The WORLD is two numbers: S = distance along the route (forward, px), L = across the
// street (px, 0 = the back wall of the houses, growing toward the far curb). view.js shears
// that plane onto the tube.
//
//   across the street (L):  houses 0-58 | lawn 58-106 (mailbox at 102) | sidewalk 108-130 |
//                           curb | road 134-196 (lanes at 146 166 186) | far sidewalk 200-222
//   the bike rides one of four lanes: 0 = the sidewalk (118), 1-3 = the road (146, 166, 186)
// Seven daily editions, each with its own street plan and a ramp-and-target training strip.
// Lit mailboxes take deliveries; dark windows are fair game for spare papers. Misses cost a
// bike in groups (the forgiveness knob); crashes cost one immediately. Keep the bikes across
// the week. The Sunday tally, rather than an elapsed clock, is the only winning exit.
// Cards and tallies freeze the street. All motion, debris and sounds follow simulation time.
// Credit five keeps the hazards harmless and homes papers into overlooked mailboxes.
import { f32, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, SystemRandom } from '../../sdk/index.js';

export const HazardType = Object.freeze({ Pothole: 0, ParkedCar: 1, Dog: 2, Trike: 3, Mower: 4, Traffic: 5 });
export const LotKind = Object.freeze({ Start: 0, House: 1, Crossing: 2, Bundle: 3, Finish: 4 });
export const Days = [
    ['MONDAY', 'QUIET BLOCK', 'LIT BOXES WANT PAPERS', [6, -2, 4]],
    ['TUESDAY', 'DOG LEG', 'DOGS COMMIT THEN DODGE', [5, -1, 3, -2, 4]],
    ['WEDNESDAY', 'GARDEN SHIFT', 'MOWERS SWEEP THE WALK', [4, -2, 4, -1, 5]],
    ['THURSDAY', 'SCHOOL RUN', 'TRIKES CROSS YOUR LINE', [5, -1, 4, -2, 5]],
    ['FRIDAY', 'ROAD CREW', 'B JUMPS THE BARRICADES', [4, -1, 4, -2, 4, -1, 3]],
    ['SATURDAY', 'DRAIN STREET', 'JUMP DRAINS AND DODGE CARS', [5, -1, 4, -2, 4, -1, 3]],
    ['SUNDAY', 'BIG EDITION', 'HEAVY PAPERS - BUSY CROSSINGS', [5, -1, 4, -2, 4, -1, 4]],
];
const Phase = Object.freeze({ Idle: 0, Intro: 1, Riding: 2, Crash: 3, Card: 4, Over: 5, Tally: 6 });

// ---- the street, across (L)
export const LaneL = [118, 146, 166, 186];
export const MailboxL = 102, WallL = 58, PorchL0 = 56, PorchL1 = 72;
export const SidewalkL0 = 108, SidewalkL1 = 130, RoadL0 = 134, RoadL1 = 196;
export const DogHomeL = 84, BundleL = 126;
// ---- a lot, along (S)
export const LotLen = 88, CrossLen = 64, StartLen = 160, FinishLen = 260;
export const HouseS0 = 14, HouseS1 = 74;             // the house body inside its lot
export const MailboxOff = 8, DoorOff = 44, Window0Off = 26, Window1Off = 62;
export const CarLane0Off = 20, CarLane1Off = 44;
export const PorchHalf = 8, WindowHalf = 6;
export const Houses = 20, Subscribers = 12;
export const StartS = 40, FinishPastLastHouse = 64;
export const BikeHS = 5, BikeHL = 5;
export const CarStripL0 = -90, CarStripL1 = 420, CarHS = 7, CarHL = 16;

// hazard types go away one per lost round, in this order (the pothole is last: it eases by margin)
export const RemovalOrder = [HazardType.Traffic, HazardType.ParkedCar, HazardType.Dog, HazardType.Mower, HazardType.Trike, HazardType.Pothole];

// ------------------------------------------------------------ lot / hazard / paper helpers
export function lotEnd(l) { return l.s0 + l.len; }
export function lotMailboxS(l) { return l.s0 + MailboxOff; }
export function lotDoorS(l) { return l.s0 + DoorOff; }
export function lotWindowS(l, i) { return l.s0 + (i === 0 ? Window0Off : Window1Off); }
export function lotCarLaneS(l, i) { return l.s0 + (i === 0 ? CarLane0Off : CarLane1Off); }
export function lotCarDir(i) { return i === 0 ? -1 : 1; }
export function lotBundleS(l) { return l.s0 + 44; }

function newLot(kind, s0, len) {
    return {
        kind, s0, len, house: 0, subscriber: false, pastel: 0,
        delivered: false, missed: false, deliveredBy: 0, deliveredAt: -99,
        windowBroken: [false, false], bundleTaken: false,
        traffic: false, carSpeed: 0, carGap: 0, carPhase: [0, 0], carSeed: 0, laneDodged: [false, false],
    };
}

export function jitter(seed, lane, k) {
    let h = (Math.imul(seed, 73856093) ^ Math.imul(lane, 19349663) ^ Math.imul(k, 83492791)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return f32((h & 0xFFFF) / 65536);
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

export class Route9Sim {
    constructor() {
        // ---- the machine (not mercy knobs)
        this.recordEvents = false; this.events = [];
        this.day = 0; this.jump = 0; this.jumpCd = 0; this.extra = false;
        this.introSeconds = 2.6; this.crashSeconds = 2.0; this.cardSeconds = 3.5; this.invulnSeconds = 1.5;
        this.startLives = 3; this.missesToEnd = 3; this.papersFull = 20;
        this.range = 96; this.paperSpeed = 200; this.throwCooldown = 0.3;
        this.fastMul = 1.6; this.slowMul = 0.5; this.accel = 70; this.laneSpeed = 130;
        this.dogTrigger = 88; this.dogCommit = 30; this.trikeSpeed = 22; this.mowerSpeed = 20; this.carSpeedBase = 110;
        this.dogSpeed = 72;
        this.mailboxWindow = 6;

        // ---- read-only state
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.worldTime = 0;
        this.bikeS = 0; this.bikeL = 0; this.lane = 0; this.speed = 0; this.cruise = 0; this.invuln = 0;
        this.papersLeft = 0; this.delivered = 0; this.missed = 0; this.windows = 0; this.crashes = 0;
        this.streak = 0; this.dodges = 0; this.thrown = 0; this.throwAge = 9;
        this.finishS = 0; this.bundleLotS = 0;
        this.crashType = HazardType.Pothole; this.crashS = 0; this.crashL = 0;
        this.endReason = '';
        this.credit = null;
        this.winMisses = 0; this.potholeMargin = 0;
        this.typeOn = [true, true, true, true, true, true];

        this.lots = []; this.hazards = []; this.papers = []; this.popups = [];

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0; this._time = 0;
        this._throwCd = 0; this._holdL = 0; this._holdR = 0;
        this._crashBy = new Array(6).fill(0);
        this._rng = new SystemRandom(1);
        this._carL = new Float64Array(8); this._carId = new Int32Array(8);
    }

    // ------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Intro: return CabinetState.Intro;
            case Phase.Riding: return CabinetState.Playing;
            case Phase.Tally: case Phase.Crash: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this._lives; }
    get time() { return this._time; }
    get cues() { return this._cues; }
    get roundWon() { return this._result === RoundResult.Won; }
    get mercyActive() { return this.credit != null && this.credit.unlosable; }

    get subscribersLeft() {
        let n = 0;
        for (const l of this.lots) if (l.kind === LotKind.House && l.subscriber && !l.delivered && !l.missed) n++;
        return n;
    }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + (this.endReason.length > 0 ? ' (' + this.endReason + ')' : '') + ' ' + this.delivered + '/' + this.lots.filter(l => l.subscriber).length +
            ' missed ' + this.missed + ' bikes ' + this._lives + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) +
            's crashes ' + this.crashes + ' windows ' + this.windows + ' papers ' + this.papersLeft;
    }

    reset(seed, credit, k) {
        this.events.length = 0; this.day = 0; this.extra = false; this.totalDelivered = 0; this.totalMissed = 0;
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.cruise = credit.unlosable ? 48 : k.get('cruiseSpeed');
        this.ease = k.get('forgiveness');
        const off = roundEven(k.get('hazardsOff'));
        for (let i = 0; i < 6; i++) this.typeOn[i] = true;
        for (let i = 0; i < off && i < RemovalOrder.length; i++) this.typeOn[RemovalOrder[i]] = false;
        if (credit.unlosable) for (let i = 0; i < 6; i++) this.typeOn[i] = false;       // the free ride: only mailboxes
        this.potholeMargin = Math.max(0, Math.min(0.8, k.get('potholeMargin')));
        this.dogTrigger = k.get('dogTrigger');
        this.dogSpeed = k.get('dogSpeed');
        this.mailboxWindow = k.get('mailboxWindow');
        this.carSpeedBase = k.get('carSpeed');
        const density = k.get('hazardDensity');
        const gap = k.get('trafficGap');

        this.lots.length = 0; this.hazards.length = 0; this.papers.length = 0; this.popups.length = 0;
        this.baseDensity = density; this.gap = gap; this._setupDay();

        this.bikeS = StartS; this.lane = 1; this.bikeL = LaneL[this.lane]; this.speed = 0;
        this.papersLeft = this.papersFull;
        this.delivered = this.missed = this.windows = this.crashes = this.streak = this.dodges = this.thrown = 0;
        this.dayCrashes = 0;
        this.throwAge = 9; this.invuln = 0; this._throwCd = 0; this._holdL = this._holdR = 0;
        this._crashBy.fill(0);
        this._score = 0; this._lives = this.startLives; this._time = 0; this.worldTime = 0;
        this._result = RoundResult.None; this.endReason = '';
        this._cues.resetTotals();
        this.p = Phase.Intro; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
    }

    // ------------------------------------------------------------ the route
    _buildRoute(trafficGap) {
        let s = 0;
        const addLot = (kind, len) => { const l = newLot(kind, s, len); this.lots.push(l); s += len; return l; };

        addLot(LotKind.Start, StartLen);
        const plan = Days[this.day][3];            // houses, -1 crossing, -2 the bundle lot
        let house = 0;
        for (const p of plan) {
            if (p === -1) {
                const c = addLot(LotKind.Crossing, CrossLen);
                c.traffic = this.day >= 3 && this.typeOn[HazardType.Traffic];
                c.carSpeed = f32(this.carSpeedBase * f32(0.9 + f32(0.2 * this._rng.nextDouble())));
                c.carGap = trafficGap;
                c.carPhase[0] = f32(this._rng.nextDouble() * trafficGap);
                c.carPhase[1] = f32(this._rng.nextDouble() * trafficGap);
                c.carSeed = this._rng.next(1, 1 << 20);
            } else if (p === -2) { const b = addLot(LotKind.Bundle, LotLen); this.bundleLotS = b.s0; }
            else for (let i = 0; i < p; i++) { const h = addLot(LotKind.House, LotLen); h.house = ++house; }
        }
        const fin = addLot(LotKind.Finish, FinishLen);
        this.courseS = fin.s0; this.finishS = fin.s0 + 250;
        this.targets = [50, 115, 180].map((d, i) => ({ s: fin.s0 + d, lane: i % 3, hit: false, ramp: false }));

        // 6 subscribers among houses 1-10, 6 among 11-20; pastels never repeat next door
        const first = this._pick(10, 6), second = this._pick(10, 6);
        let prevPastel = -1;
        for (const l of this.lots) {
            if (l.kind !== LotKind.House) continue;
            const idx = l.house - 1;
            l.subscriber = idx % 3 !== 2;
            let pc; do { pc = this._rng.next(4); } while (pc === prevPastel);
            l.pastel = pc; prevPastel = pc;
        }
    }

    _emit(kind, o) { if (this.recordEvents) this.events.push({ ...(o || {}), kind }); }

    _setupDay() {
        this.lots.length = 0; this.hazards.length = 0; this.papers.length = 0; this.popups.length = 0;
        this.delivered = this.missed = this.streak = 0; this.jump = this.jumpCd = 0;
        this._buildRoute(this.gap * (1 - this.day * 0.045));
        this._placeHazards(this.baseDensity * (0.45 + this.day * 0.12));
        this.hazards = this.hazards.filter(h => h.type === HazardType.Pothole || h.type === HazardType.ParkedCar ||
            (h.type === HazardType.Dog && this.day >= 1) || (h.type === HazardType.Mower && this.day >= 2) ||
            (h.type === HazardType.Trike && this.day >= 3));
        if (this.day >= 4) for (let i = 0; i < 3 + this.day - 4; i++)
            this.hazards.push({type: HazardType.Pothole, s: 310 + i * 265, l: LaneL[i % 4], hs: 9, hl: 10,
                variant: this.day === 4 ? 5 : 6, hit: false, dodged: false});
        this.bikeS = StartS; this.lane = 1; this.bikeL = LaneL[1]; this.speed = 0;
        this.papersLeft = this.day === 6 ? 14 : 18; this._throwCd = 0; this.invuln = 2;
        this.dayCrashes = this.crashes || 0; this.tally = null; this.p = Phase.Intro; this.phaseTime = 0;

    }

    _clearDay() {
        const perfect = this.missed === 0 && this.crashes === this.dayCrashes;
        this.tally = { delivery: this.delivered * 100, course: this.targets.filter(t => t.hit).length * 300,
            perfect: perfect ? 1000 : 0 };
        this._score += this.tally.delivery + this.tally.course + this.tally.perfect;
        this.totalDelivered += this.delivered; this.totalMissed += this.missed;
        this._emit('stageClear', { day: this.day, perfect });
        this.p = Phase.Tally; this.phaseTime = 0;
    }

    _pick(n, k) {
        const b = new Array(n).fill(false);
        let got = 0;
        while (got < k) { const i = this._rng.next(n); if (!b[i]) { b[i] = true; got++; } }
        return b;
    }

    lotAt(s) {
        for (const l of this.lots) if (s >= l.s0 && s < lotEnd(l)) return l;
        return s < 0 ? this.lots[0] : this.lots[this.lots.length - 1];
    }

    _nearCrossing(s, pad) {
        for (const l of this.lots) if (l.kind === LotKind.Crossing && s > l.s0 - pad && s < lotEnd(l) + pad) return true;
        return false;
    }

    // lanes a static hazard at s would leave: never block more than two of the four
    _laneFree(s, lane, pad) {
        for (const h of this.hazards) {
            if (Math.abs(h.s - s) > h.hs + pad) continue;
            if (h.type === HazardType.Dog) continue;
            if (Math.abs(LaneL[lane] - h.l) < h.hl + 8) return false;
            if (h.type === HazardType.Mower && lane === 0) return false;
        }
        return true;
    }

    _freeLanes(s, pad) { let n = 0; for (let i = 0; i < 4; i++) if (this._laneFree(s, i, pad)) n++; return n; }

    _placeHazards(density) {
        const lo = StartLen + 40, hi = this.courseS - 60;
        const houses = [];
        for (const l of this.lots) if (l.kind === LotKind.House) houses.push(l);

        // dogs live on dark lawns (any lawn if there are not enough)
        if (this.typeOn[HazardType.Dog]) {
            const n = this._count(4, density);
            const cand = [];
            for (const h of houses) if (!h.subscriber) cand.push(h);
            this._shuffle(cand);
            for (let i = 0; i < n && i < cand.length; i++)
                this.hazards.push({ type: HazardType.Dog, s: cand[i].s0 + 64, l: DogHomeL, homeL: DogHomeL, targetL: 0, minL: 0, maxL: 0,
                    vel: 0, hs: 5, hl: 8, state: 0, timer: 0, ridden: 0, hit: false, dodged: false, variant: this._rng.next(2) });
        }
        // a lawnmower on two lawns, working out to the sidewalk and back
        if (this.typeOn[HazardType.Mower]) {
            const n = this._count(2, density);
            const cand = houses.slice();
            this._shuffle(cand);
            let placed = 0;
            for (const h of cand) {
                if (placed >= n) break;
                const ms = h.s0 + 28;
                let clash = false;
                for (const o of this.hazards) if (Math.abs(o.s - ms) < 40) clash = true;
                if (clash) continue;
                const l0 = f32(88 + f32(this._rng.nextDouble() * 30));
                this.hazards.push({ type: HazardType.Mower, s: ms, l: l0, homeL: 0, targetL: 0, minL: 86, maxL: 128,
                    vel: this._rng.next(2) === 0 ? this.mowerSpeed : -this.mowerSpeed, hs: 7, hl: 8,
                    state: 0, timer: 0, ridden: 0, hit: false, dodged: false, variant: 0 });
                placed++;
            }
        }
        // statics: parked cars, potholes; trikes ride the sidewalk toward you
        this._placeStatic(HazardType.ParkedCar, this._count(2, density), lo, hi);
        this._placeStatic(HazardType.Trike, this._count(2, density), lo + 60, hi);
        this._placeStatic(HazardType.Pothole, this._count(8, density), lo, hi);
        this.hazards.sort((a, b) => a.s - b.s);
    }

    _count(n, density) { return Math.max(0, roundEven(n * density)); }

    _shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) { const j = this._rng.next(i + 1); const t = list[i]; list[i] = list[j]; list[j] = t; }
    }

    _placeStatic(type, n, lo, hi) {
        if (!this.typeOn[type]) return;
        let placed = 0, guard = 0;
        while (placed < n && guard++ < 400) {
            let s = f32(lo + f32(this._rng.nextDouble() * (hi - lo)));
            s = Math.floor(s);
            if (this._nearCrossing(s, type === HazardType.ParkedCar ? 30 : 20)) continue;
            if (type === HazardType.Trike && (this._nearCrossing(s, 140) || Math.abs(s - (this.bundleLotS + 44)) < 150)) continue;
            const h = { type, s, l: 0, hs: 0, hl: 0, homeL: 0, targetL: 0, minL: 0, maxL: 0, vel: 0,
                state: 0, timer: 0, ridden: 0, hit: false, dodged: false, variant: 0 };
            if (type === HazardType.Pothole) { h.l = LaneL[1 + this._rng.next(3)]; h.hs = 5; h.hl = 9; }
            else if (type === HazardType.ParkedCar) { h.l = this._rng.nextDouble() < 0.6 ? LaneL[1] : LaneL[3]; h.hs = 12; h.hl = 6; h.variant = this._rng.next(4); }
            else { h.l = f32(SidewalkL0 + 2); h.hs = 6; h.hl = 7; h.variant = this._rng.next(2); h.timer = f32(120 + f32(this._rng.nextDouble() * 50)); }
            // spacing: nothing else within 36 px, and at least two lanes stay open around it
            let tooClose = false;
            for (const o of this.hazards) if (Math.abs(o.s - s) < o.hs + h.hs + 20) tooClose = true;
            if (tooClose) continue;
            if (type !== HazardType.Trike && Math.abs(s - (this.bundleLotS + 44)) < 30) continue;
            this.hazards.push(h);
            if (this._freeLanes(s, 24) < 2) { this.hazards.pop(); continue; }
            placed++;
        }
    }

    // ------------------------------------------------------------ cross traffic
    // cars on crossing lane i enter every CarGap s (plus a fixed per-car jitter) at one edge
    // of the world strip and drive across at CarSpeed. Positions are a pure function of time.
    carsOnLane(c, lane, t, outL, outId) {
        if (!c.traffic) return 0;
        const travel = (CarStripL1 - CarStripL0) / c.carSpeed;
        let n = 0;
        const kHi = Math.floor((t - c.carPhase[lane]) / c.carGap) + 1;
        const kLo = Math.floor((t - travel - c.carPhase[lane]) / c.carGap) - 1;
        for (let k = kLo; k <= kHi && n < outL.length; k++) {
            const t0 = f32(f32(c.carPhase[lane] + f32(k * c.carGap)) + f32(f32(jitter(c.carSeed, lane, k) * c.carGap) * 0.45));
            const u = f32((t - t0) * c.carSpeed);
            if (u < 0 || u > CarStripL1 - CarStripL0) continue;
            outL[n] = lotCarDir(lane) > 0 ? f32(CarStripL0 + u) : f32(CarStripL1 - u);
            outId[n] = k;
            n++;
        }
        return n;
    }

    // ------------------------------------------------------------ stepping
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > 0.1) dt = 0.1;
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        const before = this.phaseTime;
        this.phaseTime = f32(this.phaseTime + dt);

        switch (this.p) {
            case Phase.Intro:
                if (this.phaseTime >= this.introSeconds) { this.p = Phase.Riding; this.phaseTime = 0; this.speed = this.cruise; this._cues.emit(SoundCue.Start); this._emit('stageStart', { day: this.day }); if (this.day === 6) this._emit('finale'); }
                else if (Math.trunc(before / 0.9) !== Math.trunc(this.phaseTime / 0.9)) this._cues.emit(SoundCue.Tick);
                break;
            case Phase.Riding:
                this._ride(dt, input);
                break;
            case Phase.Crash:
                if (this.phaseTime >= this.crashSeconds) {
                    if (this._lives <= 0) this._endRound(RoundResult.Lost, 'OUT OF BIKES');
                    else { this.p = Phase.Riding; this.phaseTime = 0; this.invuln = this.invulnSeconds; this.speed = f32(this.cruise * 0.8); }
                }
                break;
            case Phase.Tally:
                if (this.phaseTime >= 3.5) {
                    if (this.day === 6) this._endRound(RoundResult.Won, 'WEEK COMPLETE');
                    else { this.day++; this._setupDay(); }
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
        if (!this.extra && this._score >= 9000) {
            this.extra = true; this._lives++; this._emit('extraLife');
            this.popups.push({text: 'EXTRA BIKE', s: this.bikeS, l: this.bikeL, born: this._time, kind: 3});
        }
        // popups live 1.3 s of sim time
        for (let i = this.popups.length - 1; i >= 0; i--) if (this._time - this.popups[i].born > 1.3) this.popups.splice(i, 1);
    }

    _ride(dt, input) {
        let target = this.cruise;
        if (input != null) {
            if (input.pressed(Pad.Left)) { this._shiftLane(-1); this._holdL = 0; }
            else if (input.held(Pad.Left)) { this._holdL = f32(this._holdL + dt); if (this._holdL > 0.32) { this._holdL = f32(this._holdL - 0.2); this._shiftLane(-1); } }
            else this._holdL = 0;
            if (input.pressed(Pad.Right)) { this._shiftLane(1); this._holdR = 0; }
            else if (input.held(Pad.Right)) { this._holdR = f32(this._holdR + dt); if (this._holdR > 0.32) { this._holdR = f32(this._holdR - 0.2); this._shiftLane(1); } }
            else this._holdR = 0;
            if (input.held(Pad.Up)) target = f32(this.cruise * this.fastMul);
            else if (input.held(Pad.Down)) target = f32(this.cruise * this.slowMul);
            if (input.pressed(Pad.A)) this._throw(false);
            if (input.pressed(Pad.B) && this.jumpCd <= 0) { this.jump = 0.8; this.jumpCd = 1.35; this._emit('jump'); }
        }
        if (this.speed < target) this.speed = Math.min(target, f32(this.speed + f32(this.accel * dt)));
        else if (this.speed > target) this.speed = Math.max(target, f32(this.speed - f32(f32(this.accel * 1.4) * dt)));

        this.bikeS = f32(this.bikeS + f32(this.speed * dt));
        const tl = LaneL[this.lane];
        if (this.bikeL < tl) this.bikeL = Math.min(tl, f32(this.bikeL + f32(this.laneSpeed * dt)));
        else if (this.bikeL > tl) this.bikeL = Math.max(tl, f32(this.bikeL - f32(this.laneSpeed * dt)));
        this.worldTime = f32(this.worldTime + dt);
        this._throwCd = f32(this._throwCd - dt); this.throwAge = f32(this.throwAge + dt);
        if (this.invuln > 0) this.invuln = f32(this.invuln - dt);

        this.jump = Math.max(0, this.jump - dt); this.jumpCd = Math.max(0, this.jumpCd - dt);
        for (const q of this.targets) {
            if (!q.ramp && Math.abs(this.bikeS - (q.s - 20)) < 9 && this.lane === q.lane) {
                q.ramp = true; this.jump = 1; this._emit('jump');
            }
            if (!q.hit && Math.abs(this.bikeS - q.s) < 14 && this.jump > 0 && Math.abs(this.bikeL - LaneL[q.lane]) < 14 && input?.held(Pad.A)) {
                q.hit = true; this._score += 200; this._emit('target');
                this.popups.push({text: '+200', s: q.s, l: this.bikeL, born: this._time, kind: 0});
            }
        }
        this._updateHazards(dt);
        this._updatePapers(dt);
        if (!this.mercyActive && this.invuln <= 0 && this._collide()) return;
        this._bundle();
        this._dodge();
        if (this.mercyActive) this._freeFlick();
        if (this._misses()) return;
        if (this.bikeS >= this.finishS) {
            this._clearDay();
        }
    }

    _shiftLane(d) { this.lane = Math.max(0, Math.min(3, this.lane + d)); }

    _throw(free) {
        if (!free && (this._throwCd > 0 || this.papersLeft <= 0)) return;
        if (!free) { this.papersLeft--; this._throwCd = this.throwCooldown; }
        this.thrown++; this.throwAge = 0; this._emit('fire', { heavy: this.day === 6 });
        const p = { s: this.bikeS, s0: this.bikeS, l0: f32(this.bikeL - 6), l: f32(this.bikeL - 6), age: 0,
            dur: f32(this.range / (this.paperSpeed * (this.day === 6 ? 0.75 : 1))), homing: false, homingS: 0, state: 0, outcome: 0, rest: 0 };
        if (this.mercyActive) {
            let best = null, bd = 60;
            for (const l of this.lots)
                if (l.kind === LotKind.House && l.subscriber && !l.delivered && !l.missed && Math.abs(lotMailboxS(l) - this.bikeS) < bd && !this._paperBound(l))
                { bd = Math.abs(lotMailboxS(l) - this.bikeS); best = l; }
            if (best != null) { p.homing = true; p.homingS = lotMailboxS(best); }
        }
        this.papers.push(p);
        this._cues.emit(SoundCue.Tick);
    }

    _paperBound(l) {
        for (const p of this.papers) if (p.state === 0 && p.homing && p.homingS === lotMailboxS(l)) return true;
        return false;
    }

    // ------------------------------------------------------------ hazards
    _updateHazards(dt) {
        for (const h of this.hazards) {
            switch (h.type) {
                case HazardType.Dog:
                    if (h.state === 0 && this.bikeS >= h.s - this.dogTrigger) {
                        h.state = 1; this._emit('dog');
                        h.targetL = Math.max(LaneL[0], Math.min(LaneL[3], this.bikeL));
                    } else if (h.state === 1) {
                        // it chases the bike's lane until it is close, then it commits
                        if (h.s - this.bikeS > this.dogCommit) h.targetL = Math.max(LaneL[0], Math.min(LaneL[3], this.bikeL));
                        if (h.l < h.targetL) h.l = Math.min(h.targetL, f32(h.l + f32(this.dogSpeed * dt)));
                        else h.l = Math.max(h.targetL, f32(h.l - f32(this.dogSpeed * dt)));
                        if (Math.abs(h.l - h.targetL) < 0.01 && h.s - this.bikeS <= this.dogCommit) { h.state = 2; h.timer = 0; }
                        if (this.bikeS > h.s + 26 || h.hit) h.state = 3;
                    } else if (h.state === 2) { h.timer = f32(h.timer + dt); if (this.bikeS > h.s + 26 || h.hit) h.state = 3; }
                    else if (h.state === 3) {
                        h.l = Math.max(h.homeL, f32(h.l - f32(f32(this.dogSpeed * 0.7) * dt)));
                        if (h.l <= h.homeL) h.state = 4;
                    }
                    break;
                case HazardType.Trike:
                    // the kid pedals out across the street toward the far sidewalk
                    if (h.state === 0 && this.bikeS >= h.s - h.timer) h.state = 1;
                    else if (h.state === 1) {
                        h.l = f32(h.l + f32(this.trikeSpeed * dt));
                        h.s = f32(h.s - f32(f32(this.trikeSpeed * 0.25) * dt));
                        if (h.l >= 210 || h.hit) h.state = 2;
                    }
                    break;
                case HazardType.Mower:
                    h.l = f32(h.l + f32(h.vel * dt));
                    if (h.l > h.maxL) { h.l = h.maxL; h.vel = -Math.abs(h.vel); }
                    if (h.l < h.minL) { h.l = h.minL; h.vel = Math.abs(h.vel); }
                    break;
            }
        }
    }

    _collide() {
        for (const h of this.hazards) {
            if (h.hit || (this.jump > 0 && h.type !== HazardType.ParkedCar)) continue;
            let hs = h.hs, hl = h.hl;
            if (h.type === HazardType.Pothole) { hs = f32(hs * f32(1 - this.potholeMargin)); hl = f32(hl * f32(1 - this.potholeMargin)); }
            if (h.type === HazardType.Dog && (h.state === 0 || h.state === 4)) continue;     // a dog on its lawn is no hazard
            if (Math.abs(this.bikeS - h.s) < hs + BikeHS && Math.abs(this.bikeL - h.l) < hl + BikeHL) {
                h.hit = true;
                this._crash(h.type, h.s, h.l);
                return true;
            }
        }
        for (const c of this.lots) {
            if (c.kind !== LotKind.Crossing || !c.traffic) continue;
            if (this.bikeS < c.s0 - 20 || this.bikeS > lotEnd(c) + 20) continue;
            for (let lane = 0; lane < 2; lane++) {
                if (Math.abs(this.bikeS - lotCarLaneS(c, lane)) >= CarHS + BikeHS) continue;
                const n = this.carsOnLane(c, lane, this.worldTime, this._carL, this._carId);
                for (let i = 0; i < n; i++)
                    if (Math.abs(this._carL[i] - this.bikeL) < CarHL + BikeHL) { this._crash(HazardType.Traffic, lotCarLaneS(c, lane), this.bikeL); return true; }
            }
        }
        return false;
    }

    _crash(type, s, l) {
        this._emit('crash', { type }); this._lives--; this.crashes++; this._crashBy[type]++; this.streak = 0;
        this.crashType = type; this.crashS = this.bikeS; this.crashL = this.bikeL;
        this.p = Phase.Crash; this.phaseTime = 0;
        this.popups.push({ text: 'CRASH', s: this.bikeS, l: this.bikeL, born: this._time, kind: 4 });
        this._cues.emit(SoundCue.Die);
    }

    _dodge() {
        for (const h of this.hazards) {
            if (h.hit || h.dodged) continue;
            if (h.type === HazardType.Dog && h.state === 0) continue;
            if (this.bikeS > h.s + h.hs + BikeHS + 1) {
                h.dodged = true;
                if (Math.abs(this.bikeL - h.l) <= 44) { this._score += 10; this.dodges++; }
            }
        }
        for (const c of this.lots) {
            if (c.kind !== LotKind.Crossing || !c.traffic) continue;
            for (let lane = 0; lane < 2; lane++) {
                if (c.laneDodged[lane] || this.bikeS <= lotCarLaneS(c, lane) + CarHS + BikeHS + 1) continue;
                c.laneDodged[lane] = true;
                const n = this.carsOnLane(c, lane, this.worldTime, this._carL, this._carId);
                for (let i = 0; i < n; i++) if (Math.abs(this._carL[i] - this.bikeL) < 64) { this._score += 10; this.dodges++; break; }
            }
        }
    }

    // ------------------------------------------------------------ papers
    _updatePapers(dt) {
        for (let i = this.papers.length - 1; i >= 0; i--) {
            const p = this.papers[i];
            if (p.state === 1) {
                p.rest = f32(p.rest + dt);
                if (p.s < this.bikeS - 90) this.papers.splice(i, 1);
                continue;
            }
            if (p.state === 2) { this.papers.splice(i, 1); continue; }
            const prevL = p.l;
            p.age = f32(p.age + dt);
            const u = Math.min(1, p.age / p.dur);
            p.l = f32(p.l0 - f32(this.range * u));
            if (p.homing) {
                const uMail = Math.max(0.05, (p.l0 - MailboxL) / this.range);
                const k = Math.min(1, u / uMail);
                p.s = f32(p.s0 + f32((p.homingS - p.s0) * k));
            }

            // 1) the mailbox, on its post at the lawn's edge
            if (prevL > MailboxL && p.l <= MailboxL) {
                for (const l of this.lots) {
                    if (l.kind !== LotKind.House || !l.subscriber) continue;
                    const inWindow = Math.abs(p.s - lotMailboxS(l)) <= this.mailboxWindow || (p.homing && p.homingS === lotMailboxS(l));
                    if (!inWindow) continue;
                    if (!l.delivered && !l.missed) this._deliver(l, 1, p);
                    p.state = 2; p.outcome = 1;
                    break;
                }
                if (p.state === 2) continue;
            }
            // 2) the house front: the porch (subscribers) or a window (dark houses)
            if (prevL > WallL && p.l <= WallL) {
                const l = this.lotAt(p.s);
                if (l.kind === LotKind.House && p.s >= l.s0 + HouseS0 && p.s < l.s0 + HouseS1) {
                    if (l.subscriber && Math.abs(p.s - lotDoorS(l)) <= PorchHalf) {
                        if (!l.delivered && !l.missed) this._deliver(l, 2, p);
                        p.state = 2; p.outcome = 2;
                    } else {
                        p.outcome = 4;
                        if (!l.subscriber)
                            for (let w = 0; w < 2; w++)
                                if (!l.windowBroken[w] && Math.abs(p.s - lotWindowS(l, w)) <= WindowHalf) {
                                    this._emit('glass'); l.windowBroken[w] = true; this.windows++; this._score += 50; p.outcome = 3;
                                    this.popups.push({ text: '+50', s: lotWindowS(l, w), l: WallL - 10, born: this._time, kind: 1 });
                                    this._cues.emit(SoundCue.Bonus);
                                }
                        p.state = 1; p.l = f32(WallL + 4); p.rest = 0;           // it drops into the flower bed
                    }
                    continue;
                }
            }
            // 3) out of arc: it lands. On the porch still counts.
            if (u >= 1) {
                const l = this.lotAt(p.s);
                if (l.kind === LotKind.House && l.subscriber && !l.delivered && !l.missed && p.l >= PorchL0 && p.l <= PorchL1 && Math.abs(p.s - lotDoorS(l)) <= PorchHalf)
                { this._deliver(l, 2, p); p.state = 2; p.outcome = 2; }
                else { p.state = 1; p.outcome = 5; p.rest = 0; }
            }
        }
    }

    _deliver(l, how, p) {
        this._emit('delivery', { streak: this.streak }); l.delivered = true; l.deliveredBy = how; l.deliveredAt = this._time;
        this.delivered++; this.streak++;
        const pts = 100 + 20 * (this.streak - 1);
        this._score += pts;
        this.popups.push({ text: '+' + pts, s: how === 1 ? lotMailboxS(l) : lotDoorS(l), l: how === 1 ? MailboxL : f32(WallL + 8), born: this._time, kind: 0 });
        this._cues.emit(SoundCue.Hit);
    }

    // the free ride: a mailbox that is about to go by unfed gets a flick anyway
    _freeFlick() {
        for (const l of this.lots) {
            if (l.kind !== LotKind.House || !l.subscriber || l.delivered || l.missed) continue;
            if (this.bikeS > lotMailboxS(l) + 10 && this.bikeS < lotMailboxS(l) + 40 && !this._paperBound(l)) { this._throw(true); return; }
        }
    }

    _misses() {
        for (const l of this.lots) {
            if (l.kind !== LotKind.House || !l.subscriber || l.delivered || l.missed) continue;
            if (this.bikeS <= lotEnd(l) + 16) continue;
            let inFlight = false;
            for (const p of this.papers) if (p.state === 0 && p.s >= l.s0 && p.s < lotEnd(l)) inFlight = true;
            if (inFlight) continue;
            this._emit('miss'); l.missed = true; this.missed++; this.streak = 0;
            this.popups.push({ text: 'MISSED', s: lotDoorS(l), l: f32(WallL + 20), born: this._time, kind: 2 });
            this._cues.emit(SoundCue.Miss);
            if (this.missed % this.ease === 0 && !this.mercyActive) { this._crash(HazardType.Pothole, this.bikeS, this.bikeL); return true; }
        }
        return false;
    }

    _bundle() {
        for (const l of this.lots) {
            if (l.kind !== LotKind.Bundle || l.bundleTaken) continue;
            if (Math.abs(this.bikeS - lotBundleS(l)) < 10 && Math.abs(this.bikeL - BundleL) < 24) {
                this._emit('pickup'); l.bundleTaken = true;
                this.papersLeft = this.papersFull;
                this.popups.push({ text: this.papersFull + ' PAPERS', s: lotBundleS(l), l: BundleL, born: this._time, kind: 3 });
                this._cues.emit(SoundCue.Bonus);
            }
        }
    }

    _endRound(r, reason) {
        this._emit(r === RoundResult.Won ? 'victory' : 'out'); this._result = r; this.endReason = reason;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    // ------------------------------------------------------------ stats
    collectStats(into) {
        add(into, 'delivered', this.totalDelivered + (this.tally ? 0 : this.delivered));
        add(into, 'missed', this.totalMissed + (this.tally ? 0 : this.missed));
        add(into, 'crashes', this.crashes);
        add(into, 'windows', this.windows);
        add(into, 'thrown', this.thrown);
        add(into, 'dodges', this.dodges);
        add(into, 'papersLeft', this.papersLeft);
        const names = ['pothole', 'parkedcar', 'dog', 'trike', 'mower', 'traffic'];
        for (let i = 0; i < 6; i++) add(into, 'crash_' + names[i], this._crashBy[i]);
    }
}

Route9Sim.Phase = Phase;
