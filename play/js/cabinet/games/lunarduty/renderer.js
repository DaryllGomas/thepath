// THE NODE · world 1 · LUNAR DUTY · THE PICTURE. Port of LunarDutyRenderer.cs.
//
// Built for a curved tube seen from 0.8 m: the buggy is a 32 px sprite (six-wheeled: three wheels
// a side, cyan hubs, a dome with the driver in it, the up-gun turret, a low nose cannon), UFOs are
// 16 px, rocks 10-14 px, the tank 24 px. Everything inside the 8 px safe area.
//
//   HUD  y 8..45    1UP score (Display x2) | POINT letter (Display x2) | buggies left | TIME (Display x2)
//                   and the progress strip: A-B-C-D-E plates on a line, the buggy's marker riding it
//   FIELD y 48..231 stars and a cratered moon, three parallax layers (scroll.js), the road at y 200
//
// Cards sit on double-framed TextBox plates. The checkpoint call-out is plain shadowed text over
// the black sky so it never hides a bomb. Blinks are 1 Hz; the UFO lights chase at 1 Hz; the
// only flash is one 0.12 s white frame when something blows up.
import { PixelFont, SurfaceDraw, d6, dn, roundEven } from '../../sdk/index.js';
import * as Sprites from './sprites.js';
import * as Scroll from './scroll.js';
import { HazardKind, Checkpoints, Letters, Sectors } from './course.js';
import { LunarDutySim, DeathCause, craterDepth, craterWidth } from './sim.js';
import { LunarDutySpec, LunarDutyPalette } from './spec.js';

const FieldTop = 48, FieldBottom = 232, Ground = 200;
const StripX0 = 28, StripX1 = 292, StripY = 40;

export class LunarDutyRenderer {
    constructor() {
        const pal = LunarDutyPalette;
        this.pal = pal;
        this.cVoid = pal.get('void'); this.cDust = pal.get('dust'); this.cDustDim = pal.get('dustDim'); this.cDustDark = pal.get('dustDark');
        this.cCyan = pal.get('cyan'); this.cCyanDim = pal.get('cyanDim'); this.cRed = pal.get('red'); this.cRedDim = pal.get('redDim');
        this.cTan = pal.get('tan'); this.cTanDim = pal.get('tanDim'); this.cMag = pal.get('magenta'); this.cMagDim = pal.get('magentaDim');
        this.cWhite = pal.get('white');
        this.ridge = new Uint8Array(16384); this.ridgeLit = new Uint8Array(16384); this.dunes = new Uint8Array(16384);
        for (let i = 0; i < 16384; i++) {
            const u = i - 1024;
            this.ridge[i] = Scroll.mountainTop(u); this.ridgeLit[i] = Scroll.mountainLit(u) ? 1 : 0;
            this.dunes[i] = Scroll.hillTop(u);
        }
        this.terrainTop = new Int16Array(304); this.terrainFace = new Array(304);
        this.grit = new Uint8Array(256 * 32);
        for (let y = 0; y < 32; y++) for (let x = 0; x < 256; x++)
            this.grit[y * 256 + x] = Scroll.speck(x, Ground + y);
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cVoid);
        if (r == null) return;

