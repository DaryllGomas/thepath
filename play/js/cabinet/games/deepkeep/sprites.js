// THE NODE · world 1 · THE DEEP KEEP · THE SPRITES (palette-indexed text rows, all original art).
//
// Legend (one char = one palette colour, '.' = clear):
//   0 bg   K wl0   1-5 wl1-wl5 (steel / stone greys)   e ember  o torch  y torchHi  w white
//   s skin  r red  R redLo  g gold  G goldLo  b bone  B boneLo  h ghost  H ghostLo
//   n green  N greenLo  p purple  P purpleLo  d wood  D woodLo  c blue  C blueLo
//   u v x z q Q = floor fl0..fl5
// sym(...) mirrors half rows (the last char is the centre column) into a symmetric sprite.
// Sprites face DOWN (front) or RIGHT (side); the renderer mirrors the side views for left.
import { PixelSprite } from '../../sdk/index.js';
import { DeepKeepPalette as P } from './palette.js';

const LEGEND = {
    '0': 'bg', K: 'wl0', 1: 'wl1', 2: 'wl2', 3: 'wl3', 4: 'wl4', 5: 'wl5',
    e: 'ember', o: 'torch', y: 'torchHi', w: 'white', s: 'skin', r: 'red', R: 'redLo', g: 'gold', G: 'goldLo',
    b: 'bone', B: 'boneLo', h: 'ghost', H: 'ghostLo', n: 'green', N: 'greenLo', p: 'purple', P: 'purpleLo',
    d: 'wood', D: 'woodLo', c: 'blue', C: 'blueLo', u: 'fl0', v: 'fl1', x: 'fl2', z: 'fl3', q: 'fl4', Q: 'fl5',
};
const IDX = {};
for (const k of Object.keys(LEGEND)) IDX[k] = P.indexOf(LEGEND[k]);

export function spr(...rows) {
    const h = rows.length, w = rows[0].length;
    const s = new PixelSprite(w, h);
    for (let y = 0; y < h; y++) {
        if (rows[y].length !== w) throw new Error('sprite row ' + y + ' is ' + rows[y].length + ' wide, not ' + w + ': ' + rows[y]);
        for (let x = 0; x < w; x++) {
            const c = rows[y][x];
            if (c === '.' || c === ' ') continue;
            const v = IDX[c];
            if (v === undefined) throw new Error('sprite char ' + c);
            s.set(x, y, v);
        }
    }
    return s;
}
export function mirrorRows(half) { return half.map(r => r + [...r.slice(0, -1)].reverse().join('')); }
export function sym(...half) { return spr(...mirrorRows(half)); }
const M = (...half) => mirrorRows(half);

// ------------------------------------------------------------------ THE HERO (15 x 16), the axe-thrower
// A bronze helm with a red crest, steel mail, a red cloak, a leather belt with a gold buckle.
const HeroDownTop = M(
    '......rr',
    '.....rRr',
    '....Ggyy',
    '...Gggyg',
    '...Ggggg',
    '...GGsss',
    '...Gs0sg',
    '....Gsss',
    '.Rr44555',
    'Rr344555',
    'Rs334454',
    '.s3Ddddg',
    '..R33433');
const HeroUpTop = M(
    '......rr',
    '.....rRr',
    '....Ggyy',
    '...Gggyg',
    '...Ggggg',
    '...Ggggg',
    '...GGGGG',
    '....RrrR',
    '.4Rrrrrr',
    '44Rrrrrr',
    's4RrRrrr',
    '.sRrrrRr',
    '..RRrrrr');
const LegsFront = { stand: ['...DDd...dDD...', '...DDD...DDD...', '...KKK...KKK...'],
                    a: ['...DDd...dDD...', '...KKK...DDD...', '.........KKK...'],
                    b: ['...DDd...dDD...', '...DDD...KKK...', '...KKK.........'] };
