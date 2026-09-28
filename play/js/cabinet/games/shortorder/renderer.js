// THE NODE · world 1 · SHORT ORDER on the Cabinet Engine · THE PICTURE.
// Port of ShortOrderRenderer.cs (Staging/Batch2/shortorder); the sprites live in art.js.
//
// Built for a curved tube seen from 0.8 m: every walker is a 16 x 16 sprite, the burger parts are
// 48 px wide slabs, the floors run the whole safe area and the plates sit on its bottom edge.
//   - HUD band y 8..29: 1UP + the score in display digits, the pepper shaker + shakes left in
//     display digits, four burger pips (filled as they finish), chef heads for lives
//   - the kitchen: blue girders with a bright top edge, ladders whose rails poke up through the
//     floor above (so you can see where a ladder goes down), cream plates at the bottom
//   - parts are drawn in three 16 px segments; a segment the chef has walked on sags 2 px
//   - chasers: hot dog (red in a tan bun), pickle (green), fried egg (white with a yolk face);
//     stunned ones wear three slow-circling stars (well under the 3 Hz strobe floor); squashed
//     ones lie flat and step down to dim before they vanish
//   - the pepper cloud is a ring of grains that grows to the stun radius in 0.45 s
//   - score popups (500 rider, 100 crush, 1000 burger) rise from where they happened
//   - plates: READY! (ON THE HOUSE on the mercy credit), CAUGHT!, 4 BURGERS UP, ORDER UP! /
//     GAME OVER with the score
// Everything is clipped to the 8 px safe area.
import { f32, d6, idiv, roundEven, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { ShortOrderSpec } from './spec.js';
import { ShortOrderArt as A, ShortOrderPalette } from './art.js';
import { ShortOrderMap as M } from './map.js';
import { ShortOrderSim, PartKind, FoeMode, SoEvent } from './round.js';

const PlayX = 8, PlayY = 8, PlayW = 304, PlayH = 224;
const Phase = ShortOrderSim.Phase;

export class ShortOrderRenderer {
    constructor() {
        const pal = this.pal = ShortOrderPalette;
        this.cBg = pal.get('bg'); this.cGirder = pal.get('girder'); this.cGirderLt = pal.get('girderLt'); this.cCream = pal.get('cream');
        this.cBun = pal.get('bun'); this.cBunDk = pal.get('bunDk'); this.cLet = pal.get('lettuce'); this.cLetDk = pal.get('lettuceDk');
        this.cRed = pal.get('red'); this.cRedDk = pal.get('redDk'); this.cWhite = pal.get('white'); this.cBlue = pal.get('blue');
        this.cYellow = pal.get('yellow'); this.cSkin = pal.get('skin'); this.cPatty = pal.get('patty'); this.cDim = pal.get('dim');
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.p === Phase.Idle) return;
        t = f32(t);
        s.clip(PlayX, PlayY, PlayW, PlayH);
        this._drawHud(s, r);
        this._drawPlates(s);
        this._drawFloors(s);
        this._drawLadders(s);
        this._drawParts(s, r);
        this._drawFoes(s, r, t);
        this._drawChef(s, r, t);
        this._drawPepper(s, r);
        this._drawPopups(s, r);
        this._drawOverlay(s, r, t);
        s.noClip();
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, pal = this.pal;
        s.text('1UP', 8, 13, arc, this.cRed);
        s.text(d6(r.score), 30, 10, dsp, this.cCream, 2);
        // pepper: the shaker and the shakes left
        s.blit(A.shaker, 134, 10, pal);
        s.text(String(Math.min(99, r.peppers)), 146, 10, dsp, r.peppers > 0 ? this.cCream : this.cDim, 2);
        // four burger pips
        for (let b = 0; b < M.Burgers; b++) {
            const x = 190 + b * 16, y = 12;
            const done = r.stacked[b] >= M.PartsPerBurger;
            if (done) {
                s.rect(x + 2, y, 8, 2, this.cBun); s.rect(x + 1, y + 2, 10, 1, this.cBun);
                s.rect(x, y + 3, 12, 2, this.cLet); s.rect(x, y + 5, 12, 2, this.cPatty); s.rect(x + 1, y + 7, 10, 2, this.cBun);
            } else {
                s.frame(x, y, 12, 9, this.cDim);
                const k = r.stacked[b];
                if (k > 0) s.rect(x + 1, y + 8 - k * 2, 10, k * 2, this.cBunDk);
            }
        }
        // lives: chef heads, the lost ones dimmed
        for (let i = 0; i < r.startLives; i++) {
            const x = 302 - i * 13;
            if (i < r.lives) s.blit(A.lifeIcon, x, 12, pal);
            else s.blitTinted(A.lifeIcon, x, 12, this.cDim);
        }
        s.dottedRule(8, 312, 29, 3, this.cGirderLt);
    }

    // ------------------------------------------------------------------ the kitchen
    _drawPlates(s) {
        for (let b = 0; b < M.Burgers; b++) {
            const x = M.burgerX0(b);
            s.rect(x - 6, M.PlateY, M.BurgerW + 12, 2, this.cCream);
            s.rect(x - 3, M.PlateY + 2, M.BurgerW + 6, 1, this.cCream);
            s.rect(x + 2, M.PlateY + 3, M.BurgerW - 4, 2, this.cDim);
        }
    }

    _drawFloors(s) {
        for (let f = 0; f < M.Floors; f++) {
            const y = M.floorY(f);
            for (let c = 0; c < M.Cols; c++) {
                if (!M.walk(c, f)) continue;
                const x = M.OX + c * M.TilePx;
                s.rect(x, y, 16, 4, this.cGirder);
                s.rect(x, y, 16, 1, this.cGirderLt);
                s.setPixel(x + 3, y + 2, this.cGirderLt);
                s.setPixel(x + 12, y + 2, this.cGirderLt);
                if (!M.walk(c - 1, f)) s.rect(x, y, 1, 4, this.cGirderLt);
                if (!M.walk(c + 1, f)) s.rect(x + 15, y, 1, 4, this.cGirderLt);
            }
        }
    }

    _drawLadders(s) {
        for (let g = 0; g < M.Floors - 1; g++)
            for (let c = 0; c < M.Cols; c++) {
                if (!M.ladderBelow(c, g)) continue;
                const cx = M.colX(c);
                const top = M.floorY(g) - 7, bot = M.floorY(g + 1);
                s.rect(cx - 7, top, 2, bot - top, this.cGirderLt);
                s.rect(cx + 5, top, 2, bot - top, this.cGirderLt);
                const fy = M.floorY(g);
                for (let y = top + 2; y < bot - 1; y += 5) {
                    if (y >= fy - 1 && y <= fy + 4) continue;
                    s.rect(cx - 5, y, 10, 1, this.cGirderLt);
                }
            }
    }

    // ------------------------------------------------------------------ burger parts
    _drawParts(s, r) {
        for (let i = 0; i < r.parts.length; i++) {
            const p = r.parts[i];
            const x0 = M.burgerX0(p.burger);
            const yb = roundEven(p.y);
            for (let k = 0; k < M.PartTiles; k++) {
                const sag = p.resting && (p.stepped & (1 << k)) !== 0 ? 2 : 0;
                s.clip(x0 + k * 16, PlayY, 16, PlayH);
                this._drawPart(s, p.kind, x0, yb + sag);
            }
            s.clip(PlayX, PlayY, PlayW, PlayH);
        }
    }

    // one 48 px part with its bottom edge on yb
    _drawPart(s, kind, x, yb) {
        const h = ShortOrderSim.partHeight(kind), y = yb - h;
        switch (kind) {
            case PartKind.BunTop:
                s.rect(x + 11, y, 26, 1, this.cBun);
                s.rect(x + 6, y + 1, 36, 1, this.cBun);
                s.rect(x + 3, y + 2, 42, 1, this.cBun);
                s.rect(x + 1, y + 3, 46, 1, this.cBun);
                s.rect(x, y + 4, 48, 3, this.cBun);
                s.rect(x, y + 7, 48, 1, this.cBunDk);
                s.rect(x + 1, y + 8, 46, 1, this.cBunDk);
                s.rect(x + 12, y + 1, 7, 1, this.cCream); s.rect(x + 8, y + 2, 3, 1, this.cCream);   // shine
                this._seed(s, x + 24, y + 2); this._seed(s, x + 33, y + 2); this._seed(s, x + 15, y + 4);
                this._seed(s, x + 28, y + 4); this._seed(s, x + 39, y + 4); this._seed(s, x + 7, y + 5); this._seed(s, x + 20, y + 6); this._seed(s, x + 34, y + 6);
                break;
            case PartKind.Lettuce:
                for (let i = 0; i < 48; i++) {
                    const m8 = i % 8, m6 = i % 6;
                    if (m8 >= 1 && m8 <= 5) s.setPixel(x + i, y, this.cLet);
                    if (m6 !== 5) s.setPixel(x + i, y + 5, this.cLetDk);
                    if (m6 === 1 || m6 === 2) s.setPixel(x + i, y + 6, this.cLetDk);
                }
                s.rect(x, y + 1, 48, 4, this.cLet);
                for (let i = 3; i < 48; i += 9) { s.setPixel(x + i, y + 2, this.cLetDk); s.setPixel(x + i + 1, y + 3, this.cLetDk); }
                s.rect(x, y + 4, 48, 1, this.cLetDk);
                break;
            case PartKind.Patty:
                s.rect(x + 2, y, 44, 1, this.cBunDk);
                s.rect(x + 1, y + 1, 46, 1, this.cPatty);
                s.rect(x, y + 2, 48, 4, this.cPatty);
                s.rect(x + 1, y + 6, 46, 1, this.cPatty);
                s.rect(x + 3, y + 7, 42, 1, this.cPatty);
                for (let i = 2; i < 46; i += 6) {
                    s.setPixel(x + i, y + 2 + idiv(i, 6) % 3, this.cBunDk);
                    s.setPixel(x + i + 3, y + 4 + idiv(i, 6) % 2, this.cBunDk);
                }
                break;
            default:
                s.rect(x + 1, y, 46, 1, this.cCream);
                s.rect(x, y + 1, 48, 4, this.cBun);
                s.rect(x, y + 5, 48, 1, this.cBunDk);
                s.rect(x + 1, y + 6, 46, 1, this.cBunDk);
                s.rect(x + 3, y + 7, 42, 1, this.cBunDk);
                for (let i = 5; i < 44; i += 7) s.setPixel(x + i, y + 1, this.cCream);
                break;
        }
    }

    _seed(s, x, y) { s.rect(x, y, 2, 1, this.cCream); }

    // ------------------------------------------------------------------ chasers
    _drawFoes(s, r, t) {
        const pal = this.pal;
        for (let i = 0; i < r.foes.length; i++) {
            const e = r.foes[i];
            const k = e.kind;
            const x = roundEven(e.x) - 8, yf = roundEven(e.y);
            const flip = e.m.facing < 0;
            switch (e.mode) {
                case FoeMode.Waiting: break;
                case FoeMode.Walking:
                    s.blit(A.foe[k][Math.trunc(f32(e.anim / 6)) & 1], x, yf - 16, pal, 1, flip);
                    break;
                case FoeMode.Stunned:
                    s.blit(A.foe[k][0], x, yf - 16, pal, 1, flip);
                    this._stars(s, x + 8, yf - 18, t, e.frozen ? this.cCream : this.cYellow);
                    break;
                case FoeMode.Riding:
                    s.blit(A.foe[k][1], x, yf - 16, pal, 1, flip);
                    break;
                case FoeMode.Squashed:
                    if (e.timer > f32(0.3)) s.blit(A.flat[k], x, yf - 5, pal, 1, flip);
                    else s.blitTinted(A.flat[k], x, yf - 5, this.cDim, 1, flip);
                    break;
            }
        }
    }

    // three stars circling a head once a second (a rotation, not a blink)
    _stars(s, cx, cy, t, c) {
        for (let k = 0; k < 3; k++) {
            const a = t * Math.PI * 2.0 + k * Math.PI * 2.0 / 3.0;
            const x = cx + roundEven(Math.cos(a) * 8), y = cy + roundEven(Math.sin(a) * 3);
            s.rect(x - 1, y, 3, 1, c); s.rect(x, y - 1, 1, 3, c);
        }
    }

    // ------------------------------------------------------------------ the chef
    _drawChef(s, r, t) {
        const m = r.chef, pal = this.pal;
        const x = roundEven(m.x) - 8, yf = roundEven(m.y);
        const flip = m.facing < 0;
        const P = r.p;
        if (P === Phase.Caught || (P === Phase.Card && !r.roundWon) || (P === Phase.Over && !r.roundWon)) {
            s.blit(A.chefCaught, x, yf - 16, pal, 1, flip);
            this._stars(s, x + (flip ? 13 : 3), yf - 9, t, this.cYellow);
            return;
        }
        if (P === Phase.Clear || P === Phase.Card || P === Phase.Over) {
            s.blit(A.chefCheer, x, yf - 16, pal);
            return;
        }
        const fr = Math.trunc(f32(r.chefAnim / 6)) & 1;
        if (m.onLadder || (m.dir < 0 && M.vertical(m.lastDir) && !r.chefMoving))
            s.blit(A.chefClimb, x, yf - 16, pal, 1, fr === 1);
        else
            s.blit(r.chefMoving && fr === 1 ? A.chefWalkB : A.chefWalkA, x, yf - 16, pal, 1, flip);
    }

    _drawPepper(s, r) {
        const age = f32(r.time - r.pepperT);
        if (age < 0 || age > f32(0.45)) return;
        const rad = f32(6 + f32(f32(r.stunRadius - 6) * f32(age / f32(0.45))));
        const cx = Math.trunc(r.pepperX), cy = Math.trunc(r.pepperY);
        for (let k = 0; k < 18; k++) {
            const a = k * Math.PI * 2.0 / 18.0 + age * 2.0;
            s.rect(cx + Math.trunc(Math.cos(a) * rad) - 1, cy + Math.trunc(Math.sin(a) * rad * 0.8) - 1, 2, 2, k % 2 === 0 ? this.cCream : this.cWhite);
        }
        for (let k = 0; k < 10; k++) {
            const a = k * Math.PI * 2.0 / 10.0 - age * 3.0;
            s.rect(cx + Math.trunc(Math.cos(a) * rad * 0.55), cy + Math.trunc(Math.sin(a) * rad * 0.45), 2, 2, this.cDim);
        }
    }

    _drawPopups(s, r) {
        const arc = PixelFont.Arcade;
        for (let i = r.log.length - 1; i >= 0; i--) {
            const e = r.log[i];
            const age = f32(r.time - e.t);
            if (age > f32(1.2)) break;
            let txt = null, c = this.cYellow;
            if (e.kind === SoEvent.Ride) txt = String(e.n * ShortOrderSim.PointsRide);
            else if (e.kind === SoEvent.Crush) { txt = String(ShortOrderSim.PointsCrush); c = this.cCream; }
            else if (e.kind === SoEvent.Burger) txt = String(ShortOrderSim.PointsBurger);
            if (txt == null) continue;
            const w = arc.measure(txt, 1);
            const x = Math.max(10, Math.min(310 - w, Math.trunc(e.x) - idiv(w, 2)));
            const y = Math.trunc(e.y) - 10 - Math.trunc(f32(age * 10));
            s.rect(x - 1, y - 1, w + 2, 9, this.cBg);
            s.text(txt, x, y, arc, c);
        }
    }

    // ------------------------------------------------------------------ plates
    _drawOverlay(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, boxY = 92;
        switch (r.p) {
            case Phase.Ready:
                s.textBox('READY!', midX, boxY, dsp, 3, this.cCream, this.cRed, this.cBg);
                if (r.firstReady) {
                    s.plate(midX - 70, boxY + 24, 140, 16, this.cBg, this.cBun);
                    s.textCentered('STACK 4 BURGERS', midX, boxY + 29, arc, this.cBun);
                } else {
                    s.plate(midX - 50, boxY + 24, 100, 16, this.cBg, this.cBun);
                    s.textCentered(r.lives === 1 ? 'LAST CHEF' : r.lives + ' CHEFS', midX, boxY + 29, arc, this.cBun);
                }
                if (r.mercyActive) {
                    s.plate(midX - 50, boxY + 42, 100, 16, this.cBg, this.cYellow);
                    s.textCentered('ON THE HOUSE', midX, boxY + 47, arc, this.cYellow);
                }
                if (SurfaceDraw.blink(t, 1))
                    s.textCenteredShadow('YOU', Math.trunc(r.chef.x), Math.trunc(r.chef.y) - 28, arc, this.cWhite, this.cBg);
                break;
            case Phase.Caught:
                s.textBox('CAUGHT!', midX, boxY, dsp, 3, this.cCream, this.cRed, this.cBg);
                s.plate(midX - 56, boxY + 24, 112, 16, this.cBg, this.cRed);
                s.textCentered(r.lives <= 0 ? 'NO CHEFS LEFT' : r.lives === 1 ? 'LAST CHEF' : r.lives + ' CHEFS LEFT', midX, boxY + 29, arc, this.cRed);
                break;
            case Phase.Clear:
                s.textBox('4 BURGERS UP', midX, boxY, dsp, 2, this.cYellow, this.cBun, this.cBg);
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = ShortOrderSpec;
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, boxY - 8, dsp, 3, won ? this.cYellow : this.cRed, won ? this.cBun : this.cRed, this.cBg);
                s.plate(midX - 84, boxY + 20, 168, 44, this.cBg, won ? this.cBun : this.cRed);
                s.textCentered('SCORE ' + d6(r.score), midX, boxY + 26, arc, this.cCream, 2);
                s.textCentered('BURGERS ' + r.burgersDone + ' OF 4', midX, boxY + 46, arc, won ? this.cYellow : this.cBun);
                break;
            }
        }
    }
}
