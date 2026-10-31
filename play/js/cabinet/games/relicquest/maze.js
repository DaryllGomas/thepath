// THE NODE · world 1 · RELIC QUEST on the Cabinet Engine · THE MAZE's rules.
//
// A 19 x 13 tile maze of 16 px blocks. The knight walks tile to tile: a held direction is taken at the
// next junction it fits, a released one is remembered for a moment (turnBuffer), and with nothing held
// he keeps walking until a wall, arcade-style; reversing works anywhere. Red gems lie in the corridors;
// the last one raises the RELIC on its plinth, and touching it clears the level. Green snakes patrol,
// half-hunting the knight (snakeChase at each junction); a snake's HEAD on the knight costs a life and
// puts everyone back on their start tiles (gems already taken stay taken).
//
// ADDED OVER UNITY (the cabinet's control panel is labelled TORCH and SWORD, the concept frames show the swing):
//   SWORD  a short swing the way the knight faces: a snake head inside the reach is STUNNED (coiled,
//          harmless, frozen) for stunSeconds. One swing, then a short recovery, so it cannot be spammed.
//   TORCH  torchesPerLevel a level: the flare stuns every snake at once for torchSeconds.
// MERCY (credit 5): snakesAsleep = they never wake, never move, never bite (the round's autopilot walks
// the knight to the next gem whenever the stick is let go).
//
// Everything a round needs to be replayed is in here and deterministic for a seed (SystemRandom, f32).
import { f32, SystemRandom, SoundCue } from '../../sdk/index.js';

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];                              // screen space: y grows DOWN

export const GW = 19, GH = 13;
export const Up = 0, Right = 1, Down = 2, Left = 3;

// '#' block, '.' floor, '*' gem, 'K' knight start, 'R' the relic's plinth, snake starts: 'S' always,
// 'T' the third snake and 'U' the fourth (snakeCap, a mercy knob, drops U first, then T)
const OldLevels = Object.freeze([
    Object.freeze([
        '###################',
        '#K.......#.......S#',
        '#.######.#.######.#',
        '#.#...*.....*...#.#',
        '#.#.#####.#####.#.#',
        '#*..#...*.*...#..*#',
        '###.#.##.R.##.#.###',
        '#*..#...*.*...#..*#',
        '#.#.#####.#####.#.#',
        '#.#...*.....*...#.#',
        '#.######.#.######.#',
        '#T......*#*......S#',
        '###################']),
    Object.freeze([
        '###################',
        '#K...*...#...*...S#',
        '#.######.#.######.#',
        '#.#*.....#.....*#.#',
        '#.#.###.###.###.#.#',
        '#*..#.........#..*#',
        '###.#.###.###.#.###',
        '#*...*###R###*...*#',
        '#.###.###.###.###.#',
        '#.#*.....*.....*#.#',
        '#.#.#####.#####.#.#',
        '#T.*....U....*...S#',
        '###################']),
]);

// Six temples, each carved from the cabinet's long-wall vocabulary.
export const Temples = [
    ['THE OUTER COURT', 'EVERY GEM RAISES THE RELIC'],
    ['THE GILDED GATES', 'TAKE THE KEY TO OPEN THE GATES'],
    ['THE SILKEN HALL', 'SWORD CUTS WEBS - TORCH CLEARS ALL'],
    ['THE WAKING TOMB', 'FIRST GEM WAKES THE STONE GUARDS'],
    ['THE NIGHT VAULT', 'TORCH REVEALS THE WHOLE MAZE'],
    ['THE RELIC CHAMBER', 'BREAK SIX SEALS TO BIND THE GUARDIAN'],
];
export const Levels = Object.freeze(Temples.map((_, n) => {
    const rows = OldLevels[n % 2].map(r => [...r]);
    if (n >= 2) {
        // New cross passages change the route rather than just the enemy pace.
        for (const [x,y] of (n === 2 ? [[4,4],[14,8]] : n === 3 ? [[9,3],[6,8]] : n === 4 ? [[9,1],[4,8],[14,4]] : [[6,6],[12,6],[9,8]])) rows[y][x] = '.';
        for (let y=1;y<12;y++) for(let x=1;x<18;x++)
            if(rows[y][x] === '.' && (x*7+y*3+n)%19 === 0) rows[y][x]='*';
    }
    return rows.map(r => r.join(''));
}));

