// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · THE FIELD: rows, lanes
// and the things in them. Grown from the port of LaneJumperField.cs; f32 throughout.
//
// The field is 13 tiles x 14 rows of 16 px (208 x 224), top row first:
//   row 0       the far kerb: five MAIL SLOTS (cols 2,4,6,8,10) set in a wall
//   rows 1-5    the river: logs, turtle groups, the mudjaw, the ferry
//   row 6       the median (a snake or the dog, on the stages that have one)
//   rows 7-12   six road rows: traffic lanes, and on the railway stages a track (a Road lane with rail = true)
//   row 13      the bottom kerb, where every courier starts (col 6)
// What runs in each row comes from the stage (stages.js); LaneField.build makes the lanes for one stage.
//
// A LOOP lane is a loop of things longer than the screen (loop >= field width + the longest thing), so a
// thing leaving one edge is invisible when it wraps to the other. Offset advances Speed px/s and a thing's
// screen-left is wrap(U + Offset) - Moff. A SHUTTLE lane (the ferry, the snake) has one thing going back and
// forth between two stops: offset is the seconds into its cycle and speed its velocity right now.
// THE WEAVER is a sports car on its own loop that changes between two same-way lanes on a fixed beat:
// cruise, then the blinker (the telegraph), then the shift (it covers both lanes), then cruise in the other.
// Deterministic: everything here is a function of the seed and the world clock.
import { f32 } from '../../sdk/index.js';

export const RowKind = Object.freeze({ Home: 0, River: 1, Median: 2, Road: 3, Kerb: 4 });
export const ThingKind = Object.freeze({
    Car: 0, Van: 1, Sports: 2, Truck: 3, Bus: 4, Log: 5, Turtles: 6, Moto: 7, Train: 8, Ferry: 9, Beast: 10, Snake: 11,
});

export class LaneThing {
    constructor() {
        this.kind = ThingKind.Car;
        this.u = 0;                             // loop position of the left end (float)
        this.len = 0;                           // px along the lane
        this.variant = 0;                       // colour scheme
        this.count = 0;                         // turtles in a group
        this.dives = false;                     // a diving turtle group
        this.divePhase = 0;                     // seconds into its dive (or jaw) cycle at world time 0 (float)
    }
}

export class Lane {
    constructor() {
        this.row = 0;
        this.kind = RowKind.Home;
        this.makes = ThingKind.Car;
        this.speed = 0;                         // px/s, + = right (float); a shuttle's velocity right now
        this.loop = 0; this.moff = 0; this.offset = 0;
        this.rail = false;                      // a railway track (the train is its one thing)
        this.shuttle = null;                    // { lo, hi, cruise, dwell, travel, period } for the ferry and the snake
        this.face = 1;                          // a shuttle's heading (+1 right, -1 left), dwells included
        this.things = [];
    }

    get dir() { return this.shuttle != null ? this.face : this.speed >= 0 ? 1 : -1; }

    // screen-left (field px) of a thing, dtAhead seconds from now
    left(th, dtAhead = 0) {
        if (this.shuttle != null) return shuttleLeft(this.shuttle, f32(this.offset + dtAhead));
        let u = f32(f32(f32(th.u + this.offset) + f32(this.speed * dtAhead)) % this.loop);
        if (u < 0) u = f32(u + this.loop);
        return f32(u - this.moff);
    }

    // the velocity of the lane's things dtAhead seconds from now (px/s)
    velAt(dtAhead = 0) { return this.shuttle != null ? shuttleVel(this.shuttle, f32(this.offset + dtAhead)) : this.speed; }

    advance(dt) {
        if (this.shuttle != null) {
            const s = this.shuttle;
            this.offset = f32(f32(this.offset + dt) % s.period);
            this.speed = shuttleVel(s, this.offset);
            this.face = this.offset < f32(s.travel + s.dwell) ? 1 : -1;
            return;
        }
        this.offset = f32(f32(this.offset + f32(this.speed * dt)) % this.loop);
        if (this.offset < 0) this.offset = f32(this.offset + this.loop);
    }
}

