// THE NODE · world 1 · VAULT DIGGER (Castle Coin, 1983) on the Cabinet Engine · the palette, the
// sprite art and the SPEC (data only). Port of VaultDiggerCartridge.cs and the VaultArt static class
// from VaultDiggerRenderer.cs (Staging/Batch2/vaultdigger).
// VaultArt lives here (not renderer.js) so both the renderer and the title art can read it without an
// import cycle back to renderer.js.
//
// Palette: vault-blue brick (three steps), slate bedrock, ladder grey, gold (three steps), guard red
// (two), the runner's white with a blue-grey shade. 15 colours. The sprite rows below index this
// palette by position, so its ORDER is load-bearing.
//
// Knobs (tuned on the Lab bench, 200 rounds a credit, worst case):
//   runSpeed      the runner, tiles/s                                     fixed
//   guardSpeed    a guard's pace as a fraction of the runner's             fixed
//   guardPathing  chance a guard's decision HUNTS (the runner's row, then  x0.9 a loss (MERCY)
//                 the column); otherwise it looks about, then patrols
//   guardHesitate seconds a guard that is not hunting looks about first    fixed
//   holeTime      seconds a dug hole stays open                           +0.5 s a loss (MERCY)
//   trapShare     a trapped guard is held for this share of holeTime      fixed (so it eases with holeTime)
//   guards        how many guards hunt                                    fixed
//   guardGreed    chance a guard picks up the gold it walks over          fixed
// Credit 5 (the unlosable credit) is the sim's own rule: the guards wander, the runner cannot die.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const VaultDiggerPalette = new Palette(
    ['bg', 0x04050E],
    ['brickLo', 0x13275F],   // mortar
    ['brick', 0x2B55C8],     // vault blue
    ['brickHi', 0x6E9DFF],
    ['rock', 0x3A4260],      // bedrock steel
    ['rockHi', 0x7A84A8],
    ['ladder', 0xA4A8BA],    // ladder grey
    ['ladderLo', 0x585C70],
    ['goldLo', 0xA86400],
    ['gold', 0xFFC41C],
    ['goldHi', 0xFFF2A0],
    ['red', 0xE82A3A],       // guard red
    ['redLo', 0x7A0C1A],
    ['white', 0xF4F4F4],     // the runner
    ['shade', 0x8E9CC6],
).roles('bg', 'white', 'gold', 'goldHi', 'brickLo');

