// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE ROUND (ICabinetSim).
// Port of IronDojoSim.cs (Staging/Batch3/irondojo), float for float: every C# float is f32().
//
// Floor one of the pagoda, Kung-Fu Master style. The fighter enters at the right-hand door and
// fights his way LEFT along a scrolling floor; attackers walk in from both edges of the tube:
//   GRABBER  walks up and hugs you; while he holds you your energy drains, and only wiggling the
//            stick (fresh direction presses) shakes him off. One blow drops him. 200.
//   THROWER  stops at range and throws knives, HIGH (duck) or LOW (jump); his arm shows which
//            before the knife leaves. One blow drops him. 300.
//   DWARF    tumbles along the boards, too low for a standing blow: duck and strike, or jump him.
//            100.
//   BOSS     the stick fighter at the far end guards the stairs. His stick out-reaches your kick;
//            he parries anything he sees coming, and is open only while he winds up (the
//            telegraph: stick raised, a step in), while he swings and while he recovers.
//            2000 + a time bonus of 100 a second left.
// A = punch (short, fast), B = kick (long, slower); stick down ducks (and makes the blows low),
// stick up jumps (A or B in the air = a jump kick). Energy is 10 units; 3 lives, a life being a
// full refill where you fell. The floor timer is 60 s a life; TIME UP costs a life.
// ROUND WON = the boss is down AND you reach the stairs (the result comes from the game, never
// from the clock). Lost = the third knockout.
//
// MERCY: the knobs slow every attacker's approach 10 % per lost round and lengthen the boss's
// telegraph per lost round. On the unlosable credit (credit.unlosable) the sim's own rule holds:
// the boss's stick never lands (bossLands = 0 on that credit), energy never falls below one unit,
// and the timer stops at zero instead of calling TIME UP.
import { f32, fmt, F32, idiv, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4 } from '../../sdk/index.js';
import { IronDojoScroll } from './scroll.js';

export const Act = Object.freeze({ Idle: 0, Walk: 1, Punch: 2, Kick: 3, Duck: 4, DuckPunch: 5, DuckKick: 6, Jump: 7, JumpKick: 8, Flinch: 9, Grabbed: 10, Down: 11, Climb: 12 });
export const FoeKind = Object.freeze({ Grabber: 0, Thrower: 1, Dwarf: 2 });
export const FoeState = Object.freeze({ Walk: 0, Hold: 1, Stunned: 2, Aim: 3, Windup: 4, Hop: 5, Dying: 6 });
export const BossState = Object.freeze({ Wait: 0, Approach: 1, Idle: 2, Retreat: 3, Telegraph: 4, Swing: 5, Recover: 6, Hurt: 7, Down: 8 });
export const Hurt = Object.freeze({ None: 0, Grab: 1, Knife: 2, Dwarf: 3, Boss: 4, Time: 5 });
const HurtNames = ['none', 'grab', 'knife', 'dwarf', 'boss', 'time'];          // C# Hurt.ToString().ToLowerInvariant()

const F32_MAX = 3.4028234663852886e38;                                           // float.MaxValue

export class Fighter {
    constructor() {
        this.x = 0; this.h = 0; this.vh = 0; this.driftX = 0; this.knockV = 0;
        this.dir = -1;                      // -1 faces left (the way up the floor), +1 right
        this.a = Act.Idle;
        this.at = 0;                        // seconds in the current act
        this.kickT = 0;                     // jump kick: seconds since it was thrown
        this.spent = false;                 // this blow already connected / was parried
        this.landed = false;                // this blow hit something
        this.invuln = 0; this.grabImmune = 0;
        this.energy = 0;
        this.wiggles = 0;
        this.drain = 0;
        this.walkClock = 0;
    }
    get ducking() { return this.a === Act.Duck || this.a === Act.DuckPunch || this.a === Act.DuckKick; }
    get airborne() { return this.h > 0 || this.vh > 0; }
    get attacking() { return this.a === Act.Punch || this.a === Act.Kick || this.a === Act.DuckPunch || this.a === Act.DuckKick || this.a === Act.JumpKick; }
}

export class Foe {
    constructor() {
        this.id = 0;
        this.kind = FoeKind.Grabber;
        this.s = FoeState.Walk;
        this.x = 0; this.h = 0; this.vx = 0; this.vh = 0;
        this.dir = 0;
        this.t = 0; this.clock = 0; this.speed = 0; this.standoff = 0;
        this.knifeHigh = false;
        this.side = 0;                      // grabber: which side of the fighter he holds (-1 left, +1 right)
    }
    get live() { return this.s !== FoeState.Dying; }
}

export class Knife {
    constructor(id, x, dir, high, speed) {
        this.id = id; this.x = x; this.dir = dir; this.high = high; this.speed = speed; this.passed = false;
    }
}

export class Boss {
    constructor() {
        this.x = 0;
        this.dir = 1;
        this.s = BossState.Wait;
        this.t = 0; this.dur = 0; this.clock = 0; this.knockV = 0;
        this.hp = 0; this.maxHP = 0;
        this.active = false;
        this.whiff = false;                 // the last swing could not land (mercy) or missed
    }
    get alive() { return this.s !== BossState.Down; }
    get open() { return this.s === BossState.Telegraph || this.s === BossState.Swing || this.s === BossState.Recover; }
}

export class Fx {
    constructor(kind, x, h, value = 0) {
        this.kind = kind;                   // 0 hit spark, 1 score popup, 2 parry clack
        this.x = x; this.h = h; this.t = 0;
        this.value = value;
    }
}

