// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE SPRITES.
// Port of HyperDriftSprites.cs (Staging/Batch3/hyperdrift), 1:1.
//
// Authored as palette-index rows (PixelSprite), sized for a curved tube at 0.8 m: your car 16x26,
// traffic cars 14x22, trucks 16x30, all with a black outline so they read on grey asphalt and on
// orange sand. Cars point UP (nose at row 0).
//
// Rotation: every vehicle is pre-rotated into 24 frames (15 degree steps) at load, the way the boards
// kept pre-drawn rotations in ROM. RotSprite-lite: upscale 4x with Scale2x twice (it keeps diagonals
// clean), rotate, sample the pixel centres back at 1x. Palette indices in, palette indices out.
// The rotation maths is double in C# too (Math.Cos/Sin on doubles), so no f32 here.
//
// palette: 0 bg  1 asphalt  2 asphaltDark  3 white  4 orange  5 orangeDark  6 yellow  7 yellowDark
//          8 green  9 greenDark  a red  b redDark  c blue  d blueDark  e grey
import { PixelSprite, SystemRandom, roundEven, idiv } from '../../sdk/index.js';

export const Frames = 24;                             // 15 degrees a frame
export const Step = Math.PI * 2.0 / Frames;

// ------------------------------------------------------------------ your car (yellow, 16x26)
const Player = PixelSprite.fromRows(
    '...0000000000...',
    '..036666666630..',
    '..066666666660..',
    '0006666666666000',
    '0006666776666000',
    '0006666776666000',
    '0007666666667000',
    '..076000000670..',
    '..070000000070..',
    '..070000000070..',
    '..076000000670..',
    '..076666666670..',
    '..076667766670..',
    '..076667766670..',
    '..076666666670..',
    '..076000000670..',
    '..076600006670..',
    '..076666666670..',
    '0006600000066000',
    '0006666666666000',
    '0006600000066000',
    '0006666666666000',
    '0006600000066000',
    '..066666666660..',
    '..0aa666666aa0..',
    '...0000000000...');

// ------------------------------------------------------------------ traffic car (14x22): B body, S shade, L tail lights
const CarRows =
    '..0000000000..|' +
    '.03BBBBBBBB30.|' +
    '00BBBBBBBBBB00|' +
    '00BBBBBBBBBB00|' +
    '00SBBBBBBBBS00|' +
    '.0S00000000S0.|' +
    '.0S00000000S0.|' +
    '.0SB000000BS0.|' +
    '.0SBBBBBBBBS0.|' +
    '.0SBBBBBBBBS0.|' +
    '.0SBBBBBBBBS0.|' +
    '.0SBBBBBBBBS0.|' +
    '.0SB000000BS0.|' +
    '.0SBB0000BBS0.|' +
    '.0SBBBBBBBBS0.|' +
    '00SBBBBBBBBS00|' +
    '00BBBBBBBBBB00|' +
    '00BBBBBBBBBB00|' +
    '00BBBBBBBBBB00|' +
    '.0BBBBBBBBBB0.|' +
    '.0LBBBBBBBBL0.|' +
    '..0000000000..';

// ------------------------------------------------------------------ truck (16x30): C cab, D cab shade
const TruckRows =
    '....00000000....|' +
    '...03CCCCCC30...|' +
    '...0CCCCCCCC0...|' +
    '00.0CCCCCCCC0.00|' +
    '00.0C000000C0.00|' +
    '00.0C000000C0.00|' +
    '...0CCCCCCCC0...|' +
    '...0DDDDDDDD0...|' +
    '..000000000000..|' +
    '..0eeeeeeeeee0..|' +
    '..0e33333333e0..|' +
    '..0e33333333e0..|' +
    '..0e33333333e0..|' +
    '..0eeeeeeeeee0..|' +
    '..0e33333333e0..|' +
    '..0e33333333e0..|' +
    '..0e33333333e0..|' +
    '..0eeeeeeeeee0..|' +
    '..0e33333333e0..|' +
    '..0e33333333e0..|' +
    '000e33333333e000|' +
    '000eeeeeeeeee000|' +
    '000e33333333e000|' +
    '..0e33333333e0..|' +
    '000e33333333e000|' +
    '000eeeeeeeeee000|' +
    '000e33333333e000|' +
    '..0e33333333e0..|' +
    '..0aeeeeeeeea0..|' +
    '..000000000000..';

