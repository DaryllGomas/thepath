// THE NODE · world 1 · LAST LIGHT on the Cabinet Engine · THE PICTURE.
// Port of LastLightRenderer.cs from Staging/Batch1/lastlight.
//
// A 1982 vector-ish look on black, palette-limited, inside the 8 px safe area:
//   - HUD band y 8..28: 1UP + the score in big display digits (red, as the old boards did),
//     WAVE with three pips in the middle, INBOUND and the count on the right, a dotted rule
//   - the sky y 30..205: a still star field (no twinkle: nothing strobes), missiles as red lines
//     with white heads, MIRV children keep their parent's leg, smart missiles bend and wear a
//     diamond, the saucer bomber, cyan interceptor trails with an X at the burst point, white
//     blasts with a yellow rim that step down yellow -> grey -> dark as they shrink
//   - the ground y 206..212: a moondust horizon, six domes (cyan shell, dithered glass, yellow
//     lights) and three mounds, each carrying its unused interceptors as a 4-3-2-1 pyramid
//   - under each silo its shots in display digits (OUT / RELOAD / -- when gone)
//   - a fallen dome steps white -> grey -> rubble; the mercy shield is a cyan ring
//   - WAVE n banners, WAVE n CLEAR, the bonus tally and the cards on double-framed plates
import { roundEven, PixelFont, d6 } from '../../sdk/index.js';
import { LastLightPalette, LastLightSpec, LastLightBomberSprite } from './spec.js';
import { LastLightRound } from './round.js';

const SkyTop = 30, Ground = 206;
const Phase = LastLightRound.Phase, Kind = LastLightRound.Kind;

function R(v) { return Math.trunc(roundEven(v)); }        // (int)Math.Round(x)

// ------------------------------------------------------------------ the still star field (a fixed hash, not the sim's RNG)
const starX = new Array(46), starY = new Array(46), starBright = new Array(46);
const speckX = new Array(40), speckY = new Array(40);
(function seedStars() {
    let h = 0x9E3779B9 >>> 0;
    for (let i = 0; i < starX.length; i++) {
        h = (h * 1664525 + 1013904223) >>> 0; starX[i] = 12 + ((h >>> 8) % 296);
        h = (h * 1664525 + 1013904223) >>> 0; starY[i] = 36 + ((h >>> 8) % 140);
        h = (h * 1664525 + 1013904223) >>> 0; starBright[i] = (h >>> 8) % 5 === 0;
    }
    for (let i = 0; i < speckX.length; i++) {
        h = (h * 1664525 + 1013904223) >>> 0; speckX[i] = 9 + ((h >>> 8) % 302);
        h = (h * 1664525 + 1013904223) >>> 0; speckY[i] = 208 + ((h >>> 8) % 4);
    }
})();

// the 4-3-2-1 pyramid of unused interceptors on each mound, bottom row first
const PyrDX = [-6, -2, 2, 6, -4, 0, 4, -2, 2, 0];
const PyrY = [202, 202, 202, 202, 199, 199, 199, 196, 196, 193];

export class LastLightRenderer {
    constructor() {
        const pal = LastLightPalette;
        this.cBg = pal.get('bg'); this.cDust = pal.get('dust'); this.cDustDim = pal.get('dustDim');
        this.cCyan = pal.get('cyan'); this.cCyanDim = pal.get('cyanDim'); this.cRed = pal.get('red'); this.cRedDim = pal.get('redDim');
        this.cWhite = pal.get('white'); this.cYellow = pal.get('yellow');
    }

