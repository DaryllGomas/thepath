// THE NODE · world 1 · MUD & METAL · THE SPRITES. Port of MudMetalSprites.cs.
//
// Authored as palette-index text rows (PixelSprite), one bike at 24 x 20 px: rider in the attack
// crouch, knobby wheels (9 px, two spoke frames), red fenders, white side plate, orange shock.
// Rivals are the same bike with the red swapped for dusk blue.
//
// The 1984 board had a handful of pre-drawn pitch frames; so do we, made once at start-up by a
// RotSprite-style rotation: the sprite is scaled x8 with EPX (Scale2x) three times, then sampled
// back at 1x on a rotated grid. Edges stay pixel-clean and every pixel is still a palette index.
// Pitch frames every 15 deg from -75 (nose down) to +75 (nose up), pivot = the ground contact
// point midway between the wheels, so a frame drawn at the rider's (x, ground - z) sits right.
//
// Palette indices (spec.js's MudMetalPalette):
//   0 bg  1 night  2 dusk  3 sky  4 mudDark  5 mud  6 tanDark  7 tan  8 tanLight
//   9 chromeDim  a chrome  b orangeDim  c orange  d redDim  e red  f steel
import { PixelSprite, roundEven } from '../../sdk/index.js';

export const BikeW = 24, BikeH = 20;
export const FrameSize = 48, FramePivot = 24;       // rotated bike frames: 48x48, pivot at (24, 24)
export const AngleStep = 15, AngleCount = 11;       // -75 .. +75
export const WreckSize = 40, TumbleSize = 20;

// the bike and rider; rows 11-19 are drawn over the two wheels
const Body = [
    ".............eee........",
    "............eeeeee......",
    "...........eeaa00.......",
    "...........eeeeee.......",
    "..........ddeeee........",
    ".........ddeeeeee.......",
    "........ddeeee.eee......",
    "ee......9aaee...ee0.....",
    ".eee0000aaaa9eee.f......",
    "..eeeaaaa.9aaeee.a......",
    ".9999aaaacf.aae..aeeeee.",
    ".........fff00f...a.....",
    ".........f9fff....a.....",
    ".........ffff.....a.....",
    ".........99ff......a....",
];

// the bike alone (the wreck): no rider
const BikeOnly = [
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "........................",
    "ee...............f......",
    ".eee00000000eee..a......",
    "..eeeaaaa.feeee..aee....",
    ".9999aaaacfff.e..aeeeee.",
    ".........fffff....a.....",
    ".........f9fff....a.....",
    ".........ffff.....a.....",
    ".........99ff......a....",
];

const WheelA = ["..00000..", ".0099900.", "009.9.900", "09..9..90", "0999a9990", "09..9..90", "009.9.900", ".0099900.", "..00000.."];
const WheelB = ["..00000..", ".0099900.", "009...900", "09.9.9.90", "09..a..90", "09.9.9.90", "009...900", ".0099900.", "..00000.."];

// the rider thrown clear, tucked into a ball (rotated as he tumbles)
const Tumble = [
    "....eee.....",
    "...eeeeee...",
    "..eeeaa00...",
    "..eeeeeee...",
    ".ddeeeeee0..",
    ".ddeeeeeee..",
    ".ddeeeeaa...",
    "..9aaaaaaa..",
    "..aaaa9aa...",
    "...aa..aa...",
    "...00..00...",
    "............",
];

// ------------------------------------------------------------ building
function stamp(s, rows, ox, oy) {
    const src = PixelSprite.fromRows(...rows);
    for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++) {
            const v = src.at(x, y);
            if (v >= 0) s.set(ox + x, oy + y, v);
        }
}

function compose(body, wheel) {
    const s = new PixelSprite(BikeW, BikeH);
    stamp(s, wheel, 0, 11);
    stamp(s, wheel, 15, 11);
    stamp(s, body, 0, 0);
    return s;
}

function swap(s, ...pairs) {
    const o = new PixelSprite(s.width, s.height);
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
            let v = s.at(x, y);
            for (let k = 0; k + 1 < pairs.length; k += 2) if (v === pairs[k]) { v = pairs[k + 1]; break; }
            if (v >= 0) o.set(x, y, v);
        }
    return o;
}

// EPX / Scale2x: each pixel becomes 2x2, corners take a neighbour's colour along clean diagonals
function scale2x(s) {
    const o = new PixelSprite(s.width * 2, s.height * 2);
    for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) {
            const P = s.at(x, y), A = s.at(x, y - 1), B = s.at(x + 1, y), C = s.at(x - 1, y), D = s.at(x, y + 1);
            let p1 = P, p2 = P, p3 = P, p4 = P;
            if (C === A && C !== D && A !== B) p1 = A;
            if (A === B && A !== C && B !== D) p2 = B;
            if (D === C && D !== B && C !== A) p3 = C;
            if (B === D && B !== A && D !== C) p4 = D;
            if (p1 >= 0) o.set(2 * x, 2 * y, p1);
            if (p2 >= 0) o.set(2 * x + 1, 2 * y, p2);
            if (p3 >= 0) o.set(2 * x, 2 * y + 1, p3);
            if (p4 >= 0) o.set(2 * x + 1, 2 * y + 1, p4);
        }
    return o;
}

