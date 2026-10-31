// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · THE HIVE QUEEN (stage 8, the climax; build-out 2026-10-18).
//
// She comes down from the top of the field while her guard (six escorts, eight drones) flies into the ranks below her,
// and sways there, wider as she is hurt. Her parts (offsets from her centre; shots come up from below):
//   the WINGS      |dx| 12..35, dy -12..11: armoured, 16 hits each (x the queenArmour knob). A broken wing is a ragged
//                  stump that shots fly past. 50 a hit, 2000 a wing.
//   the BODY       |dx| 7..11: chitin. Shots ring off it (clank).
//   the EYE        |dx| <= 6, up to dy 12: shut under steel until both wings are gone; then it opens and shuts (open
//                  2.6 s, shut 1.7 s). Open, it takes the hits: 20 (x queenArmour), 100 each. Shut, it clanks.
// PHASES (one per wing lost): 1 she spits FANS of 3 bolts (telegraph: the mandibles glow gold for 0.7 s).
//   2 fans of 5, HATCH (two mites drop from her abdomen at you), and a STRIKE: a dotted line marks a spot on the lane for
//   0.85 s, then a sting beam lashes it for 0.8 s.  3 the eye cycle starts; strikes come in pairs (one where you are,
//   one a step towards the middle: read the marks), fans of 5, three mites a hatch.
// Her death (the round's Finale): blasts walk across her for 2.6 s, then one big one; QUEEN 20000.
// Deterministic: her dice are the round's (r._rng).
import { f32 } from '../../sdk/index.js';
import { WingBonus } from './stages.js';

const ArriveY = f32(64), ArriveSpeed = f32(34);
const FanTele = f32(0.7), StrikeTele = f32(0.85), StrikeFire = f32(0.8), HatchTele = f32(0.5);
const StrikeHalf = 6;
const EyeOpenSeconds = f32(2.6), EyeShutSeconds = f32(1.7);
const Gap = [0, f32(2.9), f32(2.4), f32(2.0)];              // seconds between attacks, by phase
const Amp = [0, 46, 66, 84], SwayW = [0, f32(0.45), f32(0.55), f32(0.7)];
const Rotation = [null, ['fan'], ['fan', 'hatch', 'strike'], ['strike', 'fan', 'hatch']];
const BlastEvery = f32(0.12);

