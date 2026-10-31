// THE NODE · world 1 · SHORT ORDER (Northgate Novelty Co., 1982) · THE KITCHENS: five floor plans, the burger
// columns on them, and the graph every mover walks. Static data plus the path tables.
// (Built out 2026-10-18: the Unity port had one kitchen; this has five, KITCHENS below.)
//
// The screen is 19 columns of 16 px tiles (x 8..311, the whole safe area) by five floors 32 px
// apart (feet at y 56, 88, 120, 152, 184). A NODE is (column, floor) where that floor has a tile.
// Movers travel node to node: 16 px along a floor, 32 px up or down a ladder. The geometry is the
// same in every kitchen (ShortOrderMap: colX, floorY, edgeLen ...); what differs is the KITCHEN
// (ShortOrderMap.Kitchens[i]): which floor tiles and ladders exist, where the burger columns stand
// and what goes on them, which floors are belts or slick, and what the kitchen sends at you.
//
// A kitchen is built from a short definition (holes per floor, ladder columns per gap, burgers,
// conveyor strings, slick floors, a chaser lineup) by buildKitchen(). dist[a * NodeCount + b] is
// the shortest walking cost between nodes (16 a floor step, 40 a ladder step: the climb is
// slower), hop[a * NodeCount + b] the first direction of that walk; both are computed once per
// kitchen, at module load. The plates sit under the bottom floor.
import { Dir4 } from '../../sdk/index.js';

const Cols = 19, Floors = 5, PartTiles = 3;
const TilePx = 16, FloorPitch = 32;
const OX = 8, FloorY0 = 56;             // x of column 0's left edge; feet y of floor 0
const PlateY = 226;                     // top of the plates
const CostH = 16, CostV = 40;
const NodeCount = Floors * Cols;
const Unreachable = Math.trunc(2147483647 / 4);
const BurgerW = PartTiles * TilePx;

// burger part kinds (top of the stack first when a burger lists them)
export const Part = Object.freeze({ BunTop: 0, Lettuce: 1, Patty: 2, BunBottom: 3, Cheese: 4 });
const T = Part.BunTop, L = Part.Lettuce, P = Part.Patty, B = Part.BunBottom, C = Part.Cheese;

// chaser kinds (the sim re-exports these as FoeKind)
export const Chaser = Object.freeze({ HotDog: 0, Pickle: 1, Egg: 2, Chili: 3, Rival: 4 });
const H = Chaser.HotDog, K = Chaser.Pickle, E = Chaser.Egg, CH = Chaser.Chili, RV = Chaser.Rival;

