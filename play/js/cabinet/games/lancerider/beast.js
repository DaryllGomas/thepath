// THE NODE · world 1 · LANCE RIDER · THE PIT BEAST: the great beast under the seventh wave's pit.
// Its rules only; the round owns it (round.js calls update() each step while it lives) and the
// renderer reads it.
//
// It comes up out of the lava in a cycle:
//   UNDER    1.6 s below (1.2 s once it is down to half)
//   WARN     1.1 s the lava boils where it will come up (the telegraph) and the ground rumbles
//   RISING   0.9 s the head comes up; when it is up its crown stands 100 px over the lava
//   UP       1 s still (the opening), then it turns to face you and attacks once, telegraphed, then
//            0.8 s still again before it sinks; its attacks take turns:
//              SPIT    0.8 s its throat glows, then 2 embers (3 once it is down to half) arc up and
//                      burn out as they fall (1.2 s)
//              BREATH  1.0 s it draws breath (jaws open, sparks drawn in), then a jet of fire 96 px
//                      (120 at half) out of its jaws for 1.2 s, level with its mouth
//   SINKING  0.8 s back under, and round again at another of the stage's spots
// THE CROWN is its weak point. Land on it from above (your feet on its crown and not climbing) and it
// takes the blow: it reels (HURT 0.7 s, the attack is broken off), throws you up, and goes under.
// Touch it anywhere else (the jaw, the throat, the neck) and it burns you; the edge of its skull
// only glances you off. beastHP blows (5 on credit 1) and it dies: DYING 2.6 s, and its riders burn with it.
// MERCY (the unlosable credit): its fire, its embers and its hide only throw the player clear.
import { f32 } from '../../sdk/index.js';

export const BeastState = Object.freeze({ Under: 0, Warn: 1, Rising: 2, Up: 3, Hurt: 4, Sinking: 5, Dying: 6, Dead: 7 });
export const BeastAttack = Object.freeze({ None: 0, Spit: 1, Breath: 2 });
export const AtkStage = Object.freeze({ Idle: 0, Tele: 1, Fire: 2, Recover: 3 });

export const BEAST_RISE = f32(100);      // px from the lava to its crown when it is up
export const HEAD_BACK = 15, HEAD_FRONT = 23;   // the head's box: px behind / in front of the crown
export const NECK_BACK = 10, NECK_FRONT = 6;     // the neck under it (row 25 down to the lava)
export const HEAD_ROWS = 25;             // the head's height under the crown's spikes (the sprite is 26 rows)
export const SHOULDER_HALF_W = 28, SHOULDER_H = 12;   // the hump of its back breaking the lava round the neck
export const CROWN_HALF_W = 11;          // the strike zone on top of its skull, x +-
export const MOUTH_DY = 16;              // the jaws, px under the crown (the jet's centre line)
export const JAW_DX = 22;                // the jaws' tip, px out in front of the crown
export const JET_HALF_H = 4;

export class PitBeast {
    constructor(hp, spots) {
        this.maxHp = hp; this.hp = hp;
        this.spots = spots;
        this.x = spots[0]; this.facing = -1;
        this.state = BeastState.Under; this.t = 0;
        this.rise = 0;                       // 0 under .. 1 up
        this.attack = BeastAttack.None; this.atkStage = AtkStage.Idle; this.atkT = 0; this.atkN = 0;
        this.cycle = 0;                      // risings so far (the first attack alternates by it)
        this.jetLen = 0;
        this.hurtT = 0;                      // seconds since the last blow (the renderer's flash)
        this.embers = [];                    // { x, y, vx, vy, t }
        this.underSeconds = f32(1.0);        // the first rising comes quickly
        this.blows = 0; this.burns = 0;
        this.boomT = 0;
        this.lastKill = '';                  // what last burned the player (body / jet / ember: the Lab's diagnostics)
    }

    get crownY() { return f32(218 - this.rise * BEAST_RISE); }
    get halfDown() { return this.hp * 2 <= this.maxHp; }
    get alive() { return this.state !== BeastState.Dying && this.state !== BeastState.Dead; }
    get solid() { return (this.state === BeastState.Rising && this.rise > 0.35) || this.state === BeastState.Up || this.state === BeastState.Hurt; }
    get jetOn() { return this.attack === BeastAttack.Breath && this.atkStage === AtkStage.Fire; }
    get mouthY() { return f32(this.crownY + MOUTH_DY); }