export const Outcome = Object.freeze({ None: 0, Caught: 1, LevelClear: 2 });

function newMover() {
    return {
        x: 0, y: 0, sx: 0, sy: 0, dir: -1, t: 0, speed: 0,
        queued: -1, queuedAge: 0,                    // knight: the buffered turn and how long since it was held
        lastWant: -1,                                // knight: the stick last step (a fresh press = a change)
        facing: Right, faceX: 1,                     // knight: the way the sword swings / the sprite looks
        walk: 0,                                     // tiles walked (animation phase, drawing only)
        stun: 0, stunMax: 0,                         // snake: seconds left coiled, and the stun's length
        lastDir: Left,                               // snake: the way its head points while stopped
        hist: [],                                    // snake: tiles it came from, newest first (drawing only)
    };
}

export class RelicQuestMaze {
    constructor(seed) {
        this.wall = new Uint8Array(GW * GH);
        this.gem = new Uint8Array(GW * GH);
        this.gemsLeft = 0; this.gemsTotal = 0;
        this.relicX = 0; this.relicY = 0; this.relicUp = false; this.relicAge = 0;
        this.knight = newMover();
        this.snakes = [];
        this.lives = 3; this.score = 0; this.level = 0;
        this.levelTime = 0;                          // seconds of play on this level (drawing: the relic's glow)

        // tallies (Lab stats)
        this.caught = 0; this.stuns = 0; this.swings = 0; this.whiffs = 0; this.torchesUsed = 0; this.gemsTaken = 0;

        // ---- rules knobs, set by the round
        this.knightSpeed = f32(4.6);                 // tiles per second
        this.snakeSpeed = f32(3.3);
        this.snakeChase = f32(0.6);                  // chance a snake heads for the knight at a junction
        this.snakesAsleep = false;                   // mercy credit: they never wake
        this.snakeCap = 4;                           // snakes a maze at most (2 = only the 'S' pair)
        this.catchDist = f32(0.7);                   // head to knight, in tiles
        this.gemPoints = 100; this.relicPoints = 2500; this.stunPoints = 200;
        this.stunSeconds = f32(3);
        this.torchSeconds = f32(4);
        this.torchesPerLevel = 1;
        this.swordReach = f32(1.45);                 // tiles in front of the knight's centre
        this.swingTime = f32(0.3);                   // the blade is out this long
        this.swingRecover = f32(0.35);               // then the arm comes back
        this.turnBuffer = f32(0.3);                  // a released turn is kept this long
        this.lateTurn = f32(0.2);                    // a fresh press this far past a junction still takes it

        // ---- the sword and the torch
        this.torches = 0;
        this.swing = 0;                              // seconds of blade left (0 = sheathed)
        this.swingCd = 0;                            // recovery left
        this.swingHit = false; this.swingDir = Right;
        this.torchAge = f32(99);                     // seconds since the last flare (drawing)

        this.emit = () => {}; this.fx = []; this.invuln = 0;
        this.cues = null;                            // the round's CueBuffer (null = silent)
        this._rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        this._dist = new Int32Array(GW * GH); this._from = new Int32Array(GW * GH); this._q = new Int32Array(GW * GH);
    }

    static reverse(d) { return (d + 2) & 3; }
    static stepX(d) { return DX[d]; }
    static stepY(d) { return DY[d]; }
    open(x, y) { return x >= 0 && y >= 0 && x < GW && y < GH && this.wall[y * GW + x] === 0; }
    isWall(x, y) { return !(x >= 0 && y >= 0 && x < GW && y < GH) || this.wall[y * GW + x] !== 0; }
    hasGem(x, y) { return x >= 0 && y >= 0 && x < GW && y < GH && this.gem[y * GW + x] !== 0; }

