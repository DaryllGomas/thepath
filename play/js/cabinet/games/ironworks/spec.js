// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · the palette and
// the SPEC (data only). Port of IronworksCartridge.cs from Staging/Batch3/ironworks.
// Split from cartridge.js so the renderer and the sim can read it without an import cycle.
//
// Palette: girder red, steel grey, drum black, banner gold, climber blue, ladder cyan, plus the
// few shades a 1981 board needed (dark red truss, dark steel, dark gold, skin, fire, white).
//
// Knobs: drums roll 64 px/s and ease x0.9 per lost round (the brief's -10 %); on the fifth
// credit they crawl at 18 px/s. The hammer swings 8 s, +1 s per lost round, at least 12 s on
// the mercy credit. Everything else is the machine's fixed tuning, exposed for --knob.
// (The C# Lab's last bench.txt was a tuning probe with --knob drumSpeed=56 throwGap=2.6
// walkSpeed=42 --seed 4; the web build adopts that tune (drums 56, throws 2.6 s, walk 42): the shipped 64 / 2.2 / 48
// left credit 1 at 16 % for the bot, far harder than every other cabinet.
// See NOTES.md.)
import { f32, Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { IronworksSprites } from './sprites.js';

export const DrumSpeedBase = f32(56);   // the tune (was 64)

export const IronworksPalette = new Palette(
    ['bg', 0x04050B],        // 0
    ['red', 0xE8323E],       // 1 girder red
    ['redDark', 0x7C1422],   // 2
    ['steel', 0xA8B0BC],     // 3 steel grey
    ['steelDark', 0x4E5664], // 4
    ['drum', 0x24262E],      // 5 drum black
    ['gold', 0xF6C338],      // 6 banner gold
    ['goldDark', 0xA46E12],  // 7
    ['blue', 0x3070F0],      // 8 climber blue
    ['cyan', 0x40E8F0],      // 9 ladder cyan
    ['white', 0xFFFFFF],     // a
    ['skin', 0xF4B488],      // b
    ['fire', 0xFF7418],      // c
    ['blueDark', 0x183C8C],  // d
    ['cyanDark', 0x167480],  // e
).roles('bg', 'white', 'red', 'gold', 'redDark');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'ironworks',
        name: 'IRONWORKS',
        publisher: 'IRONCLAD AMUSEMENTS',
        year: 1981,
        palette: IronworksPalette,
        tagline: 'CLIMB TO THE BANNER',
        controls: ['STICK  WALK AND CLIMB', 'A  JUMP A DRUM  100', 'HAMMER  SMASH IT  300'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [9000, 7500, 6000, 4500, 3000],
        titleArt: IronworksSprites.TitleArt,
        titleArtScale: 1,
        knobs: [
            Knob.mul('drumSpeed', DrumSpeedBase, 0.9, 'drum roll speed px/s').setOnMercy(18),
            Knob.mul('throwGap', 2.6, 1.111, 'mean s between throws (+-25%); paced to the drums').setOnMercy(4),
            Knob.fixed('ladderChance', 0.2, 'chance a drum takes a ladder it rolls over'),
            Knob.add('hammerSeconds', 8, 1, 'how long the hammer swings').floorOnMercy(12),
            Knob.fixed('walkSpeed', 42, 'climber walk px/s'),
            Knob.fixed('climbSpeed', 36, 'climber ladder px/s'),
            Knob.fixed('fireSpeed', 28, 'fire-ball wander px/s'),
            Knob.fixed('fireMax', 2, 'fire-balls alive at once'),
            Knob.fixed('maxDrums', 7, 'drums on the structure at once'),
            Knob.fixed('timerStep', 1.6, 'seconds per 100 off the bonus'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'getready');
    s.phaseNames.set(CabinetState.Playing, 'climb');
    s.phaseNames.set(CabinetState.Interlude, 'down');
    return s;
}

export const IronworksSpec = buildSpec();
