// THE NODE · world 1 · LUNAR DUTY · THE BOT: a modelled average player, through the control panel.
// Port of LunarDutyBot.cs.
//
//   JUMP   when the next crater / rock / mine / tank's near edge comes within JumpAt px of the nose
//          (a fixed distance, like a player's eye), rolled fresh for every hazard with JumpNoise px
//          of scatter. Now and then (Lapse) it sees one late. A crater a bomb has just dug takes it
//          Reaction seconds to notice. Tank shells get their own, longer distance.
//   FIRE   when a UFO or a bomb is inside a cone above the up-gun, or a rock / tank / shell is in
//          cannon range ahead (a glance every FireCheck s, FireSkill chance to react).
//   SLOW   when two hazards stack (the second starts less than a jump after the first ends),
//          it holds the stick back until it has cleared the first.
// It reads the sim; it never writes to it. Its dice are its own.
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { HazardKind } from './course.js';
import { LunarDutySim, craterWidth } from './sim.js';

export class LunarDutyBot extends CabinetBotBase {
    constructor() {
        super();
        this.jumpAt = 10;          // px from the nose to the hazard's near edge
        this.jumpNoise = 6.5;      // sd, px
        this.lapse = 0.05;         // chance a hazard is seen late
        this.lapseLate = 20;       // how late, px
        this.shellJumpAt = 34;
        this.reaction = 0.28;      // s before a freshly dug crater registers
        this.fireCheck = 0.12;
        this.fireSkill = 0.7;
        this.cone = 0.30;          // tan of the cone's half-angle above the up-gun
        this.cannonReach = 135;
        this.mergeGap = 24;        // closer than this, two hazards are jumped as one

        this._target = null; this._trigger = 0; this._fireT = 0; this._lastFire = -9;
        this._slowing = false;
        this._ahead = [];
    }

    get name() { return 'ld-average-player'; }

    reset(seed) {
        super.reset(seed);
        this._target = null; this._trigger = 0; this._fireT = 0; this._lastFire = -9; this._slowing = false;
    }

    _gauss() {
        const u1 = 1 - this.rng.nextDouble(), u2 = this.rng.nextDouble();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    think(sim, dt) {
        const r = sim;
        const f = new InputFrame();
        if (r == null || r.p !== LunarDutySim.Phase.Drive) { this._target = null; this._slowing = false; return f; }

        const nose = r.x + r.buggyFront;
        const tail = r.x - r.buggyHalf;
        const ahead = this._ahead;
        ahead.length = 0;
        for (const c of r.craters) {
            if (craterWidth(c) < 10 || c.x1 - 5 < r.x) continue;
            if (c.x0 > nose + 260) break;
            if (c.dug && c.age < this.reaction) continue;      // not seen yet
            ahead.push({ near: c.x0, far: c.x1, kind: 0, ref: c });
        }
        for (const o of r.obstacles) {
            if (!o.alive || o.far < tail) continue;
            if (o.x > nose + 260) break;
            ahead.push({ near: o.x, far: o.far, kind: 1, ref: o });
        }
        for (const s of r.shells)
            if (s.x + 3 > tail && s.x - 3 < nose + 200) ahead.push({ near: s.x - 3, far: s.x + 3, kind: 2, ref: s });
        ahead.sort((a, b) => a.near - b.near);

        // what the cannon could take (before merging): a rock, a tank or a shell in reach
        let shootable = false;
        for (const h of ahead) {
            if (h.kind === 0) continue;
            if (h.kind === 1 && h.ref.kind === HazardKind.Mine) continue;
            const d = h.near - nose;
            if (d > 0 && d < this.cannonReach) { shootable = true; break; }
        }
        // hazards too close to land between are one hazard to the eye (a mine pair, a rock on a crater's lip)
        for (let i = ahead.length - 1; i > 0; i--) {
            if (ahead[i].kind === 2 || ahead[i - 1].kind === 2) continue;
            if (ahead[i].near - ahead[i - 1].far < this.mergeGap) {
                ahead[i - 1].far = Math.max(ahead[i - 1].far, ahead[i].far);
                ahead.splice(i, 1);
            }
        }

        // ---- SLOW when two hazards stack
        const jumpLen = r.speed * (2 * r.jumpV / r.gravity);
        if (ahead.length >= 2 && ahead[0].kind !== 2 && ahead[1].kind !== 2) {
            const gap = ahead[1].near - ahead[0].far;
            if (gap < jumpLen * 0.9 && ahead[0].near - nose < 110) this._slowing = true;
        }
        if (this._slowing && (ahead.length === 0 || ahead[0].near - nose > 140)) this._slowing = false;
        f.x = this._slowing ? -1 : 0;

        // ---- JUMP
        let jump = false;
        if (ahead.length > 0) {
            const h = ahead[0];
            if (h.ref !== this._target) {
                this._target = h.ref;
                this._trigger = (h.kind === 2 ? this.shellJumpAt : this.jumpAt) + this._gauss() * this.jumpNoise;
                if (this.chance(this.lapse)) this._trigger -= this.lapseLate;
            }
            const d = h.near - nose;
            if (r.grounded && d <= this._trigger && h.far > r.x - 4) jump = true;
        }
        f.a = jump && !this.lastFrame.a;

        // ---- FIRE
        this._fireT -= dt;
        let fire = false;
        if (this._fireT <= 0) {
            this._fireT = this.fireCheck;
            const gunX = r.x + r.upGunX, gunH = r.h + r.upGunH;
            let want = false;
            for (const u of r.ufos) {
                const ux = r.camX + u.sx + 8, uh = r.groundY - u.sy - 4;
                const dh = uh - gunH;
                if (dh > 0 && Math.abs(ux - gunX) < dh * this.cone + 6) { want = true; break; }
            }
            if (!want)
                for (const b of r.bombs) {
                    const dh = b.h - gunH;
                    if (dh > 0 && Math.abs(b.x - gunX) < dh * this.cone + 4) { want = true; break; }
                }
            if (!want && r.fwdShot === null && shootable) want = true;
            if (want && this.chance(this.fireSkill) && r.time - this._lastFire > 0.2) { fire = true; this._lastFire = r.time; }
        }
        f.b = fire && !this.lastFrame.b;
        return f;
    }
}