    // continuous position in tiles (C# Mover.Pos) and the tile it is nearest (NearX/NearY)
    static px(m) { return m.dir < 0 ? m.x : f32(m.x + f32(DX[m.dir] * m.t)); }
    static py(m) { return m.dir < 0 ? m.y : f32(m.y + f32(DY[m.dir] * m.t)); }
    static nearX(m) { return m.dir >= 0 && m.t >= 0.5 ? m.x + DX[m.dir] : m.x; }
    static nearY(m) { return m.dir >= 0 && m.t >= 0.5 ? m.y + DY[m.dir] : m.y; }

    newGame(lives) { this.lives = lives; this.score = 0; this.level = 0; this.caught = 0; }

    loadLevel(idx) {
        this.level = idx + 1; this.fx = []; this.key = idx !== 1; this.keyX = 3; this.keyY = 1; this.bossHp = idx === 5 ? 6 : 0; this.bossBeat = -1; this.seals = new Set(); this.webs = new Set();
        const L = Levels[Math.max(0, Math.min(Levels.length - 1, idx))];
        this.snakes = [];
        this.gemsLeft = 0;
        for (let y = 0; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const c = L[y][x], i = y * GW + x;
                this.wall[i] = c === '#' ? 1 : 0;           // (T/U floors stay floor when the cap drops them)
                this.gem[i] = c === '*' ? 1 : 0;
                if (c === '*') this.gemsLeft++;
                if (c === 'K') { this.knight.sx = x; this.knight.sy = y; }
                if (c === 'S' || (c === 'T' && this.snakeCap >= 3) || (c === 'U' && this.snakeCap >= 4)) {
                    const s = newMover(); s.sx = x; s.sy = y; s.rank = c === 'S' ? 0 : c === 'T' ? 1 : 2; this.snakes.push(s);
                }
                if (c === 'R') { this.relicX = x; this.relicY = y; }
            }
        if (idx === 1) { this.wall[1*GW+8] = 2; this.wall[11*GW+10] = 2; }
        if (idx === 2) for(let i=0;i<GW*GH;i++) if(!this.wall[i] && i%7===0) this.webs.add(i);
        if(idx === 5) {
            const gems = [...this.gem.keys()].filter(i=>this.gem[i]);
            for(let j=0;j<6;j++) this.seals.add(gems[Math.floor(j*gems.length/6)]);
            this.snakes[0].guardian = true;
        }
        this.gemsTotal = this.gemsLeft;
        this.relicUp = false; this.relicAge = 0; this.levelTime = 0;
        this.torches = this.torchesPerLevel;
        this.resetPositions();
        if (idx === 3) for(const s of this.snakes) s.stun = s.stunMax = 999;
    }

    resetPositions() {
        this.invuln = 4;
        this._place(this.knight, this.knightSpeed);
        this.knight.facing = Right; this.knight.faceX = 1;
        for (const s of this.snakes) { this._place(s, this.snakeSpeed); s.stun = 0; s.lastDir = s.sx > GW / 2 ? Left : Right; }
        this.swing = 0; this.swingCd = 0; this.swingHit = false;
        this.torchAge = f32(99);
    }

    _place(m, speed) {
        m.x = m.sx; m.y = m.sy; m.dir = -1; m.queued = -1; m.queuedAge = 0; m.lastWant = -1; m.t = 0; m.speed = f32(speed);
        m.hist.length = 0;
    }

    // ------------------------------------------------------------------ the knight's hands
    // A = SWORD. Returns true if a swing started.
    swingSword() {
        if (this.swing > 0 || this.swingCd > 0) return false;
        this.swing = this.swingTime; this.swingHit = false; this.swingDir = this.knight.facing;
        this.swings++; this.emit("sword");
        const i = RelicQuestMaze.nearY(this.knight)*GW+RelicQuestMaze.nearX(this.knight);
        for(const j of [i,i+1,i-1,i+GW,i-GW]) this.webs.delete(j);
        return true;
    }

    // B = TORCH. Returns true if one was lit.
    lightTorch() {
        if (this.torches <= 0) return false;
        this.torches--; this.torchesUsed++;
        this.torchAge = 0; this.webs.clear(); this.emit("torch");
        for (const s of this.snakes) this._stun(s, this.torchSeconds);
        this._cue(SoundCue.Bonus);
        return true;
    }

