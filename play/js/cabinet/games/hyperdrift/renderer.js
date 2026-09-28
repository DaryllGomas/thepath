// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE PICTURE.
// Port of HyperDriftRenderer.cs (Staging/Batch3/hyperdrift), 1:1.
//
// The cabinet art's look, on a 320x240 tube: a grey road winding over sunset-orange sand, yellow and
// black kerbs, white edge lines and centre dashes, green scrub, your yellow car, red traffic going your
// way and blue traffic coming at you.
//   - HUD band y 8..30: 1UP + score (display digits x2), TIME + the clock (display digits x3, orange
//     under 10 s, a 1 Hz blink under 5), the course bar to the checkpoint flag and the speed
//   - the playfield x 8..311, y 34..231, drawn a row at a time from the track tables: sand or river,
//     kerbs or bridge rails, asphalt, edge lines, dashes, the start and checkpoint checks, hatching
//     where the works shut the lane. Rows are widened by the slope, so a hairpin keeps its width.
//   - skid marks (a ring of world points), scenery, signs, cones, oil, traffic and your car, all from
//     24-frame rotation caches; drift smoke is the arcade's 50 % checker, never a blend
//   - oncoming warning arrows at the top edge, popups (+100, DRIFT 250), notices (HAIRPIN <<, ROAD
//     WORKS, FORK), the countdown, CHECKPOINT / TIME UP and the result card
// Every colour is a palette entry; the outer 8 px stay background. It reads the sim, never writes it.
import { f32, idiv, d6, dn, fmt, F32, roundEven, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { HyperDriftPalette, HyperDriftSpec } from './spec.js';
import { HyperDriftSprites, frameFor, blitCentred } from './sprites.js';
import { HyperDriftTrack, HyperDriftScroll, ZoneKind, PropKind } from './track.js';
import { HyperDriftSim } from './sim.js';

const PX0 = HyperDriftScroll.PX0, PX1 = HyperDriftScroll.PX1, PY0 = HyperDriftScroll.PY0, PY1 = HyperDriftScroll.PY1;
const CarY = HyperDriftScroll.CarY;
const Phase = HyperDriftSim.Phase, SpinCause = HyperDriftSim.SpinCause;
const screenY = HyperDriftScroll.screenY;

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
        this._pt = { x: 0, s: 0 };
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.p === Phase.Idle) return;
        t = f32(t);
        const tr = r.track;
        const cam = r.s;

        s.clip(PX0, PY0, PX1 - PX0, PY1 - PY0);
        this._drawRows(s, tr, cam);
        this._drawSkids(s, r, cam);
        this._drawProps(s, tr, cam);
        this._drawOil(s, r, cam);
        this._drawTraffic(s, r, cam);
        this._drawCar(s, r, cam);
        this._drawGantry(s, tr, cam, HyperDriftTrack.Checkpoint + 26, 'CHECKPOINT');
        this._drawGantry(s, tr, cam, HyperDriftTrack.StartS + 30, 'START');
        this._drawPopups(s, r, cam);
        this._drawWarnings(s, r, cam);
        s.noClip();

        this._drawHud(s, r, t);
        this._drawOverlays(s, r, t, cam);
    }

    // ------------------------------------------------------------------ the road, a row at a time
    _geometry(tr, si, branch) {
        const sp = { on: false, l: 0, r: 0, kw: 0, ew: 0, dl: 0, dr: 0, arc: 0 };
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

    _drawRows(s, tr, cam) {
        const W = PX1 - PX0;
        for (let y = PY0; y < PY1; y++) {
            const si = Math.floor(f32(cam + (CarY - y)));
            const river = tr.isRiver(si), bridge = tr.isBridge(si);

            // ---- the ground: sand, or the river
            if (river) {
                s.rect(PX0, y, W, 1, this.cBlueD);
                if (mod(si, 6) === 0) { const off = mod(si * 37, 23); for (let x = PX0 + off - 23; x < PX1; x += 23) s.rect(x, y, 5, 1, this.cBlue); }
                else if (mod(si, 6) === 3) { const off = mod(si * 53 + 11, 29); for (let x = PX0 + off - 29; x < PX1; x += 29) s.rect(x, y, 3, 1, this.cBlue); }
            } else {
                const bank = tr.isRiver(si - 4) || tr.isRiver(si + 4);
                s.rect(PX0, y, W, 1, bank ? this.cOrangeD : this.cOrange);
                if (!bank)
                    for (let x = PX0; x < PX1; x += 2) {
                        const h = hash(x >> 1, si >> 1);
                        if (h % 11 === 0) s.setPixel(x + ((h >> 8) & 1), y, this.cOrangeD);
                    }
            }

            const a = this._geometry(tr, si, 1);
            const b = this._geometry(tr, si, 2);

            // ---- kerbs (yellow / black blocks) or the bridge rails
            this._kerbs(s, y, a, bridge); this._kerbs(s, y, b, bridge);

            // ---- asphalt, specks, white edge lines
            this._asphalt(s, y, si, a); this._asphalt(s, y, si, b);

            // ---- works: hatch the shut lane beyond the cone line
            const co = tr.coneOff(si);
            if (!Number.isNaN(co) && a.on) {
                const lineX = roundEven(f32(tr.cx(si) + f32(co * tr.f(si))));
                for (let x = lineX + 2; x < a.r - a.ew; x++)
                    if (mod(x + si, 8) < 2) s.setPixel(x, y, this.cOrangeD);
            }

            // ---- centre dashes
            this._dashes(s, y, a); this._dashes(s, y, b);

            // ---- the start line and the checkpoint line: a band of 4 px checks
            this._checks(s, y, si, a, HyperDriftTrack.StartS - 3, HyperDriftTrack.StartS + 4);
            this._checks(s, y, si, a, HyperDriftTrack.Checkpoint, HyperDriftTrack.Checkpoint + 8);
        }
    }

    _kerbs(s, y, sp, bridge) {
        if (!sp.on) return;
        if (bridge) {
            const post = mod(Math.trunc(sp.arc), 12) < 2;
            const rail = post ? this.cGrey : this.cWhite;
            s.rect(sp.l - sp.kw, y, sp.kw, 1, rail); s.rect(sp.r, y, sp.kw, 1, rail);
            s.setPixel(sp.l - sp.kw - 1, y, post ? this.cGrey : this.cBg); s.setPixel(sp.r + sp.kw, y, post ? this.cGrey : this.cBg);
            return;
        }
        const k = (Math.trunc(f32(sp.arc / 6)) & 1) === 0 ? this.cYellow : this.cBg;
        s.rect(sp.l - sp.kw, y, sp.kw, 1, k);
        s.rect(sp.r, y, sp.kw, 1, k);
    }

    _asphalt(s, y, si, sp) {
        if (!sp.on) return;
        s.rect(sp.l, y, sp.r - sp.l, 1, this.cAsph);
        for (let x = sp.l + 2; x < sp.r - 2; x += 3) {
            const h = hash(x >> 1, si);
            if (h % 17 === 0) s.setPixel(x, y, this.cAsphD);
        }
        s.rect(sp.l, y, sp.ew, 1, this.cWhite);
        s.rect(sp.r - sp.ew, y, sp.ew, 1, this.cWhite);
    }

    _dashes(s, y, sp) {
        if (!sp.on) return;
        if ((Math.trunc(f32(sp.arc / 10)) & 1) !== 0) return;
        s.rect(sp.dl, y, sp.dr - sp.dl, 1, this.cWhite);
    }

    _checks(s, y, si, sp, s0, s1) {
        if (!sp.on || si < s0 || si >= s1) return;
        const row = (si - s0) >> 2;
        for (let x = sp.l; x < sp.r; x++)
            s.setPixel(x, y, ((((x - sp.l) >> 2) + row) & 1) === 0 ? this.cWhite : this.cBg);
    }

    // ------------------------------------------------------------------ marks, things, cars
    _drawSkids(s, r, cam) {
        const pt = this._pt;
        for (let i = 0; i < r.skidCount; i++) {
            r.skidAt(i, pt);
            const y = screenY(pt.s, cam);
            if (y < PY0 - 2 || y > PY1 + 2) continue;
            s.rect(roundEven(pt.x) - 1, y - 1, 2, 2, this.cAsphD);
        }
    }

    _drawProps(s, tr, cam) {
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
                case PropKind.Barrier: sp = S.Barrier; break;
                default: sp = S.Cone; break;
            }
            s.blit(sp, roundEven(p.x) - idiv(sp.width, 2), y - idiv(sp.height, 2), this.pal, 1, flip);
        }
    }

    _drawOil(s, r, cam) {
        for (const o of r.oil) {
            const y = screenY(o.s, cam);
            if (y < PY0 - 12 || y > PY1 + 12) continue;
            blitCentred(s, HyperDriftSprites.Oil, o.x, y, this.pal);
        }
    }

    _drawTraffic(s, r, cam) {
        const S = HyperDriftSprites;
        for (const v of r.traffic) {
            const y = screenY(v.s, cam);
            if (y < PY0 - 24 || y > PY1 + 24) continue;
            const a = Math.atan(r.track.slope(v.s)) + (v.dir < 0 ? Math.PI : 0.0) + v.wobble;
            const frames = v.truck ? (v.dir > 0 ? S.TruckRedFrames : S.TruckBlueFrames)
                                   : (v.dir > 0 ? S.CarRedFrames : S.CarBlueFrames);
            blitCentred(s, frames[frameFor(a)], v.x, y, this.pal);
        }
    }

    _drawCar(s, r, cam) {
        const y = screenY(r.s, cam);
        // drift / spin smoke: the 50 % checker at the last skid points, growing as it trails off
        if ((r.drifting || r.spinning) && r.skidCount > 0) {
            const pt = this._pt;
            for (let k = 0; k < 6; k++) {
                const idx = 4 + k * 7;
                if (idx >= r.skidCount) break;
                r.skidAt(idx, pt);
                const sy = screenY(pt.s, cam) + 2;
                const rad = 2 + k;
                s.checker(roundEven(pt.x) - rad, sy - rad, rad * 2, rad * 2, this.cWhite, k & 1);
            }
        }
        if (r.ghostLeft > 0 && (Math.trunc(f32(r.ghostLeft * 5)) & 1) === 1) return;      // 2.5 Hz: under the strobe floor
        const a = r.spinning ? r.spinAngle : r.bodyAngle;
        blitCentred(s, HyperDriftSprites.PlayerFrames[frameFor(a)], r.x, y, this.pal);
    }

    _drawGantry(s, tr, cam, at, text) {
        const y = screenY(at, cam);
        if (y < PY0 - 16 || y > PY1 + 16) return;
        const c = tr.cx(at), hw = f32((HyperDriftTrack.HalfWidth + HyperDriftTrack.Kerb + 7) * tr.f(at));
        const x0 = roundEven(f32(c - hw)), x1 = roundEven(f32(c + hw));
        // posts
        s.rect(x0 - 5, y - 4, 5, 16, this.cBg); s.rect(x0 - 4, y - 3, 3, 14, this.cGrey);
        s.rect(x1, y - 4, 5, 16, this.cBg); s.rect(x1 + 1, y - 3, 3, 14, this.cGrey);
        // banner
        s.rect(x0, y, x1 - x0, 11, this.cYellow);
        s.frame(x0, y, x1 - x0, 11, this.cBg);
        s.textCentered(text, idiv(x0 + x1, 2), y + 2, PixelFont.Arcade, this.cBg);
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

    // oncoming traffic about to come on screen: a small arrow at the top edge, in its colour
    _drawWarnings(s, r, cam) {
        const top = HyperDriftScroll.topS(cam);
        for (const v of r.traffic) {
            if (v.dir > 0 || v.s <= f32(top + 6) || v.s > f32(top + 130)) continue;
            const x = roundEven(Math.max(PX0 + 5, Math.min(PX1 - 6, v.x)));
            const y = PY0;
            s.rect(x - 5, y, 11, 6, this.cBg);
            s.rect(x - 4, y, 9, 1, this.cBlue); s.rect(x - 3, y + 1, 7, 1, this.cBlue); s.rect(x - 2, y + 2, 5, 1, this.cBlue);
            s.rect(x - 1, y + 3, 3, 1, this.cBlue); s.setPixel(x, y + 4, this.cBlue);
        }
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cOrange);
        s.text(d6(r.score), 30, 10, dsp, this.cWhite, 2);

        // the clock: the life
        let secs = Math.max(0, Math.ceil(f32(r.clock - f32(1e-3))));
        if (r.p === Phase.Countdown) secs = roundEven(r.clockStart);
        let cc = this.cWhite;
        if (!r.mercyActive && secs <= 10) cc = this.cOrange;
        if (!r.mercyActive && secs <= 5 && r.p === Phase.Racing && !SurfaceDraw.blink(t)) cc = this.cYellow;
        s.text(r.mercyActive ? 'FREE' : 'TIME', 134, 9, arc, r.mercyActive ? this.cYellow : this.cOrange);
        s.text(r.mercyActive ? 'RIDE' : 'LEFT', 134, 19, arc, r.mercyActive ? this.cYellow : this.cOrange);
        const digits = secs >= 100 ? dn(secs, 3) : dn(secs, 2);
        s.text(digits, 162, 8, dsp, cc, 3);

        // the course bar: you, the road, the checkpoint flag
        const bx = 232, bw = 70, by = 10;
        s.frame(bx, by, bw, 7, this.cGrey);
        const fill = roundEven(f32((bw - 2) * r.progress));
        if (fill > 0) s.rect(bx + 1, by + 1, fill, 5, this.cOrangeD);
        const mx = bx + 1 + fill;
        s.rect(Math.min(bx + bw - 3, mx - 1), by - 1, 3, 9, this.cYellow);
        for (let j = 0; j < 9; j++) for (let i = 0; i < 6; i++) s.setPixel(bx + bw + 1 + i, by - 1 + j, (((i >> 1) + (j >> 1)) & 1) === 0 ? this.cWhite : this.cBg);
        const spd = roundEven(f32(r.v * HyperDriftScroll.KmhPerPxS)) + ' KMH';
        s.textRight(spd, 309, 20, arc, this.cWhite);
        s.dottedRule(8, 312, 31, 3, this.cOrange);
    }

    // ------------------------------------------------------------------ overlays
    _drawOverlays(s, r, t, cam) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const P = r.p;
        if (P === Phase.Countdown) {
            const n = r.countdownLeft > 0 ? String(r.countdownLeft) : 'GO';
            s.textCenteredShadow(n, 160, 56, dsp, this.cYellow, this.cBg, 5);
            s.textBox('REACH THE CHECKPOINT', 160, 106, arc, 1, this.cWhite, this.cOrange, this.cBg);
            s.textCenteredShadow(roundEven(r.clockStart) + ' SECONDS ON THE CLOCK', 160, 124, arc, this.cYellow, this.cBg);
            if (r.mercyActive) s.textCenteredShadow('FREE RIDE: THE ROAD IS YOURS', 160, 138, arc, this.cYellow, this.cBg);
            if (SurfaceDraw.blink(t)) s.textCenteredShadow('YOU', roundEven(r.x), CarY - 26, arc, this.cYellow, this.cBg);
            return;
        }
        if (P === Phase.Racing) {
            if (r.spinning && r.spinLeft > f32(r.spinSeconds - f32(1.4))) {
                const msg = r.lastSpin === SpinCause.Oil ? 'OIL!' : 'SPIN OUT';
                s.textBox(msg, 160, 150, dsp, 1, this.cWhite, r.lastSpin === SpinCause.Oil ? this.cBlue : this.cRed, this.cBg);
            } else this._notice(s, r, cam);
            return;
        }
        if (P === Phase.Finish) {
            if (r.finishedAtCheckpoint) {
                s.textBox('CHECKPOINT', 160, 78, dsp, 3, this.cYellow, this.cOrange, this.cBg);
                s.textCenteredShadow('TIME LEFT ' + fmt00_0(r.clock), 160, 114, arc, this.cWhite, this.cBg, 2);
            } else {
                s.textBox('TIME UP', 160, 78, dsp, 3, this.cOrange, this.cRed, this.cBg);
                s.textCenteredShadow(toGo(r) + ' TO GO', 160, 114, arc, this.cWhite, this.cBg, 2);
            }
            return;
        }
        if (P === Phase.Card || P === Phase.Over) {
            const spec = HyperDriftSpec;
            const won = r.won;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, 160, 62, dsp, 3, won ? this.cYellow : this.cOrange, won ? this.cOrange : this.cRed, this.cBg);
            s.plate(64, 98, 192, 66, this.cBg, this.cOrange);
            s.frame(66, 100, 188, 62, this.cOrangeD);
            s.textCentered('SCORE ' + d6(r.score), 160, 106, arc, this.cWhite, 2);
            s.textCentered('PASSES ' + r.passes + '   HAIRPINS ' + r.hairpinDrifts + '/' + r.track.hairpins.length, 160, 128, arc, this.cYellow);
            s.textCentered(won ? 'TIME LEFT ' + fmt(r.clock, 1, F32) + ' S' : toGo(r) + ' SHORT OF THE FLAG', 160, 144, arc, this.cWhite);
        }
    }

    // what's coming: a plate under the HUD for a hairpin, the works or the fork
    _notice(s, r, cam) {
        const tr = r.track;
        let msg = null, border = this.cOrange;
        const h = tr.nextZone(ZoneKind.Hairpin, cam);
        if (h !== null && f32(h.s0 - cam) > 40 && f32(h.s0 - cam) < 300) msg = h.dir < 0 ? '<< HAIRPIN <<' : '>> HAIRPIN >>';
        const w = tr.nextZone(ZoneKind.Works, cam);
        if (msg === null && w !== null && f32(w.s0 - cam) > 20 && f32(w.s0 - cam) < 320) msg = 'ROAD WORKS AHEAD';
        const f = tr.fork;
        if (msg === null && f !== null && f32(f.s0 - cam) > 20 && f32(f.s0 - cam) < 320) msg = 'FORK: PICK A ROAD';
        if (msg === null && r.clock <= 10 && !r.mercyActive && r.clock > 0) { msg = 'HURRY!'; border = this.cRed; }
        if (msg === null) return;
        s.textBox(msg, 160, 44, PixelFont.Arcade, 1, this.cYellow, border, this.cBg);
    }
}

function toGo(r) {
    const m = Math.ceil(f32(Math.max(0, f32(HyperDriftTrack.Checkpoint - r.s)) * HyperDriftScroll.MetresPerPx));
    return m + ' M';
}
