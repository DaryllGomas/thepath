// THE NODE · world 1 · AFTERGLOW on the Cabinet Engine · THE BOT: a modelled average pilot.
//
// It plays only through the InputFrame a person makes (stick, A, B), reads the sky and never writes to it;
// its dice are its own (this.rng).
//   look      every 0.14-0.28 s it looks again (a person's reaction) and only then changes its mind
//   aim       it picks a target (near the reticle, the boss's parts when a boss is up), keeps it a while,
//             and pushes the stick toward it with a misjudged amount (it overshoots and wanders); now and
//             then it just drifts
//   missiles  it waits for a few locks (1-4, its mood), sometimes fires early, sometimes forgets
//   threats   a missile coming is NOTICED with `noticeFront` (ahead) or `noticeBack` (from behind, only
//             the WARNING arrow to go on); a missed one gets one late glance. Noticed, it ROLLS (B) or JINKS
//             (a hard stick the other way), timed by feel: the roll lead is drawn from leadMin..leadMax, so
//             some rolls come too early or too late, and a jink too early is followed by the missile
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { AfterglowRound } from './round.js';
import { STAGES } from './world.js';

export class AfterglowBot extends CabinetBotBase {
    constructor() {
        super();
        this.lookMin = 0.14; this.lookMax = 0.28;
        this.noticeFront = 0.86; this.noticeBack = 0.55; this.lateGlance = 0.3;
        this.rollPref = 0.75;                          // noticed: roll rather than jink
        this.leadMin = 0.1; this.leadMax = 0.85;       // seconds before impact it presses B (safe: 0.04-0.74)
        this.jinkMin = 0.2; this.jinkMax = 0.75;       // seconds before impact it starts a jink
        this.aimErr = 7;                               // px of misjudged aim per look
        this.deadband = 5;                             // px: close enough, let go of the stick
        this.drift = 0.08;                             // chance per look it stops aiming for a moment
        this.retarget = 0.12;
        this.forget = 0.1;                             // chance per look it forgets to fire when it meant to
        this._reset();
    }

    get name() { return 'ag-average-pilot'; }

    reset(seed) { super.reset(seed); this._reset(); }

    _reset() {
        this._look = 0; this._sx = 0; this._sy = 0; this._holdX = 0; this._holdY = 0;
        this._target = null; this._want = 2; this._fire = false; this._plans = [];
        this._seen = new Map(); this._driftT = 0;
    }

    think(sim, dt) {
        const r = sim;
        const P = AfterglowRound.Phase;
        if (r == null || r.world == null) return InputFrame.neutral;
        const w = r.world;
        if (r.p !== P.Running && r.p !== P.Intro) { this._reset(); return InputFrame.neutral; }
        if (!w.alive) { this._seen.clear(); this._plans.length = 0; return InputFrame.neutral; }
        this._look -= dt;
        if (this._look <= 0) { this._look = this.range(this.lookMin, this.lookMax); if (r.p === P.Running) this._decide(w); }

        const out = new InputFrame();
        // the stick: an aim push held for a misjudged time
        if (this._holdX > 0) { this._holdX -= dt; out.x = this._sx; }
        if (this._holdY > 0) { this._holdY -= dt; out.y = this._sy; }
        // the evasions it planned, earliest first: a jink holds the stick hard over, a roll presses B
        while (this._plans.length > 0 && this._plans[0].end < w.now) this._plans.shift();
        const pl = this._plans.length > 0 && w.now >= this._plans[0].at ? this._plans[0] : null;
        if (pl && pl.roll) {
            out.b = !this.lastFrame.b; out.x = pl.dir;
            if (out.b) this._plans.shift();
        } else if (pl) { out.x = pl.dir; out.y = 0; }
        if (this._fire) { out.a = !this.lastFrame.a; if (out.a) this._fire = false; }
        return out;
    }

