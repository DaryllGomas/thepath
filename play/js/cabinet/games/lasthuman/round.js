// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of LastHumanSim.cs from Staging/Batch1/lasthuman.
//
// A one-stick Robotron. The cabinet has ONE stick and ONE button, so you move and face the same way
// (8 directions) and holding A fires where you face, even standing still (8 bullets on the tube at
// most, fast). Let go of the stick and you stand your ground facing the last way you went.
//
// A ROUND = one wave in THREE PHASES. Each phase is a spawn-in burst: machines warp in as stretched
// scanlines and are harmless and unshootable until they are solid.
//   GRUNT   walks at you, re-aiming every half second or so, faster the longer the wave runs
//   HULK    cannot be killed; every bullet shoves it back. Wanders on the four axes, drifting at you
//   BRAIN   keeps its distance and lobs slow homing SPARKS (sparks can be shot down)
// 3-6 CIVILIANS wander the floor. Touch one to rescue it: 1000 x the chain (rescues since your last
// death, capped at 5). Grunt 100, brain 500.
// Touch any machine or spark and you lose a man (3). After a death the survivors re-warp at the edges
// and the wave resumes (GET READY). Phase 2 and 3 warp in when the floor is down to a quarter of the
// last burst's killables, or when the phase has run too long.
//
// THE ROUND IS WON when every killable machine of all three phases is destroyed AND at least one
// civilian has been rescued. It is lost when the last man goes down. Never on the clock.
//
// MERCY: the knobs thin the wave 10% per loss and slow the spawn-ins. On the unlosable credit
// (credit.unlosable) the machines warp in ONE AT A TIME and the player wears a SHIELD: contact
// destroys grunts, brains and sparks and bounces hulks away; no man is ever lost.
import { f32, idiv, roundEven, SystemRandom, InputFrame, Pad, CabinetState, RoundResult, SoundCue, CueBuffer } from '../../sdk/index.js';

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

export const MachineKind = Object.freeze({ Grunt: 0, Hulk: 1, Brain: 2 });
export const FxKind = Object.freeze({ Debris: 0, ManDown: 1, Beam: 2, Popup: 3, Fizzle: 4, Clank: 5 });
const Phase = Object.freeze({ Idle: 0, SpawnIn: 1, Play: 2, Down: 3, Card: 4, Over: 5 });

export class Machine {
    constructor() {
        this.kind = MachineKind.Grunt;
        this.x = 0; this.y = 0; this.hx = 0; this.hy = 0;
        this.warp = 0; this.warpTotal = 0;
        this.think = 0; this.fire = 0; this.stun = 0; this.anim = 0;
        this.burst = 0; this.dead = false;
    }
    get live() { return !this.dead && this.warp <= 0; }
    get killable() { return this.kind !== MachineKind.Hulk; }
    get radius() { return this.kind === MachineKind.Hulk ? 8 : this.kind === MachineKind.Brain ? 6.5 : 6; }
    get warpProgress() { return this.warpTotal > 0 ? 1 - Math.max(0, this.warp) / this.warpTotal : 1; }
}

export class Civilian {
    constructor() { this.x = 0; this.y = 0; this.hx = 0; this.hy = 0; this.think = 0; this.anim = 0; this.look = 0; this.saved = false; }
}
export class Bullet { constructor() { this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.dir = 0; this.dead = false; } }
export class Spark { constructor() { this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.life = 0; this.anim = 0; this.dead = false; } }
export class Fx {
    constructor(kind, x, y, life, value, seed, of) {
        this.kind = kind; this.x = x; this.y = y; this.t = 0; this.life = life;
        this.value = value || 0; this.seed = seed || 0; this.of = of !== undefined ? of : MachineKind.Grunt;
    }
}

const AW = 296, AH = 192;   // the arena floor in px
const TILE = 16;
const BURSTS = 3;
const MAX_BULLETS = 8, MAX_SPARKS = 6;
const PLAYER_R = 4, SPARK_R = 2.5, RESCUE_R = 10, BULLET_R = 1.5;
const PTS_GRUNT = 100, PTS_BRAIN = 500, PTS_RESCUE = 1000;

function clampf(v, a, b) { return v < a ? a : v > b ? b : v; }

