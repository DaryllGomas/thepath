// THE NODE · world 1 · TUNNEL RAT on the Cabinet Engine · THE SIM (ICabinetSim).
// Port of TunnelRatSim.cs from Staging/Batch2/tunnelrat.
//
// A Dig Dug. The earth is 19 x 12 tiles of 16 px in four colour strata under a strip of sky. The
// digger walks the tile lattice (4-way, turning only on tile lines) and every pixel it covers is dug;
// the dug state is kept per 4 px sub-cell (TunnelField) so the tunnel grows with the digger.
//
//   PESTS     start in pre-dug pockets. Goggle-bugs are slow; fire-lizards breathe fire along open
//             tunnel (never through earth). Both GHOST: far from the digger they may leave their body
//             and drift straight through the earth toward it, re-forming on the first dug tile they
//             cross (never inside 24 px of where they left).
//   PUMP      hold A: the hose shoots 3 tiles along open tunnel; a pest it catches inflates one stage
//             every pumpStep while A stays held and pops on the 4th. Release A and the pest deflates a
//             stage at a time; an inflated pest is frozen and harmless.
//   ROCKS     sit in the earth. Dig out the strip under one and it wobbles (it holds while the digger
//             is right under it), then falls through open tunnel until earth stops it, crushing every
//             pest (and the digger) in its path, then crumbles. After two rocks have fallen on a
//             screen a bonus carrot appears at the centre for 10 s.
//   ROUND     3 lives. Won = BOTH screens cleared of pests (screen 2 has more pests and a ghosting
//             bonus). Lost = the third life gone. Score: pop 200/300/400/500 by stratum, rock 1000 per
//             pest, carrot 400.
//
// MERCY comes in through the knobs: pest speed x0.9 per lost round ("burrow speed"), and from the
// first loss one rock starts PRE-CRACKED right over a vertical pest pocket (one earth tile between:
// touch that tile and it drops almost at once). The unlosable credit (CreditInfo.unlosable): pests
// barely move and barely ghost (knob caps) and the digger cannot die.
//
// NUMBER NOTE: unlike Grid Cycles/Stack Attack, most of this sim's physics is C# `double` (DX/DY, every
// Pest/Rock X/Y, HoseLen, DiggerWalk...), so those need no f32() wraps — JS numbers already are IEEE
// doubles. Only the `float` fields (PhaseTime, Time, the per-pest/per-rock timers, the knob-resolved
// speeds/rates) need f32() at each op, and only where a float sub-expression feeds a double result.
// Dice: System.Random (sdk/rng.js SystemRandom), not a custom RNG — call order must match exactly.
import {
    f32, idiv, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4, SystemRandom,
} from '../../sdk/index.js';

const FW = 19, FH = 12, FTile = 16, FSub = 4;
const FSW = FW * FTile / FSub, FSH = FH * FTile / FSub;      // 76 x 48
const FPxW = FW * FTile, FPxH = FH * FTile;                  // 304 x 192

export class TunnelField {
    constructor() { this._dug = new Uint8Array(FSW * FSH); }

    clear() { this._dug.fill(0); }

    dug(sx, sy) { return sx >= 0 && sy >= 0 && sx < FSW && sy < FSH && this._dug[sy * FSW + sx] !== 0; }
    inSub(sx, sy) { return sx >= 0 && sy >= 0 && sx < FSW && sy < FSH; }

    static stratum(tileRow) { return Math.max(0, Math.min(3, idiv(tileRow, 3))); }
    static stratumAtPx(y) { return TunnelField.stratum(Math.floor((y + 8) / FTile)); }

    // mark every sub-cell a 16 x 16 body at (x, y) touches
    digRect(x, y) {
        let n = 0;
        const x0 = s0(x), x1 = s1(x), y0 = s0(y), y1 = s1(y);
        for (let sy = y0; sy <= y1; sy++)
            for (let sx = x0; sx <= x1; sx++)
                if (this.inSub(sx, sy) && this._dug[sy * FSW + sx] === 0) { this._dug[sy * FSW + sx] = 1; n++; }
        return n;
    }

