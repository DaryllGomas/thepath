// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · THE RULES (ICabinetSim).
// Port of SpritePopSim.cs from Staging/Batch2/spritepop. Every C# float goes through f32().
//
// One screen of one-way platforms (tiles.js), wrap-around top and bottom. A round is one
// screen: 8-10 creatures drop in, the cub starts in the bottom-left corner with 3 lives.
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
//   SCORE       a pop is 100 x the chain (pops each within 1 s of the last: 100, 200, 300...);
//               fruit is 500.
//   CREATURES   WIND-UPS walk the platforms, turn at walls, drop off edges toward the cub and jump
//               up to a platform when the cub is above; WHISTLERS fly diagonally through
//               everything, bouncing off the walls, ceiling and floor, and re-aim at the cub now and
//               then. Touch a free creature and you lose a life.
//   HURRY UP    after HURRY SECONDS of play every free creature turns angry.
//   THE ROUND   is won when every creature has been popped (then 4 s to grab fruit, then the card);
//               it is lost when the last life goes.
//   MERCY       creature speed -10% per lost credit and the catch radius +2 px per lost credit
//               (knobs); on the unlosable credit (5) creatures DRIFT instead of hunting and the
//               cub cannot die.
//
// Deterministic for a seed: one SystemRandom for the round, fixed step order, no clock.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, CabinetInput, Pad } from '../../sdk/index.js';
import { SpritePopLevel } from './tiles.js';

export const PopEvent = Object.freeze({ Blow: 0, Trap: 1, Pop: 2, Fruit: 3, Escape: 4, Death: 5, Hurry: 6, Clear: 7, Arrive: 8 });

const Phase = Object.freeze({ Idle: 0, Ready: 1, Play: 2, Ouch: 3, Card: 4, Over: 5 });
const CState = Object.freeze({ Waiting: 0, Free: 1, Trapped: 2, Gone: 3 });
const Kind = Object.freeze({ WindUp: 0, Whistler: 1 });

const Tile = SpritePopLevel.Tile;
const InnerL = SpritePopLevel.InnerL, InnerR = SpritePopLevel.InnerR;
const Gravity = f32(760), JumpV = f32(300), MaxFall = f32(170);
const Shrink = f32(3);                                             // feet overlap margin for platforms
const CubStartX = f32(24), CubStartY = f32(SpritePopLevel.FloorRow * Tile - 16);

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
        this.think = 0;
        this.fy = 1;                    // whistler: vertical heading
        this.homeX = 0; this.homeY = 0; // where it lands in the drop-in
        this.jumping = false;
        this.edgeState = 0;             // 0 not at an edge, 1 decided to go over, 2 decided to turn
    }
}

export class Bubble {
    constructor() {
        this.id = 0;
        this.x = 0; this.y = 0;         // centre, field px
        this.face = 1;
        this.age = 0; this.life = 0; this.trapLeft = 0; this.trapTotal = 0; this.popIn = 0;
        this.alive = false;
        this.held = null;
        this.hard = false;              // an empty bubble past its soft time: floats, traps nothing
    }
    get r() { return this.held != null ? 11 : 8; }
}

export class Fruit extends PopBody {
    constructor() { super(); this.kind = 0; this.life = 0; this.age = 0; this.alive = false; }
}

const NoInput = new CabinetInput();