    _stun(s, secs) {
        if (this.snakesAsleep) return;
        if (s.dir >= 0) s.lastDir = s.dir;
        if (s.stun < secs) { s.stun = f32(secs); s.stunMax = f32(secs); }
    }

    // ------------------------------------------------------------------ time
    // Advance dt seconds. `want` = the held direction this frame (-1 = nothing held).
    tick(dt, want) {
        dt = f32(dt);
        const n = Math.max(1, Math.ceil(f32(dt * 120)));
        const h = f32(dt / n);
        for (let i = 0; i < n; i++) {
            const o = this._step(h, want);
            if (o !== Outcome.None) return o;
        }
        return Outcome.None;
    }

    _step(h, want) {
        this.levelTime = f32(this.levelTime + h); this.hitFlash = Math.max(0,(this.hitFlash || 0)-h);
        this.invuln = Math.max(0, this.invuln-h);
        for(const f of this.fx) f.age += h;
        this.fx = this.fx.filter(f => f.age < 1);
        const tile = RelicQuestMaze.nearY(this.knight)*GW+RelicQuestMaze.nearX(this.knight);
        this.knight.speed = f32(this.knightSpeed * (this.webs.has(tile) ? 0.55 : 1));
        if(this.level === 6 && this.bossHp > 0) {
            const beat = Math.floor(this.levelTime/5);
            if(beat !== this.bossBeat) { this.bossBeat = beat; this.emit('bossWarn'); }
        }
        this.torchAge = f32(this.torchAge + h);
        if (this.relicUp) this.relicAge = f32(this.relicAge + h);
        this._moveKnight(h, want);
        this._collect();
        const k = this.knight;
        if (this.relicUp && RelicQuestMaze.nearX(k) === this.relicX && RelicQuestMaze.nearY(k) === this.relicY) {
            this.score += this.relicPoints * this.level;
            return Outcome.LevelClear;
        }
        this._sword(h);
        for (const s of this.snakes) {
            if (this.snakesAsleep) continue;
            if (s.stun > 0) { s.stun = f32(s.stun - h); if (s.stun < 0) s.stun = 0; continue; }
            if(s.guardian) s.speed = f32(this.snakeSpeed * (this.levelTime%5 < 1.2 ? 0.15 : this.levelTime%5 < 3 ? 1.6 : 0.8));
            this._moveSnake(s, h);
        }
        this._sword(0);                                  // a head that just slid into the reach is hit before it bites
        if (!this.snakesAsleep && this.invuln <= 0) {
            const kx = RelicQuestMaze.px(k), ky = RelicQuestMaze.py(k);
            const c2 = f32(this.catchDist * this.catchDist);
            for (const s of this.snakes) {
                if (s.stun > 0) continue;
                const dx = f32(RelicQuestMaze.px(s) - kx), dy = f32(RelicQuestMaze.py(s) - ky);
                if (f32(f32(dx * dx) + f32(dy * dy)) < c2) {
                    this.lives--; this.caught++; this.emit("bite");
                    return Outcome.Caught;
                }
            }
        }
        return Outcome.None;
    }

    _collect() {
        const k = this.knight;
        const x = RelicQuestMaze.nearX(k), y = RelicQuestMaze.nearY(k);
        if (!this.key && x === this.keyX && y === this.keyY) {
            this.key = true; for(let i=0;i<this.wall.length;i++) if(this.wall[i]===2) this.wall[i]=0;
            this.score += 500; this.emit('key'); this.pop(x,y,'KEY +500');
        }
        if (!this.hasGem(x, y)) return;
        this.emit('gem'); this.pop(x,y,'+100');
        if(this.level === 4 && this.gemsLeft === this.gemsTotal) {
            for(const s of this.snakes) s.stun = 0; this.emit('wake');
        }
        if(this.level === 6 && this.seals.has(y*GW+x)) {
            this.seals.delete(y*GW+x); this.bossHp--; this.emit('bossHit');
            if(this.bossHp === 0) { this.emit('bossDown'); for(const s of this.snakes) s.stun = s.stunMax = 999; }
        }
        this.gem[y * GW + x] = 0; this.gemsLeft--; this.gemsTaken++;
        this.score += this.gemPoints;
        if (this.gemsLeft <= 0) { this.relicUp = true; this.relicAge = 0; this._cue(SoundCue.Bonus); }
        else this._cue(SoundCue.Tick);
    }

