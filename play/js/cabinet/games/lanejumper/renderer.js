// THE NODE · world 1 · LANE JUMPER on the Cabinet Engine · THE PICTURE.
// Grown from the port of LaneJumperRenderer.cs (Staging/Batch2/lanejumper); the sprites live in sprites.js.
//
// Built for a curved tube seen from 0.8 m: every actor is chunky (the courier 16x16, cars 24x14, vans 28x14,
// trucks 46x14, the bus 54x14, motorbikes 16x12, the train 176x14, turtles 16x14, logs 32-96 x 14, the
// mudjaw and the ferry 80x14) and the field fills the whole safe height.
//   - the FIELD is 13 x 14 tiles of 16 px at (8, 8): 208 x 224, touching the 8 px safe margin on three sides.
//     Top to bottom: the hedge with five yellow MAIL SLOTS, five river rows, the grass median, six road rows
//     (dashed dividers, yellow edge lines; a railway track on the railway stages), the concrete kerb.
//   - each stage has a THEME: day; storm (THE RIVER RISES: whitecaps and rain); night (NIGHT RUN: the road is
//     dark but for the street lamps, the headlights and the courier's own lamp, the river moonlit); gala
//     (DELIVERY DAY: bunting on the hedge).
//   - telegraphs: the weaver's blinker, the train bell (the rails flash and chevrons point the way it comes),
//     the mudjaw's burning eyes, the dog's crouch and its '!', a slot flap blinking before it shuts.
//   - the PANEL at x 222..311: 1UP + the score in display digits at scale 2, HI, TIME (digits and a draining
//     bar), LIVES (courier icons), HURRY (button A: ready / on / recharging), MAIL (five envelopes), STAGE.
//   - juice: a hop lifts the courier 3 px over his shadow and lands in dust; a crash is a starburst and debris
//     with a jolt of the field, a splash is rings and spray; points rise from the slots; envelopes flutter.
//     Blinks are 1-2 Hz; the crash tumble is 2.5 Hz (under the 3 Hz strobe floor). The shake moves the field
//     inside its own clip, so the 8 px margin stays black.
import { f32, idiv, roundEven, d6, dn, PixelFont, SurfaceDraw, HighScores, Dir4 } from '../../sdk/index.js';
import { LaneJumperPalette, LaneJumperSpec } from './spec.js';
import { LaneField, ThingKind } from './field.js';
import { STAGES } from './stages.js';
import { LaneJumperRound, DeathKind } from './round.js';
import {
    Courier, CourierIcon, Cars, Vans, Sports, Trucks, Bus, Motos, Train, Ferry, Beast, Snake, Dog, WeaverCar,
    TurtleUp, TurtleSink, Stamp, Parcel, Envelope,
} from './sprites.js';

const FX = 8, FY = 8;                   // field origin on the tube
const PX = 222;                         // panel left
const T = LaneField.Tile;
const FW = LaneField.FieldW, FH = LaneField.FieldH;
const Phase = LaneJumperRound.Phase;
const DeathWords = ['', 'CRASH!', 'SPLASH!', 'SWEPT!', 'TIME UP', 'BITTEN!', 'SNAPPED!', 'TRAIN!'];
const _wb = { row: 0, other: -1, signal: false, frac: 0 };

export class LaneJumperRenderer {
    constructor() {
        const pal = this.pal = LaneJumperPalette;
        this.cBg = pal.get('bg'); this.cAsDark = pal.get('asphaltDark'); this.cAs = pal.get('asphalt'); this.cAsLight = pal.get('asphaltLight');
        this.cYellow = pal.get('yellow'); this.cAmber = pal.get('amber'); this.cTeal = pal.get('teal'); this.cTealDark = pal.get('tealDark'); this.cTealLight = pal.get('tealLight');
        this.cWhite = pal.get('white'); this.cCream = pal.get('cream'); this.cGreen = pal.get('green'); this.cGreenDark = pal.get('greenDark');
        this.cBrown = pal.get('brown'); this.cBrownDark = pal.get('brownDark'); this.cRed = pal.get('red');
        this.cNight = pal.get('night'); this.cNavy = pal.get('navy'); this.cOrange = pal.get('orange'); this.cMaroon = pal.get('maroon');
        this.ox = FX; this.oy = FY;
    }

