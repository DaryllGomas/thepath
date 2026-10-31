// THE NODE · world 1 · SHORT ORDER (Northgate Novelty Co., 1982) · THE RULES (ICabinetSim).
// Built out 2026-10-18 from the Unity port (ShortOrderSim.cs): one coin is now a whole shift, five kitchens.
//
// The chef walks the floors and climbs the ladders of a kitchen (map.js); walking over all three
// segments of a part drops it one floor. A falling part that lands on another part knocks that one
// down (the upper takes its place), so a drop can cascade down a column. A part dropped off the
// bottom floor lands on the plate; a burger is done when its plate holds all its parts, and that
// hands back a pepper. Chasers (hot dogs, pickles, eggs, chilis, the rival) walk in at the floor
// ends and hunt the chef along floors and ladders. A shakes pepper: every chaser within 2 tiles is
// stunned for 3 s. Touch a walking chaser and you lose a chef. Chasers standing on a part when it
// drops RIDE it down (500 each, and the part falls one extra floor per rider); a chaser under a
// landing part is crushed (100). A kitchen is cleared when every burger is on its plate.
//
// THE SHIFT: 1 THE LUNCH COUNTER (3-part burgers, hot dogs) > 2 SIDE ORDERS (lettuce, pickles and
// eggs, fries that refill the pepper) > 3 THE BELT LINE (belts push you and them; the chili is
// quick and climbs fast) > 4 THE DISH PIT (slick floors: no brakes, five-part burgers) > 5 RUSH
// ORDER (a ticket on the clock, belts and a slick floor, and the RIVAL chef: drop parts on him,
// three knocks put him out). Clearing the fifth kitchen wins the shift.
//
// Score: 50 a part per floor it falls, 500 a rider, 100 a crush, 250 a part in a finished burger,
// 300 a fries plate, 1000 a knock on the rival and 5000 when he is out; the tally between kitchens
// adds a clear bonus, NO CHEF LOST, pepper left and (RUSH ORDER) ticket time. Extra chef at 18000
// and every 30000 after.
//
// MERCY: knobs (chaserSpeed, peppers, lives, bossHp, ticket) and, on the unlosable credit, the
// sim's own rule: a chaser that sees the chef (same floor in clear view, or within 3 tiles)
// freezes, and a touch never costs a chef. THE RESULT COMES FROM THE GAME: result stays None until
// the Card, which follows the last kitchen or the last chef.
//
// Phases -> CabinetState: Stage, Ready = Intro; Cook = Playing; Caught, Clear, Tally = Interlude;
// Card; Over. The sim says more than the eight cues through events (Starvector's pattern).
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4 } from '../../sdk/index.js';
import { ShortOrderMap as M, Part as PartKind, Chaser as FoeKind } from './map.js';

export { PartKind, FoeKind };
export const FoeMode = Object.freeze({ Waiting: 0, Walking: 1, Stunned: 2, Riding: 3, Squashed: 4, Out: 5 });
export const SoEvent = Object.freeze({
    Ready: 0, Step: 1, Drop: 2, Kick: 3, Plate: 4, Ride: 5, Crush: 6, Pepper: 7, Burger: 8, Caught: 9, Clear: 10, Won: 11, Lost: 12, Spawn: 13,
    Eat: 14, Knock: 15, Extra: 16,
});
const Phase = Object.freeze({ Idle: 0, Stage: 1, Ready: 2, Cook: 3, Caught: 4, Clear: 5, Tally: 6, Card: 7, Over: 8 });
// particle colours (the renderer maps them to the palette)
export const Fx = Object.freeze({ Bun: 0, Lettuce: 1, Cream: 2, Red: 3, Yellow: 4, White: 5, Patty: 6, Orange: 7, Purple: 8, Green: 9 });

const EPS = f32(1e-6);
const NC = M.NodeCount;

// per chaser kind: speed against the kitchen's pace, how sure its path is, how fast it climbs
const FoeDef = [
    { speed: 1.0, smart: 1.0, climb: 1.0 },       // hot dog: the standard
    { speed: 1.08, smart: 0.8, climb: 1.0 },      // pickle: quick, wanders
    { speed: 0.9, smart: 1.2, climb: 1.0 },       // egg: slow and sure
    { speed: 1.12, smart: 0.9, climb: 1.4 },      // chili: quick and a fast climber
    { speed: 1.0, smart: 1.3, climb: 1.33 },      // the rival: climbs as fast as he walks
];

// a walker on the floor/ladder graph: at node (c, f), or prog px along the edge leaving it in dir
export class Mover {
    constructor() {
        this.c = 0; this.f = 0;
        this.dir = -1;
        this.prog = 0;
        this.lastDir = -1;
        this.facing = 1;                    // +1 right, -1 left
    }

    get x() { return this.dir >= 0 ? f32(M.colX(this.c) + f32(Dir4.dx(this.dir) * this.prog)) : M.colX(this.c); }
    get y() { return this.dir >= 0 ? f32(M.floorY(this.f) + f32(Dir4.dy(this.dir) * this.prog)) : M.floorY(this.f); }
    get onLadder() { return this.dir >= 0 && M.vertical(this.dir); }
    get aheadC() { return this.dir >= 0 ? M.nextC(this.c, this.dir) : this.c; }
    get aheadF() { return this.dir >= 0 ? M.nextF(this.f, this.dir) : this.f; }
    get nodeAt() { return M.node(this.c, this.f); }
    get nodeAhead() { return M.node(this.aheadC, this.aheadF); }
    get remaining() { return this.dir >= 0 ? f32(M.edgeLen(this.dir) - this.prog) : 0; }

    // the node nearest the walker
    get nodeNear() {
        if (this.dir < 0) return this.nodeAt;
        return f32(this.prog * 2) >= M.edgeLen(this.dir) ? this.nodeAhead : this.nodeAt;
    }

