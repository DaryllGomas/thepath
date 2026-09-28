// THE NODE · world 1 · STARVECTOR on the Cabinet Engine · THE FIELD's rules (port of StarvectorSim.cs).
//
// A vector space shooter on a wrap-around field (y DOWN) the size of the tube's safe area, 304 x 224.
// The ship rotates, thrusts and fires; wireframe rocks split large -> medium -> small; a red saucer
// crosses now and then and shoots at the ship. A WAVE is cleared when no rocks are left (the saucer
// does not count). `lives` = ships left including the one in play.
//
// Changes from Unity (see NOTES.md): everything is drawn about 1.6x bigger, so the collision sizes grew
// with it; B raises a SHIELD (the control panel art says FIRE / SHIELD) that runs on a per-wave energy
// budget and bounces rocks off; explosions are RECORDS (booms with a birth time and a seed) that the
// renderer draws from, so drawing never touches the dice; a respawn that waits on a crowded centre gives
// up after 3 s and comes in shielded by its invulnerability.
// Plain doubles, not f32: there is no C# CabinetSDK port of this game to match bit for bit. A seed still
// plays the same round every time (the determinism check).
import { SystemRandom, SoundCue } from '../../sdk/index.js';

export const FW = 304, FH = 224;                  // the field (screen = field + 8 px)
const TAU = Math.PI * 2;

export function wdx(dx) { return dx > FW * 0.5 ? dx - FW : dx < -FW * 0.5 ? dx + FW : dx; }
export function wdy(dy) { return dy > FH * 0.5 ? dy - FH : dy < -FH * 0.5 ? dy + FH : dy; }
function wrapX(x) { return x < 0 ? x + FW : x >= FW ? x - FW : x; }
function wrapY(y) { return y < 0 ? y + FH : y >= FH ? y - FH : y; }
export function deltaAngle(a, b) {                 // b - a, in (-pi, pi]
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU; else if (d <= -Math.PI) d += TAU;
    return d;
}

export class StarvectorField {
    constructor(seed) {
        this.rng = seed === 0 ? new SystemRandom() : new SystemRandom(seed);
        this.rocks = []; this.bolts = []; this.booms = [];
        this.cues = null;                          // the round's CueBuffer (Hit, Die, Miss)
        this.now = 0;                              // field clock (booms age on it)

        // ship
        this.shipX = FW * 0.5; this.shipY = FH * 0.5; this.shipVx = 0; this.shipVy = 0;
        this.shipA = 0;                            // radians, 0 = up the screen, + = clockwise
        this.shipAlive = false; this.thrusting = false; this.thrustT = 0;
        this.shielding = false; this.shield = 0; this.shieldMax = 0;
        this.autoShieldT = 0; this.assistLeft = 0; this.assistUsed = 0; this.savedAt = -99;   // the SHIELD ASSIST
        this.respawnT = 0; this.invulnT = 0; this.fireCd = 0;

        // saucer
        this.saucerOn = false; this.saucerX = 0; this.saucerY = 0;
        this.saucerVx = 0; this.saucerBaseY = 0; this.saucerT = 0; this.saucerFireT = 0; this.saucerTimer = 0;

        this.lives = 0; this.score = 0; this.wave = 0;
        this.rocksShot = 0; this.saucersShot = 0; this.shipsLost = 0; this.shots = 0; this.bumps = 0; this.shieldUsed = 0;
        this._boomSeed = 1;

        // ---- knobs (the round sets them from the spec's knobs)
        this.shipInvincible = false;               // mercy credit: nothing can take a ship
        this.saucerFires = true;
        this.saucerAimError = 0.30;                // radians either side
        this.saucerFirst = 7; this.saucerEvery = 14; this.saucerSpeed = 40; this.saucerFireEvery = 1.6; this.saucerBoltSpeed = 110;
        this.rockSpeed = 1;                        // x the rock speeds below
        this.rotSpeed = 4.4; this.thrustAcc = 150; this.drag = 0.55; this.maxSpeed = 150;
        this.boltSpeed = 210; this.boltLife = 0.85; this.fireEvery = 0.25; this.maxBolts = 4;
        this.respawnSeconds = 2.0; this.invulnSeconds = 2.0;
    }

