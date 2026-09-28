// THE NODE · world 1 · THE DEEP KEEP on the Cabinet Engine · the palette and the SPEC (data only).
// An original late-'80s top-down dungeon crawler for one player: a warrior who throws axes goes down
// five levels of a stone keep while hordes pour out of generators. Health drains while you live; food
// puts it back; keys open doors; the stairs take you deeper. (Genre homage only: every name, sprite and
// line here is our own.)
//
// A ROUND = reach the stairs of level 5. Lost = health runs out. MERCY: the knobs below ease per round
// lost on this cabinet; credit 5 cannot be lost (no drain, half damage, health never under 50, a wisp
// lights the way, and a hands-off stick walks you along it).
import { CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { DeepKeepPalette } from './palette.js';
import { TitleArt } from './sprites.js';

export { DeepKeepPalette };

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'deepkeep',
        name: 'THE DEEP KEEP',
        publisher: 'RUNESTONE AMUSEMENTS',
        year: 1986,
        palette: DeepKeepPalette,
        tagline: 'FIVE LEVELS DOWN. EAT OR FADE.',
        controls: ['STICK WALK   HOLD A AXES   B POTION', 'FOOD = HEALTH    KEYS OPEN DOORS'],
        roundWonText: 'YOU ESCAPED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [14000, 11000, 8500, 6000, 3500],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.fixed('levels', 5, 'levels a round'),
            Knob.fixed('heroSpeed', 74, 'hero pixels per second (a tile is 16)'),
            Knob.fixed('maxMonsters', 90, 'live monsters at most (generators wait when full)'),
            Knob.fixed('brood', 4, 'monsters round each generator when a level opens'),
            Knob.fixed('foodValue', 100, 'health a plate or a jug gives'),
            // THE MERCY TUNE: per lost round you start stronger, starve slower, get hit softer, and the
            // generators slow down. Credit 5 (unlosable): no drain at all (the round honours it).
            Knob.add('health', 700, 30, 'starting health').clamp(300, 1100),
            Knob.mul('drain', 4.2, 0.95, 'health lost per second just by living').clamp(0.5, 5).setOnMercy(0),
            Knob.mul('damage', 0.7, 0.955, 'x every monster hit (the book: ghost 56, brute 22, imp fire 35, warlock 28)').clamp(0.3, 2),
            Knob.mul('spawnEvery', 2.3, 1.03, 'seconds between one generator\'s monsters').clamp(1, 6),
            Knob.add('potions', 1, 0.25, 'potions in hand at the start (whole ones)').clamp(0, 3),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'card');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'stairs');
    return s;
}

export const DeepKeepSpec = buildSpec();
