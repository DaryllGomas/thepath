// THE NODE · world 1 · STARVECTOR on the Cabinet Engine · THE ROUND (ICabinetSim).
// Port of StarvectorGame.cs's RoundRoutine (Slice B, 9/22) onto phases.
//
// A ROUND = clear three waves with three ships. Wave 1 opens on a 3-2-1-GO countdown (the field frozen);
// each cleared wave pays a WAVE BONUS (1000 x the wave) and the next wave's rocks appear frozen behind a
// banner; the last ship's wreck (or the last rock's burst) settles for a beat; then the 3 s card.
// Score: rocks 20 / 50 / 100 (large / medium / small), the saucer 500, plus the wave bonuses.
//
// MERCY: knobs (see spec.js) and CreditInfo.unlosable (credit 5): shields hold (nothing can take a ship),
// the saucer holds its fire, and when the player lets go of every control the gun lines itself up
// (the field's gunner's eye). Exactly Unity's credit-5 rule.
// Controls: stick left/right turns, stick up thrusts, A fires (held = auto-fire), B raises the shield.
import { CabinetState, RoundResult, SoundCue, CueBuffer, Pad, fmt } from '../../sdk/index.js';
import { StarvectorField } from './field.js';

const Phase = Object.freeze({ Idle: 0, Countdown: 1, Running: 2, Banner: 3, Beat: 4, Card: 5, Over: 6 });

export class StarvectorRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.countdownStep = 0.7;
        this.bannerSeconds = 2.2;
        this.lostBeat = 2.0;                    // the last ship's wreck settles before the card
        this.wonBeat = 1.0;                     // the last rock's burst settles before the card
        this.cardSeconds = 3.5;
        this.waves = 3;
        this.waveBase = [4, 5, 6];              // large rocks per wave before mercy (Unity's)
        this.waveBonus = 1000;                  // x the wave number

        // read-only state
        this.field = null;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.countdownLeft = 0;                 // 3, 2, 1, then 0 = GO
        this.wavesCleared = 0;
        this.waveSizes = [0, 0, 0];
        this.lastBonus = 0; this.bonusAt = -99; // the BONUS line under the score
        this.credit = null;
        this.ships = 3;
        this.shieldSeconds = 0;
        this.assistSaves = 0;                   // SHIELD ASSIST saves this round (0 = off)

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._time = 0;
        this._waveTimes = [];
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get wave() { return this.field ? Math.max(1, this.field.wave) : 1; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Countdown: return CabinetState.Intro;
            case Phase.Running: return CabinetState.Playing;
            case Phase.Banner: case Phase.Beat: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this.field ? this.field.score : 0; }
    get lives() { return this.field ? Math.max(0, this.field.lives) : 0; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const f = this.field;
        return r + ' waves ' + this.wavesCleared + '/' + this.waves + ' score ' + this.score + ' ' + fmt(this._time, 1) + 's ships lost ' +
            (f ? f.shipsLost : 0) + ' rocks ' + (f ? f.rocksShot : 0) + ' saucers ' + (f ? f.saucersShot : 0) +
            ' waves ' + this.waveSizes.join('/') + ' (' + this._waveTimes.map(t => fmt(t, 1) + 's').join(' ') + ')';
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this.ships = Math.round(k.get('ships', 3));
        this.shieldSeconds = k.get('shieldSeconds', 2);
        const scale = k.get('waveScale', 1);
        for (let w = 1; w <= this.waves; w++) this.waveSizes[w - 1] = StarvectorField.waveSize(this.waveBase, w, scale);

        const f = this.field = new StarvectorField(seed);
        f.cues = this._cues;
        f.rockSpeed = k.get('rockSpeed', 1);
        f.saucerAimError = k.get('saucerAim', 0.3);
        f.saucerFireEvery = k.get('saucerFireEvery', 1.6);
        f.saucerEvery = k.get('saucerEvery', 14);
        f.shipInvincible = credit.unlosable;
        f.saucerFires = !credit.unlosable;
        this.assistSaves = credit.unlosable ? 0 : Math.max(0, Math.round(k.get('shieldAssist', 0)));   // credit 5 has the full shield
        f.assistLeft = this.assistSaves;
        f.newGame(this.ships);

        this.wavesCleared = 0; this.lastBonus = 0; this.bonusAt = -99;
        this._time = 0; this._waveStart = 0; this._waveTimes = [];
        this._result = RoundResult.None;
        this._cues.resetTotals();
        f.startWave(1, this.waveSizes[0], this.shieldSeconds);
        this.p = Phase.Countdown; this.phaseTime = 0; this.countdownLeft = 3;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (!(dt > 0)) return;
        this._time += dt;
        this.phaseTime += dt;
        const f = this.field;

        switch (this.p) {
            case Phase.Countdown: {
                f.clock(dt);
                const hold = this.countdownLeft === 0 ? this.countdownStep * 0.5 : this.countdownStep;
                if (this.phaseTime >= hold) {
                    this.phaseTime -= hold;
                    this.countdownLeft--;
                    if (this.countdownLeft < 0) { this.p = Phase.Running; this.phaseTime = 0; this._waveStart = this._time; }
                    else this._cues.emit(this.countdownLeft === 0 ? SoundCue.Start : SoundCue.Tick);
                }
                break;
            }
            case Phase.Running: {
                let turn = 0, thrust = false, fire = false, shield = false, firePressed = false;
                if (input != null) {
                    const x = input.x;
                    turn = x > 0.2 || x < -0.2 ? Math.max(-1, Math.min(1, x)) : 0;
                    thrust = input.held(Pad.Up);
                    fire = input.held(Pad.A);
                    firePressed = input.pressed(Pad.A);
                    shield = input.held(Pad.B);
                }
                // the mercy credit: hands off the controls and the gun lines itself up
                if (this.mercyActive && turn === 0 && !thrust && !fire && !shield) {
                    const s = f.suggest(); turn = s.turn; fire = s.fire;
                }
                f.tick(dt, turn, thrust, fire, shield, firePressed);
                if (f.dead) { this._waveTimes.push(this._time - this._waveStart); this.p = Phase.Beat; this.phaseTime = 0; break; }
                if (f.waveCleared) {
                    this._waveTimes.push(this._time - this._waveStart);
                    this.wavesCleared = f.wave;
                    this.lastBonus = this.waveBonus * f.wave; f.score += this.lastBonus; this.bonusAt = this._time;
                    this._cues.emit(SoundCue.Bonus);
                    if (this.wavesCleared >= this.waves) {
                        f.saucerFires = false; f.shipInvincible = true;   // nothing can undo a won round in its beat
                        this.p = Phase.Beat; this.phaseTime = 0;
                    }
                    else {
                        f.startWave(f.wave + 1, this.waveSizes[f.wave], this.shieldSeconds);
                        this.p = Phase.Banner; this.phaseTime = 0;
                    }
                }
                break;
            }
            case Phase.Banner:
                f.clock(dt);
                if (this.phaseTime >= this.bannerSeconds) { this.p = Phase.Running; this.phaseTime = 0; this._waveStart = this._time; }
                break;
            case Phase.Beat: {
                const won = this.wavesCleared >= this.waves;
                f.tick(dt, 0, false, false, false);
                if (this.phaseTime >= (won ? this.wonBeat : this.lostBeat)) {
                    this._result = won ? RoundResult.Won : RoundResult.Lost;
                    this.p = Phase.Card; this.phaseTime = 0;
                    if (won) this._cues.emit(SoundCue.Win);
                }
                break;
            }
            case Phase.Card:
                f.clock(dt);
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    collectStats(into) {
        const f = this.field;
        if (!f) return;
        add(into, 'waves', this.wavesCleared);
        add(into, 'shipsLost', f.shipsLost);
        add(into, 'saucers', f.saucersShot);
        add(into, 'accuracy', f.shots > 0 ? f.rocksShot / f.shots : 0);
        add(into, 'shieldSec', f.shieldUsed);
        add(into, 'bumps', f.bumps);
        add(into, 'saves', f.assistUsed);
        add(into, 'byRock', f.byRock); add(into, 'byBolt', f.byBolt); add(into, 'bySaucer', f.bySaucer);
        for (let i = 0; i < 3; i++) add(into, 'w' + (i + 1) + 'Sec', i < this._waveTimes.length ? this._waveTimes[i] : 0);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

StarvectorRound.Phase = Phase;
