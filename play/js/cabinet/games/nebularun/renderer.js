// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE PICTURE.
// New in the C# port (Staging/Batch4/nebularun had rules and a bot only); rebuilt for the five sectors (2026-10-18).
// Drawn to match the accepted cabinet art (Assets/Art/Flynns/cab_nebularun_*): a black void, a purple-and-teal nebula,
// a cream-white ship with cyan trim. It reads the sim and never changes it; nothing here rolls a die.
//
//   - the sim works in absolute 320x240 screen space (ship, air, shots) and map space (the ground), so the picture
//     needs no local origin, just rounding to whole pixels; the field is clipped to the 8 px safe area
//   - each sector has its own GROUND (terrain.js); the targets stay in the teal family on every ground and red is kept
//     for danger: shots, an armed gun, a flak marker, an armed mine, a boss winding up
//   - TELEGRAPHS: a turret's barrel follows you and glows red while it may fire; a flak shell's burst point is marked
//     (dim, then red for its last quarter second); a lightning column is a dotted warning for a second before the bolt;
//     a domed gun shows its dome and a dotted link to its generator; the bosses glow before each volley and the mother's
//     iris opens on screen before it fires
//   - JUICE: screen shake from the sim's `shake`, white hit flashes, score and pod pop-ups, bursts with hashed sparks
//     and rings, a shock ring when a boss goes
//   - nothing blinks faster than 1 Hz: the banners, INSERT COIN (host's job) and the sight are steady colours
import { PixelFont, dn } from '../../sdk/index.js';
import { NebulaRunPalette, NebulaRunSpec } from './spec.js';
import { NebulaRunRound, AirKind, GroundKind, CapKind, airRadius, groundRadius, isShielded } from './round.js';
import { NebulaScroll } from './scroll.js';
import { SECTORS } from './sectors.js';
import { Terrain, hash, ellipse, dotRing } from './terrain.js';
import { IrisOpening } from './bosses.js';

const Phase = NebulaRunRound.Phase;
const R = NebulaRunRound;
const TAU = Math.PI * 2;
const FX = NebulaScroll.FieldX, FY = NebulaScroll.FieldY, FW = NebulaScroll.FieldW, FH = NebulaScroll.FieldH;
const FB = NebulaScroll.FieldBottom;

export class NebulaRunRenderer {
    constructor() {
        const pal = NebulaRunPalette;
        const c = this.c = {};
        for (const n of ['void', 'nebDeep', 'neb', 'nebHi', 'tealDeep', 'teal', 'tealHi', 'white', 'cyan', 'cyanDim', 'red', 'redDim', 'ember',
            'steelDeep', 'steel', 'steelHi', 'gold']) c[n] = pal.get(n);
        this.terrain = new Terrain(c);
        this.ox = 0; this.oy = 0;
    }

    draw(sim, s, t) {
        const r = sim, c = this.c;
        s.noClip();
        s.clear(c.void);
        if (r == null) return;
        s.clip(FX, FY, FW, FH);
        const sh = r.shake;
        this.ox = sh > 0.4 ? Math.round(Math.sin(r.time * 67) * sh) : 0;
        this.oy = sh > 0.4 ? Math.round(Math.cos(r.time * 53) * sh * 0.7) : 0;

        const g = r.def.ground;
        if (g === 'shoals' || g === 'city' || g === 'storm') this._backdrop(s, r);
        this.terrain.draw(s, r, t, this.ox, this.oy);
        for (const site of r.sites) this.terrain.site(s, r, site, this.ox, this.oy);
        if (r.boss != null) this._bossGround(s, r, t);
        this._links(s, r, t);
        for (const gt of r.ground) this._ground(s, r, gt, t);
        if (r.boss != null && r.boss.kind === 'radar') this._radar(s, r);
        if (r.bombActive) this._bomb(s, r);
        for (const f of r.flak) this._flak(s, f);
        const shipUp = !r.shipDown && r.p !== Phase.ShipLost;
        if (shipUp && (r.p === Phase.Playing || r.p === Phase.Intro)) this._sight(s, r);
        for (const p of r.bullets) this._bullet(s, p);
        if (r.boss != null && r.boss.kind === 'thunderhead' && r.boss.spawned) this._thunderhead(s, r, t);
        for (const e of r.air) this._airBody(s, r, e, t);
        for (const sh2 of r.shots) this._shot(s, sh2);
        for (const b of r.bolts) this._bolt(s, b, t);
        for (const cp of r.caps) this._cap(s, cp);
        if (shipUp) this._ship(s, r, t);
        for (const b of r.bursts) this._burst(s, r, b);
        if (r.flash > 0 && r.boss != null) this._shock(s, r);
        for (const p of r.popups) this._popup(s, r, p);

        s.noClip();
        this.ox = 0; this.oy = 0;
        this._hud(s, r);
        this._overlays(s, r, t);
        s.noClip();
    }

