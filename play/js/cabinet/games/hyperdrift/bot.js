// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE BOT: a modelled
// average player at the panel. Port of HyperDriftBot.cs (Staging/Batch3/hyperdrift), 1:1, f32 floats.
//
// It plays through the stick and A like anyone else, and it steers like a player on a digital stick:
// left, right or nothing, never a fine analogue value. What it does:
//   - reads the road TWO SEGMENTS (2 x 64 px) ahead, plus its braking distance, for the speed it can
//     carry, and brakes before the hairpins
//   - steers for the centre of its lane a reaction time ahead (look-ahead = speed x reaction)
//   - drifts (holds A) when the road ahead turns sharper than normal grip can follow
//   - passes trucks on the open side: into the far lane when no oncoming car is in reach, back when the
//     truck is behind it; follows when it isn't clear. Takes the far lane at the works.
//   - dodges an oil slick it notices; picks a branch at the fork
// How average it is: each round it rolls a FORM (0 = an off day, 1 = its best): reaction 0.30 -> 0.20 s,
// top-speed nerve 68 -> 100 %, curve speed 80 -> 100 %, hesitating at a clear pass 60 -> 5 % (re-rolled
// every 1.2 s), late braking into a hairpin 45 -> 15 % a hairpin, a forgotten drift 22 -> 8 %, a risky
// pass 30 -> 8 %, oil noticed 50 -> 85 %, a wander of the line 7 -> 2 px. Its dice are its own
// (CabinetBotBase.rng), never the sim's.
import { f32, CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { HyperDriftTrack, HyperDriftScroll, ZoneKind } from './track.js';
import { HyperDriftSim, Slick } from './sim.js';

const FLT_MAX = 3.4028234663852886e38;
const Phase = HyperDriftSim.Phase;
const LaneOffset = HyperDriftTrack.LaneOffset, HalfWidth = HyperDriftTrack.HalfWidth;
const F0_05 = f32(0.05), F0_06 = f32(0.06), F0_08 = f32(0.08), F0_12 = f32(0.12), F0_25 = f32(0.25), F0_35 = f32(0.35);
const F0_6 = f32(0.6), F0_8 = f32(0.8), F0_92 = f32(0.92), F0_95 = f32(0.95), F1_1 = f32(1.1), F1_2 = f32(1.2), F1_3 = f32(1.3);
const F1_6 = f32(1.6), F2_2 = f32(2.2), F0_02 = f32(0.02), F1EM3 = f32(1e-3);

function lerp(a, b, u) { return f32(a + f32(f32(b - a) * u)); }

function find(r, id) {
    for (const t of r.traffic) if (t.id === id) return t;
    return null;
}

export class HyperDriftBot extends CabinetBotBase {
    constructor() {
        super();
        // the average player's traits at form 0 (an off day) and form 1 (its best)
        this.reactionOff = f32(0.30); this.reactionBest = f32(0.20);
        this.nerveOff = f32(0.68); this.nerveBest = f32(1.0);
        this.careOff = f32(0.80); this.careBest = f32(1.0);
        this.hesitateOff = f32(0.60); this.hesitateBest = f32(0.05);
        this.lateOff = f32(0.45); this.lateBest = f32(0.15);
        this.forgetOff = f32(0.22); this.forgetBest = f32(0.08);
        this.riskOff = f32(0.30); this.riskBest = f32(0.08);
        this.oilOff = f32(0.50); this.oilBest = f32(0.85);
        this.wanderOff = f32(7); this.wanderBest = f32(2);
        this.forkRight = f32(0.4);
        this.lateralSlack = f32(200);                // px/s^2 of later correction it counts on

        this.form = 0;
        this.intent = '';

        this._reaction = 0; this._nerve = 0; this._care = 0; this._pHesitate = 0; this._pLate = 0;
        this._pForget = 0; this._pRisk = 0; this._pOil = 0; this._wander = 0;
        this._hesitateT = 0; this._hesitating = false;
        this._lane = +1; this._branch = 1;
        this._passing = false; this._aborting = false; this._forkChosen = false; this._threat = false;
        this._abortId = -1; this._passId = -1;
        this._hairpinSeen = -1; this._late = false; this._forget = false;
        this._oilSeen = -1; this._oilDodge = false; this._oilShift = 0;
        this._wobble = 0; this._wobbleT = 0;
        this._aHeld = false;
    }

    get name() { return 'hd-average-player'; }

    reset(seed) {
        super.reset(seed);
        this.form = f32(this.rng.nextDouble());
        const u = this.form;
        this._reaction = lerp(this.reactionOff, this.reactionBest, u);
        this._nerve = lerp(this.nerveOff, this.nerveBest, u);
        this._care = lerp(this.careOff, this.careBest, u);
        this._pHesitate = lerp(this.hesitateOff, this.hesitateBest, u);
        this._hesitateT = 0; this._hesitating = false;
        this._pLate = lerp(this.lateOff, this.lateBest, u);
        this._pForget = lerp(this.forgetOff, this.forgetBest, u);
        this._pRisk = lerp(this.riskOff, this.riskBest, u);
        this._pOil = lerp(this.oilOff, this.oilBest, u);
        this._wander = lerp(this.wanderOff, this.wanderBest, u);
        this._lane = +1; this._branch = 1; this._passing = this._aborting = false; this._forkChosen = false;
        this._passId = this._abortId = -1; this._threat = false;
        this._hairpinSeen = -1; this._late = false; this._forget = false;
        this._oilSeen = -1; this._oilDodge = false; this._oilShift = 0;
        this._wobble = 0; this._wobbleT = 0; this._aHeld = false;
        this.intent = '';
    }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.p !== Phase.Racing || r.spinning) { this._aHeld = false; return InputFrame.neutral; }
        const tr = r.track;
        const s = r.s, x = r.x, v = r.v;

        // ---- a wander in its line, changing every half second
        this._wobbleT = f32(this._wobbleT - dt);
        if (this._wobbleT <= 0) { this._wobbleT = f32(0.5); this._wobble = this.range(-this._wander, this._wander); }

        // ---- the fork: pick a branch once it's in sight
        if (!this._forkChosen && tr.hasFork(f32(s + 170))) { this._forkChosen = true; this._branch = this.chance(this.forkRight) ? 2 : 1; }
        if (!tr.hasFork(s) && !tr.hasFork(f32(s + 170))) { if (this._forkChosen && s > tr.fork.s1) this._branch = 1; }

        // ---- a new hairpin in reach: roll this one's mistakes
        const hp = tr.nextZone(ZoneKind.Hairpin, s);
        if (hp !== null && hp.index !== this._hairpinSeen && f32(hp.s0 - s) < 260) {
            this._hairpinSeen = hp.index;
            this._late = this.chance(this._pLate);
            this._forget = this.chance(this._pForget);
        }

        // ---- lane: yours, the far one at the works, the far one to pass (a timid day hesitates)
        this._hesitateT = f32(this._hesitateT - dt);
        if (this._hesitateT <= 0) { this._hesitateT = F1_2; this._hesitating = this.chance(this._pHesitate); }
        this._chooseLane(r, s, v);

        // ---- oil: dodge a slick it notices in its path
        this._oilCheck(r, s);

        // ---- speed: the road two segments ahead (+ braking distance), and whoever it's following
        const vt = this._targetSpeed(r, s, v);
        let y = 0;
        if (v < f32(vt - 3)) y = 1;
        else if (v > f32(vt + 8)) y = -1;

        // ---- steering: for the lane centre a reaction time ahead, kept inside the road it can see two
        //      segments ahead, on a digital stick
        const look = Math.max(16, f32(v * f32(this._reaction + F0_05)));
        const xt = f32(this._targetX(tr, f32(s + look)) + this._wobble);
        const tHit = f32(look / Math.max(v, 30));
        let want = f32(f32(xt - x) / Math.max(F0_12, tHit));
        // near road first: a far constraint that can't be met with the near ones is left for the brakes
        // (and the next frame) to sort out
        let lo = -FLT_MAX, hi = FLT_MAX;
        const cor = { left: 0, right: 0 };
        for (let d = 6; d <= 2 * HyperDriftBot.Segment; d = f32(d + 6)) {
            const tt = Math.max(F0_06, f32(f32(d / Math.max(v, 30)) - F0_08));
            this._corridor(r, f32(s + d), cor);
            const cl = cor.left, cr = cor.right;
            const slack = f32(f32(f32(0.5 * this.lateralSlack) * tt) * tt);      // it can still change its mind later
            const nlo = Math.max(lo, f32(f32(f32(cl - x) - slack) / tt)), nhi = Math.min(hi, f32(f32(f32(cr - x) + slack) / tt));
            if (nlo > nhi) break;
            lo = nlo; hi = nhi;
        }
        // outside the band it can safely be in: aim a third of the way in from the near edge
        if (want > hi) want = Math.max(lo, f32(hi - Math.min(60, f32(F0_35 * f32(hi - lo)))));
        else if (want < lo) want = Math.min(hi, f32(lo + Math.min(60, f32(F0_35 * f32(hi - lo)))));
        const vx = r.vx, db = 10;
        let X;
        if (want > f32(vx + db)) X = want > db ? 1 : 0;
        else if (want < f32(vx - db)) X = want < -db ? -1 : 0;
        else X = Math.abs(vx) < db ? 0 : Math.sign(vx);

        // ---- the drift: hold A while the road ahead turns sharper than grip
        let need = false;
        if (!this._forget) {
            for (let d = 0; d <= 70; d = f32(d + 6)) if (Math.abs(tr.slopeOf(f32(s + d), this._branch)) > F1_1) { need = true; break; }
        }
        let a = false;
        if (need && v > 32) {
            if (r.drifting) a = true;
            else if (r.driftCooldown <= 0) a = !this._aHeld;         // release for a step, then press again
        }
        this._aHeld = a;
        this.intent = (this._passing ? 'passing' : need ? 'drift' : this._lane < 0 ? 'far lane' : 'cruise') +
            (this._forget ? ' (forgot the drift)' : '') + (this._late ? ' (late braker)' : '');
        return new InputFrame(X, y, a);
    }

    _targetX(tr, s) {
        // its lane's centre; where the road runs steeply sideways it keeps nearer the middle
        const b = this._branch === 2 && tr.hasFork(s) ? 2 : 1;
        const x = f32(tr.centreX(s, b) + f32((this._lane * LaneOffset) * Math.min(tr.fOf(s, b), F1_3)));
        return f32(x + this._oilShift);
    }

    // the stretch of road the car's centre can safely be on at s (a car's width in from the edges)
    _corridor(r, s, out) {
        const tr = r.track;
        const b = this._branch === 2 && tr.hasFork(s) ? 2 : 1;
        const c = tr.centreX(s, b), f = tr.fOf(s, b);
        const half = tr.isBridge(s) ? f32((HalfWidth - 3) + Math.min(r.margin, 3)) : f32((HalfWidth + 1) + r.margin);
        const inset = f32(10 + f32(this._wander * 0.5));
        let left = f32(f32(c - f32(half * f)) + inset), right = f32(f32(c + f32(half * f)) - inset);
        const co = tr.coneOff(s);
        if (b === 1 && !Number.isNaN(co)) right = Math.min(right, f32(f32(f32(c + f32(co * f)) - 6) - f32(inset * F0_6)));
        if (left > right) { const m = f32(f32(left + right) * 0.5); left = right = m; }
        out.left = left; out.right = right;
    }

    _chooseLane(r, s, v) {
        const tr = r.track;
        this._threat = false;
        // works ahead or here: the far lane (the only one open)
        let works = false;
        for (let d = -10; d <= 300; d = f32(d + 10)) {
            const co = tr.coneOff(f32(s + d));
            if (!Number.isNaN(co) && co < LaneOffset + 12) { works = true; break; }
        }
        if (works) { this._lane = -1; this._passing = this._aborting = false; return; }
        if (this._branch === 2 && tr.hasFork(s)) { this._lane = +1; this._passing = this._aborting = false; return; }   // the empty branch

        const cruise = f32(r.vMax * this._nerve);
        if (this._passing) {
            const target = find(r, this._passId);
            if (target === null) { this._passing = false; this._lane = +1; return; }
            const dsT = f32(target.s - s), clearAt = target.halfL + 12;
            if (dsT < -clearAt) { this._passing = false; this._lane = +1; return; }             // done: back in
            const tOn = this._oncomingArrival(r, s, v);
            if (tOn < 9) {
                this._threat = true;
                if (dsT < -4) { this._passing = false; this._lane = +1; return; }             // level and going: cut in now
                const tPass = f32(f32(dsT + clearAt) / Math.max(5, f32(r.vMax - target.cur)));
                if (f32(tPass + F0_25) < tOn) { this._lane = -1; return; }                    // commit, flat out
                this._passing = false; this._aborting = true; this._abortId = this._passId;   // abort: brake, drop in behind
            } else { this._lane = -1; return; }
        }
        if (this._aborting) {
            const target = find(r, this._abortId);
            if (target === null || f32(target.s - s) > target.halfL + 14 || target.s < f32(f32(s - target.halfL) - 12)) { this._aborting = false; this._lane = +1; }
            else { this._lane = -1; return; }
        }
        // start a pass? the slowest thing ahead in your lane, and whatever is queued in front of it
        let first = null;
        for (const t of r.traffic)
            if (t.dir > 0 && t.lane > 0 && t.s > f32(s - 10) && f32(t.s - s) < 170 && (first === null || t.s < first.s)) first = t;
        let bend = false;
        for (const z of tr.hairpins) if (z.s1 > s && z.s0 < f32(s + 230)) bend = true;
        if (first !== null && first.cur < 5 && f32(first.s - s) < 120) bend = false;      // a parked queue: go round it
        if (first !== null && !bend && first.cur < f32(cruise - 30)) {
            let last = first;
            for (let more = true; more;) {
                more = false;
                for (const t of r.traffic)
                    if (t !== last && t.dir > 0 && t.lane > 0 && t.s > last.s && f32(t.s - last.s) < 80) { last = t; more = true; break; }
            }
            const tPass = f32(f32(f32(f32(last.s - s) + last.halfL) + 12) / Math.max(5, f32(cruise - Math.max(first.cur, last.cur))));
            const tOn = this._oncomingArrival(r, s, v);
            let clear = f32(tPass + 0.5) < tOn;
            if (clear && this._hesitating) clear = false;                                      // "not yet..."
            if (clear || this.chance(f32(this._pRisk * F0_02))) { this._passing = true; this._passId = last.id; this._lane = -1; return; }
        }
        this._lane = +1;
    }

    // seconds until the nearest oncoming car it can see (screen + the warning arrows) reaches it
    _oncomingArrival(r, s, v) {
        const sight = f32(HyperDriftScroll.topS(s) + 130);
        let best = FLT_MAX;
        for (const o of r.traffic) {
            if (o.dir > 0 || o.s < f32(s - 20) || o.s > sight) continue;
            const tt = f32(Math.max(0, f32(f32(o.s - s) - 30)) / Math.max(20, f32(v + o.cur)));
            if (tt < best) best = tt;
        }
        return best;
    }

    _oilCheck(r, s) {
        let near = null, idx = -1;
        for (let i = 0; i < r.oil.length; i++) {
            const o = r.oil[i];
            if (f32(o.s - s) > 8 && f32(o.s - s) < 120) { near = o; idx = i; break; }
        }
        if (near === null) {
            if (this._oilDodge && (this._oilSeen < 0 || this._oilSeen >= r.oil.length || r.oil[this._oilSeen].s < f32(s - 14))) { this._oilDodge = false; this._oilShift = 0; }
            return;
        }
        if (idx !== this._oilSeen) { this._oilSeen = idx; this._oilDodge = this.chance(this._pOil); this._oilShift = 0; }
        if (!this._oilDodge) return;
        const line = r.track.laneX(near.s, this._lane, this._branch);
        const gap = f32(line - near.x);
        if (Math.abs(gap) >= Slick.RX + 12) this._oilShift = 0;
        else {
            // go round it on the side with more road, unless that side has a car coming
            const c = r.track.cx(near.s);
            const side = near.x > c ? -1 : 1;
            if (side < 0 && this._oncomingArrival(r, s, r.v) < F1_6) { this._oilShift = 0; return; }
            this._oilShift = f32(side * (Slick.RX + 13) - gap);
        }
    }

    _targetSpeed(r, s, v) {
        const tr = r.track;
        const vmax = f32(r.vMax * this._nerve);
        let vt = vmax;
        const brake = f32(r.brake * (this._late ? F2_2 : 1));          // a late braker trusts brakes it doesn't have
        const scan = f32(2 * HyperDriftBot.Segment + f32(f32(v * v) / f32(2 * r.brake)));
        const lim = f32(r.tanNormal * F0_95);
        const care = this._care, reaction = this._reaction;
        for (let d = 6; d <= scan; d = f32(d + 6)) {
            const k = Math.abs(tr.slopeOf(f32(s + d), this._branch));
            let allow;
            if (k <= lim) allow = k < F1EM3 ? vmax : Math.min(vmax, f32(f32(f32(r.gripNormal * F0_92) * care) / k));
            else allow = f32(108 * care);                             // the hairpin entry speed: then the drift does the rest
            const free = Math.max(0, f32(d - f32(v * reaction)));
            const reach = f32(Math.sqrt(f32(f32(allow * allow) + f32(f32(2 * brake) * free))));
            if (reach < vt) vt = reach;
        }
        // follow whatever is ahead in its path (a truck it isn't passing, a queue at the works)
        const myX = this._targetX(tr, f32(s + 40));
        for (const t of r.traffic) {
            if (t.dir < 0 || t.s <= s || f32(t.s - s) > 190) continue;
            if ((this._passing || this._aborting) && this._lane < 0 && t.lane > 0 && !(this._aborting && t.id === this._abortId)) continue;
            const lx = t.lane > 0 ? tr.laneX(t.s, +1) : tr.laneX(t.s, -1);
            const inPath = Math.abs(f32(t.x - r.x)) < 22 || (Math.abs(f32(lx - myX)) < 20 && Math.abs(f32(t.x - myX)) < 24);
            if (!inPath) continue;
            const gap = f32(f32(f32(t.s - s) - 46) - f32(v * reaction));
            let reach = f32(Math.sqrt(Math.max(0, f32(f32(t.cur * t.cur) + f32(f32(f32(2 * r.brake) * F0_8) * Math.max(0, gap))))));
            if (gap <= 0) reach = Math.min(t.cur, reach);
            vt = Math.min(vt, reach);
        }
        // oncoming in its lane: stand on the brakes, unless it's committed to finishing a pass
        if (!(this._passing && this._threat))
            for (const o of r.traffic)
                if (o.dir < 0 && Math.abs(f32(o.x - r.x)) < 18 && o.s > s && f32(o.s - s) < 90) vt = Math.min(vt, 20);
        if (this._passing) vt = Math.max(vt, this._threat ? r.vMax : vmax);
        if (this._aborting) { const a = find(r, this._abortId); if (a !== null) vt = Math.min(vt, Math.max(0, f32(a.cur - 40))); }
        return Math.max(0, vt);
    }
}

HyperDriftBot.Segment = 64;
