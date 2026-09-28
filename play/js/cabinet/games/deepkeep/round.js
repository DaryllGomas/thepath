// THE NODE · world 1 · THE DEEP KEEP on the Cabinet Engine · THE ROUND (ICabinetSim).
//
// A ROUND = go down `levels` (5) levels. Health, keys, potions and score carry from level to level.
//   each level:  the LEVEL CARD (Intro: number, name, the featured foe and a hint; the map frozen behind)
//                -> the level (Playing)
//   the stairs:  DOWN THE STAIRS + the stairs bonus (Interlude) -> the next card, or the YOU ESCAPED card
//   health 0:    the hero falls (Interlude) -> the GAME OVER card
//   card 3.5 s -> Over. The result is set when the card goes up, never before.
// Score: ghost 10, brute 20, imp 30, warlock 40, a generator 20 a hit + 200 rubble, key 100, potion 50,
// chest 200, a potion-banished wraith 500, the stairs 250 x the level.
//
// INPUT: the stick (8 ways) walks; HOLD A to plant and throw axes the stick's way; B = a potion.
// MERCY: the knobs in spec.js; on the unlosable credit the dungeon's `mercy` rule (no drain, half damage,
// health floor 50, a guide wisp) and, while the stick is let go, the autopilot walks the guide path and
// throws at whatever blocks it.
import { CabinetState, RoundResult, SoundCue, CueBuffer, Pad, fmt } from '../../sdk/index.js';
import { Dungeon, Outcome, dirOf } from './dungeon.js';
import { LEVELS } from './levels.js';

const Phase = Object.freeze({ Idle: 0, Card: 1, Running: 2, Stairs: 3, Fallen: 4, Result: 5, Over: 6 });

export class DeepKeepRound {
    constructor() {
        // the machine's timing (not mercy knobs)
        this.cardSeconds = 2.6;
        this.stairsSeconds = 2.2;
        this.fallenSeconds = 2.4;
        this.resultSeconds = 3.5;
        this.levels = 5;
        this.stairsBonus = 250;

        // read-only state
        this.dungeon = null;
        this.p = Phase.Idle;
        this.phaseTime = 0;
        this.levelsCleared = 0;
        this.lastBonus = 0;
        this.credit = null;
        this.startHealth = 700;

        this._cues = new CueBuffer();
        this._result = RoundResult.None;
        this._time = 0;
        this._log = '';
        this._intent = { mx: 0, my: 0, fire: false, potion: false };
    }

