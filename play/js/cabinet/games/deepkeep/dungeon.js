// THE NODE · world 1 · THE DEEP KEEP · THE RULES of one level (deterministic for a seed).
//
// The world is 16 px tiles; everything moves freely in pixels on top of them (8 directions for the hero).
//   HERO     walks 8 ways; HOLD A = he plants his feet and throws axes the way the stick points (the
//            way he faces when it is centred), at most two in the air; B = a potion: every monster in
//            the window dies and every generator in it takes a hit. Health DRAINS every second; a plate
//            or a jug puts 100 back. A key opens the whole run of door it touches. The stairs end the level.
//   CROWDS   monsters and the hero are solid to each other, so a horde jams a corridor and can box you in;
//            you shoot your way out. They find you with a flow field (BFS from the hero's tile) out to
//            `aggro` steps; further off they wait.
//   GHOST    fast, bursts on you (big hit) and is gone.  BRUTE clubs you while it touches you.
//   IMP      keeps its distance and throws fire when it can see you.   WARLOCK blinks out (can't be hit
//            then) and in.   WRAITH drifts through the crowd, drinks health while it touches you until it
//            is full, axes only stagger it; a potion banishes it (500).
//   GENERATORS spawn their monster next to themselves while you are near (about a screen away); three
//            axe hits turn one to rubble. Live monsters are capped (maxMonsters): a full keep waits.
// MERCY (credit 5, `mercy`): no drain, half damage, health never below 50, and a guide path to the next
// key / the stairs that the round's autopilot walks when the stick is let go.
// No DOM, no Math.random: SystemRandom only, plain doubles (no C# twin to match bit for bit).
import { SystemRandom, SoundCue } from '../../sdk/index.js';
import { LEVELS, parseLevel, Tile, Item, Mon } from './levels.js';

export const TS = 16;
export const VIEW_W = 236, VIEW_H = 224;              // the playfield window (the renderer draws exactly this)
export const DX8 = Object.freeze([0, 1, 1, 1, 0, -1, -1, -1]);
export const DY8 = Object.freeze([-1, -1, 0, 1, 1, 1, 0, -1]);
const R2 = Math.SQRT1_2;

export const Outcome = Object.freeze({ None: 0, Exit: 1, Dead: 2 });
export const Fx = Object.freeze({ Puff: 0, Clink: 1, Rubble: 2, Door: 3, Blast: 4, Text: 5, Shatter: 6, Sparkle: 7, Sated: 8, Burst: 9 });

// the monster book: hit points (axe hits), pixels a second, box half-size, damage (health, before the
// damage knob), attack rate (s), score. The wraith drinks `drain` a second until it has taken drainMax.
export const MonInfo = Object.freeze([
    { hp: 1, speed: 50, half: 6, dmg: 56, rate: 0, score: 10 },                                        // GHOST
    { hp: 2, speed: 40, half: 6, dmg: 22, rate: 0.6, score: 20 },                                      // BRUTE
    { hp: 1, speed: 34, half: 6, dmg: 13, rate: 0.7, score: 30, bolt: 35, boltEvery: 2.8, boltRange: 7 },   // IMP
    { hp: 2, speed: 38, half: 6, dmg: 28, rate: 0.6, score: 40, seen: 1.5, unseen: 1.1 },              // WARLOCK
    { hp: 1, speed: 44, half: 6, drain: 120, drainMax: 300, score: 500 },                               // WRAITH
]);

export const HERO_HALF = 5;
const AXE_SPEED = 220, AXE_LIFE = 0.7, AXE_EVERY = 0.16, AXES = 3;
const BOLT_SPEED = 118, BOLT_LIFE = 2.2;
const GEN_HP = 3, GEN_WAKE_X = 9, GEN_WAKE_Y = 8;
const AGGRO = 14;

function newMon() {
    return { alive: false, type: 0, x: 0, y: 0, hp: 0, cd: 0, shot: 0, stun: 0, flash: 0, face: 4, walk: 0, moving: false,
             blink: 0, hidden: false, drained: 0, swing: 0, id: 0, fx: 0, fy: 0 };
}

