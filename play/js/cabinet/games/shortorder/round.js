// THE NODE · world 1 · SHORT ORDER (Northgate Novelty Co., 1982) · THE RULES (ICabinetSim).
// Port of ShortOrderSim.cs (Staging/Batch2/shortorder), float for float (f32), dice for dice.
//
// One screen, one round. Four burgers (top bun, lettuce, patty, bottom bun) lie in four columns
// on the floors of ShortOrderMap. The chef walks the floors and climbs the ladders; walking over
// all three segments of a part drops it one floor. A falling part that lands on another part
// knocks that one down (the upper takes its place), so a drop can cascade down a column. A part
// dropped off the bottom floor lands on the plate; four on a plate = a burger, +1 pepper.
// Chasers (hot dogs, pickles, fried eggs) walk in from the floor ends and chase the chef along
// floors and ladders. Button A shakes pepper: every chaser within 2 tiles is stunned for 3 s.
// Touch an unstunned chaser and you lose a chef (3 per credit). Chasers standing on a part when
// it drops RIDE it down (500 each, and the part falls one extra floor per rider); a chaser under
// a landing part is crushed (100). The round is won when all four burgers are on their plates.
//
// Score: 50 a part per floor it falls, 500 a rider, 100 a crush, 1000 a finished burger.
//
// MERCY: knobs (chaserSpeed x0.9 per lost round, +1 pepper per lost round) and, on the
// unlosable credit, the sim's own rule: a chaser that sees the chef (same floor in clear view,
// or within 3 tiles) freezes, and a touch never costs a chef. THE RESULT COMES FROM THE GAME:
// result stays None until the Card, which follows the last burger or the last chef.
//
// Phases -> CabinetState: Ready = Intro, Cook = Playing, Caught/Clear = Interlude, Card, Over.
import { f32, fmt, F32, roundEven, SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad, Dir4 } from '../../sdk/index.js';
import { ShortOrderMap as M } from './map.js';

export const PartKind = Object.freeze({ BunTop: 0, Lettuce: 1, Patty: 2, BunBottom: 3 });
export const FoeKind = Object.freeze({ HotDog: 0, Pickle: 1, Egg: 2 });
export const FoeMode = Object.freeze({ Waiting: 0, Walking: 1, Stunned: 2, Riding: 3, Squashed: 4 });
export const SoEvent = Object.freeze({
    Ready: 0, Step: 1, Drop: 2, Kick: 3, Plate: 4, Ride: 5, Crush: 6, Pepper: 7, Burger: 8, Caught: 9, Clear: 10, Won: 11, Lost: 12, Spawn: 13,
});
const Phase = Object.freeze({ Idle: 0, Ready: 1, Cook: 2, Caught: 3, Clear: 4, Card: 5, Over: 6 });

const EPS = f32(1e-6);
const NC = M.NodeCount;

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
    constructor(burger, kind, slot, y) {
        this.burger = burger;
        this.kind = kind;
        this.slot = slot;                   // index into ColumnFloors[burger]; === its length on the plate
        this.targetSlot = slot;
        this.stepped = 0;                   // bit k = segment k walked on
        this.falling = false; this.onPlate = false;
        this.y = f32(y);                    // bottom edge in px
        this.targetY = 0;
        this.extraDrops = 0;                // floors still to fall for its riders
        this.stackIndex = 0;
    }
    get resting() { return !this.falling && !this.onPlate; }
    get floor() { const cf = M.ColumnFloors[this.burger]; return this.slot < cf.length ? cf[this.slot] : -1; }
    get height() { return ShortOrderSim.partHeight(this.kind); }
}

export class Foe {
    constructor(kind) {
        this.kind = kind;
        this.mode = FoeMode.Waiting;
        this.m = new Mover();
        this.timer = 0;                     // Waiting: until it walks in; Stunned: stun left; Squashed: show left
        this.speedMul = 1; this.smart = f32(0.7);
        this.ridePart = -1;
        this.rideY = 0;                     // feet y while riding or squashed
        this.frozen = false;                // stunned by the mercy rule rather than pepper
        this.anim = 0;                      // px walked (walk cycle)
    }
    get harmful() { return this.mode === FoeMode.Walking; }
    get x() { return this.m.x; }
    get y() { return this.mode === FoeMode.Riding || this.mode === FoeMode.Squashed ? this.rideY : this.m.y; }
}

