// THE NODE · world 1 · AFTERGLOW on the Cabinet Engine · THE ROUND (ICabinetSim).
//
// A ROUND = three stages with three jets: OPEN SEA, RED DESERT, AFTERGLOW CANYON. Each stage opens on its
// card (STAGE n, the name, GET READY) while the jet climbs into view; then the flight (world.js) until the
// stage's FORTRESS is destroyed or escapes; then the STAGE CLEAR tally (HIT x 100, the fortress bonus). The
// third tally is the win; losing the last jet is a two-second beat, then GAME OVER. The result comes from
// the game, never the clock (every stage ends: the fortress leaves on its own after 15 s).
//
// Controls: stick flies (left/right bank and slide, UP climbs, DOWN dives), A fires missiles at every lock,
// B barrel-rolls (so does a double tap left or right); the vulcan fires by itself.
// Cues (the 8 standard slots): Start (GO), Tick (a lock), Miss (a missile warning), Hit (a kill), Die (your
// jet), Bonus (a boss killed, a stage clear), Win. Richer names for a host that wants them are in
// `sfx` (this step only): lock missile explosion boom warning roll dodge crash stage clear.
import { CabinetState, RoundResult, SoundCue, CueBuffer, Pad, fmt } from '../../sdk/index.js';
import { AfterglowWorld, STAGES } from './world.js';

const Phase = Object.freeze({ Idle: 0, Intro: 1, Running: 2, Clear: 3, Beat: 4, Card: 5, Over: 6 });

