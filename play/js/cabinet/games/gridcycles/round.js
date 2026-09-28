// THE NODE · world 1 · GRID CYCLES '82 on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of GridCyclesRound.cs from Staging/Batch1/gridcycles_tune (the 9/23 mercy tune).
//
// A ROUND = best of three duels (first to two). Each duel: countdown 3-2-1-GO (countdownStep a
// number, GO half that), the duel, 1.6 s of DEREZ, and after the deciding duel a 3 s card.
// Score: 50 a second while a duel runs, +1000 for every rival derez. Speed ramps within a duel.
// A draw (both into the same cell) replays the duel.
//
// MERCY: knobs (see spec.js) and CreditInfo.unlosable (credit 5): the rival is capped at 30% speed and
// never steers, and the player's cycle steers itself off walls and never derezzes.
// THE WALL ASSIST (credit 3+, `wallAssist` saves per round): just before your cycle steps, a turn into a
// wall is refused if straight ahead is open, and a wall dead ahead is dodged to the open side with the
// longer clear run. One-cell glance, no dice, only edits the turn queue. Each save emits Bonus.
// The arena is 74 x 49 cells so the picture sits inside the 8 px safe area with a HUD band above it.
import { f32, fmt, F32, roundEven, CabinetState, RoundResult, SoundCue, CueBuffer, Dir4 } from '../../sdk/index.js';
import { GridCyclesDuel } from './duel.js';

const Phase = Object.freeze({ Idle: 0, Countdown: 1, Running: 2, Derez: 3, Card: 4, Over: 5 });
const O = GridCyclesDuel.Outcome;

