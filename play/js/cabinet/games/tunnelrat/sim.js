// THE NODE · world 1 · TUNNEL RAT on the Cabinet Engine · THE SIM (ICabinetSim).
// Built out (2026-10-18) from the bit-exact port of TunnelRatSim.cs (Staging/Batch2/tunnelrat) into a
// whole game: eight depths, a queen at the bottom. Parity with the C# reference is retired.
//
// A Dig Dug. The earth is 19 x 12 tiles of 16 px in four colour strata under a strip of sky. The
// digger walks the tile lattice (4-way, turning only on tile lines) and every pixel it covers is dug;
// the dug state is kept per 4 px sub-cell (TunnelField) so the tunnel grows with the digger.
//
//   PESTS     start in pre-dug pockets (stages.js says which, depth by depth):
//               goggle-bug   walks the tunnels                fire-lizard  + breathes fire along open tunnel
//               driller      bores its own tunnel to you      shade        drifts through earth; only solid
//               scorcher     + its fire burns a tunnel             (pumpable, deadly) in the open
//                              through earth (an ember line glows first)
//             Bugs, lizards and scorchers GHOST: far from the digger they may leave their body and drift
//             straight through the earth toward it, re-forming on the first dug tile they cross.
//             From depth 2 the LAST pest runs for the sky: up the tunnels (or as a ghost) and away.
//   PUMP      hold A: the hose shoots 3 tiles along open tunnel; a pest it catches inflates one stage
//             every pumpStep while A stays held and pops on the 4th. Release A and the pest deflates a
//             stage at a time; an inflated pest is frozen and harmless.
//   ROCKS     sit in the earth. Dig out the strip under one and it wobbles (it holds while the digger
//             is right under it), then falls through open tunnel until earth stops it, crushing every
//             pest (and the digger) in its path: 1000, 2000, 3000 ... a rock, double for a rock that
//             fell because the one under it did (a CHAIN). After two rocks fall a bonus vegetable sits
//             at the centre for 10 s.
//   THE QUEEN (depth 8) bores through the earth toward the digger, 32 px across, and lays an egg (a
//             bug) every eggEvery seconds. Pump her queenPumps strokes without letting go: let go and
//             she shrinks back a stroke at a time. A rock on her cracks her shell (3 strokes fewer, a
//             stun). Popping her pops her brood and wins the game.
//   A COIN    3 lives, an extra one at 10000 and every 30000 after. Each depth: its card, the dig, a
//             CLEAR beat and a tally (DEPTH, SPEED and NO-MISS bonuses). Won = the queen popped; lost =
//             the last life gone. Pop 200/300/400/500 by stratum (+100 a driller or scorcher, +200 a
//             shade), the vegetable 400 .. 5000 by depth, the queen 10000.
//   HURRY     hurryAt seconds into a depth the pests speed up and ghost more (no stalemates).
//
// MERCY comes in through the knobs (spec.js). The unlosable credit (CreditInfo.unlosable): pests barely
// move and barely ghost (knob caps), the queen is slow and nearly popped, and the digger cannot die.
// The attract demo (isDemo) starts on a depth between 2 and 7, to show the variety.
//
// SOUND: the SDK cues, plus the sim's own events (recordEvents/events/_emit, Starvector's pattern) that
// sound.js plays: hose, hook, pump, pop, dig, breath, fire, ghost, drill, shadeOut, wobble, rockFall,
// crush, rockLand, vegUp, veg, flee, escape, die, extraLife, hurry, card, go, stageClear, tally,
// tallyDone, queenLay, queenEgg, queenPump, queenShrink, queenWound, queenPop.
// NUMBER NOTE: the positions are doubles (as the C# was); the timers and the knob-resolved speeds keep
// the f32() habit of the port.
import {
    f32, idiv, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4, SystemRandom,
} from '../../sdk/index.js';
import { STAGES, StageCount } from './stages.js';

const FW = 19, FH = 12, FTile = 16, FSub = 4;
const FSW = FW * FTile / FSub, FSH = FH * FTile / FSub;      // 76 x 48
const FPxW = FW * FTile, FPxH = FH * FTile;                  // 304 x 192

export class TunnelField {
    constructor() {
        this._dug = new Uint8Array(FSW * FSH);
        // what the renderer's earth cache reads: gen bumps on clear(); tileVer[t] = the version of the last
        // change on or next to tile t (a dug sub-cell changes its tile's lip and its neighbours')
        this.gen = 0; this.version = 0;
        this.tileVer = new Uint32Array(FW * FH);
    }

    clear() { this._dug.fill(0); this.gen++; }

    dug(sx, sy) { return sx >= 0 && sy >= 0 && sx < FSW && sy < FSH && this._dug[sy * FSW + sx] !== 0; }
    inSub(sx, sy) { return sx >= 0 && sy >= 0 && sx < FSW && sy < FSH; }

    static stratum(tileRow) { return Math.max(0, Math.min(3, idiv(tileRow, 3))); }
    static stratumAtPx(y) { return TunnelField.stratum(Math.floor((y + 8) / FTile)); }

    _set(sx, sy) {
        this._dug[sy * FSW + sx] = 1;
        const tx = sx >> 2, ty = sy >> 2, v = ++this.version;
        for (let j = Math.max(0, ty - 1); j <= Math.min(FH - 1, ty + 1); j++)
            for (let i = Math.max(0, tx - 1); i <= Math.min(FW - 1, tx + 1); i++) this.tileVer[j * FW + i] = v;
    }

    // mark every sub-cell a 16 x 16 body at (x, y) touches
    digRect(x, y) {
        let n = 0;
        const x0 = s0(x), x1 = s1(x), y0 = s0(y), y1 = s1(y);
        for (let sy = y0; sy <= y1; sy++)
            for (let sx = x0; sx <= x1; sx++)
                if (this.inSub(sx, sy) && this._dug[sy * FSW + sx] === 0) { this._set(sx, sy); n++; }
        return n;
    }

    digTile(tx, ty) {
        for (let j = 0; j < 4; j++)
            for (let i = 0; i < 4; i++) {
                const sx = tx * 4 + i, sy = ty * 4 + j;
                if (this.inSub(sx, sy) && this._dug[sy * FSW + sx] === 0) this._set(sx, sy);
            }
    }

    // a scorcher's flame: dig the 16 px band of row y from x0 to x1 (px, x0 < x1)
    burnSpan(x0, x1, y) {
        let n = 0;
        const a = Math.floor(x0 / FSub + 1e-9), b = Math.floor((x1 - 1e-6) / FSub), y0 = s0(y), y1 = s1(y);
        for (let sy = y0; sy <= y1; sy++)
            for (let sx = a; sx <= b; sx++)
                if (this.inSub(sx, sy) && this._dug[sy * FSW + sx] === 0) { this._set(sx, sy); n++; }
        return n;
    }

    // every sub-cell a 16 x 16 body at (x, y) touches is dug (and inside the earth)
    rectDug(x, y) {
        if (x < -1e-6 || y < -1e-6 || x > FPxW - FTile + 1e-6 || y > FPxH - FTile + 1e-6) return false;
        const x0 = s0(x), x1 = s1(x), y0 = s0(y), y1 = s1(y);
        for (let sy = y0; sy <= y1; sy++)
            for (let sx = x0; sx <= x1; sx++)
                if (!this.dug(sx, sy)) return false;
        return true;
    }

    rectAnyUndug(x, y) { return !this.rectDug(x, y); }

    tileDug(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= FW || ty >= FH) return false;
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (!this.dug(tx * 4 + i, ty * 4 + j)) return false;
        return true;
    }

    tileDugCount(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= FW || ty >= FH) return 0;
        let n = 0;
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (this.dug(tx * 4 + i, ty * 4 + j)) n++;
        return n;
    }

    // the top 4 px strip of a tile: all dug (any = false) or any dug (any = true)
    topStrip(tx, ty, any) {
        if (tx < 0 || ty < 0 || tx >= FW || ty >= FH) return false;
        let c = 0;
        for (let i = 0; i < 4; i++) if (this.dug(tx * 4 + i, ty * 4)) c++;
        return any ? c > 0 : c === 4;
    }

    // how far (px, up to max) a line along the middle of a body's row/column runs through open
    // tunnel from the body's front edge: the hose and the fire use it
    openRun(x, y, dir, max) {
        const horiz = dir === Dir4.Left || dir === Dir4.Right;
        const m0 = horiz ? s0(y) + 1 : s0(x) + 1, m1 = m0 + 1;
        const edge = dir === Dir4.Right ? x + FTile : dir === Dir4.Left ? x : dir === Dir4.Down ? y + FTile : y;
        const sgn = dir === Dir4.Right || dir === Dir4.Down ? 1 : -1;
        let run = 0;
        while (run < max) {
            const p = edge + sgn * (run + 0.5);
            const s = Math.floor(p / FSub);
            const ok = horiz ? (this.dug(s, m0) && this.dug(s, m1)) : (this.dug(m0, s) && this.dug(m1, s));
            if (!ok) break;
            const next = sgn > 0 ? (s + 1) * FSub - edge : edge - s * FSub;
            run = Math.max(run + 0.5, next);
        }
        return Math.min(run, max);
    }
}
TunnelField.W = FW; TunnelField.H = FH; TunnelField.Tile = FTile; TunnelField.Sub = FSub;
TunnelField.SW = FSW; TunnelField.SH = FSH; TunnelField.PxW = FPxW; TunnelField.PxH = FPxH;

function s0(v) { return Math.floor(v / FSub + 1e-9); }
function s1(v) { return Math.floor((v + FTile) / FSub - 1e-6); }

export const PestKind = Object.freeze({ Bug: 0, Lizard: 1, Driller: 2, Shade: 3, Scorcher: 4 });

