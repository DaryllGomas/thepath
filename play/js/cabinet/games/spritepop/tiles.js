// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) · THE TILES: one screen of platforms.
// Port of SpritePopTiles.cs (SpritePopLevel) from Staging/Batch2/spritepop.
//
// A field of 19 x 12 tiles of 16 px (304 x 192, drawn at screen (8, 32)). Column 0 and column 18
// are the side walls; row 0 is the ceiling and row 11 the floor, and both have the same 3-tile gap
// in the middle: fall through the floor and you drop back in through the ceiling (wrap-around).
// Every other tile is a ONE-WAY platform, solid only from above, the way the 1986 board did it:
// you jump up through a platform and land on top of it.
//
// The level also carries what the bot and the creatures need to know about it:
//   standable(col,row)  a tile you can stand on (solid, with air above it)
//   topReach[col]       a bubble parked under the ceiling in this column can be reached by the cub
//                       (a platform on rows 1-5 below it: stand on row 2, or jump from rows 3-5)
//   topDrift[col]       the ceiling's air current: which way a parked bubble drifts (-1/0/+1)
//                       toward the nearest reachable column, so no bubble parks out of reach
//   the NAV GRAPH       stand spots joined by walk / jump / fall (+wrap) edges, with all-pairs
//                       costs and next hops precomputed once per layout (shared, immutable)
import { f32 } from '../../sdk/index.js';

const Tile = 16, Cols = 19, Rows = 12;
const Far = 1 << 20;

// '#' = a tile. Rows 0 and 11 must keep their gaps aligned (the wrap).
const Layouts = [
    [                       // 0  THE SHELVES: wall shelves and a long middle bar on three rows
        '########...########',
        '#.................#',
        '###...#######...###',
        '#.................#',
        '#.................#',
        '###...#######...###',
        '#.................#',
        '#.................#',
        '###...#######...###',
        '#.................#',
        '#.................#',
        '########...########',
    ],
    [                       // 1  THE CUPS: a bridge low, wall arms in the middle, two cups on top
        '########...########',
        '#.................#',
        '#..####.....####..#',
        '#.................#',
        '#.................#',
        '#######.....#######',
        '#.................#',
        '#.................#',
        '#....#########....#',
        '#.................#',
        '#.................#',
        '########...########',
    ],
    [                       // 2  THE DIAMOND: two pairs of wings and a bar between them
        '########...########',
        '#.................#',
        '#.#####.....#####.#',
        '#.................#',
        '#.................#',
        '#.....#######.....#',
        '#.................#',
        '#.................#',
        '#.#####.....#####.#',
        '#.................#',
        '#.................#',
        '########...########',
    ],
];

const Names = ['THE SHELVES', 'THE CUPS', 'THE DIAMOND'];
const cache = new Array(Layouts.length).fill(null);

export class SpritePopLevel {
    static get count() { return Layouts.length; }

    static get(index) {
        index = ((index % Layouts.length) + Layouts.length) % Layouts.length;
        if (cache[index] == null) cache[index] = new SpritePopLevel(index);
        return cache[index];
    }

    constructor(index) {
        this.index = index;
        this.name = Names[index];
        this._solid = new Uint8Array(Cols * Rows);
        this.topReach = new Array(Cols).fill(false);
        this.topDrift = new Int32Array(Cols);
        const rows = Layouts[index];
        for (let r = 0; r < Rows; r++)
            for (let c = 0; c < Cols; c++)
                this._solid[r * Cols + c] = rows[r][c] === '#' ? 1 : 0;
        this.gapL = -1; this.gapR = -1;
        for (let c = 1; c < Cols - 1; c++)
            if (!this.solid(c, SpritePopLevel.FloorRow)) { if (this.gapL < 0) this.gapL = c; this.gapR = c; }

        // the ceiling's reach and its air current
        for (let c = 1; c < Cols - 1; c++)
            for (let r = 1; r <= 5 && !this.topReach[c]; r++)
                if (this.standable(c, r)) this.topReach[c] = true;
        for (let c = 0; c < Cols; c++) {
            if (c >= 1 && c < Cols - 1 && this.topReach[c]) { this.topDrift[c] = 0; continue; }
            let best = 99, dir = 0;
            for (let k = 1; k < Cols - 1; k++)
                if (this.topReach[k] && Math.abs(k - c) < best) { best = Math.abs(k - c); dir = k > c ? 1 : -1; }
            this.topDrift[c] = dir;
        }
        this._buildNav();
    }

    // ------------------------------------------------------------------ queries
    solid(col, row) {
        if (col < 0 || col >= Cols) return true;
        if (row < 0 || row >= Rows) return false;
        return this._solid[row * Cols + col] === 1;
    }

    standable(col, row) {
        return row >= 1 && row < Rows && col >= 1 && col < Cols - 1 && this.solid(col, row) && !this.solid(col, row - 1);
    }

    // a tile top on this row somewhere under [x0, x1] (field px)
    solidSpan(x0, x1, row) {
        if (row < 1 || row >= Rows) return false;               // the ceiling is never landed on
        const c0 = Math.floor(f32(x0 / Tile)), c1 = Math.floor(f32(x1 / Tile));
        for (let c = c0; c <= c1; c++) if (this.solid(c, row)) return true;
        return false;
    }

    // the ceiling tile over [x0, x1] (blocks a jump)
    ceilingSpan(x0, x1) {
        const c0 = Math.floor(f32(x0 / Tile)), c1 = Math.floor(f32(x1 / Tile));
        for (let c = c0; c <= c1; c++) if (this.solid(c, 0)) return true;
        return false;
    }

