// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE BOT: a modelled average player.
// Port of IronDojoBot.cs (Staging/Batch3/irondojo), float for float.
//
// It plays through the control panel like anyone else and reads the sim only to see what is on
// the tube. Every new attacker, knife and boss wind-up is NOTICED after a human reaction time
// (0.14-0.32 s, plus a 0.35 s lapse 6 % of the time); until then it does not exist for the bot.
//   - grabbed: wiggle the stick left/right at 6-9 presses a second until he lets go
//   - knives: duck under a HIGH one, jump a LOW one (6 % of knives it reads wrong)
//   - always answer the NEARER attacker first: KICK when he is at kick range, PUNCH up close;
//     a dwarf gets a ducking kick (or, a quarter of the time, a jump over him)
//   - the boss: hold just inside his reach and wait for the TELEGRAPH, then step in and PUNCH.
//     It judges (with 0.12 s of error) whether it can get there before the stick comes down; if
//     not it backs out of reach (20 % of the time it goes in anyway) and punishes the recovery.
//     Now and then (impatience) it swings at a guarded boss and eats the parry.
//   - otherwise walk up the floor (left), then to the stairs
// Its timing is sloppy by up to timingSlop px either way, and it cannot press a button that is
// still held (a blow needs a fresh press, as on the real panel). Its dice are its own (this.rng).
import { f32, CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { IronDojoSim, Act, FoeKind, FoeState, BossState } from './sim.js';

const C = IronDojoSim.C;
const F32_MAX = 3.4028234663852886e38;          // float.MaxValue

export class IronDojoBot extends CabinetBotBase {
    constructor() {
        super();
        this.reactMin = f32(0.14); this.reactMax = f32(0.32);
        this.lapseChance = f32(0.06); this.lapseExtra = f32(0.35);
        this.wrongAnswer = f32(0.06);
        this.jumpDwarfChance = f32(0.25);
        this.wiggleHzMin = f32(6); this.wiggleHzMax = f32(9);
        this.timingSlop = f32(8);
        this.impatience = f32(0.2);                  // per second at a guarded boss: a hopeful swing
        this.teleReactMin = f32(0.12); this.teleReactMax = f32(0.40);   // seeing the stick go up
        this.judgeSlop = f32(0.12);                  // s of error in reading how long the wind-up has left
        this.bravado = f32(0.2);                     // goes in anyway when the read says no

        this._seenAt = new Map();
        this._slop = new Map();
        this._misread = new Set();
        this._jumper = new Set();
        this._lastBoss = BossState.Wait;
        this._teleSeenAt = F32_MAX;
        this._wiggleT = 0;
        this._wiggleDir = 1;
        this._hopeT = 0;
        this._teleDecided = false; this._teleGo = false;
    }

    get name() { return 'dojo-average-player'; }

    reset(seed) {
        super.reset(seed);
        this._seenAt.clear(); this._slop.clear(); this._misread.clear(); this._jumper.clear();
        this._lastBoss = BossState.Wait; this._teleSeenAt = F32_MAX; this._wiggleT = 0; this._wiggleDir = 1; this._hopeT = 0;
        this._teleDecided = this._teleGo = false;
    }

    _react() { return f32(this.range(this.reactMin, this.reactMax) + (this.chance(this.lapseChance) ? this.lapseExtra : 0)); }

    _seen(id, now) { return this._seenAt.has(id) && now >= this._seenAt.get(id); }

    _slopOf(id) { return this._slop.has(id) ? this._slop.get(id) : 0; }

    think(sim, dt) {
        const s = sim;
        if (s == null || s.p !== IronDojoSim.Phase.Play) return InputFrame.neutral;
        const now = s.time;
        const f = s.f;
        const cam = s.cam;

        // ---- notice what has come onto the tube
        for (const e of s.foes) {
            if (!e.live || this._seenAt.has(e.id) || !cam.onScreen(e.x, 4)) continue;
            this._seenAt.set(e.id, f32(now + this._react()));
            this._slop.set(e.id, this.range(-this.timingSlop, this.timingSlop));
            if (e.kind === FoeKind.Dwarf && this.chance(this.jumpDwarfChance)) this._jumper.add(e.id);
        }
        for (const k of s.knives) {
            if (this._seenAt.has(k.id)) continue;
            this._seenAt.set(k.id, f32(now + this._react()));
            this._slop.set(k.id, this.range(-this.timingSlop, this.timingSlop));
            if (this.chance(this.wrongAnswer)) this._misread.add(k.id);
        }
        const b = s.b;
        if (b.s === BossState.Telegraph && this._lastBoss !== BossState.Telegraph)
            this._teleSeenAt = f32(f32(now + this.range(this.teleReactMin, this.teleReactMax)) + (this.chance(this.lapseChance) ? this.lapseExtra : 0));
        this._lastBoss = b.s;

        // ---- held: wiggle free
        if (f.a === Act.Grabbed) {
            this._wiggleT = f32(this._wiggleT - dt);
            if (this._wiggleT <= 0) { this._wiggleDir = -this._wiggleDir; this._wiggleT = f32(1 / this.range(this.wiggleHzMin, this.wiggleHzMax)); }
            return new InputFrame(this._wiggleDir);
        }

        const free = f.a === Act.Idle || f.a === Act.Walk || f.a === Act.Duck;
        const o = new InputFrame();

        // ---- knives first: the nearest one still coming at us
        let knife = null, kd = F32_MAX;
        for (const k of s.knives) {
            if (k.passed || !this._seen(k.id, now)) continue;
            const d = f32(f32(f.x - k.x) * k.dir);                                 // px until it reaches us
            if (d < -2) continue;
            if (d < kd) { kd = d; knife = k; }
        }
        let duck = false;
        if (knife != null) {
            const high = knife.high !== this._misread.has(knife.id);
            const sl = this._slopOf(knife.id);
            if (high) { if (kd < 70) duck = true; }
            else if (kd < 90) {
                if (kd < f32(34 + sl) && kd > 10 && free) { o.y = 1; return o; }   // jump it
                if (kd >= f32(34 + sl)) return o;                                  // stand and time the jump
            }
        }

        // ---- the nearest attacker we have noticed
        let near = null, nd = F32_MAX;
        for (const e of s.foes) {
            if (!e.live || e.s === FoeState.Hold || !this._seen(e.id, now)) continue;
            if (e.kind === FoeKind.Dwarf && e.s === FoeState.Walk && f32(f32(f.x - e.x) * e.dir) < -6) { this._jumper.delete(e.id); continue; }   // rolling away (next time: kick him)
            const d = Math.abs(f32(e.x - f.x));
            if (d < nd) { nd = d; near = e; }
        }
        const bossLive = b.active && b.alive;
        const bd = bossLive ? Math.abs(f32(b.x - f.x)) : F32_MAX;

        if (near != null && nd < 150 && (!bossLive || nd <= bd)) {
            const toward = near.x >= f.x ? 1 : -1;
            const sl = this._slopOf(near.id);
            if (near.kind === FoeKind.Dwarf) {
                if (near.s !== FoeState.Walk) return hold(o, duck, 0);             // he is hopping: wait for him
                if (this._jumper.has(near.id)) {
                    if (nd < f32(24 + f32(sl * f32(0.5))) && nd > 12 && free && !duck) { o.y = 1; return o; }
                    return hold(o, duck, 0);
                }
                const trigger = f32(f32(C.LowKickReach + f32(near.speed * C.DuckKickStart)) + sl);
                if (nd <= trigger && free) { o.y = -1; o.x = toward; return this._pressB(o); }
                if (nd < 70) { o.y = -1; return o; }                               // crouch and wait for him
                return hold(o, duck, 0);
            }
            if (near.kind === FoeKind.Thrower || near.s === FoeState.Stunned) {
                if (!free) return hold(o, duck, 0);
                if (nd <= C.PunchReach - 2) { o.x = toward; if (duck) o.y = -1; return this._pressA(o); }
                if (nd <= f32(C.KickReach - 2 + Math.min(0, sl))) { o.x = toward; if (duck) o.y = -1; return this._pressB(o); }
                if (duck) { o.y = -1; return o; }
                o.x = toward;
                return o;
            }
            // a grabber walking in: kick at range, punch up close
            if (free) {
                const closing = near.speed;
                if (nd <= C.PunchReach - 2) { o.x = toward; if (duck) o.y = -1; return this._pressA(o); }
                if (nd <= f32(f32(C.KickReach + f32(closing * C.KickStart)) + sl)) { o.x = toward; if (duck) o.y = -1; return this._pressB(o); }
            }
            if (duck) { o.y = -1; return o; }
            if (toward < 0) { o.x = -1; return o; }                                // he is up the floor: walk into him
            if (nd < 90) return o;                                                 // behind: stand and let him come
        }
        else if (duck) { o.y = -1; return o; }

        // ---- the boss
        if (b.s !== BossState.Telegraph) this._teleDecided = false;
        if (bossLive && bd < 160 && (near == null || bd < nd || nd >= 90)) {
            const toward = b.x >= f.x ? 1 : -1;
            if (b.s === BossState.Telegraph && now >= this._teleSeenAt && !this._teleDecided) {
                // the read: can I get inside and land a punch before that stick comes down?
                const left = f32(b.t + this.range(-this.judgeSlop, this.judgeSlop));
                const need = f32(f32(f32(Math.max(0, f32(f32(bd - (C.PunchReach - 1)) - 6)) / C.WalkSpeed) + C.PunchStart) + f32(0.03));
                this._teleGo = left >= need || this.chance(this.bravado);
                this._teleDecided = true;
            }
            const rush = (b.s === BossState.Telegraph && this._teleDecided && this._teleGo) || b.s === BossState.Swing || b.s === BossState.Recover;
            if (rush) {
                if (!free) return o;
                if (bd <= C.PunchReach - 1) { o.x = toward; return this._pressA(o); }
                if (b.s !== BossState.Telegraph && bd <= C.KickReach - 1) { o.x = toward; return this._pressB(o); }
                o.x = toward;
                return o;
            }
            if (b.s === BossState.Telegraph && this._teleDecided) {
                // too late to beat him to it: back out of the stick's reach and punish the recovery
                o.x = bd < C.BossReach + 6 ? -toward : 0;
                return o;
            }
            if (b.s === BossState.Hurt) return o;
            // guarded: hover just inside his reach
            this._hopeT = f32(this._hopeT - dt);
            if (free && bd <= C.KickReach && this._hopeT <= 0 && this.chance(f32(this.impatience * dt))) {
                this._hopeT = f32(1.5);
                o.x = toward;
                return this._pressB(o);
            }
            if (bd < 38) { o.x = -toward; return o; }
            if (bd > 48) { o.x = toward; return o; }
            return o;
        }

        // ---- nothing on us: up the floor, toward the stairs
        o.x = -1;
        return o;
    }

    // a blow needs a fresh press: if the button is still down from last step, release first
    _pressA(o) {
        if (this.lastFrame.a) { o.a = false; o.x = 0; return o; }
        o.a = true;
        return o;
    }

    _pressB(o) {
        if (this.lastFrame.b) { o.b = false; o.x = 0; return o; }
        o.b = true;
        return o;
    }
}

function hold(o, duck, x) {
    if (duck) o.y = -1;
    o.x = x;
    return o;
}
