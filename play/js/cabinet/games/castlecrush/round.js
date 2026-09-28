// THE NODE · world 1 · CASTLE CRUSH (Ironclad Amusements, 1981) on the Cabinet Engine · THE ROUND.
// Port of CastleCrushSim.cs (ICabinetSim) from Staging/Batch1/castlecrush.
//
// The siege game: Breakout with a catapult. A catapult cart rolls along the bottom (stick
// left/right). Button A launches the stone out of the cart; after that the stone bounces off the
// cart's throwing beam like a paddle, and WHERE it lands on the beam sets the rebound angle (centre
// = straight up, the ends = 60 degrees). The castle fills the top: 14 x 4 courses of masonry --
// grey stone (1 hit), red mortared brick (2 hits), iron-banded (3 hits) and the iron portcullis
// gate (3 hits) -- two towers, a keep and a banner on the keep. Break every block and the banner
// falls: ROUND WON. There is one castle per round.
//
// Archers step up onto the battlements (the top block of a column), draw for archerDraw seconds
// (the telegraph), and loose an arrow straight down. An arrow that strikes the cart costs a stone;
// a stone that falls past the cart costs a stone. Three stones. Knock an archer off (hit it, or
// break the block it stands on) for 150. Gold-marked blocks drop a power-up when they break:
// WIDE (the cart x1.5 for 12 s), DOUBLE (a second stone), SLOW (the stone x0.7 for 10 s).
//
// Score: stone 10, brick 20, iron 40, gate 60 (a hit that doesn't break: 5); a tower or the keep
// levelled +500 each; archer 150; power-up 100; castle taken +2000 and +500 per stone left.
//
// MERCY: the knobs ease every lost round on this cabinet (stone speed x0.9 per loss, cart +4 px per
// loss). On the fifth credit (credit.unlosable) a golden net is strung under the cart: the stone
// cannot pass it and arrows glance off the cart, so the round cannot be lost.
//
// The sim runs on a fixed 240 Hz tick inside step() whatever the host's dt, so a seed plays the same
// round at 30, 60 or 144 Hz. Its dice are its own xorshift32 (ported bit for bit from the C# uint
// xorshift, not SystemRandom); cosmetic dice (rubble) are a second stream so they can never change
// the game.
import { f32, roundEven, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';

const Phase = Object.freeze({ Idle: 0, Ready: 1, Siege: 2, Lost: 3, Fall: 4, Card: 5, Over: 6 });
const Kind = Object.freeze({ None: 0, Stone: 1, Mortar: 2, Iron: 3, Gate: 4 });
const Power = Object.freeze({ None: 0, Wide: 1, Double: 2, Slow: 3 });
const Cause = Object.freeze({ None: 0, Pit: 1, Arrow: 2 });

// ------------------------------------------------------------------ the board (screen px, y down)
const Cols = 14, Rows = 4, CellW = 21, CellH = 14;
const FieldL = 13, FieldR = 307, FieldT = 32, FieldB = 232;
const CastleX = FieldL, CastleY = 60;
const CartTop = f32(208), StoneR = f32(3), NetY = f32(222), GroundY = f32(221);
const MaxAngle = f32(60.0 * Math.PI / 180.0), MinAngle = f32(7.0 * Math.PI / 180.0);
const Tick = f32(1 / 240);

// s = stone, m = mortared brick, I = iron-banded, g = the gate (iron portcullis), . = open sky
// columns 0-2 = the left tower, 5-8 = the keep, 11-13 = the right tower, the rest curtain wall
const Layout = [
    's.s..s..s..s.s',
    'sms..mIIm..sms',
    'ssss.mggm.ssss',
    'ssssssggssssss',
];
const RegionCurtain = 0, RegionLeftTower = 1, RegionKeep = 2, RegionRightTower = 3;
function regionOf(col) { return col <= 2 ? RegionLeftTower : col >= 11 ? RegionRightTower : (col >= 5 && col <= 8) ? RegionKeep : RegionCurtain; }

const ArrowBite = f32(5);          // px below the beam's top an arrow tip can still strike it
const PtsStone = 10, PtsMortar = 20, PtsIron = 40, PtsGate = 60, PtsChip = 5;
const PtsTower = 500, PtsArcher = 150, PtsPower = 100, PtsCastle = 2000, PtsStoneLeft = 500;

const PoleLen = f32(22);
const BannerX = f32(CastleX + 7 * CellW);       // 160

// ------------------------------------------------------------------ pieces
class Block {
    constructor(col, row, kind, hp) {
        this.col = col; this.row = row; this.kind = kind; this.hp = hp; this.maxHp = hp;
        this.drop = Power.None; this.flash = 0;
    }
    get alive() { return this.hp > 0; }
    get x0() { return f32(CastleX + this.col * CellW); }
    get y0() { return f32(CastleY + this.row * CellH); }
}
class Stone { constructor(x, y, attached) { this.x = f32(x); this.y = f32(y); this.vx = 0; this.vy = 0; this.attached = !!attached; } }
class Archer { constructor(col, row, x, footY) { this.col = col; this.row = row; this.x = f32(x); this.footY = f32(footY); this.t = 0; this.fired = false; } }
class Arrow { constructor(x, y) { this.x = f32(x); this.y = f32(y); } }
class Token { constructor(x, y, kind) { this.x = f32(x); this.y = f32(y); this.kind = kind; } }
class Crumb { constructor(x, y, vx, vy, life, shade) { this.x = f32(x); this.y = f32(y); this.vx = f32(vx); this.vy = f32(vy); this.life = f32(life); this.shade = shade; } }
class Popup { constructor(x, y, text) { this.x = f32(x); this.y = f32(y); this.t = 0; this.text = text; } }

export class CastleCrushRound {
    static get Phase() { return Phase; }
    static get Kind() { return Kind; }
    static get Power() { return Power; }
    static get Cause() { return Cause; }
    static get Cols() { return Cols; }
    static get Rows() { return Rows; }
    static get CellW() { return CellW; }
    static get CellH() { return CellH; }
    static get FieldL() { return FieldL; }
    static get FieldR() { return FieldR; }
    static get FieldT() { return FieldT; }
    static get FieldB() { return FieldB; }
    static get CastleX() { return CastleX; }
    static get CastleY() { return CastleY; }
    static get CartTop() { return CartTop; }
    static get StoneR() { return StoneR; }
    static get NetY() { return NetY; }
    static get GroundY() { return GroundY; }
    static get MaxAngle() { return MaxAngle; }
    static get ArrowBite() { return ArrowBite; }
    static get PoleLen() { return PoleLen; }
    static get BannerX() { return BannerX; }
    static get Layout() { return Layout; }
    static regionOf(col) { return regionOf(col); }

    constructor() {
        this.p = Phase.Idle;
        this.phaseTime = 0;

        // the machine's timing (not mercy knobs)
        this.readyFirstSeconds = f32(1.8); this.readyNextSeconds = f32(1.2); this.lostSeconds = f32(1.8);
        this.fallSeconds = f32(3.2); this.cardSeconds = f32(3.5);
        this.autoServe = f32(5);
        this.archerDraw = f32(1.0); this.archerStay = f32(0.6);
        this.tokenFall = f32(55);
        this.wideSeconds = f32(12); this.wideMul = f32(1.5); this.slowSeconds = f32(10); this.slowMul = f32(0.7);
        this.stallNudge = f32(8);
        this.maxStones = 3;

        this.credit = null;
        this.blocks = null;
        this.blocksAlive = 0;
        this.blocksTotal = 0;
        this.stones = [];
        this.archers = [];
        this.arrows = [];
        this.tokens = [];
        this.crumbs = [];
        this.popups = [];
        this.cartX = 0; this.cartW = 0; this.baseCartW = 0; this.cartSpeed = 0;
        this.arrowSpeed = 0; this.baseStoneSpeed = 0;
        this.armT = 0; this.cartHitFlash = 0; this.wideT = 0; this.slowT = 0; this.netFlash = 0;
        this.serving = false; this.serveTime = 0;
        this.stonesLeft = 0;
        this.lastCause = Cause.None;
        this.stuckArrowX = 0;
        this.regionDown = [false, false, false, false];
        this.castleBonus = 0; this.stoneBonus = 0;
        this.fallAngle = 0; this.fallDrop = 0;
        this.bannerY = 0; this.bannerInRubble = false;

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._score = 0;
        this._time = 0;
        this._acc = 0; this._lastBlockHitT = 0; this._archerTimer = 0; this._stoneSpeedRamp = 0; this._archerEvery = 0;
        this._archerMax = 0;
        this._launchQueued = false; this._firstReady = false;
        this._rs = 0; this._cs = 0;
        this._regionAlive = [0, 0, 0, 0];

        this._statCartHits = 0; this._statPit = 0; this._statArrow = 0; this._statArchers = 0;
        this._statPowers = 0; this._statNet = 0; this._statBroken = 0; this._statArrowsLoosed = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get castleNumber() { return 1; }
    get roundWon() { return this._result === RoundResult.Won; }
    get clearedFraction() { return this.blocksTotal > 0 ? f32(1 - this.blocksAlive / this.blocksTotal) : 0; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Siege: return CabinetState.Playing;
            case Phase.Lost:
            case Phase.Fall: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this.stonesLeft; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this._score + ' ' + this._time.toFixed(1) + 's cleared ' + Math.round(roundEven(this.clearedFraction * 100)) + '% stones ' + this.stonesLeft +
            ' pit ' + this._statPit + ' arrow ' + this._statArrow + ' archers ' + this._statArchers + ' powers ' + this._statPowers + (this._statNet > 0 ? ' net ' + this._statNet : '');
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._rs = Math.imul(seed, 2654435761) | 0; if (this._rs === 0) this._rs = 0x9E3779B9 | 0;
        this._cs = (this._rs ^ 0xA5A5A5A5) | 0; if (this._cs === 0) this._cs = 1;

        this.baseStoneSpeed = k.get('stoneSpeed');
        this.baseCartW = k.get('cartWidth');
        this.cartSpeed = k.get('cartSpeed');
        this._stoneSpeedRamp = k.get('speedRamp');
        this._archerEvery = k.get('archerEvery');
        this.arrowSpeed = k.get('arrowSpeed');
        this._archerMax = Math.trunc(k.get('archerMax'));
        this.maxStones = Math.max(1, Math.trunc(k.get('stones')));
        const powerBlocks = Math.trunc(k.get('powerBlocks'));

        this._buildCastle(powerBlocks);
        this.stones = []; this.archers = []; this.arrows = []; this.tokens = []; this.crumbs = []; this.popups = [];
        this.cartX = f32((FieldL + FieldR) * 0.5); this.cartW = this.baseCartW;
        this.stonesLeft = this.maxStones;
        this.regionDown = [false, false, false, false];
        this._score = 0; this._time = 0; this._acc = 0; this._lastBlockHitT = 0;
        this._result = RoundResult.None;
        this.lastCause = Cause.None;
        this.castleBonus = 0; this.stoneBonus = 0;
        this.fallAngle = 0; this.fallDrop = 0; this._updateBanner();
        this._statCartHits = this._statPit = this._statArrow = this._statArchers = this._statPowers = this._statNet = this._statBroken = this._statArrowsLoosed = 0;
        this._cues.resetTotals();
        this._firstReady = true;
        this._archerTimer = f32(this._archerEvery * 0.8);
        this._beginReady();
    }

    _buildCastle(powerBlocks) {
        this.blocks = new Array(Rows * Cols).fill(null);
        this.blocksAlive = 0;
        this._regionAlive = [0, 0, 0, 0];
        const candidates = [];
        for (let r = 0; r < Rows; r++)
            for (let c = 0; c < Cols; c++) {
                const ch = Layout[r][c];
                const kind = ch === 's' ? Kind.Stone : ch === 'm' ? Kind.Mortar : ch === 'I' ? Kind.Iron : ch === 'g' ? Kind.Gate : Kind.None;
                if (kind === Kind.None) continue;
                const hp = kind === Kind.Stone ? 1 : kind === Kind.Mortar ? 2 : 3;
                const b = new Block(c, r, kind, hp);
                this.blocks[r * Cols + c] = b;
                this.blocksAlive++;
                this._regionAlive[regionOf(c)]++;
                if (kind !== Kind.Gate && r >= 1) candidates.push(b);
            }
        this.blocksTotal = this.blocksAlive;
        // the gold-marked blocks: spread over the castle, the three power-ups dealt in turn
        const kinds = [Power.Double, Power.Wide, Power.Slow];
        const k0 = Math.trunc(this._rnd() * 3);
        for (let i = 0; i < powerBlocks && candidates.length > 0; i++) {
            let j = Math.trunc(this._rnd() * candidates.length);
            if (j >= candidates.length) j = candidates.length - 1;
            const b = candidates[j];
            candidates.splice(j, 1);
            // keep them apart: drop the neighbours from the pool
            for (let n = candidates.length - 1; n >= 0; n--) {
                const o = candidates[n];
                if (Math.abs(o.col - b.col) <= 1 && Math.abs(o.row - b.row) <= 1) candidates.splice(n, 1);
            }
            b.drop = kinds[(k0 + i) % 3];
        }
    }

    blockAt(col, row) {
        if (col < 0 || row < 0 || col >= Cols || row >= Rows) return null;
        const b = this.blocks[row * Cols + col];
        return b != null && b.alive ? b : null;
    }

    topRow(col) {
        for (let r = 0; r < Rows; r++) if (this.blockAt(col, r) != null) return r;
        return -1;
    }

    _updateBanner() {
        const top6 = this.topRow(6), top7 = this.topRow(7);
        const r = top6 < 0 ? top7 : top7 < 0 ? top6 : Math.min(top6, top7);
        this.bannerInRubble = r < 0;
        this.bannerY = r >= 0 ? f32(CastleY + r * CellH) : f32(CastleY + Rows * CellH);
    }

    // ------------------------------------------------------------------ dice: xorshift32, ported bit for
    // bit from the C# uint xorshift (not SystemRandom -- this game rolls its own dice)
    _rnd() { let x = this._rs; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._rs = x; return ((x & 0xFFFFFF) >>> 0) / 16777216; }
    _crnd() { let x = this._cs; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._cs = x; return ((x & 0xFFFFFF) >>> 0) / 16777216; }

    // ------------------------------------------------------------------ phases
    _go(ph) { this.p = ph; this.phaseTime = 0; }

    _beginReady() {
        this._go(Phase.Ready);
        this.stones = [];
        this.stones.push(new Stone(this.cartX, f32(CartTop - StoneR - 1), true));
        this.serving = true; this.serveTime = 0;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        let sx = 0;
        if (input != null) {
            sx = input.x;
            if (sx > 1) sx = 1; else if (sx < -1) sx = -1;
            if (input.pressed(Pad.A) && (this.p === Phase.Ready || (this.p === Phase.Siege && this.serving))) this._launchQueued = true;
        }
        this._acc = f32(this._acc + dt);
        while (this._acc >= Tick) {
            this._acc = f32(this._acc - Tick);
            this._tickOnce(Tick, sx);
            if (this.p === Phase.Over) { this._acc = 0; break; }
        }
    }

    _tickOnce(h, sx) {
        this.phaseTime = f32(this.phaseTime + h);
        this._tickCosmetics(h);
        switch (this.p) {
            case Phase.Ready:
                this._moveCart(h, sx);
                this._carryServe();
                if (this.phaseTime >= (this._firstReady ? this.readyFirstSeconds : this.readyNextSeconds)) {
                    this._firstReady = false;
                    this._go(Phase.Siege);
                }
                break;
            case Phase.Siege:
                this._tickSiege(h, sx);
                break;
            case Phase.Lost:
                if (this.phaseTime >= this.lostSeconds) {
                    if (this.stonesLeft <= 0) { this._result = RoundResult.Lost; this._go(Phase.Card); }
                    else this._beginReady();
                }
                break;
            case Phase.Fall: {
                // the banner tips over about its foot (1.1 s), then drops to the ground
                const t = this.phaseTime;
                this.fallAngle = f32(Math.PI * 0.5 * Math.min(1.0, (t / 1.1) * (t / 1.1)));
                const td = Math.max(0, t - 1.1);
                this.fallDrop = Math.min(f32(GroundY - 2 - this.bannerY), f32(0.5 * 260 * td * td));
                if (this.phaseTime >= this.fallSeconds) {
                    this._result = RoundResult.Won;
                    this._go(Phase.Card);
                    this._cues.emit(SoundCue.Win);
                }
                break;
            }
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this._go(Phase.Over);
                break;
        }
    }

    _moveCart(h, sx) {
        const half = f32(this.cartW * 0.5);
        this.cartX = f32(this.cartX + f32(sx * this.cartSpeed * h));
        if (this.cartX < FieldL + half) this.cartX = f32(FieldL + half);
        if (this.cartX > FieldR - half) this.cartX = f32(FieldR - half);
    }

    _carryServe() {
        if (!this.serving || this.stones.length === 0) return;
        const s = this.stones[0];
        s.x = this.cartX; s.y = f32(CartTop - StoneR - 1); s.vx = 0; s.vy = 0;
    }

    currentSpeed() {
        let v = f32(this.baseStoneSpeed * f32(1 + f32(this._stoneSpeedRamp * this.clearedFraction)));
        if (this.slowT > 0) v = f32(v * this.slowMul);
        return v;
    }

    _tickSiege(h, sx) {
        if (this.wideT > 0) { this.wideT = f32(this.wideT - h); if (this.wideT < 0) this.wideT = 0; }
        if (this.slowT > 0) { this.slowT = f32(this.slowT - h); if (this.slowT < 0) this.slowT = 0; }
        this.cartW = f32(this.baseCartW * (this.wideT > 0 ? this.wideMul : 1));
        this._moveCart(h, sx);
        if (this.armT > 0) this.armT = f32(this.armT - h);
        if (this.cartHitFlash > 0) this.cartHitFlash = f32(this.cartHitFlash - h);
        if (this.netFlash > 0) this.netFlash = f32(this.netFlash - h);

        // ---- the serve: the stone rides the cart until A (or the auto-fire)
        if (this.serving) {
            this.serveTime = f32(this.serveTime + h);
            this._carryServe();
            if (this._launchQueued || this.serveTime >= this.autoServe) this._launch(sx);
        } else this._launchQueued = false;

        // ---- the stones
        const spd = this.currentSpeed();
        for (let i = this.stones.length - 1; i >= 0; i--) {
            const s = this.stones[i];
            if (s.attached) continue;
            const m = f32(Math.sqrt(f32(s.vx * s.vx + s.vy * s.vy)));
            if (m > 1e-4) { s.vx = f32(s.vx * spd / m); s.vy = f32(s.vy * spd / m); }
            s.x = f32(s.x + f32(s.vx * h)); s.y = f32(s.y + f32(s.vy * h));
            if (s.x - StoneR < FieldL) { s.x = f32(FieldL + StoneR); s.vx = Math.abs(s.vx); }
            if (s.x + StoneR > FieldR) { s.x = f32(FieldR - StoneR); s.vx = -Math.abs(s.vx); }
            if (s.y - StoneR < FieldT) { s.y = f32(FieldT + StoneR); s.vy = Math.abs(s.vy); }
            this._collideBlocks(s);
            this._collideArchers(s);
            if (s.vy > 0 && s.y + StoneR >= CartTop && s.y + StoneR <= CartTop + 7 && Math.abs(s.x - this.cartX) <= this.cartW * 0.5 + StoneR * 0.6)
                this._rebound(s, spd);
            else if (this.mercyActive && s.vy > 0 && s.y + StoneR >= NetY) {
                s.y = f32(NetY - StoneR); s.vy = -Math.abs(s.vy);
                this.netFlash = f32(0.25); this._statNet++;
                this._cues.emit(SoundCue.Miss);
            }
            if (s.y - StoneR > FieldB) this.stones.splice(i, 1);
            if (this.blocksAlive === 0) break;
        }
        if (this.blocksAlive === 0) { this._beginFall(); return; }
        if (this.stones.length === 0) { this._loseStone(Cause.Pit); return; }

        // ---- the archers
        this._archerTimer = f32(this._archerTimer - h);
        if (this._archerTimer <= 0) {
            this._archerTimer = f32(this._archerEvery * f32(0.7 + f32(0.6 * this._rnd())));
            if (this.archers.length < this._archerMax) this._spawnArcher();
        }
        for (let i = this.archers.length - 1; i >= 0; i--) {
            const a = this.archers[i];
            a.t = f32(a.t + h);
            if (!a.fired && a.t >= this.archerDraw) {
                a.fired = true;
                this.arrows.push(new Arrow(a.x, f32(a.footY + 2)));
                this._statArrowsLoosed++;
            }
            if (a.t >= this.archerDraw + this.archerStay) this.archers.splice(i, 1);
        }

        // ---- the arrows
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const ar = this.arrows[i];
            ar.y = f32(ar.y + f32(this.arrowSpeed * h));
            // an arrow strikes the beam from above (its tip crossing the beam's top); one that is
            // already below the beam has missed and drops into the grass behind the wheels
            if (ar.y >= CartTop && ar.y <= CartTop + ArrowBite && Math.abs(ar.x - this.cartX) <= this.cartW * 0.5 + 1.5) {
                if (this.mercyActive) {
                    this.arrows.splice(i, 1);
                    this.cartHitFlash = f32(0.2);
                    this._shatter(ar.x, f32(CartTop - 2), 4);
                    this._cues.emit(SoundCue.Miss);
                    continue;
                }
                this.stuckArrowX = f32(ar.x - this.cartX);
                this._loseStone(Cause.Arrow);
                return;
            }
            if (ar.y > GroundY + 4) this.arrows.splice(i, 1);
        }

        // ---- the power-ups
        for (let i = this.tokens.length - 1; i >= 0; i--) {
            const t = this.tokens[i];
            t.y = f32(t.y + f32(this.tokenFall * h));
            if (t.y + 4 >= CartTop && t.y - 4 <= CartTop + 8 && Math.abs(t.x - this.cartX) <= this.cartW * 0.5 + 5) {
                this.tokens.splice(i, 1);
                this._apply(t.kind);
                continue;
            }
            if (t.y - 5 > FieldB) this.tokens.splice(i, 1);
        }
    }

    _launch(sx) {
        this.serving = false; this._launchQueued = false;
        const s = this.stones[0];
        s.attached = false;
        const side = sx > 0.2 ? 1 : sx < -0.2 ? -1 : (this._rnd() < 0.5 ? -1 : 1);
        const ang = f32(side * f32((12.0 + 14.0 * this._rnd()) * Math.PI / 180.0));
        const spd = this.currentSpeed();
        s.vx = f32(Math.sin(ang) * spd); s.vy = f32(-Math.cos(ang) * spd);
        this.armT = f32(0.2);
        this._lastBlockHitT = this._time;
        this._cues.emit(SoundCue.Start);
    }

    _rebound(s, spd) {
        const half = f32(this.cartW * 0.5);
        let u = f32((s.x - this.cartX) / half);
        if (u > 1) u = 1; else if (u < -1) u = -1;
        let ang = f32(u * MaxAngle);
        if (Math.abs(ang) < MinAngle) ang = (u > 0 || (u === 0 && s.vx >= 0)) ? MinAngle : -MinAngle;
        if (this._time - this._lastBlockHitT > this.stallNudge) {
            ang = f32(ang + f32(f32(this._rnd() - 0.5) * f32(24.0 * Math.PI / 180.0)));
            if (ang > MaxAngle) ang = MaxAngle; else if (ang < -MaxAngle) ang = -MaxAngle;
        }
        s.vx = f32(Math.sin(ang) * spd); s.vy = f32(-Math.cos(ang) * spd);
        s.y = f32(CartTop - StoneR);
        this.armT = f32(0.16);
        this._statCartHits++;
        this._cues.emit(SoundCue.Tick);
    }

    // ---- a circle against the masonry: the deepest overlapping block is struck, the stone reflects
    //      on that block's face (both axes on a true corner) and is pushed clear
    _collideBlocks(s) {
        const c0 = Math.floor((s.x - StoneR - CastleX) / CellW), c1 = Math.floor((s.x + StoneR - CastleX) / CellW);
        const r0 = Math.floor((s.y - StoneR - CastleY) / CellH), r1 = Math.floor((s.y + StoneR - CastleY) / CellH);
        if (r1 < 0 || r0 >= Rows || c1 < 0 || c0 >= Cols) return;
        let best = null, bestPen = 0, bnx = 0, bny = 0;
        for (let r = Math.max(0, r0); r <= Math.min(Rows - 1, r1); r++)
            for (let c = Math.max(0, c0); c <= Math.min(Cols - 1, c1); c++) {
                const b = this.blockAt(c, r);
                if (b == null) continue;
                const bx0 = b.x0, by0 = b.y0, bx1 = f32(bx0 + CellW), by1 = f32(by0 + CellH);
                const cx = s.x < bx0 ? bx0 : s.x > bx1 ? bx1 : s.x;
                const cy = s.y < by0 ? by0 : s.y > by1 ? by1 : s.y;
                const dx = f32(s.x - cx), dy = f32(s.y - cy), d2 = f32(dx * dx + dy * dy);
                if (d2 >= StoneR * StoneR) continue;
                let pen, nx, ny;
                if (d2 > 1e-6) {
                    const d = f32(Math.sqrt(d2));
                    pen = f32(StoneR - d); nx = f32(dx / d); ny = f32(dy / d);
                } else {
                    // the centre is inside the block: leave by the nearest face
                    const l = f32(s.x - bx0), rr = f32(bx1 - s.x), t = f32(s.y - by0), bt = f32(by1 - s.y);
                    const m = Math.min(Math.min(l, rr), Math.min(t, bt));
                    pen = f32(m + StoneR);
                    if (m === t) { nx = 0; ny = -1; } else if (m === bt) { nx = 0; ny = 1; } else if (m === l) { nx = -1; ny = 0; } else { nx = 1; ny = 0; }
                }
                if (pen > bestPen) { bestPen = pen; best = b; bnx = nx; bny = ny; }
            }
        if (best == null) return;
        const ax = Math.abs(bnx), ay = Math.abs(bny);
        let reflX = ax > ay, reflY = ay >= ax;
        if (Math.abs(ax - ay) < 0.2) { reflX = true; reflY = true; }        // a true corner
        let into = false;
        if (reflX && s.vx * bnx < 0) { s.vx = -s.vx; into = true; }
        if (reflY && s.vy * bny < 0) { s.vy = -s.vy; into = true; }
        s.x = f32(s.x + f32(bnx * bestPen)); s.y = f32(s.y + f32(bny * bestPen));
        if (into || bestPen > 1) this._strike(best);
    }

    _strike(b) {
        this._lastBlockHitT = this._time;
        b.hp--;
        b.flash = f32(0.12);
        if (b.hp > 0) {
            this._score += PtsChip;
            this._cues.emit(SoundCue.Tick);
            this._shatter(f32(b.x0 + CellW * 0.5), f32(b.y0 + CellH * 0.5), 2);
            return;
        }
        this._statBroken++;
        this.blocksAlive--;
        this._updateBanner();
        this._score += b.kind === Kind.Stone ? PtsStone : b.kind === Kind.Mortar ? PtsMortar : b.kind === Kind.Iron ? PtsIron : PtsGate;
        this._cues.emit(SoundCue.Hit);
        this._shatter(f32(b.x0 + CellW * 0.5), f32(b.y0 + CellH * 0.5), 7);
        if (b.drop !== Power.None) this.tokens.push(new Token(f32(b.x0 + CellW * 0.5), f32(b.y0 + CellH * 0.5), b.drop));
        const reg = regionOf(b.col);
        this._regionAlive[reg]--;
        if (reg !== RegionCurtain && this._regionAlive[reg] === 0 && !this.regionDown[reg]) {
            this.regionDown[reg] = true;
            this._score += PtsTower;
            this._cues.emit(SoundCue.Bonus);
            const rx = reg === RegionLeftTower ? f32(CastleX + 1.5 * CellW) : reg === RegionRightTower ? f32(CastleX + 12.5 * CellW) : BannerX;
            this.popups.push(new Popup(rx, f32(CastleY + 3.5 * CellH), (reg === RegionKeep ? 'KEEP ' : 'TOWER ') + PtsTower));
        }
        // an archer standing on it goes down with it
        for (let i = this.archers.length - 1; i >= 0; i--)
            if (this.archers[i].col === b.col && this.archers[i].row === b.row) this._knockArcher(i);
    }

    _collideArchers(s) {
        for (let i = this.archers.length - 1; i >= 0; i--) {
            const a = this.archers[i];
            if (Math.abs(s.x - a.x) <= 4 + StoneR && s.y + StoneR >= a.footY - 10 && s.y - StoneR <= a.footY) this._knockArcher(i);
        }
    }

    _knockArcher(i) {
        const a = this.archers[i];
        this.archers.splice(i, 1);
        this._score += PtsArcher;
        this._statArchers++;
        this._cues.emit(SoundCue.Bonus);
        this.popups.push(new Popup(a.x, f32(a.footY - 12), PtsArcher.toString()));
        for (let k = 0; k < 5; k++)
            this.crumbs.push(new Crumb(a.x, f32(a.footY - 5), f32(f32(this._crnd() - 0.5) * 60), f32(-30 - 40 * this._crnd()), 0.7, 3));
    }

    _spawnArcher() {
        // a battlement = the top block of a column, not already manned (neighbours kept apart)
        const aim = f32(this.cartX + f32(f32(this._rnd() - 0.5) * 90));
        let bestCol = -1, bestRow = -1, bestD = Number.MAX_VALUE;
        for (let c = 0; c < Cols; c++) {
            let taken = false;
            for (const o of this.archers) if (Math.abs(o.col - c) <= 1) taken = true;
            if (taken) continue;
            let row = -1;
            for (let r = 0; r < Rows; r++) if (this.blockAt(c, r) != null) { row = r; break; }
            if (row < 0) continue;
            const x = f32(CastleX + c * CellW + CellW * 0.5);
            const d = Math.abs(x - aim);
            if (d < bestD) { bestD = d; bestCol = c; bestRow = row; }
        }
        if (bestCol < 0) return;
        this.archers.push(new Archer(bestCol, bestRow, f32(CastleX + bestCol * CellW + CellW * 0.5), f32(CastleY + bestRow * CellH)));
    }

    _apply(k) {
        this._score += PtsPower;
        this._statPowers++;
        this._cues.emit(SoundCue.Bonus);
        let label = '';
        switch (k) {
            case Power.Wide: this.wideT = this.wideSeconds; label = 'WIDE'; break;
            case Power.Slow: this.slowT = this.slowSeconds; label = 'SLOW'; break;
            case Power.Double: {
                label = 'DOUBLE';
                let src = null;
                for (const s of this.stones) if (!s.attached) { src = s; break; }
                if (src == null || this.stones.length >= 3) break;
                const spd = this.currentSpeed();
                const vx = Math.abs(src.vx) < 0.2 * spd ? f32(0.5 * spd) : -src.vx;
                const vy = src.vy > 0 ? -Math.abs(src.vy) : src.vy;
                this.stones.push(new Stone(src.x, src.y, false));
                const ns = this.stones[this.stones.length - 1];
                ns.vx = vx; ns.vy = vy;
                break;
            }
        }
        this.popups.push(new Popup(this.cartX, f32(CartTop - 18), label));
    }

    _loseStone(cause) {
        this.lastCause = cause;
        if (cause === Cause.Pit) this._statPit++; else this._statArrow++;
        this.stonesLeft--;
        this.cartHitFlash = f32(0.3);
        if (cause === Cause.Arrow) this._shatter(this.cartX, f32(CartTop + 2), 8);
        this.stones = []; this.arrows = []; this.archers = []; this.tokens = [];
        this.wideT = 0; this.slowT = 0; this.cartW = this.baseCartW;
        this.serving = false; this._launchQueued = false;
        this._archerTimer = f32(this._archerEvery * 0.8);
        this._cues.emit(SoundCue.Die);
        this._go(Phase.Lost);
    }

    _beginFall() {
        this.stones = []; this.arrows = []; this.archers = []; this.tokens = [];
        this.serving = false;
        this.castleBonus = PtsCastle;
        this.stoneBonus = PtsStoneLeft * this.stonesLeft;
        this._score += this.castleBonus + this.stoneBonus;
        this._cues.emit(SoundCue.Bonus);
        this._go(Phase.Fall);
    }

    _shatter(x, y, n) {
        for (let k = 0; k < n; k++)
            this.crumbs.push(new Crumb(
                f32(x + f32(f32(this._crnd() - 0.5) * 10)), f32(y + f32(f32(this._crnd() - 0.5) * 4)),
                f32(f32(this._crnd() - 0.5) * 70), f32(-20 - 50 * this._crnd()),
                f32(0.45 + 0.3 * this._crnd()), Math.trunc(this._crnd() * 3)));
    }

    _tickCosmetics(h) {
        for (let i = this.crumbs.length - 1; i >= 0; i--) {
            const c = this.crumbs[i];
            c.life = f32(c.life - h); c.vy = f32(c.vy + f32(220 * h)); c.x = f32(c.x + f32(c.vx * h)); c.y = f32(c.y + f32(c.vy * h));
            if (c.life <= 0 || c.y > GroundY) this.crumbs.splice(i, 1);
        }
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.t = f32(p.t + h); p.y = f32(p.y - f32(12 * h));
            if (p.t >= 1.1) this.popups.splice(i, 1);
        }
        if (this.blocks != null)
            for (let i = 0; i < this.blocks.length; i++) if (this.blocks[i] != null && this.blocks[i].flash > 0) this.blocks[i].flash = f32(this.blocks[i].flash - h);
    }

    // ------------------------------------------------------------------ helpers the bot may read (pure)
    // where a free stone crosses the line y = lineY going down, walls reflected, blocks ignored; returns
    // { x, t } (t in seconds)
    static predictX(x, y, vx, vy, lineY) {
        if (vy <= 1e-3) return { x, t: Number.MAX_VALUE };
        const t = Math.max(0, f32((lineY - y) / vy));
        const lo = f32(FieldL + StoneR), hi = f32(FieldR - StoneR), span = f32(hi - lo);
        const px = f32(x + f32(vx * t)) - lo;
        let m = px % f32(2 * span);
        if (m < 0) m += f32(2 * span);
        return { x: lo + (m <= span ? m : f32(2 * span - m)), t };
    }

    // where a stone going UP will come back down to lineY: it flies (walls reflected) until the first
    // standing block or the top wall, turns there like a mirror, then falls. Pure; the bot uses it as
    // a player's "it'll come back about there". Returns { x, t } (t seconds, total).
    predictBounce(x, y, vx, vy, lineY) {
        if (vy >= 0) return CastleCrushRound.predictX(x, y, vx, vy, lineY);
        const sp = f32(Math.sqrt(f32(vx * vx + vy * vy)));
        if (sp < 1e-3) return { x, t: 0 };
        const h = f32(2 / sp);                              // 2 px steps
        let t = 0;
        for (let k = 0; k < 400; k++) {
            x = f32(x + f32(vx * h)); y = f32(y + f32(vy * h)); t = f32(t + h);
            if (x - StoneR < FieldL) { x = f32(FieldL + StoneR); vx = Math.abs(vx); }
            if (x + StoneR > FieldR) { x = f32(FieldR - StoneR); vx = -Math.abs(vx); }
            if (y - StoneR < FieldT) { y = f32(FieldT + StoneR); break; }
            const c = Math.floor((x - CastleX) / CellW), r = Math.floor((y - StoneR - CastleY) / CellH);
            if (this.blockAt(c, r) != null) break;
        }
        const r2 = CastleCrushRound.predictX(x, y, vx, Math.abs(vy), lineY);
        return { x: r2.x, t: f32(t + r2.t) };
    }

    collectStats(into) {
        add(into, 'cartHits', this._statCartHits);
        add(into, 'pitLosses', this._statPit);
        add(into, 'arrowHits', this._statArrow);
        add(into, 'arrowsLoosed', this._statArrowsLoosed);
        add(into, 'archersDown', this._statArchers);
        add(into, 'powerUps', this._statPowers);
        add(into, 'netSaves', this._statNet);
        add(into, 'blocksBroken', this._statBroken);
        add(into, 'clearedPct', this.clearedFraction * 100.0);
    }
}

function add(o, k, v) { o[k] = (o[k] || 0) + v; }
