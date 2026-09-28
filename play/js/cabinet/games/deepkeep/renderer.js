// THE NODE · world 1 · THE DEEP KEEP on the Cabinet Engine · THE PICTURE.
//
//   - the playfield: a 236 x 224 window (x 8..243, y 8..231) that scrolls with the hero over the level
//   - the stone: warm flagstone floors and cool brick walls with a lit top, a shaded front face and a
//     contact shadow, all LIT PER PIXEL: every wall torch throws a flickering pool of light, the hero
//     carries a glow of his own, and the light steps through the palette ramps with a 4x4 ordered
//     dither fixed to the world (so it never swims when the view scrolls)
//   - everything that moves or can be taken is drawn full-bright over the lit stone with a 1 px black
//     outline, sorted by height so a crowd overlaps properly; hits flash white for a frame or two
//   - the panel (x 246..311): HEALTH as a big number and a bar, SCORE, keys, potions, LEVEL n of 5 and
//     the level's name
//   - nothing strobes: blinks are 1 Hz, the low-health pulse 1 Hz, a potion is expanding rings
import { d6, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { DeepKeepPalette as PAL } from './palette.js';
import { DeepKeepSpec } from './spec.js';
import { TS, VIEW_W, VIEW_H, DX8, DY8, Fx } from './dungeon.js';
import { Tile, Item, Mon } from './levels.js';
import { DeepKeepRound } from './round.js';
import * as S from './sprites.js';

const OX = 8, OY = 8;                              // the playfield's top-left on the tube
const PX = 246, PW = 66;                           // the panel
const Phase = DeepKeepRound.Phase;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---- the stone textures (built once): a 128 x 128 flagstone floor and a 32 x 32 brick course, as
// "material" steps that the lighting maps onto the ramps
const FN = 128;
const FLOOR = buildFloor(), BRICK = buildBrick();

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function buildFloor() {
    // big irregular flagstones on a 128 x 128 repeat. mats: 0 mortar, 1 shade, 2 stone, 3 lit edge
    const N = FN, m = new Uint8Array(N * N), rnd = lcg(7);
    let y0 = 0;
    const heights = [16, 13, 15, 12, 16, 14, 11, 16, 15];
    for (let row = 0; y0 < N; row++) {
        const hgt = Math.min(heights[row % heights.length], N - y0);
        let x = Math.floor(rnd() * 16), total = 0;
        while (total < N) {
            const w = Math.min([14, 18, 20, 22, 24, 26, 30][Math.floor(rnd() * 7)], N - total);
            const tone = rnd() < 0.3 ? 1 : 2;
            for (let j = 0; j < hgt; j++)
                for (let i = 0; i < w; i++) {
                    const px = (x + i) % N, py = y0 + j;
                    let v = tone;
                    if (j === hgt - 1 || i === w - 1) v = 0;                // mortar
                    else if (j === 0 || i === 0) v = 3;                     // the lit top and left edges
                    else if (j === hgt - 2 || i === w - 2) v = 1;           // shade under the edge
                    else if (rnd() < 0.035) v = 1;                          // pits
                    m[py * N + px] = v;
                }
            if (rnd() < 0.35) {                                             // a crack
                let cx = x + 3 + Math.floor(rnd() * Math.max(1, w - 6)), cy = y0 + 2;
                const n = Math.max(2, hgt - 5);
                for (let k = 0; k < n; k++) { m[(cy % N) * N + (cx % N)] = 0; if (rnd() < 0.5) cx += rnd() < 0.5 ? 1 : -1 + N; cy++; }
            }
            x += w; total += w;
        }
        y0 += hgt;
    }
    return m;
}

function buildBrick() {
    // mats (wall ramp steps): 1 mortar, 2 shade, 3 brick, 4 lit brick edge
    const N = 32, m = new Uint8Array(N * N), rnd = lcg(11);
    for (let row = 0; row < 8; row++) {
        const y0 = row * 4, off = (row & 1) * 5;
        for (let bx = -1; bx < 4; bx++) {
            const x0 = bx * 10 + off, tone = rnd() < 0.3 ? 2 : 3;
            for (let j = 0; j < 4; j++)
                for (let i = 0; i < 10; i++) {
                    const px = x0 + i;
                    if (px < 0 || px >= N) continue;
                    let v = tone;
                    if (j === 3 || i === 9) v = 1;
                    else if (j === 0) v = 4;
                    m[(y0 + j) * N + px] = v;
                }
        }
    }
    return m;
}

// ---- compiled sprites: palette indices with a 1 px black outline, and a mirrored copy
function compile(sp) {
    const w = sp.width + 2, h = sp.height + 2, idx = new Int16Array(w * h).fill(-1);
    for (let y = 0; y < sp.height; y++) for (let x = 0; x < sp.width; x++) { const v = sp.at(x, y); if (v >= 0) idx[(y + 1) * w + x + 1] = v; }
    const out = idx.slice();
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            if (idx[y * w + x] >= 0) continue;
            const n = (x > 0 && idx[y * w + x - 1] >= 0) || (x < w - 1 && idx[y * w + x + 1] >= 0) || (y > 0 && idx[(y - 1) * w + x] >= 0) || (y < h - 1 && idx[(y + 1) * w + x] >= 0);
            if (n) out[y * w + x] = -2;                            // outline
        }
    const flip = new Int16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) flip[y * w + x] = out[y * w + (w - 1 - x)];
    return { w, h, idx: out, flip };
}
const C = new Map();
const LEVEL_CACHE = new Map();
function cs(sp) { let c = C.get(sp); if (!c) { c = compile(sp); C.set(sp, c); } return c; }

const MODE_NORMAL = 0, MODE_WHITE = 1, MODE_HURT = 2, MODE_PHASE = 3, MODE_DARK = 4, MODE_AURA = 5;

