// THE NODE · world 1 · WARLORD'S ROAD · the other pictures: the title panorama, the pickups and HUD
// icons, the old map (the stage card), the camp's night sky, and the NIGHT palette map.
// Painted once on first use (the title art at import: the spec needs it), palette indices only.
import { PixelSprite } from '../../sdk/index.js';
import { C, Ramp, WarlordsPalette } from './palette.js';
import { CLEAR, raster, cap, ell } from './raster.js';
import { Cv, hash, noise1 } from './paint.js';
import { sprite } from './rig.js';

// ------------------------------------------------------------------ pickups + HUD icons
export const PotSprite = raster([
    ell(0, -5, 4.2, 4.6, 0, Ramp.blue, 1),
    cap(0, -10.5, 0, -8.5, 1.7, 2.2, Ramp.blue, 1),
    cap(0, -12.4, 0, -11.6, 1.6, 1.6, Ramp.leather, 2),
    ell(-1.5, -6, 1.1, 1.6, 0, [C.blueHi, C.blueHi, C.blueHi, C.white], 3),
], [[1.5, -3, C.blueDk], [2.5, -4, C.blueLo]]);

export const MeatSprite = raster([
    cap(-6, -3, -2, -3.5, 1.2, 1.2, Ramp.bone, 1),
    ell(-6.5, -2.5, 1.6, 1.6, 0, Ramp.bone, 1), ell(-6.5, -4.5, 1.6, 1.6, 0, Ramp.bone, 1),
    ell(2, -4.2, 5.2, 4.1, -10, Ramp.leather, 2),
    ell(1, -5.4, 2.6, 1.6, -10, [C.red, C.red, C.redHi, C.skinHi], 3),
], [[4, -2, C.leatherLo], [5, -3, C.leatherLo]]);

export const HeadIcon = raster([
    ell(0, -4.5, 3.6, 4, 0, Ramp.skin, 1),
    ell(-0.8, -7, 4.2, 2.6, 0, Ramp.hair, 2), ell(-3, -4, 2, 3.6, 0, Ramp.hair, 2),
], [[1.8, -4.8, C.ink], [-3.8, -6.2, C.red, 3, -7, C.red]]);

// ------------------------------------------------------------------ the night: every colour mapped to its moonlit self
const NIGHT = {
    white: 'steelLo', cream: 'steelLo', hud: 'stoneLo', gold: 'purpleLo', goldLo: 'purpleDk', red: 'purpleLo', redHi: 'purpleLo', redLo: 'purpleDk', redDk: 'ink',
    skinHi: 'steelLo', skin: 'stoneLo', skinLo: 'purpleLo', skinDk: 'purpleDk', hairHi: 'stoneLo', hair: 'purpleLo', hairLo: 'purpleDk',
    steelHi: 'steelLo', steel: 'steelLo', steelLo: 'steelDk', steelDk: 'blueDk', leatherHi: 'stoneLo', leather: 'purpleLo', leatherLo: 'purpleDk',
    furHi: 'steelLo', fur: 'stoneLo', furLo: 'stoneDk', blueHi: 'steelLo', blue: 'blueLo', blueLo: 'blueDk', blueDk: 'night',
    greenHi: 'stoneLo', green: 'steelDk', greenLo: 'blueDk', greenDk: 'night', purpleHi: 'purpleLo', purple: 'purpleLo', purpleLo: 'purpleDk', purpleDk: 'night',
    boneHi: 'steelLo', bone: 'steelLo', boneLo: 'stoneDk', stoneHi: 'steelLo', stone: 'stoneLo', stoneLo: 'stoneDk', stoneDk: 'night',
    dirtHi: 'stoneLo', dirt: 'stoneDk', dirtLo: 'purpleDk', dirtDk: 'night', sky1: 'purpleLo', sky2: 'purpleLo', sky3: 'purpleDk', sky4: 'purpleDk', sky5: 'blueDk', sky6: 'night',
    fireHi: 'fireHi', fire: 'fire', fireLo: 'fireLo', cyan: 'cyan', teal: 'teal', night: 'night', ink: 'ink', bg: 'bg',
};
export const NightMap = (() => {
    const m = new Uint8Array(256);
    for (let i = 0; i < 256; i++) m[i] = i;
    for (let i = 0; i < WarlordsPalette.count; i++) { const n = NIGHT[WarlordsPalette.nameOf(i)]; if (n) m[i] = C[n]; }
    return m;
})();

