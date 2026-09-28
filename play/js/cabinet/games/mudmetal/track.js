// THE NODE · world 1 · MUD & METAL (Redline Coin-Op, 1984) · THE TRACK. Port of MudMetalTrack.cs.
//
// One fixed lap, the same every round: ramps, gaps, tabletops, whoops, mud and the riders who
// wait on it. Everything a rider touches is a height profile along the track.
//
// TRACK SPACE (x'): the ramps run slanted across the four lanes, the way the 1984 board drew
// them. A feature at x' sits at world x = x' - lane * Skew, so a lower (nearer) lane meets every
// ramp, mud patch and the finish line Skew px earlier. Height(x, laneF) folds that in, and it is
// continuous in laneF, so a lane change on a ramp face is smooth.
//
// The profile is baked into a 1 px heightmap (piecewise linear, integer vertices), so a lookup
// is two array reads. Slope = dh/dx of the segment under the wheel.
import { f32 } from '../../sdk/index.js';

export const FeatureKind = Object.freeze({ Hump: 0, Ramp: 1, Kicker: 2, Gap: 3, Table: 4, BigAir: 5, Whoops: 6, Double: 7 });

export const Lanes = 4;
export const Skew = 8;             // px per lane
const Pad = 512;                    // heightmap index of x' = 0
export const Wake = 330;            // a rival starts riding when the player is this far behind its spawn

class TrackBuilder {
    constructor(length) {
        this.length = length;
        this.features = [];
        this.mud = [];
        this.rivals = [];
        this.hm = new Float64Array(Math.trunc(length) + Pad * 2);
        this.sm = new Float64Array(this.hm.length);
    }

    heightAt(xp) {
        const f = xp + Pad;
        const i = Math.floor(f);
        if (i < 0 || i >= this.hm.length - 1) return 0;
        return f32(this.hm[i] + f32((this.hm[i + 1] - this.hm[i]) * (f - i)));
    }

    slopeAt(xp) {
        const i = Math.floor(xp + Pad);
        if (i < 0 || i >= this.sm.length) return 0;
        return this.sm[i];
    }

    height(x, laneF) { return this.heightAt(f32(x + laneF * Skew)); }
    slope(x, laneF) { return this.slopeAt(f32(x + laneF * Skew)); }

    inMud(x, lane) {
        const xp = f32(x + lane * Skew);
        for (const m of this.mud) if (m.lane === lane && xp >= m.x0 && xp <= m.x1) return true;
        return false;
    }

    // the first mud patch in this lane that starts within [x, x + ahead] (track space from world x), or -1
    mudAhead(x, lane, ahead) {
        const xp = f32(x + lane * Skew);
        for (let i = 0; i < this.mud.length; i++) {
            const m = this.mud[i];
            if (m.lane === lane && m.x1 >= xp && m.x0 <= xp + ahead) return i;
        }
        return -1;
    }

    featureAt(xp) {
        for (const f of this.features) if (xp >= f.x0 && xp < f.x0 + f.len) return f;
        return null;
    }

    // ------------------------------------------------------------ building
    _add(kind, x0, jump, pts) {
        let top = 0, len = 0;
        for (let i = 0; i < pts.length; i += 2) { top = Math.max(top, pts[i + 1]); len = Math.max(len, pts[i]); }
        this.features.push({ kind, x0, len, top, pts, jump });
        for (let i = 0; i + 3 < pts.length; i += 2) {
            const xa = Math.trunc(x0 + pts[i]), xb = Math.trunc(x0 + pts[i + 2]);
            const ha = pts[i + 1], hb = pts[i + 3];
            for (let x = xa; x <= xb; x++) {
                const k = x + Pad;
                if (k < 0 || k >= this.hm.length) continue;
                this.hm[k] = xb === xa ? hb : f32(ha + f32(f32(hb - ha) * ((x - xa) / (xb - xa))));
            }
        }
    }

    _bake() {
        for (let i = 0; i < this.hm.length - 1; i++) this.sm[i] = f32(this.hm[i + 1] - this.hm[i]);
        this.sm[this.hm.length - 1] = 0;
    }

    _mudhole(lane, x0, x1) { this.mud.push({ lane, x0, x1 }); }
    _rider(x, lane, mul, weaver = false) { this.rivals.push({ x, lane, speedMul: mul, weaver }); }

    // shapes (dx, h). Up-faces 0.75 (37 deg) unless named; a lip at the top of an up-face launches you.
    _hump(x) { this._add(FeatureKind.Hump, x, false, [0, 0, 16, 7, 32, 0]); }
    _whoops(x, n) {
        const p = [0, 0];
        for (let i = 0; i < n; i++) { p.push(i * 28 + 14, 8, i * 28 + 28, 0); }
        this._add(FeatureKind.Whoops, x, false, p);
    }
    _ramp(x) { this._add(FeatureKind.Ramp, x, true, [0, 0, 32, 24, 48, 24, 96, 0]); }
    _kicker(x) { this._add(FeatureKind.Kicker, x, true, [0, 0, 36, 27, 58, 0]); }
    _gap(x, gap) { this._add(FeatureKind.Gap, x, true, [0, 0, 36, 27, 54, 0, 54 + gap, 0, 72 + gap, 27, 126 + gap, 0]); }
    _table(x, top) { this._add(FeatureKind.Table, x, true, [0, 0, 32, 24, 32 + top, 24, 80 + top, 0]); }
    _bigAir(x) { this._add(FeatureKind.BigAir, x, true, [0, 0, 44, 33, 72, 0]); }
    _double(x) { this._add(FeatureKind.Double, x, true, [0, 0, 30, 22, 54, 0, 84, 22, 132, 0]); }
}

function buildStandard() {
    const t = new TrackBuilder(7450);
    // riders at the gate beside you (lanes 0 and 3) -- the first two passes
    t._rider(0, 0, 0.74);
    t._rider(0, 3, 0.70);

    t._whoops(560, 2);
    t._ramp(860);
    t._mudhole(1, 1150, 1310); t._mudhole(2, 1190, 1330);
    t._rider(1250, 1, 0.66);
    t._gap(1560, 84);
    t._table(2020, 150);
    t._rider(2250, 2, 0.68, true);
    t._mudhole(0, 2420, 2580); t._mudhole(3, 2480, 2640);
    t._whoops(2780, 4);
    t._bigAir(3150);
    t._rider(3200, 0, 0.64); t._rider(3260, 3, 0.70);
    t._ramp(3450);
    t._mudhole(1, 3660, 3840); t._mudhole(2, 3700, 3860);
    t._double(3980);
    t._gap(4420, 92);
    t._rider(4650, 1, 0.66, true);
    t._kicker(4720);
    t._mudhole(3, 4870, 5030); t._mudhole(2, 4940, 5080);
    t._table(5230, 170);
    t._whoops(5660, 3);
    t._kicker(5960);
    t._rider(6050, 2, 0.68); t._rider(6110, 0, 0.66, true);
    t._gap(6420, 96);
    t._mudhole(0, 6830, 6990); t._mudhole(1, 6870, 7020);
    t._ramp(7080);
    t._hump(7300);
    t._bake();
    return t;
}

export const MudMetalTrack = buildStandard();
