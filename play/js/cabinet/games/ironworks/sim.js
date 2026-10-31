// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · THE ROUND (ICabinetSim).
// Built out from the one-board port of IronworksSim.cs (2026-10-18): a coin now buys the whole works.
//
// A GAME = five boards (boards.js), climbed in order. Each one:
//   the BOARD CARD  (Intro: number, name, a one-line hint, the board frozen behind it)
//   -> the climb    (Playing) -> TOPPED OUT (Interlude: the foreman runs for the next board, the bonus
//                   is counted into the score) -> the next card.
//   Board 5's clear is the finale: the gantry comes down with the foreman on it. That is ROUND WON.
//   A life is lost to a drum, a cart, a fire-ball, a spring or the bonus reaching 0: KNOCKED DOWN
//   (Interlude), then GET READY and the board starts over from the bottom (the 1981 rule). Bolts that
//   are out stay out; drums, fire-balls, hammers, the belts and the cages all start again.
//   Three climbers, and one more at EXTRA_AT points. The last one down is GAME OVER.
//
//   the CLIMBER   stick left/right walks, up/down climbs a whole ladder (lined up within 4 px),
//                 A (or B) = a fixed short hop (0.5 s, 18 px high) that keeps the walk's momentum: it
//                 clears ONE drum, cart or fire-ball (100 points) and carries you over an open gap.
//                 On a belt you are carried; onto a cage you step only when it is level with the ledge.
//   the HAMMER    floats at jump height; jump into it and swing for hammerSeconds: anything the swing
//                 touches is smashed for 300, but no climbing and no jumping while it swings
//   PICKUPS       a hard hat 300, a lunch pail 500, a toolbox 800: walk into them
//   BOLTS         (boards 4 and 5) walk into one to pull it: 200 (board 5's gantry bolts 500)
//   the BONUS     each board's starts high and loses 100 every timerStep seconds; what is left is
//                 counted into the score at the top
//
// THE FOREMAN, board by board: throws DRUMS that roll down the slopes (1), tips ORE CARTS onto the belts
// (2), lets SPRING JACKS go along the top (3), stamps on his stand while the oil drum spits SPARKS (4),
// and drops drums both ways off his gantry (5), faster for every bolt you pull.
// A drum that rolls into the oil drum (or the furnace) burns: it spits a FIRE-BALL while there is room
// (fireMax); a HOT drum always does. From board 2 on, fire-balls climb ladders.
//
// MERCY: knobs ease per loss (spec.js). On the unlosable credit everything crawls and the climber CANNOT
// DIE: whatever touches him is knocked apart (no points) and the bonus stops at 0 instead of costing a
// life. THE RESULT COMES FROM THE GAME: the last board's gantry, or the last climber. Never the clock.
// The sim keeps the SDK's eight cues and says more as events (recordEvents / events / _emit, Starvector's
// way) for the palette in sound.js. Floats are C# floats: f32() at every stored value.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { Board, Pickup } from './level.js';
import { BOARDS } from './boards.js';
import { DrumSpeedBase } from './spec.js';

const Phase = Object.freeze({ Idle: 0, Stage: 1, Ready: 2, Climb: 3, Down: 4, Clear: 5, Card: 6, Over: 7 });
const Mode = Object.freeze({ Walk: 0, Jump: 1, Ladder: 2, Dead: 3, Top: 4 });
const DrumMode = Object.freeze({ Roll: 0, Fall: 1, Ladder: 2, Drop: 3 });
const Kind = Object.freeze({ Drum: 0, Hot: 1, Cart: 2 });
const FireMode = Object.freeze({ Hop: 0, Wander: 1, Ladder: 2, Patrol: 3 });
const SpringMode = Object.freeze({ Bounce: 0, Drop: 1 });
const Cause = Object.freeze({ None: 0, Drum: 1, Fire: 2, Timer: 3, Spring: 4, Cart: 5 });

// ------------------------------------------------------------------ the machine (not mercy knobs)
const JumpV0 = f32(144);                 // px/s up: 0.5 s air, 18 px apex
const JumpG = f32(576);
const DrumGravity = f32(420);
const DropSpeed = f32(150);
const LadderDrumMul = f32(0.75);         // a drum goes down a ladder at 3/4 of its roll speed
const LadderGrab = f32(4);               // how close to a ladder's line you must stand
const ClimberHalfW = f32(3), ClimberH = f32(13);
const DrumHalf = f32(4), DrumTop = f32(10), DrumBottom = f32(2);     // drum box: x +-4, y [y-10, y-2]
const CartHalf = f32(5), CartTop = f32(8), CartBottom = f32(1);
const FireHalf = f32(3), FireTop = f32(8), FireBottom = f32(2);
const SpringHalf = f32(4), SpringTop = f32(10), SpringBottom = f32(1);
const SpringV = f32(160), SpringG = f32(640);                        // a hop: 0.5 s, 20 px high
const HammerFloat = f32(20);             // the pickup's bottom edge, above the girder surface
const HammerFront = f32(17), HammerBack = f32(7), HammerHigh = f32(28);
const FireClimbMul = f32(0.6);           // a fire-ball on a ladder goes at 0.6 of its wander speed
const LiftPause = f32(1.4);              // a cage waits this long at each stop
const BeltWarn = f32(1.5);               // the arrows blink this long before a belt reverses
const StartLives = 3;
const PointsJump = 100, PointsSmash = 300, PointsBolt = 200, PointsGantryBolt = 500;
const Boards = BOARDS.length;

export class Drum {
    constructor(init) {
        this.id = 0;
        this.kind = Kind.Drum;
        this.m = DrumMode.Roll;
        this.x = 0; this.y = 0;             // centre x, bottom y (the surface it is on)
        this.g = 0;                         // the girder it is on (Roll) / left (Fall: from)
        this.dir = 0;                       // rolling direction
        this.vx = 0; this.vy = 0;
        this.ladderIdx = -1;                // Ladder mode: which ladder
        this.lastLadder = -1;               // the last ladder top it rolled over (decided once)
        this.roll = 0;                      // distance rolled (animation)
        this.side = 0;                      // which side of the climber it was on last step
        this.jumpScored = -1;               // the jump serial it was scored on
        this.fallFrom = 0;                  // y where its fall began (a long fall lands with a thud)
        this.dead = false;
        if (init) Object.assign(this, init);
    }
}

export class Fire {
    constructor(init) {
        this.id = 0;
        this.m = FireMode.Wander;
        this.g = 0;
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
        this.dir = 0;
        this.turn = 0;
        this.ladderIdx = -1; this.ldir = 0; this.lastLadder = -1;
        this.side = 0; this.jumpScored = -1;
        this.dead = false;
        if (init) Object.assign(this, init);
    }
    get hop() { return this.m === FireMode.Hop; }
}

export class Spring {
    constructor(init) {
        this.id = 0; this.m = SpringMode.Bounce;
        this.x = 0; this.y = 0; this.vy = 0; this.squash = 0;
        this.dead = false;
        if (init) Object.assign(this, init);
    }
}

export class Popup { constructor(x, y, points, text) { this.x = x; this.y = y; this.t = 0; this.points = points; this.text = text || null; } }
export class Puff { constructor(x, y, fire, big) { this.x = x; this.y = y; this.t = 0; this.fire = !!fire; this.big = !!big; } }

