// THE NODE · world 1 · GRID CYCLES '82 on the Cabinet Engine · the palette and the SPEC (data only).
// Tournament data; kept separate so the picture and rules have no import cycle.
// Mercy slows the bus, loosens rival steering and grants a small wall-save budget.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const GridCyclesPalette = new Palette(
    ['bg', 0x030510],
    ['gridMinor', 0x081634],
    ['grid', 0x1650AA],
    ['magenta', 0xE628D2],
    ['cyan', 0x28DCFF],
    ['cyanCore', 0xC8FAFF],
    ['orange', 0xFF8014],
    ['orangeCore', 0xFFE18C],
    ['hud', 0x8CF096],
    ['white', 0xFFFFFF],
    ['cyanDim', 0x0E5064],
    ['orangeDim', 0x64320A],
    ['magentaDim', 0x5A1054],
).roles('bg', 'hud', 'magenta', 'cyan', 'magentaDim');

// the title card's picture: a moment of the game, the orange cycle diving past the cyan one
const TitleArt = PixelSprite.fromRows(
    '....................6666666666666666666666666666',
    '....................6777777777777777777777777777',
    '....................6766666666666666666666666666',
    '....................676.44444...................',
    '....................676.49994...................',
    '....................676.49994...................',
    '....................676.44444...................',
    '...................66666.454....................',
    '...................69996.454....................',
    '...................69996.454....................',
    '...................66666.454....................',
    '4444444444444444444444444454....................',
    '5555555555555555555555555554....................',
    '4444444444444444444444444444....................');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'gridcycles',
        name: 'GRID CYCLES',
        publisher: 'GRIDWORKS',
        year: 1982,
        palette: GridCyclesPalette,
        tagline: 'SIX SECTORS TO THE MASTER',
        controls: ['STICK  STEER - NO REVERSE', 'A  BOOST / RECHARGES IN 5 SEC', 'TWO WINS PER SECTOR - 3 LIVES', 'EXTRA CYCLE AT 12000'],
        roundWonText: 'GRID LIBERATED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [38000, 30000, 22000, 14000, 8000],
        titleArt: TitleArt,
        titleArtScale: 3,
        knobs: [
            // the player's side: the whole duel slows a little per lost round (more time to react)
            Knob.mul('baseSpeed', 12, 0.95, 'player cells/s at the start of a duel').clamp(10, 12),
            Knob.mul('ramp', 0.012, 0.8, '+speed per second of a duel'),
            Knob.add('maxRamp', 1.6, -0.1, 'speed ramp cap').clamp(1.3, 1.6),
            Knob.add('countdownStep', 0.7, 0.1, 'seconds per countdown number').clamp(0.7, 1.0),
            Knob.add('wallAssist', -7, 4, 'wall-assist saves per round: 0,0,1,5 (credit 5: the full assist)').clamp(0, 5),
            // the rival's side: sloppier from the first loss, and it starts in a narrower lane by its wall
            Knob.fixed('rivalSpeed', 1.0, 'rival speed vs the player').capOnMercy(0.3),
            Knob.add('rivalLapse', 0.30, 0.05, 'chance per step the rival only checks the next cell').clamp(0.3, 0.45),
            Knob.add('rivalWander', 0.055, 0.055, 'chance per step of a voluntary turn').clamp(0, 0.11),
            Knob.add('rivalAreaCap', 82, -26, "cells the rival's flood fill looks at (small = trappable)").clamp(12, 30),
            Knob.add('rivalInset', 18, -8, "cells between the rival's start lane and its wall").clamp(10, 18),
        ],
    });
    s.hints = [['STICK', 'STEER'], ['A', 'BOOST']];
    s.phaseNames.set(CabinetState.Intro, 'countdown');
    s.phaseNames.set(CabinetState.Playing, 'duel');
    s.phaseNames.set(CabinetState.Interlude, 'derez');
    return s;
}

export const GridCyclesSpec = buildSpec();
