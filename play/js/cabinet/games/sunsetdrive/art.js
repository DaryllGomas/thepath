// THE NODE · world 1 · SUNSET DRIVE · THE ART, drawn in code at load time.
//
// Every sprite is built once, when the module loads, on a Canvas (blit.js) in packed palette colours:
// palms with feathered fronds, cypress, cacti, canyon rocks and spires, surf shacks, a lifeguard tower,
// billboards for invented brands, chevron boards, street lamps, a motel sign, the START gantry (with its
// lamps lit in six steps), CHECKPOINT and GOAL arches, the fork sign, four kinds of traffic in several
// paints, and the hero: a red convertible from behind (five lean frames x brake lights, and twelve
// tumble frames for the crash). No image files, nothing copied: original drawings.
//
// Each roadside KIND has: spr, upx (world units per source pixel: its size in the world), coll (the
// half-width it blocks, in road half-widths; 0 = you drive through it) and an optional anchor.
import { PixelFont } from '../../sdk/index.js';
import { P } from './palette.js';
import { Canvas, h01 } from './blit.js';
import { ROAD_W } from './constants.js';

const C = new Proxy({}, { get: (_, name) => P(name) });   // C.red -> packed colour

// ------------------------------------------------------------------ plants
function palm(seed, bend, droopK) {
    const w = 64, h = 104, cv = new Canvas(w, h);
    const bx = 30, by = h - 1, tx = 32 + bend, ty = 24;
    const mx = bx + bend * 0.15 - 4 * Math.sign(bend || 1), my = 60;          // control point: the trunk bows
    const N = 140;
    for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        const x = u * u * bx + 2 * u * t * mx + t * t * tx, y = u * u * by + 2 * u * t * my + t * t * ty;
        const hw = 2.9 - 1.3 * t + (t < 0.06 ? (0.06 - t) * 18 : 0);          // flare at the foot
        const ring = Math.floor(y / 3) % 2 === 0;
        for (let xx = Math.round(x - hw); xx <= Math.round(x + hw); xx++) {
            const edge = xx <= Math.round(x - hw) + 0 ? C.woodHi : xx >= Math.round(x + hw) ? C.trunkLo : ring ? C.trunk : C.wood;
            cv.set(xx, y, edge);
        }
    }
    // fronds: nine feathered leaves from the crown, drooping with their length
    const fr = [-172, -150, -128, -106, -84, -62, -40, -18, 8, 168, -196];
    for (let k = 0; k < fr.length; k++) {
        const a = (fr[k] + (h01(seed, k) - 0.5) * 14) * Math.PI / 180;
        const L = 19 + h01(seed, 20 + k) * 9;
        const dx = Math.cos(a), dy = Math.sin(a);
        const droop = droopK * (0.35 + Math.abs(dx) * 0.7);
        let px0 = tx, py0 = ty;
        const steps = Math.ceil(L);
        for (let s = 1; s <= steps; s++) {
            const f = s / steps;
            const x = tx + dx * f * L, y = ty + dy * f * L + droop * f * f * L;
            // direction of travel for the leaflets
            const ddx = x - px0, ddy = y - py0, dl = Math.hypot(ddx, ddy) || 1;
            const ux = ddx / dl, uy = ddy / dl, nx = -uy, ny = ux;
            const ll = 6.2 * (1 - f * 0.72) * (f < 0.12 ? f / 0.12 : 1);
            for (const side of [1, -1]) {
                const lx = nx * side * 0.85 + ux * 0.55, ly = ny * side * 0.85 + uy * 0.55 + 0.35;
                const up = (ny * side) < 0;                                     // leaflets on the upper side catch the light
                const col = up ? (f < 0.5 ? C.palmHi : C.palm) : (f < 0.35 ? C.palm : C.palmLo);
                for (let q = 1; q <= ll; q++) cv.set(x + lx * q, y + ly * q, col);
            }
            cv.line(px0, py0, x, y, C.palmLo);
            px0 = x; py0 = y;
        }
    }
    // coconuts under the crown
    cv.disc(tx - 2.5, ty + 3, 2.0, C.trunkLo); cv.disc(tx + 2, ty + 3.5, 2.0, C.hair); cv.disc(tx, ty + 5, 1.8, C.trunkLo);
    cv.set(tx - 3, ty + 2, C.wood);
    return cv;
}

function cypress(seed) {
    const w = 22, h = 70, cv = new Canvas(w, h);
    const top = 1, bot = 62, cx = 11;
    for (let y = top; y < bot; y++) {
        const t = (y - top) / (bot - top);
        const hw = 9.5 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.62) * 0.98)), 0.9) + 0.3;
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
            const s = (x - (cx - hw)) / (2 * hw + 0.01);
            const n = h01(seed * 131 + y * 7, x);
            let c = s < 0.35 ? (n < 0.55 ? C.cypHi : C.cyp) : s > 0.72 ? (n < 0.6 ? C.cypLo : C.cyp) : (n < 0.18 ? C.cypHi : n > 0.85 ? C.cypLo : C.cyp);
            if ((y + (x >> 1)) % 5 === 0 && s > 0.2) c = C.cypLo;           // leaf texture
            cv.set(x, y, c);
        }
    }
    cv.rect(cx - 1, bot, 3, h - bot, C.trunkLo); cv.set(cx - 1, bot, C.trunk);
    return cv;
}

function bush(seed) {
    const cv = new Canvas(34, 18);
    const blobs = [[8, 11, 6], [16, 8, 7.5], [25, 10, 6.5], [12, 13, 5], [22, 13, 5]];
    for (const [x, y, r] of blobs) cv.disc(x, y, r, C.palmLo);
    for (const [x, y, r] of blobs) cv.disc(x - 1, y - 1.2, r - 1.6, C.palm);
    for (const [x, y, r] of blobs) cv.disc(x - 2, y - 2.5, r - 4, C.palmHi);
    for (let i = 0; i < 18; i++) cv.set(3 + h01(seed, i) * 28, 3 + h01(seed, 40 + i) * 12, h01(seed, 80 + i) < 0.5 ? C.palmHi : C.pink);
    return cv;
}

