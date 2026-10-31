// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE BOSSES (a helper local to this game: rules only).
//
// At the end of each sector the scroll parks and the sector's boss is LIVE. A boss is a set of PARTS: ground ones are
// bombed (round.ground, flagged `boss`), the air ones are shot (round.air, flagged `boss`). `req` are the parts that
// must go; when `core` goes (or, on the radar isle, the last of the four cores) the boss is down (round.onBossDown).
// Every volley is telegraphed: the radar's sweep, a glowing barrel (`charging`), the iris opening, the bolt's dotted
// column. Screen offsets below are (dx, dy) from the boss centre with y DOWN the tube; parts store map offsets.
//
//   RADAR ISLE (1)      four cores (2 bombs) round a radar; each radar PASS a live core fires as the sweep crosses it
//                       (bossPass knob; the mercy credit: once a pass)
//   THE CRAWLER (2)     a giant tank pacing the crater floor. Two flak towers (2) guard the engine heart (3); the main
//                       cannon (2) winds up and fires a fan of five
//   THE PRISM (3)       three shield generators (2) hold a dome over the prism heart (4); the heart fires fans (five
//                       while domed, seven once bare); two corner turrets
//   THE THUNDERHEAD (4) an AIR boss: it sails in and paces the top of the tube. Two wing pods (8 shots each) fire
//                       aimed shots; the eye (22) is locked until both go; it calls lightning on your column, and
//                       once bare fires fans too
//   THE MOTHER (5)      two generators (2) shield the IRIS core (5); once they go the iris cycles: shut, opening (the
//                       telegraph), open (it fires a ring of eight; only now can it be bombed). Around it: two flak
//                       batteries, four bunkers, two hangars that launch darts. Bringing it down wins the game.
import { SoundCue } from '../../sdk/index.js';
import { NebulaScroll } from './scroll.js';
import { AirKind, GroundKind, isShielded } from './kinds.js';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class Boss {
    constructor(r, kind, name, mapY, screenY) {
        this.r = r; this.kind = kind; this.name = name;
        this.mapY = mapY;                // the centre on the ground map (for an air boss: where it parks over)
        this.x = 160; this.y = screenY;  // the centre on the tube (y moves only for the air boss)
        this.vx = 0; this.vy = 0; this.t = 0;
        this.seen = 0;                   // seconds since it came into sight (the WARNING plate)
        this.w = 200; this.h = 80;       // the hull, for the picture and the break-up
        this.parts = []; this.req = []; this.core = null;
        this.dead = false; this.spawned = false; this.entering = false;
        this.phase = 0; this.passes = 0; this.firedThisPass = 0;              // the radar
        this.attackT = 0; this.charging = false;                             // a wind-up and a volley
        this.irisOpen = false; this.irisState = 0; this.irisT = 0;            // the mother's iris
        this.hangarT = 0; this.boltT = 0;
    }

    // the share of the required parts' armour still standing (the HUD's bar)
    get health() {
        let hp = 0, max = 0;
        for (const p of this.req) { max += p.maxHp; if (p.alive) hp += p.hp; }
        return max > 0 ? hp / max : 0;
    }

    get coreLocked() { return this.core != null && (isShielded(this.core) || this.core.locked === true); }

    part(kind, sdx, sdy, hp) {
        const g = this.r._addGround(kind, this.x + sdx, this.mapY - sdy);
        g.boss = true; g.dx = sdx; g.dy = -sdy; g.maxHp = g.hp = hp;
        this.parts.push(g);
        return g;
    }

    airPart(kind, sdx, sdy, hp) {
        const e = this.r._newAir(kind, this.x + sdx, this.y + sdy);
        e.boss = true; e.dx = sdx; e.dy = sdy; e.maxHp = e.hp = hp;
        this.parts.push(e);
        return e;
    }

    onPartDown(p) {
        const r = this.r;
        if (this.req.includes(p)) { r._emit('partDown', { kind: p.kind }); r.shake = Math.max(r.shake, 3.2); }
        const done = this.core != null ? !this.core.alive : this.req.every(q => !q.alive);
        if (done && !this.dead) r.onBossDown();
    }
}

