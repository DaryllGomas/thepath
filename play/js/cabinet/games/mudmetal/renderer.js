// THE NODE · world 1 · MUD & METAL · THE PICTURE. Port of MudMetalRenderer.cs.
//
// A full 320 x 240 screen, everything inside the 8 px safe area:
//   y   8..34   HUD: 1UP + score, the lap TIME, the PAR time, all in display digits at scale 2
//   y  36..77   dusk sky in dithered bands, the setting sun, far hills        (parallax 0.02 / 0.12)
//   y  78..103  the grandstands and their crowd, light towers in the gaps     (parallax 0.5)
//   y 104..111  the advertising boards along the back fence                    (with the track)
//   y 112..189  the track: four lanes at y 132/148/164/180, slanted ramps, mud, the riders
//   y 190..203  hay bales along the front
//   y 206..231  the HEAT gauge (segments; the red line at the end) and the course map
// Ramps are drawn lane by lane, back to front, each lane Skew px earlier than the one behind, so
// a ramp reads as one slanted wedge across the track (the 1984 look); the front lane shows its
// side face. Bikes are drawn with their lane, so a nearer lane's ramp hides a farther rider.
// No blinking faster than 2 Hz; fades step through palette entries.
import { PixelFont, SurfaceDraw, roundEven, d6 } from '../../sdk/index.js';
import * as Sprites from './sprites.js';
import * as Scroll from './scroll.js';
import { Skew, Lanes } from './track.js';
import { MudMetalSim, MudEvent } from './sim.js';
import { MudMetalSpec, MudMetalPalette } from './spec.js';

const PlayTop = 36, PlayBottom = 204;
const Lane0Y = 132, LaneGap = 16;
const TrackTop = 112, TrackFront = 190;

const BG = 0, NIGHT = 1, DUSK = 2, SKY = 3, MUDDK = 4, MUD = 5, TANDK = 6, TAN = 7, TANLT = 8,
      CHRDIM = 9, CHROME = 10, ORGDIM = 11, ORANGE = 12, REDDIM = 13, RED = 14, STEEL = 15;

const Crowd = [RED, CHROME, ORANGE, TANLT, SKY, CHRDIM, TAN, RED];
const Boards = ['REDLINE', 'MUD & METAL', 'TURBO OIL', '1984'];

function baseY(laneF) { return roundEven(Lane0Y + laneF * LaneGap); }
function laneOf(laneF) { const l = roundEven(laneF); return l < 0 ? 0 : l > 3 ? 3 : l; }
function frac(v) { return v - Math.floor(v); }

function clock(sec) {
    if (sec < 0) sec = 0;
    if (sec > 99.9) sec = 99.9;
    const tenths = Math.floor(sec * 10 + 1e-3);
    return String(Math.trunc(tenths / 10)).padStart(2, '0') + '.' + (tenths % 10);
}

export class MudMetalRenderer {
    constructor() {
        this.pal = MudMetalPalette;
        this.c = [];
        for (let i = 0; i < 16; i++) this.c.push(this.pal.get(i));
        this._order = [];
    }

    draw(sim, s, t) {
        const m = sim;
        s.noClip();
        s.clear(this.c[BG]);
        if (m == null) return;
        const cam = m.camX;

        s.clip(8, PlayTop, 304, PlayBottom - PlayTop);
        this._drawSky(s, cam);
        this._drawStands(s, cam);
        this._drawFence(s, cam);
        this._drawTrackBed(s, cam, m);
        this._drawBanner(s, cam, 0, 'START', ORANGE);
        this._drawBanner(s, cam, m.track.length, 'FINISH', RED);
        for (let k = 0; k < Lanes; k++) {
            this._drawMud(s, cam, m, k);
            this._drawTerrain(s, cam, m, k);
            this._drawBikes(s, cam, m, k, t);
        }
        this._drawBales(s, cam);
        this._drawPopups(s, cam, m);
        s.noClip();

        this._drawHud(s, m, t);
        this._drawOverlays(s, m, t, cam);
    }

