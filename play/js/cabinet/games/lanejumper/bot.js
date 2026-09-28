// THE NODE · world 1 · LANE JUMPER on the Cabinet Engine · THE BOT: a modelled average player.
// Port of LaneJumperBot.cs (Staging/Batch2/lanejumper), f32 throughout.
//
// It plays through the control panel only (one TAP per hop, A for hurry), reads the sim, never
// writes it, and rolls its own dice (this.rng). The brief's two rules are the spine:
//   1. ADVANCE A LANE ONLY ONCE THE NEAREST HAZARD'S ETA CLEARS HOP TIME PLUS MARGIN: into a road
//      lane, no vehicle may reach its column before hop + margin; into the river, something
//      rideable must be under it when it lands (and not about to dive, if it noticed).
//   2. PREFER THE SLOT STRAIGHT AHEAD: it sidesteps on the kerb and median toward the nearest
//      empty slot, only boards the top river row upstream of an empty slot, and hops home when it
//      is lined up with one.
// What makes it average: it looks every 0.10-0.28 s (it misses windows), reads a vehicle's place
// up to judgeErr seconds early or late, picks a margin each look, gets impatient (the margin shrinks the
// longer it waits in one place, and now and then it just goes), notices a car bearing down on
// the lane it is standing in 88% of the time and a turtle group starting to sink 70% of the time,
// and lines up on a slot a few pixels loose.
import { f32, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { LaneField, RowKind, ThingKind } from './field.js';
import { LaneJumperRound } from './round.js';

const Phase = LaneJumperRound.Phase;
const FW = LaneField.FieldW, Tile = LaneField.Tile;
const FloatMax = 3.4028234663852886e38;

export class LaneJumperBot extends CabinetBotBase {
    constructor() {
        super();
        this.reactMin = f32(0.10); this.reactMax = f32(0.28);
        this.marginMin = f32(0.10); this.marginMax = f32(0.50);
        this.judgeErr = f32(0.12);              // seconds: how far off its read of a vehicle is
        this.notice = f32(0.88);
        this.diveNotice = f32(0.70);
        this.impatience = f32(0.10);
        this.gamble = f32(0.015);
        this.hurryUse = f32(0.5);
        this.slotSlop = f32(3);
        this.linger = f32(0.8);
        this.edgeMin = f32(-1.0); this.edgeMax = f32(4);     // px inside a log's end it insists on (below 0 = it misjudged the end)

        this._thinkLeft = 0; this._waitTime = 0;
        this._waitRow = -99; this._courier = -1;
        this.intent = '';
    }

    get name() { return 'lj-average-player'; }

    reset(seed) {
        super.reset(seed === 0 ? 0 : LaneField.mixSeed(seed));      // decorrelate the bench's strided seeds
        this._thinkLeft = 0; this._waitTime = 0; this._waitRow = -99; this._courier = -1; this.intent = '';
    }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.lanes === undefined || r.p !== Phase.Crossing) { this._waitRow = -99; this._waitTime = 0; return InputFrame.neutral; }
        if (r.courierNumber !== this._courier) {
            this._courier = r.courierNumber; this._waitRow = -99; this._waitTime = 0;
            this._thinkLeft = this.range(this.reactMin, this.reactMax);
        }
        if (r.hopping) return InputFrame.neutral;
        if (r.row === this._waitRow) this._waitTime = f32(this._waitTime + dt); else { this._waitRow = r.row; this._waitTime = 0; }
        this._thinkLeft = f32(this._thinkLeft - dt);
        if (this._thinkLeft > 0) return InputFrame.neutral;
        this._thinkLeft = this.range(this.reactMin, this.reactMax);

        const out = { hurry: false };
        const d = this._decide(r, out);
        if (d < 0) return InputFrame.neutral;
        const f = this.tap(d);
        if (out.hurry && d === Dir4.Up && !this.lastFrame.a) f.a = true;
        return f;
    }

    // ------------------------------------------------------------------ the decision
    _decide(r, out) {
        out.hurry = false;
        const row = r.row;
        const x = r.x;
        const kind = LaneField.kindOf(row);
        const land = kind === RowKind.Kerb || kind === RowKind.Median;
        if (land && r.hurryReady && this.chance(this.hurryUse * 0.3)) out.hurry = true;     // float * double: a double, as in C#
        const H = out.hurry ? f32(r.hopTime * 0.5) : r.currentHopTime;
        const margin = Math.max(f32(0.03), f32(this.range(this.marginMin, this.marginMax) - f32(this.impatience * this._waitTime)));
        const err = this.range(-this.judgeErr, this.judgeErr);
        const inv = r.invulnerable;
        if (inv && this._waitTime > 3) { this.intent = 'free ride: just go'; return this._freeRide(r, x, row); }

        // ---- 1. trouble where it stands
        if (kind === RowKind.Road && this.chance(this.notice)) {
            const eta = hitEta(r, row, x, err, f32(3));
            if (eta < f32(f32(H + this.reactMax) + f32(0.1))) {
                this.intent = 'escape traffic';
                const lane = r.lanes[row];
                if (canEnter(r, row - 1, x, H, f32(0.1), err)) return Dir4.Up;
                // ride the gap: a hop downstream keeps ahead of the car behind
                const sx = f32(x + lane.dir * Tile);
                if (sx >= 8 && sx <= FW - 8 && roadClear(r, row, x, err, 0, f32(H * 0.5)) && roadClear(r, row, sx, err, f32(H * 0.5), f32(H + f32(0.3))))
                    return lane.dir > 0 ? Dir4.Right : Dir4.Left;
                if (canEnter(r, row + 1, x, H, f32(0.1), err)) return Dir4.Down;
            }
        }
        if (kind === RowKind.River) {
            const lane = r.lanes[row];
            const v = lane.speed;
            const toEdge = v > 0 ? f32(f32((FW - 4) - x) / v) : f32(f32(x - 4) / -v);
            const under = r.thingUnder(row, x);
            const sinking = under != null && under.kind === ThingKind.Turtles &&
                LaneField.timeToUnder(under, r.worldTime, r.diveUnder) < f32(0.9) && this.chance(this.diveNotice);
            const home = row === 1 && anySlotDownstream(r, x, lane.dir);
            if (sinking || (toEdge < f32(0.9) && !home) || toEdge < f32(0.35)) {
                this.intent = sinking ? 'turtles sinking' : 'swept toward the edge';
                if (row === 1 && this._alignedSlot(r, x) >= 0) return Dir4.Up;
                if (row > 1 && this._riverLanding(r, row, row - 1, x, x, H, f32(2), err)) return Dir4.Up;
                const back = -lane.dir > 0 ? Dir4.Right : Dir4.Left;
                const sx = f32(x - lane.dir * Tile);
                if (this._riverLanding(r, row, row, x, sx, H, f32(2), err)) return back;
                if (row + 1 === LaneField.MedianRow || this._riverLanding(r, row, row + 1, x, x, H, f32(2), err)) return Dir4.Down;
            }
        }

        // ---- 2. advance
        const dest = row - 1;
        const dk = LaneField.kindOf(dest);
        if (dk === RowKind.Home) {
            const s = this._alignedSlot(r, x);
            if (s >= 0) { this.intent = 'slot ' + s; return Dir4.Up; }
            this.intent = 'riding to a slot';
            // no empty slot downstream: step back against the current if the log carries on
            const lane = r.lanes[row];
            if (!anySlotDownstream(r, x, lane.dir)) {
                const back = -lane.dir > 0 ? Dir4.Right : Dir4.Left;
                if (this._riverLanding(r, row, row, x, f32(x - lane.dir * Tile), H, f32(2), err)) return back;
                if (this._riverLanding(r, row, row + 1, x, x, H, f32(2), err)) return Dir4.Down;
            }
            return -1;
        }
        if (dk === RowKind.Road) {
            const here = kind !== RowKind.Road || roadClear(r, row, x, err, 0, f32(f32(H * 0.5) + f32(0.02)));
            const gamble = this._waitTime > 2 && this.chance(this.gamble);
            // look one lane further: only step in if it can linger there, or the lane after will let it through
            let open = here && roadClear(r, dest, x, err, f32(f32(H * 0.5) - f32(0.04)), f32(H + margin));
            if (open && !roadClear(r, dest, x, err, f32(H + margin), f32(f32(H + margin) + this.linger))) {
                const next = dest - 1;
                const go = f32(H + this.reactMax);
                open = LaneField.kindOf(next) !== RowKind.Road ||
                    roadClear(r, next, x, err, f32(f32(go + f32(H * 0.5)) - f32(0.04)), f32(f32(go + H) + margin));
            }
            if (open || gamble) {
                this.intent = gamble ? 'gamble' : 'lane clear';
                return Dir4.Up;
            }
            this.intent = 'waiting on traffic';
            if (land) return this._sidestep(r, x);
            return -1;
        }
        if (dk === RowKind.Median) { this.intent = 'to the median'; return Dir4.Up; }
        if (dk === RowKind.River) {
            const here = kind !== RowKind.Road || roadClear(r, row, x, err, 0, f32(f32(H * 0.5) + f32(0.02)));
            const edge = this.range(this.edgeMin, this.edgeMax);
            if (here && this._riverLanding(r, row, dest, x, x, H, edge, err)) {
                if (dest === 1) {
                    const xl = landX(r, row, dest, x, x, H);
                    if (!anySlotDownstream(r, xl, r.lanes[1].dir)) { this.intent = 'waiting to board upstream of a slot'; return -1; }
                }
                this.intent = 'board';
                return Dir4.Up;
            }
            this.intent = 'waiting for a log';
            if (land) return this._sidestep(r, x);
            return -1;
        }
        return -1;
    }

    // prefer the slot straight ahead: on the kerb or the median, drift over to line up with it
    _sidestep(r, x) {
        const s = nearestEmptySlot(r, x);
        if (s < 0) return -1;
        const dx = f32(LaneField.slotX(s) - x);
        if (Math.abs(dx) < 12 || !this.chance(0.35)) return -1;
        const nx = f32(x + Math.sign(dx) * Tile);
        if (nx < 8 || nx > FW - 8) return -1;
        this.intent = 'line up with slot ' + s;
        return dx > 0 ? Dir4.Right : Dir4.Left;
    }

    _freeRide(r, x, row) {
        if (row === 1) {
            if (this._alignedSlot(r, x) >= 0) return Dir4.Up;
            const s = nearestEmptySlot(r, x);
            if (s < 0) return -1;
            const dx = f32(LaneField.slotX(s) - x);
            return dx > 0 ? Dir4.Right : Dir4.Left;
        }
        return Dir4.Up;
    }

    _alignedSlot(r, x) {
        const tol = Math.max(1, f32(r.slotTol - this.range(0, this.slotSlop)));
        for (let i = 0; i < LaneField.Slots; i++)
            if (!r.filled[i] && Math.abs(f32(LaneField.slotX(i) - x)) <= tol) return i;
        return -1;
    }

    // will a hop into river row `toRow` land on something rideable (edge px inside its ends),
    // that is not about to sink (if it notices), with time to ride before the bank
    _riverLanding(r, fromRow, toRow, x, tx, H, edge, err) {
        if (toRow < 1 || toRow > 5) return false;
        const lane = r.lanes[toRow];
        const xl = landX(r, fromRow, toRow, x, tx, H);
        if (xl < 6 || xl > FW - 6) return false;
        const ride = lane.speed > 0 ? f32(f32((FW - 4) - xl) / lane.speed) : f32(f32(xl - 4) / -lane.speed);
        if (ride < f32(0.5) && !(toRow === 1 && anySlotDownstream(r, xl, lane.dir))) return false;
        for (const th of lane.things) {
            const l = f32(lane.left(th, H) + f32(err * lane.speed));
            if (xl < f32(f32(l + 1) + edge) || xl > f32(f32(f32(l + th.len) - 1) - edge)) continue;
            if (th.kind === ThingKind.Turtles) {
                if (LaneField.turtleState(th, f32(r.worldTime + H), r.diveUnder) === 2) continue;
                if (LaneField.timeToUnder(th, f32(r.worldTime + H), r.diveUnder) < f32(1.2) && this.chance(this.diveNotice)) continue;
            }
            return true;
        }
        return false;
    }
}