// the camp's sky: moonlit bands, stars, a big moon
let nightSky = null;
export function campSky() {
    if (nightSky) return nightSky;
    const s = new Cv(304, 134);
    s.bands(0, 304, [[0, C.night], [40, C.blueDk], [84, C.purpleDk], [110, C.sky6]]);
    for (let k = 0; k < 90; k++) { const x = Math.floor(hash(k, 0, 90) * 304), y = Math.floor(hash(k, 1, 90) * 90); s.px(x, y, hash(k, 2, 90) < 0.25 ? C.white : hash(k, 3, 90) < 0.5 ? C.steelLo : C.purpleHi); }
    s.circle(236, 34, 13, C.steelLo); s.circle(235, 33, 12, C.boneLo); s.circle(233, 31, 9, C.bone);
    for (const [cx, cy, r] of [[230, 30, 2], [239, 38, 2], [236, 28, 1]]) s.circle(cx, cy, r, C.boneLo);
    nightSky = s;
    return s;
}

// ------------------------------------------------------------------ the old map (the stage card)
// the road's three stops (screen space inside the 304 x 196 card at (8, 8))
export const MapStops = Object.freeze([[46, 142], [150, 104], [252, 58]]);
export const MapRoute = Object.freeze([[18, 160], [46, 142], [78, 136], [104, 118], [150, 104], [184, 100], [206, 84], [226, 70], [252, 58]]);
let mapCard = null;
export function oldMap() {
    if (mapCard) return mapCard;
    const W = 304, H = 196, m = new Cv(W, H, C.furHi);
    // parchment grain and stains
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const n = noise1(i / 23, j) * 0.5 + noise1(j / 17, i + 500) * 0.5, r = hash(i, j, 77);
        if (n < 0.3 || r < 0.05) m.px(i, j, C.fur);
        else if (r > 0.985) m.px(i, j, C.cream);
    }
    // burnt edges
    for (let i = 0; i < W; i++) for (const [edge, len] of [[0, 1], [H - 1, -1]]) {
        const d = Math.round(3 + noise1(i / 9, edge) * 7);
        for (let q = 0; q < d; q++) m.px(i, edge + q * len, q < d - 3 ? CLEAR : q < d - 1 ? C.dirtDk : C.dirtLo);
    }
    for (let j = 0; j < H; j++) for (const [edge, len] of [[0, 1], [W - 1, -1]]) {
        const d = Math.round(3 + noise1(j / 9, edge + 40) * 7);
        for (let q = 0; q < d; q++) m.px(edge + q * len, j, q < d - 3 ? CLEAR : q < d - 1 ? C.dirtDk : C.dirtLo);
    }
    // the sea in the east, hatched
    for (let j = 20; j < H - 10; j++) {
        const coast = 262 + Math.round(noise1(j / 14, 3) * 18) - (j < 80 ? 0 : (j - 80) * 0.2);
        for (let i = coast; i < W - 8; i++) if ((i + j * 2) % 7 === 0) m.px(i, j, C.blueLo);
        m.px(coast, j, C.dirtLo); m.px(coast - 1, j, C.dirtLo);
    }
    // mountains, drawn in ink strokes
    const mount = (x, y, s) => {
        m.line(x - s, y, x, y - s * 1.2, C.dirtLo); m.line(x, y - s * 1.2, x + s, y, C.dirtLo);
        m.line(x, y - s * 1.2, x + s * 0.3, y - s * 0.5, C.dirtLo);
        for (let q = 1; q < s; q += 2) m.px(x + q * 0.5 + 1, y - s * 1.2 + q * 1.1, C.dirtLo);
    };
    for (const [x, y, s] of [[70, 58, 12], [92, 52, 16], [118, 60, 10], [190, 150, 11], [214, 158, 9], [30, 80, 9], [236, 128, 12]]) mount(x, y, s);
    // the Blackwood: little trees
    for (let k = 0; k < 60; k++) {
        const x = 118 + Math.floor(hash(k, 0, 5) * 64), y = 88 + Math.floor(hash(k, 1, 5) * 34);
        if (Math.abs(x - 150) < 10 && Math.abs(y - 104) < 8) continue;
        m.line(x, y, x, y - 5, C.greenLo); m.line(x - 2, y - 2, x, y - 5, C.greenLo); m.line(x + 2, y - 2, x, y - 5, C.greenLo); m.px(x, y + 1, C.dirtLo);
    }
    // the village (houses) and the castle on its cliff
    for (const [x, y] of [[38, 146], [48, 150], [56, 142]]) { m.rect(x - 3, y - 3, 7, 4, C.dirtLo); m.poly([[x - 4, y - 3], [x, y - 7], [x + 4, y - 3]], C.redLo); }
    m.rect(242, 48, 22, 12, C.dirtLo); for (let x = 242; x < 264; x += 4) m.rect(x, 45, 2, 3, C.dirtLo);
    m.rect(246, 36, 5, 12, C.dirtLo); m.rect(256, 32, 5, 16, C.dirtLo); m.poly([[245, 36], [248, 30], [252, 36]], C.redLo); m.poly([[255, 32], [258, 25], [262, 32]], C.redLo);
    m.line(236, 60, 268, 60, C.dirtLo); m.line(236, 60, 240, 72, C.dirtLo);
    // the compass rose
    const cx = 36, cy = 44;
    m.line(cx, cy - 12, cx, cy + 12, C.dirtLo); m.line(cx - 12, cy, cx + 12, cy, C.dirtLo);
    m.poly([[cx - 2, cy], [cx, cy - 11], [cx + 2, cy]], C.redLo); m.poly([[cx - 2, cy], [cx, cy + 11], [cx + 2, cy]], C.dirtLo);
    m.px(cx - 1, cy - 16, C.dirtLo); m.px(cx, cy - 17, C.dirtLo); m.px(cx + 1, cy - 16, C.dirtLo); m.px(cx - 1, cy - 17, C.dirtLo); m.px(cx + 1, cy - 17, C.dirtLo);
    // the road ahead: dotted
    for (let k = 0; k + 1 < MapRoute.length; k++) {
        const [x0, y0] = MapRoute[k], [x1, y1] = MapRoute[k + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
        for (let q = 0; q < n; q += 4) m.px(x0 + (x1 - x0) * q / n, y0 + (y1 - y0) * q / n, C.redLo);
    }
    mapCard = m;
    return m;
}