function clampF(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class HiveQueen {
    constructor(armour = 1) {
        const wingHp = Math.max(6, Math.round(16 * armour)), coreHp = Math.max(8, Math.round(20 * armour));
        this.x = f32(160); this.y = f32(-40);
        this.arrived = false; this.t = 0; this.swayT = 0; this.amp = 0;
        this.wings = [{ hp: wingHp, max: wingHp, flash: 0, broken: false }, { hp: wingHp, max: wingHp, flash: 0, broken: false }];
        this.coreHp = coreHp; this.coreMax = coreHp; this.coreFlash = 0; this.armourFlash = 0;
        this.eye = 0; this.eyeOpen = false; this.eyeT = 0;
        this.phase = 1;
        this.atk = null;          // { name: 'fan' | 'strike' | 'hatch', stage: 0 telegraph / 1 firing, t, xs }
        this.atkTimer = f32(1.4); this.atkIdx = 0; this._atkSeq = 0;
        this.beams = [];          // live sting beams: { ox, oy, x, t }
        this.dying = false; this.dead = false; this.gone = false; this.deathT = 0; this._nextBlast = 0;
    }

    get busy() { return this.atk != null || this.beams.length > 0; }
    get charged() { return this.atk != null && this.atk.name === 'fan' && this.atk.stage === 0; }
    get hatching() { return this.atk != null && this.atk.name === 'hatch' && this.atk.stage === 0; }
    get vulnerable() { return this.phase >= 3 && this.eye >= 0.75; }
    get wingsLeft() { return (this.wings[0].broken ? 0 : 1) + (this.wings[1].broken ? 0 : 1); }

    update(r, h, allowAttacks) {
        this.t = f32(this.t + h);
        for (const w of this.wings) if (w.flash > 0) w.flash = Math.max(0, f32(w.flash - h));
        if (this.coreFlash > 0) this.coreFlash = Math.max(0, f32(this.coreFlash - h));
        if (this.armourFlash > 0) this.armourFlash = Math.max(0, f32(this.armourFlash - h));
        if (this.dying) { this._die(r, h); return; }

        // come down, then sway (wider as she is hurt; the amplitude eases so she never jumps)
        if (!this.arrived) {
            this.y = f32(this.y + f32(ArriveSpeed * h));
            if (this.y >= ArriveY) { this.y = ArriveY; this.arrived = true; r._emit('queenArrive'); }
        } else {
            const want = Amp[this.phase];
            this.amp = this.amp < want ? Math.min(want, f32(this.amp + f32(14 * h))) : want;
            this.swayT = f32(this.swayT + f32(SwayW[this.phase] * h));
            this.x = f32(160 + f32(this.amp * f32(Math.sin(this.swayT))));
        }

        // the eye (phase 3): open, shut, open ...
        if (this.phase >= 3) {
            this.eyeT = f32(this.eyeT - h);
            if (this.eyeT <= 0) {
                this.eyeOpen = !this.eyeOpen;
                this.eyeT = this.eyeOpen ? EyeOpenSeconds : EyeShutSeconds;
                r._emit('eye', { open: this.eyeOpen });
            }
        }
        const eyeWant = this.phase >= 3 && this.eyeOpen ? 1 : 0;
        this.eye = this.eye < eyeWant ? Math.min(1, f32(this.eye + f32(4 * h))) : Math.max(0, f32(this.eye - f32(4 * h)));

        // the sting beams lash for StrikeFire s each
        for (let i = this.beams.length - 1; i >= 0; i--) {
            const b = this.beams[i];
            b.t = f32(b.t + h);
            if (b.t >= StrikeFire) { this.beams.splice(i, 1); continue; }
            r.hitByColumn(b.x, StrikeHalf);
        }

        if (!this.arrived) return;
        if (!allowAttacks) { this.atk = null; return; }
        if (this.atk == null) {
            this.atkTimer = f32(this.atkTimer - h);
            if (this.atkTimer <= 0) this._begin(r);
            return;
        }
        const A = this.atk;
        A.t = f32(A.t + h);
        if (A.stage === 0) {
            const tele = A.name === 'fan' ? FanTele : A.name === 'strike' ? StrikeTele : HatchTele;
            if (A.t >= tele) { A.stage = 1; A.t = 0; this._fire(r, A); }
        } else if (A.t >= 0.25) { this.atk = null; this.atkTimer = Gap[this.phase]; }
    }

    _begin(r) {
        const rot = Rotation[this.phase];
        const name = rot[this.atkIdx % rot.length];
        this.atkIdx++;
        const A = { id: ++this._atkSeq, name, stage: 0, t: 0, xs: [] };
        if (name === 'strike') {
            const px = clampF(r.playerX, 20, 300);
            A.xs.push(px);
            if (this.phase >= 3) A.xs.push(clampF(f32(px + (px < 160 ? 44 : -44)), 20, 300));
        }
        this.atk = A;
        r._emit('queenTele', { atk: name });
    }

    _fire(r, A) {
        const ox = this.x, oy = f32(this.y + 18);
        if (A.name === 'fan') {
            const n = this.phase === 1 ? 3 : 5, sp = f32(130 + 14 * this.phase);
            const aim = Math.atan2(f32(204 - oy), f32(r.playerX - ox));
            for (let i = 0; i < n; i++) {
                const a = f32(aim + f32((i - (n - 1) / 2) * 0.2));
                r.fireBolt(ox, oy, f32(Math.cos(a) * sp), Math.max(60, f32(Math.sin(a) * sp)));
            }
        } else if (A.name === 'strike') {
            for (const x of A.xs) this.beams.push({ id: A.id, ox, oy, x, t: 0 });
        } else {
            const n = this.phase >= 3 ? 3 : 2;
            for (let i = 0; i < n; i++) {
                const vx = clampF(f32(f32(f32(r.playerX - ox) * 0.7) + f32((i - (n - 1) / 2) * 34)), -100, 100);
                r.spawnMite(f32(ox + (i - (n - 1) / 2) * 6), f32(oy - 2), vx, f32(30));
            }
        }
        r._emit('queenFire', { atk: A.name });
    }

    // what a player shot at (x, y) meets: 0 nothing, 1 armour (the body, or the shut eye), 2 the left wing, 3 the right
    // wing, 4 the open eye
    shotHits(sx, sy) {
        if (!this.arrived && this.y < 40) return 0;
        const dx = f32(sx - this.x), dy = f32(sy - this.y), adx = Math.abs(dx);
        if (adx <= 11) {
            if (dy > 12 || dy < -22) return 0;
            if (adx <= 6) return this.vulnerable ? 4 : 1;
            return 1;
        }
        if (adx <= 35 && dy <= 11 && dy >= -16) {
            const w = this.wings[dx < 0 ? 0 : 1];
            if (!w.broken) return dx < 0 ? 2 : 3;
        }
        return 0;
    }

    takeHit(r, code, sx) {
        if (code === 1) {
            this.armourFlash = f32(0.08);
            r._burst(sx, f32(this.y + 12), 4);
            r._emit('clank', { queen: true });
            return;
        }
        if (code === 4) {
            this.coreHp--; this.coreFlash = f32(0.1);
            r._addScore(100);
            r._burst(sx, f32(this.y + 8), 1);
            r._emit('queenHit', { part: 'eye', left: this.coreHp });
            if (this.coreHp <= 0) { this.dead = true; this.dying = true; this.deathT = 0; this.atk = null; this.beams.length = 0; }
            return;
        }
        const side = code === 2 ? 0 : 1, w = this.wings[side];
        w.hp--; w.flash = f32(0.1);
        r._addScore(50);
        r._burst(sx, f32(this.y + 6), 1);
        r._emit('queenHit', { part: 'wing', side, left: w.hp });
        if (w.hp <= 0) {
            w.broken = true;
            const wx = f32(this.x + (side === 0 ? -23 : 23));
            r._addScore(WingBonus);
            r._pop(wx, f32(this.y + 18), String(WingBonus), 'gold', 1.4);
            r._burst(wx, f32(this.y - 2), 5);
            r.shake = Math.max(r.shake, 3);
            r._emit('wingBreak', { side });
            this.phase = 3 - this.wingsLeft;
            this.atk = null; this.atkTimer = f32(1.0); this.atkIdx = 0;
            if (this.phase >= 3) { this.eyeOpen = false; this.eyeT = f32(1.0); }
            r._emit('queenPhase', { phase: this.phase });
        }
    }

    // the finale: blasts walk over her body for FinaleBlast s, then the big one (the round times the card)
    _die(r, h) {
        this.deathT = f32(this.deathT + h);
        this.y = f32(this.y + f32(5 * h));
        if (this.gone) return;
        if (this.deathT >= 2.6) {
            this.gone = true;
            r._burst(this.x, this.y, 6);
            r.flash = 1; r.shake = Math.max(r.shake, 4);
            r._emit('queenGone');
            return;
        }
        if (this.deathT >= this._nextBlast) {
            this._nextBlast = f32(this._nextBlast + BlastEvery);
            const bx = f32(this.x + f32(f32(r._rng.nextDouble() - 0.5) * 60)), by = f32(this.y + f32(f32(r._rng.nextDouble() - 0.5) * 32));
            r._burst(bx, by, Math.trunc(this.deathT / BlastEvery) % 4 === 0 ? 3 : 0);
            r.shake = Math.max(r.shake, 1.5);
            if (Math.trunc(this.deathT / BlastEvery) % 3 === 0) r._emit('queenBoom', {});
        }
    }
}

HiveQueen.StrikeHalf = StrikeHalf;
HiveQueen.StrikeTele = StrikeTele;
HiveQueen.ArriveY = ArriveY;
