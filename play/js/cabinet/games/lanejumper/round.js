// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · THE ROUND (ICabinetSim).
// Grown from the port of LaneJumperSim.cs (Staging/Batch2/lanejumper); f32 throughout.
//
// A ROUND = the whole route: SIX STAGES (stages.js), each a town to cross five times. A courier on a bike hops
// (4-way, one 16 px tile per hop) from the bottom kerb across the road, the median and the river into one of
// five MAIL SLOTS on the far kerb. Fill all five and the stage is clear; clear DELIVERY DAY (stage 6) and the
// game is WON. Run out of couriers and it is lost.
//   - a vehicle touching the courier = CRASH, a train = TRAIN; landing in the water or riding a turtle group
//     that dives = SPLASH; riding off the edge of the screen = SWEPT; the mudjaw's open jaws, when he stands
//     on its head = SNAPPED; the snake or the dog on the median = BITTEN; 60 s per courier = TIME UP
//   - a filled slot lights up and cannot be entered, nor can a slot whose FLAP is shut (Delivery Day); a hop
//     into the wall or a closed slot is refused (a thunk, no life lost). A bonus STAMP sits in an empty slot
//     now and then; from stage 2 a PARCEL rides a log: hop onto it, carry it home for a bonus.
//   - Button A = HURRY: hops take half the time for 1 s, then 4 s to recharge.
//   - Score: 10 a hop onto a row this courier has not reached, 50 + 10 per second left on a slot, 200 for a
//     stamp, 100 to pick up a parcel and 500 to deliver it. The tally after each stage: the stage bonus
//     (500 x the stage; Delivery Day 5000), 10 a second under the stage's par, 1000 for no spills.
//   - 3 couriers; an EXTRA COURIER at 10000 and every 20000 after.
//
// PHASES -> CabinetState: Card (the stage card) / Ready (after a spill) -> Intro, Crossing -> Playing,
// Delivered / Crash / Clear (ALL FIVE) / Tally -> Interlude, Final -> Card, Over -> Over. The town (traffic,
// river, trains, the snake, the dog) keeps moving in every phase.
//
// EVENTS (for the sound; Starvector's way: recordEvents + events + _emit): card go next hop bump hurry slot stamp
// stampUp parcel parcelUp parcelIn parcelLost die shield buoy allFive tally count extra bell train horn jaws
// hiss bark blink flap lowTime. The eight SDK cues still go out for the Lab.
//
// MERCY (Core): the knobs slow the traffic and the river, widen every lane's gaps, close the river's water
// gaps, calm the divers, the snake, the dog and the weaver, and ring the train bell earlier per round lost on
// the cabinet. CreditInfo.unlosable (credit 5): the courier cannot die: vehicles, trains, jaws and teeth pass
// through a shield, he treads water, the banks hold him and the clock never runs out. The result still comes
// from the game: all six stages delivered.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4 } from '../../sdk/index.js';
import { LaneField, RowKind, ThingKind } from './field.js';
import { STAGES } from './stages.js';

export const DeathKind = Object.freeze({ None: 0, Crash: 1, Splash: 2, Swept: 3, TimeUp: 4, Bitten: 5, Snapped: 6, Train: 7 });
export const DeathNames = Object.freeze(['', 'crash', 'splash', 'swept', 'timeup', 'bitten', 'snapped', 'train']);

const Phase = Object.freeze({ Idle: 0, Card: 1, Ready: 2, Crossing: 3, Delivered: 4, Crash: 5, Clear: 6, Tally: 7, Final: 8, Over: 9 });

const HalfW = f32(5);                   // the courier's hit box half width against vehicles
const HopPoints = 10, SlotPoints = 50, SecondPoints = 10, StampPoints = 200, PickupPoints = 100, ParcelPoints = 500;
const StagePoints = 500, FinalePoints = 5000, ParPoints = 10, CleanPoints = 1000;
const FW = LaneField.FieldW;
const DogHalf = f32(8), SnakeIn = f32(3);
const MaxFx = 72, MaxPops = 8;