        s.clip(8, FieldTop, 304, FieldBottom - FieldTop);
        const cam = r.camX;
        this._drawSky(s, r);
        this._drawMountains(s, cam, r.checkpoint);
        if (r.checkpoint !== 4) this._drawCity(s, cam);
        this._drawHills(s, cam);
        this._drawGround(s, r, cam);
        this._drawPosts(s, cam);
        this._drawObstacles(s, r, cam, t);
        this._drawShots(s, r, cam);
        this._drawBuggy(s, r, cam);
        for (const u of r.ufos)
            s.blit(Sprites.Ufo[Math.trunc(t * 2) & 1], roundEven(u.sx), roundEven(u.sy), this.pal);
        this._drawBooms(s, r, cam);
        const b = r.boss;
        if (b && b.hp > 0) {
            const bx = roundEven(b.x - cam), by = Ground - 38;
            const c = b.hit > 0 ? this.cWhite : this.cMag;
            s.rect(bx - 8, by, 55, 22, this.cMagDim); s.frame(bx - 8, by, 55, 22, c);
            s.rect(bx + 7, by - 7, 26, 7, this.cMagDim); s.frame(bx + 7, by - 7, 26, 7, c);
            s.rect(bx + 12, by - 5, 15, 3, this.cCyan);
            for (let i = 0; i < 4; i++) { s.rect(bx - 3 + i * 12, by + 14, 8, 5, this.cDustDark); s.setPixel(bx - 2 + i * 12, by + 16, this.cRed); }
            s.rect(bx + 38, by + 3, 5, 9, this.cTanDim);
            s.rect(bx - 17, by + 27, 72, 4, this.cDustDark);
            for (let i = 0; i < 3; i++) {
                const leg = bx + i * 18;
                s.line(leg, by + 22, leg - 5, Ground - 2, c);
                s.rect(leg - 10, Ground - 3, 13, 3, this.cDust);
            }
            s.rect(bx - 22, by + 13, 22, 5, this.cDust);
            s.rect(bx + 9, by + 6, 22, 5, b.t < 0.65 ? this.cRed : this.cCyan);
            if (b.active) {
                s.textCentered('BEACON WALKER', 160, 57, PixelFont.Arcade, this.cMag);
                s.frame(105, 68, 110, 5, this.cDustDim);
                s.rect(106, 69, Math.ceil(108 * b.hp / b.max), 3, this.cRed);
                if (b.t < 0.65) s.textCentered('GUN CHARGING', 160, 79, PixelFont.Arcade, this.cRed);
            }
        }
        for (const p of r.pops) s.textCentered(p.text, roundEven(p.x - cam), roundEven(Ground - p.h - p.t * 18), PixelFont.Arcade, this.cWhite);
        if (r.checkpoint === 1) for (const o of r.obstacles) if (o.alive && o.x - r.x < 250) {
            const ox = roundEven(o.center - cam);
            s.line(ox - 3, Ground - 4, ox + 3, Ground - 8, this.cCyan);
        }
        s.noClip();

