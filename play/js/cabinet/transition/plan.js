// THE REDRAW · the plan: which bit of the old picture's line becomes which bit of the new one, and how it travels.
//
//   const plan = buildPlan(fromStrokes, toStrokes, opts)      strokes from capture.js (captureLines / structureStrokes)
//   plan.pieces     Float32Array, STRIDE floats a piece (layout below); plan.count pieces; plan.stats (numbers, ms)
//
// PAIRING (per class: 'live' lines pair with live lines, 'hud' with hud, 'paint' with paint)
//   1. SHAPES. Strokes of one drawn object that touch are one shape (the bull, the deer, the fire, a ring's arc, a star,
//      a stretch of the cave's rock). Shapes are what the eye follows, so shapes are what move.
//   2. CHAINS & UNITS. Each side's strokes are strung into one chain (a nearest-next pen walk from the side's heart) and
//      cut into units of about `unitLen` px of LIGHT (a segment weighs its length x sqrt(brightness); a dash gap weighs
//      nothing, so dashes slide together, and a solid line becomes a dashed one by opening its gaps).
//   3. THE ASSIGNMENT (assign.js): every unit of the smaller side is paired with one of the larger side, minimising the
//      summed squared distance (optimal transport: no two paths cross). What the larger side has left over is SURPLUS:
//      it travels with its shape and fades on the way (or, on the new side, fades in where it will stand). Units of one
//      stroke that go to one stroke are re-paired in order, and runs of units that land in a row become one chunk: ONE
//      continuous line that bends from its old shape into its new one.
//   4. PIECES. A chunk is cut at every vertex of either side (each piece is a straight bit of BOTH lines, so the first
//      frame is exactly the old picture and the last exactly the new one) and at most `maxLen` px long.
// MOTION (per piece end):   p = S + G a1 + B sin(pi a1) + P a2 + R b
//   G  the whole shape's move: a similarity (move + uniform scale) fitted to where the shape's travelling units go
//   B  a gentle bow sideways, outward from the heart, the same way for the whole shape (the two animals open like wings)
//   P  the part's move: the shape splits into the parts bound for each new shape (each a similarity of its own)
//   R  the rest: each line's settling into its exact new place
//   a1 < a2 < b in time, so the eye sees whole -> parts -> details. v = (u - delay) / dur for the piece end; the delay is
//   the SHAPE's (from its distance to the old heart and its parts' distance to the new heart: the fire leaves first, the
//   temple forms first), so a shape moves as one.
// Colour, width and core/halo gains ease from the old line's to the new line's; lines dim a little in flight.
import { assign } from './assign.js';

// piece: [mode, under, sw, tw, sCore, tCore, sHalo, tHalo, -, flags] then 2 ends x [Sx, Sy, Gx, Gy, Px, Py, Rx, Ry,
// Bx, By, delay, csR, csG, csB, ctR, ctG, ctB, dur]. mode 0 travels, 1 surplus (travels with its shape, fades), 2 grows in
// place. flags: 1 LIFT (fades up as it leaves: structure lifting off a plate that dims under it), 2 SETTLE (fades out as
// it lands: it hands its light to the new plate's paint)
export const HEAD = 10, END = 18, HOTS = 24, STRIDE = HEAD + 2 * END + 2;   // + [old hot index, new hot index] (plan.hots: the table)

const light = (c) => Math.max(c[0], c[1], c[2]);
const weight = (q) => Math.sqrt(Math.min(2, Math.max(0, (light(q.ca) + light(q.cb)) * 0.5)));
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const PLAN_DEFAULTS = {
  unitLen: 30, maxUnits: 420, minUnits: 4,
  maxLen: 12,            // px: longest piece
  link: 9,               // px: strokes of one object this close are one shape
  classes: {             // timing in u (0..1); scale = the range a shape may shrink/grow by as a whole
    live: { start: 0.0, spread: 0.3, dur: 0.6, bend: 0.16, scale: [0.3, 1.2], far: Infinity },
    hud: { start: 0.08, spread: 0.08, dur: 0.6, bend: 0, scale: [0.3, 1.5], far: 260 },
    paint: { start: 0.1, spread: 0.3, dur: 0.52, bend: 0.1, scale: [0.4, 1.1], far: Infinity, lift: true, settle: true, byFront: true,
      dropSurplus: true,    // painted structure the new picture doesn't need just dissolves with its plate (it never lifts)
      unitLen: 55,          // longer units: the figure is built from fewer, longer stretches of the old lines
      arriveUp: [0.5, 0.92],   // it LANDS in order from the bottom of the new figure to its top (the sky draws itself upward)
      partsOnly: true },       // no whole-shape stage: a rock network spans the glass, its 'whole' move would be a detour
  },
  delayMix: 0.55,        // share of a shape's delay set by where it LEAVES (the rest: where it LANDS)
  heartFrom: [633, 476], heartTo: [633, 476], reachFrom: 640, reachTo: 640, bowReach: 280,
  front: { from: 0.08, to: 0.8, reach: 1000, lead: 0.03 },   // the plate wipe (byFront classes leave as it passes them)
};