// ------------------------------------------------------------------ building (at the sector's start)
export function buildBoss(r) {
    const def = r.def;
    const mapY = r.sectorLength + (NebulaScroll.FieldBottom - def.bossScreenY);
    const b = r.boss = new Boss(r, def.boss, def.bossName, mapY, def.bossScreenY);
    switch (b.kind) {
        case 'radar': {
            b.w = 196; b.h = 84;
            r._addSite(2, 160, mapY, 196, 84);
            for (let i = 0; i < 4; i++) {
                const c = b.part(GroundKind.Core, CoreDX[i], CoreDY[i], 2);
                c.coreIndex = i;
                // the radar (sweeping clockwise on the tube from straight up) crosses this core at:
                let a = Math.atan2(CoreDY[i], CoreDX[i]) * 180 / Math.PI + 90;
                if (a < 0) a += 360;
                c.firePhase = a / 360;
                b.req.push(c);
            }
            break;
        }
        case 'crawler': {
            b.w = 112; b.h = 54;
            r._addSite(6, 160, mapY, 296, 74);
            const fl = b.part(GroundKind.Flak, -36, -10, 2), fr = b.part(GroundKind.Flak, 36, -10, 2);
            b.part(GroundKind.Cannon, 0, 18, 2);
            const heart = b.part(GroundKind.Heart, 0, -2, 3);
            heart.guards = [fl, fr];
            b.req.push(fl, fr, heart); b.core = heart;
            break;
        }
        case 'prism': {
            b.w = 232; b.h = 96;
            r._addSite(7, 160, mapY, 248, 100);
            const g1 = b.part(GroundKind.Gen, -58, 14, 2), g2 = b.part(GroundKind.Gen, 58, 14, 2), g3 = b.part(GroundKind.Gen, 0, -36, 2);
            const heart = b.part(GroundKind.Heart, 0, -2, 4);
            heart.guards = [g1, g2, g3];
            b.part(GroundKind.Turret, -106, -22, 1); b.part(GroundKind.Turret, 106, -22, 1);
            b.req.push(g1, g2, g3, heart); b.core = heart;
            break;
        }
        case 'thunderhead':
            b.w = 128; b.h = 40;
            r._addSite(8, 160, mapY, 300, 110);           // the storm's eye on the ground below it
            break;
        case 'mother': {
            b.w = 288; b.h = 104;
            r._addSite(9, 160, mapY, 296, 108);
            const gl = b.part(GroundKind.Gen, -44, 26, 2), gr = b.part(GroundKind.Gen, 44, 26, 2);
            const iris = b.part(GroundKind.Iris, 0, -2, 5);
            iris.guards = [gl, gr];
            b.part(GroundKind.Flak, -64, -34, 2); b.part(GroundKind.Flak, 64, -34, 2);
            for (const sx of [-1, 1]) { b.part(GroundKind.Bunker, sx * 102, -22, 2); b.part(GroundKind.Bunker, sx * 102, 30, 2); }
            b.part(GroundKind.Hangar, -134, 2, 3); b.part(GroundKind.Hangar, 134, 2, 3);
            b.req.push(gl, gr, iris); b.core = iris;
            break;
        }
    }
    bossRespawn(r);
}

// the scroll just parked under it
export function bossArrive(r) {
    const b = r.boss;
    if (b == null || b.dead) return;
    r._emit('bossWarn', { kind: b.kind });
    b.seen = 0;
    if (b.kind === 'thunderhead' && !b.spawned) {
        b.spawned = true; b.entering = true;
        b.x = 160; b.y = NebulaScroll.FieldY - 36;
        const pl = b.airPart(AirKind.Pod, -40, 4, 8), pr = b.airPart(AirKind.Pod, 40, 4, 8);
        const eye = b.airPart(AirKind.Eye, 0, -2, 22);
        eye.locked = true;
        b.req.push(pl, pr, eye); b.core = eye;
        pl.fireT = 1.2; pr.fireT = 2.0;
    }
}

