// THE NODE · CABINET ENGINE (JS) · the control panel: one stick, buttons A and B, START (port of Core/CabinetInput.cs).
//
// Whatever is at the panel (the player's keys, a bot) produces one InputFrame per step: the stick as
// x/y in -1..1 (+y = stick pushed UP, toward the top of the tube) and the three buttons as HELD
// states. CabinetInput.latch() keeps this frame and the last one, so a sim can ask for held (is it
// down) or pressed / released (did it change this step). Edges are derived here, never by the sim.
//
// Screen directions for 4-way games use Dir4: Up=0, Right=1, Down=2, Left=3 (clockwise), with
// dy in SCREEN space (y down).
//
// An InputFrame is { x, y, a, b, start }. Plain objects of that shape are accepted everywhere
// (latch() copies them), so a host can pass { x: 0, y: 1, a: false, b: false, start: false }.
import { f32 } from './num.js';

export const Pad = Object.freeze({ Up: 0, Down: 1, Left: 2, Right: 3, A: 4, B: 5, Start: 6 });

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const Dir4 = Object.freeze({
    None: -1, Up: 0, Right: 1, Down: 2, Left: 3,
    dx(d) { return DX[d & 3]; },
    dy(d) { return DY[d & 3]; },
    reverse(d) { return (d + 2) & 3; },
    turnLeft(d) { return (d + 3) & 3; },
    turnRight(d) { return (d + 1) & 3; },
    toPad(d) { return d === 0 ? Pad.Up : d === 1 ? Pad.Right : d === 2 ? Pad.Down : Pad.Left; },
});

export class InputFrame {
    constructor(x = 0, y = 0, a = false, b = false, start = false) {
        this.x = f32(x); this.y = f32(y); this.a = !!a; this.b = !!b; this.start = !!start;
    }

    static get neutral() { return new InputFrame(); }

    static stick(dir4) {
        const f = new InputFrame();
        if (dir4 === Dir4.Up) f.y = 1;
        else if (dir4 === Dir4.Down) f.y = -1;
        else if (dir4 === Dir4.Right) f.x = 1;
        else if (dir4 === Dir4.Left) f.x = -1;
        return f;
    }

    // a copy of any { x, y, a, b, start } (missing fields = neutral)
    static from(o) {
        if (o == null) return new InputFrame();
        return new InputFrame(+o.x || 0, +o.y || 0, !!o.a, !!o.b, !!o.start);
    }

    clone() { return new InputFrame(this.x, this.y, this.a, this.b, this.start); }

    digital(p) { return InputFrame.digitalOf(this, p); }

    static digitalOf(f, p) {
        const T = InputFrame.Threshold;
        switch (p) {
            case Pad.Up: return f.y > T;
            case Pad.Down: return f.y < -T;
            case Pad.Left: return f.x < -T;
            case Pad.Right: return f.x > T;
            case Pad.A: return f.a;
            case Pad.B: return f.b;
            default: return f.start;
        }
    }

    get any() {
        const T = InputFrame.Threshold;
        return this.a || this.b || this.start || this.x > T || this.x < -T || this.y > T || this.y < -T;
    }

    toString() {
        return 'x' + this.x.toFixed(1) + ' y' + this.y.toFixed(1) + (this.a ? ' A' : '') + (this.b ? ' B' : '') + (this.start ? ' START' : '');
    }
}

// an analogue stick counts as a digital direction past this
InputFrame.Threshold = 0.5;

export class CabinetInput {
    constructor() { this._cur = new InputFrame(); this._prev = new InputFrame(); }

    get current() { return this._cur; }
    get previous() { return this._prev; }

    // one call per sim step, before step()
    latch(f) { this._prev = this._cur; this._cur = InputFrame.from(f); }

    // both frames neutral: nothing held carries into a new round
    clear() { this._cur = new InputFrame(); this._prev = new InputFrame(); }

    get x() { return this._cur.x; }
    get y() { return this._cur.y; }

    held(p) { return this._cur.digital(p); }
    pressed(p) { return this._cur.digital(p) && !this._prev.digital(p); }
    released(p) { return !this._cur.digital(p) && this._prev.digital(p); }

    // the newly pressed screen direction this step (Up, Right, Down, Left checked in that order), or -1
    pressedDir4() {
        for (let d = 0; d < 4; d++) if (this.pressed(Dir4.toPad(d))) return d;
        return Dir4.None;
    }

    // the held direction on the dominant axis, or -1
    heldDir4() {
        const c = this._cur;
        const ax = c.x < 0 ? -c.x : c.x, ay = c.y < 0 ? -c.y : c.y;
        if (ax <= InputFrame.Threshold && ay <= InputFrame.Threshold) return Dir4.None;
        if (ay >= ax) return c.y > 0 ? Dir4.Up : Dir4.Down;
        return c.x > 0 ? Dir4.Right : Dir4.Left;
    }
}
