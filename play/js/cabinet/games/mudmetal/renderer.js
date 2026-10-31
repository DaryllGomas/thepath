// THE NODE · world 1 · MUD & METAL · THE PICTURE. Port of MudMetalRenderer.cs, built out for the six tracks.
//
// A full 320 x 240 screen, everything inside the 8 px safe area:
//   y   8..34   HUD: 1UP + the tries (helmets) + score, the lap TIME, the PAR (or your POS in the final)
//   y  36..79   the sky of the track's hour, its sun or moon, far hills or mesas  (parallax 0.02 / 0.12)
//   y  56..103  what stands behind the track: grandstands, a tree line, buttes, the arena (parallax 0.5)
//   y 104..111  the back fence: boards, rails, warning signs                       (with the track)
//   y 112..189  the track: four lanes at y 132/148/164/180, slanted ramps, mud, water, bales, the riders
//   y 190..203  hay bales along the front (the stadium: its padded wall)
//   y 206..231  the HEAT gauge (segments; the red line at the end) and the course map
// Ramps are drawn lane by lane, back to front, each lane Skew px earlier than the one behind, so
// a ramp reads as one slanted wedge across the track (the 1984 look); the front lane shows its
// side face. Bikes and bales are drawn with their lane, so a nearer lane's ramp hides a farther rider.
// The six looks (stages.js Theme): DUSK, BOG (rain), CANYON (afternoon), NIGHT (floodlit pools),
// STADIUM (indoors), FINAL (sunset, flags, fireworks at the flag).
// COST: the sky, the parallax band and the dirt are baked once per look into strips and copied a row
// at a time; the bikes are blitted from pre-packed pixel lists. The renderer only reads the sim.
// No blinking faster than 2 Hz; fades step through palette entries.
import { PixelFont, PixelSurface, SurfaceDraw, roundEven, d6 } from '../../sdk/index.js';
import * as Sprites from './sprites.js';
import * as Scroll from './scroll.js';
import { Skew, Lanes, BaleLen, FeatureKind } from './track.js';
import { MudMetalSim, MudEvent, clock, ordinal } from './sim.js';
import { MudMetalSpec, MudMetalPalette } from './spec.js';
import { Stages, Theme } from './stages.js';

const PlayTop = 36, PlayBottom = 204, PlayL = 8, PlayR = 312, SW = 320;
const Lane0Y = 132, LaneGap = 16;
const TrackTop = 112, TrackFront = 190;
const SkyH = 44;                    // the baked sky: y 36..79
const BackTop = 56, BackH = 48;     // the parallax band: y 56..103
const BackPeriod = 832;             // its strip repeats every this many layer px
const BedPeriod = 640;              // the dirt's specks, dashes and night pools repeat every this many px
const PoolPeriod = 320, PoolHalf = 92;

const BG = 0, NIGHT = 1, DUSK = 2, SKY = 3, MUDDK = 4, MUD = 5, TANDK = 6, TAN = 7, TANLT = 8,
      CHRDIM = 9, CHROME = 10, ORGDIM = 11, ORANGE = 12, REDDIM = 13, RED = 14, STEEL = 15,
      WATER = 16, FOAM = 17, GRASS = 18, GRASSDK = 19;

const Crowd = [RED, CHROME, ORANGE, TANLT, SKY, CHRDIM, TAN, GRASS];
const Boards = ['REDLINE', 'MUD & METAL', 'TURBO OIL', '1984'];
const FinalBoards = ['CHAMPIONSHIP', 'REDLINE', 'FINAL', 'TURBO OIL'];
const ArenaBoards = ['REDLINE ARENA', 'TURBO OIL', 'MUD & METAL'];
const GapNames = { [FeatureKind.Gap]: 'GAP', [FeatureKind.Creek]: 'CREEK', [FeatureKind.StepUp]: 'STEP-UP', [FeatureKind.Double]: 'DOUBLE', [FeatureKind.Triple]: 'TRIPLE' };

// the dirt and the ramps of each look: [bed, bed edge, speck dark, speck light, lane dash,
//   up-face, flat, back-face, top edge, back edge, side band A, side band B, side top]
const Dirt = [
    [TAN, TANDK, TANDK, TANLT, TANDK, TANLT, TAN, TANDK, TANDK, MUD, TANDK, MUD, TANLT],          // DUSK
    [TANDK, MUD, MUD, TAN, MUD, TAN, TANDK, MUD, MUD, MUDDK, MUD, MUDDK, TAN],                  // BOG
    [TAN, TANDK, ORGDIM, TANLT, TANDK, TANLT, TAN, TANDK, TANDK, MUD, TANDK, ORGDIM, TANLT],      // CANYON
    [TAN, TANDK, TANDK, TANLT, TANDK, TANLT, TAN, TANDK, TANDK, MUD, TANDK, MUD, TANLT],          // NIGHT (in the light)
    [MUD, MUDDK, MUDDK, TANDK, TANDK, TAN, TANDK, MUD, MUD, MUDDK, MUD, MUDDK, TAN],            // STADIUM
    [TAN, TANDK, TANDK, TANLT, TANDK, TANLT, TAN, TANDK, TANDK, MUD, TANDK, MUD, TANLT],          // FINAL
];
const DarkDirt = [TANDK, MUD, MUD, TAN, MUD, TANDK, MUD, MUDDK, MUD, MUDDK, MUD, MUDDK, TANDK];   // NIGHT, between the pools (dithered with NIGHT)

function baseY(laneF) { return roundEven(Lane0Y + laneF * LaneGap); }
function laneOf(laneF) { const l = roundEven(laneF); return l < 0 ? 0 : l > 3 ? 3 : l; }
function frac(v) { return v - Math.floor(v); }
function wrap(v, p) { const m = v % p; return m < 0 ? m + p : m; }
function smooth(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }

// a sprite as a list of its opaque pixels (dx, dy, packed colour): the bikes are blitted from these
const Packed = new Map();
function packedOf(spr, pal) {
    let o = Packed.get(spr);
    if (o) return o;
    const a = [];
    for (let y = 0; y < spr.height; y++)
        for (let x = 0; x < spr.width; x++) { const v = spr.at(x, y); if (v >= 0) a.push(x, y, pal.at(v).packed); }
    o = Int32Array.from(a);
    Packed.set(spr, o);
    return o;
}

export class MudMetalRenderer {
    constructor() {
        this.pal = MudMetalPalette;
        this.c = [];
        for (let i = 0; i < this.pal.count; i++) this.c.push(this.pal.get(i));
        this.k = this.c.map((c) => c.packed);
        this._order = [];
        this._s = null; this._w = null;
        this._bake = new Map();             // theme -> { sky, back, bed, hills }
        this.sx = 0; this.sy = 0;           // the shake
        this.theme = Theme.Dusk;
        // Prepare the strips at cabinet setup, so changing tracks never stalls a race frame.
        for (const stage of Stages) this._baked(stage.theme);
    }

