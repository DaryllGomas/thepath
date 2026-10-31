// THE NODE · world 1 · SHORT ORDER on the Cabinet Engine · THE ART: palette + sprites (data only).
// (From the ShortOrderArt class of the Unity port; the chili, the rival and the fries are new, and the palette
// grew a green, an ice and a hot-red kitchen plus orange and the rival's purple.)
// Its own file so spec.js (title art) and renderer.js (everything) read it without an import cycle.
//
// Sprites are authored with letter keys (K bg, l girder, L girderLt, C cream, T bun, t bunDk,
// G lettuce, g lettuceDk, R red, r redDk, W white, B blue, Y yellow, S skin, P patty, D dim);
// any other character is transparent. Walkers are 16 x 16 and face right.
import { Palette, PixelSprite } from '../../sdk/index.js';

export const ShortOrderPalette = new Palette(
    ['bg', 0x07070F],
    ['girder', 0x22357F],        // platform dark
    ['girderLt', 0x5A7FE6],
    ['cream', 0xFFEFC2],
    ['bun', 0xE59A42],           // bun tan
    ['bunDk', 0x9A5220],
    ['lettuce', 0x52CC3C],       // lettuce green
    ['lettuceDk', 0x1C7A2A],
    ['red', 0xE3302A],           // chaser red
    ['redDk', 0x8A1814],
    ['white', 0xFFFFFF],         // chef white
    ['blue', 0x3C5EF0],          // chef blue
    ['yellow', 0xF8D23A],
    ['skin', 0xF0B088],
    ['patty', 0x6A2C12],
    ['dim', 0x3A2848],
    ['girderG', 0x1F5A3A],       // the side-orders kitchen's tiles
    ['girderGLt', 0x56C98A],
    ['girderR', 0x7A2A22],       // the rush-order kitchen's tiles
    ['girderRLt', 0xE6705A],
    ['orange', 0xFF8A1A],        // belts, the chili
    ['ice', 0xA4DDF4],           // the dish pit's slick floor
    ['iceDk', 0x2E6C8E],
    ['purple', 0x9448D8],        // the rival
    ['purpleDk', 0x4E1E80],
).roles('bg', 'cream', 'red', 'yellow', 'dim');

const Keys = new Map([
    ['K', 'bg'], ['l', 'girder'], ['L', 'girderLt'], ['C', 'cream'], ['T', 'bun'], ['t', 'bunDk'],
    ['G', 'lettuce'], ['g', 'lettuceDk'], ['R', 'red'], ['r', 'redDk'], ['W', 'white'], ['B', 'blue'],
    ['Y', 'yellow'], ['S', 'skin'], ['P', 'patty'], ['D', 'dim'],
    ['O', 'orange'], ['I', 'ice'], ['i', 'iceDk'], ['U', 'purple'], ['u', 'purpleDk'],
]);

function make(...rows) {
    const h = rows.length;
    let w = 0;
    for (let j = 0; j < h; j++) w = Math.max(w, rows[j].length);
    const s = new PixelSprite(w, h);
    for (let j = 0; j < h; j++)
        for (let i = 0; i < rows[j].length; i++) {
            const name = Keys.get(rows[j][i]);
            if (name !== undefined) s.set(i, j, ShortOrderPalette.indexOf(name));
        }
    return s;
}

function paste(dst, src, x, y, flip) {
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(flip ? src.width - 1 - i : i, j);
            if (v >= 0) dst.set(x + i, y + j, v);
        }
}

// ------------------------------------------------------------------ the chef (faces right)
const ChefTop = [
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '...WWWWWWWWWW...',
    '....WWWWWWWW....',
    '....CCCCCCCC....',
    '....SSSSSKSS....',
    '....SSSSSSSSSS..',
    '.....SStttSS....',
    '....WWWWWWWW....',
];

const ChefWalkA = make(...ChefTop,
    '...WWWWWWWWWSS..',
    '...WWWWWWWWW....',
    '....BBBBBBBB....',
    '....BBB..BBB....',
    '...BBB....BBB...',
    '..ttt......ttt..');

const ChefWalkB = make(...ChefTop,
    '...WWWWWWWWWWSS.',
    '...WWWWWWWWW....',
    '....BBBBBBBB....',
    '.....BBBBBB.....',
    '.....BBBBBB.....',
    '.....tttttt.....');

