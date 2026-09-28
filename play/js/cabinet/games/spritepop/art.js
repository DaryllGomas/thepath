// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · THE ART.
// Port of the SpritePopArt class in SpritePopRenderer.cs (Staging/Batch2/spritepop), split out so the
// spec (title art) and the renderer can both use it without an import cycle. Takes the palette as an
// argument, never imports spec.js.
//
// Sprites are text rows of SYMBOLS mapped to palette colour NAMES (not the SDK's 0-9a-z indices):
//   K bg  S shadow  P pink  p pinkLight  D pinkDark  B blue  b blueDark  W white  C green  c greenDark
//   G cub  g cubDark  Y yellow  O orange  R red  r redDark      (anything else = transparent)
// Every sprite faces RIGHT; the renderer mirrors for facing.
import { PixelSprite, idiv } from '../../sdk/index.js';

// symbol -> palette colour name
const Map_ = new Map([
    ['K', 'bg'], ['S', 'shadow'], ['P', 'pink'], ['p', 'pinkLight'], ['D', 'pinkDark'],
    ['B', 'blue'], ['b', 'blueDark'], ['W', 'white'], ['C', 'green'], ['c', 'greenDark'],
    ['G', 'cub'], ['g', 'cubDark'], ['Y', 'yellow'], ['O', 'orange'], ['R', 'red'], ['r', 'redDark'],
]);

// rows -> a palette-indexed sprite; `swap` (a Map char -> char) recolours symbols first (ANGRY, WHITE)
export function build(pal, rows, swap = null) {
    const h = rows.length;
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    const s = new PixelSprite(w, h);
    for (let j = 0; j < h; j++)
        for (let i = 0; i < rows[j].length; i++) {
            let ch = rows[j][i];
            if (swap != null && swap.has(ch)) ch = swap.get(ch);
            const name = Map_.get(ch);
            if (name !== undefined) s.set(i, j, pal.indexOf(name));
        }
    return s;
}

// ---------------------------------------------------------------- the cub (faces right)
export const CubStand = [
    '......gggg......',
    '....ggGGGGgg....',
    '..YgGGGGGGGGg...',
    '.YYgGGGGGWWWWg..',
    '..YgGGGGWWWWKWg.',
    '.YYgGGGGWWWKKWg.',
    '..YgGGGGGWWWWGGg',
    '.YYgGGGGGGGGGGGg',
    '..gGGGGGGGGGgKKg',
    '.gGGGGYYYYGGGGg.',
    '.gGGGYYYYYYGGGGg',
    'gGGGYYYYYYYGGgg.',
    'gGGGYYYYYYYGg...',
    '.gGGGYYYYYGGg...',
    '..gOOOgggOOOg...',
    '.OOOO....OOOO...',
];
export const CubWalk = [
    '......gggg......',
    '....ggGGGGgg....',
    '..YgGGGGGGGGg...',
    '.YYgGGGGGWWWWg..',
    '..YgGGGGWWWWKWg.',
    '.YYgGGGGWWWKKWg.',
    '..YgGGGGGWWWWGGg',
    '.YYgGGGGGGGGGGGg',
    '..gGGGGGGGGGgKKg',
    '.gGGGGYYYYGGGGg.',
    '.gGGGYYYYYYGGGGg',
    'gGGGYYYYYYYGGgg.',
    'gGGGYYYYYYYGg...',
    '.gGGGYYYYYGGg...',
    '...gOOgggOOg....',
    '...OOO...OOO....',
];
export const CubJump = [
    '......gggg......',
    '....ggGGGGgg....',
    '..YgGGGGGGGGg...',
    '.YYgGGGGGWWWWg..',
    '..YgGGGGWWWWKWg.',
    '.YYgGGGGWWWKKWg.',
    '..YgGGGGGWWWWGGg',
    '.YYgGGGGGGGGGGGg',
    '..gGGGGGGGGGgKKg',
    '.gGGGGYYYYGGGGGg',
    'gGGGGYYYYYYGGGg.',
    'gGGGYYYYYYYGg...',
    '.gGGYYYYYYYGg...',
    '..gGGYYYYYGGg...',
    '..gOOOOgOOOOg...',
    '................',
];
export const CubBlow = [
    '......gggg......',
    '....ggGGGGgg....',
    '..YgGGGGGGGGg...',
    '.YYgGGGGGWWWWg..',
    '..YgGGGGWWWWKWg.',
    '.YYgGGGGWWWKKWg.',
    '..YgGGGGGWWWWGgg',
    '.YYgGGGGGGGGGgKK',
    '..gGGGGGGGGGgKWK',
    '.gGGGGYYYYGGgKKK',
    '.gGGGYYYYYYGGggg',
    'gGGGYYYYYYYGGGg.',
    'gGGGYYYYYYYGg...',
    '.gGGGYYYYYGGg...',
    '..gOOOgggOOOg...',
    '.OOOO....OOOO...',
];
export const CubDizzy = [
    '......gggg......',
    '....ggGGGGgg....',
    '..YgGGGGGGGGg...',
    '.YYgGGGGWWWWWg..',
    '..YgGGGWKWWWKWg.',
    '.YYgGGGWWKWKWWg.',
    '..YgGGGWWWKWWWGg',
    '.YYgGGGWWKWKWWGg',
    '..gGGGGWKWWWKWGg',
    '.gGGGGYWWWWWGGg.',
    '.gGGGYYYYYYGKKGg',
    'gGGGYYYYYYYGKKg.',
    'gGGGYYYYYYYGg...',
    '.gGGGYYYYYGGg...',
    '..gOOOgggOOOg...',
    '.OOOO....OOOO...',
];
export const CubHead = [                 // 12 x 12 HUD icon
    '....gggg....',
    '..ggGGGGgg..',
    '.YgGGGGWWWg.',
    'YYgGGGWWKWWg',
    '.YgGGGWWKKWg',
    'YYgGGGGWWWGg',
    '.YgGGGGGGGGg',
    '..gGGGGGGgKg',
    '..gGGYYYYGGg',
    '.gGGYYYYYGg.',
    '.gGGGYYYGGg.',
    '..ggggggg...',
];