export class Pest {
    constructor(id, kind) {
        this.id = id;
        this.kind = kind;
        this.minion = false;                                   // the queen's brood: not counted, pops with her
        this.x = 0; this.y = 0; this.homeX = 0; this.homeY = 0;
        this.dir = Dir4.Left; this.face = Dir4.Left;          // face: the way it looks (left/right)
        this.alive = true;
        this.death = 0;                                        // 1 popped, 2 crushed, 3 got away
        this.deadT = 0;
        this.ghost = false;
        this.ghostT = 0; this.ghostCool = 0;
        this.ghostFromX = 0; this.ghostFromY = 0;
        this.stage = 0;                                        // 0 normal, 1-3 inflated
        this.hooked = false;
        this.deflate = 0;
        this.breath = 0;                                       // 0 none, 1 wind-up, 2 fire
        this.breathT = 0; this.fireCool = 0;
        this.fireLen = 0;
        this.walk = 0;                                         // distance walked (animation)
        this.ghostVX = 0; this.ghostVY = 0;                    // a ghost's heading
        this.reform = 0;                                       // seconds left of re-forming after a ghost
        this.hatch = 0;                                        // seconds left in the egg (the queen's brood)
        this.stuckT = 0;                                       // seconds it has not been able to move
        this.popPoints = 0;
        this.open = true;                                      // a shade: its middle is in dug tunnel
        this.flee = false;                                     // the last pest, running for the sky
        this.escaping = false; this.escDir = -1;               // out of the earth, running off along the sky
        this.boring = false; this.drillT = 0;                  // a driller cutting earth (and its sound's clock)
        this.hitT = 0;                                         // the flash of a pump stroke
    }
    get breather() { return this.kind === PestKind.Lizard || this.kind === PestKind.Scorcher; }
    get lizard() { return this.breather; }
    get walker() { return this.kind === PestKind.Bug || this.kind === PestKind.Lizard || this.kind === PestKind.Scorcher; }
    get solid() { return this.alive && !this.ghost && !this.escaping && this.hatch <= 0 && (this.kind !== PestKind.Shade || this.open); }
    // (a shade coming out of the earth takes a beat to firm up: pumpable, harmless)
    get dangerous() { return this.solid && this.stage === 0 && !this.hooked && (this.kind !== PestKind.Shade || this.reform <= 0); }
}

export class Queen {
    constructor(c, r) {
        this.x = this.homeX = c * FTile; this.y = this.homeY = r * FTile;
        this.dir = Dir4.Up; this.face = Dir4.Left;
        this.alive = true; this.deadT = 0;
        this.inflate = 0; this.need = 12;                      // pump strokes on her, strokes that pop her
        this.hooked = false; this.holdT = 0; this.deflT = 0;
        this.wounds = 0; this.stunT = 0;
        this.eggT = 0; this.layT = 0;
        this.walk = 0; this.hitT = 0; this.boreT = 0;
    }
    get dangerous() { return this.alive && this.inflate === 0 && !this.hooked && this.stunT <= 0; }
}

export const RockState = Object.freeze({ Rest: 0, Wobble: 1, Fall: 2, Crumble: 3, Gone: 4 });

export class Rock {
    constructor(col, row, cracked) {
        this.col = col; this.row = row;
        this.x = col * FTile; this.y = row * FTile;
        this.state = RockState.Rest;
        this.t = 0;
        this.cracked = !!cracked;
        this.chained = false;                                  // fell because the rock under it did: pays double
        this.kills = 0;
    }
}

const Phase = Object.freeze({ Idle: 0, Ready: 1, Play: 2, Death: 3, Clear: 4, Card: 5, Over: 6, Tally: 7 });
const HoseState = Object.freeze({ None: 0, Out: 1, Hooked: 2, Back: 3 });

function overlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah; }

function mark(used, c, r) { if (c >= 0 && r >= 0 && c < FW && r < FH) used[r * FW + c] = 1; }

function nearestLine(v, preferHigh) {
    const lo = Math.floor(v / FTile) * FTile, hi = lo + FTile;
    const a = v - lo, b = hi - v;
    if (Math.abs(a - b) < 1e-6) return preferHigh ? hi : lo;
    return a < b ? lo : hi;
}

function snap(v) {
    const r = roundEven(v / FTile) * FTile;
    return Math.abs(v - r) < 1e-6 ? r : v;
}

function tileIx(x, y) {
    const tx = Math.max(0, Math.min(FW - 1, Math.trunc(roundEven(x / FTile))));
    const ty = Math.max(0, Math.min(FH - 1, Math.trunc(roundEven(y / FTile))));
    return ty * FW + tx;
}

// base + (float)rng.nextDouble() * span, all f32-rounded like the C# `base + (float)rng.NextDouble() * span`
function frand(rng, base, span) { return f32(f32(base) + f32(f32(rng.nextDouble()) * f32(span))); }

export class TunnelRatSim {
    static get Phase() { return Phase; }
    static get HoseState() { return HoseState; }

    static aligned(v) { return Math.abs(v - roundEven(v / FTile) * FTile) < 1e-6; }

    constructor() {
        this.StartCol = 9; this.StartRow = 5;
        this.Tile = FTile;
        this.stages = StageCount;

        // the machine's timing (not mercy knobs)
        this.cardSeconds = f32(3.0); this.reReadySeconds = f32(1.4); this.deathSeconds = f32(2.0);
        this.clearSeconds = f32(1.6); this.queenClearSeconds = f32(2.8); this.resultSeconds = f32(3.5);
        this.wobbleSeconds = f32(0.55); this.crackedWobble = f32(0.12); this.chainWobble = f32(0.3);
        this.crumbleSeconds = f32(0.6); this.fallSpeed = f32(110);
        this.deflateStep = f32(0.5); this.hoseSpeed = f32(220); this.hoseRange = f32(48); this.hoseCooldown = f32(0.12);
        this.fireRange = f32(48); this.scorchRange = f32(64); this.fireSpeed = f32(110); this.fireHold = f32(0.9);
        this.reformGap = f32(28); this.reformSeconds = f32(0.4); this.shadeFirm = f32(0.5);
        this.vegSeconds = f32(10);
        this.fleeDelay = f32(1.2); this.fleeBoost = f32(1.3);
        this.hurryBoost = f32(1.3);
        this.queenHold = f32(0.3); this.queenDeflate = f32(0.35); this.queenLay = f32(1.1); this.queenStun = f32(2.2);
        this.queenWoundPumps = 3; this.queenMinPumps = 4; this.maxBrood = 3;
        this.lives0 = 3; this.maxLives = 6;
        this.extraFirst = 10000; this.extraEvery = 30000;
        this.pointsQueen = 10000; this.pointsWound = 2000;

        // read-only state (the renderer and the bot read these)
        this.field = new TunnelField();
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.stage = 0; this.def = STAGES[0]; this.queenStage = false;
        this.dx = 0; this.dy = 0;
        this.facing = Dir4.Right;
        this.diggerMoving = false; this.diggerDigging = false;
        this.diggerWalk = 0;
        this.hose = HoseState.None; this.hoseLen = 0; this.hoseDir = Dir4.Right;
        this.hookedPest = null; this.hookedQueen = false;
        this.pumpStrokes = 0;
        this.pests = []; this.rocks = []; this.queen = null;
        this.vegActive = false; this.vegT = 0;
        this.rocksFallen = 0;
        this.deathCause = 0;
        this.credit = null;
        this.isDemo = false;
        this.playSeconds = 0; this.stageTime = 0;
        this.readyLength = 0; this.cardUp = false;
        this.hurry = false; this.hurryT = f32(-1);
        this.fleeing = null;
        this.escaped = 0;
        this.stageDeaths = 0;
        this.tally = []; this.tallyT = 0; this.tallyEnd = 0;
        this.extraT = f32(-1);
        this.shake = 0; this.shakeAmp = 1;
        this.fx = [];                                          // particles: { x, y, vx, vy, g, t, life, c }
        this.popups = [];                                      // floating text: { x, y, t, text, c }
        this.recordEvents = false; this.events = [];

        // knobs (resolved)
        this.walkSpeed = 0; this.digSpeed = 0; this.bugSpeed = 0; this.lizardSpeed = 0; this.ghostSpeed = 0;
        this.drillSpeed = 0; this.shadeSpeed = 0;
        this.pestSpeedMul = 0; this.ghostRate = 0; this.ghostFar = 0; this.chase = 0;
        this.fireAim = 0; this.fireIdle = 0; this.fireWindup = 0; this.pumpStep = 0;
        this.crowd = 1; this.maxGhosts = 0; this.crackedRock = false;
        this.queenPumps = 12; this.queenSpeed = 12; this.eggEvery = 8; this.hurryAt = 75;

        this._cues = new CueBuffer();
        this._log = '';
        this.rng = new SystemRandom(1);
        this._fxSeed = 1;
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0; this._nextExtra = 0;
        this._time = 0; this._hoseCool = 0; this._ghostGrace = 0; this._pumpT = 0;
        this._vegDone = false; this._lastOneT = 0; this._digAcc = 0; this._tallyDone = false;
        this._fleeMap = new Int16Array(FW * FH); this._fleeMapT = 0;
        this._q = new Int16Array(FW * FH);
        this._cand = new Int32Array(4);
        this._st = {};
    }

