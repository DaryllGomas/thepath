// THE NODE · world 1 · LUNAR DUTY · THE SCROLL: the three parallax layers and the ground texture.
// Port of LunarScroll.cs.
//
// Everything here is a pure function of a layer coordinate u = camX * factor + screen column,
// so the picture scrolls smoothly with no state and the same camera always draws the same moon:
//
//   stars      fixed                 (a cratered moon hangs over the left of the sky)
//   MOUNTAINS  x0.12  jagged peaks, tops y 111-180, the faces turned to the left lit blue
//   CITY       x0.30  the moon base: domes and lit towers on a y 186 skyline, one block per 64 px (a gap now and then)
//   HILLS      x0.55  low rolling dunes, tops y 183-198, in front of the city
//   GROUND     x1.00  the road: y 200 down, specks and 1 px bumps pinned to world x (the wheels ride them)
import { f32, roundEven } from '../../sdk/index.js';

export const MountainFactor = 0.12, CityFactor = 0.30, HillFactor = 0.55;
export const CityBase = 186, CityModule = 64;

export function hash(n) {
    let h = Math.imul(n | 0, 0x9E3779B1) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x85EBCA77) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xC2B2AE3D) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
}

export function tri(u) {
    const f = f32(u - Math.floor(u));
    return f < 0.5 ? f32(4 * f - 1) : f32(3 - 4 * f);
}

export function floor(v) { return Math.floor(v); }

// the big shapes of the range (the light falls on these), then the jagged detail on top
function mountainBase(u) {
    return f32(f32(34 + f32(20 * tri(f32(u / 173 + 0.13)))) + f32(11 * tri(f32(u / 71 + 0.4))));
}

// screen y of the mountain ridge at layer coordinate u
export function mountainTop(u) {
    const h = f32(mountainBase(u) + f32(4 * tri(f32(u / 23 + 0.77))));
    return 180 - roundEven(h);
}

// true where the big shape rises to the right (a face turned to the light on the left)
export function mountainLit(u) { return mountainBase(u + 2) > mountainBase(u - 2); }

export function hillTop(u) {
    let h = f32(f32(9 + f32(5 * Math.sin(u / 19))) + f32(f32(3 * Math.sin(u / 7.3 + 1.1)) + f32(3 * Math.sin(u / 41 + 2))));
    if (h < 2) h = 2;
    return 200 - roundEven(h);
}

// 0 empty, 1 big dome + tower, 2 two small domes, 3 tower cluster, 4 dome + tube + dome, 5 radar mast
export function cityKind(module) {
    const h = hash(module * 7 + 3);
    const k = h % 9;
    return k >= 6 ? 1 + ((h >>> 8) % 5) : k;     // mostly built up, now and then a gap
}

export function citySeed(module) { return hash(module * 131 + 17); }

// the road: a 1 px bump in the surface every so often (pinned to world x)
export function bump(wx) { return hash(floor(wx / 4) + 9001) % 9 === 0; }

// ground speck at world column wx, screen row y: 0 none, 1 light, 2 dark
export function speck(wx, y) {
    const h = hash(wx * 263 + y * 71);
    if (h % 43 === 0) return 1;
    if (h % 29 === 0) return 2;
    return 0;
}

export const StarX = [], StarY = [], StarC = [];
{
    const n = 46;
    for (let i = 0; i < n; i++) {
        const h = hash(i + 500);
        StarX.push(10 + (h % 300));
        StarY.push(50 + ((h >>> 9) % 96));
        StarC.push((h >>> 20) % 7);     // 0 white, 1-2 dust, 3+ dim
    }
}
