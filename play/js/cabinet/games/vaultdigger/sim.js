// THE NODE · world 1 · VAULT DIGGER (Castle Coin, 1983) on the Cabinet Engine · THE SIM (ICabinetSim).
// Port of VaultDiggerSim.cs and VaultMap.cs from Staging/Batch2/vaultdigger.
//
// A vault-digging runner in one handcrafted vault (VaultMap). The runner walks, climbs ladders, hangs
// from bars hand over hand and falls; button A digs the brick diagonally ahead-below on the side he
// faces, or the side the stick is held when A goes down (that press aims, it does not steer). A dug
// hole stays open holeTime seconds, then refills: a guard inside is buried (and comes back from the
// top), the runner inside dies. A guard that falls into an open hole is TRAPPED for trapTime seconds,
// drops any gold it carries on the tile above, then climbs out and steps off sideways. Guards pick
// gold up as they walk. Touch a free guard and it costs a life (3). Take every gold piece and the
// EXIT ladder rises out of the top of the vault: climb it off the screen and the round is won.
//
// THE ROUND: READY (Intro) -> PLAY (Playing) -> [CAUGHT (Interlude) -> READY ...] -> ESCAPE
// (Interlude, the climb out) -> CARD -> OVER. Every move runs tile centre to tile centre on a fixed
// 120 Hz tick (dt-independent). The runner can reverse mid-tile; guards decide only at tile centres.
// SCORE: gold 250, a guard trapped 75 (a guard buried by the refill: 75 more).
//
// GUARDS hunt with simple pathing (Hunt): the runner's row first, then the column. guardPathing is
// the chance a decision hunts at all; the rest are patrol steps (Wander), each after a short look
// about (hesitateSeconds), so a guard with worse pathing is also a slower one.
//
// MERCY: knobs ease the guards' pathing (x0.9 a loss: fewer hunting decisions, more patrol steps) and
// hold dug holes open longer (+0.5 s a loss). On the unlosable credit the guards WANDER instead of
// hunting, never pick up gold, and the runner cannot die: a touch does nothing and a refilling hole
// lifts him out.
//
// NUMBER NOTE: unlike Tunnel Rat, almost everything here is C# `float` (Actor.P/FX/FY are float, not
// double), so this port needs f32() wraps as pervasively as Stack Attack/Grid Cycles. Dice: plain
// `System.Random` (sdk/rng.js SystemRandom), seeded `seed == 0 ? 1 : seed` (NOT "unseeded" on 0, unlike
// Tunnel Rat's rule) — call order must match exactly.
import {
    f32, roundEven, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4, SystemRandom,
} from '../../sdk/index.js';

const MW = 18, MH = 12;

const Level = [
    '.........S........',
    '.$.......S..G...$.',
    '###H##########H###',
    '...H----------H...',
    '$..H....$.....HG.$',
    'H######....H######',
    'H....------H......',
    'H..$...G.$.H..$...',
    '#####H##########H#',
    '.....H..........H.',
    '$....H...P...$..H$',
    '=####=##########==',
];

export const Tile = Object.freeze({ Empty: 0, Brick: 1, Rock: 2, Ladder: 3, Bar: 4, Exit: 5 });

export class VaultMap {
    constructor() {
        this.tiles = new Uint8Array(MW * MH);
        this.gold = new Uint8Array(MW * MH);         // gold pieces on the tile (a dropped piece can land on another)
        this.goldOrigin = new Uint8Array(MW * MH);
        this.holeT = new Float32Array(MW * MH);       // > 0: open, seconds until it refills
        this.holeSpan = new Float32Array(MW * MH);    // the hole's full open time (for the refill picture)
        this.exitOpen = false;
        this.exitT = 0;                                // seconds since the exit ladder appeared
        this.startX = 0; this.startY = 0; this.exitX = -1;
        this.guardStarts = [];                         // tile index
        this.goldTotal = 0;
        this.load(Level);
    }

    static idx(x, y) { return y * MW + x; }
    static inB(x, y) { return x >= 0 && y >= 0 && x < MW && y < MH; }