export class DeepKeepRenderer {
    constructor() {
        const pk = new Uint32Array(PAL.count);
        for (let i = 0; i < PAL.count; i++) pk[i] = PAL.at(i).packed;
        this.pk = pk;
        const c = n => PAL.get(n);
        this.col = {};
        for (const n of ['bg', 'white', 'torch', 'torchHi', 'ember', 'bone', 'boneLo', 'red', 'redLo', 'gold', 'goldLo', 'blue', 'blueLo',
            'purple', 'purpleLo', 'ghost', 'ghostLo', 'green', 'greenLo', 'wood', 'woodLo', 'skin',
            'wl0', 'wl1', 'wl2', 'wl3', 'wl4', 'wl5', 'fl0', 'fl1', 'fl2', 'fl3', 'fl4', 'fl5']) this.col[n] = c(n);
        this.floorRamp = new Uint32Array(6); this.wallRamp = new Uint32Array(6);
        for (let i = 0; i < 6; i++) { this.floorRamp[i] = c('fl' + i).packed; this.wallRamp[i] = c('wl' + i).packed; }
        this.iBg = PAL.indexOf('bg'); this.iWhite = PAL.indexOf('white'); this.iPurpleLo = PAL.indexOf('purpleLo'); this.iAura = PAL.indexOf('ghostLo');
        this.iWl1 = PAL.indexOf('wl1');
        const hurt = new Int16Array(PAL.count); for (let i = 0; i < PAL.count; i++) hurt[i] = i;
        for (const [a, b] of [['wl4', 'red'], ['wl5', 'red'], ['wl3', 'redLo'], ['gold', 'red'], ['goldLo', 'redLo'], ['skin', 'red'], ['torchHi', 'red']])
            hurt[PAL.indexOf(a)] = PAL.indexOf(b);
        this.hurtMap = hurt;
        this._serial = -1; this._dungeon = null;
        this._u32 = null; this._surf = null;
        this._draw = [];
    }

    // ------------------------------------------------------------------ the frame
    draw(sim, s, t) {
        this._noClip(s);
        s.clear(this.col.bg);
        const r = sim;
        if (r == null || r.dungeon == null || r.dungeon.L == null) return;
        const d = r.dungeon;
        if (this._surf !== s) { this._surf = s; this._u32 = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height); }
        if (this._serial !== d.serial || this._dungeon !== d) this._buildLevel(d);
        const cx = d.camX(), cy = d.camY();
        this.cx = cx; this.cy = cy; this.t = t;