export class Climber {
    constructor() {
        this.x = 0; this.feet = 0;
        this.g = 0;                         // the girder (Walk/Jump), or the ladder's foot girder
        this.m = Mode.Walk;
        this.facing = 1;
        this.ladderIdx = -1;
        this.jumpT = 0; this.jumpVX = 0;
        this.jumpSerial = 0;
        this.walkDist = 0; this.climbDist = 0;
        this.hammerLeft = 0;
        this.deadT = 0;
        this.stepAcc = 0;                   // footsteps (a sound every few px)
    }
}

function overlap(ax0, ax1, ay0, ay1, bx0, bx1, by0, by1) {
    return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1;
}

// C# List.RemoveAll(x => x.dead), in place (order kept)
function removeDead(list) {
    let w = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
    list.length = w;
}

function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }   // C# Math.Sign(float) -> int

export class IronworksSim {
    constructor() {
        this.stageSeconds = f32(3.0); this.firstStageSeconds = f32(3.4); this.nextReady = f32(1.6); this.downSeconds = f32(2.4);
        this.wonCardSeconds = f32(6.0); this.lostCardSeconds = f32(4.0);
        this.dropAt = f32(1.0); this.firstThrowAt = f32(2.0);
        this.recordEvents = false; this.events = [];
        this.isDemo = false;                // the attract demo sets this before reset: it may start on a later board

        // read-only state (C# public getters)
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.lifeTime = 0;
        this.boardNo = 1;
        this.board = null;
        this.c = new Climber();
        this.drums = [];
        this.fires = [];
        this.springs = [];
        this.popups = [];
        this.puffs = [];
        this.hammerTaken = [];
        this.pickupTaken = [];
        this.oilLit = false;
        this.oilFlare = f32(9);             // seconds since the oil drum last swallowed something
        this.bonus = 0;
        this.bonusAwarded = 0;              // the bonus the board was topped out with (the tally)
        this.tallyLeft = 0;                 // what is still to be counted into the score
        this.livesLeft = 0;
        this.extraGiven = false;
        this.extraFlash = f32(9);           // seconds since the extra climber
        this.lastCause = Cause.None;
        this.firstLife = false;             // the first life on this board (the card, not GET READY)
        this.foremanLift = 0;               // > 0: he is heaving something overhead (seconds into the heave)
        this.foremanDropping = false;       // the heave is the straight drop, not a throw
        this.throwFlash = 0;                // seconds since the last throw (arm-forward frame)
        this.throwSide = -1;                // board 5: the side of the gantry the next drum goes off
        this.rage = f32(9);                 // board 5: seconds since he raged (a bolt came out)
        this.foremanY = 0; this.foremanVy = 0; this.foremanDown = false;   // the fall (boards 4 and 5)
        this.shake = 0;                     // seconds of screen shake left
        this.boardsCleared = 0;
        this.credit = null;

        // knobs (resolved for this credit), then this board's share of them
        this.drumSpeed = 0; this.baseDrumSpeed = 0; this.walkSpeed = 0; this.climbSpeed = 0;
        this.hammerSeconds = 0; this.throwGap = 0; this.fireSpeed = 0; this.cartSpeed = 0; this.beltSpeed = 0;
        this.liftSpeed = 0; this.springSpeed = 0; this.sparkGap = 0; this.maxDrums = 0; this.timerStep = 0; this.extraAt = 0;
        this.rollSpeed = 0; this.cartV = 0; this.gapB = 0; this.fireMaxB = 0; this.ladderChanceB = 0; this.fireSpeedB = 0;
        this.fireClimb = 0; this.bonusStart = 0;

        this._cues = new CueBuffer();
        this._log = '';
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._nextId = 0;
        this._time = 0; this._timerAcc = 0; this._throwLeft = 0; this._sparkLeft = 0; this._thrownLife = 0;
        this._dropDone = false; this._timeWarned = false; this._tallyAcc = 0; this._tallyEnd = 0; this._winSaid = false;
        this.startBoard = 1;

        // stats
        this._deaths = 0; this._deathDrum = 0; this._deathFire = 0; this._deathTimer = 0; this._deathSpring = 0; this._deathCart = 0;
        this._deathLadder = 0; this._jumped = 0; this._smashed = 0; this._hammers = 0; this._bestRow = 0; this._thrown = 0;
        this._laddersTaken = 0; this._items = 0; this._boltsPulled = 0; this._extras = 0; this._knocked = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get cardSeconds() { return this._result === RoundResult.Won ? this.wonCardSeconds : this.lostCardSeconds; }
    get bestRow() { return this._bestRow; }
    get lastBoard() { return this.boardNo >= Boards; }
    get stageCardSeconds() { return this.boardNo === this.startBoard ? this.firstStageSeconds : this.stageSeconds; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Stage: case Phase.Ready: return CabinetState.Intro;
            case Phase.Climb: return CabinetState.Playing;
            case Phase.Down: case Phase.Clear: return CabinetState.Interlude;
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
        return r + ' board ' + this.boardNo + '/' + Boards + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this.livesLeft +
               ' jumped ' + this._jumped + ' smashed ' + this._smashed + ' bolts ' + this._boltsPulled + ' | ' + this._log.trimEnd();
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.drumSpeed = k.get('drumSpeed');
        this.baseDrumSpeed = DrumSpeedBase;
        this.walkSpeed = k.get('walkSpeed');
        this.climbSpeed = k.get('climbSpeed');
        this.hammerSeconds = k.get('hammerSeconds');
        this.throwGap = k.get('throwGap');
        this.fireSpeed = k.get('fireSpeed');
        this.cartSpeed = k.get('cartSpeed');
        this.beltSpeed = k.get('beltSpeed');
        this.liftSpeed = k.get('liftSpeed');
        this.springSpeed = k.get('springSpeed');
        this.sparkGap = k.get('sparkGap');
        this.maxDrums = roundEven(k.get('maxDrums'));
        this.timerStep = k.get('timerStep');
        this.extraAt = roundEven(k.get('extraAt'));
        const forced = roundEven(k.get('startBoard', 1));
        this.startBoard = this.isDemo ? 1 + ((seed >>> 3) % Boards) : Math.max(1, Math.min(Boards, forced));

        this._score = 0; this._time = 0; this._nextId = 0;
        this._result = RoundResult.None;
        this.livesLeft = StartLives; this.extraGiven = false; this.extraFlash = f32(9);
        this.boardsCleared = 0;
        this._deaths = this._deathDrum = this._deathFire = this._deathTimer = this._deathSpring = this._deathCart = this._deathLadder = 0;
        this._jumped = this._smashed = this._hammers = this._thrown = this._laddersTaken = this._items = this._boltsPulled = this._extras = this._knocked = 0;
        this._bestRow = 0; this._winSaid = false;
        this._log = '';
        this.events.length = 0;
        this._cues.resetTotals();
        this._beginBoard(this.startBoard);
    }

    // a new board: its card goes up, the structure behind it
    _beginBoard(n) {
        this.boardNo = n;
        const B = this.board = new Board(BOARDS[n - 1]);
        const t = B.tune;
        this.rollSpeed = f32(this.drumSpeed * f32(t.speed));
        this.cartV = f32(this.cartSpeed * f32(t.speed));
        this.gapB = f32(this.throwGap * f32(t.gap));
        this.fireMaxB = t.fireMax;
        this.ladderChanceB = f32(t.ladder);
        this.fireSpeedB = f32(this.fireSpeed * f32(t.fire));
        this.fireClimb = f32(t.climb);
        this.bonusStart = t.bonus;
        this.pickupTaken = new Array(B.pickups.length).fill(false);
        this.foremanDown = false; this.rage = f32(9);
        this.firstLife = true;
        this._resetLife();
        this.p = Phase.Stage; this.phaseTime = 0;
        this._log += 'B' + n + '@' + fmt(this._time, 0, F32) + ' ';
        this._emit('card', { board: n });
    }

    _resetLife() {
        const B = this.board;
        this.drums.length = 0; this.fires.length = 0; this.springs.length = 0; this.popups.length = 0; this.puffs.length = 0;
        this.hammerTaken = new Array(B.hammers.length).fill(false);
        for (const b of B.belts) b.reset();
        for (const L of B.lifts) { L.y = L.low; L.moving = 0; L.stopLeft = f32(LiftPause + L.at); B.G[L.g].liftY = L.y; }
        this.oilLit = B.oil != null && !!B.oil.lit;
        this.oilFlare = f32(9);
        this.bonus = this.bonusStart; this.bonusAwarded = 0; this.tallyLeft = 0; this._timerAcc = 0; this._timeWarned = false;
        this.lifeTime = 0;
        this._dropDone = !(B.oil && B.oil.drop);
        this._throwLeft = this.firstThrowAt;
        this._sparkLeft = f32(1.6);
        this._thrownLife = 0;
        this.throwSide = -1;
        this.foremanLift = 0; this.foremanDropping = false; this.throwFlash = f32(99);
        this.foremanY = 0; this.foremanVy = 0;
        this.shake = 0;
        this.lastCause = Cause.None;
        // board 3's welders' sparks: patrolling their ledges from the start
        for (const p of B.patrols) {
            const g = B.G[p[0]];
            this.fires.push(new Fire({ id: this._nextId++, m: FireMode.Patrol, g: p[0], x: f32(p[1]), y: g.surface(p[1]), dir: p[2] }));
        }
        const c = new Climber();
        c.g = B.start[0]; c.x = f32(B.start[1]); c.facing = B.start[2]; c.m = Mode.Walk;
        c.feet = B.G[c.g].surface(c.x);
        this.c = c;
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        this._ageFx(dt);

        switch (this.p) {
            case Phase.Stage:
                if (this.phaseTime >= this.stageCardSeconds) this._go();
                break;
            case Phase.Ready:
                if (this.phaseTime >= this.nextReady) this._go();
                break;
            case Phase.Climb:
                this._stepPlay(dt, input);
                break;
            case Phase.Down:
                this.c.deadT = f32(this.c.deadT + dt);
                if (this.phaseTime >= this.downSeconds) {
                    if (this.livesLeft <= 0) this._card(RoundResult.Lost);
                    else {
                        this.firstLife = false;
                        this._resetLife();
                        this.p = Phase.Ready; this.phaseTime = 0;
                    }
                }
                break;
            case Phase.Clear:
                this._stepClear(dt);
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _go() {
        this.p = Phase.Climb; this.phaseTime = 0;
        this._cues.emit(SoundCue.Start);
    }

    _card(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Lost) this._log += 'X' + fmt(this._time, 1, F32) + ' ';
    }

    _ageFx(dt) {
        const pop = this.popups, puf = this.puffs;
        for (let i = pop.length - 1; i >= 0; i--) { pop[i].t = f32(pop[i].t + dt); if (pop[i].t > f32(0.9)) pop.splice(i, 1); }
        for (let i = puf.length - 1; i >= 0; i--) { puf[i].t = f32(puf[i].t + dt); if (puf[i].t > (puf[i].big ? f32(0.8) : f32(0.45))) puf.splice(i, 1); }
        if (this.shake > 0) this.shake = Math.max(0, f32(this.shake - dt));
        this.extraFlash = f32(this.extraFlash + dt);
        this.oilFlare = f32(this.oilFlare + dt);
        this.rage = f32(this.rage + dt);
    }

    // ------------------------------------------------------------------ one step of play
    _stepPlay(dt, input) {
        this.lifeTime = f32(this.lifeTime + dt);

        // ---- the bonus timer
        this._timerAcc = f32(this._timerAcc + dt);
        while (this._timerAcc >= this.timerStep) {
            this._timerAcc = f32(this._timerAcc - this.timerStep);
            if (this.bonus > 0) {
                this.bonus -= 100; this._cues.emit(SoundCue.Tick);
                if (this.bonus <= 1000 && !this._timeWarned) { this._timeWarned = true; this._emit('timeWarn'); }
            }
            if (this.bonus <= 0) {
                this.bonus = 0;
                if (!this.credit.unlosable) { this._die(Cause.Timer); return; }
            }
        }

        this._stepBelts(dt);
        this._stepLifts(dt);
        this._stepForeman(dt);
        if (this._stepClimber(dt, input)) { this._clear(); return; }
        this._stepDrums(dt);
        this._stepFires(dt);
        this._stepSprings(dt);
        this._pickups();
        const c = this.c;
        if (c.hammerLeft > 0) { c.hammerLeft = f32(c.hammerLeft - dt); if (c.hammerLeft < 0) c.hammerLeft = 0; this._smash(); }
        if (this._collide()) return;
        this._scoreJumps();
        removeDead(this.drums);
        removeDead(this.fires);
        removeDead(this.springs);
        if (c.m === Mode.Walk) {
            const row = this.board.G[c.g].row + (this.boardNo - 1) * 10;
            if (row > this._bestRow) this._bestRow = row;
        }
        if (this.board.bolts.length > 0 && this.board.boltsLeft === 0) this._clear();
    }

    // ---- the belts: each reversing one flips every `flip` s, its arrows blinking first
    _stepBelts(dt) {
        for (let i = 0; i < this.board.belts.length; i++) {
            const b = this.board.belts[i];
            b.flipT = f32(b.flipT + dt);
            b.pos = f32(b.pos + f32(f32(b.dir * this.beltSpeed) * dt));
            if (b.flip <= 0) continue;
            b.next = f32(b.next - dt);
            const warn = b.next < BeltWarn;
            if (warn && !b.warn) this._emit('beltWarn', { belt: i });
            b.warn = warn;
            if (b.next <= 0) {
                b.dir = -b.dir; b.next = f32(b.next + b.flip); b.warn = false; b.flipT = 0;
                this._emit('beltFlip', { belt: i, dir: b.dir });
            }
        }
    }

    beltV(g) { return g.belt >= 0 ? f32(this.board.belts[g.belt].dir * this.beltSpeed) : 0; }

    // ---- the cages: wait at a stop, ride to the other, wait, ride back
    _stepLifts(dt) {
        const B = this.board;
        for (const L of B.lifts) {
            if (L.moving === 0) {
                L.stopLeft = f32(L.stopLeft - dt);
                if (L.stopLeft <= 0) { L.stopLeft = 0; L.moving = L.y >= L.low ? -1 : 1; }
            } else {
                L.y = f32(L.y + f32(f32(L.moving * this.liftSpeed) * dt));
                if (L.moving < 0 && L.y <= L.high) { L.y = L.high; L.moving = 0; L.stopLeft = LiftPause; this._emit('lift', { up: true }); }
                else if (L.moving > 0 && L.y >= L.low) { L.y = L.low; L.moving = 0; L.stopLeft = LiftPause; this._emit('lift', { up: false }); }
            }
            B.G[L.g].liftY = L.y;
        }
    }

    // ---- the foreman, board by board
    _stepForeman(dt) {
        const B = this.board, F = B.foreman;
        this.throwFlash = f32(this.throwFlash + dt);
        // board 1: the straight drop once a life, which lights the oil drum
        if (!this._dropDone) {
            const heave = f32(this.dropAt - f32(0.5));
            if (this.lifeTime >= heave) { this.foremanLift = f32(this.lifeTime - heave); this.foremanDropping = true; }
            if (this.lifeTime >= this.dropAt) {
                this._dropDone = true; this.foremanLift = 0; this.foremanDropping = false;
                this.drums.push(new Drum({ id: this._nextId++, m: DrumMode.Drop, x: f32(B.oil.drop), y: f32(B.G[F.g].surface(B.oil.drop) - 23), g: F.g, side: 0 }));
                this.throwFlash = 0;
                this._emit('throw', { drop: true });
            }
            return;
        }
        if (F.kind === 'stand') { this._stepSparkSpout(dt); return; }
        let gap = this.gapB;
        if (F.kind === 'gantry') gap = f32(gap * f32(Math.pow(0.82, this._boltsOut())));
        this._throwLeft = f32(this._throwLeft - dt);
        this.foremanDropping = false;
        this.foremanLift = this._throwLeft < f32(0.5) ? f32(f32(0.5) - Math.max(0, this._throwLeft)) : 0;
        if (this._throwLeft > 0) return;
        let alive = 0;
        if (F.kind === 'springs') { for (const s of this.springs) if (!s.dead) alive++; }
        else for (const d of this.drums) if (!d.dead) alive++;
        if (alive >= this.maxDrums) { this._throwLeft = f32(0.3); return; }
        this._thrown++; this._thrownLife++;
        this.foremanLift = 0; this.throwFlash = 0;
        this._throwLeft = f32(gap * f32(f32(0.75) + f32(f32(0.5) * f32(this._rng.nextDouble()))));
        this._cues.emit(SoundCue.Miss);
        if (F.kind === 'drums') {
            const g = B.G[F.g];
            const nd = new Drum({ id: this._nextId++, m: DrumMode.Roll, g: F.g, dir: g.downhill, x: f32(F.throwX) });
            nd.y = g.surface(nd.x);
            nd.side = sign(f32(nd.x - this.c.x));
            this.drums.push(nd);
            this._emit('throw', {});
        } else if (F.kind === 'carts') {
            const g = B.G[F.g];
            const nd = new Drum({ id: this._nextId++, kind: Kind.Cart, m: DrumMode.Roll, g: F.g, dir: B.belts[g.belt].dir, x: f32(F.throwX) });
            nd.y = g.surface(nd.x);
            nd.side = sign(f32(nd.x - this.c.x));
            this.drums.push(nd);
            this._emit('throw', { cart: true });
        } else if (F.kind === 'springs') {
            const S = B.springs, g = B.G[S.g];
            this.springs.push(new Spring({ id: this._nextId++, x: f32(S.fromX), y: g.surface(S.fromX), vy: f32(-SpringV) }));
            this._emit('throw', { spring: true });
        } else if (F.kind === 'gantry') {
            // off the gantry's end, a short toss down onto the top girder; every `hot`-th one is hot
            const side = this.throwSide; this.throwSide = -side;
            const hot = B.tune.hot > 0 && this._thrownLife % B.tune.hot === 0;
            const x = f32(side < 0 ? F.dropL : F.dropR);
            this.drums.push(new Drum({
                id: this._nextId++, kind: hot ? Kind.Hot : Kind.Drum, m: DrumMode.Fall, g: -1, x, y: f32(F.deck),
                vx: f32(side * 46), vy: f32(-70), dir: side, fallFrom: f32(F.deck),
            }));
            this._emit('throw', { hot });
        }
    }

    // board 4: no throws; the oil drum spits a spark every sparkGap (+-25%) while there is room
    _stepSparkSpout(dt) {
        this._sparkLeft = f32(this._sparkLeft - dt);
        this.foremanLift = this._sparkLeft < f32(0.5) ? f32(f32(0.5) - Math.max(0, this._sparkLeft)) : 0;   // he stamps
        if (this._sparkLeft > 0) return;
        let alive = 0;
        for (const f of this.fires) if (!f.dead) alive++;
        this._sparkLeft = f32(this.sparkGap * f32(f32(0.75) + f32(f32(0.5) * f32(this._rng.nextDouble()))));
        if (alive >= this.fireMaxB) return;
        this.foremanLift = 0; this.throwFlash = 0;
        this._spawnFire(true);
    }

    _boltsOut() { let n = 0; for (const b of this.board.bolts) if (b.pulled) n++; return n; }

    // ---- the climber. Returns true when he steps onto the board's goal.
    _stepClimber(dt, input) {
        const c = this.c, B = this.board;
        const left = input != null && input.held(Pad.Left), right = input != null && input.held(Pad.Right);
        const up = input != null && input.held(Pad.Up), down = input != null && input.held(Pad.Down);
        const jump = input != null && (input.pressed(Pad.A) || input.pressed(Pad.B));
        const dir = right && !left ? 1 : left && !right ? -1 : 0;
        const hammer = c.hammerLeft > 0;

        switch (c.m) {
            case Mode.Walk: {
                if (!hammer && up) {
                    const l = B.upLadderAt(c.g, c.x, LadderGrab);
                    if (l != null) { c.m = Mode.Ladder; c.ladderIdx = l.index; c.x = l.x; c.feet = l.yBottom; break; }
                }
                if (!hammer && down) {
                    const l = B.downLadderAt(c.g, c.x, LadderGrab);
                    if (l != null) { c.m = Mode.Ladder; c.ladderIdx = l.index; c.x = l.x; c.feet = l.yTop; break; }
                }
                if (!hammer && jump) {
                    c.m = Mode.Jump; c.jumpT = 0; c.jumpVX = f32(dir * this.walkSpeed); c.jumpSerial++;
                    if (dir !== 0) c.facing = dir;
                    this._emit('jump');
                    break;
                }
                if (dir !== 0) c.facing = dir;
                const vx = f32(f32(dir * this.walkSpeed) + this.beltV(B.G[c.g]));
                if (vx !== 0) {
                    const ox = c.x;
                    this._walkTo(c, f32(c.x + f32(vx * dt)));
                    if (dir !== 0) {
                        const d = Math.abs(f32(c.x - ox));
                        c.walkDist = f32(c.walkDist + d);
                        c.stepAcc = f32(c.stepAcc + d);
                        if (c.stepAcc >= 10) { c.stepAcc = f32(c.stepAcc - 10); this._emit('step'); }
                    }
                }
                if (dir !== 0) this._pushBolt(c, dir);
                c.feet = B.G[c.g].surface(c.x);
                break;
            }
            case Mode.Jump: {
                c.jumpT = f32(c.jumpT + dt);
                this._airTo(c, f32(c.x + f32(c.jumpVX * dt)));
                const g = B.G[c.g];
                const rise = f32(f32(JumpV0 * c.jumpT) - f32(f32(f32(f32(0.5) * JumpG) * c.jumpT) * c.jumpT));
                if (rise <= 0 && c.jumpT > f32(0.05)) {
                    // down: over a gap you come down on the edge you were still over
                    const m = f32(3);
                    if (c.x > f32(g.x1 - m)) c.x = f32(g.x1 - m);
                    else if (c.x < f32(g.x0 + m)) c.x = f32(g.x0 + m);
                    c.m = Mode.Walk; c.feet = g.surface(c.x);
                }
                else c.feet = f32(g.surface(c.x) - rise);
                break;
            }
            case Mode.Ladder: {
                const l = B.ladders[c.ladderIdx];
                c.x = l.x;
                const was = c.climbDist;
                if (up && !down) { c.feet = f32(c.feet - f32(this.climbSpeed * dt)); c.climbDist = f32(c.climbDist + f32(this.climbSpeed * dt)); }
                else if (down && !up) { c.feet = f32(c.feet + f32(this.climbSpeed * dt)); c.climbDist = f32(c.climbDist + f32(this.climbSpeed * dt)); }
                if (Math.trunc(f32(c.climbDist / 8)) !== Math.trunc(f32(was / 8))) this._emit('step', { rung: true });
                if (c.feet <= l.yTop) {
                    c.feet = l.yTop; c.m = Mode.Walk; c.g = l.hi; c.ladderIdx = -1;
                    if (c.g === B.goal) return true;
                } else if (c.feet >= l.yBottom) {
                    c.feet = l.yBottom; c.m = Mode.Walk; c.g = l.lo; c.ladderIdx = -1;
                }
                break;
            }
        }
        return false;
    }

    // walking: across a shut join (a cage only when it is level), else stopped at the end
    _walkTo(c, nx) {
        const B = this.board, g = B.G[c.g];
        if (nx > f32(g.x1 - B.margin(c.g, 1))) {
            const h = B.walkJoin(c.g, 1);
            if (h >= 0) { if (nx >= B.G[h].x0) c.g = h; }
            else nx = Math.max(Math.min(c.x, nx), f32(g.x1 - B.margin(c.g, 1)));
        } else if (nx < f32(g.x0 + B.margin(c.g, -1))) {
            const h = B.walkJoin(c.g, -1);
            if (h >= 0) { if (nx < B.G[h].x1) c.g = h; }
            else nx = Math.min(Math.max(c.x, nx), f32(g.x0 + B.margin(c.g, -1)));
        }
        c.x = nx;
    }

    // in the air: over any lined-up join (an open gap too), else stopped at the end
    _airTo(c, nx) {
        const B = this.board, g = B.G[c.g];
        if (nx > f32(g.x1 - B.margin(c.g, 1))) {
            const h = B.hopJoin(c.g, 1);
            if (h >= 0) { if (nx >= B.G[h].x0) c.g = h; }
            else nx = Math.max(Math.min(c.x, nx), f32(g.x1 - B.margin(c.g, 1)));
        } else if (nx < f32(g.x0 + B.margin(c.g, -1))) {
            const h = B.hopJoin(c.g, -1);
            if (h >= 0) { if (nx < B.G[h].x1) c.g = h; }
            else nx = Math.min(Math.max(c.x, nx), f32(g.x0 + B.margin(c.g, -1)));
        }
        c.x = nx;
    }

    // pushing into a bolt at the end of the girder pulls it
    _pushBolt(c, dir) {
        const B = this.board, g = B.G[c.g];
        const b = B.boltAt(c.g, dir);
        if (b == null) return;
        const edge = dir > 0 ? f32(g.x1 - B.margin(c.g, 1)) : f32(g.x0 + B.margin(c.g, -1));
        if (Math.abs(f32(c.x - edge)) > f32(0.75)) return;
        b.pulled = true; b.pullT = this._time;
        this._boltsPulled++;
        const gantry = B.foreman.kind === 'gantry';
        this._addPoints(gantry ? PointsGantryBolt : PointsBolt, b.x, f32(g.surface(b.x) - 18));
        this.puffs.push(new Puff(b.x, f32(g.surface(b.x) - 2), false));
        this._cues.emit(SoundCue.Bonus);
        const left = B.boltsLeft;
        this._emit('bolt', { left });
        this._log += 'b' + fmt(this._time, 0, F32) + ' ';
        if (gantry && left > 0) {
            // he rages: the gantry shakes and the next drum comes at once
            this.rage = 0; this.shake = Math.max(this.shake, f32(0.4));
            this._throwLeft = Math.min(this._throwLeft, f32(0.55));
            this._emit('rage', { left });
        }
    }

    // ---- the drums and carts
    _rollV(d, g) {
        if (d.kind === Kind.Cart) return g.belt >= 0 ? f32(this.board.belts[g.belt].dir * this.cartV) : 0;
        return f32(d.dir * this.rollSpeed);
    }

    _stepDrums(dt) {
        const B = this.board, levels = B.G;
        for (const d of this.drums) {
            if (d.dead) continue;
            switch (d.m) {
                case DrumMode.Roll: {
                    const g = levels[d.g];
                    if (d.kind === Kind.Cart && g.belt >= 0) d.dir = B.belts[g.belt].dir;
                    const v = this._rollV(d, g);
                    const step = f32(v * dt);
                    const nx = f32(d.x + step);
                    // a ladder top on this girder: decide once whether to go down it
                    if (d.kind !== Kind.Cart && this.ladderChanceB > 0)
                        for (const l of B.ladders) {
                            if (l.hi !== d.g || l.index === d.lastLadder) continue;
                            const crossed = f32(f32(d.x - l.x) * f32(nx - l.x)) <= 0;
                            if (!crossed) continue;
                            d.lastLadder = l.index;
                            if (this._rng.nextDouble() < this.ladderChanceB) {
                                d.m = DrumMode.Ladder; d.ladderIdx = l.index; d.x = l.x; d.y = l.yTop;
                                this._laddersTaken++;
                                break;
                            }
                        }
                    if (d.m !== DrumMode.Roll) break;
                    d.x = nx; d.roll = f32(d.roll + Math.abs(step));
                    const o = B.oil;
                    if (o != null && o.dir !== 0 && d.g === o.g && (o.dir < 0 ? d.x <= o.intake : d.x >= o.intake)) {
                        d.dead = true;
                        this._feedOil(d.kind === Kind.Hot);
                        break;
                    }
                    if (d.x >= g.x1 || d.x < g.x0) {
                        d.m = DrumMode.Fall; d.vx = f32(v * f32(0.55)); d.vy = 0; d.fallFrom = d.y;
                        break;
                    }
                    d.y = g.surface(d.x);
                    break;
                }
                case DrumMode.Fall: {
                    const y0 = d.y;
                    d.vy = f32(d.vy + f32(DrumGravity * dt));
                    d.x = f32(d.x + f32(d.vx * dt)); d.y = f32(d.y + f32(d.vy * dt));
                    d.roll = f32(d.roll + f32(Math.abs(d.vx) * dt));
                    if (d.vy <= 0) break;
                    const t = B.landing(d.x, y0, d.y, d.g);
                    if (t >= 0) {
                        const below = levels[t];
                        const sx = below.clamp(d.x, f32(6));
                        d.g = t; d.x = sx; d.y = below.surface(sx);
                        d.m = DrumMode.Roll; d.lastLadder = -1;
                        d.dir = d.kind === Kind.Cart ? (below.belt >= 0 ? B.belts[below.belt].dir : sign(d.vx)) : (below.downhill !== 0 ? below.downhill : sign(d.vx));
                        if (f32(d.y - d.fallFrom) > 14) this._emit('land', { cart: d.kind === Kind.Cart });
                    } else if (d.y > 252) d.dead = true;
                    break;
                }
                case DrumMode.Ladder: {
                    const l = B.ladders[d.ladderIdx];
                    d.y = f32(d.y + f32(f32(this.rollSpeed * LadderDrumMul) * dt));
                    if (d.y >= l.yBottom) {
                        d.y = l.yBottom; d.g = l.lo; d.m = DrumMode.Roll;
                        d.dir = levels[d.g].downhill; d.lastLadder = l.index; d.ladderIdx = -1;
                    }
                    break;
                }
                case DrumMode.Drop:
                    d.y = f32(d.y + f32(DropSpeed * dt));
                    d.roll = f32(d.roll + f32(f32(DropSpeed * dt) * f32(0.5)));
                    if (d.y >= f32(B.oilTop + 4)) { d.dead = true; this._feedOil(false); }
                    break;
            }
        }
    }

    // something went into the oil drum (or the furnace): it burns, and spits a fire-ball while there is room
    _feedOil(hot) {
        this.oilLit = true; this.oilFlare = 0;
        this._emit('oil', { hot });
        let alive = 0;
        for (const f of this.fires) if (!f.dead && f.m !== FireMode.Patrol) alive++;
        if (alive >= this.fireMaxB + (hot ? 1 : 0)) return;
        this._spawnFire(false);
    }

    // a fire-ball hops out of the oil drum toward the works
    _spawnFire(spout) {
        const B = this.board, o = B.oil;
        const out = o.dir !== 0 ? -o.dir : (this._rng.nextDouble() < 0.5 ? -1 : 1);
        this.fires.push(new Fire({
            id: this._nextId++, m: FireMode.Hop, g: o.g,
            x: f32(o.x + f32(o.w * 0.5)), y: B.oilTop,
            vx: f32(out * f32(f32(40) + f32(f32(20) * f32(this._rng.nextDouble())))), vy: f32(-110), dir: out, turn: f32(0.8),
        }));
        this.oilFlare = 0;
        this._emit('fire', { spout: !!spout });
    }

    // ---- the fire-balls: out of the oil drum in a hop, then wandering (and, from board 2, climbing)
    _stepFires(dt) {
        const B = this.board;
        const c = this.c;
        for (const f of this.fires) {
            if (f.dead) continue;
            switch (f.m) {
                case FireMode.Hop: {
                    const g = B.G[f.g];
                    f.vy = f32(f.vy + f32(DrumGravity * dt));
                    f.x = f32(f.x + f32(f.vx * dt)); f.y = f32(f.y + f32(f.vy * dt));
                    if (f.vy > 0 && f.y >= g.surface(f.x)) {
                        f.m = FireMode.Wander; f.x = g.clamp(f.x, f32(6)); f.y = g.surface(f.x); f.turn = f32(0.6);
                        f.dir = sign(f.vx);
                    }
                    break;
                }
                case FireMode.Wander: {
                    const g = B.G[f.g];
                    f.turn = f32(f.turn - dt);
                    if (f.turn <= 0) {
                        f.turn = f32(f32(0.6) + f32(this._rng.nextDouble()));
                        const r = this._rng.nextDouble();
                        if (r < 0.12) f.dir = 0;
                        else if (c.g === f.g && c.m !== Mode.Ladder && r < 0.62) f.dir = sign(f32(c.x - f.x));
                        else f.dir = this._rng.nextDouble() < 0.5 ? -1 : 1;
                    }
                    const nx = f32(f.x + f32(f32(f.dir * this.fireSpeedB) * dt));
                    // a ladder it passes: from board 2 on it may take it, keener toward the climber's storey
                    if (this.fireClimb > 0 && f.dir !== 0)
                        for (const l of B.ladders) {
                            if (l.broken || l.index === f.lastLadder || (l.lo !== f.g && l.hi !== f.g)) continue;
                            if (f32(f32(f.x - l.x) * f32(nx - l.x)) > 0) continue;
                            f.lastLadder = l.index;
                            const goUp = l.lo === f.g;
                            const cRow = B.G[c.m === Mode.Ladder ? B.ladders[c.ladderIdx].hi : c.g].row;
                            const toward = goUp ? cRow > g.row : cRow < g.row;
                            const p = toward ? Math.min(0.9, this.fireClimb * 2) : this.fireClimb * 0.4;
                            if (this._rng.nextDouble() < p) {
                                f.m = FireMode.Ladder; f.ladderIdx = l.index; f.ldir = goUp ? -1 : 1; f.x = l.x;
                                break;
                            }
                        }
                    if (f.m !== FireMode.Wander) break;
                    f.x = nx;
                    // the ends: across a shut or bolted join onto the next girder, else turn back
                    const hR = B.fireJoin(f.g, 1), hL = B.fireJoin(f.g, -1);
                    let wlo = hL >= 0 ? f32(-999) : f32(g.x0 + 5), whi = hR >= 0 ? f32(999) : f32(g.x1 - 5);
                    const o = B.oil;
                    if (o != null && f.g === o.g) {   // never back into the oil drum
                        if (o.dir < 0) wlo = Math.max(wlo, f32(o.intake + 6));
                        else if (o.dir > 0) whi = Math.min(whi, f32(o.intake - 6));
                    }
                    if (hR >= 0 && f.x >= B.G[hR].x0 && f.x <= whi) f.g = hR;
                    else if (hL >= 0 && f.x < B.G[hL].x1 && f.x >= wlo) f.g = hL;
                    else if (f.x > whi) { f.x = whi; f.dir = -1; }
                    else if (f.x < wlo) { f.x = wlo; f.dir = 1; }
                    f.y = B.G[f.g].surface(f.x);
                    break;
                }
                case FireMode.Ladder: {
                    const l = B.ladders[f.ladderIdx];
                    f.y = f32(f.y + f32(f32(f.ldir * f32(this.fireSpeedB * FireClimbMul)) * dt));
                    if (f.ldir < 0 && f.y <= l.yTop) { f.y = l.yTop; f.g = l.hi; f.m = FireMode.Wander; f.lastLadder = l.index; f.turn = f32(0.3); }
                    else if (f.ldir > 0 && f.y >= l.yBottom) { f.y = l.yBottom; f.g = l.lo; f.m = FireMode.Wander; f.lastLadder = l.index; f.turn = f32(0.3); }
                    break;
                }
                case FireMode.Patrol: {
                    const g = B.G[f.g];
                    f.x = f32(f.x + f32(f32(f.dir * this.fireSpeedB) * dt));
                    if (f.x > f32(g.x1 - 6)) { f.x = f32(g.x1 - 6); f.dir = -1; }
                    if (f.x < f32(g.x0 + 6)) { f.x = f32(g.x0 + 6); f.dir = 1; }
                    f.y = g.surface(f.x);
                    break;
                }
            }
        }
    }

    // ---- board 3's spring jacks: bounce along the top, then down the column by the hole
    _stepSprings(dt) {
        const B = this.board, S = B.springs;
        if (S == null) return;
        const g = B.G[S.g];
        for (const s of this.springs) {
            if (s.dead) continue;
            s.squash = Math.max(0, f32(s.squash - dt));
            s.vy = f32(s.vy + f32(SpringG * dt));
            s.y = f32(s.y + f32(s.vy * dt));
            if (s.m === SpringMode.Bounce) {
                s.x = f32(s.x + f32(this.springSpeed * dt));
                if (s.x >= S.dropX) { s.m = SpringMode.Drop; this._emit('springDrop'); }
                else if (s.vy > 0 && s.y >= g.surface(s.x)) { s.y = g.surface(s.x); s.vy = f32(-SpringV); s.squash = f32(0.08); this._emit('spring'); }
            } else {
                s.x = f32(s.x + f32(f32(S.colX - s.x) * Math.min(1, f32(dt * 8))));
                if (s.y > 256) s.dead = true;
            }
        }
    }

    // ---- the hammers (jump into one) and the pickups (walk into them)
    _pickups() {
        const c = this.c, B = this.board;
        if (c.m === Mode.Ladder) return;
        const top = f32(c.feet - ClimberH);
        for (let i = 0; i < this.hammerTaken.length; i++) {
            if (this.hammerTaken[i]) continue;
            const h = B.hammers[i];
            if (h.girder !== c.g) continue;
            const hb = f32(B.G[h.girder].surface(h.x) - HammerFloat);
            if (Math.abs(f32(c.x - h.x)) < f32(ClimberHalfW + 4) && top < hb) {
                this.hammerTaken[i] = true;
                c.hammerLeft = this.hammerSeconds;
                this._hammers++;
                this._cues.emit(SoundCue.Bonus);
                this._emit('hammer');
                this._log += 'H' + fmt(this._time, 1, F32) + ' ';
            }
        }
        for (let i = 0; i < this.pickupTaken.length; i++) {
            if (this.pickupTaken[i]) continue;
            const p = B.pickups[i];
            if (p.girder !== c.g || Math.abs(f32(c.x - p.x)) >= f32(ClimberHalfW + 5)) continue;
            if (f32(B.G[p.girder].surface(p.x) - c.feet) > 10) continue;
            this.pickupTaken[i] = true;
            this._items++;
            this._addPoints(Pickup.Points[p.kind], p.x, f32(c.feet - 22));
            this._cues.emit(SoundCue.Bonus);
            this._emit('pickup', { item: p.kind });
        }
    }

    // the swing covers the front, overhead and the body: [x0, x1, y0, y1]
    _hammerZone() {
        const c = this.c;
        let x0, x1;
        if (c.facing >= 0) { x0 = f32(c.x - HammerBack); x1 = f32(c.x + HammerFront); }
        else { x0 = f32(c.x - HammerFront); x1 = f32(c.x + HammerBack); }
        return [x0, x1, f32(c.feet - HammerHigh), c.feet];
    }

    _drumBox(d) {
        return d.kind === Kind.Cart
            ? [f32(d.x - CartHalf), f32(d.x + CartHalf), f32(d.y - CartTop), f32(d.y - CartBottom)]
            : [f32(d.x - DrumHalf), f32(d.x + DrumHalf), f32(d.y - DrumTop), f32(d.y - DrumBottom)];
    }

    _smash() {
        const [x0, x1, y0, y1] = this._hammerZone();
        for (const d of this.drums) {
            if (d.dead) continue;
            const b = this._drumBox(d);
            if (overlap(x0, x1, y0, y1, b[0], b[1], b[2], b[3])) {
                d.dead = true; this._smashed++;
                this._addPoints(PointsSmash, d.x, f32(d.y - 16));
                this.puffs.push(new Puff(d.x, f32(d.y - 6), d.kind === Kind.Hot));
                this._cues.emit(SoundCue.Hit);
                this._emit('smash', { what: d.kind === Kind.Cart ? 'cart' : 'drum' });
            }
        }
        for (const f of this.fires) {
            if (f.dead) continue;
            if (overlap(x0, x1, y0, y1, f32(f.x - FireHalf), f32(f.x + FireHalf), f32(f.y - FireTop), f32(f.y - FireBottom))) {
                f.dead = true; this._smashed++;
                this._addPoints(PointsSmash, f.x, f32(f.y - 16));
                this.puffs.push(new Puff(f.x, f32(f.y - 5), true));
                this._cues.emit(SoundCue.Hit);
                this._emit('smash', { what: 'fire' });
            }
        }
        for (const s of this.springs) {
            if (s.dead) continue;
            if (overlap(x0, x1, y0, y1, f32(s.x - SpringHalf), f32(s.x + SpringHalf), f32(s.y - SpringTop), f32(s.y - SpringBottom))) {
                s.dead = true; this._smashed++;
                this._addPoints(PointsSmash, s.x, f32(s.y - 16));
                this.puffs.push(new Puff(s.x, f32(s.y - 5), false));
                this._cues.emit(SoundCue.Hit);
                this._emit('smash', { what: 'spring' });
            }
        }
    }

    // ---- contact: a life, or on the mercy credit the thing is knocked apart
    _collide() {
        const C = this.c;
        const cx0 = f32(C.x - ClimberHalfW), cx1 = f32(C.x + ClimberHalfW), cy0 = f32(C.feet - ClimberH), cy1 = C.feet;
        for (const d of this.drums) {
            if (d.dead) continue;
            const b = this._drumBox(d);
            if (!overlap(cx0, cx1, cy0, cy1, b[0], b[1], b[2], b[3])) continue;
            if (this.credit.unlosable) { d.dead = true; this._knock(d.x, f32(d.y - 6), d.kind === Kind.Hot); continue; }
            if (C.m === Mode.Ladder || d.m === DrumMode.Ladder) this._deathLadder++;
            this._die(d.kind === Kind.Cart ? Cause.Cart : Cause.Drum);
            return true;
        }
        for (const f of this.fires) {
            if (f.dead || (f.m === FireMode.Hop && f.vy < 0)) continue;
            if (!overlap(cx0, cx1, cy0, cy1, f32(f.x - FireHalf), f32(f.x + FireHalf), f32(f.y - FireTop), f32(f.y - FireBottom))) continue;
            if (this.credit.unlosable) { f.dead = true; this._knock(f.x, f32(f.y - 5), true); continue; }
            this._die(Cause.Fire);
            return true;
        }
        for (const s of this.springs) {
            if (s.dead) continue;
            if (!overlap(cx0, cx1, cy0, cy1, f32(s.x - SpringHalf), f32(s.x + SpringHalf), f32(s.y - SpringTop), f32(s.y - SpringBottom))) continue;
            if (this.credit.unlosable) { s.dead = true; this._knock(s.x, f32(s.y - 5), false); continue; }
            this._die(Cause.Spring);
            return true;
        }
        return false;
    }

    _knock(x, y, fire) {
        this.puffs.push(new Puff(x, y, fire));
        this._knocked++;
        this._cues.emit(SoundCue.Miss);
        this._emit('knock');
    }

    // ---- 100 for every drum, cart or fire-ball that passes under a hop on the same girder
    _scoreJumps() {
        const C = this.c;
        const hopping = C.m === Mode.Jump;
        for (const d of this.drums) {
            if (d.dead) continue;
            const side = sign(f32(d.x - C.x));
            if (hopping && d.m === DrumMode.Roll && d.g === C.g && d.side !== 0 && side !== d.side && d.jumpScored !== C.jumpSerial) {
                d.jumpScored = C.jumpSerial;
                this._hopScored(C);
            }
            if (side !== 0) d.side = side;
        }
        for (const f of this.fires) {
            if (f.dead) continue;
            const side = sign(f32(f.x - C.x));
            if (hopping && (f.m === FireMode.Wander || f.m === FireMode.Patrol) && f.g === C.g && f.side !== 0 && side !== f.side && f.jumpScored !== C.jumpSerial) {
                f.jumpScored = C.jumpSerial;
                this._hopScored(C);
            }
            if (side !== 0) f.side = side;
        }
    }

    _hopScored(C) {
        this._jumped++;
        this._addPoints(PointsJump, C.x, f32(C.feet - 22));
        this._cues.emit(SoundCue.Bonus);
        this._emit('hop');
    }

    _addPoints(pts, x, y) {
        this._score += pts;
        if (x !== undefined) this.popups.push(new Popup(x, y, pts));
        if (!this.extraGiven && this._score >= this.extraAt) {
            this.extraGiven = true; this.livesLeft++; this._extras++; this.extraFlash = 0;
            this._emit('extra');
            this._log += 'E' + fmt(this._time, 0, F32) + ' ';
        }
    }

    _die(cause) {
        this.lastCause = cause;
        this._deaths++;
        if (cause === Cause.Drum) this._deathDrum++; else if (cause === Cause.Fire) this._deathFire++;
        else if (cause === Cause.Spring) this._deathSpring++; else if (cause === Cause.Cart) this._deathCart++; else this._deathTimer++;
        this.livesLeft--;
        const C = this.c;
        C.m = Mode.Dead; C.deadT = 0; C.hammerLeft = 0;
        this.p = Phase.Down; this.phaseTime = 0;
        this._cues.emit(SoundCue.Die);
        this._emit('die', { cause });
        this._log += 'D' + fmt(this._time, 1, F32) + 'b' + this.boardNo + ['', 'drum', 'fire', 'time', 'spring', 'cart'][cause] + ' ';
    }

    // ------------------------------------------------------------------ topped out
    _clear() {
        const B = this.board, C = this.c;
        C.m = Mode.Top; C.hammerLeft = 0;
        this.bonusAwarded = this.bonus; this.tallyLeft = this.bonus; this._tallyAcc = 0;
        this.boardsCleared++;
        this.p = Phase.Clear; this.phaseTime = 0;
        this._cues.emit(SoundCue.Bonus);
        this._log += 'C' + this.boardNo + '@' + fmt(this._time, 0, F32) + '/' + this.bonus + ' ';
        if (B.foreman.kind === 'stand' || B.foreman.kind === 'gantry') {
            // the bolts are out: down it comes, and everything on the structure with it
            for (const d of this.drums) if (!d.dead) this.puffs.push(new Puff(d.x, f32(d.y - 6), d.kind === Kind.Hot));
            for (const f of this.fires) if (!f.dead) this.puffs.push(new Puff(f.x, f32(f.y - 5), true));
            this.drums.length = 0; this.fires.length = 0;
            this.foremanY = f32(B.foreman.deck); this.foremanVy = f32(-60); this.foremanDown = false;
            this.shake = f32(0.8);
            this._emit('collapse', { last: this.lastBoard });
            this._emit('fall');
        } else this._emit('clear', { board: this.boardNo });
    }

    // how long the clear holds before the tally starts counting
    get clearShow() { const k = this.board.foreman.kind; return k === 'gantry' ? f32(3.0) : k === 'stand' ? f32(2.4) : f32(1.6); }

    _stepClear(dt) {
        const B = this.board, F = B.foreman;
        if (F.kind === 'stand' || F.kind === 'gantry') {
            // the foreman falls the whole height of the works
            if (!this.foremanDown) {
                this.foremanVy = f32(this.foremanVy + f32(DrumGravity * dt));
                this.foremanY = f32(this.foremanY + f32(this.foremanVy * dt));
                const floor = f32(B.G[0].surface(f32(F.x + 12)));
                if (this.foremanY >= floor) {
                    this.foremanY = floor; this.foremanDown = true;
                    this.shake = f32(0.9);
                    this.puffs.push(new Puff(f32(F.x + 12), f32(floor - 8), F.kind === 'gantry', true));
                    this._emit('thud', { last: this.lastBoard });
                    if (this.lastBoard && !this._winSaid) { this._winSaid = true; this._cues.emit(SoundCue.Win); this._log += 'W' + fmt(this._time, 1, F32) + ' '; }
                }
            }
        } else if (this.lastBoard && !this._winSaid) { this._winSaid = true; this._cues.emit(SoundCue.Win); }
        const show = this.clearShow;
        if (this.phaseTime < show) return;
        // the tally: the bonus counted into the score, about 24 ticks
        if (this.tallyLeft > 0) {
            this._tallyAcc = f32(this._tallyAcc + dt);
            const chunk = Math.max(100, Math.ceil(this.bonusAwarded / 2400) * 100);
            while (this._tallyAcc >= f32(0.05) && this.tallyLeft > 0) {
                this._tallyAcc = f32(this._tallyAcc - f32(0.05));
                const n = Math.min(chunk, this.tallyLeft);
                this.tallyLeft -= n;
                this._addPoints(n);
                this._cues.emit(SoundCue.Tick);
                this._emit('tally', { left: this.tallyLeft });
            }
            this._tallyEnd = this.phaseTime;
            return;
        }
        if (this.phaseTime < f32(this._tallyEnd + f32(1.4))) return;
        if (this.lastBoard) this._card(RoundResult.Won);
        else this._beginBoard(this.boardNo + 1);
    }

    // ------------------------------------------------------------------ for the bot and the renderer
    get rise() {
        const c = this.c;
        return c.m === Mode.Jump ? Math.max(0, f32(f32(JumpV0 * c.jumpT) - f32(f32(f32(f32(0.5) * JumpG) * c.jumpT) * c.jumpT))) : 0;
    }

    // the speed a drum or cart is going along its girder right now (+ right)
    speedOf(d) { return d.m === DrumMode.Roll ? this._rollV(d, this.board.G[d.g]) : 0; }

    collectStats(into) {
        add(into, 'deaths', this._deaths);
        add(into, 'dDrum', this._deathDrum);
        add(into, 'dCart', this._deathCart);
        add(into, 'dFire', this._deathFire);
        add(into, 'dSpring', this._deathSpring);
        add(into, 'dTimer', this._deathTimer);
        add(into, 'dOnLadder', this._deathLadder);
        add(into, 'boards', this.boardsCleared);
        add(into, 'reached', this.boardNo);
        add(into, 'jumped', this._jumped);
        add(into, 'smashed', this._smashed);
        add(into, 'hammers', this._hammers);
        add(into, 'items', this._items);
        add(into, 'bolts', this._boltsPulled);
        add(into, 'extra', this._extras);
        add(into, 'knocked', this._knocked);
        add(into, 'thrown', this._thrown);
        add(into, 'drumLadders', this._laddersTaken);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

IronworksSim.Phase = Phase;
IronworksSim.Mode = Mode;
IronworksSim.DrumMode = DrumMode;
IronworksSim.Kind = Kind;
IronworksSim.FireMode = FireMode;
IronworksSim.SpringMode = SpringMode;
IronworksSim.Cause = Cause;
IronworksSim.Drum = Drum;
IronworksSim.Fire = Fire;
IronworksSim.Spring = Spring;
Object.assign(IronworksSim, {
    JumpV0, JumpG, DrumGravity, DropSpeed, LadderDrumMul, LadderGrab, ClimberHalfW, ClimberH,
    DrumHalf, DrumTop, DrumBottom, CartHalf, CartTop, CartBottom, FireHalf, FireTop, FireBottom,
    SpringHalf, SpringTop, SpringBottom, SpringV, SpringG, HammerFloat, HammerFront, HammerBack, HammerHigh,
    FireClimbMul, LiftPause, BeltWarn, StartLives, PointsJump, PointsSmash, PointsBolt, PointsGantryBolt, Boards,
});
