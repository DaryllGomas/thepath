// THE NODE · world 1 · LANCE RIDER on the Cabinet Engine · THE PICTURE.
// Began as the port of LanceRiderRenderer.cs; built out 2026-10-18 with the seven waves.
//
// A 1982 board's look, palette-limited and inside the 8 px safe area of a curved tube:
//   - HUD band y 8..27: 1UP + the score in big display digits, lives as rider icons + a display
//     digit, the riders and eggs still out there as pips (the beast's crowns on wave 7), WAVE n on
//     the right, a lava rule under it
//   - the field x 8..311 (world 0..303, wraps), y 29..231: black sky with the cave's teeth hanging
//     from its roof, stone ledges with a lit top edge (cracks opening in the ones that will fall),
//     the brick base standing in the lava, a rolling lava floor with embers, the HAND rising out of
//     it (the lava boils first where it will come up)
//   - riders are 18x16 palette sprites: a knight with a lance on a great bird, a 2-frame flap
//     (wings up / downstroke), a stand and a run frame on the ledges, mirrored for facing left;
//     the player's steed is pale gold under blue armour, the rivals ride green buzzards in red
//     (bounder), silver (hunter) and violet (shadow lord); a gladiator flies a gold pennant
//   - the CINDER HAWK: a chevron at the field's edge at your height, a dotted lane once it has
//     locked, then the flame bird streaking across
//   - THE PIT BEAST: a horned head on a long neck out of the lava, its gold crown on top (the weak
//     point), jaws that open and glow before it spits or breathes, the jet of fire, the embers
//   - riders materialise from the feet up with a white scan line; eggs wobble before they hatch;
//     feathers, sparks, stone debris and score pop-ups; the field shakes a pixel or three on the
//     big blows (the outer 8 px stay pure background)
//   - the WAVE card (number, name, hint), the TALLY after a wave, DEATH, EXTRA RIDER, VICTORY /
//     GAME OVER on double-framed plates; FREE RIDE on the mercy credit
// Nothing blinks faster than 2 Hz (the YOU tag, the egg wobble and the warnings run at 1-2 Hz).
import { PixelFont, SurfaceDraw, roundEven, d6 } from '../../sdk/index.js';
import { LanceRiderPalette, LanceRiderSpec } from './spec.js';
import { RiderMode, HandState, HawkState, Phase, Fx, FIELD_W, LAVA_Y, HAND_HEIGHT, STAGE_COUNT } from './round.js';
import { BeastState, BeastAttack, AtkStage, MOUTH_DY, JAW_DX, JET_HALF_H, HEAD_ROWS, NECK_BACK, NECK_FRONT, SHOULDER_HALF_W, SHOULDER_H } from './beast.js';
import {
    FUp, FDown, FStand, FRun, RowsUp, RowsDown, RowsStand, RowsRun, RowsHatchling, RowsEgg, RowsLife, make, variantMap,
    RowsHawkUp, RowsHawkDown, RowsBeastShut, RowsBeastOpen, BEAST_CROWN_COL, hawkMap, beastMap,
} from './sprites.js';

const OX = 8;                                 // world x 0 -> screen x 8
const FIELD_TOP = 29, FIELD_BOTTOM = 232;      // clip rows (exclusive bottom)

