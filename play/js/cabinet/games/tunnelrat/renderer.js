// THE NODE · world 1 · TUNNEL RAT on the Cabinet Engine · THE PICTURE.
// Built out (2026-10-18) from the port of TunnelRatRenderer.cs (Staging/Batch2/tunnelrat).
//
// Laid out for a curved tube seen from 0.8 m: every actor is a chunky 16 x 16 sprite on a 16 px
// lattice (the queen 32 x 32), the earth fills the whole tube, and nothing sits in the 8 px margin.
//   HUD band   y 8..23: 1UP + the score in display digits x2, DEPTH n and a pip per pest left (the
//              queen's depth: her pump meter), the lives as digger icons on the right
//   sky        y 24..39: tan by day, dusk and night further down; one flower per depth reached, the
//              shaft mouth at the centre; a pest that gets away runs off along it
//   earth      y 40..231: 19 x 12 tiles in the depth's four strata, a speckle per tile, a 1 px darker lip
//              where earth meets tunnel; tunnels are black
// THE EARTH CACHE: the earth is drawn into its own 304 x 192 surface, a tile at a time, only where the
// field's tileVer says it changed (the whole of it on a new depth); each frame copies it in by rows.
// Pests inflate as drawn circles (20, 24, 28 px) and pop in a burst; a ghost is its goggles and a 50 %
// dither of its body (the arcade's only transparency), and so is a shade inside the earth. A
// fire-lizard's wind-up glows at the mouth; a scorcher's lays an ember line down its row first. Rocks
// wobble at 2.5 Hz (under the 3 Hz strobe floor) and crumble through darker greys. Every blink is 1 Hz;
// a screen jolt is 1-2 px and short.
// Cards: the DEPTH card (number, name, two hint lines, the new pest), the CLEAR beat, the tally, EXTRA
// RAT, HURRY UP, and the result card.
import { f32, idiv, roundEven, d6, PixelFont, PixelSprite, PixelSurface, SurfaceDraw, Dir4 } from '../../sdk/index.js';
import { TunnelRatPalette, TunnelRatSpec } from './spec.js';
import { TunnelRatSim, TunnelField, RockState, PestKind } from './sim.js';
import { STAGES } from './stages.js';

const OX = 8, OY = 40;                   // earth origin on the tube
const SkyY = 24;
const T = TunnelField.Tile, PxW = TunnelField.PxW, PxH = TunnelField.PxH;
const Phase = TunnelRatSim.Phase, HoseState = TunnelRatSim.HoseState;

// ------------------------------------------------------------------ sprites (palette-indexed)
// 0 bg  1 sky/skin  2-5 dirt  6 orange  7 orangeDk  8 white  9 green  a greenDk
// b blue  c blueDk  d yellow  e grey  f greyDk  g purple  h purpleDk  i red  j redDk  k cyan  l cyanDk
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

