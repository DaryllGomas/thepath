// THE NODE · world 1 · CASTLE CRUSH · THE PICTURE.
// Began as a port of CastleCrushRenderer.cs; built out 2026-10-18 for the six-castle campaign.
//
// A 1981 raster board, palette-limited, inside the 8 px safe area:
//   - HUD band y 8..27: 1UP + the score in big display digits (gold), CASTLE and its number in the
//     middle (on the citadel: the ENGINE's gauge), STONES and a stone icon per stone in hand on the
//     right (gold while an extra one has just come), a red dotted rule under it all
//   - the field x 13..306, y 32..231 between two stone pillars, each castle under its own sky: the
//     Border Fort at dusk, the River Keep over its moat, the Mountain Hold among snow peaks, the
//     Night Siege under a moon (black, but for what torches, fire and the stone light), the
//     Wizard's Tower under a violet aurora, the Black Citadel against an ember sky
//   - the castle: 14 x 6 courses of 21 x 14 px blocks on black mortar. Grey stone (lit top-left, shaded
//     bottom-right), red brick on cream mortar (cracked at one hit left), iron-banded plates with
//     gold rivets, the iron gate, the wooden palisade, the treasury's gold, torches, glowing runes,
//     and living rock; a gold diamond marks a block that holds a power-up; a loose piece shudders
//   - the banner on the keep's highest block (in a rubble pile once the keep is levelled); when the
//     castle is taken it tips over and drops to the grass
//   - the defences: archers rise, draw (the telegraph), loose, sink; the portcullis's bars rise into
//     the gatehouse and drop again (they shake first); a ballista swings to the cart and its dotted
//     sight line goes solid when it locks; the sorcerer blinks in on a battlement, his staff glows and
//     the cells he will regrow show as violet outlines; the warlord's engine (its arm cranks back
//     before every throw, its furnace door opens and shuts) behind its sliding shield wall
//   - the catapult cart: a red beam with gold rivets on an A-frame and two black wheels; the
//     throwing arm flicks up for a moment on every launch and rebound; the stone rides a cup while
//     it waits for A; what strikes the beam stays stuck in it through the beat
//   - THE MARCH between castles: a little map, the road, the six castles, the cart rolling on
//   - no strobes: every blink is 1 Hz; hit flashes are single frames of lighter stone; a heavy blow
//     shakes the field a pixel or two
import { d6, roundEven, PixelFont, PixelSprite, SurfaceDraw } from '../../sdk/index.js';
import { CastleCrushPalette, CastleCrushSpec } from './spec.js';
import { CastleCrushRound } from './round.js';
import { MapSpots } from './stages.js';

const R = CastleCrushRound;
const Phase = R.Phase, Kind = R.Kind, Power = R.Power, Cause = R.Cause, Shot = R.Shot;
const FL = R.FieldL, FR = R.FieldR, FT = R.FieldT, FB = R.FieldB;
const CellW = R.CellW, CellH = R.CellH;
const STAGES = R.Stages;

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
const StoneFireSprite = PixelSprite.fromRows(
    '..888..',
    '.8jjj8.',
    '8j5jjj8',
    '8jjjjj8',
    '8jj6jj8',
    '.8j6j8.',
    '..888..');
const StoneIcon = PixelSprite.fromRows(
    '..333..',
    '.32223.',
    '3242223',
    '3222223',
    '3222223',
    '.32223.',
    '..333..');
const StoneIconGold = PixelSprite.fromRows(
    '..888..',
    '.89998.',
    '8959998',
    '8999998',
    '8999998',
    '.89998.',
    '..888..');
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
const ArcherFireSprite = PixelSprite.fromRows(
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
    '...j8j...');
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
const FireArrowSprite = PixelSprite.fromRows(
    '6...6',
    '.6.6.',
    '..6..',
    '..5..',
    '..5..',
    '..5..',
    '..5..',
    '.j8j.',
    'j888j',
    '.j8j.',
    '..j..');
const SorcererSprite = PixelSprite.fromRows(
    '....8....',
    '...hhh...',
    '..hhhhh..',
    '.iiiiiii.',
    '...555..8',
    '...1i1..e',
    '..hhhhh.e',
    '.hhh8hhhe',
    '.hhhhhhhe',
    '.hhihihh.',
    '.hhhhhhh.',
    '..hh.hh..',
    '..ii.ii..');
const HexSprite = PixelSprite.fromRows(
    '.ihi.',
    'ihhhi',
    'hh5hh',
    'ihhhi',
    '.ihi.');
const PotSprite = PixelSprite.fromRows(
    '.181.',
    '1jjj1',
    'j8jjj',
    '1jjj1',
    '.111.');
const MoonSprite = PixelSprite.fromRows(
    '...5555...',
    '..555555..',
    '.55545555.',
    '5555555455',
    '5545555555',
    '5555555555',
    '5555545555',
    '.55555555.',
    '..555555..',
    '...5555...');
// the six on THE MARCH: a castle standing, and one taken (rubble, our red pennant)
const MapCastle = PixelSprite.fromRows(
    '3.3...3.3',
    '333.3.333',
    '33333333.',
    '333323333',
    '333121333',
    '333121333');
const MapTaken = PixelSprite.fromRows(
    '....6....',
    '....66...',
    '....4....',
    '..3.4.3..',
    '.3323233.',
    '22322322.');
const MapCart = PixelSprite.fromRows(
    '..7..',
    '66666',
    '1.7.1');

