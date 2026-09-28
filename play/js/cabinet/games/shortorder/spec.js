// THE NODE · world 1 · SHORT ORDER (Northgate Novelty Co., 1982) · the SPEC (data only).
// Port of ShortOrderCartridge.cs (Staging/Batch2/shortorder); the palette and title art live in art.js.
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// Knobs (tune with the Lab's --knob name=value). Only two ease per lost round, as the brief says:
//   chaserSpeed  x0.9 per loss   the chasers' pace against the chef's
//   peppers      +1 per loss     shakes in the shaker at the start of the round
// The unlosable fifth credit is the sim's own rule (ShortOrderSim._mercyFreeze): a chaser that
// sees the chef freezes, and a touch never costs a chef.
// C# bench (worst case, 200 rounds): 34.5 / 56.5 / 62.5 / 83 / 100 %, rounds 73-86 s.
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
        tagline: 'FOUR BURGERS TO GO',
        controls: ['STICK  WALK AND CLIMB', 'WALK OVER A PART TO DROP IT', 'A  SHAKE PEPPER'],
        roundWonText: 'ORDER UP!',
        roundLostText: 'GAME OVER',
        highScoreSeed: [9500, 8000, 6500, 5000, 3500],
        titleArt: ShortOrderArt.titleArt,
        titleArtScale: 2,
        knobs: [
            Knob.fixed('chefSpeed', 50, 'chef px/s along a floor'),
            Knob.fixed('climb', 0.75, 'ladder speed vs floor speed (everyone)'),
            Knob.mul('chaserSpeed', 0.80, 0.9, 'chaser pace vs the chef').clamp(0.2, 2),
            Knob.fixed('chasers', 5, 'chasers in the kitchen'),
            Knob.fixed('chaserSmart', 0.70, 'chance per node a chaser takes the shortest way to the chef'),
            Knob.add('peppers', 5, 1, 'pepper shakes per credit'),
            Knob.fixed('stunSeconds', 3, 'pepper stun'),
            Knob.fixed('stunTiles', 2, 'pepper reach in tiles'),
            Knob.fixed('spawnGap', 2.5, 's between chasers walking in'),
            Knob.fixed('respawn', 4, 's before a squashed chaser walks back in'),
            Knob.fixed('lives', 3, 'chefs per credit'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'cook');
    s.phaseNames.set(CabinetState.Interlude, 'caught');
    return s;
}

export const ShortOrderSpec = buildSpec();
