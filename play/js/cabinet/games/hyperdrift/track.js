// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE ROAD + THE SCROLL HELPER.
// Port of HyperDriftTrack.cs (Staging/Batch3/hyperdrift), 1:1, floats as C# floats (f32 everywhere).
//
// One stage, in ROM: a 1983 board had one road, so the course is FIXED (the player learns it); only
// the traffic and the oil are dealt per round. The road is a centre line cx(s) over s, the distance
// driven up the screen, sampled once per pixel row of world. Everything a row needs is a table lookup:
// centre x, slope dx/ds, the widening factor f = sqrt(1 + slope^2), arc length (dash and kerb rhythm),
// the fork's second branch, the road-works cone line and the flags (bridge deck, river, works).
//
// HAIRPINS. The camera only scrolls up, so a hairpin is a Z: the road runs almost sideways for ~90 px
// of s and moves ~160 px across. Normal grip can't cover that; a drift can.
//
// HyperDriftScroll maps world to screen: the car sits at a fixed row (CarY) and the world scrolls down
// past it. Screen x IS world x (the road winds across a fixed-width screen, as in the art).
import { f32, roundEven, SystemRandom } from '../../sdk/index.js';

export const ZoneKind = Object.freeze({ Hairpin: 0, Works: 1, Bridge: 2, Fork: 3, OilPatch: 4 });
export const PropKind = Object.freeze({ Bush: 0, Scrub: 1, Rock: 2, SignLeft: 3, SignRight: 4, SignWorks: 5, Barrier: 6, Cone: 7 });

const FLT_MAX = 3.4028234663852886e38;

export class Zone {
    constructor(kind, s0, s1, dir = 0, index = 0) {
        this.kind = kind;
        this.s0 = s0; this.s1 = s1;        // world s range (ints)
        this.dir = dir;                    // hairpins: -1 the road jumps left, +1 right
        this.index = index;                // per kind, 0-based
    }
    contains(s) { return s >= this.s0 && s <= this.s1; }
}

export const HyperDriftScroll = Object.freeze({
    PX0: 8, PX1: 312,                      // the playfield, inside the 8 px safe area
    PY0: 34, PY1: 232,
    CarY: 196,                             // the car's fixed screen row (its centre)
    MetresPerPx: f32(0.4),                 // for the HUD: 10,300 px = 4.1 km
    KmhPerPxS: f32(1.44),                  // 175 px/s = 252 km/h
    screenY(s, camS) { return 196 - roundEven(f32(s - camS)); },
    worldS(screenY, camS) { return f32(camS + (196 - screenY)); },
    topS(camS) { return f32(camS + (196 - 34)); },                // the furthest row you can see
    bottomS(camS) { return f32(camS + (196 - 231)); },
});

const HalfWidth = 34;                      // perpendicular half width of the asphalt: two 34 px lanes
const LaneOffset = 17;                     // lane centre from the road centre (perpendicular)
const Kerb = 3;
const StartS = 36;                         // the start line
const Checkpoint = 9820;                   // the checkpoint line: reach it before the clock
const Extent = Checkpoint + 520;           // rows beyond it (the roll-out)
const FlagBridge = 1, FlagRiver = 2, FlagWorks = 4, FlagFork = 8;

// ------------------------------------------------------------------ the course
// (s, centre x) nodes, eased with a half-cosine between each pair
const Nodes = [
    0, 160, 520, 160,
    880, 118, 1260, 202, 1640, 112, 2020, 196,              // the S-curves (oil lies here)
    2200, 196, 2800, 196,                                   // ROAD WORKS A 2240-2760 (right lane shut)
    2960, 236, 3050, 76, 3200, 76,                          // HAIRPIN 1 (jumps left)
    3520, 150, 3820, 96, 4020, 132,
    4080, 132, 4460, 132,                                   // THE BRIDGE 4120-4420
    4760, 200, 5020, 150,
    5140, 104, 6100, 104,                                   // THE FORK 5160-6040 (branch to the right)
    6320, 168, 6440, 238, 6530, 80, 6640, 74,               // HAIRPIN 2 (left)
    6730, 236, 6860, 244,                                   // HAIRPIN 3 (right): the double Z
    7200, 150, 7520, 212, 7860, 118, 8200, 184,             // the long sweepers (truck country)
    8380, 184, 8900, 184,                                   // ROAD WORKS B 8420-8880
    9040, 226, 9130, 70, 9260, 72,                          // HAIRPIN 4 (left)
    9620, 160, Extent + 400, 160,                           // the run to the checkpoint
];

