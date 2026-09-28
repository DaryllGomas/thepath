// THE NODE · world 1 · IRONWORKS on the Cabinet Engine · THE PICTURE.
// Port of IronworksRenderer.cs (the sprite sheet is in sprites.js).
//
// Everything is palette-indexed sprites and flat rects, clipped to the 8 px safe area:
//   - HUD band: 1UP + the score in display digits x2 (left); BONUS in a steel box, display x2
//     (right); the climbers left and the drum speed (the mercy shows here: 100, 90, 81, 73, 31)
//   - the structure: red truss girders drawn in 8 px tiles (the stepped slope), cyan ladders
//     behind them (broken ones keep only their stubs), the crane beam and the rolled gold banner
//   - the foreman (24 px, white hard hat, hi-vis vest) beside his drum stack; he heaves a drum
//     overhead before every throw. The oil drum at the bottom left, burning once lit.
//   - climber 12x16, drums 12x12, fire-balls 10x10. Animation is shape change only: walk and
//     climb frames by distance, the drum's bung turns as it rolls, flames at 2.5 Hz; the
//     hammer's swing at 4 Hz; its last-2-s warning and every blink at <= 2 Hz
//   - cards: GET READY, KNOCKED DOWN / TIME UP, the banner dropping (TOPPED OUT) then ROUND WON,
//     GAME OVER; FREE RIDE on the mercy credit; a YOU tag over the climber while GET READY is up
import { f32, idiv, d6, dn, roundEven, PixelFont, PixelSurface, SurfaceDraw } from '../../sdk/index.js';
import { IronworksPalette, IronworksSpec } from './spec.js';
import { IronworksSim } from './sim.js';
import { IronworksLevel as L, Girder, Ladder } from './level.js';
import { IronworksSprites as S } from './sprites.js';

const Phase = IronworksSim.Phase, Mode = IronworksSim.Mode, DrumMode = IronworksSim.DrumMode, Cause = IronworksSim.Cause;

export class IronworksRenderer {
    constructor() {
        const pal = this.pal = IronworksPalette;
        this.cBg = pal.get('bg'); this.cRed = pal.get('red'); this.cRedDk = pal.get('redDark');
        this.cSteel = pal.get('steel'); this.cSteelDk = pal.get('steelDark');
        this.cGold = pal.get('gold'); this.cGoldDk = pal.get('goldDark'); this.cCyan = pal.get('cyan');
        this.cWhite = pal.get('white'); this.cFire = pal.get('fire');
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.p === Phase.Idle) return;
        t = f32(t);
        this._safeClip(s);

