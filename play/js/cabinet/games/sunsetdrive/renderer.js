// THE NODE · world 1 · SUNSET DRIVE on the Cabinet Engine · THE PICTURE.
//
//   SKY      ten bands per stage, dithered where they meet; when a stage changes, the new sky rises from
//            the horizon like a curtain. A big striped sun sinks toward the horizon as the course goes by.
//   LAYERS   parallax silhouettes with a sunlit rim (headlands, mesas, mountains, the bay's city with lit
//            windows), clouds lit from below, a few birds; the open sea under the horizon with a glitter path
//   ROAD     one pass per scanline, front to back: for each row the exact point on the segment is solved
//            (perspective-correct), then the ground, the sea and its foam line, rumble strips, asphalt, edge
//            lines and lane dashes are span-filled. Two roads at the fork. Crests hide what is behind them.
//   SPRITES  far to near, every roadside kind, the traffic, smoke puffs and the player's car scaled from
//            their segment and clipped at the crest in front of them
//   HUD      SCORE, TIME (big), the course map and stage, the speedo + tachometer + gear
import { PixelFont, SurfaceDraw, dn } from '../../sdk/index.js';
import { P } from './palette.js';
import { u32Of, hspan, vspan, px, box, blitScaled, blit1, h01, W } from './blit.js';
import { SunsetPalette } from './palette.js';
import {
    VIEW_X0, VIEW_Y0, VIEW_X1, VIEW_Y1, VIEW_CX, HORIZON, CAR_BOTTOM,
    SEG, ROAD_W, CAM_H, FOCAL, CAR_Z, DRAW, Ter, MAXS,
} from './constants.js';
import { segAt, heightAt } from './course.js';
import { Art, KIND } from './art.js';
import { SunsetRound } from './round.js';
import { SunsetSpec } from './spec.js';

const Phase = SunsetRound.Phase;
const NEAR = 30;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colour tables (packed)
const SKY = [0, 1, 2, 3].map(t => { const n = ['coast', 'canyon', 'hills', 'bay'][t]; return Array.from({ length: 10 }, (_, i) => P('sky_' + n + i)); });
const GROUND = [
    [P('gCoast'), P('gCoastLo'), P('gCoastFar')],
    [P('gCanyon'), P('gCanyonLo'), P('gCanyonFar')],
    [P('gHills'), P('gHillsLo'), P('gHillsFar')],
    [P('gBay'), P('gBayLo'), P('gBayFar')],
];
const SEA_DAY = [P('seaBand'), P('seaBandLo')], SEA_DUSK = [P('duskSeaBand'), P('duskSeaBandLo')];
const FAR_SEA_DAY = [P('seaFar0'), P('seaFar1'), P('seaFar2'), P('seaFar3')];
const FAR_SEA_DUSK = [P('duskSea0'), P('duskSea1'), P('duskSea2'), P('duskSea3')];
const ROAD = [P('asphalt'), P('asphaltLo')];
const RUMBLE_C = [P('red'), P('rumbleW')];
const c = {};
for (const n of ['bg', 'white', 'cream', 'yellow', 'orange', 'pink', 'magenta', 'violet', 'navy', 'red', 'ink', 'lane', 'edge', 'foam', 'foamLo',
    'sunHi', 'sun', 'sunLo', 'sunPink', 'sunDeep', 'glint', 'coastFar', 'coastFarRim', 'canyonFar', 'canyonFarRim', 'canyonNear', 'canyonNearRim',
    'canyonLand', 'hillsFar', 'hillsFarRim', 'hillsNear', 'hillsNearRim', 'hillsLand', 'city', 'cityRim', 'bayFar', 'bayFarRim', 'winLit', 'winWarm',
    'smokeHi', 'smoke', 'smokeLo', 'spark', 'shadow', 'sand', 'sandLo', 'greyLo', 'grey', 'hudPlate', 'hudDim', 'tachG', 'tachY', 'tachR', 'tachOff',
    'mapRoad', 'palm', 'cypLo', 'rockLo', 'gCanyon', 'gHills', 'gCoast', 'lime', 'purple', 'neonCyan', 'blonde'])
    c[n] = P(n);
// the SDK text calls take Rgba: the same colours as palette objects
const R = new Proxy({}, { get: (_, n) => SunsetPalette.get(n) });

