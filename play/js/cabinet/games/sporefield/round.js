// THE NODE · world 1 · SPORE FIELD (Bright Spark Inc., 1981) on the Cabinet Engine · THE ROUND.
// Six gardens on the old 38 x 26 field. Every split becomes another head; the last garden
// keeps an armoured queen alive until her eye opens. A coin ends only at the queen or no wands.
// Coordinates are field cells, centres at +0.5. The board runs at its own deliberate pace.
import { f32, idiv, roundEven, fmt, F32, SoundCue, CueBuffer, CabinetState, RoundResult, Pad, Dir4, SystemRandom } from '../../sdk/index.js';

const Phase = Object.freeze({ Idle: 0, Ready: 1, Playing: 2, Dying: 3, Card: 4, Over: 5, Tally: 6 });

export const GARDENS = [
    ['FIRST SPORES', 'SPLIT THE BORER. HOLD A TO FIRE.'],
    ['SILK GARDEN', 'SPIDERS HUNT IN YOUR STRIP.'],
    ['SEED RAIN', 'FLEAS PLANT NEW FIRING LANES.'],
    ['BITTER ROOT', 'VIOLET SPORES MAKE HEADS DIVE.'],
    ['NIGHT BLOOM', 'WATCH THE SIDES. B CLEARS SPACE.'],
    ['QUEEN BORER', 'BREAK THE BODY. HIT THE OPEN EYE.'],
];

const GridW = 40, GridH = 30;
const FieldCol = 1, FieldRow = 3;
const W = 38, H = 26;
const ZoneRows = 6, ZoneTop = H - ZoneRows;
const BorerLength = 12, StartLives = 3, MushroomHp = 4;
const PlayerHalf = f32(0.42);
const SpiderTop = f32(f32(ZoneTop - 2) + 0.5), SpiderBottom = f32(H - 0.5);
const FleaDrop = f32(0.22);
const SpiderGrace = f32(3.0);
const SpiderHunt = f32(5.0);
const PtsSegment = 10, PtsHead = 100, PtsMushroom = 1, PtsFlea = 200;

function clampF(v, a, b) { return v < a ? a : v > b ? b : v; }
function toward(v, target, step) {
    if (v < target) return Math.min(target, f32(v + step));
    return Math.max(target, f32(v - step));
}
function add(d, k, v) { d[k] = (d[k] || 0) + v; }
function walk(s, x, y) {
    s.px = s.x; s.py = s.y;
    if (x !== s.x) { s.lastDx = x > s.x ? 1 : -1; s.lastVertical = false; }
    else if (y !== s.y) { s.lastVy = y > s.y ? 1 : -1; s.lastVertical = true; }
    s.x = x; s.y = y;
}

class Segment {
    constructor(x, y) {
        this.x = x; this.y = y; this.px = x; this.py = y;
        this.lastDx = 0; this.lastVy = 1; this.lastVertical = false;
    }
}
function newSeg(x, y) { return new Segment(x, y); }

class Chain {
    constructor() { this.segs = []; this.dirX = 0; this.dirY = 1; this.entryDirX = 1; }
}

class Critter {
    constructor() {
        this.active = false; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.t = 0;
        this.dir = 0; this.hits = 0; this.lastCell = 0;
    }
}

