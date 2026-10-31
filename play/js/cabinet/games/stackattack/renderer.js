// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE PICTURE.
// Began as a port of StackAttackRenderer.cs (Staging/Batch2/stackattack); built out on 2026-10-18 with the
// stages, the cards, the tally and the juice. It only reads the sim (the effects come from sim.fx and are
// drawn as pure functions of their age, so a frame is the same however often it is drawn).
//
// Built for a curved tube seen from 0.8 m: 10 px cells, every block a chunky bevel (light top-left, a
// 2 px dark edge bottom-right, a shine), big display-font digits, nothing inside the 8 px margin.
//   - the well: 10 x 20 cells at (110, 10), tinted per stage, a faint dot grid and 3 px bevelled walls; the
//     two spawn rows sit above the rim. The mercy ceiling (+2 rows) runs the walls and the tint up through the
//     spawn rows and moves the dashed CEILING line to the top. A GHOST outline shows where the piece lands.
//   - the stages' blocks: steel JUNK (riveted plate), IRON walls (the squeeze), GOLD (a glint runs across
//     it), the BOMB (a dark shell, the fuse burning at 2 Hz)
//   - left panel: SCORE, STAGE (number and name), STACKS (one little stack per life), the next EXTRA STACK,
//     and the stage's own box: the controls on stage 1, the NEXT ROW and its timer on the flood stages,
//     the bomb count, the gold still buried, the walls' width and the rows till they move
//   - right panel: NEXT (a bomb shows in it), the goal (LINES / BOMBS / GOLD, big, with pips), the call-out
//     (DOUBLE +600, COMBO, BACK TO BACK, BOMB, GOLD), SPEED (so the mercy shows) and CEILING
//   - juice: a clear flashes white, wipes from the centre out and throws sparks; four rows put STACK ATTACK
//     up in the well and shake it; a bomb rings out and throws debris; a hard drop leaves a streak and
//     bumps the stack; a risen row slides up out of the floor; the score pops up from the row; danger
//     (the stack near the ceiling) turns the ceiling red; a coming row heats the floor; walls about to move
//     show red chevrons. Blinks are 1-2 Hz and flashes one or two frames: no strobes.
//   - cards: the STAGE CARD (number, name, goal, hint, the stage's block), the TALLY, TOP OUT (the stack
//     turns to stone, a curtain from the top), WELL CLEAR on the fifth credit, and the end: TOWER TOPPED
//     (fireworks) or GAME OVER
import { d6, PixelFont } from '../../sdk/index.js';
import { StackAttackPalette, StackAttackSpec } from './spec.js';
import { StackAttackSim, Tetromino, Block } from './sim.js';
import { Goal, goalText, goalWord } from './stages.js';

const Cell = 10, WX = 110, WY = 10;
const Phase = StackAttackSim.Phase;
const LX = 10, RX = 216, RW = 94;

// a small integer hash for the effects (the same frame for the same sim, always)
function hash(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}

