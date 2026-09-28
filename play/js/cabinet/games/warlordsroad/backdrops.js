// THE NODE · world 1 · WARLORD'S ROAD · THE BACKDROPS: three painted stages in parallax layers.
//
// Each stage is five layers, painted once (on first use) into palette-index canvases:
//   sky   static, 304 wide: the banded, dithered dusk (or night) with its sun or moon and clouds
//   far   x 0.12: the far range (the Warlord's castle on its peak, far off, the whole way)
//   mid   x 0.4:  hills, woods, smoke, the castle's towers
//   near  x 1.0:  the back row (houses, trees, the castle wall) and the road itself
//   fore  x 1.3:  a few posts and ferns in front of everyone
// plus world-x spots where the renderer lights animated flames (windows, torches, braziers).
// Screen rows: the view is y 8..203; the road (feet) runs y 140..198.
import { C } from './palette.js';
import { CLEAR } from './raster.js';
import { Cv, hash, noise1 } from './paint.js';
import { Stages } from './stages.js';

export const VIEW_X = 8, VIEW_Y = 8, VIEW_W = 304, VIEW_H = 196;
export const GROUND_Y = 130;                      // screen row where the road's back edge sits

function layer(y, w, h, f) { return { y, f, cv: new Cv(w, h) }; }
const widthFor = (len, f) => Math.ceil((len - VIEW_W) * f) + VIEW_W + 4;

// ------------------------------------------------------------------ shared pieces
function clouds(cv, list) {
    for (const [cx, cy, len, th, top, mid, rim] of list) {
        for (let j = -th; j <= th; j++) {
            const v = j / (th + 0.5), hw = len * Math.sqrt(Math.max(0, 1 - v * v)) * (1 - 0.15 * Math.abs(v));
            const c = j < -th + 1 ? top : j > th - 2 ? rim : mid;
            const wob = Math.round(noise1((cy + j) * 0.7, cx) * 6);
            cv.rect(Math.round(cx - hw + wob), cy + j, Math.round(hw * 2), 1, c);
        }
    }
}

function striped_sun(cv, cx, cy, r, core, rim, gap) {
    for (let j = -r; j <= r; j++) {
        const hw = Math.round(Math.sqrt(r * r - j * j));
        if (j > 1 && (j % 5 === 0 || j % 5 === 1 + (j > r / 2 ? 1 : 0))) continue;   // the stripes
        cv.rect(cx - hw, cy + j, hw * 2 + 1, 1, Math.abs(j) > r - 3 || hw > r - 2 ? rim : core);
    }
    if (gap !== undefined) for (let j = 2; j <= r; j++) if (j % 5 === 0) cv.rect(cx - r, cy + j, r * 2 + 1, 1, gap);
}

function ridge(cv, top, amp, scale, salt, c, rim, base = cv.h) {
    for (let u = 0; u < cv.w; u++) {
        const h = top + amp * (noise1(u / scale, salt) * 0.7 + noise1(u / (scale * 0.37), salt + 7) * 0.3);
        const y = Math.round(h);
        cv.vline(u, y, base - 1, c);
        if (rim !== undefined) {
            const hl = top + amp * (noise1((u - 1) / scale, salt) * 0.7 + noise1((u - 1) / (scale * 0.37), salt + 7) * 0.3);
            if (hl > h + 0.15) cv.px(u, y, rim);
        }
    }
}

function smoke(cv, x, y0, height, salt) {
    for (let j = 0; j < height; j++) {
        const y = y0 - j, t = j / height;
        const cx = x + Math.round(Math.sin(j * 0.09 + salt) * 3 + t * t * 26);
        const w = Math.round(3 + t * 11);
        for (let i = -w; i <= w; i++) {
            const edge = Math.abs(i) / (w + 1);
            const lvl = (1 - t) * 13 - edge * 7 + 3;
            if (hash(cx + i, y, salt) * 16 < lvl) cv.px(cx + i, y, j < height * 0.3 ? C.stoneLo : t > 0.75 ? C.sky5 : C.stoneDk);
        }
    }
}

