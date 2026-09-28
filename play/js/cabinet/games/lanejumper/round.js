// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of LaneJumperSim.cs (Staging/Batch2/lanejumper), f32 throughout.
//
// A courier on a bike hops (4-way, one 16 px tile per hop) from the bottom kerb across six
// traffic lanes, the median and a five-row river into one of five MAIL SLOTS on the far kerb.
//   - a vehicle touching the courier = CRASH (a life); landing in the water or riding a turtle
//     group that dives = SPLASH; riding a log off the edge of the screen = SWEPT; 60 s per courier
//     and the clock resets on a slot = TIME UP
//   - a filled slot lights up and cannot be entered; a hop into the wall or a filled slot is
//     refused (a thunk, no life lost). A bonus FLY sits in an empty slot now and then.
//   - Button A = HURRY: hops take half the time for 1 s, then 4 s to recharge.
//   - Score: 10 a hop onto a row this courier has not reached, 50 + 10 per second left on a slot,
//     200 for the fly. The round is won when all five slots are filled; 3 lives.
//
// PHASES -> CabinetState: Ready -> Intro, Crossing -> Playing, Delivered / Crash / AllFive ->
// Interlude, Card -> Card, Over -> Over. The world (traffic, river) keeps moving in every phase.
//
// MERCY (Core): the knobs widen every lane's guaranteed safe gap (and its minimum gap) and close
// the river's water gaps per round lost on the cabinet. CreditInfo.unlosable (credit 5): the
// courier cannot die: vehicles pass through a shield, he treads water, the banks hold him and the
// clock never runs out. The result still comes from the game: five letters delivered.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4 } from '../../sdk/index.js';
import { LaneField, RowKind, ThingKind } from './field.js';

export const DeathKind = Object.freeze({ None: 0, Crash: 1, Splash: 2, Swept: 3, TimeUp: 4 });
export const LaneEventKind = Object.freeze({ Courier: 0, Hop: 1, Blocked: 2, Slot: 3, Fly: 4, Death: 5, AllFive: 6, Hurry: 7 });

const Phase = Object.freeze({ Idle: 0, Ready: 1, Crossing: 2, Delivered: 3, Crash: 4, AllFive: 5, Card: 6, Over: 7 });

const HalfW = f32(5);                   // the courier's hit box half width against vehicles
const HopPoints = 10, SlotPoints = 50, SecondPoints = 10, FlyPoints = 200;
const FW = LaneField.FieldW;

