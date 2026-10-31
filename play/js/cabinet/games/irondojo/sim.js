// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE ROUND (ICabinetSim).
// Built out (2026-10-18) from the one-floor port of IronDojoSim.cs (Staging/Batch3/irondojo) into the whole pagoda:
// five floors, five masters (floors.js). Parity with the C# is retired; the float style (f32) stays.
//
// A coin climbs the pagoda, Kung-Fu Master style. Each floor opens on its CARD (number, name, a hint, the pagoda map);
// the fighter enters at the door and fights his way along a scrolling hall to the master who guards the stairs. Odd
// floors run LEFT, even floors RIGHT: the sim always runs leftward and `mirror` flips the stick (and the picture).
//   GRABBER  walks up and hugs you; while he holds you your energy drains; wiggle the stick to shake him off. 200.
//   THROWER  stops at range and throws knives, HIGH (duck) or LOW (jump); his arm shows which first. 300.
//   DWARF    tumbles along the boards, under a standing blow: duck and strike, or jump him. 100.
//   SNAKE    (out of a pot) slithers at your feet like a dwarf. 200.
//   LIZARD   (out of a pot) a fire-lizard flying at head height: duck under it or strike it standing. 300.
//   GHOST    (the mirror room) shimmers out of the glass, untouchable, then turns solid and throws a high strike:
//            duck it, and hit him while he is solid. 400.
//   POTS     (lantern hall, golden hall) hang from the rafters a beat, then drop: step out from under the shadow, or
//            strike one out of the air (500). A broken pot lets out a snake, a lizard, or a bowl of tea (+3 energy).
//   WIND     (the roof) a gust pushes you back toward the door for two seconds; ducking holds your ground.
//   BLADES   (the roof) a glint at the edge ahead, then a spinning blade, high or low.
//   MASTERS  one a floor, by the stairs (floors.js: stick, ring, giant, twin blades, the iron master). Each parries
//            what he sees coming and is open only while he winds up, strikes and recovers (the giant shrugs blows off
//            instead; the ring dancer is open while his ring is out; the iron master counters a second parried blow,
//            and at half strength throws a palm of fire).
// A = punch (short, fast), B = kick (long, slower); stick down ducks (and makes the blows low), stick up jumps (A or B in
// the air = a jump kick). Energy is 10 blocks (+1 a lost coin), refilled each floor; 3 lives, a life being a full refill
// where you fell, and an EXTRA LIFE at 30000 and every 70000 after. Each floor has its own timer; TIME UP costs a life.
// A CHAIN of knockdowns, each inside two seconds of the last, multiplies their points: x2 at 3, x3 at 6, x4 at 9; a
// hit on you breaks it. Clearing a floor (its master down AND the stairs reached) pays TIME + ENERGY + FLOOR bonuses on
// the climb. ROUND WON = the fifth master down and his stairs climbed (the result comes from the game, never the clock).
// Lost = the last life gone.
//
// MERCY: the knobs slow every attacker 8 % per lost round, lengthen every master's wind-up, thin the arrivals and add a
// block of energy. On the unlosable credit (credit.unlosable) the sim's own rule holds: no master's blow can land
// (bossLands = 0 on that credit), energy never falls below one block, and the timers stop at zero instead of TIME UP.
//
// EVENTS (for the sound: recordEvents / events / _emit, Starvector's pattern): card go jump swing hit smash parry
// bossHit hurt squeeze grab free throw potHang potDrop shatter ghost ghostStrike gustTell gust glint blade pickup
// combo extend warn bossWake bossTell bossSwing bossThrow catch slam chi bossPhase bossDown floorClear tally down
// timeUp win.
import { f32, fmt, F32, idiv, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4 } from '../../sdk/index.js';
import { IronDojoScroll } from './scroll.js';
import { FLOORS, BOSSES, BossKind, FloorCount } from './floors.js';

export { BossKind };
export const Act = Object.freeze({ Idle: 0, Walk: 1, Punch: 2, Kick: 3, Duck: 4, DuckPunch: 5, DuckKick: 6, Jump: 7, JumpKick: 8, Flinch: 9, Grabbed: 10, Down: 11, Climb: 12 });
export const FoeKind = Object.freeze({ Grabber: 0, Thrower: 1, Dwarf: 2, Snake: 3, Lizard: 4, Ghost: 5 });
export const FoeState = Object.freeze({ Walk: 0, Hold: 1, Stunned: 2, Aim: 3, Windup: 4, Hop: 5, Dying: 6, Shimmer: 7, Strike: 8, Fade: 9 });
export const BossState = Object.freeze({ Wait: 0, Approach: 1, Idle: 2, Retreat: 3, Telegraph: 4, Swing: 5, Recover: 6, Hurt: 7, Down: 8, Unarmed: 9 });
export const Atk = Object.freeze({ Melee: 0, Throw: 1, Slam: 2, Double: 3, Chi: 4, Counter: 5 });
export const ShotKind = Object.freeze({ Knife: 0, Ring: 1, Blade: 2, Wave: 3, Chi: 4 });
export const Hurt = Object.freeze({ None: 0, Grab: 1, Knife: 2, Dwarf: 3, Boss: 4, Time: 5, Snake: 6, Lizard: 7, Ghost: 8, Pot: 9, Blade: 10 });
const HurtNames = ['none', 'grab', 'knife', 'dwarf', 'boss', 'time', 'snake', 'lizard', 'ghost', 'pot', 'blade'];
const FoeNames = ['grabber', 'thrower', 'dwarf', 'snake', 'lizard', 'ghost'];
const AtkNames = ['melee', 'throw', 'slam', 'double', 'chi', 'counter'];

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
        this.energy = 0; this.maxEnergy = 10;
        this.wiggles = 0;
        this.drain = 0;
        this.walkClock = 0;
        this.hurtT = 0;                     // the red flash after a hit (renderer)
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
        this.passes = 0;                    // lizard: how many times he has flown past
        this.life = 0;                      // ghost: seconds he stays solid before he fades back into the glass
        this.flash = 0;                     // the white hit flash (renderer)
    }
    get live() { return this.s !== FoeState.Dying; }
    // a ghost shimmering in or fading out, and a lizard flying off, cannot be struck (nor strike)
    get solid() { return this.s !== FoeState.Dying && this.s !== FoeState.Shimmer && this.s !== FoeState.Fade; }
}

// a knife, a ring, a blade, a slam's shockwave or a palm of fire: everything that flies along the boards, HIGH (duck)
// or LOW (jump)
export class Shot {
    constructor(id, kind, x, dir, high, speed) {
        this.id = id; this.kind = kind; this.x = x; this.dir = dir; this.high = high; this.speed = speed;
        this.passed = false;
        this.t = 0;
        this.travel = 0; this.range = 0; this.back = false;          // the ring: out `range` px, then home to his hand
    }
    get contact() { return ShotContact[this.kind]; }
}
const ShotContact = [7, 8, 7, 9, 9];
const ShotDamage = [1, 2, 1, 2, 3];               // a knife or a blade nicks (1); the ring, a wave, the fire hurt more
const ShotHurt = [Hurt.Knife, Hurt.Boss, Hurt.Blade, Hurt.Boss, Hurt.Boss];

export class Pot {
    constructor(id, x, content) {
        this.id = id; this.x = x; this.content = content;        // 0 tea, 1 snake, 2 lizard
        this.s = 0;                         // 0 hanging (the tell: it sways, its shadow shows), 1 falling
        this.t = 0; this.h = C_PotHangH; this.vh = 0;
        this.eta = 0;                       // seconds until it hits the boards (the bot reads it, as a player reads the shadow)
    }
}

export class Pickup {
    constructor(id, x) { this.id = id; this.x = x; this.t = 0; }
}