    // standing on floor f (not on a ladder)
    onFloor(f) { return this.f === f && !this.onLadder; }

    place(c, f) { this.c = c; this.f = f; this.dir = -1; this.prog = 0; }

    start(d) {
        this.dir = d; this.prog = 0;
        if (d === Dir4.Right) this.facing = 1; else if (d === Dir4.Left) this.facing = -1;
    }

    reverse() {
        if (this.dir < 0) return;
        const nc = this.aheadC, nf = this.aheadF, nd = Dir4.reverse(this.dir);
        const np = f32(M.edgeLen(this.dir) - this.prog);
        this.c = nc; this.f = nf; this.dir = nd; this.prog = np;
        if (nd === Dir4.Right) this.facing = 1; else if (nd === Dir4.Left) this.facing = -1;
    }

    arrive() {
        const nc = this.aheadC, nf = this.aheadF;
        this.lastDir = this.dir;
        this.c = nc; this.f = nf; this.dir = -1; this.prog = 0;
    }
}

export class Part {
    constructor(burger, kind, slot, y, cf) {
        this.burger = burger;
        this.kind = kind;
        this.cf = cf;                       // the floors that span this burger's column
        this.slot = slot;                   // index into cf; === its length on the plate
        this.targetSlot = slot;
        this.stepped = 0;                   // bit k = segment k walked on
        this.falling = false; this.onPlate = false;
        this.y = f32(y);                    // bottom edge in px
        this.targetY = 0;
        this.extraDrops = 0;                // floors still to fall for its riders
        this.stackIndex = 0;
    }
    get resting() { return !this.falling && !this.onPlate; }
    get floor() { return this.slot < this.cf.length ? this.cf[this.slot] : -1; }
    get height() { return ShortOrderSim.partHeight(this.kind); }
}

export class Foe {
    constructor(kind) {
        this.kind = kind;
        this.mode = FoeMode.Waiting;
        this.m = new Mover();
        this.timer = 0;                     // Waiting: until it walks in; Stunned: stun left; Squashed: show left
        this.speedMul = 1; this.smart = f32(0.7); this.climbMul = 1;
        this.ridePart = -1;
        this.rideY = 0;                     // feet y while riding or squashed
        this.frozen = false;                // stunned by the mercy rule rather than pepper
        this.anim = 0;                      // px walked (walk cycle)
        this.pend = -1;                     // the spawn point it will walk in at (chosen a second early: the ! mark)
        this.hp = 0;                        // the rival's knocks left
        this.hurt = 0;                      // flash time after a knock
    }
    get harmful() { return this.mode === FoeMode.Walking; }
    get x() { return this.m.x; }
    get y() { return this.mode === FoeMode.Riding || this.mode === FoeMode.Squashed || this.mode === FoeMode.Out ? this.rideY : this.m.y; }
}

export class ShortOrderSim {
    constructor() {
        // the machine's timing and scoring (not mercy knobs)
        this.stageSeconds = f32(2.6); this.readySeconds = f32(1.2); this.readyAgainSeconds = f32(1.4); this.caughtSeconds = f32(2.2);
        this.clearSeconds = f32(1.8); this.cardSeconds = f32(4.0);
        this.tallyRowGap = f32(0.55); this.tallyHold = f32(1.1);
        this.fallSpeed = f32(120);          // px/s, a part dropping
        this.touchX = f32(11); this.touchY = f32(12);
        this.isDemo = false;
        this.testKitchen = -1;              // the Lab's single-kitchen runs: begin on this kitchen

        // read-only state (C# public getters)
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.chef = new Mover();
        this.k = M.Kitchens[0];             // the kitchen on the stove
        this.stage = 0;
        this.parts = [];
        this.foes = [];
        this.food = [];
        this.fx = [];
        this.tally = []; this.tallyShown = 0;
        this.stacked = new Int32Array(4);
        this.log = [];                      // { t, kind, x, y, n, b, pts }
        this.burgersDone = 0;
        this.peppers = 0;
        this.startLives = 0;
        this.credit = null;
        this.chefSpeed = 0;
        this.foeSpeed = 0;
        this.climbMul = 0;
        this.stunSeconds = 0;
        this.stunRadius = 0;
        this.chefAnim = 0;
        this.chefMoving = false;
        this.pepperT = f32(-99);
        this.pepperX = 0;
        this.pepperY = 0;
        this.caughtBy = -1;
        this.firstReady = false;
        this.cookTime = 0;
        this.ticket = 0; this.late = false;
        this.banner = ''; this.bannerT = 99;
        this.flashT = 99; this.flashKind = 0;
        this.rivalOut = false;

        this.recordEvents = false; this.events = [];
        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0;
        this._time = 0; this._respawn = 0; this._smart = 0; this._foodT = 0; this._fxSeed = 1;
        this._beltSpeed = 16; this._lateMul = 1.25; this._stagePeppers = 2; this._bossHp = 3; this._ticketMul = 1;
        this._nextExtra = 0; this._extraEvery = 0; this._slide = 0; this._kitchenCaught = 0; this._lastTick = 99;
        this._chefDrops = 0; this._falls = 0; this._rides = 0; this._crushes = 0;
        this._peppersUsed = 0; this._stuns = 0; this._deaths = 0; this._eaten = 0; this._knocks = 0; this._cleared = 0; this._extras = 0;
    }

    _emit(kind, o) { if (this.recordEvents) { const e = o || {}; e.kind = kind; this.events.push(e); } }

