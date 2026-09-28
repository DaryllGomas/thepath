// THE NODE · world 1 · LANCE RIDER (Anvil & Sparks, 1982) on the Cabinet Engine · THE ROUND.
// Port of LanceRiderSim.cs.
//
// A Joust. Floating stone ledges over a lava floor; the field wraps left/right. You ride a great
// bird: the stick thrusts left/right (momentum, air drag), button A flaps (one lift impulse per
// PRESS; gravity pulls down). Rivals ride the same physics in three tiers: BOUNDER, HUNTER,
// SHADOW LORD (faster, quicker to react, keener to get above you).
//
//   THE JOUST   when two riders meet, the HIGHER lance wins (feet compared; within 3 px = both
//               bounce). A rival that loses bursts into an EGG that falls to a ledge; the player
//               that loses is unhorsed (a life).
//   EGGS        collect one by walking or flying into it: 250, 500, 750, 1000 (the chain; it
//               resets when you die). An egg left alone hatches after 8 s into a new rival one
//               tier up (bounder > hunter > shadow lord). An egg that falls in the lava is gone.
//   THE LAVA    touching it burns you. A HAND rises out of it and grabs any rider skimming low
//               over the pits; flap hard (5 presses) to tear free, or it drags you under.
//   THE WAVE    5-8 rivals: 2 on the field when it opens, never more than 3 at once, the rest
//               ride in from the spawn ledges every ~8.5 s. A hunting rival settles at its aim
//               height before it closes the last 120 px, so it meets you LEVEL, not in a dive.
//               The round is WON when every rival of the wave is gone and every egg is collected
//               or lost; it is LOST when the third life goes. 3 lives.
//   SCORE       bounder 500, hunter 750, shadow lord 1000, a hatchling on foot its tier's value,
//               egg 250 + chain.
//
// MERCY (Core): knob rivalAltitude = 1.0 x0.9 per lost round scales every rival's target
// altitude AND its ceiling (it will not flap above that share of the field), so the average
// altitude drops 10% a loss and the top band belongs to the player. On the UNLOSABLE credit (5)
// rivals can never fly above the player (no flap while level with or above him) and the player
// cannot lose: a lost joust is a bounce, the lava throws him back up, the hand will not take him.
//
// Coordinates: X = world px 0..FIELD_W (wraps; the renderer puts world 0 at screen x 8), Y = SCREEN
// px, down, and a rider's Y is its FEET. Heights (above the lava) are LAVA_Y - Y.
import { f32, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, SystemRandom, Pad } from '../../sdk/index.js';

// ---------------------------------------------------------------- the field
export const FIELD_W = 304;
export const LAVA_Y = f32(218);          // the lava surface (screen y)
export const CEILING_FEET = f32(46);     // highest a rider's feet can be (sprite top at 30)
export const HAND_LINE = f32(195);       // feet below this, over a pit, airborne = skimming
export const HAND_HEIGHT = f32(32);      // how far the hand reaches above the lava
export const BASE_X0 = f32(80), BASE_X1 = f32(224), BASE_TOP = f32(200);

export const RIDER_HALF_W = f32(8), RIDER_H = f32(14), FOOT_HALF_W = f32(5);   // the 18x16 sprite's body
export const EGG_HALF_W = f32(4), EGG_H = f32(10);                            // the 8x10 egg

export const LEDGES = [
    { x0: BASE_X0, x1: BASE_X1, top: BASE_TOP, bottom: f32(LAVA_Y + 20), isBase: true },
    { x0: f32(112), x1: f32(192), top: f32(72), bottom: f32(78) },       // top centre (spawn)
    { x0: f32(264), x1: FIELD_W, top: f32(92), bottom: f32(98) },        // top ledge across the seam...
    { x0: f32(0), x1: f32(40), top: f32(92), bottom: f32(98) },          // ...its other half
    { x0: f32(20), x1: f32(92), top: f32(134), bottom: f32(140) },       // mid left (spawn)
    { x0: f32(196), x1: f32(268), top: f32(124), bottom: f32(130) },     // mid right (spawn)
    { x0: f32(284), x1: FIELD_W, top: f32(176), bottom: f32(182) },      // the low ledge over the pits...
    { x0: f32(0), x1: f32(20), top: f32(176), bottom: f32(182) },        // ...across the seam
];