// a shuttle's cycle: [0, travel) going right from lo, a dwell at hi, [.., ..) going left, a dwell at lo
function shuttleLeft(s, p) {
    p = f32(p % s.period); if (p < 0) p = f32(p + s.period);
    if (p < s.travel) return f32(s.lo + f32(s.cruise * p));
    p = f32(p - s.travel);
    if (p < s.dwell) return s.hi;
    p = f32(p - s.dwell);
    if (p < s.travel) return f32(s.hi - f32(s.cruise * p));
    return s.lo;
}

function shuttleVel(s, p) {
    p = f32(p % s.period); if (p < 0) p = f32(p + s.period);
    if (p < s.travel) return s.cruise;
    p = f32(p - f32(s.travel + s.dwell));
    if (p >= 0 && p < s.travel) return -s.cruise;
    return 0;
}

function makeShuttle(lo, hi, cruise, dwell) {
    const travel = f32(f32(hi - lo) / cruise);
    return { lo: f32(lo), hi: f32(hi), cruise: f32(cruise), dwell: f32(dwell), travel, period: f32(f32(travel + dwell) * 2) };
}

const Tile = 16, Cols = 13, Rows = 14;
const FW = Cols * Tile;
const SlotCols = Object.freeze([2, 4, 6, 8, 10]);
const DiveUp = f32(4.0), DiveSink = f32(1.0), DiveRise = f32(0.6);
const DiveUpSink = f32(DiveUp + DiveSink);
// the mudjaw's jaws: shut, then the eyes burn (the telegraph), then open (the head bites)
const JawShut = f32(2.6), JawWarn = f32(0.8), JawOpen = f32(0.9);
const JawCycle = f32(f32(JawShut + JawWarn) + JawOpen);
const BeastLen = 80, BeastHead = 20;

export class Weaver {
    constructor() {
        this.rows = [0, 0];
        this.len = 24; this.speed = 0; this.loop = 0; this.moff = 24; this.offset = 0;
        this.cruise = f32(2.6); this.signal = f32(0.9); this.shift = f32(0.4); this.period = 0; this.phase0 = 0;
        this.variant = 0;
    }

    get dir() { return this.speed >= 0 ? 1 : -1; }

    left(dtAhead = 0) {
        let u = f32(f32(this.offset + f32(this.speed * dtAhead)) % this.loop);
        if (u < 0) u = f32(u + this.loop);
        return f32(u - this.moff);
    }

    advance(dt) {
        this.offset = f32(f32(this.offset + f32(this.speed * dt)) % this.loop);
        if (this.offset < 0) this.offset = f32(this.offset + this.loop);
    }

    // where it is in its beat at world time T: { row, other (-1 unless shifting), signal, frac (0..1 through a shift) }
    beat(T, out) {
        const q = f32(T + this.phase0);
        const k = Math.floor(q / this.period);
        const p = f32(q - f32(k * this.period));
        out.row = this.rows[k & 1];
        out.other = -1; out.signal = false; out.frac = 0;
        if (p >= this.cruise && p < f32(this.cruise + this.signal)) out.signal = true;
        else if (p >= f32(this.cruise + this.signal)) {
            out.other = this.rows[(k + 1) & 1];
            out.frac = Math.min(1, f32(f32(p - f32(this.cruise + this.signal)) / this.shift));
        }
        return out;
    }

    // does it cover `row` at world time T
    covers(row, T) {
        const b = this.beat(T, _beat);
        return b.row === row || b.other === row;
    }
}
const _beat = { row: 0, other: -1, signal: false, frac: 0 };

const M64 = (1n << 64n) - 1n;

