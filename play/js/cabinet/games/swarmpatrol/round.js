// THE NODE · world 1 · SWARM PATROL (Skyline Coin Corp, 1981) on the Cabinet Engine · THE ROUND.
// Started as a port of SwarmPatrolSim.cs (Staging/Batch1/swarmpatrol); built out on 2026-10-18 into a whole game for a
// coin. Parity with the C# is retired: the C# was one screen of five waves.
//
// A formation shooter in eight STAGES (stages.js). Each stage opens on its STAGE CARD (number, name, a hint, what is
// new). The swarm flies in along parametric paths (a cubic, one or two loops, a cubic into its LIVE rank slot), locks
// into ranks at the top and sways there. Then aliens peel off singly or in pairs (a boss can bring two escorts) and dive
// at the lane, dropping bolts. The ship slides left/right and fires straight up: auto-repeat while A is held, at most 2
// shots on screen (4 as a twin). Touching a diver, a mite or a bolt costs a ship (3 ships; extra ships at 20000 and
// 60000). A stage ends when every alien is down; its TALLY counts the hit ratio and the bonuses up; then the next card.
//
//   the TRACTOR BEAM (stage 2 on): a boss dives to mid-screen and opens a beam. Sit in it for captureSeconds and the ship
//     is CAPTURED (a ship lost) and rides home over its captor. Shoot that boss while it is out of the ranks and the ship
//     comes back down and docks beside yours: a TWIN SHIP (two guns; a hit then costs only the half it lands on). Shoot
//     the captor in the ranks and the captive turns on you: a TURNCOAT ship that dives (1000).
//   SPLITTERS burst into two falling MITES when shot; IRON SHELLS take two hits; STINGERS glow in the ranks (Prime), then
//     strike straight down at where you were (Strike).
//   CHALLENGE STAGES (3, 7): five flights of eight fly through on set paths and never shoot or touch you; 100 a hit, 500
//     for a whole flight, and the tally pays 100 a hit again plus PERFECT 10000 for all forty.
//   THE HIVE QUEEN (stage 8, queen.js): two armoured wings, then her eye; her guard dives; she spits fans of bolts, drops
//     strike beams and hatches mites. Her death is the FINALE, then ROUND WON (the card reads HIVE BROKEN).
//
// Score (stages.js Points): drone 50, escort 80, boss 150 (two hits), splitter 100, mite 100, shell 120 (two hits),
// stinger 100; x2 for an alien not sitting in the ranks (a boss out of the ranks 400); turncoat 1000.
//
// MERCY: every lost round on this cabinet eases diveSpeed and diveRate by 8% (knobs, x0.92 per loss) and thins the
// queen's armour. credit.unlosable (credit 5): diveDepth snaps to 0.2 (divers barely leave the formation and swing
// straight back), no bolts, no beams, and the ship is SHIELDED: nothing can cost it a ship. The round is still WON only
// by breaking the queen.
//
// States: StageCard / Ready = Intro; Playing; ShipLost / Tally / Finale = Interlude; Card; Over.
// The sim sub-steps at <= 1/120 s so shots never tunnel and 30/60/144 Hz hosts agree.
// Sound: SDK cues (Start, Hit, Die, Bonus, Tick, Win) plus its own events (recordEvents / events / _emit, Starvector's
// way): fire, kill, dent, clank, dive, prime, strike, bolt, beam, capture, release, rescue, turncoat, captiveLost, split,
// shipLost, twinLost, extraShip, stage, go, stageClear, tally, perfect, flight, queenWarn, queenTele, queenFire,
// queenHit, wingBreak, queenPhase, eye, hatch, queenDie, queenBoom, queenGone (sound.js maps every one).
import { f32, idiv, fmt, F32, SoundCue, CueBuffer, CabinetState, RoundResult, Pad, SystemRandom } from '../../sdk/index.js';
import {
    STAGES, StageKind, AlienKind, Points, BossFlightPoints, ChallengeHit, FlightBonus, PerfectBonus, NoMissBonus,
    RescueBonus, QueenBonus, ExtraShipAt,
} from './stages.js';
import { HiveQueen } from './queen.js';

const Kind = AlienKind;
const AMode = Object.freeze({ Pending: 0, Enter: 1, Formation: 2, Peel: 3, Dive: 4, Beam: 5, Return: 6, Dead: 7, Prime: 8, Strike: 9, Fall: 10, Pass: 11 });
const Phase = Object.freeze({ Idle: 0, StageCard: 1, Ready: 2, Playing: 3, ShipLost: 4, Tally: 5, Finale: 6, Card: 7, Over: 8 });

// ------------------------------------------------------------------ the machine (not mercy knobs)
const StartShips = 3, MaxShips = 6, Cols = 10;
const FieldLeft = f32(8), FieldRight = f32(312), FieldTop = f32(30), FieldBottom = f32(216);
const ShipY = f32(204), ShipMinX = f32(16), ShipMaxX = f32(304), ShipSpeed = f32(125);
const ShipHalfW = 7, ShipHalfH = 5, TwinOffset = f32(8);
const ShotSpeed = f32(330), FireCooldown = f32(0.16);
const MaxShots = 2, MaxEnemyShots = 12;
const ColSpacing = f32(26), SwayAmp = f32(14), SwayW = f32(0.9);
const RowY = [f32(50), f32(66), f32(82), f32(98), f32(114)];
const CaptiveRise = f32(13);                    // the captive rides this far above its captor
const EntrySpeed = f32(165), GroupGap = f32(1.0), TrainGap = f32(0.16);
const PeelSeconds = f32(0.45), PeelRadius = f32(12), ReturnSpeed = f32(120);
const BoltCeiling = f32(90);
const BeamY = f32(128), BeamHalfMax = f32(16), BeamOpenSeconds = f32(0.6), BeamHoldSeconds = f32(2.4), BeamCloseSeconds = f32(0.4);
const PrimeSeconds = f32(0.75), StrikeAccel = f32(520), MiteGravity = f32(200);
const CardSeconds = f32(2.8), FirstCardSeconds = f32(3.4), ReadySeconds = f32(1.4), ReadyMaxSeconds = f32(6);
const ShipLostSeconds = f32(2.0), TallyFirst = f32(0.9), TallyStep = f32(0.55), TallyHold = f32(1.3), CardResultSeconds = f32(4.5);
const FinaleSeconds = f32(4.4), FinaleBlast = f32(2.6);
const SubStep = f32(1 / 120);
const PiF = f32(Math.PI);
const DemoStages = [4, 8, 6, 2, 5];             // the attract demo opens on one of these (by its seed)