const HeroSideTop = [
    '.....rrr.......',
    '....rrRrr......',
    '...RGggyyg.....',
    '..RGgggygg.....',
    '..RGgggggg.....',
    '..RGGGgsss.....',
    '..RGGGs0ss.....',
    '...RGGssss.....',
    '..Rr44555s.....',
    '.Rr344555s.....',
    '.Rr3344554.....',
    '..R3Ddddgd.....',
    '...R33433......',
];
const LegsSide = { stand: ['....DDdDD......', '....DDDDD......', '....KKKKKK.....'],
                   a: ['...DDd..DD.....', '..DDD....DD....', '..KKK....KKK...'],
                   b: ['.....DDdD......', '.....DDDD......', '....KKKKK......'] };

function hero(top, legs) { return spr(...top, ...legs); }
export const Hero = {
    down: { stand: hero(HeroDownTop, LegsFront.stand), a: hero(HeroDownTop, LegsFront.a), b: hero(HeroDownTop, LegsFront.b) },
    up: { stand: hero(HeroUpTop, LegsFront.stand), a: hero(HeroUpTop, LegsFront.a), b: hero(HeroUpTop, LegsFront.b) },
    side: { stand: hero(HeroSideTop, LegsSide.stand), a: hero(HeroSideTop, LegsSide.a), b: hero(HeroSideTop, LegsSide.b) },
};
// fallen on his back (20 x 6), and his helm rolled off (6 x 4)
export const HeroFallen = spr(
    '.......RrrrrrR......',
    '..sss..R4455544R.DD.',
    '.s0s0s.R4555554RdDKK',
    '.sssss.R4455544RdDKK',
    '..sss..R3444443R.DD.',
    '.......RrrrrrR......');
export const HelmOff = spr(
    '..rr..',
    '.Ggyg.',
    'GggggG',
    '.GGGG.');

// the axe in his fist (drawn by the renderer beside the body): 7 x 7, head up-right
export const HeldAxe = spr(
    '...455.',
    '..4w55.',
    '..d455.',
    '.d..4..',
    'd......',
    '.......',
    '.......');

// ------------------------------------------------------------------ the thrown axe: 4 spin frames (9 x 9)
export const AxeSpin = [
    spr('...455...', '..4w555..', '..4455...', '...d.....', '...d.....', '...d.....', '...d.....', '...D.....', '.........'),
    spr('.........', '......45.', '.....4w55', '....d.45.', '...d.....', '..d......', '.d.......', 'D........', '.........'),
    spr('.........', '.........', '.........', 'Dddddd4..', '.....4w5.', '.....455.', '......5..', '.........', '.........'),
    spr('D........', '.d.......', '..d......', '...d.45..', '....4w55.', '.....455.', '......5..', '.........', '.........'),
];

// ------------------------------------------------------------------ monsters (two frames each)
// GHOST 13 x 12: a pale sheet with black eye holes and a howling mouth, the hem trailing
const GhostTop = M(
    '....hhh',
    '..hhwww',
    '.hwwwww',
    '.hw00ww',
    'hhw00ww',
    'hhwwwww',
    'Hhhww0w',
    'Hhhw000',
    'HHhhwww',
    '.HHhhhh');
export const Ghost = [
    spr(...GhostTop, ...M('.HhHhHh', '.H..H.H')),
    spr(...GhostTop, ...M('HhHhHhh', 'H.H..H.')),
];

// BRUTE 13 x 14: a hulking green grunt, heavy brow, tusks, leather harness (its club is drawn apart)
const BruteTop = M(
    '...NNNN',
    '..Nnnnn',
    '.Nnnnnn',
    '.N00Nnn',
    '.NnyNnn',
    '.Nnnnnn',
    '.NwNNNN',
    'NnnDddn',
    'nnnnDdn',
    'nNnnnDd',
    'n.NDDDD');
export const Brute = [
    spr(...BruteTop, '..DDD...DDD..', '..DDD...DDD..', '..KKK...KKK..'),
    spr(...BruteTop, '..DDD...DDD..', '..KKK...DDD..', '.........KKK.'),
];
export const Club = spr('..DD', '.dDd', '.dd.', 'd...', 'd...', 'D...');

