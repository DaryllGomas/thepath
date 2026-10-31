// THE NODE · world 1 · TUNNEL RAT (Quicksilver Games, 1982) on the Cabinet Engine · the palette and
// the SPEC (data only). Built out from the Batch2 port (TunnelRatCartridge.cs) into the eight-depth game.
// Split from cartridge.js so the renderer and the sim can read it without an import cycle.
//
// Palette: black tunnels, a tan sky (a dusk and a night one for the deeper depths), pest orange, hose
// white, digger blue, lizard green, fire yellow, rock grey, driller and queen purple, scorcher red, shade
// cyan (each with a darker partner where a sprite needs shading: the sprites' indices stay under 36), then
// four earth strata for each of the eight depths (the strata only ever fill, so they sit at the end).
// Knobs: speeds in px/s on the 16 px lattice. The mercy knobs: pestSpeed (x0.88 per loss), ghostRate,
// chase, pumpStep, crowd (fewer bugs and lizards), fireWindup (a longer glow), crackedRock (a pre-cracked
// rock over a pocket from the first loss on), and the queen's pumps, speed and eggs. On the unlosable
// credit the pests barely move or ghost, the queen is slow and nearly done, and the digger cannot die.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TunnelRatPalette = new Palette(
    ['bg', 0x000000],        // 0  tunnels, the margin
    ['sky', 0xE8C890],       // 1  sky tan (also the digger's face)
    ['dirt1', 0xD49A48],     // 2  TOPSOIL stratum 1
    ['dirt2', 0xB06C2A],     // 3  stratum 2
    ['dirt3', 0x864616],     // 4  stratum 3
    ['dirt4', 0x5A2A0E],     // 5  stratum 4
    ['orange', 0xFF7020],    // 6  pest orange
    ['orangeDk', 0xA8380C],  // 7
    ['white', 0xFFFFFF],     // 8  hose, goggles
    ['green', 0x4CD050],     // 9  fire-lizard
    ['greenDk', 0x1C7428],   // a
    ['blue', 0x3C7CFF],      // b  digger
    ['blueDk', 0x1C3A9C],    // c
    ['yellow', 0xFFE040],    // d  fire core, hard hat, highlights
    ['grey', 0xA8A8B4],      // e  rock
    ['greyDk', 0x5C5C6C],    // f
    ['purple', 0xB45AE6],    // g  driller, the queen
    ['purpleDk', 0x5E2A8A],  // h
    ['red', 0xF0402A],       // i  scorcher, embers
    ['redDk', 0x8C1A12],     // j
    ['cyan', 0x74E6DE],      // k  shade
    ['cyanDk', 0x26848C],    // l
    ['dusk', 0xE09A6C],      // m  the sky at dusk (depths 4-6)
    ['night', 0x1A2044],     // n  the sky at night (depths 7-8)
    ['clay1', 0xD4805A], ['clay2', 0xB25A3E], ['clay3', 0x883A2A], ['clay4', 0x5C2218],          // RED CLAY
    ['grav1', 0xC8B27E], ['grav2', 0x9E8A5C], ['grav3', 0x76663E], ['grav4', 0x4C4228],          // GRAVEL BED
    ['loam1', 0xA2A256], ['loam2', 0x7A7C3A], ['loam3', 0x56592A], ['loam4', 0x363C1A],          // ROOT MAZE
    ['slate1', 0x98A4B6], ['slate2', 0x76849C], ['slate3', 0x56627C], ['slate4', 0x3A445A],      // SLATE
    ['coal1', 0x80726A], ['coal2', 0x64524A], ['coal3', 0x4A3A32], ['coal4', 0x322620],          // COAL SEAM
    ['deep1', 0x9272A6], ['deep2', 0x725486], ['deep3', 0x543C68], ['deep4', 0x3A284C],          // THE WARRENS
    ['magma1', 0xAA5636], ['magma2', 0x863A20], ['magma3', 0x622614], ['magma4', 0x42160C],      // THE QUEEN'S NEST
).roles('bg', 'white', 'orange', 'yellow', 'dirt3');

// a small stand-in digger sprite (top half only) so the title art needs no import from renderer.js
const TitleDigTop = PixelSprite.fromRows(
    '....dddddd......',
    '..ddddddddd.....',
    '.dddddddddd888..',
    '.dddddddddd888..',
    '.cccccccccccccc.',
    '..c1111111111...',
    '..c1111111001...',
    '..c11111110011..',
    '...111111111....',
    '..bbbbbbbbbb....',
    '.bbbbbbbbbb11eee',
    '.bbbbbbbbbbb1fef',
    '..bbbbbbbbbb....',
    '...bbbb.bbbb....',
    '...cccc.cccc....',
    '..ccccc.ccccc...');

function stamp(dst, src, ox, oy) {
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const v = src.at(x, y);
            if (v >= 0) dst.set(ox + x, oy + y, v);
        }
}

