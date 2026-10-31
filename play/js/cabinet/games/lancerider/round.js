// THE NODE · world 1 · LANCE RIDER (Anvil & Sparks, 1982) on the Cabinet Engine · THE ROUND.
// Began as the port of LanceRiderSim.cs (one wave to a coin); built out 2026-10-18 into SEVEN WAVES,
// the last of them the PIT BEAST. The waves are data (stages.js); the beast is beast.js.
//
// A Joust. Floating stone ledges over a lava floor; the field wraps left/right. You ride a great
// bird: the stick thrusts left/right (momentum, air drag), button A flaps (one lift impulse per
// PRESS; gravity pulls down). Rivals ride the same physics in three tiers: BOUNDER, HUNTER,
// SHADOW LORD (faster, quicker to react, keener to get above you).
//
//   THE JOUST   when two riders meet, the HIGHER lance wins (feet compared; within 3 px = both
//               bounce; a rival must be loseBand px higher to unhorse the player, between = bounce).
//               A rival that loses bursts into an EGG that falls to a ledge; the player
//               that loses is unhorsed (a life).
//   EGGS        collect one by walking or flying into it: 250, 500, 750, 1000 (the chain; it
//               resets when you die). An egg left alone hatches (8 s) into a new rival one tier up
//               (bounder > hunter > shadow lord). An egg that falls in the lava is gone.
//   THE LAVA    touching it burns you. From wave 3 a HAND rises out of it under any rider skimming
//               low over the pits (the lava boils where it will come up first); flap hard (5
//               presses) to tear free, or it drags you under.
//   THE HAWK    linger on a wave (hawkAt seconds) and the CINDER HAWK comes for you: a chevron at
//               the edge of the field at your height (1.1 s, it follows you until the last 0.6 s),
//               then it streaks straight across. Get out of its line, or meet it head-on with your
//               lance level with its beak (5 px) and it is yours (1500, and it is gone for the wave).
//   THE WAVES   1 THE LISTS (bounders), 2 THE CLUTCH (an egg wave), 3 THE PIT HAND (hunters, the
//               hand, SURVIVAL), 4 FALLING STONE (ledges crack and fall), 5 GLADIATORS (pairs),
//               6 THE SHADOW HOST (shadow lords, the hawk early), 7 THE PIT BEAST (strike its
//               crown from above). A wave is clear when every rival is gone and every egg taken or
//               lost (the beast: when it dies). Each clear is TALLIED (wave bonus 500 x the wave +
//               its own bonus). Clearing wave 7 WINS the game; the last life lost loses it.
//   SCORE       bounder 500, hunter 750, shadow lord 1000, a hatchling on foot its tier's value,
//               egg 250 + chain, a pair both unhorsed 1000, the hawk 1500, a blow on the beast
//               1000, the beast slain 10000 + 2000 a rider left. 3 riders; an EXTRA RIDER at
//               10000 and every 20000 after.
//
// MERCY (Core): knob rivalAltitude = 0.9 x0.9 per lost round scales every rival's target
// altitude AND its ceiling (it will not flap above that share of the field), so the average
// altitude drops 10% a loss and the top band belongs to the player; hawkLinger and beastHP ease
// too (spec.js). On the UNLOSABLE credit (5) rivals can never fly above the player and the player
// cannot lose: a lost joust is a bounce, the lava throws him back up, the hand will not take him,
// the hawk passes through, the beast's fire and hide throw him clear.
//
// Coordinates: X = world px 0..FIELD_W (wraps; the renderer puts world 0 at screen x 8), Y = SCREEN
// px, down, and a rider's Y is its FEET. Heights (above the lava) are LAVA_Y - Y.
import { f32, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, SystemRandom, Pad } from '../../sdk/index.js';
import { STAGES } from './stages.js';
import { PitBeast, BeastState } from './beast.js';

// ---------------------------------------------------------------- the field
export const FIELD_W = 304;
export const LAVA_Y = f32(218);          // the lava surface (screen y)
export const CEILING_FEET = f32(46);     // highest a rider's feet can be (sprite top at 30)
export const HAND_LINE = f32(195);       // feet below this, over a pit, airborne = skimming
export const HAND_HEIGHT = f32(32);      // how far the hand reaches above the lava
export const BASE_TOP = f32(200);

export const RIDER_HALF_W = f32(8), RIDER_H = f32(14), FOOT_HALF_W = f32(5);   // the 18x16 sprite's body
export const EGG_HALF_W = f32(4), EGG_H = f32(10);                            // the 8x10 egg

export const TIER_SPEED = [f32(66), f32(82), f32(98)];          // max air speed px/s
export const TIER_THINK = [f32(0.50), f32(0.34), f32(0.22)];    // seconds between decisions
export const TIER_FLAP_RATE = [f32(3.8), f32(4.6), f32(5.6)];   // max flaps a second
export const TIER_MARGIN = [f32(2), f32(10), f32(16)];          // px it aims above you
export const TIER_CHASE = [f32(0.45), f32(0.75), f32(0.95)];    // chance a decision hunts you
export const TIER_EVADE = [f32(0.20), f32(0.55), f32(0.80)];    // chance it breaks away to climb when you are above it
export const TIER_SCORE = [500, 750, 1000];
export const TIER_NAME = ['BOUNDER', 'HUNTER', 'SHADOW LORD'];
export const STAGE_COUNT = STAGES.length;

export const RiderMode = Object.freeze({ Spawning: 0, Flying: 1, Hatchling: 2, Grabbed: 3, Gone: 4 });
export const HandState = Object.freeze({ Idle: 0, Warn: 1, Rising: 2, Holding: 3, Sinking: 4 });
export const HawkState = Object.freeze({ Off: 0, Warn: 1, Pass: 2, Slain: 3 });
export const Phase = Object.freeze({ Idle: 0, Intro: 1, Playing: 2, Dying: 3, Tally: 4, Card: 5, Over: 6 });
export const Fx = Object.freeze({
    FleeingBird: 0, Unhorse: 1, LavaSplash: 2, EggSparkle: 3, Popup: 4, EggSizzle: 5, Debris: 6, Feather: 7, Spark: 8, Blast: 9,
});

const MAX_SUB = f32(1 / 60);
const MAX_FX = 90;

// ---------------------------------------------------------------- helpers (world-wrap, ledge overlap)
export function wrap(x) {
    while (x < 0) x = f32(x + FIELD_W);
    while (x >= FIELD_W) x = f32(x - FIELD_W);
    return x;
}

export function wrapDx(dx) {
    while (dx > FIELD_W * 0.5) dx = f32(dx - FIELD_W);
    while (dx < -FIELD_W * 0.5) dx = f32(dx + FIELD_W);
    return dx;
}

// box (feet y, half width, height) vs a ledge, trying the wrap shifts; returns the shift used, or NaN
function overlaps(x, y, halfW, height, L) {
    for (let k = -1; k <= 1; k++) {
        const s = k * FIELD_W;
        if (f32(x + halfW) <= f32(L.x0 + s) || f32(x - halfW) >= f32(L.x1 + s)) continue;
        if (y <= L.top + 0.001 || f32(y - height) >= L.bottom) continue;
        return s;
    }
    return NaN;
}

function onLedgeX(L, x, halfW) {
    for (let k = -1; k <= 1; k++) {
        const s = k * FIELD_W;
        if (f32(x + halfW) > f32(L.x0 + s) && f32(x - halfW) < f32(L.x1 + s)) return true;
    }
    return false;
}

export function supported(ledges, x, y, halfW) {
    for (const L of ledges) {
        if (L.gone || Math.abs(y - L.top) > 0.6) continue;
        if (onLedgeX(L, x, halfW)) return true;
    }
    return false;
}

// a stage's stone, fresh for the wave (crumbling ledges carry their own state)
function buildLedges(st) {
    const out = [];
    if (st.base) out.push({ x0: f32(st.base[0]), x1: f32(st.base[1]), top: BASE_TOP, bottom: f32(LAVA_Y + 20), isBase: true, crumbleAt: 0, crack: 0, gone: false });
    for (const [x0, x1, top, at] of st.ledges)
        out.push({ x0: f32(x0), x1: f32(x1), top: f32(top), bottom: f32(top + 6), isBase: false, crumbleAt: at || 0, crack: 0, cracking: false, gone: false });
    return out;
}

