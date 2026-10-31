// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE ROUND (ICabinetSim).
// Began as the port of LastHumanSim.cs (one wave, three phases); built out 2026-10-18 into the whole game.
//
// A one-stick arena shooter. The stick moves the man and turns him to face the same way (8 directions);
// holding A fires where he faces, even standing still (8 bullets on the tube at most, fast). Holding B
// LOCKS the aim: he walks any way and keeps facing (and firing) the way he faced, so he can back off
// with the stream still going. Let go of the stick and he stands his ground.
//
// A COIN = SEVEN WAVES (waves.js), each a new mix, the last one THE MAINFRAME:
//   each wave:  the WAVE CARD (Intro: number, name, the new machine, a hint; the floor laid out behind)
//               -> GET READY: its first burst warps in (Intro) -> the wave (Playing). Later bursts warp
//               in when the floor is down to a quarter of the last burst, or the burst has run long.
//   cleared:    every machine that can die is dead (crushers and pylons don't count) -> the TALLY
//               (Interlude: the wave bonus, every human saved, no man lost) -> the next card
//   a man lost: MAN DOWN (Interlude) -> the survivors re-warp away from the middle, GET READY again
//   the last wave: the MAINFRAME's core destroyed -> it blows apart -> the tally -> HUMANITY SAVED
//   the last man down: GAME OVER. The result is set when the card goes up, never before, never on the clock.
// The machines:
//   DRONE    walks at you, re-aiming every half second or so, faster the longer the wave runs     100
//   CRUSHER  can't be killed; every bullet shoves it back. Wanders on the four axes; steps on humans
//   CORTEX   walks to the nearest human and turns it (a second or so: shoot it first); lobs sparks  500
//   HUSK     a turned human: hunts you, fast                                                        300
//   PYLON    laid out before the warp; deadly to touch; a drone that walks into one fries with it    25
//   HATCHER  drifts, takes three hits, hatches a ROLLER every few seconds (three at most)           1000
//   ROLLER   tracks you on the axes and fires SHELLS that bounce off the walls twice                 200
//   MITE     pours in from the edges in streams; the edge glows red first                            50
//   MAINFRAME  four GUN PODS fire bolts (a glow first); the CORE opens behind its shutters every few
//            seconds; drones drop from its belly. Lose the pods (or half the core) and it rages: fans of
//            bolts as the shutters open. Pod 1000, core 10000. Any red shot can be shot down.
// HUMANS wander the floor: touch one to save it, 1000 x the chain (the rescues this wave since your last
// death, capped at 5). An extra man at `extraAt` points and every `extraEvery` after.
//
// MERCY: the knobs thin the bursts and ease the pace per loss, add men and soften the core. On the
// unlosable credit (credit.unlosable) the man wears a SHIELD: contact destroys what can die, bounces
// crushers and the mainframe away and fizzles shots; no man is ever lost.
import { f32, roundEven, SystemRandom, InputFrame, Pad, CabinetState, RoundResult, SoundCue, CueBuffer } from '../../sdk/index.js';
import { WAVES } from './waves.js';

// 8 screen directions, clockwise from Up, dy in screen space (y down)
const DX8 = [0, 1, 1, 1, 0, -1, -1, -1];
const DY8 = [-1, -1, 0, 1, 1, 1, 0, -1];
const DIAG = f32(0.70710678);

export const Dir8 = {
    DX: DX8, DY: DY8,
    ux(d) { d &= 7; return (d & 1) === 1 ? f32(DX8[d] * DIAG) : DX8[d]; },
    uy(d) { d &= 7; return (d & 1) === 1 ? f32(DY8[d] * DIAG) : DY8[d]; },
    fromVector(x, y) {
        if (x === 0 && y === 0) return -1;
        const idx = roundEven(Math.atan2(y, x) / (Math.PI / 4.0));
        return (((2 + idx) % 8) + 8) % 8;
    },
    fromStick(sx, sy) {
        for (let d = 0; d < 8; d++) if (DX8[d] === sx && DY8[d] === sy) return d;
        return -1;
    },
    stick(d) {
        const f = new InputFrame();
        if (d >= 0) { f.x = DX8[d & 7]; f.y = -DY8[d & 7]; }
        return f;
    },
};

export const MachineKind = Object.freeze({ Drone: 0, Crusher: 1, Cortex: 2, Pylon: 3, Husk: 4, Hatcher: 5, Roller: 6, Mite: 7 });
export const ShotKind = Object.freeze({ Spark: 0, Shell: 1, Bolt: 2 });
export const FxKind = Object.freeze({ Debris: 0, ManDown: 1, Beam: 2, Popup: 3, Fizzle: 4, Clank: 5, Skull: 6, Zap: 7, Ring: 8, Words: 9 });
export const Shutter = Object.freeze({ Closed: 0, Opening: 1, Open: 2, Closing: 3 });
const Phase = Object.freeze({ Idle: 0, Card: 1, SpawnIn: 2, Play: 3, Down: 4, Tally: 5, Result: 6, Over: 7 });

const KIND_NAMES = ['drone', 'crusher', 'cortex', 'pylon', 'husk', 'hatcher', 'roller', 'mite'];
const RADIUS = [6, 8, 6.5, 4, 5, 7, 6, 3.5];
const POINTS = [100, 0, 500, 25, 300, 1000, 200, 50];

export class Machine {
    constructor() {
        this.kind = MachineKind.Drone;
        this.x = 0; this.y = 0; this.hx = 0; this.hy = 0;
        this.warp = 0; this.warpTotal = 0;
        this.think = 0; this.fire = 0; this.stun = 0; this.anim = 0;
        this.hp = 1; this.hit = 0; this.turning = 0; this.hatches = 0; this.look = 0;
        this.prey = null;                 // a cortex's human
        this.burst = 0; this.dead = false;
    }
    get live() { return !this.dead && this.warp <= 0; }
    get killable() { return this.kind !== MachineKind.Crusher; }
    get required() { return this.kind !== MachineKind.Crusher && this.kind !== MachineKind.Pylon; }
    get radius() { return RADIUS[this.kind]; }
    get warpProgress() { return this.warpTotal > 0 ? 1 - Math.max(0, this.warp) / this.warpTotal : 1; }
}

export class Human {
    constructor() {
        this.x = 0; this.y = 0; this.hx = 0; this.hy = 0; this.think = 0; this.anim = 0; this.look = 0;
        this.saved = false; this.gone = false;
        this.conv = 0; this.by = null;    // being turned: seconds left, and by which cortex
    }
    get free() { return !this.saved && !this.gone; }
}

export class Bullet { constructor() { this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.dir = 0; this.dead = false; } }
export class Shot { constructor(kind) { this.kind = kind; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.life = 0; this.anim = 0; this.bounces = 0; this.dead = false; } }
export class Fx {
    constructor(kind, x, y, life, value, seed, of) {
        this.kind = kind; this.x = x; this.y = y; this.t = 0; this.life = life;
        this.value = value || 0; this.seed = seed || 0; this.of = of !== undefined ? of : MachineKind.Drone;
    }
}

// THE MAINFRAME: a long box across the top of the floor, four gun pods under it, the core in the middle
export class Mainframe {
    constructor() {
        this.x = AW / 2; this.y = BOSS_Y; this.tx = AW / 2; this.moveT = 0;
        this.pods = [];
        for (const dx of POD_DX) this.pods.push({ dx, hp: 0, cd: 0, hit: 0, dead: false });
        this.coreHp = 0; this.coreMax = 1; this.coreHit = 0; this.hit = 0;
        this.shutter = Shutter.Closed; this.shutterT = 0;
        this.dropT = 0; this.rage = false;
        this.dying = false; this.dieT = 0; this.boomT = 0; this.gone = false;
    }
    get alive() { return !this.dying && !this.gone; }
    get podsLeft() { let n = 0; for (const p of this.pods) if (!p.dead) n++; return n; }
    podX(p) { return this.x + p.dx; }
    get podY() { return this.y + POD_DY; }
    get coreY() { return this.y + CORE_DY; }
}

