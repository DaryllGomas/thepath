// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · the palette-index sprites.
// Started as the sprite tables of SwarmPatrolRenderer.cs; the build-out (2026-10-18) adds the splitter and its mites, the
// iron shell, the stinger, the captured ship, and THE HIVE QUEEN (her body, two wings, the eye). Split out so spec.js (the
// title art), the renderer and js/flashes.js (the drone on the arcade's flash cards) can all read them without an import
// cycle. Most sprites are authored as their LEFT half and mirrored (mirror()); the queen's wings are drawn by a little
// deterministic routine (an ellipse, veins from the root, a ragged edge when broken).
// Palette indices (SwarmPatrolPalette order; 0-7 are the 1981 board's and never move): 0 bg, 1 violet, 2 violetDim,
// 3 pink, 4 pinkDim, 5 white, 6 cyan, 7 cyanDim, 8 gold, 9 goldDim, a steel, b steelDim.
import { PixelSprite } from '../../sdk/index.js';

export const iBg = 0, iViolet = 1, iVioletDim = 2, iPink = 3, iPinkDim = 4, iWhite = 5, iCyan = 6, iCyanDim = 7;
export const iGold = 8, iGoldDim = 9, iSteel = 10, iSteelDim = 11;

function mirror(...leftHalves) {
    const rows = leftHalves.map(row => row + [...row].reverse().join(''));
    return PixelSprite.fromRows(...rows);
}

// a copy with some indices swapped ({ from: to })
function remapWith(s, map) {
    const o = new PixelSprite(s.width, s.height);
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
            const v = s.at(x, y);
            if (v < 0) continue;
            o.set(x, y, map[v] !== undefined ? map[v] : v);
        }
    return o;
}

function flipV(s) {
    const o = new PixelSprite(s.width, s.height);
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) { const v = s.at(x, y); if (v >= 0) o.set(x, s.height - 1 - y, v); }
    return o;
}

// the dented boss: violet body -> pink, pink crown -> white
function remap(s) { return remapWith(s, { [iViolet]: iPink, [iPink]: iWhite }); }

// DRONE 14x12: a wasp. Violet wings over a pink head (white eyes) and a striped, stinging tail.
// Frame 0 wings raised over the head, frame 1 wings swept down along the body.
export const Drone = [
    mirror('1......', '11....3', '111..35', '.111.33', '..11131', '...1133', '....133', '....311', '.....33', '.....13', '......3', '.......'),
    mirror('.......', '......3', '.....35', '..1..33', '.111131', '11.1133', '1...133', '1...311', '.....33', '.....13', '......3', '.......'),
];
// ESCORT 16x12: a moth. Broad pink wings with violet panels, a white body and antennae.
// Frame 0 wings spread to the full 16 px, frame 1 folded up to 12 px.
export const Escort = [
    mirror('3.......', '33....5.', '313....5', '3113..35', '31113.35', '33333335', '.3113335', '..31.335', '..311.35', '...33.35', '.......3', '........'),
    mirror('........', '......5.', '...3...5', '..313.35', '..311335', '..333335', '...31335', '...3.335', '...31.35', '....3.35', '.......3', '........'),
];
// BOSS 16x14: a crowned beetle. Pink three-point crown, violet shell, white eyes, pincers.
// Frame 0 pincers open, frame 1 closed. Dented (one hit taken): body pink, crown white.
export const Boss = [
    mirror('...3...3', '...33.33', '....3333', '..111111', '.1115511', '11115511', '11111111', '11.11333', '1..11133', '1...1111', '3...1.11', '33..1..1', '.3......', '........'),
    mirror('...3...3', '...33.33', '....3333', '..111111', '.1115511', '11115511', '11111111', '.1.11333', '.1.11133', '.1..1111', '.3..1.11', '..3.1..1', '..33....', '........'),
];
export const BossHurt = [remap(Boss[0]), remap(Boss[1])];