    static partHeight(k) {
        switch (k) { case PartKind.BunTop: return 9; case PartKind.Lettuce: return 7; case PartKind.Cheese: return 3; default: return 8; }
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get stageCount() { return M.Kitchens.length; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Stage: case Phase.Ready: return CabinetState.Intro;
            case Phase.Cook: return CabinetState.Playing;
            case Phase.Caught: case Phase.Clear: case Phase.Tally: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return this._lives; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's kitchen ' + (this.stage + 1) + '/' + M.Kitchens.length + ' cleared ' + this._cleared +
            ' chefs ' + this._lives + ' drops ' + this._chefDrops + ' falls ' + this._falls + ' rides ' + this._rides + ' crush ' + this._crushes +
            ' pepper ' + this._peppersUsed + ' stun ' + this._stuns + ' caught ' + this._deaths + ' fries ' + this._eaten + ' knocks ' + this._knocks;
    }

    reset(seed, credit, k) {
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this._fxSeed = (seed === 0 ? 1 : seed) | 1;
        this.credit = credit;
        this.chefSpeed = k.get('chefSpeed');
        this._foeBase = f32(this.chefSpeed * k.get('chaserSpeed'));
        this.climbMul = k.get('climb');
        this.stunSeconds = k.get('stunSeconds');
        this.stunRadius = f32(k.get('stunTiles') * M.TilePx);
        this._respawn = k.get('respawn');
        this._smart = k.get('chaserSmart');
        this._beltSpeed = k.get('beltSpeed'); this._lateMul = k.get('lateMul'); this._stagePeppers = Math.max(0, roundEven(k.get('stagePeppers')));
        this._bossHp = Math.max(1, roundEven(k.get('bossHp'))); this._ticketMul = k.get('ticket');
        this._nextExtra = Math.trunc(k.get('extraAt')); this._extraEvery = Math.max(1000, Math.trunc(k.get('extraEvery')));
        this.peppers = Math.max(0, roundEven(k.get('peppers')));
        this.startLives = this._lives = Math.max(1, roundEven(k.get('lives')));

        this._score = 0; this._time = 0; this.cookTime = 0;
        this._chefDrops = this._falls = this._rides = this._crushes = this._peppersUsed = this._stuns = this._deaths = 0;
        this._eaten = this._knocks = this._cleared = this._extras = 0;
        this._result = RoundResult.None;
        this.pepperT = f32(-99); this.caughtBy = -1; this.chefAnim = 0;
        this.banner = ''; this.bannerT = 99; this.flashT = 99;
        this.log.length = 0; this.events.length = 0; this.fx.length = 0;
        this._cues.resetTotals();
        // a demo starts partway in, to show the variety
        const first = this.testKitchen >= 0 ? this.testKitchen : this.isDemo ? 1 + ((seed >>> 0) % 3) : 0;
        this._beginKitchen(first);
        this._cues.emit(SoundCue.Tick);
    }

    _go(p) { this.p = p; this.phaseTime = 0; }

    // a kitchen goes on the stove: its burgers, its chasers, its clock
    _beginKitchen(i) {
        const kit = M.Kitchens[i];
        this.k = kit; this.stage = i;
        this._foeSpeedK = f32(this._foeBase * kit.pace);
        this.foeSpeed = this._foeSpeedK;
        this.parts.length = 0;
        this.stacked.fill(0);
        for (let b = 0; b < kit.Burgers; b++) {
            const cf = kit.ColumnFloors[b];
            const bu = kit.burgers[b];
            for (let n = 0; n < bu.n; n++) {
                const f = bu.floors[n];
                this.parts.push(new Part(b, bu.kinds[n], cf.indexOf(f), M.floorY(f), cf));
            }
        }
        this.foes.length = 0;
        for (let n = 0; n < kit.lineup.length; n++) {
            const kind = kit.lineup[n];
            const d = FoeDef[kind];
            const f = new Foe(kind);
            f.speedMul = f32(d.speed); f.climbMul = f32(d.climb);
            f.smart = Math.min(1, f32(this._smart * f32(d.smart)));
            f.hp = kind === FoeKind.Rival ? this._bossHp : 0;
            this.foes.push(f);
        }
        this.food.length = 0;
        this._foodT = f32(kit.foodGap * 0.6);
        this.burgersDone = 0; this._kitchenCaught = 0; this.rivalOut = false;
        this.ticket = kit.ticket > 0 ? f32(kit.ticket * this._ticketMul) : 0; this.late = false; this._lastTick = 99;
        this._slide = 0;
        if (i > 0) this.peppers = Math.min(9, this.peppers + this._stagePeppers);
        this._placeChef();
        this._scheduleFoes();
        this.firstReady = true;
        this.fx.length = 0;
        this._go(Phase.Stage);
        this._addLog(SoEvent.Ready, this.chef.x, this.chef.y, this._lives, -1);
        this._emit('stage', { n: i + 1, boss: kit.ticket > 0 });
    }

    _placeChef() {
        this.chef.place(M.StartC, M.StartF);
        this.chef.lastDir = -1; this.chef.facing = 1;
        this.chefMoving = false;
    }

    _scheduleFoes() {
        const kit = this.k;
        for (let i = 0; i < this.foes.length; i++) {
            const f = this.foes[i];
            f.mode = FoeMode.Waiting; f.ridePart = -1; f.frozen = false; f.pend = -1; f.hurt = 0;
            f.timer = f32(kit.firstSpawn + f32(i * kit.spawnGap));
            if (f.kind === FoeKind.Rival) f.timer = f32(f.timer + 8);          // the rival comes in last, and late
            f.m.place(0, 0);
        }
        // a rival already knocked out stays out
        if (this.rivalOut) for (const f of this.foes) if (f.kind === FoeKind.Rival) { f.mode = FoeMode.Out; }
    }

    _addLog(kind, x, y, n, b, pts) {
        this.log.push({ t: this._time, kind, x, y, n, b, pts: pts | 0 });
        if (this.log.length > 80) this.log.splice(0, 40);
    }

    addScore(n) {
        this._score += n;
        while (this._score >= this._nextExtra) {
            this._nextExtra += this._extraEvery;
            if (this._lives < 6) this._lives++;
            this._extras++;
            this.banner = 'EXTRA CHEF!'; this.bannerT = 0;
            this._addLog(SoEvent.Extra, this.chef.x, this.chef.y, this._lives, -1, 0);
            this._emit('extra');
        }
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        this.bannerT = f32(this.bannerT + dt);
        this.flashT = f32(this.flashT + dt);
        this._stepFx(dt);

        switch (this.p) {
            case Phase.Stage:
                this.chefMoving = false;
                if (this.phaseTime >= this.stageSeconds) { this._go(Phase.Ready); this._emit('ready'); }
                break;
            case Phase.Ready:
                this.chefMoving = false;
                this._updateParts(dt);
                if (this.burgersDone >= this.k.Burgers) { this._startClear(); break; }
                if (this.phaseTime >= (this.firstReady ? this.readySeconds : this.readyAgainSeconds)) { this._go(Phase.Cook); this._cues.emit(SoundCue.Start); this._emit('go'); }
                break;
            case Phase.Cook:
                this._cook(dt, input);
                break;
            case Phase.Caught:
                this.chefMoving = false;
                this._updateParts(dt);
                if (this.phaseTime >= this.caughtSeconds) {
                    if (this.burgersDone >= this.k.Burgers) this._startClear();
                    else if (this._lives <= 0) this._endRound(RoundResult.Lost);
                    else {
                        this._placeChef();
                        this._scheduleFoes();
                        this.firstReady = false;
                        this._go(Phase.Ready);
                        this._addLog(SoEvent.Ready, this.chef.x, this.chef.y, this._lives, -1);
                        this._emit('ready');
                    }
                }
                break;
            case Phase.Clear:
                this.chefMoving = false;
                if (this.phaseTime >= this.clearSeconds) this._startTally();
                break;
            case Phase.Tally:
                this._tallyTick();
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this._go(Phase.Over);
                break;
        }
    }

    _endRound(r) {
        this._result = r;
        this._go(Phase.Card);
        if (r === RoundResult.Won) { this._cues.emit(SoundCue.Win); this._emit('win'); this._addLog(SoEvent.Won, this.chef.x, this.chef.y, this._score, -1); }
        else { this._emit('lost'); this._addLog(SoEvent.Lost, this.chef.x, this.chef.y, this._score, -1); }
    }

    _startClear() {
        this._cleared++;
        this._go(Phase.Clear);
        this.flashT = 0; this.flashKind = 1;
        this._addLog(SoEvent.Clear, this.chef.x, this.chef.y, this.burgersDone, -1);
        this._cues.emit(SoundCue.Bonus);
        this._emit('clear', { n: this.stage + 1 });
        this._burst(160, 120, 24, Fx.Yellow, 90);
    }

    // the tally between kitchens: the bonuses count up one row at a time
    _startTally() {
        const n = this.stage + 1;
        const rows = [{ label: 'KITCHEN ' + n + ' CLEAR', pts: 1000 * n }];
        if (this._kitchenCaught === 0) rows.push({ label: 'NO CHEF LOST', pts: 1500 });
        if (this.peppers > 0) rows.push({ label: 'PEPPER LEFT x' + this.peppers, pts: 100 * this.peppers });
        if (this.k.ticket > 0) {
            rows.push({ label: 'TICKET TIME ' + Math.trunc(this.ticket) + 'S', pts: 40 * Math.trunc(this.ticket) });
            if (this.rivalOut) rows.push({ label: 'RIVAL SENT HOME', pts: 3000 });
        }
        this.tally = rows; this.tallyShown = 0;
        this._go(Phase.Tally);
    }

    _tallyTick() {
        while (this.tallyShown < this.tally.length && this.phaseTime >= 0.5 + this.tallyShown * this.tallyRowGap) {
            const row = this.tally[this.tallyShown++];
            if (row.pts > 0) this.addScore(row.pts);
            this._emit('tally', { n: this.tallyShown, pts: row.pts });
        }
        if (this.tallyShown >= this.tally.length && this.phaseTime >= 0.5 + this.tally.length * this.tallyRowGap + this.tallyHold) {
            if (this.stage + 1 >= M.Kitchens.length) this._endRound(RoundResult.Won);
            else this._beginKitchen(this.stage + 1);
        }
    }

    // ------------------------------------------------------------------ cooking
    _cook(dt, input) {
        this.cookTime = f32(this.cookTime + dt);
        if (input != null && input.pressed(Pad.A)) this._shake();
        this._moveChef(dt, input);
        this._ticketTick(dt);
        for (let i = 0; i < this.foes.length; i++) this._updateFoe(this.foes[i], dt);
        this._updateParts(dt);
        this._updateFood(dt);
        if (this.mercyActive) this._mercyFreeze();

        const chef = this.chef;
        for (let i = 0; i < this.foes.length; i++) {
            const f = this.foes[i];
            if (!f.harmful) continue;
            if (Math.abs(f32(f.x - chef.x)) < this.touchX && Math.abs(f32(f.y - chef.y)) < this.touchY) {
                if (this.mercyActive) { f.mode = FoeMode.Stunned; f.timer = f32(1.5); f.frozen = true; continue; }
                this._caught(i);
                return;
            }
        }
        if (this.burgersDone >= this.k.Burgers) this._startClear();
    }

    _ticketTick(dt) {
        if (this.k.ticket <= 0 || this.late) return;
        this.ticket = f32(this.ticket - dt);
        const sec = Math.ceil(this.ticket);
        if (sec !== this._lastTick) {
            this._lastTick = sec;
            if (sec === 30 || (sec <= 10 && sec > 0)) this._emit('ticketTick', { s: sec });
        }
        if (this.ticket <= 0) {
            this.ticket = 0; this.late = true;
            this.foeSpeed = f32(this._foeSpeedK * this._lateMul);
            this.banner = 'TICKET LATE!'; this.bannerT = 0;
            this._emit('late');
        }
    }

    _caught(foe) {
        this._lives--;
        this._deaths++; this._kitchenCaught++;
        this.caughtBy = foe;
        this.chefMoving = false;
        this._go(Phase.Caught);
        this.flashT = 0; this.flashKind = 0;
        this._addLog(SoEvent.Caught, this.chef.x, this.chef.y, this._lives, -1);
        this._cues.emit(SoundCue.Die);
        this._emit('caught', { lives: this._lives });
        this._burst(this.chef.x, f32(this.chef.y - 8), 18, Fx.Red, 80);
    }

    _shake() {
        if (this.peppers <= 0) { this._emit('dry'); return; }
        this.peppers--;
        this._peppersUsed++;
        const chef = this.chef;
        this.pepperT = this._time; this.pepperX = chef.x; this.pepperY = f32(chef.y - 8);
        let n = 0;
        const r2 = f32(this.stunRadius * this.stunRadius);
        for (let i = 0; i < this.foes.length; i++) {
            const f = this.foes[i];
            if (f.mode !== FoeMode.Walking && f.mode !== FoeMode.Stunned) continue;
            const dx = f32(f.x - chef.x), dy = f32(f.y - chef.y);
            if (f32(f32(dx * dx) + f32(dy * dy)) > r2) continue;
            f.mode = FoeMode.Stunned; f.timer = f.kind === FoeKind.Rival ? f32(this.stunSeconds * f32(0.5)) : this.stunSeconds; f.frozen = false;
            n++;
        }
        this._stuns += n;
        this._addLog(SoEvent.Pepper, this.pepperX, this.pepperY, n, -1);
        this._cues.emit(SoundCue.Miss);
        this._emit('pepper', { n });
    }

    // ------------------------------------------------------------------ the chef
    _beltAdj(m, d) {
        if (d < 0 || M.vertical(d)) return 0;
        const c = this.k.conv[m.f * M.Cols + m.c];
        return c === 0 ? 0 : f32(c * (d === Dir4.Right ? 1 : -1) * this._beltSpeed);
    }

    _slickEdge(m) { return m.dir >= 0 && !M.vertical(m.dir) && this.k.slick[m.f] === 1; }

    _moveChef(dt, input) {
        const m = this.chef;
        let wantH = -1, wantV = -1;
        if (input != null) {
            if (input.held(Pad.Right)) wantH = Dir4.Right; else if (input.held(Pad.Left)) wantH = Dir4.Left;
            if (input.held(Pad.Up)) wantV = Dir4.Up; else if (input.held(Pad.Down)) wantV = Dir4.Down;
        }
        const any = wantH >= 0 || wantV >= 0;
        if (any) this._slide = 2;
        this.chefMoving = false;
        if (m.dir >= 0 && !this._slickEdge(m)) {
            const rev = Dir4.reverse(m.dir);
            if (wantH === rev || wantV === rev) m.reverse();
            else if (!any) return;                       // let go of the stick: stand where you are
        }
        // on a slick edge there are no brakes and no turning round: he skates to the next node
        let t = dt;
        let arriving = false;
        for (let guard = 0; guard < 8 && t > EPS; guard++) {
            if (m.dir < 0) {
                const d = this._chefChoose(m, wantH, wantV, arriving);
                if (d < 0) break;
                m.start(d);
            }
            const base = M.vertical(m.dir) ? f32(this.chefSpeed * this.climbMul) : this.chefSpeed;
            const v = Math.max(8, f32(base + this._beltAdj(m, m.dir)));
            const rem = m.remaining;
            this.chefMoving = true;
            const vt = f32(v * t);
            if (vt < rem) { m.prog = f32(m.prog + vt); this.chefAnim = f32(this.chefAnim + vt); t = 0; }
            else {
                t = f32(t - f32(rem / v)); this.chefAnim = f32(this.chefAnim + rem);
                m.arrive();
                arriving = true;
                this._chefArrived();
            }
        }
    }

    // at a node: take the held direction if the floor or a ladder goes that way (the axis across
    // the last move first, so a diagonal turns corners); a push toward a ladder that isn't here
    // keeps the chef walking the way he was going, so pushing UP climbs the next ladder you reach.
    // On a slick floor letting go does not stop him: he glides on a node or two.
    _chefChoose(m, wantH, wantV, arriving) {
        const lastV = M.vertical(m.lastDir);
        const first = lastV ? wantH : wantV, second = lastV ? wantV : wantH;
        const K = this.k;
        if (first >= 0 && K.canMove(m.c, m.f, first)) return first;
        if (second >= 0 && K.canMove(m.c, m.f, second)) return second;
        if (arriving && m.lastDir >= 0 && (first >= 0 || second >= 0) && K.canMove(m.c, m.f, m.lastDir)) return m.lastDir;
        if (arriving && K.slick[m.f] === 1 && m.lastDir >= 0 && !M.vertical(m.lastDir) && this._slide > 0 && K.canMove(m.c, m.f, m.lastDir)) {
            this._slide--;
            return m.lastDir;
        }
        return -1;
    }

    _chefArrived() {
        const chef = this.chef;
        const K = this.k;
        const b = K.burgerAt(chef.c);
        if (b < 0) return;
        const p = this.restingPartAt(b, chef.f);
        if (p == null) return;
        const bit = 1 << (chef.c - K.burgers[b].c0);
        if ((p.stepped & bit) !== 0) return;
        p.stepped |= bit;
        this._cues.emit(SoundCue.Tick);
        this._addLog(SoEvent.Step, chef.x, chef.y, p.stepped, b);
        this._emit('step', { n: p.stepped === 7 ? 3 : (p.stepped & 1) + ((p.stepped >> 1) & 1) + ((p.stepped >> 2) & 1) });
        if (p.stepped === 7) this._dropPart(p);
    }

    restingPartAt(b, f) {
        for (let i = 0; i < this.parts.length; i++) {
            const p = this.parts[i];
            if (p.burger === b && p.resting && p.floor === f) return p;
        }
        return null;
    }

    // ------------------------------------------------------------------ the parts
    _dropPart(p) {
        const f = p.floor;
        const x0 = f32(this.k.burgers[p.burger].x0 - 2), x1 = f32(f32(x0 + M.BurgerW) + 4);
        const idx = this.parts.indexOf(p);
        let riders = 0;
        for (let i = 0; i < this.foes.length; i++) {
            const e = this.foes[i];
            if (e.mode !== FoeMode.Walking && e.mode !== FoeMode.Stunned) continue;
            if (!e.m.onFloor(f) || e.x < x0 || e.x > x1) continue;
            e.mode = FoeMode.Riding; e.ridePart = idx; e.rideY = p.y; e.frozen = false;
            riders++;
        }
        p.extraDrops += riders;
        this._chefDrops++;
        this._addLog(SoEvent.Drop, f32(x0 + 26), p.y, riders, p.burger);
        this._cues.emit(SoundCue.Hit);
        this._emit('drop', { riders });
        this._startFall(p);
    }

    _startFall(p) {
        p.falling = true;
        p.stepped = 0;
        p.targetSlot = p.slot + 1;
        const cf = p.cf;
        p.targetY = p.targetSlot < cf.length ? M.floorY(cf[p.targetSlot]) : this.stackY(p.burger);
        this.addScore(ShortOrderSim.PointsPart);
        this._falls++;
    }

    stackY(b) {
        let y = M.PlateY;
        for (let i = 0; i < this.parts.length; i++) if (this.parts[i].burger === b && this.parts[i].onPlate) y = f32(y - this.parts[i].height);
        return y;
    }

    _updateParts(dt) {
        const parts = this.parts;
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (!p.falling) continue;
            if (p.targetSlot >= p.cf.length) p.targetY = this.stackY(p.burger);
            p.y = f32(p.y + f32(this.fallSpeed * dt));
            if (p.y >= p.targetY) { p.y = p.targetY; this._land(i); }
        }
        for (let i = 0; i < this.foes.length; i++) {
            const e = this.foes[i];
            if (e.mode === FoeMode.Riding && e.ridePart >= 0) e.rideY = parts[e.ridePart].y;
        }
    }