// ------------------------------------------------------------------ reading the road
function nearestEmptySlot(r, x) {
    let best = -1, bd = FloatMax;
    for (let i = 0; i < LaneField.Slots; i++) {
        if (r.filled[i]) continue;
        const d = Math.abs(f32(LaneField.slotX(i) - x));
        if (d < bd) { bd = d; best = i; }
    }
    return best;
}

// is there an empty slot the current will still carry it to (at or downstream of x)?
function anySlotDownstream(r, x, dir) {
    for (let i = 0; i < LaneField.Slots; i++) {
        if (r.filled[i]) continue;
        const ahead = f32(f32(LaneField.slotX(i) - x) * dir);
        if (ahead >= -f32(r.slotTol - 3)) return true;
    }
    return false;
}

// the time from now until any vehicle in `row` first overlaps the courier's box at x
function hitEta(r, row, x, err, horizon) {
    const lane = r.laneAt(row);
    if (lane == null || lane.kind !== RowKind.Road) return Infinity;
    let best = Infinity;
    const iv = { a: 0, b: 0 };
    for (const th of lane.things) {
        const l0 = f32(lane.left(th) + f32(err * lane.speed));
        for (let k = -1; k <= 1; k++) {
            interval(lane.speed, f32(l0 + f32(k * lane.loop)), th.len, x, iv);
            if (iv.b <= 0 || iv.a >= horizon) continue;
            best = Math.min(best, Math.max(0, iv.a));
        }
    }
    return best;
}

