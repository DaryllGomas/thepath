// THE NODE · world 1 · IRONWORKS on the Cabinet Engine · THE BOT: a modelled average player
// (port of IronworksBot.cs).
//
// It plays through the panel like anyone: stick holds and an A press that is always a fresh edge.
// Route: the nearest whole ladder up from the girder it stands on. The brief's three rules:
//   - JUMP the instant a drum on your girder is two tiles (16 px) out: it turns to face the drum
//     and makes a running hop, which clears a drum with room to spare
//   - PREFER A LADDER over a jump when two drums converge (from both sides, or one hard behind
//     the other, which a single hop cannot clear), if it can get up the ladder before they arrive
//   - TAKE THE HAMMER if a drum is within three tiles and a hammer hangs within reach
// and on a ladder it waits (or ducks back) while a drum crosses the ladder top above it.
//
// Being average: it needs a reaction time after first sight (reactMin..reactMax s) before it
// can act on a threat, and 30% of the time its eyes are elsewhere for lapseMin..lapseMax s more;
// 1% of threats it never sees at all; each hop carries a timing error of +-jitter s. A fast drum
// arrives inside a lapse and turns the same timing error into more pixels, so mercy (slower
// drums) shows up in its win rate. Its dice are its own (this.rng), never the round's.
import { f32, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { IronworksSim } from './sim.js';
import { IronworksLevel as L } from './level.js';

const S = IronworksSim;
const FloatMax = f32(3.4028234663852886e38);   // C# float.MaxValue

function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }   // C# Math.Sign(float) -> int
function isInf(v) { return v === Infinity || v === -Infinity; }

// C# struct Threat (never mutated after finish(), so sharing the object is the same as copying it)
function newThreat(key, half) {
    return { key, x: 0, v: 0, delay: 0, half, fire: false, dx: 0, gap: 0, tHit: 0 };   // tHit: s until it reaches you standing still (inf if never)
}

function finish(t, c) {
    t.dx = f32(t.x - c.x);
    t.gap = f32(f32(Math.abs(t.dx) - S.ClimberHalfW) - t.half);
    const coming = f32(t.v * t.dx) < 0;
    t.tHit = coming ? f32(t.delay + f32(Math.max(0, t.gap) / Math.abs(t.v))) : Infinity;
}

export class IronworksBot extends CabinetBotBase {
    constructor() {
        super();
        this.jumpAt = f32(16);          // two tiles
        this.jitter = f32(0.10);        // s, +- timing error on every hop
        this.notice = f32(0.99);        // chance a threat is seen at all
        this.reactMin = f32(0.15); this.reactMax = f32(0.45);
        this.lapse = f32(0.3);          // chance its eyes are elsewhere when a threat appears...
        this.lapseMin = f32(0.3); this.lapseMax = f32(0.9);   // ...for this much longer
        this.hammerTiles = f32(24);     // three tiles
        this.look = f32(120);           // px along the girder it pays attention to

        this._seen = new Map();         // drum / fire-ball object -> { at, delay, err, noticed }
        this._threats = [];
        this._clock = 0;
    }

    get name() { return 'iw-average-player'; }