    // ------------------------------------------------------------ backdrop
    _drawSky(s, cam) {
        const c = this.c;
        const band = (y0, y1, col) => s.rect(8, y0, 304, y1 - y0, c[col]);
        band(36, 47, NIGHT);
        s.checker(8, 47, 304, 2, c[DUSK], 0); // dither into dusk
        band(49, 60, DUSK);
        s.checker(8, 60, 304, 2, c[SKY], 0);
        band(62, 72, SKY);
        s.checker(8, 72, 304, 2, c[ORANGE], 1);
        band(74, 78, ORANGE);
        // the setting sun, barely moving
        let sx = (236 - Math.floor(cam * 0.02)) % 400;
        if (sx < -30) sx += 400;
        s.circle(sx, 76, 11, c[ORANGE], true);
        s.circle(sx, 76, 7, c[TANLT], true);
        // far hills
        for (let px = 8; px < 312; px++) {
            const lx = Scroll.layerCoord(cam, 0.12, px);
            const h = 6 + Scroll.hillHeight(lx, 12, 3);
            s.rect(px, 80 - h, 1, h + 24, c[NIGHT]);
        }
    }

    _drawStands(s, cam) {
        const c = this.c;
        const period = 104, standW = 84;
        for (let px = 8; px < 312; px++) {
            const lx = Scroll.layerCoord(cam, 0.5, px);
            const u = Scroll.wrap(lx, period);
            const block = Math.floor(lx / period);
            if (u < standW) {
                // roof, crowd, front wall
                s.setPixel(px, 78, c[CHRDIM]);
                s.rect(px, 79, 1, 2, c[STEEL]);
                s.rect(px, 81, 1, 18, c[NIGHT]);
                s.rect(px, 99, 1, 1, c[CHROME]);
                s.rect(px, 100, 1, 4, c[DUSK]);
                if (u < 2 || u >= standW - 2) s.rect(px, 81, 1, 23, c[STEEL]);
            } else if (u === standW + 9 || u === standW + 10)
                s.rect(px, 70, 1, 34, c[STEEL]);        // light tower pole
            else s.rect(px, 96, 1, 8, c[DUSK]);         // low wall between stands
            if (u >= standW + 6 && u < standW + 14) s.rect(px, 66, 1, 4, c[(u & 1) === 0 ? CHROME : TANLT]);   // the lamps
            // the crowd: heads on the stepped rows, two pixels each
            if (u >= 3 && u < standW - 3 && (u % 3) !== 2) {
                const col = Math.trunc(u / 3);
                for (let row = 0; row < 5; row++) {
                    const h = Scroll.hash(block * 97 + col, row + 11);
                    if ((h & 3) === 0) continue;
                    const y = 83 + row * 3 + ((h >>> 4) & 1);
                    s.rect(px, y, 1, 2, c[Crowd[(h >>> 8) & 7]]);
                }
            }
        }
    }

    _drawFence(s, cam) {
        const c = this.c;
        const period = 56;
        const first = Math.floor((cam + 8) / period) - 1;
        for (let i = first; i < first + 8; i++) {
            const x0 = Math.floor(i * period - cam);
            const bi = Scroll.wrap(i, 4);
            const orange = (i & 1) === 0;
            s.rect(x0, 104, period - 2, 8, c[orange ? ORANGE : CHROME]);
            s.rect(x0 + period - 2, 103, 2, 9, c[STEEL]);
            s.textCentered(Boards[bi], x0 + Math.trunc((period - 2) / 2), 106, PixelFont.Small, c[orange ? BG : RED]);
        }
    }

    _drawTrackBed(s, cam, m) {
        const c = this.c;
        s.rect(8, TrackTop, 304, 2, c[TANDK]);
        s.rect(8, TrackTop + 2, 304, TrackFront - TrackTop - 2, c[TAN]);
        // specks fixed to the dirt
        for (let px = 8; px < 312; px++) {
            const wx = Math.floor(cam) + px;
            const h = Scroll.hash(wx, 5);
            if ((h % 7) === 0) s.setPixel(px, TrackTop + 3 + ((h >>> 8) % 74), c[TANDK]);
            if ((h % 11) === 0) s.setPixel(px, TrackTop + 3 + ((h >>> 16) % 74), c[TANLT]);
            // lane dividers: dashes
            if (Scroll.wrap(wx, 20) < 10)
                for (let k = 0; k < 3; k++) s.setPixel(px, Lane0Y + 8 + k * LaneGap, c[TANDK]);
        }
        s.rect(8, TrackFront - 2, 304, 2, c[TANDK]);
        // the start line and the finish line, slanted like the ramps
        this._slantLine(s, cam, 0, false);
        this._slantLine(s, cam, m.track.length, true);
    }