    _face(d) {
        const k = this.knight;
        k.facing = d;
        if (d === Left) k.faceX = -1; else if (d === Right) k.faceX = 1;
    }

    _moveKnight(h, want) {
        const m = this.knight;
        const fresh = want >= 0 && want !== m.lastWant;
        m.lastWant = want;
        if (want >= 0) { m.queued = want; m.queuedAge = 0; }
        // LATE TURN: pressed just after passing a junction that fits it: step back onto the junction and take it
        if (fresh && m.dir >= 0 && want !== m.dir && want !== RelicQuestMaze.reverse(m.dir) && m.t < this.lateTurn &&
            this.open(m.x + DX[want], m.y + DY[want])) { m.dir = want; m.t = 0; }
        else if (m.queued >= 0) {
            m.queuedAge = f32(m.queuedAge + h);
            if (m.queuedAge > this.turnBuffer) m.queued = -1;
        }
        if (m.dir >= 0 && m.queued === RelicQuestMaze.reverse(m.dir)) {
            // turning back is allowed anywhere, as in every maze game
            m.x += DX[m.dir]; m.y += DY[m.dir]; m.dir = m.queued; m.t = f32(1 - m.t);
        }
        if (m.dir < 0) {
            if (m.queued >= 0 && this.open(m.x + DX[m.queued], m.y + DY[m.queued])) { m.dir = m.queued; m.t = 0; }
            else { if (want >= 0) this._face(want); return; }    // against a wall: he still turns to face the stick
        }
        this._face(m.dir);
        const adv = f32(m.speed * h);
        m.t = f32(m.t + adv);
        m.walk = f32(m.walk + adv);
        while (m.t >= 1) {
            m.x += DX[m.dir]; m.y += DY[m.dir]; m.t = f32(m.t - 1);
            this._collect();
            if (m.queued >= 0 && this.open(m.x + DX[m.queued], m.y + DY[m.queued])) m.dir = m.queued;
            else if (!this.open(m.x + DX[m.dir], m.y + DY[m.dir])) { m.dir = -1; m.t = 0; break; }
            this._face(m.dir);
        }
    }

    // the blade is out: every awake snake whose head is inside the reach is stunned
    _sword(h) {
        if (this.swing > 0) {
            const k = this.knight, f = this.swingDir;
            const kx = RelicQuestMaze.px(k), ky = RelicQuestMaze.py(k);
            for (const s of this.snakes) {
                if (s.stun > 0 || this.snakesAsleep) continue;
                const dx = f32(RelicQuestMaze.px(s) - kx), dy = f32(RelicQuestMaze.py(s) - ky);
                const along = f32(f32(dx * DX[f]) + f32(dy * DY[f]));
                const lat = Math.abs(f32(f32(dx * DY[f]) - f32(dy * DX[f])));
                if (along < -0.35 || along > this.swordReach || lat > 0.55) continue;
                // no swinging through a block: the tile in front must be open if the head is past it
                if (along > 0.6 && !this.open(RelicQuestMaze.nearX(k) + DX[f], RelicQuestMaze.nearY(k) + DY[f])) continue;
                this._stun(s, this.stunSeconds);
                this.hitFlash = 0.18; this.stuns++; this.score += this.stunPoints; this.swingHit = true;
                this._cue(SoundCue.Hit); this.emit("stun"); this.pop(RelicQuestMaze.px(s),RelicQuestMaze.py(s),"+200");
            }
            if (h > 0) {
                this.swing = f32(this.swing - h);
                if (this.swing <= 0) {
                    this.swing = 0; this.swingCd = this.swingRecover;
                    if (!this.swingHit) { this.whiffs++; this._cue(SoundCue.Miss); }
                }
            }
        } else if (h > 0 && this.swingCd > 0) {
            this.swingCd = f32(this.swingCd - h);
            if (this.swingCd < 0) this.swingCd = 0;
        }
    }