// SPLITTER 14x12: a seed pod on violet legs, a white seam down its middle where it bursts in two.
// Frame 0 legs out, frame 1 legs in and the seam lit gold.
export const Splitter = [
    mirror('....333', '..33335', '.333345', '3334435', '3333335', '3344335', '3333335', '.334435', '..33335', '...1.33', '..1..1.', '.1...1.'),
    mirror('....333', '..33338', '.333348', '3334438', '3333338', '3344338', '3333338', '.334438', '..33338', '...1.33', '...1.1.', '...1..1'),
];
// MITE 8x8: half a splitter, a pink tick with white eyes. It only ever falls.
export const Mite = [
    mirror('1...', '.133', '.335', '3333', '3343', '1.33', '1..3', '....'),
    mirror('....', '1133', '.335', '3333', '3343', '.133', '.1.3', '....'),
];
// IRON SHELL 16x12: a beetle under steel plates, pink eyes under the rim. Two hits: the first cracks the plates.
export const Shell = [
    mirror('......aa', '....aaaa', '..aaabaa', '.aaabaaa', 'aaabaaab', 'aabaaaba', 'aaabaaab', '.aaaaa33', '..aaa335', '.1..aaaa', '1..1..aa', '...1....'),
    mirror('......aa', '....aaaa', '..aaabaa', '.aaabaaa', 'aaabaaab', 'aabaaaba', 'aaabaaab', '.aaaaa33', '..aaa335', '..1.aaaa', '.1.1..aa', '.1......'),
];
// the cracked shell: plates gone dim, a white crack across, the pink showing through
function crack(s) {
    const o = remapWith(s, {});
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++)
            if (s.at(x, y) === iSteel && ((x * 7 + y * 3) % 5 === 0)) o.set(x, y, iSteelDim);
    const path = [[3, 5], [4, 4], [5, 5], [6, 4], [7, 3], [8, 4], [9, 5], [10, 4], [11, 3], [12, 4]];
    for (const [x, y] of path) if (o.at(x, y) >= 0) o.set(x, y, iWhite);
    for (const [x, y] of [[6, 6], [9, 6], [5, 2], [10, 2]]) if (o.at(x, y) >= 0) o.set(x, y, iPink);
    return o;
}
export const ShellCracked = [crack(Shell[0]), crack(Shell[1])];

// STINGER 14x14: a gold hornet, violet wings, its pink sting pointing down. It primes in the ranks, then strikes.
export const Stinger = [
    mirror('1......', '11....8', '111..88', '1111.85', '.111888', '..11388', '...1888', '....898', '....888', '....898', '.....88', '.....83', '......3', '......5'),
    mirror('.......', '......8', '.....88', '..11.85', '.111888', '1111388', '11.1888', '1...898', '....888', '....898', '.....88', '.....83', '......3', '......5'),
];

// SHIP 16x12: cyan, white nose and canopy, pink wingtips, a dim engine glow.
export const Ship = mirror('.......5', '.......5', '......65', '......66', '3.....65', '3....666', '6...6666', '6..66665', '66666666', '666.6666', '66...77.', '3.......');
// a ship in the swarm's hands: drained to pink (the captive over its captor), and turned nose-down when it turns on you
export const CaptiveShip = remapWith(Ship, { [iCyan]: iPink, [iCyanDim]: iPinkDim, [iPink]: iViolet });
export const Turncoat = [flipV(CaptiveShip), flipV(remapWith(CaptiveShip, { [iWhite]: iGold }))];

export const Pennant = PixelSprite.fromRows('53...', '5333.', '53333', '5333.', '53...', '5....', '5....', '55...');
export const PennantGold = PixelSprite.fromRows('58...', '5888.', '58888', '5888.', '58...', '5....', '5....', '55...');

// ------------------------------------------------------------------ THE HIVE QUEEN
// BODY 22x34: a gold crown, a violet head (white eyes, pink mandibles), the thorax, and a striped pink abdomen whose
// middle is THE EYE (drawn over it, below). Centre = (11, 17).
export const QueenBody = mirror(
    '......8....', '......88..8', '.......8888', '......88888', '......99999', '.....111111', '....1115511', '....1115511',
    '....1111111', '...3.111111', '..33..11111', '..3...12222', '.....111111', '....1111111', '....1113311', '....1111111',
    '.....111111', '......22222', '.....333333', '....3333333', '...33333333', '...33433333', '..333333333', '..334444444',
    '..333333333', '...33333333', '...33444444', '....3333333', '.....333333', '......33333', '.......3333', '........333',
    '.........33', '..........5');
