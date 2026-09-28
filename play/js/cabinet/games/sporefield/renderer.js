// THE NODE · world 1 · SPORE FIELD on the Cabinet Engine · THE PICTURE.
// Port of SporeFieldRenderer.cs from Staging/Batch1/sporefield.
//
// A 1981 board's look: chunky 8 x 8 sprites on black, four colour families and white.
//   - HUD rows 1-2 (y 8..23): 1UP + the score in display digits x2, the borer tally (12 pips,
//     green while that many segments live), and the lives: a wand icon + a display digit x2
//   - the field, 38 x 26 cells of 8 px at (8, 24): mushrooms that shrink from the bottom as they
//     are shot, the borer (green, legs step with every cell it walks, the head has white eyes and
//     faces the way it is going), the violet spider, the white-and-red flea, the white wand and
//     its one-pixel shot
//   - a lost life is a burst of bits that steps down through darker palette entries (no blend,
//     no strobe); the spider's score floats where it died
//   - GET READY / ROUND WON / GAME OVER on double-framed plates
import { roundEven, PixelFont, d6 } from '../../sdk/index.js';
import { SporeFieldPalette, SporeFieldSpec } from './spec.js';
import { SporeFieldRound } from './round.js';
import { Shroom, BodyA, BodyB, HeadA, HeadB, SpiderA, SpiderB, FleaSprite, Wand } from './sprites.js';

const Cell = 8;
const OX = SporeFieldRound.FieldCol * Cell, OY = SporeFieldRound.FieldRow * Cell;   // (8, 24)
const FW = SporeFieldRound.W * Cell, FH = SporeFieldRound.H * Cell;                  // 304 x 208
const Phase = SporeFieldRound.Phase;

function R(v) { return Math.trunc(roundEven(v)); }

function PX(x) { return OX + R(f32sub(x)); }
function PY(y) { return OY + R(f32sub(y)); }
function f32sub(v) { return (v - 0.5) * Cell; }

export class SporeFieldRenderer {
    constructor() {
        const pal = SporeFieldPalette;
        this.cBg = pal.get('bg'); this.cRed = pal.get('red'); this.cRedDim = pal.get('redDark');
        this.cGreen = pal.get('green'); this.cGreenDim = pal.get('greenDark');
        this.cViolet = pal.get('violet'); this.cVioletDim = pal.get('violetDark'); this.cWhite = pal.get('white');
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.p === Phase.Idle) return;

        this._drawHud(s, r);