    draw(sim, s, t) {
        s.noClip();
        s.clear(this.cBg);
        const g = sim;
        if (g == null) return;

        s.clip(8, SkyTop, 304, 213 - SkyTop);
        for (let i = 0; i < starX.length; i++) s.setPixel(starX[i], starY[i], starBright[i] ? this.cDust : this.cDustDim);
        this._drawGround(s);
        for (let i = 0; i < LastLightRound.Domes; i++) this._drawDome(s, g, i);
        for (let i = 0; i < LastLightRound.Silos; i++) this._drawSilo(s, g, i);
        if (g.p !== Phase.Card && g.p !== Phase.Over) {          // the card gets a still sky
            this._drawInterceptors(s, g);
            this._drawMissiles(s, g);
            if (g.saucer != null && g.saucer.alive) s.blit(LastLightBomberSprite, R(g.saucer.x) - 7, R(g.saucer.y) - 3, LastLightPalette);
            this._drawBlasts(s, g);
        }
        if (g.p === Phase.Play || g.p === Phase.Banner || g.p === Phase.Clear) this._drawCrosshair(s, R(g.crossX), R(g.crossY));

        s.clip(8, 8, 304, 224);
        this._drawSiloCounts(s, g);
        this._drawHud(s, g);
        this._drawOverlays(s, g);
        s.noClip();
    }

    // ------------------------------------------------------------------ the moon
    _drawGround(s) {
        s.rect(8, Ground, 304, 1, this.cDust);
        s.rect(8, Ground + 1, 304, 6, this.cDustDim);
        for (let i = 0; i < speckX.length; i++) s.setPixel(speckX[i], speckY[i], this.cDust);
        this._hill(s, 13, 5); this._hill(s, 145, 3); this._hill(s, 176, 3); this._hill(s, 266, 3); this._hill(s, 306, 4);
    }

    _hill(s, x, hw) {
        s.rect(x - hw, Ground - 1, hw * 2 + 1, 1, this.cDust);
        if (hw > 3) s.rect(x - hw + 2, Ground - 2, hw * 2 - 3, 1, this.cDust);
    }

    _drawDome(s, g, i) {
        const cx = LastLightRound.DomeX[i];
        const r = LastLightRound.DomeRadius;
        if (!g.domeAlive[i]) {
            const since = g.time - g.domeLostAt[i];
            if (since < 0.15) { this._domeShape(s, cx, r, this.cWhite, this.cWhite, this.cWhite, false); return; }
            if (since < 0.45) { this._domeShape(s, cx, r, this.cDust, this.cDustDim, this.cDustDim, false); return; }
            this._rubble(s, cx, 10, i);
            return;
        }
        this._domeShape(s, cx, r, this.cCyan, this.cCyanDim, this.cYellow, true);
    }

    _domeShape(s, cx, r, shell, glass, lights, dither) {
        cx = R(cx); r = R(r);
        for (let y = Ground - r; y < Ground; y++) {
            const dy = Ground - y;
            const hw = R(Math.sqrt(r * r - dy * dy));
            for (let x = cx - hw; x <= cx + hw; x++) {
                const edge = x === cx - hw || x === cx + hw || y === Ground - r;
                if (edge) s.setPixel(x, y, shell);
                else if (!dither || ((x + y) & 1) === 0) s.setPixel(x, y, glass);
            }
        }
        for (let a = 0; a <= 180; a += 6) {
            const rad = a * Math.PI / 180;
            s.setPixel(cx + R(Math.cos(rad) * r), Ground - R(Math.sin(rad) * r), shell);
        }
        for (let k = -6; k <= 6; k += 3) s.setPixel(cx + k, Ground - 3, lights);
        s.setPixel(cx - 1, Ground - 6, lights); s.setPixel(cx + 1, Ground - 6, lights);
        s.setPixel(cx, Ground - r - 1, shell);
        s.setPixel(cx, Ground - r - 2, lights === this.cYellow ? this.cWhite : shell);
    }

    _rubble(s, cx, hw, salt) {
        cx = R(cx);
        for (let x = cx - hw; x <= cx + hw; x++) {
            const k = (x * 7 + salt * 13) & 7;
            const h = 1 + (k % 3) + (Math.abs(x - cx) < hw / 2 ? 1 : 0);
            s.rect(x, Ground - h, 1, h, this.cDustDim);
            if (k === 5) s.setPixel(x, Ground - h - 1, this.cRedDim);
        }
    }