export class Boss {
    constructor(spec) {
        this.spec = spec; this.kind = spec.kind;
        this.x = 0;
        this.dir = 1;
        this.s = BossState.Wait;
        this.t = 0; this.dur = 0; this.clock = 0; this.knockV = 0;
        this.hp = spec.hp; this.maxHP = spec.hp;
        this.active = false;
        this.whiff = false;                 // the last swing could not land (mercy) or missed
        this.atk = Atk.Melee;               // what the wind-up in progress becomes
        this.high = false;                  // a thrown ring / blade / palm of fire: high or low
        this.swings = 0;                    // twin blades: slashes thrown in this double
        this.armed = true;                  // the ring dancer: his ring is in his hand
        this.phase = 1;                     // the iron master: 2 once he is down to half
        this.parries = 0; this.parryT = 0;  // the iron master: parried blows in a row (two = a counter)
        this.hits = 0;                      // blows landed (the giant staggers on every third)
        this.flash = 0;
    }
    get alive() { return this.s !== BossState.Down; }
    get open() {
        if (this.s === BossState.Down || this.s === BossState.Hurt || this.s === BossState.Wait) return false;
        if (this.kind === BossKind.Giant) return true;                              // he takes your blows: he shrugs them off
        if (this.kind === BossKind.Ring && !this.armed) return true;                // empty-handed while his ring is out
        return this.s === BossState.Telegraph || this.s === BossState.Swing || this.s === BossState.Recover || this.s === BossState.Unarmed;
    }
}

// kind: 0 hit spark, 1 score popup, 2 parry clack, 3 debris (vx, vh, colour), 4 text popup, 5 dust, 6 the big burst
export class Fx {
    constructor(kind, x, h, value = 0) {
        this.kind = kind;
        this.x = x; this.h = h; this.t = 0;
        this.value = value;
        this.vx = 0; this.vh = 0; this.c = 0; this.text = '';
    }
}
const FxLife = [f32(0.18), f32(0.9), f32(0.18), f32(0.75), f32(1.2), f32(0.32), f32(0.7)];

const Phase = Object.freeze({ Idle: 0, Stage: 1, Intro: 2, Play: 3, KO: 4, TimeUp: 5, Climb: 6, Card: 7, Over: 8 });

// ------------------------------------------------------------------ the machine (not mercy knobs)
const C_PotHangH = 124;
const C = Object.freeze({
    StartLives: 3, MaxLives: 5,
    StairsFootX: 92, BossHomeX: 212, BossMinX: 150, BossZoneX: 470, BossWakeDx: 240,
    WalkSpeed: 64, JumpV: 280, Gravity: 760,
    PunchStart: f32(0.05), PunchActive: f32(0.08), PunchRecover: f32(0.11),
    KickStart: f32(0.12), KickActive: f32(0.10), KickRecover: f32(0.18),
    DuckKickStart: f32(0.14),
    PunchReach: 28, KickReach: 42, LowPunchReach: 26, LowKickReach: 38, JumpKickReach: 36,
    FlinchSeconds: f32(0.3), HurtInvuln: f32(0.6),
    GrabRange: 14, DwarfContact: 10, SnakeContact: 9, LizardContact: 9, ThrowerClose: 64,
    ThrowWindup: f32(0.42),
    GhostReach: 24, GhostShimmer: f32(0.9), GhostWindup: f32(0.42), GhostLife: f32(4.5), GhostSpeed: 44,
    SnakeSpeed: 46, LizardSpeed: 66,
    PotHangH: C_PotHangH, PotHang: f32(0.85), PotGravity: 700, PotRadius: 12, PotFall: f32(Math.sqrt(2 * C_PotHangH / 700)),
    TeaRadius: 10, TeaLife: f32(7), TeaEnergy: 3,
    WindTell: f32(1.0), WindBlow: f32(2.3), WindPush: 34, WindDuckPush: 6, WindAirPush: 44,
    GlintTell: f32(0.7), BladeSpeed: 150,
    TelegraphStep: 10,
    ChainWindow: f32(2.0),
    ScoreFoe: [200, 300, 100, 200, 300, 400], ScorePot: 500, ScoreTea: 500, ScoreBossBlow: 100,
    BonusPerSecond: 100, BonusPerEnergy: 200, BonusPerFloor: 1000,
});
// constant sums, folded once
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

// a triangle wave 0..1..0 with period 1 (the lizard's bob: exact, no sine)
function tri(x) { const p = x - Math.floor(x); return p < 0.5 ? p * 2 : 2 - p * 2; }

export class IronDojoSim {
    constructor() {
        this.stageSeconds = f32(3.2); this.introSeconds = f32(1.6); this.koSeconds = f32(2.4);
        this.timeUpSeconds = f32(2.2); this.climbSeconds = f32(4.4); this.cardSeconds = f32(4);

        // read-only state
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.phaseHold = 0;                 // how long the current Stage card / GET READY lasts
        this.floorN = 1;                    // 1..5
        this.fl = FLOORS[0];
        this.mirror = false;                // this floor runs RIGHT: the stick and the picture are flipped
        this.f = new Fighter();
        this.b = new Boss(BOSSES[0]);
        this.foes = [];
        this.shots = [];
        this.pots = [];
        this.pickups = [];
        this.effects = [];
        this.cam = new IronDojoScroll();
        this.wind = { s: 0, t: 0 };         // 0 calm, 1 the tell (leaves stream), 2 blowing
        this.glint = null;                  // { t, high }: a blade is coming in from the edge ahead
        this.timer = 0;                     // floor timer, seconds left this life
        this.livesLeft = 0;
        this.credit = null;
        this.floorLength = 0;
        this.floorTime = 0;
        this.floorsCleared = 0;
        this.tally = [];                    // the climb: [{ label, value, paid }]
        this.bonus = 0;
        this.chain = 0; this.chainT = 0; this.mult = 1; this.bestMult = 1;
        this.shake = 0;                     // seconds of screen shake left (renderer)
        this.extendFlash = 0;               // EXTRA LIFE on the HUD
        this.bossBanner = 0;                // the master's name across the hall when he wakes
        this.lastHurt = Hurt.None;
        this.isDemo = false;                // the attract demo (AttractMode sets it): it may start on a later floor
        this.recordEvents = false; this.events = [];

        // knobs (after mercy)
        this.approach = 0; this.bossTell = 1; this.bossLands = false; this.spawnScale = 1;
        this.knifeSpeed = 0; this.throwGap = 0; this.grabDrain = 0; this.shakeWiggles = 0;
        this.maxEnergy = 10; this.extendFirst = 0; this.extendEvery = 0;

        // moments (first time each thing happened; -1 = never) for the frame picker and the log
        this.firstKickAt = -1; this.firstGrabAt = -1; this.firstDuckUnderAt = -1; this.firstTelegraphAt = -1;
        this.firstKOAt = -1; this.bossDownAt = -1; this.stairsAt = -1; this.reachedBossAt = -1;

        this._cues = new CueBuffer();
        this._log = '';
        this._rng = new SystemRandom(1);
        this._fx = new SystemRandom(2);     // the debris has its own dice, so the look never moves the game
        this._result = RoundResult.None;
        this._score = 0; this._nextId = 0;
        this._time = 0; this._spawnT = 0; this._potT = 0; this._bladeT = 0;
        this._nextExtend = 0; this._tallyTick = 0; this._warned = 0;
        this._zeroStats();
    }

