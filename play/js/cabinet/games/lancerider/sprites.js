// THE NODE · world 1 · LANCE RIDER on the Cabinet Engine · SPRITES: rider/bird/egg pixel rows + factories.
// Split from renderer.js so spec.js (the title art) can build sprites without an import cycle.
// Authored facing RIGHT as text rows of symbols, recoloured per rider:
//   A armour  a plume/visor  L lance  T lance tip  B bird  b bird shade  k beak + legs  e eye
import { PixelSprite } from '../../sdk/index.js';

export const FUp = 0, FDown = 1, FStand = 2, FRun = 3;

export const RowsUp = [
    "b......aa.........",
    "Bb....aAAA........",
    "BBb....AxA........",
    ".BBb...AAA........",
    ".BBBb.AAAAALLLLLLT",
    "..BBBbAAAA....BBB.",
    "b..BBBBAA....BBeBk",
    "bb..BBBAABB.BBB...",
    "bBBBBBBBBBBBBBB...",
    "bBBBBBBBBBBBBB....",
    ".bBBBBBBBBBBB.....",
    "..bBBBBBBBBB......",
    "....bbbbbbb.......",
    "....k..k..........",
    "...k..k...........",
    "..kk.kk...........",
];

export const RowsDown = [
    ".......aa.........",
    "......aAAA........",
    ".......AxA........",
    ".......AAA........",
    "......AAAAALLLLLLT",
    "......AAAA....BBB.",
    "b......AA....BBeBk",
    "bb..BBBAABB.BBB...",
    "bBBBBBBBBBBBBBB...",
    "bBBBBBBBBBBBBB....",
    ".BBBBBBBBBBBkk....",
    ".bBBBBBBBBb.......",
    "..bBBBBBBb........",
    "..bBBbBBb.........",
    "..b.b.b.b.........",
    "..................",
];

export const RowsStand = [
    ".......aa.........",
    "......aAAA........",
    ".......AxA........",
    ".......AAA........",
    "......AAAAALLLLLLT",
    "......AAAA....BBB.",
    "b......AA....BBeBk",
    "bb..BBBAABB.BBB...",
    "bBBBBBBBBBBBBBB...",
    "bBBbbbbbbBBBBB....",
    ".bBBbbbbbBBBB.....",
    "..bBBBBBBBBB......",
    "....bbbbbbb.......",
    "......k...k.......",
    "......k...k.......",
    ".....kk..kk.......",
];

export const RowsRun = [
    ".......aa.........",
    "......aAAA........",
    ".......AxA........",
    ".......AAA........",
    "......AAAAALLLLLLT",
    "......AAAA....BBB.",
    "b......AA....BBeBk",
    "bb..BBBAABB.BBB...",
    "bBBBBBBBBBBBBBB...",
    "bBBbbbbbbBBBBB....",
    ".bBBbbbbbBBBB.....",
    "..bBBBBBBBBB......",
    "....bbbbbbb.......",
    ".....k.....k......",
    "....k.......k.....",
    "...kk.......kk....",
];

export const RowsHatchling = [
    "...aa....",
    "..aAAA...",
    "...AxA...",
    "...AAA...",
    ".AAAAAA..",
    "A.AAAA.A.",
    "..AAAA...",
    "..A..A...",
    "..A..A...",
    "..A..A...",
    ".AA..AA..",
];

export const RowsEgg = [
    "...EE...",
    "..EEEE..",
    ".EEEEwE.",
    ".EEEEEw.",
    "EEEEEEEE",
    "EEEEEEEE",
    "eEEEEEEE",
    "eeEEEEEe",
    ".eeEEEe.",
    "..eeee..",
];

export const RowsLife = [
    "...aa...",
    "..aAAA..",
    "...AxA..",
    "..AAAALT",
    "BBBAABB.",
    "bBBBBB..",
    ".k..k...",
    "kk.kk...",
];

export function frameRows(f) { return f === FUp ? RowsUp : f === FDown ? RowsDown : f === FStand ? RowsStand : RowsRun; }

// [char] -> palette index, for a given variant (0 = the player, 1..3 = bounder, hunter, shadow lord)
export function variantMap(P, v, withRider) {
    const m = new Map();
    if (withRider) {
        m.set('A', P.indexOf(v === 0 ? 'rider' : v === 1 ? 'bounder' : v === 2 ? 'hunter' : 'lord'));
        m.set('a', P.indexOf(v === 0 ? 'riderLight' : 'white'));
        m.set('L', P.indexOf('stoneLight'));
        m.set('T', P.indexOf('white'));
    }
    m.set('B', P.indexOf(v === 0 ? 'steed' : 'buzzard'));
    m.set('b', P.indexOf(v === 0 ? 'steedDark' : 'buzzardDark'));
    m.set('k', P.indexOf('lava'));
    m.set('e', P.indexOf(v === 0 ? 'sky' : 'white'));
    if (withRider) m.set('x', P.indexOf('sky'));
    return m;
}

export function make(rows, map) {
    let h = rows.length, w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    const s = new PixelSprite(w, h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < rows[y].length; x++) {
            const idx = map.get(rows[y][x]);
            if (idx !== undefined) s.set(x, y, idx);
        }
    return s;
}

