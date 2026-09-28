// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · THE FIELD: rows, lanes
// and the things in them. Port of LaneJumperField.cs (Staging/Batch2/lanejumper), f32 throughout.
//
// The field is 13 tiles x 14 rows of 16 px (208 x 224), top row first:
//   row 0       the far kerb: five MAIL SLOTS (cols 2,4,6,8,10) set in a wall
//   rows 1-5    the river: logs and turtle groups riding the current (alternating directions)
//   row 6       the median
//   rows 7-12   six traffic lanes: cars, the bus, sports cars, trucks, vans, cars (alternating)
//   row 13      the bottom kerb, where every courier starts (col 6)
//
// A lane is a LOOP of things longer than the screen (loop >= field width + the longest thing), so
// a thing leaving one edge is invisible when it wraps to the other. Offset advances Speed px/s and
// a thing's screen-left is wrap(U + Offset) - Moff. Deterministic.
import { f32 } from '../../sdk/index.js';

export const RowKind = Object.freeze({ Home: 0, River: 1, Median: 2, Road: 3, Kerb: 4 });
export const ThingKind = Object.freeze({ Car: 0, Van: 1, Sports: 2, Truck: 3, Bus: 4, Log: 5, Turtles: 6 });

export class LaneThing {
    constructor() {
        this.kind = ThingKind.Car;
        this.u = 0;                             // loop position of the left end (float)
        this.len = 0;                           // px along the lane
        this.variant = 0;                       // colour scheme
        this.count = 0;                         // turtles in a group
        this.dives = false;                     // a diving turtle group
        this.divePhase = 0;                     // seconds into its dive cycle at world time 0 (float)
    }
}

export class Lane {
    constructor() {
        this.row = 0;
        this.kind = RowKind.Home;
        this.makes = ThingKind.Car;
        this.speed = 0;                         // px/s, + = right (float)
        this.loop = 0; this.moff = 0; this.offset = 0;
        this.things = [];
    }

    get dir() { return this.speed >= 0 ? 1 : -1; }

    // screen-left (field px) of a thing, dtAhead seconds from now
    left(th, dtAhead = 0) {
        let u = f32(f32(f32(th.u + this.offset) + f32(this.speed * dtAhead)) % this.loop);
        if (u < 0) u = f32(u + this.loop);
        return f32(u - this.moff);
    }

    advance(dt) {
        this.offset = f32(f32(this.offset + f32(this.speed * dt)) % this.loop);
        if (this.offset < 0) this.offset = f32(this.offset + this.loop);
    }
}

const Tile = 16, Cols = 13, Rows = 14;
const SlotCols = Object.freeze([2, 4, 6, 8, 10]);
const DiveUp = f32(4.0), DiveSink = f32(1.0), DiveRise = f32(0.6);
const DiveUpSink = f32(DiveUp + DiveSink);          // C# folds DiveUp + DiveSink at compile time

// the lane plan: row, what it carries, direction, base speed px/s, extra gap spread (tiles), size
// (a log's length in px, a turtle group's count)
const Plan = Object.freeze([
    { row: 1, kind: ThingKind.Log, dir: -1, speed: f32(30), extra: 0, size: 48 },          // medium logs
    { row: 2, kind: ThingKind.Turtles, dir: +1, speed: f32(34), extra: 0, size: 2 },       // turtle pairs
    { row: 3, kind: ThingKind.Log, dir: -1, speed: f32(42), extra: 0, size: 80 },          // long logs, fast
    { row: 4, kind: ThingKind.Log, dir: +1, speed: f32(24), extra: 0, size: 32 },          // short logs, slow
    { row: 5, kind: ThingKind.Turtles, dir: -1, speed: f32(32), extra: 0, size: 3 },       // turtle triples
    { row: 7, kind: ThingKind.Car, dir: +1, speed: f32(44), extra: 0, size: 0 },
    { row: 8, kind: ThingKind.Bus, dir: -1, speed: f32(30), extra: f32(1), size: 0 },
    { row: 9, kind: ThingKind.Sports, dir: +1, speed: f32(64), extra: f32(3), size: 0 },
    { row: 10, kind: ThingKind.Truck, dir: -1, speed: f32(26), extra: f32(0.5), size: 0 },
    { row: 11, kind: ThingKind.Van, dir: +1, speed: f32(36), extra: 0, size: 0 },
    { row: 12, kind: ThingKind.Car, dir: -1, speed: f32(24), extra: 0, size: 0 },
]);

const M64 = (1n << 64n) - 1n;