// ------------------------------------------------------------------ the parallax layers (built once)
function layer(fn) { const a = new Int16Array(512); for (let x = 0; x < 512; x++) a[x] = Math.max(0, Math.round(fn(x))); return a; }
const S = (k, x, ph = 0) => Math.sin(TAU * k * x / 512 + ph);
const LAYERS = [
    // coast: islands and a headland on the horizon, open sea between
    { far: layer(x => 11 * S(2, x, 1) + 6 * S(5, x) + 3 * S(13, x, 2) - 5), farC: c.coastFar, farRim: c.coastFarRim, near: null },
    // canyon: stepped mesas, then low jagged ridges in front
    {
        far: layer(x => { const b = 14 + 10 * S(3, x) + 6 * S(7, x, 2); return b > 17 ? 30 + 2 * S(31, x) : b > 8 ? 16 + S(29, x) : 5 + 2 * S(17, x); }),
        farC: c.canyonFar, farRim: c.canyonFarRim,
        near: layer(x => 6 + 6 * Math.abs(S(9, x)) + 3 * S(23, x, 1) + 1.5 * S(57, x)), nearC: c.canyonNear, nearRim: c.canyonNearRim,
    },
    // hills: blue mountains, green rolling hills
    {
        far: layer(x => 20 + 12 * S(3, x) + 7 * S(8, x, 1) + 3 * S(21, x, 2)), farC: c.hillsFar, farRim: c.hillsFarRim,
        near: layer(x => 9 + 6 * S(4, x, 0.5) + 3 * S(11, x) + 1 * S(37, x)), nearC: c.hillsNear, nearRim: c.hillsNearRim,
    },
    // bay: a headland and the city's towers on the left, the open sea (and the sun) on the right
    {
        far: layer(x => {
            if (x >= 30 && x < 170) { const blk = Math.floor((x - 30) / 9); return 8 + Math.floor(h01(blk, 5) * 22) + (h01(blk, 9) < 0.2 ? 8 : 0); }
            if (x >= 170 && x < 206) return Math.max(0, 9 + 3 * S(9, x) - (x - 170) * 0.26);
            if (x >= 0 && x < 30) return 5 + x * 0.1;
            if (x >= 470) return Math.max(0, (x - 470) * 0.2 + 2 * S(11, x));
            return 0;
        }),
        farC: c.city, farRim: c.cityRim, city: true, near: null,
    },
];

const LAND_FAR = [null, c.canyonLand, c.hillsLand, null];
const BAY_OFF = 40, BAY_SUN = 250;           // the bay skyline's offset at the stage start; where the sun then sits

// ------------------------------------------------------------------ the renderer
export class SunsetRenderer {
    constructor() {
        // per-frame projection of the visible segments
        this._clip = new Float64Array(DRAW + 2);
        this._sy = new Float64Array(DRAW + 2);
        this._sc = new Float64Array(DRAW + 2);
        this._xc = new Float64Array(DRAW + 2);
        this._ok = new Uint8Array(DRAW + 2);
    }

    draw(sim, s, t) {
        s.noClip();
        s.clear(R.bg);
        if (sim == null || sim.track == null) return;
        const u = u32Of(s);
        const tr = sim.track;
        const camZ = sim.pos, camX = sim.x * ROAD_W, pz = camZ + CAR_Z;
        const camY = heightAt(tr, pz) + CAM_H;
        const bgX = sim.bgX || 0;
        this._skyAndLayers(u, sim, t, bgX);
        this._road(u, sim, tr, camZ, camX, camY);
        this._sprites(u, sim, tr, camZ, camX, camY, t);
        this._hud(s, u, sim, t);
        this._overlays(s, u, sim, t);
        s.noClip();
    }

    // ------------------------------------------------------------------ sky, sun, clouds, layers
    _skyAndLayers(u, sim, t, bgX) {
        const w = Math.min(1, Math.max(0, (sim.time - sim.skyT0) / 2.4));
        const wipeY = w >= 1 ? -999 : HORIZON + 4 - w * (HORIZON - VIEW_Y0 + 8);
        const terAt = (y) => (y >= wipeY ? sim.skyTo : sim.skyFrom);
        const top = VIEW_Y0, span = HORIZON - top;
        // the bands (checker-dithered for two rows where they meet)
        for (let y = top; y < HORIZON; y++) {
            const ter = terAt(y);
            const f = (y - top) / span * 10;
            const b = Math.min(9, Math.floor(f)), frac = f - b;
            const col = SKY[ter][b], nxt = SKY[ter][Math.min(9, b + 1)];
            if (frac > 0.78 && b < 9) {
                const o = y * W;
                for (let x = VIEW_X0; x < VIEW_X1; x++) u[o + x] = ((x + y) & 1) ? nxt : col;
            } else hspan(u, y, VIEW_X0, VIEW_X1, col);
        }
        const terTop = sim.skyTo, dusk = terTop === Ter.Bay;
        // the sun: it sinks with the course, sits a little right of centre, turns with the road
        const prog = sim.progress;
        // (in the bay the sun rides with the skyline, both at infinity: it drifts to the middle by the goal)
        let sx = VIEW_CX + 30 + 80 * Math.tanh(bgX * 0.45 / 160);
        if (sim.skyTo === Ter.Bay) sx += (BAY_SUN - (bgX - (sim.bgX0 || 0)) * 0.7 - sx) * w;
        const sy = HORIZON - 40 + prog * 40;
        this._sun(u, sx, sy, 31);
        // clouds lit from below, slow drift + parallax
        const cl = dusk ? Art.duskClouds : Art.clouds;
        const CL = [[4, 20, 16], [5, 250, 26], [6, 440, 12], [2, 150, 50], [3, 60, 64], [1, 330, 58], [0, 520, 44]];
        for (const [k, x0, y] of CL) {
            const x = wrapRange(x0 + bgX * 0.6 - sim.time * 1.5, -130, 620);
            blit1(u, cl[k], x, y);
        }
        // a few birds, flapping slowly
        for (let k = 0; k < 3; k++) {
            const bx = wrapRange(40 + k * 23 + sim.time * (6 + k) + bgX * 0.6, -20, 420), by = 44 + k * 5 + Math.round(Math.sin(sim.time * 0.7 + k) * 2);
            blit1(u, Art.birds[(Math.floor(sim.time * 1.6 + k * 0.5)) & 1], bx, by);
        }
        // under the horizon: the open sea (coast, bay) or the far land
        for (let y = HORIZON; y < VIEW_Y1; y++) {
            const ter = terAt(y);
            const land = LAND_FAR[ter];
            if (land != null) { hspan(u, y, VIEW_X0, VIEW_X1, land); continue; }
            const pal = ter === Ter.Bay ? FAR_SEA_DUSK : FAR_SEA_DAY;
            const d = y - HORIZON;
            hspan(u, y, VIEW_X0, VIEW_X1, pal[d < 2 ? 0 : d < 5 ? 1 : d < 10 ? 2 : 3]);
            // the sun's glitter path
            if (d < 26) {
                const halfW = 3 + d * 0.9;
                for (let k = 0; k < 3; k++) {
                    const gx = sx + (h01(y * 7 + k, Math.floor(sim.time * 2)) - 0.5) * halfW * 2;
                    const len = 1 + Math.floor(h01(y, k + 9) * (2 + d * 0.3));
                    if (h01(y * 3 + k, Math.floor(sim.time * 2) + 50) < 0.55) hspan(u, y, gx, gx + len, (d + k) % 3 === 0 ? c.white : c.glint);
                }
            }
        }
        // the parallax layers
        for (const which of ['far', 'near']) {
            for (let x = VIEW_X0; x < VIEW_X1; x++) {
                // each column belongs to the sky it stands in (the curtain rises through them too)
                const ter = terAt(HORIZON - 1);
                const L = LAYERS[ter];
                const arr = L[which];
                if (!arr) continue;
                // (the bay's skyline is anchored where the stage began, so the sun always sets over open water)
                const off = ter === Ter.Bay ? (bgX - (sim.bgX0 || 0)) * 0.7 + BAY_OFF : which === 'far' ? bgX * 0.7 : bgX;
                const xi = ((x + Math.round(off)) % 512 + 512) % 512;
                const h = arr[xi];
                if (h <= 0) continue;
                const y0 = HORIZON - h;
                const col = which === 'far' ? L.farC : L.nearC, rim = which === 'far' ? L.farRim : L.nearRim;
                vspan(u, x, y0 + 1, HORIZON, col);
                px(u, x, y0, rim);
                if (L.city && which === 'far') {
                    for (let y = y0 + 3; y < HORIZON - 1; y += 3)
                        if ((xi % 3) === 1 && h01(xi * 131 + y, 3) < 0.34) px(u, x, y, h01(xi, y) < 0.7 ? c.winLit : c.winWarm);
                }
            }
        }
    }