    _zeroStats() {
        this._kills = [0, 0, 0, 0, 0, 0];
        this._grabs = this._shakes = this._knifeHits = this._knifeDodges = this._dwarfHits = 0;
        this._bossHitsTaken = this._bossBlows = this._parries = this._kos = this._timeups = this._throws = 0;
        this._dmgGrab = this._dmgShot = this._dmgCrawl = this._dmgBoss = this._dmgOther = 0;
        this._pots = this._potHits = this._potSmash = this._teas = this._extends = this._bossDowns = 0;
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    get mercyActive() { return this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get lastFloor() { return this.floorN >= FloorCount; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Stage: case Phase.Intro: return CabinetState.Intro;
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
        const K = this._kills;
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this.livesLeft +
            ' floor ' + this.floorN + ' cleared ' + this.floorsCleared +
            ' kills g' + K[0] + ' t' + K[1] + ' d' + K[2] + ' s' + K[3] + ' l' + K[4] + ' h' + K[5] +
            ' masters ' + this._bossDowns + ' chain x' + this.bestMult + ' extends ' + this._extends +
            ' dmg grab' + this._dmgGrab + ' shot' + this._dmgShot + ' crawl' + this._dmgCrawl + ' boss' + this._dmgBoss + ' other' + this._dmgOther +
            ' | ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this._fx = new SystemRandom((seed ^ 0x5EED) === 0 ? 3 : seed ^ 0x5EED);
        this.approach = k.get('approach');
        this.bossTell = k.get('bossTell');
        this.bossLands = k.get('bossLands') > 0.5 && !credit.unlosable;
        this.spawnScale = k.get('spawnGap');
        this.maxEnergy = roundEven(k.get('energy'));
        this.knifeSpeed = k.get('knifeSpeed');
        this.throwGap = k.get('throwGap');
        this.grabDrain = k.get('grabDrain');
        this.shakeWiggles = roundEven(k.get('shakeWiggles'));
        this.extendFirst = roundEven(k.get('extendFirst'));
        this.extendEvery = roundEven(k.get('extendEvery'));
        let start = Math.max(1, Math.min(FloorCount, roundEven(k.get('startFloor'))));
        if (this.isDemo) start = 1 + ((seed >>> 4) % FloorCount);                   // the demo shows any floor

        this.livesLeft = roundEven(k.get('lives'));
        this._score = 0; this._time = 0; this._nextId = 1;
        this._nextExtend = this.extendFirst;
        this.floorsCleared = start - 1;
        this.bestMult = 1;
        this._result = RoundResult.None;
        this._zeroStats();
        this.firstKickAt = this.firstGrabAt = this.firstDuckUnderAt = this.firstTelegraphAt = this.firstKOAt = this.bossDownAt = this.stairsAt = this.reachedBossAt = -1;
        this._log = '';
        this.events.length = 0;
        this._cues.resetTotals();
        this._startFloor(start);
    }

    // a floor: its card first, the fighter at the door with a full bar, the master waiting by the stairs
    _startFloor(n) {
        const fl = this.fl = FLOORS[n - 1];
        this.floorN = n;
        this.mirror = (n & 1) === 0;
        this.floorLength = fl.length;
        this.floorTime = fl.time;
        this.foes.length = 0; this.shots.length = 0; this.pots.length = 0; this.pickups.length = 0; this.effects.length = 0;
        const f = new Fighter();
        f.x = f32(this.floorLength - 84); f.dir = -1; f.maxEnergy = this.maxEnergy; f.energy = this.maxEnergy; f.a = Act.Idle;
        this.f = f;
        const b = new Boss(BOSSES[fl.boss]);
        b.x = C.BossHomeX; b.dir = 1; b.s = BossState.Wait;
        this.b = b;
        this.cam.reset(this.floorLength, f.x, f.dir);
        this.timer = this.floorTime;
        this._spawnT = f32(1.6);
        this._potT = fl.pots > 0 ? f32(fl.pots * f32(0.6)) : 0;
        this._bladeT = fl.blades > 0 ? f32(fl.blades * f32(0.6)) : 0;
        this.wind.s = 0; this.wind.t = f32(4);
        this.glint = null;
        this.chain = 0; this.chainT = 0; this.mult = 1;
        this.tally = []; this.bonus = 0;
        this.shake = 0; this.bossBanner = 0; this.lastHurt = Hurt.None; this._warned = 0;
        this._log += 'F' + n + '@' + fmt(this._time, 1, F32) + ' ';
        this.p = Phase.Stage; this.phaseTime = 0; this.phaseHold = n === 1 || this.isDemo ? this.stageSeconds : f32(this.stageSeconds - f32(0.4));
        this._cues.emit(SoundCue.Tick);
        this._emit('card', { floor: n });
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
        this.shake = Math.max(0, f32(this.shake - dt));
        this.extendFlash = Math.max(0, f32(this.extendFlash - dt));
        this.bossBanner = Math.max(0, f32(this.bossBanner - dt));
        this.f.hurtT = Math.max(0, f32(this.f.hurtT - dt));
        switch (this.p) {
            case Phase.Stage:
            case Phase.Intro:
                this._updateFx(dt);
                this.cam.follow(dt, this.f.x, this.f.dir);
                if (this.phaseTime >= this.phaseHold) {
                    this.p = Phase.Play; this.phaseTime = 0;
                    this._cues.emit(SoundCue.Start);
                    this._emit('go', { floor: this.floorN });
                }
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
            if (this.timer > 0 && this.timer <= 10 && Math.ceil(before) !== Math.ceil(this.timer)) {
                this._cues.emit(SoundCue.Tick);
                this._emit('warn', { secs: Math.ceil(this.timer) });
            }
            if (this.timer <= 0) {
                this.timer = 0;
                if (!this.credit.unlosable) { this._startTimeUp(); return; }
            }
        }
        if (this.chainT > 0) {
            this.chainT = Math.max(0, f32(this.chainT - dt));
            if (this.chainT <= 0) { this.chain = 0; this.mult = 1; }
        }
        this._updateFighter(dt, input);
        this._resolveBlow();
        this._updateSpawner(dt);
        this._updateHazards(dt);
        this._updateFoes(dt, true);
        this._updateShots(dt);
        this._updatePots(dt);
        this._updatePickups(dt);
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
                    this._emit('swing', { move: 'jumpkick', low: false });
                }
                if (landed || !f.airborne) { this._setAct(Act.Idle); this.effects.push(new Fx(5, f.x, 0)); }
                break;
            case Act.Down:
            case Act.Climb:
                break;
            default:
                this._control(dt, input);
                break;
        }
        // the roof's wind leans on you, back toward the door; ducking holds your ground
        if (this.wind.s === 2 && f.a !== Act.Grabbed && f.a !== Act.Down) {
            const push = f.ducking ? C.WindDuckPush : f.airborne ? C.WindAirPush : C.WindPush;
            f.x = f32(f.x + f32(push * dt));
        }
        this._clampFighter();
    }