    _slantLine(s, cam, xp, checker) {
        const c = this.c;
        for (let y = TrackTop + 2; y < TrackFront - 2; y++) {
            const laneF = (y - Lane0Y) / LaneGap;
            const x = Math.floor(xp - laneF * Skew - cam);
            if (!checker) { s.rect(x, y, 3, 1, c[CHROME]); continue; }
            for (let i = 0; i < 8; i++)
                s.setPixel(x + i, y, c[(((i >> 1) + (y >> 1)) % 2) === 0 ? CHROME : BG]);
        }
    }

    _drawBanner(s, cam, xp, text, col) {
        const c = this.c;
        const xb = Math.floor(xp + 1.25 * Skew - cam);    // the pole stands behind lane 0
        if (xb < -60 || xb > 380) return;
        s.rect(xb - 1, 56, 3, TrackTop + 4 - 56, c[STEEL]);
        s.rect(xb, 56, 1, TrackTop + 4 - 56, c[CHRDIM]);
        const w = PixelFont.Arcade.measure(text) + 14;
        s.rect(xb - Math.trunc(w / 2), 50, w, 15, c[col]);
        s.frame(xb - Math.trunc(w / 2), 50, w, 15, c[CHROME]);
        for (let i = 0; i < w - 2; i++) s.setPixel(xb - Math.trunc(w / 2) + 1 + i, 51 + (i & 1), c[(i & 2) === 0 ? CHROME : BG]);
        s.textCentered(text, xb, 55, PixelFont.Arcade, c[CHROME]);
    }

    // ------------------------------------------------------------ the lanes
    _drawMud(s, cam, m, k) {
        const c = this.c;
        const by = baseY(k);
        for (const p of m.track.mud) {
            if (p.lane !== k) continue;
            const wx0 = p.x0 - k * Skew, wx1 = p.x1 - k * Skew;
            const sx0 = Math.floor(wx0 - cam), sx1 = Math.floor(wx1 - cam);
            if (sx1 < 8 || sx0 > 312) continue;
            const len = Math.max(1, sx1 - sx0);
            for (let px = Math.max(8, sx0); px <= Math.min(311, sx1); px++) {
                const u = (px - sx0) / len;
                const wx = Math.floor(cam) + px;
                const h = Scroll.hash(wx, 29 + k);
                const hh = 2 + roundEven(Math.sin(u * Math.PI) * 4.0) + (h & 1);
                s.rect(px, by - hh, 1, hh * 2, c[MUD]);
                s.setPixel(px, by - hh, c[TANDK]);
                if ((h % 5) === 0) s.setPixel(px, by - hh + 2 + ((h >>> 5) % Math.max(1, hh * 2 - 3)), c[MUDDK]);
                if ((h % 13) === 0) s.setPixel(px, by - hh + 1, c[TANLT]);   // a wet glint
            }
        }
    }

    _drawTerrain(s, cam, m, k) {
        const c = this.c;
        const by = baseY(k);
        const front = k === Lanes - 1;
        for (let px = 8; px < 312; px++) {
            const xp = cam + px + k * Skew;
            const h = m.track.heightAt(xp);
            if (h < 0.5) continue;
            const hi = roundEven(h);
            const top = by - hi;
            const sl = m.track.slopeAt(xp);
            if (front) {
                // the side face of the ramp, in bands parallel to its top
                for (let y = top + 1; y <= by; y++)
                    s.setPixel(px, y, c[((y - top) & 3) < 2 ? TANDK : MUD]);
                s.setPixel(px, top, c[TANLT]);
            } else {
                const body = sl > 0.05 ? TANLT : sl < -0.05 ? TANDK : TAN;
                s.rect(px, top, 1, hi + 1, c[body]);
                s.setPixel(px, top, c[sl < -0.05 ? MUD : TANDK]);
            }
        }
    }

