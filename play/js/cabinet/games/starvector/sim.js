// THE NODE · THE JUNCTION · STARVECTOR (the super-scaler) · THE ROUND: rules only (no drawing, no audio, no DOM).
//
// You fly into the screen from behind the Wayfinder. The world is a stream of OBJECTS coming toward the camera: each has a
// world position (x right, y up, z = distance ahead of the camera) and the renderer scales it up out of the distance.
// The ship lives at a fixed depth ZS and moves in the x/y plane; a thing hurts when it crosses z = ZS where you are.
//
//   ACT I   THE FIELD   asteroids + angular fighters in FORMATIONS (V, snake, ring, pincer), then the BOSS (the gunship IRONCLAD)
//                       -> the ring beacon lights the CIRCLE (knock 1)
//   ACT II  THE VEIN    a burning canyon: pillars, arches, lava, turrets, fighters, then the BOSS (the lava serpent MAGMA WYRM)
//                       -> the three frames light the TRIANGLE (knock 2)
//   ACT III THE STONES  T-shaped stones, guardian drones, a little light ahead showing the safe line, then the BOSS (the waking stone)
//                       -> SQUARE (knock 3), then the three overlap into a DIAMOND of light: fly in, the image FREEZES.
// sim.knocks = how many symbols are lit (0..3); sim.frozen = the diamond has been entered (the host takes it from there).
//
// THE FIGHT: the gun (hold A to auto-fire) + the barrel roll (B) + a SHIELD that absorbs ONE hit (back after ~8 s). Kills chain into a
// x2..x8 multiplier; wiping a whole formation pays a FORMATION BONUS; skimming past a thing pays a NEAR bonus.
import { CabinetState, RoundResult, SoundCue, CueBuffer, SystemRandom } from '../../sdk/index.js';
import { Progress } from './spec.js';
import * as Boss from './boss.js';

export const SV = {
    F: 150, CX: 160, CY: 104,            // the camera: focal length (px), the screen centre = the horizon row
    ZS: 6,                               // the depth the ship flies at
    ZNEAR: 1.1, ZSP: 160, ZG: 230,       // the near clip, where things spawn, where the diamond spawns
    GATE_Z: 150,                         // where an act's gate appears once its boss is down
    GY: 3.4,                             // the ground is this far below the camera
    XMAX: 5.8, YMIN: -2.9, YMAX: 2.4,    // the ship's box
    ACT_LEN: 58,                         // seconds of approach per act (then the boss)
    CARD: 2.6,                           // the act's title card
    SPEED: [0, 34, 42, 50],              // the world's speed per act (units/s)
    MAX_LIVES: 4,
};
const { ZS, ZSP, ZG, GY, XMAX, YMIN, YMAX } = SV;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DZ = { rock: 0.9, fighter: 1.0, drone: 0.9, turret: 1.0, pillar: 1.4, stone: 2.0, lava: 1.3, arch: 1.4, gate: 1.4, diamond: 1.4, mine: 0.9, wave: 0.8, boss: 2 };
const SHOOTABLE = new Set(['rock', 'fighter', 'drone', 'turret', 'mine']);
const PTS = { fighter: 60, drone: 100, turret: 80, mine: 40 };

export class StarvectorRound {
    constructor() {
        this.cues = new CueBuffer();
        this.state = CabinetState.Idle; this.result = RoundResult.None;
        this.score = 0; this.lives = 3; this.time = 0;
        this.recordEvents = false; this.events = [];
        this.kills = 0; this.hitsTaken = 0; this.shots = []; this.eshots = []; this.objs = []; this.parts = []; this.pops = []; this.hz = [];
    }

    // ---------------------------------------------------------------- reset
    reset(seed, credit, knobs) {
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.credit = credit; this.k = knobs;
        const g = (n, d) => (knobs && knobs.has(n) ? knobs.get(n) : d);
        this.kn = { speed: g('speed', 1), density: g('density', 1), enemyEvery: g('enemyEvery', 1.5), aimError: g('aimError', 0.5),
            rollSeconds: g('rollSeconds', 0.55), rollCooldown: g('rollCooldown', 1.6), assist: g('assist', 0.25), hitSize: g('hitSize', 1),
            shieldRecharge: g('shieldRecharge', 8), ships: g('ships', 3) | 0 || 3 };
        this.unlosable = false; // no credit is ever free: the player has to beat the game
        if (credit) credit.unlosable = false; // (the SDK's 5th-credit flag: this cabinet opts out, so the host doesn't call a loss a violation)
        const force = g('startAct', 0) | 0;
        const lost = credit ? credit.lossesBefore : 0;
        this.demo = !!this.isDemo;
        this.startAct = force >= 1 && force <= 3 ? force : this.demo ? 1 + ((seed >>> 3) % 3) : (lost > 0 ? Progress.act : 1);
        this.resumeBoss = !this.demo && !force && lost > 0 && !!Progress.boss && this.startAct === Progress.act;
        this.act = this.startAct; this.knocks = this.startAct - 1;
        this.score = 0; this.lives = this.kn.ships; this.time = 0; this.kills = 0; this.hitsTaken = 0; this.rolls = 0; this.shieldsUsed = 0;
        this.state = CabinetState.Playing; this.result = RoundResult.None;
        this.frozen = false; this.freezeT = 0; this.over = false; this.endT = 0;
        this.dist = 0; this.flash = 0; this.shake = 0; this.hitStop = 0; this.slowT = 0; this.slowDur = 1; this.nearFlash = 0; this.warnT = 0;
        this.ship = { x: 0, y: -1.2, vx: 0, vy: 0, bank: 0, pitch: 0, invuln: 2.2, rollT: 0, rollDir: 1, rollCool: 0, fireT: 0, alive: true, deadT: 0,
            shieldOn: true, shieldT: 0, shieldFlash: 0, shieldUpFlash: 0, hitFlash: 0, boost: 0,
            };
        this.camX = 0; this.camY = 0; this.light = null;
        this.shots.length = 0; this.eshots.length = 0; this.objs.length = 0; this.parts.length = 0; this.pops.length = 0; this.hz.length = 0;
        this.cues.resetTotals(); this.events.length = 0;
        this.ev = { fired: 0, boom: 0 };
        this.symbolShow = null; this.diamondT = 0; this.stage = 'play';
        this.chain = 0; this.mult = 1; this.comboT = 0; this.maxMult = 1; this.formBonuses = 0; this.nears = 0; this.shieldUps = 0;
        this.forms = new Map(); this._fid = 0; this._lastForm = '';
        this.boss = null; this.bossStarted = false; this.bossDone = false; this.bossKills = 0; this.bossT = 0; this._quick = false;
        this._beginAct(true);
        this._startSaid = false;
        this.cues.emit(SoundCue.Start);
    }

