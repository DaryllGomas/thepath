// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE PICTURE.
// Port of StackAttackRenderer.cs from Staging/Batch2/stackattack.
//
// Built for a curved tube seen from 0.8 m: 10 px cells, every block a chunky bevel (light top-left, a
// 2 px dark edge bottom-right, a shine), big display-font digits, nothing inside the 8 px margin.
//   - the well: 10 x 20 cells of navy at (110, 10) with a faint dot grid and 3 px bevelled walls; the
//     two spawn rows sit above the rim. The mercy ceiling (+2 rows) runs the walls and the navy up
//     through the spawn rows and moves the dashed CEILING line to the top.
//   - left panel: SCORE (display x2), LEVEL, and the piece statistics (a mini of each shape + count)
//   - right panel: NEXT box, LINES x/10 (display x3) with ten pips, the DOUBLE/TRIPLE call-out, SPEED
//     (the fall rate, so the mercy shows: 100, 90, 81, 73) and CEILING
//   - a clear: the rows go white for 0.2 s, then wipe from the centre out (no strobe); four rows at
//     once puts STACK ATTACK up in the well
//   - a top out: the stack turns to stone row by row from the top (a curtain, not a blink); on the
//     fifth credit the stone then drains out of the well and WELL CLEAR / LINES KEPT goes up
import { f32, d6, dn, roundEven, PixelFont } from '../../sdk/index.js';
import { StackAttackPalette, StackAttackSpec } from './spec.js';
import { StackAttackSim, Tetromino } from './sim.js';

const Cell = 10, WX = 110, WY = 10;
const Phase = StackAttackSim.Phase;
const LX = 10, RX = 216, RW = 94;
const StatOrder = [Tetromino.T, Tetromino.J, Tetromino.Z, Tetromino.O, Tetromino.S, Tetromino.L, Tetromino.I];

export class StackAttackRenderer {
    constructor() {
        const p = StackAttackPalette;
        this.cBg = p.get('bg'); this.cWell = p.get('well'); this.cGrid = p.get('wellGrid');
        this.cFrame = p.get('frame'); this.cFrameHi = p.get('frameHi');
        this.cWhite = p.get('white'); this.cHud = p.get('hud'); this.cMag = p.get('magenta'); this.cMagLo = p.get('magentaLo');
        this.cCyan = p.get('cyan'); this.cCyanHi = p.get('cyanHi');
        this.cStone = p.get('stone'); this.cStoneHi = p.get('stoneHi'); this.cStoneLo = p.get('stoneLo');
        const fam = ['cyan', 'magenta', 'violet', 'azure'];
        this.tBase = []; this.tHi = []; this.tLo = [];
        for (let i = 0; i < 4; i++) { this.tBase[i] = p.get(fam[i]); this.tHi[i] = p.get(fam[i] + 'Hi'); this.tLo[i] = p.get(fam[i] + 'Lo'); }
        this.W = 10; this.Rows = 22;
        this.WellW = this.W * Cell; this.GridH = this.Rows * Cell;   // 100 x 220
    }

    draw(sim, s, t) {
        const g = sim;
        s.noClip();
        s.clear(this.cBg);
        if (g == null) return;
        this._drawWell(s, g);
        this._drawLeft(s, g);
        this._drawRight(s, g);
        this._drawOverlays(s, g);
    }

    // ------------------------------------------------------------------ blocks
    _block(s, x, y, face, hi, lo) {
        s.rect(x, y, Cell, Cell, lo);                   // the dark edge shows 2 px on the right and bottom
        s.rect(x, y, Cell - 1, 1, hi);                  // light top
        s.rect(x, y, 1, Cell - 1, hi);                  // light left
        s.rect(x + 1, y + 1, Cell - 3, Cell - 3, face);
        s.rect(x + 2, y + 2, 2, 2, hi);                 // the shine
    }