export class Dungeon {
    constructor(seed) {
        this.rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        // knobs (the round sets these)
        this.heroSpeed = 70; this.drain = 2.6; this.damage = 1; this.spawnEvery = 2.3; this.maxMonsters = 44;
        this.foodValue = 100; this.mercy = false; this.brood = 4;
        this.cues = null;

        this.hero = { x: 0, y: 0, hp: 700, keys: 0, potions: 1, face: 4, walk: 0, moving: false, firing: false, fireCd: 0,
                      hurt: 0, ward: 0, stuck: 0, hurtCueCd: 0, beat: 0, throwT: 0 };
        this.score = 0;
        this.levelIdx = -1; this.L = null; this.W = 0; this.H = 0;
        this.tile = null; this.item = null; this.torch = null;
        this.gens = []; this.genAt = null;
        this.mons = []; this.live = 0; this._nextId = 1;
        this.axes = []; this.bolts = []; this.fx = [];
        this.levelTime = 0; this.blastT = 99; this.blastX = 0; this.blastY = 0;
        this.dist = null; this._q = null; this._flowTile = -1; this._flowDirty = true;
        this.guide = []; this._guideTile = -1; this._guideDirty = true;
        this.serial = 0;                                 // bumps every level load (the renderer caches per level)

        // tallies (Lab stats)
        this.st = { kills: 0, ghostHits: 0, gensBroken: 0, potions: 0, food: 0, jugsSmashed: 0, keys: 0, chests: 0,
                    dmg: 0, drained: 0, wraithDrain: 0, boltsHit: 0, axes: 0, doors: 0 };
    }

    // ------------------------------------------------------------------ setup
    newGame(hp, potions) {
        const h = this.hero;
        h.hp = hp; h.keys = 0; h.potions = potions; this.score = 0;
    }

