// THE NODE · world 1 · SWARM PATROL (Skyline Coin Corp, 1981) on the Cabinet Engine · THE ROUND.
// Port of SwarmPatrolSim.cs from Staging/Batch1/swarmpatrol.
//
// A formation shooter. Each wave the swarm flies in along simple parametric paths (a cubic, a
// loop, a cubic into its slot), locks into ranks at the top (a boss pair, one or two rows of
// escorts, a row of drones) and sways there. Then aliens peel off singly or in pairs (a boss can
// bring two escorts) and dive at the bottom lane, dropping bolts. The ship slides left/right and
// fires straight up: auto-repeat while A is held, at most 2 shots on screen. Touching a diver or
// its bolt costs a ship (3 ships). 5 waves, each with more escorts and faster, more frequent dives;
// a wave ends when every alien is destroyed. ROUND WON = wave 5 cleared with a ship left.
//
// The flourish: a boss sometimes dives to mid-screen and opens a TRACTOR BEAM. Sit in it for
// captureSeconds and the ship is CAPTURED (lost, pulled up into the beam; no rescue in this cut).
//
// Score: drone 50, escort 100, boss 150 (bosses take two hits); x2 for an alien that is not
// sitting in the formation (diving, peeling, beaming, returning or flying in).
//
// MERCY: every lost round on this cabinet eases diveSpeed and diveRate by 8% (knobs, x0.92 per
// loss). credit.unlosable (credit 5): diveDepth snaps to 0.2 (divers barely leave the formation
// and swing straight back), no bolts, no beams, and the ship is shielded: nothing can cost it a
// ship. The round is still WON only by clearing wave 5.
//
// States: WaveIntro = the wave banner (3-2-1-GO on wave 1) or Ready after a lost ship;
// Playing = live; ShipLost/WaveClear = Interlude; Card; Over.
// The sim sub-steps at <= 1/120 s so shots never tunnel and 30/60/144 Hz hosts agree.
import { f32, idiv, fmt, F32, SoundCue, CueBuffer, CabinetState, RoundResult, Pad, SystemRandom } from '../../sdk/index.js';

const Kind = Object.freeze({ Drone: 0, Escort: 1, Boss: 2 });
const AMode = Object.freeze({ Pending: 0, Enter: 1, Formation: 2, Peel: 3, Dive: 4, Beam: 5, Return: 6, Dead: 7 });
const Phase = Object.freeze({ Idle: 0, WaveIntro: 1, Ready: 2, Playing: 3, ShipLost: 4, WaveClear: 5, Card: 6, Over: 7 });

// ------------------------------------------------------------------ the machine (not mercy knobs)
const Waves = 5, StartShips = 3, Cols = 10;
const FieldLeft = f32(8), FieldRight = f32(312), FieldTop = f32(30), FieldBottom = f32(216);
const ShipY = f32(204), ShipMinX = f32(16), ShipMaxX = f32(304), ShipSpeed = f32(125);
const ShipHalfW = 7, ShipHalfH = 5;
const ShotSpeed = f32(330), FireCooldown = f32(0.16);
const MaxShots = 2, MaxEnemyShots = 8;
const ColSpacing = f32(29), SwayAmp = f32(16), SwayW = f32(0.9);
const RowY = [f32(42), f32(60), f32(78), f32(96)];
const EntrySpeed = f32(165), GroupGap = f32(1.0), TrainGap = f32(0.16);
const PeelSeconds = f32(0.45), PeelRadius = f32(12), ReturnSpeed = f32(120);
const BoltCeiling = f32(90);
const BeamY = f32(124), BeamHalfMax = f32(16), BeamOpenSeconds = f32(0.6), BeamHoldSeconds = f32(2.4), BeamCloseSeconds = f32(0.4);
const CountStep = f32(0.5), WaveBannerSeconds = f32(1.6), ReadySeconds = f32(1.4), ReadyMaxSeconds = f32(6);
const ShipLostSeconds = f32(2.0), ClearSeconds = f32(1.6), CardSeconds = f32(3.5);
const SubStep = f32(1 / 120);
const DronesPerWave = 8, BossesPerWave = 2;
const PiF = f32(Math.PI);