// ------------------------------------------------------------------ the title panorama (attract TITLE page)
export const TitleArt = (() => {
    const W = 280, H = 60;
    const t = new Cv(W, H, CLEAR);
    t.bands(0, W, [[0, C.sky6], [9, C.sky5], [20, C.sky4], [31, C.sky3], [41, C.sky2], [50, C.sky1]], 4);
    // thin clouds
    for (const [cx, cy, L] of [[60, 14, 40], [150, 24, 60], [236, 10, 36], [110, 36, 44]]) { t.hline(cx - L / 2, cx + L / 2, cy, C.sky5); t.hline(cx - L / 2 + 6, cx + L / 2 - 4, cy + 1, C.sky3); }
    // the red sun behind the castle, striped
    for (let j = -18; j <= 18; j++) {
        const y = 40 + j; if (y >= H || y < 0) continue;
        if (j > 1 && j % 4 === 0) continue;
        const hw = Math.round(Math.sqrt(324 - j * j));
        t.rect(214 - hw, y, hw * 2 + 1, 1, j > 4 ? C.fire : C.fireHi);
    }
    // the cliff and the Warlord's castle, in silhouette
    t.poly([[150, H], [172, 40], [190, 36], [212, 38], [244, 32], [266, 42], [280, 46], [280, H]], C.purpleDk);
    for (const [x, y, w, h] of [[192, 16, 9, 22], [207, 8, 11, 30], [224, 18, 8, 20], [236, 24, 12, 12]]) {
        t.rect(x, y, w, h, C.sky6);
        for (let bx = x; bx < x + w; bx += 3) t.rect(bx, y - 2, 2, 2, C.sky6);
    }
    t.poly([[206, 8], [212, -4], [219, 8]], C.sky6);
    for (const [x, y] of [[195, 22], [211, 16], [211, 24], [227, 24], [240, 28]]) { t.px(x, y, C.fire); t.px(x, y + 1, C.fireLo); }
    t.rect(188, 30, 64, 8, C.sky6);
    // the Warlord on the cliff edge, a black shape against the sun
    t.sprite(sprite('warlordTitle', 'idle0'), 178, 39, true, C.ink);
    // the foreground rock
    t.poly([[0, H], [0, 46], [14, 42], [34, 44], [52, 41], [70, 45], [96, 48], [120, 54], [132, H]], C.ink);
    t.poly([[0, H], [0, 50], [20, 47], [44, 49], [66, 48], [90, 52], [110, H]], C.purpleDk);
    // the hero on the rock, blade raised; the beaked lizard at his side
    t.sprite(sprite('lizardTitle', 'idle0'), 30, 52, false);
    t.sprite(sprite('heroTitle', 'a1s'), 80, 48, false);
    // a frame
    t.rect(0, 0, W, 1, C.gold); t.rect(0, H - 1, W, 1, C.goldLo); t.rect(0, 0, 1, H, C.gold); t.rect(W - 1, 0, 1, H, C.goldLo);
    const ps = new PixelSprite(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = t.d[j * W + i]; if (v !== CLEAR) ps.set(i, j, v); }
    return ps;
})();
