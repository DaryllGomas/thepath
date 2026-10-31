// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · THE RULES (ICabinetSim).
// Began as the port of SpritePopSim.cs (Staging/Batch2/spritepop); rebuilt on 2026-10-18 as THE TOWER, a whole
// game for a coin (seven stages, stages.js). Floats still go through f32() the way the port did them.
//
// One screen of one-way platforms per stage (tiles.js), wrap-around top and bottom. A coin climbs
// the tower: stage 1 SUGAR STEPS to stage 7 THE TIN THRONE, with 5 lives and extra lives on the way.
//
//   THE CUB     stick left/right walks (72 px/s, full air control), UP jumps (B also jumps), one
//               jump per press, 59 px high: three tile rows. Button A blows a bubble forward.
//   BUBBLES     shoot forward ~58 px, slowing, then drift up (through platforms) to the ceiling,
//               where the air current parks them over a reachable column. A bubble traps the first
//               free creature whose centre comes within the CATCH RADIUS while it is still soft
//               (1.2 s after the shot); then it hardens, traps nothing, and pops at a touch. An
//               empty bubble pops by itself after 9 s. At most 10 bubbles at once.
//   TRAPPED     a bubble with a creature rises slower; after TRAP SECONDS (6) it bursts and the
//               creature comes out ANGRY (faster, red). Touch a trapped bubble and it POPS: the
//               creature becomes FRUIT (arcs out, lands, lasts 8 s) and every bubble touching the
//               popped one pops 0.1 s later (the chain reaction).
//   SPECIALS    rise from the floor and park under the ceiling like any bubble; touch one to pop it:
//               FIZZ    a soda flood pours out the way the cub faces, runs along the shelves, drops
//                       off their ends and drains out of the floor gap: every creature it touches is
//                       swept away (500, 1000, 2000, 4000 for the 1st..4th in one flood)
//               SPARK   a bolt shoots across the screen the way the cub faces and zaps every creature
//                       on its line (500 x n); in the king's room sparks curl round to hit the king
//               LETTER  C, A, N, D or Y (200); all five spell CANDY: an extra life
//   SCORE       a pop is 100 x the chain (pops each within 1 s of the last: 100, 200, 300...);
//               fruit is 400 + 100 x the stage. Extra lives at 20,000 and every 30,000 after.
//   CREATURES   WIND-UPS walk the platforms, turn at walls, drop off edges toward the cub and jump
//               up to a platform when the cub is above; WHISTLERS fly diagonally through
//               everything; HOPPERS crouch (the tell) and leap three rows; CORKERS walk, and when
//               level with the cub stop, puff (the tell, 0.6 s) and spit a cork along the row (a
//               bubble stops a cork); WISPS drift straight at the cub through everything and thin
//               out now and then (a faded wisp neither catches nor can be caught); BOUNCERS bounce
//               without end. Touch a free creature, a cork, a gear or the alarm and you lose a life.
//   HURRY UP    after the stage's hurry clock every free creature turns angry; 12 s later THE ALARM
//               (an alarm clock that cannot be popped) comes in through the ceiling gap and homes
//               on the cub, faster and faster. A lost life calls both off for 20 s.
//   A STAGE     opens on its card (READY: number, name, what is new, a hint; the screen scrolls up
//               from the last one); is cleared when every creature is gone (then 3 s to grab fruit);
//               then the TALLY: stage bonus 1000 x n, time bonus (3000 under 30 s, 2000 under 45,
//               1000 under 60) and NO MISS 2000. Stage 7 is THE TIN KING (boss.js): popping him in
//               his bubble clears the tower and WINS. The last life lost LOSES.
//   MERCY       creature speed -10% per lost credit and the catch radius +2 px per lost credit, the
//               king one hit softer (knobs); on the unlosable credit (5) creatures DRIFT instead of
//               hunting, nothing spits or throws, no alarm comes, a hurry makes them SLEEPY (half
//               speed) instead of angry, and the cub cannot die.
//
// Deterministic for a seed: one SystemRandom for the game, fixed step order, no clock.
// The sim says more than the eight SDK cues for the sound (sound.js): with recordEvents on it pushes
// { kind, ... } onto events (Starvector's _emit).
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, CabinetInput, Pad } from '../../sdk/index.js';
import { SpritePopLevel } from './tiles.js';
import { STAGES, Kind, Word } from './stages.js';
import { TinKing, KState, kingStep } from './boss.js';

const Phase = Object.freeze({ Idle: 0, Ready: 1, Play: 2, Ouch: 3, Tally: 4, Card: 5, Over: 6 });
const CState = Object.freeze({ Waiting: 0, Free: 1, Trapped: 2, Gone: 3 });
const BType = Object.freeze({ Plain: 0, Fizz: 1, Spark: 2, Letter: 3, King: 4 });
const ShotKind = Object.freeze({ Cork: 0, Gear: 1 });
// particle colour sets (the renderer maps them to palette colours)
const Fx = Object.freeze({ Pop: 0, Fruit: 1, Fizz: 2, Spark: 3, King: 4, Letter: 5 });

const Tile = SpritePopLevel.Tile;
const InnerL = SpritePopLevel.InnerL, InnerR = SpritePopLevel.InnerR;
const FloorY = f32(SpritePopLevel.FloorRow * Tile);                  // the floor's top, field px
const Gravity = f32(760), JumpV = f32(300), MaxFall = f32(170);
const Shrink = f32(3);                                             // feet overlap margin for platforms
const CubStartX = f32(24), CubStartY = f32(SpritePopLevel.FloorRow * Tile - 16);
const AllLetters = (1 << Word.length) - 1;

export class PopBody {
    constructor() {
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;          // top-left, field px
        this.w = 16; this.h = 16;
        this.grounded = false;
        this.face = 1;
        this.anim = 0;
    }
    get cx() { return f32(this.x + f32(this.w * 0.5)); }
    get cy() { return f32(this.y + f32(this.h * 0.5)); }
    get feet() { return f32(this.y + this.h); }
}

export class Creature extends PopBody {
    constructor() {
        super();
        this.id = 0;
        this.kind = Kind.WindUp;
        this.state = CState.Waiting;
        this.angry = false;
        this.mad = false;               // broke out of a bubble: angry for good (a hurry's anger is called off by a lost life)
        this.minion = false;            // wound out of the Tin King
        this.think = 0;
        this.fy = 1;                    // whistler: vertical heading
        this.homeX = 0; this.homeY = 0; // where it lands in the drop-in
        this.jumping = false;
        this.edgeState = 0;             // 0 not at an edge, 1 decided to go over, 2 decided to turn
        this.act = 0; this.actT = 0;    // hopper: 0 rest, 1 crouch, 2 leap; corker: 0 walk, 1 puffing (the tell)
        this.cool = 0;                  // corker: until it may spit again
        this.faded = false; this.fadeT = 0;  // wisp: thinned out (cannot catch, cannot be caught)
        this.tx = 0; this.ty = 0;       // wisp: where it is heading
        this.squash = 0;                // bouncer: a landing's squash (drawing only)
    }
}

export class Bubble {
    constructor() {
        this.id = 0;
        this.x = 0; this.y = 0;         // centre, field px
        this.face = 1;
        this.type = BType.Plain;
        this.letter = 0;
        this.age = 0; this.life = 0; this.trapLeft = 0; this.trapTotal = 0; this.popIn = 0;
        this.alive = false;
        this.held = null;
        this.hard = false;              // an empty bubble past its soft time: floats, traps nothing
        this.wob = 0;                   // a cork or gear just bounced off it (drawing only)
    }
    get r() { return this.held != null ? 11 : this.type === BType.King ? 26 : this.type !== BType.Plain ? 9 : 8; }
}

export class Fruit extends PopBody {
    constructor() { super(); this.kind = 0; this.life = 0; this.age = 0; this.alive = false; this.points = 500; }
}

// the head of a fizz flood: a 12 x 8 walker that runs the shelves; its trail is the flood
export class Flood extends PopBody {
    constructor() { super(); this.w = 12; this.h = 8; this.trail = []; this.t = 0; this.sampleT = 0; this.done = false; this.alive = true; this.swept = 0; }
}

const NoInput = new CabinetInput();