// a ship lost in the fight: every clock back to its start (destroyed parts stay destroyed)
export function bossRespawn(r) {
    const b = r.boss;
    if (b == null) return;
    b.phase = 0; b.firedThisPass = 0; b.charging = false;
    b.attackT = 2.2 * r.bossPace; b.hangarT = 4 * r.bossPace; b.boltT = 2.4 * r.bossPace;
    b.irisState = 0; b.irisOpen = false; b.irisT = 1.4 * r.bossPace;
    for (const p of b.parts) { p.fireT = r.turretGap * r._range(0.8, 1.4); p.burst = 0; }
}

export function BossDownSeconds(r) { return r.boss != null && r.boss.kind === 'mother' ? 4.0 : 2.6; }

// ------------------------------------------------------------------ the fight
export function updateBoss(r, h) {
    if (!r.bossLive) return;
    const b = r.boss;
    r._bossSeconds += h;
    b.seen += h;
    switch (b.kind) {
        case 'radar': radar(r, b, h); break;
        case 'crawler': crawler(r, b, h); break;
        case 'prism': prism(r, b, h); break;
        case 'thunderhead': thunderhead(r, b, h); break;
        case 'mother': mother(r, b, h); break;
    }
}

function sy(r, g) { return r.scroll.toScreenY(g.mapY); }

// the wind-up then the volley: true on the step the volley goes
function windUp(r, b, h, charge, gap) {
    b.attackT -= h;
    if (!b.charging && b.attackT <= charge) { b.charging = true; r._emit('charge', { kind: b.kind }); }
    if (b.attackT > 0) return false;
    b.charging = false;
    b.attackT = gap * r._range(0.9, 1.1);
    return true;
}

// one aimed shot from each live part of a kind, on its own clock
function partGuns(r, b, h, kind, gap, flak) {
    for (const p of b.parts) {
        if (!p.alive || p.kind !== kind) continue;
        p.fireT -= h;
        if (p.fireT > 0) continue;
        const y = sy(r, p);
        if (flak) r._launchFlak(p.x, y, 2);
        else r._fireAt(p.x, y + 2, 2);
        p.fireFlash = 0.18;
        if (kind === GroundKind.Bunker && p.burst === 0) { p.burst = 1; p.fireT = 0.18; continue; }
        p.burst = 0;
        p.fireT = gap * r._range(0.85, 1.15);
    }
}

function radar(r, b, h) {
    b.t += h;
    const adv = h / Math.max(0.2, r.bossPass);
    let from = b.phase, to = b.phase + adv;
    for (;;) {
        const seg = Math.min(to, 1);
        for (const c of b.req) {
            if (!c.alive) continue;
            if (from < c.firePhase && c.firePhase <= seg) {
                if (r.mercyActive && b.firedThisPass >= 1) continue;       // credit 5: once a pass
                r._fireAt(c.x, sy(r, c) + 6, 2);
                c.fireFlash = 0.15;
                b.firedThisPass++;
            }
        }
        if (to >= 1) { to -= 1; from = 0; b.firedThisPass = 0; b.passes++; }
        else break;
    }
    b.phase = to;
}

function crawler(r, b, h) {
    b.t += h;
    const ox = b.x;
    b.x = 160 + 64 * Math.sin(b.t * 0.42);
    b.vx = (b.x - ox) / h;
    for (const p of b.parts) { p.x = b.x + p.dx; p.vx = b.vx; }
    const cannon = b.parts[2];
    if (cannon.alive && windUp(r, b, h, 0.7, 2.8 * r.bossPace)) {
        r._fan(cannon.x, sy(r, cannon) + 8, 5, 0.8, 2);
        cannon.fireFlash = 0.2;
    }
    if (!cannon.alive) b.charging = false;
    partGuns(r, b, h, GroundKind.Flak, r.flakGap * 1.15, true);
}

