// THE NODE · world 1 · SHORT ORDER (Northgate Novelty Co., 1982) · the SPEC (data only).
// Built out 2026-10-18 from the Unity port: one shift of five kitchens (map.js), the last one RUSH ORDER.
// The palette and title art live in art.js. Split from cartridge.js so the renderer and the round can read
// it without an import cycle.
//
// Knobs (tune with the Lab's --knob name=value). Credit N = N-1 earlier losses; each loss eases:
//   chaserSpeed  x0.96 per loss   the chasers' pace against the chef's (each kitchen has its own pace on top)
//   peppers      +1 per loss      shakes in the shaker at the start of the shift
//   lives        +0.34 per loss   chefs (a fourth chef from the third credit)
//   bossHp       x0.85 per loss   knocks the rival takes
//   ticket       x1.08 per loss   seconds on RUSH ORDER's ticket
// The unlosable fifth credit is the sim's own rule (ShortOrderSim._mercyFreeze): a chaser that sees the chef
// freezes, and a touch never costs a chef.
import { CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { ShortOrderPalette, ShortOrderArt } from './art.js';

export { ShortOrderPalette };

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'shortorder',
        name: 'SHORT ORDER',
        publisher: 'NORTHGATE NOVELTY CO.',
        year: 1982,
        palette: ShortOrderPalette,
        tagline: 'FIVE KITCHENS, ONE SHIFT',
        controls: ['STICK  WALK AND CLIMB', 'CROSS THREE TILES TO DROP FOOD', 'A  SHAKE PEPPER', 'DROP PARTS ON CHASERS FOR BONUS'],
        hints: [['STICK', 'WALK + CLIMB'], ['A', 'PEPPER']],
        roundWonText: 'ORDER UP!',
        roundLostText: 'GAME OVER',
        highScoreSeed: [60000, 45000, 32000, 21000, 12000],
        titleArt: ShortOrderArt.titleArt,
        titleArtScale: 2,
        knobs: [
            // THE MERCY TUNE
            Knob.mul('chaserSpeed', 0.70, 0.96, 'chaser pace vs the chef (x each kitchen\'s own pace)').clamp(0.5, 1.3),
            Knob.add('peppers', 5, 1, 'pepper shakes at the start of the shift').clamp(1, 12),
            Knob.add('lives', 3, 0.34, 'chefs per credit (whole ones: a fourth from the third credit)').clamp(3, 5),
            Knob.mul('bossHp', 3, 0.85, 'knocks the rival takes before he is out').clamp(1, 3),
            Knob.mul('ticket', 1.0, 1.08, 'RUSH ORDER ticket length vs 170 s').clamp(1, 1.6),
            // the machine's book
            Knob.fixed('chefSpeed', 50, 'chef px/s along a floor'),
            Knob.fixed('climb', 0.75, 'ladder speed vs floor speed (everyone)'),
            Knob.fixed('chaserSmart', 0.70, 'chance per node a chaser takes the shortest way to the chef'),
            Knob.fixed('stagePeppers', 2, 'shakes handed out at the start of each kitchen (up to 9)'),
            Knob.fixed('stunSeconds', 3, 'pepper stun'),
            Knob.fixed('stunTiles', 2, 'pepper reach in tiles'),
            Knob.fixed('respawn', 4, 's before a squashed chaser walks back in'),
            Knob.fixed('beltSpeed', 16, 'px/s a belt adds or takes'),
            Knob.fixed('lateMul', 1.25, 'chaser speed once the ticket is late'),
            Knob.fixed('extraAt', 18000, 'the first extra chef'),
            Knob.fixed('extraEvery', 30000, 'then one more every this many points'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'cook');
    s.phaseNames.set(CabinetState.Interlude, 'break');
    return s;
}

export const ShortOrderSpec = buildSpec();
