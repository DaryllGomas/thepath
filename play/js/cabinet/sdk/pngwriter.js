// THE NODE · CABINET ENGINE (JS) · a minimal PNG encoder, no libraries (port of Core/PngWriter.cs).
//
// Palette-limited frames (<= 256 colours) are written as 8-bit INDEXED PNGs, anything else as RGBA.
// zlib-wrapped DEFLATE with fixed Huffman codes and a small LZ77 matcher (previous pixel, the row
// above, a one-slot hash of the last 3 bytes). Returns a Uint8Array. Pure JS: no DOM, no Node APIs
// (the Lab writes the bytes with fs; a browser could make a Blob of them).

export const PngWriter = {
    encode(s) { return PngWriter.encodeRgba(s.data, s.width, s.height); },

    encodeRgba(rgba, w, h) {
        // ---- palette?
        const map = new Map();
        const order = [];
        let indexed = true, alpha = false;
        for (let i = 0; i < w * h; i++) {
            const k = (rgba[i * 4] | (rgba[i * 4 + 1] << 8) | (rgba[i * 4 + 2] << 16) | (rgba[i * 4 + 3] << 24)) >>> 0;
            if (rgba[i * 4 + 3] !== 255) alpha = true;
            if (indexed && !map.has(k)) {
                if (map.size === 256) indexed = false;
                else { map.set(k, map.size); order.push(k); }
            }
        }

        const bpp = indexed ? 1 : 4;
        const stride = w * bpp + 1;
        const raw = new Uint8Array(stride * h);
        for (let y = 0; y < h; y++) {
            let o = y * stride;
            raw[o++] = 0;                              // filter: none
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                if (indexed) {
                    const k = (rgba[i] | (rgba[i + 1] << 8) | (rgba[i + 2] << 16) | (rgba[i + 3] << 24)) >>> 0;
                    raw[o++] = map.get(k);
                } else { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; raw[o++] = rgba[i + 3]; }
            }
        }

        const png = new ByteList(8192);
        png.addAll([137, 80, 78, 71, 13, 10, 26, 10]);
        const ihdr = new Uint8Array(13);
        be(ihdr, 0, w); be(ihdr, 4, h);
        ihdr[8] = 8; ihdr[9] = indexed ? 3 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        chunk(png, 'IHDR', ihdr);
        if (indexed) {
            const plte = new Uint8Array(order.length * 3);
            const trns = new Uint8Array(order.length);
            for (let i = 0; i < order.length; i++) {
                plte[i * 3] = order[i] & 0xFF; plte[i * 3 + 1] = (order[i] >>> 8) & 0xFF; plte[i * 3 + 2] = (order[i] >>> 16) & 0xFF;
                trns[i] = order[i] >>> 24;
            }
            chunk(png, 'PLTE', plte);
            if (alpha) chunk(png, 'tRNS', trns);
        }
        chunk(png, 'IDAT', PngWriter.zlib(raw, stride));
        chunk(png, 'IEND', new Uint8Array(0));
        return png.toArray();
    },

    crc32(d) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < d.length; i++) crc = CRC[(crc ^ d[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    // ------------------------------------------------------------------ zlib / deflate (fixed Huffman)
    zlib(data, rowStride = 0) {
        const b = new Bits();
        b.out.add(0x78); b.out.add(0x01);
        b.put(1, 1); b.put(1, 2);                      // BFINAL = 1, BTYPE = 01 (fixed Huffman)
        const HashSize = 1 << 15, Window = 32768;
        const head = new Int32Array(HashSize).fill(-1);
        const n = data.length;
        let p = 0;
        const best = { len: 0, dist: 0 };
        while (p < n) {
            best.len = 0; best.dist = 0;
            if (p + 3 <= n) {
                const hh = ((data[p] << 10) ^ (data[p + 1] << 5) ^ data[p + 2]) & (HashSize - 1);
                const c0 = p - 1, c1 = rowStride > 0 ? p - rowStride : -1, c2 = head[hh];
                tryMatch(data, p, c0, best, Window);
                tryMatch(data, p, c1, best, Window);
                tryMatch(data, p, c2, best, Window);
                head[hh] = p;
            }
            if (best.len >= 3) {
                match(b, best.len, best.dist);
                for (let k = 1; k < best.len; k++) {
                    const q = p + k;
                    if (q + 3 <= n) head[((data[q] << 10) ^ (data[q + 1] << 5) ^ data[q + 2]) & (HashSize - 1)] = q;
                }
                p += best.len;
            } else { lit(b, data[p]); p++; }
        }
        lit(b, 256);                                   // end of block
        b.flush();
        let a1 = 1, a2 = 0;
        for (let i = 0; i < n; i++) { a1 = (a1 + data[i]) % 65521; a2 = (a2 + a1) % 65521; }
        b.out.add((a2 >>> 8) & 0xFF); b.out.add(a2 & 0xFF); b.out.add((a1 >>> 8) & 0xFF); b.out.add(a1 & 0xFF);
        return b.out.toArray();
    },
};

// ------------------------------------------------------------------ helpers
class ByteList {
    constructor(cap = 4096) { this.buf = new Uint8Array(cap); this.length = 0; }
    add(v) {
        if (this.length === this.buf.length) { const nb = new Uint8Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
        this.buf[this.length++] = v;
    }
    addAll(arr) { for (let i = 0; i < arr.length; i++) this.add(arr[i]); }
    toArray() { return this.buf.slice(0, this.length); }
}

function be(b, o, v) { b[o] = (v >>> 24) & 255; b[o + 1] = (v >>> 16) & 255; b[o + 2] = (v >>> 8) & 255; b[o + 3] = v & 255; }

function chunk(png, type, data) {
    const len = new Uint8Array(4); be(len, 0, data.length);
    png.addAll(len);
    const td = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) td[i] = type.charCodeAt(i);
    td.set(data, 4);
    png.addAll(td);
    const crc = new Uint8Array(4); be(crc, 0, PngWriter.crc32(td));
    png.addAll(crc);
}

const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? (0xEDB88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

const LenBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LenExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DistBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DistExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

class Bits {
    constructor() { this.out = new ByteList(4096); this.acc = 0; this.n = 0; }
    put(v, count) {
        this.acc = (this.acc | (v << this.n)) >>> 0; this.n += count;
        while (this.n >= 8) { this.out.add(this.acc & 0xFF); this.acc >>>= 8; this.n -= 8; }
    }
    putRev(code, len) { let r = 0; for (let i = 0; i < len; i++) { r = (r << 1) | (code & 1); code >>>= 1; } this.put(r, len); }
    flush() { if (this.n > 0) { this.out.add(this.acc & 0xFF); this.acc = 0; this.n = 0; } }
}

function lit(b, v) {
    if (v <= 143) b.putRev(0x30 + v, 8);
    else if (v <= 255) b.putRev(0x190 + v - 144, 9);
    else if (v <= 279) b.putRev(v - 256, 7);
    else b.putRev(0xC0 + v - 280, 8);
}

function match(b, len, dist) {
    let li = len === 258 ? 28 : 27;
    while (LenBase[li] > len) li--;
    lit(b, 257 + li);
    if (LenExtra[li] > 0) b.put(len - LenBase[li], LenExtra[li]);
    let di = 29;
    while (DistBase[di] > dist) di--;
    b.putRev(di, 5);
    if (DistExtra[di] > 0) b.put(dist - DistBase[di], DistExtra[di]);
}

function tryMatch(d, p, c, best, maxDist) {
    if (c < 0 || c >= p || p - c > maxDist) return;
    const max = Math.min(258, d.length - p);
    let len = 0;
    while (len < max && d[c + len] === d[p + len]) len++;
    if (len > best.len) { best.len = len; best.dist = p - c; }
}
