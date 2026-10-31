// THE NODE · world 1 · CASTLE CRUSH (Ironclad Amusements, 1981) on the Cabinet Engine · THE ROUND.
// Began as a port of CastleCrushSim.cs (one castle, one round); built out 2026-10-18 into the
// campaign a coin buys: SIX CASTLES (stages.js), the last of them the warlord's citadel and his
// siege engine. Parity with the Unity reference is retired for this game (NOTES.md).
//
// The siege game: Breakout with a catapult. A catapult cart rolls along the bottom (stick
// left/right). Button A launches the stone out of the cart; after that the stone bounces off the
// cart's throwing beam like a paddle, and WHERE it lands on the beam sets the rebound angle (centre
// = straight up, the ends = 60 degrees). Break every block of a castle and its banner falls: the
// castle is taken, the TALLY counts the bonuses, the cart MARCHES to the next. Take the sixth (the
// BLACK CITADEL: break the warlord's engine) and the game is won. Lose every stone and it is over.
//
// THE ROUND (state): the castle's CARD + the stone on the cart (Intro) -> the siege (Playing)
//   -> a stone lost (Interlude) -> NEXT STONE (Intro) ...
//   -> the castle taken: the banner falls, the TALLY, THE MARCH (Interlude) -> the next card ...
//   -> the citadel: the engine WRECKED (Interlude), the tally -> VICTORY (Card) -> Over
//   -> no stones left -> GAME OVER (Card) -> Over. The result is set when the card goes up.
//
// THE DEFENCES (one new each castle): archers step up onto the battlements, draw for archerDraw
// seconds (the telegraph) and loose straight down; the River Keep's PORTCULLIS rises and falls over
// its treasury; the Mountain Hold's BALLISTAS sight the cart (a dotted line, then a bolt along it);
// the Night Siege is dark but for its torches and the stone's glow, and its fire arrows set the
// grass alight (flames bar the cart); the Wizard's Tower has a SORCERER who blinks along the
// battlements and regrows his walls or throws a hex; the Black Citadel's ENGINE hides its furnace
// behind a sliding shield wall, lobs firepots, and rages through three phases. Anything that strikes
// the beam costs a stone, as does a stone that falls past the cart. The stone can smash an arrow,
// a bolt, a hex or a pot out of the air.
//
// THE CRUMBLE: a block stands while blocks join it to the bottom course or to rock. Cut a piece
// loose and it shudders (0.4 s) and falls, every block of it paid.
// POWER-UPS (gold-marked blocks): WIDE (the cart x1.5, 12 s), SPLIT (two more stones), SLOW (the
// stone x0.7, 10 s), FIRE (the stone smashes through any masonry for 8 s), and a spare stone (+1).
// Score: stone 10, brick 20, iron 40, gate 60, gold 100, torch/rune 30 (a hit that doesn't break:
// 5); a CHAIN (3+ breaks in one throw) pays +10 a link more; tower or keep levelled 500; archer
// 150; ballista 400; the sorcerer struck 300; a missile smashed 50; power-up 100; a hit on the
// furnace 100. The TALLY: castle 1000 x its number, 300 a stone in hand, 20 a point of accuracy
// (throws that struck something), 1000 for a castle taken without losing a stone, and the warlord's
// engine 5000. An EXTRA STONE at 12000 and every 25000 after (five at most).
//
// MERCY: the knobs ease every lost round on this cabinet (spec.js). On the fifth credit
// (credit.unlosable) a golden net is strung under the cart: the stone cannot pass it and anything
// that strikes the beam glances off, so the round cannot be lost.
//
// The sim runs on a fixed 240 Hz tick inside step() whatever the host's dt, so a seed plays the same
// round at 30, 60 or 144 Hz. Its dice are its own xorshift32; cosmetic dice (rubble, sparks) are a
// second stream so they can never change the game. With recordEvents on, it says what happens in
// detail on sim.events (the sound palette, sound.js, reads them; Starvector's pattern).
import { f32, roundEven, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { STAGES } from './stages.js';

const Phase = Object.freeze({ Idle: 0, Ready: 1, Siege: 2, Lost: 3, Fall: 4, Wreck: 5, Tally: 6, March: 7, Card: 8, Over: 9 });
const Kind = Object.freeze({ None: 0, Stone: 1, Mortar: 2, Iron: 3, Gate: 4, Wood: 5, Gold: 6, Rock: 7, Torch: 8, Rune: 9 });
const Power = Object.freeze({ None: 0, Wide: 1, Split: 2, Slow: 3, Fire: 4, Life: 5 });
const Cause = Object.freeze({ None: 0, Pit: 1, Arrow: 2, Bolt: 3, Hex: 4, Pot: 5 });
const Shot = Object.freeze({ Arrow: 1, FireArrow: 2, Bolt: 3, Hex: 4, Pot: 5 });

// per Kind: hits to break, points, the material the sound hears
const KindHp = [0, 1, 2, 3, 3, 1, 1, 0, 1, 1];
const KindPts = [0, 10, 20, 40, 60, 10, 100, 0, 30, 30];
const KindMat = ['', 'stone', 'brick', 'iron', 'iron', 'wood', 'gold', 'rock', 'stone', 'rune'];
const KindOf = { s: Kind.Stone, m: Kind.Mortar, I: Kind.Iron, g: Kind.Gate, w: Kind.Wood, $: Kind.Gold, '#': Kind.Rock, t: Kind.Torch, r: Kind.Rune };
const PowerOf = { W: Power.Wide, 3: Power.Split, S: Power.Slow, F: Power.Fire };

// ------------------------------------------------------------------ the board (screen px, y down)
const Cols = 14, Rows = 6, CellW = 21, CellH = 14;
const FieldL = 13, FieldR = 307, FieldT = 32, FieldB = 232;
const CastleX = FieldL, CastleY = 44;
const CastleB = CastleY + Rows * CellH;          // 128: the foot of the castle
const CartTop = f32(208), StoneR = f32(3), NetY = f32(222), GroundY = f32(221);
const MaxAngle = f32(60.0 * Math.PI / 180.0), MinAngle = f32(7.0 * Math.PI / 180.0);
const Tick = f32(1 / 240);

const ArrowBite = f32(5);          // px below the beam's top a missile's tip can still strike it
const PtsChip = 5, PtsTower = 500, PtsArcher = 150, PtsBallista = 400, PtsSorcerer = 300, PtsSmash = 50, PtsPower = 100;
const PtsCore = 100, PtsCastle = 1000, PtsStoneLeft = 300, PtsAccuracy = 20, PtsUnbroken = 1000, PtsEngine = 5000;
const FirstLife = 12000, LifeStep = 25000, MaxStones = 5;

const PoleLen = f32(22);

// the warlord's engine: its body box (half width, top, bottom), the furnace mouth's half width
const EngineHalf = 36, EngineTop = 36, EngineBot = 84, MouthHalf = 18;
const WallY = 100, WallH = 14, SegW = 42;

// ------------------------------------------------------------------ pieces
class Block {
    constructor(col, row, kind) {
        this.col = col; this.row = row; this.kind = kind; this.hp = KindHp[kind]; this.maxHp = this.hp;
        this.drop = Power.None; this.flash = 0; this.shake = 0; this.grown = 0;
    }
    get alive() { return this.hp > 0 || this.kind === Kind.Rock; }
    get x0() { return f32(CastleX + this.col * CellW); }
    get y0() { return f32(CastleY + this.row * CellH); }
}
class Stone { constructor(x, y, attached) { this.x = f32(x); this.y = f32(y); this.vx = 0; this.vy = 0; this.attached = !!attached; this.scored = false; this.chain = 0; } }
class Archer { constructor(col, row, x, footY, fire) { this.col = col; this.row = row; this.x = f32(x); this.footY = f32(footY); this.t = 0; this.fired = false; this.fire = fire; } }
class Missile { constructor(kind, x, y, vx, vy) { this.kind = kind; this.x = f32(x); this.y = f32(y); this.vx = f32(vx); this.vy = f32(vy); this.t = 0; } }
class Token { constructor(x, y, kind) { this.x = f32(x); this.y = f32(y); this.kind = kind; } }
class Flame { constructor(x, w, life) { this.x = f32(x); this.w = f32(w); this.t = 0; this.life = f32(life); } }
class Crumb { constructor(x, y, vx, vy, life, shade) { this.x = f32(x); this.y = f32(y); this.vx = f32(vx); this.vy = f32(vy); this.life = f32(life); this.shade = shade; } }
class Chunk { constructor(x, y, kind, vx) { this.x = f32(x); this.y = f32(y); this.vx = f32(vx); this.vy = 0; this.kind = kind; } }
class Boom { constructor(x, y, r) { this.x = f32(x); this.y = f32(y); this.r = r; this.t = 0; } }
class Popup { constructor(x, y, text, big) { this.x = f32(x); this.y = f32(y); this.t = 0; this.text = text; this.big = !!big; } }

// the dust a thing throws off: crumb shades (the renderer's Shade table: 0 stone, 1 stoneDark, 2 red,
// 3 green, 4 cream, 5 gold, 6 orange, 7 violet, 8 wood, 9 woodDark, 10 stoneLight)
const Dust = Object.freeze({ Fire: 10, Hex: 11, Cart: 12, Spark: 13 });
const DustOf = {
    [Kind.Stone]: [0, 1], [Kind.Mortar]: [2, 4], [Kind.Iron]: [1, 10], [Kind.Gate]: [1, 0], [Kind.Wood]: [8, 9], [Kind.Gold]: [5, 4],
    [Kind.Rock]: [1, 0], [Kind.Torch]: [0, 6], [Kind.Rune]: [7, 0], [Dust.Fire]: [6, 5], [Dust.Hex]: [7, 10], [Dust.Cart]: [2, 5], [Dust.Spark]: [5, 4],
};

function clampF(x, a, b) { return x < a ? a : x > b ? b : x; }

export class CastleCrushRound {
    static get Phase() { return Phase; }
    static get Kind() { return Kind; }
    static get Power() { return Power; }
    static get Cause() { return Cause; }
    static get Shot() { return Shot; }
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
    static get CastleB() { return CastleB; }
    static get CartTop() { return CartTop; }
    static get StoneR() { return StoneR; }
    static get NetY() { return NetY; }
    static get GroundY() { return GroundY; }
    static get MaxAngle() { return MaxAngle; }
    static get ArrowBite() { return ArrowBite; }
    static get PoleLen() { return PoleLen; }
    static get EngineHalf() { return EngineHalf; }
    static get EngineTop() { return EngineTop; }
    static get EngineBot() { return EngineBot; }
    static get MouthHalf() { return MouthHalf; }
    static get WallY() { return WallY; }
    static get WallH() { return WallH; }
    static get SegW() { return SegW; }
    static get Stages() { return STAGES; }

    constructor() {
        this.p = Phase.Idle;
        this.phaseTime = 0;

        // the machine's timing (not mercy knobs)
        this.cardFirstSeconds = f32(3.0); this.cardSeconds = f32(2.6); this.readyNextSeconds = f32(1.2);
        this.lostSeconds = f32(1.6); this.fallSeconds = f32(2.2); this.wreckSeconds = f32(2.6);
        this.tallySeconds = f32(3.2); this.marchSeconds = f32(2.4); this.resultSeconds = f32(4.0);
        this.autoServe = f32(5);
        this.archerDraw = f32(1.0); this.archerStay = f32(0.6);
        this.tokenFall = f32(55);
        this.wideSeconds = f32(12); this.wideMul = f32(1.5); this.slowSeconds = f32(10); this.slowMul = f32(0.7); this.fireSeconds = f32(8);
        this.stallNudge = f32(8);
        this.crumbleDelay = f32(0.4); this.longSiege = f32(50);
        this.fireArrowSpeed = f32(76); this.boltSpeed = f32(140); this.hexSpeed = f32(48); this.potFlight = f32(1.65);
        this.flameLife = f32(1.3);
        this.ballistaAim = f32(1.05); this.ballistaTrack = f32(0.7);
        this.sorcCharge = f32(2.0); this.regrowMax = 2;

        this.credit = null;
        this.isDemo = false;
        this.recordEvents = false; this.events = [];
        this.stage = 1; this.def = STAGES[0]; this.lastStage = STAGES.length;
        this.blocks = null;
        this.blocksAlive = 0;
        this.blocksTotal = 0;
        this.stones = [];
        this.archers = [];
        this.shots = [];
        this.tokens = [];
        this.flames = [];
        this.crumbs = [];
        this.chunks = [];
        this.booms = [];
        this.popups = [];
        this.ballistas = [];
        this.sorc = null;
        this.gate = null;
        this.boss = null;
        this.pending = [];                         // cells the sorcerer is regrowing (the telegraph)
        this.cartX = 0; this.cartW = 0; this.baseCartW = 0; this.cartSpeed = 0;
        this.arrowSpeed = 0; this.baseStoneSpeed = 0;
        this.armT = 0; this.cartHitFlash = 0; this.wideT = 0; this.slowT = 0; this.fireT = 0; this.netFlash = 0; this.shake = 0; this.lifeFlash = 0;
        this.serving = false; this.serveTime = 0; this.cardUp = false;
        this.stonesLeft = 0;
        this.lastCause = Cause.None;
        this.stuckX = 0;
        this.regionDown = [];
        this.tally = []; this.tallyShown = 0; this.tallyTotal = 0;
        this.fallAngle = 0; this.fallDrop = 0;
        this.bannerX = 0; this.bannerY = 0; this.bannerInRubble = false;
        this.stagesTaken = 0;

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._score = 0;
        this._time = 0;
        this._acc = 0; this._lastBlockHitT = 0; this._archerTimer = 0; this._stoneSpeedRamp = 0; this._archerEvery = 0;
        this._launchQueued = false;
        this._rs = 0; this._cs = 0;
        this._regionAlive = [];
        this._settleDirty = false;
        this._seen = new Uint8Array(Rows * Cols); this._stack = [];
        this._nextLife = FirstLife;
        this._throws = 0; this._good = 0; this._lostHere = 0; this._stageT = 0;
        this._growLeft = 0; this._bossHp = 0;
        this._pen = 0; this._nx = 0; this._ny = 0;
        this._crumbleSaid = 0;

        this._statCartHits = 0; this._statPit = 0; this._statArrow = 0; this._statArchers = 0;
        this._statPowers = 0; this._statNet = 0; this._statBroken = 0; this._statShots = 0;
        this._statCrumbled = 0; this._statBallistas = 0; this._statBanished = 0; this._statRegrown = 0; this._statSmashed = 0;
        this._statLives = 0; this._statBossHits = 0;
        this._stageTimes = '';
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get castleNumber() { return this.stage; }
    get roundWon() { return this._result === RoundResult.Won; }
    get clearedFraction() {
        if (this.boss != null) return f32(1 - this.boss.hp / this.boss.maxHp);
        return this.blocksTotal > 0 ? clampF(f32(1 - this.blocksAlive / this.blocksTotal), 0, 1) : 0;
    }
    get accuracy() { return this._throws > 0 ? Math.round(100 * this._good / this._throws) : 0; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Siege: return CabinetState.Playing;
            case Phase.Lost: case Phase.Fall: case Phase.Wreck: case Phase.Tally: case Phase.March: return CabinetState.Interlude;
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
        return r + ' castle ' + this.stage + ' taken ' + this.stagesTaken + ' score ' + this._score + ' ' + this._time.toFixed(1) + 's stones ' + this.stonesLeft +
            ' pit ' + this._statPit + ' hit ' + this._statArrow + ' archers ' + this._statArchers + ' powers ' + this._statPowers + (this._statNet > 0 ? ' net ' + this._statNet : '') +
            ' |' + this._stageTimes;
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

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
        this._ballistaEvery = k.get('ballistaEvery');
        this._regrowBudget = Math.trunc(k.get('regrowBudget'));
        this._bossHp = Math.max(4, Math.round(k.get('bossHp')));
        this._potEvery = k.get('potEvery');
        this.maxStones = Math.max(1, Math.trunc(k.get('stones')));

        this.events.length = 0;
        this.stones = []; this.archers = []; this.shots = []; this.tokens = []; this.flames = []; this.crumbs = []; this.chunks = []; this.booms = []; this.popups = [];
        this.cartX = f32((FieldL + FieldR) * 0.5); this.cartW = this.baseCartW;
        this.stonesLeft = this.maxStones;
        this._score = 0; this._time = 0; this._acc = 0; this._lastBlockHitT = 0;
        this._result = RoundResult.None;
        this.lastCause = Cause.None;
        this._nextLife = FirstLife;
        this.stagesTaken = 0;
        this._statCartHits = this._statPit = this._statArrow = this._statArchers = this._statPowers = this._statNet = this._statBroken = this._statShots = 0;
        this._statCrumbled = this._statBallistas = this._statBanished = this._statRegrown = this._statSmashed = this._statLives = this._statBossHits = 0;
        this._stageTimes = '';
        this._cues.resetTotals();
        // the demo shows a later castle (the variety); a forced start (k startStage, tests) too
        const force = Math.trunc(k.get('startStage', 0));
        const first = force >= 1 && force <= STAGES.length ? force : this.isDemo ? 2 + ((seed >>> 3) % (STAGES.length - 1)) : 1;
        this._beginStage(first);
    }

    // ------------------------------------------------------------------ a castle
    _beginStage(n) {
        this.stage = n; this.def = STAGES[n - 1];
        const d = this.def;
        this._buildCastle(d);
        this.stones = []; this.archers = []; this.shots = []; this.tokens = []; this.flames = []; this.chunks = []; this.booms = [];
        this.pending = [];
        this.wideT = 0; this.slowT = 0; this.fireT = 0; this.cartW = this.baseCartW;
        this.fallAngle = 0; this.fallDrop = 0;
        this._throws = 0; this._good = 0; this._lostHere = 0; this._stageT = 0;
        this._archerTimer = f32(this._archerEvery * d.archerEvery * 0.8);
        this._growLeft = d.sorcerer ? this._regrowBudget : 0;
        this.tally = []; this.tallyShown = 0; this.tallyTotal = 0;
        // the defences
        this.gate = null;
        if (d.portcullis) {
            let c0 = Cols, c1 = -1, r0 = Rows, r1 = -1;
            for (let r = 0; r < Rows; r++) for (let c = 0; c < Cols; c++)
                if (d.layout[r][c] === 'P') { c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
            this.gate = {
                c0, c1, r0, r1,
                x0: f32(CastleX + c0 * CellW), x1: f32(CastleX + (c1 + 1) * CellW), y0: f32(CastleY + r0 * CellH), y1: f32(CastleY + (r1 + 1) * CellH),
                f: 1, st: 0, t: 0, shutT: f32(d.portcullis.shut), openT: f32(d.portcullis.open),
            };
        }
        this.ballistas = [];
        if (d.ballistas) {
            let i = 0;
            for (const [c, r] of d.ballistas) {
                this.ballistas.push({ col: c, row: r, x: f32(CastleX + c * CellW + CellW * 0.5), y: f32(CastleY + r * CellH), hp: 3, st: 0, t: 0,
                    cool: f32(2.2 + 2.0 * i), aimX: this.cartX, flash: 0 });
                i++;
            }
        }
        this.sorc = d.sorcerer ? { st: 0, t: 0, cool: f32(2.5), col: -1, row: -1, x: 0, footY: 0, cast: 0, casts: 0, flash: 0 } : null;
        this.boss = null;
        if (d.boss) {
            this.boss = {
                x: f32(160), hp: this._bossHp, maxHp: this._bossHp, phase: 1, door: 1, doorSt: 1, doorT: 0, flash: 0, t: 0,
                arm: 0, armSt: 0, armT: 0, potT: f32(this._potEvery * 0.8), wallX: f32(160), wallT: 0, roar: 0, dead: false,
                segs: [],
            };
            this._buildWall(2);
        }
        this._updateBanner();
        this._emit('stage', { n, boss: !!d.boss });
        this._beginReady(true);
    }

    _buildCastle(d) {
        this.blocks = new Array(Rows * Cols).fill(null);
        this.blocksAlive = 0;
        this.regionDown = d.regions.map(() => false);
        this._regionAlive = d.regions.map(() => 0);
        const candidates = [];
        for (let r = 0; r < Rows; r++)
            for (let c = 0; c < Cols; c++) {
                const kind = KindOf[d.layout[r][c]];
                if (kind === undefined) continue;
                const b = new Block(c, r, kind);
                this.blocks[r * Cols + c] = b;
                if (kind === Kind.Rock) continue;
                this.blocksAlive++;
                const reg = this.regionOf(c);
                if (reg >= 0) this._regionAlive[reg]++;
                if (kind !== Kind.Gate && kind !== Kind.Gold && r >= 1) candidates.push(b);
            }
        this.blocksTotal = this.blocksAlive;
        // the gold-marked blocks: spread over the castle, the castle's power-ups dealt in turn; the
        // treasury's gold holds the spare stone where there is a treasury
        const kinds = [...d.powers].map((ch) => PowerOf[ch]);
        const k0 = Math.trunc(this._rnd() * kinds.length);
        const n = d.powerBlocks + (d.life ? 1 : 0);
        for (let i = 0; i < n && candidates.length > 0; i++) {
            let j = Math.trunc(this._rnd() * candidates.length);
            if (j >= candidates.length) j = candidates.length - 1;
            const b = candidates[j];
            candidates.splice(j, 1);
            // keep them apart: drop the neighbours from the pool
            for (let q = candidates.length - 1; q >= 0; q--) {
                const o = candidates[q];
                if (Math.abs(o.col - b.col) <= 1 && Math.abs(o.row - b.row) <= 1) candidates.splice(q, 1);
            }
            b.drop = i < d.powerBlocks ? kinds[(k0 + i) % kinds.length] : Power.Life;
        }
        if (d.life && d.portcullis) {
            // the River Keep: the spare stone lies in the treasury
            for (const b of this.blocks) if (b != null && b.drop === Power.Life) b.drop = Power.None;
            const gold = this.blocks.filter((b) => b != null && b.kind === Kind.Gold);
            if (gold.length > 0) gold[Math.min(gold.length - 1, Math.trunc(this._rnd() * gold.length))].drop = Power.Life;
        }
    }

    regionOf(col) {
        const R = this.def.regions;
        for (let i = 0; i < R.length; i++) if (col >= R[i][1] && col <= R[i][2]) return i;
        return -1;
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
        const bn = this.def.banner;
        if (bn == null) { this.bannerInRubble = false; this.bannerX = 160; this.bannerY = CastleB; return; }
        this.bannerX = f32(CastleX + (bn[0] + bn[1] + 1) * CellW * 0.5);
        const t0 = this.topRow(bn[0]), t1 = this.topRow(bn[1]);
        const r = t0 < 0 ? t1 : t1 < 0 ? t0 : Math.min(t0, t1);
        this.bannerInRubble = r < 0;
        this.bannerY = r >= 0 ? f32(CastleY + r * CellH) : f32(CastleB);
    }

    // ------------------------------------------------------------------ dice: xorshift32 (the game's own)
    _rnd() { let x = this._rs; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._rs = x; return ((x & 0xFFFFFF) >>> 0) / 16777216; }
    _crnd() { let x = this._cs; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this._cs = x; return ((x & 0xFFFFFF) >>> 0) / 16777216; }

    // ------------------------------------------------------------------ score
    _add(n) {
        this._score += n;
        while (this._score >= this._nextLife) {
            this._nextLife += LifeStep;
            if (this.stonesLeft < MaxStones) {
                this.stonesLeft++;
                this._statLives++;
                this.lifeFlash = f32(2.0);
                this.popups.push(new Popup(160, f32(CartTop - 30), 'EXTRA STONE', true));
                this._cues.emit(SoundCue.Bonus);
                this._emit('extraLife', { n: this.stonesLeft });
            }
        }
    }

    // ------------------------------------------------------------------ phases
    _go(ph) { this.p = ph; this.phaseTime = 0; }

    _beginReady(card) {
        this._go(Phase.Ready);
        this.cardUp = !!card;
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
            case Phase.Ready: {
                this._moveCart(h, sx);
                this._carryServe();
                this._tickFlames(h);
                const len = this.cardUp ? (this._time < 4 ? this.cardFirstSeconds : this.cardSeconds) : this.readyNextSeconds;
                if (this.phaseTime >= len) {
                    if (this.cardUp) this._emit('go', { n: this.stage });
                    this.cardUp = false;
                    this._go(Phase.Siege);
                    this._cues.emit(SoundCue.Start);
                }
                break;
            }
            case Phase.Siege:
                this._stageT = f32(this._stageT + h);
                this._tickSiege(h, sx);
                break;
            case Phase.Lost:
                this._tickFlames(h);
                if (this.phaseTime >= this.lostSeconds) {
                    if (this.stonesLeft <= 0) this._card(RoundResult.Lost);
                    else this._beginReady(false);
                }
                break;
            case Phase.Wreck:
                this._tickWreck(h);
                if (this.phaseTime >= this.wreckSeconds) this._beginTally();
                break;
            case Phase.Fall: {
                // the banner tips over about its foot (1.0 s), then drops to the ground
                const t = this.phaseTime;
                this.fallAngle = f32(Math.PI * 0.5 * Math.min(1.0, (t / 1.0) * (t / 1.0)));
                const td = Math.max(0, t - 1.0);
                const was = this.fallDrop, floor = f32(GroundY - 2 - this.bannerY);
                this.fallDrop = Math.min(floor, f32(0.5 * 300 * td * td));
                if (was < floor && this.fallDrop >= floor) { this._emit('bannerDown'); this.shake = Math.max(this.shake, f32(0.25)); }
                if (this.phaseTime >= this.fallSeconds) this._beginTally();
                break;
            }
            case Phase.Tally: {
                // a line every 0.45 s, added to the score as it shows
                const due = Math.min(this.tally.length, Math.floor((this.phaseTime - 0.25) / 0.45) + 1);
                while (this.tallyShown < due) {
                    const ln = this.tally[this.tallyShown++];
                    if (ln.pts > 0) this._add(ln.pts);
                    this._cues.emit(SoundCue.Tick);
                    this._emit('tally', { i: this.tallyShown, pts: ln.pts });
                }
                if (this.phaseTime >= this.tallySeconds) {
                    if (this.stage >= this.lastStage) this._card(RoundResult.Won);
                    else { this._go(Phase.March); this._emit('march', { to: this.stage + 1 }); }
                }
                break;
            }
            case Phase.March:
                if (this.phaseTime >= this.marchSeconds) this._beginStage(this.stage + 1);
                break;
            case Phase.Card:
                if (this.phaseTime >= this.resultSeconds) this._go(Phase.Over);
                break;
        }
    }

    _card(r) {
        this._result = r;
        this._go(Phase.Card);
        if (r === RoundResult.Won) { this._cues.emit(SoundCue.Win); this._emit('victory'); }
    }

    _moveCart(h, sx) {
        const half = f32(this.cartW * 0.5);
        let nx = f32(this.cartX + f32(sx * this.cartSpeed * h));
        // burning grass bars the cart: it may back out of a fire, never roll into one
        for (const fl of this.flames) {
            const l = f32(fl.x - fl.w * 0.5), r = f32(fl.x + fl.w * 0.5);
            if (l >= this.cartX) { const hi = f32(l - half); if (nx > hi) nx = Math.max(Math.min(nx, hi), Math.min(nx, this.cartX)); }
            else if (r <= this.cartX) { const lo = f32(r + half); if (nx < lo) nx = Math.min(Math.max(nx, lo), Math.max(nx, this.cartX)); }
        }
        this.cartX = nx;
        if (this.cartX < FieldL + half) this.cartX = f32(FieldL + half);
        if (this.cartX > FieldR - half) this.cartX = f32(FieldR - half);
    }

    _carryServe() {
        if (!this.serving || this.stones.length === 0) return;
        const s = this.stones[0];
        s.x = this.cartX; s.y = f32(CartTop - StoneR - 1); s.vx = 0; s.vy = 0;
    }

    currentSpeed() {
        let v = f32(this.baseStoneSpeed * this.def.speed * f32(1 + f32(this._stoneSpeedRamp * this.clearedFraction)));
        if (this.slowT > 0) v = f32(v * this.slowMul);
        return v;
    }

    _tickSiege(h, sx) {
        if (this.wideT > 0) { this.wideT = f32(this.wideT - h); if (this.wideT <= 0) { this.wideT = 0; this._emit('powerEnd', { p: 'wide' }); } }
        if (this.slowT > 0) { this.slowT = f32(this.slowT - h); if (this.slowT <= 0) { this.slowT = 0; this._emit('powerEnd', { p: 'slow' }); } }
        if (this.fireT > 0) { this.fireT = f32(this.fireT - h); if (this.fireT <= 0) { this.fireT = 0; this._emit('powerEnd', { p: 'fire' }); } }
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
            this._collide(s);
            this._collideFoes(s);
            if (s.vy > 0 && s.y + StoneR >= CartTop && s.y + StoneR <= CartTop + 7 && Math.abs(s.x - this.cartX) <= this.cartW * 0.5 + StoneR * 0.6)
                this._rebound(s, spd);
            else if (this.mercyActive && s.vy > 0 && s.y + StoneR >= NetY) {
                s.y = f32(NetY - StoneR); s.vy = -Math.abs(s.vy);
                if (this._time - this._lastBlockHitT > this.stallNudge) s.vx = f32(s.vx + f32(f32(this._rnd() - 0.5) * 0.6 * spd));
                this._endThrow(s);
                this.netFlash = f32(0.25); this._statNet++;
                this._cues.emit(SoundCue.Miss);
                this._emit('net');
            }
            if (s.y - StoneR > FieldB) {
                this._endThrow(s);
                this.stones.splice(i, 1);
                if (this.stones.length > 0) this._emit('stoneGone');
            }
            if (this._cleared()) break;
        }
        if (this._cleared()) { this._takeCastle(); return; }
        if (this.stones.length === 0) { this._loseStone(Cause.Pit); return; }

        // ---- the defences
        this._tickArchers(h);
        if (this.ballistas.length > 0) this._tickBallistas(h);
        if (this.sorc != null) this._tickSorcerer(h);
        if (this.gate != null) this._tickGate(h);
        if (this.boss != null) this._tickBoss(h);
        if (this.p !== Phase.Siege) return;

        // ---- the missiles
        if (this._tickShots(h)) return;
        this._tickFlames(h);

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

        // ---- the crumble
        for (const b of this.blocks)
            if (b != null && b.shake > 0 && b.hp > 0) { b.shake = f32(b.shake - h); if (b.shake <= 0) this._crumble(b); }
        // A LONG SIEGE: past longSiege seconds on one castle its walls start to give way on their own,
        // a block every 2 s (and the engine's furnace door jams open), so no castle stands for ever
        if (this._stageT > this.longSiege) {
            if (this.boss != null) this.boss.doorSt = 1;
            else if (Math.floor(this._stageT / 2) !== Math.floor((this._stageT - h) / 2)) {
                for (const b of this.blocks) if (b != null && b.hp > 0 && b.kind !== Kind.Rock && b.shake <= 0) { b.shake = this.crumbleDelay; this._emit('shudder', { n: 1 }); break; }
            }
        }
        if (this._settleDirty) this._settle();
        this._crumbleSaid = 0;
        if (this._cleared()) this._takeCastle();
    }

    _cleared() { return this.boss != null ? this.boss.hp <= 0 : this.blocksAlive === 0; }

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
        this._emit('launch');
    }

    _endThrow(s) {
        this._throws++;
        if (s.scored) this._good++;
        s.scored = false; s.chain = 0;
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
        this._endThrow(s);
        this.armT = f32(0.16);
        this._statCartHits++;
        this._cues.emit(SoundCue.Tick);
        this._emit('rebound', { u });
    }

    // ---- a circle against a box: the penetration and the push-out normal (into _pen, _nx, _ny)
    _hitBox(s, bx0, by0, bx1, by1) {
        const cx = s.x < bx0 ? bx0 : s.x > bx1 ? bx1 : s.x;
        const cy = s.y < by0 ? by0 : s.y > by1 ? by1 : s.y;
        const dx = f32(s.x - cx), dy = f32(s.y - cy), d2 = f32(dx * dx + dy * dy);
        if (d2 >= StoneR * StoneR) return false;
        if (d2 > 1e-6) {
            const d = f32(Math.sqrt(d2));
            this._pen = f32(StoneR - d); this._nx = f32(dx / d); this._ny = f32(dy / d);
        } else {
            // the centre is inside the box: leave by the nearest face
            const l = f32(s.x - bx0), rr = f32(bx1 - s.x), t = f32(s.y - by0), bt = f32(by1 - s.y);
            const m = Math.min(Math.min(l, rr), Math.min(t, bt));
            this._pen = f32(m + StoneR);
            if (m === t) { this._nx = 0; this._ny = -1; } else if (m === bt) { this._nx = 0; this._ny = 1; } else if (m === l) { this._nx = -1; this._ny = 0; } else { this._nx = 1; this._ny = 0; }
        }
        return true;
    }

    // ---- the stone against the masonry and the moving parts: the deepest overlap is struck, the
    //      stone reflects on that face (both axes on a true corner) and is pushed clear. A FIRE stone
    //      goes straight through anything that can break.
    _collide(s) {
        let what = 0, ref = null, bestPen = 0, bnx = 0, bny = 0;
        const c0 = Math.floor((s.x - StoneR - CastleX) / CellW), c1 = Math.floor((s.x + StoneR - CastleX) / CellW);
        const r0 = Math.floor((s.y - StoneR - CastleY) / CellH), r1 = Math.floor((s.y + StoneR - CastleY) / CellH);
        if (!(r1 < 0 || r0 >= Rows || c1 < 0 || c0 >= Cols))
            for (let r = Math.max(0, r0); r <= Math.min(Rows - 1, r1); r++)
                for (let c = Math.max(0, c0); c <= Math.min(Cols - 1, c1); c++) {
                    const b = this.blockAt(c, r);
                    if (b == null) continue;
                    const bx0 = b.x0, by0 = b.y0;
                    if (this._hitBox(s, bx0, by0, f32(bx0 + CellW), f32(by0 + CellH)) && this._pen > bestPen) { bestPen = this._pen; what = 1; ref = b; bnx = this._nx; bny = this._ny; }
                }
        const g = this.gate;
        if (g != null && g.f > 0.15 && this._hitBox(s, g.x0, g.y0, g.x1, f32(g.y0 + (g.y1 - g.y0) * g.f)) && this._pen > bestPen) { bestPen = this._pen; what = 2; ref = g; bnx = this._nx; bny = this._ny; }
        for (const bl of this.ballistas)
            if (this._hitBox(s, f32(bl.x - 8), f32(bl.y - 9), f32(bl.x + 8), bl.y) && this._pen > bestPen) { bestPen = this._pen; what = 3; ref = bl; bnx = this._nx; bny = this._ny; }
        const B = this.boss;
        if (B != null && !B.dead) {
            if (this._hitBox(s, f32(B.x - EngineHalf), EngineTop, f32(B.x + EngineHalf), EngineBot) && this._pen > bestPen) { bestPen = this._pen; what = 4; ref = B; bnx = this._nx; bny = this._ny; }
            for (const sg of B.segs) {
                if (sg.hp <= 0) continue;
                const x0 = f32(B.wallX + sg.off - SegW * 0.5);
                if (this._hitBox(s, x0, WallY, f32(x0 + SegW), WallY + WallH) && this._pen > bestPen) { bestPen = this._pen; what = 5; ref = sg; bnx = this._nx; bny = this._ny; }
            }
        }
        if (what === 0) return;
        // a fire stone smashes through what can break, and keeps its line
        if (this.fireT > 0 && ((what === 1 && ref.kind !== Kind.Rock) || what === 3 || what === 5)) {
            if (what === 1) { ref.hp = 1; this._strike(ref, s, true); }
            else if (what === 3) this._strikeBallista(ref, s, 3);
            else this._strikeSeg(ref, s, 3);
            return;
        }
        const ax = Math.abs(bnx), ay = Math.abs(bny);
        let reflX = ax > ay, reflY = ay >= ax;
        if (Math.abs(ax - ay) < 0.2) { reflX = true; reflY = true; }        // a true corner
        let into = false;
        if (reflX && s.vx * bnx < 0) { s.vx = -s.vx; into = true; }
        if (reflY && s.vy * bny < 0) { s.vy = -s.vy; into = true; }
        s.x = f32(s.x + f32(bnx * bestPen)); s.y = f32(s.y + f32(bny * bestPen));
        if (!(into || bestPen > 1)) return;
        switch (what) {
            case 1: if (ref.kind === Kind.Rock) this._clank('rock'); else this._strike(ref, s, false); break;
            case 2: this._clank('bars'); break;
            case 3: this._strikeBallista(ref, s, 1); break;
            case 4: this._strikeEngine(s, bny > 0.7); break;
            case 5: this._strikeSeg(ref, s, 1); break;
        }
    }

    _clank(mat) {
        if (this._time - (this._clankT || 0) < 0.06) return;
        this._clankT = this._time;
        this._emit('clank', { mat });
    }

    _scored(s) { s.scored = true; this._lastBlockHitT = this._time; }

    _strike(b, s, fire) {
        if (s != null) this._scored(s);
        b.hp--;
        b.flash = f32(0.12);
        if (b.hp > 0) {
            this._add(PtsChip);
            this._cues.emit(SoundCue.Tick);
            this._emit('chip', { mat: KindMat[b.kind] });
            this._shatter(f32(b.x0 + CellW * 0.5), f32(b.y0 + CellH * 0.5), 2, b.kind);
            return;
        }
        this._statBroken++;
        this._break(b, false);
        if (s != null) {
            s.chain++;
            if (s.chain >= 3) {
                const extra = Math.min(50, 10 * (s.chain - 2));
                this._add(extra);
                if ((s.chain & 1) === 1) {
                    this.popups.push(new Popup(f32(b.x0 + CellW * 0.5), f32(b.y0 + CellH), 'CHAIN ' + s.chain, false));
                    this._emit('chain', { n: s.chain });
                }
            }
        }
        this._emit('break', { mat: KindMat[b.kind], fire: !!fire });
    }

    // a block leaves the castle (broken or crumbled): the score, its token, whoever stood on it
    _break(b, crumbled) {
        b.hp = 0; b.shake = 0;
        this.blocksAlive--;
        this._settleDirty = true;
        this._updateBanner();
        this._add(KindPts[b.kind]);
        this._cues.emit(SoundCue.Hit);
        const cx = f32(b.x0 + CellW * 0.5), cy = f32(b.y0 + CellH * 0.5);
        if (crumbled) this.chunks.push(new Chunk(b.x0, b.y0, b.kind, f32(f32(this._crnd() - 0.5) * 30)));
        else this._shatter(cx, cy, 7, b.kind);
        if (b.kind === Kind.Gold) this.popups.push(new Popup(cx, cy, '100', false));
        if (b.drop !== Power.None) { this.tokens.push(new Token(cx, cy, b.drop)); this._emit('token', { p: b.drop }); }
        const reg = this.regionOf(b.col);
        if (reg >= 0) {
            this._regionAlive[reg]--;
            if (this._regionAlive[reg] <= 0 && !this.regionDown[reg]) {
                this.regionDown[reg] = true;
                this._add(PtsTower);
                this._cues.emit(SoundCue.Bonus);
                this.shake = Math.max(this.shake, f32(0.3));
                const R = this.def.regions[reg];
                this.popups.push(new Popup(f32(CastleX + (R[1] + R[2] + 1) * CellW * 0.5), f32(CastleY + 3.5 * CellH), R[0] + ' ' + PtsTower, true));
                this._emit('tower', { label: R[0] });
            }
        }
        // an archer, a ballista or the sorcerer standing on it goes down with it
        for (let i = this.archers.length - 1; i >= 0; i--)
            if (this.archers[i].col === b.col && this.archers[i].row === b.row) this._knockArcher(i);
        for (let i = this.ballistas.length - 1; i >= 0; i--)
            if (this.ballistas[i].col === b.col && this.ballistas[i].row === b.row) this._wreckBallista(i);
        const so = this.sorc;
        if (so != null && so.st >= 1 && so.st <= 2 && so.col === b.col && so.row === b.row) this._banish();
    }

    // ---- THE CRUMBLE: every block with no chain of blocks down to the bottom course or to rock
    //      starts to shudder; when it is done shuddering it falls
    _settle() {
        this._settleDirty = false;
        const seen = this._seen, stack = this._stack;
        seen.fill(0); stack.length = 0;
        for (let i = 0; i < Rows * Cols; i++) {
            const b = this.blocks[i];
            if (b == null || !b.alive || b.shake > 0) continue;
            if (b.kind === Kind.Rock || b.row === Rows - 1) { seen[i] = 1; stack.push(i); }
        }
        while (stack.length > 0) {
            const k = stack.pop();
            const c = k % Cols, r = Math.trunc(k / Cols);
            for (let d = 0; d < 4; d++) {
                const nc = c + (d === 0 ? 1 : d === 1 ? -1 : 0), nr = r + (d === 2 ? 1 : d === 3 ? -1 : 0);
                if (nc < 0 || nr < 0 || nc >= Cols || nr >= Rows) continue;
                const nk = nr * Cols + nc, nb = this.blocks[nk];
                if (seen[nk] || nb == null || !nb.alive || nb.shake > 0) continue;
                seen[nk] = 1; stack.push(nk);
            }
        }
        let n = 0;
        for (let i = 0; i < Rows * Cols; i++) {
            const b = this.blocks[i];
            if (b == null || b.hp <= 0 || b.kind === Kind.Rock || seen[i] || b.shake > 0) continue;
            b.shake = this.crumbleDelay; n++;
        }
        if (n > 0) this._emit('shudder', { n });
    }

    _crumble(b) {
        this._statCrumbled++;
        this._break(b, true);
        this.shake = Math.max(this.shake, f32(0.2));
        if (this._crumbleSaid++ === 0) this._emit('crumble');
    }

    _collideFoes(s) {
        // archers on the battlements
        for (let i = this.archers.length - 1; i >= 0; i--) {
            const a = this.archers[i];
            if (Math.abs(s.x - a.x) <= 4 + StoneR && s.y + StoneR >= a.footY - 10 && s.y - StoneR <= a.footY) { this._scored(s); this._knockArcher(i); }
        }
        // the sorcerer, while he is there to hit
        const so = this.sorc;
        if (so != null && so.st >= 1 && so.st <= 2 && Math.abs(s.x - so.x) <= 5 + StoneR && s.y + StoneR >= so.footY - 13 && s.y - StoneR <= so.footY) {
            this._scored(s);
            this._add(PtsSorcerer);
            this.popups.push(new Popup(so.x, f32(so.footY - 16), PtsSorcerer.toString(), false));
            this._banish();
        }
        // a missile in the stone's way is smashed
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const m = this.shots[i];
            const r = m.kind === Shot.Pot || m.kind === Shot.Hex ? 4 : 2;
            if (Math.abs(s.x - m.x) <= r + StoneR && Math.abs(s.y - (m.kind === Shot.Pot || m.kind === Shot.Hex ? m.y : m.y - 4)) <= r + 3 + StoneR) {
                this.shots.splice(i, 1);
                this._statSmashed++;
                this._add(PtsSmash);
                this._shatter(m.x, m.y, 4, m.kind === Shot.Hex ? Dust.Hex : m.kind === Shot.Pot || m.kind === Shot.FireArrow ? Dust.Fire : Kind.Wood);
                this.popups.push(new Popup(m.x, f32(m.y - 8), PtsSmash.toString(), false));
                this._emit('smash', { what: m.kind });
            }
        }
    }

    _knockArcher(i) {
        const a = this.archers[i];
        this.archers.splice(i, 1);
        this._add(PtsArcher);
        this._statArchers++;
        this._cues.emit(SoundCue.Bonus);
        this.popups.push(new Popup(a.x, f32(a.footY - 12), PtsArcher.toString(), false));
        for (let k = 0; k < 5; k++)
            this.crumbs.push(new Crumb(a.x, f32(a.footY - 5), f32(f32(this._crnd() - 0.5) * 60), f32(-30 - 40 * this._crnd()), 0.7, 3));
        this._emit('archerDown');
    }

    // ------------------------------------------------------------------ the archers
    _tickArchers(h) {
        const d = this.def, B = this.boss;
        const max = B != null ? (B.phase === 1 ? 0 : B.phase === 2 ? 1 : 2) : d.archerMax;
        this._archerTimer = f32(this._archerTimer - h);
        if (this._archerTimer <= 0) {
            this._archerTimer = f32(this._archerEvery * d.archerEvery * f32(0.7 + f32(0.6 * this._rnd())));
            if (this.archers.length < max) this._spawnArcher();
        }
        for (let i = this.archers.length - 1; i >= 0; i--) {
            const a = this.archers[i];
            a.t = f32(a.t + h);
            if (!a.fired && a.t >= this.archerDraw) {
                a.fired = true;
                this.shots.push(new Missile(a.fire ? Shot.FireArrow : Shot.Arrow, a.x, f32(a.footY + 2), 0, a.fire ? this.fireArrowSpeed : this.arrowSpeed));
                this._statShots++;
                this._emit('loose', { fire: a.fire });
            }
            if (a.t >= this.archerDraw + this.archerStay) this.archers.splice(i, 1);
        }
    }

    _spawnArcher() {
        // a battlement = the top block of a column, not already manned (neighbours kept apart)
        const aim = f32(this.cartX + f32(f32(this._rnd() - 0.5) * 90));
        let bestCol = -1, bestRow = -1, bestD = Number.MAX_VALUE;
        for (let c = 0; c < Cols; c++) {
            let taken = false;
            for (const o of this.archers) if (Math.abs(o.col - c) <= 1) taken = true;
            for (const o of this.ballistas) if (o.col === c) taken = true;
            if (this.sorc != null && this.sorc.st > 0 && Math.abs(this.sorc.col - c) <= 1) taken = true;
            if (taken) continue;
            const row = this.topRow(c);
            if (row < 0) continue;
            const x = f32(CastleX + c * CellW + CellW * 0.5);
            const dd = Math.abs(x - aim);
            if (dd < bestD) { bestD = dd; bestCol = c; bestRow = row; }
        }
        if (bestCol < 0) return;
        this.archers.push(new Archer(bestCol, bestRow, f32(CastleX + bestCol * CellW + CellW * 0.5), f32(CastleY + bestRow * CellH), !!this.def.fireArrows));
        this._emit('archer', { fire: !!this.def.fireArrows });
    }

    // ------------------------------------------------------------------ the ballistas (the Mountain Hold)
    _tickBallistas(h) {
        for (const bl of this.ballistas) {
            if (bl.flash > 0) bl.flash = f32(bl.flash - h);
            if (bl.st === 0) {
                bl.cool = f32(bl.cool - h);
                bl.aimX = f32(bl.aimX + f32((this.cartX - bl.aimX) * Math.min(1, 3 * h)));
                if (bl.cool <= 0) { bl.st = 1; bl.t = 0; this._emit('aim'); }
            } else {
                bl.t = f32(bl.t + h);
                if (bl.t < this.ballistaTrack) bl.aimX = f32(bl.aimX + f32((this.cartX - bl.aimX) * Math.min(1, 10 * h)));
                if (bl.t >= this.ballistaAim) {
                    const dx = f32(bl.aimX - bl.x), dy = f32(CartTop - (bl.y - 4));
                    const m = f32(Math.sqrt(f32(dx * dx + dy * dy)));
                    this.shots.push(new Missile(Shot.Bolt, bl.x, f32(bl.y - 4), f32(dx / m * this.boltSpeed), f32(dy / m * this.boltSpeed)));
                    this._statShots++;
                    bl.st = 0; bl.cool = f32(this._ballistaEvery * f32(0.8 + 0.4 * this._rnd()));
                    this._emit('bolt');
                }
            }
        }
    }

    _strikeBallista(bl, s, dmg) {
        this._scored(s);
        bl.hp -= dmg; bl.flash = f32(0.15);
        if (bl.hp > 0) { this._emit('clank', { mat: 'ballista' }); this._add(PtsChip); return; }
        const i = this.ballistas.indexOf(bl);
        if (i >= 0) this._wreckBallista(i);
    }

    _wreckBallista(i) {
        const bl = this.ballistas[i];
        this.ballistas.splice(i, 1);
        this._add(PtsBallista);
        this._statBallistas++;
        this._cues.emit(SoundCue.Bonus);
        this.shake = Math.max(this.shake, f32(0.25));
        this.popups.push(new Popup(bl.x, f32(bl.y - 14), PtsBallista.toString(), false));
        this._shatter(bl.x, f32(bl.y - 4), 9, Kind.Wood);
        this._emit('ballistaDown');
    }

    // ------------------------------------------------------------------ the portcullis (the River Keep)
    //      st 0 shut -> 1 rising -> 2 open -> 3 rattling (the warning) -> 4 dropping -> 0. It never
    //      drops on a stone, nor shuts one in the treasury: while one is there it rattles and waits.
    _tickGate(h) {
        const g = this.gate;
        g.t = f32(g.t + h);
        switch (g.st) {
            case 0: if (g.t >= g.shutT) { g.st = 1; g.t = 0; this._emit('gateUp'); } break;
            case 1: g.f = Math.max(0, f32(1 - g.t / 0.6)); if (g.f <= 0) { g.st = 2; g.t = 0; } break;
            case 2: if (g.t >= g.openT) { g.st = 3; g.t = 0; this._emit('gateWarn'); } break;
            case 3: if (g.t >= 0.6 && !this._inGate()) { g.st = 4; g.t = 0; } break;
            case 4:
                if (this._inGate()) { g.st = 1; g.t = f32(0.6 * (1 - g.f)); break; }
                g.f = Math.min(1, f32(g.t / 0.25));
                if (g.f >= 1) { g.st = 0; g.t = 0; this.shake = Math.max(this.shake, f32(0.15)); this._emit('gateShut'); }
                break;
        }
    }

    _inGate() {
        const g = this.gate;
        for (const s of this.stones)
            if (s.x + StoneR >= g.x0 - 2 && s.x - StoneR <= g.x1 + 2 && s.y - StoneR <= g.y1 + 2 && s.y + StoneR >= CastleY) return true;
        return false;
    }

    // ------------------------------------------------------------------ the sorcerer (the Wizard's Tower)
    //      st 0 away -> 1 appearing (0.35 s) -> 2 charging (sorcCharge: the staff glows; a REGROW shows
    //      its cells as outlines) -> the cast -> 3 vanishing (0.35 s) -> 0. Struck while there: banished.
    _tickSorcerer(h) {
        const so = this.sorc;
        if (so.flash > 0) so.flash = f32(so.flash - h);
        so.t = f32(so.t + h);
        switch (so.st) {
            case 0:
                so.cool = f32(so.cool - h);
                if (so.cool <= 0 && this._placeSorcerer()) { so.st = 1; so.t = 0; this._emit('sorcerer'); }
                else if (so.cool <= 0) so.cool = f32(0.5);
                break;
            case 1:
                if (so.t >= 0.35) {
                    so.st = 2; so.t = 0;
                    this.pending = [];
                    so.cast = 1;
                    if (this._growLeft > 0 && (so.casts % 3 !== 2)) this._pickRegrow();
                    if (this.pending.length > 0) so.cast = 2;
                    this._emit('charge', { cast: so.cast === 2 ? 'grow' : 'hex' });
                }
                break;
            case 2:
                if (this.topRow(so.col) !== so.row) { this._banish(); break; }
                if (so.t >= this.sorcCharge) {
                    so.casts++;
                    if (so.cast === 2) this._regrow();
                    else {
                        this.shots.push(new Missile(Shot.Hex, so.x, f32(so.footY - 8), 0, this.hexSpeed));
                        this._statShots++;
                        this._emit('hex');
                    }
                    so.st = 3; so.t = 0;
                }
                break;
            case 3:
                if (so.t >= 0.35) { so.st = 0; so.t = 0; so.cool = f32(2.4 + 1.6 * this._rnd()); }
                break;
        }
    }

    _placeSorcerer() {
        const so = this.sorc;
        const n0 = Math.trunc(this._rnd() * Cols);
        for (let k = 0; k < Cols; k++) {
            const c = (n0 + k * 5) % Cols;
            if (c === so.col) continue;
            let taken = false;
            for (const o of this.archers) if (Math.abs(o.col - c) <= 1) taken = true;
            if (taken) continue;
            const r = this.topRow(c);
            if (r < 0) continue;
            so.col = c; so.row = r; so.x = f32(CastleX + c * CellW + CellW * 0.5); so.footY = f32(CastleY + r * CellH);
            return true;
        }
        return false;
    }

    // up to regrowMax empty cells of the castle's own plan, beside standing masonry, with no stone in them
    _pickRegrow() {
        const d = this.def, cands = [];
        for (let r = 0; r < Rows; r++)
            for (let c = 0; c < Cols; c++) {
                const k = KindOf[d.layout[r][c]];
                if (k === undefined || k === Kind.Rock) continue;
                const b = this.blocks[r * Cols + c];
                if (b != null && b.hp > 0) continue;
                if (this._footed(c, r + 1)) continue;
                const ground = r === Rows - 1;
                if (!ground && this.blockAt(c - 1, r) == null && this.blockAt(c + 1, r) == null && this.blockAt(c, r + 1) == null) continue;
                cands.push(r * Cols + c);
            }
        for (let i = 0; i < this.regrowMax && cands.length > 0 && this._growLeft - this.pending.length > 0; i++) {
            let j = Math.trunc(this._rnd() * cands.length);
            if (j >= cands.length) j = cands.length - 1;
            this.pending.push(cands[j]);
            cands.splice(j, 1);
        }
    }

    // someone stands on the block at (c, r): an archer, a ballista, the sorcerer
    _footed(c, r) {
        for (const a of this.archers) if (a.col === c && a.row === r) return true;
        for (const b of this.ballistas) if (b.col === c && b.row === r) return true;
        const so = this.sorc;
        return so != null && so.st > 0 && so.col === c && so.row === r;
    }

    _regrow() {
        let n = 0;
        for (const k of this.pending) {
            const c = k % Cols, r = Math.trunc(k / Cols);
            const x0 = CastleX + c * CellW, y0 = CastleY + r * CellH;
            let blocked = false;
            for (const s of this.stones) if (s.x + StoneR + 2 > x0 && s.x - StoneR - 2 < x0 + CellW && s.y + StoneR + 2 > y0 && s.y - StoneR - 2 < y0 + CellH) blocked = true;
            if (blocked || this._growLeft <= 0) continue;
            const b = new Block(c, r, Kind.Rune);
            b.grown = f32(0.5);
            this.blocks[k] = b;
            this.blocksAlive++;
            const reg = this.regionOf(c);
            if (reg >= 0) this._regionAlive[reg]++;
            this._growLeft--;
            this._statRegrown++;
            n++;
        }
        this.pending = [];
        if (n > 0) { this._settleDirty = true; this._updateBanner(); this._emit('regrow', { n }); }
    }

    _banish() {
        const so = this.sorc;
        so.st = 3; so.t = 0; so.flash = f32(0.3);
        this.pending = [];
        this._statBanished++;
        this._cues.emit(SoundCue.Bonus);
        for (let k = 0; k < 6; k++)
            this.crumbs.push(new Crumb(so.x, f32(so.footY - 6), f32(f32(this._crnd() - 0.5) * 70), f32(-20 - 50 * this._crnd()), 0.6, 7));
        this._emit('banish');
    }

    // ------------------------------------------------------------------ the warlord's engine (the Black Citadel)
    //      phase 1: it sits behind a sliding shield wall, its furnace door opening and shutting, and
    //      lobs a firepot at the cart. phase 2 (65 %): the wall is rebuilt and slides faster, the
    //      engine rolls, an archer. phase 3 (30 %): the wall falls, the door stays open, the
    //      engine runs, two pots a throw.
    _buildWall(n) {
        const B = this.boss;
        B.segs = [];
        const gap = n === 2 ? 84 : 63;
        for (let i = 0; i < n; i++) B.segs.push({ off: f32((i - (n - 1) * 0.5) * gap), hp: 2, flash: 0 });
    }

    _tickBoss(h) {
        const B = this.boss;
        if (B.dead) return;
        B.t = f32(B.t + h);
        if (B.flash > 0) B.flash = f32(B.flash - h);
        if (B.roar > 0) B.roar = f32(B.roar - h);
        for (const sg of B.segs) if (sg.flash > 0) sg.flash = f32(sg.flash - h);
        // the engine rolls (phases 2, 3); the wall slides
        const ph = B.phase;
        if (ph >= 2) B.x = f32(160 + (ph === 2 ? 44 : 62) * Math.sin(B.t * (ph === 2 ? 0.55 : 0.9)));
        B.wallT = f32(B.wallT + h * (ph === 1 ? 0.75 : 1.15));
        B.wallX = f32(160 + 52 * Math.sin(B.wallT));
        // the furnace door: shut <-> open (always open in phase 3)
        B.doorT = f32(B.doorT + h);
        if (ph === 3) B.doorSt = 1;
        else if (B.doorSt === 1 && B.doorT >= (ph === 1 ? 3.8 : 3.2)) { B.doorSt = 0; B.doorT = 0; this._emit('doorShut'); }
        else if (B.doorSt === 0 && B.doorT >= (ph === 1 ? 1.0 : 1.2)) { B.doorSt = 1; B.doorT = 0; this._emit('doorOpen'); }
        B.door = B.doorSt === 1 ? Math.min(1, f32(B.door + h * 6)) : Math.max(0, f32(B.door - h * 6));
        // the throwing arm: cranks back (the telegraph), then throws
        if (B.armSt === 0) {
            B.potT = f32(B.potT - h);
            if (B.potT <= 0) { B.armSt = 1; B.armT = 0; this._emit('crank'); }
        } else {
            B.armT = f32(B.armT + h);
            B.arm = Math.min(1, f32(B.armT / 1.15));
            if (B.armT >= 1.15) {
                const n = ph === 3 ? 2 : 1;
                for (let i = 0; i < n; i++) {
                    const off = n === 1 ? 0 : (i === 0 ? -1 : 1) * 34;
                    this._lobPot(f32(this.cartX + off + f32(f32(this._rnd() - 0.5) * 16)));
                }
                B.armSt = 0; B.arm = 0;
                B.potT = f32(this._potEvery * (ph === 1 ? 1 : ph === 2 ? 0.85 : 0.72) * f32(0.85 + 0.3 * this._rnd()));
                this._emit('lob', { n });
            }
        }
    }

    _lobPot(tx) {
        const B = this.boss;
        tx = clampF(tx, FieldL + 8, FieldR - 8);
        const x0 = f32(B.x), y0 = f32(EngineTop + 4), T = this.potFlight, G = f32(300);
        // a parabola from the arm to the beam's line in T seconds
        const vx = f32((tx - x0) / T), vy = f32((CartTop - y0 - 0.5 * G * T * T) / T);
        const m = new Missile(Shot.Pot, x0, y0, vx, vy);
        m.g = G;
        this.shots.push(m);
        this._statShots++;
    }

    _strikeEngine(s, fromBelow) {
        const B = this.boss;
        if (fromBelow && Math.abs(s.x - B.x) <= MouthHalf + StoneR && B.door > 0.5) {
            this._scored(s);
            const dmg = this.fireT > 0 ? 2 : 1;
            B.hp = Math.max(0, B.hp - dmg);
            B.flash = f32(0.18);
            this._statBossHits++;
            this._add(PtsCore * dmg);
            this.shake = Math.max(this.shake, f32(0.18));
            this._cues.emit(SoundCue.Hit);
            this.popups.push(new Popup(s.x, f32(EngineBot + 4), (PtsCore * dmg).toString(), false));
            for (let k = 0; k < 6; k++)
                this.crumbs.push(new Crumb(s.x, f32(EngineBot - 2), f32(f32(this._crnd() - 0.5) * 80), f32(10 + 40 * this._crnd()), 0.5, k & 1 ? 6 : 5));
            this._emit('engineHit', { hp: B.hp, max: B.maxHp, fire: dmg > 1 });
            if (B.hp <= 0) return;
            const frac = B.hp / B.maxHp;
            if (B.phase === 1 && frac <= 0.65) this._bossPhase(2);
            else if (B.phase === 2 && frac <= 0.3) this._bossPhase(3);
        } else this._clank(fromBelow ? 'door' : 'engine');
    }

    _bossPhase(n) {
        const B = this.boss;
        B.phase = n; B.roar = f32(1.2);
        this.shake = Math.max(this.shake, f32(0.5));
        this.archers = [];
        if (n === 2) this._buildWall(3);
        else {
            for (const sg of B.segs) if (sg.hp > 0) { sg.hp = 0; this.chunks.push(new Chunk(f32(B.wallX + sg.off - SegW * 0.5), WallY, Kind.Iron, 0)); this.chunks.push(new Chunk(f32(B.wallX + sg.off), WallY, Kind.Iron, 0)); }
        }
        // the engine coughs up a power-up as it changes
        this.tokens.push(new Token(B.x, f32(EngineBot + 6), n === 2 ? Power.Split : Power.Fire));
        this._emit('token', { p: n === 2 ? Power.Split : Power.Fire });
        this.popups.push(new Popup(160, f32(EngineBot + 26), n === 2 ? 'THE ENGINE RAGES' : 'THE WALL FALLS', true));
        this._emit('phase', { n });
    }

    _strikeSeg(sg, s, dmg) {
        this._scored(s);
        sg.hp -= dmg; sg.flash = f32(0.12);
        const B = this.boss, x = f32(B.wallX + sg.off);
        if (sg.hp > 0) { this._add(PtsChip); this._emit('chip', { mat: 'iron' }); this._shatter(x, WallY + 7, 2, Kind.Iron); return; }
        sg.hp = 0;
        this._add(KindPts[Kind.Iron]);
        this._shatter(x, WallY + 7, 9, Kind.Iron);
        this._emit('break', { mat: 'iron', fire: dmg > 1 });
    }

    _tickWreck(h) {
        const B = this.boss;
        // booms walk over the dying engine, then it sinks into the ground
        if (this.phaseTime < this.wreckSeconds - 0.4 && Math.floor(this.phaseTime / 0.16) !== Math.floor((this.phaseTime - h) / 0.16)) {
            const x = f32(B.x + f32(f32(this._crnd() - 0.5) * EngineHalf * 2)), y = f32(EngineTop + this._crnd() * (EngineBot - EngineTop));
            this.booms.push(new Boom(x, y, 6 + Math.trunc(this._crnd() * 6)));
            this._shatter(x, y, 4, Kind.Iron);
            this.shake = Math.max(this.shake, f32(0.12));
            this._emit('boom');
        }
        B.sink = Math.min(1, Math.max(0, f32((this.phaseTime - 1.4) / 1.0)));
    }

    // ------------------------------------------------------------------ missiles and flames
    // returns true when one struck the beam (the stone is lost; the tick is over)
    _tickShots(h) {
        const half = f32(this.cartW * 0.5);
        for (let i = this.shots.length - 1; i >= 0; i--) {
            const m = this.shots[i];
            m.t = f32(m.t + h);
            if (m.kind === Shot.Hex) {
                // a hex drifts toward the cart, slowly
                const want = clampF(f32((this.cartX - m.x) * 1.2), -34, 34);
                m.vx = f32(m.vx + clampF(f32(want - m.vx), -70 * h, 70 * h));
            }
            if (m.kind === Shot.Pot) m.vy = f32(m.vy + f32(m.g * h));
            m.x = f32(m.x + f32(m.vx * h)); m.y = f32(m.y + f32(m.vy * h));
            if (m.kind === Shot.Pot) {
                if (m.y >= CartTop) {
                    this.shots.splice(i, 1);
                    this.booms.push(new Boom(m.x, f32(CartTop + 4), 9));
                    this._shatter(m.x, f32(CartTop), 6, Dust.Fire);
                    if (Math.abs(m.x - this.cartX) <= half + 5) {
                        if (this.mercyActive) { this._glance(m.x); continue; }
                        this.stuckX = f32(m.x - this.cartX);
                        this._emit('burst', { onCart: true });
                        this._loseStone(Cause.Pot);
                        return true;
                    }
                    this.flames.push(new Flame(m.x, 22, this.flameLife));
                    this._emit('burst', { onCart: false });
                }
                continue;
            }
            const tipX = m.x, tipY = m.kind === Shot.Hex ? f32(m.y + 3) : m.y;
            const r = m.kind === Shot.Hex ? 3 : m.kind === Shot.Bolt ? 2 : 1.5;
            // a missile strikes the beam from above (its tip crossing the beam's top); one that is
            // already below the beam has missed and drops into the grass behind the wheels
            if (tipY >= CartTop && tipY <= CartTop + ArrowBite && Math.abs(tipX - this.cartX) <= half + r) {
                this.shots.splice(i, 1);
                if (this.mercyActive) { this._glance(tipX); continue; }
                this.stuckX = f32(tipX - this.cartX);
                this._loseStone(m.kind === Shot.Bolt ? Cause.Bolt : m.kind === Shot.Hex ? Cause.Hex : Cause.Arrow);
                return true;
            }
            if (tipY >= GroundY + 1) {
                this.shots.splice(i, 1);
                if (m.kind === Shot.FireArrow) { this.flames.push(new Flame(tipX, 16, this.flameLife)); this._emit('ignite'); }
                else if (m.kind === Shot.Hex) { this._shatter(tipX, GroundY, 3, Dust.Hex); this._emit('fizzle'); }
                else this.chunks.push(new Chunk(tipX, GroundY, m.kind === Shot.Bolt ? -2 : -1, 0));   // stuck in the grass a moment
            }
        }
        return false;
    }

    _glance(x) {
        this.cartHitFlash = f32(0.2);
        this._shatter(x, f32(CartTop - 2), 4, Dust.Spark);
        this._cues.emit(SoundCue.Miss);
        this._emit('glance');
    }

    _tickFlames(h) {
        for (let i = this.flames.length - 1; i >= 0; i--) {
            const fl = this.flames[i];
            fl.t = f32(fl.t + h);
            if (fl.t >= fl.life) this.flames.splice(i, 1);
        }
    }

    // ------------------------------------------------------------------ power-ups
    _apply(k) {
        this._add(PtsPower);
        this._statPowers++;
        this._cues.emit(SoundCue.Bonus);
        let label = '', name = '';
        switch (k) {
            case Power.Wide: this.wideT = this.wideSeconds; label = 'WIDE'; name = 'wide'; break;
            case Power.Slow: this.slowT = this.slowSeconds; label = 'SLOW'; name = 'slow'; break;
            case Power.Fire: this.fireT = this.fireSeconds; label = 'FIRE STONE'; name = 'fire'; break;
            case Power.Life:
                name = 'life';
                if (this.stonesLeft < MaxStones) { this.stonesLeft++; this._statLives++; this.lifeFlash = f32(2.0); label = 'EXTRA STONE'; }
                else { this._add(1000); label = '1000'; }
                break;
            case Power.Split: {
                label = 'SPLIT'; name = 'split';
                let src = null;
                for (const s of this.stones) if (!s.attached) { src = s; break; }
                if (src == null) break;
                const spd = this.currentSpeed();
                // two more fan out from it, both heading up into the castle
                const a0 = Math.atan2(src.vx, Math.abs(src.vy));
                for (const side of [-1, 1]) {
                    if (this.stones.length >= 3) break;
                    const a1 = a0 + side * 0.45, a = a1 > MaxAngle ? MaxAngle : a1 < -MaxAngle ? -MaxAngle : a1;
                    const ns = new Stone(src.x, src.y, false);
                    ns.vx = f32(Math.sin(a) * spd); ns.vy = f32(-Math.cos(a) * spd);
                    this.stones.push(ns);
                }
                break;
            }
        }
        this.popups.push(new Popup(this.cartX, f32(CartTop - 18), label, false));
        this._emit('power', { p: name });
    }

    // ------------------------------------------------------------------ the end of a stone, of a castle
    _loseStone(cause) {
        this.lastCause = cause;
        for (const s of this.stones) if (!s.attached) this._endThrow(s);
        if (cause === Cause.Pit) this._statPit++; else this._statArrow++;
        this.stonesLeft--;
        this._lostHere++;
        this.cartHitFlash = f32(0.3);
        if (cause !== Cause.Pit) { this._shatter(this.cartX, f32(CartTop + 2), 8, Dust.Cart); this.shake = Math.max(this.shake, f32(0.3)); }
        this.stones = []; this.shots = []; this.archers = []; this.tokens = [];
        this.wideT = 0; this.slowT = 0; this.fireT = 0; this.cartW = this.baseCartW;
        this.serving = false; this._launchQueued = false;
        this._archerTimer = f32(this._archerEvery * this.def.archerEvery * 0.8);
        for (const bl of this.ballistas) if (bl.st === 1) { bl.st = 0; bl.cool = f32(1.5); }
        if (this.sorc != null && this.sorc.st > 0) { this.sorc.st = 0; this.sorc.cool = f32(2.0); this.pending = []; }
        if (this.boss != null) { this.boss.armSt = 0; this.boss.arm = 0; this.boss.potT = f32(Math.max(this.boss.potT, 2.0)); }
        this._cues.emit(SoundCue.Die);
        this._emit('lost', { cause: ['', 'pit', 'arrow', 'bolt', 'hex', 'pot'][cause], left: this.stonesLeft });
        this._go(Phase.Lost);
    }

    _takeCastle() {
        for (const s of this.stones) if (!s.attached) this._endThrow(s);
        this.stones = []; this.shots = []; this.archers = []; this.tokens = []; this.pending = [];
        this.serving = false;
        this.stagesTaken++;
        this._stageTimes += ' ' + this.stage + '@' + Math.round(this._stageT);
        // the tally, counted up line by line
        const acc = this.accuracy;
        this.tally = [
            { label: 'CASTLE BONUS', pts: PtsCastle * this.stage },
            { label: 'STONES  ' + this.stonesLeft + ' X ' + PtsStoneLeft, pts: PtsStoneLeft * this.stonesLeft },
            { label: 'ACCURACY ' + acc + '%', pts: PtsAccuracy * acc },
        ];
        if (this._lostHere === 0) this.tally.push({ label: 'NO STONE LOST', pts: PtsUnbroken });
        if (this.boss != null) this.tally.push({ label: 'THE ENGINE BROKEN', pts: PtsEngine });
        this.tallyTotal = 0;
        for (const ln of this.tally) this.tallyTotal += ln.pts;
        this.tallyShown = 0;
        this._cues.emit(SoundCue.Bonus);
        this.shake = Math.max(this.shake, f32(0.4));
        if (this.boss != null) {
            this.boss.dead = true; this.boss.sink = 0;
            this._go(Phase.Wreck);
            this._emit('wreck');
        } else {
            this._go(Phase.Fall);
            this._emit('taken', { n: this.stage });
        }
    }

    _beginTally() {
        this.flames = [];
        this._go(Phase.Tally);
    }

    // ------------------------------------------------------------------ cosmetics (their own dice)
    // n bits of dust from a thing of kind k (a Kind, or Dust.Fire / Hex / Cart / Spark): two shades each
    _shatter(x, y, n, k) {
        const pair = DustOf[k] || DustOf[Kind.Stone];
        for (let i = 0; i < n; i++)
            this.crumbs.push(new Crumb(
                f32(x + f32(f32(this._crnd() - 0.5) * 10)), f32(y + f32(f32(this._crnd() - 0.5) * 4)),
                f32(f32(this._crnd() - 0.5) * 70), f32(-20 - 50 * this._crnd()),
                f32(0.45 + 0.3 * this._crnd()), pair[this._crnd() < 0.5 ? 0 : 1]));
    }

    _tickCosmetics(h) {
        for (let i = this.crumbs.length - 1; i >= 0; i--) {
            const c = this.crumbs[i];
            c.life = f32(c.life - h); c.vy = f32(c.vy + f32(220 * h)); c.x = f32(c.x + f32(c.vx * h)); c.y = f32(c.y + f32(c.vy * h));
            if (c.life <= 0 || c.y > GroundY) this.crumbs.splice(i, 1);
        }
        for (let i = this.chunks.length - 1; i >= 0; i--) {
            const c = this.chunks[i];
            if (c.kind < 0) { c.vy = f32(c.vy + h); if (c.vy > 0.8) this.chunks.splice(i, 1); continue; }   // a spent arrow or bolt in the grass
            c.vy = f32(c.vy + f32(300 * h)); c.y = f32(c.y + f32(c.vy * h)); c.x = f32(c.x + f32(c.vx * h));
            if (c.y + CellH >= GroundY + 2) {
                this.chunks.splice(i, 1);
                this._shatter(f32(c.x + CellW * 0.5), f32(GroundY - 3), 5, c.kind);
            }
        }
        for (let i = this.booms.length - 1; i >= 0; i--) {
            const b = this.booms[i];
            b.t = f32(b.t + h);
            if (b.t >= 0.4) this.booms.splice(i, 1);
        }
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.t = f32(p.t + h); p.y = f32(p.y - f32((p.big ? 6 : 12) * h));
            if (p.t >= (p.big ? 1.8 : 1.1)) this.popups.splice(i, 1);
        }
        if (this.shake > 0) this.shake = Math.max(0, f32(this.shake - h));
        if (this.lifeFlash > 0) this.lifeFlash = Math.max(0, f32(this.lifeFlash - h));
        if (this.blocks != null)
            for (let i = 0; i < this.blocks.length; i++) {
                const b = this.blocks[i];
                if (b == null) continue;
                if (b.flash > 0) b.flash = f32(b.flash - h);
                if (b.grown > 0) b.grown = Math.max(0, f32(b.grown - h));
            }
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
    // standing block (or the engine, or the shut portcullis) or the top wall, turns there like a
    // mirror, then falls. Pure; the bot uses it as a player's "it'll come back about there".
    predictBounce(x, y, vx, vy, lineY) {
        if (vy >= 0) return CastleCrushRound.predictX(x, y, vx, vy, lineY);
        const sp = f32(Math.sqrt(f32(vx * vx + vy * vy)));
        if (sp < 1e-3) return { x, t: 0 };
        const h = f32(2 / sp);                              // 2 px steps
        const B = this.boss, g = this.gate;
        let t = 0;
        for (let k = 0; k < 400; k++) {
            x = f32(x + f32(vx * h)); y = f32(y + f32(vy * h)); t = f32(t + h);
            if (x - StoneR < FieldL) { x = f32(FieldL + StoneR); vx = Math.abs(vx); }
            if (x + StoneR > FieldR) { x = f32(FieldR - StoneR); vx = -Math.abs(vx); }
            if (y - StoneR < FieldT) { y = f32(FieldT + StoneR); break; }
            const c = Math.floor((x - CastleX) / CellW), r = Math.floor((y - StoneR - CastleY) / CellH);
            if (this.blockAt(c, r) != null) break;
            if (B != null && y - StoneR <= EngineBot && Math.abs(x - B.x) <= EngineHalf) break;
            if (g != null && g.f > 0.5 && x >= g.x0 && x <= g.x1 && y - StoneR <= g.y1) break;
        }
        const r2 = CastleCrushRound.predictX(x, y, vx, Math.abs(vy), lineY);
        return { x: r2.x, t: f32(t + r2.t) };
    }

    // where (x) and when (t, seconds) a hostile missile comes down on the beam's line, and how wide
    // its bite is (r px)
    static impact(m) {
        if (m.kind === Shot.Pot) {
            const a = 0.5 * m.g, b = m.vy, c = m.y - CartTop;
            const disc = b * b - 4 * a * c;
            const t = disc > 0 ? (-b + Math.sqrt(disc)) / (2 * a) : 0;
            return { x: m.x + m.vx * t, t, r: 6 };
        }
        const tipY = m.kind === Shot.Hex ? m.y + 3 : m.y;
        const t = m.vy > 1e-3 ? (CartTop - tipY) / m.vy : Number.MAX_VALUE;
        return { x: m.x + m.vx * Math.max(0, t), t, r: m.kind === Shot.Hex ? 4 : m.kind === Shot.Bolt ? 2 : 1.5 };
    }

    collectStats(into) {
        add(into, 'castlesTaken', this.stagesTaken);
        add(into, 'reached', this.stage);
        add(into, 'cartHits', this._statCartHits);
        add(into, 'pitLosses', this._statPit);
        add(into, 'missileHits', this._statArrow);
        add(into, 'missilesLoosed', this._statShots);
        add(into, 'missilesSmashed', this._statSmashed);
        add(into, 'archersDown', this._statArchers);
        add(into, 'ballistasDown', this._statBallistas);
        add(into, 'sorcererStruck', this._statBanished);
        add(into, 'regrown', this._statRegrown);
        add(into, 'crumbled', this._statCrumbled);
        add(into, 'powerUps', this._statPowers);
        add(into, 'extraStones', this._statLives);
        add(into, 'netSaves', this._statNet);
        add(into, 'blocksBroken', this._statBroken);
        add(into, 'engineHits', this._statBossHits);
    }
}

function add(o, k, v) { o[k] = (o[k] || 0) + v; }
