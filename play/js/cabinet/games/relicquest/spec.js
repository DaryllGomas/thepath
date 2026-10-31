// THE NODE · world 1 · RELIC QUEST on the Cabinet Engine · the palette and the SPEC (data only).
// Six temples, three knights, one relic quest. The cabinet keeps its gold and green stone,
// silver helmet and bright snakes; the quest replaces the retired Unity single-round rules.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';
import { TitleArt } from './sprites.js';

// the order is the sprite letters in sprites.js: '0'-'9' then 'a'-'m'
export const RelicQuestPalette = new Palette(
    ['bg', 0x000000],
    ['gold', 0xD4A028],
    ['goldHi', 0xFAD05A],
    ['goldLo', 0x8C6014],
    ['green', 0x5C8032],
    ['greenHi', 0x84AA4E],
    ['greenLo', 0x344E1C],
    ['red', 0xE1141E],
    ['redHi', 0xFF7878],
    ['redLo', 0x78000A],
    ['snake', 0x3CD23C],
    ['snakeHi', 0xA0FF8C],
    ['snakeLo', 0x0F6E1E],
    ['white', 0xFFFFFF],
    ['hud', 0xFAE146],
    ['steel', 0xC4C8D4],
    ['steelLo', 0x6E7282],
    ['skin', 0xE8AC78],
    ['tunic', 0x965426],
    ['brown', 0x5C3418],
    ['dark', 0x1E1E2C],
    ['orange', 0xFF8C1E],
    ['cream', 0xF4E4B4],
).roles('bg', 'hud', 'gold', 'cream', 'greenLo');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'relicquest',
        name: 'RELIC QUEST',
        publisher: 'CASTLE COIN',
        year: 1982,
        palette: RelicQuestPalette,
        tagline: 'SIX TEMPLES. ONE KNIGHTLY QUEST.',
        controls: ['ARROWS OR WASD  WALK', 'SPACE  SWORD    X  TORCH', 'EVERY GEM RAISES THE RELIC'],
        roundWonText: 'QUEST WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [65000, 40000, 22000, 12000, 6000],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.fixed('lives', 3, 'knights per quest'),
            Knob.fixed('knightSpeed', 3.45, 'tiles per second'),
            Knob.fixed('snakes', 4, 'three snakes in the court, four in later temples'),
            Knob.fixed('torches', 1, 'torches a maze'),
            // THE MERCY TUNE: per lost round the snakes slow, hunt less, and stay stone longer
            Knob.mul('snakeSpeed', 2.4, 0.935, 'snake tiles per second').clamp(1.2, 9),
            Knob.add('snakeChase', 0.45, -0.025, 'chance a snake turns toward you at a junction').clamp(0.2, 1),
            Knob.add('stunSeconds', 4.0, 0.65, 'a sword hit turns a snake to stone this long').clamp(1, 8),
            Knob.add('torchSeconds', 5.3, 2.5, 'a torch turns every snake to stone this long (front-loaded)').clamp(1, 6.5),
        ],
    });
    s.hints = [['STICK','WALK'],['A','SWORD'],['B','TORCH']];
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'interlude');     // a bite (BITTEN) or a cleared maze (LEVEL CLEAR)
    return s;
}

export const RelicQuestSpec = buildSpec();
