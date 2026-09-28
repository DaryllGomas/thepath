// THE NODE · world 1 · LANCE RIDER on the Cabinet Engine · THE PICTURE.
// Port of LanceRiderRenderer.cs.
//
// A 1982 board's look, palette-limited and inside the 8 px safe area of a curved tube:
//   - HUD band y 8..27: 1UP + the score in big display digits, lives as rider icons + a display
//     digit, the riders and eggs still out there as pips, WAVE n on the right, a lava rule under it
//   - the field x 8..311 (world 0..303, wraps), y 29..231: black sky, stone ledges with a lit top
//     edge and dripping undersides, the brick base standing in the lava, a rolling lava floor with
//     embers, the HAND rising out of it
//   - riders are 18x16 palette sprites: a knight with a lance on a great bird, a 2-frame flap
//     (wings up / downstroke), a stand and a run frame on the ledges, mirrored for facing left;
//     the player's steed is pale gold under blue armour, the rivals ride green buzzards in red
//     (bounder), silver (hunter) and violet (shadow lord)
//   - riders materialise from the feet up with a white scan line; eggs wobble before they hatch
//   - WAVE n / DEATH / ROUND WON / GAME OVER on double-framed plates; FREE RIDE on the mercy credit
// Nothing blinks faster than 2 Hz (the YOU tag and egg wobble run at 1-2 Hz).
import { PixelFont, SurfaceDraw, roundEven, d6 } from '../../sdk/index.js';
import { LanceRiderPalette, LanceRiderSpec } from './spec.js';
import { RiderMode, HandState, Phase, Fx, FIELD_W, LAVA_Y, HAND_HEIGHT, LEDGES } from './round.js';
import {
    FUp, FDown, FStand, FRun, RowsUp, RowsDown, RowsStand, RowsRun, RowsHatchling, RowsEgg, RowsLife, make, variantMap,
} from './sprites.js';

const OX = 8;                                 // world x 0 -> screen x 8
const FIELD_TOP = 29, FIELD_BOTTOM = 232;      // clip rows (exclusive bottom)

// [variant][frame]: variant 0 = the player, 1..3 = bounder, hunter, shadow lord
let riders = null, birds = null, hatchlings = null, eggSprite = null, lifeSprite = null;

function build() {
    if (riders != null) return;
    const P = LanceRiderPalette;
    riders = []; birds = []; hatchlings = [];
    const frames = [RowsUp, RowsDown, RowsStand, RowsRun];
    for (let v = 0; v < 4; v++) {
        const map = variantMap(P, v, true), bmap = variantMap(P, v, false);
        riders[v] = []; birds[v] = [];
        for (let f = 0; f < frames.length; f++) {
            riders[v][f] = make(frames[f], map);
            birds[v][f] = make(frames[f], bmap);
        }
        hatchlings[v] = make(RowsHatchling, map);
    }
    eggSprite = make(RowsEgg, new Map([['E', P.indexOf('egg')], ['e', P.indexOf('eggDark')], ['w', P.indexOf('white')]]));
    lifeSprite = make(RowsLife, variantMap(P, 0, true));
}

function hash(v) {
    let x = Math.imul(v, 2654435761) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    x = Math.imul(x, 2246822519) >>> 0;
    x = (x ^ (x >>> 13)) >>> 0;
    return x & 0x7FFFFFFF;
}

export class LanceRiderRenderer {
    constructor() {
        const pal = this.pal = LanceRiderPalette;
        this.cSky = pal.get('sky'); this.cStone = pal.get('stone'); this.cStoneDark = pal.get('stoneDark'); this.cStoneLight = pal.get('stoneLight');
        this.cLava = pal.get('lava'); this.cLavaDark = pal.get('lavaDark'); this.cLavaHot = pal.get('lavaHot');
        this.cRider = pal.get('rider'); this.cRiderLight = pal.get('riderLight'); this.cEgg = pal.get('egg'); this.cEggDark = pal.get('eggDark'); this.cWhite = pal.get('white');
        this.cTier = [pal.get('bounder'), pal.get('hunter'), pal.get('lord')];
    }

