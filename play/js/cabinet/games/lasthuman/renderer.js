// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE PICTURE.
// Port of LastHumanRenderer.cs.
//
// 1983 style: a black floor, chunky sprites authored in DOUBLE-WIDE pixels, a hazard-red arena rail.
//   - HUD band y 8..27: 1UP + score in display digits (x2), PHASE n + three phase pips, humans saved
//     (yellow) and men left (cyan), a red dotted rule under it all
//   - the floor 296x192 at (12, 34), a faint dot grid every tile, a two-tone red rail around it
//   - machines WARP IN as stretched scanlines that pull together (dim silver -> silver -> solid)
//   - the man faces where he walks; a white gun-arm shows the way A will fire
//   - rescue: a yellow beam and the points (1000 x chain) float up; machines burst into bits; a lost
//     man scatters cyan, then MAN DOWN on a double-framed plate
//   - the mercy credit: FREE RIDE / SHIELD ON and a ring round the man
// Nothing flashes: the only blinks are 1 Hz (YOU marker) and the spark twinkle at 2.5 Hz (a shape
// change, not a brightness strobe).
import { PixelFont, SurfaceDraw, d6 } from '../../sdk/index.js';
import { LastHumanPalette, LastHumanSpec } from './spec.js';
import { LastHumanRound, MachineKind, FxKind, Dir8 } from './round.js';
import * as Sprites from './sprites.js';

const OX = 12, OY = 34;
const AW = LastHumanRound.AW, AH = LastHumanRound.AH;
const Phase = LastHumanRound.Phase;

export class LastHumanRenderer {
    constructor() {
        const pal = LastHumanPalette;
        this.pal = pal;
        this.cBg = pal.get('bg'); this.cFloor = pal.get('floor');
        this.cSilverDk = pal.get('silverDk'); this.cSilver = pal.get('silver'); this.cSilverHi = pal.get('silverHi');
        this.cRedDk = pal.get('redDk'); this.cRed = pal.get('red');
        this.cYellowDk = pal.get('yellowDk'); this.cYellow = pal.get('yellow');
        this.cCyanDk = pal.get('cyanDk'); this.cCyan = pal.get('cyan');
    }

    draw(sim, s, t) {
        const r = sim instanceof LastHumanRound ? sim : null;
        s.noClip();
        s.clear(this.cBg);
        if (!r) return;
        const P = r.p;

        // ---- the floor: a faint dot every tile
        for (let y = 8; y < AH; y += 16)
            for (let x = 8; x < AW; x += 16) s.setPixel(OX + x, OY + y, this.cFloor);

        s.clip(OX, OY, AW, AH);

        // ---- humans
        for (const c of r.civilians) {
            if (c.saved) continue;
            const set = c.look === 0 ? Sprites.Man : Sprites.Woman;
            const walking = c.hx !== 0 || c.hy !== 0;
            const fr = walking && P === Phase.Play ? (Math.trunc(c.anim * 4) & 1) : 0;
            this.sprite(s, set[fr], c.x, c.y, c.hx < 0);
        }

        // ---- machines (warping ones as stretched scanlines)
        for (const m of r.machines) {
            if (m.dead) continue;
            const set = m.kind === MachineKind.Hulk ? Sprites.Hulk : m.kind === MachineKind.Brain ? Sprites.Brain : Sprites.Grunt;
            if (m.warp > 0) { this.warp(s, set[0], m.x, m.y, m.warpProgress); continue; }
            let fr = P === Phase.Play || P === Phase.Down ? (Math.trunc(m.anim * 5) & 1) : 0;
            if (m.kind === MachineKind.Hulk && m.stun > 0) fr = 0;
            this.sprite(s, set[fr], m.x, m.y, m.hx < 0);
        }

        // ---- sparks: a red star that turns between + and x (2.5 Hz)
        for (const sp of r.sparks) {
            if (sp.dead) continue;
            const x = OX + Math.trunc(sp.x), y = OY + Math.trunc(sp.y);
            const plus = (Math.trunc(sp.anim * 2.5) & 1) === 0;
            if (plus) { s.rect(x - 2, y, 5, 1, this.cRed); s.rect(x, y - 2, 1, 5, this.cRed); }
            else {
                s.setPixel(x - 2, y - 2, this.cRed); s.setPixel(x - 1, y - 1, this.cRed); s.setPixel(x + 1, y + 1, this.cRed); s.setPixel(x + 2, y + 2, this.cRed);
                s.setPixel(x + 2, y - 2, this.cRed); s.setPixel(x + 1, y - 1, this.cRed); s.setPixel(x - 1, y + 1, this.cRed); s.setPixel(x - 2, y + 2, this.cRed);
            }
            s.setPixel(x, y, this.cSilverHi);
        }

        // ---- bullets: a cyan streak with a white head
        for (const b of r.bullets) {
            if (b.dead) continue;
            const ux = Dir8.ux(b.dir), uy = Dir8.uy(b.dir);
            const hx = OX + Math.trunc(b.x), hy = OY + Math.trunc(b.y);
            const tx = OX + Math.trunc(b.x - ux * 6), ty = OY + Math.trunc(b.y - uy * 6);
            const ox = Dir8.DY[b.dir] !== 0 ? 1 : 0, oy = Dir8.DY[b.dir] === 0 ? 1 : 0;
            s.line(tx, ty, hx, hy, this.cCyan); s.line(tx + ox, ty + oy, hx + ox, hy + oy, this.cCyan);
            s.rect(hx, hy, 2, 2, this.cSilverHi);
        }

        // ---- the man
        const gone = P === Phase.Down || ((P === Phase.Card || P === Phase.Over) && !r.roundWon);
        if (!gone) this.drawPlayer(s, r, t);

        // ---- effects
        for (const f of r.fx) this.drawFx(s, f);

        s.noClip();

        // ---- the rail: two red lines and a dark red inner line
        s.frame(OX - 3, OY - 3, AW + 6, AH + 6, this.cRed);
        s.frame(OX - 2, OY - 2, AW + 4, AH + 4, this.cRed);
        s.frame(OX - 1, OY - 1, AW + 2, AH + 2, this.cRedDk);

        this.drawHud(s, r);
        this.drawOverlays(s, r, t);
    }