        s.clip(OX, OY, FW, FH);
        const W = SporeFieldRound.W, H = SporeFieldRound.H;
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const hp = r.mush[y * W + x];
                if (hp > 0) s.blit(Shroom[Math.min(hp, 4)], OX + x * Cell, OY + y * Cell, SporeFieldPalette);
            }

        const dying = r.p === Phase.Dying;
        const lostCard = (r.p === Phase.Card || r.p === Phase.Over) && !r.roundWon;

        if (r.flea.active) s.blit(FleaSprite, PX(r.flea.x), PY(r.flea.y), SporeFieldPalette);

        for (const c of r.chains) {
            for (let i = c.segs.length - 1; i >= 0; i--) {
                const g = c.segs[i];
                const step = ((g.x + g.y) & 1) === 0;
                const spr = i === 0 ? (step ? HeadA : HeadB) : (step ? BodyA : BodyB);
                s.blit(spr, PX(r.segX(g)), PY(r.segY(g)), SporeFieldPalette, 1, i === 0 && c.dirX < 0);
            }
        }

        // the spider (its legs step at 2.5 Hz)
        if (r.spider.active) {
            const spr = Math.trunc(t * 5) % 2 === 0 ? SpiderA : SpiderB;
            s.blit(spr, OX + R(r.spider.x * Cell) - 8, PY(r.spider.y), SporeFieldPalette);
        }

        // the shot: one bright pixel column
        if (r.shotActive) {
            const sx = OX + Math.floor(r.shotX * Cell);
            const sy = OY + R(r.shotY * Cell);
            s.rect(sx, sy, 1, 6, this.cWhite);
        }

        // the wand, or what is left of it
        if (dying || lostCard) this._drawBurst(s, r, dying ? r.phaseTime : 99);
        else s.blit(Wand, PX(r.playerX), PY(r.playerY), SporeFieldPalette);

        // floating scores
        for (const p of r.popups)
            s.textCentered(String(p.points), OX + R(p.x * Cell), PY(p.y) + 1, PixelFont.Arcade, this.cWhite);
        s.noClip();

        this._drawOverlay(s, r, t);
    }

    _drawBurst(s, r, pt) {
        if (pt > 1.9) return;
        const cx = PX(r.deathX) + 4, cy = PY(r.deathY) + 4;
        if (pt < 0.3) {
            // the hit itself: a white star where the wand was (one frame of it, not a strobe)
            s.rect(cx - 7, cy - 1, 14, 2, this.cWhite);
            s.rect(cx - 1, cy - 7, 2, 14, this.cWhite);
            s.rect(cx - 3, cy - 3, 6, 6, this.cWhite);
        }
        const rad = 3 + Math.trunc(Math.min(pt, 1.1) * 20);
        const hot = [this.cWhite, this.cRed, this.cViolet];
        const cold = [this.cRed, this.cRedDim, this.cVioletDim];
        for (let k = 0; k < 24; k++) {
            const a = k * 0.2618 + 0.13;
            const m = rad * (0.45 + (k % 4) * 0.18);
            const bx = cx + Math.trunc(Math.cos(a) * m), by = cy + Math.trunc(Math.sin(a) * m);
            const col = pt < 0.9 ? hot[k % 3] : pt < 1.4 ? cold[k % 3] : this.cRedDim;
            const sz = pt < 1.4 ? 3 : 2;
            s.rect(bx - 1, by - 1, sz, sz, col);
        }
    }

    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 12, arc, this.cRed);
        s.text(d6(r.score), 28, 9, dsp, this.cWhite, 2);
        // the borer tally: one pip per segment of the one borer, green while it lives
        for (let i = 0; i < SporeFieldRound.BorerLength; i++) {
            const x = 146 + i * 8, y = 12;
            if (i < r.segmentsLeft) {
                s.rect(x + 1, y, 4, 6, this.cGreen);
                s.rect(x, y + 1, 6, 4, this.cGreen);
            } else s.frame(x, y, 6, 6, this.cGreenDim);
        }
        // lives: the wand and a display digit
        s.blit(Wand, 282, 12, SporeFieldPalette);
        s.text(String(Math.max(0, r.lives)), 296, 9, dsp, this.cWhite, 2);
    }

    _drawOverlay(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + Math.trunc(FH / 2);
        const spec = SporeFieldSpec;
        switch (r.p) {
            case Phase.Ready:
                if (r.firstReady) {
                    s.textBox('PLAYER 1', midX, midY - 30, dsp, 2, this.cWhite, this.cRed, this.cBg);
                    s.plate(midX - 60, midY - 2, 120, 22, this.cBg, this.cGreen);
                    s.textCentered('GET READY', midX, midY + 5, arc, this.cGreen);
                } else {
                    s.textBox('GET READY', midX, midY - 30, dsp, 2, this.cGreen, this.cRed, this.cBg);
                    s.plate(midX - 60, midY - 2, 120, 22, this.cBg, this.cRed);
                    s.textCentered('WANDS LEFT ' + r.lives, midX, midY + 5, arc, this.cWhite);
                }
                if (r.mercyActive) s.textCenteredShadow('FREE RIDE', midX, midY + 30, arc, this.cViolet, this.cBg);
                break;
            case Phase.Card:
            case Phase.Over: {
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 34, dsp, 3, won ? this.cGreen : this.cRed, this.cRed, this.cBg);
                s.plate(midX - 84, midY + 2, 168, 46, this.cBg, won ? this.cGreen : this.cViolet);
                s.textCentered('SCORE ' + d6(r.score), midX, midY + 9, arc, this.cWhite, 2);
                const line = won ? 'BORER CLEARED' : r.segmentsLeft + ' SEGMENT' + (r.segmentsLeft === 1 ? '' : 'S') + ' LEFT';
                s.textCentered(line, midX, midY + 32, arc, won ? this.cGreen : this.cViolet);
                break;
            }
        }
    }
}