// ------------------------------------------------------------------ the five kitchens
// holes: per floor, the [c0, c1] tile ranges left blank. ladders: per gap (floor g to g+1), the columns.
// burgers: { c0, kinds (top of the stack first), floors (the floor each part starts on, top first) }.
// conv: per floor, a 19 character string, '>' a belt pushing right, '<' left. slick: floors the chef skates on.
// lineup: the chasers, in the order they walk in. pace: chaser speed against the chef (before the mercy knob).
// ticket: seconds before the order is LATE (0 = no clock). food: where a bonus plate may appear.
export const KITCHENS = [
    {
        name: 'THE LUNCH COUNTER', hint: 'WALK OVER A PART TO DROP IT',
        holes: [[], [[10, 12]], [], [[6, 8]], []],
        ladders: [[1, 5, 13, 17], [5, 9, 13], [1, 9, 17], [5, 9, 17]],
        burgers: [
            { c0: 2, kinds: [T, P, B], floors: [0, 2, 3] },
            { c0: 6, kinds: [T, P, B], floors: [0, 1, 2] },
            { c0: 10, kinds: [T, P, B], floors: [0, 2, 3] },
            { c0: 14, kinds: [T, P, B], floors: [0, 1, 3] },
        ],
        lineup: [H, H, H], pace: 0.74, spawnGap: 3.2, firstSpawn: 1.5, food: [], foodGap: 0, ticket: 0,
        girder: 'girder', girderLt: 'girderLt',
    },
    {
        name: 'SIDE ORDERS', hint: 'FRIES REFILL THE PEPPER',
        holes: [[], [[2, 4]], [], [[14, 16]], []],
        ladders: [[1, 5, 9, 13, 17], [5, 9, 17], [1, 9, 13], [5, 9, 13, 17]],
        burgers: [
            { c0: 2, kinds: [T, L, P, B], floors: [0, 2, 3, 4] },
            { c0: 6, kinds: [T, L, P, B], floors: [0, 1, 2, 4] },
            { c0: 10, kinds: [T, L, P, B], floors: [0, 1, 3, 4] },
            { c0: 14, kinds: [T, L, P, B], floors: [0, 1, 2, 4] },
        ],
        lineup: [H, K, E, H, K], pace: 0.80, spawnGap: 2.8, firstSpawn: 1.2,
        food: [[0, 0], [18, 2], [9, 3], [0, 4], [18, 4], [9, 1]], foodGap: 11, ticket: 0,
        girder: 'girderG', girderLt: 'girderGLt',
    },
    {
        name: 'THE BELT LINE', hint: 'BELTS CARRY YOU, AND THEM',
        holes: [[], [[6, 8]], [], [[10, 12]], []],
        ladders: [[1, 5, 9, 13, 17], [1, 5, 9, 17], [5, 13, 17], [1, 9, 13, 17]],
        conv: ['', '>>>>>>>>>>>>>>>>>>>', '', '<<<<<<<<<<<<<<<<<<<', ''],
        burgers: [
            { c0: 2, kinds: [T, L, P, B], floors: [0, 1, 3, 4] },
            { c0: 6, kinds: [T, L, P, B], floors: [0, 2, 3, 4] },
            { c0: 10, kinds: [T, L, P, B], floors: [0, 1, 2, 4] },
            { c0: 14, kinds: [T, L, P, B], floors: [0, 1, 2, 3] },
        ],
        lineup: [H, CH, K, E, CH, H], pace: 0.82, spawnGap: 2.6, firstSpawn: 1.2,
        food: [[0, 2], [18, 0], [9, 4], [18, 2]], foodGap: 12, ticket: 0,
        girder: 'girder', girderLt: 'girderLt',
    },
    {
        name: 'THE DISH PIT', hint: 'THE FLOORS ARE SLICK: NO BRAKES',
        holes: [[], [], [], [], []],
        ladders: [[1, 6, 12, 17], [5, 13, 17], [1, 6, 12, 17], [5, 13, 17]],
        slick: [false, true, true, true, false],
        burgers: [
            { c0: 2, kinds: [T, L, C, P, B], floors: [0, 1, 2, 3, 4] },
            { c0: 8, kinds: [T, L, C, P, B], floors: [0, 1, 2, 3, 4] },
            { c0: 14, kinds: [T, L, C, P, B], floors: [0, 1, 2, 3, 4] },
        ],
        lineup: [H, CH, K, E, CH, K], pace: 0.84, spawnGap: 2.6, firstSpawn: 1.2,
        food: [[0, 1], [18, 1], [0, 3], [18, 3], [9, 2]], foodGap: 10, ticket: 0,
        girder: 'iceDk', girderLt: 'ice',
    },
    {
        name: 'RUSH ORDER', hint: 'DROP PARTS ON THE RIVAL. BEAT THE CLOCK',
        holes: [[], [[2, 4]], [], [[14, 16]], []],
        ladders: [[1, 5, 9, 13, 17], [5, 9, 13], [1, 9, 17], [5, 9, 13]],
        conv: ['', '', '>>>>>>>>>>>>>>>>>>>', '<<<<<<<<<<<<<<<<<<<', ''],
        slick: [false, true, false, false, false],
        burgers: [
            { c0: 2, kinds: [T, L, P, B], floors: [0, 2, 3, 4] },
            { c0: 6, kinds: [T, L, C, P, B], floors: [0, 1, 2, 3, 4] },
            { c0: 10, kinds: [T, L, C, P, B], floors: [0, 1, 2, 3, 4] },
            { c0: 14, kinds: [T, L, P, B], floors: [0, 1, 2, 4] },
        ],
        lineup: [H, CH, K, E, CH, RV], pace: 0.88, spawnGap: 2.4, firstSpawn: 1.0,
        food: [[0, 0], [18, 0], [0, 2], [18, 4], [9, 3], [9, 1]], foodGap: 9, ticket: 170,
        girder: 'girderR', girderLt: 'girderRLt',
    },
];