// [variant][frame]: variant 0 = the player, 1..3 = bounder, hunter, shadow lord
let riders = null, birds = null, hatchlings = null, eggSprite = null, lifeSprite = null;
let hawkUp = null, hawkDown = null, beastShut = null, beastOpen = null;

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
    hawkUp = make(RowsHawkUp, hawkMap(P)); hawkDown = make(RowsHawkDown, hawkMap(P));
    beastShut = make(RowsBeastShut, beastMap(P)); beastOpen = make(RowsBeastOpen, beastMap(P));
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
        this.cCave = pal.get('cave'); this.cHide = pal.get('hide'); this.cHideLight = pal.get('hideLight'); this.cBuzzard = pal.get('buzzard');
        this._view = null; this._viewOf = null;
    }

    // ================================================================ draw
    draw(sim, s, t) {
        build();
        const r = sim;
        s.noClip();
        s.clear(this.cSky);
        if (r == null || r.player == null) return;

        s.clip(OX, FIELD_TOP, FIELD_W, FIELD_BOTTOM - FIELD_TOP);
        this._drawCave(s, r);
        this._drawEmbers(s, t);
        this._drawLedges(s, r);
        if (r.beast != null) this._drawBeast(s, r, t);
        this._drawLava(s, t);
        this._drawBoil(s, r, t);
        this._drawEggs(s, r, t);
        for (const rv of r.rivals) this._drawRider(s, r, rv, t);
        this._drawRider(s, r, r.player, t);
        this._drawHand(s, r);
        if (r.beast != null) this._drawBeastFire(s, r, t);
        this._drawHawk(s, r, t);
        this._drawEffects(s, r);
        s.noClip();
        this._shake(s, r);

        this._drawHud(s, r, t);
        this._drawOverlays(s, r, t);
    }

    // ---------------------------------------------------------------- the cave
    // the cave's teeth hanging from the roof of the field, a different jaw for every wave
    _drawCave(s, r) {
        const seed = r.stageIdx * 977 + 13;
        for (let wx = 0; wx < FIELD_W; wx += 4) {
            const hv = hash(seed + (wx >> 2) * 31);
            const big = (hv % 7) === 0;
            const len = big ? 6 + hv % 9 : 1 + hv % 4;
            const w = big ? 4 : 3;
            for (let j = 0; j < len; j++) {
                const ww = Math.max(1, w - Math.trunc(j * w / len));
                s.rect(OX + wx + Math.trunc((4 - ww) / 2), FIELD_TOP + j, ww, 1, this.cCave);
            }
        }
    }

    // ---------------------------------------------------------------- stone
    // a ledge is exactly 6 px of stone (its rules thickness): a lit top edge, a bevel, pitted
    // block with seams, a dark underside, and a dark outline on its true ends. A ledge that is
    // going to fall cracks open from the middle out, black fissures through the stone.
    _drawLedges(s, r) {
        for (const L of r.ledges) {
            if (L.gone) continue;
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
            if (L.crack > 0) this._drawCracks(s, L, x0, x1, y);
        }
    }

    _drawCracks(s, L, x0, x1, y) {
        const w = x1 - x0;
        const n = 1 + Math.trunc(L.crack * 5);
        for (let i = 0; i < n; i++) {
            const hv = hash(Math.trunc(L.x0) * 7 + i * 131 + y);
            let cx = x0 + 2 + hv % Math.max(1, w - 4);
            for (let j = 0; j <= 5; j++) {
                s.setPixel(cx, y + j, this.cSky);
                if (L.crack > 0.55 && j > 0) s.setPixel(cx + 1, y + j, this.cStoneDark);
                cx += ((hv >> (j + 3)) & 1) === 0 ? -1 : 1;
                if (cx < x0) cx = x0; if (cx >= x1) cx = x1 - 1;
            }
        }
        // the last second: the top edge goes dark, it is about to go
        if (L.crack > 0.75) for (let x = x0; x < x1; x += 2) s.setPixel(x, y, this.cStone);
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
            const t9 = Math.trunc(t * 9), t6 = Math.trunc(t * 6), t4 = Math.trunc(t * 4);
            for (let y = crest + 1; y < FIELD_BOTTOM; y++) {
                let c = this.cLava;
                const d = y - ly;
                if (d >= 10) c = this.cLavaDark;
                else if (d >= 4 && ((wx + t9 + y * 5) % 13 === 0 || (wx - t6 + y * 3) % 17 === 0)) c = this.cLavaDark;
                else if (d <= 2 && (wx + t4) % 23 === 0) c = this.cLavaHot;
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

    // the telegraphs on the lava: it boils where the hand (or the beast) is about to come up
    _drawBoil(s, r, t) {
        if (r.hand === HandState.Warn) this._boilAt(s, r.handX, Math.min(1, r.handT / r.handWarn), 12, t);
        const b = r.beast;
        if (b != null && b.state === BeastState.Warn) this._boilAt(s, b.x, Math.min(1, b.t / 1.1), 26, t);
    }

    _boilAt(s, wx, u, spread, t) {
        const ly = Math.trunc(LAVA_Y);
        for (let k = -1; k <= 1; k++) {
            const x = OX + Math.round(wx) + k * FIELD_W;
            if (x < OX - spread - 4 || x > OX + FIELD_W + spread + 4) continue;
            const w = Math.round(spread * (0.5 + 0.5 * u));
            s.rect(x - w, ly - 1, w * 2 + 1, 2, this.cLavaHot);
            s.rect(x - Math.trunc(w / 2), ly - 2, w + 1, 1, this.cLava);
            for (let i = 0; i < 6; i++) {
                const ph = ((t * 2.6 + i * 0.37) % 1);
                const bx = x + Math.round((hash(i * 71 + Math.trunc(t * 2.6 + i * 0.37)) % (w * 2 + 1)) - w);
                const by = ly - 2 - Math.trunc(ph * (4 + u * 10));
                s.setPixel(bx, by, ph < 0.5 ? this.cLavaHot : this.cLava);
            }
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
            const left = e.hatchAt - e.age;
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
        if (rd.pair !== 0) {
            // a gladiator's pennant at its lance tip
            const sx = OX + Math.round(rd.x) - 9, sy = Math.round(rd.y) - 16;
            const tx = flip ? sx + 1 : sx + 15, d = flip ? 1 : -1;
            s.rect(tx, sy + 1, 3, 2, this.cEgg); s.setPixel(tx + 1 + d * 2, sy + 1, this.cEgg); s.setPixel(tx + 1, sy + 3, this.cEggDark);
        }
        if (rd.isPlayer && rd.wardT < 0.5) {
            // the mercy credit saved him: a ring of light, shrinking
            const rad = 14 - Math.trunc(rd.wardT * 12);
            s.circle(OX + Math.round(rd.x), Math.round(rd.y) - 8, rad, this.cRiderLight, false);
        }
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
        if (r.hand === HandState.Idle || r.hand === HandState.Warn || r.handReach <= 0) return;
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

    // ---------------------------------------------------------------- the cinder hawk
    _drawHawk(s, r, t) {
        const hk = r.hawk;
        if (hk.state === HawkState.Warn) {
            // the chevrons at the edge it will come from, at the height it will fly; the lane once it locks
            const y = Math.round(hk.y) - 5;
            const left = hk.dir > 0;
            const c = SurfaceDraw.blink(t, 2) ? this.cLavaHot : this.cLava;
            for (let i = 0; i < 2; i++) {
                const ax = left ? OX + 2 + i * 5 : OX + FIELD_W - 3 - i * 5;
                for (let j = 0; j < 4; j++) {
                    const dx = left ? j : -j;
                    s.setPixel(ax + dx, y - 3 + j, c); s.setPixel(ax + dx, y + 3 - j, c);
                    s.setPixel(ax + dx + (left ? 1 : -1), y - 3 + j, c); s.setPixel(ax + dx + (left ? 1 : -1), y + 3 - j, c);
                }
            }
            if (hk.t >= r.hawkWarn - r.hawkLock) {
                for (let x = OX + 14; x < OX + FIELD_W - 14; x += 4) s.setPixel(x, y, this.cLavaDark);
            }
            return;
        }
        if (hk.state !== HawkState.Pass) return;
        const spr = Math.trunc(hk.t * 9) % 2 === 0 ? hawkUp : hawkDown;
        const flip = hk.dir < 0;
        const sx = OX + Math.round(hk.x) - Math.trunc(spr.width / 2), sy = Math.round(hk.y) - spr.height - 1;
        // its trail: sparks shed behind it
        for (let i = 1; i <= 6; i++) {
            const tx = sx + Math.trunc(spr.width / 2) - hk.dir * (8 + i * 5);
            const ty = sy + 5 + ((hash(i * 17 + Math.trunc(hk.t * 20)) % 3) - 1);
            s.setPixel(tx, ty, i < 3 ? this.cLavaHot : i < 5 ? this.cLava : this.cLavaDark);
        }
        s.blit(spr, sx, sy, this.pal, 1, flip);
    }

    // ---------------------------------------------------------------- the pit beast
    _drawBeast(s, r, t) {
        const b = r.beast;
        if (b.state === BeastState.Dead || b.rise <= 0) return;
        const flip = b.facing < 0;
        const cy = Math.round(b.crownY);
        const cx = OX + Math.round(b.x);
        const open = b.attack !== BeastAttack.None && (b.atkStage === AtkStage.Tele || b.atkStage === AtkStage.Fire) || b.state === BeastState.Hurt || b.state === BeastState.Dying;
        const spr = open ? beastOpen : beastShut;
        const col = flip ? spr.width - 1 - BEAST_CROWN_COL : BEAST_CROWN_COL;
        const sx = cx - col, sy = cy;
        const ly = Math.trunc(LAVA_Y);
        // the neck: hide down into the lava, scales lit along its back, swaying a little as it breathes
        const ny0 = cy + HEAD_ROWS - 3;
        if (ny0 < ly + 2) {
            const span = Math.max(1, ly + 2 - ny0);
            for (let y = ny0; y < ly + 2; y++) {
                const u = (y - ny0) / span;
                const off = Math.round(2.5 * Math.sin(Math.PI * u) * Math.sin(t * 1.3));
                const nx0 = (flip ? cx - NECK_FRONT : cx - NECK_BACK) + off, nx1 = (flip ? cx + NECK_BACK : cx + NECK_FRONT) + off;
                s.rect(nx0, y, nx1 - nx0 + 1, 1, this.cHide);
                s.setPixel(flip ? nx1 : nx0, y, this.cHideLight);
                const row = y - ny0;
                if (row % 4 === 3) {
                    const o = (Math.trunc(row / 4) % 2) * 3;
                    for (let x = nx0 + 2 + o; x < nx1 - 1; x += 6) { s.setPixel(x, y, this.cHideLight); s.setPixel(x + 1, y + 1, this.cLavaDark); }
                }
            }
        }
        // the hump of its back breaking the lava round the neck, stone spines along the ridge
        const hh = Math.round(SHOULDER_H * b.rise);
        if (hh > 0) {
            for (let dx = -SHOULDER_HALF_W; dx <= SHOULDER_HALF_W; dx++) {
                const u = dx / SHOULDER_HALF_W;
                const top = ly + 1 - Math.round(hh * Math.sqrt(Math.max(0, 1 - u * u)));
                if (top > ly) continue;
                s.rect(cx + dx, top, 1, ly + 2 - top, this.cHide);
                s.setPixel(cx + dx, top, this.cHideLight);
                if ((dx + 40) % 7 === 0 && top < ly - 1) { s.setPixel(cx + dx, top - 1, this.cStone); s.setPixel(cx + dx, top - 2, this.cStoneLight); }
                if ((dx * 7 + 3) % 11 === 0) s.setPixel(cx + dx, top + 3, this.cLava);
            }
        }
        const dying = b.state === BeastState.Dying;
        if ((b.state === BeastState.Hurt && b.hurtT < 0.14) || (dying && Math.trunc(b.t * 4) % 2 === 0)) s.blitTinted(spr, sx, sy, dying ? this.cLavaHot : this.cWhite, 1, flip);
        else s.blit(spr, sx, sy, this.pal, 1, flip);
        // the crown, its weak point: the gem glows (gold / white at 1 Hz) while it can be struck
        if (!dying && b.state !== BeastState.Hurt && b.solid) {
            const c = SurfaceDraw.blink(t, 1) ? this.cWhite : this.cLavaHot;
            s.setPixel(cx, cy + 1, c); s.setPixel(cx - 1, cy + 1, c); s.setPixel(cx + 1, cy + 1, c); s.setPixel(cx, cy, c);
        }
        // the mouth: the throat glows as it gathers itself (SPIT) or draws breath (BREATH)
        if (b.attack !== BeastAttack.None && (b.atkStage === AtkStage.Tele || b.atkStage === AtkStage.Fire)) {
            const u = b.atkStage === AtkStage.Fire ? 1 : Math.min(1, b.atkT / 0.8);
            const c = u < 0.4 ? this.cLavaDark : u < 0.8 ? this.cLava : this.cLavaHot;
            const mx0 = flip ? cx - JAW_DX : cx + 6;
            s.rect(mx0, cy + MOUTH_DY, JAW_DX - 6, 2, c);
            if (b.attack === BeastAttack.Breath && b.atkStage === AtkStage.Tele) {
                // sparks drawn in toward its jaws
                for (let i = 0; i < 6; i++) {
                    const ph = 1 - ((b.atkT * 1.8 + i * 0.17) % 1);
                    const dist = 6 + ph * 44;
                    const ang = (hash(i * 53) % 100) / 100 * 1.6 - 0.8;
                    const px = cx + b.facing * (JAW_DX + Math.round(Math.cos(ang) * dist));
                    const py = cy + MOUTH_DY + Math.round(Math.sin(ang) * dist * 0.6);
                    s.setPixel(px, py, ph < 0.5 ? this.cLavaHot : this.cLava);
                }
            }
        }
    }

    _drawBeastFire(s, r, t) {
        const b = r.beast;
        if (b.jetOn && b.jetLen > 0) {
            const my = Math.round(b.mouthY);
            const x0 = OX + Math.round(b.x) + b.facing * JAW_DX;
            const len = Math.round(b.jetLen);
            for (let i = 0; i < len; i++) {
                const x = x0 + b.facing * i;
                const hv = hash(i * 13 + Math.trunc(t * 30));
                const flare = Math.min(JET_HALF_H, 1 + Math.trunc(i / 10)) + (hv % 2);
                s.rect(x, my - flare, 1, flare * 2 + 1, this.cLava);
                s.rect(x, my - Math.trunc(flare / 2), 1, Math.trunc(flare / 2) * 2 + 1, this.cLavaHot);
                if (hv % 5 === 0) s.setPixel(x, my - flare - 1, this.cLavaDark);
                if (hv % 7 === 0) s.setPixel(x, my + flare + 1, this.cLavaDark);
                if (i > len - 4 && hv % 2 === 0) s.setPixel(x, my, this.cWhite);
            }
        }
        for (const e of b.embers) {
            const x = OX + Math.round(e.x), y = Math.round(e.y);
            s.setPixel(x - Math.sign(e.vx), y + 2, this.cLavaDark);
            s.setPixel(x - Math.sign(e.vx), y + 1, this.cLava);
            s.rect(x - 1, y - 1, 3, 3, this.cLava);
            s.setPixel(x, y, this.cLavaHot);
            s.setPixel(x, y - 1, this.cLavaHot);
        }
    }

    // ---------------------------------------------------------------- effects
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
                case Fx.Debris: {
                    const sz = Math.max(1, f.size);
                    s.rect(x, y, sz, sz, f.size > 1 ? this.cStone : this.cStoneDark);
                    if (sz > 1) s.setPixel(x, y, this.cStoneLight);
                    break;
                }
                case Fx.Feather: {
                    const c = f.t < 0.5 ? this.cWhite : f.tier < 0 ? this.pal.get('steed') : this.cBuzzard;
                    const wig = Math.trunc(f.t * 4) % 2 === 0 ? 1 : 0;
                    s.setPixel(x, y, c); s.setPixel(x + f.facing, y - wig, c);
                    break;
                }
                case Fx.Spark: {
                    const rad = 2 + Math.trunc(f.t * 40);
                    const c = f.t < 0.1 ? this.cWhite : this.cLavaHot;
                    for (let k = 0; k < 8; k++) {
                        const a = k * Math.PI / 4 + 0.39;
                        s.setPixel(x + Math.round(Math.cos(a) * rad), y + Math.round(Math.sin(a) * rad), c);
                    }
                    s.setPixel(x, y, this.cWhite);
                    break;
                }
                case Fx.Blast: {
                    const u = f.t / f.life;
                    const rad = 2 + Math.trunc(u * 14);
                    s.circle(x, y, rad, u < 0.3 ? this.cWhite : u < 0.6 ? this.cLavaHot : this.cLava, false);
                    if (u < 0.5) s.circle(x, y, Math.max(1, rad - 3), this.cLava, true);
                    break;
                }
                case Fx.Popup:
                    if (f.text) s.textCenteredShadow(f.text, x, y - 4, arc, this.cEgg, this.cSky);
                    else s.textCentered(String(f.value), x, y - 4, arc, this.cEgg);
                    break;
            }
        }
    }

    // the blows land: the field jolts a pixel or three (inside the field only; the border stays black)
    _shake(s, r) {
        if (r.shakeT <= 0 || r.shakeAmp <= 0) return;
        const k = Math.min(1, r.shakeT * 4);
        const a = Math.max(1, Math.round(r.shakeAmp * k));
        const ph = Math.trunc(r.time * 60);
        const dx = ((hash(ph * 3 + 1) % (a * 2 + 1)) - a), dy = ((hash(ph * 7 + 5) % (a * 2 + 1)) - a);
        if (dx === 0 && dy === 0) return;
        if (this._viewOf !== s.data) { this._viewOf = s.data; this._view = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height); }
        const u = this._view, W = s.width, bg = this.cSky.packed;
        const x0 = OX, x1 = OX + FIELD_W, y0 = FIELD_TOP, y1 = FIELD_BOTTOM;
        if (dy > 0) for (let y = y1 - 1; y >= y0; y--) { const sy = y - dy; if (sy >= y0) u.copyWithin(y * W + x0, sy * W + x0, sy * W + x1); else u.fill(bg, y * W + x0, y * W + x1); }
        else if (dy < 0) for (let y = y0; y < y1; y++) { const sy = y - dy; if (sy < y1) u.copyWithin(y * W + x0, sy * W + x0, sy * W + x1); else u.fill(bg, y * W + x0, y * W + x1); }
        if (dx > 0) for (let y = y0; y < y1; y++) { const o = y * W; u.copyWithin(o + x0 + dx, o + x0, o + x1 - dx); u.fill(bg, o + x0, o + x0 + dx); }
        else if (dx < 0) for (let y = y0; y < y1; y++) { const o = y * W; u.copyWithin(o + x0, o + x0 - dx, o + x1); u.fill(bg, o + x1 + dx, o + x1); }
    }

    // ---------------------------------------------------------------- HUD
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cLava);
        s.text(d6(r.score), 28, 10, dsp, this.cWhite, 2);

        // lives: a rider icon and a big digit (it flashes white for 2 s when an extra rider comes)
        s.blit(lifeSprite, 130, 11, this.pal, 2, false);
        const extra = r.extraT < 2 && SurfaceDraw.blink(r.extraT, 2);
        s.text(String(Math.max(0, r.lives)), 149, 10, dsp, extra ? this.cWhite : this.cRiderLight, 2);

        let px = 172;
        if (r.beast != null) {
            // wave 7: the beast's crowns left (gold), the struck ones dark
            s.text('BEAST', px, 13, arc, this.cLava);
            px += 33;
            for (let i = 0; i < r.beast.maxHp; i++) {
                const c = i < r.beast.hp ? this.cEgg : this.cEggDark;
                s.rect(px, 14, 5, 4, c); s.setPixel(px, 13, c); s.setPixel(px + 2, 12, c); s.setPixel(px + 4, 13, c);
                px += 7;
            }
        } else {
            // what is left of the wave: a pip per rider (tier colour), then a pip per egg
            let shown = 0;
            for (const q of r.queue) { if (shown++ < 10) { s.rect(px, 12, 3, 6, this.cTier[q.tier]); px += 5; } }
            for (const rv of r.rivals) if (rv.active && shown++ < 10) { s.rect(px, 12, 3, 6, this.cTier[rv.tier]); s.setPixel(px + 1, 12, this.cWhite); px += 5; }
            for (const e of r.eggs) if (e.alive && shown++ < 12) { s.rect(px, 14, 3, 4, this.cEgg); px += 5; }
        }

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
        if (r.extraT < 1.8 && (r.p === Phase.Playing || r.p === Phase.Tally)) {
            s.plate(mid - 46, 36, 92, 15, this.cSky, this.cRiderLight);
            s.textCentered('EXTRA RIDER', mid, 40, arc, this.cRiderLight);
        }
        switch (r.p) {
            case Phase.Intro: this._stageCard(s, r, t); break;
            case Phase.Playing:
                if (r.player.mode === RiderMode.Spawning && SurfaceDraw.blink(t, 1)) this._youTag(s, r);
                break;
            case Phase.Dying:
                if (r.phaseTime > 0.35) {
                    s.textBox(r.deathCause, mid, 92, dsp, 2, this.cWhite, this.cLava, this.cSky);
                    const left = r.lives <= 0 ? 'NO RIDERS LEFT' : r.lives === 1 ? 'LAST RIDER' : r.lives + ' RIDERS LEFT';
                    const w = arc.measure(left) + 16;
                    s.plate(mid - Math.trunc(w / 2), 114, w, 15, this.cSky, this.cStoneDark);
                    s.textCentered(left, mid, 118, arc, r.lives <= 0 ? this.cLava : this.cRiderLight);
                }
                break;
            case Phase.Tally: this._tally(s, r); break;
            case Phase.Card:
            case Phase.Over: {
                const won = r.roundWon;
                s.textBox(won ? LanceRiderSpec.roundWonText : LanceRiderSpec.roundLostText, mid, 62, dsp, 3, won ? this.cEgg : this.cLava, won ? this.cEgg : this.cLava, this.cSky);
                s.plate(mid - 96, 92, 192, 64, this.cSky, this.cStoneDark);
                s.frame(mid - 94, 94, 188, 60, this.cStoneDark);
                s.textCentered('SCORE ' + d6(r.score), mid, 100, arc, this.cWhite, 2);
                s.textCentered(won ? 'ALL ' + STAGE_COUNT + ' WAVES RIDDEN' : 'FELL ON WAVE ' + r.wave + ' OF ' + STAGE_COUNT, mid, 120, arc, this.cStoneLight);
                s.textCentered('RIDERS ' + r.kills + '   EGGS ' + r.eggsTaken, mid, 131, arc, this.cStoneLight);
                s.textCentered(won ? 'THE PIT IS YOURS' : 'THE LAVA TAKES ALL', mid, 142, arc, won ? this.cRiderLight : this.cLava);
                break;
            }
        }
    }

    // the wave's card: its number, its name, the hint; the field and the riders arriving behind it
    _stageCard(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, mid = 160;
        const st = r.stage, boss = !!st.boss;
        const head = boss ? 'FINAL WAVE' : 'WAVE ' + r.wave;
        const plateH = r.mercyActive ? 100 : 88;
        s.plate(mid - 112, 52, 224, plateH, this.cSky, boss ? this.cLava : this.cStoneDark);
        s.frame(mid - 110, 54, 220, plateH - 4, boss ? this.cLavaDark : this.cStoneDark);
        const k = dsp.measure(head, 3) <= 204 ? 3 : 2;
        s.textCentered(head, mid + k, 62 + k, dsp, this.cLavaDark, k);
        s.textCentered(head, mid, 62, dsp, boss ? this.cLava : this.cWhite, k);
        s.textCentered(st.name, mid, 94, arc, this.cEgg, 2);
        s.dottedRule(mid - 80, mid + 80, 112, 3, this.cLavaDark);
        s.textCentered(st.hint, mid, 118, arc, this.cStoneLight);
        if (st.hint2) s.textCentered(st.hint2, mid, 128, arc, this.cRiderLight);
        if (r.mercyActive) s.textCentered('FREE RIDE', mid, 140, arc, this.cRiderLight);
        if (SurfaceDraw.blink(t, 1)) this._youTag(s, r);
    }

    // the tally after a wave: one row at a time, the bonuses in gold, a missed one struck dark
    _tally(s, r) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, mid = 160;
        const boss = !!r.stage.boss;
        const head = boss ? 'THE BEAST IS SLAIN' : 'WAVE ' + r.wave + ' CLEAR';
        const rows = r.tally;
        const h = 44 + rows.length * 12;
        const y0 = Math.max(40, 124 - Math.trunc(h / 2));
        s.plate(mid - 116, y0, 232, h, this.cSky, boss ? this.cEgg : this.cStoneDark);
        s.frame(mid - 114, y0 + 2, 228, h - 4, this.cStoneDark);
        const k = dsp.measure(head, 2) <= 216 ? 2 : 1;
        s.textCentered(head, mid, y0 + 9, dsp, boss ? this.cEgg : this.cWhite, k);
        for (let i = 0; i < r.tallyShown && i < rows.length; i++) {
            const row = rows[i], y = y0 + 32 + i * 12;
            const c = row.miss ? this.cLavaDark : row.special ? this.cEgg : this.cStoneLight;
            s.text(row.label, mid - 104, y, arc, c);
            let v;
            if (row.miss) v = row.miss;
            else if (row.count !== undefined && row.pts > 0) v = row.count + ' X ' + Math.trunc(row.pts / Math.max(1, row.count)) + '  ' + row.pts;
            else if (row.count !== undefined) v = String(row.count);
            else v = String(row.pts);
            s.textRight(v, mid + 104, y, arc, row.miss ? this.cLavaDark : row.pts > 0 ? this.cWhite : this.cStoneLight);
        }
    }

    _youTag(s, r) {
        const p = r.player;
        const x = OX + Math.round(p.x), y = Math.round(p.y) - 28;
        s.textCenteredShadow('YOU', x, y, PixelFont.Arcade, this.cRiderLight, this.cSky);
        s.rect(x, y + 9, 1, 2, this.cRiderLight);
    }
}