    _control(dt, input) {
        const f = this.f;
        if (input == null) { if (f.a !== Act.Idle) this._setAct(Act.Idle); return; }
        let sx = input.held(Pad.Left) ? -1 : input.held(Pad.Right) ? 1 : 0;
        if (this.mirror) sx = -sx;                                                   // this floor runs right
        const down = input.held(Pad.Down);
        const pa = input.pressed(Pad.A), pb = input.pressed(Pad.B);
        if (pa || pb) {
            if (sx !== 0) f.dir = sx;
            const a = pa ? (down ? Act.DuckPunch : Act.Punch) : (down ? Act.DuckKick : Act.Kick);
            this._setAct(a);
            f.spent = false; f.landed = false;
            if (a === Act.Kick || a === Act.DuckKick) this._markKick();
            this._emit('swing', { move: pa ? 'punch' : 'kick', low: down });
            return;
        }
        if (input.held(Pad.Up) && !down) {
            if (sx !== 0) f.dir = sx;
            this._setAct(Act.Jump);
            f.vh = C.JumpV; f.h = f32(0.01);
            f.driftX = f32(f32(sx * C.WalkSpeed) * f32(0.9));
            this._emit('jump');
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
        if (this.b.alive) min = Math.max(min, f32(this.b.x + this.b.spec.body));    // the master bars the way
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
        this._emit('free');
    }

    // the damage a fighter takes; the unlosable credit never drops below one unit. Any hit but a hold's squeeze breaks
    // the chain.
    _damage(n, cause, fromDir, flinch) {
        const f = this.f;
        f.energy = this.credit.unlosable ? Math.max(1, f.energy - n) : f.energy - n;
        this.lastHurt = cause;
        switch (cause) {
            case Hurt.Grab: this._dmgGrab += n; break;
            case Hurt.Knife: case Hurt.Blade: this._dmgShot += n; this._knifeHits++; break;
            case Hurt.Dwarf: case Hurt.Snake: this._dmgCrawl += n; this._dwarfHits++; break;
            case Hurt.Boss: this._dmgBoss += n; this._bossHitsTaken++; break;
            case Hurt.Pot: this._dmgOther += n; this._potHits++; break;
            default: this._dmgOther += n; break;
        }
        if (cause === Hurt.Grab) { this._emit('squeeze'); return; }
        this._breakChain();
        this._cues.emit(SoundCue.Miss);
        this._emit('hurt', { cause: HurtNames[cause], n });
        f.hurtT = f32(0.12);
        if (!flinch) return;
        f.invuln = C.HurtInvuln;
        if (f.a === Act.Grabbed) return;                                          // still held: no stagger
        this._setAct(Act.Flinch);
        f.knockV = f32(fromDir * 110);
        f.driftX = 0;
    }

    _breakChain() { this.chain = 0; this.chainT = 0; this.mult = 1; }

    // a knockdown inside the window of the last one adds to the chain; every third raises the multiplier (x4 at most)
    _chainUp(x, h) {
        this.chain++;
        this.chainT = C.ChainWindow;
        const m = Math.min(4, 1 + idiv(this.chain, 3));
        if (m > this.mult) {
            this.mult = m;
            if (m > this.bestMult) this.bestMult = m;
            const t = new Fx(4, x, f32(h + 14)); t.text = 'CHAIN X' + m; t.c = 10;
            this.effects.push(t);
            this._emit('combo', { mult: m });
        }
    }

    _addScore(pts) {
        this._score += pts;
        while (this._score >= this._nextExtend) {
            this._nextExtend += this.extendEvery;
            if (this.livesLeft < C.MaxLives) this.livesLeft++;
            this._extends++;
            this.extendFlash = f32(2.6);
            this._cues.emit(SoundCue.Bonus);
            this._emit('extend', { lives: this.livesLeft });
            this._log += 'E' + fmt(this._time, 1, F32) + ' ';
        }
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
            if (!e.solid) continue;
            if ((e.kind === FoeKind.Dwarf || e.kind === FoeKind.Snake) && !low && e.h < 10) continue;   // under a standing blow
            if (e.kind === FoeKind.Lizard && low) continue;                                             // over a low one
            const dx = f32(f32(e.x - f.x) * f.dir);
            if (dx < -4 || dx > reach) continue;
            if (dx < bd) { bd = dx; best = e; }
        }
        let pot = null;
        if (!low)                                                                   // a falling pot, struck out of the air
            for (const p of this.pots) {
                if (p.s !== 1 || p.h < 12 || p.h > 46) continue;
                const dx = f32(f32(p.x - f.x) * f.dir);
                if (dx < -4 || dx > reach) continue;
                if (dx < bd) { bd = dx; best = null; pot = p; }
            }
        let bdx = F32_MAX;
        const B = this.b;
        if (B.active && B.alive && B.s !== BossState.Hurt) {
            const dx = f32(f32(B.x - f.x) * f.dir);
            const wide = B.kind === BossKind.Giant ? 8 : 4;
            if (dx >= -4 && dx <= reach + wide) bdx = dx;
        }
        if (bdx < bd) {
            f.spent = true;
            if (B.open) { this._hitBoss(); f.landed = true; }
            else this._parry();
            return;
        }
        if (pot != null) { f.spent = true; f.landed = true; this._smashPot(pot); return; }
        if (best == null) return;
        f.spent = true; f.landed = true;
        this._drop(best, true);
        this._cues.emit(SoundCue.Hit);
        this._emit('hit', { foe: FoeNames[best.kind], low });
        this.effects.push(new Fx(0, f32(best.x - f32(f.dir * 4)), low ? 8 : best.kind === FoeKind.Lizard ? f32(best.h + 6) : 22));
    }

    _drop(e, scored) {
        const F = this.f;
        e.s = FoeState.Dying;
        e.t = 0;
        e.flash = f32(0.1);
        e.vx = scored ? f32(F.dir * 70) : f32((e.x >= F.x ? 1 : -1) * 60);
        e.vh = e.kind === FoeKind.Lizard ? 60 : 150;
        if (!scored) return;
        this._kills[e.kind]++;
        this._chainUp(e.x, 30);
        const pts = C.ScoreFoe[e.kind] * this.mult;
        this._addScore(pts);
        this.effects.push(new Fx(1, e.x, 36, pts));
        // debris: a ghost breaks like glass, the rest lose a sandal, a cap, a scale
        const col = e.kind === FoeKind.Ghost ? 14 : e.kind === FoeKind.Snake ? 16 : e.kind === FoeKind.Lizard ? 20 : e.kind === FoeKind.Dwarf ? 8 : e.kind === FoeKind.Thrower ? 3 : 0;
        this._debris(e.x, e.kind === FoeKind.Dwarf || e.kind === FoeKind.Snake ? 6 : 20, e.kind === FoeKind.Ghost ? 8 : 4, col, F.dir);
    }

    _debris(x, h, n, col, dir) {
        for (let i = 0; i < n; i++) {
            if (this.effects.length >= 90) return;
            const d = new Fx(3, x, h);
            d.vx = f32(f32(dir * this._fxRange(10, 70)) + this._fxRange(-30, 30));
            d.vh = this._fxRange(60, 170);
            d.c = col;
            this.effects.push(d);
        }
    }

    _parry() {
        const B = this.b;
        this._parries++;
        this.f.knockV = f32(-this.f.dir * 130);
        this._cues.emit(SoundCue.Tick);
        this._emit('parry', { boss: B.kind });
        this.effects.push(new Fx(2, f32(B.x - f32(this.f.dir * 10)), 22));
        if (B.kind === BossKind.Master && B.s !== BossState.Telegraph && B.s !== BossState.Swing) {
            B.parries++; B.parryT = f32(1.6);
            if (B.parries >= 2) { B.parries = 0; this._tele(Atk.Counter, B.spec.counterTell); }         // the second one, he answers
        }
    }

    _hitBoss() {
        const B = this.b, F = this.f, K = B.spec;
        this._bossBlows++;
        B.hp--; B.hits++;
        B.flash = f32(0.12);
        this._addScore(C.ScoreBossBlow);
        this._cues.emit(SoundCue.Hit);
        this._emit('bossHit', { boss: B.kind, hp: B.hp });
        this.effects.push(new Fx(0, f32(B.x - f32(F.dir * 6)), B.kind === BossKind.Giant ? 34 : 22));
        const away = B.x >= F.x ? 1 : -1;
        if (B.hp <= 0) {
            B.s = BossState.Down; B.t = 0; B.knockV = f32(away * 60);
            this.bossDownAt = this._time;
            this._bossDowns++;
            this._addScore(K.score);
            this.effects.push(new Fx(1, B.x, 48, K.score));
            this.effects.push(new Fx(6, B.x, 24));
            this._debris(B.x, 24, 10, B.kind === BossKind.Master ? 7 : B.kind === BossKind.Ring ? 19 : B.kind === BossKind.Twin ? 13 : B.kind === BossKind.Giant ? 6 : 10, away);
            this.shake = f32(0.5);
            this._cues.emit(SoundCue.Bonus);
            this._emit('bossDown', { boss: B.kind, floor: this.floorN });
            this._log += 'B' + fmt(this._time, 1, F32) + ' ';
            for (const e of this.foes) if (e.live) this._drop(e, false);            // the floor empties
            this.shots.length = 0; this.pots.length = 0; this.glint = null; this.wind.s = 0;
            if (F.a === Act.Grabbed) this._setAct(Act.Idle);
            return;
        }
        if (B.kind === BossKind.Master && B.phase === 1 && B.hp * 2 <= B.maxHP) {
            B.phase = 2;                                                            // half strength: the palm catches fire
            B.s = BossState.Hurt; B.t = f32(0.9); B.knockV = f32(away * 170);
            B.parries = 0;
            this.shake = f32(0.35);
            const t = new Fx(4, B.x, 46); t.text = 'FIRE PALM'; t.c = 20;
            this.effects.push(t);
            this._emit('bossPhase', { boss: B.kind });
            return;
        }
        if (B.kind === BossKind.Giant && B.hits % K.stagger !== 0) { B.knockV = f32(away * 24); return; }   // he shrugs it off
        B.s = BossState.Hurt; B.t = K.hurt; B.knockV = f32(away * 90);
    }

