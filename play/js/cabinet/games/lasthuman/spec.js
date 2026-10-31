// THE NODE · world 1 · LAST HUMAN (Ember Arcade, 1983) on the Cabinet Engine · the palette and the SPEC.
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// A one-stick, two-button arena shooter in seven waves (waves.js), the last one THE MAINFRAME. Palette:
// black, machine silver, hazard red, civilian yellow, the player's cyan; each with one darker step for
// fades/dims, a white-silver for heads and cores, a near-black floor grid, and two colours the later
// waves bring: the cortex's violet (and its husks) and the rollers' shell orange.
//
// Knobs (credit N = N-1 earlier losses): every loss thins the bursts (waveScale), slows every machine
// a little (pace) and the warp-ins (spawnSlow), adds half a man, and softens the mainframe's core. On
// the fifth credit the sim's own mercy rule (credit.unlosable) gives the man a SHIELD, so that credit
// cannot be lost.
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
    ['violetDk', 0x4C1680],
    ['violet', 0xC050FF],
    ['orange', 0xFF8A1A],
).roles('bg', 'silver', 'red', 'yellow', 'redDk');

const TitleArt = buildTitleArt();

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'lasthuman',
        name: 'LAST HUMAN',
        publisher: 'EMBER ARCADE',
        year: 1983,
        palette: LastHumanPalette,
        tagline: 'SEVEN WAVES TO THE MAINFRAME',
        controls: ['STICK  MOVE AND AIM', 'HOLD A  FIRE    HOLD B  LOCK YOUR AIM', 'TOUCH THE HUMANS TO SAVE THEM'],
        hints: [['STICK', 'MOVE + AIM'], ['A', 'FIRE'], ['B', 'HOLD: LOCK AIM']],
        roundWonText: 'HUMANITY SAVED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [150000, 110000, 80000, 55000, 35000],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            // THE MERCY TUNE
            Knob.mul('waveScale', 1.0, 0.94, 'machines per burst; the bursts thin 6% per loss').clamp(0.6, 1),
            Knob.mul('pace', 1.0, 0.98, "every machine's speed; 2% slower per loss").clamp(0.85, 1),
            Knob.mul('spawnSlow', 1.0, 1.08, 'warp-in time and burst gaps; slower per loss').clamp(1, 2).setOnMercy(1),
            Knob.add('men', 3, 0.34, 'men to start (whole ones: a fourth man from the fourth credit)').clamp(3, 5),
            Knob.mul('coreHp', 30, 0.93, 'hits the mainframe core takes').clamp(16, 40),
            // the machine's book
            Knob.fixed('extraAt', 60000, 'the first extra man'),
            Knob.fixed('extraEvery', 120000, 'then one more every this many points'),
            Knob.fixed('droneSpeed', 37, 'drone px/s at the start of a wave (x the wave pace)'),
            Knob.fixed('droneRamp', 0.008, '+drone speed per second of the wave'),
            Knob.fixed('droneMaxRamp', 1.6, 'drone speed ramp cap'),
            Knob.fixed('crusherSpeed', 14, 'crusher px/s'),
            Knob.fixed('crusherPush', 4, 'px a bullet shoves a crusher'),
            Knob.fixed('cortexSpeed', 17, 'cortex px/s'),
            Knob.fixed('sparkGap', 2.8, "seconds between a cortex's sparks"),
            Knob.fixed('sparkSpeed', 52, 'spark px/s'),
            Knob.fixed('sparkTurn', 1.7, 'spark homing, rad/s'),
            Knob.fixed('huskSpeed', 46, 'husk px/s'),
            Knob.fixed('convertTime', 1.2, 'seconds a cortex needs to turn a human (shoot it first)'),
            Knob.fixed('hatchGap', 5, 'seconds between a hatcher\'s rollers (3 at most)'),
            Knob.fixed('rollerSpeed', 18, 'roller px/s'),
            Knob.fixed('shellGap', 2.6, "seconds between a roller's shells"),
            Knob.fixed('shellSpeed', 78, 'shell px/s (two bounces off the walls)'),
            Knob.fixed('miteSpeed', 48, 'mite px/s'),
            Knob.fixed('podHp', 8, 'hits a mainframe gun pod takes'),
            Knob.fixed('boltSpeed', 90, 'mainframe bolt px/s'),
            Knob.fixed('playerSpeed', 72, "the man's px/s"),
            Knob.fixed('fireGap', 0.085, 'seconds between shots while A is held (8 on the tube at most)'),
            Knob.fixed('phaseMinGap', 12, 's before a thinned floor (a quarter left) calls the next burst; x spawnSlow'),
            Knob.fixed('phaseMaxGap', 26, 's after which the next burst warps in regardless; x spawnSlow'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'wavecard');
    s.phaseNames.set(CabinetState.Playing, 'wave');
    s.phaseNames.set(CabinetState.Interlude, 'break');
    return s;
}

export const LastHumanSpec = buildSpec();
