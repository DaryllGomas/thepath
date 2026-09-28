// THE NODE · world 1 · NEBULA RUN (Sunward Amusements, 1983) on the Cabinet Engine · THE ROUND.
// Port of Staging/Batch4/nebularun/Games/NebulaRun/NebulaRunSim.cs (ICabinetSim). Plain doubles, not
// f32: there is no C# CabinetLab bench for this game to match bit for bit (it was written but never
// run through the Lab). A seed still plays the same round every time (the determinism check).
//
// A vertical scroller over a nebula-lit ground, two layers like the board it pays homage to:
//   AIR     spinners (100), darts (150) and the rotating disc ship (200, three hits). Button A is
//           the air gun: fast shots up the tube, three on screen, held = auto-fire.
//   GROUND  silos (200), turrets that fire back (300), the crawling tank (400), the fuel dump (500).
//           Button B drops a bomb at the SIGHT, a fixed 64 px ahead of the ship; it lands 0.42 s
//           later on whatever was under the sight when it left. One bomb in the air at a time.
//           The sight turns red (in the picture) when a ground target sits under it.
// The sector is ~scrollSpeed x sectorSeconds of scroll. At its end the scroll stops under the
// FORTRESS: four turret cores (two bombs each, 500 each) around a radar. Each revolution of the
// radar is a PASS; a live core fires an aimed shot as the sweep crosses it. Destroy all four:
// +5000 and the round is WON. A ship dies to any air body or shot (air or ground); a lost ship
// respawns at the last checkpoint (the sector's quarters and the fortress approach). Destroyed
// cores stay destroyed; ground targets past the checkpoint are re-armed.
//
// MERCY (knobs, eased per loss on this cabinet): interceptor spawns and fire chance ease down,
// the radar turns slower, turrets and shots ease off, and ships eases UP (see spec.js). On the
// unlosable credit (5) the sim's own rule: the SHIELD is on (a hit only flashes it; the ship
// cannot die) and the fortress fires once per pass. The round is still won only by destroying it.
import { RoundResult, CabinetState, SoundCue, CueBuffer, Pad, SystemRandom, fmt } from '../../sdk/index.js';
import { NebulaScroll } from './scroll.js';

export const AirKind = Object.freeze({ Spinner: 0, Dart: 1, Disc: 2 });
export const GroundKind = Object.freeze({ Silo: 0, Turret: 1, Tank: 2, Fuel: 3, Core: 4 });
const Phase = Object.freeze({ Idle: 0, Intro: 1, Playing: 2, ShipLost: 3, BossDown: 4, Card: 5, Over: 6 });

export function airRadius(e) { return e.kind === AirKind.Disc ? 11 : e.kind === AirKind.Dart ? 6 : 7; }
export function airPoints(e) { return e.kind === AirKind.Disc ? 200 : e.kind === AirKind.Dart ? 150 : 100; }

export function groundRadius(g) {
    switch (g.kind) {
        case GroundKind.Silo: return 8;
        case GroundKind.Turret: return 9;
        case GroundKind.Tank: return 9;
        case GroundKind.Fuel: return 11;
        default: return 10;                 // the fortress core
    }
}