export class SpritePopSim {
    constructor() {
        // ------------------------------------------------------------------ the machine (not knobs)
        this.cubSpeed = f32(72);
        this.walkBase = f32(41.6); this.flyBase = f32(39);         // creature px/s before the speed knob and the stage pace
        this.hopBase = f32(58); this.corkerBase = f32(34); this.wispBase = f32(27); this.bounceBase = f32(48); this.kingBase = f32(30);
        this.blowCooldown = f32(0.28);
        this.maxBubbles = 10;                                        // blowing one more pops the oldest empty one
        this.shotSpeed = f32(240); this.shotTime = f32(0.4); this.shotOffset = f32(10);
        this.riseEmpty = f32(24); this.riseTrapped = f32(18); this.riseSpecial = f32(17); this.emptyLife = f32(9); this.specialLife = f32(15); this.topCurrent = f32(16);
        this.softTime = f32(1.2);                                    // after the shot, a bubble can still trap for this long; then it hardens
        this.popReach = f32(18);
        this.hitBox = f32(8); this.hitBoxY = f32(7);                 // centre distance (x, y) at which a free creature gets the cub
        this.chainWindow = f32(1);
        this.popPoints = 100; this.letterPoints = 200; this.sweepPoints = 500; this.zapPoints = 500; this.kingHitPoints = 300; this.kingPoints = 10000;
        this.readySeconds = f32(3.4); this.scrollSeconds = f32(1.1); this.ouchSeconds = f32(2.7); this.cardSeconds = f32(5); this.clearSeconds = f32(3);
        this.guardSeconds = f32(2.5); this.hurryBanner = f32(2.2); this.bannerSeconds = f32(2.4);
        this.floodSpeed = f32(120); this.floodLife = f32(4.5); this.boltSpeed = f32(210); this.boltTurn = f32(3.6);
        this.corkSpeed = f32(118); this.corkAim = f32(0.6); this.gearSpeed = f32(60);
        this.hopCrouch = f32(0.35); this.bounceV = f32(255);
        this.alarmSpeed0 = f32(26); this.alarmAccel = f32(2.5); this.alarmMax = f32(64); this.alarmWarn = f32(2);

        // ------------------------------------------------------------------ knobs (resolved per credit)
        this.speedMul = 0; this.catchRadius = 0; this.kingHits = 0; this.trapSeconds = 0; this.angryMul = 0; this.chaseMul = 0;
        this.jumpChance = 0; this.hurrySeconds = 0; this.alarmDelay = 0; this.fruitSeconds = 0; this.startLives = 0;
        this.extraLifeAt = 0; this.extraLifeEvery = 0; this.warmup = 0;

        // ------------------------------------------------------------------ read-only state
        this.stage = 1; this.stageDef = STAGES[0];
        this.level = SpritePopLevel.get(0); this.prevLevel = null;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.playTime = 0;              // this stage's play clock
        this.hurryClock = 0; this.hurryAt = 0; this.chaseNow = 0;
        this.readyLen = 0; this.introAt = 0;
        this.credit = null;
        this.isDemo = false;
        this.cub = new PopBody();
        this.cubFromX = 0; this.cubFromY = 0;
        this.guard = 0; this.blowAnim = 0; this.cool = 0;
        this.hurry = false; this.hurryT = 0;
        this.alarm = { on: false, warn: false, x: 0, y: 0, vx: 0, vy: 0, speed: 0, anim: 0 };
        this.clearing = false; this.clearT = 0; this.clearAt = 0;
        this.deathX = 0; this.deathY = 0; this.deathBy = '';
        this.chainNow = 0; this.lastPopT = 0;
        this.creatures = []; this.bubbles = []; this.fruits = []; this.floods = []; this.bolts = []; this.shots = [];
        this.popups = []; this.bursts = []; this.parts = [];
        this.king = null;
        this.letters = 0; this.lettersFlash = 0;
        this.banner = ''; this.bannerT = 0;
        this.shake = 0;
        this.tally = null; this.tallyLen = 0;
        this.extraNext = 0;
        this.stageDeaths = 0; this.stagesCleared = 0;
        this.popped = 0; this.fruitTaken = 0; this.deaths = 0; this.escapes = 0; this.trapped = 0;
        this.blown = 0; this.maxChain = 0; this.chains = 0; this.swept = 0; this.zapped = 0;
        this.lettersGot = 0; this.words = 0; this.extraLives = 0; this.alarms = 0; this.kingHitsTaken = 0;

        // the sound's view (sound.js): recordEvents on, the sim pushes { kind, ... } here
        this.recordEvents = false; this.events = [];

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0; this._bubbleIds = 0; this._ids = 0; this._spray = 0;
        this._time = 0; this._jumpBuf = 0; this._arriveT = 0;
        this._fizzT = 0; this._sparkT = 0; this._letterT = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get round() { return this.stage; }
    get roundWon() { return this._result === RoundResult.Won; }
    get stageCount() { return STAGES.length; }
    get isBoss() { return this.stageDef.boss; }

    get creaturesLeft() {
        let n = 0;
        for (const c of this.creatures) if (c.state !== CState.Gone) n++;
        return n;
    }

    get onScreen() {
        let n = 0;
        for (const c of this.creatures) if (c.state === CState.Free || c.state === CState.Trapped) n++;
        return n;
    }

    get minionsOut() {
        let n = 0;
        for (const c of this.creatures) if (c.minion && (c.state === CState.Free || c.state === CState.Trapped)) n++;
        return n;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Ouch: case Phase.Tally: return CabinetState.Interlude;
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

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's stage ' + this.stage + '/' + STAGES.length + ' ' + this.level.name.toLowerCase() +
            ': popped ' + this.popped + ' fruit ' + this.fruitTaken + ' deaths ' + this.deaths + ' extra ' + this.extraLives + ' escapes ' + this.escapes +
            ' swept ' + this.swept + ' zapped ' + this.zapped + ' best chain ' + this.maxChain + (this.king != null ? ' king ' + this.king.hp + '/' + this.king.maxHp : '');
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.speedMul = k.get('creatureSpeed');
        this.catchRadius = k.get('catchRadius');
        this.kingHits = Math.max(1, roundEven(k.get('kingHits')));
        this.trapSeconds = k.get('trapSeconds');
        this.angryMul = k.get('angryMul');
        this.chaseMul = k.get('chase');
        this.jumpChance = k.get('jumpChance');
        this.hurrySeconds = k.get('hurrySeconds');
        this.alarmDelay = k.get('alarmDelay');
        this.fruitSeconds = k.get('fruitSeconds');
        this.startLives = Math.max(1, roundEven(k.get('lives')));
        this.extraLifeAt = roundEven(k.get('extraLifeAt'));
        this.extraLifeEvery = Math.max(1000, roundEven(k.get('extraLifeEvery')));
        this.warmup = k.get('warmup');
        let first = Math.max(1, Math.min(STAGES.length, roundEven(k.get('startStage'))));
        if (this.isDemo) first = 2 + ((seed >>> 3) % (STAGES.length - 1));     // the attract demo shows a later floor

        this._score = 0; this._lives = this.startLives; this._time = 0; this._jumpBuf = 0; this._bubbleIds = 0; this._ids = 0; this._spray = 0;
        this.popped = this.fruitTaken = this.deaths = this.escapes = this.trapped = this.blown = this.maxChain = this.chains = 0;
        this.swept = this.zapped = this.lettersGot = this.words = this.extraLives = this.alarms = this.kingHitsTaken = this.stagesCleared = 0;
        this.letters = 0; this.lettersFlash = 0; this.banner = ''; this.bannerT = 0; this.shake = 0;
        this.extraNext = this.extraLifeAt;
        this.events.length = 0;
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this._placeCub();
        this._startStage(first, true);
    }

    _placeCub() {
        const c = this.cub;
        c.x = CubStartX; c.y = CubStartY; c.vx = 0; c.vy = 0;
        c.grounded = true; c.face = 1; c.anim = 0;
        this.cool = 0; this.blowAnim = 0;
    }

    // a stage: its screen, its creatures (the first few on the screen at the bell, wind-ups on stand
    // spots, spread out, fliers in the open air; the rest wait above the ceiling and drop in through
    // the gap one at a time), its specials' clocks; then the READY card (and the scroll from the last)
    _startStage(n, first) {
        const S = this.stageDef = STAGES[n - 1];
        const rng = this._rng;
        this.stage = n;
        this.prevLevel = first ? null : this.level;
        const L = this.level = SpritePopLevel.get(S.layout);
        this.creatures.length = 0; this.bubbles.length = 0; this.fruits.length = 0; this.floods.length = 0; this.bolts.length = 0; this.shots.length = 0;
        this.popups.length = 0; this.bursts.length = 0; this.parts.length = 0;
        this.playTime = 0; this.hurryClock = 0; this.hurry = false; this.hurryT = 0;
        this.alarm.on = false; this.alarm.warn = false;
        this.clearing = false; this.clearT = 0; this.clearAt = 0;
        this.stageDeaths = 0; this.tally = null;
        this.chainNow = 0; this.lastPopT = f32(-99);
        this.hurryAt = f32(this.hurrySeconds * S.hurry);
        this.chaseNow = Math.min(1, f32(S.chase * this.chaseMul));
        this.cubFromX = this.cub.x; this.cubFromY = this.cub.y;
        this._placeCub();
        this.guard = 0;

        const kinds = S.roster.slice();
        for (let i = kinds.length - 1; i > 0; i--) { const j = rng.next(i + 1); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
        const startN = Math.min(kinds.length, S.start);
        if (S.feature >= 0 && startN > 0) {
            // the new creature the card promises is among the first out
            const at = kinds.indexOf(S.feature);
            if (at >= startN) { const j = rng.next(startN); const t = kinds[at]; kinds[at] = kinds[j]; kinds[j] = t; }
        }
        const spots = L.creatureSpots();
        for (let i = spots.length - 1; i > 0; i--) { const j = rng.next(i + 1); const t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
        const taken = [];
        for (let i = 0; i < kinds.length; i++) {
            const c = new Creature();
            c.id = this._ids++; c.kind = kinds[i]; c.state = i < startN ? CState.Free : CState.Waiting;
            c.think = f32(f32(0.3) + f32(f32(rng.nextDouble()) * f32(0.6)));
            c.face = rng.next(2) === 0 ? -1 : 1; c.fy = rng.next(2) === 0 ? -1 : 1;
            c.fadeT = this._range(f32(3), f32(5)); c.cool = this._range(f32(1), f32(2.5));
            this.creatures.push(c);
            if (i >= startN) continue;
            if (SpritePopSim.flies(c.kind)) {
                const row = (i % 2 === 0) ? 3 + rng.next(2) : 6 + rng.next(2);
                c.homeX = f32((4 + rng.next(11)) * Tile); c.homeY = f32(row * Tile);
            } else {
                let pick = -1;
                for (const nn of spots) {
                    if (taken.includes(nn) || L.nodeRow(nn) === SpritePopLevel.FloorRow) continue;
                    let near = false;
                    for (const t of taken)
                        if (L.nodeRow(t) === L.nodeRow(nn) && Math.abs(L.nodeCol(t) - L.nodeCol(nn)) < 4) { near = true; break; }
                    if (!near) { pick = nn; break; }
                }
                if (pick < 0) for (const nn of spots) if (!taken.includes(nn)) { pick = nn; break; }
                taken.push(pick);
                c.homeX = f32(L.nodeCol(pick) * Tile);
                c.homeY = f32(L.nodeRow(pick) * Tile - c.h);
                c.face = c.homeX < 152 ? 1 : -1;
            }
            c.x = c.homeX; c.y = f32(-40); c.grounded = false; c.vx = 0; c.vy = 0;
        }
        this.king = null;
        if (S.boss) {
            const k = this.king = new TinKing();
            k.hp = k.maxHp = this.kingHits;
            k.x = k.homeX; k.y = f32(-60);
        }
        this._arriveT = 0;
        this._fizzT = S.fizz != null ? f32(S.fizz.first) : 0;
        this._sparkT = S.spark != null ? f32(S.spark.first) : 0;
        this._letterT = S.letters ? this._range(f32(4), f32(7)) : 0;
        this.p = Phase.Ready; this.phaseTime = 0;
        this.introAt = first ? 0 : this.scrollSeconds;
        this.readyLen = f32(this.readySeconds + this.introAt);
        this._cues.emit(SoundCue.Tick);
        this._emit('stage', { n, boss: S.boss, first });
    }

    static flies(kind) { return kind === Kind.Whistler || kind === Kind.Wisp; }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (!(dt > 0)) return;
        if (input == null) input = NoInput;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        this._ageEffects(dt);

        switch (this.p) {
            case Phase.Ready:
                this._dropIn();
                if (this.phaseTime >= this.readyLen) {
                    for (const c of this.creatures)
                        if (c.state === CState.Free) { c.x = c.homeX; c.y = c.homeY; c.grounded = !SpritePopSim.flies(c.kind); }
                    if (this.king != null) { this.king.x = this.king.homeX; this.king.y = this.king.homeY; }
                    this.p = Phase.Play; this.phaseTime = 0;
                    this._cues.emit(SoundCue.Start);
                }
                break;
            case Phase.Play:
                this._playStep(dt, input);
                break;
            case Phase.Ouch:
                if (this.phaseTime >= this.ouchSeconds) {
                    if (this._lives > 0) {
                        this._placeCub(); this.guard = this.guardSeconds; this.p = Phase.Play; this.phaseTime = 0; this._jumpBuf = 0;
                        this._emit('respawn', {});
                    }
                    else this._enterCard(RoundResult.Lost);
                }
                break;
            case Phase.Tally:
                this._tallyStep();
                if (this.phaseTime >= this.tallyLen) {
                    if (this.stage >= STAGES.length) this._enterCard(RoundResult.Won);
                    else this._startStage(this.stage + 1, false);
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // the drop-in: each creature (and the king) falls from above the ceiling to its spot, staggered,
    // once the new screen has scrolled up
    _dropIn() {
        const t0 = f32(this.phaseTime - this.introAt);
        for (let i = 0; i < this.creatures.length; i++) {
            const c = this.creatures[i];
            if (c.state !== CState.Free) continue;
            let k = f32(f32(f32(t0 - f32(0.15)) - f32(i * f32(0.12))) / f32(1.1));
            if (k < 0) k = 0; else if (k > 1) k = 1;
            const e = f32(k * k);                                   // falls, accelerating
            c.x = c.homeX;
            c.y = f32(f32(-40) + f32(f32(c.homeY + 40) * e));
        }
        if (this.king != null) {
            let k = f32(f32(t0 - f32(0.3)) / f32(1.6));
            if (k < 0) k = 0; else if (k > 1) k = 1;
            this.king.x = this.king.homeX;
            this.king.y = f32(f32(-60) + f32(f32(this.king.homeY + 60) * f32(k * k)));
        }
    }

    _enterCard(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    _ageEffects(dt) {
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.t = f32(p.t + dt); p.y = f32(p.y - f32(18 * dt));
            if (p.t > (p.style >= 3 ? f32(1.6) : 1)) this.popups.splice(i, 1);
        }
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.t = f32(b.t + dt);
            if (b.t > f32(0.35)) this.bursts.splice(i, 1);
        }
        let w = 0;
        for (let i = 0; i < this.parts.length; i++) {
            const q = this.parts[i];
            q.t = f32(q.t + dt);
            if (q.t >= q.life) continue;
            q.vy = f32(q.vy + f32(300 * dt));
            q.x = f32(q.x + f32(q.vx * dt)); q.y = f32(q.y + f32(q.vy * dt));
            this.parts[w++] = q;
        }
        this.parts.length = w;
        if (this.hurry) this.hurryT = f32(this.hurryT + dt);
        if (this.bannerT < this.bannerSeconds) this.bannerT = f32(this.bannerT + dt);
        if (this.lettersFlash > 0) this.lettersFlash = f32(this.lettersFlash - dt);
        if (this.shake > 0) this.shake = f32(this.shake - dt);
    }

    // ------------------------------------------------------------------ play
    _playStep(dt, input) {
        const S = this.stageDef;
        this.playTime = f32(this.playTime + dt);
        if (!this.clearing) this.hurryClock = f32(this.hurryClock + dt);
        if (!S.boss && !this.clearing) {
            if (!this.hurry && this.hurryClock >= this.hurryAt) {
                this.hurry = true; this.hurryT = 0;
                if (!this.mercyActive) for (const c of this.creatures) if (c.state !== CState.Gone) c.angry = true;
                this._cues.emit(SoundCue.Tick);
                this._emit('hurry', {});
            }
            if (this.hurry && !this.mercyActive && !this.alarm.on) {
                const at = f32(this.hurryAt + this.alarmDelay);
                if (!this.alarm.warn && this.hurryClock >= f32(at - this.alarmWarn)) { this.alarm.warn = true; this._emit('alarmWarn', {}); }
                if (this.hurryClock >= at) this._alarmIn();
            }
        }

        this._arrivals(dt);
        this._specials(dt);
        this._updateCub(dt, input);
        for (const c of this.creatures) if (c.state === CState.Free) this._updateCreature(c, dt);
        if (this.king != null) kingStep(this, this.king, dt);
        this._updateBubbles(dt);
        this._updateFloods(dt);
        this._updateBolts(dt);
        this._updateShots(dt);
        if (this.p !== Phase.Play) return;                           // a cork or a gear got the cub
        this._updateFruit(dt);
        this._updateAlarm(dt);

        // a free creature, the king or the alarm on the cub: a life
        if (this.guard <= 0 && !this.mercyActive) {
            const cub = this.cub;
            for (const c of this.creatures)
                if (c.state === CState.Free && !c.faded && Math.abs(f32(c.cx - cub.cx)) < this.hitBox && Math.abs(f32(c.cy - cub.cy)) < this.hitBoxY) {
                    this._die(c.angry ? 'angry' : 'creature');
                    return;
                }
            const k = this.king;
            if (k != null && k.vulnerable) {
                const dx = f32(k.cx - cub.cx), dy = f32(k.cy - cub.cy);
                if (f32(f32(dx * dx) + f32(dy * dy)) < f32(19 * 19)) { this._die('king'); return; }
            }
            const a = this.alarm;
            if (a.on && Math.abs(f32(f32(a.x + 8) - cub.cx)) < 10 && Math.abs(f32(f32(a.y + 8) - cub.cy)) < 10) { this._die('alarm'); return; }
        }

        const done = S.boss ? this.king.state === KState.Gone && this.creaturesLeft === 0 : this.creaturesLeft === 0;
        if (!this.clearing && done) {
            this.clearing = true; this.clearT = 0; this.clearAt = this.playTime;
            if (this.alarm.on) this.bursts.push({ x: f32(this.alarm.x + 8), y: f32(this.alarm.y + 8), t: 0, big: true });
            this.alarm.on = false; this.alarm.warn = false; this.shots.length = 0;
            this._emit('allPopped', { x: this.cub.cx, y: this.cub.cy });
        }
        if (this.clearing) {
            this.clearT = f32(this.clearT + dt);
            if (this.clearT >= this.clearSeconds) this._enterTally();
        }
    }

    // the next creature drops in through the ceiling gap
    _arrivals(dt) {
        if (this.clearing) return;
        this._arriveT = f32(this._arriveT + dt);
        const S = this.stageDef;
        const on = this.onScreen;
        if (on >= S.maxOn) { this._arriveT = Math.min(this._arriveT, f32(S.gap * f32(0.5))); return; }
        if (this._arriveT < S.gap) return;                          // a steady clock: an empty screen is a lull (grab the fruit)
        const L = this.level;
        for (const c of this.creatures) {
            if (c.state !== CState.Waiting) continue;
            c.state = CState.Free;
            const a = f32(f32(this._rng.nextDouble()) * (L.gapR - L.gapL + 1));
            c.x = f32(f32(f32(L.gapL + a) * Tile) - f32(c.w * 0.5));
            c.x = clamp(c.x, f32(L.gapL * Tile), f32((L.gapR + 1) * Tile - c.w));
            c.y = f32(-c.h); c.vx = 0; c.vy = f32(60); c.grounded = false; c.jumping = false; c.edgeState = 0;
            c.fy = 1; c.think = f32(0.8); c.angry = this.hurry && !this.mercyActive; c.act = 0;
            if (SpritePopSim.flies(c.kind)) c.y = f32(SpritePopLevel.CeilingY);
            this._emit('arrive', { x: c.cx, kind: c.kind });
            this._arriveT = 0;
            return;
        }
    }

    // the special bubbles the stage sends up from the floor: fizz, sparks, the letters
    _specials(dt) {
        if (this.clearing) return;
        const S = this.stageDef;
        if (S.fizz != null) {
            this._fizzT = f32(this._fizzT - dt);
            if (this._fizzT <= 0) { this._fizzT = f32(S.fizz.every); if (this._countType(BType.Fizz) < 1 && this.creaturesLeft > 0) this._spawnSpecial(BType.Fizz, 0); }
        }
        if (S.spark != null) {
            this._sparkT = f32(this._sparkT - dt);
            if (this._sparkT <= 0) {
                this._sparkT = f32(S.spark.every);
                const want = S.boss ? this.king != null && this.king.vulnerable : this.creaturesLeft > 0;
                if (want && this._countType(BType.Spark) < S.spark.cap) this._spawnSpecial(BType.Spark, 0);
            }
        }
        if (S.letters && this.lettersFlash <= 0) {
            this._letterT = f32(this._letterT - dt);
            if (this._letterT <= 0) {
                this._letterT = this._range(f32(11), f32(15));
                if (this._countType(BType.Letter) < 1) {
                    // one of the letters still missing
                    const miss = [];
                    for (let i = 0; i < Word.length; i++) if ((this.letters & (1 << i)) === 0) miss.push(i);
                    if (miss.length > 0) this._spawnSpecial(BType.Letter, miss[this._rng.next(miss.length)]);
                }
            }
        }
    }

    _countType(t) { let n = 0; for (const b of this.bubbles) if (b.alive && b.type === t) n++; return n; }

    _spawnSpecial(type, letter) {
        const b = new Bubble();
        b.id = this._bubbleIds++; b.type = type; b.letter = letter; b.alive = true; b.life = this.specialLife; b.face = 1;
        b.x = f32(f32(InnerL + 24) + this._range(0, f32(InnerR - InnerL - 48)));
        b.y = f32(FloorY + 6);
        this.bubbles.push(b);
        this._emit('rise', { type, x: b.x });
    }

    _addScore(pts) {
        this._score += pts;
        while (this._score >= this.extraNext) {
            this._lives++; this.extraLives++;
            this.extraNext += this.extraLifeEvery;
            this.banner = 'EXTRA LIFE'; this.bannerT = 0;
            this.popups.push({ x: this.cub.cx, y: f32(this.cub.y - 6), t: 0, text: '1UP', chain: 0, style: 4 });
            this._emit('oneUp', { word: false });
        }
    }

    _die(by) {
        this._lives--; this.deaths++; this.stageDeaths++;
        this.deathX = this.cub.x; this.deathY = this.cub.y; this.deathBy = by;
        this._cues.emit(SoundCue.Die);
        this._emit('die', { by, x: this.cub.cx, y: this.cub.cy });
        this.p = Phase.Ouch; this.phaseTime = 0;
        this.shots.length = 0;
        if (this.alarm.on) this.bursts.push({ x: f32(this.alarm.x + 8), y: f32(this.alarm.y + 8), t: 0, big: true });
        this.alarm.on = false; this.alarm.warn = false;
        if (this.hurry) {
            // a lost life calls the hurry (and the alarm) off for a while
            this.hurry = false;
            this.hurryClock = f32(Math.max(0, f32(this.hurryAt - 20)));
            for (const c of this.creatures) c.angry = c.mad;
        }
        this.shake = f32(0.25);
    }

    _updateCub(dt, input) {
        const cub = this.cub;
        const l = input.held(Pad.Left), r = input.held(Pad.Right);
        const mx = l && !r ? -1 : r && !l ? 1 : 0;
        cub.vx = f32(mx * this.cubSpeed);
        if (mx !== 0) cub.face = mx;
        if (input.pressed(Pad.Up) || input.pressed(Pad.B)) this._jumpBuf = f32(0.15);
        if (this._jumpBuf > 0 && cub.grounded) {
            cub.vy = -JumpV; cub.grounded = false; this._jumpBuf = 0;
            this._emit('jump', {});
        }
        this._jumpBuf = f32(this._jumpBuf - dt);
        this._move(cub, dt);
        if (cub.grounded && mx !== 0) cub.anim = f32(cub.anim + dt); else if (cub.grounded) cub.anim = 0; else cub.anim = f32(cub.anim + dt);
        if (this.cool > 0) this.cool = f32(this.cool - dt);
        if (this.guard > 0) this.guard = f32(this.guard - dt);
        if (this.blowAnim > 0) this.blowAnim = f32(this.blowAnim - dt);
        if (input.pressed(Pad.A) && this.cool <= 0) this._blow();
    }

    _plainBubbles() { let n = 0; for (const b of this.bubbles) if (b.alive && b.type === BType.Plain) n++; return n; }

    _blow() {
        if (this._plainBubbles() >= this.maxBubbles) {
            // the oldest empty bubble makes room (it just pops)
            let oldest = null;
            for (const o of this.bubbles) if (o.alive && o.type === BType.Plain && o.held == null && (oldest == null || o.age > oldest.age)) oldest = o;
            if (oldest == null) return;
            this._pop(oldest, false, false);
        }
        const cub = this.cub;
        const b = new Bubble();
        b.id = this._bubbleIds++; b.face = cub.face; b.alive = true; b.life = this.emptyLife;
        b.x = f32(cub.cx + f32(cub.face * this.shotOffset)); b.y = f32(cub.cy - 1);
        b.x = clamp(b.x, f32(InnerL + 8), f32(InnerR - 8));
        this.bubbles.push(b);
        this.cool = this.blowCooldown; this.blowAnim = f32(0.2); this.blown++;
        // a wind-up (or a corker) in the bubble's path on its own platform may see it coming and hop
        const dodge = this.mercyActive ? 0 : this.stageDef.dodge;
        for (const c of this.creatures) {
            if (c.state !== CState.Free || (c.kind !== Kind.WindUp && c.kind !== Kind.Corker) || !c.grounded || c.act !== 0) continue;
            const ahead = f32(f32(c.cx - b.x) * b.face);
            if (ahead < 12 || ahead > 64 || Math.abs(f32(c.cy - b.y)) > 12) continue;
            if (this._chance(f32(dodge * (c.angry ? f32(1.3) : 1)))) this._hop(c);
        }
        this._cues.emit(SoundCue.Tick);
        this._emit('blow', { x: b.x, y: b.y });
    }

    // ------------------------------------------------------------------ physics
    // Moves a walker: walls left/right, one-way platforms (land from above only), the ceiling
    // (solid from below except over the gap) and the top/bottom wrap through the gaps.
    // Returns hitWall.
    _move(b, dt) {
        const L = this.level;
        let hitWall = false;
        b.x = f32(b.x + f32(b.vx * dt));
        if (b.x < InnerL) { b.x = f32(InnerL); hitWall = true; }
        if (b.x > InnerR - b.w) { b.x = f32(InnerR - b.w); hitWall = true; }

        if (b.grounded) {
            const row = roundEven(f32(b.feet / Tile));
            if (L.solidSpan(f32(b.x + Shrink), f32(f32(b.x + b.w) - Shrink), row)) { b.vy = 0; b.y = f32(row * Tile - b.h); return hitWall; }
            b.grounded = false; b.vy = 0;
        }
        b.vy = f32(b.vy + f32(Gravity * dt));
        if (b.vy > MaxFall) b.vy = MaxFall;
        const prevFeet = b.feet, prevTop = b.y;
        b.y = f32(b.y + f32(b.vy * dt));
        if (b.vy >= 0) {
            const r0 = Math.ceil(f32(f32(prevFeet / Tile) - f32(1e-3))), r1 = Math.floor(f32(b.feet / Tile));
            for (let r = Math.max(1, r0); r <= r1 && r < SpritePopLevel.Rows; r++)
                if (L.solidSpan(f32(b.x + Shrink), f32(f32(b.x + b.w) - Shrink), r)) {
                    b.y = f32(r * Tile - b.h); b.vy = 0; b.grounded = true;
                    break;
                }
        } else if (b.y < SpritePopLevel.CeilingY && prevTop >= f32(SpritePopLevel.CeilingY - f32(0.01)) && L.ceilingSpan(f32(b.x + 2), f32(f32(b.x + b.w) - 2))) {
            b.y = f32(SpritePopLevel.CeilingY); b.vy = 0;
        }
        // the wrap: out of the bottom gap, back in through the ceiling gap (and the other way)
        if (b.y >= SpritePopLevel.FH) {
            b.y = f32(b.y - (SpritePopLevel.FH + b.h));
            b.x = clamp(b.x, f32(L.gapL * Tile), f32((L.gapR + 1) * Tile - b.w));
        } else if (f32(b.y + b.h) < 0) {
            b.y = f32(b.y + (SpritePopLevel.FH + b.h));
            b.x = clamp(b.x, f32(L.gapL * Tile), f32((L.gapR + 1) * Tile - b.w));
        }
        return hitWall;
    }

    // ------------------------------------------------------------------ creatures
    _creatureSpeed(c) {
        let b;
        switch (c.kind) {
            case Kind.Whistler: b = this.flyBase; break;
            case Kind.Hopper: b = this.hopBase; break;
            case Kind.Corker: b = this.corkerBase; break;
            case Kind.Wisp: b = this.wispBase; break;
            case Kind.Bouncer: b = this.bounceBase; break;
            default: b = this.walkBase;
        }
        const warm = this.warmup > 0 ? f32(f32(0.7) + f32(f32(0.3) * Math.min(1, f32(this.playTime / this.warmup)))) : 1;   // they start slow and wind up
        const pace = c.minion ? 1 : this.stageDef.pace;
        const sleepy = this.mercyActive && this.hurry ? f32(0.5) : 1;                                    // the mercy credit: a hurry slows them
        return f32(f32(f32(f32(f32(b * this.speedMul) * pace) * warm) * (c.angry ? this.angryMul : 1)) * sleepy);
    }

    _updateCreature(c, dt) {
        c.anim = f32(c.anim + dt);
        if (c.squash > 0) c.squash = f32(c.squash - dt);
        const sp = this._creatureSpeed(c);
        switch (c.kind) {
            case Kind.Whistler: this._fly(c, sp, dt); return;
            case Kind.Wisp: this._wisp(c, sp, dt); return;
            case Kind.Hopper: this._hopper(c, sp, dt); return;
            case Kind.Bouncer: this._bouncer(c, sp, dt); return;
            case Kind.Corker: if (this._corker(c, sp, dt)) return; break;
        }
        this._walk(c, sp, dt);
    }

    // a wind-up (and a corker between shots): walk, turn at walls, decide at edges, jump up
    _walk(c, sp, dt) {
        if (c.grounded) {
            c.jumping = false;
            c.think = f32(c.think - dt);
            if (c.think <= 0) {
                c.think = f32(this._range(f32(0.8), f32(1.6)) * (c.angry ? f32(0.7) : 1));
                this._decide(c);
            }
            if (c.grounded) {
                // an edge ahead? decide once per edge: over it, or turn back
                const row = roundEven(f32(c.feet / Tile));
                const probe = c.face > 0 ? f32(f32(f32(c.x + c.w) - Shrink) + 1) : f32(f32(c.x + Shrink) - 1);
                const ground = this.level.solid(SpritePopLevel.colOf(probe), row);
                if (ground) c.edgeState = 0;
                else {
                    if (c.edgeState === 0) {
                        let p;
                        const cub = this.cub;
                        if (this.mercyActive) p = f32(0.5);
                        else if (cub.feet > f32(c.feet + 8)) p = Math.sign(f32(cub.cx - c.cx)) === c.face ? f32(0.9) : f32(0.5);
                        else p = f32(0.2);
                        c.edgeState = this._chance(p) ? 1 : 2;
                    }
                    if (c.edgeState === 2) { c.face = -c.face; c.edgeState = 0; }
                }
                c.vx = f32(c.face * sp);
            }
        } else if (c.jumping) c.vx = 0;
        else c.vx = f32(c.face * sp);

        if (this._move(c, dt)) c.face = -c.face;
    }

    _decide(c) {
        const col = SpritePopLevel.colOf(c.cx), row = roundEven(f32(c.feet / Tile));
        const canJump = this.level.jumpLanding(col, row) >= 0;
        if (this.mercyActive) {
            // the mercy credit: they drift about and never hunt
            if (this._chance(0.35)) c.face = -c.face;
            if (canJump && this._chance(0.12)) this._jumpUp(c);
            return;
        }
        const cub = this.cub, chase = this.chaseNow;
        const dx = f32(cub.cx - c.cx), dy = f32(cub.feet - c.feet);
        const toward = dx >= 0 ? 1 : -1;
        if (Math.abs(dy) < 10) { if (this._chance(chase)) c.face = toward; else if (this._chance(0.3)) c.face = -c.face; }
        else if (dy < 0) {
            if (canJump && this._chance(this.jumpChance)) this._jumpUp(c);
            else if (this._chance(f32(chase * f32(0.5)))) c.face = toward;
        }
        else if (this._chance(chase)) c.face = toward;
        else if (this._chance(0.3)) c.face = -c.face;
    }

    _hop(c) {
        c.vy = f32(-JumpV * f32(0.8)); c.grounded = false; c.jumping = false; c.edgeState = 0;
    }

    _jumpUp(c) {
        c.vy = -JumpV; c.vx = 0; c.grounded = false; c.jumping = true;
        c.x = clamp(f32(SpritePopLevel.colCenter(SpritePopLevel.colOf(c.cx)) - f32(c.w * 0.5)), f32(InnerL), f32(InnerR - c.w));
    }

    _fly(c, sp, dt) {
        c.think = f32(c.think - dt);
        if (c.think <= 0) {
            c.think = f32(this._range(f32(1.4), f32(2.6)) * (c.angry ? f32(0.75) : 1));
            const cub = this.cub;
            if (!this.mercyActive && this._chance(this.chaseNow)) { c.face = cub.cx >= c.cx ? 1 : -1; c.fy = cub.cy >= c.cy ? 1 : -1; }
            else if (this._chance(0.3)) c.fy = -c.fy;
        }
        c.x = f32(c.x + f32(f32(c.face * sp) * dt));
        c.y = f32(c.y + f32(f32(f32(c.fy * sp) * f32(0.75)) * dt));
        if (c.x < InnerL) { c.x = f32(InnerL); c.face = 1; }
        if (c.x > InnerR - c.w) { c.x = f32(InnerR - c.w); c.face = -1; }
        if (c.y < SpritePopLevel.CeilingY) { c.y = f32(SpritePopLevel.CeilingY); c.fy = 1; }
        const floor = f32(FloorY - c.h);
        if (c.y > floor) { c.y = floor; c.fy = -1; }
    }

    // a hopper rests, crouches (the tell), then leaps three rows the way it faces
    _hopper(c, sp, dt) {
        const air = !c.grounded;
        if (c.grounded) {
            c.vx = 0;
            if (c.act === 0) {
                c.think = f32(c.think - dt);
                if (c.think <= 0) {
                    const cub = this.cub;
                    if (!this.mercyActive && this._chance(this.chaseNow)) c.face = cub.cx >= c.cx ? 1 : -1;
                    else if (this._chance(0.35)) c.face = -c.face;
                    c.act = 1; c.actT = f32(this.hopCrouch * (c.angry ? f32(0.7) : 1));
                }
            } else if (c.act === 1) {
                c.actT = f32(c.actT - dt);
                if (c.actT <= 0) {
                    const high = !this.mercyActive && this.cub.feet < f32(c.feet - 8);
                    c.vy = f32(-JumpV * (high ? 1 : f32(0.82))); c.grounded = false; c.act = 2;
                    this._emit('hop', { x: c.cx, y: c.cy });
                }
            } else c.act = 0;
        }
        if (c.act === 2 && !c.grounded) c.vx = f32(c.face * sp);
        if (this._move(c, dt)) c.face = -c.face;
        if (air && c.grounded) { c.act = 0; c.think = f32(this._range(f32(0.55), f32(1.1)) * (c.angry ? f32(0.6) : 1)); }
    }

    // a corker walks like a wind-up; level with the cub it stops, puffs (the tell) and spits a cork
    // along the row. Returns true while it stands puffing.
    _corker(c, sp, dt) {
        if (c.cool > 0) c.cool = f32(c.cool - dt);
        if (c.act === 1) {
            c.vx = 0; c.actT = f32(c.actT - dt);
            if (c.actT <= 0) {
                c.act = 0; c.cool = f32(this._range(f32(2.4), f32(3.4)) * (c.angry ? f32(0.7) : 1));
                const v = f32(this.corkSpeed * (c.angry ? f32(1.2) : 1));
                this.shots.push({ kind: ShotKind.Cork, x: f32(c.cx + f32(c.face * 9)), y: f32(c.cy + 1), vx: f32(c.face * v), vy: 0, r: 3, t: 0, alive: true });
                this._emit('spit', { x: c.cx, y: c.cy });
            }
            this._move(c, dt);
            return true;
        }
        if (!this.mercyActive && c.grounded && c.cool <= 0) {
            const cub = this.cub;
            const dy = f32(cub.feet - c.feet), dx = f32(cub.cx - c.cx);
            if (Math.abs(dy) < 4 && Math.abs(dx) > 26 && Math.abs(dx) < 180) {
                c.face = dx > 0 ? 1 : -1; c.act = 1; c.actT = f32(this.corkAim * (c.angry ? f32(0.75) : 1)); c.vx = 0;
                this._emit('aim', { x: c.cx, y: c.cy });
                return true;
            }
        }
        return false;
    }

    // a wisp drifts at the cub (or a whim) through everything, and thins out now and then
    _wisp(c, sp, dt) {
        c.fadeT = f32(c.fadeT - dt);
        if (c.fadeT <= 0) {
            c.faded = !c.faded;
            c.fadeT = c.faded ? f32(1.3) : this._range(f32(3.5), f32(5.5));
        }
        c.think = f32(c.think - dt);
        if (c.think <= 0) {
            c.think = this._range(f32(0.5), f32(1.0));
            const cub = this.cub;
            if (!this.mercyActive && this._chance(Math.min(1, f32(this.chaseNow + f32(0.25))))) { c.tx = cub.cx; c.ty = cub.cy; }
            else { c.tx = f32(f32(InnerL + 16) + this._range(0, f32(InnerR - InnerL - 32))); c.ty = f32(f32(SpritePopLevel.CeilingY + 16) + this._range(0, 140)); }
        }
        const dx = f32(c.tx - c.cx), dy = f32(c.ty - c.cy);
        const d = Math.max(1, f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy)))));
        const k = Math.min(1, f32(dt * f32(1.8)));
        c.vx = f32(c.vx + f32(f32(f32(f32(dx / d) * sp) - c.vx) * k));
        c.vy = f32(c.vy + f32(f32(f32(f32(dy / d) * sp) - c.vy) * k));
        c.x = f32(c.x + f32(c.vx * dt));
        c.y = f32(c.y + f32(f32(c.vy + f32(f32(Math.sin(f32(f32(c.anim * f32(2.6)) + c.id))) * 8)) * dt));
        if (c.x < InnerL) c.x = f32(InnerL);
        if (c.x > InnerR - c.w) c.x = f32(InnerR - c.w);
        if (c.y < SpritePopLevel.CeilingY) c.y = f32(SpritePopLevel.CeilingY);
        if (c.y > FloorY - c.h) c.y = f32(FloorY - c.h);
        if (Math.abs(c.vx) > 2) c.face = c.vx > 0 ? 1 : -1;
    }

