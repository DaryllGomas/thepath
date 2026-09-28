// THE NODE · world 1 · LANE JUMPER on the Cabinet Engine · THE PICTURE.
// Port of LaneJumperRenderer.cs (Staging/Batch2/lanejumper); the sprites live in sprites.js.
//
// Built for a curved tube seen from 0.8 m: every actor is chunky (the courier 16x16, cars 24x14,
// vans 28x14, trucks 46x14, the bus 54x14, turtles 16x14, logs 32-80 x 14) and the field fills
// the whole safe height.
//   - the FIELD is 13 x 14 tiles of 16 px at (8, 8): 208 x 224, touching the 8 px safe margin on
//     three sides. Top to bottom: the hedge with five yellow MAIL SLOTS, five river rows (logs,
//     turtles, drifting ripples), the grass median, six lanes of asphalt (dashed dividers, yellow
//     edge lines), the concrete kerb with its yellow kerb paint.
//   - the PANEL at x 222..311: 1UP + the score in display digits at scale 2, HI, TIME (digits and
//     a draining bar), LIVES (courier icons), HURRY (button A: ready / on / recharging), MAIL (five
//     envelopes), FREE RIDE on credit 5.
//   - a hop lifts the courier 2 px over its own shadow; a crash is a starburst, a splash is rings,
//     the mercy shield is a ring and treading water is a lifebuoy. Blinks are 1 Hz; the crash
//     tumble is 2.5 Hz (under the 3 Hz strobe floor).
import { f32, idiv, roundEven, d6, dn, PixelFont, SurfaceDraw, HighScores, Dir4 } from '../../sdk/index.js';
import { LaneJumperPalette, LaneJumperSpec } from './spec.js';
import { LaneField, ThingKind } from './field.js';
import { LaneJumperRound, DeathKind } from './round.js';
import { Courier, CourierIcon, Cars, Vans, Sports, Trucks, Bus, TurtleUp, TurtleSink, Fly, Envelope } from './sprites.js';

const FX = 8, FY = 8;                   // field origin on the tube
const PX = 222;                         // panel left
const T = LaneField.Tile;
const Phase = LaneJumperRound.Phase;

export class LaneJumperRenderer {
    constructor() {
        const pal = this.pal = LaneJumperPalette;
        this.cBg = pal.get('bg'); this.cAsDark = pal.get('asphaltDark'); this.cAs = pal.get('asphalt'); this.cAsLight = pal.get('asphaltLight');
        this.cYellow = pal.get('yellow'); this.cAmber = pal.get('amber'); this.cTeal = pal.get('teal'); this.cTealDark = pal.get('tealDark'); this.cTealLight = pal.get('tealLight');
        this.cWhite = pal.get('white'); this.cCream = pal.get('cream'); this.cGreen = pal.get('green'); this.cGreenDark = pal.get('greenDark');
        this.cBrown = pal.get('brown'); this.cBrownDark = pal.get('brownDark'); this.cRed = pal.get('red');
    }

