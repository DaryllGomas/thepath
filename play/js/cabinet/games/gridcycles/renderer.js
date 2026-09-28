// THE NODE · world 1 · GRID CYCLES '82 on the Cabinet Engine · THE PICTURE.
// Port of GridCyclesRenderer.cs from Staging/Batch1/gridcycles_tune (with the ASSIST lamp).
//
//   - HUD band y 8..27: 1UP + the score in big display-font digits, the duel pips in the middle, the
//     ASSIST lamp from credit 3 (lit while wall-assist saves remain, one white pulse per save, dark when
//     spent), the rival's speed on the right, a magenta dotted rule under it all
//   - the arena 74 x 49 cells x 4 px at (12, 32): faint grid every 2 cells, bright every 4, a magenta
//     edge; walls are a bright core in a coloured tube, joined along the trail
//   - DEREZ the palette way: one grid flash, the dying trail blinks white at 2.5 Hz (under the 3 Hz
//     strobe floor), then steps down through two darker palette entries
//   - countdown in display digits at scale 5; DEREZZED / ROUND WON / GAME OVER on double-framed plates;
//     FREE RIDE on the mercy credit; a YOU tag over your cycle during the countdown
import { f32, d6, roundEven, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { GridCyclesPalette, GridCyclesSpec } from './spec.js';
import { GridCyclesRound } from './round.js';

const CellPx = 4;
const OX = 12, OY = 32;
const AW = GridCyclesRound.CellsW * CellPx, AH = GridCyclesRound.CellsH * CellPx;   // 296 x 196
const Phase = GridCyclesRound.Phase;

function refSpeed() {
    for (const k of GridCyclesSpec.knobs) if (k.name === 'baseSpeed') return k.base;
    return f32(12);
}

export class GridCyclesRenderer {
    constructor() {
        const pal = GridCyclesPalette;
        this.cBg = pal.get('bg'); this.cGridMinor = pal.get('gridMinor'); this.cGrid = pal.get('grid');
        this.cEdge = pal.get('magenta'); this.cEdgeDim = pal.get('magentaDim');
        this.cCyan = pal.get('cyan'); this.cCyanCore = pal.get('cyanCore'); this.cCyanDim = pal.get('cyanDim');
        this.cOrange = pal.get('orange'); this.cOrangeCore = pal.get('orangeCore'); this.cOrangeDim = pal.get('orangeDim');
        this.cHud = pal.get('hud'); this.cWhite = pal.get('white');
        this.refSpeed = refSpeed();            // SPD 100 = the cabinet's first-credit speed
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.duel == null) return;
        t = f32(t);

        const P = r.p;
        const pt = r.phaseTime;
        const derez = P === Phase.Derez || P === Phase.Card || P === Phase.Over;
        const flash = P === Phase.Derez && pt < f32(0.12);

        // ---- the grid: faint every 2 cells, bright every 4 (the bright lines flash on a derez)
        for (let cx = 0; cx <= GridCyclesRound.CellsW; cx += 2)
            s.rect(OX + cx * CellPx, OY, 1, AH, cx % 4 === 0 ? (flash ? this.cWhite : this.cGrid) : this.cGridMinor);
        for (let cy = 0; cy <= GridCyclesRound.CellsH; cy += 2)
            s.rect(OX, OY + cy * CellPx, AW, 1, cy % 4 === 0 ? (flash ? this.cWhite : this.cGrid) : this.cGridMinor);

        // ---- the walls
        const g = r.duel;
        const W = g.W, H = g.H, cells = g.cells, seq = g.seq;
        const who = r.derezWho;
        const col = { edge: null, core: null };
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const v = cells[y * W + x];
                if (v === 0) continue;
                const dying = derez && ((v === 1 && (who & 1) !== 0) || (v === 2 && (who & 2) !== 0));
                col.edge = v === 1 ? this.cCyan : this.cOrange; col.core = v === 1 ? this.cCyanCore : this.cOrangeCore;
                if (dying) this._dyingColours(v, P, pt, col);
                const px0 = OX + x * CellPx, py0 = OY + y * CellPx;
                s.rect(px0, py0, CellPx, CellPx, col.edge);
                s.rect(px0 + 1, py0 + 1, CellPx - 2, CellPx - 2, col.core);
                // join the bright core to the next cell of the same trail: one continuous tube
                const sq = seq[y * W + x];
                if (x + 1 < W && cells[y * W + x + 1] === v && Math.abs(seq[y * W + x + 1] - sq) === 1)
                    s.rect(px0 + CellPx - 1, py0 + 1, 2, CellPx - 2, col.core);
                if (y + 1 < H && cells[(y + 1) * W + x] === v && Math.abs(seq[(y + 1) * W + x] - sq) === 1)
                    s.rect(px0 + 1, py0 + CellPx - 1, CellPx - 2, 2, col.core);
            }

        // ---- the cycles: a bright head a size up, or the derez burst
        s.clip(OX, OY, AW, AH);
        this._drawHead(s, g.player, this.cCyan, derez && (who & 1) !== 0, P, pt, r.derezSeconds);
        this._drawHead(s, g.rival, this.cOrange, derez && (who & 2) !== 0, P, pt, r.derezSeconds);
        s.noClip();

        // ---- the arena edge
        const e = flash ? this.cWhite : this.cEdge;
        s.rect(OX - 2, OY - 2, AW + 4, 2, e); s.rect(OX - 2, OY + AH, AW + 4, 2, e);
        s.rect(OX - 2, OY - 2, 2, AH + 4, e); s.rect(OX + AW, OY - 2, 2, AH + 4, e);

        this._drawHud(s, r);

        // ---- overlays
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + Math.trunc(AH / 2);
        if (P === Phase.Countdown) {
            const n = r.countdownLeft > 0 ? String(r.countdownLeft) : 'GO';
            s.textCenteredShadow(n, midX, midY - 32, dsp, this.cHud, this.cBg, 5);
            s.textCenteredShadow('DUEL ' + r.duelNumber, midX, midY + 14, dsp, this.cEdge, this.cBg, 2);
            if (r.mercyActive) s.textCenteredShadow('FREE RIDE', midX, midY + 36, arc, this.cHud, this.cBg);
            // which one is you
            const hx = OX + g.player.x * CellPx + 2, hy = OY + g.player.y * CellPx - 12;
            if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', hx, hy, arc, this.cCyan, this.cBg);
        } else if (P === Phase.Derez) {
            const c = who === 1 ? this.cCyan : who === 2 ? this.cOrange : this.cWhite;
            const name = who === 1 ? 'YOU' : who === 2 ? 'RIVAL' : 'BOTH';
            s.textBox('DEREZZED', midX, midY - 14, dsp, 3, this.cWhite, c, this.cBg);
            s.plate(midX - 46, midY + 16, 92, 22, this.cBg, c);
            s.textCentered(name, midX, midY + 20, dsp, c, 2);
        } else if (P === Phase.Card || P === Phase.Over) {
            const spec = GridCyclesSpec;
            const won = r.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 26, dsp, 3, won ? this.cCyan : this.cOrange, this.cEdge, this.cBg);
            s.plate(midX - 84, midY + 6, 168, 46, this.cBg, this.cEdge);
            s.textCentered('SCORE ' + d6(r.score), midX, midY + 12, arc, this.cHud, 2);
            s.textCentered(r.playerWins + ' - ' + r.rivalWins, midX, midY + 32, dsp, this.cWhite, 2);
        }
    }

    _dyingColours(v, P, pt, col) {
        const baseC = v === 1 ? this.cCyan : this.cOrange, dim = v === 1 ? this.cCyanDim : this.cOrangeDim;
        if (P === Phase.Derez && pt < f32(0.12)) { col.edge = this.cWhite; col.core = this.cWhite; return; }
        if (P === Phase.Derez && pt < f32(0.8)) {
            if (Math.trunc(f32(pt * 5)) % 2 === 0) { col.edge = this.cWhite; col.core = this.cWhite; }   // 2.5 Hz
            return;
        }
        if (P === Phase.Derez && pt < f32(1.2)) { col.edge = dim; col.core = baseC; return; }
        col.edge = this.cGridMinor; col.core = dim;
    }

    _drawHead(s, c, colr, dying, P, pt, derezSeconds) {
        const x0 = OX + c.x * CellPx - 1, y0 = OY + c.y * CellPx - 1;
        if (dying) {
            // a burst of scattered bits around the crash
            const tt = P === Phase.Derez ? pt : derezSeconds;
            const rad = 2 + Math.trunc(f32(tt * 14));
            for (let k = 0; k < 18; k++) {
                const a = f32(f32(k * f32(0.349)) + f32(c.x * f32(0.1)));
                const m = f32(rad * f32(f32(0.6) + f32((k % 3) * f32(0.2))));
                const bx = x0 + 2 + Math.trunc(Math.cos(a) * m);
                const by = y0 + 2 + Math.trunc(Math.sin(a) * m);
                s.rect(bx, by, 2, 2, k % 2 === 0 ? colr : this.cWhite);
            }
            return;
        }
        s.rect(x0, y0, CellPx + 2, CellPx + 2, colr);
        s.rect(x0 + 1, y0 + 1, CellPx, CellPx, this.cWhite);
    }

    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        // left: 1UP and the score, big
        s.text('1UP', 8, 13, arc, this.cEdge);
        s.text(d6(r.score), 30, 10, dsp, this.cHud, 2);
        // centre: the duel pips, yours cyan, the rival's orange
        for (let i = 0; i < r.duelsToWin; i++) {
            const x = 130 + i * 12;
            if (i < r.playerWins) s.rect(x, 11, 10, 10, this.cCyan); else { s.frame(x, 11, 10, 10, this.cCyan); s.frame(x + 1, 12, 8, 8, this.cCyan); }
            const xr = 171 + i * 12;
            if (i < r.rivalWins) s.rect(xr, 11, 10, 10, this.cOrange); else { s.frame(xr, 11, 10, 10, this.cOrange); s.frame(xr + 1, 12, 8, 8, this.cOrange); }
        }
        s.textCentered('VS', 160, 14, PixelFont.Small, this.cEdge);
        // the ASSIST lamp (credit 3 on): a small framed tag between the pips and the rival
        if (r.assistShown) {
            const pulse = r.sinceSave < f32(0.4);                 // one pulse per save, never a strobe
            const txt = pulse ? this.cWhite : r.assistLit ? this.cCyan : this.cCyanDim;
            const rim = pulse ? this.cCyan : r.assistLit ? this.cCyanDim : this.cGridMinor;
            s.frame(212, 10, 41, 13, rim);
            s.text('ASSIST', 215, 13, arc, txt);
        }
        // right: the rival and its speed in cells/s against the first credit's (100, 95, 90, 86, then 25)
        s.textRight('RIVAL', 312, 8, arc, this.cOrange);
        const spd = 'SPD ' + roundEven(f32(f32(100 * r.rivalSpeed) / Math.max(f32(0.01), this.refSpeed)));
        s.textRight(spd, 312, 18, arc, this.cOrange);
        s.dottedRule(8, 312, 27, 3, this.cEdge);
    }
}