// the crumb shades (round.js Dust: 0 stone, 1 stoneDark, 2 red, 3 green, 4 cream, 5 gold, 6 orange,
// 7 violet, 8 wood, 9 woodDark, 10 stoneLight)
const Shade = ['stone', 'stoneDark', 'red', 'green', 'cream', 'gold', 'orange', 'violet', 'wood', 'woodDark', 'stoneLight'];

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
        this.cHill = pal.get('hill'); this.cWood = pal.get('wood'); this.cWoodD = pal.get('woodDark');
        this.cWater = pal.get('water'); this.cWaterL = pal.get('waterLight'); this.cViolet = pal.get('violet');
        this.cVioletD = pal.get('violetDark'); this.cOrange = pal.get('orange'); this.cNight = pal.get('night');
        this.shades = Shade.map((n) => pal.get(n));
        this._lit = new Uint8Array(R.Rows * R.Cols);
    }

    draw(sim, s, t) {
        const g = sim;
        s.noClip();
        s.clear(this.cSky);
        if (g == null || g.blocks == null) return;

        this._drawFrame(s);
        s.clip(FL, FT, FR - FL, FB - FT);
        if (g.p === Phase.March) this._drawMarch(s, g, t);
        else {
            const night = !!g.def.night;
            this._drawSky(s, g, t);
            if (g.def.moat) this._drawMoat(s, g, t);
            if (night) this._light(g);
            this._drawCastle(s, g, t, night);
            if (g.gate != null) this._drawGate(s, g, t);
            this._drawPending(s, g, t);
            if (g.def.banner != null) this._drawBanner(s, g, t);
            if (g.boss != null) this._drawEngine(s, g, t);
            this._drawBallistas(s, g, t);
            this._drawArchers(s, g);
            if (g.sorc != null) this._drawSorcerer(s, g, t);
            this._drawShots(s, g, t);
            for (const tk of g.tokens) this._drawToken(s, tk);
            this._drawChunks(s, g);
            this._drawFlames(s, g, t);
            this._drawCrumbs(s, g);
            this._drawBooms(s, g);
            if (g.mercyActive) this._drawNet(s, g);
            this._drawCart(s, g, t);
            for (const st of g.stones) {
                const sp = g.fireT > 0 ? StoneFireSprite : g.slowT > 0 ? StoneSlowSprite : StoneSprite;
                if (g.fireT > 0 && !st.attached) this._drawTrail(s, st, t);
                s.blit(sp, Math.round(st.x) - 3, Math.round(st.y) - 3, this.pal);
            }
            for (const pu of g.popups)
                s.textCenteredShadow(pu.text, Math.round(pu.x), Math.round(pu.y), PixelFont.Arcade, pu.big ? this.cCream : this.cGold, this.cBlack);
            if (g.shake > 0) this._shake(s, g);
        }
        s.noClip();

        this._drawHud(s, g, t);
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

    // a heavy blow: the whole field jolts a pixel or two (copied in place inside the field)
    _shake(s, g) {
        const k = Math.trunc(g.time * 60);
        const amp = g.shake > 0.25 ? 2 : 1;
        const dx = ((k * 7) % 3 - 1) * amp, dy = ((k * 5 + 1) % 3 - 1);
        if (dx === 0 && dy === 0) return;
        const W = s.width, u = new Uint32Array(s.data.buffer, s.data.byteOffset, W * s.height);
        const x0 = FL, x1 = FR, y0 = FT, y1 = FB;
        const ys = dy > 0 ? -1 : 1;
        for (let y = dy > 0 ? y1 - 1 : y0; dy > 0 ? y >= y0 : y < y1; y += ys) {
            const sy = Math.min(y1 - 1, Math.max(y0, y - dy));
            const row = u.subarray(sy * W + x0, sy * W + x1);
            if (dx === 0) { u.set(row, y * W + x0); continue; }
            const tmp = row.slice();
            for (let x = x0; x < x1; x++) u[y * W + x] = tmp[Math.min(x1 - x0 - 1, Math.max(0, x - x0 - dx))];
        }
    }

    _drawSky(s, g, t) {
        const sky = g.def.sky;
        const night = sky === 'night';
        if (night) s.rect(FL, FT, FR - FL, FB - FT, this.cNight);
        for (let i = 0; i < Stars.length; i += 2)
            s.setPixel(Stars[i], Stars[i + 1], (i / 2) % 3 === 0 ? this.cStoneL : this.cStoneD);
        if (sky === 'dusk') {
            // the last of the sun behind the hills: two red bands and a gold rim
            s.checker(FL, 184, FR - FL, 8, this.cRedD, 0);
            s.rect(FL, 192, FR - FL, 8, this.cRedD);
            s.rect(FL, 200, FR - FL, 2, this.cRed);
        } else if (sky === 'ember') {
            s.rect(FL, 170, FR - FL, 40, this.cRedD);
            for (let x = FL; x < FR; x += 2) s.setPixel(x + ((x >> 1) & 1), 169, this.cRedD);
            for (let x = FL; x < FR; x += 3) s.setPixel(x, 199 + (hash(x, 3) % 3), this.cOrange);
        } else if (sky === 'aurora') {
            // three violet curtains, slowly swaying
            for (let x = FL; x < FR; x++) {
                const a = Math.sin(x * 0.045 + t * 0.4) * 6 + Math.sin(x * 0.017 + 1.2) * 9;
                const y = 150 + Math.round(a);
                if ((x & 1) === 0) s.rect(x, y, 1, 14, this.cVioletD);
                if (x % 3 === 0) s.setPixel(x, y + 18 + (hash(x, 7) % 4), this.cVioletD);
            }
        } else if (night) {
            s.blit(MoonSprite, 82, 38, this.pal);
        }
        // the far hills (the Mountain Hold: snow-capped peaks)
        for (let x = FL; x < FR; x++) {
            let hy = 203 + Math.round(roundEven(5.0 * Math.sin(x * 0.031) + 3.0 * Math.sin(x * 0.093 + 1.3)));
            if (sky === 'peaks') {
                const u = ((x - FL) % 74) / 74, peak = u < 0.5 ? u * 2 : 2 - u * 2;
                hy = Math.min(hy, 200 - Math.round(peak * 46 + 4 * Math.sin(x * 0.21)));
                s.rect(x, hy, 1, 222 - hy, this.cHill);
                if (hy < 172) s.rect(x, hy, 1, Math.min(4, 172 - hy) + 1, this.cStoneD);
                continue;
            }
            s.rect(x, hy, 1, 222 - hy, night ? this.cSky : this.cHill);
        }
        // grass
        s.rect(FL, 222, FR - FL, 1, this.cGreen);
        s.rect(FL, 223, FR - FL, FB - 223, this.cGreenD);
        for (let x = FL + 1; x < FR; x += 5) { s.setPixel(x, 221, this.cGreen); s.setPixel(x + 2, 224, this.cGreen); }
        for (let x = FL + 3; x < FR; x += 11) s.setPixel(x, 227, this.cGreen);
    }

    _drawMoat(s, g, t) {
        // the River Keep's moat at the castle's foot: water with drifting ripples, a plank bridge
        const y = R.CastleB + 1;
        s.rect(FL, y, FR - FL, 8, this.cWater);
        s.rect(FL, y, FR - FL, 1, this.cWaterL);
        const off = Math.trunc(t * 8);
        for (let x = FL; x < FR; x += 9) {
            const xx = FL + ((x - FL + off) % (FR - FL));
            s.rect(xx, y + 3 + ((x >> 3) & 1) * 2, 3, 1, this.cWaterL);
        }
        if (g.gate != null) {
            const gx0 = Math.trunc(g.gate.x0), gw = Math.trunc(g.gate.x1 - g.gate.x0);
            s.rect(gx0, y, gw, 3, this.cWoodD);
            for (let x = gx0 + 2; x < gx0 + gw; x += 5) s.rect(x, y, 1, 3, this.cWood);
        }
    }

    // ------------------------------------------------------------------ the castle
    // the Night Siege: how lit each block is (0 dark, 1 dim, 2 lit) by the torches, the stones, fire
    _light(g) {
        const L = this._lit;
        L.fill(0);
        const lights = [];
        for (const b of g.blocks) if (b != null && b.hp > 0 && b.kind === Kind.Torch) lights.push(b.x0 + CellW * 0.5, b.y0 + 3, 40);
        for (const st of g.stones) lights.push(st.x, st.y, g.fireT > 0 ? 58 : 34);
        for (const m of g.shots) if (m.kind === Shot.FireArrow) lights.push(m.x, m.y, 26);
        for (const a of g.archers) if (a.fire && !a.fired) lights.push(a.x, a.footY, 24);
        for (const b of g.blocks) {
            if (b == null || !b.alive) continue;
            const cx = b.x0 + CellW * 0.5, cy = b.y0 + CellH * 0.5;
            let lv = 0;
            for (let i = 0; i < lights.length && lv < 2; i += 3) {
                const dx = cx - lights[i], dy = cy - lights[i + 1], d2 = dx * dx + dy * dy, r = lights[i + 2];
                if (d2 < r * r * 0.36) lv = 2; else if (d2 < r * r) lv = 1;
            }
            L[b.row * R.Cols + b.col] = lv;
        }
    }

    _drawCastle(s, g, t, night) {
        const W = CellW, H = CellH;
        // black mortar behind every standing block (joins them into one wall)
        for (const b of g.blocks) if (b != null && b.alive) s.rect(Math.trunc(b.x0) - 1, Math.trunc(b.y0) - 1, W + 1, H + 1, night ? this.cNight : this.cBlack);
        for (const b of g.blocks) {
            if (b == null || !b.alive) continue;
            let x = Math.trunc(b.x0), y = Math.trunc(b.y0);
            if (b.shake > 0) x += (Math.trunc(t * 30) & 1) ? 1 : -1;            // a loose piece shudders
            const w = W - 1, h = H - 1;
            const flash = b.flash > 0;
            const lv = night ? this._lit[b.row * R.Cols + b.col] : 2;
            if (lv === 0 && b.kind !== Kind.Torch) { this._drawDark(s, x, y, w, h); continue; }
            switch (b.kind) {
                case Kind.Stone: this._drawStone(s, b, x, y, w, h, flash, lv); break;
                case Kind.Mortar: this._drawBrick(s, b, x, y, w, h, flash, lv); break;
                case Kind.Iron: this._drawIron(s, b, x, y, w, h, flash); break;
                case Kind.Gate: this._drawGateBlock(s, g, b, x, y, w, h, flash); break;
                case Kind.Wood: this._drawWood(s, b, x, y, w, h, flash); break;
                case Kind.Gold: this._drawGold(s, b, x, y, w, h, flash, t); break;
                case Kind.Rock: this._drawRock(s, b, x, y, w, h, g); break;
                case Kind.Torch: this._drawTorch(s, b, x, y, w, h, flash, t, lv); break;
                default: this._drawRune(s, b, x, y, w, h, flash, t); break;
            }
            if (b.drop !== Power.None && lv > 0) {
                const cx = x + Math.trunc(w / 2), cy = y + Math.trunc(h / 2);
                const c = b.drop === Power.Life ? this.cCream : this.cGold;
                s.rect(cx - 2, cy - 1, 5, 3, this.cBlack); s.rect(cx - 1, cy - 2, 3, 5, this.cBlack);
                s.rect(cx - 1, cy, 3, 1, c); s.rect(cx, cy - 1, 1, 3, c);
            }
        }
    }

    _drawDark(s, x, y, w, h) {
        s.rect(x, y, w, h, this.cHill);
        s.rect(x, y, w, 1, this.cSky);
    }

    _drawStone(s, b, x, y, w, h, flash, lv) {
        if (lv === 1) {
            s.rect(x, y, w, h, this.cStoneD);
            s.rect(x, y, w, 1, this.cStone);
            return;
        }
        s.rect(x, y, w, h, flash ? this.cStoneL : this.cStone);
        s.rect(x, y, w, 1, this.cStoneL); s.rect(x, y, 1, h, this.cStoneL);
        s.rect(x, y + h - 1, w, 1, this.cStoneD); s.rect(x + w - 1, y, 1, h, this.cStoneD);
        const k = hash(b.col, b.row);
        s.setPixel(x + 3 + k % 12, y + 2 + (k >> 4) % 5, this.cStoneD);
        s.setPixel(x + 5 + (k >> 6) % 10, y + 5 + (k >> 9) % 4, this.cStoneD);
        if ((k & 7) === 3 && b.row >= 1) s.rect(x + Math.trunc(w / 2) - 1, y + 3, 2, h - 6, this.cBlack);   // an arrow slit
    }

    _drawBrick(s, b, x, y, w, h, flash, lv) {
        s.rect(x, y, w, h, lv === 1 ? this.cRedD : this.cCream);
        const br = flash ? this.cCream : lv === 1 ? this.cRedD : this.cRed;
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

    _gateAt(g, col, row) {
        const b = row >= 0 && row < R.Rows ? g.blocks[row * R.Cols + col] : null;
        return b != null && b.kind === Kind.Gate;
    }

    _drawGateBlock(s, g, b, x, y, w, h, flash) {
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
        if (!this._gateAt(g, b.col, b.row + 1)) for (let bx = x + 2; bx < x + w; bx += 4) s.setPixel(bx, y + h - 1, this.cGold);   // spikes
        if (!this._gateAt(g, b.col, b.row - 1)) {
            // the arch over the gate
            const left = !this._gateAt(g, b.col - 1, b.row);
            for (let j = 0; j < 5; j++) s.rect(left ? x : x + w - (5 - j), y + j, 5 - j, 1, this.cStoneD);
        }
    }

    _drawWood(s, b, x, y, w, h, flash) {
        // the palisade: four sharpened stakes, lashed with a band
        const c = flash ? this.cCream : this.cWood;
        for (let i = 0; i < 4; i++) {
            const sx = x + i * 5;
            s.rect(sx, y + 2, 4, h - 2, c);
            s.rect(sx + 3, y + 2, 1, h - 2, this.cWoodD);
            s.rect(sx + 1, y, 2, 2, c);
        }
        s.rect(x, y + h - 4, w, 1, this.cWoodD);
    }

    _drawGold(s, b, x, y, w, h, flash, t) {
        // the treasury: stacked gold bars, a glint walking across them
        s.rect(x, y, w, h, this.cGoldD);
        for (let j = 0; j < 3; j++) {
            const yy = y + 1 + j * 4, off = (j & 1) * 3;
            for (let bx = x + 1 + off; bx < x + w - 3; bx += 7) { s.rect(bx, yy, 6, 3, flash ? this.cCream : this.cGold); s.rect(bx, yy + 2, 6, 1, this.cGoldD); }
        }
        const gx = x + (Math.trunc(t * 9 + b.col * 5) % 26);
        if (gx < x + w) s.setPixel(gx, y + 2, this.cCream);
    }

    _drawRock(s, b, x, y, w, h, g) {
        // living rock: dark, rough, never breaks
        s.rect(x - 1, y - 1, w + 2, h + 2, this.cStoneD);
        const k = hash(b.col, b.row + 11);
        const above = g.blockAt(b.col, b.row - 1);
        if (above == null || above.kind !== Kind.Rock) {
            s.rect(x, y - 1, w, 2, g.def.sky === 'peaks' && b.row <= 3 ? this.cStoneL : this.cStone);
        }
        s.setPixel(x + 2 + k % 15, y + 3 + (k >> 4) % 8, this.cBlack);
        s.setPixel(x + 4 + (k >> 6) % 12, y + 6 + (k >> 9) % 6, this.cBlack);
        s.setPixel(x + 1 + (k >> 3) % 17, y + 2 + (k >> 11) % 9, this.cStone);
        s.line(x + 3 + k % 5, y + h - 1, x + 8 + k % 5, y + 6, this.cBlack);
    }

    _drawTorch(s, b, x, y, w, h, flash, t, lv) {
        if (lv === 0) lv = 2;                     // a torch always shows itself
        this._drawStone(s, b, x, y, w, h, flash, lv);
        const cx = x + Math.trunc(w / 2);
        s.rect(cx - 1, y + 6, 3, 6, this.cWoodD);  // the bracket
        const k = Math.trunc(t * 10 + b.col * 3) % 3;
        s.rect(cx - 1, y + 2 - (k === 1 ? 1 : 0), 3, 4, this.cOrange);
        s.rect(cx, y + 1 - (k === 2 ? 1 : 0), 1, 3, this.cGold);
        s.setPixel(cx + (k === 0 ? -1 : 1), y, this.cGold);
    }

    _drawRune(s, b, x, y, w, h, flash, t) {
        // a rune stone: dark violet, its sign glowing; a fresh one is still taking shape
        s.rect(x, y, w, h, flash ? this.cViolet : this.cVioletD);
        s.rect(x, y, w, 1, this.cViolet);
        const c = b.grown > 0 ? this.cCream : (Math.trunc(t + b.col * 0.37) & 1) ? this.cViolet : this.cCream;
        const cx = x + Math.trunc(w / 2), cy = y + Math.trunc(h / 2);
        const k = hash(b.col, b.row) % 3;
        s.rect(cx, cy - 4, 1, 9, c);
        if (k === 0) { s.line(cx - 3, cy - 3, cx, cy, c); s.line(cx + 3, cy - 3, cx, cy, c); }
        else if (k === 1) { s.line(cx, cy - 4, cx + 3, cy - 1, c); s.line(cx, cy, cx + 3, cy + 3, c); }
        else { s.line(cx - 3, cy + 3, cx, cy, c); s.line(cx, cy - 2, cx + 3, cy - 5 + 2, c); }
        if (b.grown > 0) s.frame(x, y, w, h, this.cViolet);
    }

    // the River Keep's portcullis: its bars run down from the gatehouse to the drop line
    _drawGate(s, g, t) {
        const G = g.gate;
        const x0 = Math.trunc(G.x0), x1 = Math.trunc(G.x1), y0 = Math.trunc(G.y0), y1 = Math.trunc(G.y1);
        s.rect(x0, y0, x1 - x0, y1 - y0, this.cBlack);
        // the dark passage behind; a little light from the treasury
        for (let y = y0 + 2; y < y1; y += 3) s.setPixel(x0 + 3 + ((y >> 1) & 7) * 4, y, this.cGoldD);
        const drop = Math.round((y1 - y0) * G.f);
        const jig = G.st === 3 ? ((Math.trunc(t * 16) & 1) ? 1 : 0) : 0;      // rattling: about to drop
        if (drop > 0) {
            const yb = y0 + drop + jig;
            for (let x = x0 + 2; x < x1 - 1; x += 5) { s.rect(x, y0, 2, yb - y0, this.cStone); s.setPixel(x, yb, this.cGold); s.setPixel(x + 1, yb, this.cGold); }
            for (let y = yb - 4; y > y0; y -= 7) s.rect(x0 + 1, y, x1 - x0 - 2, 1, this.cStoneD);
        } else {
            // raised: only its spiked foot shows, up in the arch
            for (let x = x0 + 2; x < x1 - 1; x += 5) s.rect(x, y0, 2, 2 + jig, this.cStone);
        }
        // the chains
        s.rect(x0, y0, 1, y1 - y0, this.cStoneD); s.rect(x1 - 1, y0, 1, y1 - y0, this.cStoneD);
    }

    // the cells the sorcerer is regrowing: violet dotted outlines, marching
    _drawPending(s, g, t) {
        if (g.pending.length === 0) return;
        const ph = Math.trunc(t * 12);
        for (const k of g.pending) {
            const c = k % R.Cols, r = Math.trunc(k / R.Cols);
            const x = R.CastleX + c * CellW, y = R.CastleY + r * CellH, w = CellW - 1, h = CellH - 1;
            for (let i = 0; i < 2 * (w + h); i++) {
                if (((i + ph) % 4) >= 2) continue;
                let px, py;
                if (i < w) { px = x + i; py = y; } else if (i < w + h) { px = x + w - 1; py = y + i - w; }
                else if (i < 2 * w + h) { px = x + w - 1 - (i - w - h); py = y + h - 1; } else { px = x; py = y + h - 1 - (i - 2 * w - h); }
                s.setPixel(px, py, this.cViolet);
            }
        }
    }

    _drawBanner(s, g, t) {
        const falling = g.p === Phase.Fall || g.p === Phase.Tally || (g.p >= Phase.Card && g.roundWon);
        const fx = g.bannerX;
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
        const L = R.PoleLen;
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

    // ------------------------------------------------------------------ the defences
    _drawArchers(s, g) {
        for (const a of g.archers) {
            const total = g.archerDraw + g.archerStay;
            let rise = Math.min(1, Math.min(a.t / 0.3, (total - a.t) / 0.25));
            if (rise < 0) rise = 0;
            const foot = Math.round(a.footY);
            const y = foot - 11 + Math.round((1 - rise) * 11);
            s.clip(FL, FT, FR - FL, foot - FT);
            s.blit(a.fired ? ArcherLooseSprite : a.fire ? ArcherFireSprite : ArcherDrawSprite, Math.round(a.x) - 4, y, this.pal);
            s.clip(FL, FT, FR - FL, FB - FT);
        }
    }

    _drawBallistas(s, g, t) {
        for (const bl of g.ballistas) {
            const px = Math.round(bl.x), py = Math.round(bl.y) - 5;
            let dx = bl.aimX - bl.x, dy = R.CartTop - (bl.y - 4);
            const m = Math.sqrt(dx * dx + dy * dy); dx /= m; dy /= m;
            // the sight line while it aims: dotted while it tracks, solid red once it has locked
            if (bl.st === 1) {
                const locked = bl.t >= g.ballistaTrack;
                const ph = Math.trunc(t * 20) % 6;
                for (let k = 8; k < m; k += 2) {
                    if (!locked && ((k >> 1) + ph) % 6 >= 2) continue;
                    s.setPixel(Math.round(px + dx * k), Math.round(py + 1 + dy * k), locked ? this.cRed : this.cRedD);
                }
            }
            // the stand, the stock along the aim, the bow across it, the bolt in its groove
            s.rect(px - 5, py + 2, 11, 3, this.cWoodD);
            s.rect(px - 4, py + 1, 9, 1, this.cWood);
            const fl = bl.flash > 0;
            s.line(px - Math.round(dx * 4), py - Math.round(dy * 4), px + Math.round(dx * 5), py + Math.round(dy * 5), fl ? this.cCream : this.cWoodD);
            const bx = Math.round(-dy * 7), by = Math.round(dx * 7);
            const cx = px + Math.round(dx * 3), cy = py + Math.round(dy * 3);
            s.line(cx - bx, cy - by, cx + bx, cy + by, fl ? this.cCream : this.cWood);
            const back = bl.st === 1 ? 3 : 1;
            s.line(cx - bx, cy - by, px - Math.round(dx * back), py - Math.round(dy * back), this.cCream);
            s.line(cx + bx, cy + by, px - Math.round(dx * back), py - Math.round(dy * back), this.cCream);
            if (bl.st === 1 || bl.cool < 1.5) s.setPixel(px + Math.round(dx * 7), py + Math.round(dy * 7), this.cStoneL);
            for (let i = 0; i < bl.hp; i++) s.setPixel(px - 3 + i * 3, py + 3, this.cGold);
        }
    }

    _drawSorcerer(s, g, t) {
        const so = g.sorc;
        if (so.st === 0) return;
        const x = Math.round(so.x) - 4, foot = Math.round(so.footY);
        let show = 13;
        if (so.st === 1) show = Math.round(13 * Math.min(1, so.t / 0.35));
        else if (so.st === 3) show = Math.round(13 * Math.max(0, 1 - so.t / 0.35));
        // blinking in and out: the figure grows from the battlement, a shimmer of violet round it
        if (so.st !== 2) {
            for (let k = 0; k < 6; k++) {
                const a = k * 1.047 + t * 8;
                s.setPixel(Math.round(so.x + Math.cos(a) * 7), Math.round(foot - 7 + Math.sin(a) * 6), (k & 1) ? this.cViolet : this.cCream);
            }
        }
        if (show <= 0) return;
        s.clip(FL, foot - show, FR - FL, show);
        s.blit(SorcererSprite, x, foot - 13, this.pal);
        s.clip(FL, FT, FR - FL, FB - FT);
        if (so.st === 2) {
            // the staff's glow swells as the spell gathers (the telegraph)
            const u = Math.min(1, so.t / g.sorcCharge);
            const r = 1 + Math.round(u * 3);
            const sx = x + 8, sy = foot - 9;
            s.circle(sx, sy, r, u > 0.75 ? this.cCream : this.cViolet, false);
            s.setPixel(sx, sy, this.cGold);
        }
    }

    _drawEngine(s, g, t) {
        const B = g.boss;
        const sink = B.dead ? Math.round((B.sink || 0) * 52) : 0;
        const cx = Math.round(B.x), top = R.EngineTop + sink, bot = R.EngineBot + sink, hw = R.EngineHalf;
        // the shield wall, sliding on its rail
        if (!B.dead) {
            s.rect(FL + 40, R.WallY + R.WallH, FR - FL - 80, 1, this.cStoneD);
            for (const sg of B.segs) {
                if (sg.hp <= 0) continue;
                const x0 = Math.round(B.wallX + sg.off - R.SegW * 0.5);
                s.rect(x0 - 1, R.WallY - 1, R.SegW + 1, R.WallH + 1, this.cBlack);
                for (let i = 0; i < 2; i++) this._drawIron(s, { hp: sg.hp }, x0 + i * CellW, R.WallY, CellW - 1, CellH - 1, sg.flash > 0);
            }
        }
        // the wheels
        for (const wx of [cx - hw + 6, cx + hw - 7]) {
            s.circle(wx, bot - 2, 7, this.cBlack, true);
            s.circle(wx, bot - 2, 7, this.cStoneD, false);
            const a = B.x * 0.2;
            s.line(wx, bot - 2, wx + Math.round(Math.cos(a) * 6), bot - 2 + Math.round(Math.sin(a) * 6), this.cStoneD);
            s.setPixel(wx, bot - 2, this.cGold);
        }
        // the hull: iron plates, gold rivets; it glows ember at the seams in its rage
        const fl = B.flash > 0;
        const hull = fl ? this.cStone : this.cStoneD;
        s.rect(cx - hw, top + 6, hw * 2, bot - top - 10, this.cBlack);
        s.rect(cx - hw + 1, top + 7, hw * 2 - 2, bot - top - 12, hull);
        const seam = B.phase === 3 && !B.dead ? this.cRedD : this.cBlack;
        for (let x = cx - hw + 12; x < cx + hw - 4; x += 12) s.rect(x, top + 7, 1, bot - top - 12, seam);
        s.rect(cx - hw + 1, top + 20, hw * 2 - 2, 1, seam);
        for (let x = cx - hw + 4; x < cx + hw - 2; x += 6) { s.setPixel(x, top + 9, this.cGoldD); s.setPixel(x, top + 22, this.cGoldD); }
        // the crenellated roof and the horns
        for (let x = cx - hw; x < cx + hw; x += 8) s.rect(x, top + 2, 5, 5, this.cBlack);
        s.line(cx - hw + 2, top + 6, cx - hw - 3, top, this.cStoneL); s.line(cx - hw + 3, top + 6, cx - hw - 2, top, this.cStone);
        s.line(cx + hw - 3, top + 6, cx + hw + 2, top, this.cStoneL); s.line(cx + hw - 4, top + 6, cx + hw + 1, top, this.cStone);
        // the eyes: two red slits (brighter in the rage)
        const eye = B.roar > 0 || B.phase === 3 ? this.cOrange : this.cRed;
        if (!B.dead) { s.rect(cx - 14, top + 13, 7, 2, eye); s.rect(cx + 8, top + 13, 7, 2, eye); }
        // the throwing arm, cranked back for a throw (the telegraph), a pot in its cup
        if (!B.dead) {
            const a = -0.5 - B.arm * 1.0;
            const ax = cx + 2, ay = top + 6;
            const ex = ax + Math.round(Math.sin(a) * 22), ey = ay - Math.round(Math.cos(a) * 22);
            s.line(ax, ay, ex, ey, this.cWoodD); s.line(ax + 1, ay, ex + 1, ey, this.cWood);
            if (B.armSt === 1) s.blit(PotSprite, ex - 2, ey - 2, this.pal);
        }
        // the furnace mouth (the weak point): a grille when shut, fire when open
        const mx = cx - R.MouthHalf, mw = R.MouthHalf * 2 + 1, my = bot - 14;
        s.rect(mx - 1, my - 1, mw + 2, 15, this.cBlack);
        const open = B.door;
        if (open > 0.05 && !B.dead) {
            const k = Math.trunc(t * 10) % 3;
            s.rect(mx, my, mw, 14, this.cRedD);
            s.rect(mx + 2, my + 3 + (k === 1 ? 1 : 0), mw - 4, 10, this.cOrange);
            s.rect(mx + 6, my + 6 + (k === 2 ? 1 : 0), mw - 12, 7, this.cGold);
            s.rect(mx + 11, my + 9, mw - 22, 4, this.cCream);
        }
        const shut = Math.round(14 * (1 - open));
        if (shut > 0 || B.dead) {
            const hgt = B.dead ? 14 : shut;
            s.rect(mx, my, mw, hgt, this.cStoneD);
            for (let x = mx + 2; x < mx + mw; x += 4) s.rect(x, my, 1, hgt, this.cBlack);
            if (hgt > 3) s.rect(mx, my + hgt - 2, mw, 1, this.cGoldD);
        }
        // cracks as it weakens
        const dmg = 1 - B.hp / B.maxHp;
        if (dmg > 0.3) s.line(cx - 22, top + 8, cx - 16, top + 18, this.cBlack);
        if (dmg > 0.55) s.line(cx + 20, top + 24, cx + 27, top + 34, this.cBlack);
        if (dmg > 0.8) { s.line(cx - 30, top + 26, cx - 24, top + 36, this.cBlack); s.line(cx + 4, top + 8, cx + 9, top + 17, this.cBlack); }
    }

    _drawShots(s, g, t) {
        for (const m of g.shots) {
            const x = Math.round(m.x), y = Math.round(m.y);
            switch (m.kind) {
                case Shot.Arrow: s.blit(ArrowSprite, x - 2, y - 10, this.pal); break;
                case Shot.FireArrow:
                    s.blit(FireArrowSprite, x - 2, y - 10, this.pal);
                    // the burning shaft and its landing lane show against the night
                    s.setPixel(x, y - 4, this.cCream);
                    s.rect(x - 5, 224, 11, 1, this.cOrange);
                    s.setPixel(x, 222, this.cGold);
                    break;
                case Shot.Bolt: {
                    const sp = Math.sqrt(m.vx * m.vx + m.vy * m.vy), ux = m.vx / sp, uy = m.vy / sp;
                    s.line(x - Math.round(ux * 11), y - Math.round(uy * 11), x - Math.round(ux * 2), y - Math.round(uy * 2), this.cWood);
                    s.line(x - Math.round(ux * 11) + 1, y - Math.round(uy * 11), x - Math.round(ux * 8) + 1, y - Math.round(uy * 8), this.cCream);
                    s.line(x - Math.round(ux * 2), y - Math.round(uy * 2), x, y, this.cStoneL);
                    break;
                }
                case Shot.Hex: {
                    s.blit(HexSprite, x - 2, y - 2, this.pal);
                    const a = t * 9;
                    s.setPixel(x + Math.round(Math.cos(a) * 4), y + Math.round(Math.sin(a) * 4), this.cViolet);
                    s.setPixel(x - Math.round(Math.cos(a) * 4), y - Math.round(Math.sin(a) * 4), this.cCream);
                    break;
                }
                default: {
                    s.blit(PotSprite, x - 2, y - 2, this.pal);
                    s.setPixel(x - Math.round(m.vx * 0.04), y - 3 - Math.round(m.vy * 0.04), this.cOrange);
                    // where it will land: a little red mark on the grass (the telegraph)
                    const imp = R.impact(m);
                    if (imp.t < 1.5) { const ix = Math.round(imp.x); s.rect(ix - 7, 224, 15, 1, this.cGold); s.line(ix - 5, 222, ix, 218, this.cOrange); s.line(ix, 218, ix + 5, 222, this.cOrange); }
                    break;
                }
            }
        }
    }

    _drawToken(s, tk) {
        const x = Math.round(tk.x) - 6, y = Math.round(tk.y) - 4;
        const fire = tk.kind === Power.Fire, life = tk.kind === Power.Life;
        const rim = life ? this.cCream : this.cGold;
        s.rect(x + 1, y, 11, 9, rim); s.rect(x, y + 1, 13, 7, rim);
        s.rect(x + 1, y + 1, 11, 7, fire ? this.cOrange : life ? this.cStoneD : this.cRedD);
        if (life) { s.blit(StoneIcon, x + 3, y + 1, this.pal); return; }
        const l = tk.kind === Power.Wide ? 'W' : tk.kind === Power.Split ? '3' : tk.kind === Power.Fire ? 'F' : 'S';
        s.text(l, x + 4, y + 1, PixelFont.Arcade, fire ? this.cBlack : this.cCream);
    }

    _drawChunks(s, g) {
        for (const c of g.chunks) {
            const x = Math.round(c.x), y = Math.round(c.y);
            if (c.kind < 0) {
                // a spent arrow or bolt stuck in the grass
                if (c.kind === -2) { s.rect(x, y - 6, 1, 7, this.cWood); s.setPixel(x, y - 7, this.cCream); }
                else { s.rect(x, y - 5, 1, 6, this.cCream); s.setPixel(x - 1, y - 6, this.cRed); s.setPixel(x + 1, y - 6, this.cRed); }
                continue;
            }
            const col = c.kind === Kind.Mortar ? this.cRed : c.kind === Kind.Wood ? this.cWood : c.kind === Kind.Gold ? this.cGold
                : c.kind === Kind.Rune ? this.cVioletD : c.kind === Kind.Iron || c.kind === Kind.Gate ? this.cStoneD : this.cStone;
            s.rect(x + 1, y + 1, CellW - 3, CellH - 3, col);
            s.rect(x + 1, y + 1, CellW - 3, 1, this.cStoneL);
            s.rect(x + 1, y + CellH - 3, CellW - 3, 1, this.cBlack);
        }
    }

    _drawFlames(s, g, t) {
        for (const fl of g.flames) {
            const x0 = Math.round(fl.x - fl.w * 0.5), w = Math.round(fl.w);
            const u = fl.t / fl.life;
            const hgt = u < 0.15 ? u / 0.15 : u > 0.75 ? (1 - u) / 0.25 : 1;
            s.rect(x0, 221, w, 2, this.cRedD);
            for (let i = 0; i < w; i += 2) {
                const k = hash(i + Math.trunc(t * 12), x0) % 5;
                const hh = Math.max(1, Math.round((4 + k) * hgt));
                s.rect(x0 + i, 222 - hh, 2, hh, (k & 1) ? this.cOrange : this.cRed);
                if (hh > 3) s.setPixel(x0 + i + (k & 1), 222 - hh + 1, this.cGold);
            }
        }
    }

    _drawCrumbs(s, g) {
        for (const c of g.crumbs) s.rect(Math.round(c.x), Math.round(c.y), 2, 2, this.shades[c.shade] || this.cStone);
    }

    _drawBooms(s, g) {
        for (const b of g.booms) {
            const u = b.t / 0.4, r = Math.max(1, Math.round(b.r * (0.4 + u)));
            const x = Math.round(b.x), y = Math.round(b.y);
            if (u < 0.5) { s.circle(x, y, r, this.cOrange, true); s.circle(x, y, Math.max(1, r - 3), this.cGold, true); if (u < 0.2) s.circle(x, y, Math.max(1, r - 5), this.cCream, true); }
            else { s.circle(x, y, r, this.cStoneD, false); s.circle(x, y, Math.max(1, r - 2), this.cRedD, false); }
        }
    }

    _drawTrail(s, st, t) {
        const sp = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
        if (sp < 1) return;
        const ux = st.vx / sp, uy = st.vy / sp;
        for (let k = 1; k <= 4; k++) {
            const x = Math.round(st.x - ux * k * 3), y = Math.round(st.y - uy * k * 3);
            s.rect(x - 1, y - 1, k < 3 ? 2 : 1, k < 3 ? 2 : 1, k === 1 ? this.cGold : this.cOrange);
        }
    }

    _drawNet(s, g) {
        // the golden net of the mercy credit: a two-strand mesh strung just above the grass
        const c = g.netFlash > 0 ? this.cCream : this.cGold;
        const y = Math.trunc(R.NetY) - 3;
        for (let x = FL; x < FR; x += 2) { s.setPixel(x, y, c); s.setPixel(x + 1, y + 1, this.cGoldD); s.setPixel(x, y + 2, c); }
        s.rect(FL, y - 3, 1, 6, this.cGold); s.rect(FR - 1, y - 3, 1, 6, this.cGold);
    }

    _drawCart(s, g, t) {
        const w = Math.round(g.cartW);
        const x0 = Math.round(g.cartX - g.cartW * 0.5), cx = x0 + Math.trunc(w / 2);
        const top = Math.trunc(R.CartTop);
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
        if (g.p === Phase.Lost) {
            // what struck the beam stays stuck in it through the beat
            const sx = Math.round(g.cartX + g.stuckX);
            if (g.lastCause === Cause.Arrow) s.blit(ArrowSprite, sx - 2, top + 3 - 10, this.pal);
            else if (g.lastCause === Cause.Bolt) { s.line(sx - 3, top - 8, sx, top + 1, this.cWood); s.setPixel(sx - 3, top - 8, this.cCream); }
            else if (g.lastCause === Cause.Hex || g.lastCause === Cause.Pot) {
                const k = Math.trunc(t * 10) % 3;
                s.rect(sx - 4, top - 3 - k, 9, 3 + k, g.lastCause === Cause.Hex ? this.cViolet : this.cOrange);
                s.rect(sx - 2, top - 2 - k, 5, 2 + k, g.lastCause === Cause.Hex ? this.cCream : this.cGold);
            }
        }
        // the throwing arm: cocked under a waiting stone, flicked up after a throw
        if (g.serving || g.p === Phase.Ready) {
            s.line(cx + 7, top - 1, cx + 1, top - 3, this.cRedD);
            s.rect(cx - 3, top - 2, 7, 2, this.cRedD);
        } else if (g.armT > 0) {
            s.line(cx, top - 1, cx - 4, top - 12, this.cRed); s.line(cx + 1, top - 1, cx - 3, top - 12, this.cRed);
            s.rect(cx - 6, top - 14, 5, 2, this.cRedD);
        }
    }

    // ------------------------------------------------------------------ THE MARCH (between castles)
    _drawMarch(s, g, t) {
        s.rect(FL, FT, FR - FL, FB - FT, this.cSky);
        for (let i = 0; i < Stars.length; i += 2) if (Stars[i + 1] < 90) s.setPixel(Stars[i], Stars[i + 1], this.cStoneD);
        // the land: rolling hills, a river, the black mountains of the citadel far right
        for (let x = FL; x < FR; x++) {
            const hy = 120 + Math.round(8 * Math.sin(x * 0.04) + 5 * Math.sin(x * 0.11 + 2));
            s.rect(x, hy, 1, FB - hy, this.cHill);
            if (x > 250) { const my = 70 + Math.round(Math.abs(((x - 250) % 24) - 12) * 1.6); s.rect(x, my, 1, hy - my, this.cBlack); }
        }
        for (let y = 112; y < FB; y++) { const rx = 168 + Math.round(10 * Math.sin(y * 0.09)); s.rect(rx, y, 4, 1, this.cWater); }
        for (let x = FL + 4; x < FR; x += 13) for (let y = 140 + (x % 3) * 9; y < FB - 4; y += 27) s.setPixel(x + (y % 5), y, this.cGreenD);
        // the road between the six, dotted, walked to here in gold
        const next = g.stage + 1;
        const u = Math.min(1, Math.max(0, (g.phaseTime - 0.4) / 1.5));
        for (let i = 0; i + 1 < MapSpots.length; i++) {
            const [ax, ay] = MapSpots[i], [bx, by] = MapSpots[i + 1];
            const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
            for (let k = 0; k <= n; k += 3) {
                const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n) + 4;
                const done = i + 1 < next - 1 || (i + 1 === next - 1 && k / n <= u);
                s.setPixel(x, y, done ? this.cGold : this.cCream);
            }
        }
        for (let i = 0; i < MapSpots.length; i++) {
            const [x, y] = MapSpots[i];
            const taken = i + 1 <= g.stage;
            if (i === MapSpots.length - 1 && !taken) {
                // the citadel: black, with its ember eyes
                s.rect(x - 7, y - 10, 15, 13, this.cBlack); s.rect(x - 9, y - 14, 3, 17, this.cBlack); s.rect(x + 7, y - 14, 3, 17, this.cBlack);
                s.rect(x - 3, y - 6, 2, 1, this.cRed); s.rect(x + 2, y - 6, 2, 1, this.cRed);
            } else s.blit(taken ? MapTaken : MapCastle, x - 4, y - 5, this.pal);
            if (i + 1 === next && SurfaceDraw.blink(t, 1)) s.frame(x - 7, y - 9, 15, 15, this.cGold);
            s.text(String(i + 1), x - 2, y + 7, PixelFont.Small, i + 1 <= g.stage ? this.cGold : this.cStone);
        }
        // the cart rolls on
        const [ax, ay] = MapSpots[g.stage - 1], [bx, by] = MapSpots[Math.min(MapSpots.length - 1, g.stage)];
        const cx = Math.round(ax + (bx - ax) * u), cy = Math.round(ay + (by - ay) * u);
        s.blit(MapCart, cx - 2, cy + 1, this.pal);
        // the words
        const def = STAGES[Math.min(STAGES.length - 1, g.stage)];
        s.textBox('THE MARCH', 160, 44, PixelFont.Display, 2, this.cGold, this.cRed, this.cSky);
        s.textCenteredShadow('ON TO CASTLE ' + next, 160, 70, PixelFont.Arcade, this.cCream, this.cBlack);
        s.textCenteredShadow(def.name, 160, 82, PixelFont.Arcade, this.cGold, this.cBlack);
    }

    // ------------------------------------------------------------------ HUD + overlays
    _drawHud(s, g, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cRed);
        s.text(d6(g.score), 30, 10, dsp, this.cGold, 2);
        const B = g.boss;
        if (B != null && g.p !== Phase.March) {
            // the engine's gauge in place of the castle number
            s.textCentered('ENGINE', 176, 9, dsp, this.cCream);
            const w = 64, x0 = 176 - w / 2, fill = Math.round(w * B.hp / B.maxHp);
            s.rect(x0 - 1, 18, w + 2, 7, this.cStoneD);
            s.rect(x0, 19, w, 5, this.cBlack);
            if (fill > 0) { s.rect(x0, 19, fill, 5, B.flash > 0 ? this.cCream : B.phase === 3 ? this.cOrange : this.cRed); s.rect(x0, 19, fill, 1, this.cGold); }
            for (let k = 1; k < 4; k++) s.setPixel(x0 + Math.round(w * k / 4), 24, this.cStoneD);
        } else {
            s.textCentered('CASTLE', 176, 9, dsp, this.cCream);
            s.textCentered(g.castleNumber + '/6', 176, 19, dsp, this.cGold);
        }
        const flash = g.lifeFlash > 0 && SurfaceDraw.blink(t, 1);
        s.textRight('STONES', 312, 9, dsp, flash ? this.cGold : this.cCream);
        if (g.mercyActive) s.textRight('FREE', 312, 19, dsp, this.cGold);
        else for (let i = 0; i < g.stonesLeft; i++) s.blit(g.lifeFlash > 0 && i === g.stonesLeft - 1 ? StoneIconGold : StoneIcon, 312 - 7 - i * 10, 19, this.pal);
        s.dottedRule(8, 312, 28, 3, this.cRed);
    }

    _drawOverlays(s, g, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const mid = 160;
        switch (g.p) {
            case Phase.Ready:
                if (g.cardUp) {
                    // the castle's card: its number, its name, its warning
                    s.textBox('CASTLE ' + g.castleNumber, mid, 146, dsp, 2, this.cCream, this.cRed, this.cSky);
                    s.textCenteredShadow(g.def.name, mid, 168, arc, this.cGold, this.cBlack);
                    s.textCenteredShadow(g.def.hint, mid, 180, arc, this.cCream, this.cBlack);
                } else {
                    s.textBox('NEXT STONE', mid, 148, dsp, 2, this.cCream, this.cRed, this.cSky);
                    s.textCenteredShadow('STONES LEFT ' + g.stonesLeft, mid, 170, arc, this.cGold, this.cBlack);
                }
                if (g.mercyActive) s.textCenteredShadow('FREE SIEGE  THE NET HOLDS', mid, 192, arc, this.cCream, this.cBlack);
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
                const c = g.lastCause;
                const what = c === Cause.Arrow ? 'ARROW HIT' : c === Cause.Bolt ? 'BOLT HIT' : c === Cause.Hex ? 'HEXED' : c === Cause.Pot ? 'FIREPOT' : 'STONE LOST';
                s.textBox(what, mid, 148, dsp, 2, this.cCream, this.cRed, this.cSky);
                s.textCenteredShadow(g.stonesLeft > 0 ? 'STONES LEFT ' + g.stonesLeft : 'NO STONES LEFT', mid, 170, arc, this.cGold, this.cBlack);
                break;
            }
            case Phase.Fall:
                if (g.phaseTime >= 0.4) s.textBox('CASTLE TAKEN', mid, 150, dsp, 2, this.cGold, this.cRed, this.cSky);
                break;
            case Phase.Wreck:
                if (g.phaseTime >= 0.6) s.textBox('THE ENGINE BREAKS', mid, 150, dsp, 2, this.cGold, this.cRed, this.cSky);
                break;
            case Phase.Tally: this._drawTally(s, g, t); break;
            case Phase.Card:
            case Phase.Over: {
                const spec = CastleCrushSpec;
                const won = g.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, mid, 104, dsp, 3, won ? this.cGold : this.cCream, this.cRed, this.cSky);
                s.plate(mid - 100, 136, 200, 46, this.cSky, this.cRed);
                s.textCentered('SCORE ' + d6(g.score), mid, 142, arc, this.cGold, 2);
                s.textCentered(won ? 'THE WARLORD IS BROKEN' : g.def.name + ' STANDS', mid, 164, arc, this.cCream);
                break;
            }
        }
    }

    _drawTally(s, g, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const n = g.tally.length, h = 34 + n * 11 + 16;
        const y0 = 120 - Math.trunc(h / 2);
        s.plate(48, y0, 224, h, this.cSky, this.cRed);
        s.frame(50, y0 + 2, 220, h - 4, this.cRedD);
        s.textCentered(g.boss != null ? 'THE CITADEL FALLS' : 'CASTLE ' + g.castleNumber + ' TAKEN', 160, y0 + 8, dsp, this.cGold);
        for (let i = 0; i < g.tallyShown; i++) {
            const ln = g.tally[i], y = y0 + 26 + i * 11;
            s.text(ln.label, 60, y, arc, this.cCream);
            s.textRight(String(ln.pts), 260, y, arc, this.cGold);
        }
        if (g.tallyShown >= n) {
            const y = y0 + 26 + n * 11 + 2;
            s.dottedRule(60, 260, y - 3, 2, this.cRedD);
            s.text('TOTAL', 60, y + 1, arc, this.cGold);
            s.textRight(String(g.tallyTotal), 260, y + 1, arc, this.cGold);
        }
    }
}
