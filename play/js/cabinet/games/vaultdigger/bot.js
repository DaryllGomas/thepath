// THE NODE · world 1 · VAULT DIGGER on the Cabinet Engine · THE BOT: a modelled average player.
// Grew out of the port of VaultDiggerBot.cs (Staging/Batch2/vaultdigger); the build-out (2026-10-18) taught
// it the whole heist: digging down, belts, the key and the crown, and the payroll sacks.
//
// It plays through the stick and buttons like anyone else, and reads the sim without touching it.
//   ROUTE    a cheapest-path search over the vault graph: the runner's own moves (walk, climb, hang, fall,
//            a belt costs less with it and more against it) plus DIG-DOWN edges (stand beside a brick with
//            air under it, dig it, drop through), on the live vault, to the nearest UNCLAIMED gold, the key,
//            or the crown (which waits until the gold is gone: it rings the alarm); with everything taken,
//            to the top of the exit ladder, then UP.
//   SACKS    when the only gold left is in the guards' hands: on the free run it chases the man with the
//            gold (a touch takes it); otherwise it waits at an AMBUSH tile, brick to dig beside it, on the
//            sack man's row if it can, and lets the guards come to it.
//   AVOID    every guard it has noticed taxes the tiles on its ROW and its COLUMN (a few tiles out)
//            and all but walls off the tiles around it, so the route bends away from the guards' lines.
//            A guard about to drop in from the top taxes that column. (Not on the free run: they nap.)
//   DIG      only when a guard on its own row is one tile out beyond the brick it would dig (the guard
//            1.7-3.2 tiles away; never the warden, who walks over holes): stick toward it + A.
//   HUMAN    it re-reads the guards every reaction seconds (so it acts on a slightly stale picture),
//            misses a guard now and then (blind), and sometimes fails to see the dig in time.
import { f32, roundEven, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { VaultDiggerSim, VaultMap, GState } from './sim.js';

const Phase = VaultDiggerSim.Phase;
const INT_MAX = 2147483647;
const DIG_L = 10, DIG_R = 11;         // a plan's first step can be a dig down, not a stick direction

export class VaultDiggerBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = f32(0.22);          // seconds between looks at the guards (jittered +-30%)
        this.blind = f32(0.10);             // chance per look that a guard goes unseen
        this.digSkill = f32(0.75);          // chance per look that a dig chance is taken
        this.digNear = f32(1.7); this.digFar = f32(3.2);   // the guard's distance (tiles) that reads as 'one tile out'
        this.nearCost = 5000;               // where a guard can be within reach tiles: a wall unless nothing else is left
        this.farCost = 600;                 // one tile further
        this.reach = 1;
        this.rowCost = 45; this.rowReach = 4;
        this.colCost = 25; this.colReach = 2;
        this.digCost = 45;                  // a dig down: the dig, the step over, the drop
        this.crownWait = 400;               // the crown costs this much more while any gold is left (take it last)

        const N = VaultMap.W * VaultMap.H;
        this.danger = new Int32Array(N);
        this.cost = new Int32Array(N);
        this.from = new Int32Array(N);
        this.via = new Int8Array(N);        // how a node was reached: 0 a move, -1 / +1 a dig down on that side
        this.hops = new Int32Array(N);
        this.heap = new Int32Array(N * 10);
        this._nb = [];

        this.look = 0;
        this.planDir = -1; this.planNode = -1; this.target = -1;
        this.dirty = true;
        this.holesSig = 0;

        this.depth = new Int32Array(N);
        this._q = []; this._qi = 0;
    }

    get name() { return 'vd-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.look = 0; this.planDir = -1; this.planNode = -1; this.target = -1; this.dirty = true; this.holesSig = 0;
        this.danger.fill(0);
    }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== Phase.Play) { this.planNode = -1; this.target = -1; return InputFrame.neutral; }
        const r = s.runner;
        if (s.digging) return InputFrame.neutral;       // never hold toward a hole that is opening

        let fresh = false;
        this.look = f32(this.look - dt);
        if (this.look <= 0) {
            this.look = f32(this.reaction * this.range(f32(0.7), f32(1.3)));
            this._lookAtGuards(s);
            fresh = true; this.dirty = true;
        }

        // the defence: a guard one tile out beyond the brick, on my row
        if (fresh && !this.lastFrame.a && !s.mercyActive) {
            const side = this._digSide(s);
            if (side !== 0 && this.chance(this.digSkill)) { this.dirty = true; return this._dig(side); }
        }

        const node = this._decisionNode(s);
        const sig = this._holeSignature(s);
        if (sig !== this.holesSig) { this.holesSig = sig; this.dirty = true; }
        if (node !== this.planNode || this.dirty) {
            this.planNode = node; this.dirty = false;
            this.planDir = this._plan(s, node);
        }
        const m = s.map;
        // at the top of the exit ladder: out
        if (m.exitOpen && r.x === m.exitX && r.y === 0 && !r.moving) return InputFrame.stick(Dir4.Up);
        if (this.planDir === DIG_L || this.planDir === DIG_R) {
            // let the step in finish, then dig (one fresh press at a time)
            if (r.moving || this.lastFrame.a) return InputFrame.neutral;
            return this._dig(this.planDir === DIG_L ? -1 : 1);
        }
        if (this.planDir < 0) return InputFrame.neutral;
        // no dithering: turn round mid-tile only if the tile ahead is inside a guard's reach
        if (r.moving && !r.falling && !r.carried && this.planDir === Dir4.reverse(r.moveDir) && this.danger[VaultMap.idx(r.tx, r.ty)] < this.nearCost)
            return InputFrame.stick(r.moveDir);
        return InputFrame.stick(this.planDir);
    }

    _dig(side) {
        const f = InputFrame.stick(side < 0 ? Dir4.Left : Dir4.Right);
        f.a = true;
        return f;
    }

    // where the runner's next decision happens: the tile it is moving to, then down any fall
    _decisionNode(s) {
        const r = s.runner;
        let x = r.moving ? r.tx : r.x, y = r.moving ? r.ty : r.y;
        while (y + 1 < VaultMap.H && !this._supported(s, x, y) && !s.map.solid(x, y + 1)) y++;
        return VaultMap.idx(x, y);
    }

    _holeSignature(s) {
        let h = 17;
        const t = s.map.holeT;
        for (let i = 0; i < t.length; i++) if (t[i] > 0) h = (Math.imul(h, 31) + i) | 0;
        for (const g of s.guards) if (g.s === GState.Trapped) h = (Math.imul(h, 7) + g.x * 13 + g.y) | 0;
        if (s.map.doorOpen) h = (h + 101) | 0;
        if (s.map.exitOpen) h = (h + 211) | 0;
        return h;
    }

    // danger: where each noticed guard can be within reach tiles along its real moves (a wall), one
    // step further (a heavy tax), and its row and column lines (a light tax)
    _lookAtGuards(s) {
        this.danger.fill(0);
        if (s.mercyActive) return;                  // the free run: they nap
        for (const g of s.guards) {
            if (g.s === GState.Dead && g.spawnX >= 0) {
                // a guard is about to drop in: its column at the top
                this.danger[VaultMap.idx(g.spawnX, 0)] += this.nearCost;
                this.danger[VaultMap.idx(g.spawnX, 1)] += this.farCost;
                continue;
            }
            if (g.s !== GState.Walk && g.s !== GState.Climb) continue;
            if (this.chance(this.blind)) continue;
            const gx = Math.trunc(roundEven(g.fx)), gy = Math.trunc(roundEven(g.fy));
            this.depth.fill(-1);
            this._q.length = 0; this._qi = 0;
            this._seed(gx, gy); this._seed(g.x, g.y); if (g.moving) this._seed(g.tx, g.ty);
            while (this._qi < this._q.length) {
                const u = this._q[this._qi++];
                const d = this.depth[u];
                this.danger[u] += d <= this.reach ? this.nearCost : this.farCost;
                if (d >= this.reach + 1) continue;
                s.map.moves(u % VaultMap.W, Math.trunc(u / VaultMap.W), true, this._nb);
                for (const v of this._nb) if (this.depth[v] < 0) { this.depth[v] = d + 1; this._q.push(v); }
            }
            for (let dx = -this.rowReach; dx <= this.rowReach; dx++) {
                const x = gx + dx;
                if (dx === 0 || !VaultMap.inB(x, gy)) continue;
                this.danger[VaultMap.idx(x, gy)] += Math.trunc(this.rowCost * (this.rowReach + 1 - Math.abs(dx)) / this.rowReach);
            }
            for (let dy = -this.colReach; dy <= this.colReach; dy++) {
                const y = gy + dy;
                if (dy === 0 || !VaultMap.inB(gx, y)) continue;
                this.danger[VaultMap.idx(gx, y)] += this.colCost;
            }
        }
    }

    _seed(x, y) {
        if (!VaultMap.inB(x, y)) return;
        const i = VaultMap.idx(x, y);
        if (this.depth[i] >= 0) return;
        this.depth[i] = 0; this._q.push(i);
    }

    // a guard on the row of the runner's next stop, 1.7-3.2 tiles out when it gets there: returns the
    // side to dig (-1/+1) or 0. The warden walks over holes: never him.
    _digSide(s) {
        const r = s.runner;
        const ax = r.moving ? r.tx : r.x, ay = r.moving ? r.ty : r.y;
        if (r.falling) return 0;
        const arrive = r.moving ? f32(f32(1 - r.p) / Math.max(f32(0.1), s.runSpeed)) : 0;
        for (const g of s.guards) {
            if (g.s !== GState.Walk || g.falling || g.warden) continue;
            if (Math.abs(f32(g.fy - ay)) > f32(0.2)) continue;
            let gx = g.fx;
            if (g.moving && (g.moveDir === Dir4.Left || g.moveDir === Dir4.Right))
                gx = f32(gx + f32(f32(Dir4.dx(g.moveDir) * s.guardSpeed) * arrive));
            const d = f32(gx - ax), ad = Math.abs(d);
            if (ad < this.digNear || ad > this.digFar) continue;
            const side = d < 0 ? -1 : 1;
            if (this._canDigAt(s, ax, ay, side)) return side;
        }
        return 0;
    }

    _canDigAt(s, x, y, side) {
        const m = s.map;
        if (s.digging || m.ladder(x, y) || m.bar(x, y)) return false;
        if (!(m.supported(x, y, false) || s.trappedGuardAt(x, y + 1))) return false;
        const dx = x + side;
        return m.brick(dx, y + 1) && !m.openHole(dx, y + 1) && m.clear(dx, y);
    }

    // a trapped guard's head is a floor, but not one it is about to climb out through
    _supported(s, x, y) { return s.map.supported(x, y, false) || this._safeHead(s, x, y + 1); }

    _safeHead(s, x, y) {
        for (const g of s.guards) if (g.s === GState.Trapped && g.x === x && g.y === y) return g.t > f32(0.9);
        return false;
    }

    _beltUnder(m, x, y) { return m.ladder(x, y) || m.bar(x, y) ? 0 : m.belt(x, y + 1); }

    _moves(s, x, y, into) {
        into.length = 0;
        const m = s.map;
        if (!this._supported(s, x, y)) {
            if (y + 1 < VaultMap.H && !m.solid(x, y + 1)) into.push(VaultMap.idx(x, y + 1));
            return;
        }
        if (x > 0 && !m.solid(x - 1, y) && !s.trappedGuardAt(x - 1, y)) into.push(VaultMap.idx(x - 1, y));
        if (x < VaultMap.W - 1 && !m.solid(x + 1, y) && !s.trappedGuardAt(x + 1, y)) into.push(VaultMap.idx(x + 1, y));
        if (m.ladder(x, y) && y > 0 && !m.solid(x, y - 1)) into.push(VaultMap.idx(x, y - 1));
        if (y + 1 < VaultMap.H && !m.solid(x, y + 1) && !s.trappedGuardAt(x, y + 1)) into.push(VaultMap.idx(x, y + 1));
    }

    _relax(u, v, c, via, hn) {
        if (c < this.cost[v]) {
            this.cost[v] = c; this.from[v] = u; this.via[v] = via; this.hops[v] = this.hops[u] + 1;
            if (hn < this.heap.length) { this.heap[hn++] = v; this._siftUp(hn - 1); }
        }
        return hn;
    }

    // Dijkstra from the decision node; returns the first stick direction, DIG_L / DIG_R, or -1 to stand
    _plan(s, src) {
        const m = s.map;
        const N = VaultMap.W * VaultMap.H, W = VaultMap.W;
        for (let i = 0; i < N; i++) { this.cost[i] = INT_MAX; this.from[i] = -1; this.hops[i] = 0; this.via[i] = 0; }
        let hn = 0;
        this.cost[src] = 0; this.heap[hn++] = src;
        while (hn > 0) {
            // pop min (binary heap on cost)
            const u = this.heap[0];
            this.heap[0] = this.heap[--hn];
            this._siftDown(hn);
            const ux = u % W, uy = Math.trunc(u / W);
            this._moves(s, ux, uy, this._nb);
            const falling = !this._supported(s, ux, uy);
            const bd = falling ? 0 : this._beltUnder(m, ux, uy);
            for (let k = 0; k < this._nb.length; k++) {
                const v = this._nb[k];
                let step = falling ? 6 : 10;
                if (bd !== 0 && Math.trunc(v / W) === uy) step = (v % W) - ux === bd ? 7 : 17;
                hn = this._relax(u, v, this.cost[u] + step + this.danger[v], 0, hn);
            }
            // dig down through the floor beside: the hole tile, then the drop goes on from there
            if (!falling && (uy + 2) < VaultMap.H)
                for (let sd = -1; sd <= 1; sd += 2)
                    if (m.digThrough(ux, uy, sd)) {
                        const v = VaultMap.idx(ux + sd, uy + 1);
                        hn = this._relax(u, v, this.cost[u] + this.digCost + this.danger[v] + this.danger[VaultMap.idx(ux + sd, uy)], sd, hn);
                    }
        }

        // the target: the nearest unclaimed gold or the key (sticky while it stays close to best), the
        // crown once the gold is gone, or the exit; else the sack men (chased, or waited for)
        let best = -1, bestC = INT_MAX;
        if (m.exitOpen) {
            const e = VaultMap.idx(m.exitX, 0);
            if (this.cost[e] < INT_MAX) { best = e; bestC = this.cost[e]; }
        } else {
            for (let i = 0; i < N; i++)
                if (m.gold[i] > 0 && this.cost[i] < bestC) { bestC = this.cost[i]; best = i; }
            if (m.keyAt >= 0 && !m.keyTaken && this.cost[m.keyAt] < bestC) { bestC = this.cost[m.keyAt]; best = m.keyAt; }
            if (m.crownAt >= 0 && !m.crownTaken && this.cost[m.crownAt] < INT_MAX) {
                const c = this.cost[m.crownAt] + (s.goldLeft > 0 ? this.crownWait : 0);
                if (c < bestC) { bestC = c; best = m.crownAt; }
            }
            if (this.target >= 0 && this.target !== best && this._isItem(m, this.target) && this.cost[this.target] < INT_MAX && this.cost[this.target] <= bestC + 30) best = this.target;
            if (best < 0 && s.goldLeft > 0) {
                const t = s.mercyActive ? this._chase(s) : this._ambush(s);
                if (t >= 0) { best = t; bestC = this.cost[t]; }
            }
        }
        // every way to it runs through a guard: back off and wait for the way to clear
        if (best < 0 || bestC >= this.nearCost) best = this._safestNear(s, src);
        this.target = best;
        if (best < 0 || best === src) return -1;

        // walk back to the first step
        let step = best, guard = 0;
        while (this.from[step] !== src && this.from[step] >= 0 && guard++ < N) step = this.from[step];
        if (this.from[step] !== src) return -1;
        if (this.via[step] !== 0) return this.via[step] < 0 ? DIG_L : DIG_R;
        const sx = src % W, sy = Math.trunc(src / W), tx = step % W, ty = Math.trunc(step / W);
        if (tx < sx) return Dir4.Left;
        if (tx > sx) return Dir4.Right;
        if (ty < sy) return Dir4.Up;
        return Dir4.Down;
    }

    _isItem(m, i) { return m.gold[i] > 0 || (i === m.keyAt && !m.keyTaken) || (i === m.crownAt && !m.crownTaken); }

    // the free run: run the nearest guard with gold down (a touch lifts it)
    _chase(s) {
        let best = -1, bestC = INT_MAX;
        for (const g of s.guards) {
            if (!g.carry || (g.s !== GState.Walk && g.s !== GState.Climb)) continue;
            for (const i of [VaultMap.idx(g.lx, g.ly), VaultMap.idx(g.x, g.y), VaultMap.idx(g.tx, g.ty)])
                if (this.cost[i] < bestC) { bestC = this.cost[i]; best = i; }
        }
        return best;
    }

    // a tile to wait at for a guard with gold: standing, brick to dig beside it, on his row if it can
    _ambush(s) {
        const m = s.map, W = VaultMap.W, N = W * VaultMap.H;
        let row = -1, col = 0;
        for (const g of s.guards) if (g.carry && g.s === GState.Walk) { row = g.ly; col = g.lx; break; }
        let best = -1, bestV = INT_MAX;
        for (let i = 0; i < N; i++) {
            if (this.cost[i] === INT_MAX || this.hops[i] > 40) continue;
            const x = i % W, y = Math.trunc(i / W);
            if (!m.supported(x, y, false) || m.ladder(x, y) || m.bar(x, y) || m.openHole(x, y)) continue;
            let sides = 0;
            for (let sd = -1; sd <= 1; sd += 2) if (m.brick(x + sd, y + 1) && m.clear(x + sd, y)) sides++;
            if (sides === 0) continue;
            let v = this.cost[i] + this.danger[i] * 2 + (sides === 2 ? 0 : 40);
            if (row >= 0) v += Math.abs(y - row) * 25 + (y === row ? Math.max(0, 4 - Math.abs(x - col)) * 60 : 0);
            if (v < bestV) { bestV = v; best = i; }
        }
        return best;
    }

    // nothing safe to take: go where the danger is least, counting what it costs to get there
    // (breaking out past a guard's reach beats standing still in it); never into an open hole
    _safestNear(s, src) {
        let best = -1, bestV = this.danger[src] * 2;
        const N = VaultMap.W * VaultMap.H, m = s.map;
        for (let i = 0; i < N; i++) {
            if (i === src || this.cost[i] === INT_MAX || this.hops[i] > 8) continue;
            const x = i % VaultMap.W, y = Math.trunc(i / VaultMap.W);
            if (m.openHole(x, y) || !this._supported(s, x, y)) continue;
            const v = this.cost[i] + this.danger[i] * 2;
            if (v < bestV) { bestV = v; best = i; }
        }
        return best;
    }

    _siftUp(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.cost[this.heap[p]] <= this.cost[this.heap[i]]) break;
            const t = this.heap[p]; this.heap[p] = this.heap[i]; this.heap[i] = t; i = p;
        }
    }

    _siftDown(hn) {
        let i = 0;
        for (;;) {
            const l = i * 2 + 1, rr = l + 1;
            let m = i;
            if (l < hn && this.cost[this.heap[l]] < this.cost[this.heap[m]]) m = l;
            if (rr < hn && this.cost[this.heap[rr]] < this.cost[this.heap[m]]) m = rr;
            if (m === i) break;
            const t = this.heap[m]; this.heap[m] = this.heap[i]; this.heap[i] = t; i = m;
        }
    }
}