    _land(idx) {
        const p = this.parts[idx];
        const b = p.burger;
        const cf = p.cf;
        const bu = this.k.burgers[b];
        p.slot = p.targetSlot;
        const cx = f32(bu.x0 + f32(M.BurgerW * f32(0.5)));
        if (p.slot >= cf.length) {
            p.falling = false; p.onPlate = true; p.extraDrops = 0;
            p.stackIndex = this.stacked[b]++;
            this._squashRiders(idx);
            this._addLog(SoEvent.Plate, cx, p.y, this.stacked[b], b);
            this._emit('plate', { n: this.stacked[b] });
            this._burst(cx, p.y, 5, p.kind === PartKind.Lettuce ? Fx.Lettuce : p.kind === PartKind.Patty ? Fx.Patty : Fx.Bun, 40);
            if (this.stacked[b] === bu.n) {
                const pts = ShortOrderSim.PointsPerPart * bu.n;
                this.burgersDone++;
                this.addScore(pts);
                this.peppers = Math.min(12, this.peppers + 1);
                this._addLog(SoEvent.Burger, cx, f32(p.y - 12), this.burgersDone, b, pts);
                this._cues.emit(SoundCue.Bonus);
                this._emit('burger', { n: this.burgersDone, of: this.k.Burgers });
                this._burst(cx, f32(p.y - 8), 14, Fx.Yellow, 70);
            }
            return;
        }
        const f = cf[p.slot];
        this._crush(idx, f);
        const below = this.restingPartAt(b, f);
        if (below != null) {
            // it knocks the part it lands on down a floor and takes its place
            p.falling = false;
            below.extraDrops += p.extraDrops; p.extraDrops = 0;
            p.stepped = 0;
            this._squashRiders(idx);
            this._addLog(SoEvent.Kick, cx, p.y, 0, b);
            this._emit('kick');
            this._burst(cx, p.y, 4, Fx.Bun, 50);
            this._startFall(below);
        }
        else if (p.extraDrops > 0) {
            p.extraDrops--;
            this._startFall(p);                 // riders keep riding
        }
        else {
            p.falling = false; p.stepped = 0;
            this._squashRiders(idx);
            this._emit('land');
            this._burst(cx, p.y, 4, Fx.Cream, 40);
        }
    }