// ---------------- shapes ----------------
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L > 0 ? clamp01(((px - ax) * dx + (py - ay) * dy) / L) : 0;
  return (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2;
}
/** Shape id per stroke: strokes of one object whose end comes within `link` px of the other are one shape. */
function shapesOf(strokes, link) {
  const n = strokes.length, parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const box = strokes.map((s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < s.pts.length; i += 2) { x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]); y0 = Math.min(y0, s.pts[i + 1]); y1 = Math.max(y1, s.pts[i + 1]); }
    return [x0 - link, y0 - link, x1 + link, y1 + link];
  });
  const L2 = link * link;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const A = strokes[i], B = strokes[j];
    if (A.obj !== B.obj || A.eachOwn || B.eachOwn) continue;
    const a = box[i], b = box[j];
    if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) continue;
    if (find(i) === find(j)) continue;
    const touch = (P, Q) => {
      for (const e of [0, P.pts.length - 2]) {
        const px = P.pts[e], py = P.pts[e + 1];
        for (let k = 0; k + 3 < Q.pts.length; k += 2) if (segDist2(px, py, Q.pts[k], Q.pts[k + 1], Q.pts[k + 2], Q.pts[k + 3]) <= L2) return true;
      }
      return false;
    };
    if (touch(A, B) || touch(B, A)) parent[find(i)] = find(j);
  }
  return strokes.map((_, i) => find(i));
}

// ---------------- chains ----------------
function prep(strokes, link) {
  const shape = shapesOf(strokes, link);
  return strokes.map((s, id) => {
    const n = s.seg.length, p = s.pts, mass = new Float64Array(n);
    let M = 0, L = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(p[2 * i + 2] - p[2 * i], p[2 * i + 3] - p[2 * i + 1]);
      mass[i] = l * weight(s.seg[i]); M += mass[i]; L += mass[i] > 0 ? l : 0;
      cx += mass[i] * (p[2 * i] + p[2 * i + 2]) / 2; cy += mass[i] * (p[2 * i + 1] + p[2 * i + 3]) / 2;
    }
    return { id, s, n, mass, M, L, c: M > 0 ? [cx / M, cy / M] : [p[0], p[1]], shape: shape[id], a: [p[0], p[1]], b: [p[2 * n], p[2 * n + 1]], orig: s._i };
  }).filter((q) => q.M > 1e-6);
}

function tour(strokes, heart) {
  const left = new Set(strokes.keys()), order = [];
  let cur = heart;
  while (left.size) {
    let best = -1, bd = Infinity, rev = false;
    for (const i of left) {
      const st = strokes[i], da = d2(cur, st.a), db = d2(cur, st.b);
      if (da < bd) { bd = da; best = i; rev = false; }
      if (db < bd) { bd = db; best = i; rev = true; }
    }
    left.delete(best);
    order.push({ st: strokes[best], rev });
    cur = rev ? strokes[best].a : strokes[best].b;
  }
  return order;
}

function chainOf(strokes, heart) {
  const segs = [];
  let m = 0, L = 0;
  for (const { st, rev } of tour(strokes, heart)) {
    const p = st.s.pts;
    for (let k = 0; k < st.n; k++) {
      const i = rev ? st.n - 1 - k : k;
      if (st.mass[i] <= 0) continue;
      const q = st.s.seg[i];
      let x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * i + 2], y1 = p[2 * i + 3], ca = q.ca, cb = q.cb;
      if (rev) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; [ca, cb] = [cb, ca]; }
      segs.push({ x0, y0, x1, y1, ca, cb, w: q.w, core: q.core, halo: q.halo, hot: q.hot, settle: q.settle, order: st.s.order, stroke: st.id, shape: st.shape, m0: m, m1: m + st.mass[i],
        ref: [st.orig, i, rev ? 1 : 0] });
      m += st.mass[i]; L += Math.hypot(x1 - x0, y1 - y0);
    }
  }
  for (const s of segs) { s.m0 /= m; s.m1 /= m; }
  if (segs.length) segs[segs.length - 1].m1 = 1;
  return { segs, M: m, L };
}