    get summary() {
        return 'act ' + this.act + ' symbols ' + this.knocks + ' score ' + this.score + ' ships ' + this.lives + ' hits ' + this.hitsTaken + ' kills ' + this.kills +
            ' ' + (this.result === RoundResult.Won ? 'WON' : this.result === RoundResult.Lost ? 'LOST' : '...') + ' t=' + this.time.toFixed(1);
    }
    get V() {
        const ramp = this.stage === 'boss' || this.bossDone ? 1.12 : 1 + 0.14 * clamp(this.actT / SV.ACT_LEN, 0, 1);
        const sl = this.slowT > 0 ? 0.3 + 0.7 * Math.pow(1 - this.slowT / this.slowDur, 2) : 1;
        return SV.SPEED[this.act] * this.kn.speed * this._slow * ramp * sl;
    }
    /** 0..1: how fast it feels (the renderer's speed lines and the engine glow) */
    get speedFx() { return clamp((this.V / 34 - 0.85) * 1.6 + this.ship.boost * 0.6, 0, 1); }
    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    // ---------------------------------------------------------------- acts
    _beginAct(first) {
        this.actT = 0; this.cardT = SV.CARD; this._slow = 1; this.stage = 'play'; this.symbolShow = null;
        this.objs.length = 0; this.eshots.length = 0; this.hz.length = 0; this.boss = null; this.bossStarted = false; this.bossDone = false; this.warnT = 0;
        this.nextBeat = 1.4; this.beatN = 0; this._nextDeco = 0; this.gateSpawned = false; this.gatesPassed = 0;
        this.ship.invuln = Math.max(this.ship.invuln, SV.CARD * 0.9);
        this.light = this.act === 3 ? { x: 0, y: -1, z: ZS + 17, tx: 0, ty: -1, ph: 0 } : null;
        this._lastStoneZ = ZSP; this._corridorT = 0;
        if (!first) this._emit('chime', { act: this.act });
        this._emit('card', { act: this.act });
        // the world is already in motion when the act begins: seed the first screen so it is never empty
        if (first && this.resumeBoss) { this.actT = SV.ACT_LEN; } else this._prefill();
    }

    _prefill() {
        const n = this.act;
        if (n === 1) { for (let i = 0; i < 7; i++) this._rock(this._rx(), this._ry(), 96 + i * 14 + this.rng.next(8), 1.0 + this.rng.nextDouble() * 1.2); for (let i = 0; i < 14; i++) { const o = this._deco(); o.z = 20 + i * 10; o.pz = o.z; } }
        if (n === 2) { for (let i = 0; i < 3; i++) this._pillar(this._rx(0.8), 100 + i * 22, 2.5 + this.rng.nextDouble() * 3); this._lava(0, 120); }
        if (n === 3) for (let z = 40; z < ZSP; z += 16) this._stonePair(z);
    }

    // ---------------------------------------------------------------- spawning helpers (the director)
    _rx(m = 1) { return (this.rng.nextDouble() * 2 - 1) * XMAX * m; }
    _ry() { return YMIN + 0.2 + this.rng.nextDouble() * (YMAX - YMIN - 0.4); }
    _add(o) { o.pz = o.z; o.t = 0; o.seed = this.rng.next(1000); o.vz = o.vz || 0; o.dz = o.dz || DZ[o.k] || 1; o.hit = 0; this.objs.push(o); return o; }
    _rock(x, y, z, r, vx = 0, vy = 0, fid = 0) {
        return this._add({ k: 'rock', x, y, z, r, hp: r > 1.9 ? 4 : r > 1.3 ? 2 : 1, vx, vy, spin: this.rng.nextDouble() * 6, variant: this.rng.next(4), big: r > 1.9, fid });
    }
    _fighter(bx, by, z, ph = 0, ex = {}) {
        return this._add({ k: 'fighter', x: bx, y: by, bx, by, z, r: 1.15, hp: 1, ax: 1.6 + this.rng.nextDouble() * 1.6, ay: 0.4 + this.rng.nextDouble() * 0.8, w: 0.9 + this.rng.nextDouble() * 0.7,
            ph, vz: this.V * 0.42, fire: 1.2 + this.rng.nextDouble() * 1.5, bank: 0, ox: 0, oy: 0, side: 1, ...ex });
    }
    _drone(bx, by, z, ph = 0, ex = {}) {
        return this._add({ k: 'drone', x: bx, y: by, bx, by, z, r: 1.1, hp: 2, ax: 2.4, ay: 0.9, w: 0.8, ph, vz: this.V * 0.5, fire: 1.4 + this.rng.nextDouble() * 1.4, bank: 0, ox: 0, oy: 0, side: 1, ...ex });
    }
    _pillar(x, z, h, w = 0.95) { return this._add({ k: 'pillar', x, y: -GY + h / 2, z, w, top: -GY + h, h }); }
    _lava(x, z) { return this._add({ k: 'lava', x, y: -GY, z, r: 1.15, hmax: 3.3 + this.rng.nextDouble() * 1.6 }); }
    _turret(x, z, fid = 0) { return this._add({ k: 'turret', x, y: -GY + 0.75, z, r: 1.05, hp: 2, fire: 1.0 + this.rng.nextDouble() * 1.4, fid }); }
    _arch(z, yl = -0.35) { return this._add({ k: 'arch', x: 0, y: yl, z, half: 8.0, yl, top: yl + 2.6, legw: 1.3 }); }
    _stone(x, z, top = 7, w = 1.25, intruder = false) { return this._add({ k: 'stone', x, y: 0, z, w, top, cw: 3.3, intruder, side: x < 0 ? -1 : 1 }); }
    _stonePair(z) {
        const t = 5.5 + this.rng.nextDouble() * 3.5, o = 8.2 + this.rng.nextDouble() * 1.2;
        this._stone(-o, z, t + this.rng.nextDouble() * 1.4); this._stone(o + this.rng.nextDouble(), z + this.rng.next(6), 5 + this.rng.nextDouble() * 3);
    }
    _stoneGate(z, gx) {
        const gap = 2.9;
        this._stone(gx - gap - 1.25, z, 6.6, 1.25, true); this._stone(gx + gap + 1.25, z, 6.6, 1.25, true);
        this._gaps = this._gaps || []; this._gaps.push({ z, x: gx });
    }
    _gate(kind, z, n = 0) { return this._add({ k: 'gate', kind, x: 0, y: -0.9, z, r: 4.2, n, passed: false, dz: 1.6 }); }
    _newForm(n) { const id = ++this._fid; this.forms.set(id, { n, kills: 0, esc: false }); if (this.forms.size > 40) this.forms.delete(this.forms.keys().next().value); return id; }

    _deco() {
        // scenery you fly past: big and near, never in the way (outside the playfield), the field is never empty
        const r = this.rng, side = r.nextDouble() < 0.5 ? -1 : 1, x = side * (7.8 + r.nextDouble() * 17), y = -2.5 + r.nextDouble() * 11;
        const o = this._rock(x, y, ZSP + r.next(20), 1.6 + r.nextDouble() * 3.4); o.deco = true; o.hp = 999; return o;
    }