const ChefClimb = make(
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '...WWWWWWWWWW...',
    '..S.WWWWWWWW....',
    '..W.CCCCCCCC....',
    '..W.SSSSSSSS....',
    '..WWSSSSSSSS....',
    '...WWWWWWWWWW...',
    '....WWWWWWWWW...',
    '....WWWWWWWWWS..',
    '....WWWWWWWWW...',
    '....BBBBBBBB....',
    '....BBB..BBB....',
    '....BBB...BB....',
    '...ttt.....tt...');

const ChefCheer = make(
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '...WWWWWWWWWW...',
    '....WWWWWWWW....',
    '.S..CCCCCCCC..S.',
    '.W..SSSSSSSS..W.',
    '.W..SKSSSSKS..W.',
    '.WW.SSSSSSSS.WW.',
    '..WWSStttSSSWW..',
    '...WWWWWWWWWW...',
    '....WWWWWWWW....',
    '....BBBBBBBB....',
    '....BBB..BBB....',
    '....BBB..BBB....',
    '...ttt....ttt...');

const ChefCaught = make(
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..........WWWW..',
    '........WWWWWWW.',
    '.SSSS...CWWWWWW.',
    'SKSSKS..C.WWWW..',
    'SSSSSSWWWWWWWBBB',
    'SSttSSWWWWWWWBBB',
    '.SSSS.SWWWWWWBBt',
    '......SS.....tt.');

const LifeIcon = make(
    '...WWWW...',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '..WWWWWW..',
    '..CCCCCC..',
    '..SKSSKS..',
    '..SSSSSS..',
    '..SStttS..',
    '...SSSS...');

const Shaker = make(
    '...CC...',
    '..CKCK..',
    '.CCCCCC.',
    '.DDDDDD.',
    '.WWWWWW.',
    '.WWWWWW.',
    '.WKWWKW.',
    '.WWKWWW.',
    '.WWWWKW.',
    '.WKWWWW.',
    '.WWWWWW.',
    '..WWWW..');

// ------------------------------------------------------------------ the chasers (face right)
const DogTop = [
    '......rRRr......',
    '.....rRRRRr.....',
    '....rRRRRRRr....',
    '....RRWKRRWK....',
    '....RRWKRRWK....',
    '....RRRRRRRR....',
    '...TRRRRRrrRRT..',
    '..TTRRRRRRRRTT..',
    '..TtRRRRRRRRtT..',
    '..TtRRRRRRRRtT..',
    '..TTtRRRRRRtTT..',
    '...TTtRRRRtTT...',
    '....TTTTTTTT....',
];
const PickleTop = [
    '......gGGg......',
    '.....gGGGGg.....',
    '....gGGGGGGg....',
    '....GGgGGGGG....',
    '....GGWKGGWK....',
    '....GgWKGGWK....',
    '....GGGGGGGG....',
    '....GgGGGggG....',
    '....GGGGGGGg....',
    '....gGGGgGGG....',
    '....GGGGGGgG....',
    '....GgGGGGGG....',
    '.....gGGGGg.....',
];
const EggTop = [
    '................',
    '......WWWW......',
    '...WWWWWWWWWW...',
    '..WWWWYYYYWWWW..',
    '.WWWWYYYYYYWWWW.',
    '.WWWYYWKYYWKWWW.',
    'WWWWYYWKYYWKWWWW',
    'WWWWYYYYYYYYWWWW',
    '.WWWWYYYttYYWWW.',
    '.WWWWWYYYYYWWWW.',
    '..WWWWWWWWWWWW..',
    '...WWWWWWWWWW...',
    '.....WWWWWW.....',
];
const ChiliTop = [
    '.......gG.......',
    '......gGG.......',
    '.....OOOOOO.....',
    '....OOOOOOOO....',
    '....OWKOOWKO....',
    '....OOOOOOOO....',
    '....OWrWrWrO....',
    '.....OOOOOO.....',
    '.....OrOOOO.....',
    '......OOOO......',
    '......OrOO......',
    '.......OO.......',
    '.......OO.......',
];
const RivalTop = [
    '.....UUUUUU.....',
    '...UUUUUUUUUU...',
    '..UUUUUUUUUUUU..',
    '..UUUUUUUUUUUU..',
    '...UUUUUUUUUU...',
    '...uuuuuuuuuu...',
    '....SSSSSSSS....',
    '....SRKSSRKS....',
    '....SuuuuuuS....',
    '...UUUUSSUUUU...',
    '..UUUUUUUUUUUU..',
    '..UUCCUUUUCCUU..',
    '...UUUUUUUUUU...',
];
const LegsA = ['.....{....{.....', '.....{....{.....', '....{{....{{....'];
const LegsB = ['......{..{......', '.....{....{.....', '....{{.....{{...'];