function cactus() {
    const cv = new Canvas(28, 52);
    const col = (x0, x1, y0, y1) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const s = (x - x0) / (x1 - x0 || 1);
            cv.set(x, y, s < 0.25 ? C.cactusHi : s > 0.75 ? C.cactusLo : ((x - x0) % 2 === 1 ? C.cactus : C.cactusHi));
        }
        cv.ellipse((x0 + x1 + 1) / 2, y0, (x1 - x0 + 1) / 2, 2.2, C.cactusHi);
    };
    col(11, 17, 4, 51);                        // trunk
    col(3, 7, 14, 30); cv.rect(3, 28, 10, 5, C.cactus); cv.rect(3, 32, 10, 1, C.cactusLo);     // left arm
    col(21, 25, 20, 36); cv.rect(16, 34, 10, 5, C.cactus); cv.rect(16, 38, 10, 1, C.cactusLo); // right arm
    for (let y = 8; y < 50; y += 4) { cv.set(12, y, C.cream); cv.set(16, y + 2, C.cream); }      // spines
    cv.set(14, 2, C.pink); cv.set(13, 3, C.pink); cv.set(15, 3, C.pink);                         // a flower
    return cv;
}

function boulder(seed, hi, mid, lo, dk, w = 46, h = 30) {
    const cv = new Canvas(w, h);
    const pts = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
        const a = Math.PI + (i / (n - 1)) * Math.PI;                // the upper half-ellipse ...
        const r = 0.82 + h01(seed, i) * 0.22;
        pts.push([w / 2 + Math.cos(a) * (w / 2 - 1) * r, h - 2 + Math.sin(a) * (h - 3) * r]);
    }
    pts.push([w - 2, h - 1], [1, h - 1]);                            // ... on a flat foot
    cv.poly(pts, mid);
    // light from the upper left (the low sun ahead), facets
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (cv.get(x, y) === 0) continue;
        const u = x / w, v = y / h;
        const facet = h01(seed * 7 + Math.floor(x / 7), Math.floor(y / 6));
        if (u + v * 1.1 < 0.62 + facet * 0.12) cv.set(x, y, hi);
        else if (u * 0.6 + v > 1.0 + facet * 0.08) cv.set(x, y, lo);
    }
    for (let k = 0; k < 4; k++) {                                    // cracks
        let x = 8 + h01(seed, 50 + k) * (w - 16), y = 6 + h01(seed, 60 + k) * 8;
        for (let s = 0; s < 8; s++) { if (cv.get(x, y) !== 0) cv.set(x, y, dk); x += h01(seed, 70 + k * 9 + s) - 0.4; y += 1; }
    }
    for (let x = 0; x < w; x++) if (cv.get(x, h - 1)) cv.set(x, h - 1, dk);
    return cv;
}

function spire(seed) {
    const w = 44, h = 110, cv = new Canvas(w, h);
    for (let y = 0; y < h; y++) {
        const t = y / h;
        // a hoodoo: a cap, a waist, a wide skirt
        let hw = t < 0.12 ? 11 + t * 40 : t < 0.2 ? 15 - (t - 0.12) * 50 : 11 + Math.pow((t - 0.2) / 0.8, 1.6) * 10;
        hw += (h01(seed, y >> 2) - 0.5) * 2.2;
        const band = Math.floor((y + h01(seed, 3) * 9) / 7) % 3;
        for (let x = Math.round(w / 2 - hw); x <= Math.round(w / 2 + hw); x++) {
            const s = (x - (w / 2 - hw)) / (2 * hw);
            let c = band === 0 ? C.rock : band === 1 ? C.rockHi : C.rockLo;
            if (s < 0.28) c = band === 2 ? C.rock : C.rockHi;
            else if (s > 0.7) c = band === 1 ? C.rock : band === 0 ? C.rockLo : C.rockDk;
            if (t < 0.12 && s < 0.6) c = C.rockHi;
            cv.set(x, y, c);
        }
    }
    return cv;
}

// ------------------------------------------------------------------ buildings and props
function hut() {
    const cv = new Canvas(66, 52);
    cv.rect(6, 46, 3, 6, C.woodLo); cv.rect(57, 46, 3, 6, C.woodLo); cv.rect(31, 46, 3, 6, C.woodLo);   // stilts
    cv.rect(4, 44, 58, 3, C.wood); cv.hline(4, 61, 44, C.woodHi);                                      // deck
    for (let x = 8; x < 58; x++) for (let y = 20; y < 44; y++) cv.set(x, y, (x - 8) % 5 === 0 ? C.woodLo : (x % 5 === 2 ? C.woodHi : C.wood));
    cv.rect(14, 26, 26, 11, C.ink); cv.rect(14, 36, 26, 2, C.woodHi);                                  // the hatch + counter
    cv.rect(16, 28, 3, 8, C.teal); cv.rect(24, 30, 4, 6, C.pink); cv.rect(32, 29, 5, 7, C.yellow);     // goods on the shelf
    // thatched roof
    cv.poly([[0, 22], [66, 22], [58, 6], [8, 6]], C.sandLo);
    for (let x = 1; x < 66; x += 2) cv.line(x, 22, x * 0.84 + 5.5, 7, (x % 4 === 1) ? C.trunk : C.woodHi);
    cv.hline(0, 65, 22, C.woodLo); cv.hline(8, 58, 6, C.sand);
    // the SURF board sign
    cv.rect(18, 0, 30, 9, C.teal); cv.rect(18, 8, 30, 1, C.tealLo);
    cv.text('SURF', 20, 2, PixelFont.Small, C.white, 1); cv.text('SURF', 21, 2, PixelFont.Small, C.white, 1);
    cv.disc(43, 4, 2.5, C.yellow);
    // two boards leaning on the side
    cv.ellipse(56, 34, 2.6, 13, C.pink); cv.line(56, 22, 56, 46, C.white);
    cv.ellipse(61, 36, 2.6, 12, C.sky); cv.line(61, 25, 61, 47, C.yellow);
    return cv;
}