    // ---- the formations: a squad of fighters / drones that fly a pattern
    _squad(path, n, drone = false) {
        const r = this.rng, Z = ZSP, fid = this._newForm(n), mk = (bx, by, z, ph, ex) => (drone ? this._drone(bx, by, z, ph, { ...ex, fid }) : this._fighter(bx, by, z, ph, { ...ex, fid }));
        if (path === 'v') {
            const bx = this._rx(0.4), by = 0.5 + r.nextDouble() * 0.9;
            for (let i = 0; i < n; i++) { const side = i === 0 ? 0 : (i % 2 ? 1 : -1), rank = Math.ceil(i / 2); mk(bx, by, Z - 38 + rank * 5, i * 0.3, { path: 'v', ox: side * rank * 1.75, oy: -rank * 0.5 }); }
        } else if (path === 'snake') {
            const dir = r.nextDouble() < 0.5 ? -1 : 1, bx = (r.nextDouble() - 0.5) * 2;
            for (let i = 0; i < n; i++) mk(bx, 0.3 + (drone ? 0.2 : 0.4), Z - 42 + i * 6.5, -i * 0.8 * dir, { path: 'snake', ax: 3.6, w: 1.15 * dir });
        } else if (path === 'ring') {
            const bx = this._rx(0.3), by = 0.2 + r.nextDouble() * 0.4;
            for (let i = 0; i < n; i++) mk(bx, by, Z - 36, (i * Math.PI * 2) / n, { path: 'ring', ax: 3.3, ay: 1.7, w: 1.05 });
        } else {  // pincer: two columns closing from the sides
            const by = 0.2 + r.nextDouble() * 1.0, a = Math.ceil(n / 2);
            for (let i = 0; i < n; i++) { const side = i < a ? -1 : 1, j = i < a ? i : i - a; mk(0, by, Z - 38 + j * 4, j * 0.7, { path: 'pincer', side, ox: side * (1.5 + j * 1.5), oy: -j * 0.25 }); }
        }
    }
    _rockLine(n) {
        const r = this.rng, Z = ZSP, fid = this._newForm(n), x0 = this._rx(0.9), dx = (r.nextDouble() - 0.5) * 2.6;
        for (let i = 0; i < n; i++) this._rock(clamp(x0 + dx * i, -XMAX, XMAX), clamp(this._ry() * 0.3 + (i - 2) * 0.5, YMIN, YMAX), Z + i * 8, 0.95 + r.nextDouble() * 0.5, 0, 0, fid);
    }

    _beat() {
        const u = clamp(this.actT / SV.ACT_LEN, 0, 1), r = this.rng, n = this.beatN++, A = this.act, Z = ZSP;
        const pools = {
            1: [['scatter', 3 - 1.2 * u], ['bigrock', 1.1], ['V', 2.6 + 1.2 * u], ['snake', u > 0.15 ? 1.6 + 1.6 * u : 0], ['ring', u > 0.3 ? 1.9 : 0], ['pincer', u > 0.42 ? 2.2 : 0], ['line', 1.8], ['grid', u > 0.3 ? 1 + u : 0]],
            2: [['pillars', 2.4], ['arch', 1.3 + u], ['lava', 1.9], ['turrets', 2.0], ['V', 1.6 + u], ['pincer', u > 0.4 ? 1.6 : 0], ['slalom', u > 0.15 ? 1.9 : 0], ['mix', 1.1]],
            3: [['gate', 2.4], ['dV', 1.7 + u], ['dRing', u > 0.3 ? 1.4 : 0], ['dPincer', u > 0.4 ? 1.4 : 0], ['stoneGate', 1.5], ['doubleGate', u > 0.4 ? 1.3 : 0]],
        };
        const pool = pools[A].filter((p) => p[1] > 0 && p[0] !== this._lastForm && (n >= 2 || p[0] !== 'grid' && p[0] !== 'pincer' && p[0] !== 'ring'));
        let s = 0; for (const p of pool) s += p[1]; let q = r.nextDouble() * s, pick = pool[0][0];
        for (const p of pool) { if ((q -= p[1]) < 0) { pick = p[0]; break; } }
        this._lastForm = pick;
        const cnt = 4 + Math.floor(u * 2.6) + (n > 6 ? 1 : 0);
        switch (pick) {
            case 'scatter': { const c = 3 + r.next(3 + (u > 0.5 ? 2 : 0)); for (let i = 0; i < c; i++) this._rock(this._rx(), this._ry(), Z + r.next(26), 1.0 + r.nextDouble() * 1.3); break; }
            case 'bigrock': this._rock(this._rx(0.8), this._ry(), Z, 3.0); for (let i = 0; i < 2; i++) this._rock(this._rx(), this._ry(), Z + 10 + r.next(20), 0.9 + r.nextDouble() * 0.8); break;
            case 'V': this._squad('v', cnt); break;
            case 'snake': this._squad('snake', cnt + 1); break;
            case 'ring': this._squad('ring', cnt + 1); break;
            case 'pincer': this._squad('pincer', cnt + 1); break;
            case 'line': this._rockLine(5); break;
            case 'grid': { const gx = this._rx(0.75), gy = this._ry();
                for (let ix = -3; ix <= 3; ix++) for (let iy = -1; iy <= 1; iy++) {
                    const x = ix * 2.2, y = -0.9 + iy * 1.7;
                    if (Math.hypot(x - gx, (y - gy) * 1.2) < 2.3) continue;
                    this._rock(x, y, Z + 4 + (ix + iy) % 3, 1.0 + r.nextDouble() * 0.3);
                } break; }
            case 'pillars': { const c = 2 + r.next(2); for (let i = 0; i < c; i++) this._pillar(this._rx(0.85), Z + i * 17 + r.next(6), 2.2 + r.nextDouble() * 4.6, 0.85 + r.nextDouble() * 0.5); break; }
            case 'arch': this._arch(Z); this._pillar(this._rx(0.6), Z + 30, 3 + r.nextDouble() * 3); break;
            case 'lava': { const c = 2 + r.next(2); for (let i = 0; i < c; i++) this._lava(clamp((r.nextDouble() - 0.5) * 7, -4.4, 4.4), Z + i * 16 + r.next(8)); break; }
            case 'turrets': { const fid = this._newForm(3), s = r.nextDouble() < 0.5 ? -1 : 1; this._turret(s * (4.6 + r.nextDouble() * 3), Z, fid); this._turret(-s * (5 + r.nextDouble() * 3), Z + 14, fid); this._turret(s * (3.8 + r.nextDouble() * 2), Z + 28, fid); break; }
            case 'slalom': { let s = r.nextDouble() < 0.5 ? -1 : 1; for (let i = 0; i < 4; i++) { this._pillar(s * 2.6, Z + i * 13, 4.2 + r.nextDouble() * 1.4, 1.0); s = -s; } break; }
            case 'mix': for (let i = 0; i < 4; i++) this._rock(this._rx(), this._ry(), Z + i * 11, 0.9 + r.nextDouble() * 0.7); this._lava((r.nextDouble() - 0.5) * 6, Z + 20); break;
            case 'gate': this._stoneGate(Z, clamp((r.nextDouble() - 0.5) * 7.2, -3.6, 3.6)); break;
            case 'dV': this._squad('v', Math.min(6, 4 + Math.floor(u * 2.4)), true); break;
            case 'dRing': this._squad('ring', 5, true); break;
            case 'dPincer': this._squad('pincer', 4, true); break;
            case 'stoneGate': this._stone(clamp((r.nextDouble() - 0.5) * 5, -2.5, 2.5), Z, 6.5, 1.25, true); this._stoneGate(Z + 34, clamp((r.nextDouble() - 0.5) * 6, -3.2, 3.2)); break;
            case 'doubleGate': this._stoneGate(Z, clamp((r.nextDouble() - 0.5) * 6, -3.2, 3.2)); this._squad('v', 3, true); this._stoneGate(Z + 40, clamp((r.nextDouble() - 0.5) * 6, -3.2, 3.2)); break;
        }
    }

