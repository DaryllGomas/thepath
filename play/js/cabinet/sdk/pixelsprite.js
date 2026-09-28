// THE NODE · CABINET ENGINE (JS) · a palette-indexed sprite, authored as text rows (port of Core/PixelSprite.cs).
//
//   PixelSprite.fromRows(
//       "..44..",
//       ".4554.",
//       "..44..");
//
// '.' or ' ' = transparent; '0'-'9' then 'a'-'z' = palette index 0-35. blit() maps each index
// through the game's Palette, so a sprite can never draw an off-palette colour.

export class PixelSprite {
    constructor(width, height) {
        this.width = width; this.height = height;
        this._idx = new Int8Array(width * height).fill(-1);
    }

    at(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
        return this._idx[y * this.width + x];
    }

    set(x, y, paletteIndex) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
        this._idx[y * this.width + x] = paletteIndex;
    }

    static fromRows(...rows) {
        const h = rows.length;
        let w = 0;
        for (let j = 0; j < h; j++) w = Math.max(w, rows[j].length);
        const s = new PixelSprite(w, h);
        for (let j = 0; j < h; j++)
            for (let i = 0; i < rows[j].length; i++) {
                const ch = rows[j].charCodeAt(i);
                const v = ch >= 48 && ch <= 57 ? ch - 48 : ch >= 97 && ch <= 122 ? 10 + ch - 97 : -1;
                if (v >= 0) s.set(i, j, v);
            }
        return s;
    }
}