// the road: dirt, verge, ruts, stones (rows from gy to the bottom of the layer)
function road(cv, gy, style) {
    const w = cv.w, h = cv.h;
    const base = style === 'flag' ? C.stone : style === 'forest' ? C.dirtLo : C.dirt, lo = style === 'flag' ? C.stoneLo : style === 'forest' ? C.dirtDk : C.dirtLo, dk = style === 'flag' ? C.stoneDk : style === 'forest' ? C.ink : C.dirtDk, hi = style === 'flag' ? C.stoneHi : style === 'forest' ? C.dirt : C.dirtHi;
    cv.rect(0, gy, w, h - gy, base);
    if (style === 'flag') {
        // flagstones: rows that widen toward the viewer
        let y = gy, row = 0;
        while (y < h) {
            const rh = 7 + row * 2;
            const off = (row * 17) % 40;
            const bw = 26 + row * 7;
            for (let x = -off; x < w; x += bw) {
                const shade = hash(x, row, 5);
                cv.rect(x + 1, y + 1, bw - 2, rh - 2, shade < 0.3 ? lo : shade > 0.85 ? hi : base);
                cv.hline(x + 1, x + bw - 2, y + 1, hi);
                if (shade > 0.6 && shade < 0.7) cv.line(x + 5, y + 2, x + 11, y + rh - 3, dk);
                if (hash(x, row, 9) < 0.18) { cv.px(x + 3, y + rh - 2, C.greenLo); cv.px(x + 4, y + rh - 2, C.greenDk); }
            }
            cv.rect(0, y, w, 1, dk);
            for (let x = -off; x < w; x += bw) cv.vline(x, y, y + rh - 1, dk);
            y += rh; row++;
        }
        cv.rect(0, gy, w, 2, C.stoneDk);
        return;
    }
    const forest = style === 'forest';
    // big patches: the road is not one colour
    for (let j = gy; j < h; j++) for (let i = 0; i < w; i++) {
        const q = (j - gy) / (h - gy);
        const n = noise1(i / 37 + j * 0.05, 61) * 0.6 + noise1(i / 11 - j * 0.13, 62) * 0.4;
        let c = base;
        if (n < 0.32) c = lo; else if (n > 0.74 && !forest) c = hi;
        if (forest && n > 0.72) c = C.leatherLo;
        if (forest && n < 0.2) c = C.greenDk;
        const r = hash(i, j, 11);
        if (r < 0.06) c = c === lo ? dk : lo;
        else if (r > 0.97) c = c === hi ? base : hi;
        // the far edge is in shadow
        if (q < 0.12 && BAYER4(i, j) < (0.12 - q) * 130) c = dk;
        cv.px(i, j, c);
    }
    // cart ruts: double grooves with a lit lip
    for (const ry of [gy + 20, gy + 29, gy + 49, gy + 57]) {
        for (let i = 0; i < w; i++) {
            if (hash(i >> 4, ry, 3) > 0.82) continue;
            const y = ry + Math.round(Math.sin(i * 0.011 + ry) * 2);
            cv.px(i, y, dk); cv.px(i, y + 1, dk); cv.px(i, y - 1, lo); cv.px(i, y + 2, hi);
        }
    }
    // puddles that hold the sky
    if (!forest) for (let k = 0; k < w / 260; k++) {
        const px = Math.floor(hash(k, 7, 63) * w), py = gy + 14 + Math.floor(hash(k, 8, 63) * 44);
        const rx = 9 + Math.floor(hash(k, 9, 63) * 12), ry = 2 + Math.floor(hash(k, 10, 63) * 2);
        cv.ellipse(px, py, rx + 1, ry + 1, dk);
        cv.ellipse(px, py, rx, ry, C.sky6);
        cv.hline(px - rx + 3, px + rx - 5, py - ry + 1, C.sky5);
        cv.hline(px - 2, px + 3, py, C.sky3);
    }
    // stones, bigger toward the viewer
    for (let k = 0; k < w / 8; k++) {
        const x = Math.floor(hash(k, 1, 21) * w), yy = gy + 6 + Math.floor(hash(k, 2, 21) * (h - gy - 8));
        const s = 1 + (yy - gy) / (h - gy) * 2.4;
        const rx = s * (1 + hash(k, 3, 21)), ry = s * 0.6;
        cv.ellipse(x, yy, rx + 0.6, ry + 0.6, dk);
        cv.ellipse(x, yy, rx, ry, C.stoneLo);
        cv.ellipse(x - 0.3, yy - 0.4, rx * 0.75, ry * 0.6, C.stone);
        cv.px(x - Math.round(rx * 0.4), yy - Math.round(ry * 0.5), C.stoneHi);
    }
    // tufts of grass in the road
    for (let k = 0; k < w / 22; k++) {
        const x = Math.floor(hash(k, 4, 22) * w), y = gy + 10 + Math.floor(hash(k, 5, 22) * (h - gy - 12));
        const n = 3 + Math.floor(hash(k, 6, 22) * 4), tall = 2 + (y - gy) / 16;
        for (let g = 0; g < n; g++) cv.line(x + g * 2 - n, y, x + g * 2 - n + (g - n / 2) * 0.6, y - tall - (g & 1) * 2, g & 1 ? C.greenLo : C.greenDk);
    }
    // the back edge: contact shadow
    cv.rect(0, gy, w, 1, dk);
}

function BAYER4(i, j) { return [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(j & 3) * 4 + (i & 3)]; }

// village litter: planks, a broken wheel, arrows in the dirt, embers
function litter(cv, gy, salt) {
    for (let k = 0; k < cv.w / 70; k++) {
        const x = Math.floor(hash(k, 0, salt) * cv.w), y = gy + 14 + Math.floor(hash(k, 1, salt) * 50), kind = Math.floor(hash(k, 2, salt) * 4);
        if (kind === 0) {                 // a charred plank
            const L = 12 + Math.floor(hash(k, 3, salt) * 10), sl = hash(k, 4, salt) < 0.5 ? 0.2 : -0.2;
            for (let i = 0; i < L; i++) { cv.px(x + i, y + Math.round(i * sl), C.leatherLo); cv.px(x + i, y + 1 + Math.round(i * sl), C.dirtDk); if (i > L - 5) cv.px(x + i, y + Math.round(i * sl), C.ink); }
            cv.px(x + L - 2, y - 1 + Math.round((L - 2) * sl), C.fireLo);
        } else if (kind === 1) {          // a broken cart wheel, flat on the ground
            cv.ellipse(x, y, 9, 3, C.leatherLo); cv.ellipse(x, y, 7, 2, CLEAR === 255 ? C.dirt : C.dirt);
            cv.ellipse(x, y, 7, 2, C.dirtLo);
            for (let a = 0; a < 6; a++) cv.line(x, y, x + Math.round(Math.cos(a) * 7), y + Math.round(Math.sin(a) * 2), C.leather);
            cv.ellipse(x, y, 1.5, 1, C.leatherHi);
        } else if (kind === 2) {          // arrows stuck in the dirt
            for (let q = 0; q < 3; q++) { const ax = x + q * 5, ay = y + (q & 1) * 2; cv.line(ax, ay, ax + 3, ay - 7, C.leather); cv.px(ax + 3, ay - 7, C.white); cv.px(ax + 2, ay - 7, C.red); }
        } else {                          // a dropped shield
            cv.ellipse(x, y, 6, 2.5, C.steelDk); cv.ellipse(x, y - 0.5, 5, 2, C.redLo); cv.ellipse(x, y - 0.6, 1.2, 0.7, C.gold);
        }
    }
}

// a ragged verge of grass along the back edge
function verge(cv, gy, c1, c2, c3) {
    for (let i = 0; i < cv.w; i++) {
        const t = Math.round(3 + noise1(i / 5, 4) * 5 + (hash(i, 0, 8) < 0.2 ? 3 : 0));
        cv.vline(i, gy - t, gy + 2, c2);
        cv.px(i, gy - t, hash(i, 1, 8) < 0.5 ? c1 : c2);
        if (hash(i, 2, 8) < 0.35) cv.px(i, gy + 3, c3);
    }
}