    // ================================================================ draw
    draw(sim, s, t) {
        build();
        const r = sim;
        s.noClip();
        s.clear(this.cSky);
        if (r == null || r.player == null) return;

        s.clip(OX, FIELD_TOP, FIELD_W, FIELD_BOTTOM - FIELD_TOP);
        this._drawEmbers(s, t);
        this._drawLedges(s);
        this._drawLava(s, t);
        this._drawEggs(s, r, t);
        for (const rv of r.rivals) this._drawRider(s, r, rv, t);
        this._drawRider(s, r, r.player, t);
        this._drawHand(s, r);
        this._drawEffects(s, r);
        s.noClip();

        this._drawHud(s, r);
        this._drawOverlays(s, r, t);
    }

    // ---------------------------------------------------------------- stone
    // a ledge is exactly 6 px of stone (its rules thickness): a lit top edge, a bevel, pitted
    // block with seams, a dark underside, and a dark outline on its true ends
    _drawLedges(s) {
        for (const L of LEDGES) {
            if (L.isBase) { this._drawBase(s, L); continue; }
            const x0 = OX + Math.trunc(L.x0), x1 = OX + Math.trunc(L.x1), y = Math.trunc(L.top);
            const capL = L.x0 > 0, capR = L.x1 < FIELD_W;
            for (let x = x0; x < x1; x++) {
                const wx = x - OX;
                const end = (capL && x === x0) || (capR && x === x1 - 1);
                if (end) {
                    s.setPixel(x, y, this.cStone);
                    for (let j = 1; j <= 5; j++) s.setPixel(x, y + j, this.cStoneDark);
                    continue;
                }
                s.setPixel(x, y, this.cStoneLight);                                          // the stone edge
                s.setPixel(x, y + 1, hash(wx * 5 + y) % 4 === 0 ? this.cStone : this.cStoneLight); // bevel
                for (let j = 2; j <= 4; j++) {
                    const hj = hash(wx * 31 + j * 17 + y);
                    const seam = (wx + (j === 3 ? 6 : 0)) % 12 === 0;                        // block joints
                    s.setPixel(x, y + j, seam || hj % 9 === 0 ? this.cStoneDark : this.cStone);
                }
                s.setPixel(x, y + 5, this.cStoneDark);                                       // the underside
            }
        }
    }

    _drawBase(s, L) {
        const x0 = OX + Math.trunc(L.x0), x1 = OX + Math.trunc(L.x1), top = Math.trunc(L.top), bot = Math.trunc(LAVA_Y) + 2;
        s.rect(x0, top, x1 - x0, bot - top, this.cStone);
        s.rect(x0, top, x1 - x0, 1, this.cStoneLight);
        for (let y = top + 1, course = 0; y < bot; y += 5, course++) {
            s.rect(x0, y + 4, x1 - x0, 1, this.cStoneDark);                      // mortar
            for (let x = x0 + (course % 2 === 0 ? 6 : 12); x < x1; x += 12) s.rect(x, y, 1, 4, this.cStoneDark);
        }
        s.rect(x0, top + 1, 1, bot - top - 1, this.cStoneDark);
        s.rect(x1 - 1, top + 1, 1, bot - top - 1, this.cStoneDark);
    }

