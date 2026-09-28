// THE NODE · world 1 · SHORT ORDER (Northgate Novelty Co., 1982) · THE KITCHEN: floors, ladders,
// the four burger columns and the plates. Static data plus the graph every mover walks.
// Port of ShortOrderMap.cs (Staging/Batch2/shortorder).
//
// The screen is 19 columns of 16 px tiles (x 8..311, the whole safe area) by five floors 32 px
// apart (feet at y 56, 88, 120, 152, 184). A NODE is (column, floor) where that floor has a tile.
// Movers travel node to node: 16 px along a floor, 32 px up or down a ladder. Ladders stand in
// the five columns between the burgers (1, 5, 9, 13, 17); the burgers are 3 tiles wide at
// columns 2, 6, 10 and 14. Floors 1 and 3 have a hole over one burger each, so those two columns
// stack on four floors and the other two on five. The plates sit under the bottom floor.
//
// dist[a * NodeCount + b] is the shortest walking cost between nodes (16 a floor step, 40 a ladder
// step: the climb is slower), hop[a * NodeCount + b] the first direction of that walk. Both are
// computed once, at module load (C#: the static constructor).
import { Dir4 } from '../../sdk/index.js';

const Cols = 19, Floors = 5, Burgers = 4, PartsPerBurger = 4, PartTiles = 3;
const TilePx = 16, FloorPitch = 32;
const OX = 8, FloorY0 = 56;             // x of column 0's left edge; feet y of floor 0
const PlateY = 226;                     // top of the plates
const CostH = 16, CostV = 40;
const NodeCount = Floors * Cols;
const Unreachable = Math.trunc(2147483647 / 4);

// '=' a floor tile, 'H' a ladder between the floor above and the floor below
const Layout = [
    '===================',   // floor 0
    ' H   H       H   H ',
    '==========   ======',   // floor 1 (hole over burger 3)
    '     H   H   H     ',
    '===================',   // floor 2
    ' H       H       H ',
    '======   ==========',   // floor 3 (hole over burger 2)
    '     H   H       H ',
    '===================',   // floor 4
];

const BurgerCol0 = [2, 6, 10, 14];
// which floor each part starts on, top bun first (per burger)
const StartFloors = [
    [0, 1, 2, 3],
    [0, 1, 2, 4],
    [0, 2, 3, 4],
    [0, 2, 3, 4],
];

const floor = new Uint8Array(Floors * Cols);            // [f * Cols + c]
const ladder = new Uint8Array((Floors - 1) * Cols);     // [g * Cols + c]
const ColumnFloors = new Array(Burgers);                // floors that span each burger column
const Dist = new Int32Array(NodeCount * NodeCount);     // C# Dist[a, b] -> Dist[a * NodeCount + b]
const Hop = new Int8Array(NodeCount * NodeCount);       // C# Hop[a, b]  (sbyte, -1 = none)

// ------------------------------------------------------------------ geometry
function colX(c) { return OX + c * TilePx + (TilePx >> 1); }        // centre x of a column
function floorY(f) { return FloorY0 + f * FloorPitch; }            // feet y of a floor
function burgerX0(b) { return OX + BurgerCol0[b] * TilePx; }        // left px of a burger column
const BurgerW = PartTiles * TilePx;

function walk(c, f) { return c >= 0 && c < Cols && f >= 0 && f < Floors && floor[f * Cols + c] === 1; }
function ladderBelow(c, f) { return f >= 0 && f < Floors - 1 && c >= 0 && c < Cols && ladder[f * Cols + c] === 1; }

function canMove(c, f, dir) {
    if (!walk(c, f)) return false;
    switch (dir) {
        case Dir4.Left: return walk(c - 1, f);
        case Dir4.Right: return walk(c + 1, f);
        case Dir4.Up: return ladderBelow(c, f - 1);
        case Dir4.Down: return ladderBelow(c, f);
        default: return false;
    }
}

function nextC(c, dir) { return c + (dir === Dir4.Left ? -1 : dir === Dir4.Right ? 1 : 0); }
function nextF(f, dir) { return f + (dir === Dir4.Up ? -1 : dir === Dir4.Down ? 1 : 0); }
function vertical(dir) { return dir === Dir4.Up || dir === Dir4.Down; }
function edgeLen(dir) { return vertical(dir) ? FloorPitch : TilePx; }

function node(c, f) { return f * Cols + c; }
function nodeC(n) { return n % Cols; }
function nodeF(n) { return Math.trunc(n / Cols); }

// which burger column a floor tile belongs to (-1 = a ladder column or the edge)
function burgerAt(c) {
    for (let b = 0; b < Burgers; b++) if (c >= BurgerCol0[b] && c < BurgerCol0[b] + PartTiles) return b;
    return -1;
}

// ------------------------------------------------------------------ all-pairs paths
function buildPaths() {
    const dist = new Int32Array(NodeCount);
    const done = new Uint8Array(NodeCount);
    for (let t = 0; t < NodeCount; t++) {
        for (let i = 0; i < NodeCount; i++) { dist[i] = Unreachable; done[i] = 0; }
        if (walk(nodeC(t), nodeF(t))) dist[t] = 0;
        // Dijkstra from the target (the graph is undirected), O(n^2) on 95 nodes
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
}

// the static constructor
for (let f = 0; f < Floors; f++)
    for (let c = 0; c < Cols; c++)
        floor[f * Cols + c] = Layout[f * 2][c] === '=' ? 1 : 0;
for (let g = 0; g < Floors - 1; g++)
    for (let c = 0; c < Cols; c++)
        ladder[g * Cols + c] = Layout[g * 2 + 1][c] === 'H' && floor[g * Cols + c] === 1 && floor[(g + 1) * Cols + c] === 1 ? 1 : 0;
for (let b = 0; b < Burgers; b++) {
    const list = [];
    for (let f = 0; f < Floors; f++) {
        let span = true;
        for (let k = 0; k < PartTiles; k++) span = span && floor[f * Cols + BurgerCol0[b] + k] === 1;
        if (span) list.push(f);
    }
    ColumnFloors[b] = list;
}
buildPaths();

export const ShortOrderMap = Object.freeze({
    Cols, Floors, Burgers, PartsPerBurger, PartTiles,
    TilePx, FloorPitch, OX, FloorY0, PlateY, CostH, CostV, NodeCount, Unreachable,
    BurgerCol0, StartFloors,
    StartC: 9, StartF: 4,                             // the chef starts mid bottom floor
    SpawnC: [0, 18, 0, 18, 0, 18],
    SpawnF: [0, 0, 2, 2, 4, 4],
    ColumnFloors, Dist, Hop, BurgerW,
    colX, floorY, burgerX0, walk, ladderBelow, canMove, nextC, nextF, vertical, edgeLen,
    node, nodeC, nodeF, burgerAt,
    dist(a, b) { return Dist[a * NodeCount + b]; },
    hop(a, b) { return Hop[a * NodeCount + b]; },
});