export class GridCyclesRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.countdownStep = f32(0.7);
        this.derezSeconds = f32(1.6);
        this.cardSeconds = f32(3.0);
        this.duelsToWin = 2;
        this.pointsPerSecond = 50;
        this.pointsPerDerez = 1000;

        // read-only state (C# public getters)
        this.duel = null;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.countdownLeft = 0;                 // 3, 2, 1, then 0 = GO
        this.playerWins = 0; this.rivalWins = 0; this.draws = 0;
        this.derezWho = 0;                      // 1 player, 2 rival, 3 both
        this.duelSeconds = 0;
        this.speedMul = 1;
        this.baseSpeed = 0;                     // cells/s
        this.rivalSpeed = 0;                    // cells/s, after mercy
        this.credit = null;
        this.assistSaves = 0;                   // wall-assist saves per round (0 = off)
        this.assistLeft = 0;                    // saves left this round
        this.assistUsed = 0;                    // saves spent this round
        this.sinceSave = 0;                     // seconds since the last save (the lamp's pulse)

        this._cues = new CueBuffer();
        this._log = '';
        this._result = RoundResult.None;
        this._score = 0;
        this._time = 0; this._scoreAcc = 0; this._ramp = 0; this._maxRamp = 0;
        this._rivalInset = -1;                  // cells between the rival's start lane and the side wall (-1 = the duel's own)
        this._duels = 0; this._stallSum = 0; this._duelSecSum = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get assistShown() { return this.assistSaves > 0 || this.mercyActive; }
    get assistLit() { return this.mercyActive || this.assistLeft > 0; }
    get duelNumber() { return this.playerWins + this.rivalWins + this.draws + 1; }
    get roundWon() { return this._result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Countdown: return CabinetState.Intro;
            case Phase.Running: return CabinetState.Playing;
            case Phase.Derez: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this._score; }
    get lives() { return Math.max(0, this.duelsToWin - this.rivalWins); }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        return r + ' ' + this.playerWins + '-' + this.rivalWins + ' score ' + this._score + ' ' + fmt(this._time, 1, F32) + 's duels: ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.baseSpeed = k.get('baseSpeed');
        this.rivalSpeed = f32(this.baseSpeed * k.get('rivalSpeed'));   // relative to the player; 30% cap on credit 5 is in the knob
        this._ramp = k.get('ramp');
        this._maxRamp = k.get('maxRamp');
        this.countdownStep = k.get('countdownStep', this.countdownStep);
        this.assistSaves = credit.unlosable ? 0 : roundEven(k.get('wallAssist', 0));   // credit 5 has the duel's full assist
        this.assistUsed = 0; this.sinceSave = f32(99);
        this.assistLeft = this.assistSaves;                          // the budget is per ROUND (all its duels)
        this._rivalInset = roundEven(k.get('rivalInset', -1));

        this.duel = new GridCyclesDuel(GridCyclesRound.CellsW, GridCyclesRound.CellsH, seed);
        this.duel.rivalLapse = k.get('rivalLapse');
        this.duel.rivalWander = k.get('rivalWander');
        this.duel.rivalAreaCap = Math.trunc(k.get('rivalAreaCap'));
        this.duel.playerAssist = credit.unlosable;
        this.duel.rivalBlind = credit.unlosable;

        this.playerWins = this.rivalWins = this.draws = 0;
        this._score = 0; this._scoreAcc = 0; this._time = 0;
        this._duels = 0; this._stallSum = 0; this._duelSecSum = 0;
        this._result = RoundResult.None;
        this._log = '';
        this._cues.resetTotals();
        this._startDuel();
    }

    _startDuel() {
        this.duel.resetDuel(this.baseSpeed, this.rivalSpeed);
        this.duelSeconds = 0; this.speedMul = 1;
        if (this._rivalInset >= 0) this._placeRival(this._rivalInset);
        this.p = Phase.Countdown; this.phaseTime = 0; this.countdownLeft = 3;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        dt = f32(dt);
        if (dt > f32(0.1)) dt = f32(0.1);
        if (dt <= 0) return;
        this._time = f32(this._time + dt);
        this.phaseTime = f32(this.phaseTime + dt);
        this.sinceSave = f32(this.sinceSave + dt);

        // turns are taken during the countdown too (Slice A did the same); two queued at most
        if (input != null && (this.p === Phase.Countdown || this.p === Phase.Running))
            for (let d = 0; d < 4; d++)
                if (input.pressed(Dir4.toPad(d)) && this.duel.playerTurns.length < 2) this.duel.playerTurns.push(d);

        switch (this.p) {
            case Phase.Countdown: {
                const hold = this.countdownLeft === 0 ? f32(this.countdownStep * 0.5) : this.countdownStep;
                if (this.phaseTime >= hold) {
                    this.phaseTime = f32(this.phaseTime - hold);
                    this.countdownLeft--;
                    if (this.countdownLeft < 0) { this.p = Phase.Running; this.phaseTime = 0; }
                    else this._cues.emit(this.countdownLeft === 0 ? SoundCue.Start : SoundCue.Tick);
                }
                break;
            }
            case Phase.Running: {
                this.duelSeconds = f32(this.duelSeconds + dt);
                this.speedMul = Math.min(this._maxRamp, f32(1 + f32(this._ramp * this.duelSeconds)));
                let o = O.None;
                const g = this.duel;
                if (this.assistLeft > 0) {
                    // sub-tick so the player takes at most one step per tick: the assist sees every cell
                    const n = 1 + Math.trunc(f32(f32(g.player.speed * this.speedMul) * dt));
                    const sdt = f32(dt / n);
                    for (let i = 0; i < n && o === O.None; i++) {
                        if (this.assistLeft > 0 && f32(g.player.acc + f32(f32(g.player.speed * this.speedMul) * sdt)) >= 1) this._wallAssist();
                        o = g.tick(sdt, this.speedMul);
                    }
                } else o = g.tick(dt, this.speedMul);
                this._scoreAcc = f32(this._scoreAcc + f32(this.pointsPerSecond * dt));
                const whole = Math.trunc(this._scoreAcc); this._score += whole; this._scoreAcc = f32(this._scoreAcc - whole);
                if (o !== O.None) this._endDuel(o);
                break;
            }
            case Phase.Derez:
                if (this.phaseTime >= this.derezSeconds) {
                    if (this.playerWins >= this.duelsToWin || this.rivalWins >= this.duelsToWin) {
                        this._result = this.playerWins >= this.duelsToWin ? RoundResult.Won : RoundResult.Lost;
                        this.p = Phase.Card; this.phaseTime = 0;
                        if (this._result === RoundResult.Won) this._cues.emit(SoundCue.Win);
                    } else this._startDuel();
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // THE WALL ASSIST (credit 3+): runs just before the player's cycle steps into its next cell.
    // Reads the turn queue the way the duel will (the first real turn wins, no-ops and 180s skipped)
    // and only ever edits that queue: the rules of the duel are untouched.
    _wallAssist() {
        const g = this.duel, c = g.player;
        let turn = -1;
        for (const d of g.playerTurns)
            if (d !== c.dir && d !== GridCyclesDuel.reverse(c.dir)) { turn = d; break; }
        const go = turn >= 0 ? turn : c.dir;
        if (freeAhead(g, c, go)) return;                                        // nothing to save
        if (turn >= 0 && freeAhead(g, c, c.dir)) {
            g.playerTurns.length = 0;                                           // refuse a turn into a wall
            this._saved();
            return;
        }
        // a wall dead ahead: dodge to the open side with the longer clear run (a glance, not a flood
        // fill: it can steer you into a pocket); ties turn toward the middle of the arena
        let best = -1, bestR = -1, bestC = 2147483647;
        for (let k = 0; k < 2; k++) {
            const d = (c.dir + (k === 0 ? 3 : 1)) & 3;
            if (d === go || !freeAhead(g, c, d)) continue;
            const r = g.run(c.x, c.y, d, 8);
            const nx = c.x + GridCyclesDuel.stepX(d), ny = c.y + GridCyclesDuel.stepY(d);
            const centre = Math.abs(2 * nx - g.W) + Math.abs(2 * ny - g.H);
            if (r > bestR || (r === bestR && centre < bestC)) { best = d; bestR = r; bestC = centre; }
        }
        if (best < 0) return;                                                   // sealed in: no save
        g.playerTurns.length = 0;
        g.playerTurns.push(best);
        this._saved();
    }

    // the rival's start lane, nearer its side wall: less room on its right to weave in
    _placeRival(inset) {
        const g = this.duel;
        const nx = Math.max(Math.trunc(g.W / 2) + 2, g.W - 1 - inset), y = g.rival.y, old = y * g.W + g.rival.x;
        if (nx === g.rival.x) return;
        g.cells[old] = GridCyclesDuel.Empty; g.seq[old] = 0;
        g.rival.x = nx;
        g.cells[y * g.W + nx] = GridCyclesDuel.RivalCell; g.seq[y * g.W + nx] = 1;
    }

    _saved() {
        this.assistLeft--; this.assistUsed++; this.sinceSave = 0;
        this._cues.emit(SoundCue.Bonus);
    }

    _endDuel(o) {
        this.derezWho = o === O.PlayerDerez ? 1 : o === O.RivalDerez ? 2 : 3;
        if (this.derezWho === 2) { this.playerWins++; this._score += this.pointsPerDerez; this._cues.emit(SoundCue.Hit); }
        else if (this.derezWho === 1) { this.rivalWins++; this._cues.emit(SoundCue.Die); }
        else { this.draws++; this._cues.emit(SoundCue.Miss); }
        this._log += (this.derezWho === 2 ? 'W' : this.derezWho === 1 ? 'L' : 'D') + fmt(this.duelSeconds, 1, F32) + 's ';
        this._duels++; this._duelSecSum += this.duelSeconds; this._stallSum += this.duel.playerStalls;
        this.p = Phase.Derez; this.phaseTime = 0;
    }

    collectStats(into) {
        add(into, 'duels', this._duels);
        add(into, 'draws', this.draws);
        add(into, 'duelSec', this._duels > 0 ? this._duelSecSum / this._duels : 0);
        add(into, 'stalls', this._stallSum);
        add(into, 'saves', this.assistUsed);
    }
}

function freeAhead(g, c, d) { return g.free(c.x + GridCyclesDuel.stepX(d), c.y + GridCyclesDuel.stepY(d)); }
function add(d, k, v) { d[k] = (d[k] || 0) + v; }

GridCyclesRound.Phase = Phase;
GridCyclesRound.CellsW = 74;
GridCyclesRound.CellsH = 49;