// IMP 11 x 12: a red devil-child with bone horns, yellow eyes and bat wings
export const Imp = [
    spr('R.b.....b.R', 'RRb.rrr.bRR', 'RRRrrrrrRRR', 'R.rRyrRyr.R', '..rrrrrrr..', '..rrr0rrr..', '...rrrrr...',
        '..RrrrrrR..', '..R.rrr.R..', '....rRr....', '...rR.Rr...', '...R...R...'),
    spr('.....b.b...', '..R.brrrb.R', '.RRRrrrrRRR', 'RR.rRyrRyrR', 'R..rrrrrrr.', '...rrr0rrr.', '....rrrrr..',
        '...RrrrrrR.', '...R.rrr.R.', '.....rRr...', '....rR.Rr..', '....R...R..'),
];

// WARLOCK 13 x 15: a hooded purple robe, two lit eyes in the dark of the hood, gold trim
const WarlockTop = M(
    '.....Pp',
    '....Ppp',
    '...Pppp',
    '..Ppp00',
    '..Pp0y0',
    '..Pp000',
    '..PPp00',
    '.PPpppg',
    '.Pppppg',
    'PPppppg',
    'PpPpppg',
    'PPpPppg');
export const Warlock = [
    spr(...fit(WarlockTop, 13), ...M('PpPpPpg', '.P.P.PG', '.......')),
    spr(...fit(WarlockTop, 13), ...M('pPpPpPg', 'P.P.P.G', '.......')),
];
export const Staff = spr('.cw.', 'cccC', '.CC.', '.d..', '.d..', '.d..', '.d..', '.d..', '.d..', '.D..', '.D..', '.D..');

// WRAITH 15 x 17: a tall drifting shroud, a bone skull in the hood, red eyes, grasping bone hands
const WraithTop = M(
    '.....KKK',
    '....KPPP',
    '...KPKKK',
    '...KKbbb',
    '...KbRbb',
    '...KbrBb',
    '...KKbbb',
    '..KPKBbB',
    '.KPPKKKK',
    'KPPKKKKK',
    'bKPKKKKK',
    'bbKPKKKK',
    '.KPKKKKK',
    '.KPKPKKK');
export const Wraith = [
    spr(...fit(WraithTop, 15), ...M('..KPK.KP', '..K..K.K', '..K....K')),
    spr(...fit(WraithTop, 15), ...M('.KPK.KPK', '.K.K..K.', '....K...')),
];

function fit(rows, w) { return rows.map(r => (r + '.'.repeat(w)).slice(0, w)); }

