// THE NODE · world 1 · GRID CYCLES '82 on the Cabinet Engine · THE BOT: a modelled average player
// (port of GridCyclesBot.cs).
//
// It only ever TAPS a stick direction, one decision per cell the cycle enters. Its dice are its own
// (this.rng), never the duel's.
//   notice   0.90  chance per cell that a wall inside its look-ahead is seen in time
//   reaction 0.25 s  look-ahead = speed x reaction + 1 cell
//   care     0.80  when it turns, chance it reads room (flood fill) rather than just the next cell
//   aggro    0.15  chance per cell with open road to go for the cut, a few cells ahead of the rival
//   and 2% a cell it cuts across for no reason, like people do.
import { f32, CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { GridCyclesDuel } from './duel.js';
import { GridCyclesRound } from './round.js';

export class GridCyclesBot extends CabinetBotBase {
    constructor() {
        super();
        this.notice = f32(0.9); this.reaction = f32(0.25); this.care = f32(0.8); this.aggro = f32(0.15);
        this.readArea = 90;
        this._lastX = -1; this._lastY = -1;
    }

    get name() { return 'gc-average-player'; }

    reset(seed) { super.reset(seed); this._lastX = this._lastY = -1; }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.duel == null || r.p !== GridCyclesRound.Phase.Running) { this._lastX = this._lastY = -1; return InputFrame.neutral; }
        const g = r.duel;
        const c = g.player;
        if (c.x === this._lastX && c.y === this._lastY) return InputFrame.neutral;   // one decision per cell
        this._lastX = c.x; this._lastY = c.y;
        const d = this._decide(g, f32(r.baseSpeed * r.speedMul));
        if (d < 0 || d === c.dir || d === GridCyclesDuel.reverse(c.dir)) return InputFrame.neutral;
        return this.tap(d);
    }

    _decide(g, speed) {
        const c = g.player;
        const look = Math.ceil(f32(speed * this.reaction)) + 1;
        const run = g.run(c.x, c.y, c.dir, look);
        if (run < look) {
            if (this.rng.nextDouble() > this.notice) return -1;                     // didn't see it this cell
            return g.choose(c, this.care, 0, this.readArea, this.rng);
        }
        // going for the cut: steer toward a point a few cells ahead of the rival
        if (this.rng.nextDouble() < this.aggro) {
            const rv = g.rival;
            const tx = rv.x + GridCyclesDuel.stepX(rv.dir) * 5, ty = rv.y + GridCyclesDuel.stepY(rv.dir) * 5;
            const dx = tx - c.x, dy = ty - c.y;
            const want = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? GridCyclesDuel.Right : GridCyclesDuel.Left)
                                                     : (dy > 0 ? GridCyclesDuel.Down : GridCyclesDuel.Up);
            if (want !== c.dir && want !== GridCyclesDuel.reverse(c.dir) && g.run(c.x, c.y, want, 5) >= 5
                && g.area(c.x + GridCyclesDuel.stepX(want), c.y + GridCyclesDuel.stepY(want), this.readArea) >= this.readArea)
                return want;
            return -1;
        }
        if (this.rng.nextDouble() < 0.02) {                                         // a player cutting across
            const side = this.rng.nextDouble() < 0.5 ? (c.dir + 1) & 3 : (c.dir + 3) & 3;
            if (g.run(c.x, c.y, side, 8) >= 8) return side;
        }
        return -1;
    }
}
