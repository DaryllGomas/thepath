// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · THE PICTURE.
// Port of SpritePopRenderer.cs (the SpritePopArt half lives in art.js).
//
// Built for a curved tube seen from 0.8 m: every actor is a chunky 16 px sprite, bubbles are 16 px
// (22 px with a creature inside), the field fills the tube edge to edge inside the 8 px margin.
//   - HUD band y 8..27: 1UP + the score in display digits at scale 2, the cub's head + lives digit,
//     a creature head + how many are left, ROUND n on the right; a pink dotted rule under it
//   - the field 19 x 12 tiles of 16 px at (8, 32): candy-striped pink blocks with a lit top edge
//     and a dark underside, each casting the 1986 board's hard indigo drop shadow down-right
//   - the cub (lime and yellow, spiked back, big eye) stand / 2-step walk / jump / blow / dizzy;
//     wind-ups (green, big eyes, a turning yellow key) walk in 2 frames; whistlers flap 2 frames;
//     ANGRY creatures go red. All mirrored for facing.
//   - bubbles: a candy-blue ring with a white glint; with a creature inside the ring is 22 px and
//     warns in pink for the last 2 s, then red/white at 2 Hz for the last second
//   - pops burst in 8 rays; points rise in display digits (a chain shows big and yellow)
//   - ROUND n / READY, HURRY UP!, ALL POPPED!, ROUND WON / GAME OVER on double-framed plates;
//     FREE RIDE on the mercy credit; a blinking YOU tag over the cub while it waits.
// Nothing flashes inside the 3-30 Hz strobe band: blinks run at 1-2 Hz.
import { f32, d6, idiv, roundEven, PixelFont, SurfaceDraw, RoundResult } from '../../sdk/index.js';
import { SpritePopPalette, SpritePopSpec } from './spec.js';
import { SpritePopLevel } from './tiles.js';
import { SpritePopSim } from './round.js';
import * as Art from './art.js';

const OX = 8, OY = 32;
const T = SpritePopLevel.Tile;
const Phase = SpritePopSim.Phase, CState = SpritePopSim.CState, Kind = SpritePopSim.Kind;

export class SpritePopRenderer {
    constructor() {
        const pal = this.pal = SpritePopPalette;
        this.cBg = pal.get('bg'); this.cShadow = pal.get('shadow'); this.cPink = pal.get('pink'); this.cPinkL = pal.get('pinkLight'); this.cPinkD = pal.get('pinkDark');
        this.cBlue = pal.get('blue'); this.cBlueD = pal.get('blueDark'); this.cWhite = pal.get('white'); this.cGreen = pal.get('green'); this.cCub = pal.get('cub');
        this.cYellow = pal.get('yellow'); this.cOrange = pal.get('orange'); this.cRed = pal.get('red'); this.cRedD = pal.get('redDark');
        this.cubStand = Art.build(pal, Art.CubStand);
        this.cubWalk = Art.build(pal, Art.CubWalk);
        this.cubJump = Art.build(pal, Art.CubJump);
        this.cubBlow = Art.build(pal, Art.CubBlow);
        this.cubDizzy = Art.build(pal, Art.CubDizzy);
        this.cubHead = Art.build(pal, Art.CubHead);
        this.windHead = Art.build(pal, Art.WindHead);
        this.wind = [Art.build(pal, Art.WindA), Art.build(pal, Art.WindB)];
        this.windAngry = [Art.build(pal, Art.WindA, Art.Angry), Art.build(pal, Art.WindB, Art.Angry)];
        this.whistle = [Art.build(pal, Art.WhistleA), Art.build(pal, Art.WhistleB)];
        this.whistleAngry = [Art.build(pal, Art.WhistleA, Art.Angry), Art.build(pal, Art.WhistleB, Art.Angry)];
        this.fruit = Art.FruitRows.map(rows => Art.build(pal, rows));
        this.fruitBottom = new Int32Array(this.fruit.length);
        for (let i = 0; i < this.fruit.length; i++)
            for (let j = 0; j < this.fruit[i].height; j++)
                for (let k = 0; k < this.fruit[i].width; k++)
                    if (this.fruit[i].at(k, j) >= 0) this.fruitBottom[i] = j;
        this.ringTrap = Art.ring(pal, 11, 'blue', 'blueDark', true);
        this.ringWarn = Art.ring(pal, 11, 'pink', 'pinkDark', true);
        this.ringLate = Art.ring(pal, 11, 'red', 'redDark', true);
        this.rings = new Map();
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.level == null) return;
        t = f32(t);

