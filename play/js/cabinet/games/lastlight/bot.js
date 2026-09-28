// THE NODE · world 1 · LAST LIGHT on the Cabinet Engine · THE BOT: a modelled average player.
// Port of LastLightBot.cs from Staging/Batch1/lastlight.
//
// It plays through the control panel like anyone else: it pushes the stick to walk the crosshair
// and taps A. Its rule: go for the missile with the LEAST TIME TO IMPACT that has no interceptor
// already en route, and LEAD its path (aim where the warhead will be when the interceptor gets
// there and the blast has grown). Missiles falling on rubble come last, and once it is down to
// spareShots (12) shots it lets them burn. It never shoots the bomber on purpose.
//
// What makes it average rather than perfect (its dice are its own, never the sim's):
//   reaction   0.55 s  a new missile is on screen this long before it is noticed    (x form)
//   aimNoise   4.5 px  where it thinks the intercept is (sigma, fixed per target)  (x form)
//   leadNoise  0.18    how far it leads (sigma of a factor around 1)              (x form)
//   tolerance  2.5 px  how close the crosshair must be before it fires
//   minGap     0.2 s   between shots
//   lapse      0.12/s  chance per second of looking away for 0.25-0.8 s             (x form)
//   form       0.35-3.2 per round, log-uniform (median ~1.06): people have sharp nights and off
//              nights.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { LastLightRound } from './round.js';

const Phase = LastLightRound.Phase;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class LastLightBot extends CabinetBotBase {
    constructor() {
        super();
        this.reaction = 0.55;
        this.aimNoise = 4.5;
        this.leadNoise = 0.18;
        this.tolerance = 2.5;
        this.minGap = 0.2;
        this.lapse = 0.12; this.lapseMin = 0.25; this.lapseMax = 0.8;
        this.planSpeed = 170;              // the crosshair speed it plans a move with
        this.rubblePenalty = 20;           // seconds added to a missile that falls on rubble
        this.spareShots = 12;              // below this many shots it ignores missiles falling on rubble
        this.formMin = 0.35; this.formMax = 3.2;
        this.form = 1;

        this._targetId = -1;
        this._leadF = 1; this._nx = 0; this._ny = 0; this._lapseT = 0; this._gap = 0;
        this._coveredMap = new Map();
    }

    get name() { return 'll-average-player'; }

    reset(seed) {
        super.reset(seed);
        this._targetId = -1; this._coveredMap.clear();
        this._lapseT = 0; this._gap = 0; this._leadF = 1; this._nx = 0; this._ny = 0;
        this.form = Math.exp(Math.log(this.formMin) + (Math.log(this.formMax) - Math.log(this.formMin)) * this.rng.nextDouble());
    }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== Phase.Play) { this._targetId = -1; return InputFrame.neutral; }
        this._gap -= dt;
        if (this._lapseT > 0) { this._lapseT -= dt; return InputFrame.neutral; }
        if (this.chance(this.lapse * this.form * dt)) { this._lapseT = this.range(this.lapseMin, this.lapseMax); return InputFrame.neutral; }

        let m = this._find(s, this._targetId);
        if (m == null || this._isCovered(s, m)) {
            m = this._choose(s);
            this._targetId = m != null ? m.id : -1;
            if (m != null) {
                this._leadF = 1 + this._gauss() * this.leadNoise * this.form;
                this._nx = this._gauss() * this.aimNoise * this.form;
                this._ny = this._gauss() * this.aimNoise * this.form;
            }
        }
        if (m == null) return InputFrame.neutral;

        const sol = this._solve(s, m, this._leadF);
        const ax = clamp(sol.ax + this._nx, LastLightRound.CrossMinX, LastLightRound.CrossMaxX);
        const ay = clamp(sol.ay + this._ny, LastLightRound.CrossMinY, LastLightRound.CrossMaxY);
        const dx = ax - s.crossX, dy = ay - s.crossY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= this.tolerance) {
            if (this._gap <= 0 && s.firingSilo(s.crossX) >= 0 && s.interceptorsInFlight < LastLightRound.MaxInterceptors) {
                this._coveredMap.set(m.id, s.time + sol.eta + 0.6);
                this._gap = this.minGap; this._targetId = -1;
                return this.tapA();
            }
            return InputFrame.neutral;
        }
        // the stick: full push when far, eased in the last 14 px so it does not overshoot
        const k = d > 14 ? 1 / d : 1 / 14;
        return new InputFrame(dx * k, -dy * k);
    }

    _find(s, id) {
        if (id < 0) return null;
        for (const m of s.missiles) if (m.id === id && m.alive) return m;
        return null;
    }

    _choose(s) {
        let best = null, bestT = Infinity;
        for (const m of s.missiles) {
            if (!m.alive || m.age < this.reaction * this.form || m.ty - m.y < 4) continue;
            if (this._isCovered(s, m)) continue;
            let tti = m.timeToImpact;
            const sol = this._solve(s, m, 1);
            if (sol.eta > tti + 0.4) continue;                     // it cannot be caught any more
            if (!s.targetStanding(m.target)) {
                if (s.shotsLeft <= this.spareShots) continue;      // short of shots: let rubble burn
                tti += this.rubblePenalty;
            }
            if (tti < bestT) { bestT = tti; best = m; }
        }
        return best;
    }

    // is something already on its way to this one (my own shot, a live interceptor, a live blast)?
    _isCovered(s, m) {
        const until = this._coveredMap.get(m.id);
        if (until !== undefined && until > s.time) return true;
        for (const c of s.interceptors) {
            if (!c.alive) continue;
            const sp = s.siloSpeed(c.silo);
            const t = (c.dist - c.travel) / sp + 0.3;
            const px = m.x + m.vx * t, py = m.y + m.vy * t;
            const dx = px - c.tx, dy = py - c.ty;
            if (dx * dx + dy * dy < s.blastRadius * s.blastRadius * 0.7) return true;
        }
        for (const b of s.blasts) {
            if (!b.alive || b.enemy || b.shield) continue;
            const st = b.stage();
            if (st[0] === 2) continue;
            const px = m.x + m.vx * 0.25, py = m.y + m.vy * 0.25;
            const dx = px - b.x, dy = py - b.y;
            if (dx * dx + dy * dy < b.maxR * b.maxR * 0.8) return true;
        }
        return false;
    }

    // where to put the crosshair: the missile's position when crosshair travel + flight + blast growth are done
    _solve(s, m, lead) {
        let t = 0.3;
        let ax = m.x, ay = m.y;
        for (let it = 0; it < 4; it++) {
            let px = m.x + m.vx * t * lead, py = m.y + m.vy * t * lead;
            if (py > m.ty) { px = m.tx; py = m.ty; }
            ax = clamp(px, LastLightRound.CrossMinX, LastLightRound.CrossMaxX);
            ay = clamp(py, LastLightRound.CrossMinY, LastLightRound.CrossMaxY);
            let silo = s.firingSilo(ax);
            if (silo < 0) silo = 1;
            const mx = ax - s.crossX, my = ay - s.crossY;
            const move = Math.sqrt(mx * mx + my * my) / this.planSpeed;
            const fx = ax - LastLightRound.SiloX[silo], fy = ay - LastLightRound.SiloLaunchY;
            const fly = Math.sqrt(fx * fx + fy * fy) / s.siloSpeed(silo);
            t = move + fly + 0.2;
        }
        return { ax, ay, eta: t };
    }

    _gauss() {
        const u1 = 1 - this.rng.nextDouble(), u2 = this.rng.nextDouble();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
}