    // ------------------------------------------------------------------ draw
    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.lanes == null) return;
        t = f32(t);

        s.clip(FX, FY, LaneField.FieldW, LaneField.FieldH);
        this._drawBackdrop(s, r, t);
        this._drawThings(s, r, t);
        this._drawCourier(s, r, t);
        s.noClip();
        this._drawPanel(s, r, t);
        this._drawOverlays(s, r, t);
    }

    _drawBackdrop(s, r, t) {
        const W = LaneField.FieldW, pal = this.pal;
        // ---- row 0: the hedge and the five mail slots
        const y0 = rowY(0);
        s.rect(FX, y0, W, T, this.cGreenDark);
        for (let x = 0; x < W; x += 8) {
            s.rect(FX + x + 1, y0 + 2 + (idiv(x, 8) % 2) * 5, 4, 3, this.cGreen);
            s.rect(FX + x + 4, y0 + 9 - (idiv(x, 8) % 2) * 4, 3, 3, this.cGreen);
        }
        s.rect(FX, y0 + T - 2, W, 2, this.cAsLight);                     // the far kerb stone
        for (let i = 0; i < LaneField.Slots; i++) {
            const cx = FX + Math.trunc(LaneField.slotX(i));
            const lit = r.filled[i];
            s.rect(cx - 11, y0, 22, T - 1, this.cYellow);                 // the slot frame: safety yellow
            s.rect(cx - 11, y0 + T - 3, 22, 2, this.cAmber);
            s.rect(cx - 9, y0 + 1, 18, T - 4, lit ? this.cCream : this.cBg);   // the mouth: dark, or lit
            if (lit) {
                s.rect(cx - 8, y0 + 2, 16, T - 6, this.cYellow);
                s.blit(Envelope, cx - 7, y0 + 2, pal);
            }
            else {
                s.rect(cx - 6, y0 + 6, 12, 2, this.cAsDark);             // the letter slit
                if (r.flySlot === i) s.blit(Fly, cx - 6, y0 + 1, pal);    // the bonus fly, worth 200
            }
        }

        // ---- rows 1-5: the river
        for (let row = 1; row <= 5; row++) {
            const y = rowY(row);
            s.rect(FX, y, W, T, this.cTeal);
            const lane = r.lanes[row];
            const off = Math.floor(f32(lane.offset * 0.5));
            for (let k = 0; k < 7; k++) {
                let rx = (k * 37 + row * 23 + off) % (W + 16);
                if (rx < 0) rx += W + 16;
                const ry = y + 3 + ((k * 5 + row) % 3) * 4;
                s.rect(FX + rx - 8, ry, 5, 1, this.cTealLight);
                s.rect(FX + rx - 6, ry + 1, 5, 1, this.cTealDark);
            }
        }
        s.rect(FX, rowY(1), W, 1, this.cTealDark);

        // ---- row 6: the median, grass between two kerb stones
        const ym = rowY(LaneField.MedianRow);
        s.rect(FX, ym, W, T, this.cGreen);
        for (let x = 0; x < W; x += 6) s.rect(FX + x + (idiv(x, 6) % 2) * 2, ym + 5 + (idiv(x, 6) % 3) * 2, 2, 2, this.cGreenDark);
        s.rect(FX, ym, W, 2, this.cAsLight);
        s.rect(FX, ym + T - 2, W, 2, this.cAsLight);

        // ---- rows 7-12: the road
        const yr = rowY(7);
        s.rect(FX, yr, W, 6 * T, this.cAs);
        s.rect(FX, yr, W, 1, this.cYellow);                               // edge lines
        s.rect(FX, yr + 6 * T - 1, W, 1, this.cYellow);
        for (let k = 1; k < 6; k++) {
            const ly = yr + k * T;
            for (let x = 2; x < W; x += 16) s.rect(FX + x, ly, 8, 1, this.cWhite);
        }

        // ---- row 13: the kerb and pavement
        const yk = rowY(LaneField.KerbRow);
        s.rect(FX, yk, W, T, this.cAsLight);
        s.rect(FX, yk, W, 2, this.cYellow);                               // painted kerb
        for (let x = 0; x < W; x += 32) s.rect(FX + x, yk + 2, 1, T - 2, this.cAs);
        s.rect(FX, yk + 9, W, 1, this.cAs);
    }

    _drawThings(s, r, t) {
        const pal = this.pal;
        for (const lane of r.lanes) {
            if (lane == null) continue;
            const y = rowY(lane.row) + 1;
            const flip = lane.speed < 0;
            for (const th of lane.things) {
                const x = FX + Math.floor(lane.left(th));
                if (x > FX + LaneField.FieldW || x + th.len < FX) continue;
                switch (th.kind) {
                    case ThingKind.Log: this._drawLog(s, x, y, th.len); break;
                    case ThingKind.Turtles: this._drawTurtles(s, r, th, x, y, flip, t); break;
                    case ThingKind.Car: s.blit(Cars[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Van: s.blit(Vans[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Sports: s.blit(Sports[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Truck: s.blit(Trucks[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Bus: s.blit(Bus, x, y, pal, 1, flip); break;
                }
            }
        }
    }

    _drawLog(s, x, y, len) {
        s.rect(x + 1, y, len - 2, 14, this.cBrownDark);
        s.rect(x, y + 1, len, 12, this.cBrownDark);
        s.rect(x + 2, y + 1, len - 4, 12, this.cBrown);
        s.rect(x + 3, y + 2, len - 6, 2, this.cAmber);                   // the sunlit top of the bark
        for (let k = 6; k < len - 6; k += 11) {
            s.rect(x + k, y + 6, 6, 1, this.cBrownDark);
            s.rect(x + k + 4, y + 9, 5, 1, this.cBrownDark);
        }
        // the cut ends
        s.rect(x + 1, y + 3, 2, 8, this.cAmber); s.rect(x + 1, y + 6, 1, 2, this.cBrownDark);
        s.rect(x + len - 3, y + 3, 2, 8, this.cAmber); s.rect(x + len - 2, y + 6, 1, 2, this.cBrownDark);
    }

    _drawTurtles(s, r, th, x, y, flip, t) {
        const st = LaneField.turtleState(th, r.worldTime, r.diveUnder);
        for (let k = 0; k < th.count; k++) {
            const tx = x + k * T;
            if (st === 0) s.blit(TurtleUp, tx, y, this.pal, 1, flip);
            else if (st === 1 || st === 3) s.blit(TurtleSink, tx, y, this.pal, 1, flip);
            else {
                // under: only the ripple ring shows where they went
                s.circle(tx + 8, y + 7, 5, this.cTealLight, false);
                s.rect(tx + 7, y + 6, 2, 2, this.cTealDark);
            }
        }
    }

    _drawCourier(s, r, t) {
        const P = r.p;
        if (P === Phase.Card || P === Phase.Over || P === Phase.AllFive || P === Phase.Delivered) return;
        if (P === Phase.Crash) { this._drawDeath(s, r); return; }
        const rowF = r.courierRowF;
        const cx = FX + roundEven(r.courierX);
        const cy = FY + roundEven(f32(rowF * T)) + idiv(T, 2);
        let lift = 0;
        if (r.hopping) {
            const f = r.hopFrac;
            lift = roundEven(Math.sin(f * Math.PI) * 3);
            s.checker(cx - 6, cy - 5 + 2, 12, 12, this.cBg, 0);           // the shadow on the ground
        }
        if (r.floating) {
            s.circle(cx, cy, 8, this.cWhite, false); s.circle(cx, cy, 7, this.cRed, false);
            s.rect(cx - 8, cy - 1, 2, 2, this.cWhite); s.rect(cx + 7, cy - 1, 2, 2, this.cWhite);
        }
        const spr = Courier[r.facing < 0 ? 0 : r.facing & 3];
        s.blit(spr, cx - 9, cy - 9 - lift, this.pal);
        if (r.shieldTime > 0) { s.circle(cx, cy - lift, 10, this.cTealLight, false); s.circle(cx, cy - lift, 11, this.cWhite, false); }
        if (r.bumpTime > 0) {
            // the thunk against the wall
            s.rect(cx - 6, cy - 12, 2, 2, this.cWhite); s.rect(cx + 5, cy - 12, 2, 2, this.cWhite); s.rect(cx - 1, cy - 14, 2, 2, this.cWhite);
        }
    }

    _drawDeath(s, r) {
        const pt = r.phaseTime;
        const cx = FX + roundEven(r.deathX);
        const cy = FY + r.deathRow * T + idiv(T, 2);
        switch (r.death) {
            case DeathKind.Crash: {
                const rad = 5 + Math.trunc(f32(Math.min(pt, f32(0.5)) * 30));
                for (let k = 0; k < 16; k++) {
                    const a = k * 0.3927 + 0.2;                                     // double, as in C#
                    const m = Math.trunc(rad * (0.6 + (k % 3) * 0.2));
                    const bx = cx + Math.trunc(Math.cos(a) * m), by = cy + Math.trunc(Math.sin(a) * m * 0.7);
                    s.rect(bx - 2, by - 2, 4, 4, k % 3 === 0 ? this.cWhite : k % 3 === 1 ? this.cYellow : this.cRed);
                }
                // the bike tumbles: a quarter turn every 0.4 s (2.5 Hz steps)
                const q = Math.trunc(f32(pt / f32(0.4))) & 3;
                s.blit(Courier[q], cx - 9, cy - 9, this.pal);
                if (pt < f32(0.15)) { s.circle(cx, cy, 9, this.cWhite, false); s.circle(cx, cy, 10, this.cYellow, false); }
                break;
            }
            case DeathKind.Splash:
            case DeathKind.Swept: {
                for (let k = 0; k < 3; k++) {
                    const rr = f32(f32(pt - f32(k * f32(0.25))) * 18);
                    if (rr < 1 || rr > 16) continue;
                    s.circle(cx, cy, Math.trunc(rr), k === 0 ? this.cWhite : this.cTealLight, false);
                }
                if (pt < f32(0.5)) {
                    s.blit(Courier[Dir4.Up], cx - 9, cy - 9 + Math.trunc(f32(pt * 12)), this.pal);
                    s.rect(cx - 4, cy - 12 - Math.trunc(f32(pt * 10)), 2, 3, this.cWhite); s.rect(cx + 3, cy - 13 - Math.trunc(f32(pt * 8)), 2, 3, this.cWhite);
                }
                break;
            }
            default: {
                // TIME UP: the courier sits there, the clock face over him
                s.blit(Courier[Dir4.Down], cx - 9, cy - 9, this.pal);
                s.circle(cx, cy - 14, 6, this.cWhite, true);
                s.circle(cx, cy - 14, 6, this.cRed, false);
                s.line(cx, cy - 14, cx, cy - 18, this.cBg); s.line(cx, cy - 14, cx + 3, cy - 14, this.cBg);
                break;
            }
        }
    }

    // ------------------------------------------------------------------ the panel
    _drawPanel(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const x = PX, right = 311;
        s.rect(218, FY, 1, LaneField.FieldH, this.cAs);

        s.text('1UP', x, 9, arc, this.cYellow);
        s.textRight('REDLINE', right, 9, PixelFont.Small, this.cAsLight);
        const sc = r.score < 100000 ? dn(r.score, 5) : String(r.score);
        s.text(sc, x + 2, 20, dsp, this.cCream, 2);
        const hi = Math.max(r.score, HighScores.for(LaneJumperSpec.id, LaneJumperSpec).top);
        s.text('HI', x, 41, arc, this.cYellow);
        s.text(dn(hi, 5), x + 16, 40, dsp, this.cWhite);
        s.dottedRule(x, right, 53, 3, this.cAs);

        // TIME
        const secs = Math.ceil(Math.max(0, r.courierTimer));
        const low = secs <= 10 && r.p === Phase.Crossing;
        s.text('TIME', x, 62, arc, this.cYellow);
        s.textRight(dn(secs, 2), right, 58, dsp, low ? this.cRed : this.cCream, 2);
        s.frame(x, 77, 90, 8, this.cAsLight);
        const bw = roundEven(f32(f32(86 * Math.max(0, r.courierTimer)) / Math.max(1, r.courierTimeMax)));
        s.rect(x + 2, 79, bw, 4, low ? this.cRed : this.cYellow);
        s.dottedRule(x, right, 91, 3, this.cAs);

        // LIVES
        s.text('LIVES', x, 97, arc, this.cYellow);
        for (let i = 0; i < r.livesMax; i++) {
            const ix = x + i * 20;
            if (i < r.livesLeft) s.blit(CourierIcon, ix, 108, this.pal);
            else s.frame(ix + 2, 110, 12, 12, this.cAsDark);
        }
        s.dottedRule(x, right, 129, 3, this.cAs);

        // HURRY (button A)
        s.rect(x - 1, 134, 7, 9, this.cYellow); s.text('A', x, 135, arc, this.cBg);
        s.text('HURRY', x + 10, 135, arc, this.cYellow);
        s.frame(x, 146, 90, 8, this.cAsLight);
        let hs, hc;
        if (r.hurryLeft > 0) {
            s.rect(x + 2, 148, roundEven(f32(f32(86 * r.hurryLeft) / r.hurrySeconds)), 4, this.cTealLight);
            hs = 'GO GO GO'; hc = this.cTealLight;
        }
        else if (r.hurryCool > 0) {
            s.rect(x + 2, 148, roundEven(f32(86 * f32(1 - f32(r.hurryCool / r.hurryCooldown)))), 4, this.cAs);
            hs = 'CHARGING'; hc = this.cAsLight;
        }
        else { s.rect(x + 2, 148, 86, 4, this.cYellow); hs = 'READY'; hc = this.cYellow; }
        s.text(hs, x, 158, arc, hc);
        s.dottedRule(x, right, 169, 3, this.cAs);

        // MAIL
        s.text('MAIL', x, 175, arc, this.cYellow);
        s.textRight(r.slotsFilled + '/5', right, 175, arc, this.cCream);
        for (let i = 0; i < LaneField.Slots; i++) {
            const ex = x + i * 18;
            if (r.filled[i]) s.blit(Envelope, ex, 187, this.pal);
            else { s.frame(ex, 187, 14, 10, this.cAs); s.line(ex + 1, 188, ex + 6, 192, this.cAs); s.line(ex + 12, 188, ex + 7, 192, this.cAs); }
        }
        s.dottedRule(x, right, 203, 3, this.cAs);

        if (r.invulnerable) s.text('FREE RIDE', x, 210, arc, this.cGreen);
        else s.text('COURIER ' + Math.min(9, r.courierNumber), x, 210, arc, this.cAsLight);
        s.text('© 1982 REDLINE', x, 222, PixelFont.Small, this.cAs);
    }

    // ------------------------------------------------------------------ plates and cards
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mx = FX + idiv(LaneField.FieldW, 2);
        const P = r.p;
        if (P === Phase.Ready) {
            s.textBox('GET READY', mx, 96, dsp, 2, this.cYellow, this.cYellow, this.cBg);
            const first = r.courierNumber <= 1;
            const sub = first ? 'FILL ALL 5 SLOTS' : 'COURIER ' + r.courierNumber;
            s.plate(mx - 56, 120, 112, 15, this.cBg, this.cAs);
            s.textCentered(sub, mx, 124, arc, this.cCream);
            if (r.invulnerable) { s.plate(mx - 36, 140, 72, 15, this.cBg, this.cGreen); s.textCentered('FREE RIDE', mx, 144, arc, this.cGreen); }
            if (SurfaceDraw.blink(t)) s.textCenteredShadow('YOU', FX + Math.trunc(r.courierX), FY + LaneField.KerbRow * T - 11, arc, this.cYellow, this.cBg);
        }
        else if (P === Phase.Delivered || P === Phase.AllFive) {
            if (r.lastSlot >= 0) {
                const sx = FX + Math.trunc(LaneField.slotX(r.lastSlot));
                const py = FY + T + 4 - Math.trunc(f32(Math.min(f32(0.6), r.phaseTime) * 6));
                const pts = '+' + r.lastPoints;
                const w = dsp.measure(pts);
                const px = Math.max(FX + 2, Math.min(FX + LaneField.FieldW - w - 2, sx - idiv(w, 2)));
                s.rect(px - 2, py - 2, w + 4, 11, this.cBg);
                s.text(pts, px, py, dsp, r.flyWasHere[r.lastSlot] ? this.cTealLight : this.cYellow);
            }
            if (P === Phase.AllFive) {
                s.textBox('ALL FIVE!', mx, 88, dsp, 2, this.cYellow, this.cYellow, this.cBg);
                s.plate(mx - 64, 112, 128, 15, this.cBg, this.cAs);
                s.textCentered('MAIL DELIVERED', mx, 116, arc, this.cCream);
            }
            else s.textCenteredShadow('DELIVERED', mx, FY + 6 * T + 4, dsp, this.cYellow, this.cBg);
        }
        else if (P === Phase.Crash && r.phaseTime > f32(0.25)) {
            const w = r.death === DeathKind.Crash ? 'CRASH!' : r.death === DeathKind.Splash ? 'SPLASH!' : r.death === DeathKind.Swept ? 'SWEPT!' : 'TIME UP';
            const col = r.death === DeathKind.Crash ? this.cRed : r.death === DeathKind.TimeUp ? this.cYellow : this.cTealLight;
            const py = r.deathRow >= 7 ? 72 : 150;
            s.textBox(w, mx, py, dsp, 2, col, col, this.cBg);
            const left = r.livesLeft === 1 ? '1 COURIER LEFT' : r.livesLeft <= 0 ? 'NO COURIERS LEFT' : r.livesLeft + ' COURIERS LEFT';
            s.plate(mx - 58, py + 24, 116, 15, this.cBg, this.cAs);
            s.textCentered(left, mx, py + 28, arc, this.cCream);
        }
        else if (P === Phase.Card || P === Phase.Over) {
            const spec = LaneJumperSpec;
            const won = r.roundWon;
            // one band across the whole tube, so the card never fights the panel
            s.plate(16, 58, 288, 108, this.cBg, this.cYellow);
            s.frame(18, 60, 284, 104, this.cAmber);
            s.textCentered(won ? spec.roundWonText : spec.roundLostText, 160, 72, dsp, won ? this.cYellow : this.cRed, 3);
            s.dottedRule(40, 280, 101, 3, this.cAs);
            s.textCentered('SCORE ' + d6(r.score), 160, 112, arc, this.cCream, 2);
            s.textCentered(r.slotsFilled + '/5 DELIVERED', 160, 140, arc, won ? this.cYellow : this.cAsLight, 2);
        }
    }
}

function rowY(row) { return FY + row * T; }

LaneJumperRenderer.FX = FX;
LaneJumperRenderer.FY = FY;
LaneJumperRenderer.PX = PX;