// ---------------------------------------------------------------- entities
class Rider {
    constructor() {
        this.id = 0;
        this.isPlayer = false;
        this.tier = 0;                       // 0 bounder, 1 hunter, 2 shadow lord; -1 = the player
        this.pair = 0;                       // GLADIATORS: riders of one pair share an id (0 = none)
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;   // x centre (world, wraps), y feet (screen, down)
        this.facing = 1;
        this.grounded = false;
        this.mode = RiderMode.Spawning;
        this.modeT = 0;                      // seconds in this mode
        this.sinceFlap = f32(9);             // for the 2-frame flap
        this.skim = 0;                       // seconds skimming low over the lava pits
        this.bounceCool = 0;
        this.runT = 0;                       // leg cycle while running on a ledge
        this.revealT = 0;                    // seconds since it began to materialise (the renderer's reveal)
        this.grabFlaps = 0;                  // flaps while the hand has him
        this.wardT = 9;                      // seconds since the mercy credit last saved him (the renderer's ward ring)
        // the rival's brain (sim-owned; rolls the sim's dice)
        this.thinkT = 0; this.aimX = 0; this.aimH = 0; this.flapCool = 0; this.groundT = 0;
        this.chasing = false;
    }

    get height() { return f32(LAVA_Y - this.y); }
    get active() { return this.mode !== RiderMode.Gone; }
}

class Egg {
    constructor() {
        this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
        this.grounded = false;
        this.age = 0;
        this.hatchAt = 8;                    // seconds (of age) it hatches at
        this.tier = 0;                       // what laid it (the colour of its burst)
        this.hatchTier = 1;                  // what hatches out of it
        this.alive = true;
    }
}

export class LanceRiderRound {
    constructor() {
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.player = null;
        this.rivals = [];
        this.eggs = [];
        this.effects = [];
        this.queue = [];              // { tier, pair } still to ride in
        this.credit = null;
        this.isDemo = false;          // set by the attract loop before reset: the demo starts on a later wave
        this.recordEvents = false; this.events = [];   // the sound's events (sound.js), only while a host listens

        // the wave
        this.stageIdx = 0; this.stage = STAGES[0];
        this.ledges = []; this.base = null;
        this.stageT = 0;              // seconds of play on this wave (the hawk's clock and the stone's)
        this.stageKills = 0; this.stageEggs = 0; this.stageDeaths = 0; this.stageHatched = 0; this.stagePairs = 0;
        this.tally = []; this.tallyShown = 0; this.tallySeconds = 3;
        this.stagesCleared = 0;
        this.pairKills = new Map();   // pair id -> riders of it unhorsed by the player

        this.chain = 0;
        this.altitude = 1;            // the mercy knob, resolved
        this.hatchSeconds = 8;
        this.deathCause = '';
        this.kills = 0; this.eggsTaken = 0; this.eggsLost = 0; this.deaths = 0; this.hatched = 0;

        this.hand = HandState.Idle; this.handX = 0; this.handReach = 0; this.handVictim = null;
        this.hawk = { state: HawkState.Off, x: 0, y: 0, dir: 1, t: 0, cool: 0, struck: false, passes: 0 };
        this.beast = null; this.addsDone = 0;

        // juice the renderer reads
        this.shakeAmp = 0; this.shakeT = 0;
        this.extraT = 9;              // seconds since the last EXTRA RIDER
        this.lastPopup = 0;

        // ---------------------------------------------------------------- the machine (not mercy knobs)
        this.gravity = f32(250); this.flapImpulse = f32(90); this.maxRise = f32(150); this.maxFall = f32(170);
        this.airThrust = f32(170); this.airDrag = f32(0.6); this.flapKick = f32(14);
        this.groundThrust = f32(240); this.groundFriction = f32(260); this.maxRun = f32(70);
        this.playerMaxVX = f32(105);
        this.tieBand = f32(3); this.loseBand = f32(3);
        this.eggGrace = f32(0.45); this.eggKnock = f32(55);
        this.approachRange = f32(70); this.levelBand = f32(10);
        this.introSeconds = f32(3.0); this.dyingSeconds = f32(2.4); this.cardSeconds = f32(4.0);
        this.spawnSeconds = f32(1.0); this.mountSeconds = f32(1.4); this.playerWaitMax = f32(3.0);
        this.handWarn = f32(0.55); this.handRise = f32(0.35); this.handSink = f32(0.5); this.handPull = f32(16); this.handHold = f32(1.6); this.handGrip = f32(22);
        this.hawkWarn = f32(1.1); this.hawkLock = f32(0.6); this.hawkSpeed = f32(190); this.hawkGap = f32(5.5); this.hawkLevel = f32(5);
        this.crackSeconds = f32(3.0);
        this.extraFirst = 20000; this.extraEvery = 30000;

        // ---------------------------------------------------------------- private
        this._cues = new CueBuffer();
        this.rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._lives = 3; this._nextId = 1; this.nextExtra = 20000;
        this._time = 0; this.spawnCool = 0; this.handT = 0; this.handCool = 2; this.hitStop = 0;
        this.speedMul = 1; this.reactMul = 1; this.escapeFlaps = 5; this.skimTrigger = 0.3;
        this.chaseMul = 1; this.evadeMul = 1; this.hawkLinger = 0; this.beastHP = 6;
        this.jousts = 0; this.bounces = 0; this.handGrabs = 0; this.lavaDeaths = 0; this.rivalBurns = 0;
        this.hawkKills = 0; this.hawkPasses = 0; this.extraLives = 0; this.beastBlows = 0;
        this.stageTimes = [];
        this.Fx = Fx;                 // for beast.js (no import cycle)
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }

    get rivalsLeft() {
        let n = this.queue.length;
        for (const r of this.rivals) if (r.active) n++;
        return n;
    }

    get eggsLeft() { let n = 0; for (const e of this.eggs) if (e.alive) n++; return n; }

    get roundWon() { return this._result === RoundResult.Won; }
    get wave() { return this.stageIdx + 1; }