export class SporeFieldRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.readySeconds = f32(2.0); this.reReadySeconds = f32(1.6); this.dyingSeconds = f32(2.0); this.cardSeconds = f32(3.0);
        this.burstSeconds = f32(1.5);
        this.healStep = f32(0.1);

        this.recordEvents = false; this.events = [];
        this.stage = 0; this.cleared = 0; this.extra = false; this.particles = [];
        this.poison = new Uint8Array(W * H);
        this.p = Phase.Idle; this.phaseTime = 0;
        this.credit = null;
        this.shielded = false; this.fragile = false;
        this.mush = new Uint8Array(W * H);
        this.chains = [];
        this.moveFrac = 0;
        this.playerX = 0; this.playerY = 0;
        this.shotActive = false; this.shotX = 0; this.shotY = 0;
        this.spider = new Critter(); this.flea = new Critter();
        this.popups = [];
        this.deathX = 0; this.deathY = 0; this.deathCause = 0;
        this.segmentsLeft = 0; this.splits = 0;
        this.borerSpeed = 0; this.spiderSpeed = 0; this.shotSpeed = 0; this.playerSpeed = 0; this.fleaSpeed = 0;
        this.spiderDelay = 0; this.spiderCross = 0; this.segmentHit = 0; this.fleaThreshold = 0;
        this.lives = StartLives;
        this.firstReady = false;

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._time = 0;
        this._readyLen = this.readySeconds;
        this._spiderTimer = 0; this._fleaTimer = 0; this._healT = 0; this._healStep = 0; this._huntLeft = 0;
        this._healDone = false;
        this._deaths = 0; this._bySpider = 0; this._bySeg = 0; this._byFlea = 0;
        this._spidersShot = 0; this._fleasShot = 0; this._headsShot = 0; this._bodiesShot = 0;
        this._mushShot = 0; this._shots = 0; this._eaten = 0; this._spiderAte = 0;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Playing: return CabinetState.Playing;
            case Phase.Tally: return CabinetState.Interlude;
            case Phase.Dying: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get roundWon() { return this._result === RoundResult.Won; }
    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get healing() { return this.p === Phase.Dying && this.lives > 0 && this.phaseTime >= this.burstSeconds; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        let s = r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this.lives + ' left ' + this.segmentsLeft +
            ' deaths ' + this._deaths + ' (spider ' + this._bySpider + ' borer ' + this._bySeg + ' flea ' + this._byFlea + ') splits ' + this.splits +
            ' heads ' + this._headsShot + ' bodies ' + this._bodiesShot + ' spiders ' + this._spidersShot + ' fleas ' + this._fleasShot;
        if (this._eaten > 0) s += ' eaten ' + this._eaten;
        return s;
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed || 1);
        this.events.length = 0; this.stage = this.isDemo ? 3 : 0; this.cleared = 0; this.extra = false; this._lifeMush = 0;
        this.particles.length = 0; this.poison.fill(0);
        this.burstCooldown = 0; this.burstFlash = 0; this.invulnerable = 3; this.stageTime = 0;
        this.baseSpeed = k.get('borerSpeed'); this.borerSpeed = this.baseSpeed;
        this.spiderSpeed = k.get('spiderSpeed');
        this.spiderDelay = k.get('spiderDelay');
        this.spiderCross = k.get('spiderCross');
        this.segmentHit = k.get('segmentHit');
        this.shotSpeed = k.get('shotSpeed');
        this.playerSpeed = k.get('playerSpeed');
        this.fleaSpeed = k.get('fleaSpeed');
        this.fleaThreshold = Math.trunc(roundEven(k.get('fleaThreshold')));
        this.fragile = k.get('fragile') >= 0.5;
        this.shielded = credit.unlosable;

        this._score = 0; this._time = 0; this.lives = Math.round(k.get('wands', 3)); this._result = RoundResult.None;
        this._deaths = this._bySpider = this._bySeg = this._byFlea = 0;
        this._spidersShot = this._fleasShot = this._headsShot = this._bodiesShot = this._mushShot = this._shots = this._eaten = this._spiderAte = 0;
        this.splits = 0; this.deathCause = 0;
        this._cues.resetTotals();
        this.popups.length = 0;

        this.mush.fill(0);
        this.plantCount = Math.trunc(roundEven(k.get('mushrooms')));
        this._plant(this.plantCount);

        this.chains.length = 0;
        const c = new Chain();
        const col = idiv(W, 4) + this._rng.next(idiv(W, 2));
        c.dirX = c.entryDirX = this._rng.next(2) === 0 ? -1 : 1;
        for (let i = 0; i < BorerLength; i++) c.segs.push(newSeg(col, -i));
        this.chains.push(c);
        this.moveFrac = 0;
        this._count();

        this._clearCritters();
        this._home();
        this.firstReady = true;
        this.p = Phase.Ready; this.phaseTime = 0; this._readyLen = this.readySeconds;
        this._garden();
    }

    _emit(kind, o = {}) { if (this.recordEvents) this.events.push({ ...o, kind }); }

    _garden() {
        this.popups.length = 0; this.particles.length = 0; this.burstFlash = 0;
        this.flight = 1; this.stageTime = 0; this.borerSpeed = f32(this.baseSpeed * (1 + this.stage * 0.09));
        this.mush.fill(0); this.poison.fill(0); this._plant(this.plantCount + this.stage * 9);
        this.chains.length = 0;
        const c = new Chain(); c.dirX = c.entryDirX = 1;
        const length = 12 + this.stage * 3;
        for (let i = 0; i < length; i++) c.segs.push(newSeg(7 + this.stage * 3, -i));
        if (this.stage === 5) { c.segs[0].queen = true; c.segs[0].hp = 16; }
        this.chains.push(c);
        if (this.stage >= 4) {
            const side = new Chain(); side.dirX = side.entryDirX = -1;
            for (let i = 0; i < 5; i++) side.segs.push(newSeg(W - 1, 9 - i));
            this.chains.push(side);
        }
        if (this.stage >= 3) for (let i = 0; i < this.mush.length; i++)
            if (this.mush[i] && i % 7 === this.stage) this.poison[i] = 1;
        this.moveFrac = 0; this._count(); this._clearCritters(); this._home();
        this.invulnerable = 3; this.burstCooldown = 0;
        this.firstReady = true; this.p = Phase.Ready; this.phaseTime = 0;
        this._readyLen = this.readySeconds; this._emit(this.stage === 5 ? 'boss' : 'stageStart');
    }

    _burst() {
        this.burstCooldown = 9; this.burstFlash = 0.4; this.invulnerable = Math.max(this.invulnerable, 1.2);
        this._emit('burst');
        for (let ci = this.chains.length - 1; ci >= 0; ci--)
            for (let k = this.chains[ci].segs.length - 1; k >= 0; k--) {
                const g = this.chains[ci]?.segs[k];
                if (g && this.segY(g) > ZoneTop - 2) this._shootSegment(ci, k);
            }
        if (this.spider.active) { this.spider.active = false; this._score += 300; this._spiderTimer = 3; }
        if (this.flea.active) { this.flea.active = false; this._score += 200; }
        for (let i = ZoneTop * W; i < this.mush.length; i++) this.mush[i] = 0;
    }

    // denser at the top, sparse in the strip, never in the bottom row (where you stand). Plain
    // doubles here, as the C# original: the weighting is double-precision, not float.
    _plant(count) {
        if (count < 0) count = 0;
        const weights = new Array(H).fill(0);
        let sum = 0;
        for (let r = 1; r < H - 1; r++) {
            weights[r] = r < ZoneTop ? 1.0 - 0.75 * (r - 1) / ZoneTop : 0.18;
            sum += weights[r];
        }
        let placed = 0, guard = 0;
        while (placed < count && guard++ < count * 50) {
            let pick = this._rng.nextDouble() * sum;
            let row = 1;
            for (let r = 1; r < H - 1; r++) { pick -= weights[r]; if (pick <= 0) { row = r; break; } }
            const x = this._rng.next(W);
            if (this.mush[row * W + x] !== 0) continue;
            this.mush[row * W + x] = MushroomHp;
            placed++;
        }
    }

    _clearCritters() {
        this.spider = new Critter();
        this.flea = new Critter();
        const rnd = f32(this._rng.nextDouble());
        const m = f32(f32(this.spiderDelay * rnd) * 0.5);
        this._spiderTimer = f32(SpiderGrace + m);       // a grace after every GET READY
        this._fleaTimer = 2;
        this.shotActive = false;
    }

    _home() {
        this.playerX = f32(W / 2); this.playerY = f32(H - 0.5);
        const hx = Math.trunc(this.playerX);
        for (let x = hx - 1; x <= hx; x++) if (x >= 0 && x < W) this.mush[(H - 1) * W + x] = 0;
    }

    // ------------------------------------------------------------------ stepping
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        dt = f32(dt * 0.78);
        this.phaseTime = f32(this.phaseTime + dt);
        this.invulnerable = Math.max(0, this.invulnerable - dt);
        this.burstCooldown = Math.max(0, this.burstCooldown - dt);
        this.burstFlash = Math.max(0, this.burstFlash - dt);
        if (!this.extra && this._score >= 6000) {
            this.extra = true; this.lives++; this._emit('extraLife');
            this.popups.push({ x: 19, y: 22, t: 2, points: 'EXTRA WAND' });
        }
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const q = this.particles[i]; q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
            if (q.t <= 0) this.particles.splice(i, 1);
        }
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i]; p.t = f32(p.t - dt);
            if (p.t <= 0) this.popups.splice(i, 1);
        }

        switch (this.p) {
            case Phase.Ready:
                if (this.phaseTime >= this._readyLen) { this.p = Phase.Playing; this.phaseTime = 0; this.firstReady = false; this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Playing:
                this._play(dt, input);
                break;
            case Phase.Dying:
                if (this.lives <= 0) { if (this.phaseTime >= this.dyingSeconds) this._afterDeath(); break; }
                if (this.phaseTime >= this.burstSeconds) {
                    // the heal: each damaged mushroom grows back whole, top to bottom
                    this._healT = f32(this._healT - dt);
                    while (this._healT <= 0 && !this._healDone) {
                        if (this._healOne()) { this._healT = f32(this._healT + this._healStep); this._cues.emit(SoundCue.Tick); }
                        else this._healDone = true;
                    }
                    if (this._healDone && this.phaseTime >= f32(this.burstSeconds + 0.4)) this._afterDeath();
                }
                break;
            case Phase.Tally:
                if (this.phaseTime >= 2.8) {
                    if (this.stage === 5) {
                        this._result = RoundResult.Won; this.p = Phase.Card; this.phaseTime = 0;
                        this._cues.emit(SoundCue.Win); this._emit('win');
                    } else { this.stage++; this._garden(); }
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _play(dt, input) {
        this.stageTime += dt;
        this._movePlayer(dt, input);
        if (input && input.held(Pad.B) && this.burstCooldown <= 0) this._burst();
        if (!this.shotActive && input != null && input.held(Pad.A)) {
            this.shotActive = true; this.shotX = this.playerX; this.shotY = f32(this.playerY - 0.45); this._shots++; this._emit('fire');
            this._cues.emit(SoundCue.Tick);
        }

        this.moveFrac = f32(this.moveFrac + f32(dt * this.borerSpeed));
        while (this.moveFrac >= 1) { this.moveFrac = f32(this.moveFrac - 1); this._stepBorer(); }
        this._count();
        if (this.segmentsLeft === 0) { this._win(); return; }

        if (this.stage >= 1) this._updateSpider(dt);
        if (this.stage >= 2) this._updateFlea(dt);
        if (this.shotActive) this._updateShot(dt);
        this._count();
        if (this.segmentsLeft === 0) { this._win(); return; }
        if (!this.shielded && this.invulnerable <= 0) this._checkContact();
    }

    _count() {
        let n = 0;
        for (let i = 0; i < this.chains.length; i++) n += this.chains[i].segs.length;
        this.segmentsLeft = n;
    }

    _win() {
        if (this.stage > 0 && this.stage < 5 && this.flight === 1) {
            this.flight = 2;
            const c = new Chain(); c.dirX = c.entryDirX = this.stage % 2 ? -1 : 1;
            for (let i = 0; i < 24 + this.stage * 2; i++) c.segs.push(newSeg(this.stage % 2 ? W - 3 : 2, -i));
            this.chains.push(c); this._count(); this._emit('reinforce');
            this.popups.push({ x: 19, y: 6, t: 2, points: 'SECOND BROOD' });
            return;
        }
        this.cleared++; this.lastBonus = 1000 * (this.stage + 1) + this.lives * 200;
        this._score += this.lastBonus; this.p = Phase.Tally; this.phaseTime = 0;
        this.shotActive = false; this._emit('stageClear');
    }

    // ------------------------------------------------------------------ the player
    _blocked(cx, cy) {
        const x0 = Math.floor(f32(cx - PlayerHalf)), x1 = Math.floor(f32(cx + PlayerHalf));
        const y0 = Math.floor(f32(cy - PlayerHalf)), y1 = Math.floor(f32(cy + PlayerHalf));
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++)
                if (x >= 0 && x < W && y >= 0 && y < H && this.mush[y * W + x] > 0) return true;
        return false;
    }

    mushAt(x, y) { return x >= 0 && x < W && y >= 0 && y < H && this.mush[y * W + x] > 0; }

    _movePlayer(dt, input) {
        if (input == null) return;
        const d = input.heldDir4();
        if (d < 0) return;
        const step = f32(this.playerSpeed * dt);
        const free = this._blocked(this.playerX, this.playerY);       // grown over by a mushroom: walk out freely
        const minX = PlayerHalf, maxX = f32(W - PlayerHalf), minY = f32(ZoneTop + PlayerHalf), maxY = f32(H - PlayerHalf);
        if (Dir4.dx(d) !== 0) {
            const nx = clampF(f32(this.playerX + f32(Dir4.dx(d) * step)), minX, maxX);
            if (free || !this._blocked(nx, this.playerY)) this.playerX = nx;
            else {
                // slide up to the mushroom, and ease round its corner if we only clip it
                const rowC = f32(Math.floor(this.playerY) + 0.5);
                if (Math.abs(f32(this.playerY - rowC)) > 0.02 && !this._blocked(nx, rowC)) this.playerY = toward(this.playerY, rowC, step);
                else {
                    const dx = Dir4.dx(d);
                    let edge;
                    if (dx > 0) {
                        const inner = f32(f32(this.playerX + PlayerHalf) + step);
                        edge = f32(f32(Math.floor(inner) - PlayerHalf) - 0.001);
                    } else {
                        const inner = f32(f32(this.playerX - PlayerHalf) - step);
                        edge = f32(f32(f32(Math.floor(inner) + 1) + PlayerHalf) + 0.001);
                    }
                    if ((dx > 0 && edge > this.playerX) || (dx < 0 && edge < this.playerX)) this.playerX = edge;
                }
            }
        } else {
            const ny = clampF(f32(this.playerY + f32(Dir4.dy(d) * step)), minY, maxY);
            if (free || !this._blocked(this.playerX, ny)) this.playerY = ny;
            else {
                const colC = f32(Math.floor(this.playerX) + 0.5);
                if (Math.abs(f32(this.playerX - colC)) > 0.02 && !this._blocked(colC, ny)) this.playerX = toward(this.playerX, colC, step);
                else {
                    const dy = Dir4.dy(d);
                    let edge;
                    if (dy > 0) {
                        const inner = f32(f32(this.playerY + PlayerHalf) + step);
                        edge = f32(f32(Math.floor(inner) - PlayerHalf) - 0.001);
                    } else {
                        const inner = f32(f32(this.playerY - PlayerHalf) - step);
                        edge = f32(f32(f32(Math.floor(inner) + 1) + PlayerHalf) + 0.001);
                    }
                    if ((dy > 0 && edge > this.playerY) || (dy < 0 && edge < this.playerY)) this.playerY = clampF(edge, minY, maxY);
                }
            }
        }
    }

    // ------------------------------------------------------------------ the borer
    segX(s) { return f32(f32(s.px + f32((s.x - s.px) * this.moveFrac)) + 0.5); }
    segY(s) { return f32(f32(s.py + f32((s.y - s.py) * this.moveFrac)) + 0.5); }

    _stepBorer() {
        for (let ci = 0; ci < this.chains.length; ci++) {
            const c = this.chains[ci];
            const h = c.segs[0];
            let nx, ny;
            if (h.y < 0) { nx = h.x; ny = h.y + 1; }             // still filing in from above
            else {
                nx = h.x + c.dirX; ny = h.y;
                const edge = nx < 0 || nx >= W;
                const shroom = !edge && this.mush[h.y * W + nx] > 0;
                if (shroom && this.fragile && !h.queen) {
                    // MERCY: the borer cannot survive a mushroom. The head is destroyed on it and
                    // the next segment leads on (into the same mushroom, a step later).
                    this._score += PtsSegment; this._eaten++;
                    this._cues.emit(SoundCue.Hit);
                    c.segs.shift();
                    if (c.segs.length === 0) { this.chains.splice(ci, 1); ci--; continue; }
                    for (const s of c.segs) { s.px = s.x; s.py = s.y; }
                    continue;
                }
                if (this.poison[h.y * W + h.x] && h.y < ZoneTop) c.diving = true;
                if (c.diving && h.y < ZoneTop) { nx = h.x; ny = h.y + 1; }
                else if (edge || shroom) {
                    let dy = c.dirY;
                    if (dy > 0 && h.y >= H - 1) dy = -1;
                    else if (dy < 0 && h.y <= ZoneTop) dy = 1;
                    c.dirY = dy;
                    nx = h.x; ny = h.y + dy;
                    c.dirX = -c.dirX;
                }
            }
            for (let i = c.segs.length - 1; i >= 1; i--) walk(c.segs[i], c.segs[i - 1].x, c.segs[i - 1].y);
            walk(h, nx, ny);
        }
    }

    // segment k of chain ci is shot: a mushroom grows where it was, the piece behind gets a head
    _shootSegment(ci, k) {
        const c = this.chains[ci];
        const s = c.segs[k];
        if (s.queen) {
            if (c.segs.length > 1 && Math.floor(this.stageTime / 2) % 2 === 0) { this._emit('armour'); return; }
            s.hp--; this._emit('queenHit');
            if (s.hp > 0) return;
            this._score += 5000; this._emit('queenGone');
        }
        const head = k === 0;
        this._emit(head ? 'head' : 'split');
        this.popups.push({ x: this.segX(s), y: this.segY(s), t: 0.7, points: head ? 100 : 10 });
        for (let n = 0; n < 8; n++) this.particles.push({ x: this.segX(s), y: this.segY(s), vx: Math.cos(n * 0.785) * 4, vy: Math.sin(n * 0.785) * 4, t: 0.5 });
        this._score += head ? PtsHead : PtsSegment;
        if (head) this._headsShot++; else { this._bodiesShot++; this.splits++; }
        this._cues.emit(SoundCue.Hit);
        if (s.x >= 0 && s.x < W && s.y >= 0 && s.y < H) this.mush[s.y * W + s.x] = MushroomHp;
        if (k + 1 < c.segs.length) {
            const t = new Chain();
            t.entryDirX = c.entryDirX;
            for (let i = k + 1; i < c.segs.length; i++) t.segs.push(c.segs[i]);
            const nh = t.segs[0];
            t.dirX = nh.lastDx === 0 ? c.entryDirX : (nh.lastVertical ? -nh.lastDx : nh.lastDx);
            t.dirY = (nh.y >= ZoneTop && nh.lastVy < 0) ? -1 : 1;
            this.chains.push(t);
        }
        c.segs.splice(k, c.segs.length - k);
        if (c.segs.length === 0) this.chains.splice(ci, 1);
    }

    // after a lost life: every surviving piece re-enters at the top, spread across the field
    _reEnter() {
        const n = this.chains.length;
        for (let j = 0; j < n; j++) {
            const c = this.chains[j];
            const band = idiv(W, Math.max(1, n));
            let col = j * band + idiv(band, 4) + this._rng.next(Math.max(1, idiv(band, 2)));
            if (col < 0) col = 0;
            if (col >= W) col = W - 1;
            c.dirX = c.entryDirX = this._rng.next(2) === 0 ? -1 : 1;
            c.dirY = 1;
            for (let i = 0; i < c.segs.length; i++) {
                const s = c.segs[i];
                s.x = s.px = col; s.y = s.py = -i; s.lastDx = 0; s.lastVy = 1; s.lastVertical = false;
            }
        }
        this.moveFrac = 0;
    }

    // ------------------------------------------------------------------ the spider
    _updateSpider(dt) {
        const sp = this.spider;
        if (!sp.active) {
            this._spiderTimer = f32(this._spiderTimer - dt);
            if (this._spiderTimer <= 0) {
                sp.active = true; this._emit('spider');
                sp.dir = this._rng.next(2) === 0 ? 1 : -1;
                sp.x = sp.dir > 0 ? -1 : f32(W + 1);
                sp.y = f32(SpiderTop + f32(f32(this._rng.nextDouble()) * f32(SpiderBottom - SpiderTop)));
                sp.vy = f32(this.spiderSpeed * (this._rng.next(2) === 0 ? 1 : -1));
                sp.vx = f32(f32(sp.dir * this.spiderSpeed) * this.spiderCross);
                sp.t = f32(0.4); sp.lastCell = -1; sp.hits = 0;
                this._huntLeft = f32(SpiderHunt * f32(0.7 + f32(0.6 * this._rng.nextDouble())));
            }
            return;
        }
        sp.t = f32(sp.t - dt);
        this._huntLeft = f32(this._huntLeft - dt);
        if (sp.t <= 0) {
            // a new leg of its dance: mostly diagonal, sometimes straight up and down. While it
            // hunts it leans toward the wand; then it heads for the far side and leaves.
            sp.t = f32(0.25 + f32(0.6 * this._rng.nextDouble()));
            let way = sp.dir;
            if (this._huntLeft > 0) {
                const gap = f32(this.playerX - sp.x);
                if (Math.abs(gap) > 2 && this._rng.nextDouble() < 0.7) way = gap > 0 ? 1 : -1;
                else if (this._rng.nextDouble() < 0.4) way = -way;
            }
            sp.vx = this._rng.nextDouble() < 0.25 ? 0 : f32(f32(way * this.spiderSpeed) * this.spiderCross);
            if (this._rng.nextDouble() < 0.35) sp.vy = f32(-sp.vy);
        }
        // the walls of the tube turn it back while it hunts
        if (this._huntLeft > 0 && ((sp.x < 0.5 && sp.vx < 0) || (sp.x > f32(W - 0.5) && sp.vx > 0))) sp.vx = f32(-sp.vx);
        sp.x = f32(sp.x + f32(sp.vx * dt));
        sp.y = f32(sp.y + f32(sp.vy * dt));
        if (sp.y < SpiderTop) { sp.y = SpiderTop; sp.vy = Math.abs(sp.vy); }
        if (sp.y > SpiderBottom) { sp.y = SpiderBottom; sp.vy = f32(-Math.abs(sp.vy)); }
        const cx = Math.floor(sp.x), cy = Math.floor(sp.y);
        if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
            const cell = cy * W + cx;
            if (cell !== sp.lastCell) {
                sp.lastCell = cell;
                if (this.mush[cell] > 0 && this._rng.nextDouble() < 0.6) { this.mush[cell] = 0; this._spiderAte++; }
            }
        }
        if (sp.x > f32(W + 1.5) || sp.x < -1.5) {
            sp.active = false;
            this._spiderTimer = f32(this.spiderDelay * f32(0.6 + f32(0.8 * this._rng.nextDouble())));
        }
    }

    // ------------------------------------------------------------------ the flea
    stripMushrooms() {
        let n = 0;
        for (let i = ZoneTop * W; i < W * H; i++) if (this.mush[i] > 0) n++;
        return n;
    }

    _updateFlea(dt) {
        const fl = this.flea;
        if (!fl.active) {
            this._fleaTimer = f32(this._fleaTimer - dt);
            if (this._fleaTimer <= 0) {
                this._fleaTimer = f32(1.5);
                if (this.stripMushrooms() < this.fleaThreshold + this.stage * 3) {
                    fl.active = true; this._emit('flea'); fl.hits = 0;
                    fl.x = f32(this._rng.next(W) + 0.5); fl.y = f32(-0.5); fl.vy = this.fleaSpeed; fl.vx = 0;
                }
            }
            return;
        }
        const oy = fl.y;
        fl.y = f32(fl.y + f32(fl.vy * dt));
        const col = Math.trunc(fl.x);
        for (let r = Math.floor(oy) + 1; r <= Math.floor(fl.y); r++) {
            if (r < 0 || r >= H - 1) continue;
            if (this._rng.nextDouble() >= FleaDrop) continue;
            if (this.mush[r * W + col] > 0) continue;
            if (Math.abs(f32(f32(col + 0.5) - this.playerX)) < 1.5 && Math.abs(f32(f32(r + 0.5) - this.playerY)) < 1.5) continue;
            this.mush[r * W + col] = MushroomHp;
        }
        if (fl.y > f32(H + 0.5)) { fl.active = false; this._fleaTimer = 3; }
    }

    // ------------------------------------------------------------------ the shot
    _updateShot(dt) {
        const y0 = this.shotY, y1 = f32(this.shotY - f32(this.shotSpeed * dt));
        const col = Math.floor(this.shotX);
        let best = -Infinity;
        let kind = 0, a = -1, b = -1;
        if (col >= 0 && col < W) {
            const rBot = Math.min(H - 1, Math.floor(y0)), rTop = Math.max(0, Math.floor(y1));
            for (let r = rBot; r >= rTop; r--)
                if (this.mush[r * W + col] > 0) { best = Math.min(y0, f32(r + 1)); kind = 1; a = col; b = r; break; }
        }
        for (let ci = 0; ci < this.chains.length; ci++) {
            const segs = this.chains[ci].segs;
            for (let i = 0; i < segs.length; i++) {
                const sx = this.segX(segs[i]), sy = this.segY(segs[i]);
                if (sy <= 0 || Math.abs(f32(sx - this.shotX)) >= this.segmentHit) continue;
                if (f32(sy - 0.45) < y0 && f32(sy + 0.45) > y1) {
                    const c = Math.min(y0, f32(sy + 0.45));
                    if (c > best) { best = c; kind = 2; a = ci; b = i; }
                }
            }
        }
        const sp = this.spider;
        if (sp.active && Math.abs(f32(sp.x - this.shotX)) < 0.9 && f32(sp.y - 0.5) < y0 && f32(sp.y + 0.5) > y1) {
            const c = Math.min(y0, f32(sp.y + 0.5));
            if (c > best) { best = c; kind = 3; }
        }
        const fl = this.flea;
        if (fl.active && Math.abs(f32(fl.x - this.shotX)) < 0.5 && f32(fl.y - 0.45) < y0 && f32(fl.y + 0.45) > y1) {
            const c = Math.min(y0, f32(fl.y + 0.45));
            if (c > best) { best = c; kind = 4; }
        }

        switch (kind) {
            case 0:
                this.shotY = y1;
                if (y1 < 0) { this.shotActive = false; this._cues.emit(SoundCue.Miss); }
                return;
            case 1:
                this.mush[b * W + a]--; this._emit('mushroom');
                if (this.mush[b * W + a] === 0) { this._score += PtsMushroom; this._mushShot++; this._lifeMush++; }
                break;
            case 2:
                this._shootSegment(a, b);
                break;
            case 3: {
                const dx = f32(sp.x - this.playerX), dy = f32(sp.y - this.playerY);
                const d = f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy))));
                const pts = d < 3 ? 900 : d < 6 ? 600 : 300;
                this._score += pts; this._spidersShot++; this._emit('spiderHit');
                this.popups.push({ x: sp.x, y: sp.y, t: 1.0, points: pts });
                sp.active = false;
                this._spiderTimer = f32(this.spiderDelay * f32(0.6 + f32(0.8 * this._rng.nextDouble())));
                this._cues.emit(SoundCue.Bonus);
                break;
            }
            case 4:
                fl.hits++;
                if (fl.hits >= 2) {
                    this._score += PtsFlea; this._fleasShot++; this._emit('fleaHit');
                    this.popups.push({ x: fl.x, y: fl.y, t: 0.8, points: PtsFlea });
                    fl.active = false; this._fleaTimer = 3;
                    this._cues.emit(SoundCue.Bonus);
                } else fl.vy = f32(fl.vy * 2);            // the first hit only makes it angry
                break;
        }
        this.shotActive = false;
    }

    // ------------------------------------------------------------------ contact and lives
    _checkContact() {
        for (let ci = 0; ci < this.chains.length; ci++) {
            const segs = this.chains[ci].segs;
            for (let i = 0; i < segs.length; i++) {
                const sx = this.segX(segs[i]), sy = this.segY(segs[i]);
                if (Math.abs(f32(sx - this.playerX)) < 0.75 && Math.abs(f32(sy - this.playerY)) < 0.75) { this._die(2); return; }
            }
        }
        const sp = this.spider, fl = this.flea;
        if (sp.active && Math.abs(f32(sp.x - this.playerX)) < 1.15 && Math.abs(f32(sp.y - this.playerY)) < 0.8) { this._die(1); return; }
        if (fl.active && Math.abs(f32(fl.x - this.playerX)) < 0.75 && Math.abs(f32(fl.y - this.playerY)) < 0.75) { this._die(3); return; }
    }

    _die(cause) {
        this.lives--; this._deaths++; this._emit('death');
        this.lifeBonus = this._lifeMush * 5; this._lifeMush = 0; this._score += this.lifeBonus;
        if (cause === 1) this._bySpider++; else if (cause === 2) this._bySeg++; else this._byFlea++;
        this.deathCause = cause;
        this.deathX = this.playerX; this.deathY = this.playerY;
        this.shotActive = false;
        this._cues.emit(SoundCue.Die);
        this.p = Phase.Dying; this.phaseTime = 0;
        let damaged = 0;
        for (let i = 0; i < this.mush.length; i++) if (this.mush[i] > 0 && this.mush[i] < MushroomHp) damaged++;
        this._healStep = damaged > 0 ? Math.min(this.healStep, f32(2 / damaged)) : this.healStep;
        this._healT = 0; this._healDone = false;
    }

    _healOne() {
        for (let i = 0; i < this.mush.length; i++)
            if (this.mush[i] > 0 && this.mush[i] < MushroomHp) { this.mush[i] = MushroomHp; return true; }
        return false;
    }

    _afterDeath() {
        if (this.lives <= 0) {
            this._result = RoundResult.Lost;
            this.p = Phase.Card; this.phaseTime = 0;
            return;
        }
        for (let i = 0; i < this.mush.length; i++) if (this.mush[i] > 0 && this.mush[i] < MushroomHp) this.mush[i] = MushroomHp;
        this.invulnerable = 3; this._reEnter();
        this._clearCritters();
        this.popups.length = 0;
        this._home();
        this.p = Phase.Ready; this.phaseTime = 0; this._readyLen = this.reReadySeconds;
    }

    // ------------------------------------------------------------------ stats
    collectStats(into) {
        add(into, 'deaths', this._deaths);
        add(into, 'bySpider', this._bySpider);
        add(into, 'byBorer', this._bySeg);
        add(into, 'byFlea', this._byFlea);
        add(into, 'splits', this.splits);
        add(into, 'heads', this._headsShot);
        add(into, 'spiders', this._spidersShot);
        add(into, 'fleas', this._fleasShot);
        add(into, 'shots', this._shots);
        add(into, 'shrooms', this._mushShot);
        add(into, 'spiderAte', this._spiderAte);
        add(into, 'leftAtEnd', this.segmentsLeft);
        if (this._eaten > 0) add(into, 'eaten', this._eaten);
    }
}

SporeFieldRound.Phase = Phase;
SporeFieldRound.GridW = GridW; SporeFieldRound.GridH = GridH;
SporeFieldRound.FieldCol = FieldCol; SporeFieldRound.FieldRow = FieldRow;
SporeFieldRound.W = W; SporeFieldRound.H = H;
SporeFieldRound.ZoneRows = ZoneRows; SporeFieldRound.ZoneTop = ZoneTop;
SporeFieldRound.BorerLength = BorerLength; SporeFieldRound.StartLives = StartLives; SporeFieldRound.MushroomHp = MushroomHp;
SporeFieldRound.PlayerHalf = PlayerHalf;
SporeFieldRound.SpiderTop = SpiderTop; SporeFieldRound.SpiderBottom = SpiderBottom;
SporeFieldRound.PtsSegment = PtsSegment; SporeFieldRound.PtsHead = PtsHead; SporeFieldRound.PtsMushroom = PtsMushroom; SporeFieldRound.PtsFlea = PtsFlea;