    load(rows) {
        this.guardStarts.length = 0;
        this.goldTotal = 0; this.exitOpen = false; this.exitT = 0; this.exitX = -1;
        for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) {
                const c = x < rows[y].length ? rows[y][x] : '.';
                const i = VaultMap.idx(x, y);
                let t = Tile.Empty;
                this.gold[i] = 0; this.holeT[i] = 0; this.holeSpan[i] = 0;
                switch (c) {
                    case '#': t = Tile.Brick; break;
                    case '=': t = Tile.Rock; break;
                    case 'H': t = Tile.Ladder; break;
                    case '-': t = Tile.Bar; break;
                    case 'S': t = Tile.Exit; if (this.exitX < 0) this.exitX = x; break;
                    case '$': this.gold[i] = 1; this.goldTotal++; break;
                    case 'P': this.startX = x; this.startY = y; break;
                    case 'G': this.guardStarts.push(i); break;
                }
                this.tiles[i] = t;
                this.goldOrigin[i] = this.gold[i] > 0 ? 1 : 0;
            }
    }

    // ------------------------------------------------------------------ queries
    at(x, y) {
        if (y < 0) return Tile.Empty;
        if (!VaultMap.inB(x, y)) return Tile.Rock;
        return this.tiles[VaultMap.idx(x, y)];
    }

    // solid = walls you stand on and cannot enter: bedrock, and brick that is not dug open
    solid(x, y) {
        if (y < 0) return false;
        if (!VaultMap.inB(x, y)) return true;
        const i = VaultMap.idx(x, y);
        const t = this.tiles[i];
        if (t === Tile.Rock) return true;
        if (t === Tile.Brick) return this.holeT[i] <= 0;
        return false;
    }

    // a map where every dug hole is still brick (the guards' idea of the vault)
    solidStatic(x, y) {
        if (y < 0) return false;
        if (!VaultMap.inB(x, y)) return true;
        const t = this.tiles[VaultMap.idx(x, y)];
        return t === Tile.Rock || t === Tile.Brick;
    }

    solidWith(x, y, staticHoles) { return staticHoles ? this.solidStatic(x, y) : this.solid(x, y); }

    ladder(x, y) {
        const t = this.at(x, y);
        return t === Tile.Ladder || (t === Tile.Exit && this.exitOpen);
    }

    bar(x, y) { return this.at(x, y) === Tile.Bar; }
    brick(x, y) { return VaultMap.inB(x, y) && this.tiles[VaultMap.idx(x, y)] === Tile.Brick; }
    openHole(x, y) { return this.brick(x, y) && this.holeT[VaultMap.idx(x, y)] > 0; }
    hasGold(x, y) { return VaultMap.inB(x, y) && this.gold[VaultMap.idx(x, y)] > 0; }

    // empty air as far as digging is concerned: no ladder, bar or wall in the way
    clear(x, y) {
        const t = this.at(x, y);
        return y >= 0 && VaultMap.inB(x, y) && (t === Tile.Empty || (t === Tile.Exit && !this.exitOpen));
    }

    get goldOnMap() { let n = 0; for (let i = 0; i < this.gold.length; i++) n += this.gold[i]; return n; }

    // ------------------------------------------------------------------ the fairness proof
    // Every gold piece and the exit's top must be reachable from the start by movement alone (no
    // digging), with the exit open. Returns the unreachable gold tiles (empty = fair).
    unreachable() {
        const was = this.exitOpen; this.exitOpen = true;
        const fromStart = this._flood(VaultMap.idx(this.startX, this.startY));
        const bad = [];
        const exitTop = this.exitX >= 0 ? VaultMap.idx(this.exitX, 0) : -1;
        for (let i = 0; i < MW * MH; i++)
            if (this.goldOrigin[i] && (!fromStart[i] || (exitTop >= 0 && !this._flood(i)[exitTop]))) bad.push(i);
        if (exitTop < 0 || !fromStart[exitTop]) bad.push(exitTop);
        this.exitOpen = was;
        return bad;
    }

    _flood(from) {
        const seen = new Uint8Array(MW * MH);
        const q = [from]; seen[from] = 1;
        let qi = 0;
        const nb = [];
        while (qi < q.length) {
            const i = q[qi++];
            this.moves(i % MW, Math.trunc(i / MW), false, nb);
            for (const j of nb) if (!seen[j]) { seen[j] = 1; q.push(j); }
        }
        return seen;
    }

    // the runner's (and a guard's) moves from a standing tile, by the same rules the sim uses.
    // staticHoles = treat dug holes as brick (how the guards read the vault).
    supported(x, y, staticHoles) {
        if (this.ladder(x, y) || this.bar(x, y)) return true;
        if (staticHoles ? this.solidStatic(x, y + 1) : this.solid(x, y + 1)) return true;
        return this.ladder(x, y + 1);
    }

    moves(x, y, staticHoles, into) {
        into.length = 0;
        if (!this.supported(x, y, staticHoles)) {
            if (y + 1 < MH && !this.solidWith(x, y + 1, staticHoles)) into.push(VaultMap.idx(x, y + 1));
            return;
        }
        if (x > 0 && !this.solidWith(x - 1, y, staticHoles)) into.push(VaultMap.idx(x - 1, y));
        if (x < MW - 1 && !this.solidWith(x + 1, y, staticHoles)) into.push(VaultMap.idx(x + 1, y));
        if (this.ladder(x, y) && y > 0 && !this.solidWith(x, y - 1, staticHoles)) into.push(VaultMap.idx(x, y - 1));
        if (y + 1 < MH && !this.solidWith(x, y + 1, staticHoles)) into.push(VaultMap.idx(x, y + 1));
    }
}
VaultMap.W = MW; VaultMap.H = MH;