    // ------------------------------------------------------------------ small helpers (field space: the shake added)
    _ln(s, x0, y0, x1, y1, c) { s.line(Math.round(x0) + this.ox, Math.round(y0) + this.oy, Math.round(x1) + this.ox, Math.round(y1) + this.oy, c); }
    _px(s, x, y, c) { s.setPixel(Math.round(x) + this.ox, Math.round(y) + this.oy, c); }
    _rc(s, x, y, w, h, c) { s.rect(Math.round(x) + this.ox, Math.round(y) + this.oy, Math.round(w), Math.round(h), c); }
    _fr(s, x, y, w, h, c) { s.frame(Math.round(x) + this.ox, Math.round(y) + this.oy, Math.round(w), Math.round(h), c); }
    _el(s, x, y, rx, ry, c) { ellipse(s, x + this.ox, y + this.oy, rx, ry, c); }
    _ring(s, x, y, rad, n, c, phase = 0, sq = 1) { dotRing(s, x + this.ox, y + this.oy, rad, n, c, phase, sq); }
    _circ(s, x, y, rad, c, fill) { s.circle(Math.round(x) + this.ox, Math.round(y) + this.oy, Math.round(rad), c, fill); }
    _dotted(s, x0, y0, x1, y1, step, c, phase = 0) {
        const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(d / step));
        for (let k = 0; k <= n; k++) { const u = ((k + phase) % (n + 1)) / n; this._px(s, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, c); }
    }

    // ------------------------------------------------------------------ the nebula behind the open grounds
    // Stars and cloud wisps are fixed to MAP position (a hash of an 18/54 px slot), so they scroll smoothly with the ground
    // and never resample: no RNG, no per-frame flicker.
    _backdrop(s, r) {
        const sc = r.scroll, c = this.c;
        const top = sc.pos, bot = sc.pos + FH + 20;
        for (let slot = Math.floor(top / 18) - 1; slot <= Math.floor(bot / 18) + 1; slot++) {
            const h0 = hash(slot * 2);
            if (h0 % 5 < 2) continue;
            const y = sc.toScreenY(slot * 18 + (h0 % 17)), x = (hash(slot * 2 + 1) % 300) + 10;
            if (y < FY - 2 || y > FB + 2) continue;
            this._px(s, x, y, (h0 >>> 6) % 5 === 0 ? c.white : (h0 >>> 6) % 2 === 0 ? c.tealHi : c.nebHi);
        }
        for (let slot = Math.floor(top / 54) - 1; slot <= Math.floor(bot / 54) + 1; slot++) {
            const h0 = hash(slot * 2 + 900);
            if (h0 % 3 !== 0) continue;
            const y = sc.toScreenY(slot * 54 + (h0 % 50)), x = (hash(slot * 2 + 901) % 288) + 12;
            if (y < FY - 3 || y > FB + 3) continue;
            const purple = (h0 >>> 8) % 2 === 0, len = 5 + (h0 >>> 12) % 10;
            this._ln(s, x, y, x + len, y + ((h0 >>> 16) % 3) - 1, purple ? c.nebDeep : c.tealDeep);
            this._px(s, x + (len >> 1), y, purple ? c.neb : c.teal);
        }
    }

    // ------------------------------------------------------------------ the domes' links (generator -> its guns)
    _links(s, r, t) {
        const c = this.c, sc = r.scroll;
        for (const g of r.ground) {
            if (!g.alive || g.guards == null) continue;
            const y = sc.toScreenY(g.mapY);
            if (y < FY - 40 || y > FB + 40) continue;
            for (const gen of g.guards) {
                if (!gen.alive) continue;
                this._dotted(s, gen.x, sc.toScreenY(gen.mapY), g.x, y, 4, c.cyanDim, Math.trunc(t * 6) % 4);
            }
        }
    }

    // ------------------------------------------------------------------ ground targets
    _ground(s, r, g, t) {
        const y = r.scroll.toScreenY(g.mapY);
        if (y < FY - 24 || y > FB + 24) return;
        if (g.kind === GroundKind.Beacon) { if (!g.alive && g.deadT < 2.2) this._beacon(s, g.x, y); return; }
        if (!g.alive) { this._wreck(s, g, y); return; }
        const flash = g.hitFlash > 0 && !isShielded(g);
        switch (g.kind) {
            case GroundKind.Silo: this._silo(s, g, y, flash); break;
            case GroundKind.Turret: this._turret(s, r, g, y, flash); break;
            case GroundKind.Tank: this._tank(s, r, g, y, flash); break;
            case GroundKind.Dump: this._dump(s, g, y, flash); break;
            case GroundKind.Core: this._core(s, r, g, y, flash); break;
            case GroundKind.Flak: this._flakGun(s, r, g, y, flash); break;
            case GroundKind.Gen: this._gen(s, g, y, flash, t); break;
            case GroundKind.Bunker: this._bunker(s, r, g, y, flash); break;
            case GroundKind.Cannon: this._cannon(s, r, g, y, flash); break;
            case GroundKind.Hangar: this._hangar(s, g, y, flash); break;
            case GroundKind.Iris: this._iris(s, r, g, y, flash, t); break;
            case GroundKind.Heart: this._heart(s, r, g, y, flash, t); break;
        }
        if (g.guards != null && isShielded(g)) this._dome(s, g, y, t);
    }

    _dome(s, g, y, t) {
        const c = this.c, rad = groundRadius(g) + 5;
        if (g.hitFlash > 0) { this._ring(s, g.x, y, rad, 30, c.white, 0, 0.85); this._ring(s, g.x, y, rad + 2, 30, c.cyan, 0.1, 0.85); }
        else this._ring(s, g.x, y, rad, 16, c.cyan, t * 0.8, 0.85);
    }

    _wreck(s, g, y) {
        if (g.deadT > 1.6) return;                          // a scar for a beat, then gone
        const c = this.c, rr = groundRadius(g) * 0.8;
        this._ln(s, g.x - rr, y - rr * 0.4, g.x + rr, y + rr * 0.5, c.void);
        this._ln(s, g.x - rr, y + rr * 0.4, g.x + rr, y - rr * 0.5, c.void);
        if (g.deadT < 0.6) this._px(s, g.x, y, c.ember);
    }

    _beacon(s, x, y) {
        const c = this.c;
        this._ln(s, x - 6, y, x + 6, y, c.gold); this._ln(s, x, y - 6, x, y + 6, c.gold);
        this._ln(s, x - 3, y - 3, x + 3, y + 3, c.gold); this._ln(s, x - 3, y + 3, x + 3, y - 3, c.gold);
        this._px(s, x, y, c.white);
    }

    _aim(r, x, y) { return Math.atan2(r.shipY - y, r.shipX - x); }

    _silo(s, g, y, flash) {
        const c = this.c, fc = flash ? c.white : c.teal, rim = flash ? c.white : c.tealHi;
        this._rc(s, g.x - 5, y - 8, 10, 14, c.tealDeep);
        this._fr(s, g.x - 5, y - 8, 10, 14, fc);
        this._ln(s, g.x - 5, y - 8, g.x + 4, y - 8, rim);
        this._px(s, g.x, y - 4, c.tealHi);
    }

    _turret(s, r, g, y, flash) {
        const c = this.c, armed = g.armed || g.fireFlash > 0;
        const barrel = flash ? c.white : armed ? c.red : c.tealHi;
        this._rc(s, g.x - 6, y - 4, 12, 9, c.tealDeep);
        this._fr(s, g.x - 6, y - 4, 12, 9, flash ? c.white : c.teal);
        const a = armed ? this._aim(r, g.x, y) : -Math.PI / 2;
        this._ln(s, g.x, y, g.x + Math.cos(a) * 9, y + Math.sin(a) * 9, barrel);
        this._px(s, g.x, y, armed ? c.redDim : c.teal);
        if (g.fireFlash > 0) this._px(s, g.x + Math.cos(a) * 10, y + Math.sin(a) * 10, c.white);
    }

    _tank(s, r, g, y, flash) {
        const c = this.c, fc = flash ? c.white : c.teal;
        this._rc(s, g.x - 10, y - 7, 20, 3, c.steelDeep); this._rc(s, g.x - 10, y + 4, 20, 3, c.steelDeep);    // treads
        const cleat = Math.trunc(g.x) & 3;
        for (let k = -10 + cleat; k < 10; k += 4) { this._px(s, g.x + k, y - 6, c.steel); this._px(s, g.x + k, y + 5, c.steel); }
        this._rc(s, g.x - 8, y - 4, 16, 8, c.tealDeep);
        this._fr(s, g.x - 8, y - 4, 16, 8, fc);
        const armed = g.armed || g.fireFlash > 0;
        const a = armed ? this._aim(r, g.x, y) : (g.vx >= 0 ? 0 : Math.PI);
        this._ln(s, g.x, y, g.x + Math.cos(a) * 9, y + Math.sin(a) * 9, flash ? c.white : armed ? c.red : c.tealHi);
        this._rc(s, g.x - 2, y - 2, 4, 4, armed ? c.redDim : c.teal);
    }

    _dump(s, g, y, flash) {
        const c = this.c, fc = flash ? c.white : c.tealHi;
        this._rc(s, g.x - 9, y - 9, 18, 18, c.tealDeep);
        this._fr(s, g.x - 9, y - 9, 18, 18, fc);
        this._ln(s, g.x - 9, y - 3, g.x + 8, y - 3, c.teal);
        this._ln(s, g.x - 9, y + 3, g.x + 8, y + 3, c.teal);
        this._rc(s, g.x - 2, y - 2, 4, 4, c.gold);           // a pod inside: bomb it out
    }

    _core(s, r, g, y, flash) {
        const c = this.c, b = r.boss;
        const imminent = r.bossLive && wrap01(g.firePhase - b.phase) < 0.06;
        const hot = flash || g.fireFlash > 0 || imminent;
        this._rc(s, g.x - 10, y - 10, 20, 20, c.tealDeep);
        this._fr(s, g.x - 10, y - 10, 20, 20, g.hp < g.maxHp ? c.redDim : c.tealHi);
        this._fr(s, g.x - 7, y - 7, 14, 14, hot ? c.red : c.teal);
        this._rc(s, g.x - 2, y - 2, 4, 4, hot ? c.white : c.redDim);
    }

    _flakGun(s, r, g, y, flash) {
        const c = this.c, armed = g.armed || g.fireFlash > 0 || (g.boss && r.bossLive);
        const rim = flash ? c.white : armed ? c.red : c.teal;
        this._el(s, g.x, y, 9, 7, c.tealDeep);
        this._fr(s, g.x - 7, y - 5, 14, 10, rim);
        this._ln(s, g.x - 3, y, g.x - 3, y - 8, flash ? c.white : c.tealHi);
        this._ln(s, g.x + 3, y, g.x + 3, y - 8, flash ? c.white : c.tealHi);
        if (g.fireFlash > 0) { this._px(s, g.x - 3, y - 10, c.ember); this._px(s, g.x + 3, y - 10, c.ember); }
        if (g.hp < g.maxHp) this._px(s, g.x, y + 2, c.redDim);
    }

    _gen(s, g, y, flash, t) {
        const c = this.c;
        this._el(s, g.x, y, 10, 8, flash ? c.white : c.teal);
        this._el(s, g.x, y, 8, 6, c.tealDeep);
        this._el(s, g.x, y - 1, 4, 3, flash ? c.white : c.cyan);
        const a = t * 3;
        for (let k = 0; k < 3; k++) {
            const q = a + k * TAU / 3;
            this._px(s, g.x + Math.cos(q) * 7, y + Math.sin(q) * 5, c.cyan);
        }
        if (g.hp < g.maxHp) { this._px(s, g.x - 3, y + 3, c.redDim); this._px(s, g.x + 3, y - 3, c.redDim); }
    }

    _bunker(s, r, g, y, flash) {
        const c = this.c, armed = g.armed || g.fireFlash > 0 || (g.boss && r.bossLive);
        this._rc(s, g.x - 10, y - 8, 20, 16, c.steelDeep);
        this._fr(s, g.x - 10, y - 8, 20, 16, flash ? c.white : c.steelHi);
        this._rc(s, g.x - 7, y - 5, 14, 10, c.tealDeep);
        this._fr(s, g.x - 7, y - 5, 14, 10, flash ? c.white : c.teal);
        this._rc(s, g.x - 5, y + 1, 10, 2, armed ? c.red : c.void);           // the gun slit
        if (g.fireFlash > 0) this._rc(s, g.x - 1, y + 3, 2, 2, c.white);
        if (g.hp < g.maxHp) this._ln(s, g.x - 6, y - 4, g.x - 1, y, c.redDim);
    }

    _cannon(s, r, g, y, flash) {
        const c = this.c, b = r.boss, hot = b.charging || g.fireFlash > 0;
        this._rc(s, g.x - 5, y - 6, 10, 10, flash ? c.white : c.teal);
        this._rc(s, g.x - 3, y - 4, 6, 6, c.tealDeep);
        this._rc(s, g.x - 2, y + 4, 4, 12, hot ? c.ember : c.steelHi);         // the barrel, toward you
        this._rc(s, g.x - 1, y + 4, 2, 12, hot ? c.red : c.steel);
        if (hot) this._rc(s, g.x - 2, y + 16, 4, 2, g.fireFlash > 0 ? c.white : c.red);
        if (g.hp < g.maxHp) this._px(s, g.x + 3, y - 3, c.redDim);
    }

    _hangar(s, g, y, flash) {
        const c = this.c, open = g.fireFlash > 0;
        this._rc(s, g.x - 11, y - 12, 22, 24, c.steelDeep);
        this._fr(s, g.x - 11, y - 12, 22, 24, flash ? c.white : c.steelHi);
        this._rc(s, g.x - 7, y - 4, 14, 14, open ? c.void : c.tealDeep);
        this._fr(s, g.x - 7, y - 4, 14, 14, flash ? c.white : c.teal);
        if (!open) this._ln(s, g.x, y - 4, g.x, y + 9, c.teal);               // the doors
        else this._px(s, g.x, y + 2, c.red);
        for (let k = 0; k < g.hp; k++) this._px(s, g.x - 6 + k * 3, y - 9, c.ember);
    }

    _iris(s, r, g, y, flash, t) {
        const c = this.c, b = r.boss;
        this._el(s, g.x, y, 15, 12, c.steel);
        this._el(s, g.x, y, 13, 10, c.void);
        // the shutters: shut, sliding open over IrisOpening seconds, open (the core shows: bomb it now)
        const u = b.irisState === 2 ? 1 : b.irisState === 1 ? 1 - b.irisT / IrisOpening : 0;
        if (u > 0.05) {
            this._el(s, g.x, y, 7 * u + 2, 5 * u + 2, flash ? c.white : c.red);
            this._el(s, g.x, y, 3 * u + 1, 2 * u + 1, c.ember);
            if (b.irisState === 2) this._px(s, g.x, y, c.white);
        }
        for (let k = 0; k < 6; k++) {
            const a = k * TAU / 6 + 0.4;
            const r0 = 3 + 8 * u, r1 = 12;
            this._ln(s, g.x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.78, g.x + Math.cos(a) * r1, y + Math.sin(a) * r1 * 0.78, flash ? c.white : c.steelHi);
        }
        for (let k = 0; k < g.maxHp; k++) this._px(s, g.x - 8 + k * 4, y + 15, k < g.hp ? c.ember : c.redDim);
    }

    _heart(s, r, g, y, flash, t) {
        const c = this.c, b = r.boss, hot = b.charging || g.fireFlash > 0;
        const bare = !isShielded(g);
        this._el(s, g.x, y, 12, 10, flash ? c.white : bare ? c.tealHi : c.teal);
        this._el(s, g.x, y, 10, 8, c.tealDeep);
        this._el(s, g.x, y, 5, 4, hot ? c.ember : bare ? c.red : c.redDim);
        this._px(s, g.x, y, hot ? c.white : c.ember);
        for (let k = 0; k < g.maxHp; k++) this._px(s, g.x - 6 + k * 4, y + 13, k < g.hp ? c.ember : c.redDim);
    }

    // ------------------------------------------------------------------ the bosses' ground hulls
    _bossGround(s, r, t) {
        const b = r.boss, c = this.c;
        const y = r.scroll.toScreenY(b.mapY);
        if (y < FY - 80 || y > FB + 80) return;
        if (b.dead && r.p !== Phase.BossDown) { this._ruin(s, r, b, y); return; }
        switch (b.kind) {
            case 'crawler': {
                const x = b.x, hw = b.w / 2, hh = b.h / 2;
                // treads, rolling with the hull
                for (const side of [-1, 1]) {
                    const tx = x + side * (hw - 6);
                    this._rc(s, tx - 8, y - hh, 16, b.h, c.steelDeep);
                    this._fr(s, tx - 8, y - hh, 16, b.h, c.steel);
                    const roll = Math.trunc(x * 0.5) & 3;
                    for (let k = -hh + 2 + roll; k < hh - 1; k += 4) this._ln(s, tx - 7, y + k, tx + 6, y + k, c.steel);
                }
                this._rc(s, x - hw + 14, y - hh + 4, b.w - 28, b.h - 8, c.nebDeep);
                this._fr(s, x - hw + 14, y - hh + 4, b.w - 28, b.h - 8, c.neb);
                this._ln(s, x - hw + 15, y - hh + 5, x + hw - 16, y - hh + 5, c.nebHi);
                for (let k = -2; k <= 2; k++) this._px(s, x + k * 9, y + hh - 8, c.ember);
                break;
            }
            case 'prism': {
                const x = 160;
                // the glass pyramid: its edges converge on the heart
                const pts = [[-70, 0], [70, 0], [0, -40], [0, 40]];
                for (const [dx, dy] of pts) this._ln(s, x + dx, y + dy, x, y, c.cyanDim);
                this._ln(s, x - 70, y, x, y - 40, c.cyan); this._ln(s, x, y - 40, x + 70, y, c.cyanDim);
                this._ln(s, x + 70, y, x, y + 40, c.cyanDim); this._ln(s, x, y + 40, x - 70, y, c.cyan);
                break;
            }
            case 'mother': {
                const x = 160, hw = b.w / 2, hh = b.h / 2;
                // the fortress: an armoured octagon, ringed with lights
                this._rc(s, x - hw + 10, y - hh, b.w - 20, b.h, c.steelDeep);
                this._rc(s, x - hw, y - hh + 10, b.w, b.h - 20, c.steelDeep);
                this._ln(s, x - hw + 10, y - hh, x + hw - 11, y - hh, c.steelHi);
                this._ln(s, x - hw, y - hh + 10, x - hw + 10, y - hh, c.steelHi);
                this._ln(s, x + hw - 1, y - hh + 10, x + hw - 11, y - hh, c.steelHi);
                this._ln(s, x - hw, y - hh + 10, x - hw, y + hh - 11, c.steel);
                this._ln(s, x + hw - 1, y - hh + 10, x + hw - 1, y + hh - 11, c.steel);
                this._ln(s, x - hw + 10, y + hh - 1, x + hw - 11, y + hh - 1, c.steel);
                this._ln(s, x - hw, y + hh - 11, x - hw + 10, y + hh - 1, c.steel);
                this._ln(s, x + hw - 1, y + hh - 11, x + hw - 11, y + hh - 1, c.steel);
                this._el(s, x, y, 34, 26, c.steel);                    // the inner keep
                this._el(s, x, y, 32, 24, c.steelDeep);
                for (let k = 0; k < 16; k++) {
                    const a = k * TAU / 16;
                    this._px(s, x + Math.cos(a) * 30, y + Math.sin(a) * 22, ((k + Math.trunc(t * 4)) & 3) === 0 ? c.ember : c.redDim);
                }
                // the walkways out to the guns
                this._rc(s, x - hw + 16, y - 1, b.w - 32, 2, c.steel);
                break;
            }
        }
    }

    // a downed boss's wreck, while its tally is up
    _ruin(s, r, b, y) {
        const c = this.c;
        if (b.kind === 'thunderhead') return;
        const x = b.x;
        for (let k = 0; k < 14; k++) {
            const h = hash(k * 7 + 3);
            this._el(s, x + (h % b.w) - b.w / 2, y + ((h >>> 8) % b.h) - b.h / 2, 4 + (h >>> 16) % 7, 2 + (h >>> 20) % 4, c.void);
        }
        this._px(s, x, y, c.ember);
    }

    // the radar isle's sweep (from the old fortress, kept): the "a live core fires as the sweep crosses it" rule you can see
    _radar(s, r) {
        const b = r.boss, c = this.c;
        const cx = 160, cy = r.scroll.toScreenY(b.mapY);
        if (cy < FY - 60 || cy > FB + 60) return;
        this._oval(s, cx, cy, 50, c.nebDeep);
        this._rc(s, cx - 3, cy - 3, 6, 6, c.steel);
        if (!r.bossLive) return;
        const a = b.phase * TAU;
        this._ln(s, cx, cy, cx + Math.sin(a) * 48, cy - Math.cos(a) * 48, c.nebHi);
        const a2 = a - 0.12;
        this._ln(s, cx, cy, cx + Math.sin(a2) * 44, cy - Math.cos(a2) * 44, c.neb);
    }

    _oval(s, cx, cy, rad, c) {
        const n = 28;
        let px = cx + rad, py = cy;
        for (let k = 1; k <= n; k++) {
            const a = k * TAU / n, nx = cx + Math.cos(a) * rad, ny = cy + Math.sin(a) * rad * 0.55;
            if (k % 2 === 0) this._ln(s, px, py, nx, ny, c);
            px = nx; py = ny;
        }
    }

    // ------------------------------------------------------------------ the air
    _airBody(s, r, e, t) {
        const c = this.c, flashed = e.flash > 0;
        switch (e.kind) {
            case AirKind.Spinner: this._chevron(s, e.x, e.y, Math.atan2(e.vx, -e.vy || 0.001), 6, c.white, c.cyanDim); break;
            case AirKind.Dart: this._chevron(s, e.x, e.y, Math.atan2(e.vx, -e.vy || 0.001), 7, c.white, c.redDim); break;
            case AirKind.Disc: this._disc(s, e, t, flashed); break;
            case AirKind.Weaver: this._weaver(s, e, t); break;
            case AirKind.Mine: this._mine(s, e, flashed, t); break;
            case AirKind.Carrier: this._carrier(s, e, flashed); break;
            case AirKind.Pod: this._pod(s, r, e, flashed); break;
            case AirKind.Eye: this._eye(s, r, e, flashed); break;
        }
    }

    _chevron(s, x, y, angle, size, col, c2) {
        const fx = Math.sin(angle), fy = -Math.cos(angle), rx = Math.cos(angle), ry = Math.sin(angle);
        const P = (f, q) => [x + fx * f + rx * q, y + fy * f + ry * q];
        const nose = P(size, 0), left = P(-size * 0.6, -size * 0.7), right = P(-size * 0.6, size * 0.7), tail = P(-size * 0.15, 0);
        this._ln(s, nose[0], nose[1], left[0], left[1], col);
        this._ln(s, nose[0], nose[1], right[0], right[1], col);
        this._ln(s, left[0], left[1], tail[0], tail[1], c2);
        this._ln(s, right[0], right[1], tail[0], tail[1], c2);
    }

    _disc(s, e, t, flashed) {
        const c = this.c;
        this._oval(s, e.x, e.y, 11, flashed ? c.cyan : c.white);
        this._el(s, e.x, e.y, 5, 3, c.nebDeep);
        const eyeA = t * 3;
        this._px(s, e.x + Math.cos(eyeA) * 8, e.y + Math.sin(eyeA) * 8 * 0.55, c.red);
        this._px(s, e.x, e.y, flashed ? c.white : c.redDim);
    }

    _weaver(s, e, t) {
        const c = this.c, d = e.side, flap = Math.sin(e.t * 9) > 0 ? 1 : 0;
        this._ln(s, e.x - 7, e.y - 3 - flap, e.x - 3, e.y + 2, c.white);
        this._ln(s, e.x - 3, e.y + 2, e.x, e.y - 1, c.white);
        this._ln(s, e.x, e.y - 1, e.x + 3, e.y + 2, c.white);
        this._ln(s, e.x + 3, e.y + 2, e.x + 7, e.y - 3 - flap, c.white);
        this._px(s, e.x - d * 8, e.y, c.cyanDim); this._px(s, e.x - d * 10, e.y, c.nebDeep);
        this._px(s, e.x, e.y + 1, c.cyan);
    }

    _mine(s, e, flashed, t) {
        const c = this.c, armed = e.armT >= 0;
        const body = flashed ? c.white : armed ? c.red : c.neb;
        this._el(s, e.x, e.y, 4, 4, body);
        this._el(s, e.x, e.y, 2, 2, armed ? c.ember : c.nebDeep);
        const spin = e.t * 1.5;
        for (let k = 0; k < 4; k++) {
            const a = spin + k * TAU / 4;
            this._ln(s, e.x + Math.cos(a) * 4, e.y + Math.sin(a) * 4, e.x + Math.cos(a) * 7, e.y + Math.sin(a) * 7, armed ? c.red : c.nebHi);
        }
        if (armed) this._ring(s, e.x, e.y, R.MineBlast + 5 + 6 * (1 - e.armT / R.MineFuse), 14, c.redDim, spin);
    }

    _carrier(s, e, flashed) {
        const c = this.c, hull = flashed ? c.cyan : c.white;
        this._ln(s, e.x - 12, e.y - 2, e.x + 12, e.y - 2, hull);
        this._ln(s, e.x - 12, e.y - 2, e.x - 8, e.y + 4, hull);
        this._ln(s, e.x + 12, e.y - 2, e.x + 8, e.y + 4, hull);
        this._ln(s, e.x - 8, e.y + 4, e.x + 8, e.y + 4, hull);
        this._ln(s, e.x - 6, e.y - 6, e.x + 6, e.y - 6, c.cyanDim);
        this._ln(s, e.x - 6, e.y - 6, e.x - 10, e.y - 2, c.cyanDim); this._ln(s, e.x + 6, e.y - 6, e.x + 10, e.y - 2, c.cyanDim);
        this._rc(s, e.x - 2, e.y, 5, 3, c.gold);               // the pod it carries
        for (let k = 0; k < e.hp; k++) this._px(s, e.x - 4 + k * 4, e.y - 4, c.ember);
    }

    // ------------------------------------------------------------------ the thunderhead (the air boss)
    _thunderhead(s, r, t) {
        const b = r.boss, c = this.c;
        if (b.dead && r.p !== Phase.BossDown) return;
        const x = b.x, y = b.y;
        // the thunderhead: a dark anvil cloud, billowed lobes with lit rims, a rolling underbelly and rain
        this._el(s, x, y + 6, 68, 12, c.void);                              // the shadow-belly
        this._el(s, x, y + 2, 66, 15, c.nebDeep);
        const lobes = [[-30, -4, 30, 12], [28, -3, 32, 12], [0, -8, 34, 12], [-52, 3, 16, 7], [52, 4, 16, 7]];
        for (const [dx, dy, rx, ry] of lobes) {
            this._el(s, x + dx, y + dy, rx, ry, c.neb);                     // the lit lobe
            this._el(s, x + dx, y + dy + 2, rx - 2, ry - 2, c.nebDeep);     // its shaded body
        }
        for (const [dx, dy, rx] of lobes) {                                 // a bright rim on the top of every lobe
            this._ln(s, x + dx - rx * 0.6, y + dy - 8, x + dx + rx * 0.6, y + dy - 8, c.nebHi);
            this._px(s, x + dx - rx * 0.8, y + dy - 5, c.nebHi); this._px(s, x + dx + rx * 0.8, y + dy - 5, c.nebHi);
        }
        for (let k = -3; k <= 3; k++) {                                     // the ragged underbelly and the rain
            const ux = x + k * 17, rl = 4 + (hash(k + 40) % 5);
            this._el(s, ux, y + 12, 6, 2, c.neb);
            const ph = Math.trunc(b.t * 14 + k * 5) % 6;
            this._ln(s, ux, y + 15 + ph, ux - 1, y + 15 + ph + rl * 0.4, c.cyanDim);
        }
        // the veins of light in the cloud
        for (let k = 0; k < 4; k++) { const hh = hash(k * 13 + 7); this._px(s, x - 50 + hh % 100, y - 8 + (hh >>> 8) % 14, c.cyanDim); }
        const h = hash(Math.trunc(b.t * 1.5) + 99);
        if (h % 3 === 0) {
            const vx = x - 40 + (h >>> 4) % 80;
            this._ln(s, vx, y - 12, vx + 4, y - 4, c.cyan); this._ln(s, vx + 4, y - 4, vx - 2, y + 4, c.cyan);
            this._ln(s, vx - 2, y + 4, vx + 2, y + 12, c.white);
        }
        if (b.charging) this._el(s, b.core.x, b.core.y + 12, 3, 2, c.ember);
    }

    _pod(s, r, e, flashed) {
        const c = this.c;
        this._el(s, e.x, e.y, 10, 8, flashed ? c.white : c.neb);
        this._el(s, e.x, e.y, 8, 6, c.void);
        this._el(s, e.x, e.y + 2, 3, 2, e.fireT < 0.4 ? c.red : c.redDim);
        for (let k = 0; k < e.hp; k++) this._px(s, e.x - 7 + k * 2, e.y - 6, c.ember);
    }

    _eye(s, r, e, flashed) {
        const c = this.c, b = r.boss;
        this._el(s, e.x, e.y, 15, 10, flashed ? c.white : c.nebHi);
        this._el(s, e.x, e.y, 13, 8, c.void);
        if (e.locked) {                                          // shut: a lid line while the pods stand
            this._ln(s, e.x - 12, e.y, e.x + 12, e.y, c.neb);
            this._ln(s, e.x - 8, e.y + 2, e.x + 8, e.y + 2, c.nebDeep);
            return;
        }
        const lx = Math.max(-5, Math.min(5, (r.shipX - e.x) * 0.06));
        this._el(s, e.x + lx, e.y + 2, 6, 5, c.white);
        this._el(s, e.x + lx, e.y + 2, 3, 3, b.charging ? c.ember : c.red);
        this._px(s, e.x + lx, e.y + 2, c.void);
        for (let k = 0; k < 11; k++) this._px(s, e.x - 15 + k * 3, e.y - 14, k * 2 < e.hp ? c.ember : c.redDim);
    }

    // ------------------------------------------------------------------ shots, flak, bolts, bombs, pods, the sight
    _bullet(s, b) {
        const c = this.c;
        const k = b.vx / R.BulletSpeed;
        this._ln(s, b.x, b.y, b.x - k * 6, b.y + 6, c.cyanDim); this._px(s, b.x, b.y, c.cyan);
    }

    _shot(s, sh) {
        const c = this.c;
        const sp = Math.max(1e-3, Math.hypot(sh.vx, sh.vy));
        const tx = sh.x - sh.vx / sp * 6, ty = sh.y - sh.vy / sp * 6;
        this._ln(s, tx, ty, sh.x, sh.y, c.redDim);
        if (sh.source === 2) { this._rc(s, sh.x - 1, sh.y - 1, 3, 3, c.red); this._px(s, sh.x, sh.y, c.ember); }
        else this._px(s, sh.x, sh.y, c.red);
    }

    _flak(s, f) {
        const c = this.c;
        if (!f.burst) {
            const u = f.t / f.T;
            // the burst point: dim, then red for its last quarter second
            const late = f.T - f.t < 0.25;
            this._ring(s, f.tx, f.ty, R.FlakR, 12, late ? c.red : c.redDim, u * 2);
            this._px(s, f.tx, f.ty, late ? c.red : c.redDim);
            const x = f.x0 + (f.tx - f.x0) * u, y = f.y0 + (f.ty - f.y0) * u;
            this._rc(s, x - 1, y - 1, 2, 2, c.ember);
            this._px(s, x - (f.tx - f.x0) / f.T * 0.04, y - (f.ty - f.y0) / f.T * 0.04, c.redDim);
            return;
        }
        const u = f.bt / R.FlakShow, lethal = f.bt < R.FlakLethal;
        const rad = lethal ? 4 + (R.FlakR - 4) * (f.bt / R.FlakLethal) : R.FlakR;
        const col = lethal ? (f.bt < 0.08 ? c.white : c.ember) : (u < 0.75 ? c.red : c.redDim);
        this._circ(s, f.tx, f.ty, rad, col, false);
        if (lethal) this._circ(s, f.tx, f.ty, rad - 3, c.red, false);
        for (let k = 0; k < 8; k++) {
            const a = k * TAU / 8 + 0.2;
            this._px(s, f.tx + Math.cos(a) * (rad + 3), f.ty + Math.sin(a) * (rad + 3), lethal ? c.ember : c.redDim);
        }
    }

    _bolt(s, b, t) {
        const c = this.c;
        if (!b.struck) {
            // the warning: a dotted column creeping down, and a spark at the top
            const phase = Math.trunc(b.t * 24) % 6;
            for (let y = FY + phase; y <= FB; y += 6) this._px(s, b.x, y, c.cyanDim);
            const u = b.t / R.BoltWarn;
            this._ln(s, b.x - 3, FY + 2, b.x + 3, FY + 2, u > 0.6 ? c.white : c.cyanDim);
            if (u > 0.6) { this._px(s, b.x - R.BoltHalf, FB - 2, c.cyanDim); this._px(s, b.x + R.BoltHalf, FB - 2, c.cyanDim); }
            return;
        }
        // the bolt: a fixed jag for its life (no flicker), white with cyan edges, a splash at the ground
        let px = b.x, py = FY;
        const age = b.t - R.BoltWarn;
        for (let k = 0; py < FB; k++) {
            const h = hash(b.id * 37 + k);
            const nx = b.x + ((h % 9) - 4), ny = Math.min(FB, py + 10 + (h >>> 8) % 8);
            this._ln(s, px - 1, py, nx - 1, ny, c.cyan); this._ln(s, px + 1, py, nx + 1, ny, c.cyan);
            this._ln(s, px, py, nx, ny, age < 0.12 ? c.white : c.cyan);
            px = nx; py = ny;
        }
        this._el(s, b.x, FB - 2, 9 + age * 20, 3, c.ember);
        this._el(s, b.x, FB - 2, 5, 2, c.white);
    }

    _cap(s, cp) {
        const c = this.c, x = Math.round(cp.x), y = Math.round(cp.y);
        this._rc(s, x - 5, y - 5, 11, 11, c.gold);
        this._fr(s, x - 5, y - 5, 11, 11, c.white);
        const ch = cp.kind === CapKind.Wide ? 'W' : cp.kind === CapKind.Cluster ? 'C' : '+';
        s.text(ch, x - 2 + this.ox, y - 3 + this.oy, PixelFont.Arcade, c.void);
    }

    _sight(s, r) {
        const c = this.c, x = r.sightX, y = r.sightY;
        const col = r.sightMode === 1 ? c.red : r.sightMode === 2 ? c.cyan : r.sightMode === 3 ? c.gold : c.cyanDim;
        this._ln(s, x - 5, y, x - 2, y, col); this._ln(s, x + 2, y, x + 5, y, col);
        this._ln(s, x, y - 5, x, y - 2, col); this._ln(s, x, y + 2, x, y + 5, col);
        if (r.cluster) { this._px(s, x - 4, y - 4, col); this._px(s, x + 4, y - 4, col); this._px(s, x - 4, y + 4, col); this._px(s, x + 4, y + 4, col); }
    }

    _bomb(s, r) {
        const c = this.c;
        const u = Math.min(1, r.bombT / R.BombFlight);
        const ty = r.scroll.toScreenY(r.bombTMapY);
        const x = r.bombSX + (r.bombTX - r.bombSX) * u, y = r.bombSY + (ty - r.bombSY) * u;
        this._ln(s, r.bombSX, r.bombSY, x, y, c.nebDeep);
        const k = r.bombCluster ? 2 : 1;
        this._rc(s, x - k, y - k, 2 * k + 1, 2 * k + 1, c.ember);
        // the landing spot, so a player can read where it will hit before it does
        const rr = r.bombCluster ? 8 : 4;
        this._ln(s, r.bombTX - rr, ty, r.bombTX + rr, ty, c.redDim);
        this._ln(s, r.bombTX, ty - rr, r.bombTX, ty + rr, c.redDim);
    }

    // ------------------------------------------------------------------ the ship
    _ship(s, r, t) {
        const c = this.c, x = r.shipX, y = r.shipY;
        // the flame: steady, no flicker (the SDK's no-strobe law)
        this._ln(s, x - 2, y + 6, x - 2, y + 11, c.cyanDim);
        this._ln(s, x + 2, y + 6, x + 2, y + 11, c.cyanDim);
        this._ln(s, x, y + 6, x, y + 13, c.cyan);
        // hull
        this._ln(s, x, y - 9, x + 9, y + 5, c.white); this._ln(s, x + 9, y + 5, x + 3, y + 3, c.white); this._ln(s, x + 3, y + 3, x, y + 6, c.white);
        this._ln(s, x, y - 9, x - 9, y + 5, c.white); this._ln(s, x - 9, y + 5, x - 3, y + 3, c.white); this._ln(s, x - 3, y + 3, x, y + 6, c.white);
        // keel + pods (lit gold with the twin and fan guns)
        this._ln(s, x, y - 9, x, y + 6, c.cyan);
        const pod = r.gunLevel > 0 ? c.gold : c.cyan;
        this._ln(s, x - 9, y + 5, x - 6, y + 2, pod); this._ln(s, x + 9, y + 5, x + 6, y + 2, pod);
        if (r.gunLevel === 2) { this._px(s, x - 10, y + 6, c.gold); this._px(s, x + 10, y + 6, c.gold); }
        if (r.firing && r._fireCd > R.FireGap - 0.05) this._px(s, x, y - 11, c.white);       // the muzzle

        if (r.mercyActive) this._dashRing(s, x, y, 15, 14, t * 0.6, r.shieldFlash > 0 ? c.cyan : c.cyanDim);
        else if (r.invuln > 0) this._dashRing(s, x, y, 13, 10, t * 0.9, c.cyanDim);
    }

    _dashRing(s, x, y, rad, dashes, phase, col) {
        const step = TAU / dashes;
        for (let k = 0; k < dashes; k++) {
            const a0 = phase + k * step, a1 = a0 + step * 0.55;
            this._ln(s, x + Math.cos(a0) * rad, y + Math.sin(a0) * rad * 0.7, x + Math.cos(a1) * rad, y + Math.sin(a1) * rad * 0.7, col);
        }
    }

    _miniShip(s, x, y, col) {
        const c = this.c;
        s.line(x, y - 5, x - 4, y + 4, col); s.line(x, y - 5, x + 4, y + 4, col);
        s.line(x - 4, y + 4, x, y + 2, col); s.line(x + 4, y + 4, x, y + 2, col);
        s.line(x, y - 4, x, y + 2, c.cyan);
    }

    // ------------------------------------------------------------------ explosions, pop-ups, the shock ring
    // size 0 a puff, 1 a kill, 2 a big kill, 3 a bomb's blast on the ground, 4 the ship or a boss eye, 5 a dome's ping
    _burst(s, r, b) {
        const c = this.c, age = b.t;
        const y = b.onGround ? r.scroll.toScreenY(b.y) : b.y;
        if (b.size === 5) {
            if (age > 0.35) return;
            this._ring(s, b.x, y, 10 + age * 30, 20, age < 0.15 ? c.white : c.cyan, 0, 0.85);
            return;
        }
        if (b.size === 3) {
            const life = 0.4;
            if (age >= life) return;
            const rad = (b.cluster ? R.ClusterR : R.BlastR) * (0.4 + age / life);
            this._circ(s, b.x, y, rad, age < 0.1 ? c.white : age < 0.22 ? c.ember : c.redDim, false);
            if (b.cluster) for (let k = 0; k < 4; k++) {
                const a = k * TAU / 4 + 0.78;
                this._circ(s, b.x + Math.cos(a) * 9, y + Math.sin(a) * 7, rad * 0.45, age < 0.15 ? c.white : c.ember, false);
            }
            return;
        }
        const life = b.size === 4 ? 1.1 : 0.5 + b.size * 0.15;
        const u = age / life;
        if (u >= 1) return;
        const steps = b.onGround ? [c.white, c.ember, c.red, c.redDim, c.nebDeep] : [c.white, c.cyan, c.ember, c.cyanDim, c.nebDeep];
        const col = steps[Math.min(steps.length - 1, Math.trunc(u * steps.length))];
        if (age < 0.12 && b.size >= 1) this._el(s, b.x, y, 3 + b.size * 2, 2 + b.size * 1.5, age < 0.06 ? c.white : c.ember);
        if (b.size >= 2) this._circ(s, b.x, y, 4 + age * (b.size === 4 ? 70 : 46), u < 0.4 ? c.ember : c.redDim, false);
        const n = 5 + b.size * 4;
        const seed = Math.trunc((b.x * 13 + b.y * 7) * 97) | 0;
        for (let k = 0; k < n; k++) {
            const h0 = hash(seed + k * 31);
            const a = (h0 % 1000) / 1000 * TAU, sp = 18 + (h0 >>> 10) % (b.size >= 2 ? 70 : 40);
            const d = sp * age;
            const px = b.x + Math.cos(a) * d, py = y + Math.sin(a) * d;
            this._ln(s, px - Math.cos(a), py - Math.sin(a), px + Math.cos(a) * 1.5, py + Math.sin(a) * 1.5, col);
        }
    }

    _shock(s, r) {
        const b = r.boss, c = this.c;
        const u = 1 - r.flash / 0.35;
        const y = b.kind === 'thunderhead' ? b.y : r.scroll.toScreenY(b.mapY);
        this._circ(s, b.x, y, 10 + u * 150, c.white, false);
        this._circ(s, b.x, y, 6 + u * 130, c.ember, false);
    }

    _popup(s, r, p) {
        const f = PixelFont.Arcade, c = this.c;
        const y = (p.onGround ? r.scroll.toScreenY(p.y) : p.y) - p.t * 14;
        const old = p.t > (p.text ? 0.9 : 0.55);
        const col = p.text ? (old ? c.ember : c.gold) : old ? (p.onGround ? c.tealDeep : c.cyanDim) : (p.onGround ? c.tealHi : c.white);
        s.textCentered(p.text || String(p.points), Math.round(p.x) + this.ox, Math.round(y) + this.oy, f, col);
    }

    // ------------------------------------------------------------------ HUD
    _knock(s, x, y, w, h) { s.rect(x - 2, y - 2, w + 4, h + 4, this.c.void); }

    _hud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, c = this.c;
        // left: 1UP, the gun's lanes and the cluster, the spare ships
        const spare = Math.max(0, Math.min(5, r.ships - (r.shipDown || r.p === Phase.ShipLost ? 0 : 1)));
        s.text('1UP', 14, 10, arc, c.cyan);
        for (let k = 0; k < 3; k++) s.rect(36 + k * 4, 10, 2, 7, k <= r.gunLevel ? c.cyan : c.nebDeep);
        if (r.cluster) { s.rect(50, 11, 2, 2, c.gold); s.rect(54, 11, 2, 2, c.gold); s.rect(52, 14, 2, 2, c.gold); }
        for (let i = 0; i < spare; i++) this._miniShip(s, 20 + i * 12, 24, c.white);
        // centre: the score, big
        const sc = dn(r.score, 6), sw = dsp.measure(sc, 2);
        this._knock(s, 160 - (sw >> 1), 10, sw, 14);
        s.textCentered(sc, 160, 10, dsp, c.tealHi, 2);
        // right: the sector and how far to its boss; the boss's armour once it is in sight
        const b = r.boss, w = 56, x = 306 - w;
        if (b != null && r.bossZone && !b.dead) {
            s.textRight('BOSS', 306, 10, arc, c.red);
            s.text(String(r.sector), x, 10, arc, c.redDim);
            s.frame(x, 19, w, 5, c.redDim);
            const fill = Math.round((w - 2) * b.health);
            if (fill > 0) s.rect(x + 1, 20, fill, 3, c.red);
        } else {
            s.textRight('SECTOR ' + r.sector, 306, 10, arc, c.tealHi);
            s.frame(x, 19, w, 5, c.tealDeep);
            const fill = Math.round((w - 2) * Math.max(0, Math.min(1, r.scroll.progress)));
            if (fill > 0) s.rect(x + 1, 20, fill, 3, c.teal);
            for (let k = 1; k < 3; k++) s.setPixel(x + Math.round(w * k / 3), 24, c.tealDeep);
        }
    }

    // a dithered plate (the arcade's only transparency), clipped to the field
    _plate(s, x0, y0, x1, y1, border) {
        const c = this.c;
        for (let y = y0; y < y1; y++) for (let x = x0 + ((x0 + y) & 1); x < x1; x += 2) s.setPixel(x, y, c.void);
        if (border) { s.rect(x0, y0, x1 - x0, 1, border); s.rect(x0, y1 - 1, x1 - x0, 1, border); }
    }

    _overlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, c = this.c;
        const midX = 160;
        if (r.banner != null && r.p === Phase.Playing) {
            s.textBox(r.banner.text, midX, 44, arc, 2, c.gold, c.gold, c.void);
        }
        if (r.p === Phase.Playing && r.boss != null && r.bossLive && r.boss.seen < 2.4) {
            this._plate(s, 24, 40, 296, 76, c.red);
            s.textCenteredShadow('WARNING', midX, 46, dsp, c.red, c.redDim, 2);
            s.textCenteredShadow(r.boss.name, midX, 64, arc, c.white, c.nebDeep);
        }
        if (r.p === Phase.Intro) {
            if (r.cardIntro) {
                const def = r.def;
                this._plate(s, 16, 52, 304, 150, c.teal);
                const title = 'SECTOR ' + r.sector;
                const x = midX - (dsp.measure(title, 3) >> 1);
                s.text(title, x + 3, 62 + 3, dsp, c.nebDeep, 3);
                s.textTwoTone(title, x, 62, dsp, c.tealHi, c.teal, 4, 3);
                if (r.phaseTime > 0.25) s.textCenteredShadow(def.name, midX, 96, arc, c.white, c.nebDeep, 2);
                if (r.phaseTime > 0.7) s.textCenteredShadow(def.hint, midX, 118, arc, c.gold, c.nebDeep);
                if (r.phaseTime > 1.2) s.textCenteredShadow(r.phaseTime > R.CardSeconds - 0.6 ? 'GO!' : 'GET READY', midX, 134, arc, c.tealHi, c.nebDeep);
            } else {
                s.textCenteredShadow('READY', midX, 90, dsp, c.white, c.nebDeep, 3);
            }
        } else if (r.p === Phase.ShipLost) {
            s.textBox('SHIP LOST', midX, 100, arc, 1, c.red, c.red, c.void);
        } else if (r.p === Phase.BossDown) {
            this._plate(s, 24, 84, 296, 128, c.ember);
            s.textCenteredShadow(r.boss.name, midX, 90, arc, c.white, c.nebDeep);
            s.textCenteredShadow('DESTROYED', midX, 104, dsp, c.ember, c.redDim, 2);
        } else if (r.p === Phase.Tally && r.tally != null) {
            this._tally(s, r);
        } else if (r.p === Phase.Card || r.p === Phase.Over) {
            this._endCard(s, r);
        }
    }

    _tally(s, r) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, c = this.c, T = r.tally;
        this._plate(s, 20, 40, 300, 206, c.tealHi);
        s.textCenteredShadow('SECTOR ' + T.sector + ' CLEAR', 160, 48, dsp, c.tealHi, c.tealDeep, 2);
        let y = 74;
        for (const l of T.lines) {
            if (!l.shown) break;
            const col = l.value > 0 ? c.white : c.neb;
            s.textShadow(l.label, 32, y, arc, col, c.nebDeep);
            const v = l.value > 0 ? String(l.value) : '-';
            s.textShadow(v, 288 - arc.measure(v), y, arc, l.value > 0 ? c.gold : c.neb, c.nebDeep);
            y += 13;
        }
        if (T.lines.length > 0 && T.lines[T.lines.length - 1].shown) {
            s.rect(32, y + 1, 256, 1, c.teal);
            s.textShadow('SECTOR BONUS', 32, y + 6, arc, c.tealHi, c.nebDeep);
            const v = String(T.shownTotal);
            s.textShadow(v, 288 - arc.measure(v), y + 6, arc, c.gold, c.nebDeep);
        }
        if (r.phaseTime > 2.7) {
            const next = r.finalSector ? 'THE NEBULA IS CLEAR' : 'NEXT  ' + SECTORS[r.sector].name;
            s.textCenteredShadow(next, 160, 188, arc, r.finalSector ? c.gold : c.white, c.nebDeep);
        }
    }

    _endCard(s, r) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, c = this.c, spec = NebulaRunSpec, won = r.roundWon;
        this._plate(s, 16, 56, 304, 176, won ? c.gold : c.red);
        const title = won ? spec.roundWonText : spec.roundLostText;
        const k = won ? 2 : 3;
        const x = 160 - (dsp.measure(title, k) >> 1);
        s.text(title, x + k, 66 + k, dsp, won ? c.tealDeep : c.redDim, k);
        s.textTwoTone(title, x, 66, dsp, won ? c.tealHi : c.white, won ? c.teal : c.red, 4, k);
        if (won) s.textCenteredShadow('THE MOTHER FORTRESS IS DOWN', 160, 92, arc, c.gold, c.nebDeep);
        else s.textCenteredShadow('SECTOR ' + r.sector + '  ' + r.def.name, 160, 94, arc, c.white, c.nebDeep);
        s.textCenteredShadow('SCORE ' + dn(r.score, 6), 160, 112, arc, c.tealHi, c.nebDeep, 2);
        s.textCenteredShadow('SECTORS CLEARED ' + r.sectorsCleared + ' OF 5', 160, 140, arc, won ? c.gold : c.neb, c.nebDeep);
        s.textCenteredShadow('BEACONS ' + r._beacons + '   PODS ' + r._caps, 160, 156, arc, c.cyanDim, c.nebDeep);
    }
}

function wrap01(v) { v %= 1; return v < 0 ? v + 1 : v; }
