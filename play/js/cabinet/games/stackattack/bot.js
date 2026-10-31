// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE BOT: a modelled average player.
// Began as a port of StackAttackBot.cs (Staging/Batch2/stackattack); built out on 2026-10-18 to play the
// whole six-stage game (the walls, the flood, the gold, the hard drop).
//
// When a new piece enters (or the well changes under it: a row rises, a wall steps in), it scores every
// rotation x column the piece can reach by where it would come to rest: the resulting stack height (the
// sum of the column heights, plus how ragged the top is), the holes it leaves covered and the rows it
// completes (weights after the well-known Lee tuning: 0.51 height, 0.18 bumpiness, -0.76 per row, with
// holes raised from 0.36 to 0.7 so it keeps the dig's shaft open), counted only between the walls; a gold block dug out is worth a lot. A resting place above the
// ceiling costs everything. It takes the lowest cost, except when it MISPLACES the piece: then it takes one
// of the 2nd-6th best spots instead (a misread of the stack, the average player's mistake).
//
// THE TUNING VALUE, the misplacement chance per piece:
//   p = min(0.9, Error x (Comfort / t) ^ Pressure)     Error 0.24, Comfort 3.0 s, Pressure 1.5
// where t = the seconds the piece would take to fall to the best spot and lock with nothing pressed
// (rows to fall / fall rate + lock delay). A person misreads more when the piece comes fast or the stack
// is close, so the stages' climbing fall rate is what makes the late stages hard for it; the mercy reaches
// it where it reaches a person: a slower fall (x0.9 a loss) and the +2 rows of ceiling both buy time, and
// time buys fewer mistakes. On the fifth credit's walk p falls to a few per cent.
//
// It plays through the panel at a human pace: 0.30-0.65 s to read each new piece, one tap every 0.10 s
// (turns first, A clockwise / B counter-clockwise, then slides), 0-0.25 s of settling, then it holds the
// stick down (soft drop) or, four times in five when the stack is low, pushes UP (the hard drop). Its dice are
// its own (CabinetBotBase.rng).
import { f32, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { StackAttackSim, Tetromino, Block } from './sim.js';

const W = 10, Rows = 22;
const Phase = StackAttackSim.Phase;

export class StackAttackBot extends CabinetBotBase {
    constructor() {
        super();
        this.error = 0.24;
        this.comfort = f32(3.0);                            // seconds of fall at which the chance is exactly error
        this.pressure = 1.5;                                // how hard the chance climbs as the time shrinks
        this.maxError = 0.9;
        this.misplaceFrom = 2; this.misplaceTo = 6;         // ranks (1 = best) a misplaced piece picks from
        this.thinkMin = f32(0.30); this.thinkMax = f32(0.65);
        this.tapGap = f32(0.10);
        this.settleMax = f32(0.25);
        this.hardDropChance = 0.8;                          // when the stack is low: push UP instead of holding DOWN
        this.wHeight = 0.51; this.wHoles = 0.7; this.wBump = 0.18; this.wLines = 0.76; this.wGold = 4.0;

        this.board = new Uint8Array(W * Rows);
        this.work = new Uint8Array(W * Rows);
        this.heights = new Int32Array(W);
        this.cands = [];
        this.seen = new Set();

        this.serial = -1; this.boardSerial = -1; this.targetRot = 0; this.targetX = 0; this.lastTapX = -2147483648; this.lastTapRot = -1; this.noProgress = 0;
        this.thinkLeft = 0; this.cooldown = 0; this.settle = 0; this.hard = false;

        this.misplaced = 0;             // pieces it deliberately misplaced (for the tuning log)
        this.lastErrorChance = 0;
    }

    get name() { return 'sa-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.serial = -1; this.boardSerial = -1; this.noProgress = 0; this.misplaced = 0;
    }

    think(sim, dt) {
        const g = sim;
        if (g == null || g.p !== Phase.Falling || !g.hasPiece) return InputFrame.neutral;
        if (g.pieceSerial !== this.serial) {
            this.serial = g.pieceSerial; this.boardSerial = g.boardSerial;
            this._plan(g, true);
            this.thinkLeft = this.range(this.thinkMin, this.thinkMax);
            this.settle = this.range(0, this.settleMax);
            this.hard = g.stackTop > g.topLimit + 8 && this.chance(this.hardDropChance);
            this.cooldown = 0; this.noProgress = 0; this.lastTapX = -2147483648; this.lastTapRot = -1;
        } else if (g.boardSerial !== this.boardSerial) {
            this.boardSerial = g.boardSerial;                // a row rose or a wall moved: look again (no new misread)
            this._plan(g, false);
            this.noProgress = 0;
        }
        if (this.thinkLeft > 0) { this.thinkLeft = f32(this.thinkLeft - dt); return InputFrame.neutral; }
        this.cooldown = f32(this.cooldown - dt);

        const dr = (this.targetRot - g.rot + 4) & 3;
        const dx = this.targetX - g.x;
        if ((dr !== 0 || dx !== 0) && this.noProgress < 3) {
            if (this.cooldown > 0) return InputFrame.neutral;
            this.cooldown = this.tapGap;
            if (g.x === this.lastTapX && g.rot === this.lastTapRot) this.noProgress++; else this.noProgress = 0;
            this.lastTapX = g.x; this.lastTapRot = g.rot;
            if (dr !== 0) return this._press(dr !== 3);
            return this.tap(dx > 0 ? Dir4.Right : Dir4.Left);
        }
        if (this.settle > 0) { this.settle = f32(this.settle - dt); return InputFrame.neutral; }
        if (this.hard) return this.tap(Dir4.Up);
        return InputFrame.stick(Dir4.Down);
    }

    _press(a) {
        if (a ? this.lastFrame.a : this.lastFrame.b) return InputFrame.neutral;     // never held two steps: always an edge
        return a ? new InputFrame(0, 0, true, false, false) : new InputFrame(0, 0, false, true, false);
    }

    // ------------------------------------------------------------------ choosing a spot
    _plan(g, fresh) {
        g.copyGrid(this.board);
        this.cands.length = 0; this.seen.clear();
        const kind = g.kind, rots = kind === Tetromino.O ? 1 : 4;
        for (let rot = 0; rot < rots; rot++) {
            if (!g.fits(kind, rot, g.x, g.y)) continue;
            for (let x = -3; x < W; x++) {
                if (!reachable(g, kind, rot, x)) continue;
                let y = g.y;
                while (g.fits(kind, rot, x, y + 1)) y++;
                const key = keyOf(kind, rot, x, y);
                if (this.seen.has(key)) continue;
                this.seen.add(key);
                this.cands.push({ rot, x, restY: y, cost: this._cost(kind, rot, x, y, g.topLimit, g.wellL, g.wellR), key });
            }
        }
        if (this.cands.length === 0) { this.targetRot = g.rot; this.targetX = g.x; return; }
        this.cands.sort((a, b) => a.cost !== b.cost ? a.cost - b.cost : a.key - b.key);
        let pick = 0;
        if (fresh) {
            // time until the best spot's piece would lock if nothing were pressed: short time, more mistakes
            const avail = f32(f32((this.cands[0].restY - g.y) / Math.max(f32(0.01), g.fallRate)) + g.lockDelay);
            const p = Math.min(this.maxError, this.error * Math.pow(f32(this.comfort / f32(Math.max(f32(0.05), avail))), this.pressure));
            this.lastErrorChance = p;
            if (this.cands.length > 1 && this.chance(p)) {
                const lo = Math.min(this.misplaceFrom - 1, this.cands.length - 1), hi = Math.min(this.misplaceTo, this.cands.length);
                pick = lo + this.rng.next(Math.max(1, hi - lo));
                // a misread never walks it over the ceiling on purpose
                if (this.cands[pick].cost >= 1e5) pick = 0; else this.misplaced++;
            }
        }
        this.targetRot = this.cands[pick].rot; this.targetX = this.cands[pick].x;
    }

    _cost(kind, rot, px, py, topLimit, L, R) {
        this.work.set(this.board);
        const c = Tetromino.Cells[kind][rot];
        for (let i = 0; i < 4; i++) {
            const y = py + c[i * 2 + 1];
            if (y >= 0) this.work[y * W + px + c[i * 2]] = 1;
        }
        // clear full rows (the iron walls count as filled), and count the gold they free
        let lines = 0, gold = 0;
        for (let y = Rows - 1; y >= 0; y--) {
            let full = true;
            for (let x = 0; x < W && full; x++) if (this.work[y * W + x] === 0) full = false;
            if (!full) continue;
            lines++;
            for (let x = L; x <= R; x++) if (this.work[y * W + x] === Block.Gold) gold++;
            for (let yy = y; yy > 0; yy--) this.work.copyWithin(yy * W, (yy - 1) * W, yy * W);
            this.work.fill(0, 0, W);
            for (let x = 0; x < W; x++) if (x < L || x > R) this.work[x] = Block.Iron;
            y++;                                            // look at this row again: it has new contents
        }
        let agg = 0, holes = 0, bump = 0, over = false;
        for (let x = L; x <= R; x++) {
            let h = 0;
            for (let y = 0; y < Rows; y++)
                if (this.work[y * W + x] !== 0) {
                    if (h === 0) { h = Rows - y; if (y < topLimit) over = true; }
                } else if (h > 0) holes++;
            this.heights[x] = h;
            agg += h;
        }
        for (let x = L; x < R; x++) bump += Math.abs(this.heights[x] - this.heights[x + 1]);
        const cost = this.wHeight * agg + this.wHoles * holes + this.wBump * bump - this.wLines * lines - this.wGold * gold;
        return over ? cost + 1e6 : cost;
    }
}

function reachable(g, kind, rot, x) {
    const step = x > g.x ? 1 : -1;
    for (let cx = g.x; ; cx += step) {
        if (!g.fits(kind, rot, cx, g.y)) return false;
        if (cx === x) return true;
    }
}

function keyOf(kind, rot, x, y) {
    const c = Tetromino.Cells[kind][rot];
    const idx = new Array(4);
    for (let i = 0; i < 4; i++) idx[i] = (y + c[i * 2 + 1]) * W + x + c[i * 2];
    idx.sort((a, b) => a - b);
    let k = 0;
    for (let i = 0; i < 4; i++) k = k * 256 + (idx[i] + 16);
    return k;
}
