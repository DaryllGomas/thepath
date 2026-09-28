// THE NODE · world 1 · RELIC QUEST on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of RelicQuestGame.cs's RoundRoutine (Slice B, 9/22) as phases.
//
// A ROUND = clear levelsToWin (2) mazes with `lives` (3) knights.
//   each maze:  LEVEL n  3-2-1-GO (Intro) -> the maze (Playing)
//   a bite:     BITTEN (Interlude, 1.6 s) -> no knights left: GAME OVER card; else READY (Intro, 1 s) -> the maze
//   the relic:  LEVEL CLEAR + RELIC BONUS (Interlude, 2.4 s) -> the next maze, or the ROUND WON card
//   card 3 s -> Over. The result is set when the card goes up, never before.
// Score: 50 a gem, 200 a sword stun, RELIC BONUS 2500 x the maze number.
//
// INPUT: the stick is the held direction (both axes held = the turn off the current line wins);
// A pressed = a sword swing, B pressed = a torch.
// MERCY: the knobs in spec.js, and CreditInfo.unlosable (credit 5): the snakes sleep (never move,
// never bite) and a released stick hands the knight to the autopilot, which walks to the next gem.
import { f32, fmt, F32, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { RelicQuestMaze, Outcome, Up, Right, Down, Left } from './maze.js';

const Phase = Object.freeze({ Idle: 0, Countdown: 1, Ready: 2, Running: 3, Bitten: 4, Clear: 5, Card: 6, Over: 7 });

export class RelicQuestRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.countdownStep = f32(0.6);
        this.readySeconds = f32(1.0);
        this.bittenSeconds = f32(1.6);
        this.clearSeconds = f32(2.4);
        this.cardSeconds = f32(3.0);
        this.levelsToWin = 2;

        // read-only state
        this.maze = null;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.countdownLeft = 0;                 // 3, 2, 1, then 0 = GO
        this.levelsCleared = 0;
        this.lastBonus = 0;                     // the relic bonus just paid (the LEVEL CLEAR plate)
        this.credit = null;
        this.startLives = 3;

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._time = 0;
        this._log = '';
        this._levelStart = 0;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Countdown: case Phase.Ready: return CabinetState.Intro;
            case Phase.Running: return CabinetState.Playing;
            case Phase.Bitten: case Phase.Clear: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this.maze ? this.maze.score : 0; }
    get lives() { return this.maze ? Math.max(0, this.maze.lives) : 0; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const m = this.maze;
        return r + ' levels ' + this.levelsCleared + '/' + this.levelsToWin + ' score ' + this.score + ' ' + fmt(this._time, 1, F32) + 's' +
            (m ? ' bites ' + m.caught + ' stuns ' + m.stuns + ' torches ' + m.torchesUsed : '') + ' | ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        const m = new RelicQuestMaze(seed);
        m.knightSpeed = k.get('knightSpeed');
        m.snakeSpeed = k.get('snakeSpeed');
        m.snakeChase = k.get('snakeChase');
        m.stunSeconds = k.get('stunSeconds');
        m.torchSeconds = k.get('torchSeconds', m.torchSeconds);
        m.torchesPerLevel = Math.max(0, Math.trunc(f32(k.get('torches') + f32(0.001))));
        m.snakeCap = Math.max(2, Math.trunc(f32(k.get('snakes', 4) + f32(0.001))));
        m.snakesAsleep = credit.unlosable;
        m.cues = this._cues;
        this.startLives = Math.max(1, Math.trunc(k.get('lives')));
        m.newGame(this.startLives);
        this.maze = m;
        this.levelsCleared = 0; this.lastBonus = 0;
        this._time = 0; this._log = '';
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this._startLevel(0);
    }

    _startLevel(idx) {
        this.maze.loadLevel(idx);
        this._levelStart = this._time;
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
        const m = this.maze;

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
            case Phase.Ready:
                if (this.phaseTime >= this.readySeconds) { this.p = Phase.Running; this.phaseTime = 0; this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Running: {
                let want = this._want(input);
                if (this.mercyActive && want < 0) want = m.autopilotDir();
                if (input != null && input.pressed(Pad.A)) m.swingSword();
                if (input != null && input.pressed(Pad.B)) m.lightTorch();
                const o = m.tick(dt, want);
                if (o === Outcome.Caught) {
                    this._cues.emit(SoundCue.Die);
                    this._log += 'B' + fmt(f32(this._time - this._levelStart), 0, F32) + ' ';
                    this.p = Phase.Bitten; this.phaseTime = 0;
                } else if (o === Outcome.LevelClear) {
                    this.levelsCleared++;
                    this.lastBonus = m.relicPoints * m.level;
                    this._cues.emit(SoundCue.Bonus);
                    this._log += 'L' + m.level + '@' + fmt(f32(this._time - this._levelStart), 0, F32) + 's ';
                    this.p = Phase.Clear; this.phaseTime = 0;
                }
                break;
            }
            case Phase.Bitten:
                if (this.phaseTime >= this.bittenSeconds) {
                    if (m.lives <= 0) this._card(RoundResult.Lost);
                    else { m.resetPositions(); this.p = Phase.Ready; this.phaseTime = 0; }
                }
                break;
            case Phase.Clear:
                if (this.phaseTime >= this.clearSeconds) {
                    if (this.levelsCleared >= this.levelsToWin) this._card(RoundResult.Won);
                    else this._startLevel(this.levelsCleared);
                }
                break;
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    _card(r) {
        this._result = r;
        this.p = Phase.Card; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    // the held direction; both axes held = the one that turns off the knight's current line
    _want(input) {
        if (input == null) return -1;
        const u = input.held(Pad.Up), d = input.held(Pad.Down), l = input.held(Pad.Left), r = input.held(Pad.Right);
        const v = u && !d ? Up : d && !u ? Down : -1;
        const h = r && !l ? Right : l && !r ? Left : -1;
        if (v >= 0 && h >= 0) {
            const k = this.maze.knight;
            if (k.dir === Up || k.dir === Down) return h;
            if (k.dir === Left || k.dir === Right) return v;
            return this.maze.open(k.x + RelicQuestMaze.stepX(h), k.y + RelicQuestMaze.stepY(h)) ? h : v;
        }
        return v >= 0 ? v : h;
    }

    collectStats(into) {
        const m = this.maze;
        if (!m) return;
        add(into, 'levels', this.levelsCleared);
        add(into, 'bites', m.caught);
        add(into, 'stuns', m.stuns);
        add(into, 'swings', m.swings);
        add(into, 'torches', m.torchesUsed);
        add(into, 'gems', m.gemsTaken);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

RelicQuestRound.Phase = Phase;