    _sun(u, cx, cy, r) {
        for (let dy = -r; dy <= r; dy++) {
            const y = Math.round(cy + dy);
            if (y >= HORIZON || y < VIEW_Y0) continue;
            const hw = Math.sqrt(r * r - dy * dy);
            const f = (dy + r) / (2 * r);
            // the stripes: gaps that thicken toward the bottom
            if (f > 0.5) {
                const k = (f - 0.5) * 2;                                  // 0..1 over the lower half
                const period = 6, gap = 1 + Math.floor(k * 3.2);
                if (((dy + r) % period) < gap) continue;
            }
            const col = f < 0.18 ? c.sunHi : f < 0.42 ? c.sun : f < 0.62 ? c.sunLo : f < 0.8 ? c.sunPink : c.sunDeep;
            hspan(u, y, cx - hw, cx + hw, col);
        }
    }

    // ------------------------------------------------------------------ the road, one pass per scanline
    _road(u, sim, tr, camZ, camX, camY) {
        const segs = tr.segs, base = segAt(tr, camZ);
        const bi = base.i, frac = (camZ - base.z) / SEG;
        let x = 0, dx = -(base.curve * frac);
        let maxy = VIEW_Y1;
        for (let n = 0; n < DRAW; n++) {
            const sgi = bi + n;
            if (sgi + 1 >= segs.length) { this._ok[n] = 0; continue; }
            const sa = segs[sgi], sb = segs[sgi + 1];
            const z1 = sa.z - camZ, z2 = z1 + SEG;
            const xc1 = x, xc2 = x + dx;
            x += dx; dx += sa.curve;
            this._clip[n] = maxy;
            this._xc[n] = xc1;
            this._ok[n] = z1 > NEAR ? 1 : 0;
            if (z1 > NEAR) { this._sc[n] = FOCAL / z1; this._sy[n] = HORIZON + (camY - sa.y) * FOCAL / z1; }
            if (z2 <= NEAR) continue;
            const y2 = HORIZON + (camY - sb.y) * FOCAL / z2;
            const y1 = z1 > NEAR ? HORIZON + (camY - sa.y) * FOCAL / z1 : 1e6;
            if (y2 >= y1 || y2 >= maxy) continue;
            const rowTop = Math.max(VIEW_Y0, Math.ceil(y2 - 0.5)), rowBot = Math.min(maxy, Math.floor(Math.min(y1, 1e5) - 0.5) + 1, VIEW_Y1);
            if (rowTop >= rowBot) { maxy = Math.min(maxy, Math.max(VIEW_Y0, Math.ceil(y2 - 0.5))); continue; }
            const t0 = z1 > NEAR ? 0 : (NEAR - z1) / SEG;
            const far = z1 > DRAW * SEG * 0.56;
            this._rows(u, sa, sb, rowTop, rowBot, z1, camY, camX, xc1, xc2, t0, far, sim);
            maxy = rowTop;
        }
    }