// the mandibles lit gold: she is about to spit a fan of bolts
export const QueenBodyCharged = (() => {
    const o = remapWith(QueenBody, {});
    for (let y = 9; y <= 11; y++) for (let x = 0; x < o.width; x++) if (o.at(x, y) === iPink) o.set(x, y, iGold);
    for (const x of [8, 13]) { o.set(x, 6, iGold); o.set(x, 7, iGold); }
    return o;
})();
// THE EYE 10x9, over the abdomen (rows 19..27 of the body): shut under steel, or open (white, a gold iris, a dark pupil)
export const EyeShut = mirror('..aaa', '.aabb', 'aabaa', 'aabaa', 'aaaab', 'aabaa', 'aabaa', '.aabb', '..aaa');
export const EyeOpen = mirror('..333', '.3355', '33558', '35589', '35892', '35589', '33558', '.3355', '..333');
export const EyeHalf = mirror('..aaa', '.aabb', 'aabaa', '35589', '35892', '35589', 'aabaa', '.aabb', '..aaa');

// a WING 26x24 (the left one; the right is the same flipped): a long forewing leaning out and up from the root and a
// smaller hindwing under it, pink rims, violet membrane with dim cells, white veins fanning from the root (25, 15).
// Broken: only a ragged dim stump is left near the root.
function makeWing(broken) {
    const W = 26, H = 24, o = new PixelSprite(W, H);
    const lobe = (cx, cy, rx, ry, ang) => {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        return (x, y) => {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            const u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry;
            return u * u + v * v <= 1;
        };
    };
    const fore = lobe(13, 9, 13, 5.6, 0.42), hind = lobe(16, 17, 9, 4.2, 0.12);
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (fore(x, y) || hind(x, y));
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            if (!inside(x, y)) continue;
            const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
            o.set(x, y, edge ? iPink : (((x >> 2) + (y >> 2)) % 3 === 0 ? iVioletDim : iViolet));
        }
    // the veins: straight lines from the root, clipped to the wing (white on the forewing, dim on the hindwing)
    const vein = (x1, y1, c) => {
        let x0 = 24, y0 = 15;
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (let g = 0; g < 64; g++) {
            if (inside(x0, y0) && o.at(x0, y0) !== iPink) o.set(x0, y0, c);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    };
    vein(2, 4, iWhite); vein(6, 10, iWhite); vein(12, 2, iWhite); vein(10, 18, iVioletDim); vein(16, 21, iVioletDim);
    if (!broken) return o;
    const b = new PixelSprite(W, H);
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            const v = o.at(x, y);
            if (v < 0) continue;
            const d = Math.hypot(x - 24, (y - 15) * 1.3), h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
            if (d > 7 + (h % 5) || (d > 5 && h % 4 === 0)) continue;
            b.set(x, y, v === iPink ? iPinkDim : v === iWhite ? iPinkDim : iVioletDim);
        }
    return b;
}
function flipH(s) {
    const o = new PixelSprite(s.width, s.height);
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) { const v = s.at(x, y); if (v >= 0) o.set(s.width - 1 - x, y, v); }
    return o;
}
export const WingL = makeWing(false), WingR = flipH(WingL);
export const WingLBroken = makeWing(true), WingRBroken = flipH(WingLBroken);

export function spriteFor(a, frame) {
    switch (a.kind) {
        case 0: return Drone[frame];      // AlienKind.Drone
        case 1: return Escort[frame];     // AlienKind.Escort
        case 3: return Splitter[frame];   // AlienKind.Splitter
        case 4: return Mite[frame];       // AlienKind.Mite
        case 5: return a.hp > 1 ? Shell[frame] : ShellCracked[frame];
        case 6: return Stinger[frame];    // AlienKind.Stinger
        case 7: return Turncoat[frame];   // AlienKind.Turncoat
        default: return a.hp > 1 ? Boss[frame] : BossHurt[frame];
    }
}

export function stamp(dst, src, ox, oy) {
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const v = src.at(x, y);
            if (v >= 0) dst.set(ox + x, oy + y, v);
        }
}
