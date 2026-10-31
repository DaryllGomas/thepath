// THE NODE · world 1 · LAST LIGHT on the Cabinet Engine · THE ROUND (ICabinetSim).
// Eight watches of the lunar siege. Domes are lives; the last watch ends only when the carrier falls.
import { f32, roundEven, fmt, F32, SoundCue, CueBuffer, CabinetState, RoundResult, Pad, SystemRandom } from '../../sdk/index.js';

const Phase = Object.freeze({ Idle: 0, Banner: 1, Play: 2, Clear: 3, Fallen: 4, Tally: 5, Card: 6, Over: 7 });
const Kind = Object.freeze({ Warhead: 0, Mirv: 1, Smart: 2 });

// ------------------------------------------------------------------ the board (screen px, y down)
const SubWaves = 8, Domes = 6, Silos = 3;
const TopY = f32(31), GroundY = f32(206), SiloLaunchY = f32(193);
const CrossMinX = f32(12), CrossMaxX = f32(308), CrossMinY = f32(36), CrossMaxY = f32(186);
const SiloX = [f32(36), f32(160), f32(284)];
const DomeX = [f32(70), f32(98), f32(126), f32(194), f32(222), f32(250)];
const DomeRadius = f32(10);
const MaxInterceptors = 8;
const PtsWarhead = 25, PtsMirv = 50, PtsSmart = 125, PtsBomber = 100, PtsDome = 100, PtsShot = 5;