const Phase = Object.freeze({ Idle: 0, Intro: 1, Play: 2, KO: 3, TimeUp: 4, Climb: 5, Card: 6, Over: 7 });

// ------------------------------------------------------------------ the machine (not mercy knobs)
const C = Object.freeze({
    MaxEnergy: 10, StartLives: 3,
    StairsFootX: 92, BossHomeX: 212, BossMinX: 150, BossZoneX: 470,
    WalkSpeed: 64, JumpV: 280, Gravity: 760,
    PunchStart: f32(0.05), PunchActive: f32(0.08), PunchRecover: f32(0.11),
    KickStart: f32(0.12), KickActive: f32(0.10), KickRecover: f32(0.18),
    DuckKickStart: f32(0.14),
    PunchReach: 28, KickReach: 42, LowPunchReach: 26, LowKickReach: 38, JumpKickReach: 36,
    FlinchSeconds: f32(0.3), HurtInvuln: f32(0.6),
    GrabRange: 14, DwarfContact: 10, KnifeContact: 7, ThrowerClose: 64,
    ThrowWindup: f32(0.42),
    BossWalk: 34, BossRetreat: 44, BossPrefer: 42, BossReach: 52, TelegraphStep: 10,
    BossSwingSeconds: f32(0.16), BossRecoverSeconds: f32(0.55), BossHurtSeconds: f32(0.35),
    ScoreGrabber: 200, ScoreThrower: 300, ScoreDwarf: 100, ScoreBoss: 2000, BonusPerSecond: 100,
});
// the C# compiler folds these constant sums in float
const PunchEnd = f32(f32(C.PunchStart + C.PunchActive) + C.PunchRecover);
const KickEnd = f32(f32(C.KickStart + C.KickActive) + C.KickRecover);
const DuckKickEnd = f32(f32(C.DuckKickStart + C.KickActive) + C.KickRecover);
const PunchHitEnd = f32(C.PunchStart + C.PunchActive);
const KickHitEnd = f32(C.KickStart + C.KickActive);
const DuckKickHitEnd = f32(C.DuckKickStart + C.KickActive);

function toward0(v, step) {
    if (v > 0) return Math.max(0, f32(v - step));
    if (v < 0) return Math.min(0, f32(v + step));
    return 0;
}

export class IronDojoSim {
    constructor() {
        this.introSeconds = f32(2.2); this.respawnSeconds = f32(1.6); this.koSeconds = f32(2.4);
        this.timeUpSeconds = f32(2.2); this.climbSeconds = f32(2.4); this.cardSeconds = f32(3);

        // read-only state (C# public getters)
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.phaseHold = 0;                 // how long the current Intro lasts
        this.firstIntro = false;
        this.f = new Fighter();
        this.b = new Boss();
        this.foes = [];
        this.knives = [];
        this.effects = [];
        this.cam = new IronDojoScroll();
        this.timer = 0;                     // floor timer, seconds left this life
        this.livesLeft = 0;
        this.credit = null;
        this.floorLength = 0;
        this.floorTime = 0;
        this.bonus = 0;
        this.bonusPaid = 0;
        this.lastHurt = Hurt.None;

        // knobs (after mercy)
        this.approach = 0; this.bossTelegraph = 0; this.bossLands = false;
        this.grabberSpeed = 0; this.throwerSpeed = 0; this.dwarfSpeed = 0; this.knifeSpeed = 0;
        this.spawnGap = 0; this.throwGap = 0; this.grabDrain = 0; this.pairChance = 0;
        this.maxFoes = 0; this.shakeWiggles = 0; this.bossDamage = 0;

        // moments (first time each thing happened; -1 = never) for the frame picker and the log
        this.firstKickAt = -1; this.firstGrabAt = -1; this.firstDuckUnderAt = -1; this.firstTelegraphAt = -1;
        this.firstKOAt = -1; this.bossDownAt = -1; this.stairsAt = -1; this.reachedBossAt = -1;

        this._cues = new CueBuffer();
        this._log = '';
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._nextId = 0;
        this._time = 0; this._spawnT = 0;
        this._zeroStats();
    }

    _zeroStats() {
        this._kG = this._kT = this._kD = this._grabs = this._shakes = this._knifeHits = this._knifeDodges = this._dwarfHits = 0;
        this._bossHitsTaken = this._bossBlows = this._parries = this._kos = this._timeups = this._throws = 0;
        this._dmgGrab = this._dmgKnife = this._dmgDwarf = this._dmgBoss = 0;
    }