    get mercyActive() { return this.credit != null && this.credit.unlosable; }
    get roundWon() { return this._result === RoundResult.Won; }
    get level() { return this.dungeon ? this.dungeon.levelIdx + 1 : 1; }
    get levelDef() { return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, this.level - 1))]; }

    // ------------------------------------------------------------------ ICabinetSim
    get state() {
        switch (this.p) {
            case Phase.Card: return CabinetState.Intro;
            case Phase.Running: return CabinetState.Playing;
            case Phase.Stairs: case Phase.Fallen: return CabinetState.Interlude;
            case Phase.Result: return CabinetState.Card;
            case Phase.Over: return CabinetState.Over;
            default: return CabinetState.Idle;
        }
    }
    get result() { return this._result; }
    get score() { return this.dungeon ? this.dungeon.score : 0; }
    get lives() { return this.dungeon && this.dungeon.hero.hp > 0 ? 1 : 0; }
    get time() { return this._time; }
    get cues() { return this._cues; }

    get summary() {
        const r = this._result === RoundResult.Won ? 'WON' : this._result === RoundResult.Lost ? 'LOST' : 'UNDECIDED';
        const d = this.dungeon, s = d ? d.st : null;
        return r + ' levels ' + this.levelsCleared + '/' + this.levels + ' score ' + this.score + ' ' + fmt(this._time, 1) + 's' +
            (s ? ' kills ' + s.kills + ' gens ' + s.gensBroken + ' potions ' + s.potions + ' food ' + s.food + ' hp ' + Math.ceil(d.hero.hp) : '') +
            ' | ' + this._log.trimEnd();
    }

    reset(seed, credit, k) {
        this.credit = credit;
        const d = this.dungeon = new Dungeon(seed);
        d.cues = this._cues;
        d.heroSpeed = k.get('heroSpeed', 70);
        d.drain = credit.unlosable ? 0 : k.get('drain', 2.6);
        d.damage = k.get('damage', 1);
        d.spawnEvery = k.get('spawnEvery', 2.3);
        d.maxMonsters = Math.max(8, Math.round(k.get('maxMonsters', 44)));
        d.foodValue = Math.round(k.get('foodValue', 100));
        d.brood = Math.round(k.get('brood', 4));
        d.mercy = credit.unlosable;
        this.levels = Math.max(1, Math.min(LEVELS.length, Math.round(k.get('levels', 5))));
        this.startHealth = Math.round(k.get('health', 700));
        d.newGame(this.startHealth, Math.max(0, Math.floor(k.get('potions', 1) + 0.001)));
        this.levelsCleared = 0; this.lastBonus = 0;
        this._time = 0; this._log = '';
        this._result = RoundResult.None;
        this._cues.resetTotals();
        this._startLevel(0);
    }

    _startLevel(idx) {
        this.dungeon.loadLevel(idx);
        this.p = Phase.Card; this.phaseTime = 0;
        this._cues.emit(SoundCue.Tick);
    }

    step(dt, input) {
        if (this.p === Phase.Idle || this.p === Phase.Over) return;
        if (dt > 0.1) dt = 0.1;
        if (!(dt > 0)) return;
        this._time += dt;
        this.phaseTime += dt;
        const d = this.dungeon;

        switch (this.p) {
            case Phase.Card:
                if (this.phaseTime >= this.cardSeconds) { this.p = Phase.Running; this.phaseTime = 0; this._cues.emit(SoundCue.Start); }
                break;
            case Phase.Running: {
                const it = this._read(input);
                const o = d.tick(dt, it);
                if (o === Outcome.Exit) {
                    this.levelsCleared++;
                    this.lastBonus = this.stairsBonus * this.level;
                    d.score += this.lastBonus;
                    this._cues.emit(SoundCue.Bonus);
                    this._log += 'L' + this.level + '@' + fmt(d.levelTime, 0) + 's/' + Math.ceil(d.hero.hp) + ' ';
                    this.p = Phase.Stairs; this.phaseTime = 0;
                } else if (o === Outcome.Dead) {
                    this._cues.emit(SoundCue.Die);
                    this._log += 'X' + this.level + '@' + fmt(d.levelTime, 0) + 's ';
                    this.p = Phase.Fallen; this.phaseTime = 0;
                }
                break;
            }
            case Phase.Stairs:
                if (this.phaseTime >= this.stairsSeconds) {
                    if (this.levelsCleared >= this.levels) this._card(RoundResult.Won);
                    else this._startLevel(this.levelsCleared);
                }
                break;
            case Phase.Fallen:
                if (this.phaseTime >= this.fallenSeconds) this._card(RoundResult.Lost);
                break;
            case Phase.Result:
                if (this.phaseTime >= this.resultSeconds) this.p = Phase.Over;
                break;
        }
    }

    _card(r) {
        this._result = r;
        this.p = Phase.Result; this.phaseTime = 0;
        if (r === RoundResult.Won) this._cues.emit(SoundCue.Win);
    }

    // the panel -> what the hero does this step
    _read(input) {
        const it = this._intent;
        it.mx = 0; it.my = 0; it.fire = false; it.potion = false;
        if (input != null) {
            const l = input.held(Pad.Left), r = input.held(Pad.Right), u = input.held(Pad.Up), dn = input.held(Pad.Down);
            it.mx = r && !l ? 1 : l && !r ? -1 : 0;
            it.my = dn && !u ? 1 : u && !dn ? -1 : 0;
            it.fire = input.held(Pad.A);
            it.potion = input.pressed(Pad.B);
        }
        const d = this.dungeon;
        if (this.mercyActive && it.mx === 0 && it.my === 0 && !it.fire && !it.potion) {
            const a = d.autopilot();
            if (a) {
                if (d.hero.stuck > 0.3) { it.fire = true; d.hero.face = dirOf(a.mx, a.my); }   // something in the way: throw at it
                else { it.mx = a.mx; it.my = a.my; }
            }
        }
        return it;
    }

    collectStats(into) {
        const d = this.dungeon;
        if (!d) return;
        const s = d.st;
        add(into, 'levels', this.levelsCleared);
        add(into, 'kills', s.kills);
        add(into, 'gens', s.gensBroken);
        add(into, 'potions', s.potions);
        add(into, 'food', s.food);
        add(into, 'jugsSmashed', s.jugsSmashed);
        add(into, 'dmgTaken', s.dmg);
        add(into, 'drained', s.drained);
        add(into, 'wraithDrain', s.wraithDrain);
        add(into, 'ghostHits', s.ghostHits);
        add(into, 'boltsHit', s.boltsHit);
    }
}

function add(o, k, v) { o[k] = (o[k] || 0) + v; }

DeepKeepRound.Phase = Phase;