function tower() {
    const cv = new Canvas(46, 70);
    cv.line(10, 69, 15, 36, C.woodLo); cv.line(11, 69, 16, 36, C.wood);
    cv.line(35, 69, 30, 36, C.woodLo); cv.line(34, 69, 29, 36, C.wood);
    cv.line(12, 58, 33, 58, C.wood); cv.line(14, 48, 31, 48, C.wood); cv.line(13, 60, 32, 46, C.woodLo);
    for (let y = 40; y < 70; y += 4) cv.hline(20, 26, y, C.woodHi);                           // ladder
    cv.rect(4, 34, 38, 3, C.wood); cv.hline(4, 41, 34, C.woodHi);                             // platform
    for (let y = 14; y < 34; y++) for (let x = 7; x < 39; x++) cv.set(x, y, Math.floor((y - 14) / 4) % 2 === 0 ? C.white : C.red);
    cv.rect(12, 18, 22, 7, C.glass); cv.hline(12, 33, 18, C.skyLo);                            // window
    cv.poly([[2, 15], [44, 15], [36, 5], [10, 5]], C.red); cv.hline(2, 43, 15, C.redLo); cv.hline(10, 36, 5, C.redHi);
    cv.rect(21, 0, 2, 6, C.greyLo); cv.poly([[23, 0], [30, 2], [23, 4]], C.yellow);            // flag
    return cv;
}

function billboard(bgName, draw) {
    const cv = new Canvas(80, 56);
    for (const px of [16, 60]) { cv.rect(px, 38, 4, 18, C.greyLo); cv.rect(px, 38, 1, 18, C.grey); }
    cv.rect(0, 0, 80, 40, C.ink);
    cv.rect(2, 2, 76, 36, C.white);
    cv.rect(3, 3, 74, 34, P(bgName));
    draw(cv);
    cv.hline(1, 78, 39, C.greyLo);
    return cv;
}

const F = PixelFont;
function centreText(cv, s, y, font, c, scale = 1, shadow = 0) {
    const x = Math.round(40 - cv.textW(s, font, scale) / 2);
    if (shadow) cv.text(s, x + scale, y + scale, font, shadow, scale);
    cv.text(s, x, y, font, c, scale);
}

const BOARDS = [
    () => billboard('red', cv => {               // SUN COLA
        cv.disc(14, 19, 9, C.yellow); cv.disc(14, 19, 6, C.orange);
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; cv.line(14 + Math.cos(a) * 10, 19 + Math.sin(a) * 10, 14 + Math.cos(a) * 13, 19 + Math.sin(a) * 13, C.yellow); }
        cv.text('SUN', 29, 7, F.Display, C.ink, 1); cv.text('SUN', 28, 6, F.Display, C.white, 1);
        cv.text('COLA', 29, 17, F.Display, C.ink, 1); cv.text('COLA', 28, 16, F.Display, C.yellow, 1);
        cv.text('ICE COLD', 28, 28, F.Arcade, C.cream, 1);
    }),
    () => billboard('violet', cv => {            // RAD 88 FM
        for (let k = 0; k < 9; k++) { const hh = 4 + Math.round(h01(88, k) * 10); cv.rect(8 + k * 7, 34 - hh, 4, hh, k % 2 ? C.pink : C.magenta); }
        centreText(cv, 'RAD 88', 5, F.Display, C.neonCyan, 1, C.navy);
        centreText(cv, 'FM', 14, F.Display, C.yellow, 1, C.navy);
    }),
    () => billboard('teal', cv => {              // WAVE WAX
        for (let x = 3; x < 77; x++) { const y = 29 + Math.round(Math.sin(x * 0.28) * 3); cv.rect(x, y, 1, 37 - y, C.white); cv.set(x, y, C.sky); }
        centreText(cv, 'WAVE', 5, F.Display, C.yellow, 1, C.tealLo);
        centreText(cv, 'WAX', 15, F.Display, C.white, 1, C.tealLo);
    }),
    () => billboard('pink', cv => {              // TURBO GUM
        cv.disc(64, 26, 8, C.cream); cv.disc(62, 24, 3, C.white);
        cv.text('TURBO', 7, 7, F.Display, C.magenta, 1); cv.text('TURBO', 6, 6, F.Display, C.white, 1);
        cv.text('GUM', 7, 18, F.Display, C.magenta, 1); cv.text('GUM', 6, 17, F.Display, C.yellow, 1);
        cv.text('POP!', 8, 28, F.Arcade, C.violet, 1);
    }),
    () => billboard('navy', cv => {              // NEON MOTEL
        centreText(cv, 'NEON', 5, F.Display, C.pink, 1, C.magenta);
        centreText(cv, 'MOTEL', 15, F.Display, C.pink, 1, C.magenta);
        centreText(cv, 'VACANCY', 27, F.Arcade, C.neonCyan, 1);
    }),
    () => billboard('orange', cv => {            // COCO TAN
        cv.disc(64, 20, 9, C.trunkLo); cv.disc(62, 18, 6, C.trunk); cv.disc(60, 16, 2, C.woodHi);
        cv.text('COCO', 7, 7, F.Display, C.redLo, 1); cv.text('COCO', 6, 6, F.Display, C.white, 1);
        cv.text('TAN', 7, 17, F.Display, C.redLo, 1); cv.text('TAN', 6, 16, F.Display, C.cream, 1);
        cv.text('SPF 4', 7, 28, F.Arcade, C.ink, 1);
    }),
];