    static colOf(x) { return Math.max(0, Math.min(Cols - 1, Math.floor(f32(x / Tile)))); }
    static colCenter(c) { return f32(c * Tile + Tile * 0.5); }

    // the highest stand spot a straight jump from (col,row) lands on, or -1
    jumpLanding(col, row) {
        for (let dr = 3; dr >= 1; dr--) {
            const rr = row - dr;
            if (rr >= 1 && this.standable(col, rr)) return rr;
        }
        return -1;
    }

    // where something walking off into column col at row fromRow lands: { row, wrapped } (row -1 = nowhere)
    fallLanding(col, fromRow) {
        for (let rr = fromRow + 1; rr < Rows; rr++)
            if (this.solid(col, rr)) return { row: this.standable(col, rr) ? rr : -1, wrapped: false };
        // through the floor gap: back in through the ceiling
        for (let rr = 1; rr < Rows; rr++)
            if (this.solid(col, rr)) return { row: this.standable(col, rr) ? rr : -1, wrapped: true };
        return { row: -1, wrapped: true };
    }

    // ------------------------------------------------------------------ the nav graph
    node(col, row) {
        if (col < 0 || col >= Cols || row < 0 || row >= Rows) return -1;
        return this._nodeOf[row * Cols + col];
    }
    nodeCol(n) { return this._nodeCol[n]; }
    nodeRow(n) { return this._nodeRow[n]; }
    dist(a, b) { return a < 0 || b < 0 ? Far : this._dist[a * this.nodeCount + b]; }
    nextHop(a, b) { return a < 0 || b < 0 ? -1 : this._next[a * this.nodeCount + b]; }
    edgesFrom(n) { return this._adj[n]; }

    edgeTo(a, b) {
        for (const e of this._adj[a]) if (e.to === b) return e;
        return { to: -1, kind: 0, cost: 0, col: 0 };
    }

    _buildNav() {
        const cols = [], rows = [];
        this._nodeOf = new Int32Array(Cols * Rows).fill(-1);
        for (let r = 1; r < Rows; r++)
            for (let c = 1; c < Cols - 1; c++)
                if (this.standable(c, r)) { this._nodeOf[r * Cols + c] = cols.length; cols.push(c); rows.push(r); }
        const N = this.nodeCount = cols.length;
        this._nodeCol = cols; this._nodeRow = rows;
        this._adj = [];
        for (let n = 0; n < N; n++) {
            const adj = [];
            this._adj.push(adj);
            const c = cols[n], r = rows[n];
            for (let d = -1; d <= 1; d += 2) {
                const c2 = c + d;
                if (c2 < 1 || c2 >= Cols - 1) continue;
                if (this.standable(c2, r)) adj.push({ to: this.node(c2, r), kind: SpritePopLevel.EdgeWalk, cost: 1, col: c2 });
                else if (!this.solid(c2, r)) {
                    const fl = this.fallLanding(c2, r);
                    if (fl.row >= 0) adj.push({ to: this.node(c2, fl.row), kind: SpritePopLevel.EdgeFall, cost: fl.wrapped ? 5 : 2, col: c2 });
                }
            }
            const jr = this.jumpLanding(c, r);
            if (jr >= 0) adj.push({ to: this.node(c, jr), kind: SpritePopLevel.EdgeJump, cost: 3, col: c });
        }
        // all pairs (Floyd-Warshall with next hops; ~60 nodes)
        const dist = this._dist = new Int32Array(N * N), next = this._next = new Int32Array(N * N);
        for (let a = 0; a < N; a++)
            for (let b = 0; b < N; b++) { dist[a * N + b] = a === b ? 0 : Far; next[a * N + b] = a === b ? a : -1; }
        for (let a = 0; a < N; a++)
            for (const e of this._adj[a])
                if (e.cost < dist[a * N + e.to]) { dist[a * N + e.to] = e.cost; next[a * N + e.to] = e.to; }
        for (let k = 0; k < N; k++)
            for (let a = 0; a < N; a++) {
                const ak = dist[a * N + k];
                if (ak >= Far) continue;
                for (let b = 0; b < N; b++) {
                    const v = ak + dist[k * N + b];
                    if (v < dist[a * N + b]) { dist[a * N + b] = v; next[a * N + b] = next[a * N + k]; }
                }
            }
    }

    // spots a creature can start on: stand spots on the platform rows, never the floor near the cub
    creatureSpots() {
        const list = [];
        for (let n = 0; n < this.nodeCount; n++) {
            const r = this._nodeRow[n], c = this._nodeCol[n];
            if (r === SpritePopLevel.FloorRow && c < 8) continue;               // the cub's corner stays clear...
            if (r >= SpritePopLevel.FloorRow - 3 && c < 6) continue;            // ...and so do the shelves right over it
            list.push(n);
        }
        return list;
    }
}

SpritePopLevel.Tile = Tile;
SpritePopLevel.Cols = Cols;
SpritePopLevel.Rows = Rows;
SpritePopLevel.FW = Cols * Tile;            // 304
SpritePopLevel.FH = Rows * Tile;            // 192
SpritePopLevel.InnerL = Tile;               // 16 .. 288: between the walls
SpritePopLevel.InnerR = Cols * Tile - Tile;
SpritePopLevel.CeilingY = Tile;             // the underside of the ceiling
SpritePopLevel.FloorRow = Rows - 1;
SpritePopLevel.JumpRise = f32(59);          // px a jump lifts the feet (see the sim's physics)
SpritePopLevel.EdgeWalk = 0;
SpritePopLevel.EdgeJump = 1;
SpritePopLevel.EdgeFall = 2;
SpritePopLevel.Far = Far;
SpritePopLevel.Names = Names;