    _decide(w) {
        const d = STAGES[w.stage];
        // ---- threats
        for (const m of w.emissiles) {
            if (!m.alive || m.passed) continue;
            const tg = w.tgo(m);
            if (tg <= 0 || tg > 2.4) continue;
            let seen = this._seen.get(m);
            if (seen === undefined) {
                const behind = m.vz > 0;
                seen = this.chance(behind ? this.noticeBack : this.noticeFront) ? 1 : 0;
                this._seen.set(m, seen);
                if (seen) this._respond(w, m, tg);
            } else if (seen === 0 && tg < 0.75) {
                this._seen.set(m, 2);
                if (this.chance(this.lateGlance)) this._respond(w, m, tg);
            }
        }
        if (this._seen.size > 40) for (const k of [...this._seen.keys()]) if (!k.alive || k.passed) this._seen.delete(k);

        // ---- the target
        if (this._driftT > 0) { this._driftT -= this.lookMax; this._holdX = 0; this._holdY = 0; }
        else if (this.chance(this.drift)) { this._driftT = this.range(0.3, 0.9); this._holdX = 0; this._holdY = 0; }
        else {
            const tAlive = this._target && this._target.alive && this._target.z > 60 && this._target.z < 1000;
            if (!tAlive || this.chance(this.retarget) || (this._target.lock && this._target.lock.missile)) this._target = this._pick(w);
            const t = this._target;
            if (t && w.proj(t.x, t.y, t.z)) {
                const dx = w._p.sx - w.rx + this.range(-this.aimErr, this.aimErr);
                const dy = w._p.sy - w.ry + this.range(-this.aimErr, this.aimErr);
                this._sx = 0; this._sy = 0; this._holdX = 0; this._holdY = 0;
                if (Math.abs(dx) > this.deadband) { this._sx = dx > 0 ? 1 : -1; this._holdX = Math.min(0.35, Math.abs(dx) / 90 * this.range(0.6, 1.5)); }
                if (Math.abs(dy) > this.deadband) { this._sy = dy > 0 ? -1 : 1; this._holdY = Math.min(0.35, Math.abs(dy) / 70 * this.range(0.6, 1.5)); }
            } else {
                // nothing to chase: drift back toward the middle of the sky
                const my = (d.yMin + d.yMax) / 2;
                this._sx = w.px > 25 ? -1 : w.px < -25 ? 1 : 0; this._holdX = 0.15;
                this._sy = w.py > my + 20 ? -1 : w.py < my - 20 ? 1 : 0; this._holdY = 0.15;
            }
        }

        // ---- missiles
        const n = w.locks.filter(L => !L.missile).length;
        if (n > 0) {
            let near = false;
            for (const L of w.locks) if (!L.missile && L.target.z < 260) near = true;
            if ((n >= this._want || near || this.chance(0.1)) && !this.chance(this.forget)) {
                this._fire = true;
                const u = this.rng.nextDouble();
                this._want = u < 0.3 ? 1 : u < 0.6 ? 2 : u < 0.85 ? 3 : 4;
            }
        }
    }

    _respond(w, m, tg) {
        const roll = this.chance(this.rollPref) && w.rollCool <= 0.3;
        const side = (m.x + m.vx * tg) - w.px;          // where it will be relative to us
        const away = side > 0 ? -1 : 1;
        const edge = Math.abs(w.px) > STAGES[w.stage].xMax - 18;
        const dir = edge ? (w.px > 0 ? -1 : 1) : away;
        const arrive = w.now + tg;
        // a roll it already planned that will still be spinning when this one arrives covers it too
        // (a person rolls once for a volley)
        for (const q of this._plans) if (q.roll && arrive >= q.at + 0.08 && arrive <= q.at + 0.7) return;
        if (w.rollT >= 0 && tg + w.rollT <= 0.7) return;
        let plan;
        if (roll) {
            const at = w.now + Math.max(0.12, tg - this.range(this.leadMin, this.leadMax));
            plan = { roll: true, at, end: at + 0.5, dir };
        } else {
            const at = w.now + Math.max(0.1, tg - this.range(this.jinkMin, this.jinkMax));
            plan = { roll: false, at, end: at + this.range(0.3, 0.55), dir };
        }
        this._plans.push(plan);
        this._plans.sort((a, b) => a.at - b.at);
    }

    // a target that catches the eye: near the reticle on the tube, boss parts first, not always the best
    _pick(w) {
        let total = 0;
        const c = [], wt = [];
        for (const t of w.targets) {
            if (!t.alive || t.z < 120 || t.z > 1000) continue;
            if (!w.proj(t.x, t.y, t.z)) continue;
            const dd = Math.abs(w._p.sx - w.rx) + Math.abs(w._p.sy - w.ry);
            let v = 1 / Math.max(15, dd);
            if (t.isPoint) v *= 2.5;
            if (t.lock) v *= 0.3;
            c.push(t); wt.push(v); total += v;
        }
        if (total <= 0) return null;
        let u = this.rng.nextDouble() * total;
        for (let i = 0; i < c.length; i++) { u -= wt[i]; if (u <= 0) return c[i]; }
        return c[c.length - 1];
    }
}
