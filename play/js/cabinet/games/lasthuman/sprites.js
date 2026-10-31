// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE SPRITES: authored art, no palette, no
// surface. Split out of the renderer so spec.js (title art) can read it without an import cycle back
// through the renderer (which needs the palette, built in spec.js).
//
// Palette indices: 0 bg 1 floor 2 silverDk 3 silver 4 silverHi 5 redDk 6 red 7 yellowDk 8 yellow
// 9 cyanDk a cyan b violetDk c violet d orange.
//
// DOUBLE-WIDE pixels: every authored column is drawn twice (the '83 boards' wide-pixel look).
// The machines: DRONE (walks you down), CRUSHER (can't die), CORTEX (turns humans), HUSK (a turned
// human), PYLON (three looks), HATCHER (breeds rollers), ROLLER (bouncing shells), MITE (swarms).
// THE MAINFRAME is drawn in rects by the renderer: it is too big for a sprite.
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
// a human the cortex got to: violet, red-eyed, arms up, walking you down
export const Husk = [
    wide('.bbb.', '.6c6.', '.ccc.', 'c.c.c', 'c.c.c', 'ccccc', '..c..', '.ccc.', '.ccc.', '.bbb.', '.b.b.', '.b.b.', 'bb.bb'),
    wide('.bbb.', '.6c6.', '.ccc.', 'c.c.c', 'c.c.c', 'ccccc', '..c..', '.ccc.', '.ccc.', '.bbb.', '.b.b.', 'b...b', 'b...b'),
];
export const Drone = [
    wide('..333..', '.33333.', '.36663.', '.33333.', '...3...', '3333333', '3.333.3', '3.363.3', '6.333.6', '..3.3..', '..3.3..', '.33.33.'),
    wide('..333..', '.33333.', '.36663.', '.33333.', '...3...', '3333333', '3.333.3', '3.363.3', '6.333.6', '..3.3..', '.3...3.', '33...33'),
];
export const Crusher = [
    wide('...333...', '..33333..', '..36663..', '..33333..', '333333333', '333333333', '33.363.33', '33.666.33', '33.363.33',
         '44.333.44', '...333...', '...3.3...', '..33.33..', '..33.33..', '.333.333.'),
    wide('...333...', '..33333..', '..36663..', '..33333..', '333333333', '333333333', '33.363.33', '33.666.33', '33.363.33',
         '44.333.44', '...333...', '..3...3..', '.33...33.', '.33...33.', '333...333'),
];
export const Cortex = [
    wide('..666..', '.65656.', '6565656', '6656566', '6565656', '.66666.', '..333..', '.34343.', '..333..', '.33333.', '.3.3.3.', '3..3..3'),
    wide('..666..', '.66566.', '6656566', '6565656', '6656566', '.66666.', '..333..', '.34343.', '..333..', '.33333.', '.3.3.3.', '.3.3.3.'),
];
// pylons: three looks (a wave picks one), two frames each (the shimmer is a shape change, not a strobe)
export const Pylon = [
    [wide('..8..', '.878.', '87478', '.878.', '..8..'), wide('..7..', '.787.', '78487', '.787.', '..7..')],
    [wide('c...c', '.cbc.', '.b4b.', '.cbc.', 'c...c'), wide('.c.c.', 'cbcbc', '.c4c.', 'cbcbc', '.c.c.')],
    [wide('66666', '65556', '65456', '65556', '66666'), wide('.666.', '65556', '65456', '65556', '.666.')],
];
export const Hatcher = [
    wide('..66..', '.6556.', '656656', '654456', '654456', '656656', '.6556.', '..66..'),
    wide('..55..', '.5665.', '565565', '564465', '564465', '565565', '.5665.', '..55..'),
];
export const Roller = [
    wide('..44..', '..33..', '.3dd3.', '333333', '3d33d3', '333333', '222222', '2.2.2.'),
    wide('..44..', '..33..', '.3dd3.', '333333', '3d33d3', '333333', '222222', '.2.2.2'),
];
export const Mite = [
    wide('6.6', '.4.', '666', '6.6'),
    wide('.6.', '646', '.6.', '6.6'),
];
// where a crusher stepped on a human
export const Skull = wide('.444.', '4.4.4', '44444', '.4.4.');

function stamp(dst, src, x, y) {
    for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
            const v = src.at(i, j);
            if (v >= 0) dst.set(x + i, y + j, v);
        }
}

// the title card: a woman behind the man, his stream going out at a drone and a cortex
export function buildTitleArt() {
    const art = new PixelSprite(104, 13);
    stamp(art, Woman[0], 0, 0);
    stamp(art, Player[1], 14, 0);
    for (let k = 0; k < 3; k++) {
        const x = 28 + k * 9;
        for (let i = 0; i < 5; i++) { art.set(x + i, 7, 10); art.set(x + i, 8, 10); }
        art.set(x + 5, 7, 4); art.set(x + 5, 8, 4);
    }
    stamp(art, Drone[0], 58, 1);
    stamp(art, Cortex[1], 86, 1);
    art.set(78, 2, 6); art.set(77, 3, 6); art.set(78, 3, 4); art.set(79, 3, 6); art.set(78, 4, 6);   // a spark
    return art;
}
