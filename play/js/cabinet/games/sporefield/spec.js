// THE NODE · world 1 · SPORE FIELD (Bright Spark Inc., 1981) on the Cabinet Engine · palette + SPEC.
// Port of SporeFieldCartridge.cs from Staging/Batch1/sporefield. Split from cartridge.js so the
// renderer and the round can read it without an import cycle.
//
// Knobs (tuned on the Lab bench, 200 rounds per credit; see NOTES.md):
//   borerSpeed    cells a second the borer walks
//   mushrooms     the field planted at the start: x0.9 per lost round (the field thins 10%)
//   spiderSpeed   the spider's bounce speed (its sideways speed is spiderCross x this):
//                 x0.65 per lost round (the spider slows). THE mercy lever that moves the curve.
//   spiderDelay   mean seconds between spiders
//   shotSpeed     the strongest difficulty knob
//   segmentHit / playerSpeed / fleaSpeed / fleaThreshold   the machine's feel, fixed
//   fragile       1 on the unlosable credit: the borer cannot survive a mushroom hit
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { Shroom, BodyA, BodyB, HeadA, SpiderA, stamp } from './sprites.js';

export const SporeFieldPalette = new Palette(
    ['bg', 0x000000],
    ['red', 0xE8281C],
    ['redDark', 0x781008],
    ['green', 0x3CDC48],
    ['greenDark', 0x12702A],
    ['violet', 0xB050F8],
    ['violetDark', 0x5A2890],
    ['white', 0xFFFFFF],
).roles('bg', 'white', 'red', 'green', 'violetDark');

// the title card's picture: the borer walking over the field, the spider below it
function buildTitleArt() {
    const art = new PixelSprite(80, 17);
    for (let i = 0; i < 7; i++) stamp(art, i % 2 === 0 ? BodyA : BodyB, 8 + i * 8, 0, false);
    stamp(art, HeadA, 64, 0, false);
    stamp(art, Shroom[4], 0, 9, false);
    stamp(art, Shroom[4], 16, 9, false);
    stamp(art, Shroom[3], 56, 9, false);
    stamp(art, Shroom[4], 72, 9, false);
    stamp(art, SpiderA, 32, 9, false);
    return art;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'sporefield',
        name: 'SPORE FIELD',
        publisher: 'BRIGHT SPARK INC.',
        year: 1981,
        palette: SporeFieldPalette,
        tagline: 'SPLIT IT. SHOOT EVERY PIECE.',
        controls: ['STICK  MOVE YOUR WAND', 'BUTTON A  FIRE'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [6000, 4800, 3900, 3000, 2200],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.fixed('borerSpeed', 9.5, 'cells a second the borer walks'),
            Knob.mul('mushrooms', 120, 0.9, 'mushrooms planted; the field thins 10% per loss').clamp(20, 200),
            Knob.mul('spiderSpeed', 20, 0.65, 'spider bounce cells/s; slows 35% per loss').clamp(2.5, 40),
            Knob.fixed('spiderDelay', 2.0, 'mean seconds between spiders'),
            Knob.fixed('spiderCross', 0.4, 'spider sideways speed as a share of its bounce speed'),
            Knob.fixed('shotSpeed', 20, 'shot cells/s'),
            Knob.fixed('segmentHit', 0.35, 'how near (cells) a shot must pass a segment\'s centre to hit it'),
            Knob.fixed('playerSpeed', 12, 'wand cells/s'),
            Knob.fixed('fleaSpeed', 14, 'flea fall cells/s (doubles when hit once)'),
            Knob.fixed('fleaThreshold', 5, 'a flea drops when the strip has fewer mushrooms than this'),
            Knob.fixed('fragile', 0, '1 = the borer cannot survive a mushroom hit').setOnMercy(1),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'hit');
    return s;
}

export const SporeFieldSpec = buildSpec();
