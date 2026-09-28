// THE NODE · world 1 · STACK ATTACK (Quicksilver Games, 1988) on the Cabinet Engine · the palette and
// the SPEC (data only). Port of StackAttackCartridge.cs from Staging/Batch2/stackattack.
// Split from cartridge.js so the renderer and the sim can read it without an import cycle.
//
// Palette: a navy well, four piece families in one cool neon range (cyan and magenta, plus violet and
// azure between them), each with a light bevel and a dark edge; the row flash is white; the topped-out
// stack turns to navy stone. Knobs (tune with --knob name=value):
//   fallRate     rows/s at level 1: x0.9 per lost round; a walk (0.6) on the fifth credit
//   ceilingRows  +2 rows of ceiling from the first loss (lifts the top-out line into the spawn rows)
//   levelRamp    fall rate x this every 10 rows (the level)
//   softDrop     rows/s with the stick held down; lockDelay: seconds a piece rests before it locks
//   linesToWin   the round: 10 rows
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const FallRateBase = 4.0;

export const StackAttackPalette = new Palette(
    ['bg', 0x05061A],
    ['well', 0x0A1440],
    ['wellGrid', 0x1C2C6C],
    ['frame', 0x2E3F8C],
    ['frameHi', 0x7A8EE6],
    ['cyan', 0x20D2F0],
    ['cyanHi', 0xB8F6FF],
    ['cyanLo', 0x0B6A8A],
    ['magenta', 0xE02CC8],
    ['magentaHi', 0xFFB4F0],
    ['magentaLo', 0x741068],
    ['violet', 0x8C50F0],
    ['violetHi', 0xD4BCFF],
    ['violetLo', 0x3E1E88],
    ['azure', 0x3A78F0],
    ['azureHi', 0xB4CCFF],
    ['azureLo', 0x18307E],
    ['white', 0xFFFFFF],
    ['hud', 0xCCD8FF],
    ['stone', 0x3C4470],
    ['stoneHi', 0x6A73A0],
    ['stoneLo', 0x20264A],
).roles('bg', 'hud', 'magenta', 'cyan', 'magentaLo');

// each letter becomes a 4x4 bevelled block: c cyan, m magenta, v violet, a azure, w the white flash
const BlockTint = {
    c: [5, 6, 7], m: [8, 9, 10], v: [11, 12, 13], a: [14, 15, 16], w: [17, 17, 6],
};

function blockArt(...rows) {
    const B = 4;
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    const s = new PixelSprite(w * B, rows.length * B);
    for (let j = 0; j < rows.length; j++)
        for (let i = 0; i < rows[j].length; i++) {
            const m = BlockTint[rows[j][i]];
            if (!m) continue;
            const [bas, hi, lo] = m;
            for (let y = 0; y < B; y++)
                for (let x = 0; x < B; x++) {
                    const v = (x === B - 1 || y === B - 1) ? lo : (x === 0 || y === 0) ? hi : bas;
                    s.set(i * B + x, j * B + y, v);
                }
        }
    return s;
}

// the title card's picture: a T coming down into the notch while the row under it flashes white
const TitleArt = blockArt(
    '.......mmm......',
    '........m.......',
    'cc.aa..........v',
    'ccvaaavv.mmccavv',
    'wwwwwwwwwwwwwwww');

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'stackattack',
        name: 'STACK ATTACK',
        publisher: 'QUICKSILVER GAMES',
        year: 1988,
        palette: StackAttackPalette,
        tagline: 'CLEAR 10 LINES TO WIN',
        controls: ['STICK  SLIDE     DOWN  DROP', 'A  TURN RIGHT   B  TURN LEFT', 'FILL THE WELL AND YOU LOSE'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [2600, 2200, 1900, 1600, 1200],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.mul('fallRate', FallRateBase, 0.9, 'rows/s at level 1').setOnMercy(0.6),
            Knob.add('ceilingRows', 0, 2, 'rows of ceiling above the rim').clamp(0, 2),
            Knob.fixed('levelRamp', 1.3, 'fall rate x this every 10 rows'),
            Knob.fixed('softDrop', 20, 'rows/s with the stick held down'),
            Knob.fixed('lockDelay', 0.5, 'seconds a landed piece rests before it locks'),
            Knob.fixed('linesToWin', 10, 'rows to clear for the round'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'topout');
    return s;
}

export const StackAttackSpec = buildSpec();