    _moveSnake(s, h) {
        if (s.dir < 0) { s.dir = this._pickSnakeDir(s, -1); s.t = 0; if (s.dir < 0) return; s.lastDir = s.dir; }
        s.t = f32(s.t + f32(s.speed * h));
        s.walk = f32(s.walk + f32(s.speed * h));
        while (s.t >= 1) {
            s.hist.unshift(s.y * GW + s.x);
            if (s.hist.length > 6) s.hist.pop();
            s.x += DX[s.dir]; s.y += DY[s.dir]; s.t = f32(s.t - 1);
            const d = this._pickSnakeDir(s, s.dir);
            if (d < 0) { s.dir = -1; s.t = 0; break; }
            s.dir = d; s.lastDir = d;
        }
    }

    _pickSnakeDir(s, cur) {
        const opt = [];
        for (let d = 0; d < 4; d++) {
            if (cur >= 0 && d === RelicQuestMaze.reverse(cur)) continue;
            if (this.open(s.x + DX[d], s.y + DY[d])) opt.push(d);
        }
        if (opt.length === 0) {
            const r = cur >= 0 ? RelicQuestMaze.reverse(cur) : -1;
            return r >= 0 && this.open(s.x + DX[r], s.y + DY[r]) ? r : -1;
        }
        if (opt.length === 1) return opt[0];
        if (this._rng.nextDouble() < this.snakeChase) {
            const k = this.knight, kx = RelicQuestMaze.px(k), ky = RelicQuestMaze.py(k);
            let best = opt[0], bd = Infinity;
            for (const d of opt) {
                const dx = f32((s.x + DX[d]) - kx), dy = f32((s.y + DY[d]) - ky);
                const dd = f32(f32(dx * dx) + f32(dy * dy));
                if (dd < bd) { bd = dd; best = d; }
            }
            return best;
        }
        return opt[this._rng.next(opt.length)];
    }

    pop(x,y,text) { this.fx.push({x,y,text,age:0}); }

    _cue(c) { if (this.cues) this.cues.emit(c); }

    // ------------------------------------------------------------------ the mercy autopilot
    // The credit-5 knight walks himself to the nearest gem (or the relic) when the stick is let go
    // (Unity's BotDir(false)). The round calls it; it only reads the maze (and its own scratch arrays).
    autopilotDir() {
        const m = this.knight, dist = this._dist, from = this._from, q = this._q;
        const ox = m.dir >= 0 ? m.x + DX[m.dir] : m.x, oy = m.dir >= 0 ? m.y + DY[m.dir] : m.y;
        dist.fill(-1); from.fill(-1);
        let head = 0, tail = 0;
        const o = oy * GW + ox; dist[o] = 0; q[tail++] = o;
        let found = -1;
        while (head < tail) {
            const i = q[head++], x = i % GW, y = Math.trunc(i / GW);
            if ((!this.key ? x === this.keyX && y === this.keyY : (this.relicUp && x === this.relicX && y === this.relicY) || (!this.relicUp && this.gem[i]))) { found = i; break; }
            for (let d = 0; d < 4; d++) {
                const nx = x + DX[d], ny = y + DY[d];
                if (!this.open(nx, ny)) continue;
                const ni = ny * GW + nx;
                if (dist[ni] >= 0) continue;
                dist[ni] = dist[i] + 1; from[ni] = i; q[tail++] = ni;
            }
        }
        if (found < 0) return -1;
        if (found === o) return m.dir >= 0 ? m.dir : -1;
        let step = found;
        while (from[step] !== o) step = from[step];
        const sx = step % GW - ox, sy = Math.trunc(step / GW) - oy;
        for (let d = 0; d < 4; d++) if (DX[d] === sx && DY[d] === sy) return d;
        return -1;
    }
}
