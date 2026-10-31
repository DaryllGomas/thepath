// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE PICTURE.
// Started as a port of HyperDriftRenderer.cs (Staging/Batch3/hyperdrift); the rally gave it four more
// countries, the dark, the weather, the cards and the tallies.
//
// The cabinet art's look, on a 320x240 tube: a grey road winding over the country of each leg, kerbs,
// white edge lines and centre dashes, your yellow car, red traffic going your way and blue coming at you.
//   - HUD band y 8..30: 1UP + score (display digits x2) and your cars, TIME + the clock (display digits
//     x3, orange under 10 s, a 1 Hz blink under 5), the leg bar to the checkpoint flag (the extend gate
//     ticked, the rival on it in the dash), the leg and the speed
//   - the playfield x 8..311, y 34..231, drawn a row at a time from the track tables: the ground (sand,
//     the city's roofs and cross streets, the sea and the beach, snow, the canyon floor and its walls),
//     water under the bridges, kerbs (snowbanks in the pass) or rails or tunnel walls, asphalt, edge lines,
//     dashes, the ramps and the crevasses, the start and checkpoint checks, hatching where the works shut
//     the lane. Rows are widened by the slope, so a hairpin keeps its width.
//   - THE DARK (the city): every row is drawn dark, then again in the light where light falls: your
//     headlights' cone, the glow round your car, the street lamps' pools, the other cars' lamps, the lit
//     tunnels. A car out of the light shows only its lamps.
//   - skid marks, pads, hazards, scenery, signs, cones, traffic and your car (24-frame rotation caches),
//     the rival, rocks falling on their shadows, particles (smoke and dust are the arcade's 50 % checker,
//     never a blend), the rain and the snow
//   - warnings at the top edge (oncoming arrows, falling rocks, the rival), popups, notices, the leg
//     card, the countdown, the tally plate, WRECKED / OUT OF TIME, GAME OVER and the result card
// Every colour is a palette entry; the outer 8 px stay background. It reads the sim, never writes it.
import { f32, idiv, d6, dn, fmt, F32, roundEven, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { HyperDriftPalette } from './spec.js';
import { HyperDriftSprites, frameFor, blitCentred } from './sprites.js';
import { HyperDriftTrack, HyperDriftScroll, ZoneKind, PropKind } from './track.js';
import { HyperDriftSim } from './sim.js';
import { LEGS, Terrain } from './legs.js';

const PX0 = HyperDriftScroll.PX0, PX1 = HyperDriftScroll.PX1, PY0 = HyperDriftScroll.PY0, PY1 = HyperDriftScroll.PY1;
const CarY = HyperDriftScroll.CarY;
const Phase = HyperDriftSim.Phase, SpinCause = HyperDriftSim.SpinCause, WreckCause = HyperDriftSim.WreckCause;
const HazardKind = HyperDriftSim.HazardKind, VehKind = HyperDriftSim.VehKind, Fx = HyperDriftSim.Fx;
const FlagBridge = HyperDriftTrack.FlagBridge, FlagRiver = HyperDriftTrack.FlagRiver, FlagTunnel = HyperDriftTrack.FlagTunnel;
const FlagGap = HyperDriftTrack.FlagGap, FlagRamp = HyperDriftTrack.FlagRamp;
const HK = HyperDriftTrack.HalfWidth + HyperDriftTrack.Kerb;
const screenY = HyperDriftScroll.screenY;
const W = PX1 - PX0;

function mod(a, m) { const k = a % m; return k < 0 ? k + m : k; }

function hash(x, y) {
    let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
    h ^= h >> 13; h = Math.imul(h, 1274126177); h ^= h >> 16;
    return h & 0x7fffffff;
}

// C# float.ToString("00.0")
function fmt00_0(v) {
    const t = fmt(v, 1, F32);
    const neg = t[0] === '-', body = neg ? t.slice(1) : t;
    const dot = body.indexOf('.');
    return (neg ? '-' : '') + (dot < 2 ? '0'.repeat(2 - dot) : '') + body;
}

export class HyperDriftRenderer {
    constructor() {
        const pal = HyperDriftPalette;
        this.pal = pal;
        this.cBg = pal.get('bg'); this.cAsph = pal.get('asphalt'); this.cAsphD = pal.get('asphaltDark'); this.cWhite = pal.get('white');
        this.cOrange = pal.get('orange'); this.cOrangeD = pal.get('orangeDark'); this.cYellow = pal.get('yellow'); this.cYellowD = pal.get('yellowDark');
        this.cGreen = pal.get('green'); this.cGreenD = pal.get('greenDark'); this.cRed = pal.get('red'); this.cRedD = pal.get('redDark');
        this.cBlue = pal.get('blue'); this.cBlueD = pal.get('blueDark'); this.cGrey = pal.get('grey');
        this.cNight = pal.get('night'); this.cNightB = pal.get('nightBlue'); this.cPurple = pal.get('purple'); this.cPurpleD = pal.get('purpleDark');
        this.cIce = pal.get('ice'); this.cSnow = pal.get('snow'); this.cSnowS = pal.get('snowShade'); this.cSand = pal.get('sand');
        this._pt = { x: 0, s: 0 };
        this._ga = { on: false, l: 0, r: 0, kw: 0, ew: 0, dl: 0, dr: 0, arc: 0 };
        this._gb = { on: false, l: 0, r: 0, kw: 0, ew: 0, dl: 0, dr: 0, arc: 0 };
        this._spans = new Int32Array(48);
        this._lamp = [0, 0];
        this._cones = [];                  // the frame's lights: { y0, y1, dir, x, tx, h0, hg }
        this._glow = { x: 0, y: 0, r: 0 };
        this._night = false;
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.p === Phase.Idle) return;
        t = f32(t);
        const tr = r.track;
        let cam = r.s;
        if (r.shake > 0) cam = f32(cam + roundEven(f32(Math.sin(t * 61) * f32(3 * Math.min(1, f32(r.shake / 0.3))))));
        this._night = tr.terrain === Terrain.City;
        if (this._night) this._lights(r, tr, cam);

        s.clip(PX0, PY0, PX1 - PX0, PY1 - PY0);
        this._drawRows(s, r, tr, cam, t);
        this._drawPads(s, r, tr, cam, t);
        this._drawSkids(s, r, cam);
        this._drawHazards(s, r, cam);
        this._drawProps(s, tr, cam, t);
        this._drawTraffic(s, r, cam, t);
        this._drawRival(s, r, cam);
        this._drawCar(s, r, cam, t);
        this._drawRocks(s, r, cam);
        this._drawFx(s, r, cam, tr);
        this._drawGantry(s, tr, cam, tr.checkpoint + 26, r.finalLeg ? 'GOAL' : 'CHECKPOINT', this.cYellow);
        this._drawGantry(s, tr, cam, tr.extend + 14, tr.dash > 0 ? 'FINAL DASH' : 'EXTEND', tr.dash > 0 ? this.cPurple : this.cIce);
        this._drawGantry(s, tr, cam, HyperDriftTrack.StartS + 30, 'LEG ' + r.legNo, this.cYellow);
        this._drawWeather(s, tr, t);
        this._drawPopups(s, r, cam);
        this._drawWarnings(s, r, cam, t);
        if (r.flash > 0) { s.frame(PX0, PY0, W, PY1 - PY0, this.cWhite); s.frame(PX0 + 1, PY0 + 1, W - 2, PY1 - PY0 - 2, this.cYellow); }
        s.noClip();

        this._drawHud(s, r, t);
        this._drawOverlays(s, r, t, cam);
    }

    // ------------------------------------------------------------------ the road, a row at a time
    _geometry(tr, si, branch, sp) {
        sp.on = false;
        if (branch === 2 && !(tr.hasFork(si) && tr.hasFork(si + 1))) return sp;
        const c0 = tr.centreX(si, branch), c1 = tr.centreX(si + 1, branch);
        const f = tr.fOf(si, branch);
        const hw = f32(HyperDriftTrack.HalfWidth * f);
        const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
        sp.on = true;
        sp.l = roundEven(f32(lo - hw)); sp.r = roundEven(f32(hi + hw));
        sp.kw = Math.max(3, roundEven(f32(HyperDriftTrack.Kerb * f)));
        sp.ew = Math.max(1, roundEven(f));
        const dw = Math.max(2, roundEven(f32(2 * f)));
        sp.dl = roundEven(lo) - idiv(dw, 2); sp.dr = roundEven(hi) + (dw - idiv(dw, 2));
        sp.arc = tr.arc(si);
        return sp;
    }

    _drawRows(s, r, tr, cam, t) {
        const T = tr.terrain, sp = this._spans;
        for (let y = PY0; y < PY1; y++) {
            const si = Math.floor(f32(cam + (CarY - y)));
            const fl = tr.flagsAt(si);
            const a = this._geometry(tr, si, 1, this._ga);
            const b = this._geometry(tr, si, 2, this._gb);
            this._ground(s, tr, T, y, si, fl, a, t);
            if ((fl & FlagGap) !== 0) { this._gapRow(s, tr, y, si); continue; }
            if (this._night && (fl & FlagTunnel) === 0) {
                this._road(s, tr, T, y, si, fl, a, b, true);
                const n = this._litSpans(tr, y, si);
                for (let k = 0; k < n; k += 2) {
                    const x0 = Math.max(PX0, sp[k]), x1 = Math.min(PX1, sp[k + 1]);
                    if (x1 <= x0) continue;
                    s.clip(x0, y, x1 - x0, 1);
                    this._road(s, tr, T, y, si, fl, a, b, false);
                }
                s.clip(PX0, PY0, PX1 - PX0, PY1 - PY0);
            } else this._road(s, tr, T, y, si, fl, a, b, false);

            // the start line and the checkpoint line: a band of 4 px checks
            this._checks(s, y, si, a, HyperDriftTrack.StartS - 3, HyperDriftTrack.StartS + 4);
            this._checks(s, y, si, a, tr.checkpoint, tr.checkpoint + 8);
        }
    }

    // ---- the country either side of the road
    _ground(s, tr, T, y, si, fl, a, t) {
        if ((fl & FlagRiver) !== 0) {
            // water under a bridge (the desert's river, the coast's inlets)
            s.rect(PX0, y, W, 1, this.cBlueD);
            const sh = T === Terrain.Coast ? Math.trunc(t * 7) : 0;
            if (mod(si, 6) === 0) { const off = mod(si * 37 + sh, 23); for (let x = PX0 + off - 23; x < PX1; x += 23) s.rect(x, y, 5, 1, this.cBlue); }
            else if (mod(si, 6) === 3) { const off = mod(si * 53 + 11 - sh, 29); for (let x = PX0 + off - 29; x < PX1; x += 29) s.rect(x, y, 3, 1, this.cBlue); }
            return;
        }
        switch (T) {
            case Terrain.City: this._cityGround(s, tr, y, si, fl); return;
            case Terrain.Coast: this._coastGround(s, tr, y, si, a, t); return;
            case Terrain.Snow: {
                s.rect(PX0, y, W, 1, this.cSnow);
                for (let x = PX0; x < PX1; x += 2) {
                    const h = hash(x >> 1, si >> 1);
                    if (h % 9 === 0) s.setPixel(x + ((h >> 8) & 1), y, this.cSnowS);
                }
                return;
            }
            case Terrain.Canyon: this._canyonGround(s, tr, y, si); return;
            default: {
                const bank = tr.isRiver(si - 4) || tr.isRiver(si + 4);
                s.rect(PX0, y, W, 1, bank ? this.cOrangeD : this.cOrange);
                if (!bank)
                    for (let x = PX0; x < PX1; x += 2) {
                        const h = hash(x >> 1, si >> 1);
                        if (h % 11 === 0) s.setPixel(x + ((h >> 8) & 1), y, this.cOrangeD);
                    }
            }
        }
    }

    // the city from above at night: roofs in blocks, cross streets, a lit skylight here and there
    _cityGround(s, tr, y, si, fl) {
        if ((fl & FlagTunnel) !== 0) { s.rect(PX0, y, W, 1, this.cBg); return; }
        const block = si >> 6, inb = si & 63;
        if (inb < 10) {
            s.rect(PX0, y, W, 1, this.cAsphD);
            if (inb === 4 || inb === 5) for (let x = PX0 + (block & 7); x < PX1; x += 12) s.rect(x, y, 5, 1, this.cNight);
            return;
        }
        s.rect(PX0, y, W, 1, this.cNight);
        let x = PX0 - (hash(block, 99) % 24);
        for (let col = 0; x < PX1; col++) {
            const h = hash(block * 31 + col, 7);
            const w = 22 + (h % 19);
            const c = (h >> 6) % 3 === 0 ? this.cPurpleD : (h >> 6) % 3 === 1 ? this.cNightB : this.cAsphD;
            const x0 = x + 2, x1 = x + w - 2;
            if (inb === 10 || inb === 63) s.rect(x0, y, x1 - x0, 1, this.cBg);
            else {
                s.rect(x0, y, x1 - x0, 1, c);
                const row = inb - 14;
                if (row >= 0 && row % 9 < 2)
                    for (let k = 0, wx = x0 + 3; wx < x1 - 3; k++, wx += 6) {
                        const hh = hash(h + k, row >> 3);
                        if ((hh & 7) < 3) s.rect(wx, y, 2, 1, (hh & 8) !== 0 ? this.cYellow : this.cOrange);
                    }
            }
            x += w;
        }
    }

    // the coast: the sea on the left (foam at the beach), sand, the road, dune grass on the right
    _coastGround(s, tr, y, si, a, t) {
        const shore = roundEven(tr.shore(si));
        s.rect(PX0, y, W, 1, this.cSand);
        if (shore > PX0) {
            s.rect(PX0, y, shore - PX0, 1, this.cBlueD);
            const sh = Math.trunc(t * 9);
            if (mod(si, 7) === 0) { const off = mod(si * 41 + sh, 26); for (let x = PX0 + off - 26; x < shore - 6; x += 26) s.rect(x, y, 6, 1, this.cBlue); }
            const foam = mod(si + Math.trunc(t * 6), 8) < 4;
            s.rect(shore - 3, y, 3, 1, foam ? this.cWhite : this.cIce);
            if (mod(si * 3 + Math.trunc(t * 4), 11) < 3) s.rect(shore - 6, y, 2, 1, this.cIce);
        }
        if (a.on) {
            const g0 = a.r + a.kw + 9;
            if (g0 < PX1) {
                s.rect(g0, y, PX1 - g0, 1, this.cGreenD);
                for (let x = g0; x < PX1; x += 2) {
                    const h = hash(x >> 1, si >> 1);
                    if (h % 7 === 0) s.setPixel(x + ((h >> 8) & 1), y, this.cGreen);
                }
            }
        }
    }

    // the canyon: a red floor with its grit, the walls rising either side
    _canyonGround(s, tr, y, si) {
        s.rect(PX0, y, W, 1, this.cOrangeD);
        for (let x = PX0; x < PX1; x += 2) {
            const h = hash(x >> 1, si >> 1);
            if (h % 10 === 0) s.setPixel(x + ((h >> 8) & 1), y, this.cRedD);
        }
        const wl = roundEven(tr.wallL(si)), wr = roundEven(tr.wallR(si));
        if (wl > PX0) {
            s.rect(PX0, y, wl - PX0, 1, this.cRedD);
            if (mod(si, 9) === 0) for (let x = PX0 + mod(si * 7, 13); x < wl - 4; x += 13) s.rect(x, y, 4, 1, this.cBg);
            s.rect(wl - 2, y, 2, 1, this.cOrange);
        }
        if (wr < PX1) {
            s.rect(wr, y, PX1 - wr, 1, this.cRedD);
            if (mod(si, 9) === 4) for (let x = wr + 4 + mod(si * 5, 11); x < PX1; x += 11) s.rect(x, y, 4, 1, this.cBg);
            s.rect(wr, y, 2, 1, this.cBg);
        }
    }

    // a crevasse: black across the whole floor, its near lip lit, its far edge in shadow
    _gapRow(s, tr, y, si) {
        s.rect(PX0, y, W, 1, this.cBg);
        const g = tr.nextGap(si - 60);
        if (g === null) return;
        if (si <= g.lip + 1) s.rect(PX0, y, W, 1, this.cOrange);
        else if (si >= g.s1 - 2) s.rect(PX0, y, W, 1, this.cRedD);
        else if (mod(si, 5) === 0) for (let x = PX0 + mod(si * 13, 17); x < PX1; x += 17) s.rect(x, y, 3, 1, this.cRedD);
    }

    // ---- the road itself (kerbs, asphalt, works hatching, ramps, dashes); `dark` = the night's unlit pass
    _road(s, tr, T, y, si, fl, a, b, dark) {
        this._kerbs(s, y, si, a, fl, T, dark); this._kerbs(s, y, si, b, fl, T, dark);
        this._asphalt(s, y, si, a, T, dark); this._asphalt(s, y, si, b, T, dark);
        const co = tr.coneOff(si);
        if (!Number.isNaN(co) && a.on) {
            const lineX = roundEven(f32(tr.cx(si) + f32(co * tr.f(si))));
            for (let x = lineX + 2; x < a.r - a.ew; x++)
                if (mod(x + si, 8) < 2) s.setPixel(x, y, this.cOrangeD);
        }
        if ((fl & FlagRamp) !== 0 && a.on) {
            for (let x = a.l; x < a.r; x++) s.setPixel(x, y, ((x + si) >> 2 & 1) === 0 ? this.cYellow : this.cBg);
            return;
        }
        this._dashes(s, y, a, dark); this._dashes(s, y, b, dark);
    }

    _kerbs(s, y, si, sp, fl, T, dark) {
        if (!sp.on) return;
        if ((fl & FlagBridge) !== 0) {
            const post = mod(Math.trunc(sp.arc), 12) < 2;
            const rail = post ? this.cGrey : this.cWhite;
            s.rect(sp.l - sp.kw, y, sp.kw, 1, rail); s.rect(sp.r, y, sp.kw, 1, rail);
            s.setPixel(sp.l - sp.kw - 1, y, post ? this.cGrey : this.cBg); s.setPixel(sp.r + sp.kw, y, post ? this.cGrey : this.cBg);
            return;
        }
        if ((fl & FlagTunnel) !== 0) {
            // the tunnel's walls: concrete, a sodium lamp every so often
            const lamp = mod(Math.trunc(sp.arc), 30) < 3;
            s.rect(sp.l - sp.kw - 2, y, sp.kw + 2, 1, this.cGrey); s.rect(sp.r, y, sp.kw + 2, 1, this.cGrey);
            s.rect(sp.l - sp.kw - 3, y, 1, 1, this.cAsph); s.rect(sp.r + sp.kw + 2, y, 1, 1, this.cAsph);
            if (lamp) { s.rect(sp.l - sp.kw - 1, y, 2, 1, this.cOrange); s.rect(sp.r + sp.kw - 1, y, 2, 1, this.cOrange); }
            return;
        }
        const on = (Math.trunc(f32(sp.arc / 6)) & 1) === 0;
        switch (T) {
            case Terrain.City: {
                // a kerb, then the pavement
                const kc = dark ? this.cAsph : this.cGrey, pc = dark ? this.cAsphD : this.cAsph;
                s.rect(sp.l - sp.kw - 8, y, 8, 1, pc); s.rect(sp.r + sp.kw, y, 8, 1, pc);
                if (!dark && mod(Math.trunc(sp.arc), 16) === 0) { s.rect(sp.l - sp.kw - 8, y, 8, 1, this.cAsphD); s.rect(sp.r + sp.kw, y, 8, 1, this.cAsphD); }
                s.rect(sp.l - sp.kw, y, sp.kw, 1, kc); s.rect(sp.r, y, sp.kw, 1, kc);
                return;
            }
            case Terrain.Coast: { const k = on ? this.cRed : this.cWhite; s.rect(sp.l - sp.kw, y, sp.kw, 1, k); s.rect(sp.r, y, sp.kw, 1, k); return; }
            case Terrain.Snow: {
                // snowbanks: wider, lumpy
                const bump = (hash(Math.trunc(f32(sp.arc / 5)), 3) & 3);
                const kw = sp.kw + 1 + bump;
                s.rect(sp.l - kw, y, kw, 1, this.cSnowS); s.rect(sp.r, y, kw, 1, this.cSnowS);
                s.rect(sp.l - kw, y, 2, 1, this.cWhite); s.rect(sp.r + kw - 2, y, 2, 1, this.cWhite);
                return;
            }
            case Terrain.Canyon: { const k = on ? this.cOrange : this.cBg; s.rect(sp.l - sp.kw, y, sp.kw, 1, k); s.rect(sp.r, y, sp.kw, 1, k); return; }
            default: { const k = on ? this.cYellow : this.cBg; s.rect(sp.l - sp.kw, y, sp.kw, 1, k); s.rect(sp.r, y, sp.kw, 1, k); }
        }
    }

    _asphalt(s, y, si, sp, T, dark) {
        if (!sp.on) return;
        if (dark) {
            s.rect(sp.l, y, sp.r - sp.l, 1, this.cAsphD);
            s.rect(sp.l, y, sp.ew, 1, this.cAsph); s.rect(sp.r - sp.ew, y, sp.ew, 1, this.cAsph);
            return;
        }
        s.rect(sp.l, y, sp.r - sp.l, 1, this.cAsph);
        // specks: grit; wet (the coast) more of them; the snow's dusting
        const every = T === Terrain.Coast ? 9 : 17, speck = T === Terrain.Snow ? this.cSnowS : this.cAsphD;
        for (let x = sp.l + 2; x < sp.r - 2; x += 3) {
            const h = hash(x >> 1, si);
            if (h % every === 0) s.setPixel(x, y, speck);
        }
        s.rect(sp.l, y, sp.ew, 1, this.cWhite);
        s.rect(sp.r - sp.ew, y, sp.ew, 1, this.cWhite);
    }

    _dashes(s, y, sp, dark) {
        if (!sp.on) return;
        if (dark) {
            // cat's eyes: a glint every 20 px of road
            if (mod(Math.trunc(sp.arc), 20) < 2) s.rect(sp.dl, y, sp.dr - sp.dl, 1, this.cYellowD);
            return;
        }
        if ((Math.trunc(f32(sp.arc / 10)) & 1) !== 0) return;
        s.rect(sp.dl, y, sp.dr - sp.dl, 1, this.cWhite);
    }

    _checks(s, y, si, sp, s0, s1) {
        if (!sp.on || si < s0 || si >= s1) return;
        const row = (si - s0) >> 2;
        for (let x = sp.l; x < sp.r; x++)
            s.setPixel(x, y, ((((x - sp.l) >> 2) + row) & 1) === 0 ? this.cWhite : this.cBg);
    }

    // ------------------------------------------------------------------ the dark: where the light falls
    _lights(r, tr, cam) {
        const C = this._cones;
        C.length = 0;
        const carY = screenY(r.s, cam);
        const wreck = r.p === Phase.Wreck && r.wreckCause !== WreckCause.Beaten;
        this._glow.x = roundEven(r.x); this._glow.y = carY; this._glow.r = wreck ? 18 : 15;
        if (!wreck) {
            const a = r.spinning ? r.spinAngle : r.bodyAngle;
            const c = Math.cos(a), sn = Math.sin(a);
            if (c > 0.35) C.push({ y0: carY - 11, len: 118, dir: -1, x: f32(r.x + sn * 11), tx: Math.max(-1.6, Math.min(1.6, sn / c)), h0: 6, hg: 0.42 });
            else if (c < -0.35) C.push({ y0: carY + 11, len: 60, dir: 1, x: f32(r.x + sn * 11), tx: Math.max(-1.6, Math.min(1.6, -sn / c)), h0: 6, hg: 0.42 });
        }
        for (const v of r.traffic) {
            const vy = screenY(v.s, cam);
            if (vy < PY0 - 80 || vy > PY1 + 70 || v.parked) continue;
            if (v.dir < 0) C.push({ y0: vy + 10, len: 64, dir: 1, x: v.x, tx: 0, h0: 4, hg: 0.38 });
            else C.push({ y0: vy - 10, len: 52, dir: -1, x: v.x, tx: 0, h0: 4, hg: 0.38 });
        }
    }

    // the lit stretches of row y (pairs x0, x1 in this._spans); returns the count of numbers written
    _litSpans(tr, y, si) {
        const sp = this._spans;
        let n = 0;
        const G = this._glow, dy = y - G.y;
        if (dy * dy <= G.r * G.r) { const c = Math.trunc(Math.sqrt(G.r * G.r - dy * dy)); sp[n++] = G.x - c; sp[n++] = G.x + c + 1; }
        for (const c of this._cones) {
            const d = (y - c.y0) * c.dir;
            if (d < 0 || d > c.len) continue;
            const cx = c.x + d * c.tx, h = c.h0 + d * c.hg;
            sp[n++] = roundEven(cx - h); sp[n++] = roundEven(cx + h) + 1;
            if (n >= 44) break;
        }
        if (tr.lampSpan(si, 0, this._lamp)) { sp[n++] = this._lamp[0]; sp[n++] = this._lamp[1]; }
        if (tr.lampSpan(si, 1, this._lamp)) { sp[n++] = this._lamp[0]; sp[n++] = this._lamp[1]; }
        return n;
    }

    _isLit(tr, x, y, cam) {
        if (!this._night) return true;
        const si = Math.floor(f32(cam + (CarY - y)));
        if (tr.isTunnel(si)) return true;
        const n = this._litSpans(tr, y, si), sp = this._spans;
        for (let k = 0; k < n; k += 2) if (x >= sp[k] - 3 && x < sp[k + 1] + 3) return true;
        return false;
    }

    // ------------------------------------------------------------------ marks, paint, hazards, things
    _drawSkids(s, r, cam) {
        const pt = this._pt;
        const c = r.track.terrain === Terrain.Snow ? this.cSnowS : this.cAsphD;
        for (let i = 0; i < r.skidCount; i++) {
            r.skidAt(i, pt);
            const y = screenY(pt.s, cam);
            if (y < PY0 - 2 || y > PY1 + 2) continue;
            s.rect(roundEven(pt.x) - 1, y - 1, 2, 2, c);
        }
    }

    _drawPads(s, r, tr, cam, t) {
        for (let i = 0; i < tr.pads.length; i++) {
            const p = tr.pads[i];
            const y = screenY(p.s, cam);
            if (y < PY0 - 12 || y > PY1 + 12) continue;
            if (this._night && !this._isLit(tr, roundEven(p.x), y, cam) && r.padTaken[i]) continue;
            blitCentred(s, HyperDriftSprites.Pad, p.x, y, this.pal);
        }
    }

    _drawHazards(s, r, cam) {
        const S = HyperDriftSprites;
        for (const o of r.hazards) {
            const y = screenY(o.s, cam);
            if (y < PY0 - 12 || y > PY1 + 12) continue;
            const sp = o.kind === HazardKind.Oil ? S.Oil : o.kind === HazardKind.Puddle ? S.Puddle : o.kind === HazardKind.Ice ? S.Ice : S.Boulder;
            blitCentred(s, sp, o.x, y, this.pal);
        }
    }

    _drawProps(s, tr, cam, t) {
        const S = HyperDriftSprites;
        let i = tr.firstPropAt(f32(cam - 60));
        const top = f32(f32(cam + (CarY - PY0)) + 20);
        const props = tr.props;
        for (; i < props.length && props[i].s <= top; i++) {
            const p = props[i];
            const y = screenY(p.s, cam);
            let sp, flip = false;
            switch (p.kind) {
                case PropKind.Bush: sp = S.Bush; break;
                case PropKind.Scrub: sp = S.Scrub; break;
                case PropKind.Rock: sp = S.Rock; break;
                case PropKind.SignLeft: sp = S.SignLeft; break;
                case PropKind.SignRight: sp = S.SignLeft; flip = true; break;
                case PropKind.SignWorks: sp = S.SignWorks; break;
                case PropKind.SignJump: sp = S.SignJump; break;
                case PropKind.SignRocks: sp = S.SignRocks; break;
                case PropKind.Barrier: sp = S.Barrier; break;
                case PropKind.Lamp: sp = S.Lamp; flip = p.x > tr.cx(p.s); break;
                case PropKind.Palm: sp = S.Palm; break;
                case PropKind.Pine: sp = S.Pine; break;
                case PropKind.PineSmall: sp = S.PineSmall; break;
                case PropKind.SnowRock: sp = S.SnowRock; break;
                case PropKind.Cactus: sp = S.Cactus; break;
                case PropKind.Boulder: sp = S.Boulder; break;
                case PropKind.Tuft: sp = S.Tuft; break;
                default: sp = S.Cone; break;
            }
            s.blit(sp, roundEven(p.x) - idiv(sp.width, 2), y - idiv(sp.height, 2), this.pal, 1, flip);
        }
    }

    _drawTraffic(s, r, cam, t) {
        const S = HyperDriftSprites, tr = r.track;
        for (const v of r.traffic) {
            const y = screenY(v.s, cam);
            if (y < PY0 - 24 || y > PY1 + 24) continue;
            const a = Math.atan(tr.slope(v.s)) + (v.dir < 0 ? Math.PI : 0.0) + v.wobble;
            const lit = !this._night || this._isLit(tr, roundEven(v.x), y, cam);
            let frames;
            if (v.kind === VehKind.Taxi) frames = lit ? S.TaxiFrames : S.TaxiDarkFrames;
            else if (!lit) frames = v.truck ? S.TruckDarkFrames : S.CarDarkFrames;
            else frames = v.truck ? (v.dir > 0 ? S.TruckRedFrames : S.TruckBlueFrames) : (v.dir > 0 ? S.CarRedFrames : S.CarBlueFrames);
            blitCentred(s, frames[frameFor(a)], v.x, y, this.pal);
            // a taxi about to pull out: its left indicator, at the blink rate the HUD uses (2 Hz, well under the strobe band)
            if (v.parked && v.signalT >= 0 && SurfaceDraw.blink(f32(v.signalT * 2))) {
                s.rect(roundEven(v.x) - 7, y - 10, 2, 2, this.cYellow); s.rect(roundEven(v.x) - 7, y + 8, 2, 2, this.cYellow);
            }
        }
    }

    _drawRival(s, r, cam) {
        const R = r.rival;
        if (R === null) return;
        let y = screenY(R.s, cam);
        if (y < PY0 - 24 || y > PY1 + 24) return;
        const a = Math.atan(r.track.slope(R.s)) + R.wobble;
        if (R.airLeft > 0) {
            const u = f32(1 - f32(R.airLeft / R.airTime));
            const h = roundEven(f32(Math.sin(Math.PI * u) * 12));
            s.checker(roundEven(R.x) - 6 + 3, y - 9 + 3, 12, 20, this.cBg, 0);
            y -= h;
        }
        blitCentred(s, HyperDriftSprites.RivalFrames[frameFor(a)], R.x, y, this.pal);
    }

    _drawCar(s, r, cam, t) {
        let y = screenY(r.s, cam);
        const wreck = r.p === Phase.Wreck && r.wreckCause !== WreckCause.Beaten;
        if (wreck && r.wreckCause === WreckCause.Fell) return;                 // into the gap
        // drift / spin smoke: the 50 % checker at the last skid points, growing as it trails off
        if ((r.drifting || (r.spinning && r.lastSpin !== SpinCause.Snow)) && r.skidCount > 0) {
            const pt = this._pt;
            const c = r.track.terrain === Terrain.Snow ? this.cSnowS : this.cWhite;
            for (let k = 0; k < 6; k++) {
                const idx = 4 + k * 7;
                if (idx >= r.skidCount) break;
                r.skidAt(idx, pt);
                const sy = screenY(pt.s, cam) + 2;
                const rad = 2 + k;
                s.checker(roundEven(pt.x) - rad, sy - rad, rad * 2, rad * 2, c, k & 1);
            }
        }
        if (wreck) { blitCentred(s, HyperDriftSprites.WreckFrames[frameFor(r.bodyAngle)], r.x, y, this.pal); return; }
        if (r.ghostLeft > 0 && (Math.trunc(f32(r.ghostLeft * 5)) & 1) === 1) return;      // 2.5 Hz: under the strobe floor
        const a = r.spinning ? r.spinAngle : r.bodyAngle;
        let x = r.x;
        if (r.spinning && r.lastSpin === SpinCause.Snow) x = f32(x + ((Math.trunc(t * 20) & 1) === 0 ? -1 : 1));    // dug in, rocking
        if (r.airborne) {
            const u = f32(1 - f32(r.airLeft / Math.max(f32(0.01), r.airTime)));
            const h = roundEven(f32(Math.sin(Math.PI * u) * 14));
            s.checker(roundEven(x) - 7 + 2 + (h >> 2), y - 11 + 2 + (h >> 2), 14, 22, this.cBg, 0);
            y -= h;
        }
        blitCentred(s, HyperDriftSprites.PlayerFrames[frameFor(a)], x, y, this.pal);
    }

    // a rock on its way down: the shadow grows under it, the rock drops onto it
    _drawRocks(s, r, cam) {
        const Fall = HyperDriftSim.RockFall;
        for (const k of r.rocks) {
            if (k.state !== 1) continue;
            const y = screenY(k.s, cam);
            if (y < PY0 - 10 || y > PY1 + 10) continue;
            const u = Math.min(1, f32(k.t / Fall));
            const rx = 3 + roundEven(f32(5 * u)), ry = 2 + roundEven(f32(3 * u));
            for (let dy = -ry; dy <= ry; dy++) {
                const hw = Math.trunc(rx * Math.sqrt(1 - (dy * dy) / (ry * ry + 0.01)));
                for (let dx = -hw; dx <= hw; dx++) if (((dx + dy) & 1) === 0) s.setPixel(roundEven(k.x) + dx, y + dy, this.cBg);
            }
            const h = roundEven(f32(f32(1 - u) * f32(1 - u) * 120));
            if (y - h > PY0 - 8) blitCentred(s, HyperDriftSprites.Boulder, k.x, y - h, this.pal);
        }
    }

    _drawFx(s, r, cam, tr) {
        const dustA = tr.terrain === Terrain.Canyon || tr.terrain === Terrain.Desert ? this.cOrangeD : this.cSand;
        for (const p of r.fx) {
            const y = screenY(p.s, cam), x = roundEven(p.x);
            if (y < PY0 - 6 || y > PY1 + 6) continue;
            const age = f32(1 - f32(p.life / p.max));
            switch (p.k) {
                case Fx.Smoke: { const rad = 1 + Math.trunc(age * 4); s.checker(x - rad, y - rad, rad * 2, rad * 2, age < 0.5 ? this.cGrey : this.cAsph, (x + y) & 1); break; }
                case Fx.Fire: s.rect(x - 1, y - 1, 2, 2, age < 0.3 ? this.cYellow : age < 0.65 ? this.cOrange : this.cRed); break;
                case Fx.Spark: s.setPixel(x, y, age < 0.5 ? this.cWhite : this.cYellow); break;
                case Fx.Debris: s.rect(x - 1, y - 1, 2, 2, (p.max * 100 & 1) === 0 ? this.cAsphD : this.cGrey); break;
                case Fx.Water: s.setPixel(x, y, age < 0.5 ? this.cWhite : this.cIce); break;
                case Fx.Snow: s.rect(x, y, 2, 2, age < 0.5 ? this.cWhite : this.cSnow); break;
                case Fx.Dust: { const rad = 1 + Math.trunc(age * 3); s.checker(x - rad, y - rad, rad * 2, rad * 2, dustA, (x + y) & 1); break; }
                default: s.rect(x - 1, y - 1, 2, 2, age < 0.35 ? this.cYellow : age < 0.7 ? this.cOrange : this.cRed); break;
            }
        }
    }

    _drawGantry(s, tr, cam, at, text, colour) {
        const y = screenY(at, cam);
        if (y < PY0 - 16 || y > PY1 + 16) return;
        const c = tr.cx(at), hw = f32((HyperDriftTrack.HalfWidth + HyperDriftTrack.Kerb + 7) * tr.f(at));
        const x0 = roundEven(f32(c - hw)), x1 = roundEven(f32(c + hw));
        // posts
        s.rect(x0 - 5, y - 4, 5, 16, this.cBg); s.rect(x0 - 4, y - 3, 3, 14, this.cGrey);
        s.rect(x1, y - 4, 5, 16, this.cBg); s.rect(x1 + 1, y - 3, 3, 14, this.cGrey);
        // banner
        s.rect(x0, y, x1 - x0, 11, colour);
        s.frame(x0, y, x1 - x0, 11, this.cBg);
        s.textCentered(text, idiv(x0 + x1, 2), y + 2, PixelFont.Arcade, this.cBg);
    }

    // the rain on the coast, the snow in the pass: screen-space, light, never in the safe area
    _drawWeather(s, tr, t) {
        if (tr.terrain === Terrain.Coast) {
            const fx = Math.trunc(t * 70), fy = Math.trunc(t * 290);
            for (let i = 0; i < 64; i++) {
                const x = PX0 + mod(hash(i, 11) % 304 - fx, 304), y = PY0 + mod(hash(i, 23) % 198 + fy, 198);
                const c = (i & 1) === 0 ? this.cIce : this.cGrey;
                s.setPixel(x, y, c); s.setPixel(x - 1, y + 1, c); s.setPixel(x - 1, y + 2, c); s.setPixel(x - 2, y + 3, c);
            }
        } else if (tr.terrain === Terrain.Snow) {
            for (let i = 0; i < 52; i++) {
                const sp = 26 + (i % 3) * 14;
                const x = PX0 + mod(hash(i, 11) % 304 + roundEven(f32(Math.sin(t * 1.3 + i) * 5)) - Math.trunc(t * 9), 304);
                const y = PY0 + mod(hash(i, 23) % 198 + Math.trunc(t * sp), 198);
                const big = i % 3 === 0;
                s.rect(x, y, big ? 2 : 1, big ? 2 : 1, this.cWhite);
            }
        }
    }

    _drawPopups(s, r, cam) {
        for (const p of r.popups) {
            const age = f32(r.time - p.t);
            const y = screenY(p.s, cam) - 16 - Math.trunc(f32(age * 16));
            const x = roundEven(Math.max(PX0 + 30, Math.min(PX1 - 30, p.x)));
            if (p.big) s.textCenteredShadow(p.text, x, y, PixelFont.Display, this.cYellow, this.cBg);
            else s.textCenteredShadow(p.text, x, y, PixelFont.Arcade, this.cWhite, this.cBg);
        }
    }

    // what's about to come on screen: oncoming arrows (blue), falling rocks (red), the rival (purple)
    _drawWarnings(s, r, cam, t) {
        const top = HyperDriftScroll.topS(cam);
        const arrow = (xc, c, up) => {
            const x = roundEven(Math.max(PX0 + 5, Math.min(PX1 - 6, xc)));
            const y = up ? PY0 : PY1 - 6;
            s.rect(x - 5, y, 11, 6, this.cBg);
            for (let k = 0; k < 5; k++) {
                const yy = up ? y + k : y + 5 - k;
                s.rect(x - 4 + k, yy, 9 - 2 * k, 1, c);
            }
        };
        for (const v of r.traffic) {
            if (v.dir > 0 || v.s <= f32(top + 6) || v.s > f32(top + 130)) continue;
            arrow(v.x, this.cBlue, true);
        }
        for (const k of r.rocks)
            if (k.state === 1 && k.s > f32(top + 4) && SurfaceDraw.blink(t, 2)) arrow(k.x, this.cRed, true);
        const R = r.rival;
        if (R !== null && r.p === Phase.Racing) {
            if (R.s > f32(top + 6)) {
                arrow(R.x, this.cPurple, true);
                s.textCenteredShadow(roundEven(f32(f32(R.s - r.s) * HyperDriftScroll.MetresPerPx)) + 'M', roundEven(Math.max(PX0 + 16, Math.min(PX1 - 16, R.x))), PY0 + 8, PixelFont.Small, this.cPurple, this.cBg);
            } else if (screenY(R.s, cam) > PY1 + 8) arrow(R.x, this.cPurple, false);
        }
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, sm = PixelFont.Small;
        s.text('1UP', 8, 9, arc, this.cOrange);
        // your cars: an icon each (more than three: one icon and the count)
        if (r.cars <= 3) for (let i = 0; i < r.cars; i++) s.blit(HyperDriftSprites.CarIcon, 8 + i * 7, 20, this.pal);
        else { s.blit(HyperDriftSprites.CarIcon, 8, 20, this.pal); s.text('X' + r.cars, 15, 22, sm, this.cYellow); }
        s.text(d6(r.score), 30, 10, dsp, this.cWhite, 2);

        // the clock
        let secs = Math.max(0, Math.ceil(f32(r.clock - f32(1e-3))));
        if (r.p === Phase.Card || r.p === Phase.Countdown) secs = roundEven(r.clockStart);
        let cc = this.cWhite;
        if (!r.mercyActive && secs <= 10 && r.p !== Phase.Tally) cc = this.cOrange;
        if (!r.mercyActive && secs <= 5 && r.p === Phase.Racing && !SurfaceDraw.blink(t)) cc = this.cYellow;
        s.text(r.mercyActive ? 'FREE' : 'TIME', 134, 9, arc, r.mercyActive ? this.cYellow : this.cOrange);
        s.text(r.mercyActive ? 'RIDE' : 'LEFT', 134, 19, arc, r.mercyActive ? this.cYellow : this.cOrange);
        const digits = secs >= 100 ? dn(secs, 3) : dn(secs, 2);
        s.text(digits, 162, 8, dsp, cc, 3);

        // the leg bar: you, the extend gate, the rival, the checkpoint flag
        const tr = r.track;
        const bx = 232, bw = 70, by = 10;
        s.frame(bx, by, bw, 7, this.cGrey);
        const fill = roundEven(f32((bw - 2) * r.legProgress));
        if (fill > 0) s.rect(bx + 1, by + 1, fill, 5, this.cOrangeD);
        const ex = bx + 1 + roundEven(f32((bw - 2) * f32(tr.extend / tr.checkpoint)));
        s.rect(ex, by + 1, 1, 5, tr.dash > 0 ? this.cPurple : this.cIce);
        const R = r.rival;
        if (R !== null) {
            const rx = bx + 1 + roundEven(f32((bw - 2) * Math.min(1, f32(R.s / tr.checkpoint))));
            s.rect(Math.min(bx + bw - 3, rx - 1), by - 1, 3, 9, this.cPurple);
        }
        const mx = bx + 1 + fill;
        s.rect(Math.min(bx + bw - 3, mx - 1), by - 1, 3, 9, this.cYellow);
        for (let j = 0; j < 9; j++) for (let i = 0; i < 6; i++) s.setPixel(bx + bw + 1 + i, by - 1 + j, (((i >> 1) + (j >> 1)) & 1) === 0 ? this.cWhite : this.cBg);
        s.text('LEG ' + r.legNo, bx, 20, arc, this.cOrange);
        const spd = roundEven(f32(r.v * HyperDriftScroll.KmhPerPxS)) + ' KMH';
        s.textRight(spd, 309, 20, arc, r.boostLeft > 0 ? this.cYellow : this.cWhite);
        s.dottedRule(8, 312, 31, 3, this.cOrange);
    }

    // ------------------------------------------------------------------ overlays
    _drawOverlays(s, r, t, cam) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const P = r.p;
        if (P === Phase.Card) { this._legCard(s, r, t); return; }
        if (P === Phase.Countdown) {
            const n = r.countdownLeft > 0 ? String(r.countdownLeft) : 'GO';
            s.textCenteredShadow(n, 160, 60, dsp, this.cYellow, this.cBg, 5);
            s.textBox('LEG ' + r.legNo + '  ' + r.def.name, 160, 112, arc, 1, this.cWhite, this.cOrange, this.cBg);
            if (SurfaceDraw.blink(t)) s.textCenteredShadow('YOU', roundEven(r.x), CarY - 26, arc, this.cYellow, this.cBg);
            return;
        }
        if (P === Phase.Racing) {
            if (r.goT > 0) s.textCenteredShadow('GO!', 160, 60 - roundEven(f32(f32(0.8 - r.goT) * 30)), dsp, this.cYellow, this.cBg, 5);
            if (r.spinning && r.spinLeft > f32(r.spinSeconds - f32(1.4)) && r.lastSpin !== SpinCause.Snow) {
                const msg = r.lastSpin === SpinCause.Oil ? 'OIL!' : 'SPIN OUT';
                s.textBox(msg, 160, 150, dsp, 1, this.cWhite, r.lastSpin === SpinCause.Oil ? this.cBlue : this.cRed, this.cBg);
            } else if (r.spinning && r.lastSpin === SpinCause.Snow) {
                s.textBox('SNOWBANK!', 160, 150, dsp, 1, this.cBlueD, this.cIce, this.cSnow);
            } else if (r.aquaLeft > 0) s.textBox('AQUAPLANE!', 160, 150, arc, 1, this.cWhite, this.cBlue, this.cBg);
            else if (r.onIce) s.textBox('ICE!', 160, 150, arc, 1, this.cBlueD, this.cIce, this.cSnow);
            this._notice(s, r, cam, t);
            return;
        }
        if (P === Phase.Wreck) {
            if (r.wreckCause === WreckCause.Beaten) {
                s.textBox('BEATEN!', 160, 70, dsp, 3, this.cWhite, this.cPurple, this.cBg);
                s.textCenteredShadow('THE RIVAL TOOK THE FLAG', 160, 108, arc, this.cPurple, this.cBg);
            } else {
                s.textBox(r.wreckCause === WreckCause.Fell ? 'INTO THE GAP' : 'WRECKED', 160, 70, dsp, 3, this.cYellow, this.cRed, this.cBg);
                const why = r.wreckCause === WreckCause.HeadOn ? 'HEAD-ON!' : r.wreckCause === WreckCause.Boulder ? 'YOU HIT A BOULDER' : r.wreckCause === WreckCause.Rockfall ? 'A ROCK FELL ON YOU' : 'TOO SLOW FOR THE JUMP';
                s.textCenteredShadow(why, 160, 108, arc, this.cWhite, this.cBg);
            }
            s.textCenteredShadow(r.cars > 0 ? (r.dashRestart ? 'BACK TO THE DASH  ' : '') + 'CARS LEFT ' + r.cars : 'NO CARS LEFT', 160, 122, arc, r.cars > 1 ? this.cYellow : this.cOrange, this.cBg, 1);
            return;
        }
        if (P === Phase.OutOfTime) {
            s.textBox('OUT OF TIME', 160, 70, dsp, 3, this.cOrange, this.cRed, this.cBg);
            s.textCenteredShadow(r.cars > 0 ? 'CARS LEFT ' + r.cars + '  -  THE NEXT CAR GETS +' + roundEven(f32(r.refillSeconds * r.clockK)) + ' SEC' : 'NO CARS LEFT', 160, 108, arc, this.cWhite, this.cBg);
            return;
        }
        if (P === Phase.Tally) { this._tallyPlate(s, r, t); return; }
        if (P === Phase.GameOver) {
            s.textBox('GAME OVER', 160, 78, dsp, 3, this.cOrange, this.cRed, this.cBg);
            s.textCenteredShadow(toGo(r) + ' TO GO ON LEG ' + r.legNo, 160, 114, arc, this.cWhite, this.cBg);
            return;
        }
        if (P === Phase.Result || P === Phase.Over) this._resultCard(s, r);
    }

    // the leg card: number, name, what's new, a hint, the clock and your cars
    _legCard(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const d = r.def;
        s.plate(30, 50, 260, 112, this.cBg, this.cOrange);
        s.frame(32, 52, 256, 108, this.cOrangeD);
        s.textCentered('LEG ' + r.legNo + ' OF ' + LEGS.length, 160, 60, arc, this.cOrange);
        s.textCenteredShadow(d.name, 160, 74, dsp, this.cYellow, this.cOrangeD, 2);
        s.dottedRule(56, 264, 94, 3, this.cOrangeD);
        s.textCentered(d.news, 160, 102, arc, this.cWhite);
        s.textCentered(d.hint, 160, 116, arc, this.cYellow);
        s.textCentered((r.mercyActive ? 'FREE RIDE' : roundEven(r.clockStart) + ' SECONDS') + '    CARS ' + r.cars, 160, 136, arc, this.cOrange);
        if (r.legNo === LEGS.length && SurfaceDraw.blink(t)) s.textCentered('THE FINAL LEG', 160, 148, PixelFont.Small, this.cPurple);
    }

    _tallyPlate(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const T = r.tally;
        s.textBox(T.goal ? 'GOAL!' : 'CHECKPOINT', 160, 46, dsp, 3, this.cYellow, this.cOrange, this.cBg);
        if (r.phaseTime < 1.0) return;
        const lines = T.lines.length;
        const h = 62 + lines * 12 + (T.goal ? 0 : 12);
        s.plate(44, 84, 232, h, this.cBg, this.cOrange);
        s.frame(46, 86, 228, h - 4, this.cOrangeD);
        s.textCentered(T.goal ? 'THE RALLY IS WON' : 'LEG ' + r.legNo + ' CLEAR', 160, 92, arc, this.cOrange);
        s.text('TIME BONUS', 56, 106, arc, this.cWhite);
        s.textRight(fmt00_0(r.clock) + ' S', 200, 106, arc, this.cYellow);
        s.textRight(String(T.paid), 264, 106, arc, this.cWhite);
        s.textCentered('PASSES ' + r.legPasses + '    DRIFTS ' + r.legDrifts + '/' + r.track.hairpins.length, 160, 120, arc, this.cYellow);
        for (let i = 0; i < T.shown; i++) {
            s.text(T.lines[i][0], 56, 134 + i * 12, arc, this.cWhite);
            s.textRight('+' + T.lines[i][1], 264, 134 + i * 12, arc, this.cYellow);
        }
        if (!T.goal && T.stage > 0 && T.shown >= lines) {
            const nx = LEGS[r.leg + 1];
            s.textCentered('NEXT  ' + nx.name, 160, 134 + lines * 12 + 2, arc, SurfaceDraw.blink(t) ? this.cOrange : this.cOrangeD);
        }
    }

    _resultCard(s, r) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const won = r.won;
        if (won) s.textBox('RALLY CHAMPION', 160, 58, dsp, 2, this.cYellow, this.cOrange, this.cBg);
        else s.textBox('GAME OVER', 160, 56, dsp, 3, this.cOrange, this.cRed, this.cBg);
        s.plate(48, 94, 224, 76, this.cBg, this.cOrange);
        s.frame(50, 96, 220, 72, this.cOrangeD);
        s.textCentered('SCORE ' + d6(r.score), 160, 102, arc, this.cWhite, 2);
        if (won) {
            s.textCentered('ALL ' + LEGS.length + ' LEGS - THE RIVAL BEATEN', 160, 124, arc, this.cYellow);
            s.textCentered('PASSES ' + r.passes + '   DRIFTS ' + r.hairpinDrifts + '/' + r.hairpinsSeen, 160, 138, arc, this.cWhite);
            s.textCentered('WRECKS ' + r.wrecks + '   SPINS ' + r.spins + '   JUMPS ' + r.jumps, 160, 152, arc, this.cWhite);
        } else {
            s.textCentered('LEG ' + r.legNo + '  ' + r.def.name, 160, 124, arc, this.cYellow);
            s.textCentered(toGo(r) + ' SHORT OF THE ' + (r.finalLeg ? 'FLAG' : 'CHECKPOINT'), 160, 138, arc, this.cWhite);
            s.textCentered('PASSES ' + r.passes + '   DRIFTS ' + r.hairpinDrifts + '/' + r.hairpinsSeen, 160, 152, arc, this.cWhite);
        }
    }

    // a banner from the sim (EXTENDED TIME, EXTRA CAR, THE RIVAL ...) or what's coming: a plate under the HUD
    _notice(s, r, cam, t) {
        const arc = PixelFont.Arcade;
        if (r.banner !== null) {
            const B = r.banner, k = B.kind;
            const fg = k === 1 ? this.cWhite : k === 3 ? this.cWhite : this.cYellow;
            const bd = k === 1 ? this.cRed : k === 2 ? this.cGreen : k === 3 ? this.cPurple : this.cOrange;
            s.textBox(B.text, 160, 44, arc, 1, fg, bd, this.cBg);
            return;
        }
        const tr = r.track;
        let msg = null, border = this.cOrange;
        const ahead = (z, lo, hi) => z !== null && f32(z.s0 - cam) > lo && f32(z.s0 - cam) < hi;
        const g = tr.nextGap(cam);
        if (g !== null && f32(g.s0 - cam) > 10 && f32(g.s0 - cam) < 360) { msg = 'JUMP!  FULL SPEED'; border = this.cRed; }
        const h = tr.nextZone(ZoneKind.Hairpin, cam);
        if (msg === null && h !== null && f32(h.s0 - cam) > 40 && f32(h.s0 - cam) < 300) msg = h.dir < 0 ? '<< HAIRPIN <<' : '>> HAIRPIN >>';
        if (msg === null && ahead(tr.nextZone(ZoneKind.Works, cam), 20, 320)) msg = 'ROAD WORKS AHEAD';
        if (msg === null && ahead(tr.nextZone(ZoneKind.Tunnel, cam), 20, 260)) msg = 'TUNNEL';
        if (msg === null && ahead(tr.fork, 20, 320)) msg = 'FORK: PICK A ROAD';
        if (msg === null && ahead(tr.nextZone(ZoneKind.Rocks, cam), -40, 200) && r.rocks.some((k) => k.state === 1)) { msg = 'ROCKFALL!'; border = this.cRed; }
        if (msg === null && r.traffic.some((v) => v.parked && v.signalT >= 0)) msg = 'TAXI PULLING OUT';
        if (msg === null && r.clock <= 10 && !r.mercyActive && r.clock > 0) { msg = 'HURRY!'; border = this.cRed; }
        if (msg === null) return;
        s.textBox(msg, 160, 44, arc, 1, this.cYellow, border, this.cBg);
    }
}

function toGo(r) {
    const m = Math.ceil(f32(Math.max(0, f32(r.checkpoint - r.s)) * HyperDriftScroll.MetresPerPx));
    return m + ' M';
}