// ------------------------------------------------------------------ STAGE 1: THE BURNED VILLAGE
function house(cv, x, w, gy, salt, fires, slate = false, stoneWall = false) {
    const top = gy - 50 - Math.floor(hash(salt, 0, 1) * 10), roofH = 30;
    const wallTop = top, roofTop = top - roofH;
    // foundation
    for (let y = gy - 12; y < gy; y += 4) for (let bx = x + ((y >> 2) & 1) * 4; bx < x + w; bx += 8) {
        cv.rect(bx, y, 7, 3, hash(bx, y, salt) < 0.4 ? C.stoneLo : C.stone);
        cv.hline(bx, bx + 6, y, C.stoneHi);
    }
    cv.rect(x, gy - 13, w, 1, C.stoneDk);
    // plaster wall with timber frame (or rough stone)
    cv.rect(x, wallTop, w, gy - 13 - wallTop, stoneWall ? C.stoneLo : C.fur);
    for (let j = wallTop; j < gy - 13; j++) for (let i = x; i < x + w; i++) {
        const r = hash(i, j, salt + 3);
        if (stoneWall) {
            const row = Math.floor((j - wallTop) / 6), off = (row & 1) * 5;
            const edge = (j - wallTop) % 6 === 0 || (i + off - x) % 10 === 0;
            cv.px(i, j, edge ? C.stoneDk : r < 0.35 ? C.stone : r > 0.9 ? C.stoneHi : C.stoneLo);
        } else if (r < 0.08) cv.px(i, j, C.furLo);
        else if (r > 0.94) cv.px(i, j, C.furHi);
    }
    // soot creeping down from the top
    for (let i = x; i < x + w; i++) {
        const sd = Math.round(6 + noise1(i / 6, salt) * 14);
        for (let j = 0; j < sd; j++) if (hash(i, j, salt + 9) * sd > j * 0.9) cv.px(i, wallTop + j, j < sd * 0.4 ? C.ink : C.dirtDk);
    }
    const beam = (x0, y0, x1, y1) => { cv.line(x0, y0, x1, y1, C.leatherLo); cv.line(x0 + 1, y0, x1 + 1, y1, C.leatherLo); cv.line(x0 + 2, y0, x1 + 2, y1, C.dirtDk); };
    if (!stoneWall) {
        for (let bx = x; bx <= x + w - 3; bx += Math.max(18, Math.floor(w / 4))) beam(bx, wallTop, bx, gy - 14);
        beam(x + w - 3, wallTop, x + w - 3, gy - 14);
        cv.rect(x, wallTop + 18, w, 3, C.leatherLo); cv.hline(x, x + w - 1, wallTop + 18, C.leather);
        cv.rect(x, gy - 16, w, 3, C.leatherLo);
        for (let bx = x + 4; bx < x + w - 20; bx += Math.max(36, Math.floor(w / 2))) { beam(bx, wallTop + 20, bx + 14, gy - 16); beam(bx + 14, wallTop + 20, bx, gy - 16); }
    }
    // windows and a door
    const nwin = Math.max(1, Math.floor(w / 42));
    for (let k = 0; k < nwin; k++) {
        const wx = x + 10 + Math.floor((w - 30) * (k + 0.5) / nwin), wy = wallTop + 26;
        cv.rect(wx - 1, wy - 1, 14, 13, C.leatherLo);
        cv.rect(wx, wy, 12, 11, C.ink);
        const lit = hash(k, salt, 4) < 0.6;
        if (lit) { cv.rect(wx + 1, wy + 4, 10, 7, C.fireLo); cv.rect(wx + 3, wy + 7, 6, 4, C.fire); fires.push([wx + 6, wy + 10, 0]); }
        cv.vline(wx + 6, wy, wy + 10, C.leatherLo); cv.hline(wx, wx + 11, wy + 5, C.leatherLo);
    }
    const dx = x + w - 26;
    cv.rect(dx - 1, gy - 36, 14, 23, C.leatherLo);
    cv.rect(dx, gy - 35, 12, 22, C.ink);
    cv.ellipse(dx + 6, gy - 35, 6, 3, C.ink);
    if (hash(salt, 2, 2) < 0.5) { cv.rect(dx + 1, gy - 22, 10, 8, C.fireLo); fires.push([dx + 6, gy - 14, 1]); }
    // the roof: thatch, burned through in places
    const pts = [[x - 6, wallTop + 1], [x + 8, roofTop], [x + w - 8, roofTop], [x + w + 6, wallTop + 1]];
    const mark = slate ? C.steelDk : C.goldLo;
    cv.poly(pts, mark);
    for (let j = roofTop; j <= wallTop; j++) for (let i = x - 6; i < x + w + 6; i++) {
        if (cv.get(i, j) !== mark) continue;
        const r = hash(i, j >> 1, salt + 5);
        if (slate) {
            const row = Math.floor((j - roofTop) / 4), off = (row & 1) * 3;
            const edge = (j - roofTop) % 4 === 3 || (i + off) % 7 === 0;
            cv.px(i, j, edge ? C.ink : r < 0.3 ? C.steelLo : r > 0.9 ? C.steel : C.steelDk);
        } else cv.px(i, j, ((i + (j >> 1)) % 5 === 0) ? C.dirtLo : r < 0.2 ? C.gold : r > 0.85 ? C.dirtLo : C.goldLo);
    }
    cv.hline(x - 6, x + w + 5, wallTop, C.dirtDk); cv.hline(x - 5, x + w + 4, wallTop + 1, C.ink);
    // burned holes, rafters showing
    const holes = 1 + Math.floor(hash(salt, 7, 1) * 2);
    for (let k = 0; k < holes; k++) {
        const hx = x + 12 + Math.floor(hash(salt, k, 12) * (w - 30)), hw = 14 + Math.floor(hash(k, salt, 13) * 16);
        const hy = roofTop + 2, hh = 12 + Math.floor(hash(k, salt, 14) * 10);
        for (let j = 0; j < hh; j++) {
            const ww = Math.round(hw * (1 - Math.pow(j / hh - 0.2, 2)) * (0.8 + 0.4 * noise1(j * 0.6, salt + k)));
            const cx = hx + Math.round(Math.sin(j * 0.4 + k) * 2);
            cv.rect(cx - (ww >> 1), hy + j, ww, 1, CLEAR);
            cv.px(cx - (ww >> 1) - 1, hy + j, C.ink); cv.px(cx + ww - (ww >> 1), hy + j, C.ink);
            if (j > 0) { cv.px(cx - (ww >> 1) - 2, hy + j, C.fireLo); }
        }
        for (let r = hx - (hw >> 1); r < hx + (hw >> 1); r += 6) cv.line(r, hy, r + 3, hy + hh - 1, C.ink);
        fires.push([hx, hy + hh - 2, 2]);
    }
    // chimney
    const chx = x + Math.floor(w * 0.7);
    cv.rect(chx, roofTop - 10, 8, 16, C.stoneLo); cv.rect(chx + 1, roofTop - 10, 3, 16, C.stone); cv.hline(chx - 1, chx + 8, roofTop - 11, C.stoneHi);
}

