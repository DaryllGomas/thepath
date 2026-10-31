// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE ROAD + THE SCROLL HELPER.
// Started as a port of HyperDriftTrack.cs (Staging/Batch3/hyperdrift); one road became five (legs.js).
//
// Five legs, in ROM: a 1983 board had its roads in ROM, so every course is FIXED (the player learns it);
// only the traffic and the hazards are dealt per game. A road is a centre line cx(s) over s, the distance
// driven up the screen, sampled once per pixel row of world. Everything a row needs is a table lookup:
// centre x, slope dx/ds, the widening factor f = sqrt(1 + slope^2), arc length (dash and kerb rhythm),
// the fork's second branch, the road-works cone line, the flags (bridge deck, water, works, tunnel, the
// canyon's ramps and gaps), the lamps' pools of light (the city), the shore (the coast), the canyon walls,
// and the speed the road allows (the rival drives by it).
//
// HAIRPINS. The camera only scrolls up, so a hairpin is a Z: the road runs almost sideways for ~90 px
// of s and moves ~160 px across. Normal grip can't cover that; a drift can.
//
// HyperDriftScroll maps world to screen: the car sits at a fixed row (CarY) and the world scrolls down
// past it. Screen x IS world x (the road winds across a fixed-width screen, as in the art).
import { f32, roundEven, SystemRandom } from '../../sdk/index.js';
import { LEGS, Terrain, GapLength, RampLength } from './legs.js';

export const ZoneKind = Object.freeze({ Hairpin: 0, Works: 1, Bridge: 2, Fork: 3, Slick: 4, Tunnel: 5, Rocks: 6, Taxis: 7, Gap: 8 });
export const PropKind = Object.freeze({
    Bush: 0, Scrub: 1, Rock: 2, SignLeft: 3, SignRight: 4, SignWorks: 5, Barrier: 6, Cone: 7,
    Lamp: 8, Palm: 9, Pine: 10, PineSmall: 11, Cactus: 12, Boulder: 13, SignJump: 14, SignRocks: 15, Tuft: 16, SnowRock: 17,
});

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
    MetresPerPx: f32(0.4),                 // for the HUD: 8,300 px = 3.3 km
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
const FlagBridge = 1, FlagRiver = 2, FlagWorks = 4, FlagFork = 8, FlagTunnel = 16, FlagGap = 32, FlagRamp = 64;
const LampR = 26;                          // a city lamp's pool of light (px)

// the road's speed limit for the rival (and the bot's sense of it): normal grip below tanNormal, the
// drift above it, braking at `Brake` px/s^2 before each bend
const Vmax = 175, GripNormal = 110, GripDrift = 150, TanNormal = f32(0.9), Brake = 230;