    // ---------------------------------------------------------------- the step
    step(dt, input) {
        if (this.state === CabinetState.Over) return;
        dt = Math.min(dt, 0.1); this.time += dt;
        if (!this._startSaid) { this._startSaid = true; this._emit('start'); }
        if (this.state === CabinetState.Card) {
            this.endT += dt; this._parts(dt);
            if (this.endT > 2.2) this.state = CabinetState.Over;
            return;
        }
        if (this.frozen) {
            this.freezeT += dt; this.flash = Math.max(0, 0.75 * (1 - this.freezeT / 0.22));
            if (this.freezeT > 5) { this.result = RoundResult.Won; this.state = CabinetState.Over; if (!this.demo) { Progress.act = 1; Progress.boss = false; } }
            return;
        }
        if (this.hitStop > 0) { this.hitStop -= dt; this._popsStep(dt * 0.15); return; }   // hit-stop: the world holds for a few frames
        const S = this.ship;
        this.flash = Math.max(0, this.flash - dt * 1.6); this.shake = Math.max(0, this.shake - dt * 3); this.nearFlash = Math.max(0, this.nearFlash - dt * 3);
        this.cardT = Math.max(0, this.cardT - dt); this.warnT = Math.max(0, this.warnT - dt);
        if (this.slowT > 0) this.slowT = Math.max(0, this.slowT - dt);
        // ---- the multiplier decays when you stop killing
        if (this.comboT > 0) this.comboT -= dt; else if (this.chain > 0) { this.chain = Math.max(0, this.chain - dt * 2.2); this._setMult(); }
        // ---- the act's clock, the symbol interlude, the next act
        if (this.stage === 'symbol') {
            this.symbolShow.t += dt; this._slow = 1 - 0.55 * smooth(0, 0.9, this.symbolShow.t);
            if (this.symbolShow.t > 3.6) {
                if (this.act < 3) { this.act++; this.ship.invuln = 2; this.lives = Math.min(SV.MAX_LIVES, this.lives + 1); this._beginAct(false); }
                else { this.stage = 'diamond'; this.diamondT = 0; this._slow = 1; this.symbolShow = null; this._spawnDiamond(); }
            }
        } else { this.actT += dt; this._slow = 1; if (this.stage === 'diamond') this.diamondT += dt; }
        if (this.stage === 'boss') this.bossT += dt;
        const V = this.V;
        this.dist += V * dt;
        // ---- the director
        if (this.stage === 'play') {
            const lastBeat = SV.ACT_LEN - 6, r0 = this.rng; if (this._nextDeco === undefined) this._nextDeco = 0;
            if (this.actT >= this.nextBeat && this.actT < lastBeat && !this.gateSpawned && !this.bossStarted && this.cardT < SV.CARD - 0.3) {
                this._beat();
                const base = [0, 1.7, 1.75, 1.85][this.act], u = this.actT / SV.ACT_LEN;
                this.nextBeat = this.actT + (base * (1.15 - 0.4 * u)) / this.kn.density;
            }
            if (this.act === 1 && this.actT >= this._nextDeco) { this._nextDeco = this.actT + 0.32 + r0.nextDouble() * 0.3; this._deco(); }
            if (!this.bossStarted && !this.gateSpawned && this.actT >= SV.ACT_LEN && this.cardT <= 0) this._startBoss(false);
        }
        if (this.act === 3 && (this.stage === 'play' || this.stage === 'boss')) this._corridor();
        if (this.stage === 'boss') Boss.step(this, dt);
        // ---- the ship
        this._ship(dt, input);
        // ---- the world
        this._objects(dt, V);
        this._shots(dt, V);
        this._hazards(dt);
        this._parts(dt); this._popsStep(dt);
        // ---- camera + the little light
        this.camX += (S.x * 0.2 - this.camX) * Math.min(1, dt * 6); this.camY += (S.y * 0.2 - this.camY) * Math.min(1, dt * 6);
        if (this.light) this._lightStep(dt);
        // ---- death / game over
        if (!S.alive) {
            S.deadT += dt;
            if (S.deadT > 1.7 && !this.over) {
                if (this.lives > 0) this._respawn();
                else { this.over = true; this.state = CabinetState.Card; this.result = RoundResult.Lost; this.endT = 0; if (!this.demo) { Progress.act = this.act; Progress.boss = this.stage === 'boss'; } this.cues.emit(SoundCue.Die); this._emit('out'); }
            }
        }
    }

    _startBoss(quick) {
        this.bossStarted = true; this.stage = 'boss'; this.warnT = 2.4; this.bossT = 0;
        if (this.act === 3) this.light = null;
        Boss.spawn(this, quick);
        this.ship.boost = 1;
        this._emit('bossWarn', { act: this.act });
    }
    /** the boss is down (its death sequence has played): the act's gate comes */
    _bossDefeated() {
        this.boss = null; this.bossDone = true; this.stage = 'play'; this.eshots.length = 0; this.hz.length = 0;
        for (let i = this.objs.length - 1; i >= 0; i--) if (this.objs[i].k === 'wave' || this.objs[i].k === 'mine') this.objs.splice(i, 1);
        if (this.act === 3) this.light = { x: 0, y: -1, z: ZS + 17, tx: 0, ty: -1, ph: 0 };
        this.gateSpawned = true; this.ship.boost = 1;
        const gz = this._quick ? 80 : SV.GATE_Z;
        if (this.act === 1) this._gate('ring', gz, 1);
        else if (this.act === 2) { this._gate('tri', gz - 40, 2); this._gate('tri', gz - 20, 2); this._gate('tri', gz, 2); }
        else this._gate('square', gz, 3);
        this._gateT = this.actT; this._emit('bossGone', { act: this.act });
    }

    _corridor() {
        // the always-there side stones of Act III: a pair every so often (none once the gate is out)
        if (this.gateSpawned) return;
        let far = 0; for (const o of this.objs) if (o.k === 'stone' && !o.intruder && o.z > far) far = o.z;
        if (far < ZSP - 14) this._stonePair(Math.max(far + 15, ZSP - 4));
    }