    // a bouncer never stops: it bounces off every platform top and turns at the walls
    _bouncer(c, sp, dt) {
        c.vx = f32(c.face * sp);
        if (this._move(c, dt)) c.face = -c.face;
        if (c.grounded) {
            c.act = 1 - c.act;                                      // a high bounce, then a lower one
            c.vy = f32(-this.bounceV * (c.act === 1 ? 1 : f32(0.88))); c.grounded = false; c.squash = f32(0.12);
            if (!this.mercyActive && this._chance(f32(this.chaseNow * f32(0.5)))) c.face = this.cub.cx >= c.cx ? 1 : -1;
        }
    }

    // the king winds a little wind-up out of his belly
    _spawnMinion(k) {
        const c = new Creature();
        c.id = this._ids++; c.kind = Kind.WindUp; c.minion = true; c.state = CState.Free;
        c.x = clamp(f32(k.cx - 8), f32(InnerL), f32(InnerR - 16)); c.y = f32(f32(k.y + k.h) - 16);
        c.vx = 0; c.vy = f32(-140); c.grounded = false; c.face = this._rng.next(2) === 0 ? -1 : 1; c.think = f32(0.6);
        this.creatures.push(c);
        this._emit('minion', { x: c.cx, y: c.cy });
    }

    // ------------------------------------------------------------------ bubbles
    _updateBubbles(dt) {
        const top0 = f32(SpritePopLevel.CeilingY);
        const L = this.level, cub = this.cub, k = this.king;
        for (let i = 0; i < this.bubbles.length; i++) {
            const b = this.bubbles[i];
            if (!b.alive) continue;
            b.age = f32(b.age + dt);
            if (b.wob > 0) b.wob = f32(b.wob - dt);
            if (b.type === BType.Plain && b.held == null && !b.hard && b.age >= f32(this.shotTime + this.softTime)) b.hard = true;
            if (b.popIn > 0) {
                b.popIn = f32(b.popIn - dt);
                if (b.popIn <= 0) { this._pop(b, true, false); continue; }
            }
            const r = b.r;
            if (b.type === BType.King) {
                // the king's bubble: up under the ceiling, and it waits for a touch
                if (b.y > 72) b.y = f32(b.y - f32(14 * dt));
                b.x = f32(b.x + f32(f32(Math.sin(f32(b.age * f32(1.3))) * 6) * dt));
                b.x = clamp(b.x, f32(InnerL + r), f32(InnerR - r));
                if (k != null) { k.x = f32(b.x - 20); k.y = f32(b.y - 20); }
                const dx = f32(cub.cx - b.x), dy = f32(cub.cy - b.y), reach = f32(r + 8);
                if (b.age > f32(0.6) && f32(f32(dx * dx) + f32(dy * dy)) < f32(reach * reach)) this._pop(b, true, false);
                continue;
            }
            if (b.type === BType.Plain && b.held == null && b.age < this.shotTime) {
                b.x = f32(b.x + f32(f32(f32(b.face * this.shotSpeed) * f32(1 - f32(b.age / this.shotTime))) * dt));
            } else {
                const rise = b.held != null ? this.riseTrapped : b.type !== BType.Plain ? this.riseSpecial : this.riseEmpty;
                b.y = f32(b.y - f32(rise * dt));
                b.x = f32(b.x + f32(f32(f32(Math.sin(f32(f32(b.age * f32(3.1)) + b.id))) * 7) * dt));
                if (b.y <= f32(top0 + r)) {
                    b.y = f32(top0 + r);
                    const col = SpritePopLevel.colOf(b.x);
                    const drift = L.topDrift[col];
                    if (drift === 0) {
                        // settle over the middle of a reachable column's run, nudged apart by neighbours
                        for (const o of this.bubbles) {
                            if (o === b || !o.alive || o.type === BType.King || o.y > f32(f32(top0 + o.r) + 1)) continue;
                            const d = f32(b.x - o.x), need = f32(f32(r + o.r) - 2);
                            if (Math.abs(d) < need) {
                                const push = f32(f32((d >= 0 ? 1 : -1) * 10) * dt);
                                const nx = f32(b.x + push);
                                if (L.topReach[SpritePopLevel.colOf(nx)]) b.x = nx;
                            }
                        }
                    }
                    else b.x = f32(b.x + f32(f32(drift * this.topCurrent) * dt));
                }
            }
            b.x = clamp(b.x, f32(InnerL + r), f32(InnerR - r));

            if (b.held != null) {
                b.trapLeft = f32(b.trapLeft - dt);
                if (b.trapLeft <= 0) { this._release(b); continue; }
                b.held.x = f32(b.x - f32(b.held.w * 0.5)); b.held.y = f32(b.y - f32(b.held.h * 0.5));
                const dx = f32(cub.cx - b.x), dy = f32(cub.cy - b.y);
                if (f32(f32(dx * dx) + f32(dy * dy)) < f32(this.popReach * this.popReach)) this._pop(b, true, false);
                continue;
            }
            b.life = f32(b.life - dt);
            if (b.life <= 0) { this._pop(b, false, true); continue; }
            if (b.type !== BType.Plain) {
                // a special: touch it and it goes off
                const dx = f32(cub.cx - b.x), dy = f32(cub.cy - b.y);
                if (b.age > f32(0.25) && f32(f32(dx * dx) + f32(dy * dy)) < f32(this.popReach * this.popReach)) this._pop(b, true, false);
                continue;
            }
            if (k != null && k.vulnerable) {
                // a plain bubble just plinks off the tin
                const dx = f32(k.cx - b.x), dy = f32(k.cy - b.y), reach = f32(r + 16);
                if (f32(f32(dx * dx) + f32(dy * dy)) < f32(reach * reach)) { this._pop(b, false, false); this._emit('plink', { x: b.x, y: b.y }); continue; }
            }
            if (!b.hard) {
                const cr2 = f32(this.catchRadius * this.catchRadius);
                for (const c of this.creatures) {
                    if (c.state !== CState.Free || c.faded) continue;
                    const dx = f32(c.cx - b.x), dy = f32(c.cy - b.y);
                    if (f32(f32(dx * dx) + f32(dy * dy)) < cr2) { this._trapIn(b, c); break; }
                }
            } else {
                // a hardened bubble is just a bubble: touch it and it pops, and so do its neighbours
                const dx = f32(cub.cx - b.x), dy = f32(cub.cy - b.y), reach = f32(this.popReach - 2);
                if (f32(f32(dx * dx) + f32(dy * dy)) < f32(reach * reach)) this._pop(b, true, false);
            }
        }
        removeDead(this.bubbles);
    }

