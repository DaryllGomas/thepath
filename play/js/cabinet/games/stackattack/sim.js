// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE SIM (ICabinetSim).
// Began as a port of StackAttackSim.cs (Staging/Batch2/stackattack: one well, ten rows and ROUND WON);
// built out on 2026-10-18 into a whole game for a coin. Parity with the Unity C# is retired (NOTES.md).
//
// Falling blocks in a 10 x 20 well. The seven four-cell shapes come out of a 7-bag (every shape once,
// shuffled, then the next bag), enter in the two spawn rows above the rim and fall. Stick left/right
// slides (a tap moves one cell, a hold repeats after 0.22 s), stick down soft-drops (1 point a row), a
// fresh push UP drops the piece at once and locks it (2 points a row), button A turns clockwise, button B
// counter-clockwise (small wall kicks, and one floor kick up). A piece locks after 0.5 s on the stack (the
// timer restarts only when it drops a row), or at once when it lands with the stick held down. A full row
// flashes white, wipes from the centre out and everything above drops.
//
// THE GAME: six stages (stages.js), each laid fresh on its STAGE CARD (Intro: number, name, goal, hint,
// the well behind it) with its own goal and one new thing: THE BASICS (rows), GARBAGE (steel rows rise from
// the floor on a timer, the next one shown in the panel), BOMB BLOCKS (a bomb in a cleared row blasts the
// 3 x 3 round it, and a bomb the blast takes goes off too), THE DIG (dig three gold blocks out of a steel
// heap), THE SQUEEZE (the walls step in every 3 rows; a wall that closes a row's last hole clears it) and
// THE TOWER (the finale: 20 rows against a fast flood with bombs in it). Meeting the goal ends the stage:
// the TALLY (Interlude) counts the bonuses into the score, then the next card. Clearing THE TOWER wins.
//
// STACKS (lives): a coin buys `stacks` (3). The well TOPS OUT when a new piece cannot enter (block out),
// when after a lock and its clears any block is left above the CEILING, or when the flood pushes a block
// out of the top. A top out costs a stack and starts the stage over (the score stays); the last stack
// gone is GAME OVER. An EXTRA STACK at extraAt (20000) points, then every extraEvery (40000) more.
// The ceiling is the rim of the 20-row well; the mercy ceiling knob lifts it up to 2 rows into the spawn rows.
//
// SCORING: 1/2/3/4 rows = 100/300/500/800 x the stage; four rows after four rows (BACK TO BACK) x1.5;
// a COMBO (locks in a row that each clear) +50 x the combo x the stage; a bomb 100 x the stage + 10 a
// block it takes; a gold block 1000 x the stage. The tally: 1000 x the stage, 10 x the stage for every
// empty row left (LOW STACK), 250 x the best combo, 500 x the stage if no stack was lost on it, and on
// THE TOWER 5000 for every stack left.
//
// MERCY (knobs + CreditInfo.unlosable): the fall rate x0.9 per lost round, +2 rows of ceiling from the
// first loss, the flood slower (x1.12 per loss), a fourth stack from the third credit; credit 5: pieces fall
// at a walk, the flood crawls, and a topped-out well is CLEARED (the stage's progress kept, its heap laid
// again with the gold still owed) instead of costing a stack.
//
// Grid rows 0..21 top to bottom: rows 0-1 are the spawn rows above the rim, rows 2..21 the well.
// The piece RNG is the sim's own xorshift32 (the C# port's generator, kept): the 7-bag, the junk's holes,
// the bombs and the gold all roll from it. The sim says more than the eight cues: with recordEvents on
// (the floor's sound adapter switches it on) it pushes { kind, ... } onto `events` (sound.js plays them),
// and it keeps a short list of picture effects (`fx`: rows, blasts, drops, pops) the renderer draws.
import { f32, roundEven, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { FallRateBase } from './spec.js';
import { STAGES, Goal } from './stages.js';

export const Tetromino = {
    I: 0, O: 1, T: 2, S: 3, Z: 4, J: 5, L: 6, Count: 7,
    Names: Object.freeze(['I', 'O', 'T', 'S', 'Z', 'J', 'L']),
    // palette family of each shape: 0 cyan, 1 magenta, 2 violet, 3 azure
    Tint: Object.freeze([0, 2, 1, 3, 1, 3, 0]),
};
Tetromino.Cells = buildCells();
Object.freeze(Tetromino);

// what a grid cell holds: 0 empty, 1..7 a shape's block (kind + 1), then the stages' things
export const Block = Object.freeze({ Empty: 0, Junk: 8, Iron: 9, Gold: 10, Bomb: 11 });

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

const Phase = Object.freeze({ Idle: 0, Card: 1, Falling: 2, Clearing: 3, TopOut: 4, WellClear: 5, Tally: 6, Result: 7, Over: 8 });
const LinePoints = [0, 100, 300, 500, 800];
const Kicks = [0, -1, 1];
const KicksI = [0, -1, 1, -2, 2];
const FxMax = 48;

export class StackAttackSim {
    static get Phase() { return Phase; }

    constructor() {
        this.W = 10; this.Rows = 22; this.SpawnRows = 2; this.WellRows = 20;
        this.SpawnY = 0;

        // the machine's timing (not mercy knobs)
        this.cardSeconds = f32(3.2); this.goSeconds = f32(0.7);
        this.clearSeconds = f32(0.45);
        this.topOutSeconds = f32(2.4);
        this.wellClearSeconds = f32(1.6);
        this.tallyFirst = f32(0.8); this.tallyStep = f32(0.45); this.tallyHold = f32(1.7);
        this.resultSeconds = f32(4.5);
        this.das = f32(0.22); this.arr = f32(0.07);
        this.floodWarn = f32(1.6);                         // seconds of warning before a row rises
        this.maxStacks = 6;
        this.dangerRows = 4;                               // the stack this close to the ceiling: the warning
        this.stages = STAGES.length;

        // the sound's own events (Starvector's way): pushed only while the host listens
        this.recordEvents = false; this.events = [];

        // read-only state (C# public getters)
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.credit = null;
        this.stage = 1; this.stageDef = STAGES[0];
        this.attempt = 0;                                  // 0 = the first go at this stage; +1 for each top out
        this.stacks = 0; this.startStacks = 3;
        this.nextExtra = 0; this.extraAt = 20000; this.extraEvery = 40000; this.extras = 0;
        this.hasPiece = false;
        this.kind = 0; this.rot = 0; this.x = 0; this.y = 0;
        this.bombCell = -1;                                // which of the piece's four cells is a bomb (-1 none)
        this.nextKind = 0; this.nextBomb = -1;
        this.pieceSerial = 0;
        this.boardSerial = 0;                              // +1 whenever the well changes under a falling piece
        this.wellL = 0; this.wellR = 9;                    // the open columns (the squeeze walls close them)
        this.progress = 0; this.target = 0;                // the stage's goal count
        this.stageLines = 0;
        this.lines = 0;
        this.ceilingRows = 0;
        this.baseFallRate = 0;
        this.creditFallRate = 0;
        this.softRate = 0;
        this.lockDelay = 0;
        this.lockTime = 0;
        this.floodPace = 1;
        this.floodT = 0; this.floodEvery = 0; this.floodWarned = false;
        this.floodRow = new Uint8Array(10);                // the next row to rise (shown in the panel)
        this.squeezeIn = 0;                                // rows until the walls step in
        this.combo = -1; this.maxCombo = 0; this.stageMaxCombo = 0; this.b2bReady = false;
        this.tally = []; this.tallyShown = 0; this.tallyTotal = 0;
        this.shapeCounts = new Int32Array(Tetromino.Count);
        this.clearRows = [];
        this.lastClearCount = 0;
        this.lastClearPoints = 0;
        this.lastClearAt = f32(-99);
        this.lastB2b = false; this.lastCombo = 0; this.lastBombs = 0; this.lastGold = 0; this.lastSqueezed = false;
        this.extraShownAt = f32(-99);
        this.shakeAt = f32(-99); this.shakeAmp = 0;
        this.bumpAt = f32(-99);
        this.dangerOn = false;
        this.mercyClears = 0;
        this.piecesPlaced = 0;
        this.blockOut = false;
        this.peakHeight = 0;
        this.topOuts = 0; this.stagesCleared = 0;
        this.bombsSet = 0; this.goldDug = 0; this.floods = 0; this.squeezes = 0; this.b2bs = 0; this.hardDrops = 0;
        this.isDemo = false;

        // picture effects the renderer draws (newest last): { k, x, y, t, v, s, a }
        this.fx = [];

        this.grid = new Uint8Array(this.W * this.Rows);
        this.blast = new Uint8Array(this.W * this.Rows);  // during a clear: 2 = a cleared row, 1 = taken by a blast
        this.clearsBy = new Int32Array(5);
        this.stageSecs = new Float64Array(STAGES.length + 1);
        this.bag = new Int32Array(Tetromino.Count);
        this._queue = [];
        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._score = 0; this._bagLeft = 0; this._softCells = 0; this._dasDir = 0; this._bombCount = 0; this._floodCount = 0;
        this._rng = 1; this._fxSerial = 0; this._kickUps = 0; this._fall = f32(1); this._shaftX = -1; this._shaftRun = 0;
        this._time = 0; this._fallAcc = 0; this._dasT = 0;
        this._softBlocked = false; this._goSaid = false; this._squeezePending = false; this._squeezeSide = 0;
    }

    get mercyActive() { return this.credit.unlosable; }
    get topLimit() { return this.SpawnRows - this.ceilingRows; }
    get fallRate() { return this._fall; }
    get roundWon() { return this._result === RoundResult.Won; }
    get wellWidth() { return this.wellR - this.wellL + 1; }
    get squeezeSide() { return this._squeezeSide; }                 // 0: the left wall moves next, 1: the right

    cell(x, y) { return x < 0 || x >= this.W || y < 0 || y >= this.Rows ? Block.Iron : this.grid[y * this.W + x]; }
    copyGrid(into) { into.set(this.grid); }

    // the topmost row holding a block (iron walls are not blocks); Rows when the well is empty
    get stackTop() {
        for (let y = 0; y < this.Rows; y++)
            for (let x = this.wellL; x <= this.wellR; x++) {
                const v = this.grid[y * this.W + x];
                if (v !== 0 && v !== Block.Iron) return y;
            }
        return this.Rows;
    }
    get stackHeight() { return this.Rows - this.stackTop; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Card: return CabinetState.Intro;
            case Phase.Falling:
            case Phase.Clearing: return CabinetState.Playing;      // a row clear is a beat of play, not a break
            case Phase.TopOut:
            case Phase.WellClear:
            case Phase.Tally: return CabinetState.Interlude;
            case Phase.Result: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this._result === RoundResult.Lost ? 0 : this.stacks; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        let secs = '';
        for (let i = 1; i <= this.stages; i++) if (this.stageSecs[i] > 0) secs += ' s' + i + ' ' + this.stageSecs[i].toFixed(0);
        return r + ' stage ' + this.stage + '/' + this.stages + ' score ' + this._score + ' ' + this._time.toFixed(1) + 's stacks ' + this.stacks +
               ' lines ' + this.lines + ' pieces ' + this.piecesPlaced +
               ' clears ' + this.clearsBy[1] + '/' + this.clearsBy[2] + '/' + this.clearsBy[3] + '/' + this.clearsBy[4] +
               ' bombs ' + this.bombsSet + ' gold ' + this.goldDug + ' tops ' + this.topOuts + ' peak ' + this.peakHeight +
               (this.mercyClears > 0 ? ' mercy-clears ' + this.mercyClears : '') + ' |' + secs;
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.baseFallRate = f32(FallRateBase);
        this.creditFallRate = k.get('fallRate');
        this.softRate = k.get('softDrop');
        this.lockDelay = k.get('lockDelay');
        this.floodPace = k.get('floodPace');
        this.ceilingRows = Math.max(0, Math.min(this.SpawnRows, roundEven(k.get('ceilingRows'))));
        this.startStacks = Math.max(1, roundEven(k.get('stacks')));
        this.extraAt = Math.max(1000, roundEven(k.get('extraAt')));
        this.extraEvery = Math.max(1000, roundEven(k.get('extraEvery')));

        this._rng = (seed === 0 ? 0x5EED : seed) >>> 0;
        this._rng = (this._rng ^ 0x9E3779B9) >>> 0;
        if (this._rng === 0) this._rng = 1;
        for (let i = 0; i < 4; i++) this._nextRandom();
        this.grid.fill(0); this.blast.fill(0);
        this.shapeCounts.fill(0);
        this.clearsBy.fill(0);
        this.stageSecs.fill(0);
        this.clearRows.length = 0;
        this.fx.length = 0; this.events.length = 0; this.tally.length = 0;
        this._bagLeft = 0;
        this._score = 0; this._softCells = 0; this.lines = 0; this.piecesPlaced = 0; this.mercyClears = 0; this.peakHeight = 0;
        this.topOuts = 0; this.stagesCleared = 0; this.extras = 0;
        this.bombsSet = 0; this.goldDug = 0; this.floods = 0; this.squeezes = 0; this.b2bs = 0; this.hardDrops = 0; this.maxCombo = 0;
        this._time = 0; this._fallAcc = 0; this._dasT = 0; this._dasDir = 0; this._softBlocked = false; this._fxSerial = 0;
        this.lastClearCount = 0; this.lastClearPoints = 0; this.lastClearAt = f32(-99); this.blockOut = false;
        this.extraShownAt = f32(-99); this.shakeAt = f32(-99); this.bumpAt = f32(-99);
        this.pieceSerial = 0; this.boardSerial = 0; this.hasPiece = false;
        this.stacks = this.startStacks; this.nextExtra = this.extraAt;
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this.nextKind = this._fromBag(); this.nextBomb = -1;
        // the attract demo starts on a later stage (2..6) to show the floor what the game has in it
        const first = this.isDemo ? 2 + this._nextRandom() % (this.stages - 1) : 1;
        this._startStage(first, false);
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

    _roll(n) { return this._nextRandom() % n; }

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

    // every bombEvery-th piece carries a bomb in one of its cells
    _rollBomb() {
        const e = this.stageDef.bombEvery;
        if (e <= 0) return -1;
        this._bombCount++;
        return this._bombCount % e === 0 ? this._roll(4) : -1;
    }

    // ------------------------------------------------------------------ the stages
    _startStage(n, again) {
        this.stage = n; this.stageDef = STAGES[n - 1];
        const st = this.stageDef;
        this.target = st.target; this.progress = 0; this.stageLines = 0;
        this.stageMaxCombo = 0; this.combo = -1; this.b2bReady = false;
        this.attempt = again ? this.attempt + 1 : 0;
        this.wellL = 0; this.wellR = this.W - 1;
        this.squeezeIn = st.squeeze; this._squeezeSide = 0; this._squeezePending = false;
        this._bombCount = 0; this._floodCount = 0;
        this._layWell(st.gold.length);
        this.nextBomb = this._rollBomb();
        if (st.flood > 0) this._makeFloodRow();
        this._updateFall();
        this.floodT = this.floodEvery = this._floodSeconds(); this.floodWarned = false;
        this.hasPiece = false; this.blockOut = false; this.dangerOn = false;
        this.clearRows.length = 0; this.blast.fill(0);
        this.p = Phase.Card; this.phaseTime = 0; this._goSaid = false;
        this.boardSerial++;
        this._cues.emit(SoundCue.Tick);
        this._emit('card', { stage: n, again, final: st.final });
    }

    // the well as the stage starts: walls, its steel heap with bombs and `golds` gold blocks in it
    _layWell(golds) {
        const st = this.stageDef, W = this.W;
        for (let y = 0; y < this.Rows; y++) this._blankRow(y);
        const n = Math.min(st.junk, this.WellRows - 6);
        const top = this.Rows - n;
        this._shaftX = -1; this._shaftRun = 0;
        for (let i = 0; i < n; i++) this._junkRow(top + i, st.junkGaps, st.shaft);
        for (let b = 0; b < st.junkBombs && n > 0; b++) {
            for (let tries = 0; tries < 24; tries++) {
                const i = (top + this._roll(n)) * W + this.wellL + this._roll(this.wellWidth);
                if (this.grid[i] === Block.Junk) { this.grid[i] = Block.Bomb; break; }
            }
        }
        for (let g = 0; g < golds && g < st.gold.length; g++) {
            const d = st.gold[g];
            if (d >= n) continue;
            for (let tries = 0; tries < 24; tries++) {
                const i = (top + d) * W + this.wellL + this._roll(this.wellWidth);
                if (this.grid[i] === Block.Junk) { this.grid[i] = Block.Gold; break; }
            }
        }
        this.boardSerial++;
    }

    _blankRow(y) {
        const o = y * this.W;
        for (let x = 0; x < this.W; x++) this.grid[o + x] = x < this.wellL || x > this.wellR ? Block.Iron : 0;
    }

    _junkRow(y, gaps, shaft) {
        const o = y * this.W;
        this._blankRow(y);
        for (let x = this.wellL; x <= this.wellR; x++) this.grid[o + x] = Block.Junk;
        if (shaft > 0) {
            // the shaft: its hole runs straight down `shaft` rows, then jumps at least two columns over
            const hi = this.wellR - gaps + 1;
            if (this._shaftX < 0 || this._shaftRun <= 0) {
                let x = this.wellL + this._roll(hi - this.wellL + 1);
                for (let k = 0; k < 8 && this._shaftX >= 0 && Math.abs(x - this._shaftX) < 2; k++) x = this.wellL + this._roll(hi - this.wellL + 1);
                this._shaftX = x; this._shaftRun = shaft;
            }
            this._shaftRun--;
            for (let g = 0; g < gaps; g++) this.grid[o + this._shaftX + g] = 0;
            return;
        }
        for (let g = 0, tries = 0; g < gaps && tries < 40; tries++) {
            const x = this.wellL + this._roll(this.wellWidth);
            if (this.grid[o + x] === 0) continue;
            this.grid[o + x] = 0; g++;
        }
    }

    _makeFloodRow() {
        const st = this.stageDef, r = this.floodRow;
        r.fill(Block.Junk);
        for (let g = 0, tries = 0; g < st.floodGaps && tries < 40; tries++) {
            const x = this._roll(this.W);
            if (r[x] === 0) continue;
            r[x] = 0; g++;
        }
        this._floodCount++;
        if (st.floodBomb > 0 && this._floodCount % st.floodBomb === 0) {
            for (let tries = 0; tries < 20; tries++) { const x = this._roll(this.W); if (r[x] === Block.Junk) { r[x] = Block.Bomb; break; } }
        }
    }

    _floodSeconds() {
        const st = this.stageDef;
        if (st.flood <= 0) return f32(0);
        return f32(Math.max(st.floodMin * this.floodPace, f32(st.flood * this.floodPace * Math.pow(st.floodRamp, this.stageLines))));
    }

    _updateFall() {
        const st = this.stageDef;
        this._fall = f32(this.creditFallRate * f32(st.speed * Math.pow(st.ramp, this.stageLines)));
    }

    // a steel row rises from the floor: everything goes up a row, the piece stays put unless the stack
    // comes up into it (then it rides up one row); a block pushed out of the top is a top out
    _riseFlood() {
        const W = this.W, g = this.grid;
        let out = false;
        for (let x = this.wellL; x <= this.wellR; x++) if (g[x] !== 0 && g[x] !== Block.Iron) out = true;
        g.copyWithin(0, W, W * this.Rows);
        const o = (this.Rows - 1) * W;
        for (let x = 0; x < W; x++) g[o + x] = x < this.wellL || x > this.wellR ? Block.Iron : this.floodRow[x];
        if (this.hasPiece && !this.fits(this.kind, this.rot, this.x, this.y)) this.y--;
        this.floods++;
        this.boardSerial++;
        this._makeFloodRow();
        this.floodT = this.floodEvery = this._floodSeconds(); this.floodWarned = false;
        this._fx('flood', 0, this.Rows - 1, 0);
        this._emit('flood', { out });
        if (out) { this.blockOut = false; this._topOut(); }
    }

    _floodTick(dt) {
        if (this.stageDef.flood <= 0) return;
        this.floodT = f32(this.floodT - dt);
        if (!this.floodWarned && this.floodT <= this.floodWarn) { this.floodWarned = true; this._emit('floodWarn'); }
        if (this.floodT <= 0) this._riseFlood();
    }

    // the squeeze: a wall steps in a column (left, then right ...). What was in that column is crushed into
    // the iron; a row whose last hole was in it is now full and clears (a SQUEEZE clear).
    _squeeze() {
        const left = this._squeezeSide === 0;
        const col = left ? this.wellL : this.wellR;
        if (left) this.wellL++; else this.wellR--;
        this._squeezeSide ^= 1;
        let crushed = 0;
        for (let y = 0; y < this.Rows; y++) {
            const i = y * this.W + col;
            if (this.grid[i] !== 0 && this.grid[i] !== Block.Iron) crushed++;
            this.grid[i] = Block.Iron;
        }
        this.squeezes++;
        this.boardSerial++;
        this.shakeAt = this._time; this.shakeAmp = 2;
        this._fx('crush', col, 0, crushed, left ? -1 : 1);
        this._emit('squeeze', { left, crushed, width: this.wellWidth });
        this._findFull();
        if (this.clearRows.length > 0) { this._beginClear(true); return true; }
        return false;
    }

    _stageClear() {
        const n = this.stage, st = this.stageDef;
        this.hasPiece = false;
        this.stagesCleared++;
        this.tally.length = 0;
        this.tally.push(['STAGE ' + n + ' BONUS', 1000 * n]);
        const empty = Math.max(0, Math.min(this.WellRows, this.WellRows - (this.Rows - this.stackTop)));
        this.tally.push(['LOW STACK  ' + empty + ' ROWS', empty * 10 * n]);
        if (this.stageMaxCombo > 0) this.tally.push(['BEST COMBO  ' + this.stageMaxCombo, this.stageMaxCombo * 250]);
        if (this.attempt === 0) this.tally.push(['NO STACK LOST', 500 * n]);
        if (st.final) this.tally.push(['STACKS LEFT  ' + this.stacks, this.stacks * 5000]);
        this.tallyShown = 0; this.tallyTotal = 0;
        this.p = Phase.Tally; this.phaseTime = 0;
        this._cues.emit(SoundCue.Bonus);
        this._emit('stageClear', { stage: n, final: st.final });
    }

    _addScore(v) {
        this._score += v;
        while (this._score >= this.nextExtra) {
            this.nextExtra += this.extraEvery;
            if (this.stacks >= this.maxStacks) continue;
            this.stacks++; this.extras++;
            this.extraShownAt = this._time;
            this._cues.emit(SoundCue.Bonus);
            this._emit('extra', { stacks: this.stacks });
        }
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

    // where the piece would come to rest (the renderer's ghost)
    landingY() {
        let y = this.y;
        while (this.fits(this.kind, this.rot, this.x, y + 1)) y++;
        return y;
    }

    _move(dx) {
        if (!this.fits(this.kind, this.rot, this.x + dx, this.y)) return false;
        this.x += dx;
        this._emit('shift');
        return true;
    }

    _turn(dir) {
        if (this.kind === Tetromino.O) return false;
        const nr = (this.rot + dir + 4) & 3;
        const kicks = this.kind === Tetromino.I ? KicksI : Kicks;
        let ok = false;
        for (let i = 0; i < kicks.length && !ok; i++)
            if (this.fits(this.kind, nr, this.x + kicks[i], this.y)) { this.x += kicks[i]; ok = true; }
        // one kick up off the floor (twice a piece at most, so it cannot climb the well)
        if (!ok && this._kickUps < 2 && this.fits(this.kind, nr, this.x, this.y - 1)) { this.y--; this._kickUps++; ok = true; }
        if (!ok) return false;
        this.rot = nr;
        this._cues.emit(SoundCue.Tick);
        this._emit('turn', { dir });
        return true;
    }

    _spawnX() { return this.wellL + ((this.wellWidth - 4) >> 1); }

    _spawn() {
        this.kind = this.nextKind; this.bombCell = this.nextBomb;
        this.nextKind = this._fromBag(); this.nextBomb = this._rollBomb();
        this.rot = 0; this.x = this._spawnX(); this.y = this.SpawnY;
        this.hasPiece = true;
        this.pieceSerial++;
        this._fallAcc = 0; this.lockTime = 0; this._dasT = 0; this._dasDir = 0; this._kickUps = 0;
        if (!this.fits(this.kind, this.rot, this.x, this.y)) { this.blockOut = true; this._topOut(); return; }
        this.p = Phase.Falling; this.phaseTime = 0;
    }

    _hardDrop() {
        const y0 = this.y;
        while (this.fits(this.kind, this.rot, this.x, this.y + 1)) this.y++;
        const rows = this.y - y0;
        this.hardDrops++;
        this._addScore(2 * rows);
        this.bumpAt = this._time;
        this._fx('drop', this.x, y0, rows, this.kind * 4 + this.rot);
        this._emit('drop', { rows });
        this._lock(true);
    }

    _lock(hard) {
        const c = Tetromino.Cells[this.kind][this.rot];
        for (let i = 0; i < 4; i++) {
            const x = this.x + c[i * 2], y = this.y + c[i * 2 + 1];
            if (y >= 0 && y < this.Rows) this.grid[y * this.W + x] = i === this.bombCell ? Block.Bomb : this.kind + 1;
        }
        this.hasPiece = false;
        this.piecesPlaced++;
        this.shapeCounts[this.kind]++;
        this.peakHeight = Math.max(this.peakHeight, this.stackHeight);
        this._cues.emit(SoundCue.Hit);
        this._fx('lock', this.x, this.y, 0, this.kind * 4 + this.rot);
        if (!hard) this._emit('lock', { bomb: this.bombCell >= 0 });

        this._findFull();
        if (this.clearRows.length > 0) { this._beginClear(false); return; }
        this.combo = -1;
        this._afterSettle();
    }

    _findFull() {
        this.clearRows.length = 0;
        for (let y = 0; y < this.Rows; y++) {
            let full = true, any = false;
            for (let x = 0; x < this.W && full; x++) {
                const v = this.grid[y * this.W + x];
                if (v === 0) full = false; else if (v !== Block.Iron) any = true;
            }
            if (full && any) this.clearRows.push(y);
        }
    }

    // full rows go: their bombs go off (a 3 x 3 each; a bomb a blast takes goes off too), gold in them or
    // in a blast is dug out, and the score, the combo and the stage's goal count it all
    _beginClear(squeezed) {
        const W = this.W, g = this.grid, st = this.stageDef, n = this.clearRows.length;
        const b = this.blast, q = this._queue;
        b.fill(0); q.length = 0;
        let bombs = 0, gold = 0, blasted = 0;
        for (const y of this.clearRows)
            for (let x = 0; x < W; x++) {
                const i = y * W + x;
                b[i] = 2;
                if (g[i] === Block.Bomb) q.push(i); else if (g[i] === Block.Gold) { gold++; this._fx('gold', x, y); }
            }
        while (q.length > 0) {
            const i = q.pop(), bx = i % W, by = (i - bx) / W;
            bombs++;
            this._fx('blast', bx, by, bombs);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const x = bx + dx, y = by + dy;
                    if (x < 0 || x >= W || y < 0 || y >= this.Rows) continue;
                    const j = y * W + x;
                    if (b[j] !== 0 || g[j] === 0 || g[j] === Block.Iron) continue;
                    b[j] = 1; blasted++;
                    if (g[j] === Block.Bomb) q.push(j); else if (g[j] === Block.Gold) { gold++; this._fx('gold', x, y); }
                }
        }

        const lvl = this.stage;
        const attack = n >= 4;
        const b2b = attack && this.b2bReady;
        let pts = LinePoints[Math.min(4, n)] * lvl;
        if (b2b) { pts = Math.trunc(pts * 3 / 2); this.b2bs++; }
        this.b2bReady = attack ? true : false;
        if (!squeezed) {
            this.combo++;
            this.stageMaxCombo = Math.max(this.stageMaxCombo, this.combo);
            this.maxCombo = Math.max(this.maxCombo, this.combo);
        }
        const comboPts = !squeezed && this.combo > 0 ? 50 * this.combo * lvl : 0;
        const total = pts + comboPts + bombs * 100 * lvl + blasted * 10 + gold * 1000 * lvl;
        this._addScore(total);

        this.lines += n; this.stageLines += n;
        this.clearsBy[Math.min(4, n)]++;
        this.bombsSet += bombs; this.goldDug += gold;
        this.progress += st.goal === Goal.Bombs ? bombs : st.goal === Goal.Gold ? gold : n;
        if (st.squeeze > 0 && this.wellWidth > st.minWidth) {
            const was = this.squeezeIn;
            this.squeezeIn -= n;
            if (this.squeezeIn <= 0) { this._squeezePending = true; this.squeezeIn += st.squeeze; }
            else if (this.squeezeIn === 1 && was > 1) this._emit('squeezeWarn');
        }
        this._updateFall();

        this.lastClearCount = n; this.lastClearPoints = total; this.lastClearAt = this._time;
        this.lastB2b = b2b; this.lastCombo = squeezed ? 0 : this.combo; this.lastBombs = bombs; this.lastGold = gold; this.lastSqueezed = squeezed;
        for (const y of this.clearRows) this._fx('row', 0, y, n);
        this._fx('pop', 0, this.clearRows[0], total);
        if (attack || bombs > 0) { this.shakeAt = this._time; this.shakeAmp = attack ? 3 : 2; }

        this._cues.emit(SoundCue.Bonus);
        this._emit('lines', { n, b2b, squeezed, final: st.final });
        if (!squeezed && this.combo > 0) this._emit('combo', { n: this.combo });
        if (bombs > 0) this._emit('bomb', { n: bombs });
        if (gold > 0) this._emit('gold', { n: gold });
        this.p = Phase.Clearing; this.phaseTime = 0;
    }

    // the lock (and its clears) is resolved: the stage's goal, the squeeze, top out over the ceiling, or the next piece
    _afterSettle() {
        if (this.progress >= this.target) { this._stageClear(); return; }
        if (this._squeezePending) { this._squeezePending = false; if (this._squeeze()) return; }
        for (let y = 0; y < this.topLimit; y++)
            for (let x = this.wellL; x <= this.wellR; x++) {
                const v = this.grid[y * this.W + x];
                if (v !== 0 && v !== Block.Iron) { this.blockOut = false; this._topOut(); return; }
            }
        const near = this.stackTop < this.topLimit + this.dangerRows;
        if (near && !this.dangerOn) this._emit('danger');
        this.dangerOn = near;
        this._spawn();
    }

    _collapse() {
        const W = this.W, g = this.grid;
        for (let i = 0; i < g.length; i++) if (this.blast[i] === 1) g[i] = 0;
        // drop every row above each cleared row; clearRows is ascending (top first)
        for (const row of this.clearRows) {
            g.copyWithin(W, 0, row * W);
            this._blankRow(0);
        }
        this.clearRows.length = 0;
        this.blast.fill(0);
        this.boardSerial++;
    }

    _topOut() {
        this.hasPiece = this.hasPiece && this.blockOut;                    // a blocked piece stays on screen, jammed at the top
        this.combo = -1; this.b2bReady = false; this.dangerOn = false;
        if (this.credit.unlosable) { this.p = Phase.WellClear; this.mercyClears++; this._cues.emit(SoundCue.Miss); this._emit('wellClear'); }
        else {
            this.stacks--; this.topOuts++;
            this.p = Phase.TopOut; this._cues.emit(SoundCue.Die);
            this._emit('topOut', { left: this.stacks });
        }
        this.phaseTime = 0;
    }

    _enterResult(r) {
        this._result = r;
        this.hasPiece = false;
        this.p = Phase.Result; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    _fx(k, x, y, v, a) {
        if (this.fx.length >= FxMax) this.fx.shift();
        this.fx.push({ k, x, y, v: v || 0, a: a || 0, t: this._time, s: this._fxSerial++ });
    }

    // ------------------------------------------------------------------ the step
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        if (this.p !== Phase.Result) this.stageSecs[this.stage] += dt;
        const down = input != null && input.held(Pad.Down);
        if (!down) this._softBlocked = false;                     // soft drop needs a fresh push for every piece

        switch (this.p) {
            case Phase.Card:
                if (!this._goSaid && this.phaseTime >= f32(this.cardSeconds - this.goSeconds)) { this._goSaid = true; this._cues.emit(SoundCue.Start); this._emit('go', { stage: this.stage }); }
                if (this.phaseTime >= this.cardSeconds) this._spawn();
                break;

            case Phase.Falling:
                this._falling(dt, input, down);
                if (this.p === Phase.Falling) this._floodTick(dt);
                break;

            case Phase.Clearing:
                if (this.phaseTime >= this.clearSeconds) { this._collapse(); this._afterSettle(); }
                break;

            case Phase.TopOut:
                if (this.phaseTime >= this.topOutSeconds) {
                    if (this.stacks > 0) this._startStage(this.stage, true);
                    else this._enterResult(RoundResult.Lost);
                }
                break;

            case Phase.WellClear:
                if (this.phaseTime >= this.wellClearSeconds) {
                    this.hasPiece = false; this.blockOut = false;
                    this._layWell(this.stageDef.goal === Goal.Gold ? Math.max(0, this.target - this.progress) : this.stageDef.gold.length);
                    this.floodT = this.floodEvery = this._floodSeconds(); this.floodWarned = false;
                    this._spawn();
                }
                break;

            case Phase.Tally:
                while (this.tallyShown < this.tally.length && this.phaseTime >= f32(this.tallyFirst + this.tallyShown * this.tallyStep)) {
                    const v = this.tally[this.tallyShown][1];
                    this.tallyShown++; this.tallyTotal += v;
                    this._addScore(v);
                    this._cues.emit(SoundCue.Tick);
                    this._emit('tally', { i: this.tallyShown, last: this.tallyShown === this.tally.length });
                }
                if (this.tallyShown >= this.tally.length && this.phaseTime >= f32(this.tallyFirst + (this.tally.length - 1) * this.tallyStep + this.tallyHold)) {
                    if (this.stageDef.final) this._enterResult(RoundResult.Won);
                    else this._startStage(this.stage + 1, false);
                }
                break;

            case Phase.Result:
                if (this.phaseTime >= this.resultSeconds) this.p = Phase.Over;
                break;
        }
    }

    _falling(dt, input, down) {
        let drop = false;
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
            drop = input.pressed(Pad.Up) && !down;
        }
        if (drop) { this._hardDrop(); return; }

        const soft = down && !this._softBlocked && this.softRate > this.fallRate;
        this._fallAcc = f32(this._fallAcc + f32((soft ? this.softRate : this.fallRate) * dt));
        while (this._fallAcc >= 1) {
            if (this.fits(this.kind, this.rot, this.x, this.y + 1)) {
                this.y++; this._fallAcc = f32(this._fallAcc - 1); this.lockTime = 0;
                if (soft) { this._addScore(1); this._softCells++; }
            } else { this._fallAcc = 0; break; }
        }

        if (!this.fits(this.kind, this.rot, this.x, this.y + 1)) {
            this.lockTime = f32(this.lockTime + dt);
            if (this.lockTime >= this.lockDelay || soft) {
                if (down) this._softBlocked = true;
                this._lock(false);
            }
        } else this.lockTime = 0;
    }

    collectStats(into) {
        add(into, 'stages', this.stagesCleared);
        add(into, 'pieces', this.piecesPlaced);
        add(into, 'lines', this.lines);
        add(into, 'x1', this.clearsBy[1]);
        add(into, 'x2', this.clearsBy[2]);
        add(into, 'x3', this.clearsBy[3]);
        add(into, 'x4', this.clearsBy[4]);
        add(into, 'b2b', this.b2bs);
        add(into, 'combo', this.maxCombo);
        add(into, 'bombs', this.bombsSet);
        add(into, 'gold', this.goldDug);
        add(into, 'floods', this.floods);
        add(into, 'squeezes', this.squeezes);
        add(into, 'tops', this.topOuts);
        add(into, 'extras', this.extras);
        add(into, 'hard', this.hardDrops);
        add(into, 'peak', this.peakHeight);
        add(into, 'mercyClears', this.mercyClears);
        for (let i = 1; i <= this.stages; i++) add(into, 's' + i + 'secs', this.stageSecs[i]);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }
