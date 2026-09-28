// THE NODE · world 1 · AFTERGLOW on the Cabinet Engine · THE PICTURE.
//
//   THE WORLD PASS   one pass over the 304 x 224 safe area: each pixel is un-rolled around the vanishing
//                    point (so the whole horizon rolls with the jet, and spins a full turn in a barrel roll),
//                    then it is sky (a dithered ramp by height above the horizon) or ground (one divide: its
//                    distance; stripes/checks by world position for the rush, a dithered fog ramp by screen
//                    height). The SEA glints; the DESERT has far mesas on the horizon; the CANYON casts each
//                    pixel against two rock walls (strata, cracks, a lit and a shaded side) over a dark floor
//                    with a river that burns orange, all under a striped sunset sun at the canyon's end.
//   SPRITES          everything else is a baked sprite (raster.js) scaled by distance and rotated with the
//                    horizon, drawn far to near: clouds, ships, spires, fighters, the bomber, the fortress,
//                    missiles with smoke trails, explosions (drawn from the sim's records: flash, fireballs
//                    stepping down the fire ramp, tumbling debris, sparks, a shock ring), then your jet with
//                    its afterburners and a dithered shadow racing over the ground ahead.
//   HUD              SCORE, the big HIT counter, STAGE; lives, MSL and four lock pips; the reticle (green,
//                    yellow while locked), red lock brackets that snap shut, LOCK ON, WARNING (1.5 Hz colour
//                    swap, never a strobe) with arrows for missiles from behind; the stage / clear / result
//                    cards on dithered plates.
// The renderer reads the round and never changes it; its only dice are hashes of record seeds and time.
import { PixelFont, SurfaceDraw, dn } from '../../sdk/index.js';
import { PAL32, ix } from './palette.js';
import { AfterglowSpec } from './spec.js';
import { AfterglowRound } from './round.js';
import {
    D, F, H0, VPX, STAGES, Kind, Mode, BossState, TAU, BOMBER_ELEV, FORT_ELEV,
} from './world.js';
import { bake, cached, Screen, blit } from './raster.js';
import * as M from './models.js';

const Phase = AfterglowRound.Phase;
const BAYER = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16));
const X0 = 8, Y0 = 8, X1 = 312, Y1 = 232;
const FOE_K = 2.2, MSL_K = 1.8;     // fighters and missiles are drawn bigger than life, as the boards did

function h32(a, b) {
    let h = Math.imul(a ^ Math.imul(b + 0x632BE5AB, 0x9E3779B1), 0x85EBCA6B);
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
    return h >>> 0;
}
function h01(a, b) { return h32(a, b) / 4294967296; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const C = name => PAL32[ix(name)];
const U32 = (...names) => Uint32Array.from(names.map(C));

// ------------------------------------------------------------------ the stage looks
const LOOKS = [
    {   // OPEN SEA
        sky: U32('s1sky0', 's1sky1', 's1sky2', 's1sky3', 's1sky4', 's1sky5'), skyK: 1 / 24,
        gA: U32('sea0', 'sea1', 'sea2', 'sea3', 'sea4', 'sea5'), gB: U32('seaHi', 'sea2', 'sea3', 'sea3', 'sea4', 'sea5'),
        g0: 118, gK: 1 / 21, glint: C('white'), glint2: C('cloud1'), glint3: C('seaHi'),
    },
    {   // RED DESERT
        sky: U32('s2sky0', 's2sky1', 's2sky2', 's2sky3', 's2sky4', 's2sky5'), skyK: 1 / 24,
        gA: U32('sand0', 'sand1', 'sand2', 'sand3', 'sand4', 'sand5'), gB: U32('sandHi', 'sand2', 'sand3', 'sand3', 'sand4', 'sand5'),
        g0: 118, gK: 1 / 21, mesa: U32('mesa0', 'mesa1', 'mesa2'),
    },
    {   // AFTERGLOW CANYON
        sky: U32('s3sky0', 's3sky1', 's3sky2', 's3sky3', 's3sky4', 's3sky5'), skyK: 1 / 22,
        gA: U32('floor1', 'floor0', 'floor2', 'floor3', 'rock2', 's3sky2'), gB: U32('floor0', 'floor2', 'floor2', 'floor3', 'rock2', 's3sky2'),
        g0: 118, gK: 1 / 21,
        river: U32('river0', 'river1', 's3sky0', 's3sky1'),
        lit: U32('s3sky1', 'rock0', 'rock1', 'rock2', 'rock3'), sh: U32('rock1', 'rock2', 'rock3', 'rock4', 'floor1'),
        hazeLit: C('s3sky1'), hazeSh: C('s3sky2'),
        rimLit: C('s3sky0'), rimSh: C('rock1'),
        sun: U32('sun0', 'sun0', 'sun1', 'yellow', 's3sky0', 'orange'),
    },
];

// far mesas on the desert horizon: a height (px) for every unrolled column
const MESA = (() => {
    const a = new Int16Array(2048);
    let x = 0;
    while (x < 2048) {
        const gap = 20 + (h32(x, 7) % 90), wdt = 30 + (h32(x, 11) % 120), ht = 5 + (h32(x, 13) % 14);
        x += gap;
        for (let k = 0; k < wdt && x + k < 2048; k++) {
            const edge = Math.min(k, wdt - 1 - k);
            a[x + k] = Math.max(a[x + k], Math.min(ht, 2 + edge * 2));
        }
        x += wdt;
    }
    return a;
})();
// the canyon river's meander, one period of 1800 m
const RIVER = (() => { const a = new Float32Array(1024); for (let i = 0; i < 1024; i++) a[i] = 24 * Math.sin(i / 1024 * TAU) + 8 * Math.sin(i / 1024 * TAU * 3); return a; })();

// ------------------------------------------------------------------ clouds (procedural puffs, top-lit)
function cloudSprite(v) {
    const W = 110, H = 44;
    const px = new Int16Array(W * H).fill(-1);
    const puffs = [];
    const n = 5 + (h32(v, 1) % 4);
    for (let i = 0; i < n; i++) {
        const cx = 16 + (W - 32) * (i + 0.5) / n + (h01(v, i * 3) - 0.5) * 12;
        const r = 9 + h01(v, i * 3 + 1) * 11 * (1 - Math.abs(i - n / 2) / n);
        puffs.push([cx, 34 - r * 0.7, r * 1.25, r]);
    }
    const shade = [ix('white'), ix('cloud1'), ix('cloud2'), ix('cloud3')];
    for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
            let inside = false, top = 99;
            for (const [cx, cy, rx, ry] of puffs) {
                const dx = (x - cx) / rx, dy = (y - cy) / ry;
                if (dx * dx + dy * dy < 1) inside = true;
                if (Math.abs(dx) < 1) top = Math.min(top, cy - ry * Math.sqrt(1 - dx * dx));
            }
            if (!inside || y > 37) continue;
            const depth = (y - top) / Math.max(4, 37 - top);
            const b = BAYER[(y & 3) * 4 + (x & 3)] * 0.5;
            const lv = clamp(Math.floor(depth * 3.6 + b), 0, 3);
            px[y * W + x] = shade[lv];
        }
    return { w: W, h: H, ax: W >> 1, ay: 36, px, pts: [], scale: 0.45 };
}
const CLOUDS = [0, 1, 2, 3].map(cloudSprite);
function remapOf(pairs) {
    const r = new Int16Array(200);
    for (let i = 0; i < r.length; i++) r[i] = i;
    for (const [a, b] of pairs) r[ix(a)] = ix(b);
    return r;
}
const CLOUD_REMAP = [
    null,
    remapOf([['cloud1', 's2sky0'], ['cloud2', 's2sky1'], ['cloud3', 'mesa0']]),
    remapOf([['white', 'sun0'], ['cloud1', 's3sky0'], ['cloud2', 's3sky1'], ['cloud3', 's3sky3']]),
];

// ------------------------------------------------------------------ baked sprites (lazy, cached)
const INK = ix('ink');
const HERO_STEPS = 48;
let heroMeshC = null, foeMeshC = null;
function heroSprite(rollStep, pitchStep) {
    return cached('hero:' + rollStep + ':' + pitchStep, () => {
        heroMeshC = heroMeshC || M.heroMesh();
        return bake(heroMeshC, { roll: rollStep / HERO_STEPS * TAU, pitch: (pitchStep - 1) * 0.16, elev: 0.25, scale: F / D, mats: M.HERO_MATS, ink: INK, pts: M.HERO_NOZZLES });
    });
}
function heroIcon() {
    return cached('hero:icon', () => { heroMeshC = heroMeshC || M.heroMesh(); return bake(heroMeshC, { elev: 0.5, scale: 1.05, mats: M.HERO_MATS, ink: INK }); });
}
function heroShadow() {
    return cached('hero:shadow', () => {
        const m = M.heroMesh();
        for (let i = 1; i < m.v.length; i += 3) m.v[i] = 0;          // flattened onto the ground
        return bake(m, { elev: 0.62, scale: 4, mats: { body: [INK, INK, INK, INK], trim: [INK, INK, INK, INK], glass: [INK, INK, INK, INK], metal: [INK, INK, INK, INK], glow: [INK, INK, INK, INK] } });
    });
}
function foeSprite(ace, yawStep, bankStep) {
    return cached('foe:' + ace + ':' + yawStep + ':' + bankStep, () => {
        foeMeshC = foeMeshC || M.foeMesh();
        return bake(foeMeshC, { yaw: yawStep / 16 * TAU, roll: (bankStep - 2) * 0.45, elev: 0.17, scale: 3.2, mats: ace ? M.ACE_MATS : M.FOE_MATS, ink: INK });
    });
}
function bomberSprite(bankStep) {
    return cached('bomber:' + bankStep, () => bake(M.bomberMesh(), { roll: (bankStep - 2) * 0.15, elev: BOMBER_ELEV, scale: 1.2, mats: M.BOMBER_MATS, ink: INK, edges: 2.5, pts: M.BOMBER_POINTS }));
}
function fortSprite() {
    return cached('fort', () => bake(M.fortMesh(), { elev: FORT_ELEV, scale: 1.05, mats: M.FORT_MATS, ink: INK, edges: 3, pts: M.FORT_POINTS }));
}
function shipSprite(k) {
    return cached('ship:' + k, () => bake(M.shipMesh(), { yaw: 0.5 + k * 0.9, elev: 0.36, scale: 1.2, mats: M.SHIP_MATS, ink: INK }));
}
function spireSprite(k) {
    return cached('spire:' + k, () => bake(M.spireMesh(k + 2), { elev: 0.06, scale: 1.0, mats: M.SPIRE_MATS, ink: INK }));
}

// the warm-up queue: a few bakes per frame until every angle is cached (~80 ms in all), so a new angle never
// hitches mid-flight. The cache is the same whatever the order, so pictures never depend on it.
const WARM = [];
for (let r = 0; r < HERO_STEPS; r++) WARM.push(() => heroSprite(r, 1));
WARM.push(() => fortSprite());
for (let b = 0; b < 5; b++) WARM.push(() => bomberSprite(b));
for (const y of [8, 0, 7, 9, 1, 15, 6, 10, 2, 14, 5, 11, 3, 13, 4, 12]) for (let b = 0; b < 5; b++) { WARM.push(() => foeSprite(0, y, b)); WARM.push(() => foeSprite(1, y, b)); }
for (let r = 0; r < HERO_STEPS; r++) { WARM.push(() => heroSprite(r, 0)); WARM.push(() => heroSprite(r, 2)); }
for (let k = 0; k < 4; k++) { WARM.push(() => shipSprite(k)); WARM.push(() => spireSprite(k)); }

