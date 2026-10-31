// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE BOT: a modelled average player.
// Built out (2026-10-18) from the port of IronDojoBot.cs (Staging/Batch3/irondojo) to climb all five floors.
//
// It plays through the control panel like anyone else and reads the sim only to see what is on the tube. Every new
// attacker, knife, pot and master's wind-up is NOTICED after a human reaction time (0.14-0.32 s, plus a 0.35 s lapse
// 6 % of the time); until then it does not exist for the bot. It thinks in the sim's own direction (up the floor =
// left) and flips its stick on the floors that run right, as a player's hands do without thinking.
//   - grabbed: wiggle the stick left/right at 6-9 presses a second until he lets go
//   - a pot over its head (its shadow under its feet) with under a second to fall: step out from under it; a quarter
//     of the time it tries to knock a falling pot out of the air instead
//   - anything flying (knives, the ring both ways, blades, the giant's shockwave, the palm of fire): duck a HIGH one,
//     jump a LOW one, timed to its speed (6 % of them it reads wrong)
//   - always answer the NEARER attacker first: KICK at kick range, PUNCH up close; a dwarf or a snake gets a ducking
//     kick (or, a quarter of the time, a jump); a lizard a standing blow as it comes in; a ghost is let alone while
//     it shimmers, struck once it is solid, and its wind-up is answered with a ducking punch (under its strike)
//   - a bowl of tea nearby and nobody close: walk over it
//   - the masters: hold just inside the reach of the stick (twin blades, the iron master the same) and wait for the
//     TELEGRAPH, then step in and PUNCH. It judges (with 0.12 s of error) whether it can get there before the blow
//     comes down; if not it backs out of reach (20 % of the time it goes in anyway) and punishes the recovery. Now and
//     then (impatience) it swings at a guarded master and eats the parry (twice in a row against the iron master is
//     how it gets countered). The ring dancer: wait at range for the throw, dodge it, rush him while his ring is out,
//     and duck or jump it again on its way home. The giant: kick him, and back away from every wind-up.
//   - otherwise walk up the floor, then to the stairs
// Its timing is sloppy by up to timingSlop px either way, and it cannot press a button that is still held (a blow
// needs a fresh press, as on the real panel). Its dice are its own (this.rng).
import { f32, CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { IronDojoSim, Act, FoeKind, FoeState, BossState, BossKind, Atk, ShotKind } from './sim.js';

const C = IronDojoSim.C;
const F32_MAX = 3.4028234663852886e38;          // float.MaxValue

export class IronDojoBot extends CabinetBotBase {
    constructor() {
        super();
        this.reactMin = f32(0.14); this.reactMax = f32(0.32);
        this.lapseChance = f32(0.06); this.lapseExtra = f32(0.35);
        this.wrongAnswer = f32(0.06);
        this.jumpDwarfChance = f32(0.25);
        this.smashChance = f32(0.25);
        this.wiggleHzMin = f32(6); this.wiggleHzMax = f32(9);
        this.timingSlop = f32(8);
        this.impatience = f32(0.2);                  // per second at a guarded master: a hopeful swing
        this.teleReactMin = f32(0.12); this.teleReactMax = f32(0.40);   // seeing the wind-up start
        this.judgeSlop = f32(0.12);                  // s of error in reading how long the wind-up has left
        this.bravado = f32(0.2);                     // goes in anyway when the read says no

        this._seenAt = new Map();
        this._slop = new Map();
        this._misread = new Set();
        this._jumper = new Set();
        this._smasher = new Set();
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
        this._seenAt.clear(); this._slop.clear(); this._misread.clear(); this._jumper.clear(); this._smasher.clear();
        this._lastBoss = BossState.Wait; this._teleSeenAt = F32_MAX; this._wiggleT = 0; this._wiggleDir = 1; this._hopeT = 0;
        this._teleDecided = this._teleGo = false;
    }

    _react() { return f32(this.range(this.reactMin, this.reactMax) + (this.chance(this.lapseChance) ? this.lapseExtra : 0)); }

    _seen(id, now) { return this._seenAt.has(id) && now >= this._seenAt.get(id); }

    _slopOf(id) { return this._slop.has(id) ? this._slop.get(id) : 0; }

    // the stick in the sim's direction; on a floor that runs right the hands flip it
    think(sim, dt) {
        const o = this._think(sim, dt);
        if (sim != null && sim.mirror && o.x !== 0) o.x = -o.x;
        return o;
    }

    _think(s, dt) {
        if (s == null || s.p !== IronDojoSim.Phase.Play) return InputFrame.neutral;
        const now = s.time;
        const f = s.f;
        const cam = s.cam;

        // ---- notice what has come onto the tube
        for (const e of s.foes) {
            if (!e.live || this._seenAt.has(e.id) || !cam.onScreen(e.x, 4)) continue;
            this._seenAt.set(e.id, f32(now + this._react()));
            this._slop.set(e.id, this.range(-this.timingSlop, this.timingSlop));
            if ((e.kind === FoeKind.Dwarf || e.kind === FoeKind.Snake) && this.chance(this.jumpDwarfChance)) this._jumper.add(e.id);
        }
        for (const k of s.shots) {
            if (this._seenAt.has(k.id)) continue;
            this._seenAt.set(k.id, f32(now + this._react()));
            this._slop.set(k.id, this.range(-this.timingSlop, this.timingSlop));
            if (this.chance(this.wrongAnswer)) this._misread.add(k.id);
        }
        for (const p of s.pots) {
            if (this._seenAt.has(p.id)) continue;
            this._seenAt.set(p.id, f32(now + this._react()));
            if (this.chance(this.smashChance)) this._smasher.add(p.id);
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

        // ---- a pot overhead: out from under it (or, for the bold, knock it out of the air)
        for (const p of s.pots) {
            if (!this._seen(p.id, now)) continue;
            const dx = f32(p.x - f.x), ad = Math.abs(dx);
            if (this._smasher.has(p.id) && p.s === 1 && p.h > 16 && p.h < 40 && ad < 26 && free) {
                o.x = dx < 0 ? -1 : 1;
                return this._pressA(o);
            }
            if (ad < C.PotRadius + 7 && p.eta < 1.0 && free && (p.eta < 0.45 || !this._crawlerNear(s, now))) {
                o.x = dx <= 0 ? 1 : -1;                                             // step to the side it is not on
                if (f.x > s.floorLength - 40) o.x = -1;
                return o;
            }
        }

        // ---- anything flying: the nearest one still coming at us
        let shot = null, kd = F32_MAX;
        for (const k of s.shots) {
            if (k.passed || !this._seen(k.id, now)) continue;
            const d = f32(f32(f.x - k.x) * k.dir);                                 // px until it reaches us
            if (d < -2) continue;
            if (d < kd) { kd = d; shot = k; }
        }
        let duck = false;
        if (shot != null) {
            const high = shot.high !== this._misread.has(shot.id);
            const sl = this._slopOf(shot.id);
            const jumpAt = f32(f32(shot.speed * f32(0.28)) + sl);
            if (high) { if (kd < f32(shot.speed * f32(0.58))) duck = true; }
            else if (kd < f32(jumpAt + 56)) {
                if (kd < jumpAt && kd > 8 && free) { o.y = 1; return o; }            // jump it
                if (kd >= jumpAt) return o;                                         // stand and time the jump
            }
        }

        // ---- the nearest attacker we have noticed
        let near = null, nd = F32_MAX;
        for (const e of s.foes) {
            if (!e.live || e.s === FoeState.Hold || e.s === FoeState.Fade || !this._seen(e.id, now)) continue;
            if ((e.kind === FoeKind.Dwarf || e.kind === FoeKind.Snake) && e.s === FoeState.Walk && f32(f32(f.x - e.x) * e.dir) < -6) { this._jumper.delete(e.id); continue; }   // rolling away (next time: kick him)
            if (e.kind === FoeKind.Lizard && f32(f32(f.x - e.x) * e.dir) < -10) continue;                                                                          // flying away
            const d = Math.abs(f32(e.x - f.x));
            if (d < nd) { nd = d; near = e; }
        }
        const bossLive = b.active && b.alive;
        const bd = bossLive ? Math.abs(f32(b.x - f.x)) : F32_MAX;

        if (near != null && nd < 150 && (!bossLive || nd <= bd)) {
            const toward = near.x >= f.x ? 1 : -1;
            const sl = this._slopOf(near.id);
            if (near.kind === FoeKind.Dwarf || near.kind === FoeKind.Snake) {
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
            if (near.kind === FoeKind.Lizard) {
                if (!free) return hold(o, true, 0);
                if (nd <= f32(f32(C.PunchReach - 4 + f32(near.speed * C.PunchStart)) + Math.min(0, sl))) { o.x = toward; return this._pressA(o); }
                if (nd <= f32(f32(C.KickReach - 4 + f32(near.speed * C.KickStart)) + Math.min(0, sl)) && nd > 16) { o.x = toward; return this._pressB(o); }
                if (nd < 14) { o.y = -1; return o; }                               // too close to strike: under it
                return hold(o, duck, 0);
            }
            if (near.kind === FoeKind.Ghost) {
                if (near.s === FoeState.Shimmer) {                                  // not there yet: wait at arm's length
                    if (nd < 26) { o.x = -toward; return o; }
                    return hold(o, duck, 0);
                }
                if (near.s === FoeState.Windup) {                                   // under his strike, and hit him there
                    if (!free) return hold(o, true, 0);
                    o.y = -1; o.x = toward;
                    if (nd <= C.LowPunchReach - 2) return this._pressA(o);
                    if (nd <= C.LowKickReach - 2) return this._pressB(o);
                    o.x = 0; return o;
                }
            }
            if (near.kind === FoeKind.Thrower || near.kind === FoeKind.Ghost || near.s === FoeState.Stunned) {
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

        // ---- a bowl of tea, close, with nobody on us
        if (!bossLive && free && (near == null || nd > 70) && f.energy < f.maxEnergy)
            for (const q of s.pickups) {
                const d = f32(q.x - f.x);
                if (Math.abs(d) < 90 && Math.abs(d) > 3) { o.x = d < 0 ? -1 : 1; return o; }
            }

        // ---- the master
        if (b.s !== BossState.Telegraph) this._teleDecided = false;
        if (bossLive && bd < 170 && (near == null || bd < nd || nd >= 90)) return this._boss(s, o, b, bd, dt, now, free);

        // ---- nothing on us: up the floor, toward the stairs
        o.x = -1;
        return o;
    }

    _boss(s, o, b, bd, dt, now, free) {
        const f = s.f, K = b.spec;
        const toward = b.x >= f.x ? 1 : -1;

        // THE GIANT: he takes blows, so kick him; back away from every wind-up (the waves are dodged above)
        if (b.kind === BossKind.Giant) {
            const tele = b.s === BossState.Telegraph && now >= this._teleSeenAt;
            if (tele) {
                const safe = b.atk === Atk.Slam ? 40 : K.reach + 8;
                if (bd < safe) { o.x = -toward; return o; }
                return o;
            }
            if (b.s === BossState.Telegraph) return o;                              // not seen yet: carry on
            if (!free) return o;
            if (bd <= C.PunchReach + 4) { o.x = toward; return this._pressA(o); }
            if (bd <= C.KickReach + 4) { o.x = toward; return this._pressB(o); }
            o.x = toward;
            return o;
        }

        // THE RING DANCER: while his ring is out he is open: rush him
        if (b.kind === BossKind.Ring && !b.armed && b.s !== BossState.Hurt) {
            if (!free) return o;
            if (bd <= C.PunchReach - 1) { o.x = toward; return this._pressA(o); }
            if (bd <= C.KickReach - 1) { o.x = toward; return this._pressB(o); }
            o.x = toward;
            return o;
        }

        if (b.s === BossState.Telegraph && now >= this._teleSeenAt && !this._teleDecided) {
            // the read: can I get inside and land a punch before that blow comes down? (a throw or a palm of fire is
            // dodged, not raced, unless he is right there)
            const left = f32(b.t + this.range(-this.judgeSlop, this.judgeSlop));
            const need = f32(f32(f32(Math.max(0, f32(f32(bd - (C.PunchReach - 1)) - 6)) / C.WalkSpeed) + C.PunchStart) + f32(0.03));
            const ranged = b.atk === Atk.Throw || b.atk === Atk.Chi;
            this._teleGo = (left >= need && (!ranged || bd < 44)) || (!ranged && this.chance(this.bravado));
            this._teleDecided = true;
        }
        const rush = (b.s === BossState.Telegraph && this._teleDecided && this._teleGo) || b.s === BossState.Swing && b.atk !== Atk.Double || b.s === BossState.Recover;
        if (rush) {
            if (!free) return o;
            if (bd <= C.PunchReach - 1) { o.x = toward; return this._pressA(o); }
            if (b.s !== BossState.Telegraph && bd <= C.KickReach - 1) { o.x = toward; return this._pressB(o); }
            o.x = toward;
            return o;
        }
        if (b.s === BossState.Telegraph && this._teleDecided) {
            // too late to beat him to it: back out of reach and punish the recovery (a throw: hold and dodge it)
            if (b.atk === Atk.Throw || b.atk === Atk.Chi) return o;
            o.x = bd < K.reach + 6 ? -toward : 0;
            return o;
        }
        if (b.s === BossState.Hurt || b.s === BossState.Swing) { if (b.s === BossState.Swing && bd < K.reach + 6) o.x = -toward; return o; }
        // guarded: hover (the ring dancer: at range, unless he has his back to the stairs)
        let lo = 38, hi = 48;
        if (b.kind === BossKind.Ring && b.x > C.BossMinX + 6) { lo = 66; hi = 92; }
        this._hopeT = f32(this._hopeT - dt);
        const wary = b.kind === BossKind.Master && b.parries > 0;                  // one parried blow: not a second
        if (free && !wary && bd <= C.KickReach && this._hopeT <= 0 && this.chance(f32(this.impatience * dt))) {
            this._hopeT = f32(1.5);
            o.x = toward;
            return this._pressB(o);
        }
        if (bd < lo) { o.x = -toward; return o; }
        if (bd > hi) { o.x = toward; return o; }
        return o;
    }

    // a dwarf or a snake rolling at us, close: answer it before stepping out from under a pot that has time yet
    _crawlerNear(s, now) {
        const f = s.f;
        for (const e of s.foes)
            if ((e.kind === FoeKind.Dwarf || e.kind === FoeKind.Snake) && e.s === FoeState.Walk && this._seen(e.id, now) &&
                Math.abs(f32(e.x - f.x)) < 60 && f32(f32(f.x - e.x) * e.dir) >= -6) return true;
        return false;
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