// ------------------------------------------------------------------ VaultArt
// the figure (facing right), chunky for a curved tube at 0.8 m: a 7 px head and torso, 3 px legs, arms
// in the shade colour so the limbs read against the body. W = body, S = shade (arms, feet), E = eye
const Stand = [
    '.....WWWWW......',
    '....WWWWWWW.....',
    '....WWWWWWE.....',
    '....WWWWWWE.....',
    '....WWWWWWW.....',
    '.....WWWWW......',
    '..SSWWWWWWWSS...',
    '..SSWWWWWWWSS...',
    '..SS.WWWWW.SS...',
    '..SS.WWWWW.SS...',
    '.....WWWWW......',
    '....WWW.WWW.....',
    '....WWW.WWW.....',
    '....WWW.WWW.....',
    '....WWW.WWW.....',
    '....SSSS.SSSS...',
];
const Run1 = [
    '......WWWWW.....',
    '.....WWWWWWW....',
    '.....WWWWWWE....',
    '.....WWWWWWE....',
    '.....WWWWWWW....',
    '......WWWWW.....',
    '....SWWWWWWWSS..',
    '...SSWWWWWWW.SS.',
    '..SS..WWWWW...SS',
    '..S...WWWWW.....',
    '......WWWWWW....',
    '.....WWW..WWW...',
    '....WWW....WWW..',
    '...WWW......WWW.',
    '..WWW.......WWW.',
    '..SS........SSSS',
];
const Run2 = [
    '......WWWWW.....',
    '.....WWWWWWW....',
    '.....WWWWWWE....',
    '.....WWWWWWE....',
    '.....WWWWWWW....',
    '......WWWWW.....',
    '.....SWWWWWS....',
    '....SSWWWWWSS...',
    '....SSWWWWWSS...',
    '.....SWWWWW.....',
    '......WWWWW.....',
    '......WWWWW.....',
    '.....WWW.WWW....',
    '.....WWW.WWW....',
    '.....WWW..WWW...',
    '....SSSS..SSSS..',
];
const Climb = [
    '..SS............',
    '..SS.WWWWW......',
    '..SSWWWWWWW.....',
    '...SWWWWWWW.....',
    '....WWWWWWW.....',
    '.....WWWWW......',
    '....WWWWWWWSS...',
    '....WWWWWWW.SS..',
    '....WWWWWWW..SS.',
    '....WWWWWWW..SS.',
    '.....WWWWW......',
    '....WWW.WWW.....',
    '....WWW.WWW.....',
    '....WWW.WWWW....',
    '....WWW.........',
    '...SSSS.........',
];
const Hang1 = [
    '................',
    '..SS.......SS...',
    '..SS.......SS...',
    '..SS.WWWWW.SS...',
    '...SWWWWWWWS....',
    '....WWWWWWE.....',
    '....WWWWWWE.....',
    '....WWWWWWW.....',
    '.....WWWWW......',
    '....WWWWWWW.....',
    '....WWWWWWW.....',
    '.....WWWWW......',
    '....WWW.WWW.....',
    '....WWW.WWW.....',
    '....WWW.WWW.....',
    '....SSS.SSS.....',
];
const Hang2 = [
    '................',
    '...SS.......SS..',
    '...SS.......SS..',
    '...SS.WWWWW.SS..',
    '....SWWWWWWWS...',
    '.....WWWWWWE....',
    '.....WWWWWWE....',
    '.....WWWWWWW....',
    '......WWWWW.....',
    '.....WWWWWWW....',
    '.....WWWWWWW....',
    '......WWWWW.....',
    '.....WWW.WWW....',
    '....WWW...WWW...',
    '...WWW.....WWW..',
    '...SS.......SS..',
];
const Fall = [
    '.SS.........SS..',
    '.SS.........SS..',
    '..SS.WWWWW.SS...',
    '...SWWWWWWWS....',
    '....WWWWWWE.....',
    '....WWWWWWE.....',
    '....WWWWWWW.....',
    '.....WWWWW......',
    '....WWWWWWW.....',
    '....WWWWWWW.....',
    '.....WWWWW......',
    '....WWW.WWW.....',
    '...WWW...WWW....',
    '..WWW.....WWW...',
    '.WWW.......WWW..',
    '.SS.........SS..',
];
const Dig = [
    '................',
    '................',
    '.....WWWWW......',
    '....WWWWWWW.....',
    '....WWWWWWE.....',
    '....WWWWWWE.....',
    '....WWWWWWW.....',
    '.....WWWWW......',
    '...SWWWWWWWSS...',
    '..SSWWWWWWW.SS..',
    '..SS.WWWWW...SS.',
    '.....WWWWW....SS',
    '....WWWWWWW...SS',
    '...WWW...WWW....',
    '...WWW...WWW....',
    '..SSSS...SSSS...',
];
const Down = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '..WWWWW.........',
    '.WWWWWWWSSWWWWW.',
    '.WWWWEWWWWWWWWWW',
    '.WWWWWWWSSWWWWW.',
    '..WWWWW..SSS.SSS',
];

// ---- the vault
const Brick = PixelSprite.fromRows(
    '3333333333333331',
    '3222222222222221',
    '3222222222222221',
    '3222222222222221',
    '3222222222222221',
    '3222222222222221',
    '3222222222222221',
    '1111111111111111',
    '3333333133333333',
    '2222222132222222',
    '2222222132222222',
    '2222222132222222',
    '2222222132222222',
    '2222222132222222',
    '2222222132222222',
    '1111111111111111');
const Rock = PixelSprite.fromRows(       // a riveted steel vault plate
    '5555555555555554',
    '5444444444444440',
    '5455444444445540',
    '5455444444445540',
    '5444444444444440',
    '5444444444444440',
    '5444444444444440',
    '5444444444444440',
    '5444444444444440',
    '5444444444444440',
    '5444444444444440',
    '5444444444444440',
    '5455444444445540',
    '5455444444445540',
    '5444444444444440',
    '4000000000000000');
const LadderRows = [
    '..67........67..',
    '..67........67..',
    '..67........67..',
    '..666666666666..',
    '..677777777767..',
    '..67........67..',
    '..67........67..',
    '..67........67..',
    '..67........67..',
    '..67........67..',
    '..67........67..',
    '..666666666666..',
    '..677777777767..',
    '..67........67..',
    '..67........67..',
    '..67........67..',
];
const Ladder = PixelSprite.fromRows(...LadderRows);
const ExitLadder = PixelSprite.fromRows(...mapRows(LadderRows, ['6a', '79']));
const Bar = PixelSprite.fromRows(
    '................',
    '6666666666666666',
    '6666666666666666',
    '7777777777777777');
const Gold = PixelSprite.fromRows(
    '....aaaaaaa.....',
    '....a999998.....',
    '....a999998.....',
    '....a999998.....',
    '....8888888.....',
    '.aaaaaaaaaaaaaa.',
    '.a999998a999998.',
    '.a999998a999998.',
    '.a999998a999998.',
    '.88888888888888.');
