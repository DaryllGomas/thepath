// THE NODE · world 1 · CASTLE CRUSH (Ironclad Amusements, 1981) on the Cabinet Engine · the palette
// and the SPEC (data only). Port of CastleCrushCartridge.cs from Staging/Batch1/castlecrush.
// Split from cartridge.js so the renderer and the sim can read it without an import cycle.
//
// The siege game: Breakout with a catapult. Palette: stone grey (three steps), cannonball black,
// girder/banner red (two steps), gold (two steps), sky navy, and the cream + field green of the
// accepted cabinet art (a red catapult and green archers against a cream-and-red castle).
//
// MERCY (bench, worst case: 31.5 / 51 / 62.5 / 72 / 100 %, rounds 74-110 s):
//   credit 2-4  the stone eases x0.9 per lost round, the cart widens +4 px per lost round (20-60 px)
//   credit 5    (CreditInfo.unlosable) the golden net is strung under the cart in the sim itself:
//               the stone cannot pass it and arrows glance off, so the round cannot be lost
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const CastleCrushPalette = new Palette(
    ['sky', 0x0A1030],          // 0
    ['black', 0x0E0E12],        // 1  cannonball black
    ['stoneDark', 0x555866],    // 2
    ['stone', 0x8E909C],        // 3  stone grey
    ['stoneLight', 0xCACCD4],   // 4
    ['cream', 0xF2E6C4],        // 5
    ['red', 0xD23A2A],          // 6  girder / banner red
    ['redDark', 0x7A1C14],      // 7
    ['gold', 0xF4B832],         // 8
    ['goldDark', 0x8E6414],     // 9
    ['green', 0x3E8E3C],        // a
    ['greenDark', 0x1E4E24],    // b
    ['hill', 0x141E48],         // c  the far hills, a step off the sky
).roles('sky', 'gold', 'red', 'cream', 'stoneDark');

// the title card's picture: the catapult has just loosed, the stone arcs over to the castle, an
// archer on the tower, the banner on the keep, grass below. Built the same way the C# spec built it:
// an imperative rasterisation into a palette-indexed PixelSprite (indices match the Palette above).
function buildTitleArt() {
    const W = 72, H = 22;
    const p = new PixelSprite(W, H);
    const R = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.set(x + i, y + j, c); };

    // grass
    R(0, 21, W, 1, 10);
    for (let x = 1; x < W; x += 4) p.set(x, 20, 10);

    // the catapult: wheels, chassis, A-frame, the arm up and forward, its cup
    R(3, 14, 18, 2, 6); R(3, 16, 18, 1, 7);                       // the beam
    R(4, 17, 16, 1, 7);                                            // chassis
    for (let k = 0; k < 4; k++) { p.set(8 + k, 17 - k, 7); p.set(15 - k, 17 - k, 7); }
    for (const wx of [6, 17]) {
        R(wx - 2, 18, 5, 3, 1); p.set(wx - 1, 17, 1); p.set(wx, 17, 1); p.set(wx + 1, 17, 1);
        p.set(wx, 19, 8);
        p.set(wx - 2, 18, 3); p.set(wx + 2, 18, 3);
    }
    for (let k = 0; k < 9; k++) { p.set(12 + Math.floor(k / 2), 13 - k, 6); p.set(13 + Math.floor(k / 2), 13 - k, 6); }   // the arm
    R(16, 3, 4, 2, 7);                                             // the cup

    // the stone's arc: dotted, then the stone itself near the wall
    const arc = [[22, 3], [25, 2], [28, 1], [31, 1], [34, 1], [37, 2]];
    for (const [ax, ay] of arc) p.set(ax, ay, 5);
    R(40, 2, 3, 3, 1); p.set(41, 1, 3); p.set(41, 5, 3); p.set(39, 3, 3); p.set(43, 3, 3); p.set(40, 2, 5);

    // the castle: left tower, curtain, keep with the banner, right tower
    R(46, 8, 7, 13, 3); R(53, 12, 4, 9, 3); R(57, 6, 8, 15, 3); R(65, 10, 6, 11, 3);
    for (const mx of [46, 48, 50, 52, 57, 59, 61, 63, 65, 67, 69]) {
        const top = mx < 53 ? 8 : mx < 65 ? 6 : 10;
        p.set(mx, top - 1, 3);
    }
    for (let y = 8; y < 21; y += 3) for (let x = 46; x < 71; x++) if (p.at(x, y) === 3) p.set(x, y, 2);   // mortar courses
    R(48, 11, 1, 3, 1); R(67, 13, 1, 3, 1);                        // arrow slits
    R(59, 14, 4, 7, 1);                                             // the gate
    for (let x = 59; x < 63; x += 2) R(x, 14, 1, 7, 2);
    p.set(60, 13, 3); p.set(61, 13, 3);
    R(61, 0, 1, 5, 4);                                             // pole
    R(62, 0, 5, 3, 6); p.set(66, 1, -1); p.set(63, 1, 8);          // banner, swallowtail, emblem
    // the archer on the left tower, bow drawn toward the catapult
    p.set(49, 4, 11); p.set(50, 4, 11); p.set(49, 5, 5); p.set(50, 5, 5); R(49, 6, 2, 1, 10); p.set(48, 6, 5);
    p.set(47, 5, 6); p.set(47, 6, 6); p.set(47, 7, 6); p.set(46, 4, 6); p.set(46, 8, 6);
    return p;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'castlecrush',
        name: 'CASTLE CRUSH',
        publisher: 'IRONCLAD AMUSEMENTS',
        year: 1981,
        palette: CastleCrushPalette,
        tagline: 'BREAK THE WALLS  TOPPLE THE BANNER',
        controls: ['STICK  ROLL THE CATAPULT', 'A  LAUNCH THE STONE', 'DODGE THE ARCHERS ARROWS'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [7500, 6000, 4500, 3000, 1500],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.mul('stoneSpeed', 158, 0.9, 'px/s of the stone at the first launch; x0.9 per lost round'),
            Knob.add('cartWidth', 30, 4, 'px width of the catapult carts beam; +4 per lost round').clamp(20, 60),
            Knob.fixed('cartSpeed', 200, 'px/s the cart rolls at full stick'),
            Knob.fixed('speedRamp', 0.30, 'stone speed gained by the time the castle is down (+30 %)'),
            Knob.fixed('archerEvery', 4.5, 'mean seconds between archers stepping up'),
            Knob.fixed('archerMax', 2, 'archers on the battlements at once'),
            Knob.fixed('arrowSpeed', 85, 'px/s an arrow falls'),
            Knob.fixed('powerBlocks', 9, 'gold-marked blocks that drop a power-up'),
            Knob.fixed('stones', 3, 'stones (lives) per round'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'interlude');
    return s;
}

export const CastleCrushSpec = buildSpec();
