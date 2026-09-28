// THE NODE · world 1 · TUNNEL RAT on the Cabinet Engine · THE PICTURE.
// Port of TunnelRatRenderer.cs from Staging/Batch2/tunnelrat.
//
// Laid out for a curved tube seen from 0.8 m: every actor is a chunky 16 x 16 sprite on a 16 px
// lattice, the earth fills the whole tube, and nothing sits in the 8 px margin.
//   HUD band   y 8..23: 1UP + the score in display digits x2, SCREEN n and a pip per pest left, the
//              lives as digger icons on the right
//   sky        y 24..39: tan, one flower per screen reached, the shaft mouth at the centre
//   earth      y 40..231: 19 x 12 tiles in four strata, a speckle per tile, a 1 px darker lip where
//              earth meets tunnel; tunnels are black
// Pests inflate as drawn circles (20, 24, 28 px) and pop in a burst; a ghost is its goggles and a 50 %
// dither of its body (the arcade's only transparency). A fire-lizard's wind-up glows at the mouth
// before the flame runs down the tunnel. Rocks wobble at 2.5 Hz (under the 3 Hz strobe floor), crumble
// by stepping through darker greys. Every blink is 1 Hz.
import { f32, idiv, roundEven, d6, PixelFont, PixelSprite, SurfaceDraw, Dir4 } from '../../sdk/index.js';
import { TunnelRatPalette, TunnelRatSpec } from './spec.js';
import { TunnelRatSim, TunnelField, RockState } from './sim.js';

const OX = 8, OY = 40;                   // earth origin on the tube
const SkyY = 24;
const T = TunnelField.Tile;
const Phase = TunnelRatSim.Phase, HoseState = TunnelRatSim.HoseState;

// ------------------------------------------------------------------ sprites (palette-indexed)
// 0 bg  1 sky/skin  2-5 dirt  6 orange  7 orangeDk  8 white  9 green  a greenDk
// b blue  c blueDk  d yellow  e grey  f greyDk
const DiggerTop = [
    '....dddddd......',
    '..ddddddddd.....',
    '.dddddddddd888..',
    '.dddddddddd888..',
    '.cccccccccccccc.',
    '..c1111111111...',
    '..c1111111001...',
    '..c11111110011..',
    '...111111111....',
    '..bbbbbbbbbb....',
    '.bbbbbbbbbb11eee',
    '.bbbbbbbbbbb1fef',
    '..bbbbbbbbbb....',
];
const DiggerLegsA = [
    '...bbbb.bbbb....',
    '...cccc.cccc....',
    '..ccccc.ccccc...',
];
const DiggerLegsB = [
    '..bbbb...bbbb...',
    '.cccc.....cccc..',
    'ccccc.....ccccc.',
];

function join(top, legs) { return PixelSprite.fromRows(...top, ...legs); }

// facing right -> facing up (the front turns to the top)
function rotCCW(a) {
    const b = new PixelSprite(a.height, a.width);
    for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
            const v = a.at(x, y);
            if (v >= 0) b.set(y, a.width - 1 - x, v);
        }
    return b;
}

// facing right -> facing down
function rotCW(a) {
    const b = new PixelSprite(a.height, a.width);
    for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
            const v = a.at(x, y);
            if (v >= 0) b.set(a.height - 1 - y, x, v);
        }
    return b;
}

const DigR0 = join(DiggerTop, DiggerLegsA);
const DigR1 = join(DiggerTop, DiggerLegsB);
const DigU0 = rotCCW(DigR0), DigU1 = rotCCW(DigR1);
const DigD0 = rotCW(DigR0), DigD1 = rotCW(DigR1);

const Bug0 = PixelSprite.fromRows(
    '......6666......',
    '....66666666....',
    '...6666666666...',
    '..677777777776..',
    '.67888877888876.',
    '.67880077880076.',
    '.67880077880076.',
    '.67888877888876.',
    '.66777766777766.',
    '.66666666666666.',
    '.66666666666666.',
    '..666666666666..',
    '...6666666666...',
    '....66666666....',
    '...777....777...',
    '..7777....7777..');