const Lineup = [FoeKind.HotDog, FoeKind.Pickle, FoeKind.Egg, FoeKind.HotDog, FoeKind.Pickle, FoeKind.HotDog, FoeKind.Egg, FoeKind.HotDog];

export class ShortOrderSim {
    constructor() {
        // the machine's timing and scoring (not mercy knobs)
        this.readySeconds = f32(2.2); this.readyAgainSeconds = f32(1.4); this.caughtSeconds = f32(2.2);
        this.clearSeconds = f32(2.2); this.cardSeconds = f32(3.5);
        this.fallSpeed = f32(120);          // px/s, a part dropping
        this.firstSpawn = f32(1.0);         // s into cooking before the first chaser walks in
        this.touchX = f32(11); this.touchY = f32(12);

        // read-only state (C# public getters)
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.chef = new Mover();
        this.parts = [];
        this.foes = [];
        this.stacked = new Int32Array(M.Burgers);
        this.log = [];                      // { t, kind, x, y, n, b }
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

        this._cues = new CueBuffer();
        this._rng = new SystemRandom(1);
        this._result = RoundResult.None;
        this._score = 0; this._lives = 0;
        this._time = 0; this._spawnGap = 0; this._respawn = 0; this._smart = 0;
        this._chefDrops = 0; this._falls = 0; this._rides = 0; this._crushes = 0;
        this._peppersUsed = 0; this._stuns = 0; this._deaths = 0;
    }

    static partHeight(k) {
        switch (k) { case PartKind.BunTop: return 9; case PartKind.Lettuce: return 7; default: return 8; }
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Ready: return CabinetState.Intro;
            case Phase.Cook: return CabinetState.Playing;
            case Phase.Caught: case Phase.Clear: return CabinetState.Interlude;
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
        return r + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's burgers ' + this.burgersDone + '/4 chefs ' + this._lives +
            ' drops ' + this._chefDrops + ' falls ' + this._falls + ' rides ' + this._rides + ' crush ' + this._crushes +
            ' pepper ' + this._peppersUsed + ' stun ' + this._stuns + ' caught ' + this._deaths;
    }

    reset(seed, credit, k) {
        this._rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.credit = credit;
        this.chefSpeed = k.get('chefSpeed');
        this.foeSpeed = f32(this.chefSpeed * k.get('chaserSpeed'));
        this.climbMul = k.get('climb');
        this.stunSeconds = k.get('stunSeconds');
        this.stunRadius = f32(k.get('stunTiles') * M.TilePx);
        this._spawnGap = k.get('spawnGap');
        this._respawn = k.get('respawn');
        this._smart = k.get('chaserSmart');
        this.peppers = Math.max(0, roundEven(k.get('peppers')));
        this.startLives = this._lives = Math.max(1, roundEven(k.get('lives')));
        const count = Math.max(1, Math.min(Lineup.length, roundEven(k.get('chasers'))));

        this.parts.length = 0;
        for (let b = 0; b < M.Burgers; b++) {
            this.stacked[b] = 0;
            const cf = M.ColumnFloors[b];
            for (let i = 0; i < M.PartsPerBurger; i++) {
                const f = M.StartFloors[b][i];
                const slot = cf.indexOf(f);
                this.parts.push(new Part(b, i, slot, M.floorY(f)));
            }
        }
        this.foes.length = 0;
        for (let i = 0; i < count; i++) {
            const kind = Lineup[i];
            const f = new Foe(kind);
            // hot dogs are the standard; pickles run faster but wander; eggs are slow and sure
            f.speedMul = kind === FoeKind.Pickle ? f32(1.08) : kind === FoeKind.Egg ? f32(0.9) : 1;
            f.smart = Math.min(1, kind === FoeKind.Pickle ? f32(this._smart * f32(0.8)) : kind === FoeKind.Egg ? f32(this._smart * f32(1.2)) : this._smart);
            this.foes.push(f);
        }
        this.burgersDone = 0;
        this._score = 0; this._time = 0; this.cookTime = 0;
        this._chefDrops = this._falls = this._rides = this._crushes = this._peppersUsed = this._stuns = this._deaths = 0;
        this._result = RoundResult.None;
        this.pepperT = f32(-99); this.caughtBy = -1; this.chefAnim = 0;
        this.log.length = 0;
        this._cues.resetTotals();
        this._placeChef();
        this._scheduleFoes();
        this.firstReady = true;
        this._go(Phase.Ready);
        this._addLog(SoEvent.Ready, this.chef.x, this.chef.y, this._lives, -1);
        this._cues.emit(SoundCue.Tick);
    }