    _rows(u, sa, sb, rowTop, rowBot, z1, camY, camX, xc1, xc2, t0, far, sim) {
        const light = sa.band === 0;
        const g = GROUND[sa.ter], gR = GROUND[sa.terR];
        const gl = far ? g[2] : light ? g[0] : g[1], glR = far ? gR[2] : light ? gR[0] : gR[1];
        const sea = sa.ter === Ter.Bay || sa.terR === Ter.Bay ? SEA_DUSK : SEA_DAY;
        const seaC = light ? sea[0] : sea[1];
        const rd = light ? ROAD[0] : ROAD[1], rb = light ? RUMBLE_C[0] : RUMBLE_C[1];
        const dyw = sb.y - sa.y;
        const nRoads = sa.n;
        for (let y = rowTop; y < rowBot; y++) {
            const dy = y + 0.5 - HORIZON;
            const den = dy * SEG + FOCAL * dyw;
            let t = Math.abs(den) < 1e-6 ? 0 : (FOCAL * (camY - sa.y) - dy * z1) / den;
            if (t < t0) t = t0; else if (t > 1) t = 1;
            const Z = z1 + t * SEG, sc = FOCAL / Z;
            const xc = xc1 + (xc2 - xc1) * t;
            const X = (wx) => VIEW_CX + ((wx * ROAD_W) + xc - camX) * sc;
            const hw = ROAD_W * sc;
            // ground (two terrains at the fork, split at the median line)
            if (sa.split === sa.split) {
                const sp = X(sa.split + ((sb.split === sb.split ? sb.split : sa.split) - sa.split) * t);
                hspan(u, y, VIEW_X0, sp, gl); hspan(u, y, sp, VIEW_X1, glR);
            } else hspan(u, y, VIEW_X0, VIEW_X1, gl);
            // the sea and its foam line
            if (sa.seaL > -1e8) {
                const sx = X(sa.seaL + ((sb.seaL > -1e8 ? sb.seaL : sa.seaL) - sa.seaL) * t);
                const fw = Math.max(1, hw * 0.07);
                hspan(u, y, VIEW_X0, sx - fw, seaC); hspan(u, y, sx - fw, sx, light ? c.foam : c.foamLo);
            }
            if (sa.seaR < 1e8) {
                const sx = X(sa.seaR + ((sb.seaR < 1e8 ? sb.seaR : sa.seaR) - sa.seaR) * t);
                const fw = Math.max(1, hw * 0.07);
                hspan(u, y, sx + fw, VIEW_X1, seaC); hspan(u, y, sx, sx + fw, light ? c.foam : c.foamLo);
            }
            // roads: rumble strips, then asphalt, then paint (so two overlapping roads merge into one wide one)
            const cA = X(sa.r0 + (sb.r0 - sa.r0) * t);
            const cB = nRoads > 1 ? X(sa.r1 + (sb.r1 - sa.r1) * t) : cA;
            const rum = Math.max(1, hw * 0.13);
            hspan(u, y, cA - hw - rum, cA + hw + rum, rb);
            if (nRoads > 1) hspan(u, y, cB - hw - rum, cB + hw + rum, rb);
            hspan(u, y, cA - hw, cA + hw, rd);
            if (nRoads > 1) hspan(u, y, cB - hw, cB + hw, rd);
            if (hw > 5) {
                this._paint(u, y, cA, hw, light, nRoads > 1 ? cB : NaN);
                if (nRoads > 1) this._paint(u, y, cB, hw, light, cA);
            }
            // a line painted across the road: checkered (start, goal) or white (checkpoint)
            if (sa.line && t < 0.55) {
                if (sa.line === 2) { if (t < 0.3) { hspan(u, y, cA - hw, cA + hw, c.lane); } }
                else {
                    const sq = hw / 5, half = t < 0.275 ? 0 : 1;
                    for (let k = 0; k < 10; k++) if (((k + half) & 1) === 0) hspan(u, y, cA - hw + k * sq, cA - hw + (k + 1) * sq, c.ink);
                    for (let k = 0; k < 10; k++) if (((k + half) & 1) === 1) hspan(u, y, cA - hw + k * sq, cA - hw + (k + 1) * sq, c.lane);
                }
            }
        }
    }

    // edge lines and lane dashes on one road; `other` = the other road's centre (skip paint inside it)
    _paint(u, y, cx, hw, light, other) {
        const inside = (p) => other === other && Math.abs(p - other) < hw * 0.96;
        const ew = Math.max(1, hw * 0.035);
        const e0 = cx - hw * 0.92, e1 = cx + hw * 0.92;
        if (!inside(e0)) hspan(u, y, e0 - ew, e0, c.edge);
        if (!inside(e1)) hspan(u, y, e1, e1 + ew, c.edge);
        if (light) {
            const lw = Math.max(1, hw * 0.03);
            for (const f of [-1 / 3, 1 / 3]) { const p = cx + hw * f; hspan(u, y, p - lw / 2, p + lw / 2, c.lane); }
        }
    }