    _drawBikes(s, cam, m, k, t) {
        const order = this._order;
        order.length = 0;
        for (const r of m.rivals)
            if (r.active && laneOf(r.laneF) === k) order.push(r);
        const crashed = m.p === MudMetalSim.Phase.Crash || (m.p === MudMetalSim.Phase.Card && m.cardFromCrash);
        if (!crashed && laneOf(m.player.laneF) === k) order.push(m.player);
        order.sort((a, b) => a.laneF - b.laneF);
        for (const b of order) this._drawBike(s, cam, m, b, t, b === m.player);
        if (crashed && laneOf(m.crashLaneF) === k) this._drawCrash(s, cam, m, t);
    }

    _drawBike(s, cam, m, b, t, isPlayer) {
        const c = this.c;
        const px = Scroll.toScreen(b.x, cam);
        if (px < -30 || px > 350) return;
        const by = baseY(b.laneF);
        const py = by - roundEven(b.z);
        if (b.airborne) {
            const gy = by - roundEven(m.track.height(b.x, b.laneF));
            const w = Math.max(8, 18 - Math.trunc((gy - py) / 6));
            s.checker(px - Math.trunc(w / 2), gy - 1, w, 3, c[TANDK], 0);
        }
        const frame = Math.floor(b.x / 12) & 1;
        const ai = Sprites.angleIndex(b.pitch);
        const spr = isPlayer ? Sprites.Player[frame][ai] : Sprites.Rival[frame][ai];
        s.blit(spr, px - Sprites.FramePivot, py - Sprites.FramePivot, this.pal);

        if (!isPlayer) return;
        const p = b;
        const r = b.pitch * Math.PI / 180.0, co = Math.cos(r), sn = Math.sin(r);
        // the rooster tail off the back wheel
        if (!b.airborne && b.speed > 45 && p.gas && !(p.stallT > 0)) {
            for (let i = 0; i < 6; i++) {
                const age = frac(t * 2.6 + i / 6);
                const dx = px - 12 - Math.trunc(age * 24), dy = py - 2 - Math.trunc(age * 10) + Math.trunc(age * age * 8);
                const sz = age < 0.5 ? 2 : 1;
                const col = b.inMud ? (i % 2 === 0 ? MUD : MUDDK) : (i % 2 === 0 ? TANLT : TANDK);
                s.rect(dx, dy, sz, sz, c[col]);
            }
        }
        // turbo: a flame out of the silencer
        if (p.turbo && !(p.stallT > 0)) {
            const ex = px + roundEven(-12 * co + -10 * sn), ey = py + roundEven(12 * sn + -10 * co);
            s.rect(ex - 3, ey, 3, 2, c[ORANGE]);
            s.setPixel(ex - 1, ey, c[TANLT]);
        }
        // stalled: steam off the engine
        if (p.stallT > 0) {
            for (let i = 0; i < 5; i++) {
                const age = frac(t * 1.4 + i / 5);
                const sx = px - 2 + (i - 2) * 3 + Math.trunc(Math.sin((t + i) * 3.0) * 2.0);
                const sy = py - 12 - Math.trunc(age * 24);
                const sz = age < 0.6 ? 3 : 2;
                s.rect(sx, sy, sz, sz, c[age < 0.5 ? CHROME : CHRDIM]);
            }
        }
    }

