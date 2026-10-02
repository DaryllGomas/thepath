// THE NODE · THE ASCENT · the pilots (ICabinetBot): they fly through exactly what a player has (steer, THRUST), one frame a
// step, and only READ the round.
//
//   new AscentBot('idle')     does nothing (the do-nothing bar: it falls onto the temple too fast and crashes, ship after ship)
//   new AscentBot('good')     the decent hand: it picks the nearest unlit pad, finds a way through the sky around the islands (a
//                             coarse grid search over where the lander fits), cruises, lines up over the pad (the islands drift:
//                             it leads them), and comes down on a braking profile that keeps its descent under the soft-landing
//                             limit. Crystals: from above it stomps them, at or above its level it climbs over them. When the
//                             last pad is lit it lands on the temple.
//   new AscentBot('sloppy')   a looser hand: decides less often, brakes late, lines up roughly, notices crystals late or not
import { CabinetBotBase } from '../../sdk/index.js';
import { TUNE } from './spec.js';
import { islandAt, islandPoly, padX, FRAME } from './layout.js';
import { circlePoly } from './round.js';

const PROFILES = {
  good: { lowFuel: 45, every: 0.05, vCruise: 115, lineup: 12, brake: 0.55, noiseV: 0, noiseX: 0, notice: 1, react: 0.15, stomp: 1, margin: 14, gain: 1, gate: 78 },
  sloppy: { lowFuel: 15, every: 0.16, vCruise: 190, lineup: 22, brake: 1.0, noiseV: 18, noiseX: 10, notice: 0.5, react: 0.5, stomp: 0.4, margin: 6, gain: 0.8, gate: 60 },
};
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const R = TUNE.lander.r, CELL = 22, COLS = Math.ceil(FRAME[0] / CELL), ROWS = Math.ceil(920 / CELL);
const B = TUNE.bounds;

export class AscentBot extends CabinetBotBase {
  constructor(kind = 'good') { super(); this.kind = kind; this.P = PROFILES[kind] ?? PROFILES.good; this._init(); }
  get name() { return 'ascent-' + this.kind; }
  reset(seed) { super.reset(seed); this._init(); }
  _init() {
    this.t = 0; this.out = { x: 0, y: 0, a: false }; this.nextAt = 0; this.target = null; this.noticed = new Map(); this.offV = 0;
    this.blocked = new Uint8Array(COLS * ROWS); this.g = new Float32Array(COLS * ROWS); this.from = new Int32Array(COLS * ROWS); this.path = [];
    this.navAt = -9; this.committed = false; this.refuel = false; this.refuelId = -1;
  }

  think(sim, dt) {
    this.t += dt;
    if (this.kind === 'idle' || sim.phase !== 'play' || !sim.lander.alive) return { x: 0, y: 0, a: false };
    if (this.t >= this.nextAt) { this._decide(sim); this.nextAt = this.t + this.P.every * (0.8 + 0.4 * this.rng.nextDouble()); }
    return this.out;
  }

