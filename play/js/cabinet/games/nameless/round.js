// THE NODE · the cabinet with no name · THE ROUND (ICabinetSim). Deterministic, headless, no DOM.
//
// orbit -> pulse -> shift -> resonance -> descend, five levels (levels.js), then THE WIN.
//
//   the probe     a small triangle on one of the concentric rings. Stick left/right orbits it (right = counter-
//                 clockwise, so from its start at 6 o'clock "right" goes right). B = SHIFT: outer -> ... -> inner
//                 -> outer. A = PULSE: hits the node the probe is aligned with (within the tolerance).
//   resonance     the level's eight symbols (seq) must be pulsed in order; any node showing the wanted symbol
//                 counts. A right node = +1 resonance. A WRONG node slips it back one (mercy: not on the third
//                 credit). An empty pulse is only a miss. Full resonance opens the CORE: every ring decelerates to
//                 stillness, the clock stops, and SHIFT on the inner ring DESCENDS to the next level.
//   failure       there are no lives, only the level clock. It runs out: the round is lost.
//   the win       full resonance on level V -> everything aligns -> stillness -> the vesica opens and the geometry
//                 contracts through it -> THE GATE draws itself -> the score table's blank top row fills A·V·R ->
//                 only then the Card (result Won) and Over. The renderer draws every beat of it from `p` and
//                 `phaseTime`; the sim only keeps the timeline.
//
// FIXED TICK: step(dt) accumulates and runs whole 1/60 s ticks (the build spec), so a round plays the same at
// any host frame rate; a button press between ticks is latched until the next tick. No dice are rolled at all
// (the five levels have no random gameplay); `seed` is kept for the record.
//
// MERCY: knobs (spec.js) ease per round lost on this cabinet, and THE THIRD CREDIT CANNOT BE LOST: whatever
// CreditInfo the host hands in, reset() re-makes it with unlosable at credit 3 (UNLOSABLE_AT), and an unlosable
// round has no clock and no roll-back. Winnable by skill on every credit.
import { CabinetState, RoundResult, SoundCue, CueBuffer, Pad, CreditInfo, fmt } from '../../sdk/index.js';
import { LEVEL_DATA, LEVELS } from './levels.js';

export const UNLOSABLE_AT = 3;
export const CX = 160, CY = 120;
export const STEP = 1 / 60;
const D = LEVEL_DATA.defaults;

export const Phase = Object.freeze({
    Idle: 0, Ready: 1, Play: 2, Open: 3, Descend: 4, Dying: 5,
    Align: 6, Still: 7, Vesica: 8, Vanish: 9, Gate: 10, Hold: 11, Table: 12, Card: 13, Over: 14,
});
export const PhaseNames = Object.freeze(['Idle', 'Ready', 'Play', 'Open', 'Descend', 'Dying', 'Align', 'Still', 'Vesica', 'Vanish', 'Gate', 'Hold', 'Table', 'Card', 'Over']);

// how long each beat lasts (seconds)
export const DUR = Object.freeze({
    firstReady: 2.6, ready: 1.8, descend: 2.4, dying: 2.4,
    align: 1.4,        // 1. full resonance: everything eases into alignment, rotation stops
    still: 1.5,        // 2. stillness
    vesica: 2.8,       // 3. the vesica opens (0.8 s), the geometry contracts through it (2 s)
    vanish: 0.8,       //    the vesica closes to a point
    gate: 2.6,         // 4. THE GATE draws itself, line by line
    hold: 1.8,         //    ...and holds (its fill comes up softly)
    table: 3.4,        // 5. the table: appears 0-0.8, the score types in 0.8-1.2, A 1.6, V 2.0, R 2.4, holds
    cardWon: 2.6, cardLost: 3.6,
});
export const TABLE_T = Object.freeze({ appear: 0.8, scoreEnd: 1.2, letter0: 1.6, letterStep: 0.4 });

export function norm(a) { a %= 360; return a < 0 ? a + 360 : a; }
// shortest signed turn from `from` to `to`, degrees in (-180, 180]
export function dAng(from, to) { let d = (to - from) % 360; if (d > 180) d -= 360; else if (d <= -180) d += 360; return d; }
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;

export class NamelessRound {
    constructor() {
        this.p = Phase.Idle; this.phaseTime = 0;
        this.levelIndex = 0; this.level = null; this.levelTime = 0;
        this.rings = []; this.nodes = [];
        this.probe = { ring: 0, a: 90, shiftAt: -9, fromRing: 0 };
        this.seq = []; this.idx = 0;
        this.timed = true; this.timeLeft = 0; this.timeMax = 0;
        this.coherence = 0;          // 0 loose .. 1 a perfect mandala (eases toward idx / seq.length)
        this.spinNow = 1;            // 1 turning .. 0 still (the core opening, the ending)
        this.phaseAB = 0;            // level V: 0 = face A, 1 = face B, smooth in between
        this.events = [];            // the last pulses: { t, kind: 'hit'|'wrong'|'miss', ring, a, node, twin }
        this.echoAt = -1;            // level V: when the negative-space Gate passes (renderer only)
        this.openAt = -1; this.bonusAt = -9; this.lastBonus = 0;
        this.score = 0; this.streak = 0;
        this.hits = 0; this.wrongs = 0; this.misses = 0; this.doubles = 0; this.shifts = 0; this.pulses = 0;
        this.levelTimes = [];
        this.credit = null; this.mercy = false; this.guide = 0; this.rollback = 1;
        this.spinK = 1; this.tolBonus = 0; this.timeK = 1; this.targets = 8; this.probeSpeed = D.probeSpeed;
        this.motion = 1; this._motionTarget = 1;
        this.seed = 0;
        this._cues = new CueBuffer(); this._result = RoundResult.None; this._ticks = 0;
        this._acc = 0; this._x = 0; this._padA = false; this._padB = false;
        this._lastPulse = -9; this._lastShift = -9; this._mig = [];
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Play: case Phase.Open: return CabinetState.Playing;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            case Phase.Idle: return CabinetState.Idle;
            default: return CabinetState.Interlude;
        }
    }
    get result() { return this._result; }
    get lives() { return 1; }
    get time() { return this._ticks * STEP; }
    get cues() { return this._cues; }
    get won() { return this._result === RoundResult.Won; }
    get levelNumber() { return this.levelIndex + 1; }
    get resonance() { return this.idx; }
    get resonanceMax() { return this.seq.length; }
    get want() { return this.idx < this.seq.length ? this.seq[this.idx] : null; }
    get ending() { return this.p >= Phase.Align && this.p <= Phase.Card && this.levelIndex === LEVELS.length - 1 && this._result !== RoundResult.Lost; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' level ' + this.levelNumber + '/' + LEVELS.length + ' res ' + this.idx + '/' + this.seq.length + ' score ' + this.score +
            ' ' + fmt(this.time, 1) + 's hits ' + this.hits + ' wrong ' + this.wrongs + ' miss ' + this.misses + ' doubles ' + this.doubles +
            ' shifts ' + this.shifts + ' (' + this.levelTimes.map((t) => fmt(t, 1) + 's').join(' ') + ')';
    }

    reset(seed, credit, k) {
        const c = credit || CreditInfo.make(1, 0);
        this.credit = CreditInfo.make(c.number, c.lossesBefore, UNLOSABLE_AT);   // THE THIRD CREDIT CANNOT BE LOST
        this.mercy = this.credit.unlosable;
        this.seed = seed | 0;
        const get = (n, d) => (k && k.has && k.has(n) ? k.get(n) : d);
        this.spinK = get('spin', 1);
        this.tolBonus = get('tolerance', 0);
        this.timeK = get('time', 1);
        this.targets = Math.max(4, Math.min(8, Math.round(get('targets', 8))));
        this.rollback = this.mercy ? 0 : Math.round(get('rollback', 1));
        this.guide = this.mercy ? 2 : Math.max(0, Math.min(2, Math.round(get('guide', 0))));
        this.probeSpeed = get('probeSpeed', D.probeSpeed);
        this.timed = !this.mercy && this.timeK > 0;
        this.score = 0; this.streak = 0; this.hits = 0; this.wrongs = 0; this.misses = 0; this.doubles = 0; this.shifts = 0; this.pulses = 0;
        this.levelTimes = []; this.echoAt = -1; this.lastBonus = 0; this.bonusAt = -9;
        this._cues.resetTotals();
        this._result = RoundResult.None; this._ticks = 0; this._acc = 0;
        this._x = 0; this._padA = false; this._padB = false; this._lastPulse = -9; this._lastShift = -9;
        this._loadLevel(0);
        this._go(Phase.Ready);
    }

    // the host's reduced-motion setting: the rings turn slower (1 = full, eased over a second)
    setMotion(k) { this._motionTarget = Math.max(0.3, Math.min(1, +k || 1)); }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (!(dt > 0)) return;
        if (dt > 0.1) dt = 0.1;
        if (input != null) {
            this._x = input.x;
            if (input.pressed(Pad.A)) this._padA = true;
            if (input.pressed(Pad.B)) this._padB = true;
        }
        this._acc += dt;
        while (this._acc >= STEP - 1e-9) {
            this._acc -= STEP;
            this._tick(STEP);
            if (this.p === Phase.Over) { this._acc = 0; break; }
        }
    }

    // ------------------------------------------------------------------ the field
    symOf(n) {
        if (!this.level.phase) return n.sym;
        return this.phaseAB < 0.5 ? n.sym : n.symB;
    }

    tolFor(ring) {
        const R = this.rings[ring] ? this.rings[ring].r : D.tolRefRadius;
        return (this.level.tol + this.tolBonus) * Math.min(D.tolMaxScale, D.tolRefRadius / R);
    }

    // the node (index) nearest angle `a` on `ring`, within `tol` degrees, or -1. Nodes between rings don't count.
    nearest(ring, a, tol) {
        let best = -1, bd = tol;
        for (let i = 0; i < this.nodes.length; i++) {
            const n = this.nodes[i];
            if (n.travel || n.ring !== ring) continue;
            const d = Math.abs(dAng(a, n.a));
            if (d <= bd) { bd = d; best = i; }
        }
        return best;
    }

    twinAngle() { return norm(-this.probe.a); }

    _loadLevel(i) {
        const L = LEVELS[i];
        this.level = L; this.levelIndex = i; this.levelTime = 0;
        this.rings = L.rings.map((r) => ({ r: r.r, spin: r.spin, angle: 0 }));
        this.nodes = L.nodes.map((n) => ({
            id: n.id, sym: n.sym, symB: n.symB || n.sym, ring: n.ring, home: n.ring, r: L.rings[n.ring].r, a: n.a,
            travel: null, hitAt: -9, wrongAt: -9, alignFrom: 0, alignTo: 0,
        }));
        this._mig = (L.migrate || []).map((m) => ({ node: this.nodes.findIndex((n) => n.id === m.node), path: m.path, period: m.period, offset: m.offset }));
        this.probe.ring = 0; this.probe.a = 90; this.probe.shiftAt = -9; this.probe.fromRing = 0;
        this.seq = L.seq.slice(0, this.targets); this.idx = 0;
        this.timeMax = this.timed ? L.time * this.timeK : 0; this.timeLeft = this.timeMax;
        this.spinNow = 1; this.phaseAB = 0; this.coherence = 0; this.events = []; this.openAt = -1; this.echoAt = -1;
    }

    _go(p) { this.p = p; this.phaseTime = 0; }

    _tick(dt) {
        this._ticks++;
        this.phaseTime += dt;
        this.motion += (this._motionTarget - this.motion) * Math.min(1, dt);
        const P = Phase;
        let target = this.seq.length ? this.idx / this.seq.length : 0;
        if (this.p === P.Dying) target = 0;
        else if (this.p >= P.Align && this.p <= P.Card && this.ending) target = 1;
        this.coherence += (target - this.coherence) * Math.min(1, dt * 2.5);

        switch (this.p) {
            case P.Ready:
                this._padA = this._padB = false;
                if (this.phaseTime >= (this.levelIndex === 0 ? DUR.firstReady : DUR.ready)) {
                    this._go(P.Play);
                    if (this.levelIndex === 0) this._cues.emit(SoundCue.Start);
                }
                break;
            case P.Play: case P.Open:
                this._play(dt);
                break;
            case P.Descend:
                this._padA = this._padB = false;
                if (this.phaseTime >= DUR.descend) { this._loadLevel(this.levelIndex + 1); this._go(P.Ready); }
                break;
            case P.Dying:
                this.spinNow = Math.max(0, this.spinNow - dt / 1.5);
                this._turn(dt);
                if (this.phaseTime >= DUR.dying) { this._result = RoundResult.Lost; this._go(P.Card); }
                break;
            case P.Align: {
                const u = smooth(this.phaseTime / DUR.align);
                this.spinNow = 1 - u;
                for (const n of this.nodes) {
                    n.a = norm(n.alignFrom + dAng(n.alignFrom, n.alignTo) * u);
                    if (n.travel) { n.r = lerp(n.r, this.rings[n.travel.to].r, Math.min(1, dt * 4)); }
                }
                this.probe.a = norm(this._probeFrom + dAng(this._probeFrom, 90) * u);
                if (this.phaseTime >= DUR.align) {
                    for (const n of this.nodes) if (n.travel) { n.ring = n.travel.to; n.r = this.rings[n.ring].r; n.travel = null; }
                    this._go(P.Still);
                }
                break;
            }
            case P.Still: if (this.phaseTime >= DUR.still) this._go(P.Vesica); break;
            case P.Vesica: if (this.phaseTime >= DUR.vesica) this._go(P.Vanish); break;
            case P.Vanish: if (this.phaseTime >= DUR.vanish) this._go(P.Gate); break;
            case P.Gate: if (this.phaseTime >= DUR.gate) this._go(P.Hold); break;
            case P.Hold: if (this.phaseTime >= DUR.hold) this._go(P.Table); break;
            case P.Table:
                if (this.phaseTime >= DUR.table) {
                    this._result = RoundResult.Won;                   // only now: the Gate is drawn and A·V·R is in
                    this._cues.emit(SoundCue.Win);
                    this._go(P.Card);
                }
                break;
            case P.Card:
                this._padA = this._padB = false;
                if (this.phaseTime >= (this._result === RoundResult.Won ? DUR.cardWon : DUR.cardLost)) this._go(P.Over);
                break;
        }
    }

    // rings and nodes turn (spinNow and the mercy/motion scales applied)
    _turn(dt) {
        const k = this.spinK * this.spinNow * this.motion;
        if (k === 0) return;
        for (const r of this.rings) r.angle = norm(r.angle + r.spin * k * dt);
        for (const n of this.nodes) {
            if (n.travel) n.a = norm(n.a + lerp(this.rings[n.travel.from].spin, this.rings[n.travel.to].spin, n.travel.u) * k * dt);
            else n.a = norm(n.a + this.rings[n.ring].spin * k * dt);
        }
    }

    _migrate() {
        const travel = D.migrateTravel;
        for (const m of this._mig) {
            const n = this.nodes[m.node];
            const T = this.levelTime - m.offset;
            if (T < 0 || m.node < 0) continue;
            const k = Math.floor(T / m.period), within = T - k * m.period, len = m.path.length;
            const from = m.path[k % len], to = m.path[(k + 1) % len];
            if (within >= m.period - travel) {
                const u = (within - (m.period - travel)) / travel;
                n.travel = { from, to, u };
                n.ring = -1;
                n.r = lerp(this.rings[from].r, this.rings[to].r, smooth(u));
            } else {
                n.travel = null; n.ring = from; n.r = this.rings[from].r;
            }
        }
    }

    _phaseValue(t) {
        const ph = this.level.phase, P = ph.period, B = ph.blend, u = t % P, half = P / 2;
        if (u < half - B) return 0;
        if (u < half) return smooth((u - (half - B)) / B);
        if (u < P - B) return 1;
        return 1 - smooth((u - (P - B)) / B);
    }

    _play(dt) {
        const P = Phase, open = this.p === P.Open;
        this.levelTime += dt;
        if (open) this.spinNow = Math.max(0, this.spinNow - dt / D.openSpinDown);
        else this.spinNow = 1;
        if (!open) this._migrate();
        this._turn(dt);
        if (this.level.phase && !open) this.phaseAB = this._phaseValue(this.levelTime);
        if (!open && this.timed) {
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.levelTimes.push(this.levelTime);
                this._cues.emit(SoundCue.Die);
                this._go(P.Dying);
                return;
            }
        }
        const x = this._x, s = x > 0.2 || x < -0.2 ? Math.max(-1, Math.min(1, x)) : 0;
        this.probe.a = norm(this.probe.a - s * this.probeSpeed * dt);
        const t = this.time;
        if (this._padB) { this._padB = false; if (t - this._lastShift >= D.shiftCooldown) this._shift(t); }
        if (this.p !== P.Play && this.p !== P.Open) return;     // descended
        if (this._padA) { this._padA = false; if (!open && t - this._lastPulse >= D.pulseCooldown) this._pulse(t); }
    }

    _shift(t) {
        this._lastShift = t;
        const pr = this.probe;
        if (this.p === Phase.Open && pr.ring === this.rings.length - 1) {
            this._cues.emit(SoundCue.Tick);
            this._go(Phase.Descend);
            return;
        }
        pr.fromRing = pr.ring;
        pr.ring = (pr.ring + 1) % this.rings.length;
        pr.shiftAt = t;
        this.shifts++;
        this._cues.emit(SoundCue.Tick);
    }

    _event(t, kind, a, node, twin) {
        this.events.push({ t, kind, ring: this.probe.ring, a, node, twin: !!twin });
        if (this.events.length > 12) this.events.shift();
    }

    _pulse(t) {
        this._lastPulse = t;
        this.pulses++;
        const ring = this.probe.ring, tol = this.tolFor(ring), want = this.want;
        const angles = [this.probe.a];
        if (this.level.mirror) angles.push(this.twinAngle());
        const found = angles.map((a) => this.nearest(ring, a, tol));
        let k = -1;
        for (let j = 0; j < found.length; j++) if (found[j] >= 0 && this.symOf(this.nodes[found[j]]) === want) { k = j; break; }
        if (k >= 0) {
            this._hit(t, found[k], angles[k], k === 1);
            // correspondence: the twin on the NEXT symbol at the same instant counts too
            const o = found.length > 1 ? found[1 - k] : -1;
            if (this.p === Phase.Play && this.idx < this.seq.length && o >= 0 && o !== found[k] && this.symOf(this.nodes[o]) === this.want) {
                this._hit(t, o, angles[1 - k], k === 0);
                this.doubles++;
                this.score += 250;
            }
            if (this.idx >= this.seq.length) this._complete(t);
            return;
        }
        const w = found.find((i) => i >= 0);
        this.streak = 0;
        this._cues.emit(SoundCue.Miss);
        if (w !== undefined) {
            this.wrongs++;
            this.nodes[w].wrongAt = t;
            if (this.rollback > 0 && this.idx > 0) this.idx--;
            this._event(t, 'wrong', angles[found.indexOf(w)], w, found.indexOf(w) === 1);
        } else {
            this.misses++;
            this._event(t, 'miss', this.probe.a, -1, false);
        }
    }

    _hit(t, i, a, twin) {
        const n = this.nodes[i];
        n.hitAt = t;
        this.idx++; this.hits++; this.streak++;
        this.score += 100 + 25 * (this.streak - 1);
        this._cues.emit(SoundCue.Hit);
        this._event(t, 'hit', a, i, twin);
        const L = this.level;
        if (L.echoAtResonance && this.echoAt < 0 && this.idx >= L.echoAtResonance) this.echoAt = t + 1.2;
    }

    _complete(t) {
        this.levelTimes.push(this.levelTime);
        const bonus = 1000 * this.level.number + (this.timed ? 10 * Math.floor(this.timeLeft) : 0);
        this.score += bonus; this.lastBonus = bonus; this.bonusAt = t;
        this._cues.emit(SoundCue.Bonus);
        if (this.levelIndex === LEVELS.length - 1) { this._beginAlign(); return; }
        this.openAt = t;
        this._go(Phase.Open);
    }

    // 1. FULL RESONANCE: every ring's nodes ease to a regular polygon, symmetric about the vertical axis
    _beginAlign() {
        const byRing = new Map();
        for (const n of this.nodes) {
            const r = n.travel ? n.travel.to : n.ring;
            if (!byRing.has(r)) byRing.set(r, []);
            byRing.get(r).push(n);
        }
        for (const list of byRing.values()) {
            list.sort((p, q) => p.a - q.a);
            const s = 360 / list.length;
            let sx = 0, sy = 0;
            list.forEach((n, j) => { const v = (n.a - j * s) * Math.PI / 180; sx += Math.cos(v); sy += Math.sin(v); });
            const mean = Math.atan2(sy, sx) * 180 / Math.PI;
            const phi = 270 + Math.round(dAng(270, mean) / (s / 2)) * (s / 2);
            list.forEach((n, j) => { n.alignFrom = n.a; n.alignTo = norm(phi + j * s); });
        }
        this._probeFrom = this.probe.a;
        this._go(Phase.Align);
    }

    // ------------------------------------------------------------------ the Lab
    collectStats(into) {
        const add = (k, v) => { into[k] = (into[k] || 0) + v; };
        add('levels', this.won ? LEVELS.length : this.levelIndex);
        add('hits', this.hits); add('wrong', this.wrongs); add('miss', this.misses); add('doubles', this.doubles); add('shifts', this.shifts);
        for (let i = 0; i < LEVELS.length; i++) add('L' + (i + 1) + 's', i < this.levelTimes.length ? this.levelTimes[i] : 0);
        if (this._result === RoundResult.Lost) add('lostAtL' + this.levelNumber, 1);
    }

    // ------------------------------------------------------------------ test hooks (the page's screenshot run)
    debugJump(levelIndex) {
        this._loadLevel(Math.max(0, Math.min(LEVELS.length - 1, levelIndex | 0)));
        this._go(Phase.Ready);
    }
}

NamelessRound.Phase = Phase;
