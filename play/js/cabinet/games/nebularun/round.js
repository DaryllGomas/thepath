// THE NODE · world 1 · NEBULA RUN (Sunward Amusements, 1983) on the Cabinet Engine · THE ROUND.
// Built out 2026-10-18 from the one-sector port of Staging/Batch4/nebularun/Games/NebulaRun/NebulaRunSim.cs (C# parity
// is retired for this game: NOTES.md). Plain doubles, not f32. Every die roll is the round's SystemRandom, so a seed
// plays the same game every time (the determinism check).
//
// A GAME = the five SECTORS of sectors.js, flown in order, three ships and an extra one at 30,000 and every 70,000:
//   each sector:  the SECTOR CARD (Intro: number, name, the one-line hint) -> the run (Playing): the ground scrolls
//                 down the tube for `seconds`, then parks under the sector's BOSS (bosses.js) -> BOSS DOWN (Interlude:
//                 the boss breaks up) -> the TALLY (Interlude: ground and air counted, the boss, NO MISS, the beacon)
//                 -> the next card, or after the fifth the WON card. The result is set when the card goes up.
//   a lost ship:  SHIP LOST (Interlude) -> READY at the last checkpoint passed (a third of the way, two thirds, the
//                 boss approach) with 2 s of invulnerability, or GAME OVER with the last ship.
// Two layers, like the board it pays homage to:
//   AIR     spinners, darts, the disc ship (3 hits), weavers (cross the tube, fire a fan), mines (drift; get close
//           and they arm and burst into a ring), carriers (drop a power-up POD). Button A is the air gun.
//   GROUND  silos, turrets, tanks, supply dumps (drop a pod), flak guns (the shell climbs to where you are and
//           bursts there), shield generators (their domed guns shrug off bombs until the generator goes), bunkers.
//           Button B drops a bomb at the SIGHT, a fixed 64 px ahead of the ship; it lands 0.42 s later on whatever
//           was under the sight when it left. One bomb in the air at a time. Each sector hides a BEACON in its
//           ground: the sight turns gold over it; bomb it and the tally pays 5000.
//   PODS    W widens the gun (one lane -> twin -> a three-way fan), C makes the bomb a CLUSTER (a wider blast).
//           A lost ship drops the gun one step and loses the cluster.
// Hazards with telegraphs: an armed turret glows red; a flak shell shows where it will burst; a lightning column is a
// dotted warning for a second before the bolt; an armed mine turns red; a boss winds up before every volley.
//
// MERCY (knobs, eased per loss on this cabinet: spec.js): fewer interceptors, slower shots and guns, flak, lightning
// and boss volleys. On the unlosable credit (5) the sim's own rule: the SHIELD is on (a hit only flashes it; the
// ship cannot die) and the radar isle fires once a pass. The game is still won only by bringing the fortress down.
//
// THE SOUND: besides the eight SDK cues the round says what happened in detail on `events` while `recordEvents` is
// on (Starvector's pattern): fire bomb blast pop boom clink ping enemyFire flak flakBurst boltWarn bolt mineArm
// mineBurst genDown cap pickup beacon extra bossWarn charge iris launch partDown bossDown tally sectorClear card
// crash shield respawn. sound.js plays them.
import { RoundResult, CabinetState, SoundCue, CueBuffer, Pad, SystemRandom, fmt } from '../../sdk/index.js';
import { NebulaScroll } from './scroll.js';
import { SECTORS, SectorCount } from './sectors.js';
import { AirKind, GroundKind, CapKind, airRadius, airPoints, groundRadius, groundPoints, isShielded } from './kinds.js';
import { buildBoss, bossArrive, updateBoss, bossRespawn, BossDownSeconds } from './bosses.js';

export { AirKind, GroundKind, CapKind, airRadius, airPoints, groundRadius, groundPoints, isShielded };