const Nugget = PixelSprite.fromRows(
    'aaaaaa',
    'a99998',
    '888888');
const Glint = PixelSprite.fromRows(
    '..d..',
    '..a..',
    'da.ad',
    '..a..',
    '..d..');

// recolour sprite rows: each pair "Xy" swaps class char X for palette char y
function mapRows(rows, pairs) {
    return rows.map(row => {
        let out = '';
        for (const ch of row) {
            let mapped = ch;
            for (const p of pairs) if (ch === p[0]) { mapped = p[1]; break; }
            out += mapped;
        }
        return out;
    });
}

function makeFigure(w, s, e) {
    const from = ['W' + w, 'S' + s, 'E' + e];
    return {
        stand: PixelSprite.fromRows(...mapRows(Stand, from)),
        run1: PixelSprite.fromRows(...mapRows(Run1, from)),
        run2: PixelSprite.fromRows(...mapRows(Run2, from)),
        climb: PixelSprite.fromRows(...mapRows(Climb, from)),
        hang1: PixelSprite.fromRows(...mapRows(Hang1, from)),
        hang2: PixelSprite.fromRows(...mapRows(Hang2, from)),
        fall: PixelSprite.fromRows(...mapRows(Fall, from)),
        dig: PixelSprite.fromRows(...mapRows(Dig, from)),
        down: PixelSprite.fromRows(...mapRows(Down, from)),
    };
}

// actor sets: runner (white, blue-grey shade, dark eye), guard (red, dark red, gold eye)
const RunnerFig = makeFigure('d', 'e', '0');
const GuardFig = makeFigure('b', 'c', 'a');
const FlashFig = makeFigure('a', '9', '0');   // the runner caught: a gold flash

// paste src into dst at (x, y), rows [sy0, sy1) of src only
function paste(dst, src, x, y, flip = false, sy0 = 0, sy1 = 999) {
    for (let j = Math.max(0, sy0); j < Math.min(src.height, sy1); j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(flip ? src.width - 1 - i : i, j);
            if (v >= 0) dst.set(x + i, y + j - sy0, v);
        }
}

export const VaultArt = { T: 16, Brick, Rock, Ladder, ExitLadder, Bar, Gold, Nugget, Glint, RunnerFig, GuardFig, FlashFig, paste };

// the title card: the runner digs, a guard is trapped in the hole, gold beyond, a second guard
// coming; a ladder at the left. 6 x 1.6 tiles, drawn x2.
function buildTitleArt() {
    const T = VaultArt.T, H = 26;
    const a = new PixelSprite(6 * T, H);
    paste(a, Ladder, 0, 0);
    paste(a, Ladder, 0, T, false, 0, H - T);
    paste(a, RunnerFig.dig, T, 0);
    paste(a, Gold, 3 * T + 1, 6);
    paste(a, GuardFig.run1, 5 * T, 0, true);
    for (let c = 1; c < 6; c++)
        if (c !== 2) paste(a, Brick, c * T, T, false, 0, H - T);
    paste(a, GuardFig.fall, 2 * T, T, false, 0, H - T);
    // the broken lips of the hole
    for (let k = 0; k < 2; k++) { a.set(2 * T + k, T, 1); a.set(3 * T - 1 - k, T, 1); a.set(2 * T, T + 1, 1); a.set(3 * T - 1, T + 1, 1); }
    return a;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'vaultdigger',
        name: 'VAULT DIGGER',
        publisher: 'CASTLE COIN',
        year: 1983,
        palette: VaultDiggerPalette,
        tagline: 'TAKE EVERY BAR OF GOLD',
        controls: ['STICK  RUN  CLIMB  HANG', 'A  DIG THE BRICK BESIDE YOU'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [4000, 3300, 2600, 1900, 1200],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.fixed('runSpeed', 3.75, 'runner tiles/s'),
            Knob.fixed('guardSpeed', 0.80, 'guard pace vs the runner'),
            Knob.add('guardPathing', 0.51, -0.10, "chance a guard's decision hunts (else it looks about, then patrols)").clamp(0, 1),
            Knob.fixed('guardHesitate', 0.5, 'seconds a guard that is not hunting looks about first'),
            Knob.add('holeTime', 4.0, 0.5, 'seconds a dug hole stays open').clamp(1, 8),
            Knob.fixed('trapShare', 0.75, 'a trapped guard is held for this share of holeTime'),
            Knob.fixed('guards', 3, 'guards in the vault'),
            Knob.fixed('guardGreed', 0.35, 'chance a guard picks up gold it walks over'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'caught');
    return s;
}

export const VaultDiggerSpec = buildSpec();