    _trapIn(b, c) {
        b.held = c; b.trapLeft = this.trapSeconds; b.trapTotal = this.trapSeconds; b.life = 0;
        c.state = CState.Trapped; c.vx = 0; c.vy = 0; c.grounded = false; c.jumping = false; c.edgeState = 0; c.act = 0; c.faded = false;
        b.x = clamp(b.x, f32(InnerL + 11), f32(InnerR - 11));
        this.trapped++;
        this._cues.emit(SoundCue.Hit);
        this._emit('trap', { x: b.x, y: b.y, kind: c.kind, angry: c.angry });
    }

    _release(b) {
        const c = b.held;
        b.alive = false; b.held = null;
        c.state = CState.Free; c.angry = !this.mercyActive; c.mad = c.angry;
        c.x = clamp(f32(b.x - f32(c.w * 0.5)), f32(InnerL), f32(InnerR - c.w));
        c.y = f32(b.y - f32(c.h * 0.5));
        c.vx = 0; c.vy = 0; c.grounded = false; c.jumping = false; c.think = f32(0.4); c.edgeState = 0; c.act = 0;
        if (c.kind === Kind.Whistler) c.fy = 1;
        this.escapes++;
        this.bursts.push({ x: b.x, y: b.y, t: 0, big: false });
        this._cues.emit(SoundCue.Miss);
        this._emit('escape', { x: b.x, y: b.y, kind: c.kind });
    }

