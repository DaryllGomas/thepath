// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · THE PICTURE.
// Began as the port of SpritePopRenderer.cs (the SpritePopArt half lives in art.js); rebuilt for the seven-stage
// tower on 2026-10-18. It only reads the sim.
//
// Built for a curved tube seen from 0.8 m: every actor is a chunky 16 px sprite, bubbles are 16 px
// (22 px with a creature inside), the field fills the tube edge to edge inside the 8 px margin.
//   - HUD band y 8..27: 1UP + the score in display digits at scale 2, the cub's head + lives, a
//     creature head + how many are left (the king's head and his health bar in his room), the
//     CANDY letters (lit as they are popped), STAGE n on the right; a dotted rule in the stage's dark
//   - the field 19 x 12 tiles of 16 px at (8, 32): each stage's own block colour and pattern (candy
//     stripes, dots, checks, bricks, planks, back stripes, rivets) with a lit top edge and a dark
//     underside, casting the 1986 board's hard indigo drop shadow down-right. A screen is baked once
//     into a cached buffer and copied in by rows (it scrolls up into the next stage between them)
//   - the cub (lime and yellow, spiked back, big eye) stand / 2-step walk / jump / blow / dizzy;
//     wind-ups and whistlers green, hoppers violet springs (crouch = the tell), corkers blue popguns
//     (puffed cheeks and a "!" = the tell), wisps white sheets (dithered when faded), bouncers pink and
//     yellow balls (squash on a bounce); ANGRY creatures go red. The alarm clock rings; the Tin King
//     is drawn at 2x, shakes and shows "!" while he winds up, flashes white when a spark lands
//   - bubbles: a candy-blue ring with a white glint; with a creature inside the ring is 22 px and
//     warns in pink for the last 2 s, then red/white at 2 Hz for the last second. Specials: FIZZ is a
//     lime ring with soda bubbles in it, SPARK a yellow ring with a bolt, a LETTER a pink ring with
//     its letter; a special dims for its last 2 s
//   - the fizz flood is a lime run of soda blobs; a spark is a zigzag bolt; corks and gears fly
//   - pops burst in 8 rays and throw sparkles; points rise in display digits (a chain shows big and
//     yellow); a little screen shake on big moments (1-2 px, inside the field)
//   - the STAGE card (number, name, the new creature drawn big, what is new, a hint), HURRY UP!,
//     the alarm's "!!" at the ceiling gap, ALL POPPED!, the TALLY, banners (EXTRA LIFE, CANDY...),
//     TOWER CLEARED / GAME OVER on double-framed plates; FREE RIDE on the mercy credit
// Nothing flashes inside the 3-30 Hz strobe band: blinks run at 1-2 Hz, a hit is one short flash.
import { f32, d6, idiv, roundEven, PixelFont, SurfaceDraw, RoundResult } from '../../sdk/index.js';
import { SpritePopPalette, SpritePopSpec } from './spec.js';
import { SpritePopLevel } from './tiles.js';
import { SpritePopSim } from './round.js';
import { STAGES, Kind, KindNames, Word } from './stages.js';
import * as Art from './art.js';

const OX = 8, OY = 32;
const T = SpritePopLevel.Tile, FW = SpritePopLevel.FW, FH = SpritePopLevel.FH;
const Phase = SpritePopSim.Phase, CState = SpritePopSim.CState, BType = SpritePopSim.BType, KState = SpritePopSim.KState;