    // ------------------------------------------------------------------ draw
    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.lanes == null) return;
        t = f32(t);

        // the shake jogs the field's contents inside the field's own clip
        let dx = 0, dy = 0;
        if (r.shake > 0) {
            const a = Math.min(2, Math.ceil(r.shake * 6));
            dx = roundEven(Math.sin(t * 61) * a); dy = roundEven(Math.cos(t * 47) * a * 0.5);
        }
        this.ox = FX + dx; this.oy = FY + dy;
        this.night = r.theme === 'night';

        s.clip(FX, FY, FW, FH);
        this._drawBackdrop(s, r, t);
        if (this.night) this._drawLights(s, r, t);
        this._drawThings(s, r, t);
        this._drawSpecials(s, r, t);
        if (r.theme === 'storm') this._drawRain(s, t);
        this._drawCourier(s, r, t);
        this._drawFx(s, r, t);
        s.noClip();
        this._drawPanel(s, r, t);
        this._drawOverlays(s, r, t);
    }

    ry(row) { return this.oy + row * T; }

    _drawBackdrop(s, r, t) {
        const W = FW, ox = this.ox, theme = r.theme, night = this.night;
        const L = ox - 4, LW = W + 8;           // wide fills, so a shaken field never shows a seam
        // ---- row 0: the hedge and the five mail slots
        const y0 = this.ry(0);
        s.rect(L, y0 - 4, LW, T + 4, night ? this.cBg : this.cGreenDark);
        const leaf = night ? this.cGreenDark : this.cGreen;
        for (let x = 0; x < W; x += 8) {
            s.rect(ox + x + 1, y0 + 2 + (idiv(x, 8) % 2) * 5, 4, 3, leaf);
            s.rect(ox + x + 4, y0 + 9 - (idiv(x, 8) % 2) * 4, 3, 3, leaf);
        }
        s.rect(L, y0 + T - 2, LW, 2, night ? this.cAs : this.cAsLight);   // the far kerb stone
        if (theme === 'gala') {
            // DELIVERY DAY: bunting along the hedge
            s.rect(L, y0, LW, 1, this.cAsLight);
            const cols = [this.cRed, this.cYellow, this.cTealLight, this.cWhite];
            for (let x = 0, k = 0; x < W; x += 6, k++) { s.rect(ox + x, y0 + 1, 4, 2, cols[k & 3]); s.rect(ox + x + 1, y0 + 3, 2, 1, cols[k & 3]); }
        }
        for (let i = 0; i < LaneField.Slots; i++) {
            const cx = ox + Math.trunc(LaneField.slotX(i));
            const lit = r.filled[i];
            const fl = r.flaps[i];
            s.rect(cx - 11, y0, 22, T - 1, this.cYellow);                 // the slot frame: safety yellow
            s.rect(cx - 11, y0 + T - 3, 22, 2, this.cAmber);
            s.rect(cx - 9, y0 + 1, 18, T - 4, lit ? this.cCream : this.cBg);   // the mouth: dark, or lit
            if (lit) {
                s.rect(cx - 8, y0 + 2, 16, T - 6, this.cYellow);
                s.blit(Envelope, cx - 7, y0 + 2, this.pal);
            }
            else if (fl.s === 2 || (fl.s === 1 && SurfaceDraw.blink(t, 2))) {
                // a flap, shut (or blinking: about to shut): red with a white bar, no entry
                s.rect(cx - 9, y0 + 1, 18, T - 4, fl.s === 2 ? this.cRed : this.cOrange);
                s.rect(cx - 6, y0 + 5, 12, 3, this.cWhite);
            }
            else {
                s.rect(cx - 6, y0 + 6, 12, 2, this.cAsDark);             // the letter slit
                if (r.stampSlot === i) s.blit(Stamp, cx - 6, y0 + 1, this.pal);    // the bonus stamp, worth 200
            }
        }

        // ---- rows 1-5: the river
        const water = night ? this.cNavy : this.cTeal;
        const rip1 = night ? this.cTealDark : this.cTealLight, rip2 = night ? this.cBg : this.cTealDark;
        const ripples = theme === 'storm' ? 11 : 7;
        for (let row = 1; row <= 5; row++) {
            const y = this.ry(row);
            s.rect(L, y, LW, T, water);
            const lane = r.lanes[row];
            const off = lane.shuttle != null ? Math.floor(f32(t * 6)) * (row & 1 ? 1 : -1) : Math.floor(f32(lane.offset * 0.5));
            for (let k = 0; k < ripples; k++) {
                let rx = (k * 37 + row * 23 + off) % (W + 16);
                if (rx < 0) rx += W + 16;
                const ry = y + 3 + ((k * 5 + row) % 3) * 4;
                s.rect(ox + rx - 8, ry, 5, 1, k >= 7 ? this.cWhite : rip1);
                s.rect(ox + rx - 6, ry + 1, 5, 1, rip2);
            }
            if (night) {
                // the moon's path on the water, wobbling
                const mx = ox + 150 + ((row * 3 + Math.floor(f32(t * 2))) % 5) - 2;
                s.rect(mx, y + 4 + (row & 1) * 5, 6 - (row & 1) * 2, 1, this.cCream);
                s.rect(mx + 2, y + 9 - (row & 1) * 4, 3, 1, this.cWhite);
            }
        }
        s.rect(L, this.ry(1), LW, 1, night ? this.cBg : this.cTealDark);

        // ---- row 6: the median, grass between two kerb stones
        const ym = this.ry(LaneField.MedianRow);
        s.rect(L, ym, LW, T, night ? this.cGreenDark : this.cGreen);
        const tuft = night ? this.cBg : this.cGreenDark;
        for (let x = 0; x < W; x += 6) s.rect(ox + x + (idiv(x, 6) % 2) * 2, ym + 5 + (idiv(x, 6) % 3) * 2, 2, 2, tuft);
        s.rect(L, ym, LW, 2, night ? this.cAs : this.cAsLight);
        s.rect(L, ym + T - 2, LW, 2, night ? this.cAs : this.cAsLight);

        // ---- rows 7-12: the road (and any track)
        const yr = this.ry(7);
        s.rect(L, yr, LW, 6 * T, night ? this.cNight : this.cAs);
        s.rect(L, yr, LW, 1, night ? this.cAmber : this.cYellow);         // edge lines
        s.rect(L, yr + 6 * T - 1, LW, 1, night ? this.cAmber : this.cYellow);
        const dash = night ? this.cAsDark : this.cWhite;
        for (let k = 1; k < 6; k++) {
            const a = r.lanes[6 + k], b = r.lanes[7 + k];
            if ((a != null && a.rail) || (b != null && b.rail)) continue;
            const ly = yr + k * T;
            const same = a != null && b != null && a.dir === b.dir;
            for (let x = 2; x < W; x += 16) s.rect(ox + x, ly, same ? 12 : 8, 1, dash);
        }
        for (let row = 7; row <= 12; row++) {
            const lane = r.lanes[row];
            if (lane != null && lane.rail) this._drawTrack(s, r, lane, t);
        }

        // ---- row 13: the kerb and pavement
        const yk = this.ry(LaneField.KerbRow);
        s.rect(L, yk, LW, T + 4, night ? this.cAsDark : this.cAsLight);
        s.rect(L, yk, LW, 2, night ? this.cAmber : this.cYellow);         // painted kerb
        for (let x = 0; x < W; x += 32) s.rect(ox + x, yk + 2, 1, T - 2, night ? this.cBg : this.cAs);
        s.rect(L, yk + 9, LW, 1, night ? this.cBg : this.cAs);
    }

    // a railway track: ballast, sleepers, two rails; while the bell rings the rails flash and chevrons at the
    // edge it comes from point the way (2 Hz, under the strobe floor)
    _drawTrack(s, r, lane, t) {
        const y = this.ry(lane.row), ox = this.ox;
        s.rect(ox - 4, y, FW + 8, T, this.night ? this.cBg : this.cAsDark);
        for (let x = 2; x < FW; x += 8) s.rect(ox + x, y + 1, 3, T - 2, this.night ? this.cAsDark : this.cBrownDark);
        const ring = r.bellOn[lane.row], ph = SurfaceDraw.blink(t, 2);
        const rail = ring ? (ph ? this.cRed : this.cOrange) : this.cAsLight;
        s.rect(ox - 4, y + 3, FW + 8, 1, rail);
        s.rect(ox - 4, y + 12, FW + 8, 1, rail);
        if (ring && r.trainEta[lane.row] > 0) {
            // chevrons at the edge the train will come from, pointing the way it runs
            const right = lane.speed > 0;
            for (let k = 0; k < 3; k++) {
                const cx = right ? ox + 6 + k * 9 : ox + FW - 7 - k * 9;
                const c = (k + (ph ? 1 : 0)) & 1 ? this.cYellow : this.cRed;
                for (let j = 0; j < 4; j++) {
                    const dxj = right ? j : -j;
                    s.rect(cx + dxj, y + 4 + j, 2, 1, c);
                    s.rect(cx + dxj, y + 11 - j, 2, 1, c);
                }
            }
        }
    }

    // NIGHT RUN: the street lamps' pools, the headlights, the courier's own lamp (dithered light on the dark road)
    _drawLights(s, r, t) {
        const ox = this.ox;
        // the lamps: posts on the median and the kerb, a pool each on the road beside them
        for (const lx of [36, 104, 172]) this._pool(s, ox + lx, this.ry(7), 44, this.cAs);
        for (const lx of [70, 138]) this._pool(s, ox + lx, this.ry(12), 44, this.cAs);
        for (let row = 7; row <= 12; row++) {
            const lane = r.lanes[row];
            if (lane == null) continue;
            const y = this.ry(row);
            for (const th of lane.things) {
                const x = ox + Math.floor(lane.left(th));
                if (x > ox + FW + 30 || x + th.len < ox - 30) continue;
                this._beam(s, lane.speed > 0 ? x + th.len : x - 1, y, lane.speed > 0 ? 1 : -1, th.kind === ThingKind.Train ? 40 : th.kind === ThingKind.Moto ? 20 : 28);
            }
        }
        const w = r.weaver;
        if (w != null) {
            const b = w.beat(r.worldTime, _wb), x = ox + Math.floor(w.left());
            const y = roundEven(this.ry(b.row) + (b.other >= 0 ? (b.other - b.row) * T * b.frac : 0));
            this._beam(s, w.dir > 0 ? x + w.len : x - 1, y, w.dir, 28);
        }
    }

    _pool(s, cx, y, w, c) {
        for (let j = 0; j < T; j++) {
            const half = idiv(w, 2) - Math.abs(j - 8);
            s.checker(cx - half, y + j, half * 2, 1, c, 0);
        }
    }

    // a headlight beam: a widening dithered fan from the lamps, brightest at the car
    _beam(s, x0, y, dir, len) {
        for (let d = 0; d < len; d++) {
            const h = Math.min(12, 6 + (d >> 2));
            const x = x0 + d * dir;
            s.checker(x, y + 8 - (h >> 1), 1, h, d < 8 ? this.cCream : this.cAs, d & 1);
        }
    }

    _drawRain(s, t) {
        const ox = this.ox, oy = this.oy;
        for (let k = 0; k < 28; k++) {
            const x = ((k * 53 + Math.floor(f32(t * 70))) % (FW + 20)) - 10;
            const y = (k * 41 + Math.floor(f32(t * 190))) % (FH + 10) - 5;
            s.rect(ox + x, oy + y, 1, 2, this.cAsLight);
            s.setPixel(ox + x - 1, oy + y + 2, this.cAsLight);
        }
    }

    _drawThings(s, r, t) {
        const pal = this.pal, ox = this.ox;
        for (const lane of r.lanes) {
            if (lane == null || lane.makes === ThingKind.Snake) continue;
            const y = this.ry(lane.row) + 1;
            const flip = lane.dir < 0;
            for (const th of lane.things) {
                const x = ox + Math.floor(lane.left(th));
                if (x > ox + FW || x + th.len < ox) continue;
                switch (th.kind) {
                    case ThingKind.Log: this._drawLog(s, x, y, th.len); break;
                    case ThingKind.Turtles: this._drawTurtles(s, r, th, x, y, flip, t); break;
                    case ThingKind.Beast: s.blit(Beast[LaneField.jawState(th, r.worldTime)], x, y, pal, 1, flip); break;
                    case ThingKind.Ferry: s.blit(Ferry, x, y, pal, 1, flip); break;
                    case ThingKind.Car: s.blit(Cars[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Van: s.blit(Vans[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Sports: s.blit(Sports[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Truck: s.blit(Trucks[th.variant & 3], x, y, pal, 1, flip); break;
                    case ThingKind.Bus: s.blit(Bus, x, y, pal, 1, flip); break;
                    case ThingKind.Moto: s.blit(Motos[th.variant & 3], x, y + 1, pal, 1, flip); break;
                    case ThingKind.Train: s.blit(Train, x, y, pal, 1, flip); break;
                }
            }
        }
        // the parcel riding its log
        const pc = r.parcel;
        if (pc.s === 1 && pc.th != null) {
            const lane = r.lanes[pc.row];
            const bob = (Math.floor(f32(r.worldTime * 2)) & 1);
            s.blit(Parcel, ox + Math.floor(f32(lane.left(pc.th) + pc.off)), this.ry(pc.row) + 3 - bob, pal);
            if (pc.t < f32(0.6)) s.circle(ox + Math.floor(f32(lane.left(pc.th) + pc.off)) + 6, this.ry(pc.row) + 8, 4 + Math.trunc(f32(pc.t * 14)), this.cCream, false);
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

    // the snake, the dog, the weaver
    _drawSpecials(s, r, t) {
        const pal = this.pal, ox = this.ox;
        const sn = r.lanes[LaneField.MedianRow];
        if (sn != null) {
            const th = sn.things[0];
            const x = ox + Math.floor(sn.left(th));
            s.blit(Snake[Math.floor(f32(sn.left(th) / 5)) & 1], x, this.ry(6) + 3, pal, 1, sn.dir < 0);
        }
        const g = r.dog;
        if (g != null) {
            const x = ox + roundEven(g.x), y = this.ry(6) + 2;
            const fr = g.mode === 1 ? 2 : Math.floor(f32(g.x / (g.mode === 2 ? 4 : 6))) & 1;
            s.blit(Dog[fr], x - 10, y, pal, 1, g.face < 0);
            if (g.mode === 1) { s.rect(x - 2, y - 10, 4, 6, this.cBg); s.rect(x - 1, y - 9, 2, 3, this.cRed); s.rect(x - 1, y - 5, 2, 1, this.cRed); }
        }
        const w = r.weaver;
        if (w != null) {
            const b = w.beat(r.worldTime, _wb);
            const x = ox + Math.floor(w.left());
            if (x < ox + FW && x + w.len > ox) {
                const y = roundEven(this.ry(b.row) + 1 + (b.other >= 0 ? (b.other - b.row) * T * b.frac : 0));
                s.blit(WeaverCar, x, y, pal, 1, w.dir < 0);
                // the blinker: on the side of the lane it is going to, front and back, at 2 Hz
                const next = b.other >= 0 ? b.other : w.rows[0] === b.row ? w.rows[1] : w.rows[0];
                if ((b.signal || b.other >= 0) && SurfaceDraw.blink(t, 2)) {
                    const by = next > b.row ? y + 12 : y;
                    s.rect(x, by, 3, 2, this.cOrange); s.rect(x + w.len - 3, by, 3, 2, this.cOrange);
                    s.rect(x + (w.dir > 0 ? w.len : -3), by, 3, 2, this.cYellow);
                }
            }
        }
    }

    _drawCourier(s, r, t) {
        const P = r.p;
        if (P === Phase.Final || P === Phase.Over || P === Phase.Clear || P === Phase.Delivered || P === Phase.Tally) return;
        if (P === Phase.Crash) { this._drawDeath(s, r); return; }
        const rowF = r.courierRowF;
        const cx = this.ox + roundEven(r.courierX);
        const cy = this.oy + roundEven(f32(rowF * T)) + idiv(T, 2);
        let lift = 0;
        if (r.hopping) {
            const f = r.hopFrac;
            lift = roundEven(Math.sin(f * Math.PI) * 3);
            s.checker(cx - 6, cy - 5 + 2, 12, 12, this.cBg, 0);           // the shadow on the ground
        }
        if (this.night) {
            // his own lamp, a short fan the way he faces
            const d = r.facing;
            if (d === Dir4.Up || d === Dir4.Down) for (let k = 0; k < 14; k++) s.checker(cx - 3 - (k >> 2), cy + (d === Dir4.Up ? -10 - k : 9 + k), 6 + (k >> 1), 1, this.cCream, k & 1);
            else for (let k = 0; k < 14; k++) s.checker(cx + (d === Dir4.Right ? 10 + k : -10 - k), cy - 3 - (k >> 2), 1, 6 + (k >> 1), this.cCream, k & 1);
        }
        if (r.floating) {
            s.circle(cx, cy, 8, this.cWhite, false); s.circle(cx, cy, 7, this.cRed, false);
            s.rect(cx - 8, cy - 1, 2, 2, this.cWhite); s.rect(cx + 7, cy - 1, 2, 2, this.cWhite);
        }
        const spr = Courier[r.facing < 0 ? 0 : r.facing & 3];
        s.blit(spr, cx - 9, cy - 9 - lift, this.pal);
        if (r.carrying) {
            // the parcel on the rack, behind him
            const d = r.facing, bx = cx - 3 - Dir4.dx(d) * 8, by = cy - 3 - lift - Dir4.dy(d) * 8;
            s.rect(bx - 1, by - 1, 8, 8, this.cBg); s.rect(bx, by, 6, 6, this.cBrown); s.rect(bx + 2, by, 2, 6, this.cCream); s.rect(bx, by + 2, 6, 2, this.cCream);
        }
        if (r.shieldTime > 0) { s.circle(cx, cy - lift, 10, this.cTealLight, false); s.circle(cx, cy - lift, 11, this.cWhite, false); }
        if (r.bumpTime > 0) {
            // the thunk against the wall
            s.rect(cx - 6, cy - 12, 2, 2, this.cWhite); s.rect(cx + 5, cy - 12, 2, 2, this.cWhite); s.rect(cx - 1, cy - 14, 2, 2, this.cWhite);
        }
    }

    _drawDeath(s, r) {
        const pt = r.phaseTime;
        const cx = this.ox + roundEven(r.deathX);
        const cy = this.oy + r.deathRow * T + idiv(T, 2);
        switch (r.death) {
            case DeathKind.Crash:
            case DeathKind.Train: {
                const big = r.death === DeathKind.Train ? 1.5 : 1;
                const rad = 5 + Math.trunc(f32(Math.min(pt, f32(0.5)) * 30 * big));
                for (let k = 0; k < 16; k++) {
                    const a = k * 0.3927 + 0.2;
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
            case DeathKind.Swept:
            case DeathKind.Snapped: {
                for (let k = 0; k < 3; k++) {
                    const rr = f32(f32(pt - f32(k * f32(0.25))) * 18);
                    if (rr < 1 || rr > 16) continue;
                    s.circle(cx, cy, Math.trunc(rr), k === 0 ? this.cWhite : this.cTealLight, false);
                }
                if (pt < f32(0.5)) {
                    s.blit(Courier[Dir4.Up], cx - 9, cy - 9 + Math.trunc(f32(pt * 12)), this.pal);
                    s.rect(cx - 4, cy - 12 - Math.trunc(f32(pt * 10)), 2, 3, this.cWhite); s.rect(cx + 3, cy - 13 - Math.trunc(f32(pt * 8)), 2, 3, this.cWhite);
                }
                if (r.death === DeathKind.Snapped && pt < f32(0.6)) {
                    // the jaws close over him
                    const g = Math.trunc(f32(Math.min(f32(0.3), pt) * 30));
                    s.rect(cx - 9, cy - 10 + g, 18, 3, this.cGreenDark); s.rect(cx - 9, cy + 7 - g, 18, 3, this.cGreenDark);
                    for (let x = -8; x < 9; x += 4) { s.rect(cx + x, cy - 7 + g, 2, 2, this.cWhite); s.rect(cx + x + 1, cy + 5 - g, 2, 2, this.cWhite); }
                }
                break;
            }
            case DeathKind.Bitten: {
                s.blit(Courier[Math.trunc(f32(pt / f32(0.4))) & 1 ? Dir4.Left : Dir4.Right], cx - 9, cy - 9, this.pal);
                if (pt < f32(0.8)) {
                    // the bite marks: two arcs of teeth closing
                    const g = 7 - Math.trunc(f32(Math.min(f32(0.25), pt) * 16));
                    for (let x = -6; x <= 6; x += 3) { s.rect(cx + x, cy - g - 2, 2, 3, this.cWhite); s.rect(cx + x, cy + g, 2, 3, this.cWhite); }
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

    _drawFx(s, r, t) {
        const ox = this.ox, oy = this.oy;
        for (const p of r.fx) {
            const x = ox + Math.trunc(p.x), y = oy + Math.trunc(p.y);
            switch (p.k) {
                case 'dust': s.rect(x, y, 2, 2, p.t < f32(0.2) ? this.cAsLight : this.cAs); break;
                case 'drop': s.rect(x, y, 2, 2, (p.c & 1) ? this.cWhite : this.cTealLight); break;
                case 'bit': s.rect(x - 1, y - 1, 3, 3, p.c === 0 ? this.cWhite : p.c === 1 ? this.cYellow : this.cRed); break;
                case 'spark': s.rect(x, y, 1, 2, p.c === 0 ? this.cWhite : this.cYellow); break;
                case 'paper':
                    if (p.y < -6) break;
                    s.rect(x - 3, y - 2, 6, 5, this.cBg); s.rect(x - 2, y - 1, 4, 3, this.cWhite); s.setPixel(x, y, this.cCream);
                    break;
            }
        }
        // the score pop-ups rise from where they were earned
        const arc = PixelFont.Arcade;
        for (const q of r.pops) {
            const w = arc.measure(q.text);
            const px = Math.max(ox + 1, Math.min(ox + FW - w - 1, ox + Math.trunc(q.x) - idiv(w, 2)));
            const py = oy + Math.trunc(q.y) - Math.trunc(f32(Math.min(f32(0.7), q.t) * 12));
            const c = q.c === 'teal' ? this.cTealLight : q.c === 'green' ? this.cGreen : q.c === 'cream' ? this.cCream : this.cYellow;
            s.rect(px - 2, py - 2, w + 4, 11, this.cBg);
            s.text(q.text, px, py, arc, c);
        }
    }

    // ------------------------------------------------------------------ the panel
    _drawPanel(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const x = PX, right = 311;
        s.rect(218, FY, 1, FH, this.cAs);

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
        const low = secs <= 10 && r.p === Phase.Crossing && !r.invulnerable;
        s.text('TIME', x, 62, arc, this.cYellow);
        s.textRight(dn(secs, 2), right, 58, dsp, low && SurfaceDraw.blink(t) ? this.cRed : low ? this.cOrange : this.cCream, 2);
        s.frame(x, 77, 90, 8, this.cAsLight);
        const bw = roundEven(f32(f32(86 * Math.max(0, r.courierTimer)) / Math.max(1, r.courierTimeMax)));
        s.rect(x + 2, 79, bw, 4, low ? this.cRed : this.cYellow);
        s.dottedRule(x, right, 91, 3, this.cAs);

        // LIVES (an extra courier flashes in for 2 s)
        s.text('LIVES', x, 97, arc, this.cYellow);
        const flash = r.extraT < f32(2) && SurfaceDraw.blink(t, 2);
        const shown = Math.min(5, Math.max(r.livesMax, r.livesLeft));
        for (let i = 0; i < shown; i++) {
            const ix = x + i * 18;
            if (i < r.livesLeft) {
                if (flash && i === Math.min(4, r.livesLeft - 1)) s.rect(ix, 108, 18, 18, this.cYellow);
                s.blit(CourierIcon, ix, 108, this.pal);
            }
            else s.frame(ix + 2, 110, 12, 12, this.cAsDark);
        }
        if (r.livesLeft > 5) s.textRight('+' + (r.livesLeft - 5), right, 99, arc, this.cCream);
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
        if (r.carrying) s.blit(Parcel, x + 30, 173, this.pal);
        s.textRight(r.slotsFilled + '/5', right, 175, arc, this.cCream);
        for (let i = 0; i < LaneField.Slots; i++) {
            const ex = x + i * 18;
            if (r.filled[i]) s.blit(Envelope, ex, 187, this.pal);
            else { s.frame(ex, 187, 14, 10, this.cAs); s.line(ex + 1, 188, ex + 6, 192, this.cAs); s.line(ex + 12, 188, ex + 7, 192, this.cAs); }
        }
        s.dottedRule(x, right, 203, 3, this.cAs);

        // STAGE
        s.text('STAGE', x, 208, arc, this.cYellow);
        s.textRight(r.stage + '/' + r.lastStage, right, 208, arc, this.cCream);
        if (r.invulnerable) s.text('FREE RIDE', x, 220, PixelFont.Small, this.cGreen);
        else s.text(r.stageDef.name, x, 220, PixelFont.Small, this.cAsLight);
        s.textRight(dn(Math.min(99, r.courierNumber), 2), right, 220, PixelFont.Small, this.cAs);
    }

    // ------------------------------------------------------------------ plates and cards
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mx = FX + idiv(FW, 2);
        const P = r.p;
        if (P === Phase.Card) this._drawStageCard(s, r, t);
        else if (P === Phase.Ready) {
            s.textBox('GET READY', mx, 96, dsp, 2, this.cYellow, this.cYellow, this.cBg);
            s.plate(mx - 56, 120, 112, 15, this.cBg, this.cAs);
            s.textCentered(r.livesLeft === 1 ? 'LAST COURIER' : 'COURIER ' + r.courierNumber, mx, 124, arc, this.cCream);
            if (r.invulnerable) { s.plate(mx - 36, 140, 72, 15, this.cBg, this.cGreen); s.textCentered('FREE RIDE', mx, 144, arc, this.cGreen); }
            if (SurfaceDraw.blink(t)) s.textCenteredShadow('YOU', FX + Math.trunc(r.courierX), FY + LaneField.KerbRow * T - 11, arc, this.cYellow, this.cBg);
        }
        else if (P === Phase.Delivered) s.textCenteredShadow('DELIVERED', mx, FY + 6 * T + 4, dsp, this.cYellow, this.cBg);
        else if (P === Phase.Clear) {
            s.textBox('ALL FIVE!', mx, 88, dsp, 2, this.cYellow, this.cYellow, this.cBg);
            s.plate(mx - 64, 112, 128, 15, this.cBg, this.cAs);
            s.textCentered(r.stage >= r.lastStage ? 'THE ROUTE IS DONE' : 'STAGE ' + r.stage + ' DELIVERED', mx, 116, arc, this.cCream);
        }
        else if (P === Phase.Tally) this._drawTally(s, r, t);
        else if (P === Phase.Crash && r.phaseTime > f32(0.25)) {
            const w = DeathWords[r.death] || 'OUCH!';
            const k = r.death;
            const col = k === DeathKind.Crash || k === DeathKind.Train || k === DeathKind.Bitten ? this.cRed : k === DeathKind.TimeUp ? this.cYellow : k === DeathKind.Snapped ? this.cOrange : this.cTealLight;
            const py = r.deathRow >= 7 ? 72 : 150;
            s.textBox(w, mx, py, dsp, 2, col, col, this.cBg);
            const left = r.livesLeft === 1 ? '1 COURIER LEFT' : r.livesLeft <= 0 ? 'NO COURIERS LEFT' : r.livesLeft + ' COURIERS LEFT';
            s.plate(mx - 58, py + 24, 116, 15, this.cBg, this.cAs);
            s.textCentered(left, mx, py + 28, arc, this.cCream);
        }
        else if (P === Phase.Final || P === Phase.Over) this._drawFinal(s, r, t);

        // EXTRA COURIER: a plate low on the field for two seconds
        if (r.extraT < f32(2) && P !== Phase.Final && P !== Phase.Over) {
            s.plate(mx - 52, FY + 11 * T + 1, 104, 15, this.cBg, this.cYellow);
            s.textCentered('EXTRA COURIER', mx, FY + 11 * T + 5, arc, SurfaceDraw.blink(t, 2) ? this.cYellow : this.cCream);
        }
    }

    // the stage card: number, name, the stage's new thing drawn big, the hint, GET READY
    _drawStageCard(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, S = r.stageDef;
        s.plate(16, 50, 288, 124, this.cBg, this.cYellow);
        s.frame(18, 52, 284, 120, this.cAmber);
        s.textCentered('STAGE ' + r.stage + ' OF ' + r.lastStage, 160, 58, arc, this.cAmber);
        s.textCentered(S.name, 160 + 1, 70 + 1, dsp, this.cAsDark, 2);
        s.textTwoTone(S.name, 160 - idiv(dsp.measure(S.name, 2), 2), 70, dsp, this.cCream, this.cYellow, 4, 2);
        s.dottedRule(40, 280, 89, 3, this.cAs);
        this._drawFeature(s, S.feature, 160, 106, t);
        s.textCentered(S.hint[0], 160, 128, arc, this.cCream);
        s.textCentered(S.hint[1], 160, 139, arc, this.cCream);
        if (r.invulnerable) s.textCentered('FREE RIDE', 160, 156, arc, this.cGreen);
        else if (SurfaceDraw.blink(t)) s.textCentered(r.stage === 1 && r.courierNumber <= 1 ? 'FILL ALL FIVE SLOTS' : 'GET READY', 160, 156, arc, this.cYellow);
    }

    // the stage's new thing, centred at (cx, cy) on the card
    _drawFeature(s, f, cx, cy, t) {
        const pal = this.pal;
        s.rect(cx - 70, cy - 10, 140, 20, f === 'mudjaw' ? this.cTeal : f === 'train' ? this.cAsDark : f === 'moto' ? this.cNight : f === 'dog' ? this.cGreen : this.cAs);
        switch (f) {
            case 'car': s.blit(Cars[0], cx - 40, cy - 7, pal); s.blit(Vans[1], cx + 10, cy - 7, pal, 1, true); s.blit(CourierIcon, cx - 9, cy - 9, pal); break;
            case 'weaver': s.blit(Trucks[2], cx - 66, cy - 7, pal); s.blit(WeaverCar, cx + 4, cy - 7 - (SurfaceDraw.blink(t) ? 0 : 3), pal); s.rect(cx + 25, cy - 8, 3, 2, this.cOrange); break;
            case 'mudjaw': s.blit(Beast[Math.floor(f32(t * 1.2)) % 3], cx - 40, cy - 7, pal, 1, true); break;
            case 'moto': this._beam(s, cx + 8, cy - 8, 1, 30); s.blit(Motos[0], cx - 8, cy - 6, pal); s.blit(Motos[1], cx - 50, cy - 6, pal); this._beam(s, cx - 34, cy - 8, 1, 20); break;
            case 'train': s.rect(cx - 70, cy - 6, 140, 1, this.cAsLight); s.rect(cx - 70, cy + 5, 140, 1, this.cAsLight); s.blit(Train, cx - 106, cy - 7, pal); break;
            case 'dog': s.blit(Dog[Math.floor(f32(t * 3)) & 1], cx - 30, cy - 6, pal); s.blit(CourierIcon, cx + 12, cy - 9, pal); break;
        }
        s.frame(cx - 71, cy - 11, 142, 22, this.cAs);
    }

    // the tally: each line counts up into the score, the total under them, the next stage named
    _drawTally(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.plate(16, 50, 288, 132, this.cBg, this.cYellow);
        s.frame(18, 52, 284, 128, this.cAmber);
        s.textCentered(r.stage >= r.lastStage ? 'DELIVERY DAY DONE' : 'STAGE ' + r.stage + ' CLEAR', 160, 60, dsp, this.cYellow, 2);
        s.dottedRule(40, 280, 81, 3, this.cAs);
        for (let i = 0; i < r.tally.length; i++) {
            if (i > r.tallyLine) break;
            const ln = r.tally[i], y = 90 + i * 16;
            s.text(ln.label, 40, y, arc, this.cCream);
            const v = ln.value === 0 ? '---' : String(ln.counted);
            s.textRight(v, 280, y - 1, dsp, ln.counted === ln.value ? this.cYellow : this.cWhite);
        }
        s.dottedRule(40, 280, 139, 3, this.cAs);
        s.text('BONUS', 40, 146, arc, this.cAmber);
        s.textRight(String(r.tallyTotal), 280, 145, dsp, this.cYellow);
        if (r.stage < r.lastStage) s.textCentered('NEXT: ' + STAGES[r.stage].name, 160, 164, arc, SurfaceDraw.blink(t) ? this.cTealLight : this.cCream);
        else s.textCentered('THE TOWN GOT ITS MAIL', 160, 164, arc, this.cTealLight);
    }

    _drawFinal(s, r, t) {
        const spec = LaneJumperSpec, arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const won = r.roundWon;
        // one band across the whole tube, so the card never fights the panel
        s.plate(16, 54, 288, 120, this.cBg, this.cYellow);
        s.frame(18, 56, 284, 116, this.cAmber);
        if (won) {
            s.textCentered(spec.roundWonText, 160 + 2, 70 + 2, dsp, this.cAmber, 2);
            s.textTwoTone(spec.roundWonText, 160 - idiv(dsp.measure(spec.roundWonText, 2), 2), 70, dsp, this.cCream, this.cYellow, 4, 2);
        }
        else s.textCentered(spec.roundLostText, 160, 66, dsp, this.cRed, 3);
        s.dottedRule(40, 280, 95, 3, this.cAs);
        s.textCentered('SCORE ' + d6(r.score), 160, 104, arc, this.cCream, 2);
        if (won) {
            s.textCentered('SIX STAGES. THIRTY LETTERS.', 160, 128, arc, this.cYellow);
            s.textCentered('THE TOWN GOT ITS MAIL', 160, 140, arc, this.cTealLight);
            for (let i = 0; i < 6; i++) s.blit(Envelope, 160 - 57 + i * 18, 154, this.pal);
        }
        else {
            s.textCentered('STAGE ' + r.stage + ' ' + r.stageDef.name, 160, 130, arc, this.cYellow);
            s.textCentered(r.slotsFilled + '/5 SLOTS FILLED', 160, 144, arc, this.cAsLight);
        }
        // envelopes falling over the card on a win
        if (won) for (const p of r.fx) if (p.k === 'paper' && p.y > 40) {
            const x = FX + Math.trunc(p.x), y = FY + Math.trunc(p.y);
            if (y >= 10 && y <= 226 && x >= 11 && x <= 306) { s.rect(x - 3, y - 2, 7, 5, this.cBg); s.rect(x - 2, y - 1, 5, 3, this.cWhite); s.setPixel(x, y, this.cCream); }
        }
    }
}

LaneJumperRenderer.FX = FX;
LaneJumperRenderer.FY = FY;
LaneJumperRenderer.PX = PX;
