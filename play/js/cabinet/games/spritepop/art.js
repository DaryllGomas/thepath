// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · THE ART.
// Began as the port of the SpritePopArt class in SpritePopRenderer.cs (Staging/Batch2/spritepop), split out so
// the spec (title art) and the renderer can both use it without an import cycle. Takes the palette as an
// argument, never imports spec.js. The 2026-10-18 build-out added the hopper, the corker, the wisp, the
// bouncer, the alarm, the Tin King and his gears, the cork, and four sweets after the fruit.
//
// Sprites are text rows of SYMBOLS mapped to palette colour NAMES (not the SDK's 0-9a-z indices):
//   K bg  S shadow  P pink  p pinkLight  D pinkDark  B blue  b blueDark  L blueLight  W white
//   C green  c greenDark  G cub  g cubDark  Y yellow  O orange  N brown  R red  r redDark  E rose
//   V violet  v violetLight  U violetDark  T steel  t steelLight  d steelDark      (anything else = transparent)
// Every sprite faces RIGHT; the renderer mirrors for facing.
import { PixelSprite, idiv } from '../../sdk/index.js';

// symbol -> palette colour name
const Map_ = new Map([
    ['K', 'bg'], ['S', 'shadow'], ['P', 'pink'], ['p', 'pinkLight'], ['D', 'pinkDark'],
    ['B', 'blue'], ['b', 'blueDark'], ['W', 'white'], ['C', 'green'], ['c', 'greenDark'],
    ['G', 'cub'], ['g', 'cubDark'], ['Y', 'yellow'], ['O', 'orange'], ['R', 'red'], ['r', 'redDark'],
    ['L', 'blueLight'], ['E', 'rose'], ['N', 'brown'], ['V', 'violet'], ['v', 'violetLight'], ['U', 'violetDark'],
    ['T', 'steel'], ['t', 'steelLight'], ['d', 'steelDark'],
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

// ---------------------------------------------------------------- the hopper (faces right): a spring toy
export const HopRest = [
    '................',
    '.....UUUUUU.....',
    '....UVVVVVVU....',
    '...UVvvVVVVVU...',
    '...UVvVWWVWWWU..',
    '..UVVVVWKVWKWU..',
    '..UVVVVWKVWKWU..',
    '..UVVVVVVVVVVU..',
    '..UVVVVVVKKKVU..',
    '...UVVVVVVVVU...',
    '....UUUUUUUU....',
    '......YOOY......',
    '.....OYYYYO.....',
    '......YOOY......',
    '.....OYYYYO.....',
    '....OOOOOOOO....',
];
export const HopCrouch = [
    '................',
    '................',
    '................',
    '................',
    '.....UUUUUU.....',
    '....UVVVVVVU....',
    '...UVvvVVVVVU...',
    '..UVVvVWWVWWWU..',
    '..UVVVVWKVWKWU..',
    '..UVVVVWKVWKWU..',
    '..UVVVVVVVVVVU..',
    '..UVVVVVVKKKVU..',
    '...UUUUUUUUUU...',
    '.....OYYYYO.....',
    '....OYYYYYYO....',
    '...OOOOOOOOOO...',
];
export const HopAir = [
    '.....UUUUUU.....',
    '....UVVVVVVU....',
    '...UVvvVVVVVU...',
    '...UVvVWWVWWWU..',
    '..UVVVVWKVWKWU..',
    '..UVVVVWKVWKWU..',
    '..UVVVVVVVVVVU..',
    '..UVVVVVVVKKVU..',
    '...UVVVVVVKKU...',
    '....UUUUUUUU....',
    '......YOOY......',
    '......OYYO......',
    '......YOOY......',
    '......OYYO......',
    '......YOOY......',
    '.....OOOOOO.....',
];

// ---------------------------------------------------------------- the corker (faces right): a toy popgun
export const CorkA = [
    '................',
    '................',
    '.....bbbbbb.....',
    '....bBBBBBBb....',
    '...bBLLBBBBBb...',
    '..bBLLBBWWWBb...',
    '..bBLBBWWKKWbNN.',
    '..bBBBBWWKKWNOON',
    '..bBBBBBWWWBNOON',
    '..bBBBBBBBBBbNN.',
    '..bBBBBBBBBBb...',
    '...bBBBBBBBb....',
    '....bbbbbbb.....',
    '....OO...OO.....',
    '...OOO...OOO....',
    '................',
];
export const CorkB = [
    '................',
    '................',
    '.....bbbbbb.....',
    '....bBBBBBBb....',
    '...bBLLBBBBBb...',
    '..bBLLBBWWWBb...',
    '..bBLBBWWKKWbNN.',
    '..bBBBBWWKKWNOON',
    '..bBBBBBWWWBNOON',
    '..bBBBBBBBBBbNN.',
    '..bBBBBBBBBBb...',
    '...bBBBBBBBb....',
    '....bbbbbbb.....',
    '.....OO.OO......',
    '.....OOOOOO.....',
    '................',
];
export const CorkPuff = [
    '................',
    '....bbbbbbb.....',
    '...bBBBBBBBb....',
    '..bBLLBBBBBBb...',
    '.bBLLBBBWWWBBb..',
    '.bBLBBBWWKKWBbN.',
    '.bBBBBBWWKKWBNNN',
    '.bBBBBBBWWWBNWWN',
    '.bBBBBBBBBBBNWWN',
    '.bBBBBBBBBBBBNNN',
    '.bBBBBBBBBBBBbN.',
    '..bBBBBBBBBBBb..',
    '...bbbbbbbbbb...',
    '....OO....OO....',
    '...OOO...OOO....',
    '................',
];
export const Cork = [                    // 6 x 4, the shot (flies right)
    '.NOOO.',
    'NOOOOY',
    'NOOOOY',
    '.NOOO.',
];

// ---------------------------------------------------------------- the wisp (faces right): a sheet that drifts
export const WispA = [
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '..WWWWWKKWWKKWL.',
    '.WWWWWWKKWWKKWL.',
    '.WWWWWWWWWWWWWL.',
    '.WWWWWWWWKKWWWL.',
    '.WWWWWWWKKKKWWL.',
    '.WWWWWWWWKKWWWL.',
    '.LWWWWWWWWWWWLL.',
    '.LWWWWWWWWWWWLL.',
    '.LLWWWLWWWWLWLL.',
    '.LL.WLL.WLL.WL..',
    '..L..L...L...L..',
    '................',
];
export const WispB = [
    '......WWWW......',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWWWWWWWWWWW..',
    '..WWWWWKKWWKKWL.',
    '.WWWWWWKKWWKKWL.',
    '.WWWWWWWWWWWWWL.',
    '.WWWWWWWWKKWWWL.',
    '.WWWWWWWKKKKWWL.',
    '.WWWWWWWWKKWWWL.',
    '.LWWWWWWWWWWWLL.',
    '.LWWWWWWWWWWWLL.',
    '.LWWWLWWWWLWWWL.',
    '..WLL.WLL.WLL.L.',
    '...L...L...L....',
    '................',
];

// ---------------------------------------------------------------- the bouncer (faces right): a rubber ball
export const BallA = [
    '................',
    '.....DDDDDD.....',
    '...DDPPPYYYDD...',
    '..DPPPPYYYYYYD..',
    '.DPPPPYYYYYYYPD.',
    '.DPPPPYWWWYWWWD.',
    'DPPPPPYWKKYWKKPD',
    'DPPPPPYWKKYWKKPD',
    'DPPPPPYYWWYYWWPD',
    'DPPPPYYYYYYYYPPD',
    'DPPPPYYYYKKKYPPD',
    '.DPPPYYYYYYYYPD.',
    '.DPPPPYYYYYYPPD.',
    '..DPPPPPYYYPPD..',
    '...DDPPPPPPDD...',
    '.....DDDDDD.....',
];
export const BallSquash = [
    '................',
    '................',
    '................',
    '................',
    '....DDDDDDDD....',
    '..DDPPPYYYYYDD..',
    '.DPPPPYYYYYYYPD.',
    'DPPPPPYWWWYWWWPD',
    'DPPPPPYWKKYWKKPD',
    'DPPPPPYYWWYYWWPD',
    'DPPPPYYYYYYYYPPD',
    'DPPPPYYYYKKKYPPD',
    '.DPPPYYYYYYYYPD.',
    '..DDPPPPPPPPDD..',
    '....DDDDDDDD....',
    '................',
];

// ---------------------------------------------------------------- the alarm (faces right): cannot be popped
export const AlarmA = [
    '.RR..........RR.',
    'RRRE..dddd..ERRR',
    'RRE.dYYYYYYd.ERR',
    '...dYWWWWWWYd...',
    '..dYWWWWKWWWYd..',
    '..dYWWWWKWWWWYd.',
    '.dYWWWWWKWWWWYd.',
    '.dYWWWWWKKKKWYd.',
    '.dYWWWWWWWWWWYd.',
    '.dYWWWWWWWWWWYd.',
    '..dYWWWWWWWWYd..',
    '..dYYWWWWWWYYd..',
    '...dYYYYYYYYd...',
    '....dddddddd....',
    '...OO......OO...',
    '..OO........OO..',
];
export const AlarmB = [
    'RR............RR',
    'RRRE..dddd..ERRR',
    '.RE.dYYYYYYd.ER.',
    '...dYWWWWWWYd...',
    '..dYWWWWWKWWYd..',
    '..dYWWWWWKWWWYd.',
    '.dYWWWWWKWWWWYd.',
    '.dYWWWWWKKKKWYd.',
    '.dYWWWWWWWWWWYd.',
    '.dYWWWWWWWWWWYd.',
    '..dYWWWWWWWWYd..',
    '..dYYWWWWWWYYd..',
    '...dYYYYYYYYd...',
    '....dddddddd....',
    '..OO........OO..',
    '...OO......OO...',
];

// ---------------------------------------------------------------- the Tin King (faces right), 20 x 20, drawn at 2x
export const KingA = [
    '.....Y...Y...Y......',
    '.....YY.YYY.YY......',
    '.....YYYYYYYYY......',
    '.....OYRYOYRYO......',
    '....ddddddddddd.....',
    '...dTTTTTTTTTTTd....',
    '..dTttTTTTTTTTTTd...',
    '..dTtTTTWWWTTWWWd...',
    '..dTTTTTWKKTTWKKd...',
    'YY.dTTTTWKKTTWKKd...',
    'YOddTTTTTTTTTTTTd...',
    'YYdTTTTTTTRRRRRTd...',
    '..dTTTTTTTTRRRTTd...',
    '..dTTTTTTTTTTTTTd...',
    '..ddTTTYTTTTYTTdd...',
    '...dTTTTTTTTTTTd....',
    '...dTTTYTTTTYTTd....',
    '....ddddddddddd.....',
    '....OOO.....OOO.....',
    '...OOOO....OOOO.....',
];
export const KingB = [                   // the telegraph: mouth wide, the key turned
    '.....Y...Y...Y......',
    '.....YY.YYY.YY......',
    '.....YYYYYYYYY......',
    '.....OYRYOYRYO......',
    '....ddddddddddd.....',
    '...dTTTTTTTTTTTd....',
    '..dTttTTTTTTTTTTd...',
    '..dTtTTTWWWTTWWWd...',
    '..dTTTTTWKKTTWKKd...',
    '.Y.dTTTTWKKTTWKKd...',
    'YOYdTTTTTTTTTTTTd...',
    '.YdTTTTTTRRRRRRRd...',
    '..dTTTTTTRKKKKKRd...',
    '..dTTTTTTTRRRRRTd...',
    '..ddTTTYTTTTYTTdd...',
    '...dTTTTTTTTTTTd....',
    '...dTTTYTTTTYTTd....',
    '....ddddddddddd.....',
    '....OOO.....OOO.....',
    '...OOOO....OOOO.....',
];
export const KingHead = [                // 12 x 12 HUD icon
    '..Y..Y..Y...',
    '..YYYYYYY...',
    '..OYOYOYO...',
    '.ddddddddd..',
    'dTTTTTTTTTd.',
    'dTtTWWTWWTd.',
    'dTTTWKTWKTd.',
    'dTTTTTTTTTd.',
    'dTTTTRRRRTd.',
    'dTTTTTTTTTd.',
    '.ddddddddd..',
    '............',
];
export const GearA = [                   // 7 x 7, two turns
    '..t.t..',
    '.tTTTt.',
    'tTTdTTt',
    '.TdKdT.',
    'tTTdTTt',
    '.tTTTt.',
    '..t.t..',
];
export const GearB = [
    '.t...t.',
    'ttTTTtt',
    '.TTdTT.',
    '.TdKdT.',
    '.TTdTT.',
    'ttTTTtt',
    '.t...t.',
];

// ---------------------------------------------------------------- fruit and sweets (14 x 14)
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
    [                         // lollipop
        '....PPPPP.....',
        '...PWPPPPP....',
        '..PWPPYYPPP...',
        '..PPPYPPYPP...',
        '..PPYPWPPYP...',
        '..PPPYPPYPP...',
        '...PPPYYPP....',
        '....PPPPP.....',
        '......W.......',
        '......W.......',
        '......W.......',
        '......W.......',
        '..............',
        '..............',
    ],
    [                         // cupcake
        '......R.......',
        '.....WWW......',
        '....WWEWW.....',
        '...WEWWWEW....',
        '..WWWWEWWWW...',
        '..EWWWWWWEW...',
        '..OOOOOOOOO...',
        '..ONONONONO...',
        '...ONONONO....',
        '...ONONONO....',
        '....ONONO.....',
        '..............',
        '..............',
        '..............',
    ],
    [                         // wrapped candy
        '..............',
        '..............',
        '..............',
        '..Y........Y..',
        '.YYY.BBBB.YYY.',
        '.YYYBLBBBBYYY.',
        '..YYBBLBBBYY..',
        '..YYBBBLBBYY..',
        '.YYYBBBBLBYYY.',
        '.YYY.BBBB.YYY.',
        '..Y........Y..',
        '..............',
        '..............',
        '..............',
    ],
    [                         // ice cream
        '....EEEE......',
        '...EEWEEE.....',
        '..EEWEEEEE....',
        '..EEEEEEEE....',
        '..WWWWWWWW....',
        '...OYOYOYO....',
        '...YOYOYOY....',
        '....OYOYO.....',
        '....YOYOY.....',
        '.....OYO......',
        '.....YOY......',
        '......O.......',
        '..............',
        '..............',
    ],
];

export const Angry = new Map([['C', 'R'], ['c', 'r']]);
// the new creatures go red their own way (body and shade)
export const AngryHop = new Map([['V', 'R'], ['U', 'r'], ['v', 'E']]);
export const AngryCork = new Map([['B', 'R'], ['b', 'r'], ['L', 'E']]);
export const AngryWisp = new Map([['W', 'E'], ['L', 'R']]);
export const AngryBall = new Map([['P', 'R'], ['D', 'r'], ['Y', 'E']]);
export const AngryKing = new Map([['T', 'R'], ['t', 'E'], ['d', 'r']]);
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
