// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE SIM (ICabinetSim).
// Port of StackAttackSim.cs from Staging/Batch2/stackattack.
//
// Falling blocks in a 10 x 20 well. The seven four-cell shapes come out of a 7-bag (every shape once,
// shuffled, then the next bag), enter in the two spawn rows above the rim and fall. Stick left/right
// slides (a tap moves one cell, a hold repeats after 0.22 s), stick down soft-drops (1 point a cell),
// button A turns clockwise, button B counter-clockwise (small wall kicks). A piece locks after 0.5 s on
// the stack (the timer restarts only when it drops a row), or at once when it lands with the stick held
// down. A full row flashes white, wipes from the centre out and everything above drops. 1/2/3/4 rows
// score 100/300/500/800 x level; the level (and the fall rate, x levelRamp) rises every 10 rows.
//
// THE ROUND: clear linesToWin (10) rows before the well tops out. The well tops out when a new piece
// cannot enter (block out) or when, after a lock and its clears, any block is left above the CEILING.
// The ceiling is the rim of the 20-row well; the mercy ceiling knob lifts it up to 2 rows into the
// spawn rows (the well gets +2 rows of ceiling).
//
// MERCY (knobs + CreditInfo.unlosable): the fall rate x0.9 per lost round, +2 rows of ceiling from the
// first loss; credit 5: pieces fall at a walk and a topped-out well is CLEARED (the stack is wiped, the
// rows already cleared still count) instead of ending the credit.
//
// Grid rows 0..21 top to bottom: rows 0-1 are the spawn rows above the rim, rows 2..21 the well.
// The piece RNG is StackAttackSim's own xorshift32 (not SystemRandom): the C# sim rolls its 7-bag with
// unchecked uint math, so this port keeps that generator bit for bit instead of sdk/rng.js.
import { f32, idiv, roundEven, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { FallRateBase } from './spec.js';

export const Tetromino = {
    I: 0, O: 1, T: 2, S: 3, Z: 4, J: 5, L: 6, Count: 7,
    Names: Object.freeze(['I', 'O', 'T', 'S', 'Z', 'J', 'L']),
    // palette family of each shape: 0 cyan, 1 magenta, 2 violet, 3 azure
    Tint: Object.freeze([0, 2, 1, 3, 1, 3, 0]),
};
Tetromino.Cells = buildCells();
Object.freeze(Tetromino);

function buildCells() {
    const spawn = [
        [0, 1, 1, 1, 2, 1, 3, 1],   // I  (4x4 box)
        [1, 0, 2, 0, 1, 1, 2, 1],   // O  (never turns)
        [1, 0, 0, 1, 1, 1, 2, 1],   // T  (3x3 box)
        [1, 0, 2, 0, 0, 1, 1, 1],   // S
        [0, 0, 1, 0, 1, 1, 2, 1],   // Z
        [0, 0, 0, 1, 1, 1, 2, 1],   // J
        [2, 0, 0, 1, 1, 1, 2, 1],   // L
    ];
    const all = [];
    for (let k = 0; k < Tetromino.Count; k++) {
        all[k] = [];
        all[k][0] = spawn[k];
        const n = k === Tetromino.I ? 4 : 3;
        for (let r = 1; r < 4; r++) {
            const prev = all[k][r - 1];
            const c = new Array(8);
            for (let i = 0; i < 4; i++) {
                if (k === Tetromino.O) { c[i * 2] = prev[i * 2]; c[i * 2 + 1] = prev[i * 2 + 1]; continue; }
                c[i * 2] = n - 1 - prev[i * 2 + 1];        // clockwise: (x, y) -> (n-1-y, x)
                c[i * 2 + 1] = prev[i * 2];
            }
            all[k][r] = c;
        }
    }
    return all;
}

const Phase = Object.freeze({ Idle: 0, Ready: 1, Falling: 2, Clearing: 3, TopOut: 4, WellClear: 5, Card: 6, Over: 7 });
const LinePoints = [0, 100, 300, 500, 800];
const Kicks = [0, -1, 1];
const KicksI = [0, -1, 1, -2, 2];

export class StackAttackSim {
    static get Phase() { return Phase; }

    constructor() {
        this.W = 10; this.Rows = 22; this.SpawnRows = 2; this.WellRows = 20;
        this.SpawnX = 3; this.SpawnY = 0;

        // the machine's timing (not mercy knobs)
        this.readySeconds = f32(1.8); this.goSeconds = f32(0.6);
        this.clearSeconds = f32(0.45);
        this.topOutSeconds = f32(1.8);
        this.wellClearSeconds = f32(1.6);
        this.cardSeconds = f32(3.0);
        this.das = f32(0.22); this.arr = f32(0.07);

        // read-only state (C# public getters)
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.credit = null;
        this.hasPiece = false;
        this.kind = 0; this.rot = 0; this.x = 0; this.y = 0;
        this.nextKind = 0;
        this.pieceSerial = 0;
        this.lines = 0;
        this.linesToWin = 0;
        this.level = 1;
        this.ceilingRows = 0;
        this.baseFallRate = 0;
        this.creditFallRate = 0;
        this.softRate = 0;
        this.lockDelay = 0;
        this.lockTime = 0;
        this.shapeCounts = new Int32Array(Tetromino.Count);
        this.clearRows = [];
        this.lastClearCount = 0;
        this.lastClearPoints = 0;
        this.lastClearAt = f32(-99);
        this.mercyClears = 0;
        this.piecesPlaced = 0;
        this.blockOut = false;
        this.peakHeight = 0;

        this.grid = new Uint8Array(this.W * this.Rows);
        this.clearsBy = new Int32Array(5);
        this.bag = new Int32Array(Tetromino.Count);
        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._score = 0; this._bagLeft = 0; this._softCells = 0; this._dasDir = 0;
        this._rng = 1;
        this._time = 0; this._fallAcc = 0; this._dasT = 0; this._levelRamp = f32(1);
        this._softBlocked = false; this._goCued = false;
    }

    get mercyActive() { return this.credit.unlosable; }
    get topLimit() { return this.SpawnRows - this.ceilingRows; }
    get fallRate() { return f32(this.creditFallRate * f32(Math.pow(this._levelRamp, this.level - 1))); }
    get roundWon() { return this._result === RoundResult.Won; }

    cell(x, y) { return x < 0 || x >= this.W || y < 0 || y >= this.Rows ? 9 : this.grid[y * this.W + x]; }
    copyGrid(into) { into.set(this.grid); }

    get stackHeight() {
        for (let y = 0; y < this.Rows; y++)
            for (let x = 0; x < this.W; x++)
                if (this.grid[y * this.W + x] !== 0) return this.Rows - y;
        return 0;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Falling:
            case Phase.Clearing: return CabinetState.Playing;      // a row clear is a beat of play, not a break
            case Phase.TopOut:
            case Phase.WellClear: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this._result === RoundResult.Lost ? 0 : 1; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' lines ' + this.lines + '/' + this.linesToWin + ' score ' + this._score + ' ' + this._time.toFixed(1) + 's pieces ' + this.piecesPlaced +
               ' clears ' + this.clearsBy[1] + '/' + this.clearsBy[2] + '/' + this.clearsBy[3] + '/' + this.clearsBy[4] + ' peak ' + this.peakHeight +
               (this.mercyClears > 0 ? ' mercy-clears ' + this.mercyClears : '');
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.baseFallRate = f32(FallRateBase);
        this.creditFallRate = k.get('fallRate');
        this._levelRamp = k.get('levelRamp');
        this.softRate = k.get('softDrop');
        this.lockDelay = k.get('lockDelay');
        this.ceilingRows = Math.max(0, Math.min(this.SpawnRows, roundEven(k.get('ceilingRows'))));
        this.linesToWin = Math.max(1, roundEven(k.get('linesToWin')));

        this._rng = (seed === 0 ? (Date.now() | 0) : seed) >>> 0;
        this._rng = (this._rng ^ 0x9E3779B9) >>> 0;
        if (this._rng === 0) this._rng = 1;
        for (let i = 0; i < 4; i++) this._nextRandom();
        this.grid.fill(0);
        this.shapeCounts.fill(0);
        this.clearsBy.fill(0);
        this.clearRows.length = 0;
        this._bagLeft = 0;
        this._score = 0; this._softCells = 0; this.lines = 0; this.piecesPlaced = 0; this.mercyClears = 0; this.peakHeight = 0; this.level = 1;
        this._time = 0; this._fallAcc = 0; this._dasT = 0; this._dasDir = 0; this._softBlocked = false; this._goCued = false;
        this.lastClearCount = 0; this.lastClearPoints = 0; this.lastClearAt = f32(-99); this.blockOut = false;
        this.pieceSerial = 0; this.hasPiece = false;
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this.nextKind = this._fromBag();
        this.p = Phase.Ready; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
    }

    // ------------------------------------------------------------------ dice: xorshift32 + the 7-bag
    _nextRandom() {
        let r = this._rng;
        r = (r ^ (r << 13)) >>> 0;
        r = (r ^ (r >>> 17)) >>> 0;
        r = (r ^ (r << 5)) >>> 0;
        this._rng = r;
        return r;
    }

    _fromBag() {
        if (this._bagLeft === 0) {
            for (let i = 0; i < this.bag.length; i++) this.bag[i] = i;
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = this._nextRandom() % (i + 1);
                const t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t;
            }
            this._bagLeft = this.bag.length;
        }
        return this.bag[this.bag.length - this._bagLeft--];
    }

    // ------------------------------------------------------------------ the pieces
    fits(kind, rot, px, py) {
        const c = Tetromino.Cells[kind][rot & 3];
        for (let i = 0; i < 4; i++) {
            const x = px + c[i * 2], y = py + c[i * 2 + 1];
            if (x < 0 || x >= this.W || y >= this.Rows) return false;
            if (y >= 0 && this.grid[y * this.W + x] !== 0) return false;
        }
        return true;
    }

    _move(dx) {
        if (!this.fits(this.kind, this.rot, this.x + dx, this.y)) return false;
        this.x += dx;
        return true;
    }

    _turn(dir) {
        if (this.kind === Tetromino.O) return false;
        const nr = (this.rot + dir + 4) & 3;
        const kicks = this.kind === Tetromino.I ? KicksI : Kicks;
        for (let i = 0; i < kicks.length; i++)
            if (this.fits(this.kind, nr, this.x + kicks[i], this.y)) { this.x += kicks[i]; this.rot = nr; this._cues.emit(SoundCue.Tick); return true; }
        return false;
    }

    _spawn() {
        this.kind = this.nextKind;
        this.nextKind = this._fromBag();
        this.rot = 0; this.x = this.SpawnX; this.y = this.SpawnY;
        this.hasPiece = true;
        this.pieceSerial++;
        this._fallAcc = 0; this.lockTime = 0; this._dasT = 0; this._dasDir = 0;
        if (!this.fits(this.kind, this.rot, this.x, this.y)) { this.blockOut = true; this._topOut(); return; }
        this.p = Phase.Falling; this.phaseTime = 0;
    }

    _lock() {
        const c = Tetromino.Cells[this.kind][this.rot];
        for (let i = 0; i < 4; i++) {
            const x = this.x + c[i * 2], y = this.y + c[i * 2 + 1];
            if (y >= 0 && y < this.Rows) this.grid[y * this.W + x] = this.kind + 1;
        }
        this.hasPiece = false;
        this.piecesPlaced++;
        this.shapeCounts[this.kind]++;
        this.peakHeight = Math.max(this.peakHeight, this.stackHeight);
        this._cues.emit(SoundCue.Hit);

        this.clearRows.length = 0;
        for (let y = 0; y < this.Rows; y++) {
            let full = true;
            for (let x = 0; x < this.W && full; x++) if (this.grid[y * this.W + x] === 0) full = false;
            if (full) this.clearRows.push(y);
        }
        if (this.clearRows.length > 0) {
            const n = this.clearRows.length;
            this.lastClearCount = n;
            this.lastClearPoints = LinePoints[Math.min(4, n)] * this.level;
            this.lastClearAt = this._time;
            this._score += this.lastClearPoints;
            this.lines += n;
            this.clearsBy[Math.min(4, n)]++;
            this._cues.emit(SoundCue.Bonus);
            this.p = Phase.Clearing; this.phaseTime = 0;
            return;
        }
        this._afterSettle();
    }

    // the lock (and its clears) is resolved: win, top out over the ceiling, or the next piece
    _afterSettle() {
        if (this.lines >= this.linesToWin) { this._enterCard(RoundResult.Won); return; }
        for (let y = 0; y < this.topLimit; y++)
            for (let x = 0; x < this.W; x++)
                if (this.grid[y * this.W + x] !== 0) { this.blockOut = false; this._topOut(); return; }
        this.level = 1 + idiv(this.lines, 10);                             // the fall rate steps up with the level
        this._spawn();
    }

    _collapse() {
        // drop every row above each cleared row; clearRows is ascending (top first)
        for (const row of this.clearRows) {
            for (let y = row; y > 0; y--) this.grid.copyWithin(y * this.W, (y - 1) * this.W, y * this.W);
            this.grid.fill(0, 0, this.W);
        }
        this.clearRows.length = 0;
    }

    _topOut() {
        this.hasPiece = this.hasPiece && this.blockOut;                    // a blocked piece stays on screen, jammed at the top
        if (this.credit.unlosable) { this.p = Phase.WellClear; this.mercyClears++; this._cues.emit(SoundCue.Miss); }
        else { this.p = Phase.TopOut; this._cues.emit(SoundCue.Die); }
        this.phaseTime = 0;
    }

    _enterCard(r) {
        this._result = r;
        this.hasPiece = false;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    // ------------------------------------------------------------------ the step
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        const down = input != null && input.held(Pad.Down);
        if (!down) this._softBlocked = false;                     // soft drop needs a fresh push for every piece

        switch (this.p) {
            case Phase.Ready:
                if (!this._goCued && this.phaseTime >= f32(this.readySeconds - this.goSeconds)) { this._goCued = true; this._cues.emit(SoundCue.Start); }
                if (this.phaseTime >= this.readySeconds) this._spawn();
                break;

            case Phase.Falling:
                this._falling(dt, input, down);
                break;

            case Phase.Clearing:
                if (this.phaseTime >= this.clearSeconds) { this._collapse(); this._afterSettle(); }
                break;

            case Phase.TopOut:
                if (this.phaseTime >= this.topOutSeconds) this._enterCard(RoundResult.Lost);
                break;

            case Phase.WellClear:
                if (this.phaseTime >= this.wellClearSeconds) {
                    this.grid.fill(0);
                    this.hasPiece = false; this.blockOut = false;
                    this._spawn();
                }
                break;

            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _falling(dt, input, down) {
        if (input != null) {
            if (input.pressed(Pad.A)) this._turn(1);
            if (input.pressed(Pad.B)) this._turn(-1);
            const l = input.held(Pad.Left), r = input.held(Pad.Right);
            const dir = l && !r ? -1 : r && !l ? 1 : 0;
            if (dir === 0) this._dasDir = 0;
            else if (dir !== this._dasDir) { this._dasDir = dir; this._move(dir); this._dasT = this.das; }
            else {
                this._dasT = f32(this._dasT - dt);
                while (this._dasT <= 0) { if (!this._move(dir)) { this._dasT = 0; break; } this._dasT = f32(this._dasT + this.arr); }
            }
        }

        const soft = down && !this._softBlocked && this.softRate > this.fallRate;
        this._fallAcc = f32(this._fallAcc + f32((soft ? this.softRate : this.fallRate) * dt));
        while (this._fallAcc >= 1) {
            if (this.fits(this.kind, this.rot, this.x, this.y + 1)) {
                this.y++; this._fallAcc = f32(this._fallAcc - 1); this.lockTime = 0;
                if (soft) { this._score += 1; this._softCells++; }
            } else { this._fallAcc = 0; break; }
        }

        if (!this.fits(this.kind, this.rot, this.x, this.y + 1)) {
            this.lockTime = f32(this.lockTime + dt);
            if (this.lockTime >= this.lockDelay || soft) {
                if (down) this._softBlocked = true;
                this._lock();
            }
        } else this.lockTime = 0;
    }

    collectStats(into) {
        add(into, 'pieces', this.piecesPlaced);
        add(into, 'lines', this.lines);
        add(into, 'x1', this.clearsBy[1]);
        add(into, 'x2', this.clearsBy[2]);
        add(into, 'x3', this.clearsBy[3]);
        add(into, 'x4', this.clearsBy[4]);
        add(into, 'peak', this.peakHeight);
        add(into, 'softCells', this._softCells);
        add(into, 'mercyClears', this.mercyClears);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }
