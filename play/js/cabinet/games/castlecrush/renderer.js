// THE NODE · world 1 · CASTLE CRUSH · THE PICTURE.
// Port of CastleCrushRenderer.cs from Staging/Batch1/castlecrush.
//
// A 1981 raster board, palette-limited, inside the 8 px safe area:
//   - HUD band y 8..27: 1UP + the score in big display digits (gold), CASTLE and its number in the
//     middle, STONES and a stone icon per stone left on the right, a red dotted rule under it all
//   - the field x 13..306, y 32..231 between two stone pillars: a night sky with a few fixed stars,
//     the far hills a step off the sky, grass along the bottom
//   - the castle: 14 x 4 courses of 21 x 14 px blocks on black mortar. Grey stone (lit top-left, shaded
//     bottom-right), red brick on cream mortar (cracked at one hit left), iron-banded plates with
//     gold rivets (rivets dull, then crack, as it weakens), the iron portcullis gate; arrow slits
//     in the towers; a gold diamond marks a block that holds a power-up
//   - the banner in the middle of the keep, on its highest block (in a rubble pile once the keep
//     is levelled); when the castle is down it tips over and drops to the grass
//   - the catapult cart: a red beam with gold rivets on an A-frame and two black wheels; the
//     throwing arm flicks up for a moment on every launch and rebound; the stone rides a cup while
//     it waits for A; an arrow that strikes it stays stuck in the beam through the beat
//   - the mercy credit's golden net: a two-strand mesh just above the grass
//   - archers rise from behind the battlements, draw (the telegraph), loose, and sink back
//   - no strobes: every blink is 1 Hz; hit flashes are single frames of lighter stone
import { d6, roundEven, PixelFont, PixelSprite, SurfaceDraw } from '../../sdk/index.js';
import { CastleCrushPalette, CastleCrushSpec } from './spec.js';
import { CastleCrushRound } from './round.js';

const Phase = CastleCrushRound.Phase, Kind = CastleCrushRound.Kind, Power = CastleCrushRound.Power, Cause = CastleCrushRound.Cause;
const FL = CastleCrushRound.FieldL, FR = CastleCrushRound.FieldR, FT = CastleCrushRound.FieldT, FB = CastleCrushRound.FieldB;
const CellW = CastleCrushRound.CellW, CellH = CastleCrushRound.CellH;

const StoneSprite = PixelSprite.fromRows(
    '..333..',
    '.31113.',
    '3151113',
    '3111113',
    '3111113',
    '.31113.',
    '..333..');
const StoneSlowSprite = PixelSprite.fromRows(
    '..888..',
    '.81118.',
    '8151118',
    '8111118',
    '8111118',
    '.81118.',
    '..888..');
const StoneIcon = PixelSprite.fromRows(
    '..333..',
    '.32223.',
    '3242223',
    '3222223',
    '3222223',
    '.32223.',
    '..333..');
const ArcherDrawSprite = PixelSprite.fromRows(
    '...bbb...',
    '..bbabb..',
    '..b555b..',
    '...555...',
    '.aaaaaaa.',
    '5aaaaaaa5',
    '6.aabaa.6',
    '6..a4a..6',
    '.6..4..6.',
    '..66466..',
    '....3....');
const ArcherLooseSprite = PixelSprite.fromRows(
    '...bbb...',
    '..bbabb..',
    '..b555b..',
    '...555...',
    '.aaaaaaa.',
    '5aaaaaaa5',
    '6.aabaa.6',
    '6..a.a..6',
    '.6.....6.',
    '..66566..',
    '.........');
const ArrowSprite = PixelSprite.fromRows(
    '6...6',
    '.6.6.',
    '..6..',
    '..5..',
    '..5..',
    '..5..',
    '..5..',
    '..5..',
    '44444',
    '.444.',
    '..4..');

// fixed stars (x, y) in the open sky; drawn before the castle so the masonry covers them
const Stars = [
    22, 38, 57, 44, 96, 36, 131, 41, 188, 37, 214, 45, 251, 39, 290, 43, 118, 46, 272, 35,
    30, 142, 71, 158, 104, 139, 142, 171, 177, 149, 213, 163, 246, 144, 283, 156, 58, 185, 263, 183, 160, 190, 20, 175,
];

function hash(a, b) {
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) | 0;
    h ^= h >> 13;
    return h & 0x7FFFFFFF;
}

export class CastleCrushRenderer {
    constructor() {
        const pal = CastleCrushPalette;
        this.pal = pal;
        this.cSky = pal.get('sky'); this.cBlack = pal.get('black'); this.cStoneD = pal.get('stoneDark');
        this.cStone = pal.get('stone'); this.cStoneL = pal.get('stoneLight'); this.cCream = pal.get('cream');
        this.cRed = pal.get('red'); this.cRedD = pal.get('redDark'); this.cGold = pal.get('gold');
        this.cGoldD = pal.get('goldDark'); this.cGreen = pal.get('green'); this.cGreenD = pal.get('greenDark');
        this.cHill = pal.get('hill');
    }

    draw(sim, s, t) {
        const g = sim;
        s.noClip();
        s.clear(this.cSky);
        if (g == null || g.blocks == null) return;

        this._drawFrame(s);
        s.clip(FL, FT, FR - FL, FB - FT);
        this._drawSky(s);
        this._drawCastle(s, g);
        this._drawBanner(s, g, t);
        this._drawArchers(s, g);
        for (const ar of g.arrows) s.blit(ArrowSprite, Math.round(ar.x) - 2, Math.round(ar.y) - 10, this.pal);
        for (const tk of g.tokens) this._drawToken(s, tk);
        this._drawCrumbs(s, g);
        if (g.mercyActive) this._drawNet(s, g);
        this._drawCart(s, g, t);
        for (const st of g.stones) s.blit(g.slowT > 0 ? StoneSlowSprite : StoneSprite, Math.round(st.x) - 3, Math.round(st.y) - 3, this.pal);
        for (const pu of g.popups) s.textCenteredShadow(pu.text, Math.round(pu.x), Math.round(pu.y), PixelFont.Arcade, this.cGold, this.cBlack);
        s.noClip();

        this._drawHud(s, g);
        this._drawOverlays(s, g, t);
    }

    // ------------------------------------------------------------------ the stage
    _drawFrame(s) {
        // stone pillars either side, the rampart line under the HUD
        s.rect(9, 30, 4, FB - 30, this.cStoneD); s.rect(12, 30, 1, FB - 30, this.cStone);
        s.rect(FR, 30, 4, FB - 30, this.cStoneD); s.rect(FR, 30, 1, FB - 30, this.cStone);
        for (let y = 34; y < FB; y += 8) { s.rect(9, y, 3, 1, this.cBlack); s.rect(FR + 1, y, 3, 1, this.cBlack); }
        s.rect(9, 30, FR - 9 + 4, 2, this.cStoneD);
    }

    _drawSky(s) {
        for (let i = 0; i < Stars.length; i += 2)
            s.setPixel(Stars[i], Stars[i + 1], (i / 2) % 3 === 0 ? this.cStoneL : this.cStoneD);
        // the far hills
        for (let x = FL; x < FR; x++) {
            const hy = 203 + Math.round(roundEven(5.0 * Math.sin(x * 0.031) + 3.0 * Math.sin(x * 0.093 + 1.3)));
            s.rect(x, hy, 1, 222 - hy, this.cHill);
        }
        // grass
        s.rect(FL, 222, FR - FL, 1, this.cGreen);
        s.rect(FL, 223, FR - FL, FB - 223, this.cGreenD);
        for (let x = FL + 1; x < FR; x += 5) { s.setPixel(x, 221, this.cGreen); s.setPixel(x + 2, 224, this.cGreen); }
        for (let x = FL + 3; x < FR; x += 11) s.setPixel(x, 227, this.cGreen);
    }

    // ------------------------------------------------------------------ the castle
    _drawCastle(s, g) {
        const W = CellW, H = CellH;
        // black mortar behind every standing block (joins them into one wall)
        for (const b of g.blocks) if (b != null && b.alive) s.rect(Math.trunc(b.x0) - 1, Math.trunc(b.y0) - 1, W + 1, H + 1, this.cBlack);
        for (const b of g.blocks) {
            if (b == null || !b.alive) continue;
            const x = Math.trunc(b.x0), y = Math.trunc(b.y0), w = W - 1, h = H - 1;
            const flash = b.flash > 0;
            switch (b.kind) {
                case Kind.Stone: this._drawStone(s, b, x, y, w, h, flash); break;
                case Kind.Mortar: this._drawBrick(s, b, x, y, w, h, flash); break;
                case Kind.Iron: this._drawIron(s, b, x, y, w, h, flash); break;
                default: this._drawGate(s, b, x, y, w, h, flash); break;
            }
            if (b.drop !== Power.None) {
                const cx = x + Math.trunc(w / 2), cy = y + Math.trunc(h / 2);
                s.rect(cx - 2, cy - 1, 5, 3, this.cBlack); s.rect(cx - 1, cy - 2, 3, 5, this.cBlack);
                s.rect(cx - 1, cy, 3, 1, this.cGold); s.rect(cx, cy - 1, 1, 3, this.cGold);
            }
        }
    }

    _drawStone(s, b, x, y, w, h, flash) {
        s.rect(x, y, w, h, flash ? this.cStoneL : this.cStone);
        s.rect(x, y, w, 1, this.cStoneL); s.rect(x, y, 1, h, this.cStoneL);
        s.rect(x, y + h - 1, w, 1, this.cStoneD); s.rect(x + w - 1, y, 1, h, this.cStoneD);
        const k = hash(b.col, b.row);
        s.setPixel(x + 3 + k % 12, y + 2 + (k >> 4) % 5, this.cStoneD);
        s.setPixel(x + 5 + (k >> 6) % 10, y + 5 + (k >> 9) % 4, this.cStoneD);
        if ((b.col === 1 || b.col === 12) && b.row >= 2 && CastleCrushRound.Layout[b.row][b.col] === 's')
            s.rect(x + Math.trunc(w / 2) - 1, y + 2, 2, h - 4, this.cBlack);            // an arrow slit in the tower
    }

    _drawBrick(s, b, x, y, w, h, flash) {
        s.rect(x, y, w, h, this.cCream);
        const br = flash ? this.cCream : this.cRed;
        const ch = Math.trunc((h - 1) / 2);                                           // two courses, the second offset by half a brick
        this._brick(s, x, y, 9, ch, br); this._brick(s, x + 10, y, w - 10, ch, br);
        const y2 = y + ch + 1, ch2 = h - ch - 1;
        this._brick(s, x, y2, 4, ch2, br); this._brick(s, x + 5, y2, 9, ch2, br); this._brick(s, x + 15, y2, w - 15, ch2, br);
        if (b.hp < b.maxHp) {
            // a crack runs through it
            const k = hash(b.col, b.row) % 6;
            let cx = x + 5 + k;
            for (let j = 0; j < h; j++) { s.setPixel(cx, y + j, this.cBlack); if ((j & 1) === 1) cx += (k & 1) === 0 ? 1 : -1; }
            s.setPixel(cx + 1, y + h - 3, this.cBlack);
        }
    }

    _brick(s, x, y, w, h, c) {
        s.rect(x, y, w, h, c);
        s.rect(x, y + h - 1, w, 1, this.cRedD);
    }

    _drawIron(s, b, x, y, w, h, flash) {
        s.rect(x, y, w, h, flash ? this.cStone : this.cStoneD);
        s.rect(x, y, w, 1, this.cStone);
        const rivet = b.hp >= 3 ? this.cGold : this.cGoldD;
        for (const bx of [x + 3, x + w - 5]) {
            s.rect(bx, y, 2, h, this.cBlack);
            if (b.hp >= 2) { s.setPixel(bx, y + 2, rivet); s.setPixel(bx + 1, y + h - 3, rivet); }
        }
        s.rect(x, y + Math.trunc(h / 2), w, 1, this.cBlack);
        if (b.hp === 1) { s.line(x + 8, y, x + 12, y + h - 1, this.cBlack); s.line(x + 9, y, x + 13, y + h - 1, this.cStone); }
    }