export class AfterglowRound {
    constructor() {
        this.introSeconds = 2.8;
        this.clearSeconds = 3.6;
        this.lostBeat = 2.2;
        this.cardSeconds = 4.0;
        this.hitBonus = 100;

        this.world = null;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.credit = null;
        this.stagesCleared = 0;
        this.lastClear = null;           // { stage, hits, hitBonus, bossBonus, result } for the tally card
        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._time = 0;
        this._stageTimes = [];
        this._stageStart = 0;
        this.sfx = [];
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get stage() { return this.world ? this.world.stage : 0; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Intro: return CabinetState.Intro;
            case Phase.Running: return CabinetState.Playing;
            case Phase.Clear: case Phase.Beat: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this.world ? this.world.score : 0; }
    get lives() { return this.world ? Math.max(0, this.world.lives) : 0; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const w = this.world, st = w ? w.st : null;
        return r + ' stages ' + this.stagesCleared + '/3 score ' + this.score + ' hits ' + (w ? w.hits : 0) + ' ' + fmt(this._time, 1) + 's jets lost ' +
            (st ? st.deaths : 0) + ' (missile ' + (st ? st.byMissile : 0) + ' crash ' + (st ? st.byCrash : 0) + ') rolls ' + (st ? st.rolls : 0) +
            ' dodges ' + (st ? st.dodges : 0) + ' bombers ' + (st ? st.bombers : 0) + ' forts ' + (st ? st.fortresses : 0) +
            ' (' + this._stageTimes.map(t => fmt(t, 1) + 's').join(' ') + ')';
    }

    reset(seed, credit, k) {
        this.credit = credit;
        const w = this.world = new AfterglowWorld(seed);
        w.cues = this._cues;
        w.lives = Math.round(k.get('lives', 3));
        w.fireRate = k.get('fireRate', 1);
        w.missileTurn = k.get('missileTurn', 1);
        w.aceShare = k.get('aceShare', 0.3);
        w.lockBox = k.get('lockBox', 1);
        w.unlosable = credit.unlosable;
        w.autoRolls = credit.unlosable ? 0 : Math.max(0, Math.round(k.get('autoRolls', 0)));
        this.autoRollsGiven = w.autoRolls;
        this.stagesCleared = 0; this.lastClear = null;
        this._time = 0; this._stageTimes = []; this._stageStart = 0;
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this.sfx = w.sfx;
        w.startStage(0);
        this.p = Phase.Intro; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (!(dt > 0)) return;
        this._time += dt;
        this.phaseTime += dt;
        const w = this.world;
        const ctl = this._ctl(input);

        switch (this.p) {
            case Phase.Intro:
                w.tick(dt, ctl.fly);
                if (this.phaseTime >= this.introSeconds) {
                    this.p = Phase.Running; this.phaseTime = 0; this._stageStart = this._time;
                    w.spawning = true;
                    this._cues.emit(SoundCue.Start); w.fx('stage');
                }
                break;
            case Phase.Running:
                w.tick(dt, ctl.all);
                if (w.dead) {
                    this._stageTimes.push(this._time - this._stageStart);
                    w.clearAll();
                    this.p = Phase.Beat; this.phaseTime = 0;
                    break;
                }
                if (w.stageDone) {
                    this._stageTimes.push(this._time - this._stageStart);
                    this.stagesCleared = w.stage + 1;
                    const hb = w.stageHits * this.hitBonus;
                    w.score += hb;
                    this.lastClear = { stage: w.stage, hits: w.stageHits, hitBonus: hb, bossBonus: w.bossBonus, result: w.bossResult };
                    w.clearAll();
                    this._cues.emit(SoundCue.Bonus); w.fx('clear');
                    w.st.stages++;
                    this.p = Phase.Clear; this.phaseTime = 0;
                }
                break;
            case Phase.Clear:
                w.tick(dt, ctl.fly);
                if (this.phaseTime >= this.clearSeconds) {
                    if (this.stagesCleared >= STAGES.length) {
                        this._result = RoundResult.Won;
                        this.p = Phase.Card; this.phaseTime = 0;
                        this._cues.emit(SoundCue.Win);
                    } else {
                        w.startStage(w.stage + 1);
                        this.p = Phase.Intro; this.phaseTime = 0;
                        this._cues.emit(SoundCue.Tick);
                    }
                }
                break;
            case Phase.Beat:
                w.tick(dt, null);
                if (this.phaseTime >= this.lostBeat) {
                    this._result = RoundResult.Lost;
                    this.p = Phase.Card; this.phaseTime = 0;
                }
                break;
            case Phase.Card:
                w.tick(dt, this._result === RoundResult.Won ? ctl.fly : null);
                if (this.phaseTime >= this.cardSeconds) this.p = Phase.Over;
                break;
        }
    }

    // the panel, read once a step: `fly` = the stick only, `all` = stick + buttons (+ fresh presses)
    _ctl(input) {
        const all = { sx: 0, sy: 0, fire: false, roll: false, tapL: false, tapR: false, relL: false, relR: false };
        if (input != null) {
            const x = input.x, y = input.y;
            all.sx = x > 0.2 || x < -0.2 ? Math.max(-1, Math.min(1, x)) : 0;
            all.sy = y > 0.2 || y < -0.2 ? Math.max(-1, Math.min(1, y)) : 0;
            all.fire = input.pressed(Pad.A);
            all.roll = input.pressed(Pad.B);
            all.tapL = input.pressed(Pad.Left);
            all.tapR = input.pressed(Pad.Right);
            all.relL = input.released(Pad.Left);
            all.relR = input.released(Pad.Right);
        }
        const fly = { sx: all.sx, sy: all.sy, fire: false, roll: false, tapL: false, tapR: false, relL: false, relR: false };
        return { all, fly };
    }

    collectStats(into) {
        const w = this.world;
        if (!w) return;
        const s = w.st;
        add(into, 'stages', this.stagesCleared);
        add(into, 'hits', w.hits);
        add(into, 'deaths', s.deaths);
        add(into, 'byMissile', s.byMissile);
        add(into, 'byCrash', s.byCrash);
        add(into, 'rolls', s.rolls);
        add(into, 'dodges', s.dodges);
        add(into, 'autoSaves', s.autoSaves);
        add(into, 'enemyMsl', s.enemyMissiles);
        add(into, 'fired', s.fired);
        add(into, 'locks', s.locks);
        add(into, 'bombers', s.bombers);
        add(into, 'forts', s.fortresses);
        add(into, 'nearMiss', s.nearMiss);
        add(into, 'killPct', s.kills / Math.max(1, s.foes + s.points));
        for (let i = 0; i < 3; i++) add(into, 'die' + (i + 1), s.dieStage[i]);
        ['Head', 'Back', 'Bomb', 'Fort', 'Crash'].forEach((n, i) => add(into, 'k' + n, s.dieSrc[i]));
        ['Head', 'Back', 'Bomb', 'Fort'].forEach((n, i) => add(into, 'm' + n, s.mslSrc[i]));
        for (let i = 0; i < 3; i++) add(into, 's' + (i + 1) + 'Sec', i < this._stageTimes.length ? this._stageTimes[i] : 0);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

AfterglowRound.Phase = Phase;
