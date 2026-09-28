// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · the palette and the SPEC (data only).
// Split from cartridge.js so the renderer and the round can read it without an import cycle.
//
// Palette from the accepted cabinet art (Assets/Art/Flynns/cab_nebularun_*): void black, nebula
// purple in three steps, ground teal in three steps, a cream-white hull with cyan trim, target
// red (+ a dark red step) and one ember orange for the heart of an explosion. 13 colours.
// The marquee's publisher is SUNWARD AMUSEMENTS (the C# draft's "WAVECREST INTERACTIVE" was a
// placeholder written before the art was accepted; the art is canon).
//
// Knobs (base -> per loss on this cabinet -> the mercy credit): ported from the C# cartridge
// (Staging/Batch4/nebularun/Games/NebulaRun/NebulaRunCartridge.cs) and re-tuned here, since that
// game was never lab-tested (no bench.txt exists to match). See NOTES.md for the bench that made
// these numbers.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const NebulaRunPalette = new Palette(
    ['void', 0x06040C],        // 0  the tube
    ['nebDeep', 0x1E0E36],     // 1
    ['neb', 0x4A2280],         // 2
    ['nebHi', 0x9A5CE8],       // 3
    ['tealDeep', 0x0B3A33],    // 4
    ['teal', 0x23947C],        // 5
    ['tealHi', 0x74E6C4],      // 6
    ['white', 0xF6F1E2],       // 7  the hull: cream white, as on the marquee
    ['cyan', 0x4ADCFF],        // 8
    ['cyanDim', 0x1B6688],     // 9
    ['red', 0xFF3448],         // 10  target red
    ['redDim', 0x7C1530],      // 11
    ['ember', 0xFFA43C],       // 12  the heart of a blast
).roles('void', 'tealHi', 'nebHi', 'white', 'nebDeep');

// the title card's picture (110 x 22, drawn at x2): the starfighter racing right along a
// purple-and-teal nebula band, a speed trail behind it, stars and a small teal crescent.
// Ported bit for bit from NebulaRunCartridge.BuildTitleArt (the C# never shipped a renderer, but
// this procedural picture was already finished and matches the marquee).
function plus(s, x, y, c) { s.set(x, y, c); s.set(x - 1, y, c); s.set(x + 1, y, c); s.set(x, y - 1, c); s.set(x, y + 1, c); }

function buildTitleArt() {
    const W = 110, H = 22;
    const s = new PixelSprite(W, H);
    // the nebula band: a diagonal ribbon, purple core, teal streaks along its upper edge
    for (let x = 0; x < W; x++) {
        const c = 15.5 - x * 0.1 + 2.2 * Math.sin(x * 0.11);
        for (let y = 0; y < H; y++) {
            const d = y - c, ad = Math.abs(d);
            let v = -1;
            const chk = ((x + y) & 1) === 0;
            if (ad < 1.3) v = ((x * 7 + y * 3) % 5 === 0) ? 3 : 2;
            else if (ad < 2.6) v = chk ? 2 : 1;
            else if (ad < 3.8) v = chk ? 1 : -1;
            if (d < -1.5 && d > -4.2 && ((x + Math.trunc(Math.sin(x * 0.3) * 2)) % 4 !== 0) && (x > 6 && x < 104))
                v = ad < 3.0 ? 5 : (chk ? 4 : v);
            if (v >= 0) s.set(x, y, v);
        }
    }
    // stars
    const sx = [4, 17, 29, 44, 88, 99, 106, 71, 60], sy = [3, 18, 4, 19, 3, 20, 7, 2, 20];
    for (let i = 0; i < sx.length; i++) s.set(sx[i], sy[i], i % 3 === 0 ? 6 : 7);
    plus(s, 12, 5, 7); plus(s, 80, 17, 6); plus(s, 102, 12, 7);
    // the teal crescent
    for (let y = -5; y <= 5; y++)
        for (let x = -5; x <= 5; x++) {
            const r = Math.hypot(x, y), r2 = Math.hypot(x + 2, y + 1);
            if (r <= 4.8 && r2 > 4.2) s.set(93 + x, 14 + y, r > 3.8 ? 6 : 5);
            else if (r <= 4.8) s.set(93 + x, 14 + y, 0);
        }
    // the speed trail
    for (let x = 8; x < 50; x++) {
        const y = 9;
        if (x > 30 || (x % 2 === 0 && x > 18) || x % 4 === 0) s.set(x, y, x > 40 ? 7 : x > 26 ? 8 : 3);
        if (x > 24 && x % 3 === 0) s.set(x, y - 2, 3);
        if (x > 24 && x % 3 === 1) s.set(x, y + 2, 9);
    }
    // the starfighter, nose right (24 x 9)
    const ship = [
        "......777...............",
        ".....7557...............",
        "...77777777777..........",
        ".9777777777733777.......",
        "97777777777777777777777.",
        ".9777777777777777.......",
        "...77777777777..........",
        ".....7557...............",
        "......777...............",
    ];
    for (let y = 0; y < ship.length; y++)
        for (let x = 0; x < ship[y].length; x++) {
            const ch = ship[y][x];
            if (ch === '.') continue;
            s.set(48 + x, 5 + y, ch.charCodeAt(0) - 48);
        }
    s.set(47, 9, 12); s.set(46, 9, 12);
    return s;
}

const TitleArt = buildTitleArt();

function buildSpec() {
    const s = new CabinetGameSpec({
        id: 'nebularun',
        name: 'NEBULA RUN',
        publisher: 'SUNWARD AMUSEMENTS',
        year: 1983,
        palette: NebulaRunPalette,
        tagline: 'BOMB THE FORTRESS AT SECTOR END',
        controls: ['STICK  FLY      A  AIR GUN', 'B  BOMB THE GROUND AT THE SIGHT'],
        roundWonText: 'SECTOR CLEAR',
        roundLostText: 'GAME OVER',
        highScoreSeed: [24000, 19000, 14500, 10000, 6500],
        titleArt: TitleArt,
        titleArtScale: 2,
        knobs: [
            Knob.fixed('scrollSpeed', 24, 'ground scroll, px/s'),
            Knob.fixed('sectorSeconds', 58, 'seconds of scroll from the start to the parked fortress'),
            Knob.mul('airRate', 1.10, 0.93, 'interceptor groups per second').clamp(0.15, 3),
            Knob.mul('bossPass', 1.60, 1.12, 'seconds per radar pass; each live core fires once a pass').clamp(0.7, 14),
            Knob.mul('turretGap', 1.35, 1.10, 'seconds between a turret\'s shots').clamp(1.0, 4.5),
            Knob.mul('shotSpeed', 105, 0.95, 'enemy shot speed, px/s').clamp(65, 128),
            Knob.mul('dartSpeed', 165, 0.96, 'dart dive speed, px/s').clamp(100, 168),
            Knob.mul('airFire', 0.30, 0.86, 'chance a spinner fires as it turns').clamp(0.06, 0.60),
            Knob.mul('discGap', 1.20, 1.08, 'seconds between the disc ship\'s shots').clamp(1.15, 3.6),
            Knob.fixed('startShips', 3, 'ships per round (the mercy credit uses the shield instead)'),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'run');
    s.phaseNames.set(CabinetState.Interlude, 'blast');
    return s;
}

export const NebulaRunSpec = buildSpec();