function ruin(cv, x, w, gy, salt, fires) {
    for (let y = gy - 12; y < gy; y += 4) for (let bx = x + ((y >> 2) & 1) * 4; bx < x + w; bx += 8) {
        if (y < gy - 8 && hash(bx, y, salt) < 0.35) continue;
        cv.rect(bx, y, 7, 3, hash(bx, y, salt + 1) < 0.5 ? C.stoneLo : C.stone); cv.hline(bx, bx + 6, y, C.stoneHi);
    }
    // what is left of the frame: charred posts and a fallen beam
    for (const [px, ph] of [[x + 4, 58], [Math.round(x + w * 0.45), 40], [x + w - 8, 64]]) {
        cv.rect(px, gy - 12 - ph, 4, ph, C.ink); cv.vline(px + 1, gy - 12 - ph, gy - 13, C.dirtDk);
        for (let j = 0; j < ph; j += 5) if (hash(px, j, salt) < 0.3) cv.px(px + 3, gy - 12 - ph + j, C.fireLo);
    }
    cv.line(x + 4, gy - 68, x + w - 6, gy - 24, C.ink); cv.line(x + 4, gy - 67, x + w - 6, gy - 23, C.dirtDk); cv.line(x + 4, gy - 66, x + w - 6, gy - 22, C.ink);
    // a heap of ash with the fire still in it
    for (let j = 0; j < 10; j++) { const hw = Math.round((w * 0.4) * (1 - j / 10)); cv.hline(x + w / 2 - hw, x + w / 2 + hw, gy - 1 - j, j < 3 ? C.dirtDk : j < 7 ? C.stoneDk : C.ink); }
    for (let k = 0; k < 14; k++) cv.px(x + w / 2 + (hash(k, 0, salt) - 0.5) * w * 0.6, gy - 2 - hash(k, 1, salt) * 6, C.fireLo);
    fires.push([Math.round(x + w / 2 - 8), gy - 6, 2], [Math.round(x + w / 2 + 10), gy - 4, 0]);
}

function well(cv, x, gy) {
    cv.rect(x - 12, gy - 14, 25, 12, C.stoneLo);
    for (let y = gy - 14; y < gy - 2; y += 4) for (let bx = x - 12 + ((y >> 2) & 1) * 3; bx < x + 13; bx += 6) { cv.rect(bx, y, 5, 3, C.stone); cv.hline(bx, bx + 4, y, C.stoneHi); }
    cv.ellipse(x, gy - 14, 13, 3, C.stoneDk); cv.ellipse(x, gy - 14, 10, 2, C.ink);
    cv.rect(x - 11, gy - 40, 3, 26, C.leatherLo); cv.rect(x + 9, gy - 40, 3, 26, C.leatherLo);
    cv.poly([[x - 17, gy - 38], [x, gy - 50], [x + 18, gy - 38], [x + 18, gy - 36], [x - 17, gy - 36]], C.goldLo);
    cv.line(x - 17, gy - 37, x, gy - 49, C.gold); cv.hline(x - 17, x + 18, gy - 36, C.dirtLo);
    cv.hline(x - 9, x + 9, gy - 31, C.leather); cv.vline(x, gy - 30, gy - 22, C.stone); cv.rect(x - 2, gy - 22, 5, 4, C.leather);
}

function palisade(cv, x0, x1, gy, salt) {
    for (let x = x0; x < x1; x += 7) {
        const broken = hash(x, 0, salt) < 0.22;
        const hgt = broken ? 14 + Math.floor(hash(x, 1, salt) * 16) : 40 + Math.floor(hash(x, 2, salt) * 8);
        const top = gy - 4 - hgt;
        cv.rect(x, top + 3, 6, hgt, C.leather);
        cv.rect(x, top + 3, 2, hgt, C.leatherHi);
        cv.rect(x + 5, top + 3, 1, hgt, C.leatherLo);
        if (!broken) { cv.poly([[x, top + 4], [x + 3, top - 1], [x + 6, top + 4]], C.leather); cv.px(x + 2, top + 1, C.leatherHi); }
        else { cv.hline(x, x + 5, top + 3, C.ink); cv.px(x + 1, top + 4, C.fireLo); }
        for (let j = top + 3; j < gy - 4; j++) if (hash(x, j, salt + 2) < 0.12) cv.px(x + 3, j, C.leatherLo);
        if (hash(x, 3, salt) < 0.3) cv.dither(x, top + 3, 6, 10, C.ink, 7);
    }
    cv.rect(x0, gy - 30, x1 - x0, 2, C.leatherLo);
    cv.rect(x0, gy - 16, x1 - x0, 2, C.leatherLo);
}

function barrel(cv, x, y) {
    cv.rect(x, y - 13, 11, 13, C.leather); cv.rect(x + 1, y - 13, 3, 13, C.leatherHi); cv.rect(x + 9, y - 13, 2, 13, C.leatherLo);
    cv.hline(x, x + 10, y - 11, C.steelDk); cv.hline(x, x + 10, y - 3, C.steelDk); cv.hline(x + 1, x + 9, y - 14, C.leatherLo);
}