// ---------------------------------------------------------------- the wind-up (faces right)
export const WindA = [
    '.......YY.......',
    '....YY.YY.YY....',
    '....YYYYYYYY....',
    '.......OO.......',
    '...cccccccccc...',
    '..cCCCCCCCCCCc..',
    '.cCCCWWWCCWWWCc.',
    '.cCCWWWKKWWWKKc.',
    '.cCCWWWKKWWWKKc.',
    '.cCCCWWWCCWWWCc.',
    '.cCCCCCCCCCCCCc.',
    '.cCCCCCKKKKKCCc.',
    '.cCCCCCCCCCCCCc.',
    '..cccccccccccc..',
    '..OOO......OOO..',
    '.OOOO.....OOOO..',
];
export const WindB = [
    '........Y.......',
    '......YYYY......',
    '........Y.......',
    '.......OO.......',
    '...cccccccccc...',
    '..cCCCCCCCCCCc..',
    '.cCCCWWWCCWWWCc.',
    '.cCCWWWKKWWWKKc.',
    '.cCCWWWKKWWWKKc.',
    '.cCCCWWWCCWWWCc.',
    '.cCCCCCCCCCCCCc.',
    '.cCCCCCKKKKKCCc.',
    '.cCCCCCCCCCCCCc.',
    '..cccccccccccc..',
    '....OOO..OOO....',
    '....OOOO.OOOO...',
];
export const WindHead = [                // 12 x 12 HUD icon
    '.....YY.....',
    '...YYYYYY...',
    '.....OO.....',
    '..cccccccc..',
    '.cCCCCCCCCc.',
    'cCWWWCCWWWCc',
    'cCWWKCCWWKCc',
    'cCWWWCCWWWCc',
    'cCCCCCCCCCCc',
    'cCCCKKKKCCCc',
    '.cCCCCCCCCc.',
    '..cccccccc..',
];

// ---------------------------------------------------------------- the whistler (faces right)
export const WhistleA = [
    '................',
    'WW...cccccc...WW',
    'WWW.cCCCCCCc.WWW',
    '.WWcCCCCCCCCcWW.',
    '..WcCCWWWCWWWCc.',
    '...cCWWKKWWKKCc.',
    '..cCCWWKKWWKKCc.',
    '..cCCCWWWCWWWCc.',
    '..cCCCCCCCCCOOOO',
    '..cCCCCCCCCOOOOO',
    '..cCCCCCCCCCOOO.',
    '...cCCCCCCCCc...',
    '....cCCCCCCc....',
    '.....cccccc.....',
    '......c..c......',
    '.....cc..cc.....',
];
export const WhistleB = [
    '................',
    '.....cccccc.....',
    '....cCCCCCCc....',
    '...cCCCCCCCCc...',
    '..cCCCWWWCWWWCc.',
    '..cCCWWKKWWKKCc.',
    '..cCCWWKKWWKKCc.',
    'W.cCCCWWWCWWWCcW',
    'WWcCCCCCCCCCOOOO',
    'WWWCCCCCCCCOOOOO',
    '.WWCCCCCCCCCOOOW',
    '..WcCCCCCCCCcWW.',
    '....cCCCCCCc....',
    '.....cccccc.....',
    '......c..c......',
    '.....cc..cc.....',
];

