// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of IronworksSim.cs from Staging/Batch3/ironworks.
//
// The Donkey Kong climb. One screen (IronworksLevel): six sloped red girders joined by ladders,
// some broken; the FOREMAN on the top girder sets steel drums rolling. A drum rolls down each
// slope, drops off the low end onto the girder below, and sometimes takes a ladder down instead.
// The first drum of every life drops straight down the left side into the OIL DRUM and lights it;
// a lit oil drum spits a FIRE-BALL, and every drum it swallows later spits another (up to
// fireMax). Fire-balls wander the lowest girder. The oil keeps burning after a lost life: its
// fire-balls wait out along girder 0 for the next climber.
//
//   the CLIMBER   stick left/right walks, up/down climbs a whole ladder (lined up within 4 px),
//                 A = a fixed short hop (0.5 s, 18 px high) that keeps the walk's momentum and
//                 clears ONE drum: 100 points per drum jumped
//   the HAMMER    two float over girders 1 and 4 at jump height; jump into one and you swing it for
//                 hammerSeconds: a drum or fire-ball touching its swing is smashed for 300, but no
//                 climbing and no jumping while it swings
//   the BONUS     counts down from 5000, 100 every timerStep seconds; what is left is added when
//                 you reach the top
//   a LIFE        is lost to a drum, a fire-ball or the bonus reaching 0. Three lives. A lost life
//                 restarts the structure from the bottom (the 1981 rule): drums, hammers, bonus.
//   ROUND WON     = the climber reaches the top platform: the banner drops (the Card). Never the clock.
//
// MERCY: knobs ease per loss (drumSpeed x0.9, hammerSeconds +1 s). On the unlosable credit the
// drums crawl (drumSpeed set on mercy) and the climber CANNOT DIE: a drum or fire-ball that
// touches him is knocked apart (no points) and the bonus stops at 0 instead of costing a life.
// Floats are C# floats: f32() everywhere, so a seed plays the same round as in the C# CabinetLab.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { IronworksLevel as L } from './level.js';
import { DrumSpeedBase } from './spec.js';

const Phase = Object.freeze({ Idle: 0, Ready: 1, Climb: 2, Down: 3, Card: 4, Over: 5 });
const Mode = Object.freeze({ Walk: 0, Jump: 1, Ladder: 2, Dead: 3, Top: 4 });
const DrumMode = Object.freeze({ Roll: 0, Fall: 1, Ladder: 2, Drop: 3 });
const Cause = Object.freeze({ None: 0, Drum: 1, Fire: 2, Timer: 3 });

// ------------------------------------------------------------------ the machine (not mercy knobs)
const JumpV0 = f32(144);                 // px/s up: 0.5 s air, 18 px apex
const JumpG = f32(576);
const DrumGravity = f32(420);
const DropSpeed = f32(150);
const LadderDrumMul = f32(0.75);         // a drum goes down a ladder at 3/4 of its roll speed
const LadderGrab = f32(4);               // how close to a ladder's line you must stand
const ClimberHalfW = f32(3), ClimberH = f32(13);
const DrumHalf = f32(4), DrumTop = f32(10), DrumBottom = f32(2);     // drum box: x +-4, y [y-10, y-2]
const FireHalf = f32(3), FireTop = f32(8), FireBottom = f32(2);
const HammerFloat = f32(20);             // the pickup's bottom edge, above the girder surface
const HammerFront = f32(17), HammerBack = f32(7), HammerHigh = f32(28);
const StartLives = 3, BonusStart = 5000;
const PointsJump = 100, PointsSmash = 300;

export class Drum {
    constructor(init) {
        this.id = 0;
        this.m = DrumMode.Roll;
        this.x = 0; this.y = 0;             // centre x, bottom y (the surface it is on)
        this.g = 0;                         // the girder it is on (Roll) / falling from (Fall)
        this.dir = 0;                       // rolling direction
        this.vx = 0; this.vy = 0;
        this.ladderIdx = -1;                // Ladder mode: which ladder
        this.lastLadder = -1;               // the last ladder top it rolled over (decided once)
        this.roll = 0;                      // distance rolled (animation)
        this.side = 0;                      // which side of the climber it was on last step
        this.jumpScored = -1;               // the jump serial it was scored on
        this.dead = false;
        if (init) Object.assign(this, init);
    }
}