function clampF(v, a, b) { return v < a ? a : v > b ? b : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function add(d, k, v) { d[k] = (d[k] || 0) + v; }

class Missile {
    constructor() {
        this.id = 0; this.k = Kind.Warhead;
        this.x = 0; this.y = 0; this.ox = 0; this.oy = 0;      // the head, start of the current straight leg
        this.ax = 0; this.ay = 0; this.child = false;          // a MIRV child: where its parent's leg began
        this.tx = 0; this.ty = 0; this.target = 0;             // the aim point; 0..5 dome, 6..8 silo
        this.speed = 0; this.vx = 0; this.vy = 0;
        this.splitY = 0; this.age = 0; this.alive = true;
        this.trail = null; this.trailAcc = 0;                  // smart: x,y pairs of its bent path
    }
    get timeToImpact() { return this.vy > 1 ? Math.max(0, (this.ty - this.y) / this.vy) : 99; }
}

class Interceptor {
    constructor() {
        this.x = 0; this.y = 0; this.sx = 0; this.sy = 0; this.tx = 0; this.ty = 0;
        this.vx = 0; this.vy = 0; this.dist = 0; this.travel = 0; this.silo = 0; this.alive = true;
    }
}

class Blast {
    constructor() {
        this.x = 0; this.y = 0; this.age = 0; this.maxR = 0; this.r = 0;
        this.enemy = false;         // a strike on the ground: burns, destroys nothing but its target
        this.shield = false;        // mercy: a strike that burst on the last dome's shield
        this.alive = true;
        this.grow = 0; this.hold = 0; this.shrink = 0;
    }
    get life() { return this.grow + this.hold + this.shrink; }
    // returns [stage, f]: 0 growing, 1 holding, 2 shrinking; f = 0..1 within the stage
    stage() {
        if (this.age < this.grow) return [0, this.grow > 0 ? this.age / this.grow : 1];
        if (this.age < this.grow + this.hold) return [1, this.hold > 0 ? (this.age - this.grow) / this.hold : 1];
        return [2, this.shrink > 0 ? Math.min(1, (this.age - this.grow - this.hold) / this.shrink) : 1];
    }
}

class Bomber {
    constructor() { this.x = 0; this.y = 0; this.vx = 0; this.alive = true; this.dropX = []; this.dropsDone = 0; }
}

class Spawn { constructor() { this.t = 0; this.x = 0; this.what = 0; } }   // what: 0 warhead, 1 MIRV, 2 smart, 3 bomber

export class LastLightRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.bannerSeconds = f32(1.9); this.clearSeconds = f32(2.2); this.fallenSeconds = f32(2.6); this.cardSeconds = f32(3.5);
        this.tallyLead = f32(0.6); this.tallyDomeStep = f32(0.35); this.tallyShotStep = f32(0.06); this.tallyHold = f32(1.4);
        this.reloadSeconds = f32(1.5);
        this.crossMinSpeed = f32(45); this.crossMaxSpeed = f32(230); this.crossAccel = f32(520);
        this.centreSiloMul = f32(1.35);
        this.evadeMargin = f32(20); this.evadeStrength = f32(2.6); this.smartTurn = f32(6);
        this.bomberSpeed = f32(38);

        // read-only state (C# public getters/fields)
        this.p = Phase.Idle; this.phaseTime = 0;
        this.subWave = 0; this.waveTime = 0; this.waveSpeed = 0;
        this.crossX = 160; this.crossY = 110;
        this.domeAlive = new Array(Domes).fill(true);
        this.siloAlive = new Array(Silos).fill(true);
        this.shots = new Array(Silos).fill(0);
        this.reload = new Array(Silos).fill(0);
        this.domeLostAt = new Array(Domes).fill(-1);
        this.siloLostAt = new Array(Silos).fill(-1);
        this.missiles = []; this.interceptors = []; this.blasts = []; this.saucer = null;
        this.domesLeft = Domes; this.silosLeft = Silos;
        this.shotsPerSilo = 0; this.reserveShots = 0;
        this.tallyDomes = 0; this.tallyShots = 0; this.tallyBonus = 0; this.tallyShotsTotal = 0;
        this.blastRadius = 0; this.chainRadius = 0; this.interceptorSpeed = 0;
        this.credit = null;
        this.wavesCleared = 0; this.kills = 0; this.shotsFired = 0;

        // event times for the Lab's key frames (-1 = never happened)
        this.firstMissileT = -1; this.firstBlastT = -1; this.firstShotT = -1; this.firstKillT = -1;
        this.firstSplitT = -1; this.firstSmartT = -1; this.firstBomberT = -1; this.firstBomberDownT = -1;
        this.firstDomeLostT = -1; this.firstClearT = -1; this.tallyT = -1; this.fallenT = -1;
        this.firstShieldT = -1; this.cardT = -1;
        this.bannerAt = new Array(SubWaves).fill(-1);

        this._cues = new CueBuffer();
        this._schedule = [];
        this._log = '';
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._next = 0; this._ids = 0;
        this._time = 0; this._holdTime = 0;
        this._enemies = 0; this._dryFires = 0; this._splits = 0; this._smartKills = 0; this._bomberKills = 0;
        this._refillsUsed = 0; this._silosLost = 0; this._shields = 0; this._hitsArmed = 0; this._hitsDry = 0;

        // knobs, cached
        this._fallMul = 1; this._baseFall = 0; this._waveRamp = 0; this._spawnWindow = 0;
        this._mirvChance = 0; this._mirvStep = 0; this._smarts0 = 0; this._smartStep = 0; this._smartMul = 1;
        this._bomberChance = 0; this._bomberStep = 0; this._missiles0 = 0; this._missileStep = 0;

        this.recordEvents = false; this.events = []; this.pops = []; this.nextLife = 1200; this.boss = null;
        this._resetEvents();
    }

    _emit(kind, o = {}) { if (this.recordEvents) this.events.push({ ...o, kind }); }

    _resetEvents() {
        this.firstMissileT = this.firstBlastT = this.firstShotT = this.firstKillT = -1;
        this.firstSplitT = this.firstSmartT = this.firstBomberT = this.firstBomberDownT = -1;
        this.firstDomeLostT = this.firstClearT = this.tallyT = this.fallenT = this.cardT = this.firstShieldT = -1;
        for (let i = 0; i < SubWaves; i++) this.bannerAt[i] = -1;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Banner: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Clear: case Phase.Fallen: case Phase.Tally: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this.domesLeft; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get shotsLeft() { let n = 0; for (let i = 0; i < Silos; i++) if (this.siloAlive[i]) n += this.shots[i]; return n; }
    get refillsLeft() { return this.reserveShots > 0 ? 1 : 0; }
    get interceptorsInFlight() { let n = 0; for (const c of this.interceptors) if (c.alive) n++; return n; }
    get inbound() {
        let n = 0;
        for (let i = this._next; i < this._schedule.length; i++) n += this._schedule[i].what === 3 ? 0 : 1;
        for (const m of this.missiles) if (m.alive) n++;
        return n;
    }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' domes ' + this.domesLeft + '/6 silos ' + this.silosLeft + '/3 score ' + this._score + ' ' +
            fmt(this._time, 1, F32) + 's kills ' + this.kills + '/' + this._enemies + ' shots ' + this.shotsFired + ' | ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        this._fallMul = k.get('fallSpeed'); this._refillLoads = k.get('refills');
        this._baseFall = k.get('baseFall');
        this._waveRamp = k.get('waveRamp');
        this._spawnWindow = k.get('spawnWindow');
        this._missiles0 = Math.trunc(roundEven(k.get('missiles')));
        this._missileStep = Math.trunc(roundEven(k.get('missileStep')));
        this._mirvChance = k.get('mirvChance');
        this._mirvStep = k.get('mirvStep');
        this._smartMul = k.get('smartMul');
        this.shotsPerSilo = Math.trunc(roundEven(k.get('shots')));
        this.reserveShots = Math.trunc(roundEven(f32(clamp01(k.get('refills')) * this.shotsPerSilo)));
        this.blastRadius = k.get('blastRadius');
        this.chainRadius = k.get('chainRadius');
        this.interceptorSpeed = k.get('interceptorSpeed');

        for (let i = 0; i < Domes; i++) { this.domeAlive[i] = true; this.domeLostAt[i] = -1; }
        for (let i = 0; i < Silos; i++) { this.siloAlive[i] = true; this.shots[i] = this.shotsPerSilo; this.reload[i] = 0; this.siloLostAt[i] = -1; }
        this.domesLeft = Domes; this.silosLeft = Silos;
        this.missiles.length = 0; this.interceptors.length = 0; this.blasts.length = 0; this.saucer = null;
        this._schedule.length = 0; this._next = 0; this._ids = 0;
        this.crossX = 160; this.crossY = 110; this._holdTime = 0;
        this._score = 0; this._time = 0; this._result = RoundResult.None;
        this.kills = 0; this.shotsFired = 0; this.wavesCleared = 0;
        this._enemies = 0; this._dryFires = 0; this._splits = 0; this._smartKills = 0; this._bomberKills = 0;
        this._refillsUsed = 0; this._silosLost = 0; this._shields = 0; this._hitsArmed = 0; this._hitsDry = 0;
        this.tallyDomes = 0; this.tallyShots = 0; this.tallyBonus = 0; this.tallyShotsTotal = 0;
        this._log = '';
        this._resetEvents();
        this._cues.resetTotals();
        this.events.length = 0; this.pops = []; this.nextLife = 1200; this.boss = null;
        this.subWave = this.isDemo ? 3 : 0;
        this._startBanner();
    }

    _startBanner() {
        this.p = Phase.Banner; this.phaseTime = 0; this.waveTime = 0; this.bannerAt[this.subWave] = this._time;
        this.waveSpeed = f32(f32(this._baseFall * this._fallMul) * f32(1 + f32(this._waveRamp * this.subWave)));
        this.siloAlive.fill(true); this.silosLeft = Silos; this.shots.fill(this.shotsPerSilo); this.reload.fill(0);
        this.reserveShots = this.credit.unlosable ? 999 : Math.round(this.shotsPerSilo * this._refillLoads);
        this.missiles = []; this.blasts = []; this.interceptors = []; this.saucer = null;
        this.tallyDomes = 0; this.tallyShots = 0; this.tallyBonus = 0;
        this.boss = this.subWave === 7 ? { x: 160, y: 52, vx: 20, hp: 12, maxHp: 12, cooldown: 0, drop: 3, alive: true } : null;
        this._emit('stageStart', { stage: this.subWave + 1 });
        if (this.boss) this._emit('boss');
        this._buildSchedule(this.subWave);
        this._cues.emit(SoundCue.Tick);
    }

    _buildSchedule(w) {
        this._schedule.length = 0; this._next = 0;
        const n = Math.max(1, this._missiles0 + this._missileStep * w);
        const mirv = w < 1 ? 0 : Math.min(0.35, this._mirvChance + this._mirvStep * w);
        let t = f32(0.6);
        let placed = 0;
        while (placed < n) {
            let v = w < SubWaves - 1 ? 2 + this._rng.next(2) : 3 + this._rng.next(2);
            if (v > n - placed) v = n - placed;
            const x0 = f32(40 + f32(240 * this._rng.nextDouble()));
            for (let i = 0; i < v; i++) {
                const sp = new Spawn();
                sp.t = f32(t + f32(i * 0.15));
                sp.x = clampF(f32(x0 - 24 + f32(48 * this._rng.nextDouble())), 16, 304);
                sp.what = this._rng.nextDouble() < mirv ? 1 : 0;
                this._schedule.push(sp);
            }
            placed += v;
            const gap = f32(f32(this._spawnWindow * v) / n);
            t = f32(t + f32(gap * f32(0.75 + f32(0.5 * this._rng.nextDouble()))));
        }
        const smarts = w < 3 ? 0 : w - 2;
        for (let i = 0; i < smarts; i++) {
            const sp = new Spawn();
            sp.t = f32(this._spawnWindow * f32(0.3 + f32(0.6 * this._rng.nextDouble())));
            sp.x = f32(30 + f32(260 * this._rng.nextDouble()));
            sp.what = 2;
            this._schedule.push(sp);
        }
        if (w >= 2) {
            const sp = new Spawn();
            sp.t = f32(this._spawnWindow * f32(0.15 + f32(0.45 * this._rng.nextDouble())));
            sp.what = 3;
            this._schedule.push(sp);
        }
        if (w >= 4) for (let i = 0; i < 3 + w; i++) {
            const sp = new Spawn(); sp.t = 3 + i * this._spawnWindow / (4 + w); sp.x = 20 + this._rng.next(280);
            sp.what = w === 5 && i % 2 === 0 ? 5 : 4; this._schedule.push(sp);
        }
        if (w === 6) for (let i = 0; i < 3; i++) { const sp = new Spawn(); sp.t = 6 + i * 10; sp.what = 6; this._schedule.push(sp); }
        this._schedule.sort((a, b) => a.t - b.t);
    }

    // ------------------------------------------------------------------ step
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        this.pops = this.pops.filter(p => (p.life -= dt) > 0);
        if (this._score >= this.nextLife && this.domesLeft > 0) {
            this.nextLife += 1200;
            const i = this.domeAlive.indexOf(false);
            if (i >= 0) { this.domeAlive[i] = true; this.domesLeft++; this.pops.push({ x: DomeX[i], y: 176, text: 'DOME REBUILT', life: 2 }); this._emit('extraLife'); }
        }

        if (this.p === Phase.Banner || this.p === Phase.Play || this.p === Phase.Clear) this._moveCrosshair(dt, input);

        switch (this.p) {
            case Phase.Banner:
                if (this.phaseTime >= this.bannerSeconds) { this.p = Phase.Play; this.phaseTime = 0; this.waveTime = 0; this._cues.emit(SoundCue.Start); }
                break;

            case Phase.Play: {
                this.waveTime = f32(this.waveTime + dt);
                if (input != null && input.pressed(Pad.A)) this._fire();
                if (input != null && input.pressed(Pad.B)) { const y = this.crossY; this.crossY = 166; this._fire(); this.crossY = y; }
                this._spawnDue();
                this._updateWorld(dt);
                if (this.domesLeft <= 0) {
                    this.p = Phase.Fallen; this.phaseTime = 0; this.fallenT = this._time;
                    this._log += 'fell w' + (this.subWave + 1) + '@' + fmt(this._time, 1, F32) + ' ';
                } else if (this._next >= this._schedule.length && this._quiet()) {
                    this.wavesCleared++;
                    this._log += 'clear' + (this.subWave + 1) + '@' + fmt(this._time, 1, F32) + ' ';
                    this._emit('stageClear');
                    this.p = Phase.Tally; this.phaseTime = 0; this.tallyT = this._time;
                    this.tallyShotsTotal = this.shotsLeft;
                    if (this.firstClearT < 0) this.firstClearT = this._time;
                }
                break;
            }

            case Phase.Clear:
                if (this.phaseTime >= this.clearSeconds) { this.subWave++; this._startBanner(); }
                break;

            case Phase.Fallen:
                this._updateWorld(dt);
                if (this.phaseTime >= this.fallenSeconds) this._enterCard(RoundResult.Lost);
                break;

            case Phase.Tally:
                this._stepTally();
                break;

            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _enterCard(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0; this.cardT = this._time;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    _stepTally() {
        const t = f32(this.phaseTime - this.tallyLead);
        if (t >= 0) {
            const wantDomes = Math.min(this.domesLeft, Math.trunc(f32(t / this.tallyDomeStep)) + 1);
            while (this.tallyDomes < wantDomes) { this.tallyDomes++; this.tallyBonus += PtsDome; this._score += PtsDome; this._cues.emit(SoundCue.Bonus); }
        }
        const t2 = f32(t - f32(this.domesLeft * this.tallyDomeStep));
        if (t2 >= 0) {
            const wantShots = Math.min(this.tallyShotsTotal, Math.trunc(f32(t2 / this.tallyShotStep)) + 1);
            while (this.tallyShots < wantShots) { this.tallyShots++; this.tallyBonus += PtsShot; this._score += PtsShot; this._cues.emit(SoundCue.Tick); }
        }
        let end = f32(this.tallyLead + f32(this.domesLeft * this.tallyDomeStep));
        end = f32(end + f32(this.tallyShotsTotal * this.tallyShotStep));
        end = f32(end + this.tallyHold);
        if (this.phaseTime >= end) { if (this.subWave === SubWaves - 1) this._enterCard(RoundResult.Won); else { this.subWave++; this._startBanner(); } }
    }

    _quiet() {
        if (this.boss && this.boss.alive) return false;
        for (const m of this.missiles) if (m.alive) return false;
        for (const c of this.interceptors) if (c.alive) return false;
        for (const b of this.blasts) if (b.alive) return false;
        if (this.saucer != null && this.saucer.alive) return false;
        return true;
    }

    _moveCrosshair(dt, input) {
        const sx0 = input != null ? input.x : 0, sy0 = input != null ? f32(-input.y) : 0;
        let mag = f32(Math.sqrt(f32(f32(sx0 * sx0) + f32(sy0 * sy0))));
        if (mag < 0.15) { this._holdTime = 0; return; }
        let sx = sx0, sy = sy0;
        if (mag > 1) { sx = f32(sx / mag); sy = f32(sy / mag); mag = 1; }
        this._holdTime = f32(this._holdTime + dt);
        const speed = Math.min(this.crossMaxSpeed, f32(this.crossMinSpeed + f32(this.crossAccel * this._holdTime)));
        this.crossX = clampF(f32(this.crossX + f32(f32(sx * speed) * dt)), CrossMinX, CrossMaxX);
        this.crossY = clampF(f32(this.crossY + f32(f32(sy * speed) * dt)), CrossMinY, CrossMaxY);
    }

    // the silo A would fire from right now: the nearest standing silo with a shot (-1 = none)
    firingSilo(x) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < Silos; i++) {
            if (!this.siloAlive[i] || this.shots[i] <= 0 || this.reload[i] > 0) continue;
            const d = f32(Math.abs(f32(SiloX[i] - x)) + (i === 1 ? -0.01 : 0));
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }

    siloSpeed(silo) { return f32(this.interceptorSpeed * (silo === 1 ? this.centreSiloMul : 1)); }

    _fire() {
        const s = this.firingSilo(this.crossX);
        if (s < 0 || this.interceptorsInFlight >= MaxInterceptors) { this._dryFires++; this._emit('dry'); this._cues.emit(SoundCue.Miss); return; }
        this.shots[s]--; this._emit('fire', { silo: s });
        this.shotsFired++;
        if (this.firstShotT < 0) this.firstShotT = this._time;
        const sx = SiloX[s], sy = SiloLaunchY;
        const dx = f32(this.crossX - sx), dy = f32(this.crossY - sy);
        const d = Math.max(1, f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy)))));
        const sp = this.siloSpeed(s);
        const c = new Interceptor();
        c.x = sx; c.y = sy; c.sx = sx; c.sy = sy; c.tx = this.crossX; c.ty = this.crossY;
        c.vx = f32(f32(dx / d) * sp); c.vy = f32(f32(dy / d) * sp); c.dist = d; c.silo = s;
        this.interceptors.push(c);
        this._cues.emit(SoundCue.Tick);
        if (this.shots[s] === 0 && this.reserveShots > 0 && this.reload[0] <= 0 && this.reload[1] <= 0 && this.reload[2] <= 0) {
            this._refillsUsed++; this.reload[s] = this.reloadSeconds;
        }
    }

    _spawnDue() {
        while (this._next < this._schedule.length && this._schedule[this._next].t <= this.waveTime) {
            const sp = this._schedule[this._next++];
            if (sp.what === 6) { const m = this._launch(Kind.Warhead, sp.x || 160, 60, this._pickTarget(), this.waveSpeed); m.satellite = true; m.drop = 1.5; m.vx = 24; m.vy = 0; m.ty = 999; continue; }
            if (sp.what === 4 || sp.what === 5) { const m = this._launch(Kind.Warhead, sp.x, TopY, this._pickTarget(), this.waveSpeed * 1.75); m.decoy = sp.what === 5; m.streak = true; continue; }
            if (sp.what === 3) { this._spawnBomber(); continue; }
            const x = sp.x;
            if (sp.what === 2) {
                const m = this._launch(Kind.Smart, x, TopY, this._pickTarget(), f32(this.waveSpeed * this._smartMul));
                m.trail = [m.x, m.y];
                if (this.firstSmartT < 0) this.firstSmartT = this._time;
            } else {
                const m = this._launch(sp.what === 1 ? Kind.Mirv : Kind.Warhead, x, TopY, this._pickTarget(),
                    f32(this.waveSpeed * f32(0.9 + f32(0.2 * this._rng.nextDouble()))));
                if (m.k === Kind.Mirv) m.splitY = f32(78 + f32(50 * this._rng.nextDouble()));
            }
            if (this.firstMissileT < 0) this.firstMissileT = this._time;
        }
    }

    _spawnBomber() {
        const fromLeft = this._rng.nextDouble() < 0.5;
        const b = new Bomber();
        b.x = fromLeft ? 2 : 318;
        b.y = f32(46 + f32(34 * this._rng.nextDouble()));
        b.vx = fromLeft ? this.bomberSpeed : f32(-this.bomberSpeed);
        const drops = 2 + this._rng.next(2);
        b.dropX = new Array(drops);
        for (let i = 0; i < drops; i++) {
            const fr = f32(f32(i + f32(0.3 + f32(0.4 * this._rng.nextDouble()))) / drops);
            b.dropX[i] = fromLeft ? f32(40 + f32(240 * fr)) : f32(280 - f32(240 * fr));
        }
        this.saucer = b; this._emit('bomber');
        if (this.firstBomberT < 0) this.firstBomberT = this._time;
    }

    _launch(k, x, y, target, speed) {
        const m = new Missile();
        m.id = ++this._ids; m.k = k; m.x = x; m.y = y; m.ox = x; m.oy = y; m.ax = x; m.ay = y; m.speed = speed;
        this._aimAt(m, target);
        this.missiles.push(m);
        this._enemies++;
        return m;
    }

    static targetPoint(target) {
        if (target < Domes) return [DomeX[target], f32(GroundY - 6)];
        return [SiloX[target - Domes], f32(SiloLaunchY + 3)];
    }

    targetStanding(target) { return target < Domes ? this.domeAlive[target] : this.siloAlive[target - Domes]; }

    _aimAt(m, target) {
        const p = LastLightRound.targetPoint(target);
        const tx = f32(p[0] + f32(-2 + f32(4 * this._rng.nextDouble())));
        const ty = p[1];
        m.target = target; m.tx = tx; m.ty = ty;
        const dx = f32(tx - m.x), dy = f32(ty - m.y);
        const d = Math.max(1, f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy)))));
        m.vx = f32(f32(dx / d) * m.speed); m.vy = f32(f32(dy / d) * m.speed);
    }

    // standing domes draw the fire, standing silos a little less, rubble hardly at all
    _pickTarget() {
        let total = 0;
        const w = new Array(Domes + Silos);
        for (let i = 0; i < Domes + Silos; i++) {
            const isDome = i < Domes;
            w[i] = this.targetStanding(i) ? (isDome ? 1 : 0.75) : 0.15;
            total = f32(total + w[i]);
        }
        let r = f32(this._rng.nextDouble() * total);
        for (let i = 0; i < w.length; i++) { r = f32(r - w[i]); if (r <= 0) return i; }
        return w.length - 1;
    }

    _updateWorld(dt) {
        const boss = this.boss;
        if (boss && boss.alive) {
            boss.x = f32(boss.x + boss.vx * dt); if (boss.x > 278 || boss.x < 42) boss.vx = -boss.vx;
            boss.cooldown = Math.max(0, boss.cooldown - dt); boss.drop -= dt;
            if (boss.drop <= 0) { boss.drop = 2.8; this._launch(Kind.Warhead, boss.x, boss.y + 8, this._pickTarget(), this.waveSpeed); this._emit('enemyFire'); }
            for (const bl of this.blasts) if (bl.alive && !bl.enemy && !bl.shield && boss.cooldown <= 0 && Math.hypot(boss.x - bl.x, boss.y - bl.y) < bl.r + 16) {
                boss.hp--; boss.cooldown = 0.65; this._emit('bossHit'); this.pops.push({ x: boss.x, y: 70, text: 'HULL HIT', life: 0.5 });
                if (boss.hp <= 0) { boss.alive = false; this._score += 2500; this._addBlast(boss.x, boss.y, 35, false); this._emit('bossDown'); }
            }
            // Emergency reserve keeps the guaranteed credit armed until the hull is broken.
            if (this.credit.unlosable && this.shotsLeft < 6) { this.siloAlive.fill(true); this.silosLeft = 3; this.shots.fill(this.shotsPerSilo); }
        }
        // reloads (mercy)
        for (let i = 0; i < Silos; i++) {
            if (this.reload[i] > 0) {
                this.reload[i] = f32(this.reload[i] - dt);
                if (this.reload[i] <= 0) {
                    this.reload[i] = 0;
                    const load = Math.min(this.reserveShots, this.shotsPerSilo);
                    if (this.siloAlive[i] && load > 0) { this.shots[i] = load; this.reserveShots -= load; this._emit('reload'); this._cues.emit(SoundCue.Bonus); }
                }
            }
        }

        // the bomber
        const b = this.saucer;
        if (b != null && b.alive) {
            b.x = f32(b.x + f32(b.vx * dt));
            if (this.p === Phase.Play && b.dropsDone < b.dropX.length && (b.vx > 0 ? b.x >= b.dropX[b.dropsDone] : b.x <= b.dropX[b.dropsDone])) {
                b.dropsDone++;
                this._launch(Kind.Warhead, b.x, f32(b.y + 3), this._pickTarget(), f32(this.waveSpeed * f32(0.9 + f32(0.2 * this._rng.nextDouble()))));
            }
            if (b.x < -12 || b.x > 332) b.alive = false;
        }

        // enemy missiles
        const n = this.missiles.length;
        for (let i = 0; i < n; i++) {
            const m = this.missiles[i];
            if (!m.alive) continue;
            m.age = f32(m.age + dt);
            if (m.satellite) {
                m.x += m.vx * dt; if (m.x > 295 || m.x < 25) m.vx = -m.vx;
                m.drop -= dt; if (m.drop <= 0) { m.drop = 3; this._launch(Kind.Warhead, m.x, m.y, this._pickTarget(), this.waveSpeed); this._emit('enemyFire'); }
                if (m.age > 14) m.alive = false;
                continue;
            }
            if (m.k === Kind.Smart) this._steerSmart(m, dt);
            else { m.x = f32(m.x + f32(m.vx * dt)); m.y = f32(m.y + f32(m.vy * dt)); }
            if (m.k === Kind.Mirv && m.y >= m.splitY && this.p === Phase.Play) { this._split(m); continue; }
            if (m.y >= m.ty) this._impact(m);
        }

        // interceptors
        for (const c of this.interceptors) {
            if (!c.alive) continue;
            const sp = f32(Math.sqrt(f32(f32(c.vx * c.vx) + f32(c.vy * c.vy))));
            c.travel = f32(c.travel + f32(sp * dt));
            if (c.travel >= c.dist) {
                c.alive = false; c.x = c.tx; c.y = c.ty;
                this._addBlast(c.tx, c.ty, this.blastRadius, false);
                if (this.firstBlastT < 0) this.firstBlastT = this._time;
            } else {
                c.x = f32(c.sx + f32(f32(c.vx / sp) * c.travel));
                c.y = f32(c.sy + f32(f32(c.vy / sp) * c.travel));
            }
        }

        // blasts: grow, hold, shrink; a player blast destroys whatever it touches
        const nb = this.blasts.length;
        for (let i = 0; i < nb; i++) {
            const bl = this.blasts[i];
            if (!bl.alive) continue;
            bl.age = f32(bl.age + dt);
            const st = bl.stage();
            bl.r = st[0] === 0 ? f32(bl.maxR * st[1]) : st[0] === 1 ? bl.maxR : f32(bl.maxR * f32(1 - st[1]));
            if (bl.age >= bl.life) { bl.alive = false; continue; }
            if (bl.enemy || bl.shield) continue;
            const r2 = f32(bl.r * bl.r);
            const nm = this.missiles.length;
            for (let j = 0; j < nm; j++) {
                const m = this.missiles[j];
                if (!m.alive) continue;
                const dx = f32(m.x - bl.x), dy = f32(m.y - bl.y);
                if (f32(f32(dx * dx) + f32(dy * dy)) <= r2) this._kill(m);
            }
            const sb = this.saucer;
            if (sb != null && sb.alive) {
                const dx = f32(sb.x - bl.x), dy = f32(sb.y - bl.y), rr = f32(bl.r + 4);
                if (f32(f32(dx * dx) + f32(dy * dy)) <= f32(rr * rr)) {
                    sb.alive = false; this._emit('bomberDown'); this._bomberKills++; this._score += PtsBomber; this._cues.emit(SoundCue.Bonus);
                    this._addBlast(sb.x, sb.y, f32(this.blastRadius * 0.8), false);
                    if (this.firstBomberDownT < 0) this.firstBomberDownT = this._time;
                }
            }
        }

        // tidy (keep the lists short on long rounds)
        if (this.missiles.length > 64) this.missiles = this.missiles.filter(m => m.alive);
        if (this.interceptors.length > 32) this.interceptors = this.interceptors.filter(c => c.alive);
        if (this.blasts.length > 64) this.blasts = this.blasts.filter(x => x.alive);
    }

    _steerSmart(m, dt) {
        let dx = f32(m.tx - m.x), dy = f32(m.ty - m.y);
        const d = Math.max(0.001, f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy)))));
        let wx = f32(dx / d), wy = f32(dy / d);
        if (f32(m.ty - m.y) > 40) {                          // it commits in the last 40 px
            for (const bl of this.blasts) {
                if (!bl.alive || bl.enemy || bl.shield) continue;
                const bx = f32(m.x - bl.x), by = f32(m.y - bl.y);
                const bd = Math.max(0.001, f32(Math.sqrt(f32(f32(bx * bx) + f32(by * by)))));
                const danger = f32(bl.maxR + this.evadeMargin);
                if (bd >= danger) continue;
                const k = f32(f32(f32(danger - bd) / danger) * this.evadeStrength);
                wx = f32(wx + f32(f32(bx / bd) * k)); wy = f32(wy + f32(f32(by / bd) * k));
            }
        }
        if (wy < 0.2) wy = f32(0.2);                          // it never climbs
        const wl = f32(Math.sqrt(f32(f32(wx * wx) + f32(wy * wy))));
        wx = f32(wx / wl); wy = f32(wy / wl);
        let cx = f32(m.vx / m.speed), cy = f32(m.vy / m.speed);
        const a = Math.min(1, f32(this.smartTurn * dt));
        cx = f32(cx + f32(f32(wx - cx) * a)); cy = f32(cy + f32(f32(wy - cy) * a));
        const cl = Math.max(0.001, f32(Math.sqrt(f32(f32(cx * cx) + f32(cy * cy)))));
        m.vx = f32(f32(cx / cl) * m.speed); m.vy = f32(f32(cy / cl) * m.speed);
        const ox = m.x, oy = m.y;
        m.x = clampF(f32(m.x + f32(m.vx * dt)), 12, 308);
        m.y = f32(m.y + f32(m.vy * dt));
        m.trailAcc = f32(m.trailAcc + f32(Math.sqrt(f32(f32(f32(m.x - ox) * f32(m.x - ox)) + f32(f32(m.y - oy) * f32(m.y - oy))))));
        if (m.trailAcc >= 4 && m.trail != null) { m.trailAcc = 0; m.trail.push(m.x, m.y); }
    }

    _split(m) {
        m.alive = false;
        this._splits++; this._emit('split');
        if (this.firstSplitT < 0) this.firstSplitT = this._time;
        const kids = 2 + (this._rng.nextDouble() < 0.35 ? 1 : 0);
        for (let i = 0; i < kids; i++) {
            const c = this._launch(Kind.Warhead, m.x, m.y, this._pickTarget(), m.speed);
            c.child = true; c.ax = m.ox; c.ay = m.oy;
        }
        this._enemies--;                                      // the carrier itself is not a warhead that lands
    }

    _impact(m) {
        m.alive = false;
        m.y = m.ty;
        if (m.decoy) { this._emit('decoy'); return; }
        const tg = m.target;
        const onTarget = m.k !== Kind.Smart || Math.abs(f32(m.x - m.tx)) <= 8;
        if (onTarget && tg < Domes && this.domeAlive[tg]) {
            if (this.credit.unlosable && this.domesLeft <= 1) {
                // mercy: the last light holds
                this._shields++; this._emit('shield');
                if (this.firstShieldT < 0) this.firstShieldT = this._time;
                const bl = new Blast();
                bl.x = DomeX[tg]; bl.y = GroundY; bl.maxR = f32(DomeRadius + 5); bl.shield = true;
                bl.grow = f32(0.12); bl.hold = f32(0.2); bl.shrink = f32(0.5);
                this.blasts.push(bl);
                this._cues.emit(SoundCue.Miss);
                return;
            }
            this._emit('domeLost'); this.domeAlive[tg] = false; this.domesLeft--; this.domeLostAt[tg] = this._time;
            if (this.shotsLeft > 0) this._hitsArmed++; else this._hitsDry++;
            if (this.firstDomeLostT < 0) this.firstDomeLostT = this._time;
            this._cues.emit(SoundCue.Die);
        } else if (onTarget && tg >= Domes && this.siloAlive[tg - Domes]) {
            const s = tg - Domes;
            this._emit('siloLost'); this.siloAlive[s] = false; this.silosLeft--; this._silosLost++; this.siloLostAt[s] = this._time;
            this.shots[s] = 0;
            if (this.reload[s] > 0) { this.reload[s] = 0; this._refillsUsed--; }   // the reserve waits for the next dry silo
            this._cues.emit(SoundCue.Die);
        }
        this._addBlast(m.x, m.y, 11, true);
    }

    _kill(m) {
        m.alive = false;
        this.kills++; this._emit('hit', { type: m.k });
        this.pops.push({ x: m.x, y: m.y, text: '+' + (m.k === Kind.Smart ? 125 : m.k === Kind.Mirv ? 50 : 25), life: 0.65 });
        const pts = m.k === Kind.Smart ? PtsSmart : m.k === Kind.Mirv ? PtsMirv : PtsWarhead;
        if (m.k === Kind.Smart) this._smartKills++;
        this._score += pts;
        if (this.firstKillT < 0) this.firstKillT = this._time;
        this._cues.emit(SoundCue.Hit);
        this._addBlast(m.x, m.y, this.chainRadius, false);
    }

    _addBlast(x, y, r, enemy) {
        const b = new Blast();
        b.x = x; b.y = y; b.maxR = r; b.enemy = enemy;
        if (enemy) { b.grow = f32(0.22); b.hold = f32(0.18); b.shrink = f32(0.5); }
        else { b.grow = f32(0.42); b.hold = f32(0.25); b.shrink = f32(0.55); }
        this.blasts.push(b); this._emit(enemy ? 'impact' : 'explosion');
    }

    // ------------------------------------------------------------------ stats
    collectStats(into) {
        add(into, 'kills', this.kills);
        add(into, 'enemies', this._enemies);
        add(into, 'shots', this.shotsFired);
        add(into, 'domesLeft', this.domesLeft);
        add(into, 'silosLost', this._silosLost);
        add(into, 'waves', this.wavesCleared);
        add(into, 'splits', this._splits);
        add(into, 'smartKills', this._smartKills);
        add(into, 'bomberKills', this._bomberKills);
        add(into, 'refills', this._refillsUsed);
        add(into, 'dry', this._dryFires);
        add(into, 'shields', this._shields);
        add(into, 'domeHitArmed', this._hitsArmed);
        add(into, 'domeHitDry', this._hitsDry);
    }
}

LastLightRound.Phase = Phase;
LastLightRound.Kind = Kind;
LastLightRound.SubWaves = SubWaves;
LastLightRound.Domes = Domes;
LastLightRound.Silos = Silos;
LastLightRound.TopY = TopY;
LastLightRound.GroundY = GroundY;
LastLightRound.SiloLaunchY = SiloLaunchY;
LastLightRound.CrossMinX = CrossMinX; LastLightRound.CrossMaxX = CrossMaxX;
LastLightRound.CrossMinY = CrossMinY; LastLightRound.CrossMaxY = CrossMaxY;
LastLightRound.SiloX = SiloX; LastLightRound.DomeX = DomeX;
LastLightRound.DomeRadius = DomeRadius; LastLightRound.MaxInterceptors = MaxInterceptors;
LastLightRound.PtsWarhead = PtsWarhead; LastLightRound.PtsMirv = PtsMirv; LastLightRound.PtsSmart = PtsSmart;
LastLightRound.PtsBomber = PtsBomber; LastLightRound.PtsDome = PtsDome; LastLightRound.PtsShot = PtsShot;