    // ---------------------------------------------------------------- the ship: flight, the gun, the shield
    _ship(dt, input) {
        const S = this.ship, kn = this.kn;
        S.invuln = Math.max(0, S.invuln - dt); S.rollCool = Math.max(0, S.rollCool - dt); S.shieldFlash = Math.max(0, S.shieldFlash - dt * 2); S.shieldUpFlash = Math.max(0, S.shieldUpFlash - dt * 1.6);
        S.hitFlash = Math.max(0, S.hitFlash - dt * 2.5); S.boost = Math.max(0, S.boost - dt * 0.7);
        if (!S.alive) { S.vx *= 0.9; return; }
        // the shield: down after it absorbs a hit, back after its recharge with no hit
        if (!S.shieldOn) { S.shieldT -= dt; if (S.shieldT <= 0) { S.shieldOn = true; S.shieldUpFlash = 1; this.shieldUps++; this._emit('shieldUp'); } }
        const ix = clamp(input.x, -1, 1), iy = clamp(input.y, -1, 1);
        // barrel roll: a quick lateral dodge and a spin (the invulnerable moment)
        if (input.pressed(5) && S.rollCool <= 0 && S.rollT <= 0) {
            S.rollT = kn.rollSeconds; S.rollTotal = kn.rollSeconds; S.rollDir = ix !== 0 ? Math.sign(ix) : Math.abs(S.vx) > 0.4 ? Math.sign(S.vx) : Math.abs(S.bank) > 0.1 ? Math.sign(S.bank) : (S.lastDir || 1); S.rollCool = kn.rollCooldown + kn.rollSeconds; this.rolls++;
            S.boost = Math.max(S.boost, 0.8);
            this._emit('roll');
        }
        const rolling = S.rollT > 0;
        if (rolling) { S.rollT = Math.max(0, S.rollT - dt); S.invuln = Math.max(S.invuln, S.rollT + 0.05); }
        if (ix !== 0) S.lastDir = Math.sign(ix);
        const SP = 13.5, AC = 26;
        const tvx = ix * SP + (rolling ? S.rollDir * 16 * (0.35 + 0.65 * S.rollT / S.rollTotal) : 0), tvy = iy * 10;
        // snappy: a fast pull to the target, and an even faster one when braking or reversing
        const ax = (tvx === 0 || tvx * S.vx < 0) ? AC * 1.6 : AC, ay = (tvy === 0 || tvy * S.vy < 0) ? AC * 1.6 : AC;
        S.vx += (tvx - S.vx) * Math.min(1, dt * ax); S.vy += (tvy - S.vy) * Math.min(1, dt * ay);
        if (tvx === 0 && Math.abs(S.vx) < 0.3) S.vx = 0; if (tvy === 0 && Math.abs(S.vy) < 0.3) S.vy = 0;
        S.x = clamp(S.x + S.vx * dt, -XMAX, XMAX); S.y = clamp(S.y + S.vy * dt, YMIN, YMAX);
        // the gates pull you true (it is a beacon, not a test): the last 60 units before one
        const g = this.objs.find((o) => (o.k === 'gate' || o.k === 'diamond') && !o.passed && o.z < 70 && o.z > ZS - 2);
        if (g) { const w = smooth(70, 12, g.z) * 5.5, gy = g.k === 'diamond' ? g.y - 4.4 : g.y; S.x += (g.x - S.x) * Math.min(1, dt * w * 0.5); S.y += (gy - S.y) * Math.min(1, dt * w * 0.5); }
        S.bank += (clamp(S.vx / SP, -1, 1) - S.bank) * Math.min(1, dt * 24);
        S.pitch += (clamp(S.vy / 10, -1, 1) - S.pitch) * Math.min(1, dt * 24);
        // ---- fire: hold A for the gun (auto-fire)
        const held = input.held(4);
        S.fireT -= dt;
        if (held && S.fireT <= 0 && !rolling) {
            S.fireT = 0.105;
            for (const sx of [-0.55, 0.55]) this.shots.push({ x: S.x + sx, y: S.y - 0.1, z: ZS + 0.8, pz: ZS + 0.8, vz: 120, vx: 0, vy: 0, life: 1.6, dmg: 1 });
            this._emit('fire');
        }
    }

    _respawn() {
        const S = this.ship; S.alive = true; S.deadT = 0; S.x = 0; S.y = -1.2; S.vx = S.vy = 0; S.invuln = 2.6; S.rollT = 0;
        S.shieldOn = true; S.shieldT = 0;
        // breathing room: nothing hostile in the first 36 units
        for (let i = this.objs.length - 1; i >= 0; i--) { const o = this.objs[i]; if (o.k !== 'gate' && o.k !== 'diamond' && o.k !== 'boss' && o.z < ZS + 36 && !(o.k === 'stone' && !o.intruder)) { this._boom(o.x, o.y, o.z, 1.2); this.objs.splice(i, 1); } }
        this.eshots.length = 0; this.hz.length = 0; this._emit('respawn');
    }

    // ---------------------------------------------------------------- objects
    objAt(o, tc) {
        // where an object will be `tc` seconds from now, (x, y)
        if (o.k === 'fighter' || o.k === 'drone') {
            const t = o.t + tc;
            switch (o.path) {
                case 'v': return { x: o.bx + o.ox + 1.2 * Math.sin(0.8 * t + o.ph), y: o.by + o.oy + 0.3 * Math.sin(1.3 * t) };
                case 'snake': return { x: o.bx + o.ax * Math.sin(o.w * t + o.ph), y: o.by + 0.35 * Math.sin(o.w * 1.4 * t + o.ph) };
                case 'ring': { const a = o.w * t + o.ph; return { x: o.bx + o.ax * Math.cos(a), y: o.by + o.ay * Math.sin(a) }; }
                case 'pincer': { const zz = o.z - (this.V - o.vz) * tc, k = clamp((zz - 34) / 56, 0, 1); return { x: o.bx + o.ox + o.side * 10 * k * k, y: o.by + o.oy + 0.8 * Math.sin(1.1 * t + o.ph) }; }
                default: return { x: o.bx + o.ax * Math.sin(o.w * t + o.ph), y: o.by + o.ay * Math.sin(o.w * 1.7 * t + o.ph * 1.3) };
            }
        }
        return { x: o.x + (o.vx || 0) * tc, y: o.y + (o.vy || 0) * tc };
    }

    /** would this object hurt a ship at (sx, sy) when it crosses ZS? (o.x/o.y given as the crossing position); hm > 1 widens it (the near-miss margin) */
    hurts(o, sx, sy, ox = o.x, oy = o.y, hm = 1) {
        const hs = this.kn.hitSize * hm, w = 0.68 * hs, h = 0.44 * hs;
        switch (o.k) {
            case 'rock': case 'fighter': case 'drone': case 'turret': case 'mine': return Math.hypot((ox - sx) / (o.r + w * 0.8), (oy - sy) / (o.r + h * 1.2)) < 1;
            case 'pillar': return Math.abs(ox - sx) < o.w + w && sy - h < o.top;
            case 'stone': return Math.abs(ox - sx) < o.w + w || (Math.abs(ox - sx) < o.cw + w && sy + h > o.top - 2.2);
            case 'arch': return Math.abs(sx - ox) > o.half - w * 0.6 || sy + h > o.yl;
            case 'lava': return Math.abs(ox - sx) < o.r + w * 0.7 && sy - h < -GY + o.hmax;
            case 'wave': return sy - h < o.top && Math.abs(sx - o.gx) > o.gw - w * 0.3;
            default: return false;
        }
    }