function escortsFor(w) { return 2 + 2 * w; }
function clampF(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function add(d, k, v) { d[k] = (d[k] || 0) + v; }

// ------------------------------------------------------------------ the cubic/loop entry path
const N = 16;

function cubic(t, x0, y0, x1, y1, x2, y2, x3, y3) {
    const u = f32(1 - t);
    const a = f32(f32(u * u) * u);
    const b = f32(f32(f32(3 * u) * u) * t);
    const c = f32(f32(f32(3 * u) * t) * t);
    const d = f32(f32(t * t) * t);
    let x = f32(a * x0);
    x = f32(x + f32(b * x1)); x = f32(x + f32(c * x2)); x = f32(x + f32(d * x3));
    let y = f32(a * y0);
    y = f32(y + f32(b * y1)); y = f32(y + f32(c * y2)); y = f32(y + f32(d * y3));
    return [x, y];
}

function table(lut, x0, y0, x1, y1, x2, y2, x3, y3) {
    lut[0] = 0;
    let px = x0, py = y0;
    for (let i = 1; i <= N; i++) {
        const t = f32(i / N);
        const [qx, qy] = cubic(t, x0, y0, x1, y1, x2, y2, x3, y3);
        const dx = f32(qx - px), dy = f32(qy - py);
        lut[i] = f32(lut[i - 1] + f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy)))));
        px = qx; py = qy;
    }
    return Math.max(1, lut[N]);
}

function tAt(lut, d) {
    const total = lut[N];
    if (d <= 0 || total <= 0) return 0;
    if (d >= total) return 1;
    let i = 0;
    while (i < N - 1 && lut[i + 1] < d) i++;
    const seg = f32(lut[i + 1] - lut[i]);
    const frac = seg > 0 ? f32(f32(d - lut[i]) / seg) : 0;
    return f32(f32(i + frac) / N);
}

// leg A (a static cubic), leg B (one full loop, tangent to A), leg C (a cubic from the loop's end
// into the alien's LIVE slot, approached from below). Arc-length tables keep the flight speed even.
class EntryPath {
    constructor() {
        this.ax0 = 0; this.ay0 = 0; this.ax1 = 0; this.ay1 = 0; this.ax2 = 0; this.ay2 = 0; this.ax3 = 0; this.ay3 = 0;
        this.cx = 0; this.cy = 0; this.v0x = 0; this.v0y = 0; this.sigma = 0; this.radius = 0; this.sweep = 0;
        this.ex = 0; this.ey = 0; this.tx = 0; this.ty = 0; this.lead = 0; this.approach = 0;
        this.lenA = 0; this.lenB = 0; this.lenC = 0;
        this.lutA = new Array(N + 1).fill(0); this.lutC = new Array(N + 1).fill(0);
    }

    get length() { return f32(f32(this.lenA + this.lenB) + this.lenC); }

    _setA(a, b, c, d, e, f, g, h) { this.ax0 = a; this.ay0 = b; this.ax1 = c; this.ay1 = d; this.ax2 = e; this.ay2 = f; this.ax3 = g; this.ay3 = h; }

    // template 0: in from the top centre, swoop out to a side, loop, home
    // template 1: in low from a side edge, loop mid-screen, home
    // template 2: down one side, across the middle, loop, home
    static make(template, s, slotX, slotY) {
        const p = new EntryPath();
        let r;
        switch (template) {
            case 0: p._setA(f32(160 + s * 24), 12, f32(160 + s * 24), 100, f32(160 + s * 70), 160, f32(160 + s * 112), 160); r = 26; break;
            case 1: p._setA(f32(160 - s * 176), 186, f32(160 - s * 112), 186, f32(160 - s * 62), 176, f32(160 - s * 28), 150); r = 24; break;
            default: p._setA(f32(160 - s * 112), 12, f32(160 - s * 112), 110, f32(160 - s * 44), 170, f32(160 + s * 8), 170); r = 24; break;
        }
        const dx = f32(p.ax3 - p.ax2), dy = f32(p.ay3 - p.ay2), l = f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy))));
        p.tx = f32(dx / l); p.ty = f32(dy / l);
        const sg = -s;                                          // curl upward, away from the lane
        const nx = f32(sg * -p.ty), ny = f32(sg * p.tx);
        p.cx = f32(p.ax3 + f32(r * nx)); p.cy = f32(p.ay3 + f32(r * ny));
        p.v0x = f32(-r * nx); p.v0y = f32(-r * ny);
        p.sigma = sg; p.radius = r; p.sweep = f32(2 * Math.PI);
        p.ex = p.ax3; p.ey = p.ay3; p.lead = 24; p.approach = 44;
        p.lenA = table(p.lutA, p.ax0, p.ay0, p.ax1, p.ay1, p.ax2, p.ay2, p.ax3, p.ay3);
        p.lenB = f32(r * p.sweep);
        p.lenC = table(p.lutC, p.ex, p.ey, f32(p.ex + f32(p.tx * p.lead)), f32(p.ey + f32(p.ty * p.lead)), slotX, f32(slotY + p.approach), slotX, slotY);
        return p;
    }

    eval(d, slotX, slotY) {
        if (d < this.lenA) return cubic(tAt(this.lutA, d), this.ax0, this.ay0, this.ax1, this.ay1, this.ax2, this.ay2, this.ax3, this.ay3);
        d = f32(d - this.lenA);
        if (d < this.lenB) {
            const a = f32(f32(this.sigma * d) / this.radius);
            const ca = f32(Math.cos(a)), sa = f32(Math.sin(a));
            let x = f32(this.cx + f32(this.v0x * ca)); x = f32(x - f32(this.v0y * sa));
            let y = f32(this.cy + f32(this.v0x * sa)); y = f32(y + f32(this.v0y * ca));
            return [x, y];
        }
        d = f32(d - this.lenB);
        const t = tAt(this.lutC, f32(f32(d * this.lutC[N]) / Math.max(1, this.lenC)));
        return cubic(t, this.ex, this.ey, f32(this.ex + f32(this.tx * this.lead)), f32(this.ey + f32(this.ty * this.lead)), slotX, f32(slotY + this.approach), slotX, slotY);
    }
}

