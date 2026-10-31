// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · the palette and the SPEC (data only).
// Built out from the IronDojoCartridge.cs port (Staging/Batch3/irondojo) into the five-floor game (2026-10-18).
// Split from cartridge.js so the sim, the renderer and the bot can read it without an import cycle.
//
// Palette: the 1985 board's eleven (dojo red, shadow black, gi white, boss gold, floor tan and their darker steps)
// plus ten for the floors above the first: the night sky and the ninja navy, mirror steel and moonlight, bamboo in two
// greens and a leaf jade, the golden hall's plum and violet, and the fire-lizard's orange (21 colours).
// The knobs: every attacker's approach eases 8 % per lost round, the masters' wind-ups lengthen 8 % per lost round,
// arrivals thin 6 %, and each lost round adds one block of energy. On the fifth credit no master's blow can land
// (bossLands = 0), arrivals thin right out (spawnGap x2) and the sim keeps the fighter on his feet (sim.js: energy never
// below 1, the timer never calls TIME UP).
import { CabinetGameSpec, CabinetState, Knob, Palette } from '../../sdk/index.js';
import { IronDojoSprites } from './sprites.js';

export const IronDojoPalette = new Palette(
    ['shadow', 0x0A0608],       // 0  shadow black: the tube, hair, belts, the grabbers' gis
    ['shadowRed', 0x3E0E0E],    // 1  lacquer in shadow
    ['dojoRed', 0xA41C1C],      // 2  dojo red: the walls
    ['red', 0xE0482A],          // 3  lantern red: headbands, throwers' vests, warnings
    ['woodDark', 0x4C2A14],     // 4  pillars, beams, the stick
    ['tanDark', 0x94663A],      // 5  wainscot, floor seams
    ['tan', 0xD8A868],          // 6  floor tan (and skin)
    ['white', 0xF2EEE2],        // 7  gi white
    ['grey', 0x8C8894],         // 8  gi folds, the dwarves
    ['goldDark', 0x8C5A10],     // 9  the boss's robe folds, frames
    ['gold', 0xF2B824],         // 10 boss gold
    ['night', 0x0C1028],        // 11 b  the sky over the roof
    ['navy', 0x22305C],         // 12 c  TWIN BLADES' gi, the mirror's depth
    ['steel', 0x5C6E8C],        // 13 d  mirror steel, blades
    ['moon', 0xC4D2EA],         // 14 e  moonlight, mirror glints, the ghosts
    ['bambooDark', 0x1F4A26],   // 15 f  bamboo in shadow, snake scales
    ['bamboo', 0x3E8A3A],       // 16 g  bamboo, the snakes
    ['jade', 0x86C86A],         // 17 h  leaves, the snake's belly
    ['plum', 0x4A1C48],         // 18 i  the golden hall's curtains, the ring dancer's trousers
    ['violet', 0x8E4A9C],       // 19 j  the ring dancer's robe
    ['orange', 0xF07818],       // 20 k  fire: the lizards, the master's palm
).roles('shadow', 'white', 'dojoRed', 'gold', 'shadowRed');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'irondojo',
        name: 'IRON DOJO',
        publisher: 'IRONCLAD AMUSEMENTS',
        year: 1985,
        palette: IronDojoPalette,
        tagline: 'FIVE FLOORS - FIVE MASTERS - ONE FIST',
        controls: ['A PUNCH   B KICK   STICK DUCK / JUMP', 'WIGGLE THE STICK TO BREAK A HOLD'],
        hints: [['LR', 'WALK'], ['DOWN', 'DUCK'], ['UP', 'JUMP'], ['A', 'PUNCH'], ['B', 'KICK']],
        roundWonText: 'DOJO CONQUERED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [150000, 110000, 80000, 55000, 30000],
        titleArt: IronDojoSprites.TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.mul('approach', 1.0, 0.95, "attackers' walk / roll / flight speed, eased 5% per loss").clamp(0.5, 1),
            Knob.add('bossTell', 1.0, 0.08, "x every master's wind-up, +8% per loss").clamp(1, 1.6),
            Knob.fixed('bossLands', 1, "1 = a master's blow can land").setOnMercy(0),
            Knob.mul('spawnGap', 1.0, 1.04, "x each floor's mean seconds between arrivals").clamp(1, 1.5).setOnMercy(2),
            Knob.add('energy', 16, 0.5, 'energy blocks a life (+1 every two lost coins)').clamp(16, 18),
            Knob.fixed('lives', 3, 'lives a coin'),
            Knob.fixed('extendFirst', 30000, 'the first extra life'),
            Knob.fixed('extendEvery', 50000, 'then another every'),
            Knob.fixed('knifeSpeed', 120, 'px/s'),
            Knob.fixed('throwGap', 1.9, "seconds between a thrower's knives"),
            Knob.fixed('grabDrain', 0.5, 'seconds per energy unit, per grabber holding'),
            Knob.fixed('shakeWiggles', 6, 'stick presses to shake one grabber off (+2 per extra)'),
            Knob.fixed('startFloor', 1, 'the floor a coin starts on (1; the Lab can bench one floor with --knob startFloor=N)'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'card');
    s.phaseNames.set(CabinetState.Playing, 'fight');
    s.phaseNames.set(CabinetState.Interlude, 'between');
    return s;
}

export const IronDojoSpec = buildSpec();