    get mercyActive() { return this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Intro: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.KO: case Phase.TimeUp: case Phase.Climb: return CabinetState.Interlude;
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
        const B = this.b;
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this.livesLeft +
            ' kills g' + this._kG + ' t' + this._kT + ' d' + this._kD +
            ' boss ' + (B.maxHP - Math.max(0, B.hp)) + '/' + B.maxHP +
            ' bonus ' + this.bonus +
            ' dmg grab' + this._dmgGrab + ' knife' + this._dmgKnife + ' dwarf' + this._dmgDwarf + ' boss' + this._dmgBoss +
            ' | ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? (Date.now() | 0) : seed);
        this.approach = k.get('approach');
        this.bossTelegraph = k.get('bossTelegraph');
        this.bossLands = k.get('bossLands') > 0.5 && !credit.unlosable;
        this.grabberSpeed = f32(k.get('grabberSpeed') * this.approach);
        this.throwerSpeed = f32(k.get('throwerSpeed') * this.approach);
        this.dwarfSpeed = f32(k.get('dwarfSpeed') * this.approach);
        this.knifeSpeed = k.get('knifeSpeed');
        this.spawnGap = k.get('spawnGap');
        this.throwGap = k.get('throwGap');
        this.grabDrain = k.get('grabDrain');
        this.pairChance = k.get('pairChance');
        this.maxFoes = roundEven(k.get('maxFoes'));
        this.shakeWiggles = roundEven(k.get('shakeWiggles'));
        this.bossDamage = roundEven(k.get('bossDamage'));
        this.floorLength = k.get('floorLength');
        this.floorTime = k.get('floorTime');

        this.foes.length = 0; this.knives.length = 0; this.effects.length = 0;
        const f = new Fighter();
        f.x = f32(this.floorLength - 84); f.dir = -1; f.energy = C.MaxEnergy; f.a = Act.Idle;
        this.f = f;
        const b = new Boss();
        b.x = C.BossHomeX; b.dir = 1; b.s = BossState.Wait; b.maxHP = roundEven(k.get('bossHP'));
        b.hp = b.maxHP;
        this.b = b;
        this.cam.reset(this.floorLength, f.x, f.dir);
        this.livesLeft = C.StartLives;
        this.timer = this.floorTime;
        this._score = 0; this._time = 0; this._nextId = 1; this._spawnT = f32(1.4);
        this.bonus = 0; this.bonusPaid = 0; this.lastHurt = Hurt.None;
        this._result = RoundResult.None;
        this._zeroStats();
        this.firstKickAt = this.firstGrabAt = this.firstDuckUnderAt = this.firstTelegraphAt = this.firstKOAt = this.bossDownAt = this.stairsAt = this.reachedBossAt = -1;
        this._log = '';
        this._cues.resetTotals();
        this.firstIntro = true;
        this._goIntro(this.introSeconds);
    }