function recolour(rows, ...map) {
    for (const [from, to] of map) rows = rows.split(from).join(to);
    return PixelSprite.fromRows(...rows.split('|'));
}

const CarRed = recolour(CarRows, ['B', 'a'], ['S', 'b'], ['L', '6']);
const CarBlue = recolour(CarRows, ['B', 'c'], ['S', 'd'], ['L', 'a']);
const TruckRed = recolour(TruckRows, ['C', 'a'], ['D', 'b']);
const TruckBlue = recolour(TruckRows, ['C', 'c'], ['D', 'd']);

// ------------------------------------------------------------------ the road furniture
const Oil = PixelSprite.fromRows(
    '......000000..........',
    '...00000000000000.....',
    '.00000dd00000000000...',
    '0000dd00000000000000..',
    '000000000000dd00000000',
    '00000000000dd000000000',
    '.0000000000000000d000.',
    '..000000d000000000000.',
    '...000000000000000....',
    '.....0000000000.......',
    '........0000..........');

const Cone = PixelSprite.fromRows(
    '..0..',
    '.040.',
    '.040.',
    '.030.',
    '04440',
    '03330',
    '04440',
    '00000');

const Barrier = PixelSprite.fromRows(
    '0000000000000000000000',
    '0443344333443344333440',
    '0334433443334433443330',
    '0443344333443344333440',
    '0000000000000000000000',
    '.0e................e0.',
    '.0e................e0.');

// a yellow diamond with a black chevron (flip it for a right-hand bend)
const SignLeft = PixelSprite.fromRows(
    '.....0.....',
    '....060....',
    '...06660...',
    '..0660060..',
    '.066006660.',
    '06600666660',
    '.066006660.',
    '..0660060..',
    '...06660...',
    '....060....',
    '.....0.....',
    '.....e.....',
    '.....e.....',
    '.....e.....');

const SignWorks = PixelSprite.fromRows(
    '.....0.....',
    '....060....',
    '...06660...',
    '..0660660..',
    '.066606660.',
    '06666066660',
    '.066666660.',
    '..0660660..',
    '...06660...',
    '....060....',
    '.....0.....',
    '.....e.....',
    '.....e.....',
    '.....e.....');

const Bush = PixelSprite.fromRows(
    '....00000....',
    '..008888800..',
    '.08889888880.',
    '0888888898880',
    '0898888888880',
    '0888898888890',
    '.09988888990.',
    '..009999900..',
    '....00000....');

const Scrub = PixelSprite.fromRows(
    '..9.9.9...',
    '.9.989.9..',
    '..98889.9.',
    '.9888889..',
    '..989899..',
    '...9.9....');

const Rock = PixelSprite.fromRows(
    '...5555...',
    '.55444455.',
    '5544444455',
    '5444444450',
    '.55555500.',
    '..00000...');

// ------------------------------------------------------------------ rotation
function toArray(s) {
    const a = new Int32Array(s.width * s.height);
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) a[y * s.width + x] = s.at(x, y);
    return a;
}

// EPX / Scale2x on palette indices (-1 = transparent)
function scale2x(a, w, h) {
    const o = new Int32Array(w * h * 4);
    const W = w * 2;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const P = a[y * w + x];
            const A = y > 0 ? a[(y - 1) * w + x] : P;
            const B = x < w - 1 ? a[y * w + x + 1] : P;
            const C = x > 0 ? a[y * w + x - 1] : P;
            const D = y < h - 1 ? a[(y + 1) * w + x] : P;
            let e0 = P, e1 = P, e2 = P, e3 = P;
            if (A !== D && C !== B) {
                if (C === A) e0 = A;
                if (A === B) e1 = B;
                if (D === C) e2 = C;
                if (B === D) e3 = D;
            }
            o[(y * 2) * W + x * 2] = e0; o[(y * 2) * W + x * 2 + 1] = e1;
            o[(y * 2 + 1) * W + x * 2] = e2; o[(y * 2 + 1) * W + x * 2 + 1] = e3;
        }
    return o;
}