export class SpritePopRenderer {
    constructor() {
        const pal = this.pal = SpritePopPalette;
        this.cBg = pal.get('bg'); this.cShadow = pal.get('shadow'); this.cPink = pal.get('pink'); this.cPinkL = pal.get('pinkLight'); this.cPinkD = pal.get('pinkDark');
        this.cBlue = pal.get('blue'); this.cBlueD = pal.get('blueDark'); this.cBlueL = pal.get('blueLight'); this.cWhite = pal.get('white'); this.cGreen = pal.get('green');
        this.cGreenD = pal.get('greenDark'); this.cCub = pal.get('cub'); this.cYellow = pal.get('yellow'); this.cOrange = pal.get('orange'); this.cRed = pal.get('red');
        this.cRedD = pal.get('redDark'); this.cRose = pal.get('rose'); this.cSteel = pal.get('steel'); this.cSteelL = pal.get('steelLight'); this.cSteelD = pal.get('steelDark');
        const b = (rows, swap) => Art.build(pal, rows, swap);
        this.cubStand = b(Art.CubStand); this.cubWalk = b(Art.CubWalk); this.cubJump = b(Art.CubJump);
        this.cubBlow = b(Art.CubBlow); this.cubDizzy = b(Art.CubDizzy); this.cubHead = b(Art.CubHead);
        this.windHead = b(Art.WindHead); this.kingHead = b(Art.KingHead);
        // [calm, angry] per kind and frame
        this.wind = [[b(Art.WindA), b(Art.WindB)], [b(Art.WindA, Art.Angry), b(Art.WindB, Art.Angry)]];
        this.whistle = [[b(Art.WhistleA), b(Art.WhistleB)], [b(Art.WhistleA, Art.Angry), b(Art.WhistleB, Art.Angry)]];
        this.hop = [[b(Art.HopRest), b(Art.HopCrouch), b(Art.HopAir)], [b(Art.HopRest, Art.AngryHop), b(Art.HopCrouch, Art.AngryHop), b(Art.HopAir, Art.AngryHop)]];
        this.corker = [[b(Art.CorkA), b(Art.CorkB), b(Art.CorkPuff)], [b(Art.CorkA, Art.AngryCork), b(Art.CorkB, Art.AngryCork), b(Art.CorkPuff, Art.AngryCork)]];
        this.wisp = [[b(Art.WispA), b(Art.WispB)], [b(Art.WispA, Art.AngryWisp), b(Art.WispB, Art.AngryWisp)]];
        this.ball = [[b(Art.BallA), b(Art.BallSquash)], [b(Art.BallA, Art.AngryBall), b(Art.BallSquash, Art.AngryBall)]];
        this.alarmSpr = [b(Art.AlarmA), b(Art.AlarmB)];
        this.king = [[b(Art.KingA), b(Art.KingB)], [b(Art.KingA, Art.AngryKing), b(Art.KingB, Art.AngryKing)]];
        this.gear = [b(Art.GearA), b(Art.GearB)];
        this.corkShot = b(Art.Cork);
        this.fruit = Art.FruitRows.map(rows => b(rows));
        this.fruitBottom = new Int32Array(this.fruit.length);
        for (let i = 0; i < this.fruit.length; i++)
            for (let j = 0; j < this.fruit[i].height; j++)
                for (let k = 0; k < this.fruit[i].width; k++)
                    if (this.fruit[i].at(k, j) >= 0) this.fruitBottom[i] = j;
        this.ringTrap = Art.ring(pal, 11, 'blue', 'blueDark', true);
        this.ringWarn = Art.ring(pal, 11, 'pink', 'pinkDark', true);
        this.ringLate = Art.ring(pal, 11, 'red', 'redDark', true);
        this.ringFizz = Art.ring(pal, 9, 'cub', 'greenDark', true);
        this.ringSpark = Art.ring(pal, 9, 'yellow', 'orange', true);
        this.ringLetter = Art.ring(pal, 9, 'pink', 'pinkDark', true);
        this.ringDim = Art.ring(pal, 9, 'blueDark', 'shadow', false);
        this.ringKing = Art.ring(pal, 26, 'blueLight', 'blue', true);
        this.rings = new Map();
        this.fields = new Map();                                    // baked screens, by layout
        this.fxSets = [
            [this.cWhite, this.cBlue, this.cBlueL], [this.cYellow, this.cOrange, this.cWhite], [this.cCub, this.cWhite, this.cGreen],
            [this.cYellow, this.cWhite, this.cOrange], [this.cSteelL, this.cYellow, this.cRed, this.cWhite], [this.cPink, this.cPinkL, this.cWhite],
        ];
        this._u32 = null; this._buf = null;
        this.sx = 0; this.sy = 0;                                   // this frame's shake
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.level == null) return;
        t = f32(t);
        if (this._buf !== s.data.buffer) { this._buf = s.data.buffer; this._u32 = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height); }

        // a little shake on the big moments (inside the field's clip, 1-2 px)
        this.sx = 0; this.sy = 0;
        if (r.shake > 0) {
            const a = r.shake > f32(0.3) ? 2 : 1, ph = Math.trunc(f32(r.time * 40)) % 4;
            this.sx = ph === 0 ? a : ph === 2 ? -a : 0; this.sy = ph === 1 ? a : ph === 3 ? -a : 0;
        }

        const scrolling = r.p === Phase.Ready && r.prevLevel != null && r.phaseTime < r.introAt;
        if (scrolling) {
            let k = f32(r.phaseTime / r.introAt);
            k = f32(k * k * (3 - 2 * k));
            const off = roundEven(f32(k * FH));
            this._copyField(s, r.prevLevel, 0, -off);
            this._copyField(s, r.level, 0, FH - off);
            s.clip(OX, OY, FW, FH);
            this._drawFloatIn(s, r, k);
            s.noClip();
        } else {
            this._copyField(s, r.level, this.sx, this.sy);
            s.clip(OX, OY, FW, FH);
            for (const f of r.fruits) this._drawFruit(s, f);
            for (const fl of r.floods) this._drawFlood(s, fl);
            for (const bb of r.bubbles) this._drawBubble(s, r, bb, t);
            for (const c of r.creatures) if (c.state === CState.Free) this._drawCreature(s, r, c, t);
            if (r.king != null && r.king.vulnerable) this._drawKing(s, r, r.king, t);
            for (const sh of r.shots) this._drawShot(s, sh);
            for (const o of r.bolts) this._drawBolt(s, o, t);
            this._drawAlarm(s, r, t);
            this._drawCub(s, r);
            for (const bu of r.bursts) this._drawBurst(s, bu);
            for (const q of r.parts) this._drawPart(s, q);
            for (const p of r.popups) this._drawPopup(s, p);
            s.noClip();
        }

        this._drawHud(s, r, t);
        this._drawOverlays(s, r, t);
    }

    // ---------------------------------------------------------------- the field (baked once a screen)
    _copyField(s, L, dx, dy) {
        const f = this._field(L), u = this._u32, W = s.width;
        const x0 = Math.max(0, -dx), x1 = Math.min(FW, FW - dx);
        for (let y = 0; y < FH; y++) {
            const sy = y + dy;
            if (sy < 0 || sy >= FH) continue;
            u.set(f.subarray(y * FW + x0, y * FW + x1), (OY + sy) * W + OX + x0 + dx);
        }
    }

    _field(L) {
        let f = this.fields.get(L.index);
        if (f !== undefined) return f;
        f = new Uint32Array(FW * FH).fill(this.cBg.packed);
        const th = L.theme, base = this.pal.get(th.base).packed, light = this.pal.get(th.light).packed, dark = this.pal.get(th.dark).packed;
        const white = this.cWhite.packed, shadow = this.cShadow.packed;
        const rect = (x, y, w, h, c) => {
            for (let j = Math.max(0, y); j < Math.min(FH, y + h); j++)
                for (let i = Math.max(0, x); i < Math.min(FW, x + w); i++) f[j * FW + i] = c;
        };
        // the hard drop shadow, down-right, then the blocks over it
        for (let row = 0; row < SpritePopLevel.Rows; row++)
            for (let col = 0; col < SpritePopLevel.Cols; col++)
                if (L.solid(col, row)) rect(col * T + 4, row * T + 4, T, T, shadow);
        for (let row = 0; row < SpritePopLevel.Rows; row++)
            for (let col = 0; col < SpritePopLevel.Cols; col++) {
                if (!L.solid(col, row)) continue;
                const x0 = col * T, y0 = row * T;
                for (let j = 0; j < T; j++)
                    for (let i = 0; i < T; i++) {
                        const v = blockPixel(th.pattern, x0 + i, y0 + j, i, j, row);
                        f[(y0 + j) * FW + x0 + i] = v === 1 ? light : v === 2 ? dark : base;
                    }
                const up = row > 0 && L.solid(col, row - 1), down = row < SpritePopLevel.Rows - 1 && L.solid(col, row + 1);
                const left = col > 0 && L.solid(col - 1, row), right = col < SpritePopLevel.Cols - 1 && L.solid(col + 1, row);
                if (!up) { rect(x0, y0, T, 2, light); rect(x0, y0, T, 1, white); }
                if (!down) rect(x0, y0 + T - 3, T, 3, dark);
                if (!left) rect(x0, y0, 1, T, light);
                if (!right) rect(x0 + T - 1, y0, 1, T, dark);
            }
        this.fields.set(L.index, f);
        return f;
    }

    // ---------------------------------------------------------------- actors
    _drawFloatIn(s, r, k) {
        // the cub rides a bubble from where it cleared the last screen to the start of this one
        const x = roundEven(f32(r.cubFromX + f32(f32(r.cub.x - r.cubFromX) * k)));
        const y = roundEven(f32(r.cubFromY + f32(f32(r.cub.y - r.cubFromY) * k))) - roundEven(f32(Math.sin(k * Math.PI) * 30));
        s.blit(this.cubJump, OX + x, OY + y, this.pal, 1, false);
        s.blit(this.ringTrap, OX + x + 8 - 11, OY + y + 8 - 11, this.pal);
    }

    _drawCub(s, r) {
        const c = r.cub;
        const x = OX + roundEven(c.x) + this.sx, y = OY + roundEven(c.y) + this.sy;
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
        if ((r.p === Phase.Card || r.p === Phase.Over) && r.result === RoundResult.Lost) return;
        if (r.p === Phase.Card || r.p === Phase.Over) {
            // the climb is done: it hops for joy
            const hop = roundEven(Math.abs(Math.sin(r.phaseTime * 6)) * 10);
            s.blit(hop > 2 ? this.cubJump : this.cubStand, x, y - hop, this.pal, 1, Math.trunc(r.phaseTime * 1.5) % 2 === 1);
            return;
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

    _creatureSprite(c, frame) {
        const a = c.angry ? 1 : 0;
        switch (c.kind) {
            case Kind.Whistler: return this.whistle[a][frame];
            case Kind.Hopper: return this.hop[a][c.act === 1 && c.grounded ? 1 : !c.grounded ? 2 : 0];
            case Kind.Corker: return this.corker[a][c.act === 1 ? 2 : frame];
            case Kind.Wisp: return this.wisp[a][frame];
            case Kind.Bouncer: return this.ball[a][c.squash > 0 ? 1 : 0];
            default: return this.wind[a][frame];
        }
    }

    _drawCreature(s, r, c, t) {
        const x = OX + roundEven(c.x) + this.sx, y = OY + roundEven(c.y) + this.sy;
        let fr;
        if (c.kind === Kind.Whistler || c.kind === Kind.Wisp) fr = Math.trunc(f32(f32(c.anim + f32(c.id * f32(0.13))) * 5)) % 2;
        else fr = c.grounded ? Math.trunc(f32(f32(c.anim + f32(c.id * f32(0.21))) * (c.angry ? 7 : 5))) % 2 : 0;
        const spr = this._creatureSprite(c, fr);
        if (c.faded) { this._blitDither(s, spr, x, y, c.face < 0, Math.trunc(f32(t * 10)) & 1); return; }
        s.blit(spr, x, y, this.pal, 1, c.face < 0);
        if (c.kind === Kind.Corker && c.act === 1) s.textCenteredShadow('!', x + 8, y - 9, PixelFont.Arcade, this.cYellow, this.cBg);
    }

    // a faded wisp: every other pixel (the arcade's only see-through)
    _blitDither(s, spr, x, y, flip, ph) {
        for (let j = 0; j < spr.height; j++)
            for (let i = 0; i < spr.width; i++) {
                if (((i + j + ph) & 1) !== 0) continue;
                const v = spr.at(flip ? spr.width - 1 - i : i, j);
                if (v >= 0) s.setPixel(x + i, y + j, this.pal.at(v));
            }
    }

    _drawKing(s, r, k, t) {
        let x = OX + roundEven(k.x) + this.sx, y = OY + roundEven(k.y) + this.sy;
        const tele = k.state === KState.Tele;
        if (tele) x += Math.trunc(f32(k.t * 30)) % 2 === 0 ? 1 : -1;               // he shakes as he winds up
        const spr = this.king[k.rage ? 1 : 0][tele ? 1 : 0];
        if (k.flash > f32(0.18)) s.blitTinted(spr, x, y, this.cWhite, 2, k.face < 0);
        else s.blit(spr, x, y, this.pal, 2, k.face < 0);
        if (tele) s.textCenteredShadow('!', x + 20, y - 12, PixelFont.Display, this.cYellow, this.cBg, 2);
    }

    _drawBubble(s, r, b, t) {
        let cx = OX + roundEven(b.x) + this.sx, cy = OY + roundEven(b.y) + this.sy;
        if (b.wob > 0) cx += Math.trunc(f32(b.wob * 20)) % 2 === 0 ? 1 : -1;
        if (b.type === BType.King) {
            const k = r.king;
            if (k != null) s.blit(this.king[1][0], cx - 20, cy - 20, this.pal, 2, k.face < 0);
            s.blit(this.ringKing, cx - 26, cy - 26, this.pal);
            if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('POP!', cx, cy - 38, PixelFont.Arcade, this.cYellow, this.cBg);
            return;
        }
        if (b.type !== BType.Plain) {
            const dim = b.life < 2 && Math.trunc(f32(b.life * 4)) % 2 === 1;      // 2 Hz: about to go
            s.blit(dim ? this.ringDim : b.type === BType.Fizz ? this.ringFizz : b.type === BType.Spark ? this.ringSpark : this.ringLetter, cx - 9, cy - 9, this.pal);
            if (b.type === BType.Fizz) {
                s.circle(cx - 2, cy + 1, 2, this.cWhite, false); s.setPixel(cx + 2, cy - 2, this.cWhite); s.rect(cx + 2, cy + 2, 2, 2, this.cCub);
            } else if (b.type === BType.Spark) {
                s.line(cx + 1, cy - 5, cx - 2, cy, this.cYellow); s.line(cx - 2, cy, cx + 2, cy, this.cWhite); s.line(cx + 2, cy, cx - 1, cy + 5, this.cYellow);
            } else s.textCentered(Word[b.letter], cx + 1, cy - 3, PixelFont.Arcade, this.cWhite);
            return;
        }
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
        s.blit(this._creatureSprite(c, 0), cx - 8, cy - 8, this.pal, 1, c.face < 0);
        let rg = this.ringTrap;
        if (b.trapLeft < 1) rg = Math.trunc(f32(b.trapLeft * 4)) % 2 === 0 ? this.ringLate : this.ringWarn;     // 2 Hz
        else if (b.trapLeft < 2) rg = this.ringWarn;
        s.blit(rg, cx - 11, cy - 11, this.pal);
    }

    _drawFruit(s, f) {
        if (f.life < 2 && Math.trunc(f32(f.life * 4)) % 2 === 1) return;           // 2 Hz: about to go
        const k = ((f.kind % this.fruit.length) + this.fruit.length) % this.fruit.length;
        // sat on the platform: the fruit's lowest pixel on the row just above the feet line
        const x = OX + roundEven(f.x) + 1 + this.sx, y = OY + roundEven(f.feet) - 1 - this.fruitBottom[k] + this.sy;
        s.blit(this.fruit[k], x, y, this.pal);
    }

    _drawFlood(s, fl) {
        const n = fl.trail.length;
        for (let i = 0; i < n; i++) {
            const q = fl.trail[i];
            const x = OX + roundEven(q.x) + this.sx, y = OY + roundEven(q.y) + this.sy;
            const head = i === n - 1 && !fl.done;
            s.circle(x, y + 1, head ? 6 : 5, this.cGreen, true);
            s.circle(x, y, head ? 5 : 4, this.cCub, true);
            if ((i & 1) === 0) s.setPixel(x - 2, y - 2, this.cWhite); else s.setPixel(x + 1, y - 1, this.cWhite);
        }
    }

    _drawBolt(s, o, t) {
        const x = OX + roundEven(o.x) + this.sx, y = OY + roundEven(o.y) + this.sy;
        const sp = Math.max(1, Math.sqrt(o.vx * o.vx + o.vy * o.vy));
        const ux = o.vx / sp, uy = o.vy / sp;
        const zig = Math.trunc(f32(t * 10)) % 2 === 0 ? 1 : -1;
        let px = x, py = y;
        for (let i = 1; i <= 4; i++) {
            const off = (i % 2 === 0 ? 3 : -3) * zig * (i === 4 ? 0 : 1);
            const nx = x - roundEven(ux * i * 5 - uy * off), ny = y - roundEven(uy * i * 5 + ux * off);
            s.line(px, py, nx, ny, i <= 2 ? this.cWhite : this.cYellow);
            s.line(px, py + 1, nx, ny + 1, this.cYellow);
            px = nx; py = ny;
        }
        s.rect(x - 1, y - 1, 3, 3, this.cWhite);
    }

    _drawShot(s, sh) {
        const x = OX + roundEven(sh.x) + this.sx, y = OY + roundEven(sh.y) + this.sy;
        if (sh.kind === SpritePopSim.ShotKind.Gear) s.blit(this.gear[Math.trunc(f32(sh.t * 8)) % 2], x - 3, y - 3, this.pal);
        else s.blit(this.corkShot, x - 3, y - 2, this.pal, 1, sh.vx < 0);
    }

    _drawAlarm(s, r, t) {
        const a = r.alarm;
        if (a.warn && !a.on && SurfaceDraw.blink(t, 2)) {
            // the tell: it is coming through the ceiling gap
            const gx = OX + (r.level.gapL + r.level.gapR + 1) * T / 2;
            s.textCenteredShadow('!!', gx, OY + 20, PixelFont.Display, this.cRed, this.cBg, 2);
        }
        if (!a.on) return;
        const x = OX + roundEven(a.x) + this.sx, y = OY + roundEven(a.y) + this.sy;
        s.blit(this.alarmSpr[Math.trunc(f32(a.anim * 8)) % 2], x, y, this.pal, 1, a.vx < 0);
    }

    _drawBurst(s, b) {
        const cx = OX + roundEven(b.x) + this.sx, cy = OY + roundEven(b.y) + this.sy;
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

    _drawPart(s, q) {
        const set = this.fxSets[q.set] || this.fxSets[0];
        const c = set[Math.abs(roundEven(q.vx)) % set.length];
        const big = q.t < f32(q.life * 0.5);
        s.rect(OX + roundEven(q.x) + this.sx, OY + roundEven(q.y) + this.sy, big ? 2 : 1, big ? 2 : 1, c);
    }

    _drawPopup(s, p) {
        const dsp = PixelFont.Display;
        const x = OX + roundEven(p.x), y = OY + roundEven(p.y) - 8;
        switch (p.style) {
            case 2:
                s.textCenteredShadow(p.text, x, y - 4, dsp, this.cYellow, this.cBg, 2);
                if (p.chain >= 2) s.textCenteredShadow('X' + p.chain, x, y + 12, PixelFont.Arcade, this.cPinkL, this.cBg);
                break;
            case 3: s.textCenteredShadow(p.text, x, y - 6, dsp, this.cPinkL, this.cPinkD, 2); break;
            case 4: s.textCenteredShadow(p.text, x, y - 6, dsp, this.cCub, this.cBg, 2); break;
            default: s.textCenteredShadow(p.text, x, y, dsp, p.style === 1 ? this.cYellow : this.cWhite, this.cBg);
        }
    }

    // ---------------------------------------------------------------- HUD
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cPink);
        s.text(d6(r.score), 28, 10, dsp, this.cWhite, 2);
        s.blit(this.cubHead, 130, 10, this.pal);
        s.text(String(Math.min(9, Math.max(0, r.lives))), 146, 10, dsp, this.cCub, 2);
        const k = r.king;
        if (k != null) {
            // his health: a bar that empties as sparks land (red once he is angry)
            s.blit(this.kingHead, 166, 10, this.pal);
            const w = 72, fill = Math.max(0, Math.round(w * k.hp / Math.max(1, k.maxHp)));
            s.plate(182, 12, w + 4, 9, this.cBg, this.cSteelL);
            if (fill > 0) s.rect(184, 14, fill, 5, k.rage ? this.cRed : this.cYellow);
        } else {
            s.blit(this.windHead, 166, 10, this.pal);
            s.text(String(Math.min(9, r.creaturesLeft)), 182, 10, dsp, this.cGreen, 2);
            // the letters: lit as they are popped; the whole word blinks when it pays
            const full = r.lettersFlash > 0;
            for (let i = 0; i < Word.length; i++) {
                const lit = full ? SurfaceDraw.blink(t, 2) : (r.letters & (1 << i)) !== 0;
                s.text(Word[i], 204 + i * 7, 13, arc, lit ? (full ? this.cYellow : this.cPinkL) : this.cShadow);
            }
        }
        const sn = String(r.stage);
        s.textRight(sn, 312, 10, dsp, this.cWhite, 2);
        s.textRight('STAGE', 312 - dsp.measure(sn, 2) - 5, 13, arc, this.cPink);
        s.dottedRule(8, 312, 27, 3, this.pal.get(r.level.theme.dark));
    }

    // ---------------------------------------------------------------- plates
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mid = 160;
        switch (r.p) {
            case Phase.Ready:
                if (r.phaseTime >= r.introAt) this._drawStageCard(s, r, t);
                break;
            case Phase.Play:
                if (r.hurry && r.hurryT < r.hurryBanner && !r.clearing)
                    s.textBox('HURRY UP!', mid, 70, dsp, 3, this.cRed, this.cYellow, this.cBg);
                if (r.clearing)
                    s.textBox('ALL POPPED!', mid, 70, dsp, 2, this.cYellow, this.cPink, this.cBg);
                if (r.guard > 0 && r.phaseTime < f32(1.5) && SurfaceDraw.blink(t, 1)) this._youTag(s, r);
                break;
            case Phase.Tally:
                this._drawTally(s, r);
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = SpritePopSpec;
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, mid, 64, dsp, won ? 2 : 3, won ? this.cYellow : this.cRed, this.cPink, this.cBg);
                s.plate(mid - 96, 94, 192, 66, this.cBg, this.cBlue);
                s.textCentered('SCORE ' + d6(r.score), mid, 100, arc, this.cWhite, 2);
                if (won) s.textCentered('THE TIN KING IS POPPED', mid, 120, arc, this.cCub);
                else s.textCentered('STAGE ' + r.stage + '  ' + r.level.name, mid, 120, arc, this.cCub);
                s.textCentered('POPPED ' + r.popped + '   FRUIT ' + r.fruitTaken, mid, 134, arc, this.cBlue);
                s.textCentered('BEST CHAIN X' + Math.max(1, r.maxChain) + '   EXTRA ' + r.extraLives, mid, 146, arc, this.cPinkL);
                break;
            }
        }
        if (r.bannerT < r.bannerSeconds && r.banner && r.p === Phase.Play && !(r.hurry && r.hurryT < r.hurryBanner) && !r.clearing)
            s.textBox(r.banner, mid, 44, dsp, 1, this.cCub, this.cCub, this.cBg);
    }

    // the stage card: number, name, the new thing drawn big, a hint, READY
    _drawStageCard(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, mid = 160;
        const S = r.stageDef, th = r.level.theme;
        const last = r.stage === STAGES.length;
        s.textBox(last ? 'FINAL STAGE' : 'STAGE ' + r.stage, mid, 52, dsp, last ? 2 : 3, last ? this.cYellow : this.cWhite, this.pal.get(th.base), this.cBg);
        const h = r.mercyActive ? 82 : 72;
        s.plate(mid - 98, 84, 196, h, this.cBg, this.pal.get(th.light));
        s.frame(mid - 96, 86, 192, h - 4, this.pal.get(th.dark));
        s.textCentered(r.level.name, mid, 91, dsp, this.cWhite);
        let spr, sc = 2, w;
        if (S.boss) { spr = this.king[0][0]; w = 40; }
        else { spr = this._featureSprite(S.feature, t); w = 32; }
        const sx = mid - 88, sy = 104;
        s.blit(spr, sx, sy, this.pal, sc);
        const tx = sx + w + 8;
        s.text(S.newText, tx, 110, arc, this.cYellow);
        if (!S.boss && S.feature >= 0) s.text(r.stage === 1 ? 'TRAP THEM ALL' : 'NEW ' + KindNames[S.feature], tx, 122, arc, this.cBlueL);
        else if (S.boss) s.text('HE THROWS GEARS', tx, 122, arc, this.cBlueL);
        s.textCentered(S.hint, mid, 142, arc, this.cPinkL);
        if (r.mercyActive) s.textCentered('FREE RIDE', mid, 154, arc, this.cCub);
        if (SurfaceDraw.blink(t, 1)) s.textCentered('READY!', mid, 84 + h + 6, arc, this.cYellow);
        if (SurfaceDraw.blink(t, 1)) this._youTag(s, r);
    }

    _featureSprite(kind, t) {
        const fr = Math.trunc(f32(t * 3)) % 2;
        switch (kind) {
            case Kind.Whistler: return this.whistle[0][fr];
            case Kind.Hopper: return this.hop[0][fr === 0 ? 0 : 1];
            case Kind.Corker: return this.corker[0][fr === 0 ? 0 : 2];
            case Kind.Wisp: return this.wisp[0][fr];
            case Kind.Bouncer: return this.ball[0][fr];
            default: return this.wind[0][fr];
        }
    }

    _drawTally(s, r) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, mid = 160;
        const T_ = r.tally;
        if (T_ == null) return;
        const boss = r.stageDef.boss;
        s.textBox(boss ? 'THE KING IS POPPED' : 'STAGE ' + r.stage + ' CLEAR!', mid, 60, dsp, boss ? 1 : 2, this.cYellow, this.cPink, this.cBg);
        const h = 24 + T_.lines.length * 14;
        s.plate(mid - 100, 86, 200, h, this.cBg, this.cBlue);
        for (let i = 0; i < T_.shown; i++) {
            const y = 94 + i * 14;
            s.text(T_.lines[i][0], mid - 92, y + 1, arc, this.cBlueL);
            s.textRight(String(T_.lines[i][1]), mid + 92, y, dsp, T_.lines[i][1] > 0 ? this.cWhite : this.cShadow);
        }
        if (T_.shown >= T_.lines.length) s.textCentered('SCORE ' + d6(r.score), mid, 86 + h - 12, arc, this.cYellow);
    }

    _youTag(s, r) {
        const x = OX + roundEven(r.cub.cx), y = OY + roundEven(r.cub.y) - 12;
        s.textCenteredShadow('YOU', x, y, PixelFont.Arcade, this.cYellow, this.cBg);
    }
}