function chevron(dirRight) {
    const cv = new Canvas(34, 30);
    cv.rect(7, 16, 3, 14, C.greyLo); cv.rect(24, 16, 3, 14, C.greyLo); cv.rect(7, 16, 1, 14, C.grey); cv.rect(24, 16, 1, 14, C.grey);
    cv.rect(0, 0, 34, 18, C.ink); cv.rect(1, 1, 32, 16, C.signY); cv.hline(1, 32, 16, C.signYLo);
    for (let k = 0; k < 3; k++) {
        const x = 6 + k * 9;
        for (let t = 0; t < 7; t++) { cv.rect(x + t * 0.8, 3 + t, 3, 1, C.ink); cv.rect(x + t * 0.8, 15 - t, 3, 1, C.ink); }
    }
    return dirRight ? cv : cv.mirrorX();
}

function lamp() {
    const cv = new Canvas(30, 96);
    cv.rect(3, 12, 3, 84, C.greyLo); cv.rect(3, 12, 1, 84, C.grey);
    cv.rect(1, 88, 7, 8, C.greyLo);
    for (let x = 4; x < 24; x++) { const y = 10 - Math.round(4 * Math.sin((x - 4) / 20 * Math.PI * 0.6)); cv.rect(x, y, 1, 2, C.greyLo); }
    cv.rect(18, 7, 11, 4, C.greyLo); cv.hline(18, 28, 7, C.grey);
    cv.rect(19, 11, 9, 2, C.sunHi); cv.hline(20, 27, 13, C.sun);
    return cv;
}

function motel() {
    const cv = new Canvas(44, 100);
    cv.rect(20, 60, 4, 40, C.greyLo); cv.rect(20, 60, 1, 40, C.grey);
    cv.rect(10, 0, 24, 62, C.ink); cv.rect(12, 2, 20, 58, C.navy);
    cv.rect(11, 1, 22, 1, C.pink); cv.rect(11, 60, 22, 1, C.pink); cv.rect(11, 1, 1, 60, C.pink); cv.rect(32, 1, 1, 60, C.pink);
    const L = 'MOTEL';
    for (let i = 0; i < L.length; i++) { cv.text(L[i], 18, 5 + i * 11, F.Display, C.magenta, 1); cv.text(L[i], 18, 4 + i * 11, F.Display, C.pink, 1); }
    cv.poly([[0, 64], [30, 64], [38, 70], [30, 76], [0, 76]], C.yellow); cv.poly([[2, 66], [29, 66], [34, 70], [29, 74], [2, 74]], C.orange);
    cv.text('OPEN', 5, 67, F.Small, C.white, 1);
    return cv;
}

function house() {
    const cv = new Canvas(70, 50);
    cv.rect(6, 18, 58, 32, C.tan); cv.rect(6, 46, 58, 4, C.tanLo);
    for (let y = 18; y < 46; y += 7) cv.hline(6, 63, y, C.woodHi);
    cv.poly([[2, 20], [68, 20], [58, 8], [12, 8]], C.rock); cv.hline(2, 67, 20, C.rockLo); cv.hline(12, 58, 8, C.rockHi);
    for (let x = 4; x < 66; x += 4) cv.line(x, 20, x * 0.78 + 7.6, 9, C.rockLo);
    cv.rect(46, 0, 12, 10, C.tan); cv.rect(46, 0, 12, 2, C.rock);                         // a little tower
    for (const wx of [12, 28, 48]) { cv.rect(wx, 26, 8, 10, C.glass); cv.rect(wx - 3, 26, 3, 10, C.grn); cv.rect(wx + 8, 26, 3, 10, C.grn); }
    cv.rect(30, 38, 8, 12, C.woodLo);
    return cv;
}

function flag() {
    const cv = new Canvas(22, 80);
    cv.rect(2, 4, 2, 76, C.chrome); cv.rect(3, 4, 1, 76, C.grey);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) cv.set(4 + x, 5 + y + Math.round(Math.sin(x * 0.4) * 1.5), (((x >> 2) + (y >> 2)) & 1) ? C.white : C.ink);
    cv.disc(3, 3, 2, C.yellow);
    return cv;
}

// ------------------------------------------------------------------ arches across the road
function arch(text, style) {
    const w = 224, h = 124, cv = new Canvas(w, h);
    const post = (x0) => {
        for (let y = 24; y < h; y++) for (let x = x0; x < x0 + 10; x++) {
            const band = Math.floor(y / 10) % 2;
            let c = style === 'goal' ? (band ? C.ink : C.white) : style === 'start' ? (band ? C.greyLo : C.grey) : (band ? C.red : C.white);
            if (x === x0) c = C.ink; else if (x === x0 + 9) c = C.ink;
            cv.set(x, y, c);
        }
        cv.rect(x0 - 2, h - 4, 14, 4, C.greyLo);
    };
    post(4); post(w - 14);
    const bh = 34;
    cv.rect(0, 0, w, bh, C.ink);
    if (style === 'goal') {
        for (let y = 2; y < bh - 2; y++) for (let x = 2; x < w - 2; x++) cv.set(x, y, (((x >> 3) + (y >> 3)) & 1) ? C.white : C.ink);
        cv.rect(36, 4, w - 72, bh - 8, C.red); cv.rect(37, 5, w - 74, bh - 10, C.redMid);
        const x = Math.round(w / 2 - cv.textW(text, F.Display, 3) / 2);
        cv.text(text, x + 3, 8, F.Display, C.redLo, 3); cv.text(text, x, 5, F.Display, C.yellow, 3);
    } else if (style === 'start') {
        cv.rect(2, 2, w - 4, bh - 4, C.navy);
        cv.text(text, 12, 11, F.Display, C.white, 2);
    } else {
        cv.rect(2, 2, w - 4, bh - 4, C.yellow); cv.rect(4, 4, w - 8, bh - 8, C.navy);
        const x = Math.round(w / 2 - cv.textW(text, F.Display, 2) / 2);
        cv.text(text, x + 2, 11, F.Display, C.violet, 2); cv.text(text, x, 9, F.Display, C.yellow, 2);
    }
    return cv;
}