// hairpins: the node pair of each steep piece, and its direction
const HairpinPieces = [2960, 3050, 6440, 6530, 6640, 6730, 9040, 9130];
const WorksZones = [2240, 2760, 8420, 8880];
const BridgeS0 = 4120, BridgeS1 = 4420;
const ForkS0 = 5160, ForkS1 = 6040;
// the fork's second branch: (s, offset right of the main road) nodes
const ForkNodes = [ForkS0, 0, 5400, 132, 5560, 132, 5700, 150, 5840, 132, ForkS1, 0];
const OilZones = [1000, 2000, 3300, 3900, 4600, 5100, 6900, 8200, 9380, 9660];

function ease(nodes, into, before, zeroOutside) {
    const n = nodes.length >> 1;
    for (let i = 0; i < into.length; i++) {
        if (i <= nodes[0]) { into[i] = zeroOutside ? before : nodes[1]; continue; }
        if (i >= nodes[(n - 1) * 2]) { into[i] = zeroOutside ? before : nodes[(n - 1) * 2 + 1]; continue; }
        let k = 0;
        while (k < n - 1 && nodes[(k + 1) * 2] < i) k++;
        const s0 = nodes[k * 2], x0 = nodes[k * 2 + 1], s1 = nodes[(k + 1) * 2], x1 = nodes[(k + 1) * 2 + 1];
        const u = f32(f32(i - s0) / Math.max(1, f32(s1 - s0)));
        into[i] = f32(x0 + f32(f32(f32(x1 - x0) * f32(1 - f32(Math.cos(Math.PI * u)))) * 0.5));
    }
}

function derive(c, sl, ff) {
    const n = c.length;
    for (let i = 0; i < n; i++) {
        const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)];
        sl[i] = f32(f32(b - a) / ((i === 0 || i === n - 1) ? 1 : 2));
        ff[i] = f32(Math.sqrt(1.0 + f32(sl[i] * sl[i])));
    }
}

// .NET's List<T>.Sort (introspective, NOT stable), so props with equal S keep the C# order
export function dotnetSort(keys, cmp) {
    const n = keys.length;
    if (n > 1) introSort(keys, 0, n, 2 * ((31 - Math.clz32(n)) + 1), cmp);      // BitOperations.Log2
    return keys;
}
function swap(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }
function swapIfGreater(a, cmp, i, j) { if (cmp(a[i], a[j]) > 0) swap(a, i, j); }
function introSort(a, lo, len, depth, cmp) {
    let size = len;
    while (size > 1) {
        if (size <= 16) {
            if (size === 2) { swapIfGreater(a, cmp, lo, lo + 1); return; }
            if (size === 3) { swapIfGreater(a, cmp, lo, lo + 1); swapIfGreater(a, cmp, lo, lo + 2); swapIfGreater(a, cmp, lo + 1, lo + 2); return; }
            for (let i = 0; i < size - 1; i++) {                    // insertion sort
                const t = a[lo + i + 1];
                let j = i;
                while (j >= 0 && cmp(t, a[lo + j]) < 0) { a[lo + j + 1] = a[lo + j]; j--; }
                a[lo + j + 1] = t;
            }
            return;
        }
        if (depth === 0) { heapSort(a, lo, size, cmp); return; }
        depth--;
        const p = pickPivotAndPartition(a, lo, size, cmp);
        introSort(a, lo + p + 1, size - (p + 1), depth, cmp);
        size = p;
    }
}
function pickPivotAndPartition(a, lo, size, cmp) {
    const hi = size - 1, middle = hi >> 1;
    swapIfGreater(a, cmp, lo, lo + middle);
    swapIfGreater(a, cmp, lo, lo + hi);
    swapIfGreater(a, cmp, lo + middle, lo + hi);
    const pivot = a[lo + middle];
    swap(a, lo + middle, lo + hi - 1);
    let left = 0, right = hi - 1;
    while (left < right) {
        while (cmp(a[lo + (++left)], pivot) < 0);
        while (cmp(pivot, a[lo + (--right)]) < 0);
        if (left >= right) break;
        swap(a, lo + left, lo + right);
    }
    if (left !== hi - 1) swap(a, lo + left, lo + hi - 1);
    return left;
}
function heapSort(a, lo, n, cmp) {
    for (let i = n >> 1; i >= 1; i--) downHeap(a, lo, i, n, cmp);
    for (let i = n; i > 1; i--) { swap(a, lo, lo + i - 1); downHeap(a, lo, 1, i - 1, cmp); }
}
function downHeap(a, lo, i, n, cmp) {
    const d = a[lo + i - 1];
    while (i <= (n >> 1)) {
        let child = 2 * i;
        if (child < n && cmp(a[lo + child - 1], a[lo + child]) < 0) child++;
        if (!(cmp(d, a[lo + child - 1]) < 0)) break;
        a[lo + i - 1] = a[lo + child - 1];
        i = child;
    }
    a[lo + i - 1] = d;
}
function cmpS(p, q) { return p.s < q.s ? -1 : p.s > q.s ? 1 : 0; }     // float.CompareTo

