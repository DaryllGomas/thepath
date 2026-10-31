// THE NODE · world 1 · VAULT DIGGER (Castle Coin, 1983) on the Cabinet Engine · THE SIM (ICabinetSim).
// Grew out of the port of VaultDiggerSim.cs / VaultMap.cs (Staging/Batch2/vaultdigger), which was bit-exact
// with the C# reference. The build-out (2026-10-18) made it a whole heist, so that parity is retired.
//
// A vault-digging runner. The runner walks, climbs ladders, hangs from bars hand over hand and falls;
// button A digs the brick diagonally ahead-below on the side he faces, or the side the stick is held when
// A goes down (that press aims, it does not steer); B digs the brick behind him. A dug hole stays open
// holeTime seconds, then refills: a guard inside is buried (and comes back from the top, after a flashing
// warning), the runner inside dies. A guard that falls into an open hole is TRAPPED for trapTime seconds,
// drops any gold it carries on the tile above, then climbs out and steps off sideways. Guards pick gold up
// as they walk. Touch a free guard and it costs a runner. Take every piece of gold (and the crown) and the
// EXIT ladder rises out of the top of the vault: climb it off the screen and the vault is cleared.
//
// THE HEIST (a coin): five vaults (vaults.js), each with one new idea: the payroll sacks (trap the sack man
// and he drops it), cracked brick that gives way, stone that will not dig and gold sealed under brick (dig
// down to it), and BANK OF THE CROWN: the strongroom (its bars open with the key), the WARDEN (he walks over
// holes) and the crown, which rings the alarm (every guard hunts, faster). Clearing the fifth vault WINS;
// the last runner caught LOSES. (Conveyor belts are in the sim too; no vault uses them yet.)
//   VAULT card (Intro: number, name, hint) -> PLAY -> [CAUGHT (Interlude) -> READY (Intro) -> PLAY ...]
//   -> ESCAPE (Interlude, the climb out) -> TALLY (Interlude: the vault, the bonus clock, no miss) -> the
//   next VAULT card, or the result CARD -> OVER. Every move runs tile centre to tile centre on a fixed
//   120 Hz tick (dt-independent). The runner can reverse mid-tile; guards decide only at tile centres.
// SCORE: gold 250, a guard trapped 75 (buried by the refill: 75 more), the key 500, the crown 2500; the
// tally: 500 x the vault, the bonus clock that is left, 1000 for a vault with no runner lost. An extra
// runner at 6000 and every 12000 after.
//
// BELTS carry whatever stands still on them (beltSpeed); walking with one is quicker, against it slower.
// CRACKED brick looks like brick and is air: whatever steps on it drops through (it crumbles). STONE
// (and belts, and the bars) will not dig. THE WARDEN reads every hole as floor and walks across it.
//
// GUARDS hunt with simple pathing (Hunt): the runner's row first, then the column. guardPathing (plus the
// vault's hunt) is the chance a decision hunts at all; the rest are patrol steps (Wander), each after a
// short look about (hesitateSeconds), so a guard with worse pathing is also a slower one.
//
// MERCY: knobs ease the guards' pathing and hold dug holes open longer, each lost coin. On the unlosable
// credit the guards WANDER instead of hunting, never pick up gold, the alarm does not wake them, a runner
// who touches a guard with gold takes it off him, and the runner cannot die: a touch does nothing and a
// refilling hole lifts him out.
//
// The sim says more than the eight cues: with recordEvents on it pushes { kind, ... } onto events (the
// floor's sound reads them, sound.js). Determinism: the gameplay dice are a seeded System.Random; the
// sparks and debris have their own little LCG so they never move the game.
import {
    f32, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4, SystemRandom,
} from '../../sdk/index.js';
import { VAULTS } from './vaults.js';

const MW = 18, MH = 12;

export const Tile = Object.freeze({ Empty: 0, Brick: 1, Rock: 2, Ladder: 3, Bar: 4, Exit: 5, Crack: 6, BeltL: 7, BeltR: 8, Door: 9 });

export class VaultMap {
    constructor(def = VAULTS[0]) {
        this.tiles = new Uint8Array(MW * MH);
        this.gold = new Uint8Array(MW * MH);         // gold pieces on the tile (a dropped piece can land on another)
        this.goldOrigin = new Uint8Array(MW * MH);
        this.holeT = new Float32Array(MW * MH);       // > 0: open, seconds until it refills
        this.holeSpan = new Float32Array(MW * MH);    // the hole's full open time (for the refill picture)
        this.crackSeen = new Uint8Array(MW * MH);     // something has dropped through this crack (it shows open)
        this.exitOpen = false;
        this.exitT = 0;                                // seconds since the exit ladder appeared
        this.doorOpen = false; this.doorT = 0;         // the strongroom bars, and seconds since the key opened them
        this.keyAt = -1; this.keyTaken = false;
        this.crownAt = -1; this.crownTaken = false;
        this.startX = 0; this.startY = 0; this.exitX = -1;
        this.guardStarts = [];                         // { i: tile index, kind: 'G' | 'C' | 'W' }
        this.goldTotal = 0;
        this.def = def;
        this.load(def.map);
    }

    static idx(x, y) { return y * MW + x; }
    static inB(x, y) { return x >= 0 && y >= 0 && x < MW && y < MH; }

