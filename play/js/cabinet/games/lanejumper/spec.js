// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · the palette and the
// SPEC (data only). Grown from the port of LaneJumperCartridge.cs (Staging/Batch2/lanejumper).
// Split from cartridge.js so the renderer can read it without an import cycle.
//
// Palette: asphalt greys, safety yellow, river teal, white, headlight cream, kerb green, the log browns and a
// tail-light red, plus the night road and the moonlit river (NIGHT RUN), a signal orange and the train's
// maroon. Mercy (Core): every lane's traffic slows and its gaps widen per round lost on the cabinet, the river's
// water gaps close, the divers, the snake, the dog and the weaver calm down and the train bell rings earlier; on
// credit 5 the gaps snap wide and the courier cannot die (round.js).
// Bench (200 rounds, lj-average-player): see NOTES.md.
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
    ['night', 0x141824],        // g  the road after dark
    ['navy', 0x0E2742],         // h  the river by moonlight
    ['orange', 0xF28C28],       // i  signal lamps, the dog's coat, bunting
    ['maroon', 0x7A1E26],       // j  the train, the mudjaw's mouth
).roles('bg', 'cream', 'yellow', 'tealLight', 'asphalt');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'lanejumper',
        name: 'LANE JUMPER',
        publisher: 'REDLINE COIN-OP',
        year: 1982,
        palette: LaneJumperPalette,
        tagline: 'SIX STAGES. FIVE SLOTS. ONE BIKE.',
        controls: ['STICK  HOP ONE TILE', 'A  HURRY: HOPS TWICE AS FAST', 'EXTRA COURIER AT 10000'],
        hints: [['STICK', 'HOP'], ['A', 'HURRY']],
        roundWonText: 'ALL DELIVERED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [30000, 22000, 15000, 10000, 6000],
        titleArt: buildTitleArt(),      // the courier mid-hop between the traffic and the river
        titleArtScale: 1,
        knobs: [
            Knob.mul('roadSpeed', 1.0, 0.95, "x every traffic lane's speed (stage plans 20-70 px/s)").setOnMercy(0.8),
            Knob.mul('riverSpeed', 1.0, 0.93, "x every river row's speed (stage plans 20-40 px/s)").setOnMercy(0.7),
            Knob.mul('safeGap', 3.0, 1.3, 'tiles: the guaranteed wide gap every traffic lane keeps').setOnMercy(8),
            Knob.add('laneGap', 0, 0.3, 'tiles added to every traffic gap in the stage plans').setOnMercy(1.5),
            Knob.mul('waterGap', 1.0, 0.88, "x every river row's widest water gap (at least 1 tile)").clamp(0.3, 1.5).setOnMercy(0.3),
            Knob.mul('turtleDive', 1.0, 0.65, "x each stage's share of turtle groups that dive").setOnMercy(0),
            Knob.mul('hazard', 1.0, 0.93, 'x the snake, the dog and the weaver (speed, and how often he changes lanes)').setOnMercy(0.7),
            Knob.add('warn', 2.0, 0.3, 'seconds the train bell rings before a train').setOnMercy(3.5),
            Knob.fixed('diveUnder', 1.6, 'seconds a diving group stays under'),
            Knob.fixed('slotTol', 7, "px either side of a slot's centre that still goes in"),
            Knob.fixed('hopTime', 0.15, 'seconds per hop (hurry halves it)'),
            Knob.fixed('courierTime', 60, 'seconds per courier; resets on a slot'),
            Knob.fixed('lives', 3, 'couriers per coin'),
            Knob.fixed('extraAt', 10000, 'points for the first extra courier'),
            Knob.fixed('extraEvery', 20000, 'points for each extra courier after that'),
            Knob.fixed('stampEvery', 9, 'seconds (about) between bonus stamps'),
            Knob.fixed('stage', 1, 'the stage a coin starts on (the Lab: --knob stage=N)'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'stage');
    s.phaseNames.set(CabinetState.Playing, 'cross');
    s.phaseNames.set(CabinetState.Interlude, 'beat');
    return s;
}

export const LaneJumperSpec = buildSpec();
