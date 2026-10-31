// THE NODE · world 1 · STACK ATTACK (Quicksilver Games, 1988) on the Cabinet Engine · the palette and
// the SPEC (data only). Began as a port of StackAttackCartridge.cs (Staging/Batch2/stackattack); built out
// on 2026-10-18 into the six-stage climb (stages.js). Split from cartridge.js so the renderer and the sim
// can read it without an import cycle.
//
// Palette: a navy well, four piece families in one cool neon range (cyan and magenta, plus violet and
// azure between them), each with a light bevel and a dark edge; the row flash is white; the topped-out
// stack turns to navy stone. The build-out adds the stage's things: steel JUNK (the flood and the dig),
// riveted IRON (the squeeze walls), GOLD (the dig), the BOMB (a dark shell, a hot fuse), a warning red,
// and one well tint per stage (the stage you are on reads at a glance).
// Knobs (tune with --knob name=value; credit N = N-1 earlier losses on this cabinet):
//   fallRate     rows/s on stage 1 (each stage steps it up, stages.js): x0.93 per lost round; a walk on credit 5
//   ceilingRows  +1 row of ceiling per loss, up to 2 (lifts the top-out line into the spawn rows)
//   floodPace    x the seconds between rising rows (stages 2 and 6): x1.12 per lost round; slow on credit 5
//   stacks       stacks (lives) a coin buys: 3
//   softDrop     rows/s with the stick held down; lockDelay: seconds a piece rests before it locks
//   extraAt      the score of the first EXTRA STACK (then every extraEvery more)
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const FallRateBase = 3.0;

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
    // ---- the build-out (2026-10-18): the stages' things
    ['junk', 0x3E6878],        // 22: the flood's rows and the dig: steel
    ['junkHi', 0x8CBCC8],
    ['junkLo', 0x1C3440],
    ['iron', 0x2A3458],        // 25: the squeeze walls: riveted iron
    ['ironHi', 0x5A6890],
    ['ironLo', 0x121830],
    ['gold', 0xF0B020],        // 28: the dig's gold
    ['goldHi', 0xFFF0A0],
    ['goldLo', 0x8A5A08],
    ['bomb', 0x241238],        // 31: the bomb's shell (its fuse burns goldHi / red)
    ['red', 0xFF3C5A],         // 32: warnings: the flood, the danger line, the last stack
    ['redLo', 0x6E1028],
    ['well2', 0x082A44],       // 34: the well's tint per stage (1 is 'well')
    ['well3', 0x1A0C42],
    ['well4', 0x1E1830],
    ['well5', 0x101C34],
    ['well6', 0x240A36],
).roles('bg', 'hud', 'magenta', 'cyan', 'magentaLo');

// each letter becomes a 4x4 bevelled block: c cyan, m magenta, v violet, a azure, w the white flash,
// g gold, j junk, b a bomb
const BlockTint = {
    c: [5, 6, 7], m: [8, 9, 10], v: [11, 12, 13], a: [14, 15, 16], w: [17, 17, 6],
    g: [28, 29, 30], j: [22, 23, 24], b: [31, 12, 13],
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

// the title card's picture: a T coming down into the notch while the row under it flashes white; a bomb
// waits in the stack beside a gold block
const TitleArt = blockArt(
    '.......mmm......',
    '........m.......',
    'cc.aa..........v',
    'ccvaaagv.mmcbavv',
    'wwwwwwwwwwwwwwww');

// the six stages' names are in stages.js; the attract card says the shape of the game
function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'stackattack',
        name: 'STACK ATTACK',
        publisher: 'QUICKSILVER GAMES',
        year: 1988,
        palette: StackAttackPalette,
        tagline: 'SIX STAGES TO THE TOP OF THE TOWER',
        controls: ['STICK SLIDE    UP DROP    DOWN FAST', 'A TURN RIGHT       B TURN LEFT', 'TOP OUT AND YOU LOSE ONE STACK'],
        hints: [['LR', 'SLIDE'], ['UP', 'DROP'], ['DOWN', 'FAST'], ['A', 'TURN'], ['B', 'TURN BACK']],
        roundWonText: 'TOWER TOPPED',
        roundLostText: 'GAME OVER',
        highScoreSeed: [100000, 70000, 45000, 25000, 12000],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.mul('fallRate', FallRateBase, 0.93, 'rows/s on stage 1 (x the stage step)').setOnMercy(0.6),
            Knob.add('ceilingRows', 0, 1, 'rows of ceiling above the rim').clamp(0, 2),
            Knob.mul('floodPace', 1.0, 1.12, 'x the seconds between rising rows').clamp(1, 2).setOnMercy(1.8),
            Knob.fixed('stacks', 3, 'stacks (lives) a coin buys'),
            Knob.fixed('softDrop', 20, 'rows/s with the stick held down'),
            Knob.fixed('lockDelay', 0.5, 'seconds a landed piece rests before it locks'),
            Knob.fixed('extraAt', 20000, 'score of the first extra stack'),
            Knob.fixed('extraEvery', 40000, 'score between the extra stacks after it'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'card');
    s.phaseNames.set(CabinetState.Playing, 'play');
    s.phaseNames.set(CabinetState.Interlude, 'tally');
    return s;
}

export const StackAttackSpec = buildSpec();
