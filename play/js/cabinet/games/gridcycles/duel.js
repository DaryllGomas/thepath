// THE NODE · world 1 · GRID CYCLES '82 on the Cabinet Engine · ONE DUEL's rules (port of GridCyclesDuel.cs).
//
// A top-down light-cycle duel on a W x H cell grid. Two cycles step one cell at a time at their own
// speed (cells per second), each leaving a solid wall in every cell it has occupied. Moving into any
// wall (either trail, or off the arena edge) derezzes you. Both into the same cell on the same step =
// both derez (a draw; the duel is replayed).
// choose() takes an optional SystemRandom, so a BOT can use the rival's brain without drawing from the
// duel's own dice (a bot must never change the game it is measuring).
// Floats are C# floats: f32() everywhere, so a seed plays the same duel as in the C# CabinetLab.
import { f32, SystemRandom } from '../../sdk/index.js';

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];                              // screen space: y grows DOWN

function newCycle() { return { x: 0, y: 0, dir: 0, speed: 0, acc: 0, alive: false }; }

export class GridCyclesDuel {
    constructor(w, h, seed) {
        this.W = w; this.H = h;
        this.cells = new Uint8Array(w * h);
        this.seq = new Int32Array(w * h);              // step index of each wall cell per owner (drawing joins consecutive cells)
        this._stamp = new Int32Array(w * h); this._stampId = 0;
        this._bfs = new Int32Array(w * h);
        this._pSeq = 0; this._rSeq = 0;
        this.player = newCycle(); this.rival = newCycle();

        // --- rules knobs, set by the round each duel ---
        this.playerAssist = false;                     // mercy credit: the player's cycle cannot crash
        this.rivalBlind = false;                       // mercy credit: the rival never steers
        this.rivalLapse = f32(0.10);                   // chance per step the rival only checks the cell in front
        this.rivalWander = f32(0.02);                  // chance per step of a voluntary turn into open space
        this.rivalAreaCap = 140;                       // how far the rival's flood fill looks for room

        this.playerTurns = [];                         // absolute directions, oldest first (C# Queue<int>)
        this.playerStalls = 0;                         // assist-mode steps the player sat still (boxed in)

        this._rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
    }

