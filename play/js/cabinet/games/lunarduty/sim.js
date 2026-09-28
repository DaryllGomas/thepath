// THE NODE · world 1 · LUNAR DUTY (Anvil & Sparks, 1982) on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of LunarDutySim.cs.
//
// The moon patrol. A six-wheeled buggy rolls right on its own at 72 px/s; the stick eases it
// 25 % slower or faster. A jumps (one fixed arc: 40 px high, 1.0 s in the air). B fires BOTH guns
// at once: a missile straight up (UFOs and their bombs) and a short-range cannon shot straight
// ahead (rocks, tanks, shells; it flies over mines).
//
//   craters   jump them (a fall costs a buggy)
//   rocks     shoot them (50) or jump them; the big ones are taller
//   mines     jump them (the cannon flies over them)
//   UFOs      shoot them (100); their bombs kill, and a bomb that reaches the ground digs a NEW crater
//   tanks     sit ahead and shell the buggy from the right (from 250 px out until it is 90 px
//             away); one cannon hit (200). Shells can be shot or jumped
//
// The course is fixed (course.js): point A to point E, a progress strip in the HUD. Each
// checkpoint pays 500 + a time bonus (100 per whole second under the section's par). A hit or a
// fall costs one of three buggies and restarts the section at the last checkpoint reached. The
// ROUND IS WON AT POINT E; it is lost when the third buggy goes. Never on the clock.
//
// MERCY: the hazardDensity knob thins the course (x0.9 per lost round) and craterWidth narrows the
// craters (x0.92). On the unlosable credit the UFOs never bomb (bombRate = 0) and the buggy wears
// a SHIELD: whatever it hits breaks on it, and it hops a crater by itself. It still has to drive
// all the way to point E.
//
// Phases -> CabinetState: Ready = Intro, Drive = Playing, Crash/Finish = Interlude, Card, Over.
// Cues: Tick = the ready beat and every volley of the guns, Start = GO, Hit = anything shot,
// Miss = a bomb lands and digs a crater, Die = a crash or a fall, Bonus = a checkpoint,
// Win = the point E card. (The jump has no slot of its own.)
import { f32, roundEven, fmt, F32, dn, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { HazardKind, hazardHeight, Hazards, Waves, Checkpoints, Letters, End as CourseEnd, LunarRng } from './course.js';

export const DeathCause = Object.freeze({ None: 0, Crater: 1, Rock: 2, Mine: 3, Tank: 4, Shell: 5, Bomb: 6 });
const DeathCauseNames = ['none', 'crater', 'rock', 'mine', 'tank', 'shell', 'bomb'];

const Phase = Object.freeze({ Idle: 0, Ready: 1, Drive: 2, Crash: 3, Finish: 4, Card: 5, Over: 6 });

export function craterWidth(c) { return f32(c.x1 - c.x0); }
function makeCrater(x0, x1, dug = false) { return { x0: f32(x0), x1: f32(x1), dug, age: 0 }; }
function makeObstacle(kind, x, w, hgt) {
    return { kind, x: f32(x), w: f32(w), hgt: f32(hgt), alive: true, hp: 1, active: false, fireT: 0, hitT: 9,
             center: f32(x + w * 0.5), far: f32(x + w) };
}
function makeShell(x, h) { return { x: f32(x), h: f32(h) }; }
function makeBomb(sx, x, h) { return { sx: f32(sx), x: f32(x), h: f32(h) }; }
function makeMissile(x, h, vx) { return { x: f32(x), h: f32(h), vx: f32(vx) }; }
function makeShot(x, h, vx, start) { return { x: f32(x), h: f32(h), vx: f32(vx), start: f32(start) }; }
function makeBoom(x, h, kind) { return { x: f32(x), h: f32(h), kind, t: 0 }; }

export function craterDepth(width) { return Math.min(13, f32(f32(width * 0.4) + 3)); }

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

export class LunarDutySim {
    constructor() {
        // ------------------------------------------------------------ the machine (not mercy knobs)
        this.groundY = 200; this.skyTop = 48;
        this.buggyHalf = 11; this.buggyTall = 15; this.buggyFront = 17;
        this.upGunX = 8; this.upGunH = 17; this.cannonH = 7;
        this.jumpV = 160; this.gravity = 320;
        this.stickSpeedKnob = 0.25;
        this.baseScreenX = 84; this.screenXSwing = 24;
        this.startLives = 3;
        this.pointsRock = 50; this.pointsUfo = 100; this.pointsTank = 200; this.pointsCheckpoint = 500; this.pointsPerBonusSecond = 100;
        this.parSlack = 5;
        this.readySeconds = 2.2; this.restartReadySeconds = 1.6; this.crashSeconds = 2.0; this.finishSeconds = 2.6; this.cardSeconds = 3.5;
        this.missileSpeed = 250; this.shotSpeed = 250; this.shotRange = 150; this.bombFall = 95; this.shellSpeed = 90;
        this.tankRange = 250; this.tankQuiet = 90;
        this.fireCooldown = 0.18;
        this.maxMissiles = 2; this.maxUfos = 4;
        this.digClear = 40;

        // ------------------------------------------------------------ read-only state
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.x = 0; this.h = 0; this.vh = 0; this.grounded = false;
        this.speed = 0; this.baseSpeed = 0; this.stickSmooth = 0;
        this.camX = 0;
        this.landT = 9; this.shieldT = 9;
        this.checkpoint = 0; this.sectionTime = 0; this.bannerT = 99; this.lastBonus = 0;
        this.cause = DeathCause.None; this.causeDepth = 0;
        this.credit = null;
        this.hazardDensity = 1; this.craterScale = 1; this.bombRate = 0; this.bombAim = 0;
        this.tankInterval = 2.2;

        this.craters = []; this.obstacles = []; this.shells = []; this.bombs = []; this.missiles = []; this.ufos = []; this.booms = [];
        this.fwdShot = null;
        this.readyLen = 0;

        // ------------------------------------------------------------ private
        this._cues = new CueBuffer();
        this._log = [];
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0; this._time = 0;
        this._fireCool = 0;
        this._goCued = false; this._fallBoomed = false;
        this._nextWave = 0;
        this._rng = null;
        this._deaths = 0; this._jumps = 0; this._rocksShot = 0; this._ufosShot = 0; this._tanksShot = 0;
        this._bombsDropped = 0; this._cratersDug = 0; this._shellsFired = 0; this._shieldHits = 0;
        this._deathBy = new Array(7).fill(0);
    }

    // ------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Drive: return CabinetState.Playing;
            case Phase.Crash: case Phase.Finish: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this._lives; }
    get time() { return this._time; }
    get cues() { return this._cues; }
    get screenX() { return f32(this.baseScreenX + f32(this.screenXSwing * this.stickSmooth)); }
    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get progress() { return Math.max(0, Math.min(1, this.x / CourseEnd)); }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        let s = r + ' point ' + Letters[this.checkpoint] + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's lives ' + this._lives;
        if (this._log.length > 0) s += ' deaths: ' + this._log.join(' ');
        return s;
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.baseSpeed = k.get('speed');
        this.hazardDensity = k.get('hazardDensity');
        this.craterScale = k.get('craterWidth');
        this.bombRate = k.get('bombRate');
        this.tankInterval = k.get('tankInterval');
        this.bombAim = k.get('bombAim');
        this._rng = new LunarRng(seed === 0 ? 1 : seed);

        this._score = 0; this._lives = this.startLives; this._time = 0;
        this._result = RoundResult.None;
        this.checkpoint = 0; this.sectionTime = 0; this.bannerT = 99; this.lastBonus = 0;
        this._deaths = this._jumps = this._rocksShot = this._ufosShot = this._tanksShot = 0;
        this._bombsDropped = this._cratersDug = this._shellsFired = this._shieldHits = 0;
        this._deathBy.fill(0);
        this._log.length = 0;
        this._cues.resetTotals();
        this._startSection(this.readySeconds);
    }

    // (re)build the course from the last checkpoint and put the buggy on it
    _startSection(ready) {
        const from = Checkpoints[this.checkpoint];
        this.x = from; this.h = 0; this.vh = 0; this.grounded = true;
        this.stickSmooth = 0; this.speed = this.baseSpeed;
        this.camX = f32(this.x - this.screenX);
        this.landT = 9; this.shieldT = 9;
        this.cause = DeathCause.None; this.causeDepth = 0; this._fallBoomed = false;
        this._fireCool = 0;
        this.craters.length = 0; this.obstacles.length = 0; this.shells.length = 0;
        this.bombs.length = 0; this.missiles.length = 0; this.ufos.length = 0; this.booms.length = 0;
        this.fwdShot = null;
        for (const c of Hazards) {
            if (c.x < from + 20) continue;
            if (c.kind !== HazardKind.Tank && c.rank >= this.hazardDensity) continue;
            if (c.kind === HazardKind.Crater) {
                const w = Math.max(8, f32(c.w * this.craterScale)), mid = f32(c.x + f32(c.w * 0.5));
                this.craters.push(makeCrater(f32(mid - w * 0.5), f32(mid + w * 0.5)));
            } else {
                this.obstacles.push(makeObstacle(c.kind, c.x, c.w, hazardHeight(c.kind)));
            }
        }
        this._nextWave = 0;
        while (this._nextWave < Waves.length && Waves[this._nextWave].triggerX <= from + 1) this._nextWave++;
        this.p = Phase.Ready; this.phaseTime = 0; this.readyLen = ready; this._goCued = false;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > 0.1) dt = 0.1;
        if (dt <= 0) return;
        this._time = f32(this._time + dt); this.phaseTime = f32(this.phaseTime + dt);
        this.bannerT = f32(this.bannerT + dt); this.shieldT = f32(this.shieldT + dt); this.landT = f32(this.landT + dt);
        for (let i = this.booms.length - 1; i >= 0; i--) {
            this.booms[i].t = f32(this.booms[i].t + dt);
            if (this.booms[i].t > 1.2) this.booms.splice(i, 1);
        }
        for (const c of this.craters) if (c.dug) c.age = f32(c.age + dt);

        switch (this.p) {
            case Phase.Ready:
                if (!this._goCued && this.phaseTime >= this.readyLen - 0.5) { this._goCued = true; this._cues.emit(SoundCue.Start); }
                if (this.phaseTime >= this.readyLen) { this.p = Phase.Drive; this.phaseTime = 0; }
                break;

            case Phase.Drive:
                this._drive(dt, input);
                break;

            case Phase.Crash:
                // the world keeps flying; nothing can touch the wreck
                this._updateShots(dt);
                this._updateUfos(dt, false);
                this._updateBombs(dt, false);
                this._updateShells(dt);
                if (this.cause === DeathCause.Crater && !this._fallBoomed && this.phaseTime >= 0.35) {
                    this._fallBoomed = true;
                    this.booms.push(makeBoom(this.x, f32(-this.causeDepth + 4), 2));
                }
                if (this.phaseTime >= this.crashSeconds) {
                    if (this._lives <= 0) this._enterCard(RoundResult.Lost);
                    else this._startSection(this.restartReadySeconds);
                }
                break;

            case Phase.Finish:
                // past point E: the buggy rolls on, the UFOs peel away
                this.speed = this.baseSpeed;
                this.stickSmooth = f32(this.stickSmooth + f32(f32(0 - this.stickSmooth) * Math.min(1, f32(dt * 3))));
                this.x = f32(this.x + f32(this.speed * dt));
                this._air(dt);
                this.camX = f32(this.x - this.screenX);
                for (const u of this.ufos) if (u.mode !== 2) u.mode = 2;
                this._updateShots(dt);
                this._updateUfos(dt, false);
                this._updateBombs(dt, false);
                this._updateShells(dt);
                if (this.phaseTime >= this.finishSeconds) this._enterCard(RoundResult.Won);
                break;

            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _enterCard(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    // ------------------------------------------------------------ the drive
    _drive(dt, input) {
        this.sectionTime = f32(this.sectionTime + dt);
        let stick = input != null ? Math.max(-1, Math.min(1, input.x)) : 0;
        if (stick > -0.3 && stick < 0.3) stick = 0;
        const k = Math.min(1, f32(dt * 2.5));
        this.stickSmooth = f32(this.stickSmooth + f32(f32(stick - this.stickSmooth) * k));
        this.speed = f32(this.baseSpeed * f32(1 + f32(this.stickSpeedKnob * this.stickSmooth)));

        if (input != null && input.pressed(Pad.A) && this.grounded) {
            this.grounded = false; this.vh = this.jumpV; this.h = 0.01; this._jumps++;
        }
        this._fireCool = f32(this._fireCool - dt);
        if (input != null && input.pressed(Pad.B) && this._fireCool <= 0) {
            this._fireCool = this.fireCooldown;
            let fired = false;
            if (this.missiles.length < this.maxMissiles) {
                this.missiles.push(makeMissile(f32(this.x + this.upGunX), f32(this.h + this.upGunH), this.speed));
                fired = true;
            }
            if (this.fwdShot === null) {
                const start = f32(this.x + this.buggyFront);
                this.fwdShot = makeShot(start, f32(this.h + this.cannonH), f32(this.speed + this.shotSpeed), start);
                fired = true;
            }
            if (fired) this._cues.emit(SoundCue.Tick);
        }

        this.x = f32(this.x + f32(this.speed * dt));
        this._air(dt);
        this.camX = f32(this.x - this.screenX);

        // UFO waves
        while (this._nextWave < Waves.length && Waves[this._nextWave].triggerX <= this.x) {
            this._spawnWave(Waves[this._nextWave]);
            this._nextWave++;
        }

        this._updateShots(dt);
        this._updateUfos(dt, true);
        this._updateTanks(dt);
        this._updateShells(dt);
        this._updateBombs(dt, true);
        if (this.p !== Phase.Drive) return;           // a bomb landed on the buggy

        // the mercy credit hops craters by itself
        if (this.mercyActive && this.grounded)
            for (const c of this.craters) {
                if (c.x1 < this.x - 20) continue;
                if (c.x0 > this.x + 40) break;
                if (craterWidth(c) >= 10 && this.x + 6 >= c.x0 && this.x < c.x1 - 5) {
                    this.grounded = false; this.vh = this.jumpV; this.h = 0.01; this.shieldT = 0; this._shieldHits++; break;
                }
            }

        this._collide();
        if (this.p !== Phase.Drive) return;

        // checkpoints
        const next = this.checkpoint + 1;
        if (next < Checkpoints.length && this.x >= Checkpoints[next]) this._reach(next);
        this._cull();
    }

    _air(dt) {
        if (this.grounded) return;
        this.h = f32(this.h + f32(this.vh * dt));
        this.vh = f32(this.vh - f32(this.gravity * dt));
        if (this.h <= 0) { this.h = 0; this.vh = 0; this.grounded = true; this.landT = 0; }
    }

    _reach(i) {
        const len = f32(Checkpoints[i] - Checkpoints[i - 1]);
        const par = f32(f32(len / Math.max(1, this.baseSpeed)) + this.parSlack);
        const bonus = Math.max(0, Math.floor(f32(par - this.sectionTime))) * this.pointsPerBonusSecond;
        this._score += this.pointsCheckpoint + bonus;
        this.lastBonus = bonus;
        this.checkpoint = i;
        this.bannerT = 0;
        this.sectionTime = 0;
        this._cues.emit(SoundCue.Bonus);
        if (i === Checkpoints.length - 1) { this.p = Phase.Finish; this.phaseTime = 0; }
    }

    // ------------------------------------------------------------ the world
    _spawnWave(w) {
        let slot = 0;
        for (let i = 0; i < w.ranks.length; i++) {
            if (w.ranks[i] >= this.hazardDensity) continue;
            if (this.ufos.length >= this.maxUfos) break;
            const u = {
                slot,
                sx: f32(f32(-20) - f32(30 * slot)),
                sy: f32(60 + 12 * slot),
                ax: f32(f32(80 + 60 * slot) + this._rng.range(-20, 20)),
                ay: f32(70 + this._rng.range(0, 40)),
                phase: this._rng.range(0, 6.283),
                life: this._rng.range(9, 12.5),
                drift: this._rng.chance(0.5) ? 14 : -14,
                bombT: this._rng.range(1.0, 2.0),
                mode: 0,
                t: 0,
            };
            this.ufos.push(u);
            slot++;
        }
    }

    _updateUfos(dt, armed) {
        for (let i = this.ufos.length - 1; i >= 0; i--) {
            const u = this.ufos[i];
            u.t = f32(u.t + dt);
            if (u.mode === 0) {
                const tx = f32(u.ax + f32(36 * Math.sin(u.phase))), ty = u.ay;
                const dx = f32(tx - u.sx), dy = f32(ty - u.sy), d = f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy))));
                const step = f32(130 * dt);
                if (d <= step + 0.5) { u.sx = tx; u.sy = ty; u.mode = 1; u.t = 0; }
                else { u.sx = f32(u.sx + f32(dx / d * step)); u.sy = f32(u.sy + f32(dy / d * step)); }
            } else if (u.mode === 1) {
                u.ax = f32(u.ax + f32(u.drift * dt));
                if (u.ax < 60) u.drift = Math.abs(u.drift);
                if (u.ax > 260) u.drift = -Math.abs(u.drift);
                u.sx = f32(u.ax + f32(36 * Math.sin(f32(f32(1.3 * u.t) + u.phase))));
                u.sy = f32(u.ay + f32(12 * Math.sin(f32(f32(2.6 * u.t) + u.phase))));
                u.life = f32(u.life - dt);
                if (u.life <= 0) u.mode = 2;
                if (armed && this.bombRate > 0) {
                    u.bombT = f32(u.bombT - f32(dt * this.bombRate));
                    if (u.bombT <= 0) {
                        // a bomb falls straight down the screen (it keeps pace, like its UFO). Most are let go
                        // well ahead, to dig a crater in the road; some are dropped right over the buggy.
                        const bsx = f32(u.sx + 8), bh = f32(f32(this.groundY - u.sy) - 10);
                        const lead = f32(bsx - this.screenX);
                        const aimed = this._rng.chance(this.bombAim);
                        if ((aimed && lead > -8 && lead < 8) || (!aimed && lead > 40 && lead < 150)) {
                            this.bombs.push(makeBomb(bsx, f32(this.camX + bsx), bh));
                            this._bombsDropped++;
                            u.bombT = this._rng.range(1.7, 2.8);
                        } else u.bombT = 0.2;
                    }
                }
            } else {
                u.sx = f32(u.sx + f32(120 * dt)); u.sy = f32(u.sy - f32(55 * dt));
                if (u.sx > 340 || u.sy < 30) { this.ufos.splice(i, 1); continue; }
            }
        }
    }

    _updateShots(dt) {
        for (let i = this.missiles.length - 1; i >= 0; i--) {
            const m = this.missiles[i];
            m.x = f32(m.x + f32(m.vx * dt)); m.h = f32(m.h + f32(this.missileSpeed * dt));
            let gone = m.h > f32(f32(this.groundY - this.skyTop) + 8);
            if (!gone)
                for (let j = this.ufos.length - 1; j >= 0; j--) {
                    const u = this.ufos[j];
                    const ux = f32(f32(this.camX + u.sx) + 8), uh = f32(f32(this.groundY - u.sy) - 4);
                    if (Math.abs(m.x - ux) < 9 && Math.abs(m.h - uh) < 7) {
                        this.booms.push(makeBoom(ux, uh, 1));
                        this.ufos.splice(j, 1); gone = true;
                        if (this.p === Phase.Drive) { this._score += this.pointsUfo; this._ufosShot++; this._cues.emit(SoundCue.Hit); }
                        break;
                    }
                }
            if (!gone)
                for (let j = this.bombs.length - 1; j >= 0; j--) {
                    const b = this.bombs[j];
                    if (Math.abs(m.x - b.x) < 6 && Math.abs(m.h - b.h) < 6) {
                        this.booms.push(makeBoom(b.x, b.h, 0));
                        this.bombs.splice(j, 1); gone = true;
                    }
                }
            if (gone) this.missiles.splice(i, 1);
        }

        const s = this.fwdShot;
        if (s !== null) {
            s.x = f32(s.x + f32(s.vx * dt));
            let gone = f32(s.x - s.start) > this.shotRange;
            if (!gone)
                for (const o of this.obstacles) {
                    if (!o.alive || o.kind === HazardKind.Mine) continue;
                    if (o.x > s.x + 4) break;
                    if (s.x + 3 > o.x && s.x - 3 < o.far && s.h - 1 < o.hgt) {
                        gone = true;
                        o.hp--; o.hitT = 0;
                        if (o.hp <= 0) {
                            o.alive = false;
                            this.booms.push(makeBoom(o.center, f32(o.hgt * 0.5), o.kind === HazardKind.Tank ? 5 : 0));
                            if (this.p === Phase.Drive) {
                                if (o.kind === HazardKind.Tank) { this._score += this.pointsTank; this._tanksShot++; }
                                else { this._score += this.pointsRock; this._rocksShot++; }
                                this._cues.emit(SoundCue.Hit);
                            }
                        }
                        break;
                    }
                }
            if (!gone)
                for (let j = this.shells.length - 1; j >= 0; j--) {
                    const sh = this.shells[j];
                    if (Math.abs(s.x - sh.x) < 6 && Math.abs(s.h - sh.h) < 3) {
                        this.booms.push(makeBoom(sh.x, sh.h, 0));
                        this.shells.splice(j, 1); gone = true;
                    }
                }
            if (gone) this.fwdShot = null;
        }
    }

    _updateTanks(dt) {
        for (const o of this.obstacles) {
            if (o.kind !== HazardKind.Tank) continue;
            o.hitT = f32(o.hitT + dt);
            if (!o.alive) continue;
            const ahead = f32(o.x - this.x);
            if (ahead > this.tankRange) break;
            if (!o.active) { o.active = true; o.fireT = 0.7; }
            o.fireT = f32(o.fireT - dt);
            if (o.fireT <= 0 && ahead > this.tankQuiet) {
                this.shells.push(makeShell(f32(o.x - 4), 7));
                this._shellsFired++;
                o.fireT = f32(this.tankInterval * this._rng.range(0.85, 1.15));
            }
        }
    }

    _updateShells(dt) {
        for (let i = this.shells.length - 1; i >= 0; i--) {
            this.shells[i].x = f32(this.shells[i].x - f32(this.shellSpeed * dt));
            if (this.shells[i].x < this.camX - 20) this.shells.splice(i, 1);
        }
    }

    _updateBombs(dt, armed) {
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const b = this.bombs[i];
            b.h = f32(b.h - f32(this.bombFall * dt));
            if (this.p === Phase.Drive || this.p === Phase.Finish) b.x = f32(this.camX + b.sx); else b.sx = f32(b.x - this.camX);
            if (armed && this.p === Phase.Drive && this._hitsBuggy(b.x - 2, b.x + 2, b.h - 3, b.h + 3)) {
                this.bombs.splice(i, 1);
                if (!this._shielded(b.x, b.h)) { this._die(DeathCause.Bomb, 0); return; }
                continue;
            }
            if (b.h > 0) continue;
            this.bombs.splice(i, 1);
            this.booms.push(makeBoom(b.x, 0, 3));
            this._dig(b.x);
        }
    }

    _dig(x) {
        let half = f32(11 * this.craterScale);
        if (half < 5) half = 5;
        const x0 = f32(x - half), x1 = f32(x + half);
        // a bomb never digs where it would leave no room to land: 40 px clear of anything on the road
        for (const cp of Checkpoints) if (x1 > cp - 24 && x0 < cp + 24) return;
        for (const o of this.obstacles) if (o.alive && x1 > o.x - this.digClear && x0 < o.far + this.digClear) return;
        for (const c of this.craters) if (x1 > c.x0 - this.digClear && x0 < c.x1 + this.digClear) return;
        let at = 0;
        while (at < this.craters.length && this.craters[at].x0 < x0) at++;
        this.craters.splice(at, 0, makeCrater(x0, x1, true));
        this._cratersDug++;
        this._cues.emit(SoundCue.Miss);
    }

    // ------------------------------------------------------------ the buggy against the moon
    _hitsBuggy(x0, x1, h0, h1) {
        return x1 > this.x - this.buggyHalf && x0 < this.x + this.buggyHalf && h1 > this.h && h0 < this.h + this.buggyTall;
    }

    // the mercy shield: whatever touches the buggy on the unlosable credit breaks on it
    _shielded(x, h) {
        if (!this.mercyActive) return false;
        this.shieldT = 0; this._shieldHits++;
        this.booms.push(makeBoom(x, h, 4));
        return true;
    }

    _collide() {
        for (const o of this.obstacles) {
            if (!o.alive) continue;
            if (o.x > this.x + this.buggyHalf) break;
            if (o.far < this.x - this.buggyHalf) continue;
            if (this.x + this.buggyHalf > o.x + 1 && this.x - this.buggyHalf < o.far - 1 && this.h < o.hgt - 1) {
                if (this._shielded(o.center, f32(o.hgt * 0.5))) { o.alive = false; continue; }
                this._die(o.kind === HazardKind.Mine ? DeathCause.Mine : o.kind === HazardKind.Tank ? DeathCause.Tank : DeathCause.Rock, 0);
                return;
            }
        }
        for (let i = this.shells.length - 1; i >= 0; i--) {
            const s = this.shells[i];
            if (this._hitsBuggy(s.x - 3, s.x + 3, s.h - 1.5, s.h + 1.5)) {
                this.shells.splice(i, 1);
                if (this._shielded(s.x, s.h)) continue;
                this._die(DeathCause.Shell, 0);
                return;
            }
        }
        if (!this.grounded) return;
        for (const c of this.craters) {
            if (c.x1 < this.x - 20) continue;
            if (c.x0 > this.x + 20) break;
            if (craterWidth(c) >= 10 && this.x > c.x0 + 5 && this.x < c.x1 - 5) {
                if (this.mercyActive) { this.grounded = false; this.vh = this.jumpV; this.h = 0.01; this.shieldT = 0; this._shieldHits++; return; }
                this._die(DeathCause.Crater, craterDepth(craterWidth(c)));
                return;
            }
        }
    }

    _die(cause, depth) {
        this.cause = cause; this.causeDepth = depth;
        this.p = Phase.Crash; this.phaseTime = 0;
        this._lives--; this._deaths++; this._deathBy[cause]++;
        this.fwdShot = null;
        if (cause !== DeathCause.Crater) this.booms.push(makeBoom(this.x, f32(this.h + 6), 2));
        this._cues.emit(SoundCue.Die);
        this._log.push(DeathCauseNames[cause] + '@' + Math.trunc(this.x));
    }

    _cull() {
        const left = f32(this.camX - 60);
        while (this.craters.length > 0 && this.craters[0].x1 < left) this.craters.shift();
        while (this.obstacles.length > 0 && this.obstacles[0].far < left) this.obstacles.shift();
    }

    // ------------------------------------------------------------ stats
    collectStats(into) {
        add(into, 'deaths', this._deaths);
        add(into, 'd_crater', this._deathBy[DeathCause.Crater]);
        add(into, 'd_rock', this._deathBy[DeathCause.Rock]);
        add(into, 'd_mine', this._deathBy[DeathCause.Mine]);
        add(into, 'd_tank', this._deathBy[DeathCause.Tank]);
        add(into, 'd_shell', this._deathBy[DeathCause.Shell]);
        add(into, 'd_bomb', this._deathBy[DeathCause.Bomb]);
        add(into, 'jumps', this._jumps);
        add(into, 'rocksShot', this._rocksShot);
        add(into, 'ufosShot', this._ufosShot);
        add(into, 'tanksShot', this._tanksShot);
        add(into, 'bombs', this._bombsDropped);
        add(into, 'dug', this._cratersDug);
        add(into, 'shells', this._shellsFired);
        add(into, 'point', this.checkpoint);
        if (this._shieldHits > 0) add(into, 'shield', this._shieldHits);
    }
}

LunarDutySim.Phase = Phase;