        this._drawLadders(s);
        this._drawGirders(s);
        this._drawOil(s, r, t);
        this._drawForeman(s, r);
        this._drawHammers(s, r);
        this._drawDrums(s, r);
        this._drawFires(s, r, t);
        this._drawClimber(s, r, t);
        this._drawBanner(s, r);
        this._drawFx(s, r);
        this._drawHud(s, r);
        this._drawOverlays(s, r, t);
        s.noClip();
    }

    _safeClip(s) {
        const M = PixelSurface.SafeMargin;
        s.clip(M, M, s.width - 2 * M, s.height - 2 * M);
    }

    // ------------------------------------------------------------------ the structure
    _drawGirders(s) {
        for (const g of L.G)
            for (let x = Math.trunc(g.x0); x < Math.trunc(g.x1); x += Girder.Tile)
                this._girderTile(s, x, Math.trunc(g.surface(x + 4)));
    }

    _girderTile(s, x, y) {
        s.rect(x, y, 8, 1, this.cRed);
        for (let k = 0; k < 4; k++) {
            s.setPixel(x + k, y + 1 + k, this.cRed);
            s.setPixel(x + 7 - k, y + 1 + k, this.cRed);
        }
        s.setPixel(x + 3, y + 2, this.cRedDk); s.setPixel(x + 4, y + 2, this.cRedDk);
        s.rect(x, y + 5, 8, 1, this.cRed);
        s.rect(x, y + 6, 8, 1, this.cRedDk);
    }

    _drawLadders(s) {
        for (const l of L.Ladders) {
            const x = Math.trunc(l.x) - 4, top = Math.trunc(l.yTop), bot = Math.trunc(l.yBottom);
            if (!l.broken) this._ladderPart(s, x, top, bot);
            else {
                this._ladderPart(s, x, top, top + Math.trunc(Ladder.StubLength) + 5);
                this._ladderPart(s, x, bot - Math.trunc(Ladder.StubLength), bot);
            }
        }
    }

    _ladderPart(s, x, y0, y1) {
        if (y1 <= y0) return;
        s.rect(x, y0, 1, y1 - y0, this.cCyan);
        s.rect(x + 7, y0, 1, y1 - y0, this.cCyan);
        for (let y = y1 - 3; y >= y0; y -= 4) s.rect(x + 1, y, 6, 1, this.cCyan);
    }

    // the crane beam over the top platform, and the banner: rolled until the round is won
    _drawBanner(s, r) {
        const bx = Math.trunc(L.BannerX), bw = Math.trunc(L.BannerW);
        s.rect(bx - 6, 27, bw + 28, 3, this.cSteel);
        for (let x = bx - 4; x < bx + bw + 20; x += 6) s.setPixel(x, 28, this.cSteelDk);
        s.rect(bx + 4, 30, 1, 2, this.cSteel); s.rect(bx + bw - 5, 30, 1, 2, this.cSteel);
        let drop = 0;
        if (r.p === Phase.Card && r.roundWon) drop = Math.min(1, f32(r.phaseTime / f32(1.0)));
        else if (r.p === Phase.Over && r.roundWon) drop = 1;
        const h = Math.trunc(f32(drop * 30));
        if (h > 0) {
            s.rect(bx, 32, bw, h, this.cGold);
            s.rect(bx, 32, 1, h, this.cGoldDk); s.rect(bx + bw - 1, 32, 1, h, this.cGoldDk);
            s.clip(bx + 1, 32, bw - 2, h);
            s.textCentered('TOPPED', bx + idiv(bw, 2), 36, PixelFont.Display, this.cRed);
            s.textCentered('OUT!', bx + idiv(bw, 2), 48, PixelFont.Display, this.cRed);
            this._safeClip(s);
        }
        // the roll
        const ry = 32 + h;
        s.rect(bx - 1, ry, bw + 2, 4, this.cGold);
        s.rect(bx - 1, ry + 3, bw + 2, 1, this.cGoldDk);
        for (let x = bx + 3; x < bx + bw; x += 8) s.rect(x, ry, 1, 3, this.cGoldDk);
    }

    _drawOil(s, r, t) {
        const x = Math.trunc(L.OilX), y = Math.trunc(L.oilTop);
        s.blit(S.OilDrum, x, y, this.pal);
        if (r.oilLit) {
            const f = (Math.trunc(f32(t * 5)) & 1) === 0 ? S.FlameA : S.FlameB;
            s.blit(f, x, y - 8, this.pal);
        }
    }

    _drawForeman(s, r) {
        const g5 = L.G[5];
        const fx = Math.trunc(L.ForemanX), feet = Math.trunc(g5.surface(f32(fx + 12)));
        const sy = Math.trunc(g5.surface(f32(L.StackX + 4)));
        s.blit(S.DrumUpright, Math.trunc(L.StackX), sy - 12, this.pal);
        s.blit(S.DrumUpright, Math.trunc(L.StackX), sy - 24, this.pal);
        const lift = r.p === Phase.Climb && r.foremanLift > 0;
        s.blit(lift ? S.ForemanLift : S.ForemanIdle, fx, feet - 24, this.pal);
        if (lift) s.blit(S.DrumUpright, fx + 6, feet - 24 - 11, this.pal);
    }

    _drawHammers(s, r) {
        for (let i = 0; i < L.Hammers.length; i++) {
            if (r.hammerTaken[i]) continue;
            const h = L.Hammers[i];
            const y = Math.trunc(L.G[h.girder].surface(h.x)) - Math.trunc(IronworksSim.HammerFloat) - 9;
            s.blit(S.HammerUp, Math.trunc(h.x) - 4, y, this.pal);
        }
    }

    _drawDrums(s, r) {
        for (const d of r.drums) {
            if (d.dead) continue;
            const x = roundEven(d.x) - 6, y = roundEven(d.y) - 12;
            if (d.m === DrumMode.Ladder) { s.blit(S.DrumLying, x, y, this.pal); continue; }
            let f = Math.trunc(f32(d.roll / f32(4.7))) & 7;
            if (d.dir < 0) f = (8 - f) & 7;
            s.blit(S.DrumRoll[f], x, y, this.pal);
        }
    }

    _drawFires(s, r, t) {
        for (const f of r.fires) {
            if (f.dead) continue;
            const spr = ((Math.trunc(f32(t * 5)) + f.id) & 1) === 0 ? S.FireA : S.FireB;
            s.blit(spr, roundEven(f.x) - 5, roundEven(f.y) - 10, this.pal, 1, f.dir < 0);
        }
    }

    _drawClimber(s, r, t) {
        const c = r.c, pal = this.pal;
        const x = roundEven(c.x), feet = roundEven(c.feet);
        let flip = c.facing < 0;
        if (c.m === Mode.Dead) {
            if (c.deadT < f32(1.2)) {
                const q = Math.trunc(f32(c.deadT * 8)) & 3;
                const spr = S.ClimberTurn[q];
                s.blit(spr, x - idiv(spr.width, 2), feet - spr.height, pal, 1, flip);
            }
            else s.blit(S.ClimberTurn[1], x - 8, feet - 12, pal, 1, flip);
            return;
        }
        if (c.m === Mode.Ladder) {
            const spr = (Math.trunc(f32(c.climbDist / 6)) & 1) === 0 ? S.ClimbA : S.ClimbB;
            s.blit(spr, x - 6, feet - 16, pal);
            return;
        }
        let body;
        if (c.m === Mode.Jump) body = S.Walk1;
        else if (c.m === Mode.Top) { body = S.Stand; flip = true; }
        else {
            const k = Math.trunc(f32(c.walkDist / 7)) % 4;
            body = k === 1 ? S.Walk1 : k === 3 ? S.Walk2 : S.Stand;
        }
        s.blit(body, x - 6, feet - 16, pal, 1, flip);

        if (c.hammerLeft > 0 && c.m !== Mode.Top) {
            const upSwing = (Math.trunc(f32(t * 8)) & 1) === 0;                     // 4 Hz swing
            const warn = c.hammerLeft < 2 && (Math.trunc(f32(t * 4)) & 1) === 0;    // 2 Hz, last 2 s
            if (upSwing) {
                const hx = flip ? x - 5 : x - 3;
                if (warn) s.blitTinted(S.HammerUp, hx, feet - 16 - 7, this.cGold);
                else s.blit(S.HammerUp, hx, feet - 16 - 7, pal);
            } else {
                const hx = flip ? x - 14 : x + 2;
                if (warn) s.blitTinted(S.HammerFwd, hx, feet - 12, this.cGold, 1, flip);
                else s.blit(S.HammerFwd, hx, feet - 12, pal, 1, flip);
            }
        }
    }

    _drawFx(s, r) {
        for (const p of r.puffs) {
            const rad = 2 + Math.trunc(f32(p.t * 26));
            for (let k = 0; k < 10; k++) {
                const a = k * 0.628 + 0.3;
                const bx = Math.trunc(p.x + Math.cos(a) * rad), by = Math.trunc(p.y + Math.sin(a) * rad * 0.8);
                s.rect(bx - 1, by - 1, 2, 2, (k & 1) === 0 ? (p.fire ? this.cFire : this.cSteel) : (p.fire ? this.cGold : this.cWhite));
            }
        }
        const arc = PixelFont.Arcade;
        for (const p of r.popups) {
            const txt = String(p.points);
            const y = Math.trunc(f32(p.y - f32(p.t * 12)));
            const x = Math.max(12, Math.min(308 - arc.measure(txt), Math.trunc(p.x) - idiv(arc.measure(txt), 2)));
            s.textShadow(txt, x, y, arc, p.points >= 300 ? this.cGold : this.cWhite, this.cBg);
        }
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 10, 9, arc, this.cRed);
        s.text(d6(r.score), 10, 19, dsp, this.cWhite, 2);

        s.textRight('BONUS', 310, 8, arc, this.cGold);
        s.frame(240, 16, 71, 20, this.cSteel);
        s.frame(241, 17, 69, 18, this.cSteelDk);
        const bc = r.bonus <= 1000 ? this.cRed : this.cWhite;
        s.textRight(dn(r.bonus, 4), 306, 19, dsp, bc, 2);

        // climbers left (this one included)
        for (let i = 0; i < r.livesLeft; i++) s.blit(S.LifeIcon, 303 - i * 10, 40, this.pal);
        if (r.mercyActive) s.textRight('FREE RIDE', 310, 52, arc, this.cGold);
        else {
            const pct = roundEven(f32(f32(100 * r.drumSpeed) / Math.max(1, r.baseDrumSpeed)));
            s.textRight('SPD ' + pct, 310, 52, arc, this.cSteel);
        }
    }

    // ------------------------------------------------------------------ cards
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        switch (r.p) {
            case Phase.Ready: {
                s.textBox('GET READY', 160, 112, dsp, 2, this.cWhite, this.cRed, this.cBg);
                let y = 136;
                if (r.firstLife) {
                    s.plate(92, y - 4, 136, 15, this.cBg, this.cGoldDk);
                    s.textCentered('REACH THE BANNER', 160, y, arc, this.cGold);
                    y += 18;
                }
                if (r.mercyActive) {
                    s.plate(118, y - 4, 84, 15, this.cBg, this.cGoldDk);
                    s.textCentered('FREE RIDE', 160, y, arc, this.cGold);
                }
                if (SurfaceDraw.blink(t)) s.textCenteredShadow('YOU', Math.trunc(r.c.x), Math.trunc(r.c.feet) - 28, arc, this.cCyan, this.cBg);
                break;
            }
            case Phase.Down:
                if (r.c.deadT >= f32(0.8)) {
                    const head = r.lastCause === Cause.Timer ? 'TIME UP' : 'KNOCKED DOWN';
                    s.textBox(head, 160, 112, dsp, 2, this.cWhite, this.cRed, this.cBg);
                    if (r.livesLeft > 0) {
                        const left = r.livesLeft === 1 ? 'LAST CLIMBER' : r.livesLeft + ' CLIMBERS LEFT';
                        const w = arc.measure(left) + 16;
                        s.plate(160 - idiv(w, 2), 132, w, 15, this.cBg, this.cRedDk);
                        s.textCentered(left, 160, 136, arc, this.cWhite);
                    }
                }
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = IronworksSpec;
                if (r.roundWon) {
                    if (r.p === Phase.Card && r.phaseTime < f32(1.2)) break;   // the banner drops first
                    s.textBox(spec.roundWonText, 160, 98, dsp, 3, this.cGold, this.cRed, this.cBg);
                    s.plate(76, 132, 168, 44, this.cBg, this.cRed);
                    s.textCentered('BONUS ' + dn(r.bonusAwarded, 4), 160, 138, arc, this.cGold, 2);
                    s.textCentered('SCORE ' + d6(r.score), 160, 158, arc, this.cWhite, 2);
                } else {
                    s.textBox(spec.roundLostText, 160, 98, dsp, 3, this.cWhite, this.cRed, this.cBg);
                    s.plate(76, 132, 168, 44, this.cBg, this.cRed);
                    s.textCentered('SCORE ' + d6(r.score), 160, 138, arc, this.cWhite, 2);
                    s.textCentered('HIGHEST GIRDER ' + r.bestGirder, 160, 160, arc, this.cGold);
                }
                break;
            }
        }
    }
}