    // a part comes down on a chaser: it is flattened, or (the rival) takes a knock and is thrown out
    _flatten(e, y) {
        e.ridePart = -1; e.frozen = false; e.rideY = y;
        if (e.kind !== FoeKind.Rival) { e.mode = FoeMode.Squashed; e.timer = f32(0.9); return; }
        e.hp--; this._knocks++; e.hurt = f32(1.0);
        this.addScore(ShortOrderSim.PointsKnock);
        if (e.hp <= 0) {
            e.mode = FoeMode.Out; this.rivalOut = true;
            this.addScore(ShortOrderSim.PointsRivalOut);
            this.banner = 'RIVAL IS OUT!'; this.bannerT = 0;
            this._addLog(SoEvent.Knock, e.x, f32(y - 14), 0, -1, ShortOrderSim.PointsRivalOut);
            this._emit('bossOut');
            this._burst(e.x, f32(y - 8), 26, Fx.Purple, 100);
        } else {
            e.mode = FoeMode.Squashed; e.timer = f32(0.9);
            this._addLog(SoEvent.Knock, e.x, f32(y - 14), e.hp, -1, ShortOrderSim.PointsKnock);
            this._emit('bossHit', { hp: e.hp });
            this._burst(e.x, f32(y - 8), 16, Fx.Purple, 80);
        }
    }

