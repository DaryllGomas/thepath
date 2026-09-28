// THE NODE · world 1 · CASTLE CRUSH · THE BOT: a modelled average player at the control panel.
// Port of CastleCrushBot.cs from Staging/Batch1/castlecrush.
//
// It only ever pushes the stick (analogue X) and taps A, and its dice are its own.
//   - WATCH: it re-reads the board every thinkEvery s. A stone it sees falling is followed to where
//     it will cross the cart's line (side walls reflected, masonry ignored), read with an error that
//     grows with the time left (noiseBase + noisePerSec x t); the error is drawn once per flight,
//     so the read converges instead of jittering. A stone rising is guessed: where it will come back
//     down off the first block in its way (predictBounce), loosely, pulled highPull toward the middle.
//   - REACT: when a stone changes direction (a block, a wall) the player needs reaction seconds
//     (jittered) to notice; until then it keeps going for the old spot.
//   - LAPSE: each time a stone starts down, a lapse chance the player looks away for a moment.
//   - AIM: it lands the stone off-centre on the beam so the rebound heads for the biggest cluster of
//     masonry still standing (up to aimMax of the half-beam), the way players "work" a wall.
//   - DODGE: an arrow over the cart is dodged when the stones are high (nothing lands within
//     dodgeWindow s), noticed with chance aware per arrow; it never rolls into an arrow level with
//     the beam. With a stone coming down at about the same time it keeps the catch, and with
//     chance edgeSave takes it on the far end of the beam, away from the arrow.
//   - GREED: a falling power-up is chased while the stones are high, with chance greed per token.
//   - SERVE: it lines up under the biggest cluster and taps A after a short, human pause.
import { f32, CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { CastleCrushRound } from './round.js';

const Phase = CastleCrushRound.Phase;

export class CastleCrushBot extends CabinetBotBase {
    constructor() {
        super();
        this.thinkEvery = f32(0.08);
        this.reaction = f32(0.2);           // mean; jittered 0.7x..1.4x
        this.noiseBase = f32(3); this.noisePerSec = f32(16);
        this.lapse = f32(0.05); this.lapseMin = f32(0.25); this.lapseMax = f32(0.55);
        this.aimMax = f32(0.5);
        this.highPull = f32(0.25);          // a rising stone's guessed landing is pulled this much toward the middle
        this.dodgeWindow = f32(0.55); this.aware = f32(0.9);
        this.greed = f32(0.7);
        this.edgeSave = f32(0.6);           // chance to catch on the beam's far end when an arrow comes down on the catch

        this._readErr = 0; this._thinkT = 0; this._frozenT = 0; this._reactT = 0; this._target = 0;
        this._stoneWant = 0; this._stoneLandX = 0; this._stoneLand = Number.MAX_VALUE; this._serveWait = -1;
        this._hasTarget = false; this._hasStoneWant = false;
        this._signs = new Map();       // Stone -> sign bits
        this._decided = new Map();     // object -> bool
        this._edge = new Map();        // object -> bool
    }

    get name() { return 'cc-average-player'; }

    reset(seed) {
        super.reset(seed);
        this._thinkT = 0; this._frozenT = 0; this._reactT = 0; this._hasTarget = false; this._hasStoneWant = false; this._serveWait = -1;
        this._signs.clear(); this._decided.clear(); this._edge.clear();
    }

    _gauss() {
        const u1 = 1.0 - this.rng.nextDouble(), u2 = this.rng.nextDouble();
        return f32(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
    }

    think(sim, dt) {
        const g = sim;
        if (g == null || (g.p !== Phase.Siege && g.p !== Phase.Ready)) {
            this._hasTarget = false; this._hasStoneWant = false; this._serveWait = -1;
            this._signs.clear(); this._decided.clear(); this._edge.clear();
            return InputFrame.neutral;
        }

        // ---- noticing a stone change direction takes a moment (the reaction delay)
        for (const st of g.stones) {
            const sg = (st.vx >= 0 ? 1 : 0) | (st.vy >= 0 ? 2 : 0);
            const old = this._signs.get(st);
            if (old === undefined || old !== sg) this._readErr = this._gauss();   // a fresh read of a new flight
            if (old !== undefined && old !== sg) {
                const react = f32(this.reaction * this.range(0.7, 1.4));
                if (this._reactT < react) this._reactT = react;
                if ((sg & 2) !== 0 && (old & 2) === 0 && this.chance(this.lapse)) this._frozenT = this.range(this.lapseMin, this.lapseMax);
            }
            this._signs.set(st, sg);
        }
        if (this._signs.size > g.stones.length + 4) this._signs.clear();

        if (this._frozenT > 0) this._frozenT = f32(this._frozenT - dt);
        if (this._reactT > 0) this._reactT = f32(this._reactT - dt);
        this._thinkT = f32(this._thinkT - dt);
        if (this._thinkT <= 0 && this._frozenT <= 0) {
            this._thinkT = f32(this.thinkEvery * this.range(0.8, 1.25));
            if (this._reactT <= 0 || !this._hasStoneWant) {
                const r = this._stoneTarget(g);
                this._stoneWant = r.want; this._stoneLand = r.tLand; this._hasStoneWant = true;
            } else this._stoneLand = f32(this._stoneLand - this.thinkEvery);
            this._target = this._adjust(g, this._stoneWant, this._stoneLand);
            this._hasTarget = true;
        }

        const f = InputFrame.neutral;
        if (this._hasTarget) {
            const d = this._target - g.cartX;
            if (Math.abs(d) > 1.2) f.x = Math.max(-1, Math.min(1, d / 6));
        }

        // ---- the serve
        if (g.p === Phase.Siege && g.serving) {
            if (this._serveWait < 0) this._serveWait = this.range(0.3, 1.0);
            this._serveWait -= dt;
            if (this._serveWait <= 0 && Math.abs(this._target - g.cartX) < 6) {
                this._serveWait = 5;
                const a = this.tapA();
                a.x = f.x;
                return a;
            }
        } else this._serveWait = -1;
        return f;
    }

    // where the cart should be for the stones alone; returns { want, tLand } (tLand = seconds until
    // the next one comes down)
    _stoneTarget(g) {
        const lineY = f32(CastleCrushRound.CartTop - CastleCrushRound.StoneR);
        const half = f32(g.cartW * 0.5);
        const mid = f32((CastleCrushRound.FieldL + CastleCrushRound.FieldR) * 0.5);
        const { cx: clusterX, cy: clusterY } = cluster(g);
        let tLand = Number.MAX_VALUE;
        if (g.serving) return { want: this._clamp(g, clusterX + this.range(-10, 10)), tLand };

        let threat = null, high = null, landX = mid, highX = mid, highT = Number.MAX_VALUE;
        for (const st of g.stones) {
            if (st.attached) continue;
            if (st.vy > 0) {
                const r = CastleCrushRound.predictX(st.x, st.y, st.vx, st.vy, lineY);
                if (r.t < tLand) { tLand = r.t; threat = st; landX = r.x; }
            } else {
                // rising: guess where it comes back down (off the first block it meets)
                const r = g.predictBounce(st.x, st.y, st.vx, st.vy, lineY);
                if (r.t < highT) { highT = r.t; high = st; highX = r.x; }
            }
        }
        if (threat != null) {
            const lx = landX + this._readErr * (this.noiseBase + this.noisePerSec * tLand) + this._gauss() * this.noiseBase * 0.5;
            this._stoneLandX = lx;
            // aim the rebound at the biggest cluster
            const ang = Math.atan2(clusterX - lx, Math.max(20, lineY - clusterY));
            let u = ang / CastleCrushRound.MaxAngle;
            if (u > this.aimMax) u = this.aimMax; else if (u < -this.aimMax) u = -this.aimMax;
            return { want: this._clamp(g, lx - u * half), tLand };
        }
        if (high != null) {
            // a rough read: the guess is loose, and pulled toward the middle
            const gx = highX + this._readErr * (this.noiseBase + this.noisePerSec * 1.5 * Math.min(2, highT));
            return { want: this._clamp(g, gx * (1 - this.highPull) + mid * this.highPull), tLand };
        }
        return { want: mid, tLand };
    }

    // arrows and power-ups, re-read at every think
    _adjust(g, want, tLand) {
        const half = f32(g.cartW * 0.5);
        const stonesHigh = tLand > this.dodgeWindow;
        if (stonesHigh)
            for (const tk of g.tokens) {
                const tt = (CastleCrushRound.CartTop - tk.y) / g.tokenFall;
                if (tt < 0 || tt > 2.5 || tt + 0.25 > tLand) continue;
                if (!this._decidedFor(tk, this.greed)) continue;
                if (Math.abs(tk.x - g.cartX) / g.cartSpeed < tt + 0.1) { want = tk.x; break; }
            }
        for (const ar of g.arrows) {
            if (ar.y > CastleCrushRound.CartTop + CastleCrushRound.ArrowBite) continue;   // below the beam: harmless
            const ta = (CastleCrushRound.CartTop - ar.y) / g.arrowSpeed;    // < 0: level with the cart now
            if (ta > 1.2) continue;
            if (!this._decidedFor(ar, this.aware)) continue;
            const margin = half + 4;
            const cartLeft = g.cartX < ar.x;
            const near = cartLeft ? ar.x - margin : ar.x + margin;
            if (ta <= 0) {
                // it is passing the cart's height: never roll into it
                if (cartLeft) want = Math.min(want, ar.x - margin); else want = Math.max(want, ar.x + margin);
                continue;
            }
            if (!stonesHigh && ta >= tLand - 0.35) {
                // a stone comes down just before (or with) an arrow: catch it on the end of the beam
                // away from the arrow, if there is room -- or take the catch and the chance
                if (ta <= tLand + 0.7 && Math.abs(ar.x - this._stoneLandX) > 4 && this._decidedEdge(ar)) {
                    const c = this._stoneLandX + Math.sign(this._stoneLandX - ar.x) * (half - 2);
                    if (Math.abs(ar.x - c) > half + 1) want = c;
                }
                continue;
            }
            const cross = (Math.abs(ar.x - g.cartX) + margin) / g.cartSpeed;
            const wantPast = (want < ar.x) !== cartLeft;
            if (Math.abs(want - ar.x) < margin || (wantPast && cross + 0.08 > ta)) {
                const nearOk = near - half > CastleCrushRound.FieldL && near + half < CastleCrushRound.FieldR;
                want = nearOk ? near : (cartLeft ? ar.x + margin : ar.x - margin);
            }
        }
        return this._clamp(g, want);
    }

    _decidedFor(o, p) {
        let v = this._decided.get(o);
        if (v === undefined) { if (this._decided.size > 64) this._decided.clear(); v = this.chance(p); this._decided.set(o, v); }
        return v;
    }

    _decidedEdge(o) {
        let v = this._edge.get(o);
        if (v === undefined) { if (this._edge.size > 64) this._edge.clear(); v = this.chance(this.edgeSave); this._edge.set(o, v); }
        return v;
    }

    _clamp(g, x) {
        const half = f32(g.cartW * 0.5);
        if (x < CastleCrushRound.FieldL + half) x = CastleCrushRound.FieldL + half;
        if (x > CastleCrushRound.FieldR - half) x = CastleCrushRound.FieldR - half;
        return x;
    }
}

// the largest 4-connected cluster of standing blocks (by hit points); its centroid
function cluster(g) {
    const n = CastleCrushRound.Rows * CastleCrushRound.Cols;
    const seen = new Array(n).fill(false);
    const stack = [];
    let bestHp = -1, cx = 160, cy = 90;
    for (let i = 0; i < n; i++) {
        const b0 = g.blocks[i];
        if (seen[i] || b0 == null || !b0.alive) continue;
        let hp = 0, sx = 0, sy = 0, cnt = 0;
        stack.push(i); seen[i] = true;
        while (stack.length > 0) {
            const k = stack.pop();
            const b = g.blocks[k];
            hp += b.hp; sx += b.x0 + CastleCrushRound.CellW * 0.5; sy += b.y0 + CastleCrushRound.CellH; cnt++;
            const c = k % CastleCrushRound.Cols, r = Math.trunc(k / CastleCrushRound.Cols);
            for (let d = 0; d < 4; d++) {
                const nc = c + (d === 0 ? 1 : d === 1 ? -1 : 0), nr = r + (d === 2 ? 1 : d === 3 ? -1 : 0);
                if (nc < 0 || nr < 0 || nc >= CastleCrushRound.Cols || nr >= CastleCrushRound.Rows) continue;
                const nk = nr * CastleCrushRound.Cols + nc;
                if (seen[nk] || g.blocks[nk] == null || !g.blocks[nk].alive) continue;
                seen[nk] = true; stack.push(nk);
            }
        }
        if (hp > bestHp) { bestHp = hp; cx = sx / cnt; cy = sy / cnt; }
    }
    return { cx, cy };
}
