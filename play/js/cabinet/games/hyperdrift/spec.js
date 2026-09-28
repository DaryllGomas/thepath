// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · the palette and the
// SPEC (data only). Port of HyperDriftCartridge.cs (Staging/Batch3/hyperdrift).
// Split from cartridge.js so the renderer and the sim can read it without an import cycle.
//
// The palette is the cabinet art's: asphalt grey, rail white, sunset orange sand, car yellow, with grass
// green scrub and red / blue traffic, a river blue and a dark for every hue (fades and shading step
// through palette entries, never a blend). Index order matters: the sprites are authored against it.
//
// Knobs (Core mercy): the clock x1.10 per lost round; the road margin +3 px per lost round (how far the
// car may hang off the road before it spins). Credit 5 empties the road (traffic and oil set to 0) and
// the sim holds the clock at 1: it cannot run out.
// C# bench (worst case, 200 rounds): 28.5 / 47.5 / 66.0 / 82.5 / 100 %, rounds 83-110 s.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { HyperDriftSprites } from './sprites.js';

export const HyperDriftPalette = new Palette(
    ['bg', 0x0A0A0E],
    ['asphalt', 0x4A4C56],
    ['asphaltDark', 0x2C2E36],
    ['white', 0xF2EEDC],
    ['orange', 0xE8741C],
    ['orangeDark', 0xA04812],
    ['yellow', 0xFFD21E],
    ['yellowDark', 0xB08400],
    ['green', 0x3E9E3A],
    ['greenDark', 0x1F5C24],
    ['red', 0xD82A22],
    ['redDark', 0x741410],
    ['blue', 0x2E6CE4],
    ['blueDark', 0x173E86],
    ['grey', 0x9C9EA8],
).roles('bg', 'white', 'orange', 'yellow', 'orangeDark');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'hyperdrift',
        name: 'HYPER DRIFT',
        publisher: 'REDLINE COIN-OP',
        year: 1983,
        palette: HyperDriftPalette,
        tagline: 'BEAT THE CLOCK TO THE CHECKPOINT',
        controls: ['STICK  STEER   UP GAS   DOWN BRAKE', 'A  DRIFT THROUGH THE HAIRPINS', 'PASS THE TRUCKS - MIND THE OIL'],
        roundWonText: 'CHECKPOINT',
        roundLostText: 'TIME UP',
        highScoreSeed: [3600, 3200, 2800, 2400, 2000],
        titleArt: HyperDriftSprites.titleArt(),
        titleArtScale: 1,
        knobs: [
            Knob.mul('clock', 90, 1.10, 'seconds on the clock to reach the checkpoint'),
            Knob.add('margin', 0, 3, 'px the car may hang off the road before it spins').clamp(0, 12),
            Knob.fixed('traffic', 1, 'traffic density (spawn rate)').setOnMercy(0),
            Knob.fixed('oil', 1, 'oil slicks per patch').setOnMercy(0),
            Knob.fixed('vmax', 175, 'top speed, px/s up the road'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'start');
    s.phaseNames.set(CabinetState.Playing, 'race');
    s.phaseNames.set(CabinetState.Interlude, 'finish');
    return s;
}

export const HyperDriftSpec = buildSpec();