class Alien {
    constructor() {
        this.id = 0; this.kind = Kind.Drone; this.mode = AMode.Pending;
        this.row = 0; this.col = 0;
        this.x = -100; this.y = -100; this.vx = 0; this.vy = 0;
        this.hp = 1; this.t = 0; this.launchAt = 0; this.side = 0;
        this.path = null; this.dist = 0;
        this.aimX = 0; this.aimT = 0; this.weavePhase = 0;
        this.diveVX = 0; this.diveVY = 0;
        this.nextShotY = 0; this.shotsLeft = 0; this.turnY = 0;
        this.peelX = 0; this.peelY = 0;
        this.beamStage = 0; this.beamX = 0; this.beamOpen = 0;
    }
    get visible() { return this.mode !== AMode.Dead && this.mode !== AMode.Pending; }
    get inFlight() { return this.mode !== AMode.Formation; }
    get attacking() { return this.mode === AMode.Peel || this.mode === AMode.Dive || this.mode === AMode.Beam; }
    get halfW() { return this.kind === Kind.Drone ? 7 : 8; }        // sprites: drone 14x12, escort 16x12, boss 16x14
    get halfH() { return this.kind === Kind.Boss ? 7 : 6; }
    get baseScore() { return this.kind === Kind.Drone ? 50 : this.kind === Kind.Escort ? 100 : 150; }
}

class Shot { constructor() { this.id = 0; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; } }