    _go(p) { this.p = p; this.phaseTime = 0; }

    _placeChef() {
        this.chef.place(M.StartC, M.StartF);
        this.chef.lastDir = -1; this.chef.facing = 1;
        this.chefMoving = false;
    }

    _scheduleFoes() {
        for (let i = 0; i < this.foes.length; i++) {
            const f = this.foes[i];
            f.mode = FoeMode.Waiting; f.timer = f32(this.firstSpawn + f32(i * this._spawnGap)); f.ridePart = -1; f.frozen = false;
            f.m.place(0, 0);
        }
    }

    _addLog(kind, x, y, n, b) {
        this.log.push({ t: this._time, kind, x, y, n, b });
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);

        switch (this.p) {
            case Phase.Ready:
                this.chefMoving = false;
                this._updateParts(dt);
                if (this.burgersDone >= M.Burgers) { this._startClear(); break; }
                if (this.phaseTime >= (this.firstReady ? this.readySeconds : this.readyAgainSeconds)) { this._go(Phase.Cook); this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Cook:
                this._cook(dt, input);
                break;
            case Phase.Caught:
                this.chefMoving = false;
                this._updateParts(dt);
                if (this.phaseTime >= this.caughtSeconds) {
                    if (this.burgersDone >= M.Burgers) this._startClear();
                    else if (this._lives <= 0) this._endRound(RoundResult.Lost);
                    else {
                        this._placeChef();
                        this._scheduleFoes();
                        this.firstReady = false;
                        this._go(Phase.Ready);
                        this._addLog(SoEvent.Ready, this.chef.x, this.chef.y, this._lives, -1);
                    }
                }
                break;
            case Phase.Clear:
                this.chefMoving = false;
                if (this.phaseTime >= this.clearSeconds) this._endRound(RoundResult.Won);
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this._go(Phase.Over);
                break;
        }
    }

    _endRound(r) {
        this._result = r;
        this._go(Phase.Card);
        if (r === RoundResult.Won) { this._cues.emit(SoundCue.Win); this._addLog(SoEvent.Won, this.chef.x, this.chef.y, this._score, -1); }
        else this._addLog(SoEvent.Lost, this.chef.x, this.chef.y, this._score, -1);
    }

    _startClear() {
        this._go(Phase.Clear);
        this._addLog(SoEvent.Clear, this.chef.x, this.chef.y, this.burgersDone, -1);
    }

    // ------------------------------------------------------------------ cooking
    _cook(dt, input) {
        this.cookTime = f32(this.cookTime + dt);
        if (input != null && input.pressed(Pad.A)) this._shake();
        this._moveChef(dt, input);
        for (let i = 0; i < this.foes.length; i++) this._updateFoe(this.foes[i], dt);
        this._updateParts(dt);
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
        if (this.burgersDone >= M.Burgers) this._startClear();
    }

    _caught(foe) {
        this._lives--;
        this._deaths++;
        this.caughtBy = foe;
        this.chefMoving = false;
        this._go(Phase.Caught);
        this._addLog(SoEvent.Caught, this.chef.x, this.chef.y, this._lives, -1);
        this._cues.emit(SoundCue.Die);
    }

