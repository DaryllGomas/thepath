// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · the palette and the
// SPEC (data only). Started as a port of HyperDriftCartridge.cs (Staging/Batch3/hyperdrift).
// Split from cartridge.js so the renderer and the sim can read it without an import cycle.
//
// The palette is the cabinet art's: asphalt grey, rail white, sunset orange sand, car yellow, with grass
// green scrub and red / blue traffic, a river blue and a dark for every hue (fades and shading step
// through palette entries, never a blend). The rally added eight: the city's night and its buildings, the
// rival's purple and its shade, ice, snow and its shade, and the coast's beach sand. Index order matters:
// the sprites are authored against it.
//
// Knobs (Core mercy), per game lost on this cabinet: every leg's clock x1.08 (the start, the extension
// and the refill); the road margin +3 px (how far the car may hang off the road before it spins); the
// traffic x0.9; the rival's pace x0.97. Credit 5 empties the road (traffic and hazards set to 0), slows
// the rival, and the sim holds the clock at 1 and never takes the last car: it cannot be lost.
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
    ['night', 0x141B33],
    ['nightBlue', 0x2A3866],
    ['purple', 0xA43ED8],
    ['purpleDark', 0x55207A],
    ['ice', 0xA8DCF4],
    ['snow', 0xE6EDF5],
    ['snowShade', 0xA9B5C9],
    ['sand', 0xE6C67A],
).roles('bg', 'white', 'orange', 'yellow', 'orangeDark');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'hyperdrift',
        name: 'HYPER DRIFT',
        publisher: 'REDLINE COIN-OP',
        year: 1983,
        palette: HyperDriftPalette,
        tagline: 'A RALLY IN FIVE LEGS - BEAT THE CLOCK',
        controls: ['STICK  STEER   UP GAS   DOWN BRAKE', 'A DRIFT  B BRAKE - DRIFT THE HAIRPINS', 'BEAT THE RIVAL TO THE CANYON FLAG'],
        hints: [['LR', 'STEER'], ['UP', 'GAS'], ['DOWN', 'BRAKE'], ['A', 'DRIFT'], ['B', 'BRAKE']],
        roundWonText: 'RALLY CHAMPION',
        roundLostText: 'GAME OVER',
        highScoreSeed: [65000, 45000, 30000, 20000, 12000],
        titleArt: HyperDriftSprites.titleArt(),
        titleArtScale: 1,
        knobs: [
            Knob.mul('clock', 1, 1.08, 'x every leg\'s clock: the start, the extension, the refill'),
            Knob.add('margin', 0, 3, 'px the car may hang off the road before it spins').clamp(0, 12),
            Knob.mul('traffic', 1, 0.9, 'traffic density (spawn rate)').setOnMercy(0),
            Knob.fixed('hazards', 1, 'oil, puddles, ice and rockfalls dealt per leg').setOnMercy(0),
            Knob.mul('rival', 1, 0.97, 'the rival\'s pace in the final dash').setOnMercy(0.5),
            Knob.fixed('cars', 3, 'cars per coin'),
            Knob.fixed('vmax', 175, 'top speed, px/s up the road'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'start');
    s.phaseNames.set(CabinetState.Playing, 'race');
    s.phaseNames.set(CabinetState.Interlude, 'tally');
    return s;
}

export const HyperDriftSpec = buildSpec();