// ------------------------------------------------------------------ generators (16 x 16), three sizes each: [hp1, hp2, hp3]
// BONE PILE: skulls and long bones heaped up
export const BonePile = [
    spr('................', '................', '................', '................', '................', '................',
        '................', '................', '................', '.......bb.......', '.....bbBbb......', '....bb0b0bB.....',
        '...BbbbbbbbbB...', '..bBbBbbBbbBbb..', '..BBBBBBBBBBBB..', '................'),
    spr('................', '................', '................', '................', '................', '......bbbb......',
        '.....bb0b0b.....', '.....bbbbbb.....', '..bb..bBBb..bb..', '..bBbbbbbbbbBb..', '.bb0b0bbbb0b0bb.', '.bbbbbBbbBbbbbb.',
        '.BbBbbbBBbbbBbB.', 'bBbbBbbbbbBbbBbb', 'BBBBBBBBBBBBBBBB', '................'),
    spr('................', '.......bbb......', '......b0b0b.....', '......bbbbb.....', '...bb..bBb..bb..', '..bbbb.....bbbb.',
        '..b0b0b.b.b0b0b.', '..bbbbbbbbbbbbb.', '.bb.BbbB.BbbB.bb', '.bbbbb0b0bbbbbb.', 'bbBbbbbbbbbbbBbb', 'bBbb0b0bbb0b0bBb',
        'bbbbbbBbbBbbbbbb', 'BbBbbbBBBbbbbBbB', 'BBBBBBBBBBBBBBBB', '................'),
];
// BRUTE DEN: a squat hut of lashed logs with a dark doorway
export const Den = [
    spr('................', '................', '................', '................', '................', '................',
        '................', '................', '.......dd.......', '.....ddDDdd.....', '....dDd00dDd....', '...dDdd00ddDd...',
        '...DdDd00dDdD...', '...DDDD00DDDD...', '..DDDDDDDDDDDD..', '................'),
    spr('................', '................', '................', '................', '.......dd.......', '.....ddDDdd.....',
        '....dDddddDd....', '...dDdDddDdDd...', '..dDdd.00.ddDd..', '..DdDd0000dDdD..', '..ddDd0000dDdd..', '..DdDd0000dDdD..',
        '..dDDd0000dDDd..', '..DDDD0000DDDD..', '.DDDDDDDDDDDDDD.', '................'),
    spr('................', '.......dd.......', '......dDDd......', '.....dDddDd.....', '....dDdddddd....', '...dDdDddDdDd...',
        '..dDddDddDddDd..', '..DdDdddddDdDD..', '.dDdd.0000.ddDd.', '.DdDd000000dDdD.', '.ddDd000000dDdd.', '.DdDd000000dDdD.',
        '.dDDd000000dDDd.', '.DDDD000000DDDD.', 'DDDDDDDDDDDDDDDD', '................'),
];
// EMBER PIT: a stone ring round a glowing hole (the renderer animates the coals)
export const Pit = [
    spr('................', '................', '................', '................', '................', '......3333......',
        '.....3eooe3.....', '....3eoyyoe3....', '....3oyywyo3....', '....3eoyyoe3....', '.....3eooe3.....', '......3333......',
        '................', '................', '................', '................'),
    spr('................', '................', '................', '.....333333.....', '....3eeooee3....', '...3eooyyooe3...',
        '...3eoyyyyoe3...', '...3oyyywyyo3...', '...3oyywyyyo3...', '...3eoyyyyoe3...', '...3eooyyooe3...', '....3eeooee3....',
        '.....333333.....', '................', '................', '................'),
    spr('................', '.....334433.....', '...3343333433...', '..34eeeooeee43..', '..3eeoooooooe3..', '.33eoooyyoooe33.',
        '.3eooyyyyyyooe3.', '.4eoyyywwyyyoe4.', '.4eoyyywwyyyoe4.', '.3eooyyyyyyooe3.', '.33eoooyyoooe33.', '..3eeoooooooe3..',
        '..34eeeooeee43..', '...3343333433...', '.....334433.....', '................'),
];
// RUNE ALTAR: a black slab with a purple rune ring that pulses
export const Altar = [
    spr('................', '................', '................', '................', '................', '................',
        '................', '................', '.....pppppp.....', '....p.P..P.p....', '....pPP00PPp....', '....p.P..P.p....',
        '.....pppppp.....', '....33333333....', '....22222222....', '................'),
    spr('................', '................', '................', '................', '.....pppppp.....', '....p..PP..p....',
        '...p.PP..PP.p...', '...pP.P00P.Pp...', '...pP.0000.Pp...', '...pP.P00P.Pp...', '...p.PP..PP.p...', '....p..PP..p....',
        '.....pppppp.....', '...3333333333...', '...2222222222...', '................'),
    spr('................', '.....pppppp.....', '...pp..PP..pp...', '..p..PPPPPP..p..', '..p.PP.pp.PP.p..', '.p.PP.p00p.PP.p.',
        '.pPP.p0000p.PPp.', '.pP.pp0ww0pp.Pp.', '.pP.pp0ww0pp.Pp.', '.pPP.p0000p.PPp.', '.p.PP.p00p.PP.p.', '..p.PP.pp.PP.p..',
        '..p..PPPPPP..p..', '..3pp..PP..pp3..', '.33333333333333.', '.22222222222222.'),
];

// ------------------------------------------------------------------ things to pick up
export const Key = spr('.gg.......', 'gyyg......', 'g..gggggg.', 'gyyg...GgG', '.GG....G.G');
export const Roast = spr(
    '....eeee...',
    '...eoooee..',
    '..eooyoeeb.',
    '..eooooe.bb',
    '...eeeeb.b.',
    'bbbbbbbbbbb',
    '.BBBBBBBBB.');
