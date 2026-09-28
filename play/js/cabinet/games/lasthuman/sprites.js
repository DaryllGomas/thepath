// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE SPRITES: authored art, no palette, no
// surface. Split out of the renderer so spec.js (title art) can read it without an import cycle back
// through the renderer (which needs the palette, built in spec.js).
//
// Port of LastHumanRenderer.cs's `LastHumanSprites`. Palette indices: 0 bg 1 floor 2 silverDk 3 silver
// 4 silverHi 5 redDk 6 red 7 yellowDk 8 yellow 9 cyanDk a cyan.
//
// DOUBLE-WIDE pixels: every authored column is drawn twice (the '83 boards' wide-pixel look).
import { PixelSprite } from '../../sdk/index.js';

export function wide(...rows) {
    const w = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        let out = '';
        for (let k = 0; k < row.length; k++) out += row[k] + row[k];
        w[i] = out;
    }
    return PixelSprite.fromRows(...w);
}

export const Player = [
    wide('.aaa.', 'aaaaa', 'a444a', '.aaa.', '..a..', 'aaaaa', 'a.a.a', 'a.a.a', 'a.a.a', '.aaa.', '.a.a.', '.a.a.', 'aa.aa'),
    wide('.aaa.', 'aaaaa', 'a444a', '.aaa.', '..a..', 'aaaaa', 'a.a.a', 'a.a.a', 'a.a.a', '.aaa.', '.a.a.', 'a...a', 'a...a'),
];
export const PlayerBack = [
    wide('.aaa.', 'aaaaa', 'aaaaa', '.a9a.', '..a..', 'aaaaa', 'a.a.a', 'a.a.a', 'a.a.a', '.aaa.', '.a.a.', '.a.a.', 'aa.aa'),
    wide('.aaa.', 'aaaaa', 'aaaaa', '.a9a.', '..a..', 'aaaaa', 'a.a.a', 'a.a.a', 'a.a.a', '.aaa.', '.a.a.', 'a...a', 'a...a'),
];
export const Man = [
    wide('.777.', '.888.', '.888.', '.888.', '..8..', '88888', '8.8.8', '8.8.8', '8.8.8', '.777.', '.7.7.', '.7.7.', '77.77'),
    wide('.777.', '.888.', '.888.', '.888.', '..8..', '88888', '8.8.8', '8.8.8', '8.8.8', '.777.', '.7.7.', '7...7', '7...7'),
];
export const Woman = [
    wide('.777.', '78887', '78887', '.888.', '..8..', '.888.', '8.8.8', '8.8.8', '88888', '88888', '.8.8.', '.8.8.', '.8.8.'),
    wide('.777.', '78887', '78887', '.888.', '..8..', '.888.', '8.8.8', '8.8.8', '88888', '88888', '.8.8.', '8...8', '8...8'),
];
export const Grunt = [
    wide('..333..', '.33333.', '.36663.', '.33333.', '...3...', '3333333', '3.333.3', '3.363.3', '6.333.6', '..3.3..', '..3.3..', '.33.33.'),
    wide('..333..', '.33333.', '.36663.', '.33333.', '...3...', '3333333', '3.333.3', '3.363.3', '6.333.6', '..3.3..', '.3...3.', '33...33'),
];
export const Hulk = [
    wide('...333...', '..33333..', '..36663..', '..33333..', '333333333', '333333333', '33.363.33', '33.666.33', '33.363.33',
         '44.333.44', '...333...', '...3.3...', '..33.33..', '..33.33..', '.333.333.'),
    wide('...333...', '..33333..', '..36663..', '..33333..', '333333333', '333333333', '33.363.33', '33.666.33', '33.363.33',
         '44.333.44', '...333...', '..3...3..', '.33...33.', '.33...33.', '333...333'),
];
export const Brain = [
    wide('..666..', '.65656.', '6565656', '6656566', '6565656', '.66666.', '..333..', '.34343.', '..333..', '.33333.', '.3.3.3.', '3..3..3'),
    wide('..666..', '.66566.', '6656566', '6565656', '6656566', '.66666.', '..333..', '.34343.', '..333..', '.33333.', '.3.3.3.', '.3.3.3.'),
];

function stamp(dst, src, x, y) {
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(i, j);
            if (v >= 0) dst.set(x + i, y + j, v);
        }
}

// the title card: a woman behind the man, his stream going out at a grunt and a brain
export function buildTitleArt() {
    const art = new PixelSprite(104, 13);
    stamp(art, Woman[0], 0, 0);
    stamp(art, Player[1], 14, 0);
    for (let k = 0; k < 3; k++) {
        const x = 28 + k * 9;
        for (let i = 0; i < 5; i++) { art.set(x + i, 7, 10); art.set(x + i, 8, 10); }
        art.set(x + 5, 7, 4); art.set(x + 5, 8, 4);
    }
    stamp(art, Grunt[0], 58, 1);
    stamp(art, Brain[1], 86, 1);
    art.set(78, 2, 6); art.set(77, 3, 6); art.set(78, 3, 4); art.set(79, 3, 6); art.set(78, 4, 6);   // a spark
    return art;
}