// spawn ledges (feet positions): base left, base right, top centre, mid left, mid right
export const PAD_X = [f32(112), f32(192), f32(152), f32(56), f32(232)];
export const PAD_Y = [BASE_TOP, BASE_TOP, f32(72), f32(134), f32(124)];
export const PLAYER_PAD_X = f32(152);

export const TIER_SPEED = [f32(66), f32(82), f32(98)];          // max air speed px/s
export const TIER_THINK = [f32(0.50), f32(0.34), f32(0.22)];    // seconds between decisions
export const TIER_FLAP_RATE = [f32(3.8), f32(4.6), f32(5.6)];   // max flaps a second
export const TIER_MARGIN = [f32(2), f32(10), f32(16)];          // px it aims above you
export const TIER_CHASE = [f32(0.45), f32(0.75), f32(0.95)];    // chance a decision hunts you
export const TIER_EVADE = [f32(0.20), f32(0.55), f32(0.80)];    // chance it breaks away to climb when you are above it
export const TIER_SCORE = [500, 750, 1000];
export const TIER_NAME = ['BOUNDER', 'HUNTER', 'SHADOW LORD'];

export const RiderMode = Object.freeze({ Spawning: 0, Flying: 1, Hatchling: 2, Grabbed: 3, Gone: 4 });
export const HandState = Object.freeze({ Idle: 0, Rising: 1, Holding: 2, Sinking: 3 });
export const Phase = Object.freeze({ Idle: 0, Intro: 1, Playing: 2, Dying: 3, Card: 4, Over: 5 });
export const Fx = Object.freeze({ FleeingBird: 0, Unhorse: 1, LavaSplash: 2, EggSparkle: 3, Popup: 4, EggSizzle: 5 });
export const LanceEvent = Object.freeze({
    Joust: 0, Bounce: 1, Unhorsed: 2, EggCollected: 3, EggLost: 4, Hatch: 5, HatchlingKill: 6,
    LavaDeath: 7, HandGrab: 8, HandEscape: 9, HandKill: 10, RivalBurned: 11, RivalSpawn: 12, WaveClear: 13,
});

const MAX_SUB = f32(1 / 60);

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

export function overBase(x) { return f32(x + RIDER_HALF_W) > BASE_X0 && f32(x - RIDER_HALF_W) < BASE_X1; }

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

