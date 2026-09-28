// THE NODE · world 1 · RELIC QUEST on the Cabinet Engine · THE SPRITES (palette-indexed text rows).
//
// Index letters (see spec.js, RelicQuestPalette):
//   0 bg   1 gold   2 goldHi   3 goldLo   4 green   5 greenHi   6 greenLo   7 red   8 redHi   9 redLo
//   a snake   b snakeHi   c snakeLo   d white   e hud   f steel   g steelLo   h skin   i tunic   j brown
//   k dark   l orange   m cream
// Sprites face RIGHT (or UP for the top-view snake head); the renderer mirrors them.
import { PixelSprite } from '../../sdk/index.js';

const S = (...rows) => PixelSprite.fromRows(...rows);

// ---- the knight, 14 x 20 (a big-helmed chibi, as the concept frames): steel kettle helm with a red
// plume, face under the brim, leather tunic, gold buckle, brown legs, dark boots
const KnightTop = [
    '......77......',
    '.....7997.....',
    '.....ffff.....',
    '...ffffffff...',
    '..fdffffffffg.',
    '..fdfffffffgg.',
    '..ffffffffffg.',
    '.gggggggggggg.',
    '...hhhhhhkhh..',
    '...hhhhhhkhhh.',
    '...hhhhhhhhh..',
    '....hhhhhhh...',
    '...iiiiiiii...',
    '..hiiiiiiiih..',
    '..hiiiiiiiih..',
    '...33313333...',
    '...iiiiiiii...',
];
const LegsStand = ['...jjj..jjj...', '...jjj..jjj...', '..kkkk..kkkk..'];
const LegsA = ['...jjj...jjj..', '..jjj.....jjj.', '.kkkk.....kkkk'];
const LegsB = ['....jjjjjj....', '....jjj.jj....', '...kkkk.kkk...'];

export const Knight = {
    stand: S(...KnightTop, ...LegsStand),
    walkA: S(...KnightTop, ...LegsA),
    walkB: S(...KnightTop, ...LegsB),
};

// bitten: helmet knocked off (it flies separately), hair on end, eyes wide, mouth open, 14 x 20
export const KnightDazed = S(
    '..............',
    '..............',
    '..............',
    '....jjjjjj....',
    '...jjjjjjjj...',
    '..jjjjjjjjjj..',
    '..jjhhhhhhjj..',
    '..jhhhhhhhhj..',
    '..jhkhhhhkhj..',
    '...hhhhhhhh...',
    '...hhhh77hh...',
    '....hhhhhh....',
    ...KnightTop.slice(12), ...LegsStand);
// the helmet on its own, flying off (9 x 5)
export const HelmetFly = S(
    '...77....',
    '..ffff...',
    '.fdffffg.',
    '.ffffffg.',
    'ggggggggg');

// ---- the snake's head, side view facing RIGHT (11 x 7) and top view facing UP (8 x 9)
export const SnakeHeadSide = S(
    '..ccccc....',
    '.caaaaacc..',
    'caaaadkaacc',
    'caaaaaaaaac',
    'cabbbbbbaac',
    '.caaaaaacc.',
    '..cccccc...');
export const SnakeHeadTop = S(
    '..cccc..',
    '.caaaac.',
    'cdaaaadc',
    'ckaaaakc',
    'caabbaac',
    'caaaaaac',
    'caaaaaac',
    '.caaaac.',
    '..caac..');

// ---- a gem (9 x 7): a cut ruby, light top-left, dark bottom-right
export const Gem = S(
    '..88777..',
    '.8877777.',
    '887777779',
    '.7777779.',
    '..77779..',
    '...779...',
    '....9....');

// ---- THE RELIC: a great ruby in a gold setting (13 x 11), and its plinth (14 x 5)
export const Relic = S(
    '...3111113...',
    '..318888713..',
    '.31888d87713.',
    '3188d88877713',
    '1788888777791',
    '1777777777991',
    '1777777779991',
    '3177777799913',
    '.31777799913.',
    '..319999913..',
    '...3111113...');
// the relic before it is raised: its shape, dark, on the plinth
export const RelicGhost = S(
    '...3333333...',
    '..399999993..',
    '.39999999993.',
    '3999999999993',
    '3999999999993',
    '3999999999993',
    '3999999999993',
    '3999999999993',
    '.39999999993.',
    '..399999993..',
    '...3333333...');
export const Plinth = S(
    '22222222222222',
    '31111111111113',
    '...31111113...',
    '..2111111112..',
    '.322222222223.');

// ---- HUD icons: a life (the knight's head, 9 x 8) and a torch (5 x 11)
export const LifeIcon = S(
    '...77....',
    '..ffff...',
    '.fdffffg.',
    '.ffffffg.',
    'ggggggggg',
    '.hhhhkhh.',
    '.hhhhhhh.',
    '..hhhhh..');
export const TorchIcon = S(
    '..e..',
    '.eel.',
    '.lel.',
    'lleel',
    '.lll.',
    '.333.',
    '..j..',
    '..j..',
    '..j..',
    '..j..',
    '..j..');

// ---- the title card's picture (built from the sprites above): the knight, sword up, facing the
// relic on its plinth; a snake rears on the far side
export const TitleArt = (() => {
    const W = 76, H = 21;
    const t = new PixelSprite(W, H);
    const stamp = (sp, x, y, flipX = false) => {
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                const v = sp.at(flipX ? sp.width - 1 - i : i, j);
                if (v >= 0) t.set(x + i, y + j, v);
            }
    };
    const disc = (cx, cy, r, v) => {
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + (r >> 1)) t.set(cx + i, cy + j, v);
    };
    stamp(Knight.walkA, 1, 1);
    // the sword, raised: crossguard at the fist, the blade up and forward
    t.set(13, 13, 3); t.set(12, 12, 1); t.set(14, 12, 1); t.set(13, 12, 1); t.set(13, 11, 1);
    for (let i = 1; i <= 9; i++) { t.set(13 + i, 12 - i, 15); t.set(13 + i, 11 - i, 13); }
    // relic + plinth + rays
    stamp(Relic, 32, 3); stamp(Plinth, 31, 15);
    for (const [x, y] of [[38, 0], [29, 3], [47, 3], [28, 8], [48, 8], [30, 1], [46, 1]]) t.set(x, y, 2);
    // the snake: coils on the floor, neck up, head facing the knight, tongue out
    for (let k = 0; k < 9; k++) disc(58 + k * 2, 18 - (k % 2), 2, 12);
    for (let k = 0; k < 9; k++) disc(58 + k * 2, 18 - (k % 2), 1, 10);
    for (let k = 0; k < 6; k++) disc(59 - (k % 2), 16 - k * 2, 2, 12);
    for (let k = 0; k < 6; k++) disc(59 - (k % 2), 16 - k * 2, 1, 10);
    stamp(SnakeHeadSide, 52, 2, true);
    t.set(51, 5, 7); t.set(50, 5, 7); t.set(49, 4, 7); t.set(49, 6, 7);
    return t;
})();