    // the base under x (the rivals' and the bot's "am I over a pit?")
    overBase(x) { const b = this.base; return b != null && !b.gone && f32(x + RIDER_HALF_W) > b.x0 && f32(x - RIDER_HALF_W) < b.x1; }
    wrap(x) { return wrap(x); }
    wrapDx(dx) { return wrapDx(dx); }
    onLedgeX(L, x, halfW) { return onLedgeX(L, x, halfW); }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Intro: return CabinetState.Intro;
            case Phase.Playing: return CabinetState.Playing;
            case Phase.Dying: case Phase.Tally: return CabinetState.Interlude;
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
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's wave ' + this.wave + '/' + STAGE_COUNT + ' kills ' + this.kills +
            ' eggs ' + this.eggsTaken + ' lost ' + this.eggsLost + ' hatched ' + this.hatched + ' deaths ' + this.deaths +
            ' grabs ' + this.handGrabs + ' hawks ' + this.hawkKills + ' blows ' + this.beastBlows + ' lives ' + this._lives +
            ' | ' + this.stageTimes.map(t => fmt(t, 0, F32)).join(' ');
    }

    reset(seed, credit, k) {
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.credit = credit;
        this.altitude = k.get('rivalAltitude');
        this.speedMul = k.get('rivalSpeed');
        this.reactMul = k.get('rivalReaction');
        this.hatchSeconds = k.get('hatchSeconds');
        this.escapeFlaps = k.get('escapeFlaps');
        this.skimTrigger = k.get('handSkim');
        this.tieBand = k.get('tieBand');
        this.loseBand = Math.max(this.tieBand, k.get('loseBand'));
        this.approachRange = k.get('rivalApproach');
        this.levelBand = k.get('rivalLevel');
        this.chaseMul = k.get('rivalChase');
        this.evadeMul = k.get('rivalEvade');
        this.hawkLinger = k.get('hawkLinger');
        this.beastHP = Math.max(1, roundEven(k.get('beastHP')));
        this.extraFirst = roundEven(k.get('extraFirst')); this.extraEvery = Math.max(1000, roundEven(k.get('extraEvery')));
        this._lives = Math.max(1, roundEven(k.get('lives')));

        this.effects = []; this.events.length = 0;
        this._score = 0; this._time = 0; this._nextId = 1; this.chain = 0; this.nextExtra = this.extraFirst;
        this.kills = this.eggsTaken = this.eggsLost = this.deaths = this.hatched = 0;
        this.jousts = this.bounces = this.handGrabs = this.lavaDeaths = this.rivalBurns = 0;
        this.hawkKills = this.hawkPasses = this.extraLives = this.beastBlows = 0;
        this.stagesCleared = 0; this.stageTimes = [];
        this._result = RoundResult.None;
        this.deathCause = '';
        this.extraT = 9; this.shakeAmp = 0; this.shakeT = 0; this.hitStop = 0;
        this._cues.resetTotals();

        this.player = new Rider();
        this.player.id = this._nextId++;
        this.player.isPlayer = true;
        this.player.tier = -1;

        // the attract demo starts on a later wave, to show the variety (never the first two)
        const first = this.isDemo ? 2 + ((seed >>> 0) % (STAGE_COUNT - 2)) : 0;
        this._startStage(first);
    }

    // ------------------------------------------------------------------ a wave: the card, the stone, the riders
    _startStage(idx) {
        const st = this.stage = STAGES[idx];
        this.stageIdx = idx;
        this.ledges = buildLedges(st);
        this.base = null;
        for (const L of this.ledges) if (L.isBase) this.base = L;
        this.rivals = []; this.eggs = []; this.queue = [];
        this.pairKills = new Map();
        this.stageT = 0; this.stageKills = this.stageEggs = this.stageDeaths = this.stageHatched = this.stagePairs = 0;
        this.tally = []; this.tallyShown = 0;
        this.hand = HandState.Idle; this.handReach = 0; this.handVictim = null; this.handT = 0; this.handCool = 2;
        const hk = this.hawk;
        hk.state = HawkState.Off; hk.t = 0; hk.cool = 0; hk.struck = false; hk.passes = 0;
        this.beast = st.boss ? new PitBeast(this.beastHP, st.spots) : null;
        this.addsDone = 0;

        // the wave's riders, in order (GLADIATORS: two at a time, sharing a pair id)
        if (st.pairs) { let id = 1; for (const [a, b] of st.pairs) { this.queue.push({ tier: a, pair: id }, { tier: b, pair: id }); id++; } }
        else for (const t of st.riders) this.queue.push({ tier: t, pair: 0 });

        // THE CLUTCH: eggs laid on the ledges, hatching one after another; they hatch into bounders
        if (st.eggs) {
            for (let i = 0; i < st.eggs.length; i++) {
                const e = new Egg();
                e.x = f32(st.eggs[i][0]); e.y = f32(st.eggs[i][1]); e.grounded = true;
                e.tier = 0; e.hatchTier = 0; e.age = this.eggGrace;
                e.hatchAt = f32(this.hatchSeconds + 6 + i * 1.6);
                this.eggs.push(e);
            }
        }

        const p = this.player;
        p.x = f32(st.start[0]); p.y = f32(st.start[1]); p.vx = 0; p.vy = 0;
        p.grounded = true; p.facing = 1; p.skim = 0; p.revealT = 0; p.grabFlaps = 0; p.bounceCool = 0;
        this._setMode(p, RiderMode.Spawning);

        const start = Math.min(this.queue.length, st.startRivals);
        for (let i = 0; i < start; i++) this._spawnNext(true);
        this.spawnCool = f32(st.spawnGap);

        this.p = Phase.Intro; this.phaseTime = 0;
        this._emit('stage', { n: idx + 1, boss: !!st.boss });
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (dt <= 0) return;
        const flap = input != null && (input.pressed(Pad.A) || input.pressed(Pad.B));
        let stick = input != null ? Math.max(-1, Math.min(1, input.x)) : 0;
        if (stick > -0.25 && stick < 0.25) stick = 0;
        const anyInput = input != null && (stick !== 0 || input.held(Pad.A) || input.held(Pad.B));
        let n = Math.ceil(dt / MAX_SUB - 1e-4);
        if (n < 1) n = 1;
        const h = dt / n;
        for (let i = 0; i < n && this.p !== Phase.Over; i++) this._sub(h, stick, flap && i === 0, anyInput);
    }

    _sub(h, stick, flap, anyInput) {
        this._time = f32(this._time + h);
        this.phaseTime = f32(this.phaseTime + h);
        this.extraT = f32(this.extraT + h);
        this.player.wardT = f32(this.player.wardT + h);
        if (this.shakeT > 0) this.shakeT = f32(this.shakeT - h);
        this._updateEffects(h);
        switch (this.p) {
            case Phase.Intro:
                this.player.modeT = f32(this.player.modeT + h); this.player.revealT = f32(this.player.revealT + h);
                for (const r of this.rivals) if (r.mode === RiderMode.Spawning) { r.modeT = f32(r.modeT + h); r.revealT = f32(r.revealT + h); }
                if (this.phaseTime >= this.introSeconds) {
                    this.p = Phase.Playing; this.phaseTime = 0; this.player.modeT = 0;
                    this._cues.emit(SoundCue.Start);
                    this._emit('go', { n: this.wave });
                }
                break;
            case Phase.Playing:
                this._world(h, stick, flap, anyInput);
                break;
            case Phase.Dying:
                if (this.phaseTime >= this.dyingSeconds) {
                    if (this._lives <= 0) this._endRound(RoundResult.Lost);
                    else this._respawn();
                }
                break;
            case Phase.Tally:
                this._tallyStep();
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // ---------------------------------------------------------------- one step of play
    _world(h, stick, flap, anyInput) {
        const p = this.player;
        if (this.hitStop > 0) { this.hitStop = f32(this.hitStop - h); return; }   // the blow lands: a beat of stillness
        this.stageT = f32(this.stageT + h);

        // ---- the player
        if (p.mode === RiderMode.Spawning) {
            // materialised on the ledge, untouchable until he moves (or the wait runs out)
            p.modeT = f32(p.modeT + h); p.revealT = f32(p.revealT + h);
            if ((anyInput && p.modeT > 0.15) || p.modeT >= this.playerWaitMax) this._setMode(p, RiderMode.Flying);
        }
        if (p.mode === RiderMode.Flying) {
            if (flap) this._emit('flap', {});
            this._move(p, h, stick, flap, this.playerMaxVX);
            if (this.mercyActive && p.y > LAVA_Y - 6) {
                p.y = f32(LAVA_Y - 6); p.vy = f32(-150); p.grounded = false;
                this._burst(Fx.LavaSplash, p.x, LAVA_Y, -1);
                this._ward();
            }
        } else if (p.mode === RiderMode.Grabbed) {
            if (flap) { p.grabFlaps++; p.sinceFlap = 0; this._emit('struggle', { n: p.grabFlaps }); }
            p.sinceFlap = f32(p.sinceFlap + h);
        }

        // ---- the rivals
        for (const r of this.rivals) {
            r.bounceCool = f32(r.bounceCool - h);
            switch (r.mode) {
                case RiderMode.Spawning:
                    r.modeT = f32(r.modeT + h); r.revealT = f32(r.revealT + h);
                    if (r.modeT >= this.spawnSeconds) { this._setMode(r, RiderMode.Flying); r.thinkT = 0; }
                    break;
                case RiderMode.Hatchling:
                    r.modeT = f32(r.modeT + h);
                    if (r.modeT >= this.mountSeconds) {
                        this._setMode(r, RiderMode.Flying); r.vy = f32(-80); r.grounded = false; r.thinkT = 0;
                        this._emit('mount', { tier: r.tier });
                    }
                    break;
                case RiderMode.Flying:
                    this._brain(r, h);
                    break;
                case RiderMode.Grabbed:
                    // a rival in the hand beats its wings too, like a bird would
                    r.flapCool = f32(r.flapCool - h);
                    if (r.flapCool <= 0) {
                        r.grabFlaps++; r.sinceFlap = 0;
                        r.flapCool = f32(1 / TIER_FLAP_RATE[r.tier] * (1.1 + 0.8 * this.rng.nextDouble()));
                    }
                    r.sinceFlap = f32(r.sinceFlap + h);
                    break;
            }
        }
        p.bounceCool = f32(p.bounceCool - h);

        // ---- lava: touching it burns
        if (p.mode === RiderMode.Flying && !this.mercyActive && p.y >= LAVA_Y - 1) {
            this.lavaDeaths++;
            this._burst(Fx.LavaSplash, p.x, LAVA_Y, -1);
            this._killPlayer('BURNED');
            return;
        }
        for (const r of this.rivals) {
            if (r.mode === RiderMode.Flying && r.y >= LAVA_Y - 1) {
                r.mode = RiderMode.Gone; this.rivalBurns++;
                this._burst(Fx.LavaSplash, r.x, LAVA_Y, r.tier);
                this._emit('rivalBurn', { tier: r.tier });
            }
        }

        this._updateStone();
        this._updateHand(h);
        if (this.p !== Phase.Playing) return;
        this._updateEggs(h);
        this._jousts();
        if (this.p !== Phase.Playing) return;
        this._updateHawk(h);
        if (this.p !== Phase.Playing) return;
        if (this.beast != null) { this._updateBeast(h); if (this.p !== Phase.Playing) return; }
        this._rivalBumps();
        this._spawnQueue(h);

        // ---- the wave is clear: every rival gone, every egg taken or lost (the beast: it is dead)
        if (this.beast != null) {
            if (this.beast.state === BeastState.Dead) this._stageClear();
        } else if (this.queue.length === 0 && this.eggsLeft === 0) {
            let any = false;
            for (const r of this.rivals) if (r.active) { any = true; break; }
            if (!any) this._stageClear();
        }
    }

    // ---------------------------------------------------------------- flight
    _move(r, h, thrust, flap, maxVX) {
        r.sinceFlap = f32(r.sinceFlap + h);
        if (flap) {
            r.vy = f32(r.vy - this.flapImpulse);
            if (r.vy < -this.maxRise) r.vy = f32(-this.maxRise);
            r.vx = f32(r.vx + thrust * this.flapKick);
            r.grounded = false;
            r.sinceFlap = 0;
        }
        if (thrust > 0.2) r.facing = 1; else if (thrust < -0.2) r.facing = -1;

        if (r.grounded) {
            r.vy = 0;
            if (thrust !== 0) r.vx = f32(r.vx + thrust * this.groundThrust * h);
            else {
                const f = f32(this.groundFriction * h);
                r.vx = Math.abs(r.vx) <= f ? 0 : f32(r.vx - Math.sign(r.vx) * f);
            }
            if (r.vx > this.maxRun) r.vx = this.maxRun; else if (r.vx < -this.maxRun) r.vx = f32(-this.maxRun);
            if (r.vx !== 0) r.runT = f32(r.runT + h); else r.runT = 0;
        } else {
            r.vy = f32(r.vy + this.gravity * h);
            if (r.vy > this.maxFall) r.vy = this.maxFall;
            r.vx = f32(r.vx + thrust * this.airThrust * h);
            r.vx = f32(r.vx - r.vx * this.airDrag * h);
            if (r.vx > maxVX) r.vx = maxVX; else if (r.vx < -maxVX) r.vx = f32(-maxVX);
        }

        // X then Y, each resolved against the stone
        r.x = f32(r.x + r.vx * h);
        for (const L of this.ledges) {
            if (L.gone) continue;
            const shift = overlaps(r.x, r.y, RIDER_HALF_W, RIDER_H, L);
            if (Number.isNaN(shift)) continue;
            const cx = f32(r.x - shift), mid = f32((L.x0 + L.x1) * 0.5);
            if (cx < mid) r.x = f32(L.x0 - RIDER_HALF_W + shift - 0.01);
            else r.x = f32(L.x1 + RIDER_HALF_W + shift + 0.01);
            r.vx = f32(-r.vx * 0.5);
        }
        r.x = wrap(r.x);

        if (!r.grounded) r.y = f32(r.y + r.vy * h);
        let landed = false;
        for (const L of this.ledges) {
            if (L.gone) continue;
            const shift = overlaps(r.x, r.y, RIDER_HALF_W, RIDER_H, L);
            if (Number.isNaN(shift)) continue;
            if (r.vy >= 0 && f32(r.y - r.vy * h) <= L.top + 1.5) { r.y = L.top; r.vy = 0; landed = true; }
            else if (r.vy < 0) { r.y = f32(L.bottom + RIDER_H + 0.01); r.vy = f32(Math.abs(r.vy) * 0.3); }
            else { r.y = L.top; r.vy = 0; landed = true; }
        }
        if (landed) r.grounded = true;
        else if (r.grounded && !supported(this.ledges, r.x, r.y, FOOT_HALF_W)) r.grounded = false;
        if (r.y < CEILING_FEET) { r.y = CEILING_FEET; if (r.vy < 0) r.vy = f32(-r.vy * 0.3); }

        // skimming the pits (the hand's cue)
        if (!r.grounded && r.y > HAND_LINE && !this.overBase(r.x)) r.skim = f32(r.skim + h); else r.skim = 0;
    }

    // ---------------------------------------------------------------- the rivals' brain
    _brain(r, h) {
        const p = this.player, st = this.stage;
        const t = r.tier;
        r.thinkT = f32(r.thinkT - h);
        if (r.thinkT <= 0) {
            r.thinkT = f32(TIER_THINK[t] * this.reactMul * st.react * (0.7 + 0.6 * this.rng.nextDouble()));
            const playerUp = p.mode === RiderMode.Flying || p.mode === RiderMode.Spawning;
            const below = f32(r.y - p.y), pdx = wrapDx(f32(p.x - r.x));
            r.chasing = playerUp && this.rng.nextDouble() < TIER_CHASE[t] * this.chaseMul * st.chase;
            if (playerUp && below > this.tieBand + 1 && Math.abs(pdx) < 90 && this.rng.nextDouble() < TIER_EVADE[t] * this.evadeMul) {
                // he is above me: break away and climb before coming back at him
                r.chasing = false;
                r.aimX = wrap(f32(r.x - (pdx >= 0 ? 1 : -1) * 90));
                r.aimH = f32(p.height + TIER_MARGIN[t] + 6);
            } else if (r.chasing) {
                r.aimX = wrap(f32(p.x + p.vx * 0.35));
                r.aimH = f32(p.height + TIER_MARGIN[t] + (this.rng.nextDouble() * 10 - 5));
            } else {
                if (this.rng.nextDouble() < 0.5 || Math.abs(wrapDx(f32(r.aimX - r.x))) < 12) r.aimX = f32(this.rng.nextDouble() * FIELD_W);
                r.aimH = f32(40 + this.rng.nextDouble() * 120);
            }
            r.aimH = f32(r.aimH * this.altitude);                         // MERCY: rival altitude
            const top = f32(LAVA_Y - CEILING_FEET - 2);
            if (r.aimH > top) r.aimH = top;
            if (r.aimH < 30) r.aimH = 30;
        }

        const dx = wrapDx(f32(r.aimX - r.x));
        let thrust = dx > 6 ? 1 : dx < -6 ? -1 : 0;
        // a hunting rival comes in LEVEL: it settles at its altitude before it closes the last stretch
        // (so the altitude it aims for, the mercy knob, decides who is higher when they meet)
        if (r.chasing && Math.abs(dx) < this.approachRange && Math.abs(f32(r.height - r.aimH)) > this.levelBand) thrust *= -0.5;
        r.flapCool = f32(r.flapCool - h);
        let flap = false;
        if (r.flapCool <= 0) {
            let wantUp = r.height < r.aimH - 3 && r.vy > -70;
            const panic = !r.grounded && r.height < 32 && r.vy > -100 && !this.overBase(r.x);
            if (r.grounded) {
                r.groundT = f32(r.groundT + h);
                wantUp = r.aimH > r.height + 10 || r.groundT > 0.8;
            } else r.groundT = 0;
            if (wantUp || panic) {
                flap = true;
                r.flapCool = f32(1 / TIER_FLAP_RATE[t] * (0.8 + 0.4 * this.rng.nextDouble()));
            }
        }
        // MERCY: a rival's ceiling comes down with its altitude (the top band is yours), and on the
        // unlosable credit a rival can never fly above the player
        if (r.height > this.altitude * (LAVA_Y - CEILING_FEET) - 4) flap = false;
        if (this.mercyActive && r.y < this.player.y + 10) flap = false;
        this._move(r, h, thrust, flap, TIER_SPEED[t] * this.speedMul * st.speed);
    }

    // ---------------------------------------------------------------- FALLING STONE
    _updateStone() {
        for (const L of this.ledges) {
            if (L.gone || L.crumbleAt <= 0) continue;
            const from = f32(L.crumbleAt - this.crackSeconds);
            if (this.stageT < from) continue;
            if (!L.cracking) { L.cracking = true; this._emit('crack', { x: f32((L.x0 + L.x1) * 0.5) }); }
            L.crack = Math.min(1, f32(f32(this.stageT - from) / this.crackSeconds));
            if (L.crack > 0.5 && ((this.stageT * 7) | 0) % 3 === 0 && this.effects.length < MAX_FX) {
                // grit trickles off its underside while it cracks (the telegraph)
                const gx = f32(L.x0 + this.rng.nextDouble() * (L.x1 - L.x0));
                this.effects.push({ kind: Fx.Debris, x: gx, y: L.bottom, vx: 0, vy: f32(20), g: 200, tier: 0, value: 0, facing: 1, t: 0, life: 0.5, size: 1 });
            }
            if (this.stageT >= L.crumbleAt) {
                L.gone = true;
                const n = Math.max(3, Math.trunc((L.x1 - L.x0) / 8));
                for (let i = 0; i < n && this.effects.length < MAX_FX; i++) {
                    const bx = f32(L.x0 + (i + 0.5) * (L.x1 - L.x0) / n);
                    this.effects.push({ kind: Fx.Debris, x: bx, y: f32(L.top + 2), vx: f32(this.rng.nextDouble() * 60 - 30), vy: f32(-30 - this.rng.nextDouble() * 50), g: 300, tier: 0, value: 0, facing: 1, t: 0, life: 1.2, size: 2 + (i % 2) });
                }
                this._emit('crumble', { x: f32((L.x0 + L.x1) * 0.5) });
                this._shake(2, 0.3);
            }
        }
    }

    // ---------------------------------------------------------------- the lava hand
    _updateHand(h) {
        switch (this.hand) {
            case HandState.Idle: {
                this.handCool = f32(this.handCool - h);
                if (this.handCool > 0 || !this.stage.hand) break;
                let pick = null;
                if (this.player.mode === RiderMode.Flying && !this.mercyActive && this.player.skim >= this.skimTrigger) pick = this.player;
                if (pick == null) for (const r of this.rivals) if (r.mode === RiderMode.Flying && r.skim >= this.skimTrigger) { pick = r; break; }
                if (pick != null) {
                    this.hand = HandState.Warn; this.handT = 0; this.handX = pick.x; this.handVictim = pick; this.handReach = 0;
                    this._emit('handWarn', { x: pick.x, player: pick.isPlayer });
                }
                break;
            }
            case HandState.Warn:
            case HandState.Rising: {
                this.handT = f32(this.handT + h);
                if (this.handVictim != null && this.handVictim.mode === RiderMode.Flying) {
                    const d = wrapDx(f32(this.handVictim.x - this.handX)), step = f32(60 * h);
                    this.handX = wrap(f32(this.handX + (Math.abs(d) <= step ? d : Math.sign(d) * step)));
                }
                if (this.hand === HandState.Warn) {
                    // the lava boils where it will come up
                    if (this.handT >= this.handWarn) { this.hand = HandState.Rising; this.handT = 0; this._emit('handRise', {}); }
                    break;
                }
                this.handReach = Math.min(1, this.handT / this.handRise);
                if (this.handReach >= 1) {
                    let got = null;
                    const reachY = f32(LAVA_Y - HAND_HEIGHT);
                    if (this._canGrab(this.player, reachY)) got = this.player;
                    else for (const r of this.rivals) if (this._canGrab(r, reachY)) { got = r; break; }
                    if (got != null) {
                        this.hand = HandState.Holding; this.handT = 0; this.handVictim = got;
                        got.mode = RiderMode.Grabbed; got.grabFlaps = 0; got.vx = 0; got.vy = 0; got.modeT = 0;
                        got.x = this.handX; this.handGrabs++;
                        if (got.y > LAVA_Y - this.handGrip) got.y = f32(LAVA_Y - this.handGrip);   // the fist closes on his legs: a struggle, never an instant kill
                        this._emit('grab', { player: got.isPlayer });
                        if (got.isPlayer) this._cues.emit(SoundCue.Miss);
                    } else { this.hand = HandState.Sinking; this.handT = 0; this.handVictim = null; }
                }
                break;
            }
            case HandState.Holding: {
                this.handT = f32(this.handT + h);
                const v = this.handVictim;
                v.modeT = f32(v.modeT + h);
                v.y = f32(v.y + this.handPull * h);
                v.x = this.handX;
                this.handReach = Math.max(0, Math.min(1, f32(LAVA_Y - v.y + 2) / HAND_HEIGHT));
                if (v.grabFlaps >= this.escapeFlaps) {
                    v.mode = RiderMode.Flying; v.vy = f32(-140); v.grounded = false; v.skim = 0;
                    this.hand = HandState.Sinking; this.handT = 0; this.handVictim = null; this.handCool = 1.5;
                    this._emit('escape', { player: v.isPlayer });
                } else if (v.y >= LAVA_Y - 2 || this.handT >= this.handHold) {
                    this._burst(Fx.LavaSplash, v.x, LAVA_Y, v.tier);
                    this.hand = HandState.Sinking; this.handT = 0; this.handVictim = null; this.handCool = 2.0;
                    if (v.isPlayer) { this._killPlayer('THE HAND'); }
                    else { v.mode = RiderMode.Gone; this.rivalBurns++; this._emit('rivalBurn', { tier: v.tier }); }
                }
                break;
            }
            case HandState.Sinking:
                this.handT = f32(this.handT + h);
                this.handReach = Math.max(0, this.handReach - h / this.handSink);
                if (this.handReach <= 0) { this.hand = HandState.Idle; this.handCool = Math.max(this.handCool, 1.2); }
                break;
        }
    }

    _canGrab(r, reachY) {
        if (r.mode !== RiderMode.Flying || r.grounded) return false;
        if (r.isPlayer && this.mercyActive) return false;
        return Math.abs(wrapDx(f32(r.x - this.handX))) < 12 && r.y > reachY - 3 && !this.overBase(r.x);
    }

    // ---------------------------------------------------------------- the cinder hawk
    _updateHawk(h) {
        const hk = this.hawk, p = this.player, st = this.stage;
        if (st.hawkAt <= 0) return;
        switch (hk.state) {
            case HawkState.Off: {
                hk.cool = f32(hk.cool - h);
                if (this.stageT < st.hawkAt + this.hawkLinger || hk.cool > 0 || p.mode !== RiderMode.Flying) break;
                // it comes in from the side of the field farther from you, at your height
                hk.dir = p.x < FIELD_W / 2 ? -1 : 1;
                hk.y = p.y; hk.t = 0; hk.struck = false;
                hk.state = HawkState.Warn;
                this._emit('hawkWarn', { dir: hk.dir });
                break;
            }
            case HawkState.Warn:
                hk.t = f32(hk.t + h);
                if (hk.t < this.hawkWarn - this.hawkLock && p.mode === RiderMode.Flying) hk.y = Math.max(f32(CEILING_FEET + 4), Math.min(f32(LAVA_Y - 8), p.y));
                if (hk.t >= this.hawkWarn) {
                    hk.state = HawkState.Pass; hk.t = 0; hk.x = hk.dir > 0 ? f32(-14) : f32(FIELD_W + 14);
                    this.hawkPasses++; hk.passes++;
                    this._emit('hawk', { dir: hk.dir });
                }
                break;
            case HawkState.Pass: {
                hk.t = f32(hk.t + h);
                hk.x = f32(hk.x + hk.dir * this.hawkSpeed * h);
                if ((hk.dir > 0 && hk.x > FIELD_W + 16) || (hk.dir < 0 && hk.x < -16)) { hk.state = HawkState.Off; hk.cool = this.hawkGap; break; }
                if (hk.struck || p.mode !== RiderMode.Flying) break;
                const dx = Math.abs(f32(p.x - hk.x)), dy = f32(p.y - hk.y);
                if (dx >= 15 || dy <= -11 || dy >= 13) break;
                if (p.facing === -hk.dir && Math.abs(dy) <= this.hawkLevel) {
                    // lance to beak: the hawk is yours
                    hk.state = HawkState.Slain; this.hawkKills++;
                    this._addScore(1500); this._popup(hk.x, hk.y - 16, 1500);
                    this._burst(Fx.Blast, hk.x, f32(hk.y - 5), -1);
                    this._burst(Fx.Unhorse, hk.x, f32(hk.y - 5), 0);
                    this._emit('hawkKill', {});
                    this._cues.emit(SoundCue.Hit);
                    this.hitStop = f32(0.08); this._shake(2, 0.3);
                } else if (this.mercyActive) {
                    hk.struck = true;
                    p.vy = f32(-150); p.grounded = false;
                    this._ward();
                } else {
                    hk.struck = true;
                    this._burst(Fx.Unhorse, p.x, f32(p.y - 7), -1);
                    this._killPlayer('THE HAWK');
                }
                break;
            }
        }
    }

    // ---------------------------------------------------------------- THE PIT BEAST
    _updateBeast(h) {
        const b = this.beast, p = this.player;
        b.update(this, h);
        if (!b.alive) return;
        // its calls: at 4 and 2 blows left, riders ride up out of the pit
        const adds = this.stage.adds || [];
        while (this.addsDone < adds.length && b.hp <= adds[this.addsDone][0]) {
            for (const t of adds[this.addsDone][1]) this.queue.push({ tier: t, pair: 0 });
            this.addsDone++;
            this.spawnCool = Math.min(this.spawnCool, f32(0.8));
            this._emit('beastCall', {});
        }
        if (p.mode !== RiderMode.Flying) return;
        const hit = b.touch(p);
        if (hit === 'strike') {
            b.strike(this);
            this.beastBlows++;
            p.vy = f32(-175); p.grounded = false;
            p.vx = f32(p.vx * 0.5 + (wrapDx(f32(p.x - b.x)) >= 0 ? 1 : -1) * 40);
            this._addScore(1000); this._popup(b.x, f32(b.crownY - 18), 1000);
            this._burst(Fx.Spark, p.x, p.y, -1);
            this._burst(Fx.Unhorse, b.x, b.crownY, 1);
            this._cues.emit(SoundCue.Hit);
            this.hitStop = f32(0.1);
            if (!b.alive) this._beastFalls();
            return;
        }
        if (hit === 'glance') {
            p.vy = Math.min(p.vy, f32(-110)); p.grounded = false;
            if (p.bounceCool > 0) return;
            p.vx = f32((wrapDx(f32(p.x - b.x)) >= 0 ? 1 : -1) * 90);
            p.bounceCool = 0.3;
            this._burst(Fx.Spark, p.x, p.y, -1);
            this._emit('bounce', {});
            return;
        }
        if (hit === 'burn') b.lastKill = 'body:' + b.state;
        if (hit === 'burn' || b.fireTouches(p)) {
            if (this.mercyActive) {
                if (p.wardT > 0.4) {
                    p.vy = f32(-160); p.grounded = false;
                    p.vx = f32((wrapDx(f32(p.x - b.x)) >= 0 ? 1 : -1) * 100);
                    this._ward();
                }
                return;
            }
            b.burns++;
            this._burst(Fx.LavaSplash, p.x, p.y, -1);
            this._killPlayer('THE BEAST');
        }
    }

    // the beast is dying: its riders burn with it, its eggs sink
    _beastFalls() {
        for (const r of this.rivals) if (r.active) {
            r.mode = RiderMode.Gone;
            this._burst(Fx.LavaSplash, r.x, Math.min(LAVA_Y, r.y), r.tier);
            this._burst(Fx.Unhorse, r.x, f32(r.y - 7), r.tier);
        }
        for (const e of this.eggs) if (e.alive) { e.alive = false; this._burst(Fx.EggSizzle, e.x, e.y, e.tier); }
        this.eggs = [];
        this.queue.length = 0;
        if (this.hand !== HandState.Idle) { this.hand = HandState.Sinking; this.handVictim = null; }
    }

    // ---------------------------------------------------------------- eggs
    _updateEggs(h) {
        for (const e of this.eggs) {
            if (!e.alive) continue;
            e.age = f32(e.age + h);
            if (!e.grounded) {
                e.vy = f32(e.vy + this.gravity * h); if (e.vy > this.maxFall) e.vy = this.maxFall;
                e.vx = f32(e.vx - e.vx * 0.4 * h);
            } else {
                const f = f32(120 * h);
                e.vx = Math.abs(e.vx) <= f ? 0 : f32(e.vx - Math.sign(e.vx) * f);
            }
            e.x = f32(e.x + e.vx * h);
            for (const L of this.ledges) {
                if (L.gone) continue;
                const shift = overlaps(e.x, e.y, EGG_HALF_W, EGG_H, L);
                if (Number.isNaN(shift)) continue;
                const cx = f32(e.x - shift);
                e.x = cx < f32((L.x0 + L.x1) * 0.5) ? f32(L.x0 - EGG_HALF_W + shift - 0.01) : f32(L.x1 + EGG_HALF_W + shift + 0.01);
                e.vx = f32(-e.vx * 0.4);
            }
            e.x = wrap(e.x);
            if (!e.grounded) e.y = f32(e.y + e.vy * h);
            let landed = false;
            for (const L of this.ledges) {
                if (L.gone) continue;
                const shift = overlaps(e.x, e.y, EGG_HALF_W, EGG_H, L);
                if (Number.isNaN(shift)) continue;
                if (e.vy >= 0) { e.y = L.top; landed = true; }
                else { e.y = f32(L.bottom + EGG_H + 0.01); e.vy = f32(Math.abs(e.vy) * 0.3); }
            }
            if (landed) {
                if (e.vy > 70) { e.vy = f32(-e.vy * 0.35); e.grounded = false; }   // a little bounce
                else { e.vy = 0; e.grounded = true; }
            } else if (e.grounded && !supported(this.ledges, e.x, e.y, 1)) e.grounded = false;
            if (e.y < CEILING_FEET - 8) { e.y = f32(CEILING_FEET - 8); if (e.vy < 0) e.vy = 0; }

            if (e.y >= LAVA_Y) {
                e.alive = false; this.eggsLost++;
                this._burst(Fx.EggSizzle, e.x, LAVA_Y, e.tier);
                this._emit('eggLost', {});
                continue;
            }
            if (e.grounded && e.age >= e.hatchAt) {
                e.alive = false; this.hatched++; this.stageHatched++;
                const tier = Math.max(0, Math.min(2, e.hatchTier));
                const r = this._newRival(tier, e.x, e.y);
                r.mode = RiderMode.Hatchling; r.grounded = true; r.modeT = 0;
                this._burst(Fx.EggSparkle, e.x, f32(e.y - 5), tier);
                this._emit('hatch', { tier });
            }
        }
        this.eggs = this.eggs.filter(e => e.alive);
    }

    // ---------------------------------------------------------------- contact
    _jousts() {
        const p = this.player;
        if (p.mode === RiderMode.Flying) {
            // eggs first: walking or flying into one takes it
            for (const e of this.eggs) {
                if (!e.alive || e.age < this.eggGrace) continue;
                if (Math.abs(wrapDx(f32(e.x - p.x))) < RIDER_HALF_W + EGG_HALF_W && e.y > p.y - RIDER_H && e.y - EGG_H < p.y + 1) {
                    e.alive = false; this.eggsTaken++; this.stageEggs++;
                    this.chain = Math.min(4, this.chain + 1);
                    const v = 250 * this.chain;
                    this._addScore(v);
                    this._popup(e.x, e.y - 10, v);
                    this._burst(Fx.EggSparkle, e.x, e.y - 3, e.tier);
                    this._cues.emit(SoundCue.Bonus);
                    this._emit('egg', { chain: this.chain, air: !p.grounded });
                }
            }
            this.eggs = this.eggs.filter(e => e.alive);
        }

        for (const r of this.rivals) {
            if (p.mode !== RiderMode.Flying) return;
            if (r.mode !== RiderMode.Flying && r.mode !== RiderMode.Hatchling) continue;
            const dx = wrapDx(f32(r.x - p.x));
            const hh = r.mode === RiderMode.Hatchling ? 11 : RIDER_H;
            if (Math.abs(dx) >= RIDER_HALF_W * 2 - 1) continue;
            if (r.y - hh >= p.y || p.y - RIDER_H >= r.y) continue;

            if (r.mode === RiderMode.Hatchling) {
                // a rider on foot is no match for a rider on a bird
                r.mode = RiderMode.Gone; this.kills++; this.stageKills++;
                const v = TIER_SCORE[r.tier];
                this._addScore(v); this._popup(r.x, r.y - 16, v);
                this._burst(Fx.Unhorse, r.x, r.y - 5, r.tier);
                this._cues.emit(SoundCue.Hit);
                this._emit('trample', { tier: r.tier });
                continue;
            }
            if (r.bounceCool > 0) continue;

            const d = f32(r.y - p.y);                       // > 0: the player's lance is higher
            this.jousts++;
            if (d > this.tieBand) {
                this._unhorse(r);
            } else if (d < -this.loseBand && !this.mercyActive) {
                this._flee(p.x, p.y, p.facing, -1);
                this._burst(Fx.Spark, f32(p.x + dx * 0.5), f32(p.y - 8), -1);
                this._killPlayer('UNHORSED');
                return;
            } else {
                // level lances (or the mercy credit): both bounce apart
                const s = dx >= 0 ? -1 : 1;              // the player goes away from the rival
                p.vx = f32(s * 80); r.vx = f32(-s * 80);
                if (!p.grounded) p.vy = Math.min(p.vy, -30);
                if (!r.grounded) r.vy = Math.max(r.vy, 20);
                r.bounceCool = 0.35; this.bounces++;
                this._burst(Fx.Spark, f32(p.x + dx * 0.5), f32(p.y - 8), -1);
                this._cues.emit(SoundCue.Miss);
                this._emit('bounce', {});
                if (d < -this.loseBand) this._ward();         // the mercy credit saved a lost joust
            }
        }
    }

    _unhorse(r) {
        r.mode = RiderMode.Gone; this.kills++; this.stageKills++;
        const v = TIER_SCORE[r.tier];
        this._addScore(v);
        this._popup(r.x, r.y - 18, v);
        this._burst(Fx.Unhorse, r.x, r.y - 7, r.tier);
        this._burst(Fx.Spark, r.x, r.y - 9, -1);
        this._feathers(r.x, f32(r.y - 6), r.tier);
        this._flee(r.x, r.y, r.facing, r.tier);
        const away = wrapDx(f32(r.x - this.player.x)) >= 0 ? 1 : -1;
        const egg = new Egg();
        egg.x = r.x; egg.y = Math.max(CEILING_FEET - 4, f32(r.y - 3));
        egg.vx = f32(r.vx * 0.5 + away * this.eggKnock);
        egg.vy = f32(Math.min(r.vy, 0) - 50);
        egg.tier = r.tier; egg.hatchTier = r.tier + 1; egg.hatchAt = this.hatchSeconds; egg.grounded = false;
        this.eggs.push(egg);
        this._cues.emit(SoundCue.Hit);
        this._emit('joust', { tier: r.tier });
        this.hitStop = f32(0.05); this._shake(1, 0.15);
        // GLADIATORS: both riders of a pair unhorsed
        if (r.pair !== 0) {
            const n = (this.pairKills.get(r.pair) || 0) + 1;
            this.pairKills.set(r.pair, n);
            if (n === 2) {
                this.stagePairs++;
                this._addScore(1000);
                this._popupText(r.x, f32(r.y - 30), 'PAIR 1000');
                this._emit('pair', {});
            }
        }
    }

    _rivalBumps() {
        for (let i = 0; i < this.rivals.length; i++) {
            const a = this.rivals[i];
            if (a.mode !== RiderMode.Flying || a.bounceCool > 0) continue;
            for (let j = i + 1; j < this.rivals.length; j++) {
                const b = this.rivals[j];
                if (b.mode !== RiderMode.Flying || b.bounceCool > 0) continue;
                const dx = wrapDx(f32(b.x - a.x));
                if (Math.abs(dx) >= RIDER_HALF_W * 2 - 1 || Math.abs(b.y - a.y) >= RIDER_H - 2) continue;
                const s = dx >= 0 ? 1 : -1;
                a.vx = f32(-s * 60); b.vx = f32(s * 60);
                a.bounceCool = b.bounceCool = 0.3;
            }
        }
    }

    // ---------------------------------------------------------------- riding in
    _spawnQueue(h) {
        if (this.queue.length === 0) return;
        this.spawnCool = f32(this.spawnCool - h);
        let active = 0;
        for (const r of this.rivals) if (r.active) active++;
        const need = this.queue[0].pair !== 0 ? 2 : 1;
        if (this.spawnCool > 0 || active + need > this.stage.maxActive) return;
        this._spawnNext(false);
        if (need === 2 && this.queue.length > 0) this._spawnNext(false);
        this.spawnCool = f32(this.stage.spawnGap * (0.8 + 0.5 * this.rng.nextDouble()));
    }

    _padAlive(i) {
        const [x, y] = this.stage.pads[i];
        return supported(this.ledges, x, y, 1);
    }

    _spawnNext(atStart) {
        const q = this.queue.shift();
        const pads = this.stage.pads;
        // the pad: at the start, pads round the field; later, one of the two farthest from the player
        let pad = -1;
        let used = 0;
        for (const r0 of this.rivals) if (r0.active && r0.mode === RiderMode.Spawning) used++;
        if (atStart) {
            for (let k = 0; k < pads.length; k++) {
                const i = (used + 2 + k) % pads.length;
                if (this._padAlive(i) && !this._padTaken(i)) { pad = i; break; }
            }
        } else {
            let best = -1, second = -1, bd = -1, sd = -1;
            for (let i = 0; i < pads.length; i++) {
                if (!this._padAlive(i) || this._padTaken(i)) continue;
                const d = Math.abs(wrapDx(f32(pads[i][0] - this.player.x))) + Math.abs(pads[i][1] - this.player.y);
                if (d > bd) { second = best; sd = bd; best = i; bd = d; }
                else if (d > sd) { second = i; sd = d; }
            }
            pad = second >= 0 && this.rng.nextDouble() < 0.5 ? second : best;
        }
        if (pad < 0) pad = 0;
        const nr = this._newRival(q.tier, f32(pads[pad][0]), f32(pads[pad][1]));
        nr.pair = q.pair;
        nr.mode = RiderMode.Spawning; nr.modeT = 0; nr.grounded = true;
        this._emit('spawn', { tier: q.tier });
    }

    _padTaken(i) {
        const [x, y] = this.stage.pads[i];
        for (const r of this.rivals) if (r.mode === RiderMode.Spawning && Math.abs(r.x - x) < 4 && Math.abs(r.y - y) < 4) return true;
        return false;
    }

    _newRival(tier, x, y) {
        const r = new Rider();
        r.id = this._nextId++; r.tier = tier; r.x = x; r.y = y;
        r.facing = x < FIELD_W / 2 ? 1 : -1;
        r.aimX = x; r.aimH = f32(LAVA_Y - y);
        r.flapCool = f32(0.2 + 0.3 * this.rng.nextDouble());
        // reuse a slot of a rider that is gone, so the list stays small
        for (let i = 0; i < this.rivals.length; i++) if (!this.rivals[i].active) { this.rivals[i] = r; return r; }
        this.rivals.push(r);
        return r;
    }

    _setMode(r, m) { r.mode = m; r.modeT = 0; }

    // ---------------------------------------------------------------- score, lives
    _addScore(v) {
        this._score += v;
        while (this._score >= this.nextExtra) {
            this._lives++; this.extraLives++;
            this.nextExtra += this.extraEvery;
            this.extraT = 0;
            this._cues.emit(SoundCue.Bonus);
            this._emit('extraLife', { lives: this._lives });
        }
    }

    _killPlayer(cause) {
        const p = this.player;
        if (this.mercyActive) return;                        // cannot happen: the rules above never call it on mercy
        p.mode = RiderMode.Gone;
        this._lives--; this.deaths++; this.stageDeaths++;
        this.chain = 0;
        this.deathCause = cause;
        if (cause === 'UNHORSED') { this._burst(Fx.Unhorse, p.x, p.y - 7, -1); this._feathers(p.x, f32(p.y - 6), -1); }
        this._cues.emit(SoundCue.Die);
        this._emit('die', { cause, last: this._lives <= 0 });
        this._shake(3, 0.4);
        this.p = Phase.Dying; this.phaseTime = 0;
    }

    _respawn() {
        const p = this.player;
        // the stage's respawn ledges, whichever is farthest from the nearest danger
        let bestX = f32(this.stage.start[0]), bestY = f32(this.stage.start[1]), bestD = -1;
        for (const [x, y] of this.stage.respawn) {
            if (!supported(this.ledges, x, y, 1)) continue;
            let near = 999;
            for (const r of this.rivals) if (r.active) near = Math.min(near, Math.abs(wrapDx(f32(r.x - x))) + Math.abs(r.y - y));
            if (this.beast != null && this.beast.solid) near = Math.min(near, Math.abs(wrapDx(f32(this.beast.x - x))) + 20);
            if (near > bestD) { bestD = near; bestX = f32(x); bestY = f32(y); }
        }
        p.x = bestX; p.y = bestY; p.vx = p.vy = 0; p.grounded = true; p.skim = 0; p.grabFlaps = 0; p.revealT = 0;
        this._setMode(p, RiderMode.Spawning);
        if (this.hand === HandState.Holding && this.handVictim === p) { this.hand = HandState.Sinking; this.handVictim = null; }
        const hk = this.hawk;
        if (hk.state === HawkState.Warn || hk.state === HawkState.Pass) { hk.state = HawkState.Off; hk.cool = Math.max(hk.cool, f32(4)); }
        if (this.beast != null) this.beast.embers.length = 0;
        this.p = Phase.Playing; this.phaseTime = 0;
        this._cues.emit(SoundCue.Start);
        this._emit('respawn', {});
    }

    // ---------------------------------------------------------------- the tally, the end
    _stageClear() {
        const st = this.stage, n = this.wave;
        const rows = [];
        rows.push({ label: st.boss ? 'RIDERS' : 'RIDERS UNHORSED', count: this.stageKills, pts: 0 });
        if (!st.boss) rows.push({ label: 'EGGS TAKEN', count: this.stageEggs, pts: 0 });
        rows.push({ label: 'WAVE BONUS', pts: 500 * n });
        switch (st.bonus) {
            case 'survival': rows.push(this.stageDeaths === 0 ? { label: 'SURVIVAL BONUS', pts: 3000, special: true } : { label: 'SURVIVAL BONUS', pts: 0, miss: 'A RIDER LOST' }); break;
            case 'clutch': rows.push(this.stageHatched === 0 ? { label: 'CLUTCH BONUS', pts: 2000, special: true } : { label: 'CLUTCH BONUS', pts: 0, miss: 'AN EGG HATCHED' }); break;
            case 'stone': {
                let k = 0;
                for (const L of this.ledges) if (!L.isBase && L.crumbleAt > 0 && !L.gone) k++;
                rows.push({ label: 'STONE STANDING', count: k, pts: 500 * k, special: k > 0 });
                break;
            }
            case 'pairs': rows.push({ label: 'PAIRS UNHORSED', count: this.stagePairs, pts: 0, special: this.stagePairs > 0 }); break;
            case 'beast':
                rows.push({ label: 'THE BEAST SLAIN', pts: 10000, special: true });
                rows.push({ label: 'RIDERS LEFT', count: this._lives, pts: 2000 * this._lives, special: true });
                break;
        }
        this.tally = rows; this.tallyShown = 0;
        this.tallySeconds = f32(0.7 + 0.5 * rows.length + 1.6);
        this.stagesCleared++;
        this.stageTimes.push(this.stageT);
        this.hand = HandState.Idle; this.handReach = 0;
        this.p = Phase.Tally; this.phaseTime = 0;
        this._cues.emit(SoundCue.Bonus);
        this._emit('waveClear', { n, boss: !!st.boss });
    }

    _tallyStep() {
        while (this.tallyShown < this.tally.length && this.phaseTime >= 0.7 + 0.5 * this.tallyShown) {
            const row = this.tally[this.tallyShown++];
            if (row.pts > 0) this._addScore(row.pts);
            this._cues.emit(SoundCue.Tick);
            this._emit('tally', { pts: row.pts, special: !!row.special, miss: !!row.miss });
        }
        if (this.phaseTime >= this.tallySeconds) {
            if (this.stageIdx + 1 >= STAGE_COUNT) this._endRound(RoundResult.Won);
            else this._startStage(this.stageIdx + 1);
        }
    }

    _endRound(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) { this._cues.emit(SoundCue.Win); this._emit('victory', {}); }
    }

    // ---------------------------------------------------------------- effects + events
    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    _shake(amp, secs) { if (amp >= this.shakeAmp || this.shakeT <= 0) { this.shakeAmp = amp; this.shakeT = f32(secs); } }

    // the mercy credit saved him: the ward ring and its bell
    _ward() {
        if (this.player.wardT > 0.5) this._emit('ward', {});
        this.player.wardT = 0;
    }

    _burst(kind, x, y, tier) {
        if (this.effects.length >= MAX_FX) return;
        const life = kind === Fx.LavaSplash ? 0.8 : kind === Fx.EggSizzle ? 0.7 : kind === Fx.Spark ? 0.25 : kind === Fx.Blast ? 0.5 : 0.6;
        this.effects.push({ kind, x, y, tier, value: 0, facing: 1, vx: 0, vy: 0, g: 0, t: 0, life, size: 0 });
    }

    _popup(x, y, value) {
        if (this.effects.length >= MAX_FX) return;
        this.effects.push({ kind: Fx.Popup, x, y, value, text: null, tier: -1, facing: 1, vx: 0, vy: -10, g: 0, t: 0, life: 1.1, size: 0 });
    }

    _popupText(x, y, text) {
        if (this.effects.length >= MAX_FX) return;
        this.effects.push({ kind: Fx.Popup, x, y, value: 0, text, tier: -1, facing: 1, vx: 0, vy: -8, g: 0, t: 0, life: 1.4, size: 0 });
    }

    _flee(x, y, facing, tier) {
        // the riderless bird flaps away off the side of the screen
        if (this.effects.length >= MAX_FX) return;
        const dir = facing !== 0 ? facing : 1;
        this.effects.push({ kind: Fx.FleeingBird, x, y, vx: dir * 110, vy: -45, g: 0, tier, facing: dir, value: 0, t: 0, life: 3, size: 0 });
    }

    _feathers(x, y, tier) {
        for (let i = 0; i < 5 && this.effects.length < MAX_FX; i++) {
            const a = (i - 2) * 0.55;
            this.effects.push({ kind: Fx.Feather, x, y, vx: f32(Math.sin(a) * 50), vy: f32(-40 - (i % 2) * 25), g: 60, tier, facing: i % 2 === 0 ? 1 : -1, value: 0, t: 0, life: 1.3 + (i % 3) * 0.2, size: 0 });
        }
    }

    _updateEffects(h) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const f = this.effects[i];
            f.t = f32(f.t + h);
            if (f.g) f.vy = f32(f.vy + f.g * h);
            if (f.kind === Fx.Feather) f.vx = f32(f.vx - f.vx * 2.5 * h);
            f.x = f32(f.x + f.vx * h); f.y = f32(f.y + f.vy * h);
            if (f.kind === Fx.FleeingBird && (f.x < -24 || f.x > FIELD_W + 24 || f.y < 20)) f.t = f.life;
            if (f.kind === Fx.Debris && f.y >= LAVA_Y) f.t = f.life;
            if (f.t >= f.life) this.effects.splice(i, 1);
        }
    }

    collectStats(into) {
        add(into, 'waves', this.stagesCleared);
        add(into, 'kills', this.kills);
        add(into, 'eggs', this.eggsTaken);
        add(into, 'eggsLost', this.eggsLost);
        add(into, 'hatched', this.hatched);
        add(into, 'deaths', this.deaths);
        add(into, 'jousts', this.jousts);
        add(into, 'bounces', this.bounces);
        add(into, 'handGrabs', this.handGrabs);
        add(into, 'lavaDeaths', this.lavaDeaths);
        add(into, 'rivalBurns', this.rivalBurns);
        add(into, 'hawkPasses', this.hawkPasses);
        add(into, 'hawkKills', this.hawkKills);
        add(into, 'beastBlows', this.beastBlows);
        add(into, 'extraLives', this.extraLives);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }
