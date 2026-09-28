// THE NODE · CABINET ENGINE (JS) · a cabinet's palette (port of Core/Palette.cs).
//
// 1982-88 boards drew from a small fixed palette; so do ours. A renderer takes every colour it
// uses from its game's Palette (by index or by name) and CabinetChecks fails any frame with an
// off-palette pixel. Fades step through darker palette entries, never blend.
// The five ROLES are what the shared screens (AttractMode, high scores, TextBox plates) use.
//
//   new Palette(["bg", 0x030510], ["grid", 0x1650AA], ...).roles("bg", "hud", "magenta", "cyan", "magentaDim")
//   pal.get("bg") / pal.get(0)      (C#: pal["bg"] / pal[0])
import { Rgba } from './rgba.js';

export class Palette {
    constructor(...entries) {
        this._colors = [];
        this._names = [];
        this._byName = new Map();
        this._members = new Set();
        for (let i = 0; i < entries.length; i++) {
            const [name, rgb] = entries[i];
            const c = Rgba.hex(rgb);
            this._colors.push(c);
            this._names.push(name);
            this._byName.set(name, i);
            this._members.add(c.packed);
        }
        this.backgroundIndex = 0; this.textIndex = 0; this.accentIndex = 0; this.highlightIndex = 0; this.dimIndex = 0;
    }

    get count() { return this._colors.length; }

    roles(background, text, accent, highlight, dim) {
        this.backgroundIndex = this.indexOf(background); this.textIndex = this.indexOf(text);
        this.accentIndex = this.indexOf(accent); this.highlightIndex = this.indexOf(highlight);
        this.dimIndex = this.indexOf(dim);
        return this;
    }

    get background() { return this._colors[this.backgroundIndex]; }
    get text() { return this._colors[this.textIndex]; }
    get accent() { return this._colors[this.accentIndex]; }
    get highlight() { return this._colors[this.highlightIndex]; }
    get dim() { return this._colors[this.dimIndex]; }

    at(i) { return this._colors[i]; }
    get(nameOrIndex) { return typeof nameOrIndex === 'number' ? this._colors[nameOrIndex] : this._colors[this.indexOf(nameOrIndex)]; }
    nameOf(i) { return this._names[i]; }

    indexOf(name) {
        const i = this._byName.get(name);
        if (i === undefined) throw new Error("palette has no colour named '" + name + "'");
        return i;
    }

    contains(c) { return this._members.has(c.packed); }
    containsPacked(p) { return this._members.has(p >>> 0); }
}
