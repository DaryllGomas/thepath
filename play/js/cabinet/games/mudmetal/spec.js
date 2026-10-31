// THE NODE · world 1 · MUD & METAL (Redline Coin-Op, 1984) on the Cabinet Engine · THE CARTRIDGE.
// Port of MudMetalCartridge.cs, built out (2026-10-18) into a six-race championship (stages.js).
//
// Palette: mud brown, chrome white, warning orange, dusk blue, track tan, rider red (the first 16
// entries, each hue with the darker steps a 1984 board would fade through), then the colours the
// later tracks brought: creek water and its foam, the bog's grass, the field's green jerseys.
// Mercy per Core: every lost coin lengthens each qualifying time (PAR), widens the heat gauge's safe
// zone by a segment, takes the championship field's pace down a step and, from the third coin, adds a
// try. Credit 5: the engine cannot overheat, the rider cannot crash, and the clock never fails a race
// (MudMetalSim honours CreditInfo.unlosable).
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { TitleArt } from './sprites.js';

// index order matters: the sprites are authored in these indices (0-9, a-j)
export const MudMetalPalette = new Palette(
    ['bg', 0x0B0F26],           // 0  the tube's black: dusk gone to night
    ['night', 0x18204A],        // 1
    ['dusk', 0x2C3C88],         // 2  dusk blue
    ['sky', 0x5670CC],          // 3  (the rivals' jerseys)
    ['mudDark', 0x3C2614],      // 4
    ['mud', 0x6E4626],          // 5  mud brown
    ['tanDark', 0x9E7848],      // 6
    ['tan', 0xC9A166],          // 7  track tan
    ['tanLight', 0xE8CE9A],     // 8
    ['chromeDim', 0x9CA4BA],    // 9
    ['chrome', 0xF4F6FA],       // a  chrome white
    ['orangeDim', 0xA14E14],    // b
    ['orange', 0xFF8C1E],       // c  warning orange
    ['redDim', 0x861C20],       // d
    ['red', 0xE2322C],          // e  rider red
    ['steel', 0x5E657C],        // f
    ['water', 0x2A78B4],        // g  the creek and the fords
    ['foam', 0x9ED6EE],         // h
    ['grass', 0x4E8A2E],        // i  the bog's banks; green jerseys
    ['grassDark', 0x24461A],    // j
).roles('bg', 'tanLight', 'orange', 'chrome', 'dusk');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'mudmetal',
        name: 'MUD & METAL',
        publisher: 'REDLINE COIN-OP',
        year: 1984,
        palette: MudMetalPalette,
        tagline: 'SIX TRACKS. ONE CHAMPION.',
        controls: ['A GAS   B TURBO - WATCH THE HEAT', 'STICK UP/DOWN LANE  LEFT/RIGHT LEAN'],
        hints: [['A', 'GAS'], ['B', 'TURBO'], ['UD', 'LANE'], ['LR', 'LEAN IN THE AIR']],
        roundWonText: 'CHAMPION',
        roundLostText: 'GAME OVER',
        highScoreSeed: [60000, 45000, 32000, 22000, 14000],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            // THE MERCY TUNE
            Knob.mul('parTime', 1.0, 1.07, "x every track's qualifying time (stages.js); +7% per lost coin").clamp(1, 1.3),
            Knob.add('heatCap', 10, 1, 'heat gauge segments before the red line; the safe zone widens a segment per lost coin').clamp(10, 14),
            Knob.mul('fieldPace', 1.0, 0.98, "x the championship field's speed (the final); 2% easier per lost coin").clamp(0.92, 1).setOnMercy(0.82),
            Knob.add('tries', 3, 0.5, 'tries to start (whole ones: a fourth from the third coin)').clamp(3, 4),
            Knob.add('landTol', 22, 0.5, "deg: land within this of the ground's slope or crash (half = CLEAN)").clamp(22, 24),
            // the machine's book
            Knob.fixed('extraAt', 25000, 'score for the first extra try'),
            Knob.fixed('extraEvery', 40000, 'then one more every this many points'),
            Knob.fixed('heatRise', 2.0, 'segments/s on turbo (B)'),
            Knob.fixed('heatCool', 1.0, 'segments/s on the throttle (A)'),
            Knob.fixed('waterCool', 5.0, 'segments/s while the wheels are in water'),
            Knob.fixed('topSpeed', 170, 'px/s on the throttle'),
            Knob.fixed('turboSpeed', 215, 'px/s on turbo'),
            Knob.fixed('rivalSpeed', 1.0, "x each slow rider's own speed (0.62-0.74 of top speed)"),
            Knob.fixed('mudSpeed', 0.45, 'x top speed: the most you can do in mud'),
            Knob.fixed('waterSpeed', 0.72, 'x top speed: the most you can do through a ford'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'start');
    s.phaseNames.set(CabinetState.Playing, 'race');
    s.phaseNames.set(CabinetState.Interlude, 'crash');
    return s;
}

export const MudMetalSpec = buildSpec();