    _drawSilo(s, g, i) {
        const cx = LastLightRound.SiloX[i];
        if (!g.siloAlive[i]) {
            const since = g.time - g.siloLostAt[i];
            if (since < 0.15) { this._mound(s, cx, this.cWhite, this.cWhite); return; }
            if (since < 0.45) { this._mound(s, cx, this.cDustDim, this.cDustDim); return; }
            this._rubble(s, cx, 13, 20 + i);
            return;
        }
        this._mound(s, cx, this.cDust, this.cDustDim);
        const n = g.reload[i] > 0 ? 0 : g.shots[i];
        for (let k = 0; k < n && k < PyrDX.length; k++) s.rect(R(cx) + PyrDX[k], PyrY[k], 1, 2, this.cCyan);
    }

    _mound(s, cx, body, slot) {
        cx = R(cx);
        for (let y = 192; y < Ground; y++) {
            const hw = 4 + (y - 192);
            s.rect(cx - hw, y, hw * 2 + 1, 1, body);
        }
        s.rect(cx - 2, 192, 5, 1, slot);
    }

    _drawSiloCounts(s, g) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        for (let i = 0; i < LastLightRound.Silos; i++) {
            const cx = R(LastLightRound.SiloX[i]);
            if (!g.siloAlive[i]) { s.textCentered('--', cx, 217, dsp, this.cRedDim); continue; }
            if (g.reload[i] > 0) { s.textCentered('RELOAD', cx, 217, arc, this.cCyan); continue; }
            const n = g.shots[i];
            if (n <= 0) { s.textCentered('OUT', cx, 217, dsp, this.cRed); continue; }
            s.textCentered(String(n), cx, 217, dsp, n <= 3 ? this.cYellow : this.cCyan);
        }
    }

    // ------------------------------------------------------------------ the fight
    _drawMissiles(s, g) {
        for (const m of g.missiles) {
            if (!m.alive) continue;
            const hx = R(m.x), hy = R(m.y);
            if (m.k === Kind.Smart) {
                const tr = m.trail;
                let px = R(m.ox), py = R(m.oy);
                if (tr != null)
                    for (let k = 2; k + 1 < tr.length; k += 2) {
                        const qx = R(tr[k]), qy = R(tr[k + 1]);
                        s.line(px, py, qx, qy, this.cRed);
                        px = qx; py = qy;
                    }
                s.line(px, py, hx, hy, this.cRed);
                s.setPixel(hx, hy - 2, this.cWhite); s.setPixel(hx, hy + 2, this.cWhite);
                s.setPixel(hx - 2, hy, this.cWhite); s.setPixel(hx + 2, hy, this.cWhite);
                s.setPixel(hx - 1, hy - 1, this.cWhite); s.setPixel(hx + 1, hy - 1, this.cWhite);
                s.setPixel(hx - 1, hy + 1, this.cWhite); s.setPixel(hx + 1, hy + 1, this.cWhite);
                s.setPixel(hx, hy, this.cRed); s.setPixel(hx - 1, hy, this.cRed); s.setPixel(hx + 1, hy, this.cRed);
                s.setPixel(hx, hy - 1, this.cRed); s.setPixel(hx, hy + 1, this.cRed);
                continue;
            }
            const ox = R(m.ox), oy = R(m.oy);
            if (m.child) s.line(R(m.ax), R(m.ay), ox, oy, this.cRed);
            s.line(ox, oy, hx, hy, this.cRed);
            s.rect(hx - 1, hy - 1, 2, 2, this.cWhite);
        }
    }

    _drawInterceptors(s, g) {
        for (const c of g.interceptors) {
            if (!c.alive) continue;
            const hx = R(c.x), hy = R(c.y);
            s.line(Math.trunc(c.sx), Math.trunc(c.sy), hx, hy, this.cCyanDim);
            s.rect(hx - 1, hy - 1, 2, 2, this.cCyan);
            const tx = R(c.tx), ty = R(c.ty);
            for (let k = -2; k <= 2; k++) { s.setPixel(tx + k, ty + k, this.cCyan); s.setPixel(tx + k, ty - k, this.cCyan); }
        }
    }

    _drawBlasts(s, g) {
        for (const b of g.blasts) {
            if (!b.alive) continue;
            const x = R(b.x), y = R(b.y), r = R(b.r);
            const st = b.stage(); const stage = st[0], f = st[1];
            if (b.shield) {
                s.clip(8, SkyTop, 304, Ground - SkyTop);
                const c = stage === 2 && f > 0.5 ? this.cCyanDim : this.cCyan;
                s.circle(x, y, r, c, false); s.circle(x, y, r - 1, c, false);
                s.clip(8, SkyTop, 304, 213 - SkyTop);
                continue;
            }
            if (r < 1) { s.setPixel(x, y, b.enemy ? this.cRed : this.cWhite); continue; }
            if (b.enemy) {
                if (stage < 2) { s.circle(x, y, r, this.cRed, true); s.circle(x, y, Math.max(0, Math.trunc(r * 0.45)), this.cWhite, true); }
                else s.circle(x, y, r, f < 0.5 ? this.cRed : this.cRedDim, true);
                continue;
            }
            if (stage < 2) { s.circle(x, y, r, this.cWhite, true); s.circle(x, y, r, this.cYellow, false); }
            else if (f < 0.4) { s.circle(x, y, r, this.cWhite, true); s.circle(x, y, r, this.cYellow, false); }
            else if (f < 0.7) { s.circle(x, y, r, this.cYellow, true); s.circle(x, y, r, this.cDust, false); }
            else { s.circle(x, y, r, this.cDust, true); s.circle(x, y, r, this.cDustDim, false); }
        }
    }

    _drawCrosshair(s, x, y) {
        s.rect(x - 5, y, 3, 1, this.cYellow); s.rect(x + 3, y, 3, 1, this.cYellow);
        s.rect(x, y - 5, 1, 3, this.cYellow); s.rect(x, y + 3, 1, 3, this.cYellow);
        s.setPixel(x, y, this.cYellow);
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cDust);
        s.text(d6(g.score), 30, 10, dsp, this.cRed, 2);
        s.textCentered('WAVE', 172, 8, arc, this.cDust);
        const allDone = g.p === Phase.Tally || (g.p >= Phase.Card && g.roundWon);
        for (let i = 0; i < LastLightRound.SubWaves; i++) {
            const x = 157 + i * 11, y = 18;
            const cleared = allDone || i < g.wavesCleared;
            if (cleared) s.rect(x, y, 8, 8, this.cCyan);
            else if (i === g.subWave) { s.frame(x, y, 8, 8, this.cYellow); s.frame(x + 1, y + 1, 6, 6, this.cYellow); s.rect(x + 3, y + 3, 2, 2, this.cYellow); }
            else s.frame(x, y, 8, 8, this.cDustDim);
        }
        s.textRight('INBOUND', 312, 8, arc, this.cRed);
        s.textRight(String(g.inbound), 312, 18, dsp, this.cDust);
        s.dottedRule(8, 312, 28, 3, this.cDustDim);
    }

    // ------------------------------------------------------------------ banners, tally, cards
    _drawOverlays(s, g) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mid = 160;
        switch (g.p) {
            case Phase.Banner: {
                s.textBox('WAVE ' + (g.subWave + 1), mid, 78, dsp, 3, this.cWhite, this.cCyan, this.cBg);
                const line = g.subWave === 0 ? 'DEFEND THE DOMES' : g.subWave === 1 ? 'THEY COME FASTER' : 'FINAL WAVE';
                let y = 114;
                this._plateLine(s, line, mid, y, g.subWave === 2 ? this.cRed : this.cYellow, this.cDustDim);
                y += 18;
                if (g.mercyActive) { this._plateLine(s, 'THE LAST LIGHT WILL HOLD', mid, y, this.cCyan, this.cCyanDim); y += 18; }
                else if (g.refillsLeft > 0 && g.subWave === 0) { this._plateLine(s, 'ONE RELOAD IN RESERVE', mid, y, this.cCyan, this.cCyanDim); y += 18; }
                break;
            }
            case Phase.Clear: {
                s.textBox('WAVE ' + (g.subWave + 1) + ' CLEAR', mid, 82, dsp, 2, this.cCyan, this.cCyan, this.cBg);
                this._plateLine(s, 'DOMES ' + g.domesLeft + '   SHOTS ' + g.shotsLeft, mid, 112, this.cDust, this.cDustDim);
                break;
            }
            case Phase.Tally:
                this._drawTally(s, g);
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = LastLightSpec;
                const won = g.roundWon;
                if (won) s.textBox(spec.roundWonText, mid, 70, dsp, 2, this.cCyan, this.cCyan, this.cBg);
                else s.textBox(spec.roundLostText, mid, 66, dsp, 3, this.cRed, this.cRed, this.cBg);
                s.plate(mid - 84, 98, 168, 46, this.cBg, won ? this.cCyan : this.cRed);
                s.frame(mid - 82, 100, 164, 42, won ? this.cCyanDim : this.cRedDim);
                s.textCentered('SCORE ' + d6(g.score), mid, 105, arc, this.cDust, 2);
                s.textCentered('DOMES ' + g.domesLeft + ' OF 6', mid, 126, dsp, won ? this.cCyan : this.cRed);
                break;
            }
        }
    }

    _plateLine(s, text, cx, y, fg, border) {
        const arc = PixelFont.Arcade;
        const w = arc.measure(text) + 12;
        s.plate(cx - Math.trunc(w / 2), y - 4, w, 15, this.cBg, border);
        s.textCentered(text, cx, y, arc, fg);
    }

    _drawTally(s, g) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const x0 = 56, y0 = 58, w = 208, h = 104;
        s.plate(x0, y0, w, h, this.cBg, this.cCyan);
        s.frame(x0 + 2, y0 + 2, w - 4, h - 4, this.cCyan);
        s.textCentered('BONUS POINTS', 160, y0 + 10, dsp, this.cYellow);
        let ry = y0 + 34;
        for (let i = 0; i < g.tallyDomes; i++) this._miniDome(s, x0 + 16 + i * 14, ry + 6);
        s.textRight(g.tallyDomes > 0 ? String(g.tallyDomes * LastLightRound.PtsDome) : '', x0 + w - 12, ry, dsp, this.cCyan);
        ry += 22;
        for (let i = 0; i < g.tallyShots; i++) s.rect(x0 + 16 + (i % 30) * 4, ry, 2, 6, this.cCyan);
        s.textRight(g.tallyShots > 0 ? String(g.tallyShots * LastLightRound.PtsShot) : '', x0 + w - 12, ry, dsp, this.cCyan);
        ry += 22;
        s.dottedRule(x0 + 12, x0 + w - 12, ry - 6, 3, this.cDustDim);
        s.text('BONUS', x0 + 16, ry + 2, arc, this.cDust);
        s.textRight(String(g.tallyBonus), x0 + w - 12, ry, dsp, this.cWhite, 2);
    }

    _miniDome(s, cx, baseY) {
        s.rect(cx - 2, baseY - 5, 5, 1, this.cCyan);
        s.rect(cx - 4, baseY - 4, 9, 1, this.cCyan);
        s.rect(cx - 5, baseY - 3, 11, 3, this.cCyan);
        s.rect(cx - 3, baseY - 2, 7, 1, this.cYellow);
        s.rect(cx - 5, baseY, 11, 1, this.cDust);
    }
}