export class LaneJumperRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.firstCardSeconds = f32(3.6); this.cardSeconds = f32(3.0); this.respawnSeconds = f32(1.2);
        this.deliveredSeconds = f32(1.2); this.crashSeconds = f32(2.0); this.clearSeconds = f32(1.6);
        this.tallyLineSeconds = f32(0.75); this.tallyHold = f32(1.1); this.finalSeconds = f32(5.0);
        this.stampSeconds = f32(5);

        // ---- read-only state
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.worldTime = 0;
        this.lanes = null;
        this.credit = null;
        this.isDemo = false;                    // set by the attract loop before reset: the demo shows a later stage
        this.recordEvents = false; this.events = [];

        // the route
        this.stage = 1; this.stageDef = STAGES[0]; this.lastStage = STAGES.length;
        this.stagesCleared = 0;
        this.stageClock = 0;                    // seconds of crossing on this stage (the par clock)
        this.stageDeaths = 0;

        // the courier
        this.row = 0;
        this.x = 0;                             // centre, field px (0..208)
        this.hopping = false;
        this.fromRow = 0; this.toRow = 0;
        this.facing = Dir4.Up;
        this.bestRow = 0;
        this.courierTimer = 0; this.courierTimeMax = 0;
        this.bumpTime = 0;                      // > 0 just after a refused hop into the wall
        this.shieldTime = 0;                    // > 0 while the mercy shield is taking a hit
        this.floating = false;                  // mercy: treading water
        this.landTime = 0;                      // seconds since the last landing (the dust)

        // hurry (button A)
        this.hurryLeft = 0;                     // > 0 = the burst is on
        this.hurryCool = 0;                     // > 0 = recharging
        this.hurrySeconds = f32(1); this.hurryCooldown = f32(4);

        // slots, the stamp, the parcel, lives
        this.filled = new Array(LaneField.Slots).fill(false);
        this.flaps = [];                        // { s: 0 open, 1 about to shut (the telegraph), 2 shut; t: seconds left }
        for (let i = 0; i < LaneField.Slots; i++) this.flaps.push({ s: 0, t: 0 });
        this.slotsFilled = 0;
        this.stampSlot = -1;
        this.stampLeft = 0;
        this.lastSlot = -1;
        this.parcel = { s: 0, row: 0, th: null, off: 0, t: 0 };      // s: 0 none, 1 riding a log, 2 on the courier's rack
        this.livesLeft = 0; this.livesMax = 0;
        this.nextExtra = 0; this.extraT = 99;   // seconds since an extra courier was earned (the banner)
        this.courierNumber = 0;

        // the specials (null when the stage has none)
        this.weaver = null;
        this.dog = null;                        // { x, face, mode: 0 trot, 1 alert, 2 chase; t, trot, chase }
        this.trainEta = new Array(LaneField.Rows).fill(Infinity);    // per track: seconds until the train is on screen
        this.bellOn = new Array(LaneField.Rows).fill(false);         // per track: the bell is ringing (the telegraph)

        // the last death
        this.death = DeathKind.None;
        this.deathX = 0;
        this.deathRow = 0;

        // the tally after a stage: [{ label, value, counted }]
        this.tally = [];
        this.tallyLine = 0;

        // the picture's juice (the renderer reads these): particles, score pop-ups, the shake
        this.fx = [];                           // { k: 'dust' | 'drop' | 'bit' | 'spark' | 'paper', x, y, vx, vy, t, life, c }
        this.pops = [];                         // { text, x, y, t, c: 'yellow' | 'teal' | 'cream' | 'green' }
        this.shake = 0;

        // knobs as resolved for this credit
        this.hopTime = 0; this.slotTol = 0; this.diveUnder = 0; this.safeGap = 0; this.warn = 0;

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._fxRng = new SystemRandom(2);
        this._kn = null;
        this._result = RoundResult.None;
        this._score = 0;
        this._time = 0;
        this._hopT = 0; this._hopDur = 0; this._fromX = 0; this._toX = 0; this._drift = 0;
        this._stampTimer = 0; this._stampEvery = 0; this._flapTimer = 0; this._parcelTimer = 0;
        this._hopNoDrift = false;
        this._queued = -1;
        this._courierStart = 0;
        this._cardSaid = false;
        this._extraAt = 0; this._extraEvery = 0;
        this._tallyBase = 0; this._countT = 0;
        this._hissCool = 0; this._lowSec = 99;
        // stats
        this._hops = 0; this._blocked = 0; this._hurries = 0; this._stamps = 0; this._parcels = 0; this._extras = 0;
        this._deaths = new Array(8).fill(0);
        this._stageDeaths = new Array(STAGES.length + 1).fill(0);
        this._deliveries = 0;
        this._crossSum = 0;                     // double
    }

    get invulnerable() { return this.credit != null && this.credit.unlosable; }
    get hopFrac() { return this.hopping ? Math.min(1, f32(this._hopT / this._hopDur)) : 0; }
    get hurryReady() { return this.hurryLeft <= 0 && this.hurryCool <= 0; }
    get roundWon() { return this._result === RoundResult.Won; }
    get currentHopTime() { return this.hurryLeft > 0 ? f32(this.hopTime * 0.5) : this.hopTime; }
    get carrying() { return this.parcel.s === 2; }
    get theme() { return this.stageDef.theme; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Card:
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Crossing: return CabinetState.Playing;
            case Phase.Delivered:
            case Phase.Crash:
            case Phase.Clear:
            case Phase.Tally: return CabinetState.Interlude;
            case Phase.Final: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this.livesLeft; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const d = this._deaths;
        return r + ' stage ' + this.stage + '/' + this.lastStage + ' slots ' + this.slotsFilled + '/5 lives ' + this.livesLeft + ' score ' + this._score +
            ' ' + fmt(this._time, 1, F32) + 's deaths c' + d[1] + ' s' + d[2] + ' w' + d[3] + ' t' + d[4] + ' b' + d[5] + ' j' + d[6] + ' r' + d[7] +
            ' stamps ' + this._stamps + ' parcels ' + this._parcels;
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    reset(seed, credit, k) {
        this.credit = credit;
        if (seed === 0) seed = 1;
        this._rng = new SystemRandom(LaneField.mixSeed(seed));
        this._fxRng = new SystemRandom(LaneField.mixSeed(seed ^ 0x51F15EED));
        this.hopTime = k.get('hopTime');
        this.slotTol = k.get('slotTol');
        this.diveUnder = k.get('diveUnder');
        this.safeGap = k.get('safeGap');
        this.warn = k.get('warn');
        this.courierTimeMax = k.get('courierTime');
        this.livesMax = this.livesLeft = Math.max(1, roundEven(k.get('lives')));
        this._stampEvery = k.get('stampEvery');
        this._extraAt = roundEven(k.get('extraAt')); this._extraEvery = Math.max(1000, roundEven(k.get('extraEvery')));
        this.nextExtra = this._extraAt; this.extraT = 99;
        this._kn = {
            roadSpeed: k.get('roadSpeed'), riverSpeed: k.get('riverSpeed'), laneGap: k.get('laneGap'), safeGap: this.safeGap,
            waterGap: k.get('waterGap'), turtleDive: k.get('turtleDive'), hazard: k.get('hazard'), dive: 0,
        };

        this._score = 0; this._time = 0; this.worldTime = 0;
        this.hurryLeft = 0; this.hurryCool = 0;
        this._hops = this._blocked = this._hurries = this._stamps = this._parcels = this._extras = this._deliveries = 0;
        this._deaths.fill(0); this._stageDeaths.fill(0);
        this._crossSum = 0;
        this.courierNumber = 0;
        this.stagesCleared = 0;
        this.death = DeathKind.None;
        this.fx.length = 0; this.pops.length = 0; this.shake = 0;
        this._result = RoundResult.None;
        this._cues.resetTotals(); this.events.length = 0;

        let first = Math.max(1, Math.min(this.lastStage, roundEven(k.get('stage'))));
        if (this.isDemo) first = 2 + (LaneField.mixSeed(seed ^ 0x2D) % 4);             // the demo shows stages 2-5
        this._startStage(first);
    }

    _startStage(n) {
        this.stage = n;
        const S = this.stageDef = STAGES[n - 1];
        this._kn.dive = f32(S.dive * this._kn.turtleDive);
        this.lanes = LaneField.build(S, this._rng, this._kn);
        this.weaver = S.weaver ? LaneField.weaver(S, this._rng, this._kn) : null;
        this.dog = S.dog ? { x: f32(FW * 0.5), face: 1, mode: 0, t: 0, trot: f32(S.dog.trot * this._kn.hazard), chase: f32(S.dog.chase * this._kn.hazard) } : null;
        for (let r = 0; r < LaneField.Rows; r++) {
            const l = this.lanes[r];
            this.trainEta[r] = l != null && l.rail ? LaneField.trainEta(l) : Infinity;
            this.bellOn[r] = false;
        }
        for (let i = 0; i < LaneField.Slots; i++) { this.filled[i] = false; this.flaps[i].s = 0; this.flaps[i].t = 0; }
        this._flapTimer = S.flaps ? S.flaps.every : 0;
        this.parcel.s = 0; this.parcel.th = null;
        this._parcelTimer = f32(5 + f32(f32(this._rng.nextDouble()) * 5));
        this.slotsFilled = 0; this.stampSlot = -1; this.stampLeft = 0; this.lastSlot = -1;
        this._stampTimer = f32(this._stampEvery * f32(f32(0.6) + f32(f32(0.6) * f32(this._rng.nextDouble()))));
        this.stageClock = 0; this.stageDeaths = 0;
        this.tally.length = 0; this.tallyLine = 0;
        this._newCourier();
        this.p = Phase.Card; this.phaseTime = 0; this._cardSaid = false;
    }

    _newCourier() {
        this.row = LaneField.KerbRow;
        this.x = LaneField.colX(LaneField.StartCol);
        this.hopping = false; this._hopT = 0; this._hopDur = this.hopTime; this._drift = 0; this._queued = -1;
        this.fromRow = this.toRow = this.row;
        this.facing = Dir4.Up;
        this.bestRow = this.row;
        this.courierTimer = this.courierTimeMax; this._lowSec = 99;
        this.bumpTime = 0; this.shieldTime = 0; this.floating = false; this.landTime = 9;
        this.courierNumber++;
        this._courierStart = this._time;
    }

    // the row that counts for hazards: the source row for the first half of a hop, then the target
    get effectiveRow() { return this.hopping ? (this._hopT < f32(this._hopDur * 0.5) ? this.fromRow : this.toRow) : this.row; }

    // the courier's centre right now (a hop in flight interpolates, plus any current drift)
    get courierX() {
        if (!this.hopping) return this.x;
        const f = Math.min(1, f32(this._hopT / this._hopDur));
        return f32(f32(this._fromX + f32(f32(this._toX - this._fromX) * f)) + this._drift);
    }

    // the courier's drawn row position (fractional during a hop)
    get courierRowF() {
        if (!this.hopping) return this.row;
        const f = Math.min(1, f32(this._hopT / this._hopDur));
        return f32(this.fromRow + f32((this.toRow - this.fromRow) * f));
    }

    laneAt(row) { return row >= 0 && row < this.lanes.length ? this.lanes[row] : null; }

    // can slot i take a letter now (not filled, its flap not shut)
    slotOpen(i) { return !this.filled[i] && this.flaps[i].s !== 2; }

    // ------------------------------------------------------------------ step
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        this.worldTime = f32(this.worldTime + dt);
        this._world(dt);
        if (this.bumpTime > 0) this.bumpTime = f32(this.bumpTime - dt);
        if (this.shieldTime > 0) this.shieldTime = f32(this.shieldTime - dt);
        if (this.hurryLeft > 0) { this.hurryLeft = f32(this.hurryLeft - dt); if (this.hurryLeft <= 0) { this.hurryLeft = 0; this.hurryCool = this.hurryCooldown; } }
        else if (this.hurryCool > 0) { this.hurryCool = f32(this.hurryCool - dt); if (this.hurryCool < 0) this.hurryCool = 0; }

        switch (this.p) {
            case Phase.Card:
                if (!this._cardSaid) { this._cardSaid = true; this._emit('card', { stage: this.stage }); }
                if (this.phaseTime >= (this.stagesCleared === 0 && this.courierNumber <= 1 ? this.firstCardSeconds : this.cardSeconds)) this._go();
                break;
            case Phase.Ready:
                if (this.phaseTime >= this.respawnSeconds) this._go();
                break;
            case Phase.Crossing:
                this._crossing(dt, input);
                break;
            case Phase.Delivered:
                if (this.phaseTime >= this.deliveredSeconds) { this._newCourier(); this.p = Phase.Crossing; this.phaseTime = 0; this._emit('next'); }
                break;
            case Phase.Crash:
                if (this.phaseTime >= this.crashSeconds) {
                    if (this.livesLeft <= 0) this._toCard(RoundResult.Lost);
                    else { this._newCourier(); this.p = Phase.Ready; this.phaseTime = 0; }
                }
                break;
            case Phase.Clear:
                if (this.phaseTime >= this.clearSeconds) this._startTally();
                break;
            case Phase.Tally:
                this._tallyStep(dt);
                break;
            case Phase.Final:
                if (this.phaseTime >= this.finalSeconds) this.p = Phase.Over;
                break;
        }
    }

    _go() {
        this.p = Phase.Crossing; this.phaseTime = 0;
        this._cues.emit(SoundCue.Start);
        this._emit('go', { stage: this.stage });
    }

    _toCard(r) {
        this._result = r;
        this.p = Phase.Final; this.phaseTime = 0;
        if (r === RoundResult.Won) {
            this._cues.emit(SoundCue.Win);
            for (let i = 0; i < 24; i++) this._spark('paper', f32(8 + this._fxRng.next(192)), f32(-8 - this._fxRng.next(60)), 10 + i);
        }
    }

    // ------------------------------------------------------------------ the town moves (every phase)
    _world(dt) {
        for (const l of this.lanes) if (l != null) l.advance(dt);
        if (this.weaver != null) {
            const was = this.weaver.beat(f32(this.worldTime - dt), _wb).signal;
            this.weaver.advance(dt);
            if (this.weaver.beat(this.worldTime, _wb).signal && !was && this._weaverOnScreen()) this._emit('blink');
        }
        const crossing = this.p === Phase.Crossing;
        const nearRiver = crossing && this.effectiveRow <= LaneField.MedianRow + 1;

        // the trains: the bell rings `warn` seconds before one noses onto the screen and until it has gone
        for (let r = 7; r <= 12; r++) {
            const l = this.lanes[r];
            if (l == null || !l.rail) continue;
            const was = this.trainEta[r], eta = LaneField.trainEta(l);
            this.trainEta[r] = eta;
            const on = eta > 0 ? eta <= this.warn : true;
            if (on && !this.bellOn[r] && eta > 0) this._emit('bell', { row: r });
            if (eta === 0 && was > 0) { this._emit('train', { row: r }); if (crossing) this.shake = Math.max(this.shake, f32(0.25)); }
            this.bellOn[r] = on;
        }
        // the ferry's horn as it leaves a bank; the mudjaw's jaws as they open (only told while you are near the river)
        for (let r = 1; r <= 5; r++) {
            const l = this.lanes[r];
            if (l == null) continue;
            if (l.shuttle != null) {
                const v0 = l.velAt(-dt);
                if (v0 === 0 && l.speed !== 0) this._emit('horn');
                continue;
            }
            for (const th of l.things) {
                if (th.kind !== ThingKind.Beast) continue;
                const s = LaneField.jawState(th, this.worldTime);
                if (s === 2 && LaneField.jawState(th, f32(this.worldTime - dt)) !== 2 && nearRiver) {
                    const left = l.left(th);
                    if (left < FW && f32(left + th.len) > 0) this._emit('jaws');
                }
            }
        }
        // the snake hisses when you come near it
        const sn = this.lanes[LaneField.MedianRow];
        if (this._hissCool > 0) this._hissCool = f32(this._hissCool - dt);
        if (sn != null && crossing && this._hissCool <= 0) {
            const er = this.effectiveRow;
            if (er >= 5 && er <= 7) {
                const l = sn.left(sn.things[0]);
                if (Math.abs(f32(f32(l + f32(sn.things[0].len * 0.5)) - this.courierX)) < 40) { this._emit('hiss'); this._hissCool = f32(2.5); }
            }
        }
        if (this.dog != null) this._dogStep(dt, crossing);
        if (this.stageDef.flaps) this._flapStep(dt, crossing);
        if (this.stageDef.parcel) this._parcelStep(dt, crossing);

        // the juice ages
        if (this.landTime < 9) this.landTime = f32(this.landTime + dt);
        if (this.extraT < 99) this.extraT = f32(this.extraT + dt);
        if (this.shake > 0) this.shake = Math.max(0, f32(this.shake - dt));
        for (let i = this.fx.length - 1; i >= 0; i--) {
            const p = this.fx[i];
            p.t = f32(p.t + dt);
            if (p.t >= p.life) { this.fx.splice(i, 1); continue; }
            p.x = f32(p.x + f32(p.vx * dt)); p.y = f32(p.y + f32(p.vy * dt));
            if (p.k === 'bit' || p.k === 'drop' || p.k === 'spark') p.vy = f32(p.vy + f32(260 * dt));
            else if (p.k === 'paper') { p.vy = f32(Math.min(40, f32(p.vy + f32(30 * dt)))); p.vx = f32(18 * Math.sin(f32(p.t * 3) + p.c)); }
        }
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const q = this.pops[i];
            q.t = f32(q.t + dt);
            if (q.t >= f32(1.1)) this.pops.splice(i, 1);
        }
    }

    _weaverOnScreen() { const l = this.weaver.left(); return l < FW && f32(l + this.weaver.len) > 0; }

    // THE DOG: trots the median; when you land near it, it crouches (the telegraph, with a bark), then chases you
    // along the median, and gives up a moment after you leave it
    _dogStep(dt, crossing) {
        const g = this.dog;
        const er = this.effectiveRow, cx = this.courierX;
        const onMedian = crossing && er === LaneField.MedianRow;
        switch (g.mode) {
            case 0:
                g.x = f32(g.x + f32(f32(g.face * g.trot) * dt));
                if (g.x < 14) { g.x = f32(14); g.face = 1; } else if (g.x > FW - 14) { g.x = f32(FW - 14); g.face = -1; }
                if (onMedian && Math.abs(f32(cx - g.x)) < 88) { g.mode = 1; g.t = 0; g.face = cx >= g.x ? 1 : -1; this._emit('bark'); }
                break;
            case 1:
                g.t = f32(g.t + dt);
                if (g.t >= f32(0.5)) { g.mode = 2; g.t = 0; }
                break;
            default:
                if (!onMedian) { g.t = f32(g.t + dt); if (g.t > f32(1.0)) { g.mode = 0; g.t = 0; } break; }
                g.t = 0;
                if (Math.abs(f32(cx - g.x)) > 1) {
                    g.face = cx > g.x ? 1 : -1;
                    g.x = f32(g.x + f32(f32(g.face * g.chase) * dt));
                }
                g.x = Math.max(f32(10), Math.min(f32(FW - 10), g.x));
                break;
        }
    }

    // THE FLAPS (Delivery Day): one open slot at a time blinks its flap (the telegraph), then shuts for a while
    _flapStep(dt, crossing) {
        const F = this.stageDef.flaps;
        let busy = false;
        for (let i = 0; i < LaneField.Slots; i++) {
            const f = this.flaps[i];
            if (f.s === 0) continue;
            busy = true;
            f.t = f32(f.t - dt);
            if (f.t > 0) continue;
            if (f.s === 1) {
                f.s = 2; f.t = F.shut; this._emit('flap', { shut: true });
                if (this.stampSlot === i) { this.stampSlot = -1; this._stampTimer = f32(this._stampEvery * f32(0.5)); }
            }
            else { f.s = 0; f.t = 0; this._emit('flap', { shut: false }); }
        }
        if (busy || !crossing || this.slotsFilled >= LaneField.Slots) return;
        this._flapTimer = f32(this._flapTimer - dt);
        if (this._flapTimer > 0) return;
        let n = 0;
        for (let i = 0; i < LaneField.Slots; i++) if (!this.filled[i]) n++;
        let pick = this._rng.next(Math.max(1, n));
        for (let i = 0; i < LaneField.Slots; i++)
            if (!this.filled[i]) { if (pick === 0) { this.flaps[i].s = 1; this.flaps[i].t = F.warn; break; } pick--; }
        this._flapTimer = f32(F.every * f32(f32(0.8) + f32(f32(0.5) * f32(this._rng.nextDouble()))));
    }

    // THE PARCEL: now and then a parcel rides a log; it floats off with the log, or the courier hops on and takes it
    _parcelStep(dt, crossing) {
        const pc = this.parcel;
        if (pc.s === 0) {
            if (!crossing) return;
            this._parcelTimer = f32(this._parcelTimer - dt);
            if (this._parcelTimer > 0) return;
            this._parcelTimer = f32(3);
            // a log (or the ferry) wholly on screen, rows 2-5
            let n = 0;
            for (let r = 2; r <= 5; r++) { const l = this.lanes[r]; if (l != null) for (const th of l.things) if (parcelRide(l, th)) n++; }
            if (n === 0) return;
            let pick = this._rng.next(n);
            for (let r = 2; r <= 5 && pc.s === 0; r++) {
                const l = this.lanes[r];
                if (l == null) continue;
                for (const th of l.things) {
                    if (!parcelRide(l, th)) continue;
                    if (pick-- > 0) continue;
                    pc.s = 1; pc.row = r; pc.th = th; pc.off = f32(f32(th.len - 12) * 0.5); pc.t = 0;
                    this._emit('parcelUp');
                    break;
                }
            }
            return;
        }
        if (pc.s !== 1) return;
        pc.t = f32(pc.t + dt);
        const l = this.lanes[pc.row];
        const px = f32(l.left(pc.th) + pc.off);
        if (px < -12 || px > FW || pc.t > 18) { pc.s = 0; pc.th = null; this._parcelTimer = f32(8 + f32(f32(this._rng.nextDouble()) * 6)); return; }
        if (crossing && !this.hopping && this.row === pc.row && Math.abs(f32(f32(px + 6) - this.x)) <= 10 && this.thingUnder(this.row, this.x) === pc.th) {
            pc.s = 2; pc.th = null;
            this._parcels++;
            this._addScore(PickupPoints);
            this._pop('PARCEL', this.x, f32(this.row * LaneField.Tile), 'teal');
            this._cues.emit(SoundCue.Bonus);
            this._emit('parcel');
        }
    }

    // ------------------------------------------------------------------ crossing
    _crossing(dt, input) {
        this.stageClock = f32(this.stageClock + dt);
        // ---- the panel
        if (input != null) {
            if (input.pressed(Pad.A) && this.hurryReady) { this.hurryLeft = this.hurrySeconds; this._hurries++; this._emit('hurry'); }
            const d = input.pressedDir4();
            if (d >= 0) {
                if (this.hopping) this._queued = d;          // one press is remembered through a hop
                else this._tryHop(d);
            }
        }

        // ---- the courier moves
        if (this.hopping) {
            this._hopT = f32(this._hopT + dt);
            const er = this.effectiveRow;
            if (!this._hopNoDrift && LaneField.kindOf(er) === RowKind.River) this._drift = f32(this._drift + f32(this.lanes[er].speed * dt));
            if (this._hopT >= this._hopDur) { this._land(); if (this.p !== Phase.Crossing) return; }
        }
        else if (LaneField.kindOf(this.row) === RowKind.River)
            this.x = f32(this.x + f32(this.lanes[this.row].speed * dt));   // riding (or, on the mercy credit, treading water)

        // ---- hazards
        if (this._hazards()) return;

        // ---- the clock
        this.courierTimer = f32(this.courierTimer - dt);
        if (this.courierTimer <= 0) {
            if (this.invulnerable) this.courierTimer = 0;
            else { this._die(DeathKind.TimeUp); return; }
        }
        const sec = Math.ceil(this.courierTimer);
        if (sec <= 10 && sec < this._lowSec && !this.invulnerable) { this._lowSec = sec; this._emit('lowTime', { sec }); }

        // ---- the stamp
        if (this.stampSlot >= 0) {
            this.stampLeft = f32(this.stampLeft - dt);
            if (this.stampLeft <= 0 || !this.slotOpen(this.stampSlot)) {
                this.stampSlot = -1;
                this._stampTimer = f32(this._stampEvery * f32(f32(0.7) + f32(f32(0.6) * f32(this._rng.nextDouble()))));
            }
        }
        else {
            this._stampTimer = f32(this._stampTimer - dt);
            if (this._stampTimer <= 0 && this.slotsFilled < LaneField.Slots) {
                let open = 0;
                for (let i = 0; i < LaneField.Slots; i++) if (this.slotOpen(i)) open++;
                if (open > 0) {
                    let pick = this._rng.next(open);
                    for (let i = 0; i < LaneField.Slots; i++)
                        if (this.slotOpen(i)) { if (pick === 0) { this.stampSlot = i; break; } pick--; }
                    this.stampLeft = this.stampSeconds;
                    this._emit('stampUp');
                }
                else this._stampTimer = f32(1);
            }
        }
    }

    // the slot whose mouth the courier is in front of (within slotTol px), or -1
    slotAt(x) {
        for (let i = 0; i < LaneField.Slots; i++)
            if (Math.abs(f32(x - LaneField.slotX(i))) <= this.slotTol) return i;
        return -1;
    }

    _tryHop(d) {
        let dest = this.row;
        let tx = this.x;
        this._hopNoDrift = false;
        if (d === Dir4.Up) {
            if (this.row <= LaneField.HomeRow) return;
            dest = this.row - 1;
            if (dest === LaneField.HomeRow) {
                const s = this.slotAt(this.x);
                if (s < 0 || !this.slotOpen(s)) {
                    // the wall, a slot already lit or a shut flap: refused, no life lost
                    this.bumpTime = f32(0.3); this._blocked++;
                    this._cues.emit(SoundCue.Miss);
                    this._emit('bump');
                    this.facing = Dir4.Up;
                    return;
                }
                tx = LaneField.slotX(s);
                this._hopNoDrift = true;
            }
        }
        else if (d === Dir4.Down) {
            if (this.row >= LaneField.KerbRow) return;
            dest = this.row + 1;
        }
        else {
            tx = f32(this.x + Dir4.dx(d) * LaneField.Tile);
            if (LaneField.isLand(this.row) && (tx < 8 || tx > FW - 8)) { this.facing = d; return; }
            if (this.invulnerable && (tx < 8 || tx > FW - 8)) { this.facing = d; return; }
        }
        this.hopping = true; this._hopT = 0; this._hopDur = this.currentHopTime; this._drift = 0;
        this.fromRow = this.row; this.toRow = dest; this._fromX = this.x; this._toX = tx;
        this.facing = d;
        this._hops++;
        this._cues.emit(SoundCue.Tick);
        this._emit('hop', { dir: d, row: dest, up: dest < this.bestRow });
    }

    _land() {
        this.x = f32(this._toX + this._drift);
        this.row = this.toRow;
        this.hopping = false; this._drift = 0;
        this.landTime = 0;
        if (this.row < this.bestRow) { this.bestRow = this.row; this._addScore(HopPoints); }
        if (this.row === LaneField.HomeRow) { this._deliver(this.slotAt(this.x)); return; }
        const k = LaneField.kindOf(this.row);
        if (k === RowKind.River) {
            const th = this.thingUnder(this.row, this.x);
            if (th == null) { if (!this.invulnerable) { this._die(DeathKind.Splash); return; } }
            else if (this._bites(th)) { if (!this.invulnerable) { this._die(DeathKind.Snapped); return; } }
        }
        else if (this.landTime === 0 && (k === RowKind.Kerb || k === RowKind.Median)) {
            for (let i = 0; i < 3; i++) this._spark('dust', f32(this.x + f32(this._fxRng.next(9) - 4)), f32(this.row * LaneField.Tile + 13), 0);
        }
        if (this._queued >= 0) { const q = this._queued; this._queued = -1; this._tryHop(q); }
    }

    _deliver(s) {
        if (s < 0) s = 0;
        this.filled[s] = true;
        this.slotsFilled++;
        this._deliveries++;
        this._crossSum += f32(this._time - this._courierStart);
        const sx = LaneField.slotX(s);
        let pts = SlotPoints + SecondPoints * Math.ceil(Math.max(0, this.courierTimer));
        this._pop('+' + pts, sx, f32(LaneField.Tile + 2), 'yellow');
        if (this.stampSlot === s) {
            this._stamps++; this.stampSlot = -1;
            this._addScore(StampPoints);
            this._pop('STAMP 200', sx, f32(LaneField.Tile + 12), 'teal');
            this._cues.emit(SoundCue.Bonus); this._emit('stamp');
        }
        if (this.parcel.s === 2) {
            this.parcel.s = 0; this._parcelTimer = f32(6 + f32(f32(this._rng.nextDouble()) * 6));
            this._addScore(ParcelPoints);
            this._pop('PARCEL 500', sx, f32(LaneField.Tile + 22), 'green');
            this._cues.emit(SoundCue.Bonus); this._emit('parcelIn');
        }
        this._addScore(pts);
        this.lastSlot = s;
        for (let i = 0; i < 6; i++) this._spark('paper', f32(sx + f32(this._fxRng.next(13) - 6)), f32(8), i);
        this._cues.emit(SoundCue.Hit);
        this._emit('slot', { n: this.slotsFilled, stage: this.stage });
        this._queued = -1;
        if (this.slotsFilled >= LaneField.Slots) {
            this.p = Phase.Clear; this.phaseTime = 0;
            this._cues.emit(SoundCue.Bonus);
            this._emit('allFive', { stage: this.stage, last: this.stage >= this.lastStage });
        }
        else { this.p = Phase.Delivered; this.phaseTime = 0; }
    }

    // ------------------------------------------------------------------ the tally
    _startTally() {
        const n = this.stage, S = this.stageDef;
        this.tally.length = 0;
        this.tally.push({ label: n >= this.lastStage ? 'DELIVERY DAY' : 'STAGE ' + n + ' CLEAR', value: n >= this.lastStage ? FinalePoints : StagePoints * n, counted: 0 });
        const under = Math.max(0, Math.floor(f32(S.par - this.stageClock)));
        this.tally.push({ label: 'TIME BONUS', value: ParPoints * under, counted: 0 });
        this.tally.push({ label: 'NO SPILLS', value: this.stageDeaths === 0 ? CleanPoints : 0, counted: 0 });
        this.tallyLine = -1;
        this._tallyBase = this._score;
        this._countT = 0;
        this.stagesCleared++;
        this.p = Phase.Tally; this.phaseTime = 0;
    }

    // one line at a time: it counts up into the score over half a second, then a ding
    _tallyStep(dt) {
        const L = this.tally, T = this.tallyLineSeconds;
        const i = Math.min(L.length - 1, Math.floor(f32(f32(this.phaseTime - f32(0.35)) / T)));
        if (i > this.tallyLine && i >= 0) { this.tallyLine = i; this._countT = 0; }
        if (this.tallyLine >= 0) {
            const ln = L[this.tallyLine];
            const lt = f32(f32(this.phaseTime - f32(0.35)) - f32(this.tallyLine * T));
            const want = lt >= f32(0.5) ? ln.value : Math.floor(f32(f32(ln.value * lt) / f32(0.5)) / 10) * 10;
            if (want > ln.counted) {
                const was = ln.counted;
                ln.counted = want;
                this._addScore(want - was);
                this._countT = f32(this._countT - dt);
                if (this._countT <= 0 && want < ln.value) { this._countT = f32(0.06); this._emit('count'); }
                if (want === ln.value) this._emit('tally', { line: this.tallyLine, value: ln.value });
            }
            else if (ln.value === 0 && lt >= 0 && !ln.said) { ln.said = true; this._emit('tally', { line: this.tallyLine, value: 0 }); }
        }
        if (this.phaseTime >= f32(f32(f32(0.35) + f32(L.length * T)) + this.tallyHold)) {
            for (const ln of L) if (ln.counted < ln.value) { this._addScore(ln.value - ln.counted); ln.counted = ln.value; }
            if (this.stage >= this.lastStage) this._toCard(RoundResult.Won);
            else this._startStage(this.stage + 1);
        }
    }

    get tallyTotal() { let s = 0; for (const ln of this.tally) s += ln.counted; return s; }

    _addScore(pts) {
        if (pts <= 0) return;
        this._score += pts;
        while (this._score >= this.nextExtra) {
            this.nextExtra += this._extraEvery;
            this.livesLeft++; this.livesMax = Math.max(this.livesMax, this.livesLeft);
            this._extras++;
            this.extraT = 0;
            this._cues.emit(SoundCue.Bonus);
            this._emit('extra', { lives: this.livesLeft });
        }
    }

    _pop(text, x, y, c) {
        if (this.pops.length >= MaxPops) this.pops.shift();
        this.pops.push({ text, x: f32(x), y: f32(y), t: 0, c });
    }

    _spark(k, x, y, seed) {
        if (this.fx.length >= MaxFx) this.fx.shift();
        const R = this._fxRng;
        const p = { k, x: f32(x), y: f32(y), vx: 0, vy: 0, t: 0, life: f32(0.6), c: R.next(3) };
        switch (k) {
            case 'dust': p.vx = f32(R.next(41) - 20); p.vy = f32(-6 - R.next(10)); p.life = f32(0.35); break;
            case 'drop': p.vx = f32(R.next(81) - 40); p.vy = f32(-70 - R.next(70)); p.life = f32(0.7); break;
            case 'bit': p.vx = f32(R.next(161) - 80); p.vy = f32(-60 - R.next(90)); p.life = f32(0.9); break;
            case 'spark': p.vx = f32(R.next(121) - 60); p.vy = f32(-90 - R.next(60)); p.life = f32(0.6); break;
            case 'paper': p.vx = 0; p.vy = f32(10 + R.next(20)); p.life = f32(seed > 9 ? 4.5 : 0.9); p.c = f32(R.next(628) / 100); break;
        }
        this.fx.push(p);
    }

    // ------------------------------------------------------------------ what is where
    // is there something rideable under x in a river row right now
    supported(row, x) { return this.thingUnder(row, x) != null; }

    thingUnder(row, x) {
        const lane = this.laneAt(row);
        if (lane == null || lane.kind !== RowKind.River) return null;
        for (const th of lane.things) {
            const l = lane.left(th);
            if (x >= f32(l + 1) && x <= f32(f32(l + th.len) - 1)) {
                if (th.kind === ThingKind.Turtles && LaneField.turtleState(th, this.worldTime, this.diveUnder) === 2) continue;
                return th;
            }
        }
        return null;
    }

    // a mudjaw with its jaws open and the courier on its head
    _bites(th) {
        if (th.kind !== ThingKind.Beast || LaneField.jawState(th, this.worldTime) !== 2) return false;
        const lane = this.lanes[this.row];
        return LaneField.onHead(lane.left(th), th.len, lane.dir, this.x);
    }

    // the vehicle touching the courier's box in a road row, or null
    vehicleAt(row, x) {
        const lane = this.laneAt(row);
        if (lane == null || lane.kind !== RowKind.Road) return null;
        for (const th of lane.things) {
            const l = lane.left(th);
            if (f32(x + HalfW) > f32(l + 1) && f32(x - HalfW) < f32(f32(l + th.len) - 1)) return th;
        }
        return null;
    }

    // the weaver over the courier's box in `row` right now
    weaverAt(row, x) {
        const w = this.weaver;
        if (w == null || !w.covers(row, this.worldTime)) return false;
        const l = w.left();
        return f32(x + HalfW) > f32(l + 1) && f32(x - HalfW) < f32(f32(l + w.len) - 1);
    }

    // the snake or the dog on the courier's box on the median
    biterAt(x) {
        const sn = this.lanes[LaneField.MedianRow];
        if (sn != null) {
            const th = sn.things[0], l = sn.left(th);
            if (f32(x + HalfW) > f32(l + SnakeIn) && f32(x - HalfW) < f32(f32(l + th.len) - SnakeIn)) return true;
        }
        const g = this.dog;
        return g != null && Math.abs(f32(x - g.x)) < f32(DogHalf + HalfW);
    }

    _hazards() {
        const er = this.effectiveRow;
        const cx = this.courierX;
        const kind = LaneField.kindOf(er);
        if (kind === RowKind.Road) {
            const th = this.vehicleAt(er, cx);
            if (th != null || this.weaverAt(er, cx)) {
                if (this._shield()) { /* passes through */ }
                else { this._die(th != null && th.kind === ThingKind.Train ? DeathKind.Train : DeathKind.Crash); return true; }
            }
        }
        else if (kind === RowKind.Median && this.biterAt(cx)) {
            if (!this._shield()) { this._die(DeathKind.Bitten); return true; }
        }
        if (!this.hopping && kind === RowKind.River) {
            const th = this.thingUnder(this.row, this.x);
            if (th == null) {
                if (this.invulnerable) { if (!this.floating) this._emit('buoy'); this.floating = true; }
                else { this._die(DeathKind.Splash); return true; }
            }
            else {
                this.floating = false;
                if (this._bites(th) && !this._shield()) { this._die(DeathKind.Snapped); return true; }
            }
            if (this.x < 3 || this.x > FW - 3) {
                if (this.invulnerable) this.x = Math.max(8, Math.min(FW - 8, this.x));
                else { this._die(DeathKind.Swept); return true; }
            }
        }
        else if (!this.hopping) this.floating = false;
        return false;
    }

    // the mercy shield takes the hit (credit 5 only); true if it did
    _shield() {
        if (!this.invulnerable) return false;
        if (this.shieldTime <= 0) { this._cues.emit(SoundCue.Miss); this._emit('shield'); }
        this.shieldTime = f32(0.35);
        return true;
    }

    _die(k) {
        this.death = k;
        this.deathX = this.courierX;
        this.deathRow = this.effectiveRow;
        if (this.hopping) { this.x = this.courierX; this.row = this.deathRow; this.hopping = false; }
        this.livesLeft--;
        this._deaths[k]++;
        this._stageDeaths[this.stage]++;
        this.stageDeaths++;
        const cy = f32(this.deathRow * LaneField.Tile + 8);
        if (k === DeathKind.Crash || k === DeathKind.Train) {
            for (let i = 0; i < (k === DeathKind.Train ? 16 : 10); i++) this._spark(i % 3 === 0 ? 'spark' : 'bit', this.deathX, cy, 0);
            this.shake = Math.max(this.shake, k === DeathKind.Train ? f32(0.5) : f32(0.3));
        }
        else if (k === DeathKind.Splash || k === DeathKind.Swept || k === DeathKind.Snapped) {
            for (let i = 0; i < 10; i++) this._spark('drop', this.deathX, cy, 0);
            if (k === DeathKind.Snapped) this.shake = Math.max(this.shake, f32(0.25));
        }
        else if (k === DeathKind.Bitten) this.shake = Math.max(this.shake, f32(0.2));
        if (this.parcel.s === 2) {
            this.parcel.s = 0; this._parcelTimer = f32(8);
            this._emit('parcelLost');
        }
        this._cues.emit(SoundCue.Die);
        this._emit('die', { how: DeathNames[k], lives: this.livesLeft });
        this._queued = -1;
        this.p = Phase.Crash; this.phaseTime = 0;
    }

    collectStats(into) {
        add(into, 'stages', this.stagesCleared);
        add(into, 'slots', this._deliveries);
        add(into, 'crash', this._deaths[DeathKind.Crash]);
        add(into, 'splash', this._deaths[DeathKind.Splash]);
        add(into, 'swept', this._deaths[DeathKind.Swept]);
        add(into, 'timeup', this._deaths[DeathKind.TimeUp]);
        add(into, 'bitten', this._deaths[DeathKind.Bitten]);
        add(into, 'snapped', this._deaths[DeathKind.Snapped]);
        add(into, 'train', this._deaths[DeathKind.Train]);
        for (let s = 1; s <= this.lastStage; s++) add(into, 'diedOn' + s, this._stageDeaths[s]);
        add(into, 'stamps', this._stamps);
        add(into, 'parcels', this._parcels);
        add(into, 'extras', this._extras);
        add(into, 'blocked', this._blocked);
        add(into, 'hurry', this._hurries);
        add(into, 'hops', this._hops);
        add(into, 'crossSec', this._deliveries > 0 ? this._crossSum / this._deliveries : 0);
    }
}

const _wb = { row: 0, other: -1, signal: false, frac: 0 };

// a log or the ferry wholly on screen can take the parcel
function parcelRide(l, th) {
    if (th.kind !== ThingKind.Log && th.kind !== ThingKind.Ferry) return false;
    const left = l.left(th);
    return left >= 8 && f32(left + th.len) <= FW - 8;
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

LaneJumperRound.Phase = Phase;
LaneJumperRound.HalfW = HalfW;
LaneJumperRound.DogHalf = DogHalf;
LaneJumperRound.SnakeIn = SnakeIn;
LaneJumperRound.HopPoints = HopPoints;
LaneJumperRound.SlotPoints = SlotPoints;
LaneJumperRound.SecondPoints = SecondPoints;
LaneJumperRound.StampPoints = StampPoints;
LaneJumperRound.ParcelPoints = ParcelPoints;
