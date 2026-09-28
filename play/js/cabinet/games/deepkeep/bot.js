// THE NODE · world 1 · THE DEEP KEEP on the Cabinet Engine · THE BOT: a modelled average player.
//
// It HOLDS a stick + buttons and looks again every `reaction` s (+ up to `jitter`). Each look:
//   route    BFS over the tiles to the goal: FOOD when health is under `hungry` (and a plate is near),
//            a KEY when the stairs are locked away and it holds none, a CHEST / POTION a few steps off
//            (greed), else the STAIRS. Monsters are not in the route: it shoots through them.
//   notice   chance it registers the monsters at all this look (else it just walks)
//   shoot    the nearest monster (or generator, favoured by `genFocus`) it can see inside `range` px:
//            it plants and throws along the 8-way line nearest the target, if the target sits close
//            enough to that line (a panicky throw when something is right on top of it); `aimSlip`
//            = it picks a neighbouring line by mistake
//   stuck    boxed in (not moving for `stuckAt` s while walking) = it throws the way it wants to go
//   potion   only late: a crowd of `crowd` on it, or `lowCrowd` near when health is under `low`, anything near
//            under `desperate`, or the wraith on it
// Its dice are its own (this.rng); it only reads the sim.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { TS, DX8, DY8, MonInfo } from './dungeon.js';
import { Tile, Item, Mon } from './levels.js';
import { DeepKeepRound } from './round.js';

const Running = DeepKeepRound.Phase.Running;

