// THE NODE · world 1 · IRONWORKS on the Cabinet Engine · THE PICTURE.
// Port of IronworksRenderer.cs (the sprite sheet is in sprites.js), built out for the five boards.
//
// Everything is palette-indexed sprites and flat rects, clipped to the 8 px safe area:
//   - HUD band: 1UP + the score in display digits x2 (left) and the BOARD under it; BONUS in a steel box,
//     display x2 (right), turning red under 1000; the climbers left; FREE RIDE on the mercy credit
//   - the structure: red truss girders drawn in 8 px tiles (the stepped slope), cyan ladders behind them
//     (broken ones keep only their stubs); BELTS are the same truss with a running steel tread, rollers
//     and gold arrows that blink red before the belt reverses; the CAGES ride their shafts on a cable,
//     a green lamp lit while they wait at a stop; BOLTS are gold plates across the joins (pulled: a
//     gap); board 3's hole has the spring column marked under it
//   - the foreman (24 px, white hard hat, hi-vis vest) by his drum stack, on his stand (board 4) or on
//     the gantry (board 5); he heaves before every throw. The oil drum (or the furnace) at the bottom.
//   - climber 12x16, drums 12x12, carts 12x9, springs 10x10, fire-balls 10x10. Animation is shape change
//     only: walk and climb frames by distance, the drum's bung turns as it rolls, flames at 2.5 Hz; the
//     hammer's swing at 4 Hz; its last-2-s warning and every blink at <= 2 Hz
//   - juice: smash puffs, score pop-ups, a screen shake when the bolts come out and the foreman lands
//   - cards: the BOARD card (number, name, hint), GET READY, KNOCKED DOWN / TIME UP, the topping-out and
//     its tally (the bonus counted into the score), TOPPED OUT, GAME OVER; FREE RIDE on the mercy credit
import { f32, idiv, d6, dn, roundEven, PixelFont, PixelSurface, SurfaceDraw } from '../../sdk/index.js';
import { IronworksPalette, IronworksSpec } from './spec.js';
import { IronworksSim } from './sim.js';
import { Girder, Ladder } from './level.js';
import { BOARDS } from './boards.js';
import { IronworksSprites as S } from './sprites.js';

const Phase = IronworksSim.Phase, Mode = IronworksSim.Mode, DrumMode = IronworksSim.DrumMode, Cause = IronworksSim.Cause;
const Kind = IronworksSim.Kind, SpringMode = IronworksSim.SpringMode;

export class IronworksRenderer {
    constructor() {
        const pal = this.pal = IronworksPalette;
        this.cBg = pal.get('bg'); this.cRed = pal.get('red'); this.cRedDk = pal.get('redDark');
        this.cSteel = pal.get('steel'); this.cSteelDk = pal.get('steelDark'); this.cDrum = pal.get('drum');
        this.cGold = pal.get('gold'); this.cGoldDk = pal.get('goldDark'); this.cCyan = pal.get('cyan');
        this.cWhite = pal.get('white'); this.cFire = pal.get('fire'); this.cEmber = pal.get('ember'); this.cGreen = pal.get('green');
        this.cBlue = pal.get('blue');
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.p === Phase.Idle || r.board == null) return;
        t = f32(t);
        this._safeClip(s);
        const B = r.board;

