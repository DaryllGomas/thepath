// THE NODE · THE LABYRINTH · the pilots (ICabinetBot): they play through exactly what a player has (a direction, held or
// buffered), one frame a step, and only READ the round.
//
//   new LabyrinthBot('idle')     does nothing (the do-nothing bar: the ship drifts left at GO, stops at a wall, is caught)
//   new LabyrinthBot('good')     plans at every junction: the nearest light it can reach before any pursuer can (a safety
//                                margin on every node of the way), a power diamond when a pursuer closes in, the pale ones
//                                while there's time to catch them; turns about when the way ahead goes bad
//   new LabyrinthBot('sloppy')   a slower, looser hand: re-plans only every so often (so it misses turns), doesn't always
//                                notice a pursuer, runs closer margins, doesn't go for power on purpose
import { CabinetBotBase } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { NODES, EDGES, HEART, other, leaveDir, dijkstra } from './layout.js';
const RING = ['vN', 'vE', 'vS', 'vW'].map((k) => HEART.slots[k]);

const PROFILES = {
  good: { margin: 64, every: 0.1, notice: 1, power: true, hunt: true, lapse: 0, huntK: 0.8, paleSafe: 3.0, tell: true },
  sloppy: { margin: 40, every: 0.18, notice: 0.9, power: false, hunt: true, lapse: 0.1, huntK: 0.5, paleSafe: 1.0, tell: false },
};
const INF = Infinity;

export class LabyrinthBot extends CabinetBotBase {
  constructor(kind = 'good') { super(); this.kind = kind; this.P = PROFILES[kind] ?? PROFILES.good; this._init(); }
  get name() { return 'labyrinth-' + this.kind; }
  reset(seed) { super.reset(seed); this._init(); }
  _init() {
    this.want = null; this.planAt = -9; this.planNode = -1; this.noticed = [true, true, true, true]; this.noticeAt = -9;
    this.dq = null; this.dp = null; this.t = 0;
  }

  think(sim, dt) {
    this.t += dt;
    if (this.kind === 'idle') return { x: 0, y: 0 };
    if (sim.phase !== 'play' && sim.phase !== 'ready') { this.want = null; return { x: 0, y: 0 }; }
    const p = sim.player;
    if (!p.alive) return { x: 0, y: 0 };
    const E = EDGES[p.e], ahead = p.dir > 0 ? E.b : E.a;
    const due = this.kind === 'good' ? (ahead !== this.planNode || this.t - this.planAt >= this.P.every) : this.t - this.planAt >= this.P.every;
    if (due) { this._plan(sim); this.planAt = this.t; this.planNode = ahead; }
    return this.want ? { x: this.want[0], y: this.want[1] } : { x: 0, y: 0 };
  }

