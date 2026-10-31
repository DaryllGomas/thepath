// THE NODE · world 1 · GRID CYCLES '82 on the Cabinet Engine · THE PICTURE.
// Cyan and orange tubes over the original blue lattice. Pink blocks are solid;
// warning frames show the next lockdown ring before it seals. Cards leave the
// arena visible, and every drawing stays within the cabinet's eight-pixel margin.
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
                if (v === 3) { s.rect(OX+x*4, OY+y*4, 4,4,this.cEdgeDim); s.rect(OX+x*4+1,OY+y*4+1,2,2,this.cEdge); continue; }
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

        if (r.sectorDef.shrink && r.duelSeconds % 8 > 6 && r.seal < 8) {
            const n=r.seal+1; s.frame(OX+n*4,OY+n*4,AW-n*8,AH-n*8,this.cWhite);
            s.textCenteredShadow('SEAL INCOMING',160,36,PixelFont.Small,this.cOrange,this.cBg);
        }
        if (r.sectorDef.boost && r.duelSeconds % 7 > 4 && r.duelSeconds % 7 < 5)
            s.textCenteredShadow('RIVAL CHARGING',160,36,PixelFont.Small,this.cOrange,this.cBg);
        if (r.extra && r.score < 12600) s.textCenteredShadow('EXTRA CYCLE',160,51,PixelFont.Arcade,this.cHud,this.cBg);
        this._drawHud(s, r);

        // ---- overlays
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + Math.trunc(AH / 2);
        if (P === Phase.Countdown) {
            const n = r.countdownLeft > 0 ? String(r.countdownLeft) : 'GO';
            s.textCenteredShadow(n, midX, midY - 32, dsp, this.cHud, this.cBg, 5);
            s.plate(35, midY+8,250,62,this.cBg,this.cEdge);
            s.textCentered('SECTOR '+(r.sector+1)+' / '+r.sectorDef.rival,160,midY+14,arc,this.cOrange);
            s.textCentered(r.sectorDef.name,160,midY+29,arc,this.cCyan,1);
            s.textCentered(r.sectorDef.hint,160,midY+46,PixelFont.Small,this.cHud);
            for(let i=0;i<6;i++) { s.frame(118+i*14,midY+58,9,5,this.cEdgeDim); if(i<=r.sector) s.rect(119+i*14,midY+59,7,3,i===r.sector?this.cWhite:this.cCyan); }
            
            // which one is you
            const hx = OX + g.player.x * CellPx + 2, hy = OY + g.player.y * CellPx - 12;
            if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', hx, hy, arc, this.cCyan, this.cBg);
        } else if (P === Phase.Derez) {
            const c = who === 1 ? this.cCyan : who === 2 ? this.cOrange : this.cWhite;
            const name = who === 1 ? 'YOU' : who === 2 ? 'RIVAL' : 'BOTH';
            s.textBox('DEREZZED', midX, midY - 14, dsp, 3, this.cWhite, c, this.cBg);
            s.plate(midX - 46, midY + 16, 92, 22, this.cBg, c);
            s.textCentered(name, midX, midY + 20, dsp, c, 2);
            if (r.lastBonus) {
                s.plate(40,midY+45,240,38,this.cBg,this.cEdge);
                s.textCentered('SECTOR CLEAR  +'+Math.floor(r.lastBonus*Math.min(1,pt/1.5)),160,midY+51,arc,this.cHud);
                s.textCentered('CIRCUIT 1500  CYCLES '+(r.stock*250)+'  SPEED '+(r.lastBonus-1500-r.stock*250),160,midY+66,PixelFont.Small,this.cCyan);
            }
        } else if (P === Phase.Card || P === Phase.Over) {
            const spec = GridCyclesSpec;
            const won = r.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 26, dsp, 2, won ? this.cCyan : this.cOrange, this.cEdge, this.cBg);
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
        s.textRight('S'+(r.sector+1)+' LIFE '+r.lives,310,9,arc,this.cHud);
        s.frame(218,20,90,4,this.cCyanDim);
        s.rect(219,21,Math.floor(88*r.charge),2,r.boost>0?this.cWhite:this.cCyan);
        s.dottedRule(8, 312, 27, 3, this.cEdge);
    }
}