// no vehicle in `row` overlaps the courier's box at x at any time in [t0, t1]
function roadClear(r, row, x, err, t0, t1) {
    const lane = r.laneAt(row);
    if (lane == null || lane.kind !== RowKind.Road) return true;
    const iv = { a: 0, b: 0 };
    for (const th of lane.things) {
        const l0 = f32(lane.left(th) + f32(err * lane.speed));
        for (let k = -1; k <= 1; k++) {
            interval(lane.speed, f32(l0 + f32(k * lane.loop)), th.len, x, iv);
            if (iv.b > t0 && iv.a < t1) return false;
        }
    }
    return true;
}

const HW = f32(LaneJumperRound.HalfW + 1.5);     // C# folds HalfW + 1.5f: 6.5
const VEps = f32(1e-4);

// the open interval of time (a, b) during which a vehicle whose left end is at l0 overlaps x
function interval(v, l0, len, x, out) {
    const lo = f32(f32(f32(x - HW) - len) + 1), hi = f32(f32(x + HW) - 1);     // the left end must be in (lo, hi)
    if (Math.abs(v) < VEps) {
        const inside = l0 > lo && l0 < hi;
        out.a = inside ? -Infinity : Infinity; out.b = inside ? Infinity : -Infinity;
        return;
    }
    const ta = f32(f32(lo - l0) / v), tb = f32(f32(hi - l0) / v);
    out.a = Math.min(ta, tb); out.b = Math.max(ta, tb);
}

// may it step into `row` (a road lane or land) right now
function canEnter(r, row, x, H, margin, err) {
    if (row < 1 || row > LaneField.KerbRow) return false;
    const k = LaneField.kindOf(row);
    if (k === RowKind.Kerb || k === RowKind.Median) return true;
    if (k === RowKind.Road) return roadClear(r, row, x, err, f32(f32(H * 0.5) - f32(0.03)), f32(H + margin));
    return false;
}

// where the courier's centre will be when a hop from (fromRow, x) to (toRow, tx) lands
function landX(r, fromRow, toRow, x, tx, H) {
    let d = 0;
    if (LaneField.kindOf(fromRow) === RowKind.River) d = f32(d + f32(f32(r.lanes[fromRow].speed * H) * 0.5));
    if (LaneField.kindOf(toRow) === RowKind.River) d = f32(d + f32(f32(r.lanes[toRow].speed * H) * 0.5));
    return f32(tx + d);
}