    _gateAt(col, row) {
        return row >= 0 && row < CastleCrushRound.Rows && CastleCrushRound.Layout[row][col] === 'g';
    }

    _drawGate(s, b, x, y, w, h, flash) {
        s.rect(x, y, w, h, this.cBlack);
        const bar = flash ? this.cStoneL : this.cStone;
        const gap = b.hp >= 3 ? 0 : b.hp === 2 ? 1 : 2;                   // bars go as it weakens
        let i = 0;
        for (let bx = x + 2; bx < x + w; bx += 4, i++) {
            if (gap > 0 && (i + b.col) % (4 - gap) === 0) continue;
            s.rect(bx, y, 1, h, bar);
        }
        s.rect(x, y + 3, w, 1, bar);
        if (b.hp >= 2) s.rect(x, y + h - 4, w, 1, bar);
        if (!this._gateAt(b.col, b.row + 1)) for (let bx = x + 2; bx < x + w; bx += 4) s.setPixel(bx, y + h - 1, this.cGold);   // spikes
        if (!this._gateAt(b.col, b.row - 1)) {
            // the arch over the gate
            const left = !this._gateAt(b.col - 1, b.row);
            for (let j = 0; j < 5; j++) s.rect(left ? x : x + w - (5 - j), y + j, 5 - j, 1, this.cStoneD);
        }
    }

    _drawBanner(s, g, t) {
        const falling = g.p === Phase.Fall || (g.p >= Phase.Card && g.roundWon);
        const fx = CastleCrushRound.BannerX;
        let fy = g.bannerY;
        if (g.bannerInRubble) {
            // the keep's rubble, the pole planted in it
            const bx = Math.round(fx), by = Math.round(fy);
            s.rect(bx - 9, by - 2, 19, 2, this.cStoneD); s.rect(bx - 6, by - 4, 13, 2, this.cStone); s.rect(bx - 3, by - 5, 7, 1, this.cStone);
            s.setPixel(bx - 7, by - 3, this.cStone); s.setPixel(bx + 5, by - 5, this.cStoneL); s.setPixel(bx - 2, by - 6, this.cStoneL);
            fy -= 4;
        }
        if (falling) fy += g.fallDrop;
        const th = falling ? g.fallAngle : 0;
        const dx = Math.sin(th), dy = -Math.cos(th);        // up the pole
        const nx = Math.cos(th), ny = Math.sin(th);         // across the flag
        const L = CastleCrushRound.PoleLen;
        for (let a = 0; a <= L; a += 0.5) this._plot(s, fx + dx * a, fy + dy * a, this.cStoneL);
        this._plot(s, fx + dx * (L + 1), fy + dy * (L + 1), this.cGold);
        this._plot(s, fx + dx * (L + 1) - nx, fy + dy * (L + 1) - ny, this.cGold);
        const flutter = th === 0 && SurfaceDraw.blink(t, 1);
        for (let a = L - 8; a <= L - 1; a += 0.5)
            for (let bb = 1; bb <= 13; bb += 0.5) {
                const along = L - 1 - a;                               // 0 at the top edge
                if (bb >= 11 && Math.abs(along - 3.5) < 1.6) continue;  // swallowtail
                if (flutter && bb >= 7 && along >= 6.5) continue;
                let c = this.cRed;
                if (bb >= 3 && bb <= 6 && along >= 2 && along <= 5) c = (Math.trunc(bb) === 4 && along < 3) ? this.cRed : this.cGold;   // the emblem
                if (along >= 6.5) c = this.cRedD;
                this._plot(s, fx + dx * a + nx * bb, fy + dy * a + ny * bb, c);
            }
    }

    _plot(s, x, y, c) { s.setPixel(Math.round(x), Math.round(y), c); }