export class LastHumanRound {
    static get AW() { return AW; }
    static get AH() { return AH; }
    static get Tile() { return TILE; }
    static get Bursts() { return BURSTS; }
    static get PtsGrunt() { return PTS_GRUNT; }
    static get PtsBrain() { return PTS_BRAIN; }
    static get PtsRescue() { return PTS_RESCUE; }
    static get Phase() { return Phase; }

    constructor() {
        // the machine's timing (not mercy knobs)
        this.introHold = f32(1.0);
        this.minIntro = f32(1.2);
        this.downSeconds = f32(2.4);
        this.cardSeconds = f32(3.0);
        this.bulletSpeed = f32(300);
        this.civSpeed = f32(11);
        this.brainSpeed = f32(15);
        this.brainHold = f32(80);
        this.sparkLife = f32(5);
        this.burstClearGap = f32(4);
        this.stagger = f32(0.06); this.warpTime = f32(0.9);
        this.startLives = 3;
        this.chainCap = 5;
        this.gruntSpace = f32(13);
        this.gruntShove = f32(0.5);

        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.playerX = 0; this.playerY = 0;
        this.face = 0; this.moving = false; this.walkAnim = 0;
        this.men = 0; this.chain = 0; this.saved = 0; this.kills = 0;
        this.killableTotal = 0; this.deaths = 0; this.burstsStarted = 0;
        this.bannerTime = 99;
        this.regroup = false;
        this.playClock = 0;
        this.credit = null;

        this.machines = []; this.civilians = []; this.bullets = []; this.sparks = []; this.fx = [];
        this.waves = [[], [], []];
        this.pending = [];
        this.trickleQueue = [];
        this._cues = new CueBuffer();
        this._log = '';

        this.rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._time = 0;
        this.logEvents = 0; this.sparksFired = 0; this.hulkHits = 0; this.shots = 0;
        this.killedBy = [0, 0, 0, 0];
        this.fireCd = 0; this.burstClock = 0; this.trickleClock = 0; this.slow = 1;
        this.lastBurstKillables = 0;

        this.waveScale = 1; this.gruntSpeed = 0; this.gruntRamp = 0; this.gruntMaxRamp = 0;
        this.hulkSpeed = 0; this.hulkPush = 0; this.brainFireGap = 0; this.sparkSpeed = 0; this.sparkTurn = 0;
        this.playerSpeed = 0; this.fireGap = 0; this.trickleGap = 0; this.phaseMinGap = 0; this.phaseMaxGap = 0;
        this.nGrunts = 0; this.nHulks = 0; this.nBrains = 0; this.civMin = 0; this.civMax = 0;
        this.trickle = false;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.SpawnIn: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Down: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
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
    get gruntSpeedNow() { return f32(this.gruntSpeed * Math.min(this.gruntMaxRamp, f32(1 + f32(this.gruntRamp * this.playClock)))); }
    get killablesLeft() { return this.killableTotal - this.kills; }
    get civilianCount() { return this.civilians.length; }
    get roundWon() { return this._result === RoundResult.Won; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this._score + ' ' + this._time.toFixed(1) + 's men ' + this.men + ' kills ' + this.kills + '/' + this.killableTotal +
            ' saved ' + this.saved + '/' + this.civilians.length + ' deaths ' + this.deaths + ' | ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.waveScale = k.get('waveScale');
        this.slow = Math.max(f32(0.25), k.get('spawnSlow'));
        this.gruntSpeed = k.get('gruntSpeed');
        this.gruntRamp = k.get('gruntRamp');
        this.gruntMaxRamp = k.get('gruntMaxRamp');
        this.hulkSpeed = k.get('hulkSpeed');
        this.hulkPush = k.get('hulkPush');
        this.brainFireGap = k.get('brainFireGap');
        this.sparkSpeed = k.get('sparkSpeed');
        this.sparkTurn = k.get('sparkTurn');
        this.playerSpeed = k.get('playerSpeed');
        this.fireGap = k.get('fireGap');
        this.trickle = k.get('trickle') >= 0.5 || credit.unlosable;
        this.trickleGap = k.get('trickleGap');
        this.phaseMinGap = k.get('phaseMinGap');
        this.phaseMaxGap = k.get('phaseMaxGap');
        this.nGrunts = Math.max(3, Math.trunc(roundEven(f32(k.get('grunts') * this.waveScale))));
        this.nBrains = Math.max(0, Math.trunc(roundEven(f32(k.get('brains') * this.waveScale))));
        this.nHulks = Math.max(1, Math.trunc(roundEven(f32(k.get('hulks') * this.waveScale))));
        this.civMin = Math.max(1, Math.trunc(k.get('civiliansMin')));
        this.civMax = Math.max(this.civMin, Math.trunc(k.get('civiliansMax')));

        this.machines.length = 0; this.civilians.length = 0; this.bullets.length = 0; this.sparks.length = 0;
        this.fx.length = 0; this.pending.length = 0; this.trickleQueue.length = 0;
        for (const w of this.waves) w.length = 0;
        this._score = 0; this._time = 0; this.fireCd = 0; this.burstClock = 0; this.trickleClock = 0; this.playClock = 0;
        this.men = this.startLives; this.chain = 0; this.saved = 0; this.kills = 0; this.deaths = 0;
        this.burstsStarted = 0; this.bannerTime = 99;
        this.logEvents = 0; this.sparksFired = 0; this.hulkHits = 0; this.shots = 0;
        this.killedBy = [0, 0, 0, 0];
        this._result = RoundResult.None; this.regroup = false;
        this._log = '';
        this._cues.resetTotals();

        // the wave: grunts 40/30/30 over the phases, brains in phases 2 and 3, hulks one per phase round-robin
        const g1 = Math.trunc(roundEven(f32(this.nGrunts * f32(0.4))));
        const g2 = Math.trunc(roundEven(f32(this.nGrunts * f32(0.3))));
        const g3 = this.nGrunts - g1 - g2;
        for (let i = 0; i < g1; i++) this.waves[0].push(MachineKind.Grunt);
        for (let i = 0; i < g2; i++) this.waves[1].push(MachineKind.Grunt);
        for (let i = 0; i < g3; i++) this.waves[2].push(MachineKind.Grunt);
        for (let i = 0; i < this.nBrains; i++) this.waves[1 + (i % 2)].push(MachineKind.Brain);
        for (let i = 0; i < this.nHulks; i++) this.waves[i % 3].push(MachineKind.Hulk);
        for (const w of this.waves) this.shuffle(w);
        this.killableTotal = this.nGrunts + this.nBrains;

        this.playerX = AW / 2; this.playerY = AH / 2; this.face = 0; this.moving = false; this.walkAnim = 0;

        const nCiv = this.civMin + this.rng.next(this.civMax - this.civMin + 1);
        for (let i = 0; i < nCiv; i++) {
            const c = new Civilian();
            c.look = this.rng.next(2); c.think = this.range(0.3, 1.5); c.anim = this.range(0, 1);
            const pos = this.placeAway(44, 10);
            c.x = pos.x; c.y = pos.y;
            this.civilians.push(c);
        }

        if (this.trickle) {
            for (let b = 0; b < BURSTS; b++)
                for (const kind of this.waves[b]) this.trickleQueue.push({ kind, burst: b, delay: 0 });
            this.trickleClock = this.trickleGap;   // the first one comes straight after GET READY
        }

        this.p = Phase.SpawnIn; this.phaseTime = 0;
        if (this.trickle) this.spawnTrickle(this.introHold);
        else this.dispatchBurst(0, this.introHold);
    }

    shuffle(l) {
        for (let i = l.length - 1; i > 0; i--) { const j = this.rng.next(i + 1); const t = l[i]; l[i] = l[j]; l[j] = t; }
    }

    range(a, b) { a = f32(a); b = f32(b); return f32(a + f32(f32(b - a) * f32(this.rng.nextDouble()))); }

    // a random spot at least minDist from the player (relaxes if the floor is crowded)
    placeAway(minDist, pad) {
        let x = AW / 2, y = AH / 2;
        for (let tries = 0; tries < 60; tries++) {
            x = this.range(pad, AW - pad); y = this.range(pad, AH - pad);
            const dx = x - this.playerX, dy = y - this.playerY;
            const need = tries < 40 ? minDist : minDist * 0.6;
            if (dx * dx + dy * dy >= need * need) return { x, y };
        }
        return { x, y };
    }

    dispatchBurst(b, delay) {
        let n = 0;
        this.lastBurstKillables = 0;
        for (const kind of this.waves[b]) {
            this.pending.push({ kind, burst: b, delay: f32(delay + n * this.stagger * this.slow) });
            if (kind !== MachineKind.Hulk) this.lastBurstKillables++;
            n++;
        }
        this.burstsStarted = b + 1;
        this.burstClock = 0;
        if (b > 0) this.bannerTime = 0;
        this._cues.emit(SoundCue.Start);
        this.logEvent('P', b + 1);
    }

    spawnTrickle(delay) {
        if (this.trickleQueue.length === 0) return;
        const p = this.trickleQueue.shift();
        p.delay = delay;
        this.pending.push(p);
        if (p.burst + 1 > this.burstsStarted) {
            this.burstsStarted = p.burst + 1;
            if (p.burst > 0) this.bannerTime = 0;
            this.logEvent('P', p.burst + 1);
        }
        this.trickleClock = 0;
        this._cues.emit(SoundCue.Start);
    }

    materialise(p) {
        const m = new Machine();
        m.kind = p.kind; m.burst = p.burst;
        m.warpTotal = f32(this.warpTime * this.slow);
        m.think = this.range(0, 0.3); m.anim = this.range(0, 1);
        m.warp = m.warpTotal;
        m.fire = f32(this.brainFireGap * this.range(0.5, 1.0));
        const pos = this.placeAway(p.kind === MachineKind.Hulk ? 80 : 70, 12);
        m.x = pos.x; m.y = pos.y;
        this.machines.push(m);
    }

    logEvent(c, v) {
        if (this.logEvents >= 28) return;
        this.logEvents++;
        this._log += c + (c === 'P' ? Math.round(v) + '@' + this._time.toFixed(1) : this._time.toFixed(1)) + ' ';
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
        this.updateFx(h);

        switch (this.p) {
            case Phase.SpawnIn:
                this.updatePending(h);
                this.updateWarps(h);
                if (this.phaseTime >= this.minIntro && this.pending.length === 0 && !this.anyWarping()) {
                    this.p = Phase.Play; this.phaseTime = 0;
                }
                break;
            case Phase.Play:
                this.playTick(h, input);
                break;
            case Phase.Down:
                this.updateWarps(h);          // a half-warped machine finishes forming while the man is down
                if (this.phaseTime >= this.downSeconds) {
                    if (this.men <= 0) { this._result = RoundResult.Lost; this.p = Phase.Card; this.phaseTime = 0; }
                    else this.regroupWave();
                }
                break;
            case Phase.Card:
                this.updateWarps(h);
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    anyWarping() { for (const m of this.machines) if (!m.dead && m.warp > 0) return true; return false; }

    updatePending(h) {
        for (let i = 0; i < this.pending.length; i++) {
            const p = this.pending[i];
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

    addFx(kind, x, y, life, value = 0, of = MachineKind.Grunt) {
        if (this.fx.length > 48) this.fx.shift();
        this.fx.push(new Fx(kind, x, y, life, value, this.rng.next(1 << 16), of));
    }

    playTick(h, input) {
        this.playClock = f32(this.playClock + h);
        this.burstClock = f32(this.burstClock + h);

        // ---- the burst dispatcher (or the one-at-a-time trickle on the mercy credit)
        if (this.trickle) {
            this.trickleClock = f32(this.trickleClock + h);
            if (this.trickleQueue.length > 0 && this.pending.length === 0 && !this.anyWarping() && this.trickleClock >= this.trickleGap) this.spawnTrickle(0);
        } else if (this.burstsStarted < BURSTS) {
            let left = 0;
            for (const m of this.machines) if (!m.dead && m.killable) left++;
            for (const p of this.pending) if (p.kind !== MachineKind.Hulk) left++;
            const trigger = Math.max(1, Math.trunc(this.lastBurstKillables * 0.25));
            if ((left === 0 && this.burstClock >= this.burstClearGap * this.slow) ||
                (left <= trigger && this.burstClock >= this.phaseMinGap * this.slow) ||
                this.burstClock >= this.phaseMaxGap * this.slow)
                this.dispatchBurst(this.burstsStarted, 0);
        }
        this.updatePending(h);
        this.updateWarps(h);

        // ---- the player: one stick = move + face; A held = fire the way you face
        let sx = 0, sy = 0;
        if (input != null) {
            const f = input.current;
            sx = f.x > InputFrame.Threshold ? 1 : f.x < -InputFrame.Threshold ? -1 : 0;
            sy = f.y > InputFrame.Threshold ? -1 : f.y < -InputFrame.Threshold ? 1 : 0;
        }
        const d = Dir8.fromStick(sx, sy);
        this.moving = d >= 0;
        if (this.moving) {
            this.face = d;
            this.playerX = clampf(f32(this.playerX + f32(Dir8.ux(d) * this.playerSpeed * h)), 5, AW - 5);
            this.playerY = clampf(f32(this.playerY + f32(Dir8.uy(d) * this.playerSpeed * h)), 7, AH - 7);
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
                this.shots++;
                this._cues.emit(SoundCue.Tick);
            }
        }

        // ---- machines
        let onlyBrains = true;
        for (const m of this.machines) if (!m.dead && m.kind === MachineKind.Grunt) { onlyBrains = false; break; }
        if (this.pending.length > 0 || this.trickleQueue.length > 0 || this.burstsStarted < BURSTS) onlyBrains = false;
        const gs = this.gruntSpeedNow;
        for (const m of this.machines) {
            if (!m.live) continue;
            m.anim = f32(m.anim + h);
            const dx = this.playerX - m.x, dy = this.playerY - m.y;
            const dist = f32(Math.sqrt(dx * dx + dy * dy) + 1e-4);
            switch (m.kind) {
                case MachineKind.Grunt: {
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(0.3, 0.6);
                        const a = Math.atan2(dy, dx) + this.range(-0.35, 0.35);
                        m.hx = f32(Math.cos(a)); m.hy = f32(Math.sin(a));
                    }
                    this.move(m, f32(m.hx * gs * h), f32(m.hy * gs * h));
                    break;
                }
                case MachineKind.Hulk: {
                    if (m.stun > 0) { m.stun = f32(m.stun - h); break; }
                    m.think = f32(m.think - h);
                    if (m.think <= 0) {
                        m.think = this.range(1.0, 2.2);
                        let cd;
                        if (this.rng.nextDouble() < 0.55) cd = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 6) : (dy > 0 ? 4 : 0);
                        else cd = this.rng.next(4) * 2;
                        m.hx = Dir8.ux(cd); m.hy = Dir8.uy(cd);
                    }
                    if (!this.move(m, f32(m.hx * this.hulkSpeed * h), f32(m.hy * this.hulkSpeed * h))) { m.hx = -m.hx; m.hy = -m.hy; }
                    break;
                }
                case MachineKind.Brain: {
                    m.think = f32(m.think - h);
                    const hold = onlyBrains ? f32(34) : this.brainHold;
                    if (m.think <= 0) {
                        m.think = this.range(0.5, 1.0);
                        const a = dist > hold ? Math.atan2(dy, dx) + this.range(-0.5, 0.5) : this.rng.nextDouble() * Math.PI * 2;
                        m.hx = f32(Math.cos(a)); m.hy = f32(Math.sin(a));
                    }
                    this.move(m, f32(m.hx * this.brainSpeed * h), f32(m.hy * this.brainSpeed * h));
                    m.fire = f32(m.fire - h);
                    if (m.fire <= 0) {
                        m.fire = f32(this.brainFireGap * this.range(0.7, 1.3));
                        let liveSparks = 0;
                        for (const sp of this.sparks) if (!sp.dead) liveSparks++;
                        if (dist < 180 && liveSparks < MAX_SPARKS) {
                            const sp = new Spark();
                            sp.x = m.x; sp.y = m.y; sp.vx = f32(dx / dist * this.sparkSpeed); sp.vy = f32(dy / dist * this.sparkSpeed);
                            sp.life = this.sparkLife; sp.anim = this.range(0, 1);
                            this.sparks.push(sp);
                            this.sparksFired++;
                        }
                    }
                    break;
                }
            }
        }
        // grunts don't stack into one sprite: a soft shove between close pairs
        for (let i = 0; i < this.machines.length; i++) {
            const a = this.machines[i];
            if (!a.live || a.kind !== MachineKind.Grunt) continue;
            for (let j = i + 1; j < this.machines.length; j++) {
                const b = this.machines[j];
                if (!b.live || b.kind !== MachineKind.Grunt) continue;
                let dx = b.x - a.x, dy = b.y - a.y;
                const d2 = dx * dx + dy * dy;
                if (d2 >= this.gruntSpace * this.gruntSpace || d2 < 1e-6) continue;
                const dd = Math.sqrt(d2), push = f32((this.gruntSpace - dd) * this.gruntShove);
                dx /= dd; dy /= dd;
                this.move(a, f32(-dx * push), f32(-dy * push)); this.move(b, f32(dx * push), f32(dy * push));
            }
        }

        // ---- sparks home, slowly
        for (const s of this.sparks) {
            if (s.dead) continue;
            s.anim = f32(s.anim + h);
            s.life = f32(s.life - h);
            const dx = this.playerX - s.x, dy = this.playerY - s.y;
            const cur0 = Math.atan2(s.vy, s.vx), want = Math.atan2(dy, dx);
            let diff = want - cur0;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const turn = f32(this.sparkTurn * h);
            let cur = cur0 + (diff > turn ? turn : diff < -turn ? -turn : diff);
            s.vx = f32(Math.cos(cur) * this.sparkSpeed); s.vy = f32(Math.sin(cur) * this.sparkSpeed);
            s.x = f32(s.x + s.vx * h); s.y = f32(s.y + s.vy * h);
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
                if (m.kind === MachineKind.Hulk) {
                    const ux = Dir8.ux(b.dir), uy = Dir8.uy(b.dir);
                    this.move(m, f32(ux * this.hulkPush), f32(uy * this.hulkPush));
                    m.stun = f32(0.2);
                    this.hulkHits++;
                    this.addFx(FxKind.Clank, b.x, b.y, 0.12);
                    this._cues.emit(SoundCue.Miss);
                } else this.destroy(m);
                break;
            }
            if (b.dead) continue;
            for (const s of this.sparks) {
                if (s.dead) continue;
                const dx = s.x - b.x, dy = s.y - b.y, r = SPARK_R + BULLET_R + 1;
                if (dx * dx + dy * dy > r * r) continue;
                s.dead = true; b.dead = true;
                this.addFx(FxKind.Fizzle, s.x, s.y, 0.3);
                this._cues.emit(SoundCue.Miss);
                break;
            }
        }
        this.bullets = this.bullets.filter(x => !x.dead);
        this.sparks = this.sparks.filter(x => !x.dead);

        // ---- civilians wander; touch one to rescue it
        for (const c of this.civilians) {
            if (c.saved) continue;
            c.anim = f32(c.anim + h);
            c.think = f32(c.think - h);
            if (c.think <= 0) {
                c.think = this.range(1.0, 2.6);
                if (this.rng.nextDouble() < 0.25) { c.hx = 0; c.hy = 0; }
                else { const cd = this.rng.next(8); c.hx = Dir8.ux(cd); c.hy = Dir8.uy(cd); }
            }
            let nx = f32(c.x + c.hx * this.civSpeed * h), ny = f32(c.y + c.hy * this.civSpeed * h);
            if (nx < 6 || nx > AW - 6) { c.hx = -c.hx; nx = c.x; }
            if (ny < 7 || ny > AH - 7) { c.hy = -c.hy; ny = c.y; }
            c.x = nx; c.y = ny;
            const dx = c.x - this.playerX, dy = c.y - this.playerY;
            if (dx * dx + dy * dy <= RESCUE_R * RESCUE_R) {
                c.saved = true;
                this.saved++;
                this.chain = Math.min(this.chainCap, this.chain + 1);
                const pts = PTS_RESCUE * this.chain;
                this._score += pts;
                this.addFx(FxKind.Beam, c.x, c.y, 0.6);
                this.addFx(FxKind.Popup, c.x, c.y, 1.0, pts);
                this._cues.emit(SoundCue.Bonus);
                this.logEvent('R', 0);
            }
        }

        // ---- contact
        for (const m of this.machines) {
            if (!m.live) continue;
            const dx = m.x - this.playerX, dy = m.y - this.playerY, r = m.radius + PLAYER_R;
            if (dx * dx + dy * dy > r * r) continue;
            if (this.mercyActive) {
                if (m.kind === MachineKind.Hulk) {
                    const dd = Math.sqrt(dx * dx + dy * dy) + 1e-3;
                    this.move(m, f32(dx / dd * (r - dd + 2)), f32(dy / dd * (r - dd + 2)));
                    m.stun = f32(0.4);
                } else this.destroy(m);
                continue;
            }
            this.loseMan(m.kind === MachineKind.Grunt ? 0 : m.kind === MachineKind.Hulk ? 1 : 2);
            return;
        }
        for (const s of this.sparks) {
            if (s.dead) continue;
            const dx = s.x - this.playerX, dy = s.y - this.playerY, r = SPARK_R + PLAYER_R;
            if (dx * dx + dy * dy > r * r) continue;
            if (this.mercyActive) { s.dead = true; this.addFx(FxKind.Fizzle, s.x, s.y, 0.3); continue; }
            this.loseMan(3);
            return;
        }
        this.sparks = this.sparks.filter(x => !x.dead);
        this.machines = this.machines.filter(x => !x.dead);

        // ---- the round is won by clearing the floor with a human saved
        if (this.burstsStarted >= BURSTS && this.pending.length === 0 && this.trickleQueue.length === 0 && this.saved > 0) {
            let any = false;
            for (const m of this.machines) if (!m.dead && m.killable) { any = true; break; }
            if (!any) {
                this._result = RoundResult.Won;
                this.p = Phase.Card; this.phaseTime = 0;
                this._cues.emit(SoundCue.Win);
                this.logEvent('W', 0);
            }
        }
    }

    destroy(m) {
        m.dead = true;
        this.kills++;
        this._score += m.kind === MachineKind.Brain ? PTS_BRAIN : PTS_GRUNT;
        this.addFx(FxKind.Debris, m.x, m.y, 0.5, 0, m.kind);
        if (m.kind === MachineKind.Brain) this.addFx(FxKind.Popup, m.x, m.y + 2, 0.8, PTS_BRAIN);
        this._cues.emit(SoundCue.Hit);
    }

    loseMan(cause) {
        this.killedBy[cause]++;
        this.men--;
        this.deaths++;
        this.chain = 0;
        this._cues.emit(SoundCue.Die);
        this.addFx(FxKind.ManDown, this.playerX, this.playerY, this.downSeconds);
        this.bullets.length = 0;
        this.logEvent('D', 0);
        this.p = Phase.Down; this.phaseTime = 0;
    }

    // after a lost man: the player back in the middle, the survivors re-warp away from him
    regroupWave() {
        this.playerX = AW / 2; this.playerY = AH / 2; this.moving = false;
        this.sparks.length = 0; this.bullets.length = 0;
        for (const m of this.machines) {
            if (m.dead) continue;
            const pos = this.placeAway(90, 12);
            m.x = pos.x; m.y = pos.y;
            m.warpTotal = f32(this.warpTime * this.slow); m.warp = m.warpTotal;
            m.stun = 0; m.think = this.range(0, 0.3);
            m.fire = f32(this.brainFireGap * this.range(0.6, 1.0));
        }
        this.burstClock = 0;
        this.trickleClock = 0;
        this.regroup = true;
        this.p = Phase.SpawnIn; this.phaseTime = 0;
    }

    // move inside the floor; false when a wall stopped it
    move(m, dx, dy) {
        const r = m.radius;
        let nx = m.x + dx, ny = m.y + dy;
        let free = true;
        if (nx < r) { nx = r; free = false; } else if (nx > AW - r) { nx = AW - r; free = false; }
        if (ny < r + 1) { ny = r + 1; free = false; } else if (ny > AH - r - 1) { ny = AH - r - 1; free = false; }
        m.x = nx; m.y = ny;
        return free;
    }

    collectStats(into) {
        const add = (k, v) => { into[k] = (into[k] || 0) + v; };
        add('deaths', this.deaths);
        add('kills', this.kills);
        add('saved', this.saved);
        add('civilians', this.civilians.length);
        add('phases', this.burstsStarted);
        add('sparks', this.sparksFired);
        add('hulkHits', this.hulkHits);
        add('killables', this.killableTotal);
        add('byGrunt', this.killedBy[0]);
        add('byHulk', this.killedBy[1]);
        add('byBrain', this.killedBy[2]);
        add('bySpark', this.killedBy[3]);
    }
}
