// THE NODE · THE JUNCTION · STARVECTOR (the super-scaler) · the palette and the SPEC (data only).
//
// A Space Harrier / After Burner style super-scaler,
// flown from behind the Wayfinder, three acts (THE FIELD, THE VEIN, THE STONES), three symbols (circle, triangle, square).
// The screen is 320x240 sprites and raster only. The palette below is the HUD / attract / name-entry set; the worlds draw
// from their own ramps (gfx.js) quantised to chunky steps.
//
// MERCY, per round lost on this cabinet (L = rounds lost before this credit; credit n = L + 1 when every one was lost):
//   speed       x0.93 per loss (floor 0.72)     fewer enemies   spawn gaps x1/0.82 per loss
//   enemy fire  slower and wilder aim            barrel roll     longer (0.55 s +0.12/loss) and a shorter cooldown
//   aim assist  shots lean toward a target       shield          recharges faster (8 s -> 5.5 s); it absorbs ONE hit, two quick hits still kill
//   the ease PLATEAUS (floors/caps below, reached by credit ~9): no credit is ever unlosable or free; you must beat the game
//   (BOSSES: their health scales with 'density', their attack gaps with 'enemyEvery'; a loss in a boss fight restarts AT the boss: Progress.boss)
// A loss restarts the CURRENT act on the next credit (Progress, below), never from scratch; the symbols earned stay lit.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const StarvectorPalette = new Palette(
    ['bg', 0x03040C],          // 0 the tube
    ['navy', 0x14214E],        // 1 faint labels, rules
    ['rockDim', 0x5E88A8],     // 2 dim HUD, dim table rows
    ['rock', 0xD6ECFF],        // 3 HUD text
    ['white', 0xFFFFFF],       // 4
    ['cyan', 0x3CDCFF],        // 5 the engines, the entry
    ['cyanDim', 0x0E5470],     // 6
    ['gold', 0xF0B030],        // 7 title base, symbols, accents
    ['goldHi', 0xFFF0B0],      // 8 title top
    ['goldDim', 0x6A4410],     // 9 title shadow
    ['red', 0xFF3A2E],         // a
    ['redDim', 0x6A0E12],      // b
).roles('bg', 'rock', 'gold', 'goldHi', 'goldDim');

/** which act the NEXT credit starts on (set by the sim: the act you were in when a credit was lost; 1 again after a win);
 *  boss = it was lost in the boss fight: the next credit starts at the boss, not the act's approach */
export const Progress = { act: 1, boss: false };

export const StarvectorSpec = (function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'starvector',
        name: 'STARVECTOR',
        publisher: 'ORBITAL ELECTRONICS',
        year: 1982,
        palette: StarvectorPalette,
        tagline: 'THREE ACTS  ONE GATE',
        controls: ['STICK FLY  A FIRE (HOLD)  B ROLL'],
        roundWonText: 'GATE OPENED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [42500, 38100, 31600, 26200, 21800],
        titleArt: null,
        knobs: [
            Knob.fixed('ships', 3, 'ships per credit'),
            Knob.mul('speed', 1, 0.955, 'x the flight speed: the world is slower after every loss').clamp(0.72, 1),
            Knob.mul('density', 1, 0.9, 'x how often things come at you (fewer enemies after a loss)').clamp(0.45, 1),
            Knob.add('enemyEvery', 0.7, 0.16, 'seconds between an enemy gun shots (the boss attack gaps scale with it)').clamp(0.7, 3.2),
            Knob.add('aimError', 0.3, 0.2, 'world units an enemy shot misses by').clamp(0.3, 2.6),
            Knob.add('rollSeconds', 0.55, 0.07, 'the barrel roll\'s invulnerable time').clamp(0.55, 1.1),
            Knob.add('rollCooldown', 1.6, -0.12, 'the barrel roll\'s cooldown').clamp(0.7, 1.6),
            Knob.add('assist', 0.25, 0.13, 'how hard your shots lean toward a target').clamp(0.25, 1),
            Knob.mul('hitSize', 1, 0.96, 'x your ship\'s hit box').clamp(0.72, 1),
            Knob.add('shieldRecharge', 8, -0.35, 'seconds the ship shield takes to come back after it absorbs a hit (faster after losses; a plateau, never free)').clamp(5.5, 8),
            Knob.fixed('startAct', 0, '0 = the act the last credit was lost in; 1..3 = force (tests)'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'card');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'symbol');
    return s;
})();