    // a bubble goes: a trapped creature becomes fruit (the chain), a special goes off; `spread` pops
    // the bubbles touching it 0.1 s later; `quiet` is a bubble that just ran out of time
    _pop(b, spread, quiet) {
        if (!b.alive) return;
        b.alive = false;
        this.bursts.push({ x: b.x, y: b.y, t: 0, big: b.held != null || b.type !== BType.Plain });
        if (b.held != null) {
            const c = b.held;
            b.held = null;
            c.state = CState.Gone;
            this.chainNow = f32(this._time - this.lastPopT) <= this.chainWindow && this.chainNow > 0 ? this.chainNow + 1 : 1;
            this.lastPopT = this._time;
            const pts = this.popPoints * this.chainNow;
            this._addScore(pts); this.popped++;
            if (this.chainNow > this.maxChain) this.maxChain = this.chainNow;
            if (this.chainNow >= 2) this.chains++;
            this.popups.push({ x: b.x, y: f32(b.y - 6), t: 0, text: String(pts), chain: this.chainNow, style: this.chainNow >= 2 ? 2 : 0 });
            this._dropFruit(b.x, b.y, this._range(f32(-55), f32(55)));
            this._sprayFx(b.x, b.y, 8, f32(70), Fx.Pop);
            if (this.chainNow >= 3) this.shake = Math.max(this.shake, f32(0.15));
            this._cues.emit(SoundCue.Bonus);
            this._emit('pop', { x: b.x, y: b.y, chain: this.chainNow, kind: c.kind, angry: c.angry });
        } else if (quiet) this._emit('fizzle', { x: b.x, y: b.y, type: b.type });
        else switch (b.type) {
            case BType.Fizz: this._flood(b); break;
            case BType.Spark: this._bolt(b); break;
            case BType.Letter: this._letter(b); break;
            case BType.King: this._kingPop(b); break;
            default: this._emit('popEmpty', { x: b.x, y: b.y });
        }
        if (!spread) return;
        for (const o of this.bubbles) {
            if (!o.alive || o === b || o.popIn > 0 || o.type === BType.King) continue;
            const dx = f32(o.x - b.x), dy = f32(o.y - b.y), reach = f32(f32(b.r + o.r) + 4);
            if (f32(f32(dx * dx) + f32(dy * dy)) < f32(reach * reach)) o.popIn = f32(0.1);
        }
    }