    // ---------------------------------------------------------------- lava
    _drawLava(s, t) {
        const ly = Math.trunc(LAVA_Y);
        for (let wx = 0; wx < FIELD_W; wx++) {
            const x = OX + wx;
            const crest = ly + roundEven(1.2 * Math.sin(wx * 0.13 + t * 1.7) + 0.8 * Math.sin(wx * 0.051 - t * 1.1));
            s.setPixel(x, crest, this.cLavaHot);
            for (let y = crest + 1; y < FIELD_BOTTOM; y++) {
                let c = this.cLava;
                const d = y - ly;
                if (d >= 10) c = this.cLavaDark;
                else if (d >= 4 && ((wx + Math.trunc(t * 9) + y * 5) % 13 === 0 || (wx - Math.trunc(t * 6) + y * 3) % 17 === 0)) c = this.cLavaDark;
                else if (d <= 2 && (wx + Math.trunc(t * 4)) % 23 === 0) c = this.cLavaHot;
                s.setPixel(x, y, c);
            }
        }
        // slow bubbles that swell and pop
        for (let k = 0; k < 5; k++) {
            const period = 2.2 + k * 0.37;
            const ph = ((t + k * 0.91) % period) / period;
            const bx = OX + (hash(k * 131 + Math.trunc((t + k * 0.91) / period)) % FIELD_W);
            const by = ly + 5 + k % 3;
            if (ph < 0.6) { const rr = ph < 0.3 ? 1 : 2; s.circle(bx, by, rr, this.cLavaHot, false); }
        }
    }

    _drawEmbers(s, t) {
        for (let k = 0; k < 7; k++) {
            const period = 3.1 + k * 0.43;
            const ph = ((t + k * 1.7) % period) / period;
            const cycle = Math.trunc((t + k * 1.7) / period);
            const x = OX + hash(k * 977 + cycle * 31) % FIELD_W + Math.trunc(Math.sin(ph * 6.28 + k) * 3.0);
            const y = Math.trunc(LAVA_Y) - 2 - Math.trunc(ph * 44);
            s.setPixel(x, y, ph < 0.5 ? this.cLavaHot : ph < 0.8 ? this.cLava : this.cLavaDark);
        }
    }

    // ---------------------------------------------------------------- things
    _drawEggs(s, r, t) {
        for (const e of r.eggs) {
            if (!e.alive) continue;
            let wob = 0;
            const left = r.hatchSeconds - e.age;
            if (e.grounded && left < 2.0) wob = (Math.trunc(t * 4) % 2 === 0) ? -1 : 1;   // 2 Hz rock before it hatches
            this._put(s, eggSprite, e.x + wob, e.y, false, 0);
        }
    }

    _drawRider(s, sim, rd, t) {
        if (rd == null || rd.mode === RiderMode.Gone) return;
        if (rd.isPlayer && sim.p === Phase.Dying) return;
        const v = rd.isPlayer ? 0 : 1 + rd.tier;
        const flip = rd.facing < 0;
        if (rd.mode === RiderMode.Hatchling) { this._put(s, hatchlings[v], rd.x, rd.y, flip, 0); return; }
        let f;
        if (rd.mode === RiderMode.Grabbed) f = rd.sinceFlap < 0.12 ? FDown : FUp;
        else if (rd.grounded) f = Math.abs(rd.vx) > 4 && (Math.trunc(rd.runT * 8) % 2 === 1) ? FRun : FStand;
        else f = rd.sinceFlap < 0.13 ? FDown : FUp;
        const spr = riders[v][f];
        if (rd.mode === RiderMode.Spawning) {
            const dur = rd.isPlayer ? 0.9 : 1.0;
            const frac = Math.min(1, rd.revealT / dur);
            if (frac < 1) { this._reveal(s, spr, rd.x, rd.y, flip, frac); return; }
        }
        this._put(s, spr, rd.x, rd.y, flip, 0);
    }

    // blit a sprite whose feet sit on (x, y) world/screen, drawing the wrap copies too
    _put(s, spr, x, y, flip, dy) {
        const sx = OX + Math.round(x) - Math.trunc(spr.width / 2), sy = Math.round(y) - spr.height + dy;
        s.blit(spr, sx, sy, this.pal, 1, flip);
        if (sx < OX) s.blit(spr, sx + FIELD_W, sy, this.pal, 1, flip);
        if (sx + spr.width > OX + FIELD_W) s.blit(spr, sx - FIELD_W, sy, this.pal, 1, flip);
    }

