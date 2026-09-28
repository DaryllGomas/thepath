// THE NODE · world 1 · WARLORD'S ROAD · THE ROUND (ICabinetSim).
//
// A ROUND = the road to the Warlord: three stages with a camp between them.
//   MAP (Intro, 2.6 s)     the old map, the road drawn in red, the next stop marked
//   STAGE (Playing)        the stage (world.js) until its boss falls, then STAGE CLEAR for 2.6 s
//   CAMP (Interlude, 5.6 s) night by the fire; thieves creep in for your pack: kick them (A) for pots
//   ...  after stage 3: the ROUND WON card. Lose every life: the GAME OVER card. Card 4 s -> Over.
// The result is set when the card goes up, never before. THE RESULT COMES FROM A GAME, NEVER THE CLOCK.
// MERCY: the knobs (spec.js) ease per lost round; credit 5 (credit.unlosable): the old gods watch over the
// hero, no blow can hurt him (enemyDamage = 0), his sword bites harder.
import { SystemRandom, CabinetState, RoundResult, SoundCue, CueBuffer, Pad } from '../../sdk/index.js';
import { World, MAX_POTS } from './world.js';
import { Stages } from './stages.js';

const Phase = Object.freeze({ Idle: 0, Map: 1, Play: 2, Camp: 3, Card: 4, Over: 5 });

export class WarlordsRound {
    constructor() {
        this.mapSeconds = 2.6;
        this.campSeconds = 5.6;
        this.cardSeconds = 4.0;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.world = null;
        this.stage = 0;
        this.stagesCleared = 0;
        this.credit = null;
        this.camp = null;
        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._time = 0;
        this._rng = null;
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Map: return CabinetState.Intro;
            case Phase.Play: return CabinetState.Playing;
            case Phase.Camp: return CabinetState.Interlude;
            case Phase.Card: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this.world ? this.world.score : 0; }
    get lives() { return this.world ? this.world.lives : 0; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const w = this.world;
        return r + ' stages ' + this.stagesCleared + '/3 score ' + this.score + ' ' + this._time.toFixed(1) + 's' +
            (w ? ' deaths ' + w.deaths + ' kills ' + w.kills + ' magic ' + w.casts + ' rides ' + w.rides + ' throws ' + w.throws : '') +
            ' | ' + (w ? w.log.trimEnd() : '');
    }

    reset(seed, credit, k) {
        this.credit = credit;
        this._cues.resetTotals();
        this.world = new World(seed, k, credit, this._cues);
        this._rng = new SystemRandom(((seed | 0) ^ 0x2F6B) || 3);
        this.stage = 0; this.stagesCleared = 0;
        this._time = 0;
        this._result = RoundResult.None;
        this._startMap();
    }

    _startMap() {
        this.p = Phase.Map; this.phaseTime = 0;
        this.world.loadStage(this.stage);
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (dt <= 0) return;
        this._time += dt;
        this.phaseTime += dt;
        const w = this.world;
        switch (this.p) {
            case Phase.Map:
                if (this.phaseTime >= this.mapSeconds) { this.p = Phase.Play; this.phaseTime = 0; this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Play: {
                const pad = input ? { x: input.x, y: input.y, aP: input.pressed(Pad.A), bP: input.pressed(Pad.B), aH: input.held(Pad.A), bH: input.held(Pad.B) } : null;
                w.step(dt, pad);
                if (w.outcome === 1) this._card(RoundResult.Lost);
                else if (w.outcome === 2) {
                    this.stagesCleared++;
                    w.score += 1000 * this.stagesCleared + 50 * Math.max(0, Math.round(w.hero.hp));
                    this._cues.emit(SoundCue.Bonus);
                    if (this.stagesCleared >= Stages.length) this._card(RoundResult.Won);
                    else this._startCamp();
                }
                break;
            }
            case Phase.Camp:
                this._stepCamp(dt, input);
                if (this.phaseTime >= this.campSeconds) {
                    w.hero.hp = Math.min(w.hero.maxHp, w.hero.hp + 6);
                    this.stage++;
                    this._startMap();
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

    // ------------------------------------------------------------------ the camp
    // screen space: the fire at x 150, the hero sits at 196, his pack at 228; thieves come from the right
    _startCamp() {
        this.p = Phase.Camp; this.phaseTime = 0;
        const n = 2 + (this._rng.nextDouble() < 0.5 ? 1 : 0);
        const thieves = [];
        for (let i = 0; i < n; i++) thieves.push({ t0: 1.0 + i * 1.35 + this._rng.nextDouble() * 0.3, x: 330, st: 0, st0: 0, vx: 0, y: 0 });
        this.camp = { thieves, kickT: -9, gained: 0 };
    }

    _stepCamp(dt, input) {
        const c = this.camp, t = this.phaseTime, w = this.world;
        const kick = input && input.pressed(Pad.A);
        if (kick && t - c.kickT > 0.35) {
            c.kickT = t;
            let hit = false;
            for (const th of c.thieves) {
                if (th.st === 1 && th.x > 206 && th.x < 262) {
                    th.st = 3; th.st0 = t; th.vx = 170;
                    w.pots = Math.min(MAX_POTS, w.pots + 1); w.potsGot++; c.gained++;
                    w.score += 300;
                    hit = true;
                }
            }
            this._cues.emit(hit ? SoundCue.Bonus : SoundCue.Miss);
        }
        for (const th of c.thieves) {
            if (th.st === 0 && t >= th.t0) { th.st = 1; th.st0 = t; }
            if (th.st === 1) {                      // creeping in
                th.x -= 46 * dt;
                if (th.x <= 232) { th.x = 232; th.st = 2; th.st0 = t; }
            } else if (th.st === 2) {               // rummaging in the pack
                if (t - th.st0 > 0.7) { th.st = 4; th.st0 = t; }
                else if (kick && t === c.kickT && th.st === 2) { /* handled below */ }
            } else if (th.st === 3) {               // kicked
                th.x += th.vx * dt; th.y = -Math.max(0, 90 * (t - th.st0) - 180 * (t - th.st0) * (t - th.st0));
            } else if (th.st === 4) {               // got away
                th.x += 110 * dt;
            }
        }
        // a thief in the pack can be kicked too
        if (kick && t === c.kickT) {
            for (const th of c.thieves) {
                if (th.st === 2) {
                    th.st = 3; th.st0 = t; th.vx = 170;
                    w.pots = Math.min(MAX_POTS, w.pots + 1); w.potsGot++; c.gained++; w.score += 300;
                    this._cues.emit(SoundCue.Bonus);
                }
            }
        }
    }

    collectStats(into) {
        const w = this.world;
        if (!w) return;
        add(into, 'stages', this.stagesCleared);
        add(into, 'deaths', w.deaths);
        add(into, 'kills', w.kills);
        add(into, 'magic', w.casts);
        add(into, 'pots', w.potsGot);
        add(into, 'meat', w.meats);
        add(into, 'rides', w.rides);
        add(into, 'throws', w.throws);
        add(into, 'hitsTaken', w.hitsTaken);
        add(into, 'hitsLanded', w.hitsLanded);
        add(into, 'blocks', w.blocks);
    }
}

function add(d, k, v) { d[k] = (d[k] || 0) + v; }

WarlordsRound.Phase = Phase;