    rand() { return this.rng.nextDouble(); }
    range(a, b) { return a + (b - a) * this.rng.nextDouble(); }
    get fwdX() { return Math.sin(this.shipA); }
    get fwdY() { return -Math.cos(this.shipA); }
    get waveCleared() { return this.rocks.length === 0; }
    get dead() { return !this.shipAlive && this.lives <= 0; }
    get boltRange() { return this.boltSpeed * this.boltLife; }

    static rockRadius(size) { return size === 3 ? 26 : size === 2 ? 16 : 9; }
    static rockPoints(size) { return size === 3 ? 20 : size === 2 ? 50 : 100; }

    newGame(ships) {
        this.lives = ships; this.score = 0; this.wave = 0;
        this.rocksShot = this.saucersShot = this.shipsLost = this.shots = this.bumps = 0; this.shieldUsed = 0;
        this.byRock = this.byBolt = this.bySaucer = 0;
        this.rocks.length = 0; this.bolts.length = 0; this.booms.length = 0;
        this._resetShip();
    }

    _resetShip() {
        this.shipX = FW * 0.5; this.shipY = FH * 0.5; this.shipVx = this.shipVy = 0; this.shipA = 0;
        this.shipAlive = true; this.invulnT = this.invulnSeconds; this.fireCd = 0; this.thrustT = 0; this.autoShieldT = 0;
    }

    startWave(n, largeRocks, shieldSeconds) {
        this.wave = n;
        this.rocks.length = 0; this.bolts.length = 0;
        this.saucerOn = false; this.saucerTimer = this.saucerFirst;
        this.shieldMax = shieldSeconds; this.shield = shieldSeconds; this.shielding = false; this.autoShieldT = 0;
        if (this.shipAlive) { this.shipX = FW * 0.5; this.shipY = FH * 0.5; this.shipVx = this.shipVy = 0; this.shipA = 0; this.invulnT = this.invulnSeconds; }
        for (let i = 0; i < largeRocks; i++) {
            let x = 0, y = 0;
            for (let k = 0; k < 40; k++) {
                x = this.range(0, FW); y = this.range(0, FH);
                if (Math.hypot(wdx(x - this.shipX), wdy(y - this.shipY)) > 100) break;
            }
            this.rocks.push(this._makeRock(x, y, 3));
        }
    }

    _makeRock(x, y, size) {
        const sp = (size === 3 ? this.range(12, 22) : size === 2 ? this.range(24, 36) : this.range(38, 52)) * this.rockSpeed;
        const a = this.range(0, TAU);
        // the 3D tumble the renderer draws: a base orientation, a spin axis, per-vertex lumps
        const ax = this.range(-1, 1), ay = this.range(-1, 1), az = this.range(-1, 1);
        const al = Math.max(1e-3, Math.hypot(ax, ay, az));
        const r = {
            x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size, r: StarvectorField.rockRadius(size),
            ang: this.range(0, TAU), spin: this.range(0.5, 1.3) * (this.rand() < 0.5 ? -1 : 1),
            ax: ax / al, ay: ay / al, az: az / al,
            e0: this.range(0, TAU), e1: this.range(0, TAU), e2: this.range(0, TAU),
            lumps: new Float32Array(20),
        };
        for (let i = 0; i < 20; i++) r.lumps[i] = this.range(0.9, 1.05);
        return r;
    }

    _boom(x, y, kind, extra) {
        const b = { x, y, kind, t0: this.now, seed: (this._boomSeed = (Math.imul(this._boomSeed, 1103515245) + 12345) | 0), a: 0, vx: 0, vy: 0, size: 0 };
        if (extra) Object.assign(b, extra);
        this.booms.push(b);
    }

    _cue(c) { if (this.cues) this.cues.emit(c); }

    // the clock only (banner, card): booms keep ageing, nothing moves
    clock(dt) { this.now += dt; this._pruneBooms(); }

    _pruneBooms() {
        for (let i = this.booms.length - 1; i >= 0; i--) if (this.now - this.booms[i].t0 > 1.8) this.booms.splice(i, 1);
    }

    // Advance dt seconds with this frame's controls. Returns true if a ship was lost.
    tick(dt, turn, thrust, fire, shield, firePressed = false) {
        let lost = false;
        const n = Math.max(1, Math.ceil(dt * 120));
        const h = dt / n;
        for (let i = 0; i < n; i++) { lost = this._step(h, turn, thrust, fire, shield, firePressed && i === 0) || lost; }
        this._pruneBooms();
        return lost;
    }