const Bug1 = PixelSprite.fromRows(
    '......6666......',
    '....66666666....',
    '...6666666666...',
    '..677777777776..',
    '.67888877888876.',
    '.67880077880076.',
    '.67880077880076.',
    '.67888877888876.',
    '.66777766777766.',
    '.66666666666666.',
    '.66666666666666.',
    '..666666666666..',
    '...6666666666...',
    '....66666666....',
    '.....777777.....',
    '....7777.7777...');

const Liz0 = PixelSprite.fromRows(
    '................',
    '..aa......9999..',
    '.aaaa....999999.',
    '.aaaaa..99999889',
    '..aaaa.999999809',
    '...aa99999999999',
    '....999999999999',
    '...9999999997777',
    '..99999999999966',
    '.999999999999...',
    '.999999999999...',
    '99.9999999999...',
    '9...999...999...',
    '....999...999...',
    '...aaaa..aaaa...',
    '................');
const Liz1 = PixelSprite.fromRows(
    '................',
    '..aa......9999..',
    '.aaaa....999999.',
    '.aaaaa..99999889',
    '..aaaa.999999809',
    '...aa99999999999',
    '....999999999999',
    '...9999999997777',
    '..99999999999966',
    '.999999999999...',
    '.999999999999...',
    '99.9999999999...',
    '9..999.....999..',
    '..999.......999.',
    '..aaaa.....aaaa.',
    '................');

const RockSp = PixelSprite.fromRows(
    '................',
    '.....ffffff.....',
    '...ffeeeeeeff...',
    '..feeeeeeeeeef..',
    '.fee88eeeeeeeef.',
    '.fe8eeeeeeeeeef.',
    'feeeeeeeeeefeeef',
    'feeeeeeeeeefeeef',
    'feeeeeeeeeeeeeef',
    'feeeeeefeeeeeeef',
    'feeeeeefeeeeeeef',
    'feeeeeeeeeeeeeff',
    '.feeeeeeeeeeeef.',
    '.ffeeeeeeeeeeff.',
    '..ffffffffffff..',
    '................');
const CrackSp = PixelSprite.fromRows(
    '................',
    '................',
    '.......0........',
    '.......00.......',
    '........0.......',
    '.......00.......',
    '......00........',
    '......0.........',
    '.......00.......',
    '........00......',
    '.........0......',
    '................');

const Carrot = PixelSprite.fromRows(
    '.....9....9.....',
    '....9a9..9a9....',
    '.....9a99a9.....',
    '......aa9a......',
    '....66666666....',
    '...6667666666...',
    '....666666766...',
    '....66666666....',
    '.....6766666....',
    '.....666666.....',
    '......66676.....',
    '......6666......',
    '.......676......',
    '.......66.......',
    '........6.......',
    '................');

const Flower = PixelSprite.fromRows(
    '..888..',
    '.88d88.',
    '.8ddd8.',
    '.88d88.',
    '..888..',
    '...9...',
    '.a.9...',
    '..a9.a.',
    '...9a..',
    '...9...');

const DirtIdx = ['dirt1', 'dirt2', 'dirt3', 'dirt4'];
const SpeckIdx = ['dirt2', 'dirt3', 'dirt4', 'dirt3'];
const LipIdx = ['dirt2', 'dirt3', 'dirt4', 'dirt3'];
// the speckle: the same few dashes in every tile, shifted per stratum
const Specks = [[2, 3], [10, 1], [6, 8], [13, 10], [1, 13], [9, 13]];