    // ------------------------------------------------------------------ sprites, traffic, smoke, the car
    _sprites(u, sim, tr, camZ, camX, camY, t) {
        const segs = tr.segs, bi = segAt(tr, camZ).i;
        const pz = camZ + CAR_Z, pi = segAt(tr, pz).i;
        // bucket the cars and puffs by segment (a handful each)
        const cars = new Map(), puffs = new Map();
        for (const car of sim.cars) { const i = Math.floor(car.z / SEG); if (!cars.has(i)) cars.set(i, []); cars.get(i).push(car); }
        for (const p of sim.smoke) { const i = Math.floor(p.z / SEG); if (!puffs.has(i)) puffs.set(i, []); puffs.get(i).push(p); }
        const K = Art.K;
        for (let n = DRAW - 1; n >= 0; n--) {
            const i = bi + n;
            if (i >= segs.length - 1) continue;
            const sg = segs[i], clip = this._clip[n];
            if (this._ok[n]) {
                const sc = this._sc[n], sy = this._sy[n], xc = this._xc[n];
                for (const o of sg.sprites) {
                    let k = K[o.k];
                    if (!k.spr) continue;
                    if (k.name === 'gantry0') k = KIND['gantry' + Math.max(0, Math.min(4, sim.lights))];
                    const w = k.spr.w * k.upx * sc, h = k.spr.h * k.upx * sc;
                    const sx = VIEW_CX + (o.x * ROAD_W + xc - camX) * sc;
                    const ax = k.anchorX !== undefined ? (o.flip ? 1 - k.anchorX : k.anchorX) : 0.5;
                    if (sx + w < VIEW_X0 - 2 || sx - w > VIEW_X1 + 2) continue;
                    blitScaled(u, k.spr, sx - w * ax, sy - h, w, h, o.flip, VIEW_Y0, clip);
                }
            }
            const nxt = this._ok[n + 1] ? n + 1 : -1;
            const cl = cars.get(i);
            if (cl) {
                cl.sort((a, b) => b.z - a.z);
                for (const car of cl) this._car(u, sim, tr, car, camZ, camX, camY, n, clip);
            }
            const pl = puffs.get(i);
            // in the car's own segment: what is behind the car first, the car, then what is in front of it
            if (pl) for (const p of pl) if (p.kind === 2 && (i !== pi || p.z >= pz)) this._puff(u, sim, tr, p, camZ, camX, camY, n, clip);
            if (i === pi) {
                this._player(u, sim, t);
                if (pl) for (const p of pl) if (p.kind === 2 && p.z < pz) this._puff(u, sim, tr, p, camZ, camX, camY, n, clip);
            }
        }
    }

    // screen position of a world point (x in half-widths, z) on segment slot n
    _proj(tr, n, x, z, camZ, camX, camY) {
        const zz = z - camZ;
        if (zz < NEAR) return null;
        const s = segAt(tr, z), nx = tr.segs[s.i + 1];
        const f = (z - s.z) / SEG;
        const xc = this._xc[n] + (n + 1 < this._xc.length ? (this._xc[n + 1] - this._xc[n]) * f : 0);
        const sc = FOCAL / zz;
        return { sc, sx: VIEW_CX + (x * ROAD_W + xc - camX) * sc, sy: HORIZON + (camY - (s.y + (nx.y - s.y) * f)) * sc };
    }

    _car(u, sim, tr, car, camZ, camX, camY, n, clip) {
        const p = this._proj(tr, n, car.x, car.z, camZ, camX, camY);
        if (!p) return;
        const k = Art.CARS[car.k];
        const w = k.spr.w * k.upx * p.sc, h = k.spr.h * k.upx * p.sc;
        if (p.sx + w < VIEW_X0 || p.sx - w > VIEW_X1) return;
        blitScaled(u, k.spr, p.sx - w / 2, p.sy - h, w, h, false, VIEW_Y0, clip);
    }

    _puff(u, sim, tr, pf, camZ, camX, camY, n, clip) {
        const age = sim.time - pf.t0, life = pf.kind === 2 ? 1.0 : 0.6;
        if (age < 0 || age > life) return;
        const a = age / life;
        const p = this._proj(tr, n, pf.x + pf.side * a * 0.18, pf.z, camZ, camX, camY);
        if (!p) return;
        const rw = (pf.kind === 2 ? 170 : 70) + a * (pf.kind === 2 ? 480 : 300);
        const r = Math.min(70, rw * p.sc), cy = p.sy - (30 + a * (pf.kind === 2 ? 520 : 200)) * p.sc;
        if (r < 1) return;
        // a round puff lit from the upper left, thinning (checker) as it goes
        let hi, mid, lo;
        if (pf.kind === 1) { const g = GROUND[pf.ter]; hi = c.cream; mid = g[0]; lo = g[1]; }
        else { hi = c.smokeHi; mid = c.smoke; lo = c.smokeLo; }
        const thin = a > 0.55 ? 1 : 0;
        const r2 = r * r, hx = p.sx - r * 0.35, hy = cy - r * 0.35, hr2 = (r * 0.55) * (r * 0.55);
        const y0 = Math.max(VIEW_Y0, Math.ceil(cy - r)), y1 = Math.min(clip, Math.floor(cy + r) + 1, VIEW_Y1);
        for (let yy = y0; yy < y1; yy++) {
            const dy = yy + 0.5 - cy, hw = Math.sqrt(Math.max(0, r2 - dy * dy));
            const x0 = Math.max(VIEW_X0, Math.round(p.sx - hw)), x1 = Math.min(VIEW_X1, Math.round(p.sx + hw));
            const o = yy * W;
            for (let x = x0; x < x1; x++) {
                if (thin && ((x + yy) & 1)) continue;
                const ex = x + 0.5 - hx, ey = yy + 0.5 - hy;
                u[o + x] = ex * ex + ey * ey < hr2 ? hi : dy > r * 0.45 ? lo : mid;
            }
        }
    }