    _reveal(s, spr, x, y, flip, frac) {
        const sy = Math.round(y) - spr.height;
        const rows = Math.max(1, Math.trunc(spr.height * frac));
        const cut = Math.max(FIELD_TOP, sy + spr.height - rows);
        s.clip(OX, cut, FIELD_W, FIELD_BOTTOM - cut);
        this._put(s, spr, x, y, flip, 0);
        s.clip(OX, cut, FIELD_W, 1);
        const sx = OX + Math.round(x) - Math.trunc(spr.width / 2);
        s.blitTinted(spr, sx, sy, this.cWhite, 1, flip);
        s.clip(OX, FIELD_TOP, FIELD_W, FIELD_BOTTOM - FIELD_TOP);
    }

    _drawHand(s, r) {
        if (r.hand === HandState.Idle || r.handReach <= 0) return;
        for (let k = -1; k <= 1; k++) {
            const x = OX + Math.round(r.handX) + k * FIELD_W;
            if (x < OX - 16 || x > OX + FIELD_W + 16) continue;
            this._drawHandAt(s, x, r.handReach, r.hand === HandState.Holding);
        }
    }

    // the troll's hand: scorched rock with lava in the cracks, rising out of the pit
    _drawHandAt(s, x, reach, closed) {
        const ly = Math.trunc(LAVA_Y);
        const top = ly - Math.round(reach * HAND_HEIGHT);   // the grip line
        // the forearm: 11 px of scorched rock with lava in the cracks
        const armTop = top + 8;
        if (armTop < ly + 2) {
            s.rect(x - 5, armTop, 11, ly + 3 - armTop, this.cStoneDark);
            s.rect(x - 5, armTop, 1, ly + 3 - armTop, this.cStone);                   // lit edge
            for (let y = armTop + 2; y < ly + 2; y += 5) {
                s.setPixel(x - 2, y, this.cLava); s.setPixel(x - 1, y + 1, this.cLava); s.setPixel(x, y + 1, this.cLavaHot);
                s.setPixel(x + 2, y + 2, this.cLava); s.setPixel(x + 3, y + 3, this.cLavaDark);
            }
        }
        // the back of the hand
        s.rect(x - 8, top + 1, 17, 8, this.cStoneDark);
        s.rect(x - 8, top + 1, 17, 1, this.cStone);
        s.rect(x - 8, top + 1, 1, 8, this.cStone);
        s.setPixel(x - 4, top + 4, this.cLava); s.setPixel(x - 3, top + 5, this.cLava); s.setPixel(x - 2, top + 5, this.cLavaHot);
        s.setPixel(x + 3, top + 3, this.cLava); s.setPixel(x + 4, top + 4, this.cLava); s.setPixel(x + 5, top + 6, this.cLavaDark);
        if (closed) {
            // a fist round the rider's legs: four big knuckles over the grip line, the thumb across
            for (let i = 0; i < 4; i++) {
                const kx = x - 8 + i * 4 + (i >= 2 ? 1 : 0);
                s.rect(kx, top - 4, 4, 5, this.cStoneDark);
                s.rect(kx, top - 4, 3, 1, this.cStone);
                s.setPixel(kx + 1, top - 1, this.cLavaHot);
            }
            s.rect(x - 10, top - 1, 3, 7, this.cStoneDark);
            s.setPixel(x - 10, top - 1, this.cStone);
            s.rect(x + 7, top - 3, 4, 6, this.cStoneDark);
            s.rect(x + 7, top - 3, 3, 1, this.cStone);
        } else {
            // open, clawing up: four long fingers, a thumb, hot claw tips
            for (let i = 0; i < 4; i++) {
                const fx = x - 8 + i * 4 + (i >= 2 ? 1 : 0), len = (i === 1 || i === 2) ? 11 : 9;
                s.rect(fx, top + 1 - len, 3, len, this.cStoneDark);
                s.rect(fx, top + 1 - len, 1, len, this.cStone);
                s.setPixel(fx + 1, top - len, this.cLavaHot);
                s.setPixel(fx + 1, top + 1 - Math.trunc(len / 2), this.cLava);
            }
            s.rect(x + 9, top + 3, 3, 3, this.cStoneDark);
            s.rect(x + 11, top - 1, 3, 4, this.cStoneDark);
            s.setPixel(x + 12, top - 2, this.cLavaHot);
        }
        // the lava rings where the arm breaks the surface
        s.rect(x - 9, ly - 1, 3, 1, this.cLavaHot);
        s.rect(x + 7, ly - 1, 3, 1, this.cLavaHot);
        s.setPixel(x - 10, ly, this.cLavaHot);
        s.setPixel(x + 10, ly, this.cLavaHot);
    }