// the title card's picture: a tunnel through the strata, the digger pumping a crowned goggle-bug (the
// queen) up to bursting, the strata going down through the depths' colours (drawn at scale 2: 192 x 44)
function buildTitleArt() {
    const W = 96, H = 22;
    const a = new PixelSprite(W, H);
    const bands = [2, 3, 3, 3, 4, 4];               // the topsoil's strata, a band of each
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const st = y < 3 ? 2 : y < 19 ? bands[Math.min(5, Math.floor((x * 6) / W))] : 5;
            const speck = ((x * 7 + y * 13) % 11) === 0;
            a.set(x, y, speck ? Math.min(5, st + 1) : st);
        }
    for (let y = 3; y < 19; y++) for (let x = 2; x < 94; x++) a.set(x, y, 0);
    stamp(a, TitleDigTop, 6, 3);
    for (let x = 22; x < 58; x++) { a.set(x, 10, 8); a.set(x, 11, 8); }
    // the inflated queen: a 20 px ball with goggles and a crown
    const cx = 70, cy = 11, R = 10;
    for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++) {
            const d2 = x * x + y * y;
            if (d2 > R * R) continue;
            if (cy + y < 3) continue;
            a.set(cx + x, cy + y, d2 > (R - 2) * (R - 2) ? 17 : 16);
        }
    for (let x = cx - 8; x <= cx + 8; x++) a.set(x, cy - 2, 17);
    for (const gx of [cx - 4, cx + 4])
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) a.set(gx + x, cy - 2 + y, 8);
    a.set(cx - 3, cy - 2, 0); a.set(cx + 5, cy - 2, 0);
    a.set(cx - 7, cy + 3, 8); a.set(cx - 6, cy + 3, 8);
    // the crown, poking up out of the tunnel's roof
    for (let x = cx - 4; x <= cx + 4; x++) { a.set(x, 3, 13); a.set(x, 2, 13); }
    a.set(cx - 4, 1, 13); a.set(cx, 1, 13); a.set(cx + 4, 1, 13); a.set(cx, 0, 13);
    // strain marks
    a.set(cx + 12, cy, 8); a.set(cx + 13, cy - 1, 8); a.set(cx - 12, cy, 8); a.set(cx - 13, cy - 1, 8);
    return a;
}

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'tunnelrat',
        name: 'TUNNEL RAT',
        publisher: 'QUICKSILVER GAMES',
        year: 1982,
        palette: TunnelRatPalette,
        tagline: 'DIG EIGHT DEPTHS DOWN. POP THE QUEEN.',
        controls: ['STICK  DIG      HOLD A  PUMP', 'DROP ROCKS. EXTRA RAT AT 10000'],
        hints: [['STICK', 'DIG'], ['A', 'PUMP (HOLD)']],
        roundWonText: 'ALL CLEAR!',
        roundLostText: 'GAME OVER',
        highScoreSeed: [60000, 45000, 32000, 21000, 12000],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.fixed('walkSpeed', 40, 'digger px/s in open tunnel'),
            Knob.fixed('digSpeed', 30, 'digger px/s through earth'),
            Knob.mul('pestSpeed', 0.8, 0.88, 'pest speed: walk, bore, drift and ghost').clamp(0.2, 2.0).capOnMercy(0.35),
            Knob.fixed('bugSpeed', 33, 'goggle-bug px/s (a driller in open tunnel too)'),
            Knob.fixed('lizardSpeed', 36, 'fire-lizard and scorcher px/s'),
            Knob.fixed('drillSpeed', 15, 'driller px/s boring through earth'),
            Knob.fixed('shadeSpeed', 14, 'shade px/s drifting through anything'),
            Knob.fixed('ghostSpeed', 20, 'ghost drift px/s through earth'),
            Knob.mul('ghostRate', 0.08, 0.6, 'chance per second a far pest starts to ghost (x the depth\'s ghost)').setOnMercy(0.01),
            Knob.fixed('ghostFar', 80, 'px (Manhattan) from the digger before a pest may ghost'),
            Knob.fixed('maxGhosts', 2, 'ghosts at once'),
            Knob.add('chase', 0.45, -0.1, 'chance a pest turns toward the digger at a junction').clamp(0.1, 1),
            Knob.fixed('fireAim', 0.8, 'breaths per second when the digger is in its row'),
            Knob.fixed('fireIdle', 0.08, 'breaths per second otherwise'),
            Knob.add('fireWindup', 0.6, 0.08, 'seconds a lizard glows before the fire (a scorcher +0.35)').clamp(0.6, 1.0),
            Knob.mul('pumpStep', 0.3, 0.82, 'seconds per pump stroke (4 strokes pop a pest)'),
            Knob.mul('crowd', 1.0, 0.85, 'x the bugs and lizards in each depth (rounded, at least 1)').clamp(0.4, 1.5),
            Knob.add('crackedRock', 0, 1, 'one rock starts pre-cracked over a pest pocket').clamp(0, 1),
            Knob.add('queenPumps', 14, -2, 'pump strokes that pop the queen').clamp(6, 20).setOnMercy(6),
            Knob.mul('queenSpeed', 13, 0.9, 'queen px/s boring through earth').capOnMercy(6),
            Knob.mul('eggEvery', 8, 1.15, 'seconds between the queen\'s eggs').clamp(4, 30).setOnMercy(30),
            Knob.fixed('hurryAt', 75, 'seconds into a depth before the pests hurry'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'dig');
    s.phaseNames.set(CabinetState.Interlude, 'beat');
    return s;
}

export const TunnelRatSpec = buildSpec();