// rotate by deg (+ = counter-clockwise on screen: nose up) about (pivotX, pivotY) in source pixels;
// the result is size x size with that pivot landing on (outPivotX, outPivotY)
export function rotate(src, deg, pivotX, pivotY, size, outPivotX, outPivotY) {
    const o = new PixelSprite(size, size);
    if (Math.abs(deg) < 0.01) {
        const dx0 = outPivotX - roundEven(pivotX), dy0 = outPivotY - roundEven(pivotY);
        for (let y = 0; y < src.height; y++)
            for (let x = 0; x < src.width; x++) {
                const v = src.at(x, y);
                if (v >= 0) o.set(x + dx0, y + dy0, v);
            }
        return o;
    }
    const big = scale2x(scale2x(scale2x(src)));
    const r = deg * Math.PI / 180.0, cs = Math.cos(r), sn = Math.sin(r);
    for (let oy = 0; oy < size; oy++)
        for (let ox = 0; ox < size; ox++) {
            const dx = ox + 0.5 - outPivotX, dy = oy + 0.5 - outPivotY;
            const sx = dx * cs - dy * sn, sy = dx * sn + dy * cs;
            const bx = Math.floor((pivotX + sx) * 8.0), by = Math.floor((pivotY + sy) * 8.0);
            const v = big.at(bx, by);
            if (v >= 0) o.set(ox, oy, v);
        }
    return o;
}

// the frame for a pitch in degrees (+ = nose up)
export function angleIndex(pitch) {
    let a = roundEven(pitch / AngleStep) + Math.trunc(AngleCount / 2);
    return a < 0 ? 0 : a >= AngleCount ? AngleCount - 1 : a;
}

// a ramp: up from x0 to the peak at xp (height h), down to x1; lit up-face, shaded back
function wedge(s, x0, xp, x1, h, groundY) {
    for (let x = x0; x <= x1; x++) {
        const t = x <= xp ? (x - x0) / Math.max(1, xp - x0) : 1 - (x - xp) / Math.max(1, x1 - xp);
        const hh = roundEven(t * h);
        for (let k = 1; k <= hh; k++) s.set(x, groundY - k, x <= xp ? 8 : 6);
        if (hh > 0) s.set(x, groundY - hh, 5);
    }
}

// the title card: the red rider flying level off a kicker toward the landing, dust behind
function buildTitleArt(bike) {
    const W = 96, H = 24;
    const s = new PixelSprite(W, H);
    // ground
    for (let x = 0; x < W; x++) { s.set(x, H - 2, 7); s.set(x, H - 1, 6); }
    // takeoff kicker (x 2..30) and the landing ramp (x 64..94)
    wedge(s, 2, 22, 30, 13, H - 2);
    wedge(s, 66, 72, 94, 9, H - 2);
    // the dust off the lip
    const dx = [30, 27, 25, 22, 19, 23, 17], dy = [9, 8, 10, 7, 9, 12, 12];
    for (let i = 0; i < dx.length; i++) { s.set(dx[i], dy[i], i % 2 === 0 ? 8 : 7); s.set(dx[i] + 1, dy[i], 8); }
    // the shadow on the ground under the bike
    for (let x = 40; x < 58; x++) if ((x & 1) === 0) s.set(x, H - 2, 6);
    // the bike, level: the lesson
    for (let y = 0; y < bike.height; y++)
        for (let x = 0; x < bike.width; x++) {
            const v = bike.at(x, y);
            if (v >= 0) s.set(36 + x, y, v);
        }
    return s;
}

// ------------------------------------------------------------ build once at module load
export const Player = [[], []];      // [spoke frame][angle]
export const Rival = [[], []];
export const Wreck = [];             // every 45 deg, pivot at the centre
export const Rider = [];
export let TitleArt;

{
    for (let f = 0; f < 2; f++) {
        const bike = compose(Body, f === 0 ? WheelA : WheelB);
        const rival = swap(bike, 0xe, 0x3, 0xd, 0x2);
        for (let a = 0; a < AngleCount; a++) {
            const deg = (a - Math.trunc(AngleCount / 2)) * AngleStep;
            Player[f][a] = rotate(bike, deg, 12, 20, FrameSize, FramePivot, FramePivot);
            Rival[f][a] = rotate(rival, deg, 12, 20, FrameSize, FramePivot, FramePivot);
        }
    }
    const wreck = compose(BikeOnly, WheelA);
    const ball = PixelSprite.fromRows(...Tumble);
    for (let i = 0; i < 8; i++) {
        Wreck[i] = rotate(wreck, -i * 45, 12, 14, WreckSize, WreckSize / 2, WreckSize / 2);
        Rider[i] = rotate(ball, -i * 45, 6, 6, TumbleSize, TumbleSize / 2, TumbleSize / 2);
    }
    TitleArt = buildTitleArt(compose(Body, WheelA));
}