function paintVillage(len) {
    const sky = layer(VIEW_Y, VIEW_W, 134, 0);
    const s = sky.cv;
    s.bands(0, VIEW_W, [[0, C.sky6], [16, C.sky5], [36, C.sky4], [58, C.sky3], [80, C.sky2], [98, C.sky1]]);
    striped_sun(s, 232, 106, 21, C.fireHi, C.sky1);
    clouds(s, [[70, 30, 60, 2, C.sky6, C.sky5, C.sky4], [200, 44, 80, 3, C.sky5, C.sky4, C.sky3], [110, 62, 70, 2, C.sky4, C.sky3, C.sky2], [260, 76, 40, 2, C.sky3, C.sky3, C.sky2], [40, 84, 48, 2, C.sky3, C.sky2, C.sky1]]);
    for (const [bx, by] of [[150, 22], [160, 26], [172, 20]]) { s.px(bx - 1, by - 1, C.ink); s.px(bx, by, C.ink); s.px(bx + 1, by - 1, C.ink); }

    const far = layer(70, widthFor(len, 0.12), 72, 0.12);
    ridge(far.cv, 18, 30, 50, 3, C.sky5, C.sky4);
    // the Warlord's castle, far off on its peak
    const fx = 330, fc = far.cv;
    fc.poly([[fx - 30, 60], [fx - 6, 10], [fx + 8, 12], [fx + 34, 60]], C.sky5);
    for (const [tx, ty, tw, th] of [[fx - 7, 0, 5, 14], [fx, -4, 6, 18], [fx + 8, 2, 4, 12]]) { fc.rect(tx, ty + 4, tw, th, C.sky6); fc.px(tx + 1, ty + 8, C.fire); }
    fc.rect(fx - 9, 10, 22, 6, C.sky6);
    ridge(far.cv, 44, 16, 34, 9, C.sky6, C.sky5);

    const mid = layer(20, widthFor(len, 0.4), 116, 0.4);
    const m = mid.cv;
    for (let k = 0; k < 6; k++) smoke(m, 40 + k * 130 + Math.floor(hash(k, 0, 3) * 40), 96, 80 + Math.floor(hash(k, 1, 3) * 20), k * 1.7);
    ridge(m, 88, 14, 40, 5, C.purpleDk, C.purpleLo);
    for (let u = 8; u < m.w; u += 14 + Math.floor(hash(u, 0, 6) * 20)) {       // dark trees on the hills
        const ty = 86 + Math.round(noise1(u / 40, 5) * 14) - 4, r = 5 + Math.floor(hash(u, 1, 6) * 5);
        m.circle(u, ty, r, C.greenDk); m.circle(u + r * 0.6, ty + 2, r * 0.8, C.greenDk);
        for (let i = -r; i <= r; i += 2) m.over(u + i, ty - Math.round(Math.sqrt(Math.max(0, r * r - i * i))), C.purpleLo);
        m.vline(u, ty + r - 1, ty + r + 6, C.ink);
    }
    for (let u = 60; u < m.w; u += 260) {        // a broken windmill
        const y = 80 + Math.round(noise1(u / 40, 5) * 14);
        m.poly([[u - 5, y], [u - 3, y - 18], [u + 3, y - 18], [u + 5, y]], C.ink);
        m.line(u, y - 18, u - 12, y - 30, C.ink); m.line(u, y - 18, u + 14, y - 26, C.ink); m.line(u, y - 18, u + 3, y - 4, C.ink);
    }

    const fires = [];
    const near = layer(40, len + 4, 164, 1);
    const n = near.cv, gy = GROUND_Y - 40 + 2;
    let x = 10, k = 0;
    const plan = ['house', 'fence', 'slate', 'well', 'ruin', 'house', 'fence', 'stone', 'fence', 'house', 'ruin', 'slate', 'fence', 'house', 'stone', 'fence'];
    while (x < n.w - 40) {
        const kind = plan[k % plan.length];
        if (kind === 'fence') { const pw = 50 + Math.floor(hash(k, 0, 8) * 50); palisade(n, x, x + pw, gy + 4, k); x += pw + 6; }
        else if (kind === 'well') { well(n, x + 20, gy + 4); x += 46; }
        else if (kind === 'ruin') { const rw = 70 + Math.floor(hash(k, 2, 8) * 30); ruin(n, x, rw, gy + 2, k * 7 + 3, fires); x += rw + 10; }
        else { const hw = 86 + Math.floor(hash(k, 1, 8) * 44); house(n, x, hw, gy + 2, k * 13 + 1, fires, kind === 'slate' || kind === 'stone', kind === 'stone'); x += hw + 16; }
        if (hash(k, 3, 8) < 0.5) { barrel(n, x - 12, gy + 4); if (hash(k, 4, 8) < 0.5) barrel(n, x - 3, gy + 4); }
        k++;
    }
    road(n, gy, 'dirt');
    litter(n, gy, 55);
    verge(n, gy + 1, C.greenLo, C.greenDk, C.dirtLo);
    for (let e = 0; e < n.w / 40; e++) { const ex = Math.floor(hash(e, 0, 30) * n.w), ey = gy + 8 + Math.floor(hash(e, 1, 30) * 60); n.px(ex, ey, C.fireLo); n.px(ex + 1, ey, C.ink); }

    const fore = layer(170, widthFor(len, 1.3) + 40, 34, 1.3);
    const fo = fore.cv;
    for (let u = 160; u < fo.w; u += 200 + Math.floor(hash(u, 0, 40) * 120)) {
        for (let q = 0; q < 4; q++) { const bx = u + q * 7 - 10, bh = 3 + Math.floor(hash(u, q, 41) * 4); fo.ellipse(bx, 33, 5, bh, C.ink); fo.ellipse(bx - 1, 33, 4, bh - 1, C.stoneDk); fo.px(bx - 2, 33 - bh + 1, C.stoneLo); }
        for (let g = -12; g < 18; g += 2) { const gh = 4 + Math.floor(hash(u + g, 2, 40) * 6); fo.line(u + g, 33, u + g + 2, 33 - gh, hash(g, u, 3) < 0.5 ? C.ink : C.greenDk); }
    }
    return { sky, far, mid, near, fore, fires: fires.map(([fx2, fy, kind]) => [fx2, fy + near.y, kind]) };
}

// ------------------------------------------------------------------ STAGE 2: THE BLACKWOOD ROAD
function bigTree(cv, x, gy, salt, top) {
    const w = 22 + Math.floor(hash(salt, 0, 1) * 16);
    for (let j = top; j < gy; j++) {
        const flare = j > gy - 18 ? Math.pow((j - (gy - 18)) / 18, 2) * 14 : 0;
        const wob = Math.round(Math.sin(j * 0.05 + salt) * 2);
        const x0 = x - Math.round(w / 2 + flare) + wob, x1 = x + Math.round(w / 2 + flare) + wob;
        cv.hline(x0, x1, j, C.leatherLo);
        for (let i = x0; i <= x1; i++) {
            const u = (i - x0) / Math.max(1, x1 - x0);
            const bark = hash(Math.floor(i / 3), Math.floor(j / 7), salt);
            let c = u < 0.18 ? C.dirtDk : u < 0.38 ? C.leatherLo : u < 0.62 ? C.leather : u < 0.8 ? C.leatherLo : C.dirtDk;
            if (bark < 0.18) c = C.dirtDk;
            if ((i + (j >> 3)) % 6 === 0 && u > 0.2 && u < 0.85) c = C.dirtDk;
            cv.px(i, j, c);
        }
        cv.px(x0 - 1, j, C.ink); cv.px(x1 + 1, j, C.ink);
    }
    // roots
    for (let r = 0; r < 4; r++) {
        const dir = r < 2 ? -1 : 1, len = 12 + Math.floor(hash(salt, r, 3) * 14);
        for (let i = 0; i < len; i++) {
            const rx = x + dir * (w / 2 + 6 + i), ry = gy - 2 + Math.round(i * 0.25) - (r & 1) * 2;
            cv.rect(rx, ry - 2, 2, 3, C.leatherLo); cv.px(rx, ry - 3, C.leather);
        }
    }
    // a knot hole, moss
    cv.ellipse(x + 3, gy - 40 - Math.floor(hash(salt, 5, 1) * 30), 3, 4, C.ink);
    for (let j = top; j < gy; j += 3) if (hash(x, j, salt + 1) < 0.25) cv.px(x - w / 2 + 1, j, C.greenLo);
}