// RotSprite-lite: Scale2x twice, rotate clockwise by `angle`, sample back at 1x.
// The output is square, side = the source diagonal rounded up to the source's parity, so the
// 0-degree frame lands pixel for pixel on the source.
export function rotate(src, angle) {
    const w = src.width, h = src.height;
    const big = scale2x(scale2x(toArray(src), w, h), w * 2, h * 2);
    const W4 = w * 4, H4 = h * 4;
    let n = Math.trunc(Math.ceil(Math.sqrt(w * w + h * h))) + 2;
    if ((n - w) % 2 !== 0) n++;
    const nw = n;
    let nh = n;
    if ((nh - h) % 2 !== 0) nh++;
    const o = new PixelSprite(nw, nh);
    const c = Math.cos(angle), sn = Math.sin(angle);
    for (let j = 0; j < nh; j++)
        for (let i = 0; i < nw; i++) {
            const u = i + 0.5 - nw * 0.5, v = j + 0.5 - nh * 0.5;
            const sx = u * c + v * sn, sy = -u * sn + v * c;          // inverse of a clockwise turn (y down)
            const X = Math.floor((sx + w * 0.5) * 4.0), Y = Math.floor((sy + h * 0.5) * 4.0);
            if (X < 0 || Y < 0 || X >= W4 || Y >= H4) continue;
            const p = big[Y * W4 + X];
            if (p >= 0) o.set(i, j, p);
        }
    return o;
}

function cache(src) {
    const frames = new Array(Frames);
    for (let k = 0; k < Frames; k++) frames[k] = rotate(src, k * Step);
    return frames;
}

// the frame index for a heading (radians clockwise from straight up)
export function frameFor(angle) {
    const k = (roundEven(angle / Step) % Frames) | 0;
    return k < 0 ? k + Frames : k;
}

// draw a frame centred on (x, y)
export function blitCentred(s, sp, x, y, pal) {
    s.blit(sp, roundEven(x) - idiv(sp.width, 2), roundEven(y) - idiv(sp.height, 2), pal);
}

function stampOver(dst, src, x0, y0) {
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const p = src.at(x, y);
            if (p >= 0) dst.set(x0 + x, y0 + y, p);
        }
}

const PlayerFrames = cache(Player);
const CarRedFrames = cache(CarRed);
const CarBlueFrames = cache(CarBlue);
const TruckRedFrames = cache(TruckRed);
const TruckBlueFrames = cache(TruckBlue);

// ------------------------------------------------------------------ title art (144x44): the winding road + your car mid-drift
function titleArt() {
    const W = 144, H = 44;
    const a = new PixelSprite(W, H);
    const rng = new SystemRandom(83);
    for (let y = 0; y < H; y++) {
        // an S through the frame, drawn the game's way: centre, widened by the slope
        const t = y / (H - 1);
        const c = 72 + 38 * Math.sin((t * 1.6 - 0.3) * Math.PI);
        const c1 = 72 + 38 * Math.sin(((y + 1) / (H - 1) * 1.6 - 0.3) * Math.PI);
        const k = Math.abs(c1 - c);
        const hw = 15 * Math.sqrt(1 + k * k);
        for (let x = 0; x < W; x++) {
            const d = x - c;
            let p;
            if (Math.abs(d) < hw) p = 1;
            else if (Math.abs(d) < hw + 3) p = (idiv(y, 3) & 1) === 0 ? 6 : 0;
            else p = rng.next(9) === 0 ? 5 : 4;
            if (p === 1 && Math.abs(d) < 1.2 && (idiv(y, 4) & 1) === 0) p = 3;
            if (p === 1 && Math.abs(Math.abs(d) - (hw - 1)) < 0.6) p = 3;
            a.set(x, y, p);
        }
    }
    // bushes on the sand
    stampOver(a, Bush, 8, 4); stampOver(a, Bush, 118, 28); stampOver(a, Scrub, 128, 6); stampOver(a, Rock, 14, 30);
    // skid marks and your car, drifting through the bend
    for (let i = 0; i < 18; i++) { a.set(52 + i, 34 - idiv(i, 2), 2); a.set(58 + i, 36 - idiv(i, 2), 2); }
    stampOver(a, PlayerFrames[frameFor(Math.PI / 4)], 64, 6);
    return a;
}

export const HyperDriftSprites = Object.freeze({
    Frames, Step,
    Player, CarRed, CarBlue, TruckRed, TruckBlue,
    Oil, Cone, Barrier, SignLeft, SignWorks, Bush, Scrub, Rock,
    PlayerFrames, CarRedFrames, CarBlueFrames, TruckRedFrames, TruckBlueFrames,
    frameFor, blitCentred, rotate, titleArt,
});