// THE CINDER HAWK (facing right): F flame body, f its dark edge, Y white-hot crest, W eye, G beak.
// Two frames: wings up, the downstroke.
export const RowsHawkUp = [
    "......YY..............",
    ".....YFFY.............",
    "....YFFFf.............",
    "...YFFFff.......FFF...",
    "..YFFFFffFFFFFFFFYWF..",
    ".fFFFFFFFFFFFFFFFFFFGG",
    "ff..ffFFFFFFFFFFFFf...",
    "f......fffFFFFff......",
    "..........f..f........",
];

export const RowsHawkDown = [
    "......................",
    "......................",
    "................FFF...",
    "...............FFYWF..",
    "..ffFFFFFFFFFFFFFFFFGG",
    ".fFFFFFFFFFFFFFFFFFf..",
    "ff..YFFFFFFFFFFfff....",
    "f....YFFFFFf..........",
    "......YFFFf...........",
];

// THE PIT BEAST's head (facing right; its jaws to the right). The crown's centre is column 16
// (BEAST_CROWN_COL): the beast's x. H hide, h its lit edge, D dark stone (brow), S stone, L bone
// (horns, teeth), O lava (the cracks in its hide), Y white-hot eye, W white, G crown gold, g its shade,
// o the dark of its lip. Rows 0..4 are its crown (three spikes, the gem), rows 15..18 its mouth (open
// in the second frame).
export const BEAST_CROWN_COL = 16;
export const RowsBeastShut = [
    "............G...G...G...................",
    "...........gG..GWG..Gg..................",
    "...SS......gGGgGYGgGGg..................",
    "....SS.....gGGGGGGGGGg..................",
    "....SSL...gGgGGGGGGGgGg.................",
    ".....SSLhhhhhhhhhhhhhhhh................",
    "......SHHHHHHHHHHHHHHHHHhh..............",
    ".....hHHHHHHHHHHHHHHHHHHHHhh............",
    "....hHHHHHHHHHHHHHHHHHDDDHHHhh..........",
    "...hHHHHHHHHHHHHHHHHHDYYWDHHHHhh........",
    "...HHHOHHHHHHHHHHHHHHDYYYDHHHHHHhhh.....",
    "..HHHOOHHHHHHHHHHHHHHHDDDHHHHHHHHHHhh...",
    "..HHHHOHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHho.",
    "..HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH",
    "..HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH",
    "..HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH.",
    "..HHHHHHHHHHHHHHHHHHHHHHoLoLoLoLoLoLoLo.",
    "..HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH..",
    "..HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHh..",
    "..HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHh...",
    "...HHHHHOHHHHHHHHHHHHHHHHHHHHHHHHHhh....",
    "...HHHHOOHHHHHHHHHHHHHHHHHHHHHHhhh......",
    "....HHHHHHHHHHHHHHHHHHHHHHHHhhh.........",
    ".....HHHHHHHHHHHHHHHHHhhhh..............",
    "......HHHHHHHHHHHHHHH...................",
    ".......HHHHHHHHHHHH.....................",
];
export const RowsBeastOpen = [
    "............G...G...G...................",
    "...........gG..GWG..Gg..................",
    "...SS......gGGgGYGgGGg..................",
    "....SS.....gGGGGGGGGGg..................",
    "....SSL...gGgGGGGGGGgGg.................",
    ".....SSLhhhhhhhhhhhhhhhh................",
    "......SHHHHHHHHHHHHHHHHHhh..............",
    ".....hHHHHHHHHHHHHHHHHHHHHhh............",
    "....hHHHHHHHHHHHHHHHHHDDDHHHhh..........",
    "...hHHHHHHHHHHHHHHHHHDYYWDHHHHhh........",
    "...HHHOHHHHHHHHHHHHHHDYYYDHHHHHHhhh.....",
    "..HHHOOHHHHHHHHHHHHHHHDDDHHHHHHHHHHhh...",
    "..HHHHOHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHho.",
    "..HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH",
    "..HHHHHHHHHHHHHHHHHHHHHHHHLLLHLLLHLLLHLL",
    "..HHHHHHHHHHHHHHHHHHHHHHo..L...L...L...L",
    "..HHHHHHHHHHHHHHHHHHHHHo................",
    "..HHHHHHHHHHHHHHHHHHHHHo................",
    "..HHHHHHHHHHHHHHHHHHHHHHo..L...L...L....",
    "..HHHHHHHHHHHHHHHHHHHHHHHLLLHLLLHLLLHL..",
    "...HHHHHOHHHHHHHHHHHHHHHHHHHHHHHHHHHh...",
    "...HHHHOOHHHHHHHHHHHHHHHHHHHHHHHhhh.....",
    "....HHHHHHHHHHHHHHHHHHHHHHHHhhh.........",
    ".....HHHHHHHHHHHHHHHHHhhhh..............",
    "......HHHHHHHHHHHHHHH...................",
    ".......HHHHHHHHHHHH.....................",
];

export function hawkMap(P) {
    return new Map([['F', P.indexOf('lava')], ['f', P.indexOf('lavaDark')], ['Y', P.indexOf('lavaHot')], ['W', P.indexOf('white')], ['G', P.indexOf('egg')]]);
}

export function beastMap(P) {
    return new Map([
        ['H', P.indexOf('hide')], ['h', P.indexOf('hideLight')], ['D', P.indexOf('stoneDark')], ['S', P.indexOf('stone')], ['L', P.indexOf('stoneLight')],
        ['O', P.indexOf('lava')], ['o', P.indexOf('lavaDark')], ['Y', P.indexOf('lavaHot')], ['W', P.indexOf('white')], ['G', P.indexOf('egg')], ['g', P.indexOf('eggDark')],
    ]);
}