export const LaneField = Object.freeze({
    Tile, Cols, Rows,
    FieldW: Cols * Tile, FieldH: Rows * Tile,       // 208 x 224
    HomeRow: 0, MedianRow: 6, KerbRow: 13, StartCol: 6,
    SlotCols,
    Slots: 5,
    Plan,
    DiveUp, DiveSink, DiveRise,

    // System.Random seeded with evenly strided seeds (the bench's round seeds) gives correlated
    // first draws, so every round would get near-identical lanes. SplitMix64 the seed first.
    mixSeed(seed) {
        let z = (BigInt(seed >>> 0) + 0x9E3779B97F4A7C15n) & M64;
        z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M64;
        z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M64;
        z ^= z >> 31n;
        const m = Number(z & 0x7FFFFFFFn);
        return m === 0 ? 1 : m;
    },

    slotX(i) { return f32(SlotCols[i] * Tile + Tile * 0.5); },
    colX(col) { return f32(col * Tile + Tile * 0.5); },

    kindOf(row) {
        if (row <= 0) return RowKind.Home;
        if (row <= 5) return RowKind.River;
        if (row === 6) return RowKind.Median;
        if (row <= 12) return RowKind.Road;
        return RowKind.Kerb;
    },

    isLand(row) { const k = LaneField.kindOf(row); return k === RowKind.Kerb || k === RowKind.Median || k === RowKind.Road; },

    vehicleLen(k) {
        switch (k) {
            case ThingKind.Car: return 24;
            case ThingKind.Van: return 28;
            case ThingKind.Sports: return 24;
            case ThingKind.Truck: return 46;
            case ThingKind.Bus: return 54;
            default: return 24;
        }
    },

    // turtle dive cycle: up, sinking (still rideable), under (not), rising (rideable)
    // 0 up, 1 sinking, 2 under, 3 rising
    turtleState(th, worldTime, under) {
        if (!th.dives) return 0;
        const cyc = f32(f32(DiveUpSink + under) + DiveRise);
        let p = f32(f32(worldTime + th.divePhase) % cyc);
        if (p < 0) p = f32(p + cyc);
        if (p < DiveUp) return 0;
        if (p < DiveUpSink) return 1;
        if (p < f32(DiveUpSink + under)) return 2;
        return 3;
    },

    // seconds from worldTime until the group next goes under (0 if under now, +inf if it never dives)
    timeToUnder(th, worldTime, under) {
        if (!th.dives) return Infinity;
        const cyc = f32(f32(DiveUpSink + under) + DiveRise);
        let p = f32(f32(worldTime + th.divePhase) % cyc);
        if (p < 0) p = f32(p + cyc);
        const a = DiveUpSink, b = f32(a + under);
        if (p >= a && p < b) return 0;
        return p < a ? f32(a - p) : f32(f32(cyc - p) + a);
    },

    build(rng, roadSpeed, riverSpeed, laneGap, safeGap, gapSpread, waterGap, turtleDive) {
        const lanes = new Array(Rows).fill(null);
        for (const sp of Plan) {
            const lane = new Lane();
            lane.row = sp.row; lane.kind = LaneField.kindOf(sp.row); lane.makes = sp.kind;
            const river = lane.kind === RowKind.River;
            lane.speed = f32(f32(sp.dir * sp.speed) * (river ? riverSpeed : roadSpeed));
            const maxLen = river ? (sp.kind === ThingKind.Turtles ? sp.size * Tile : sp.size) : LaneField.vehicleLen(sp.kind);
            const minLoop = f32(Cols * Tile + maxLen + Tile);
            let pos = 0;
            let first = true;
            let n = 0;
            while (pos < minLoop || n < 2) {
                const th = new LaneThing();
                th.kind = sp.kind; th.u = pos; th.variant = rng.next(4);
                if (sp.kind === ThingKind.Turtles) {
                    th.count = sp.size; th.len = sp.size * Tile;
                    th.dives = rng.nextDouble() < turtleDive;
                    th.divePhase = f32(f32(rng.nextDouble()) * 20);
                }
                else if (sp.kind === ThingKind.Log) th.len = sp.size;
                else th.len = LaneField.vehicleLen(sp.kind);
                lane.things.push(th);
                pos = f32(pos + th.len);
                let gapTiles;
                if (river) {
                    const lo = Math.min(1, waterGap);
                    gapTiles = f32(lo + f32(f32(rng.nextDouble()) * Math.max(0, f32(waterGap - lo))));
                }
                else {
                    gapTiles = f32(laneGap + f32(f32(rng.nextDouble()) * f32(gapSpread + sp.extra)));
                    if (first) gapTiles = Math.max(gapTiles, safeGap);     // THE GUARANTEED SAFE GAP
                }
                first = false;
                pos = f32(pos + f32(gapTiles * Tile));
                n++;
            }
            lane.loop = pos;
            lane.moff = maxLen;
            lane.offset = f32(f32(rng.nextDouble()) * lane.loop);
            // a turtle lane always keeps at least one group that never dives
            if (sp.kind === ThingKind.Turtles) {
                let any = false;
                for (const th of lane.things) if (!th.dives) any = true;
                if (!any) lane.things[0].dives = false;
            }
            lanes[sp.row] = lane;
        }
        return lanes;
    },
});