    _squashRiders(idx) {
        const p = this.parts[idx];
        let n = 0;
        for (let i = 0; i < this.foes.length; i++) {
            const e = this.foes[i];
            if (e.mode !== FoeMode.Riding || e.ridePart !== idx) continue;
            this._flatten(e, f32(p.y - p.height));
            this._burst(e.x, f32(p.y - 6), 8, this._foeFx(e.kind), 60);
            n++;
        }
        if (n === 0) return;
        this.addScore(ShortOrderSim.PointsRide * n);
        this._rides += n;
        const cx = f32(this.k.burgers[p.burger].x0 + f32(M.BurgerW * f32(0.5)));
        this._addLog(SoEvent.Ride, cx, f32(p.y - p.height), n, p.burger, ShortOrderSim.PointsRide * n);
        this._cues.emit(SoundCue.Bonus);
        this._emit('ride', { n });
    }

    _crush(idx, f) {
        const p = this.parts[idx];
        const x0 = f32(this.k.burgers[p.burger].x0 - 2), x1 = f32(f32(x0 + M.BurgerW) + 4);
        for (let i = 0; i < this.foes.length; i++) {
            const e = this.foes[i];
            if (e.mode !== FoeMode.Walking && e.mode !== FoeMode.Stunned) continue;
            if (!e.m.onFloor(f) || e.x < x0 || e.x > x1) continue;
            this._flatten(e, M.floorY(f));
            this.addScore(ShortOrderSim.PointsCrush);
            this._crushes++;
            this._addLog(SoEvent.Crush, e.x, f32(e.rideY - 10), 1, p.burger, ShortOrderSim.PointsCrush);
            this._cues.emit(SoundCue.Bonus);
            this._emit('crush');
            this._burst(e.x, f32(e.rideY - 6), 8, this._foeFx(e.kind), 60);
        }
    }

