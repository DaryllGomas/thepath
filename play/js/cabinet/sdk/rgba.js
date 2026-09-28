// THE NODE · CABINET ENGINE (JS) · core colour type (port of Core/Rgba.cs).
// Immutable. `packed` is R | G<<8 | B<<16 | A<<24 (unsigned), the same number C# Rgba.Packed gives,
// and exactly the little-endian RGBA bytes of a pixel, so PixelSurface fills a Uint32Array with it.
import { f32 } from './num.js';

export class Rgba {
    constructor(r, g, b, a = 255) {
        this.r = r & 255; this.g = g & 255; this.b = b & 255; this.a = a & 255;
        this.packed = (this.r | (this.g << 8) | (this.b << 16) | (this.a << 24)) >>> 0;
        Object.freeze(this);
    }

    // 0xRRGGBB, opaque
    static hex(rgb) { return new Rgba((rgb >>> 16) & 0xFF, (rgb >>> 8) & 0xFF, rgb & 0xFF, 255); }

    static fromPacked(p) { return new Rgba(p & 255, (p >>> 8) & 255, (p >>> 16) & 255, (p >>> 24) & 255); }

    static lerp(a, b, t) {
        t = f32(t);
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const L = (x, y) => Math.trunc(f32(x + f32((y - x) * t))) & 255;
        return new Rgba(L(a.r, b.r), L(a.g, b.g), L(a.b, b.b), L(a.a, b.a));
    }

    equals(o) { return o != null && this.packed === o.packed; }

    toString() {
        const h = v => v.toString(16).toUpperCase().padStart(2, '0');
        return '#' + h(this.r) + h(this.g) + h(this.b);
    }
}

Rgba.Black = new Rgba(0, 0, 0, 255);
Rgba.White = new Rgba(255, 255, 255, 255);
Rgba.Clear = new Rgba(0, 0, 0, 0);
