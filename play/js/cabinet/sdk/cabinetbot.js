// THE NODE · CABINET ENGINE (JS) · pilots (port of Core/ICabinetBot.cs).
//
// A bot plays a sim through exactly what a player has: one InputFrame per step. It may READ the sim
// but must never write to it. Every game ships one: the Lab measures the game with it, the attract
// demo is it.
//
// CabinetBotBase gives a bot its own seeded SystemRandom (`this.rng`; never share the sim's) and
// tap(dir4): a one-step stick press guaranteed to register as an EDGE even if the previous step held
// the same direction (it inserts a release first). Subclasses implement get name() and think(sim, dt).
// RandomPilot is the fallback when a game has no bot of its own.
import { f32 } from './num.js';
import { SystemRandom } from './rng.js';
import { InputFrame, Dir4 } from './cabinetinput.js';

export class CabinetBotBase {
    constructor() {
        this.rng = new SystemRandom(1);
        this._last = new InputFrame();
        this._queued = [];
    }

    get name() { return 'bot'; }

    reset(seed) {
        this.rng = new SystemRandom(seed === 0 ? (Date.now() | 0) : seed);
        this._last = new InputFrame();
        this._queued.length = 0;
    }

    drive(sim, dt) {
        const f = this._queued.length > 0 ? this._queued.shift() : this.think(sim, f32(dt));
        this._last = f;
        return f;
    }

    think(sim, dt) { throw new Error('think() not implemented'); }

    get lastFrame() { return this._last; }

    // press a screen direction for one step, as a fresh edge
    tap(dir4) {
        const f = InputFrame.stick(dir4);
        if (this._last.digital(Dir4.toPad(dir4))) { this._queued.push(f); return InputFrame.neutral; }
        return f;
    }

    tapA() {
        const f = new InputFrame(0, 0, true);
        if (this._last.a) { this._queued.push(f); return InputFrame.neutral; }
        return f;
    }

    chance(p) { return this.rng.nextDouble() < p; }
    range(a, b) { a = f32(a); b = f32(b); return f32(a + f32(f32(b - a) * f32(this.rng.nextDouble()))); }
}

export class RandomPilot extends CabinetBotBase {
    constructor() {
        super();
        this.minHold = f32(0.15); this.maxHold = f32(0.8);
        this.neutralChance = f32(0.25);
        this.aPerSecond = f32(2.5); this.bPerSecond = f32(0.3);
        this._hold = new InputFrame();
        this._holdLeft = 0;
    }

    get name() { return 'random-pilot'; }

    reset(seed) { super.reset(seed); this._holdLeft = 0; this._hold = new InputFrame(); }

    think(sim, dt) {
        this._holdLeft = f32(this._holdLeft - dt);
        if (this._holdLeft <= 0) {
            this._holdLeft = this.range(this.minHold, this.maxHold);
            this._hold = this.chance(this.neutralChance) ? InputFrame.neutral : InputFrame.stick(this.rng.next(4));
            if (this.chance(0.2)) this._hold.x = this.chance(0.5) ? 1 : -1;   // sometimes a diagonal
        }
        const f = this._hold.clone();                                          // C# struct copy
        f.a = !this.lastFrame.a && this.chance(f32(this.aPerSecond * dt));
        f.b = !this.lastFrame.b && this.chance(f32(this.bPerSecond * dt));
        return f;
    }
}