    _foeFx(kind) {
        return kind === FoeKind.HotDog ? Fx.Red : kind === FoeKind.Pickle ? Fx.Green : kind === FoeKind.Egg ? Fx.White : kind === FoeKind.Chili ? Fx.Orange : Fx.Purple;
    }

    // ------------------------------------------------------------------ the fries
    _updateFood(dt) {
        const K = this.k;
        if (K.food.length === 0) return;
        this._foodT = f32(this._foodT - dt);
        if (this._foodT <= 0) {
            this._foodT = K.foodGap;
            if (this.food.length < 1) {
                const chefNode = this.chef.nodeNear;
                const spot = K.food[this._rng.next(K.food.length)];
                if (K.Dist[M.node(spot[0], spot[1]) * NC + chefNode] > 48) {
                    this.food.push({ c: spot[0], f: spot[1], t: f32(9) });
                    this._emit('food');
                }
            }
        }
        const chef = this.chef;
        for (let i = this.food.length - 1; i >= 0; i--) {
            const it = this.food[i];
            it.t = f32(it.t - dt);
            const x = M.colX(it.c), y = M.floorY(it.f);
            if (Math.abs(f32(chef.x - x)) < 9 && Math.abs(f32(chef.y - y)) < 8) {
                this.food.splice(i, 1);
                this.peppers = Math.min(12, this.peppers + 2);
                this._eaten++;
                this.addScore(ShortOrderSim.PointsFries);
                this._addLog(SoEvent.Eat, x, y - 8, 2, -1, ShortOrderSim.PointsFries);
                this._emit('eat');
                this._burst(x, y - 6, 8, Fx.Yellow, 50);
            } else if (it.t <= 0) this.food.splice(i, 1);
        }
    }

    // ------------------------------------------------------------------ particles
    _frand() {
        let x = this._fxSeed;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this._fxSeed = x | 0;
        return ((x >>> 0) % 10000) / 10000;
    }

