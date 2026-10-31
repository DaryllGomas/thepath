// THE NODE · world 1 · MUD & METAL (Redline Coin-Op, 1984) · THE TRACK. Port of MudMetalTrack.cs,
// grown into a builder the six tracks of the championship are drawn with (stages.js).
//
// A track is a height profile along its length plus what lies on it: mud (per lane), fords (water
// across every lane), creeks (the water in the pit of a gap jump: come up short and you SPLASH),
// hay bales (one lane each), the riders who wait on it, the signs, and a lap line.
//
// TRACK SPACE (x'): the ramps run slanted across the four lanes, the way the 1984 board drew
// them. A feature at x' sits at world x = x' - lane * Skew, so a lower (nearer) lane meets every
// ramp, mud patch and the finish line Skew px earlier. Height(x, laneF) folds that in, and it is
// continuous in laneF, so a lane change on a ramp face is smooth.
//
// The profile is baked into a 1 px heightmap (piecewise linear, integer vertices), so a lookup
// is two array reads. Slope = dh/dx of the segment under the wheel.
import { f32 } from '../../sdk/index.js';

export const FeatureKind = Object.freeze({
    Hump: 0, Ramp: 1, Kicker: 2, Gap: 3, Table: 4, BigAir: 5, Whoops: 6, Double: 7, Creek: 8, StepUp: 9, Triple: 10,
});

export const Lanes = 4;
export const Skew = 8;             // px per lane
const Pad = 512;                    // heightmap index of x' = 0
export const Wake = 330;            // a slow rider starts riding when the player is this far behind its spawn
export const BaleLen = 12;          // a hay bale's length along the track (px)
export const BaleHigh = 10;         // clear it in the air above this

// what a rider is: SLOW waits on the track and rides when you come (stages 1-4), PACK starts at the gate
// with you and leans on you (the stadium), FIELD is the championship's starting grid
export const RiderKind = Object.freeze({ Slow: 0, Pack: 1, Field: 2 });