// ------------------------------------------------------------------ the renderer
export class AfterglowRenderer {
    constructor() {
        this.sc = new Screen();
        this.c = {};
        for (const n of ['bg', 'ink', 'white', 'yellow', 'orange', 'red', 'darkRed', 'green', 'greenDim', 'cyan', 'fire0', 'smoke0', 'smoke1', 'smoke2',
            'cloud1', 'cloud2', 'cloud3', 'metal', 'jet2', 'foe2', 'foe1', 'fort2', 'olive2', 'trim0', 'wake', 'sun0', 's3sky0'])
            this.c[n] = AfterglowSpec.palette.get(n);
        this._list = [];
        this._shx = 0; this._shy = 0;
        this._roll = 0; this._cr = 1; this._sr = 0;
        this._q = { x: 0, y: 0, s: 0 };
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.c.bg);
        if (r == null || r.world == null) return;
        const w = r.world;
        const sc = this.sc.bind(s);
        // camera shake (big explosions only; hashed, so the renderer rolls no dice)
        const sh = w.shake * w.shake * 4;
        this._shx = sh > 0.05 ? Math.round((h01(Math.floor(w.now * 30), 3) - 0.5) * sh) : 0;
        this._shy = sh > 0.05 ? Math.round((h01(Math.floor(w.now * 30), 5) - 0.5) * sh) : 0;
        this._roll = w.camRoll; this._cr = Math.cos(w.camRoll); this._sr = Math.sin(w.camRoll);
        this._world(sc, w);
        s.clip(X0, Y0, X1 - X0, Y1 - Y0);
        this._shadow(sc, w);
        this._objects(sc, s, w, r);
        this._speedLines(s, w, r);
        this._hud(s, sc, w, r);
        this._cards(s, sc, w, r, t);
        s.noClip();
        for (let n = 0; n < 5 && WARM.length > 0; n++) WARM.shift()();
    }

    // unrolled screen (the sim's proj) -> the tube, around the vanishing point, by the full camera roll
    _roll2(ux, uy, q) {
        const dx = ux - VPX, dy = uy - H0;
        q.x = VPX + this._shx + dx * this._cr - dy * this._sr;
        q.y = H0 + this._shy + dx * this._sr + dy * this._cr;
        return q;
    }
    _project(w, x, y, z, q) {
        if (!w.proj(x, y, z)) return false;
        this._roll2(w._p.sx, w._p.sy, q); q.s = w._p.s;
        return true;
    }

    // ------------------------------------------------------------------ the world pass
    _world(sc, w) {
        const L = LOOKS[w.stage];
        const u32 = sc.u32, W = sc.W;
        const cr = this._cr, sr = this._sr;
        const pvx = VPX + this._shx, pvy = H0 + this._shy;
        const camY = w.camY, camX = w.camX, camZ = w.dist - D;
        const K = camY * F;
        const sky = L.sky, skyK = L.skyK, gA = L.gA, gB = L.gB, g0 = L.g0, gK = L.gK;
        const stage = w.stage;
        const glintPhase = Math.floor(w.now * 2);          // the glitter re-rolls at 2 Hz: alive, never a strobe
        const canyon = stage === 2;
        const wall = canyon ? STAGES[2].wall : 0, rim = canyon ? STAGES[2].rim : 0;
        const mesaShift = camX * 0.04;
        for (let y = Y0; y < Y1; y++) {
            const dy = y + 0.5 - pvy;
            const dx0 = X0 + 0.5 - pvx;
            let u = dx0 * cr + dy * sr, wv = -dx0 * sr + dy * cr;
            const brow = (y & 3) * 4;
            let o = y * W + X0;
            for (let x = X0; x < X1; x++, u += cr, wv -= sr, o++) {
                const bay = BAYER[brow + (x & 3)];
                if (canyon) {
                    // the walls: a ray against x = +-wall (camera space), before the floor
                    let tw = 1e9;
                    if (u > 0.02) tw = (wall - camX) * F / u; else if (u < -0.02) tw = (-wall - camX) * F / u;
                    const tf = wv > 0.5 ? K / wv : 1e9;
                    if (tw < tf) {
                        const wy = camY - wv * tw / F;
                        if (wy < rim) {
                            // rock panels 26 m long, each catching the low sun a step brighter or darker, with
                            // dark seams between them rushing past; thin strata lines waver panel to panel
                            const gz = camZ + tw;
                            const pz = gz * 0.0385, pi = pz | 0;
                            const ph = h32(pi, u < 0 ? 3 : 4);
                            let k = 1 + ((ph & 3) === 0 ? -1 : (ph & 3) === 3 ? 1 : 0);
                            if (pz - pi < 0.06 && (ph & 16) !== 0) k += 2;                  // a seam, on some panels
                            const sp = 0.035 + ((ph >>> 5) & 7) * 0.006;                     // strata spacing per panel
                            const sy = wy * sp + ((ph >>> 8) & 15) * 0.061 + (pz - pi) * ((ph & 32) ? 0.5 : -0.4);
                            if (sy - (sy | 0) < 0.08) k += 1;
                            let lv = ((tw - 60) * 0.0042 + bay) | 0;
                            let c;
                            if (lv >= 3) c = u < 0 ? L.hazeLit : L.hazeSh;
                            else {
                                if (lv === 2) k = (k + 4) >> 1;
                                if (k > 4) k = 4;
                                c = u < 0 ? L.lit[k] : L.sh[k];
                            }
                            if (wy > rim - 3) c = u < 0 ? L.rimLit : L.rimSh;
                            u32[o] = c;
                            continue;
                        }
                    }
                }
                if (wv > 0.5) {
                    const iw = 1 / wv;
                    const gz = camZ + K * iw;
                    const gx = camX + u * camY * iw;
                    let lv = ((g0 - wv) * gK + bay) | 0; if (lv < 0) lv = 0; else if (lv > 5) lv = 5;
                    let c;
                    if (stage === 0) {
                        c = (((gz * 0.03125) | 0) & 1) ? gB[lv] : gA[lv];
                        if (lv < 5) {
                            const gzc = gz * 0.1, gzi = gzc | 0;
                            if (gzc - gzi < 0.16) {
                                const hh = h32(((gx + 100000) * 0.2) | 0, (gzi * 7 + glintPhase) | 0) & 1023;
                                if (hh < 10) c = lv < 1 ? L.glint2 : L.glint; else if (hh < 30) c = L.glint3;
                            }
                        }
                    } else if (stage === 1) {
                        const cx = ((gx + 100000) * 0.022) | 0, cz = (gz * 0.022) | 0;
                        c = ((cx ^ cz) & 1) ? gB[lv] : gA[lv];
                        if (lv < 3 && (((gz * 0.2) | 0) % 9) === 0) c = gA[lv + 1];
                    } else {
                        const rx = RIVER[((gz * (1024 / 1800)) | 0) & 1023];
                        const dd = gx - rx;
                        if (dd > -10 && dd < 10) {
                            let rl = lv >> 1; if (rl > 3) rl = 3;
                            c = ((((gz * 0.05) | 0) & 1) && rl < 2) ? L.river[rl + 1] : L.river[rl];
                        } else c = (((gz * 0.025) | 0) & 1) ? gB[lv] : gA[lv];
                    }
                    u32[o] = c;
                } else {
                    const hgt = -wv;
                    if (stage === 2) {
                        // the sun, sitting on the far end of the canyon, cut by bands toward its base
                        const sh = hgt - 16, r2 = u * u + sh * sh;
                        if (r2 < 1296) {
                            const cut = hgt < 16 && ((((hgt + 40) | 0) % 6) < ((16 - hgt) * 0.22 + 0.6));
                            if (!cut) { let k = ((52 - hgt) * 0.1) | 0; if (k < 0) k = 0; if (k > 5) k = 5; u32[o] = L.sun[k]; continue; }
                        }
                    } else if (stage === 1) {
                        const mh = MESA[((u * 0.8 + mesaShift + 1024) | 0) & 2047];
                        if (hgt < mh) { u32[o] = hgt > mh - 1.5 ? L.mesa[0] : (hgt < 3 ? L.mesa[2] : L.mesa[1]); continue; }
                    }
                    let lv = (hgt * skyK + bay) | 0; if (lv > 5) lv = 5;
                    u32[o] = sky[lv];
                }
            }
        }
    }

    // the jet's shadow, thrown ahead on the ground by the sun behind us
    _shadow(sc, w) {
        if (!w.alive) return;
        const zs = w.py * 1.25 + 20;
        const q = this._q;
        if (!this._project(w, w.px, 0, zs, q)) return;
        const spr = heroShadow();
        const sScale = q.s / 4;
        if (sScale < 0.1) return;
        if (w.stage === 2) {
            // only on the floor, not up the walls
            if (Math.abs(w.px) > STAGES[2].wall - 6) return;
        }
        blit(sc, spr, q.x, q.y, sScale, this._roll + w.jetRoll * 0.0, null, INK, true);
    }

    // ------------------------------------------------------------------ everything with a distance, far to near
    _objects(sc, s, w, r) {
        const list = this._list;
        list.length = 0;
        const camZ = w.dist - D;
        // clouds: a deterministic field over world distance
        const SP = 240;
        const k0 = Math.floor((camZ + 30) / SP), k1 = Math.floor((camZ + 3200) / SP);
        const canyon = w.stage === 2;
        for (let k = k0; k <= k1; k++) {
            const hh = h32(k, 101 + w.stage);
            if ((hh & 7) < 3) continue;
            const wz = k * SP + (h01(k, 5) * SP * 0.8);
            const Z = wz - camZ;
            if (Z < 30 || Z > 3200) continue;
            const x = canyon ? (h01(k, 7) - 0.5) * 700 : (h01(k, 7) - 0.5) * 1400;
            const y = canyon ? STAGES[2].rim + 40 + h01(k, 9) * 140 : 200 + h01(k, 9) * 190;
            list.push({ Z, kind: 0, x, y, z: Z - D, v: hh >>> 8 & 3 });
        }
        // scenery on the ground
        if (w.stage === 0) {
            const S = 650, j0 = Math.floor((camZ + 60) / S), j1 = Math.floor((camZ + 2600) / S);
            for (let k = j0; k <= j1; k++) {
                if ((h32(k, 31) & 3) === 0) continue;
                const Z = k * S + h01(k, 33) * 300 - camZ;
                if (Z < 60 || Z > 2600) continue;
                const side = h01(k, 35) < 0.5 ? -1 : 1;
                list.push({ Z, kind: 1, x: side * (170 + h01(k, 37) * 380), y: 0, z: Z - D, v: h32(k, 39) & 3 });
            }
        } else if (w.stage === 1) {
            const S = 170, j0 = Math.floor((camZ + 60) / S), j1 = Math.floor((camZ + 2400) / S);
            for (let k = j0; k <= j1; k++) {
                if ((h32(k, 41) % 5) < 2) continue;
                const Z = k * S + h01(k, 43) * 90 - camZ;
                if (Z < 45 || Z > 2400) continue;
                const side = h01(k, 45) < 0.5 ? -1 : 1;
                list.push({ Z, kind: 2, x: side * (150 + h01(k, 47) * 520), y: 0, z: Z - D, v: h32(k, 49) & 3 });
            }
        }
        for (const f of w.foes) if (f.alive) list.push({ Z: f.z + D, kind: 3, ref: f });
        if (w.boss) list.push({ Z: w.boss.z + D + 20, kind: 4, ref: w.boss });
        for (const m of w.emissiles) if (m.alive) list.push({ Z: m.z + D, kind: 5, ref: m });
        for (const m of w.pmissiles) list.push({ Z: m.z + D, kind: 6, ref: m });
        for (const b of w.booms) list.push({ Z: b.z + D - 0.5, kind: 7, ref: b });
        if (w.alive) list.push({ Z: D, kind: 8 });
        list.sort((a, b) => b.Z - a.Z);
        const q = this._q;
        for (const it of list) {
            switch (it.kind) {
                case 0: {
                    if (!this._project(w, it.x, it.y, it.z, q)) break;
                    blit(sc, CLOUDS[it.v], q.x, q.y, q.s / 0.45, this._roll, CLOUD_REMAP[w.stage]);
                    break;
                }
                case 1: {
                    if (!this._project(w, it.x, it.y, it.z, q)) break;
                    const spr = shipSprite(it.v);
                    // the wake: a pale streak behind the ship
                    const k2 = { x: 0, y: 0, s: 0 };
                    if (this._project(w, it.x - Math.sin(0.5 + it.v * 0.9) * 50, 0, it.z - Math.cos(0.5 + it.v * 0.9) * 50, k2))
                        s.line(Math.round(q.x), Math.round(q.y), Math.round(k2.x), Math.round(k2.y), this.c.wake);
                    blit(sc, spr, q.x, q.y, q.s / 1.2, this._roll);
                    break;
                }
                case 2: {
                    if (!this._project(w, it.x, it.y, it.z, q)) break;
                    blit(sc, spireSprite(it.v), q.x, q.y, q.s / 1.0, this._roll);
                    break;
                }
                case 3: this._foe(sc, s, w, it.ref); break;
                case 4: this._boss(sc, s, w, it.ref); break;
                case 5: this._emissile(sc, s, w, it.ref); break;
                case 6: this._pmissile(sc, s, w, it.ref); break;
                case 7: this._boom(sc, s, w, it.ref); break;
                case 8: this._jet(sc, s, w, r); break;
            }
        }
    }

    _foe(sc, s, w, f) {
        const q = this._q;
        if (!this._project(w, f.x, f.y, f.z, q)) return;
        if (f.z + D < 6) return;
        let ys = Math.round(f.yaw / TAU * 16) % 16; if (ys < 0) ys += 16;
        const bs = clamp(Math.round(f.bank / 0.45) + 2, 0, 4);
        const spr = foeSprite(f.kind === Kind.Ace ? 1 : 0, ys, bs);
        blit(sc, spr, q.x, q.y, q.s * FOE_K / 3.2, this._roll);
        // the vulcan finding it: a few sparks on the hull
        if (w.now - f.gunT < 0.08) this._sparks(s, q.x, q.y, Math.max(2, q.s * 5 * FOE_K), f.id, w.now);
        // an ace about to fire shows a muzzle glow under its nose (a steady warning, no blink)
        if (f.kind === Kind.Ace && f.willFire && !f.fired && f.mode === Mode.Head && f.z < f.fireZ + 260 && f.z > f.fireZ) {
            const rr = Math.max(1, Math.round(q.s * 1.2 * FOE_K));
            s.circle(Math.round(q.x), Math.round(q.y + q.s * 1.2 * FOE_K), rr, this.c.red, true);
            s.circle(Math.round(q.x), Math.round(q.y + q.s * 1.2 * FOE_K), Math.max(0, rr - 1), this.c.yellow, true);
        }
    }

    _boss(sc, s, w, b) {
        const q = this._q;
        if (!this._project(w, b.x, b.y, b.z, q)) return;
        const fort = b.kind === Kind.Fortress;
        const dying = b.state === BossState.Dying;
        let ang = this._roll;
        let bx = q.x, by = q.y;
        if (dying) {
            ang += b.t * (fort ? 0.12 : 0.35);
            bx += (h01(Math.floor(w.now * 20), 21) - 0.5) * 4; by += (h01(Math.floor(w.now * 20), 23) - 0.5) * 3;
        }
        const spr = fort ? fortSprite() : bomberSprite(clamp(Math.round(b.bank / 0.15) + 2, 0, 4));
        const k = q.s / spr.scale;
        blit(sc, spr, bx, by, k, ang);
        // the lock points: dead ones smoke and burn, live ones carry yellow corner ticks
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (const p of b.points) {
            const bp = spr.pts[p.k];
            const px = bx + (bp[0] * ca - bp[1] * sa) * k, py = by + (bp[0] * sa + bp[1] * ca) * k;
            const rr = Math.max(2, Math.round((fort ? 5 : 2.6) * q.s));
            if (!p.alive) {
                s.circle(Math.round(px), Math.round(py), rr, this.c.ink, true);
                const fl = 0.6 + 0.4 * Math.sin(w.now * 9 + p.k);
                s.circle(Math.round(px), Math.round(py - rr * 0.3), Math.max(1, Math.round(rr * 0.55 * fl)), this.c.orange, true);
                s.circle(Math.round(px), Math.round(py - rr * 0.3), Math.max(0, Math.round(rr * 0.3 * fl)), this.c.yellow, true);
                for (let i = 0; i < 3; i++) {
                    const a = (w.now * 0.9 + i / 3) % 1;
                    s.circle(Math.round(px + (h01(p.k, i) - 0.5) * rr), Math.round(py - rr - a * rr * 3), Math.max(1, Math.round(rr * (0.4 + a * 0.6))), a < 0.5 ? this.c.smoke0 : this.c.smoke1, true);
                }
            } else if (!dying && !p.lock && b.state === BossState.Hold) {
                const e = rr + 4;
                this._ticks(s, Math.round(px), Math.round(py), e, 3, this.c.yellow);
            }
            if (p.alive && w.now - p.gunT < 0.08) this._sparks(s, px, py, rr + 2, p.k + 99, w.now);
        }
    }

    _emissile(sc, s, w, m) {
        const q = this._q;
        // the smoke trail
        const tr = m.trail;
        for (let i = 0; i + 2 < tr.length; i += 3) {
            if (!this._project(w, tr[i], tr[i + 1], tr[i + 2], q)) continue;
            const age = (tr.length - i) / tr.length;
            const rr = Math.max(0, Math.round(q.s * MSL_K * (0.6 + age * 1.2)));
            s.circle(Math.round(q.x), Math.round(q.y), rr, age < 0.35 ? this.c.cloud1 : age < 0.7 ? this.c.cloud2 : this.c.cloud3, true);
        }
        if (!this._project(w, m.x, m.y, m.z, q)) return;
        if (m.z + D < 4) return;
        const x = Math.round(q.x), y = Math.round(q.y);
        const rr = Math.max(1, Math.round(q.s * 1.3 * MSL_K));
        s.circle(x, y, rr + 1, this.c.red, true);
        s.circle(x, y, rr, this.c.yellow, true);
        s.circle(x, y, Math.max(0, rr - 1), this.c.white, true);
        // a threat ring around one that is coming for you
        if (!m.passed && m.vz < 0) {
            const tg = w.tgo(m);
            if (tg > 0 && tg < 2.6) {
                const e = rr + 5 + Math.round(tg * 4);
                this._diamond(s, x, y, e, this.c.red);
            }
        }
    }

    _pmissile(sc, s, w, m) {
        const q = this._q;
        const tr = m.trail;
        if (tr) for (let i = 0; i + 2 < tr.length; i += 3) {
            if (!this._project(w, tr[i], tr[i + 1], tr[i + 2], q)) continue;
            const age = (tr.length - i) / tr.length;
            const rr = Math.max(0, Math.round(Math.min(3, q.s * (0.2 + age * 0.7))));
            s.circle(Math.round(q.x), Math.round(q.y), rr, age < 0.3 ? this.c.cloud1 : age < 0.7 ? this.c.cloud2 : this.c.cloud3, true);
        }
        if (m.age > m.dur) return;
        if (!this._project(w, m.x, m.y, m.z, q)) return;
        const x = Math.round(q.x), y = Math.round(q.y);
        const rr = Math.max(1, Math.round(Math.min(3, q.s * 0.8 * MSL_K)));
        s.circle(x, y, rr, this.c.orange, true);
        s.circle(x, y, Math.max(0, rr - 1), this.c.fire0, true);
    }

    _boom(sc, s, w, b) {
        const q = this._q;
        if (!this._project(w, b.x, b.y, b.z, q)) return;
        const a = w.now - b.t0;
        const R = b.size * q.s * (b.kind === 0 ? FOE_K * 0.8 : 1);
        const cx = q.x, cy = q.y;
        const c = this.c;
        if (b.kind === 3) {                        // a puff: a missile's end or a hit that did not kill
            const k = a / 0.6;
            const rr = Math.round(R * (0.5 + k));
            s.circle(Math.round(cx), Math.round(cy), rr, k < 0.15 ? c.white : k < 0.5 ? c.yellow : k < 0.75 ? c.smoke2 : c.smoke0, true);
            return;
        }
        const life = b.kind === 2 ? 2.4 : b.kind === 4 ? 2.0 : 1.4;
        const slow = b.kind === 2 || b.kind === 4 ? 1.5 : 1;          // big blasts burn longer
        // debris: tumbling chunks thrown out, falling, trailing fire early
        const nd = b.kind === 2 ? 16 : 10;
        for (let i = 0; i < nd; i++) {
            const ang = h01(b.seed, i) * TAU, sp = (0.9 + h01(b.seed, i + 40) * 1.6) * R * 1.4;
            const dx = Math.cos(ang) * sp * a, dy = Math.sin(ang) * sp * a * 0.7 + 60 * q.s * a * a;
            const px = Math.round(cx + dx), py = Math.round(cy + dy);
            const sz = Math.max(1, Math.round(q.s * (0.8 + h01(b.seed, i + 80) * 1.4)));
            if (a < 0.55) s.circle(Math.round(cx + dx * 0.8), Math.round(cy + dy * 0.8), Math.max(1, sz - 1), a < 0.25 ? c.yellow : c.orange, true);
            if (a < life * 0.8) s.rect(px, py, sz + 1, sz, (i & 1) ? c.metal : (b.kind === 4 ? c.jet2 : c.foe2));
        }
        // the shock ring (big ones)
        if ((b.kind === 2 || b.kind === 4 || b.kind === 1) && a < 0.45) {
            const rr = Math.round(R * (0.6 + a * 5));
            s.circle(Math.round(cx), Math.round(cy), rr, a < 0.2 ? c.white : c.yellow, false);
            if (a < 0.25) s.circle(Math.round(cx), Math.round(cy), rr + 1, c.yellow, false);
        }
        // the fireball: puffs that swell and cool down the fire ramp into smoke. Inner puffs burn hotter
        // (white, yellow) and sit on top; outer ones are already orange, red, brown: a billow, not a bubble
        const np = b.kind === 2 || b.kind === 4 ? 11 : 7;
        const P = this._puffs || (this._puffs = []);
        P.length = 0;
        for (let i = 0; i < np; i++) {
            const ai = a - h01(b.seed, i + 7) * 0.12;
            if (ai < 0) continue;
            const k = ai / life;
            const edge = i === 0 ? 0 : h01(b.seed, i + 17);                 // 0 = the core, 1 = the rim
            const ang = h01(b.seed, i + 13) * TAU, dist = R * 0.6 * edge * (0.45 + Math.min(1, ai * 4));
            const px = cx + Math.cos(ang) * dist, py = cy + Math.sin(ang) * dist - R * 0.25 * k;
            const grow = Math.min(1, ai / 0.22);
            const rr = Math.round(R * (0.32 + 0.28 * h01(b.seed, i + 19) + (1 - edge) * 0.12) * (0.5 + 0.8 * grow) * (k > 0.4 ? Math.max(0, 1 - (k - 0.4) * 1.7) : 1));
            if (rr < 1) continue;
            const kc = (ai + edge * 0.16 + (h01(b.seed, i + 23) - 0.5) * 0.08) / slow;
            // once a puff turns to smoke it thins out and goes: a blast never hangs over the next moment
            const r2 = kc > 0.44 ? Math.round(rr * Math.max(0, 1 - (kc - 0.44) * 1.9)) : rr;
            if (r2 < 1) continue;
            P.push(edge, px, py, r2, kc);
        }
        for (let pass = 0; pass < 2; pass++)
            for (let j = 0; j < P.length; j += 5) {
                const edge = P[j];
                if ((pass === 0) !== (edge >= 0.5)) continue;                // the rim first, the core on top
                const px = Math.round(P[j + 1]), py = Math.round(P[j + 2]), rr = P[j + 3], kc = P[j + 4];
                const col = kc < 0.05 ? c.fire0 : kc < 0.14 ? c.yellow : kc < 0.27 ? c.orange : kc < 0.44 ? c.red : kc < 0.62 ? c.smoke0 : c.smoke2;
                const rim = kc < 0.14 ? c.orange : kc < 0.27 ? c.red : kc < 0.44 ? c.darkRed : kc < 0.62 ? c.smoke1 : c.smoke0;
                s.circle(px, py, rr + 1, rim, true);
                s.circle(px, py, rr, col, true);
                if (kc < 0.27 && rr > 3) s.circle(Math.round(px - rr * 0.25), Math.round(py - rr * 0.25), Math.round(rr * 0.45), kc < 0.14 ? c.fire0 : c.yellow, true);
            }
        // the flash
        if (a < 0.07) s.circle(Math.round(cx), Math.round(cy), Math.round(R * 0.9), c.white, true);
        // sparks
        if (a < 0.35) {
            for (let i = 0; i < 8; i++) {
                const ang = h01(b.seed, i + 60) * TAU, r0 = R * (0.3 + a * 5), r1 = r0 + R * 0.5 * (1 - a / 0.35);
                s.line(Math.round(cx + Math.cos(ang) * r0), Math.round(cy + Math.sin(ang) * r0), Math.round(cx + Math.cos(ang) * r1), Math.round(cy + Math.sin(ang) * r1), c.yellow);
            }
        }
    }

    _jet(sc, s, w, r) {
        // the jet rides the bank part of the roll only: a barrel roll spins the world around it
        const dx = w.jx - VPX, dy = w.jy - H0;
        const cb = Math.cos(w.camRollBank), sb = Math.sin(w.camRollBank);
        const jx = VPX + this._shx + dx * cb - dy * sb, jy = H0 + this._shy + dx * sb + dy * cb;
        let rs = Math.round(w.jetRoll / TAU * HERO_STEPS) % HERO_STEPS;
        if (rs < 0) rs += HERO_STEPS;
        const ps = w.pvy > 20 ? 2 : w.pvy < -20 ? 0 : 1;
        const spr = heroSprite(rs, ps);
        blit(sc, spr, jx, jy, 1, 0);          // the sprite's roll (jetRoll: the jet against the tube) is baked in
        // afterburners: a hot core in each nozzle and a short flame toward us
        const boost = w.entry > 0 || w.rolling ? 1.5 : 1;
        for (let i = 0; i < spr.pts.length; i++) {
            const p = spr.pts[i];
            const nx = jx + p[0], ny = jy + p[1];
            const fl = 0.9 + 0.1 * Math.sin(w.now * 9 + i * 2.1);            // a slow 1.4 Hz breath, no flicker
            const rr = Math.round(3.4 * fl * boost);
            s.circle(Math.round(nx), Math.round(ny + rr * 0.8), Math.max(1, rr - 1), this.c.red, true);
            s.circle(Math.round(nx), Math.round(ny + rr * 0.4), rr, this.c.orange, true);
            s.circle(Math.round(nx), Math.round(ny), Math.max(1, rr - 1), this.c.yellow, true);
            s.circle(Math.round(nx), Math.round(ny), Math.max(0, rr - 2), this.c.white, true);
        }
        // protection: after a respawn a slow dashed ring; a mercy save flashes it once
        const shield = w.now - w.shieldAt < 0.35;
        if ((w.invulnT > 0 && r.p === Phase.Running) || shield) {
            const R = 40;
            for (let k = 0; k < 20; k++) {
                const a0 = k / 20 * TAU + w.now * 0.8;
                if ((k & 1) && !shield) continue;
                s.line(Math.round(jx + Math.cos(a0) * R), Math.round(jy + Math.sin(a0) * R * 0.55), Math.round(jx + Math.cos(a0 + 0.2) * R), Math.round(jy + Math.sin(a0 + 0.2) * R * 0.55), shield ? this.c.white : this.c.cyan);
            }
        }
        this._jetScreen = [jx, jy];
    }

    // streaks out of the vanishing point: the launch climb, the first second of a stage, every roll
    _speedLines(s, w, r) {
        let n = 0;
        if (r.p === Phase.Intro) n = 14;
        else if (w.rolling) n = 12;
        else if (r.p === Phase.Running && w.stageT < 1.2) n = Math.round(14 * (1 - w.stageT / 1.2));
        if (n <= 0) return;
        const q = this._roll2(VPX, H0, this._q);
        const cx = q.x, cy = q.y;
        for (let i = 0; i < n; i++) {
            const ang = h01(i, 71) * TAU;
            const ph = (w.now * 1.9 + h01(i, 73)) % 1;
            const r0 = 50 + ph * ph * 190, len = 10 + ph * 46;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            s.line(Math.round(cx + ca * r0), Math.round(cy + sa * r0), Math.round(cx + ca * (r0 + len)), Math.round(cy + sa * (r0 + len)), ph < 0.45 ? this.c.cloud1 : this.c.white);
        }
    }

    // hits from the vulcan: sparks that fly outward from the hull (they travel, they do not blink)
    _sparks(s, x, y, rad, seed, now) {
        for (let i = 0; i < 5; i++) {
            const a = h01(seed, i) * TAU, d = ((now * 3.2 + h01(seed, i + 9)) % 1) * rad;
            s.setPixel(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), i & 1 ? this.c.white : this.c.yellow);
        }
    }

    _ticks(s, x, y, e, len, c) {
        s.rect(x - e, y - e, len, 1, c); s.rect(x - e, y - e, 1, len, c);
        s.rect(x + e - len + 1, y - e, len, 1, c); s.rect(x + e, y - e, 1, len, c);
        s.rect(x - e, y + e, len, 1, c); s.rect(x - e, y + e - len + 1, 1, len, c);
        s.rect(x + e - len + 1, y + e, len, 1, c); s.rect(x + e, y + e - len + 1, 1, len, c);
    }

    _diamond(s, x, y, e, c) {
        s.line(x, y - e, x + e, y, c); s.line(x + e, y, x, y + e, c); s.line(x, y + e, x - e, y, c); s.line(x - e, y, x, y - e, c);
    }

    // ------------------------------------------------------------------ the HUD
    _hud(s, sc, w, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, small = PixelFont.Small, c = this.c;
        const flying = r.p === Phase.Running || r.p === Phase.Intro;
        // the gun's tracers, the reticle, the locks
        if (w.alive && r.p === Phase.Running) {
            const q = this._q;
            this._roll2(w.rx, w.ry, q);
            const rx = Math.round(q.x), ry = Math.round(q.y);
            const [jx, jy] = this._jetScreen || [VPX, H0 + 58];
            for (let side = -1; side <= 1; side += 2) {
                const gx = jx + side * 9, gy = jy - 6;
                for (let k = 0; k < 6; k++) {
                    const f = (w.now * 5.5 + k / 6 + (side > 0 ? 0.08 : 0)) % 1;
                    const px = Math.round(gx + (rx - gx) * f), py = Math.round(gy + (ry - gy) * f);
                    s.rect(px, py, f < 0.5 ? 2 : 1, 1, f < 0.7 ? c.yellow : c.orange);
                }
            }
            const locked = w.locks.length > 0;
            const rc = locked ? c.yellow : c.green;
            // the reticle: corner brackets and a centre pip, on an ink shadow so it reads on any sky
            this._ticks(s, rx + 1, ry + 1, 10, 4, c.ink);
            this._ticks(s, rx, ry, 10, 4, rc);
            s.rect(rx - 1, ry, 3, 1, rc); s.rect(rx, ry - 1, 1, 3, rc);
            for (const L of w.locks) {
                const t = L.target;
                if (!this._project(w, t.x, t.y, t.z, q)) continue;
                const sz = t.isPoint ? (t.owner.kind === Kind.Fortress ? 6 : 4) : 6;
                const base = Math.max(6, Math.round(sz * q.s * 1.1));
                const snap = Math.max(0, 1 - (w.now - L.t0) / 0.15);
                const e = base + Math.round(snap * 16);
                const x = Math.round(q.x), y = Math.round(q.y);
                this._ticks(s, x + 1, y + 1, e, Math.max(3, e >> 1), c.ink);
                this._ticks(s, x, y, e, Math.max(3, e >> 1), c.red);
                if (L.missile) { s.rect(x - 1, y - 1, 3, 3, c.red); }
            }
            if (w.now - w.lockOnAt < 0.7) s.textShadow('LOCK ON', rx - 20, ry + 14, arc, c.red, c.ink);
        }
        // WARNING: missiles on the way (a slow colour swap, never a strobe)
        let behind = 0;
        if (flying && w.alive) {
            let warn = false;
            for (const m of w.emissiles) {
                if (!m.alive || m.passed) continue;
                const tg = w.tgo(m);
                if (tg > 0 && tg < 3) warn = true;
                if (m.vz > 0 && m.z + D < 8) {
                    behind++;
                    // a chevron at the bottom edge, under where it will come through
                    const sxu = clamp(VPX + (m.x - w.camX) * 3.2, 30, 290);
                    const q = this._roll2(sxu, 224, this._q);
                    const x = Math.round(clamp(q.x, 20, 300)), y = 222;
                    const col = SurfaceDraw.blink(w.now, 1.5) ? c.red : c.yellow;
                    for (let k = 0; k < 6; k++) { s.rect(x - k, y - 8 + k, 1, 2, col); s.rect(x + k, y - 8 + k, 1, 2, col); }
                }
            }
            if (warn) {
                const col = SurfaceDraw.blink(w.now, 1.5) ? c.red : c.yellow;
                s.textCenteredShadow('WARNING', 160, 46, dsp, col, c.ink, 2);
                if (behind > 0) s.textCenteredShadow('MISSILE BEHIND', 160, 64, arc, col, c.ink);
            }
        }
        // the numbers
        s.textShadow('SCORE', 12, 11, arc, c.yellow, c.ink);
        s.textShadow(dn(w.score, 7), 12, 20, dsp, c.white, c.ink);
        s.textCenteredShadow('HIT', 160, 11, arc, c.orange, c.ink);
        s.textCenteredShadow(dn(w.hits, 3), 160, 20, dsp, c.white, c.ink, 2);
        s.textShadow('STAGE', 308 - arc.measure('STAGE'), 11, arc, c.yellow, c.ink);
        s.textShadow((w.stage + 1) + '/3', 308 - dsp.measure('1/3'), 20, dsp, c.white, c.ink);
        // lives
        const icon = heroIcon();
        for (let i = 0; i < w.lives && i < 5; i++) blit(sc, icon, 20 + i * 17, 221, 1, 0);
        // missiles and lock pips
        s.textShadow('MSL ' + dn(Math.max(0, w.ammo), 2), 244, 212, arc, c.white, c.ink);
        for (let i = 0; i < 4; i++) {
            const x = 244 + i * 16, y = 222;
            const on = i < w.locks.length;
            s.rect(x, y, 12, 6, c.ink);
            s.rect(x + 1, y + 1, 10, 4, on ? c.red : c.darkRed);
        }
        // the mercy lamps
        if (r.autoRollsGiven > 0 || r.mercyActive) {
            const lit = r.mercyActive || w.autoRolls > 0;
            s.textShadow('AUTO ROLL', 12, 202, small, lit ? c.green : c.greenDim, c.ink);
        }
    }

    _plate(sc, x0, y0, x1, y1) {
        const u32 = sc.u32, W = sc.W, ink = PAL32[INK];
        x0 = Math.max(sc.x0, x0); y0 = Math.max(sc.y0, y0); x1 = Math.min(sc.x1, x1); y1 = Math.min(sc.y1, y1);
        for (let y = y0; y < y1; y++) for (let x = x0 + ((x0 + y) & 1); x < x1; x += 2) u32[y * W + x] = ink;
    }

    // ------------------------------------------------------------------ the cards
    _cards(s, sc, w, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display, c = this.c;
        if (r.p === Phase.Intro) {
            const k = Math.min(1, r.phaseTime / 0.25);
            this._plate(sc, 20, 58, 300, 136);
            s.rect(20, 58, 280, 1, c.orange); s.rect(20, 135, 280, 1, c.orange);
            const title = 'STAGE ' + (w.stage + 1);
            const x = 160 - (dsp.measure(title, 3) >> 1);
            s.text(title, x + 3, 66 + 3, dsp, c.darkRed, 3);
            s.textTwoTone(title, x, 66, dsp, c.yellow, c.orange, 4, 3);
            if (k >= 1) s.textCenteredShadow(STAGES[w.stage].name, 160, 98, arc, c.white, c.ink, 2);
            if (r.phaseTime > 0.8) s.textCenteredShadow(r.phaseTime > r.introSeconds - 0.7 ? 'GO!' : 'GET READY', 160, 120, arc, c.yellow, c.ink);
        } else if (r.p === Phase.Clear && r.lastClear) {
            const L = r.lastClear;
            this._plate(sc, 24, 48, 296, 170);
            s.rect(24, 48, 272, 1, c.orange); s.rect(24, 169, 272, 1, c.orange);
            s.textCenteredShadow('STAGE ' + (L.stage + 1) + ' CLEAR', 160, 56, dsp, c.yellow, c.darkRed, 2);
            let y = 84;
            const line = (a, b, col) => { s.textShadow(a, 40, y, arc, col, c.ink); s.textShadow(b, 280 - arc.measure(b), y, arc, c.white, c.ink); y += 14; };
            if (r.phaseTime > 0.4) line('HIT ' + L.hits + ' X 100', String(L.hitBonus), c.orange);
            if (r.phaseTime > 0.9) line(L.result === 1 ? 'FORTRESS DESTROYED' : 'FORTRESS ESCAPED', L.bossBonus > 0 ? String(L.bossBonus) : '0', L.result === 1 ? c.orange : c.red);
            if (r.phaseTime > 1.4) { y += 4; line('SCORE', dn(w.score, 7), c.yellow); }
            if (r.phaseTime > 2.2 && L.stage < 2) s.textCenteredShadow('NEXT  ' + STAGES[L.stage + 1].name, 160, 152, arc, c.white, c.ink);
        } else if (r.p === Phase.Card) {
            const won = r.result === 2;
            this._plate(sc, 16, 56, 304, 164);
            s.rect(16, 56, 288, 1, won ? c.yellow : c.red); s.rect(16, 163, 288, 1, won ? c.yellow : c.red);
            if (won) {
                s.textCenteredShadow(AfterglowSpec.roundWonText, 160, 68, dsp, c.yellow, c.darkRed, 2);
                s.textCenteredShadow('THE SKY IS YOURS, ACE', 160, 94, arc, c.white, c.ink);
            } else {
                const title = AfterglowSpec.roundLostText;
                const x = 160 - (dsp.measure(title, 3) >> 1);
                s.text(title, x + 3, 66 + 3, dsp, c.darkRed, 3);
                s.textTwoTone(title, x, 66, dsp, c.white, c.red, 4, 3);
            }
            s.textCenteredShadow('SCORE ' + dn(w.score, 7) + '   HIT ' + w.hits, 160, 120, arc, c.white, c.ink);
            s.textCenteredShadow('STAGES CLEARED ' + r.stagesCleared + '/3', 160, 138, arc, won ? c.yellow : c.orange, c.ink);
        }
    }
}
