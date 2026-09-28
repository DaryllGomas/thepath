// THE NODE · CABINET ENGINE (JS) · sound, as SLOTS (port of Core/SoundCue.cs).
//
// A sim never plays audio. It emits cues into its CueBuffer; the host drains the buffer once per
// frame and maps each cue to a recording (sound is recordings, never synthesis). Headless, the Lab
// just counts them. SoundCueNames[c] is the name the browser host hands out ('Coin', 'Start', ...).

export const SoundCue = Object.freeze({ Coin: 0, Start: 1, Hit: 2, Miss: 3, Die: 4, Win: 5, Bonus: 6, Tick: 7 });
export const SoundCueNames = Object.freeze(['Coin', 'Start', 'Hit', 'Miss', 'Die', 'Win', 'Bonus', 'Tick']);

export class CueBuffer {
    constructor() { this._pending = []; this._totals = new Int32Array(CueBuffer.Kinds); }

    get count() { return this._pending.length; }
    at(i) { return this._pending[i]; }

    emit(c) { this._pending.push(c); this._totals[c]++; }

    // the host calls this after playing (or counting) what was pending
    clear() { this._pending.length = 0; }

    // every cue emitted since resetTotals (the Lab's per-round tally)
    total(c) { return this._totals[c]; }
    resetTotals() { this._totals.fill(0); this._pending.length = 0; }
}

CueBuffer.Kinds = 8;