    // ------------------------------------------------------------------ attackers
    _updateSpawner(dt) {
        const F = this.f, fl = this.fl;
        if (!this.b.alive || F.x < C.BossZoneX) return;
        this._spawnT = f32(this._spawnT - dt);
        if (this._spawnT > 0) return;
        let live = 0, throwers = 0, ghosts = 0;
        for (const e of this.foes) if (e.live) { live++; if (e.kind === FoeKind.Thrower) throwers++; if (e.kind === FoeKind.Ghost) ghosts++; }
        if (live >= fl.maxFoes) { this._spawnT = f32(0.3); return; }
        this._spawnT = f32(f32(fl.gap * this.spawnScale) * this._range(0.6, 1.4));

        // the floor's mix, less what cannot come now (one ghost at a time, the throwers' quota, no thrower by the door)
        const w0 = fl.mix[0];
        const w1 = throwers < fl.throwers && F.x < f32(this.floorLength - 240) ? fl.mix[1] : 0;
        const w2 = fl.mix[2];
        const w3 = ghosts === 0 ? fl.mix[3] : 0;
        const r = f32(this._rng.nextDouble() * (w0 + w1 + w2 + w3));
        const kind = r < w1 ? FoeKind.Thrower : r < w1 + w3 ? FoeKind.Ghost : r < w1 + w3 + w2 ? FoeKind.Dwarf : FoeKind.Grabber;

        let side = this._rng.nextDouble() < 0.6 ? -1 : 1;                           // -1 = ahead, up the floor
        if (kind === FoeKind.Ghost) { this._spawnGhost(side); return; }
        let x = this._spawnX(side);
        if (x === null) { side = -side; x = this._spawnX(side); if (x === null) return; }
        this._spawn(kind, x);
        if (kind === FoeKind.Grabber && live + 1 < fl.maxFoes && this._rng.nextDouble() < fl.pair) {
            const x2 = this._spawnX(-side);
            if (x2 !== null) this._spawn(FoeKind.Grabber, x2);                        // the classic pincer
        }
    }

    // just off the edge of the tube on that side, if the floor goes on there; null if not
    _spawnX(side) {
        const cx = this.cam.camX;
        const x = side < 0 ? f32(cx - 16) : f32(f32(cx + IronDojoScroll.ScreenW) + 16);
        if (side < 0) return x > C.BossZoneX - 80 ? x : null;
        return x < f32(this.floorLength - 20) ? x : null;
    }

    _spawn(kind, x) {
        const e = new Foe();
        const sp = f32(this.approach * this.fl.speed);
        e.id = this._nextId++; e.kind = kind; e.s = FoeState.Walk; e.x = x; e.dir = this.f.x >= x ? 1 : -1;
        switch (kind) {
            case FoeKind.Grabber: e.speed = f32(f32(50 * sp) * this._range(0.9, 1.1)); break;
            case FoeKind.Thrower: e.speed = f32(40 * sp); e.standoff = this._range(96, 128); break;
            case FoeKind.Snake: e.speed = f32(f32(C.SnakeSpeed * sp) * this._range(0.9, 1.1)); break;
            case FoeKind.Lizard: e.speed = f32(f32(C.LizardSpeed * sp) * this._range(0.9, 1.1)); e.h = 4; break;
            case FoeKind.Ghost: e.speed = f32(C.GhostSpeed * sp); break;
            default: e.speed = f32(f32(80 * sp) * this._range(0.9, 1.1)); break;
        }
        e.clock = this._range(0, 1);
        this.foes.push(e);
        return e;
    }

    // a mirror ghost steps out of the glass near you, on the tube, and shimmers a beat before he is solid
    _spawnGhost(side) {
        const F = this.f, cam = this.cam;
        let x = f32(F.x + f32(side * this._range(48, 74)));
        const lo = f32(cam.leftEdge + 14), hi = f32(cam.rightEdge - 14);
        if (x < lo || x > hi) x = f32(F.x - f32(side * this._range(48, 74)));
        if (x < lo || x > hi || x < C.BossZoneX - 60) return;
        const e = this._spawn(FoeKind.Ghost, x);
        e.s = FoeState.Shimmer; e.t = C.GhostShimmer; e.life = C.GhostLife;
        this._emit('ghost');
    }