        this._drawShafts(s, B);
        this._drawLadders(s, B);
        this._drawGirders(s, r, B, t);
        this._drawBolts(s, B);
        this._drawCages(s, r, B);
        this._drawOil(s, r, B, t);
        this._drawStand(s, r, B, t);
        this._drawForeman(s, r, B, t);
        this._drawPickups(s, r, B, t);
        this._drawHammers(s, r, B);
        this._drawDrums(s, r);
        this._drawSprings(s, r);
        this._drawFires(s, r, t);
        this._drawClimber(s, r, t);
        this._drawBanner(s, r, B);
        this._drawFallen(s, r, B, t);
        this._drawFx(s, r);
        if (r.shake > 0) this._shake(s, r, t);
        this._drawHud(s, r, t);
        this._drawOverlays(s, r, B, t);
        s.noClip();
    }

    _safeClip(s) {
        const M = PixelSurface.SafeMargin;
        s.clip(M, M, s.width - 2 * M, s.height - 2 * M);
    }

    // the playfield (inside the safe area) moved a pixel or two: the bolts are out, the foreman lands
    _shake(s, r, t) {
        const amp = r.shake > f32(0.35) ? 2 : 1;
        const k = Math.trunc(f32(t * 30));
        const dx = (k & 1) === 0 ? amp : -amp, dy = (k & 2) === 0 ? 1 : -1;
        const M = PixelSurface.SafeMargin, W = s.width, H = s.height;
        const u = new Uint32Array(s.data.buffer, s.data.byteOffset, W * H), bg = this.cBg.packed;
        const w = W - 2 * M;
        if (dy > 0) for (let y = H - M - 1; y >= M; y--) this._shiftRow(u, y, y - dy, M, w, dx, W, H, bg);
        else for (let y = M; y < H - M; y++) this._shiftRow(u, y, y - dy, M, w, dx, W, H, bg);
    }

    _shiftRow(u, y, src, M, w, dx, W, H, bg) {
        const row = y * W + M;
        if (src < M || src >= H - M) { u.fill(bg, row, row + w); return; }
        const from = src * W + M;
        if (dx > 0) { u.copyWithin(row + dx, from, from + w - dx); u.fill(bg, row, row + dx); }
        else { u.copyWithin(row, from - dx, from + w); u.fill(bg, row + w + dx, row + w); }
    }

    // ------------------------------------------------------------------ the structure
    _drawGirders(s, r, B, t) {
        for (const g of B.G) {
            if (g.isCage) continue;
            if (g.belt >= 0) { this._drawBelt(s, r, B, g, t); continue; }
            for (let x = Math.trunc(g.x0); x < Math.trunc(g.x1); x += Girder.Tile)
                this._girderTile(s, x, Math.trunc(g.surface(x + 4)), Math.trunc(g.x1) - x);
        }
        if (B.springs) {
            // the spring column: marked down from the hole to the floor
            const cx = Math.trunc(B.springs.colX), y0 = Math.trunc(B.G[B.springs.g].surface(B.springs.colX)) + 8;
            for (let y = y0; y < 222; y += 4) s.setPixel(cx, y, this.cRedDk);
            s.rect(cx - 6, y0 - 8, 1, 7, this.cGold); s.rect(cx + 5, y0 - 8, 1, 7, this.cGold);
        }
    }

    _girderTile(s, x, y, w = 8) {
        w = Math.min(8, w);
        s.rect(x, y, w, 1, this.cRed);
        for (let k = 0; k < 4; k++) {
            if (k < w) s.setPixel(x + k, y + 1 + k, this.cRed);
            if (7 - k < w) s.setPixel(x + 7 - k, y + 1 + k, this.cRed);
        }
        if (w > 4) { s.setPixel(x + 3, y + 2, this.cRedDk); s.setPixel(x + 4, y + 2, this.cRedDk); }
        s.rect(x, y + 5, w, 1, this.cRed);
        s.rect(x, y + 6, w, 1, this.cRedDk);
    }

    // a belt: the truss with a running steel tread on top, rollers at the ends, arrows that say which way
    _drawBelt(s, r, B, g, t) {
        const b = B.belts[g.belt];
        const x0 = Math.trunc(g.x0), x1 = Math.trunc(g.x1), y = Math.trunc(g.surface(g.x0));
        const ph = ((Math.trunc(b.pos) % 6) + 6) % 6;
        for (let x = x0; x < x1; x += 8) this._girderTile(s, x, y + 1, x1 - x);
        for (let x = x0; x < x1; x++) s.setPixel(x, y, ((x - ph + 600) % 6) < 2 ? this.cSteelDk : this.cSteel);
        s.rect(x0, y + 1, x1 - x0, 1, this.cSteelDk);
        for (const cx of [x0 + 3, x1 - 4]) {
            s.circle(cx, y + 3, 2, this.cSteelDk, true);
            s.setPixel(cx, y + 3, this.cSteel);
        }
        // the arrows: gold, blinking red (2 Hz) while the belt is about to reverse
        const warn = b.warn && (Math.trunc(f32(t * 4)) & 1) === 0;
        const c = warn ? this.cRed : b.flip > 0 ? this.cGold : this.cGoldDk;
        const n = Math.max(1, Math.trunc((x1 - x0) / 96));
        for (let i = 0; i < n; i++) {
            const ax = x0 + Math.trunc(((i + 0.5) * (x1 - x0)) / n);
            this._chevron(s, ax - 4, y + 2, b.dir, c);
            this._chevron(s, ax + 1, y + 2, b.dir, c);
        }
    }

    _chevron(s, x, y, dir, c) {
        for (let k = 0; k < 3; k++) {
            const dx = dir > 0 ? k : 2 - k;
            s.setPixel(x + dx, y + k, c); s.setPixel(x + dx, y + 4 - k, c);
        }
    }

    _drawLadders(s, B) {
        for (const l of B.ladders) {
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

    // the bolts: gold plates across the joins; a pulled one is just the gap
    _drawBolts(s, B) {
        for (const b of B.bolts) {
            if (b.pulled) continue;
            const g = B.G[b.gl], x = Math.trunc(b.x) - 4, y = Math.trunc(g.surface(b.x));
            s.rect(x, y, 8, 7, this.cGold);
            s.frame(x, y, 8, 7, this.cGoldDk);
            s.rect(x + 3, y + 2, 2, 3, this.cSteel);
            s.setPixel(x + 3, y + 2, this.cWhite);
        }
    }

    // board 3: the shafts (rails, the head beam) behind everything
    _drawShafts(s, B) {
        for (const L of B.lifts) {
            const g = B.G[L.g];
            const x0 = Math.trunc(g.x0), x1 = Math.trunc(g.x1) - 1, top = Math.trunc(L.high) - 28, bot = Math.trunc(L.low) + 6;
            s.rect(x0, top, 1, bot - top, this.cSteelDk);
            s.rect(x1, top, 1, bot - top, this.cSteelDk);
            s.rect(x0 - 2, top - 3, x1 - x0 + 5, 3, this.cSteel);
            s.rect(x0 - 2, top - 1, x1 - x0 + 5, 1, this.cSteelDk);
        }
    }

    _drawCages(s, r, B) {
        for (const L of B.lifts) {
            const g = B.G[L.g];
            const x0 = Math.trunc(g.x0), w = Math.trunc(g.x1) - x0, y = roundEven(L.y), top = Math.trunc(L.high) - 28;
            const cx = x0 + idiv(w, 2);
            s.rect(cx, top, 1, y - 16 - top, this.cSteel);                 // the cable
            s.rect(x0 + 1, y - 16, w - 2, 1, this.cSteelDk);                // the cage's roof bar
            s.rect(x0 + 1, y - 16, 1, 16, this.cSteelDk); s.rect(x0 + w - 2, y - 16, 1, 16, this.cSteelDk);
            s.rect(x0, y, w, 2, this.cSteel);                               // the floor
            s.rect(x0, y + 2, w, 1, this.cSteelDk);
            for (let x = x0 + 2; x < x0 + w - 2; x += 4) s.setPixel(x, y + 1, this.cSteelDk);
            s.rect(cx - 1, top + 1, 2, 2, L.moving === 0 ? this.cGreen : this.cRed);   // the lamp at the head
        }
    }

    // the crane beam over the top platform, and the banner: rolled until the board is topped out
    _drawBanner(s, r, B) {
        if (B.banner == null) return;
        const bx = Math.trunc(B.banner.x), bw = Math.trunc(B.banner.w);
        s.rect(bx - 6, 27, bw + 28, 3, this.cSteel);
        for (let x = bx - 4; x < bx + bw + 20; x += 6) s.setPixel(x, 28, this.cSteelDk);
        s.rect(bx + 4, 30, 1, 2, this.cSteel); s.rect(bx + bw - 5, 30, 1, 2, this.cSteel);
        let drop = 0;
        if (r.p === Phase.Clear) drop = Math.min(1, f32(r.phaseTime / f32(1.0)));
        const h = Math.trunc(f32(drop * 30));
        if (h > 0) {
            s.rect(bx, 32, bw, h, this.cGold);
            s.rect(bx, 32, 1, h, this.cGoldDk); s.rect(bx + bw - 1, 32, 1, h, this.cGoldDk);
            s.clip(bx + 1, 32, bw - 2, h);
            s.textCentered('TOPPED', bx + idiv(bw, 2), 36, PixelFont.Display, this.cRed);
            s.textCentered('OUT!', bx + idiv(bw, 2), 48, PixelFont.Display, this.cRed);
            this._safeClip(s);
        }
        const ry = 32 + h;
        s.rect(bx - 1, ry, bw + 2, 4, this.cGold);
        s.rect(bx - 1, ry + 3, bw + 2, 1, this.cGoldDk);
        for (let x = bx + 3; x < bx + bw; x += 8) s.rect(x, ry, 1, 3, this.cGoldDk);
    }

    _drawOil(s, r, B, t) {
        const o = B.oil;
        if (o == null) return;
        const x = Math.trunc(o.x), y = Math.trunc(B.oilTop);
        const flick = (Math.trunc(f32(t * 5)) & 1) === 0;
        if (o.furnace) {
            s.blit(S.Furnace[flick ? 0 : 1], x, y, this.pal);
            if (r.oilFlare < f32(0.5)) s.blit(flick ? S.FlameA : S.FlameB, x + 4, y - 8, this.pal);
            return;
        }
        s.blit(S.OilDrum, x, y, this.pal);
        if (r.oilLit) {
            s.blit(flick ? S.FlameA : S.FlameB, x, y - 8, this.pal);
            if (r.oilFlare < f32(0.35)) s.blit(flick ? S.FlameB : S.FlameA, x, y - 15, this.pal);
        }
    }

    // board 4's stand and board 5's gantry: an I-beam deck on legs (a gantry leg goes when its bolt does)
    _drawStand(s, r, B, t) {
        const F = B.foreman;
        if (F.kind !== 'stand' && F.kind !== 'gantry') return;
        const falling = r.p === Phase.Clear || r.p === Phase.Card || r.p === Phase.Over;
        const drop = falling ? Math.trunc(f32(r.foremanY - F.deck)) : 0;
        const x0 = Math.trunc(F.x0), x1 = Math.trunc(F.x1), deck = Math.trunc(F.deck) + drop;
        if (falling && F.kind === 'stand') {
            // the stand comes apart: its two halves drop away
            if (deck < 220) { this._deck(s, x0, deck + 6, idiv(x1 - x0, 2) - 2); this._deck(s, x0 + idiv(x1 - x0, 2) + 2, deck + 12, idiv(x1 - x0, 2) - 2); }
            return;
        }
        if (falling) { if (deck < 220) this._deck(s, x0, deck, x1 - x0); return; }
        const legs = F.kind === 'stand' ? [x0 + 8, x1 - 9] : B.bolts.filter(b => !b.pulled).map(b => Math.trunc(b.x));
        const foot = Math.trunc(F.kind === 'stand' ? 78 : 76);
        let sway = 0;
        if (F.kind === 'gantry' && r.rage < f32(0.6)) sway = (Math.trunc(f32(t * 16)) & 1) === 0 ? 1 : -1;
        for (const lx of legs) {
            s.rect(lx - 1 + sway, deck + 4, 3, foot - deck - 4, this.cSteelDk);
            s.rect(lx + sway, deck + 4, 1, foot - deck - 4, this.cSteel);
        }
        this._deck(s, x0 + sway, deck, x1 - x0);
    }

    _deck(s, x, y, w) {
        s.rect(x, y, w, 1, this.cSteel);
        s.rect(x + 2, y + 1, w - 4, 2, this.cSteelDk);
        s.rect(x, y + 3, w, 1, this.cSteel);
        for (let k = x + 4; k < x + w - 2; k += 8) s.setPixel(k, y + 2, this.cGold);
    }

    _drawForeman(s, r, B, t) {
        const F = B.foreman;
        const clear = r.p === Phase.Clear || r.p === Phase.Card || r.p === Phase.Over;
        if (F.kind === 'stand' || F.kind === 'gantry') {
            if (clear) return;   // he is falling (_drawFallen)
            const fx = Math.trunc(F.x), feet = Math.trunc(F.deck);
            let spr = S.ForemanIdle;
            if (r.p === Phase.Climb && r.foremanLift > 0) spr = S.ForemanLift;
            if (F.kind === 'gantry' && r.rage < f32(0.8)) spr = (Math.trunc(f32(t * 6)) & 1) === 0 ? S.ForemanLift : S.ForemanIdle;
            const sway = F.kind === 'gantry' && r.rage < f32(0.6) ? ((Math.trunc(f32(t * 16)) & 1) === 0 ? 1 : -1) : 0;
            if (F.kind === 'gantry' && r.rage < f32(0.8)) s.blitTinted(spr, fx + sway + 1, feet - 24, this.cRed);
            s.blit(spr, fx + sway, feet - 24, this.pal, 1, F.kind === 'gantry' && r.throwSide > 0);
            if (F.kind === 'gantry' && r.p === Phase.Climb && r.foremanLift > 0)
                s.blit(r.foremanDropping ? S.DrumUpright : S.DrumUpright, fx + 6 + sway, feet - 24 - 11, this.pal);
            return;
        }
        const g = B.G[F.g];
        const fx = Math.trunc(F.x), feet = Math.trunc(g.surface(f32(fx + 12)));
        const sy = Math.trunc(g.surface(f32(F.stack + 4)));
        // his stock: drums (1), ore (2), springs (3)
        if (F.kind === 'springs') { s.blit(S.SpringUp, Math.trunc(F.stack) + 1, sy - 10, this.pal); s.blit(S.SpringUp, Math.trunc(F.stack) + 1, sy - 20, this.pal); }
        else if (F.kind === 'carts') { s.blit(S.CartA, Math.trunc(F.stack), sy - 9, this.pal); s.blit(S.CartB, Math.trunc(F.stack), sy - 18, this.pal); }
        else { s.blit(S.DrumUpright, Math.trunc(F.stack), sy - 12, this.pal); s.blit(S.DrumUpright, Math.trunc(F.stack), sy - 24, this.pal); }
        if (clear) {
            // topped out: he grabs the banner's rope and goes up and away to the next board
            const up = Math.max(0, Math.trunc(f32(f32(r.phaseTime - f32(0.4)) * 46)));
            const spr = S.ForemanLift;
            s.blit(spr, fx, feet - 24 - up, this.pal, 1, (Math.trunc(f32(t * 6)) & 1) === 0);
            if (up > 0) s.rect(fx + 11, 8, 1, Math.max(0, feet - 24 - up - 8), this.cSteel);
            return;
        }
        const lift = r.p === Phase.Climb && r.foremanLift > 0;
        s.blit(lift ? S.ForemanLift : S.ForemanIdle, fx, feet - 24, this.pal);
        if (lift) {
            const held = F.kind === 'springs' ? S.SpringUp : F.kind === 'carts' ? S.CartA : S.DrumUpright;
            s.blit(held, fx + 6, feet - 24 - held.height + 1, this.pal);
        }
    }

    // boards 4 and 5: the foreman coming down the whole height of the works, then flat out with stars
    _drawFallen(s, r, B, t) {
        const F = B.foreman;
        if ((F.kind !== 'stand' && F.kind !== 'gantry') || !(r.p === Phase.Clear || r.p === Phase.Card || r.p === Phase.Over)) return;
        const fx = Math.trunc(F.x), y = Math.trunc(r.foremanY);
        if (!r.foremanDown) {
            const spin = Math.trunc(f32(r.phaseTime * 8)) & 1;
            s.blit(spin === 0 ? S.ForemanLift : S.ForemanDazed, fx, y - 24, this.pal);
            return;
        }
        s.blit(S.ForemanDazed, fx, y - 24, this.pal);
        for (let i = 0; i < 3; i++) {
            const a = f32(f32(t * 3) + i * 2.094);
            s.blit(S.Star, fx + 10 + Math.trunc(Math.cos(a) * 12), y - 30 + Math.trunc(Math.sin(a) * 3), this.pal);
        }
    }

    _drawHammers(s, r, B) {
        for (let i = 0; i < B.hammers.length; i++) {
            if (r.hammerTaken[i]) continue;
            const h = B.hammers[i];
            const y = Math.trunc(B.G[h.girder].surface(h.x)) - Math.trunc(IronworksSim.HammerFloat) - 9;
            s.blit(S.HammerUp, Math.trunc(h.x) - 4, y, this.pal);
        }
    }

    _drawPickups(s, r, B, t) {
        for (let i = 0; i < B.pickups.length; i++) {
            if (r.pickupTaken[i]) continue;
            const p = B.pickups[i], spr = S.Pickups[p.kind];
            const y = Math.trunc(B.G[p.girder].surface(p.x));
            s.blit(spr, Math.trunc(p.x) - idiv(spr.width, 2), y - spr.height, this.pal);
            if (SurfaceDraw.blink(f32(t + i * 0.3), 1)) s.setPixel(Math.trunc(p.x) - idiv(spr.width, 2) + 1, y - spr.height + 1, this.cWhite);
        }
    }

    _drawDrums(s, r) {
        for (const d of r.drums) {
            if (d.dead) continue;
            if (d.kind === Kind.Cart) {
                const spr = (Math.trunc(f32(d.roll / 4)) & 1) === 0 ? S.CartA : S.CartB;
                s.blit(spr, roundEven(d.x) - 6, roundEven(d.y) - 9, this.pal);
                continue;
            }
            const x = roundEven(d.x) - 6, y = roundEven(d.y) - 12;
            if (d.m === DrumMode.Ladder) { s.blit(S.DrumLying, x, y, this.pal); continue; }
            let f = Math.trunc(f32(d.roll / f32(4.7))) & 7;
            if (d.dir < 0) f = (8 - f) & 7;
            s.blit((d.kind === Kind.Hot ? S.HotRoll : S.DrumRoll)[f], x, y, this.pal);
        }
    }

    _drawSprings(s, r) {
        for (const p of r.springs) {
            if (p.dead) continue;
            const spr = p.squash > 0 ? S.SpringSquash : S.SpringUp;
            s.blit(spr, roundEven(p.x) - 5, roundEven(p.y) - spr.height, this.pal);
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
        if (c.m === Mode.Top) {
            const up = (Math.trunc(f32(t * 4)) & 1) === 0;
            s.blit(up ? S.Cheer : S.Stand, x - 6, feet - 16 - (up ? 1 : 0), pal, 1, flip);
            return;
        }
        let body;
        if (c.m === Mode.Jump) body = S.Walk1;
        else {
            const k = Math.trunc(f32(c.walkDist / 7)) % 4;
            body = k === 1 ? S.Walk1 : k === 3 ? S.Walk2 : S.Stand;
        }
        s.blit(body, x - 6, feet - 16, pal, 1, flip);

        if (c.hammerLeft > 0) {
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
            const rad = 2 + Math.trunc(f32(p.t * (p.big ? 44 : 26)));
            const n = p.big ? 14 : 10;
            for (let k = 0; k < n; k++) {
                const a = k * (6.283 / n) + 0.3;
                const bx = Math.trunc(p.x + Math.cos(a) * rad), by = Math.trunc(p.y + Math.sin(a) * rad * 0.8);
                s.rect(bx - 1, by - 1, 2, 2, (k & 1) === 0 ? (p.fire ? this.cFire : this.cSteel) : (p.fire ? this.cGold : this.cWhite));
            }
        }
        const arc = PixelFont.Arcade;
        for (const p of r.popups) {
            const txt = p.text || String(p.points);
            const y = Math.trunc(f32(p.y - f32(p.t * 12)));
            const x = Math.max(12, Math.min(308 - arc.measure(txt), Math.trunc(p.x) - idiv(arc.measure(txt), 2)));
            s.textShadow(txt, x, y, arc, p.points >= 300 ? this.cGold : this.cWhite, this.cBg);
        }
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 10, 9, arc, this.cRed);
        s.text(d6(r.score), 10, 19, dsp, this.cWhite, 2);
        s.text('BOARD ' + r.boardNo, 10, 37, arc, this.cGold);

        s.textRight('BONUS', 310, 8, arc, this.cGold);
        s.frame(240, 16, 71, 20, this.cSteel);
        s.frame(241, 17, 69, 18, this.cSteelDk);
        const low = r.bonus <= 1000 && r.p === Phase.Climb;
        const bc = low ? (SurfaceDraw.blink(t, 2) ? this.cRed : this.cRedDk) : this.cWhite;
        s.textRight(dn(r.bonus, 4), 306, 19, dsp, bc, 2);

        // climbers left (this one included)
        for (let i = 0; i < Math.min(5, r.livesLeft); i++) s.blit(S.LifeIcon, 303 - i * 10, 40, this.pal);
        if (r.mercyActive) s.textRight('FREE RIDE', 310, 50, arc, this.cGold);
        if (r.extraFlash < f32(2.0) && SurfaceDraw.blink(r.extraFlash, 2))
            s.textCenteredShadow('EXTRA CLIMBER!', 160, 12, arc, this.cGreen, this.cBg);
    }

    // ------------------------------------------------------------------ cards
    _drawOverlays(s, r, B, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        switch (r.p) {
            case Phase.Stage: {
                s.plate(40, 86, 240, 66, this.cBg, this.cRed);
                s.frame(42, 88, 236, 62, this.cRedDk);
                s.textCentered('BOARD ' + B.n, 160, 94, dsp, this.cGold, 2);
                s.textCentered(B.name, 160, 116, dsp, this.cWhite);
                s.textCentered(B.hint, 160, 134, arc, this.cCyan);
                let y = 160;
                if (r.mercyActive && r.boardNo === r.startBoard) {
                    s.plate(118, y - 4, 84, 15, this.cBg, this.cGoldDk);
                    s.textCentered('FREE RIDE', 160, y, arc, this.cGold);
                }
                if (SurfaceDraw.blink(t)) s.textCenteredShadow('YOU', Math.trunc(r.c.x), Math.trunc(r.c.feet) - 28, arc, this.cCyan, this.cBg);
                break;
            }
            case Phase.Ready:
                s.textBox('GET READY', 160, 112, dsp, 2, this.cWhite, this.cRed, this.cBg);
                if (SurfaceDraw.blink(t)) s.textCenteredShadow('YOU', Math.trunc(r.c.x), Math.trunc(r.c.feet) - 28, arc, this.cCyan, this.cBg);
                break;
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
            case Phase.Clear: {
                if (r.phaseTime < r.clearShow) {
                    if (B.foreman.kind === 'gantry' && r.phaseTime > f32(0.3)) s.textBox('THE FOREMAN FALLS!', 160, 112, dsp, 1, this.cGold, this.cRed, this.cBg);
                    else if (B.foreman.kind === 'stand' && r.phaseTime > f32(0.3)) s.textBox('DOWN COMES THE STAND!', 160, 112, dsp, 1, this.cGold, this.cRed, this.cBg);
                    break;
                }
                s.plate(52, 88, 216, 70, this.cBg, this.cRed);
                s.frame(54, 90, 212, 66, this.cRedDk);
                s.textCentered('BOARD ' + B.n + ' CLEAR', 160, 96, dsp, this.cGold);
                s.text('BONUS', 72, 114, arc, this.cWhite);
                s.textRight(dn(r.tallyLeft, 4), 248, 112, dsp, r.tallyLeft > 0 ? this.cGold : this.cGoldDk);
                s.text('SCORE', 72, 128, arc, this.cWhite);
                s.textRight(d6(r.score), 248, 126, dsp, this.cWhite);
                const next = r.lastBoard ? 'THE WORKS ARE YOURS' : 'NEXT  ' + BOARDS[r.boardNo].name;
                s.textCentered(next, 160, 143, arc, this.cCyan);
                break;
            }
            case Phase.Card:
            case Phase.Over: {
                const spec = IronworksSpec;
                if (r.roundWon) {
                    s.textBox(spec.roundWonText, 160, 92, dsp, 3, this.cGold, this.cRed, this.cBg);
                    s.plate(64, 128, 192, 50, this.cBg, this.cRed);
                    s.textCentered('ALL FIVE BOARDS', 160, 134, arc, this.cCyan);
                    s.textCentered('SCORE ' + d6(r.score), 160, 152, arc, this.cWhite, 2);
                } else {
                    s.textBox(spec.roundLostText, 160, 92, dsp, 3, this.cWhite, this.cRed, this.cBg);
                    s.plate(64, 128, 192, 50, this.cBg, this.cRed);
                    s.textCentered('SCORE ' + d6(r.score), 160, 134, arc, this.cWhite, 2);
                    s.textCentered('BOARD ' + B.n + '  ' + B.name, 160, 160, arc, this.cGold);
                }
                break;
            }
        }
    }
}
