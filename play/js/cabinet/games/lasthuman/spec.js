// THE NODE · world 1 · LAST HUMAN (Ember Arcade, 1983) on the Cabinet Engine · the palette and the SPEC.
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// A one-stick, one-button Robotron. Palette: black, machine silver, hazard red, civilian yellow, the
// player's cyan; each with one darker step for fades/dims, a white-silver for heads and cores, and a
// near-black floor grid.
//
// Knobs (credit N = N-1 earlier losses): the wave thins 10% per loss (waveScale x0.9) and the spawn-ins
// slow down (spawnSlow x1.10). On the fifth credit `trickle` snaps to 1 (machines warp in one at a time)
// and the sim's own mercy rule (credit.unlosable) gives the man a SHIELD, so that credit cannot be lost.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { buildTitleArt } from './sprites.js';

export const LastHumanPalette = new Palette(
    ['bg', 0x000000],
    ['floor', 0x1E1E28],
    ['silverDk', 0x585C68],
    ['silver', 0xA8AEBC],
    ['silverHi', 0xF2F4FA],
    ['redDk', 0x6E0E0C],
    ['red', 0xE8221C],
    ['yellowDk', 0x8A6C08],
    ['yellow', 0xFFD425],
    ['cyanDk', 0x0B5C70],
    ['cyan', 0x30E4FF],
).roles('bg', 'silver', 'red', 'yellow', 'redDk');

const TitleArt = buildTitleArt();

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'lasthuman',
        name: 'LAST HUMAN',
        publisher: 'EMBER ARCADE',
        year: 1983,
        palette: LastHumanPalette,
        tagline: 'SAVE THE LAST HUMANS',
        controls: ['STICK  MOVE AND FACE', 'HOLD A  FIRE THE WAY YOU FACE', 'TOUCH A HUMAN TO SAVE THEM'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [35000, 28000, 22000, 17000, 12000],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.mul('waveScale', 1.0, 0.9, 'machine count; the wave thins 10% per loss').clamp(0.4, 1),
            Knob.mul('spawnSlow', 1.0, 1.10, 'warp-in time and phase gaps; spawns slow per loss').clamp(1, 2.5).setOnMercy(1),
            Knob.fixed('grunts', 100, 'grunts over the three phases (40/30/30)'),
            Knob.fixed('brains', 10, 'brains, phases 2 and 3'),
            Knob.fixed('hulks', 6, 'hulks, spread over the phases'),
            Knob.fixed('civiliansMin', 3, 'humans on the floor, at least'),
            Knob.fixed('civiliansMax', 6, 'humans on the floor, at most'),
            Knob.fixed('gruntSpeed', 29, 'grunt px/s at the start of the wave'),
            Knob.fixed('gruntRamp', 0.008, '+grunt speed per second of play'),
            Knob.fixed('gruntMaxRamp', 1.6, 'grunt speed ramp cap'),
            Knob.fixed('hulkSpeed', 14, 'hulk px/s'),
            Knob.fixed('hulkPush', 4, 'px a bullet shoves a hulk'),
            Knob.fixed('brainFireGap', 3.0, "seconds between a brain's sparks"),
            Knob.fixed('sparkSpeed', 55, 'spark px/s'),
            Knob.fixed('sparkTurn', 1.8, 'spark homing, rad/s'),
            Knob.fixed('playerSpeed', 72, "the man's px/s"),
            Knob.fixed('fireGap', 0.085, 'seconds between shots while A is held (8 on the tube at most)'),
            Knob.fixed('phaseMinGap', 14, 's before a thinned floor (a quarter left) calls the next phase; x spawnSlow'),
            Knob.fixed('phaseMaxGap', 30, 's after which the next phase warps in regardless; x spawnSlow'),
            Knob.fixed('trickle', 0, '1 = machines warp in one at a time').setOnMercy(1),
            Knob.fixed('trickleGap', 1.2, 'seconds between one-at-a-time warp-ins'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'spawnin');
    s.phaseNames.set(CabinetState.Playing, 'wave');
    s.phaseNames.set(CabinetState.Interlude, 'mandown');
    return s;
}

export const LastHumanSpec = buildSpec();