    get mercyActive() { return this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    // the pests that count toward a clear (the queen's brood never does)
    get pestsLeft() { let n = 0; for (const p of this.pests) if (p.alive && !p.minion) n++; return n; }
    get pumpPhase() { return this.pumpStep > 0 ? f32(this._pumpT / this.pumpStep) : 0; }
    get lastStage() { return this.stage >= this.stages; }
    get screen() { return this.stage; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Death: case Phase.Clear: case Phase.Tally: return CabinetState.Interlude;
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
        const s = this._st;
        return r + ' depth ' + this.stage + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this._lives +
               ' pops ' + s.pops + ' crush ' + s.crush + ' veg ' + s.veg + ' log ' + this._log.trimEnd();
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = new SystemRandom(seed === 0 ? undefined : seed);
        this._fxSeed = (seed | 0) ^ 0x2545F491;
        this.walkSpeed = k.get('walkSpeed'); this.digSpeed = k.get('digSpeed');
        this.pestSpeedMul = k.get('pestSpeed');
        this.bugSpeed = k.get('bugSpeed'); this.lizardSpeed = k.get('lizardSpeed'); this.ghostSpeed = k.get('ghostSpeed');
        this.drillSpeed = k.get('drillSpeed'); this.shadeSpeed = k.get('shadeSpeed');
        this.ghostRate = k.get('ghostRate'); this.ghostFar = k.get('ghostFar'); this.chase = k.get('chase');
        this.fireAim = k.get('fireAim'); this.fireIdle = k.get('fireIdle'); this.fireWindup = k.get('fireWindup');
        this.pumpStep = k.get('pumpStep');
        this.crowd = k.get('crowd');
        this.maxGhosts = Math.trunc(k.get('maxGhosts'));
        this.crackedRock = k.get('crackedRock') >= f32(0.5);
        this.queenPumps = Math.max(this.queenMinPumps, Math.trunc(roundEven(k.get('queenPumps'))));
        this.queenSpeed = k.get('queenSpeed'); this.eggEvery = k.get('eggEvery');
        this.hurryAt = k.get('hurryAt');

        this._score = 0; this._time = 0; this._lives = this.lives0; this._nextExtra = this.extraFirst;
        this._result = RoundResult.None;
        this._log = '';
        this._cues.resetTotals();
        this.events.length = 0; this.fx.length = 0; this.popups.length = 0;
        this.extraT = f32(-1);
        this._st = {
            pops: 0, crush: 0, chainCrush: 0, veg: 0, rockFalls: 0, dieTouch: 0, dieFire: 0, dieRock: 0, dieQueen: 0,
            ghosts: 0, breaths: 0, escapes: 0, extra: 0, wounds: 0, hurries: 0, depth: 0, d1Sec: 0,
        };
        // the demo shows a later depth (2 .. 7); a coin starts at the top
        const first = this.isDemo ? this.rng.next(2, 8) : 1;
        this._buildStage(first);
        this._goReady(true);
    }

    // ------------------------------------------------------------------ the field
    _buildStage(n) {
        const def = STAGES[n - 1];
        this.stage = n; this.def = def; this.queenStage = !!def.queen;
        this._st.depth = Math.max(this._st.depth, n);
        this.field.clear();
        this.pests.length = 0; this.rocks.length = 0; this.queen = null;
        this.rocksFallen = 0; this._vegDone = false; this.vegActive = false;
        this.stageTime = 0; this.stageDeaths = 0; this.escaped = 0;
        this.hurry = false; this.hurryT = f32(-1);
        this.fleeing = null; this._lastOneT = 0;
        this.popups.length = 0;

        // the start shaft: from the surface down to the centre
        for (let r = 0; r <= this.StartRow; r++) this.field.digTile(this.StartCol, r);

        const W = FW, H = FH;
        const used = new Uint8Array(W * H);      // pockets, shaft and a 1-tile moat round each
        for (let r = 0; r <= this.StartRow + 1; r++) for (let c = this.StartCol - 1; c <= this.StartCol + 1; c++) mark(used, c, r);

        // the queen's nest: a 2 x 2 chamber low down, away from the shaft
        if (this.queenStage) {
            const c = this.rng.nextDouble() < 0.5 ? this.rng.next(2, 6) : this.rng.next(12, 16), r = 9;
            this.queen = new Queen(c, r);
            this.queen.need = this.queenPumps; this.queen.face = c < this.StartCol ? Dir4.Right : Dir4.Left;
            for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) this.field.digTile(c + i, r + j);
            for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) mark(used, c + i, r + j);
        }

        // who lives here (bugs and lizards scale with the crowd knob; the depth's new pest never does)
        const kinds = [];
        const nb = def.bugs > 0 ? Math.max(1, Math.trunc(roundEven(def.bugs * this.crowd))) : 0;
        const nl = def.lizards > 0 ? Math.max(1, Math.trunc(roundEven(def.lizards * this.crowd))) : 0;
        for (let i = 0; i < nb; i++) kinds.push(PestKind.Bug);
        for (let i = 0; i < nl; i++) kinds.push(PestKind.Lizard);
        for (let i = 0; i < def.scorchers; i++) kinds.push(PestKind.Scorcher);
        for (let i = 0; i < def.drillers; i++) kinds.push(PestKind.Driller);

        const pockets = [];
        for (let i = 0; i < kinds.length; i++) {
            const kind = kinds[i];
            const wantVert = this.crackedRock && i === 0;
            const tiny = kind === PestKind.Driller;            // a driller starts buried in a one-tile hole
            for (let tries = 0; tries < 400; tries++) {
                const vert = !tiny && (wantVert || this.rng.nextDouble() < 0.4);
                const len = tiny ? 1 : vert ? 3 : 3 + (this.rng.nextDouble() < 0.4 ? 1 : 0);
                const c = this.rng.next(0, W - (vert ? 0 : len - 1));
                const r = this.rng.next(vert ? (wantVert ? 3 : 1) : 1, H - (vert ? len - 1 : 0));
                const mc = vert ? c : c + idiv(len, 2), mr = vert ? r + 1 : r;
                if (Math.abs(mc - this.StartCol) + Math.abs(mr - this.StartRow) < 5) continue;
                let ok = true;
                for (let kk = 0; kk < len && ok; kk++) {
                    const tc = vert ? c : c + kk, tr = vert ? r + kk : r;
                    if (tc < 0 || tr < 0 || tc >= W || tr >= H) ok = false;
                    else if (used[tr * W + tc]) ok = false;
                }
                if (wantVert && ok && (c === this.StartCol || r < 3 || used[(r - 2) * W + c] || used[(r - 1) * W + c])) ok = false;
                if (!ok) continue;
                for (let kk = 0; kk < len; kk++) {
                    const tc = vert ? c : c + kk, tr = vert ? r + kk : r;
                    this.field.digTile(tc, tr);
                    for (let dy = -1; dy <= 1; dy++) for (let dxx = -1; dxx <= 1; dxx++) mark(used, tc + dxx, tr + dy);
                }
                // the cracked rock's tile (two over the pocket) stays earth: no later pocket there
                if (wantVert) for (let dy = -1; dy <= 1; dy++) for (let dxx = -1; dxx <= 1; dxx++) mark(used, c + dxx, r - 2 + dy);
                pockets.push({ c, r, vert, len, mc, mr });
                const p = new Pest(this.pests.length, kind);
                p.minion = this.queenStage;
                p.x = p.homeX = mc * FTile; p.y = p.homeY = mr * FTile;
                p.dir = vert ? (this.rng.nextDouble() < 0.5 ? Dir4.Up : Dir4.Down) : (this.rng.nextDouble() < 0.5 ? Dir4.Left : Dir4.Right);
                p.face = this.rng.nextDouble() < 0.5 ? Dir4.Left : Dir4.Right;
                p.fireCool = frand(this.rng, 2, 2);
                this.pests.push(p);
                break;
            }
        }

        // shades wait in the solid earth, well away from the shaft
        for (let i = 0; i < def.shades; i++) {
            for (let tries = 0; tries < 400; tries++) {
                const c = this.rng.next(0, W), r = this.rng.next(1, H);
                if (Math.abs(c - this.StartCol) + Math.abs(r - this.StartRow) < 7) continue;
                if (used[r * W + c] || this.field.tileDugCount(c, r) > 0) continue;
                mark(used, c, r);
                const p = new Pest(this.pests.length, PestKind.Shade);
                p.x = p.homeX = c * FTile; p.y = p.homeY = r * FTile; p.open = false;
                p.dir = Dir4.Up; p.face = c < this.StartCol ? Dir4.Right : Dir4.Left;
                this.pests.push(p);
                break;
            }
        }

        // THE WARRENS: old tunnels join the pockets, one to the next (an L each: across, then down/up)
        if (def.warrens) {
            for (let i = 0; i + 1 < pockets.length; i++) {
                const a = pockets[i], b = pockets[i + 1];
                const sx = Math.sign(b.mc - a.mc), sy = Math.sign(b.mr - a.mr);
                for (let c = a.mc; c !== b.mc; c += sx) this.field.digTile(c, a.mr);
                for (let r = a.mr; r !== b.mr + sy && sy !== 0; r += sy) this.field.digTile(b.mc, r);
            }
        }