  _pickTarget(sim) {
    const l = sim.lander;
    // a low tank: set down on the nearest island first (any soft landing refills it)
    if (l.landed < 0 && (l.fuel < this.P.lowFuel || (this.refuel && l.fuel < 60))) {
      this.refuel = true;
      if (this.target && this.refuelId === this.target.id) return this.target;
      let best = null, bd = 1e9;
      for (const s of sim.islands) {
        // (an island right above you is the far way round: its underside is in the way)
        const under = l.y > s.y && l.x > s.x + s.def.bx0 - R && l.x < s.x + s.def.bx1 + R;
        const d = Math.hypot(s.x - l.x, (s.y - l.y) * 0.8) + (s.y < l.y ? 60 : 0) + (under ? 500 : 0);
        if (d < bd) { bd = d; best = s; }
      }
      this.refuelId = best.id; return best;
    }
    if (l.landed >= 0) this.refuel = false;
    if (sim.temple.open) return sim.temple;
    if (this.target && this.target.padOn && !this.target.lit) return this.target;
    let best = null, bd = 1e9;
    for (const s of sim.islands) {
      if (!s.padOn || s.lit) continue;
      const d = Math.hypot(s.x - l.x, (s.y - l.y) * 1.3);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ---- the way through the sky: where the lander fits (islands, inflated, a little more for the ones that slide) ----
  _grid(sim, sx, sy) {
    const P = this.P, blocked = this.blocked; blocked.fill(0);
    for (const s of sim.islands) {
      const m = R + P.margin + (s.def.slide ? 10 : 0), poly = islandPoly(s.x, s.y, s.def);
      const c0 = Math.max(0, Math.floor((s.x + s.def.bx0 - m - 30) / CELL)), c1 = Math.min(COLS - 1, Math.ceil((s.x + s.def.bx1 + m + 30) / CELL));
      const r0 = Math.max(0, Math.floor((s.y - m - 6) / CELL)), r1 = Math.min(ROWS - 1, Math.ceil((s.y + s.def.by1 + m) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (circlePoly((c + 0.5) * CELL, (r + 0.5) * CELL, m, poly)) blocked[r * COLS + c] = 1;
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {                 // the walls, the ceiling and the sea
      const x = (c + 0.5) * CELL, y = (r + 0.5) * CELL;
      if (x < B.x0 + 6 || x > B.x1 - 6 || y < B.y0 + 6 || y > B.sea - 75) blocked[r * COLS + c] = 1;   // (never skim the sea)
    }
    const sc = clamp(Math.floor(sx / CELL), 0, COLS - 1), sr = clamp(Math.floor(sy / CELL), 0, ROWS - 1);
    for (let r = sr - 2; r <= sr + 2; r++) for (let c = sc - 2; c <= sc + 2; c++) if (r >= 0 && c >= 0 && r < ROWS && c < COLS) blocked[r * COLS + c] = 0;
  }
  _astar(sx, sy, gx, gy) {
    const blocked = this.blocked, g = this.g, from = this.from; g.fill(1e9); from.fill(-1);
    const sc = clamp(Math.floor(sx / CELL), 0, COLS - 1), sr = clamp(Math.floor(sy / CELL), 0, ROWS - 1);
    let gc = clamp(Math.floor(gx / CELL), 0, COLS - 1), gr = clamp(Math.floor(gy / CELL), 0, ROWS - 1);
    if (blocked[gr * COLS + gc]) {                                              // the goal sits in a blocked cell: nearest free one
      let bd = 1e9, bi = -1;
      for (let r = Math.max(0, gr - 4); r <= Math.min(ROWS - 1, gr + 4); r++) for (let c = Math.max(0, gc - 4); c <= Math.min(COLS - 1, gc + 4); c++)
        if (!blocked[r * COLS + c]) { const d = (r - gr) ** 2 + (c - gc) ** 2; if (d < bd) { bd = d; bi = r * COLS + c; } }
      if (bi < 0) return null; gr = Math.floor(bi / COLS); gc = bi % COLS;
    }
    const heap = [[0, sr * COLS + sc]]; g[sr * COLS + sc] = 0;
    const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const goal = gr * COLS + gc;
    while (heap.length) {
      const [, cur] = pop();
      if (cur === goal) break;
      const cr = Math.floor(cur / COLS), cc = cur % COLS;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = cr + dr, nc = cc + dc; if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue;
        const ni = nr * COLS + nc; if (blocked[ni]) continue;
        if (dr && dc && (blocked[cr * COLS + nc] || blocked[nr * COLS + cc])) continue;
        const ng = g[cur] + (dr && dc ? 1.414 : 1);
        if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push([ng + Math.hypot(nr - gr, nc - gc), ni]); }
      }
    }
    if (from[goal] < 0 && goal !== sr * COLS + sc) return null;
    const path = []; for (let i = goal; i >= 0; i = from[i]) { path.push([(i % COLS + 0.5) * CELL, (Math.floor(i / COLS) + 0.5) * CELL]); if (i === sr * COLS + sc) break; }
    return path.reverse();
  }
  _los(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
    for (let i = 1; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
      if (this.blocked[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)]) return false;
    }
    return true;
  }

  _decide(sim) {
    const P = this.P, l = sim.lander;
    const s = this.target = this._pickTarget(sim);
    if (!s) { this.out = { x: 0, y: 0, a: false }; return; }
    // where the target will be in a moment (the islands drift: lead them)
    const fut = islandAt(s.def, sim.time + 0.9), tx = (s.id === 0 || !s.def.pad || this.refuel ? fut.x : padX(s.def, fut.x)), tyTop = fut.y;
    const dxT = tx - l.x, aligned = Math.abs(dxT) < P.lineup && Math.abs(l.vx - fut.vx) < 45;
    const gb = sim.groundBelow(l.x, l.y, R + 8), clear = !gb || gb.isl === s;
    // 1) the way: to the gate above the target, then straight down
    let wx = tx, wy = tyTop - R - P.gate, descend = false;
    const overTarget = Math.abs(dxT) < 46 && clear && l.y < tyTop - R + 8;
    if (overTarget) {
      wy = tyTop - R;
      if (aligned || this.committed) descend = true;
    } else {
      if (this.t - this.navAt > 0.3 || !this.path.length) {
        this._grid(sim, l.x, l.y); this.path = this._astar(l.x, l.y, tx, tyTop - R - P.gate) ?? []; this.navAt = this.t;
      }
      let pick = null;                                                             // the farthest waypoint in plain sight
      for (let i = this.path.length - 1; i >= 0; i--) if (this._los(l.x, l.y, this.path[i][0], this.path[i][1])) { pick = this.path[i]; break; }
      if (pick) { wx = pick[0]; wy = pick[1]; if (pick === this.path[this.path.length - 1]) { wx = tx; wy = Math.min(wy, tyTop - R - P.gate * 0.6); } }
    }
    this.committed = descend && Math.abs(dxT) < 40;
    let vxDes = clamp((wx - l.x) * 1.5, -P.vCruise, P.vCruise) * P.gain + (descend || overTarget ? fut.vx : 0);
    // 2) the crystals
    let flee = false, stompAim = null;
    for (const c of sim.crystals) {
      if (!this.noticed.has(c.id)) this.noticed.set(c.id, this.rng.nextDouble() < P.notice ? sim.time + P.react : Infinity);
      if (sim.time < this.noticed.get(c.id)) continue;
      const dx = c.x - l.x, dy = c.y - l.y, d = Math.hypot(dx, dy);
      if (d > 230) continue;
      if (dy >= 30) {                                            // below me: come down on it (if no island is in between)
        const blk = sim.groundBelow(l.x, l.y, R + 4), open = !blk || blk.isl.y > c.y;
        if (open && P.stomp > 0.5 && l.fuel > 25 && !descend && (!stompAim || d < stompAim.d)) stompAim = { c, d };
        else if (open && d < 90) vxDes = -Math.sign(dx || 1) * 150;
      } else if (d < 190) {                                      // level or above: get over it, away from it
        flee = true; wy = Math.min(wy, c.y - 95); vxDes = -Math.sign(dx || 1) * 190; descend = false; this.committed = false;
      }
    }
    if (stompAim && !flee) {
      const c = stompAim.c, dx = c.x + c.vx * 0.45 - l.x;
      vxDes = clamp(dx * 2.2, -220, 220); wy = Math.abs(dx) > 34 ? c.y - 50 : c.y + 120;
    }
    // 3) vertical: a desired vertical speed toward the goal; thrust when falling faster than it
    const gap = tyTop - (l.y + R);
    let vyDes;
    if (descend) vyDes = Math.min(150, 26 + Math.sqrt(2 * 125 * Math.max(0, gap))) * P.brake + this.offV;
    else {
      vyDes = clamp((wy - l.y) * 2.4, -260, 190);
      if (vyDes > 0) {                                           // never dive at the ground: the braking profile caps a descent
        const g = sim.groundBelow(l.x, l.y, 0);
        if (g) vyDes = Math.min(vyDes, 40 + Math.sqrt(2 * 150 * Math.max(0, g.gap - 6)) * P.brake);
      }
    }
    if (l.landed >= 0 && !descend) vyDes = Math.min(vyDes, -40);
    if (l.landed >= 0 && l.fuel < 90) { this.out = { x: 0, y: 0, a: false }; return; }
    if (l.landed >= 0 && descend && gap < 4) { this.out = { x: 0, y: 0, a: false }; return; }
    this.dbg = { tx: +tx.toFixed(0), tyTop: +tyTop.toFixed(0), dxT: +dxT.toFixed(0), wx: +wx.toFixed(0), wy: +wy.toFixed(0), vxDes: +vxDes.toFixed(0), vyDes: +vyDes.toFixed(0), descend, overTarget, aligned, clear };
    const side = clamp((vxDes - l.vx) / 55, -1, 1);
    const g0 = sim.groundBelow(l.x, l.y, 0);
    const quiet = descend && gap < 90 ? (Math.abs(dxT) < 25 ? 0.5 : 1) : (g0 && g0.gap < 70 && l.vy > 25 ? 0.4 : 1);      // (near the ground, level at touchdown)
    const jitter = P.noiseX ? (this.rng.nextDouble() - 0.5) * P.noiseX / 60 : 0;
    this.out = { x: clamp(side * quiet + jitter, -1, 1), y: 0, a: l.vy > vyDes + (P.noiseV ? (this.rng.nextDouble() - 0.5) * P.noiseV : 0) - 4 };
    if (l.fuel <= 0) this.out.a = false;
  }
}