export class LaneJumperRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.readySeconds = f32(2.5); this.respawnSeconds = f32(1.2); this.deliveredSeconds = f32(1.6);
        this.crashSeconds = f32(2.0); this.allFiveSeconds = f32(2.5); this.cardSeconds = f32(4.0);
        this.flySeconds = f32(5);

        // ---- read-only state
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.worldTime = 0;
        this.lanes = null;
        this.credit = null;

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

        // hurry (button A)
        this.hurryLeft = 0;                     // > 0 = the burst is on
        this.hurryCool = 0;                     // > 0 = recharging
        this.hurrySeconds = f32(1); this.hurryCooldown = f32(4);

        // slots, fly, lives
        this.filled = new Array(LaneField.Slots).fill(false);
        this.flyWasHere = new Array(LaneField.Slots).fill(false);
        this.slotsFilled = 0;
        this.flySlot = -1;
        this.flyLeft = 0;
        this.lastSlot = -1;
        this.lastPoints = 0;
        this.livesLeft = 0; this.livesMax = 0;
        this.courierNumber = 0;

        // the last death
        this.death = DeathKind.None;
        this.deathX = 0;
        this.deathRow = 0;

        this.log = [];                          // LaneEvent { t, kind, row, x, data }

        // knobs as resolved for this credit
        this.hopTime = 0; this.slotTol = 0; this.diveUnder = 0; this.safeGap = 0; this.waterGap = 0;

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0;
        this._time = 0;
        this._hopT = 0; this._hopDur = 0; this._fromX = 0; this._toX = 0; this._drift = 0; this._flyTimer = 0; this._flyEvery = 0;
        this._hopNoDrift = false;
        this._queued = -1;
        this._courierStart = 0;
        // stats
        this._hops = 0; this._blocked = 0; this._hurries = 0; this._flies = 0;
        this._crashes = 0; this._splashes = 0; this._swept = 0; this._timeups = 0; this._deliveries = 0;
        this._crossSum = 0;                     // double
    }

    get invulnerable() { return this.credit != null && this.credit.unlosable; }
    get hopFrac() { return this.hopping ? Math.min(1, f32(this._hopT / this._hopDur)) : 0; }
    get hurryReady() { return this.hurryLeft <= 0 && this.hurryCool <= 0; }
    get roundWon() { return this._result === RoundResult.Won; }
    get currentHopTime() { return this.hurryLeft > 0 ? f32(this.hopTime * 0.5) : this.hopTime; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Crossing: return CabinetState.Playing;
            case Phase.Delivered:
            case Phase.Crash:
            case Phase.AllFive: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
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
        return r + ' slots ' + this.slotsFilled + '/5 lives ' + this.livesLeft + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's' +
            ' deaths c' + this._crashes + ' s' + this._splashes + ' w' + this._swept + ' t' + this._timeups + ' flies ' + this._flies;
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(LaneField.mixSeed(seed === 0 ? (Date.now() | 0) : seed));
        this.hopTime = k.get('hopTime');
        this.slotTol = k.get('slotTol');
        this.diveUnder = k.get('diveUnder');
        this.safeGap = k.get('safeGap');
        this.waterGap = k.get('waterGap');
        this.courierTimeMax = k.get('courierTime');
        this.livesMax = this.livesLeft = Math.max(1, roundEven(k.get('lives')));
        this._flyEvery = k.get('flyEvery');
        this.lanes = LaneField.build(this._rng, k.get('roadSpeed'), k.get('riverSpeed'), k.get('laneGap'), this.safeGap, k.get('gapSpread'),
            this.waterGap, k.get('turtleDive'));

        for (let i = 0; i < LaneField.Slots; i++) { this.filled[i] = false; this.flyWasHere[i] = false; }
        this.slotsFilled = 0; this.flySlot = -1; this.flyLeft = 0; this.lastSlot = -1; this.lastPoints = 0;
        this._flyTimer = f32(this._flyEvery * f32(f32(0.6) + f32(f32(0.6) * f32(this._rng.nextDouble()))));
        this._score = 0; this._time = 0; this.worldTime = 0;
        this.hurryLeft = 0; this.hurryCool = 0;
        this._hops = this._blocked = this._hurries = this._flies = this._crashes = this._splashes = this._swept = this._timeups = this._deliveries = 0;
        this._crossSum = 0;
        this.courierNumber = 0;
        this.death = DeathKind.None;
        this._result = RoundResult.None;
        this.log.length = 0;
        this._cues.resetTotals();
        this._newCourier();
        this.p = Phase.Ready; this.phaseTime = 0;
    }

    _newCourier() {
        this.row = LaneField.KerbRow;
        this.x = LaneField.colX(LaneField.StartCol);
        this.hopping = false; this._hopT = 0; this._hopDur = this.hopTime; this._drift = 0; this._queued = -1;
        this.fromRow = this.toRow = this.row;
        this.facing = Dir4.Up;
        this.bestRow = this.row;
        this.courierTimer = this.courierTimeMax;
        this.bumpTime = 0; this.shieldTime = 0; this.floating = false;
        this.courierNumber++;
        this._courierStart = this._time;
        this._note(LaneEventKind.Courier, this.courierNumber);
    }

    _note(kind, data) {
        this.log.push({ t: this._time, kind, row: this.effectiveRow, x: this.courierX, data });
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

    // ------------------------------------------------------------------ step
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        this.worldTime = f32(this.worldTime + dt);
        for (const l of this.lanes) if (l != null) l.advance(dt);
        if (this.bumpTime > 0) this.bumpTime = f32(this.bumpTime - dt);
        if (this.shieldTime > 0) this.shieldTime = f32(this.shieldTime - dt);
        if (this.hurryLeft > 0) { this.hurryLeft = f32(this.hurryLeft - dt); if (this.hurryLeft <= 0) { this.hurryLeft = 0; this.hurryCool = this.hurryCooldown; } }
        else if (this.hurryCool > 0) { this.hurryCool = f32(this.hurryCool - dt); if (this.hurryCool < 0) this.hurryCool = 0; }

        switch (this.p) {
            case Phase.Ready:
                if (this.phaseTime >= (this.courierNumber <= 1 && this.slotsFilled === 0 && this.livesLeft === this.livesMax ? this.readySeconds : this.respawnSeconds)) {
                    this.p = Phase.Crossing; this.phaseTime = 0; this._cues.emit(SoundCue.Start);
                }
                break;
            case Phase.Crossing:
                this._crossing(dt, input);
                break;
            case Phase.Delivered:
                if (this.phaseTime >= this.deliveredSeconds) { this._newCourier(); this.p = Phase.Crossing; this.phaseTime = 0; this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Crash:
                if (this.phaseTime >= this.crashSeconds) {
                    if (this.livesLeft <= 0) this._toCard(RoundResult.Lost);
                    else { this._newCourier(); this.p = Phase.Ready; this.phaseTime = 0; }
                }
                break;
            case Phase.AllFive:
                if (this.phaseTime >= this.allFiveSeconds) this._toCard(RoundResult.Won);
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _toCard(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    _crossing(dt, input) {
        // ---- the panel
        if (input != null) {
            if (input.pressed(Pad.A) && this.hurryReady) { this.hurryLeft = this.hurrySeconds; this._hurries++; this._note(LaneEventKind.Hurry, 0); }
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

        // ---- the fly
        if (this.flySlot >= 0) {
            this.flyLeft = f32(this.flyLeft - dt);
            if (this.flyLeft <= 0 || this.filled[this.flySlot]) {
                this.flySlot = -1;
                this._flyTimer = f32(this._flyEvery * f32(f32(0.7) + f32(f32(0.6) * f32(this._rng.nextDouble()))));
            }
        }
        else {
            this._flyTimer = f32(this._flyTimer - dt);
            if (this._flyTimer <= 0 && this.slotsFilled < LaneField.Slots) {
                const empty = LaneField.Slots - this.slotsFilled;
                let pick = this._rng.next(empty);
                for (let i = 0; i < LaneField.Slots; i++)
                    if (!this.filled[i]) { if (pick === 0) { this.flySlot = i; break; } pick--; }
                this.flyLeft = this.flySeconds;
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
                if (s < 0 || this.filled[s]) {
                    // the wall, or a slot already lit: refused, no life lost
                    this.bumpTime = f32(0.3); this._blocked++;
                    this._cues.emit(SoundCue.Miss);
                    this._note(LaneEventKind.Blocked, s);
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
        this._note(LaneEventKind.Hop, d);
    }

    _land() {
        this.x = f32(this._toX + this._drift);
        this.row = this.toRow;
        this.hopping = false; this._drift = 0;
        if (this.row < this.bestRow) { this.bestRow = this.row; this._score += HopPoints; }
        if (this.row === LaneField.HomeRow) { this._deliver(this.slotAt(this.x)); return; }
        if (LaneField.kindOf(this.row) === RowKind.River && !this.supported(this.row, this.x)) { if (!this.invulnerable) { this._die(DeathKind.Splash); return; } }
        if (this._queued >= 0) { const q = this._queued; this._queued = -1; this._tryHop(q); }
    }

    _deliver(s) {
        if (s < 0) s = 0;
        this.filled[s] = true;
        this.slotsFilled++;
        this._deliveries++;
        this._crossSum += f32(this._time - this._courierStart);
        let pts = SlotPoints + SecondPoints * Math.ceil(Math.max(0, this.courierTimer));
        if (this.flySlot === s) {
            pts += FlyPoints; this._flies++; this.flyWasHere[s] = true; this.flySlot = -1;
            this._cues.emit(SoundCue.Bonus); this._note(LaneEventKind.Fly, s);
        }
        this._score += pts;
        this.lastSlot = s; this.lastPoints = pts;
        this._cues.emit(SoundCue.Hit);
        this._note(LaneEventKind.Slot, s);
        this._queued = -1;
        if (this.slotsFilled >= LaneField.Slots) { this.p = Phase.AllFive; this.phaseTime = 0; this._note(LaneEventKind.AllFive, 0); }
        else { this.p = Phase.Delivered; this.phaseTime = 0; }
    }

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

    _hazards() {
        const er = this.effectiveRow;
        const cx = this.courierX;
        const kind = LaneField.kindOf(er);
        if (kind === RowKind.Road && this.vehicleAt(er, cx) != null) {
            if (this.invulnerable) { if (this.shieldTime <= 0) this._cues.emit(SoundCue.Miss); this.shieldTime = f32(0.35); }
            else { this._die(DeathKind.Crash); return true; }
        }
        if (!this.hopping && kind === RowKind.River) {
            if (!this.supported(this.row, this.x)) {
                if (this.invulnerable) this.floating = true;
                else { this._die(DeathKind.Splash); return true; }
            }
            else this.floating = false;
            if (this.x < 3 || this.x > FW - 3) {
                if (this.invulnerable) this.x = Math.max(8, Math.min(FW - 8, this.x));
                else { this._die(DeathKind.Swept); return true; }
            }
        }
        else if (!this.hopping) this.floating = false;
        return false;
    }

    _die(k) {
        this.death = k;
        this.deathX = this.courierX;
        this.deathRow = this.effectiveRow;
        if (this.hopping) { this.x = this.courierX; this.row = this.deathRow; this.hopping = false; }
        this.livesLeft--;
        switch (k) {
            case DeathKind.Crash: this._crashes++; break;
            case DeathKind.Splash: this._splashes++; break;
            case DeathKind.Swept: this._swept++; break;
            default: this._timeups++; break;
        }
        this._cues.emit(SoundCue.Die);
        this._note(LaneEventKind.Death, k);
        this._queued = -1;
        this.p = Phase.Crash; this.phaseTime = 0;
    }

    collectStats(into) {
        add(into, 'slots', this.slotsFilled);
        add(into, 'crash', this._crashes);
        add(into, 'splash', this._splashes);
        add(into, 'swept', this._swept);
        add(into, 'timeup', this._timeups);
        add(into, 'flies', this._flies);
        add(into, 'blocked', this._blocked);
        add(into, 'hurry', this._hurries);
        add(into, 'hops', this._hops);
        add(into, 'crossSec', this._deliveries > 0 ? this._crossSum / this._deliveries : 0);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

LaneJumperRound.Phase = Phase;
LaneJumperRound.HalfW = HalfW;
LaneJumperRound.HopPoints = HopPoints;
LaneJumperRound.SlotPoints = SlotPoints;
LaneJumperRound.SecondPoints = SecondPoints;
LaneJumperRound.FlyPoints = FlyPoints;