/** Index of the segment whose light-range holds mu (mu strictly inside for interior lookups). */
function segAt(ch, mu) {
  const S = ch.segs;
  let lo = 0, hi = S.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (S[mid].m1 <= mu) lo = mid + 1; else hi = mid; }
  return lo;
}
function posIn(s, mu) { const t = clamp01((mu - s.m0) / (s.m1 - s.m0)); return [s.x0 + (s.x1 - s.x0) * t, s.y0 + (s.y1 - s.y0) * t]; }
function colIn(s, mu) {
  const t = clamp01((mu - s.m0) / (s.m1 - s.m0));
  return [s.ca[0] + (s.cb[0] - s.ca[0]) * t, s.ca[1] + (s.cb[1] - s.ca[1]) * t, s.ca[2] + (s.cb[2] - s.ca[2]) * t];
}
function at(ch, mu) { return posIn(ch.segs[segAt(ch, mu)], mu); }

function units(ch, N) {
  const out = [];
  for (let k = 0; k < N; k++) {
    const a = k / N, b = (k + 1) / N;
    let sx = 0, sy = 0, sw = 0;
    for (let j = segAt(ch, a + 1e-12); j < ch.segs.length && ch.segs[j].m0 < b; j++) {
      const s = ch.segs[j], lo = Math.max(a, s.m0), hi = Math.min(b, s.m1);
      if (hi <= lo) continue;
      const p = posIn(s, (lo + hi) / 2);
      sx += p[0] * (hi - lo); sy += p[1] * (hi - lo); sw += hi - lo;
    }
    const mid = ch.segs[segAt(ch, (a + b) / 2)];
    out.push({ c: sw > 0 ? [sx / sw, sy / sw] : at(ch, (a + b) / 2), stroke: mid.stroke, shape: mid.shape });
  }
  return out;
}

// ---------------- pairing ----------------
/** distance from p to a polyline */
function spineDist(p, pts) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, Math.sqrt(segDist2(p[0], p[1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])));
  return best;
}
function pairUnits(A, B, far, spine) {
  const Ns = A.length, Nt = B.length, big = 1e12;
  const rowsAreTargets = Nt <= Ns, n = Math.min(Ns, Nt), m = Math.max(Ns, Nt);
  const cost = new Float64Array(n * m), f2 = far * far;
  // spine: when the larger side has more than it needs, the units near this line (a picture's central axis) are the ones that
  // travel; cost = distance^2 to the partner + weight x distance^2 to the spine (so the axis becomes the new picture's line)
  const spineCost = A.map((a) => (spine && rowsAreTargets ? spine.weight * spineDist(a.c, spine.pts) ** 2 : 0));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const dd = rowsAreTargets ? d2(B[i].c, A[j].c) : d2(A[i].c, B[j].c);
    cost[i * m + j] = dd > f2 ? big + dd : dd + (rowsAreTargets ? spineCost[j] : 0);
  }
  const col = assign(cost, n, m);
  const sig = new Int32Array(Ns).fill(-1);
  for (let i = 0; i < n; i++) {
    const s = rowsAreTargets ? col[i] : i, t = rowsAreTargets ? i : col[i];
    if (d2(A[s].c, B[t].c) <= f2) sig[s] = t;                 // too far: the source fades, the target grows in place
  }
  // coherence: units of one stroke that go to one stroke are paired in order (the cheaper of the two directions)
  const groups = new Map();
  for (let i = 0; i < Ns; i++) if (sig[i] >= 0) {
    const key = A[i].stroke + ':' + B[sig[i]].stroke;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  }
  for (const idx of groups.values()) {
    if (idx.length < 2) continue;
    const src = [...idx].sort((x, y) => x - y), tgt = idx.map((i) => sig[i]).sort((x, y) => x - y);
    let up = 0, down = 0;
    for (let k = 0; k < src.length; k++) { up += d2(A[src[k]].c, B[tgt[k]].c); down += d2(A[src[k]].c, B[tgt[tgt.length - 1 - k]].c); }
    for (let k = 0; k < src.length; k++) sig[src[k]] = up <= down ? tgt[k] : tgt[tgt.length - 1 - k];
  }
  const taken = new Uint8Array(Nt);
  for (const t of sig) if (t >= 0) taken[t] = 1;
  const orphans = []; for (let j = 0; j < Nt; j++) if (!taken[j]) orphans.push(j);
  return { sig, orphans };
}