// the START gantry with its lamps: lit = 0..3 red, 4 = green
function gantry(lit) {
    const cv = arch('START', 'start');
    for (let k = 0; k < 4; k++) {
        const x = 112 + k * 28, y = 17;
        const on = lit === 4 ? (k === 3) : k < lit;
        const green = lit === 4;
        cv.disc(x, y, 12.5, C.ink);
        cv.disc(x, y, 11, on ? (green ? C.tachG : C.tailOn) : (k === 3 ? C.tachGLo : C.redLo));
        if (on) { cv.disc(x - 2, y - 2, 5.5, green ? C.lime : C.tailCore); cv.disc(x - 4, y - 4, 1.5, C.white); }
    }
    return cv;
}

function forkSign() {
    const w = 132, h = 64, cv = new Canvas(w, h);
    for (const px of [14, 60, 72, 116]) { cv.rect(px, 34, 3, 30, C.greyLo); cv.rect(px, 34, 1, 30, C.grey); }
    const board = (x0, label1, label2, right) => {
        cv.rect(x0, 0, 62, 36, C.white); cv.rect(x0 + 1, 1, 60, 34, C.grn); cv.rect(x0 + 2, 2, 58, 32, C.grnLo); cv.rect(x0 + 3, 3, 56, 30, C.grn);
        const tx = x0 + 31 - Math.round(cv.textW(label1, F.Arcade) / 2);
        cv.text(label1, tx, 16, F.Arcade, C.white); cv.text(label2, x0 + 31 - Math.round(cv.textW(label2, F.Arcade) / 2), 25, F.Arcade, C.white);
        // the big arrow
        const ax = x0 + 31, ay = 8, s = right ? 1 : -1;
        cv.rect(ax - 10, ay - 1, 20, 3, C.yellow);
        for (let t = 0; t < 5; t++) cv.rect(ax + s * (10 - t) - (s < 0 ? 0 : 0), ay - t + 0, 1, 1 + t * 2, C.yellow);
    };
    board(0, 'CANYON', 'RUN', false);
    board(70, 'VISTA', 'HILLS', true);
    return cv;
}

// ------------------------------------------------------------------ cars (all seen from behind)
// the hero: a red convertible, driver (dark hair) and passenger (blonde, hair flying). lean -2..2
function heroCar(lean, brake) {
    const W = 84, H = 42, CX = 42;
    const body = new Canvas(W, H);             // everything that leans (drawn at lean 0, then sheared)
    const sym = new Canvas(W, H);
    // --- symmetric body, left half drawn then mirrored
    // rear deck (the lit top surface)
    sym.poly([[12, 13], [CX, 13], [CX, 18], [7, 18]], C.red);
    sym.hline(12, CX, 13, C.redHi); sym.hline(10, CX, 14, C.redHi); sym.hline(14, 30, 15, C.redHi);
    // the tail panel
    sym.rect(6, 18, CX - 6, 10, C.red); sym.rect(6, 25, CX - 6, 3, C.redMid); sym.hline(7, CX, 18, C.redLo);
    // fender bulge
    sym.poly([[4, 19], [9, 14], [12, 14], [9, 29], [4, 29]], C.red); sym.line(5, 18, 9, 14, C.redHi); sym.line(4, 19, 4, 28, C.redLo);
    // taillight bar: two round lamps in a black lens
    const lamp = brake ? C.tailOn : C.tailOff;
    sym.rect(9, 19, 17, 6, C.ink);
    sym.disc(13.5, 22, 2.6, lamp); sym.disc(21, 22, 2.6, lamp);
    if (brake) { sym.disc(13.5, 21.5, 1.2, C.tailCore); sym.disc(21, 21.5, 1.2, C.tailCore); }
    else { sym.set(12, 21, C.redLo); sym.set(20, 21, C.redLo); }
    // bumper, valance, exhaust
    sym.rect(5, 28, CX - 5, 3, C.black); sym.hline(5, CX, 28, C.chrome); sym.hline(6, CX, 30, C.blackHi);
    sym.rect(9, 31, CX - 9, 2, C.ink);
    sym.ellipse(16, 31.5, 2.6, 1.6, C.chrome); sym.set(16, 31, C.ink); sym.set(17, 31, C.ink);
    // cockpit behind the deck: the interior, headrests
    sym.poly([[15, 9], [CX, 9], [CX, 13], [12, 13]], C.seat);
    sym.ellipse(27, 10, 6, 3.5, C.black); sym.hline(23, 31, 8, C.blackHi);
    // windshield frame and glass (ahead of the heads)
    sym.poly([[18, 2], [CX, 2], [CX, 9], [16, 9]], C.glass);
    sym.hline(18, CX, 1, C.chrome); sym.line(18, 1, 15, 9, C.chrome);
    sym.line(22, 3, 20, 7, C.skyLo);                                     // a reflection streak
    sym.symmetric();
    for (let i = 0; i < sym.px.length; i++) if (sym.px[i]) body.px[i] = sym.px[i];
    // plate
    body.rect(35, 20, 14, 6, C.ink); body.rect(36, 21, 12, 4, C.plate);
    body.text('87', 37, 21, F.Small, C.navy); body.rect(45, 22, 2, 1, C.red);
    // heads: driver left (dark hair), passenger right (blonde, flying hair)
    body.ellipse(27, 5, 4.6, 5, C.hair); body.set(22, 6, C.skin); body.set(32, 6, C.skin); body.hline(25, 29, 1, C.trunkLo);
    body.rect(25, 9, 5, 2, C.skin);
    body.ellipse(57, 5.5, 4.6, 5, C.blonde); body.rect(55, 9, 5, 2, C.skin);
    for (let k = 0; k < 6; k++) body.line(61, 3 + k, 64 + k * 1.2 + (k % 2), 4 + k * 1.3, k % 2 ? C.orange : C.blonde);
    body.set(55, 2, C.cream); body.set(56, 1, C.cream);
    body.outline(C.ink);

    const out = new Canvas(W, H);
    // shadow on the road, then the tyres (they do not lean), then the sheared body
    for (let y = 36; y < 42; y++) { const inset = Math.abs(y - 38.5) * 2.2; out.hline(3 + inset, W - 4 - inset, y, C.shadow); }
    const tyre = (x0) => {
        out.rect(x0, 22, 12, 16, C.tyre);
        for (let y = 23; y < 38; y += 3) out.hline(x0 + 1, x0 + 10, y, C.greyLo);
        out.hline(x0, x0 + 11, 37, C.ink);
    };
    tyre(2 - Math.max(0, lean)); tyre(W - 14 + Math.max(0, -lean));
    for (let y = 0; y < H; y++) {
        const sh = Math.round(lean * 1.6 * (1 - y / 30));             // the top leans into the turn
        for (let x = 0; x < W; x++) {
            const p = body.px[y * W + x];
            if (p === 0) continue;
            out.set(x + sh, y, p);
        }
    }
    // turning: the outer flank shows a strip of darker paint
    if (lean !== 0) {
        const s = lean > 0 ? -1 : 1, ax = lean > 0 ? 5 : W - 6;
        for (let y = 16; y < 29; y++) for (let k = 0; k < Math.abs(lean); k++) {
            const sh = Math.round(lean * 1.6 * (1 - y / 30));
            out.set(ax + sh + s * (k + 1), y, k === Math.abs(lean) - 1 ? C.ink : C.redLo);
        }
    }
    return out;
}