    _player(u, sim, t) {
        const cx = VIEW_CX;
        if (sim.crash) {
            const k = sim.crash, uu = Math.min(1, k.t / k.dur);
            const hop = k.kind === 1 ? 0.5 : 1;
            const air = (uu < 0.55 ? Math.sin(uu / 0.55 * Math.PI) * 44 : uu < 0.8 ? Math.sin((uu - 0.55) / 0.25 * Math.PI) * 11 : 0) * hop;
            const ang = k.roll * Math.min(1, uu / 0.8);
            const fr = ((Math.round(ang * 12) % 12) + 12) % 12;
            // the shadow stays on the road
            const sw = 40 - air * 0.4;
            for (let j = 0; j < 5; j++) { const ins = Math.abs(j - 2) * 3; hspan(u, CAR_BOTTOM - 3 + j, cx - sw + ins, cx + sw - ins, c.shadow); }
            const spr = Art.tumble[fr];
            blit1(u, spr, cx - spr.w / 2, CAR_BOTTOM - 20 - spr.h / 2 - air);
            this._sparks(u, sim, cx, CAR_BOTTOM - 22 - air);
            return;
        }
        const lean = Math.max(-2, Math.min(2, Math.round(sim.lean)));
        const spr = Art.hero[lean + 2][sim.braking ? 1 : 0];
        let bx = 0, by = 0;
        if (sim.offroad && sim.speed > MAXS * 0.05) by = Math.round(Math.sin(sim.playerZ * 0.004) * 1.2);
        const since = sim.time - sim.bumpAt;
        if (since < 0.3) bx = Math.round(Math.sin(since * 60) * 3 * (1 - since / 0.3));
        blit1(u, spr, cx - spr.w / 2 + bx, CAR_BOTTOM - spr.h + 1 + by);
        this._wheelSmoke(u, sim, cx + bx);
        this._sparks(u, sim, cx + bx, CAR_BOTTOM - 26);
    }

    // tyre smoke (white) and dust (the ground's colour) out of the rear wheels, drawn in the car's own frame:
    // the camera trails the car by a long way, so anything left on the road behind it is under the screen
    _wheelSmoke(u, sim, cx) {
        for (const pf of sim.smoke) {
            if (pf.kind === 2) continue;
            const age = sim.time - pf.t0, life = pf.kind === 1 ? 0.5 : 0.42;
            if (age < 0 || age > life) continue;
            const a = age / life;
            const x = cx + pf.side * (35 + a * 26), y = CAR_BOTTOM - 4 - a * (pf.kind === 1 ? 30 : 22);
            const r = 3 + a * (pf.kind === 1 ? 17 : 13);
            let hi, mid, lo;
            if (pf.kind === 1) { const g = GROUND[pf.ter]; hi = c.cream; mid = g[0]; lo = g[1]; }
            else { hi = c.white; mid = c.smokeHi; lo = c.smoke; }
            this._disc(u, x, y, r, hi, mid, lo, a > 0.5, VIEW_Y1);
        }
    }

    // a shaded disc lit from the upper left; `thin` = every other pixel (the arcade's half-transparency)
    _disc(u, cxp, cy, r, hi, mid, lo, thin, clip) {
        const r2 = r * r, hx = cxp - r * 0.35, hy = cy - r * 0.35, hr2 = (r * 0.55) * (r * 0.55);
        const y0 = Math.max(VIEW_Y0, Math.ceil(cy - r)), y1 = Math.min(clip, Math.floor(cy + r) + 1, VIEW_Y1);
        for (let yy = y0; yy < y1; yy++) {
            const dy = yy + 0.5 - cy, hw = Math.sqrt(Math.max(0, r2 - dy * dy));
            const x0 = Math.max(VIEW_X0, Math.round(cxp - hw)), x1 = Math.min(VIEW_X1, Math.round(cxp + hw));
            const o = yy * W;
            for (let x = x0; x < x1; x++) {
                if (thin && ((x + yy) & 1)) continue;
                const ex = x + 0.5 - hx, ey = yy + 0.5 - hy;
                u[o + x] = ex * ex + ey * ey < hr2 ? hi : dy > r * 0.45 ? lo : mid;
            }
        }
    }

    _sparks(u, sim, cx, cy) {
        for (const s of sim.sparks) {
            const age = sim.time - s.t0;
            if (age < 0 || age > 0.6) continue;
            const n = s.big ? 22 : 12;
            for (let k = 0; k < n; k++) {
                const life = 0.25 + h01(s.seed, k) * 0.35;
                if (age > life) continue;
                const a = -Math.PI * (0.1 + 0.8 * h01(s.seed, 30 + k)), sp = (s.big ? 90 : 60) + h01(s.seed, 60 + k) * 110;
                const x = cx + Math.cos(a) * sp * age + (h01(s.seed, 90 + k) - 0.5) * 30;
                const y = cy + Math.sin(a) * sp * age + 160 * age * age;
                const col = age < life * 0.3 ? c.white : age < life * 0.6 ? c.spark : c.orange;
                const tx = x - Math.cos(a) * 3, ty = y - Math.sin(a) * 3;
                px(u, Math.round(x), Math.round(y), col); px(u, Math.round((x + tx) / 2), Math.round((y + ty) / 2), col); px(u, Math.round(tx), Math.round(ty), c.orange);
            }
        }
    }