export class HyperDriftTrack {
    constructor() {
        this._cx = new Float32Array(Extent); this._slope = new Float32Array(Extent);
        this._f = new Float32Array(Extent); this._arc = new Float32Array(Extent);
        this._cx2 = new Float32Array(Extent); this._slope2 = new Float32Array(Extent); this._f2 = new Float32Array(Extent);
        this._cone = new Float32Array(Extent);
        this._flags = new Uint8Array(Extent);

        this.zones = [];
        this.hairpins = [];
        this.works = [];
        this.oilPatches = [];
        this.bridge = null;
        this.fork = null;
        this.props = [];                                   // sorted by s

        const cx = this._cx, flags = this._flags;
        // centre line
        ease(Nodes, cx, 0, false);
        derive(cx, this._slope, this._f);
        this._arc[0] = 0;
        for (let i = 1; i < Extent; i++) this._arc[i] = f32(this._arc[i - 1] + this._f[i]);

        // the fork's branch
        const cx2 = this._cx2;
        cx2.fill(NaN);
        const off = new Float32Array(Extent);
        ease(ForkNodes, off, 0, true);
        for (let i = ForkS0; i <= ForkS1 && i < Extent; i++) { cx2[i] = f32(cx[i] + off[i]); flags[i] |= FlagFork; }
        this._slope2.fill(0); this._f2.fill(1);
        for (let i = ForkS0 + 1; i < ForkS1 && i < Extent - 1; i++) {
            this._slope2[i] = f32(f32(cx2[i + 1] - cx2[i - 1]) * 0.5);
            this._f2[i] = f32(Math.sqrt(1.0 + f32(this._slope2[i] * this._slope2[i])));
        }
        this.fork = new Zone(ZoneKind.Fork, ForkS0, ForkS1);
        this.zones.push(this.fork);

        // road works: the cone line's perpendicular offset from the centre (NaN = no cones)
        this._cone.fill(NaN);
        for (let w = 0; w < WorksZones.length; w += 2) {
            const a = WorksZones[w], b = WorksZones[w + 1];
            const taper = 90;
            const open = f32(HalfWidth + 2), shut = 3;
            for (let i = a; i <= b; i++) {
                let u;
                if (i < a + taper) u = f32((i - a) / taper);
                else if (i > b - taper) u = f32((b - i) / taper);
                else u = 1;
                const e = f32(f32(1 - f32(Math.cos(Math.PI * u))) * 0.5);
                this._cone[i] = f32(open + f32(f32(shut - open) * e));
                flags[i] |= FlagWorks;
            }
            const z = new Zone(ZoneKind.Works, a, b, 0, this.works.length);
            this.works.push(z); this.zones.push(z);
        }

        // the bridge and its river
        for (let i = BridgeS0 - 10; i <= BridgeS1 + 10; i++) flags[i] |= FlagRiver;
        for (let i = BridgeS0; i <= BridgeS1; i++) flags[i] |= FlagBridge;
        this.bridge = new Zone(ZoneKind.Bridge, BridgeS0, BridgeS1);
        this.zones.push(this.bridge);

        // hairpins (the scoring window runs a little either side of the steep piece)
        for (let h = 0; h < HairpinPieces.length; h += 2) {
            const a = HairpinPieces[h], b = HairpinPieces[h + 1];
            const dir = cx[b] < cx[a] ? -1 : 1;
            const z = new Zone(ZoneKind.Hairpin, a - 30, b + 24, dir, this.hairpins.length);
            this.hairpins.push(z); this.zones.push(z);
        }
        for (let o = 0; o < OilZones.length; o += 2) {
            const z = new Zone(ZoneKind.OilPatch, OilZones[o], OilZones[o + 1], 0, this.oilPatches.length);
            this.oilPatches.push(z); this.zones.push(z);
        }

        this._buildProps();
    }