export class DeepKeepBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = 0.16; this.jitter = 0.12;
        this.notice = 0.86; this.range = 100; this.genFocus = 0.7; this.aimSlip = 0.1; this.align = 8;
        this.hungry = 280; this.greed = 5; this.stuckAt = 0.35;
        this.crowd = 7; this.lowCrowd = 3; this.low = 240; this.desperate = 120; this.potionUse = 0.5;
        this._hold = new InputFrame(); this._wait = 0;
        this._dist = null; this._from = null; this._q = null; this._n = 0;
    }

    get name() { return 'dk-average-player'; }

    reset(seed) { super.reset(seed); this._hold = new InputFrame(); this._wait = 0; }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.dungeon == null || r.p !== Running) { this._wait = 0; this._hold = new InputFrame(); return InputFrame.neutral; }
        this._wait -= dt;
        if (this._wait > 0) { const f = this._hold.clone(); f.b = false; return f; }
        this._wait = this.reaction + this.jitter * this.rng.nextDouble();

        const d = r.dungeon, hero = d.hero;
        const f = new InputFrame();
        const sees = this.rng.nextDouble() < this.notice;

        // ---- potion, late: a real crowd on it, or a smaller one when health is going
        if (hero.potions > 0 && sees) {
            let near = 0, close = 0, wraith = false;
            for (const m of d.mons) {
                if (!m.alive) continue;
                const dx = Math.abs(m.x - hero.x), dy = Math.abs(m.y - hero.y);
                if (dx < 64 && dy < 64) { near++; if (dx < 40 && dy < 40) { close++; if (m.type === Mon.Wraith) wraith = true; } }
            }
            const want = close >= this.crowd || (hero.hp < this.low && near >= this.lowCrowd) || (hero.hp < this.desperate && near >= 1) || wraith;
            if (want && this.rng.nextDouble() < this.potionUse) f.b = !this.lastFrame.b;
        }

        // ---- the route
        const step = this._route(d, hero);

        // ---- shooting
        let shot = -1;
        if (sees) shot = this._aim(d, hero);
        if (shot < 0 && step && hero.stuck > this.stuckAt) shot = dir8(step.vx, step.vy);   // boxed in: clear the way
        if (shot >= 0) {
            if (this.rng.nextDouble() < this.aimSlip) shot = (shot + (this.rng.nextDouble() < 0.5 ? 1 : 7)) & 7;
            f.x = DX8[shot]; f.y = -DY8[shot]; f.a = true;
        } else if (step) {
            f.x = Math.abs(step.vx) > 2.5 ? Math.sign(step.vx) : 0;
            f.y = Math.abs(step.vy) > 2.5 ? -Math.sign(step.vy) : 0;
        }
        this._hold = f.clone();
        return f;
    }

    // the best target it can see: the 8-way line to throw along, or -1
    _aim(d, hero) {
        let best = -1, bestScore = 1e9;
        const R = this.range;
        for (const m of d.mons) {
            if (!m.alive || m.hidden) continue;
            const vx = m.x - hero.x, vy = m.y - hero.y;
            if (Math.abs(vx) > R || Math.abs(vy) > R) continue;
            const dist = Math.hypot(vx, vy);
            if (dist > R) continue;
            const dir = dir8(vx, vy), ux = DX8[dir], uy = DY8[dir], k = (dir & 1) ? Math.SQRT1_2 : 1;
            const perp = Math.abs(vx * uy - vy * ux) * k;
            const ok = perp < this.align + MonInfo[m.type].half * 0.5 || dist < 26;
            if (!ok) continue;
            if (!d._los(hero.x, hero.y, m.x, m.y)) continue;
            const sc = dist + (m.type === Mon.Wraith ? 30 : 0);
            if (sc < bestScore) { bestScore = sc; best = dir; }
        }
        if (this.rng.nextDouble() < this.genFocus) {
            for (const g of d.gens) {
                if (!g.alive) continue;
                const vx = g.tx * TS + 8 - hero.x, vy = g.ty * TS + 8 - hero.y, dist = Math.hypot(vx, vy);
                if (dist > R) continue;
                const dir = dir8(vx, vy), ux = DX8[dir], uy = DY8[dir], k = (dir & 1) ? Math.SQRT1_2 : 1;
                if (Math.abs(vx * uy - vy * ux) * k > 9) continue;
                if (!d._los(hero.x, hero.y, g.tx * TS + 8 - ux * 10, g.ty * TS + 8 - uy * 10)) continue;
                const sc = dist - 40;
                if (sc < bestScore) { bestScore = sc; best = dir; }
            }
        }
        return best;
    }

    // BFS from the hero's tile; returns the steer vector to the next waypoint, or null
    _route(d, hero) {
        const W = d.W, H = d.H, n = W * H;
        if (this._n !== n) { this._dist = new Int32Array(n); this._from = new Int32Array(n); this._q = new Int32Array(n); this._n = n; }
        const dist = this._dist, from = this._from, q = this._q;
        dist.fill(-1);
        const ht = d.tileAt(hero.x, hero.y);
        let head = 0, tail = 0;
        dist[ht] = 0; from[ht] = ht; q[tail++] = ht;
        const keys = d.hero.keys;
        let exit = -1, key = -1, food = -1, bonus = -1;
        while (head < tail) {
            const i = q[head++], x = i % W, y = (i / W) | 0, di = dist[i];
            const t = d.tile[i], it = d.item[i];
            if (t === Tile.Exit && exit < 0) exit = i;
            if (it === Item.Key && key < 0) key = i;
            if ((it === Item.Food || it === Item.Jug) && food < 0) food = i;
            if ((it === Item.Chest || it === Item.Potion || (it === Item.Key && keys > 0) || ((it === Item.Food || it === Item.Jug) && hero.hp < 520)) && bonus < 0 && di <= this.greed) bonus = i;
            for (let k = 0; k < 8; k++) {
                const nx = x + DX8[k], ny = y + DY8[k];
                if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                const ni = ny * W + nx;
                if (dist[ni] >= 0 || !this._open(d, ni, keys)) continue;
                if ((k & 1) === 1 && (!this._open(d, y * W + nx, keys) || !this._open(d, ny * W + x, keys))) continue;
                dist[ni] = di + 1; from[ni] = i; q[tail++] = ni;
            }
        }
        let goal = -1;
        if (hero.hp < this.hungry && food >= 0 && dist[food] <= 20) goal = food;
        else if (exit < 0) goal = key;
        else if (bonus >= 0) goal = bonus;
        else goal = exit;
        if (goal < 0) return null;
        if (goal === ht) { const gx = (goal % W) * TS + 8, gy = ((goal / W) | 0) * TS + 8; return { vx: gx - hero.x, vy: gy - hero.y }; }
        let s = goal;
        while (from[s] !== ht) s = from[s];
        // aim at the next tile's centre; once the hero's box is inside the current tile's lane, look one further
        const sx = (s % W) * TS + 8, sy = ((s / W) | 0) * TS + 8;
        return { vx: sx - hero.x, vy: sy - hero.y };
    }

    _open(d, i, keys) {
        const t = d.tile[i];
        if (t === Tile.Wall || d.genAt[i] >= 0) return false;
        if (t === Tile.Door) return keys > 0;
        return true;
    }
}

// 8-way direction index nearest a vector (screen space; 0 = up, clockwise)
export function dir8(vx, vy) {
    const a = Math.atan2(vy, vx);
    return ((Math.round(a / (Math.PI / 4)) + 2) % 8 + 8) % 8;
}