    _goIntro(hold) {
        this.p = Phase.Intro; this.phaseTime = 0; this.phaseHold = hold;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        switch (this.p) {
            case Phase.Intro:
                this._updateFx(dt);
                this.cam.follow(dt, this.f.x, this.f.dir);
                if (this.phaseTime >= this.phaseHold) { this.p = Phase.Play; this.phaseTime = 0; this.firstIntro = false; this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Play:
                this._playStep(dt, input);
                break;
            case Phase.KO:
            case Phase.TimeUp:
                this._downStep(dt);
                break;
            case Phase.Climb:
                this._climbStep(dt);
                break;
            case Phase.Card:
                this._updateFx(dt);
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // ------------------------------------------------------------------ play
    _playStep(dt, input) {
        if (this.b.alive) {
            const before = this.timer;
            this.timer = f32(this.timer - dt);
            if (this.timer > 0 && this.timer <= 10 && Math.ceil(before) !== Math.ceil(this.timer)) this._cues.emit(SoundCue.Tick);
            if (this.timer <= 0) {
                this.timer = 0;
                if (!this.credit.unlosable) { this._startTimeUp(); return; }
            }
        }
        this._updateFighter(dt, input);
        this._resolveBlow();
        this._updateSpawner(dt);
        this._updateFoes(dt, true);
        this._updateKnives(dt);
        this._updateBoss(dt);
        this._updateFx(dt);
        this.cam.follow(dt, this.f.x, this.f.dir);
        if (this.f.energy <= 0) { this._startKO(); return; }
        if (!this.b.alive && this.f.x <= C.StairsFootX + 4 && !this.f.airborne && this.f.a !== Act.Grabbed) this._startClimb();
    }

    // ------------------------------------------------------------------ the fighter
    _updateFighter(dt, input) {
        const f = this.f;
        f.invuln = Math.max(0, f32(f.invuln - dt));
        f.grabImmune = Math.max(0, f32(f.grabImmune - dt));
        f.at = f32(f.at + dt);
        if (f.knockV !== 0) {
            f.x = f32(f.x + f32(f.knockV * dt));
            f.knockV = toward0(f.knockV, f32(480 * dt));
        }
        let landed = false;
        if (f.airborne) {
            f.h = f32(f.h + f32(f.vh * dt));
            f.vh = f32(f.vh - f32(C.Gravity * dt));
            if (f.h <= 0) { f.h = 0; f.vh = 0; landed = true; }
        }

        switch (f.a) {
            case Act.Grabbed: {
                const holders = this._holders();
                if (holders === 0) { this._setAct(Act.Idle); break; }
                if (input != null && input.pressedDir4() !== Dir4.None) f.wiggles++;
                const need = this.shakeWiggles + 2 * (holders - 1);
                if (f.wiggles >= need) { this._shakeOff(); break; }
                f.drain = f32(f.drain + f32(dt * holders));
                while (f.drain >= this.grabDrain && f.energy > 0) {
                    f.drain = f32(f.drain - this.grabDrain);
                    this._damage(1, Hurt.Grab, 0, false);
                    if (this.credit.unlosable && f.energy <= 1) f.drain = 0;
                }
                break;
            }
            case Act.Flinch:
                if (f.at >= C.FlinchSeconds && !f.airborne) this._setAct(Act.Idle);
                break;
            case Act.Punch:
            case Act.DuckPunch:
                if (f.at >= PunchEnd) this._endBlow(input);
                break;
            case Act.Kick:
                if (f.at >= KickEnd) this._endBlow(input);
                break;
            case Act.DuckKick:
                if (f.at >= DuckKickEnd) this._endBlow(input);
                break;
            case Act.Jump:
            case Act.JumpKick:
                f.x = f32(f.x + f32(f.driftX * dt));
                if (f.a === Act.JumpKick) f.kickT = f32(f.kickT + dt);
                else if (input != null && (input.pressed(Pad.A) || input.pressed(Pad.B))) {
                    f.a = Act.JumpKick; f.kickT = 0; f.spent = false; f.landed = false;
                    this._markKick();
                }
                if (landed || !f.airborne) this._setAct(Act.Idle);
                break;
            case Act.Down:
            case Act.Climb:
                break;
            default:
                this._control(dt, input);
                break;
        }
        this._clampFighter();
    }

    _control(dt, input) {
        const f = this.f;
        if (input == null) { if (f.a !== Act.Idle) this._setAct(Act.Idle); return; }
        const sx = input.held(Pad.Left) ? -1 : input.held(Pad.Right) ? 1 : 0;
        const down = input.held(Pad.Down);
        const pa = input.pressed(Pad.A), pb = input.pressed(Pad.B);
        if (pa || pb) {
            if (sx !== 0) f.dir = sx;
            const a = pa ? (down ? Act.DuckPunch : Act.Punch) : (down ? Act.DuckKick : Act.Kick);
            this._setAct(a);
            f.spent = false; f.landed = false;
            if (a === Act.Kick || a === Act.DuckKick) this._markKick();
            return;
        }
        if (input.held(Pad.Up) && !down) {
            if (sx !== 0) f.dir = sx;
            this._setAct(Act.Jump);
            f.vh = C.JumpV; f.h = f32(0.01);
            f.driftX = f32(f32(sx * C.WalkSpeed) * f32(0.9));
            return;
        }
        if (down) {
            if (sx !== 0) f.dir = sx;
            if (f.a !== Act.Duck) this._setAct(Act.Duck);
            return;
        }
        if (sx !== 0) {
            f.dir = sx;
            f.x = f32(f.x + f32(f32(sx * C.WalkSpeed) * dt));
            f.walkClock = f32(f.walkClock + dt);
            if (f.a !== Act.Walk) this._setAct(Act.Walk);
            return;
        }
        if (f.a !== Act.Idle) this._setAct(Act.Idle);
    }

    _markKick() { if (this.firstKickAt < 0) this.firstKickAt = this._time; }

    _endBlow(input) {
        this._setAct(input != null && input.held(Pad.Down) ? Act.Duck : Act.Idle);
    }

    _setAct(a) { this.f.a = a; this.f.at = 0; }

    _clampFighter() {
        const f = this.f;
        let min = C.StairsFootX - 20;
        const max = f32(this.floorLength - 24);
        if (this.b.alive) min = Math.max(min, f32(this.b.x + 18));                  // the boss bars the way
        for (const e of this.foes)                                                  // throwers stand their ground
            if (e.kind === FoeKind.Thrower && e.live && !f.airborne) {
                if (e.x < f.x && f32(f.x - e.x) < 16) f.x = f32(e.x + 16);
                else if (e.x >= f.x && f32(e.x - f.x) < 16) f.x = f32(e.x - 16);
            }
        if (f.x < min) { f.x = min; if (f.knockV < 0) f.knockV = 0; }
        if (f.x > max) { f.x = max; if (f.knockV > 0) f.knockV = 0; }
    }

    _holders() {
        let n = 0;
        for (const e of this.foes) if (e.s === FoeState.Hold) n++;
        return n;
    }

    _shakeOff() {
        for (const e of this.foes)
            if (e.s === FoeState.Hold) { e.s = FoeState.Stunned; e.t = f32(0.9); e.vx = f32(e.side * 170); }
        this._setAct(Act.Idle);
        this.f.grabImmune = f32(0.6); this.f.wiggles = 0; this.f.drain = 0;
        this._shakes++;
        this._cues.emit(SoundCue.Tick);
    }

    // the damage a fighter takes; the unlosable credit never drops below one unit
    _damage(n, cause, fromDir, flinch) {
        const f = this.f;
        f.energy = this.credit.unlosable ? Math.max(1, f.energy - n) : f.energy - n;
        this.lastHurt = cause;
        switch (cause) {
            case Hurt.Grab: this._dmgGrab += n; break;
            case Hurt.Knife: this._dmgKnife += n; this._knifeHits++; break;
            case Hurt.Dwarf: this._dmgDwarf += n; this._dwarfHits++; break;
            case Hurt.Boss: this._dmgBoss += n; this._bossHitsTaken++; break;
        }
        if (cause !== Hurt.Grab) this._cues.emit(SoundCue.Miss);
        if (!flinch) return;
        f.invuln = C.HurtInvuln;
        if (f.a === Act.Grabbed) return;                                          // still held: no stagger
        this._setAct(Act.Flinch);
        f.knockV = f32(fromDir * 110);
        f.driftX = 0;
    }

    // ------------------------------------------------------------------ the fighter's blows
    _resolveBlow() {
        const f = this.f;
        let reach, low, active;
        switch (f.a) {
            case Act.Punch: active = f.at >= C.PunchStart && f.at < PunchHitEnd; reach = C.PunchReach; low = false; break;
            case Act.DuckPunch: active = f.at >= C.PunchStart && f.at < PunchHitEnd; reach = C.LowPunchReach; low = true; break;
            case Act.Kick: active = f.at >= C.KickStart && f.at < KickHitEnd; reach = C.KickReach; low = false; break;
            case Act.DuckKick: active = f.at >= C.DuckKickStart && f.at < DuckKickHitEnd; reach = C.LowKickReach; low = true; break;
            case Act.JumpKick: active = f.kickT >= f32(0.05) && f.kickT < f32(0.4); reach = C.JumpKickReach; low = false; break;
            default: return;
        }
        if (!active || f.spent) return;

        let best = null, bd = F32_MAX;
        for (const e of this.foes) {
            if (!e.live) continue;
            if (e.kind === FoeKind.Dwarf && !low && e.h < 10) continue;             // a tumbling dwarf is under a standing blow
            const dx = f32(f32(e.x - f.x) * f.dir);
            if (dx < -4 || dx > reach) continue;
            if (dx < bd) { bd = dx; best = e; }
        }
        let bdx = F32_MAX;
        const B = this.b;
        if (B.active && B.alive && B.s !== BossState.Hurt) {
            const dx = f32(f32(B.x - f.x) * f.dir);
            if (dx >= -4 && dx <= reach + 4) bdx = dx;
        }
        if (bdx < bd) {
            f.spent = true;
            if (B.open) { this._hitBoss(); f.landed = true; }
            else this._parry();
            return;
        }
        if (best == null) return;
        f.spent = true; f.landed = true;
        this._drop(best, true);
        this._cues.emit(SoundCue.Hit);
        this.effects.push(new Fx(0, f32(best.x - f32(f.dir * 4)), low ? 8 : 22));
    }

    _drop(e, scored) {
        const F = this.f;
        e.s = FoeState.Dying;
        e.t = 0;
        e.vx = scored ? f32(F.dir * 70) : f32((e.x >= F.x ? 1 : -1) * 60);
        e.vh = 150;
        if (!scored) return;
        const pts = e.kind === FoeKind.Grabber ? C.ScoreGrabber : e.kind === FoeKind.Thrower ? C.ScoreThrower : C.ScoreDwarf;
        if (e.kind === FoeKind.Grabber) this._kG++; else if (e.kind === FoeKind.Thrower) this._kT++; else this._kD++;
        this._score += pts;
        this.effects.push(new Fx(1, e.x, 36, pts));
    }

    _parry() {
        this._parries++;
        this.f.knockV = f32(-this.f.dir * 130);
        this._cues.emit(SoundCue.Tick);
        this.effects.push(new Fx(2, f32(this.b.x - f32(this.f.dir * 10)), 22));
    }

    _hitBoss() {
        const B = this.b, F = this.f;
        this._bossBlows++;
        B.hp--;
        this._cues.emit(SoundCue.Hit);
        this.effects.push(new Fx(0, f32(B.x - f32(F.dir * 6)), 22));
        const away = B.x >= F.x ? 1 : -1;
        if (B.hp <= 0) {
            B.s = BossState.Down; B.t = 0; B.knockV = f32(away * 60);
            this.bossDownAt = this._time;
            this._score += C.ScoreBoss;
            this.effects.push(new Fx(1, B.x, 44, C.ScoreBoss));
            this._cues.emit(SoundCue.Bonus);
            this._log += 'B' + fmt(this._time, 1, F32) + ' ';
            for (const e of this.foes) if (e.live) this._drop(e, false);            // the floor empties
            this.knives.length = 0;
            if (F.a === Act.Grabbed) this._setAct(Act.Idle);
            return;
        }
        B.s = BossState.Hurt; B.t = C.BossHurtSeconds; B.knockV = f32(away * 90);
    }

    // ------------------------------------------------------------------ attackers
    _updateSpawner(dt) {
        const F = this.f;
        if (!this.b.alive || F.x < C.BossZoneX) return;
        this._spawnT = f32(this._spawnT - dt);
        if (this._spawnT > 0) return;
        let live = 0, throwers = 0;
        for (const e of this.foes) if (e.live) { live++; if (e.kind === FoeKind.Thrower) throwers++; }
        if (live >= this.maxFoes) { this._spawnT = f32(0.3); return; }
        this._spawnT = f32(this.spawnGap * this._range(0.6, 1.4));

        let side = this._rng.nextDouble() < 0.6 ? -1 : 1;                           // -1 = ahead, up the floor
        let x = this._spawnX(side);
        if (x === null) { side = -side; x = this._spawnX(side); if (x === null) return; }
        const r = this._rng.nextDouble();
        let kind;
        if (r < 0.2 && throwers === 0 && F.x < f32(this.floorLength - 240)) kind = FoeKind.Thrower;
        else if (r < 0.48) kind = FoeKind.Dwarf;
        else kind = FoeKind.Grabber;
        this._spawn(kind, x);
        if (kind === FoeKind.Grabber && live + 1 < this.maxFoes && this._rng.nextDouble() < this.pairChance) {
            const x2 = this._spawnX(-side);
            if (x2 !== null) this._spawn(FoeKind.Grabber, x2);                        // the classic pincer
        }
    }

    // C# bool SpawnX(int side, out float x): returns x, or null for false
    _spawnX(side) {
        const cx = this.cam.camX;
        const x = side < 0 ? f32(cx - 16) : f32(f32(cx + IronDojoScroll.ScreenW) + 16);
        if (side < 0) return x > C.BossZoneX - 80 ? x : null;
        return x < f32(this.floorLength - 20) ? x : null;
    }

    _spawn(kind, x) {
        const e = new Foe();
        e.id = this._nextId++; e.kind = kind; e.s = FoeState.Walk; e.x = x; e.dir = this.f.x >= x ? 1 : -1;
        switch (kind) {
            case FoeKind.Grabber: e.speed = f32(this.grabberSpeed * this._range(0.9, 1.1)); break;
            case FoeKind.Thrower: e.speed = this.throwerSpeed; e.standoff = this._range(96, 128); break;
            default: e.speed = f32(this.dwarfSpeed * this._range(0.9, 1.1)); break;
        }
        e.clock = this._range(0, 1);
        this.foes.push(e);
    }

    _updateFoes(dt, live) {
        const f = this.f;
        for (let i = this.foes.length - 1; i >= 0; i--) {
            const e = this.foes[i];
            e.clock = f32(e.clock + dt);
            const dx = f32(f.x - e.x), ad = Math.abs(dx);
            const toward = dx >= 0 ? 1 : -1;
            if (e.s === FoeState.Dying) {
                e.x = f32(e.x + f32(e.vx * dt)); e.h = f32(e.h + f32(e.vh * dt)); e.vh = f32(e.vh - f32(700 * dt));
                if (e.h < -90) this.foes.splice(i, 1);
                continue;
            }
            if (!live) continue;
            switch (e.kind) {
                case FoeKind.Grabber: this._updateGrabber(e, dt, toward, ad); break;
                case FoeKind.Thrower: this._updateThrower(e, dt, toward, ad); break;
                default: this._updateDwarf(e, dt, toward, ad); break;
            }
            if (e.x > f32(this.floorLength - 16)) e.x = f32(this.floorLength - 16);          // nobody leaves by the door
            if (Math.abs(f32(e.x - f32(this.cam.camX + 160))) > 520) this.foes.splice(i, 1);  // wandered far off the tube
        }
    }

    _updateGrabber(e, dt, toward, ad) {
        const f = this.f;
        switch (e.s) {
            case FoeState.Walk:
                e.dir = toward;
                if (ad > C.GrabRange) {
                    if (!this._crowded(e, ad)) e.x = f32(e.x + f32(toward * Math.min(f32(e.speed * dt), f32(f32(ad - C.GrabRange) + f32(0.5)))));
                }
                else if (!f.airborne && f.grabImmune <= 0 && f.a !== Act.Down && f.a !== Act.Climb && f.invuln <= f32(0.2)) {
                    e.s = FoeState.Hold;
                    e.side = e.x >= f.x ? 1 : -1;
                    if (f.a !== Act.Grabbed) { this._setAct(Act.Grabbed); f.wiggles = 0; f.drain = 0; f.knockV = 0; }
                    this._grabs++;
                    if (this.firstGrabAt < 0) this.firstGrabAt = this._time;
                    this._cues.emit(SoundCue.Miss);
                }
                break;
            case FoeState.Hold:
                e.x = f32(f.x + f32(e.side * 11)); e.dir = -e.side;
                break;
            case FoeState.Stunned:
                e.t = f32(e.t - dt);
                e.x = f32(e.x + f32(e.vx * dt)); e.vx = toward0(e.vx, f32(500 * dt));
                if (e.t <= 0) e.s = FoeState.Walk;
                break;
        }
    }

    // grabbers and throwers queue up rather than stand inside one another
    _crowded(e, ad) {
        const F = this.f;
        const side = e.x >= F.x ? 1 : -1;
        for (const o of this.foes) {
            if (o === e || !o.live || o.kind === FoeKind.Dwarf) continue;
            if ((o.x >= F.x ? 1 : -1) !== side) continue;
            const od = Math.abs(f32(o.x - F.x));
            if (od < ad && f32(ad - od) < 14) return true;
        }
        return false;
    }

    _updateThrower(e, dt, toward, ad) {
        e.dir = toward;
        switch (e.s) {
            case FoeState.Walk:
                if (ad > e.standoff && !this._crowded(e, ad)) e.x = f32(e.x + f32(f32(toward * e.speed) * dt));
                else { e.s = FoeState.Aim; e.t = this._range(0.4, 0.9); }
                break;
            case FoeState.Aim:
                if (ad > f32(e.standoff + 48)) { e.s = FoeState.Walk; break; }
                if (ad < C.ThrowerClose) { e.t = Math.max(e.t, f32(0.3)); break; }         // too close to throw: he stands his ground
                e.t = f32(e.t - dt);
                if (e.t <= 0) { e.s = FoeState.Windup; e.t = C.ThrowWindup; e.knifeHigh = this._rng.nextDouble() < 0.5; }
                break;
            case FoeState.Windup:
                if (ad < C.ThrowerClose) { e.s = FoeState.Aim; e.t = f32(0.3); break; }     // you closed in: the throw is off
                e.t = f32(e.t - dt);
                if (e.t <= 0) {
                    this.knives.push(new Knife(this._nextId++, f32(e.x + f32(e.dir * 10)), e.dir, e.knifeHigh, this.knifeSpeed));
                    this._throws++;
                    e.s = FoeState.Aim; e.t = f32(this.throwGap * this._range(0.75, 1.25));
                }
                break;
        }
    }

    _updateDwarf(e, dt, toward, ad) {
        const f = this.f;
        switch (e.s) {
            case FoeState.Walk:
                e.x = f32(e.x + f32(f32(e.dir * e.speed) * dt));
                if (f32(f32(e.x - f.x) * e.dir) > 56) e.dir = -e.dir;                   // rolled past: turn and come again
                if (ad <= C.DwarfContact && f.h < 12 && f.a !== Act.Down && f.invuln <= 0) {
                    this._damage(1, Hurt.Dwarf, e.dir, true);
                    e.s = FoeState.Hop; e.vx = f32(-e.dir * 90); e.vh = 150;
                }
                break;
            case FoeState.Hop:
                e.x = f32(e.x + f32(e.vx * dt)); e.h = f32(e.h + f32(e.vh * dt)); e.vh = f32(e.vh - f32(C.Gravity * dt));
                if (e.h <= 0 && e.vh < 0) { e.h = 0; e.vh = 0; e.s = FoeState.Walk; e.dir = toward; }
                break;
        }
    }

    _updateKnives(dt) {
        const f = this.f;
        for (let i = this.knives.length - 1; i >= 0; i--) {
            const k = this.knives[i];
            k.x = f32(k.x + f32(f32(k.dir * k.speed) * dt));
            const ad = Math.abs(f32(f.x - k.x));
            if (!k.passed && ad <= C.KnifeContact && f.a !== Act.Down) {
                const hit = k.high ? !f.ducking : f.h < 10;
                if (hit && f.invuln <= 0) { this._damage(2, Hurt.Knife, k.dir, true); this.knives.splice(i, 1); continue; }
                if (!hit && k.high && ad <= 3 && this.firstDuckUnderAt < 0) this.firstDuckUnderAt = this._time;
            }
            if (!k.passed && f32(f32(k.x - f.x) * k.dir) > C.KnifeContact) { k.passed = true; this._knifeDodges++; }
            if (ad > 380) this.knives.splice(i, 1);
        }
    }

    // ------------------------------------------------------------------ the boss
    _updateBoss(dt) {
        const b = this.b, f = this.f;
        if (!b.active) {
            if (f32(f.x - b.x) < 240) { b.active = true; b.s = BossState.Approach; this.reachedBossAt = this._time; this._log += 'R' + fmt(this._time, 1, F32) + ' '; }
            else return;
        }
        b.clock = f32(b.clock + dt);
        if (b.knockV !== 0) { b.x = f32(b.x + f32(b.knockV * dt)); b.knockV = toward0(b.knockV, f32(400 * dt)); }
        const dx = f32(f.x - b.x), ad = Math.abs(dx);
        const toward = dx >= 0 ? 1 : -1;
        if (b.s === BossState.Down) { b.t = f32(b.t + dt); return; }
        if (b.s !== BossState.Swing && b.s !== BossState.Telegraph) b.dir = toward;
        switch (b.s) {
            case BossState.Approach:
                if (ad > C.BossPrefer) b.x = f32(b.x + f32(f32(toward * C.BossWalk) * dt));
                else { b.s = BossState.Idle; b.t = this._range(0.3, 0.8); }
                break;
            case BossState.Idle:
                b.t = f32(b.t - dt);
                if (ad > C.BossPrefer + 16) b.s = BossState.Approach;
                else if (ad < 30 && b.x > C.BossMinX + 2) b.s = BossState.Retreat;
                else if (b.t <= 0) this._startTelegraph();
                break;
            case BossState.Retreat:
                b.x = f32(b.x - f32(f32(toward * C.BossRetreat) * dt));
                if (ad >= C.BossPrefer - 2 || b.x <= C.BossMinX) { b.s = BossState.Idle; b.t = this._range(0.15, 0.4); }
                break;
            case BossState.Telegraph:
                b.t = f32(b.t - dt);
                if (ad > 22) b.x = f32(b.x + f32(f32(b.dir * f32(C.TelegraphStep / Math.max(f32(0.1), b.dur))) * dt));
                if (b.t <= 0) this._swing();
                break;
            case BossState.Swing:
                b.t = f32(b.t - dt);
                if (b.t <= 0) { b.s = BossState.Recover; b.t = C.BossRecoverSeconds; }
                break;
            case BossState.Recover:
                b.t = f32(b.t - dt);
                if (b.t <= 0) { b.s = BossState.Idle; b.t = this._range(0.2, 0.5); }
                break;
            case BossState.Hurt:
                b.t = f32(b.t - dt);
                if (b.t <= 0) { b.s = BossState.Idle; b.t = this._range(0.4, 0.8); }
                break;
        }
        if (b.x < C.BossMinX - 24) b.x = C.BossMinX - 24;
    }

    _startTelegraph() {
        const B = this.b;
        B.s = BossState.Telegraph; B.t = B.dur = f32(this.bossTelegraph * this._range(0.8, 1.3)); B.whiff = false;   // his rhythm varies
        if (this.firstTelegraphAt < 0) this.firstTelegraphAt = this._time;
    }

    _swing() {
        const b = this.b, f = this.f;
        b.s = BossState.Swing; b.t = C.BossSwingSeconds;
        const ad = Math.abs(f32(f.x - b.x));
        b.whiff = true;
        if (ad <= C.BossReach && f.a !== Act.Down && this.bossLands && f.invuln <= 0) {
            b.whiff = false;
            const away = f.x >= b.x ? 1 : -1;
            if (f.a === Act.Grabbed) this._setAct(Act.Idle);
            this._damage(this.bossDamage, Hurt.Boss, away, true);
            f.knockV = f32(away * 170);
            this.effects.push(new Fx(0, f32(f.x - f32(away * 6)), 24));
        }
    }

    // ------------------------------------------------------------------ interludes
    _startKO() {
        const F = this.f;
        this.p = Phase.KO; this.phaseTime = 0;
        this._setAct(Act.Down); F.knockV = 0; F.h = 0; F.vh = 0;
        this._kos++;
        if (this.firstKOAt < 0) this.firstKOAt = this._time;
        this._log += 'K' + fmt(this._time, 1, F32) + '(' + HurtNames[this.lastHurt] + ') ';
        for (const e of this.foes) if (e.s === FoeState.Hold) { e.s = FoeState.Stunned; e.t = 5; e.vx = f32(e.side * 80); }
        this.knives.length = 0;
        this._cues.emit(SoundCue.Die);
    }

    _startTimeUp() {
        const F = this.f;
        this.p = Phase.TimeUp; this.phaseTime = 0;
        this._setAct(Act.Down); F.knockV = 0; F.h = 0; F.vh = 0;
        this.lastHurt = Hurt.Time;
        this._timeups++;
        this._log += 'T' + fmt(this._time, 1, F32) + ' ';
        for (const e of this.foes) if (e.s === FoeState.Hold) { e.s = FoeState.Stunned; e.t = 5; e.vx = f32(e.side * 80); }
        this.knives.length = 0;
        this._cues.emit(SoundCue.Die);
    }

    _downStep(dt) {
        this._updateFoes(dt, false);
        this._updateFx(dt);
        this.cam.follow(dt, this.f.x, this.f.dir);
        const hold = this.p === Phase.KO ? this.koSeconds : this.timeUpSeconds;
        if (this.phaseTime < hold) return;
        this.livesLeft--;
        if (this.livesLeft <= 0) {
            this.livesLeft = 0;
            this._result = RoundResult.Lost;
            this.p = Phase.Card; this.phaseTime = 0;
            return;
        }
        // a new life where you fell: full energy, a fresh timer, the floor swept
        this.foes.length = 0; this.knives.length = 0;
        const f = this.f;
        f.energy = C.MaxEnergy; f.a = Act.Idle; f.at = 0; f.h = 0; f.vh = 0; f.knockV = 0; f.invuln = 1; f.grabImmune = 1;
        this.timer = this.floorTime;
        this._spawnT = f32(1.5);
        const B = this.b;
        if (B.active && B.alive) {
            if (f.x < f32(B.x + 110)) f.x = Math.min(f32(this.floorLength - 24), f32(B.x + 110));
            B.s = BossState.Idle; B.t = f32(1.2); B.knockV = 0;
        }
        this._goIntro(this.respawnSeconds);
    }

    _startClimb() {
        const F = this.f;
        this.p = Phase.Climb; this.phaseTime = 0;
        this._setAct(Act.Climb); F.dir = -1; F.knockV = 0;
        this.bonus = Math.ceil(this.timer) * C.BonusPerSecond;
        this.bonusPaid = 0;
        this.stairsAt = this._time;
        this._log += 'S' + fmt(this._time, 1, F32) + ' ';
        this._cues.emit(SoundCue.Bonus);
    }

    _climbStep(dt) {
        const f = this.f;
        f.at = f32(f.at + dt);
        f.walkClock = f32(f.walkClock + dt);
        if (f.x > 30) { f.x = f32(f.x - f32(28 * dt)); f.h = f32(f.h + f32(26 * dt)); }   // up the stairs, up and to the left
        this._updateFoes(dt, false);
        this._updateFx(dt);
        this.cam.follow(dt, f.x, f.dir);
        const payWindow = f32(this.climbSeconds * f32(0.7));
        const due = this.phaseTime >= payWindow ? this.bonus : idiv(Math.trunc(f32(this.bonus * f32(this.phaseTime / payWindow))), 100) * 100;
        if (due > this.bonusPaid) { this._score += due - this.bonusPaid; this.bonusPaid = due; }
        if (this.phaseTime >= this.climbSeconds) {
            if (this.bonusPaid < this.bonus) { this._score += this.bonus - this.bonusPaid; this.bonusPaid = this.bonus; }
            this._result = RoundResult.Won;
            this.p = Phase.Card; this.phaseTime = 0;
            this._cues.emit(SoundCue.Win);
        }
    }

    _updateFx(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const x = this.effects[i];
            x.t = f32(x.t + dt);
            if (x.kind === 1) x.h = f32(x.h + f32(22 * dt));
            const life = x.kind === 1 ? f32(0.9) : f32(0.18);
            if (x.t >= life) this.effects.splice(i, 1);
        }
    }

    // ------------------------------------------------------------------ helpers
    // C# float Range(float a, float b) { return a + (b - a) * (float)rng.NextDouble(); }
    _range(a, b) { a = f32(a); b = f32(b); return f32(a + f32(f32(b - a) * f32(this._rng.nextDouble()))); }

    collectStats(into) {
        add(into, 'kills', this._kG + this._kT + this._kD);
        add(into, 'grabs', this._grabs);
        add(into, 'shakes', this._shakes);
        add(into, 'knifeHit', this._knifeHits);
        add(into, 'knifeDodge', this._knifeDodges);
        add(into, 'dwarfHit', this._dwarfHits);
        add(into, 'bossHitYou', this._bossHitsTaken);
        add(into, 'bossBlows', this._bossBlows);
        add(into, 'parries', this._parries);
        add(into, 'ko', this._kos);
        add(into, 'timeup', this._timeups);
        add(into, 'reachBoss', this.reachedBossAt >= 0 ? 1 : 0);
        add(into, 'bossDown', this.bossDownAt >= 0 ? 1 : 0);
        add(into, 'dmgGrab', this._dmgGrab);
        add(into, 'dmgKnife', this._dmgKnife);
        add(into, 'dmgDwarf', this._dmgDwarf);
        add(into, 'dmgBoss', this._dmgBoss);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

IronDojoSim.Phase = Phase;
IronDojoSim.C = C;                          // the machine constants (C# public const), for the renderer and the bot