function paintForest(len) {
    const sky = layer(VIEW_Y, VIEW_W, 134, 0);
    const s = sky.cv;
    s.bands(0, VIEW_W, [[0, C.night], [22, C.purpleDk], [46, C.sky6], [72, C.sky5], [96, C.sky4], [114, C.sky3]]);
    for (let k = 0; k < 70; k++) { const sx = Math.floor(hash(k, 0, 50) * VIEW_W), sy = Math.floor(hash(k, 1, 50) * 64); s.px(sx, sy, hash(k, 2, 50) < 0.3 ? C.white : C.purpleHi); }
    // the moon
    s.circle(64, 38, 15, C.boneLo); s.circle(63, 37, 14, C.bone); s.circle(61, 35, 11, C.boneHi);
    for (const [cx, cy, r] of [[58, 34, 3], [68, 42, 2], [64, 30, 2], [70, 36, 1]]) s.circle(cx, cy, r, C.boneLo);
    clouds(s, [[40, 50, 50, 2, C.purpleDk, C.sky6, C.purpleLo], [200, 60, 90, 3, C.sky6, C.sky5, C.sky4], [120, 86, 60, 2, C.sky5, C.sky4, C.sky3]]);

    const far = layer(64, widthFor(len, 0.12), 78, 0.12);
    ridge(far.cv, 26, 26, 60, 11, C.sky6, C.sky5);
    const fc = far.cv, fx = 340;
    fc.poly([[fx - 20, 50], [fx - 4, 12], [fx + 8, 12], [fx + 24, 50]], C.sky6);
    for (const [tx, ty, tw, th] of [[fx - 6, 2, 5, 14], [fx + 1, -2, 6, 18], [fx + 8, 4, 4, 12]]) { fc.rect(tx, ty + 4, tw, th, C.purpleDk); fc.px(tx + 1, ty + 8, C.fire); }
    for (let u = 0; u < fc.w; u += 3) {                      // pine tips on the far hills
        const y = 50 + Math.round(noise1(u / 20, 13) * 12);
        fc.poly([[u - 3, y + 8], [u, y - 4 - Math.floor(hash(u, 0, 2) * 5)], [u + 3, y + 8]], C.purpleDk);
    }
    fc.rect(0, 58, fc.w, 20, C.purpleDk);

    const mid = layer(30, widthFor(len, 0.4), 110, 0.4);
    const m = mid.cv;
    for (let u = 0; u < m.w; u += 9 + Math.floor(hash(u, 0, 7) * 10)) {         // a wall of pines
        const hgt = 50 + Math.floor(hash(u, 1, 7) * 40), base = 110, top = base - hgt;
        for (let j = 0; j < hgt; j++) {
            const hw = Math.round((j / hgt) * 11 * (0.7 + 0.3 * ((j % 8) / 8)));
            m.hline(u - hw, u + hw, top + j, C.greenDk);
            if (hw > 1) m.px(u - hw, top + j, C.greenLo);
        }
        m.px(u, top, C.greenLo);
    }
    m.dither(0, 90, m.w, 20, C.night, 6);

    const fires = [];
    const near = layer(8, len + 4, 196, 1);
    const n = near.cv, gy = GROUND_Y - 8 + 2;
    // the canopy across the top
    for (let u = 0; u < n.w; u++) {
        const d = Math.round(12 + noise1(u / 18, 21) * 18 + noise1(u / 5, 22) * 6);
        n.vline(u, 0, d, C.greenDk);
        n.px(u, d, C.ink);
        if (hash(u, 0, 23) < 0.4) n.px(u, d - 1, C.greenLo);
        for (let j = 0; j < d; j++) if (hash(u, j, 24) < 0.06) n.px(u, j, C.greenLo);
    }
    for (let x = 30; x < n.w - 30; x += 110 + Math.floor(hash(x, 0, 9) * 90)) bigTree(n, x, gy + 2, x, 14);
    for (let x = 90; x < n.w - 30; x += 170 + Math.floor(hash(x, 5, 9) * 120)) {       // a rune stone, or a skull on a stake
        if (hash(x, 6, 9) < 0.5) {
            n.poly([[x - 9, gy + 2], [x - 7, gy - 26], [x, gy - 32], [x + 7, gy - 25], [x + 9, gy + 2]], C.stoneLo);
            n.poly([[x - 6, gy + 1], [x - 5, gy - 24], [x, gy - 29], [x + 2, gy - 24], [x + 2, gy + 1]], C.stone);
            for (let r = 0; r < 4; r++) { n.px(x - 2, gy - 22 + r * 5, C.teal); n.px(x - 1, gy - 21 + r * 5, C.cyan); n.px(x, gy - 22 + r * 5, C.teal); }
        } else {
            n.rect(x, gy - 36, 2, 38, C.leatherLo); n.px(x, gy - 36, C.leather);
            n.ellipse(x + 1, gy - 40, 4, 4, C.bone); n.rect(x - 1, gy - 38, 5, 3, C.bone);
            n.px(x - 1, gy - 41, C.ink); n.px(x + 2, gy - 41, C.ink); n.px(x, gy - 38, C.ink); n.px(x + 2, gy - 38, C.ink);
        }
    }
    for (let x = 20; x < n.w; x += 13 + Math.floor(hash(x, 1, 10) * 30)) {          // ferns and mushrooms along the back
        const fy = gy + 2;
        for (let f = -3; f <= 3; f++) n.line(x, fy, x + f * 3, fy - 8 - Math.abs(f), f & 1 ? C.greenLo : C.greenDk);
        if (hash(x, 2, 10) < 0.25) { n.ellipse(x + 8, fy - 3, 3, 2, C.red); n.px(x + 7, fy - 4, C.cream); n.vline(x + 8, fy - 1, fy, C.cream); }
    }
    road(n, gy, 'forest');
    verge(n, gy + 1, C.greenLo, C.greenDk, C.dirtDk);
    for (let k = 0; k < n.w / 30; k++) {                // roots across the road
        const rx = Math.floor(hash(k, 0, 31) * n.w), ry = gy + 6 + Math.floor(hash(k, 1, 31) * 20);
        for (let i = 0; i < 18; i++) { const y = ry + Math.round(Math.sin(i * 0.4 + k) * 1.5) + (i >> 2); n.px(rx + i, y, C.leatherLo); n.px(rx + i, y + 1, C.dirtDk); }
    }
    for (let k = 0; k < n.w / 5; k++) { const lx = Math.floor(hash(k, 0, 32) * n.w), ly = gy + 4 + Math.floor(hash(k, 1, 32) * 66); n.px(lx, ly, hash(k, 2, 32) < 0.5 ? C.goldLo : C.redLo); }

    const fore = layer(166, widthFor(len, 1.3) + 40, 38, 1.3);
    const fo = fore.cv;
    for (let u = 120; u < fo.w; u += 180 + Math.floor(hash(u, 0, 41) * 140)) {
        for (let f = -6; f <= 6; f++) {
            const L = 18 + Math.floor(hash(u, f, 42) * 10) - Math.abs(f);
            const ex = u + f * 4, ey = 38 - L;
            fo.line(u, 37, ex, ey, C.greenDk); fo.line(u + 1, 37, ex + 1, ey, C.ink);
            for (let q = 2; q < L; q += 3) { const px2 = u + (ex - u) * q / L, py2 = 37 + (ey - 37) * q / L; fo.px(px2 - 2, py2, C.greenDk); fo.px(px2 + 2, py2, C.greenDk); }
        }
    }
    return { sky, far, mid, near, fore, fires };
}