export class StackAttackRenderer {
    constructor() {
        const p = StackAttackPalette;
        this.cBg = p.get('bg'); this.cWell = p.get('well'); this.cGrid = p.get('wellGrid');
        this.cFrame = p.get('frame'); this.cFrameHi = p.get('frameHi');
        this.cWhite = p.get('white'); this.cHud = p.get('hud'); this.cMag = p.get('magenta'); this.cMagLo = p.get('magentaLo'); this.cMagHi = p.get('magentaHi');
        this.cCyan = p.get('cyan'); this.cCyanHi = p.get('cyanHi'); this.cCyanLo = p.get('cyanLo');
        this.cViolet = p.get('violet'); this.cVioletHi = p.get('violetHi'); this.cVioletLo = p.get('violetLo');
        this.cStone = p.get('stone'); this.cStoneHi = p.get('stoneHi'); this.cStoneLo = p.get('stoneLo');
        this.cJunk = p.get('junk'); this.cJunkHi = p.get('junkHi'); this.cJunkLo = p.get('junkLo');
        this.cIron = p.get('iron'); this.cIronHi = p.get('ironHi'); this.cIronLo = p.get('ironLo');
        this.cGold = p.get('gold'); this.cGoldHi = p.get('goldHi'); this.cGoldLo = p.get('goldLo');
        this.cBomb = p.get('bomb'); this.cRed = p.get('red'); this.cRedLo = p.get('redLo');
        this.wells = new Map();
        for (const n of ['well', 'well2', 'well3', 'well4', 'well5', 'well6']) this.wells.set(n, p.get(n));
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
        this._drawFx(s, g);
        this._drawLeft(s, g);
        this._drawRight(s, g);
        this._drawOverlays(s, g);
        s.noClip();
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

    _junkBlock(s, x, y) {
        this._block(s, x, y, this.cJunk, this.cJunkHi, this.cJunkLo);
        s.rect(x + 5, y + 5, 2, 2, this.cJunkLo);       // a bolt in the plate
    }

    _ironBlock(s, x, y) {
        s.rect(x, y, Cell, Cell, this.cIronLo);
        s.rect(x, y, Cell - 1, Cell - 1, this.cIron);
        s.rect(x, y, Cell - 1, 1, this.cIronHi);
        s.rect(x + 2, y + 4, 1, 1, this.cIronHi);       // rivets
        s.rect(x + 6, y + 4, 1, 1, this.cIronHi);
    }

    _goldBlock(s, x, y, t) {
        this._block(s, x, y, this.cGold, this.cGoldHi, this.cGoldLo);
        const k = Math.trunc(t * 8) % 12;               // the glint runs down the diagonal, then rests
        if (k < 7) { s.setPixel(x + 1 + k, y + 7 - k, this.cWhite); s.setPixel(x + k, y + 7 - k, this.cGoldHi); }
    }

    _bombBlock(s, x, y, t) {
        s.rect(x, y, Cell, Cell, this.cVioletLo);
        s.rect(x + 2, y + 1, 5, 7, this.cBomb);         // a round shell: a cross of two rects
        s.rect(x + 1, y + 2, 7, 5, this.cBomb);
        s.rect(x + 2, y + 2, 2, 2, this.cVioletHi);     // its shine
        s.rect(x + 7, y + 1, 1, 1, this.cGoldLo);       // the fuse, burning at 2 Hz
        s.setPixel(x + 8, y, Math.trunc(t * 4) % 2 === 0 ? this.cGoldHi : this.cRed);
    }

    _cellBlock(s, x, y, v, t) {
        if (v >= 1 && v <= 7) this._tintBlock(s, x, y, Tetromino.Tint[v - 1]);
        else if (v === Block.Junk) this._junkBlock(s, x, y);
        else if (v === Block.Iron) this._ironBlock(s, x, y);
        else if (v === Block.Gold) this._goldBlock(s, x, y, t);
        else if (v === Block.Bomb) this._bombBlock(s, x, y, t);
    }

    _mini(s, x, y, base, hi, lo) {
        s.rect(x, y, 5, 5, lo);
        s.rect(x, y, 4, 4, hi);
        s.rect(x + 1, y + 1, 3, 3, base);
    }

    // ------------------------------------------------------------------ the well
    _shakeX(g) {
        const a = g.time - g.shakeAt;
        if (a < 0 || a >= 0.3) return 0;
        const amp = Math.max(0, Math.min(2, g.shakeAmp) - Math.trunc(a / 0.12));
        return (Math.trunc(a * 30) & 1 ? 1 : -1) * amp;
    }

    // the stack's vertical offset: a risen row slides up out of the floor; a hard drop bumps it 2 px
    _stackY(g) {
        let oy = 0;
        for (let i = g.fx.length - 1; i >= 0; i--) {
            const f = g.fx[i];
            if (f.k !== 'flood') continue;
            const a = g.time - f.t;
            if (a >= 0 && a < 0.16) oy = Math.trunc(Cell * (1 - a / 0.16));
            break;
        }
        const b = g.time - g.bumpAt;
        if (b >= 0 && b < 0.1) oy += b < 0.05 ? 2 : 1;
        return oy;
    }

    _drawWell(s, g) {
        const rows = this.Rows, W = this.W;
        const top = g.topLimit;
        const ox = this._shakeX(g);
        const wx = WX + ox;
        const wallTop = WY + top * Cell, floor = WY + this.GridH;
        const P = g.p, pt = g.phaseTime, t = g.time;
        const playing = P === Phase.Falling || P === Phase.Clearing;

        s.rect(wx, wallTop, this.WellW, floor - wallTop, this.wells.get(g.stageDef.well) || this.cWell);
        for (let r = top + 1; r < rows; r++)
            for (let c = 1; c < W; c++)
                s.setPixel(wx + c * Cell - 1, WY + r * Cell - 1, this.cGrid);
        // the ceiling: a dashed line along the top of the well, red when the stack comes near it
        const danger = playing && g.dangerOn;
        const dashC = danger ? (Math.trunc(t * 2) % 2 === 0 ? this.cRed : this.cRedLo) : this.cMagLo;
        for (let x = wx; x < wx + this.WellW; x += 6) s.rect(x, wallTop, 4, 1, dashC);

        // walls and floor: 3 px, bevelled; the floor heats while a row is coming
        const hot = playing && g.stageDef.flood > 0 && g.floodWarned;
        const floorC = hot ? (Math.trunc(t * 4) % 2 === 0 ? this.cRed : this.cRedLo) : this.cFrame;
        const floorHi = hot ? this.cMagHi : this.cFrameHi;
        s.rect(wx - 3, wallTop, 3, floor - wallTop + 2, this.cFrame);
        s.rect(wx - 2, wallTop, 1, floor - wallTop + 1, this.cFrameHi);
        s.rect(wx + this.WellW, wallTop, 3, floor - wallTop + 2, this.cFrame);
        s.rect(wx + this.WellW + 1, wallTop, 1, floor - wallTop + 1, this.cFrameHi);
        s.rect(wx - 3, floor, this.WellW + 6, 2, floorC);
        s.rect(wx - 2, floor, this.WellW + 4, 1, floorHi);
        // the rim caps
        const capC = danger ? dashC : this.cMag;
        s.rect(wx - 4, wallTop, 4, 2, capC);
        s.rect(wx + this.WellW, wallTop, 4, 2, capC);

        let stoneTo = -1, goneTo = -1;                      // rows < stoneTo are stone; rows < goneTo are drained
        if (P === Phase.TopOut) stoneTo = Math.trunc(pt / 0.06);
        else if (P === Phase.WellClear) {
            stoneTo = Math.trunc(pt / 0.03);
            if (pt > 0.75) goneTo = Math.trunc((pt - 0.75) / 0.025);
        } else if (P === Phase.Result && !g.roundWon) stoneTo = rows;

        // the blocks, clipped to the well (they slide up out of the floor when a row rises)
        const oy = this._stackY(g);
        s.clip(wx, wallTop, this.WellW, floor - wallTop);
        const clearing = P === Phase.Clearing;
        for (let y = 0; y < rows; y++) {
            const clearingRow = clearing && g.blast[y * W] === 2;
            for (let x = 0; x < W; x++) {
                const v = g.cell(x, y);
                if (v === 0 || (y < goneTo && v !== Block.Iron)) continue;
                const px = wx + x * Cell, py = WY + y * Cell + oy;
                if (v === Block.Iron) { this._ironBlock(s, px, py); continue; }
                if (clearingRow || (clearing && g.blast[y * W + x] === 1)) {
                    if (pt < 0.2) { this._flashBlock(s, px, py); continue; }
                    if (!clearingRow) continue;                              // a blasted block is gone after its flash
                    const k = 1 + Math.trunc((pt - 0.2) / 0.05);             // the wipe, from the centre out
                    const dist = x < 5 ? 4 - x : x - 5;
                    if (dist < k) continue;
                    this._flashBlock(s, px, py);
                    continue;
                }
                if (y < stoneTo) this._stoneBlock(s, px, py);
                else this._cellBlock(s, px, py, v, t);
            }
        }

        // the ghost: where the piece would land
        if (g.hasPiece && P === Phase.Falling) {
            const gy = g.landingY();
            if (gy > g.y + 1) {
                const c = Tetromino.Cells[g.kind][g.rot], tint = Tetromino.Tint[g.kind];
                for (let i = 0; i < 4; i++) {
                    const x = g.x + c[i * 2], y = gy + c[i * 2 + 1];
                    if (y < 0) continue;
                    const px = wx + x * Cell, py = WY + y * Cell;
                    s.frame(px, py, Cell - 1, Cell - 1, this.tLo[tint]);
                    s.setPixel(px + 1, py + 1, this.tBase[tint]);
                }
            }
        }

        // the falling piece (or the one jammed at the top when it could not enter)
        if (g.hasPiece && (P === Phase.Falling || P === Phase.TopOut || P === Phase.WellClear)) {
            const c = Tetromino.Cells[g.kind][g.rot];
            for (let i = 0; i < 4; i++) {
                const x = g.x + c[i * 2], y = g.y + c[i * 2 + 1];
                if (y < 0 || y < goneTo) continue;
                const px = wx + x * Cell, py = WY + y * Cell;
                if (y < stoneTo) this._stoneBlock(s, px, py);
                else if (i === g.bombCell) this._bombBlock(s, px, py, t);
                else this._tintBlock(s, px, py, Tetromino.Tint[g.kind]);
            }
        }
        s.noClip();

        // the squeeze's telegraph: red chevrons on the wall that moves next
        if (playing && g.stageDef.squeeze > 0 && g.squeezeIn === 1 && g.wellWidth > g.stageDef.minWidth && Math.trunc(t * 2) % 2 === 0) {
            const left = g.squeezeSide === 0;
            const cx = left ? wx + g.wellL * Cell + 2 : wx + (g.wellR + 1) * Cell - 7;
            for (let y = wallTop + 14; y < floor - 8; y += 24) {
                for (let k = 0; k < 4; k++) {
                    const dx = left ? k : 3 - k;
                    s.rect(cx + dx, y + k, 2, 1, this.cRed);
                    s.rect(cx + dx, y + 6 - k, 2, 1, this.cRed);
                }
            }
        }
    }

    // ------------------------------------------------------------------ the effects (sparks, blasts, streaks)
    _drawFx(s, g) {
        const t = g.time, ox = this._shakeX(g);
        s.clip(8, 8, 304, 224);                          // never into the 8 px margin
        for (const f of g.fx) {
            const a = t - f.t;
            if (a < 0) continue;
            switch (f.k) {
                case 'row': if (a < 0.75) this._fxRow(s, f, a, ox); break;
                case 'blast': if (a < 0.6) this._fxBlast(s, f, a, ox); break;
                case 'drop': if (a < 0.18) this._fxDrop(s, f, a, ox); break;
                case 'lock': if (a < 0.07) this._fxLock(s, f, ox); break;
                case 'crush': if (a < 0.55) this._fxCrush(s, f, a, ox); break;
                case 'flood': if (a < 0.5) this._fxFlood(s, f, a, ox); break;
                case 'gold': if (a < 0.9) this._fxGold(s, f, a, ox); break;
            }
        }
        s.noClip();
    }

    _fxRow(s, f, a, ox) {
        const y0 = WY + f.y * Cell + 5;
        const col = a < 0.15 ? this.cWhite : a < 0.35 ? this.cCyanHi : a < 0.55 ? this.cCyan : this.cCyanLo;
        const sz = a < 0.4 ? 2 : 1;
        for (let i = 0; i < 10; i++)
            for (let j = 0; j < 2; j++) {
                const h = hash(f.s * 31 + i, j + 7);
                const vx = (h % 121) - 60, vy = -(50 + ((h >>> 8) % 110));
                const x = WX + ox + i * Cell + 5 + Math.trunc(vx * a), y = y0 + Math.trunc(vy * a + 150 * a * a);
                s.rect(x, y, sz, sz, col);
            }
    }

    _fxBlast(s, f, a, ox) {
        const cx = WX + ox + f.x * Cell + 5, cy = WY + f.y * Cell + 5;
        if (a < 0.07) s.circle(cx, cy, 9, this.cWhite, true);
        if (a < 0.3) {
            const r = 5 + Math.trunc(a * 70);
            s.circle(cx, cy, r, a < 0.1 ? this.cWhite : a < 0.2 ? this.cMagHi : this.cMag, false);
            if (r > 6) s.circle(cx, cy, r - 3, a < 0.15 ? this.cGoldHi : this.cRed, false);
        }
        const col = a < 0.2 ? this.cGoldHi : a < 0.4 ? this.cRed : this.cRedLo;
        for (let i = 0; i < 12; i++) {
            const h = hash(f.s * 17 + i, 3);
            const vx = (h % 161) - 80, vy = -(30 + ((h >>> 8) % 120));
            s.rect(cx + Math.trunc(vx * a), cy + Math.trunc(vy * a + 220 * a * a), 2, 2, col);
        }
    }

    _fxDrop(s, f, a, ox) {
        const kind = f.a >> 2, rot = f.a & 3, tint = Tetromino.Tint[kind];
        const c = Tetromino.Cells[kind][rot];
        const col = a < 0.06 ? this.tHi[tint] : a < 0.12 ? this.tBase[tint] : this.tLo[tint];
        for (let i = 0; i < 4; i++) {
            const cx = f.x + c[i * 2], cy = c[i * 2 + 1];
            let topOfCol = true;                         // one streak per column, from the top cell of the piece in it
            for (let j = 0; j < 4; j++) if (c[j * 2] === c[i * 2] && c[j * 2 + 1] < cy) topOfCol = false;
            if (!topOfCol) continue;
            const y0 = Math.max(WY, WY + (f.y + cy) * Cell), y1 = WY + (f.y + f.v + cy) * Cell;
            for (let y = y0; y < y1; y += 3) s.rect(WX + ox + cx * Cell + 3, y, 3, 2, col);
        }
    }

    _fxLock(s, f, ox) {
        const kind = f.a >> 2, rot = f.a & 3;
        const c = Tetromino.Cells[kind][rot];
        for (let i = 0; i < 4; i++) {
            const y = f.y + c[i * 2 + 1];
            if (y < 0) continue;
            s.frame(WX + ox + (f.x + c[i * 2]) * Cell, WY + y * Cell, Cell - 1, Cell - 1, this.cWhite);
        }
    }

    _fxCrush(s, f, a, ox) {
        const x0 = WX + ox + f.x * Cell + (f.a < 0 ? Cell : 0);
        const col = a < 0.15 ? this.cGoldHi : a < 0.35 ? this.cRed : this.cRedLo;
        for (let r = 2; r < this.Rows; r++) {
            const h = hash(f.s * 13 + r, 5);
            const vx = f.a * -(30 + (h % 60)), vy = -((h >>> 8) % 50);
            s.rect(x0 + Math.trunc(vx * a), WY + r * Cell + 4 + Math.trunc(vy * a + 160 * a * a), 2, 1, col);
        }
    }

    _fxFlood(s, f, a, ox) {
        const col = a < 0.2 ? this.cJunkHi : a < 0.35 ? this.cJunk : this.cJunkLo;
        const y0 = WY + this.GridH - 2;
        for (let i = 0; i < 14; i++) {
            const h = hash(f.s * 7 + i, 11);
            const x = WX + ox + 4 + (h % 92), vy = -(10 + ((h >>> 8) % 30));
            s.rect(x + Math.trunc(((h >>> 16) % 21 - 10) * a), y0 + Math.trunc(vy * a), 2, 2, col);
        }
    }

    // a gold block dug out: a star of eight rays opening out, then its sparks falling
    _fxGold(s, f, a, ox) {
        const cx = WX + ox + f.x * Cell + 5, cy = WY + f.y * Cell + 5;
        const col = a < 0.2 ? this.cWhite : a < 0.5 ? this.cGoldHi : this.cGold;
        const r = 3 + Math.trunc(a * 30);
        const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
        for (let i = 0; i < 8; i++) {
            const k = i % 2 === 0 ? r : Math.trunc(r * 0.7);
            s.rect(cx + DX[i] * k, cy + DY[i] * k + Math.trunc(30 * a * a), 2, 2, col);
            if (a < 0.4) s.setPixel(cx + DX[i] * (k - 3), cy + DY[i] * (k - 3), this.cGoldHi);
        }
    }

    // ------------------------------------------------------------------ left panel: score, stage, stacks, the stage's box
    _drawLeft(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, t = g.time, st = g.stageDef;
        s.text('SCORE', LX, 10, arc, this.cMag);
        s.text(d6(Math.min(999999, g.score)), LX, 20, dsp, this.cHud, 2);

        s.text('STAGE', LX, 40, arc, this.cMag);
        s.text(g.stage + '/' + g.stages, LX + 36, 40, arc, this.cHud);
        s.text(String(g.stage), LX, 50, dsp, st.final ? this.cGold : this.cCyan, 2);
        const nameC = st.final ? this.cGoldHi : this.cHud;
        const words = st.name.split(' ');
        if (words.length > 1 && arc.measure(st.name) > 74) { s.text(words[0], LX + 22, 50, arc, nameC); s.text(words.slice(1).join(' '), LX + 22, 59, arc, nameC); }
        else s.text(st.name, LX + 22, 54, arc, nameC);

        s.dottedRule(LX, LX + 94, 72, 3, this.cMagLo);
        s.text('STACKS', LX, 78, arc, this.cMag);
        const lostFlash = g.p === Phase.TopOut && Math.trunc(g.phaseTime * 2) % 2 === 0;
        for (let i = 0; i < Math.max(g.stacks + (g.p === Phase.TopOut ? 1 : 0), 0) && i < 6; i++) {
            const x = LX + i * 15, y = 88;
            const lost = g.p === Phase.TopOut && i === g.stacks;
            if (lost && !lostFlash) continue;
            const fam = lost ? -1 : g.stacks === 1 ? 1 : i % 2 === 0 ? 0 : 3;
            if (fam < 0) { this._mini(s, x, y + 5, this.cStone, this.cStoneHi, this.cStoneLo); this._mini(s, x + 5, y + 5, this.cStone, this.cStoneHi, this.cStoneLo); this._mini(s, x, y, this.cStone, this.cStoneHi, this.cStoneLo); continue; }
            this._mini(s, x, y + 5, this.tBase[fam], this.tHi[fam], this.tLo[fam]);
            this._mini(s, x + 5, y + 5, this.tBase[fam], this.tHi[fam], this.tLo[fam]);
            this._mini(s, x, y, this.tBase[fam], this.tHi[fam], this.tLo[fam]);
        }
        s.text('EXTRA', LX, 106, arc, this.cMag);
        s.text(d6(Math.min(999999, g.nextExtra)), LX + 36, 106, arc, this.cHud);

        s.dottedRule(LX, LX + 94, 120, 3, this.cMagLo);
        this._drawStageBox(s, g, 126, t);
    }

    // the stage's own box under the stacks: what this stage is about
    _drawStageBox(s, g, y, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, st = g.stageDef;
        if (g.stage === 1) {
            s.text('UP', LX, y, arc, this.cCyan); s.text('DROP', LX + 42, y, arc, this.cHud);
            s.text('DOWN', LX, y + 12, arc, this.cCyan); s.text('FAST', LX + 42, y + 12, arc, this.cHud);
            s.text('A', LX, y + 24, arc, this.cCyan); s.text('TURN', LX + 42, y + 24, arc, this.cHud);
            s.text('B', LX, y + 36, arc, this.cCyan); s.text('TURN BACK', LX + 42, y + 36, arc, this.cHud);
            s.text('FULL ROWS CLEAR', LX, y + 56, arc, this.cMag);
        }
        if (st.goal === Goal.Gold) {
            s.text('GOLD', LX, y, arc, this.cMag);
            for (let i = 0; i < g.target; i++) {
                const px = LX + 32 + i * 14;
                if (i < g.progress) this._goldBlock(s, px, y - 2, t);
                else s.frame(px, y - 2, Cell, Cell, this.cGoldLo);
            }
            s.text('CLEAR THE ROW', LX, y + 16, arc, this.cHud);
            s.text('IT SITS IN', LX, y + 26, arc, this.cHud);
            s.text('OR BLAST IT', LX, y + 40, arc, this.cCyan);
            s.text('FLOOR RISES', LX, y + 56, arc, g.floodWarned ? this.cRed : this.cMag);
            s.text('IN ' + Math.max(0, Math.ceil(g.floodT)) + 'S', LX, y + 66, arc, g.floodWarned ? this.cRed : this.cHud);
            return;
        }
        if (st.flood > 0) {
            const warn = g.floodWarned && (g.p === Phase.Falling || g.p === Phase.Clearing);
            s.text('NEXT ROW', LX, y, arc, warn ? this.cRed : this.cMag);
            for (let x = 0; x < 10; x++) {
                const v = g.floodRow[x], px = LX + x * 9, py = y + 11;
                if (v === Block.Bomb) { s.rect(px, py, 8, 8, this.cVioletLo); s.rect(px + 2, py + 2, 4, 4, this.cBomb); s.setPixel(px + 6, py + 1, this.cGoldHi); }
                else if (v !== 0) { s.rect(px, py, 8, 8, this.cJunkLo); s.rect(px, py, 7, 7, this.cJunkHi); s.rect(px + 1, py + 1, 6, 6, this.cJunk); }
                else s.frame(px, py, 8, 8, this.cFrame);
            }
            const every = Math.max(0.01, g.floodEvery);
            const fill = Math.max(0, Math.min(89, Math.trunc(89 * (1 - g.floodT / every))));
            s.frame(LX, y + 23, 89, 5, this.cFrame);
            const barC = warn ? (Math.trunc(t * 4) % 2 === 0 ? this.cRed : this.cMagHi) : this.cJunkHi;
            if (fill > 0) s.rect(LX, y + 24, fill, 3, barC);
            s.text('RISES IN', LX, y + 34, arc, this.cHud);
            s.text(Math.max(0, Math.ceil(g.floodT)) + 'S', LX + 54, y + 34, arc, warn ? this.cRed : this.cCyan);
            if (st.final) {
                s.text('FINAL STAGE', LX, y + 56, arc, Math.trunc(t) % 2 === 0 ? this.cGoldHi : this.cGold);
                s.text('TOP THE TOWER', LX, y + 68, arc, this.cHud);
            } else s.text('CLEAR THEM UP', LX, y + 56, arc, this.cHud);
        } else if (st.goal === Goal.Bombs) {
            s.text('A BOMB EVERY', LX, y, arc, this.cMag);
            s.text(st.bombEvery + 'RD PIECE', LX, y + 11, arc, this.cHud);
            this._bombBlock(s, LX, y + 26, t);
            s.text('CLEAR ITS', LX + 16, y + 24, arc, this.cHud);
            s.text('ROW: BOOM', LX + 16, y + 33, arc, this.cHud);
            s.text('CHAINS COUNT', LX, y + 50, arc, this.cCyan);
        } else if (st.squeeze > 0) {
            s.text('WALLS', LX, y, arc, this.cMag);
            s.text(g.wellWidth + ' WIDE', LX + 36, y, arc, this.cHud);
            for (let x = 0; x < 10; x++) {                              // the well's width in miniature
                const px = LX + x * 9, py = y + 11;
                if (x < g.wellL || x > g.wellR) { s.rect(px, py, 8, 8, this.cIron); s.rect(px, py, 8, 1, this.cIronHi); }
                else s.frame(px, py, 8, 8, this.cFrame);
            }
            if (g.wellWidth > st.minWidth) {
                const warn = g.squeezeIn === 1;
                s.text('MOVE IN', LX, y + 26, arc, warn ? this.cRed : this.cHud);
                s.text(g.squeezeIn + (g.squeezeIn === 1 ? ' LINE' : ' LINES'), LX, y + 36, arc, warn ? this.cRed : this.cCyan);
            } else s.text('NO NARROWER', LX, y + 26, arc, this.cCyan);
        }
    }

    // ------------------------------------------------------------------ right panel: next, the goal, call-outs, speed, ceiling
    _drawRight(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, t = g.time, st = g.stageDef;
        s.text('NEXT', RX, 10, arc, this.cMag);
        s.plate(RX, 20, RW, 44, this.cWell, this.cFrame);
        s.frame(RX + 1, 21, RW - 2, 42, this.cFrameHi);
        if (g.p !== Phase.Result && g.p !== Phase.Over) {
            const k = g.nextKind;
            const c = Tetromino.Cells[k][0];
            let minX = 9, maxX = -1, minY = 9, maxY = -1;
            for (let j = 0; j < 4; j++) { minX = Math.min(minX, c[j * 2]); maxX = Math.max(maxX, c[j * 2]); minY = Math.min(minY, c[j * 2 + 1]); maxY = Math.max(maxY, c[j * 2 + 1]); }
            const w = (maxX - minX + 1) * Cell, h = (maxY - minY + 1) * Cell;
            const ox = RX + Math.trunc(RW / 2) - Math.trunc(w / 2), oy = 42 - Math.trunc(h / 2);
            for (let j = 0; j < 4; j++) {
                const px = ox + (c[j * 2] - minX) * Cell, py = oy + (c[j * 2 + 1] - minY) * Cell;
                if (j === g.nextBomb) this._bombBlock(s, px, py, t);
                else this._tintBlock(s, px, py, Tetromino.Tint[k]);
            }
        }

        const word = goalWord(st);
        s.text(word, RX, 72, arc, this.cMag);
        const shown = Math.min(g.progress, g.target);
        const nw = s.text(String(shown).padStart(2, '0'), RX, 82, dsp, st.goal === Goal.Gold ? this.cGold : this.cCyan, 3);
        s.text('/' + g.target, RX + nw + 3, 89, dsp, this.cHud, 2);
        for (let i = 0; i < g.target && i < 20; i++) {
            const x = RX + (i % 10) * 9, y = 108 + Math.trunc(i / 10) * 9;
            if (i < shown) {
                if (st.goal === Goal.Gold) { s.rect(x, y, 8, 8, this.cGoldLo); s.rect(x, y, 7, 7, this.cGoldHi); s.rect(x + 1, y + 1, 5, 5, this.cGold); }
                else { s.rect(x, y, 8, 8, this.tLo[0]); s.rect(x, y, 7, 7, this.tHi[0]); s.rect(x + 1, y + 1, 5, 5, this.tBase[0]); }
            } else s.frame(x, y, 8, 8, this.cFrame);
        }

        // the call-out for the last clear (four rows get the banner across the well)
        const since = g.time - g.lastClearAt;
        const cy = g.target > 10 ? 130 : 124;
        if (g.lastClearCount >= 1 && since < 1.3 && g.p !== Phase.Result && g.p !== Phase.Over) {
            const n = g.lastClearCount;
            const word2 = g.lastSqueezed ? 'SQUEEZE' : n === 1 ? 'SINGLE' : n === 2 ? 'DOUBLE' : n === 3 ? 'TRIPLE' : 'ATTACK';
            s.text(word2, RX, cy, arc, n >= 4 ? this.cMagHi : this.cHud, 2);
            s.text('+' + g.lastClearPoints, RX, cy + 17, arc, this.cCyan);
            let extra = '';
            if (g.lastGold > 0) extra = 'GOLD!';
            else if (g.lastBombs > 0) extra = g.lastBombs > 1 ? 'CHAIN X' + g.lastBombs : 'BOOM!';
            else if (g.lastB2b) extra = 'BACK TO BACK';
            else if (g.lastCombo > 0) extra = 'COMBO X' + (g.lastCombo + 1);
            if (extra) s.text(extra, RX, cy + 27, arc, g.lastGold > 0 ? this.cGoldHi : g.lastBombs > 0 ? this.cRed : this.cMagHi);
        }

        s.text('SPEED', RX, 170, arc, this.cMag);
        const pct = Math.trunc(100 * g.fallRate / Math.max(0.01, g.baseFallRate) + 0.5);
        const sw = s.text(String(pct), RX, 180, dsp, g.creditFallRate < g.baseFallRate ? this.cCyan : this.cHud, 2);
        s.text('%', RX + sw + 3, 187, arc, this.cHud);
        s.text('CEILING', RX, 198, arc, this.cMag);
        s.text(g.ceilingRows > 0 ? '+' + g.ceilingRows : '0', RX + 48, 198, arc, g.ceilingRows > 0 ? this.cCyan : this.cHud);
        if (g.mercyActive) s.text('SAFE WELL', RX, 214, arc, this.cCyan);
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

    // the stage's block, drawn big on its card
    _drawIcon(s, g, cx, y, t) {
        const st = g.stageDef, B = Cell;
        const x0 = cx - Math.trunc(B * 5 / 2);
        switch (st.icon) {
            case 'junk':
                for (let i = 0; i < 5; i++) if (i !== 3) this._junkBlock(s, x0 + i * B, y + 2);
                for (let k = 0; k < 3; k++) s.rect(x0 + 3 * B + 4 - k, y - 2 + k * 2, 2 * k + 2, 1, this.cRed);   // an arrow up out of the gap
                break;
            case 'bomb':
                this._tintBlock(s, x0, y + 2, 0); this._tintBlock(s, x0 + B, y + 2, 2); this._bombBlock(s, x0 + 2 * B, y + 2, t);
                this._tintBlock(s, x0 + 3 * B, y + 2, 1); this._tintBlock(s, x0 + 4 * B, y + 2, 3);
                break;
            case 'gold':
                for (let i = 0; i < 5; i++) if (i === 2) this._goldBlock(s, x0 + i * B, y + 2, t); else this._junkBlock(s, x0 + i * B, y + 2);
                break;
            case 'iron':
                this._ironBlock(s, x0, y + 2); this._tintBlock(s, x0 + B, y + 2, 3); this._tintBlock(s, x0 + 2 * B, y + 2, 0);
                this._tintBlock(s, x0 + 3 * B, y + 2, 2); this._ironBlock(s, x0 + 4 * B, y + 2);
                break;
            case 'crown':
                this._goldBlock(s, x0, y + 2, t); this._goldBlock(s, x0 + 2 * B, y - 3, t); this._goldBlock(s, x0 + 4 * B, y + 2, t);
                this._goldBlock(s, x0 + B, y + 7, t); this._goldBlock(s, x0 + 3 * B, y + 7, t);
                break;
            default:
                this._tintBlock(s, x0 + B, y - 3, 1); this._tintBlock(s, x0, y + 7, 1); this._tintBlock(s, x0 + B, y + 7, 1); this._tintBlock(s, x0 + 2 * B, y + 7, 1);
                this._tintBlock(s, x0 + 3 * B, y + 7, 0); this._tintBlock(s, x0 + 4 * B, y + 7, 0);
                break;
        }
    }

    _drawOverlays(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const cx = WX + this.WellW / 2, midY = WY + this.GridH / 2;
        const P = g.p, pt = g.phaseTime, t = g.time, st = g.stageDef;

        if (P === Phase.Card) {
            const go = pt >= g.cardSeconds - g.goSeconds;
            if (go) { s.textBox('GO!', cx, midY - 30, dsp, 3, this.cCyan, this.cMag, this.cBg); return; }
            const x0 = 44, w = 232, y0 = 50, h = st.final ? 128 : 120;
            s.plate(x0, y0, w, h, this.cBg, st.final ? this.cGold : this.cMag);
            s.frame(x0 + 2, y0 + 2, w - 4, h - 4, st.final ? this.cGoldLo : this.cMagLo);
            const head = st.final ? 'FINAL STAGE' : 'STAGE ' + g.stage;
            s.textCentered(head, 160, y0 + 9, dsp, st.final ? this.cGoldHi : this.cMag, 2);
            s.textCentered(st.name, 160, y0 + 29, dsp, this.cWhite, 2);
            this._drawIcon(s, g, 160, y0 + 49, t);
            s.textCentered(goalText(st), 160, y0 + 70, arc, this.cCyan, 2);
            s.textCentered(st.hint, 160, y0 + 89, arc, this.cHud);
            if (g.attempt > 0) s.textCentered((g.stacks === 1 ? 'LAST STACK' : 'STACKS LEFT ' + g.stacks) + '  TRY AGAIN', 160, y0 + 103, arc, g.stacks === 1 ? this.cRed : this.cMagHi);
            else if (g.stage === 1) s.textCentered('UP DROPS   A AND B TURN', 160, y0 + 103, arc, this.cMagHi);
            else if (st.final) s.textCentered('CLEAR IT AND THE GAME IS WON', 160, y0 + 103, arc, this.cGoldHi);
            if (g.mercyActive) s.textBox('SAFE WELL', 160, y0 + h + 14, arc, 1, this.cCyan, this.cFrame, this.cBg);
            return;
        }

        // score pop-ups: they rise from the cleared rows
        for (const f of g.fx) {
            if (f.k !== 'pop') continue;
            const a = t - f.t;
            if (a < 0 || a >= 1.0) continue;
            const txt = '+' + f.v;
            const y = Math.max(12, WY + f.y * Cell - 2 - Math.trunc(a * 18));
            s.textCenteredShadow(txt, cx + this._shakeX(g), y, arc, a < 0.45 ? this.cWhite : this.cCyanHi, this.cBg);
        }

        const since = g.time - g.lastClearAt;
        if (g.lastClearCount >= 4 && since < 1.4 && (P === Phase.Falling || P === Phase.Clearing))
            this._wellPlate(s, 'STACK', 'ATTACK', this.cWhite, g.lastB2b ? this.cMagHi : this.cCyan, this.cMag, midY - 40);
        else if (g.lastGold > 0 && since < 1.2 && (P === Phase.Falling || P === Phase.Clearing))
            s.textBox('GOLD!', cx, midY - 50, dsp, 2, this.cGoldHi, this.cGold, this.cBg);

        if (t - g.extraShownAt < 1.6 && P !== Phase.Result && P !== Phase.Over)
            s.textBox('EXTRA STACK', cx, 40, arc, 1, this.cCyanHi, this.cMag, this.cBg);

        if (P === Phase.TopOut && pt >= 0.5) {
            this._wellPlate(s, 'TOP', 'OUT', this.cWhite, this.cMag, this.cMag, midY - 30);
            if (pt >= 1.0) s.textBox(g.stacks === 0 ? 'NO STACKS LEFT' : g.stacks === 1 ? 'LAST STACK' : g.stacks + ' STACKS LEFT', cx, midY + 28, arc, 1,
                g.stacks <= 1 ? this.cRed : this.cHud, g.stacks <= 1 ? this.cRed : this.cFrame, this.cBg);
        }

        if (P === Phase.WellClear && pt >= 0.5) {
            this._wellPlate(s, 'WELL', 'CLEAR', this.cWhite, this.cCyan, this.cCyan, midY - 30);
            s.textBox(st.goal === Goal.Gold ? 'GOLD KEPT' : st.goal === Goal.Bombs ? 'BOMBS KEPT' : 'LINES KEPT', cx, midY + 28, arc, 1, this.cHud, this.cFrame, this.cBg);
        }

        if (P === Phase.Tally) this._drawTally(s, g);
        if (P === Phase.Result || P === Phase.Over) this._drawResult(s, g);
    }

    _drawTally(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, st = g.stageDef, pt = g.phaseTime;
        const n = g.tally.length;
        const x0 = 46, w = 228, y0 = 50, h = 58 + n * 14 + 20;
        s.plate(x0, y0, w, h, this.cBg, st.final ? this.cGold : this.cCyan);
        s.frame(x0 + 2, y0 + 2, w - 4, h - 4, st.final ? this.cGoldLo : this.cCyanLo);
        s.textCentered(st.final ? 'TOWER TOPPED!' : 'STAGE ' + g.stage + ' CLEAR', 160, y0 + 9, dsp, st.final ? this.cGoldHi : this.cCyan, 2);
        s.textCentered(st.name, 160, y0 + 29, arc, this.cHud);
        for (let i = 0; i < g.tallyShown; i++) {
            const [label, v] = g.tally[i];
            const y = y0 + 46 + i * 14;
            const at = g.tallyFirst + i * g.tallyStep;
            const k = Math.min(1, Math.max(0, (pt - at) / 0.3));
            s.text(label, x0 + 12, y, arc, this.cHud);
            s.textRight(String(Math.trunc(v * k)), x0 + w - 12, y, arc, k < 1 ? this.cWhite : this.cCyan);
        }
        if (g.tallyShown >= n) {
            const y = y0 + 50 + n * 14;
            s.dottedRule(x0 + 12, x0 + w - 12, y - 3, 2, this.cMagLo);
            s.text('TOTAL', x0 + 12, y + 2, arc, this.cMag);
            s.textRight(String(g.tallyTotal), x0 + w - 12, y + 2, arc, this.cWhite);
        }
    }

    _drawResult(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, t = g.time;
        const spec = StackAttackSpec;
        const won = g.roundWon;
        const cx = 160, midY = WY + this.GridH / 2;
        if (won) this._fireworks(s, g);
        s.textBox(won ? spec.roundWonText : spec.roundLostText, cx, midY - 50, dsp, 2, won ? this.cGoldHi : this.cMag, won ? this.cGold : this.cMag, this.cBg);
        const line2 = won ? 'ALL ' + g.stages + ' STAGES CLEARED' : 'STAGE ' + g.stage + '  ' + g.stageDef.name;
        const pw = Math.max(arc.measure('SCORE 000000', 2), arc.measure(line2)) + 24;
        s.plate(cx - pw / 2, midY - 14, pw, 50, this.cBg, won ? this.cGold : this.cMag);
        s.textCentered('SCORE ' + d6(Math.min(999999, g.score)), cx, midY - 6, arc, this.cWhite, 2);
        s.textCentered(line2, cx, midY + 14, arc, won ? this.cGoldHi : this.cHud);
        s.textCentered('LINES ' + g.lines, cx, midY + 24, arc, this.cCyan);
    }

    // the win: bursts over the well, one every 0.35 s, in the four piece colours
    _fireworks(s, g) {
        const pt = g.phaseTime;
        s.clip(8, 8, 304, 224);
        const n = Math.trunc(pt / 0.35);
        for (let b = Math.max(0, n - 3); b <= n; b++) {
            const a = pt - b * 0.35;
            if (a < 0 || a > 1.0) continue;
            const h = hash(b, 99);
            const cx = 40 + (h % 240), cy = 30 + ((h >>> 9) % 90), fam = (h >>> 18) & 3;
            const col = a < 0.15 ? this.cWhite : a < 0.4 ? this.tHi[fam] : a < 0.7 ? this.tBase[fam] : this.tLo[fam];
            for (let i = 0; i < 16; i++) {
                const ang = i * Math.PI / 8;
                const r = 4 + a * 46;
                s.rect(cx + Math.trunc(Math.cos(ang) * r), cy + Math.trunc(Math.sin(ang) * r + 20 * a * a), 2, 2, col);
            }
        }
        s.noClip();
    }
}