function buildFoes() {
    const tops = [DogTop, PickleTop, EggTop, ChiliTop, RivalTop];
    const legs = ['r', 'g', 'Y', 'r', 'u'];
    const all = [];
    for (let k = 0; k < 5; k++) {
        all[k] = [];
        for (let fr = 0; fr < 2; fr++) {
            const src = fr === 0 ? LegsA : LegsB;
            const rows = new Array(16);
            for (let j = 0; j < 13; j++) rows[j] = tops[k][j];
            for (let j = 0; j < 3; j++) rows[13 + j] = src[j].split('{').join(legs[k]);
            all[k][fr] = make(...rows);
        }
    }
    return all;
}

const Foe = buildFoes();

const Flat = [
    make('....rRRRRRRr....', '..TTRRRRRRRRTT..', '.TTRRKRRRRKRRTT.', '.TTTTTTTTTTTTTT.', '..rr........rr..'),
    make('.....gGGGGg.....', '...gGGGgGGGGg...', '..GGGKGGGGKGGG..', '...gGGGGGGGGg...', '..gg........gg..'),
    make('....WWWWWWWW....', '..WWWYYYYYYWWW..', '.WWWYKYYYYKYWWW.', '..WWWWWWWWWWWW..', '..YY........YY..'),
    make('..gG..OOOOOO....', '.OOOOOOOOOOOOOO.', 'OOOWKOOOOOOWKOOO', '.rrOOOOOOOOOOrr.', '................'),
    make('...UUUUUUUUU....', '..UUUUUUUUUUUU..', '.UUUSRKSSRKSUUU.', '.uuuuUUUUUUuuuu.', '..uu........uu..'),
];

// the bonus plate: a paper cone of fries
const Fries = make(
    '..Y.YY.Y...',
    '.YY.YY.YY..',
    '.YYYYYYYY..',
    '.YYYYYYYY..',
    '..RRRRRR...',
    '..RRCCRR...',
    '..RRCCRR...',
    '..RRRRRR...',
    '...RRRR....');

// ------------------------------------------------------------------ the title card
function buildTitle() {
    const burger = make(
        '........TTTTTTTTTTTT........',
        '.....TTTTCTTTTTTCTTTTTT.....',
        '...TTTTTTTTTTCTTTTTTTTTTT...',
        '..TTCTTTTTTTTTTTTTTTCTTTTT..',
        '.TTTTTTTTCTTTTTTTTTTTTTTTTT.',
        '.tttttttttttttttttttttttttt.',
        'GGgGGGgGGGgGGGgGGGgGGGgGGGgG',
        'gGGGgGGGgGGGgGGGgGGGgGGGgGGG',
        '.g.g..g.g..g.g..g.g..g.g..g.',
        '.tttttttttttttttttttttttttt.',
        'PPPPPPPPPPPPPPPPPPPPPPPPPPPP',
        'PPtPPPPPtPPPPPPtPPPPPPPtPPPP',
        '.PPPPPPPPPPPPPPPPPPPPPPPPPP.',
        '.CCCCCCCCCCCCCCCCCCCCCCCCCC.',
        'TTTTTTTTTTTTTTTTTTTTTTTTTTTT',
        '.tttttttttttttttttttttttttt.',
        '...tttttttttttttttttttttt...');
    const plate = make(
        'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        '.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.');
    const art = new PixelSprite(76, 20);
    paste(art, ChefCheer, 0, 3, false);
    paste(art, burger, 24, 1, false);
    paste(art, plate, 22, 18, false);
    paste(art, Foe[0][0], 60, 3, true);
    return art;
}

export const ShortOrderArt = Object.freeze({
    palette: ShortOrderPalette,
    make,
    chefWalkA: ChefWalkA, chefWalkB: ChefWalkB, chefClimb: ChefClimb, chefCheer: ChefCheer, chefCaught: ChefCaught,
    lifeIcon: LifeIcon, shaker: Shaker,
    fries: Fries,
    foe: Foe,                  // [kind][frame]
    flat: Flat,                // [kind]
    titleArt: buildTitle(),
});