    _tintBlock(s, x, y, tint) { this._block(s, x, y, this.tBase[tint], this.tHi[tint], this.tLo[tint]); }
    _stoneBlock(s, x, y) { this._block(s, x, y, this.cStone, this.cStoneHi, this.cStoneLo); }
    _flashBlock(s, x, y) { s.rect(x, y, Cell, Cell, this.cCyanHi); s.rect(x, y, Cell - 1, Cell - 1, this.cWhite); }

    _mini(s, x, y, tint) {
        s.rect(x, y, 5, 5, this.tLo[tint]);
        s.rect(x, y, 4, 4, this.tHi[tint]);
        s.rect(x + 1, y + 1, 3, 3, this.tBase[tint]);
    }

    // ------------------------------------------------------------------ the well
    _drawWell(s, g) {
        const rows = this.Rows, W = this.W;
        const top = g.topLimit;
        const wallTop = WY + top * Cell, floor = WY + this.GridH;

        s.rect(WX, wallTop, this.WellW, floor - wallTop, this.cWell);
        for (let r = top + 1; r < rows; r++)
            for (let c = 1; c < W; c++)
                s.setPixel(WX + c * Cell - 1, WY + r * Cell - 1, this.cGrid);
        // the ceiling: a dashed line along the top of the well
        for (let x = WX; x < WX + this.WellW; x += 6) s.rect(x, wallTop, 4, 1, this.cMagLo);

        // walls and floor: 3 px, bevelled
        s.rect(WX - 3, wallTop, 3, floor - wallTop + 2, this.cFrame);
        s.rect(WX - 2, wallTop, 1, floor - wallTop + 1, this.cFrameHi);
        s.rect(WX + this.WellW, wallTop, 3, floor - wallTop + 2, this.cFrame);
        s.rect(WX + this.WellW + 1, wallTop, 1, floor - wallTop + 1, this.cFrameHi);
        s.rect(WX - 3, floor, this.WellW + 6, 2, this.cFrame);
        s.rect(WX - 2, floor, this.WellW + 4, 1, this.cFrameHi);
        // the rim caps
        s.rect(WX - 4, wallTop, 4, 2, this.cMag);
        s.rect(WX + this.WellW, wallTop, 4, 2, this.cMag);

        const P = g.p;
        const pt = g.phaseTime;
        let stoneTo = -1, goneTo = -1;                      // rows < stoneTo are stone; rows < goneTo are drained
        if (P === Phase.TopOut) stoneTo = Math.trunc(pt / 0.06);
        else if (P === Phase.WellClear) {
            stoneTo = Math.trunc(pt / 0.03);
            if (pt > 0.75) goneTo = Math.trunc((pt - 0.75) / 0.025);
        } else if (P === Phase.Card && !g.roundWon) stoneTo = rows;

        const clearing = P === Phase.Clearing;
        for (let y = 0; y < rows; y++) {
            const clearingRow = clearing && g.clearRows.includes(y);
            for (let x = 0; x < W; x++) {
                const v = g.cell(x, y);
                if (v === 0 || y < goneTo) continue;
                const px = WX + x * Cell, py = WY + y * Cell;
                if (clearingRow) {
                    if (pt < 0.2) { this._flashBlock(s, px, py); continue; }
                    const k = 1 + Math.trunc((pt - 0.2) / 0.05);             // the wipe, from the centre out
                    const dist = x < 5 ? 4 - x : x - 5;
                    if (dist < k) continue;
                    this._flashBlock(s, px, py);
                    continue;
                }
                if (y < stoneTo) this._stoneBlock(s, px, py);
                else this._tintBlock(s, px, py, Tetromino.Tint[v - 1]);
            }
        }

        // the falling piece (or the one jammed at the top when it could not enter)
        if (g.hasPiece && (P === Phase.Falling || P === Phase.TopOut || P === Phase.WellClear)) {
            const c = Tetromino.Cells[g.kind][g.rot];
            for (let i = 0; i < 4; i++) {
                const x = g.x + c[i * 2], y = g.y + c[i * 2 + 1];
                if (y < 0 || y < goneTo) continue;
                if (y < stoneTo) this._stoneBlock(s, WX + x * Cell, WY + y * Cell);
                else this._tintBlock(s, WX + x * Cell, WY + y * Cell, Tetromino.Tint[g.kind]);
            }
        }
    }