  _plan(sim) {
    const P = this.P, p = sim.player, n = NODES.length, A = sim.apsp;
    if (!A) return;
    const E = EDGES[p.e], ahead = p.dir > 0 ? E.b : E.a, back = p.dir > 0 ? E.a : E.b;
    const rem = p.dir > 0 ? E.L - p.s : p.s, behind = E.L - rem;
    const v = TUNE.player.speed, lt = sim.levelTime;
    // re-roll which pursuers the sloppy hand is keeping an eye on
    if (this.t - this.noticeAt > 2) { this.noticeAt = this.t; this.noticed = this.noticed.map(() => this.rng.nextDouble() < P.notice); }

    // ---- the danger field: how soon (in the ship's distance) any pursuer could stand on each node ----
    const k = sim._speedK ? sim._speedK() : 0.9;
    const dq = this.dq || (this.dq = new Float64Array(n)); dq.fill(INF);
    const pale = [];
    for (const q of sim.pursuers) {
      if (!this.noticed[q.i]) continue;
      if (q.st !== 'active' && q.st !== 'emerging') continue;
      const left = q.frightUntil - lt;
      if (q.st === 'active' && left > P.paleSafe) { pale.push({ q, left }); continue; }
      // (either way along its lane: a pursuer turns about whenever the rhythm changes, so the bot assumes it can)
      const QE = EDGES[q.e], delay = q.st === 'emerging' ? (TUNE.pursuer.emerge - q.t) * v * k : 0;
      const ra = QE.a * n, rb = QE.b * n, s = q.s, t = QE.L - q.s;
      for (let j = 0; j < n; j++) {
        const d = (Math.min(s + A[ra + j], t + A[rb + j]) + delay) / k;
        if (d < dq[j]) dq[j] = d;
      }
    }
    // a pursuer about to re-form in the heart (the light gathers in the pen): its ring is no place to be
    if (P.tell) for (const q of sim.pursuers) {
      if (!this.noticed[q.i] || !sim.emergeIn) continue;
      const soon = sim.emergeIn(q);
      if (soon > 2.2) continue;
      for (const vtx of RING) {
        const ra = vtx * n, d0 = soon * v * k;
        for (let j = 0; j < n; j++) { const d = (d0 + A[ra + j]) / k; if (d < dq[j]) dq[j] = d; }
      }
    }
    const margin = P.margin;
    // ---- where the ship can get to safely (a node is safe if the ship is there well before any pursuer) ----
    const dp = this.dp || (this.dp = new Float64Array(n));
    const srcs = [[ahead, rem]];
    if (dq[back] > behind + margin || dq[ahead] <= rem + margin) srcs.push([back, behind]);
    dijkstra(srcs, sim.open, dp, (u, du) => du + margin < dq[u]);

    // ---- pick a target (a point on the graph) ----
    let target = null;
    const reachable = (e, s) => {                        // the ship's safe distance to a point
      const X = EDGES[e];
      if (e === p.e) return Math.abs(s - p.s);            // on this very lane (ahead, or about)
      const da = dp[X.a] + s, db = dp[X.b] + X.L - s;
      const via = da < db ? X.a : X.b, d = Math.min(da, db);
      return dq[via] > dp[via] + margin * 0.6 ? d : INF;
    };
    // (1) the pale ones, while there's time to reach them
    if (P.hunt && pale.length) {
      let best = INF;
      for (const { q, left } of pale) {
        const d = reachable(q.e, q.s);
        if (d < (left - P.paleSafe) * v * P.huntK && d < best) { best = d; target = { e: q.e, s: q.s }; }
      }
    }
    const lights = sim.light;
    // (2) power when a pursuer is closing in
    if (!target && P.power) {
      let near = INF;
      for (const j of [ahead, back]) near = Math.min(near, dq[j]);
      if (near < 230) {
        let best = INF;
        for (const l of lights) { if (l.eaten || !l.power || !sim.open[l.e]) continue; const d = reachable(l.e, l.s); if (d < 420 && d < best) { best = d; target = l; } }
      }
    }
    // (3) the nearest light the ship can reach safely (the sloppy hand sometimes wanders off to another)
    if (!target) {
      let best = INF, second = null;
      for (const l of lights) {
        if (l.eaten || !sim.open[l.e]) continue;
        if (l.power && !this._powerWorth(sim)) continue;   // keep the diamonds for when they're needed
        const d = reachable(l.e, l.s);
        if (d < best) { second = target; best = d; target = l; }
      }
      if (P.lapse && second && this.rng.nextDouble() < P.lapse) target = second;
      if (!target) for (const l of lights) { if (!l.eaten && sim.open[l.e]) { target = l; break; } }
    }

    // ---- choose the first move toward it: straight on / a turn at the node ahead, or about ----
    const toTarget = (node) => {
      if (!target) return 0;
      const X = EDGES[target.e];
      return Math.min(A[node * n + X.a] + target.s, A[node * n + X.b] + X.L - target.s);
    };
    const opts = [];
    const safeAhead = dq[ahead] > rem + margin * 0.5;
    for (const x of NODES[ahead].edges) {
      if (!sim.open[x] || x === p.e) continue;
      const m = other(x, ahead), L = EDGES[x].L;
      const reach = rem + L, risk = dq[m] - reach;
      let cost = reach + toTarget(m);
      if (target && x === target.e) cost = rem + (EDGES[x].a === ahead ? target.s : L - target.s);
      opts.push({ dir: leaveDir(x, ahead), cost, safe: safeAhead && risk > margin * 0.5, risk: Math.min(risk, dq[ahead] - rem) });
    }
    {   // about
      const h = p.heading;
      let cost = behind + toTarget(back);
      if (target && target.e === p.e && (target.s - p.s) * p.dir < 0) cost = Math.abs(target.s - p.s);
      opts.push({ dir: [-h[0], -h[1]], cost: cost + 25, safe: dq[back] > behind + margin * 0.5, risk: dq[back] - behind, about: true });
    }
    if (target && target.e === p.e && (target.s - p.s) * p.dir >= 0) {   // it's right ahead on this lane: carry on
      opts.push({ dir: p.heading.slice(), cost: (target.s - p.s) * p.dir - 1, safe: safeAhead, risk: dq[ahead] - rem });
    }
    const safe = opts.filter((o) => o.safe);
    let pick;
    if (safe.length) pick = safe.reduce((a, b) => (b.cost < a.cost ? b : a));
    else pick = opts.reduce((a, b) => (b.risk > a.risk ? b : a));     // nothing safe: the way that's least bad
    this.want = pick.dir;
  }

  /** A power diamond is worth taking now only if pursuers are about (not wasted on an empty maze). */
  _powerWorth(sim) {
    const left = sim.light.filter((l) => !l.eaten && !l.power).length;
    return left < 12 || sim.pursuers.filter((q) => q.st === 'active').length >= 3;
  }
}
