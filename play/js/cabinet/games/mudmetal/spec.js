// THE NODE · world 1 · MUD & METAL (Redline Coin-Op, 1984) on the Cabinet Engine · THE CARTRIDGE.
// Port of MudMetalCartridge.cs.
//
// Palette: mud brown, chrome white, warning orange, dusk blue, track tan, rider red (16 entries,
// each hue with the darker steps a 1984 board would fade through).
// Mercy per Core: PAR x1.10 per lost round; the heat gauge's safe zone widens by one segment per
// lost round (the gauge gets longer: more turbo before the red line). Credit 5: the engine cannot
// overheat and the rider cannot crash (MudMetalSim honours CreditInfo.unlosable).
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { TitleArt } from './sprites.js';

// index order matters: the sprites are authored in these indices (0-9, a-f)
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
).roles('bg', 'tanLight', 'orange', 'chrome', 'dusk');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'mudmetal',
        name: 'MUD & METAL',
        publisher: 'REDLINE COIN-OP',
        year: 1984,
        palette: MudMetalPalette,
        tagline: 'ONE LAP. BEAT THE PAR TIME.',
        controls: ['A GAS   B TURBO - WATCH THE HEAT', 'STICK UP/DOWN LANE  LEFT/RIGHT LEAN'],
        roundWonText: 'QUALIFIED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [2600, 2200, 1800, 1400, 1000],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.mul('parTime', 51, 1.10, 'qualifying time, s; +10% per lost round (51 = the C# bench tune; the shipped 43.5 left credit 1 at 0.5 %)'),
            Knob.add('heatCap', 10, 1, "heat gauge segments before the red line; the safe zone widens a segment per lost round").clamp(10, 16),
            Knob.fixed('heatRise', 2.0, 'segments/s on turbo (B)'),
            Knob.fixed('heatCool', 1.0, 'segments/s on the throttle (A)'),
            Knob.fixed('topSpeed', 170, 'px/s on the throttle'),
            Knob.fixed('turboSpeed', 215, 'px/s on turbo'),
            Knob.fixed('landTol', 22, "deg: land within this of the ground's slope or crash (half = CLEAN)"),
            Knob.fixed('rivalSpeed', 1.0, "x each rival's own speed (0.64-0.74 of top speed)"),
            Knob.fixed('mudSpeed', 0.45, 'x top speed: the most you can do in mud'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'start');
    s.phaseNames.set(CabinetState.Playing, 'race');
    s.phaseNames.set(CabinetState.Interlude, 'crash');
    return s;
}

export const MudMetalSpec = buildSpec();
