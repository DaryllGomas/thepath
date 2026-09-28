// THE NODE · world 1 · STARVECTOR on the Cabinet Engine · THE BOT: a modelled average player.
//
// It plays only through the InputFrame a person makes (stick left/right/up, A, B), reads the field and
// never writes to it; its dice are its own (this.rng).
//   look     every 0.20-0.34 s it looks again (a person's reaction), and only then changes its mind
//   fixate   it keeps shooting the rock it picked; it picks a new one when that one is gone, now and then
//            (`retarget`), or when it notices something about to hit it. Picks favour near rocks but are
//            not the perfect "most urgent" choice a turret would make
//   aim      it leads a moving target only partly (`leadMin`..1 of the true lead) and HOLDS the turn key
//            for about as long as it thinks the turn takes, with a timing error, so it over- and
//            under-shoots like a thumb on a key
//   fire     it holds A while the nose looks lined up with where it thinks the target will be; now and
//            then it just sprays
//   dodge    a rock about to hit is noticed with `noticeFront` when it is ahead of the nose and
//            `noticeBack` when it comes from behind; then it raises the shield (if it has energy and
//            thinks of it), thrusts if it is pointing away, or turns to shoot it
//   hunt     when nothing is in range it turns and thrusts toward the nearest rock in short bursts
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { StarvectorRound } from './round.js';
import { StarvectorField, wdx, wdy, deltaAngle } from './field.js';

export class StarvectorBot extends CabinetBotBase {
    constructor() {
        super();
        this.lookMin = 0.2; this.lookMax = 0.34;      // seconds between looks
        this.turnError = 0.35;                         // +- fraction of the hold time it misjudges
        this.aimJitter = 0.07;                         // radians of misjudged aim per look
        this.leadMin = 0.35;                           // it leads a target by 0.35..1 of the true lead
        this.fireTol = 0.14;                           // nose within this of the aim point: fire
        this.spray = 0.15;                             // chance per look it just holds fire
        this.retarget = 0.2;                           // chance per look it picks a new rock anyway
        this.noticeFront = 0.6; this.noticeBack = 0.25;// chance per look a rock about to hit is seen
        this.shieldUse = 0.5;                          // having seen it: chance it thinks of the shield
        this.panic = 0.8;                              // seconds ahead a collision counts as "about to hit"
        this._reset();
    }

    get name() { return 'sv-average-player'; }

    reset(seed) { super.reset(seed); this._reset(); }

    _reset() {
        this._look = 0; this._turnDir = 0; this._turnHold = 0;
        this._want = 0; this._fireOk = false; this._sprayOn = false;
        this._thrustHold = 0; this._shieldHold = 0; this._target = null;
    }

    think(sim, dt) {
        const r = sim;
        if (r == null || r.field == null || r.p !== StarvectorRound.Phase.Running || !r.field.shipAlive) { this._reset(); return InputFrame.neutral; }
        const f = r.field;
        this._look -= dt;
        if (this._look <= 0) { this._look = this.range(this.lookMin, this.lookMax); this._decide(f); }

        const out = new InputFrame();
        if (this._turnHold > 0) { this._turnHold -= dt; out.x = this._turnDir; }
        if (this._thrustHold > 0) { this._thrustHold -= dt; out.y = 1; }
        if (this._shieldHold > 0) { this._shieldHold -= dt; out.b = true; }
        // the gun: the nose is watched every frame against the aim point judged at the last look
        const diff = Math.abs(deltaAngle(f.shipA, this._want));
        out.a = this._sprayOn || (this._fireOk && diff < this.fireTol);
        return out;
    }

