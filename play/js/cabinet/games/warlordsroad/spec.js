// THE NODE · world 1 · WARLORD'S ROAD on the Cabinet Engine · the SPEC (data only).
// An original late-'80s fantasy brawler: one barbarian, one road, three stages, a Warlord at the end of it.
//
// A ROUND = the road: THE BURNED VILLAGE, THE BLACKWOOD ROAD, THE CLIFF CASTLE, a camp between them.
// Win = the Warlord falls. Lose = every life gone. MERCY: the knobs below ease per round already lost on
// this cabinet; credit 5 (credit.unlosable) = the old gods watch over the hero (no blow can hurt him).
import { CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { WarlordsPalette } from './palette.js';
import { TitleArt } from './art.js';

export { WarlordsPalette };

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'warlordsroad',
        name: "WARLORD'S ROAD",
        publisher: 'IRONWOOD',
        year: 1989,
        palette: WarlordsPalette,
        tagline: 'ONE BLADE. ONE ROAD. ONE WARLORD.',
        controls: ['SPACE CUT  X JUMP  BOTH MAGIC', 'TAP TWICE RUN  WALK IN TO THROW'],
        roundWonText: 'THE WARLORD FALLS',
        roundLostText: 'GAME OVER',
        highScoreSeed: [30000, 25000, 20000, 15000, 10000],
        titleArt: TitleArt,
        titleArtScale: 1,
        knobs: [
            Knob.fixed('lives', 3, 'lives per round'),
            Knob.add('heroHp', 24, 0.75, 'health (8 blocks in the HUD)').clamp(24, 36),
            Knob.fixed('attackers', 2, 'foes that may close in and swing at once'),
            // THE MERCY TUNE: per lost round the blows soften, come slower, foes and bosses tire sooner, more pots
            Knob.mul('enemyDamage', 1.66, 0.965, 'x on every blow that lands on the hero').clamp(0.3, 2).setOnMercy(0),
            Knob.add('attackGap', 0.7, 0.05, 'seconds a foe rests between blows').clamp(0.4, 3),
            Knob.fixed('enemyHp', 1, 'x on foot-soldier health (fixed: a raider is one full combo and a cut)'),
            Knob.mul('bossHp', 1.0, 0.95, 'x on boss health').clamp(0.4, 2).capOnMercy(0.75),
            Knob.add('startPots', 1, 0.25, 'magic pots at the start').clamp(0, 4),
            Knob.fixed('heroPower', 1, 'x on the hero\'s damage').setOnMercy(1.5),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'map');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'camp');
    return s;
}

export const WarlordsSpec = buildSpec();
