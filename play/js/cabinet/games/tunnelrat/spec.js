// THE NODE · world 1 · TUNNEL RAT (Quicksilver Games, 1982) on the Cabinet Engine · the palette and
// the SPEC (data only). Port of TunnelRatCartridge.cs from Staging/Batch2/tunnelrat.
// Split from cartridge.js so the renderer and the sim can read it without an import cycle.
//
// Palette: black tunnels, a tan sky, four brown earth strata, pest orange, hose white, digger blue,
// lizard green, fire yellow, rock grey (16 colours, each with a darker partner where a sprite needs
// shading). Knobs: speeds in px/s on the 16 px lattice; the mercy knobs are pestSpeed (x0.9 per loss,
// "pest burrow speed") and crackedRock (one pre-cracked rock over a pest pocket from the first loss
// on); on the unlosable credit the pests barely move or ghost.
import { Palette, PixelSprite, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TunnelRatPalette = new Palette(
    ['bg', 0x000000],        // 0  tunnels, the margin
    ['sky', 0xE8C890],       // 1  sky tan (also the digger's face)
    ['dirt1', 0xD49A48],     // 2  stratum 1
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

// the title card's picture: a tunnel through the strata, the digger pumping a goggle-bug up to
// bursting, a rock over the tunnel (drawn at scale 2: 192 x 44)
function buildTitleArt() {
    const W = 96, H = 22;
    const a = new PixelSprite(W, H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const st = y < 3 ? 2 : y < 19 ? 3 : 4;
            const speck = ((x * 7 + y * 13) % 11) === 0;
            a.set(x, y, speck ? st + 1 : st);
        }
    for (let y = 3; y < 19; y++) for (let x = 2; x < 94; x++) a.set(x, y, 0);
    stamp(a, TitleDigTop, 6, 3);
    for (let x = 22; x < 58; x++) { a.set(x, 10, 8); a.set(x, 11, 8); }
    // the inflated bug: a 20 px ball with goggles
    const cx = 70, cy = 11, R = 10;
    for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++) {
            const d2 = x * x + y * y;
            if (d2 > R * R) continue;
            a.set(cx + x, cy + y, d2 > (R - 2) * (R - 2) ? 7 : 6);
        }
    for (let x = cx - 8; x <= cx + 8; x++) a.set(x, cy - 3, 7);
    for (const gx of [cx - 4, cx + 4])
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) a.set(gx + x, cy - 3 + y, 8);
    a.set(cx - 3, cy - 3, 0); a.set(cx + 5, cy - 3, 0);
    a.set(cx - 7, cy - 6, 8); a.set(cx - 6, cy - 6, 8);
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
        tagline: 'DIG IN. PUMP THEM UP. DROP THE ROCKS.',
        controls: ['STICK  DIG      HOLD A  PUMP', 'CLEAR BOTH SCREENS OF PESTS'],
        roundWonText: 'ROUND WON',
        roundLostText: 'GAME OVER',
        highScoreSeed: [12000, 9500, 7500, 5500, 4000],
        titleArt: buildTitleArt(),
        titleArtScale: 2,
        knobs: [
            Knob.fixed('walkSpeed', 40, 'digger px/s in open tunnel'),
            Knob.fixed('digSpeed', 30, 'digger px/s through earth'),
            Knob.mul('pestSpeed', 1.0, 0.9, 'pest burrow speed: walk + ghost').clamp(0.2, 2.0).capOnMercy(0.35),
            Knob.fixed('bugSpeed', 33, 'goggle-bug px/s'),
            Knob.fixed('lizardSpeed', 36, 'fire-lizard px/s'),
            Knob.fixed('ghostSpeed', 20, 'ghost drift px/s through earth'),
            Knob.mul('ghostRate', 0.12, 0.6, 'chance per second a far pest starts to ghost').setOnMercy(0.01),
            Knob.fixed('ghostFar', 80, 'px (Manhattan) from the digger before a pest may ghost'),
            Knob.fixed('ghostBonus', 1.6, 'screen 2 ghosting bonus (x ghostRate)'),
            Knob.fixed('maxGhosts', 2, 'ghosts at once'),
            Knob.add('chase', 0.6, -0.15, 'chance a pest turns toward the digger at a junction').clamp(0.1, 1),
            Knob.fixed('fireAim', 0.8, 'breaths per second when the digger is in its row'),
            Knob.fixed('fireIdle', 0.08, 'breaths per second otherwise'),
            Knob.fixed('fireWindup', 0.6, 'seconds a lizard glows before the fire comes'),
            Knob.mul('pumpStep', 0.3, 0.82, 'seconds per pump stage (4 stages pop)'),
            Knob.add('pests1', 6, -0.34, 'pests on screen 1 (rounded)').clamp(3, 12),
            Knob.add('pests2', 8, -0.6, 'pests on screen 2 (rounded; always more than screen 1)').clamp(4, 14),
            Knob.fixed('lizards1', 1, 'of which fire-lizards, screen 1'),
            Knob.fixed('lizards2', 2, 'of which fire-lizards, screen 2'),
            Knob.fixed('rocks', 4, 'rocks per screen (plus the cracked one)'),
            Knob.add('crackedRock', 0, 1, 'one rock starts pre-cracked over a pest pocket').clamp(0, 1),
        ],
    });
    s.phaseNames.set(CabinetState.Intro, 'ready');
    s.phaseNames.set(CabinetState.Playing, 'dig');
    s.phaseNames.set(CabinetState.Interlude, 'beat');
    return s;
}

export const TunnelRatSpec = buildSpec();