    // ------------------------------------------------------------------ lookups (any s; clamped)
    static _i(s) { const i = Math.floor(s); return i < 0 ? 0 : i >= Extent ? Extent - 1 : i; }

    cx(s) {
        if (s <= 0) return this._cx[0];
        const i = Math.floor(s);
        if (i >= Extent - 1) return this._cx[Extent - 1];
        const u = f32(s - i);
        const c = this._cx;
        return f32(c[i] + f32(f32(c[i + 1] - c[i]) * u));
    }
    slope(s) { return this._slope[HyperDriftTrack._i(s)]; }
    f(s) { return this._f[HyperDriftTrack._i(s)]; }
    arc(s) { return this._arc[HyperDriftTrack._i(s)]; }
    hasFork(s) { return !Number.isNaN(this._cx2[HyperDriftTrack._i(s)]); }
    cx2(s) {
        const i = HyperDriftTrack._i(s), c = this._cx2;
        if (Number.isNaN(c[i])) return NaN;
        if (i + 1 < Extent && !Number.isNaN(c[i + 1])) { const u = f32(s - f32(Math.floor(s))); return f32(c[i] + f32(f32(c[i + 1] - c[i]) * u)); }
        return c[i];
    }
    slope2(s) { return this._slope2[HyperDriftTrack._i(s)]; }
    f2(s) { return this._f2[HyperDriftTrack._i(s)]; }
    coneOff(s) { return this._cone[HyperDriftTrack._i(s)]; }         // NaN = no cones here
    isBridge(s) { return (this._flags[HyperDriftTrack._i(s)] & FlagBridge) !== 0; }
    isRiver(s) { return (this._flags[HyperDriftTrack._i(s)] & FlagRiver) !== 0; }
    isWorks(s) { return (this._flags[HyperDriftTrack._i(s)] & FlagWorks) !== 0; }

    // a lane centre: lane -1 = the far (oncoming) lane, +1 = yours. branch 2 = the fork's right branch.
    laneX(s, lane, branch = 1) {
        if (branch === 2 && this.hasFork(s)) return f32(this.cx2(s) + f32((lane * LaneOffset) * this.f2(s)));
        return f32(this.cx(s) + f32((lane * LaneOffset) * this.f(s)));
    }
    centreX(s, branch) { return branch === 2 && this.hasFork(s) ? this.cx2(s) : this.cx(s); }
    slopeOf(s, branch) { return branch === 2 && this.hasFork(s) ? this.slope2(s) : this.slope(s); }
    fOf(s, branch) { return branch === 2 && this.hasFork(s) ? this.f2(s) : this.f(s); }

    zoneAt(k, s) {
        for (const z of this.zones) if (z.kind === k && z.contains(s)) return z;
        return null;
    }

    // the next zone of a kind that starts after s (or contains it)
    nextZone(k, s) {
        let best = null;
        for (const z of this.zones)
            if (z.kind === k && z.s1 >= s && (best === null || z.s0 < best.s0)) best = z;
        return best;
    }

    // the horizontal extent of all road (both branches, kerbs included) over [s0, s1] -> { left, right }
    roadSpan(s0, s1) {
        let left = FLT_MAX, right = -FLT_MAX;
        for (let s = s0; s <= s1; s = f32(s + 1)) {
            const c = this.cx(s), h = f32((HalfWidth + Kerb) * this.f(s));
            left = Math.min(left, f32(c - h)); right = Math.max(right, f32(c + h));
            if (this.hasFork(s)) {
                const c2 = this.cx2(s), h2 = f32((HalfWidth + Kerb) * this.f2(s));
                left = Math.min(left, f32(c2 - h2)); right = Math.max(right, f32(c2 + h2));
            }
        }
        return { left, right };
    }

