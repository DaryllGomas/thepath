// THE NODE · world 1 · STARVECTOR on the Cabinet Engine · THE PICTURE (port of StarvectorGame.Draw, redrawn
// to the concept play frames).
//
//   - the field is the whole safe area (304 x 224 at 8, 8), wrap-around, black; everything is thin 1 px
//     vector strokes in a palette of 11 colours, the HUD floats over the field as on a vector monitor
//   - ROCKS are real tumbling polyhedra drawn with hidden lines: large and medium are dodecahedra (the
//     concept frames' pentagon rocks), small ones octahedral shards; every visible edge equally bright,
//     crisp 1 px (a halo pass exists, off: it read as a drop shadow at this size)
//   - the SHIP is the white paper dart (30 px nose to tail) with a cyan keel and three cyan pods; the flame
//     is steady (no flicker: nothing strobes 3-30 Hz); after a respawn a dim ring shows it is protected,
//     the B shield is a bright ring
//   - the SAUCER is red (hull, rim, dome, two antennae), its running light slides along the hull
//   - explosions are drawn from the field's boom records (position, birth time, seed): sparks and shards
//     step down through darker palette entries by age, the ship breaks into its own drifting lines
//   - HUD: 1UP + spare ships left, the score in display digits (scale 2) centre, WAVE n/3, the shield
//     gauge and (credit 4) the ASSIST lamp right, the BONUS line under the score
import { PixelFont, SurfaceDraw, dn } from '../../sdk/index.js';
import { StarvectorPalette, StarvectorSpec } from './spec.js';
import { StarvectorRound } from './round.js';
import { StarvectorField, FW, FH } from './field.js';
import { DODECA, OCTA, SHIP, SHIP_K, rockEdges } from './shapes.js';

const OX = 8, OY = 8;
const Phase = StarvectorRound.Phase;
const TAU = Math.PI * 2;