        // the pre-cracked rock: right over the first (vertical) pocket, one earth tile between
        const rockUsed = new Uint8Array(W * H);
        if (this.crackedRock && pockets.length > 0 && pockets[0].vert && pockets[0].r >= 3
            && this.field.tileDugCount(pockets[0].c, pockets[0].r - 2) === 0 && this.field.tileDugCount(pockets[0].c, pockets[0].r - 1) === 0)
            this._addRock(pockets[0].c, pockets[0].r - 2, true, rockUsed);
        // chains: two rocks stacked, solid earth round the pair and under it
        for (let i = 0, tries = 0; i < def.chains && tries < 600; tries++) {
            const c = this.rng.next(0, W), r = this.rng.next(1, 8);
            if (c === this.StartCol) continue;
            let ok = true;
            for (let rr = r - 1; rr <= r + 2 && ok; rr++) if (this.field.tileDugCount(c, rr) > 0) ok = false;
            for (let rr = r; rr <= r + 1 && ok; rr++) if (this.field.tileDugCount(c - 1, rr) > 0 || this.field.tileDugCount(c + 1, rr) > 0) ok = false;
            if (!ok || rockUsed[r * W + c] || rockUsed[(r + 1) * W + c]) continue;
            this._addRock(c, r, false, rockUsed);
            this._addRock(c, r + 1, false, rockUsed);
            i++;
        }
        for (let i = 0, tries = 0; i < def.rocks && tries < 600; tries++) {
            const c = this.rng.next(0, W), r = this.rng.next(1, 9);
            if (c === this.StartCol && r <= this.StartRow + 1) continue;
            if (this.field.tileDugCount(c, r) > 0 || this.field.tileDugCount(c, r + 1) > 0 || this.field.tileDugCount(c, r - 1) > 0) continue;
            if (this.field.tileDugCount(c - 1, r) > 0 || this.field.tileDugCount(c + 1, r) > 0) continue;
            if (rockUsed[r * W + c]) continue;
            this._addRock(c, r, false, rockUsed);
            i++;
        }
        for (const p of this.pests) if (p.kind === PestKind.Shade) p.open = this._inOpen(p);
    }

    _addRock(c, r, cracked, rockUsed) {
        this.rocks.push(new Rock(c, r, cracked));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(rockUsed, c + dx, r + dy);
    }

    _resetActors() {
        this.dx = this.StartCol * FTile; this.dy = this.StartRow * FTile; this.facing = Dir4.Right;
        this.diggerMoving = false; this.diggerDigging = false;
        this.hose = HoseState.None; this.hoseLen = 0; this.hookedPest = null; this.hookedQueen = false; this._hoseCool = 0;
        for (const p of this.pests) {
            if (!p.alive) continue;
            p.x = p.homeX; p.y = p.homeY;
            p.ghost = false; p.ghostT = 0; p.ghostCool = f32(1.5); p.reform = 0;
            p.stage = 0; p.hooked = false; p.deflate = 0; p.stuckT = 0;
            p.breath = 0; p.breathT = 0; p.fireLen = 0; p.fireCool = frand(this.rng, 1.5, 2);
            p.flee = false; p.escaping = false;
            if (p.kind === PestKind.Shade) p.open = this._inOpen(p);
        }
        this.fleeing = null; this._lastOneT = 0;
        const q = this.queen;
        if (q != null && q.alive) {
            q.x = q.homeX; q.y = q.homeY; q.inflate = 0; q.hooked = false; q.holdT = 0; q.deflT = 0;
            q.stunT = 0; q.layT = 0; q.eggT = 0; q.dir = Dir4.Up;
            for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) this.field.digTile(idiv(q.x, FTile) + i, idiv(q.y, FTile) + j);
        }
        this._ghostGrace = f32(3);
    }

    _goReady(card) {
        this._resetActors();
        this.p = Phase.Ready; this.phaseTime = 0;
        this.cardUp = card;
        this.readyLength = card ? this.cardSeconds : this.reReadySeconds;
        this._cues.emit(SoundCue.Tick);
        if (card) this._emit('card', { stage: this.stage, queen: this.queenStage });
    }

    // ------------------------------------------------------------------ stepping
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
                if (this.phaseTime >= this.readyLength) {
                    this.p = Phase.Play; this.phaseTime = 0; this.playSeconds = 0;
                    this._cues.emit(SoundCue.Start);
                    this._emit('go', { stage: this.stage, first: this.cardUp });
                }
                break;
            case Phase.Play:
                this.playSeconds = f32(this.playSeconds + dt);
                this.stageTime = f32(this.stageTime + dt);
                this._updatePlay(dt, input);
                break;
            case Phase.Death:
                this._ageDead(dt);
                if (this.phaseTime >= this.deathSeconds) {
                    if (this._lives <= 0) { this._result = RoundResult.Lost; this.p = Phase.Card; this.phaseTime = 0; }
                    else this._goReady(false);
                }
                break;
            case Phase.Clear:
                this._ageDead(dt);
                if (this.phaseTime >= (this.queenStage ? this.queenClearSeconds : this.clearSeconds)) this._goTally();
                break;
            case Phase.Tally:
                this._ageDead(dt);
                this._updateTally();
                break;
            case Phase.Card:
                if (this.phaseTime >= this.resultSeconds) this.p = Phase.Over;
                break;
        }
    }

    _ageDead(dt) {
        for (const p of this.pests) if (!p.alive) p.deadT = f32(p.deadT + dt);
        if (this.queen != null && !this.queen.alive) this.queen.deadT = f32(this.queen.deadT + dt);
        for (const r of this.rocks) if (r.state === RockState.Crumble) { r.t = f32(r.t + dt); if (r.t >= this.crumbleSeconds) r.state = RockState.Gone; }
    }

    _updatePlay(dt, input) {
        this._ghostGrace = f32(this._ghostGrace - dt);
        if (this._hoseCool > 0) this._hoseCool = f32(this._hoseCool - dt);
        if (!this.hurry && this.stageTime >= this.hurryAt) {
            this.hurry = true; this.hurryT = this._time; this._st.hurries++;
            this._emit('hurry');
        }

        // ---- the digger: A held = stand and pump; otherwise the stick moves (and digs)
        const aHeld = input != null && input.held(Pad.A);
        if (aHeld) {
            this.diggerMoving = false; this.diggerDigging = false;
            this._updateHose(dt);
        } else {
            if (this.hose !== HoseState.None) this._releaseHose();
            const want = input != null ? input.heldDir4() : Dir4.None;
            this._moveDigger(want, dt);
        }

        // ---- pests
        let ghosts = 0;
        for (const p of this.pests) if (p.alive && p.ghost) ghosts++;
        const maxGhosts = this.maxGhosts + (this.hurry ? 1 : 0);
        for (const p of this.pests) {
            if (!p.alive) { p.deadT = f32(p.deadT + dt); continue; }
            if (p.hitT > 0) p.hitT = f32(p.hitT - dt);
            if (p.escaping) { this._updateEscape(p, dt); continue; }
            if (p.hatch > 0) { p.hatch = f32(p.hatch - dt); continue; }
            if (p.hooked) { p.deflate = 0; continue; }
            if (p.stage > 0) {
                p.deflate = f32(p.deflate + dt);
                if (p.deflate >= this.deflateStep) { p.deflate = f32(p.deflate - this.deflateStep); p.stage--; }
                if (p.stage > 0) continue;
            }
            if (p.kind === PestKind.Shade || p.kind === PestKind.Driller) { this._moveBorer(p, dt); continue; }
            if (p.ghost) { this._updateGhost(p, dt); continue; }
            if (p.reform > 0) { p.reform = f32(p.reform - dt); continue; }     // the body re-forming: a beat before it moves
            if (p.breath > 0) { this._updateBreath(p, dt); continue; }
            p.ghostCool = f32(p.ghostCool - dt); p.fireCool = f32(p.fireCool - dt);

            if (p.flee) {
                // the last one: up the tunnels to the sky, or (no way up) as a ghost
                if (this._fleeMapT <= 0) this._buildFleeMap();
                if (this._fleeMap[tileIx(p.x, p.y)] < 0) { this._startGhost(p); ghosts++; continue; }
            } else {
                const far = Math.abs(p.x - this.dx) + Math.abs(p.y - this.dy);
                const rate = f32(f32(this.ghostRate * this.def.ghost) * (this.hurry ? f32(2.5) : 1));
                if (this._ghostGrace <= 0 && p.ghostCool <= 0 && ghosts < maxGhosts && far > this.ghostFar &&
                    this.rng.nextDouble() < f32(rate * dt)) {
                    this._startGhost(p); ghosts++;
                    continue;
                }
                if (p.breather && p.fireCool <= 0 && TunnelRatSim.aligned(p.y)) {
                    const inRow = Math.abs(this.dy - p.y) < 10;
                    const ahead = this.dx - p.x;
                    const inLine = inRow && Math.abs(ahead) < (p.kind === PestKind.Scorcher ? this.scorchRange + 16 : 80);
                    const rate2 = inLine ? this.fireAim : this.fireIdle;
                    if (this.rng.nextDouble() < f32(rate2 * dt)) {
                        if (inLine) p.face = ahead > 0 ? Dir4.Right : Dir4.Left;
                        p.breath = 1; p.breathT = 0; p.fireLen = 0; this._st.breaths++;
                        this._emit('breath', { scorch: p.kind === PestKind.Scorcher });
                        continue;
                    }
                }
            }
            const ox = p.x, oy = p.y;
            this._movePest(p, dt);
            // a pest boxed in (it can happen: a rock lands in its pocket) ghosts out
            if (p.x === ox && p.y === oy && !p.escaping) p.stuckT = f32(p.stuckT + dt); else p.stuckT = 0;
            if (p.stuckT > 2.5) { p.stuckT = 0; this._startGhost(p); ghosts++; }
        }
        if (this._fleeMapT > 0) this._fleeMapT = f32(this._fleeMapT - dt);

        // ---- the queen
        if (this.queen != null) this._updateQueen(this.queen, dt);

        // ---- rocks
        this._updateRocks(dt);

        // ---- the vegetable
        if (this.vegActive) {
            this.vegT = f32(this.vegT + dt);
            if (this.vegT >= this.vegSeconds) this.vegActive = false;
            else if (overlap(this.dx + 3, this.dy + 3, 10, 10, this.StartCol * FTile + 2, this.StartRow * FTile + 2, 12, 12)) {
                this.vegActive = false; this._st.veg++;
                this._addScore(this.def.vegPoints);
                this._popup(this.StartCol * FTile + 8, this.StartRow * FTile + 4, String(this.def.vegPoints), 'yellow');
                this._burst(this.StartCol * FTile + 8, this.StartRow * FTile + 8, 8, ['yellow', 'white', 'green'], 50, 0.5, 60);
                this._cues.emit(SoundCue.Bonus); this._emit('veg', { points: this.def.vegPoints });
            }
        }

        // ---- what kills the digger
        if (!this.credit.unlosable) {
            let cause = 0;
            for (const p of this.pests) {
                if (p.dangerous && overlap(this.dx + 3, this.dy + 3, 10, 10, p.x + 3, p.y + 3, 10, 10)) cause = 1;
                if (p.alive && p.breath === 2 && p.fireLen > 1) {
                    const fx = p.face === Dir4.Right ? p.x + FTile : p.x - p.fireLen;
                    if (overlap(this.dx + 3, this.dy + 3, 10, 10, fx, p.y + 4, p.fireLen, 8)) cause = 2;
                }
            }
            const q = this.queen;
            if (q != null && q.dangerous && overlap(this.dx + 3, this.dy + 3, 10, 10, q.x + 4, q.y + 4, 24, 24)) cause = 4;
            for (const r of this.rocks)
                if (r.state === RockState.Fall && overlap(this.dx + 3, this.dy + 3, 10, 10, r.x + 2, r.y + 2, 12, 12)) cause = 3;
            if (cause !== 0) { this._die(cause); return; }
        }

        // ---- the last pest runs for it
        if (this.def.flee && this.fleeing == null) {
            const left = this.pestsLeft;
            if (left === 1 && this.pests.length > 1) {
                this._lastOneT = f32(this._lastOneT + dt);
                if (this._lastOneT >= this.fleeDelay) {
                    for (const p of this.pests) if (p.alive && !p.minion) this.fleeing = p;
                    const p = this.fleeing;
                    p.flee = true; this._fleeMapT = 0;
                    if (p.ghost) { p.ghostVX = 0; p.ghostVY = -1; }
                    this._popup(p.x + 8, p.y - 2, 'RUN!', 'white');
                    this._emit('flee');
                }
            }
        }

        // ---- the depth is clear
        const done = this.queenStage ? (this.queen != null && !this.queen.alive) : this.pestsLeft === 0;
        if (done) {
            if (this.hose !== HoseState.None) this._releaseHose();
            this.p = Phase.Clear; this.phaseTime = 0;
            this._cues.emit(SoundCue.Bonus);
            this._emit('stageClear', { stage: this.stage, queen: this.queenStage });
            this._log += 'D' + this.stage + '@' + fmt(this.stageTime, 0, F32) + ' ';
            if (this.stage === 1) this._st.d1Sec = this.stageTime;
        }
    }

    _die(cause) {
        this.deathCause = cause;
        const s = this._st;
        if (cause === 1) s.dieTouch++; else if (cause === 2) s.dieFire++; else if (cause === 3) s.dieRock++; else s.dieQueen++;
        this._log += (cause === 1 ? 'P' : cause === 2 ? 'F' : cause === 3 ? 'R' : 'Q') + fmt(this._time, 0, F32) + ' ';
        this._lives--; this.stageDeaths++;
        if (this.hose !== HoseState.None) this._releaseHose();
        this.diggerMoving = false;
        this.p = Phase.Death; this.phaseTime = 0;
        this.shake = f32(0.3); this.shakeAmp = 1;
        this._cues.emit(SoundCue.Die);
        this._emit('die', { cause, last: this._lives <= 0 });
    }

    // ------------------------------------------------------------------ score, popups, particles
    _addScore(n) {
        this._score += n;
        while (this._nextExtra > 0 && this._score >= this._nextExtra) {
            if (this._lives < this.maxLives) { this._lives++; this._st.extra++; }
            this.extraT = this._time;
            this._nextExtra = this.extraEvery > 0 ? this._nextExtra + this.extraEvery : 0;
            this._emit('extraLife', { lives: this._lives });
        }
    }

    _popup(x, y, text, c) {
        if (this.popups.length >= 12) this.popups.shift();
        this.popups.push({ x, y, t: 0, text, c });
    }

    _fxRand() { this._fxSeed = (Math.imul(this._fxSeed, 1103515245) + 12345) | 0; return ((this._fxSeed >>> 8) & 0xFFFF) / 65536; }

    // a burst of n chips flying out of (x, y) (field px) in the named colours
    _burst(x, y, n, colors, speed, life, g) {
        for (let i = 0; i < n; i++) {
            if (this.fx.length >= 96) this.fx.shift();
            const a = this._fxRand() * Math.PI * 2, v = speed * (0.4 + 0.6 * this._fxRand());
            this.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g, t: 0, life: life * (0.7 + 0.5 * this._fxRand()), c: colors[i % colors.length] });
        }
    }

    _ageFx(dt) {
        if (this.shake > 0) this.shake = f32(this.shake - dt);
        let k = 0;
        for (let i = 0; i < this.fx.length; i++) {
            const f = this.fx[i];
            f.t += dt;
            if (f.t >= f.life) continue;
            f.vy += f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt;
            this.fx[k++] = f;
        }
        this.fx.length = k;
        k = 0;
        for (let i = 0; i < this.popups.length; i++) {
            const u = this.popups[i];
            u.t += dt;
            if (u.t < 1.3) this.popups[k++] = u;
        }
        this.popups.length = k;
    }

    // ------------------------------------------------------------------ the tally between depths
    _goTally() {
        const n = this.stage, def = this.def;
        const speed = Math.max(0, Math.trunc(def.par - Math.floor(this.stageTime))) * 20;
        this.tally = [
            { label: 'DEPTH ' + n + ' BONUS', value: 500 * n },
            { label: 'SPEED BONUS', value: speed },
            { label: 'NO-MISS BONUS', value: this.stageDeaths === 0 ? 1000 + 250 * n : 0 },
        ];
        if (this.escaped > 0) this.tally.push({ label: 'ONE GOT AWAY', value: -1 });
        if (this.lastStage) this.tally.push({ label: 'RATS LEFT ' + this._lives + ' X 2000', value: 2000 * this._lives });
        for (const L of this.tally) { L.shown = false; L.added = false; }
        this.p = Phase.Tally; this.phaseTime = 0; this._tallyDone = false;
        this.tallyEnd = f32(0.4 + this.tally.length * 0.6 + 1.2);
    }

    _updateTally() {
        for (let i = 0; i < this.tally.length; i++) {
            const L = this.tally[i], at = f32(0.4 + i * 0.6);
            if (!L.shown && this.phaseTime >= at) L.shown = true;
            if (!L.added && this.phaseTime >= f32(at + f32(0.4))) {
                L.added = true;
                if (L.value > 0) this._addScore(L.value);
                this._cues.emit(SoundCue.Tick);
                this._emit('tally', { value: L.value });
            }
        }
        if (!this._tallyDone && this.phaseTime >= f32(this.tallyEnd - f32(1.0))) { this._tallyDone = true; this._emit('tallyDone', { last: this.lastStage }); }
        if (this.phaseTime >= this.tallyEnd) {
            if (this.lastStage) {
                this._result = RoundResult.Won; this.p = Phase.Card; this.phaseTime = 0;
                this._cues.emit(SoundCue.Win);
            } else {
                this._buildStage(this.stage + 1);
                this._goReady(true);
            }
        }
    }

    // ------------------------------------------------------------------ the digger
    diggerBlocked(x, y) {
        if (x < -1e-6 || y < -1e-6 || x > FPxW - FTile + 1e-6 || y > FPxH - FTile + 1e-6) return true;
        for (const r of this.rocks)
            if ((r.state === RockState.Rest || r.state === RockState.Wobble) && overlap(x, y, FTile, FTile, r.x, r.y, FTile, FTile)) return true;
        return false;
    }

    _moveDigger(want, dt) {
        this.diggerMoving = false; this.diggerDigging = false;
        if (want < 0) return;
        let tLeft = dt;
        for (let guard = 0; guard < 80 && tLeft > 1e-7; guard++) {
            const horiz = want === Dir4.Left || want === Dir4.Right;
            const perp = horiz ? this.dy : this.dx;
            let d = want;
            let maxRun = Number.MAX_VALUE;
            if (!TunnelRatSim.aligned(perp)) {
                // corner: finish the move to the nearest tile line first
                const preferHigh = horiz ? this.facing === Dir4.Down : this.facing === Dir4.Right;
                const line = nearestLine(perp, preferHigh);
                d = horiz ? (line > this.dy ? Dir4.Down : Dir4.Up) : (line > this.dx ? Dir4.Right : Dir4.Left);
                maxRun = Math.abs(line - perp);
            }
            const nx = this.dx + Dir4.dx(d), ny = this.dy + Dir4.dy(d);
            const digging = this.field.rectAnyUndug(nx, ny);
            const speed = digging ? this.digSpeed : this.walkSpeed;
            const m = Math.min(Math.min(speed * tLeft, 1.0), maxRun);
            const tx = this.dx + Dir4.dx(d) * m, ty = this.dy + Dir4.dy(d) * m;
            if (this.diggerBlocked(tx, ty)) { if (d === want) this.facing = want; break; }
            this.dx = snap(tx); this.dy = snap(ty);
            tLeft -= m / speed;
            this.facing = d;
            this.diggerMoving = true; this.diggerDigging = this.diggerDigging || digging;
            this.diggerWalk += m;
            this._digAcc += this.field.digRect(this.dx, this.dy);
            if (this._digAcc >= 6) { this._digAcc = 0; this._emit('dig', { stratum: TunnelField.stratumAtPx(this.dy) }); }
        }
    }

    // ------------------------------------------------------------------ the hose
    _updateHose(dt) {
        switch (this.hose) {
            case HoseState.None:
                if (this._hoseCool <= 0) {
                    this.hose = HoseState.Out; this.hoseLen = 0; this.hoseDir = this.facing;
                    this._cues.emit(SoundCue.Tick);
                    this._emit('hose');
                    this._hoseOutTick(dt);              // goto case Out
                }
                break;
            case HoseState.Out:
                this._hoseOutTick(dt);
                break;
            case HoseState.Hooked: {
                if (this.hookedQueen) {
                    const q = this.queen;
                    if (q == null || !q.alive) { this.hose = HoseState.None; this.hookedQueen = false; break; }
                    this.hoseLen = Math.max(0, this._hoseReachQ(q));
                    this._pumpT = f32(this._pumpT + dt);
                    if (this._pumpT >= this.pumpStep) {
                        this._pumpT = f32(this._pumpT - this.pumpStep);
                        q.inflate++; q.hitT = f32(0.1); this.pumpStrokes++;
                        this._cues.emit(SoundCue.Tick);
                        this._emit('queenPump', { n: q.inflate, need: q.need });
                        if (q.inflate >= q.need) this._popQueen(q);
                    }
                    break;
                }
                const p = this.hookedPest;
                if (p == null || !p.alive) { this.hose = HoseState.None; this.hookedPest = null; break; }
                this.hoseLen = Math.max(0, this._hoseReach(p));
                this._pumpT = f32(this._pumpT + dt);
                if (this._pumpT >= this.pumpStep) {
                    this._pumpT = f32(this._pumpT - this.pumpStep);
                    p.stage++; p.deflate = 0; p.hitT = f32(0.08); this.pumpStrokes++;
                    this._cues.emit(SoundCue.Tick);
                    if (p.stage >= 4) this._pop(p);
                    else this._emit('pump', { n: p.stage });
                }
                break;
            }
            case HoseState.Back:
                this.hoseLen -= this.hoseSpeed * 1.5 * dt;
                if (this.hoseLen <= 0) { this.hoseLen = 0; this.hose = HoseState.None; this._hoseCool = this.hoseCooldown; }
                break;
        }
    }

    _hoseOutTick(dt) {
        const open = this.field.openRun(this.dx, this.dy, this.hoseDir, this.hoseRange);
        let len = Math.min(this.hoseLen + f32(this.hoseSpeed * dt), this.hoseRange);
        let blocked = len > open;
        if (blocked) len = open;
        const [hx, hy, hw, hh] = this._hoseRect(len);
        let hit = null, best = Number.MAX_VALUE;
        for (const p of this.pests) {
            if (!p.solid) continue;
            if (!overlap(hx, hy, hw, hh, p.x + 2, p.y + 2, 12, 12)) continue;
            const d = Math.abs(p.x - this.dx) + Math.abs(p.y - this.dy);
            if (d < best) { best = d; hit = p; }
        }
        const q = this.queen;
        if (q != null && q.alive && overlap(hx, hy, hw, hh, q.x + 2, q.y + 2, 28, 28)) {
            const d = Math.abs(q.x + 8 - this.dx) + Math.abs(q.y + 8 - this.dy);
            if (d < best) {
                this.hose = HoseState.Hooked; this.hookedQueen = true; q.hooked = true;
                this._pumpT = 0;
                this.hoseLen = Math.max(0, this._hoseReachQ(q));
                this._emit('hook', { queen: true });
                return;
            }
        }
        if (hit != null) {
            this.hose = HoseState.Hooked; this.hookedPest = hit; hit.hooked = true; hit.breath = 0; hit.fireLen = 0;
            this._pumpT = 0;
            this.hoseLen = Math.max(0, this._hoseReach(hit));
            this._emit('hook', { queen: false });
            return;
        }
        this.hoseLen = len;
        if (blocked || len >= this.hoseRange - 1e-6) { this.hose = HoseState.Back; this._cues.emit(SoundCue.Miss); this._emit('hoseMiss'); }
    }

    _hoseRect(len) {
        switch (this.hoseDir) {
            // from the digger's middle, so a pest right on the nozzle (or on top of it) counts
            case Dir4.Right: return [this.dx + 8, this.dy + 5, len + 8, 6];
            case Dir4.Left: return [this.dx - len, this.dy + 5, len + 8, 6];
            case Dir4.Down: return [this.dx + 5, this.dy + 8, 6, len + 8];
            default: return [this.dx + 5, this.dy - len, 6, len + 8];
        }
    }

    _hoseReach(p) {
        switch (this.hoseDir) {
            case Dir4.Right: return p.x + 2 - (this.dx + FTile);
            case Dir4.Left: return this.dx - (p.x + FTile - 2);
            case Dir4.Down: return p.y + 2 - (this.dy + FTile);
            default: return this.dy - (p.y + FTile - 2);
        }
    }

    _hoseReachQ(q) {
        switch (this.hoseDir) {
            case Dir4.Right: return q.x + 2 - (this.dx + FTile);
            case Dir4.Left: return this.dx - (q.x + 30);
            case Dir4.Down: return q.y + 2 - (this.dy + FTile);
            default: return this.dy - (q.y + 30);
        }
    }

    _releaseHose() {
        if (this.hookedPest != null) { this.hookedPest.hooked = false; this.hookedPest.deflate = 0; }
        if (this.hookedQueen && this.queen != null) { this.queen.hooked = false; this.queen.holdT = 0; this.queen.deflT = 0; }
        this.hookedPest = null; this.hookedQueen = false;
        this.hose = HoseState.None; this.hoseLen = 0;
        this._hoseCool = this.hoseCooldown;
    }

    static popPointsAt(y) { return 200 + 100 * TunnelField.stratumAtPx(y); }

    _pop(p, quiet) {
        p.alive = false; p.death = 1; p.deadT = 0; p.hooked = false; p.breath = 0; p.fireLen = 0;
        const bonus = p.kind === PestKind.Shade ? 200 : p.kind === PestKind.Driller || p.kind === PestKind.Scorcher ? 100 : 0;
        p.popPoints = p.minion ? 500 : TunnelRatSim.popPointsAt(p.y) + bonus;
        this._addScore(p.popPoints); this._st.pops++;
        this._popup(p.x + 8, p.y + 4, String(p.popPoints), 'white');
        const body = p.kind === PestKind.Bug ? 'orange' : p.kind === PestKind.Driller ? 'purple' : p.kind === PestKind.Shade ? 'cyan' : p.kind === PestKind.Scorcher ? 'red' : 'green';
        this._burst(p.x + 8, p.y + 8, 10, [body, 'white', body, 'yellow'], 70, 0.45, 40);
        this._cues.emit(SoundCue.Hit);
        if (!quiet) this._emit('pop', { kind: p.kind, points: p.popPoints });
        if (this.hookedPest === p) { this.hose = HoseState.None; this.hoseLen = 0; this.hookedPest = null; this._hoseCool = this.hoseCooldown; }
    }

    // ------------------------------------------------------------------ pests
    pestCanOccupy(x, y) {
        if (!this.field.rectDug(x, y)) return false;
        for (const r of this.rocks)
            if ((r.state === RockState.Rest || r.state === RockState.Wobble) && overlap(x, y, FTile, FTile, r.x, r.y, FTile, FTile)) return false;
        return true;
    }

    // a driller goes where it likes, inside the earth and round the rocks; a shade goes through the rocks too
    borerCanOccupy(x, y, shade) {
        if (x < -1e-6 || y < -1e-6 || x > FPxW - FTile + 1e-6 || y > FPxH - FTile + 1e-6) return false;
        if (shade) return true;
        for (const r of this.rocks)
            if ((r.state === RockState.Rest || r.state === RockState.Wobble) && overlap(x, y, FTile, FTile, r.x, r.y, FTile, FTile)) return false;
        return true;
    }

    pestSpeed(p) {
        let base = p.kind === PestKind.Lizard || p.kind === PestKind.Scorcher ? this.lizardSpeed : this.bugSpeed;
        base = f32(f32(base * this.pestSpeedMul) * this.def.speed);
        if (this.hurry) base = f32(base * this.hurryBoost);
        if (p.flee) base = f32(base * this.fleeBoost);
        return base;
    }

    _inOpen(p) { return this.field.tileDug(Math.floor((p.x + 8) / FTile), Math.floor((p.y + 8) / FTile)); }

    _startGhost(p) {
        p.ghost = true; p.ghostT = 0; p.ghostFromX = p.x; p.ghostFromY = p.y; p.ghostVX = p.ghostVY = 0; p.breath = 0; p.fireLen = 0;
        this._st.ghosts++;
        this._emit('ghost');
    }

    _movePest(p, dt) {
        const speed = this.pestSpeed(p);
        if (speed <= 1e-6) return;
        let tLeft = dt;
        for (let guard = 0; guard < 80 && tLeft > 1e-7; guard++) {
            if (TunnelRatSim.aligned(p.x) && TunnelRatSim.aligned(p.y)) {
                if (p.flee && p.y < 0.5 && this.field.tileDug(Math.trunc(roundEven(p.x / FTile)), 0)) { this._startEscape(p); return; }
                const nd = this._chooseDir(p);
                if (nd < 0) return;
                p.dir = nd;
            }
            const horiz = p.dir === Dir4.Left || p.dir === Dir4.Right;
            const along = horiz ? p.x : p.y;
            const frac = along - Math.floor(along / FTile) * FTile;
            const pos = Dir4.dx(p.dir) + Dir4.dy(p.dir) > 0;
            const toNext = pos ? FTile - frac : (frac < 1e-6 ? FTile : frac);
            const m = Math.min(Math.min(speed * tLeft, 1.0), toNext);
            const nx = p.x + Dir4.dx(p.dir) * m, ny = p.y + Dir4.dy(p.dir) * m;
            if (!this.pestCanOccupy(nx, ny)) {
                // blocked mid-tile (a half-dug tile, a rock): turn round
                if (!(TunnelRatSim.aligned(p.x) && TunnelRatSim.aligned(p.y))) p.dir = Dir4.reverse(p.dir);
                return;
            }
            p.x = snap(nx); p.y = snap(ny);
            p.walk += m;
            if (horiz) p.face = p.dir;
            tLeft -= m / speed;
        }
    }

    _chooseDir(p) {
        let n = 0;
        for (let d = 0; d < 4; d++)
            if (this.pestCanOccupy(p.x + Dir4.dx(d), p.y + Dir4.dy(d))) this._cand[n++] = d;
        if (n === 0) return -1;
        if (n > 1) {
            const rev = Dir4.reverse(p.dir);
            let k = 0;
            for (let i = 0; i < n; i++) if (this._cand[i] !== rev) this._cand[k++] = this._cand[i];
            n = k;
        }
        if (p.flee) {
            // down the flee map: the step whose tile is nearest the sky
            let best = this._cand[0], bd = 32767;
            for (let i = 0; i < n; i++) {
                const t = tileIx(p.x + Dir4.dx(this._cand[i]) * FTile, p.y + Dir4.dy(this._cand[i]) * FTile);
                const v = this._fleeMap[t];
                if (v >= 0 && v < bd) { bd = v; best = this._cand[i]; }
            }
            return best;
        }
        if (this.rng.nextDouble() < this.chase) {
            let best = this._cand[0], bd = Number.MAX_VALUE;
            for (let i = 0; i < n; i++) {
                const x = p.x + Dir4.dx(this._cand[i]) * FTile, y = p.y + Dir4.dy(this._cand[i]) * FTile;
                const d = (x - this.dx) * (x - this.dx) + (y - this.dy) * (y - this.dy);
                if (d < bd) { bd = d; best = this._cand[i]; }
            }
            return best;
        }
        return this._cand[this.rng.next(n)];
    }

    // tiles' steps to the sky through open tunnel (rocks in the way), -1 = no way up
    _buildFleeMap() {
        const m = this._fleeMap, q = this._q;
        m.fill(-1);
        let head = 0, tail = 0;
        const blocked = (t) => {
            for (const r of this.rocks)
                if ((r.state === RockState.Rest || r.state === RockState.Wobble) && r.row * FW + r.col === t) return true;
            return false;
        };
        for (let c = 0; c < FW; c++) if (this.field.tileDug(c, 0) && !blocked(c)) { m[c] = 0; q[tail++] = c; }
        while (head < tail) {
            const t = q[head++], x = t % FW, y = idiv(t, FW);
            for (let d = 0; d < 4; d++) {
                const nx = x + Dir4.dx(d), ny = y + Dir4.dy(d);
                if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
                const u = ny * FW + nx;
                if (m[u] >= 0 || !this.field.tileDug(nx, ny) || blocked(u)) continue;
                m[u] = m[t] + 1; q[tail++] = u;
            }
        }
        this._fleeMapT = f32(0.5);
    }

    _startEscape(p) {
        p.escaping = true; p.ghost = false; p.hooked = false; p.breath = 0; p.fireLen = 0;
        p.escDir = p.x + 8 < FPxW / 2 ? -1 : 1;
        p.face = p.escDir < 0 ? Dir4.Left : Dir4.Right;
    }

    // out of the earth: up into the sky strip, then off along it
    _updateEscape(p, dt) {
        const v = f32(this.pestSpeed(p) * f32(1.4));
        if (p.y > -16) { p.y = Math.max(-16, p.y - v * dt); p.walk += v * dt; return; }
        p.x += p.escDir * v * dt; p.walk += v * dt;
        if (p.x < -18 || p.x > FPxW + 2) {
            p.alive = false; p.death = 3; p.deadT = 0; p.popPoints = 0;
            this.escaped++; this._st.escapes++;
            this._popup(p.escDir < 0 ? 18 : FPxW - 18, -10, 'GONE', 'orange');
            this._emit('escape');
        }
    }

    _updateGhost(p, dt) {
        p.ghostT = f32(p.ghostT + dt);
        if (p.flee) {
            // the last one, as a ghost: straight up and out
            const step = f32(f32(this.ghostSpeed * this.pestSpeedMul) * f32(dt * this.fleeBoost));
            p.ghostVX = 0; p.ghostVY = -1;
            p.y -= step; p.walk += step;
            if (p.y <= -16) { p.y = -16; this._startEscape(p); }
            return;
        }
        // steer for the digger; inside reformGap it keeps its heading and drifts on through
        const vx = this.dx - p.x, vy = this.dy - p.y, len = Math.sqrt(vx * vx + vy * vy);
        if (len > this.reformGap || (p.ghostVX === 0 && p.ghostVY === 0)) {
            if (len > 1e-6) { p.ghostVX = vx / len; p.ghostVY = vy / len; }
            else { p.ghostVX = 1; p.ghostVY = 0; }
        }
        const step = f32(f32(this.ghostSpeed * this.pestSpeedMul) * dt) * (this.hurry ? this.hurryBoost : 1);
        p.x += p.ghostVX * step; p.y += p.ghostVY * step;
        p.x = Math.max(-8, Math.min(FPxW - 8, p.x));
        p.y = Math.max(-8, Math.min(FPxH - 8, p.y));
        if (p.ghostVX > 0.1) p.face = Dir4.Right; else if (p.ghostVX < -0.1) p.face = Dir4.Left;
        p.walk += step;
        // re-form on the first open tile it crosses, clear of where it left and never on top of the
        // digger (reformGap px, Manhattan, from the digger)
        if (p.ghostT < 0.8) return;
        const gone = Math.abs(p.x - p.ghostFromX) + Math.abs(p.y - p.ghostFromY);
        if (gone < 24) return;
        const tx = Math.floor((p.x + 8) / FTile), ty = Math.floor((p.y + 8) / FTile);
        if (!this.field.tileDug(tx, ty) || !this.pestCanOccupy(tx * FTile, ty * FTile)) return;
        if (Math.abs(tx * FTile - this.dx) + Math.abs(ty * FTile - this.dy) < this.reformGap) return;
        p.x = tx * FTile; p.y = ty * FTile;
        p.ghost = false; p.ghostCool = frand(this.rng, 4, 3);
        p.reform = this.reformSeconds;
        p.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? Dir4.Right : Dir4.Left) : (vy > 0 ? Dir4.Down : Dir4.Up);
    }

    // a driller (boring its own tunnel) or a shade (through everything) on the lattice
    _moveBorer(p, dt) {
        const shade = p.kind === PestKind.Shade;
        if (p.reform > 0) { p.reform = f32(p.reform - dt); return; }
        let tLeft = dt;
        p.boring = false;
        for (let guard = 0; guard < 80 && tLeft > 1e-7; guard++) {
            if (TunnelRatSim.aligned(p.x) && TunnelRatSim.aligned(p.y)) {
                if (p.flee && p.y < 0.5) { this._startEscape(p); return; }
                const nd = this._chooseBore(p);
                if (nd < 0) break;
                p.dir = nd;
            }
            const horiz = p.dir === Dir4.Left || p.dir === Dir4.Right;
            const along = horiz ? p.x : p.y;
            const frac = along - Math.floor(along / FTile) * FTile;
            const pos = Dir4.dx(p.dir) + Dir4.dy(p.dir) > 0;
            const toNext = pos ? FTile - frac : (frac < 1e-6 ? FTile : frac);
            const earth = !shade && this.field.rectAnyUndug(p.x + Dir4.dx(p.dir), p.y + Dir4.dy(p.dir));
            let speed = shade ? f32(f32(this.shadeSpeed * this.pestSpeedMul) * this.def.speed) : earth ? f32(f32(this.drillSpeed * this.pestSpeedMul) * this.def.speed) : this.pestSpeed(p);
            if (this.hurry) speed = f32(speed * this.hurryBoost);
            if (p.flee) speed = f32(speed * this.fleeBoost);
            const m = Math.min(Math.min(speed * tLeft, 1.0), toNext);
            const nx = p.x + Dir4.dx(p.dir) * m, ny = p.y + Dir4.dy(p.dir) * m;
            if (!this.borerCanOccupy(nx, ny, shade)) {
                if (!(TunnelRatSim.aligned(p.x) && TunnelRatSim.aligned(p.y))) p.dir = Dir4.reverse(p.dir);
                break;
            }
            p.x = snap(nx); p.y = snap(ny);
            p.walk += m;
            if (horiz) p.face = p.dir;
            tLeft -= m / speed;
            if (!shade && this.field.digRect(p.x, p.y) > 0) {
                p.boring = true;
                if (this._time - p.drillT >= 0.45) { p.drillT = this._time; this._emit('drill'); }
            }
        }
        if (shade) {
            const was = p.open;
            p.open = this._inOpen(p);
            if (p.open && !was) { p.reform = this.shadeFirm; this._emit('shadeOut'); }
        }
    }

    _chooseBore(p) {
        let n = 0;
        for (let d = 0; d < 4; d++)
            if (this.borerCanOccupy(p.x + Dir4.dx(d), p.y + Dir4.dy(d), p.kind === PestKind.Shade)) this._cand[n++] = d;
        if (n === 0) return -1;
        if (n > 1) {
            const rev = Dir4.reverse(p.dir);
            let k = 0;
            for (let i = 0; i < n; i++) if (this._cand[i] !== rev) this._cand[k++] = this._cand[i];
            n = k;
        }
        if (p.flee) {
            for (let i = 0; i < n; i++) if (this._cand[i] === Dir4.Up) return Dir4.Up;
            return this._cand[this.rng.next(n)];
        }
        const keen = p.kind === PestKind.Shade ? 0.85 : 0.72;
        if (this.rng.nextDouble() < keen) {
            let best = this._cand[0], bd = Number.MAX_VALUE;
            for (let i = 0; i < n; i++) {
                const x = p.x + Dir4.dx(this._cand[i]) * FTile, y = p.y + Dir4.dy(this._cand[i]) * FTile;
                const d = (x - this.dx) * (x - this.dx) + (y - this.dy) * (y - this.dy);
                if (d < bd) { bd = d; best = this._cand[i]; }
            }
            return best;
        }
        return this._cand[this.rng.next(n)];
    }

    // how far a scorcher's flame can go: its range, the edge of the earth, or a rock in its row
    scorchMax(p) {
        let lim = p.face === Dir4.Right ? FPxW - (p.x + FTile) : p.x;
        lim = Math.min(lim, this.scorchRange);
        for (const r of this.rocks) {
            if (r.state !== RockState.Rest && r.state !== RockState.Wobble) continue;
            if (Math.abs(r.y - p.y) >= FTile) continue;
            const d = p.face === Dir4.Right ? r.x - (p.x + FTile) : p.x - (r.x + FTile);
            if (d >= 0 && d < lim) lim = d;
        }
        return Math.max(0, lim);
    }

    _updateBreath(p, dt) {
        p.breathT = f32(p.breathT + dt);
        const scorch = p.kind === PestKind.Scorcher;
        if (p.breath === 1) {
            if (p.breathT >= (scorch ? f32(this.fireWindup + f32(0.35)) : this.fireWindup)) {
                p.breath = 2; p.breathT = 0; p.fireLen = 0;
                this._emit('fire', { scorch });
            }
            return;
        }
        if (scorch) {
            p.fireLen = Math.min(this.scorchMax(p), p.fireLen + f32(this.fireSpeed * dt));
            if (p.fireLen > 0.5) {
                const x0 = p.face === Dir4.Right ? p.x + FTile : p.x - p.fireLen, x1 = p.face === Dir4.Right ? p.x + FTile + p.fireLen : p.x;
                if (this.field.burnSpan(x0, x1, p.y) > 0 && (Math.trunc(f32(p.breathT * 20)) & 1) === 0)
                    this._burst(p.face === Dir4.Right ? x1 : x0, p.y + 8, 1, ['red', 'orange', 'yellow'], 30, 0.4, -20);
            }
        } else {
            const open = this.field.openRun(p.x, p.y, p.face, this.fireRange);
            p.fireLen = Math.min(open, p.fireLen + f32(this.fireSpeed * dt));
        }
        if (p.breathT >= this.fireHold) {
            p.breath = 0; p.fireLen = 0; p.fireCool = frand(this.rng, 2.5, 2.5);
        }
    }

    // ------------------------------------------------------------------ the queen
    _updateQueen(q, dt) {
        if (!q.alive) { q.deadT = f32(q.deadT + dt); return; }
        if (q.hitT > 0) q.hitT = f32(q.hitT - dt);
        if (q.hooked) { q.holdT = 0; q.deflT = 0; return; }
        if (q.inflate > 0) {
            // let go and she shrinks back, a stroke at a time; swollen, she cannot move
            q.holdT = f32(q.holdT + dt);
            if (q.holdT >= this.queenHold) {
                q.deflT = f32(q.deflT + dt);
                if (q.deflT >= this.queenDeflate) { q.deflT = f32(q.deflT - this.queenDeflate); q.inflate--; this._emit('queenShrink', { n: q.inflate }); }
            }
            return;
        }
        if (q.stunT > 0) { q.stunT = f32(q.stunT - dt); return; }
        if (q.layT > 0) {
            q.layT = f32(q.layT - dt);
            if (q.layT <= 0) this._layEgg(q);
            return;
        }
        q.eggT = f32(q.eggT + dt);
        if (q.eggT >= this.eggEvery) {
            let brood = 0;
            for (const p of this.pests) if (p.alive && p.minion) brood++;
            if (brood < this.maxBrood) { q.eggT = 0; q.layT = this.queenLay; this._emit('queenLay'); return; }
        }
        this._moveQueen(q, dt);
    }

    queenCanOccupy(x, y) {
        if (x < -1e-6 || y < -1e-6 || x > FPxW - 2 * FTile + 1e-6 || y > FPxH - 2 * FTile + 1e-6) return false;
        for (const r of this.rocks)
            if ((r.state === RockState.Rest || r.state === RockState.Wobble) && overlap(x, y, 2 * FTile, 2 * FTile, r.x, r.y, FTile, FTile)) return false;
        return true;
    }

    _moveQueen(q, dt) {
        let speed = f32(this.queenSpeed * f32(1 + 0.2 * q.wounds));
        if (this.hurry) speed = f32(speed * this.hurryBoost);
        let tLeft = dt;
        for (let guard = 0; guard < 80 && tLeft > 1e-7; guard++) {
            if (TunnelRatSim.aligned(q.x) && TunnelRatSim.aligned(q.y)) {
                let n = 0;
                for (let d = 0; d < 4; d++) if (this.queenCanOccupy(q.x + Dir4.dx(d), q.y + Dir4.dy(d))) this._cand[n++] = d;
                if (n === 0) return;
                if (n > 1) {
                    const rev = Dir4.reverse(q.dir);
                    let k = 0;
                    for (let i = 0; i < n; i++) if (this._cand[i] !== rev) this._cand[k++] = this._cand[i];
                    n = k;
                }
                let nd = this._cand[this.rng.next(n)];
                if (this.rng.nextDouble() < 0.75) {
                    let bd = Number.MAX_VALUE;
                    for (let i = 0; i < n; i++) {
                        const x = q.x + 8 + Dir4.dx(this._cand[i]) * FTile, y = q.y + 8 + Dir4.dy(this._cand[i]) * FTile;
                        const d = (x - this.dx) * (x - this.dx) + (y - this.dy) * (y - this.dy);
                        if (d < bd) { bd = d; nd = this._cand[i]; }
                    }
                }
                q.dir = nd;
            }
            const horiz = q.dir === Dir4.Left || q.dir === Dir4.Right;
            const along = horiz ? q.x : q.y;
            const frac = along - Math.floor(along / FTile) * FTile;
            const pos = Dir4.dx(q.dir) + Dir4.dy(q.dir) > 0;
            const toNext = pos ? FTile - frac : (frac < 1e-6 ? FTile : frac);
            const m = Math.min(Math.min(speed * tLeft, 1.0), toNext);
            const nx = q.x + Dir4.dx(q.dir) * m, ny = q.y + Dir4.dy(q.dir) * m;
            if (!this.queenCanOccupy(nx, ny)) {
                if (!(TunnelRatSim.aligned(q.x) && TunnelRatSim.aligned(q.y))) q.dir = Dir4.reverse(q.dir);
                return;
            }
            q.x = snap(nx); q.y = snap(ny);
            q.walk += m;
            if (horiz) q.face = q.dir;
            tLeft -= m / speed;
            let n = this.field.digRect(q.x, q.y) + this.field.digRect(q.x + FTile, q.y);
            n += this.field.digRect(q.x, q.y + FTile) + this.field.digRect(q.x + FTile, q.y + FTile);
            if (n > 0 && this._time - q.boreT >= 0.5) { q.boreT = this._time; this._emit('drill', { queen: true }); }
        }
    }

    _layEgg(q) {
        // the egg drops behind her (the quarter of her body farthest from the digger)
        const left = this.dx + 8 > q.x + 16;
        const x = left ? q.x : q.x + FTile, y = q.y + FTile;
        const p = new Pest(this.pests.length, this.pests.length % 3 === 2 && q.wounds > 0 ? PestKind.Lizard : PestKind.Bug);
        p.minion = true;
        p.x = p.homeX = x; p.y = p.homeY = y;
        p.dir = left ? Dir4.Left : Dir4.Right; p.face = p.dir;
        p.hatch = f32(0.9); p.fireCool = frand(this.rng, 2, 2); p.ghostCool = f32(3);
        this.pests.push(p);
        this._burst(x + 8, y + 10, 5, ['white', 'sky'], 30, 0.4, 60);
        this._emit('queenEgg');
    }

    _woundQueen(q, r) {
        q.wounds++; this._st.wounds++;
        q.need = Math.max(this.queenMinPumps, q.need - this.queenWoundPumps);
        q.stunT = this.queenStun; q.layT = 0;
        this._addScore(this.pointsWound);
        this._popup(q.x + 16, q.y + 2, String(this.pointsWound), 'yellow');
        this._burst(r.x + 8, r.y + 14, 10, ['grey', 'greyDk', 'yellow', 'white'], 70, 0.5, 80);
        this.shake = f32(0.4); this.shakeAmp = 2;
        this._emit('queenWound', { wounds: q.wounds });
        if (q.inflate >= q.need) this._popQueen(q);
    }

    _popQueen(q) {
        q.alive = false; q.deadT = 0; q.hooked = false;
        if (this.hookedQueen) { this.hose = HoseState.None; this.hoseLen = 0; this.hookedQueen = false; this._hoseCool = this.hoseCooldown; }
        this._addScore(this.pointsQueen);
        this._popup(q.x + 16, q.y + 6, String(this.pointsQueen), 'yellow');
        this._burst(q.x + 16, q.y + 16, 24, ['purple', 'white', 'yellow', 'orange', 'purpleDk'], 110, 0.9, 50);
        this.shake = f32(0.6); this.shakeAmp = 2;
        this._cues.emit(SoundCue.Hit);
        this._emit('queenPop');
        // her brood pops with her
        for (const p of this.pests) if (p.alive) this._pop(p, true);
    }

    // ------------------------------------------------------------------ rocks
    underRock(r) { return overlap(this.dx, this.dy, FTile, FTile, r.x, r.y + FTile, FTile, FTile); }

    _updateRocks(dt) {
        for (const r of this.rocks) {
            switch (r.state) {
                case RockState.Rest:
                    if (this.field.topStrip(r.col, r.row + 1, r.cracked || r.chained)) { r.state = RockState.Wobble; r.t = 0; this._emit('wobble'); }
                    break;
                case RockState.Wobble:
                    if (this.underRock(r)) break;               // it holds while the digger is right under it
                    r.t = f32(r.t + dt);
                    if (r.t >= (r.cracked ? this.crackedWobble : r.chained ? this.chainWobble : this.wobbleSeconds)) {
                        r.state = RockState.Fall; r.t = 0;
                        this.field.digTile(r.col, r.row);
                        // the rock sitting on this one comes next: a chain
                        for (const u of this.rocks) if (u.state === RockState.Rest && u.col === r.col && u.row === r.row - 1) u.chained = true;
                        this._cues.emit(SoundCue.Miss);
                        this._emit('rockFall', { chained: r.chained });
                    }
                    break;
                case RockState.Fall: {
                    r.t = f32(r.t + dt);
                    let left = f32(this.fallSpeed * dt);
                    let landed = false;
                    const q = this.queen;
                    while (left > 1e-7) {
                        const m = Math.min(1.0, left);
                        const ny = r.y + m;
                        if (ny > FPxH - FTile + 1e-6 || !this.field.rectDug(r.x, ny)) { landed = true; break; }
                        r.y = ny; left -= m;
                        if (q != null && q.alive && overlap(r.x + 2, r.y + 2, 12, 12, q.x + 2, q.y + 2, 28, 28)) {
                            this._woundQueen(q, r);
                            landed = true; break;
                        }
                        for (const p of this.pests) {
                            if (!p.solid || !overlap(r.x + 2, r.y + 2, 12, 12, p.x + 2, p.y + 2, 12, 12)) continue;
                            if (p.hooked) { this.hose = HoseState.None; this.hoseLen = 0; this.hookedPest = null; }
                            p.alive = false; p.death = 2; p.deadT = 0; p.hooked = false; p.breath = 0; p.fireLen = 0;
                            r.kills++; this._st.crush++;
                            if (r.chained) this._st.chainCrush++;
                            p.popPoints = 1000 * r.kills * (r.chained ? 2 : 1);
                            this._addScore(p.popPoints);
                            this._popup(p.x + 8, p.y + 4, String(p.popPoints), r.chained ? 'yellow' : 'white');
                            this._cues.emit(SoundCue.Hit);
                            this._emit('crush', { n: r.kills, chained: r.chained });
                        }
                    }
                    if (landed) {
                        r.state = RockState.Crumble; r.t = 0;
                        this.rocksFallen++; this._st.rockFalls++;
                        this.shake = Math.max(this.shake, f32(0.2)); this.shakeAmp = Math.max(1, this.shakeAmp);
                        this._burst(r.x + 8, r.y + 14, 6, ['grey', 'greyDk', this.def.earth[TunnelField.stratumAtPx(r.y)]], 45, 0.45, 120);
                        this._emit('rockLand', { kills: r.kills });
                        if (this.rocksFallen >= 2 && !this._vegDone) {
                            this._vegDone = true; this.vegActive = true; this.vegT = 0;
                            this._emit('vegUp');
                        }
                    }
                    break;
                }
                case RockState.Crumble:
                    r.t = f32(r.t + dt);
                    if (r.t >= this.crumbleSeconds) r.state = RockState.Gone;
                    break;
            }
        }
    }

    collectStats(into) {
        const s = this._st;
        add(into, 'pops', s.pops);
        add(into, 'crush', s.crush);
        add(into, 'chainCrush', s.chainCrush);
        add(into, 'veg', s.veg);
        add(into, 'rockFalls', s.rockFalls);
        add(into, 'dieTouch', s.dieTouch);
        add(into, 'dieFire', s.dieFire);
        add(into, 'dieRock', s.dieRock);
        add(into, 'dieQueen', s.dieQueen);
        add(into, 'ghosts', s.ghosts);
        add(into, 'breaths', s.breaths);
        add(into, 'escapes', s.escapes);
        add(into, 'extraLives', s.extra);
        add(into, 'queenWounds', s.wounds);
        add(into, 'hurries', s.hurries);
        add(into, 'depth', s.depth);
        add(into, 'd1Sec', s.d1Sec);
    }
}
TunnelRatSim.StartCol = 9;
TunnelRatSim.StartRow = 5;
TunnelRatSim.Tile = FTile;

function add(d, k, v) { d[k] = (d[k] || 0) + v; }