    // ------------------------------------------------------------------ left panel: score, level, statistics
    _drawLeft(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('SCORE', LX, 10, arc, this.cMag);
        s.text(d6(Math.min(999999, g.score)), LX, 20, dsp, this.cHud, 2);
        s.text('LEVEL', LX, 42, arc, this.cMag);
        s.text(String(g.level), LX, 52, dsp, this.cHud, 2);
        s.dottedRule(LX, LX + 94, 74, 3, this.cMagLo);
        for (let i = 0; i < StatOrder.length; i++) {
            const k = StatOrder[i], y = 84 + i * 20;
            const c = Tetromino.Cells[k][0];
            let minY = 9;
            for (let j = 0; j < 4; j++) minY = Math.min(minY, c[j * 2 + 1]);
            for (let j = 0; j < 4; j++) this._mini(s, LX + 2 + c[j * 2] * 5, y + (c[j * 2 + 1] - minY) * 5 + (k === Tetromino.I ? 2 : 0), Tetromino.Tint[k]);
            s.textRight(dn(Math.min(999, g.shapeCounts[k]), 3), LX + 94, y, dsp, this.cHud, 2);
        }
    }

    // ------------------------------------------------------------------ right panel: next, lines, speed, ceiling
    _drawRight(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('NEXT', RX, 10, arc, this.cMag);
        s.plate(RX, 20, RW, 44, this.cWell, this.cFrame);
        s.frame(RX + 1, 21, RW - 2, 42, this.cFrameHi);
        if (g.p !== Phase.Card && g.p !== Phase.Over) {
            const k = g.nextKind;
            const c = Tetromino.Cells[k][0];
            let minX = 9, maxX = -1, minY = 9, maxY = -1;
            for (let j = 0; j < 4; j++) { minX = Math.min(minX, c[j * 2]); maxX = Math.max(maxX, c[j * 2]); minY = Math.min(minY, c[j * 2 + 1]); maxY = Math.max(maxY, c[j * 2 + 1]); }
            const w = (maxX - minX + 1) * Cell, h = (maxY - minY + 1) * Cell;
            const ox = RX + Math.trunc(RW / 2) - Math.trunc(w / 2), oy = 42 - Math.trunc(h / 2);
            for (let j = 0; j < 4; j++) this._tintBlock(s, ox + (c[j * 2] - minX) * Cell, oy + (c[j * 2 + 1] - minY) * Cell, Tetromino.Tint[k]);
        }

        s.text('LINES', RX, 72, arc, this.cMag);
        const shown = Math.min(g.lines, g.linesToWin);
        const n = dn(shown, 2);
        const nw = s.text(n, RX, 82, dsp, this.cCyan, 3);
        s.text('/' + g.linesToWin, RX + nw + 3, 89, dsp, this.cHud, 2);
        const pips = Math.min(10, g.linesToWin);
        for (let i = 0; i < pips; i++) {
            const x = RX + i * 9, filled = g.linesToWin <= 10 ? shown : Math.trunc(shown * 10 / g.linesToWin);
            if (i < filled) { s.rect(x, 108, 8, 8, this.tLo[0]); s.rect(x, 108, 7, 7, this.tHi[0]); s.rect(x + 1, 109, 5, 5, this.tBase[0]); }
            else s.frame(x, 108, 8, 8, this.cFrame);
        }

        // the call-out for 1-3 rows (four rows get the banner across the well)
        const since = g.time - g.lastClearAt;
        if (g.lastClearCount >= 1 && g.lastClearCount <= 3 && since < 1.2 && g.p !== Phase.Card && g.p !== Phase.Over) {
            const word = g.lastClearCount === 1 ? 'SINGLE' : g.lastClearCount === 2 ? 'DOUBLE' : 'TRIPLE';
            s.text(word, RX, 126, arc, this.cHud, 2);
            s.text('+' + g.lastClearPoints, RX, 144, arc, this.cCyan);
        }

        s.text('SPEED', RX, 158, arc, this.cMag);
        const pct = Math.trunc(roundEven(f32(f32(100 * g.creditFallRate) / Math.max(f32(0.01), g.baseFallRate))));
        const sw = s.text(String(pct), RX, 168, dsp, pct < 100 ? this.cCyan : this.cHud, 2);
        s.text('%', RX + sw + 3, 175, arc, this.cHud);
        s.text('CEILING', RX, 188, arc, this.cMag);
        s.text(g.ceilingRows > 0 ? '+' + g.ceilingRows : '0', RX, 198, dsp, g.ceilingRows > 0 ? this.cCyan : this.cHud, 2);
        if (g.mercyActive) s.text('SAFE WELL', RX, 220, arc, this.cCyan);
    }

