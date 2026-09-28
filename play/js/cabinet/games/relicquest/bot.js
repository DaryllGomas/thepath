// THE NODE · world 1 · RELIC QUEST on the Cabinet Engine · THE BOT: a modelled average player.
// Its eye is Unity's RelicQuestSim.BotDir ("the explorer's eye"), with a person's limits on top.
//
// It HOLDS a stick direction and looks again every `reaction` s (+ up to `jitter`). Each look:
//   notice  0.85   chance it registers the snakes at all this look (else it just heads for the gem)
//   margin  2      tiles of room it wants between its route and a snake's reach
//   sword   0.55   chance it swings when a snake head is lined up in front, inside `swingAt` tiles
//   panic   0.75   chance it lights a torch when a snake is close and it sees no safe way out
//   slip    0.03   chance it holds a wrong direction for one look, like people do
// Shortest path to the nearest gem (or the relic), steering round tiles a snake could reach first;
// with no safe route it backs away to the neighbour furthest from the snakes. Coiled or sleeping
// snakes are not a threat. Its dice are its own (this.rng); it only reads the maze.
import { f32, CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { GW, GH, RelicQuestMaze as M } from './maze.js';
import { RelicQuestRound } from './round.js';

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const Running = RelicQuestRound.Phase.Running;

export class RelicQuestBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = f32(0.18); this.jitter = f32(0.1);
        this.notice = 0.85; this.margin = 2;
        this.sword = 0.55; this.swingAt = f32(2.4);
        this.panic = 0.75; this.slip = 0.03;
        this._hold = -1; this._wait = 0;
        this._snake = new Int32Array(GW * GH); this._dist = new Int32Array(GW * GH);
        this._from = new Int32Array(GW * GH); this._q = new Int32Array(GW * GH);
    }

    get name() { return 'rq-average-player'; }

    reset(seed) { super.reset(seed); this._hold = -1; this._wait = 0; }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.maze == null || r.p !== Running) { this._hold = -1; this._wait = 0; return InputFrame.neutral; }
        this._wait = f32(this._wait - dt);
        if (this._wait > 0) return this._hold >= 0 ? InputFrame.stick(this._hold) : InputFrame.neutral;
        this._wait = f32(this.reaction + f32(this.jitter * f32(this.rng.nextDouble())));

        const m = r.maze;
        const sees = !m.snakesAsleep && this.rng.nextDouble() < this.notice;
        let a = false, b = false;
        if (sees && this._linedUp(m) && this.rng.nextDouble() < this.sword) a = true;
        let d = this._plan(m, sees);
        if (d === -2) {                                              // cornered
            if (m.torches > 0 && this.rng.nextDouble() < this.panic) b = true;
            d = this._flee(m);
        }
        if (this.rng.nextDouble() < this.slip) d = this.rng.next(4);
        this._hold = d;
        const f = d >= 0 ? InputFrame.stick(d) : InputFrame.neutral;
        f.a = a && !this.lastFrame.a;
        f.b = b && !this.lastFrame.b;
        return f;
    }

    // an awake snake's head straight in front, inside swingAt tiles, with open floor between
    _linedUp(m) {
        const k = m.knight, fdir = k.facing;
        const kx = M.px(k), ky = M.py(k);
        for (const s of m.snakes) {
            if (s.stun > 0) continue;
            const dx = f32(M.px(s) - kx), dy = f32(M.py(s) - ky);
            const along = dx * DX[fdir] + dy * DY[fdir];
            const lat = Math.abs(dx * DY[fdir] - dy * DX[fdir]);
            if (along < 0.3 || along > this.swingAt || lat > 0.5) continue;
            let clear = true;
            const n = Math.ceil(along);
            for (let i = 1; i < n && clear; i++) if (!m.open(M.nearX(k) + DX[fdir] * i, M.nearY(k) + DY[fdir] * i)) clear = false;
            if (clear) return true;
        }
        return false;
    }

    // the direction to hold now; -1 = nothing to do; -2 = no safe route (cornered)
    _plan(m, avoid) {
        const k = m.knight, snake = this._snake, dist = this._dist, from = this._from, q = this._q;
        snake.fill(999);
        let head = 0, tail = 0;
        if (avoid)
            for (const s of m.snakes) {
                if (s.stun > f32(0.6)) continue;                     // coiled: harmless for now
                tail = seed(m, snake, q, s.x, s.y, tail);
                if (s.dir >= 0) tail = seed(m, snake, q, s.x + DX[s.dir], s.y + DY[s.dir], tail);
            }
        while (head < tail) {
            const i = q[head++], x = i % GW, y = Math.trunc(i / GW);
            for (let d = 0; d < 4; d++) {
                const nx = x + DX[d], ny = y + DY[d];
                if (!m.open(nx, ny)) continue;
                const ni = ny * GW + nx;
                if (snake[ni] <= snake[i] + 1) continue;
                snake[ni] = snake[i] + 1; q[tail++] = ni;
            }
        }

        // the decision tile: where the knight is heading (or standing)
        const ox = k.dir >= 0 ? k.x + DX[k.dir] : k.x, oy = k.dir >= 0 ? k.y + DY[k.dir] : k.y;
        if (avoid && k.dir >= 0 && snake[oy * GW + ox] <= 1 && snake[k.y * GW + k.x] > snake[oy * GW + ox])
            return M.reverse(k.dir);                                  // a snake is right there: turn back

        dist.fill(-1); from.fill(-1);
        head = tail = 0;
        const o = oy * GW + ox; dist[o] = 0; q[tail++] = o;
        let found = -1;
        while (head < tail) {
            const i = q[head++], x = i % GW, y = Math.trunc(i / GW);
            if ((m.relicUp && x === m.relicX && y === m.relicY) || (!m.relicUp && m.gem[i])) { found = i; break; }
            for (let d = 0; d < 4; d++) {
                const nx = x + DX[d], ny = y + DY[d];
                if (!m.open(nx, ny)) continue;
                const ni = ny * GW + nx;
                if (dist[ni] >= 0) continue;
                if (avoid && snake[ni] <= this.margin && snake[ni] <= dist[i] + 2) continue;
                dist[ni] = dist[i] + 1; from[ni] = i; q[tail++] = ni;
            }
        }
        if (found < 0) return avoid ? -2 : -1;
        if (found === o) return k.dir >= 0 ? k.dir : -1;
        let step = found;
        while (from[step] !== o) step = from[step];
        const sx = step % GW - ox, sy = Math.trunc(step / GW) - oy;
        for (let d = 0; d < 4; d++) if (DX[d] === sx && DY[d] === sy) return d;
        return -1;
    }

    // no safe route: step to the neighbour of the decision tile furthest from any snake
    _flee(m) {
        const k = m.knight, snake = this._snake;
        const ox = k.dir >= 0 ? k.x + DX[k.dir] : k.x, oy = k.dir >= 0 ? k.y + DY[k.dir] : k.y;
        let bestD = k.dir, bestV = -1;
        for (let d = 0; d < 4; d++) {
            const nx = ox + DX[d], ny = oy + DY[d];
            if (!m.open(nx, ny)) continue;
            const v = snake[ny * GW + nx];
            if (v > bestV) { bestV = v; bestD = d; }
        }
        return bestD;
    }
}

function seed(m, snake, q, x, y, tail) {
    if (!m.open(x, y)) return tail;
    const i = y * GW + x;
    if (snake[i] === 0) return tail;
    snake[i] = 0; q[tail++] = i;
    return tail;
}