    _shake() {
        if (this.peppers <= 0) return;
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
            f.mode = FoeMode.Stunned; f.timer = this.stunSeconds; f.frozen = false;
            n++;
        }
        this._stuns += n;
        this._addLog(SoEvent.Pepper, this.pepperX, this.pepperY, n, -1);
        this._cues.emit(SoundCue.Miss);
    }

    // ------------------------------------------------------------------ the chef
    _moveChef(dt, input) {
        const m = this.chef;
        let wantH = -1, wantV = -1;
        if (input != null) {
            if (input.held(Pad.Right)) wantH = Dir4.Right; else if (input.held(Pad.Left)) wantH = Dir4.Left;
            if (input.held(Pad.Up)) wantV = Dir4.Up; else if (input.held(Pad.Down)) wantV = Dir4.Down;
        }
        const any = wantH >= 0 || wantV >= 0;
        this.chefMoving = false;
        if (m.dir >= 0) {
            const rev = Dir4.reverse(m.dir);
            if (wantH === rev || wantV === rev) m.reverse();
            else if (!any) return;                       // let go of the stick: stand where you are
        }
        let t = dt;
        let arriving = false;
        for (let guard = 0; guard < 8 && t > EPS; guard++) {
            if (m.dir < 0) {
                const d = this._chefChoose(m, wantH, wantV, arriving);
                if (d < 0) break;
                m.start(d);
            }
            const v = M.vertical(m.dir) ? f32(this.chefSpeed * this.climbMul) : this.chefSpeed;
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
    // keeps the chef walking the way he was going, so pushing UP climbs the next ladder you reach
    _chefChoose(m, wantH, wantV, arriving) {
        const lastV = M.vertical(m.lastDir);
        const first = lastV ? wantH : wantV, second = lastV ? wantV : wantH;
        if (first >= 0 && M.canMove(m.c, m.f, first)) return first;
        if (second >= 0 && M.canMove(m.c, m.f, second)) return second;
        if (arriving && m.lastDir >= 0 && (first >= 0 || second >= 0) && M.canMove(m.c, m.f, m.lastDir)) return m.lastDir;
        return -1;
    }

    _chefArrived() {
        const chef = this.chef;
        const b = M.burgerAt(chef.c);
        if (b < 0) return;
        const p = this.restingPartAt(b, chef.f);
        if (p == null) return;
        const bit = 1 << (chef.c - M.BurgerCol0[b]);
        if ((p.stepped & bit) !== 0) return;
        p.stepped |= bit;
        this._cues.emit(SoundCue.Tick);
        this._addLog(SoEvent.Step, chef.x, chef.y, p.stepped, b);
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
        const x0 = f32(M.burgerX0(p.burger) - 2), x1 = f32(f32(x0 + M.BurgerW) + 4);
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
        this._startFall(p);
    }

    _startFall(p) {
        p.falling = true;
        p.stepped = 0;
        p.targetSlot = p.slot + 1;
        const cf = M.ColumnFloors[p.burger];
        p.targetY = p.targetSlot < cf.length ? M.floorY(cf[p.targetSlot]) : this.stackY(p.burger);
        this._score += ShortOrderSim.PointsPart;
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
            if (p.targetSlot >= M.ColumnFloors[p.burger].length) p.targetY = this.stackY(p.burger);
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
        const cf = M.ColumnFloors[b];
        p.slot = p.targetSlot;
        const cx = f32(M.burgerX0(b) + f32(M.BurgerW * f32(0.5)));
        if (p.slot >= cf.length) {
            p.falling = false; p.onPlate = true; p.extraDrops = 0;
            p.stackIndex = this.stacked[b]++;
            this._squashRiders(idx);
            this._addLog(SoEvent.Plate, cx, p.y, this.stacked[b], b);
            if (this.stacked[b] === M.PartsPerBurger) {
                this.burgersDone++;
                this._score += ShortOrderSim.PointsBurger;
                this.peppers++;
                this._addLog(SoEvent.Burger, cx, f32(p.y - 12), this.burgersDone, b);
                this._cues.emit(SoundCue.Bonus);
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
            this._startFall(below);
        }
        else if (p.extraDrops > 0) {
            p.extraDrops--;
            this._startFall(p);                 // riders keep riding
        }
        else {
            p.falling = false; p.stepped = 0;
            this._squashRiders(idx);
        }
    }

    _squashRiders(idx) {
        const p = this.parts[idx];
        let n = 0;
        for (let i = 0; i < this.foes.length; i++) {
            const e = this.foes[i];
            if (e.mode !== FoeMode.Riding || e.ridePart !== idx) continue;
            e.mode = FoeMode.Squashed; e.timer = f32(0.9); e.rideY = f32(p.y - p.height); e.ridePart = -1;
            n++;
        }
        if (n === 0) return;
        this._score += ShortOrderSim.PointsRide * n;
        this._rides += n;
        this._addLog(SoEvent.Ride, f32(M.burgerX0(p.burger) + f32(M.BurgerW * f32(0.5))), f32(p.y - p.height), n, p.burger);
        this._cues.emit(SoundCue.Bonus);
    }

    _crush(idx, f) {
        const p = this.parts[idx];
        const x0 = f32(M.burgerX0(p.burger) - 2), x1 = f32(f32(x0 + M.BurgerW) + 4);
        for (let i = 0; i < this.foes.length; i++) {
            const e = this.foes[i];
            if (e.mode !== FoeMode.Walking && e.mode !== FoeMode.Stunned) continue;
            if (!e.m.onFloor(f) || e.x < x0 || e.x > x1) continue;
            e.mode = FoeMode.Squashed; e.timer = f32(0.9); e.rideY = M.floorY(f); e.frozen = false;
            this._score += ShortOrderSim.PointsCrush;
            this._crushes++;
            this._addLog(SoEvent.Crush, e.x, f32(e.rideY - 10), 1, p.burger);
            this._cues.emit(SoundCue.Bonus);
        }
    }

    // ------------------------------------------------------------------ the chasers
    _updateFoe(e, dt) {
        switch (e.mode) {
            case FoeMode.Waiting:
                e.timer = f32(e.timer - dt);
                if (e.timer <= 0) this._spawn(e);
                break;
            case FoeMode.Stunned:
                e.timer = f32(e.timer - dt);
                if (e.timer <= 0) { e.mode = FoeMode.Walking; e.frozen = false; }
                break;
            case FoeMode.Squashed:
                e.timer = f32(e.timer - dt);
                if (e.timer <= 0) { e.mode = FoeMode.Waiting; e.timer = this._respawn; }
                break;
            case FoeMode.Walking:
                this._moveFoe(e, dt);
                break;
        }
    }

    _spawn(e) {
        // walk in at a floor end, one of the three farthest from the chef
        const chefNode = this.chef.nodeNear;
        const n = M.SpawnC.length;
        const order = new Array(n);
        const cost = new Array(n);
        for (let i = 0; i < n; i++) {
            order[i] = i;
            cost[i] = M.Dist[M.node(M.SpawnC[i], M.SpawnF[i]) * NC + chefNode];
        }
        // C# Array.Sort(keys, items) on 6 elements = .NET's insertion sort (stable, strict <), ascending
        for (let i = 0; i < n - 1; i++) {
            const t = cost[i + 1], tv = order[i + 1];
            let j = i;
            while (j >= 0 && t < cost[j]) { cost[j + 1] = cost[j]; order[j + 1] = order[j]; j--; }
            cost[j + 1] = t; order[j + 1] = tv;
        }
        const pick = order[n - 1 - this._rng.next(3)];
        const c = M.SpawnC[pick], f = M.SpawnF[pick];
        e.m.place(c, f);
        e.m.lastDir = c === 0 ? Dir4.Right : Dir4.Left;
        e.m.facing = c === 0 ? 1 : -1;
        e.mode = FoeMode.Walking;
        e.frozen = false;
        this._addLog(SoEvent.Spawn, e.m.x, e.m.y, e.kind, -1);
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
            const v = M.vertical(m.dir) ? f32(speed * this.climbMul) : speed;
            const rem = m.remaining;
            const vt = f32(v * t);
            if (vt < rem) { m.prog = f32(m.prog + vt); e.anim = f32(e.anim + vt); t = 0; }
            else { t = f32(t - f32(rem / v)); e.anim = f32(e.anim + rem); m.arrive(); }
        }
    }

    _foeChoose(e) {
        const m = e.m;
        const rev = m.lastDir >= 0 ? Dir4.reverse(m.lastDir) : -1;
        let nOpts = 0, nFwd = 0;
        const opts = [0, 0, 0, 0], fwd = [0, 0, 0, 0];
        for (let d = 0; d < 4; d++) {
            if (!M.canMove(m.c, m.f, d)) continue;
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
            if (!M.canMove(m.c, m.f, best)) best = -1;
        }
        else best = M.Hop[node * NC + target];
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
        for (let c = c0; c <= c1; c++) if (!M.walk(c, f)) return false;
        return true;
    }

    // ------------------------------------------------------------------ Lab stats
    collectStats(into) {
        add(into, 'burgers', this.burgersDone);
        add(into, 'caught', this._deaths);
        add(into, 'drops', this._chefDrops);
        add(into, 'falls', this._falls);
        add(into, 'rides', this._rides);
        add(into, 'crush', this._crushes);
        add(into, 'pepper', this._peppersUsed);
        add(into, 'stuns', this._stuns);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

ShortOrderSim.Phase = Phase;
ShortOrderSim.PointsPart = 50;
ShortOrderSim.PointsRide = 500;
ShortOrderSim.PointsCrush = 100;
ShortOrderSim.PointsBurger = 1000;