    _updateFoes(dt, live) {
        const f = this.f;
        for (let i = this.foes.length - 1; i >= 0; i--) {
            const e = this.foes[i];
            e.clock = f32(e.clock + dt);
            e.flash = Math.max(0, f32(e.flash - dt));
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
                case FoeKind.Snake: this._updateCrawler(e, dt, toward, ad, C.SnakeContact, Hurt.Snake, 46); break;
                case FoeKind.Lizard: if (this._updateLizard(e, dt, toward, ad)) { this.foes.splice(i, 1); continue; } break;
                case FoeKind.Ghost: if (this._updateGhost(e, dt, toward, ad)) { this.foes.splice(i, 1); continue; } break;
                default: this._updateCrawler(e, dt, toward, ad, C.DwarfContact, Hurt.Dwarf, 56); break;
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
                    this._breakChain();
                    this._cues.emit(SoundCue.Miss);
                    this._emit('grab');
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
            if (o === e || !o.live || (o.kind !== FoeKind.Grabber && o.kind !== FoeKind.Thrower)) continue;
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
                    this.shots.push(new Shot(this._nextId++, ShotKind.Knife, f32(e.x + f32(e.dir * 10)), e.dir, e.knifeHigh, this.knifeSpeed));
                    this._throws++;
                    this._emit('throw', { high: e.knifeHigh });
                    e.s = FoeState.Aim; e.t = f32(this.throwGap * this._range(0.75, 1.25));
                }
                break;
        }
    }

    // the dwarf and the snake: along the boards, under a standing blow; past you, they turn and come again
    _updateCrawler(e, dt, toward, ad, contact, cause, turnPast) {
        const f = this.f;
        switch (e.s) {
            case FoeState.Walk:
                e.x = f32(e.x + f32(f32(e.dir * e.speed) * dt));
                if (f32(f32(e.x - f.x) * e.dir) > turnPast) e.dir = -e.dir;              // rolled past: turn and come again
                if (ad <= contact && f.h < 12 && f.a !== Act.Down && f.invuln <= 0) {
                    this._damage(1, cause, e.dir, true);
                    e.s = FoeState.Hop; e.vx = f32(-e.dir * 90); e.vh = 150;
                }
                break;
            case FoeState.Hop:
                e.x = f32(e.x + f32(e.vx * dt)); e.h = f32(e.h + f32(e.vh * dt)); e.vh = f32(e.vh - f32(C.Gravity * dt));
                if (e.h <= 0 && e.vh < 0) { e.h = 0; e.vh = 0; e.s = FoeState.Walk; e.dir = toward; }
                break;
        }
    }

    // the fire-lizard flies at head height, bobbing; it passes you, turns, and on the third pass flies off.
    // Returns true when it has gone.
    _updateLizard(e, dt, toward, ad) {
        const f = this.f;
        if (e.s === FoeState.Fade) {
            e.h = f32(e.h + f32(60 * dt)); e.x = f32(e.x + f32(f32(e.dir * e.speed) * dt));
            return e.h > 150;
        }
        const base = f32(18 + f32(8 * tri(f32(e.clock * f32(1.4)))));
        e.h = e.h < base ? Math.min(base, f32(e.h + f32(70 * dt))) : base;
        e.x = f32(e.x + f32(f32(e.dir * e.speed) * dt));
        if (f32(f32(e.x - f.x) * e.dir) > 52) {
            e.passes++;
            if (e.passes >= 3) { e.s = FoeState.Fade; return false; }
            e.dir = -e.dir;
        }
        if (ad <= C.LizardContact && !f.ducking && f.h < 34 && f.a !== Act.Down && f.invuln <= 0 && e.h > 8) {
            this._damage(1, Hurt.Lizard, e.dir, true);
            e.passes++;
            e.dir = -e.dir;
        }
        return false;
    }

    // the mirror ghost: shimmer (untouchable) > solid, closing > the wind-up (his arm back) > a HIGH strike > a beat
    // to recover > ... until his time is up and he fades back into the glass. Returns true when he has gone.
    _updateGhost(e, dt, toward, ad) {
        const f = this.f;
        switch (e.s) {
            case FoeState.Shimmer:
                e.dir = toward;
                e.t = f32(e.t - dt);
                if (e.t <= 0) e.s = FoeState.Walk;
                break;
            case FoeState.Walk:
                e.dir = toward;
                e.life = f32(e.life - dt);
                if (e.life <= 0) { e.s = FoeState.Fade; e.t = f32(0.6); break; }
                if (ad > C.GhostReach - 4) e.x = f32(e.x + f32(toward * Math.min(f32(e.speed * dt), f32(ad - f32(C.GhostReach - 6)))));
                else { e.s = FoeState.Windup; e.t = C.GhostWindup; }
                break;
            case FoeState.Windup:
                e.t = f32(e.t - dt);
                if (e.t <= 0) {
                    e.s = FoeState.Strike; e.t = f32(0.16);
                    this._emit('ghostStrike');
                    if (ad <= C.GhostReach + 4 && !f.ducking && f.h < 20 && f.a !== Act.Down && f.invuln <= 0) this._damage(2, Hurt.Ghost, e.dir, true);
                }
                break;
            case FoeState.Strike:
                e.t = f32(e.t - dt);
                if (e.t <= 0) { e.s = FoeState.Stunned; e.t = f32(0.5); }
                break;
            case FoeState.Stunned:
                e.t = f32(e.t - dt); e.life = f32(e.life - dt);
                if (e.t <= 0) e.s = FoeState.Walk;
                break;
            case FoeState.Fade:
                e.t = f32(e.t - dt);
                return e.t <= 0;
        }
        return false;
    }

    // ------------------------------------------------------------------ what flies: knives, the ring, blades, waves, fire
    _updateShots(dt) {
        const f = this.f, B = this.b;
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const k = this.shots[i];
            k.t = f32(k.t + dt);
            if (k.kind === ShotKind.Ring && k.back) k.dir = B.x >= k.x ? 1 : -1;    // home to his hand
            const step = f32(k.speed * dt);
            k.x = f32(k.x + f32(k.dir * step));
            k.travel = f32(k.travel + step);
            if (k.kind === ShotKind.Ring) {
                if (!k.back && k.travel >= k.range) { k.back = true; k.passed = false; k.travel = 0; }
                else if (k.back && Math.abs(f32(k.x - B.x)) <= 8) { this.shots.splice(i, 1); this._catchRing(); continue; }
            }
            const ad = Math.abs(f32(f.x - k.x));
            if (!k.passed && ad <= k.contact && f.a !== Act.Down && f.a !== Act.Climb) {
                const hit = k.high ? !f.ducking : f.h < 10;
                if (hit && f.invuln <= 0) {
                    this._damage(ShotDamage[k.kind], ShotHurt[k.kind], k.dir, true);
                    if (k.kind === ShotKind.Ring) k.passed = true;                     // the ring flies on
                    else { this.shots.splice(i, 1); continue; }
                }
                if (!hit && k.high && ad <= 3 && this.firstDuckUnderAt < 0) this.firstDuckUnderAt = this._time;
            }
            if (!k.passed && f32(f32(k.x - f.x) * k.dir) > k.contact) { k.passed = true; this._knifeDodges++; }
            if (ad > 380 && k.kind !== ShotKind.Ring) this.shots.splice(i, 1);
        }
    }

    _catchRing() {
        const B = this.b;
        B.armed = true;
        this._emit('catch');
        if (B.s === BossState.Unarmed) { B.s = BossState.Recover; B.t = f32(0.3); }
    }

    // ------------------------------------------------------------------ hazards: pots, the wind, the blades
    _updateHazards(dt) {
        const F = this.f, fl = this.fl, B = this.b;
        const open = B.alive && !B.active && F.x >= f32(C.BossZoneX - 40);           // the hall, not the master's duel
        if (fl.pots > 0 && open) {
            this._potT = f32(this._potT - dt);
            if (this._potT <= 0) {
                this._potT = f32(f32(fl.pots * this.spawnScale) * this._range(0.7, 1.3));
                const x = f32(F.x - this._range(6, 64));                             // ahead of you, where you are going
                if (x > f32(this.cam.leftEdge + 10)) {
                    const r = this._rng.nextDouble();
                    this.pots.push(new Pot(this._nextId++, x, r < 0.45 ? 1 : r < 0.8 ? 2 : 0));
                    this._pots++;
                    this._emit('potHang');
                }
            }
        }
        if (fl.wind) {
            const w = this.wind;
            if (!open) w.s = 0;
            else {
                w.t = f32(w.t - dt);
                if (w.t <= 0) {
                    if (w.s === 0) { w.s = 1; w.t = C.WindTell; this._emit('gustTell'); }
                    else if (w.s === 1) { w.s = 2; w.t = C.WindBlow; this._emit('gust'); }
                    else { w.s = 0; w.t = this._range(5.5, 9); }
                }
            }
        }
        if (fl.blades > 0) {
            if (!open) this.glint = null;
            else if (this.glint != null) {
                this.glint.t = f32(this.glint.t - dt);
                if (this.glint.t <= 0) {
                    this.shots.push(new Shot(this._nextId++, ShotKind.Blade, f32(this.cam.leftEdge - 6), 1, this.glint.high, C.BladeSpeed));
                    this._emit('blade', { high: this.glint.high });
                    this.glint = null;
                }
            }
            else {
                this._bladeT = f32(this._bladeT - dt);
                if (this._bladeT <= 0) {
                    this._bladeT = f32(f32(fl.blades * this.spawnScale) * this._range(0.7, 1.3));
                    this.glint = { t: C.GlintTell, high: this._rng.nextDouble() < 0.5 };
                    this._emit('glint', { high: this.glint.high });
                }
            }
        }
    }

    _updatePots(dt) {
        const f = this.f;
        for (let i = this.pots.length - 1; i >= 0; i--) {
            const p = this.pots[i];
            p.t = f32(p.t + dt);
            if (p.s === 0) {
                p.eta = f32(f32(C.PotHang - p.t) + C.PotFall);
                if (p.t >= C.PotHang) { p.s = 1; p.t = 0; this._emit('potDrop'); }
                continue;
            }
            p.vh = f32(p.vh - f32(C.PotGravity * dt));
            p.h = f32(p.h + f32(p.vh * dt));
            p.eta = Math.max(0, f32(C.PotFall - p.t));
            if (p.h > 0) continue;
            if (Math.abs(f32(f.x - p.x)) <= C.PotRadius && f.a !== Act.Down && f.a !== Act.Climb && f.invuln <= 0)
                this._damage(2, Hurt.Pot, f.x >= p.x ? 1 : -1, true);
            this.pots.splice(i, 1);
            this._shatter(p);
        }
    }

    // a pot on the boards: shards, and whatever it held
    _shatter(p) {
        this._debris(p.x, 2, 6, 5, 0);
        this.effects.push(new Fx(5, p.x, 0));
        this._emit('shatter', { content: p.content === 1 ? 'snake' : p.content === 2 ? 'lizard' : 'tea' });
        if (p.content === 0) { this.pickups.push(new Pickup(this._nextId++, p.x)); return; }
        const e = this._spawn(p.content === 1 ? FoeKind.Snake : FoeKind.Lizard, p.x);
        e.dir = this.f.x >= p.x ? 1 : -1;
    }

    // struck out of the air: points, shards, and nothing gets out
    _smashPot(p) {
        const i = this.pots.indexOf(p);
        if (i >= 0) this.pots.splice(i, 1);
        this._potSmash++;
        this._chainUp(p.x, p.h);
        const pts = C.ScorePot * this.mult;
        this._addScore(pts);
        this.effects.push(new Fx(1, p.x, f32(p.h + 12), pts));
        this.effects.push(new Fx(0, p.x, f32(p.h + 6)));
        this._debris(p.x, p.h, 7, 5, this.f.dir);
        this._cues.emit(SoundCue.Hit);
        this._emit('smash');
    }

    _updatePickups(dt) {
        const f = this.f;
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const q = this.pickups[i];
            q.t = f32(q.t + dt);
            if (q.t >= C.TeaLife) { this.pickups.splice(i, 1); continue; }
            if (q.t > f32(0.3) && !f.airborne && f.a !== Act.Down && Math.abs(f32(f.x - q.x)) <= C.TeaRadius) {
                this.pickups.splice(i, 1);
                f.energy = Math.min(f.maxEnergy, f.energy + C.TeaEnergy);
                this._teas++;
                this._addScore(C.ScoreTea);
                const t = new Fx(4, q.x, 30); t.text = 'ENERGY +' + C.TeaEnergy; t.c = 17;
                this.effects.push(t);
                this._cues.emit(SoundCue.Bonus);
                this._emit('pickup');
            }
        }
    }

    // ------------------------------------------------------------------ the masters
    _updateBoss(dt) {
        const b = this.b, f = this.f, K = b.spec;
        if (!b.active) {
            if (f32(f.x - b.x) < C.BossWakeDx) {
                b.active = true; b.s = BossState.Approach;
                this.reachedBossAt = this._time; this.bossBanner = f32(2.6);
                this._log += 'R' + fmt(this._time, 1, F32) + ' ';
                this._emit('bossWake', { boss: b.kind, floor: this.floorN });
            }
            else return;
        }
        b.clock = f32(b.clock + dt);
        b.flash = Math.max(0, f32(b.flash - dt));
        if (b.parryT > 0) { b.parryT = Math.max(0, f32(b.parryT - dt)); if (b.parryT <= 0) b.parries = 0; }
        if (b.knockV !== 0) { b.x = f32(b.x + f32(b.knockV * dt)); b.knockV = toward0(b.knockV, f32(400 * dt)); }
        const dx = f32(f.x - b.x), ad = Math.abs(dx);
        const toward = dx >= 0 ? 1 : -1;
        if (b.s === BossState.Down) { b.t = f32(b.t + dt); return; }
        if (b.s !== BossState.Swing && b.s !== BossState.Telegraph) b.dir = toward;
        switch (b.s) {
            case BossState.Approach:
                if (ad > K.prefer) b.x = f32(b.x + f32(f32(toward * K.walk) * dt));
                else { b.s = BossState.Idle; b.t = this._range(0.3, 0.8); }
                break;
            case BossState.Idle:
                b.t = f32(b.t - dt);
                if (b.kind === BossKind.Ring && !b.armed) { b.s = BossState.Unarmed; b.t = f32(5); }
                else if (ad > K.prefer + 16) b.s = BossState.Approach;
                else if (ad < this._crowdedAt(b) && b.x > C.BossMinX + 2) b.s = BossState.Retreat;
                else if (b.t <= 0) this._bossChoose(ad);
                break;
            case BossState.Retreat:
                b.x = f32(b.x - f32(f32(toward * K.retreat) * dt));
                if (ad >= K.prefer - 2 || b.x <= C.BossMinX) { b.s = BossState.Idle; b.t = this._range(0.15, 0.4); }
                break;
            case BossState.Telegraph:
                b.t = f32(b.t - dt);
                if ((b.atk === Atk.Melee || b.atk === Atk.Double || b.atk === Atk.Counter) && ad > 22)
                    b.x = f32(b.x + f32(f32(b.dir * f32(C.TelegraphStep / Math.max(f32(0.1), b.dur))) * dt));
                if (b.t <= 0) this._bossStrike();
                break;
            case BossState.Swing:
                b.t = f32(b.t - dt);
                if (b.t <= 0) {
                    if (b.atk === Atk.Double && b.swings < 2) { b.swings = 2; b.s = BossState.Telegraph; b.t = b.dur = f32(K.gap * this.bossTell); }
                    else { b.s = BossState.Recover; b.t = b.atk === Atk.Chi ? K.chiRecover : b.atk === Atk.Slam ? f32(K.recover * f32(1.2)) : K.recover; }
                }
                break;
            case BossState.Recover:
                b.t = f32(b.t - dt);
                if (b.t <= 0) { b.s = BossState.Idle; b.t = this._range(0.2, 0.5); }
                break;
            case BossState.Hurt:
                b.t = f32(b.t - dt);
                if (b.t <= 0) { b.s = BossState.Idle; b.t = this._range(0.4, 0.8); }
                break;
            case BossState.Unarmed:                                                  // his ring is out: he waits on it, open
                b.t = f32(b.t - dt);
                if (b.t <= 0) { b.armed = true; b.s = BossState.Idle; b.t = f32(0.3); }
                break;
        }
        if (b.x < C.BossMinX - 24) b.x = C.BossMinX - 24;
    }

    // the range a master backs off from (the ring dancer keeps you at a distance; the giant stands his ground)
    _crowdedAt(b) {
        switch (b.kind) {
            case BossKind.Ring: return 64;
            case BossKind.Giant: return 0;
            default: return 30;
        }
    }

    _tele(atk, base) {
        const B = this.b;
        B.s = BossState.Telegraph; B.atk = atk; B.whiff = false;
        B.t = B.dur = f32(f32(base * this.bossTell) * (atk === Atk.Counter ? 1 : this._range(0.85, 1.25)));   // his rhythm varies
        if (this.firstTelegraphAt < 0) this.firstTelegraphAt = this._time;
        this._emit('bossTell', { boss: B.kind, atk: AtkNames[atk], high: B.high });
    }

    _bossChoose(ad) {
        const B = this.b, K = B.spec;
        switch (B.kind) {
            case BossKind.Ring:
                if (ad < 52) this._tele(Atk.Melee, K.tell);
                else { B.high = this._rng.nextDouble() < 0.5; this._tele(Atk.Throw, K.throwTell); }
                break;
            case BossKind.Giant:
                if (ad <= K.reach + 4 && this._rng.nextDouble() < 0.6) this._tele(Atk.Melee, K.tell);
                else this._tele(Atk.Slam, K.slamTell);
                break;
            case BossKind.Twin:
                if (ad > 80) { B.high = this._rng.nextDouble() < 0.5; this._tele(Atk.Throw, K.throwTell); }
                else { B.swings = 1; this._tele(Atk.Double, K.tell); }
                break;
            case BossKind.Master:
                if (B.phase === 2 && (ad > 70 || this._rng.nextDouble() < 0.4)) { B.high = this._rng.nextDouble() < 0.5; this._tele(Atk.Chi, K.chiTell); }
                else this._tele(Atk.Melee, B.phase === 2 ? K.tell2 : K.tell);
                break;
            default:
                this._tele(Atk.Melee, K.tell);
                break;
        }
    }

    _bossStrike() {
        const b = this.b, f = this.f, K = b.spec;
        b.s = BossState.Swing; b.t = K.swing;
        const ad = Math.abs(f32(f.x - b.x));
        const away = f.x >= b.x ? 1 : -1;
        switch (b.atk) {
            case Atk.Throw: {
                const ring = b.kind === BossKind.Ring;
                const k = new Shot(this._nextId++, ring ? ShotKind.Ring : ShotKind.Blade, f32(b.x + f32(b.dir * 12)), b.dir, b.high, ring ? K.ringSpeed : K.bladeSpeed);
                if (ring) { k.range = K.ringRange; b.armed = false; b.s = BossState.Unarmed; b.t = f32(5); }
                this.shots.push(k);
                this._emit('bossThrow', { boss: b.kind, high: b.high });
                return;
            }
            case Atk.Slam: {
                for (const d of [-1, 1]) this.shots.push(new Shot(this._nextId++, ShotKind.Wave, f32(b.x + f32(d * 22)), d, false, K.waveSpeed));
                this.shake = f32(0.45);
                this.effects.push(new Fx(5, f32(b.x - 22), 0)); this.effects.push(new Fx(5, f32(b.x + 22), 0));
                b.whiff = true;
                if (ad <= 34 && f.h < 10 && f.a !== Act.Down && this.bossLands && f.invuln <= 0) {
                    b.whiff = false;
                    this._damage(K.slamDamage, Hurt.Boss, away, true);
                    f.knockV = f32(away * 150);
                }
                this._emit('slam', { hit: !b.whiff });
                return;
            }
            case Atk.Chi: {
                this.shots.push(new Shot(this._nextId++, ShotKind.Chi, f32(b.x + f32(b.dir * 14)), b.dir, b.high, K.chiSpeed));
                this._emit('chi', { high: b.high });
                return;
            }
        }
        // a blow: the stick, the ring's edge, a blade, a palm. Out of his reach (or the mercy credit) it whiffs.
        const reach = b.atk === Atk.Counter ? K.reach + 4 : K.reach;
        b.whiff = true;
        if (ad <= reach && f.a !== Act.Down && this.bossLands && f.invuln <= 0) {
            b.whiff = false;
            if (f.a === Act.Grabbed) this._setAct(Act.Idle);
            this._damage(K.damage, Hurt.Boss, away, true);
            f.knockV = f32(away * 170);
            this.shake = f32(0.15);
            this.effects.push(new Fx(0, f32(f.x - f32(away * 6)), 24));
        }
        this._emit('bossSwing', { boss: b.kind, atk: AtkNames[b.atk], hit: !b.whiff });
    }

    // ------------------------------------------------------------------ interludes
    _startKO() {
        const F = this.f;
        this.p = Phase.KO; this.phaseTime = 0;
        this._setAct(Act.Down); F.knockV = 0; F.h = 0; F.vh = 0;
        this._kos++;
        if (this.firstKOAt < 0) this.firstKOAt = this._time;
        this._log += 'K' + this.floorN + '@' + fmt(this._time, 1, F32) + '(' + HurtNames[this.lastHurt] + ') ';
        this._clearHold();
        this.shake = f32(0.3);
        this._cues.emit(SoundCue.Die);
        this._emit('down', { cause: HurtNames[this.lastHurt], last: this.livesLeft <= 1 });
    }

    _startTimeUp() {
        const F = this.f;
        this.p = Phase.TimeUp; this.phaseTime = 0;
        this._setAct(Act.Down); F.knockV = 0; F.h = 0; F.vh = 0;
        this.lastHurt = Hurt.Time;
        this._timeups++;
        this._log += 'T' + this.floorN + '@' + fmt(this._time, 1, F32) + ' ';
        this._clearHold();
        this._cues.emit(SoundCue.Die);
        this._emit('timeUp', { last: this.livesLeft <= 1 });
    }

    _clearHold() {
        for (const e of this.foes) if (e.s === FoeState.Hold) { e.s = FoeState.Stunned; e.t = 5; e.vx = f32(e.side * 80); }
        this.shots.length = 0; this.pots.length = 0; this.glint = null; this.wind.s = 0; this.wind.t = f32(4);
        this._breakChain();
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
        this.foes.length = 0; this.shots.length = 0; this.pots.length = 0; this.pickups.length = 0;
        const f = this.f;
        f.energy = f.maxEnergy; f.a = Act.Idle; f.at = 0; f.h = 0; f.vh = 0; f.knockV = 0; f.invuln = 1; f.grabImmune = 1;
        this.timer = this.floorTime;
        this._spawnT = f32(1.5);
        this._warned = 0;
        const B = this.b;
        if (B.active && B.alive) {
            if (f.x < f32(B.x + 110)) f.x = Math.min(f32(this.floorLength - 24), f32(B.x + 110));
            B.s = BossState.Idle; B.t = f32(1.2); B.knockV = 0; B.armed = true; B.parries = 0;
        }
        this._goIntro(this.introSeconds);
    }

    _startClimb() {
        const F = this.f;
        this.p = Phase.Climb; this.phaseTime = 0;
        this._setAct(Act.Climb); F.dir = -1; F.knockV = 0;
        this.tally = [
            { label: 'TIME BONUS', value: Math.ceil(this.timer) * C.BonusPerSecond, paid: 0 },
            { label: 'ENERGY BONUS', value: Math.max(0, F.energy) * C.BonusPerEnergy, paid: 0 },
            { label: 'FLOOR BONUS', value: this.floorN * C.BonusPerFloor, paid: 0 },
        ];
        this.bonus = 0;
        for (const l of this.tally) this.bonus += l.value;
        this._tallyTick = 0;
        this.stairsAt = this._time;
        this.floorsCleared = Math.max(this.floorsCleared, this.floorN);
        this._log += 'S' + this.floorN + '@' + fmt(this._time, 1, F32) + ' ';
        this._cues.emit(SoundCue.Bonus);
        this._emit('floorClear', { floor: this.floorN, last: this.lastFloor });
    }

    // up the stairs; the tally counts up line by line (each line 0.7 s, starting 0.9 s apart), then the next floor's card
    _climbStep(dt) {
        const f = this.f;
        f.at = f32(f.at + dt);
        f.walkClock = f32(f.walkClock + dt);
        if (f.x > 30) { f.x = f32(f.x - f32(28 * dt)); f.h = f32(f.h + f32(26 * dt)); }   // up the stairs, up and to the left
        this._updateFoes(dt, false);
        this._updateFx(dt);
        this.cam.follow(dt, f.x, f.dir);
        let paying = false;
        for (let i = 0; i < this.tally.length; i++) {
            const l = this.tally[i];
            const start = f32(f32(0.8) + f32(i * f32(0.9)));
            if (this.phaseTime < start || l.paid >= l.value) continue;
            const k = Math.min(1, f32(f32(this.phaseTime - start) / f32(0.7)));
            const due = k >= 1 ? l.value : idiv(Math.trunc(f32(l.value * k)), 100) * 100;
            if (due > l.paid) { this._addScore(due - l.paid); l.paid = due; paying = true; }
        }
        this._tallyTick = f32(this._tallyTick - dt);
        if (paying && this._tallyTick <= 0) { this._tallyTick = f32(0.07); this._emit('tally'); }
        if (this.phaseTime >= this.climbSeconds) {
            for (const l of this.tally) if (l.paid < l.value) { this._addScore(l.value - l.paid); l.paid = l.value; }
            if (this.lastFloor) {
                this._result = RoundResult.Won;
                this.p = Phase.Card; this.phaseTime = 0;
                this._cues.emit(SoundCue.Win);
                this._emit('win');
            }
            else this._startFloor(this.floorN + 1);
        }
    }

    _updateFx(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const x = this.effects[i];
            x.t = f32(x.t + dt);
            if (x.kind === 1 || x.kind === 4) x.h = f32(x.h + f32(22 * dt));
            else if (x.kind === 3) {
                x.x = f32(x.x + f32(x.vx * dt)); x.h = f32(x.h + f32(x.vh * dt)); x.vh = f32(x.vh - f32(520 * dt));
                if (x.h < 0) { x.h = 0; x.vh = f32(-x.vh * f32(0.3)); x.vx = f32(x.vx * f32(0.5)); }
            }
            if (x.t >= FxLife[x.kind]) this.effects.splice(i, 1);
        }
    }

    // ------------------------------------------------------------------ helpers
    _range(a, b) { a = f32(a); b = f32(b); return f32(a + f32(f32(b - a) * f32(this._rng.nextDouble()))); }
    _fxRange(a, b) { a = f32(a); b = f32(b); return f32(a + f32(f32(b - a) * f32(this._fx.nextDouble()))); }

    collectStats(into) {
        const K = this._kills;
        add(into, 'floors', this.floorsCleared);
        add(into, 'kills', K[0] + K[1] + K[2] + K[3] + K[4] + K[5]);
        add(into, 'killGhost', K[5]);
        add(into, 'killLizard', K[4]);
        add(into, 'grabs', this._grabs);
        add(into, 'shakes', this._shakes);
        add(into, 'shotHit', this._knifeHits);
        add(into, 'shotDodge', this._knifeDodges);
        add(into, 'crawlHit', this._dwarfHits);
        add(into, 'bossHitYou', this._bossHitsTaken);
        add(into, 'bossBlows', this._bossBlows);
        add(into, 'parries', this._parries);
        add(into, 'ko', this._kos);
        add(into, 'timeup', this._timeups);
        add(into, 'masters', this._bossDowns);
        add(into, 'pots', this._pots);
        add(into, 'potHit', this._potHits);
        add(into, 'potSmash', this._potSmash);
        add(into, 'tea', this._teas);
        add(into, 'extends', this._extends);
        add(into, 'bestMult', this.bestMult);
        add(into, 'dmgGrab', this._dmgGrab);
        add(into, 'dmgShot', this._dmgShot);
        add(into, 'dmgCrawl', this._dmgCrawl);
        add(into, 'dmgBoss', this._dmgBoss);
        add(into, 'dmgOther', this._dmgOther);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

IronDojoSim.Phase = Phase;
IronDojoSim.C = C;                          // the machine constants, for the renderer and the bot
