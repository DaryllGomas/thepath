// THE NODE · CABINET ENGINE (JS) · the screen a cabinet game draws on (port of Core/IPixelSurface.cs,
// Core/PixelSurface.cs and Core/SurfaceDraw.cs).
//
// A 320x240 (by default) RGBA8 buffer, row 0 = the TOP of the tube, y grows DOWN. `data` is a
// Uint8ClampedArray(w*h*4), so the browser can wrap it directly:  new ImageData(surface.data, 320, 240)
// (the ImageData shares the buffer: redraw the surface, putImageData again, no copy). For a three.js
// DataTexture remember row 0 is the top (flip the texture or the UVs once).
// Every primitive honours the clip rect. All coordinates are integers (C# ints): pass whole numbers.
//
// SurfaceDraw (C# extension methods) are installed as methods, so C# `s.TextCentered(...)` ports to
// `s.textCentered(...)`. SurfaceDraw.blink(t, hz) is the 1 Hz INSERT COIN clock.
import { f32, idiv } from './num.js';
import { Rgba } from './rgba.js';

export class PixelSurface {
    constructor(width = PixelSurface.ScreenW, height = PixelSurface.ScreenH) {
        this.width = width; this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
        this._u32 = new Uint32Array(this.data.buffer, this.data.byteOffset, width * height);   // little-endian RGBA
        this.noClip();
    }

    get pixels() { return this.data; }                       // C# Pixels

    clip(x, y, cw, ch) {
        this._cx0 = Math.max(0, x); this._cy0 = Math.max(0, y);
        this._cx1 = Math.min(this.width, x + cw); this._cy1 = Math.min(this.height, y + ch);
    }

    noClip() { this._cx0 = 0; this._cy0 = 0; this._cx1 = this.width; this._cy1 = this.height; }

    clear(c) { this._u32.fill(c.packed); }

    setPixel(x, y, c) {
        if (x < this._cx0 || y < this._cy0 || x >= this._cx1 || y >= this._cy1) return;
        this._u32[y * this.width + x] = c.packed;
    }

    getPixel(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return Rgba.Clear;
        return Rgba.fromPacked(this._u32[y * this.width + x]);
    }

    getPacked(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
        return this._u32[y * this.width + x];
    }

    rect(x, y, rw, rh, c) {
        const x0 = Math.max(this._cx0, x), y0 = Math.max(this._cy0, y);
        const x1 = Math.min(this._cx1, x + rw), y1 = Math.min(this._cy1, y + rh);
        if (x1 <= x0) return;
        const p = c.packed, w = this.width, u = this._u32;
        for (let j = y0; j < y1; j++) u.fill(p, j * w + x0, j * w + x1);
    }

    frame(x, y, rw, rh, c) {
        this.rect(x, y, rw, 1, c); this.rect(x, y + rh - 1, rw, 1, c);
        this.rect(x, y, 1, rh, c); this.rect(x + rw - 1, y, 1, rh, c);
    }

    // 50% dither: the arcade's only "transparency"
    checker(x, y, rw, rh, c, phase) {
        for (let j = y; j < y + rh; j++)
            for (let k = x; k < x + rw; k++)
                if (((k + j + phase) & 1) === 0) this.setPixel(k, j, c);
    }