// rotate a sprite about its centre (the crash tumble): nearest neighbour into a square canvas
function rotated(src, ang, size) {
    const cv = new Canvas(size, size);
    const c = Math.cos(ang), s = Math.sin(ang), cx = src.w / 2, cy = src.h / 2, h = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - h, dy = y + 0.5 - h;
        const sx = Math.floor(c * dx + s * dy + cx), sy = Math.floor(-s * dx + c * dy + cy);
        const p = src.get(sx, sy);
        if (p) cv.px[y * size + x] = p;
    }
    return cv;
}

function heroNoShadow() {
    const cv = heroCar(0, false);
    const sh = P('shadow');
    for (let i = 0; i < cv.px.length; i++) if (cv.px[i] === sh) cv.px[i] = 0;
    return cv;
}

// traffic: paint = [hi, body, lo]
function sedan(paint) {
    const [hi, bd, lo] = paint.map(P);
    const W = 60, H = 38, cv = new Canvas(W, H);
    for (let y = 33; y < 38; y++) { const i = Math.abs(y - 35) * 2; cv.hline(2 + i, W - 3 - i, y, C.shadow); }
    const s = new Canvas(W, H);
    s.poly([[13, 1], [30, 1], [30, 5], [11, 5]], lo);                         // roof
    s.poly([[11, 5], [30, 5], [30, 13], [8, 13]], C.glass); s.line(13, 6, 11, 11, C.skyLo); s.hline(11, 30, 5, lo);
    s.poly([[8, 13], [30, 13], [30, 17], [5, 17]], hi);                       // trunk lid
    s.rect(4, 17, 26, 10, bd); s.hline(4, 30, 17, lo); s.rect(3, 18, 2, 9, lo);
    s.rect(5, 19, 9, 4, C.ink); s.rect(6, 20, 7, 2, C.tailOn); s.set(6, 20, C.tailCore);
    s.rect(4, 26, 26, 3, C.black); s.hline(4, 30, 26, C.chrome);
    s.symmetric();
    s.rect(24, 20, 12, 5, C.ink); s.rect(25, 21, 10, 3, C.plate);
    cv.rect(2, 22, 9, 13, C.tyre); cv.rect(W - 11, 22, 9, 13, C.tyre);
    for (let i = 0; i < s.px.length; i++) if (s.px[i]) cv.px[i] = s.px[i];
    return cv.outline(C.ink);
}

function compact(paint) {
    const [hi, bd, lo] = paint.map(P);
    const W = 52, H = 36, cv = new Canvas(W, H);
    for (let y = 31; y < 36; y++) { const i = Math.abs(y - 33) * 2; cv.hline(3 + i, W - 4 - i, y, C.shadow); }
    cv.rect(3, 20, 8, 13, C.tyre); cv.rect(W - 11, 20, 8, 13, C.tyre);
    const s = new Canvas(W, H);
    s.ellipse(26, 17, 22, 16, bd);
    s.ellipse(26, 12, 17, 11, hi);
    s.ellipse(26, 9, 10, 5.5, C.glass); s.line(20, 7, 18, 10, C.skyLo);
    s.rect(4, 26, 44, 3, C.black); s.hline(4, 47, 26, C.chrome);
    s.disc(10, 21, 2.6, C.tailOn); s.set(9, 20, C.tailCore);
    s.rect(4, 29, 44, 3, 0);
    s.symmetric();
    s.rect(20, 20, 12, 5, C.ink); s.rect(21, 21, 10, 3, C.plate);
    for (let i = 0; i < s.px.length; i++) if (s.px[i]) cv.px[i] = s.px[i];
    for (let y = 30; y < 32; y++) for (let x = 0; x < W; x++) if (cv.get(x, y) === bd || cv.get(x, y) === hi) cv.set(x, y, 0);
    return cv.outline(C.ink);
}