    // ------------------------------------------------------------------ scenery (fixed, like the road)
    _buildProps() {
        const rng = new SystemRandom(1983);
        const list = [];
        const HK = HalfWidth + Kerb;

        // roadside signs: a chevron 150 px before each hairpin, on the side the road jumps to
        for (const h of this.hairpins) {
            const s = f32(h.s0 - 130);
            const c = this.cx(s), hw = f32(HK * this.f(s));
            const x = h.dir < 0 ? f32(f32(c - hw) - 12) : f32(f32(c + hw) + 12);
            list.push({ kind: h.dir < 0 ? PropKind.SignLeft : PropKind.SignRight, x, s });
        }
        // road works: a warning sign, a barrier across the shut lane, cones along the line
        for (const w of this.works) {
            const s = f32(w.s0 - 120);
            list.push({ kind: PropKind.SignWorks, x: f32(f32(this.cx(s) + f32(HK * this.f(s))) + 12), s });
            const sb = f32(w.s0 + 70);
            list.push({ kind: PropKind.Barrier, x: f32(f32(this.cx(sb) + f32(f32(f32(this.coneOff(sb) + HalfWidth) * 0.5) * this.f(sb))) + 1), s: sb });
            for (let sc = f32(w.s0 + 6); sc <= f32(w.s1 - 4); sc = f32(sc + 14))
                list.push({ kind: PropKind.Cone, x: f32(this.cx(sc) + f32(this.coneOff(sc) * this.f(sc))), s: sc });
        }
        // the desert: bushes, scrub and rocks off the road, never on it, never in the river
        let y = -80;
        while (y < Extent) {
            y = f32(y + f32(14 + f32(f32(rng.nextDouble()) * 22)));
            if (this.isRiver(f32(y - 8)) || this.isRiver(f32(y + 8))) continue;
            const roll = rng.nextDouble();
            const kind = roll < 0.45 ? PropKind.Bush : roll < 0.75 ? PropKind.Scrub : PropKind.Rock;
            const halfW = kind === PropKind.Rock ? 5 : kind === PropKind.Bush ? 7 : 5;
            const { left, right } = this.roadSpan(f32(y - 9), f32(y + 9));
            // candidate strips: left verge, right verge, the fork's island
            const strips = [];
            strips.push({ a: HyperDriftScroll.PX0 + halfW + 2, b: f32(f32(left - halfW) - 6) });
            strips.push({ a: f32(f32(right + halfW) + 6), b: HyperDriftScroll.PX1 - halfW - 3 });
            if (this.hasFork(f32(y - 9)) && this.hasFork(f32(y + 9))) {
                let mainR = -FLT_MAX, branchL = FLT_MAX;
                for (let s = f32(y - 9); s <= f32(y + 9); s = f32(s + 1)) {
                    mainR = Math.max(mainR, f32(this.cx(s) + f32(HK * this.f(s))));
                    branchL = Math.min(branchL, f32(this.cx2(s) - f32(HK * this.f2(s))));
                }
                strips.push({ a: f32(f32(mainR + halfW) + 6), b: f32(f32(branchL - halfW) - 6) });
            }
            const ok = strips.filter(t => f32(t.b - t.a) > 2);
            if (ok.length === 0) continue;
            const pick = ok[rng.next(ok.length)];
            const x = f32(pick.a + f32(f32(rng.nextDouble()) * f32(pick.b - pick.a)));
            list.push({ kind, x: f32(roundEven(x)), s: f32(roundEven(y)) });
        }
        dotnetSort(list, cmpS);
        this.props.push(...list);
    }

    // the first prop at or after s (binary search on the sorted list)
    firstPropAt(s) {
        let lo = 0, hi = this.props.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (this.props[m].s < s) lo = m + 1; else hi = m; }
        return lo;
    }
}

HyperDriftTrack.HalfWidth = HalfWidth;
HyperDriftTrack.LaneOffset = LaneOffset;
HyperDriftTrack.Kerb = Kerb;
HyperDriftTrack.StartS = StartS;
HyperDriftTrack.Checkpoint = Checkpoint;
HyperDriftTrack.Extent = Extent;
HyperDriftTrack.FlagBridge = FlagBridge; HyperDriftTrack.FlagRiver = FlagRiver;
HyperDriftTrack.FlagWorks = FlagWorks; HyperDriftTrack.FlagFork = FlagFork;

// the one course, in ROM
HyperDriftTrack.Course = new HyperDriftTrack();