    _drawEffects(s, r) {
        const arc = PixelFont.Arcade;
        for (const f of r.effects) {
            const x = OX + Math.round(f.x), y = Math.round(f.y);
            const tc = f.tier < 0 ? this.cRider : this.cTier[Math.min(2, f.tier)];
            switch (f.kind) {
                case Fx.FleeingBird: {
                    const v = f.tier < 0 ? 0 : 1 + f.tier;
                    const fr = (Math.trunc(f.t * 7) % 2 === 0) ? FUp : FDown;
                    const spr = birds[v][fr];
                    s.blit(spr, x - Math.trunc(spr.width / 2), y - spr.height, this.pal, 1, f.facing < 0);
                    break;
                }
                case Fx.Unhorse: {
                    const rad = 3 + f.t * 46;
                    for (let k = 0; k < 12; k++) {
                        const a = k * Math.PI / 6 + 0.2;
                        const m = rad * (0.7 + (k % 3) * 0.15);
                        s.rect(x + Math.trunc(Math.cos(a) * m), y + Math.trunc(Math.sin(a) * m * 0.8), 2, 2, k % 2 === 0 ? tc : (f.t < 0.25 ? this.cWhite : this.cStoneLight));
                    }
                    break;
                }
                case Fx.LavaSplash: {
                    const u = f.t / f.life;
                    for (let k = 0; k < 10; k++) {
                        const spread = (k - 4.5) * (1.5 + u * 5);
                        const hgt = Math.sin(Math.PI * u) * (8 + (k % 3) * 7);
                        s.rect(x + Math.trunc(spread), y - Math.trunc(hgt) - 1, k % 3 === 0 ? 2 : 1, 2, k % 2 === 0 ? this.cLavaHot : this.cLava);
                    }
                    break;
                }
                case Fx.EggSparkle: {
                    const rad = 3 + f.t * 22;
                    for (let k = 0; k < 8; k++) {
                        const a = k * Math.PI / 4;
                        s.setPixel(x + Math.trunc(Math.cos(a) * rad), y + Math.trunc(Math.sin(a) * rad), k % 2 === 0 ? this.cEgg : this.cWhite);
                    }
                    break;
                }
                case Fx.EggSizzle: {
                    for (let k = 0; k < 5; k++) {
                        const px = x - 4 + k * 2 + Math.trunc(Math.sin(f.t * 9 + k) * 1.5);
                        const py = y - 2 - Math.trunc(f.t * (14 + k * 3));
                        s.setPixel(px, py, f.t < 0.35 ? this.cStoneLight : this.cStoneDark);
                    }
                    break;
                }
                case Fx.Popup:
                    s.textCentered(String(f.value), x, y - 4, arc, this.cEgg);
                    break;
            }
        }
    }