const AW = 296, AH = 192;   // the arena floor in px
const TILE = 16;
const MAX_BULLETS = 8, MAX_SPARKS = 6, MAX_SHELLS = 8, MAX_BOLTS = 14;
const PLAYER_R = 4, SHOT_R = 2.5, RESCUE_R = 10, BULLET_R = 1.5;
const PTS_RESCUE = 1000, PTS_POD = 1000, PTS_CORE = 10000, PTS_BOSS_BONUS = 20000;
const BOSS_Y = 24, BOSS_HW = 50, BOSS_HH = 16;              // the mainframe's box: centre y, half width, half height
const POD_DX = [-42, -22, 22, 42], POD_DY = 22, POD_R = 6;
const CORE_DY = 14, CORE_R = 8;
const BOSS_FLOOR = BOSS_Y + POD_DY + POD_R + 2;              // nothing of the boss below this

function clampf(v, a, b) { return v < a ? a : v > b ? b : v; }

export class LastHumanRound {
    static get AW() { return AW; }
    static get AH() { return AH; }
    static get Tile() { return TILE; }
    static get Phase() { return Phase; }
    static get Waves() { return WAVES.length; }
    static get BossFloor() { return BOSS_FLOOR; }
    static get BossHW() { return BOSS_HW; }
    static get BossHH() { return BOSS_HH; }
    static get PodR() { return POD_R; }
    static get CoreR() { return CORE_R; }

