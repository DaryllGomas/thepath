// THE NODE · world 1 · TUNNEL RAT on the Cabinet Engine · THE BOT: a modelled average player.
// Port of TunnelRatBot.cs from Staging/Batch2/tunnelrat.
//
// It plays through the control panel only (stick + A), looking again every reactMin..reactMax
// seconds, with its own dice. In order of what it cares about:
//   1. pumping: a pest on the hose keeps A held (unless a live pest closes in and it notices)
//   2. fire: in a winding-up or burning lizard's row, it steps out of the line (notice)
//   3. rocks: under a wobbling or falling rock, it sidesteps (notice)
//   4. pump: a pest ALIGNED on its row/column and ADJACENT (pumpReach) with open tunnel between:
//      face it, hold A
//   5. a live pest closing in that it cannot pump: back off along the tunnel (notice); a ghost
//      drifting in: back off sometimes (ghostWary)
//   6. rock drop: a rock with a pest below it in the same open column: dig the tile under the rock
//      from the side, step back out, wait for it to drop
//   7. the carrot if it is close, else the nearest pest by the cheapest dug-or-diggable route
//      (Dial's shortest path over tiles: open 4, part-dug 5, earth 7; rocks are walls)
import { f32, roundEven, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { TunnelRatSim, TunnelField, RockState } from './sim.js';

const T = TunnelField.Tile, W = TunnelField.W, H = TunnelField.H;
const Phase = TunnelRatSim.Phase, HoseState = TunnelRatSim.HoseState;

function tileOf(x, y) {
    const tx = Math.max(0, Math.min(W - 1, Math.trunc(roundEven(x / T))));
    const ty = Math.max(0, Math.min(H - 1, Math.trunc(roundEven(y / T))));
    return ty * W + tx;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function dist(p, x, y) { return Math.abs(p.x - x) + Math.abs(p.y - y); }

function nearest(r, want) {
    let best = null, bd = Number.MAX_VALUE;
    for (const p of r.pests) {
        if (!want(p)) continue;
        const d = dist(p, r.dx, r.dy);
        if (d < bd) { bd = d; best = p; }
    }
    return best;
}

export class TunnelRatBot extends CabinetBotBase {
    constructor() {
        super();
        this.reactMin = f32(0.25); this.reactMax = f32(0.45);
        this.notice = f32(0.75);            // chance a look sees a threat in time
        this.pumpReach = f32(38);           // px between centres before it will pump
        this.brave = f32(0.35);             // chance it keeps pumping with a live pest closing in
        this.ghostWary = f32(0.35);         // chance it backs off from a ghost drifting in
        this.close = f32(26);               // px between centres that counts as "closing in"
        this.rockReach = 28;                // path cost it will travel for a rock drop
        this.square = f32(3);               // px off a tile line it will square up from to pump
        this.ambush = f32(44);              // px (Manhattan): a live pest this near and not in line, it waits
        this.ambushMax = f32(1.2);          // seconds it waits before it goes on digging

        this.hold = InputFrame.neutral;
        this.wait = 0; this.stuckT = 0;
        this.lastX = 0; this.lastY = 0;
        this.rockMode = 0;                  // 0 none, 1 to the side tile, 2 into the gap, 3 back out and wait
        this.rockTarget = null;
        this.rockSide = 0;
        this.rockT = 0; this.ambushT = 0;

        this.dist = new Int32Array(W * H);
        this.from = new Int32Array(W * H);
        this.buckets = [];
        for (let i = 0; i < 64; i++) this.buckets.push([]);
        this.wall = new Uint8Array(W * H);
    }

    get name() { return 'tr-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.hold = InputFrame.neutral; this.wait = 0; this.stuckT = 0; this.rockMode = 0; this.rockTarget = null; this.ambushT = 0;
    }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.p !== Phase.Play) { this.wait = 0; this.hold = InputFrame.neutral; this.rockMode = 0; return this.hold; }

        // stuck: pushing a direction and going nowhere
        const pushing = this.hold.x !== 0 || this.hold.y !== 0;
        if (pushing && !this.hold.a && Math.abs(r.dx - this.lastX) < 1e-3 && Math.abs(r.dy - this.lastY) < 1e-3) this.stuckT = f32(this.stuckT + dt);
        else this.stuckT = 0;
        this.lastX = r.dx; this.lastY = r.dy;
        if (this.stuckT > f32(0.6)) { this.stuckT = 0; this.hold = InputFrame.stick(this.rng.next(4)); this.wait = f32(0.3); this.rockMode = 0; return this.hold; }

        this.wait = f32(this.wait - dt);
        if (this.wait > 0) return this.hold;
        this.wait = this.range(this.reactMin, this.reactMax);
        this.hold = this._decide(r);
        return this.hold;
    }

    _decide(r) {
        const dx = r.dx, dy = r.dy;

        // 1. a pest on the hose: keep pumping
        if (r.hose === HoseState.Hooked && r.hookedPest != null && r.hookedPest.alive) {
            const th = nearest(r, p => p.dangerous && p !== r.hookedPest);
            if (th != null && dist(th, dx, dy) < this.close && this.chance(this.notice) && !this.chance(this.brave)) return this._flee(r, th.x, th.y);
            return new InputFrame(0, 0, true, false, false);
        }

        // 2. fire
        for (const p of r.pests) {
            if (!p.alive || !p.lizard || p.breath === 0 || p.ghost) continue;
            if (!this._inFireLine(r, p, dx, dy)) continue;
            if (!this.chance(this.notice)) continue;
            // out of the row: up or down if the column is open or diggable, else away
            for (const d of this._order(Dir4.Up, Dir4.Down))
                if (this._canStep(r, d) && TunnelRatSim.aligned(dx)) return InputFrame.stick(d);
            const away = p.x < dx ? Dir4.Right : Dir4.Left;
            if (this._canStep(r, away)) return InputFrame.stick(away);
        }

        // 3. a rock coming down on it
        for (const rk of r.rocks) {
            if (rk.state !== RockState.Wobble && rk.state !== RockState.Fall) continue;
            if (Math.abs(rk.x - dx) >= 15 || rk.y >= dy) continue;
            if (this.rockMode === 3 && rk === this.rockTarget) continue;
            if (!this.chance(this.notice)) continue;
            for (const d of this._order(Dir4.Left, Dir4.Right))
                if (this._canStep(r, d) && TunnelRatSim.aligned(dy)) return InputFrame.stick(d);
        }

        // 4. pump a pest that is aligned (or a few px off the line: the stick's cornering squares it
        //    up) and adjacent
        {
            let best = null, bestDir = -1, bd = Number.MAX_VALUE;
            for (const p of r.pests) {
                if (!p.solid) continue;
                const d = this._pumpDir(r, p, dx, dy);
                if (d < 0) continue;
                const dd = dist(p, dx, dy);
                if (dd < bd) { bd = dd; best = p; bestDir = d; }
            }
            if (best != null) {
                const horiz = bestDir === Dir4.Left || bestDir === Dir4.Right;
                const square = horiz ? TunnelRatSim.aligned(dy) : TunnelRatSim.aligned(dx);
                if (square && r.facing === bestDir) return new InputFrame(0, 0, true, false, false);
                this.wait = 0;                                   // square up / turn, then pump next step
                return InputFrame.stick(bestDir);
            }
        }

        // 5. a live pest closing in (or a ghost drifting in)
        {
            const th = nearest(r, p => p.dangerous);
            const td = th != null ? dist(th, dx, dy) : Number.MAX_VALUE;
            if (td < this.close && this.chance(this.notice)) return this._flee(r, th.x, th.y);
            const gh = nearest(r, p => p.alive && p.ghost);
            if (gh != null && dist(gh, dx, dy) < 40 && this.chance(this.ghostWary)) return this._flee(r, gh.x, gh.y);
            // near but not in line: hold still a moment and let it come into the hose's line
            if (td < this.ambush && this.ambushT < this.ambushMax) { this.ambushT = f32(this.ambushT + this.wait); return InputFrame.neutral; }
            if (td >= this.ambush) this.ambushT = 0;
            else if (this.ambushT >= f32(this.ambushMax + f32(1.2))) this.ambushT = 0;       // gave up for a bit: go and dig
            else this.ambushT = f32(this.ambushT + this.wait);
        }

        this._paths(r);
        const here = tileOf(dx, dy);

        // 6. a rock drop
        const rd = this._rockDrop(r, here);
        if (rd !== null) return rd;

        // 7. the carrot, else the nearest pest
        let goal = -1;
        if (r.vegActive) {
            const vt = r.StartRow * W + r.StartCol;
            if (this.dist[vt] <= 40) goal = vt;
        }
        if (goal < 0) {
            let bestCost = Number.MAX_VALUE;
            for (const p of r.pests) {
                if (!p.solid) continue;
                const pt = tileOf(p.x, p.y);
                if (this.dist[pt] < bestCost) { bestCost = this.dist[pt]; goal = pt; }
            }
            if (goal < 0) {
                // only ghosts left: go to meet the nearest one
                for (const p of r.pests) {
                    if (!p.alive) continue;
                    const pt = tileOf(clamp(p.x, 0, (W - 1) * T), clamp(p.y, 0, (H - 1) * T));
                    if (this.dist[pt] < bestCost) { bestCost = this.dist[pt]; goal = pt; }
                }
            }
        }
        if (goal < 0) return InputFrame.neutral;
        return this._stepToward(here, goal);
    }

    // ------------------------------------------------------------------ rock drop
    _rockDrop(r, here) {
        if (this.rockMode !== 0) {
            this.rockT = f32(this.rockT + 0.15);
            if (this.rockTarget == null || this.rockTarget.state === RockState.Crumble || this.rockTarget.state === RockState.Gone || this.rockT > 8)
            { this.rockMode = 0; this.rockTarget = null; }
        }
        if (this.rockMode === 0) {
            for (const rk of r.rocks) {
                if (rk.state !== RockState.Rest || rk.row + 1 >= H) continue;
                const c = rk.col, gap = rk.row + 1;
                for (const p of r.pests) {
                    if (!p.solid || Math.abs(p.x - c * T) > 4 || p.y <= gap * T + 8) continue;
                    const prow = Math.trunc(roundEven(p.y / T));
                    let open = true;
                    for (let y = gap + 1; y <= prow && open; y++) if (!r.field.tileDug(c, y)) open = false;
                    if (!open) continue;
                    // come at the gap from a side
                    let side = -1, sideCost = Number.MAX_VALUE;
                    for (const sc of [c - 1, c + 1]) {
                        if (sc < 0 || sc >= W) continue;
                        const st = gap * W + sc;
                        if (this.dist[st] < sideCost) { sideCost = this.dist[st]; side = sc; }
                    }
                    if (side < 0 || sideCost > this.rockReach) continue;
                    this.rockMode = 1; this.rockTarget = rk; this.rockSide = side; this.rockT = 0;
                    break;
                }
                if (this.rockMode !== 0) break;
            }
        }
        if (this.rockMode === 0) return null;
        const rt = this.rockTarget;
        const sideTile = (rt.row + 1) * W + this.rockSide;
        const inward = this.rockSide < rt.col ? Dir4.Right : Dir4.Left;
        if (this.rockMode === 1) {
            // reach the side tile (the stick's cornering squares it up on the gap's row)
            if (here === sideTile) this.rockMode = 2;
            else return this._stepToward(here, sideTile);
        }
        if (this.rockMode === 2) {
            // into the gap under the rock until it starts to wobble (or the gap is fully open)
            const inGap = Math.abs(r.dx - rt.col * T) < 1.0 && Math.abs(r.dy - (rt.row + 1) * T) < 1.0;
            if (rt.state !== RockState.Rest || inGap) this.rockMode = 3;
            else { this.wait = Math.min(this.wait, f32(0.05)); return InputFrame.stick(inward); }
        }
        // 3: back out until clear of the rock's column, then wait there for the drop
        const sideX = this.rockSide * T;
        const clearOk = inward === Dir4.Right ? r.dx <= sideX + 1e-3 : r.dx >= sideX - 1e-3;
        if (!clearOk) {
            this.wait = Math.min(this.wait, f32(0.05));
            return InputFrame.stick(Dir4.reverse(inward));
        }
        if (rt.state === RockState.Rest) { this.rockMode = 0; this.rockTarget = null; return null; }
        return InputFrame.neutral;
    }

    // ------------------------------------------------------------------ helpers
    _stepToward(here, goal) {
        if (goal === here) return InputFrame.neutral;
        // walk back from the goal to the first step out of here
        let t = goal, guard = 0;
        while (this.from[t] !== here && this.from[t] >= 0 && guard++ < W * H) t = this.from[t];
        if (this.from[t] < 0 && t !== goal) return InputFrame.neutral;
        const hx = here % W, hy = Math.trunc(here / W), tx = t % W, ty = Math.trunc(t / W);
        const d = tx > hx ? Dir4.Right : tx < hx ? Dir4.Left : ty > hy ? Dir4.Down : Dir4.Up;
        return InputFrame.stick(d);
    }

    // Dial's algorithm from the digger's tile: open 4, part-dug 5, earth 7, rocks are walls
    _paths(r) {
        for (let i = 0; i < this.dist.length; i++) { this.dist[i] = 2147483647; this.from[i] = -1; }
        for (const b of this.buckets) b.length = 0;
        this.wall.fill(0);
        for (const rk of r.rocks)
            if (rk.state === RockState.Rest || rk.state === RockState.Wobble) this.wall[rk.row * W + rk.col] = 1;
        const start = tileOf(r.dx, r.dy);
        this.dist[start] = 0;
        this.buckets[0].push(start);
        let done = 0, cur = 0, emptyRun = 0;
        while (done < W * H && emptyRun < this.buckets.length) {
            const b = this.buckets[cur % this.buckets.length];
            if (b.length === 0) { cur++; emptyRun++; continue; }
            emptyRun = 0;
            const n = b.pop();
            if (this.dist[n] !== cur) continue;
            done++;
            const x = n % W, y = Math.trunc(n / W);
            for (let d = 0; d < 4; d++) {
                const nx = x + Dir4.dx(d), ny = y + Dir4.dy(d);
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const m = ny * W + nx;
                if (this.wall[m]) continue;
                const c = r.field.tileDug(nx, ny) ? 4 : r.field.tileDugCount(nx, ny) >= 8 ? 5 : 7;
                const nd = cur + c;
                if (nd < this.dist[m]) { this.dist[m] = nd; this.from[m] = n; this.buckets[nd % this.buckets.length].push(m); }
            }
        }
    }

    _order(a, b) { return this.chance(0.5) ? [a, b] : [b, a]; }

    _canStep(r, d) { return !r.diggerBlocked(r.dx + Dir4.dx(d) * T, r.dy + Dir4.dy(d) * T); }

    // the direction to pump this pest in, or -1: same row/column, near, open tunnel between
    _pumpDir(r, p, dx, dy) {
        // the tile lines the digger is on or within square px of
        const lx = roundEven(dx / T) * T, ly = roundEven(dy / T) * T;
        const onRow = Math.abs(dy - ly) <= this.square, onCol = Math.abs(dx - lx) <= this.square;
        let d = -1, along, ox = dx, oy = dy;
        if (onRow && Math.abs(p.y - ly) < 8 && (TunnelRatSim.aligned(dy) || Math.abs(p.x - dx) > 10)) {
            d = p.x >= dx ? Dir4.Right : Dir4.Left; along = Math.abs(p.x - dx); oy = ly;
        } else if (onCol && Math.abs(p.x - lx) < 8 && (TunnelRatSim.aligned(dx) || Math.abs(p.y - dy) > 10)) {
            d = p.y >= dy ? Dir4.Down : Dir4.Up; along = Math.abs(p.y - dy); ox = lx;
        } else return -1;
        if (along > this.pumpReach) return -1;
        const gap = along - T + 2;                      // nozzle to the pest's hitbox
        if (gap > 0 && r.field.openRun(ox, oy, d, r.hoseRange) < gap) return -1;
        return d;
    }

    _inFireLine(r, p, dx, dy) {
        if (Math.abs(dy - p.y) >= 13) return false;
        const reach = r.fireRange + 10;
        if (p.face === Dir4.Right) return dx + T > p.x + T - 2 && dx < p.x + T + reach;
        return dx < p.x + 2 && dx + T > p.x - reach;
    }

    _flee(r, tx, ty) {
        let best = -1, bs = -Number.MAX_VALUE;
        for (let d = 0; d < 4; d++) {
            if (!this._canStep(r, d)) continue;
            const nx = r.dx + Dir4.dx(d) * T, ny = r.dy + Dir4.dy(d) * T;
            let sc = Math.abs(nx - tx) + Math.abs(ny - ty);
            if (r.field.rectDug(nx, ny)) sc += 10;
            const perpOk = (Dir4.dx(d) !== 0) ? TunnelRatSim.aligned(r.dy) : TunnelRatSim.aligned(r.dx);
            if (!perpOk) sc -= 12;
            sc += this.rng.nextDouble() * 4;
            if (sc > bs) { bs = sc; best = d; }
        }
        return best < 0 ? InputFrame.neutral : InputFrame.stick(best);
    }
}