function ease(nodes, into, before, zeroOutside) {
    const n = nodes.length >> 1;
    let k = 0;
    for (let i = 0; i < into.length; i++) {
        if (i <= nodes[0]) { into[i] = zeroOutside ? before : nodes[1]; continue; }
        if (i >= nodes[(n - 1) * 2]) { into[i] = zeroOutside ? before : nodes[(n - 1) * 2 + 1]; continue; }
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

function cmpS(p, q) { return p.s < q.s ? -1 : p.s > q.s ? 1 : p.kind - q.kind; }

export class HyperDriftTrack {
    constructor(def, index) {
        this.def = def;
        this.index = index;
        this.terrain = def.terrain;
        this.checkpoint = def.checkpoint;
        this.extend = def.extend;
        this.dash = def.dash;
        const Extent = this.extent = def.checkpoint + 520;            // rows beyond the line (the roll-out)
        this._cx = new Float32Array(Extent); this._slope = new Float32Array(Extent);
        this._f = new Float32Array(Extent); this._arc = new Float32Array(Extent);
        this._cx2 = new Float32Array(Extent); this._slope2 = new Float32Array(Extent); this._f2 = new Float32Array(Extent);
        this._cone = new Float32Array(Extent);
        this._flags = new Uint8Array(Extent);
        this._vlim = new Float32Array(Extent);

        this.zones = [];
        this.hairpins = [];
        this.works = [];
        this.bridges = [];
        this.tunnels = [];
        this.slickZones = [];
        this.rockZones = [];
        this.taxiZones = [];
        this.gaps = [];                                   // { lip, s0 (ramp foot), s1 (far edge) }
        this.pads = [];                                   // { s, lane, x }
        this.fork = null;
        this.props = [];                                  // sorted by s

        const cx = this._cx, flags = this._flags;
        // centre line
        ease(def.nodes, cx, 0, false);
        derive(cx, this._slope, this._f);
        this._arc[0] = 0;
        for (let i = 1; i < Extent; i++) this._arc[i] = f32(this._arc[i - 1] + this._f[i]);

        // the fork's branch (the desert only)
        const cx2 = this._cx2;
        cx2.fill(NaN);
        this._slope2.fill(0); this._f2.fill(1);
        if (def.fork) {
            const F = def.fork;
            const off = new Float32Array(Extent);
            ease(F.nodes, off, 0, true);
            for (let i = F.s0; i <= F.s1 && i < Extent; i++) { cx2[i] = f32(cx[i] + off[i]); flags[i] |= FlagFork; }
            for (let i = F.s0 + 1; i < F.s1 && i < Extent - 1; i++) {
                this._slope2[i] = f32(f32(cx2[i + 1] - cx2[i - 1]) * 0.5);
                this._f2[i] = f32(Math.sqrt(1.0 + f32(this._slope2[i] * this._slope2[i])));
            }
            this.fork = new Zone(ZoneKind.Fork, F.s0, F.s1);
            this.zones.push(this.fork);
        }

        // road works: the cone line's perpendicular offset from the centre (NaN = no cones)
        this._cone.fill(NaN);
        for (let w = 0; w < def.works.length; w += 2) {
            const a = def.works[w], b = def.works[w + 1];
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

        // the bridges and their water
        for (let w = 0; w < def.bridges.length; w += 2) {
            const a = def.bridges[w], b = def.bridges[w + 1];
            for (let i = a - 10; i <= b + 10; i++) flags[i] |= FlagRiver;
            for (let i = a; i <= b; i++) flags[i] |= FlagBridge;
            const z = new Zone(ZoneKind.Bridge, a, b, 0, this.bridges.length);
            this.bridges.push(z); this.zones.push(z);
        }
        this.bridge = this.bridges.length > 0 ? this.bridges[0] : null;

        // the tunnels (walls both sides, no shoulder)
        for (let w = 0; w < def.tunnels.length; w += 2) {
            const a = def.tunnels[w], b = def.tunnels[w + 1];
            for (let i = a; i <= b; i++) flags[i] |= FlagTunnel;
            const z = new Zone(ZoneKind.Tunnel, a, b, 0, this.tunnels.length);
            this.tunnels.push(z); this.zones.push(z);
        }

        // the canyon's crevasses: a ramp up to the lip, then the gap
        for (const lip of def.gaps) {
            for (let i = lip - RampLength; i < lip; i++) flags[i] |= FlagRamp;
            for (let i = lip; i < lip + GapLength; i++) flags[i] |= FlagGap;
            const g = { lip, s0: lip - RampLength, s1: lip + GapLength, index: this.gaps.length };
            this.gaps.push(g);
            this.zones.push(new Zone(ZoneKind.Gap, g.s0, g.s1, 0, g.index));
        }

        // hairpins (the scoring window runs a little either side of the steep piece)
        for (let h = 0; h < def.hairpins.length; h += 2) {
            const a = def.hairpins[h], b = def.hairpins[h + 1];
            const dir = cx[b] < cx[a] ? -1 : 1;
            const z = new Zone(ZoneKind.Hairpin, a - 30, b + 24, dir, this.hairpins.length);
            this.hairpins.push(z); this.zones.push(z);
        }
        const zoneList = (list, kind, into) => {
            for (let o = 0; o < list.length; o += 2) {
                const z = new Zone(kind, list[o], list[o + 1], 0, into.length);
                into.push(z); this.zones.push(z);
            }
        };
        zoneList(def.slicks, ZoneKind.Slick, this.slickZones);
        zoneList(def.rocks, ZoneKind.Rocks, this.rockZones);
        zoneList(def.taxis, ZoneKind.Taxis, this.taxiZones);
        for (const [s, lane] of def.pads) this.pads.push({ s, lane, x: this.laneX(s, lane) });

        // the coast: the shoreline, a beach's width left of the road; the canyon: its walls
        this._shore = null; this._wallL = null; this._wallR = null;
        if (def.terrain === Terrain.Coast) {
            this._shore = new Float32Array(Extent);
            for (let i = 0; i < Extent; i++) {
                const beach = f32(18 + f32(10 * Math.sin(i * 0.0113)) + f32(4 * Math.sin(i * 0.047)));
                this._shore[i] = f32(f32(cx[i] - f32((HalfWidth + Kerb) * this._f[i])) - beach);
            }
        }
        if (def.terrain === Terrain.Canyon) {
            this._wallL = new Float32Array(Extent); this._wallR = new Float32Array(Extent);
            for (let i = 0; i < Extent; i++) {
                const hw = f32((HalfWidth + Kerb) * this._f[i]);
                this._wallL[i] = f32(f32(cx[i] - hw) - f32(34 + f32(16 * Math.sin(i * 0.0071)) + f32(6 * Math.sin(i * 0.043))));
                this._wallR[i] = f32(f32(cx[i] + hw) + f32(34 + f32(16 * Math.sin(i * 0.0063 + 2)) + f32(6 * Math.sin(i * 0.039 + 1))));
            }
        }

        // the city's lamps: posts either side, alternating, each with a pool of light (per-row spans)
        this._lampA = null; this._lampB = null;
        this.lamps = [];
        if (def.terrain === Terrain.City) {
            this._lampA = new Int16Array(Extent * 2); this._lampB = new Int16Array(Extent * 2);
            let side = 1;
            for (let s = 120; s < Extent - 40; s += 150) {
                side = -side;
                if (this.isTunnel(s - LampR) || this.isTunnel(s + LampR) || this.isTunnel(s)) continue;
                const hw = f32((HalfWidth + Kerb) * this.f(s));
                const x = side < 0 ? f32(f32(this.cx(s) - hw) - 7) : f32(f32(this.cx(s) + hw) + 7);
                this.lamps.push({ s, x, side });
                const into = side < 0 ? this._lampA : this._lampB;
                for (let d = -LampR; d <= LampR; d++) {
                    const i = s + d;
                    const c = Math.trunc(Math.sqrt(LampR * LampR - d * d));
                    into[i * 2] = roundEven(x) - c; into[i * 2 + 1] = roundEven(x) + c + 1;
                }
            }
        }

        // the speed the road allows: the grip in the bends, then braking back from each one
        const vl = this._vlim;
        for (let i = 0; i < Extent; i++) {
            const k = Math.abs(this._slope[i]);
            vl[i] = k < 1e-3 ? Vmax : Math.min(Vmax, k <= TanNormal ? GripNormal / k : GripDrift / k);
        }
        for (let i = Extent - 2; i >= 0; i--) vl[i] = Math.min(vl[i], f32(Math.sqrt(vl[i + 1] * vl[i + 1] + 2 * Brake)));

        this._buildProps();
    }

    // ------------------------------------------------------------------ lookups (any s; clamped)
    _i(s) { const i = Math.floor(s); return i < 0 ? 0 : i >= this.extent ? this.extent - 1 : i; }

    cx(s) {
        if (s <= 0) return this._cx[0];
        const i = Math.floor(s);
        if (i >= this.extent - 1) return this._cx[this.extent - 1];
        const u = f32(s - i);
        const c = this._cx;
        return f32(c[i] + f32(f32(c[i + 1] - c[i]) * u));
    }
    slope(s) { return this._slope[this._i(s)]; }
    f(s) { return this._f[this._i(s)]; }
    arc(s) { return this._arc[this._i(s)]; }
    hasFork(s) { return !Number.isNaN(this._cx2[this._i(s)]); }
    cx2(s) {
        const i = this._i(s), c = this._cx2;
        if (Number.isNaN(c[i])) return NaN;
        if (i + 1 < this.extent && !Number.isNaN(c[i + 1])) { const u = f32(s - f32(Math.floor(s))); return f32(c[i] + f32(f32(c[i + 1] - c[i]) * u)); }
        return c[i];
    }
    slope2(s) { return this._slope2[this._i(s)]; }
    f2(s) { return this._f2[this._i(s)]; }
    coneOff(s) { return this._cone[this._i(s)]; }         // NaN = no cones here
    isBridge(s) { return (this._flags[this._i(s)] & FlagBridge) !== 0; }
    isRiver(s) { return (this._flags[this._i(s)] & FlagRiver) !== 0; }
    isWorks(s) { return (this._flags[this._i(s)] & FlagWorks) !== 0; }
    isTunnel(s) { return (this._flags[this._i(s)] & FlagTunnel) !== 0; }
    isGap(s) { return (this._flags[this._i(s)] & FlagGap) !== 0; }
    isRamp(s) { return (this._flags[this._i(s)] & FlagRamp) !== 0; }
    isWalled(s) { return (this._flags[this._i(s)] & (FlagBridge | FlagTunnel)) !== 0; }   // rails or walls: no shoulder
    flagsAt(si) { return this._flags[this._i(si)]; }
    vLimit(s) { return this._vlim[this._i(s)]; }
    shore(s) { return this._shore ? this._shore[this._i(s)] : -FLT_MAX; }
    wallL(s) { return this._wallL ? this._wallL[this._i(s)] : -FLT_MAX; }
    wallR(s) { return this._wallR ? this._wallR[this._i(s)] : FLT_MAX; }
    // a lamp's pool of light on row si: side 0 (left) or 1 (right) -> [x0, x1) in out, false if none
    lampSpan(si, side, out) {
        const t = side === 0 ? this._lampA : this._lampB;
        if (t === null || si < 0 || si >= this.extent) return false;
        const a = t[si * 2], b = t[si * 2 + 1];
        if (a === b) return false;
        out[0] = a; out[1] = b;
        return true;
    }

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

    // the next gap whose lip is ahead of s (or null)
    nextGap(s) {
        for (const g of this.gaps) if (g.s1 > s) return g;
        return null;
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
        const rng = new SystemRandom(1983 + this.index * 31);
        const list = [];
        const HK = HalfWidth + Kerb;
        const T = this.terrain;

        // roadside signs: a chevron 130 px before each hairpin, on the side the road jumps to
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
        // the canyon: a JUMP sign before each ramp, a ROCKS sign at the head of each rockfall
        for (const g of this.gaps) {
            const s = f32(g.s0 - 140);
            list.push({ kind: PropKind.SignJump, x: f32(f32(this.cx(s) + f32(HK * this.f(s))) + 12), s });
        }
        for (const z of this.rockZones) {
            const s = f32(z.s0 - 60);
            list.push({ kind: PropKind.SignRocks, x: f32(f32(this.cx(s) - f32(HK * this.f(s))) - 12), s });
        }
        for (const l of this.lamps) list.push({ kind: PropKind.Lamp, x: l.x, s: l.s });

        // the land: what grows (or lies) off the road, never on it, never in the water, a tunnel or a gap
        const kinds = T === Terrain.Desert ? [[0.45, PropKind.Bush, 7], [0.75, PropKind.Scrub, 5], [1, PropKind.Rock, 5]]
            : T === Terrain.City ? null
            : T === Terrain.Coast ? [[0.4, PropKind.Palm, 8], [0.75, PropKind.Tuft, 4], [1, PropKind.Rock, 5]]
            : T === Terrain.Snow ? [[0.5, PropKind.Pine, 8], [0.85, PropKind.PineSmall, 5], [1, PropKind.SnowRock, 5]]
            : [[0.35, PropKind.Boulder, 7], [0.65, PropKind.Cactus, 4], [1, PropKind.Rock, 5]];
        if (kinds !== null) {
            const gapMin = T === Terrain.Snow ? 12 : 14, gapMax = T === Terrain.Snow ? 16 : 22;
            let y = -80;
            while (y < this.extent) {
                y = f32(y + f32(gapMin + f32(f32(rng.nextDouble()) * gapMax)));
                if (this.isRiver(f32(y - 8)) || this.isRiver(f32(y + 8)) || this.isTunnel(y) || this.isGap(f32(y - 8)) || this.isGap(f32(y + 8))) continue;
                const roll = rng.nextDouble();
                let kind = kinds[kinds.length - 1][1], halfW = kinds[kinds.length - 1][2];
                for (const [p, k, hw] of kinds) if (roll < p) { kind = k; halfW = hw; break; }
                const { left, right } = this.roadSpan(f32(y - 9), f32(y + 9));
                // candidate strips: left verge, right verge, the fork's island (not the sea; not inside the canyon walls)
                let lo = HyperDriftScroll.PX0 + halfW + 2, hi = HyperDriftScroll.PX1 - halfW - 3;
                if (T === Terrain.Coast) lo = Math.max(lo, f32(this.shore(y) + 14));
                const strips = [];
                strips.push({ a: lo, b: f32(f32(left - halfW) - 6) });
                strips.push({ a: f32(f32(right + halfW) + 6), b: hi });
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
        }
        list.sort(cmpS);
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
HyperDriftTrack.LampR = LampR;
HyperDriftTrack.FlagBridge = FlagBridge; HyperDriftTrack.FlagRiver = FlagRiver;
HyperDriftTrack.FlagWorks = FlagWorks; HyperDriftTrack.FlagFork = FlagFork;
HyperDriftTrack.FlagTunnel = FlagTunnel; HyperDriftTrack.FlagGap = FlagGap; HyperDriftTrack.FlagRamp = FlagRamp;

// the five roads, in ROM
HyperDriftTrack.Legs = LEGS.map((def, i) => new HyperDriftTrack(def, i));