    // ---------------------------------------------------------------- HUD
    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cLava);
        s.text(d6(r.score), 28, 10, dsp, this.cWhite, 2);

        // lives: a rider icon and a big digit
        s.blit(lifeSprite, 130, 11, this.pal, 2, false);
        s.text(String(Math.max(0, r.lives)), 149, 10, dsp, this.cRiderLight, 2);

        // what is left of the wave: a pip per rider (tier colour), then a pip per egg
        let px = 172, shown = 0;
        for (const tier of r.queue) { if (shown++ < 10) { s.rect(px, 12, 3, 6, this.cTier[tier]); px += 5; } }
        for (const rv of r.rivals) if (rv.active && shown++ < 10) { s.rect(px, 12, 3, 6, this.cTier[rv.tier]); s.setPixel(px + 1, 12, this.cWhite); px += 5; }
        for (const e of r.eggs) if (e.alive && shown++ < 12) { s.rect(px, 14, 3, 4, this.cEgg); px += 5; }

        const wv = String(r.wave);
        const ww = dsp.measure(wv, 2);
        s.textRight('WAVE', 312 - ww - 5, 13, arc, this.cLava);
        s.textRight(wv, 312, 10, dsp, this.cWhite, 2);
        s.dottedRule(8, 312, 27, 3, this.cLavaDark);
    }

    // ---------------------------------------------------------------- plates
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mid = 160;
        switch (r.p) {
            case Phase.Intro: {
                s.textBox('WAVE ' + r.wave, mid, 84, dsp, 3, this.cWhite, this.cLava, this.cSky);
                s.plate(mid - 84, 112, 168, r.mercyActive ? 36 : 24, this.cSky, this.cStoneDark);
                s.textCentered('PREPARE TO JOUST', mid, 116, arc, this.cEgg);
                s.textCentered(r.waveSize + ' RIDERS IN THE WAVE', mid, 126, arc, this.cStoneLight);
                if (r.mercyActive) s.textCentered('FREE RIDE', mid, 138, arc, this.cRiderLight);
                if (SurfaceDraw.blink(t, 1)) this._youTag(s, r);
                break;
            }
            case Phase.Playing:
                if (r.player.mode === RiderMode.Spawning && SurfaceDraw.blink(t, 1)) this._youTag(s, r);
                break;
            case Phase.Dying:
                if (r.phaseTime > 0.35) {
                    s.textBox(r.deathCause, mid, 92, dsp, 2, this.cWhite, this.cLava, this.cSky);
                    const left = r.lives <= 0 ? 'NO LIVES LEFT' : r.lives === 1 ? 'LAST LIFE' : r.lives + ' LIVES LEFT';
                    const w = arc.measure(left) + 16;
                    s.plate(mid - Math.trunc(w / 2), 114, w, 15, this.cSky, this.cStoneDark);
                    s.textCentered(left, mid, 118, arc, r.lives <= 0 ? this.cLava : this.cRiderLight);
                }
                break;
            case Phase.Card:
            case Phase.Over: {
                const won = r.roundWon;
                s.textBox(won ? LanceRiderSpec.roundWonText : LanceRiderSpec.roundLostText, mid, 70, dsp, 3, won ? this.cEgg : this.cLava, won ? this.cEgg : this.cLava, this.cSky);
                s.plate(mid - 92, 100, 184, 52, this.cSky, this.cStoneDark);
                s.frame(mid - 90, 102, 180, 48, this.cStoneDark);
                s.textCentered('SCORE ' + d6(r.score), mid, 108, arc, this.cWhite, 2);
                s.textCentered('RIDERS ' + r.kills + '   EGGS ' + r.eggsTaken, mid, 128, arc, this.cStoneLight);
                s.textCentered(won ? 'THE LAVA IS YOURS' : 'THE LAVA TAKES ALL', mid, 139, arc, won ? this.cRiderLight : this.cLava);
                break;
            }
        }
    }

    _youTag(s, r) {
        const p = r.player;
        const x = OX + Math.round(p.x), y = Math.round(p.y) - 28;
        s.textCenteredShadow('YOU', x, y, PixelFont.Arcade, this.cRiderLight, this.cSky);
        s.rect(x, y + 9, 1, 2, this.cRiderLight);
    }
}