// the same sprite with some palette indices swapped (from -> to)
function recolour(a, map) {
    const b = new PixelSprite(a.width, a.height);
    for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
            const v = a.at(x, y);
            if (v >= 0) b.set(x, y, map[v] !== undefined ? map[v] : v);
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
// the scorcher: a lizard in ember red, its wings gone to a yellow crest
const Scorch0 = recolour(Liz0, { 9: 18, 10: 13, 7: 19, 6: 13 });
const Scorch1 = recolour(Liz1, { 9: 18, 10: 13, 7: 19, 6: 13 });

// the driller: a purple beetle with a steel bit on its nose (the bit's light and dark swap: it spins)
const Drill0 = PixelSprite.fromRows(
    '................',
    '...hhhhhhh......',
    '..hgggggggh.....',
    '.hgg88ggg88h....',
    '.hg8008g8008hf..',
    'hggg88ggg88ghef.',
    'hggggggggggghfef',
    'hghghghghghgheef',
    'hggggggggggghfef',
    'hggggggggggghef.',
    '.hgggggggggghf..',
    '..hhhhhhhhhh....',
    '..h..h..h..h....',
    '.h..h..h..h.....',
    '................',
    '................');
const Drill1 = PixelSprite.fromRows(
    '................',
    '...hhhhhhh......',
    '..hgggggggh.....',
    '.hgg88ggg88h....',
    '.hg8008g8008he..',
    'hggg88ggg88ghfe.',
    'hggggggggggghefe',
    'hghghghghghghffe',
    'hggggggggggghefe',
    'hggggggggggghfe.',
    '.hgggggggggghe..',
    '..hhhhhhhhhh....',
    '...h..h..h..h...',
    '....h..h..h..h..',
    '................',
    '................');

// the shade: a cyan wisp, all eyes, its tail rippling
const Shade0 = PixelSprite.fromRows(
    '................',
    '.....kkkkkk.....',
    '...kkkkkkkkkk...',
    '..kkkkkkkkkkkk..',
    '.kkk88kkkk88kkk.',
    '.kk8008kk8008kk.',
    '.kk8008kk8008kk.',
    '.kkk88kkkk88kkk.',
    '.kkkkkkkkkkkkkk.',
    '.kkkkkllllkkkkk.',
    '.kkkkkkllkkkkkk.',
    '.kkkkkkkkkkkkkk.',
    '.kkk.kkkk.kkkk..',
    '..k...kk...kk...',
    '..........k.....',
    '................');
const Shade1 = PixelSprite.fromRows(
    '................',
    '.....kkkkkk.....',
    '...kkkkkkkkkk...',
    '..kkkkkkkkkkkk..',
    '.kkk88kkkk88kkk.',
    '.kk8008kk8008kk.',
    '.kk8008kk8008kk.',
    '.kkk88kkkk88kkk.',
    '.kkkkkkkkkkkkkk.',
    '.kkkkkllllkkkkk.',
    '.kkkkkkllkkkkkk.',
    '.kkkkkkkkkkkkkk.',
    '..kkkk.kkkk.kkk.',
    '...kk...kk...k..',
    '.....k..........',
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

// the bonus vegetables, one a depth: carrot, turnip, mushroom, pepper, eggplant, melon, pineapple, gold
const Veg = [
    PixelSprite.fromRows(
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
        '................'),
    PixelSprite.fromRows(
        '....9..9..9.....',
        '....a9.9.9a.....',
        '.....a999a......',
        '......aaa.......',
        '.....hhhhh......',
        '...hhgggghhh....',
        '..hgggggggggh...',
        '..8888888888g...',
        '.888888888888...',
        '.888888888888...',
        '.888888888881...',
        '..88888888811...',
        '...888888811....',
        '.....88881......',
        '.......8........',
        '................'),
    PixelSprite.fromRows(
        '................',
        '.....iiiiii.....',
        '...ii88iiiiii...',
        '..iii88iii88ii..',
        '.iiiiiiiii88iii.',
        '.ii88iiiiiiii88.',
        'iii88iii88iii88i',
        'iiiiiiii88iiiiii',
        '.jjjjjjjjjjjjjj.',
        '.....111111.....',
        '.....111111.....',
        '.....11111e.....',
        '.....11111e.....',
        '....111111ee....',
        '....11111111....',
        '................'),
    PixelSprite.fromRows(
        '.......aa.......',
        '......aa........',
        '...99999999.....',
        '..9999999999a...',
        '.999899999999a..',
        '.9989999999999a.',
        '.9989999999999a.',
        '.9999999999999a.',
        '.9999999999999a.',
        '.9999999999999a.',
        '.a999999999999a.',
        '..a99999999999a.',
        '..a9999a9999aa..',
        '...aaa..aaaa....',
        '................',
        '................'),
    PixelSprite.fromRows(
        '.....a.a........',
        '....aa9aa.......',
        '....a999a.......',
        '.....hhh........',
        '....hgggh.......',
        '...hgg8ggh......',
        '...hg8gggh......',
        '..hgggggggh.....',
        '..hggggggggh....',
        '..hgggggggggh...',
        '..hggggggggggh..',
        '...hggggggggggh.',
        '...hhggggggggh..',
        '.....hhgggghh...',
        '.......hhhh.....',
        '................'),
    PixelSprite.fromRows(
        '................',
        '.....aaaaaa.....',
        '...aa9a9a9aaa...',
        '..a99a9a9a9a9a..',
        '.a9a99a9a9a9a9a.',
        '.a9a9a99a9a9a9a.',
        'a9a9a9a9a9a9a9aa',
        'a989a9a9a9a9a9aa',
        'a989a9a9a9a9a9aa',
        'a9a9a9a9a9a9a9aa',
        '.a9a9a9a9a9a9aa.',
        '.a9a9a9a9a9a9aa.',
        '..aa9a9a9a9aaa..',
        '...aaaaaaaaaa...',
        '.....aaaaaa.....',
        '................'),
    PixelSprite.fromRows(
        '....9..a..9.....',
        '.....9aa99......',
        '...a..999..a....',
        '....aa9a9aa.....',
        '.....dddddd.....',
        '....d7dd7dd7....',
        '...dd7dd7dd7d...',
        '...7dd7dd7dd7...',
        '...dd7dd7dd7d...',
        '...d7dd7dd7dd...',
        '...7dd7dd7dd7...',
        '...dd7dd7dd7d...',
        '....d7dd7dd7....',
        '.....dddddd.....',
        '................',
        '................'),
    PixelSprite.fromRows(
        '................',
        '................',
        '.......dd.......',
        '.....dddddd.....',
        '....d88dddddd...',
        '...dd88ddddd7d..',
        '..ddddddddd77dd.',
        '.dddddddd8dddd7.',
        '.ddddddddddddd7.',
        '.dd7ddddddd7d77.',
        '..dd77ddddd777..',
        '...dddd777777...',
        '.....7777777....',
        '................',
        '................',
        '................'),
];

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

// a small queen for the HUD and the depth card: a crowned purple grub (16 x 16)
const QueenIcon = PixelSprite.fromRows(
    '...d..d..d......',
    '...dddddddd.....',
    '...dddddddd.....',
    '..hhhhhhhhhh....',
    '.hgggggggggggh..',
    'hgg888ggg888ggh.',
    'hgg800ggg800ggh.',
    'hgg888ggg888ggh.',
    'hggggggggggggggh',
    'h66666666666666h',
    'hg666666666666gh',
    'hggggggggggggggh',
    '.hgggggggggggggh',
    '..hhhhhhhhhhhhh.',
    '..h.h.h..h.h.h..',
    '.h.h.h..h.h.h...');

const SkyName = { sky: 'sky', dusk: 'dusk', night: 'night' };
// the speckle: the same few dashes in every tile, shifted per stratum
const Specks = [[2, 3], [10, 1], [6, 8], [13, 10], [1, 13], [9, 13]];
// stars in the night sky (x, y within the sky strip)
const Stars = [[14, 3], [41, 9], [63, 2], [97, 6], [118, 11], [173, 4], [196, 10], [221, 3], [247, 8], [268, 2], [33, 13], [208, 13]];

function kindColour(kind) { return kind === PestKind.Bug ? 'orange' : kind === PestKind.Lizard ? 'green' : kind === PestKind.Driller ? 'purple' : kind === PestKind.Shade ? 'cyan' : 'red'; }
function kindDark(kind) { return kind === PestKind.Bug ? 'orangeDk' : kind === PestKind.Lizard ? 'greenDk' : kind === PestKind.Driller ? 'purpleDk' : kind === PestKind.Shade ? 'cyanDk' : 'redDk'; }
function kindSprite(kind, frame) {
    switch (kind) {
        case PestKind.Lizard: return frame === 0 ? Liz0 : Liz1;
        case PestKind.Driller: return frame === 0 ? Drill0 : Drill1;
        case PestKind.Shade: return frame === 0 ? Shade0 : Shade1;
        case PestKind.Scorcher: return frame === 0 ? Scorch0 : Scorch1;
        default: return frame === 0 ? Bug0 : Bug1;
    }
}

export class TunnelRatRenderer {
    constructor() {
        const pal = TunnelRatPalette;
        this.pal = pal;
        this.cBg = pal.get('bg'); this.cSky = pal.get('sky'); this.cWhite = pal.get('white');
        this.cOrange = pal.get('orange'); this.cOrangeDk = pal.get('orangeDk');
        this.cGreen = pal.get('green'); this.cGreenDk = pal.get('greenDk');
        this.cBlue = pal.get('blue'); this.cBlueDk = pal.get('blueDk');
        this.cYellow = pal.get('yellow'); this.cGrey = pal.get('grey'); this.cGreyDk = pal.get('greyDk');
        this.cPurple = pal.get('purple'); this.cPurpleDk = pal.get('purpleDk');
        this.cRed = pal.get('red'); this.cRedDk = pal.get('redDk');
        this.cCyan = pal.get('cyan'); this.cCyanDk = pal.get('cyanDk');
        this.cDirt = []; this.cSpeck = []; this.cLip = [];
        this._depth = -1;
        this._setDepth(1);
        // the earth cache
        this._earth = new PixelSurface(PxW, PxH);
        this._earthU = new Uint32Array(this._earth.data.buffer, this._earth.data.byteOffset, PxW * PxH);
        this._gen = -1; this._cacheDepth = -1; this._field = null;
        this._seen = new Uint32Array(TunnelField.W * TunnelField.H);
    }

    _setDepth(n) {
        if (n === this._depth) return;
        this._depth = n;
        const d = STAGES[Math.max(0, Math.min(STAGES.length - 1, n - 1))];
        for (let i = 0; i < 4; i++) { this.cDirt[i] = this.pal.get(d.earth[i]); this.cSpeck[i] = this.pal.get(d.speck[i]); this.cLip[i] = this.pal.get(d.lip[i]); }
        this.cSkyNow = this.pal.get(SkyName[d.sky] || 'sky');
        this.night = d.sky === 'night';
    }

    // ------------------------------------------------------------------ the frame
    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.field == null) return;
        this._setDepth(r.stage);

        // the jolt: a rock landing, a death, the queen (1-2 px, alternating at 12 Hz, a few tenths of a second)
        const sh = r.shake > 0 ? ((Math.trunc(f32(r.shake * 24)) & 1) === 0 ? r.shakeAmp : -r.shakeAmp) : 0;

        this._drawHud(s, r, t);
        s.clip(OX, SkyY, PxW, PxH + 16);
        this._drawSky(s, r, sh);
        this._drawEarth(s, r, sh);

        const oy = OY + sh;
        for (const rk of r.rocks) this._drawRock(s, rk, r, oy);
        if (r.vegActive && (r.vegT < f32(r.vegSeconds - f32(3)) || SurfaceDraw.blink(r.vegT, 1)))
            s.blit(Veg[Math.min(Veg.length - 1, r.def.veg)], OX + r.StartCol * T, oy + r.StartRow * T, this.pal);
        for (const p of r.pests) if (p.alive && p.kind === PestKind.Scorcher && p.breath === 1) this._drawEmberLine(s, p, r, oy);
        if (r.queen != null) this._drawQueen(s, r.queen, r, oy);
        for (const p of r.pests) this._drawPest(s, p, r, oy);
        for (const p of r.pests) if (p.alive && p.breath === 2) this._drawFire(s, p, r, oy);
        this._drawHose(s, r, oy);
        this._drawDigger(s, r, oy);
        // chips and floating points
        for (const f of r.fx) {
            const k = f.t / f.life, sz = k < 0.5 ? 2 : 1;
            s.rect(OX + Math.trunc(f.x), oy + Math.trunc(f.y), sz, sz, this.pal.get(f.c));
        }
        for (const u of r.popups) {
            if (u.t < f32(0.1)) continue;
            s.textCenteredShadow(u.text, OX + Math.trunc(u.x), oy + Math.trunc(u.y) - Math.trunc(f32(u.t * 8)), PixelFont.Arcade, this.pal.get(u.c), this.cBg);
        }
        s.noClip();

        this._drawOverlays(s, r, t);
    }

    // ------------------------------------------------------------------ HUD + sky
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 12, arc, this.cOrange);
        s.text(d6(Math.min(999999, r.score)), 28, 9, dsp, this.cWhite, 2);
        // centre: DEPTH n and one pip per pest still to get (the queen's depth: her pump meter)
        s.textCentered('DEPTH ' + r.stage, 176, 8, arc, this.cYellow);
        const q = r.queen;
        if (q != null) {
            const n = Math.max(1, q.need), w = Math.min(5, idiv(72, n)), x0 = 176 - idiv(n * w, 2);
            for (let i = 0; i < n; i++) {
                const c = i < q.inflate ? (q.alive ? this.cYellow : this.cWhite) : this.cPurpleDk;
                s.rect(x0 + i * w, 18, w - 1, 5, c);
            }
        } else {
            let n = 0;
            for (const p of r.pests) if (!p.minion) n++;
            const x0 = 176 - idiv(n * 8 - 2, 2);
            let i = 0;
            for (const p of r.pests) {
                if (p.minion) continue;
                if (p.alive) s.rect(x0 + i * 8, 18, 6, 6, this.pal.get(kindColour(p.kind)));
                else s.frame(x0 + i * 8, 18, 6, 6, this.pal.get(p.death === 3 ? 'greyDk' : kindDark(p.kind)));
                i++;
            }
        }
        // right: a digger per life
        for (let i = 0; i < r.lives && i < 4; i++) s.blit(DigR0, 296 - i * 18, 8, this.pal);
        if (r.lives > 4) s.text('+' + (r.lives - 4), 230, 12, arc, this.cWhite);
    }

    _drawSky(s, r, sh) {
        const y0 = SkyY + sh;
        s.rect(OX, y0, PxW, 16, this.cSkyNow);
        if (this.night) for (const [x, y] of Stars) s.setPixel(OX + x, y0 + y, (x & 2) === 0 ? this.cWhite : this.cYellow);
        // the shaft mouth over the centre column
        const mx = OX + r.StartCol * T;
        s.rect(mx + 2, y0 + 12, 12, 4, this.cBg);
        s.rect(mx + 4, y0 + 11, 8, 1, this.cBg);
        // a flower per depth reached, right-hand side
        for (let i = 0; i < r.stage; i++) s.blit(Flower, OX + PxW - 12 - i * 10, y0 + 5, this.pal);
    }

    _drawEarth(s, r, sh) {
        const f = r.field;
        if (f !== this._field || f.gen !== this._gen || this._cacheDepth !== this._depth) {
            this._field = f; this._gen = f.gen; this._cacheDepth = this._depth;
            for (let ty = 0; ty < TunnelField.H; ty++) for (let tx = 0; tx < TunnelField.W; tx++) this._renderTile(f, tx, ty);
            this._seen.set(f.tileVer);
        } else {
            const v = f.tileVer, seen = this._seen;
            for (let i = 0; i < v.length; i++)
                if (v[i] !== seen[i]) { seen[i] = v[i]; this._renderTile(f, i % TunnelField.W, idiv(i, TunnelField.W)); }
        }
        // copy the cache in by rows (inside the play window's clip)
        const u = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height), src = this._earthU;
        const yTop = SkyY, yBot = OY + PxH;
        for (let y = 0; y < PxH; y++) {
            const dy = OY + y + sh;
            if (dy < yTop || dy >= yBot) continue;
            u.set(src.subarray(y * PxW, y * PxW + PxW), dy * s.width + OX);
        }
    }

    _renderTile(f, tx, ty) {
        const e = this._earth;
        const st = TunnelField.stratum(ty);
        const dirt = this.cDirt[st], speck = this.cSpeck[st], lip = this.cLip[st];
        const px0 = tx * T, py0 = ty * T;
        e.rect(px0, py0, T, T, this.cBg);
        for (let j = 0; j < 4; j++)
            for (let i = 0; i < 4; i++) {
                const sx = tx * 4 + i, sy = ty * 4 + j;
                if (f.dug(sx, sy)) continue;
                e.rect(px0 + i * 4, py0 + j * 4, 4, 4, dirt);
            }
        // the speckle
        for (let k = 0; k < Specks.length; k++) {
            const sxp = (Specks[k][0] + st * 3) % 15, syp = (Specks[k][1] + st * 2) % 15;
            const sx = tx * 4 + idiv(sxp, 4), sy = ty * 4 + idiv(syp, 4);
            const sx2 = tx * 4 + idiv(sxp + 1, 4);
            if (f.dug(sx, sy) || f.dug(sx2, sy)) continue;
            e.rect(px0 + sxp, py0 + syp, 2, 1, speck);
        }
        // the lip where earth meets tunnel, and the tunnel's inside corners rounded
        for (let j = 0; j < 4; j++)
            for (let i = 0; i < 4; i++) {
                const sx = tx * 4 + i, sy = ty * 4 + j;
                const x = px0 + i * 4, y = py0 + j * 4;
                if (!f.dug(sx, sy)) {
                    if (f.dug(sx - 1, sy)) e.rect(x, y, 1, 4, lip);
                    if (f.dug(sx + 1, sy)) e.rect(x + 3, y, 1, 4, lip);
                    if (f.dug(sx, sy - 1)) e.rect(x, y, 4, 1, lip);
                    if (f.dug(sx, sy + 1)) e.rect(x, y + 3, 4, 1, lip);
                    continue;
                }
                const up = !f.dug(sx, sy - 1) && f.inSub(sx, sy - 1), dn = !f.dug(sx, sy + 1) && f.inSub(sx, sy + 1);
                const lf = !f.dug(sx - 1, sy) && f.inSub(sx - 1, sy), rt = !f.dug(sx + 1, sy) && f.inSub(sx + 1, sy);
                if (up && lf) e.setPixel(x, y, lip);
                if (up && rt) e.setPixel(x + 3, y, lip);
                if (dn && lf) e.setPixel(x, y + 3, lip);
                if (dn && rt) e.setPixel(x + 3, y + 3, lip);
            }
    }

    // ------------------------------------------------------------------ actors
    _drawRock(s, rk, r, oy) {
        const x = OX + Math.trunc(roundEven(rk.x)), y = oy + Math.trunc(roundEven(rk.y));
        switch (rk.state) {
            case RockState.Rest:
                s.blit(RockSp, x, y, this.pal);
                if (rk.cracked) s.blit(CrackSp, x, y, this.pal);
                break;
            case RockState.Wobble: {
                let off = (Math.trunc(f32(rk.t * 5)) & 1) === 0 ? -1 : 1;     // 2.5 Hz
                if (r.underRock(rk)) off = (Math.trunc(f32(r.time * 5)) & 1) === 0 ? -1 : 1;
                s.blit(RockSp, x + off, y, this.pal);
                if (rk.cracked || rk.chained) s.blit(CrackSp, x + off, y, this.pal);
                break;
            }
            case RockState.Fall:
                s.blit(RockSp, x, y, this.pal);
                if (rk.cracked || rk.chained) s.blit(CrackSp, x, y, this.pal);
                // speed lines over it
                s.rect(x + 4, y - 4, 1, 3, this.cGrey); s.rect(x + 11, y - 5, 1, 3, this.cGrey);
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

    _drawPest(s, p, r, oy) {
        const x = OX + Math.trunc(roundEven(p.x)), y = oy + Math.trunc(roundEven(p.y));
        const flip = p.face === Dir4.Left;
        if (!p.alive) {
            if (p.death === 1 && p.deadT < f32(0.45)) this._drawPop(s, x + 8, y + 8, p.deadT, p.kind);
            else if (p.death === 2 && p.deadT < f32(0.6)) {
                // flattened under the rock
                const c = this.pal.get(kindColour(p.kind)), d = this.pal.get(kindDark(p.kind));
                s.rect(x - 1, y + 11, 18, 5, d);
                s.rect(x, y + 12, 16, 3, c);
                s.rect(x + 4, y + 12, 3, 2, this.cWhite); s.rect(x + 9, y + 12, 3, 2, this.cWhite);
            }
            return;
        }
        if (p.hatch > 0) { this._drawEgg(s, x, y, p.hatch); return; }
        if (p.kind === PestKind.Shade && !p.open && p.stage === 0) { this._drawGhost(s, p, x, y); return; }
        if (p.ghost || p.reform > f32(r.reformSeconds * f32(0.5))) { this._drawGhost(s, p, x, y); return; }
        if (p.stage > 0) { this._drawInflated(s, p, x + 8, y + 8, p.stage, r.pumpPhase, flip); return; }
        const frame = Math.trunc(p.walk / 5.0) & 1;
        const spr = kindSprite(p.kind, p.kind === PestKind.Driller ? (Math.trunc(p.walk / 2.0) & 1) : frame);
        s.blit(spr, x, y, this.pal, 1, flip);
        if (p.kind === PestKind.Driller && p.boring) {
            // earth spraying off the bit
            const c = this.cDirt[Math.max(0, Math.min(3, TunnelField.stratumAtPx(p.y)))];
            const ph = Math.trunc(p.walk / 3.0) & 1;
            const fx = flip ? x - 2 : x + 16;
            s.rect(fx, y + 4 + ph * 3, 2, 2, c); s.rect(fx + (flip ? -2 : 2), y + 9 - ph * 3, 2, 2, c);
        }
        if (p.breather && p.breath === 1) {
            // the wind-up: a glow at the mouth that swells until the flame comes
            const wind = p.kind === PestKind.Scorcher ? f32(r.fireWindup + f32(0.35)) : r.fireWindup;
            const k = Math.min(1, f32(p.breathT / Math.max(f32(0.05), wind)));
            const mx = flip ? x - 1 : x + 14, my = y + 8;
            const g = 2 + Math.trunc(f32(k * 3));
            s.rect(mx - idiv(g, 2) + (flip ? 0 : 1), my - idiv(g, 2), g + 1, g + 1, p.kind === PestKind.Scorcher ? this.cRed : this.cOrange);
            s.rect(mx - idiv(g, 2) + (flip ? 1 : 2), my - idiv(g, 2) + 1, Math.max(1, g - 1), Math.max(1, g - 1), this.cYellow);
        }
        if (p.flee && !p.escaping) {
            // the last one, running: a bang over its head
            s.rect(x + 7, y - 9, 2, 5, this.cWhite); s.rect(x + 7, y - 3, 2, 2, this.cWhite);
        }
        if (p.hitT > 0) s.frame(x, y, 16, 16, this.cWhite);
    }

    _drawEgg(s, x, y, hatch) {
        // an egg in the queen's tunnel, cracking open
        s.circle(x + 8, y + 10, 5, this.cSky, true);
        s.rect(x + 4, y + 4, 8, 5, this.cSky);
        s.rect(x + 5, y + 3, 6, 1, this.cSky);
        s.rect(x + 5, y + 5, 2, 2, this.cWhite);
        if (hatch < f32(0.5)) { s.rect(x + 6, y + 8, 2, 1, this.cBg); s.rect(x + 8, y + 9, 2, 1, this.cBg); s.rect(x + 10, y + 8, 1, 1, this.cBg); }
    }

    _drawGhost(s, p, x, y) {
        // goggles solid, the body a 50 % dither
        const sp = kindSprite(p.kind, 0);
        const flip = p.face === Dir4.Left;
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                const v = sp.at(flip ? sp.width - 1 - i : i, j);
                if (v < 0) continue;
                const solid = v === 8 || v === 0;
                if (!solid && ((x + i + y + j) & 1) !== 0) continue;
                s.setPixel(x + i, y + j, this.pal.get(v));
            }
    }

    _drawInflated(s, p, cx, cy, stage, pump, flip) {
        let R = 8 + 2 * stage;                       // 10, 12, 14: 20-28 px across
        if (p.hooked && pump > f32(0.8)) R += 1;      // the swell of the next stroke
        const body = this.pal.get(kindColour(p.kind)), rim = p.hitT > 0 ? this.cWhite : this.pal.get(kindDark(p.kind));
        s.circle(cx, cy, R, rim, true);
        s.circle(cx, cy, R - 2, body, true);
        // a shine
        s.rect(cx - idiv(R, 2), cy - idiv(R, 2) - 1, 3, 2, this.cWhite);
        const e = 2 + idiv(stage, 2);                 // goggle radius
        const dir = flip ? -1 : 1;
        const dark = this.pal.get(kindDark(p.kind));
        if (p.kind === PestKind.Lizard || p.kind === PestKind.Scorcher) {
            // wings on top, one big eye, the mouth pulled wide
            s.rect(cx - R + 2, cy - R - 1, 6, 4, p.kind === PestKind.Scorcher ? this.cYellow : this.cGreenDk);
            s.circle(cx + dir * idiv(R, 2), cy - idiv(R, 3), e + 1, this.cWhite, true);
            s.rect(cx + dir * idiv(R, 2) + dir * 1 - 1, cy - idiv(R, 3) - 1, 2, 3, this.cBg);
            s.rect(cx + dir * idiv(R, 3) - 3, cy + idiv(R, 3), 8, 2, this.cOrangeDk);
        } else {
            const gy = cy - idiv(R, 3);
            s.rect(cx - R + 2, gy - 1, 2 * R - 3, 3, dark);   // the goggle strap
            s.circle(cx - idiv(R, 3) - 1, gy, e + 1, dark, true);
            s.circle(cx + idiv(R, 3) + 1, gy, e + 1, dark, true);
            s.circle(cx - idiv(R, 3) - 1, gy, e, this.cWhite, true);
            s.circle(cx + idiv(R, 3) + 1, gy, e, this.cWhite, true);
            s.rect(cx - idiv(R, 3) - 1 + dir, gy - 1, 2, 2, this.cBg);
            s.rect(cx + idiv(R, 3) + 1 + dir, gy - 1, 2, 2, this.cBg);
            if (p.kind === PestKind.Driller) {
                // the bit, still on its nose
                s.rect(cx + dir * (R - 1) - (flip ? 3 : 0), cy - 2, 4, 5, this.cGrey);
                s.rect(cx + dir * (R + 3) - (flip ? 1 : 0), cy - 1, 2, 3, this.cGreyDk);
            } else {
                // little feet sticking out
                s.rect(cx - idiv(R, 2) - 1, cy + R - 2, 4, 3, dark);
                s.rect(cx + idiv(R, 2) - 2, cy + R - 2, 4, 3, dark);
            }
        }
        if (stage >= 3) {
            // strain marks
            s.rect(cx - R - 3, cy - 1, 2, 2, this.cWhite);
            s.rect(cx + R + 2, cy - 1, 2, 2, this.cWhite);
        }
    }

    _drawPop(s, cx, cy, dt, kind) {
        const k = f32(dt / f32(0.45));
        const rad = 10 + Math.trunc(f32(k * 16));
        const body = this.pal.get(kindColour(kind));
        if (k < f32(0.35)) s.circle(cx, cy, 14, this.cWhite, true);
        for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6 + 0.2;
            const bx = cx + Math.trunc(Math.cos(a) * rad), by = cy + Math.trunc(Math.sin(a) * rad);
            s.rect(bx - 2, by - 2, 4, 4, (i & 1) === 0 ? body : this.cWhite);
        }
        if (k >= f32(0.35)) s.circle(cx, cy, rad - 4, this.cWhite, false);
    }

    _drawFire(s, p, r, oy) {
        if (p.breath !== 2 || p.fireLen < 1) return;
        const len = Math.trunc(p.fireLen);
        const left = p.face === Dir4.Left;
        const scorch = p.kind === PestKind.Scorcher;
        const outer = scorch ? this.cRed : this.cOrange;
        const x0 = OX + Math.trunc(roundEven(p.x)) + (left ? 0 : T), cy = oy + Math.trunc(roundEven(p.y)) + 8;
        for (let i = 0; i < len; i++) {
            // a tongue that swells then tapers, with jagged edges
            const u = f32(i / Math.max(1, len));
            const inner = Math.min(f32(1), f32(f32(u * f32(1.3)) + f32(0.15)));
            const sinVal = f32(Math.sin(inner * Math.PI * 0.95));
            let h = 4 + Math.trunc(f32(6 * sinVal)) + (scorch ? 2 : 0);
            h += (idiv(i, 3) & 1) === 0 ? 1 : 0;
            const x = left ? x0 - 1 - i : x0 + i;
            s.rect(x, cy - idiv(h, 2) - 1, 1, h + 2, outer);
            if (h > 3) s.rect(x, cy - idiv(h, 2) + 1, 1, h - 2, this.cYellow);
            if (h > 7 && u < f32(0.7)) s.rect(x, cy - 1, 1, 2, this.cWhite);
        }
    }

    // a scorcher's warning: embers along the row its flame will burn, laid out as the glow grows
    _drawEmberLine(s, p, r, oy) {
        const wind = f32(r.fireWindup + f32(0.35));
        const k = Math.min(1, f32(p.breathT / Math.max(f32(0.05), wind)));
        const reach = Math.trunc(r.scorchMax(p) * k);
        const left = p.face === Dir4.Left;
        const x0 = OX + Math.trunc(roundEven(p.x)) + (left ? 0 : T), cy = oy + Math.trunc(roundEven(p.y)) + 8;
        for (let i = 3, n = 0; i <= reach; i += 6, n++) {
            const x = left ? x0 - i : x0 + i - 2;
            s.rect(x, cy - 1, 2, 2, (n & 1) === 0 ? this.cRed : this.cYellow);
            s.setPixel(x, cy - 4 + (n % 3) * 3, this.cRedDk);
        }
    }

    _drawQueen(s, q, r, oy) {
        const x = OX + Math.trunc(roundEven(q.x)), y = oy + Math.trunc(roundEven(q.y));
        const cx = x + 16, cy = y + 17;
        const flip = q.face === Dir4.Left, dir = flip ? -1 : 1;
        if (!q.alive) {
            // the big pop: a white flash, then her bits flying in a ring
            const k = f32(q.deadT / f32(0.9));
            if (k >= 1) return;
            const rad = 16 + Math.trunc(f32(k * 40));
            if (k < f32(0.25)) s.circle(cx, cy, 26, this.cWhite, true);
            for (let i = 0; i < 16; i++) {
                const a = i * Math.PI / 8 + 0.1;
                const bx = cx + Math.trunc(Math.cos(a) * rad), by = cy + Math.trunc(Math.sin(a) * rad);
                s.rect(bx - 3, by - 3, 6, 6, (i % 3) === 0 ? this.cYellow : (i & 1) === 0 ? this.cPurple : this.cWhite);
            }
            if (k >= f32(0.25)) s.circle(cx, cy, rad - 6, this.cWhite, false);
            return;
        }
        let R = 14 + q.inflate;                              // swells a pixel a stroke: 28 px to over 40
        if (q.layT > 0 && (Math.trunc(f32(q.layT * 5)) & 1) === 0) R += 1;   // straining to lay (2.5 Hz)
        if (q.hooked && r.pumpPhase > f32(0.8)) R += 1;
        const rim = q.hitT > 0 ? this.cWhite : this.cPurpleDk;
        if (q.inflate === 0) {
            // legs, scuttling
            const ph = Math.trunc(q.walk / 4.0) & 1;
            for (let i = 0; i < 4; i++) {
                const lx = cx - 12 + i * 7 + (ph === (i & 1) ? 1 : -1);
                s.rect(lx, cy + R - 3, 2, 4, this.cPurpleDk);
                s.rect(lx + (ph === 0 ? -1 : 1), cy + R + 1, 2, 1, this.cPurpleDk);
            }
        }
        s.circle(cx, cy, R, rim, true);
        s.circle(cx, cy, R - 2, this.cPurple, true);
        // her belly band
        s.rect(cx - R + 3, cy + idiv(R, 3), 2 * R - 5, 3, this.cOrange);
        // a shine
        s.rect(cx - idiv(R, 2) - 1, cy - idiv(R, 2) - 2, 4, 2, this.cWhite);
        // the goggles
        const gy = cy - idiv(R, 4), e = 3 + idiv(q.inflate, 4);
        s.rect(cx - R + 3, gy - 1, 2 * R - 5, 3, this.cPurpleDk);
        for (const gx of [cx - idiv(R, 3) - 1, cx + idiv(R, 3) + 1]) {
            s.circle(gx, gy, e + 1, this.cPurpleDk, true);
            s.circle(gx, gy, e, this.cWhite, true);
            s.rect(gx + dir * (q.stunT > 0 ? 0 : 1) - 1, gy - 1, 2, 2, this.cBg);
        }
        // mandibles toward the way she bores
        if (q.inflate === 0) {
            s.rect(cx + dir * (R - 2) - (flip ? 3 : 0), cy + 2, 4, 2, this.cYellow);
            s.rect(cx + dir * (R - 2) - (flip ? 3 : 0), cy + 6, 4, 2, this.cYellow);
        }
        // the crown
        const ky = cy - R - 4;
        s.rect(cx - 6, ky + 2, 13, 3, this.cYellow);
        s.rect(cx - 6, ky, 2, 2, this.cYellow); s.rect(cx, ky - 1, 1, 3, this.cYellow); s.rect(cx + 5, ky, 2, 2, this.cYellow);
        s.rect(cx - 1, ky + 3, 3, 1, this.cRed);
        if (q.inflate >= q.need - 2) {
            // nearly there: strain marks
            s.rect(cx - R - 4, cy - 1, 3, 2, this.cWhite); s.rect(cx + R + 2, cy - 1, 3, 2, this.cWhite);
            s.rect(cx - 1, cy - R - 8, 2, 2, this.cWhite);
        }
        if (q.stunT > 0) {
            // stars round her head (they go round once a second)
            for (let i = 0; i < 3; i++) {
                const a = f32(q.stunT * 2 * Math.PI * 0.5) + i * 2.094;
                s.rect(cx + Math.trunc(Math.cos(a) * 14) - 1, cy - R - 2 + Math.trunc(Math.sin(a) * 3), 3, 3, this.cYellow);
            }
        }
    }

    _drawHose(s, r, oy) {
        if (r.hose === HoseState.None || r.p !== Phase.Play) return;
        const len = Math.trunc(roundEven(r.hoseLen));
        const dx = Dir4.dx(r.hoseDir), dy = Dir4.dy(r.hoseDir);
        const x0 = OX + Math.trunc(roundEven(r.dx)) + 8, y0 = oy + Math.trunc(roundEven(r.dy)) + 8;
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

    _drawDigger(s, r, oy) {
        const x = OX + Math.trunc(roundEven(r.dx)), y = oy + Math.trunc(roundEven(r.dy));
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
    _feature(s, def, cx, cy) {
        // the depth's new thing, drawn at 2x (32 x 32) centred on (cx, cy)
        const x = cx - 16, y = cy - 16;
        switch (def.feature) {
            case 'lizard': s.blit(Liz0, x, y, this.pal, 2); break;
            case 'driller': s.blit(Drill0, x, y, this.pal, 2); break;
            case 'shade': s.blit(Shade0, x, y, this.pal, 2); break;
            case 'scorcher': s.blit(Scorch0, x, y, this.pal, 2); break;
            case 'queen': s.blit(QueenIcon, x, y, this.pal, 2); break;
            case 'chain': s.blit(RockSp, cx - 8, cy - 16, this.pal); s.blit(RockSp, cx - 8, cy, this.pal); s.blit(CrackSp, cx - 8, cy - 16, this.pal); break;
            case 'warren':
                s.blit(Bug0, cx - 17, cy - 16, this.pal); s.blit(Drill0, cx + 1, cy - 16, this.pal);
                s.blit(Shade0, cx - 17, cy, this.pal); s.blit(Scorch0, cx + 1, cy, this.pal);
                break;
            default: s.blit(Bug0, x, y, this.pal, 2); break;
        }
    }

    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + Math.trunc(PxH / 2);
        switch (r.p) {
            case Phase.Ready: {
                if (r.cardUp) {
                    // the DEPTH card: number and name, the new thing at either side, two lines of advice
                    const def = r.def, h = r.mercyActive ? 108 : 98, y0 = midY - 52;
                    s.plate(midX - 124, y0, 248, h, this.cBg, this.cOrange);
                    s.frame(midX - 122, y0 + 2, 244, h - 4, this.cOrange);
                    s.textCentered('DEPTH ' + r.stage, midX, y0 + 8, dsp, this.cYellow, 2);
                    s.textCentered(def.name, midX, y0 + 30, dsp, this.cWhite);
                    this._feature(s, def, midX - 96, y0 + 24);
                    this._feature(s, def, midX + 96, y0 + 24);
                    s.textCentered(def.hint[0], midX, y0 + 48, arc, this.cSky);
                    s.textCentered(def.hint[1], midX, y0 + 58, arc, this.cSky);
                    if (SurfaceDraw.blink(f32(r.phaseTime + f32(0.25)), 1) || r.phaseTime > f32(r.readyLength - f32(0.6)))
                        s.textCentered(r.phaseTime > f32(r.readyLength - f32(0.6)) ? 'DIG!' : 'GET READY', midX, y0 + 74, arc, this.cOrange, 2);
                    if (r.mercyActive) s.textCentered('FREE DIG', midX, y0 + 94, arc, this.cGreen);
                } else {
                    s.plate(midX - 74, midY - 34, 148, r.mercyActive ? 70 : 58, this.cBg, this.cOrange);
                    s.frame(midX - 72, midY - 32, 144, (r.mercyActive ? 70 : 58) - 4, this.cOrange);
                    s.textCentered('DEPTH ' + r.stage, midX, midY - 26, dsp, this.cYellow, 2);
                    s.textCentered('PLAYER 1', midX, midY - 6, arc, this.cWhite);
                    if (SurfaceDraw.blink(f32(r.phaseTime + f32(0.25)), 1) || r.phaseTime > f32(r.readyLength - f32(0.5)))
                        s.textCentered('GET READY', midX, midY + 6, arc, this.cOrange, 2);
                    if (r.mercyActive) s.textCentered('FREE DIG', midX, midY + 24, arc, this.cGreen);
                }
                break;
            }
            case Phase.Play:
                if (r.hurryT >= 0 && f32(r.time - r.hurryT) < f32(1.6))
                    s.textBox('HURRY UP!', midX, midY - 60, dsp, 2, this.cRed, this.cRed, this.cBg);
                break;
            case Phase.Clear:
                if (r.phaseTime > f32(0.5)) {
                    if (r.queenStage) {
                        s.textBox('THE QUEEN', midX, midY - 22, dsp, 2, this.cYellow, this.cPurple, this.cBg);
                        s.textBox('IS POPPED!', midX, midY + 6, dsp, 3, this.cWhite, this.cPurple, this.cBg);
                    } else {
                        s.textBox('DEPTH ' + r.stage, midX, midY - 22, dsp, 2, this.cYellow, this.cOrange, this.cBg);
                        s.textBox('CLEAR!', midX, midY + 6, dsp, 3, this.cWhite, this.cOrange, this.cBg);
                    }
                }
                break;
            case Phase.Tally: {
                const n = r.tally.length, h = 34 + n * 14;
                const y0 = midY - idiv(h, 2) - 8;
                s.plate(midX - 110, y0, 220, h, this.cBg, this.cOrange);
                s.frame(midX - 108, y0 + 2, 216, h - 4, this.cOrange);
                s.textCentered('DEPTH ' + r.stage + ' CLEAR', midX, y0 + 8, dsp, this.cYellow);
                for (let i = 0; i < n; i++) {
                    const L = r.tally[i];
                    if (!L.shown) continue;
                    const at = f32(0.4 + i * 0.6), k = Math.min(1, Math.max(0, f32(f32(r.phaseTime - at) / f32(0.4))));
                    const y = y0 + 24 + i * 14;
                    if (L.value < 0) { s.text(L.label, midX - 98, y, arc, this.cRed); continue; }
                    s.text(L.label, midX - 98, y, arc, L.value > 0 ? this.cWhite : this.cGreyDk);
                    const v = Math.trunc(roundEven(L.value * k / 10)) * 10;
                    s.textRight(String(v), midX + 98, y, arc, L.value > 0 ? this.cYellow : this.cGreyDk);
                }
                break;
            }
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
                s.plate(midX - 96, midY + 2, 192, 46, this.cBg, this.cOrange);
                s.textCentered('SCORE ' + d6(r.score), midX, midY + 8, arc, this.cWhite, 2);
                s.textCentered(won ? 'ALL EIGHT DEPTHS DUG' : 'DEPTH ' + r.stage + '  ' + r.def.name, midX, midY + 30, arc, this.cYellow);
                break;
            }
        }
        // an extra rat: a banner for two seconds, wherever the game is
        if (r.extraT >= 0 && f32(r.time - r.extraT) < f32(2.0) && r.p !== Phase.Card && r.p !== Phase.Over)
            s.textBox('EXTRA RAT!', midX, 200, arc, 2, this.cGreen, this.cGreen, this.cBg);
    }
}