function van(paint) {
    const [hi, bd, lo] = paint.map(P);
    const W = 58, H = 48, cv = new Canvas(W, H);
    for (let y = 43; y < 48; y++) { const i = Math.abs(y - 45) * 2; cv.hline(2 + i, W - 3 - i, y, C.shadow); }
    cv.rect(3, 32, 9, 13, C.tyre); cv.rect(W - 12, 32, 9, 13, C.tyre);
    const s = new Canvas(W, H);
    s.poly([[6, 2], [29, 1], [29, 38], [4, 38], [4, 6]], bd);
    s.hline(6, 29, 1, hi); s.hline(5, 29, 2, hi);
    s.rect(8, 6, 21, 12, C.glass); s.line(10, 7, 8, 12, C.skyLo);
    s.rect(4, 20, 2, 18, lo);
    s.rect(6, 22, 4, 10, C.ink); s.rect(7, 23, 2, 8, C.tailOn); s.set(7, 23, C.tailCore);
    s.rect(4, 36, 26, 4, C.black); s.hline(4, 29, 36, C.chrome);
    s.symmetric();
    s.rect(28, 6, 2, 30, lo); s.rect(22, 25, 3, 2, C.chrome); s.rect(33, 25, 3, 2, C.chrome);
    s.rect(23, 30, 12, 5, C.ink); s.rect(24, 31, 10, 3, C.plate);
    for (let i = 0; i < s.px.length; i++) if (s.px[i]) cv.px[i] = s.px[i];
    return cv.outline(C.ink);
}

function truck(paint, stripe) {
    const [hi, bd, lo] = paint.map(P), st = P(stripe);
    const W = 66, H = 70, cv = new Canvas(W, H);
    for (let y = 65; y < 70; y++) { const i = Math.abs(y - 67) * 2; cv.hline(2 + i, W - 3 - i, y, C.shadow); }
    for (const x0 of [3, 12, W - 21, W - 12]) cv.rect(x0, 52, 8, 15, C.tyre);
    const s = new Canvas(W, H);
    s.rect(2, 0, 31, 52, bd); s.hline(2, 33, 0, hi); s.rect(2, 1, 31, 2, hi);
    for (let y = 8; y < 50; y += 8) s.hline(3, 33, y, lo);
    s.rect(2, 18, 31, 7, st); s.hline(2, 33, 18, C.white);
    s.rect(2, 0, 2, 52, lo);
    s.rect(4, 52, 29, 4, C.black); s.hline(4, 33, 52, C.chrome);
    s.rect(6, 53, 5, 3, C.tailOn); s.set(6, 53, C.tailCore); s.rect(12, 53, 3, 3, C.orange);
    s.rect(3, 57, 6, 8, C.ink);                                             // mud flap
    s.symmetric();
    s.rect(32, 1, 2, 51, lo);
    for (const y of [12, 40]) { s.rect(27, y, 3, 5, C.chrome); s.rect(36, y, 3, 5, C.chrome); }
    s.rect(26, 57, 14, 5, C.ink); s.rect(27, 58, 12, 3, C.plate);
    for (let i = 0; i < s.px.length; i++) if (s.px[i]) cv.px[i] = s.px[i];
    return cv.outline(C.ink);
}

// ------------------------------------------------------------------ sky dressing
function cloud(seed, w, h, dusk) {
    const cv = new Canvas(w, h);
    const lo = dusk ? C.cloudDusk : C.cloudLo, mid = dusk ? C.cloudDusk : C.cloud, hi = dusk ? C.cloudDuskHi : C.cloudHi;
    const n = Math.max(3, Math.round(w / 12));
    for (let k = 0; k < n; k++) {
        const cx = 6 + (k + 0.5) / n * (w - 12) + (h01(seed, k) - 0.5) * 8;
        const rx = w / n * (0.8 + h01(seed, 10 + k) * 0.7), ry = h * (0.28 + h01(seed, 20 + k) * 0.22);
        const cy = h - ry - 1 - h01(seed, 30 + k) * (h * 0.3);
        cv.ellipse(cx, cy, rx, ry, lo);
    }
    // lit from below by the low sun: the lower edge of every column glows
    for (let x = 0; x < w; x++) {
        let bot = -1;
        for (let y = h - 1; y >= 0; y--) if (cv.get(x, y)) { bot = y; break; }
        if (bot < 0) continue;
        cv.set(x, bot, hi); if (cv.get(x, bot - 1)) cv.set(x, bot - 1, h01(seed, 99 + x) < 0.6 ? hi : mid);
        for (let y = bot - 2; y >= bot - 3; y--) if (cv.get(x, y)) cv.set(x, y, mid);
    }
    return cv;
}

// a sunset cumulus bank: lumpy top, flat base, the base and the sunward lumps lit hot
function bank(seed, w, h, dusk) {
    const cv = new Canvas(w, h);
    const lo = dusk ? C.cloudDusk : C.cloudLo, mid = dusk ? C.cloudDuskHi : C.cloud, hi = dusk ? C.cloudDuskHi : C.cloudHi;
    const n = Math.round(w / 9);
    for (let k = 0; k < n; k++) {
        const cx = 8 + (k + 0.5) / n * (w - 16) + (h01(seed, k) - 0.5) * 6;
        const bell = Math.sin(Math.PI * (k + 0.5) / n);
        const ry = (h - 3) * (0.35 + 0.65 * bell) * (0.7 + h01(seed, 30 + k) * 0.3), rx = ry * (1.1 + h01(seed, 60 + k) * 0.6);
        cv.ellipse(cx, h - 3 - ry * 0.55, rx, ry, lo);
    }
    for (let x = 0; x < w; x++) for (let y = h - 3; y < h; y++) cv.set(x, y, 0);   // a flat base
    for (let x = 0; x < w; x++) {
        let top = -1, bot = -1;
        for (let y = 0; y < h; y++) if (cv.get(x, y)) { if (top < 0) top = y; bot = y; }
        if (bot < 0) continue;
        // the underside glows; the tops catch a rim
        cv.set(x, bot, hi); cv.set(x, bot - 1, hi);
        for (let y = bot - 2; y >= bot - 4 && y >= top; y--) cv.set(x, y, h01(seed + x, y) < 0.7 ? mid : hi);
        cv.set(x, top, mid);
    }
    return cv;
}

