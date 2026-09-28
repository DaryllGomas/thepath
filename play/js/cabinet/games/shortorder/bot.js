// THE NODE · world 1 · SHORT ORDER on the Cabinet Engine · THE BOT: a modelled average player.
// Port of ShortOrderBot.cs (Staging/Batch2/shortorder), float for float. Its dice are its own
// (this.rng from CabinetBotBase), never the sim's.
//
// It plays through the stick and button A like anyone else, reading the sim, never writing it.
// Its three habits are the brief's:
//   WORK     go and drop the part that makes the most progress (the longest cascade: the most
//            rows it moves down; a finished burger counts extra) and is farthest from any chaser;
//            walk its unstepped segments, routing around the chasers it has noticed
//   RETREAT  when a noticed chaser closes (path cost under dangerCost), back off the way that
//            keeps the most kitchen between it and every chaser (it reaches more floor first), so
//            the chaser follows it into stun range rather than cornering it
//   SHAKE    pepper when two chasers are within 2 tiles; in a panic when one is closing inside
//            panicRange; and when it is cornered with one in reach
// Average-player traits: it looks at the chasers every ~0.2 s; a chaser it has not noticed yet
// is seen with notice (85%) per look and then remembered for memory seconds; it reads a stunned
// chaser as harmless until its last wakeWarn seconds; it wobbles in its choice of part and only
// re-plans its route at nodes and looks.
// (The C# constructor's TEMP-TUNE environment overrides, SO_<name>, are not ported: no Node APIs
// in games/. The defaults below are the ones the C# bench ran with.)
import { f32, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { ShortOrderMap as M } from './map.js';
import { ShortOrderSim, FoeMode } from './round.js';

const N = M.NodeCount;
const NC = M.NodeCount;
const Inf = f32(1e9);
const MaxFoes = 16;
const Phase = ShortOrderSim.Phase;

export class ShortOrderBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = f32(0.2);           // s between looks at the chasers
        this.notice = f32(0.85);            // chance per look that an unnoticed chaser is seen
        this.memory = f32(1.2);             // s a noticed chaser stays in mind
        this.wakeWarn = f32(0.5);           // s of stun left when a stunned chaser counts again
        this.dangerCost = f32(16);          // path cost (16 a tile) at which a seen chaser makes it back off
        this.panicRange = f32(26);          // px: one chaser closing this near and it may shake
        this.panic = f32(0.6);              // chance per look of that panic shake
        this.pairShake = f32(0.9);          // chance per look to shake when two are within 2 tiles
        this.greed = f32(0.35);             // weight of walking distance when choosing a part
        this.wobble = f32(50);              // noise when choosing a part
        this.avoidRadius = f32(72); this.avoidWeight = f32(2.5);   // route penalty around seen chasers
        this.corneredNodes = 4;             // escape room (nodes) under which it counts itself cornered

        this._targetPart = -1; this._hold = -1; this._turn = -1; this._lastKey = -1; this._room = N;
        this._look = 0;
        this._shake = false; this._retreating = false;
        this._seenFor = new Float32Array(MaxFoes);
        this._prevDist = new Float32Array(MaxFoes);
        this._pen = new Float32Array(N);
        this._distD = new Float32Array(N); this._distB = new Float32Array(N);
        this._firstD = new Int32Array(N); this._firstB = new Int32Array(N);
        this._foeCost = new Float32Array(N);
        this._heapC = new Float32Array(N * 8);
        this._heapN = new Int32Array(N * 8);
        this._hn = 0;
        this._popC = 0; this._popN = 0;
        this._best = { dir: -1, room: -1, lead: -Inf };
    }

    get name() { return 'so-average-player'; }

    // read-outs for the Lab's death analysis
    get retreating() { return this._retreating; }
    get targetPart() { return this._targetPart; }
    saw(foe) { return foe >= 0 && foe < MaxFoes && this._seenFor[foe] > 0; }

    reset(seed) {
        super.reset(seed);
        this._targetPart = -1; this._hold = -1; this._turn = -1; this._lastKey = -1; this._look = 0;
        this._shake = false; this._retreating = false; this._room = N;
        for (let i = 0; i < MaxFoes; i++) { this._seenFor[i] = 0; this._prevDist[i] = Inf; }
    }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== Phase.Cook) {
            this._targetPart = -1; this._hold = -1; this._turn = -1; this._shake = false; this._look = 0; this._retreating = false; this._lastKey = -1;
            for (let i = 0; i < MaxFoes; i++) { this._seenFor[i] = 0; this._prevDist[i] = Inf; }
            return InputFrame.neutral;
        }
        dt = f32(dt);
        for (let i = 0; i < MaxFoes; i++) if (this._seenFor[i] > 0) this._seenFor[i] = f32(this._seenFor[i] - dt);
        const m = s.chef;
        const key = (m.c * 8 + m.f) * 8 + (m.dir + 1);
        this._look = f32(this._look - dt);
        if (this._look <= 0) {
            this._look = f32(this.reaction * this.range(0.7, 1.3));
            this._lookAt(s);
            this._plan(s);
        }
        else if (key !== this._lastKey) this._plan(s);
        this._lastKey = key;
        const f = this._hold >= 0 ? InputFrame.stick(this._hold) : InputFrame.neutral;
        if (this._turn >= 0) {
            // a diagonal: back to the node, and the turn to take there
            if (M.vertical(this._turn)) f.y = this._turn === Dir4.Up ? 1 : -1; else f.x = this._turn === Dir4.Right ? 1 : -1;
        }
        if (this._shake && !this.lastFrame.a) { f.a = true; this._shake = false; }
        return f;
    }

    // ------------------------------------------------------------------ looking
    _live(e) { return e.harmful || (e.mode === FoeMode.Stunned && e.timer < this.wakeWarn); }

    _threat(s, i) { return i < MaxFoes && this._seenFor[i] > 0 && this._live(s.foes[i]); }

    _lookAt(s) {
        const c = s.chef;
        let near = 0;
        let closing = false;
        for (let i = 0; i < s.foes.length && i < MaxFoes; i++) {
            const e = s.foes[i];
            if (!this._live(e)) { this._seenFor[i] = 0; this._prevDist[i] = Inf; continue; }
            if (this.chance(this.notice)) this._seenFor[i] = this.memory;       // noticed (again): kept in mind a while
            if (this._seenFor[i] <= 0) continue;
            const dx = f32(e.x - c.x), dy = f32(e.y - c.y);
            const d = f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy))));
            if (e.harmful) {
                if (d <= s.stunRadius) near++;
                if (d <= this.panicRange && d < f32(this._prevDist[i] - f32(0.5))) closing = true;
            }
            this._prevDist[i] = d;
        }
        if (s.peppers <= 0) return;
        if (near >= 2 && this.chance(this.pairShake)) this._shake = true;
        else if (closing && this.chance(this.panic)) this._shake = true;
        else if (near >= 1 && this._retreating && this._room < this.corneredNodes && this.chance(this.panic)) this._shake = true;
    }

    // ------------------------------------------------------------------ planning
    _plan(s) {
        const m = s.chef;
        const D = m.nodeAhead;
        const B = m.dir >= 0 ? m.nodeAt : -1;
        const toD = m.remaining, toB = m.dir >= 0 ? m.prog : Inf;

        // the closest seen chaser by path
        const chefNode = m.nodeNear;
        let closest = Inf;
        for (let i = 0; i < s.foes.length && i < MaxFoes; i++) {
            if (!this._threat(s, i)) continue;
            const d = f32(M.Dist[s.foes[i].m.nodeNear * NC + chefNode]);
            if (d < closest) closest = d;
        }
        this._retreating = closest <= f32(this.dangerCost + (this._retreating ? 16 : 0));
        this._turn = -1;

        if (this._retreating) { this._hold = this._retreat(s, D, B, toD, toB); return; }

        // route penalties around the chasers it has seen
        const pen = this._pen;
        pen.fill(0);
        for (let i = 0; i < s.foes.length && i < MaxFoes; i++) {
            if (!this._threat(s, i)) continue;
            const fn = s.foes[i].m.nodeNear;
            for (let n = 0; n < N; n++) {
                const d = f32(M.Dist[fn * NC + n]);
                if (d < this.avoidRadius) pen[n] = f32(pen[n] + f32(f32(this.avoidRadius - d) * this.avoidWeight));
            }
        }
        this._dijkstra(D, this._distD, this._firstD, true);
        if (B >= 0) this._dijkstra(B, this._distB, this._firstB, true);
        this._room = N;
        this._hold = this._work(s, D, B, toD, toB);
    }

    _work(s, D, B, toD, toB) {
        const m = s.chef;
        if (this._targetPart < 0 || !s.parts[this._targetPart].resting) this._targetPart = this._choosePart(s);
        if (this._targetPart < 0) return -1;
        const p = s.parts[this._targetPart];
        const c0 = M.BurgerCol0[p.burger], f = p.floor;
        let best = Inf, goal = -1, viaB = false;
        for (let k = 0; k < M.PartTiles; k++) {
            if ((p.stepped & (1 << k)) !== 0) continue;
            const g = M.node(c0 + k, f);
            const cd = f32(toD + this._distD[g]);
            if (cd < best) { best = cd; goal = g; viaB = false; }
            if (B >= 0) { const cb = f32(toB + this._distB[g]); if (cb < best) { best = cb; goal = g; viaB = true; } }
        }
        if (goal < 0) { this._targetPart = -1; return -1; }
        return this._toward(m, D, B, goal, viaB, this._firstD, this._firstB);
    }

    // the way out that leaves it the most kitchen: for each first move, count the nodes it would
    // reach at least a tile ahead of every seen chaser (a chaser is taken to be as fast as the chef)
    _retreat(s, D, B, toD, toB) {
        const m = s.chef;
        const foeCost = this._foeCost;
        for (let n = 0; n < N; n++) {
            let fc = Inf;
            for (let i = 0; i < s.foes.length && i < MaxFoes; i++) {
                if (!this._threat(s, i)) continue;
                const e = s.foes[i];
                let d = f32(M.Dist[e.m.nodeNear * NC + n]);
                if (e.mode === FoeMode.Stunned) d = f32(d + f32(e.timer * s.foeSpeed));
                if (d < fc) fc = d;
            }
            foeCost[n] = fc;
        }
        const st = this._best;
        if (m.dir < 0) {
            this._bestFrom(m.c, m.f, 0, -1, st);
            this._room = Math.max(0, st.room);
            return st.dir;
        }
        // on an edge: keep going while it still reaches the next node ahead of every chaser (a
        // player commits to a direction), and pre-pick the turn there; turn back only when a
        // chaser will get to that node first
        if (f32(foeCost[D] - toD) >= 8) {
            this._bestFrom(M.nodeC(D), M.nodeF(D), toD, Dir4.reverse(m.dir), st);
            this._room = Math.max(0, st.room);
            if (st.dir >= 0 && M.vertical(st.dir) !== M.vertical(m.dir)) this._turn = st.dir;
            return m.dir;
        }
        const rev = Dir4.reverse(m.dir);
        this._bestFrom(M.nodeC(B), M.nodeF(B), toB, m.dir, st);
        this._room = Math.max(0, st.room);
        if (st.dir >= 0 && M.vertical(st.dir) !== M.vertical(rev)) this._turn = st.dir;
        return rev;
    }

    // the best first move out of node (c, f), reached at cost0; never the excluded direction
    _bestFrom(c, f, cost0, exclude, st) {
        st.dir = -1; st.room = -1; st.lead = -Inf;
        for (let d = 0; d < 4; d++) {
            if (d === exclude || !M.canMove(c, f, d)) continue;
            const x = M.node(M.nextC(c, d), M.nextF(f, d));
            this._consider(x, f32(cost0 + (M.vertical(d) ? M.CostV : M.CostH)), d, st);
        }
    }

    _consider(from, cost0, dir, st) {
        const foeCost = this._foeCost;
        let count = 0, lead = Inf;
        const base = from * NC;
        for (let n = 0; n < N; n++) {
            const dn = M.Dist[base + n];
            if (dn >= M.Unreachable) continue;
            const cc = f32(dn + cost0);
            const margin = f32(foeCost[n] - cc);
            if (margin >= 16) count++;
            if (n === from && margin < lead) lead = margin;
        }
        if (count > st.room || (count === st.room && lead > st.lead)) { st.room = count; st.lead = lead; st.dir = dir; }
    }

    // the stick direction that starts the walk to goal (through the node ahead, or back)
    _toward(m, D, B, goal, viaB, firstFromD, firstFromB) {
        if (viaB && m.dir >= 0) {
            // going back: hold the reverse, plus the turn wanted at that node (a diagonal), so
            // the chef doesn't sail straight through it
            const rev = Dir4.reverse(m.dir);
            const h2 = B === goal ? -1 : firstFromB != null && firstFromB[goal] >= 0 ? firstFromB[goal] : M.Hop[B * NC + goal];
            if (h2 >= 0 && M.vertical(h2) !== M.vertical(rev)) this._turn = h2;
            return rev;
        }
        if (D === goal) {
            if (m.dir >= 0) return m.dir;
            // standing on the goal (a part landed under us): step off and come back
            for (let d = 0; d < 4; d++) if (M.canMove(m.c, m.f, d)) return d;
            return -1;
        }
        let h = firstFromD != null ? firstFromD[goal] : M.Hop[D * NC + goal];
        if (h < 0) h = M.Hop[D * NC + goal];
        if (m.dir >= 0 && h === Dir4.reverse(m.dir)) return m.dir;   // never flip-flop on a node's doorstep
        return h;
    }

    _choosePart(s) {
        const chefNode = s.chef.nodeNear;
        let best = -1, bestV = -Inf;
        for (let i = 0; i < s.parts.length; i++) {
            const p = s.parts[i];
            if (!p.resting) continue;
            const b = p.burger, c0 = M.BurgerCol0[b], f = p.floor;
            const cf = M.ColumnFloors[b];
            // the cascade: how many rows this drop moves, and whether it reaches the plate
            let falls = 0, slot = p.slot, plate = false;
            while (true) {
                falls++; slot++;
                if (slot >= cf.length) { plate = true; break; }
                if (s.restingPartAt(b, cf[slot]) == null) break;
            }
            const completes = plate && s.stacked[b] === M.PartsPerBurger - 1;
            let cost = Inf, danger = f32(160), left = 0;
            for (let k = 0; k < M.PartTiles; k++) {
                if ((p.stepped & (1 << k)) !== 0) continue;
                left++;
                const g = M.node(c0 + k, f);
                cost = Math.min(cost, f32(M.Dist[chefNode * NC + g]));
                for (let j = 0; j < s.foes.length; j++) {
                    const e = s.foes[j];
                    if (!e.harmful) continue;
                    danger = Math.min(danger, f32(M.Dist[e.m.nodeNear * NC + g]));
                }
            }
            // falls * 60f + (completes ? 100f : 0f) + danger * 0.4f - (cost + (left - 1) * 16f) * Greed + Range(0f, Wobble)
            let v = f32(falls * 60);
            v = f32(v + (completes ? 100 : 0));
            v = f32(v + f32(danger * f32(0.4)));
            v = f32(v - f32(f32(cost + f32((left - 1) * 16)) * this.greed));
            v = f32(v + this.range(0, this.wobble));
            if (v > bestV) { bestV = v; best = i; }
        }
        return best;
    }

    // ------------------------------------------------------------------ Dijkstra with a tiny heap
    _dijkstra(src, dist, first, penalised) {
        const pen = this._pen;
        for (let i = 0; i < N; i++) { dist[i] = Inf; first[i] = -1; }
        dist[src] = 0;
        this._hn = 0;
        this._push(0, src);
        while (this._hn > 0) {
            this._pop();
            const c = this._popC, u = this._popN;
            if (c > dist[u]) continue;
            const uc = M.nodeC(u), uf = M.nodeF(u);
            for (let d = 0; d < 4; d++) {
                if (!M.canMove(uc, uf, d)) continue;
                const v = M.node(M.nextC(uc, d), M.nextF(uf, d));
                const w = f32((M.vertical(d) ? M.CostV : M.CostH) + (penalised ? pen[v] : 0));
                const nc = f32(c + w);
                if (nc < dist[v]) {
                    dist[v] = nc;
                    first[v] = u === src ? d : first[u];
                    this._push(nc, v);
                }
            }
        }
    }

    _push(c, n) {
        const heapC = this._heapC, heapN = this._heapN;
        if (this._hn >= heapC.length) return;
        let i = this._hn++;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (heapC[p] <= c) break;
            heapC[i] = heapC[p]; heapN[i] = heapN[p]; i = p;
        }
        heapC[i] = c; heapN[i] = n;
    }

    _pop() {
        const heapC = this._heapC, heapN = this._heapN;
        this._popC = heapC[0]; this._popN = heapN[0];
        const hn = --this._hn;
        if (hn === 0) return;
        const lc = heapC[hn], ln = heapN[hn];
        let i = 0;
        while (true) {
            const a = i * 2 + 1;
            if (a >= hn) break;
            const b = a + 1;
            const m = b < hn && heapC[b] < heapC[a] ? b : a;
            if (heapC[m] >= lc) break;
            heapC[i] = heapC[m]; heapN[i] = heapN[m]; i = m;
        }
        heapC[i] = lc; heapN[i] = ln;
    }
}
