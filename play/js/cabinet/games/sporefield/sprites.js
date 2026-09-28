// THE NODE · world 1 · SPORE FIELD on the Cabinet Engine · the 8x8 palette-index sprites.
// Port of the sprite tables in SporeFieldRenderer.cs. Split out so spec.js (the title art) and
// renderer.js can both read them without an import cycle.
// Palette indices: 1 red, 2 red dark, 3 green, 4 green dark, 5 violet, 6 violet dark, 7 white.
import { PixelSprite } from '../../sdk/index.js';

export const Shroom = [
    null,
    PixelSprite.fromRows(
        '..1111..',
        '.111111.'),
    PixelSprite.fromRows(
        '..1111..',
        '.111111.',
        '11111111',
        '12111121'),
    PixelSprite.fromRows(
        '..1111..',
        '.111111.',
        '11111111',
        '11111111',
        '12222221',
        '...22...'),
    PixelSprite.fromRows(
        '..1111..',
        '.111111.',
        '11111111',
        '11111111',
        '12222221',
        '...22...',
        '..2222..'),
];

export const BodyA = PixelSprite.fromRows(
    '4......4',
    '..3333..',
    '.333333.',
    '.334433.',
    '.334433.',
    '.333333.',
    '..3333..',
    '4......4');
export const BodyB = PixelSprite.fromRows(
    '........',
    '4.3333.4',
    '.333333.',
    '.334433.',
    '.334433.',
    '.333333.',
    '4.3333.4',
    '........');
// heads face right; flipped for left
export const HeadA = PixelSprite.fromRows(
    '4......4',
    '..3333..',
    '.333377.',
    '.333377.',
    '.333333.',
    '.333344.',
    '..3333..',
    '4......4');
export const HeadB = PixelSprite.fromRows(
    '........',
    '4.3333.4',
    '.333377.',
    '.333377.',
    '.333333.',
    '.333344.',
    '4.3333.4',
    '........');
export const SpiderA = PixelSprite.fromRows(
    '5..............5',
    '.5............5.',
    '..5.55555555.5..',
    '.5..57555575..5.',
    '5...55555555...5',
    '.....566665.....',
    '................',
    '................');
export const SpiderB = PixelSprite.fromRows(
    '................',
    '................',
    '..5.55555555.5..',
    '.5..57555575..5.',
    '5.5.55555555.5.5',
    '...5.566665.5...',
    '..5..........5..',
    '.5............5.');
export const FleaSprite = PixelSprite.fromRows(
    '...77...',
    '..7117..',
    '.711117.',
    '.711117.',
    '..7117..',
    '...77...',
    '.7.77.7.',
    '7......7');
export const Wand = PixelSprite.fromRows(
    '...77...',
    '...77...',
    '..7777..',
    '.777777.',
    '.771177.',
    '.777777.',
    '..7777..',
    '........');

// stamp src onto dst at (ox, oy), optionally flipped left-right (Stamp in SporeFieldCartridge.cs)
export function stamp(dst, src, ox, oy, flip = false) {
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const v = src.at(flip ? src.width - 1 - x : x, y);
            if (v >= 0) dst.set(ox + x, oy + y, v);
        }
}