function bird(frame) {
    const cv = new Canvas(7, 4);
    if (frame === 0) { cv.set(0, 0, C.ink); cv.set(1, 1, C.ink); cv.set(2, 2, C.ink); cv.set(3, 2, C.ink); cv.set(4, 2, C.ink); cv.set(5, 1, C.ink); cv.set(6, 0, C.ink); }
    else { cv.set(0, 3, C.ink); cv.set(1, 2, C.ink); cv.set(2, 1, C.ink); cv.set(3, 2, C.ink); cv.set(4, 1, C.ink); cv.set(5, 2, C.ink); cv.set(6, 3, C.ink); }
    return cv;
}

// ------------------------------------------------------------------ the registry
function kind(name, spr, upx, collUnits = 0, extra = {}) {
    return Object.assign({ name, spr, upx, coll: collUnits / ROAD_W }, extra);
}

function buildArt() {
    const K = [];
    const add = (k) => { k.id = K.length; K.push(k); return k; };
    const kinds = {};
    const def = (name, spr, upx, coll, extra) => { kinds[name] = add(kind(name, spr, upx, coll, extra)); };

    def('palm', palm(11, 7, 0.7), 34, 170);
    def('palm2', palm(23, -8, 0.9), 32, 170);
    def('palm3', palm(37, 3, 1.1), 30, 170);
    def('cypress', cypress(5), 34, 190);
    def('bush', bush(3), 22, 0);
    def('cactus', cactus(), 26, 150);
    def('rock', boulder(8, C.rockHi, C.rock, C.rockLo, C.rockDk), 24, 440);
    def('rock2', boulder(19, C.rockHi, C.rock, C.rockLo, C.rockDk, 36, 26), 24, 330);
    def('spire', spire(4), 34, 500);
    def('stone', boulder(31, C.stoneHi, C.stone, C.stoneLo, C.greyLo, 40, 24), 22, 360);
    def('hut', hut(), 30, 800);
    def('tower', tower(), 30, 560);
    for (let i = 0; i < BOARDS.length; i++) def('board' + i, BOARDS[i](), 26, 900);
    def('chevR', chevron(true), 24, 250);
    def('chevL', chevron(false), 24, 250);
    def('lamp', lamp(), 30, 90, { anchorX: 4 / 30 });
    def('lampL', lamp().mirrorX(), 30, 90, { anchorX: 26 / 30 });
    def('motel', motel(), 30, 300);
    def('house', house(), 34, 1000);
    def('flag', flag(), 24, 60, { anchorX: 3 / 22 });
    def('cp', arch('CHECKPOINT', 'cp'), 4060 / 224, 0);
    def('goal', arch('GOAL', 'goal'), 4060 / 224, 0);
    for (let lit = 0; lit <= 4; lit++) def('gantry' + lit, gantry(lit), 4060 / 224, 0);
    def('fork', forkSign(), 15, 700);
    def('post', null, 1, 150);                     // an invisible arch post (it only collides)

    const paints = {
        blue: ['blueHi', 'blue', 'blueLo'], white: ['whiteCar', 'whiteCar', 'whiteCarLo'], yel: ['yelHi', 'yel', 'yelLo'],
        grn: ['grnHi', 'grn', 'grnLo'], black: ['blackHi', 'black', 'ink'], tan: ['cream', 'tan', 'tanLo'],
        sky: ['white', 'sky', 'skyLo'], pink: ['cream', 'pink', 'magenta'], teal: ['sky', 'teal', 'tealLo'], orange: ['yelHi', 'orange', 'trunk'],
    };
    const CARS = [];
    const car = (name, spr, upx, speedLo, speedHi) => { const k = kind(name, spr, upx, spr.w * upx / 2 * 0.78); k.speedLo = speedLo; k.speedHi = speedHi; k.id = CARS.length; CARS.push(k); };
    for (const p of ['blue', 'white', 'yel', 'grn', 'black', 'tan']) car('sedan-' + p, sedan(paints[p]), 10, 0.42, 0.58);
    for (const p of ['sky', 'pink', 'yel', 'grn']) car('compact-' + p, compact(paints[p]), 10, 0.40, 0.54);
    for (const p of ['white', 'teal', 'orange']) car('van-' + p, van(paints[p]), 10.5, 0.36, 0.48);
    car('truck-white', truck(paints.white, 'red'), 11, 0.30, 0.42);
    car('truck-yel', truck(paints.yel, 'navy'), 11, 0.30, 0.42);
    car('truck-teal', truck(['whiteCar', 'whiteCarLo', 'whiteCarDk'], 'teal'), 11, 0.30, 0.42);

    const hero = [];
    for (let lean = -2; lean <= 2; lean++) hero.push([heroCar(lean, false), heroCar(lean, true)]);
    const base = heroNoShadow();
    const tumble = [];
    for (let k = 0; k < 12; k++) tumble.push(rotated(base, k * Math.PI * 2 / 12, 92));

    const clouds = [cloud(1, 96, 12, false), cloud(2, 70, 10, false), cloud(3, 120, 14, false), cloud(4, 54, 8, false),
        bank(5, 150, 24, false), bank(6, 110, 20, false), bank(7, 180, 28, false)];
    const dusk = [cloud(1, 96, 12, true), cloud(2, 70, 10, true), cloud(3, 120, 14, true), cloud(4, 54, 8, true),
        bank(5, 150, 24, true), bank(6, 110, 20, true), bank(7, 180, 28, true)];
    return { K, kinds, CARS, hero, tumble, clouds, duskClouds: dusk, birds: [bird(0), bird(1)] };
}

export const Art = buildArt();
export const KIND = Art.kinds;