    _dropFruit(x, y, vx) {
        const f = new Fruit();
        f.kind = (this.stage - 1) + this.popped; f.alive = true; f.life = this.fruitSeconds;
        f.points = 400 + 100 * this.stage;
        f.x = clamp(f32(x - 8), f32(InnerL), f32(InnerR - 16)); f.y = f32(y - 8);
        f.vx = vx; f.vy = f32(-170);
        this.fruits.push(f);
    }

    // particles: a fixed fan with a turning offset (no dice: they are only looks)
    _sprayFx(x, y, n, speed, set) {
        const turn = this._spray++ * 0.7;
        for (let i = 0; i < n; i++) {
            const a = turn + i * (Math.PI * 2 / n);
            const v = f32(speed * f32(0.6 + 0.4 * ((i * 7 + this._spray) % 5) / 4));
            this.parts.push({ x, y, vx: f32(Math.cos(a) * v), vy: f32(f32(Math.sin(a) * v) - 40), t: 0, life: f32(0.45 + 0.05 * (i % 4)), set });
        }
        if (this.parts.length > 160) this.parts.splice(0, this.parts.length - 160);
    }

    // ------------------------------------------------------------------ the specials
    _flood(b) {
        const f = new Flood();
        f.face = this.cub.face;
        f.x = f32(b.x - 6); f.y = f32(b.y - 4); f.vx = f32(f.face * this.floodSpeed); f.vy = 0;
        this.floods.push(f);
        this._sprayFx(b.x, b.y, 10, f32(80), Fx.Fizz);
        this._emit('fizz', { x: b.x, y: b.y });
    }