// deterministic 0..1 from a boom's seed and a spark index (the renderer never rolls the field's dice)
function h01(seed, k) {
    let h = Math.imul(seed ^ Math.imul(k + 1, 0x9E3779B1), 0x85EBCA6B);
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

function wrapF(v, m) { v %= m; return v < 0 ? v + m : v; }

export class StarvectorRenderer {
    constructor() {
        const pal = StarvectorPalette;
        this.cBg = pal.get('bg'); this.cNavy = pal.get('navy');
        this.cRockGlow = pal.get('rockGlow'); this.cRockDim = pal.get('rockDim'); this.cRock = pal.get('rock');
        this.cWhite = pal.get('white'); this.cShipDim = pal.get('shipDim');
        this.cCyan = pal.get('cyan'); this.cCyanDim = pal.get('cyanDim');
        this.cRed = pal.get('red'); this.cRedDim = pal.get('redDim');
        this.glow = false;                     // a one-pixel phosphor halo under rock outlines (off: the crisp look won)
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.field == null) return;
        const f = r.field;
        s.clip(OX, OY, FW, FH);

        for (const rock of f.rocks) this._wrapped(rock.x, rock.y, rock.r * 1.25, (x, y) => this._rock(s, rock, x, y));
        if (f.saucerOn) this._wrapped(f.saucerX, f.saucerY, 24, (x, y) => this._saucer(s, x, y, f.saucerT));
        for (const b of f.bolts) this._bolt(s, b);
        for (const bm of f.booms) this._boom(s, bm, f.now - bm.t0);
        if (f.shipAlive) {
            const tt = r.time;
            this._wrapped(f.shipX, f.shipY, 22, (x, y) => this._ship(s, x, y, f.shipA, f.thrusting, f.thrustT));
            if (f.shielding) this._ring(s, f.shipX, f.shipY, StarvectorField.ShieldR, 16, tt * 0.7, this.cCyan, this.cCyanDim);
            else if (r.mercyActive) this._ring(s, f.shipX, f.shipY, StarvectorField.ShieldR, 16, tt * 0.6, this.cCyanDim, null);
            else if (f.invulnT > 0 && r.p === Phase.Running) this._ring(s, f.shipX, f.shipY, StarvectorField.ShieldR + 1, 10, tt * 1.0, this.cCyanDim, null);
        }

        this._hud(s, r);
        this._overlays(s, r, t);
        s.noClip();
    }

    // ------------------------------------------------------------------ helpers
    _ln(s, x0, y0, x1, y1, c) {
        s.line(Math.round(OX + x0), Math.round(OY + y0), Math.round(OX + x1), Math.round(OY + y1), c);
    }

    _glowLn(s, x0, y0, x1, y1, c) {
        const a = Math.round(OX + x0), b = Math.round(OY + y0), e = Math.round(OX + x1), g = Math.round(OY + y1);
        s.line(a + 1, b, e + 1, g, c); s.line(a, b + 1, e, g + 1, c);
    }

    // draw at the position and, near an edge, once more on the far side (the field wraps)
    _wrapped(x, y, rad, draw) {
        draw(x, y);
        const ox = x < rad ? FW : x > FW - rad ? -FW : 0;
        const oy = y < rad ? FH : y > FH - rad ? -FH : 0;
        if (ox !== 0) draw(x + ox, y);
        if (oy !== 0) draw(x, y + oy);
        if (ox !== 0 && oy !== 0) draw(x + ox, y + oy);
    }

    // ------------------------------------------------------------------ rocks: hidden-line polyhedra
    _rock(s, rock, cx, cy) {
        const small = rock.size === 1;
        const scale = rock.r * (small ? 1.22 : 1.06);          // the silhouette sits on the hit circle
        if (this.glow) rockEdges(small ? OCTA : DODECA, rock, cx, cy, scale, rock.lumps, (x0, y0, x1, y1) => this._glowLn(s, x0, y0, x1, y1, this.cRockGlow));
        rockEdges(small ? OCTA : DODECA, rock, cx, cy, scale, rock.lumps, (x0, y0, x1, y1) => this._ln(s, x0, y0, x1, y1, this.cRock));
    }

    // ------------------------------------------------------------------ the ship
    _shipLines(s, list, px, py, a, c, glow) {
        const fx = Math.sin(a), fy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a);
        for (const q of list) {
            const x0 = px + (fx * q[0] + rx * q[1]) * SHIP_K, y0 = py + (fy * q[0] + ry * q[1]) * SHIP_K;
            const x1 = px + (fx * q[2] + rx * q[3]) * SHIP_K, y1 = py + (fy * q[2] + ry * q[3]) * SHIP_K;
            if (glow) this._glowLn(s, x0, y0, x1, y1, c); else this._ln(s, x0, y0, x1, y1, c);
        }
    }

    _ship(s, px, py, a, thrust, thrustT) {
        if (this.glow) this._shipLines(s, SHIP.hull, px, py, a, this.cNavy, true);
        if (thrust) {
            // a steady flame off the three pods that grows over the first fifth of a second
            const L = 3 + Math.min(1, thrustT * 5) * 5;
            this._shipLines(s, [[-10, 0, -10 - L - 2, 0], [-11, -4, -11 - L, -4], [-11, 4, -11 - L, 4]], px, py, a, this.cCyan, false);
            this._shipLines(s, [[-10 - L - 2, 0, -10 - L - 3, 0]], px, py, a, this.cWhite, false);
        }
        this._shipLines(s, SHIP.folds, px, py, a, this.cShipDim, false);
        this._shipLines(s, SHIP.pods, px, py, a, this.cCyan, false);
        this._shipLines(s, SHIP.keel, px, py, a, this.cCyan, false);
        this._shipLines(s, SHIP.hull, px, py, a, this.cWhite, false);
    }

    _ring(s, x, y, rad, dashes, phase, c, c2) {
        const step = TAU / dashes;
        for (let k = 0; k < dashes; k++) {
            const a0 = phase + k * step, a1 = a0 + step * 0.55;
            this._ln(s, x + Math.cos(a0) * rad, y + Math.sin(a0) * rad, x + Math.cos(a1) * rad, y + Math.sin(a1) * rad, c);
            if (c2) this._ln(s, x + Math.cos(a0) * (rad + 2), y + Math.sin(a0) * (rad + 2), x + Math.cos(a1) * (rad + 2), y + Math.sin(a1) * (rad + 2), c2);
        }
    }

    // ------------------------------------------------------------------ the saucer
    _saucer(s, x, y, st) {
        const c = this.cRed, K = 1.2;                       // 38 px across: the concept's saucer is a big target
        const L = (x0, y0, x1, y1, col) => this._ln(s, x + x0 * K, y + y0 * K, x + x1 * K, y + y1 * K, col);
        // rim: a flat ellipse
        let px = 16, py = 0;
        for (let k = 1; k <= 16; k++) {
            const a = k * TAU / 16, nx = Math.cos(a) * 16, ny = Math.sin(a) * 3.5;
            L(px, py, nx, ny, c); px = nx; py = ny;
        }
        // lower hull and its ribs
        L(-12, 3, -8, 7, c); L(-8, 7, 8, 7, c); L(8, 7, 12, 3, c);
        L(-4, 4, -3, 7, this.cRedDim); L(4, 4, 3, 7, this.cRedDim);
        // dome, with a sight in it
        px = -7; py = -2;
        for (let k = 1; k <= 8; k++) {
            const a = Math.PI + k * Math.PI / 8, nx = Math.cos(a) * 7, ny = -2 + Math.sin(a) * 6;
            L(px, py, nx, ny, c); px = nx; py = ny;
        }
        L(-2, -5, 2, -5, this.cRedDim); L(0, -7, 0, -3, this.cRedDim);
        // antennae
        L(-4, -7, -6, -12, c); L(4, -7, 6, -12, c);
        s.rect(Math.round(OX + x - 7.5 * K), Math.round(OY + y - 13 * K), 2, 2, c); s.rect(Math.round(OX + x + 5.5 * K), Math.round(OY + y - 13 * K), 2, 2, c);
        // the running light slides along the hull (motion, not a blink)
        const lx = x + Math.sin(st * 2.2) * 8 * K;
        s.rect(Math.round(OX + lx), Math.round(OY + y + 5 * K), 1, 1, this.cWhite);
    }

    _bolt(s, b) {
        const sp = Math.max(1e-3, Math.hypot(b.vx, b.vy)), L = b.enemy ? 6 : 5;
        const tx = b.x - b.vx / sp * L, ty = b.y - b.vy / sp * L;
        if (b.enemy) { this._ln(s, tx, ty, b.x, b.y, this.cRed); }
        else { this._ln(s, tx, ty, b.x, b.y, this.cCyan); s.setPixel(Math.round(OX + b.x), Math.round(OY + b.y), this.cWhite); }
    }

    // ------------------------------------------------------------------ explosions (from the boom records)
    _fade(u, steps) { return u < 0 || u >= 1 ? null : steps[Math.min(steps.length - 1, Math.trunc(u * steps.length))]; }

    _boom(s, bm, age) {
        if (age < 0) return;
        const seed = bm.seed;
        if (bm.kind === 0) {
            const big = bm.size;                                   // 3 large .. 1 small
            const n = 6 + big * 4;
            const steps = [this.cWhite, this.cRock, this.cRock, this.cRockDim, this.cRockGlow];
            for (let k = 0; k < n; k++) {
                const life = 0.45 + h01(seed, k * 3) * 0.45 + big * 0.08;
                const c = this._fade(age / life, steps);
                if (!c) continue;
                const a = h01(seed, k * 3 + 1) * TAU, sp = 22 + h01(seed, k * 3 + 2) * (30 + big * 8);
                const dx = Math.cos(a), dy = Math.sin(a);
                const x = wrapF(bm.x + (dx * sp + bm.vx * 0.5) * age, FW), y = wrapF(bm.y + (dy * sp + bm.vy * 0.5) * age, FH);
                this._ln(s, x - dx, y - dy, x + dx * 1.5, y + dy * 1.5, c);
            }
            // tumbling shards off the bigger rocks
            for (let k = 0; k < big + 1; k++) {
                const c = this._fade(age / (0.7 + big * 0.1), [this.cRock, this.cRockDim, this.cRockGlow]);
                if (!c) break;
                const a = h01(seed, 100 + k) * TAU, sp = 16 + h01(seed, 120 + k) * 22, rot = (h01(seed, 140 + k) - 0.5) * 8;
                const x = wrapF(bm.x + (Math.cos(a) * sp + bm.vx * 0.5) * age, FW), y = wrapF(bm.y + (Math.sin(a) * sp + bm.vy * 0.5) * age, FH);
                const L = 2 + big * 1.5, ra = a + rot * age;
                this._ln(s, x - Math.cos(ra) * L, y - Math.sin(ra) * L, x + Math.cos(ra) * L, y + Math.sin(ra) * L, c);
            }
        } else if (bm.kind === 1) {
            // the saucer: red shards and a ring of white streaks (concept frame 4)
            const shard = [this.cRed, this.cRed, this.cRedDim];
            for (let k = 0; k < 9; k++) {
                const c = this._fade(age / (0.9 + h01(seed, k) * 0.5), shard);
                if (!c) continue;
                const a = h01(seed, 10 + k) * TAU, sp = 18 + h01(seed, 20 + k) * 30, rot = (h01(seed, 30 + k) - 0.5) * 7;
                const x = bm.x + (Math.cos(a) * sp + bm.vx) * age, y = bm.y + Math.sin(a) * sp * age;
                const L = 2.5 + h01(seed, 40 + k) * 2.5, ra = a + rot * age;
                const p0x = x + Math.cos(ra) * L, p0y = y + Math.sin(ra) * L;
                const p1x = x + Math.cos(ra + 2.2) * L, p1y = y + Math.sin(ra + 2.2) * L;
                const p2x = x + Math.cos(ra + 4.1) * L * 0.8, p2y = y + Math.sin(ra + 4.1) * L * 0.8;
                this._ln(s, p0x, p0y, p1x, p1y, c); this._ln(s, p1x, p1y, p2x, p2y, c); this._ln(s, p2x, p2y, p0x, p0y, c);
            }
            const ring = this._fade(age / 0.8, [this.cWhite, this.cRock, this.cRockDim, this.cRockGlow]);
            if (ring)
                for (let k = 0; k < 12; k++) {
                    const a = k * TAU / 12 + h01(seed, 60 + k) * 0.3;
                    const r0 = 10 + age * 45, r1 = r0 + 4 + h01(seed, 70 + k) * 3;
                    this._ln(s, bm.x + Math.cos(a) * r0, bm.y + Math.sin(a) * r0 * 0.8, bm.x + Math.cos(a) * r1, bm.y + Math.sin(a) * r1 * 0.8, ring);
                }
        } else {
            // the ship: its own lines drift apart and turn, then fade; white and cyan sparks
            const hullC = this._fade(age / 1.5, [this.cWhite, this.cWhite, this.cRock, this.cShipDim, this.cNavy]);
            const cyanC = this._fade(age / 1.5, [this.cCyan, this.cCyan, this.cCyan, this.cCyanDim, this.cNavy]);
            const parts = [...SHIP.hull, ...SHIP.folds, ...SHIP.keel];
            const fx = Math.sin(bm.a), fy = -Math.cos(bm.a), rx = Math.cos(bm.a), ry = Math.sin(bm.a);
            for (let k = 0; k < parts.length; k++) {
                const c = k === parts.length - 1 ? cyanC : hullC;
                if (!c) break;
                const q = parts[k];
                const mu = (q[0] + q[2]) * 0.5 * SHIP_K, mv = (q[1] + q[3]) * 0.5 * SHIP_K;
                const hu = (q[2] - q[0]) * 0.5 * SHIP_K, hv = (q[3] - q[1]) * 0.5 * SHIP_K;
                const mx = fx * mu + rx * mv, my = fy * mu + ry * mv;
                const ml = Math.max(1, Math.hypot(mx, my));
                const sp = 10 + h01(seed, k) * 16, rot = (h01(seed, 20 + k) - 0.5) * 5 * age;
                const cx = wrapF(bm.x + mx + (mx / ml * sp + bm.vx * 0.3) * age, FW), cy = wrapF(bm.y + my + (my / ml * sp + bm.vy * 0.3) * age, FH);
                const ex = fx * hu + rx * hv, ey = fy * hu + ry * hv;
                const cr = Math.cos(rot), sr = Math.sin(rot);
                const dx = ex * cr - ey * sr, dy = ex * sr + ey * cr;
                this._ln(s, cx - dx, cy - dy, cx + dx, cy + dy, c);
            }
            for (let k = 0; k < 16; k++) {
                const c = this._fade(age / (0.5 + h01(seed, 50 + k) * 0.8), k % 2 === 0 ? [this.cWhite, this.cRock, this.cShipDim] : [this.cCyan, this.cCyan, this.cCyanDim]);
                if (!c) continue;
                const a = h01(seed, 70 + k) * TAU, sp = 20 + h01(seed, 90 + k) * 50;
                const x = wrapF(bm.x + (Math.cos(a) * sp + bm.vx * 0.3) * age, FW), y = wrapF(bm.y + (Math.sin(a) * sp + bm.vy * 0.3) * age, FH);
                s.setPixel(Math.round(OX + x), Math.round(OY + y), c);
            }
        }
    }

    // ------------------------------------------------------------------ HUD
    _miniShip(s, x, y, c) {
        // a spare ship, nose up, 12 px
        s.line(x, y - 6, x - 5, y + 5, c); s.line(x, y - 6, x + 5, y + 5, c);
        s.line(x - 5, y + 5, x, y + 2, c); s.line(x + 5, y + 5, x, y + 2, c);
        s.line(x, y - 5, x, y + 2, this.cCyan);
    }

    // the HUD floats over the field; each block knocks a background plate out of it first, so a rock
    // drifting under the score never garbles a digit
    _knock(s, x, y, w, h) { s.rect(x - 2, y - 2, w + 4, h + 4, this.cBg); }

    _hud(s, r) {
        const f = r.field, arc = PixelFont.Arcade, dsp = PixelFont.Display;
        // left: 1UP and the spare ships
        const spare = Math.max(0, Math.min(6, f.lives - (f.shipAlive ? 1 : 0)));
        this._knock(s, 14, 10, Math.max(arc.measure('1UP'), spare * 13), spare > 0 ? 25 : 7);
        s.text('1UP', 14, 10, arc, this.cCyan);
        for (let i = 0; i < spare; i++) this._miniShip(s, 19 + i * 13, 28, this.cWhite);
        // centre: the score, big (display digits, scale 2), and the BONUS line under it
        const sc = dn(f.score, 5), sw = dsp.measure(sc, 2);
        this._knock(s, 160 - (sw >> 1), 10, sw, 14);
        s.textCentered(sc, 160, 10, dsp, this.cRock, 2);
        if (r.time - r.bonusAt < 2.6 && r.lastBonus > 0) {
            const bt = 'BONUS ' + r.lastBonus, bw = arc.measure(bt);
            this._knock(s, 160 - (bw >> 1), 29, bw, 7);
            s.textCentered(bt, 160, 29, arc, this.cCyan);
        }
        // right: the wave, the shield gauge, the SHIELD ASSIST lamp (credit 3 on)
        const wt = 'WAVE ' + r.wave + '/' + r.waves, rows = r.mercyActive ? 2 : r.assistSaves > 0 ? 3 : 2;
        this._knock(s, 306 - 66, 10, 66, rows * 11 - 4);
        s.textRight(wt, 306, 10, arc, this.cRock);
        if (r.mercyActive) { s.textRight('SHIELDS UP', 306, 21, arc, this.cCyan); return; }
        const w = 36, x = 306 - w, frac = f.shieldMax > 0 ? Math.max(0, Math.min(1, f.shield / f.shieldMax)) : 0;
        s.textRight('SHLD', x - 4, 21, arc, f.shielding ? this.cCyan : this.cRockDim);
        s.frame(x, 21, w, 7, this.cCyanDim);
        const fill = Math.round((w - 4) * frac);
        if (fill > 0) s.rect(x + 2, 23, fill, 3, f.shielding ? this.cWhite : this.cCyan);
        if (r.assistSaves > 0) {
            const pulse = f.now - f.savedAt < 0.5;                 // one white pulse per save, never a strobe
            s.textRight('ASSIST', x - 4, 32, arc, pulse ? this.cWhite : f.assistLeft > 0 ? this.cCyan : this.cRockDim);
            for (let i = 0; i < r.assistSaves; i++) {
                const px = x + 1 + i * 9;
                if (i < f.assistLeft) s.rect(px, 32, 7, 7, this.cCyan); else s.frame(px, 32, 7, 7, this.cCyanDim);
            }
        }
    }

    _overlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = 120, P = r.p;
        if (P === Phase.Countdown) {
            const n = r.countdownLeft > 0 ? String(r.countdownLeft) : 'GO';
            s.textCenteredShadow(n, midX, 52, dsp, this.cRock, this.cNavy, 5);
            s.textCenteredShadow('WAVE 1', midX, 150, dsp, this.cCyan, this.cBg, 2);
            if (r.mercyActive) s.textCenteredShadow('SHIELDS UP', midX, 172, arc, this.cCyan, this.cBg);
            else if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('A FIRE   B SHIELD', midX, 172, arc, this.cRockDim, this.cBg);
        } else if (P === Phase.Banner) {
            s.textBox('WAVE ' + r.wave, midX, 62, dsp, 3, this.cRock, this.cCyan, this.cBg);
            s.textCenteredShadow('CLEARED ' + r.wavesCleared + ' OF ' + r.waves, midX, 150, arc, this.cCyan, this.cBg);
        } else if (P === Phase.Card || P === Phase.Over) {
            const spec = StarvectorSpec, won = r.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 30, dsp, 3, won ? this.cCyan : this.cRed, won ? this.cCyan : this.cRed, this.cBg);
            s.plate(midX - 84, midY + 4, 168, 46, this.cBg, this.cNavy);
            s.textCentered('SCORE ' + dn(r.score, 6), midX, midY + 10, arc, this.cRock, 2);
            s.textCentered('WAVES ' + r.wavesCleared + ' OF ' + r.waves, midX, midY + 32, arc, won ? this.cCyan : this.cRockDim, 2);
        }
    }
}