        this._drawStone(d, cx, cy, t);
        this._clipTo(s, OX, OY, VIEW_W, VIEW_H);
        this._drawTileThings(d, cx, cy, t);
        if (r.mercyActive && r.p === Phase.Running) this._drawGuide(d, t);
        this._drawActors(r, d, t);
        this._drawShots(d, t);
        this._drawFx(d, t);
        this._noClip(s);
        this._drawPanel(s, r, d, t);
        this._drawOverlay(s, r, d, t);
    }

    // ------------------------------------------------------------------ per level: the material map and the torchlight
    _buildLevel(d) {
        this._serial = d.serial; this._dungeon = d;
        const [wr, fr] = d.L.stone;                                    // this level's stone
        for (let i = 0; i < 6; i++) { this.wallRamp[i] = PAL.get(wr + i).packed; this.floorRamp[i] = PAL.get(fr + i).packed; }
        // the stone and the torchlight depend only on the map: built once per level for the whole session
        let L = LEVEL_CACHE.get(d.L.name);
        if (!L) { L = this._bakeLevel(d); LEVEL_CACHE.set(d.L.name, L); }
        this.MW = L.MW; this.MH = L.MH; this.mat = L.mat; this.BW = L.BW; this.BH = L.BH;
        this.torchLight = L.torchLight; this.torches = L.torches;
        this.light = new Int16Array(L.BW * L.BH);
    }

    _bakeLevel(d) {
        const W = d.W, H = d.H, MW = W * TS, MH = H * TS;
        this.MW = MW; this.MH = MH;
        const mat = this.mat = new Uint8Array(MW * MH);                // bit 4 = wall, low bits = the material step
        const wall = (x, y) => x < 0 || y < 0 || x >= W || y >= H || d.L.tile[y * W + x] === Tile.Wall;
        for (let ty = 0; ty < H; ty++)
            for (let tx = 0; tx < W; tx++) {
                const isWall = wall(tx, ty);
                const openBelow = isWall && !wall(tx, ty + 1), openAbove = isWall && !wall(tx, ty - 1);
                const openL = isWall && !wall(tx - 1, ty), openR = isWall && !wall(tx + 1, ty);
                const wallAbove = !isWall && wall(tx, ty - 1), wallLeft = !isWall && wall(tx - 1, ty);
                for (let j = 0; j < TS; j++)
                    for (let i = 0; i < TS; i++) {
                        const wx = tx * TS + i, wy = ty * TS + j;
                        let v;
                        if (isWall) {
                            if (openBelow && j >= 11) {
                                // the front face: tall dressed stones, darker, a contact shadow at the foot
                                if (j === 11) v = 1;
                                else if (j === 15) v = 0;
                                else v = ((wx + (j < 13 ? 0 : 4)) & 7) === 0 ? 1 : (j === 12 ? 3 : 2);
                            } else {
                                v = BRICK[(wy & 31) * 32 + (wx & 31)];
                                if (openBelow && j === 10) v = 5;              // the lip catches the light
                                if (openAbove && j === 0) v = 5;
                                else if (openAbove && j === 1) v = Math.max(v, 4);
                                if (openL && i === 0) v = Math.max(v, 4);
                                if (openR && i === 15) v = Math.min(v, 2);
                            }
                            mat[wy * MW + wx] = 16 | v;
                        } else {
                            v = FLOOR[(wy & (FN - 1)) * FN + (wx & (FN - 1))];
                            if (wallAbove && j < 3) v = j === 0 ? 0 : Math.max(0, v - 1);    // under the wall's foot
                            if (wallLeft && i < 2) v = Math.max(0, v - 1);
                            mat[wy * MW + wx] = v;
                        }
                    }
            }
        // torchlight, in 4 x 4 px blocks, stopped by walls (a ray per block)
        const BW = MW >> 2, BH = MH >> 2;
        this.BW = BW; this.BH = BH;
        const tl = this.torchLight = new Float32Array(BW * BH);
        const R = 5.6 * TS;
        this.torches = [];
        for (let ty = 0; ty < H; ty++)
            for (let tx = 0; tx < W; tx++) {
                if (!d.L.torch[ty * W + tx]) continue;
                // the flame hangs on the wall's face: light from just in front of it
                const lx = tx * TS + 8, ly = ty * TS + (wall(tx, ty + 1) ? 8 : 20);
                this.torches.push({ x: tx * TS + 8, y: ty * TS + 12, face: !wall(tx, ty + 1) });
                const b0x = Math.max(0, ((lx - R) >> 2)), b1x = Math.min(BW - 1, ((lx + R) >> 2));
                const b0y = Math.max(0, ((ly - R) >> 2)), b1y = Math.min(BH - 1, ((ly + R) >> 2));
                for (let by = b0y; by <= b1y; by++)
                    for (let bx = b0x; bx <= b1x; bx++) {
                        const px = bx * 4 + 2, py = by * 4 + 2, dd = Math.hypot(px - lx, py - ly);
                        if (dd > R) continue;
                        if (!this._litFrom(d, lx, ly, px, py, W, H)) continue;
                        const v = 2.6 * (1 - dd / R) * (1 - dd / R) + 0.35 * (1 - dd / R);
                        tl[by * BW + bx] = Math.max(tl[by * BW + bx], v);
                    }
            }
        return { MW, MH, mat, BW, BH, torchLight: tl, torches: this.torches };
    }

    _litFrom(d, x0, y0, x1, y1, W, H) {
        const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.hypot(dx, dy) / 4);
        for (let k = 1; k < n; k++) {
            const x = x0 + dx * k / n, y = y0 + dy * k / n;
            const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
            if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
            if (d.L.tile[ty * W + tx] === Tile.Wall) {
                // the lit block may be the wall itself (its face): allow the last few px
                if (Math.hypot(x1 - x, y1 - y) > 6) return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------ the lit stone
    _drawStone(d, cx, cy, t) {
        const u = this._u32, SW = this._surf.width, MW = this.MW, MH = this.MH, mat = this.mat;
        const BW = this.BW, BH = this.BH, tl = this.torchLight, light = this.light;
        const hx = d.hero.x, hy = d.hero.y;
        const flick = 1 + 0.07 * Math.sin(t * 11.3) + 0.05 * Math.sin(t * 23.1 + 1.7);
        const blast = d.blastT < 0.6 ? (1 - d.blastT / 0.6) * 2.2 : 0;
        // the light of the blocks in view (x16 fixed point)
        const bx0 = Math.max(0, cx >> 2), by0 = Math.max(0, cy >> 2);
        const bx1 = Math.min(BW - 1, (cx + VIEW_W) >> 2), by1 = Math.min(BH - 1, (cy + VIEW_H) >> 2);
        const HR = 5.5 * TS;
        for (let by = by0; by <= by1; by++)
            for (let bx = bx0; bx <= bx1; bx++) {
                const px = bx * 4 + 2, py = by * 4 + 2;
                const dd = Math.hypot(px - hx, py - hy);
                let v = 0.45 + tl[by * BW + bx] * flick;
                if (dd < HR) { const f = 1 - dd / HR; v += 2.0 * f * f + 0.4 * f; }
                v += blast;
                light[by * BW + bx] = Math.min(60, Math.max(0, Math.round(v * 16)));
            }
        const fr = this.floorRamp, wr = this.wallRamp;
        for (let sy = 0; sy < VIEW_H; sy++) {
            const wy = cy + sy, row = (OY + sy) * SW + OX;
            if (wy < 0 || wy >= MH) continue;
            const mrow = wy * MW, lrow = (wy >> 2) * BW, brow = (wy & 3) * 4;
            for (let sx = 0; sx < VIEW_W; sx++) {
                const wx = cx + sx;
                if (wx < 0 || wx >= MW) continue;
                const m = mat[mrow + wx];
                let L = (light[lrow + (wx >> 2)] + BAYER[brow + (wx & 3)]) >> 4;
                if (L > 3) L = 3;
                let k;
                if (m & 16) { k = (m & 15) + L - 2; u[row + sx] = wr[k < 0 ? 0 : k > 5 ? 5 : k]; }
                else { k = m + L - 1; u[row + sx] = fr[k < 0 ? 0 : k > 5 ? 5 : k]; }
            }
        }
    }

    // ------------------------------------------------------------------ doors, stairs, torches, items, generators
    _drawTileThings(d, cx, cy, t) {
        const W = d.W, H = d.H;
        const tx0 = Math.max(0, Math.floor(cx / TS)), ty0 = Math.max(0, Math.floor(cy / TS));
        const tx1 = Math.min(W - 1, Math.floor((cx + VIEW_W) / TS)), ty1 = Math.min(H - 1, Math.floor((cy + VIEW_H) / TS));
        const s = this._surf;
        for (let ty = ty0; ty <= ty1; ty++)
            for (let tx = tx0; tx <= tx1; tx++) {
                const i = ty * W + tx, sx = OX + tx * TS - cx, sy = OY + ty * TS - cy;
                const tile = d.tile[i];
                if (tile === Tile.Door) this._door(s, d, tx, ty, sx, sy);
                else if (tile === Tile.Exit) this._stairs(s, sx, sy, t);
                const it = d.item[i];
                if (it) this._item(s, it, sx, sy, tx, ty, t);
            }
        // torches (flames on the walls)
        for (const tc of this.torches) {
            const sx = OX + tc.x - cx, sy = OY + tc.y - cy;
            if (sx < -8 || sy < -16 || sx > VIEW_W + 16 || sy > VIEW_H + 16) continue;
            this._torch(s, sx, sy, t, tc.x);
        }
        for (const g of d.gens) {
            if (!g.alive) continue;
            const sx = OX + g.tx * TS - cx, sy = OY + g.ty * TS - cy;
            if (sx < -16 || sy < -16 || sx > VIEW_W + 16 || sy > VIEW_H + 16) continue;
            this._gen(s, g, sx, sy, t);
        }
    }

    _door(s, d, tx, ty, x, y) {
        const W = d.W;
        const horiz = d.tile[ty * W + tx - 1] !== Tile.Floor && d.tile[ty * W + tx + 1] !== Tile.Floor;
        const c = this.col;
        s.rect(x, y, TS, TS, c.woodLo);
        if (horiz) {
            for (let i = 0; i < TS; i += 4) { s.rect(x + i, y + 1, 3, 14, c.wood); s.rect(x + i, y + 1, 1, 14, c.fl5); }
            s.rect(x, y + 3, TS, 2, c.wl3); s.rect(x, y + 11, TS, 2, c.wl3);
            s.rect(x, y + 3, TS, 1, c.wl4); s.rect(x, y + 11, TS, 1, c.wl4);
            s.rect(x, y + 15, TS, 1, c.bg);
        } else {
            for (let j = 0; j < TS; j += 4) { s.rect(x + 1, y + j, 14, 3, c.wood); s.rect(x + 1, y + j, 14, 1, c.fl5); }
            s.rect(x + 3, y, 2, TS, c.wl3); s.rect(x + 11, y, 2, TS, c.wl3);
            s.rect(x + 3, y, 1, TS, c.wl4); s.rect(x + 11, y, 1, TS, c.wl4);
        }
        // a lock plate on each door tile
        s.rect(x + 6, y + 6, 4, 5, c.goldLo); s.rect(x + 6, y + 6, 4, 1, c.gold); s.setPixel(x + 7, y + 8, c.bg); s.setPixel(x + 7, y + 9, c.bg);
    }

    _stairs(s, x, y, t) {
        const c = this.col;
        s.rect(x, y, TS, TS, c.bg);
        // steps going down into the dark, each lip lit
        const tones = [c.fl5, c.fl4, c.fl3, c.fl2, c.fl1];
        for (let k = 0; k < 5; k++) {
            const yy = y + 2 + k * 3, inset = k;
            s.rect(x + 1 + inset, yy, 14 - inset * 2, 2, tones[k]);
            s.rect(x + 1 + inset, yy, 14 - inset * 2, 1, k === 0 ? c.torchHi : tones[Math.max(0, k - 1)]);
        }
        s.frame(x, y, TS, TS, c.goldLo);
        // EXIT, pulsing gently (1 Hz between two golds)
        const lit = SurfaceDraw.blink(t, 1);
        s.rect(x + 1, y - 7, 17, 7, c.bg);
        s.text('EXIT', x + 2, y - 6, PixelFont.Small, lit ? c.torchHi : c.gold);
    }

    _torch(s, x, y, t, seed) {
        const c = this.col;
        // an iron bracket and a flame that licks upward (three shapes, ~7 a second: a flicker, not a strobe)
        s.rect(x - 2, y + 1, 5, 2, c.wl1); s.rect(x - 1, y - 1, 3, 2, c.wl3);
        const f = Math.floor(t * 7 + seed * 0.37) % 3;
        const hts = [6, 7, 5][f], lean = [0, 1, -1][f];
        for (let j = 0; j < hts; j++) {
            const w = j < 2 ? 3 : j < hts - 2 ? 2 : 1;
            const xx = x - (w >> 1) + (j > 2 ? lean : 0);
            s.rect(xx, y - 2 - j, w, 1, j < 2 ? c.torch : j < hts - 1 ? c.torchHi : c.white);
        }
        s.setPixel(x, y - 2, c.white);
    }

    _item(s, it, x, y, tx, ty, t) {
        const glint = ((t * 0.7 + ((tx * 7 + ty * 13) % 16) / 16) % 1) < 0.12;
        switch (it) {
            case Item.Key: this._blit(cs(S.Key), x + 2, y + 4); if (glint) this._star(s, x + 3, y + 5); break;
            case Item.Food: this._blit(cs(S.Roast), x + 1, y + 3); break;
            case Item.Jug: this._blit(cs(S.Jug), x + 3, y + 2); break;
            case Item.Potion: this._blit(cs(S.Potion), x + 3, y + 2); if (glint) this._star(s, x + 5, y + 6); break;
            case Item.Chest: this._blit(cs(S.Chest), x, y + 2); if (glint) this._star(s, x + 11, y + 4); break;
        }
    }

    _star(s, x, y) {
        const c = this.col;
        s.setPixel(x, y, c.white); s.setPixel(x - 1, y, c.torchHi); s.setPixel(x + 1, y, c.torchHi);
        s.setPixel(x, y - 1, c.torchHi); s.setPixel(x, y + 1, c.torchHi); s.setPixel(x - 2, y, c.gold); s.setPixel(x + 2, y, c.gold);
    }

    _gen(s, g, x, y, t) {
        const k = Math.max(1, Math.min(3, g.hp)) - 1;
        const mode = g.flash > 0 ? MODE_WHITE : MODE_NORMAL;
        const c = this.col;
        switch (g.type) {
            case Mon.Ghost: this._blit(cs(S.BonePile[k]), x - 1, y - 1, false, mode); break;
            case Mon.Brute: {
                this._blit(cs(S.Den[k]), x - 1, y - 1, false, mode);
                // eyes in the doorway now and then
                if (mode === MODE_NORMAL && ((t * 0.5 + g.tx * 0.13) % 1) < 0.35) { const ey = y + [12, 11, 10][k]; s.setPixel(x + 7, ey, c.torchHi); s.setPixel(x + 9, ey, c.torchHi); }
                break;
            }
            case Mon.Imp: {
                this._blit(cs(S.Pit[k]), x - 1, y - 1, false, mode);
                if (mode === MODE_NORMAL) {
                    // the coals shift: a few bright specks wander over the glow
                    for (let n = 0; n < 3 + k; n++) {
                        const a = t * (1.3 + n * 0.4) + n * 2.1 + g.tx;
                        const rr = 1 + k + (n % 2);
                        s.setPixel(x + 8 + Math.round(Math.cos(a) * rr), y + 8 + Math.round(Math.sin(a * 1.3) * rr), n & 1 ? c.white : c.torchHi);
                    }
                }
                break;
            }
            case Mon.Warlock: {
                this._blit(cs(S.Altar[k]), x - 1, y - 1, false, mode);
                if (mode === MODE_NORMAL && SurfaceDraw.blink(t + g.tx * 0.1, 1)) { s.setPixel(x + 7, y + 8, c.purple); s.setPixel(x + 8, y + 8, c.white); s.setPixel(x + 7, y + 7, c.purple); }
                break;
            }
        }
    }

    // ------------------------------------------------------------------ the mercy wisp (credit 5): the way on, lit
    _drawGuide(d, t) {
        const g = d.guide, W = d.W, s = this._surf, c = this.col;
        const n = Math.min(g.length, 18);
        for (let k = 1; k < n; k += 2) {
            const i = g[k], x = OX + (i % W) * TS + 8 - this.cx, y = OY + ((i / W) | 0) * TS + 8 - this.cy;
            const on = ((t * 2 - k * 0.12) % 1 + 1) % 1 < 0.5;
            s.setPixel(x, y, on ? c.white : c.blue);
            s.setPixel(x - 1, y, c.blueLo); s.setPixel(x + 1, y, c.blueLo); s.setPixel(x, y - 1, c.blueLo); s.setPixel(x, y + 1, c.blueLo);
        }
    }

    // ------------------------------------------------------------------ the hero and the monsters, sorted by feet
    _drawActors(r, d, t) {
        const list = this._draw; list.length = 0;
        for (const m of d.mons) if (m.alive) list.push(m);
        // in play the hero sorts in with the crowd; when he falls or leaves he is drawn over it
        const P = r.p, onTop = P === Phase.Fallen || P === Phase.Stairs || P === Phase.Result || P === Phase.Over;
        if (!onTop) list.push(d.hero);
        list.sort((a, b) => a.y - b.y);
        if (onTop) list.push(d.hero);
        for (const a of list) {
            if (a === d.hero) this._drawHero(r, d, t);
            else this._drawMon(d, a, t);
        }
    }

    _drawMon(d, m, t) {
        const x = OX + Math.round(m.x) - this.cx, y = OY + Math.round(m.y) - this.cy;
        if (x < -20 || y < -24 || x > VIEW_W + 28 || y > VIEW_H + 28) return;
        const f = Math.floor(m.walk / 6 + m.id * 0.5) & 1;
        const left = m.fx < -0.2;
        let mode = m.flash > 0 ? MODE_WHITE : MODE_NORMAL;
        switch (m.type) {
            case Mon.Ghost: {
                const bob = Math.round(Math.sin(t * 5 + m.id) * 1);
                this._blit(cs(S.Ghost[Math.floor(t * 4 + m.id) & 1]), x - 7, y - 9 + bob, left, mode);
                break;
            }
            case Mon.Brute: {
                const sp = cs(S.Brute[m.moving ? f : 0]);
                // the club: raised over the shoulder, down in a swing
                const club = cs(S.Club);
                const cxo = left ? -9 : 6;
                if (m.swing > 0) this._blit(club, x + cxo + (left ? -2 : 2), y - 4, left, mode);
                else this._blit(club, x + cxo, y - 12, left, mode);
                this._blit(sp, x - 7, y - 11, left, mode);
                break;
            }
            case Mon.Imp: {
                this._blit(cs(S.Imp[Math.floor(t * 6 + m.id) & 1]), x - 6, y - 10, left, mode);
                break;
            }
            case Mon.Warlock: {
                if (m.hidden) { this._blit(cs(S.Warlock[0]), x - 7, y - 12, left, MODE_PHASE); break; }
                const st = cs(S.Staff);
                this._blit(st, x + (left ? -10 : 5), y - 12, left, mode);
                this._blit(cs(S.Warlock[m.moving ? f : 0]), x - 7, y - 12, left, mode);
                break;
            }
            case Mon.Wraith: {
                const bob = Math.round(Math.sin(t * 2.2 + m.id) * 1.5);
                if (m.stun > 0) mode = MODE_WHITE; else if (mode === MODE_NORMAL) mode = MODE_AURA;   // a cold rim, so it shows on dark stone
                this._blit(cs(S.Wraith[Math.floor(t * 3) & 1]), x - 8, y - 14 + bob, left, mode);
                break;
            }
        }
    }

    _drawHero(r, d, t) {
        const h = d.hero, P = r.p;
        let x = OX + Math.round(h.x) - this.cx, y = OY + Math.round(h.y) - this.cy;
        const f = h.face;
        const view = f === 0 ? 'up' : (f === 4 ? 'down' : 'side');
        const left = f >= 5;
        const step = h.moving ? Math.floor(h.walk / 5) & 3 : 0;
        const pose = step === 0 ? 'stand' : step === 1 ? 'a' : step === 2 ? 'stand' : 'b';
        let mode = h.hurt > 0 ? MODE_HURT : MODE_NORMAL;
        const s = this._surf, c = this.col;

        if (P === Phase.Fallen || (P === Phase.Result && !r.roundWon)) {
            // he falls: flat on his back, the helm rolling away, his spirit rising out of him
            const q = P === Phase.Fallen ? Math.min(1, r.phaseTime / 1.4) : 1;
            this._blit(cs(S.HeroFallen), x - 11, y - 3, false, MODE_NORMAL);
            const hq = Math.min(1, q * 1.6);
            this._blit(cs(S.HelmOff), x - 20 - Math.round(hq * 6), y - 6 - Math.round(Math.sin(hq * Math.PI) * 6), false, MODE_NORMAL);
            if (P === Phase.Fallen) this._blit(cs(S.Ghost[Math.floor(t * 3) & 1]), x - 7, y - 14 - Math.round(q * 22), false, MODE_PHASE);
            return;
        }
        if (P === Phase.Stairs) {
            // down the stairs: he sinks into the steps
            const q = Math.min(1, r.phaseTime / 1.2);
            this._clipTo(s, OX, OY, VIEW_W, Math.max(0, y + 5 - OY));
            this._blit(cs(S.Hero.down[Math.floor(q * 6) & 1 ? 'a' : 'b']), x - 8, y - 12 + Math.round(q * 17), false, MODE_NORMAL);
            this._clipTo(s, OX, OY, VIEW_W, VIEW_H);
            return;
        }
        if (P === Phase.Result && r.roundWon) {
            // out of the keep: he stands on the last stairs with his axe held high, stars wheeling round him
            this._blit(cs(S.Hero.down.stand), x - 8, y - 12, false, MODE_NORMAL);
            this._blit(cs(S.HeldAxe), x + 2, y - 20, false, MODE_NORMAL);
            for (let k = 0; k < 5; k++) {
                const a = t * 2 + k * 1.2566;
                this._star(s, x + Math.round(Math.cos(a) * 16), y - 6 + Math.round(Math.sin(a) * 7));
            }
            return;
        }
        const body = cs(S.Hero[view][pose]);
        const axe = cs(S.HeldAxe);
        // the axe in hand: raised behind for a throw, else at his side
        const throwing = h.throwT > 0 || h.firing;
        if (view === 'up') {
            this._blit(axe, x + 3, y - 12, false, mode);
            this._blit(body, x - 8, y - 12, false, mode);
        } else if (view === 'down') {
            this._blit(body, x - 8, y - 12, false, mode);
            if (throwing && h.throwT > 0) this._blit(axe, x + 2, y - 4, false, mode);
            else this._blit(axe, x + 3, y - 8, false, mode);
        } else {
            this._blit(body, x - 8, y - 12, left, mode);
            if (h.throwT > 0) this._blit(axe, left ? x - 12 : x + 3, y - 10 + (DY8[f] > 0 ? 3 : DY8[f] < 0 ? -3 : 0), left, mode);
            else this._blit(axe, left ? x - 8 : x, y - 6, left, mode);
        }
        if (h.ward > 0) {
            // the keep's ward (credit 5 at its floor): a cold ring
            s.circle(x, y - 3, 11, c.blue, false);
        }
        if (h.firing) {
            // a small aim mark the way he throws
            const ax = x + DX8[f] * 13, ay = y - 3 + DY8[f] * 13;
            s.setPixel(ax, ay, c.torchHi);
        }
    }

    // ------------------------------------------------------------------ axes and fire
    _drawShots(d, t) {
        for (const a of d.axes) {
            const x = OX + Math.round(a.x) - this.cx, y = OY + Math.round(a.y) - this.cy;
            const fr = Math.floor(a.t * 22) & 3;
            this._blit(cs(S.AxeSpin[fr]), x - 5, y - 5, a.vx < 0, MODE_NORMAL);
        }
        for (const b of d.bolts) {
            const x = OX + Math.round(b.x) - this.cx, y = OY + Math.round(b.y) - this.cy;
            this._blit(cs(S.Bolt[Math.floor(b.t * 10) & 1]), x - 4, y - 4, false, MODE_NORMAL);
            // a short trail
            const s = this._surf;
            s.setPixel(Math.round(x - b.vx * 0.05), Math.round(y - b.vy * 0.05), this.col.ember);
            s.setPixel(Math.round(x - b.vx * 0.08), Math.round(y - b.vy * 0.08), this.col.redLo);
        }
    }

    // ------------------------------------------------------------------ effects
    _drawFx(d, t) {
        const s = this._surf, c = this.col;
        for (const e of d.fx) {
            const x = OX + Math.round(e.x) - this.cx, y = OY + Math.round(e.y) - this.cy, q = e.t;
            switch (e.kind) {
                case Fx.Puff: {
                    if (q > 0.4) break;
                    const cols = [[c.white, c.ghost], [c.green, c.greenLo], [c.torch, c.red], [c.purple, c.purpleLo], [c.purple, c.bg]][e.a] || [c.white, c.bone];
                    const rad = 2 + q * 30;
                    for (let k = 0; k < 8; k++) {
                        const a = k * Math.PI / 4 + e.x * 0.1;
                        s.setPixel(x + Math.round(Math.cos(a) * rad), y - 4 + Math.round(Math.sin(a) * rad), q < 0.2 ? cols[0] : cols[1]);
                    }
                    // a burst: a solid plus, then a thin one, while the sparks fly
                    if (q < 0.1) { s.rect(x - 4, y - 5, 9, 3, cols[0]); s.rect(x - 1, y - 8, 3, 9, cols[0]); s.rect(x - 1, y - 5, 3, 3, c.white); }
                    else if (q < 0.2) { s.rect(x - 3, y - 4, 7, 1, cols[1]); s.rect(x, y - 7, 1, 7, cols[1]); }
                    break;
                }
                case Fx.Clink: {
                    if (q > 0.16) break;
                    const col = e.a === 1 ? c.torch : c.torchHi;
                    const rr = 1 + Math.round(q * 20);
                    s.setPixel(x - rr, y - rr, col); s.setPixel(x + rr, y - rr, col); s.setPixel(x - rr, y + rr, c.white); s.setPixel(x + rr, y + rr, col);
                    if (q < 0.06) s.setPixel(x, y, c.white);
                    break;
                }
                case Fx.Rubble: {
                    if (q > 0.8) break;
                    for (let k = 0; k < 12; k++) {
                        const a = k * 0.52 + 0.3, sp = 18 + (k % 4) * 9;
                        const px = x + Math.round(Math.cos(a) * sp * q), py = y + Math.round(Math.sin(a) * sp * q * 0.6 - 30 * q + 50 * q * q);
                        s.rect(px, py, 2, 2, k & 1 ? c.boneLo : c.wl3);
                    }
                    if (q < 0.5) s.circle(x, y, Math.round(4 + q * 28), c.wl4, false);
                    break;
                }
                case Fx.Door: {
                    if (q > 0.5) break;
                    for (let k = 0; k < 5; k++) {
                        const a = k * 1.25 + e.y * 0.1;
                        s.rect(x + Math.round(Math.cos(a) * q * 26), y + Math.round(Math.sin(a) * q * 18), 2, 1, k & 1 ? c.wood : c.woodLo);
                    }
                    break;
                }
                case Fx.Blast: {
                    if (q > 0.7) break;
                    const R = Math.round(q * 330);
                    s.circle(x, y, R, c.white, false); s.circle(x, y, Math.max(0, R - 3), c.blue, false);
                    s.circle(x, y, Math.max(0, R - 9), c.blueLo, false);
                    if (R > 20) s.circle(x, y, R - 20, c.blue, false);
                    break;
                }
                case Fx.Text: {
                    if (q > 1.0) break;
                    const yy = y - 10 - Math.round(q * 14);
                    const w = PixelFont.Small.measure(e.text);
                    s.text(e.text, x - (w >> 1) + 1, yy + 1, PixelFont.Small, c.bg);
                    s.text(e.text, x - (w >> 1), yy, PixelFont.Small, q < 0.7 ? c.torchHi : c.torch);
                    break;
                }
                case Fx.Shatter: {
                    if (q > 0.45) break;
                    for (let k = 0; k < 7; k++) {
                        const a = k * 0.9, sp = 20 + k * 4;
                        s.setPixel(x + Math.round(Math.cos(a) * sp * q), y + Math.round(Math.sin(a) * sp * q - 10 * q + 40 * q * q), k & 1 ? c.torch : c.ember);
                    }
                    break;
                }
                case Fx.Sparkle: {
                    if (q > 0.7) break;
                    for (let k = 0; k < 4; k++) {
                        const a = k * 1.57 + q * 3;
                        this._star(s, x + Math.round(Math.cos(a) * (4 + q * 14)), y - 2 + Math.round(Math.sin(a) * (3 + q * 10)));
                    }
                    break;
                }
                case Fx.Sated: case Fx.Burst: {
                    if (q > 1.0) break;
                    const big = e.kind === Fx.Burst;
                    for (let k = 0; k < (big ? 10 : 6); k++) {
                        const a = k * (big ? 0.628 : 1.05) + q;
                        const rr = (big ? 26 : 10) * q;
                        s.setPixel(x + Math.round(Math.cos(a) * rr), y - 6 - Math.round(q * 16) + Math.round(Math.sin(a) * rr * 0.6), k & 1 ? c.purple : (big ? c.white : c.purpleLo));
                    }
                    break;
                }
            }
        }
    }

    // ------------------------------------------------------------------ the panel
    _drawPanel(s, r, d, t) {
        const c = this.col, arc = PixelFont.Arcade, dsp = PixelFont.Display, sml = PixelFont.Small;
        const x0 = PX, cxm = PX + (PW >> 1);
        s.rect(x0, 8, PW, 224, c.bg);
        s.frame(x0, 8, PW, 224, c.goldLo);
        s.frame(x0 + 2, 10, PW - 4, 220, c.wl2);
        const hp = Math.max(0, Math.ceil(d.hero.hp));
        const low = hp < 150 && r.p === Phase.Running;
        s.textCentered('HEALTH', cxm, 15, arc, c.torch);
        const hcol = low ? (SurfaceDraw.blink(t, 1) ? c.red : c.torchHi) : hp < 300 ? c.torch : c.white;
        const hs = String(Math.min(9999, hp));
        s.textCentered(hs, cxm + 1, 26, dsp, hcol, 2);
        // the bar (a full bar = 1000)
        const bw = PW - 12, fill = Math.max(0, Math.min(bw, Math.round(bw * hp / 1000)));
        s.rect(x0 + 6, 45, bw, 4, c.wl1);
        s.rect(x0 + 6, 45, fill, 4, low ? c.red : c.torch);
        s.rect(x0 + 6, 45, fill, 1, low ? c.torch : c.torchHi);
        s.textCentered('SCORE', cxm, 56, arc, c.boneLo);
        s.textCentered(d6(d.score), cxm, 66, dsp, c.torchHi);
        s.dottedRule(x0 + 6, x0 + PW - 6, 80, 2, c.wl2);
        // keys and potions as icons (a count past four)
        s.text('KEYS', x0 + 6, 86, sml, c.boneLo);
        this._icons(s, cs(S.Key), d.hero.keys, x0 + 5, 94, 13, 7);
        s.text('POTIONS', x0 + 6, 106, sml, c.boneLo);
        this._icons(s, cs(S.Potion), d.hero.potions, x0 + 5, 113, 10, 10);
        s.dottedRule(x0 + 6, x0 + PW - 6, 128, 2, c.wl2);
        s.textCentered('LEVEL', cxm, 134, arc, c.torch);
        s.textCentered(String(r.level), cxm - 8, 145, dsp, c.white, 2);
        s.text('/' + r.levels, cxm + 5, 153, arc, c.boneLo);
        // the depth: a column of steps, lit down to where you are
        for (let k = 0; k < r.levels; k++) {
            const lx = x0 + 8 + k * 11, ly = 168;
            const done = k < r.level - 1, here = k === r.level - 1;
            s.rect(lx, ly, 9, 4, done ? c.goldLo : here ? c.torchHi : c.wl1);
            if (here) s.rect(lx, ly + 4, 9, 1, c.torch);
        }
        // the level's name, wrapped
        const words = r.levelDef.name.split(' ');
        const lines = [];
        for (const w of words) {
            if (lines.length && (lines[lines.length - 1] + ' ' + w).length <= 10) lines[lines.length - 1] += ' ' + w;
            else lines.push(w);
        }
        lines.forEach((ln, i) => s.textCentered(ln, cxm, 182 + i * 10, arc, c.bone));
        if (r.mercyActive) s.textCentered('SPARED', cxm, 214, arc, c.blue);
        else {
            const gens = d.gens.reduce((a, g) => a + (g.alive ? 1 : 0), 0);
            s.textCentered('LAIRS ' + gens, cxm, 214, sml, gens ? c.ember : c.wl3);
        }
    }

    _icons(s, sp, n, x, y, step, per) {
        const show = Math.min(n, 4);
        for (let i = 0; i < show; i++) this._blitTo(s, sp, x + i * step, y, false, MODE_NORMAL, null);
        if (n > 4) s.text('+' + (n - 4), x + 4 * step - 2, y + 2, PixelFont.Small, this.col.torchHi);
        if (n === 0) s.text('-', x + 4, y, PixelFont.Arcade, this.col.wl3);
        void per;
    }

    // ------------------------------------------------------------------ cards and plates
    _drawOverlay(s, r, d, t) {
        const c = this.col, dsp = PixelFont.Display, arc = PixelFont.Arcade, sml = PixelFont.Small;
        const mx = OX + (VIEW_W >> 1), my = OY + (VIEW_H >> 1);
        const P = r.p, pt = r.phaseTime, def = r.levelDef;
        if (P === Phase.Card) {
            s.plate(mx - 98, my - 62, 196, 112, c.bg, c.goldLo);
            s.frame(mx - 96, my - 60, 192, 108, c.wl2);
            s.textCentered('LEVEL ' + r.level, mx, my - 52, dsp, c.torchHi, 2);
            s.textCentered(def.name, mx, my - 32, arc, c.bone);
            s.dottedRule(mx - 70, mx + 70, my - 22, 3, c.goldLo);
            // the featured foe (or thing), big, over its hint
            const sp = { bones: S.BonePile[2], key: S.Key, imp: S.Imp[0], warlock: S.Warlock[0], wraith: S.Wraith[0] }[def.feature];
            if (sp) this._blitTo(s, cs(sp), mx - sp.width - 1, my - 16 + Math.max(0, 16 - sp.height), false, MODE_NORMAL, 2);
            s.textCentered(def.hint, mx, my + 22, arc, c.torch);
            if (r.mercyActive) s.textCentered('THE KEEP SPARES YOU', mx, my + 36, arc, c.blue);
            else if (r.level === 1) s.textCentered('FOOD KEEPS YOU ALIVE', mx, my + 36, sml, c.boneLo);
            // which one is you
            if (r.level === 1 && SurfaceDraw.blink(t, 1)) {
                const hx = OX + Math.round(d.hero.x) - this.cx, hy = OY + Math.round(d.hero.y) - this.cy;
                s.plate(hx + 9, hy - 10, 26, 11, c.bg, c.torchHi);
                for (let i = 0; i < 4; i++) s.rect(hx + 10 - i, hy - 5 - i, 1, 2 * i + 1, c.torchHi);
                s.text('YOU', hx + 13, hy - 8, arc, c.torchHi);
            }
        } else if (P === Phase.Stairs) {
            s.textBox('DOWN THE STAIRS', mx, OY + 26, arc, 2, c.torchHi, c.goldLo, c.bg);
            if (pt > 0.5) {
                const heroLow = OY + Math.round(d.hero.y) - this.cy > OY + (VIEW_H >> 1);
                const py = heroLow ? OY + 48 : OY + VIEW_H - 50;
                s.plate(mx - 64, py, 128, 30, c.bg, c.goldLo);
                s.textCentered('STAIRS BONUS', mx, py + 5, arc, c.bone);
                s.textCentered(String(r.lastBonus), mx, py + 16, dsp, c.torchHi);
            }
        } else if (P === Phase.Fallen) {
            s.textBox('YOU HAVE FALLEN', mx, OY + 30, arc, 2, c.red, c.redLo, c.bg);
        } else if (P === Phase.Result || P === Phase.Over) {
            const won = r.roundWon, spec = DeepKeepSpec;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, mx, OY + 24, dsp, 2, won ? c.torchHi : c.red, won ? c.goldLo : c.redLo, c.bg);
            // the score plate sits on the half of the window the hero is not in
            const heroLow = OY + Math.round(d.hero.y) - this.cy > OY + (VIEW_H >> 1);
            const py = heroLow ? OY + 46 : OY + VIEW_H - 64;
            s.plate(mx - 84, py, 168, 50, c.bg, won ? c.goldLo : c.redLo);
            s.textCentered('SCORE ' + d6(r.score), mx, py + 7, arc, c.torchHi, 2);
            s.textCentered('LEVELS ' + r.levelsCleared + ' OF ' + r.levels, mx, py + 28, arc, won ? c.bone : c.boneLo, 1);
            s.textCentered(won ? 'THE KEEP LETS YOU GO' : 'THE KEEP KEEPS YOU', mx, py + 39, sml, won ? c.torch : c.ember);
        }
    }

    // the clip rect is kept here too, so the fast blitter can honour it
    _clipTo(s, x, y, w, h) { s.clip(x, y, w, h); this._clip = [Math.max(0, x), Math.max(0, y), Math.min(s.width, x + w), Math.min(s.height, y + h)]; }
    _noClip(s) { s.noClip(); this._clip = [0, 0, s.width, s.height]; }

    // ------------------------------------------------------------------ the blitter (clip-aware, straight into the RGBA words)
    _blit(cs, x, y, flip = false, mode = MODE_NORMAL) { this._blitTo(this._surf, cs, x, y, flip, mode, null); }

    _blitTo(s, cs, x, y, flip, mode, scale) {
        const u = this._u32, SW = s.width, pk = this.pk;
        const [x0, y0, x1, y1] = this._clip;
        const src = flip ? cs.flip : cs.idx, w = cs.w, h = cs.h, k = scale || 1;
        const bg = pk[this.iBg], white = pk[this.iWhite], phase = pk[this.iPurpleLo], dark = pk[this.iWl1], aura = pk[this.iAura];
        for (let j = 0; j < h; j++)
            for (let i = 0; i < w; i++) {
                const v = src[j * w + i];
                if (v === -1) continue;
                let col;
                if (v === -2) col = mode === MODE_PHASE ? -1 : mode === MODE_AURA ? aura : bg;
                else if (mode === MODE_WHITE) col = white;
                else if (mode === MODE_HURT) col = pk[this.hurtMap[v]];
                else if (mode === MODE_DARK) col = (((i + j) & 1) === 0) ? dark : bg;
                else if (mode === MODE_PHASE) col = (((i + j + (this.t * 8 | 0)) & 3) === 0) ? phase : -1;
                else col = pk[v];
                if (col === -1) continue;
                const px = x + i * k, py = y + j * k;
                if (k === 1) {
                    if (px < x0 || py < y0 || px >= x1 || py >= y1) continue;
                    u[py * SW + px] = col;
                } else {
                    for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
                        const qx = px + a, qy = py + b;
                        if (qx < x0 || qy < y0 || qx >= x1 || qy >= y1) continue;
                        u[qy * SW + qx] = col;
                    }
                }
            }
    }
}