    _drawArchers(s, g) {
        for (const a of g.archers) {
            const total = g.archerDraw + g.archerStay;
            let rise = Math.min(1, Math.min(a.t / 0.3, (total - a.t) / 0.25));
            if (rise < 0) rise = 0;
            const foot = Math.round(a.footY);
            const y = foot - 11 + Math.round((1 - rise) * 11);
            s.clip(FL, FT, FR - FL, foot - FT);
            s.blit(a.fired ? ArcherLooseSprite : ArcherDrawSprite, Math.round(a.x) - 4, y, this.pal);
            s.clip(FL, FT, FR - FL, FB - FT);
        }
    }

    _drawToken(s, tk) {
        const x = Math.round(tk.x) - 6, y = Math.round(tk.y) - 4;
        s.rect(x + 1, y, 11, 9, this.cGold); s.rect(x, y + 1, 13, 7, this.cGold);
        s.rect(x + 1, y + 1, 11, 7, this.cRedD);
        const l = tk.kind === Power.Wide ? 'W' : tk.kind === Power.Double ? 'D' : 'S';
        s.text(l, x + 4, y + 1, PixelFont.Arcade, this.cCream);
    }

    _drawCrumbs(s, g) {
        for (const c of g.crumbs) {
            const col = c.shade === 0 ? this.cStone : c.shade === 1 ? this.cStoneD : c.shade === 2 ? this.cRed : this.cGreen;
            s.rect(Math.round(c.x), Math.round(c.y), 2, 2, col);
        }
    }

    _drawNet(s, g) {
        // the golden net of the mercy credit: a two-strand mesh strung just above the grass
        const c = g.netFlash > 0 ? this.cCream : this.cGold;
        const y = Math.trunc(CastleCrushRound.NetY) - 3;
        for (let x = FL; x < FR; x += 2) { s.setPixel(x, y, c); s.setPixel(x + 1, y + 1, this.cGoldD); s.setPixel(x, y + 2, c); }
        s.rect(FL, y - 3, 1, 6, this.cGold); s.rect(FR - 1, y - 3, 1, 6, this.cGold);
    }

    _drawCart(s, g, t) {
        const w = Math.round(g.cartW);
        const x0 = Math.round(g.cartX - g.cartW * 0.5), cx = x0 + Math.trunc(w / 2);
        const top = Math.trunc(CastleCrushRound.CartTop);
        const hit = g.cartHitFlash > 0;
        // wheels
        for (const wx of [x0 + 5, x0 + w - 6]) {
            s.circle(wx, top + 9, 4, this.cBlack, true);
            s.circle(wx, top + 9, 4, this.cStone, false);
            s.setPixel(wx, top + 9, this.cGold);
        }
        // chassis and the A-frame under the beam
        s.rect(x0 + 2, top + 6, w - 4, 2, this.cRedD);
        s.line(cx - 6, top + 7, cx - 1, top + 3, this.cRedD); s.line(cx + 6, top + 7, cx + 1, top + 3, this.cRedD);
        s.line(cx - 5, top + 7, cx, top + 3, this.cRedD); s.line(cx + 5, top + 7, cx, top + 3, this.cRedD);
        // the beam: the surface the stone rebounds from
        const beam = hit ? this.cCream : this.cRed;
        s.rect(x0, top, w, 2, beam);
        s.rect(x0, top + 2, w, 1, this.cRedD);
        s.rect(x0, top, 1, 3, this.cRedD); s.rect(x0 + w - 1, top, 1, 3, this.cRedD);
        if (g.wideT > 0) s.rect(x0 + 1, top, w - 2, 1, this.cGold);
        for (let x = x0 + 3; x < x0 + w - 2; x += 5) s.setPixel(x, top + 1, this.cGold);
        if (g.p === Phase.Lost && g.lastCause === Cause.Arrow)
            s.blit(ArrowSprite, Math.round(g.cartX + g.stuckArrowX) - 2, top + 3 - 10, this.pal);   // stuck in the beam
        // the throwing arm: cocked under a waiting stone, flicked up after a throw
        if (g.serving || g.p === Phase.Ready) {
            s.line(cx + 7, top - 1, cx + 1, top - 3, this.cRedD);
            s.rect(cx - 3, top - 2, 7, 2, this.cRedD);
        } else if (g.armT > 0) {
            s.line(cx, top - 1, cx - 4, top - 12, this.cRed); s.line(cx + 1, top - 1, cx - 3, top - 12, this.cRed);
            s.rect(cx - 6, top - 14, 5, 2, this.cRedD);
        }
    }