    load(rows) {
        this.guardStarts.length = 0;
        this.goldTotal = 0; this.exitOpen = false; this.exitT = 0; this.exitX = -1;
        this.doorOpen = false; this.doorT = 0; this.keyAt = -1; this.keyTaken = false; this.crownAt = -1; this.crownTaken = false;
        for (let y = 0; y < MH; y++)
            for (let x = 0; x < MW; x++) {
                const c = x < rows[y].length ? rows[y][x] : '.';
                const i = VaultMap.idx(x, y);
                let t = Tile.Empty;
                this.gold[i] = 0; this.holeT[i] = 0; this.holeSpan[i] = 0; this.crackSeen[i] = 0;
                switch (c) {
                    case '#': t = Tile.Brick; break;
                    case '=': t = Tile.Rock; break;
                    case 'H': t = Tile.Ladder; break;
                    case '-': t = Tile.Bar; break;
                    case 'X': t = Tile.Crack; break;
                    case '<': t = Tile.BeltL; break;
                    case '>': t = Tile.BeltR; break;
                    case 'D': t = Tile.Door; break;
                    case 'S': t = Tile.Exit; if (this.exitX < 0) this.exitX = x; break;
                    case '$': this.gold[i] = 1; this.goldTotal++; break;
                    case 'K': this.keyAt = i; break;
                    case 'Q': this.crownAt = i; break;
                    case 'P': this.startX = x; this.startY = y; break;
                    case 'G': case 'C': case 'W': this.guardStarts.push({ i, kind: c }); if (c === 'C') this.goldTotal++; break;
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

    // solid = walls you stand on and cannot enter: stone, belts, shut bars, and brick that is not dug open
    solid(x, y) {
        if (y < 0) return false;
        if (!VaultMap.inB(x, y)) return true;
        const i = VaultMap.idx(x, y);
        const t = this.tiles[i];
        if (t === Tile.Brick) return this.holeT[i] <= 0;
        if (t === Tile.Door) return !this.doorOpen;
        return t === Tile.Rock || t === Tile.BeltL || t === Tile.BeltR;
    }

    // a map where every dug hole is still brick (the guards' idea of the vault)
    solidStatic(x, y) {
        if (y < 0) return false;
        if (!VaultMap.inB(x, y)) return true;
        const t = this.tiles[VaultMap.idx(x, y)];
        if (t === Tile.Door) return !this.doorOpen;
        return t === Tile.Rock || t === Tile.Brick || t === Tile.BeltL || t === Tile.BeltR;
    }

    solidWith(x, y, staticHoles) { return staticHoles ? this.solidStatic(x, y) : this.solid(x, y); }

    ladder(x, y) {
        const t = this.at(x, y);
        return t === Tile.Ladder || (t === Tile.Exit && this.exitOpen);
    }

    bar(x, y) { return this.at(x, y) === Tile.Bar; }
    brick(x, y) { return VaultMap.inB(x, y) && this.tiles[VaultMap.idx(x, y)] === Tile.Brick; }
    crack(x, y) { return VaultMap.inB(x, y) && this.tiles[VaultMap.idx(x, y)] === Tile.Crack; }
    openHole(x, y) { return this.brick(x, y) && this.holeT[VaultMap.idx(x, y)] > 0; }
    hasGold(x, y) { return VaultMap.inB(x, y) && this.gold[VaultMap.idx(x, y)] > 0; }
    // the belt's way under a tile: -1 left, +1 right, 0 no belt
    belt(x, y) { const t = this.at(x, y); return t === Tile.BeltL ? -1 : t === Tile.BeltR ? 1 : 0; }
    // what a dig rings off: stone, or a belt
    undiggable(x, y) { const t = this.at(x, y); return VaultMap.inB(x, y) && (t === Tile.Rock || t === Tile.BeltL || t === Tile.BeltR); }

    // empty air as far as digging is concerned: no ladder, bar or wall in the way
    clear(x, y) {
        const t = this.at(x, y);
        return y >= 0 && VaultMap.inB(x, y) && (t === Tile.Empty || (t === Tile.Exit && !this.exitOpen) || (t === Tile.Door && this.doorOpen));
    }

    get goldOnMap() { let n = 0; for (let i = 0; i < this.gold.length; i++) n += this.gold[i]; return n; }

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

    // a dig that drops you through the floor: standing at (x, y), the brick at (x + s, y + 1) with air under it
    digThrough(x, y, s) {
        if (this.ladder(x, y) || this.bar(x, y) || !this.supported(x, y, false)) return false;
        const dx = x + s;
        return this.brick(dx, y + 1) && !this.openHole(dx, y + 1) && this.clear(dx, y) && y + 2 < MH && !this.solid(dx, y + 2);
    }

    // ------------------------------------------------------------------ the fairness proof
    // With the exit and the strongroom open: every piece of gold, the key and the crown can be reached from
    // the start (the key with the bars still shut), and every tile the runner can get into can still reach the
    // top of the exit. Moves and digs down through brick count. Returns the bad tile indices (empty = fair).
    static proof(def) {
        if (VaultMap._proven.has(def)) return VaultMap._proven.get(def);
        const m = new VaultMap(def);
        const bad = [];
        const start = VaultMap.idx(m.startX, m.startY);
        if (m.keyAt >= 0 && !m._flood(start)[m.keyAt]) bad.push(m.keyAt);
        m.exitOpen = true; m.doorOpen = true;
        const seen = m._flood(start);
        const exitTop = m.exitX >= 0 ? VaultMap.idx(m.exitX, 0) : -1;
        if (exitTop < 0) bad.push(-1);
        for (let i = 0; i < MW * MH; i++) {
            const need = m.goldOrigin[i] > 0 || i === m.crownAt || i === m.keyAt;
            if (need && !seen[i]) bad.push(i);
            if (seen[i] && exitTop >= 0 && !m._flood(i)[exitTop]) bad.push(i);
        }
        for (const g of m.guardStarts) if (g.kind === 'C' && !seen[g.i]) bad.push(g.i);
        VaultMap._proven.set(def, bad);
        return bad;
    }

    _flood(from) {
        const seen = new Uint8Array(MW * MH);
        const q = [from]; seen[from] = 1;
        let qi = 0;
        const nb = [];
        while (qi < q.length) {
            const i = q[qi++];
            const x = i % MW, y = Math.trunc(i / MW);
            this.moves(x, y, false, nb);
            for (let s = -1; s <= 1; s += 2) if (this.digThrough(x, y, s)) nb.push(VaultMap.idx(x + s, y + 1));
            for (const j of nb) if (!seen[j]) { seen[j] = 1; q.push(j); }
        }
        return seen;
    }
}
VaultMap.W = MW; VaultMap.H = MH;
VaultMap._proven = new Map();

// ------------------------------------------------------------------ actors
class Actor {
    constructor() {
        this.x = 0; this.y = 0;             // the tile we are at (or leaving)
        this.tx = 0; this.ty = 0;           // the tile we are moving to (== x,y when still)
        this.p = 0;                          // 0..1 of the way from x,y to tx,ty
        this.moving = false; this.falling = false;
        this.carried = false;                // this move is a belt carrying us, not our own feet
        this.moveDir = -1;                   // Dir4 of the current move
        this.face = 1;                       // +1 right, -1 left
        this.anim = 0;                       // tiles travelled, for walk frames
    }
    get fx() { return f32(this.x + f32((this.tx - this.x) * this.p)); }
    get fy() { return f32(this.y + f32((this.ty - this.y) * this.p)); }
    get lx() { return this.p < f32(0.5) ? this.x : this.tx; }       // the nearest tile
    get ly() { return this.p < f32(0.5) ? this.y : this.ty; }

    place(x, y) { this.x = this.tx = x; this.y = this.ty = y; this.p = 0; this.moving = this.falling = this.carried = false; this.moveDir = -1; }
}

export const GState = Object.freeze({ Walk: 0, Trapped: 1, Climb: 2, Dead: 3 });

class Guard extends Actor {
    constructor(id, homeX, homeY, kind) {
        super();
        this.id = id; this.homeX = homeX; this.homeY = homeY;
        this.kind = kind;                    // 'G' a guard, 'C' the sack man, 'W' the warden
        this.warden = kind === 'W';          // reads holes as floor: never falls in
        this.sack = kind === 'C';            // the payroll: never lets go of it until trapped
        this.s = GState.Walk;
        this.t = 0;                          // Trapped: seconds left; Dead: seconds to respawn
        this.wait = 0;                       // idle after a blocked decision
        this.carry = kind === 'C';
        this.carryFrom = kind === 'C' ? VaultMap.idx(homeX, homeY) : -1;   // where carried gold goes back to
        this.carryT = 0;                     // seconds until it lets the gold go
        this.trappedFor = 0;                 // the full trap time (for the struggle picture)
        this.hesitated = false;              // has already stopped to look about before this patrol step
        this.spawnX = -1;                    // Dead: the column it will drop in at (the warning flashes there)
    }
}

const Phase = Object.freeze({ Idle: 0, Vault: 1, Ready: 2, Play: 3, Caught: 4, Escape: 5, Tally: 6, Card: 7, Over: 8 });

const TickDt = f32(1 / 120);
const TickThreshold = f32(TickDt - f32(0.000001));
const BeltWith = f32(1.45), BeltAgainst = f32(0.6);    // x walking pace on a belt, with it / against it
const WardenPace = f32(0.9), AlarmPace = f32(1.15);

// base + (float)rng.nextDouble() * span, all f32-rounded
function frand(rng, base, span) { return f32(f32(base) + f32(f32(rng.nextDouble()) * f32(span))); }

function startMove(a, dir, falling) {
    a.tx = a.x + Dir4.dx(dir); a.ty = a.y + Dir4.dy(dir);
    a.p = 0; a.moving = true; a.moveDir = dir; a.falling = falling; a.carried = false;
    if (dir === Dir4.Left) a.face = -1; else if (dir === Dir4.Right) a.face = 1;
}

function advance(a, speed, h) {
    const d = f32(speed * h);
    a.p = f32(a.p + d);
    if (!a.carried) a.anim = f32(a.anim + d);
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
        this.vaultCardSeconds = f32(3.0); this.readyAgainSeconds = f32(1.6); this.caughtSeconds = f32(2.0);
        this.escapeSeconds = f32(1.6); this.cardSeconds = f32(4.0);
        this.tallyLineSeconds = f32(0.7); this.tallyGapSeconds = f32(0.3); this.tallyHoldSeconds = f32(1.4);
        this.fallSpeed = f32(7.5);           // tiles/s
        this.beltSpeed = f32(2.2);           // tiles/s, standing still on a belt
        this.digSeconds = f32(0.22);         // the runner stands still while the brick breaks
        this.digBuffer = f32(0.3);           // an A press waits this long for a tile centre
        this.respawnSeconds = f32(1.6);
        this.warnSeconds = f32(0.7);         // the drop-in warning flashes this long before a guard comes back
        this.bonusStep = f32(0.3);           // the bonus clock loses 10 every this many seconds
        this.goldPoints = VaultDiggerSim.GoldPoints; this.trapPoints = VaultDiggerSim.TrapPoints;
        this.keyPoints = 500; this.crownPoints = 2500; this.vaultPoints = 500; this.cleanPoints = 1000;
        this.extraFirst = 6000; this.extraEvery = 12000; this.maxLives = 7;

        // ------------------------------------------------------------------ read-only state
        this.map = new VaultMap();
        this.vault = 0;                      // 0-based: VAULTS[vault]
        this.vaultCount = VAULTS.length;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.runner = new Actor();
        this.guards = [];
        this.popups = [];                    // { x, y (tiles), t, value | text, big }
        this.fx = [];                        // sparks and debris: { x, y (vault px), vx, vy, t, life, c (palette name), g (gravity) }
        this.digging = false;
        this.digT = 0;
        this.digX = 0; this.digY = 0;
        this.livesLeft = 0;
        this.startLives = 3;
        this.credit = null;
        this.goldTaken = 0;                  // over the whole heist
        this.vaultGold = 0;                  // this vault
        this.vaultDeaths = 0;
        this.bonus = 0;                      // the bonus clock
        this.alarm = false;                  // the crown is gone (BANK OF THE CROWN)
        this.shake = 0; this.flash = 0;      // seconds left of each
        this.extraT = 0;                     // seconds left of the EXTRA RUNNER banner
        this.tally = null;                   // { lines: [{ label, value, shown }], i, t, total }
        this.runSpeed = 0;                   // tiles/s
        this.guardSpeed = 0;                 // tiles/s
        this.guardPathing = 0;
        this.holeTime = 0;
        this.hesitateSeconds = 0;            // a guard that is not hunting stops about this long first
        this.trapTime = 0;
        this.lastDeathX = 0; this.lastDeathY = 0;
        this.deathByHole = false;
        this.recordEvents = false; this.events = [];
        this.isDemo = false;

        this._cues = new CueBuffer();
        this.rng = new SystemRandom(1);
        this._fxSeed = 1;
        this._result = RoundResult.None;
        this._score = 0;
        this._time = 0; this._acc = 0; this._digReq = 0; this._guardGreed = 0;
        this._heldDir = Dir4.None; this._digSide = 0;
        this._cand = [];
        this._k = null;
        this._nextExtra = 0;
        this._bonusT = 0;
        this._fallFrom = 0;
        this._log = '';

        // stats
        this._digs = 0; this._traps = 0; this._buried = 0; this._deaths = 0; this._pickups = 0; this._drops = 0;
        this._vaultsCleared = 0; this._extras = 0;
    }

    get mercyActive() { return this.credit.unlosable; }
    get goldLeft() { let n = this.map.goldOnMap; for (const g of this.guards) if (g.carry) n++; return n; }
    get itemsLeft() { return this.goldLeft + (this.map.crownAt >= 0 && !this.map.crownTaken ? 1 : 0); }
    get roundWon() { return this._result === RoundResult.Won; }
    get vaultDef() { return VAULTS[this.vault]; }
    get escapeY() { return this.p === Phase.Escape ? -Math.min(f32(1.6), f32(this.phaseTime * f32(1.2))) : 0; }   // the climb out, tiles
    get vaultsCleared() { return this._vaultsCleared; }
    get nextExtra() { return this._nextExtra; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Vault: case Phase.Ready: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Caught: case Phase.Escape: case Phase.Tally: return CabinetState.Interlude;
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
        return r + ' vaults ' + this._vaultsCleared + '/' + this.vaultCount + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's gold ' + this.goldTaken +
               ' deaths ' + this._deaths + ' extra ' + this._extras + ' digs ' + this._digs + ' traps ' + this._traps + ' buried ' + this._buried + ' | ' + this._log.trimEnd();
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this._fxSeed = (seed | 0) || 1;
        this._k = k;
        this.runSpeed = k.get('runSpeed');
        this.holeTime = k.get('holeTime');
        this.trapTime = f32(this.holeTime * k.get('trapShare'));        // the hole holds its guard for a share of its own life
        this.hesitateSeconds = k.get('guardHesitate');
        this._guardGreed = credit.unlosable ? 0 : k.get('guardGreed');
        this.startLives = Math.max(1, Math.trunc(k.get('lives') + 0.001));

        this.livesLeft = this.startLives;
        this._score = 0; this._time = 0; this._acc = 0; this.goldTaken = 0;
        this._digs = this._traps = this._buried = this._deaths = this._pickups = this._drops = 0;
        this._vaultsCleared = 0; this._extras = 0; this._log = '';
        this._nextExtra = this.extraFirst;
        this._result = RoundResult.None;
        this._cues.resetTotals(); this.events.length = 0;
        this.fx.length = 0; this.popups.length = 0; this.shake = this.flash = this.extraT = 0;
        // the attract demo opens on any vault, to show the heist off
        const first = this.isDemo ? (((seed % VAULTS.length) + VAULTS.length) % VAULTS.length) : 0;
        this._startVault(first);
    }

    _startVault(i) {
        const def = VAULTS[i];
        const bad = VaultMap.proof(def);
        if (bad.length > 0) throw new Error('VAULT DIGGER: unfair vault ' + (i + 1) + ', tile ' + bad[0] + ' cannot be reached and left');
        this.vault = i;
        this.map = new VaultMap(def);
        const k = this._k;
        this.guardSpeed = f32(f32(this.runSpeed * k.get('guardSpeed')) * f32(def.pace));
        this.guardPathing = Math.min(1, Math.max(0, f32(k.get('guardPathing') + f32(def.hunt))));
        this.guards.length = 0;
        for (let n = 0; n < this.map.guardStarts.length; n++) {
            const s = this.map.guardStarts[n];
            this.guards.push(new Guard(n, s.i % VaultMap.W, Math.trunc(s.i / VaultMap.W), s.kind));
        }
        this.vaultGold = 0; this.vaultDeaths = 0;
        this.bonus = def.bonus; this._bonusT = 0;
        this.alarm = false; this.tally = null;
        this._resetActors();
        this._go(Phase.Vault);
        this._emit('card', { n: i + 1, last: i === VAULTS.length - 1 });
        this._cues.emit(SoundCue.Tick);
    }

    _go(p) { this.p = p; this.phaseTime = 0; }

    _resetActors() {
        this.runner.place(this.map.startX, this.map.startY);
        this.runner.face = 1; this.runner.anim = 0;
        this.digging = false; this._digReq = 0;
        for (const g of this.guards) {
            if (g.carry && !g.sack) this._returnGold(g);
            g.place(g.homeX, g.homeY);
            g.s = GState.Walk; g.t = 0; g.spawnX = -1; g.hesitated = false;
            g.wait = f32(f32(0.4) + f32(f32(0.25) * g.id)); g.face = g.homeX > this.map.startX ? -1 : 1;
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
        if (input != null && (this.p === Phase.Play || this.p === Phase.Ready)) {
            if (input.pressed(Pad.A)) {
                // A + the stick AIMS the dig (left/right) and does not steer on that press
                this._digReq = this.digBuffer;
                this._digSide = this._heldDir === Dir4.Left ? -1 : this._heldDir === Dir4.Right ? 1 : 0;
                if (this._heldDir === Dir4.Left || this._heldDir === Dir4.Right) this._heldDir = Dir4.None;
            } else if (input.pressed(Pad.B)) {
                // B digs behind: the side he has his back to
                this._digReq = this.digBuffer;
                this._digSide = -this.runner.face;
                if (this._heldDir === Dir4.Left || this._heldDir === Dir4.Right) this._heldDir = Dir4.None;
            }
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
            if (pu.t > (pu.big ? 1.6 : 1.0)) this.popups.splice(i, 1);
        }
        this._fxTick(h);
        if (this.shake > 0) this.shake = Math.max(0, f32(this.shake - h));
        if (this.flash > 0) this.flash = Math.max(0, f32(this.flash - h));
        if (this.extraT > 0) this.extraT = Math.max(0, f32(this.extraT - h));
        switch (this.p) {
            case Phase.Vault:
                if (this.phaseTime >= this.vaultCardSeconds) this._begin(true);
                break;
            case Phase.Ready:
                if (this.phaseTime >= this.readyAgainSeconds) this._begin(false);
                break;
            case Phase.Play:
                this._playTick(h);
                break;
            case Phase.Caught:
                if (this.phaseTime >= this.caughtSeconds) {
                    this.livesLeft--;
                    if (this.livesLeft <= 0) this._end(RoundResult.Lost);
                    else { this._resetActors(); this._go(Phase.Ready); this._cues.emit(SoundCue.Tick); this._emit('ready'); }
                }
                break;
            case Phase.Escape:
                this.map.exitT = f32(this.map.exitT + h);
                if (this.phaseTime >= this.escapeSeconds) this._beginTally();
                break;
            case Phase.Tally:
                this._tallyTick(h);
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this._go(Phase.Over);
                break;
        }
    }

    _begin(fromCard) {
        this._go(Phase.Play);
        this._cues.emit(SoundCue.Start);
        this._emit('go', { card: fromCard, n: this.vault + 1 });
    }

    _end(r) {
        this._result = r;
        this._go(Phase.Card);
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    _addScore(v) {
        this._score += v;
        while (this._score >= this._nextExtra) {
            this._nextExtra += this.extraEvery;
            this._extras++;
            if (this.livesLeft < this.maxLives) this.livesLeft++;
            this.extraT = f32(2.6);
            this._cues.emit(SoundCue.Bonus);
            this._emit('extraLife', { lives: this.livesLeft });
        }
    }

    _playTick(h) {
        const m = this.map;
        if (this._digReq > 0) this._digReq = f32(this._digReq - h);
        if (m.exitOpen) m.exitT = f32(m.exitT + h);
        if (m.doorOpen) m.doorT = f32(m.doorT + h);
        this._bonusT = f32(this._bonusT + h);
        while (this._bonusT >= this.bonusStep) { this._bonusT = f32(this._bonusT - this.bonusStep); if (this.bonus > 0) this.bonus -= 10; }

        // holes: count down, refill
        for (let i = 0; i < m.holeT.length; i++) {
            if (m.holeT[i] <= 0) continue;
            m.holeT[i] = m.holeT[i] - h;      // Float32Array store auto-rounds to float
            if (m.holeT[i] <= 0) { this._refill(i % VaultMap.W, Math.trunc(i / VaultMap.W)); if (this.p !== Phase.Play) return; }
        }

        this._runnerTick(h);
        if (this.p !== Phase.Play) return;
        for (const g of this.guards) this._guardTick(g, h);

        // what is under the runner: gold, the key, the crown
        const rx = this.runner.lx, ry = this.runner.ly;
        if (VaultMap.inB(rx, ry)) {
            const i = VaultMap.idx(rx, ry);
            if (m.gold[i] > 0) { const n = m.gold[i]; m.gold[i] = 0; this._takeGold(n, rx, ry); }
            if (i === m.keyAt && !m.keyTaken) {
                m.keyTaken = true; m.doorOpen = true; m.doorT = 0;
                this._addScore(this.keyPoints);
                this._addPopup(rx, ry, this.keyPoints);
                this._burst(rx, ry, 10, 'green', 'goldHi');
                this._cues.emit(SoundCue.Bonus);
                this._emit('key');
            }
            if (i === m.crownAt && !m.crownTaken) {
                m.crownTaken = true;
                this._addScore(this.crownPoints);
                this._addPopup(rx, ry, this.crownPoints, true);
                this._burst(rx, ry, 16, 'goldHi', 'gold');
                this.alarm = true; this.shake = f32(0.4); this.flash = f32(0.4);
                this._cues.emit(SoundCue.Bonus);
                this._emit('crown');
                this._emit('alarm', { awake: !this.credit.unlosable });
            }
        }
        if (!m.exitOpen && this.itemsLeft === 0) {
            m.exitOpen = true; m.exitT = 0; this.flash = f32(0.5);
            for (let y = 0; y < VaultMap.H; y++) if (m.at(m.exitX, y) === Tile.Exit) this._burst(m.exitX, y, 2, 'goldHi', 'gold');
            this._cues.emit(SoundCue.Bonus);
            this._emit('exitOpen');
        }

        // a free guard touching the runner (on the free run: he lifts the gold off a guard who has some)
        for (const g of this.guards) {
            if (g.s !== GState.Walk && g.s !== GState.Climb) continue;
            if (g.falling && m.openHole(g.tx, g.ty)) continue;       // dropping into a hole: harmless
            if (Math.abs(f32(g.fx - this.runner.fx)) < f32(0.7) && Math.abs(f32(g.fy - this.runner.fy)) < f32(0.7)) {
                if (this.credit.unlosable) { if (g.carry) this._pickpocket(g); continue; }
                this._die(false); return;
            }
        }
    }

    _takeGold(n, x, y) {
        this.goldTaken += n; this.vaultGold += n;
        this._addScore(this.goldPoints * n);
        this._addPopup(x, y, this.goldPoints * n);
        this._burst(x, y, 6, 'goldHi', 'gold');
        this._cues.emit(SoundCue.Bonus);
        this._emit('gold', { left: this.itemsLeft, n: this.vaultGold });
    }

    _pickpocket(g) {
        g.carry = false; g.sack = false;
        this._takeGold(1, this.runner.lx, this.runner.ly);
        this._emit('pickpocket');
    }

    _addPopup(x, y, v, big = false) { this.popups.push({ x, y, t: 0, value: v, big }); }

    // ------------------------------------------------------------------ sparks and debris (never touch the dice)
    _fxRand() { this._fxSeed = (Math.imul(this._fxSeed, 1103515245) + 12345) | 0; return ((this._fxSeed >>> 8) & 0xFFFF) / 65536; }

    _spark(px, py, vx, vy, life, c, g) {
        if (this.fx.length >= 72) this.fx.shift();
        this.fx.push({ x: px, y: py, vx, vy, t: 0, life, c, g });
    }

    // n sparks out of a tile's middle, flying up and out
    _burst(x, y, n, c1, c2) {
        const px = x * 16 + 8, py = y * 16 + 8;
        for (let k = 0; k < n; k++) {
            const a = this._fxRand() * 6.2832, sp = 30 + this._fxRand() * 50;
            this._spark(px, py, Math.cos(a) * sp, Math.sin(a) * sp - 30, 0.45 + this._fxRand() * 0.35, k % 2 === 0 ? c1 : c2, true);
        }
    }

    // brick chips off the top of a tile
    _chips(x, y, n, up) {
        const px = x * 16, py = y * 16;
        for (let k = 0; k < n; k++)
            this._spark(px + 2 + this._fxRand() * 12, py + (up ? 1 : 8 + this._fxRand() * 6), (this._fxRand() - 0.5) * 70,
                up ? -40 - this._fxRand() * 50 : -10 + this._fxRand() * 20, 0.5 + this._fxRand() * 0.3, k % 3 === 0 ? 'brickHi' : k % 3 === 1 ? 'brick' : 'brickLo', true);
    }

    _fxTick(h) {
        for (let i = this.fx.length - 1; i >= 0; i--) {
            const s = this.fx[i];
            s.t += h;
            if (s.t >= s.life) { this.fx.splice(i, 1); continue; }
            if (s.g) s.vy += 260 * h;
            s.x += s.vx * h; s.y += s.vy * h;
        }
    }

    // ------------------------------------------------------------------ the runner
    _runnerTick(h) {
        const r = this.runner;
        if (this.digging) {
            this.digT = f32(this.digT - h);
            if (this.digT <= 0) {
                this.digging = false;
                const i = VaultMap.idx(this.digX, this.digY);
                this.map.holeT[i] = this.holeTime; this.map.holeSpan[i] = this.holeTime;
                // a guard crossing the tile above as it opens drops straight in (not the warden: he walks on)
                for (const g of this.guards)
                    if (g.s === GState.Walk && !g.warden && !g.falling && g.lx === this.digX && g.ly === this.digY - 1 && g.fy === this.digY - 1) {
                        g.place(this.digX, this.digY - 1);
                        startMove(g, Dir4.Down, true);
                    }
            }
            return;
        }
        if (r.moving) {
            if (!r.falling && r.moveDir >= 0) {
                // reverse mid-tile (not while falling); push along a belt that is carrying you and you walk it
                if (this._heldDir === Dir4.reverse(r.moveDir)) this._reverse(r);
                else if (r.carried && this._heldDir === r.moveDir) r.carried = false;
            }
            advance(r, this._speed(r, this.runSpeed), h);
        }
        if (!r.moving) this._runnerDecide();
    }

    _reverse(a) {
        const x = a.x, y = a.y;
        a.x = a.tx; a.y = a.ty; a.tx = x; a.ty = y;
        a.p = f32(1 - a.p);
        a.moveDir = Dir4.reverse(a.moveDir);
        a.carried = false;
        if (a.moveDir === Dir4.Left) a.face = -1; else if (a.moveDir === Dir4.Right) a.face = 1;
    }

    // the pace of a move: falling, a belt carrying you, walking a belt (with it or against it), or plain
    _speed(a, base) {
        if (a.falling) return this.fallSpeed;
        if (a.moveDir === Dir4.Left || a.moveDir === Dir4.Right) {
            const bd = this._beltUnder(a.x, a.y);
            if (bd !== 0) {
                if (a.carried) return this.beltSpeed;
                return f32(base * (Dir4.dx(a.moveDir) === bd ? BeltWith : BeltAgainst));
            }
        }
        return base;
    }

    _beltUnder(x, y) { return this.map.ladder(x, y) || this.map.bar(x, y) ? 0 : this.map.belt(x, y + 1); }

    // standing still on a belt: it carries you (a guard too, while it waits)
    _carry(a, guard) {
        const bd = this._beltUnder(a.x, a.y);
        if (bd === 0) return false;
        const nx = a.x + bd;
        if (this.map.solid(nx, a.y) || this._trappedAt(nx, a.y) != null) return false;
        if (guard != null && this._occupied(nx, a.y, guard)) return false;
        const face = a.face;
        startMove(a, bd < 0 ? Dir4.Left : Dir4.Right, false);
        a.carried = true; a.face = face;
        return true;
    }

    _runnerSupported(x, y) { return this.map.supported(x, y, false) || this._trappedAt(x, y + 1) != null; }

    _runnerDecide() {
        const r = this.runner;
        if (!this._runnerSupported(r.x, r.y)) {
            if (!r.falling) {
                // a real drop (two tiles or more) gets its whistle
                let d = 1;
                while (r.y + d + 1 < VaultMap.H && !this._runnerSupported(r.x, r.y + d) && !this.map.solid(r.x, r.y + d + 1)) d++;
                this._fallFrom = d;
                if (d >= 2) this._emit('fall', { depth: d });
            }
            this._drop(r, true);
            return;
        }
        if (r.falling && this._fallFrom >= 2) this._emit('land');
        r.falling = false;
        if (this._digReq > 0 && this._tryDig()) return;
        const d = this._heldDir;
        if (d === Dir4.Up) {
            if (this.map.ladder(r.x, r.y)) {
                if (r.y === 0) { if (this.map.exitOpen && r.x === this.map.exitX) this._beginEscape(); return; }
                if (!this.map.solid(r.x, r.y - 1)) startMove(r, Dir4.Up, false);
            }
        } else if (d === Dir4.Down) {
            if (r.y + 1 < VaultMap.H && !this.map.solid(r.x, r.y + 1) && this._trappedAt(r.x, r.y + 1) == null)
                startMove(r, Dir4.Down, !this.map.ladder(r.x, r.y) && !this.map.ladder(r.x, r.y + 1));
        } else if (d === Dir4.Left || d === Dir4.Right) {
            const dx = Dir4.dx(d);
            r.face = dx;
            if (!this.map.solid(r.x + dx, r.y) && this._trappedAt(r.x + dx, r.y) == null) startMove(r, d, false);
        }
        if (!r.moving) this._carry(r, null);
    }

    // start a fall one tile down; through a crack it crumbles
    _drop(a, isRunner) {
        startMove(a, Dir4.Down, true);
        if (this.map.crack(a.x, a.y + 1)) {
            const i = VaultMap.idx(a.x, a.y + 1);
            const first = this.map.crackSeen[i] === 0;
            this.map.crackSeen[i] = 1;
            this._chips(a.x, a.y + 1, 6, false);
            if (isRunner || first) this._emit('crumble', { runner: isRunner });
        }
    }

    // the brick diagonally ahead-below, on the side held (or faced)
    _tryDig() {
        const r = this.runner;
        const f = this._digSide !== 0 ? this._digSide : r.face;
        if (this.map.ladder(r.x, r.y) || this.map.bar(r.x, r.y)) return false;
        const dx = r.x + f, dy = r.y + 1;
        if (!this.map.brick(dx, dy)) {
            // stone or a belt: the pick rings off it, and the press is spent
            if (this.map.undiggable(dx, dy) && this.map.clear(dx, r.y)) {
                this._digReq = 0; r.face = f;
                for (let k = 0; k < 4; k++) this._spark(dx * 16 + 2 + k * 3, dy * 16 + 1, (k - 1.5) * 25, -50 - k * 10, 0.3, k % 2 ? 'white' : 'goldHi', true);
                this._emit('clank');
            }
            return false;
        }
        if (this.map.openHole(dx, dy)) return false;
        if (!this.map.clear(dx, r.y)) return false;
        if (this._guardNear(dx, r.y) || this._guardNear(dx, dy)) return false;
        r.face = f;
        this.digging = true; this.digT = this.digSeconds; this.digX = dx; this.digY = dy;
        this._digReq = 0; this._digs++;
        this._chips(dx, dy, 7, true);
        this._cues.emit(SoundCue.Tick);
        this._emit('dig', { x: dx, y: dy });
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
        this._emit('escape', { n: this.vault + 1 });
    }

    _die(byHole) {
        if (this.credit.unlosable) return;
        this._deaths++; this.vaultDeaths++;
        this.deathByHole = byHole;
        this.lastDeathX = this.runner.lx; this.lastDeathY = this.runner.ly;
        this.digging = false;
        this.shake = f32(0.35);
        this._burst(this.runner.lx, this.runner.ly, 10, 'white', 'gold');
        this._log += 'X' + (this.vault + 1) + '@' + fmt(this._time, 0, F32) + ' ';
        this._go(Phase.Caught);
        this._cues.emit(SoundCue.Die);
        this._emit('caught', { byHole, last: this.livesLeft <= 1 });
    }

    // ------------------------------------------------------------------ the tally
    _beginTally() {
        const n = this.vault + 1;
        const lines = [
            { label: 'VAULT ' + n, value: this.vaultPoints * n, shown: 0 },
            { label: 'BONUS CLOCK', value: this.bonus, shown: 0 },
            { label: 'NO MISS', value: this.vaultDeaths === 0 ? this.cleanPoints : 0, shown: 0 },
        ];
        this.tally = { lines, i: 0, t: 0, total: 0, tick: 0 };
        this._vaultsCleared++;
        this._log += 'V' + n + '@' + fmt(this._time, 0, F32) + ' ';
        this._go(Phase.Tally);
        this._emit('tallyStart', { n });
    }

    _tallyTick(h) {
        const T = this.tally;
        T.t = f32(T.t + h);
        if (T.i < T.lines.length) {
            const L = T.lines[T.i];
            const k = Math.min(1, f32(T.t / this.tallyLineSeconds));
            const want = Math.trunc(f32(L.value * k) / 10) * 10;
            if (want > L.shown) {
                this._addScore(want - L.shown); T.total += want - L.shown; L.shown = want;
                T.tick = f32(T.tick + h);
                if (T.tick >= f32(0.06)) { T.tick = 0; this._emit('tally'); }
            }
            if (T.t >= f32(this.tallyLineSeconds + this.tallyGapSeconds)) {
                if (L.shown < L.value) { this._addScore(L.value - L.shown); T.total += L.value - L.shown; L.shown = L.value; }
                this._emit('tallyLine', { i: T.i, value: L.value });
                T.i++; T.t = 0;
            }
        } else if (T.t >= this.tallyHoldSeconds) {
            if (this.vault + 1 >= VAULTS.length) this._end(RoundResult.Won);
            else this._startVault(this.vault + 1);
        }
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
        let buried = false;
        for (const g of this.guards) {
            if (g.s === GState.Dead) continue;
            if (g.moving && g.tx === x && g.ty === y && g.p < f32(0.5)) { g.place(g.x, g.y); if (g.s === GState.Climb) g.s = GState.Walk; continue; }
            if (g.lx === x && g.ly === y) {
                if (g.carry) this._returnGold(g);
                g.s = GState.Dead; g.t = this.respawnSeconds; g.moving = false; g.falling = false; g.spawnX = -1;
                this._buried++; buried = true;
                this._addScore(this.trapPoints);
                this._addPopup(x, y, this.trapPoints);
                this._chips(x, y, 8, true);
                this.shake = Math.max(this.shake, f32(0.15));
                this._cues.emit(SoundCue.Hit);
            }
        }
        this._emit(buried ? 'bury' : 'refill', { x, y });
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

    // the warden reads every hole as floor; everyone stands on a trapped guard's head
    _guardSupported(g, x, y) { return this.map.supported(x, y, g.warden) || this._trappedAt(x, y + 1) != null; }
    _solidFor(g, x, y) { return g.warden ? this.map.solidStatic(x, y) : this.map.solid(x, y); }

    _guardPace(g) {
        let v = this.guardSpeed;
        if (g.warden) v = f32(v * WardenPace);
        if (this.alarm && !this.credit.unlosable) v = f32(v * AlarmPace);
        return this._speed(g, v);
    }

    _guardTick(g, h) {
        if (g.carry && g.s === GState.Walk) g.carryT = f32(g.carryT - h);
        switch (g.s) {
            case GState.Dead:
                g.t = f32(g.t - h);
                if (g.spawnX < 0 && g.t <= this.warnSeconds) this._pickSpawn(g);
                if (g.t <= 0) this._respawn(g);
                return;
            case GState.Trapped:
                g.t = f32(g.t - h);
                if (g.t <= 0) {
                    if (g.y > 0 && !this.map.solid(g.x, g.y - 1) && !this._occupied(g.x, g.y - 1, g)) {
                        g.s = GState.Climb;
                        startMove(g, Dir4.Up, false);
                        this._emit('climbOut');
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
                if (g.moving && advance(g, this._guardPace(g), h)) this._guardArrive(g);
                if (!g.moving && g.s === GState.Walk) {
                    if (g.wait > 0) {
                        g.wait = f32(g.wait - h);
                        if (g.wait > 0) { if (this._guardSupported(g, g.x, g.y)) this._carry(g, g); return; }
                    }
                    this._guardDecide(g);
                }
                return;
        }
    }

    _canStep(g, dx) {
        const nx = g.x + dx;
        return !this._solidFor(g, nx, g.y) && !this._occupied(nx, g.y, g) && this._trappedAt(nx, g.y) == null;
    }

    _guardArrive(g) {
        // into an open hole: trapped (the warden never arrives in one: he reads it as floor)
        if (!g.warden && this.map.openHole(g.x, g.y)) {
            g.s = GState.Trapped; g.t = this.trapTime; g.trappedFor = this.trapTime;
            g.moving = false; g.falling = false;
            let dropped = false;
            if (g.carry) {
                if (g.y > 0 && this.map.clear(g.x, g.y - 1)) { this.map.gold[VaultMap.idx(g.x, g.y - 1)]++; g.carry = false; this._drops++; dropped = true; }
                else this._returnGold(g);
                g.sack = false;
            }
            this._traps++;
            this._addScore(this.trapPoints);
            this._addPopup(g.x, g.y - 1, this.trapPoints);
            for (let k = 0; k < 4; k++) this._spark(g.x * 16 + 3 + k * 3, g.y * 16 + 2, (k - 1.5) * 30, -30 - k * 6, 0.4, 'shade', true);
            if (dropped) this._burst(g.x, g.y - 1, 6, 'goldHi', 'gold');
            this._cues.emit(SoundCue.Hit);
            this._emit('trap', { dropped });
            return;
        }
        if (g.warden && this.map.openHole(g.x, g.y + 1) && !g.falling) this._emit('clang');
        const i = VaultMap.idx(g.x, g.y);
        if (!g.carry && !g.warden && this.map.gold[i] > 0 && this._guardGreed > 0 && this.rng.nextDouble() < this._guardGreed) {
            this.map.gold[i]--; g.carry = true; g.carryFrom = i; g.carryT = frand(this.rng, 3, 5); this._pickups++;
            this._emit('snatch');
        } else if (g.carry && !g.sack && g.carryT <= 0 && this.map.gold[i] === 0 && this.map.clear(g.x, g.y) && this.map.solid(g.x, g.y + 1)) {
            this.map.gold[i]++; g.carry = false; this._drops++;
        }
    }

    _returnGold(g) {
        if (!g.carry) return;
        const at = g.carryFrom >= 0 ? g.carryFrom : VaultMap.idx(this.map.startX, this.map.startY);
        this.map.gold[at]++;
        g.carry = false; g.sack = false;
    }

    // where a buried guard comes back: the top of the vault, away from the runner (the warning flashes there)
    _pickSpawn(g) {
        let best = -1, bestScore = -1;
        for (let k = 0; k < 8; k++) {
            const x = this.rng.next(VaultMap.W);
            if (!this.map.clear(x, 0) || x === this.map.exitX || this._occupied(x, 0, g)) continue;
            const s = f32(Math.abs(x - this.runner.x) + f32(this.rng.nextDouble()));
            if (s > bestScore) { bestScore = s; best = x; }
        }
        g.spawnX = best;
        if (best >= 0) this._emit('guardWarn', { x: best });
    }

    _respawn(g) {
        if (g.spawnX < 0 || !this.map.clear(g.spawnX, 0) || this._occupied(g.spawnX, 0, g)) this._pickSpawn(g);
        if (g.spawnX < 0) { g.t = f32(0.3); return; }
        g.place(g.spawnX, 0);
        g.s = GState.Walk; g.wait = f32(0.3); g.spawnX = -1;
        g.face = this.runner.x < g.x ? -1 : 1;
        this._emit('guardIn');
    }

    _guardDecide(g) {
        if (!this._guardSupported(g, g.x, g.y)) { this._drop(g, false); return; }
        g.falling = false;
        this._cand.length = 0;
        for (let d = 0; d < 4; d++) {
            const nx = g.x + Dir4.dx(d), ny = g.y + Dir4.dy(d);
            if (ny < 0) continue;
            if (d === Dir4.Up && !this.map.ladder(g.x, g.y)) continue;
            if (this._solidFor(g, nx, ny) || this._trappedAt(nx, ny) != null || this._occupied(nx, ny, g)) continue;
            this._cand.push(d);
        }
        if (this._cand.length === 0) { g.wait = f32(0.15); return; }
        let pick;
        const hunting = this.alarm ? f32(Math.max(this.guardPathing, 0.9)) : this.guardPathing;
        if (this.credit.unlosable || this.rng.nextDouble() >= hunting) {
            // not hunting this step: it stops to look about, then patrols on (the alarm: no looking about)
            if (!g.hesitated && !(this.alarm && !this.credit.unlosable)) {
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
        add(into, 'vaults', this._vaultsCleared);
        add(into, 'reached', this.vault + 1);
        add(into, 'deaths', this._deaths);
        add(into, 'extras', this._extras);
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