const Phase = Object.freeze({ Idle: 0, Intro: 1, Playing: 2, ShipLost: 3, BossDown: 4, Tally: 5, Card: 6, Over: 7 });

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class NebulaRunRound {
    constructor() {
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.credit = null;
        this.demo = false;
        this.scroll = new NebulaScroll();
        this.sector = 1; this.def = SECTORS[0];
        this.sectorLength = 0;
        this.shipX = 160; this.shipY = 196; this.shipVX = 0;
        this.invuln = 0; this.shieldFlash = 0;
        this.shipDown = false; this.firing = false;
        this.ships = 3; this.nextExtra = 0;
        this.gunLevel = 0; this.cluster = false;
        this.cardIntro = false;
        this.sightMode = 0;              // 0 nothing, 1 a target (red), 2 a domed target (cyan), 3 the hidden beacon (gold)
        this.shake = 0; this.flash = 0;
        this.banner = null;              // { text, t } a line across the tube (EXTRA SHIP)
        this.tally = null;               // { sector, lines: [{ label, value, shown }], total, shownTotal }
        this.boss = null;

        this.bombActive = false; this.bombT = 0; this.bombCluster = false;
        this.bombSX = 0; this.bombSY = 0; this.bombTX = 0; this.bombTMapY = 0;

        this.air = []; this.ground = []; this.shots = []; this.bullets = []; this.flak = []; this.bolts = []; this.caps = [];
        this.bursts = []; this.popups = []; this.sites = [];

        // knobs (resolved for this credit)
        this.scrollSpeed = 26; this.airRate = 1; this.shotSpeed = 100; this.turretGap = 1.5; this.airFire = 0.3;
        this.dartSpeed = 160; this.discGap = 1.3; this.flakGap = 2.8; this.boltGap = 3.2; this.bossPace = 1; this.bossPass = 1.8;

        this.lastDeathCause = 0;
        this._cues = new CueBuffer();
        this.recordEvents = false; this.events = [];
        this.rng = new SystemRandom(1);
        this.result = RoundResult.None;
        this.score = 0;
        this.time = 0;
        this._nextId = 1;
        this._input = null;
        this._introLen = 0;
        this._capFlip = 0; this._carrierIdx = 0; this._boltT = 0;

        // per sector (the tally)
        this.secAir = 0; this.secLost = 0; this.secBeacon = false;
        // stats
        this.deaths = 0; this._deathBy = [0, 0, 0, 0, 0, 0, 0, 0];
        this.airKills = 0; this.groundKills = 0; this._bombs = 0; this._bombHits = 0;
        this._shieldHits = 0; this._caps = 0; this._beacons = 0; this._extras = 0; this._bossSeconds = 0; this.sectorsCleared = 0;
        this._fireCd = 0; this._spawnAcc = 0; this._sinceSpawn = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get bossZone() { return this.scroll.pos >= this.sectorLength - 110; }
    get bossLive() { return this.scroll.parked && this.boss != null && !this.boss.dead; }
    get sightX() { return this.shipX; }
    get sightY() { return this.shipY - NebulaRunRound.SightDist; }
    get roundWon() { return this.result === RoundResult.Won; }
    get finalSector() { return this.sector >= SectorCount; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Intro: return CabinetState.Intro;
            case Phase.Playing: return CabinetState.Playing;
            case Phase.ShipLost: case Phase.BossDown: case Phase.Tally: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get lives() { return this.ships; }
    get cues() { return this._cues; }

    get summary() {
        const r = this.result === RoundResult.Won ? 'WON' : this.result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const d = this._deathBy;
        return r + ' score ' + this.score + ' ' + fmt(this.time, 1) + 's sector ' + this.sector + ' (' + Math.round(this.scroll.progress * 100) + '%)' +
            ' deaths ' + this.deaths + ' (ram ' + d[1] + ' air ' + d[2] + ' gnd ' + d[3] + ' boss ' + d[4] + ' flak ' + d[5] + ' bolt ' + d[6] + ' mine ' + d[7] + ')' +
            ' air ' + this.airKills + ' gnd ' + this.groundKills + ' bombs ' + this._bombHits + '/' + this._bombs +
            ' pods ' + this._caps + ' beacons ' + this._beacons + ' extra ' + this._extras;
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    reset(seed, credit, k) {
        this.credit = credit;
        this.demo = !!this.isDemo;
        this.rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);

        this.scrollSpeed = k.get('scrollSpeed');
        this.airRate = k.get('airRate');
        this.shotSpeed = k.get('shotSpeed');
        this.turretGap = k.get('turretGap');
        this.airFire = k.get('airFire');
        this.dartSpeed = k.get('dartSpeed');
        this.discGap = k.get('discGap');
        this.flakGap = k.get('flakGap');
        this.boltGap = k.get('boltGap');
        this.bossPace = k.get('bossPace');
        this.bossPass = k.get('bossPass');

        this.score = 0; this.time = 0; this.result = RoundResult.None;
        this.ships = Math.round(k.get('startShips', 3));
        this.nextExtra = NebulaRunRound.ExtraFirst;
        this.gunLevel = 0; this.cluster = false; this._capFlip = 0;
        this.deaths = 0; this._deathBy.fill(0);
        this.airKills = this.groundKills = this._bombs = this._bombHits = 0;
        this._shieldHits = this._caps = this._beacons = this._extras = 0; this._bossSeconds = 0; this.sectorsCleared = 0;
        this.lastDeathCause = 0; this.shake = 0; this.flash = 0; this.banner = null; this.tally = null;
        this._cues.resetTotals(); this.events.length = 0;
        // the attract demo opens on any sector, part way in, to show the variety
        let first = 1, startAt = 0;
        if (this.demo) { const u = ((seed % 1009) + 1009) % 1009; first = 1 + (u % SectorCount); startAt = 0.3 + 0.1 * ((u >> 3) % 3); }
        this._startSector(first, startAt);
    }

    // ------------------------------------------------------------------ the sectors
    _startSector(n, startAt = 0) {
        this.sector = n; this.def = SECTORS[n - 1];
        const L = this.sectorLength = Math.round(this.scrollSpeed * this.def.seconds);
        this.scroll.setup(this.scrollSpeed, L);
        this.scroll.checkpoints.push(0, Math.round(L / 3), Math.round(L * 2 / 3), L - 110);
        this.air.length = 0; this.ground.length = 0; this.shots.length = 0; this.bullets.length = 0; this.flak.length = 0;
        this.bolts.length = 0; this.caps.length = 0; this.bursts.length = 0; this.popups.length = 0; this.sites.length = 0;
        this._nextId = 1;
        this._buildMap();
        buildBoss(this);
        if (startAt > 0) this.scroll.pos = Math.round(L * startAt);
        this.secAir = 0; this.secLost = 0; this.secBeacon = false; this.tally = null;
        this._carrierIdx = 0; while (this._carrierIdx < this.def.carriers.length && this.def.carriers[this._carrierIdx] <= this.scroll.progress) this._carrierIdx++;
        this._boltT = this.boltGap * 1.5;
        this._placeShip();
        this.cardIntro = true;
        this._emit('card', { sector: n });
        this._enterIntro(NebulaRunRound.CardSeconds);
    }

    _enterIntro(seconds) {
        this.p = Phase.Intro; this.phaseTime = 0; this._introLen = seconds;
        this._cues.emit(SoundCue.Tick);
    }

    _placeShip() {
        this.shipX = 160; this.shipY = 196; this.shipVX = 0; this.shipDown = false; this.invuln = 0; this.shieldFlash = 0;
        this.bombActive = false; this.bullets.length = 0; this._fireCd = 0; this._spawnAcc = 0; this._sinceSpawn = 0;
    }

    // ------------------------------------------------------------------ the ground map
    // Groups of ground targets stand every gap px up the sector, each on its SITE (the pad, road or plaza the renderer
    // draws in the sector's style). The fixed groups (tanks, dumps) stand at their progress points; the rest are rolled
    // from the sector's weights. The beacon hides somewhere between them. The boss is built after (bosses.js).
    _buildMap() {
        const def = this.def, L = this.sectorLength;
        const fixed = [];
        for (const kind of Object.keys(def.fixed)) for (const at of def.fixed[kind]) fixed.push({ kind, at });
        fixed.sort((a, b) => a.at - b.at);
        const names = Object.keys(def.groups);
        let wsum = 0; for (const nm of names) wsum += def.groups[nm];
        let fi = 0, y = 230, last = '';
        while (y < L - 140) {
            const p = y / L;
            let kind;
            if (fi < fixed.length && p >= fixed[fi].at) kind = fixed[fi++].kind;
            else {
                for (let tries = 0; tries < 3; tries++) {       // the same group twice running only rarely
                    let r = this.rng.nextDouble() * wsum;
                    kind = names[names.length - 1];
                    for (const nm of names) { r -= def.groups[nm]; if (r < 0) { kind = nm; break; } }
                    if (kind !== last) break;
                }
            }
            last = kind;
            this._group(kind, y, p);
            y += this._range(def.gap[0], def.gap[1]);
        }
        this.secGround = 0;
        for (const g of this.ground) if (!g.boss && g.kind !== GroundKind.Beacon) this.secGround++;

        // the beacon: under open ground, away from every site
        for (let tries = 0; tries < 24; tries++) {
            const bx = this._range(48, 272), by = this._range(L * 0.3, L * 0.85);
            let clear = true;
            for (const s of this.sites) if (Math.abs(s.x - bx) < s.w / 2 + 16 && Math.abs(s.mapY - by) < s.h / 2 + 16) { clear = false; break; }
            if (!clear && tries < 23) continue;
            const b = this._addGround(GroundKind.Beacon, bx, by);
            b.hidden = true;
            break;
        }
    }

    _group(kind, y, p) {
        const cx = this._range(64, 256);
        switch (kind) {
            case 'silos': {
                const n = this.rng.nextDouble() < 0.5 ? 2 : 3;
                const x0 = cx - (n - 1) * 14;
                for (let i = 0; i < n; i++) this._addGround(GroundKind.Silo, x0 + i * 28, y + (i % 2 === 0 ? 0 : 6));
                this._addSite(0, cx, y + 3, n * 28 + 14, 34);
                break;
            }
            case 'turret':
                this._addGround(GroundKind.Turret, cx, y);
                this._addSite(0, cx, y, 36, 36);
                break;
            case 'turretSilo':
                this._addGround(GroundKind.Turret, cx - 20, y);
                this._addGround(GroundKind.Silo, cx + 20, y - 2);
                this._addSite(0, cx, y, 76, 36);
                break;
            case 'tank': case 'convoy': {
                const n = kind === 'tank' ? 1 : 2 + (this.rng.nextDouble() < 0.4 ? 1 : 0);
                const v = (this.rng.nextDouble() < 0.5 ? -1 : 1) * (kind === 'tank' ? 18 : 22);
                const x0 = this._range(80, 240);
                for (let i = 0; i < n; i++) {
                    const g = this._addGround(GroundKind.Tank, clamp(x0 - Math.sign(v) * i * 30, 40, 280), y);
                    g.minX = 36; g.maxX = 284;
                    g.homeVx = g.vx = v;
                }
                this._addSite(1, 160, y, 268, 16);
                break;
            }
            case 'dump': {
                this._addGround(GroundKind.Dump, cx, y);
                if (p > 0.5) {
                    const gx = cx < 160 ? cx + 40 : cx - 40;
                    this._addGround(GroundKind.Turret, gx, y + 4);
                    this._addSite(0, (cx + gx) * 0.5, y + 2, 86, 40);
                } else this._addSite(0, cx, y, 44, 40);
                break;
            }
            case 'flak': {
                this._addGround(GroundKind.Flak, cx, y);
                if (this.rng.nextDouble() < 0.5) {
                    const sx = cx < 160 ? cx + 30 : cx - 30;
                    this._addGround(GroundKind.Silo, sx, y - 3);
                    this._addSite(3, (cx + sx) * 0.5, y, 66, 34);
                } else this._addSite(3, cx, y, 36, 34);
                break;
            }
            case 'shield': {
                // the generator behind, two domed guns in front of it (a turret and a flak gun or two turrets)
                const gx = clamp(cx, 88, 232);
                const gen = this._addGround(GroundKind.Gen, gx, y + 12);
                const a = this._addGround(GroundKind.Turret, gx - 34, y - 6);
                const b = this._addGround(this.sector >= 3 && this.rng.nextDouble() < 0.5 ? GroundKind.Flak : GroundKind.Turret, gx + 34, y - 6);
                a.guards = [gen]; b.guards = [gen];
                this._addSite(4, gx, y + 2, 104, 50);
                break;
            }
            case 'bunker': {
                const g = this._addGround(GroundKind.Bunker, cx, y);
                g.maxHp = g.hp = 2;
                if (this.rng.nextDouble() < 0.45) {
                    const sx = cx < 160 ? cx + 32 : cx - 32;
                    this._addGround(GroundKind.Silo, sx, y + 2);
                    this._addSite(5, (cx + sx) * 0.5, y, 72, 36);
                } else this._addSite(5, cx, y, 38, 36);
                break;
            }
        }
    }

    _addGround(kind, x, mapY) {
        const g = {
            id: this._nextId++, kind, x, homeX: x, mapY, vx: 0, homeVx: 0, minX: 0, maxX: 0,
            hp: 1, maxHp: 1, coreIndex: -1, alive: true, armed: false, hidden: false, boss: false, guards: null,
            fireT: 0, hitFlash: 0, deadT: 0, fireFlash: 0, firePhase: 0, charge: 0, burst: 0, dx: 0, dy: 0,
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
        if (this.shake > 0) this.shake = Math.max(0, this.shake - h * 9);
        if (this.flash > 0) this.flash -= h;
        if (this.banner != null) { this.banner.t += h; if (this.banner.t > NebulaRunRound.BannerSeconds) this.banner = null; }
        switch (this.p) {
            case Phase.Intro:
                this._updateFx(h);
                if (this.phaseTime >= this._introLen) {
                    this.p = Phase.Playing; this.phaseTime = 0; this.cardIntro = false;
                    this._cues.emit(SoundCue.Start);
                }
                break;
            case Phase.Playing:
                this._play(h, bPress);
                break;
            case Phase.ShipLost:
                this._moveAir(h, false);
                this._moveShots(h);
                this._moveFlak(h);
                this._moveBolts(h, false);
                this._moveCaps(h);
                this._updateFx(h);
                if (this.phaseTime >= NebulaRunRound.LostSeconds) {
                    if (this.ships <= 0) this._enterCard(RoundResult.Lost);
                    else this._respawn();
                }
                break;
            case Phase.BossDown: {
                this._moveAir(h, false);
                this._moveCaps(h);
                this._updateFx(h);
                const len = BossDownSeconds(this);
                const b = this.boss;
                if (Math.trunc(this.phaseTime * 7) !== Math.trunc((this.phaseTime - h) * 7) && this.phaseTime < len - 0.7) {
                    const air = b.kind === 'thunderhead';
                    this.bursts.push({ x: b.x + this._range(-b.w * 0.5, b.w * 0.5), y: air ? b.y + this._range(-14, 14) : b.mapY + this._range(-b.h * 0.5, b.h * 0.5),
                        onGround: !air, t: 0, size: 2 });
                    this.shake = Math.max(this.shake, 2.2);
                }
                if (this.phaseTime >= len) this._enterTally();
                break;
            }
            case Phase.Tally:
                this._moveCaps(h);
                this._updateFx(h);
                this._updateTally();
                if (this.phaseTime >= NebulaRunRound.TallySeconds) {
                    if (this.finalSector) this._enterCard(RoundResult.Won);
                    else this._startSector(this.sector + 1);
                }
                break;
            case Phase.Card:
                this._updateFx(h);
                if (this.phaseTime >= NebulaRunRound.CardSeconds + 1) this.p = Phase.Over;
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
        for (let i = this.air.length - 1; i >= 0; i--) if (!this.air[i].boss) this.air.splice(i, 1);
        this.shots.length = 0; this.flak.length = 0; this.bolts.length = 0; this.caps.length = 0;
        this.bursts.length = 0; this.popups.length = 0;
        for (const g of this.ground) {
            if (g.boss || g.kind === GroundKind.Beacon || g.mapY < cp - 20) continue;
            g.alive = true; g.hp = g.maxHp; g.x = g.homeX; g.vx = g.homeVx; g.deadT = 0; g.hitFlash = 0; g.burst = 0;
            g.fireT = this.turretGap * this._range(0.4, 0.9);
        }
        bossRespawn(this);
        this._boltT = this.boltGap;
        this._placeShip();
        this.invuln = NebulaRunRound.InvulnSeconds;
        this._emit('respawn');
        this._enterIntro(NebulaRunRound.ReadySeconds);
    }

    _play(h, bPress) {
        this._sinceSpawn += h;
        const wasParked = this.scroll.parked;
        this.scroll.advance(h);
        if (!wasParked && this.scroll.parked) bossArrive(this);

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
        const ox = this.shipX;
        this.shipX = clamp(this.shipX + ix * NebulaRunRound.ShipSpeed * h, NebulaRunRound.ShipMinX, NebulaRunRound.ShipMaxX);
        this.shipY = clamp(this.shipY - iy * NebulaRunRound.ShipSpeed * h, NebulaRunRound.ShipMinY, NebulaRunRound.ShipMaxY);
        this.shipVX = (this.shipX - ox) / h;
        if (this.invuln > 0) this.invuln -= h;
        if (this.shieldFlash > 0) this.shieldFlash -= h;

        // the air gun: one lane, twin lanes, then the three-way fan
        this._fireCd -= h;
        this.firing = aHeld;
        const lanes = this.gunLevel + 1;
        if (aHeld && this._fireCd <= 0 && this.bullets.length + lanes <= NebulaRunRound.MaxBullets * lanes) {
            const x = this.shipX, y = this.shipY - 11;
            if (this.gunLevel === 0) this.bullets.push({ x, y, vx: 0 });
            else if (this.gunLevel === 1) { this.bullets.push({ x: x - 4, y, vx: 0 }); this.bullets.push({ x: x + 4, y, vx: 0 }); }
            else { this.bullets.push({ x, y: y - 2, vx: 0 }); this.bullets.push({ x: x - 4, y, vx: -NebulaRunRound.FanVX }); this.bullets.push({ x: x + 4, y, vx: NebulaRunRound.FanVX }); }
            this._fireCd = NebulaRunRound.FireGap;
            this._emit('fire', { n: lanes });
        }

        // the bomb
        if (bPress && !this.bombActive) {
            this.bombActive = true; this.bombT = 0; this.bombCluster = this.cluster;
            this.bombSX = this.shipX; this.bombSY = this.shipY - 6;
            this.bombTX = this.shipX; this.bombTMapY = this.scroll.toMapY(this.shipY - NebulaRunRound.SightDist);
            this._bombs++;
            this._emit('bomb');
        }

        this._moveBullets(h);
        this._updateBomb(h);
        if (this.p !== Phase.Playing) return;          // the bomb brought the boss down
        this._spawnAir(h);
        this._moveAir(h, true);
        this._updateGround(h);
        updateBoss(this, h);
        this._moveShots(h);
        this._moveFlak(h);
        this._spawnBolts(h);
        this._moveBolts(h, true);
        this._moveCaps(h);
        this._updateFx(h);
        if (this.p === Phase.Playing) this._collide();

        // the sight: red on a target, cyan on a domed one, gold over the hidden beacon
        let mode = 0;
        const sx = this.sightX, sy = this.sightY;
        for (const g of this.ground) {
            if (!g.alive) continue;
            const gy = this.scroll.toScreenY(g.mapY);
            const dx = g.x - sx, dy = gy - sy, r = groundRadius(g) + 3;
            if (dx * dx + dy * dy >= r * r) continue;
            if (g.kind === GroundKind.Beacon) { if (mode === 0) mode = 3; continue; }
            if (isShielded(g) || (g.kind === GroundKind.Iris && !(this.boss && this.boss.irisOpen))) { if (mode !== 1) mode = 2; continue; }
            mode = 1;
        }
        this.sightMode = mode;
    }

    // ------------------------------------------------------------------ the air
    _spawnAir(h) {
        // the carriers cross at their progress points
        const prog = this.scroll.progress, def = this.def;
        if (this._carrierIdx < def.carriers.length && prog >= def.carriers[this._carrierIdx] && this._sinceSpawn >= NebulaRunRound.SpawnGrace) {
            this._carrierIdx++;
            const c = this._newAir(AirKind.Carrier, this._range(70, 250), NebulaScroll.FieldY - 14);
            c.hp = c.maxHp = 3; c.hoverY = this._range(58, 72); c.side = c.x < 160 ? 1 : -1;
        }
        if (this._sinceSpawn < NebulaRunRound.SpawnGrace || (this.boss != null && this.boss.dead)) return;
        const rate = this.airRate * def.airMul * (this.bossZone ? def.bossAir : (0.8 + 0.4 * prog));
        this._spawnAcc += rate * h;
        while (this._spawnAcc >= 1) { this._spawnAcc -= 1; this._spawnGroup(prog); }
    }

    _discAlive() { for (const e of this.air) if (e.alive && e.kind === AirKind.Disc) return true; return false; }

    _spawnGroup(prog) {
        const mix = this.def.air;
        let sum = 0; for (const k of Object.keys(mix)) sum += mix[k];
        let r = this.rng.nextDouble() * sum, kind = 'spinner';
        for (const k of Object.keys(mix)) { r -= mix[k]; if (r < 0) { kind = k; break; } }
        if (kind === 'disc' && (this.bossZone || prog < 0.1 || this._discAlive())) kind = 'spinner';
        switch (kind) {
            case 'disc': {
                const d = this._newAir(AirKind.Disc, this._range(60, 260), NebulaScroll.FieldY - 14);
                d.hp = d.maxHp = 3; d.hoverY = this._range(56, 76); d.fireT = this.discGap * 0.6;
                break;
            }
            case 'spinner': {
                const n = prog < 0.4 && this.sector < 3 ? 3 : 4;
                const span = (n - 1) * 30;
                const cx = this._range(40 + span * 0.5, 280 - span * 0.5);
                const turn = this._range(74, Math.min(140, this.shipY - 44));
                for (let i = 0; i < n; i++) {
                    const e = this._newAir(AirKind.Spinner, cx - span * 0.5 + i * 30, NebulaScroll.FieldY - 12 - (i % 2) * 14);
                    e.turnY = turn + (i % 2) * 10;
                }
                break;
            }
            case 'dart': {
                const m = (prog > 0.3 || this.sector > 1) && this.rng.nextDouble() < 0.5 ? 2 : 1;
                const side = this.rng.nextDouble() < 0.5 ? -1 : 1;
                for (let i = 0; i < m; i++) {
                    const x = clamp(this.shipX + this._range(-26, 26) + i * side * 44, 24, 296);
                    this._newAir(AirKind.Dart, x, NebulaScroll.FieldY - 12 - i * 46);
                }
                break;
            }
            case 'weaver': {
                const m = this.rng.nextDouble() < 0.4 ? 2 : 1;
                const side = this.rng.nextDouble() < 0.5 ? -1 : 1;
                const y = this._range(52, 100);
                for (let i = 0; i < m; i++) {
                    const e = this._newAir(AirKind.Weaver, side < 0 ? -10 - i * 34 : 330 + i * 34, y);
                    e.side = -side; e.hoverY = y; e.t = i * 0.6;
                }
                break;
            }
            case 'mine': {
                const m = this.rng.nextDouble() < 0.5 ? 2 : 1;
                for (let i = 0; i < m; i++) {
                    const e = this._newAir(AirKind.Mine, this._range(40, 280), NebulaScroll.FieldY - 10 - i * 40);
                    e.hp = e.maxHp = 2; e.cx = e.x; e.armT = -1;
                }
                break;
            }
        }
    }

    _newAir(kind, x, y) {
        const e = { id: this._nextId++, kind, x, y, vx: 0, vy: 0, t: 0, mode: 0, hp: 1, maxHp: 1, turnY: 0, cx: 0, hoverY: 0,
            fireT: 0, flash: 0, alive: true, side: 1, armT: -1, boss: false, locked: false, fired: false, dx: 0, dy: 0 };
        this.air.push(e);
        return e;
    }

    _moveAir(h, live) {
        for (let i = this.air.length - 1; i >= 0; i--) {
            const e = this.air[i];
            if (!e.alive) { this.air.splice(i, 1); continue; }
            if (e.flash > 0) e.flash -= h;
            if (e.boss) continue;                           // the boss flies its own parts (bosses.js)
            e.t += h;
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
                case AirKind.Disc:
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
                case AirKind.Weaver: {
                    // across the tube on a sine; one fan of three as it crosses your column
                    e.vx = e.side * 74;
                    const ny = e.hoverY + 14 * Math.sin(e.t * 3.2);
                    e.vy = (ny - e.y) / h;
                    e.x += e.vx * h; e.y = ny;
                    if (live && !e.fired && Math.abs(e.x - this.shipX) < 46 && e.x > 20 && e.x < 300) {
                        e.fired = true;
                        if (this.rng.nextDouble() < this.airFire + 0.3) this._fan(e.x, e.y + 5, 3, 0.3, 0);
                    }
                    if ((e.side > 0 && e.x > 336) || (e.side < 0 && e.x < -16)) e.alive = false;
                    break;
                }
                case AirKind.Mine: {
                    // drifts down with the ground; close to the ship it ARMS and bursts into a ring
                    e.vy = this.scrollSpeed + 12;
                    const nx = e.cx + 10 * Math.sin(e.t * 1.6);
                    e.vx = (nx - e.x) / h;
                    e.x = nx; e.y += e.vy * h;
                    if (live && e.armT < 0) {
                        const dx = e.x - this.shipX, dy = e.y - this.shipY;
                        if (dx * dx + dy * dy < NebulaRunRound.MineSense * NebulaRunRound.MineSense && !this.shipDown) { e.armT = 0; this._emit('mineArm'); }
                    }
                    if (e.armT >= 0) {
                        e.armT += h;
                        if (e.armT >= NebulaRunRound.MineFuse) { this._mineBurst(e); break; }
                    }
                    if (e.y > NebulaScroll.FieldBottom + 12) e.alive = false;
                    break;
                }
                case AirKind.Carrier:
                    if (e.mode === 0) {
                        e.vx = 0; e.vy = 42; e.y += e.vy * h;
                        if (e.y >= e.hoverY) { e.mode = 1; e.t = 0; }
                    } else {
                        e.vx = e.side * 40; e.vy = 0; e.x += e.vx * h;
                        if (e.x < -16 || e.x > 336) e.alive = false;
                    }
                    break;
            }
        }
    }

    _mineBurst(e) {
        e.alive = false;
        const n = NebulaRunRound.MineShots, sp = this.shotSpeed * this.def.shotMul * 0.8;
        for (let k = 0; k < n; k++) {
            const a = (k + 0.5) / n * Math.PI * 2;
            this.shots.push({ id: this._nextId++, x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, source: 3 });
        }
        this.bursts.push({ x: e.x, y: e.y, onGround: false, t: 0, size: 1 });
        this._emit('mineBurst');
        this._cues.emit(SoundCue.Miss);
        if (this.p === Phase.Playing && !this.shipDown && this.invuln <= 0) {
            const dx = e.x - this.shipX, dy = e.y - this.shipY, r = NebulaRunRound.MineBlast + NebulaRunRound.ShipR;
            if (dx * dx + dy * dy < r * r) this._hit(7);
        }
    }

    _fireAt(x, y, source, mul = 1) {
        let dx = this.shipX - x, dy = this.shipY - y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) { dx = 0; dy = 1; d = 1; }
        const sp = this.shotSpeed * this.def.shotMul * mul;
        this.shots.push({ id: this._nextId++, x, y, vx: dx / d * sp, vy: dy / d * sp, source });
        this._emit('enemyFire');
    }

    // a fan of n shots spread over `spread` radians, centred on the ship
    _fan(x, y, n, spread, source, mul = 1) {
        const a0 = Math.atan2(this.shipY - y, this.shipX - x);
        const sp = this.shotSpeed * this.def.shotMul * mul;
        for (let k = 0; k < n; k++) {
            const a = a0 + (n > 1 ? (k / (n - 1) - 0.5) * spread : 0);
            this.shots.push({ id: this._nextId++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, source });
        }
        this._emit('enemyFire', { n });
    }

    // a ring of n shots
    _ring(x, y, n, source, mul = 1, phase = 0) {
        const sp = this.shotSpeed * this.def.shotMul * mul;
        for (let k = 0; k < n; k++) {
            const a = phase + k / n * Math.PI * 2;
            this.shots.push({ id: this._nextId++, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, source });
        }
        this._emit('enemyFire', { n });
    }

    _moveBullets(h) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.y -= NebulaRunRound.BulletSpeed * h; b.x += b.vx * h;
            let gone = b.y < NebulaScroll.FieldY - 10 || b.x < 4 || b.x > 316;
            if (!gone)
                for (const e of this.air) {
                    if (!e.alive) continue;
                    const r = airRadius(e);
                    if (Math.abs(b.x - e.x) < r + 1.5 && Math.abs(b.y - e.y) < r + 5) {
                        gone = true;
                        if (e.locked) { e.flash = 0.08; this._emit('ping'); break; }
                        e.hp--;
                        if (e.hp <= 0) this._killAir(e, true);
                        else { e.flash = 0.12; this._emit('clink', { boss: e.boss }); this._cues.emit(SoundCue.Tick); }
                        break;
                    }
                }
            if (gone) this.bullets.splice(i, 1);
        }
    }

    _killAir(e, points) {
        e.alive = false;
        if (points) {
            const pts = airPoints(e);
            this._addScore(pts); this.airKills++; this.secAir++;
            this.popups.push({ x: e.x, y: e.y, onGround: false, t: 0, points: pts, text: null });
        }
        const big = e.kind === AirKind.Disc || e.kind === AirKind.Carrier || e.boss;
        this.bursts.push({ x: e.x, y: e.y, onGround: false, t: 0, size: e.kind === AirKind.Eye ? 4 : big ? 2 : 1 });
        if (big) this.shake = Math.max(this.shake, e.boss ? 3 : 1.2);
        this._emit(big ? 'boom' : 'pop', { big, kind: e.kind });
        this._cues.emit(SoundCue.Hit);
        if (e.kind === AirKind.Carrier && points) this._dropCap(e.x, e.y);
        if (e.boss && this.boss != null) this.boss.onPartDown(e);
    }

    // ------------------------------------------------------------------ pods (power-ups)
    _dropCap(x, y) {
        let kind = this._capFlip++ % 2 === 0 ? CapKind.Wide : CapKind.Cluster;
        if (kind === CapKind.Wide && this.gunLevel >= 2) kind = CapKind.Cluster;
        if (kind === CapKind.Cluster && this.cluster) kind = this.gunLevel < 2 ? CapKind.Wide : CapKind.Bonus;
        this.caps.push({ id: this._nextId++, x: clamp(x, 24, 296), x0: clamp(x, 24, 296), y, kind, t: 0 });
        this._emit('cap');
    }

    _moveCaps(h) {
        for (let i = this.caps.length - 1; i >= 0; i--) {
            const c = this.caps[i];
            c.t += h; c.y += NebulaRunRound.CapFall * h;
            c.x = clamp(c.x0 + 9 * Math.sin(c.t * 2.2), 16, 304);
            if (c.y > NebulaScroll.FieldBottom + 10) { this.caps.splice(i, 1); continue; }
            if (this.p !== Phase.Playing || this.shipDown) continue;
            const dx = c.x - this.shipX, dy = c.y - this.shipY;
            if (dx * dx + dy * dy < NebulaRunRound.CapR * NebulaRunRound.CapR) {
                this.caps.splice(i, 1);
                this._caps++;
                let text;
                if (c.kind === CapKind.Wide) { this.gunLevel = Math.min(2, this.gunLevel + 1); text = this.gunLevel === 2 ? 'FAN GUN' : 'TWIN GUN'; }
                else if (c.kind === CapKind.Cluster) { this.cluster = true; text = 'CLUSTER'; }
                else { this._addScore(NebulaRunRound.CapBonus); text = String(NebulaRunRound.CapBonus); }
                this.popups.push({ x: c.x, y: c.y - 8, onGround: false, t: 0, points: 0, text });
                this._emit('pickup', { pod: c.kind });
                this._cues.emit(SoundCue.Bonus);
            }
        }
    }

    // ------------------------------------------------------------------ the ground
    _updateBomb(h) {
        if (!this.bombActive) return;
        this.bombT += h;
        if (this.bombT < NebulaRunRound.BombFlight) return;
        this.bombActive = false;
        const bx = this.bombTX, by = this.scroll.toScreenY(this.bombTMapY);
        const R = this.bombCluster ? NebulaRunRound.ClusterR : NebulaRunRound.BlastR;
        let hit = false, pinged = false;
        for (const g of this.ground) {
            if (!g.alive) continue;
            const gy = this.scroll.toScreenY(g.mapY);
            const dx = g.x - bx, dy = gy - by, r = R + groundRadius(g) - 2;
            if (dx * dx + dy * dy >= r * r) continue;
            if (g.kind === GroundKind.Beacon) {
                g.alive = false; g.hidden = false; g.deadT = 0;
                this.secBeacon = true; this._beacons++;
                this.popups.push({ x: g.x, y: g.mapY, onGround: true, t: 0, points: 0, text: 'BEACON' });
                this._emit('beacon');
                this._cues.emit(SoundCue.Bonus);
                hit = true;
                continue;
            }
            if (isShielded(g) || (g.kind === GroundKind.Iris && !(this.boss && this.boss.irisOpen))) {
                g.hitFlash = 0.3; pinged = true;
                continue;
            }
            hit = true;
            g.hp--;
            if (g.hp <= 0) this._killGround(g);
            else {
                g.hitFlash = 0.3;
                this.bursts.push({ x: g.x, y: g.mapY, onGround: true, t: 0, size: 0 });
                this._emit('clink', { boss: g.boss, ground: true });
                this._cues.emit(SoundCue.Hit);
            }
            if (this.p !== Phase.Playing) break;
        }
        if (hit) this._bombHits++;
        if (pinged) { this._emit('ping', { dome: true }); this.bursts.push({ x: bx, y: this.bombTMapY, onGround: true, t: 0, size: 5 }); }
        this.bursts.push({ x: bx, y: this.bombTMapY, onGround: true, t: 0, size: 3, cluster: this.bombCluster });
        this._emit('blast', { cluster: this.bombCluster, hit });
        if (!hit && !pinged) this._cues.emit(SoundCue.Miss);
    }

    _killGround(g) {
        g.alive = false; g.deadT = 0;
        const pts = groundPoints(g);
        this._addScore(pts);
        if (!g.boss) this.groundKills++;
        this.popups.push({ x: g.x, y: g.mapY, onGround: true, t: 0, points: pts, text: null });
        const big = g.boss || g.kind === GroundKind.Dump || g.kind === GroundKind.Gen || g.kind === GroundKind.Bunker;
        this.bursts.push({ x: g.x, y: g.mapY, onGround: true, t: 0, size: big ? 2 : 1 });
        this.shake = Math.max(this.shake, g.boss ? 3 : big ? 1.6 : 0.8);
        this._emit('boom', { big, ground: true, kind: g.kind });
        this._cues.emit(big ? SoundCue.Bonus : SoundCue.Hit);
        if (g.kind === GroundKind.Gen) this._emit('genDown');
        if (g.kind === GroundKind.Dump) this._dropCap(g.x, this.scroll.toScreenY(g.mapY));
        if (g.boss && this.boss != null) this.boss.onPartDown(g);
    }

    _updateGround(h) {
        const fireMul = this.def.fireMul;
        for (const g of this.ground) {
            if (!g.alive) { g.deadT += h; continue; }
            if (g.hitFlash > 0) g.hitFlash -= h;
            if (g.fireFlash > 0) g.fireFlash -= h;
            if (g.boss) continue;                           // the boss works its own parts (bosses.js)
            g.armed = false;
            const sy = this.scroll.toScreenY(g.mapY);
            const inBand = sy > NebulaScroll.FieldY + 6 && sy < this.shipY - 34;
            switch (g.kind) {
                case GroundKind.Tank: {
                    // it crawls its road; a bomb falling near it makes it gun the engine (the dodge)
                    let sp = 1;
                    if (this.bombActive && Math.abs(this.bombTX - g.x) < 34 && Math.abs(this.bombTMapY - g.mapY) < 20) sp = 1.9;
                    g.x += g.vx * sp * h;
                    if (g.x < g.minX) { g.x = g.minX; g.vx = Math.abs(g.vx); }
                    if (g.x > g.maxX) { g.x = g.maxX; g.vx = -Math.abs(g.vx); }
                    if (this.def.tankFire && inBand) {
                        g.armed = true;
                        g.fireT -= h;
                        if (g.fireT <= 0) { this._fireAt(g.x, sy - 4, 1); g.fireFlash = 0.15; g.fireT = this.turretGap * fireMul * this._range(1.5, 2.1); }
                    }
                    break;
                }
                case GroundKind.Turret:
                    if (inBand) {
                        g.armed = true;
                        g.fireT -= h;
                        if (g.fireT <= 0) {
                            this._fireAt(g.x, sy, 1);
                            g.fireFlash = 0.15;
                            g.fireT = this.turretGap * fireMul * this._range(0.85, 1.15);
                        }
                    }
                    break;
                case GroundKind.Bunker:
                    // an armoured gun: a pair of shots, a beat apart
                    if (inBand) {
                        g.armed = true;
                        g.fireT -= h;
                        if (g.fireT <= 0) {
                            this._fireAt(g.x, sy - 2, 1);
                            g.fireFlash = 0.15;
                            if (g.burst === 0) { g.burst = 1; g.fireT = 0.18; }
                            else { g.burst = 0; g.fireT = this.turretGap * fireMul * this._range(1.3, 1.6); }
                        }
                    }
                    break;
                case GroundKind.Flak:
                    if (sy > NebulaScroll.FieldY + 6 && sy < this.shipY - 24) {
                        g.armed = true;
                        g.fireT -= h;
                        if (g.fireT <= 0) { this._launchFlak(g.x, sy, 1); g.fireFlash = 0.2; g.fireT = this.flakGap * fireMul * this._range(0.85, 1.2); }
                    }
                    break;
            }
        }
    }

    // ------------------------------------------------------------------ flak and lightning
    // A flak shell climbs from its gun to the point the ship was at when it fired (the marker shows where), then bursts
    // there: a ring that kills for a moment. Moving away is the whole defence.
    _launchFlak(x, y, source) {
        const tx = this.shipX, ty = this.shipY;
        const d = Math.hypot(tx - x, ty - y);
        const T = clamp(d / NebulaRunRound.FlakSpeed, 0.6, 1.15);
        this.flak.push({ id: this._nextId++, x0: x, y0: y, tx, ty, t: 0, T, bt: 0, burst: false, source });
        this._emit('flak');
    }

    _moveFlak(h) {
        for (let i = this.flak.length - 1; i >= 0; i--) {
            const f = this.flak[i];
            f.t += h;
            if (!f.burst && f.t >= f.T) {
                f.burst = true; f.bt = 0;
                this._emit('flakBurst');
                if (Math.abs(f.tx - this.shipX) < 40 && Math.abs(f.ty - this.shipY) < 40) this.shake = Math.max(this.shake, 1);
            }
            if (f.burst) { f.bt += h; if (f.bt >= NebulaRunRound.FlakShow) this.flak.splice(i, 1); }
        }
    }

    _spawnBolts(h) {
        if (!this.def.bolts || this.bossZone) return;
        this._boltT -= h;
        if (this._boltT > 0) return;
        this._boltT = this.boltGap * this._range(0.8, 1.2);
        this.callBolt(clamp(this.shipX + this._range(-34, 34), 20, 300), false);
    }

    callBolt(x, boss) {
        this.bolts.push({ id: this._nextId++, x, t: 0, boss, struck: false });
        this._emit('boltWarn');
    }

    _moveBolts(h, live) {
        for (let i = this.bolts.length - 1; i >= 0; i--) {
            const b = this.bolts[i];
            b.t += h;
            if (!b.struck && b.t >= NebulaRunRound.BoltWarn) {
                b.struck = true;
                this._emit('bolt');
                this.shake = Math.max(this.shake, 1.4);
                // the bolt takes whatever small craft is in its column
                if (live) for (const e of this.air) if (e.alive && !e.boss && Math.abs(e.x - b.x) < NebulaRunRound.BoltHalf + airRadius(e)) this._killAir(e, false);
            }
            if (b.t >= NebulaRunRound.BoltWarn + NebulaRunRound.BoltStrike) this.bolts.splice(i, 1);
        }
    }

    _moveShots(h) {
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i];
            s.x += s.vx * h; s.y += s.vy * h;
            if (s.x < 2 || s.x > 318 || s.y < NebulaScroll.FieldY - 10 || s.y > NebulaScroll.FieldBottom + 10) this.shots.splice(i, 1);
        }
    }

    _updateFx(h) {
        for (let i = this.bursts.length - 1; i >= 0; i--) { this.bursts[i].t += h; if (this.bursts[i].t > 1.2) this.bursts.splice(i, 1); }
        for (let i = this.popups.length - 1; i >= 0; i--) { this.popups[i].t += h; if (this.popups[i].t > (this.popups[i].text ? 1.3 : 0.9)) this.popups.splice(i, 1); }
    }

    // ------------------------------------------------------------------ score, extra ships, the tally
    _addScore(n) {
        this.score += n;
        while (this.score >= this.nextExtra) {
            this.nextExtra += NebulaRunRound.ExtraEvery;
            if (this.ships < NebulaRunRound.MaxShips) this.ships++;
            this._extras++;
            this.banner = { text: 'EXTRA SHIP', t: 0 };
            this._emit('extra');
            this._cues.emit(SoundCue.Bonus);
        }
    }

    onBossDown() {
        const b = this.boss;
        b.dead = true;
        this.p = Phase.BossDown; this.phaseTime = 0;
        this.shots.length = 0; this.flak.length = 0; this.bolts.length = 0; this.bombActive = false;
        for (const e of this.air) if (e.alive && !e.boss) { e.alive = false; this.bursts.push({ x: e.x, y: e.y, onGround: false, t: 0, size: 1 }); }
        for (const g of b.parts) {
            if (!g.alive) continue;
            const ground = g.mapY !== undefined;
            g.alive = false; g.deadT = 0;
            this.bursts.push({ x: g.x, y: ground ? g.mapY : g.y, onGround: ground, t: 0, size: 2 });
        }
        this.shake = 4; this.flash = 0.35;
        this._emit('bossDown', { sector: this.sector });
        this._cues.emit(SoundCue.Bonus);
    }

    _enterTally() {
        this.p = Phase.Tally; this.phaseTime = 0;
        this.sectorsCleared++;
        let gk = 0;
        for (const g of this.ground) if (!g.boss && g.kind !== GroundKind.Beacon && !g.alive) gk++;
        const lines = [
            { label: 'GROUND ' + gk + ' OF ' + this.secGround, value: gk * 50 },
            { label: 'AIR ' + this.secAir, value: this.secAir * 10 },
            { label: this.def.bossName, value: this.sector * NebulaRunRound.BossBonus },
            { label: this.secLost === 0 ? 'NO MISS' : 'SHIPS LOST ' + this.secLost, value: this.secLost === 0 ? NebulaRunRound.NoMissBonus : 0 },
            { label: this.secBeacon ? 'BEACON FOUND' : 'BEACON  ----', value: this.secBeacon ? NebulaRunRound.BeaconBonus : 0 },
        ];
        let total = 0;
        for (const l of lines) { l.shown = false; total += l.value; }
        this.tally = { sector: this.sector, lines, total, shownTotal: 0 };
        this.caps.length = 0;
        this._emit('sectorClear', { sector: this.sector, final: this.finalSector });
    }

    _updateTally() {
        const T = this.tally;
        for (let i = 0; i < T.lines.length; i++) {
            const l = T.lines[i];
            if (l.shown || this.phaseTime < NebulaRunRound.TallyFirst + i * NebulaRunRound.TallyStep) continue;
            l.shown = true;
            T.shownTotal += l.value;
            this._addScore(l.value);
            this._emit('tally', { i, value: l.value });
            this._cues.emit(SoundCue.Tick);
        }
    }

    // ------------------------------------------------------------------ hits on the ship
    _collide() {
        if (this.shipDown || this.invuln > 0) return;
        const sx = this.shipX, sy = this.shipY;
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const s = this.shots[i];
            const dx = s.x - sx, dy = s.y - sy, r = NebulaRunRound.ShotR + NebulaRunRound.ShipR;
            if (dx * dx + dy * dy >= r * r) continue;
            this.shots.splice(i, 1);
            if (this._hit(s.source === 0 ? 2 : s.source === 1 ? 3 : s.source === 2 ? 4 : 7)) return;
        }
        for (const e of this.air) {
            if (!e.alive || e.boss) continue;
            const dx = e.x - sx, dy = e.y - sy, r = airRadius(e) + NebulaRunRound.ShipR - 1;
            if (dx * dx + dy * dy >= r * r) continue;
            if (this.mercyActive) { this._killAir(e, true); this._hit(1); continue; }
            this._killAir(e, false);
            if (this._hit(1)) return;
        }
        for (const f of this.flak) {
            if (!f.burst || f.bt > NebulaRunRound.FlakLethal) continue;
            const dx = f.tx - sx, dy = f.ty - sy, r = NebulaRunRound.FlakR + NebulaRunRound.ShipR - 2;
            if (dx * dx + dy * dy >= r * r) continue;
            f.bt = NebulaRunRound.FlakLethal + 0.001;
            if (this._hit(f.source === 2 ? 4 : 5)) return;
        }
        for (const b of this.bolts) {
            if (!b.struck || b.t >= NebulaRunRound.BoltWarn + NebulaRunRound.BoltStrike) continue;
            if (Math.abs(b.x - sx) >= NebulaRunRound.BoltHalf + NebulaRunRound.ShipR - 1) continue;
            if (this._hit(6)) return;
            break;
        }
    }

    // true = the ship is lost
    _hit(cause) {
        if (this.mercyActive) {
            if (this.shieldFlash <= 0) { this._shieldHits++; this._emit('shield'); this._cues.emit(SoundCue.Miss); }
            this.shieldFlash = 0.5;
            return false;
        }
        this.deaths++; this.secLost++;
        this.lastDeathCause = cause;
        this._deathBy[cause]++;
        this.ships--;
        this.shipDown = true;
        this.bombActive = false; this.bullets.length = 0;
        this.gunLevel = Math.max(0, this.gunLevel - 1); this.cluster = false;
        this.bursts.push({ x: this.shipX, y: this.shipY, onGround: false, t: 0, size: 4 });
        this.shake = 3.5;
        this._emit('crash');
        this._cues.emit(SoundCue.Die);
        this.p = Phase.ShipLost; this.phaseTime = 0;
        return true;
    }

    collectStats(into) {
        const d = this._deathBy;
        add(into, 'deaths', this.deaths);
        add(into, 'dRam', d[1]); add(into, 'dAirShot', d[2]); add(into, 'dGndShot', d[3]); add(into, 'dBoss', d[4]);
        add(into, 'dFlak', d[5]); add(into, 'dBolt', d[6]); add(into, 'dMine', d[7]);
        add(into, 'airKills', this.airKills);
        add(into, 'gndKills', this.groundKills);
        add(into, 'bombAcc', this._bombs > 0 ? this._bombHits / this._bombs : 0);
        add(into, 'bossSec', this._bossSeconds);
        add(into, 'sectors', this.sectorsCleared);
        add(into, 'reached', this.sector - 1 + this.scroll.progress);
        add(into, 'pods', this._caps);
        add(into, 'beacons', this._beacons);
        add(into, 'extras', this._extras);
        add(into, 'shield', this._shieldHits);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

// ------------------------------------------------------------------ the machine (not mercy knobs)
NebulaRunRound.ShipSpeed = 112;
NebulaRunRound.ShipMinX = 20; NebulaRunRound.ShipMaxX = 300; NebulaRunRound.ShipMinY = 100; NebulaRunRound.ShipMaxY = 214;
NebulaRunRound.SightDist = 64;
NebulaRunRound.BombFlight = 0.42;
NebulaRunRound.BlastR = 8; NebulaRunRound.ClusterR = 16;
NebulaRunRound.BulletSpeed = 330; NebulaRunRound.FanVX = 62;
NebulaRunRound.FireGap = 0.13;
NebulaRunRound.MaxBullets = 3;                 // per lane
NebulaRunRound.ShipR = 5;
NebulaRunRound.ShotR = 3;
NebulaRunRound.FlakSpeed = 150; NebulaRunRound.FlakR = 13; NebulaRunRound.FlakLethal = 0.28; NebulaRunRound.FlakShow = 0.5;
NebulaRunRound.BoltWarn = 1.0; NebulaRunRound.BoltStrike = 0.32; NebulaRunRound.BoltHalf = 6;
NebulaRunRound.MineSense = 34; NebulaRunRound.MineFuse = 0.6; NebulaRunRound.MineShots = 6; NebulaRunRound.MineBlast = 9;
NebulaRunRound.CapFall = 30; NebulaRunRound.CapR = 12; NebulaRunRound.CapBonus = 1000;
NebulaRunRound.CardSeconds = 2.8; NebulaRunRound.ReadySeconds = 1.6; NebulaRunRound.LostSeconds = 1.8;
NebulaRunRound.TallySeconds = 3.8; NebulaRunRound.TallyFirst = 0.5; NebulaRunRound.TallyStep = 0.4;
NebulaRunRound.InvulnSeconds = 2.0; NebulaRunRound.BannerSeconds = 1.8;
NebulaRunRound.SpawnGrace = 2.4;
NebulaRunRound.ExtraFirst = 30000; NebulaRunRound.ExtraEvery = 70000; NebulaRunRound.MaxShips = 6;
NebulaRunRound.BossBonus = 2000;               // x the sector number
NebulaRunRound.NoMissBonus = 3000; NebulaRunRound.BeaconBonus = 5000;
NebulaRunRound.SubStep = 1 / 120;

NebulaRunRound.Phase = Phase;