// a block's pattern: 1 = the lit colour, 2 = the dark, 0 = the base (gx, gy: field px; i, j: in the block)
function blockPixel(pattern, gx, gy, i, j, row) {
    switch (pattern) {
        case 0: return ((gx + gy) & 7) < 2 ? 1 : 0;                                   // candy stripes
        case 1: { const ox = (row & 1) * 4; return ((i + ox) & 7) >= 3 && ((i + ox) & 7) <= 4 && (j & 7) >= 3 && (j & 7) <= 4 ? 1 : 0; }   // dots
        case 2: return (((gx >> 2) + (gy >> 2)) & 1) === 0 && ((gx + gy) & 1) === 0 ? 1 : 0;   // checks
        case 3: { const off = (j >> 3) & 1 ? 8 : 0; return (j & 7) === 7 || ((i + off) & 15) === 0 ? 2 : (j & 7) === 0 ? 1 : 0; }   // bricks
        case 4: return j % 5 === 4 ? 2 : (j % 5 === 0 && ((gx * 7 + j) % 13) < 6) ? 1 : 0;    // planks
        case 5: return ((gx - gy) & 7) < 2 ? 1 : 0;                                   // back stripes
        case 6: return (i === 3 || i === 12) && (j === 4 || j === 11) ? 1 : (i === 4 || i === 13) && (j === 5 || j === 12) ? 2 : 0;   // rivets
        default: return 0;
    }
}

SpritePopRenderer.OX = OX;
SpritePopRenderer.OY = OY;