    drawPlayer(s, r, t) {
        const f = r.face;
        const back = f === 7 || f === 0 || f === 1;
        const set = back ? Sprites.PlayerBack : Sprites.Player;
        const fr = r.moving && r.p === Phase.Play ? (Math.trunc(r.walkAnim * 6) & 1) : 0;
        const cx = OX + Math.trunc(r.playerX), cy = OY + Math.trunc(r.playerY);
        this.sprite(s, set[fr], r.playerX, r.playerY, Dir8.DX[f] < 0);
        // the gun arm: where A fires
        const ux = Dir8.ux(f), uy = Dir8.uy(f);
        const ax0 = cx + Math.round(ux * 4), ay0 = cy + Math.round(uy * 4);
        const ax1 = cx + Math.round(ux * 8), ay1 = cy + Math.round(uy * 8);
        s.line(ax0, ay0, ax1, ay1, this.cSilverHi);
        s.line(ax0 + (Dir8.DY[f] !== 0 ? 1 : 0), ay0 + (Dir8.DY[f] === 0 ? 1 : 0), ax1 + (Dir8.DY[f] !== 0 ? 1 : 0), ay1 + (Dir8.DY[f] === 0 ? 1 : 0), this.cSilverHi);
        if (r.mercyActive) s.circle(cx, cy, 10, this.cCyanDk, false);
    }

    sprite(s, spr, x, y, flip) {
        s.blit(spr, OX + Math.trunc(x) - Math.trunc(spr.width / 2), OY + Math.trunc(y) - Math.trunc(spr.height / 2), this.pal, 1, flip);
    }

    // the warp-in: the sprite's rows start far apart and pull together; dim silver, then silver,
    // then the real colours for the last fifth
    warp(s, spr, x, y, p) {
        const q = 1 - p;
        const stretch = 1 + 9 * q * q;
        const x0 = OX + Math.trunc(x) - Math.trunc(spr.width / 2);
        const cy = OY + Math.trunc(y);
        for (let j = 0; j < spr.height; j++) {
            if (p < 0.45 && (j & 1) === 1) continue;
            const yy = Math.round(cy + (j + 0.5 - spr.height / 2) * stretch - 0.5);
            for (let i = 0; i < spr.width; i++) {
                const v = spr.at(i, j);
                if (v < 0) continue;
                const c = p < 0.45 ? this.cSilverDk : p < 0.8 ? this.cSilver : this.pal.at(v);
                s.setPixel(x0 + i, yy, c);
            }
        }
    }