// ------------------------------------------------------------------ actors
class Actor {
    constructor() {
        this.x = 0; this.y = 0;             // the tile we are at (or leaving)
        this.tx = 0; this.ty = 0;           // the tile we are moving to (== x,y when still)
        this.p = 0;                          // 0..1 of the way from x,y to tx,ty
        this.moving = false; this.falling = false;
        this.moveDir = -1;                   // Dir4 of the current move
        this.face = 1;                       // +1 right, -1 left
        this.anim = 0;                       // tiles travelled, for walk frames
    }
    get fx() { return f32(this.x + f32((this.tx - this.x) * this.p)); }
    get fy() { return f32(this.y + f32((this.ty - this.y) * this.p)); }
    get lx() { return this.p < f32(0.5) ? this.x : this.tx; }       // the nearest tile
    get ly() { return this.p < f32(0.5) ? this.y : this.ty; }

    place(x, y) { this.x = this.tx = x; this.y = this.ty = y; this.p = 0; this.moving = this.falling = false; this.moveDir = -1; }
}

export const GState = Object.freeze({ Walk: 0, Trapped: 1, Climb: 2, Dead: 3 });

class Guard extends Actor {
    constructor(id, homeX, homeY) {
        super();
        this.id = id; this.homeX = homeX; this.homeY = homeY;
        this.s = GState.Walk;
        this.t = 0;                          // Trapped: seconds left; Dead: seconds to respawn
        this.wait = 0;                       // idle after a blocked decision
        this.carry = false;
        this.carryFrom = -1;                 // the tile the carried gold came from
        this.carryT = 0;                     // seconds until it lets the gold go
        this.trappedFor = 0;                 // the full trap time (for the struggle picture)
        this.hesitated = false;              // has already stopped to look about before this patrol step
    }
}

const Phase = Object.freeze({ Idle: 0, Ready: 1, Play: 2, Caught: 3, Escape: 4, Card: 5, Over: 6 });

const TickDt = f32(1 / 120);
const TickThreshold = f32(TickDt - f32(0.000001));

// base + (float)rng.nextDouble() * span, all f32-rounded like the C# `base + (float)rng.NextDouble() * span`
function frand(rng, base, span) { return f32(f32(base) + f32(f32(rng.nextDouble()) * f32(span))); }

function startMove(a, dir, falling) {
    a.tx = a.x + Dir4.dx(dir); a.ty = a.y + Dir4.dy(dir);
    a.p = 0; a.moving = true; a.moveDir = dir; a.falling = falling;
    if (dir === Dir4.Left) a.face = -1; else if (dir === Dir4.Right) a.face = 1;
}