    _objects(dt, V) {
        const S = this.ship;
        for (let i = this.objs.length - 1; i >= 0; i--) {
            const o = this.objs[i];
            if (o.k === 'boss') continue;                                    // the boss moves itself (boss.js)
            const cs = o.cs !== undefined ? o.cs : V - o.vz;
            o.t += dt; o.pz = o.z; o.z -= cs * dt; if (o.hit > 0) o.hit -= dt;
            if (o.k === 'rock' || o.k === 'mine') { o.x += o.vx * dt; o.y += o.vy * dt; if (o.k === 'rock') { o.spin += dt * 0.8; if (o.y > YMAX + 3 || o.y < -GY - 1 || Math.abs(o.x) > 14) o.vx = o.vy = 0; } }
            if (o.k === 'fighter' || o.k === 'drone') {
                const px = o.x, p = this.objAt(o, 0); o.x = p.x; o.y = p.y; o.bank += (clamp((o.x - px) / Math.max(dt, 1e-3) * 0.28, -1, 1) - o.bank) * Math.min(1, dt * 10);
                // never leave the screen's box too far
                if (o.vz > 0 && o.z < 24) o.vz = Math.max(0, o.vz - 0.9 * V * dt);       // dive in, then they drift past you
                if (this.stage === 'play' && o.z < ZSP - 15 && o.z > 18 && !this.gateSpawned && S.alive) {
                    o.fire -= dt;
                    if (o.fire <= 0) { o.fire = this.kn.enemyEvery * (0.8 + this.rng.nextDouble() * 0.5) * (o.k === 'drone' ? 1.15 : 1) * (o.fid ? 1.35 : 1); this._enemyShot(o, o.k === 'drone' ? 3 : o.fid ? 2 : 1); }
                }
            }
            if (o.k === 'turret' && o.z < ZSP - 25 && o.z > 20 && S.alive && this.stage === 'play') {
                o.fire -= dt; if (o.fire <= 0) { o.fire = this.kn.enemyEvery * (1 + this.rng.nextDouble() * 0.6) * (o.fid ? 1.3 : 1); this._enemyShot(o, 1); }
            }
            if (o.k === 'lava') { o.zCross = o.z; o.erupt = o.z < 72; if (o.z < 72 && !o.sound) { o.sound = true; this._emit('lava'); } }
            // ---- crossing the ship's plane
            const crossing = (o.z - o.dz <= ZS && o.pz + o.dz >= ZS);
            if (o.k === 'gate' || o.k === 'diamond') {
                if (!o.passed && o.z <= (o.k === 'diamond' ? 21 : ZS)) { o.passed = true; this._gatePassed(o); }
            } else if (o.deco) { /* scenery */
            } else if (crossing && S.alive && S.invuln <= 0) {
                if (this.hurts(o, S.x, S.y, o.x, o.y)) { this._hurtShip(o); }
                else if (!o.near && o.k !== 'wave' && this.hurts(o, S.x, S.y, o.x, o.y, 1.9)) this._nearMiss(o.x, o.y, o.z, 20, o);
            } else if (crossing && o.k !== 'rock' && o.k !== 'fighter' && o.k !== 'drone' && S.alive && S.invuln > 0 && S.rollT > 0 && this.hurts(o, S.x, S.y, o.x, o.y)) {
                if (!o.near) { o.near = true; this.score += 10; this._emit('near'); }
            }
            if (o.z < SV.ZNEAR - 4 || (o.z + o.dz < 0.4)) { if (o.fid && !o.dead) { const f = this.forms.get(o.fid); if (f) f.esc = true; } this.objs.splice(i, 1); }
        }
    }

    _nearMiss(x, y, z, pts, o) {
        if (o) o.near = true;
        const v = pts * this.mult; this.score += v; this.nears++; this.nearFlash = 1; this.comboT = Math.max(this.comboT, 1.2);
        this._pop('NEAR +' + v, this.ship.x, this.ship.y + 1.0, ZS + 3, 3);
        this._emit('near', { big: true });
    }

    _enemyShot(o, n) {
        const S = this.ship, err = this.kn.aimError;
        for (let q = 0; q < n; q++) {
            const closing = this.V * 1.2 + 11, sp = closing - this.V, tt = Math.max(0.25, (o.z - ZS) / closing), spread = n > 1 ? (q - (n - 1) / 2) * (n > 2 ? 1.8 : 1.5) : 0;
            const tx = S.x + S.vx * tt * 0.35 + (this.rng.nextDouble() * 2 - 1) * err + spread, ty = S.y + S.vy * tt * 0.35 + (this.rng.nextDouble() * 2 - 1) * err * 0.6;
            this.eshots.push({ x: o.x, y: o.y, z: o.z - 0.5, pz: o.z, vx: (tx - o.x) / tt, vy: (ty - o.y) / tt, vz: -sp, r: 0.5, hp: 1, life: 6 });
        }
        this._emit('enemyFire');
    }
    /** a boss bullet: from (x, y, z) to arrive at (tx, ty) at the ship's depth, closing at `spd` units/s */
    bossShot(x, y, z, tx, ty, spd = 20, r = 0.55, hp = 1, kind = '') {
        const tt = Math.max(0.25, (z - ZS) / spd);
        this.eshots.push({ x, y, z, pz: z, vx: (tx - x) / tt, vy: (ty - y) / tt, vz: this.V - spd, r, hp, kind, life: 6 });
    }

    _hurtShip(o) {
        this.hitsTaken++;
        if (o) { if (SHOOTABLE.has(o.k)) { o.hp = 0; this._kill(o, 0, true); } }
        this._damage();
    }

    /** a hit on the ship: the shield takes it (one), else the ship is lost */
    _damage() {
        const S = this.ship;
        this._breakChain();
        if (S.shieldOn) {
            S.shieldOn = false; S.shieldT = this.kn.shieldRecharge; S.invuln = Math.max(S.invuln, 1.0); S.shieldFlash = 1; this.shieldsUsed++;
            this.shake = Math.max(this.shake, 0.7); this.flash = Math.max(this.flash, 0.3); this._emit('shield'); this._boom(S.x, S.y, ZS + 0.5, 0.7);
            return;
        }
        this.lives--; S.alive = false; S.deadT = 0; S.hitFlash = 1; this.shake = 1.2; this.flash = 0.5;
        this._boom(S.x, S.y, ZS, 2.2, true); this.cues.emit(SoundCue.Miss);
        this._emit('die');
    }
    _breakChain() { this.chain = 0; this.comboT = 0; this._setMult(); }
    _setMult() { const m = Math.min(8, 1 + Math.floor(this.chain / 2)); if (m > this.mult) { this._emit('combo', { mult: m }); this.maxMult = Math.max(this.maxMult, m); } this.mult = m; }

    _gatePassed(o) {
        if (o.k === 'diamond') {
            this.frozen = true; this.freezeT = 0; this.flash = 0.75; this.stage = 'frozen'; this.score += 25000; this.cues.emit(SoundCue.Win); this._emit('freeze');
            return;
        }
        this.gatesPassed++;
        const total = o.n === 2 ? 3 : 1;
        this.score += 1000; this._emit('pass', { kind: o.kind });
        if (o.kind === 'tri' && this.gatesPassed < total) return;
        // the symbol lights
        this.knocks = Math.max(this.knocks, this.act); this.stage = 'symbol'; this.symbolShow = { n: this.act, t: 0 };
        this.score += 5000; this.flash = 1; this.cues.emit(SoundCue.Bonus); this._emit('symbol', { n: this.act });
        for (const q of this.objs) if (q !== o && q.k !== 'gate' && !(q.k === 'stone' && !q.intruder) && q.z < 60) { /* leftovers burn off */ this._boom(q.x, q.y, q.z, 1.0); q.z = -99; }
        this.eshots.length = 0;
    }

