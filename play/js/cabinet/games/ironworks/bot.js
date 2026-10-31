// THE NODE · world 1 · IRONWORKS on the Cabinet Engine · THE BOT: a modelled average player
// (port of IronworksBot.cs, given a sense of direction for the five boards on 2026-10-18).
//
// It plays through the panel like anyone: stick holds and an A press that is always a fresh edge.
// ROUTE: every board is a small graph (ladders, joins to walk or hop, cages to wait for). The bot keeps
// a cost-to-go for each way off each girder, toward the board's goal (the top platform) or the nearest
// bolt still in, and takes the cheapest from where it stands. The old rules ride on top:
//   - JUMP the instant a drum, cart or fire-ball on your girder is two tiles (16 px) out: it turns to
//     face it and makes a running hop
//   - PREFER A LADDER over a jump when two converge, if it can get up the ladder before they arrive
//   - TAKE THE HAMMER if a drum is within three tiles and a hammer hangs within reach
//   - on a ladder it waits (or ducks back) while a drum crosses the ladder top above it
//   - board 3: it does not step into the spring column, or over the hole, while a spring is coming
// Being average: a reaction time after first sight (reactMin..reactMax s), 30% of the time a lapse
// of lapseMin..lapseMax s more, 1% of threats never seen, and +-jitter s on every hop. Its dice are its
// own (this.rng), never the round's.
import { f32, CabinetBotBase, InputFrame, Dir4 } from '../../sdk/index.js';
import { IronworksSim } from './sim.js';

const S = IronworksSim;
const FloatMax = f32(3.4028234663852886e38);   // C# float.MaxValue

function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }   // C# Math.Sign(float) -> int
function isInf(v) { return v === Infinity || v === -Infinity; }

function newThreat(key, half) {
    return { key, x: 0, v: 0, delay: 0, half, fire: false, dx: 0, gap: 0, tHit: 0 };   // tHit: s until it reaches you standing still (inf if never)
}

// v is relative to the girder under you (a belt carries you too)
function finish(t, c, ground) {
    t.dx = f32(t.x - c.x);
    t.gap = f32(f32(Math.abs(t.dx) - S.ClimberHalfW) - t.half);
    const rv = f32(t.v - ground);
    t.rv = rv;
    const coming = f32(rv * t.dx) < 0;
    t.tHit = coming ? f32(t.delay + f32(Math.max(0, t.gap) / Math.abs(rv))) : Infinity;
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
        this._plan = null; this._planKey = '';
        this._ldir = -1;                // the way it is going on a ladder
        this._still = 0; this._lastX = 0; this._lastG = -1; this._wiggle = 0;
    }

    get name() { return 'iw-average-player'; }

    reset(seed) { super.reset(seed); this._seen.clear(); this._clock = 0; this._plan = null; this._planKey = ''; this._still = 0; this._wiggle = 0; }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== S.Phase.Climb) { this._seen.clear(); this._still = 0; return InputFrame.neutral; }
        this._clock = f32(this._clock + dt);
        const c = s.c;
        // stuck for a long while (a cart parked in the way, a jam): shake loose
        if (c.g === this._lastG && Math.abs(f32(c.x - this._lastX)) < 2 && c.m === S.Mode.Walk) this._still = f32(this._still + dt);
        else { this._still = 0; this._lastX = c.x; this._lastG = c.g; }
        if (this._still > 9) { this._still = 0; this._wiggle = f32(0.6); }
        if (this._wiggle > 0) { this._wiggle = f32(this._wiggle - dt); return this._hop(this.rng.nextDouble() < 0.5 ? -1 : 1); }
        switch (c.m) {
            case S.Mode.Walk: return this._walk(s);
            case S.Mode.Ladder: return this._onLadder(s);
            default: return InputFrame.neutral;
        }
    }

    // ------------------------------------------------------------------ the route
    // the ways off each girder (ladders, joins), and what each costs from there to the target
    _route(s) {
        const B = s.board;
        if (this._plan && this._plan.board === B && this._plan.bolts === B.boltsLeft) return this._plan;
        const P = [], walk = s.walkSpeed, climb = s.climbSpeed;
        for (const l of B.ladders) {
            if (l.broken) continue;
            const t = f32(f32(l.length / climb) + f32(0.2));
            P.push({ g: l.lo, x: l.x, to: l.hi, tx: l.x, kind: 'up', cost: t });
            P.push({ g: l.hi, x: l.x, to: l.lo, tx: l.x, kind: 'down', cost: t });
        }
        for (const a of B.G)
            for (const side of [1, -1])
                for (const j of side > 0 ? a.rightJ : a.leftJ) {
                    const b = B.G[j.g];
                    const x = side > 0 ? f32(a.x1 - 3) : f32(a.x0 + 3), tx = side > 0 ? f32(b.x0 + 3) : f32(b.x1 - 3);
                    const kind = a.isCage || b.isCage ? 'lift' : j.gap <= 2 && j.bolt < 0 ? 'walk' : 'hop';
                    P.push({ g: a.index, x, to: b.index, tx, kind, side, cost: kind === 'lift' ? f32(3) : kind === 'hop' ? f32(0.8) : f32(0.05) });
                }
        const targets = [];
        for (const b of B.bolts) if (!b.pulled) {
            targets.push({ g: b.gl, x: f32(B.G[b.gl].x1 - 3), side: 1 });
            targets.push({ g: b.gr, x: f32(B.G[b.gr].x0 + 3), side: -1 });
        }
        const D = new Array(P.length).fill(FloatMax);
        const V = (g, x) => {
            if (g === B.goal) return 0;
            let best = FloatMax;
            for (const t of targets) if (t.g === g) best = Math.min(best, f32(Math.abs(f32(x - t.x)) / walk));
            for (let i = 0; i < P.length; i++) if (P[i].g === g && D[i] < FloatMax) best = Math.min(best, f32(f32(Math.abs(f32(x - P[i].x)) / walk) + D[i]));
            return best;
        };
        for (let it = 0; it < 40; it++) {
            let moved = false;
            for (let i = 0; i < P.length; i++) {
                const v = V(P[i].to, P[i].tx);
                if (v >= FloatMax) continue;
                const d = f32(P[i].cost + v);
                if (d < D[i]) { D[i] = d; moved = true; }
            }
            if (!moved) break;
        }
        this._plan = { board: B, bolts: B.boltsLeft, P, D, targets };
        return this._plan;
    }

    // the next step from here: { x, kind, side }
    _next(s) {
        const c = s.c, plan = this._route(s), walk = s.walkSpeed;
        let best = null, bc = FloatMax;
        for (const t of plan.targets)
            if (t.g === c.g) { const v = f32(Math.abs(f32(c.x - t.x)) / walk); if (v < bc) { bc = v; best = { x: t.x, kind: 'bolt', side: t.side }; } }
        for (let i = 0; i < plan.P.length; i++) {
            const p = plan.P[i];
            if (p.g !== c.g || plan.D[i] >= FloatMax) continue;
            const v = f32(f32(Math.abs(f32(c.x - p.x)) / walk) + plan.D[i]);
            if (v < bc) { bc = v; best = p; }
        }
        return best;
    }

    // walk toward the next step and take it
    _act(s, nx) {
        const c = s.c, B = s.board;
        if (nx == null) return InputFrame.neutral;
        const dx = f32(nx.x - c.x);
        const toward = dx > 0 ? Dir4.Right : Dir4.Left;
        switch (nx.kind) {
            case 'up': case 'down':
                if (Math.abs(dx) <= f32(1.5)) { this._ldir = nx.kind === 'up' ? -1 : 1; return InputFrame.stick(nx.kind === 'up' ? Dir4.Up : Dir4.Down); }
                return InputFrame.stick(toward);
            case 'bolt':
                return InputFrame.stick(nx.side > 0 ? Dir4.Right : Dir4.Left);
            case 'walk':
                return InputFrame.stick(nx.side > 0 ? Dir4.Right : Dir4.Left);
            case 'hop':
                if (!this._springSafe(s, true)) return Math.abs(dx) > 8 ? InputFrame.stick(toward) : InputFrame.neutral;
                if (Math.abs(dx) <= f32(2)) return this._hop(nx.side);
                return InputFrame.stick(toward);
            case 'lift': {
                // up to the edge, then across only while the cage is level with it
                if (Math.abs(dx) < 8 && B.walkJoin(c.g, nx.side) === nx.to) return InputFrame.stick(nx.side > 0 ? Dir4.Right : Dir4.Left);
                if (Math.abs(dx) > f32(1)) return InputFrame.stick(toward);
                return InputFrame.neutral;
            }
        }
        return InputFrame.neutral;
    }

    // board 3: may it step into the spring column (or over the hole) now?
    _springSafe(s, hop) {
        const P = s.board.springs;
        if (P == null) return true;
        for (const p of s.springs) {
            if (p.dead) continue;
            if (hop) { if (p.m === S.SpringMode.Bounce ? p.x > f32(P.dropX - 110) : p.y < f32(s.c.feet + 40)) return false; }
            else if (p.m === S.SpringMode.Drop ? p.y < f32(s.c.feet + 4) : p.x > f32(P.dropX - f32(s.springSpeed * 1.1))) return false;
        }
        return true;
    }

    // ------------------------------------------------------------------ on a girder
    _walk(s) {
        const c = s.c, B = s.board;
        const g = c.g;
        const nx = this._next(s);
        this._gather(s, g);
        const threats = this._threats;
        const walk = s.walkSpeed;

        if (c.hammerLeft > 0) {
            // swing at whatever is near; otherwise go on (it cannot climb or hop while it swings)
            let near = null;
            for (const t of threats) if (Math.abs(t.dx) < 70 && t.delay < f32(0.2) && (near == null || Math.abs(t.dx) < Math.abs(near.dx))) near = t;
            if (near != null && c.hammerLeft > f32(0.6)) return InputFrame.stick(near.dx > 0 ? Dir4.Right : Dir4.Left);
            if (nx == null) return InputFrame.neutral;
            if (Math.abs(f32(nx.x - c.x)) > 1 || nx.kind === 'walk' || nx.kind === 'bolt') return this._act(s, nx);
            return InputFrame.stick(nx.kind === 'up' ? Dir4.Up : nx.kind === 'down' ? Dir4.Down : Dir4.None);
        }

        // the threats it has seen and had time to react to, soonest first
        let first = null, second = null;
        for (const t of threats) {
            if (!this._known(t) || isInf(t.tHit)) continue;
            if (first == null || t.tHit < first.tHit) { if (first != null) second = first; first = t; }
            else if (second == null || t.tHit < second.tHit) second = t;
        }

        // something about to land on this spot (down a ladder, off a girder end): step to the side
        // it will roll away from
        for (const t of threats)
            if (this._known(t) && t.delay > f32(0.02) && t.delay < f32(0.9) && Math.abs(t.dx) < 11) {
                const uphill = t.v > 0 ? -1 : 1;
                return InputFrame.stick(uphill > 0 ? Dir4.Right : Dir4.Left);
            }

        const atLadder = nx != null && nx.kind === 'up' && Math.abs(f32(nx.x - c.x)) <= f32(1.5);
        if (first == null || first.tHit > f32(1.3)) {
            if (nx == null) return InputFrame.neutral;
            const dir = sign(f32(nx.x - c.x)) || (nx.side | 0);
            // board 3: wait outside the spring column while a spring is coming down it
            if (B.springs && !this._springSafe(s, false)) {
                const col = B.springs.colX, ahead = f32(c.x + f32(dir * 14));
                const inCol = Math.abs(f32(c.x - col)) < 10;
                if (!inCol && Math.abs(f32(ahead - col)) < 10 && B.G[g].contains(col)) return InputFrame.neutral;
            }
            if (dir !== 0 && !atLadder && this._blocked(s, dir)) return InputFrame.neutral;
            // at the foot of the route ladder: a look up first, and wait while something will cross its top
            if (atLadder && this._topUnsafe(s, B.upLadderAt(g, c.x, f32(4)), c.feet)) return InputFrame.neutral;
            return this._act(s, nx);
        }

        // at the foot of the route ladder with time to get up it: up beats a hop
        if (atLadder && first.tHit > f32(f32(10 / s.climbSpeed) + f32(0.12))) return InputFrame.stick(Dir4.Up);

        // two converging: take a ladder if one can be reached in time
        const converge = second != null && (sign(second.dx) !== sign(first.dx) ? f32(second.tHit - first.tHit) < f32(0.7)
                                                                                : f32(second.tHit - first.tHit) < f32(0.45));
        if (converge) {
            let best = null, bt = FloatMax;
            for (const l of B.ladders) {
                if (l.broken || l.lo !== g) continue;
                const reach = f32(f32(f32(Math.abs(f32(l.x - c.x)) / walk) + f32(10 / s.climbSpeed)) + f32(0.1));
                if (reach < first.tHit && reach < bt) { bt = reach; best = l; }
            }
            if (best != null) {
                if (Math.abs(f32(best.x - c.x)) <= f32(1.5)) { this._ldir = -1; return InputFrame.stick(Dir4.Up); }
                return InputFrame.stick(best.x > c.x ? Dir4.Right : Dir4.Left);
            }
        }

        // a drum within three tiles and a hammer in reach: jump into the hammer
        if (!first.fire && first.gap <= this.hammerTiles && first.delay < f32(0.1))
            for (let i = 0; i < B.hammers.length; i++) {
                const h = B.hammers[i];
                if (s.hammerTaken[i] || h.girder !== g || Math.abs(f32(h.x - c.x)) > 12) continue;
                if (Math.abs(f32(h.x - c.x)) <= 3) return this._hop(0);
                return InputFrame.stick(h.x > c.x ? Dir4.Right : Dir4.Left);
            }

        // the hop: face it, run at it, jump at two tiles (+ this hop's timing error)
        if (first.delay > f32(0.05)) {
            if (Math.abs(first.dx) < 20) return InputFrame.stick(first.dx > 0 ? Dir4.Left : Dir4.Right);
            return InputFrame.neutral;
        }
        const face = first.dx > 0 ? 1 : -1;
        const closing = f32(Math.abs(first.rv) + walk);
        // the middle of the window a hop clears it in: a quarter second of closing, less the two half-widths
        // (a fast drum: about two tiles, the old rule; a fire-ball or a cart on your own belt: closer)
        const trigger = Math.max(f32(2), f32(f32(closing * f32(S.JumpV0 / S.JumpG)) - f32(S.ClimberHalfW + first.half)));
        const mem = this._mem(first.key);
        if (first.gap <= f32(trigger + f32(mem.err * closing))) return this._hop(face);
        return InputFrame.stick(face > 0 ? Dir4.Right : Dir4.Left);
    }

    // something ahead that is moving away slower than a walk: do not walk into its back
    _blocked(s, dir) {
        for (const t of this._threats) {
            if (!this._known(t) || t.delay > f32(0.2)) continue;
            if (sign(t.dx) !== dir) continue;
            const receding = f32(t.rv * t.dx) > 0;
            if (((receding && Math.abs(t.rv) < s.walkSpeed) || t.rv === 0) && t.gap < 26) return true;
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
        const c = s.c, B = s.board;
        const l = B.ladders[c.ladderIdx];
        const goUp = this._ldir < 0;
        // a drum or a fire-ball coming down this very ladder: back off it
        for (const d of s.drums)
            if (!d.dead && d.m === S.DrumMode.Ladder && d.ladderIdx === l.index && d.y < c.feet && this._mem(d).noticed)
                return InputFrame.stick(Dir4.Down);
        for (const f of s.fires)
            if (!f.dead && f.m === S.FireMode.Ladder && f.ladderIdx === l.index && this._mem(f).noticed) {
                const above = f.y < c.feet;
                return InputFrame.stick(above ? Dir4.Down : Dir4.Up);
            }
        if (!goUp) return InputFrame.stick(Dir4.Down);

        if (this._topUnsafe(s, l, c.feet)) return c.feet < f32(l.yTop + 15) ? InputFrame.stick(Dir4.Down) : InputFrame.neutral;
        return InputFrame.stick(Dir4.Up);
    }

    // will something on the girder at this ladder's top cross it before we are up and clear of it?
    // (a climber looks up the ladder: anything it has noticed counts, reaction time or not)
    _topUnsafe(s, l, feet) {
        if (l == null || l.hi === s.board.goal) return false;
        this._gather(s, l.hi);
        const toTop = f32(f32(feet - l.yTop) / s.climbSpeed);
        const exposed = Math.max(0, f32(f32(feet - f32(l.yTop + 15)) / s.climbSpeed));
        for (const t of this._threats) {
            if (!this._mem(t.key).noticed) continue;
            const dx = f32(t.x - l.x), adx = Math.abs(dx);
            if (t.v === 0 && adx > 9) continue;
            const toward = f32(t.v * dx) < 0 || adx < 9;
            if (!toward) continue;
            const tIn = t.v === 0 ? t.delay : f32(t.delay + f32(Math.max(0, f32(adx - 9)) / Math.abs(t.v)));
            const pass = t.v === 0 ? f32(0.6) : f32(18 / Math.abs(t.v));
            if (tIn < f32(toTop + f32(0.55)) && f32(tIn + pass) > f32(exposed - f32(0.05))) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ what it can see
    _gather(s, g) {
        const threats = this._threats;
        threats.length = 0;
        const c = s.c, B = s.board;
        const girder = B.G[g];
        const ground = s.beltV(B.G[c.g]);
        for (const d of s.drums) {
            if (d.dead) continue;
            const t = newThreat(d, d.kind === S.Kind.Cart ? S.CartHalf : S.DrumHalf);
            if (d.m === S.DrumMode.Roll && d.g === g) { t.x = d.x; t.v = s.speedOf(d); }
            else if (d.m === S.DrumMode.Fall && d.vy >= 0 && girder.contains(Math.max(f32(8.5), Math.min(f32(311.5), d.x))) && d.y < girder.surface(d.x)) {
                const surf = girder.surface(girder.clamp(d.x, f32(6)));
                const h = Math.max(0, f32(surf - d.y));
                const root = f32(Math.sqrt(f32(f32(d.vy * d.vy) + f32(f32(2 * S.DrumGravity) * h))));
                const tf = f32(f32(-d.vy + root) / S.DrumGravity);
                t.x = girder.clamp(f32(d.x + f32(d.vx * tf)), f32(6));
                t.v = d.kind === S.Kind.Cart ? 0 : f32((girder.downhill || sign(d.vx)) * s.rollSpeed); t.delay = tf;
            }
            else if (d.m === S.DrumMode.Ladder && B.ladders[d.ladderIdx].lo === g) {
                const l = B.ladders[d.ladderIdx];
                t.x = l.x; t.v = f32(girder.downhill * s.rollSpeed);
                t.delay = f32(Math.max(0, f32(l.yBottom - d.y)) / f32(s.rollSpeed * S.LadderDrumMul));
            }
            else continue;
            finish(t, c, ground);
            if (Math.abs(t.dx) <= this.look) threats.push(t);
        }
        for (const f of s.fires) {
            if (f.dead || f.m === S.FireMode.Hop) continue;
            const t = newThreat(f, S.FireHalf);
            if (f.m === S.FireMode.Ladder) {
                const l = B.ladders[f.ladderIdx];
                const end = f.ldir < 0 ? l.hi : l.lo;
                if (end !== g) continue;
                t.x = l.x; t.v = 0; t.delay = f32(Math.abs(f32((f.ldir < 0 ? l.yTop : l.yBottom) - f.y)) / f32(s.fireSpeedB * S.FireClimbMul));
            } else if (f.g === g) { t.x = f.x; t.v = f32(f.dir * s.fireSpeedB); }
            else continue;
            t.fire = true;
            finish(t, c, ground);
            if (Math.abs(t.dx) <= this.look) threats.push(t);
        }
        for (const t of threats) this._mem(t.key);
    }

    _mem(key) {
        let m = this._seen.get(key);
        if (m === undefined) {
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