function runsOf(sig) {
  const runs = [], N = sig.length;
  let k = 0;
  while (k < N) {
    if (sig[k] < 0) { let k1 = k; while (k1 + 1 < N && sig[k1 + 1] < 0) k1++; runs.push({ k0: k, k1, surplus: true }); k = k1 + 1; continue; }
    let k1 = k, d = 0;
    while (k1 + 1 < N && sig[k1 + 1] >= 0) {
      const step = sig[k1 + 1] - sig[k1];
      if ((step === 1 || step === -1) && (d === 0 || step === d)) { d = step; k1++; } else break;
    }
    runs.push({ k0: k, k1, d });
    k = k1 + 1;
  }
  return runs;
}

/** Similarity (move + uniform scale) that best maps the a's onto the b's. */
function fit(pairs, range, fallbackS) {
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (const [a, b] of pairs) { ax += a[0]; ay += a[1]; bx += b[0]; by += b[1]; }
  const n = pairs.length; ax /= n; ay /= n; bx /= n; by /= n;
  let num = 0, den = 0;
  for (const [a, b] of pairs) { num += (a[0] - ax) * (b[0] - bx) + (a[1] - ay) * (b[1] - by); den += (a[0] - ax) ** 2 + (a[1] - ay) ** 2; }
  let s = den > 400 ? num / den : fallbackS ?? 1;
  s = Math.max(range[0], Math.min(range[1], s));
  return { ca: [ax, ay], cb: [bx, by], s };
}
const apply = (T, p) => [T.cb[0] + T.s * (p[0] - T.ca[0]), T.cb[1] + T.s * (p[1] - T.ca[1])];

// ---------------- pieces ----------------
function cutTaus(ch, lo, hi, map) {
  const out = [];
  for (let j = segAt(ch, lo + 1e-12); j < ch.segs.length && ch.segs[j].m0 < hi; j++) {
    const m = ch.segs[j].m1;
    if (m > lo && m < hi) out.push(map(m));
  }
  return out;
}
function cleanTaus(t) { t.sort((x, y) => x - y); return t.filter((x, i) => i === 0 || x - t[i - 1] > 1e-9); }

function emitChunk(cs, ct, s0, s1, t0, t1, fwd, maxLen, emit) {
  const muS = (x) => s0 + (s1 - s0) * x, muT = (x) => (fwd ? t0 + (t1 - t0) * x : t1 - (t1 - t0) * x);
  const taus = cleanTaus([0, 1, ...cutTaus(cs, s0, s1, (m) => (m - s0) / (s1 - s0)),
    ...cutTaus(ct, t0, t1, (m) => (fwd ? (m - t0) / (t1 - t0) : (t1 - m) / (t1 - t0)))]);
  for (let i = 0; i + 1 < taus.length; i++) {
    const ta = taus[i], tb = taus[i + 1], tm = (ta + tb) / 2;
    const ss = cs.segs[segAt(cs, muS(tm))], st = ct.segs[segAt(ct, muT(tm))];
    const A0 = posIn(ss, muS(ta)), A1 = posIn(ss, muS(tb)), B0 = posIn(st, muT(ta)), B1 = posIn(st, muT(tb));
    const n = Math.max(1, Math.ceil(Math.max(Math.hypot(A1[0] - A0[0], A1[1] - A0[1]), Math.hypot(B1[0] - B0[0], B1[1] - B0[1])) / maxLen));
    for (let k = 0; k < n; k++) {
      const u0 = ta + (tb - ta) * k / n, u1 = ta + (tb - ta) * (k + 1) / n;
      emit({ s: ss, t: st, sm: [muS(u0), muS(u1)], tm: [muT(u0), muT(u1)] });
    }
  }
}
function emitAlone(ch, lo, hi, maxLen, emit) {
  const mu = (x) => lo + (hi - lo) * x;
  const taus = cleanTaus([0, 1, ...cutTaus(ch, lo, hi, (m) => (m - lo) / (hi - lo))]);
  for (let i = 0; i + 1 < taus.length; i++) {
    const ta = taus[i], tb = taus[i + 1], s = ch.segs[segAt(ch, mu((ta + tb) / 2))];
    const a = posIn(s, mu(ta)), b = posIn(s, mu(tb)), n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let k = 0; k < n; k++) emit({ s, m: [mu(ta + (tb - ta) * k / n), mu(ta + (tb - ta) * (k + 1) / n)] });
  }
}

