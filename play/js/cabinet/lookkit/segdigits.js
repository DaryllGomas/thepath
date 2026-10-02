// lookkit/segdigits.js — a segmented-digit readout (score, timer) drawn with glow lines.
//
//   drawDigits(batch, text, x, y, { h, w, gap, pitch, slant, thick, color, hollow, style })
//       Pushes each character of `text` ("0"-"9", "-", " ") as 7-segment glyphs into a LineBatch.
//       x, y = top-left in frame coords; h = digit height; w = digit width (default 0.62 h);
//       pitch = advance per digit; slant = italic lean (x shift per unit of height, e.g. 0.08);
//       hollow = each segment is an outlined capsule (LED look) instead of a single stroke.
//   Re-push every frame the value changes (dynamic batch) or once for a static readout.
const SEGS = { a: [[0, 0], [1, 0]], b: [[1, 0], [1, 0.5]], c: [[1, 0.5], [1, 1]], d: [[0, 1], [1, 1]],
  e: [[0, 0.5], [0, 1]], f: [[0, 0], [0, 0.5]], g: [[0, 0.5], [1, 0.5]] };
const MAP = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };

export function drawDigits(batch, text, x, y, o = {}) {
  const h = o.h ?? 32, w = o.w ?? h * 0.62, gap = o.gap ?? h * 0.06, pitch = o.pitch ?? w * 1.32;
  const slant = o.slant ?? 0.08, thick = o.thick ?? h * 0.075, color = o.color ?? [2.2, 0.45, 0.12];
  const style = o.style;
  const P = (dx, u, v) => [x + dx + u * w + (1 - v) * h * slant, y + v * h];
  [...String(text)].forEach((ch, k) => {
    const segs = MAP[ch] ?? '';
    for (const s of segs) {
      const [[u0, v0], [u1, v1]] = SEGS[s];
      const a = P(k * pitch, u0, v0), b = P(k * pitch, u1, v1);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), tx = dx / L, ty = dy / L, nx = -ty, ny = tx;
      const a2 = [a[0] + tx * gap, a[1] + ty * gap], b2 = [b[0] - tx * gap, b[1] - ty * gap];
      if (o.hollow === false) { batch.line([a2, b2], color, style); continue; }   // single stroke (clean at small sizes)
      const t = thick * 0.5;
      const pts = [a2,
        [a2[0] + tx * t + nx * t, a2[1] + ty * t + ny * t], [b2[0] - tx * t + nx * t, b2[1] - ty * t + ny * t],
        b2,
        [b2[0] - tx * t - nx * t, b2[1] - ty * t - ny * t], [a2[0] + tx * t - nx * t, a2[1] + ty * t - ny * t]];
      batch.loop(pts, color, style);
    }
  });
}