    _step(h, turn, thrust, fire, shield, firePressed) {
        let lost = false;
        this.now += h;
        // ---- the ship
        if (this.shipAlive) {
            this.shipA += Math.max(-1, Math.min(1, turn)) * this.rotSpeed * h;
            if (this.shipA > Math.PI) this.shipA -= TAU; else if (this.shipA < -Math.PI) this.shipA += TAU;
            this.thrusting = thrust;
            this.thrustT = thrust ? this.thrustT + h : 0;
            if (thrust) { this.shipVx += this.fwdX * this.thrustAcc * h; this.shipVy += this.fwdY * this.thrustAcc * h; }
            const k = Math.max(0, 1 - this.drag * h);
            this.shipVx *= k; this.shipVy *= k;
            const sp = Math.hypot(this.shipVx, this.shipVy);
            if (sp > this.maxSpeed) { this.shipVx *= this.maxSpeed / sp; this.shipVy *= this.maxSpeed / sp; }
            this.shipX = wrapX(this.shipX + this.shipVx * h); this.shipY = wrapY(this.shipY + this.shipVy * h);
            this.invulnT -= h;
            this.fireCd -= h;
            // held = auto-fire every fireEvery; a fresh press fires as soon as half the cooldown is gone
            if ((fire && this.fireCd <= 0) || (firePressed && this.fireCd <= this.fireEvery * 0.5)) {
                if (this._playerBolts() < this.maxBolts) {
                    const fx = this.fwdX, fy = this.fwdY;
                    this.bolts.push({ x: wrapX(this.shipX + fx * 16), y: wrapY(this.shipY + fy * 16),
                        vx: fx * this.boltSpeed + this.shipVx * 0.5, vy: fy * this.boltSpeed + this.shipVy * 0.5, life: this.boltLife, enemy: false });
                    this.fireCd = this.fireEvery; this.shots++;
                }
            }
            this.autoShieldT = Math.max(0, this.autoShieldT - h);
            const manual = shield && this.shield > 0 && !this.shipInvincible;
            this.shielding = manual || this.autoShieldT > 0;
            if (manual && this.autoShieldT <= 0) { this.shield = Math.max(0, this.shield - h); this.shieldUsed += h; }
        } else {
            this.thrusting = false; this.shielding = false; this.thrustT = 0;
            this.respawnT -= h;
            if (this.respawnT <= 0 && this.lives > 0 && (this._centreSafe() || this.respawnT < -3)) this._resetShip();
        }

        // ---- rocks and bolts drift
        for (const r of this.rocks) { r.x = wrapX(r.x + r.vx * h); r.y = wrapY(r.y + r.vy * h); r.ang += r.spin * h; }
        for (let i = this.bolts.length - 1; i >= 0; i--) {
            const b = this.bolts[i];
            b.x = wrapX(b.x + b.vx * h); b.y = wrapY(b.y + b.vy * h); b.life -= h;
            if (b.life <= 0) this.bolts.splice(i, 1);
        }

        // ---- the saucer
        if (!this.saucerOn) {
            this.saucerTimer -= h;
            if (this.saucerTimer <= 0 && this.rocks.length > 0) {
                this.saucerOn = true; this.saucerT = 0; this.saucerFireT = this.saucerFireEvery * 0.6;
                const fromLeft = this.rand() < 0.5;
                this.saucerBaseY = this.range(44, FH - 44);
                this.saucerX = fromLeft ? -22 : FW + 22; this.saucerY = this.saucerBaseY;
                this.saucerVx = fromLeft ? this.saucerSpeed : -this.saucerSpeed;
            }
        } else {
            this.saucerT += h;
            this.saucerX += this.saucerVx * h;
            this.saucerY = this.saucerBaseY + Math.sin(this.saucerT * 1.6) * 18;
            this.saucerFireT -= h;
            if (this.saucerFires && this.shipAlive && this.saucerFireT <= 0 && this.saucerX > 0 && this.saucerX < FW) {
                const dx = wdx(this.shipX - this.saucerX), dy = wdy(this.shipY - this.saucerY);
                const a = Math.atan2(dy, dx) + this.range(-this.saucerAimError, this.saucerAimError);
                this.bolts.push({ x: this.saucerX, y: this.saucerY, vx: Math.cos(a) * this.saucerBoltSpeed, vy: Math.sin(a) * this.saucerBoltSpeed, life: 1.9, enemy: true });
                this.saucerFireT = this.saucerFireEvery;
            }
            if (this.saucerX < -26 || this.saucerX > FW + 26) { this.saucerOn = false; this.saucerTimer = this.saucerEvery; }
        }

        // ---- hits: player bolts
        for (let i = this.bolts.length - 1; i >= 0; i--) {
            const b = this.bolts[i];
            if (b.enemy) continue;
            let gone = false;
            for (let k = 0; k < this.rocks.length; k++) {
                const r = this.rocks[k], dx = wdx(b.x - r.x), dy = wdy(b.y - r.y);
                if (dx * dx + dy * dy < r.r * r.r) { this._split(k); gone = true; break; }
            }
            if (!gone && this.saucerOn && this._nearSaucer(b.x, b.y, 0)) {
                this._killSaucer(true); gone = true;
            }
            if (gone) this.bolts.splice(i, 1);
        }

        // ---- hits: the ship
        if (this.shipAlive && this.invulnT <= 0 && !this.shipInvincible) {
            for (let k = 0; k < this.rocks.length && this.shipAlive; k++) {
                const r = this.rocks[k], rr = r.r + StarvectorField.ShipR;
                const dx = wdx(this.shipX - r.x), dy = wdy(this.shipY - r.y), d2 = dx * dx + dy * dy;
                if (d2 >= rr * rr) continue;
                if (!this.shielding) this._assist();
                if (this.shielding) { this._bounce(r, dx, dy, Math.sqrt(d2), rr); continue; }
                this._split(k); this._killShip(); this.byRock++; lost = true;
            }
            for (let i = this.bolts.length - 1; i >= 0 && this.shipAlive; i--) {
                const b = this.bolts[i];
                if (!b.enemy) continue;
                const rr = this.shielding ? StarvectorField.ShieldR : StarvectorField.ShipR;
                const dx = wdx(this.shipX - b.x), dy = wdy(this.shipY - b.y);
                if (dx * dx + dy * dy >= rr * rr) continue;
                this.bolts.splice(i, 1);
                if (!this.shielding) this._assist();
                if (this.shielding) { if (this.autoShieldT <= 0) this.shield = Math.max(0, this.shield - 0.2); this.bumps++; this._cue(SoundCue.Miss); }
                else { this._killShip(); this.byBolt++; lost = true; }
            }
            if (this.shipAlive && this.saucerOn && this._nearSaucer(this.shipX, this.shipY, StarvectorField.ShipR)) {
                if (!this.shielding) this._assist();
                this._killSaucer(this.shielding);
                if (!this.shielding) { this._killShip(); this.bySaucer++; lost = true; }
            }
        }
        return lost;
    }

