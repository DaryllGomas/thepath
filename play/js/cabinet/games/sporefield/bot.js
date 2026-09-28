// THE NODE · world 1 · SPORE FIELD on the Cabinet Engine · THE BOT.
// Port of SporeFieldBot.cs from Staging/Batch1/sporefield.
//
// A modelled average player, at the panel like anyone else (stick + A, never the sim):
//   - it holds fire, the way everyone plays this game
//   - every react seconds it re-aims: it picks the segment nearest its column and the bottom,
//     leads it a little (lead) and aims with some slop (aimError, in cells)
//   - every watch seconds (a human's reaction), with chance notice, it looks horizon seconds ahead
//     along the spider's bounce vector, the flea's fall and the borer's own walking rule near the
//     strip; if the move it wants brings a threat inside safe cells, it holds the stick move that
//     keeps the most room until its next look
//   - between reads it walks toward its aim, drifts back to the bottom row, and sidesteps up or
//     down when a mushroom blocks it
// Its dice are its own (CabinetBotBase.rng), never the sim's.
import { CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { SporeFieldRound } from './round.js';

const Phase = SporeFieldRound.Phase;
const Stay = 4;
const Actions = [Stay, Dir4.Left, Dir4.Right, Dir4.Up, Dir4.Down];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class SporeFieldBot extends CabinetBotBase {
    constructor() {
        super();
        this.reactMin = 0.13; this.reactMax = 0.26;         // aim reads
        this.watchMin = 0.20; this.watchMax = 0.35;         // threat reads (a human's reaction)
        this.aimError = 1.0;
        this.lead = 0.6;
        this.notice = 0.8;
        this.horizon = 0.55;
        this.safe = 1.5;
        this.bottomWeight = 0.6;

        this._readT = 0; this._watchT = 0; this._aimX = SporeFieldRound.W / 2;
        this._dodgeT = 0; this._unstickT = 0; this._stuckT = 0; this._lastX = -1; this._lastY = -1;
        this._dodge = -2; this._unstick = -1;
        this._paths = [];
    }

    get name() { return 'sf-average-player'; }

    reset(seed) {
        super.reset(seed);
        this._readT = 0; this._watchT = this.range(0, this.watchMax); this._aimX = SporeFieldRound.W / 2;
        this._dodgeT = this._unstickT = this._stuckT = 0; this._dodge = -2; this._unstick = -1;
        this._lastX = this._lastY = -1;
    }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== Phase.Playing) {
            this._readT = 0; this._watchT = this.range(0, this.watchMax); this._dodgeT = 0; this._unstickT = 0;
            return InputFrame.neutral;
        }

        this._readT -= dt;
        if (this._readT <= 0) { this._readT = this.range(this.reactMin, this.reactMax); this._aim(s); }
        this._watchT -= dt;
        if (this._watchT <= 0) { this._watchT = this.range(this.watchMin, this.watchMax); this._watch(s); }

        let dir = Dir4.None;
        if (this._dodgeT > 0) { this._dodgeT -= dt; dir = this._dodge === Stay ? Dir4.None : this._dodge; }
        else if (this._unstickT > 0) { this._unstickT -= dt; dir = this._unstick; }
        else dir = this._wanted(s);

        // blocked by a mushroom while walking sideways: step round it
        if (dir === Dir4.Left || dir === Dir4.Right) {
            if (Math.abs(s.playerX - this._lastX) < 1e-4 && Math.abs(s.playerY - this._lastY) < 1e-4) this._stuckT += dt; else this._stuckT = 0;
            if (this._stuckT > 0.2) {
                this._stuckT = 0;
                this._unstick = s.playerY > SporeFieldRound.ZoneTop + 1.2 && this.chance(0.7) ? Dir4.Up : Dir4.Down;
                this._unstickT = 0.18;
            }
        } else this._stuckT = 0;
        this._lastX = s.playerX; this._lastY = s.playerY;

        const f = InputFrame.stick(dir);
        f.a = true;
        return f;
    }

    _wanted(s) {
        const dx = this._aimX - s.playerX;
        if (Math.abs(dx) > 0.2) return dx > 0 ? Dir4.Right : Dir4.Left;
        if (s.playerY < SporeFieldRound.H - 0.55) return Dir4.Down;
        return Dir4.None;
    }

    _aim(s) {
        // the target: the segment nearest my column and the bottom
        let best = Infinity, tx = SporeFieldRound.W / 2;
        let any = false;
        for (const c of s.chains) {
            for (const g of c.segs) {
                const sx = s.segX(g), sy = s.segY(g);
                if (sy <= 0.3) continue;
                const cost = Math.abs(sx - s.playerX) + this.bottomWeight * (SporeFieldRound.H - sy);
                if (cost < best) {
                    best = cost; any = true;
                    const tHit = Math.max(0, s.playerY - sy) / s.shotSpeed + 0.08;
                    tx = sx + (g.x - g.px) * s.borerSpeed * tHit * this.lead;
                }
            }
        }
        if (any) this._aimX = tx + this._gauss() * this.aimError;
        else this._aimX = SporeFieldRound.W / 2 + this._gauss() * 3;
        if (this._aimX < 0.5) this._aimX = 0.5;
        if (this._aimX > SporeFieldRound.W - 0.5) this._aimX = SporeFieldRound.W - 0.5;
    }

    _watch(s) {
        // the threats: is the way I want to go about to put me in something?
        this._dodgeT = 0;
        if (!this.chance(this.notice)) return;
        this._predictBorer(s);
        const want = this._wanted(s);
        const wantA = want < 0 ? Stay : want;
        const wantRoom = this._room(s, wantA);
        if (wantRoom >= this.safe) return;
        let bestA = wantA, bestRoom = wantRoom;
        for (const a of Actions) {
            if (a === wantA) continue;
            const room = this._room(s, a);
            if (room > bestRoom + 0.05) { bestRoom = room; bestA = a; }
        }
        if (bestA === wantA) return;
        this._dodge = bestA;
        this._dodgeT = this._watchT;
    }

    // the least room (cells) between me and any threat over the next horizon seconds, if I hold action a
    _room(s, a) {
        const h = 0.05;
        let px = s.playerX, py = s.playerY;
        let ax = a === Stay ? 0 : Dir4.dx(a), ay = a === Stay ? 0 : Dir4.dy(a);
        // a mushroom right in the way means that move goes nowhere
        if (a !== Stay && s.mushAt(Math.floor(px + ax * 0.9), Math.floor(py + ay * 0.9))) { ax = 0; ay = 0; }
        const minX = SporeFieldRound.PlayerHalf, maxX = SporeFieldRound.W - SporeFieldRound.PlayerHalf;
        const minY = SporeFieldRound.ZoneTop + SporeFieldRound.PlayerHalf, maxY = SporeFieldRound.H - SporeFieldRound.PlayerHalf;

        let spX = s.spider.x, spY = s.spider.y, spVY = s.spider.vy;
        let room = 99;
        for (let t = h; t <= this.horizon + 1e-4; t += h) {
            px = clamp(px + ax * s.playerSpeed * h, minX, maxX);
            py = clamp(py + ay * s.playerSpeed * h, minY, maxY);
            if (s.spider.active) {
                spX += s.spider.vx * h; spY += spVY * h;
                if (spY < SporeFieldRound.SpiderTop) { spY = SporeFieldRound.SpiderTop; spVY = Math.abs(spVY); }
                if (spY > SporeFieldRound.SpiderBottom) { spY = SporeFieldRound.SpiderBottom; spVY = -Math.abs(spVY); }
                room = Math.min(room, Math.max(Math.abs(spX - px) - 0.8, Math.abs(spY - py) - 0.45));
            }
            if (s.flea.active) {
                const fy = s.flea.y + s.flea.vy * t;
                room = Math.min(room, Math.max(Math.abs(s.flea.x - px), Math.abs(fy - py)) - 0.4);
            }
            // the borer near the strip: where its own rule will walk it (it is slow and you can read it)
            const u = s.moveFrac + t * s.borerSpeed;
            const k = Math.trunc(u), f = u - k;
            for (let n = 0; n < this._paths.length; n++) {
                const path = this._paths[n];
                if (k + 1 >= path.length) continue;
                const a0 = path[k], a1 = path[k + 1];
                for (let i = 0; i < a0.length; i += 2) {
                    const gx = a0[i] + (a1[i] - a0[i]) * f + 0.5, gy = a0[i + 1] + (a1[i + 1] - a0[i + 1]) * f + 0.5;
                    room = Math.min(room, Math.max(Math.abs(gx - px), Math.abs(gy - py)) - 0.4);
                }
            }
        }
        return room;
    }

    // reading the borer: each chain near the strip walked forward by the game's own rule
    _predictBorer(s) {
        this._paths = [];
        const steps = Math.ceil(this.horizon * s.borerSpeed) + 2;
        for (const c of s.chains) {
            let near = false;
            for (const g of c.segs) if (g.y >= SporeFieldRound.ZoneTop - 4) { near = true; break; }
            if (!near) continue;
            const m = c.segs.length;
            const path = new Array(steps + 1);
            const cur = new Array(m * 2);
            const prev = new Array(m * 2);
            for (let i = 0; i < m; i++) { prev[2 * i] = c.segs[i].px; prev[2 * i + 1] = c.segs[i].py; cur[2 * i] = c.segs[i].x; cur[2 * i + 1] = c.segs[i].y; }
            path[0] = prev; path[1] = cur.slice();
            let dirX = c.dirX, dirY = c.dirY;
            for (let k = 2; k <= steps; k++) {
                const hx = cur[0], hy = cur[1];
                let nx = hx + dirX, ny = hy;
                if (hy < 0) { nx = hx; ny = hy + 1; }
                else if (nx < 0 || nx >= SporeFieldRound.W || s.mushAt(nx, hy)) {
                    if (dirY > 0 && hy >= SporeFieldRound.H - 1) dirY = -1;
                    else if (dirY < 0 && hy <= SporeFieldRound.ZoneTop) dirY = 1;
                    nx = hx; ny = hy + dirY; dirX = -dirX;
                }
                for (let i = m - 1; i >= 1; i--) { cur[2 * i] = cur[2 * i - 2]; cur[2 * i + 1] = cur[2 * i - 1]; }
                cur[0] = nx; cur[1] = ny;
                path[k] = cur.slice();
            }
            this._paths.push(path);
        }
    }

    _gauss() {
        const u1 = 1 - this.rng.nextDouble(), u2 = this.rng.nextDouble();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
}