export class SwarmPatrolRound {
    constructor() {
        this.p = Phase.Idle; this.phaseTime = 0;
        this.wave = 0; this.countdownLeft = 0;
        this.playerX = 160; this.playerAlive = false;
        this.captured = false; this.capturedFromX = 0; this.captorId = 0;
        this.formationTime = 0; this.waveTotal = 0; this.wavesCleared = 0;
        this.credit = null;
        this.lives = StartShips;

        this.aliens = []; this.playerShots = []; this.enemyShots = []; this.bursts = [];

        this.diveSpeed = 0; this.diveRate = 0; this.waveRamp = 0; this.shotChance = 0;
        this.pairChance = 0; this.beamChance = 0; this.diveDepth = 1; this.boltSpeed = 0; this.captureSeconds = 0;

        this._cues = new CueBuffer();
        this._log = '';
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._nextId = 1; this._nextShotId = 1;
        this._time = 0; this._fireCooldown = 0; this._diveTimer = 0; this._captureAcc = 0;
        this._deaths = 0; this._captures = 0; this._kills = 0; this._shotsFired = 0; this._hits = 0;
        this._dives = 0; this._beams = 0; this._deathsBolt = 0; this._deathsRam = 0;
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.WaveIntro: case Phase.Ready: return CabinetState.Intro;
            case Phase.Playing: return CabinetState.Playing;
            case Phase.ShipLost: case Phase.WaveClear: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get diveSpeedNow() { return f32(this.diveSpeed * f32(1 + f32(this.waveRamp * (this.wave - 1)))); }
    get diveRateNow() { return f32(this.diveRate * f32(1 + f32(this.waveRamp * (this.wave - 1)))); }
    get captureProgress() { return this._captureAcc; }
    get beamActive() { for (const a of this.aliens) if (a.mode === AMode.Beam) return true; return false; }
    get entryDone() { for (const a of this.aliens) if (a.mode === AMode.Pending || a.mode === AMode.Enter) return false; return true; }
    get aliveCount() { let n = 0; for (const a of this.aliens) if (a.mode !== AMode.Dead) n++; return n; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' wave ' + this.wave + ' ships ' + this.lives + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's  ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.diveSpeed = k.get('diveSpeed');
        this.diveRate = k.get('diveRate');
        this.waveRamp = k.get('waveRamp');
        this.shotChance = k.get('shotChance');
        this.pairChance = k.get('pairChance');
        this.beamChance = k.get('beamChance');
        this.diveDepth = k.get('diveDepth');
        this.boltSpeed = k.get('boltSpeed');
        this.captureSeconds = k.get('captureSeconds');
        if (credit.unlosable) { this.shotChance = 0; this.beamChance = 0; this.diveDepth = Math.min(this.diveDepth, 0.2); }

        this._score = 0; this.lives = StartShips; this._time = 0; this._nextId = 1; this._nextShotId = 1;
        this._deaths = this._captures = this._kills = this._shotsFired = this._hits = this._dives = this._beams = this._deathsBolt = this._deathsRam = 0;
        this.wavesCleared = 0; this.formationTime = 0;
        this.playerX = 160; this.playerAlive = true; this.captured = false; this.captorId = 0;
        this._result = RoundResult.None;
        this._log = '';
        this._cues.resetTotals();
        this.aliens.length = 0; this.playerShots.length = 0; this.enemyShots.length = 0; this.bursts.length = 0;
        this._startWave(1);
    }

    // ------------------------------------------------------------------ the wave
    _startWave(w) {
        this.wave = w;
        this.aliens.length = 0; this.playerShots.length = 0; this.enemyShots.length = 0;
        this.playerAlive = true; this.captured = false; this.captorId = 0;   // a ship lost on the wave's last kill comes back here
        const esc = escortsFor(w);
        const row1 = Math.min(esc, 6), row2 = esc - row1;
        const list = [];
        this._addRow(list, 0, BossesPerWave, Kind.Boss);
        this._addRow(list, 1, row1, Kind.Escort);
        this._addRow(list, 2, row2, Kind.Escort);
        this._addRow(list, 3, DronesPerWave, Kind.Drone);
        for (const a of list) this.aliens.push(a);
        this.waveTotal = list.length;
        this.p = Phase.WaveIntro; this.phaseTime = 0;
        this.countdownLeft = w === 1 ? 3 : 0;
        this._cues.emit(SoundCue.Tick);
        this._log += 'w' + w + '@' + fmt(this._time, 1, F32) + ' ';
    }

    _addRow(list, row, n, kind) {
        const start = idiv(Cols - n, 2);
        for (let i = 0; i < n; i++) {
            const a = new Alien();
            a.id = this._nextId++; a.kind = kind; a.mode = AMode.Pending; a.row = row; a.col = start + i;
            a.hp = kind === Kind.Boss ? 2 : 1; a.x = -100; a.y = -100;
            a.weavePhase = f32(this._rng.nextDouble() * Math.PI * 2);
            list.push(a);
        }
    }

    // entries leave in 4 trains; each train shares a path template and a side
    _launchEntries() {
        const per = idiv(this.waveTotal + 3, 4);
        for (let i = 0; i < this.aliens.length; i++) {
            const a = this.aliens[i];
            const g = idiv(i, per), k = i % per;
            const template = (g + this.wave - 1) % 3;
            const side = (g % 2 === 0) ? 1 : -1;
            a.path = EntryPath.make(template, side, this.slotX(a), this.slotY(a));
            let launchAt = f32(this._time + f32(g * GroupGap));
            launchAt = f32(launchAt + f32(k * TrainGap));
            a.launchAt = launchAt;
            a.dist = 0;
        }
        this._diveTimer = 1.0;
    }

    slotX(a) {
        const inner = f32(a.col - f32(f32(Cols - 1) * 0.5));
        const X = f32(inner * ColSpacing);
        const Y = f32(SwayAmp * f32(Math.sin(f32(this.formationTime * SwayW))));
        let v = f32(160 + X);
        v = f32(v + Y);
        return v;
    }
    slotY(a) { return RowY[a.row]; }

    // dives start once half the wave has taken its place in the ranks
    _settled() {
        let home = 0, all = 0;
        for (const a of this.aliens) {
            if (a.mode === AMode.Dead) continue;
            all++;
            if (a.mode !== AMode.Pending && a.mode !== AMode.Enter) home++;
        }
        return home * 2 >= all;
    }

    _waveEmpty() { for (const a of this.aliens) if (a.mode !== AMode.Dead) return false; return true; }

    // ------------------------------------------------------------------ stepping
    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        let move = 0;
        let fireHeld = false, firePressed = false;
        if (input != null) {
            if (input.held(Pad.Left)) move -= 1;
            if (input.held(Pad.Right)) move += 1;
            fireHeld = input.held(Pad.A);
            firePressed = input.pressed(Pad.A);
        }
        let n = Math.ceil(f32(f32(dt / SubStep) - f32(1e-3)));
        if (n < 1) n = 1;
        const h = f32(dt / n);
        for (let i = 0; i < n && this.p !== Phase.Over; i++)
            this._sub(h, move, fireHeld, firePressed && i === 0);
    }

    _sub(h, move, fireHeld, firePressed) {
        this._time = f32(this._time + h); this.phaseTime = f32(this.phaseTime + h); this.formationTime = f32(this.formationTime + h);
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.t = f32(b.t + h);
            const life = b.kind === 2 ? 1.6 : b.kind === 1 ? 0.25 : 0.5;
            if (b.t > life) this.bursts.splice(i, 1);
        }

