// THE NODE · the cabinet with no name · GLYPHS: the node symbols and a vector stroke font, as polylines.
// Pure data + tiny helpers; both renderers (canvas and the Lab's pixel surface) draw from here.
//
// SYMBOL(name) -> [[x, y, x, y, ...], ...] polylines in a unit box (radius ~1, y down). Each symbol has a distinct
// silhouette at 14 px: diamond (tall), triangle (point up), circle (with its centre dot), square, hexagon (with
// the cube's three inner edges), pentagon (point up), spiral (two turns).
// The font is a 4 x 6 grid vector font in the spirit of the 1979-81 vector monitors (advance 6 units).

const TAU = Math.PI * 2;

function ngon(n, r, rot) {
    const p = [];
    for (let i = 0; i <= n; i++) { const a = rot + (i % n) * TAU / n; p.push(r * Math.cos(a), r * Math.sin(a)); }
    return p;
}
function circle(r, seg = 20, cx = 0, cy = 0) {
    const p = [];
    for (let i = 0; i <= seg; i++) { const a = (i % seg) * TAU / seg; p.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    return p;
}

export const SYMBOL_LINES = Object.freeze({
    diamond: [[0, -1.05, 0.72, 0, 0, 1.05, -0.72, 0, 0, -1.05]],
    triangle: [[0, -1.0, 0.92, 0.62, -0.92, 0.62, 0, -1.0]],
    circle: [circle(0.86, 22), circle(0.16, 8)],
    square: [[-0.74, -0.74, 0.74, -0.74, 0.74, 0.74, -0.74, 0.74, -0.74, -0.74]],
    hexagon: [ngon(6, 0.98, -Math.PI / 2), [0, 0, 0, -0.98], [0, 0, 0.849, 0.49], [0, 0, -0.849, 0.49]],
    pentagon: [ngon(5, 0.98, -Math.PI / 2)],
    spiral: [(() => { const p = []; const N = 40; for (let i = 0; i <= N; i++) { const u = i / N, a = u * TAU * 2 - Math.PI / 2, r = 0.12 + 0.86 * u; p.push(r * Math.cos(a), r * Math.sin(a)); } return p; })()],
});

export function symbolLines(name) { return SYMBOL_LINES[name] || SYMBOL_LINES.circle; }

// ---------------------------------------------------------------- the vector font
// glyph strokes on a 0..4 x 0..6 grid (y down), '|' separates strokes
const FONT_SRC = {
    A: '0,6 0,2 2,0 4,2 4,6|0,3.5 4,3.5', B: '0,0 0,6 3,6 4,5 4,4 3,3 0,3|0,0 3,0 4,1 4,2 3,3', C: '4,0 0,0 0,6 4,6',
    D: '0,0 0,6 2,6 4,4 4,2 2,0 0,0', E: '4,0 0,0 0,6 4,6|0,3 3,3', F: '4,0 0,0 0,6|0,3 3,3', G: '4,1.5 4,0 0,0 0,6 4,6 4,3.5 2,3.5',
    H: '0,0 0,6|4,0 4,6|0,3 4,3', I: '0,0 4,0|2,0 2,6|0,6 4,6', J: '4,0 4,5 3,6 1,6 0,5', K: '0,0 0,6|4,0 0,3 4,6',
    L: '0,0 0,6 4,6', M: '0,6 0,0 2,2.5 4,0 4,6', N: '0,6 0,0 4,6 4,0', O: '0,0 4,0 4,6 0,6 0,0', P: '0,6 0,0 4,0 4,3 0,3',
    Q: '0,0 4,0 4,4.5 2.5,6 0,6 0,0|2.5,4.5 4,6', R: '0,6 0,0 4,0 4,3 0,3|1.2,3 4,6', S: '4,0 0,0 0,3 4,3 4,6 0,6',
    T: '0,0 4,0|2,0 2,6', U: '0,0 0,6 4,6 4,0', V: '0,0 2,6 4,0', W: '0,0 0,6 2,4 4,6 4,0', X: '0,0 4,6|4,0 0,6',
    Y: '0,0 2,2.5 4,0|2,2.5 2,6', Z: '0,0 4,0 0,6 4,6',
    0: '0,0 4,0 4,6 0,6 0,0', 1: '1,1 2,0 2,6', 2: '0,0 4,0 4,3 0,3 0,6 4,6', 3: '0,0 4,0 4,6 0,6|0,3 4,3',
    4: '0,0 0,3 4,3|4,0 4,6', 5: '4,0 0,0 0,3 4,3 4,6 0,6', 6: '0,0 0,6 4,6 4,3 0,3', 7: '0,0 4,0 4,6',
    8: '0,0 4,0 4,6 0,6 0,0|0,3 4,3', 9: '4,3 0,3 0,0 4,0 4,6',
    '-': '1,3 3,3', '.': '1.7,5.6 2.3,5.6 2.3,6 1.7,6 1.7,5.6', ':': '2,1.6 2,2.2|2,4.2 2,4.8', '/': '0,6 4,0',
    '·': '2,2.5 2.5,3 2,3.5 1.5,3 2,2.5', "'": '2,0 2,1.5', '!': '2,0 2,4.2|2,5.6 2,6', '?': '0,1 1,0 4,0 4,3 2,3 2,4.2|2,5.6 2,6',
    '(': '3,0 1.5,1.5 1.5,4.5 3,6', ')': '1,0 2.5,1.5 2.5,4.5 1,6', ',': '2,5.4 1.5,6.6',
};
export const FONT = Object.freeze(Object.fromEntries(Object.entries(FONT_SRC).map(([k, v]) =>
    [k, Object.freeze(v.split('|').map((st) => st.trim().split(/\s+/).flatMap((pt) => pt.split(',').map(Number))))])));
export const FONT_ADVANCE = 6;          // grid units per character (glyph 4 + gap 2)

// width of `text` at `size` (size = the glyph's 6-unit height in output units)
export function textWidth(text, size) { return text.length ? (text.length * FONT_ADVANCE - 2) * size / 6 : 0; }

// visit every stroke of `text` placed with its top-left at (x, y), glyph height `size`:
// seg(ax, ay, bx, by) per segment, or poly(points[]) per stroke when given
export function eachTextStroke(text, x, y, size, poly) {
    const k = size / 6;
    for (let i = 0; i < text.length; i++) {
        const g = FONT[text[i].toUpperCase()] || FONT[text[i]];
        if (g) for (const st of g) {
            const pts = new Array(st.length);
            for (let j = 0; j < st.length; j += 2) { pts[j] = x + st[j] * k; pts[j + 1] = y + st[j + 1] * k; }
            poly(pts);
        }
        x += FONT_ADVANCE * k;
    }
}