    _drawCrash(s, cam, m, t) {
        const c = this.c;
        const ct = m.crashT;
        const v0 = m.crashSpeed;
        const laneF = m.crashLaneF;
        const by = baseY(laneF);
        // the bike: flips once, lands on its back and slides to a stop
        const slide = v0 * 0.16 * (1 - Math.exp(-5 * ct));
        const bx = m.crashX + slide;
        const gy = by - roundEven(m.track.height(bx, laneF));
        const wi = ct < 0.5 ? Math.trunc(ct / 0.5 * 4) & 7 : 4;   // 0,45,90,135 deg of the flip, then on its back
        const arc = ct < 0.5 ? Math.trunc(Math.sin(ct / 0.5 * Math.PI) * 10.0) : 0;
        const wx = Scroll.toScreen(bx, cam);
        s.blit(Sprites.Wreck[wi], wx - Sprites.WreckSize / 2, gy - 8 - arc - Sprites.WreckSize / 2, this.pal);
        // the rider: thrown clear in a tumble, sits up, then runs back to the bike
        const fly = Math.min(64, 18 + v0 * 0.22);
        let rx, ry;
        let ri = 0;
        if (ct < 0.8) {
            const u = ct / 0.8;
            rx = m.crashX + fly * u;
            const g = m.track.height(rx, laneF);
            ry = g + 6 + Math.sin(u * Math.PI) * 26;
            ri = Math.trunc(ct * 10) & 7;
        } else if (ct < 1.35) { rx = m.crashX + fly; ry = m.track.height(rx, laneF) + 6; }
        else {
            const u = Math.min(1, (ct - 1.35) / 0.6);
            rx = m.crashX + fly + (bx - m.crashX - fly) * u;
            ry = m.track.height(rx, laneF) + 6 + (Math.trunc(ct * 8) & 1);
        }
        const rsx = Scroll.toScreen(rx, cam), rsy = by - roundEven(ry);
        s.blit(Sprites.Rider[ri], rsx - Sprites.TumbleSize / 2, rsy - Sprites.TumbleSize / 2, this.pal);
        // the dust of the impact
        if (ct < 0.45) {
            const cx = Scroll.toScreen(m.crashX, cam), cy = by - roundEven(m.crashZ) - 4;
            const rad = 4 + Math.trunc(ct * 44);
            for (let i = 0; i < 12; i++) {
                const a = i * 0.5236;
                const dx = cx + Math.trunc(Math.cos(a) * rad), dy = cy - Math.trunc(Math.abs(Math.sin(a)) * rad * 0.6);
                s.rect(dx, dy, 2, 2, c[i % 2 === 0 ? TANLT : TAN]);
            }
        }
    }

    _drawBales(s, cam) {
        const c = this.c;
        const period = 32;
        const first = Math.floor((cam + 8) / period) - 1;
        for (let i = first; i < first + 12; i++) {
            const x0 = Math.floor(i * period - cam);
            s.rect(x0, 192, period - 2, 12, c[TAN]);
            s.rect(x0, 192, period - 2, 1, c[TANLT]);
            s.rect(x0, 197, period - 2, 1, c[TANDK]);
            s.rect(x0, 203, period - 2, 1, c[TANDK]);
            s.rect(x0 + 8, 192, 1, 12, c[ORGDIM]);
            s.rect(x0 + 21, 192, 1, 12, c[ORGDIM]);
            s.rect(x0 + period - 2, 192, 2, 12, c[MUD]);
        }
        s.rect(8, 190, 304, 2, c[MUD]);
    }

    _drawPopups(s, cam, m) {
        const c = this.c;
        for (let i = m.log.length - 1; i >= 0; i--) {
            const e = m.log[i];
            const age = m.time - e.t;
            if (age > 1.0) break;
            let text = null, col = CHROME, f = PixelFont.Display;
            if (e.kind === MudEvent.Clean) { text = '+' + e.value; col = CHROME; }
            else if (e.kind === MudEvent.Pass) { text = '+' + e.value; col = ORANGE; }
            else if (e.kind === MudEvent.Rough) { text = 'ROUGH'; col = TANLT; f = PixelFont.Arcade; }
            else if (e.kind === MudEvent.Bump) { text = 'BUMP'; col = TANLT; f = PixelFont.Arcade; }
            if (text == null) continue;
            const x = Scroll.toScreen(e.x, cam) + 4;
            const y = baseY(e.laneF) - roundEven(e.z) - 34 - Math.trunc(age * 14);
            s.textCenteredShadow(text, x, y, f, c[col], c[BG]);
        }
    }

