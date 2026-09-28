// THE NODE · CABINET ENGINE (JS) · THE MERCY RULE (WORLD_1 §8), shared by every cabinet (port of Core/Mercy.cs).
//
//   - Credits and losses are counted PER CABINET ID (the ledger). The browser host (host.js) records
//     the credit on insertCoin() and the loss after a Lost round, as CoinCabinet does in Unity.
//   - Each game declares its difficulty as KNOBS: a base value that eases per round already lost on
//     this cabinet (multiply or add per loss, clamped), optionally snapped on the mercy credit.
//   - The FIFTH credit on a cabinet CANNOT BE LOST. CreditInfo.unlosable is true from that credit on;
//     the sim honours it with its own rule. THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.
//
// Knob values are C# floats: everything here is f32-rounded so the eased values match the C# bit for bit.
import { f32, fmtOpt, F32 } from './num.js';

export class CreditInfo {
    constructor(number = 1, lossesBefore = 0, unlosable = false) {
        this.number = number;                  // 1 = the first coin on this cabinet
        this.lossesBefore = lossesBefore;      // rounds lost on this cabinet before this credit
        this.unlosable = unlosable;            // number >= the unlosable credit (5)
    }

    static make(number, lossesBefore, unlosableAt = Mercy.UnlosableCredit) {
        if (number < 1) number = 1;
        if (lossesBefore < 0) lossesBefore = 0;
        return new CreditInfo(number, lossesBefore, number >= unlosableAt);
    }

    toString() {
        return 'credit ' + this.number + ' losses ' + this.lossesBefore + (this.unlosable ? ' (MERCY: cannot be lost)' : '');
    }
}

// IMercyLedger: { credits(id), losses(id), recordCredit(id), recordLoss(id) }.
// SessionLedger is the in-memory one (Lab, tests, a browser session). A persistent ledger (e.g. on
// localStorage or the save file) only has to implement the same four methods.
export class SessionLedger {
    constructor() { this._credits = new Map(); this._losses = new Map(); }
    credits(id) { return id != null && this._credits.has(id) ? this._credits.get(id) : 0; }
    losses(id) { return id != null && this._losses.has(id) ? this._losses.get(id) : 0; }
    recordCredit(id) { if (id) this._credits.set(id, this.credits(id) + 1); }
    recordLoss(id) { if (id) this._losses.set(id, this.losses(id) + 1); }
}

export const KnobMode = Object.freeze({ Fixed: 0, Multiply: 1, Add: 2 });

export class Knob {
    constructor(name, b, mode, perLoss, note) {
        this.name = name; this.base = f32(b); this.mode = mode; this.perLoss = f32(perLoss); this.note = note || '';
        this.min = -Infinity; this.max = Infinity;
        this.mercyCap = NaN;       // on the unlosable credit: value = min(value, cap)
        this.mercyFloor = NaN;     // on the unlosable credit: value = max(value, floor)
        this.mercySet = NaN;       // on the unlosable credit: value = set
    }

    static fixed(name, value, note) { return new Knob(name, value, KnobMode.Fixed, 0, note); }
    static mul(name, b, perLoss, note) { return new Knob(name, b, KnobMode.Multiply, perLoss, note); }
    static add(name, b, perLoss, note) { return new Knob(name, b, KnobMode.Add, perLoss, note); }

    clamp(min, max) { this.min = f32(min); this.max = f32(max); return this; }
    capOnMercy(v) { this.mercyCap = f32(v); return this; }
    floorOnMercy(v) { this.mercyFloor = f32(v); return this; }
    setOnMercy(v) { this.mercySet = f32(v); return this; }

    resolve(c, baseOverride) {
        const b = baseOverride !== undefined && baseOverride !== null ? f32(baseOverride) : this.base;
        let v = b;
        if (this.mode === KnobMode.Multiply) v = f32(b * f32(Math.pow(this.perLoss, c.lossesBefore)));
        else if (this.mode === KnobMode.Add) v = f32(b + f32(this.perLoss * c.lossesBefore));
        if (v < this.min) v = this.min;
        if (v > this.max) v = this.max;
        if (c.unlosable) {
            if (!Number.isNaN(this.mercySet)) v = this.mercySet;
            if (!Number.isNaN(this.mercyCap) && v > this.mercyCap) v = this.mercyCap;
            if (!Number.isNaN(this.mercyFloor) && v < this.mercyFloor) v = this.mercyFloor;
        }
        return v;
    }

    describe() {
        const n = v => fmtOpt(v, 3, F32);
        let s = this.name + ' = ' + n(this.base);
        if (this.mode === KnobMode.Multiply) s += ' x' + n(this.perLoss) + '/loss';
        else if (this.mode === KnobMode.Add) s += (this.perLoss >= 0 ? ' +' : ' ') + n(this.perLoss) + '/loss';
        if (this.min !== -Infinity || this.max !== Infinity) s += ' [' + n(this.min) + '..' + n(this.max) + ']';
        if (!Number.isNaN(this.mercySet)) s += ', mercy = ' + n(this.mercySet);
        if (!Number.isNaN(this.mercyCap)) s += ', mercy cap ' + n(this.mercyCap);
        if (!Number.isNaN(this.mercyFloor)) s += ', mercy floor ' + n(this.mercyFloor);
        if (this.note.length > 0) s += '  (' + this.note + ')';
        return s;
    }
}

// the resolved knob values handed to sim.reset().  C# k["name"] -> k.get("name") (throws if undeclared);
// C# k.Get("name", fallback) -> k.get("name", fallback)
export class KnobValues {
    constructor() { this._v = new Map(); }

    get(name, fallback) {
        if (this._v.has(name)) return this._v.get(name);
        if (fallback !== undefined) return f32(fallback);
        throw new Error("knob '" + name + "' was not declared in the game's spec");
    }

    set(name, value) { this._v.set(name, f32(value)); }
    has(name) { return this._v.has(name); }
    get names() { return [...this._v.keys()]; }

    toString() {
        const parts = [];
        for (const [k, v] of this._v) parts.push(k + '=' + fmtOpt(v, 3, F32));
        return parts.join(' ');
    }
}

function overrideOf(o, name) {
    if (!o) return undefined;
    if (o instanceof Map) return o.has(name) ? o.get(name) : undefined;
    return Object.prototype.hasOwnProperty.call(o, name) ? o[name] : undefined;
}

export const Mercy = {
    UnlosableCredit: 5,

    // The credit being played now. Call AFTER the ledger recorded this credit (insertCoin does
    // recordCredit first), so credits(id) already counts it.
    fromLedger(ledger, cabinetId, unlosableAt = Mercy.UnlosableCredit) {
        return CreditInfo.make(Math.max(1, ledger.credits(cabinetId)), ledger.losses(cabinetId), unlosableAt);
    },

    // credit N with every earlier credit lost: the curve the Lab reports
    worstCase(creditNumber) { return CreditInfo.make(creditNumber, creditNumber - 1); },

    // baseOverrides (optional Map or object): tuning from the Lab's --knob name=value, applied to the BASE
    resolve(knobs, c, baseOverrides) {
        const kv = new KnobValues();
        if (!knobs) return kv;
        for (const k of knobs) kv.set(k.name, k.resolve(c, overrideOf(baseOverrides, k.name)));
        return kv;
    },
};
