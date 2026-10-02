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

// ---------------------------------------------------------------------------------------------------------------
// THE GATE: World 1's mark, the first mark of the player's own language (ART_LIBRARY/01_marks_ATLAS_VEYR/
// 02_THE_GATE_board.png, the clean mono stamp; docs/concepts/basement_brief/41_polybius/real_marks_1.png, column 1).
// An open ring broken at the top (for the axis), at 3 and 9 o'clock, and open at the bottom; a vertical axis of
// five dots rising through it; a four-point star on top; a needle down the axis; and a stepped road fanning out
// at the base (two strips a side, a slit between them). Measured off the mono stamp at 5x: ring radius R = 1,
// y down, the ring's centre at (0, 0). The cabinet's win draws it; the 3D token can build its shape from the same
// numbers (gateMarkShapes() polylines, or the SVG's paths).
const GATE_R_IN = 0.835;            // ring inner radius (outer = 1)
const GATE_EQ = 0.04;               // half the gap at 3 and 9 o'clock
const GATE_TOP = 0.27;              // half the gap at the top (vertical cuts)
const GATE_END_OUT = 46, GATE_END_IN = 49.5;   // the lower arcs end this many degrees below 3/9 o'clock
const GATE_DOTS = [[-0.87, 0.040], [-0.61, 0.058], [-0.35, 0.064], [-0.09, 0.064], [0.17, 0.058]];
const GATE_BASE = { T: [-0.165, 0.07], K1: [-0.262, 0.50], C: [-0.29, 0.60], K2: [-0.40, 0.665], B1: [-0.90, 1.13], S1: [-0.615, 1.13], A: [-0.248, 0.675], S2: [-0.49, 1.13], B2: [-0.19, 1.13] };
export const GATE_BOUNDS = Object.freeze({ x0: -1.0, y0: -1.58, x1: 1.0, y1: 1.30 });

const gdeg = (d) => d * Math.PI / 180;
// points along a circle of radius r from angle a0 to a1 (degrees, y down: +angle = clockwise on screen)
function garc(r, a0, a1, step = 3) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let i = 0; i <= n; i++) { const a = gdeg(a0 + (a1 - a0) * i / n); out.push([r * Math.cos(a), r * Math.sin(a)]); }
  return out;
}
const gmir = (pts) => pts.map(([x, y]) => [-x, y]);

// The mark as ordered closed polylines, in the order THE GATE draws itself (t0..t1 = its slice of the reveal):
// the needle rises, the road fans out (both sides at once), the dots climb the axis, the ring's lower arcs then its
// upper arcs close around them, and the star lights last. { id, pts: [[x, y], ...], t0, t1, dot? }
export function gateMarkShapes(step = 3) {
  const S = [];
  const eqO = Math.asin(GATE_EQ) * 180 / Math.PI, eqI = Math.asin(GATE_EQ / GATE_R_IN) * 180 / Math.PI;
  const topO = Math.acos(GATE_TOP) * 180 / Math.PI, topI = Math.acos(GATE_TOP / GATE_R_IN) * 180 / Math.PI;
  // needle: from the bottom tip up the right side, round the top, down the left side
  const nw = 0.032, needle = [[0, 1.30], [nw, 1.12], [nw, 0.39]];
  for (let i = 0; i <= 8; i++) { const a = gdeg(i * 180 / 8); needle.push([nw * Math.cos(a), 0.39 - nw * Math.sin(a)]); }
  needle.push([-nw, 1.12], [0, 1.30]);
  S.push({ id: 'needle', pts: needle, t0: 0.0, t1: 0.2 });
  // the road, left then its mirror: up the inner edge to the tip, down the outer edge, along the base, the slit
  const b = GATE_BASE, road = [b.B2, b.T, b.K1];
  for (let i = 1; i <= 8; i++) { const u = i / 8, v = 1 - u; road.push([v * v * b.K1[0] + 2 * v * u * b.C[0] + u * u * b.K2[0], v * v * b.K1[1] + 2 * v * u * b.C[1] + u * u * b.K2[1]]); }
  road.push(b.B1, b.S1, b.A, b.S2, b.B2);
  S.push({ id: 'roadL', pts: road, t0: 0.12, t1: 0.46 }, { id: 'roadR', pts: gmir(road), t0: 0.12, t1: 0.46 });
  // the dots, climbing
  GATE_DOTS.slice().reverse().forEach(([y, r], i) => {
    const c = []; for (let k = 0; k <= 16; k++) { const a = gdeg(-90 + k * 360 / 16); c.push([r * Math.cos(a), y + r * Math.sin(a)]); }
    S.push({ id: 'dot' + (GATE_DOTS.length - i), pts: c, t0: 0.40 + i * 0.055, t1: 0.49 + i * 0.055, dot: { y, r } });
  });
  // the lower arcs: from their lower end up the outer edge to 9 o'clock, back down the inside
  const lowL = [...garc(1, 180 - GATE_END_OUT, 180 - eqO, step), ...garc(GATE_R_IN, 180 - eqI, 180 - GATE_END_IN, step)];
  lowL.push(lowL[0]);
  S.push({ id: 'lowL', pts: lowL, t0: 0.56, t1: 0.74 }, { id: 'lowR', pts: gmir(lowL), t0: 0.56, t1: 0.74 });
  // the upper arcs: from 9 o'clock over the top to the axis cut, down the cut, back along the inside
  const upL = [...garc(1, 180 + eqO, 180 + topO, step), ...garc(GATE_R_IN, 180 + topI, 180 + eqI, step)];
  upL.push(upL[0]);
  S.push({ id: 'upL', pts: upL, t0: 0.68, t1: 0.88 }, { id: 'upR', pts: gmir(upL), t0: 0.68, t1: 0.88 });
  // the star: four thin spikes round a small diamond core (the top spike the longest)
  const cy = -1.25, w = 0.04, st = [[0, -1.58], [w, cy - w], [0.22, cy], [w, cy + w], [0, -1.0], [-w, cy + w], [-0.22, cy], [-w, cy - w], [0, -1.58]];
  S.push({ id: 'star', pts: st, t0: 0.84, t1: 1.0 });
  return S;
}