    // ------------------------------------------------------------------ one step (R = the round)
    update(R, h) {
        this.t = f32(this.t + h);
        this.hurtT = f32(this.hurtT + h);
        this._embers(R, h);
        const fierce = this.halfDown;
        switch (this.state) {
            case BeastState.Under:
                if (this.t >= this.underSeconds) this._pickSpot(R);
                break;
            case BeastState.Warn:
                if (this.t >= 1.1) { this._go(BeastState.Rising); R._emit('beastRise', { x: this.x }); R._shake(2, 0.5); }
                break;
            case BeastState.Rising:
                this.rise = Math.min(1, f32(this.t / 0.9));
                if (this.rise >= 1) { this._go(BeastState.Up); this.atkN = 0; this.attack = BeastAttack.None; this.atkStage = AtkStage.Idle; this.atkT = 0; }
                break;
            case BeastState.Up:
                this._attacks(R, h, fierce);
                break;
            case BeastState.Hurt:
                this.rise = Math.max(0.75, f32(this.rise - h * 0.4));
                if (this.t >= 0.7) this._go(BeastState.Sinking);
                break;
            case BeastState.Sinking:
                this.rise = Math.max(0, f32(this.rise - h / 0.8));
                if (this.rise <= 0) {
                    this._go(BeastState.Under);
                    this.underSeconds = f32(fierce ? 1.2 : 1.6);
                    this.attack = BeastAttack.None; this.atkStage = AtkStage.Idle;
                }
                break;
            case BeastState.Dying:
                this.rise = Math.max(0, f32(this.rise - h * 0.32));
                this.boomT = f32(this.boomT - h);
                if (this.boomT <= 0 && this.t < 2.2) {
                    this.boomT = 0.22;
                    const bx = f32(this.x + (R.rng.nextDouble() * 36 - 18)), by = f32(this.crownY + 4 + R.rng.nextDouble() * 26);
                    R._burst(R.Fx.Blast, bx, by, -1);
                    R._emit('beastBoom', {});
                    R._shake(2, 0.25);
                }
                if (this.t >= 2.6) this._go(BeastState.Dead);
                break;
        }
    }

    _go(s) { this.state = s; this.t = 0; }

    _pickSpot(R) {
        // most often it comes up at the spot nearest the player (it hunts him), else at another
        const p = R.player;
        let near = 0, nd = 1e9;
        for (let i = 0; i < this.spots.length; i++) {
            const d = Math.abs(R.wrapDx(f32(this.spots[i] - p.x)));
            if (d < nd) { nd = d; near = i; }
        }
        let pick = near;
        if (R.rng.nextDouble() >= 0.55) pick = (near + 1 + R.rng.next(this.spots.length - 1)) % this.spots.length;
        this.x = f32(this.spots[pick]);
        this.facing = R.wrapDx(f32(p.x - this.x)) >= 0 ? 1 : -1;
        this.cycle++;
        this._go(BeastState.Warn);
        R._emit('beastWarn', { x: this.x });
    }

    _attacks(R, h, fierce) {
        this.atkT = f32(this.atkT + h);
        const k = fierce ? 0.8 : 1;
        switch (this.atkStage) {
            case AtkStage.Idle:
                if (this.atkT >= (this.atkN === 0 ? 1.0 : 0.8)) {
                    if (this.atkN >= 1) { this._go(BeastState.Sinking); R._emit('beastSink', {}); return; }
                    this.attack = (this.cycle + this.atkN) % 2 === 1 ? BeastAttack.Spit : BeastAttack.Breath;
                    this.facing = R.wrapDx(f32(R.player.x - this.x)) >= 0 ? 1 : -1;   // it turns to you, then holds
                    this.atkStage = AtkStage.Tele; this.atkT = 0;
                    R._emit(this.attack === BeastAttack.Spit ? 'spitWarn' : 'breathWarn', {});
                }
                break;
            case AtkStage.Tele:
                if (this.atkT >= (this.attack === BeastAttack.Spit ? 0.8 : 1.0) * k) {
                    this.atkStage = AtkStage.Fire; this.atkT = 0; this.jetLen = 0;
                    if (this.attack === BeastAttack.Spit) {
                        const n = fierce ? 3 : 2;
                        for (let i = 0; i < n; i++) {
                            const u = n === 1 ? 0.5 : i / (n - 1);
                            this.embers.push({
                                x: f32(this.x + this.facing * 10), y: f32(this.mouthY - 2),
                                vx: f32((u - 0.5) * 90 + this.facing * 20 + (R.rng.nextDouble() * 12 - 6)),
                                vy: f32(-170 - R.rng.nextDouble() * 40), t: 0,
                            });
                        }
                        R._emit('spit', { n });
                    } else R._emit('breath', {});
                }
                break;
            case AtkStage.Fire:
                if (this.attack === BeastAttack.Breath) {
                    const max = fierce ? 120 : 96;
                    this.jetLen = Math.min(max, f32(this.jetLen + h * 640));
                    if (this.atkT >= 1.2) { this.atkStage = AtkStage.Recover; this.atkT = 0; this.jetLen = 0; }
                } else if (this.atkT >= 0.25) { this.atkStage = AtkStage.Recover; this.atkT = 0; }
                break;
            case AtkStage.Recover:
                if (this.atkT >= 0.5) { this.atkStage = AtkStage.Idle; this.attack = BeastAttack.None; this.atkT = 0; this.atkN++; }
                break;
        }
    }