export class SpritePopSim {
    constructor() {
        // ------------------------------------------------------------------ the machine (not knobs)
        this.cubSpeed = f32(72);
        this.walkBase = f32(41.6); this.flyBase = f32(39);         // creature px/s before the speed knob
        this.blowCooldown = f32(0.28);
        this.maxBubbles = 10;                                        // blowing one more pops the oldest empty one
        this.shotSpeed = f32(240); this.shotTime = f32(0.4); this.shotOffset = f32(10);
        this.riseEmpty = f32(24); this.riseTrapped = f32(18); this.emptyLife = f32(9); this.topCurrent = f32(16);
        this.softTime = f32(1.2);                                    // after the shot, a bubble can still trap for this long; then it hardens
        this.popReach = f32(18);
        this.hitBox = f32(10); this.hitBoxY = f32(8);                // centre distance (x, y) at which a free creature gets the cub
        this.chainWindow = f32(1);
        this.popPoints = 100; this.fruitPoints = 500;
        this.readySeconds = f32(3.5); this.ouchSeconds = f32(2.7); this.cardSeconds = f32(4.5); this.clearSeconds = f32(4);
        this.guardSeconds = f32(2.5); this.hurryBanner = f32(2.2);

        // ------------------------------------------------------------------ knobs (resolved per credit)
        this.speedMul = 0; this.catchRadius = 0; this.trapSeconds = 0; this.angryMul = 0; this.chase = 0;
        this.jumpChance = 0; this.hurrySeconds = 0; this.fruitSeconds = 0; this.startLives = 0;
        this.startCreatures = 0; this.maxOnScreen = 0; this.arriveGap = 0; this.dodge = 0; this.warmup = 0;

        // ------------------------------------------------------------------ read-only state
        this.level = SpritePopLevel.get(0);
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.playTime = 0;
        this.credit = null;
        this.cub = new PopBody();
        this.guard = 0; this.blowAnim = 0; this.cool = 0;
        this.hurry = false; this.hurryT = 0;
        this.clearing = false; this.clearT = 0;
        this.deathX = 0; this.deathY = 0;
        this.chainNow = 0; this.lastPopT = 0;
        this.creatures = []; this.bubbles = []; this.fruits = []; this.popups = []; this.bursts = []; this.log = [];
        this.popped = 0; this.fruitTaken = 0; this.deaths = 0; this.escapes = 0; this.trapped = 0;
        this.blown = 0; this.maxChain = 0; this.chains = 0;

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0; this._bubbleIds = 0;
        this._time = 0; this._jumpBuf = 0; this._arriveT = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get round() { return Math.max(1, this.credit != null ? this.credit.number : 1); }
    get roundWon() { return this._result === RoundResult.Won; }

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

    get waitingCount() {
        let n = 0;
        for (const c of this.creatures) if (c.state === CState.Waiting) n++;
        return n;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Ouch: return CabinetState.Interlude;
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
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's ' + this.level.name.toLowerCase() + ': popped ' + this.popped + '/' + this.creatures.length +
            ' fruit ' + this.fruitTaken + ' deaths ' + this.deaths + ' escapes ' + this.escapes + ' best chain ' + this.maxChain + (this.hurry ? ' hurry' : '');
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? (Date.now() | 0) : seed);
        const rng = this._rng;
        this.speedMul = k.get('creatureSpeed');
        this.catchRadius = k.get('catchRadius');
        this.trapSeconds = k.get('trapSeconds');
        this.angryMul = k.get('angryMul');
        this.chase = k.get('chase');
        this.jumpChance = k.get('jumpChance');
        this.hurrySeconds = k.get('hurrySeconds');
        this.fruitSeconds = k.get('fruitSeconds');
        this.startLives = Math.max(1, roundEven(k.get('lives')));
        this.startCreatures = Math.max(1, roundEven(k.get('startCreatures')));
        this.maxOnScreen = Math.max(1, roundEven(k.get('maxOnScreen')));
        this.arriveGap = k.get('arriveGap');
        this.dodge = k.get('dodge');
        this.warmup = k.get('warmup');
        const cMin = roundEven(k.get('creaturesMin')), cMax = Math.max(cMin, roundEven(k.get('creaturesMax')));
        const whistlerShare = k.get('whistlerShare');

        const L = this.level = SpritePopLevel.get(rng.next(SpritePopLevel.count));
        this.creatures.length = 0; this.bubbles.length = 0; this.fruits.length = 0;
        this.popups.length = 0; this.bursts.length = 0; this.log.length = 0;
        this._score = 0; this._lives = this.startLives; this._time = 0; this.playTime = 0; this._jumpBuf = 0; this._bubbleIds = 0;
        this.popped = this.fruitTaken = this.deaths = this.escapes = this.trapped = this.blown = this.maxChain = this.chains = 0;
        this.chainNow = 0; this.lastPopT = f32(-99);
        this.hurry = false; this.hurryT = 0; this.clearing = false; this.clearT = 0;
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this._placeCub();
        this.guard = 0;

        // the round's creatures: the first few are on the screen at the bell (wind-ups on stand
        // spots, spread out; whistlers in the open air), the rest wait above the ceiling and drop
        // in through the gap one at a time (arriveGap apart, while fewer than maxOnScreen are out)
        const count = cMin + rng.next(cMax - cMin + 1);
        const whistlers = whistlerShare > 0 ? Math.max(1, roundEven(f32(count * whistlerShare))) : 0;
        const kinds = [];
        for (let i = 0; i < count; i++) kinds.push(i < whistlers ? Kind.Whistler : Kind.WindUp);
        for (let i = kinds.length - 1; i > 0; i--) { const j = rng.next(i + 1); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
        const spots = L.creatureSpots();
        for (let i = spots.length - 1; i > 0; i--) { const j = rng.next(i + 1); const t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
        const taken = [];
        const startN = Math.min(count, this.startCreatures);
        for (let i = 0; i < count; i++) {
            const c = new Creature();
            c.id = i; c.kind = kinds[i]; c.state = i < startN ? CState.Free : CState.Waiting;
            c.think = f32(f32(0.3) + f32(f32(rng.nextDouble()) * f32(0.6)));
            c.face = rng.next(2) === 0 ? -1 : 1; c.fy = rng.next(2) === 0 ? -1 : 1;
            this.creatures.push(c);
            if (i >= startN) continue;
            if (c.kind === Kind.Whistler) {
                const row = (i % 2 === 0) ? 3 + rng.next(2) : 6 + rng.next(2);
                c.homeX = f32((4 + rng.next(11)) * Tile); c.homeY = f32(row * Tile);
            } else {
                let pick = -1;
                for (const n of spots) {
                    if (taken.includes(n) || L.nodeRow(n) === SpritePopLevel.FloorRow) continue;
                    let near = false;
                    for (const t of taken)
                        if (L.nodeRow(t) === L.nodeRow(n) && Math.abs(L.nodeCol(t) - L.nodeCol(n)) < 4) { near = true; break; }
                    if (!near) { pick = n; break; }
                }
                if (pick < 0) for (const n of spots) if (!taken.includes(n)) { pick = n; break; }
                taken.push(pick);
                c.homeX = f32(L.nodeCol(pick) * Tile);
                c.homeY = f32(L.nodeRow(pick) * Tile - c.h);
                c.face = c.homeX < 152 ? 1 : -1;
            }
            c.x = c.homeX; c.y = f32(-40); c.grounded = false; c.vx = 0; c.vy = 0;
        }
        this._arriveT = 0;
        this.p = Phase.Ready; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
    }

    _placeCub() {
        const c = this.cub;
        c.x = CubStartX; c.y = CubStartY; c.vx = 0; c.vy = 0;
        c.grounded = true; c.face = 1; c.anim = 0;
        this.cool = 0; this.blowAnim = 0;
    }

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
                if (this.phaseTime >= this.readySeconds) {
                    for (const c of this.creatures)
                        if (c.state === CState.Free) { c.x = c.homeX; c.y = c.homeY; c.grounded = c.kind === Kind.WindUp; }
                    this.p = Phase.Play; this.phaseTime = 0;
                    this._cues.emit(SoundCue.Start);
                }
                break;
            case Phase.Play:
                this._playStep(dt, input);
                break;
            case Phase.Ouch:
                if (this.phaseTime >= this.ouchSeconds) {
                    if (this._lives > 0) { this._placeCub(); this.guard = this.guardSeconds; this.p = Phase.Play; this.phaseTime = 0; this._jumpBuf = 0; }
                    else this._enterCard(RoundResult.Lost);
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // the drop-in: each creature falls from above the ceiling to its spot, staggered
    _dropIn() {
        for (let i = 0; i < this.creatures.length; i++) {
            const c = this.creatures[i];
            if (c.state !== CState.Free) continue;
            let k = f32(f32(f32(this.phaseTime - f32(0.15)) - f32(i * f32(0.12))) / f32(1.1));
            if (k < 0) k = 0; else if (k > 1) k = 1;
            const e = f32(k * k);                                   // falls, accelerating
            c.x = c.homeX;
            c.y = f32(f32(-40) + f32(f32(c.homeY + 40) * e));
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
            if (p.t > 1) this.popups.splice(i, 1);
        }
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.t = f32(b.t + dt);
            if (b.t > f32(0.35)) this.bursts.splice(i, 1);
        }
        if (this.hurry) this.hurryT = f32(this.hurryT + dt);
    }

    // ------------------------------------------------------------------ play
    _playStep(dt, input) {
        this.playTime = f32(this.playTime + dt);
        if (!this.hurry && this.playTime >= this.hurrySeconds) {
            this.hurry = true; this.hurryT = 0;
            for (const c of this.creatures) if (c.state !== CState.Gone) c.angry = true;
            this._cues.emit(SoundCue.Tick);
            this._emit(PopEvent.Hurry, f32(152), f32(96));
        }

        this._arrivals(dt);
        this._updateCub(dt, input);
        for (const c of this.creatures) if (c.state === CState.Free) this._updateCreature(c, dt);
        this._updateBubbles(dt);
        this._updateFruit(dt);

        // a free creature on the cub: a life
        if (this.guard <= 0 && !this.mercyActive) {
            const cub = this.cub;
            for (const c of this.creatures)
                if (c.state === CState.Free && Math.abs(f32(c.cx - cub.cx)) < this.hitBox && Math.abs(f32(c.cy - cub.cy)) < this.hitBoxY) {
                    this._die(c);
                    return;
                }
        }

        if (!this.clearing && this.creaturesLeft === 0) {
            this.clearing = true; this.clearT = 0;
            this._emit(PopEvent.Clear, this.cub.cx, this.cub.cy);
        }
        if (this.clearing) {
            this.clearT = f32(this.clearT + dt);
            if (this.clearT >= this.clearSeconds) this._enterCard(RoundResult.Won);
        }
    }

    // the next creature drops in through the ceiling gap
    _arrivals(dt) {
        this._arriveT = f32(this._arriveT + dt);
        const on = this.onScreen;
        if (on >= this.maxOnScreen) { this._arriveT = Math.min(this._arriveT, f32(this.arriveGap * f32(0.5))); return; }
        if (this._arriveT < this.arriveGap) return;                  // a steady clock: an empty screen is a lull (grab the fruit)
        const L = this.level;
        for (const c of this.creatures) {
            if (c.state !== CState.Waiting) continue;
            c.state = CState.Free;
            const a = f32(f32(this._rng.nextDouble()) * (L.gapR - L.gapL + 1));
            c.x = f32(f32(f32(L.gapL + a) * Tile) - f32(c.w * 0.5));
            c.x = clamp(c.x, f32(L.gapL * Tile), f32((L.gapR + 1) * Tile - c.w));
            c.y = f32(-c.h); c.vx = 0; c.vy = f32(60); c.grounded = false; c.jumping = false; c.edgeState = 0;
            c.fy = 1; c.think = f32(0.8); c.angry = this.hurry;
            this._emit(PopEvent.Arrive, c.cx, 0);
            this._arriveT = 0;
            return;
        }
    }

    _die(by) {
        this._lives--; this.deaths++;
        this.deathX = this.cub.x; this.deathY = this.cub.y;
        this._cues.emit(SoundCue.Die);
        this._emit(PopEvent.Death, this.cub.cx, this.cub.cy, 0, by != null && by.angry);
        this.p = Phase.Ouch; this.phaseTime = 0;
    }

    _updateCub(dt, input) {
        const cub = this.cub;
        const l = input.held(Pad.Left), r = input.held(Pad.Right);
        const mx = l && !r ? -1 : r && !l ? 1 : 0;
        cub.vx = f32(mx * this.cubSpeed);
        if (mx !== 0) cub.face = mx;
        if (input.pressed(Pad.Up) || input.pressed(Pad.B)) this._jumpBuf = f32(0.15);
        if (this._jumpBuf > 0 && cub.grounded) { cub.vy = -JumpV; cub.grounded = false; this._jumpBuf = 0; }
        this._jumpBuf = f32(this._jumpBuf - dt);
        this._move(cub, dt);
        if (cub.grounded && mx !== 0) cub.anim = f32(cub.anim + dt); else if (cub.grounded) cub.anim = 0; else cub.anim = f32(cub.anim + dt);
        if (this.cool > 0) this.cool = f32(this.cool - dt);
        if (this.guard > 0) this.guard = f32(this.guard - dt);
        if (this.blowAnim > 0) this.blowAnim = f32(this.blowAnim - dt);
        if (input.pressed(Pad.A) && this.cool <= 0) this._blow();
    }

    _aliveBubbles() { let n = 0; for (const b of this.bubbles) if (b.alive) n++; return n; }

    _blow() {
        if (this._aliveBubbles() >= this.maxBubbles) {
            // the oldest empty bubble makes room (it just pops)
            let oldest = null;
            for (const o of this.bubbles) if (o.alive && o.held == null && (oldest == null || o.age > oldest.age)) oldest = o;
            if (oldest == null) return;
            this._pop(oldest, false);
        }
        const cub = this.cub;
        const b = new Bubble();
        b.id = this._bubbleIds++; b.face = cub.face; b.alive = true; b.life = this.emptyLife;
        b.x = f32(cub.cx + f32(cub.face * this.shotOffset)); b.y = f32(cub.cy - 1);
        b.x = clamp(b.x, f32(InnerL + 8), f32(InnerR - 8));
        this.bubbles.push(b);
        this.cool = this.blowCooldown; this.blowAnim = f32(0.2); this.blown++;
        // a wind-up in the bubble's path on its own platform may see it coming and hop
        for (const c of this.creatures) {
            if (c.state !== CState.Free || c.kind !== Kind.WindUp || !c.grounded) continue;
            const ahead = f32(f32(c.cx - b.x) * b.face);
            if (ahead < 12 || ahead > 64 || Math.abs(f32(c.cy - b.y)) > 12) continue;
            if (this._chance(this.mercyActive ? 0 : f32(this.dodge * (c.angry ? f32(1.4) : 1)))) this._hop(c);
        }
        this._cues.emit(SoundCue.Tick);
        this._emit(PopEvent.Blow, b.x, b.y);
    }

    // ------------------------------------------------------------------ physics
    // Moves a walker: walls left/right, one-way platforms (land from above only), the ceiling
    // (solid from below except over the gap) and the top/bottom wrap through the gaps.
    // Returns hitWall (C#'s out bool; the out `wrapped` is never read by a caller).
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
        const b = c.kind === Kind.WindUp ? this.walkBase : this.flyBase;
        const warm = this.warmup > 0 ? f32(f32(0.7) + f32(f32(0.3) * Math.min(1, f32(this.playTime / this.warmup)))) : 1;   // they start slow and wind up
        return f32(f32(f32(b * this.speedMul) * warm) * (c.angry ? this.angryMul : 1));
    }

    _updateCreature(c, dt) {
        c.anim = f32(c.anim + dt);
        const sp = this._creatureSpeed(c);
        if (c.kind === Kind.Whistler) { this._fly(c, sp, dt); return; }

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
        const cub = this.cub;
        const dx = f32(cub.cx - c.cx), dy = f32(cub.feet - c.feet);
        const toward = dx >= 0 ? 1 : -1;
        if (Math.abs(dy) < 10) { if (this._chance(this.chase)) c.face = toward; else if (this._chance(0.3)) c.face = -c.face; }
        else if (dy < 0) {
            if (canJump && this._chance(this.jumpChance)) this._jumpUp(c);
            else if (this._chance(f32(this.chase * f32(0.5)))) c.face = toward;
        }
        else if (this._chance(this.chase)) c.face = toward;
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
            if (!this.mercyActive && this._chance(this.chase)) { c.face = cub.cx >= c.cx ? 1 : -1; c.fy = cub.cy >= c.cy ? 1 : -1; }
            else if (this._chance(0.3)) c.fy = -c.fy;
        }
        c.x = f32(c.x + f32(f32(c.face * sp) * dt));
        c.y = f32(c.y + f32(f32(f32(c.fy * sp) * f32(0.75)) * dt));
        if (c.x < InnerL) { c.x = f32(InnerL); c.face = 1; }
        if (c.x > InnerR - c.w) { c.x = f32(InnerR - c.w); c.face = -1; }
        if (c.y < SpritePopLevel.CeilingY) { c.y = f32(SpritePopLevel.CeilingY); c.fy = 1; }
        const floor = f32(SpritePopLevel.FloorRow * Tile - c.h);
        if (c.y > floor) { c.y = floor; c.fy = -1; }
    }