    // the surface's pixels as packed words (Rgba.packed), for the strips and the hot loops
    _words(s) {
        if (this._s !== s) { this._s = s; this._w = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height); }
        return this._w;
    }

    draw(sim, s, t) {
        const m = sim;
        s.noClip();
        s.clear(this.c[BG]);
        if (m == null) return;
        const w = this._words(s);
        this.theme = m.stage.theme;
        const B = this._baked(this.theme);
        this._shake(m);
        const cam = m.camX + this.sx;

        s.clip(PlayL, PlayTop, PlayR - PlayL, PlayBottom - PlayTop);
        this._drawSky(s, w, B, cam, m, t);
        this._drawBack(w, B, cam);
        this._drawFence(s, cam, m);
        this._drawBed(w, B, cam);
        this._drawLines(s, cam, m);
        this._drawWater(s, w, cam, m, t);
        for (let k = 0; k < Lanes; k++) {
            this._drawMud(s, cam, m, k);
            this._drawTerrain(s, w, cam, m, k);
            this._drawLane(s, w, cam, m, k, t);
        }
        this._drawFront(s, cam);
        this._drawParticles(s, cam, m);
        this._drawPopups(s, cam, m, t);
        if (this.theme === Theme.Bog) this._drawRain(s, t);
        if (this.theme === Theme.Final && (m.p === MudMetalSim.Phase.Finish || m.p === MudMetalSim.Phase.Result || m.p === MudMetalSim.Phase.Over)) this._drawFireworks(s, m, m.phaseTime);
        s.noClip();

        this._drawHud(s, m, t);
        this._drawOverlays(s, w, m, t, cam);
    }

    // ------------------------------------------------------------ the shake (a crash, a bump, a rough one)
    _shake(m) {
        this.sx = 0; this.sy = 0;
        for (let i = m.log.length - 1; i >= 0; i--) {
            const e = m.log[i];
            const age = m.time - e.t;
            if (age > 0.45) break;
            let amp = 0, len = 0;
            if (e.kind === MudEvent.CrashLanding || e.kind === MudEvent.Clip || e.kind === MudEvent.Splash || e.kind === MudEvent.BaleHit) { amp = 3; len = 0.4; }
            else if (e.kind === MudEvent.Bump || e.kind === MudEvent.Shoved || e.kind === MudEvent.Rough) { amp = 1.6; len = 0.16; }
            if (amp === 0 || age > len) continue;
            const a = Math.round(amp * (1 - age / len));
            const ph = Math.floor(age * 40) & 1;
            this.sx = ph ? a : -a; this.sy = ((Math.floor(age * 40) >> 1) & 1) ? a : -a;
            break;
        }
    }

    // ------------------------------------------------------------ the baked strips of a look
    _baked(theme) {
        let B = this._bake.get(theme);
        if (B) return B;
        B = {};
        const pal = this.pal;
        // the sky: 304 x SkyH, static
        const sky = new PixelSurface(304, SkyH);
        this._bakeSky(sky, theme);
        B.sky = new Uint32Array(sky.data.buffer);
        // the far hills: a height per layer column (0.12 parallax), long enough for every track
        B.hills = new Int16Array(2200);
        for (let i = 0; i < B.hills.length; i++) B.hills[i] = this._hill(theme, i - 64);
        // the parallax band: a strip with holes (0 = see through)
        const back = new PixelSurface(BackPeriod, BackH);
        this._bakeBack(back, theme);
        B.back = new Uint32Array(back.data.buffer);
        // the dirt: BedPeriod + 304 columns of the track bed, rows TrackTop..TrackFront
        const bed = new PixelSurface(BedPeriod + 320, TrackFront - TrackTop);
        this._bakeBed(bed, theme);
        B.bed = new Uint32Array(bed.data.buffer);
        B.bedW = bed.width;
        void pal;
        this._bake.set(theme, B);
        return B;
    }

    _bakeSky(s, theme) {
        const c = this.c;
        s.clear(c[BG]);
        const band = (y0, y1, col) => s.rect(0, y0 - PlayTop, 304, y1 - y0, c[col]);
        const dith = (y, col, ph) => s.checker(0, y - PlayTop, 304, 2, c[col], ph);
        switch (theme) {
            case Theme.Bog:
                band(36, 50, NIGHT); dith(50, STEEL, 0); band(52, 66, STEEL); dith(66, CHRDIM, 1); band(68, 80, CHRDIM);
                for (let i = 0; i < 14; i++) {          // the rain clouds
                    const h = Scroll.hash(i, 71);
                    const cx = h % 304, cy = 40 + ((h >>> 9) % 22), rw = 14 + ((h >>> 14) % 22);
                    for (let y = -4; y <= 4; y++) {
                        const half = Math.trunc(rw * Math.sqrt(1 - (y * y) / 20));
                        s.rect(cx - half, cy + y - PlayTop, half * 2, 1, c[cy + y < 52 ? STEEL : NIGHT]);
                    }
                }
                break;
            case Theme.Canyon:
                band(36, 46, DUSK); dith(46, SKY, 0); band(48, 62, SKY); dith(62, FOAM, 1); band(64, 80, FOAM);
                s.circle(70, 52 - PlayTop, 7, c[TANLT], true); s.circle(70, 52 - PlayTop, 4, c[CHROME], true);
                break;
            case Theme.Night:
                band(36, 72, BG); dith(72, NIGHT, 0); band(74, 80, NIGHT);
                for (let i = 0; i < 70; i++) {
                    const h = Scroll.hash(i, 33);
                    s.setPixel(h % 304, (h >>> 10) % 36, c[(h >>> 20) % 3 === 0 ? CHROME : CHRDIM]);
                }
                s.circle(244, 50 - PlayTop, 7, c[CHROME], true);
                s.setPixel(242, 48 - PlayTop, c[CHRDIM]); s.rect(245, 51 - PlayTop, 2, 2, c[CHRDIM]); s.setPixel(241, 53 - PlayTop, c[CHRDIM]);
                break;
            case Theme.Stadium:
                // the arena roof: two girders, the lattice between them, lamp clusters hanging under it
                band(36, 80, NIGHT);
                band(38, 40, STEEL); band(48, 50, STEEL);
                for (let x = 0; x < 304; x++) {
                    const u = x % 16, d = u < 8 ? u : 15 - u;
                    s.setPixel(x, 40 + d - PlayTop, c[STEEL]);
                    if ((x % 48) >= 20 && (x % 48) < 28) {
                        s.rect(x, 50 - PlayTop, 1, 3, c[STEEL]);
                        s.rect(x, 53 - PlayTop, 1, 3, c[(x & 1) ? TANLT : CHROME]);
                        if (((x + 1) % 48) === 28 || (x % 48) === 20) s.checker(x - 2, 56 - PlayTop, 4, 6, c[TANDK], x & 1);
                    }
                }
                break;
            case Theme.Final:
                band(36, 44, BG); dith(44, NIGHT, 0); band(46, 56, NIGHT); dith(56, DUSK, 1); band(58, 66, DUSK);
                dith(66, REDDIM, 0); band(68, 74, REDDIM); dith(74, ORGDIM, 1); band(76, 80, ORGDIM);
                for (let i = 0; i < 26; i++) { const h = Scroll.hash(i, 57); s.setPixel(h % 304, (h >>> 10) % 10, c[CHRDIM]); }
                break;
            default:   // DUSK
                band(36, 47, NIGHT); dith(47, DUSK, 0); band(49, 60, DUSK); dith(60, SKY, 0); band(62, 72, SKY);
                dith(72, ORANGE, 1); band(74, 80, ORANGE);
                break;
        }
    }

    _hill(theme, lx) {
        if (theme === Theme.Canyon) {
            // mesas: flat tops on steep sides, one to a block
            const blk = Math.floor(lx / 96), u = wrap(lx, 96), h = Scroll.hash(blk, 91);
            const w0 = 10 + (h % 20), w1 = w0 + 34 + ((h >>> 6) % 30), top = 16 + ((h >>> 12) % 14);
            if (u < w0 || u > w1) return 5;
            const edge = Math.min(u - w0, w1 - u);
            return edge < 5 ? 5 + Math.trunc((top - 5) * edge / 5) : top;
        }
        return 6 + Scroll.hillHeight(lx, 12, 3);
    }

    _bakeBack(s, theme) {
        const c = this.c, H = BackH, y0 = BackTop;
        const Y = (y) => y - y0;
        if (theme === Theme.Bog) {
            // a tree line over a wooden spectator rail
            for (let i = 0; i < 26; i++) {
                const h = Scroll.hash(i, 17);
                const cx = i * 32 + (h % 14), r = 9 + ((h >>> 5) % 8), cy = 78 - ((h >>> 9) % 10);
                s.rect(cx - 1, Y(cy), 3, Y(104) - Y(cy), c[MUD]);
                s.circle(cx, Y(cy) - 2, r, c[GRASSDK], true);
                s.circle(cx - 2, Y(cy) - 4, r - 4, c[GRASS], true);
                s.circle(cx + 1, Y(cy) - 2, Math.max(2, r - 6), c[GRASSDK], true);
            }
            s.rect(0, Y(94), BackPeriod, 10, c[GRASSDK]);
            for (let x = 0; x < BackPeriod; x++) {
                if ((x % 26) < 2) s.rect(x, Y(92), 1, 12, c[MUD]);
                s.setPixel(x, Y(95), c[TANDK]); s.setPixel(x, Y(99), c[TANDK]);
                const h = Scroll.hash(x, 23);
                if ((h & 7) === 0) s.rect(x, Y(96) + ((h >>> 4) & 1), 1, 3, c[Crowd[(h >>> 8) & 7]]);
            }
            return;
        }
        if (theme === Theme.Canyon) {
            // red buttes and the odd cactus
            for (let i = 0; i < 9; i++) {
                const h = Scroll.hash(i, 13);
                const x0 = i * 92 + (h % 20), bw = 40 + ((h >>> 5) % 34), top = 62 + ((h >>> 11) % 18);
                for (let x = x0; x < x0 + bw; x++) {
                    const e = Math.min(x - x0, x0 + bw - 1 - x);
                    const yt = top + (e < 4 ? (4 - e) * 3 : 0);
                    s.rect(x, Y(yt), 1, H - Y(yt), c[ORGDIM]);
                    s.setPixel(x, Y(yt), c[ORANGE]);
                    if (yt + 6 < 104) s.setPixel(x, Y(yt + 6), c[REDDIM]);
                    if (yt + 13 < 104) s.rect(x, Y(yt + 12), 1, 2, c[REDDIM]);
                    s.rect(x, Y(98), 1, 6, c[MUD]);
                }
            }
            for (let i = 0; i < 12; i++) {
                const h = Scroll.hash(i, 29), x = i * 70 + (h % 40), ht = 8 + ((h >>> 6) % 7);
                s.rect(x, Y(104 - ht), 2, ht, c[GRASS]); s.rect(x - 2, Y(104 - ht + 3), 2, 1, c[GRASS]);
                s.rect(x - 2, Y(104 - ht), 1, 3, c[GRASS]); s.rect(x + 3, Y(104 - ht + 4), 1, 3, c[GRASS]); s.setPixel(x + 2, Y(104 - ht + 4), c[GRASS]);
            }
            return;
        }
        if (theme === Theme.Stadium) {
            // the arena: roof trusses and lamps, then the tiers of the crowd all the way down
            s.rect(0, 0, BackPeriod, H, c[NIGHT]);
            for (let x = 0; x < BackPeriod; x++) {
                const u = x % 24;
                s.setPixel(x, Y(57), c[STEEL]); s.setPixel(x, Y(65), c[STEEL]);
                const d = u < 12 ? u : 23 - u;
                s.setPixel(x, Y(57) + Math.trunc(d * 8 / 12), c[STEEL]);
                if (u >= 10 && u < 14) s.rect(x, Y(66), 1, 2, c[(u & 1) ? TANLT : CHROME]);
                for (let row = 0; row < 11; row++) {
                    const h = Scroll.hash(Math.trunc(x / 3) * 13 + row, 41);
                    if ((x % 3) === 2 || (h & 3) === 0) continue;
                    s.rect(x, Y(71 + row * 3) + ((h >>> 4) & 1), 1, 2, c[Crowd[(h >>> 8) & 7]]);
                }
            }
            for (let x = 0; x < BackPeriod; x++) s.setPixel(x, Y(70), c[DUSK]);
            // the big screen
            s.rect(330, Y(72), 120, 24, c[BG]); s.frame(330, Y(72), 120, 24, c[ORANGE]); s.frame(332, Y(74), 116, 20, c[ORGDIM]);
            s.textCentered('REDLINE ARENA', 390, Y(81), PixelFont.Arcade, c[ORANGE]);
            s.rect(0, Y(101), BackPeriod, 3, c[DUSK]);
            return;
        }
        // grandstands (DUSK, NIGHT, FINAL): the original's period, light towers in the gaps
        const period = 104, standW = 84, two = theme === Theme.Final;
        for (let px = 0; px < BackPeriod; px++) {
            const u = px % period, block = Math.floor(px / period);
            if (u < standW) {
                const roof = two ? 70 : 78;
                s.setPixel(px, Y(roof), c[CHRDIM]);
                s.rect(px, Y(roof + 1), 1, 2, c[STEEL]);
                s.rect(px, Y(roof + 3), 1, 99 - roof - 3, c[NIGHT]);
                s.rect(px, Y(99), 1, 1, c[CHROME]);
                s.rect(px, Y(100), 1, 4, c[DUSK]);
                if (u < 2 || u >= standW - 2) s.rect(px, Y(roof + 3), 1, 104 - roof - 3, c[STEEL]);
                if (two && (u % 8) < 4) {     // the bunting along the roof
                    const col = [RED, ORANGE, CHROME][Math.trunc(u / 8) % 3];
                    s.rect(px, Y(roof - 3), 1, 3 - (u % 4 === 3 ? 2 : u % 4 === 0 ? 2 : 0), c[col]);
                }
                if (u >= 3 && u < standW - 3 && (u % 3) !== 2) {
                    const col = Math.trunc(u / 3), rows = two ? 7 : 5, ry = two ? 75 : 83;
                    for (let row = 0; row < rows; row++) {
                        const h = Scroll.hash(block * 97 + col, row + 11);
                        if ((h & 3) === 0) continue;
                        s.rect(px, Y(ry + row * 3 + ((h >>> 4) & 1)), 1, 2, c[Crowd[(h >>> 8) & 7]]);
                    }
                }
            } else if (u === standW + 9 || u === standW + 10)
                s.rect(px, Y(theme === Theme.Night ? 60 : 70), 1, 104 - (theme === Theme.Night ? 60 : 70), c[STEEL]);        // light tower pole
            else s.rect(px, Y(96), 1, 8, c[DUSK]);         // low wall between stands
            const lampY = theme === Theme.Night ? 56 : 66;
            if (u >= standW + 6 && u < standW + 14) s.rect(px, Y(lampY), 1, theme === Theme.Night ? 5 : 4, c[(u & 1) === 0 ? CHROME : TANLT]);   // the lamps
        }
    }

    _bakeBed(s, theme) {
        const c = this.c, D = Dirt[theme], H = TrackFront - TrackTop;
        for (let x = 0; x < s.width; x++) {
            const wx = x % BedPeriod;
            let col = D, lit = 1;
            if (theme === Theme.Night) {
                const d = Math.abs(wrap(wx, PoolPeriod) - PoolPeriod / 2);
                lit = d < PoolHalf - 10 ? 1 : d < PoolHalf ? 0.5 : 0;
                if (lit === 0) col = DarkDirt;
            }
            s.rect(x, 0, 1, 2, c[col[1]]);
            s.rect(x, 2, 1, H - 4, c[col[0]]);
            if (lit === 0) for (let y = 2 + (x & 1); y < H - 2; y += 2) s.setPixel(x, y, c[NIGHT]);
            if (lit === 0.5) for (let y = 2 + (x & 1); y < H - 2; y += 2) s.setPixel(x, y, c[DarkDirt[0]]);
            s.rect(x, H - 2, 1, 2, c[col[1]]);
            const h = Scroll.hash(wx, 5);
            if ((h % 7) === 0) s.setPixel(x, 3 + ((h >>> 8) % 74), c[col[2]]);
            if ((h % 11) === 0) s.setPixel(x, 3 + ((h >>> 16) % 74), c[col[3]]);
            if (theme === Theme.Bog && (h % 23) === 0) s.rect(x, 3 + ((h >>> 12) % 72), 3, 1, c[CHRDIM]);   // puddle glints
            if (wrap(wx, 20) < 10) for (let k = 0; k < 3; k++) s.setPixel(x, Lane0Y + 8 + k * LaneGap - TrackTop, c[col[4]]);
        }
    }

    // ------------------------------------------------------------ backdrop
    _drawSky(s, w, B, cam, m, t) {
        const c = this.c, k = this.k;
        for (let y = 0; y < SkyH; y++) w.set(B.sky.subarray(y * 304, y * 304 + 304), (PlayTop + y) * SW + PlayL);
        if (this.theme === Theme.Dusk) {          // the setting sun, barely moving
            let sx = (236 - Math.floor(cam * 0.02)) % 400;
            if (sx < -30) sx += 400;
            s.circle(sx, 76, 11, c[ORANGE], true);
            s.circle(sx, 76, 7, c[TANLT], true);
        }
        if (this.theme === Theme.Stadium) return;
        const theme = this.theme;
        const col = theme === Theme.Bog ? k[GRASSDK] : theme === Theme.Canyon ? k[ORGDIM] : theme === Theme.Final ? k[BG] : k[NIGHT];
        const top = theme === Theme.Bog ? k[GRASS] : theme === Theme.Canyon ? k[ORANGE] : col;
        const band = theme === Theme.Canyon ? k[REDDIM] : col;
        const base = Math.floor(cam * 0.12);
        for (let px = PlayL; px < PlayR; px++) {
            const li = base + px + 64;
            const h = li >= 0 && li < B.hills.length ? B.hills[li] : this._hill(theme, base + px);
            const y0 = 80 - h;
            let o = y0 * SW + px;
            w[o] = top; o += SW;
            for (let y = y0 + 1; y < 104; y++, o += SW) w[o] = y === y0 + 4 ? band : col;
        }
        void m; void t;
    }

    _drawBack(w, B, cam) {
        const lx0 = Math.floor(cam * 0.5);
        const strip = B.back;
        for (let y = 0; y < BackH; y++) {
            const row = y * BackPeriod, o = (BackTop + y) * SW;
            let u = wrap(lx0 + PlayL, BackPeriod);
            for (let px = PlayL; px < PlayR; px++) {
                const v = strip[row + u];
                if (v !== 0) w[o + px] = v;
                if (++u === BackPeriod) u = 0;
            }
        }
    }

    _drawFence(s, cam, m) {
        const c = this.c, theme = this.theme;
        if (theme === Theme.Bog || theme === Theme.Canyon) {
            // a wooden fence: posts and two rails
            const first = Math.floor((cam + 8) / 28) - 1;
            s.rect(PlayL, 105, 304, 1, c[TANDK]); s.rect(PlayL, 109, 304, 1, c[TANDK]);
            s.rect(PlayL, 106, 304, 3, c[theme === Theme.Bog ? GRASSDK : MUD]);
            s.rect(PlayL, 110, 304, 2, c[theme === Theme.Bog ? GRASSDK : MUD]);
            for (let i = first; i < first + 13; i++) {
                const x0 = Math.floor(i * 28 - cam);
                s.rect(x0, 103, 2, 9, c[MUD]);
            }
        } else {
            const period = theme === Theme.Stadium ? 84 : 56;
            const list = theme === Theme.Final ? FinalBoards : theme === Theme.Stadium ? ArenaBoards : Boards;
            const first = Math.floor((cam + 8) / period) - 1;
            for (let i = first; i < first + Math.ceil(320 / period) + 2; i++) {
                const x0 = Math.floor(i * period - cam);
                const bi = Scroll.wrap(i, list.length);
                const alt = (i & 1) === 0;
                const bgc = theme === Theme.Stadium ? (alt ? DUSK : CHROME) : alt ? ORANGE : CHROME;
                const fg = theme === Theme.Stadium ? (alt ? CHROME : DUSK) : alt ? BG : RED;
                s.rect(x0, 104, period - 2, 8, c[bgc]);
                s.rect(x0 + period - 2, 103, 2, 9, c[STEEL]);
                s.textCentered(list[bi], x0 + Math.trunc((period - 2) / 2), 106, PixelFont.Small, c[fg]);
            }
        }
        // the warning signs: a board on two posts, an arrow to the pit
        for (const g of m.track.signs) {
            const x = Math.floor(g.x - cam);
            if (x < -60 || x > 360) continue;
            const wd = PixelFont.Small.measure(g.text) + 10;
            s.rect(x + 2, 96, 1, 16, c[STEEL]); s.rect(x + wd - 3, 96, 1, 16, c[STEEL]);
            s.rect(x, 88, wd, 10, c[ORANGE]); s.frame(x, 88, wd, 10, c[BG]);
            s.text(g.text, x + 4, 91, PixelFont.Small, c[BG]);
            s.rect(x + wd - 4, 92, 2, 2, c[BG]); s.setPixel(x + wd - 2, 92, c[BG]);
        }
    }

    _drawBed(w, B, cam) {
        const off = wrap(Math.floor(cam) + PlayL, BedPeriod);
        const H = TrackFront - TrackTop, bw = B.bedW;
        for (let y = 0; y < H; y++) {
            const sy = y - this.sy;
            const r = sy < 0 ? 0 : sy >= H ? H - 1 : sy;
            w.set(B.bed.subarray(r * bw + off, r * bw + off + 304), (TrackTop + y) * SW + PlayL);
        }
    }

    _drawLines(s, cam, m) {
        this._slantLine(s, cam, 0, false);
        this._slantLine(s, cam, m.track.length, true);
        if (m.track.lapAt > 0) this._slantLine(s, cam, m.track.lapAt, false);
        this._drawBanner(s, cam, 0, 'START', ORANGE);
        this._drawBanner(s, cam, m.track.length, m.isFinal ? 'FINAL' : 'FINISH', RED);
        if (m.track.lapAt > 0) this._drawBanner(s, cam, m.track.lapAt, 'LAP 2', DUSK);
    }

    _slantLine(s, cam, xp, checker) {
        const c = this.c;
        const x0 = Math.floor(xp - cam);
        if (x0 < -40 || x0 > 360) return;
        for (let y = TrackTop + 2; y < TrackFront - 2; y++) {
            const laneF = (y - this.sy - Lane0Y) / LaneGap;
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

    // the fords and the creeks: water across every lane, slanted like the ramps
    _drawWater(s, w, cam, m, t) {
        const tr = m.track;
        for (const f of tr.fords) this._waterBand(w, cam, f.x0, f.x1, t, false);
        for (const f of tr.creeks) this._waterBand(w, cam, f.x0, f.x1, t, true);
    }

    _waterBand(w, cam, x0, x1, t, creek) {
        const k = this.k;
        if (x1 - cam < -40 || x0 - cam > 360) return;
        const drift = Math.floor(t * 18);
        for (let y = TrackTop + 2; y < TrackFront - 2; y++) {
            const laneF = (y - this.sy - Lane0Y) / LaneGap;
            const a = Math.floor(x0 - laneF * Skew - cam), b = Math.floor(x1 - laneF * Skew - cam);
            const lo = Math.max(PlayL, a), hi = Math.min(PlayR - 1, b);
            const o = y * SW;
            for (let x = lo; x <= hi; x++) {
                const e = Math.min(x - a, b - x);
                let v = k[WATER];
                if (e < 2) v = creek ? k[MUDDK] : k[FOAM];
                else if (e < 3) v = k[FOAM];
                else {
                    const h = Scroll.hash(x + Math.floor(cam) - drift, y * 7);
                    if ((h & 31) === 0) v = k[FOAM];
                    else if ((h & 31) === 1) v = k[DUSK];
                }
                w[o + x] = v;
            }
        }
    }

    // ------------------------------------------------------------ the lanes
    _drawMud(s, cam, m, k) {
        const c = this.c;
        const by = baseY(k) + this.sy;
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

    _drawTerrain(s, w, cam, m, k) {
        const kk = this.k, tr = m.track;
        const by = baseY(k) + this.sy;
        const front = k === Lanes - 1;
        const night = this.theme === Theme.Night;
        const lo = cam + PlayL + k * Skew, hi = cam + PlayR + k * Skew;
        for (const f of tr.features) {
            if (f.x0 + f.len < lo || f.x0 > hi) continue;
            const a = Math.max(PlayL, Math.floor(f.x0 - k * Skew - cam)), b = Math.min(PlayR - 1, Math.ceil(f.x0 + f.len - k * Skew - cam));
            const ck = f.kind === FeatureKind.Creek ? tr.creeks.find((q) => q.x0 >= f.x0 && q.x0 < f.x0 + f.len) : null;
            for (let px = a; px <= b; px++) {
                const xp = cam + px + k * Skew;
                if (ck && xp > ck.x0 + 1 && xp < ck.x1 - 1) continue;          // the creek shows through
                const h = tr.heightAt(xp);
                if (h < 0.5) continue;
                const hi2 = roundEven(h);
                const top = by - hi2;
                const sl = tr.slopeAt(xp);
                let D = Dirt[this.theme];
                if (night) { const d = Math.abs(wrap(Math.floor(xp - k * Skew), PoolPeriod) - PoolPeriod / 2); if (d >= PoolHalf) D = DarkDirt; }
                const y0 = Math.max(PlayTop, top), y1 = Math.min(PlayBottom - 1, by);
                if (front) {
                    // the side face of the ramp, in bands parallel to its top
                    let o = y0 * SW + px;
                    for (let y = y0; y <= y1; y++, o += SW) w[o] = y === top ? kk[D[12]] : (((y - top) & 3) < 2 ? kk[D[10]] : kk[D[11]]);
                } else {
                    const body = sl > 0.05 ? D[5] : sl < -0.05 ? D[7] : D[6];
                    let o = y0 * SW + px;
                    const bv = kk[body];
                    for (let y = y0; y <= y1; y++, o += SW) w[o] = bv;
                    if (top >= PlayTop) w[top * SW + px] = kk[sl < -0.05 ? D[9] : D[8]];
                }
            }
        }
    }

    // the riders and the bales of one lane, back to front
    _drawLane(s, w, cam, m, k, t) {
        const order = this._order;
        order.length = 0;
        for (const r of m.rivals)
            if (r.active && laneOf(r.laneF) === k) order.push(r);
        const P = MudMetalSim.Phase;
        const crashed = m.p === P.Crash || (m.p === P.Fail && m.failDown);
        const hideMe = m.p === P.Card || m.p === P.Result || m.p === P.Over;
        if (!crashed && !hideMe && laneOf(m.player.laneF) === k) order.push(m.player);
        order.sort((a, b) => a.laneF - b.laneF);
        for (const b of m.bales) if (b.lane === k) this._drawBale(s, cam, m, b, t);
        for (const b of order) this._drawBike(s, w, cam, m, b, t, b === m.player);
        if (crashed && laneOf(m.crashLaneF) === k) this._drawCrash(s, w, cam, m, t);
    }

    _drawBale(s, cam, m, b, t) {
        const c = this.c;
        const x = Math.floor(b.x - b.lane * Skew - cam);
        if (x < -20 || x > 330) return;
        const by = baseY(b.lane) + this.sy;
        if (b.down) {
            // knocked flat: straw in the lane
            const age = m.time - b.downT;
            const spread = Math.min(10, Math.trunc(age * 40));
            s.rect(x - spread, by - 3, BaleLen + spread * 2, 3, c[TANDK]);
            for (let i = 0; i < 8; i++) { const h = Scroll.hash(i, b.x); s.rect(x - spread + (h % (BaleLen + spread * 2)), by - 4 - ((h >>> 8) % 3), 2, 1, c[i & 1 ? TANLT : TAN]); }
            return;
        }
        s.blit(Sprites.Bale, x, by - 9, this.pal);
        // the reflector: lit in the dark, a slow blink
        if (this.theme === Theme.Night || this.theme === Theme.Bog) {
            if (SurfaceDraw.blink(t + b.lane * 0.25, 1)) { s.rect(x + 4, by - 6, 3, 2, c[ORANGE]); s.setPixel(x + 5, by - 6, c[TANLT]); }
            else s.rect(x + 4, by - 6, 3, 2, c[ORGDIM]);
        }
    }

    _blitFast(w, spr, x, y) {
        const ops = packedOf(spr, this.pal);
        for (let i = 0; i < ops.length; i += 3) {
            const px = x + ops[i], py = y + ops[i + 1];
            if (px < PlayL || px >= PlayR || py < PlayTop || py >= PlayBottom) continue;
            w[py * SW + px] = ops[i + 2];
        }
    }

    _drawBike(s, w, cam, m, b, t, isPlayer) {
        const c = this.c;
        const px = Scroll.toScreen(b.x, cam);
        if (px < -30 || px > 350) return;
        const by = baseY(b.laneF) + this.sy;
        let py = by - roundEven(b.z);
        if (b.airborne) {
            const gy = by - roundEven(m.track.height(b.x, b.laneF));
            const sw = Math.max(8, 18 - Math.trunc((gy - py) / 6));
            s.checker(px - Math.trunc(sw / 2), gy - 1, sw, 3, c[TANDK], 0);
        }
        // the headlight at night: a dithered pool on the dirt ahead
        if (this.theme === Theme.Night && !b.airborne) s.checker(px + 12, by - 2, 26, 4, c[TANLT], 1);
        if (isPlayer && b.invuln > 0 && !SurfaceDraw.blink(b.invuln, 2)) return;      // just back on: a 2 Hz flicker
        const frame = Math.floor(b.x / 12) & 1;
        let ai = Sprites.angleIndex(b.pitch);
        if (b.wobbleT > 0) { ai = Math.max(0, Math.min(Sprites.AngleCount - 1, ai + ((Math.floor(t * 12) & 1) ? 1 : -1))); py -= 1; }
        const spr = isPlayer ? Sprites.Player[frame][ai] : Sprites.Rival[b.jersey][frame][ai];
        this._blitFast(w, spr, px - Sprites.FramePivot, py - Sprites.FramePivot);

        if (!isPlayer) {
            if (b.inWater && !b.airborne && b.speed > 30) this._spray(s, px, by, t, b.x, true);
            if (b.shoveT > 0) s.textCenteredShadow('!', px + 1, py - 32, PixelFont.Display, c[ORANGE], c[BG]);
            return;
        }
        const p = b;
        const r = b.pitch * Math.PI / 180.0, co = Math.cos(r), sn = Math.sin(r);
        // the rooster tail off the back wheel (a spray of water in a ford)
        if (!b.airborne && b.speed > 45 && p.gas && !(p.stallT > 0)) {
            if (b.inWater) this._spray(s, px, by, t, b.x, false);
            else for (let i = 0; i < 6; i++) {
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
            if (Math.floor(t * 20) & 1) s.setPixel(ex - 4, ey, c[RED]);
        }
        // hot: a shimmer over the engine
        if (m.hot && !(p.stallT > 0) && (Math.floor(t * 8) & 1)) { s.setPixel(px + 1, py - 9, c[ORANGE]); s.setPixel(px - 1, py - 11, c[ORGDIM]); }
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

    // water thrown up by a wheel in a ford
    _spray(s, px, by, t, x, small) {
        const c = this.c;
        const n = small ? 4 : 7;
        for (let i = 0; i < n; i++) {
            const age = frac(t * 3.1 + i / n + (x & 7) * 0.13);
            const dx = px - 10 - Math.trunc(age * (small ? 14 : 22)) + (i & 1) * 3, dy = by - 3 - Math.trunc(age * 14) + Math.trunc(age * age * 14);
            s.rect(dx, dy, age < 0.4 ? 2 : 1, age < 0.4 ? 2 : 1, c[i % 3 === 0 ? CHROME : FOAM]);
        }
    }

    _drawCrash(s, w, cam, m, t) {
        const c = this.c;
        const ct = m.crashT;
        const v0 = m.crashSpeed;
        const laneF = m.crashLaneF;
        const by = baseY(laneF) + this.sy;
        if (m.lastCrash === MudMetalSim.CrashKind.Splash) {
            // into the creek: the rider bobs in the water, then is back on the far bank
            if (ct < 1.0) {
                const rx = Scroll.toScreen(m.crashX, cam), ry = by - 4 + (Math.floor(ct * 6) & 1);
                s.blit(Sprites.Rider[Math.trunc(ct * 8) & 7], rx - Sprites.TumbleSize / 2, ry - Sprites.TumbleSize / 2 - 2, this.pal);
                s.rect(rx - 12, ry, 24, 4, c[WATER]);
                s.rect(rx - 12 + (Math.floor(ct * 8) & 3), ry, 6, 1, c[FOAM]);
            } else {
                const p = m.player;
                const px = Scroll.toScreen(m.remountX, cam), gy = by - roundEven(m.track.height(m.remountX, laneF));
                if (SurfaceDraw.blink(ct, 2)) this._blitFast(w, Sprites.Player[0][Sprites.angleIndex(p.pitch)], px - Sprites.FramePivot, gy - Sprites.FramePivot);
            }
            return;
        }
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
        // stars over the dazed rider
        if (ct >= 0.8 && ct < 1.35) for (let i = 0; i < 3; i++) {
            const a = ct * 9 + i * 2.1;
            s.setPixel(rsx + Math.trunc(Math.cos(a) * 7), rsy - 10 + Math.trunc(Math.sin(a) * 2), c[i === 1 ? ORANGE : TANLT]);
        }
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

    _drawFront(s, cam) {
        const c = this.c;
        if (this.theme === Theme.Stadium) {
            // the padded wall, its sponsors
            s.rect(PlayL, 190, 304, 14, c[DUSK]);
            s.rect(PlayL, 190, 304, 1, c[CHROME]); s.rect(PlayL, 203, 304, 1, c[NIGHT]);
            const period = 96, first = Math.floor((cam + 8) / period) - 1;
            for (let i = first; i < first + 5; i++) {
                const x0 = Math.floor(i * period - cam);
                s.rect(x0, 191, 2, 12, c[NIGHT]);
                s.textCentered(ArenaBoards[Scroll.wrap(i, ArenaBoards.length)], x0 + 48, 194, PixelFont.Arcade, c[(i & 1) ? CHROME : ORANGE]);
            }
            return;
        }
        const bog = this.theme === Theme.Bog;
        const period = 32;
        const first = Math.floor((cam + 8) / period) - 1;
        for (let i = first; i < first + 12; i++) {
            const x0 = Math.floor(i * period - cam);
            s.rect(x0, 192, period - 2, 12, c[bog ? TANDK : TAN]);
            s.rect(x0, 192, period - 2, 1, c[bog ? TAN : TANLT]);
            s.rect(x0, 197, period - 2, 1, c[bog ? MUD : TANDK]);
            s.rect(x0, 203, period - 2, 1, c[bog ? MUD : TANDK]);
            s.rect(x0 + 8, 192, 1, 12, c[ORGDIM]);
            s.rect(x0 + 21, 192, 1, 12, c[ORGDIM]);
            s.rect(x0 + period - 2, 192, 2, 12, c[MUD]);
        }
        s.rect(8, 190, 304, 2, c[MUD]);
    }

    _drawRain(s, t) {
        const c = this.c;
        for (let i = 0; i < 56; i++) {
            const h = Scroll.hash(i, 61);
            const x = PlayL + wrap((h % 304) - Math.floor(t * 70), 304);
            const y = PlayTop + wrap(((h >>> 9) % 168) + Math.floor(t * 230), 168);
            s.setPixel(x, y, c[CHRDIM]); s.setPixel(x - 1, y + 1, c[CHRDIM]); s.setPixel(x - 2, y + 2, c[STEEL]);
        }
    }

    _drawFireworks(s, m, pt) {
        const c = this.c;
        const cols = [RED, ORANGE, CHROME, TANLT, GRASS, FOAM];
        const cyc = Math.floor(pt / 3.3), lt = pt - cyc * 3.3;
        for (let b = 0; b < 6; b++) {
            const age = lt - (b * 0.55 + 0.2);
            if (age < 0 || age > 1.6) continue;
            const h = Scroll.hash(b + cyc * 7, 83);
            const cx = 40 + (h % 240), cy = 52 + ((h >>> 9) % 24);
            const col = cols[(h >>> 14) % cols.length];
            const rad = Math.min(22, age * 40);
            for (let i = 0; i < 12; i++) {
                const a = i * 0.5236;
                const x = cx + Math.trunc(Math.cos(a) * rad), y = cy + Math.trunc(Math.sin(a) * rad + age * age * 8);
                s.rect(x, y, 2, 2, c[age < 0.8 ? col : age < 1.2 ? CHRDIM : STEEL]);
            }
        }
        void m;
    }

    // ------------------------------------------------------------ juice: particles and popups, all from the sim's log
    _drawParticles(s, cam, m) {
        const c = this.c;
        for (let i = m.log.length - 1; i >= 0; i--) {
            const e = m.log[i];
            const age = m.time - e.t;
            if (age > 0.9) break;
            if (age < 0) continue;
            const x = Scroll.toScreen(e.x, cam), gy = baseY(e.laneF) + this.sy - roundEven(m.track.height(e.x, e.laneF));
            const seed = Math.floor(e.t * 977);
            switch (e.kind) {
                case MudEvent.Clean: case MudEvent.Rough: {
                    if (age > 0.5) break;
                    const n = e.kind === MudEvent.Rough ? 12 : 8;
                    for (let k = 0; k < n; k++) {
                        const h = Scroll.hash(seed, k), dir = (k & 1) ? 1 : -1;
                        const vx = dir * (10 + (h % 30)), vy = 18 + ((h >>> 8) % 26);
                        const px = x + Math.trunc(vx * age), py = gy - Math.trunc(vy * age - 70 * age * age);
                        s.rect(px, py, age < 0.25 ? 2 : 1, age < 0.25 ? 2 : 1, c[k % 3 === 0 ? TANLT : k % 3 === 1 ? TAN : TANDK]);
                    }
                    break;
                }
                case MudEvent.Splash: case MudEvent.WaterIn: {
                    if (age > (e.kind === MudEvent.Splash ? 0.8 : 0.45)) break;
                    const n = e.kind === MudEvent.Splash ? 16 : 7;
                    for (let k = 0; k < n; k++) {
                        const h = Scroll.hash(seed, k + 40);
                        const vx = ((h % 60) - 30), vy = 40 + ((h >>> 8) % 50);
                        const px = x + Math.trunc(vx * age), py = gy - 2 - Math.trunc(vy * age - 120 * age * age);
                        s.rect(px, py, 2, age < 0.3 ? 2 : 1, c[k % 3 === 0 ? CHROME : k % 3 === 1 ? FOAM : WATER]);
                    }
                    if (e.kind === MudEvent.Splash) { const rr = 4 + Math.trunc(age * 30); s.rect(x - rr, gy, rr * 2, 1, c[FOAM]); }
                    break;
                }
                case MudEvent.MudIn: {
                    if (age > 0.4) break;
                    for (let k = 0; k < 6; k++) {
                        const h = Scroll.hash(seed, k + 80);
                        const vx = -10 - (h % 30), vy = 30 + ((h >>> 8) % 30);
                        s.rect(x + Math.trunc(vx * age), gy - 2 - Math.trunc(vy * age - 110 * age * age), 2, 2, c[k & 1 ? MUD : MUDDK]);
                    }
                    break;
                }
                case MudEvent.Bump: case MudEvent.Shoved: {
                    if (age > 0.3) break;
                    for (let k = 0; k < 7; k++) {
                        const a = k * 0.9 + (seed & 3);
                        const r = 3 + age * 60;
                        s.setPixel(x + 4 + Math.trunc(Math.cos(a) * r), gy - 8 + Math.trunc(Math.sin(a) * r * 0.6), c[k % 3 === 0 ? CHROME : k % 3 === 1 ? ORANGE : TANLT]);
                    }
                    break;
                }
                case MudEvent.BaleHit: {
                    if (age > 0.8) break;
                    for (let k = 0; k < 14; k++) {
                        const h = Scroll.hash(seed, k + 120);
                        const vx = 10 + (h % 70), vy = 30 + ((h >>> 8) % 50);
                        s.rect(x + 6 + Math.trunc(vx * age), gy - 6 - Math.trunc(vy * age - 90 * age * age), 2, 1, c[k & 1 ? TANLT : TAN]);
                    }
                    break;
                }
            }
        }
    }

    _drawPopups(s, cam, m, t) {
        const c = this.c;
        for (let i = m.log.length - 1; i >= 0; i--) {
            const e = m.log[i];
            const age = m.time - e.t;
            if (age > 1.6) break;
            if (age < 0) continue;
            if (e.kind === MudEvent.Extra) {
                if (age < 1.6) s.textBox('EXTRA BIKE!', 160, 66, PixelFont.Display, 2, c[CHROME], c[ORANGE], c[BG]);
                continue;
            }
            if (e.kind === MudEvent.Lap) { if (age < 1.4) s.textBox('LAP 2', 160, 66, PixelFont.Display, 2, c[CHROME], c[DUSK], c[BG]); continue; }
            if (age > 1.0) continue;
            let text = null, col = CHROME, f = PixelFont.Display, sub = null;
            if (e.kind === MudEvent.Clean) { text = '+' + e.value; col = CHROME; if (e.tag >= 2) sub = 'X' + e.tag; }
            else if (e.kind === MudEvent.Pass) { text = '+' + e.value; col = ORANGE; }
            else if (e.kind === MudEvent.Gap) { text = '+' + e.value; col = ORANGE; sub = GapNames[e.tag] || 'GAP'; }
            else if (e.kind === MudEvent.Rough) { text = 'ROUGH'; col = TANLT; f = PixelFont.Arcade; }
            else if (e.kind === MudEvent.Bump) { text = e.value > 0 ? 'BUMP +' + e.value : 'BUMP'; col = TANLT; f = PixelFont.Arcade; }
            else if (e.kind === MudEvent.Shoved) { text = 'SHOVED!'; col = ORANGE; f = PixelFont.Arcade; }
            if (text == null) continue;
            let x = Scroll.toScreen(e.x, cam) + 4;
            let y = baseY(e.laneF) + this.sy - roundEven(e.z) - 34 - Math.trunc(age * 14);
            if (e.kind === MudEvent.Gap) { y -= 6; x += 40; }
            if (y < PlayTop + 2) y = PlayTop + 2;
            s.textCenteredShadow(text, x, y, f, c[col], c[BG]);
            if (sub) s.textCenteredShadow(sub, x, y - 9, PixelFont.Arcade, c[e.kind === MudEvent.Gap ? TANLT : ORANGE], c[BG]);
        }
        // a bale beyond the right edge, in your lane: an arrow on the edge of the tube
        if (m.bales.length > 0 && m.p === MudMetalSim.Phase.Race) {
            const p = m.player;
            for (const b of m.bales) {
                if (b.down || Math.abs(b.lane - p.laneF) > 0.6) continue;
                const sx = Math.floor(b.x - b.lane * Skew - cam);
                if (sx < PlayR - 4 || sx > PlayR + 150) continue;
                if (!SurfaceDraw.blink(t, 2)) break;
                const y = baseY(b.lane) + this.sy - 8;
                s.textShadow('!', PlayR - 9, y - 4, PixelFont.Display, c[ORANGE], c[BG]);
                break;
            }
        }
    }

    // ------------------------------------------------------------ HUD
    _drawHud(s, m, t) {
        const c = this.c;
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        // top band
        s.text('1UP', 10, 9, arc, c[ORANGE]);
        const n = Math.min(5, m.tries);
        for (let i = 0; i < n; i++) s.blit(Sprites.Helmet, 32 + i * 9, 9, this.pal);
        if (m.tries > 5) s.text('+', 32 + 5 * 9, 9, arc, c[CHROME]);
        s.text(d6(m.score), 10, 18, dsp, c[CHROME], 2);
        s.textCentered('TIME', 164, 9, arc, c[CHRDIM]);
        const P = MudMetalSim.Phase;
        const close = !m.mercyActive && !m.isFinal && m.par - m.lapTime < 5 && m.p !== P.Countdown && m.p !== P.Card;
        s.textCentered(clock(m.lapTime), 164, 18, dsp, c[close ? ORANGE : CHROME], 2);
        if (m.isFinal) {
            const pos = m.place > 0 ? m.place : Math.max(1, m.position || 1);
            s.textRight('POS', 311, 9, arc, c[CHRDIM]);
            s.textRight('/' + (m.rivals.length + 1), 311, 25, arc, c[CHRDIM]);
            s.textRight(ordinal(pos), 297, 18, dsp, c[pos <= 3 ? CHROME : ORANGE], 2);
        } else {
            s.textRight('PAR', 311, 9, arc, c[CHRDIM]);
            s.textRight(clock(m.par), 311, 18, dsp, c[TANLT], 2);
        }
        s.dottedRule(8, 312, 34, 3, c[ORGDIM]);

        // bottom band: the heat gauge
        s.dottedRule(8, 312, 205, 3, c[ORGDIM]);
        const p = m.player;
        const stalled = p.stallT > 0;
        const blinkOn = SurfaceDraw.blink(t, 2);
        s.text('HEAT', 10, 214, arc, c[stalled ? RED : m.hot && blinkOn ? ORANGE : CHRDIM]);
        const segs = Math.ceil(m.heatCap - 0.001);
        for (let i = 0; i < segs; i++) {
            const x = 40 + i * 7;
            const warn = i >= segs - MudMetalSim.WarnSegments;
            const lit = p.heat > i + 0.25;
            let col;
            if (stalled) col = blinkOn ? RED : REDDIM;
            else if (warn) col = lit ? (m.hot && !blinkOn ? RED : ORANGE) : ORGDIM;
            else col = lit ? (p.inWater ? FOAM : CHROME) : STEEL;
            s.rect(x, 210, 6, 13, c[col]);
        }
        const capX = 40 + segs * 7;
        s.rect(capX, 208, 3, 17, c[RED]);
        if (m.mercyActive) s.text('FREE', capX + 6, 214, arc, c[ORANGE]);

        // the course map: the jumps, the riders, you
        const mx0 = 196, mx1 = 298, my = 223;
        s.text(m.isFinal ? 'FINAL' : 'STAGE ' + m.stage.n + '/' + m.stages.length, mx0, 209, arc, c[CHRDIM]);
        s.rect(mx0, my, mx1 - mx0, 1, c[STEEL]);
        const len = m.track.length;
        for (const f of m.track.features)
            if (f.jump) s.rect(mx0 + Math.trunc(f.x0 / len * (mx1 - mx0)), my - 2, 1, 2, c[f.kind === FeatureKind.Creek ? FOAM : TANLT]);
        if (m.track.lapAt > 0) s.rect(mx0 + Math.trunc(m.track.lapAt / len * (mx1 - mx0)), my - 4, 1, 4, c[CHROME]);
        s.rect(mx1, 209, 1, 15, c[CHROME]);
        for (let yy = 0; yy < 6; yy++) for (let xx = 0; xx < 8; xx++) s.setPixel(mx1 + 1 + xx, 209 + yy, c[(((xx >> 1) + (yy >> 1)) % 2) === 0 ? CHROME : BG]);
        for (const r of m.rivals)
            if (r.active && r.x > -40) {
                const rx = mx0 + Math.trunc(Math.max(0, Math.min(1, r.x / len)) * (mx1 - mx0));
                s.rect(rx - 1, my - 1, 3, 3, c[r.jersey === 0 ? SKY : r.jersey === 1 ? ORANGE : r.jersey === 2 ? GRASS : TANLT]);
            }
        const pxm = mx0 + Math.trunc(m.progress * (mx1 - mx0));
        s.rect(pxm - 2, my - 3, 5, 5, c[RED]);
        s.rect(pxm - 1, my - 4, 3, 1, c[CHROME]);
    }

    // ------------------------------------------------------------ plates and cards
    _drawOverlays(s, w, m, t, cam) {
        const c = this.c;
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const P = MudMetalSim.Phase;
        switch (m.p) {
            case P.Card: this._drawStageCard(s, w, m, t); return;
            case P.Countdown: {
                s.textCenteredShadow(String(m.countdownLeft), 160, 42, dsp, c[CHROME], c[BG], 5);
                const q = m.isFinal ? 'FINISH IN THE TOP 3' : 'QUALIFY UNDER ' + clock(m.par);
                const wd = arc.measure(q) + 16;
                s.plate(160 - Math.trunc(wd / 2), 82, wd, 17, c[BG], c[ORANGE]);
                s.textCentered(q, 160, 87, arc, c[TANLT]);
                if (m.mercyActive) s.textCenteredShadow('FREE RIDE', 160, 100, arc, c[ORANGE], c[BG]);
                if (SurfaceDraw.blink(t, 1)) {
                    const px = Scroll.toScreen(m.player.x, cam);
                    s.textCenteredShadow('YOU', px, baseY(m.player.laneF) - 40, arc, c[RED], c[BG]);
                }
                return;
            }
            case P.Race:
                if (m.phaseTime < 0.8 && m.crashes === 0 && m.lapTime < 1)
                    s.textCenteredShadow('GO!', 160, 42, dsp, c[ORANGE], c[BG], 5);
                if (m.player.stallT > 0) {
                    s.textBox('OVERHEAT', 160, 48, dsp, 2, c[ORANGE], c[ORANGE], c[BG]);
                    this._label(s, 'ENGINE STALLED', 72, CHROME);
                }
                return;
            case P.Crash: {
                const K = MudMetalSim.CrashKind;
                const big = m.lastCrash === K.Splash ? 'SPLASH!' : 'CRASH!';
                s.textBox(big, 160, 46, dsp, 3, c[CHROME], m.lastCrash === K.Splash ? c[WATER] : c[RED], c[BG]);
                const why = m.lastCrash === K.Clip ? 'CLIPPED A RIDER' : m.lastCrash === K.Splash ? 'TOO SLOW FOR THE CREEK' :
                    m.lastCrash === K.Bale ? 'HAY BALE!' : 'LAND IT LEVEL!';
                this._label(s, why, 78, TANLT);
                return;
            }
            case P.Finish: this._drawFinish(s, w, m, t); return;
            case P.Fail: this._drawFail(s, m, t); return;
            default: this._drawResult(s, w, m, t);
        }
    }

    // a line of text on a strip of the tube's black (it has to read over a busy crowd)
    _label(s, text, y, col) {
        const c = this.c, wd = PixelFont.Arcade.measure(text) + 8;
        s.rect(160 - Math.trunc(wd / 2), y - 3, wd, 13, c[BG]);
        s.textCentered(text, 160, y, PixelFont.Arcade, c[col]);
    }

    // a 50 % dither of the tube's black over the play area: the track behind a card
    _dim(w, x0, y0, x1, y1) {
        const v = this.k[BG];
        for (let y = y0; y < y1; y++) {
            const o = y * SW;
            for (let x = x0 + ((x0 + y) & 1); x < x1; x += 2) w[o + x] = v;
        }
    }

    _plate(s, w, x, y, wd, h) {
        const c = this.c;
        this._dim(w, PlayL, PlayTop, PlayR, PlayBottom);
        s.rect(x, y, wd, h, c[BG]);
        s.frame(x, y, wd, h, c[ORANGE]);
        s.frame(x + 2, y + 2, wd - 4, h - 4, c[ORGDIM]);
    }

    _helmets(s, cx, y, n, blinkLast, t) {
        const total = Math.min(6, n);
        const x0 = cx - Math.trunc((total * 9 - 2) / 2);
        for (let i = 0; i < total; i++) {
            if (blinkLast && i === total - 1 && !SurfaceDraw.blink(t, 2)) continue;
            s.blit(Sprites.Helmet, x0 + i * 9, y, this.pal);
        }
    }

    _drawStageCard(s, w, m, t) {
        const c = this.c, dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const st = m.stage;
        const x0 = 32, y0 = 44, wd = 256, h = 148;
        this._plate(s, w, x0, y0, wd, h);
        s.textCentered(st.final ? 'THE FINAL' : 'STAGE ' + st.n, 160, y0 + 9, dsp, c[ORANGE], 2);
        const k = dsp.measure(st.name, 2) <= wd - 20 ? 2 : 1;
        s.textCentered(st.name, 160, y0 + (k === 2 ? 30 : 34), dsp, c[CHROME], k);
        s.dottedRule(x0 + 16, x0 + wd - 16, y0 + 50, 3, c[ORGDIM]);
        const parts = st.hint.split('. ');
        for (let i = 0; i < parts.length; i++) s.textCentered(parts[i] + (i < parts.length - 1 ? '.' : ''), 160, y0 + 58 + i * 10, arc, c[TANLT]);
        const q = st.final ? 'FINISH IN THE TOP 3' : 'QUALIFY UNDER ' + clock(m.par);
        s.textCentered(q, 160, y0 + 84, arc, c[CHROME]);
        s.textCentered('RECORD ' + clock(st.record), 160, y0 + 96, arc, c[CHRDIM]);
        this._helmets(s, 160, y0 + 110, m.tries, false, t);
        if (m.attempt > 1) s.textCentered('TRY ' + m.attempt, 160, y0 + 120, arc, c[ORANGE]);
        // the championship so far: a pip a track
        const pw = 14, gap = 6, px0 = 160 - Math.trunc((m.stages.length * (pw + gap) - gap) / 2);
        for (let i = 0; i < m.stages.length; i++) {
            const x = px0 + i * (pw + gap), y = y0 + h - 14;
            if (i < m.stageIdx) s.rect(x, y, pw, 6, c[ORANGE]);
            else if (i === m.stageIdx) { if (SurfaceDraw.blink(t, 2)) s.rect(x, y, pw, 6, c[CHROME]); else s.frame(x, y, pw, 6, c[CHROME]); }
            else s.frame(x, y, pw, 6, c[STEEL]);
        }
        if (m.mercyActive) s.textCenteredShadow('FREE RIDE', 160, y0 + h + 4, arc, c[ORANGE], c[BG]);
    }

    _drawFinish(s, w, m, t) {
        const c = this.c, dsp = PixelFont.Display, arc = PixelFont.Arcade;
        if (m.phaseTime < 1.3) {
            s.textBox(m.isFinal ? ordinal(m.place) + ' PLACE!' : 'FINISH!', 160, 46, dsp, 3, c[CHROME], c[ORANGE], c[BG]);
            return;
        }
        const x0 = 36, y0 = 44, wd = 248;
        const rows = m.tally;
        let h = 40;
        for (const r of rows) h += r.big ? 20 : 13;
        h += 18;
        this._plate(s, w, x0, y0, wd, h);
        s.textCentered(m.isFinal ? 'THE FINAL' : 'STAGE ' + m.stage.n + ' CLEAR', 160, y0 + 9, dsp, c[ORANGE], 2);
        let y = y0 + 32;
        for (let i = 0; i < rows.length && i < m.tallyShown; i++) {
            const r = rows[i];
            const col = r.record ? (SurfaceDraw.blink(t, 2) ? ORANGE : TANLT) : CHRDIM;
            s.text(r.label, x0 + 14, r.big ? y + 4 : y, arc, c[col]);
            if (r.big) s.textRight(r.value, x0 + wd - 14, y, dsp, c[CHROME], 2);
            else if (r.pts > 0) s.textRight('+' + r.pts, x0 + wd - 14, y, arc, c[r.record ? ORANGE : CHROME]);
            else if (r.value) s.textRight(r.value, x0 + wd - 14, y, arc, c[CHROME]);
            y += r.big ? 20 : 13;
        }
        if (m.tallyShown >= rows.length) {
            const next = m.stageIdx + 1 < m.stages.length ? 'NEXT  ' + m.stages[m.stageIdx + 1].name : 'THE CUP IS YOURS';
            s.textCentered(next, 160, y0 + h - 14, arc, c[TANLT]);
        }
    }

    _drawFail(s, m, t) {
        const c = this.c, dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const F = MudMetalSim.FailKind;
        const big = m.fail === F.TimeOver ? 'TIME OVER' : m.fail === F.EngineBlown ? 'ENGINE BLOWN' : 'BEATEN';
        s.textBox(big, 160, 50, dsp, m.fail === F.EngineBlown ? 2 : 3, c[ORANGE], c[RED], c[BG]);
        const why = m.fail === F.Beaten ? 'THREE RIDERS FINISHED FIRST' : m.fail === F.EngineBlown ? 'YOU COASTED OVER THE LINE' : 'YOU MISSED THE PAR';
        const left = m.tries - 1;
        const tl = left > 0 ? (left === 1 ? 'LAST TRY LEFT' : left + ' TRIES LEFT') : 'NO TRIES LEFT';
        const pw = arc.measure(why) + 16;
        s.plate(160 - Math.trunc(pw / 2), 80, pw, m.phaseTime > 0.8 ? 44 : 14, c[BG], c[ORGDIM]);
        s.textCentered(why, 160, 84, arc, c[TANLT]);
        if (m.phaseTime > 0.8) {
            s.textCentered(tl, 160, 97, arc, c[left > 0 ? CHROME : RED]);
            this._helmets(s, 160, 110, m.tries, true, t);
        }
    }

    _drawResult(s, w, m, t) {
        const c = this.c, dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const won = m.roundWon;
        const x0 = 32, y0 = won ? 96 : 40, wd = 256, h = won ? 100 : 156;
        if (won) {
            this._dim(w, PlayL, PlayTop, PlayR, PlayBottom);
            s.clip(PlayL, PlayTop, PlayR - PlayL, PlayBottom - PlayTop);
            this._drawFireworks(s, m, m.p === MudMetalSim.Phase.Over ? 3 : m.phaseTime + 2);
            s.noClip();
            s.blit(Sprites.Cup, 160 - 24, 46, this.pal, 3);
            s.rect(x0, y0, wd, h, c[BG]); s.frame(x0, y0, wd, h, c[ORANGE]); s.frame(x0 + 2, y0 + 2, wd - 4, h - 4, c[ORGDIM]);
            s.textCentered(MudMetalSpec.roundWonText, 160, y0 + 10, dsp, c[ORANGE], 3);
            s.textCentered('THE REDLINE CUP IS YOURS', 160, y0 + 36, arc, c[TANLT]);
            s.textCentered('FINAL PLACE ' + ordinal(m.place), 160, y0 + 50, arc, c[CHROME]);
        } else {
            this._plate(s, w, x0, y0, wd, h);
            s.textCentered(MudMetalSpec.roundLostText, 160, y0 + 12, dsp, c[ORANGE], 3);
            s.textCentered('YOU REACHED STAGE ' + m.stage.n, 160, y0 + 44, arc, c[CHROME]);
            s.textCentered(m.stage.name, 160, y0 + 56, dsp, c[TANLT], 2);
            s.textCentered('TRACKS CLEARED ' + m.st.cleared + ' OF ' + m.stages.length, 160, y0 + 80, arc, c[CHRDIM]);
            // the championship so far
            const pw = 14, gap = 6, px0 = 160 - Math.trunc((m.stages.length * (pw + gap) - gap) / 2);
            for (let i = 0; i < m.stages.length; i++) {
                const x = px0 + i * (pw + gap), y = y0 + 96;
                if (m.st.clr[i]) s.rect(x, y, pw, 6, c[ORANGE]); else s.frame(x, y, pw, 6, c[i === m.stageIdx ? RED : STEEL]);
            }
        }
        s.rect(x0 + 16, y0 + h - 30, wd - 32, 1, c[ORGDIM]);
        s.text('SCORE', x0 + 16, y0 + h - 21, arc, c[ORANGE]);
        s.textRight(d6(m.score), x0 + wd - 16, y0 + h - 24, dsp, c[CHROME], 2);
        void t;
    }
}
