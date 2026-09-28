// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · the palette and the SPEC (data only).
// Port of IronDojoCartridge.cs from Staging/Batch3/irondojo.
// Split from cartridge.js so the sim, the renderer and the bot can read it without an import cycle.
//
// Palette: dojo red, shadow black, gi white, boss gold and floor tan, each with the one or two
// darker steps the boards used for shading (11 colours). The knobs: every attacker's approach
// eases 10 % per lost round (x0.9) and the boss's telegraph lengthens 0.04 s per lost round; on the
// fifth credit his stick cannot land (bossLands = 0), arrivals thin out (spawnGap 1.7 s) and the sim
// keeps the fighter on his feet (sim.js: energy never below 1, the timer never calls TIME UP).
// C# bench (worst case, 400 rounds): 33.8 / 50.5 / 65.5 / 78.5 / 100 %, rounds 91-101 s (credit 5: 58.5 s).
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
).roles('shadow', 'white', 'dojoRed', 'gold', 'shadowRed');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'irondojo',
        name: 'IRON DOJO',
        publisher: 'IRONCLAD AMUSEMENTS',
        year: 1985,
        palette: IronDojoPalette,
        tagline: 'BEAT THE STICK MASTER - TAKE THE STAIRS',
        controls: ['A PUNCH   B KICK   STICK DUCK / JUMP', 'WIGGLE THE STICK TO BREAK A HOLD'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [9000, 7500, 6000, 4500, 3000],
        titleArt: IronDojoSprites.TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.mul('approach', 1.0, 0.9, "attackers' walk / roll speed, eased 10% per loss").clamp(0.4, 1),
            Knob.add('bossTelegraph', 0.56, 0.04, 'boss wind-up seconds, +1 beat per loss').clamp(0.2, 1.2),
            Knob.fixed('bossLands', 1, "1 = the boss's stick can land").setOnMercy(0),
            Knob.fixed('bossHP', 8, 'blows to drop the boss'),
            Knob.fixed('bossDamage', 3, 'energy units a stick hit costs'),
            Knob.fixed('grabberSpeed', 50, 'px/s'),
            Knob.fixed('throwerSpeed', 40, 'px/s'),
            Knob.fixed('dwarfSpeed', 80, 'px/s'),
            Knob.fixed('knifeSpeed', 120, 'px/s'),
            Knob.fixed('throwGap', 1.9, "seconds between a thrower's knives"),
            Knob.fixed('spawnGap', 0.8, 'mean seconds between arrivals').setOnMercy(1.7),
            Knob.fixed('maxFoes', 6, 'attackers on the floor at once'),
            Knob.fixed('pairChance', 0.5, 'chance a grabber brings a partner from the other side'),
            Knob.fixed('grabDrain', 0.5, 'seconds per energy unit, per grabber holding'),
            Knob.fixed('shakeWiggles', 6, 'stick presses to shake one grabber off (+2 per extra)'),
            Knob.fixed('floorLength', 1400, 'px from the door to the stairs'),
            Knob.fixed('floorTime', 60, 'floor timer, seconds per life'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'getready');
    s.phaseNames.set(CabinetState.Playing, 'fight');
    s.phaseNames.set(CabinetState.Interlude, 'down');
    return s;
}

export const IronDojoSpec = buildSpec();