        this._drawField(s, r.level);

        s.clip(OX, OY, SpritePopLevel.FW, SpritePopLevel.FH);
        for (const f of r.fruits) this._drawFruit(s, f);
        for (const b of r.bubbles) this._drawBubble(s, r, b);
        for (const c of r.creatures) if (c.state === CState.Free) this._drawCreature(s, c);
        this._drawCub(s, r);
        for (const bu of r.bursts) this._drawBurst(s, bu);
        for (const p of r.popups) this._drawPopup(s, p);
        s.noClip();

        this._drawHud(s, r);
        this._drawOverlays(s, r, t);
    }

    // ---------------------------------------------------------------- the field
    _drawField(s, L) {
        s.clip(OX, OY, SpritePopLevel.FW, SpritePopLevel.FH);
        // the hard drop shadow, down-right, then the blocks over it
        for (let row = 0; row < SpritePopLevel.Rows; row++)
            for (let col = 0; col < SpritePopLevel.Cols; col++)
                if (L.solid(col, row)) s.rect(OX + col * T + 4, OY + row * T + 4, T, T, this.cShadow);
        for (let row = 0; row < SpritePopLevel.Rows; row++)
            for (let col = 0; col < SpritePopLevel.Cols; col++)
                if (L.solid(col, row)) this._drawBlock(s, L, col, row);
        s.noClip();
    }

    _drawBlock(s, L, col, row) {
        const x0 = OX + col * T, y0 = OY + row * T;
        s.rect(x0, y0, T, T, this.cPink);
        // candy stripes, continuous across neighbouring blocks
        for (let j = 0; j < T; j++)
            for (let i = 0; i < T; i++)
                if ((((col * T + i) + (row * T + j)) & 7) < 2) s.setPixel(x0 + i, y0 + j, this.cPinkL);
        const up = row > 0 && L.solid(col, row - 1), down = row < SpritePopLevel.Rows - 1 && L.solid(col, row + 1);
        const left = col > 0 && L.solid(col - 1, row), right = col < SpritePopLevel.Cols - 1 && L.solid(col + 1, row);
        if (!up) { s.rect(x0, y0, T, 2, this.cPinkL); s.rect(x0, y0, T, 1, this.cWhite); }
        if (!down) s.rect(x0, y0 + T - 3, T, 3, this.cPinkD);
        if (!left) s.rect(x0, y0, 1, T, this.cPinkL);
        if (!right) s.rect(x0 + T - 1, y0, 1, T, this.cPinkD);
    }

    // ---------------------------------------------------------------- actors
    _drawCub(s, r) {
        const c = r.cub;
        const x = OX + roundEven(c.x), y = OY + roundEven(c.y);
        const flip = c.face < 0;
        if (r.p === Phase.Ouch) {
            const pt = r.phaseTime;
            const dx = OX + roundEven(r.deathX), dy = OY + roundEven(r.deathY);
            if (pt < f32(0.3)) { s.blitTinted(this.cubStand, dx, dy, this.cWhite, 1, flip); return; }
            // dizzy: it spins (facing flips at 2.5 Hz), a ring of stars circles its head, it sinks
            const f = Math.trunc(f32(pt * 5)) % 2 === 0;
            const sink = Math.trunc(Math.min(10, f32(f32(pt - f32(0.3)) * 8)));
            s.blit(this.cubDizzy, dx, dy + sink, this.pal, 1, f);
            for (let k = 0; k < 3; k++) {
                const a = pt * 5.0 + k * 2.094;
                const sx = dx + 8 + Math.trunc(Math.cos(a) * 10), sy = dy + sink - 3 + Math.trunc(Math.sin(a) * 3);
                this._star(s, sx, sy, k === 1 ? this.cWhite : this.cYellow);
            }
            return;
        }
        if (r.p === Phase.Card || r.p === Phase.Over) {
            if (r.result === RoundResult.Lost) return;
        }
        if (r.guard > 0 && Math.trunc(f32(r.guard * 4)) % 2 === 1) return;          // 2 Hz guard blink
        let spr;
        if (r.blowAnim > 0) spr = this.cubBlow;
        else if (!c.grounded) spr = this.cubJump;
        else if (c.anim > 0) spr = Math.trunc(f32(c.anim * 7)) % 2 === 0 ? this.cubStand : this.cubWalk;
        else spr = this.cubStand;
        s.blit(spr, x, y, this.pal, 1, flip);
    }

    _star(s, x, y, c) {
        s.rect(x - 1, y, 3, 1, c); s.rect(x, y - 1, 1, 3, c);
    }

    _drawCreature(s, c) {
        const x = OX + roundEven(c.x), y = OY + roundEven(c.y);
        let fr, spr;
        if (c.kind === Kind.Whistler) {
            fr = Math.trunc(f32(f32(c.anim + f32(c.id * f32(0.13))) * 5)) % 2;
            spr = c.angry ? this.whistleAngry[fr] : this.whistle[fr];
        } else {
            fr = c.grounded ? Math.trunc(f32(f32(c.anim + f32(c.id * f32(0.21))) * (c.angry ? 7 : 5))) % 2 : 0;
            spr = c.angry ? this.windAngry[fr] : this.wind[fr];
        }
        s.blit(spr, x, y, this.pal, 1, c.face < 0);
    }

    _drawBubble(s, r, b) {
        const cx = OX + roundEven(b.x), cy = OY + roundEven(b.y);
        if (b.held == null) {
            // the mercy shows: the ring is drawn bigger as the catch radius widens (8 px at base)
            const R = Math.max(8, Math.min(13, 8 + roundEven(f32(f32(r.catchRadius - f32(9.5)) * f32(0.5)))));
            // a young bubble grows out of the cub's mouth over its first 0.12 s
            if (b.age < f32(0.12)) {
                const rr = 3 + Math.trunc(f32(f32(b.age / f32(0.12)) * (R - 3)));
                s.circle(cx, cy, rr, this.cBlue, false);
                s.setPixel(cx - idiv(rr, 2), cy - idiv(rr, 2), this.cWhite);
                return;
            }
            // a soft bubble (it can still catch) is candy blue; a hardened one goes pale, and dims
            // for its last second before it pops by itself
            const key = b.hard ? (b.life < 1 ? 200 + R : 100 + R) : R;
            let ring = this.rings.get(key);
            if (ring === undefined) {
                ring = key >= 200 ? Art.ring(this.pal, R, 'blueDark', 'shadow', false)
                    : key >= 100 ? Art.ring(this.pal, R, 'blueDark', 'blue', true)
                        : Art.ring(this.pal, R, 'blue', 'blueDark', true);
                this.rings.set(key, ring);
            }
            s.blit(ring, cx - R, cy - R, this.pal);
            return;
        }
        const c = b.held;
        const spr = c.kind === Kind.Whistler ? (c.angry ? this.whistleAngry[0] : this.whistle[0]) : (c.angry ? this.windAngry[1] : this.wind[1]);
        s.blit(spr, cx - 8, cy - 8, this.pal, 1, c.face < 0);
        let rg = this.ringTrap;
        if (b.trapLeft < 1) rg = Math.trunc(f32(b.trapLeft * 4)) % 2 === 0 ? this.ringLate : this.ringWarn;     // 2 Hz
        else if (b.trapLeft < 2) rg = this.ringWarn;
        s.blit(rg, cx - 11, cy - 11, this.pal);
    }

    _drawFruit(s, f) {
        if (f.life < 2 && Math.trunc(f32(f.life * 4)) % 2 === 1) return;           // 2 Hz: about to go
        const k = f.kind % this.fruit.length;
        // sat on the platform: the fruit's lowest pixel on the row just above the feet line
        const x = OX + roundEven(f.x) + 1, y = OY + roundEven(f.feet) - 1 - this.fruitBottom[k];
        s.blit(this.fruit[k], x, y, this.pal);
    }

    _drawBurst(s, b) {
        const cx = OX + roundEven(b.x), cy = OY + roundEven(b.y);
        const k = f32(b.t / f32(0.35));
        const r0 = Math.trunc(f32(4 + f32(k * (b.big ? 12 : 8)))), r1 = r0 + (b.big ? 5 : 3);
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4 + 0.39;
            const x0 = cx + roundEven(Math.cos(a) * r0), y0 = cy + roundEven(Math.sin(a) * r0);
            const x1 = cx + roundEven(Math.cos(a) * r1), y1 = cy + roundEven(Math.sin(a) * r1);
            s.line(x0, y0, x1, y1, i % 2 === 0 ? this.cWhite : this.cBlue);
            s.line(x0 + 1, y0, x1 + 1, y1, i % 2 === 0 ? this.cWhite : this.cBlue);
        }
    }

    _drawPopup(s, p) {
        const dsp = PixelFont.Display;
        const x = OX + roundEven(p.x), y = OY + roundEven(p.y) - 8;
        if (p.chain >= 2) {
            s.textCenteredShadow(p.text, x, y - 4, dsp, this.cYellow, this.cBg, 2);
            s.textCenteredShadow('X' + p.chain, x, y + 12, PixelFont.Arcade, this.cPinkL, this.cBg);
        }
        else s.textCenteredShadow(p.text, x, y, dsp, p.chain === 0 ? this.cYellow : this.cWhite, this.cBg);
    }

    // ---------------------------------------------------------------- HUD
    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cPink);
        s.text(d6(r.score), 28, 10, dsp, this.cWhite, 2);
        s.blit(this.cubHead, 134, 10, this.pal);
        s.text(String(Math.max(0, r.lives)), 150, 10, dsp, this.cCub, 2);
        s.blit(this.windHead, 178, 10, this.pal);
        s.text(String(r.creaturesLeft), 194, 10, dsp, this.cGreen, 2);
        const rn = String(r.round);
        s.textRight(rn, 312, 10, dsp, this.cWhite, 2);
        s.textRight('ROUND', 312 - dsp.measure(rn, 2) - 5, 13, arc, this.cPink);
        s.dottedRule(8, 312, 27, 3, this.cPinkD);
    }

    // ---------------------------------------------------------------- plates
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mid = 160;
        switch (r.p) {
            case Phase.Ready: {
                s.textBox('ROUND ' + r.round, mid, 92, dsp, 3, this.cWhite, this.cPink, this.cBg);
                const h = r.mercyActive ? 36 : 26;
                s.plate(mid - 70, 122, 140, h, this.cBg, this.cBlue);
                s.textCentered(r.level.name, mid, 126, arc, this.cBlue);
                s.textCentered('READY!', mid, 136, arc, this.cYellow);
                if (r.mercyActive) s.textCentered('FREE RIDE', mid, 146, arc, this.cCub);
                if (SurfaceDraw.blink(t, 1)) this._youTag(s, r);
                break;
            }
            case Phase.Play:
                if (r.hurry && r.hurryT < r.hurryBanner && !r.clearing)
                    s.textBox('HURRY UP!', mid, 70, dsp, 3, this.cRed, this.cYellow, this.cBg);
                if (r.clearing)
                    s.textBox('ALL POPPED!', mid, 70, dsp, 2, this.cYellow, this.cPink, this.cBg);
                if (r.guard > 0 && r.phaseTime < f32(1.5) && SurfaceDraw.blink(t, 1)) this._youTag(s, r);
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = SpritePopSpec;
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, mid, 76, dsp, 3, won ? this.cYellow : this.cRed, this.cPink, this.cBg);
                s.plate(mid - 88, 106, 176, 50, this.cBg, this.cBlue);
                s.textCentered('SCORE ' + d6(r.score), mid, 112, arc, this.cWhite, 2);
                s.textCentered('POPPED ' + r.popped + '   FRUIT ' + r.fruitTaken, mid, 134, arc, this.cBlue);
                s.textCentered('BEST CHAIN X' + Math.max(1, r.maxChain), mid, 145, arc, this.cPinkL);
                break;
            }
        }
    }

    _youTag(s, r) {
        const x = OX + roundEven(r.cub.cx), y = OY + roundEven(r.cub.y) - 12;
        s.textCenteredShadow('YOU', x, y, PixelFont.Arcade, this.cYellow, this.cBg);
    }
}

SpritePopRenderer.OX = OX;
SpritePopRenderer.OY = OY;