    // ------------------------------------------------------------------ HUD
    _hud(s, u, sim, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, sml = PixelFont.Small;
        // SCORE (left)
        s.textShadow('SCORE', 14, 12, arc, R.pink, R.ink);
        s.textShadow(dn(sim.score, 6), 14, 22, dsp, R.white, R.ink);
        // TIME (centre, big)
        const P0 = sim.p;
        s.textCenteredShadow('TIME', 160, 11, arc, R.yellow, R.ink);
        if (sim.mercyActive) s.textCenteredShadow('FREE', 160, 21, dsp, R.neonCyan, R.ink, 2);
        else {
            const secs = Math.max(0, Math.ceil(sim.timeLeft - 1e-9));
            const low = secs <= 10 && P0 === Phase.Running;
            const col = low ? R.tachR : R.yellow;
            s.textCenteredShadow(String(secs), 160, 21, dsp, col, R.ink, 3);
        }
        // the course map and the stage (right)
        this._map(s, u, sim, t);
        // speedo, tach, gear (bottom left)
        const kmh = sim.speedKmh;
        const lit = Math.round(Math.min(1, Math.max(0, sim.engineRpm)) * 16);
        for (let k = 0; k < 16; k++) {
            const col = k >= lit ? c.tachOff : k < 10 ? c.tachG : k < 14 ? c.tachY : c.tachR;
            box(u, 14 + k * 5, 199 - Math.floor(k / 3), 4, 6 + Math.floor(k / 3), col);
        }
        s.textShadow(sim.gear ? 'HIGH' : 'LOW', 14, 186, arc, sim.gear ? R.orange : R.lime, R.ink);
        const ks = String(kmh).padStart(3, ' ');
        s.textShadow(ks, 14, 208, dsp, R.white, R.ink, 2);
        s.textShadow('KM/H', 66, 215, arc, R.yellow, R.ink);
    }