    // ------------------------------------------------------------------ plates
    // a two-line plate that fits between the well walls (104 px): STACK ATTACK, TOP OUT, WELL CLEAR
    _wellPlate(s, a, b, ca, cb, border, y) {
        const dsp = PixelFont.Display;
        const cx = WX + this.WellW / 2;
        s.plate(cx - 52, y, 104, 46, this.cBg, border);
        s.frame(cx - 50, y + 2, 100, 42, border);
        s.textCentered(a, cx, y + 7, dsp, ca, 2);
        s.textCentered(b, cx, y + 25, dsp, cb, 2);
    }

    _drawOverlays(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const cx = WX + this.WellW / 2, midY = WY + this.GridH / 2;
        const P = g.p;
        const pt = g.phaseTime;

        if (P === Phase.Ready) {
            const go = pt >= g.readySeconds - g.goSeconds;
            if (go) s.textBox('GO!', cx, midY - 30, dsp, 3, this.cCyan, this.cMag, this.cBg);
            else s.textBox('READY', cx, midY - 26, dsp, 2, this.cWhite, this.cMag, this.cBg);
            s.plate(cx - 46, midY + 2, 92, 34, this.cBg, this.cFrame);
            s.textCentered('CLEAR', cx, midY + 7, arc, this.cHud);
            s.textCentered(g.linesToWin + ' LINES', cx, midY + 20, dsp, this.cCyan);
            if (g.mercyActive) s.textBox('SAFE WELL', cx, midY + 52, arc, 1, this.cCyan, this.cFrame, this.cBg);
            return;
        }

        const since = g.time - g.lastClearAt;
        if (g.lastClearCount === 4 && since < 1.4 && P !== Phase.Card && P !== Phase.Over) {
            this._wellPlate(s, 'STACK', 'ATTACK', this.cWhite, this.cCyan, this.cMag, midY - 40);
        }

        if (P === Phase.TopOut && pt >= 0.5)
            this._wellPlate(s, 'TOP', 'OUT', this.cWhite, this.cMag, this.cMag, midY - 30);

        if (P === Phase.WellClear && pt >= 0.5) {
            this._wellPlate(s, 'WELL', 'CLEAR', this.cWhite, this.cCyan, this.cCyan, midY - 30);
            s.textBox('LINES KEPT', cx, midY + 28, arc, 1, this.cHud, this.cFrame, this.cBg);
        }

        if (P === Phase.Card || P === Phase.Over) {
            const spec = StackAttackSpec;
            const won = g.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, cx, midY - 44, dsp, 3, won ? this.cCyan : this.cMag, this.cMag, this.cBg);
            const lines = 'LINES ' + Math.min(g.lines, g.linesToWin) + '/' + g.linesToWin;
            const pw = Math.max(arc.measure('SCORE 000000', 2), dsp.measure(lines, 2)) + 20;
            s.plate(cx - pw / 2, midY - 6, pw, 48, this.cBg, this.cMag);
            s.textCentered('SCORE ' + d6(Math.min(999999, g.score)), cx, midY + 1, arc, this.cHud, 2);
            s.textCentered(lines, cx, midY + 21, dsp, this.cWhite, 2);
        }
    }
}