// ---------------------------------------------------------------- fruit (14 x 14)
export const FruitRows = [
    [                         // cherries
        '.........cc...',
        '........cCc...',
        '.......c..c...',
        '......c....c..',
        '.....c.....c..',
        '..RRRRc...RRRR',
        '.RRWRRRr.RRWRR',
        '.RWRRRRrRRWRRR',
        '.RRRRRRrRRRRRr',
        '.RRRRRRrRRRRRr',
        '.rRRRRrrRRRRrr',
        '..rrrr..rrrr..',
        '..............',
        '..............',
    ],
    [                         // banana
        '..........cc..',
        '..........Oc..',
        '.........YYO..',
        '........YYYY..',
        '.......YYYYY..',
        '......YWYYYY..',
        '....YYWYYYYO..',
        '..YYYWYYYYYO..',
        '.YYYYYYYYYO...',
        'OYYYYYYYYOO...',
        '.OOYYYYOOO....',
        '...OOOOO......',
        '..............',
        '..............',
    ],
    [                         // melon slice
        '..............',
        '..............',
        '..............',
        'RRRRRRRRRRRRRR',
        'RRKRRRKRRRKRRR',
        '.RRRRRRRRRRRR.',
        '.RRRKRRRRKRRR.',
        '..RRRRRRRRRR..',
        '..WWWWWWWWWW..',
        '...CCCCCCCC...',
        '....cccccc....',
        '..............',
        '..............',
        '..............',
    ],
    [                         // strawberry
        '....cCcCc.....',
        '...cCCCCCc....',
        '..RRRcCcRRR...',
        '.RRYRRRRRYRR..',
        '.RRRRRYRRRRR..',
        '.RYRRRRRRYRR..',
        '.RRRRYRRRRRr..',
        '..RRRRRRYRr...',
        '..RYRRRRRRr...',
        '...RRRYRRr....',
        '....RRRRr.....',
        '.....rrr......',
        '..............',
        '..............',
    ],
];

export const Angry = new Map([['C', 'R'], ['c', 'r']]);
export const White = new Map([['G', 'W'], ['g', 'W'], ['Y', 'W'], ['O', 'W'], ['K', 'W']]);

// the bubble ring as a sprite: radius R, ring 2 px (outer in `outer`, inner in `inner`), a glint
// (C# does this in doubles: plain JS numbers)
export function ring(pal, R, outer, inner, glint) {
    const D = R * 2;
    const s = new PixelSprite(D, D);
    const io = pal.indexOf(outer), ii = pal.indexOf(inner), iw = pal.indexOf('white');
    for (let j = 0; j < D; j++)
        for (let i = 0; i < D; i++) {
            const dx = i + 0.5 - R, dy = j + 0.5 - R, d = Math.sqrt(dx * dx + dy * dy);
            if (d < R && d >= R - 1.15) s.set(i, j, io);
            else if (d < R - 1.15 && d >= R - 2.3) s.set(i, j, ii);
            else if (glint && d < R - 3.2 && d >= R - 5.0) {
                const a = Math.atan2(dy, dx) * 180.0 / Math.PI;       // -180..180, y down
                if (a > -155 && a < -110) s.set(i, j, iw);
            }
        }
    if (glint) s.set(R - idiv(R, 2) - 1, R - idiv(R, 2) + 3, iw);
    return s;
}

// the title card's picture: the cub blowing, a small bubble, a creature caught in a big one
export function titleArt(pal) {
    const art = new PixelSprite(66, 24);
    stamp(art, build(pal, CubBlow), 0, 7, false);
    stamp(art, ring(pal, 5, 'blue', 'blueDark', true), 19, 10, false);
    stamp(art, build(pal, WindA), 42, 1, true);
    stamp(art, ring(pal, 11, 'blue', 'blueDark', true), 39, -2 + 1, false);
    stamp(art, build(pal, FruitRows[0]), 29, 0, false);
    return art;
}

function stamp(dst, src, x, y, flip) {
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(flip ? src.width - 1 - i : i, j);
            if (v >= 0) dst.set(x + i, y + j, v);
        }
}
