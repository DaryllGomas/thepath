// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · the palette-index sprites.
// Port of the sprite tables in SwarmPatrolRenderer.cs. Split out so spec.js (the title art) and
// renderer.js can both read them without an import cycle. Every sprite is authored as its LEFT
// half and mirrored (Mirror()).
// Palette indices (SwarmPatrolCartridge.Palette order): 0 bg, 1 violet, 2 violetDim, 3 pink,
// 4 pinkDim, 5 white, 6 cyan, 7 cyanDim.
import { PixelSprite } from '../../sdk/index.js';

export const iBg = 0, iViolet = 1, iVioletDim = 2, iPink = 3, iPinkDim = 4, iWhite = 5, iCyan = 6, iCyanDim = 7;

function mirror(...leftHalves) {
    const rows = leftHalves.map(row => row + [...row].reverse().join(''));
    return PixelSprite.fromRows(...rows);
}

// the dented boss: violet body -> pink, pink crown -> white
function remap(s) {
    const o = new PixelSprite(s.width, s.height);
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
            const v = s.at(x, y);
            if (v < 0) continue;
            o.set(x, y, v === iViolet ? iPink : v === iPink ? iWhite : v);
        }
    return o;
}

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
// SHIP 16x12: cyan, white nose and canopy, pink wingtips, a dim engine glow.
export const Ship = mirror('.......5', '.......5', '......65', '......66', '3.....65', '3....666', '6...6666', '6..66665', '66666666', '666.6666', '66...77.', '3.......');
export const Pennant = PixelSprite.fromRows('53...', '5333.', '53333', '5333.', '53...', '5....', '5....', '55...');

export function spriteFor(a, frame) {
    switch (a.kind) {
        case 0: return Drone[frame];      // AlienKind.Drone
        case 1: return Escort[frame];     // AlienKind.Escort
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