    drawFx(s, f) {
        const p = f.life > 0 ? f.t / f.life : 1;
        const x = OX + Math.trunc(f.x), y = OY + Math.trunc(f.y);
        switch (f.kind) {
            case FxKind.Debris: {
                let a = f.of === MachineKind.Brain ? this.cRed : this.cSilver, b = f.of === MachineKind.Brain ? this.cSilverHi : this.cRed;
                if (p > 0.6) { a = f.of === MachineKind.Brain ? this.cRedDk : this.cSilverDk; b = this.cRedDk; }
                const rad = 2 + p * 22;
                for (let k = 0; k < 10; k++) {
                    const ang = k * 0.6283 + (f.seed % 100) * 0.01;
                    const m = rad * (0.6 + (k % 3) * 0.2);
                    s.rect(x + Math.trunc(Math.cos(ang) * m), y + Math.trunc(Math.sin(ang) * m), 2, 2, (k & 1) === 0 ? a : b);
                }
                break;
            }
            case FxKind.ManDown: {
                const e0 = 1 - Math.min(1, p * 1.6);
                const e = 1 - e0 * e0;
                const rad = 3 + 36 * e;
                for (let k = 0; k < 20; k++) {
                    const ang = k * 0.31416 + (f.seed % 100) * 0.01;
                    const m = rad * (0.55 + (k % 4) * 0.15);
                    const c = p < 0.5 ? ((k & 1) === 0 ? this.cCyan : this.cSilverHi) : ((k & 1) === 0 ? this.cCyanDk : this.cCyan);
                    s.rect(x + Math.trunc(Math.cos(ang) * m), y + Math.trunc(Math.sin(ang) * m), 2, 2, c);
                }
                if (p < 0.25) s.circle(x, y, 2 + Math.trunc(p * 40), this.cSilverHi, false);
                break;
            }
            case FxKind.Beam: {
                // the human goes up in a column of light that shrinks to their feet
                const c = p < 0.5 ? this.cYellow : this.cYellowDk;
                const hgt = Math.trunc(10 * (1 - p)) + 2;
                for (let k = -1; k <= 1; k++) s.rect(x + k * 4, y - hgt, k === 0 ? 2 : 1, hgt + 7, c);
                break;
            }
            case FxKind.Popup: {
                const txt = String(f.value);
                let c = p < 0.7 ? this.cYellow : this.cYellowDk;
                if (f.of === MachineKind.Brain || f.value === LastHumanRound.PtsBrain) c = p < 0.7 ? this.cRed : this.cRedDk;
                const py = Math.max(OY + 1, y - 24 - Math.trunc(p * 8));    // clear of the beam and the man, never off the floor
                s.textCentered(txt, x, py, PixelFont.Arcade, c);
                break;
            }
            case FxKind.Fizzle:
                s.setPixel(x - 1, y - 1, this.cRedDk); s.setPixel(x + 1, y + 1, this.cRedDk); s.setPixel(x + 1, y - 1, this.cRedDk); s.setPixel(x - 1, y + 1, this.cRedDk);
                break;
            case FxKind.Clank:
                s.rect(x - 1, y - 1, 2, 2, this.cSilverHi);
                break;
        }
    }

    drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        // left: 1UP and the score, big
        s.text('1UP', 8, 13, arc, this.cRed);
        s.text(d6(r.score), 30, 10, dsp, this.cSilverHi, 2);
        // centre: PHASE n and three pips
        s.text('PHASE', 134, 13, arc, this.cSilver);
        s.text(String(Math.max(1, r.burstsStarted)), 168, 10, dsp, this.cRed, 2);
        for (let i = 0; i < LastHumanRound.Bursts; i++) {
            const x = 188 + i * 7;
            if (i < r.burstsStarted) s.rect(x, 11, 5, 13, this.cRed); else s.frame(x, 11, 5, 13, this.cRedDk);
        }
        // right: humans saved, then men left
        s.blit(Sprites.Woman[0], 232, 11, this.pal);
        s.text(String(r.saved), 246, 10, dsp, this.cYellow, 2);
        s.blit(Sprites.Player[0], 282, 11, this.pal);
        s.textRight(String(r.men), 312, 10, dsp, this.cCyan, 2);
        s.dottedRule(8, 312, 28, 3, this.cRedDk);
    }

    drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + AH / 2;
        switch (r.p) {
            case Phase.SpawnIn:
                s.textCenteredShadow('GET READY', midX, midY - 48, dsp, this.cSilverHi, this.cRedDk, 3);
                if (r.regroup) s.textCenteredShadow('MEN LEFT ' + r.men, midX, midY + 24, dsp, this.cCyan, this.cBg, 2);
                else s.textCenteredShadow('SAVE THE HUMANS', midX, midY + 24, arc, this.cYellow, this.cBg, 2);
                if (r.mercyActive) s.textCenteredShadow('FREE RIDE - SHIELD ON', midX, midY + 46, arc, this.cCyan, this.cBg);
                if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', OX + Math.trunc(r.playerX), OY + Math.trunc(r.playerY) - 18, arc, this.cCyan, this.cBg);
                break;
            case Phase.Play:
                if (r.bannerTime < 1.8) s.textCenteredShadow('PHASE ' + r.burstsStarted, midX, OY + 8, dsp, this.cRed, this.cBg, 2);
                break;
            case Phase.Down:
                s.textBox('MAN DOWN', midX, midY - 30, dsp, 3, this.cSilverHi, this.cRed, this.cBg);
                s.plate(midX - 60, midY + 6, 120, 22, this.cBg, this.cCyan);
                s.textCentered('MEN LEFT ' + r.men, midX, midY + 10, dsp, this.cCyan, 1);
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = LastHumanSpec;
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 34, dsp, 3, won ? this.cYellow : this.cRed, this.cRed, this.cBg);
                s.plate(midX - 96, midY - 2, 192, 52, this.cBg, this.cRed);
                s.textCentered('SCORE ' + d6(r.score), midX, midY + 4, arc, this.cSilverHi, 2);
                s.textCentered('HUMANS SAVED ' + r.saved + ' OF ' + r.civilianCount, midX, midY + 24, arc, this.cYellow);
                s.textCentered('MACHINES ' + r.kills + ' OF ' + r.killableTotal, midX, midY + 36, arc, this.cSilver);
                break;
            }
        }
    }
}