    _nearSaucer(x, y, pad) {
        const dx = wdx(x - this.saucerX), dy = wdy(y - this.saucerY);
        const rx = StarvectorField.SaucerRX + pad, ry = StarvectorField.SaucerRY + pad;
        return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1;
    }

    _killSaucer(scored) {
        this._boom(this.saucerX, this.saucerY, 1, { vx: this.saucerVx * 0.4 });
        this.saucerOn = false; this.saucerTimer = this.saucerEvery;
        if (scored) { this.score += 500; this.saucersShot++; }
        this._cue(SoundCue.Hit);
    }

    // the shield: the ship bounces off a rock, the rock carries on; each bump costs a little energy
    _bounce(r, dx, dy, d, rr) {
        const nx = d > 1e-4 ? dx / d : this.fwdX, ny = d > 1e-4 ? dy / d : this.fwdY;
        this.shipX = wrapX(r.x + nx * (rr + 0.5)); this.shipY = wrapY(r.y + ny * (rr + 0.5));
        const rvx = this.shipVx - r.vx, rvy = this.shipVy - r.vy, vn = rvx * nx + rvy * ny;
        if (vn < 0) {
            this.shipVx -= 1.6 * vn * nx; this.shipVy -= 1.6 * vn * ny;
            this.shipVx += nx * 20; this.shipVy += ny * 20;
            if (this.autoShieldT <= 0) this.shield = Math.max(0, this.shield - 0.15);
            this.bumps++;
            this._cue(SoundCue.Miss);
        }
    }

    // THE SHIELD ASSIST (credit 3+, `assistLeft` saves per round): a hit that would take the ship raises
    // the shield by itself for 0.6 s instead (no energy spent). One save per hit; the HUD shows what is left.
    _assist() {
        if (this.assistLeft <= 0) return false;
        this.assistLeft--; this.assistUsed++;
        this.autoShieldT = 0.6; this.shielding = true; this.savedAt = this.now;
        this._cue(SoundCue.Bonus);
        return true;
    }