    static reverse(d) { return (d + 2) & 3; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
    free(x, y) { return this.inBounds(x, y) && this.cells[y * this.W + x] === GridCyclesDuel.Empty; }
    cell(x, y) { return this.inBounds(x, y) ? this.cells[y * this.W + x] : -1; }

    // Parallel lanes, facing opposite ways: no head-on opening (the Unreal build's lesson).
    resetDuel(playerSpeed, rivalSpeed) {
        const W = this.W, H = this.H;
        this.cells.fill(0);
        this.playerTurns.length = 0;
        this.playerStalls = 0;
        this.player = { x: Math.trunc(W / 4), y: H - 8, dir: GridCyclesDuel.Up, speed: f32(playerSpeed), acc: 0, alive: true };
        this.rival = { x: W - 1 - Math.trunc(W / 4), y: 7, dir: GridCyclesDuel.Down, speed: f32(rivalSpeed), acc: 0, alive: true };
        this.seq.fill(0);
        this._pSeq = this._rSeq = 1;
        this.cells[this.player.y * W + this.player.x] = GridCyclesDuel.PlayerCell; this.seq[this.player.y * W + this.player.x] = 1;
        this.cells[this.rival.y * W + this.rival.x] = GridCyclesDuel.RivalCell; this.seq[this.rival.y * W + this.rival.x] = 1;
    }

    // Advance by dt seconds. speedMul is the shared ramp. Returns the first decisive outcome.
    tick(dt, speedMul) {
        const p = this.player, r = this.rival, O = GridCyclesDuel.Outcome;
        p.acc = f32(p.acc + f32(f32(p.speed * speedMul) * dt));
        r.acc = f32(r.acc + f32(f32(r.speed * speedMul) * dt));
        let guard = 0;
        while ((p.acc >= 1 || r.acc >= 1) && guard++ < 64) {
            let sp = p.acc >= 1, sr = r.acc >= 1;
            // whoever is further ahead in its own step moves first; near-equal = the same instant
            if (sp && sr) {
                if (p.acc >= f32(r.acc + 0.5)) sr = false;
                else if (r.acc >= f32(p.acc + 0.5)) sp = false;
            }
            const o = this._step(sp, sr);
            if (sp) p.acc = f32(p.acc - 1);
            if (sr) r.acc = f32(r.acc - 1);
            if (o !== O.None) return o;
        }
        return O.None;
    }

    _step(sp, sr) {
        const W = this.W, player = this.player, rival = this.rival, O = GridCyclesDuel.Outcome;
        let pnx = 0, pny = 0, rnx = 0, rny = 0;
        let pMove = false, rMove = false, pCrash = false, rCrash = false;

        if (sp) {
            while (this.playerTurns.length > 0) {
                const d = this.playerTurns.shift();
                if (d === player.dir || d === GridCyclesDuel.reverse(player.dir)) continue;   // no-ops and 180s
                player.dir = d; break;                                                       // one turn per cell
            }
            if (this.playerAssist && !this.free(player.x + DX[player.dir], player.y + DY[player.dir]))
                player.dir = this.choose(player, 1, 0, this.rivalAreaCap);
            pnx = player.x + DX[player.dir]; pny = player.y + DY[player.dir];
            if (this.free(pnx, pny)) pMove = true;
            else if (this.playerAssist) this.playerStalls++;                                 // boxed in: sit still, never derez
            else pCrash = true;
        }
        if (sr) {
            if (!this.rivalBlind) rival.dir = this.choose(rival, f32(1 - this.rivalLapse), this.rivalWander, this.rivalAreaCap);
            rnx = rival.x + DX[rival.dir]; rny = rival.y + DY[rival.dir];
            if (this.free(rnx, rny)) rMove = true; else rCrash = true;
        }
        if (pMove && rMove && pnx === rnx && pny === rny) {
            if (this.playerAssist) { pMove = false; this.playerStalls++; rCrash = true; rMove = false; }
            else { pCrash = true; rCrash = true; pMove = rMove = false; }
        }
        if (pMove) { player.x = pnx; player.y = pny; this.cells[pny * W + pnx] = GridCyclesDuel.PlayerCell; this.seq[pny * W + pnx] = ++this._pSeq; }
        if (rMove) { rival.x = rnx; rival.y = rny; this.cells[rny * W + rnx] = GridCyclesDuel.RivalCell; this.seq[rny * W + rnx] = ++this._rSeq; }

        if (pCrash) player.alive = false;
        if (rCrash) rival.alive = false;
        if (pCrash && rCrash) return O.Both;
        if (pCrash) return O.PlayerDerez;
        if (rCrash) return O.RivalDerez;
        return O.None;
    }

    // ------------------------------------------------------------------ steering
    // The rival's brain (also the mercy assist and the bot). `care` = chance this step looks at room
    // (flood fill) rather than just the next cell. `dice` = whose SystemRandom rolls (null = the duel's).
    choose(c, care, wander, areaCap, dice = null) {
        const r = dice || this._rng;
        const s = c.dir, l = (c.dir + 3) & 3, rt = (c.dir + 1) & 3;
        const fs = this.free(c.x + DX[s], c.y + DY[s]);
        const fl = this.free(c.x + DX[l], c.y + DY[l]);
        const fr = this.free(c.x + DX[rt], c.y + DY[rt]);

        if (r.nextDouble() >= care) {
            // a lapse: only the cell in front counts
            if (fs) return s;
            if (fl && fr) return r.nextDouble() < 0.5 ? l : rt;
            return fl ? l : (fr ? rt : s);
        }

        const aS = fs ? this.area(c.x + DX[s], c.y + DY[s], areaCap) : -1;
        const aL = fl ? this.area(c.x + DX[l], c.y + DY[l], areaCap) : -1;
        const aR = fr ? this.area(c.x + DX[rt], c.y + DY[rt], areaCap) : -1;
        const best = Math.max(aS, Math.max(aL, aR));
        if (best < 0) return s;                                                              // nowhere to go

        const runS = fs ? this.run(c.x, c.y, s, 6) : 0;
        if (fs && aS >= best && runS >= 2) {
            if (wander > 0 && r.nextDouble() < wander) {
                const side = r.nextDouble() < 0.5 ? l : rt;
                const aSide = side === l ? aL : aR;
                if (aSide >= best && this.run(c.x, c.y, side, 6) >= 3) return side;
            }
            return s;
        }
        // pick the roomiest; ties go to the longer straight run
        let pick = s, pickA = aS, pickR = fs ? runS : -1;
        const rl = fl ? this.run(c.x, c.y, l, 6) : -1, rr = fr ? this.run(c.x, c.y, rt, 6) : -1;
        if (aL > pickA || (aL === pickA && rl > pickR)) { pick = l; pickA = aL; pickR = rl; }
        if (aR > pickA || (aR === pickA && rr > pickR) || (aR === pickA && rr === pickR && r.nextDouble() < 0.5)) { pick = rt; pickA = aR; pickR = rr; }
        return pick;
    }

    run(x, y, d, max) {
        let n = 0;
        for (let i = 1; i <= max; i++) { if (!this.free(x + DX[d] * i, y + DY[d] * i)) break; n++; }
        return n;
    }

    area(sx, sy, cap) {
        if (!this.free(sx, sy)) return 0;
        this._stampId++;
        if (this._stampId === 2147483647) { this._stamp.fill(0); this._stampId = 1; }
        const W = this.W, stamp = this._stamp, bfs = this._bfs, cells = this.cells, id = this._stampId;
        let head = 0, tail = 0, n = 0;
        const si = sy * W + sx;
        stamp[si] = id; bfs[tail++] = si;
        while (head < tail && n < cap) {
            const i = bfs[head++]; n++;
            const x = i % W, y = Math.trunc(i / W);
            for (let d = 0; d < 4; d++) {
                const nx = x + DX[d], ny = y + DY[d];
                if (!this.inBounds(nx, ny)) continue;
                const ni = ny * W + nx;
                if (cells[ni] !== GridCyclesDuel.Empty || stamp[ni] === id) continue;
                stamp[ni] = id; bfs[tail++] = ni;
            }
        }
        return n;
    }

    static stepX(d) { return DX[d]; }
    static stepY(d) { return DY[d]; }
}

GridCyclesDuel.Empty = 0; GridCyclesDuel.PlayerCell = 1; GridCyclesDuel.RivalCell = 2;
GridCyclesDuel.Up = 0; GridCyclesDuel.Right = 1; GridCyclesDuel.Down = 2; GridCyclesDuel.Left = 3;
GridCyclesDuel.Outcome = Object.freeze({ None: 0, PlayerDerez: 1, RivalDerez: 2, Both: 3 });