export class Fire {
    constructor(init) {
        this.id = 0;
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
        this.dir = 0;
        this.hop = false;                   // still arcing out of the oil drum
        this.turn = 0;
        this.dead = false;
        if (init) Object.assign(this, init);
    }
}

export class Popup { constructor(x, y, points) { this.x = x; this.y = y; this.t = 0; this.points = points; } }
export class Puff { constructor(x, y, fire) { this.x = x; this.y = y; this.t = 0; this.fire = !!fire; } }

export class Climber {
    constructor() {
        this.x = 0; this.feet = 0;
        this.g = 0;                         // girder (Walk/Jump), or the ladder's lower girder
        this.m = Mode.Walk;
        this.facing = 1;
        this.ladderIdx = -1;
        this.jumpT = 0; this.jumpVX = 0;
        this.jumpSerial = 0;
        this.walkDist = 0; this.climbDist = 0;
        this.hammerLeft = 0;
        this.deadT = 0;
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
        this.firstReady = f32(2.2); this.nextReady = f32(1.6); this.downSeconds = f32(2.4);
        this.wonCardSeconds = f32(5.0); this.lostCardSeconds = f32(3.5);
        this.dropAt = f32(1.0); this.firstThrowAt = f32(2.8);
        this.fireWaitX = f32(168); this.fireWaitStep = f32(64);   // where kept fire-balls wait when a new climber starts

        // read-only state (C# public getters)
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.lifeTime = 0;
        this.c = new Climber();
        this.drums = [];
        this.fires = [];
        this.popups = [];
        this.puffs = [];
        this.hammerTaken = new Array(L.Hammers.length).fill(false);
        this.oilLit = false;
        this.bonus = 0;
        this.bonusAwarded = 0;
        this.livesLeft = 0;
        this.lastCause = Cause.None;
        this.firstLife = false;
        this.foremanLift = 0;               // > 0: he is heaving a drum overhead (seconds into the heave)
        this.foremanDropping = false;       // the heave is the straight drop, not a throw
        this.throwFlash = 0;                // seconds since the last throw (arm-forward frame)
        this.credit = null;

        // knobs (resolved for this credit)
        this.drumSpeed = 0; this.baseDrumSpeed = 0; this.walkSpeed = 0; this.climbSpeed = 0;
        this.hammerSeconds = 0; this.throwGap = 0; this.ladderChance = 0; this.fireSpeed = 0;
        this.fireMax = 0; this.maxDrums = 0; this.timerStep = 0;

        this._cues = new CueBuffer();
        this._log = '';
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._nextId = 0;
        this._time = 0; this._timerAcc = 0; this._throwLeft = 0;
        this._dropDone = false;

        // stats
        this._deaths = 0; this._deathDrum = 0; this._deathFire = 0; this._deathTimer = 0; this._deathLadder = 0;
        this._jumped = 0; this._smashed = 0; this._hammers = 0; this._bestGirder = 0; this._thrown = 0; this._laddersTaken = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get cardSeconds() { return this._result === RoundResult.Won ? this.wonCardSeconds : this.lostCardSeconds; }
    get bestGirder() { return this._bestGirder; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Climb: return CabinetState.Playing;
            case Phase.Down: return CabinetState.Interlude;
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
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this.livesLeft + '/' + StartLives +
               ' jumped ' + this._jumped + ' smashed ' + this._smashed + ' | ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? (Date.now() | 0) : seed);
        this.fires.length = 0;
        this.drumSpeed = k.get('drumSpeed');
        this.baseDrumSpeed = DrumSpeedBase;
        this.walkSpeed = k.get('walkSpeed');
        this.climbSpeed = k.get('climbSpeed');
        this.hammerSeconds = k.get('hammerSeconds');
        this.throwGap = k.get('throwGap');
        this.ladderChance = k.get('ladderChance');
        this.fireSpeed = k.get('fireSpeed');
        this.fireMax = roundEven(k.get('fireMax'));
        this.maxDrums = roundEven(k.get('maxDrums'));
        this.timerStep = k.get('timerStep');

        this._score = 0; this._time = 0; this._nextId = 0;
        this._result = RoundResult.None;
        this.livesLeft = StartLives;
        this._deaths = this._deathDrum = this._deathFire = this._deathTimer = this._deathLadder = 0;
        this._jumped = this._smashed = this._hammers = this._thrown = this._laddersTaken = 0;
        this._bestGirder = 0;
        this._log = '';
        this._cues.resetTotals();
        this.firstLife = true;
        this._resetLife();
        this.p = Phase.Ready; this.phaseTime = 0;
    }

    _resetLife() {
        this.drums.length = 0; this.popups.length = 0; this.puffs.length = 0;
        this.hammerTaken.fill(false);
        // the oil drum keeps burning between lives: its fire-balls wait out along girder 0,
        // well clear of the start, for the next climber
        removeDead(this.fires);
        for (let i = 0; i < this.fires.length; i++) {
            const f = this.fires[i];
            f.hop = false; f.x = f32(this.fireWaitX + f32(this.fireWaitStep * i)); f.y = L.G[0].surface(f.x);
            f.dir = -1; f.turn = f32(f32(0.8) + f32(f32(0.4) * i));
        }
        if (this.fires.length === 0) this.oilLit = false;
        this.bonus = BonusStart; this.bonusAwarded = 0; this._timerAcc = 0;
        this.lifeTime = 0;
        this._dropDone = false;
        this._throwLeft = this.firstThrowAt;
        this.foremanLift = 0; this.foremanDropping = false; this.throwFlash = f32(99);
        this.lastCause = Cause.None;
        const c = new Climber();
        c.x = L.StartX; c.g = 0; c.m = Mode.Walk; c.facing = 1;
        c.feet = L.G[0].surface(c.x);
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
            case Phase.Ready:
                if (this.phaseTime >= (this.firstLife ? this.firstReady : this.nextReady)) {
                    this.p = Phase.Climb; this.phaseTime = 0;
                    this._cues.emit(SoundCue.Start);
                }
                break;
            case Phase.Climb:
                this._stepPlay(dt, input);
                break;
            case Phase.Down:
                this.c.deadT = f32(this.c.deadT + dt);
                if (this.phaseTime >= this.downSeconds) {
                    if (this.livesLeft <= 0) {
                        this._result = RoundResult.Lost;
                        this.p = Phase.Card; this.phaseTime = 0;
                    } else {
                        this.firstLife = false;
                        this._resetLife();
                        this.p = Phase.Ready; this.phaseTime = 0;
                    }
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _ageFx(dt) {
        const pop = this.popups, puf = this.puffs;
        for (let i = pop.length - 1; i >= 0; i--) { pop[i].t = f32(pop[i].t + dt); if (pop[i].t > f32(0.9)) pop.splice(i, 1); }
        for (let i = puf.length - 1; i >= 0; i--) { puf[i].t = f32(puf[i].t + dt); if (puf[i].t > f32(0.45)) puf.splice(i, 1); }
    }

    // ------------------------------------------------------------------ one step of play
    _stepPlay(dt, input) {
        this.lifeTime = f32(this.lifeTime + dt);

        // ---- the bonus timer
        this._timerAcc = f32(this._timerAcc + dt);
        while (this._timerAcc >= this.timerStep) {
            this._timerAcc = f32(this._timerAcc - this.timerStep);
            if (this.bonus > 0) { this.bonus -= 100; this._cues.emit(SoundCue.Tick); }
            if (this.bonus <= 0) {
                this.bonus = 0;
                if (!this.credit.unlosable) { this._die(Cause.Timer); return; }
            }
        }

        this._stepForeman(dt);
        if (this._stepClimber(dt, input)) { this._win(); return; }
        this._stepDrums(dt);
        this._stepFires(dt);
        this._pickups();
        const c = this.c;
        if (c.hammerLeft > 0) { c.hammerLeft = f32(c.hammerLeft - dt); if (c.hammerLeft < 0) c.hammerLeft = 0; this._smash(); }
        if (this._collide()) return;
        this._scoreJumps();
        removeDead(this.drums);
        removeDead(this.fires);
        if (c.g > this._bestGirder && c.m === Mode.Walk) this._bestGirder = c.g;
    }

    // ---- the foreman: the straight drop once a life, then a throw every throwGap (+-25%)
    _stepForeman(dt) {
        this.throwFlash = f32(this.throwFlash + dt);
        if (!this._dropDone) {
            const heave = f32(this.dropAt - f32(0.5));
            if (this.lifeTime >= heave) { this.foremanLift = f32(this.lifeTime - heave); this.foremanDropping = true; }
            if (this.lifeTime >= this.dropAt) {
                this._dropDone = true; this.foremanLift = 0; this.foremanDropping = false;
                this.drums.push(new Drum({ id: this._nextId++, m: DrumMode.Drop, x: L.DropX, y: f32(47), g: 5, side: 0 }));
                this.throwFlash = 0;
            }
            return;
        }
        this._throwLeft = f32(this._throwLeft - dt);
        this.foremanDropping = false;
        this.foremanLift = this._throwLeft < f32(0.5) ? f32(f32(0.5) - Math.max(0, this._throwLeft)) : 0;
        if (this._throwLeft <= 0) {
            let alive = 0;
            for (const d of this.drums) if (!d.dead) alive++;
            if (alive >= this.maxDrums) { this._throwLeft = f32(0.3); return; }
            const g = L.G[5];
            const nd = new Drum({ id: this._nextId++, m: DrumMode.Roll, g: 5, dir: g.downhill, x: L.ThrowX });
            nd.y = g.surface(nd.x);
            nd.side = sign(f32(nd.x - this.c.x));
            this.drums.push(nd);
            this._thrown++;
            this._cues.emit(SoundCue.Miss);
            this.foremanLift = 0; this.throwFlash = 0;
            this._throwLeft = f32(this.throwGap * f32(f32(0.75) + f32(f32(0.5) * f32(this._rng.nextDouble()))));
        }
    }

    // ---- the climber. Returns true when he steps onto the top platform.
    _stepClimber(dt, input) {
        const c = this.c;
        const left = input != null && input.held(Pad.Left), right = input != null && input.held(Pad.Right);
        const up = input != null && input.held(Pad.Up), down = input != null && input.held(Pad.Down);
        const jump = input != null && input.pressed(Pad.A);
        const dir = right && !left ? 1 : left && !right ? -1 : 0;
        const hammer = c.hammerLeft > 0;

        switch (c.m) {
            case Mode.Walk: {
                const g = L.G[c.g];
                if (!hammer && up) {
                    const l = L.upLadderAt(c.g, c.x, LadderGrab);
                    if (l != null) { c.m = Mode.Ladder; c.ladderIdx = l.index; c.x = l.x; c.feet = l.yBottom; break; }
                }
                if (!hammer && down) {
                    const l = L.downLadderAt(c.g, c.x, LadderGrab);
                    if (l != null) { c.m = Mode.Ladder; c.ladderIdx = l.index; c.x = l.x; c.feet = l.yTop; break; }
                }
                if (!hammer && jump) {
                    c.m = Mode.Jump; c.jumpT = 0; c.jumpVX = f32(dir * this.walkSpeed); c.jumpSerial++;
                    if (dir !== 0) c.facing = dir;
                    break;
                }
                if (dir !== 0) {
                    c.facing = dir;
                    const nx = g.clamp(f32(c.x + f32(f32(dir * this.walkSpeed) * dt)), f32(5));
                    c.walkDist = f32(c.walkDist + Math.abs(f32(nx - c.x)));
                    c.x = nx;
                }
                c.feet = g.surface(c.x);
                break;
            }
            case Mode.Jump: {
                const g = L.G[c.g];
                c.jumpT = f32(c.jumpT + dt);
                c.x = g.clamp(f32(c.x + f32(c.jumpVX * dt)), f32(5));
                const rise = f32(f32(JumpV0 * c.jumpT) - f32(f32(f32(f32(0.5) * JumpG) * c.jumpT) * c.jumpT));
                if (rise <= 0 && c.jumpT > f32(0.05)) { c.m = Mode.Walk; c.feet = g.surface(c.x); }
                else c.feet = f32(g.surface(c.x) - rise);
                break;
            }
            case Mode.Ladder: {
                const l = L.Ladders[c.ladderIdx];
                c.x = l.x;
                if (up && !down) { c.feet = f32(c.feet - f32(this.climbSpeed * dt)); c.climbDist = f32(c.climbDist + f32(this.climbSpeed * dt)); }
                else if (down && !up) { c.feet = f32(c.feet + f32(this.climbSpeed * dt)); c.climbDist = f32(c.climbDist + f32(this.climbSpeed * dt)); }
                if (c.feet <= l.yTop) {
                    c.feet = l.yTop; c.m = Mode.Walk; c.g = l.lower + 1; c.ladderIdx = -1;
                    if (c.g === L.TopIndex) return true;
                } else if (c.feet >= l.yBottom) {
                    c.feet = l.yBottom; c.m = Mode.Walk; c.g = l.lower; c.ladderIdx = -1;
                }
                break;
            }
        }
        return false;
    }

    // ---- the drums
    _stepDrums(dt) {
        const levels = L.G;
        for (const d of this.drums) {
            if (d.dead) continue;
            switch (d.m) {
                case DrumMode.Roll: {
                    const g = levels[d.g];
                    const step = f32(this.drumSpeed * dt);
                    const nx = f32(d.x + f32(d.dir * step));
                    // a ladder top on this girder: decide once whether to go down it
                    if (d.g > 0)
                        for (const l of L.Ladders) {
                            if (l.lower !== d.g - 1 || l.index === d.lastLadder) continue;
                            const crossed = f32(f32(d.x - l.x) * f32(nx - l.x)) <= 0;
                            if (!crossed) continue;
                            d.lastLadder = l.index;
                            if (this._rng.nextDouble() < this.ladderChance) {
                                d.m = DrumMode.Ladder; d.ladderIdx = l.index; d.x = l.x; d.y = l.yTop;
                                this._laddersTaken++;
                                break;
                            }
                        }
                    if (d.m !== DrumMode.Roll) break;
                    d.x = nx; d.roll = f32(d.roll + step);
                    if (d.g === 0 && d.x <= L.OilIntake) {
                        d.dead = true;
                        this._feedOil();
                        break;
                    }
                    if (d.x >= g.x1 || d.x < g.x0) {
                        d.m = DrumMode.Fall; d.vx = f32(f32(d.dir * this.drumSpeed) * f32(0.55)); d.vy = 0;
                        break;
                    }
                    d.y = g.surface(d.x);
                    break;
                }
                case DrumMode.Fall: {
                    d.vy = f32(d.vy + f32(DrumGravity * dt));
                    d.x = f32(d.x + f32(d.vx * dt)); d.y = f32(d.y + f32(d.vy * dt));
                    d.roll = f32(d.roll + f32(Math.abs(d.vx) * dt));
                    const below = levels[d.g - 1];
                    const sx = below.clamp(d.x, f32(6));
                    if (d.y >= below.surface(sx)) {
                        d.g--; d.x = sx; d.y = below.surface(sx);
                        d.m = DrumMode.Roll; d.dir = below.downhill; d.lastLadder = -1;
                    }
                    break;
                }
                case DrumMode.Ladder: {
                    const l = L.Ladders[d.ladderIdx];
                    d.y = f32(d.y + f32(f32(this.drumSpeed * LadderDrumMul) * dt));
                    if (d.y >= l.yBottom) {
                        d.y = l.yBottom; d.g = l.lower; d.m = DrumMode.Roll;
                        d.dir = levels[d.g].downhill; d.lastLadder = l.index; d.ladderIdx = -1;
                    }
                    break;
                }
                case DrumMode.Drop:
                    d.y = f32(d.y + f32(DropSpeed * dt));
                    d.roll = f32(d.roll + f32(f32(DropSpeed * dt) * f32(0.5)));
                    if (d.y >= f32(L.oilTop + 4)) { d.dead = true; this._feedOil(); }
                    break;
            }
        }
    }

    // a drum went into the oil drum: it burns, and spits a fire-ball while there is room
    _feedOil() {
        this.oilLit = true;
        let alive = 0;
        for (const f of this.fires) if (!f.dead) alive++;
        if (alive >= this.fireMax) return;
        const top = L.oilTop;
        const id = this._nextId++;
        this.fires.push(new Fire({
            id, x: f32(L.OilX + f32(L.OilW * 0.5)), y: top,
            vx: f32(f32(40) + f32(f32(20) * f32(this._rng.nextDouble()))), vy: f32(-110), hop: true, dir: 1, turn: f32(0.8),
        }));
    }

    // ---- the fire-balls: out of the oil drum in a hop, then wandering girder 0
    _stepFires(dt) {
        const g = L.G[0];
        const lo = f32(L.OilIntake + 6), hi = f32(g.x1 - 8);
        const c = this.c;
        for (const f of this.fires) {
            if (f.dead) continue;
            if (f.hop) {
                f.vy = f32(f.vy + f32(DrumGravity * dt));
                f.x = f32(f.x + f32(f.vx * dt)); f.y = f32(f.y + f32(f.vy * dt));
                if (f.vy > 0 && f.y >= g.surface(f.x)) { f.hop = false; f.y = g.surface(f.x); f.dir = 1; f.turn = f32(0.6); }
                continue;
            }
            f.turn = f32(f.turn - dt);
            if (f.turn <= 0) {
                f.turn = f32(f32(0.6) + f32(this._rng.nextDouble()));
                const r = this._rng.nextDouble();
                if (r < 0.12) f.dir = 0;
                else if (c.g === 0 && c.m !== Mode.Ladder && r < 0.62) f.dir = sign(f32(c.x - f.x));
                else f.dir = this._rng.nextDouble() < 0.5 ? -1 : 1;
            }
            f.x = f32(f.x + f32(f32(f.dir * this.fireSpeed) * dt));
            if (f.x < lo) { f.x = lo; f.dir = 1; }
            if (f.x > hi) { f.x = hi; f.dir = -1; }
            f.y = g.surface(f.x);
        }
    }

    // ---- the hammers: jump into one
    _pickups() {
        const c = this.c;
        if (c.m === Mode.Ladder) return;
        const top = f32(c.feet - ClimberH);
        for (let i = 0; i < this.hammerTaken.length; i++) {
            if (this.hammerTaken[i]) continue;
            const h = L.Hammers[i];
            if (h.girder !== c.g) continue;
            const hb = f32(L.G[h.girder].surface(h.x) - HammerFloat);
            if (Math.abs(f32(c.x - h.x)) < f32(ClimberHalfW + 4) && top < hb) {
                this.hammerTaken[i] = true;
                c.hammerLeft = this.hammerSeconds;
                this._hammers++;
                this._cues.emit(SoundCue.Bonus);
                this._log += 'H' + fmt(this._time, 1, F32) + ' ';
            }
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

    _smash() {
        const [x0, x1, y0, y1] = this._hammerZone();
        for (const d of this.drums) {
            if (d.dead) continue;
            if (overlap(x0, x1, y0, y1, f32(d.x - DrumHalf), f32(d.x + DrumHalf), f32(d.y - DrumTop), f32(d.y - DrumBottom))) {
                d.dead = true; this._smashed++;
                this._addPoints(PointsSmash, d.x, f32(d.y - 16));
                this.puffs.push(new Puff(d.x, f32(d.y - 6), false));
                this._cues.emit(SoundCue.Hit);
            }
        }
        for (const f of this.fires) {
            if (f.dead) continue;
            if (overlap(x0, x1, y0, y1, f32(f.x - FireHalf), f32(f.x + FireHalf), f32(f.y - FireTop), f32(f.y - FireBottom))) {
                f.dead = true; this._smashed++;
                this._addPoints(PointsSmash, f.x, f32(f.y - 16));
                this.puffs.push(new Puff(f.x, f32(f.y - 5), true));
                this._cues.emit(SoundCue.Hit);
            }
        }
    }

    // ---- contact: a life, or on the mercy credit the thing is knocked apart
    _collide() {
        const C = this.c;
        const cx0 = f32(C.x - ClimberHalfW), cx1 = f32(C.x + ClimberHalfW), cy0 = f32(C.feet - ClimberH), cy1 = C.feet;
        for (const d of this.drums) {
            if (d.dead) continue;
            if (!overlap(cx0, cx1, cy0, cy1, f32(d.x - DrumHalf), f32(d.x + DrumHalf), f32(d.y - DrumTop), f32(d.y - DrumBottom))) continue;
            if (this.credit.unlosable) { d.dead = true; this.puffs.push(new Puff(d.x, f32(d.y - 6), false)); this._cues.emit(SoundCue.Miss); continue; }
            if (C.m === Mode.Ladder || d.m === DrumMode.Ladder) this._deathLadder++;
            this._die(Cause.Drum);
            return true;
        }
        for (const f of this.fires) {
            if (f.dead || (f.hop && f.vy < 0)) continue;
            if (!overlap(cx0, cx1, cy0, cy1, f32(f.x - FireHalf), f32(f.x + FireHalf), f32(f.y - FireTop), f32(f.y - FireBottom))) continue;
            if (this.credit.unlosable) { f.dead = true; this.puffs.push(new Puff(f.x, f32(f.y - 5), true)); this._cues.emit(SoundCue.Miss); continue; }
            this._die(Cause.Fire);
            return true;
        }
        return false;
    }

    // ---- 100 for every drum that passes under a hop on the same girder
    _scoreJumps() {
        const C = this.c;
        for (const d of this.drums) {
            if (d.dead) continue;
            const side = sign(f32(d.x - C.x));
            if (C.m === Mode.Jump && d.m === DrumMode.Roll && d.g === C.g && d.side !== 0 && side !== d.side && d.jumpScored !== C.jumpSerial) {
                d.jumpScored = C.jumpSerial;
                this._jumped++;
                this._addPoints(PointsJump, C.x, f32(C.feet - 22));
                this._cues.emit(SoundCue.Bonus);
            }
            if (side !== 0) d.side = side;
        }
    }

    _addPoints(pts, x, y) {
        this._score += pts;
        this.popups.push(new Popup(x, y, pts));
    }

    _die(cause) {
        this.lastCause = cause;
        this._deaths++;
        if (cause === Cause.Drum) this._deathDrum++; else if (cause === Cause.Fire) this._deathFire++; else this._deathTimer++;
        this.livesLeft--;
        const C = this.c;
        C.m = Mode.Dead; C.deadT = 0; C.hammerLeft = 0;
        this.p = Phase.Down; this.phaseTime = 0;
        this._cues.emit(SoundCue.Die);
        this._log += 'D' + fmt(this._time, 1, F32) + 'g' + C.g + (cause === Cause.Drum ? 'drum' : cause === Cause.Fire ? 'fire' : 'time') + ' ';
    }

    _win() {
        this.c.m = Mode.Top;
        this._bestGirder = L.TopIndex;
        this.bonusAwarded = this.bonus;
        this._score += this.bonus;
        this._result = RoundResult.Won;
        this.p = Phase.Card; this.phaseTime = 0;
        this._cues.emit(SoundCue.Win);
        this._log += 'W' + fmt(this._time, 1, F32) + ' bonus ' + this.bonus + ' ';
    }

    // ------------------------------------------------------------------ for the bot and the renderer
    get rise() {
        const c = this.c;
        return c.m === Mode.Jump ? Math.max(0, f32(f32(JumpV0 * c.jumpT) - f32(f32(f32(f32(0.5) * JumpG) * c.jumpT) * c.jumpT))) : 0;
    }

    collectStats(into) {
        add(into, 'deaths', this._deaths);
        add(into, 'dDrum', this._deathDrum);
        add(into, 'dFire', this._deathFire);
        add(into, 'dTimer', this._deathTimer);
        add(into, 'dOnLadder', this._deathLadder);
        add(into, 'jumped', this._jumped);
        add(into, 'smashed', this._smashed);
        add(into, 'hammers', this._hammers);
        add(into, 'bestGirder', this._bestGirder);
        add(into, 'thrown', this._thrown);
        add(into, 'drumLadders', this._laddersTaken);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

IronworksSim.Phase = Phase;
IronworksSim.Mode = Mode;
IronworksSim.DrumMode = DrumMode;
IronworksSim.Cause = Cause;
IronworksSim.Drum = Drum;
IronworksSim.Fire = Fire;
Object.assign(IronworksSim, {
    JumpV0, JumpG, DrumGravity, DropSpeed, LadderDrumMul, LadderGrab, ClimberHalfW, ClimberH,
    DrumHalf, DrumTop, DrumBottom, FireHalf, FireTop, FireBottom, HammerFloat, HammerFront, HammerBack, HammerHigh,
    StartLives, BonusStart, PointsJump, PointsSmash,
});