    _embers(R, h) {
        for (let i = this.embers.length - 1; i >= 0; i--) {
            const e = this.embers[i];
            e.t = f32(e.t + h);
            e.vy = f32(e.vy + 260 * h);
            e.x = R.wrap(f32(e.x + e.vx * h)); e.y = f32(e.y + e.vy * h);
            let dead = e.y >= 218 || e.t >= 1.2;
            if (!dead && e.vy > 0) for (const L of R.ledges) {
                if (L.gone || e.y < L.top || e.y > L.bottom) continue;
                if (R.onLedgeX(L, e.x, 1)) { dead = true; break; }
            }
            if (dead) { R._burst(R.Fx.EggSizzle, e.x, Math.min(218, e.y), -1); this.embers.splice(i, 1); }
        }
    }

    // a blow on the crown: it reels, throws the player up, and goes under
    strike(R) {
        this.hp--; this.blows++;
        this.hurtT = 0;
        this.attack = BeastAttack.None; this.atkStage = AtkStage.Idle; this.jetLen = 0;
        if (this.hp <= 0) {
            this.hp = 0;
            this._go(BeastState.Dying); this.boomT = 0;
            R._emit('beastDie', {});
            R._shake(4, 1.2);
        } else {
            this._go(BeastState.Hurt);
            R._emit('beastHit', { left: this.hp });
            R._shake(3, 0.35);
        }
    }

    // ------------------------------------------------------------------ contact with the player
    // returns 'strike' | 'glance' | 'burn' | null; the round decides what it costs
    touch(p) {
        if (!this.solid) return null;
        const rel = f32(wrapLocal(f32(p.x - this.x)) * this.facing);         // px out in front of the crown
        const cy = this.crownY;
        const top = p.y >= cy - 5 && p.y <= cy + 6;
        if (Math.abs(rel) < CROWN_HALF_W && top && p.vy > -40) return this.state === BeastState.Hurt ? 'glance' : 'strike';
        const overHead = rel > -HEAD_BACK - 7 && rel < HEAD_FRONT + 7;
        if (overHead && top) return 'glance';
        // the head (the player's box: 7 px each side, 13 px up from his feet), and the neck under it
        if (p.y <= cy + 6 || f32(p.y - 13) >= 218) return null;
        if (overHead && f32(p.y - 13) < cy + HEAD_ROWS) return 'burn';
        if (rel > -NECK_BACK - 7 && rel < NECK_FRONT + 7) return 'burn';
        if (Math.abs(rel) < SHOULDER_HALF_W + 7 && p.y > f32(218 - SHOULDER_H * this.rise - 1)) return 'burn';
        return null;
    }

    // the jet and the embers
    fireTouches(p) {
        if (this.jetOn && this.jetLen > 0) {
            const my = this.mouthY;
            if (p.y > my - JET_HALF_H && f32(p.y - 13) < my + JET_HALF_H) {
                const rel = f32(wrapLocal(f32(p.x - this.x)) * this.facing);      // px out in front of the crown
                if (rel + 7 > JAW_DX && rel - 7 < JAW_DX + this.jetLen) { this.lastKill = 'jet'; return true; }
            }
        }
        for (const e of this.embers) {
            if (Math.abs(wrapLocal(f32(e.x - p.x))) < 3 && e.y > p.y - 11 && e.y < p.y - 1) { this.lastKill = 'ember'; return true; }
        }
        return false;
    }
}

function wrapLocal(dx) {
    while (dx > 152) dx = f32(dx - 304);
    while (dx < -152) dx = f32(dx + 304);
    return dx;
}
