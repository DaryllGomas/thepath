// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE PICTURE.
// New: the C# side never shipped a renderer (Staging/Batch4/nebularun has rules and a bot only).
// Drawn to match the accepted cabinet art (Assets/Art/Flynns/cab_nebularun_*): a black void, a
// purple-and-teal nebula drifting behind a scrolling ground, a cream-white ship with cyan trim.
//
//   - the sim already works in absolute 320x240 screen space (ShipX/Y, ground X, everything), so
//     the picture needs no local origin offset, just rounding to whole pixels
//   - the GROUND (silos, turrets, the tank, the fuel dump, the fortress cores) sits on teal pads;
//     a turret glows red while it is `armed` (in its firing zone: the comment on GroundTarget.Armed
//     asks for exactly this telegraph) and again on the frame it fires
//   - the AIR (spinners, darts, the disc ship) are pale chevrons pointed the way they are moving,
//     kept plain so the red stays reserved for danger: enemy shots, armed turrets, the boss glow
//   - the FORTRESS draws its own radar sweep from bossPhase, so the "a live core fires once a
//     pass" rule is something the player can see coming, not just feel
//   - explosions and score popups are read straight off the sim's own records (bursts, popups);
//     nothing here rolls a die
//   - nothing blinks faster than 1 Hz: the ready banner, INSERT COIN (host's job) and the sight
//     lock are all steady colours, never strobed
import { PixelFont, SurfaceDraw, dn } from '../../sdk/index.js';
import { NebulaRunPalette, NebulaRunSpec } from './spec.js';
import { NebulaRunRound, AirKind, GroundKind, airRadius, groundRadius } from './round.js';
import { NebulaScroll } from './scroll.js';

const Phase = NebulaRunRound.Phase;
const TAU = Math.PI * 2;

// a small avalanche hash for the background decor: a pure function of position, never the dice
function hash(n) {
    let h = Math.imul(n | 0, 0x9E3779B1) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0; h = Math.imul(h, 0x85EBCA77) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0xC2B2AE3D) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

export class NebulaRunRenderer {
    constructor() {
        const pal = NebulaRunPalette;
        this.cVoid = pal.get('void'); this.cNebDeep = pal.get('nebDeep'); this.cNeb = pal.get('neb'); this.cNebHi = pal.get('nebHi');
        this.cTealDeep = pal.get('tealDeep'); this.cTeal = pal.get('teal'); this.cTealHi = pal.get('tealHi');
        this.cWhite = pal.get('white'); this.cCyan = pal.get('cyan'); this.cCyanDim = pal.get('cyanDim');
        this.cRed = pal.get('red'); this.cRedDim = pal.get('redDim'); this.cEmber = pal.get('ember');
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cVoid);
        if (r == null) return;
        s.clip(NebulaScroll.FieldX, NebulaScroll.FieldY, NebulaScroll.FieldW, NebulaScroll.FieldH);

        this._backdrop(s, r);
        for (const site of r.sites) this._site(s, r, site);
        for (const g of r.ground) this._ground(s, r, g, t);
        if (r.bossLive || r.bossZone) this._radar(s, r, t);
        for (const p of r.bullets) this._bullet(s, p);
        for (const sh of r.shots) this._shot(s, sh);
        for (const e of r.air) this._airBody(s, e, t);
        if (r.bombActive) this._bomb(s, r);
        if (!r.shipDown && r.p !== Phase.ShipLost) this._sight(s, r, t);
        if (!r.shipDown && r.p !== Phase.ShipLost) this._ship(s, r, t);
        for (const b of r.bursts) this._burst(s, b);
        for (const p of r.popups) this._popup(s, p);