export class TunnelRatRenderer {
    constructor() {
        const pal = TunnelRatPalette;
        this.pal = pal;
        this.cBg = pal.get('bg'); this.cSky = pal.get('sky'); this.cWhite = pal.get('white');
        this.cOrange = pal.get('orange'); this.cOrangeDk = pal.get('orangeDk');
        this.cGreen = pal.get('green'); this.cGreenDk = pal.get('greenDk');
        this.cBlue = pal.get('blue'); this.cBlueDk = pal.get('blueDk');
        this.cYellow = pal.get('yellow'); this.cGrey = pal.get('grey'); this.cGreyDk = pal.get('greyDk');
        this.cDirt = []; this.cSpeck = []; this.cLip = [];
        for (let i = 0; i < 4; i++) { this.cDirt[i] = pal.get(DirtIdx[i]); this.cSpeck[i] = pal.get(SpeckIdx[i]); this.cLip[i] = pal.get(LipIdx[i]); }
    }

    // ------------------------------------------------------------------ the frame
    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.field == null) return;
        const P = r.p;

        this._drawHud(s, r, t);
        this._drawSky(s, r);
        this._drawEarth(s, r.field);

        s.clip(OX, OY, TunnelField.PxW, TunnelField.PxH);
        for (const rk of r.rocks) this._drawRock(s, rk, r);
        if (r.vegActive && (r.vegT < f32(r.vegSeconds - f32(3)) || SurfaceDraw.blink(r.vegT, 1)))
            s.blit(Carrot, OX + r.StartCol * T, OY + r.StartRow * T, this.pal);
        for (const p of r.pests) this._drawPest(s, p, r, t);
        for (const p of r.pests) if (p.alive && p.breath > 0) this._drawFire(s, p, r);
        this._drawHose(s, r);
        this._drawDigger(s, r, t);
        // points floating up where a pest died, and the carrot's 400
        for (const p of r.pests)
            if (!p.alive && p.deadT > f32(0.25) && p.deadT < f32(1.4) && p.popPoints > 0)
                s.textCenteredShadow(String(p.popPoints), OX + Math.trunc(p.x) + 8, OY + Math.trunc(p.y) + 4 - Math.trunc(f32(p.deadT * 6)), PixelFont.Arcade, this.cWhite, this.cBg);
        if (r.vegTakenT >= 0 && r.time - r.vegTakenT < f32(1.2))
            s.textCenteredShadow('400', OX + r.StartCol * T + 8, OY + r.StartRow * T + 4, PixelFont.Arcade, this.cYellow, this.cBg);
        s.noClip();

        this._drawOverlays(s, r, t);
    }

    // ------------------------------------------------------------------ HUD + sky
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 12, arc, this.cOrange);
        s.text(d6(Math.min(999999, r.score)), 28, 9, dsp, this.cWhite, 2);
        // centre: SCREEN n and one pip per pest still alive (orange bug, green lizard)
        s.textCentered('SCREEN ' + r.screen, 176, 8, arc, this.cYellow);
        const n = r.pests.length, x0 = 176 - idiv(n * 8 - 2, 2);
        for (let i = 0; i < n; i++) {
            const p = r.pests[i];
            const c = p.lizard ? this.cGreen : this.cOrange;
            if (p.alive) s.rect(x0 + i * 8, 18, 6, 6, c);
            else s.frame(x0 + i * 8, 18, 6, 6, p.lizard ? this.cGreenDk : this.cOrangeDk);
        }
        // right: a digger per life
        for (let i = 0; i < r.lives && i < 5; i++) s.blit(DigR0, 296 - i * 18, 8, this.pal);
    }

    _drawSky(s, r) {
        s.rect(OX, SkyY, TunnelField.PxW, 16, this.cSky);
        // the shaft mouth over the centre column
        const mx = OX + r.StartCol * T;
        s.rect(mx + 2, SkyY + 12, 12, 4, this.cBg);
        s.rect(mx + 4, SkyY + 11, 8, 1, this.cBg);
        // a flower per screen reached, right-hand side
        for (let i = 0; i < r.screen; i++) s.blit(Flower, OX + TunnelField.PxW - 12 - i * 11, SkyY + 5, this.pal);
    }

    _drawEarth(s, f) {
        for (let ty = 0; ty < TunnelField.H; ty++) {
            const st = TunnelField.stratum(ty);
            const dirt = this.cDirt[st], speck = this.cSpeck[st], lip = this.cLip[st];
            for (let tx = 0; tx < TunnelField.W; tx++) {
                const px0 = OX + tx * T, py0 = OY + ty * T;
                for (let j = 0; j < 4; j++)
                    for (let i = 0; i < 4; i++) {
                        const sx = tx * 4 + i, sy = ty * 4 + j;
                        if (f.dug(sx, sy)) continue;
                        s.rect(px0 + i * 4, py0 + j * 4, 4, 4, dirt);
                    }
                // the speckle
                for (let k = 0; k < Specks.length; k++) {
                    const sxp = (Specks[k][0] + st * 3) % 15, syp = (Specks[k][1] + st * 2) % 15;
                    const sx = tx * 4 + idiv(sxp, 4), sy = ty * 4 + idiv(syp, 4);
                    const sx2 = tx * 4 + idiv(sxp + 1, 4);
                    if (f.dug(sx, sy) || f.dug(sx2, sy)) continue;
                    s.rect(px0 + sxp, py0 + syp, 2, 1, speck);
                }
                // the lip where earth meets tunnel
                for (let j = 0; j < 4; j++)
                    for (let i = 0; i < 4; i++) {
                        const sx = tx * 4 + i, sy = ty * 4 + j;
                        if (f.dug(sx, sy)) continue;
                        const x = px0 + i * 4, y = py0 + j * 4;
                        if (f.dug(sx - 1, sy)) s.rect(x, y, 1, 4, lip);
                        if (f.dug(sx + 1, sy)) s.rect(x + 3, y, 1, 4, lip);
                        if (f.dug(sx, sy - 1)) s.rect(x, y, 4, 1, lip);
                        if (f.dug(sx, sy + 1)) s.rect(x, y + 3, 4, 1, lip);
                    }
            }
        }
        // round the tunnel's inside corners: a dug cell with earth on two sides loses its corner pixels
        for (let sy = 0; sy < TunnelField.SH; sy++)
            for (let sx = 0; sx < TunnelField.SW; sx++) {
                if (!f.dug(sx, sy)) continue;
                const x = OX + sx * 4, y = OY + sy * 4;
                const lip = this.cLip[TunnelField.stratum(idiv(sy, 4))];
                const up = !f.dug(sx, sy - 1) && f.inSub(sx, sy - 1), dn = !f.dug(sx, sy + 1) && f.inSub(sx, sy + 1);
                const lf = !f.dug(sx - 1, sy) && f.inSub(sx - 1, sy), rt = !f.dug(sx + 1, sy) && f.inSub(sx + 1, sy);
                if (up && lf) s.setPixel(x, y, lip);
                if (up && rt) s.setPixel(x + 3, y, lip);
                if (dn && lf) s.setPixel(x, y + 3, lip);
                if (dn && rt) s.setPixel(x + 3, y + 3, lip);
            }
    }

    // ------------------------------------------------------------------ actors
    _drawRock(s, rk, r) {
        const x = OX + Math.trunc(roundEven(rk.x)), y = OY + Math.trunc(roundEven(rk.y));
        switch (rk.state) {
            case RockState.Rest:
                s.blit(RockSp, x, y, this.pal);
                if (rk.cracked) s.blit(CrackSp, x, y, this.pal);
                break;
            case RockState.Wobble: {
                let off = (Math.trunc(f32(rk.t * 5)) & 1) === 0 ? -1 : 1;     // 2.5 Hz
                if (r.underRock(rk)) off = (Math.trunc(f32(r.time * 5)) & 1) === 0 ? -1 : 1;
                s.blit(RockSp, x + off, y, this.pal);
                if (rk.cracked) s.blit(CrackSp, x + off, y, this.pal);
                break;
            }
            case RockState.Fall:
                s.blit(RockSp, x, y, this.pal);
                if (rk.cracked) s.blit(CrackSp, x, y, this.pal);
                break;
            case RockState.Crumble: {
                // four chunks that part and step down through the greys
                const k = f32(rk.t / r.crumbleSeconds);
                const spread = Math.trunc(f32(k * 6));
                const c1 = k < f32(0.5) ? this.cGrey : this.cGreyDk, c2 = k < f32(0.5) ? this.cGreyDk : this.cDirt[3];
                for (let q = 0; q < 4; q++) {
                    const qx = (q & 1) === 0 ? -1 : 1, qy = (q & 2) === 0 ? -1 : 1;
                    const cx = x + 8 + qx * (3 + spread), cy = y + 9 + qy * 2 + Math.trunc(f32(k * 4));
                    const sz = k < f32(0.5) ? 6 : 4;
                    s.rect(cx - idiv(sz, 2), cy - idiv(sz, 2), sz, sz, c2);
                    s.rect(cx - idiv(sz, 2), cy - idiv(sz, 2), sz - 1, sz - 1, c1);
                }
                break;
            }
        }
    }

    _drawPest(s, p, r, t) {
        const x = OX + Math.trunc(roundEven(p.x)), y = OY + Math.trunc(roundEven(p.y));
        const flip = p.face === Dir4.Left;
        if (!p.alive) {
            if (p.death === 1 && p.deadT < f32(0.45)) this._drawPop(s, x + 8, y + 8, p.deadT, p.lizard);
            else if (p.death === 2 && p.deadT < f32(0.6)) {
                // flattened under the rock
                const c = p.lizard ? this.cGreen : this.cOrange, d = p.lizard ? this.cGreenDk : this.cOrangeDk;
                s.rect(x - 1, y + 11, 18, 5, d);
                s.rect(x, y + 12, 16, 3, c);
                s.rect(x + 4, y + 12, 3, 2, this.cWhite); s.rect(x + 9, y + 12, 3, 2, this.cWhite);
            }
            return;
        }
        if (p.ghost || p.reform > f32(r.reformSeconds * f32(0.5))) { this._drawGhost(s, p, x, y); return; }
        if (p.stage > 0) { this._drawInflated(s, p, x + 8, y + 8, p.stage, r.pumpPhase, flip); return; }
        const frame = Math.trunc(p.walk / 5.0) & 1;
        if (p.lizard) s.blit(frame === 0 ? Liz0 : Liz1, x, y, this.pal, 1, flip);
        else s.blit(frame === 0 ? Bug0 : Bug1, x, y, this.pal, 1, flip);
        if (p.lizard && p.breath === 1) {
            // the wind-up: a glow at the mouth that swells until the flame comes
            const k = Math.min(1, f32(p.breathT / Math.max(f32(0.05), r.fireWindup)));
            const mx = flip ? x - 1 : x + 14, my = y + 8;
            const g = 2 + Math.trunc(f32(k * 3));
            s.rect(mx - idiv(g, 2) + (flip ? 0 : 1), my - idiv(g, 2), g + 1, g + 1, this.cOrange);
            s.rect(mx - idiv(g, 2) + (flip ? 1 : 2), my - idiv(g, 2) + 1, Math.max(1, g - 1), Math.max(1, g - 1), this.cYellow);
        }
    }

    _drawGhost(s, p, x, y) {
        // goggles solid, the body a 50 % dither
        const sp = p.lizard ? Liz0 : Bug0;
        const flip = p.face === Dir4.Left;
        const body = p.lizard ? 9 : 6;
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                const v = sp.at(flip ? sp.width - 1 - i : i, j);
                if (v < 0) continue;
                const solid = v === 8 || v === 0 || (!p.lizard && v === 7 && j >= 3 && j <= 8);
                if (!solid && ((x + i + y + j) & 1) !== 0) continue;
                if (!solid && v !== body && v !== 10 && v !== 7) continue;
                s.setPixel(x + i, y + j, this.pal.get(v));
            }
    }

    _drawInflated(s, p, cx, cy, stage, pump, flip) {
        let R = 8 + 2 * stage;                       // 10, 12, 14: 20-28 px across
        if (p.hooked && pump > f32(0.8)) R += 1;      // the swell of the next stroke
        const body = p.lizard ? this.cGreen : this.cOrange, rim = p.lizard ? this.cGreenDk : this.cOrangeDk;
        s.circle(cx, cy, R, rim, true);
        s.circle(cx, cy, R - 2, body, true);
        // a shine
        s.rect(cx - idiv(R, 2), cy - idiv(R, 2) - 1, 3, 2, this.cWhite);
        const e = 2 + idiv(stage, 2);                 // goggle radius
        const dir = flip ? -1 : 1;
        if (p.lizard) {
            // wings on top, one big eye, the mouth pulled wide
            s.rect(cx - R + 2, cy - R - 1, 6, 4, this.cGreenDk);
            s.circle(cx + dir * idiv(R, 2), cy - idiv(R, 3), e + 1, this.cWhite, true);
            s.rect(cx + dir * idiv(R, 2) + dir * 1 - 1, cy - idiv(R, 3) - 1, 2, 3, this.cBg);
            s.rect(cx + dir * idiv(R, 3) - 3, cy + idiv(R, 3), 8, 2, this.cOrangeDk);
        } else {
            const gy = cy - idiv(R, 3);
            s.rect(cx - R + 2, gy - 1, 2 * R - 3, 3, this.cOrangeDk);   // the goggle strap
            s.circle(cx - idiv(R, 3) - 1, gy, e + 1, this.cOrangeDk, true);
            s.circle(cx + idiv(R, 3) + 1, gy, e + 1, this.cOrangeDk, true);
            s.circle(cx - idiv(R, 3) - 1, gy, e, this.cWhite, true);
            s.circle(cx + idiv(R, 3) + 1, gy, e, this.cWhite, true);
            s.rect(cx - idiv(R, 3) - 1 + dir, gy - 1, 2, 2, this.cBg);
            s.rect(cx + idiv(R, 3) + 1 + dir, gy - 1, 2, 2, this.cBg);
            // little feet sticking out
            s.rect(cx - idiv(R, 2) - 1, cy + R - 2, 4, 3, this.cOrangeDk);
            s.rect(cx + idiv(R, 2) - 2, cy + R - 2, 4, 3, this.cOrangeDk);
        }
        if (stage >= 3) {
            // strain marks
            s.rect(cx - R - 3, cy - 1, 2, 2, this.cWhite);
            s.rect(cx + R + 2, cy - 1, 2, 2, this.cWhite);
        }
    }

    _drawPop(s, cx, cy, dt, lizard) {
        const k = f32(dt / f32(0.45));
        const rad = 10 + Math.trunc(f32(k * 16));
        const body = lizard ? this.cGreen : this.cOrange;
        if (k < f32(0.35)) s.circle(cx, cy, 14, this.cWhite, true);
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6 + 0.2;
            const bx = cx + Math.trunc(Math.cos(a) * rad), by = cy + Math.trunc(Math.sin(a) * rad);
            s.rect(bx - 2, by - 2, 4, 4, (i & 1) === 0 ? body : this.cWhite);
        }
        if (k >= f32(0.35)) s.circle(cx, cy, rad - 4, this.cWhite, false);
    }

    _drawFire(s, p, r) {
        if (p.breath !== 2 || p.fireLen < 1) return;
        const len = Math.trunc(p.fireLen);
        const left = p.face === Dir4.Left;
        const x0 = OX + Math.trunc(roundEven(p.x)) + (left ? 0 : T), cy = OY + Math.trunc(roundEven(p.y)) + 8;
        for (let i = 0; i < len; i++) {
            // a tongue that swells then tapers, with jagged edges
            const u = f32(i / Math.max(1, len));
            const inner = Math.min(f32(1), f32(f32(u * f32(1.3)) + f32(0.15)));
            const sinVal = f32(Math.sin(inner * Math.PI * 0.95));
            let h = 4 + Math.trunc(f32(6 * sinVal));
            h += (idiv(i, 3) & 1) === 0 ? 1 : 0;
            const x = left ? x0 - 1 - i : x0 + i;
            s.rect(x, cy - idiv(h, 2) - 1, 1, h + 2, this.cOrange);
            if (h > 3) s.rect(x, cy - idiv(h, 2) + 1, 1, h - 2, this.cYellow);
            if (h > 7 && u < f32(0.7)) s.rect(x, cy - 1, 1, 2, this.cWhite);
        }
    }

    _drawHose(s, r) {
        if (r.hose === HoseState.None || r.p !== Phase.Play) return;
        const len = Math.trunc(roundEven(r.hoseLen));
        const dx = Dir4.dx(r.hoseDir), dy = Dir4.dy(r.hoseDir);
        const x0 = OX + Math.trunc(roundEven(r.dx)) + 8, y0 = OY + Math.trunc(roundEven(r.dy)) + 8;
        const sx = x0 + dx * 8, sy = y0 + dy * 8;               // the nozzle at the front edge
        const ex = sx + dx * len, ey = sy + dy * len;
        if (dx !== 0) s.rect(Math.min(sx, ex), sy - 1, Math.abs(ex - sx) + 1, 2, this.cWhite);
        else s.rect(sx - 1, Math.min(sy, ey), 2, Math.abs(ey - sy) + 1, this.cWhite);
        // the tip
        s.rect(ex - 2, ey - 2, 4, 4, this.cWhite);
        s.rect(ex - 1, ey - 1, 2, 2, this.cGrey);
        // a pump stroke travelling down the hose
        if (r.hose === HoseState.Hooked && len > 4) {
            const k = Math.trunc(f32(r.pumpPhase * len));
            const bx = sx + dx * k, by = sy + dy * k;
            s.rect(bx - 2, by - 2, 4, 4, this.cWhite);
        }
    }

    _drawDigger(s, r, t) {
        const x = OX + Math.trunc(roundEven(r.dx)), y = OY + Math.trunc(roundEven(r.dy));
        if (r.p === Phase.Death) {
            const k = r.phaseTime;
            if (r.deathCause === 3) {
                // flattened by the rock
                if (k < f32(1.4)) {
                    s.rect(x, y + 11, 16, 5, k < f32(0.7) ? this.cBlue : this.cBlueDk);
                    s.rect(x + 1, y + 10, 6, 2, this.cYellow);
                    s.rect(x + 11, y + 12, 3, 2, this.cWhite);
                }
                return;
            }
            if (k < f32(0.9)) {
                // a spin: the four facings, 4 a second
                const f = Math.trunc(f32(k * 4)) & 3;
                const sp = f === 0 ? DigR0 : f === 1 ? DigD0 : f === 2 ? DigR0 : DigU0;
                s.blit(sp, x, y, this.pal, 1, f === 2);
                if (r.deathCause === 2 && k < f32(0.5)) { s.rect(x + 2, y - 2, 3, 3, this.cOrange); s.rect(x + 11, y - 1, 3, 3, this.cYellow); }
            } else if (k < f32(1.5)) {
                // flat out, stepping down to dark blue
                const c = k < f32(1.2) ? this.cBlue : this.cBlueDk;
                s.rect(x + 1, y + 9, 14, 6, c);
                s.rect(x + 3, y + 7, 5, 3, this.cYellow);
                s.rect(x + 12, y + 10, 3, 3, this.cSky);
            }
            return;
        }
        if (r.p === Phase.Card || r.p === Phase.Over)
            if (!r.roundWon) return;
        const frame = r.diggerMoving ? Math.trunc(r.diggerWalk / 5.0) & 1 : 0;
        const d = r.hose !== HoseState.None ? r.hoseDir : r.facing;
        let spr, flip = false;
        switch (d) {
            case Dir4.Up: spr = frame === 0 ? DigU0 : DigU1; break;
            case Dir4.Down: spr = frame === 0 ? DigD0 : DigD1; break;
            case Dir4.Left: spr = frame === 0 ? DigR0 : DigR1; flip = true; break;
            default: spr = frame === 0 ? DigR0 : DigR1; break;
        }
        s.blit(spr, x, y, this.pal, 1, flip);
        // earth flying off the blade while it digs
        if (r.diggerDigging && r.p === Phase.Play) {
            const st = TunnelField.stratumAtPx(r.dy);
            const c = this.cDirt[st];
            const ph = Math.trunc(r.diggerWalk / 3.0) & 1;
            const fx = x + 8 + Dir4.dx(d) * 9, fy = y + 8 + Dir4.dy(d) * 9;
            const px = Dir4.dy(d) !== 0 ? 5 : 0, py = Dir4.dx(d) !== 0 ? 5 : 0;
            s.rect(fx - 1 + (ph === 0 ? px : -px), fy - 1 + (ph === 0 ? py : -py), 2, 2, c);
            s.rect(fx - 1 - idiv(ph === 0 ? px : -px, 2), fy - 1 - idiv(ph === 0 ? py : -py, 2), 2, 2, c);
        }
    }

    // ------------------------------------------------------------------ overlays
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + Math.trunc(TunnelField.PxH / 2);
        switch (r.p) {
            case Phase.Ready: {
                s.plate(midX - 74, midY - 34, 148, r.mercyActive ? 70 : 58, this.cBg, this.cOrange);
                s.frame(midX - 72, midY - 32, 144, (r.mercyActive ? 70 : 58) - 4, this.cOrange);
                s.textCentered('SCREEN ' + r.screen, midX, midY - 26, dsp, this.cYellow, 2);
                s.textCentered('PLAYER 1', midX, midY - 6, arc, this.cWhite);
                if (SurfaceDraw.blink(f32(r.phaseTime + f32(0.25)), 1) || r.phaseTime > f32(r.readyLength - f32(0.5)))
                    s.textCentered('GET READY', midX, midY + 6, arc, this.cOrange, 2);
                if (r.mercyActive) s.textCentered('FREE DIG', midX, midY + 24, arc, this.cSky);
                break;
            }
            case Phase.Clear:
                if (r.phaseTime > f32(0.5)) {
                    s.textBox('SCREEN ' + r.screen, midX, midY - 22, dsp, 2, this.cYellow, this.cOrange, this.cBg);
                    s.textBox('CLEAR!', midX, midY + 6, dsp, 3, this.cWhite, this.cOrange, this.cBg);
                }
                break;
            case Phase.Death:
                if (r.phaseTime > f32(1.0) && r.lives > 0) {
                    const lv = r.lives === 1 ? '1 DIGGER LEFT' : r.lives + ' DIGGERS LEFT';
                    s.textBox(lv, midX, midY - 4, arc, 1, this.cWhite, this.cBlue, this.cBg);
                }
                break;
            case Phase.Card:
            case Phase.Over: {
                const spec = TunnelRatSpec;
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 30, dsp, 3, won ? this.cYellow : this.cOrange, this.cOrange, this.cBg);
                s.plate(midX - 84, midY + 2, 168, 46, this.cBg, this.cOrange);
                s.textCentered('SCORE ' + d6(r.score), midX, midY + 8, arc, this.cWhite, 2);
                s.textCentered(won ? 'BOTH SCREENS CLEAR' : 'SCREEN ' + r.screen + '  PESTS LEFT ' + r.pestsLeft, midX, midY + 30, arc, this.cYellow);
                break;
            }
        }
    }
}