// THE GATE as a standalone SVG (filled, the mono stamp). Paths carry pathLength="1" and class "g" so CSS can draw
// them in with a dash animation like pathMarkSVG's; opts.fill / opts.stroke / opts.strokeWidth style it inline.
export function gateMarkSVG(opts = {}) {
  const k = 100, P = (pts) => 'M' + pts.map(([x, y]) => (x * k).toFixed(2) + ' ' + (y * k).toFixed(2)).join(' L') + ' Z';
  const fill = opts.fill || 'currentColor', stroke = opts.stroke || 'none', sw = opts.strokeWidth || 0;
  const body = gateMarkShapes(1.5).map((s) => s.dot
    ? `<circle class="g" cx="0" cy="${(s.dot.y * k).toFixed(2)}" r="${(s.dot.r * k).toFixed(2)}" pathLength="1"/>`
    : `<path class="g" d="${P(s.pts)}" pathLength="1"/>`).join('');
  const B = GATE_BOUNDS, pad = 4;
  return `<svg class="gatemark" viewBox="${B.x0 * k - pad} ${B.y0 * k - pad} ${(B.x1 - B.x0) * k + 2 * pad} ${(B.y1 - B.y0) * k + 2 * pad}" role="img" aria-label="The Gate">` +
    `<g fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round">${body}</g></svg>`;
}

// THE GATE on a canvas: ring centre (cx, cy), ring radius `size` px.
//   progress 0..1  how much has drawn itself (strokes in gateMarkShapes order); fill 0..1  the solid stamp's alpha
//   color / fillColor, lineWidth (px), glow (px of a wide faint under-stroke; 0 = none), alpha
// It only strokes and fills paths (no shadowBlur): cheap enough to call every frame.
let gateCache = null;
export function drawGateMark(ctx, cx, cy, size, opts = {}) {
  if (!gateCache) {
    gateCache = gateMarkShapes(3).map((s) => {
      const L = [0];
      for (let i = 1; i < s.pts.length; i++) L.push(L[i - 1] + Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
      return { ...s, len: L };
    });
  }
  const progress = opts.progress === undefined ? 1 : opts.progress, fill = opts.fill || 0, alpha = opts.alpha === undefined ? 1 : opts.alpha;
  const color = opts.color || '#ffe8b8', lw = opts.lineWidth || Math.max(1, size * 0.018), glow = opts.glow || 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (fill > 0) {
    ctx.globalAlpha = alpha * fill;
    ctx.fillStyle = opts.fillColor || color;
    ctx.beginPath();
    for (const s of gateCache) {
      if (s.dot) { ctx.moveTo(s.dot.r * size, s.dot.y * size); ctx.arc(0, s.dot.y * size, s.dot.r * size, 0, Math.PI * 2); continue; }
      ctx.moveTo(s.pts[0][0] * size, s.pts[0][1] * size);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0] * size, s.pts[i][1] * size);
      ctx.closePath();
    }
    ctx.fill();
  }
  if (progress > 0) {
    ctx.beginPath();
    for (const s of gateCache) {
      const u = Math.max(0, Math.min(1, (progress - s.t0) / (s.t1 - s.t0)));
      if (u <= 0) continue;
      const want = u * s.len[s.len.length - 1];
      ctx.moveTo(s.pts[0][0] * size, s.pts[0][1] * size);
      for (let i = 1; i < s.pts.length; i++) {
        if (s.len[i] <= want) { ctx.lineTo(s.pts[i][0] * size, s.pts[i][1] * size); continue; }
        const f = (want - s.len[i - 1]) / Math.max(1e-9, s.len[i] - s.len[i - 1]);
        ctx.lineTo((s.pts[i - 1][0] + (s.pts[i][0] - s.pts[i - 1][0]) * f) * size, (s.pts[i - 1][1] + (s.pts[i][1] - s.pts[i - 1][1]) * f) * size);
        break;
      }
    }
    ctx.strokeStyle = color;
    if (glow > 0) { ctx.globalAlpha = alpha * 0.18; ctx.lineWidth = lw + glow; ctx.stroke(); }
    ctx.globalAlpha = alpha; ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.restore();
}