export function groundPoints(g) {
    switch (g.kind) {
        case GroundKind.Silo: return 200;
        case GroundKind.Turret: return 300;
        case GroundKind.Tank: return 400;
        default: return 500;                // fuel dump, fortress core
    }
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class NebulaRunRound {
    constructor() {
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.credit = null;
        this.scroll = new NebulaScroll();
        this.mapSeed = 0;
        this.sectorLength = 0;
        this.fortMapY = 0;
        this.shipX = 160; this.shipY = 196;
        this.invuln = 0; this.shieldFlash = 0;
        this.shipDown = false; this.firing = false;
        this.ships = 3;
        this.firstIntro = false;
        this.coresLeft = 4;
        this.bossPhase = 0; this.bossPasses = 0;
        this.sightLocked = false;

        this.bombActive = false; this.bombT = 0;
        this.bombSX = 0; this.bombSY = 0; this.bombTX = 0; this.bombTMapY = 0;

        this.air = []; this.ground = []; this.shots = []; this.bullets = [];
        this.bursts = []; this.popups = []; this.sites = [];

        // knobs (resolved for this credit)
        this.scrollSpeed = 24; this.airRate = 0.6; this.bossPass = 2.4; this.turretGap = 2.2;
        this.shotSpeed = 105; this.dartSpeed = 150; this.airFire = 0.45; this.discGap = 1.6;

        this.lastGroundKillTime = -99; this.lastGroundKillKind = 0;
        this.lastCoreKillTime = -99; this.lastDeathCause = 0;

        this._cues = new CueBuffer();
        this.rng = new SystemRandom(1);
        this.result = RoundResult.None;
        this.score = 0;
        this.time = 0;
        this._nextId = 1;
        this._firedThisPass = 0;
        this._input = null;
        this._introLen = 0;

        // stats
        this.deaths = 0; this._deathRam = 0; this._deathAirShot = 0; this._deathGroundShot = 0; this._deathBoss = 0;
        this.airKills = 0; this.groundKills = 0; this._bombs = 0; this._bombHits = 0;
        this._shieldHits = 0; this._tankKills = 0; this._discKills = 0; this._bossSeconds = 0;
        this._fireCd = 0; this._spawnAcc = 0; this._sinceSpawn = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get bossZone() { return this.scroll.pos >= this.sectorLength - 110; }
    get bossLive() { return this.scroll.parked && this.coresLeft > 0; }
    get sightX() { return this.shipX; }
    get sightY() { return this.shipY - NebulaRunRound.SightDist; }
    get roundWon() { return this.result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Intro: return CabinetState.Intro;
            case Phase.Playing: return CabinetState.Playing;
            case Phase.ShipLost: case Phase.BossDown: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get lives() { return this.ships; }
    get cues() { return this._cues; }

    get summary() {
        const r = this.result === RoundResult.Won ? 'WON' : this.result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this.score + ' ' + fmt(this.time, 1) + 's deaths ' + this.deaths +
            ' (ram ' + this._deathRam + ' air ' + this._deathAirShot + ' gnd ' + this._deathGroundShot + ' fort ' + this._deathBoss + ')' +
            ' air ' + this.airKills + ' gnd ' + this.groundKills + ' bombs ' + this._bombHits + '/' + this._bombs +
            ' cores ' + (4 - this.coresLeft) + ' reached ' + Math.round(this.scroll.progress * 100) + '%';
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        this.mapSeed = this.rng.next(1, 2147483647);

        this.scrollSpeed = k.get('scrollSpeed');
        this.sectorLength = this.scrollSpeed * k.get('sectorSeconds');
        this.airRate = k.get('airRate');
        this.bossPass = k.get('bossPass');
        this.turretGap = k.get('turretGap');
        this.shotSpeed = k.get('shotSpeed');
        this.dartSpeed = k.get('dartSpeed');
        this.airFire = k.get('airFire');
        this.discGap = k.get('discGap');

        this.scroll.setup(this.scrollSpeed, this.sectorLength);
        const L = this.sectorLength;
        this.scroll.checkpoints.push(0, Math.round(L * 0.25), Math.round(L * 0.5), Math.round(L * 0.75), L - 110);
        this.fortMapY = L + (NebulaScroll.FieldBottom - NebulaRunRound.FortParkScreenY);

        this.air.length = 0; this.ground.length = 0; this.shots.length = 0; this.bullets.length = 0;
        this.bursts.length = 0; this.popups.length = 0; this.sites.length = 0;
        this._nextId = 1;
        this._buildMap();

        this.score = 0; this.time = 0; this.result = RoundResult.None;
        this.ships = Math.round(k.get('startShips', 3));
        this.deaths = this._deathRam = this._deathAirShot = this._deathGroundShot = this._deathBoss = 0;
        this.airKills = this.groundKills = this._bombs = this._bombHits = 0;
        this._shieldHits = this._tankKills = this._discKills = 0; this._bossSeconds = 0;
        this.lastGroundKillTime = -99; this.lastCoreKillTime = -99; this.lastDeathCause = 0;
        this.coresLeft = 4; this.bossPhase = 0; this.bossPasses = 0; this._firedThisPass = 0;
        this._cues.resetTotals();
        this.firstIntro = true;
        this._placeShip();
        this._enterIntro(NebulaRunRound.FirstIntroSeconds);
    }

    _enterIntro(seconds) {
        this.p = Phase.Intro; this.phaseTime = 0; this._introLen = seconds;
        this._cues.emit(SoundCue.Tick);
    }

    _placeShip() {
        this.shipX = 160; this.shipY = 196; this.shipDown = false; this.invuln = 0; this.shieldFlash = 0;
        this.bombActive = false; this.bullets.length = 0; this._fireCd = 0; this._spawnAcc = 0; this._sinceSpawn = 0;
    }

    // ------------------------------------------------------------------ the ground map
    _buildMap() {
        const L = this.sectorLength;
        const tankAt = [0.28, 0.60], fuelAt = [0.44, 0.82];
        let ti = 0, fi = 0, y = 250;
        while (y < L - 130) {
            const p = y / L;
            let kind;                                   // 0 silos, 1 turret, 2 turret+silo, 3 tank, 4 fuel
            if (ti < tankAt.length && p >= tankAt[ti]) { kind = 3; ti++; }
            else if (fi < fuelAt.length && p >= fuelAt[fi]) { kind = 4; fi++; }
            else {
                const r = this.rng.nextDouble();
                kind = r < 0.40 ? 0 : r < 0.76 ? 1 : 2;
            }
            const cx = this._range(64, 256);
            switch (kind) {
                case 0: {
                    const n = this.rng.nextDouble() < 0.5 ? 2 : 3;
                    const x0 = cx - (n - 1) * 14;
                    for (let i = 0; i < n; i++) this._addGround(GroundKind.Silo, x0 + i * 28, y + (i % 2 === 0 ? 0 : 6));
                    this._addSite(0, cx, y + 3, n * 28 + 14, 34);
                    break;
                }
                case 1:
                    this._addGround(GroundKind.Turret, cx, y);
                    this._addSite(0, cx, y, 36, 36);
                    break;
                case 2:
                    this._addGround(GroundKind.Turret, cx - 20, y);
                    this._addGround(GroundKind.Silo, cx + 20, y - 2);
                    this._addSite(0, cx, y, 76, 36);
                    break;
                case 3: {
                    const g = this._addGround(GroundKind.Tank, this._range(70, 250), y);
                    g.minX = 36; g.maxX = 284;
                    g.homeVx = g.vx = this.rng.nextDouble() < 0.5 ? -18 : 18;
                    this._addSite(1, 160, y, 268, 16);
                    break;
                }
                default: {
                    this._addGround(GroundKind.Fuel, cx, y);
                    if (p > 0.5) {
                        const gx = cx < 160 ? cx + 40 : cx - 40;
                        this._addGround(GroundKind.Turret, gx, y + 4);
                        this._addSite(0, (cx + gx) * 0.5, y + 2, 86, 40);
                    } else this._addSite(0, cx, y, 44, 40);
                    break;
                }
            }
            y += this._range(62, 90);
        }

        // the fortress
        this._addSite(2, 160, this.fortMapY, 196, 84);
        for (let i = 0; i < 4; i++) {
            const c = this._addGround(GroundKind.Core, 160 + NebulaRunRound.CoreDX[i], this.fortMapY + NebulaRunRound.CoreDY[i]);
            c.coreIndex = i;
            c.maxHp = c.hp = 2;
            // the radar (sweeping clockwise on the tube from straight up) crosses this core at:
            let a = Math.atan2(-NebulaRunRound.CoreDY[i], NebulaRunRound.CoreDX[i]) * 180 / Math.PI + 90;
            if (a < 0) a += 360;
            c.firePhase = a / 360;
        }
    }

    _addGround(kind, x, mapY) {
        const g = {
            id: this._nextId++, kind, x, homeX: x, mapY, vx: 0, homeVx: 0, minX: 0, maxX: 0,
            hp: 1, maxHp: 1, coreIndex: -1, alive: true, armed: false,
            fireT: 0, hitFlash: 0, deadT: 0, fireFlash: 0, firePhase: 0,
        };
        g.fireT = this.turretGap * this._range(0.4, 0.9);
        this.ground.push(g);
        return g;
    }

    _addSite(kind, x, mapY, w, h) { this.sites.push({ kind, x, mapY, w, h }); }

    _range(a, b) { return a + (b - a) * this.rng.nextDouble(); }

    // ------------------------------------------------------------------ stepping
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (!(dt > 0)) return;
        this._input = input;
        const bPress = input != null && input.pressed(Pad.B);
        const n = Math.max(1, Math.ceil(dt / NebulaRunRound.SubStep - 1e-4));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            this._sub(h, i === 0 && bPress);
            if (this.p === Phase.Over) break;
        }
    }

    _sub(h, bPress) {
        this.time += h;
        this.phaseTime += h;
        switch (this.p) {
            case Phase.Intro:
                this._updateFx(h);
                if (this.phaseTime >= this._introLen) {
                    this.p = Phase.Playing; this.phaseTime = 0; this.firstIntro = false;
                    this._cues.emit(SoundCue.Start);
                }
                break;
            case Phase.Playing:
                this._play(h, bPress);
                break;
            case Phase.ShipLost:
                this._moveAir(h, false);
                this._moveShots(h);
                this._updateFx(h);
                if (this.phaseTime >= NebulaRunRound.LostSeconds) {
                    if (this.ships <= 0) this._enterCard(RoundResult.Lost);
                    else this._respawn();
                }
                break;
            case Phase.BossDown:
                this._moveAir(h, false);
                this._updateFx(h);
                if (Math.trunc(this.phaseTime * 6) !== Math.trunc((this.phaseTime - h) * 6) && this.phaseTime < NebulaRunRound.BossDownSeconds - 0.8)
                    this.bursts.push({ x: 160 + this._range(-88, 88), y: this.fortMapY + this._range(-36, 36), onGround: true, t: 0, size: 2 });
                if (this.phaseTime >= NebulaRunRound.BossDownSeconds) this._enterCard(RoundResult.Won);
                break;
            case Phase.Card:
                this._updateFx(h);
                if (this.phaseTime >= NebulaRunRound.CardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _enterCard(r) {
        this.result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    _respawn() {
        const cp = this.scroll.lastCheckpoint(this.scroll.pos);
        this.scroll.pos = cp;
        this.air.length = 0; this.shots.length = 0; this.bursts.length = 0; this.popups.length = 0;
        for (const g of this.ground) {
            if (g.kind === GroundKind.Core || g.mapY < cp - 20) continue;
            g.alive = true; g.hp = g.maxHp; g.x = g.homeX; g.vx = g.homeVx; g.deadT = 0; g.hitFlash = 0;
            g.fireT = this.turretGap * this._range(0.4, 0.9);
        }
        this.bossPhase = 0; this._firedThisPass = 0;
        this._placeShip();
        this.invuln = NebulaRunRound.InvulnSeconds;
        this._enterIntro(NebulaRunRound.ReadySeconds);
    }

    _play(h, bPress) {
        this._sinceSpawn += h;
        if (this.bossLive) this._bossSeconds += h;
        this.scroll.advance(h);

        // the ship: 8-way, the same speed on the diagonals
        let ix = 0, iy = 0, aHeld = false;
        if (this._input != null) {
            ix = clamp(this._input.x, -1, 1); iy = clamp(this._input.y, -1, 1);
            if (Math.abs(ix) < 0.2) ix = 0;
            if (Math.abs(iy) < 0.2) iy = 0;
            aHeld = this._input.held(Pad.A);
        }
        const len = Math.sqrt(ix * ix + iy * iy);
        if (len > 1) { ix /= len; iy /= len; }
        this.shipX = clamp(this.shipX + ix * NebulaRunRound.ShipSpeed * h, NebulaRunRound.ShipMinX, NebulaRunRound.ShipMaxX);
        this.shipY = clamp(this.shipY - iy * NebulaRunRound.ShipSpeed * h, NebulaRunRound.ShipMinY, NebulaRunRound.ShipMaxY);
        if (this.invuln > 0) this.invuln -= h;
        if (this.shieldFlash > 0) this.shieldFlash -= h;

        // the air gun
        this._fireCd -= h;
        this.firing = aHeld;
        if (aHeld && this._fireCd <= 0 && this.bullets.length < NebulaRunRound.MaxBullets) {
            this.bullets.push({ x: this.shipX, y: this.shipY - 11 });
            this._fireCd = NebulaRunRound.FireGap;
        }

        // the bomb
        if (bPress && !this.bombActive) {
            this.bombActive = true; this.bombT = 0;
            this.bombSX = this.shipX; this.bombSY = this.shipY - 6;
            this.bombTX = this.shipX; this.bombTMapY = this.scroll.toMapY(this.shipY - NebulaRunRound.SightDist);
            this._bombs++;
        }

        this._moveBullets(h);
        this._updateBomb(h);
        this._spawnAir(h);
        this._moveAir(h, true);
        this._updateGround(h);
        this._updateBoss(h);
        this._moveShots(h);
        this._updateFx(h);
        if (this.p === Phase.Playing) this._collide();

        // the sight lock
        let lk = false;
        const sx = this.sightX, sy = this.sightY;
        for (const g of this.ground) {
            if (!g.alive) continue;
            const gy = this.scroll.toScreenY(g.mapY);
            const dx = g.x - sx, dy = gy - sy, r = groundRadius(g) + 3;
            if (dx * dx + dy * dy < r * r) { lk = true; break; }
        }
        this.sightLocked = lk;
    }

    // ------------------------------------------------------------------ the air
    _spawnAir(h) {
        if (this._sinceSpawn < NebulaRunRound.SpawnGrace || this.coresLeft <= 0) return;
        const prog = this.scroll.progress;
        const rate = this.airRate * (this.bossZone ? 0.55 : (0.8 + 0.4 * prog));
        this._spawnAcc += rate * h;
        while (this._spawnAcc >= 1) { this._spawnAcc -= 1; this._spawnGroup(prog); }
    }

    _discAlive() { for (const e of this.air) if (e.alive && e.kind === AirKind.Disc) return true; return false; }

    _spawnGroup(prog) {
        const r = this.rng.nextDouble();
        if (!this.bossZone && prog > 0.12 && r < 0.17 && !this._discAlive()) {
            const d = this._newAir(AirKind.Disc, this._range(60, 260), NebulaScroll.FieldY - 14);
            d.hp = 3; d.hoverY = this._range(56, 76); d.fireT = this.discGap * 0.6;
            return;
        }
        if (r < 0.60) {
            const n = prog < 0.4 ? 3 : 4;
            const span = (n - 1) * 30;
            const cx = this._range(40 + span * 0.5, 280 - span * 0.5);
            const turn = this._range(74, Math.min(140, this.shipY - 44));
            for (let i = 0; i < n; i++) {
                const e = this._newAir(AirKind.Spinner, cx - span * 0.5 + i * 30, NebulaScroll.FieldY - 12 - (i % 2) * 14);
                e.turnY = turn + (i % 2) * 10;
                e.hp = 1;
            }
            return;
        }
        const m = prog > 0.3 && this.rng.nextDouble() < 0.5 ? 2 : 1;
        const side = this.rng.nextDouble() < 0.5 ? -1 : 1;
        for (let i = 0; i < m; i++) {
            const x = clamp(this.shipX + this._range(-26, 26) + i * side * 44, 24, 296);
            const e = this._newAir(AirKind.Dart, x, NebulaScroll.FieldY - 12 - i * 46);
            e.hp = 1;
        }
    }

    _newAir(kind, x, y) {
        const e = { id: this._nextId++, kind, x, y, vx: 0, vy: 0, t: 0, mode: 0, hp: 0, turnY: 0, cx: 0, hoverY: 0, fireT: 0, flash: 0, alive: true };
        this.air.push(e);
        return e;
    }

    _moveAir(h, live) {
        for (let i = this.air.length - 1; i >= 0; i--) {
            const e = this.air[i];
            if (!e.alive) { this.air.splice(i, 1); continue; }
            e.t += h;
            if (e.flash > 0) e.flash -= h;
            switch (e.kind) {
                case AirKind.Spinner:
                    if (e.mode === 0) {
                        e.vy = 72;
                        e.vx = clamp((this.shipX - e.x) * 1.2, -34, 34);
                        if (e.y >= e.turnY) { e.mode = 1; e.t = 0; }
                    } else if (e.mode === 1) {
                        e.vy = 72 * Math.max(0, 1 - e.t / 0.35);
                        e.vx *= 0.9;
                        if (e.t >= 0.35) {
                            if (live && this.rng.nextDouble() < this.airFire) this._fireAt(e.x, e.y + 4, 0);
                            e.mode = 2; e.t = 0;
                            e.vy = -105; e.vx = (e.x < this.shipX ? -1 : 1) * 70;
                        }
                    }
                    e.x += e.vx * h; e.y += e.vy * h;
                    if (e.y < NebulaScroll.FieldY - 22 && e.mode === 2) e.alive = false;
                    if (e.x < -10 || e.x > 330) e.alive = false;
                    break;
                case AirKind.Dart:
                    if (e.t < 0.5) e.vx = clamp((this.shipX - e.x) * 2, -55, 55);
                    e.vy = this.dartSpeed;
                    e.x += e.vx * h; e.y += e.vy * h;
                    if (e.y > NebulaScroll.FieldBottom + 16) e.alive = false;
                    break;
                default:                                    // Disc
                    if (e.mode === 0) {
                        e.vy = 65; e.vx = 0; e.y += e.vy * h;
                        if (e.y >= e.hoverY) { e.mode = 1; e.t = 0; e.cx = e.x; }
                    } else if (e.mode === 1) {
                        const nx = clamp(e.cx + 70 * Math.sin(e.t * 1.3), 24, 296);
                        const ny = e.hoverY + 8 * Math.sin(e.t * 2.1);
                        e.vx = (nx - e.x) / h; e.vy = (ny - e.y) / h;
                        e.x = nx; e.y = ny;
                        if (live) { e.fireT -= h; if (e.fireT <= 0) { this._fireAt(e.x, e.y + 8, 0); e.fireT = this.discGap; } }
                        if (e.t > 8.5) { e.mode = 2; e.t = 0; }
                    } else {
                        e.vy = -70; e.vx = 0; e.y += e.vy * h;
                        if (e.y < NebulaScroll.FieldY - 24) e.alive = false;
                    }
                    break;
            }
        }
    }

    _fireAt(x, y, source) {
        let dx = this.shipX - x, dy = this.shipY - y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) { dx = 0; dy = 1; d = 1; }
        this.shots.push({ id: this._nextId++, x, y, vx: dx / d * this.shotSpeed, vy: dy / d * this.shotSpeed, source });
    }

    _moveBullets(h) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.y -= NebulaRunRound.BulletSpeed * h;
            let gone = b.y < NebulaScroll.FieldY - 10;
            if (!gone)
                for (const e of this.air) {
                    if (!e.alive) continue;
                    const r = airRadius(e);
                    if (Math.abs(b.x - e.x) < r + 1.5 && Math.abs(b.y - e.y) < r + 5) {
                        gone = true;
                        e.hp--;
                        if (e.hp <= 0) this._killAir(e, true);
                        else { e.flash = 0.12; this._cues.emit(SoundCue.Tick); }
                        break;
                    }
                }
            if (gone) this.bullets.splice(i, 1);
        }
    }

    _killAir(e, points) {
        e.alive = false;
        if (points) {
            this.score += airPoints(e); this.airKills++;
            if (e.kind === AirKind.Disc) this._discKills++;
            this.popups.push({ x: e.x, y: e.y, onGround: false, t: 0, points: airPoints(e) });
        }
        this.bursts.push({ x: e.x, y: e.y, onGround: false, t: 0, size: e.kind === AirKind.Disc ? 2 : 1 });
        this._cues.emit(SoundCue.Hit);
    }

    // ------------------------------------------------------------------ the ground
    _updateBomb(h) {
        if (!this.bombActive) return;
        this.bombT += h;
        if (this.bombT < NebulaRunRound.BombFlight) return;
        this.bombActive = false;
        const bx = this.bombTX, by = this.scroll.toScreenY(this.bombTMapY);
        let hit = false;
        for (const g of this.ground) {
            if (!g.alive) continue;
            const gy = this.scroll.toScreenY(g.mapY);
            const dx = g.x - bx, dy = gy - by, r = NebulaRunRound.BlastR + groundRadius(g) - 2;
            if (dx * dx + dy * dy >= r * r) continue;
            hit = true;
            g.hp--;
            if (g.hp <= 0) this._killGround(g);
            else {
                g.hitFlash = 0.3;
                this.bursts.push({ x: g.x, y: g.mapY, onGround: true, t: 0, size: 0 });
                this._cues.emit(SoundCue.Hit);
            }
        }
        if (hit) this._bombHits++;
        else {
            this.bursts.push({ x: bx, y: this.bombTMapY, onGround: true, t: 0, size: 3 });
            this._cues.emit(SoundCue.Miss);
        }
    }

    _killGround(g) {
        g.alive = false; g.deadT = 0;
        this.score += groundPoints(g); this.groundKills++;
        if (g.kind === GroundKind.Tank) this._tankKills++;
        this.lastGroundKillTime = this.time; this.lastGroundKillKind = g.kind;
        this.popups.push({ x: g.x, y: g.mapY, onGround: true, t: 0, points: groundPoints(g) });
        this.bursts.push({ x: g.x, y: g.mapY, onGround: true, t: 0, size: (g.kind === GroundKind.Fuel || g.kind === GroundKind.Core) ? 2 : 1 });
        if (g.kind === GroundKind.Core) {
            this.coresLeft--;
            this.lastCoreKillTime = this.time;
            this._cues.emit(SoundCue.Bonus);
            if (this.coresLeft <= 0) {
                this.score += NebulaRunRound.BossBonus;
                this.p = Phase.BossDown; this.phaseTime = 0;
                this.shots.length = 0; this.bombActive = false;
                this.popups.push({ x: 160, y: this.fortMapY, onGround: true, t: 0, points: NebulaRunRound.BossBonus });
            }
        } else this._cues.emit(g.kind === GroundKind.Fuel ? SoundCue.Bonus : SoundCue.Hit);
    }

    _updateGround(h) {
        for (const g of this.ground) {
            if (!g.alive) { g.deadT += h; continue; }
            if (g.hitFlash > 0) g.hitFlash -= h;
            if (g.fireFlash > 0) g.fireFlash -= h;
            g.armed = false;
            if (g.kind === GroundKind.Tank) {
                // it crawls its road; a bomb falling near it makes it gun the engine (the dodge)
                let sp = 1;
                if (this.bombActive && Math.abs(this.bombTX - g.x) < 34 && Math.abs(this.bombTMapY - g.mapY) < 20) sp = 1.9;
                g.x += g.vx * sp * h;
                if (g.x < g.minX) { g.x = g.minX; g.vx = Math.abs(g.vx); }
                if (g.x > g.maxX) { g.x = g.maxX; g.vx = -Math.abs(g.vx); }
            } else if (g.kind === GroundKind.Turret) {
                const sy = this.scroll.toScreenY(g.mapY);
                if (sy > NebulaScroll.FieldY + 6 && sy < this.shipY - 34) {
                    g.armed = true;
                    g.fireT -= h;
                    if (g.fireT <= 0) {
                        this._fireAt(g.x, sy, 1);
                        g.fireFlash = 0.15;
                        g.fireT = this.turretGap * this._range(0.85, 1.15);
                    }
                }
            }
        }
    }

    _updateBoss(h) {
        if (!this.bossLive) return;
        const adv = h / Math.max(0.2, this.bossPass);
        let from = this.bossPhase, to = this.bossPhase + adv;
        for (;;) {
            const seg = Math.min(to, 1);
            for (let i = 0; i < 4; i++) {
                const c = this.coreByIndex(i);
                if (c == null || !c.alive) continue;
                if (from < c.firePhase && c.firePhase <= seg) {
                    if (this.mercyActive && this._firedThisPass >= 1) continue;   // credit 5: once per pass
                    this._fireAt(c.x, this.scroll.toScreenY(c.mapY) + 6, 2);
                    c.fireFlash = 0.15;
                    this._firedThisPass++;
                }
            }
            if (to >= 1) { to -= 1; from = 0; this._firedThisPass = 0; this.bossPasses++; }
            else break;
        }
        this.bossPhase = to;
    }

    coreByIndex(i) { for (const g of this.ground) if (g.kind === GroundKind.Core && g.coreIndex === i) return g; return null; }

    _moveShots(h) {
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i];
            s.x += s.vx * h; s.y += s.vy * h;
            if (s.x < 2 || s.x > 318 || s.y < NebulaScroll.FieldY - 10 || s.y > NebulaScroll.FieldBottom + 10) this.shots.splice(i, 1);
        }
    }

    _updateFx(h) {
        for (let i = this.bursts.length - 1; i >= 0; i--) { this.bursts[i].t += h; if (this.bursts[i].t > 0.9) this.bursts.splice(i, 1); }
        for (let i = this.popups.length - 1; i >= 0; i--) { this.popups[i].t += h; if (this.popups[i].t > (this.popups[i].points >= NebulaRunRound.BossBonus ? 2.5 : 0.9)) this.popups.splice(i, 1); }
    }

    // ------------------------------------------------------------------ hits on the ship
    _collide() {
        if (this.shipDown || this.invuln > 0) return;
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i];
            const dx = s.x - this.shipX, dy = s.y - this.shipY, r = NebulaRunRound.ShotR + NebulaRunRound.ShipR;
            if (dx * dx + dy * dy >= r * r) continue;
            this.shots.splice(i, 1);
            if (this._hit(s.source === 0 ? 2 : s.source === 1 ? 3 : 4)) return;
        }
        for (const e of this.air) {
            if (!e.alive) continue;
            const dx = e.x - this.shipX, dy = e.y - this.shipY, r = airRadius(e) + NebulaRunRound.ShipR - 1;
            if (dx * dx + dy * dy >= r * r) continue;
            if (this.mercyActive) { this._killAir(e, true); this._hit(1); continue; }
            this._killAir(e, false);
            if (this._hit(1)) return;
        }
    }

    // true = the ship is lost
    _hit(cause) {
        if (this.mercyActive) {
            this.shieldFlash = 0.5; this._shieldHits++;
            this._cues.emit(SoundCue.Miss);
            return false;
        }
        this.deaths++;
        this.lastDeathCause = cause;
        if (cause === 1) this._deathRam++; else if (cause === 2) this._deathAirShot++; else if (cause === 3) this._deathGroundShot++; else this._deathBoss++;
        this.ships--;
        this.shipDown = true;
        this.bombActive = false; this.bullets.length = 0;
        this.bursts.push({ x: this.shipX, y: this.shipY, onGround: false, t: 0, size: 2 });
        this._cues.emit(SoundCue.Die);
        this.p = Phase.ShipLost; this.phaseTime = 0;
        return true;
    }

    collectStats(into) {
        add(into, 'deaths', this.deaths);
        add(into, 'dRam', this._deathRam);
        add(into, 'dAirShot', this._deathAirShot);
        add(into, 'dGndShot', this._deathGroundShot);
        add(into, 'dFort', this._deathBoss);
        add(into, 'airKills', this.airKills);
        add(into, 'gndKills', this.groundKills);
        add(into, 'tanks', this._tankKills);
        add(into, 'discs', this._discKills);
        add(into, 'bombAcc', this._bombs > 0 ? this._bombHits / this._bombs : 0);
        add(into, 'fortSec', this._bossSeconds);
        add(into, 'reached', this.scroll.progress);
        add(into, 'shield', this._shieldHits);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

// ------------------------------------------------------------------ the machine (not mercy knobs)
NebulaRunRound.ShipSpeed = 112;
NebulaRunRound.ShipMinX = 20; NebulaRunRound.ShipMaxX = 300; NebulaRunRound.ShipMinY = 100; NebulaRunRound.ShipMaxY = 214;
NebulaRunRound.SightDist = 64;
NebulaRunRound.BombFlight = 0.42;
NebulaRunRound.BlastR = 8;
NebulaRunRound.BulletSpeed = 330;
NebulaRunRound.FireGap = 0.13;
NebulaRunRound.MaxBullets = 3;
NebulaRunRound.ShipR = 5;
NebulaRunRound.ShotR = 3;
NebulaRunRound.FirstIntroSeconds = 2.4; NebulaRunRound.ReadySeconds = 1.6; NebulaRunRound.LostSeconds = 1.8;
NebulaRunRound.BossDownSeconds = 2.8; NebulaRunRound.CardSeconds = 3.2; NebulaRunRound.InvulnSeconds = 2.0;
NebulaRunRound.SpawnGrace = 2.4;
NebulaRunRound.StartShips = 3;
NebulaRunRound.BossBonus = 5000;
NebulaRunRound.SubStep = 1 / 120;
NebulaRunRound.CoreDX = [-44, 44, 44, -44];    // TL, TR, BR, BL
NebulaRunRound.CoreDY = [19, 19, -19, -19];    // map space: + = up the tube
NebulaRunRound.FortParkScreenY = 86;

NebulaRunRound.Phase = Phase;