    // ------------------------------------------------------------ HUD
    _drawHud(s, m, t) {
        const c = this.c;
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        // top band
        s.text('1UP', 10, 9, arc, c[ORANGE]);
        s.text(d6(m.score), 10, 18, dsp, c[CHROME], 2);
        s.textCentered('TIME', 164, 9, arc, c[CHRDIM]);
        const close = !m.mercyActive && m.par - m.lapTime < 5 && m.p !== MudMetalSim.Phase.Countdown;
        s.textCentered(clock(m.lapTime), 164, 18, dsp, c[close ? ORANGE : CHROME], 2);
        s.textRight('PAR', 311, 9, arc, c[CHRDIM]);
        s.textRight(clock(m.par), 311, 18, dsp, c[TANLT], 2);
        s.dottedRule(8, 312, 34, 3, c[ORGDIM]);

        // bottom band: the heat gauge
        s.dottedRule(8, 312, 205, 3, c[ORGDIM]);
        const p = m.player;
        const stalled = p.stallT > 0;
        s.text('HEAT', 10, 214, arc, c[stalled ? RED : CHRDIM]);
        const n = Math.ceil(m.heatCap - 0.001);
        const blinkOn = SurfaceDraw.blink(t, 2);
        for (let i = 0; i < n; i++) {
            const x = 40 + i * 8;
            const warn = i >= n - MudMetalSim.WarnSegments;
            const lit = p.heat > i + 0.25;
            let col;
            if (stalled) col = blinkOn ? RED : REDDIM;
            else if (warn) col = lit ? ORANGE : ORGDIM;
            else col = lit ? CHROME : STEEL;
            s.rect(x, 210, 7, 13, c[col]);
        }
        const capX = 40 + n * 8;
        s.rect(capX, 208, 3, 17, c[RED]);
        if (m.mercyActive) s.text('FREE', capX + 6, 214, arc, c[ORANGE]);

        // the course map
        const mx0 = 196, mx1 = 298, my = 223;
        s.text('COURSE', mx0, 209, arc, c[CHRDIM]);
        s.rect(mx0, my, mx1 - mx0, 1, c[STEEL]);
        for (const f of m.track.features)
            if (f.jump) s.rect(mx0 + Math.trunc(f.x0 / m.track.length * (mx1 - mx0)), my - 2, 1, 2, c[TANLT]);
        s.rect(mx1, 209, 1, 15, c[CHROME]);
        for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 8; xx++) s.setPixel(mx1 + 1 + xx, 209 + yy, c[(((xx >> 1) + (yy >> 1)) % 2) === 0 ? CHROME : BG]);
        for (const r of m.rivals)
            if (r.active && r.x > 0) {
                const rx = mx0 + Math.trunc(Math.min(1, r.x / m.track.length) * (mx1 - mx0));
                s.rect(rx - 1, my - 1, 3, 3, c[SKY]);
            }
        const pxm = mx0 + Math.trunc(m.progress * (mx1 - mx0));
        s.rect(pxm - 2, my - 3, 5, 5, c[RED]);
        s.rect(pxm - 1, my - 4, 3, 1, c[CHROME]);
    }

    // ------------------------------------------------------------ plates and cards
    _drawOverlays(s, m, t, cam) {
        const c = this.c;
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const P = m.p;
        if (P === MudMetalSim.Phase.Countdown) {
            s.textCenteredShadow(String(m.countdownLeft), 160, 42, dsp, c[CHROME], c[BG], 5);
            const q = 'QUALIFY UNDER ' + clock(m.par);
            const w = arc.measure(q) + 16;
            s.plate(160 - Math.trunc(w / 2), 82, w, 17, c[BG], c[ORANGE]);
            s.textCentered(q, 160, 87, arc, c[TANLT]);
            if (m.mercyActive) s.textCenteredShadow('FREE RIDE', 160, 214, arc, c[ORANGE], c[BG]);
            if (SurfaceDraw.blink(t, 1)) {
                const px = Scroll.toScreen(m.player.x, cam);
                s.textCenteredShadow('YOU', px, baseY(m.player.laneF) - 36, arc, c[RED], c[BG]);
            }
            return;
        }
        if (P === MudMetalSim.Phase.Race) {
            if (m.phaseTime < 0.8 && m.crashes === 0 && m.lapTime < 1)
                s.textCenteredShadow('GO!', 160, 42, dsp, c[ORANGE], c[BG], 5);
            if (m.player.stallT > 0) {
                s.textBox('OVERHEAT', 160, 48, dsp, 2, c[ORANGE], c[ORANGE], c[BG]);
                s.textCenteredShadow('ENGINE STALLED', 160, 70, arc, c[CHROME], c[BG]);
            }
            return;
        }
        if (P === MudMetalSim.Phase.Crash) {
            s.textBox('CRASH!', 160, 46, dsp, 3, c[CHROME], c[RED], c[BG]);
            const why = m.lastCrash === MudMetalSim.CrashKind.Clip ? 'CLIPPED A RIDER' : 'LAND IT LEVEL!';
            s.textCenteredShadow(why, 160, 76, arc, c[TANLT], c[BG]);
            return;
        }
        if (P === MudMetalSim.Phase.Card || P === MudMetalSim.Phase.Over) this._drawCard(s, m);
    }

    _drawCard(s, m) {
        const c = this.c;
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const spec = MudMetalSpec;
        const won = m.roundWon;
        const pt = m.p === MudMetalSim.Phase.Over ? 99 : m.phaseTime;
        if (pt < 1.3) {
            if (m.card === MudMetalSim.CardKind.Finish) s.textBox('FINISH!', 160, 46, dsp, 3, c[CHROME], c[ORANGE], c[BG]);
            else if (m.card === MudMetalSim.CardKind.TimeOver) s.textBox('TIME OVER', 160, 46, dsp, 3, c[ORANGE], c[RED], c[BG]);
            else s.textBox('ENGINE BLOWN', 160, 46, dsp, 2, c[ORANGE], c[RED], c[BG]);
            return;
        }
        const x0 = 36, y0 = 42, w = 248, h = 150;
        s.rect(x0, y0, w, h, c[BG]);
        s.frame(x0, y0, w, h, c[ORANGE]);
        s.frame(x0 + 2, y0 + 2, w - 4, h - 4, c[ORANGE]);
        s.textCentered(won ? spec.roundWonText : spec.roundLostText, 160, y0 + 10, dsp, c[won ? CHROME : ORANGE], 3);
        let y = y0 + 38;
        if (m.card === MudMetalSim.CardKind.Finish) {
            this._row(s, 'LAP TIME', clock(m.lapTime), y, CHROME, true); y += 20;
            this._row(s, 'PAR', clock(m.par), y, TANLT, true); y += 22;
            this._row(s, 'UNDER PAR', String(m.timeBonus), y, CHROME, false); y += 12;
        } else {
            const why = m.card === MudMetalSim.CardKind.TimeOver ? 'TIME OVER' : 'ENGINE BLOWN AT THE LINE';
            s.textCentered(why, 160, y, arc, c[RED]); y += 14;
            this._row(s, 'COURSE', roundEven(m.progress * 100) + '%', y, CHROME, true); y += 20;
            this._row(s, 'PAR', clock(m.par), y, TANLT, true); y += 22;
        }
        this._row(s, 'CLEAN JUMPS ' + m.cleanJumps + ' X 50', String(m.cleanJumps * MudMetalSim.PointsClean), y, CHROME, false); y += 12;
        this._row(s, 'RIDERS PASSED ' + m.passes + ' X 100', String(m.passes * MudMetalSim.PointsPass), y, CHROME, false);
        s.rect(x0 + 16, y0 + h - 30, w - 32, 1, c[ORGDIM]);
        s.text('SCORE', x0 + 16, y0 + h - 21, arc, c[ORANGE]);
        s.textRight(d6(m.score), x0 + w - 16, y0 + h - 24, dsp, c[CHROME], 2);
    }

    _row(s, label, value, y, col, big) {
        const c = this.c;
        s.text(label, 52, big ? y + 4 : y, PixelFont.Arcade, c[CHRDIM]);
        if (big) s.textRight(value, 268, y, PixelFont.Display, c[col], 2);
        else s.textRight(value, 268, y, PixelFont.Arcade, c[col]);
    }
}