    // ------------------------------------------------------------------ bubbles
    _updateBubbles(dt) {
        const top0 = f32(SpritePopLevel.CeilingY);
        const L = this.level, cub = this.cub;
        for (let i = 0; i < this.bubbles.length; i++) {
            const b = this.bubbles[i];
            if (!b.alive) continue;
            b.age = f32(b.age + dt);
            if (b.held == null && !b.hard && b.age >= f32(this.shotTime + this.softTime)) b.hard = true;
            if (b.popIn > 0) {
                b.popIn = f32(b.popIn - dt);
                if (b.popIn <= 0) { this._pop(b, true); continue; }
            }
            const r = b.r;
            if (b.held == null && b.age < this.shotTime) {
                b.x = f32(b.x + f32(f32(f32(b.face * this.shotSpeed) * f32(1 - f32(b.age / this.shotTime))) * dt));
            } else {
                b.y = f32(b.y - f32((b.held != null ? this.riseTrapped : this.riseEmpty) * dt));
                b.x = f32(b.x + f32(f32(f32(Math.sin(f32(f32(b.age * f32(3.1)) + b.id))) * 7) * dt));
                if (b.y <= f32(top0 + r)) {
                    b.y = f32(top0 + r);
                    const col = SpritePopLevel.colOf(b.x);
                    const drift = L.topDrift[col];
                    if (drift === 0) {
                        // settle over the middle of a reachable column's run, nudged apart by neighbours
                        for (const o of this.bubbles) {
                            if (o === b || !o.alive || o.y > f32(f32(top0 + o.r) + 1)) continue;
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

            if (b.held == null) {
                b.life = f32(b.life - dt);
                if (b.life <= 0) { this._pop(b, false); continue; }
                if (!b.hard) {
                    const cr2 = f32(this.catchRadius * this.catchRadius);
                    for (const c of this.creatures) {
                        if (c.state !== CState.Free) continue;
                        const dx = f32(c.cx - b.x), dy = f32(c.cy - b.y);
                        if (f32(f32(dx * dx) + f32(dy * dy)) < cr2) { this._trapIn(b, c); break; }
                    }
                } else {
                    // a hardened bubble is just a bubble: touch it and it pops, and so do its neighbours
                    const dx = f32(cub.cx - b.x), dy = f32(cub.cy - b.y), reach = f32(this.popReach - 2);
                    if (f32(f32(dx * dx) + f32(dy * dy)) < f32(reach * reach)) this._pop(b, true);
                }
            } else {
                b.trapLeft = f32(b.trapLeft - dt);
                if (b.trapLeft <= 0) { this._release(b); continue; }
                b.held.x = f32(b.x - f32(b.held.w * 0.5)); b.held.y = f32(b.y - f32(b.held.h * 0.5));
                const dx = f32(cub.cx - b.x), dy = f32(cub.cy - b.y);
                if (f32(f32(dx * dx) + f32(dy * dy)) < f32(this.popReach * this.popReach)) this._pop(b, true);
            }
        }
        removeDead(this.bubbles);
    }

    _trapIn(b, c) {
        b.held = c; b.trapLeft = this.trapSeconds; b.trapTotal = this.trapSeconds; b.life = 0;
        c.state = CState.Trapped; c.vx = 0; c.vy = 0; c.grounded = false; c.jumping = false; c.edgeState = 0;
        b.x = clamp(b.x, f32(InnerL + 11), f32(InnerR - 11));
        this.trapped++;
        this._cues.emit(SoundCue.Hit);
        this._emit(PopEvent.Trap, b.x, b.y, 0, c.angry);
    }

    _release(b) {
        const c = b.held;
        b.alive = false; b.held = null;
        c.state = CState.Free; c.angry = true;
        c.x = clamp(f32(b.x - f32(c.w * 0.5)), f32(InnerL), f32(InnerR - c.w));
        c.y = f32(b.y - f32(c.h * 0.5));
        c.vx = 0; c.vy = 0; c.grounded = false; c.jumping = false; c.think = f32(0.4); c.edgeState = 0;
        if (c.kind === Kind.Whistler) c.fy = 1;
        this.escapes++;
        this.bursts.push({ x: b.x, y: b.y, t: 0, big: false });
        this._cues.emit(SoundCue.Miss);
        this._emit(PopEvent.Escape, b.x, b.y, 0, true);
    }

    _pop(b, spread) {
        if (!b.alive) return;
        b.alive = false;
        this.bursts.push({ x: b.x, y: b.y, t: 0, big: b.held != null });
        if (b.held != null) {
            const c = b.held;
            b.held = null;
            c.state = CState.Gone;
            this.chainNow = f32(this._time - this.lastPopT) <= this.chainWindow && this.chainNow > 0 ? this.chainNow + 1 : 1;
            this.lastPopT = this._time;
            const pts = this.popPoints * this.chainNow;
            this._score += pts; this.popped++;
            if (this.chainNow > this.maxChain) this.maxChain = this.chainNow;
            if (this.chainNow >= 2) this.chains++;
            this.popups.push({ x: b.x, y: f32(b.y - 6), t: 0, text: String(pts), chain: this.chainNow });
            const f = new Fruit();
            f.kind = (this.popped - 1) % 4; f.alive = true; f.life = this.fruitSeconds;
            f.x = clamp(f32(b.x - 8), f32(InnerL), f32(InnerR - 16)); f.y = f32(b.y - 8);
            f.vx = this._range(f32(-55), f32(55)); f.vy = f32(-170);
            this.fruits.push(f);
            this._cues.emit(SoundCue.Bonus);
            this._emit(PopEvent.Pop, b.x, b.y, this.chainNow, c.angry);
        }
        if (!spread) return;
        for (const o of this.bubbles) {
            if (!o.alive || o === b || o.popIn > 0) continue;
            const dx = f32(o.x - b.x), dy = f32(o.y - b.y), reach = f32(f32(b.r + o.r) + 4);
            if (f32(f32(dx * dx) + f32(dy * dy)) < f32(reach * reach)) o.popIn = f32(0.1);
        }
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
                this._score += this.fruitPoints;
                this.popups.push({ x: f.cx, y: f32(f.y - 4), t: 0, text: String(this.fruitPoints), chain: 0 });
                this._cues.emit(SoundCue.Bonus);
                this._emit(PopEvent.Fruit, f.cx, f.cy);
            }
        }
        removeDead(this.fruits);
    }

    // ------------------------------------------------------------------ helpers
    _emit(kind, x, y, chain = 0, angry = false) {
        this.log.push({ t: this._time, kind, x, y, chain, angry });
    }

    _chance(p) { return this._rng.nextDouble() < p; }
    _range(a, b) { return f32(a + f32(f32(b - a) * f32(this._rng.nextDouble()))); }

    collectStats(into) {
        add(into, 'creatures', this.creatures.length);
        add(into, 'popped', this.popped);
        add(into, 'trapped', this.trapped);
        add(into, 'escapes', this.escapes);
        add(into, 'deaths', this.deaths);
        add(into, 'fruit', this.fruitTaken);
        add(into, 'bubbles', this.blown);
        add(into, 'chains', this.chains);
        add(into, 'maxChain', this.maxChain);
        add(into, 'hurry', this.hurry ? 1 : 0);
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
SpritePopSim.Gravity = Gravity;
SpritePopSim.JumpV = JumpV;
SpritePopSim.MaxFall = MaxFall;
SpritePopSim.Shrink = Shrink;
SpritePopSim.CubStartX = CubStartX;
SpritePopSim.CubStartY = CubStartY;