    _playerBolts() { let n = 0; for (const b of this.bolts) if (!b.enemy) n++; return n; }

    _centreSafe() {
        const cx = FW * 0.5, cy = FH * 0.5;
        for (const r of this.rocks) {
            const rr = r.r + 38, dx = wdx(cx - r.x), dy = wdy(cy - r.y);
            if (dx * dx + dy * dy < rr * rr) return false;
        }
        return true;
    }

    _killShip() {
        this.shipAlive = false; this.lives--; this.shipsLost++;
        this.respawnT = this.respawnSeconds; this.shielding = false; this.thrusting = false;
        this._boom(this.shipX, this.shipY, 2, { a: this.shipA, vx: this.shipVx, vy: this.shipVy });
        for (let i = this.bolts.length - 1; i >= 0; i--) if (this.bolts[i].enemy) this.bolts.splice(i, 1);
        this._cue(SoundCue.Die);
    }

    _split(k) {
        const r = this.rocks[k];
        this.rocks.splice(k, 1);
        this.score += StarvectorField.rockPoints(r.size); this.rocksShot++;
        this._boom(r.x, r.y, 0, { size: r.size, vx: r.vx, vy: r.vy });
        this._cue(SoundCue.Hit);
        if (r.size > 1)
            for (let j = 0; j < 2; j++) {
                const c = this._makeRock(r.x, r.y, r.size - 1);
                c.vx += r.vx * 0.4; c.vy += r.vy * 0.4;
                this.rocks.push(c);
            }
    }

    // ------------------------------------------------------------------ the gunner's eye
    // What a steady turret would do right now: turn toward the most pressing target (the saucer if it is
    // up and in range, else the rock whose edge is nearest, closing ones first), leading it, and fire once
    // lined up. The mercy credit uses it when the player lets go. Reads only.
    suggest() {
        const out = { turn: 0, fire: false };
        if (!this.shipAlive) return out;
        let tx = 0, ty = 0, tvx = 0, tvy = 0, have = false, best = Infinity;
        if (this.saucerOn) {
            const d = Math.hypot(wdx(this.saucerX - this.shipX), wdy(this.saucerY - this.shipY));
            if (d < this.boltRange * 1.1) { tx = this.saucerX; ty = this.saucerY; tvx = this.saucerVx; tvy = 0; have = true; }
        }
        if (!have)
            for (const r of this.rocks) {
                const dx = wdx(r.x - this.shipX), dy = wdy(r.y - this.shipY), d = Math.max(1e-3, Math.hypot(dx, dy));
                const closing = -((r.vx - this.shipVx) * dx + (r.vy - this.shipVy) * dy) / d;
                const s = d - r.r - Math.max(0, closing) * 0.8;
                if (s < best) { best = s; tx = r.x; ty = r.y; tvx = r.vx; tvy = r.vy; have = true; }
            }
        if (!have) return out;
        const aim = this.lead(tx, ty, tvx, tvy);
        const want = Math.atan2(aim.x, -aim.y);
        const diff = deltaAngle(this.shipA, want);
        out.turn = Math.max(-1, Math.min(1, diff * 7));
        out.fire = Math.abs(diff) < 0.11 && Math.hypot(aim.x, aim.y) < this.boltRange * 0.97;
        return out;
    }

    // where to point to hit something at (tx, ty) moving (tvx, tvy): the wrapped lead vector from the ship
    lead(tx, ty, tvx, tvy) {
        const bx = wdx(tx - this.shipX), by = wdy(ty - this.shipY);
        let ax = bx, ay = by;
        for (let it = 0; it < 3; it++) {
            const t = Math.hypot(ax, ay) / this.boltSpeed;
            ax = bx + (tvx - this.shipVx * 0.5) * t; ay = by + (tvy - this.shipVy * 0.5) * t;
        }
        return { x: ax, y: ay };
    }

    static waveSize(base, wave, scale) {
        const b = base[Math.max(0, Math.min(base.length - 1, wave - 1))];
        return Math.max(1, Math.round(b * scale));
    }
}

StarvectorField.ShipR = 7;                        // the ship's hit circle: forgiving, inside the 30 px dart (wing tips can graze)
StarvectorField.ShieldR = 18;                     // the shield ring
StarvectorField.SaucerRX = 19; StarvectorField.SaucerRY = 9;