    _spawnDiamond() {
        // between two great stones, the three symbols overlapped, the little light at its heart
        const d = this._add({ k: 'diamond', x: 0, y: 2.0, z: ZG, r: 4.4, passed: false, dz: 1.8 });
        this._add({ k: 'stone', x: -7.6, y: 0, z: ZG, w: 2.0, top: 8.8, cw: 4.4, intruder: false, side: -1, great: true });
        this._add({ k: 'stone', x: 7.6, y: 0, z: ZG, w: 2.0, top: 8.8, cw: 4.4, intruder: false, side: 1, great: true });
        this.diamond = d;
    }

    // ---------------------------------------------------------------- shots
    _shots(dt, V) {
        const S = this.ship, B = this.boss && this.boss.state !== 'dying' ? this.boss : null;
        // the assist's candidates, once a frame
        const tg = this._tg || (this._tg = []); tg.length = 0;
        for (const o of this.objs) if (!o.deco && SHOOTABLE.has(o.k)) tg.push(o);
        if (B && B.state === 'fight') for (const p of B.parts) if (!p.dead && Boss.exposed(B, p)) tg.push(p);
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i];
            s.pz = s.z; s.z += (s.vz - V) * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
            // a gentle lean toward the nearest target (aim assist)
            let best = null, bd = 1e9;
            for (const o of tg) {
                if (o.z < s.z + 2 || o.z > s.z + 70) continue;
                const d = Math.hypot(o.x - s.x, (o.y - s.y) * 1.2); if (d < 3.4 && d < bd) { bd = d; best = o; }
            }
            if (best) { const pull = this.kn.assist * 9 * dt; s.x += clamp(best.x - s.x, -1, 1) * pull; s.y += clamp(best.y - s.y, -1, 1) * pull; }
            let dead = s.life <= 0 || s.z > 64;
            if (!dead && B && Boss.shotHit(this, B, s)) dead = true;
            if (!dead) for (let j = this.objs.length - 1; j >= 0; j--) {
                const o = this.objs[j];
                if (o.deco || o.k === 'boss') continue;
                const rel0 = s.pz - o.pz, rel1 = s.z - o.z;
                if (!(rel0 <= o.dz + 0.3 && rel1 >= -o.dz - 0.3)) continue;
                if (SHOOTABLE.has(o.k)) {
                    if (Math.hypot(o.x - s.x, (o.y - s.y) * 1.1) < o.r + 0.35) { o.hp -= s.dmg || 1; o.hit = 0.12; if (o.hp <= 0) this._kill(o, j); else this._emit('ping'); dead = true; break; }
                } else if (o.k === 'pillar') {
                    if (Math.abs(o.x - s.x) < o.w && s.y < o.top) { this._spark(s.x, s.y, o.z - 1); dead = true; break; }
                } else if (o.k === 'stone') {
                    if (Math.abs(o.x - s.x) < o.w || (Math.abs(o.x - s.x) < o.cw && s.y > o.top - 2.2 && s.y < o.top)) { this._spark(s.x, s.y, o.z - 1); dead = true; break; }
                } else if (o.k === 'arch') {
                    if (Math.abs(s.x - o.x) > o.half - 0.3 || (s.y > o.yl && s.y < o.top)) { this._spark(s.x, s.y, o.z - 1); dead = true; break; }
                }
            }
            if (dead) this.shots.splice(i, 1);
        }
        for (let i = this.eshots.length - 1; i >= 0; i--) {
            const s = this.eshots[i];
            s.pz = s.z; s.z += (s.vz - V) * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
            let dead = s.life <= 0 || s.z < 0.5;
            if (!dead && S.alive && s.pz >= ZS - 0.4 && s.z <= ZS + 0.4) {
                if (S.invuln <= 0 && Math.hypot((s.x - S.x) / (0.68 * this.kn.hitSize + s.r), (s.y - S.y) / (0.48 * this.kn.hitSize + s.r)) < 1) { this.hitsTaken++; this._damage(); dead = true; }
                else if (!s.near && Math.hypot((s.x - S.x) / (0.68 + s.r + 0.55), (s.y - S.y) / (0.48 + s.r + 0.45)) < 1) { s.near = true; if (S.invuln <= 0) this._nearMiss(s.x, s.y, s.z, 10, null); }
            }
            if (!dead) for (let j = this.shots.length - 1; j >= 0; j--) {
                const p = this.shots[j];
                if (Math.abs(p.z - s.z) < 2.5 && Math.hypot(p.x - s.x, p.y - s.y) < 0.8 + (s.r > 0.6 ? s.r - 0.5 : 0)) {
                    this.shots.splice(j, 1); this._spark(s.x, s.y, s.z); this.score += 10;
                    if (s.hp > 1) { s.hp--; s.hit = 0.1; } else dead = true;
                    break;
                }
            }
            if (dead) this.eshots.splice(i, 1);
        }
    }

    // ---------------------------------------------------------------- hazards (beams, sweeps, lunges): timed regions the boss paints
    _hazards(dt) {
        const S = this.ship;
        for (let i = this.hz.length - 1; i >= 0; i--) {
            const h = this.hz[i];
            if (h.arm > 0) { h.arm -= dt; h.t += dt; continue; }
            h.t += dt; h.dur -= dt; h.active = true;
            let x0 = h.x0, x1 = h.x1;
            if (h.kind === 'sweep') { const p = clamp(1 - h.dur / h.total, 0, 1), cx = h.from + (h.to - h.from) * p; x0 = cx - h.w; x1 = cx + h.w; h.cx = cx; }
            const hs = this.kn.hitSize;
            if (S.alive && S.invuln <= 0 && S.x + 0.68 * hs > x0 && S.x - 0.68 * hs < x1 && S.y + 0.44 * hs > h.y0 && S.y - 0.44 * hs < h.y1) { this.hitsTaken++; this._damage(); }
            if (h.dur <= 0) this.hz.splice(i, 1);
        }
    }

    _kill(o, idx, rammed = false) {
        const j = idx >= 0 && this.objs[idx] === o ? idx : this.objs.indexOf(o);
        if (j >= 0) this.objs.splice(j, 1);
        o.dead = true; this.kills++;
        const base = PTS[o.k] || (o.k === 'rock' ? (o.big ? 30 : o.r > 1.3 ? 20 : 10) : 0);
        if (!rammed) {
            const v = base * this.mult; this.score += v;
            if (base && (o.k === 'rock' ? o.r > 1.5 : base >= 60)) this._pop('+' + v, o.x, o.y + 0.8, o.z, this.mult > 1 ? 1 : 0);   // (a pop-up only for the big kills and the bonuses)
            this.chain++; this.comboT = 2.4; this._setMult();
            if (o.fid) {
                const f = this.forms.get(o.fid);
                if (f) { f.kills++; if (f.kills >= f.n && !f.esc) {
                    const bonus = 40 * f.n * this.mult; this.score += bonus; this.formBonuses++; this.forms.delete(o.fid);
                    this._pop('FORMATION +' + bonus, o.x, o.y + 1.6, Math.max(o.z, ZS + 6), 2); this.hitStop = Math.max(this.hitStop, 0.05); this.flash = Math.max(this.flash, 0.18); this.shake = Math.max(this.shake, 0.4); this._emit('formation', { n: f.n });
                } }
            }
        } else if (o.fid) { const f = this.forms.get(o.fid); if (f) f.esc = true; }
        const big = o.k === 'rock' ? o.r > 1.5 : true, size = o.k === 'rock' ? 0.6 + o.r * 0.5 : 1.3;
        this._boom(o.x, o.y, o.z, size);
        if (big && !rammed) { this.hitStop = Math.max(this.hitStop, o.k === 'rock' ? 0.035 : 0.05); this.shake = Math.max(this.shake, o.k === 'rock' ? 0.3 : 0.4); }
        this._emit('boom', { big: o.k === 'rock' && o.r > 1.5, kind: o.k });
        this.cues.emit(SoundCue.Hit);
        if (o.k === 'rock' && o.r > 1.5) {
            const n = o.big ? 3 : 2;
            for (let q = 0; q < n; q++) this._rock(o.x, o.y, o.z + (q - 1) * 0.6, o.r * 0.52, (q - (n - 1) / 2) * 3.4, (this.rng.nextDouble() - 0.5) * 2.4);
        }
    }

    _pop(text, x, y, z, kind = 0) { if (this.pops.length > 14) this.pops.shift(); this.pops.push({ text, x, y, z, t: 0, life: kind >= 2 ? 1.4 : 0.9, kind }); }
    _popsStep(dt) { for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; p.y += dt * 1.2; if (p.t > p.life) this.pops.splice(i, 1); } }

    _spark(x, y, z) { for (let i = 0; i < 4; i++) this.parts.push({ x, y, z, vx: (this.rng.nextDouble() - 0.5) * 6, vy: (this.rng.nextDouble() - 0.5) * 6, vz: 0, life: 0.3, max: 0.3, size: 0.18, kind: 'spark' }); }
    /** a layered explosion: flash, fire, a shock ring, smoke and debris (the bigger it is, the more of each) */
    _boom(x, y, z, size, ship = false) {
        const small = !ship && size < 1.3;           // a small kill: a short flash and a few sparks of fire (the full layers are for the big ones)
        const P = this.parts, crowd = P.length > 300, n = Math.round((ship ? 26 : small ? 5 : 12) * Math.min(1.6, size) * (crowd ? 0.5 : 1)), r = this.rng;
        P.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: small ? 0.2 : 0.38, max: small ? 0.2 : 0.38, size: size * (small ? 1.2 : 1.7), kind: 'flash' });
        for (let i = 0; i < n; i++) {
            const a = r.nextDouble() * 6.283, sp = (0.8 + r.nextDouble() * 4.5) * size * (small ? 0.7 : 1), l = (0.45 + r.nextDouble() * 0.6) * (small ? 0.55 : 1);
            P.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (r.nextDouble() - 0.4) * 5, life: l, max: l, size: (0.2 + r.nextDouble() * 0.35) * size * (small ? 0.6 : 1), kind: 'fire' });
        }
        if (size >= 1.3 && !crowd) P.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.42, max: 0.42, size: size * 2.6, kind: 'ring' });
        if (size >= 1.5 && !crowd) {
            for (let i = 0; i < 4; i++) { const l = 0.9 + r.nextDouble() * 0.6; P.push({ x: x + (r.nextDouble() - 0.5) * size, y, z, vx: (r.nextDouble() - 0.5) * 1.6, vy: 0.8 + r.nextDouble() * 1.2, vz: 0, life: l, max: l, size: (0.5 + r.nextDouble() * 0.5) * size, kind: 'smoke' }); }
            const nd = Math.min(8, Math.round(4 * size));
            for (let i = 0; i < nd; i++) { const a = r.nextDouble() * 6.283, sp = (2 + r.nextDouble() * 5) * size, l = 0.7 + r.nextDouble() * 0.5; P.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp * 0.8 + 1.5, vz: (r.nextDouble() - 0.5) * 5, life: l, max: l, size: 0.12 + r.nextDouble() * 0.1, kind: 'debris' }); }
        }
    }
    _parts(dt) {
        const V = this.V;
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const p = this.parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += (p.vz - V) * dt;
            if (p.kind === 'fire') p.vy -= 1.5 * dt; else if (p.kind === 'debris') p.vy -= 9 * dt; else if (p.kind === 'smoke') p.vx *= 0.98;
            if (p.life <= 0 || p.z < 0.6) this.parts.splice(i, 1);
        }
    }

    // ---------------------------------------------------------------- the little light (Act III): the safe line, always a little ahead
    _lightStep(dt) {
        const L = this.light;
        let tx = Math.sin(this.time * 0.5) * 2.4, ty = -1 + Math.sin(this.time * 0.8) * 0.5;
        const d = this.objs.find((o) => o.k === 'diamond' && !o.passed);
        if (d) { tx = d.x; ty = d.y - 0.9; }
        else {
            // the next gap between intruding stones
            let near = null;
            for (const o of this.objs) if (o.k === 'stone' && o.intruder && o.z > ZS + 2 && o.z < 120 && (!near || o.z < near.z)) near = o;
            if (near) {
                const mates = this.objs.filter((o) => o.k === 'stone' && o.intruder && Math.abs(o.z - near.z) < 3);
                if (mates.length >= 2) { tx = (mates[0].x + mates[1].x) / 2; ty = -0.9; }
                else tx = near.x + (near.x > 0 ? -1 : 1) * (near.w + 2.6) * 1.0;
            }
        }
        L.tx = tx; L.ty = ty;
        const k = Math.min(1, dt * 2.4);
        L.x += (L.tx - L.x) * k; L.y += (L.ty - L.y) * k; L.ph += dt;
        L.z = ZS + 17 + Math.sin(this.time * 1.3) * 1.2;
        // when the diamond reaches it, the light is at its heart
        if (d && d.z - 0.6 < L.z) L.z = Math.max(d.z - 0.6, ZS + 1.2);
    }

    // ---------------------------------------------------------------- test hooks
    /** jump to an act (tests, the arcade test): its first screen is already in motion */
    skipTo(act) { this.act = act; this.knocks = act - 1; this._beginAct(true); }
    /** straight to the act's boss (tests): the approach is over, the boss comes in. quick = a pushover (the arcade test's glass) */
    toBoss(quick = false) { if (this.stage !== 'play' || this.bossStarted || this.gateSpawned) return false; this.actT = Math.max(this.actT, SV.ACT_LEN); this.cardT = 0; this._startBoss(quick); return true; }
    /** fly straight to the end of the act: the boss is a pushover, then the gate is next (tests) */
    toGate() {
        this.cardT = 0;
        if (this.boss && !this.boss.quick) Boss.makeQuick(this, this.boss);
        else if (!this.bossStarted && !this.gateSpawned) { this._quick = true; this.toBoss(true); }
    }
    /** tests: hurt one of the boss's parts by id (goes through the same armour rules as a bolt) */
    hurtBoss(id, dmg) { const b = this.boss, p = b && b.parts.find((q) => q.id === id); return p ? Boss.hitPart(this, b, p, dmg) : false; }
    collectStats(into) { into.knocks = (into.knocks || 0) + this.knocks; into.hits = (into.hits || 0) + this.hitsTaken; into.kills = (into.kills || 0) + this.kills; into.rolls = (into.rolls || 0) + this.rolls; }
}