// ---------------- the whole plan ----------------
export function buildPlan(fromStrokes, toStrokes, opts = {}) { return finishPlan(buildPlanData(fromStrokes, toStrokes, opts)); }

/** The plan as plain data (typed arrays and arrays only: it can cross a Web Worker, see planasync.js). finishPlan(data) adds refresh(). */
export function buildPlanData(fromStrokes, toStrokes, opts = {}) {
  const t0 = performance.now();
  fromStrokes.forEach((s, i) => { s._i = i; }); toStrokes.forEach((s, i) => { s._i = i; });
  const o = { ...PLAN_DEFAULTS, ...opts, classes: { ...PLAN_DEFAULTS.classes } };
  for (const [k, v] of Object.entries(opts.classes ?? {})) o.classes[k] = { ...PLAN_DEFAULTS.classes[k], ...v };
  const underOrder = opts.underOrder ?? -Infinity;      // old lines drawn below this renderOrder go in the 'under' batch
  const recs = [];
  const stats = { classes: {} };
  const [hfx, hfy] = o.heartFrom, [htx, hty] = o.heartTo;
  for (const cls of [...new Set([...fromStrokes, ...toStrokes].map((s) => s.cls))]) {
    const cfg = o.classes[cls] ?? o.classes.live;
    const src = prep(fromStrokes.filter((s) => s.cls === cls), o.link), tgt = prep(toStrokes.filter((s) => s.cls === cls), o.link);
    const cs = src.length ? chainOf(src, o.heartFrom) : null, ct = tgt.length ? chainOf(tgt, o.heartTo) : null;
    const st = stats.classes[cls] = { from: src.length, to: tgt.length, fromLen: Math.round(cs?.L ?? 0), toLen: Math.round(ct?.L ?? 0) };
    // shapes: centroids (light-weighted), for the timing
    const shapeC = new Map();
    for (const q of src) { const e = shapeC.get(q.shape) ?? [0, 0, 0]; e[0] += q.c[0] * q.M; e[1] += q.c[1] * q.M; e[2] += q.M; shapeC.set(q.shape, e); }
    const centre = (id) => { const e = shapeC.get(id); return e ? [e[0] / e[2], e[1] / e[2]] : o.heartFrom; };
    const clusterC = new Map();
    for (const q of tgt) { const e = clusterC.get(q.shape) ?? [0, 0, 0]; e[0] += q.c[0] * q.M; e[1] += q.c[1] * q.M; e[2] += q.M; clusterC.set(q.shape, e); }
    const tcentre = (id) => { const e = clusterC.get(id); return e ? [e[0] / e[2], e[1] / e[2]] : o.heartTo; };
    const base = { cfg, cls };
    if (cs && ct) {
      const clampN = (L) => Math.max(o.minUnits, Math.min(o.maxUnits, Math.round(L / (cfg.unitLen ?? o.unitLen))));
      const Ns = clampN(cs.L), Nt = clampN(ct.L);
      const A = units(cs, Ns), B = units(ct, Nt);
      const { sig, orphans } = pairUnits(A, B, cfg.far, cfg.spine);
      // the moves: each shape as a whole, then each (shape -> new shape) part
      const whole = new Map(), part = new Map(), byShape = new Map();
      for (let k = 0; k < Ns; k++) {
        if (sig[k] < 0) continue;
        const g = A[k].shape, c = B[sig[k]].shape, pr = [A[k].c, B[sig[k]].c];
        if (!whole.has(g)) whole.set(g, []); whole.get(g).push(pr);
        const key = g + '>' + c;
        if (!part.has(key)) part.set(key, []); part.get(key).push(pr);
        if (!byShape.has(g)) byShape.set(g, []); byShape.get(g).push(k);
      }
      const Tw = new Map(), Tp = new Map(), landing = new Map();
      for (const [g, prs] of whole) Tw.set(g, fit(prs, cfg.scale));
      for (const [key, prs] of part) Tp.set(key, fit(prs, cfg.scale, Tw.get(+key.split('>')[0]).s));
      // where each shape lands (light-weighted mean distance of its parts' new shapes from the new heart): its timing
      for (const [g, ks] of byShape) {
        let d = 0; for (const k of ks) { const c = tcentre(B[sig[k]].shape); d += Math.hypot(c[0] - htx, c[1] - hty); }
        landing.set(g, d / ks.length);
      }
      const nearestPart = (g, p) => {           // a surplus bit follows the part of its shape nearest to it
        let best = null, bd = Infinity;
        for (const k of byShape.get(g) ?? []) { const dd = d2(A[k].c, p); if (dd < bd) { bd = dd; best = k; } }
        return best === null ? null : g + '>' + B[sig[best]].shape;
      };
      const moveOf = (g, key, S) => {
        const W = Tw.get(g), P = key ? Tp.get(key) : null;
        if (!W) return { G: [0, 0], P: [0, 0], at: S };
        if (cfg.partsOnly) { const p = apply(P ?? W, S); return { G: [p[0] - S[0], p[1] - S[1]], P: [0, 0], at: p }; }
        const w = apply(W, S), p = P ? apply(P, S) : w;
        return { G: [w[0] - S[0], w[1] - S[1]], P: [p[0] - w[0], p[1] - w[1]], at: p };
      };
      const timing = (g, S, mode) => {
        const c = centre(g), fs = clamp01(Math.hypot(c[0] - hfx, c[1] - hfy) / o.reachFrom);
        const ft = clamp01((landing.get(g) ?? Math.hypot(c[0] - htx, c[1] - hty)) / o.reachTo);
        const mix = mode === 1 && !landing.has(g) ? 1 : o.delayMix;
        return cfg.start + cfg.spread * (mix * Math.pow(fs, 0.85) + (1 - mix) * ft) + 0.04 * clamp01(Math.hypot(S[0] - c[0], S[1] - c[1]) / 260);
      };
      let travel = 0;
      for (const r of runsOf(sig)) {
        if (r.surplus) {
          if (cfg.dropSurplus) continue;
          emitAlone(cs, r.k0 / Ns, (r.k1 + 1) / Ns, o.maxLen, (p) => {
            const q = alone(p), g = p.s.shape;
            // one part for the whole piece (chosen at its middle): its two ends must not be pulled toward different parts
            const key = nearestPart(g, [(q.S[0][0] + q.S[1][0]) / 2, (q.S[0][1] + q.S[1][1]) / 2]);
            q.mv = q.S.map((S) => (cfg.staySurplus     // the surplus fades where it stands (the maze dissolves in place, it doesn't fly)
              ? { G: [0, 0], P: [0, 0], R: [0, 0], delay: timing(g, S, 1), g, c: S }
              : { ...moveOf(g, key, S), R: [0, 0], delay: timing(g, S, 1), g, c: centre(g) }));
            recs.push({ ...base, mode: 1, ...q });
          });
          continue;
        }
        let fwd, lo, hi;
        if (r.d === 0 || r.k0 === r.k1) {
          const j = sig[r.k0];
          const a0 = at(cs, r.k0 / Ns + 1e-9), a1 = at(cs, (r.k0 + 1) / Ns - 1e-9), b0 = at(ct, j / Nt + 1e-9), b1 = at(ct, (j + 1) / Nt - 1e-9);
          fwd = d2(a0, b0) + d2(a1, b1) <= d2(a0, b1) + d2(a1, b0); lo = j / Nt; hi = (j + 1) / Nt;
        } else if (r.d === 1) { fwd = true; lo = sig[r.k0] / Nt; hi = (sig[r.k1] + 1) / Nt; }
        else { fwd = false; lo = sig[r.k1] / Nt; hi = (sig[r.k0] + 1) / Nt; }
        emitChunk(cs, ct, r.k0 / Ns, (r.k1 + 1) / Ns, lo, hi, fwd, o.maxLen, (p) => {
          const q = pair(p), g = p.s.shape, key = g + '>' + p.t.shape;
          const k2 = Tp.has(key) ? key : nearestPart(g, [(q.S[0][0] + q.S[1][0]) / 2, (q.S[0][1] + q.S[1][1]) / 2]);
          q.mv = q.S.map((S, e) => {
            const m = moveOf(g, k2, S);
            return { ...m, R: [q.T[e][0] - m.at[0], q.T[e][1] - m.at[1]], delay: timing(g, S, 0), g, c: centre(g) };
          });
          recs.push({ ...base, mode: 0, ...q });
        });
        travel++;
      }
      for (const j of orphans) emitAlone(ct, j / Nt, (j + 1) / Nt, o.maxLen, (p) => {
        const q = alone(p, true), c = tcentre(p.s.shape);
        const d = cfg.start + cfg.spread * clamp01(Math.hypot(c[0] - htx, c[1] - hty) / o.reachTo);
        q.mv = q.S.map(() => ({ G: [0, 0], P: [0, 0], R: [0, 0], delay: d, g: -1 }));
        recs.push({ ...base, mode: 2, ...q });
      });
      Object.assign(st, { unitsFrom: Ns, unitsTo: Nt, chunks: travel, shapes: whole.size, parts: part.size,
        surplusUnits: [...sig].filter((x) => x < 0).length, growUnits: orphans.length });
    } else if (cs) {
      emitAlone(cs, 0, 1, o.maxLen, (p) => { const q = alone(p); q.mv = q.S.map((S) => ({ G: [0, 0], P: [0, 0], R: [0, 0], delay: timing0(S), g: -1 })); recs.push({ ...base, mode: 1, ...q }); });
    } else if (ct) {
      emitAlone(ct, 0, 1, o.maxLen, (p) => { const q = alone(p, true); q.mv = q.S.map(() => ({ G: [0, 0], P: [0, 0], R: [0, 0], delay: cfg.start + cfg.spread, g: -1 })); recs.push({ ...base, mode: 2, ...q }); });
    }
    function timing0(S) { return cfg.start + cfg.spread * clamp01(Math.hypot(S[0] - hfx, S[1] - hfy) / o.reachFrom); }
    st.pieces = recs.filter((r) => r.cls === cls).length;
  }

  // ---- pack ----
  const yRange = new Map();                    // per class: the new picture's top and bottom (for arriveUp)
  for (const r of recs) if (r.mode === 0) {
    const e = yRange.get(r.cls) ?? [Infinity, -Infinity];
    for (const T of r.T) { e[0] = Math.min(e[0], T[1]); e[1] = Math.max(e[1], T[1]); }
    yRange.set(r.cls, e);
  }
  const out = new Float32Array(recs.length * STRIDE);
  // each side's lines keep their own material's hot colour (a game tunes several): a small table, pieces carry two indices
  const hotTable = [], hotIdx = new Map();
  const hotOf = (h) => { h = h ?? [1.0, 1.7, 12.0]; const k = h.map((v) => v.toFixed(3)).join(); if (!hotIdx.has(k)) { hotIdx.set(k, Math.min(HOTS - 1, hotTable.length / 3)); if (hotTable.length / 3 < HOTS) hotTable.push(...h); } return hotIdx.get(k); };
  recs.forEach((r, i) => {
    const b = i * STRIDE, cfg = r.cfg;
    out[b] = r.mode; out[b + 1] = r.order < underOrder ? 1 : 0;
    out[b + 2] = r.sw; out[b + 3] = r.tw; out[b + 4] = r.sCore; out[b + 5] = r.tCore; out[b + 6] = r.sHalo; out[b + 7] = r.tHalo;
    out[b + 8] = cfg.dur; out[b + 9] = (cfg.lift ? 1 : 0) | (cfg.settle || r.tSettle ? 2 : 0);
    out[b + HEAD + 2 * END] = hotOf(r.sHot); out[b + HEAD + 2 * END + 1] = hotOf(r.tHot);
    for (let e = 0; e < 2; e++) {
      const S = r.S[e], mv = r.mv[e], q = b + HEAD + e * END;
      // the bow: sideways to the whole-shape move, outward from the heart (the same side for the whole shape)
      const G = mv.G, Gl = Math.hypot(G[0], G[1]);
      let Bx = 0, By = 0;
      if (Gl > 1e-6 && cfg.bend > 0) {
        const nx = -G[1] / Gl, ny = G[0] / Gl, c = mv.c ?? S;
        const side = Math.max(-1, Math.min(1, ((c[0] - hfx) * nx + (c[1] - hfy) * ny) / o.bowReach));
        Bx = nx * cfg.bend * Gl * side; By = ny * cfg.bend * Gl * side;
      }
      let delay = mv.delay, dur = cfg.dur;
      if (cfg.byFront && r.mode !== 2) {      // leave as the wipe front passes (it uncovers the new plate as it goes)
        const F = o.front, r0 = Math.hypot(S[0] - hfx, S[1] - hfy) / F.reach;
        delay = Math.max(0, Math.min(1 - cfg.dur, F.from + (F.to - F.from) * r0 - F.lead));
      }
      if (cfg.arriveUp && r.mode === 0) {     // land on schedule: the bottom of the new figure first, its top last
        const yb = yRange.get(r.cls), T = r.T[e];
        const land = cfg.arriveUp[0] + (cfg.arriveUp[1] - cfg.arriveUp[0]) * clamp01((yb[1] - T[1]) / Math.max(1, yb[1] - yb[0]));
        delay = Math.min(delay, land - 0.28); dur = land - delay;
      }
      delay = Math.max(0, Math.min(delay, 1 - dur));
      out.set([S[0], S[1], G[0], G[1], mv.P[0], mv.P[1], mv.R[0], mv.R[1], Bx, By, delay, ...r.cS[e], ...r.cT[e], dur], q);
    }
  });
  stats.pieces = recs.length;
  stats.ms = +(performance.now() - t0).toFixed(1);
  const refs = recs.map((r) => [r.refS ?? null, r.refT ?? null]);
  return { pieces: out, count: recs.length, stats, hots: Float32Array.from(hotTable), refs };
}