        switch (this.p) {
            case Phase.WaveIntro:
                this._updateAliens(h, false, false);
                if (this.wave === 1) {
                    const hold = this.countdownLeft === 0 ? f32(CountStep * 0.6) : CountStep;
                    if (this.phaseTime >= hold) {
                        this.phaseTime = f32(this.phaseTime - hold);
                        this.countdownLeft--;
                        if (this.countdownLeft < 0) this._beginPlay(true);
                        else this._cues.emit(this.countdownLeft === 0 ? SoundCue.Start : SoundCue.Tick);
                    }
                } else if (this.phaseTime >= WaveBannerSeconds) { this._cues.emit(SoundCue.Start); this._beginPlay(true); }
                break;

            case Phase.Ready:
                this._updateAliens(h, false, false);
                this._updatePlayerShots(h);
                if ((this.phaseTime >= ReadySeconds && !this._anyAttacking()) || this.phaseTime >= ReadyMaxSeconds) { this._cues.emit(SoundCue.Start); this._beginPlay(false); }
                break;

            case Phase.Playing: {
                if (this.playerAlive) {
                    this.playerX = clampF(f32(this.playerX + f32(f32(move * ShipSpeed) * h)), ShipMinX, ShipMaxX);
                    this._fireCooldown = f32(this._fireCooldown - h);
                    if ((firePressed || fireHeld) && this._fireCooldown <= 0 && this.playerShots.length < MaxShots) {
                        const sh = new Shot();
                        sh.id = this._nextShotId++; sh.x = this.playerX; sh.y = f32(ShipY - 7); sh.vx = 0; sh.vy = f32(-ShotSpeed);
                        this.playerShots.push(sh);
                        this._fireCooldown = FireCooldown;
                        this._shotsFired++;
                    }
                }
                this._updateAliens(h, true, true);
                if (this.p !== Phase.Playing) break;               // a beam capture
                this._updatePlayerShots(h);
                this._updateEnemyShots(h);
                this._collide();
                if (this.p === Phase.Playing && this.entryDone && this._waveEmpty()) this._beginClear();
                break;
            }

            case Phase.ShipLost:
                this._updateAliens(h, false, false);
                this._updatePlayerShots(h);
                if (this.phaseTime >= ShipLostSeconds) {
                    if (this.lives <= 0) this._enterCard(RoundResult.Lost);
                    else if (this.entryDone && this._waveEmpty()) this._beginClear();
                    else {
                        this.playerAlive = true; this.captured = false; this.captorId = 0;
                        this.playerX = 160;
                        this.p = Phase.Ready; this.phaseTime = 0;
                    }
                }
                break;

            case Phase.WaveClear:
                if (this.phaseTime >= ClearSeconds) {
                    if (this.wave >= Waves) this._enterCard(this.lives > 0 ? RoundResult.Won : RoundResult.Lost);
                    else this._startWave(this.wave + 1);
                }
                break;

            case Phase.Card:
                if (this.phaseTime >= CardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _beginPlay(newWave) {
        this.p = Phase.Playing; this.phaseTime = 0;
        this._fireCooldown = 0;
        if (newWave) this._launchEntries();
        else this._diveTimer = f32(1.2 + this._nextInterval());
    }

    _beginClear() {
        this.p = Phase.WaveClear; this.phaseTime = 0;
        this.wavesCleared++;
        this.enemyShots.length = 0; this.playerShots.length = 0;
        this._cues.emit(SoundCue.Bonus);
        this._log += 'C' + this.wave + '@' + fmt(this._time, 1, F32) + ' ';
    }

    _enterCard(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    _anyAttacking() { for (const a of this.aliens) if (a.attacking) return true; return false; }

    _nextInterval() {
        let rate = this.diveRateNow;
        const alive = this.aliveCount;
        if (this.waveTotal > 0) rate = f32(rate * f32(1 + f32(0.5 * f32(1 - f32(alive / this.waveTotal)))));
        return f32(f32(0.5 + f32(this._rng.nextDouble())) / Math.max(0.01, rate));
    }

    // ------------------------------------------------------------------ aliens
    _updateAliens(h, allowDives, allowFire) {
        const spd = this.diveSpeedNow;
        for (const a of this.aliens) {
            if (a.mode === AMode.Dead) continue;
            let ox = a.x, oy = a.y;
            a.t = f32(a.t + h);
            switch (a.mode) {
                case AMode.Pending:
                    if (a.path != null && this._time >= a.launchAt) {
                        a.mode = AMode.Enter; a.dist = 0; a.t = 0;
                        const p0 = a.path.eval(0, this.slotX(a), this.slotY(a));
                        a.x = p0[0]; a.y = p0[1];
                        ox = a.x; oy = a.y;
                    }
                    break;
                case AMode.Enter:
                    a.dist = f32(a.dist + f32(EntrySpeed * h));
                    if (a.dist >= a.path.length) { a.mode = AMode.Formation; a.x = this.slotX(a); a.y = this.slotY(a); }
                    else { const p1 = a.path.eval(a.dist, this.slotX(a), this.slotY(a)); a.x = p1[0]; a.y = p1[1]; }
                    break;
                case AMode.Formation:
                    a.x = this.slotX(a); a.y = this.slotY(a);
                    break;
                case AMode.Peel: {
                    if (a.t < 0) { a.x = this.slotX(a); a.y = this.slotY(a); a.peelX = a.x; a.peelY = a.y; break; }
                    const th = f32(PiF * f32(Math.min(1, f32(a.t / PeelSeconds))));
                    const pcx = f32(a.peelX + f32(a.side * PeelRadius));
                    a.x = f32(pcx - f32(f32(a.side * PeelRadius) * f32(Math.cos(th))));
                    a.y = f32(a.peelY - f32(PeelRadius * f32(Math.sin(th))));
                    if (a.t >= PeelSeconds) {
                        a.mode = AMode.Dive; a.t = 0;
                        a.diveVX = 0; a.diveVY = f32(spd * 0.5);
                        a.aimX = this.playerX; a.aimT = f32(0.45);
                    }
                    break;
                }
                case AMode.Dive: {
                    a.aimT = f32(a.aimT - h);
                    if (a.aimT <= 0 && a.y < f32(ShipY - 50)) {
                        a.aimX = f32(this.playerX + f32(f32(f32(this._rng.nextDouble()) - 0.5) * 24));
                        a.aimT = f32(0.45);
                    }
                    const tx = f32(a.aimX + f32(22 * f32(Math.sin(f32(f32(a.t * 3.2) + a.weavePhase)))));
                    const axv = clampF(f32(f32(tx - a.x) * 5), -420, 420);
                    a.diveVX = clampF(f32(a.diveVX + f32(axv * h)), f32(-0.7 * spd), f32(0.7 * spd));
                    a.diveVY = Math.min(spd, f32(a.diveVY + f32(260 * h)));
                    a.x = f32(a.x + f32(a.diveVX * h)); a.y = f32(a.y + f32(a.diveVY * h));
                    if (a.x < 16) { a.x = 16; a.diveVX = Math.abs(a.diveVX); }
                    if (a.x > 304) { a.x = 304; a.diveVX = f32(-Math.abs(a.diveVX)); }
                    if (allowFire && a.shotsLeft > 0 && a.y >= a.nextShotY && a.y < f32(ShipY - BoltCeiling)) {
                        a.shotsLeft--; a.nextShotY = f32(a.nextShotY + 22);
                        if (this._rng.nextDouble() < this.shotChance) this._fireAt(a);
                    }
                    if (a.y > a.turnY) { a.mode = AMode.Return; a.t = 0; }
                    else if (a.y > f32(FieldBottom + 10)) {
                        a.y = f32(FieldTop - 16); a.x = this.slotX(a); ox = a.x; oy = a.y;
                        a.mode = AMode.Return; a.t = 0;
                    }
                    break;
                }
                case AMode.Beam:
                    this._updateBeam(a, h, spd);
                    break;
                case AMode.Return: {
                    const sx = this.slotX(a), sy = this.slotY(a);
                    const dx = f32(sx - a.x), dy = f32(sy - a.y);
                    const d = f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy)))), step = f32(ReturnSpeed * h);
                    if (d <= f32(step + 0.5)) { a.mode = AMode.Formation; a.x = sx; a.y = sy; a.t = 0; }
                    else { a.x = f32(a.x + f32(f32(dx / d) * step)); a.y = f32(a.y + f32(f32(dy / d) * step)); }
                    break;
                }
            }
            a.vx = f32(f32(a.x - ox) / h); a.vy = f32(f32(a.y - oy) / h);
            if (this.p !== Phase.Playing && allowDives) break;      // a capture happened mid-loop
        }