export const LaneField = Object.freeze({
    Tile, Cols, Rows,
    FieldW: FW, FieldH: Rows * Tile,                // 208 x 224
    HomeRow: 0, MedianRow: 6, KerbRow: 13, StartCol: 6,
    SlotCols,
    Slots: 5,
    DiveUp, DiveSink, DiveRise,
    JawShut, JawWarn, JawOpen, BeastLen, BeastHead,

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
    isVehicle(k) { return k <= ThingKind.Bus || k === ThingKind.Moto || k === ThingKind.Train; },

    vehicleLen(k) {
        switch (k) {
            case ThingKind.Car: return 24;
            case ThingKind.Van: return 28;
            case ThingKind.Sports: return 24;
            case ThingKind.Truck: return 46;
            case ThingKind.Bus: return 54;
            case ThingKind.Moto: return 16;
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

    // the mudjaw's jaws at worldTime: 0 shut, 1 the eyes burn (opening soon), 2 open (the head bites)
    jawState(th, worldTime) {
        let p = f32(f32(worldTime + th.divePhase) % JawCycle);
        if (p < 0) p = f32(p + JawCycle);
        if (p < JawShut) return 0;
        if (p < f32(JawShut + JawWarn)) return 1;
        return 2;
    },

    // is field x on the mudjaw's head (the leading BeastHead px) given its left end and heading
    onHead(left, len, dir, x) {
        return dir > 0 ? x >= f32(f32(left + len) - BeastHead) : x <= f32(left + BeastHead);
    },

    // the lanes for one stage. kn: { roadSpeed, riverSpeed, laneGap (+tiles), safeGap (tiles), waterGap (x), dive (share) }
    build(stage, rng, kn) {
        const lanes = new Array(Rows).fill(null);
        for (const sp of stage.lanes) {
            const lane = new Lane();
            lane.row = sp.row; lane.makes = sp.kind; lane.kind = LaneField.kindOf(sp.row);
            if (sp.kind === ThingKind.Train) { LaneField._train(lane, sp, stage.train, rng); lanes[sp.row] = lane; continue; }
            const river = lane.kind === RowKind.River;
            lane.speed = f32(f32(sp.dir * sp.speed) * (river ? kn.riverSpeed : kn.roadSpeed));
            const turtles = sp.kind === ThingKind.Turtles;
            const maxLen = river ? (turtles ? sp.size * Tile : Math.max(sp.size, sp.beast ? BeastLen : 0)) : LaneField.vehicleLen(sp.kind);
            const minLoop = f32(Cols * Tile + maxLen + Tile);
            const water = f32(sp.water !== undefined ? f32(sp.water * kn.waterGap) : 2);
            let pos = 0;
            let n = 0;
            while (pos < minLoop || n < 2) {
                const th = new LaneThing();
                th.kind = sp.kind; th.u = pos; th.variant = rng.next(4);
                if (turtles) {
                    th.count = sp.size; th.len = sp.size * Tile;
                    th.dives = rng.nextDouble() < kn.dive;
                    th.divePhase = f32(f32(rng.nextDouble()) * 20);
                }
                else if (sp.kind === ThingKind.Log) {
                    if (sp.beast && n === 0) { th.kind = ThingKind.Beast; th.len = BeastLen; th.divePhase = f32(f32(rng.nextDouble()) * JawCycle); }
                    else th.len = sp.size;
                }
                else th.len = LaneField.vehicleLen(sp.kind);
                lane.things.push(th);
                pos = f32(pos + th.len);
                let gapTiles;
                if (river) {
                    const lo = Math.min(1, water);
                    gapTiles = f32(lo + f32(f32(rng.nextDouble()) * Math.max(0, f32(water - lo))));
                }
                else {
                    gapTiles = f32(f32(sp.gap + kn.laneGap) + f32(f32(rng.nextDouble()) * sp.spread));
                    if (n === 0) gapTiles = Math.max(gapTiles, kn.safeGap);     // THE GUARANTEED SAFE GAP
                }
                pos = f32(pos + f32(gapTiles * Tile));
                n++;
            }
            lane.loop = pos;
            lane.moff = maxLen;
            lane.offset = f32(f32(rng.nextDouble()) * lane.loop);
            // a turtle lane always keeps at least one group that never dives
            if (turtles) {
                let any = false;
                for (const th of lane.things) if (!th.dives) any = true;
                if (!any) lane.things[0].dives = false;
            }
            lanes[sp.row] = lane;
        }
        // THE FERRY: the only ride on its row, bank to bank and back
        if (stage.ferry) {
            const f = stage.ferry, lane = new Lane();
            lane.row = f.row; lane.kind = RowKind.River; lane.makes = ThingKind.Ferry;
            const th = new LaneThing(); th.kind = ThingKind.Ferry; th.len = f.len; lane.things.push(th);
            lane.shuttle = makeShuttle(2, FW - 2 - f.len, f32(f.speed * kn.riverSpeed), f.dwell);
            lane.offset = f32(f32(rng.nextDouble()) * lane.shuttle.period);
            lane.moff = f.len; lane.loop = FW;
            lane.advance(0);
            lanes[f.row] = lane;
        }
        // THE SNAKE: up and down the median
        if (stage.snake) {
            const sn = stage.snake, lane = new Lane();
            lane.row = LaneField.MedianRow; lane.kind = RowKind.Median; lane.makes = ThingKind.Snake;
            const th = new LaneThing(); th.kind = ThingKind.Snake; th.len = sn.len; lane.things.push(th);
            lane.shuttle = makeShuttle(4, FW - 4 - sn.len, f32(sn.speed * kn.hazard), 0.5);
            lane.offset = f32(f32(rng.nextDouble()) * lane.shuttle.period);
            lane.moff = sn.len; lane.loop = FW;
            lane.advance(0);
            lanes[LaneField.MedianRow] = lane;
        }
        return lanes;
    },

    // a railway track: one train on a long loop (the gap between trains is in seconds)
    _train(lane, sp, tr, rng) {
        lane.kind = RowKind.Road; lane.rail = true;
        lane.speed = f32(sp.dir * tr.speed);
        const th = new LaneThing(); th.kind = ThingKind.Train; th.len = tr.len; th.variant = rng.next(4);
        lane.things.push(th);
        const every = f32(tr.every + f32(f32(rng.nextDouble()) * tr.spread));
        lane.loop = Math.max(f32(FW + tr.len + Tile), f32(every * tr.speed));
        lane.moff = tr.len;
        lane.offset = f32(f32(rng.nextDouble()) * lane.loop);
    },

    // seconds until a track's train noses onto the screen (0 while any of it is on screen)
    trainEta(lane) {
        const th = lane.things[0], l = lane.left(th), v = lane.speed;
        if (l < FW && f32(l + th.len) > 0) return 0;
        if (v > 0) return f32(f32(f32(lane.loop - lane.moff) - l) / v);
        return f32(f32(l - FW) / -v);
    },

    weaver(stage, rng, kn) {
        const w = new Weaver(), sp = stage.weaver;
        w.rows = [sp.rows[0], sp.rows[1]];
        let dir = 1;
        for (const l of stage.lanes) if (l.row === sp.rows[0]) dir = l.dir;
        w.speed = f32(f32(dir * sp.speed) * kn.roadSpeed);
        w.loop = f32(FW + w.len + f32(FW * 1.4));
        w.offset = f32(f32(rng.nextDouble()) * w.loop);
        w.cruise = f32(sp.cruise / Math.max(f32(0.5), kn.hazard));
        w.period = f32(f32(w.cruise + w.signal) + w.shift);
        w.phase0 = f32(f32(rng.nextDouble()) * f32(w.period * 2));
        w.variant = rng.next(4);
        return w;
    },
});
