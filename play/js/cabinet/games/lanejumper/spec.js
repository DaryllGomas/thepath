// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · the palette and the
// SPEC (data only). Port of LaneJumperCartridge.cs (Staging/Batch2/lanejumper).
// Split from cartridge.js so the renderer can read it without an import cycle.
//
// Palette: asphalt greys, safety yellow, river teal, white, headlight cream, kerb green, plus the
// log browns and a tail-light red. Mercy (Core): every traffic lane's guaranteed safe gap and its
// minimum gap widen per round lost on the cabinet, and the river's longest water gap closes; on
// credit 5 the gaps snap wide and the courier cannot die (round.js).
// C# bench (200 rounds, lj-average-player): 34.5 / 52.5 / 61.0 / 81.0 / 100 %, rounds 61-70 s.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { buildTitleArt } from './sprites.js';

export const LaneJumperPalette = new Palette(
    ['bg', 0x07080C],           // 0
    ['asphaltDark', 0x26282E],  // 1
    ['asphalt', 0x4A4D55],      // 2
    ['asphaltLight', 0x8E929B], // 3
    ['yellow', 0xFFD21E],       // 4
    ['amber', 0xB8860B],        // 5
    ['teal', 0x178A8C],         // 6
    ['tealDark', 0x0B4A52],     // 7
    ['tealLight', 0x6FE3D8],    // 8
    ['white', 0xFFFFFF],        // 9
    ['cream', 0xFFF0C0],        // a
    ['green', 0x3CBF4E],        // b
    ['greenDark', 0x1C6A2A],    // c
    ['brown', 0x8B5A2B],        // d
    ['brownDark', 0x4C2E14],    // e
    ['red', 0xE23A2A],          // f
).roles('bg', 'cream', 'yellow', 'tealLight', 'asphalt');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'lanejumper',
        name: 'LANE JUMPER',
        publisher: 'REDLINE COIN-OP',
        year: 1982,
        palette: LaneJumperPalette,
        tagline: 'FIVE LETTERS. SIX LANES. ONE RIVER.',
        controls: ['STICK  HOP ONE TILE', 'A  HURRY FOR ONE SECOND', 'FILL ALL FIVE MAIL SLOTS'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [9000, 7500, 6000, 4500, 3000],
        titleArt: buildTitleArt(),      // the courier mid-hop between the traffic and the river
        titleArtScale: 1,
        knobs: [
            Knob.mul('roadSpeed', 1.0, 0.95, "x every traffic lane's speed (base 24-64 px/s)").setOnMercy(0.8),
            Knob.mul('riverSpeed', 1.0, 0.92, "x every river row's speed (base 24-42 px/s)").setOnMercy(0.7),
            Knob.mul('safeGap', 3.0, 1.35, 'tiles: the guaranteed wide gap every traffic lane keeps').setOnMercy(8),
            Knob.add('laneGap', 2.9, 0.2, 'tiles: the narrowest gap between two vehicles').setOnMercy(3.8),
            Knob.fixed('gapSpread', 3.0, 'tiles: random extra on each traffic gap'),
            Knob.add('waterGap', 4.0, -0.5, 'tiles: the widest stretch of water between logs').clamp(1.2, 6).setOnMercy(1.2),
            Knob.mul('turtleDive', 0.6, 0.6, 'share of turtle groups that dive').setOnMercy(0),
            Knob.fixed('diveUnder', 1.6, 'seconds a diving group stays under'),
            Knob.fixed('slotTol', 7, "px either side of a slot's centre that still goes in"),
            Knob.fixed('hopTime', 0.15, 'seconds per hop (hurry halves it)'),
            Knob.fixed('courierTime', 60, 'seconds per courier; resets on a slot'),
            Knob.fixed('lives', 3, 'couriers per round'),
            Knob.fixed('flyEvery', 9, 'seconds (about) between bonus flies'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'cross');
    s.phaseNames.set(CabinetState.Interlude, 'beat');
    return s;
}

export const LaneJumperSpec = buildSpec();