    // Bresenham
    line(x0, y0, x1, y1, c) {
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy, guard = 0;
        while (guard++ < 4096) {
            this.setPixel(x0, y0, c);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    // midpoint circle; filled = horizontal spans
    circle(ccx, ccy, r, c, fill) {
        if (r <= 0) { this.setPixel(ccx, ccy, c); return; }
        let x = r, y = 0, err = 1 - r;
        while (x >= y) {
            if (fill) {
                this.rect(ccx - x, ccy + y, 2 * x + 1, 1, c); this.rect(ccx - x, ccy - y, 2 * x + 1, 1, c);
                this.rect(ccx - y, ccy + x, 2 * y + 1, 1, c); this.rect(ccx - y, ccy - x, 2 * y + 1, 1, c);
            } else {
                this.setPixel(ccx + x, ccy + y, c); this.setPixel(ccx - x, ccy + y, c); this.setPixel(ccx + x, ccy - y, c); this.setPixel(ccx - x, ccy - y, c);
                this.setPixel(ccx + y, ccy + x, c); this.setPixel(ccx - y, ccy + x, c); this.setPixel(ccx + y, ccy - x, c); this.setPixel(ccx - y, ccy - x, c);
            }
            y++;
            if (err < 0) err += 2 * y + 1;
            else { x--; err += 2 * (y - x) + 1; }
        }
    }

    blit(s, x, y, palette, scale = 1, flipX = false) {
        if (s == null || palette == null) return;
        if (scale < 1) scale = 1;
        for (let j = 0; j < s.height; j++)
            for (let i = 0; i < s.width; i++) {
                const v = s.at(flipX ? s.width - 1 - i : i, j);
                if (v < 0 || v >= palette.count) continue;
                if (scale === 1) this.setPixel(x + i, y + j, palette.at(v));
                else this.rect(x + i * scale, y + j * scale, scale, scale, palette.at(v));
            }
    }

    blitTinted(s, x, y, tint, scale = 1, flipX = false) {
        if (s == null) return;
        if (scale < 1) scale = 1;
        for (let j = 0; j < s.height; j++)
            for (let i = 0; i < s.width; i++) {
                if (s.at(flipX ? s.width - 1 - i : i, j) < 0) continue;
                if (scale === 1) this.setPixel(x + i, y + j, tint);
                else this.rect(x + i * scale, y + j * scale, scale, scale, tint);
            }
    }

    // returns the drawn width
    text(s, x, y, font, c, scale = 1) {
        if (!s || font == null) return 0;
        if (scale < 1) scale = 1;
        for (let k = 0; k < s.length; k++) {
            const g = font.glyph(s[k]);
            if (g !== null)
                for (let row = 0; row < font.cellH; row++) {
                    const bits = g[row];
                    if (bits === 0) continue;
                    for (let col = 0; col < font.cellW; col++)
                        if ((bits & (1 << (font.cellW - 1 - col))) !== 0) {
                            if (scale === 1) this.setPixel(x + col, y + row, c);
                            else this.rect(x + col * scale, y + row * scale, scale, scale, c);
                        }
                }
            x += font.advance * scale;
        }
        return font.measure(s, scale);
    }

    // ------------------------------------------------------------------ SurfaceDraw (C# extension methods)
    textCentered(text, cx, y, f, c, scale = 1) {
        return this.text(text, cx - idiv(f.measure(text, scale), 2), y, f, c, scale);
    }

    textRight(text, right, y, f, c, scale = 1) {
        return this.text(text, right - f.measure(text, scale), y, f, c, scale);
    }

    // a hard drop shadow one font-pixel down-right: how 1982 made text read over busy play
    textShadow(text, x, y, f, c, shadow, scale = 1) {
        this.text(text, x + scale, y + scale, f, shadow, scale);
        this.text(text, x, y, f, c, scale);
    }

    textCenteredShadow(text, cx, y, f, c, shadow, scale = 1) {
        this.textShadow(text, cx - idiv(f.measure(text, scale), 2), y, f, c, shadow, scale);
    }

    // two-tone title lettering: glyph rows above `splitRow` in `top`, the rest in `bottom`
    textTwoTone(text, x, y, f, top, bottom, splitRow, scale = 1) {
        for (let k = 0; k < text.length; k++) {
            const g = f.glyph(text[k]);
            if (g !== null)
                for (let row = 0; row < f.cellH; row++) {
                    const c = row < splitRow ? top : bottom;
                    for (let col = 0; col < f.cellW; col++)
                        if ((g[row] & (1 << (f.cellW - 1 - col))) !== 0)
                            this.rect(x + col * scale, y + row * scale, scale, scale, c);
                }
            x += f.advance * scale;
        }
    }

    // a plate with a double border and centred text on it (the round cards, DEREZZED, WAVE 2...)
    textBox(text, cx, y, f, scale, fg, border, bg) {
        const w = f.measure(text, scale), h = f.height(scale);
        const hw = idiv(w, 2);
        this.rect(cx - hw - 6, y - 6, w + 12, h + 12, bg);
        this.frame(cx - hw - 6, y - 6, w + 12, h + 12, border);
        this.frame(cx - hw - 4, y - 4, w + 8, h + 8, border);
        this.textCentered(text, cx, y, f, fg, scale);
    }

    plate(x, y, w, h, bg, border) {
        this.rect(x, y, w, h, bg);
        this.frame(x, y, w, h, border);
    }

    dottedRule(x0, x1, y, step, c) {
        for (let x = x0; x < x1; x += step) this.setPixel(x, y, c);
    }
}

PixelSurface.ScreenW = 320;
PixelSurface.ScreenH = 240;
PixelSurface.SafeMargin = 8;

export const SurfaceDraw = {
    // 1 Hz on/off (0.5 s each): the INSERT COIN rate. Far below the 3-30 Hz strobe band.
    blink(t, hz = 1) {
        const phase = f32(f32(t) * f32(hz));
        return f32(phase - Math.floor(phase)) < 0.5;
    },
};