function prism(r, b, h) {
    b.t += h;
    const heart = b.core, bare = !isShielded(heart);
    if (windUp(r, b, h, 0.6, (bare ? 2.3 : 3.0) * r.bossPace)) {
        r._fan(heart.x, sy(r, heart) + 6, bare ? 7 : 5, bare ? 1.3 : 0.9, 2);
        heart.fireFlash = 0.2;
    }
    partGuns(r, b, h, GroundKind.Turret, r.turretGap * 1.3, false);
}

function thunderhead(r, b, h) {
    if (!b.spawned) return;
    if (b.entering) {
        b.vy = 34; b.y += b.vy * h; b.vx = 0;
        if (b.y >= ThunderY) { b.y = ThunderY; b.entering = false; b.vy = 0; b.t = 0; }
    } else {
        b.t += h;
        const ox = b.x;
        b.x = 160 + 76 * Math.sin(b.t * 0.4);
        b.vx = (b.x - ox) / h;
    }
    let pods = 0;
    for (const p of b.parts) {
        p.x = b.x + p.dx; p.y = b.y + p.dy; p.vx = b.vx; p.vy = b.vy;
        if (p.alive && p.kind === AirKind.Pod) pods++;
    }
    const eye = b.core;
    eye.locked = pods > 0;
    if (b.entering) return;
    for (const p of b.parts) {
        if (!p.alive || p.kind !== AirKind.Pod) continue;
        p.fireT -= h;
        if (p.fireT <= 0) { r._fireAt(p.x, p.y + 8, 2); p.fireT = 1.8 * r.bossPace * r._range(0.85, 1.15); }
    }
    b.boltT -= h;
    if (b.boltT <= 0) {
        r.callBolt(clamp(r.shipX + r._range(-10, 10), 20, 300), true);
        b.boltT = (pods > 0 ? 2.8 : 2.2) * r.bossPace;
    }
    if (pods === 0 && windUp(r, b, h, 0.6, 2.0 * r.bossPace)) r._fan(eye.x, eye.y + 12, 3, 0.55, 2);
}

function mother(r, b, h) {
    b.t += h;
    const iris = b.core;
    if (!isShielded(iris)) {
        b.irisT -= h;
        if (b.irisState === 0 && b.irisT <= 0) { b.irisState = 1; b.irisT = IrisOpening; r._emit('iris', { open: true }); }
        else if (b.irisState === 1 && b.irisT <= 0) {
            b.irisState = 2; b.irisOpen = true; b.irisT = 2.4;
            r._ring(iris.x, sy(r, iris), 8, 2, 0.85, b.t);
            iris.fireFlash = 0.25;
        } else if (b.irisState === 2 && b.irisT <= 0) {
            b.irisState = 0; b.irisOpen = false; b.irisT = 1.6 * r.bossPace;
            r._emit('iris', { open: false });
        }
    }
    partGuns(r, b, h, GroundKind.Bunker, r.turretGap * 1.5, false);
    partGuns(r, b, h, GroundKind.Flak, r.flakGap * 1.3, true);
    b.hangarT -= h;
    if (b.hangarT <= 0) {
        b.hangarT = 6 * r.bossPace;
        let any = false;
        for (const p of b.parts) {
            if (!p.alive || p.kind !== GroundKind.Hangar) continue;
            const d = r._newAir(AirKind.Dart, p.x, sy(r, p) + 10);
            d.t = 0.2;
            p.fireFlash = 0.3; any = true;
        }
        if (any) { r._emit('launch'); r._cues.emit(SoundCue.Tick); }
    }
}

const CoreDX = [-44, 44, 44, -44];    // the radar isle's cores: TL, TR, BR, BL (screen offsets)
const CoreDY = [-19, -19, 19, 19];
const ThunderY = 66;
export const IrisOpening = 0.7;