        this._drawHud(s, r, t);
        this._drawOverlays(s, r, t);
    }

    // ------------------------------------------------------------ backdrop
    _drawSky(s, r) {
        for (let i = 0; i < Scroll.StarX.length; i++) {
            const c = Scroll.StarC[i];
            s.setPixel(Scroll.StarX[i], Scroll.StarY[i], c === 0 ? this.cWhite : c <= 2 ? this.cDust : this.cDustDim);
        }
        // the cratered moon over the left of the sky
        const mx = 46 + (r.checkpoint % 3) * 26, my = 80, mr = 14 + r.checkpoint * 2;
        s.circle(mx, my, mr, this.cDust, true);
        s.circle(mx + 5, my + 2, mr - 2, this.cDustDim, false);
        s.circle(mx - 5, my - 4, 3, this.cDustDim, true);
        s.circle(mx + 4, my + 5, 2, this.cDustDim, true);
        s.circle(mx - 3, my + 7, 2, this.cDustDim, true);
        s.circle(mx + 6, my - 6, 1, this.cDustDim, true);
        if (r.checkpoint === 4) s.circle(mx + 6, my - 3, mr, this.cVoid, true);
        s.setPixel(mx - 7, my - 5, this.cWhite); s.setPixel(mx - 6, my - 6, this.cWhite);
    }

    _drawMountains(s, cam, sector) {
        const off = cam * Scroll.MountainFactor;
        const face = sector === 2 || sector === 5 ? this.cMagDim : sector === 0 || sector === 4 ? this.cDustDark : this.cCyanDim;
        for (let x = 8; x < 312; x++) {
            const at = (Math.floor(off + x) + 1024) & 16383;
            this.terrainTop[x - 8] = this.ridge[at];
            this.terrainFace[x - 8] = this.ridgeLit[at] ? face : this.cDustDark;
        }
        this._terrain(s);
        for (let x = 8; x < 312; x++) s.setPixel(x, this.terrainTop[x - 8], this.cDustDim);
    }

    // Horizontal spans avoid thousands of one-pixel-wide surface fills on each tube.
    _terrain(s) {
        let min = Ground;
        for (const y of this.terrainTop) min = Math.min(min, y);
        for (let y = min; y < Ground; y++) {
            let start = 0, color = null;
            for (let i = 0; i <= 304; i++) {
                const next = i < 304 && y >= this.terrainTop[i] ? this.terrainFace[i] : null;
                if (next === color) continue;
                if (color) s.rect(start + 8, y, i - start, 1, color);
                start = i; color = next;
            }
        }
    }

    _drawCity(s, cam) {
        const off = cam * Scroll.CityFactor;
        const m0 = Scroll.floor((off + 8) / Scroll.CityModule) - 1, m1 = Scroll.floor((off + 312) / Scroll.CityModule) + 1;
        for (let m = m0; m <= m1; m++) {
            const kind = Scroll.cityKind(m);
            if (kind === 0) continue;
            const h = Scroll.citySeed(m);
            const x0 = roundEven(m * Scroll.CityModule - off) + (h % 12);
            const b = Scroll.CityBase;
            switch (kind) {
                case 1:
                    this._dome(s, x0 + 22, b, 14 + ((h >>> 8) % 4));
                    this._tower(s, x0 + 42, b, 6, 26 + ((h >>> 12) % 10), (h >>> 20) % 2 === 0);
                    break;
                case 2:
                    this._dome(s, x0 + 14, b, 9);
                    this._dome(s, x0 + 36, b, 11);
                    break;
                case 3:
                    this._tower(s, x0 + 10, b, 7, 30 + ((h >>> 8) % 12), true);
                    this._tower(s, x0 + 20, b, 5, 20 + ((h >>> 14) % 10), false);
                    this._tower(s, x0 + 29, b, 6, 36 + ((h >>> 18) % 10), true);
                    break;
                case 4:
                    this._dome(s, x0 + 14, b, 12);
                    s.rect(x0 + 26, b - 5, 14, 3, this.cDustDark); s.rect(x0 + 26, b - 5, 14, 1, this.cCyan);
                    this._dome(s, x0 + 46, b, 8);
                    break;
                case 5:
                    this._tower(s, x0 + 18, b, 4, 40 + ((h >>> 8) % 8), false);
                    s.rect(x0 + 13, b - 44 - ((h >>> 8) % 8), 14, 2, this.cDustDim);    // a radar dish across the mast
                    this._dome(s, x0 + 34, b, 7);
                    break;
            }
        }
    }

    _dome(s, cx, baseY, rad) {
        s.clip(8, FieldTop, 304, baseY + 1 - FieldTop);      // the upper half only
        s.circle(cx, baseY, rad, this.cDustDark, true);
        s.circle(cx, baseY, rad, this.cCyan, false);
        s.clip(8, FieldTop, 304, FieldBottom - FieldTop);
        // a ring of lit windows a third of the way up
        const wy = baseY - Math.trunc(rad / 3);
        const ww = roundEven(Math.sqrt(rad * rad - Math.trunc(rad / 3) * Math.trunc(rad / 3))) - 2;
        for (let x = cx - ww; x <= cx + ww; x += 3) s.setPixel(x, wy, this.cWhite);
    }

    _tower(s, x, baseY, w, h, beacon) {
        s.rect(x, baseY - h, w, h, this.cDustDark);
        s.rect(x, baseY - h, 1, h, this.cCyanDim);
        for (let y = baseY - h + 3; y < baseY - 2; y += 4)
            for (let i = 1; i < w - 1; i += 2) s.setPixel(x + i, y, ((y + i) & 4) === 0 ? this.cCyan : this.cCyanDim);
        s.rect(x + Math.trunc(w / 2), baseY - h - 4, 1, 4, this.cDustDim);
        if (beacon) s.setPixel(x + Math.trunc(w / 2), baseY - h - 5, this.cRed);
    }

    _drawHills(s, cam) {
        const off = cam * Scroll.HillFactor;
        for (let x = 8; x < 312; x++) {
            this.terrainTop[x - 8] = this.dunes[(Math.floor(off + x) + 1024) & 16383];
            this.terrainFace[x - 8] = this.cDustDark;
        }
        this._terrain(s);
        for (let x = 8; x < 312; x++) s.setPixel(x, this.terrainTop[x - 8], this.cDustDim);
    }

    _drawGround(s, r, cam) {
        let ci = 0;
        const craters = r.craters;
        s.rect(8, Ground, 304, 2, this.cDust);
        s.rect(8, Ground + 2, 304, FieldBottom - Ground - 2, this.cDustDim);
        for (let x = 8; x < 312; x++) {
            const wxf = cam + x;
            const wx = Scroll.floor(wxf);
            while (ci < craters.length && craters[ci].x1 < wxf - 4) ci++;
            let depth = 0, lip = false;
            for (let k = ci; k < craters.length; k++) {
                const c = craters[k];
                if (c.x0 > wxf + 4) break;
                if (wxf >= c.x0 && wxf < c.x1) {
                    const u = (wxf - c.x0) / craterWidth(c), v = 2 * u - 1;
                    depth = Math.max(depth, roundEven(craterDepth(craterWidth(c)) * Math.sqrt(Math.max(0, 1 - v * v))) + 1);
                } else if ((wxf >= c.x0 - 3 && wxf < c.x0) || (wxf >= c.x1 && wxf < c.x1 + 3)) lip = true;
            }
            const surf = Ground + depth;
            if (depth > 0) {
                // the pit: black, a dark wall at the bottom
                s.setPixel(x, surf, this.cDustDark);
                s.rect(x, Ground, 1, surf - Ground, this.cVoid);
            } else {
                const bump = lip || Scroll.bump(wxf);
                if (bump) s.setPixel(x, Ground - 1, this.cDust);

            }
            for (let y = Math.max(surf + 2, Ground + 3); y < FieldBottom - 3; y++) {
                const sp = this.grit[(y - Ground) * 256 + (wx & 255)];
                if (sp === 1) s.setPixel(x, y, this.cDust);
                else if (sp === 2) s.setPixel(x, y, this.cDustDark);
            }
        }
        s.rect(8, FieldBottom - 3, 304, 3, this.cDustDark);
    }

    _drawPosts(s, cam) {
        const cps = Checkpoints;
        for (let i = 0; i < cps.length; i++) {
            const x = roundEven(cps[i] - cam);
            if (x < -20 || x > 340) continue;
            const last = i === cps.length - 1;
            s.rect(x, Ground - 30, 2, 30, this.cDust);
            s.rect(x + 2, Ground - 30, 1, 30, this.cDustDim);
            const px = x - 6, py = Ground - 42;
            s.rect(px, py, 15, 13, last ? this.cTanDim : this.cCyanDim);
            s.frame(px, py, 15, 13, last ? this.cTan : this.cCyan);
            s.text(Letters[i], px + 5, py + 3, PixelFont.Arcade, this.cWhite);
            if (last) { s.rect(x + 3, Ground - 30, 10, 2, this.cRed); s.rect(x + 3, Ground - 26, 10, 2, this.cRed); }
        }
    }

    _drawObstacles(s, r, cam, t) {
        for (const o of r.obstacles) {
            if (!o.alive) continue;
            const x = roundEven(o.x - cam);
            if (x > 330) break;
            if (x < -30) continue;
            switch (o.kind) {
                case HazardKind.Rock: s.blit(Sprites.Rock, x, Ground - 8, this.pal); break;
                case HazardKind.BigRock: s.blit(Sprites.BigRock, x, Ground - 12, this.pal); break;
                case HazardKind.Mine:
                    s.blit(SurfaceDraw.blink(t) ? Sprites.Mine : Sprites.MineDark, x, Ground - 5, this.pal); break;
                case HazardKind.Tank:
                    if (o.hitT < 0.12) s.blitTinted(Sprites.Tank, x, Ground - 13, this.cWhite);
                    else s.blit(Sprites.Tank, x, Ground - 13, this.pal);
                    break;
            }
        }
        for (const sh of r.shells)
            s.blit(Sprites.Shell, roundEven(sh.x - cam) - 3, roundEven(Ground - sh.h) - 2, this.pal);
        for (const b of r.bombs)
            s.blit(Sprites.Bomb, roundEven(b.x - cam) - 2, roundEven(Ground - b.h) - 3, this.pal);
    }

    _drawShots(s, r, cam) {
        for (const m of r.missiles)
            s.blit(Sprites.Missile, roundEven(m.x - cam) - 1, roundEven(Ground - m.h), this.pal);
        const f = r.fwdShot;
        if (f != null) s.blit(Sprites.Shot, roundEven(f.x - cam) - 4, roundEven(Ground - f.h) - 1, this.pal);
    }

    // ------------------------------------------------------------ the buggy
    _drawBuggy(s, r, cam) {
        const cx = roundEven(r.x - cam);
        const left = cx - Sprites.BodyLeft;
        const baseY = roundEven(Ground - r.h);           // row under the wheels
        const P = r.p;
        if (P === LunarDutySim.Phase.Crash) {
            const pt = r.phaseTime;
            if (r.cause === DeathCause.Crater) {
                const sink = roundEven(Math.min(1, pt / 0.35) * (r.causeDepth + 6));
                if (pt < 0.35) {
                    s.clip(8, FieldTop, 304, Ground + Math.trunc(r.causeDepth) + 1 - FieldTop);
                    this._drawBuggyAt(s, r, left, baseY + sink, 0, false);
                    s.clip(8, FieldTop, 304, FieldBottom - FieldTop);
                    return;
                }
                this._wreck(s, cx, baseY + sink - 4, pt - 0.35);
                return;
            }
            if (pt < 0.12) { s.blitTinted(Sprites.Body, left, baseY - Sprites.BodyTall, this.cWhite); return; }
            this._wreck(s, cx, baseY, pt);
            return;
        }
        let bob = 0;
        const wb = [0, 0, 0];
        if (r.grounded) {
            let sum = 0;
            for (let i = 0; i < 3; i++) {
                wb[i] = Scroll.bump(r.x - Sprites.BodyLeft + Sprites.WheelX[i]) ? -1 : 0;
                sum += wb[i];
            }
            bob = sum <= -2 ? -1 : 0;
            if (r.landT < 0.12) bob = 1;
        } else { wb[0] = wb[1] = wb[2] = 1; }
        const shield = r.mercyActive && r.shieldT < 0.35;
        this._drawBuggyAt(s, r, left, baseY, bob, shield, wb);
    }

    _drawBuggyAt(s, r, left, baseY, bob, shield, wheelBob = null) {
        const top = baseY - Sprites.BodyTall + bob;
        if (shield) {
            s.blitTinted(Sprites.Body, left - 1, top, this.cCyan);
            s.blitTinted(Sprites.Body, left + 1, top, this.cCyan);
            s.blitTinted(Sprites.Body, left, top - 1, this.cCyan);
        }
        s.blit(Sprites.Body, left, top, this.pal);
        const frame = Math.trunc(Math.floor(r.x / 6)) & 3;
        for (let i = 0; i < 3; i++) {
            const wx = left + Sprites.WheelX[i] - 4;
            const wy = baseY - 8 + (wheelBob != null ? wheelBob[i] : 0);
            if (shield) s.blitTinted(Sprites.Wheels[0], wx, wy + 1, this.cCyan);
            s.blit(Sprites.Wheels[(frame + i) & 3], wx, wy, this.pal);
        }
    }

    // the buggy comes apart: the wheels fly, the hull tumbles dark
    _wreck(s, cx, baseY, t) {
        if (t > 1.6) return;
        const hullY = baseY - 12 - roundEven(Math.max(0, 40 * t - 60 * t * t));
        if (t < 1.1) {
            s.rect(cx - 12, hullY, 24, 4, t < 0.5 ? this.cTanDim : this.cDustDark);
            s.rect(cx - 4, hullY - 4, 9, 4, t < 0.5 ? this.cCyanDim : this.cDustDark);
        }
        for (let i = 0; i < 3; i++) {
            const dir = i - 1;
            const tt = t;
            const wx = cx + roundEven(dir * 34 * tt) - 4 + (i - 1) * 10;
            let up = 70 * tt - 120 * tt * tt;
            if (up < 0) up = 0;
            const wy = baseY - 8 - roundEven(up);
            s.blit(Sprites.Wheels[Math.trunc(tt * 8 + i) & 3], wx, wy, this.pal);
        }
    }

    // ------------------------------------------------------------ explosions (palette steps, no blending)
    _drawBooms(s, r, cam) {
        for (const b of r.booms) {
            const x = roundEven(b.x - cam), y = roundEven(Ground - b.h);
            const t = b.t;
            switch (b.kind) {
                case 0: this._burst(s, x, y, t, 0.5, 10, 10, this.cWhite, this.cDust, this.cRed); break;
                case 1: this._burst(s, x, y, t, 0.7, 16, 14, this.cWhite, this.cMag, this.cCyan); break;
                case 2:
                    if (t < 0.12) s.circle(x, y - 4, 10, this.cWhite, true);
                    this._burst(s, x, y - 4, t, 1.1, 28, 20, this.cWhite, this.cRed, this.cTan); break;
                case 3:
                    // a bomb's dust plume: grit thrown up out of the new crater
                    if (t > 0.7) break;
                    for (let k = 0; k < 10; k++) {
                        const a = -0.4 - k * 0.26;
                        const m = 4 + t * 30 * (0.6 + (k % 3) * 0.25);
                        const px = x + Math.trunc(Math.cos(a) * m), py = y + Math.trunc(Math.sin(a) * m) + Math.trunc(t * t * 40);
                        s.rect(px, py, 2, 2, t < 0.3 ? this.cDust : this.cDustDim);
                    }
                    if (t < 0.12) s.circle(x, y, 5, this.cWhite, true);
                    break;
                case 4:
                    if (t < 0.35) s.circle(x, y, 3 + Math.trunc(t * 30), this.cCyan, false);
                    break;
                case 5:
                    if (t < 0.12) s.circle(x, y - 2, 9, this.cWhite, true);
                    this._burst(s, x, y - 2, t, 1.0, 22, 16, this.cWhite, this.cMag, this.cRed); break;
            }
        }
    }

    _burst(s, x, y, t, life, reach, n, hot, mid, edge) {
        if (t > life) return;
        const k = t / life;
        const rad = 2 + Math.trunc(k * reach);
        for (let i = 0; i < n; i++) {
            const a = i * (6.2832 / n) + (i % 2) * 0.2;
            const m = rad * (0.55 + (i % 3) * 0.22);
            const px = x + Math.trunc(Math.cos(a) * m), py = y + Math.trunc(Math.sin(a) * m * 0.8);
            const c = k < 0.25 ? hot : k < 0.6 ? (i % 2 === 0 ? mid : edge) : (i % 2 === 0 ? this.cDustDim : this.cDustDark);
            const sz = k < 0.6 ? 2 : 1;
            s.rect(px, py, sz, sz, c);
        }
    }

    // ------------------------------------------------------------ HUD
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 8, arc, this.cMag);
        s.text(d6(r.score), 8, 18, dsp, this.cWhite, 2);
        s.textCentered('POINT', 160, 8, arc, this.cCyan);
        s.textCentered(Letters[r.checkpoint], 160, 18, dsp, this.cTan, 2);
        s.textRight('TIME', 312, 8, arc, this.cCyan);
        const secs = Math.min(999, Math.trunc(r.sectionTime));
        s.textRight(dn(secs, 3), 312, 18, dsp, this.cDust, 2);
        // buggies left
        if (r.mercyActive) s.text('SHIELD', 190, 22, arc, this.cCyan);
        else for (let i = 0; i < r.lives; i++) s.blit(Sprites.Icon, 190 + i * 17, 22, this.pal);

        // the progress strip: A B C D E on a line, the buggy's marker riding it
        const cps = Checkpoints;
        const end = cps[cps.length - 1];
        const mx = StripX0 + roundEven((StripX1 - StripX0) * r.progress);
        s.rect(StripX0, StripY, StripX1 - StripX0, 1, this.cDustDark);
        s.rect(StripX0, StripY, mx - StripX0, 2, this.cCyan);
        for (let i = 0; i < cps.length; i++) {
            const px = StripX0 + roundEven((StripX1 - StripX0) * cps[i] / end);
            const reached = i <= r.checkpoint;
            s.rect(px - 5, StripY - 4, 11, 10, reached ? this.cCyan : this.cVoid);
            s.frame(px - 5, StripY - 4, 11, 10, reached ? this.cCyan : this.cDustDim);
            s.text(Letters[i], px - 2, StripY - 2, arc, reached ? this.cVoid : this.cDust);
        }
        // the marker: a tiny tan buggy
        s.rect(mx - 3, StripY - 3, 7, 3, this.cTan);
        s.rect(mx - 1, StripY - 5, 3, 2, this.cCyan);
        s.rect(mx - 3, StripY, 2, 2, this.cDustDark); s.rect(mx + 2, StripY, 2, 2, this.cDustDark);
    }

    // ------------------------------------------------------------ overlays
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const P = r.p;
        const letter = Letters[r.checkpoint];
        if (r.extraT > 0) s.textCenteredShadow("EXTRA BUGGY!", 160, 172, arc, this.cTan, this.cVoid);
        if (P === LunarDutySim.Phase.Ready) {
            s.plate(30, 75, 260, 78, this.cVoid, this.cCyan);
            s.textCentered('SECTOR ' + (r.checkpoint + 1) + ' / 6', 160, 83, arc, this.cTan);
            s.textCentered(Sectors[r.checkpoint][0], 160, 98, dsp, this.cWhite, 2);
            s.textCentered(Sectors[r.checkpoint][1], 160, 139, arc, this.cDust);
            const go = r.phaseTime >= r.readyLen - 0.5;
            s.textCenteredShadow(go ? 'GO!' : 'GET READY', 160, 118, dsp, go ? this.cWhite : this.cCyan, this.cVoid, 2);
            if (r.mercyActive) s.textCenteredShadow('SHIELD ON', 160, 159, arc, this.cCyan, this.cVoid);
            else if (r.checkpoint > 0 || r.lives < r.startLives)
                s.textCenteredShadow(r.lives === 1 ? 'LAST BUGGY' : r.lives + ' BUGGIES LEFT', 160, 159, arc, this.cDust, this.cVoid);
        } else if (P === LunarDutySim.Phase.Tally) {
            s.plate(46, 76, 228, 80, this.cVoid, this.cCyan);
            s.textCentered('SECTOR SECURED', 160, 85, dsp, this.cTan, 2);
            const n = Math.min(1, r.phaseTime / 1.4);
            s.textCentered('BEACON BONUS  500', 160, 108, arc, this.cWhite);
            s.textCentered('TIME BONUS  ' + Math.floor(r.lastBonus * n), 160, 122, arc, this.cCyan);
            s.textCentered(r.checkpoint === 6 ? 'ALL BEACONS ONLINE' : 'NEXT: ' + Sectors[r.checkpoint][0], 160, 141, arc, this.cDust);
        } else if (P === LunarDutySim.Phase.Crash && r.phaseTime > 0.5) {
            let why;
            switch (r.cause) {
                case DeathCause.Crater: why = 'FELL IN A CRATER'; break;
                case DeathCause.Rock: why = 'HIT A ROCK'; break;
                case DeathCause.Mine: why = 'HIT A MINE'; break;
                case DeathCause.Tank: why = 'RAMMED THE TANK'; break;
                case DeathCause.Shell: why = 'SHELLED BY THE TANK'; break;
                default: why = 'BOMBED FROM ABOVE'; break;
            }
            s.textBox('BUGGY LOST', 160, 78, dsp, 2, this.cRed, this.cRed, this.cVoid);
            s.textCenteredShadow(why, 160, 104, arc, this.cWhite, this.cVoid);
            s.textCenteredShadow(r.lives <= 0 ? 'NO BUGGIES LEFT' : r.lives === 1 ? 'LAST BUGGY' : r.lives + ' BUGGIES LEFT', 160, 116, arc, this.cDust, this.cVoid);
        } else if ((P === LunarDutySim.Phase.Drive || P === LunarDutySim.Phase.Finish) && r.bannerT < 2.4 && r.checkpoint > 0) {
            // the call-out rides over the black sky, no plate: it must never hide a bomb
            s.textCenteredShadow('POINT ' + letter, 160, 56, dsp, this.cTan, this.cVoid, 3);
            const bonus = '500 + TIME BONUS ' + r.lastBonus;
            s.textCenteredShadow(bonus, 160, 84, arc, this.cWhite, this.cVoid);
            if (P === LunarDutySim.Phase.Finish) s.textCenteredShadow('COURSE COMPLETE', 160, 98, arc, this.cCyan, this.cVoid);
        } else if (P === LunarDutySim.Phase.Finish) {
            s.textCenteredShadow('COURSE COMPLETE', 160, 72, dsp, this.cCyan, this.cVoid, 2);
        } else if (P === LunarDutySim.Phase.Card || P === LunarDutySim.Phase.Over) {
            const spec = LunarDutySpec;
            const won = r.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, 160, 70, dsp, 2, won ? this.cCyan : this.cRed, this.cTan, this.cVoid);
            s.plate(76, 100, 168, 50, this.cVoid, this.cTan);
            s.textCentered('SCORE ' + d6(r.score), 160, 107, arc, this.cWhite, 2);
            s.textCentered(won ? 'ALL SIX BEACONS ONLINE' : 'LAST POINT ' + letter, 160, 132, arc, won ? this.cTan : this.cDust);
        }
    }
}