    loadLevel(idx) {
        const L = parseLevel(LEVELS[Math.max(0, Math.min(LEVELS.length - 1, idx))]);
        this.levelIdx = idx; this.L = L; this.W = L.W; this.H = L.H; this.serial++;
        const n = L.W * L.H;
        this.tile = L.tile; this.item = L.item; this.torch = L.torch;
        this.genAt = new Int16Array(n).fill(-1);
        this.gens = L.gens.map((g, i) => {
            this.genAt[g.ty * L.W + g.tx] = i;
            return { type: g.type, tx: g.tx, ty: g.ty, hp: GEN_HP, alive: true, flash: 0,
                     timer: 0.6 + this.rng.nextDouble() * this.spawnEvery * L.pace };
        });
        this.mons = [];
        for (let i = 0; i < this.maxMonsters; i++) this.mons.push(newMon());
        this.live = 0;
        this.axes = []; this.bolts = []; this.fx = [];
        for (const m of L.mons) this._spawn(m.type, m.tx * TS + 8, m.ty * TS + 8);
        // every generator starts ringed by its brood (the tiles round it, nearest first, a few skipped)
        for (const g of this.gens) {
            let n = 0;
            for (let r = 1; r <= 2 && n < this.brood; r++)
                for (let dy = -r; dy <= r && n < this.brood; dy++)
                    for (let dx = -r; dx <= r && n < this.brood; dx++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !this.isOpen(g.tx + dx, g.ty + dy)) continue;
                        const i = (g.ty + dy) * L.W + g.tx + dx;
                        if (L.item[i] || this.rng.nextDouble() < 0.3) continue;
                        const x = (g.tx + dx) * TS + 8, y = (g.ty + dy) * TS + 8;
                        if (Math.abs(x - (L.sx * TS + 8)) < 40 && Math.abs(y - (L.sy * TS + 8)) < 40) continue;
                        if (this._monNear(x, y)) continue;
                        if (this._spawn(g.type, x, y)) n++;
                    }
        }
        const h = this.hero;
        h.x = L.sx * TS + 8; h.y = L.sy * TS + 8; h.face = 4; h.walk = 0; h.moving = false; h.firing = false;
        h.fireCd = 0; h.hurt = 0; h.ward = 0; h.stuck = 0; h.throwT = 0;
        this.levelTime = 0; this.blastT = 99;
        this.dist = new Int16Array(n); this._q = new Int32Array(n); this._flowDirty = true; this._flowTile = -1;
        this.bHead = new Int16Array(n); this.bNext = new Int16Array(this.maxMonsters);
        this._guideDirty = true; this._guideTile = -1; this.guide = [];
        this._flow();
    }

    // ------------------------------------------------------------------ geometry
    tileAt(px, py) { return Math.floor(py / TS) * this.W + Math.floor(px / TS); }
    isOpen(tx, ty) {                                     // walkable for the path finders (no wall, shut door, generator)
        if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return false;
        const i = ty * this.W + tx, t = this.tile[i];
        return (t === Tile.Floor || t === Tile.Exit) && this.genAt[i] < 0;
    }
    _solid(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
        const i = ty * this.W + tx, t = this.tile[i];
        return t === Tile.Wall || t === Tile.Door || this.genAt[i] >= 0;
    }
    // does a box (centre, half-size) overlap a solid tile?
    _boxSolid(x, y, hs) {
        const x0 = Math.floor((x - hs) / TS), x1 = Math.floor((x + hs - 0.001) / TS);
        const y0 = Math.floor((y - hs) / TS), y1 = Math.floor((y + hs - 0.001) / TS);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this._solid(tx, ty)) return true;
        return false;
    }

    // the window the player sees (the renderer uses the same numbers)
    camX() { const w = this.W * TS; return w <= VIEW_W ? -((VIEW_W - w) >> 1) : Math.max(0, Math.min(w - VIEW_W, Math.round(this.hero.x) - (VIEW_W >> 1))); }
    camY() { const h = this.H * TS; return h <= VIEW_H ? -((VIEW_H - h) >> 1) : Math.max(0, Math.min(h - VIEW_H, Math.round(this.hero.y) - (VIEW_H >> 1))); }
    inView(x, y, pad = 0) {
        const cx = this.camX(), cy = this.camY();
        return x >= cx - pad && x < cx + VIEW_W + pad && y >= cy - pad && y < cy + VIEW_H + pad;
    }

    // ------------------------------------------------------------------ the flow field
    _flow() {
        const h = this.hero, W = this.W, dist = this.dist, q = this._q;
        const ht = this.tileAt(h.x, h.y);
        if (!this._flowDirty && ht === this._flowTile) return;
        this._flowDirty = false; this._flowTile = ht;
        dist.fill(-1);
        let head = 0, tail = 0;
        dist[ht] = 0; q[tail++] = ht;
        while (head < tail) {
            const i = q[head++], x = i % W, y = (i / W) | 0, d = dist[i];
            if (d >= AGGRO + 2) continue;
            for (let k = 0; k < 8; k++) {
                const nx = x + DX8[k], ny = y + DY8[k];
                if (!this.isOpen(nx, ny)) continue;
                if ((k & 1) === 1 && (!this.isOpen(x + DX8[k], y) || !this.isOpen(x, y + DY8[k]))) continue;   // no corner cutting
                const ni = ny * W + nx;
                if (dist[ni] >= 0) continue;
                dist[ni] = d + 1; q[tail++] = ni;
            }
        }
    }

    // ------------------------------------------------------------------ time
    // intent: { mx, my (-1/0/1, screen space), fire (held), potion (pressed) }
    tick(dt, intent) {
        const n = Math.max(1, Math.ceil(dt * 60 - 1e-6));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            const o = this._step(h, intent, i === 0);
            if (o !== Outcome.None) return o;
        }
        return Outcome.None;
    }

    _step(h, it, first) {
        this.levelTime += h;
        const hero = this.hero;
        if (first && it.potion) this.usePotion();
        this._rebuildBuckets();
        this._moveHero(h, it);
        const got = this._pickup();
        if (this.tile[this.tileAt(hero.x, hero.y)] === Tile.Exit) return Outcome.Exit;
        this._flow();
        if (this.mercy) this._updateGuide();
        this._stepAxes(h);
        this._stepMonsters(h);
        this._stepBolts(h);
        this._stepGens(h);
        this._stepFx(h);
        // living costs health
        if (!this.mercy && this.drain > 0) { const d = this.drain * h; hero.hp -= d; this.st.drained += d; }
        if (hero.hurt > 0) hero.hurt -= h;
        if (hero.ward > 0) hero.ward -= h;
        if (hero.hurtCueCd > 0) hero.hurtCueCd -= h;
        if (hero.throwT > 0) hero.throwT -= h;
        this.blastT += h;
        if (hero.hp < 150 && hero.hp > 0) { hero.beat -= h; if (hero.beat <= 0) { hero.beat = 1; this._cue(SoundCue.Tick); } }
        else hero.beat = 0;
        if (this.mercy && hero.hp < 50) { hero.hp = 50; hero.ward = 0.4; }
        if (hero.hp <= 0) { hero.hp = 0; return Outcome.Dead; }
        return got;
    }

    // ------------------------------------------------------------------ the hero
    _moveHero(h, it) {
        const hero = this.hero;
        if (hero.fireCd > 0) hero.fireCd -= h;
        const mx = it.mx | 0, my = it.my | 0;
        hero.firing = !!it.fire;
        if (hero.firing) {
            // feet planted: turn to the stick and throw
            if (mx !== 0 || my !== 0) hero.face = dirOf(mx, my);
            hero.moving = false; hero.stuck = 0;
            if (hero.fireCd <= 0 && this.axes.length < AXES) this._throw(hero.face);
            return;
        }
        if (mx === 0 && my === 0) { hero.moving = false; hero.stuck = 0; return; }
        hero.face = dirOf(mx, my);
        const sp = this.heroSpeed * h * (mx !== 0 && my !== 0 ? R2 : 1);
        const ox = hero.x, oy = hero.y;
        if (mx !== 0) this._heroAxis(mx * sp, 0, my === 0);
        if (my !== 0) this._heroAxis(0, my * sp, mx === 0);
        const moved = Math.abs(hero.x - ox) + Math.abs(hero.y - oy);
        hero.moving = moved > 0.01;
        hero.walk += moved;
        if (moved < sp * 0.25) hero.stuck += h; else hero.stuck = 0;
    }

    // one axis of the hero's move, with the door check and a corner assist (a straight push into a
    // corridor mouth slides him onto its line, as arcade mazes do)
    _heroAxis(dx, dy, assist) {
        const hero = this.hero, hs = HERO_HALF;
        const nx = hero.x + dx, ny = hero.y + dy;
        if (!this._heroBlocked(nx, ny)) { hero.x = nx; hero.y = ny; return true; }
        // a door in the way and a key in hand: the whole run opens
        if (hero.keys > 0) {
            const x0 = Math.floor((nx - hs) / TS), x1 = Math.floor((nx + hs - 0.001) / TS);
            const y0 = Math.floor((ny - hs) / TS), y1 = Math.floor((ny + hs - 0.001) / TS);
            for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
                if (this.tile[ty * this.W + tx] === Tile.Door) { this._openDoor(tx, ty); return false; }
        }
        if (!assist) return false;
        const step = Math.abs(dx + dy);
        if (dx !== 0) {
            const base = Math.floor(hero.y / TS) * TS + 8;
            for (const c of [base, base - TS, base + TS]) {
                if (Math.abs(c - hero.y) > 7 || this._heroBlocked(nx, c)) continue;
                const s = Math.sign(c - hero.y) * Math.min(step, Math.abs(c - hero.y));
                if (!this._heroBlocked(hero.x, hero.y + s)) { hero.y += s; return true; }
            }
        } else {
            const base = Math.floor(hero.x / TS) * TS + 8;
            for (const c of [base, base - TS, base + TS]) {
                if (Math.abs(c - hero.x) > 7 || this._heroBlocked(c, ny)) continue;
                const s = Math.sign(c - hero.x) * Math.min(step, Math.abs(c - hero.x));
                if (!this._heroBlocked(hero.x + s, hero.y)) { hero.x += s; return true; }
            }
        }
        return false;
    }

    _heroBlocked(x, y) {
        if (this._boxSolid(x, y, HERO_HALF)) return true;
        return this._monAt(x, y, HERO_HALF, -1, true) >= 0;
    }

    _openDoor(tx, ty) {
        const W = this.W, st = [ty * W + tx];
        this.hero.keys--; this.st.doors++;
        this.tile[st[0]] = Tile.Floor;
        while (st.length) {
            const i = st.pop(), x = i % W, y = (i / W) | 0;
            this._fx(Fx.Door, x * TS + 8, y * TS + 8);
            for (let k = 0; k < 8; k += 2) {
                const n = (y + DY8[k]) * W + x + DX8[k];
                if (this.tile[n] === Tile.Door) { this.tile[n] = Tile.Floor; st.push(n); }
            }
        }
        this._flowDirty = true; this._guideDirty = true;
        this._cue(SoundCue.Bonus);
    }

    _throw(dir) {
        const hero = this.hero;
        const ox = DX8[dir] * 6, oy = DY8[dir] * 6;
        const k = (dir & 1) ? R2 : 1;
        this.axes.push({ x: hero.x + ox, y: hero.y + oy, vx: DX8[dir] * AXE_SPEED * k, vy: DY8[dir] * AXE_SPEED * k, t: 0, dir });
        hero.fireCd = AXE_EVERY; hero.throwT = 0.12;
        this.st.axes++;
    }

    usePotion() {
        const hero = this.hero;
        if (hero.potions <= 0) return false;
        hero.potions--; this.st.potions++;
        this.blastT = 0; this.blastX = hero.x; this.blastY = hero.y;
        this._fx(Fx.Blast, hero.x, hero.y);
        for (const m of this.mons) if (m.alive && this.inView(m.x, m.y, 6)) this._kill(m, true);
        for (const g of this.gens) if (g.alive && this.inView(g.tx * TS + 8, g.ty * TS + 8)) this._hitGen(g);
        this.bolts.length = 0;
        this._cue(SoundCue.Bonus);
        return true;
    }

    _pickup() {
        const hero = this.hero, W = this.W;
        const x0 = Math.floor((hero.x - HERO_HALF) / TS), x1 = Math.floor((hero.x + HERO_HALF) / TS);
        const y0 = Math.floor((hero.y - HERO_HALF) / TS), y1 = Math.floor((hero.y + HERO_HALF) / TS);
        for (let ty = y0; ty <= y1; ty++)
            for (let tx = x0; tx <= x1; tx++) {
                const i = ty * W + tx, it = this.item[i];
                if (!it) continue;
                const cx = tx * TS + 8, cy = ty * TS + 8;
                if (Math.abs(hero.x - cx) > 10 || Math.abs(hero.y - cy) > 10) continue;
                this.item[i] = Item.None;
                this._guideDirty = true;
                switch (it) {
                    case Item.Key: hero.keys++; this.score += 100; this.st.keys++; this._text(cx, cy, 'KEY'); break;
                    case Item.Food: case Item.Jug: hero.hp += this.foodValue; this.st.food++; this._text(cx, cy, '+' + this.foodValue); break;
                    case Item.Potion: hero.potions = Math.min(9, hero.potions + 1); this.score += 50; this._text(cx, cy, 'POTION'); break;
                    case Item.Chest: this.score += 200; this.st.chests++; this._text(cx, cy, '200'); this._fx(Fx.Sparkle, cx, cy); break;
                }
                this._cue(SoundCue.Bonus);
            }
        return Outcome.None;
    }

    _hurt(amount) {
        const hero = this.hero;
        if (this.mercy) amount *= 0.5;
        amount *= this.damage;
        hero.hp -= amount; this.st.dmg += amount;
        return amount;
        hero.hurt = 0.14;
        if (hero.hurtCueCd <= 0) { this._cue(SoundCue.Miss); hero.hurtCueCd = 0.25; }
    }

    // ------------------------------------------------------------------ axes
    _stepAxes(h) {
        const W = this.W;
        for (let a = this.axes.length - 1; a >= 0; a--) {
            const ax = this.axes[a];
            ax.t += h;
            let dead = ax.t > AXE_LIFE;
            // two half steps so a fast axe cannot skip a 12 px monster
            for (let s = 0; s < 2 && !dead; s++) {
                ax.x += ax.vx * h * 0.5; ax.y += ax.vy * h * 0.5;
                const tx = Math.floor(ax.x / TS), ty = Math.floor(ax.y / TS), i = ty * W + tx;
                const gi = this.genAt[i];
                if (gi >= 0) { this._hitGen(this.gens[gi]); dead = true; break; }
                if (this.tile[i] === Tile.Wall || this.tile[i] === Tile.Door) { this._fx(Fx.Clink, ax.x - ax.vx * h * 0.5, ax.y - ax.vy * h * 0.5); dead = true; break; }
                if (this.item[i] === Item.Jug && Math.abs(ax.x - (tx * TS + 8)) < 7 && Math.abs(ax.y - (ty * TS + 8)) < 7) {
                    this.item[i] = Item.None; this.st.jugsSmashed++; this._fx(Fx.Shatter, tx * TS + 8, ty * TS + 8); this._guideDirty = true;
                    dead = true; break;
                }
                for (let b = this.bolts.length - 1; b >= 0; b--) {
                    const bo = this.bolts[b];
                    if (Math.abs(bo.x - ax.x) < 6 && Math.abs(bo.y - ax.y) < 6) { this.bolts.splice(b, 1); this._fx(Fx.Clink, ax.x, ax.y); dead = true; break; }
                }
                if (dead) break;
                const mi = this._monAt(ax.x, ax.y, 3, -1, false);
                if (mi >= 0) {
                    const m = this.mons[mi];
                    if (m.type === Mon.Wraith) {
                        m.stun = 0.45; m.flash = 0.08;
                        const k = 5 / Math.max(1, Math.hypot(ax.vx, ax.vy));
                        this._shove(m, ax.vx * k, ax.vy * k);
                        this._fx(Fx.Clink, ax.x, ax.y);
                        this._cue(SoundCue.Hit);
                    } else {
                        m.hp--; m.flash = 0.1;
                        if (m.hp <= 0) this._kill(m, false);
                        this._cue(SoundCue.Hit);
                    }
                    dead = true;
                }
            }
            if (dead) this.axes.splice(a, 1);
        }
    }

    _hitGen(g) {
        if (!g.alive) return;
        g.hp--; g.flash = 0.12; this.score += 20;
        this._cue(SoundCue.Hit);
        if (g.hp <= 0) {
            g.alive = false; this.genAt[g.ty * this.W + g.tx] = -1; this.st.gensBroken++;
            this.score += 200;
            this._fx(Fx.Rubble, g.tx * TS + 8, g.ty * TS + 8);
            this._text(g.tx * TS + 8, g.ty * TS + 2, '200');
            this._flowDirty = true; this._guideDirty = true;
            this._cue(SoundCue.Bonus);
        }
    }

    _kill(m, byPotion) {
        const info = MonInfo[m.type];
        m.alive = false; this.live--;
        if (m.type === Mon.Wraith) {
            if (!byPotion) return;
            this.score += info.score;
            this._fx(Fx.Burst, m.x, m.y);
            this._text(m.x, m.y - 8, '500');
            this.st.kills++;
            return;
        }
        this.score += info.score; this.st.kills++;
        this._fx(Fx.Puff, m.x, m.y, m.type);
    }

    // ------------------------------------------------------------------ monsters
    _rebuildBuckets() {
        this.bHead.fill(-1);
        const ms = this.mons;
        for (let i = 0; i < ms.length; i++) {
            const m = ms[i];
            if (!m.alive || m.type === Mon.Wraith) continue;   // the wraith passes through the crowd
            const t = this.tileAt(m.x, m.y);
            this.bNext[i] = this.bHead[t]; this.bHead[t] = i;
        }
    }

    // the first monster whose box overlaps this one (self excluded); `wraiths` = count the wraith too
    _monAt(x, y, hs, self, wraiths) {
        const W = this.W, tx = Math.floor(x / TS), ty = Math.floor(y / TS);
        for (let yy = ty - 1; yy <= ty + 1; yy++) {
            if (yy < 0 || yy >= this.H) continue;
            for (let xx = tx - 1; xx <= tx + 1; xx++) {
                if (xx < 0 || xx >= W) continue;
                for (let j = this.bHead[yy * W + xx]; j >= 0; j = this.bNext[j]) {
                    if (j === self) continue;
                    const m = this.mons[j];
                    if (!m.alive) continue;
                    const r = hs + MonInfo[m.type].half;
                    if (Math.abs(m.x - x) < r && Math.abs(m.y - y) < r) return j;
                }
            }
        }
        if (wraiths)
            for (let j = 0; j < this.mons.length; j++) {
                const m = this.mons[j];
                if (j === self || !m.alive || m.type !== Mon.Wraith) continue;
                const r = hs + MonInfo[m.type].half;
                if (Math.abs(m.x - x) < r && Math.abs(m.y - y) < r) return j;
            }
        return -1;
    }

    _monNear(x, y) { for (const m of this.mons) if (m.alive && Math.abs(m.x - x) < 12 && Math.abs(m.y - y) < 12) return true; return false; }

    _spawn(type, x, y) {
        const ms = this.mons;
        for (let i = 0; i < ms.length; i++) {
            const m = ms[i];
            if (m.alive) continue;
            const info = MonInfo[type];
            m.alive = true; m.type = type; m.x = x; m.y = y; m.hp = info.hp; m.cd = 0.3; m.stun = 0; m.flash = 0;
            m.face = 4; m.walk = this.rng.nextDouble() * 16; m.moving = false; m.drained = 0; m.swing = 0;
            m.shot = info.boltEvery ? info.boltEvery * (0.4 + 0.6 * this.rng.nextDouble()) : 0;
            m.blink = info.seen ? this.rng.nextDouble() * (info.seen + info.unseen) : 0; m.hidden = false;
            m.id = this._nextId++;
            this.live++;
            return m;
        }
        return null;
    }

    _stepMonsters(h) {
        const hero = this.hero, W = this.W, dist = this.dist;
        const ms = this.mons;
        for (let i = 0; i < ms.length; i++) {
            const m = ms[i];
            if (!m.alive) continue;
            const info = MonInfo[m.type];
            if (m.flash > 0) m.flash -= h;
            if (m.cd > 0) m.cd -= h;
            if (m.swing > 0) m.swing -= h;
            if (info.seen) {                                  // the warlock's blink
                m.blink += h;
                const cyc = info.seen + info.unseen;
                if (m.blink >= cyc) m.blink -= cyc;
                m.hidden = m.blink >= info.seen;
            }
            if (m.stun > 0) { m.stun -= h; m.moving = false; continue; }
            const t = this.tileAt(m.x, m.y), d = dist[t];
            if (d < 0 || d > AGGRO) { m.moving = false; continue; }   // it has not heard you yet
            let ax, ay;
            const hx = hero.x - m.x, hy = hero.y - m.y;
            if (d <= 1 || m.type === Mon.Wraith && d <= 3) { ax = hx; ay = hy; }
            else {
                const x = t % W, y = (t / W) | 0;
                let best = -1, bd = d, bdd = 1e9;
                for (let k = 0; k < 8; k++) {
                    const nx = x + DX8[k], ny = y + DY8[k];
                    if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
                    const nd = dist[ny * W + nx];
                    if (nd < 0 || nd > bd) continue;
                    if ((k & 1) === 1 && (!this.isOpen(x + DX8[k], y) || !this.isOpen(x, y + DY8[k]))) continue;
                    const ex = nx * TS + 8 - hero.x, ey = ny * TS + 8 - hero.y, dd = ex * ex + ey * ey;
                    if (nd < bd || dd < bdd) { best = k; bd = nd; bdd = dd; }
                }
                if (best < 0) { ax = hx; ay = hy; }
                else { ax = (x + DX8[best]) * TS + 8 - m.x; ay = (y + DY8[best]) * TS + 8 - m.y; }
            }
            // the imp keeps its distance and throws when it sees you
            if (m.type === Mon.Imp) {
                m.shot -= h;
                if (d <= info.boltRange) {
                    const los = this._los(m.x, m.y, hero.x, hero.y);
                    if (los && m.shot <= 0) {
                        const len = Math.max(1, Math.hypot(hx, hy));
                        this.bolts.push({ x: m.x, y: m.y, vx: hx / len * BOLT_SPEED, vy: hy / len * BOLT_SPEED, t: 0 });
                        m.shot = info.boltEvery * (0.75 + 0.5 * this.rng.nextDouble());
                        m.swing = 0.25;
                    }
                    if (los && d <= 3) { ax = -hx; ay = -hy; }            // back off
                    else if (los && d <= 5) { ax = 0; ay = 0; }
                }
            }
            const len = Math.hypot(ax, ay);
            if (len < 0.01) { m.moving = false; this._touch(m, info, h); continue; }
            const sp = info.speed * h;
            const vx = ax / len * sp, vy = ay / len * sp;
            m.fx = ax / len; m.fy = ay / len;
            m.face = dirOf(Math.abs(m.fx) > 0.38 ? Math.sign(m.fx) : 0, Math.abs(m.fy) > 0.38 ? Math.sign(m.fy) : 0);
            const ox = m.x, oy = m.y;
            this._monMove(m, i, vx, 0);
            this._monMove(m, i, 0, vy);
            const moved = Math.abs(m.x - ox) + Math.abs(m.y - oy);
            m.moving = moved > 0.02; m.walk += moved;
            this._touch(m, info, h);
        }
    }

    _monMove(m, i, dx, dy) {
        if (dx === 0 && dy === 0) return;
        const hs = MonInfo[m.type].half, hero = this.hero;
        const nx = m.x + dx, ny = m.y + dy;
        if (this._boxSolid(nx, ny, hs)) return;
        const r = hs + HERO_HALF;
        if (Math.abs(hero.x - nx) < r && Math.abs(hero.y - ny) < r) return;
        if (m.type !== Mon.Wraith && this._monAt(nx, ny, hs, i, false) >= 0) return;
        m.x = nx; m.y = ny;
    }

    _shove(m, dx, dy) { const i = this.mons.indexOf(m); this._monMove(m, i, dx, 0); this._monMove(m, i, 0, dy); }

    _touch(m, info, h) {
        const hero = this.hero, r = info.half + HERO_HALF + 1.5;
        if (Math.abs(hero.x - m.x) >= r || Math.abs(hero.y - m.y) >= r) return;
        switch (m.type) {
            case Mon.Ghost:
                this._hurt(info.dmg); this.st.ghostHits++;
                m.alive = false; this.live--;
                this._fx(Fx.Puff, m.x, m.y, m.type);
                break;
            case Mon.Wraith: {
                const took = this._hurt(info.drain * h);
                this.st.wraithDrain += took; m.drained += took;
                if (m.drained >= info.drainMax) { m.alive = false; this.live--; this._fx(Fx.Sated, m.x, m.y); }
                break;
            }
            default:
                if (m.cd <= 0) { this._hurt(info.dmg); m.cd = info.rate; m.swing = 0.22; }
        }
    }

    // line of sight between two points (tiles sampled every 6 px)
    _los(x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.hypot(dx, dy) / 6);
        for (let k = 1; k < n; k++) {
            const x = x0 + dx * k / n, y = y0 + dy * k / n;
            const i = this.tileAt(x, y), t = this.tile[i];
            if (t === Tile.Wall || t === Tile.Door) return false;
        }
        return true;
    }

    _stepBolts(h) {
        const hero = this.hero;
        for (let b = this.bolts.length - 1; b >= 0; b--) {
            const bo = this.bolts[b];
            bo.t += h; bo.x += bo.vx * h; bo.y += bo.vy * h;
            const t = this.tile[this.tileAt(bo.x, bo.y)];
            if (bo.t > BOLT_LIFE || t === Tile.Wall || t === Tile.Door) { this._fx(Fx.Clink, bo.x, bo.y, 1); this.bolts.splice(b, 1); continue; }
            if (Math.abs(bo.x - hero.x) < HERO_HALF + 3 && Math.abs(bo.y - hero.y) < HERO_HALF + 3) {
                this._hurt(MonInfo[Mon.Imp].bolt); this.st.boltsHit++;
                this._fx(Fx.Clink, bo.x, bo.y, 1);
                this.bolts.splice(b, 1);
            }
        }
    }

    // ------------------------------------------------------------------ generators
    _stepGens(h) {
        const hero = this.hero;
        const htx = Math.floor(hero.x / TS), hty = Math.floor(hero.y / TS);
        for (const g of this.gens) {
            if (!g.alive) continue;
            if (g.flash > 0) g.flash -= h;
            if (Math.abs(g.tx - htx) > GEN_WAKE_X || Math.abs(g.ty - hty) > GEN_WAKE_Y) continue;
            g.timer -= h;
            if (g.timer > 0) continue;
            if (this.live >= this.maxMonsters) { g.timer = 0.4; continue; }
            const k0 = this.rng.next(8);
            let spawned = false;
            for (let k = 0; k < 8 && !spawned; k++) {
                const d = (k0 + k) & 7, tx = g.tx + DX8[d], ty = g.ty + DY8[d];
                if (!this.isOpen(tx, ty)) continue;
                const x = tx * TS + 8, y = ty * TS + 8, hs = MonInfo[g.type].half;
                if (Math.abs(hero.x - x) < hs + HERO_HALF + 2 && Math.abs(hero.y - y) < hs + HERO_HALF + 2) continue;
                if (this._monAt(x, y, hs, -1, false) >= 0) continue;
                if (this._spawn(g.type, x, y)) { spawned = true; this._rebuildBuckets(); }
            }
            // smaller (hurt) generators breed a little slower
            g.timer = this.spawnEvery * this.L.pace * (0.7 + 0.6 * this.rng.nextDouble()) * (1 + (GEN_HP - g.hp) * 0.2);
            if (!spawned) g.timer *= 0.5;
        }
    }

    // ------------------------------------------------------------------ effects (drawing only)
    _fx(kind, x, y, a = 0, text = '') {
        if (this.fx.length >= 80) this.fx.shift();
        this.fx.push({ kind, x, y, t: 0, a, text });
    }
    _text(x, y, s) { this._fx(Fx.Text, x, y, 0, s); }
    _stepFx(h) {
        const fx = this.fx;
        let w = 0;
        for (let i = 0; i < fx.length; i++) { const f = fx[i]; f.t += h; if (f.t < 1.2) fx[w++] = f; }
        fx.length = w;
    }

    _cue(c) { if (this.cues) this.cues.emit(c); }

    // ------------------------------------------------------------------ mercy: the guide
    // BFS to the next thing that matters (the stairs, or a key while the stairs are locked away)
    goalPath(fromTile, keys) {
        const W = this.W, n = W * this.H, from = new Int32Array(n).fill(-1), q = this._q;
        let head = 0, tail = 0, found = -1;
        from[fromTile] = fromTile; q[tail++] = fromTile;
        const wantKey = !this._exitReachable(fromTile, keys);
        while (head < tail) {
            const i = q[head++], x = i % W, y = (i / W) | 0;
            if (wantKey ? this.item[i] === Item.Key : this.tile[i] === Tile.Exit) { found = i; break; }
            for (let k = 0; k < 8; k += 2) {
                const nx = x + DX8[k], ny = y + DY8[k], ni = ny * W + nx;
                if (nx < 0 || ny < 0 || nx >= W || ny >= this.H || from[ni] >= 0) continue;
                const t = this.tile[ni];
                if (t === Tile.Wall || this.genAt[ni] >= 0) continue;
                if (t === Tile.Door && keys <= 0) continue;
                from[ni] = i; q[tail++] = ni;
            }
        }
        const path = [];
        if (found < 0) return path;
        for (let i = found; i !== fromTile; i = from[i]) path.push(i);
        path.reverse();
        return path;
    }

    _exitReachable(fromTile, keys) {
        const W = this.W, n = W * this.H, seen = new Uint8Array(n), q = this._q;
        let head = 0, tail = 0;
        seen[fromTile] = 1; q[tail++] = fromTile;
        while (head < tail) {
            const i = q[head++], x = i % W, y = (i / W) | 0;
            if (this.tile[i] === Tile.Exit) return true;
            for (let k = 0; k < 8; k += 2) {
                const ni = (y + DY8[k]) * W + x + DX8[k];
                if (seen[ni]) continue;
                const t = this.tile[ni];
                if (t === Tile.Wall || this.genAt[ni] >= 0 || (t === Tile.Door && keys <= 0)) continue;
                seen[ni] = 1; q[tail++] = ni;
            }
        }
        return false;
    }

    _updateGuide() {
        const t = this.tileAt(this.hero.x, this.hero.y);
        if (!this._guideDirty && t === this._guideTile) return;
        this._guideDirty = false; this._guideTile = t;
        this.guide = this.goalPath(t, this.hero.keys);
    }

    // the mercy autopilot: the stick direction that walks the guide path
    autopilot() {
        const hero = this.hero, g = this.guide;
        if (g.length === 0) return null;
        const W = this.W;
        let i = g[0];
        if (g.length > 1) {
            const c = g[0], cx = (c % W) * TS + 8, cy = ((c / W) | 0) * TS + 8;
            if (Math.abs(hero.x - cx) < 3 && Math.abs(hero.y - cy) < 3) i = g[1];
        }
        const tx = (i % W) * TS + 8 - hero.x, ty = ((i / W) | 0) * TS + 8 - hero.y;
        return { mx: Math.abs(tx) > 1.5 ? Math.sign(tx) : 0, my: Math.abs(ty) > 1.5 ? Math.sign(ty) : 0 };
    }
}

// 8-way direction index of a stick (screen space)
export function dirOf(mx, my) {
    if (my < 0) return mx > 0 ? 1 : mx < 0 ? 7 : 0;
    if (my > 0) return mx > 0 ? 3 : mx < 0 ? 5 : 4;
    return mx > 0 ? 2 : mx < 0 ? 6 : 4;
}
