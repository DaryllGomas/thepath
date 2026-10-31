// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · the palette and
// the SPEC (data only). Port of IronworksCartridge.cs from Staging/Batch3/ironworks, built out to five
// boards on 2026-10-18 (see NOTES.md). Split from cartridge.js so the renderer and the sim can read it
// without an import cycle.
//
// Palette: girder red, steel grey, drum black, banner gold, climber blue, ladder cyan, plus the
// few shades a 1981 board needed (dark red truss, dark steel, dark gold, skin, fire, white), and for
// the build-out an ember (hot drums, the furnace's mouth) and a signal green (the cages' lamps).
//
// Knobs ease after every loss: drums x0.92, throw gaps x1.16, fire and springs x0.9,
// carts x0.92, spark gaps x1.15; hammers gain a second and bonus ticks gain 0.1 s.
// Credit five sets slow hazards and cannot lose a climber. Each board applies its own share.
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
    ['ember', 0xB0380C],     // f hot drums, the furnace's mouth
    ['green', 0x3CD25A],     // g the cages' lamps, GO
).roles('bg', 'white', 'red', 'gold', 'redDark');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'ironworks',
        name: 'IRONWORKS',
        publisher: 'IRONCLAD AMUSEMENTS',
        year: 1981,
        palette: IronworksPalette,
        tagline: 'FIVE BOARDS TO THE TOP',
        controls: ['STICK  WALK AND CLIMB', 'A  JUMP     HAMMER  SMASH', 'PULL THE BOLTS  TOP OUT'],
        hints: [['STICK', 'WALK  CLIMB'], ['A', 'JUMP']],
        roundWonText: 'TOPPED OUT',
        roundLostText: 'GAME OVER',
        highScoreSeed: [40000, 30000, 22000, 15000, 8000],
        titleArt: IronworksSprites.TitleArt,
        titleArtScale: 1,
        knobs: [
            Knob.mul('drumSpeed', DrumSpeedBase, 0.92, 'drum roll speed px/s (x each board\'s share)').setOnMercy(22),
            Knob.mul('throwGap', 2.1, 1.16, 'mean s between the foreman\'s throws (+-25%)').setOnMercy(4.2),
            Knob.add('hammerSeconds', 8, 1, 'how long the hammer swings').floorOnMercy(12),
            Knob.mul('fireSpeed', 30, 0.9, 'fire-ball px/s').setOnMercy(16),
            Knob.mul('cartSpeed', 40, 0.92, 'ore cart px/s along its belt (board 2)').setOnMercy(22),
            Knob.mul('sparkGap', 3.4, 1.15, 'mean s between the oil drum\'s sparks (board 4)').setOnMercy(8),
            Knob.mul('springSpeed', 49, 0.9, 'spring jack px/s along the top (board 3)').setOnMercy(40),
            Knob.add('timerStep', 1.6, 0.1, 'seconds per 100 off the bonus'),
            Knob.fixed('walkSpeed', 42, 'climber walk px/s'),
            Knob.fixed('climbSpeed', 36, 'climber ladder px/s'),
            Knob.fixed('beltSpeed', 16, 'how fast a belt carries the climber (board 2)'),
            Knob.fixed('liftSpeed', 30, 'cage px/s (board 3)'),
            Knob.fixed('maxDrums', 7, 'drums, carts or springs out at once'),
            Knob.fixed('extraAt', 20000, 'points for the extra climber'),
            Knob.fixed('startBoard', 1, 'the board a coin starts on (tests)'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'card');
    s.phaseNames.set(CabinetState.Playing, 'climb');
    s.phaseNames.set(CabinetState.Interlude, 'down');
    return s;
}

export const IronworksSpec = buildSpec();