// ------------------------------------------------------------------ geometry (the same in every kitchen)
function colX(c) { return OX + c * TilePx + (TilePx >> 1); }        // centre x of a column
function floorY(f) { return FloorY0 + f * FloorPitch; }            // feet y of a floor
function burgerX0c(c0) { return OX + c0 * TilePx; }                // left px of a burger column

function nextC(c, dir) { return c + (dir === Dir4.Left ? -1 : dir === Dir4.Right ? 1 : 0); }
function nextF(f, dir) { return f + (dir === Dir4.Up ? -1 : dir === Dir4.Down ? 1 : 0); }
function vertical(dir) { return dir === Dir4.Up || dir === Dir4.Down; }
function edgeLen(dir) { return vertical(dir) ? FloorPitch : TilePx; }

function node(c, f) { return f * Cols + c; }
function nodeC(n) { return n % Cols; }
function nodeF(n) { return Math.trunc(n / Cols); }

// ------------------------------------------------------------------ building a kitchen
function buildKitchen(def, index) {
    const floor = new Uint8Array(Floors * Cols);            // [f * Cols + c]
    const ladder = new Uint8Array((Floors - 1) * Cols);     // [g * Cols + c]
    const conv = new Int8Array(Floors * Cols);              // +1 a belt pushing right, -1 left
    const slick = new Uint8Array(Floors);
    const Dist = new Int32Array(NodeCount * NodeCount);
    const Hop = new Int8Array(NodeCount * NodeCount);

    for (let f = 0; f < Floors; f++) {
        for (let c = 0; c < Cols; c++) floor[f * Cols + c] = 1;
        for (const [a, b] of def.holes[f] || []) for (let c = a; c <= b; c++) floor[f * Cols + c] = 0;
        const s = def.conv && def.conv[f] ? def.conv[f] : '';
        for (let c = 0; c < Cols; c++) conv[f * Cols + c] = floor[f * Cols + c] && s[c] === '>' ? 1 : floor[f * Cols + c] && s[c] === '<' ? -1 : 0;
        slick[f] = def.slick && def.slick[f] ? 1 : 0;
    }
    for (let g = 0; g < Floors - 1; g++)
        for (const c of def.ladders[g])
            if (floor[g * Cols + c] === 1 && floor[(g + 1) * Cols + c] === 1) ladder[g * Cols + c] = 1;

    const walk = (c, f) => c >= 0 && c < Cols && f >= 0 && f < Floors && floor[f * Cols + c] === 1;
    const ladderBelow = (c, f) => f >= 0 && f < Floors - 1 && c >= 0 && c < Cols && ladder[f * Cols + c] === 1;
    const canMove = (c, f, dir) => {
        if (!walk(c, f)) return false;
        switch (dir) {
            case Dir4.Left: return walk(c - 1, f);
            case Dir4.Right: return walk(c + 1, f);
            case Dir4.Up: return ladderBelow(c, f - 1);
            case Dir4.Down: return ladderBelow(c, f);
            default: return false;
        }
    };

    const burgers = def.burgers.map(b => ({ c0: b.c0, x0: burgerX0c(b.c0), kinds: b.kinds, floors: b.floors, n: b.kinds.length }));
    // floors that span each burger column (a part rests on one of these)
    const ColumnFloors = burgers.map(b => {
        const list = [];
        for (let f = 0; f < Floors; f++) {
            let span = true;
            for (let k = 0; k < PartTiles; k++) span = span && floor[f * Cols + b.c0 + k] === 1;
            if (span) list.push(f);
        }
        return list;
    });
    const burgerAt = (c) => {
        for (let b = 0; b < burgers.length; b++) if (c >= burgers[b].c0 && c < burgers[b].c0 + PartTiles) return b;
        return -1;
    };

    // all-pairs paths: Dijkstra from each target (the graph is undirected), O(n^2) on 95 nodes
    const dist = new Int32Array(NodeCount);
    const done = new Uint8Array(NodeCount);
    for (let t = 0; t < NodeCount; t++) {
        for (let i = 0; i < NodeCount; i++) { dist[i] = Unreachable; done[i] = 0; }
        if (walk(nodeC(t), nodeF(t))) dist[t] = 0;
        while (true) {
            let u = -1, best = Unreachable;
            for (let i = 0; i < NodeCount; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
            if (u < 0) break;
            done[u] = 1;
            const uc = nodeC(u), uf = nodeF(u);
            for (let d = 0; d < 4; d++) {
                if (!canMove(uc, uf, d)) continue;
                const v = node(nextC(uc, d), nextF(uf, d));
                const nd = best + (vertical(d) ? CostV : CostH);
                if (nd < dist[v]) dist[v] = nd;
            }
        }
        for (let a = 0; a < NodeCount; a++) {
            Dist[a * NodeCount + t] = dist[a];
            let hop = -1, hb = Unreachable;
            const ac = nodeC(a), af = nodeF(a);
            if (a !== t && dist[a] < Unreachable)
                for (let d = 0; d < 4; d++) {
                    if (!canMove(ac, af, d)) continue;
                    const v = node(nextC(ac, d), nextF(af, d));
                    const c2 = (vertical(d) ? CostV : CostH) + dist[v];
                    if (c2 < hb) { hb = c2; hop = d; }
                }
            Hop[a * NodeCount + t] = hop;
        }
    }

    // chasers walk in at the floor ends
    const SpawnC = [], SpawnF = [];
    for (let f = 0; f < Floors; f += 2) { if (walk(0, f)) { SpawnC.push(0); SpawnF.push(f); } if (walk(Cols - 1, f)) { SpawnC.push(Cols - 1); SpawnF.push(f); } }

    return {
        index, name: def.name, hint: def.hint, def,
        Burgers: burgers.length, burgers, ColumnFloors,
        lineup: def.lineup, pace: def.pace, spawnGap: def.spawnGap, firstSpawn: def.firstSpawn,
        food: def.food, foodGap: def.foodGap, ticket: def.ticket || 0,
        girder: def.girder, girderLt: def.girderLt,
        hasConv: !!def.conv, hasSlick: !!def.slick,
        floor, ladder, conv, slick, SpawnC, SpawnF, Dist, Hop,
        walk, ladderBelow, canMove, burgerAt,
        partsOf(b) { return burgers[b].n; },
        dist(a, b) { return Dist[a * NodeCount + b]; },
        hop(a, b) { return Hop[a * NodeCount + b]; },
    };
}

const Kitchens = KITCHENS.map(buildKitchen);

export const ShortOrderMap = Object.freeze({
    Cols, Floors, PartTiles,
    TilePx, FloorPitch, OX, FloorY0, PlateY, CostH, CostV, NodeCount, Unreachable, BurgerW,
    StartC: 9, StartF: 4,                             // the chef starts mid bottom floor
    Kitchens,
    colX, floorY, nextC, nextF, vertical, edgeLen, node, nodeC, nodeF,
});