    // ------------------------------------------------------------------ HUD + overlays
    _drawHud(s, g) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cRed);
        s.text(d6(g.score), 30, 10, dsp, this.cGold, 2);
        s.textCentered('CASTLE', 176, 9, dsp, this.cCream);
        s.textCentered(g.castleNumber.toString(), 176, 19, dsp, this.cGold);
        s.textRight('STONES', 312, 9, dsp, this.cCream);
        if (g.mercyActive) s.textRight('FREE', 312, 19, dsp, this.cGold);
        else for (let i = 0; i < g.stonesLeft; i++) s.blit(StoneIcon, 312 - 7 - i * 10, 19, this.pal);
        s.dottedRule(8, 312, 28, 3, this.cRed);
    }

    _drawOverlays(s, g, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mid = 160;
        switch (g.p) {
            case Phase.Ready:
                if (g.stonesLeft === g.maxStones && g.time < 3) {
                    s.textBox('CASTLE ' + g.castleNumber, mid, 148, dsp, 2, this.cCream, this.cRed, this.cSky);
                    s.textCenteredShadow('GET READY', mid, 170, arc, this.cGold, this.cBlack);
                } else {
                    s.textBox('NEXT STONE', mid, 148, dsp, 2, this.cCream, this.cRed, this.cSky);
                    s.textCenteredShadow('STONES LEFT ' + g.stonesLeft, mid, 170, arc, this.cGold, this.cBlack);
                }
                if (g.mercyActive) s.textCenteredShadow('FREE SIEGE  THE NET HOLDS', mid, 182, arc, this.cCream, this.cBlack);
                break;
            case Phase.Siege:
                if (g.serving && SurfaceDraw.blink(t, 1)) {
                    let x = Math.round(g.cartX);
                    const half = Math.trunc(arc.measure('A  LAUNCH') / 2) + 2;
                    if (x < FL + half) x = FL + half; if (x > FR - half) x = FR - half;
                    s.textCenteredShadow('A  LAUNCH', x, 188, arc, this.cGold, this.cBlack);
                }
                break;
            case Phase.Lost: {
                const arrow = g.lastCause === Cause.Arrow;
                s.textBox(arrow ? 'ARROW HIT' : 'STONE LOST', mid, 148, dsp, 2, this.cCream, this.cRed, this.cSky);
                s.textCenteredShadow(g.stonesLeft > 0 ? 'STONES LEFT ' + g.stonesLeft : 'NO STONES LEFT', mid, 170, arc, this.cGold, this.cBlack);
                break;
            }
            case Phase.Fall:
                if (g.phaseTime >= 0.5) {
                    s.textBox('CASTLE TAKEN', mid, 46, dsp, 2, this.cGold, this.cRed, this.cSky);
                    if (g.phaseTime >= 1.2) s.textCenteredShadow('CASTLE BONUS ' + g.castleBonus, mid, 70, arc, this.cCream, this.cBlack);
                    if (g.phaseTime >= 1.8) s.textCenteredShadow('STONE BONUS  ' + g.stoneBonus, mid, 82, arc, this.cCream, this.cBlack);
                }
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = CastleCrushSpec;
                const won = g.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, mid, 104, dsp, 3, won ? this.cGold : this.cCream, this.cRed, this.cSky);
                s.plate(mid - 90, 136, 180, 46, this.cSky, this.cRed);
                s.textCentered('SCORE ' + d6(g.score), mid, 142, arc, this.cGold, 2);
                s.textCentered(won ? 'THE BANNER IS YOURS' : 'THE CASTLE STANDS', mid, 164, arc, this.cCream);
                break;
            }
        }
    }
}