        if (allowDives && this.p === Phase.Playing && this.playerAlive && this._settled()) {
            this._diveTimer = f32(this._diveTimer - h);
            if (this._diveTimer <= 0) {
                let active = 0;
                for (const a of this.aliens) if (a.attacking) active++;
                if (active < 2 + idiv(this.wave, 2)) { this._launchDive(); this._diveTimer = this._nextInterval(); }
                else this._diveTimer = f32(0.3);
            }
        }
    }

    _updateBeam(a, h, spd) {
        switch (a.beamStage) {
            case 0: {
                const dx = f32(a.beamX - a.x), dy = f32(BeamY - a.y);
                const d = f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy))));
                const step = f32(f32(spd * 0.8) * h);
                if (d <= step) { a.x = a.beamX; a.y = BeamY; a.beamStage = 1; a.t = 0; this._captureAcc = 0; }
                else { a.x = f32(a.x + f32(f32(dx / d) * step)); a.y = f32(a.y + f32(f32(dy / d) * step)); }
                break;
            }
            case 1:
                a.beamOpen = Math.min(1, f32(a.t / BeamOpenSeconds));
                if (a.t >= BeamOpenSeconds) { a.beamStage = 2; a.t = 0; }
                break;
            case 2:
                a.beamOpen = 1;
                if (a.t >= BeamHoldSeconds) { a.beamStage = 3; a.t = 0; }
                break;
            default:
                a.beamOpen = Math.max(0, f32(1 - f32(a.t / BeamCloseSeconds)));
                if (a.t >= BeamCloseSeconds) { a.beamOpen = 0; a.mode = AMode.Return; a.t = 0; }
                break;
        }
        if (this.p === Phase.Playing && this.playerAlive && !this.credit.unlosable && (a.beamStage === 1 || a.beamStage === 2) && a.beamOpen > 0.5 &&
            Math.abs(f32(this.playerX - a.x)) < f32(f32(BeamHalfMax * a.beamOpen) - 2)) {
            this._captureAcc = f32(this._captureAcc + h);
            if (this._captureAcc >= this.captureSeconds) this._capture(a);
        }
    }

    _launchDive() {
        const pool = [];
        let boss = null;
        for (const a of this.aliens)
            if (a.mode === AMode.Formation) {
                pool.push(a);
                if (a.kind === Kind.Boss && (boss == null || this._rng.nextDouble() < 0.5)) boss = a;
            }
        if (pool.length === 0) return;
        if (boss != null && (this._rng.nextDouble() < 0.22 || pool.length <= 2)) {
            if (!this.beamActive && this._rng.nextDouble() < this.beamChance) {
                boss.mode = AMode.Beam; boss.t = 0; boss.beamStage = 0; boss.beamOpen = 0;
                boss.beamX = clampF(this.playerX, 40, 280);
                this._beams++;
                return;
            }
            this._startDive(boss, 0, boss.col < idiv(Cols, 2) ? -1 : 1);
            let k = 0;
            for (const e of pool)
                if (e.kind === Kind.Escort && e.row === 1 && Math.abs(e.col - boss.col) <= 1 && k < 2 && this._rng.nextDouble() < f32(this.pairChance + 0.4)) {
                    k++;
                    this._startDive(e, f32(0.12 * k), boss.side);
                }
            return;
        }
        let pick = [];
        for (const a of pool) if (a.kind !== Kind.Boss) pick.push(a);
        if (pick.length === 0) pick = pool;
        const d = pick[this._rng.next(pick.length)];
        this._startDive(d, 0, d.col < idiv(Cols, 2) ? -1 : 1);
        if (this._rng.nextDouble() < f32(this.pairChance + f32(0.05 * (this.wave - 1))))
            for (const pAlien of pool)
                if (pAlien !== d && pAlien.mode === AMode.Formation && pAlien.row === d.row && Math.abs(pAlien.col - d.col) === 1) { this._startDive(pAlien, 0.15, d.side); break; }
    }

    _startDive(a, delay, side) {
        a.mode = AMode.Peel; a.t = f32(-delay); a.side = side;
        a.peelX = a.x; a.peelY = a.y;
        a.shotsLeft = 2; a.nextShotY = f32(70 + f32(this._rng.nextDouble() * 16));
        a.turnY = this.diveDepth >= 0.999 ? 1e9 : f32(this.slotY(a) + f32(this.diveDepth * f32(ShipY - this.slotY(a))));
        this._dives++;
    }

    _fireAt(a) {
        if (this.enemyShots.length >= MaxEnemyShots) return;
        const vy = Math.max(60, f32(this.boltSpeed * a.diveVY));           // a bolt falls a multiple of its diver's speed
        const tt = Math.max(0.3, f32(f32(ShipY - a.y) / vy));
        const vx = clampF(f32(f32(f32(this.playerX - a.x) / tt) * 0.8), -70, 70);
        const sh = new Shot();
        sh.id = this._nextShotId++; sh.x = a.x; sh.y = f32(a.y + a.halfH); sh.vx = vx; sh.vy = vy;
        this.enemyShots.push(sh);
    }

    // ------------------------------------------------------------------ shots and hits
    _updatePlayerShots(h) {
        for (let i = this.playerShots.length - 1; i >= 0; i--) {
            const s = this.playerShots[i];
            s.y = f32(s.y + f32(s.vy * h));
            if (s.y < f32(FieldTop - 4)) { this.playerShots.splice(i, 1); continue; }
            for (const a of this.aliens) {
                if (!a.visible) continue;
                if (Math.abs(f32(s.x - a.x)) <= a.halfW && s.y <= f32(a.y + a.halfH) && s.y >= f32(a.y - a.halfH - 4)) {
                    this.playerShots.splice(i, 1);
                    this._hits++;
                    this._hitAlien(a);
                    break;
                }
            }
        }
    }

    _updateEnemyShots(h) {
        for (let i = this.enemyShots.length - 1; i >= 0; i--) {
            const s = this.enemyShots[i];
            s.x = f32(s.x + f32(s.vx * h)); s.y = f32(s.y + f32(s.vy * h));
            if (s.y > f32(FieldBottom + 4) || s.x < f32(FieldLeft - 4) || s.x > f32(FieldRight + 4)) this.enemyShots.splice(i, 1);
        }
    }

    _hitAlien(a) {
        if (a.kind === Kind.Boss && a.hp > 1) {
            a.hp--;
            this.bursts.push({ x: a.x, y: a.y, t: 0, kind: 1 });
            this._cues.emit(SoundCue.Hit);
            return;
        }
        this._kill(a);
    }

    _kill(a) {
        this._score += a.baseScore * (a.inFlight ? 2 : 1);
        this._kills++;
        this.bursts.push({ x: a.x, y: a.y, t: 0, kind: a.kind === Kind.Boss ? 3 : 0 });
        a.mode = AMode.Dead; a.beamOpen = 0;
        this._cues.emit(SoundCue.Hit);
    }

    _collide() {
        if (!this.playerAlive) return;
        for (let i = this.enemyShots.length - 1; i >= 0; i--) {
            const s = this.enemyShots[i];
            if (Math.abs(f32(s.x - this.playerX)) <= ShipHalfW && f32(s.y + 3) >= f32(ShipY - ShipHalfH) && f32(s.y - 3) <= f32(ShipY + ShipHalfH)) {   // bolts are 2x6
                this.enemyShots.splice(i, 1);
                if (!this.credit.unlosable) { this._deathsBolt++; this._loseShip(); return; }
            }
        }
        for (const a of this.aliens) {
            if (!a.visible || a.mode === AMode.Formation) continue;
            if (Math.abs(f32(a.x - this.playerX)) < f32(a.halfW + ShipHalfW) && Math.abs(f32(a.y - ShipY)) < f32(a.halfH + ShipHalfH)) {
                this._kill(a);
                if (!this.credit.unlosable) { this._deathsRam++; this._loseShip(); return; }
            }
        }
    }

    _loseShip() {
        this.lives--; this._deaths++;
        this.playerAlive = false;
        this.bursts.push({ x: this.playerX, y: ShipY, t: 0, kind: 2 });
        this._cues.emit(SoundCue.Die);
        this.enemyShots.length = 0;
        this.p = Phase.ShipLost; this.phaseTime = 0;
        this._log += 'D@' + fmt(this._time, 1, F32) + ' ';
    }

    _capture(boss) {
        this.lives--; this._captures++;
        this.playerAlive = false; this.captured = true; this.captorId = boss.id; this.capturedFromX = this.playerX;
        boss.beamStage = 2; boss.t = 0; boss.beamOpen = 1;
        this._cues.emit(SoundCue.Die);
        this.enemyShots.length = 0;
        this.p = Phase.ShipLost; this.phaseTime = 0;
        this._log += 'K@' + fmt(this._time, 1, F32) + ' ';
    }

    findAlien(id) { for (const a of this.aliens) if (a.id === id) return a; return null; }

    // ------------------------------------------------------------------ stats
    collectStats(into) {
        add(into, 'deaths', this._deaths);
        add(into, 'captures', this._captures);
        add(into, 'lostToBolt', this._deathsBolt);
        add(into, 'lostToRam', this._deathsRam);
        add(into, 'waves', this.wavesCleared);
        add(into, 'kills', this._kills);
        add(into, 'dives', this._dives);
        add(into, 'beams', this._beams);
        add(into, 'accuracy', this._shotsFired > 0 ? this._hits / this._shotsFired : 0);
    }
}

SwarmPatrolRound.Phase = Phase;
SwarmPatrolRound.AlienKind = Kind;
SwarmPatrolRound.AlienMode = AMode;
SwarmPatrolRound.Waves = Waves; SwarmPatrolRound.StartShips = StartShips; SwarmPatrolRound.Cols = Cols;
SwarmPatrolRound.FieldLeft = FieldLeft; SwarmPatrolRound.FieldRight = FieldRight; SwarmPatrolRound.FieldTop = FieldTop; SwarmPatrolRound.FieldBottom = FieldBottom;
SwarmPatrolRound.ShipY = ShipY; SwarmPatrolRound.ShipMinX = ShipMinX; SwarmPatrolRound.ShipMaxX = ShipMaxX; SwarmPatrolRound.ShipSpeed = ShipSpeed;
SwarmPatrolRound.ShipHalfW = ShipHalfW; SwarmPatrolRound.ShipHalfH = ShipHalfH;
SwarmPatrolRound.ShotSpeed = ShotSpeed;
SwarmPatrolRound.BeamHalfMax = BeamHalfMax;