    _burst(x, y, n, c, spd) {
        const fx = this.fx;
        for (let i = 0; i < n; i++) {
            if (fx.length >= 90) fx.shift();
            const a = this._frand() * Math.PI * 2, s = spd * (0.35 + this._frand() * 0.65);
            fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 - spd * 0.5, life: 0.45 + this._frand() * 0.4, c });
        }
    }

    _stepFx(dt) {
        const fx = this.fx;
        for (let i = fx.length - 1; i >= 0; i--) {
            const q = fx[i];
            q.life -= dt;
            if (q.life <= 0) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
            q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 220 * dt;
        }
    }

    // ------------------------------------------------------------------ the chasers
    _updateFoe(e, dt) {
        if (e.hurt > 0) e.hurt = f32(e.hurt - dt);
        switch (e.mode) {
            case FoeMode.Waiting:
                e.timer = f32(e.timer - dt);
                if (e.pend < 0 && e.timer <= 1.0) {
                    e.pend = this._pickSpawn();
                    if (e.kind === FoeKind.Rival) { this.banner = 'THE RIVAL!'; this.bannerT = 0; this._emit('bossWarn'); }
                }
                if (e.timer <= 0) this._spawn(e);
                break;
            case FoeMode.Stunned:
                e.timer = f32(e.timer - dt);
                if (e.timer <= 0) { e.mode = FoeMode.Walking; e.frozen = false; }
                break;
            case FoeMode.Squashed:
                e.timer = f32(e.timer - dt);
                if (e.timer <= 0) { e.mode = FoeMode.Waiting; e.timer = e.kind === FoeKind.Rival ? f32(2.5) : this._respawn; e.pend = -1; }
                break;
            case FoeMode.Walking:
                this._moveFoe(e, dt);
                break;
        }
    }

    // walk in at a floor end, one of the three farthest from the chef
    _pickSpawn() {
        const K = this.k;
        const chefNode = this.chef.nodeNear;
        const n = K.SpawnC.length;
        const order = new Array(n);
        const cost = new Array(n);
        for (let i = 0; i < n; i++) {
            order[i] = i;
            cost[i] = K.Dist[M.node(K.SpawnC[i], K.SpawnF[i]) * NC + chefNode];
        }
        // an insertion sort (stable, strict <), ascending
        for (let i = 0; i < n - 1; i++) {
            const t = cost[i + 1], tv = order[i + 1];
            let j = i;
            while (j >= 0 && t < cost[j]) { cost[j + 1] = cost[j]; order[j + 1] = order[j]; j--; }
            cost[j + 1] = t; order[j + 1] = tv;
        }
        return order[n - 1 - this._rng.next(3)];
    }

    _spawn(e) {
        const K = this.k;
        const pick = e.pend >= 0 ? e.pend : this._pickSpawn();
        e.pend = -1;
        const c = K.SpawnC[pick], f = K.SpawnF[pick];
        e.m.place(c, f);
        e.m.lastDir = c === 0 ? Dir4.Right : Dir4.Left;
        e.m.facing = c === 0 ? 1 : -1;
        e.mode = FoeMode.Walking;
        e.frozen = false;
        this._addLog(SoEvent.Spawn, e.m.x, e.m.y, e.kind, -1);
        this._emit('spawn', { foe: e.kind });
    }

    _moveFoe(e, dt) {
        const m = e.m;
        let t = dt;
        const speed = f32(this.foeSpeed * e.speedMul);
        if (speed <= 0) return;
        for (let guard = 0; guard < 8 && t > EPS; guard++) {
            if (m.dir < 0) {
                const d = this._foeChoose(e);
                if (d < 0) break;
                m.start(d);
            }
            const v = M.vertical(m.dir) ? f32(f32(speed * this.climbMul) * e.climbMul) : Math.max(6, f32(speed + this._beltAdj(m, m.dir)));
            const rem = m.remaining;
            const vt = f32(v * t);
            if (vt < rem) { m.prog = f32(m.prog + vt); e.anim = f32(e.anim + vt); t = 0; }
            else { t = f32(t - f32(rem / v)); e.anim = f32(e.anim + rem); m.arrive(); }
        }
    }

    _foeChoose(e) {
        const m = e.m;
        const K = this.k;
        const rev = m.lastDir >= 0 ? Dir4.reverse(m.lastDir) : -1;
        let nOpts = 0, nFwd = 0;
        const opts = [0, 0, 0, 0], fwd = [0, 0, 0, 0];
        for (let d = 0; d < 4; d++) {
            if (!K.canMove(m.c, m.f, d)) continue;
            opts[nOpts++] = d;
            if (d !== rev) fwd[nFwd++] = d;
        }
        if (nOpts === 0) return -1;
        const node = m.nodeAt, target = this.chef.nodeNear;
        let best;
        if (node === target) {
            // the chef is on an edge touching this node: go straight at him
            const dx = f32(this.chef.x - m.x), dy = f32(this.chef.y - m.y);
            best = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? Dir4.Up : Dir4.Down) : (dx < 0 ? Dir4.Left : Dir4.Right);
            if (!K.canMove(m.c, m.f, best)) best = -1;
        }
        else best = K.Hop[node * NC + target];
        if (best >= 0 && this._rng.nextDouble() < e.smart) {
            if (best !== rev || nOpts === 1 || this._rng.nextDouble() < 0.35) return best;
        }
        if (nFwd > 0) return fwd[this._rng.next(nFwd)];
        return opts[0];
    }

    // credit 5: a chaser that sees the chef stops dead
    _mercyFreeze() {
        for (let i = 0; i < this.foes.length; i++) {
            const e = this.foes[i];
            if (e.mode !== FoeMode.Walking && !(e.mode === FoeMode.Stunned && e.frozen)) continue;
            if (!this.inSight(e)) continue;
            e.mode = FoeMode.Stunned; e.frozen = true;
            if (e.timer < 1) e.timer = f32(1);
        }
    }

    inSight(e) {
        const chef = this.chef;
        const dx = f32(e.x - chef.x), dy = f32(e.y - chef.y);
        if (f32(f32(dx * dx) + f32(dy * dy)) <= 48 * 48) return true;
        if (chef.onLadder || e.m.onLadder || Math.abs(dy) > 0.5) return false;
        // same floor: in view if the floor runs unbroken between them
        const f = chef.f;
        const a = chef.nodeNear % M.Cols, b = e.m.nodeNear % M.Cols;
        const c0 = Math.min(a, b), c1 = Math.max(a, b);
        for (let c = c0; c <= c1; c++) if (!this.k.walk(c, f)) return false;
        return true;
    }

    // ------------------------------------------------------------------ Lab stats
    collectStats(into) {
        add(into, 'kitchens', this._cleared);
        add(into, 'caught', this._deaths);
        add(into, 'drops', this._chefDrops);
        add(into, 'rides', this._rides);
        add(into, 'crush', this._crushes);
        add(into, 'pepper', this._peppersUsed);
        add(into, 'stuns', this._stuns);
        add(into, 'fries', this._eaten);
        add(into, 'knocks', this._knocks);
        add(into, 'extras', this._extras);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

ShortOrderSim.Phase = Phase;
ShortOrderSim.PointsPart = 50;
ShortOrderSim.PointsRide = 500;
ShortOrderSim.PointsCrush = 100;
ShortOrderSim.PointsPerPart = 250;
ShortOrderSim.PointsFries = 300;
ShortOrderSim.PointsKnock = 1000;
ShortOrderSim.PointsRivalOut = 5000;