export function supported(x, y, halfW) {
    for (const L of LEDGES) {
        if (Math.abs(y - L.top) > 0.6) continue;
        for (let k = -1; k <= 1; k++) {
            const s = k * FIELD_W;
            if (f32(x + halfW) > f32(L.x0 + s) && f32(x - halfW) < f32(L.x1 + s)) return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------- entities
class Rider {
    constructor() {
        this.id = 0;
        this.isPlayer = false;
        this.tier = 0;                       // 0 bounder, 1 hunter, 2 shadow lord; -1 = the player
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
        this.tier = 0;
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
        this.log = [];
        this.queue = [];              // tiers still to ride in
        this.credit = null;
        this.wave = 0;
        this.waveSize = 0;
        this.chain = 0;
        this.altitude = 1;            // the mercy knob, resolved
        this.hatchSeconds = 8;
        this.deathCause = '';
        this.kills = 0; this.eggsTaken = 0; this.eggsLost = 0; this.deaths = 0; this.hatched = 0;

        this.hand = HandState.Idle; this.handX = 0; this.handReach = 0; this.handVictim = null;

        // ---------------------------------------------------------------- the machine (not mercy knobs)
        this.gravity = f32(250); this.flapImpulse = f32(90); this.maxRise = f32(150); this.maxFall = f32(170);
        this.airThrust = f32(170); this.airDrag = f32(0.6); this.flapKick = f32(14);
        this.groundThrust = f32(240); this.groundFriction = f32(260); this.maxRun = f32(70);
        this.playerMaxVX = f32(105);
        this.tieBand = f32(3);
        this.eggGrace = f32(0.45); this.eggKnock = f32(55);
        this.approachRange = f32(70); this.levelBand = f32(10);
        this.introSeconds = f32(2.8); this.dyingSeconds = f32(2.6); this.cardSeconds = f32(3.5);
        this.spawnSeconds = f32(1.0); this.mountSeconds = f32(1.4); this.playerWaitMax = f32(3.0);
        this.handRise = f32(0.35); this.handSink = f32(0.5); this.handPull = f32(16); this.handHold = f32(1.6); this.handGrip = f32(22);

        // ---------------------------------------------------------------- private
        this._cues = new CueBuffer();
        this.rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._lives = 3; this._nextId = 1;
        this._time = 0; this.spawnCool = 0; this.handT = 0; this.handCool = 2;
        this.speedMul = 1; this.reactMul = 1; this.hatchSecondsK = 8; this.escapeFlaps = 5; this.skimTrigger = 0.3;
        this.spawnGap = 8.5; this.chaseMul = 1; this.evadeMul = 1;
        this.maxActive = 3;
        this.jousts = 0; this.bounces = 0; this.handGrabs = 0; this.lavaDeaths = 0; this.rivalBurns = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }

    get rivalsLeft() {
        let n = this.queue.length;
        for (const r of this.rivals) if (r.active) n++;
        return n;
    }

    get eggsLeft() { let n = 0; for (const e of this.eggs) if (e.alive) n++; return n; }

    get roundWon() { return this._result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Intro: return CabinetState.Intro;
            case Phase.Playing: return CabinetState.Playing;
            case Phase.Dying: return CabinetState.Interlude;
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
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's wave ' + this.waveSize + ' kills ' + this.kills +
            ' eggs ' + this.eggsTaken + ' lost ' + this.eggsLost + ' hatched ' + this.hatched + ' deaths ' + this.deaths +
            ' grabs ' + this.handGrabs + ' lives ' + this._lives;
    }

    reset(seed, credit, k) {
        this.rng = new SystemRandom(seed === 0 ? (Date.now() | 0) : seed);
        this.credit = credit;
        this.wave = credit.number;
        this.altitude = k.get('rivalAltitude');
        this.speedMul = k.get('rivalSpeed');
        this.reactMul = k.get('rivalReaction');
        this.hatchSeconds = k.get('hatchSeconds');
        this.escapeFlaps = k.get('escapeFlaps');
        this.skimTrigger = k.get('handSkim');
        this.spawnGap = k.get('spawnGap');
        this.tieBand = k.get('tieBand');
        this.approachRange = k.get('rivalApproach');
        this.levelBand = k.get('rivalLevel');
        this.chaseMul = k.get('rivalChase');
        this.evadeMul = k.get('rivalEvade');
        this.maxActive = Math.max(1, roundEven(k.get('maxActive')));
        this._lives = Math.max(1, roundEven(k.get('lives')));

        this.rivals = []; this.eggs = []; this.effects = []; this.log = []; this.queue = [];
        this._score = 0; this._time = 0; this._nextId = 1; this.chain = 0;
        this.kills = this.eggsTaken = this.eggsLost = this.deaths = this.hatched = 0;
        this.jousts = this.bounces = this.handGrabs = this.lavaDeaths = this.rivalBurns = 0;
        this._result = RoundResult.None;
        this.deathCause = '';
        this.hand = HandState.Idle; this.handReach = 0; this.handVictim = null; this.handT = 0; this.handCool = 2;
        this._cues.resetTotals();

        // the wave: 5-8 riders, mostly bounders
        const lo = roundEven(k.get('waveMin')), hi = Math.max(lo, roundEven(k.get('waveMax')));
        this.waveSize = lo + this.rng.next(hi - lo + 1);
        const hs = k.get('hunterShare'), ls = k.get('lordShare');
        for (let i = 0; i < this.waveSize; i++) {
            const u = this.rng.nextDouble();
            this.queue.push(i === 0 ? 0 : u < ls ? 2 : u < ls + hs ? 1 : 0);   // the first is always a bounder
        }

        this.player = new Rider();
        this.player.id = this._nextId++;
        this.player.isPlayer = true;
        this.player.tier = -1;
        this.player.x = PLAYER_PAD_X; this.player.y = BASE_TOP;
        this.player.grounded = true; this.player.mode = RiderMode.Spawning; this.player.facing = 1;

        const start = Math.min(this.queue.length, Math.max(1, roundEven(k.get('startRivals'))));
        for (let i = 0; i < start; i++) this._spawnNext(true);
        this.spawnCool = this.spawnGap;

        this.p = Phase.Intro; this.phaseTime = 0;
        this._cues.emit(SoundCue.Start);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (dt <= 0) return;
        const flap = input != null && input.pressed(Pad.A);
        let stick = input != null ? Math.max(-1, Math.min(1, input.x)) : 0;
        if (stick > -0.25 && stick < 0.25) stick = 0;
        const anyInput = input != null && (stick !== 0 || input.held(Pad.A));
        let n = Math.ceil(dt / MAX_SUB - 1e-4);
        if (n < 1) n = 1;
        const h = dt / n;
        for (let i = 0; i < n && this.p !== Phase.Over; i++) this._sub(h, stick, flap && i === 0, anyInput);
    }

    _sub(h, stick, flap, anyInput) {
        this._time = f32(this._time + h);
        this.phaseTime = f32(this.phaseTime + h);
        this._updateEffects(h);
        switch (this.p) {
            case Phase.Intro:
                this.player.modeT = f32(this.player.modeT + h); this.player.revealT = f32(this.player.revealT + h);
                for (const r of this.rivals) if (r.mode === RiderMode.Spawning) { r.modeT = f32(r.modeT + h); r.revealT = f32(r.revealT + h); }
                if (this.phaseTime >= this.introSeconds) { this.p = Phase.Playing; this.phaseTime = 0; this.player.modeT = 0; }
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
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // ---------------------------------------------------------------- one step of play
    _world(h, stick, flap, anyInput) {
        const p = this.player;

        // ---- the player
        if (p.mode === RiderMode.Spawning) {
            // materialised on the ledge, untouchable until he moves (or the wait runs out)
            p.modeT = f32(p.modeT + h); p.revealT = f32(p.revealT + h);
            if ((anyInput && p.modeT > 0.15) || p.modeT >= this.playerWaitMax) this._setMode(p, RiderMode.Flying);
        }
        if (p.mode === RiderMode.Flying) {
            if (flap) this._cues.emit(SoundCue.Tick);
            this._move(p, h, stick, flap, this.playerMaxVX);
            if (this.mercyActive && p.y > LAVA_Y - 6) {
                p.y = f32(LAVA_Y - 6); p.vy = f32(-150); p.grounded = false;
                this._burst(Fx.LavaSplash, p.x, LAVA_Y, -1);
            }
        } else if (p.mode === RiderMode.Grabbed) {
            if (flap) { p.grabFlaps++; this._cues.emit(SoundCue.Tick); p.sinceFlap = 0; }
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
                    if (r.modeT >= this.mountSeconds) { this._setMode(r, RiderMode.Flying); r.vy = f32(-80); r.grounded = false; r.thinkT = 0; }
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
            this._killPlayer('BURNED'); this.lavaDeaths++;
            this._note(LanceEvent.LavaDeath, p.x, p.y, false);
            this._burst(Fx.LavaSplash, p.x, LAVA_Y, -1);
            return;
        }
        for (const r of this.rivals) {
            if (r.mode === RiderMode.Flying && r.y >= LAVA_Y - 1) {
                r.mode = RiderMode.Gone; this.rivalBurns++;
                this._burst(Fx.LavaSplash, r.x, LAVA_Y, r.tier);
                this._note(LanceEvent.RivalBurned, r.x, r.y, false);
            }
        }

        this._updateHand(h);
        if (this.p !== Phase.Playing) return;
        this._updateEggs(h);
        this._jousts();
        if (this.p !== Phase.Playing) return;
        this._rivalBumps();
        this._spawnQueue(h);

        // ---- the wave is clear: every rival gone, every egg taken or lost
        if (this.queue.length === 0 && this.eggsLeft === 0) {
            let any = false;
            for (const r of this.rivals) if (r.active) { any = true; break; }
            if (!any) { this._note(LanceEvent.WaveClear, p.x, p.y, false); this._endRound(RoundResult.Won); }
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
        for (const L of LEDGES) {
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
        for (const L of LEDGES) {
            const shift = overlaps(r.x, r.y, RIDER_HALF_W, RIDER_H, L);
            if (Number.isNaN(shift)) continue;
            if (r.vy >= 0 && f32(r.y - r.vy * h) <= L.top + 1.5) { r.y = L.top; r.vy = 0; landed = true; }
            else if (r.vy < 0) { r.y = f32(L.bottom + RIDER_H + 0.01); r.vy = f32(Math.abs(r.vy) * 0.3); }
            else { r.y = L.top; r.vy = 0; landed = true; }
        }
        if (landed) r.grounded = true;
        else if (r.grounded && !supported(r.x, r.y, FOOT_HALF_W)) r.grounded = false;
        if (r.y < CEILING_FEET) { r.y = CEILING_FEET; if (r.vy < 0) r.vy = f32(-r.vy * 0.3); }

        // skimming the pits (the hand's cue)
        if (!r.grounded && r.y > HAND_LINE && !overBase(r.x)) r.skim = f32(r.skim + h); else r.skim = 0;
    }

    // ---------------------------------------------------------------- the rivals' brain
    _brain(r, h) {
        const p = this.player;
        const t = r.tier;
        r.thinkT = f32(r.thinkT - h);
        if (r.thinkT <= 0) {
            r.thinkT = f32(TIER_THINK[t] * this.reactMul * (0.7 + 0.6 * this.rng.nextDouble()));
            const playerUp = p.mode === RiderMode.Flying || p.mode === RiderMode.Spawning;
            const below = f32(r.y - p.y), pdx = wrapDx(f32(p.x - r.x));
            r.chasing = playerUp && this.rng.nextDouble() < TIER_CHASE[t] * this.chaseMul;
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
            const panic = !r.grounded && r.height < 32 && r.vy > -100 && !overBase(r.x);
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
        this._move(r, h, thrust, flap, TIER_SPEED[t] * this.speedMul);
    }

    // ---------------------------------------------------------------- the lava hand
    _updateHand(h) {
        switch (this.hand) {
            case HandState.Idle: {
                this.handCool = f32(this.handCool - h);
                if (this.handCool > 0) break;
                let pick = null;
                if (this.player.mode === RiderMode.Flying && !this.mercyActive && this.player.skim >= this.skimTrigger) pick = this.player;
                if (pick == null) for (const r of this.rivals) if (r.mode === RiderMode.Flying && r.skim >= this.skimTrigger) { pick = r; break; }
                if (pick != null) { this.hand = HandState.Rising; this.handT = 0; this.handX = pick.x; this.handVictim = pick; }
                break;
            }
            case HandState.Rising: {
                this.handT = f32(this.handT + h);
                this.handReach = Math.min(1, this.handT / this.handRise);
                if (this.handVictim != null && this.handVictim.mode === RiderMode.Flying) {
                    const d = wrapDx(f32(this.handVictim.x - this.handX)), step = f32(60 * h);
                    this.handX = wrap(f32(this.handX + (Math.abs(d) <= step ? d : Math.sign(d) * step)));
                }
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
                        this._note(LanceEvent.HandGrab, got.x, got.y, false);
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
                    this._note(LanceEvent.HandEscape, v.x, v.y, false);
                } else if (v.y >= LAVA_Y - 2 || this.handT >= this.handHold) {
                    this._burst(Fx.LavaSplash, v.x, LAVA_Y, v.tier);
                    this._note(LanceEvent.HandKill, v.x, v.y, false);
                    this.hand = HandState.Sinking; this.handT = 0; this.handVictim = null; this.handCool = 2.0;
                    if (v.isPlayer) { this._killPlayer('THE HAND'); }
                    else { v.mode = RiderMode.Gone; this.rivalBurns++; }
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
        return Math.abs(wrapDx(f32(r.x - this.handX))) < 12 && r.y > reachY - 3 && !overBase(r.x);
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
            for (const L of LEDGES) {
                const shift = overlaps(e.x, e.y, EGG_HALF_W, EGG_H, L);
                if (Number.isNaN(shift)) continue;
                const cx = f32(e.x - shift);
                e.x = cx < f32((L.x0 + L.x1) * 0.5) ? f32(L.x0 - EGG_HALF_W + shift - 0.01) : f32(L.x1 + EGG_HALF_W + shift + 0.01);
                e.vx = f32(-e.vx * 0.4);
            }
            e.x = wrap(e.x);
            if (!e.grounded) e.y = f32(e.y + e.vy * h);
            let landed = false;
            for (const L of LEDGES) {
                const shift = overlaps(e.x, e.y, EGG_HALF_W, EGG_H, L);
                if (Number.isNaN(shift)) continue;
                if (e.vy >= 0) { e.y = L.top; landed = true; }
                else { e.y = f32(L.bottom + EGG_H + 0.01); e.vy = f32(Math.abs(e.vy) * 0.3); }
            }
            if (landed) {
                if (e.vy > 70) { e.vy = f32(-e.vy * 0.35); e.grounded = false; }   // a little bounce
                else { e.vy = 0; e.grounded = true; }
            } else if (e.grounded && !supported(e.x, e.y, 1)) e.grounded = false;
            if (e.y < CEILING_FEET - 8) { e.y = f32(CEILING_FEET - 8); if (e.vy < 0) e.vy = 0; }

            if (e.y >= LAVA_Y) {
                e.alive = false; this.eggsLost++;
                this._burst(Fx.EggSizzle, e.x, LAVA_Y, e.tier);
                this._note(LanceEvent.EggLost, e.x, e.y, false);
                continue;
            }
            if (e.grounded && e.age >= this.hatchSeconds) {
                e.alive = false; this.hatched++;
                const tier = Math.min(2, e.tier + 1);
                const r = this._newRival(tier, e.x, e.y);
                r.mode = RiderMode.Hatchling; r.grounded = true; r.modeT = 0;
                this._note(LanceEvent.Hatch, e.x, e.y, false);
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
                    e.alive = false; this.eggsTaken++;
                    this.chain = Math.min(4, this.chain + 1);
                    const v = 250 * this.chain;
                    this._score += v;
                    this._popup(e.x, e.y - 10, v);
                    this._burst(Fx.EggSparkle, e.x, e.y - 3, e.tier);
                    this._cues.emit(SoundCue.Bonus);
                    this._note(LanceEvent.EggCollected, e.x, e.y, !p.grounded);
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
                r.mode = RiderMode.Gone; this.kills++;
                const v = TIER_SCORE[r.tier];
                this._score += v; this._popup(r.x, r.y - 16, v);
                this._burst(Fx.Unhorse, r.x, r.y - 5, r.tier);
                this._cues.emit(SoundCue.Hit);
                this._note(LanceEvent.HatchlingKill, r.x, r.y, false);
                continue;
            }
            if (r.bounceCool > 0) continue;

            const d = f32(r.y - p.y);                       // > 0: the player's lance is higher
            const air = !p.grounded && !r.grounded;
            this.jousts++;
            if (d > this.tieBand) {
                this._unhorse(r, air);
            } else if (d < -this.tieBand && !this.mercyActive) {
                this._note(LanceEvent.Joust, p.x, p.y, air, r.tier, d);
                this._flee(p.x, p.y, p.facing, -1);
                this._killPlayer('UNHORSED');
                return;
            } else {
                // level lances (or the mercy credit): both bounce apart
                const s = dx >= 0 ? -1 : 1;              // the player goes away from the rival
                p.vx = f32(s * 80); r.vx = f32(-s * 80);
                if (!p.grounded) p.vy = Math.min(p.vy, -30);
                if (!r.grounded) r.vy = Math.max(r.vy, 20);
                r.bounceCool = 0.35; this.bounces++;
                this._cues.emit(SoundCue.Miss);
                this._note(LanceEvent.Bounce, p.x, p.y, air, r.tier, d);
            }
        }
    }

    _unhorse(r, air) {
        r.mode = RiderMode.Gone; this.kills++;
        const v = TIER_SCORE[r.tier];
        this._score += v;
        this._popup(r.x, r.y - 18, v);
        this._burst(Fx.Unhorse, r.x, r.y - 7, r.tier);
        this._flee(r.x, r.y, r.facing, r.tier);
        const away = wrapDx(f32(r.x - this.player.x)) >= 0 ? 1 : -1;
        const egg = new Egg();
        egg.x = r.x; egg.y = Math.max(CEILING_FEET - 4, f32(r.y - 3));
        egg.vx = f32(r.vx * 0.5 + away * this.eggKnock);
        egg.vy = f32(Math.min(r.vy, 0) - 50);
        egg.tier = r.tier; egg.grounded = false;
        this.eggs.push(egg);
        this._cues.emit(SoundCue.Hit);
        this._note(LanceEvent.Joust, r.x, r.y, air, r.tier, f32(r.y - this.player.y));
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
        if (this.spawnCool > 0 || active >= this.maxActive) return;
        this._spawnNext(false);
        this.spawnCool = f32(this.spawnGap * (0.8 + 0.5 * this.rng.nextDouble()));
    }

    _spawnNext(atStart) {
        const tier = this.queue.shift();
        // the pad: the two farthest from the player, one at random; at the start, pads round the field
        let pad;
        if (atStart) {
            const order = [2, 3, 4, 0, 1];
            let used = 0;
            for (const r0 of this.rivals) if (r0.active) used++;
            pad = order[used % order.length];
        } else {
            let best = 0, second = 1, bd = -1, sd = -1;
            for (let i = 0; i < PAD_X.length; i++) {
                const d = Math.abs(wrapDx(f32(PAD_X[i] - this.player.x))) + Math.abs(PAD_Y[i] - this.player.y);
                if (d > bd) { second = best; sd = bd; best = i; bd = d; }
                else if (d > sd) { second = i; sd = d; }
            }
            pad = this.rng.nextDouble() < 0.5 ? best : second;
        }
        const nr = this._newRival(tier, PAD_X[pad], PAD_Y[pad]);
        nr.mode = RiderMode.Spawning; nr.modeT = 0; nr.grounded = true;
        this._note(LanceEvent.RivalSpawn, nr.x, nr.y, false);
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

    // ---------------------------------------------------------------- lives
    _killPlayer(cause) {
        const p = this.player;
        if (this.mercyActive) return;                        // cannot happen: the rules above never call it on mercy
        p.mode = RiderMode.Gone;
        this._lives--; this.deaths++;
        this.chain = 0;
        this.deathCause = cause;
        if (cause === 'UNHORSED') this._burst(Fx.Unhorse, p.x, p.y - 7, -1);
        this._cues.emit(SoundCue.Die);
        if (cause === 'UNHORSED') this._note(LanceEvent.Unhorsed, p.x, p.y, !p.grounded);
        this.p = Phase.Dying; this.phaseTime = 0;
    }

    _respawn() {
        const p = this.player;
        // the base, on whichever side is further from the nearest rival
        let bestX = PLAYER_PAD_X, bestD = -1;
        for (const x of [PLAYER_PAD_X, f32(104), f32(200)]) {
            let near = 999;
            for (const r of this.rivals) if (r.active) near = Math.min(near, Math.abs(wrapDx(f32(r.x - x))) + Math.abs(r.y - BASE_TOP));
            if (near > bestD) { bestD = near; bestX = x; }
        }
        p.x = bestX; p.y = BASE_TOP; p.vx = p.vy = 0; p.grounded = true; p.skim = 0; p.grabFlaps = 0; p.revealT = 0;
        this._setMode(p, RiderMode.Spawning);
        if (this.hand === HandState.Holding && this.handVictim === p) { this.hand = HandState.Sinking; this.handVictim = null; }
        this.p = Phase.Playing; this.phaseTime = 0;
        this._cues.emit(SoundCue.Start);
    }

    _endRound(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    // ---------------------------------------------------------------- effects + log
    _burst(kind, x, y, tier) {
        this.effects.push({ kind, x, y, tier, value: 0, facing: 1, vx: 0, vy: 0, t: 0, life: kind === Fx.LavaSplash ? 0.8 : kind === Fx.EggSizzle ? 0.7 : 0.6 });
    }

    _popup(x, y, value) {
        this.effects.push({ kind: Fx.Popup, x, y, value, tier: -1, facing: 1, vx: 0, vy: -10, t: 0, life: 1.1 });
    }

    _flee(x, y, facing, tier) {
        // the riderless bird flaps away off the side of the screen
        const dir = facing !== 0 ? facing : 1;
        this.effects.push({ kind: Fx.FleeingBird, x, y, vx: dir * 110, vy: -45, tier, facing: dir, value: 0, t: 0, life: 3 });
    }

    _updateEffects(h) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const f = this.effects[i];
            f.t = f32(f.t + h);
            f.x = f32(f.x + f.vx * h); f.y = f32(f.y + f.vy * h);
            if (f.kind === Fx.FleeingBird && (f.x < -24 || f.x > FIELD_W + 24 || f.y < 20)) f.t = f.life;
            if (f.t >= f.life) this.effects.splice(i, 1);
        }
    }

    _note(kind, x, y, air, tier = -1, dy = 0) {
        this.log.push({ t: this._time, kind, x, y, airborne: air, tier, dy });
    }

    collectStats(into) {
        add(into, 'wave', this.waveSize);
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
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }
