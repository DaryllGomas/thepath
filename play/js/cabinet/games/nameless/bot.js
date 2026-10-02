// THE NODE · the cabinet with no name · THE BOT: a modelled first-time player (and a precise one for the checks).
//
// It plays only through the InputFrame a person makes (stick x, A = PULSE, B = SHIFT), reads the field, never
// writes to it, and rolls only its own dice (this.rng). It knows nothing of the renderer's hints (guidance).
//   search   each new symbol costs it a moment to find on the field (longer on later levels: more to read)
//   choose   it usually picks the nearest node showing the symbol (counting ring shifts), sometimes another,
//            and now and then misreads a look-alike (hexagon/pentagon, diamond/square, circle/spiral...)
//   shift    it taps B until it is on the node's ring, one tap at a time
//   steer    it looks again every 0.12-0.24 s and holds the stick between looks, so it over- and under-shoots
//   pulse    it presses A when the node looks close enough: within tol x `aim`, a new `aim` each try, so
//            some presses are early/late (an empty miss, or a wrong node if one is near)
//   descend  when the core opens it takes a beat, then taps B down to the inner ring and through
//   profiles 'first' (a first-timer: the Lab's difficulty measure) and 'average' (someone who understands it)
// profile 'oracle' is the build spec's "intentionally stupid" bench bot: no delays, perfect reads, presses at
// 0.6 x tolerance. It proves every level solvable; it is not the difficulty measure.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { Phase, dAng } from './round.js';

const LOOKALIKE = { hexagon: 'pentagon', pentagon: 'hexagon', diamond: 'square', square: 'diamond', circle: 'spiral', spiral: 'circle', triangle: 'diamond' };

export const BOT_PROFILES = Object.freeze({
    // someone who walked up to it tonight: the Lab's difficulty measure (credit 1 is always a first-timer)
    first: {
        searchMin: 1.4, searchMax: 3.4, searchPerLevel: 0.6,
        lookMin: 0.15, lookMax: 0.3,
        aimMin: 0.35, aimMax: 1.5,
        misread: 0.1, pickNearest: 0.55,
        leadMax: 0.4,
        afterPulseMin: 0.35, afterPulseMax: 0.8,
        shiftGapMin: 0.25, shiftGapMax: 0.5,
        openWaitMin: 0.6, openWaitMax: 1.6,
        wrongWay: 0.12,
    },
    // someone who understands it (the spec's 4-5 minute player)
    average: {
        searchMin: 0.9, searchMax: 2.3, searchPerLevel: 0.35,
        lookMin: 0.13, lookMax: 0.26,
        aimMin: 0.35, aimMax: 1.35,
        misread: 0.07, pickNearest: 0.65,
        leadMax: 0.5,
        afterPulseMin: 0.3, afterPulseMax: 0.7,
        shiftGapMin: 0.22, shiftGapMax: 0.45,
        openWaitMin: 0.5, openWaitMax: 1.2,
        wrongWay: 0.04,
    },
    oracle: {
        searchMin: 0, searchMax: 0, searchPerLevel: 0,
        lookMin: 1 / 60, lookMax: 1 / 60,
        aimMin: 0.6, aimMax: 0.6,
        misread: 0, pickNearest: 1,
        leadMax: 0,
        afterPulseMin: 0.36, afterPulseMax: 0.36,
        shiftGapMin: 0.18, shiftGapMax: 0.18,
        openWaitMin: 0.05, openWaitMax: 0.05,
        wrongWay: 0,
    },
});

export class NamelessBot extends CabinetBotBase {
    constructor(profile = 'first') {
        super();
        this.profile = typeof profile === 'string' ? profile : 'custom';
        Object.assign(this, BOT_PROFILES[typeof profile === 'string' ? profile : 'first'], typeof profile === 'object' ? profile : {});
        this._clear();
    }

    get name() { return 'nl-' + this.profile + (this.profile === 'first' ? '-timer' : this.profile === 'average' ? '-player' : ''); }

    reset(seed) { super.reset(seed); this._clear(); }

    _clear() {
        this._planIdx = -1; this._planLevel = -1; this._think = 0; this._node = -1; this._want = null;
        this._look = 0; this._dir = 0; this._aim = 1; this._cool = 0; this._gap = 0; this._wait = 0; this._armed = false; this._lead = 0;
        this._wrongs = -1; this._confused = 0;
    }

    tapB() {
        const f = new InputFrame(0, 0, false, true);
        if (this.lastFrame.b) { this._queued.push(f); return InputFrame.neutral; }
        return f;
    }

    think(sim, dt) {
        if (!sim || !sim.level) return InputFrame.neutral;
        if (sim.p === Phase.Open) return this._descend(sim, dt);
        this._armed = false;
        if (sim.p !== Phase.Play) { this._planIdx = -1; return InputFrame.neutral; }

        // a new symbol to find
        if (this._planIdx !== sim.idx || this._planLevel !== sim.levelIndex) {
            this._planIdx = sim.idx; this._planLevel = sim.levelIndex;
            this._think = this.range(this.searchMin, this.searchMax) + this.searchPerLevel * sim.levelIndex;
            this._node = -1; this._aim = this.range(this.aimMin, this.aimMax);
            this._lead = this.range(0, this.leadMax);
            // right = counter-clockwise: now and then the thumb goes the wrong way first
            this._confused = this.chance(this.wrongWay) ? this.range(0.3, 0.7) : 0;
        }
        // a wrong node (resonance slipped, or not, on the unlosable credit): it looks again
        if (this._wrongs !== sim.wrongs) {
            if (this._wrongs >= 0 && this._node >= 0) { this._node = -1; this._think = Math.max(this._think, this.range(this.searchMin, this.searchMax) * 0.6); }
            this._wrongs = sim.wrongs;
        }
        if (this._think > 0) { this._think -= dt; return InputFrame.neutral; }
        if (this._cool > 0) { this._cool -= dt; return InputFrame.neutral; }

        // is the chosen node still a good idea? (level V turns faces; a node may be between rings)
        if (this._node >= 0) {
            const n = sim.nodes[this._node];
            if (!n.travel && sim.symOf(n) !== this._want) this._node = -1;
        }
        if (this._node < 0) {
            this._choose(sim);
            if (this._node < 0) return InputFrame.neutral;          // not on the field right now: wait for the turn
        }
        const n = sim.nodes[this._node];
        const ringTarget = n.travel ? n.travel.to : n.ring;

        // SHIFT to the node's ring, one tap at a time
        if (sim.probe.ring !== ringTarget) {
            if (this._gap > 0) { this._gap -= dt; return new InputFrame(this._dir, 0); }
            this._gap = this.range(this.shiftGapMin, this.shiftGapMax);
            return this.tapB();
        }
        if (n.travel) return new InputFrame(0, 0);                  // it is still arriving

        // STEER: look, decide, hold
        this._look -= dt;
        if (this._look <= 0) {
            this._look = this.range(this.lookMin, this.lookMax);
            const ring = sim.rings[n.ring];
            const spin = ring.spin * sim.spinK * sim.spinNow * sim.motion;
            const aim = n.a + spin * this._lead;
            const d = dAng(sim.probe.a, aim);
            const tol = sim.tolFor(n.ring);
            if (Math.abs(d) < tol * this._aim) {
                this._dir = 0;
                this._cool = this.range(this.afterPulseMin, this.afterPulseMax);
                this._aim = this.range(this.aimMin, this.aimMax);
                return this.tapA();
            }
            // angle grows with x = -1 (right = counter-clockwise)
            this._dir = d > 0 ? -1 : 1;
            if (this._confused > 0) this._dir = -this._dir;
        }
        if (this._confused > 0) this._confused -= dt;
        return new InputFrame(this._dir, 0);
    }

    _choose(sim) {
        let want = sim.want;
        if (want && this.chance(this.misread) && LOOKALIKE[want]) want = LOOKALIKE[want];
        const cands = [];
        for (let i = 0; i < sim.nodes.length; i++) {
            const n = sim.nodes[i];
            if (n.travel || sim.symOf(n) !== want) continue;
            const shifts = (n.ring - sim.probe.ring + sim.rings.length) % sim.rings.length;
            const cost = shifts * 0.35 + Math.abs(dAng(sim.probe.a, n.a)) / sim.probeSpeed;
            cands.push({ i, cost });
        }
        if (cands.length === 0) { this._node = -1; return; }
        cands.sort((p, q) => p.cost - q.cost);
        const pick = cands.length === 1 || this.chance(this.pickNearest) ? cands[0] : cands[1 + this.rng.next(cands.length - 1)];
        this._node = pick.i; this._want = want; this._look = 0;
    }

    _descend(sim, dt) {
        if (!this._armed) { this._armed = true; this._wait = this.range(this.openWaitMin, this.openWaitMax); this._gap = 0; }
        if (this._wait > 0) { this._wait -= dt; return InputFrame.neutral; }
        if (this._gap > 0) { this._gap -= dt; return InputFrame.neutral; }
        this._gap = this.range(this.shiftGapMin, this.shiftGapMax);
        return this.tapB();
    }
}