export function finishPlan(d) {
  const { pieces: out, refs } = d;
  return {
    ...d,
    /** New colours from a fresh capture of the SAME pictures (positions unchanged, light changed: a flicker, a star's
     *  breathing): the pairing stays, the colours at both ends follow the pictures as they are now. */
    refresh(from, to) {
      const colour = (strokes, ref, e) => {
        const [si, i, rev, ta, tb] = ref, q = strokes[si]?.seg[i];
        if (!q) return null;
        const a = rev ? q.cb : q.ca, b = rev ? q.ca : q.cb, t = e ? tb : ta;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      };
      for (let k = 0; k < refs.length; k++) for (let e = 0; e < 2; e++) {
        const q = k * STRIDE + HEAD + e * END, [rs, rt] = refs[k];
        if (rs) { const c = colour(from, rs, e); if (c) out.set(c, q + 11); }
        if (rt) { const c = colour(to, rt, e); if (c) out.set(c, q + 14); }
      }
    },
  };
}

const tIn = (s, mu) => clamp01((mu - s.m0) / (s.m1 - s.m0));
function pair(p) {
  const { s, t, sm, tm } = p;
  return {
    refS: [...s.ref, tIn(s, sm[0]), tIn(s, sm[1])], refT: [...t.ref, tIn(t, tm[0]), tIn(t, tm[1])],
    tSettle: !!t.settle, order: s.order, sw: s.w, tw: t.w, sCore: s.core, tCore: t.core, sHalo: s.halo, tHalo: t.halo, sHot: s.hot, tHot: t.hot,
    S: [posIn(s, sm[0]), posIn(s, sm[1])], T: [posIn(t, tm[0]), posIn(t, tm[1])],
    cS: [colIn(s, sm[0]), colIn(s, sm[1])], cT: [colIn(t, tm[0]), colIn(t, tm[1])],
  };
}
function alone(p, isTarget = false) {
  const { s, m } = p, P = [posIn(s, m[0]), posIn(s, m[1])], C = [colIn(s, m[0]), colIn(s, m[1])], Z = [[0, 0, 0], [0, 0, 0]];
  const ref = [...s.ref, tIn(s, m[0]), tIn(s, m[1])];
  return {
    refS: isTarget ? null : ref, refT: isTarget ? ref : null,
    tSettle: isTarget && !!s.settle, order: isTarget ? Infinity : s.order, sw: s.w, tw: s.w, sCore: s.core, tCore: s.core, sHalo: s.halo, tHalo: s.halo, sHot: s.hot, tHot: s.hot,
    S: P, T: P, cS: isTarget ? Z : C, cT: isTarget ? C : Z,
  };
}