function advance(a, speed, h) {
    const d = f32(speed * h);
    a.p = f32(a.p + d);
    a.anim = f32(a.anim + d);
    if (a.p < 1) return false;
    a.x = a.tx; a.y = a.ty; a.p = 0; a.moving = false;
    return true;
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

export class VaultDiggerSim {
    static get Phase() { return Phase; }
    static get GState() { return GState; }

    constructor() {
        // ------------------------------------------------------------------ the machine's timing
        this.tickDt = TickDt;
        this.readySeconds = f32(2.2); this.readyAgainSeconds = f32(1.6); this.caughtSeconds = f32(2.0);
        this.escapeSeconds = f32(1.6); this.cardSeconds = f32(3.0);
        this.fallSpeed = f32(7.5);           // tiles/s
        this.digSeconds = f32(0.22);         // the runner stands still while the brick breaks
        this.digBuffer = f32(0.3);           // an A press waits this long for a tile centre
        this.respawnSeconds = f32(1.6);
        this.goldPoints = 250; this.trapPoints = 75;
        this.startLives = 3;

        // ------------------------------------------------------------------ read-only state
        this.map = new VaultMap();
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.runner = new Actor();
        this.guards = [];
        this.popups = [];
        this.digging = false;
        this.digT = 0;
        this.digX = 0; this.digY = 0;
        this.livesLeft = 0;
        this.credit = null;
        this.goldTaken = 0;
        this.runSpeed = 0;                   // tiles/s
        this.guardSpeed = 0;                 // tiles/s
        this.guardPathing = 0;
        this.holeTime = 0;
        this.hesitateSeconds = 0;            // a guard that is not hunting stops about this long first
        this.trapTime = 0;
        this.lastDeathX = 0; this.lastDeathY = 0;
        this.deathByHole = false;

        this._cues = new CueBuffer();
        this.rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0;
        this._time = 0; this._acc = 0; this._digReq = 0; this._guardGreed = 0;
        this._heldDir = Dir4.None; this._digSide = 0;
        this._cand = [];

        // stats
        this._digs = 0; this._traps = 0; this._buried = 0; this._deaths = 0; this._pickups = 0; this._drops = 0;
    }

    get mercyActive() { return this.credit.unlosable; }
    get goldLeft() { let n = this.map.goldOnMap; for (const g of this.guards) if (g.carry) n++; return n; }
    get roundWon() { return this._result === RoundResult.Won; }
    get escapeY() { return this.p === Phase.Escape ? -Math.min(f32(1.6), f32(this.phaseTime * f32(1.2))) : 0; }   // the climb out, tiles

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Caught: case Phase.Escape: return CabinetState.Interlude;
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
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's gold ' + this.goldTaken + '/' + this.map.goldTotal +
               ' deaths ' + this._deaths + ' digs ' + this._digs + ' traps ' + this._traps + ' buried ' + this._buried;
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.runSpeed = k.get('runSpeed');
        this.guardSpeed = f32(this.runSpeed * k.get('guardSpeed'));
        this.guardPathing = k.get('guardPathing');
        this.hesitateSeconds = k.get('guardHesitate');
        this.holeTime = k.get('holeTime');
        this.trapTime = f32(this.holeTime * k.get('trapShare'));        // the hole holds its guard for a share of its own life
        this._guardGreed = credit.unlosable ? 0 : k.get('guardGreed');
        const nGuards = Math.trunc(k.get('guards'));

        this.map = new VaultMap();
        const bad = this.map.unreachable();
        if (bad.length > 0) throw new Error('VAULT DIGGER: unfair vault, tile ' + bad[0] + ' cannot be reached and left');
        this.guards.length = 0;
        for (let i = 0; i < nGuards && i < this.map.guardStarts.length; i++) {
            const s = this.map.guardStarts[i];
            this.guards.push(new Guard(i, s % VaultMap.W, Math.trunc(s / VaultMap.W)));
        }

        this.livesLeft = this.startLives;
        this._score = 0; this._time = 0; this._acc = 0; this.goldTaken = 0;
        this._digs = this._traps = this._buried = this._deaths = this._pickups = this._drops = 0;
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this._resetActors();
        this._go(Phase.Ready);
        this._cues.emit(SoundCue.Tick);
    }

    _go(p) { this.p = p; this.phaseTime = 0; }

    _resetActors() {
        this.runner.place(this.map.startX, this.map.startY);
        this.runner.face = 1; this.runner.anim = 0;
        this.digging = false; this._digReq = 0;
        for (const g of this.guards) {
            if (g.carry) this._returnGold(g);
            g.place(g.homeX, g.homeY);
            g.s = GState.Walk; g.t = 0; g.wait = f32(f32(0.4) + f32(f32(0.25) * g.id)); g.face = g.homeX > this.map.startX ? -1 : 1;
        }
        for (let i = 0; i < this.map.holeT.length; i++) this.map.holeT[i] = 0;
        this.popups.length = 0;
    }

    // ------------------------------------------------------------------ stepping
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt <= 0) return;
        if (dt > f32(0.1)) dt = f32(0.1);
        this._time = f32(this._time + dt);
        this._heldDir = input != null ? input.heldDir4() : Dir4.None;
        if (input != null && input.pressed(Pad.A) && (this.p === Phase.Play || this.p === Phase.Ready)) {
            // A + the stick AIMS the dig (left/right) and does not steer on that press
            this._digReq = this.digBuffer;
            this._digSide = this._heldDir === Dir4.Left ? -1 : this._heldDir === Dir4.Right ? 1 : 0;
            if (this._heldDir === Dir4.Left || this._heldDir === Dir4.Right) this._heldDir = Dir4.None;
        }
        this._acc = f32(this._acc + dt);
        while (this._acc >= TickThreshold) {
            this._acc = f32(this._acc - TickDt);
            this._tick(TickDt);
            if (this.p === Phase.Over) { this._acc = 0; break; }
        }
    }

    _tick(h) {
        this.phaseTime = f32(this.phaseTime + h);
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const pu = this.popups[i];
            pu.t = f32(pu.t + h);
            if (pu.t > 1.0) this.popups.splice(i, 1);
        }
        switch (this.p) {
            case Phase.Ready:
                if (this.phaseTime >= (this.livesLeft === this.startLives && this._deaths === 0 ? this.readySeconds : this.readyAgainSeconds)) {
                    this._go(Phase.Play);
                    this._cues.emit(SoundCue.Start);
                }
                break;
            case Phase.Play:
                this._playTick(h);
                break;
            case Phase.Caught:
                if (this.phaseTime >= this.caughtSeconds) {
                    this.livesLeft--;
                    if (this.livesLeft <= 0) { this._result = RoundResult.Lost; this._go(Phase.Card); }
                    else { this._resetActors(); this._go(Phase.Ready); this._cues.emit(SoundCue.Tick); }
                }
                break;
            case Phase.Escape:
                this.map.exitT = f32(this.map.exitT + h);
                if (this.phaseTime >= this.escapeSeconds) {
                    this._result = RoundResult.Won;
                    this._go(Phase.Card);
                    this._cues.emit(SoundCue.Win);
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this._go(Phase.Over);
                break;
        }
    }

    _playTick(h) {
        if (this._digReq > 0) this._digReq = f32(this._digReq - h);
        if (this.map.exitOpen) this.map.exitT = f32(this.map.exitT + h);

        // holes: count down, refill
        for (let i = 0; i < this.map.holeT.length; i++) {
            if (this.map.holeT[i] <= 0) continue;
            this.map.holeT[i] = this.map.holeT[i] - h;      // Float32Array store auto-rounds to float
            if (this.map.holeT[i] <= 0) { this._refill(i % VaultMap.W, Math.trunc(i / VaultMap.W)); if (this.p !== Phase.Play) return; }
        }

        this._runnerTick(h);
        if (this.p !== Phase.Play) return;
        for (const g of this.guards) this._guardTick(g, h);

        // gold under the runner
        const rx = this.runner.lx, ry = this.runner.ly;
        if (VaultMap.inB(rx, ry) && this.map.gold[VaultMap.idx(rx, ry)] > 0) {
            const n = this.map.gold[VaultMap.idx(rx, ry)];
            this.map.gold[VaultMap.idx(rx, ry)] = 0;
            this.goldTaken += n;
            this._score += this.goldPoints * n;
            this._cues.emit(SoundCue.Bonus);
            this._addPopup(rx, ry, this.goldPoints * n);
        }
        if (!this.map.exitOpen && this.goldLeft === 0) {
            this.map.exitOpen = true; this.map.exitT = 0;
            this._cues.emit(SoundCue.Bonus);
        }

        // a free guard touching the runner
        if (!this.credit.unlosable)
            for (const g of this.guards) {
                if (g.s !== GState.Walk && g.s !== GState.Climb) continue;
                if (g.falling && this.map.openHole(g.tx, g.ty)) continue;       // dropping into a hole: harmless
                if (Math.abs(f32(g.fx - this.runner.fx)) < f32(0.7) && Math.abs(f32(g.fy - this.runner.fy)) < f32(0.7)) { this._die(false); return; }
            }
    }

    _addPopup(x, y, v) { this.popups.push({ x, y, t: 0, value: v }); }

    // ------------------------------------------------------------------ the runner
    _runnerTick(h) {
        const r = this.runner;
        if (this.digging) {
            this.digT = f32(this.digT - h);
            if (this.digT <= 0) {
                this.digging = false;
                const i = VaultMap.idx(this.digX, this.digY);
                this.map.holeT[i] = this.holeTime; this.map.holeSpan[i] = this.holeTime;
                // a guard crossing the tile above as it opens drops straight in
                for (const g of this.guards)
                    if (g.s === GState.Walk && !g.falling && g.lx === this.digX && g.ly === this.digY - 1 && g.fy === this.digY - 1) {
                        g.place(this.digX, this.digY - 1);
                        startMove(g, Dir4.Down, true);
                    }
            }
            return;
        }
        if (r.moving) {
            // reverse mid-tile (not while falling)
            if (!r.falling && r.moveDir >= 0 && this._heldDir === Dir4.reverse(r.moveDir)) this._reverse(r);
            advance(r, r.falling ? this.fallSpeed : this.runSpeed, h);
        }
        if (!r.moving) this._runnerDecide();
    }

    _reverse(a) {
        const x = a.x, y = a.y;
        a.x = a.tx; a.y = a.ty; a.tx = x; a.ty = y;
        a.p = f32(1 - a.p);
        a.moveDir = Dir4.reverse(a.moveDir);
        if (a.moveDir === Dir4.Left) a.face = -1; else if (a.moveDir === Dir4.Right) a.face = 1;
    }

    _runnerSupported(x, y) { return this.map.supported(x, y, false) || this._trappedAt(x, y + 1) != null; }

    _runnerDecide() {
        const r = this.runner;
        if (!this._runnerSupported(r.x, r.y)) { startMove(r, Dir4.Down, true); return; }
        r.falling = false;
        if (this._digReq > 0 && this._tryDig()) return;
        const d = this._heldDir;
        if (d === Dir4.Up) {
            if (!this.map.ladder(r.x, r.y)) return;
            if (r.y === 0) { if (this.map.exitOpen && r.x === this.map.exitX) this._beginEscape(); return; }
            if (!this.map.solid(r.x, r.y - 1)) startMove(r, Dir4.Up, false);
        } else if (d === Dir4.Down) {
            if (r.y + 1 < VaultMap.H && !this.map.solid(r.x, r.y + 1) && this._trappedAt(r.x, r.y + 1) == null)
                startMove(r, Dir4.Down, !this.map.ladder(r.x, r.y) && !this.map.ladder(r.x, r.y + 1));
        } else if (d === Dir4.Left || d === Dir4.Right) {
            const dx = Dir4.dx(d);
            r.face = dx;
            if (!this.map.solid(r.x + dx, r.y) && this._trappedAt(r.x + dx, r.y) == null) startMove(r, d, false);
        }
    }

    // the brick diagonally ahead-below, on the side held (or faced)
    _tryDig() {
        const r = this.runner;
        const f = this._digSide !== 0 ? this._digSide : r.face;
        if (this.map.ladder(r.x, r.y) || this.map.bar(r.x, r.y)) return false;
        const dx = r.x + f, dy = r.y + 1;
        if (!this.map.brick(dx, dy) || this.map.openHole(dx, dy)) return false;
        if (!this.map.clear(dx, r.y)) return false;
        if (this._guardNear(dx, r.y) || this._guardNear(dx, dy)) return false;
        r.face = f;
        this.digging = true; this.digT = this.digSeconds; this.digX = dx; this.digY = dy;
        this._digReq = 0; this._digs++;
        this._cues.emit(SoundCue.Tick);
        return true;
    }

    canDig(side) {
        const r = this.runner;
        if (this.p !== Phase.Play || this.digging || r.moving || r.falling) return false;
        if (!this._runnerSupported(r.x, r.y) || this.map.ladder(r.x, r.y) || this.map.bar(r.x, r.y)) return false;
        const dx = r.x + side, dy = r.y + 1;
        return this.map.brick(dx, dy) && !this.map.openHole(dx, dy) && this.map.clear(dx, r.y) && !this._guardNear(dx, r.y) && !this._guardNear(dx, dy);
    }

    // a guard standing on (nearest to) the tile: no digging under it
    _guardNear(x, y) {
        for (const g of this.guards) {
            if (g.s === GState.Dead) continue;
            if (g.lx === x && g.ly === y) return true;
        }
        return false;
    }

    _beginEscape() {
        this._go(Phase.Escape);
        this.runner.moving = false;
        this._cues.emit(SoundCue.Bonus);
    }

    _die(byHole) {
        if (this.credit.unlosable) return;
        this._deaths++;
        this.deathByHole = byHole;
        this.lastDeathX = this.runner.lx; this.lastDeathY = this.runner.ly;
        this.digging = false;
        this._go(Phase.Caught);
        this._cues.emit(SoundCue.Die);
    }

    // ------------------------------------------------------------------ holes
    _refill(x, y) {
        const i = VaultMap.idx(x, y);
        // the runner: in it = buried; on the way into it but not yet half in = stopped on the new brick
        const r = this.runner;
        if (r.moving && r.tx === x && r.ty === y && r.p < f32(0.5)) r.place(r.x, r.y);
        const inside = r.lx === x && r.ly === y;        // half out already counts as out
        if (inside) {
            if (this.credit.unlosable) {
                // the mercy credit: the vault lifts him out (or holds the hole open)
                if (y > 0 && !this.map.solid(x, y - 1) && !this._guardNear(x, y - 1)) r.place(x, y - 1);
                else { this.map.holeT[i] = f32(0.25); return; }
            } else {
                this.map.holeT[i] = 0;
                this._die(true);
                return;
            }
        }
        this.map.holeT[i] = 0;
        for (const g of this.guards) {
            if (g.s === GState.Dead) continue;
            if (g.moving && g.tx === x && g.ty === y && g.p < f32(0.5)) { g.place(g.x, g.y); if (g.s === GState.Climb) g.s = GState.Walk; continue; }
            if (g.lx === x && g.ly === y) {
                if (g.carry) this._returnGold(g);
                g.s = GState.Dead; g.t = this.respawnSeconds; g.moving = false; g.falling = false;
                this._buried++;
                this._score += this.trapPoints;
                this._addPopup(x, y, this.trapPoints);
                this._cues.emit(SoundCue.Hit);
            }
        }
    }

    // ------------------------------------------------------------------ guards
    trappedGuardAt(x, y) { return this._trappedAt(x, y) != null; }

    _trappedAt(x, y) {
        for (const g of this.guards) if (g.s === GState.Trapped && g.x === x && g.y === y) return g;
        return null;
    }

    _occupied(x, y, except) {
        for (const g of this.guards) {
            if (g === except || g.s === GState.Dead) continue;
            if ((g.x === x && g.y === y) || (g.moving && g.tx === x && g.ty === y)) return true;
        }
        return false;
    }

    _guardSupported(g, x, y) { return this.map.supported(x, y, false) || this._trappedAt(x, y + 1) != null; }

    _guardTick(g, h) {
        if (g.carry && g.s === GState.Walk) g.carryT = f32(g.carryT - h);
        switch (g.s) {
            case GState.Dead:
                g.t = f32(g.t - h);
                if (g.t <= 0) this._respawn(g);
                return;
            case GState.Trapped:
                g.t = f32(g.t - h);
                if (g.t <= 0) {
                    if (g.y > 0 && !this.map.solid(g.x, g.y - 1) && !this._occupied(g.x, g.y - 1, g)) {
                        g.s = GState.Climb;
                        startMove(g, Dir4.Up, false);
                    } else g.t = f32(0.2);
                }
                return;
            case GState.Climb:
                if (advance(g, this.guardSpeed, h)) {
                    // out: step off sideways at once, toward the runner if it can
                    g.s = GState.Walk;
                    const want = this.runner.x < g.x ? -1 : 1;
                    let side = 0;
                    if (this._canStep(g, want)) side = want; else if (this._canStep(g, -want)) side = -want;
                    if (side !== 0) startMove(g, side < 0 ? Dir4.Left : Dir4.Right, false);
                    else g.wait = 0;
                }
                return;
            default:
                if (g.moving && advance(g, g.falling ? this.fallSpeed : this.guardSpeed, h)) this._guardArrive(g);
                if (!g.moving && g.s === GState.Walk) {
                    if (g.wait > 0) { g.wait = f32(g.wait - h); if (g.wait > 0) return; }
                    this._guardDecide(g);
                }
                return;
        }
    }

    _canStep(g, dx) {
        const nx = g.x + dx;
        return !this.map.solid(nx, g.y) && !this._occupied(nx, g.y, g) && this._trappedAt(nx, g.y) == null;
    }

    _guardArrive(g) {
        // into an open hole: trapped
        if (this.map.openHole(g.x, g.y)) {
            g.s = GState.Trapped; g.t = this.trapTime; g.trappedFor = this.trapTime;
            g.moving = false; g.falling = false;
            if (g.carry) {
                if (g.y > 0 && this.map.clear(g.x, g.y - 1)) { this.map.gold[VaultMap.idx(g.x, g.y - 1)]++; g.carry = false; this._drops++; }
                else this._returnGold(g);
            }
            this._traps++;
            this._score += this.trapPoints;
            this._addPopup(g.x, g.y - 1, this.trapPoints);
            this._cues.emit(SoundCue.Hit);
            return;
        }
        const i = VaultMap.idx(g.x, g.y);
        if (!g.carry && this.map.gold[i] > 0 && this._guardGreed > 0 && this.rng.nextDouble() < this._guardGreed) {
            this.map.gold[i]--; g.carry = true; g.carryFrom = i; g.carryT = frand(this.rng, 3, 5); this._pickups++;
        } else if (g.carry && g.carryT <= 0 && this.map.gold[i] === 0 && this.map.clear(g.x, g.y) && this.map.solid(g.x, g.y + 1)) {
            this.map.gold[i]++; g.carry = false; this._drops++;
        }
    }

    _returnGold(g) {
        if (!g.carry) return;
        const at = g.carryFrom >= 0 ? g.carryFrom : VaultMap.idx(this.map.startX, this.map.startY);
        this.map.gold[at]++;
        g.carry = false;
    }

    _respawn(g) {
        // back in from the top of the vault, away from the runner
        let best = -1, bestScore = -1;
        for (let k = 0; k < 8; k++) {
            const x = this.rng.next(VaultMap.W);
            if (!this.map.clear(x, 0) || x === this.map.exitX || this._occupied(x, 0, g)) continue;
            const s = f32(Math.abs(x - this.runner.x) + f32(this.rng.nextDouble()));
            if (s > bestScore) { bestScore = s; best = x; }
        }
        if (best < 0) { g.t = f32(0.3); return; }
        g.place(best, 0);
        g.s = GState.Walk; g.wait = f32(0.3);
        g.face = this.runner.x < best ? -1 : 1;
    }

    _guardDecide(g) {
        if (!this._guardSupported(g, g.x, g.y)) { startMove(g, Dir4.Down, true); return; }
        g.falling = false;
        this._cand.length = 0;
        for (let d = 0; d < 4; d++) {
            const nx = g.x + Dir4.dx(d), ny = g.y + Dir4.dy(d);
            if (ny < 0) continue;
            if (d === Dir4.Up && !this.map.ladder(g.x, g.y)) continue;
            if (this.map.solid(nx, ny) || this._trappedAt(nx, ny) != null || this._occupied(nx, ny, g)) continue;
            this._cand.push(d);
        }
        if (this._cand.length === 0) { g.wait = f32(0.15); return; }
        let pick;
        if (this.credit.unlosable || this.rng.nextDouble() >= this.guardPathing) {
            // not hunting this step: it stops to look about, then patrols on
            if (!g.hesitated) {
                g.hesitated = true;
                g.wait = f32(this.hesitateSeconds * f32(f32(0.6) + f32(f32(0.8) * f32(this.rng.nextDouble()))));
                return;
            }
            pick = this._wander(g);
        } else pick = this._hunt(g);
        g.hesitated = false;
        if (pick < 0 || !this._cand.includes(pick)) pick = this._cand[this.rng.next(this._cand.length)];
        startMove(g, pick, pick === Dir4.Down && !this.map.ladder(g.x, g.y) && !this.map.ladder(g.x, g.y + 1));
    }

    // THE HUNT (simple pathing, the 1983 way): on the runner's row with a clear run, go for it;
    // otherwise change level toward the runner's row where you stand, or walk to the nearest ladder /
    // drop on this row that does (the one nearest the runner's column wins ties); failing all that,
    // close the column. Guards read the vault with every hole still brick.
    _hunt(g) {
        let rx = this.runner.lx, ry = this.runner.ly;
        if (this.map.solidStatic(rx, ry) && ry > 0) ry--;             // the runner in a hole: the tile above it
        const gx = g.x, gy = g.y;
        const toward = rx < gx ? Dir4.Left : rx > gx ? Dir4.Right : -1;
        if (ry === gy && toward >= 0 && this._rowClear(gx, rx, gy)) return toward;
        if (ry < gy && this._cand.includes(Dir4.Up)) return Dir4.Up;
        if (ry > gy && this._cand.includes(Dir4.Down)) return Dir4.Down;
        if (ry !== gy) {
            let best = 0, bestScore = Number.MAX_VALUE;
            for (let dir = -1; dir <= 1; dir += 2) {
                for (let x = gx + dir; x >= 0 && x < VaultMap.W; x += dir) {
                    if (this.map.solidStatic(x, gy)) break;
                    const standable = this.map.supported(x, gy, true);
                    const up = this.map.ladder(x, gy) && gy > 0 && !this.map.solidStatic(x, gy - 1);
                    const down = !standable || (gy + 1 < VaultMap.H && !this.map.solidStatic(x, gy + 1));
                    if ((ry < gy && up) || (ry > gy && down)) {
                        const sc = f32(Math.abs(x - gx) + f32(f32(0.5) * Math.abs(x - rx)));
                        if (sc < bestScore) { bestScore = sc; best = dir; }
                        break;
                    }
                    if (!standable) break;                          // a drop the wrong way: the scan ends
                }
            }
            if (best < 0 && this._cand.includes(Dir4.Left)) return Dir4.Left;
            if (best > 0 && this._cand.includes(Dir4.Right)) return Dir4.Right;
        }
        if (toward >= 0 && this._cand.includes(toward)) return toward;
        return this._wander(g);
    }

    // a straight run along row y from a to b with no wall and floor all the way (holes unseen)
    _rowClear(a, b, y) {
        const d = b > a ? 1 : -1;
        for (let x = a + d; x !== b + d; x += d) {
            if (this.map.solidStatic(x, y)) return false;
            if (!this.map.supported(x, y, true)) return false;
        }
        return true;
    }

    // a patrol: keep going, turn at random at a wall or a junction now and then
    _wander(g) {
        const keep = g.moveDir;
        if (keep >= 0 && this._cand.includes(keep) && this.rng.nextDouble() < 0.8) return keep;
        if (this._cand.length > 1 && keep >= 0) {
            const back = Dir4.reverse(keep);
            let k;
            do { k = this._cand[this.rng.next(this._cand.length)]; } while (k === back);
            return k;
        }
        return this._cand[this.rng.next(this._cand.length)];
    }

    collectStats(into) {
        add(into, 'deaths', this._deaths);
        add(into, 'digs', this._digs);
        add(into, 'traps', this._traps);
        add(into, 'buried', this._buried);
        add(into, 'gold', this.goldTaken);
        add(into, 'pickups', this._pickups);
        add(into, 'escaped', this._result === RoundResult.Won ? 1 : 0);
    }
}
VaultDiggerSim.GoldPoints = 250;
VaultDiggerSim.TrapPoints = 75;