    digTile(tx, ty) {
        for (let j = 0; j < 4; j++)
            for (let i = 0; i < 4; i++) {
                const sx = tx * 4 + i, sy = ty * 4 + j;
                if (this.inSub(sx, sy)) this._dug[sy * FSW + sx] = 1;
            }
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

export class Pest {
    constructor(id) {
        this.id = id;
        this.lizard = false;
        this.x = 0; this.y = 0; this.homeX = 0; this.homeY = 0;
        this.dir = Dir4.Left; this.face = Dir4.Left;          // face: the way it looks (left/right)
        this.alive = true;
        this.death = 0;                                        // 1 popped, 2 crushed
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
        this.stuckT = 0;                                       // seconds it has not been able to move
        this.popPoints = 0;
    }
    get solid() { return this.alive && !this.ghost; }
    get dangerous() { return this.alive && !this.ghost && this.stage === 0 && !this.hooked; }
}

export const RockState = Object.freeze({ Rest: 0, Wobble: 1, Fall: 2, Crumble: 3, Gone: 4 });

export class Rock {
    constructor(col, row, cracked) {
        this.col = col; this.row = row;
        this.x = col * FTile; this.y = row * FTile;
        this.state = RockState.Rest;
        this.t = 0;
        this.cracked = !!cracked;
        this.kills = 0;
    }
}

const Phase = Object.freeze({ Idle: 0, Ready: 1, Play: 2, Death: 3, Clear: 4, Card: 5, Over: 6 });
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

// base + (float)rng.nextDouble() * span, all f32-rounded like the C# `base + (float)rng.NextDouble() * span`
function frand(rng, base, span) { return f32(f32(base) + f32(f32(rng.nextDouble()) * f32(span))); }

export class TunnelRatSim {
    static get Phase() { return Phase; }
    static get HoseState() { return HoseState; }

    static aligned(v) { return Math.abs(v - roundEven(v / FTile) * FTile) < 1e-6; }

    constructor() {
        this.StartCol = 9; this.StartRow = 5;
        this.Tile = FTile;

        // the machine's timing (not mercy knobs)
        this.readySeconds = f32(2.2); this.reReadySeconds = f32(1.4); this.deathSeconds = f32(2.0);
        this.clearSeconds = f32(2.2); this.cardSeconds = f32(3.0);
        this.wobbleSeconds = f32(0.55); this.crackedWobble = f32(0.12); this.crumbleSeconds = f32(0.6); this.fallSpeed = f32(110);
        this.deflateStep = f32(0.5); this.hoseSpeed = f32(220); this.hoseRange = f32(48); this.hoseCooldown = f32(0.12);
        this.fireRange = f32(48); this.fireSpeed = f32(110); this.fireHold = f32(0.9);
        this.reformGap = f32(28); this.reformSeconds = f32(0.4);
        this.vegSeconds = f32(10);
        this.lives0 = 3;
        this.pointsCrush = 1000; this.pointsVeg = 400;

        // read-only state (C# public getters)
        this.field = new TunnelField();
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.screen = 0;
        this.dx = 0; this.dy = 0;
        this.facing = Dir4.Right;
        this.diggerMoving = false; this.diggerDigging = false;
        this.diggerWalk = 0;
        this.hose = HoseState.None; this.hoseLen = 0; this.hoseDir = Dir4.Right;
        this.hookedPest = null;
        this.pumpStrokes = 0;
        this.pests = []; this.rocks = [];
        this.vegActive = false; this.vegT = 0; this.vegTakenT = f32(-1);
        this.rocksFallen = 0;
        this.deathCause = 0;
        this.credit = null;
        this.playSeconds = 0;
        this.ghostBonus = 0;
        this.readyLength = 0;

        // knobs (resolved)
        this.walkSpeed = 0; this.digSpeed = 0; this.bugSpeed = 0; this.lizardSpeed = 0; this.ghostSpeed = 0;
        this.pestSpeedMul = 0; this.ghostRate = 0; this.ghostFar = 0; this.chase = 0;
        this.fireAim = 0; this.fireIdle = 0; this.fireWindup = 0; this.pumpStep = 0;
        this.pests1 = 0; this.pests2 = 0; this.lizards1 = 0; this.lizards2 = 0; this.rockCount = 0; this.maxGhosts = 0;
        this.crackedRock = false;
        this.screenGhostBonus = 0;

        this._cues = new CueBuffer();
        this._log = '';
        this.rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0;
        this._time = 0; this._hoseCool = 0; this._ghostGrace = 0; this._pumpT = 0;
        this._vegDone = false;
        this._statPops = 0; this._statCrush = 0; this._statVeg = 0; this._statDeathPest = 0; this._statDeathFire = 0;
        this._statDeathRock = 0; this._statGhosts = 0; this._statBreaths = 0; this._statRockFalls = 0; this._statScreen2 = 0;
        this._statS1Sec = 0;
        this._cand = new Int32Array(4);
    }

    get mercyActive() { return this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get pestsLeft() { let n = 0; for (const p of this.pests) if (p.alive) n++; return n; }
    get pumpPhase() { return this.pumpStep > 0 ? f32(this._pumpT / this.pumpStep) : 0; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Death: case Phase.Clear: return CabinetState.Interlude;
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
        return r + ' screen ' + this.screen + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this._lives +
               ' pops ' + this._statPops + ' crush ' + this._statCrush + ' veg ' + this._statVeg + ' log ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = new SystemRandom(seed === 0 ? undefined : seed);
        this.walkSpeed = k.get('walkSpeed'); this.digSpeed = k.get('digSpeed');
        this.pestSpeedMul = k.get('pestSpeed');
        this.bugSpeed = k.get('bugSpeed'); this.lizardSpeed = k.get('lizardSpeed'); this.ghostSpeed = k.get('ghostSpeed');
        this.ghostRate = k.get('ghostRate'); this.ghostFar = k.get('ghostFar'); this.chase = k.get('chase');
        this.fireAim = k.get('fireAim'); this.fireIdle = k.get('fireIdle'); this.fireWindup = k.get('fireWindup');
        this.pumpStep = k.get('pumpStep');
        this.pests1 = roundEven(k.get('pests1')); this.pests2 = Math.max(this.pests1 + 1, roundEven(k.get('pests2')));
        this.lizards1 = Math.trunc(k.get('lizards1')); this.lizards2 = Math.trunc(k.get('lizards2'));
        this.rockCount = Math.trunc(k.get('rocks')); this.maxGhosts = Math.trunc(k.get('maxGhosts'));
        this.crackedRock = k.get('crackedRock') >= f32(0.5);
        this.screenGhostBonus = k.get('ghostBonus');

        this._score = 0; this._time = 0; this._lives = this.lives0;
        this._result = RoundResult.None;
        this._log = '';
        this._cues.resetTotals();
        this._statPops = this._statCrush = this._statVeg = this._statDeathPest = this._statDeathFire = this._statDeathRock =
            this._statGhosts = this._statBreaths = this._statRockFalls = this._statScreen2 = 0;
        this._statS1Sec = 0;
        this._buildScreen(1);
        this._goReady(this.readySeconds);
    }

    // ------------------------------------------------------------------ the field
    _buildScreen(n) {
        this.screen = n;
        this.ghostBonus = n >= 2 ? this.screenGhostBonus : f32(1);
        this.field.clear();
        this.pests.length = 0; this.rocks.length = 0;
        this.rocksFallen = 0; this._vegDone = false; this.vegActive = false; this.vegTakenT = f32(-1);
        if (n === 2) this._statScreen2 = 1;

        // the start shaft: from the surface down to the centre
        for (let r = 0; r <= this.StartRow; r++) this.field.digTile(this.StartCol, r);

        const count = n === 1 ? this.pests1 : this.pests2, lizards = n === 1 ? this.lizards1 : this.lizards2;
        const W = FW, H = FH;
        const used = new Uint8Array(W * H);      // pockets, shaft and a 1-tile moat round each
        for (let r = 0; r <= this.StartRow + 1; r++) for (let c = this.StartCol - 1; c <= this.StartCol + 1; c++) mark(used, c, r);

        const pockets = [];
        for (let i = 0; i < count; i++) {
            const wantVert = this.crackedRock && i === 0;
            for (let tries = 0; tries < 400; tries++) {
                const vert = wantVert || this.rng.nextDouble() < 0.4;
                const len = vert ? 3 : 3 + (this.rng.nextDouble() < 0.4 ? 1 : 0);
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
                pockets.push({ c, r, vert, len });
                const p = new Pest(i);
                p.lizard = i >= count - lizards;
                p.x = p.homeX = mc * FTile; p.y = p.homeY = mr * FTile;
                p.dir = vert ? (this.rng.nextDouble() < 0.5 ? Dir4.Up : Dir4.Down) : (this.rng.nextDouble() < 0.5 ? Dir4.Left : Dir4.Right);
                p.face = this.rng.nextDouble() < 0.5 ? Dir4.Left : Dir4.Right;
                p.fireCool = frand(this.rng, 2, 2);
                this.pests.push(p);
                break;
            }
        }

        // the pre-cracked rock: right over the first (vertical) pocket, one earth tile between
        const rockUsed = new Uint8Array(W * H);
        if (this.crackedRock && pockets.length > 0 && pockets[0].vert && pockets[0].r >= 3
            && this.field.tileDugCount(pockets[0].c, pockets[0].r - 2) === 0 && this.field.tileDugCount(pockets[0].c, pockets[0].r - 1) === 0)
            this._addRock(pockets[0].c, pockets[0].r - 2, true, rockUsed);
        for (let i = 0, tries = 0; i < this.rockCount && tries < 600; tries++) {
            const c = this.rng.next(0, W), r = this.rng.next(1, 9);
            if (c === this.StartCol && r <= this.StartRow + 1) continue;
            if (this.field.tileDugCount(c, r) > 0 || this.field.tileDugCount(c, r + 1) > 0 || this.field.tileDugCount(c, r - 1) > 0) continue;
            if (this.field.tileDugCount(c - 1, r) > 0 || this.field.tileDugCount(c + 1, r) > 0) continue;
            if (rockUsed[r * W + c]) continue;
            this._addRock(c, r, false, rockUsed);
            i++;
        }
    }

    _addRock(c, r, cracked, rockUsed) {
        this.rocks.push(new Rock(c, r, cracked));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(rockUsed, c + dx, r + dy);
    }

    _resetActors() {
        this.dx = this.StartCol * FTile; this.dy = this.StartRow * FTile; this.facing = Dir4.Right;
        this.diggerMoving = false; this.diggerDigging = false;
        this.hose = HoseState.None; this.hoseLen = 0; this.hookedPest = null; this._hoseCool = 0;
        for (const p of this.pests) {
            if (!p.alive) continue;
            p.x = p.homeX; p.y = p.homeY;
            p.ghost = false; p.ghostT = 0; p.ghostCool = f32(1.5); p.reform = 0;
            p.stage = 0; p.hooked = false; p.deflate = 0;
            p.breath = 0; p.breathT = 0; p.fireLen = 0; p.fireCool = frand(this.rng, 1.5, 2);
        }
        this._ghostGrace = f32(3);
    }

    _goReady(seconds) {
        this._resetActors();
        this.p = Phase.Ready; this.phaseTime = 0; this.readyLength = seconds;
        this._cues.emit(SoundCue.Tick);
    }

    // ------------------------------------------------------------------ stepping
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);

        switch (this.p) {
            case Phase.Ready:
                if (this.phaseTime >= this.readyLength) { this.p = Phase.Play; this.phaseTime = 0; this.playSeconds = 0; this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Play:
                this.playSeconds = f32(this.playSeconds + dt);
                this._updatePlay(dt, input);
                break;
            case Phase.Death:
                this._ageDead(dt);
                if (this.phaseTime >= this.deathSeconds) {
                    if (this._lives <= 0) { this._result = RoundResult.Lost; this.p = Phase.Card; this.phaseTime = 0; }
                    else this._goReady(this.reReadySeconds);
                }
                break;
            case Phase.Clear:
                this._ageDead(dt);
                if (this.phaseTime >= this.clearSeconds) {
                    if (this.screen === 1) { this._statS1Sec = this._time; this._buildScreen(2); this._goReady(this.readySeconds); }
                    else { this._result = RoundResult.Won; this.p = Phase.Card; this.phaseTime = 0; this._cues.emit(SoundCue.Win); }
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _ageDead(dt) {
        for (const p of this.pests) if (!p.alive) p.deadT = f32(p.deadT + dt);
        for (const r of this.rocks) if (r.state === RockState.Crumble) { r.t = f32(r.t + dt); if (r.t >= this.crumbleSeconds) r.state = RockState.Gone; }
    }

    _updatePlay(dt, input) {
        this._ghostGrace = f32(this._ghostGrace - dt);
        if (this._hoseCool > 0) this._hoseCool = f32(this._hoseCool - dt);

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
        for (const p of this.pests) {
            if (!p.alive) { p.deadT = f32(p.deadT + dt); continue; }
            if (p.hooked) { p.deflate = 0; continue; }
            if (p.stage > 0) {
                p.deflate = f32(p.deflate + dt);
                if (p.deflate >= this.deflateStep) { p.deflate = f32(p.deflate - this.deflateStep); p.stage--; }
                if (p.stage > 0) continue;
            }
            if (p.ghost) { this._updateGhost(p, dt); continue; }
            if (p.reform > 0) { p.reform = f32(p.reform - dt); continue; }     // the body re-forming: a beat before it moves
            if (p.breath > 0) { this._updateBreath(p, dt); continue; }
            p.ghostCool = f32(p.ghostCool - dt); p.fireCool = f32(p.fireCool - dt);

            const far = Math.abs(p.x - this.dx) + Math.abs(p.y - this.dy);
            if (this._ghostGrace <= 0 && p.ghostCool <= 0 && ghosts < this.maxGhosts && far > this.ghostFar &&
                this.rng.nextDouble() < f32(f32(this.ghostRate * this.ghostBonus) * dt)) {
                p.ghost = true; p.ghostT = 0; p.ghostFromX = p.x; p.ghostFromY = p.y; p.ghostVX = p.ghostVY = 0; ghosts++; this._statGhosts++;
                continue;
            }
            if (p.lizard && p.fireCool <= 0 && TunnelRatSim.aligned(p.y)) {
                const inRow = Math.abs(this.dy - p.y) < 10;
                const ahead = this.dx - p.x;
                const inLine = inRow && Math.abs(ahead) < 80;
                const rate = inLine ? this.fireAim : this.fireIdle;
                if (this.rng.nextDouble() < f32(rate * dt)) {
                    if (inLine) p.face = ahead > 0 ? Dir4.Right : Dir4.Left;
                    p.breath = 1; p.breathT = 0; p.fireLen = 0; this._statBreaths++;
                    continue;
                }
            }
            const ox = p.x, oy = p.y;
            this._movePest(p, dt);
            // a pest boxed in (it can happen: a rock lands in its pocket) ghosts out
            if (p.x === ox && p.y === oy) p.stuckT = f32(p.stuckT + dt); else p.stuckT = 0;
            if (p.stuckT > 2.5) {
                p.stuckT = 0;
                p.ghost = true; p.ghostT = 0; p.ghostFromX = p.x; p.ghostFromY = p.y; p.ghostVX = p.ghostVY = 0; ghosts++; this._statGhosts++;
            }
        }

        // ---- rocks
        this._updateRocks(dt);

        // ---- the carrot
        if (this.vegActive) {
            this.vegT = f32(this.vegT + dt);
            if (this.vegT >= this.vegSeconds) this.vegActive = false;
            else if (overlap(this.dx + 3, this.dy + 3, 10, 10, this.StartCol * FTile + 2, this.StartRow * FTile + 2, 12, 12)) {
                this.vegActive = false; this._score += this.pointsVeg; this._statVeg++; this.vegTakenT = this._time; this._cues.emit(SoundCue.Bonus);
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
            for (const r of this.rocks)
                if (r.state === RockState.Fall && overlap(this.dx + 3, this.dy + 3, 10, 10, r.x + 2, r.y + 2, 12, 12)) cause = 3;
            if (cause !== 0) { this._die(cause); return; }
        }

        // ---- the screen is clear
        if (this.pestsLeft === 0) {
            if (this.hose !== HoseState.None) this._releaseHose();
            this.p = Phase.Clear; this.phaseTime = 0;
            this._cues.emit(SoundCue.Bonus);
            this._log += 'S' + this.screen + '@' + fmt(this._time, 0, F32) + ' ';
        }
    }

    _die(cause) {
        this.deathCause = cause;
        if (cause === 1) this._statDeathPest++; else if (cause === 2) this._statDeathFire++; else this._statDeathRock++;
        this._log += (cause === 1 ? 'P' : cause === 2 ? 'F' : 'R') + fmt(this._time, 0, F32) + ' ';
        this._lives--;
        if (this.hose !== HoseState.None) this._releaseHose();
        this.diggerMoving = false;
        this.p = Phase.Death; this.phaseTime = 0;
        this._cues.emit(SoundCue.Die);
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
            this.field.digRect(this.dx, this.dy);
        }
    }

    // ------------------------------------------------------------------ the hose
    _updateHose(dt) {
        switch (this.hose) {
            case HoseState.None:
                if (this._hoseCool <= 0) {
                    this.hose = HoseState.Out; this.hoseLen = 0; this.hoseDir = this.facing;
                    this._cues.emit(SoundCue.Tick);
                    this._hoseOutTick(dt);              // goto case Out
                }
                break;
            case HoseState.Out:
                this._hoseOutTick(dt);
                break;
            case HoseState.Hooked: {
                const p = this.hookedPest;
                if (p == null || !p.alive) { this.hose = HoseState.None; this.hookedPest = null; break; }
                this.hoseLen = Math.max(0, this._hoseReach(p));
                this._pumpT = f32(this._pumpT + dt);
                if (this._pumpT >= this.pumpStep) {
                    this._pumpT = f32(this._pumpT - this.pumpStep);
                    p.stage++; p.deflate = 0; this.pumpStrokes++;
                    this._cues.emit(SoundCue.Tick);
                    if (p.stage >= 4) this._pop(p);
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
        if (hit != null) {
            this.hose = HoseState.Hooked; this.hookedPest = hit; hit.hooked = true; hit.breath = 0; hit.fireLen = 0;
            this._pumpT = 0;
            this.hoseLen = Math.max(0, this._hoseReach(hit));
            return;
        }
        this.hoseLen = len;
        if (blocked || len >= this.hoseRange - 1e-6) { this.hose = HoseState.Back; this._cues.emit(SoundCue.Miss); }
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

    _releaseHose() {
        if (this.hookedPest != null) { this.hookedPest.hooked = false; this.hookedPest.deflate = 0; }
        this.hookedPest = null;
        this.hose = HoseState.None; this.hoseLen = 0;
        this._hoseCool = this.hoseCooldown;
    }

    static popPointsAt(y) { return 200 + 100 * TunnelField.stratumAtPx(y); }

    _pop(p) {
        p.alive = false; p.death = 1; p.deadT = 0; p.hooked = false;
        p.popPoints = TunnelRatSim.popPointsAt(p.y);
        this._score += p.popPoints; this._statPops++;
        this._cues.emit(SoundCue.Hit);
        this.hose = HoseState.None; this.hoseLen = 0; this.hookedPest = null; this._hoseCool = this.hoseCooldown;
    }

    // ------------------------------------------------------------------ pests
    pestCanOccupy(x, y) {
        if (!this.field.rectDug(x, y)) return false;
        for (const r of this.rocks)
            if ((r.state === RockState.Rest || r.state === RockState.Wobble) && overlap(x, y, FTile, FTile, r.x, r.y, FTile, FTile)) return false;
        return true;
    }

    pestSpeed(p) { return f32(f32(p.lizard ? this.lizardSpeed : this.bugSpeed) * this.pestSpeedMul); }

    _movePest(p, dt) {
        const speed = this.pestSpeed(p);
        if (speed <= 1e-6) return;
        let tLeft = dt;
        for (let guard = 0; guard < 80 && tLeft > 1e-7; guard++) {
            if (TunnelRatSim.aligned(p.x) && TunnelRatSim.aligned(p.y)) {
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

    _updateGhost(p, dt) {
        p.ghostT = f32(p.ghostT + dt);
        // steer for the digger; inside reformGap it keeps its heading and drifts on through
        const vx = this.dx - p.x, vy = this.dy - p.y, len = Math.sqrt(vx * vx + vy * vy);
        if (len > this.reformGap || (p.ghostVX === 0 && p.ghostVY === 0)) {
            if (len > 1e-6) { p.ghostVX = vx / len; p.ghostVY = vy / len; }
            else { p.ghostVX = 1; p.ghostVY = 0; }
        }
        const step = f32(f32(this.ghostSpeed * this.pestSpeedMul) * dt);
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

    _updateBreath(p, dt) {
        p.breathT = f32(p.breathT + dt);
        if (p.breath === 1) {
            if (p.breathT >= this.fireWindup) { p.breath = 2; p.breathT = 0; p.fireLen = 0; }
            return;
        }
        const open = this.field.openRun(p.x, p.y, p.face, this.fireRange);
        p.fireLen = Math.min(open, p.fireLen + f32(this.fireSpeed * dt));
        if (p.breathT >= this.fireHold) {
            p.breath = 0; p.fireLen = 0; p.fireCool = frand(this.rng, 2.5, 2.5);
        }
    }

    // ------------------------------------------------------------------ rocks
    underRock(r) { return overlap(this.dx, this.dy, FTile, FTile, r.x, r.y + FTile, FTile, FTile); }

    _updateRocks(dt) {
        for (const r of this.rocks) {
            switch (r.state) {
                case RockState.Rest:
                    if (this.field.topStrip(r.col, r.row + 1, r.cracked)) { r.state = RockState.Wobble; r.t = 0; }
                    break;
                case RockState.Wobble:
                    if (this.underRock(r)) break;               // it holds while the digger is right under it
                    r.t = f32(r.t + dt);
                    if (r.t >= (r.cracked ? this.crackedWobble : this.wobbleSeconds)) {
                        r.state = RockState.Fall; r.t = 0;
                        this.field.digTile(r.col, r.row);
                        this._cues.emit(SoundCue.Miss);
                    }
                    break;
                case RockState.Fall: {
                    r.t = f32(r.t + dt);
                    let left = f32(this.fallSpeed * dt);
                    let landed = false;
                    while (left > 1e-7) {
                        const m = Math.min(1.0, left);
                        const ny = r.y + m;
                        if (ny > FPxH - FTile + 1e-6 || !this.field.rectDug(r.x, ny)) { landed = true; break; }
                        r.y = ny; left -= m;
                        for (const p of this.pests) {
                            if (!p.solid || !overlap(r.x + 2, r.y + 2, 12, 12, p.x + 2, p.y + 2, 12, 12)) continue;
                            if (p.hooked) { this.hose = HoseState.None; this.hoseLen = 0; this.hookedPest = null; }
                            p.alive = false; p.death = 2; p.deadT = 0; p.hooked = false; p.breath = 0; p.fireLen = 0;
                            p.popPoints = this.pointsCrush;
                            r.kills++; this._statCrush++;
                            this._score += this.pointsCrush;
                            this._cues.emit(SoundCue.Hit);
                        }
                    }
                    if (landed) {
                        r.state = RockState.Crumble; r.t = 0;
                        this.rocksFallen++; this._statRockFalls++;
                        if (this.rocksFallen >= 2 && !this._vegDone) { this._vegDone = true; this.vegActive = true; this.vegT = 0; }
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
        add(into, 'pops', this._statPops);
        add(into, 'crush', this._statCrush);
        add(into, 'veg', this._statVeg);
        add(into, 'rockFalls', this._statRockFalls);
        add(into, 'dieTouch', this._statDeathPest);
        add(into, 'dieFire', this._statDeathFire);
        add(into, 'dieRock', this._statDeathRock);
        add(into, 'ghosts', this._statGhosts);
        add(into, 'breaths', this._statBreaths);
        add(into, 'screen2', this._statScreen2);
        add(into, 's1Sec', this._statS1Sec);
    }
}
TunnelRatSim.StartCol = 9;
TunnelRatSim.StartRow = 5;
TunnelRatSim.Tile = FTile;

function add(d, k, v) { d[k] = (d[k] || 0) + v; }