export const Jug = spr(
    '...DD...',
    '..eooe..',
    '.eooooeo',
    'eooyooeo',
    'eooooo.o',
    'eoooooeo',
    '.eooooe.',
    '..eeee..');
export const Potion = spr(
    '..dd...',
    '..DD...',
    '..44...',
    '.cwcc..',
    'cwcccC.',
    'ccccCC.',
    'cCCCCC.',
    '.CCCC..');
export const Chest = spr(
    '..dddddddddd..',
    '.dDgdddddgDdd.',
    '.dDgdddddgDdd.',
    'GggggggggggggG',
    'dDgddGyGddgDdd',
    'dDgddG0GddgDdd',
    'dDgdddddddgDdd',
    'DDgDDDDDDDgDDD',
    '.GGGGGGGGGGGG.');

// the imp's fireball (7 x 7), two frames
export const Bolt = [
    spr('..eoe..', '.eoyoe.', 'eoywyoe', 'oywwwyo', 'eoywyoe', '.eoyoe.', '..eoe..'),
    spr('...e...', '.eoooe.', '.oyyyo.', 'eoywyoe', '.oyyyo.', '.eoooe.', '...e...'),
];

// HUD icons
export const KeyIcon = Key;
export const PotionIcon = Potion;

// ------------------------------------------------------------------ the title card's picture (the attract TITLE page)
// the hero hurls an axe down a torchlit corridor at a ghost and a brute pouring off a bone pile
export const TitleArt = (() => {
    const W = 124, H = 30, FLOOR = 22;
    const t = new PixelSprite(W, H);
    const I = n => P.indexOf(n);
    // the floor: a strip of flagstones, lit in the middle and falling off into the dark at both ends
    const ramp = ['fl1', 'fl2', 'fl3', 'fl4'].map(I), mortar = I('fl0');
    for (let y = FLOOR; y < H; y++)
        for (let x = 0; x < W; x++) {
            const edge = Math.min(x, W - 1 - x), fall = Math.min(3, Math.floor(edge / 9));
            const row = y - FLOOR, off = row < 4 ? 0 : 7;
            const inStoneX = (x + off) % 14, inStoneY = row % 4;
            let v;
            if (inStoneX === 13 || inStoneY === 3) v = mortar;
            else v = ramp[Math.max(0, Math.min(3, fall - (inStoneY === 0 || inStoneX === 0 ? 0 : 1) - (row > 4 ? 1 : 0)))];
            if (fall === 0 && ((x + y) & 1)) continue;                    // dithered into the dark
            t.set(x, y, v);
        }
    const stamp = (sp, x, y, flipX = false) => {
        // outline first (black), then the sprite: figures stand clear of the floor
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                if (sp.at(flipX ? sp.width - 1 - i : i, j) < 0) continue;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const xx = x + i + dx, yy = y + j + dy;
                    if (xx >= 0 && yy >= 0 && xx < W && yy < H) t.set(xx, yy, 0);
                }
            }
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                const v = sp.at(flipX ? sp.width - 1 - i : i, j);
                if (v >= 0) t.set(x + i, y + j, v);
            }
    };
    const streak = (x0, x1, y) => { for (let x = x0; x < x1; x++) if (((x - x0) & 1) === 0 || x > x1 - 5) t.set(x, y, I(x > x1 - 5 ? 'wl4' : 'wl2')); };
    // shadows under everyone
    for (const [x, w] of [[5, 13], [63, 12], [78, 12], [92, 12], [108, 15]]) for (let i = 0; i < w; i++) t.set(x + i, FLOOR, mortar);
    stamp(Hero.side.a, 3, FLOOR - 16);
    streak(20, 31, 11); stamp(AxeSpin[1], 30, 6);
    streak(40, 50, 13); stamp(AxeSpin[3], 49, 9);
    stamp(Ghost[0], 62, FLOOR - 14, true);
    stamp(Ghost[1], 76, FLOOR - 19, true);
    stamp(Brute[0], 91, FLOOR - 14, true);
    stamp(Club, 88, FLOOR - 21, true);
    stamp(BonePile[2], 107, FLOOR - 15);
    return t;
})();