    _map(s, u, sim, t) {
        const x0 = 244, y0 = 11, w = 64, h = 30;
        // a dark plate with a thin rim
        box(u, x0 - 4, y0 - 3, w + 3, h + 2, c.hudPlate);
        for (let x = x0 - 4; x < x0 + w - 1; x++) { px(u, x, y0 - 3, c.violet); px(u, x, y0 + h - 2, c.violet); }
        for (let y = y0 - 3; y < y0 + h - 1; y++) { px(u, x0 - 4, y, c.violet); px(u, x0 + w - 2, y, c.violet); }
        const tr = sim.track, pz = sim.playerZ;
        const pts = {
            s1: [[0, 14], [20, 14]],
            L: [[20, 14], [26, 5], [40, 5], [46, 14]],
            R: [[20, 14], [26, 23], [40, 23], [46, 14]],
            s3: [[46, 14], [58, 14]],
        };
        const line = (poly, col) => { for (let i = 0; i + 1 < poly.length; i++) s.line(x0 + poly[i][0], y0 + poly[i][1], x0 + poly[i + 1][0], y0 + poly[i + 1][1], col); };
        const chosenL = sim.branch < 0, chosenR = sim.branch > 0;
        line(pts.s1, R.mapRoad); line(pts.L, chosenR ? R.hudDim : R.mapRoad); line(pts.R, chosenL ? R.hudDim : R.mapRoad); line(pts.s3, R.mapRoad);
        // the goal flag
        for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++) px(u, x0 + 58 + i, y0 + 9 + j, (((i >> 1) + (j >> 1)) & 1) ? c.white : c.ink);
        vspan(u, x0 + 58, y0 + 9, y0 + 18, c.white);
        // where you are
        let poly, f;
        if (!sim.tip) { poly = pts.s1; f = Math.min(1, pz / tr.tipZ); }
        else if (!sim.cp2) { poly = sim.branch < 0 ? pts.L : pts.R; f = (pz - tr.tipZ) / (tr.cp2Z - tr.tipZ); }
        else { poly = pts.s3; f = (pz - tr.cp2Z) / (tr.goalZ - tr.cp2Z); }
        f = Math.max(0, Math.min(1, f));
        // travelled part in yellow
        const lens = [];
        let tot = 0;
        for (let i = 0; i + 1 < poly.length; i++) { const l = Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]); lens.push(l); tot += l; }
        let d = f * tot, px0 = poly[0][0], py0 = poly[0][1];
        if (sim.tip) line(pts.s1, R.yellow);
        if (sim.cp2) line(sim.branch < 0 ? pts.L : pts.R, R.yellow);
        for (let i = 0; i < lens.length; i++) {
            const a = poly[i], b = poly[i + 1];
            if (d <= lens[i]) { const q = d / lens[i]; px0 = a[0] + (b[0] - a[0]) * q; py0 = a[1] + (b[1] - a[1]) * q; s.line(x0 + a[0], y0 + a[1], Math.round(x0 + px0), Math.round(y0 + py0), R.yellow); break; }
            s.line(x0 + a[0], y0 + a[1], x0 + b[0], y0 + b[1], R.yellow);
            d -= lens[i]; px0 = b[0]; py0 = b[1];
        }
        const X = Math.round(x0 + px0), Y = Math.round(y0 + py0);
        box(u, X - 2, Y - 2, 5, 5, c.ink); box(u, X - 1, Y - 1, 3, 3, SurfaceDraw.blink(t, 1) ? c.white : c.red);
        // the stage under the map
        const st = 'STAGE ' + (sim.stage + 1);
        s.textRight(st, 308, y0 + h + 3, PixelFont.Arcade, R.ink); s.textRight(st, 307, y0 + h + 2, PixelFont.Arcade, R.cream);
    }

    _overlays(s, u, sim, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const P0 = sim.p, m = sim.msg, age = m ? sim.time - m.t0 : 99;
        if (P0 === Phase.Countdown) {
            // the gantry lamps are the countdown (with the beeps); the sky carries the stage
            s.textCenteredShadow('STAGE 1', 160, 45, dsp, R.yellow, R.ink, 2);
            s.textCenteredShadow(sim.mercyActive ? 'PALM COAST - FREE DRIVE' : 'PALM COAST', 160, 61, arc, sim.mercyActive ? R.neonCyan : R.cream, R.ink);
            return;
        }
        if (P0 === Phase.Card || P0 === Phase.Over) { this._card(s, u, sim, t); return; }
        if (P0 === Phase.TimeUp) {
            s.textCenteredShadow('TIME UP', 160, 64, dsp, R.tachR, R.ink, 4);
            return;
        }
        if (P0 === Phase.Finish) {
            s.textCenteredShadow('GOAL!', 160, 58, dsp, R.yellow, R.magenta, 5);
            if (sim.goalBonus > 0) s.textCenteredShadow('TIME BONUS ' + sim.goalBonus, 160, 104, arc, R.white, R.ink, 2);
            return;
        }
        if (!m) return;
        if (m.id === 'go' && age < 1.3) s.textCenteredShadow('GO!', 160, 44, dsp, R.lime, R.ink, 4);
        else if (m.id === 'cp' && age < 3.0) {
            s.textCenteredShadow('CHECKPOINT', 160, 58, dsp, R.yellow, R.ink, 3);
            s.textCenteredShadow('EXTENDED TIME', 160, 88, arc, R.white, R.ink, 2);
            if (!sim.mercyActive) s.textCenteredShadow('+' + m.a + ' SEC', 160, 106, dsp, R.lime, R.ink, 2);
        } else if (m.id === 'fork' && age < 3.4) {
            s.textCenteredShadow('CHOOSE YOUR ROAD', 160, 60, dsp, R.white, R.ink, 2);
            s.textShadow('< CANYON RUN', 20, 82, arc, R.orange, R.ink);
            s.textRight('VISTA HILLS >', 301, 82, arc, R.ink); s.textRight('VISTA HILLS >', 300, 81, arc, R.lime);
        } else if (m.id === 'stage' && age < 3.0) {
            s.textCenteredShadow('STAGE ' + m.a, 160, 60, dsp, R.yellow, R.ink, 3);
            s.textCenteredShadow(m.b, 160, 88, arc, R.white, R.ink, 2);
        }
        if (m.id === 'cp' && age >= 3.0 && age < 5.6 && m.b) {
            s.textCenteredShadow('STAGE 3', 160, 60, dsp, R.yellow, R.ink, 3);
            s.textCenteredShadow(m.b, 160, 88, arc, R.white, R.ink, 2);
        }
    }

    _card(s, u, sim, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, won = sim.roundWon;
        // a dark plate, dithered at its rim
        const x0 = 40, y0 = 52, w = 240, h = 112;
        box(u, x0, y0, w, h, c.hudPlate);
        for (let x = x0; x < x0 + w; x++) { px(u, x, y0, c.pink); px(u, x, y0 + h - 1, c.pink); }
        for (let y = y0; y < y0 + h; y++) { px(u, x0, y, c.pink); px(u, x0 + w - 1, y, c.pink); }
        s.textCenteredShadow(won ? SunsetSpec.roundWonText : SunsetSpec.roundLostText, 160, y0 + 10, dsp, won ? R.yellow : R.tachR, R.ink, 3);
        s.textCentered(won ? 'YOU BEAT THE SUNSET' : 'THE SUN WENT DOWN', 160, y0 + 38, arc, R.cream);
        s.textCentered('SCORE ' + dn(sim.score, 6), 160, y0 + 54, arc, R.white, 2);
        const route = ['COAST', sim.branch < 0 ? 'CANYON' : sim.branch > 0 ? 'HILLS' : '?', 'BAY'];
        const reached = won ? 3 : sim.stage + 1;
        let line = '';
        for (let i = 0; i < 3; i++) line += (i ? ' > ' : '') + (i < reached ? route[i] : '...');
        s.textCentered(line, 160, y0 + 76, arc, won ? R.lime : R.orange);
        if (!won) {
            const km = Math.max(0, (sim.track.goalZ - sim.playerZ) / 100000);
            s.textCentered(km.toFixed(1) + ' KM TO THE GOAL', 160, y0 + 92, arc, R.cream);
        } else if (sim.goalBonus > 0) s.textCentered('TIME BONUS ' + sim.goalBonus, 160, y0 + 92, arc, R.cream);
    }
}

function wrapRange(v, lo, hi) { const w = hi - lo; return ((((v - lo) % w) + w) % w) + lo; }
