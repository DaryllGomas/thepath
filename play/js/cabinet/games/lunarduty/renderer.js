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
import { HazardKind, Checkpoints, Letters } from './course.js';
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
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cVoid);
        if (r == null) return;

        s.clip(8, FieldTop, 304, FieldBottom - FieldTop);
        const cam = r.camX;
        this._drawSky(s);
        this._drawMountains(s, cam);
        this._drawCity(s, cam);
        this._drawHills(s, cam);
        this._drawGround(s, r, cam);
        this._drawPosts(s, cam);
        this._drawObstacles(s, r, cam, t);
        this._drawShots(s, r, cam);
        this._drawBuggy(s, r, cam);
        for (const u of r.ufos)
            s.blit(Sprites.Ufo[Math.trunc(t * 2) & 1], roundEven(u.sx), roundEven(u.sy), this.pal);
        this._drawBooms(s, r, cam);
        s.noClip();

        this._drawHud(s, r, t);
        this._drawOverlays(s, r, t);
    }

    // ------------------------------------------------------------ backdrop
    _drawSky(s) {
        for (let i = 0; i < Scroll.StarX.length; i++) {
            const c = Scroll.StarC[i];
            s.setPixel(Scroll.StarX[i], Scroll.StarY[i], c === 0 ? this.cWhite : c <= 2 ? this.cDust : this.cDustDim);
        }
        // the cratered moon over the left of the sky
        const mx = 46, my = 80, mr = 14;
        s.circle(mx, my, mr, this.cDust, true);
        s.circle(mx + 5, my + 2, mr - 2, this.cDustDim, false);
        s.circle(mx - 5, my - 4, 3, this.cDustDim, true);
        s.circle(mx + 4, my + 5, 2, this.cDustDim, true);
        s.circle(mx - 3, my + 7, 2, this.cDustDim, true);
        s.circle(mx + 6, my - 6, 1, this.cDustDim, true);
        s.setPixel(mx - 7, my - 5, this.cWhite); s.setPixel(mx - 6, my - 6, this.cWhite);
    }

    _drawMountains(s, cam) {
        const off = cam * Scroll.MountainFactor;
        for (let x = 8; x < 312; x++) {
            const u = off + x;
            const top = Scroll.mountainTop(u);
            const lit = Scroll.mountainLit(u);
            s.rect(x, top, 1, Ground - top, lit ? this.cCyanDim : this.cDustDark);
            s.setPixel(x, top, lit ? this.cDustDim : this.cCyanDim);
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
            const u = off + x;
            const top = Scroll.hillTop(u);
            s.rect(x, top, 1, Ground - top, this.cDustDark);
            s.setPixel(x, top, this.cDustDim);
            if ((Scroll.hash(Scroll.floor(u) * 31) & 15) === 0 && top + 3 < Ground) s.setPixel(x, top + 3, this.cDustDim);
        }
    }

    _drawGround(s, r, cam) {
        let ci = 0;
        const craters = r.craters;
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
                s.rect(x, surf + 1, 1, FieldBottom - surf - 1, this.cDustDim);
            } else {
                const bump = lip || Scroll.bump(wxf);
                if (bump) s.setPixel(x, Ground - 1, this.cDust);
                s.rect(x, Ground, 1, 2, this.cDust);
                s.rect(x, Ground + 2, 1, FieldBottom - Ground - 2, this.cDustDim);
            }
            for (let y = Math.max(surf + 2, Ground + 3); y < FieldBottom - 3; y++) {
                const sp = Scroll.speck(wx, y);
                if (sp === 1) s.setPixel(x, y, this.cDust);
                else if (sp === 2) s.setPixel(x, y, this.cDustDark);
            }
            s.rect(x, FieldBottom - 3, 1, 3, this.cDustDark);
        }
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
        if (P === LunarDutySim.Phase.Ready) {
            s.textBox('POINT ' + letter, 160, 84, dsp, 3, this.cTan, this.cCyan, this.cVoid);
            const go = r.phaseTime >= r.readyLen - 0.5;
            s.textCenteredShadow(go ? 'GO!' : 'GET READY', 160, 118, dsp, go ? this.cWhite : this.cCyan, this.cVoid, 2);
            if (r.mercyActive) s.textCenteredShadow('FREE RIDE  SHIELD ON', 160, 140, arc, this.cCyan, this.cVoid);
            else if (r.checkpoint > 0 || r.lives < r.startLives)
                s.textCenteredShadow(r.lives === 1 ? 'LAST BUGGY' : r.lives + ' BUGGIES LEFT', 160, 140, arc, this.cDust, this.cVoid);
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
            s.textBox(won ? spec.roundWonText : spec.roundLostText, 160, 70, dsp, 3, won ? this.cCyan : this.cRed, this.cTan, this.cVoid);
            s.plate(76, 100, 168, 50, this.cVoid, this.cTan);
            s.textCentered('SCORE ' + d6(r.score), 160, 107, arc, this.cWhite, 2);
            s.textCentered(won ? 'REACHED POINT E' : 'LAST POINT ' + letter, 160, 132, arc, won ? this.cTan : this.cDust);
        }
    }
}