    reset(seed) { super.reset(seed); this._seen.clear(); this._clock = 0; }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== S.Phase.Climb) { this._seen.clear(); return InputFrame.neutral; }
        this._clock = f32(this._clock + dt);
        const c = s.c;
        switch (c.m) {
            case S.Mode.Walk: return this._walk(s);
            case S.Mode.Ladder: return this._onLadder(s);
            default: return InputFrame.neutral;
        }
    }

    // ------------------------------------------------------------------ on a girder
    _walk(s) {
        const c = s.c;
        const g = c.g;
        const route = L.nearestUp(g, c.x);
        this._gather(s, g);
        const threats = this._threats;

        if (c.hammerLeft > 0) {
            // swing at whatever is near; otherwise wait at the ladder with the stick up
            let near = null;
            for (const t of threats) if (Math.abs(t.dx) < 70 && t.delay < f32(0.2) && (near == null || Math.abs(t.dx) < Math.abs(near.dx))) near = t;
            if (near != null && c.hammerLeft > f32(0.6)) return InputFrame.stick(near.dx > 0 ? Dir4.Right : Dir4.Left);
            if (route == null) return InputFrame.neutral;
            if (Math.abs(f32(route.x - c.x)) > 1) return InputFrame.stick(route.x > c.x ? Dir4.Right : Dir4.Left);
            return InputFrame.stick(Dir4.Up);
        }

        // the threats it has seen and had time to react to, soonest first
        let first = null, second = null;
        for (const t of threats) {
            if (!this._known(t) || isInf(t.tHit)) continue;
            if (first == null || t.tHit < first.tHit) { if (first != null) second = first; first = t; }
            else if (second == null || t.tHit < second.tHit) second = t;
        }

        const toRoute = route == null ? 0 : Math.abs(f32(route.x - c.x)) <= f32(1.5) ? 0 : route.x > c.x ? 1 : -1;

        // something about to land on this spot (down a ladder, off a girder end): step to the
        // side it will roll away from
        for (const t of threats)
            if (this._known(t) && t.delay > f32(0.02) && t.delay < f32(0.9) && Math.abs(t.dx) < 11) {
                const uphill = t.v > 0 ? -1 : 1;
                return InputFrame.stick(uphill > 0 ? Dir4.Right : Dir4.Left);
            }

        if (first == null || first.tHit > f32(1.3)) {
            if (route == null) return InputFrame.neutral;
            if (toRoute === 0) return InputFrame.stick(Dir4.Up);
            if (this._blocked(s, toRoute)) return InputFrame.neutral;
            return InputFrame.stick(toRoute > 0 ? Dir4.Right : Dir4.Left);
        }

        // at the foot of the route ladder with time to get up it: up beats a hop
        if (toRoute === 0 && route != null && first.tHit > f32(f32(10 / s.climbSpeed) + f32(0.12))) return InputFrame.stick(Dir4.Up);

        // two converging: take a ladder if one can be reached in time
        const converge = second != null && (sign(second.dx) !== sign(first.dx) ? f32(second.tHit - first.tHit) < f32(0.7)
                                                                                : f32(second.tHit - first.tHit) < f32(0.45));
        if (converge) {
            let best = null, bt = FloatMax;
            for (const l of L.Ladders) {
                if (l.broken || l.lower !== g) continue;
                const reach = f32(f32(f32(Math.abs(f32(l.x - c.x)) / s.walkSpeed) + f32(10 / s.climbSpeed)) + f32(0.1));
                if (reach < first.tHit && reach < bt) { bt = reach; best = l; }
            }
            if (best != null) {
                if (Math.abs(f32(best.x - c.x)) <= f32(1.5)) return InputFrame.stick(Dir4.Up);
                return InputFrame.stick(best.x > c.x ? Dir4.Right : Dir4.Left);
            }
        }

        // a drum within three tiles and a hammer in reach: jump into the hammer
        if (!first.fire && first.gap <= this.hammerTiles && first.delay < f32(0.1))
            for (let i = 0; i < L.Hammers.length; i++) {
                const h = L.Hammers[i];
                if (s.hammerTaken[i] || h.girder !== g || Math.abs(f32(h.x - c.x)) > 12) continue;
                if (Math.abs(f32(h.x - c.x)) <= 3) return this._hop(0);
                return InputFrame.stick(h.x > c.x ? Dir4.Right : Dir4.Left);
            }

        // the hop: face it, run at it, jump at two tiles (+ this hop's timing error)
        if (first.delay > f32(0.05)) {
            // still coming down, and it will roll this way: give yourself room to hop it
            if (Math.abs(first.dx) < 20) return InputFrame.stick(first.dx > 0 ? Dir4.Left : Dir4.Right);
            return InputFrame.neutral;
        }
        const face = first.dx > 0 ? 1 : -1;
        const closing = f32(Math.abs(first.v) + s.walkSpeed);
        let trigger = this.jumpAt;
        if (first.fire) {
            // a fire-ball is slow: time the hop to its closing speed instead of two tiles
            trigger = f32(f32(closing * f32(S.JumpV0 / S.JumpG)) - f32(S.ClimberHalfW + first.half));
        }
        const mem = this._mem(first.key);
        if (first.gap <= f32(trigger + f32(mem.err * closing))) return this._hop(face);
        return InputFrame.stick(face > 0 ? Dir4.Right : Dir4.Left);
    }

    // something ahead that is moving away slower than a walk: do not walk into its back
    _blocked(s, dir) {
        for (const t of this._threats) {
            if (!this._known(t) || t.delay > f32(0.2)) continue;
            if (sign(t.dx) !== dir) continue;
            const receding = f32(t.v * t.dx) > 0;
            if (((receding && Math.abs(t.v) < s.walkSpeed) || t.v === 0) && t.gap < 26) return true;
        }
        return false;
    }

    _hop(dir) {
        if (this.lastFrame.a) return InputFrame.neutral;     // release first, so the press is an edge
        const f = dir === 0 ? InputFrame.neutral : InputFrame.stick(dir > 0 ? Dir4.Right : Dir4.Left);
        f.a = true;
        return f;
    }

    // ------------------------------------------------------------------ on a ladder
    _onLadder(s) {
        const c = s.c;
        const l = L.Ladders[c.ladderIdx];
        // a drum coming down this very ladder: back down and off it
        for (const d of s.drums)
            if (!d.dead && d.m === S.DrumMode.Ladder && d.ladderIdx === l.index && d.y < c.feet && this._mem(d).noticed)
                return InputFrame.stick(Dir4.Down);

        const upper = l.lower + 1;
        if (upper >= L.TopIndex) return InputFrame.stick(Dir4.Up);
        this._gather(s, upper);
        const toTop = f32(f32(c.feet - l.yTop) / s.climbSpeed);
        const exposed = Math.max(0, f32(f32(c.feet - f32(l.yTop + 15)) / s.climbSpeed));
        for (const t of this._threats) {
            if (!this._known(t)) continue;
            const dx = f32(t.x - l.x), adx = Math.abs(dx);
            if (t.v === 0) continue;
            const toward = f32(t.v * dx) < 0 || adx < 9;
            if (!toward) continue;
            const tIn = f32(t.delay + f32(Math.max(0, f32(adx - 9)) / Math.abs(t.v)));
            // it crosses the ladder top before we would be up and clear of it
            if (tIn < f32(toTop + f32(0.55)) && f32(tIn + f32(18 / Math.abs(t.v))) > f32(exposed - f32(0.05)))
                return c.feet < f32(l.yTop + 15) ? InputFrame.stick(Dir4.Down) : InputFrame.neutral;
        }
        return InputFrame.stick(Dir4.Up);
    }

    // ------------------------------------------------------------------ what it can see
    _gather(s, g) {
        const threats = this._threats;
        threats.length = 0;
        const c = s.c;
        const girder = L.G[g];
        const roll = s.drumSpeed;
        for (const d of s.drums) {
            if (d.dead) continue;
            const t = newThreat(d, S.DrumHalf);
            if (d.m === S.DrumMode.Roll && d.g === g) { t.x = d.x; t.v = f32(d.dir * roll); }
            else if (d.m === S.DrumMode.Fall && d.g - 1 === g) {
                const surf = girder.surface(girder.clamp(d.x, f32(6)));
                const h = Math.max(0, f32(surf - d.y));
                const root = f32(Math.sqrt(f32(f32(d.vy * d.vy) + f32(f32(2 * S.DrumGravity) * h))));
                const tf = f32(f32(-d.vy + root) / S.DrumGravity);
                t.x = girder.clamp(f32(d.x + f32(d.vx * tf)), f32(6)); t.v = f32(girder.downhill * roll); t.delay = tf;
            }
            else if (d.m === S.DrumMode.Ladder && L.Ladders[d.ladderIdx].lower === g) {
                const l = L.Ladders[d.ladderIdx];
                t.x = l.x; t.v = f32(girder.downhill * roll);
                t.delay = f32(Math.max(0, f32(l.yBottom - d.y)) / f32(roll * S.LadderDrumMul));
            }
            else continue;
            finish(t, c);
            if (Math.abs(t.dx) <= this.look) threats.push(t);
        }
        if (g === 0)
            for (const f of s.fires) {
                if (f.dead || f.hop) continue;
                const t = newThreat(f, S.FireHalf);
                t.x = f.x; t.v = f32(f.dir * s.fireSpeed); t.fire = true;
                finish(t, c);
                if (Math.abs(t.dx) <= this.look) threats.push(t);
            }
        for (const t of threats) this._mem(t.key);
    }

    _mem(key) {
        let m = this._seen.get(key);
        if (m === undefined) {
            // C# object-initialiser order: At, Noticed, Delay, Err (three draws), then the lapse
            m = { at: this._clock, noticed: false, delay: 0, err: 0 };
            m.noticed = this.rng.nextDouble() < this.notice;
            m.delay = this.range(this.reactMin, this.reactMax);
            m.err = this.range(-this.jitter, this.jitter);
            if (this.chance(this.lapse)) m.delay = f32(m.delay + this.range(this.lapseMin, this.lapseMax));
            this._seen.set(key, m);
        }
        return m;
    }

    _known(t) {
        const m = this._mem(t.key);
        return m.noticed && f32(this._clock - m.at) >= m.delay;
    }
}