    _updateFloods(dt) {
        for (const f of this.floods) {
            if (!f.alive) continue;
            f.sampleT = f32(f.sampleT + dt);
            const sample = f.sampleT >= f32(1 / 30);
            if (sample) f.sampleT = 0;
            if (!f.done) {
                f.t = f32(f.t + dt);
                f.vx = f32(f.face * this.floodSpeed);
                const py = f.y;
                if (this._move(f, dt)) f.face = -f.face;
                if (f.y < f32(py - 40) || f.t > this.floodLife) f.done = true;      // out of the floor gap (or spent): it drains
                else if (sample) { f.trail.push({ x: f.cx, y: f.cy }); if (f.trail.length > 16) f.trail.shift(); }
            } else if (sample) {
                f.trail.shift();
                if (f.trail.length === 0) { f.alive = false; continue; }
            }
            // everything it touches is swept away
            for (const c of this.creatures) {
                if (c.state !== CState.Free || c.faded) continue;
                for (let i = f.trail.length - 1; i >= 0; i -= 2) {
                    const q = f.trail[i];
                    if (Math.abs(f32(c.cx - q.x)) < 12 && Math.abs(f32(c.cy - q.y)) < 12) { this._sweep(f, c); break; }
                }
            }
        }
        removeDead(this.floods);
    }

    _sweep(f, c) {
        c.state = CState.Gone;
        f.swept++; this.swept++; this.popped++;
        const pts = Math.min(4000, this.sweepPoints * (1 << Math.min(3, f.swept - 1)));
        this._addScore(pts);
        this.popups.push({ x: c.cx, y: f32(c.y - 4), t: 0, text: String(pts), chain: 0, style: 2 });
        this._dropFruit(c.cx, c.cy, f32(f.face * 40));
        this._sprayFx(c.cx, c.cy, 8, f32(70), Fx.Fizz);
        this._emit('sweep', { x: c.cx, y: c.cy, n: f.swept });
    }

    _bolt(b) {
        const homing = this.king != null;
        const face = this.cub.face;
        this.bolts.push({ x: b.x, y: b.y, vx: f32(face * this.boltSpeed), vy: 0, t: 0, alive: true, zapped: 0, homing });
        this._sprayFx(b.x, b.y, 8, f32(90), Fx.Spark);
        this._emit('spark', { x: b.x, y: b.y });
    }

    _updateBolts(dt) {
        const k = this.king;
        for (const o of this.bolts) {
            if (!o.alive) continue;
            o.t = f32(o.t + dt);
            if (o.homing && k != null && k.vulnerable) {
                // drawn to tin: the bolt turns toward the king, a few radians a second
                let a = Math.atan2(o.vy, o.vx);
                let want = Math.atan2(f32(k.cy - o.y), f32(k.cx - o.x)) - a;
                while (want > Math.PI) want -= Math.PI * 2;
                while (want < -Math.PI) want += Math.PI * 2;
                const turn = f32(this.boltTurn * dt);
                a += want > turn ? turn : want < -turn ? -turn : want;
                o.vx = f32(Math.cos(a) * this.boltSpeed); o.vy = f32(Math.sin(a) * this.boltSpeed);
            }
            o.x = f32(o.x + f32(o.vx * dt)); o.y = f32(o.y + f32(o.vy * dt));
            if (!o.homing) { if (o.x < InnerL || o.x > InnerR) { o.alive = false; continue; } }
            else {
                if (o.x < f32(InnerL + 4)) { o.x = f32(InnerL + 4); o.vx = Math.abs(o.vx); }
                if (o.x > f32(InnerR - 4)) { o.x = f32(InnerR - 4); o.vx = -Math.abs(o.vx); }
                if (o.y < f32(SpritePopLevel.CeilingY + 4)) { o.y = f32(SpritePopLevel.CeilingY + 4); o.vy = Math.abs(o.vy); }
                if (o.y > f32(FloorY - 4)) { o.y = f32(FloorY - 4); o.vy = -Math.abs(o.vy); }
                if (o.t > f32(3.5) || k == null || !k.vulnerable) { o.alive = false; continue; }
            }
            for (const c of this.creatures) {
                if (c.state !== CState.Free || c.faded) continue;
                if (Math.abs(f32(c.cx - o.x)) < 10 && Math.abs(f32(c.cy - o.y)) < 12) this._zap(o, c);
            }
            if (k != null && k.vulnerable) {
                const dx = f32(k.cx - o.x), dy = f32(k.cy - o.y);
                if (f32(f32(dx * dx) + f32(dy * dy)) < f32(20 * 20)) { o.alive = false; this._kingHit(k, o); }
            }
        }
        removeDead(this.bolts);
    }

    _zap(o, c) {
        c.state = CState.Gone;
        o.zapped++; this.zapped++; this.popped++;
        const pts = this.zapPoints * o.zapped;
        this._addScore(pts);
        this.popups.push({ x: c.cx, y: f32(c.y - 4), t: 0, text: String(pts), chain: 0, style: 2 });
        this._dropFruit(c.cx, c.cy, f32(Math.sign(o.vx) * 30));
        this._sprayFx(c.cx, c.cy, 8, f32(80), Fx.Spark);
        this._emit('zap', { x: c.cx, y: c.cy, n: o.zapped });
    }

    _letter(b) {
        this.letters |= 1 << b.letter; this.lettersGot++;
        this._addScore(this.letterPoints);
        this.popups.push({ x: b.x, y: f32(b.y - 6), t: 0, text: Word[b.letter], chain: 0, style: 3 });
        this._sprayFx(b.x, b.y, 8, f32(70), Fx.Letter);
        this._emit('letter', { i: b.letter, x: b.x, y: b.y });
        if (this.letters === AllLetters) {
            this.letters = 0; this.words++; this._lives++; this.extraLives++;
            this.lettersFlash = f32(2.5);
            this.banner = Word + '  EXTRA LIFE'; this.bannerT = 0;
            this._emit('oneUp', { word: true });
        }
    }