    _decide(f) {
        const sx = f.shipX, sy = f.shipY;
        // ---- a threat it notices: time to contact for rocks (and enemy bolts) on a closing course
        let threat = null, tBest = this.panic;
        for (const rk of f.rocks) {
            const dx = wdx(rk.x - sx), dy = wdy(rk.y - sy);
            const t = contact(dx, dy, rk.vx - f.shipVx, rk.vy - f.shipVy, rk.r + StarvectorField.ShipR + 2);
            if (t >= 0 && t < tBest) { tBest = t; threat = { dx, dy, rock: rk }; }
        }
        for (const b of f.bolts) {
            if (!b.enemy) continue;
            const dx = wdx(b.x - sx), dy = wdy(b.y - sy);
            const t = contact(dx, dy, b.vx - f.shipVx, b.vy - f.shipVy, StarvectorField.ShipR + 3);
            if (t >= 0 && t < Math.min(tBest, 0.6)) { tBest = t; threat = { dx, dy, rock: null }; }
        }
        this._shieldHold = 0;
        if (threat && f.invulnT <= 0) {
            const ahead = Math.abs(deltaAngle(f.shipA, Math.atan2(threat.dx, -threat.dy))) < Math.PI / 2;
            if (this.chance(ahead ? this.noticeFront : this.noticeBack)) {
                const away = Math.atan2(-threat.dx, threat.dy);           // pointing away from it
                if (f.shield > 0.25 && this.chance(this.shieldUse)) this._shieldHold = Math.min(f.shield, tBest + this.range(0.3, 0.7));
                else if (Math.abs(deltaAngle(f.shipA, away)) < 1.0) this._thrustHold = this.range(0.25, 0.5);
                else if (threat.rock) this._target = threat.rock;         // turn and shoot it
            }
        }

        // ---- the target: keep the one it has, unless it is gone or it feels like a change
        const alive = this._target && f.rocks.includes(this._target);
        if (!alive || this.chance(this.retarget)) this._target = this._pick(f, alive ? this._target : null);
        let tgt = null;
        if (f.saucerOn) {
            const d = Math.hypot(wdx(f.saucerX - sx), wdy(f.saucerY - sy));
            if (d < f.boltRange * 0.8 && this.chance(0.5)) tgt = { x: f.saucerX, y: f.saucerY, vx: f.saucerVx, vy: 0 };
        }
        if (!tgt && this._target) tgt = this._target;
        this._fireOk = false; this._sprayOn = false; this._turnHold = 0; this._turnDir = 0;
        if (!tgt) return;

        const lead = this.range(this.leadMin, 1);
        const bx = wdx(tgt.x - sx), by = wdy(tgt.y - sy);
        const full = f.lead(tgt.x, tgt.y, tgt.vx, tgt.vy);
        const ax = bx + (full.x - bx) * lead, ay = by + (full.y - by) * lead;
        const dist = Math.hypot(ax, ay);
        this._want = Math.atan2(ax, -ay) + this.range(-this.aimJitter, this.aimJitter);
        const diff = deltaAngle(f.shipA, this._want);
        if (Math.abs(diff) > this.fireTol * 0.6) {
            this._turnDir = diff > 0 ? 1 : -1;
            this._turnHold = Math.abs(diff) / f.rotSpeed * (1 + this.range(-this.turnError, this.turnError));
        }
        const inRange = dist < f.boltRange * 0.95;
        this._fireOk = inRange;
        this._sprayOn = inRange && this.chance(this.spray);
        // hunting: nothing in range, nose roughly on it, a short burst of thrust
        if (!inRange && this._thrustHold <= 0 && Math.abs(diff) < 0.5 && Math.hypot(f.shipVx, f.shipVy) < 45)
            this._thrustHold = this.range(0.2, 0.4);
    }

    // a rock that catches the eye: weighted toward near ones (1 / edge distance), never the same one twice in a row
    _pick(f, not) {
        let total = 0;
        const w = [];
        for (const rk of f.rocks) {
            if (rk === not && f.rocks.length > 1) { w.push(0); continue; }
            const d = Math.hypot(wdx(rk.x - f.shipX), wdy(rk.y - f.shipY)) - rk.r;
            const v = 1 / Math.max(12, d);
            w.push(v); total += v;
        }
        if (total <= 0) return null;
        let u = this.rng.nextDouble() * total;
        for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return f.rocks[i]; }
        return f.rocks[f.rocks.length - 1];
    }
}

// seconds until a point at (dx, dy) moving (vx, vy) comes within rad of the origin, or -1
function contact(dx, dy, vx, vy, rad) {
    const c = dx * dx + dy * dy - rad * rad;
    if (c <= 0) return 0;
    const a = vx * vx + vy * vy, b = 2 * (dx * vx + dy * vy);
    if (a < 1e-6 || b >= 0) return -1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    return (-b - Math.sqrt(disc)) / (2 * a);
}