export class Track {
    constructor(length) {
        this.length = length;
        this.features = [];
        this.mud = [];
        this.fords = [];             // { x0, x1 }: water across all four lanes
        this.creeks = [];            // { x0, x1 }: the water in a creek gap's pit
        this.bales = [];             // { lane, x }
        this.rivals = [];            // { x, lane, speedMul, weaver, kind, pushy, jersey }
        this.signs = [];             // { x, text }: a warning board on the back fence
        this.lapAt = 0;              // > 0: a two-lap track; the LAP line's x'
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

    // the ford under a wheel at (x, laneF), or -1
    fordAt(x, laneF) {
        const xp = f32(x + laneF * Skew);
        for (let i = 0; i < this.fords.length; i++) { const w = this.fords[i]; if (xp >= w.x0 && xp <= w.x1) return i; }
        return -1;
    }

    creekAt(x, laneF) {
        const xp = f32(x + laneF * Skew);
        for (let i = 0; i < this.creeks.length; i++) { const w = this.creeks[i]; if (xp >= w.x0 && xp <= w.x1) return i; }
        return -1;
    }

    // the next jump whose lip lies within [x, x + ahead] in this lane (track space), or null
    jumpAhead(x, laneF, ahead) {
        const xp = f32(x + laneF * Skew);
        for (const f of this.features) if (f.jump && f.x0 + f.lip >= xp && f.x0 <= xp + ahead) return f;
        return null;
    }

    featureAt(xp) {
        for (const f of this.features) if (xp >= f.x0 && xp < f.x0 + f.len) return f;
        return null;
    }

    // ------------------------------------------------------------ building
    // lip: where you leave it (dx); clear: land past this dx and you cleared the gap (0 = no gap to clear)
    _add(kind, x0, jump, pts, lip = 0, clear = 0) {
        let top = 0, len = 0;
        for (let i = 0; i < pts.length; i += 2) { top = Math.max(top, pts[i + 1]); len = Math.max(len, pts[i]); }
        const f = { kind, x0, len, top, pts, jump, lip, clear };
        this.features.push(f);
        for (let i = 0; i + 3 < pts.length; i += 2) {
            const xa = Math.trunc(x0 + pts[i]), xb = Math.trunc(x0 + pts[i + 2]);
            const ha = pts[i + 1], hb = pts[i + 3];
            for (let x = xa; x <= xb; x++) {
                const k = x + Pad;
                if (k < 0 || k >= this.hm.length) continue;
                this.hm[k] = xb === xa ? hb : f32(ha + f32(f32(hb - ha) * ((x - xa) / (xb - xa))));
            }
        }
        return f;
    }

    bake() {
        for (let i = 0; i < this.hm.length - 1; i++) this.sm[i] = f32(this.hm[i + 1] - this.hm[i]);
        this.sm[this.hm.length - 1] = 0;
        this.features.sort((a, b) => a.x0 - b.x0);
        this.bales.sort((a, b) => a.x - b.x);
        return this;
    }

    mudhole(lane, x0, x1) { this.mud.push({ lane, x0, x1 }); return this; }
    bog(lanes, x0, x1) { for (const l of lanes) this.mud.push({ lane: l, x0, x1 }); return this; }
    ford(x0, x1) { this.fords.push({ x0, x1 }); return this; }
    bale(lane, x) { this.bales.push({ lane, x }); return this; }
    sign(x, text) { this.signs.push({ x, text }); return this; }
    rider(x, lane, mul, weaver = false) { this.rivals.push({ x, lane, speedMul: mul, weaver, kind: RiderKind.Slow, pushy: false, jersey: 0 }); return this; }
    racer(x, lane, mul, kind, jersey, pushy = false) { this.rivals.push({ x, lane, speedMul: mul, weaver: false, kind, pushy, jersey }); return this; }

    // shapes (dx, h). Up-faces 0.75 (37 deg) unless named; a lip at the top of an up-face launches you.
    hump(x) { this._add(FeatureKind.Hump, x, false, [0, 0, 16, 7, 32, 0]); return this; }
    whoops(x, n) {
        const p = [0, 0];
        for (let i = 0; i < n; i++) { p.push(i * 28 + 14, 8, i * 28 + 28, 0); }
        this._add(FeatureKind.Whoops, x, false, p);
        return this;
    }
    ramp(x) { this._add(FeatureKind.Ramp, x, true, [0, 0, 32, 24, 48, 24, 96, 0], 32); return this; }
    kicker(x) { this._add(FeatureKind.Kicker, x, true, [0, 0, 36, 27, 58, 0], 36); return this; }
    gap(x, gap) { this._add(FeatureKind.Gap, x, true, [0, 0, 36, 27, 54, 0, 54 + gap, 0, 72 + gap, 27, 126 + gap, 0], 36, 72 + gap); return this; }
    table(x, top) { this._add(FeatureKind.Table, x, true, [0, 0, 32, 24, 32 + top, 24, 80 + top, 0], 32); return this; }
    bigAir(x) { this._add(FeatureKind.BigAir, x, true, [0, 0, 44, 33, 72, 0], 44); return this; }
    double(x) { this._add(FeatureKind.Double, x, true, [0, 0, 30, 22, 54, 0, 84, 22, 132, 0], 30, 84); return this; }
    // a gap with a creek in its pit: the far bank's face is steep, the pit is water; short = SPLASH
    creek(x, gap) {
        this._add(FeatureKind.Creek, x, true, [0, 0, 36, 27, 50, 4, 50 + gap, 4, 64 + gap, 27, 120 + gap, 0], 36, 64 + gap);
        this.creeks.push({ x0: x + 50, x1: x + 50 + gap });
        return this;
    }
    // a step-up: a kicker into a high plateau; too slow and you hit its face
    stepUp(x) { this._add(FeatureKind.StepUp, x, true, [0, 0, 28, 21, 36, 8, 62, 8, 84, 38, 148, 38, 228, 0], 28, 84); return this; }
    // three steep humps in a row: jump the middle one, land on the back of the third
    triple(x) { this._add(FeatureKind.Triple, x, true, [0, 0, 26, 20, 44, 0, 66, 20, 84, 0, 106, 20, 150, 0], 26, 106); return this; }
}