// ------------------------------------------------------------------ STAGE 3: THE CLIFF CASTLE
function paintCastle(len) {
    const sky = layer(VIEW_Y, VIEW_W, 134, 0);
    const s = sky.cv;
    s.bands(0, VIEW_W, [[0, C.sky6], [14, C.sky5], [34, C.sky4], [58, C.redLo], [76, C.sky3], [96, C.red], [112, C.sky2]]);
    striped_sun(s, 88, 110, 24, C.redHi, C.red);
    clouds(s, [[210, 26, 70, 2, C.sky6, C.sky5, C.sky4], [70, 46, 80, 3, C.sky5, C.sky4, C.sky3], [240, 66, 60, 2, C.sky4, C.redLo, C.sky3], [150, 84, 90, 2, C.redLo, C.sky3, C.red]]);
    // the sea
    s.rect(0, 118, VIEW_W, 16, C.blueDk);
    for (let j = 118; j < 134; j++) for (let i = 0; i < VIEW_W; i++) {
        const r = hash(i >> 2, j, 60);
        if (Math.abs(i - 88) < 30 - (j - 118) && r < 0.5) s.px(i, j, j & 1 ? C.red : C.redHi);
        else if (r < 0.12) s.px(i, j, C.blueLo);
    }
    for (const [bx, by] of [[190, 40], [204, 36], [220, 48]]) { s.px(bx - 2, by - 1, C.ink); s.px(bx - 1, by, C.ink); s.px(bx, by, C.ink); s.px(bx + 1, by, C.ink); s.px(bx + 2, by - 1, C.ink); }

    const far = layer(96, widthFor(len, 0.12), 46, 0.12);
    const fc = far.cv;
    for (let u = 0; u < fc.w; u++) {                      // headlands on the sea
        const h = noise1(u / 40, 17);
        if (h > 0.45) { const top = Math.round(40 - (h - 0.45) * 60); fc.vline(u, top, 45, C.purpleDk); if (h > 0.5) fc.px(u, top, C.sky5); }
    }

    const mid = layer(10, widthFor(len, 0.4), 130, 0.4);
    const m = mid.cv;
    // the castle on its cliff: towers and a curtain wall, lit windows
    m.rect(0, 100, m.w, 30, C.stoneDk);
    for (let u = 0; u < m.w; u++) { const t = Math.round(96 + noise1(u / 14, 18) * 8); m.vline(u, t, 100, C.stoneDk); }
    for (let u = 20; u < m.w; u += 70 + Math.floor(hash(u, 0, 19) * 60)) {
        const tw = 16 + Math.floor(hash(u, 1, 19) * 12), th = 50 + Math.floor(hash(u, 2, 19) * 40), top = 100 - th;
        m.rect(u, top, tw, th, C.purpleDk);
        m.rect(u + tw - 3, top, 3, th, C.ink);
        for (let bx = u - 2; bx < u + tw + 2; bx += 4) m.rect(bx, top - 4, 2, 4, C.purpleDk);
        m.rect(u - 2, top - 1, tw + 4, 2, C.purpleDk);
        if (hash(u, 3, 19) < 0.6) { m.poly([[u - 3, top - 4], [u + tw / 2, top - 22], [u + tw + 3, top - 4]], C.sky6); m.vline(Math.round(u + tw / 2), top - 30, top - 22, C.ink); m.rect(Math.round(u + tw / 2) + 1, top - 30, 6, 3, C.purple); }
        for (let wy = top + 10; wy < 94; wy += 14) if (hash(u, wy, 20) < 0.55) { m.rect(u + (tw >> 1) - 1, wy, 3, 5, C.fire); m.px(u + (tw >> 1), wy + 1, C.fireHi); }
    }
    for (let u = 0; u < m.w; u += 6) m.rect(u, 94, 3, 4, C.purpleDk);
    m.rect(0, 97, m.w, 5, C.purpleDk);

    const fires = [];
    const near = layer(40, len + 4, 164, 1);
    const n = near.cv, gy = GROUND_Y - 40 + 2;
    // the courtyard wall: big blocks, battlements, arrow slits, banners, torches
    const wallTop = gy - 70;
    n.rect(0, wallTop, n.w, gy - wallTop, C.stoneDk);
    for (let y = wallTop; y < gy; y += 9) {
        const off = ((y - wallTop) / 9) & 1 ? 11 : 0;
        for (let x = -off; x < n.w; x += 22) {
            const r = hash(x, y, 70);
            const depth = (y - wallTop) / 70;
            n.rect(x + 1, y + 1, 20, 7, r < 0.35 ? C.stoneDk : r < 0.8 ? C.stoneLo : C.stone);
            n.hline(x + 1, x + 20, y + 1, r < 0.35 ? C.stoneLo : C.stone); n.vline(x + 1, y + 1, y + 7, r < 0.35 ? C.stoneLo : C.stone);
            if (depth < 0.2) n.dither(x + 1, y + 1, 20, 7, C.stoneDk, 8);
            if (r > 0.9) n.line(x + 6, y + 2, x + 10, y + 6, C.stoneDk);
            if (r > 0.8 && r < 0.84) for (let q = 0; q < 5; q++) n.px(x + 3 + q * 3, y + 7, C.greenLo);
        }
        n.rect(0, y, n.w, 1, C.stoneDk);
    }
    for (let x = 0; x < n.w; x += 24) {                    // battlements (sky shows between)
        n.rect(x + 12, wallTop - 12, 12, 12, C.stoneLo); n.hline(x + 12, x + 23, wallTop - 12, C.stone); n.vline(x + 23, wallTop - 12, wallTop, C.stoneDk);
    }
    n.rect(0, wallTop - 1, n.w, 3, C.stoneDk);
    for (let x = 0; x < n.w; x += 96) {                    // buttresses, lit on one side
        n.rect(x, wallTop + 4, 14, gy - wallTop - 4, C.stoneLo);
        n.rect(x, wallTop + 4, 3, gy - wallTop - 4, C.stone); n.rect(x + 11, wallTop + 4, 3, gy - wallTop - 4, C.stoneDk);
        for (let y = wallTop + 12; y < gy; y += 9) n.hline(x, x + 13, y, C.stoneDk);
        n.poly([[x - 1, wallTop + 5], [x + 7, wallTop - 2], [x + 15, wallTop + 5]], C.stoneLo);
    }
    for (let x = 30; x < n.w; x += 130 + Math.floor(hash(x, 3, 73) * 90)) {   // ivy spilling down
        const L = 20 + Math.floor(hash(x, 4, 73) * 40);
        for (let j = 0; j < L; j++) {
            const wx = x + Math.round(Math.sin(j * 0.3 + x) * 3);
            n.px(wx, wallTop + j, C.greenDk); if (j % 3 === 0) { n.px(wx - 1, wallTop + j, C.greenLo); n.px(wx + 1, wallTop + j + 1, C.greenDk); }
        }
    }
    n.rect(0, gy - 6, n.w, 6, C.stoneDk);
    for (let x = 0; x < n.w; x += 16) n.hline(x + 1, x + 14, gy - 6, C.stoneLo);
    for (let x = 60; x < n.w - 200; x += 150 + Math.floor(hash(x, 0, 71) * 60)) {
        if (hash(x, 1, 71) < 0.55) {                       // a banner with the Warlord's mark
            const bx = x, by = wallTop + 4, bw = 20, bh = 44;
            n.rect(bx - 2, by - 2, bw + 4, 3, C.leatherLo);
            n.poly([[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx + bw / 2, by + bh - 7], [bx, by + bh]], C.purple);
            n.vline(bx, by, by + bh - 1, C.purpleHi); n.vline(bx + bw - 1, by, by + bh, C.purpleLo);
            for (let j = 0; j < bh; j += 4) n.hline(bx + 2, bx + 3, by + j, C.purpleLo);
            // the mark: a horned crown in gold
            const cx = bx + bw / 2, cy = by + 16;
            n.rect(cx - 5, cy, 11, 5, C.gold); n.hline(cx - 5, cx + 5, cy + 4, C.goldLo);
            n.poly([[cx - 6, cy + 1], [cx - 9, cy - 8], [cx - 3, cy]], C.gold); n.poly([[cx + 6, cy + 1], [cx + 9, cy - 8], [cx + 3, cy]], C.gold);
            n.rect(cx - 1, cy - 4, 3, 4, C.gold); n.px(cx, cy + 2, C.red);
        } else {                                           // an arrow slit
            n.rect(x + 8, wallTop + 14, 3, 18, C.ink); n.rect(x + 5, wallTop + 21, 9, 3, C.ink);
        }
        // a torch in its sconce
        const tx = x + 50;
        n.rect(tx - 2, wallTop + 30, 5, 3, C.steelDk); n.rect(tx - 1, wallTop + 24, 3, 7, C.leatherLo); n.rect(tx - 2, wallTop + 22, 5, 3, C.steelDk);
        fires.push([tx, wallTop + 22 + near.y, 3]);
    }
    // the great gate at the end of the road
    const gx = n.w - 150;
    n.rect(gx - 30, wallTop - 30, 110, gy - wallTop + 30, C.stoneLo);
    for (let y = wallTop - 30; y < gy; y += 9) for (let x = gx - 30; x < gx + 80; x += 18) { n.rect(x + 1, y + 1, 16, 7, hash(x, y, 72) < 0.3 ? C.stoneDk : C.stoneLo); n.hline(x + 1, x + 16, y + 1, C.stone); }
    for (let x = gx - 32; x < gx + 82; x += 12) { n.rect(x, wallTop - 42, 8, 12, C.stoneLo); n.hline(x, x + 7, wallTop - 42, C.stone); }
    n.rect(gx - 4, gy - 64, 58, 64, C.ink);
    n.ellipse(gx + 25, gy - 64, 29, 16, C.ink);
    for (let x = gx; x < gx + 52; x += 7) { n.vline(x, gy - 76, gy - 1, C.steelDk); n.vline(x + 1, gy - 76, gy - 1, C.steelLo); }
    for (let y = gy - 70; y < gy; y += 9) n.hline(gx - 2, gx + 51, y, C.steelDk);
    for (let x = gx; x < gx + 52; x += 7) n.px(x + 1, gy - 1, C.steel);
    n.rect(gx + 18, gy - 88, 14, 10, C.gold); n.px(gx + 25, gy - 84, C.red);
    fires.push([gx - 14, gy - 50 + near.y, 3], [gx + 64, gy - 50 + near.y, 3]);
    road(n, gy, 'flag');

    const fore = layer(150, widthFor(len, 1.3) + 40, 54, 1.3);
    const fo = fore.cv;
    for (let u = 200; u < fo.w; u += 240 + Math.floor(hash(u, 0, 43) * 120)) {
        // a fallen block of masonry and a length of chain
        fo.rect(u, 42, 22, 12, C.ink); fo.rect(u + 1, 43, 20, 10, C.stoneLo); fo.hline(u + 1, u + 20, 43, C.stone); fo.rect(u + 16, 44, 4, 9, C.stoneDk);
        fo.rect(u + 24, 47, 12, 7, C.ink); fo.rect(u + 25, 48, 10, 5, C.stoneDk); fo.hline(u + 25, u + 34, 48, C.stoneLo);
        for (let q = 0; q < 7; q++) { const cx = u - 14 + q * 4, cy = 52 - Math.round(Math.sin(q * 0.5) * 3); fo.ellipse(cx, cy, 2, 1.2, C.steelDk); fo.px(cx, cy - 1, C.steelLo); }
    }
    return { sky, far, mid, near, fore, fires };
}

const cache = [];
export function stageArt(i) {
    if (!cache[i]) cache[i] = [paintVillage, paintForest, paintCastle][i](Stages[i].len);
    return cache[i];
}
