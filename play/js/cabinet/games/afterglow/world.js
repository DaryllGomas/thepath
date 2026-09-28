// THE NODE · world 1 · AFTERGLOW on the Cabinet Engine · THE SKY: the flight's rules.
//
// Everything lives in JET-RELATIVE metres: x right, y up (the ground is y = 0), z = distance AHEAD of the
// player's jet (the jet is always at z = 0 and the world streams past at V). The camera hangs D metres
// behind and CAM_UP above the jet, follows it with lag, and ROLLS: part of the jet's bank tilts the horizon,
// and a BARREL ROLL spins the whole world once round (the 1987 trick). The sim owns the camera because the
// lock-on is judged where the player sees it: in UNROLLED screen space (a roll is a pure rotation of the
// tube, so it never changes a distance on it).
//
//   proj(x, y, z)       unrolled screen: sx = VPX + (x - camX) F / (z + D), sy = H0 + (camY - y) F / (z + D)
//   the RETICLE         the point ZR ahead of the jet (plus a little of its velocity): enemies whose screen
//                       position falls in the lock box get LOCKED, one every LOCK_EVERY, up to four
//   A                   fires a homing missile at every lock (no lock: one straight down the reticle)
//   the VULCAN          fires by itself: anything in the small gun box inside GUN_RANGE takes damage
//   B / double-tap      the BARREL ROLL: 0.8 s, a sideways kick, missiles pass through you while you spin;
//                       the price: unfired locks shake loose, and nothing locks and the gun is quiet mid-roll
//   enemy MISSILES      home with a limited sideways acceleration until GUIDE_CUT s before they arrive, then
//                       fly straight: a late hard turn beats them, an early one does not (out-turn them)
//
// A STAGE: waves of fighters (head-on from the horizon, catch-up from ahead, overtakers from behind; aces
// in red fire missiles), a BOMBER at ~18 s (four engines = four lock points), more waves, then the FORTRESS
// (six lock points) which stays until destroyed or it escapes. The stage is clear when the fortress is gone.
// Plain doubles: there is no C# twin to match bit for bit. A seed always flies the same round.
import { SystemRandom, SoundCue } from '../../sdk/index.js';
import { BOMBER_POINTS, FORT_POINTS } from './models.js';

export const V = 200;              // forward speed, m/s: the ground streams past at this
export const D = 38;               // camera distance behind the jet
export const F = 220;              // focal length, px
export const H0 = 92;              // the horizon row (unrolled): camera height at infinity
export const VPX = 160;            // the vanishing point column
export const CAM_UP = 10;          // the camera rides this far above the jet
export const ZR = 300;             // the reticle's distance ahead
export const LOCK_W = 26, LOCK_H = 22;       // the lock box half-size, px
export const GUN_W = 15, GUN_H = 13, GUN_RANGE = 440, GUN_TICK = 0.07, GUN_DMG = 0.4;
export const LOCK_NEAR = 55, LOCK_FAR = 1150, MAX_LOCKS = 4, LOCK_EVERY = 0.1;
export const ROLL_TIME = 0.8, ROLL_SAFE0 = 0.04, ROLL_SAFE1 = 0.74, ROLL_COOL = 0.35, ROLL_KICK = 55;
export const VX_MAX = 78, VY_MAX = 52, ACCEL = 270;
export const HIT_R = 6.0, GUIDE_CUT = 0.24, MISSILE_ACC = 36;
export const BOMBER_ELEV = 0.44, FORT_ELEV = 0.22;   // the view elevation the boss sprites are baked at
export const TAU = Math.PI * 2;

export const STAGES = [
    { name: 'OPEN SEA', xMax: 110, yMin: 30, yMax: 150, canyon: false },
    { name: 'RED DESERT', xMax: 110, yMin: 30, yMax: 150, canyon: false },
    { name: 'AFTERGLOW CANYON', xMax: 58, yMin: 28, yMax: 108, canyon: true, wall: 86, rim: 142 },
];
const STAGE_MUL = [0.85, 1.1, 1.35];     // the sea teaches, the desert tests, the canyon is the exam