function clampF(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function add(d, k, v) { d[k] = (d[k] || 0) + v; }

// ------------------------------------------------------------------ the cubic/loop flight path
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

// leg A (a static cubic), leg B (whole loops, tangent to A, curling UP away from the lane), leg C (a cubic from the
// loop's end into the alien's LIVE slot, approached from below, or out to a fixed exit for a challenge flier).
// Arc-length tables keep the flight speed even.
class EntryPath {
    constructor() {
        this.ax0 = 0; this.ay0 = 0; this.ax1 = 0; this.ay1 = 0; this.ax2 = 0; this.ay2 = 0; this.ax3 = 0; this.ay3 = 0;
        this.cx = 0; this.cy = 0; this.v0x = 0; this.v0y = 0; this.sigma = 0; this.radius = 0; this.sweep = 0;
        this.ex = 0; this.ey = 0; this.tx = 0; this.ty = 0; this.lead = 0; this.approach = 0;
        this.exitX = 0; this.exitY = 0;
        this.lenA = 0; this.lenB = 0; this.lenC = 0;
        this.lutA = new Array(N + 1).fill(0); this.lutC = new Array(N + 1).fill(0);
    }

    get length() { return f32(f32(this.lenA + this.lenB) + this.lenC); }

    static build(A, r, loops, s, lead, approach, toX, toY) {
        const p = new EntryPath();
        p.ax0 = f32(A[0]); p.ay0 = f32(A[1]); p.ax1 = f32(A[2]); p.ay1 = f32(A[3]);
        p.ax2 = f32(A[4]); p.ay2 = f32(A[5]); p.ax3 = f32(A[6]); p.ay3 = f32(A[7]);
        const dx = f32(p.ax3 - p.ax2), dy = f32(p.ay3 - p.ay2), l = f32(Math.sqrt(f32(f32(dx * dx) + f32(dy * dy))));
        p.tx = f32(dx / l); p.ty = f32(dy / l);
        const sg = p.tx > 0.05 ? -1 : p.tx < -0.05 ? 1 : -s;    // curl upward, away from the lane
        const nx = f32(sg * -p.ty), ny = f32(sg * p.tx);
        p.cx = f32(p.ax3 + f32(r * nx)); p.cy = f32(p.ay3 + f32(r * ny));
        p.v0x = f32(-r * nx); p.v0y = f32(-r * ny);
        p.sigma = sg; p.radius = r; p.sweep = f32(2 * Math.PI * loops);
        p.ex = p.ax3; p.ey = p.ay3; p.lead = lead; p.approach = approach;
        p.exitX = f32(toX); p.exitY = f32(toY);
        p.lenA = table(p.lutA, p.ax0, p.ay0, p.ax1, p.ay1, p.ax2, p.ay2, p.ax3, p.ay3);
        p.lenB = f32(r * p.sweep);
        p.lenC = table(p.lutC, p.ex, p.ey, f32(p.ex + f32(p.tx * p.lead)), f32(p.ey + f32(p.ty * p.lead)), toX, f32(toY + p.approach), toX, toY);
        return p;
    }

    // into the ranks. template 0: in from the top centre, swoop out to a side, loop, home. 1: in low from a side edge,
    // loop mid-screen, home. 2: down one side, across the middle, loop, home. 3: down a side, across, TWO loops, home.
    // 4: in high from a side, across the top, down the far side, loop, home.
    static make(template, s, slotX, slotY) {
        const c = (k) => f32(160 + s * k);
        switch (template) {
            case 0: return EntryPath.build([c(24), 12, c(24), 100, c(70), 160, c(112), 160], 26, 1, s, 24, 44, slotX, slotY);
            case 1: return EntryPath.build([c(-176), 186, c(-112), 186, c(-62), 176, c(-28), 150], 24, 1, s, 24, 44, slotX, slotY);
            case 2: return EntryPath.build([c(-112), 12, c(-112), 110, c(-44), 170, c(8), 170], 24, 1, s, 24, 44, slotX, slotY);
            case 3: return EntryPath.build([c(-150), 12, c(-150), 96, c(-96), 150, c(-44), 152], 20, 2, s, 24, 44, slotX, slotY);
            default: return EntryPath.build([c(-176), 64, c(-60), 52, c(70), 80, c(100), 146], 22, 1, s, 24, 44, slotX, slotY);
        }
    }

    // a challenge flier: in, loop(s), and out to an exit off the field. 0: the swoop (top centre, out to a side, loop,
    // off the far side). 1: the side loop (in low from a side, loop, out of the top). 2: the crossing (down one side,
    // across, loop, off the near side). 3: the figure (in high, across, two loops, off the far side). 4: the drop (straight
    // down a side, loop low, out of the top on the other side).
    static challenge(tpl, s) {
        const c = (k) => f32(160 + s * k);
        switch (tpl) {
            case 0: return EntryPath.build([c(30), -10, c(30), 80, c(-90), 150, c(-122), 126], 26, 1, s, 30, 40, c(204), 60);
            case 1: return EntryPath.build([c(-176), 156, c(-110), 156, c(-46), 136, c(-14), 104], 24, 1, s, 30, 40, c(-40), -24);
            case 2: return EntryPath.build([c(-128), -10, c(-128), 96, c(30), 160, c(104), 144], 22, 1, s, 30, 40, c(-204), 40);
            case 3: return EntryPath.build([c(-176), 70, c(-70), 60, c(10), 110, c(56), 140], 20, 2, s, 30, 40, c(204), 96);
            default: return EntryPath.build([c(84), -10, c(84), 110, c(-20), 168, c(-76), 150], 24, 1, s, 30, 40, c(-20), -24);
        }
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
        this.path = null; this.dist = 0; this.speedMul = 1;
        this.aimX = 0; this.aimT = 0; this.weavePhase = 0;
        this.diveVX = 0; this.diveVY = 0;
        this.nextShotY = 0; this.shotsLeft = 0; this.turnY = 0;
        this.peelX = 0; this.peelY = 0;
        this.beamStage = 0; this.beamX = 0; this.beamOpen = 0;
        this.carrying = false;        // a boss with a captured ship riding over it
        this.flash = 0;               // s of white after a hit that did not kill
        this.flight = -1;             // challenge flight
    }
    get visible() { return this.mode !== AMode.Dead && this.mode !== AMode.Pending; }
    get inFlight() { return this.mode !== AMode.Formation && this.mode !== AMode.Prime; }
    get attacking() { return this.mode === AMode.Peel || this.mode === AMode.Dive || this.mode === AMode.Beam || this.mode === AMode.Prime || this.mode === AMode.Strike; }
    get harmful() { return this.mode !== AMode.Formation && this.mode !== AMode.Pass && this.mode !== AMode.Prime && this.visible; }
    get halfW() { return this.kind === Kind.Mite ? 4 : this.kind === Kind.Drone || this.kind === Kind.Splitter || this.kind === Kind.Stinger ? 7 : 8; }
    get halfH() { return this.kind === Kind.Mite ? 4 : this.kind === Kind.Boss || this.kind === Kind.Stinger ? 7 : 6; }
}

class Shot { constructor() { this.id = 0; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; } }

export class SwarmPatrolRound {
    constructor() {
        this.p = Phase.Idle; this.phaseTime = 0;
        this.stage = 1; this.def = STAGES[0];
        this.playerX = 160; this.playerAlive = false; this.twin = false;
        this.captured = false; this.capturedFromX = 0; this.captorId = 0;
        this.rescue = null;            // { x, y, t }: a freed ship on its way down to dock
        this.queen = null;
        this.formationTime = 0; this.stageTotal = 0; this.stagesCleared = 0; this.clearedKinds = [];
        this.credit = null; this.isDemo = false;
        this.lives = StartShips;
        this.tally = null;             // { lines: [{ label, value, bonus, text }], shown, perfect, challenge }
        this.shake = 0; this.flash = 0; this.extraFlash = 0;
        this.recordEvents = false; this.events = [];

        this.aliens = []; this.playerShots = []; this.enemyShots = []; this.bursts = []; this.pops = [];

        this.diveSpeed = 0; this.diveRate = 0; this.shotChance = 0;
        this.pairChance = 0; this.beamChance = 0; this.diveDepth = 1; this.boltSpeed = 0; this.captureSeconds = 0;
        this.queenArmour = 1;

        this._cues = new CueBuffer();
        this._log = '';
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._nextId = 1; this._nextShotId = 1; this._nextBurstId = 1;
        this._time = 0; this._fireCooldown = 0; this._diveTimer = 0; this._captureAcc = 0;
        this._extraIdx = 0;
        this._st = {};
        this._stage = {};
    }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.StageCard: case Phase.Ready: return CabinetState.Intro;
            case Phase.Playing: return CabinetState.Playing;
            case Phase.ShipLost: case Phase.Tally: case Phase.Finale: return CabinetState.Interlude;
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
    get stageCount() { return STAGES.length; }
    get challenge() { return this.def.kind === StageKind.Challenge; }
    get diveSpeedNow() { return f32(this.diveSpeed * this.def.speed); }
    get diveRateNow() { return f32(this.diveRate * this.def.rate); }
    get captureProgress() { return this._captureAcc; }
    get beamActive() { for (const a of this.aliens) if (a.mode === AMode.Beam) return true; return false; }
    get captiveHeld() { for (const a of this.aliens) if (a.carrying && a.mode !== AMode.Dead) return true; return false; }
    get entryDone() { for (const a of this.aliens) if (a.mode === AMode.Pending || a.mode === AMode.Enter) return false; return true; }
    get aliveCount() { let n = 0; for (const a of this.aliens) if (a.mode !== AMode.Dead) n++; return n; }
    get shipXs() { return this.twin ? [f32(this.playerX - TwinOffset), f32(this.playerX + TwinOffset)] : [this.playerX]; }
    get shotsFired() { return this._st.shots || 0; }
    get shotsHit() { return this._st.hits || 0; }
    get stageShots() { return this._stage.shots || 0; }
    get stageHits() { return this._stage.hits || 0; }
    get challengeHits() { return this._stage.chHits || 0; }
    get hitRatio() { return this.shotsFired > 0 ? this.shotsHit / this.shotsFired : 0; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' stage ' + this.stage + ' ships ' + this.lives + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's  ' + this._log.trimEnd();
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.diveSpeed = k.get('diveSpeed');
        this.diveRate = k.get('diveRate');
        this.shotChance = k.get('shotChance');
        this.pairChance = k.get('pairChance');
        this.beamChance = k.get('beamChance');
        this.diveDepth = k.get('diveDepth');
        this.boltSpeed = k.get('boltSpeed');
        this.captureSeconds = k.get('captureSeconds');
        this.queenArmour = k.get('queenArmour', 1);
        if (credit.unlosable) { this.shotChance = 0; this.beamChance = 0; this.diveDepth = Math.min(this.diveDepth, 0.2); }

        this._score = 0; this.lives = StartShips; this._time = 0; this._nextId = 1; this._nextShotId = 1; this._nextBurstId = 1;
        this._st = { deaths: 0, captures: 0, rescues: 0, turncoats: 0, kills: 0, shots: 0, hits: 0, dives: 0, beams: 0, strikes: 0,
            lostToBolt: 0, lostToRam: 0, lostToQueen: 0, twinLost: 0, perfects: 0, chHits: 0, extras: 0 };
        this.stagesCleared = 0; this.clearedKinds.length = 0; this.formationTime = 0; this._extraIdx = 0;
        this.playerX = 160; this.playerAlive = true; this.twin = false; this.captured = false; this.captorId = 0; this.rescue = null;
        this.shake = 0; this.flash = 0; this.extraFlash = 0;
        this._result = RoundResult.None;
        this._log = '';
        this.events.length = 0;
        this._cues.resetTotals();
        this.aliens.length = 0; this.playerShots.length = 0; this.enemyShots.length = 0; this.bursts.length = 0; this.pops.length = 0;
        let first = 1;
        if (this.isDemo) { const n = DemoStages.length; first = DemoStages[((seed % n) + n) % n]; }
        this._startStage(first);
    }

    // ------------------------------------------------------------------ the stage
    _startStage(n) {
        this.stage = n; this.def = STAGES[n - 1];
        this.aliens.length = 0; this.playerShots.length = 0; this.enemyShots.length = 0; this.pops.length = 0;
        this.playerAlive = true; this.captured = false; this.captorId = 0; this.rescue = null;   // a ship lost on the last kill comes back here
        this.queen = null; this.tally = null;
        this._stage = { shots: 0, hits: 0, lost: 0, chHits: 0, flights: [0, 0, 0, 0, 0], escaped: 0, beams: 0 };
        const list = [];
        if (this.def.kind === StageKind.Challenge) {
            for (let f = 0; f < this.def.flights.length; f++) {
                const fl = this.def.flights[f];
                for (let j = 0; j < 8; j++) {
                    const a = new Alien();
                    a.id = this._nextId++; a.kind = fl.kinds[j % 4]; a.mode = AMode.Pending; a.flight = f; a.hp = 1;
                    a.weavePhase = f32(this._rng.nextDouble() * Math.PI * 2);
                    list.push(a);
                }
            }
        } else {
            const rows = this.def.rows;
            for (let r = 0; r < rows.length; r++) this._addRow(list, r, rows[r][1], rows[r][0]);
        }
        for (const a of list) this.aliens.push(a);
        this.stageTotal = list.length;
        this.p = Phase.StageCard; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
        this._emit('stage', { n, challenge: this.def.kind === StageKind.Challenge, queen: this.def.kind === StageKind.Queen });
        if (this.def.kind === StageKind.Queen) this._emit('queenWarn');
        this._log += 's' + n + '@' + fmt(this._time, 1, F32) + ' ';
    }

    _addRow(list, row, n, kind) {
        const start = idiv(Cols - n, 2);
        for (let i = 0; i < n; i++) {
            const a = new Alien();
            a.id = this._nextId++; a.kind = kind; a.mode = AMode.Pending; a.row = row; a.col = start + i;
            a.hp = kind === Kind.Boss || kind === Kind.Shell ? 2 : 1; a.x = -100; a.y = -100;
            a.weavePhase = f32(this._rng.nextDouble() * Math.PI * 2);
            list.push(a);
        }
    }

    // the swarm leaves in trains; each train shares a path template and a side (pairs: two mirrored trains at once)
    _launchEntries() {
        const d = this.def, n = this.aliens.length;
        const per = Math.max(1, idiv(n + d.trains - 1, d.trains));
        const mul = f32(d.entrySpeed || 1);
        for (let i = 0; i < n; i++) {
            const a = this.aliens[i];
            const g = idiv(i, per), k = i % per;
            const template = d.entry[g % d.entry.length];
            const side = (g % 2 === 0) ? 1 : -1;
            a.path = EntryPath.make(template, side, this.slotX(a), this.slotY(a));
            const slot = d.pairs ? f32(idiv(g, 2) * f32(GroupGap * 1.5)) : f32(g * GroupGap);
            a.launchAt = f32(f32(this._time + slot) + f32(k * TrainGap));
            a.dist = 0; a.speedMul = mul;
        }
        this._diveTimer = 1.0;
    }

    // a challenge stage: five flights of eight, each on its own path, a few seconds apart
    _launchFlights() {
        const d = this.def, mul = f32(d.entrySpeed || 1);
        for (const a of this.aliens) {
            const fl = d.flights[a.flight];
            const j = (a.id - 1) % 8;
            const side = fl.pair ? (j < 4 ? 1 : -1) : (a.flight % 2 === 0 ? 1 : -1);
            const k = fl.pair ? j % 4 : j;
            a.path = EntryPath.challenge(fl.tpl, side);
            a.launchAt = f32(f32(f32(this._time + 0.6) + f32(a.flight * d.flightGap)) + f32(k * f32(0.2)));
            a.dist = 0; a.speedMul = mul;
        }
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

    // dives start once half the swarm has taken its place in the ranks
    _settled() {
        let home = 0, all = 0;
        for (const a of this.aliens) {
            if (a.mode === AMode.Dead) continue;
            all++;
            if (a.mode !== AMode.Pending && a.mode !== AMode.Enter) home++;
        }
        return home * 2 >= all;
    }

    _stageEmpty() { for (const a of this.aliens) if (a.mode !== AMode.Dead) return false; return true; }

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
        this._ageFx(h);

        switch (this.p) {
            case Phase.StageCard:
                if (this.phaseTime >= (this.stage === 1 ? FirstCardSeconds : CardSeconds)) {
                    this._cues.emit(SoundCue.Start);
                    this._emit('go', { n: this.stage });
                    this._beginPlay(true);
                }
                break;

            case Phase.Ready:
                this._updateAliens(h, false, false);
                if (this.queen) this.queen.update(this, h, false);
                this._updatePlayerShots(h);
                this._updateEnemyShots(h);
                this._updateRescue(h);
                if ((this.phaseTime >= ReadySeconds && !this._anyAttacking() && !(this.queen && this.queen.busy)) || this.phaseTime >= ReadyMaxSeconds) {
                    this._cues.emit(SoundCue.Start); this._emit('go', { n: this.stage, again: true }); this._beginPlay(false);
                }
                break;

            case Phase.Playing: {
                if (this.playerAlive) {
                    const lo = this.twin ? f32(ShipMinX + TwinOffset) : ShipMinX, hi = this.twin ? f32(ShipMaxX - TwinOffset) : ShipMaxX;
                    this.playerX = clampF(f32(this.playerX + f32(f32(move * ShipSpeed) * h)), lo, hi);
                    this._fireCooldown = f32(this._fireCooldown - h);
                    const cap = this.twin ? MaxShots * 2 : MaxShots;
                    if ((firePressed || fireHeld) && this._fireCooldown <= 0 && this.playerShots.length + (this.twin ? 1 : 0) < cap) {
                        for (const x of this.shipXs) {
                            const sh = new Shot();
                            sh.id = this._nextShotId++; sh.x = x; sh.y = f32(ShipY - 7); sh.vx = 0; sh.vy = f32(-ShotSpeed);
                            this.playerShots.push(sh);
                            this._st.shots++; this._stage.shots++;
                        }
                        this._fireCooldown = FireCooldown;
                        this._emit('fire', { twin: this.twin });
                    }
                }
                this._updateAliens(h, true, true);
                if (this.p !== Phase.Playing) break;               // a beam capture
                if (this.queen) { this.queen.update(this, h, true); if (this.p !== Phase.Playing) break; }
                this._updatePlayerShots(h);
                if (this.p !== Phase.Playing) break;               // the queen's death
                this._updateEnemyShots(h);
                this._updateRescue(h);
                this._collide();
                if (this.p === Phase.Playing && this.def.kind !== StageKind.Queen && this.entryDone && this._stageEmpty() && this.rescue == null) this._beginTally();
                break;
            }

            case Phase.ShipLost:
                this._updateAliens(h, false, false);
                if (this.queen) this.queen.update(this, h, false);
                this._updatePlayerShots(h);
                this._updateEnemyShots(h);
                this._updateRescue(h);
                if (this.phaseTime >= ShipLostSeconds) {
                    if (this.lives <= 0) this._enterCard(RoundResult.Lost);
                    else if (this.def.kind !== StageKind.Queen && this.entryDone && this._stageEmpty() && this.rescue == null) this._beginTally();
                    else {
                        this.playerAlive = true; this.captured = false; this.captorId = 0;
                        this.playerX = 160;
                        this.p = Phase.Ready; this.phaseTime = 0;
                    }
                }
                break;

            case Phase.Tally: {
                const T = this.tally;
                while (T.shown < T.lines.length && this.phaseTime >= f32(TallyFirst + f32(T.shown * TallyStep))) {
                    const L = T.lines[T.shown++];
                    if (L.bonus > 0) this._addScore(L.bonus);
                    this._emit('tally', { i: T.shown - 1, bonus: L.bonus, perfect: !!L.perfect });
                    if (L.perfect) this._emit('perfect');
                }
                if (this.phaseTime >= f32(f32(TallyFirst + f32(T.lines.length * TallyStep)) + TallyHold)) this._startStage(this.stage + 1);
                break;
            }

            case Phase.Finale: {
                const q = this.queen;
                this._updatePlayerShots(h);
                if (q) q.update(this, h, false);
                if (this.phaseTime >= FinaleSeconds) this._enterCard(RoundResult.Won);
                break;
            }

            case Phase.Card:
                if (this.phaseTime >= CardResultSeconds) this.p = Phase.Over;
                break;
        }
    }

    _ageFx(h) {
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.t = f32(b.t + h);
            if (b.t > SwarmPatrolRound.burstLife(b.kind)) this.bursts.splice(i, 1);
        }
        for (let i = this.pops.length - 1; i >= 0; i--) {
            const o = this.pops[i];
            o.t = f32(o.t + h);
            if (o.t > o.life) this.pops.splice(i, 1);
        }
        if (this.shake > 0) this.shake = Math.max(0, f32(this.shake - f32(h * 7)));
        if (this.flash > 0) this.flash = Math.max(0, f32(this.flash - f32(h * 2.5)));
        if (this.extraFlash > 0) this.extraFlash = Math.max(0, f32(this.extraFlash - h));
    }

    static burstLife(kind) { return kind === 2 ? 1.6 : kind === 1 || kind === 4 ? 0.25 : kind === 5 ? 1.0 : kind === 6 ? 1.6 : kind === 7 ? 0.35 : 0.5; }

    _burst(x, y, kind) { this.bursts.push({ id: this._nextBurstId++, x, y, t: 0, kind }); }

    // a score pop-up: text, where, colour name ('white' | 'gold' | 'cyan' | 'pink'), seconds
    _pop(x, y, text, c = 'white', life = 0.9) { this.pops.push({ x: clampF(x, 24, 296), y, text, c, t: 0, life }); }

    _addScore(v) {
        this._score += v;
        while (this._extraIdx < ExtraShipAt.length && this._score >= ExtraShipAt[this._extraIdx]) {
            this._extraIdx++;
            if (this.lives < MaxShips) this.lives++;
            this._st.extras++;
            this.extraFlash = 2.4;
            this._cues.emit(SoundCue.Bonus);
            this._emit('extraShip', { n: this._extraIdx });
            this._log += 'X@' + fmt(this._time, 1, F32) + ' ';
        }
    }

    _beginPlay(newStage) {
        this.p = Phase.Playing; this.phaseTime = 0;
        this._fireCooldown = 0;
        if (newStage) {
            if (this.def.kind === StageKind.Challenge) this._launchFlights();
            else {
                this._launchEntries();
                if (this.def.kind === StageKind.Queen) this.queen = new HiveQueen(this.queenArmour);
            }
        } else this._diveTimer = f32(1.2 + this._nextInterval());
    }

    _beginTally() {
        this.p = Phase.Tally; this.phaseTime = 0;
        this.stagesCleared++; this.clearedKinds.push(this.def.kind);
        this.enemyShots.length = 0; this.playerShots.length = 0;
        const S = this._stage, lines = [];
        if (this.challenge) {
            const hits = S.chHits;
            lines.push({ label: 'NUMBER OF HITS', text: hits + ' OF ' + this.stageTotal, bonus: 0 });
            lines.push({ label: 'HIT BONUS', text: String(hits * ChallengeHit), bonus: hits * ChallengeHit });
            if (hits >= this.stageTotal) { lines.push({ label: 'PERFECT', text: String(PerfectBonus), bonus: PerfectBonus, perfect: true }); this._st.perfects++; }
            else lines.push({ label: 'PERFECT', text: '-----', bonus: 0 });
        } else {
            const pct = S.shots > 0 ? Math.trunc((S.hits * 100) / S.shots) : 0;
            lines.push({ label: 'SHOTS ' + S.shots, text: 'HITS ' + S.hits, bonus: 0 });
            lines.push({ label: 'HIT RATIO', text: pct + '%', bonus: 0 });
            lines.push({ label: 'RATIO BONUS', text: String(pct * 10), bonus: pct * 10 });
            const nm = S.lost === 0 ? NoMissBonus + 500 * (this.stage - 1) : 0;
            lines.push({ label: 'NO MISS BONUS', text: nm > 0 ? String(nm) : '-----', bonus: nm });
        }
        this.tally = { lines, shown: 0, challenge: this.challenge };
        this._cues.emit(SoundCue.Bonus);
        this._emit('stageClear', { n: this.stage, challenge: this.challenge });
        this._log += 'C' + this.stage + '@' + fmt(this._time, 1, F32) + ' ';
    }

    // the queen is down: her death throes, then the card
    _beginFinale() {
        this.p = Phase.Finale; this.phaseTime = 0;
        this.stagesCleared++; this.clearedKinds.push(this.def.kind);
        this.enemyShots.length = 0;
        for (const a of this.aliens) if (a.mode !== AMode.Dead && a.visible) { this._burst(a.x, a.y, 0); a.mode = AMode.Dead; a.carrying = false; }
        this._addScore(QueenBonus);
        this._pop(this.queen.x, this.queen.y + 24, String(QueenBonus), 'gold', 2.4);
        this.shake = Math.max(this.shake, 3);
        this._emit('queenDie');
        this._log += 'Q@' + fmt(this._time, 1, F32) + ' ';
    }

    _enterCard(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
        this._emit('card', { won: r === RoundResult.Won });
    }

    _anyAttacking() { for (const a of this.aliens) if (a.attacking || a.mode === AMode.Fall) return true; return false; }

    _nextInterval() {
        let rate = this.diveRateNow;
        const alive = this.aliveCount;
        if (this.stageTotal > 0) rate = f32(rate * f32(1 + f32(0.5 * f32(1 - f32(Math.min(alive, this.stageTotal) / this.stageTotal)))));
        return f32(f32(0.5 + f32(this._rng.nextDouble())) / Math.max(0.01, rate));
    }

    // ------------------------------------------------------------------ aliens
    _updateAliens(h, allowDives, allowFire) {
        const spd = this.diveSpeedNow;
        for (const a of this.aliens) {
            if (a.mode === AMode.Dead) continue;
            let ox = a.x, oy = a.y;
            a.t = f32(a.t + h);
            if (a.flash > 0) a.flash = Math.max(0, f32(a.flash - h));
            switch (a.mode) {
                case AMode.Pending:
                    if (a.path != null && this._time >= a.launchAt) {
                        a.mode = a.flight >= 0 ? AMode.Pass : AMode.Enter; a.dist = 0; a.t = 0;
                        const p0 = a.flight >= 0 ? a.path.eval(0, a.path.exitX, a.path.exitY) : a.path.eval(0, this.slotX(a), this.slotY(a));
                        a.x = p0[0]; a.y = p0[1];
                        ox = a.x; oy = a.y;
                    }
                    break;
                case AMode.Enter:
                    a.dist = f32(a.dist + f32(f32(EntrySpeed * a.speedMul) * h));
                    if (a.dist >= a.path.length) { a.mode = AMode.Formation; a.x = this.slotX(a); a.y = this.slotY(a); }
                    else { const p1 = a.path.eval(a.dist, this.slotX(a), this.slotY(a)); a.x = p1[0]; a.y = p1[1]; }
                    break;
                case AMode.Pass:
                    a.dist = f32(a.dist + f32(f32(EntrySpeed * a.speedMul) * h));
                    if (a.dist >= a.path.length) { a.mode = AMode.Dead; this._stage.escaped++; }
                    else { const p2 = a.path.eval(a.dist, a.path.exitX, a.path.exitY); a.x = p2[0]; a.y = p2[1]; }
                    break;
                case AMode.Formation:
                    a.x = this.slotX(a); a.y = this.slotY(a);
                    break;
                case AMode.Prime:                                   // a stinger glows and shivers in its slot
                    a.x = this.slotX(a); a.y = this.slotY(a);
                    if (a.t >= PrimeSeconds) {
                        a.mode = AMode.Strike; a.t = 0;
                        a.diveVX = 0; a.diveVY = f32(40);
                        a.aimX = clampF(this.playerX, 20, 300);
                        this._st.strikes++;
                        this._emit('strike', { x: a.x });
                    }
                    break;
                case AMode.Strike: {                                // straight down at where you were, faster and faster
                    const top = f32(spd * 2.1);
                    a.diveVY = Math.min(top, f32(a.diveVY + f32(StrikeAccel * h)));
                    if (a.y < f32(ShipY - 80)) {
                        const want = clampF(f32(f32(a.aimX - a.x) * 2.2), -95, 95);
                        a.diveVX = f32(a.diveVX + clampF(f32(want - a.diveVX), f32(-300 * h), f32(300 * h)));
                    }
                    a.x = clampF(f32(a.x + f32(a.diveVX * h)), 16, 304); a.y = f32(a.y + f32(a.diveVY * h));
                    if (a.y > f32(FieldBottom + 10)) {
                        a.y = f32(FieldTop - 16); a.x = this.slotX(a); ox = a.x; oy = a.y;
                        a.mode = AMode.Return; a.t = 0;
                    }
                    break;
                }
                case AMode.Fall:                                    // a mite (or the queen's brood): falls and is gone
                    a.diveVY = Math.min(f32(spd * 1.25), f32(a.diveVY + f32(MiteGravity * h)));
                    a.x = f32(a.x + f32(a.diveVX * h)); a.y = f32(a.y + f32(a.diveVY * h));
                    if (a.x < 14) { a.x = 14; a.diveVX = Math.abs(a.diveVX); }
                    if (a.x > 306) { a.x = 306; a.diveVX = f32(-Math.abs(a.diveVX)); }
                    if (a.y > f32(FieldBottom + 10)) { a.mode = AMode.Dead; this._stage.escaped++; }
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

        if (allowDives && this.p === Phase.Playing && this.playerAlive && this.def.kind !== StageKind.Challenge && this._settled()) {
            this._diveTimer = f32(this._diveTimer - h);
            if (this._diveTimer <= 0) {
                let active = 0;
                for (const a of this.aliens) if (a.attacking) active++;
                if (active < this.def.attack) { this._launchDive(); this._diveTimer = this._nextInterval(); }
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
                if (d <= step) { a.x = a.beamX; a.y = BeamY; a.beamStage = 1; a.t = 0; this._captureAcc = 0; this._emit('beam', { x: a.x }); }
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
        if (this.p === Phase.Playing && this.playerAlive && !this.twin && !this.credit.unlosable && (a.beamStage === 1 || a.beamStage === 2) && a.beamOpen > 0.5 &&
            Math.abs(f32(this.playerX - a.x)) < f32(f32(BeamHalfMax * a.beamOpen) - 2)) {
            this._captureAcc = f32(this._captureAcc + h);
            if (this._captureAcc >= this.captureSeconds) this._capture(a);
        }
    }

    _launchDive() {
        const pool = [];
        let boss = null;
        const d = this.def;
        for (const a of this.aliens)
            if (a.mode === AMode.Formation) {
                pool.push(a);
                if (a.kind === Kind.Boss && (boss == null || this._rng.nextDouble() < 0.5)) boss = a;
            }
        if (pool.length === 0) return;
        // a stinger primes (it strikes alone)
        if (d.stingers > 0 && this._rng.nextDouble() < d.stingers) {
            const st = pool.filter(a => a.kind === Kind.Stinger);
            if (st.length > 0) {
                const s = st[this._rng.next(st.length)];
                s.mode = AMode.Prime; s.t = 0;
                this._st.dives++;
                this._emit('prime', { x: s.x });
                return;
            }
        }
        if (boss != null && (this._rng.nextDouble() < 0.3 || pool.length <= 2)) {
            // a beam stage's first boss attack is always a beam (when one can open); later ones, beamChance of them
            const beamOk = d.beams && this.beamChance > 0 && !boss.carrying && !this.beamActive && !this.captiveHeld && !this.twin && this.rescue == null;
            if (beamOk && (this._stage.beams === 0 || this._rng.nextDouble() < this.beamChance)) {
                this._stage.beams++;
                boss.mode = AMode.Beam; boss.t = 0; boss.beamStage = 0; boss.beamOpen = 0;
                boss.beamX = clampF(this.playerX, 40, 280);
                this._st.beams++;
                this._emit('dive', { boss: true });
                return;
            }
            this._startDive(boss, 0, boss.col < idiv(Cols, 2) ? -1 : 1);
            let k = 0;
            for (const e of pool)
                if (e !== boss && e.kind !== Kind.Boss && e.kind !== Kind.Stinger && e.row === 1 && Math.abs(e.col - boss.col) <= 1 && k < 2 && this._rng.nextDouble() < d.escortBoss) {
                    k++;
                    this._startDive(e, f32(0.12 * k), boss.side);
                }
            this._emit('dive', { boss: true, escorts: k });
            return;
        }
        let pick = [];
        for (const a of pool) if (a.kind !== Kind.Boss && a.kind !== Kind.Stinger) pick.push(a);
        if (pick.length === 0) for (const a of pool) if (a.kind !== Kind.Stinger) pick.push(a);
        if (pick.length === 0) pick = pool;
        const v = pick[this._rng.next(pick.length)];
        if (v.kind === Kind.Stinger) { v.mode = AMode.Prime; v.t = 0; this._st.dives++; this._emit('prime', { x: v.x }); return; }
        this._startDive(v, 0, v.col < idiv(Cols, 2) ? -1 : 1);
        this._emit('dive', {});
        if (this._rng.nextDouble() < f32(this.pairChance * f32(0.5 + d.speed * 0.5) + d.wingman))
            for (const w of pool)
                if (w !== v && w.mode === AMode.Formation && w.kind !== Kind.Stinger && w.row === v.row && Math.abs(w.col - v.col) === 1) { this._startDive(w, 0.15, v.side); break; }
    }

    _startDive(a, delay, side) {
        a.mode = AMode.Peel; a.t = f32(-delay); a.side = side;
        a.peelX = a.x; a.peelY = a.y;
        a.shotsLeft = this.def.bolts + (a.kind === Kind.Shell ? 1 : 0); a.nextShotY = f32(70 + f32(this._rng.nextDouble() * 16));
        a.turnY = this.diveDepth >= 0.999 ? 1e9 : f32(this.slotY(a) + f32(this.diveDepth * f32(ShipY - this.slotY(a))));
        this._st.dives++;
    }

    _fireAt(a) {
        if (this.enemyShots.length >= MaxEnemyShots) return;
        const vy = Math.max(60, f32(this.boltSpeed * a.diveVY));           // a bolt falls a multiple of its diver's speed
        const tt = Math.max(0.3, f32(f32(ShipY - a.y) / vy));
        const vx = clampF(f32(f32(f32(this.playerX - a.x) / tt) * 0.8), -70, 70);
        this.fireBolt(a.x, f32(a.y + a.halfH), vx, vy);
    }

    fireBolt(x, y, vx, vy) {
        if (this.enemyShots.length >= MaxEnemyShots) return false;
        const sh = new Shot();
        sh.id = this._nextShotId++; sh.x = f32(x); sh.y = f32(y); sh.vx = f32(vx); sh.vy = f32(vy);
        this.enemyShots.push(sh);
        this._emit('bolt', {});
        return true;
    }

    // a mite (a splitter's half, or the queen's brood): falls from (x, y) with a sideways push
    spawnMite(x, y, vx, vy) {
        const m = new Alien();
        m.id = this._nextId++; m.kind = Kind.Mite; m.mode = AMode.Fall; m.hp = 1;
        m.x = f32(x); m.y = f32(y); m.diveVX = f32(vx); m.diveVY = f32(vy); m.row = 4; m.col = 0;
        this.aliens.push(m);
        return m;
    }

    // ------------------------------------------------------------------ shots and hits
    _updatePlayerShots(h) {
        for (let i = this.playerShots.length - 1; i >= 0; i--) {
            const s = this.playerShots[i];
            s.y = f32(s.y + f32(s.vy * h));
            if (s.y < f32(FieldTop - 4)) { this.playerShots.splice(i, 1); continue; }
            let hit = false;
            for (const a of this.aliens) {
                if (!a.visible) continue;
                if (Math.abs(f32(s.x - a.x)) <= a.halfW && s.y <= f32(a.y + a.halfH) && s.y >= f32(a.y - a.halfH - 4)) {
                    this.playerShots.splice(i, 1);
                    this._st.hits++; this._stage.hits++;
                    this._hitAlien(a);
                    hit = true;
                    break;
                }
                if (a.carrying && Math.abs(f32(s.x - a.x)) <= 7 && s.y <= f32(f32(a.y - CaptiveRise) + 5) && s.y >= f32(f32(a.y - CaptiveRise) - 9)) {
                    this.playerShots.splice(i, 1);                     // you shot your own captured ship
                    a.carrying = false;
                    this._burst(a.x, f32(a.y - CaptiveRise), 2);
                    this._pop(a.x, f32(a.y - 24), 'SHIP LOST', 'pink', 1.2);
                    this._emit('captiveLost');
                    hit = true;
                    break;
                }
            }
            if (hit) continue;
            if (this.queen && !this.queen.dying) {
                const r = this.queen.shotHits(s.x, s.y);
                if (r > 0) {
                    this.playerShots.splice(i, 1);
                    this._st.hits++; this._stage.hits++;
                    this.queen.takeHit(this, r, s.x);
                    if (this.queen.dead && this.p !== Phase.Finale) { this._beginFinale(); return; }
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

    // the freed ship spins down to dock beside yours: a twin
    _updateRescue(h) {
        const r = this.rescue;
        if (r == null) return;
        r.t = f32(r.t + h);
        const live = this.playerAlive && (this.p === Phase.Playing || this.p === Phase.Ready);
        const tx = live ? (this.playerX + 16 > ShipMaxX ? f32(this.playerX - 16) : f32(this.playerX + 16)) : r.x;
        const ty = live ? ShipY : f32(ShipY - 46);
        const dx = f32(tx - r.x), dy = f32(ty - r.y);
        r.x = f32(r.x + clampF(dx, f32(-110 * h), f32(110 * h)));
        r.y = f32(r.y + clampF(dy, f32(-50 * h), f32(75 * h)));
        if (live && r.t > 1.0 && Math.abs(f32(ty - r.y)) < 1 && Math.abs(f32(tx - r.x)) < 2) {
            this.rescue = null;
            if (!this.twin) {
                this.twin = true;
                this.playerX = clampF(f32((this.playerX + tx) * 0.5), f32(ShipMinX + TwinOffset), f32(ShipMaxX - TwinOffset));
            }
            this._addScore(RescueBonus);
            this._pop(this.playerX, f32(ShipY - 22), 'TWIN SHIP', 'cyan', 1.4);
            this._st.rescues++;
            this._emit('rescue');
            this._log += 'T@' + fmt(this._time, 1, F32) + ' ';
        }
    }

    _hitAlien(a) {
        if ((a.kind === Kind.Boss || a.kind === Kind.Shell) && a.hp > 1 && a.mode !== AMode.Pass) {
            a.hp--;
            a.flash = f32(0.1);
            this._burst(a.x, a.y, a.kind === Kind.Shell ? 4 : 1);
            this._cues.emit(SoundCue.Hit);
            this._emit(a.kind === Kind.Shell ? 'clank' : 'dent', {});
            return;
        }
        this._kill(a, true);
    }

    _kill(a, shot) {
        let pts;
        if (a.mode === AMode.Pass) {
            pts = ChallengeHit;
            const S = this._stage;
            S.chHits++; this._st.chHits++;
            S.flights[a.flight]++;
            if (S.flights[a.flight] === 8) {
                pts += FlightBonus;
                this._pop(a.x, f32(a.y - 10), String(ChallengeHit + FlightBonus), 'gold', 1.1);
                this._emit('flight', { n: a.flight });
            }
        } else if (a.kind === Kind.Boss) pts = a.inFlight ? BossFlightPoints : Points[Kind.Boss];
        else if (a.kind === Kind.Mite || a.kind === Kind.Turncoat) pts = Points[a.kind];
        else pts = Points[a.kind] * (a.inFlight ? 2 : 1);
        this._addScore(pts);
        if (a.mode !== AMode.Pass && (pts >= 160 || a.kind === Kind.Boss)) this._pop(a.x, f32(a.y - 10), String(pts), pts >= 400 ? 'gold' : 'white');
        this._st.kills++;
        const big = a.kind === Kind.Boss || a.kind === Kind.Turncoat;
        this._burst(a.x, a.y, big ? 3 : a.kind === Kind.Mite ? 7 : 0);
        const wasFlying = a.inFlight, mode = a.mode;
        a.mode = AMode.Dead; a.beamOpen = 0;
        this._cues.emit(SoundCue.Hit);
        this._emit('kill', { k: a.kind, flight: wasFlying, big, pts });
        if (a.kind === Kind.Splitter && mode !== AMode.Pass) {
            const spd = this.diveSpeedNow;
            const push = f32(55 + f32(this._rng.nextDouble() * 30));
            this.spawnMite(f32(a.x - 4), a.y, -push, f32(spd * 0.45));
            this.spawnMite(f32(a.x + 4), a.y, push, f32(spd * 0.45));
            this._emit('split', {});
        }
        if (a.carrying) {
            a.carrying = false;
            if (wasFlying) {
                this.rescue = { x: a.x, y: f32(a.y - CaptiveRise), t: 0 };
                this._emit('release');
            } else {
                const t = new Alien();                                   // shot in the ranks: the captive turns on you
                t.id = this._nextId++; t.kind = Kind.Turncoat; t.mode = AMode.Formation; t.hp = 1;
                t.row = a.row; t.col = a.col; t.x = this.slotX(t); t.y = this.slotY(t);
                t.weavePhase = a.weavePhase;
                this.aliens.push(t);
                this._st.turncoats++;
                this._pop(t.x, f32(t.y + 12), 'TURNCOAT', 'pink', 1.3);
                this._emit('turncoat');
            }
        }
        if (this.captured && a.id === this.captorId) this.captorId = 0;
    }

    _collide() {
        if (!this.playerAlive) return;
        const xs = this.shipXs;
        for (let i = this.enemyShots.length - 1; i >= 0; i--) {
            const s = this.enemyShots[i];
            if (f32(s.y + 3) < f32(ShipY - ShipHalfH) || f32(s.y - 3) > f32(ShipY + ShipHalfH)) continue;   // bolts are 2x6
            for (let k = 0; k < xs.length; k++)
                if (Math.abs(f32(s.x - xs[k])) <= ShipHalfW) {
                    this.enemyShots.splice(i, 1);
                    if (!this.credit.unlosable) { if (this._hitShip(k, 'bolt')) return; }
                    break;
                }
            if (xs.length !== this.shipXs.length) return;
        }
        for (const a of this.aliens) {
            if (!a.harmful) continue;
            if (Math.abs(f32(a.y - ShipY)) >= f32(a.halfH + ShipHalfH)) continue;
            for (let k = 0; k < xs.length; k++)
                if (Math.abs(f32(a.x - xs[k])) < f32(a.halfW + ShipHalfW)) {
                    this._kill(a, false);
                    if (!this.credit.unlosable) { if (this._hitShip(k, 'ram')) return; }
                    if (this.twin !== (xs.length === 2)) return;
                    break;
                }
        }
    }

    // a hit on half k of the ship (0 = the only one). A twin loses that half; else a ship is lost. True = stop checking.
    _hitShip(k, cause) {
        if (this.twin) {
            const xs = this.shipXs;
            this.twin = false;
            this._burst(xs[k], ShipY, 2);
            this.playerX = xs[1 - k];
            this._st.twinLost++;
            this.shake = Math.max(this.shake, 2);
            this._emit('twinLost', { cause });
            this._log += 't@' + fmt(this._time, 1, F32) + ' ';
            return true;
        }
        if (cause === 'bolt') this._st.lostToBolt++; else if (cause === 'ram') this._st.lostToRam++; else this._st.lostToQueen++;
        this._loseShip(cause);
        return true;
    }

    // the queen's strike beam (queen.js) asks: is the ship (either half) in this column?
    hitByColumn(x, half) {
        if (!this.playerAlive || this.p !== Phase.Playing || this.credit.unlosable) return false;
        const xs = this.shipXs;
        for (let k = 0; k < xs.length; k++)
            if (Math.abs(f32(xs[k] - x)) < f32(half + ShipHalfW - 1)) { this._hitShip(k, 'queen'); return true; }
        return false;
    }

    _loseShip(cause) {
        this.lives--; this._st.deaths++; this._stage.lost++;
        this.playerAlive = false;
        this._burst(this.playerX, ShipY, 2);
        this._cues.emit(SoundCue.Die);
        this._emit('shipLost', { last: this.lives <= 0, cause });
        this.shake = Math.max(this.shake, 3);
        this.enemyShots.length = 0;
        this.p = Phase.ShipLost; this.phaseTime = 0;
        this._log += 'D@' + fmt(this._time, 1, F32) + ' ';
    }

    _capture(boss) {
        this.lives--; this._st.captures++; this._stage.lost++;
        this.playerAlive = false; this.captured = true; this.captorId = boss.id; this.capturedFromX = this.playerX;
        boss.beamStage = 2; boss.t = 0; boss.beamOpen = 1;
        boss.carrying = true;
        this._cues.emit(SoundCue.Die);
        this._emit('capture', { last: this.lives <= 0 });
        this.enemyShots.length = 0;
        this.p = Phase.ShipLost; this.phaseTime = 0;
        this._log += 'K@' + fmt(this._time, 1, F32) + ' ';
    }

    findAlien(id) { for (const a of this.aliens) if (a.id === id) return a; return null; }

    // ------------------------------------------------------------------ stats
    collectStats(into) {
        const s = this._st;
        add(into, 'deaths', s.deaths);
        add(into, 'captures', s.captures);
        add(into, 'rescues', s.rescues);
        add(into, 'turncoats', s.turncoats);
        add(into, 'twinLost', s.twinLost);
        add(into, 'lostToBolt', s.lostToBolt);
        add(into, 'lostToRam', s.lostToRam);
        add(into, 'lostToQueen', s.lostToQueen);
        add(into, 'stages', this.stagesCleared);
        add(into, 'reached', this.stage);
        add(into, 'kills', s.kills);
        add(into, 'dives', s.dives);
        add(into, 'beams', s.beams);
        add(into, 'strikes', s.strikes);
        add(into, 'perfects', s.perfects);
        add(into, 'chHits', s.chHits);
        add(into, 'extras', s.extras);
        add(into, 'accuracy', s.shots > 0 ? s.hits / s.shots : 0);
    }
}

SwarmPatrolRound.Phase = Phase;
SwarmPatrolRound.AlienKind = Kind;
SwarmPatrolRound.AlienMode = AMode;
SwarmPatrolRound.StartShips = StartShips; SwarmPatrolRound.Cols = Cols;
SwarmPatrolRound.FieldLeft = FieldLeft; SwarmPatrolRound.FieldRight = FieldRight; SwarmPatrolRound.FieldTop = FieldTop; SwarmPatrolRound.FieldBottom = FieldBottom;
SwarmPatrolRound.ShipY = ShipY; SwarmPatrolRound.ShipMinX = ShipMinX; SwarmPatrolRound.ShipMaxX = ShipMaxX; SwarmPatrolRound.ShipSpeed = ShipSpeed;
SwarmPatrolRound.ShipHalfW = ShipHalfW; SwarmPatrolRound.ShipHalfH = ShipHalfH; SwarmPatrolRound.TwinOffset = TwinOffset;
SwarmPatrolRound.ShotSpeed = ShotSpeed;
SwarmPatrolRound.BeamHalfMax = BeamHalfMax; SwarmPatrolRound.BeamY = BeamY;
SwarmPatrolRound.CaptiveRise = CaptiveRise;
SwarmPatrolRound.PrimeSeconds = PrimeSeconds;
SwarmPatrolRound.TallyFirst = TallyFirst; SwarmPatrolRound.TallyStep = TallyStep;
SwarmPatrolRound.FinaleBlast = FinaleBlast;
SwarmPatrolRound.Stages = STAGES;
