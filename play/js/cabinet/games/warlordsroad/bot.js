// THE NODE · world 1 · WARLORD'S ROAD · THE BOT: a modelled average player.
//
// It looks again every `reaction` s (+ up to `jitter`) and HOLDS the stick in between, like a person.
// Each look it picks the nearest foe (weighted: a step in depth counts double), walks to line up with it
// in depth and stand at blade's length, and mashes A for the combo (it finishes the three cuts `combo`
// of the time). It misjudges the distance by up to `aimErr` px. With the limits of a person on top:
//   notice   0.45   chance it sees a wind-up aimed at it and steps out of the lane
//   jumpCut  0.07   chance a look ends in a jump cut (B, then A in the air) when a foe is 26-50 px away
//   dash     0.12   chance it runs (tap tap) at a far foe and dash-strikes it
//   throw    0.8    chance it throws a grabbed foe (else it lets go)
//   ride     0.55   chance it goes for a riderless lizard it sees
//   thief    0.7    chance it chases a thief across the screen
// MAGIC late: it saves the pots for a boss (3+ pots), or spends them when it is low and crowded.
// With no one to fight it walks right, and it picks up what is dropped. Its dice are its own.
// `why` names the last decision (item / thief / ride / walk / evade / magic / approach), for traces.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { K, S, ATK, LANE_TOP, LANE_BOT, VIEW_W } from './world.js';
import { WarlordsRound } from './round.js';

const Phase = WarlordsRound.Phase;

export class WarlordsBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = 0.17; this.jitter = 0.13;
        this.notice = 0.45; this.combo = 0.72; this.aimErr = 7;
        this.jumpCut = 0.07; this.dash = 0.12; this.throwP = 0.8; this.ride = 0.55; this.thiefP = 0.7;
        this._clear();
    }

    get name() { return 'wr-average-player'; }

    reset(seed) { super.reset(seed); this._clear(); }

    _clear() {
        this._hx = 0; this._hy = 0; this._wait = 0; this._aLeft = 0; this._aT = 0; this._evade = 0;
        this._rideSeen = new Set(); this._rideYes = new Set(); this._thiefSeen = new Map();
        this._grabWait = -1; this._jumpA = false; this._dashing = false; this._campWait = 0; this._offset = 0;
    }

    think(sim, dt) {
        const r = sim;
        if (!r || !r.world) return InputFrame.neutral;
        if (r.p === Phase.Camp) return this._camp(r, dt);
        if (r.p !== Phase.Play) { this._hx = 0; this._hy = 0; this._aLeft = 0; this._wait = 0; return InputFrame.neutral; }
        const w = r.world, e = w.hero;
        const f = new InputFrame(this._hx, this._hy);

        // mid-combo mashing
        if (this._aLeft > 0 && e.st === S.Attack) {
            this._aT -= dt;
            if (this._aT <= 0 && !this.lastFrame.a) { f.a = true; this._aLeft--; this._aT = 0.09 + this.rng.nextDouble() * 0.1; }
        } else if (e.st !== S.Attack) this._aLeft = 0;
        // a jump cut in the air
        if (this._jumpA && e.st === S.Jump && e.z > 14 && !this.lastFrame.a) { f.a = true; this._jumpA = false; }
        // a grabbed foe: throw him
        if (e.st === S.Grab) {
            if (this._grabWait < 0) this._grabWait = 0.1 + this.rng.nextDouble() * 0.25;
            this._grabWait -= dt;
            if (this._grabWait <= 0 && !this.lastFrame.a && this._throwYes === undefined) this._throwYes = this.rng.nextDouble() < this.throwP;
            if (this._grabWait <= 0 && this._throwYes && !this.lastFrame.a) { f.a = true; this._throwYes = undefined; this._grabWait = -1; }
            f.x = 0; f.y = 0;
            return f;
        }
        this._grabWait = -1; this._throwYes = undefined;
        // running: strike when close
        if (e.st === S.Run) {
            const t = this._nearest(w, e);
            if (!t || Math.abs(t.x - e.x) < 34 || (t.x - e.x) * e.face < 0) { if (!this.lastFrame.a) f.a = true; }
            f.x = e.face; f.y = 0;
            return f;
        }

        this._wait -= dt;
        if (this._wait > 0) return f;
        this._wait = this.reaction + this.jitter * this.rng.nextDouble();
        return this._decide(w, e, f);
    }

    _decide(w, e, f) {
        this._hx = 0; this._hy = 0;
        if (e.st === S.Down || e.st === S.Dead || e.st === S.Air || e.st === S.Magic || e.st === S.Drop || e.st === S.Hurt) { f.x = 0; f.y = 0; return f; }
        const foes = [];
        let boss = null, near = 0, thief = null, liz = null;
        for (const a of w.actors) {
            if (a.dead) continue;
            if (a.kind === K.Lizard) { if (!a.rider && a.st !== S.Flee) liz = liz || a; continue; }
            if (a.kind === K.Thief) { if (a.st !== S.Flee && a.drops < 2 && a.x > w.cam && a.x < w.cam + VIEW_W) thief = thief || a; continue; }
            if (a.hp <= 0 || a.st === S.Dead) continue;
            foes.push(a);
            if (a.boss) boss = a;
            if (Math.abs(a.x - e.x) < 70 && Math.abs(a.y - e.y) < 24) near++;
        }

        // MAGIC, late
        if (w.pots > 0 && !this.lastFrame.a && !this.lastFrame.b && (e.st === S.Idle || e.st === S.Walk)) {
            const low = e.hp <= e.maxHp * 0.3;
            let cast = false;
            if (boss && boss.hp > boss.maxHp * 0.35 && w.pots >= 3 && Math.abs(boss.x - e.x) < 150) cast = this.rng.nextDouble() < 0.25;
            else if (low && near >= 2) cast = this.rng.nextDouble() < 0.45;
            else if (w.pots >= 6 && near >= 3) cast = this.rng.nextDouble() < 0.3;
            else if (w.stageIdx === 2 && boss && w.pots >= 1 && boss.hp > boss.maxHp * 0.3) cast = this.rng.nextDouble() < 0.15;
            if (cast) { this.why = 'magic'; f.a = true; f.b = true; f.x = 0; f.y = 0; return f; }
        }

        // something dropped: pick it up when it is safe (meat when hurt)
        for (const it of w.items) {
            if (it.z > 4 || it.x < w.cam + 16 || it.x > w.cam + VIEW_W - 16) continue;
            if (it.kind === 1 && e.hp > e.maxHp * 0.75 && near > 0) continue;
            if (near > 1) continue;
            this.why = 'item'; return this._goTo(f, e, it.x, it.y);
        }

        // a thief: chase and cut it
        if (thief) {
            if (!this._thiefSeen.has(thief.id)) this._thiefSeen.set(thief.id, this.rng.nextDouble() < this.thiefP);
            if (this._thiefSeen.get(thief.id) && near === 0) {
                const dx = thief.x - e.x, dy = thief.y - e.y;
                if (Math.abs(dy) < 7 && Math.abs(dx) < 40 && dx * e.face > 0) { f.a = !this.lastFrame.a; return f; }
                this.why = 'thief'; return this._goTo(f, e, thief.x - Math.sign(dx || 1) * 20 + thief.face * 16, thief.y);
            }
        }

        // a riderless lizard: take it
        if (liz && !e.mount && near === 0) {
            if (!this._rideSeen.has(liz.id)) { this._rideSeen.add(liz.id); if (this.rng.nextDouble() < this.ride) this._rideYes.add(liz.id); }
            if (this._rideYes.has(liz.id)) { this.why = 'ride'; return this._goTo(f, e, liz.x, liz.y); }
        }

        const t = this._nearest(w, e, foes);
        if (!t) {
            // nobody here: walk on (or wait mid-screen while the next ones walk in)
            this.why = 'walk';
            if (w.locked) return this._goTo(f, e, w.cam + VIEW_W / 2, 170);
            f.x = 1; f.y = e.y > 176 ? 1 : e.y < 160 ? -1 : 0;
            this._hx = f.x; this._hy = f.y;
            return f;
        }

        // a blow is coming: step out of its lane
        for (const a of foes) {
            if (a.st !== S.Attack || a.ph !== 0 || !a.atk) continue;
            const at = a.atk, rel = (e.x - a.x) * a.face;
            const inReach = at.wave ? Math.abs(e.x - a.x) < at.x1 + 8 : rel > at.x0 - 12 && rel < at.x1 + 14;
            if (inReach && Math.abs(e.y - a.y) <= at.dy + 3 && this.rng.nextDouble() < this.notice) {
                if (at.wave && this.rng.nextDouble() < 0.5) { f.b = !this.lastFrame.b; return f; }       // jump the shock
                this.why = 'evade';
                const up = e.y > (LANE_TOP + LANE_BOT) / 2;
                f.y = up ? 1 : -1;
                f.x = e.x < a.x ? -1 : 1;
                this._hx = f.x; this._hy = f.y;
                this._wait = 0.3;
                return f;
            }
        }

        // line up and cut
        const side = e.x <= t.x ? -1 : 1;
        const kdw = t.boss ? 12 : t.mount ? 12 : 0;
        if (this._offset === 0 || this.rng.nextDouble() < 0.3) this._offset = (this.rng.nextDouble() - 0.5) * 2 * this.aimErr;
        const want = t.x + side * (24 + kdw + this._offset);
        const dx = t.x - e.x, dy = t.y - e.y, adx = Math.abs(dx);
        const reach = e.mount ? ATK.whip.x1 : ATK.a1.x1;
        if (Math.abs(dy) <= 5 && adx >= 6 && adx <= reach + kdw - 2) {
            if ((dx > 0 ? 1 : -1) !== e.face) { f.x = dx > 0 ? 1 : -1; this._hx = 0; return f; }     // turn first
            if (!this.lastFrame.a) {
                f.a = true;
                this._aLeft = this.rng.nextDouble() < this.combo ? 2 : this.rng.nextDouble() < 0.5 ? 1 : 0;
                this._aT = 0.1 + this.rng.nextDouble() * 0.08;
            }
            f.x = 0; f.y = 0;
            return f;
        }
        // a jump cut from a little way off
        if (Math.abs(dy) <= 4 && adx > 26 && adx < 50 && (dx > 0 ? 1 : -1) === e.face && !e.mount && this.rng.nextDouble() < this.jumpCut) {
            f.b = !this.lastFrame.b; f.x = dx > 0 ? 1 : -1; this._jumpA = true; return f;
        }
        // run at a far one
        if (Math.abs(dy) <= 5 && adx > 90 && !e.mount && this.rng.nextDouble() < this.dash) {
            const d = dx > 0 ? 1 : -1;
            this._queued.push(new InputFrame(0, 0), new InputFrame(d, 0), new InputFrame(d, 0));
            f.x = d; f.y = 0; this._hx = d; this._hy = 0;
            return f;
        }
        this.why = 'approach';
        return this._goTo(f, e, want, t.y);
    }

    _goTo(f, e, x, y) {
        const dx = x - e.x, dy = y - e.y;
        f.x = Math.abs(dx) > 4 ? (dx > 0 ? 1 : -1) : 0;
        f.y = Math.abs(dy) > 2.5 ? (dy > 0 ? -1 : 1) : 0;
        this._hx = f.x; this._hy = f.y;
        return f;
    }

    _nearest(w, e, list) {
        let best = null, bd = 1e9;
        const src = list || w.actors;
        for (const a of src) {
            if (a.dead || a.kind === K.Lizard || a.kind === K.Thief || a.hp <= 0 || a.st === S.Dead) continue;
            if (a.x < w.cam - 40 || a.x > w.cam + VIEW_W + 40) continue;
            const d = Math.abs(a.x - e.x) + 2 * Math.abs(a.y - e.y) + (a.st === S.Down || a.st === S.GetUp || a.st === S.Air ? 40 : 0);
            if (d < bd) { bd = d; best = a; }
        }
        return best;
    }

    // the camp: kick the thieves that come for the pack
    _camp(r, dt) {
        const c = r.camp;
        if (!c) return InputFrame.neutral;
        this._campWait -= dt;
        if (this._campWait > 0) return InputFrame.neutral;
        this._campWait = this.reaction + this.jitter * this.rng.nextDouble();
        for (const th of c.thieves) {
            if ((th.st === 1 && th.x < 258 && th.x > 206) || th.st === 2) {
                if (!this.lastFrame.a && this.rng.nextDouble() < 0.75) { const f = new InputFrame(); f.a = true; return f; }
            }
        }
        return InputFrame.neutral;
    }
}