export const Kind = Object.freeze({ Fighter: 0, Ace: 1, Bomber: 2, Fortress: 3 });
export const Mode = Object.freeze({ Head: 0, Chase: 1, Over: 2 });
export const BossState = Object.freeze({ Enter: 0, Hold: 1, Leave: 2, Dying: 3, Gone: 4 });

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function ease(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
function easeOut(p) { p = clamp(p, 0, 1); return 1 - (1 - p) * (1 - p) * (1 - p); }
function lerpK(dt, rate) { return 1 - Math.exp(-rate * dt); }

class Foe {
    constructor(id, kind, mode, x, y, z) {
        this.id = id; this.kind = kind; this.mode = mode;
        this.x = x; this.y = y; this.z = z; this.vx = 0; this.vy = 0; this.vz = 0;
        this.baseX = x; this.baseY = y;
        this.hp = kind === Kind.Ace ? 2.4 : 2; this.value = kind === Kind.Ace ? 800 : 500;
        this.alive = true; this.age = 0; this.lock = null; this.pending = 0; this.gunT = -9;
        this.wA = 0; this.wF = 1; this.wP = 0;
        this.breaking = false; this.breakDir = 1; this.breakZ = 220;
        this.fireZ = 0; this.willFire = false; this.fired = false;
        this.bank = 0; this.yaw = mode === Mode.Head ? Math.PI : 0;
        this.isPoint = false; this.sx = 0; this.sy = 0;
    }
}

class Point {
    constructor(owner, k, ox, oy, oz, elev, hp) {
        this.owner = owner; this.k = k;
        this.ox = ox; this.oy = oy * Math.cos(elev) + oz * Math.sin(elev);      // offset as the sprite shows it
        this.hp = hp; this.alive = true; this.lock = null; this.pending = 0; this.gunT = -9;
        this.value = 1000; this.isPoint = true; this.x = 0; this.y = 0; this.z = 0; this.sx = 0; this.sy = 0;
        this.id = -1;
    }
}

class Boss {
    constructor(kind, x, y, z) {
        this.kind = kind; this.x = x; this.y = y; this.z = z;
        this.state = BossState.Enter; this.t = 0; this.fireT = 1.2; this.nextGun = 0;
        this.points = []; this.alive = true; this.bank = 0; this.dieAt = 0; this.bonus = 0; this.escaped = false;
    }
}

export class AfterglowWorld {
    constructor(seed) {
        this.rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        this.cues = null;              // the round's CueBuffer
        this.sfx = [];                 // named effects this step: lock missile explosion boom warning roll dodge crash
        // tuning (set by the round from the knobs)
        this.fireRate = 1; this.missileTurn = 1; this.aceShare = 0.3; this.lockBox = 1;
        this.autoRolls = 0; this.unlosable = false; this.lives = 3;
        // state
        this.stage = 0; this.def = STAGES[0]; this.now = 0; this.stageT = 0; this.dist = 0;
        this.spawning = false; this.score = 0; this.hits = 0; this.stageHits = 0; this.dead = false; this.stageDone = false;
        this.foes = []; this.boss = null; this.emissiles = []; this.pmissiles = []; this.booms = []; this.locks = [];
        this.targets = [];
        this.timeline = []; this.tl = 0; this._id = 1; this.bossResult = 0; this.doneT = -1;
        this.ammo = 99; this.lockCool = 0; this.gunT = 0; this.lockOnAt = -9;
        this.shieldAt = -9; this.bossBonus = 0;
        // the jet
        this.px = 0; this.py = 70; this.pvx = 0; this.pvy = 0; this.bank = 0; this.alive = true;
        this.respawnT = 0; this.invulnT = 0; this.rollT = -1; this.rollDir = 1; this.rollCool = 0;
        this.lastTapL = -9; this.lastTapR = -9; this.relL = -9; this.relR = -9; this.entry = 0; this.rollReq = -1; this.rollReqDir = 1;
        // the camera
        this.camX = 0; this.camY = 80; this.camRoll = 0; this.camRollBank = 0; this.jetRoll = 0; this.shake = 0;
        // reticle (unrolled screen)
        this.rx = VPX; this.ry = H0; this.jx = VPX; this.jy = H0 + 58;
        // stats
        this.st = { deaths: 0, byMissile: 0, byCrash: 0, rolls: 0, dodges: 0, autoSaves: 0, fired: 0, locks: 0,
            kills: 0, foes: 0, enemyMissiles: 0, bombers: 0, fortresses: 0, escaped: 0, nearMiss: 0, stages: 0,
            dieStage: [0, 0, 0], dieSrc: [0, 0, 0, 0, 0], mslSrc: [0, 0, 0, 0], points: 0 };
        this._p = { sx: 0, sy: 0, s: 0 };
    }

    // ------------------------------------------------------------------ helpers
    emit(c) { if (this.cues) this.cues.emit(c); }
    fx(name) { this.sfx.push(name); }
    r(a, b) { return a + (b - a) * this.rng.nextDouble(); }
    chance(p) { return this.rng.nextDouble() < p; }
    get stageMul() { return STAGE_MUL[this.stage]; }
    get rolling() { return this.rollT >= 0; }
    get rollSafe() { return this.rollT >= ROLL_SAFE0 && this.rollT <= ROLL_SAFE1; }
    get invulnerable() { return this.rollSafe || this.invulnT > 0 || !this.alive; }
    get rollP() { return this.rollT >= 0 ? this.rollT / ROLL_TIME : 0; }

    // unrolled screen projection into this._p; false when behind the camera
    proj(x, y, z) {
        const Z = z + D;
        if (Z < 2) return false;
        const s = F / Z;
        this._p.sx = VPX + (x - this.camX) * s; this._p.sy = H0 + (this.camY - y) * s; this._p.s = s;
        return true;
    }

    // ------------------------------------------------------------------ stages
    startStage(i) {
        this.stage = i; this.def = STAGES[i]; this.stageT = 0;
        this.foes.length = 0; this.boss = null; this.emissiles.length = 0; this.pmissiles.length = 0; this.locks.length = 0;
        this.targets.length = 0;
        this.stageHits = 0; this.bossResult = 0; this.doneT = -1; this.stageDone = false; this.spawning = false;
        this.ammo = 99; this.bossBonus = 0;
        this.px = 0; this.py = clamp(72, this.def.yMin, this.def.yMax); this.pvx = 0; this.pvy = 0; this.bank = 0;
        this.rollT = -1; this.rollCool = 0; this.invulnT = 0; this.entry = 1; this.rollReq = -1;
        if (this.lives > 0) { this.alive = true; this.respawnT = 0; }
        this.camX = 0; this.camY = this.py + CAM_UP;
        this.timeline = this._buildTimeline(i); this.tl = 0;
    }

    _buildTimeline(stage) {
        const ev = [];
        let t = 1.2;
        while (t < 16.5) { ev.push({ t, k: 'wave' }); t += this.r(2.7, 3.5) - stage * 0.25; }
        ev.push({ t: 18.5, k: 'bomber' });
        ev.push({ t: 24.0, k: 'light' });
        ev.push({ t: 28.5, k: 'light' });
        t = 32.5;
        while (t < 41) { ev.push({ t, k: 'wave' }); t += this.r(2.5, 3.2) - stage * 0.25; }
        ev.push({ t: 43.0, k: 'fortress' });
        return ev;
    }

    // ------------------------------------------------------------------ the step
    // ctl = { sx, sy, fire, roll, tapL, tapR } (fire/roll/taps are fresh presses)
    tick(dt, ctl) {
        this.sfx.length = 0;
        this.now += dt;
        this.dist += V * dt;
        if (this.spawning) this.stageT += dt;
        this._player(dt, ctl);
        this._camera(dt);
        if (this.spawning) this._spawn();
        this._foes(dt);
        this._boss(dt);
        this._collectTargets();
        this._locks(dt, ctl);
        this._gun(dt);
        this._pmissiles(dt);
        this._emissiles(dt);
        this._booms(dt);
        if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.2);
        if (this.doneT >= 0) { this.doneT -= dt; if (this.doneT < 0) this.stageDone = true; }
    }

    // ------------------------------------------------------------------ the jet
    _player(dt, ctl) {
        const d = this.def;
        if (this.entry > 0) this.entry = Math.max(0, this.entry - dt / 1.3);
        if (!this.alive) {
            this.pvx *= Math.exp(-3 * dt); this.pvy *= Math.exp(-3 * dt);
            if (this.lives > 0 && this.respawnT > 0) {
                this.respawnT -= dt;
                if (this.respawnT <= 0) {
                    this.alive = true; this.invulnT = 2.2; this.entry = 1; this.rollT = -1; this.rollCool = 0;
                    this.px = clamp(this.camX, -d.xMax, d.xMax); this.pvx = 0; this.pvy = 0;
                }
            }
            return;
        }
        if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);
        const sx = ctl ? clamp(ctl.sx, -1, 1) : 0, sy = ctl ? clamp(ctl.sy, -1, 1) : 0;
        // the stick sets a target velocity; the jet gets there with inertia
        const tvx = sx * VX_MAX, tvy = sy * VY_MAX;
        const ax = clamp(tvx - this.pvx, -ACCEL * dt, ACCEL * dt), ay = clamp(tvy - this.pvy, -ACCEL * dt, ACCEL * dt);
        this.pvx += ax; this.pvy += ay * 0.8;
        this.px += this.pvx * dt; this.py += this.pvy * dt;
        if (this.px < -d.xMax) { this.px = -d.xMax; if (this.pvx < 0) this.pvx = 0; }
        if (this.px > d.xMax) { this.px = d.xMax; if (this.pvx > 0) this.pvx = 0; }
        if (this.py < d.yMin) { this.py = d.yMin; if (this.pvy < 0) this.pvy = 0; }
        if (this.py > d.yMax) { this.py = d.yMax; if (this.pvy > 0) this.pvy = 0; }
        // the barrel roll: B, or a double tap left/right
        if (ctl) {
            // a double tap = a flick (held under 0.15 s), released, and flicked again within 0.2 s
            if (ctl.tapL) { if (this.now - this.relL < 0.2 && this.relL - this.lastTapL < 0.15) this.startRoll(-1, false); this.lastTapL = this.now; }
            if (ctl.tapR) { if (this.now - this.relR < 0.2 && this.relR - this.lastTapR < 0.15) this.startRoll(1, false); this.lastTapR = this.now; }
            if (ctl.relL) this.relL = this.now;
            if (ctl.relR) this.relR = this.now;
            if (ctl.roll) { this.rollReq = this.now; this.rollReqDir = sx < -0.2 ? -1 : sx > 0.2 ? 1 : (this.bank < -0.05 ? -1 : 1); }
        }
        // B is buffered for a quarter second: pressed at the end of a roll or in its cooldown, it still rolls
        if (this.rollReq >= 0 && this.now - this.rollReq <= 0.25) { if (this.startRoll(this.rollReqDir, false)) this.rollReq = -1; }
        else this.rollReq = -1;
        if (this.rollT >= 0) {
            this.rollT += dt;
            if (this.rollT >= ROLL_TIME) { this.rollT = -1; this.rollCool = ROLL_COOL; }
        } else if (this.rollCool > 0) this.rollCool = Math.max(0, this.rollCool - dt);
    }

    startRoll(dir, forced) {
        if (!this.alive) return false;
        if (!forced && (this.rollT >= 0 || this.rollCool > 0)) return false;
        if (this.rollT >= 0 && this.rollSafe) return false;
        this.rollT = 0; this.rollDir = dir;
        this.pvx = clamp(this.pvx + dir * ROLL_KICK, -VX_MAX * 1.3, VX_MAX * 1.3);
        // the price of a roll: the locks you had not fired yet shake loose (and nothing locks mid-roll)
        for (let i = this.locks.length - 1; i >= 0; i--) {
            const L = this.locks[i];
            if (L.missile) continue;
            if (L.target.lock === L) L.target.lock = null;
            this.locks.splice(i, 1);
        }
        this.st.rolls++;
        this.fx('roll');
        return true;
    }

    _camera(dt) {
        const bt = clamp(this.pvx / VX_MAX, -1.2, 1.2) * 0.9;
        this.bank += (bt - this.bank) * lerpK(dt, 7);
        this.camX += (this.px * 0.8 - this.camX) * lerpK(dt, 4.2);
        this.camY += (this.py + CAM_UP - this.camY) * lerpK(dt, 3.2);
        this.camRollBank = -0.62 * this.bank;
        const p = this.rollP;
        const pc = this.rollT >= 0 ? clamp((this.rollT - 0.06) / (ROLL_TIME - 0.06), 0, 1) : 0;
        const jetSpin = this.rollT >= 0 ? this.rollDir * TAU * ease(p) : 0;
        const camSpin = this.rollT >= 0 ? this.rollDir * TAU * ease(pc) : 0;
        this.camRoll = this.camRollBank - camSpin;
        this.jetRoll = 0.38 * this.bank + (jetSpin - camSpin);
        // the reticle and the jet, unrolled
        const Zr = ZR + D;
        this.rx = VPX + (this.px + this.pvx * 0.25 - this.camX) * F / Zr;
        this.ry = H0 + (this.camY - this.py - this.pvy * 0.25) * F / Zr;
        this.jx = VPX + (this.px - this.camX) * F / D;
        this.jy = H0 + (this.camY - this.py) * F / D + this.entry * this.entry * 90;
    }

    // ------------------------------------------------------------------ spawning
    _spawn() {
        while (this.tl < this.timeline.length && this.stageT >= this.timeline[this.tl].t) {
            const e = this.timeline[this.tl++];
            if (e.k === 'wave') this._wave(false);
            else if (e.k === 'light') { if (this.boss == null || this.boss.state <= BossState.Hold) this._wave(true); }
            else if (e.k === 'bomber') this._bomber();
            else if (e.k === 'fortress') this._fortress();
        }
    }

    _foe(kind, mode, x, y, z) {
        const d = this.def;
        const f = new Foe(this._id++, kind, mode, clamp(x, -d.xMax - 30, d.xMax + 30), clamp(y, d.yMin, d.yMax + 20), z);
        this.foes.push(f);
        this.st.foes++;
        return f;
    }

    _isAce(boost = 0) { return this.chance(clamp(this.aceShare * this.stageMul + boost, 0, 0.9)); }

    _wave(light) {
        const d = this.def, s = this.stage;
        const ax = clamp(this.px + this.r(-55, 55), -d.xMax, d.xMax);
        const ay = clamp(this.py + this.r(-14, 20), d.yMin + 6, d.yMax - 6);
        const pick = light ? 2 : this.rng.next(s === 0 ? 5 : 7);
        const rate = this.fireRate, sm = this.stageMul;
        // a formation fires as a VOLLEY: every shooter lets go as it crosses the same distance, so one WARNING
        // is answered by one roll (the formation's depth spreads the arrivals by a fifth of a second at most)
        const volleyZ = this.r(640, 860);
        const headFire = (f, ace) => {
            f.willFire = ace ? this.chance(0.85 * rate) : this.chance(0.12 * rate * sm);
            f.fireZ = volleyZ - (f.z - 1300) * 0.0;
        };
        switch (pick) {
            case 0: case 5: {                      // a V of five, head-on (5 in the desert: weaving echelon)
                const weave = pick === 5;
                const offs = weave ? [[-24, 0, 0], [-12, 0, 25], [0, 0, 50], [12, 0, 75], [24, 0, 100]]
                    : [[0, 0, 0], [-14, 0, 30], [14, 0, 30], [-28, 0, 60], [28, 0, 60]];
                const ph = this.r(0, TAU);
                for (let i = 0; i < offs.length; i++) {
                    const ace = this._isAce(i === 0 && s > 0 ? 0.25 : 0);
                    const f = this._foe(ace ? Kind.Ace : Kind.Fighter, Mode.Head, ax + offs[i][0], ay + offs[i][1], 1300 + offs[i][2]);
                    f.vz = -320; if (weave) { f.wA = 18; f.wF = 1.1; f.wP = ph + i * 0.5; }
                    f.breakZ = this.r(180, 300); headFire(f, ace);
                }
                break;
            }
            case 1: case 6: {                      // a line abreast, head-on
                const n = pick === 6 ? 5 : 4;
                for (let i = 0; i < n; i++) {
                    const ace = this._isAce();
                    const f = this._foe(ace ? Kind.Ace : Kind.Fighter, Mode.Head, ax + (i - (n - 1) / 2) * 16, ay + (i & 1) * 6, 1250 + i * 12);
                    f.vz = -300; f.breakZ = this.r(200, 320); headFire(f, ace);
                }
                break;
            }
            case 2: {                              // catch-up fighters: you run them down from behind
                const n = light ? 2 : 4;
                for (let i = 0; i < n; i++) {
                    const f = this._foe(this._isAce(-0.1) ? Kind.Ace : Kind.Fighter, Mode.Chase, ax + (i - (n - 1) / 2) * 20, ay + this.r(-6, 6), 1050 + i * 40);
                    f.vz = -115; f.wA = this.r(6, 14); f.wF = this.r(0.7, 1.2); f.wP = this.r(0, TAU); f.breakZ = this.r(160, 240);
                }
                break;
            }
            case 3: {                              // overtakers from behind; an ace among them fires first
                const n = s === 2 ? 3 : 2;
                const side = this.chance(0.5) ? -1 : 1;
                for (let i = 0; i < n; i++) {
                    const ace = i === 0 && this._isAce(0.2);
                    const f = this._foe(ace ? Kind.Ace : Kind.Fighter, Mode.Over, this.px + side * (14 + i * 16) * (i & 1 ? -1 : 1), this.camY + 18 + i * 5, -D - 110 - i * 50);
                    f.vz = 160; f.breakZ = this.r(620, 820);
                    if (ace && this.chance(0.85 * rate)) this._launch(this.px + side * 18, this.py + 8, -D - 480, 0, 0, 245, true, 1);
                }
                break;
            }
            case 4: {                              // a diamond, head-on, weaving
                const offs = [[0, 8, 0], [-12, 0, 22], [12, 0, 22], [0, -8, 44]];
                const ph = this.r(0, TAU);
                for (let i = 0; i < offs.length; i++) {
                    const ace = this._isAce(i === 3 ? 0.2 : 0);
                    const f = this._foe(ace ? Kind.Ace : Kind.Fighter, Mode.Head, ax + offs[i][0], ay + offs[i][1], 1300 + offs[i][2]);
                    f.vz = -310; f.wA = 14; f.wF = 0.9; f.wP = ph; f.breakZ = this.r(190, 300); headFire(f, ace);
                }
                break;
            }
        }
    }

    _bomber() {
        const b = new Boss(Kind.Bomber, this.px, this.py + 48, -D - 120);
        BOMBER_POINTS.forEach((p, k) => b.points.push(new Point(b, k, p[0], p[1], p[2], BOMBER_ELEV, 5)));
        this.st.points += b.points.length;
        b.fireT = 2.0;
        this.boss = b;
        this.fx('warning');
    }

    _fortress() {
        const b = new Boss(Kind.Fortress, this.px * 0.5, this.py + 12, 1400);
        FORT_POINTS.forEach((p, k) => b.points.push(new Point(b, k, p[0], p[1], p[2], FORT_ELEV, 8)));
        this.st.points += b.points.length;
        b.fireT = 1.6;
        this.boss = b;
        this.fx('warning');
    }

    // ------------------------------------------------------------------ enemies
    _foes(dt) {
        const d = this.def;
        for (let i = this.foes.length - 1; i >= 0; i--) {
            const f = this.foes[i];
            if (!f.alive) { this.foes.splice(i, 1); continue; }
            f.age += dt;
            const pz = f.z;
            if (f.mode === Mode.Head) {
                if (!f.breaking && f.z < f.breakZ) {
                    f.breaking = true;
                    f.breakDir = Math.abs(f.x - this.px) < 4 ? (this.chance(0.5) ? -1 : 1) : Math.sign(f.x - this.px);
                }
                if (f.breaking) {
                    f.vx = clamp(f.vx + f.breakDir * 150 * dt, -130, 130); f.vy = Math.min(60, f.vy + 45 * dt);
                    f.x += f.vx * dt; f.y += f.vy * dt;
                } else {
                    const nx = f.baseX + f.wA * Math.sin(f.wF * f.age + f.wP);
                    f.vx = (nx - f.x) / Math.max(dt, 1e-6); f.x = nx;
                }
                f.z += f.vz * dt;
                f.yaw = Math.PI - clamp(f.vx / 260, -0.9, 0.9);
                f.bank += (clamp(-f.vx / 90, -1, 1) * 0.9 - f.bank) * lerpK(dt, 5);
                if (f.willFire && !f.fired && f.z < f.fireZ && f.z > 300 && this._mayFire()) {
                    f.fired = true;
                    this._launch(f.x, f.y - 1, f.z - 8, 0, 0, -390, true, 0);
                }
                if (f.z < -D - 30 || Math.abs(f.x - this.camX) > 800) { this.foes.splice(i, 1); continue; }
            } else if (f.mode === Mode.Chase) {
                if (!f.breaking && f.z < f.breakZ) { f.breaking = true; f.breakDir = f.x < this.px ? -1 : 1; }
                if (f.breaking) {
                    f.vx = clamp(f.vx + f.breakDir * 110 * dt, -110, 110); f.vy = Math.min(70, f.vy + 70 * dt);
                    f.x += f.vx * dt; f.y += f.vy * dt;
                } else {
                    const nx = f.baseX + f.wA * Math.sin(f.wF * f.age + f.wP);
                    f.vx = (nx - f.x) / Math.max(dt, 1e-6); f.x = nx;
                }
                f.z += f.vz * dt;
                f.yaw = clamp(f.vx / 200, -0.9, 0.9);
                f.bank += (clamp(f.vx / 70, -1, 1) * 0.9 - f.bank) * lerpK(dt, 5);
                if (f.z < -D - 10 || f.y > d.yMax + 260) { this.foes.splice(i, 1); continue; }
            } else {                               // overtaker: passes overhead, settles ahead, then breaks away
                if (f.z > 60) {
                    f.vz = Math.max(70, f.vz - 60 * dt);
                    const ty = clamp(this.py + 4, d.yMin, d.yMax);
                    f.vy = (ty - f.y) * 1.2;
                    f.vx = (clamp(this.px * 0.7 + (f.baseX - this.px) * 0.4, -d.xMax, d.xMax) - f.x) * 0.8;
                }
                if (!f.breaking && f.z > f.breakZ) { f.breaking = true; f.breakDir = this.chance(0.5) ? -1 : 1; }
                if (f.breaking) { f.vx = clamp(f.vx + f.breakDir * 120 * dt, -120, 120); f.vy = Math.min(80, f.vy + 90 * dt); f.vz += 80 * dt; }
                f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
                f.yaw = clamp(f.vx / 200, -0.9, 0.9);
                f.bank += (clamp(f.vx / 60, -1, 1) * 0.9 - f.bank) * lerpK(dt, 5);
                if (f.z > 1500 || f.y > d.yMax + 300) { this.foes.splice(i, 1); continue; }
            }
            // a jet that meets ours at z = 0 is a crash
            if (this.alive && ((pz > 0 && f.z <= 0) || (pz < 0 && f.z >= 0))) {
                if (Math.abs(f.x - this.px) < 7 && Math.abs(f.y - this.py) < 5) {
                    this._kill(f, false);
                    if (!(this.invulnT > 0 || this.unlosable)) { this.st.dieSrc[4]++; this._playerHit(false); }
                    else this.shieldAt = this.now;
                }
            }
        }
    }

    _mayFire() { return this.alive && this.invulnT < 0.8 && !this.dead; }

    _boss(dt) {
        const b = this.boss;
        if (b == null) return;
        b.t += dt;
        const d = this.def;
        const rate = this.fireRate * this.stageMul;
        if (b.kind === Kind.Bomber) {
            if (b.state === BossState.Enter) {
                const p = b.t / 3.0;
                b.z = -D - 120 + (150 + D + 120) * easeOut(p);
                b.y += (this.py + 10 - b.y) * lerpK(dt, 1.2);
                b.x += (this.px - b.x) * lerpK(dt, 0.9);
                if (p >= 1) { b.state = BossState.Hold; b.t = 0; }
            } else if (b.state === BossState.Hold) {
                b.z = 150 + 12 * Math.sin(0.7 * b.t);
                b.y += (clamp(this.py + 10, d.yMin + 8, d.yMax) - b.y) * lerpK(dt, 0.55);
                const tx = clamp(this.px + 16 * Math.sin(0.45 * b.t), -d.xMax, d.xMax);
                const ox = b.x;
                b.x += (tx - b.x) * lerpK(dt, 0.7);
                b.bank = clamp((b.x - ox) / dt / 40, -0.3, 0.3);
                b.fireT -= dt;
                if (b.fireT <= 0 && this._mayFire()) {
                    b.fireT = 2.8 / rate;
                    this._launch(b.x, b.y + 1.5, b.z - 24, 0, 0, -118, true, 2);
                }
                if (b.t >= 12) { b.state = BossState.Leave; b.t = 0; b.escaped = true; }
            } else if (b.state === BossState.Leave) {
                b.z += (60 + 160 * b.t) * dt; b.y += 18 * dt;
                if (b.z > 1500) { b.state = BossState.Gone; this.boss = null; }
            } else if (b.state === BossState.Dying) {
                this._bossDying(b, dt);
                b.z += 20 * dt; b.y -= 9 * b.t * dt;
            }
        } else {
            if (b.state === BossState.Enter) {
                const p = b.t / 4.0;
                b.z = 1400 - (1400 - 180) * easeOut(p);
                b.y += (clamp(this.py + 6, d.yMin + 10, d.yMax) - b.y) * lerpK(dt, 0.8);
                b.x += (this.px * 0.6 - b.x) * lerpK(dt, 0.6);
                if (p >= 1) { b.state = BossState.Hold; b.t = 0; }
            } else if (b.state === BossState.Hold) {
                b.z = 180 + 10 * Math.sin(0.5 * b.t);
                b.y += (clamp(this.py + 6, d.yMin + 10, d.yMax) - b.y) * lerpK(dt, 0.45);
                b.x += (clamp(this.px * 0.6 + 12 * Math.sin(0.3 * b.t), -d.xMax, d.xMax) - b.x) * lerpK(dt, 0.4);
                b.fireT -= dt;
                if (b.fireT <= 0 && this._mayFire()) {
                    b.fireT = 2.2 / rate;
                    const guns = b.points.filter(q => q.alive && q.k < 4);
                    if (guns.length > 0) {
                        const q = guns[b.nextGun++ % guns.length];
                        this._launch(b.x + q.ox, b.y + q.oy, b.z - 20, 0, 0, -128, true, 3);
                    }
                }
                if (b.t >= 15) { b.state = BossState.Leave; b.t = 0; b.escaped = true; }
            } else if (b.state === BossState.Leave) {
                b.z += (40 + 220 * b.t) * dt; b.y += 25 * dt;
                if (b.z > 1600) {
                    b.state = BossState.Gone; this.boss = null;
                    this.bossResult = 2; this.st.escaped++; this.doneT = 1.2;
                }
            } else if (b.state === BossState.Dying) {
                this._bossDying(b, dt);
                b.z += 15 * dt; b.y -= 6 * b.t * dt;
            }
        }
        if (this.boss) for (const q of b.points) { q.x = b.x + q.ox; q.y = b.y + q.oy; q.z = b.z; }
    }

    _bossDying(b, dt) {
        const dur = b.kind === Kind.Fortress ? 2.4 : 1.8;
        const big = b.kind === Kind.Fortress ? 34 : 24;
        if (b.t >= b.dieAt) {
            b.dieAt += 0.22;
            const w = b.kind === Kind.Fortress ? 50 : 40;
            this._boom(b.x + this.r(-w, w), b.y + this.r(-10, 14), b.z + this.r(-20, 20), this.r(big * 0.5, big), 1, 0);
            this.fx('explosion');
        }
        if (b.t >= dur) {
            this._boom(b.x, b.y, b.z, big * 1.15, 2, 0);
            this.shake = 1;
            this.fx('boom');
            b.state = BossState.Gone; this.boss = null;
            if (b.kind === Kind.Fortress) { this.bossResult = 1; this.doneT = 1.8; }
        }
    }

    _collectTargets() {
        const t = this.targets;
        t.length = 0;
        for (const f of this.foes) if (f.alive) t.push(f);
        const b = this.boss;
        if (b && b.state === BossState.Hold) for (const q of b.points) if (q.alive) t.push(q);
    }

    // ------------------------------------------------------------------ locks, gun, missiles
    _locks(dt, ctl) {
        // drop locks that went dead, out of range or off the tube (a lock with a missile on the way holds)
        for (let i = this.locks.length - 1; i >= 0; i--) {
            const L = this.locks[i], t = L.target;
            let keep = t.alive && (L.missile != null || (t.z > 20 && t.z < LOCK_FAR + 300));
            if (keep && L.missile == null) {
                if (!this.proj(t.x, t.y, t.z)) keep = false;
                else if (Math.abs(this._p.sx - VPX) > 200 || this._p.sy < -60 || this._p.sy > 300) keep = false;
            }
            if (!keep) { if (t.lock === L) t.lock = null; this.locks.splice(i, 1); }
        }
        if (this.lockCool > 0) this.lockCool -= dt;
        if (this.alive && this.rollT < 0 && this.locks.length < MAX_LOCKS && this.lockCool <= 0) {
            const bw = LOCK_W * this.lockBox, bh = LOCK_H * this.lockBox;
            let best = null, bd = 1e9;
            for (const t of this.targets) {
                if (t.lock || t.z < LOCK_NEAR || t.z > LOCK_FAR || t.hp - t.pending <= 0) continue;
                if (!this.proj(t.x, t.y, t.z)) continue;
                const dx = Math.abs(this._p.sx - this.rx), dy = Math.abs(this._p.sy - this.ry);
                if (dx < bw && dy < bh && dx + dy < bd) { bd = dx + dy; best = t; }
            }
            if (best) {
                const L = { target: best, t0: this.now, missile: null };
                best.lock = L; this.locks.push(L);
                this.lockCool = LOCK_EVERY;
                if (this.locks.length === 1 || this.now - this.lockOnAt > 0.8) this.lockOnAt = this.now;
                this.st.locks++;
                this.emit(SoundCue.Tick); this.fx('lock');
            }
        }
        // A: a missile at every lock that has none on the way (no lock: one straight down the reticle)
        if (ctl && ctl.fire && this.alive && this.ammo > 0) {
            let n = 0;
            for (const L of this.locks) {
                if (L.missile || this.ammo <= 0) continue;
                L.missile = this._fireAt(L.target, n++);
            }
            if (n === 0) this._fireAt(null, 0);
        }
    }

    _fireAt(t, n) {
        this.ammo--; this.st.fired++;
        const side = (n & 1) ? 1 : -1;
        const m = {
            x0: this.px + side * 3, y0: this.py - 1.5, z0: 2, kx: side * (10 + n * 3), ky: -7,
            target: t, age: 0, dur: 0.3 + (t ? t.z : ZR + 150) / 1500, alive: true, dumb: t == null,
            x: this.px, y: this.py, z: 0, tx: this.px + this.pvx * 0.3, ty: this.py, tz: ZR + 150, px: 0, py: 0, pz: 0,
            trail: [], trailT: 0,
        };
        if (t) { t.pending += 2; m.tx = t.x; m.ty = t.y; m.tz = t.z; }
        this.pmissiles.push(m);
        this.fx('missile');
        return m;
    }

    _gun(dt) {
        if (!this.alive || this.rollT >= 0) return;
        this.gunT -= dt;
        if (this.gunT > 0) return;
        this.gunT += GUN_TICK;
        if (this.gunT < 0) this.gunT = 0;
        for (const t of this.targets) {
            if (!t.alive || t.z < 25 || t.z > GUN_RANGE) continue;
            if (!this.proj(t.x, t.y, t.z)) continue;
            if (Math.abs(this._p.sx - this.rx) < GUN_W && Math.abs(this._p.sy - this.ry) < GUN_H) {
                t.gunT = this.now;
                this._damage(t, GUN_DMG);
            }
        }
    }

    _pmissiles(dt) {
        for (let i = this.pmissiles.length - 1; i >= 0; i--) {
            const m = this.pmissiles[i];
            m.age += dt;
            const t = m.target;
            if (t && t.alive) { m.tx = t.x; m.ty = t.y; m.tz = t.z; }
            const p = m.age / m.dur;
            m.px = m.x; m.py = m.y; m.pz = m.z;
            if (p <= 1) {
                const q = 1 - p;
                // the start stays with the jet a moment (dropped from the pylon), the curve bends to the target
                const cx = m.x0 + m.kx + (m.tx - m.x0) * 0.3, cy = m.y0 + m.ky + (m.ty - m.y0) * 0.3, cz = m.z0 + (m.tz - m.z0) * 0.35;
                m.x = q * q * m.x0 + 2 * q * p * cx + p * p * m.tx;
                m.y = q * q * m.y0 + 2 * q * p * cy + p * p * m.ty;
                m.z = q * q * m.z0 + 2 * q * p * cz + p * p * m.tz;
            } else {
                m.x += (m.x - m.px); m.y += (m.y - m.py); m.z += (m.z - m.pz) + 0.5;
            }
            if (p >= 1 && !m.done) {
                m.done = true;
                if (t && t.alive) {
                    t.pending = Math.max(0, t.pending - 2);
                    if (t.lock && t.lock.missile === m) { t.lock.missile = null; const L = t.lock; t.lock = null; const k = this.locks.indexOf(L); if (k >= 0) this.locks.splice(k, 1); }
                    this._damage(t, 2);
                    if (t.alive) this._boom(m.x, m.y, m.z, 4, 3, 0);
                } else if (m.dumb) {
                    // a dumb-fired missile takes whatever it meets near the end of its run
                    for (const u of this.targets) if (u.alive && Math.abs(u.z - m.z) < 60 && Math.abs(u.x - m.x) < 14 && Math.abs(u.y - m.y) < 10) { this._damage(u, 2); break; }
                    this._boom(m.x, m.y, m.z, 3, 3, 0);
                } else if (t) {
                    t.pending = Math.max(0, t.pending - 2);
                }
            }
            m.trailT -= dt;
            if (m.trailT <= 0 && p <= 1.05) { m.trailT = 0.03; m.trail.push(m.x, m.y, m.z); if (m.trail.length > 30) m.trail.splice(0, 3); }
            if (p > 1 && m.trail.length > 0 && m.trailT <= 0) { m.trailT = 0.03; m.trail.splice(0, 3); }
            if (p > 1.6) this.pmissiles.splice(i, 1);
        }
    }

    _damage(t, dmg) {
        if (!t.alive) return;
        t.hp -= dmg;
        if (t.hp <= 0) this._kill(t, true);
    }

    _kill(t, scored) {
        t.alive = false;
        if (t.lock) { const k = this.locks.indexOf(t.lock); if (k >= 0) this.locks.splice(k, 1); t.lock = null; }
        if (t.isPoint) {
            this._boom(t.x, t.y, t.z, 9, 1, -10);
            this.score += t.value; this.hits++; this.stageHits++; this.st.kills++;
            this.emit(SoundCue.Hit); this.fx('explosion');
            const b = t.owner;
            if (b.points.every(q => !q.alive) && b.state !== BossState.Dying) {
                b.state = BossState.Dying; b.t = 0; b.dieAt = 0;
                const bonus = b.kind === Kind.Fortress ? 20000 : 5000;
                this.score += bonus; this.bossBonus += bonus;
                if (b.kind === Kind.Fortress) this.st.fortresses++; else this.st.bombers++;
                this.emit(SoundCue.Bonus); this.fx('boom');
                // its missiles in flight go with it
                for (const m of this.emissiles) if (m.alive && !m.passed) { m.alive = false; this._boom(m.x, m.y, m.z, 3, 3, 0); }
            }
        } else {
            this._boom(t.x, t.y, t.z, t.kind === Kind.Ace ? 8 : 7, 0, t.vz * 0.6);
            if (scored) { this.score += t.value; this.hits++; this.stageHits++; this.st.kills++; }
            this.emit(SoundCue.Hit); this.fx('explosion');
        }
    }

    // an enemy missile (guided: it homes until GUIDE_CUT)
    _launch(x, y, z, vx, vy, vz, guided, src) {
        const m = { x, y, z, vx, vy, vz, age: 0, alive: true, guided, passed: false, auto: false, trail: [], trailT: 0, px: x, py: y, pz: z, near: 0, src };
        this.st.mslSrc[src]++;
        this.emissiles.push(m);
        this.st.enemyMissiles++;
        this.emit(SoundCue.Miss); this.fx('warning');
        return m;
    }

    // seconds until an enemy missile reaches the jet's plane (z = 0), or -1 once it has passed
    tgo(m) {
        if (m.passed) return -1;
        if (m.vz < 0) return m.z > 0 ? m.z / -m.vz : -1;
        if (m.vz > 0) return m.z < 0 ? -m.z / m.vz : -1;
        return 99;
    }

    _emissiles(dt) {
        const acc = MISSILE_ACC * this.missileTurn * (0.9 + 0.1 * this.stageMul);
        for (let i = this.emissiles.length - 1; i >= 0; i--) {
            const m = this.emissiles[i];
            if (!m.alive) { this.emissiles.splice(i, 1); continue; }
            m.age += dt;
            const tg = this.tgo(m);
            if (m.guided && tg > GUIDE_CUT && this.alive) {
                const lead = 0.5;
                const tx = this.px + this.pvx * tg * lead, ty = this.py + this.pvy * tg * lead;
                const dvx = (tx - m.x) / tg - m.vx, dvy = (ty - m.y) / tg - m.vy;
                m.vx += clamp(dvx, -acc * dt, acc * dt); m.vy += clamp(dvy, -acc * dt, acc * dt);
            }
            // mercy: an auto roll when this one is about to hit (credit 5 always, credit 4 a set number of times)
            if (!m.auto && this.alive && tg > 0 && tg < 0.3 && (this.unlosable || this.autoRolls > 0)) {
                m.auto = true;
                const dx = m.x + m.vx * tg - (this.px + this.pvx * tg), dy = m.y + m.vy * tg - (this.py + this.pvy * tg);
                const safeThen = this.rollT >= 0 && this.rollT + tg >= ROLL_SAFE0 && this.rollT + tg <= ROLL_SAFE1;
                if (Math.hypot(dx, dy) < HIT_R + 3 && !safeThen && this.invulnT <= tg) {
                    this.startRoll(dx > 0 ? -1 : 1, true);
                    if (!this.unlosable) this.autoRolls--;
                    this.st.autoSaves++;
                }
            }
            m.px = m.x; m.py = m.y; m.pz = m.z;
            m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
            m.trailT -= dt;
            if (m.trailT <= 0) { m.trailT = 0.035; m.trail.push(m.x, m.y, m.z); if (m.trail.length > 36) m.trail.splice(0, 3); }
            // crossing the jet's plane
            if (!m.passed && ((m.pz > 0 && m.z <= 0) || (m.pz < 0 && m.z >= 0))) {
                m.passed = true;
                const f = m.pz / (m.pz - m.z);
                const cx = m.px + (m.x - m.px) * f, cy = m.py + (m.y - m.py) * f;
                const dist = Math.hypot(cx - this.px, cy - this.py);
                if (this.alive) {
                    if (dist < HIT_R) {
                        if (this.invulnerable) { this.st.dodges++; this.fx('dodge'); }
                        else if (this.unlosable) { this.shieldAt = this.now; this.st.dodges++; this.fx('dodge'); }
                        else { m.alive = false; this.st.dieSrc[m.src]++; this._playerHit(true); continue; }
                    } else if (dist < 20) this.st.nearMiss++;
                }
            }
            if ((m.vz < 0 && m.z < -D - 60) || (m.vz > 0 && m.z > 1200) || m.age > 9) this.emissiles.splice(i, 1);
        }
    }

    _playerHit(byMissile) {
        this._boom(this.px, this.py, 0, 12, 4, 60);
        this.shake = 0.9;
        this.alive = false; this.lives--; this.respawnT = 1.9; this.rollT = -1;
        this.st.deaths++; this.st.dieStage[this.stage]++; if (byMissile) this.st.byMissile++; else this.st.byCrash++;
        this.emit(SoundCue.Die); this.fx('crash');
        for (const m of this.emissiles) if (m.alive && !m.passed) { m.alive = false; this._boom(m.x, m.y, m.z, 3, 3, 0); }
        for (const L of this.locks) if (L.target.lock === L && !L.missile) L.target.lock = null;
        this.locks = this.locks.filter(L => L.missile != null);
        if (this.lives <= 0) { this.lives = 0; this.dead = true; }
    }

    // explosions are RECORDS (the renderer draws fire, debris and smoke from them; it never rolls our dice)
    // kind 0 fighter, 1 boss part / chain, 2 boss death, 3 puff, 4 the player's jet
    _boom(x, y, z, size, kind, vz) {
        this.booms.push({ x, y, z, vz: vz || 0, t0: this.now, seed: this.rng.next(), size, kind });
    }

    _booms(dt) {
        for (let i = this.booms.length - 1; i >= 0; i--) {
            const b = this.booms[i];
            b.z += b.vz * dt; b.vz *= Math.exp(-1.5 * dt);
            b.z -= (b.kind === 4 ? 40 : 60) * dt;        // debris falls behind as we fly on
            const life = b.kind === 2 ? 2.4 : b.kind === 3 ? 0.6 : b.kind === 4 ? 2.0 : 1.4;
            if (this.now - b.t0 > life) this.booms.splice(i, 1);
        }
    }

    // ------------------------------------------------------------------ for the round, the bot and the renderer
    get incoming() {
        let n = 0;
        for (const m of this.emissiles) if (m.alive && !m.passed) n++;
        return n;
    }

    // a stage is over (cleared, or the last jet is down): missiles in flight burst, nothing new comes, and
    // a surviving jet is safe through the tally (leftover fighters cannot take it between stages)
    clearAll() {
        for (const m of this.emissiles) if (m.alive && !m.passed) { m.alive = false; this._boom(m.x, m.y, m.z, 3, 3, 0); }
        this.spawning = false;
        if (!this.dead) this.invulnT = Math.max(this.invulnT, 30);
    }
}