    // ------------------------------------------------------------------ the king's end
    _kingHit(k, o) {
        k.hp--; k.flash = f32(0.3); this.kingHitsTaken++;
        this._addScore(this.kingHitPoints);
        this.popups.push({ x: k.cx, y: f32(k.y - 4), t: 0, text: String(this.kingHitPoints), chain: 0, style: 0 });
        this._sprayFx(o.x, o.y, 10, f32(100), Fx.King);
        this.shake = Math.max(this.shake, f32(0.18));
        this._emit('kingHit', { hp: k.hp, x: k.cx, y: k.cy });
        if (!k.rage && k.hp > 0 && k.hp * 2 <= k.maxHp) {
            k.rage = true;
            this.banner = 'THE KING IS ANGRY'; this.bannerT = 0;
            this._emit('kingRage', {});
        }
        if (k.hp <= 0) this._kingTrap(k);
    }

    // wound down: the king in a giant bubble, and every little wind-up bubbled with him
    _kingTrap(k) {
        k.state = KState.Trapped;
        const b = new Bubble();
        b.id = this._bubbleIds++; b.type = BType.King; b.alive = true; b.x = k.cx; b.y = k.cy; b.life = f32(999);
        this.bubbles.push(b);
        for (const c of this.creatures) {
            if (c.state !== CState.Free) continue;
            const m = new Bubble();
            m.id = this._bubbleIds++; m.alive = true; m.x = c.cx; m.y = c.cy; m.face = 1;
            this.bubbles.push(m);
            this._trapIn(m, c);
        }
        for (const o of this.bubbles) if (o.held != null) { o.trapLeft = f32(999); o.trapTotal = f32(999); }
        this.shots.length = 0; this.bolts.length = 0;
        this.banner = 'POP THE KING'; this.bannerT = 0;
        this.shake = Math.max(this.shake, f32(0.4));
        this._emit('kingTrap', { x: k.cx, y: k.cy });
    }

    _kingPop(b) {
        const k = this.king;
        k.state = KState.Gone;
        this._addScore(this.kingPoints);
        this.popups.push({ x: b.x, y: f32(b.y - 10), t: 0, text: String(this.kingPoints), chain: 0, style: 4 });
        // everything left bursts with him, and the treats rain down
        for (const o of this.bubbles) if (o.alive && o.held != null) o.popIn = f32(0.15);
        for (let i = 0; i < 8; i++) this._dropFruit(f32(f32(InnerL + 24) + f32(i * 34)), f32(b.y + 10), f32((i % 2 === 0 ? -1 : 1) * 20));
        this._sprayFx(b.x, b.y, 16, f32(140), Fx.King);
        this._sprayFx(b.x, b.y, 12, f32(90), Fx.Spark);
        this.shake = Math.max(this.shake, f32(0.6));
        this._emit('kingPop', { x: b.x, y: b.y });
    }

    // ------------------------------------------------------------------ corks, gears, the alarm
    _updateShots(dt) {
        const cub = this.cub;
        for (const s of this.shots) {
            if (!s.alive) continue;
            s.t = f32(s.t + dt);
            s.x = f32(s.x + f32(s.vx * dt)); s.y = f32(s.y + f32(s.vy * dt));
            if (s.x < f32(InnerL - 4) || s.x > f32(InnerR + 4) || s.y < f32(SpritePopLevel.CeilingY - 4) || s.y > f32(FloorY + 4)) { s.alive = false; continue; }
            for (const b of this.bubbles) {
                if (!b.alive || b.type === BType.King) continue;
                const dx = f32(b.x - s.x), dy = f32(b.y - s.y), reach = f32(b.r + s.r);
                if (f32(f32(dx * dx) + f32(dy * dy)) < f32(reach * reach)) {
                    // a bubble stops it: an empty one pops, a full one only wobbles
                    s.alive = false;
                    if (b.type === BType.Plain && b.held == null) this._pop(b, false, false); else b.wob = f32(0.3);
                    this._sprayFx(s.x, s.y, 5, f32(50), s.kind === ShotKind.Gear ? Fx.King : Fx.Fruit);
                    this._emit('block', { x: s.x, y: s.y, kind: s.kind });
                    break;
                }
            }
            if (!s.alive) continue;
            if (this.guard <= 0 && !this.mercyActive && Math.abs(f32(s.x - cub.cx)) < f32(5 + s.r) && Math.abs(f32(s.y - cub.cy)) < f32(6 + s.r)) {
                this._die(s.kind === ShotKind.Gear ? 'gear' : 'cork');
                return;
            }
        }
        removeDead(this.shots);
    }

    _alarmIn() {
        const a = this.alarm;
        a.on = true; a.warn = false; a.x = f32(144); a.y = f32(-16); a.vx = 0; a.vy = 0; a.speed = this.alarmSpeed0; a.anim = 0;
        this.alarms++;
        this.banner = 'THE ALARM'; this.bannerT = 0;
        this._emit('alarm', {});
    }

    _updateAlarm(dt) {
        const a = this.alarm;
        if (!a.on) return;
        a.anim = f32(a.anim + dt);
        a.speed = Math.min(this.alarmMax, f32(a.speed + f32(this.alarmAccel * dt)));
        const dx = f32(this.cub.cx - f32(a.x + 8)), dy = f32(this.cub.cy - f32(a.y + 8));
        const d = Math.max(1, f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy)))));
        a.vx = f32(f32(dx / d) * a.speed); a.vy = f32(f32(dy / d) * a.speed);
        a.x = f32(a.x + f32(a.vx * dt)); a.y = f32(a.y + f32(a.vy * dt));
    }

    // ------------------------------------------------------------------ fruit
    _updateFruit(dt) {
        const cub = this.cub;
        for (const f of this.fruits) {
            if (!f.alive) continue;
            f.age = f32(f.age + dt); f.life = f32(f.life - dt);
            if (f.life <= 0) { f.alive = false; continue; }
            if (f.grounded) f.vx = 0;
            if (this._move(f, dt)) f.vx = f32(-f.vx * f32(0.5));
            if (f.age > f32(0.3) && Math.abs(f32(f.cx - cub.cx)) < 14 && Math.abs(f32(f.cy - cub.cy)) < 14) {
                f.alive = false; this.fruitTaken++;
                this._addScore(f.points);
                this.popups.push({ x: f.cx, y: f32(f.y - 4), t: 0, text: String(f.points), chain: 0, style: 1 });
                this._sprayFx(f.cx, f.cy, 6, f32(60), Fx.Fruit);
                this._cues.emit(SoundCue.Bonus);
                this._emit('fruit', { x: f.cx, y: f.cy, points: f.points });
            }
        }
        removeDead(this.fruits);
    }

    // ------------------------------------------------------------------ the tally
    _enterTally() {
        const S = this.stageDef, n = this.stage;
        const lines = [['STAGE ' + n + ' BONUS', 1000 * n]];
        if (!S.boss) {
            const t = this.clearAt;
            lines.push(['TIME BONUS', t < 30 ? 3000 : t < 45 ? 2000 : t < 60 ? 1000 : 0]);
        } else lines.push(['LIVES  ' + this._lives + ' X 5000', 5000 * this._lives]);
        lines.push(['NO MISS', this.stageDeaths === 0 ? 2000 : 0]);
        let total = 0;
        for (const l of lines) total += l[1];
        this.tally = { lines, shown: 0, total, start: this._score };
        this.stagesCleared++;
        this.p = Phase.Tally; this.phaseTime = 0;
        this.tallyLen = f32(f32(1.0 + lines.length * 0.55) + f32(1.5));
        this._emit('stageClear', { n, boss: S.boss });
    }

    _tallyStep() {
        const T = this.tally;
        while (T.shown < T.lines.length && this.phaseTime >= f32(0.8 + T.shown * 0.55)) {
            const v = T.lines[T.shown][1];
            this._addScore(v);
            this._emit('tally', { i: T.shown, v });
            T.shown++;
        }
    }

    // ------------------------------------------------------------------ helpers
    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    _chance(p) { return this._rng.nextDouble() < p; }
    _range(a, b) { return f32(a + f32(f32(b - a) * f32(this._rng.nextDouble()))); }

    collectStats(into) {
        add(into, 'stages', this.stagesCleared);
        add(into, 'popped', this.popped);
        add(into, 'trapped', this.trapped);
        add(into, 'escapes', this.escapes);
        add(into, 'deaths', this.deaths);
        add(into, 'fruit', this.fruitTaken);
        add(into, 'bubbles', this.blown);
        add(into, 'chains', this.chains);
        add(into, 'maxChain', this.maxChain);
        add(into, 'swept', this.swept);
        add(into, 'zapped', this.zapped);
        add(into, 'letters', this.lettersGot);
        add(into, 'extraLives', this.extraLives);
        add(into, 'alarms', this.alarms);
        add(into, 'kingHits', this.kingHitsTaken);
        add(into, 'reachedKing', this.king != null ? 1 : 0);
    }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function add(d, k, v) { d[k] = (d[k] || 0) + v; }
// List<T>.RemoveAll(x => !x.alive), in place
function removeDead(list) {
    let w = 0;
    for (let i = 0; i < list.length; i++) if (list[i].alive) list[w++] = list[i];
    list.length = w;
}

SpritePopSim.Phase = Phase;
SpritePopSim.CState = CState;
SpritePopSim.Kind = Kind;
SpritePopSim.BType = BType;
SpritePopSim.ShotKind = ShotKind;
SpritePopSim.Fx = Fx;
SpritePopSim.KState = KState;
SpritePopSim.Gravity = Gravity;
SpritePopSim.JumpV = JumpV;
SpritePopSim.MaxFall = MaxFall;
SpritePopSim.Shrink = Shrink;
SpritePopSim.CubStartX = CubStartX;
SpritePopSim.CubStartY = CubStartY;
SpritePopSim.FloorY = FloorY;