    constructor() {
        // the machine's timing (not mercy knobs)
        this.cardSeconds = f32(2.8);
        this.introHold = f32(0.3);
        this.minIntro = f32(1.0);
        this.downSeconds = f32(2.4);
        this.resultSeconds = f32(3.5);
        this.tallyRowGap = f32(0.55);
        this.tallyHold = f32(1.3);
        this.bulletSpeed = f32(300);
        this.humanSpeed = f32(11);
        this.cortexHold = f32(80);
        this.sparkLife = f32(5);
        this.shellLife = f32(7);
        this.burstClearGap = f32(3);
        this.stagger = f32(0.06); this.warpTime = f32(0.9);
        this.chainCap = 5;
        this.droneSpace = f32(13);
        this.droneShove = f32(0.5);

        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.playerX = 0; this.playerY = 0;
        this.face = 0; this.moving = false; this.locked = false; this.walkAnim = 0;
        this.men = 0; this.chain = 0; this.saved = 0; this.kills = 0; this.lostHumans = 0; this.deaths = 0;
        this.wave = 0; this.wavesCleared = 0;
        this.waveSaved = 0; this.waveLost = 0; this.waveDeaths = 0; this.waveHumans = 0;
        this.burstsStarted = 0;
        this.bannerTime = 99; this.extraTime = 99;
        this.regroup = false;
        this.playClock = 0;
        this.shake = 0; this.railFlash = 0;
        this.credit = null;
        this.tally = []; this.tallyShown = 0;

        this.machines = []; this.humans = []; this.bullets = []; this.shots = []; this.fx = [];
        this.bursts = [];
        this.pending = [];
        this.boss = null;
        this._cues = new CueBuffer();
        this.recordEvents = false; this.events = [];
        this._log = '';

        this.rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._time = 0;
        this.logEvents = 0; this.sparksFired = 0; this.shellsFired = 0; this.boltsFired = 0; this.crusherHits = 0; this.shots_ = 0;
        this.fried = 0; this.turned = 0; this.crushed = 0; this.extras = 0;
        this.killedBy = new Array(12).fill(0);
        this.deathsIn = new Array(WAVES.length).fill(0);
        this.fireCd = 0; this.burstClock = 0; this.slow = 1; this.invuln = 0;
        this.lastBurstRequired = 0;
        this.nextExtra = 0; this.extraEvery = 0;

        this.waveScale = 1; this.pace = 1; this.droneSpeed = 0; this.droneRamp = 0; this.droneMaxRamp = 0;
        this.crusherSpeed = 0; this.crusherPush = 0; this.cortexSpeed = 0; this.sparkGap = 0; this.sparkSpeed = 0; this.sparkTurn = 0;
        this.huskSpeed = 0; this.convertTime = 0; this.hatchGap = 0; this.rollerSpeed = 0; this.shellGap = 0; this.shellSpeed = 0;
        this.miteSpeed = 0; this.podHp = 0; this.coreHp = 0; this.boltSpeed = 0;
        this.playerSpeed = 0; this.fireGap = 0; this.phaseMinGap = 0; this.phaseMaxGap = 0;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Card: case Phase.SpawnIn: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Down: case Phase.Tally: return CabinetState.Interlude;
            case Phase.Result: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this.men; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get waveDef() { return WAVES[Math.max(0, Math.min(WAVES.length - 1, this.wave))]; }
    get waveNo() { return this.wave + 1; }
    get droneSpeedNow() {
        return f32(this.droneSpeed * this.waveDef.pace * this.pace * Math.min(this.droneMaxRamp, f32(1 + f32(this.droneRamp * this.playClock))));
    }
    get roundWon() { return this._result === RoundResult.Won; }
    get burstCount() { return this.bursts.length; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this._score + ' ' + this._time.toFixed(1) + 's wave ' + this.waveNo + '/' + WAVES.length + ' men ' + this.men +
            ' kills ' + this.kills + ' saved ' + this.saved + ' lost ' + this.lostHumans + ' deaths ' + this.deaths + ' | ' + this._log.trimEnd();
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.waveScale = k.get('waveScale');
        this.pace = k.get('pace');
        this.slow = Math.max(f32(0.25), k.get('spawnSlow'));
        this.droneSpeed = k.get('droneSpeed');
        this.droneRamp = k.get('droneRamp');
        this.droneMaxRamp = k.get('droneMaxRamp');
        this.crusherSpeed = k.get('crusherSpeed');
        this.crusherPush = k.get('crusherPush');
        this.cortexSpeed = k.get('cortexSpeed');
        this.sparkGap = k.get('sparkGap');
        this.sparkSpeed = k.get('sparkSpeed');
        this.sparkTurn = k.get('sparkTurn');
        this.huskSpeed = k.get('huskSpeed');
        this.convertTime = k.get('convertTime');
        this.hatchGap = k.get('hatchGap');
        this.rollerSpeed = k.get('rollerSpeed');
        this.shellGap = k.get('shellGap');
        this.shellSpeed = k.get('shellSpeed');
        this.miteSpeed = k.get('miteSpeed');
        this.podHp = Math.max(1, Math.trunc(k.get('podHp')));
        this.coreHp = Math.max(4, Math.trunc(roundEven(k.get('coreHp'))));
        this.boltSpeed = k.get('boltSpeed');
        this.playerSpeed = k.get('playerSpeed');
        this.fireGap = k.get('fireGap');
        this.phaseMinGap = k.get('phaseMinGap');
        this.phaseMaxGap = k.get('phaseMaxGap');
        this.nextExtra = Math.trunc(k.get('extraAt'));
        this.extraEvery = Math.max(1000, Math.trunc(k.get('extraEvery')));

        this.machines.length = 0; this.humans.length = 0; this.bullets.length = 0; this.shots.length = 0;
        this.fx.length = 0; this.pending.length = 0; this.bursts.length = 0; this.boss = null;
        this._score = 0; this._time = 0; this.fireCd = 0; this.burstClock = 0; this.playClock = 0;
        this.men = Math.max(1, Math.trunc(k.get('men') + 0.001));
        this.chain = 0; this.saved = 0; this.kills = 0; this.lostHumans = 0; this.deaths = 0; this.wavesCleared = 0;
        this.burstsStarted = 0; this.bannerTime = 99; this.extraTime = 99; this.shake = 0; this.railFlash = 0;
        this.logEvents = 0; this.sparksFired = 0; this.shellsFired = 0; this.boltsFired = 0; this.crusherHits = 0; this.shots_ = 0;
        this.fried = 0; this.turned = 0; this.crushed = 0; this.extras = 0;
        this.killedBy.fill(0); this.deathsIn.fill(0);
        this._result = RoundResult.None; this.regroup = false;
        this._log = '';
        this.events.length = 0;
        this._cues.resetTotals();

        // the attract demo shows off a later wave (a demo never counts for anything)
        let first = 0;
        if (this.isDemo) first = 2 + ((seed >>> 0) % (WAVES.length - 2));
        this.startWave(first);
    }

    shuffle(l) {
        for (let i = l.length - 1; i > 0; i--) { const j = this.rng.next(i + 1); const t = l[i]; l[i] = l[j]; l[j] = t; }
    }

    range(a, b) { a = f32(a); b = f32(b); return f32(a + f32(f32(b - a) * f32(this.rng.nextDouble()))); }

    // a random spot at least minDist from the player (relaxes if the floor is crowded); never under the mainframe
    placeAway(minDist, pad) {
        const top = this.boss != null ? BOSS_FLOOR + 8 : pad;
        let x = AW / 2, y = AH / 2;
        for (let tries = 0; tries < 60; tries++) {
            x = this.range(pad, AW - pad); y = this.range(top, AH - pad);
            const dx = x - this.playerX, dy = y - this.playerY;
            const need = tries < 40 ? minDist : minDist * 0.6;
            if (dx * dx + dy * dy >= need * need) return { x, y };
        }
        return { x, y };
    }

    // ------------------------------------------------------------------ the waves
    startWave(w) {
        this.wave = w;
        const def = WAVES[w];
        this.machines.length = 0; this.humans.length = 0; this.bullets.length = 0; this.shots.length = 0; this.pending.length = 0;
        this.bursts.length = 0;
        this.playerX = AW / 2; this.playerY = def.boss ? AH - 56 : AH / 2; this.face = 0; this.moving = false; this.locked = false;
        this.waveSaved = 0; this.waveLost = 0; this.waveDeaths = 0; this.chain = 0; this.playClock = 0;
        this.burstsStarted = 0; this.burstClock = 0; this.bannerTime = 99; this.regroup = false;
        this.tally = []; this.tallyShown = 0;

        // the bursts: each kind's count x waveScale (at least one of each kind the wave names)
        for (const b of def.bursts) {
            const list = [];
            for (const kind of KIND_NAMES) {
                const n0 = b[kind] || 0;
                if (n0 <= 0) continue;
                const n = Math.max(1, Math.trunc(roundEven(f32(n0 * this.waveScale))));
                for (let i = 0; i < n; i++) list.push(KIND_NAMES.indexOf(kind));
            }
            this.shuffle(list);
            this.bursts.push(list);
        }

        // the mainframe, if this is its wave
        this.boss = null;
        if (def.boss) {
            const b = new Mainframe();
            for (const p of b.pods) { p.hp = this.podHp; p.cd = this.range(1.5, 3.5); }
            b.coreHp = this.coreHp; b.coreMax = this.coreHp;
            b.shutterT = f32(3.0); b.dropT = f32(4.0); b.moveT = 1;
            this.boss = b;
        }

        // the humans, then the pylons, laid out before the warp
        this.waveHumans = def.humans;
        for (let i = 0; i < def.humans; i++) {
            const c = new Human();
            c.look = this.rng.next(2); c.think = this.range(0.3, 1.5); c.anim = this.range(0, 1);
            const pos = this.placeAway(44, 10);
            c.x = pos.x; c.y = pos.y;
            this.humans.push(c);
        }
        const nPylons = def.pylons > 0 ? Math.max(2, Math.trunc(roundEven(f32(def.pylons * f32(0.5 + 0.5 * this.waveScale))))) : 0;
        for (let i = 0; i < nPylons; i++) {
            let pos = null;
            for (let tries = 0; tries < 40 && pos == null; tries++) {
                const q = this.placeAway(48, 14);
                let ok = true;
                for (const m of this.machines) { const dx = m.x - q.x, dy = m.y - q.y; if (dx * dx + dy * dy < 30 * 30) { ok = false; break; } }
                for (const c of this.humans) { const dx = c.x - q.x, dy = c.y - q.y; if (dx * dx + dy * dy < 16 * 16) { ok = false; break; } }
                if (ok || tries === 39) pos = q;
            }
            const m = new Machine();
            m.kind = MachineKind.Pylon; m.look = def.pylonLook; m.anim = this.range(0, 1);
            m.x = pos.x; m.y = pos.y;
            this.machines.push(m);
        }

        this.p = Phase.Card; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
        this._emit('card', { wave: this.waveNo, boss: !!def.boss });
        if (def.boss) this._emit('bossWarn');
    }

    dispatchBurst(b, delay) {
        let n = 0, mites = 0;
        this.lastBurstRequired = 0;
        for (const kind of this.bursts[b]) {
            if (kind === MachineKind.Mite) { mites++; continue; }
            this.pending.push({ kind, burst: b, delay: f32(delay + n * this.stagger * this.slow), x: -1, y: -1, stream: false, lead: false });
            if (kind !== MachineKind.Crusher) this.lastBurstRequired++;
            n++;
        }
        // mites come in streams of eight from one point on an edge (the edge glows first: the renderer reads pending)
        let t = f32(delay + 1.2 * this.slow);
        for (let g = 0; mites > 0; g++) {
            const e = this.edgePoint();
            const nG = Math.min(8, mites);
            for (let i = 0; i < nG; i++) {
                const j = this.range(-6, 6);
                this.pending.push({ kind: MachineKind.Mite, burst: b, delay: f32(t + i * 0.14), x: f32(e.x + e.px * j), y: f32(e.y + e.py * j), stream: true, lead: i === 0, edge: e.side });
            }
            this.lastBurstRequired += nG;
            mites -= nG;
            t = f32(t + this.range(2.2, 3.2) * this.slow);
        }
        this.burstsStarted = b + 1;
        this.burstClock = 0;
        if (b > 0) this.bannerTime = 0;
        this._emit('warp', { n: b + 1 });
        this.logEvent('P', b + 1);
    }

    // a point just inside one edge, far from the man (the best of five tries); px,py run along the edge
    edgePoint() {
        let best = null, bd = -1;
        for (let k = 0; k < 5; k++) {
            const side = this.rng.next(4);
            let x, y;
            const top = this.boss != null ? BOSS_FLOOR + 6 : 6;
            if (side === 0) { x = this.range(20, AW - 20); y = top; }
            else if (side === 1) { x = AW - 5; y = this.range(top + 10, AH - 20); }
            else if (side === 2) { x = this.range(20, AW - 20); y = AH - 5; }
            else { x = 5; y = this.range(top + 10, AH - 20); }
            const dx = x - this.playerX, dy = y - this.playerY, d = dx * dx + dy * dy;
            if (d > bd) { bd = d; best = { x, y, side, px: side === 0 || side === 2 ? 1 : 0, py: side === 1 || side === 3 ? 1 : 0 }; }
        }
        return best;
    }

    materialise(p) {
        const m = new Machine();
        m.kind = p.kind; m.burst = p.burst;
        m.warpTotal = p.kind === MachineKind.Mite ? f32(0.35) : p.x >= 0 ? f32(0.5) : f32(this.warpTime * this.slow);
        m.think = this.range(0, 0.3); m.anim = this.range(0, 1); m.look = this.rng.next(64);
        m.warp = m.warpTotal;
        m.hp = p.kind === MachineKind.Hatcher ? 3 : 1;
        if (p.kind === MachineKind.Cortex) m.fire = f32(this.sparkGap * this.range(0.5, 1.0));
        else if (p.kind === MachineKind.Roller) m.fire = f32(this.shellGap * this.range(0.6, 1.0));
        else if (p.kind === MachineKind.Hatcher) m.fire = f32(this.hatchGap * this.range(0.5, 0.8));
        if (p.x >= 0) { m.x = p.x; m.y = p.y; }
        else {
            const pos = this.placeAway(this.wave === 0 ? 110 : p.kind === MachineKind.Crusher ? 80 : 70, 12);
            m.x = pos.x; m.y = pos.y;
        }
        if (p.kind === MachineKind.Mite) {
            const a = Math.atan2(this.playerY - m.y, this.playerX - m.x);
            m.hx = f32(Math.cos(a)); m.hy = f32(Math.sin(a));
            if (p.lead) this._emit('swarm');
        }
        this.machines.push(m);
    }

    logEvent(c, v) {
        if (this.logEvents >= 40) return;
        this.logEvents++;
        this._log += c + (v !== undefined ? String(v) : '') + '@' + this._time.toFixed(1) + ' ';
    }

    addScore(pts) {
        if (pts <= 0) return;
        this._score += pts;
        while (this._score >= this.nextExtra) {
            this.nextExtra += this.extraEvery;
            this.men++; this.extras++;
            this.extraTime = 0;
            this._cues.emit(SoundCue.Bonus);
            this._emit('extra');
        }
    }

    // ------------------------------------------------------------------ stepping
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > 0.1) dt = 0.1;
        if (dt <= 0) return;
        const n = Math.max(1, Math.ceil(dt * 60 - 1e-3));
        const h = dt / n;
        for (let i = 0; i < n && this.p !== Phase.Over; i++) this.tick(h, input);
    }

    tick(h, input) {
        this._time = f32(this._time + h);
        this.phaseTime = f32(this.phaseTime + h);
        this.bannerTime = f32(this.bannerTime + h);
        this.extraTime = f32(this.extraTime + h);
        this.shake = Math.max(0, f32(this.shake - h * 7));
        this.railFlash = Math.max(0, f32(this.railFlash - h));
        this.updateFx(h);
        for (const m of this.machines) if (m.kind === MachineKind.Pylon) m.anim = f32(m.anim + h);

        switch (this.p) {
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) {
                    this.p = Phase.SpawnIn; this.phaseTime = 0;
                    this.dispatchBurst(0, this.introHold);
                }
                break;
            case Phase.SpawnIn:
                this.updatePending(h, true);
                this.updateWarps(h);
                if (this.phaseTime >= this.minIntro && !this.anyPending(false) && !this.anyWarping()) {
                    this.p = Phase.Play; this.phaseTime = 0;
                    this.invuln = this.wave === 0 ? 3 : 0;   // a short grace blink after warp-in and after every respawn
                    this._cues.emit(SoundCue.Start);
                    this._emit('go');
                }
                break;
            case Phase.Play:
                this.playTick(h, input);
                break;
            case Phase.Down:
                this.updateWarps(h);          // a half-warped machine finishes forming while the man is down
                if (this.phaseTime >= this.downSeconds) {
                    if (this.men <= 0) this.toResult(RoundResult.Lost);
                    else this.regroupWave();
                }
                break;
            case Phase.Tally:
                this.tallyTick();
                break;
            case Phase.Result:
                if (this.phaseTime >= this.resultSeconds) this.p = Phase.Over;
                break;
        }
    }

    anyWarping() { for (const m of this.machines) if (!m.dead && m.warp > 0) return true; return false; }
    anyPending(streams) { for (const p of this.pending) if (streams || !p.stream) return true; return false; }

    // during GET READY only the burst itself forms; the streams wait for play
    updatePending(h, readyOnly = false) {
        for (let i = 0; i < this.pending.length; i++) {
            const p = this.pending[i];
            if (readyOnly && p.stream) continue;
            p.delay = f32(p.delay - h);
            if (p.delay <= 0) { this.materialise(p); this.pending.splice(i, 1); i--; }
        }
    }

    updateWarps(h) { for (const m of this.machines) if (!m.dead && m.warp > 0) m.warp = f32(m.warp - h); }

    updateFx(h) {
        for (let i = 0; i < this.fx.length; i++) {
            this.fx[i].t = f32(this.fx[i].t + h);
            if (this.fx[i].t >= this.fx[i].life) { this.fx.splice(i, 1); i--; }
        }
    }

    addFx(kind, x, y, life, value = 0, of = MachineKind.Drone) {
        if (this.fx.length > 64) this.fx.shift();
        this.fx.push(new Fx(kind, x, y, life, value, this.rng.next(1 << 16), of));
    }

    requiredLeft() {
        let left = 0;
        for (const m of this.machines) if (!m.dead && m.required) left++;
        for (const p of this.pending) if (p.kind !== MachineKind.Crusher) left++;
        return left;
    }

    playTick(h, input) {
        this.playClock = f32(this.playClock + h);
        if (this.invuln > 0) this.invuln = Math.max(0, f32(this.invuln - h));
        this.burstClock = f32(this.burstClock + h);
        const boss = this.boss;

        // ---- the burst dispatcher
        if (this.burstsStarted < this.bursts.length) {
            const left = this.requiredLeft();
            const trigger = Math.max(1, Math.trunc(this.lastBurstRequired * 0.25));
            if ((left === 0 && this.burstClock >= this.burstClearGap * this.slow) ||
                (left <= trigger && this.burstClock >= this.phaseMinGap * this.slow) ||
                this.burstClock >= this.phaseMaxGap * this.slow)
                this.dispatchBurst(this.burstsStarted, 0);
        }
        this.updatePending(h);
        this.updateWarps(h);

        // ---- the player: the stick moves (and aims, unless B holds the aim); A held fires the way he faces
        let sx = 0, sy = 0;
        if (input != null) {
            const f = input.current;
            sx = f.x > InputFrame.Threshold ? 1 : f.x < -InputFrame.Threshold ? -1 : 0;
            sy = f.y > InputFrame.Threshold ? -1 : f.y < -InputFrame.Threshold ? 1 : 0;
        }
        const d = Dir8.fromStick(sx, sy);
        this.locked = input != null && input.held(Pad.B);
        this.moving = d >= 0;
        if (this.moving) {
            if (!this.locked) this.face = d;
            const top = boss != null && !boss.gone ? BOSS_FLOOR - 2 : 7;
            this.playerX = clampf(f32(this.playerX + f32(Dir8.ux(d) * this.playerSpeed * h)), 5, AW - 5);
            this.playerY = clampf(f32(this.playerY + f32(Dir8.uy(d) * this.playerSpeed * h)), top, AH - 7);
            this.walkAnim = f32(this.walkAnim + h);
        }
        this.fireCd = f32(this.fireCd - h);
        if (input != null && input.held(Pad.A) && this.fireCd <= 0) {
            let live = 0;
            for (const b of this.bullets) if (!b.dead) live++;
            if (live < MAX_BULLETS) {
                const ux = Dir8.ux(this.face), uy = Dir8.uy(this.face);
                const bl = new Bullet();
                bl.x = f32(this.playerX + ux * 5); bl.y = f32(this.playerY + uy * 5);
                bl.vx = f32(ux * this.bulletSpeed); bl.vy = f32(uy * this.bulletSpeed);
                bl.dir = this.face;
                this.bullets.push(bl);
                this.fireCd = this.fireGap;
                this.shots_++;
                this._cues.emit(SoundCue.Tick);
                this._emit('fire');
            }
        }

        // ---- machines
        this.updateMachines(h);

        // ---- the mainframe
        if (boss != null && !boss.gone) this.updateBoss(boss, h);

        // ---- shots: sparks home, shells bounce, bolts fly straight
        for (const s of this.shots) {
            if (s.dead) continue;
            s.anim = f32(s.anim + h);
            s.life = f32(s.life - h);
            if (s.kind === ShotKind.Spark) {
                const dx = this.playerX - s.x, dy = this.playerY - s.y;
                const cur0 = Math.atan2(s.vy, s.vx), want = Math.atan2(dy, dx);
                let diff = want - cur0;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const turn = f32(this.sparkTurn * h);
                const cur = cur0 + (diff > turn ? turn : diff < -turn ? -turn : diff);
                s.vx = f32(Math.cos(cur) * this.sparkSpeed); s.vy = f32(Math.sin(cur) * this.sparkSpeed);
            }
            s.x = f32(s.x + s.vx * h); s.y = f32(s.y + s.vy * h);
            if (s.kind === ShotKind.Shell) {
                let bounced = false;
                if (s.x < 3) { s.x = 3; s.vx = -s.vx; bounced = true; } else if (s.x > AW - 3) { s.x = AW - 3; s.vx = -s.vx; bounced = true; }
                if (s.y < 3) { s.y = 3; s.vy = -s.vy; bounced = true; } else if (s.y > AH - 3) { s.y = AH - 3; s.vy = -s.vy; bounced = true; }
                if (bounced) {
                    s.bounces--;
                    if (s.bounces < 0) { s.dead = true; this.addFx(FxKind.Fizzle, s.x, s.y, 0.3); continue; }
                    this.addFx(FxKind.Clank, s.x, s.y, 0.12);
                    this._emit('ricochet');
                }
            }
            if (s.life <= 0 || s.x < 0 || s.y < 0 || s.x > AW || s.y > AH) { s.dead = true; this.addFx(FxKind.Fizzle, s.x, s.y, 0.3); }
        }

        // ---- bullets
        for (const b of this.bullets) {
            if (b.dead) continue;
            b.x = f32(b.x + b.vx * h); b.y = f32(b.y + b.vy * h);
            if (b.x < -2 || b.y < -2 || b.x > AW + 2 || b.y > AH + 2) { b.dead = true; continue; }
            for (const m of this.machines) {
                if (!m.live) continue;
                const dx = m.x - b.x, dy = m.y - b.y, r = m.radius + BULLET_R;
                if (dx * dx + dy * dy > r * r) continue;
                b.dead = true;
                if (m.kind === MachineKind.Crusher) {
                    const ux = Dir8.ux(b.dir), uy = Dir8.uy(b.dir);
                    this.move(m, f32(ux * this.crusherPush), f32(uy * this.crusherPush));
                    m.stun = f32(0.2); m.hit = f32(0.06);
                    this.crusherHits++;
                    this.addFx(FxKind.Clank, b.x, b.y, 0.12);
                    this._cues.emit(SoundCue.Miss);
                    this._emit('clank');
                } else if (m.hp > 1) {
                    m.hp--; m.hit = f32(0.1);
                    this.addFx(FxKind.Clank, b.x, b.y, 0.12);
                    this._emit('dent');
                } else this.destroy(m, true);
                break;
            }
            if (b.dead) continue;
            if (boss != null && boss.alive && this.bulletBoss(boss, b)) continue;
            for (const s of this.shots) {
                if (s.dead) continue;
                const dx = s.x - b.x, dy = s.y - b.y, r = SHOT_R + BULLET_R + 1;
                if (dx * dx + dy * dy > r * r) continue;
                s.dead = true; b.dead = true;
                this.addFx(FxKind.Fizzle, s.x, s.y, 0.3);
                this._cues.emit(SoundCue.Miss);
                this._emit('fizzle');
                break;
            }
        }
        this.bullets = this.bullets.filter(x => !x.dead);
        this.shots = this.shots.filter(x => !x.dead);

        // ---- humans: wander; touch one to save it; crushers step on them; cortexes turn them
        this.updateHumans(h);

        // ---- pylons fry the drones that walk into them
        for (const p of this.machines) {
            if (p.dead || p.kind !== MachineKind.Pylon) continue;
            for (const m of this.machines) {
                if (!m.live || m.kind !== MachineKind.Drone) continue;
                const dx = m.x - p.x, dy = m.y - p.y, r = m.radius + p.radius;
                if (dx * dx + dy * dy > r * r) continue;
                p.dead = true; m.dead = true;
                this.kills++; this.fried++;
                this.addFx(FxKind.Zap, p.x, p.y, 0.4);
                this.addFx(FxKind.Debris, m.x, m.y, 0.5, 0, m.kind);
                this._emit('pylonZap');
                break;
            }
        }

        // ---- contact (the man is safe while the mainframe blows apart)
        if (!(boss != null && (boss.dying || boss.gone)) && !(this.invuln > 0)) {
            for (const m of this.machines) {
                if (!m.live) continue;
                const dx = m.x - this.playerX, dy = m.y - this.playerY, r = m.radius + PLAYER_R;
                if (dx * dx + dy * dy > r * r) continue;
                if (this.mercyActive) {
                    if (m.kind === MachineKind.Crusher) {
                        const dd = Math.sqrt(dx * dx + dy * dy) + 1e-3;
                        this.move(m, f32(dx / dd * (r - dd + 2)), f32(dy / dd * (r - dd + 2)));
                        m.stun = f32(0.4);
                    } else this.destroy(m, true);
                    this._emit('shield');
                    continue;
                }
                this.loseMan(m.kind);
                return;
            }
            for (const s of this.shots) {
                if (s.dead) continue;
                const dx = s.x - this.playerX, dy = s.y - this.playerY, r = SHOT_R + PLAYER_R;
                if (dx * dx + dy * dy > r * r) continue;
                if (this.mercyActive) { s.dead = true; this.addFx(FxKind.Fizzle, s.x, s.y, 0.3); this._emit('shield'); continue; }
                this.loseMan(8 + s.kind);
                return;
            }
            if (boss != null && boss.alive && this.touchesBoss(boss)) {
                if (this.mercyActive) { this.playerY = f32(BOSS_FLOOR + 6); this._emit('shield'); }
                else { this.loseMan(11); return; }
            }
        }
        this.shots = this.shots.filter(x => !x.dead);
        this.machines = this.machines.filter(x => !x.dead);

        // ---- the wave is cleared when nothing that can die is left (or the mainframe is gone)
        if (boss != null) { if (boss.gone) this.waveClear(); }
        else if (this.burstsStarted >= this.bursts.length && this.pending.length === 0) {
            let any = false;
            for (const m of this.machines) if (!m.dead && m.required) { any = true; break; }
            if (!any) this.waveClear();
        }
    }

    updateMachines(h) {
        let onlyCortexes = true;
        for (const m of this.machines) if (!m.dead && m.required && m.kind !== MachineKind.Cortex) { onlyCortexes = false; break; }
        if (this.pending.length > 0 || this.burstsStarted < this.bursts.length) onlyCortexes = false;
        const ds = this.droneSpeedNow, pace = this.pace;
        for (const m of this.machines) {
            if (!m.live) continue;
            m.anim = f32(m.anim + h);
            if (m.hit > 0) m.hit = f32(m.hit - h);
            const dx = this.playerX - m.x, dy = this.playerY - m.y;
            const dist = f32(Math.sqrt(dx * dx + dy * dy) + 1e-4);
            switch (m.kind) {
                case MachineKind.Drone: {
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(0.3, 0.6);
                        const a = Math.atan2(dy, dx) + this.range(-0.35, 0.35);
                        m.hx = f32(Math.cos(a)); m.hy = f32(Math.sin(a));
                    }
                    this.move(m, f32(m.hx * ds * h), f32(m.hy * ds * h));
                    break;
                }
                case MachineKind.Crusher: {
                    if (m.stun > 0) { m.stun = f32(m.stun - h); break; }
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(1.0, 2.2);
                        const roll = this.rng.nextDouble();
                        let cd;
                        if (roll < 0.45) cd = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 6) : (dy > 0 ? 4 : 0);
                        else if (roll < 0.75) {
                            const c = this.nearestHuman(m.x, m.y);
                            if (c != null) { const ex = c.x - m.x, ey = c.y - m.y; cd = Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? 2 : 6) : (ey > 0 ? 4 : 0); }
                            else cd = this.rng.next(4) * 2;
                        } else cd = this.rng.next(4) * 2;
                        m.hx = Dir8.ux(cd); m.hy = Dir8.uy(cd);
                    }
                    const sp = f32(this.crusherSpeed * pace);
                    if (!this.move(m, f32(m.hx * sp * h), f32(m.hy * sp * h))) { m.hx = -m.hx; m.hy = -m.hy; }
                    break;
                }
                case MachineKind.Cortex: {
                    if (m.prey != null && !m.prey.free) { m.prey = null; m.turning = 0; }
                    if (m.turning > 0) break;                       // busy: the human is changing
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(0.4, 0.8);
                        m.prey = this.nearestHuman(m.x, m.y, true);
                        let a;
                        if (m.prey != null) a = Math.atan2(m.prey.y - m.y, m.prey.x - m.x) + this.range(-0.3, 0.3);
                        else {
                            const hold = onlyCortexes ? f32(34) : this.cortexHold;
                            a = dist > hold ? Math.atan2(dy, dx) + this.range(-0.5, 0.5) : this.rng.nextDouble() * Math.PI * 2;
                        }
                        m.hx = f32(Math.cos(a)); m.hy = f32(Math.sin(a));
                    }
                    const sp = f32(this.cortexSpeed * pace);
                    this.move(m, f32(m.hx * sp * h), f32(m.hy * sp * h));
                    if (m.prey != null) {
                        const ex = m.prey.x - m.x, ey = m.prey.y - m.y;
                        if (ex * ex + ey * ey < 9 * 9 && m.prey.conv <= 0) {
                            m.prey.conv = this.convertTime; m.prey.by = m; m.turning = 1;
                            this._emit('convert');
                            break;
                        }
                    }
                    m.fire = f32(m.fire - h);
                    if (m.fire <= 0) {
                        m.fire = f32(this.sparkGap * this.range(0.7, 1.3));
                        if (dist < 180 && this.countShots(ShotKind.Spark) < MAX_SPARKS) {
                            this.fireShot(ShotKind.Spark, m.x, m.y, Math.atan2(dy, dx), this.sparkSpeed, this.sparkLife);
                            this.sparksFired++;
                            this._emit('spark');
                        }
                    }
                    break;
                }
                case MachineKind.Husk: {
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(0.25, 0.5);
                        const a = Math.atan2(dy, dx) + this.range(-0.25, 0.25);
                        m.hx = f32(Math.cos(a)); m.hy = f32(Math.sin(a));
                    }
                    const sp = f32(this.huskSpeed * pace);
                    this.move(m, f32(m.hx * sp * h), f32(m.hy * sp * h));
                    break;
                }
                case MachineKind.Hatcher: {
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(2, 4);
                        const cd = this.rng.next(8);
                        m.hx = Dir8.ux(cd); m.hy = Dir8.uy(cd);
                    }
                    const sp = f32(20 * pace);
                    if (!this.move(m, f32(m.hx * sp * h), f32(m.hy * sp * h))) { m.hx = -m.hx; m.hy = -m.hy; }
                    if (m.hatches < 3) {
                        m.fire = f32(m.fire - h);
                        if (m.fire <= 0) {
                            m.fire = f32(this.hatchGap * this.range(0.85, 1.15) * this.slow);
                            m.hatches++;
                            this.pending.push({ kind: MachineKind.Roller, burst: m.burst, delay: 0, x: m.x, y: m.y, stream: false, lead: false });
                            this.addFx(FxKind.Ring, m.x, m.y, 0.4);
                            this._emit('hatch');
                        }
                    }
                    break;
                }
                case MachineKind.Roller: {
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(1.0, 2.0);
                        let cd;
                        if (this.rng.nextDouble() < 0.5) cd = Math.abs(dx) < Math.abs(dy) ? (dx > 0 ? 2 : 6) : (dy > 0 ? 4 : 0);   // close the short side: line up a shot
                        else cd = this.rng.next(4) * 2;
                        m.hx = Dir8.ux(cd); m.hy = Dir8.uy(cd);
                    }
                    const sp = f32(this.rollerSpeed * pace);
                    if (!this.move(m, f32(m.hx * sp * h), f32(m.hy * sp * h))) { m.hx = -m.hx; m.hy = -m.hy; }
                    m.fire = f32(m.fire - h);
                    if (m.fire <= 0) {
                        m.fire = f32(this.shellGap * this.range(0.8, 1.2));
                        if (this.countShots(ShotKind.Shell) < MAX_SHELLS) {
                            const s = this.fireShot(ShotKind.Shell, m.x, m.y, Math.atan2(dy, dx) + this.range(-0.12, 0.12), this.shellSpeed, this.shellLife);
                            s.bounces = 2;
                            this.shellsFired++;
                            this._emit('shell');
                        }
                    }
                    break;
                }
                case MachineKind.Mite: {
                    const want = Math.atan2(dy, dx) + Math.sin(f32(m.anim * 5 + m.look)) * 0.6;
                    const cur0 = Math.atan2(m.hy, m.hx);
                    let diff = want - cur0;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    const turn = f32(2.6 * h);
                    const cur = cur0 + (diff > turn ? turn : diff < -turn ? -turn : diff);
                    m.hx = f32(Math.cos(cur)); m.hy = f32(Math.sin(cur));
                    const sp = f32(this.miteSpeed * pace * this.waveDef.pace);
                    this.move(m, f32(m.hx * sp * h), f32(m.hy * sp * h));
                    break;
                }
            }
        }
        // drones don't stack into one sprite: a soft shove between close pairs
        const ms = this.machines;
        for (let i = 0; i < ms.length; i++) {
            const a = ms[i];
            if (!a.live || a.kind !== MachineKind.Drone) continue;
            for (let j = i + 1; j < ms.length; j++) {
                const b = ms[j];
                if (!b.live || b.kind !== MachineKind.Drone) continue;
                let dx = b.x - a.x, dy = b.y - a.y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= this.droneSpace * this.droneSpace || d2 < 1e-6) continue;
                const dd = Math.sqrt(d2), push = f32((this.droneSpace - dd) * this.droneShove);
                dx /= dd; dy /= dd;
                this.move(a, f32(-dx * push), f32(-dy * push)); this.move(b, f32(dx * push), f32(dy * push));
            }
        }
    }

    updateHumans(h) {
        for (const c of this.humans) {
            if (!c.free) continue;
            c.anim = f32(c.anim + h);
            if (c.conv > 0) {
                // being turned: frozen, flickering violet. Kill the cortex (or touch the human) in time
                if (c.by == null || c.by.dead) { c.conv = 0; c.by = null; }
                else {
                    c.conv = f32(c.conv - h);
                    if (c.conv <= 0) {
                        c.gone = true; c.by.turning = 0; c.by.prey = null; c.by = null;
                        this.waveLost++; this.lostHumans++; this.turned++;
                        const m = new Machine();
                        m.kind = MachineKind.Husk; m.x = c.x; m.y = c.y; m.warpTotal = f32(0.3); m.warp = m.warpTotal; m.anim = c.anim;
                        this.machines.push(m);
                        this.addFx(FxKind.Ring, c.x, c.y, 0.4);
                        this._emit('husk');
                        continue;
                    }
                }
            } else {
                c.think = f32(c.think - h);
                if (c.think <= 0) {
                    c.think = this.range(1.0, 2.6);
                    if (this.rng.nextDouble() < 0.25) { c.hx = 0; c.hy = 0; }
                    else { const cd = this.rng.next(8); c.hx = Dir8.ux(cd); c.hy = Dir8.uy(cd); }
                }
                const top = this.boss != null ? BOSS_FLOOR + 8 : 7;
                let nx = f32(c.x + c.hx * this.humanSpeed * h), ny = f32(c.y + c.hy * this.humanSpeed * h);
                if (nx < 6 || nx > AW - 6) { c.hx = -c.hx; nx = c.x; }
                if (ny < top || ny > AH - 7) { c.hy = -c.hy; ny = c.y; }
                c.x = nx; c.y = ny;
            }
            const dx = c.x - this.playerX, dy = c.y - this.playerY;
            if (dx * dx + dy * dy <= RESCUE_R * RESCUE_R) {
                if (c.by != null) { c.by.turning = 0; c.by.prey = null; c.by = null; c.conv = 0; }
                c.saved = true;
                this.saved++; this.waveSaved++;
                this.chain = Math.min(this.chainCap, this.chain + 1);
                const pts = PTS_RESCUE * this.chain;
                this.addScore(pts);
                this.addFx(FxKind.Beam, c.x, c.y, 0.6);
                this.addFx(FxKind.Popup, c.x, c.y, 1.0, pts);
                this._cues.emit(SoundCue.Bonus);
                this._emit('rescue', { chain: this.chain });
                continue;
            }
            // a crusher's foot
            for (const m of this.machines) {
                if (!m.live || m.kind !== MachineKind.Crusher) continue;
                const ex = m.x - c.x, ey = m.y - c.y, r = m.radius + 4;
                if (ex * ex + ey * ey > r * r) continue;
                if (c.by != null) { c.by.turning = 0; c.by.prey = null; c.by = null; }
                c.gone = true;
                this.waveLost++; this.lostHumans++; this.crushed++;
                this.addFx(FxKind.Skull, c.x, c.y, 1.6);
                this._emit('crush');
                break;
            }
        }
    }

    nearestHuman(x, y, untouched = false) {
        let best = null, bd = 1e9;
        for (const c of this.humans) {
            if (!c.free || (untouched && c.conv > 0)) continue;
            const dx = c.x - x, dy = c.y - y, d = dx * dx + dy * dy;
            if (d < bd) { bd = d; best = c; }
        }
        return best;
    }

    countShots(kind) { let n = 0; for (const s of this.shots) if (!s.dead && s.kind === kind) n++; return n; }

    fireShot(kind, x, y, a, speed, life) {
        const s = new Shot(kind);
        s.x = x; s.y = y; s.vx = f32(Math.cos(a) * speed); s.vy = f32(Math.sin(a) * speed);
        s.life = life; s.anim = this.range(0, 1);
        this.shots.push(s);
        return s;
    }

    destroy(m, byPlayer) {
        m.dead = true;
        this.kills++;
        const pts = byPlayer ? POINTS[m.kind] : 0;
        this.addScore(pts);
        this.addFx(FxKind.Debris, m.x, m.y, m.kind === MachineKind.Hatcher ? 0.7 : 0.5, 0, m.kind);
        if (pts >= 200) this.addFx(FxKind.Popup, m.x, m.y + 2, 0.8, pts, m.kind);
        if (m.kind === MachineKind.Hatcher) { this.shake = Math.max(this.shake, 1.5); this.addFx(FxKind.Ring, m.x, m.y, 0.4); }
        if (m.kind === MachineKind.Pylon) this.addFx(FxKind.Zap, m.x, m.y, 0.3);
        this._cues.emit(SoundCue.Hit);
        this._emit('boom', { of: KIND_NAMES[m.kind], big: m.kind === MachineKind.Hatcher || m.kind === MachineKind.Cortex || m.kind === MachineKind.Roller });
    }

    // ------------------------------------------------------------------ the mainframe
    updateBoss(b, h) {
        if (b.hit > 0) b.hit = f32(b.hit - h);
        if (b.coreHit > 0) b.coreHit = f32(b.coreHit - h);
        for (const p of b.pods) if (p.hit > 0) p.hit = f32(p.hit - h);
        if (b.dying) {
            b.dieT = f32(b.dieT + h);
            b.boomT = f32(b.boomT - h);
            if (b.boomT <= 0 && b.dieT < 2.4) {
                b.boomT = f32(0.14);
                const x = f32(b.x + this.range(-BOSS_HW + 4, BOSS_HW - 4)), y = f32(b.y + this.range(-BOSS_HH + 2, BOSS_HH + 6));
                this.addFx(FxKind.Debris, x, y, 0.6, 0, -1);
                this.shake = Math.max(this.shake, 2);
                this._emit('bossBoom', { size: this.range(0.8, 1.6) });
            }
            if (b.dieT >= 2.6) {
                b.gone = true;
                this.shake = 3; this.railFlash = 0.25;
                this.addFx(FxKind.Ring, b.x, b.y, 0.8);
                this.addFx(FxKind.Debris, b.x - 24, b.y, 0.9, 0, -1); this.addFx(FxKind.Debris, b.x + 24, b.y, 0.9, 0, -1);
                this.addFx(FxKind.Debris, b.x, b.y + 4, 1.0, 0, -1);
                this._emit('bossGone');
            }
            return;
        }
        // drift across the top
        b.moveT = f32(b.moveT - h);
        if (b.moveT <= 0 || Math.abs(b.tx - b.x) < 2) { b.tx = this.range(BOSS_HW + 12, AW - BOSS_HW - 12); b.moveT = this.range(3, 5); }
        const sp = f32((b.rage ? 26 : 16) * this.pace);
        const step = f32(sp * h);
        b.x = Math.abs(b.tx - b.x) <= step ? b.tx : f32(b.x + (b.tx > b.x ? step : -step));

        // the gun pods: a glow (the renderer reads cd < 0.5), then a bolt at the man (a fan of three when it rages)
        for (const p of b.pods) {
            if (p.dead) continue;
            const before = p.cd;
            p.cd = f32(p.cd - h);
            if (before > 0.5 && p.cd <= 0.5) this._emit('bossTele');
            if (p.cd <= 0) {
                p.cd = b.rage ? this.range(1.3, 2.0) : this.range(1.8, 2.6);
                const x = b.podX(p), y = b.podY;
                const a = Math.atan2(this.playerY - y, this.playerX - x);
                const n = b.rage ? 3 : 1;
                for (let i = 0; i < n && this.countShots(ShotKind.Bolt) < MAX_BOLTS; i++)
                    this.fireShot(ShotKind.Bolt, x, f32(y + 4), a + (i - (n - 1) / 2) * 0.28, this.boltSpeed, 4);
                this.boltsFired += n;
                this._emit('bossFire');
            }
        }

        // the shutters: closed -> opening (a flicker) -> open (the core can be hit) -> closing
        b.shutterT = f32(b.shutterT - h);
        if (b.shutterT <= 0) {
            switch (b.shutter) {
                case Shutter.Closed: b.shutter = Shutter.Opening; b.shutterT = f32(0.6); this._emit('coreOpen'); break;
                case Shutter.Opening:
                    b.shutter = Shutter.Open; b.shutterT = b.rage ? f32(2.8) : f32(2.2);
                    if (b.rage) {
                        // the rage: a fan of nine bolts as the core opens
                        for (let i = 0; i < 9 && this.countShots(ShotKind.Bolt) < MAX_BOLTS; i++)
                            this.fireShot(ShotKind.Bolt, b.x, f32(b.coreY + 6), Math.PI * (0.14 + 0.09 * i), f32(this.boltSpeed * 0.7), 4);
                        this.boltsFired += 9;
                        this._emit('bossFire', { fan: true });
                    }
                    break;
                case Shutter.Open: b.shutter = Shutter.Closing; b.shutterT = f32(0.3); break;
                default: b.shutter = Shutter.Closed; b.shutterT = b.rage ? f32(2.8) : f32(3.8); break;
            }
        }

        // drones drop from its belly
        b.dropT = f32(b.dropT - h);
        if (b.dropT <= 0) {
            b.dropT = b.rage ? f32(3.2) : f32(4.5);
            let drones = 0;
            for (const m of this.machines) if (!m.dead && m.kind === MachineKind.Drone) drones++;
            if (drones < 12) {
                for (const s of [-1, 1])
                    this.pending.push({ kind: MachineKind.Drone, burst: 0, delay: 0, x: f32(b.x + s * 12), y: f32(BOSS_FLOOR + 4), stream: false, lead: false });
                this._emit('drop');
            }
        }

        if (!b.rage && (b.podsLeft === 0 || b.coreHp * 2 <= b.coreMax)) {
            b.rage = true;
            this.shake = Math.max(this.shake, 2); this.railFlash = 0.15;
            this._emit('bossRage');
        }
    }

    // true when the bullet hit the mainframe (pod, core, shutter or box)
    bulletBoss(b, bl) {
        for (const p of b.pods) {
            const dx = b.podX(p) - bl.x, dy = b.podY - bl.y, r = POD_R + BULLET_R;
            if (dx * dx + dy * dy > r * r) continue;
            bl.dead = true;
            if (p.dead) { this.addFx(FxKind.Clank, bl.x, bl.y, 0.12); this._emit('bossHit', { armored: true }); return true; }
            p.hp--; p.hit = f32(0.08);
            if (p.hp <= 0) {
                p.dead = true;
                this.addScore(PTS_POD);
                this.addFx(FxKind.Debris, b.podX(p), b.podY, 0.7, 0, -1);
                this.addFx(FxKind.Popup, b.podX(p), b.podY + 14, 0.9, PTS_POD, -1);
                this.shake = Math.max(this.shake, 2);
                this._cues.emit(SoundCue.Hit);
                this._emit('podDown');
            } else this._emit('bossHit', { armored: false });
            return true;
        }
        {
            const dx = b.x - bl.x, dy = b.coreY - bl.y, r = CORE_R + BULLET_R;
            if (dx * dx + dy * dy <= r * r) {
                bl.dead = true;
                if (b.shutter === Shutter.Open) {
                    b.coreHp--; b.coreHit = f32(0.08);
                    if (b.coreHp <= 0) this.bossDie(b);
                    else this._emit('bossHit', { core: true });
                } else { b.hit = f32(0.05); this.addFx(FxKind.Clank, bl.x, bl.y, 0.12); this._emit('bossHit', { armored: true }); }
                return true;
            }
        }
        if (Math.abs(bl.x - b.x) <= BOSS_HW && bl.y <= b.y + BOSS_HH && bl.y >= b.y - BOSS_HH) {
            bl.dead = true; b.hit = f32(0.05);
            this.addFx(FxKind.Clank, bl.x, bl.y, 0.12);
            this._emit('bossHit', { armored: true });
            return true;
        }
        return false;
    }

    touchesBoss(b) {
        const px = this.playerX, py = this.playerY;
        if (Math.abs(px - b.x) <= BOSS_HW + PLAYER_R && py <= b.y + BOSS_HH + PLAYER_R) return true;
        for (const p of b.pods) {
            if (p.dead) continue;
            const dx = b.podX(p) - px, dy = b.podY - py, r = POD_R + PLAYER_R;
            if (dx * dx + dy * dy <= r * r) return true;
        }
        const dx = b.x - px, dy = b.coreY - py, r = CORE_R + PLAYER_R;
        return dx * dx + dy * dy <= r * r;
    }

    bossDie(b) {
        b.dying = true; b.dieT = 0; b.boomT = 0;
        b.shutter = Shutter.Open;
        this.addScore(PTS_CORE);
        this.addFx(FxKind.Popup, b.x, b.coreY + 20, 1.6, PTS_CORE, -1);
        this.shake = 3; this.railFlash = 0.2;
        for (const s of this.shots) if (!s.dead) { s.dead = true; this.addFx(FxKind.Fizzle, s.x, s.y, 0.3); }
        for (const m of this.machines) if (!m.dead && m.kind !== MachineKind.Pylon) {
            if (m.kind === MachineKind.Crusher) { m.dead = true; this.addFx(FxKind.Debris, m.x, m.y, 0.6, 0, m.kind); }
            else if (m.warp > 0) m.dead = true;
            else this.destroy(m, true);
        }
        this.pending.length = 0;
        this._cues.emit(SoundCue.Hit);
        this._emit('bossDie');
        this.logEvent('B');
    }

    // ------------------------------------------------------------------ between the waves
    waveClear() {
        this.wavesCleared++;
        for (const s of this.shots) if (!s.dead) this.addFx(FxKind.Fizzle, s.x, s.y, 0.3);
        this.shots.length = 0; this.bullets.length = 0;
        const w = this.waveNo;
        const rows = [];
        rows.push({ label: 'HUMANS SAVED', text: this.waveSaved + ' OF ' + this.waveHumans, pts: 0 });
        rows.push({ label: 'WAVE BONUS', text: '', pts: 1000 * w });
        if (this.waveSaved === this.waveHumans) rows.push({ label: 'EVERY HUMAN', text: '', pts: 5000 });
        if (this.waveDeaths === 0) rows.push({ label: 'NO MAN LOST', text: '', pts: 2000 * w });
        if (this.waveDef.boss) rows.push({ label: 'THE MAINFRAME', text: '', pts: PTS_BOSS_BONUS });
        this.tally = rows; this.tallyShown = 0;
        this._cues.emit(SoundCue.Bonus);
        this._emit('waveClear', { wave: w });
        this.logEvent('C', w);
        this.p = Phase.Tally; this.phaseTime = 0;
    }

    tallyTick() {
        while (this.tallyShown < this.tally.length && this.phaseTime >= 0.6 + this.tallyShown * this.tallyRowGap) {
            const row = this.tally[this.tallyShown++];
            if (row.pts > 0) this.addScore(row.pts);
            this._emit('tally', { n: this.tallyShown, pts: row.pts });
        }
        if (this.tallyShown >= this.tally.length && this.phaseTime >= 0.6 + this.tally.length * this.tallyRowGap + this.tallyHold) {
            if (this.wave + 1 >= WAVES.length) this.toResult(RoundResult.Won);
            else this.startWave(this.wave + 1);
        }
    }

    toResult(r) {
        this._result = r;
        this.p = Phase.Result; this.phaseTime = 0;
        if (r === RoundResult.Won) { this._cues.emit(SoundCue.Win); this.logEvent('W'); }
    }

    loseMan(cause) {
        this.killedBy[cause]++;
        this.deathsIn[this.wave]++;
        this.men--;
        this.deaths++; this.waveDeaths++;
        this.chain = 0;
        this.shake = 3;
        this._cues.emit(SoundCue.Die);
        this._emit('die');
        this.addFx(FxKind.ManDown, this.playerX, this.playerY, this.downSeconds);
        this.bullets.length = 0;
        this.logEvent('D', this.waveNo);
        this.p = Phase.Down; this.phaseTime = 0;
    }

    // after a lost man: the player back in the middle, the survivors re-warp away from him
    regroupWave() {
        const b = this.boss;
        this.playerX = AW / 2; this.playerY = b != null ? AH - 56 : AH / 2; this.moving = false;
        this.shots.length = 0; this.bullets.length = 0;
        for (const m of this.machines) {
            if (m.dead || m.kind === MachineKind.Pylon) continue;
            const pos = this.placeAway(this.wave === 0 ? 110 : 90, 12);
            m.x = pos.x; m.y = pos.y;
            m.warpTotal = f32(this.warpTime * this.slow); m.warp = m.warpTotal;
            m.stun = 0; m.think = this.range(0, 0.3); m.turning = 0; m.prey = null;
            if (m.kind === MachineKind.Cortex) m.fire = f32(this.sparkGap * this.range(0.6, 1.0));
            if (m.kind === MachineKind.Roller) m.fire = f32(this.shellGap * this.range(0.6, 1.0));
        }
        for (const c of this.humans) { c.conv = 0; c.by = null; }
        if (b != null) {
            b.shutter = Shutter.Closed; b.shutterT = f32(2.5);
            for (const p of b.pods) p.cd = Math.max(p.cd, this.range(1.5, 3));
        }
        this.burstClock = 0;
        this.regroup = true;
        this.p = Phase.SpawnIn; this.phaseTime = 0;
    }

    // move inside the floor (and under the mainframe); false when a wall stopped it
    move(m, dx, dy) {
        const r = m.radius;
        const top = this.boss != null && !this.boss.gone ? BOSS_FLOOR + r : r + 1;
        let nx = m.x + dx, ny = m.y + dy;
        let free = true;
        if (nx < r) { nx = r; free = false; } else if (nx > AW - r) { nx = AW - r; free = false; }
        if (ny < top) { ny = top; free = false; } else if (ny > AH - r - 1) { ny = AH - r - 1; free = false; }
        m.x = nx; m.y = ny;
        return free;
    }

    collectStats(into) {
        const add = (k, v) => { into[k] = (into[k] || 0) + v; };
        add('deaths', this.deaths);
        add('kills', this.kills);
        add('saved', this.saved);
        add('lostHumans', this.lostHumans);
        add('waves', this.wavesCleared);
        add('reached', this.waveNo);
        add('extras', this.extras);
        add('fried', this.fried);
        add('sparks', this.sparksFired);
        add('shells', this.shellsFired);
        add('bolts', this.boltsFired);
        const by = ['byDrone', 'byCrusher', 'byCortex', 'byPylon', 'byHusk', 'byHatcher', 'byRoller', 'byMite', 'bySpark', 'byShell', 'byBolt', 'byBoss'];
        for (let i = 0; i < by.length; i++) add(by[i], this.killedBy[i]);
        for (let i = 0; i < this.deathsIn.length; i++) add('dW' + (i + 1), this.deathsIn[i]);
    }
}
