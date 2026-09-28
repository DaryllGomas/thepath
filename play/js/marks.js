// THE NODE's own marks (docs/THE_GAME/OPENING_SYMBOLS_AND_SOCIAL_2026-09-26.md). Ours, not borrowed geometry.
// THE PATH is Atlas Veyr's mark: a road winding through a ring, on an axis of stars, narrow far away and wide
// where you stand. One path, many worlds. Drawn as strokes so it can draw itself in (class "draw"), then flare.

function spline(P, per = 18) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(P[P.length - 1]);
  return out;
}
const f = (p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
// a four-point star, taller than wide, like the ones on the axis of the concept board
const star = (x, y, r) => {
  const w = r * 0.5, k = r * 0.14;
  return `<path d="M${x} ${y - r} L${x + k} ${y - k} L${x + w} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - w} ${y} L${x - k} ${y - k} Z"/>`;
};

export function pathMarkSVG() {
  // the road's centre line, far (top) to near (bottom); its width grows as it comes toward you
  const c = spline([[103, 36], [92, 45], [89, 57], [108, 72], [121, 92], [99, 114], [74, 133], [80, 156], [112, 174], [138, 196]]);
  const L = [], R = [];
  c.forEach((p, i) => {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], len = Math.hypot(tx, ty) || 1;
    const t = i / (c.length - 1), w = 0.5 + 13 * Math.pow(t, 1.8);
    L.push([p[0] - (ty / len) * w, p[1] + (tx / len) * w]);
    R.push([p[0] + (ty / len) * w, p[1] - (tx / len) * w]);
  });
  const ribbon = 'M' + L.map(f).join(' L') + ' L' + R.slice().reverse().map(f).join(' L') + ' Z';
  const centre = 'M' + c.map(f).join(' L');
  return `<svg class="pathmark" viewBox="0 0 200 200" role="img" aria-label="The Path">
  <defs><mask id="pmReveal" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
    <path class="rv" d="${centre}" pathLength="1" stroke="#fff" stroke-width="30" fill="none" stroke-linecap="round"/></mask>
    <clipPath id="pmRing"><circle cx="100" cy="100" r="75"/></clipPath></defs>
  <circle class="s" cx="100" cy="100" r="76" pathLength="1" stroke-width="1.8"/>
  <circle class="s" cx="100" cy="100" r="70" pathLength="1" stroke-width="0.5" opacity="0.5"/>
  <path class="s" d="M100 2 V198" pathLength="1" stroke-width="0.9"/>
  <path class="s" d="M18 100 H182" pathLength="1" stroke-width="0.45" opacity="0.45"/>
  <g clip-path="url(#pmRing)"><path class="road" d="${ribbon}" mask="url(#pmReveal)"/></g>
  <g class="stars">${star(100, 24, 16)}${star(100, 70, 8)}${star(100, 180, 16)}</g>
  <g class="dots"><circle cx="24" cy="100" r="3"/><circle cx="176" cy="100" r="2"/><circle cx="158" cy="58" r="4.5"/>
    <circle cx="150" cy="140" r="6" fill="none" stroke-width="1.2"/><circle cx="54" cy="70" r="1.5"/><circle cx="60" cy="146" r="1.2"/><circle cx="136" cy="36" r="1.2"/></g>
</svg>`;
}
