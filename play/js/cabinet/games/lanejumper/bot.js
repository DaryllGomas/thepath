// THE NODE · world 1 · LANE JUMPER on the Cabinet Engine · THE BOT: a modelled average player.
// Grown from the port of LaneJumperBot.cs (Staging/Batch2/lanejumper); f32 throughout.
//
// It plays through the control panel only (one TAP per hop, A for hurry), reads the sim, never
// writes it, and rolls its own dice (this.rng). The two rules are the spine:
//   1. ADVANCE A ROW ONLY ONCE THE NEAREST HAZARD'S ETA CLEARS HOP TIME PLUS MARGIN: into a road
//      lane or a track, no vehicle (nor the weaver, nor a train) may reach its column before hop + margin;
//      onto the median, the snake and the dog must be far enough off; into the river, something rideable
//      must be under it when it lands (not about to dive, if it noticed; not the mudjaw's head when the
//      jaws are about to open).
//   2. PREFER THE SLOT STRAIGHT AHEAD: it sidesteps on the kerb and median toward the nearest
//      empty slot, only boards the top river row upstream of an empty slot, and hops home when it
//      is lined up with one whose flap is open.
// What makes it average: it looks every 0.10-0.28 s (it misses windows), reads a vehicle's place
// up to judgeErr seconds early or late, picks a margin each look, gets impatient (the margin shrinks the
// longer it waits in one place, and now and then it just goes), notices a car bearing down on
// the lane it is standing in 88% of the time, a turtle group starting to sink 70% of the time and the
// mudjaw's burning eyes 75% of the time, and lines up on a slot a few pixels loose. It ignores the parcel
// unless it happens to land on it. Lines that read the sim through a sampled time (the weaver, the snake,
// the ferry) step 1/30 s; the dog it reads as a worst case (how soon it could reach a column).
import { f32, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { LaneField, RowKind, ThingKind } from './field.js';
import { LaneJumperRound } from './round.js';

const Phase = LaneJumperRound.Phase;
const FW = LaneField.FieldW, Tile = LaneField.Tile;
const FloatMax = 3.4028234663852886e38;
const Median = LaneField.MedianRow;

export class LaneJumperBot extends CabinetBotBase {
    constructor() {
        super();
        this.reactMin = f32(0.10); this.reactMax = f32(0.28);
        this.marginMin = f32(0.18); this.marginMax = f32(0.55);
        this.judgeErr = f32(0.05);              // seconds: how far off its read of a vehicle is
        this.notice = f32(0.96);
        this.diveNotice = f32(0.88);
        this.jawNotice = f32(0.9);
        this.impatience = f32(0.03);
        this.gamble = f32(0.004);
        this.hurryUse = f32(0.5);
        this.slotSlop = f32(3);
        this.linger = f32(0.8);
        this.edgeMin = f32(1.5); this.edgeMax = f32(5);     // px inside a log's end it insists on (below 0 = it misjudged the end)
        this.freeRideWait = f32(1.0);           // credit 5: seconds of waiting before it just goes

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
        if (land && r.hurryReady && this.chance(this.hurryUse * 0.3)) out.hurry = true;
        const H = out.hurry ? f32(r.hopTime * 0.5) : r.currentHopTime;
        const margin = Math.max(f32(0.03), f32(this.range(this.marginMin, this.marginMax) - f32(this.impatience * this._waitTime)));
        const err = this.range(-this.judgeErr, this.judgeErr);
        const inv = r.invulnerable;
        if (inv && this._waitTime > this.freeRideWait) { this.intent = 'free ride: just go'; return this._freeRide(r, x, row); }

        // ---- 1. trouble where it stands
        if ((kind === RowKind.Road || kind === RowKind.Median) && this.chance(this.notice)) {
            const eta = hitEta(r, row, x, err, f32(3));
            if (eta < f32(f32(H + this.reactMax) + f32(0.1))) {
                this.intent = kind === RowKind.Median ? 'escape the median' : 'escape traffic';
                if (row - 1 >= 1 && LaneField.kindOf(row - 1) === RowKind.River) { if (this._riverLanding(r, row, row - 1, x, x, H, f32(1), err)) return Dir4.Up; }
                else if (canEnter(r, row - 1, x, H, f32(0.1), err)) return Dir4.Up;
                // ride the gap: a hop downstream keeps ahead of the car behind (on the median: away from the biter)
                const away = kind === RowKind.Median ? biterSide(r, x) : r.lanes[row].dir;
                for (const side of [away, -away]) {
                    const sx = f32(x + side * Tile);
                    if (sx >= 8 && sx <= FW - 8 && roadClear(r, row, x, err, 0, f32(H * 0.5)) && roadClear(r, row, sx, err, f32(H * 0.5), f32(H + f32(0.3))))
                        return side > 0 ? Dir4.Right : Dir4.Left;
                }
                if (canEnter(r, row + 1, x, H, f32(0.1), err)) return Dir4.Down;
            }
        }
        if (kind === RowKind.River) {
            const lane = r.lanes[row];
            const v = lane.speed;
            const toEdge = lane.shuttle != null ? FloatMax : v > 0 ? f32(f32((FW - 4) - x) / v) : v < 0 ? f32(f32(x - 4) / -v) : FloatMax;
            const under = r.thingUnder(row, x);
            const sinking = under != null && under.kind === ThingKind.Turtles &&
                LaneField.timeToUnder(under, r.worldTime, r.diveUnder) < f32(0.9) && this.chance(this.diveNotice);
            const jaws = under != null && under.kind === ThingKind.Beast && jawSoon(r, lane, under, x, f32(H + f32(0.4))) && this.chance(this.jawNotice);
            const home = row === 1 && anySlotDownstream(r, x, lane.dir);
            if (sinking || jaws || (toEdge < f32(0.9) && !home) || toEdge < f32(0.35)) {
                this.intent = sinking ? 'turtles sinking' : jaws ? 'the jaws!' : 'swept toward the edge';
                if (row === 1 && this._alignedSlot(r, x, H) >= 0) return Dir4.Up;
                if (jaws) {
                    // off the head, back along the body
                    const back = -lane.dir;
                    const sx = f32(x + back * Tile);
                    if (this._riverLanding(r, row, row, x, sx, H, f32(1), err)) return back > 0 ? Dir4.Right : Dir4.Left;
                }
                if (row > 1 && this._riverLanding(r, row, row - 1, x, x, H, f32(2), err)) return Dir4.Up;
                const back = -lane.dir > 0 ? Dir4.Right : Dir4.Left;
                const sx = f32(x - lane.dir * Tile);
                if (this._riverLanding(r, row, row, x, sx, H, f32(2), err)) return back;
                if (row + 1 === Median ? medianClear(r, x, err, f32(H * 0.5), f32(H + f32(0.5))) : this._riverLanding(r, row, row + 1, x, x, H, f32(2), err)) return Dir4.Down;
            }
        }

        // ---- 2. advance
        const dest = row - 1;
        const dk = LaneField.kindOf(dest);
        if (dk === RowKind.Home) {
            const s = this._alignedSlot(r, x, H);
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
                open = LaneField.kindOf(next) !== RowKind.Road ? next !== Median || medianClear(r, x, err, f32(go + f32(H * 0.5)), f32(f32(go + H) + margin + 0.6)) :
                    roadClear(r, next, x, err, f32(f32(go + f32(H * 0.5)) - f32(0.04)), f32(f32(go + H) + margin));
            }
            if (open || gamble) {
                this.intent = gamble ? 'gamble' : 'lane clear';
                return Dir4.Up;
            }
            this.intent = 'waiting on traffic';
            if (land) return this._sidestep(r, x, err, H);
            return -1;
        }
        if (dk === RowKind.Median) {
            const here = roadClear(r, row, x, err, 0, f32(f32(H * 0.5) + f32(0.02)));
            if (here && medianClear(r, x, err, f32(f32(H * 0.5) - f32(0.04)), f32(f32(H + margin) + 0.6))) { this.intent = 'to the median'; return Dir4.Up; }
            this.intent = 'waiting on the median';
            return -1;
        }
        if (dk === RowKind.River) {
            const here = kind !== RowKind.Road && kind !== RowKind.Median ? true : roadClear(r, row, x, err, 0, f32(f32(H * 0.5) + f32(0.02)));
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
            if (land) return this._sidestep(r, x, err, H);
            return -1;
        }
        return -1;
    }

    // prefer the slot straight ahead: on the kerb or the median, drift over to line up with it
    _sidestep(r, x, err, H) {
        const s = nearestEmptySlot(r, x);
        if (s < 0) return -1;
        const dx = f32(LaneField.slotX(s) - x);
        if (Math.abs(dx) < 12 || !this.chance(0.35)) return -1;
        const nx = f32(x + Math.sign(dx) * Tile);
        if (nx < 8 || nx > FW - 8) return -1;
        if (r.row === Median && !medianClear(r, nx, err, 0, f32(H + f32(0.6)))) return -1;
        this.intent = 'line up with slot ' + s;
        return dx > 0 ? Dir4.Right : Dir4.Left;
    }

    _freeRide(r, x, row) {
        if (row === 1) {
            if (this._alignedSlot(r, x, r.hopTime) >= 0) return Dir4.Up;
            const s = nearestEmptySlot(r, x);
            if (s < 0) return -1;
            const dx = f32(LaneField.slotX(s) - x);
            if (Math.abs(dx) <= r.slotTol) return -1;              // lined up with a shut flap: wait for it
            return dx > 0 ? Dir4.Right : Dir4.Left;
        }
        return Dir4.Up;
    }

    // a slot it is lined up with, empty, its flap open and staying open through the hop
    _alignedSlot(r, x, H) {
        const tol = Math.max(1, f32(r.slotTol - this.range(0, this.slotSlop)));
        for (let i = 0; i < LaneField.Slots; i++) {
            if (!r.slotOpen(i) || Math.abs(f32(LaneField.slotX(i) - x)) > tol) continue;
            const f = r.flaps[i];
            if (f.s === 1 && f.t < f32(H + f32(0.15))) continue;
            return i;
        }
        return -1;
    }

    // will a hop into river row `toRow` land on something rideable (edge px inside its ends),
    // that is not about to sink (if it notices), nor the mudjaw's head about to bite, with time to ride
    // before the bank
    _riverLanding(r, fromRow, toRow, x, tx, H, edge, err) {
        if (toRow < 1 || toRow > 5) return false;
        const lane = r.lanes[toRow];
        const xl = landX(r, fromRow, toRow, x, tx, H);
        if (xl < 6 || xl > FW - 6) return false;
        const v = lane.velAt(H);
        const ride = lane.shuttle != null ? FloatMax : v > 0 ? f32(f32((FW - 4) - xl) / v) : v < 0 ? f32(f32(xl - 4) / -v) : FloatMax;
        if (ride < f32(0.5) && !(toRow === 1 && anySlotDownstream(r, xl, lane.dir))) return false;
        for (const th of lane.things) {
            const l = lane.shuttle != null ? lane.left(th, f32(H + err)) : f32(lane.left(th, H) + f32(err * lane.speed));
            if (xl < f32(f32(l + 1) + edge) || xl > f32(f32(f32(l + th.len) - 1) - edge)) continue;
            if (th.kind === ThingKind.Turtles) {
                if (LaneField.turtleState(th, f32(r.worldTime + H), r.diveUnder) === 2) continue;
                if (LaneField.timeToUnder(th, f32(r.worldTime + H), r.diveUnder) < f32(1.2) && this.chance(this.diveNotice)) continue;
            }
            else if (th.kind === ThingKind.Beast && LaneField.onHead(l, th.len, lane.dir, xl)) {
                if (LaneField.jawState(th, f32(r.worldTime + H)) === 2) continue;
                if (jawSoonAt(th, f32(r.worldTime + H), f32(1.0)) && this.chance(this.jawNotice)) continue;
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

const SampleDt = f32(1 / 30);

// the time from now until anything in `row` first overlaps the courier's box at x
function hitEta(r, row, x, err, horizon) {
    let best = Infinity;
    const lane = r.laneAt(row);
    if (lane != null && lane.kind === RowKind.Road) {
        const iv = { a: 0, b: 0 };
        for (const th of lane.things) {
            const l0 = f32(lane.left(th) + f32(err * lane.speed));
            for (let k = -1; k <= 1; k++) {
                interval(lane.speed, f32(l0 + f32(k * lane.loop)), th.len, x, iv);
                if (iv.b <= 0 || iv.a >= horizon) continue;
                best = Math.min(best, Math.max(0, iv.a));
            }
        }
    }
    if (onWeaverRow(r, row)) for (let t = 0; t < Math.min(best, horizon); t = f32(t + SampleDt)) if (weaverHit(r, row, x, err, t)) { best = t; break; }
    if (row === Median) {
        best = Math.min(best, dogEta(r, x));
        const sn = r.lanes[Median];
        if (sn != null) for (let t = 0; t < Math.min(best, horizon); t = f32(t + SampleDt)) if (snakeHit(sn, x, err, t)) { best = t; break; }
    }
    return best;
}

// nothing in `row` overlaps the courier's box at x at any time in [t0, t1]
function roadClear(r, row, x, err, t0, t1) {
    const lane = r.laneAt(row);
    if (lane != null && lane.kind === RowKind.Road) {
        const iv = { a: 0, b: 0 };
        for (const th of lane.things) {
            const l0 = f32(lane.left(th) + f32(err * lane.speed));
            for (let k = -1; k <= 1; k++) {
                interval(lane.speed, f32(l0 + f32(k * lane.loop)), th.len, x, iv);
                if (iv.b > t0 && iv.a < t1) return false;
            }
        }
    }
    if (onWeaverRow(r, row)) {
        for (let t = t0; t < t1; t = f32(t + SampleDt)) if (weaverHit(r, row, x, err, t)) return false;
        if (weaverHit(r, row, x, err, t1)) return false;
    }
    if (row === Median) return medianClear(r, x, err, t0, t1);
    return true;
}

// the median at x is clear of the snake through [t0, t1], and the dog cannot get there before t1 (plus a breath)
function medianClear(r, x, err, t0, t1) {
    if (dogEta(r, x) < f32(t1 + 0.35)) return false;
    const sn = r.lanes[Median];
    if (sn == null) return true;
    for (let t = Math.max(0, t0); t < t1; t = f32(t + SampleDt)) if (snakeHit(sn, x, err, t)) return false;
    return !snakeHit(sn, x, err, t1);
}

function onWeaverRow(r, row) { const w = r.weaver; return w != null && (w.rows[0] === row || w.rows[1] === row); }

function weaverHit(r, row, x, err, t) {
    const w = r.weaver, T = f32(f32(r.worldTime + t) + err);
    if (!w.covers(row, T)) return false;
    const l = w.left(f32(t + err));
    return f32(x + HW) > f32(l + 1) && f32(x - HW) < f32(f32(l + w.len) - 1);
}

function snakeHit(sn, x, err, t) {
    const th = sn.things[0], l = sn.left(th, f32(t + err));
    return f32(x + HW) > f32(l + SnakeIn) && f32(x - HW) < f32(f32(l + th.len) - SnakeIn);
}

// the soonest the dog could have its teeth on column x (a worst case: it wakes at once and runs straight)
function dogEta(r, x) {
    const g = r.dog;
    if (g == null) return Infinity;
    const d = f32(Math.abs(f32(g.x - x)) - f32(DogHalf + HW));
    if (d <= 0) return 0;
    const wake = g.mode === 2 ? 0 : g.mode === 1 ? Math.max(0, f32(f32(0.5) - g.t)) : f32(0.5);
    return f32(wake + f32(d / g.chase));
}

// which way is away from the snake or the dog on the median (+1 right, -1 left)
function biterSide(r, x) {
    const g = r.dog;
    if (g != null) return x >= g.x ? 1 : -1;
    const sn = r.lanes[Median];
    if (sn == null) return 1;
    const th = sn.things[0], c = f32(sn.left(th) + f32(th.len * 0.5));
    return x >= c ? 1 : -1;
}

// will the mudjaw's jaws be open (or burning) under x at some moment in the next `within` seconds
function jawSoon(r, lane, th, x, within) {
    if (!LaneField.onHead(lane.left(th), th.len, lane.dir, x)) return false;
    return jawSoonAt(th, r.worldTime, within);
}

function jawSoonAt(th, T, within) {
    for (let t = 0; t <= within; t = f32(t + f32(0.1))) if (LaneField.jawState(th, f32(T + t)) !== 0) return true;
    return false;
}

const HW = f32(LaneJumperRound.HalfW + 1.5);     // C# folds HalfW + 1.5f: 6.5
const DogHalf = LaneJumperRound.DogHalf, SnakeIn = LaneJumperRound.SnakeIn;
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
    if (k === RowKind.Kerb) return true;
    if (k === RowKind.Median) return medianClear(r, x, err, f32(f32(H * 0.5) - f32(0.03)), f32(f32(H + margin) + 0.3));
    if (k === RowKind.Road) return roadClear(r, row, x, err, f32(f32(H * 0.5) - f32(0.03)), f32(H + margin));
    return false;
}

// where the courier's centre will be when a hop from (fromRow, x) to (toRow, tx) lands
function landX(r, fromRow, toRow, x, tx, H) {
    let d = 0;
    if (LaneField.kindOf(fromRow) === RowKind.River) d = f32(d + f32(f32(r.lanes[fromRow].speed * H) * 0.5));
    if (LaneField.kindOf(toRow) === RowKind.River) d = f32(d + f32(f32(r.lanes[toRow].velAt(H) * H) * 0.5));
    return f32(tx + d);
}