        s.noClip();
        this._hud(s, r);
        this._overlays(s, r, t);
        s.noClip();
    }

    // ------------------------------------------------------------------ small helpers
    _ln(s, x0, y0, x1, y1, c) { s.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), c); }
    _px(s, x, y, c) { s.setPixel(Math.round(x), Math.round(y), c); }
    _rc(s, x, y, w, h, c) { s.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c); }
    _fr(s, x, y, w, h, c) { s.frame(Math.round(x), Math.round(y), Math.round(w), Math.round(h), c); }

    // ------------------------------------------------------------------ the nebula-lit backdrop
    // Stars and cloud wisps are fixed to MAP position (a hash of an 18/54 px slot), so they scroll
    // smoothly with the ground and never resample: no RNG, no per-frame flicker.
    _backdrop(s, r) {
        const sc = r.scroll;
        const top = sc.pos, bot = sc.pos + NebulaScroll.FieldH + 20;
        const slot0 = Math.floor(top / 18) - 1, slot1 = Math.floor(bot / 18) + 1;
        for (let slot = slot0; slot <= slot1; slot++) {
            const h0 = hash(slot * 2);
            if (h0 % 5 < 2) continue;                       // sparse
            const mapY = slot * 18 + (h0 % 17);
            const x = (hash(slot * 2 + 1) % 300) + 2;
            const y = sc.toScreenY(mapY);
            if (y < NebulaScroll.FieldY - 2 || y > NebulaScroll.FieldBottom + 2) continue;
            const c = (h0 >>> 6) % 5 === 0 ? this.cWhite : (h0 >>> 6) % 2 === 0 ? this.cTealHi : this.cNebHi;
            this._px(s, x, y, c);
        }
        // bigger, sparser cloud wisps: a short streak in the nebula ramp
        const wslot0 = Math.floor(top / 54) - 1, wslot1 = Math.floor(bot / 54) + 1;
        for (let slot = wslot0; slot <= wslot1; slot++) {
            const h0 = hash(slot * 2 + 900);
            if (h0 % 3 !== 0) continue;
            const mapY = slot * 54 + (h0 % 50);
            const x = (hash(slot * 2 + 901) % 288) + 8;
            const y = sc.toScreenY(mapY);
            if (y < NebulaScroll.FieldY - 3 || y > NebulaScroll.FieldBottom + 3) continue;
            const purple = (h0 >>> 8) % 2 === 0;
            const c1 = purple ? this.cNebDeep : this.cTealDeep, c2 = purple ? this.cNeb : this.cTeal;
            const len = 5 + (h0 >>> 12) % 10;
            this._ln(s, x, y, x + len, y + ((h0 >>> 16) % 3) - 1, c1);
            this._px(s, x + (len >> 1), y, c2);
        }
    }

    // ------------------------------------------------------------------ ground sites (the pads)
    _site(s, r, site) {
        const y = r.scroll.toScreenY(site.mapY);
        if (y < NebulaScroll.FieldY - site.h && y > NebulaScroll.FieldBottom + site.h) return;
        const w = site.w, h = site.h;
        const trim = site.kind === 2 ? this.cNebHi : this.cTeal;
        this._rc(s, site.x - w / 2, y - h / 2, w, h, this.cTealDeep);
        this._fr(s, site.x - w / 2, y - h / 2, w, h, trim);
    }

    // ------------------------------------------------------------------ ground targets
    _ground(s, r, g, t) {
        const y = r.scroll.toScreenY(g.mapY);
        if (y < NebulaScroll.FieldY - 20 || y > NebulaScroll.FieldBottom + 20) return;
        if (!g.alive) { this._wreck(s, g, y); return; }
        const flash = g.hitFlash > 0;
        switch (g.kind) {
            case GroundKind.Silo: this._silo(s, g, y, flash); break;
            case GroundKind.Turret: this._turret(s, g, y, flash); break;
            case GroundKind.Tank: this._tank(s, g, y, flash); break;
            case GroundKind.Fuel: this._fuel(s, g, y, flash, t); break;
            default: this._core(s, r, g, y, flash); break;
        }
    }

    _wreck(s, g, y) {
        if (g.deadT > 1.4) return;                          // a scar for a beat, then gone
        const r = groundRadius(g) * 0.8;
        this._ln(s, g.x - r, y - r * 0.4, g.x + r, y + r * 0.5, this.cTealDeep);
        this._ln(s, g.x - r, y + r * 0.4, g.x + r, y - r * 0.5, this.cTealDeep);
    }

    _silo(s, g, y, flash) {
        const c = flash ? this.cWhite : this.cTeal, rim = flash ? this.cWhite : this.cTealHi;
        this._rc(s, g.x - 5, y - 8, 10, 14, this.cTealDeep);
        this._fr(s, g.x - 5, y - 8, 10, 14, c);
        this._ln(s, g.x - 5, y - 8, g.x + 5, y - 8, rim);
    }

    _turret(s, g, y, flash) {
        const armed = g.armed || g.fireFlash > 0;
        const barrel = flash ? this.cWhite : (g.fireFlash > 0 ? this.cRed : armed ? this.cRed : this.cTealHi);
        this._rc(s, g.x - 6, y - 3, 12, 8, this.cTealDeep);
        this._fr(s, g.x - 6, y - 3, 12, 8, this.cTeal);
        this._ln(s, g.x, y - 3, g.x, y - 11, barrel);
        if (armed) this._px(s, g.x, y - 3, this.cRedDim);
        if (g.fireFlash > 0) this._px(s, g.x, y - 12, this.cWhite);
    }

    _tank(s, g, y, flash) {
        const c = flash ? this.cWhite : this.cTeal;
        this._rc(s, g.x - 9, y - 4, 18, 8, this.cTealDeep);
        this._fr(s, g.x - 9, y - 4, 18, 8, c);
        this._rc(s, g.x - 9, y + 4, 18, 3, this.cTealDeep);
        this._ln(s, g.x - 9, y + 4, g.x + 9, y + 4, this.cTealHi);
        this._ln(s, g.x - 2, y - 4, g.x + (g.vx >= 0 ? 7 : -7), y - 7, c);   // the gun, aimed the way it rolls
    }

    _fuel(s, g, y, flash, t) {
        const c = flash ? this.cWhite : this.cTealHi;
        this._rc(s, g.x - 8, y - 9, 16, 18, this.cTealDeep);
        this._fr(s, g.x - 8, y - 9, 16, 18, c);
        this._ln(s, g.x - 8, y - 3, g.x + 8, y - 3, this.cTeal);
        this._ln(s, g.x - 8, y + 3, g.x + 8, y + 3, this.cTeal);
        this._px(s, g.x, y, this.cEmber);                    // the warning light: steady, no strobe
    }

    _core(s, r, g, y, flash) {
        const imminent = r.bossLive && wrap01(g.firePhase - r.bossPhase) < 0.05;
        const hot = flash || g.fireFlash > 0 || imminent;
        const dmg = g.hp < g.maxHp;
        const ring = dmg ? this.cRedDim : this.cTealHi;
        this._rc(s, g.x - 10, y - 10, 20, 20, this.cTealDeep);
        this._fr(s, g.x - 10, y - 10, 20, 20, ring);
        this._fr(s, g.x - 7, y - 7, 14, 14, hot ? this.cRed : this.cTeal);
        this._rc(s, g.x - 2, y - 2, 4, 4, hot ? this.cWhite : this.cRedDim);
    }

    // ------------------------------------------------------------------ the fortress radar sweep
    _radar(s, r, t) {
        const cx = 160, cy = r.scroll.toScreenY(r.fortMapY);
        if (cy < NebulaScroll.FieldY - 60 || cy > NebulaScroll.FieldBottom + 60) return;
        this.__circle(s, cx, cy, 50, this.cNebDeep);
        if (!r.bossLive) return;
        const a = r.bossPhase * TAU;
        this._ln(s, cx, cy, cx + Math.sin(a) * 48, cy - Math.cos(a) * 48, this.cNebHi);
    }

    __circle(s, cx, cy, rad, c) {
        const n = 28;
        let px = cx + rad, py = cy;
        for (let k = 1; k <= n; k++) {
            const a = k * TAU / n, nx = cx + Math.cos(a) * rad, ny = cy + Math.sin(a) * rad * 0.55;
            if (k % 2 === 0) this._ln(s, px, py, nx, ny, c);
            px = nx; py = ny;
        }
    }

    // ------------------------------------------------------------------ the air
    _airBody(s, e, t) {
        const angle = Math.atan2(e.vx, -e.vy || 0.001);
        const flashed = e.flash > 0;
        switch (e.kind) {
            case AirKind.Spinner: this._chevron(s, e.x, e.y, angle, 6, flashed ? this.cWhite : this.cWhite, this.cCyanDim); break;
            case AirKind.Dart: this._chevron(s, e.x, e.y, angle, 7, flashed ? this.cWhite : this.cWhite, this.cRedDim); break;
            default: this._disc(s, e, t, flashed); break;
        }
    }

    _chevron(s, x, y, angle, size, c, c2) {
        const fx = Math.sin(angle), fy = -Math.cos(angle), rx = Math.cos(angle), ry = Math.sin(angle);
        const P = (f, r) => [x + fx * f + rx * r, y + fy * f + ry * r];
        const nose = P(size, 0), left = P(-size * 0.6, -size * 0.7), right = P(-size * 0.6, size * 0.7), tail = P(-size * 0.15, 0);
        this._ln(s, nose[0], nose[1], left[0], left[1], c);
        this._ln(s, nose[0], nose[1], right[0], right[1], c);
        this._ln(s, left[0], left[1], tail[0], tail[1], c2);
        this._ln(s, right[0], right[1], tail[0], tail[1], c2);
    }

    _disc(s, e, t, flashed) {
        const r = 11, c = flashed ? this.cWhite : this.cWhite;
        this.__circle(s, e.x, e.y, r, c);
        const eyeA = t * 3;
        this._px(s, e.x + Math.cos(eyeA) * (r - 3), e.y + Math.sin(eyeA) * (r - 3) * 0.55, this.cRed);
        this._px(s, e.x, e.y, this.cRedDim);
    }

    // ------------------------------------------------------------------ shots, bombs, the sight
    _bullet(s, b) { this._ln(s, b.x, b.y, b.x, b.y + 6, this.cCyanDim); this._px(s, b.x, b.y, this.cCyan); }

    _shot(s, sh) {
        const sp = Math.max(1e-3, Math.hypot(sh.vx, sh.vy));
        const tx = sh.x - sh.vx / sp * 6, ty = sh.y - sh.vy / sp * 6;
        this._ln(s, tx, ty, sh.x, sh.y, this.cRedDim);
        this._px(s, sh.x, sh.y, this.cRed);
    }

    _sight(s, r, t) {
        const x = r.sightX, y = r.sightY;
        const c = r.sightLocked ? this.cRed : this.cCyanDim;
        this._ln(s, x - 5, y, x - 2, y, c); this._ln(s, x + 2, y, x + 5, y, c);
        this._ln(s, x, y - 5, x, y - 2, c); this._ln(s, x, y + 2, x, y + 5, c);
    }

    _bomb(s, r) {
        const u = Math.min(1, r.bombT / NebulaRunRound.BombFlight);
        const ty = r.scroll.toScreenY(r.bombTMapY);
        const x = r.bombSX + (r.bombTX - r.bombSX) * u, y = r.bombSY + (ty - r.bombSY) * u;
        this._ln(s, r.bombSX, r.bombSY, x, y, this.cTealDeep);
        this._rc(s, x - 1, y - 1, 3, 3, this.cEmber);
        // the landing spot, so a player can read where it will hit before it does
        this._ln(s, r.bombTX - 4, ty, r.bombTX + 4, ty, this.cRedDim);
        this._ln(s, r.bombTX, ty - 4, r.bombTX, ty + 4, this.cRedDim);
    }

    // ------------------------------------------------------------------ the ship
    _ship(s, r, t) {
        const x = r.shipX, y = r.shipY;
        // the flame: steady, no flicker (the SDK's no-strobe law)
        this._ln(s, x - 2, y + 6, x - 2, y + 11, this.cCyanDim);
        this._ln(s, x + 2, y + 6, x + 2, y + 11, this.cCyanDim);
        this._ln(s, x, y + 6, x, y + 13, this.cCyan);
        // hull
        this._ln(s, x, y - 9, x + 9, y + 5, this.cWhite); this._ln(s, x + 9, y + 5, x + 3, y + 3, this.cWhite); this._ln(s, x + 3, y + 3, x, y + 6, this.cWhite);
        this._ln(s, x, y - 9, x - 9, y + 5, this.cWhite); this._ln(s, x - 9, y + 5, x - 3, y + 3, this.cWhite); this._ln(s, x - 3, y + 3, x, y + 6, this.cWhite);
        // keel + pods
        this._ln(s, x, y - 9, x, y + 6, this.cCyan);
        this._ln(s, x - 9, y + 5, x - 6, y + 2, this.cCyan); this._ln(s, x + 9, y + 5, x + 6, y + 2, this.cCyan);

        if (r.mercyActive) this._ring(s, x, y, 15, 14, t * 0.6, r.shieldFlash > 0 ? this.cCyan : this.cCyanDim);
        else if (r.shieldFlash > 0) this._ring(s, x, y, 13, 10, t * 1.4, this.cWhite);
        else if (r.invuln > 0) this._ring(s, x, y, 13, 10, t * 0.9, this.cCyanDim);
    }

    _ring(s, x, y, rad, dashes, phase, c) {
        const step = TAU / dashes;
        for (let k = 0; k < dashes; k++) {
            const a0 = phase + k * step, a1 = a0 + step * 0.55;
            this._ln(s, x + Math.cos(a0) * rad, y + Math.sin(a0) * rad * 0.7, x + Math.cos(a1) * rad, y + Math.sin(a1) * rad * 0.7, c);
        }
    }

    _miniShip(s, x, y, c) {
        this._ln(s, x, y - 5, x - 4, y + 4, c); this._ln(s, x, y - 5, x + 4, y + 4, c);
        this._ln(s, x - 4, y + 4, x, y + 2, c); this._ln(s, x + 4, y + 4, x, y + 2, c);
        this._ln(s, x, y - 4, x, y + 2, this.cCyan);
    }

    // ------------------------------------------------------------------ explosions and popups
    _burst(s, b) {
        const age = b.t, life = b.size === 3 ? 0.35 : 0.5 + b.size * 0.15;
        const u = age / life;
        if (u >= 1) return;
        const onGround = b.onGround;
        const steps = onGround ? [this.cWhite, this.cEmber, this.cRed, this.cRedDim, this.cTealDeep] : [this.cWhite, this.cCyan, this.cCyanDim, this.cNebDeep];
        const c = steps[Math.min(steps.length - 1, Math.trunc(u * steps.length))];
        const n = 5 + b.size * 4;
        const seed = Math.trunc((b.x * 13 + b.y * 7) * 97) | 0;
        for (let k = 0; k < n; k++) {
            const h0 = hash(seed + k * 31);
            const a = (h0 % 1000) / 1000 * TAU, sp = 18 + (h0 >>> 10) % 40;
            const d = sp * age;
            const px = b.x + Math.cos(a) * d, py = b.y + Math.sin(a) * d;
            this._ln(s, px - Math.cos(a), py - Math.sin(a), px + Math.cos(a) * 1.5, py + Math.sin(a) * 1.5, c);
        }
    }

    _popup(s, p) {
        const f = PixelFont.Arcade;
        const y = p.y - p.t * 14;
        const c = p.t > (p.points >= NebulaRunRound.BossBonus ? 1.6 : 0.55) ? (p.onGround ? this.cTealDeep : this.cCyanDim) : (p.onGround ? this.cTealHi : this.cWhite);
        s.textCentered(String(p.points), Math.round(p.x), Math.round(y), f, c);
    }

    // ------------------------------------------------------------------ HUD
    _knock(s, x, y, w, h) { this._rc(s, x - 2, y - 2, w + 4, h + 4, this.cVoid); }

    _hud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, small = PixelFont.Small;
        // left: 1UP + spare ships
        const spare = Math.max(0, Math.min(5, r.ships - (r.shipDown || r.p === Phase.ShipLost ? 0 : 1)));
        this._knock(s, 14, 10, Math.max(arc.measure('1UP'), spare * 12), 20);
        s.text('1UP', 14, 10, arc, this.cCyan);
        for (let i = 0; i < spare; i++) this._miniShip(s, 20 + i * 12, 24, this.cWhite);
        // centre: the score, big
        const sc = dn(r.score, 6), sw = dsp.measure(sc, 2);
        this._knock(s, 160 - (sw >> 1), 10, sw, 14);
        s.textCentered(sc, 160, 10, dsp, this.cTealHi, 2);
        // right: progress to the fortress, then the cores once it is reached
        if (r.bossZone) {
            this._knock(s, 306 - 60, 10, 60, 24);
            s.textRight('CORES', 306, 10, arc, this.cRed);
            for (let i = 0; i < 4; i++) {
                const alive = r.coreByIndex(i) != null && r.coreByIndex(i).alive;
                const px = 306 - 4 - i * 12;
                if (alive) this._rc(s, px - 5, 20, 8, 8, this.cRed); else this._fr(s, px - 5, 20, 8, 8, this.cTealDeep);
            }
        } else {
            const w = 56, x = 306 - w;
            this._knock(s, x - 4, 10, w + 4, 16);
            s.textRight('SECTOR', 306, 10, arc, this.cTealHi);
            this._fr(s, x, 19, w, 5, this.cTealDeep);
            const fill = Math.round((w - 2) * Math.max(0, Math.min(1, r.scroll.progress)));
            if (fill > 0) this._rc(s, x + 1, 20, fill, 3, this.cTeal);
        }
    }

    _overlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = 120;
        if (r.p === Phase.Intro) {
            if (r.firstIntro) {
                s.textCenteredShadow('SECTOR 1', midX, 60, dsp, this.cTealHi, this.cNebDeep, 3);
                s.textCentered('GET READY', midX, 172, arc, this.cWhite);
            } else {
                s.textCenteredShadow('READY', midX, 90, dsp, this.cWhite, this.cNebDeep, 3);
            }
        } else if (r.p === Phase.ShipLost) {
            s.textBox('SHIP LOST', midX, 100, arc, 1, this.cRed, this.cRed, this.cVoid);
        } else if (r.p === Phase.BossDown) {
            s.textCenteredShadow('FORTRESS DOWN', midX, 90, dsp, this.cEmber, this.cNebDeep, 2);
        } else if (r.p === Phase.Card || r.p === Phase.Over) {
            const spec = NebulaRunSpec, won = r.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 30, dsp, 3, won ? this.cTealHi : this.cRed, won ? this.cTealHi : this.cRed, this.cVoid);
            s.plate(midX - 84, midY + 4, 168, 46, this.cVoid, this.cNebDeep);
            s.textCentered('SCORE ' + dn(r.score, 6), midX, midY + 10, arc, this.cTealHi, 2);
            s.textCentered((won ? 'CORES 4 OF 4' : 'CORES ' + (4 - r.coresLeft) + ' OF 4'), midX, midY + 32, arc, won ? this.cTealHi : this.cRedDim, 2);
        }
    }
}

function wrap01(v) { v %= 1; return v < 0 ? v + 1 : v; }
