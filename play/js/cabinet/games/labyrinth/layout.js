// THE NODE · THE LABYRINTH (cabinet level 4) · THE MAZE. Pure data + geometry (headless, Node-safe): shared by the round,
// the bots and the view. Frame coords = the plate's pixels (1266 x 952), x right, y DOWN; the plate is MEASURED
// (tools/labyrinth_measure.py -> plate_measured.js), never traced. Nothing here is a raw trace: every lane is a straight
// segment on exact numbers, mirror-symmetric left/right and top/bottom.
//
// THE GRAPH (a real corridor graph: movement runs on it)
//   NODES   junctions, corners, door nodes (on a corridor, where a room's door opens off it), room slots
//   EDGES   'lane'   a corridor's centre line (walls at +-HW either side)
//           'door'   a room door: from the corridor's centre line to the room's rim (HW long); open when the room's
//                    arrangement reaches that rim slot
//           'sec'    a room's own lanes (its ARRANGEMENT); open or closed by the room's state
//           'tunnel' the side tunnel (no light on it); 'wrap' joins the two tunnel ends off the glass
// THE ROOMS (the rebuild): seven discs that turn by a quarter: four SHRINES (the corners: a bar through the gold power
//   diamond, a turnstile), two WINGS (the sides: a bar on the tunnel's axis), and THE HEART (the centre: a diamond ring
//   round the still pen, with two stubs out). Each keeps the SAME hidden skeleton: its slot nodes are 4-fold symmetric, so
//   a quarter turn maps slots onto slots and only the arrangement turns (which doors are open). A turning room carries
//   whatever is inside it (entities, light); its doors are shut while it turns. Every arrangement always reaches two
//   doors, so nothing is ever stranded.
//
//   edgePoint(e, s) leaveDir(e, fromNode) other(e, n) rotAbout(sec, p, th)   fixedWalls() roomWalls(sec, open) openAfter(sec, k)
//   placeLight()   apspFor(open) pointToNode(A, e, s, j) dijkstra(...)   SACRED (the resolved figure)
import { MEASURED } from './plate_measured.js';

export const FRAME = MEASURED.frame;                  // [1266, 952]
export const CENTRE = MEASURED.centre;                // [630.46, 459.93]: where the watermark's axes cross
const [CX, CY] = CENTRE;
export const GLASS = MEASURED.glass;                  // [103, 44, 1160, 877]

// ---- the numbers (relative to CENTRE). Chosen so the outer walls sit inside the measured glass with a margin
// (the tube's corners cut in: the 30-px chamfers keep the corner walls >= 13 px inside it) ----
export const HW = 20;                 // a lane's half-width: walls at +-20 from its centre line (lanes 40 wide)
export const DIM = Object.freeze({
  TOP: 342,           // the outer top / bottom rows (a band left above for the score, as the concept has it)
  SIDE: 458,          // the outer left / right columns
  RS: 58,             // a shrine's / wing's rim (disc radius)
  RH: 166,            // the heart's rim
  A: 126,             // the heart ring's vertex distance (its lane's centre line)
  OCT: 78,            // the octagon round the heart: its corners at (+-78, +-186) and (+-186, +-78)
  CH: 30,             // the outer corners' chamfer
  TUN: 508,           // the tunnel's mouth (x), just inside the glass
  WRAP: 60,           // the off-glass length of the wrap (so the tunnel costs a little time)
  SPACING: 38,        // light (pellets) along a lane, about this far apart
});
const R = DIM.RS + HW;                // 78: a room's centre to the corridor centre lines around it

// ---------------------------------------------------------------------------------------------------------------------
function build() {
  const nodes = [], edges = [], byKey = new Map(), byPair = new Map();
  const key = (x, y) => Math.round(x * 4) + ',' + Math.round(y * 4);
  const node = (lx, ly, o) => {
    const k = key(lx, ly);
    let id = byKey.get(k);
    if (id == null) {
      id = nodes.length;
      nodes.push({ id, lx, ly, x: CX + lx, y: CY + ly, sec: -1, slot: null, doorOf: null, edges: [] });
      byKey.set(k, id);
    }
    if (o) Object.assign(nodes[id], o);
    return id;
  };
  const edge = (a, b, kind, o) => {
    const k = Math.min(a, b) + '-' + Math.max(a, b);
    if (byPair.has(k)) return byPair.get(k);
    const A = nodes[a], B = nodes[b], id = edges.length;
    const e = { id, a, b, kind, sec: -1, L: Math.hypot(B.x - A.x, B.y - A.y), light: kind === 'lane', ...(o || {}) };
    if (kind === 'wrap') e.L = DIM.WRAP;
    edges.push(e); byPair.set(k, id);
    A.edges.push(id); B.edges.push(id);
    return id;
  };
  const chain = (pts, kind = 'lane', o) => { for (let i = 1; i < pts.length; i++) edge(pts[i - 1], pts[i], kind, o); };

  const { TOP: T, SIDE: S, CH, OCT } = DIM;
  const Y2 = -T + 2 * R, X2 = -S + 2 * R;             // -204 (the row under the top shrines), -302 (the column inside them)
  const XH = DIM.RH + HW;                              // 204: the octagon's rows / columns
  // ---- the fixed corridors, one quadrant at a time (defined top-left, mirrored) ----
  for (const [mx, my] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const P = (x, y) => node(mx * x, my * y);
    const cA = P(-S + CH, -T), cB = P(-S, -T + CH);                           // the corner's chamfer
    const A2 = P(-S + R, -T), A3 = P(X2, -T), St1 = P(-226, -T), St2 = P(-166, -T + 60), D = P(-166, Y2);
    const B1 = P(-S, -T + R), B3 = P(X2, -T + R);
    const C1 = P(-S, Y2), C2 = P(-S + R, Y2), C3 = P(X2, Y2);
    const O1 = P(-OCT, -XH), O2 = P(-XH, -OCT), HN = P(0, -XH), HW_ = P(-XH, 0);
    const E1 = P(-S, -R), E2 = P(-S + R, -R), E3 = P(X2, -R);
    const F1 = P(-S, 0), F3 = P(X2, 0);
    chain([cA, A2, A3, St1, St2, D]);                 // the top row, then the stepped path down toward the heart
    chain([cB, cA]);                                  // the chamfer
    chain([cB, B1, C1, E1, F1]);                      // the outer column
    chain([A3, B3, C3]);                              // the column inside the shrine
    chain([E3, F3]);
    chain([C1, C2, C3, D, O1, HN]);                   // the row under the shrine, on to the heart's door
    chain([O1, O2, HW_]);                             // the octagon round the heart: a diagonal, then its column
    chain([E1, E2, E3]);                              // the row over the wing
    chain([F3, HW_]);                                 // the axis row: wing -> heart
    if (my === 1) {                                   // the tunnel (once per side)
      const TN = P(-DIM.TUN, 0);
      edge(F1, TN, 'tunnel', { light: false });
    }
  }
  // the heart's octagon carries no light (the pursuers' road, as round the old ghost house)
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b];
    const onOct = (n) => (Math.abs(Math.abs(n.ly) - XH) < 0.5 && Math.abs(n.lx) <= OCT + 0.5) ||
      (Math.abs(Math.abs(n.lx) - XH) < 0.5 && Math.abs(n.ly) <= OCT + 0.5);
    if (onOct(A) && onOct(B)) e.light = false;
  }
  // the wrap joins the two tunnel mouths off the glass
  const TL = node(-DIM.TUN, 0), TR = node(DIM.TUN, 0);
  edge(TL, TR, 'wrap', { light: false });

  // ---- THE ROOMS ----
  const sections = [];
  const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
  const room = (name, group, lx, ly, rim, kind, turn, baseOpen) => {
    const sec = { id: sections.length, name, group, lx, ly, x: CX + lx, y: CY + ly, rim, kind, turn, slots: {}, cand: [], base: [], doors: [] };
    const slot = (tag, ox, oy) => { const id = node(lx + ox, ly + oy, { sec: sec.id, slot: tag }); sec.slots[tag] = id; return id; };
    const ep = (a, b) => { const id = edge(a, b, 'sec', { sec: sec.id, light: false }); sec.cand.push(id); return id; };
    if (kind === 'bar') {
      const O = slot('O', 0, 0);
      for (const [d, [dx, dy]] of Object.entries(DIRS)) {
        const r = slot('r' + d, dx * rim, dy * rim);
        const e = ep(O, r);
        if (baseOpen.includes(d)) { sec.base.push(e); edges[e].light = true; }
      }
    } else {                                           // the heart: a diamond ring (always whole) + stubs out
      const A = DIM.A;
      for (const [d, [dx, dy]] of Object.entries(DIRS)) slot('v' + d, dx * A, dy * A);
      for (const [d, [dx, dy]] of Object.entries(DIRS)) slot('r' + d, dx * rim, dy * rim);
      for (const [a, b] of [['N', 'E'], ['E', 'S'], ['S', 'W'], ['W', 'N']]) {
        const e = ep(sec.slots['v' + a], sec.slots['v' + b]); sec.base.push(e); edges[e].light = true;
      }
      for (const d of Object.keys(DIRS)) {
        const e = ep(sec.slots['v' + d], sec.slots['r' + d]);
        if (baseOpen.includes(d)) sec.base.push(e);     // the stubs carry no light (they swing; short)
      }
    }
    // the doors: the corridor node beyond each rim slot (on the corridor's centre line, HW past the rim)
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      const rimN = sec.slots['r' + d];
      const doorN = node(lx + dx * (rim + HW), ly + dy * (rim + HW));
      nodes[doorN].doorOf = { sec: sec.id, dir: d };
      const e = edge(doorN, rimN, 'door', { sec: sec.id, light: false, dir: d });
      sec.doors.push({ dir: d, rim: rimN, node: doorN, edge: e });
    }
    sections.push(sec);
    return sec;
  };
  // the shrines turn as mirror images (TL clockwise, TR anticlockwise, ...) so the maze stays symmetric mid-turn too
  const sx = -S + R, sy = -T + R;
  room('shrineTL', 'shrines', sx, sy, DIM.RS, 'bar', 1, ['N', 'S']);
  room('shrineTR', 'shrines', -sx, sy, DIM.RS, 'bar', -1, ['N', 'S']);
  room('shrineBL', 'shrines', sx, -sy, DIM.RS, 'bar', -1, ['N', 'S']);
  room('shrineBR', 'shrines', -sx, -sy, DIM.RS, 'bar', 1, ['N', 'S']);
  room('wingL', 'wings', sx, 0, DIM.RS, 'bar', 1, ['W', 'E']);
  room('wingR', 'wings', -sx, 0, DIM.RS, 'bar', -1, ['W', 'E']);
  room('heart', 'heart', 0, 0, DIM.RH, 'heart', 1, ['N', 'S']);

  // one quarter turn of each room: slot -> slot (clockwise on screen, y down: (x, y) -> (-y, x)), edge -> edge
  for (const sec of sections) {
    const perm = new Map();
    for (const id of Object.values(sec.slots)) {
      const n = nodes[id], ox = n.lx - sec.lx, oy = n.ly - sec.ly;
      const [qx, qy] = sec.turn > 0 ? [-oy, ox] : [oy, -ox];
      const to = byKey.get(key(sec.lx + qx, sec.ly + qy));
      if (to == null) throw new Error('room ' + sec.name + ': a slot has no image under a quarter turn');
      perm.set(id, to);
    }
    sec.perm = perm;
    sec.emap = new Map();
    for (const e of sec.cand) {
      const E = edges[e], a2 = perm.get(E.a), b2 = perm.get(E.b), k = Math.min(a2, b2) + '-' + Math.max(a2, b2);
      const e2 = byPair.get(k);
      if (e2 == null) throw new Error('room ' + sec.name + ': an edge has no image under a quarter turn');
      sec.emap.set(e, { e: e2, flip: edges[e2].a !== a2 });
    }
  }
  return { nodes, edges, sections };
}

export const MAZE = build();
export const NODES = MAZE.nodes, EDGES = MAZE.edges, SECTIONS = MAZE.sections;
export const GROUPS = ['shrines', 'wings', 'heart'];                     // the order the rooms turn in
export const GROUP_SECTIONS = Object.fromEntries(GROUPS.map((g) => [g, SECTIONS.filter((s) => s.group === g).map((s) => s.id)]));
export const HEART = SECTIONS.find((s) => s.name === 'heart');
export const START = NODES.find((n) => n.lx === 0 && Math.abs(n.ly - (DIM.RH + HW)) < 0.5).id;   // below the heart
export const CHASER_START = NODES.find((n) => n.lx === 0 && Math.abs(n.ly + (DIM.RH + HW)) < 0.5).id;  // above it
export const SHRINE_CENTRES = SECTIONS.filter((s) => s.group === 'shrines').map((s) => s.slots.O);
export const TUNNEL_ENDS = [NODES.find((n) => n.lx === -DIM.TUN && n.ly === 0).id, NODES.find((n) => n.lx === DIM.TUN && n.ly === 0).id];

// ---------------------------------------------------------------------------------------------------------------------
// geometry on the graph
export const other = (e, n) => (EDGES[e].a === n ? EDGES[e].b : EDGES[e].a);
/** The unit direction leaving node n along edge e (the wrap leaves each mouth outward). */
export function leaveDir(e, n) {
  const E = EDGES[e];
  if (E.kind === 'wrap') return [NODES[n].lx < 0 ? -1 : 1, 0];
  const A = NODES[n], B = NODES[other(e, n)], L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  return [(B.x - A.x) / L, (B.y - A.y) / L];
}
/** The point at distance s from E.a along edge e (base orientation: rooms' turning is applied by the caller).
 *  On the wrap: the first half runs on past the left mouth, the second half comes in toward the right one. */
export function edgePoint(e, s, out = [0, 0]) {
  const E = EDGES[e], A = NODES[E.a], B = NODES[E.b];
  if (E.kind === 'wrap') {
    const left = A.lx < 0 ? A : B, right = A.lx < 0 ? B : A, fromLeft = A.lx < 0;
    const u = fromLeft ? s : E.L - s;                   // distance from the left mouth along the wrap
    if (u <= E.L / 2) { out[0] = left.x - u; out[1] = left.y; } else { out[0] = right.x + (E.L - u); out[1] = right.y; }
    return out;
  }
  const t = E.L > 0 ? s / E.L : 0;
  out[0] = A.x + (B.x - A.x) * t; out[1] = A.y + (B.y - A.y) * t;
  return out;
}
/** Rotate a frame point about room sec's centre by angle th (radians; positive = clockwise on screen). */
export function rotAbout(sec, p, th, out = [0, 0]) {
  const S = SECTIONS[sec], c = Math.cos(th), s = Math.sin(th), dx = p[0] - S.x, dy = p[1] - S.y;
  out[0] = S.x + dx * c - dy * s; out[1] = S.y + dx * s + dy * c;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// THE WALLS: each lane is bounded by a wall line HW either side of its centre line; where lanes meet, the walls meet at
// the mitre corners between neighbouring lanes (so a wall between two parallel lanes reads as a double line, as the
// arcade's did). Door nodes always keep their door gap (a "leaf" closes it when the door is shut: the view animates it).
//
//   buildWalls(edgeIds, { virtual: Map(node -> [[dx, dy], ...]), offset })
//       -> { segs: [[x0, y0, x1, y1, edgeId]], corners: Map(node -> [{ from, to, p }]) }
//   virtual directions shape the mitres (a door that's always a gap; a room's rim slot that continues out through its
//   door) but draw no wall of their own.
export function buildWalls(edgeIds, o = {}) {
  const off = o.offset ?? HW, virtual = o.virtual ?? new Map();
  const inc = new Map();                            // node -> [{ ang, d, e }]
  const add = (n, d, e) => { if (!inc.has(n)) inc.set(n, []); inc.get(n).push({ ang: Math.atan2(d[1], d[0]), d, e }); };
  for (const e of edgeIds) {
    const E = EDGES[e];
    if (E.kind === 'wrap') continue;
    add(E.a, leaveDir(e, E.a), e); add(E.b, leaveDir(e, E.b), e);
  }
  for (const [n, dirs] of virtual) if (inc.has(n)) for (const d of dirs) add(n, d, -1);
  // side point of edge e at node n: 'ccw' = the side toward increasing angle (left of the leaving direction, y down)
  const at = new Map();                             // `${e}:${n}:ccw|cw` -> [x, y]
  const corners = new Map();
  for (const [n, list] of inc) {
    list.sort((p, q) => p.ang - q.ang);
    const P = NODES[n], m = list.length;
    for (let i = 0; i < m; i++) {
      const a = list[i], b = list[(i + 1) % m];
      let gap = b.ang - a.ang; if (m === 1) gap = Math.PI * 2; else if (gap <= 1e-9) gap += Math.PI * 2;
      const na = [-a.d[1], a.d[0]], nb = [b.d[1], -b.d[0]];     // a's normal toward the wedge, b's normal toward it
      let p;
      if (m === 1) p = null;                                     // a dead end (the tunnel mouth): no corner, open end
      else if (Math.abs(gap - Math.PI) < 1e-6) p = [P.x + na[0] * off, P.y + na[1] * off];
      else {
        // intersect P + off*na + t*a.d with P + off*nb + u*b.d
        const ox = (nb[0] - na[0]) * off, oy = (nb[1] - na[1]) * off;
        const det = a.d[0] * -b.d[1] - a.d[1] * -b.d[0];
        const t = (ox * -b.d[1] - oy * -b.d[0]) / det;
        p = [P.x + na[0] * off + a.d[0] * t, P.y + na[1] * off + a.d[1] * t];
      }
      if (a.e >= 0) at.set(a.e + ':' + n + ':ccw', p);
      if (b.e >= 0) at.set(b.e + ':' + n + ':cw', p);
      if (!corners.has(n)) corners.set(n, []);
      corners.get(n).push({ from: a, to: b, p });
    }
  }
  const segs = [];
  for (const e of edgeIds) {
    const E = EDGES[e];
    if (E.kind === 'wrap') continue;
    const A = NODES[E.a], B = NODES[E.b], d = leaveDir(e, E.a), n = [-d[1], d[0]];
    // the side left of A->B (toward increasing angle at A) ends at B on B's 'cw' side of e
    for (const [sa, sb, sg] of [['ccw', 'cw', 1], ['cw', 'ccw', -1]]) {
      let p0 = at.get(e + ':' + E.a + ':' + sa), p1 = at.get(e + ':' + E.b + ':' + sb);
      if (!p0) p0 = [A.x + n[0] * off * sg, A.y + n[1] * off * sg];      // an open end: square across the lane
      if (!p1) p1 = [B.x + n[0] * off * sg, B.y + n[1] * off * sg];
      segs.push([p0[0], p0[1], p1[0], p1[1], e]);
    }
  }
  return { segs, corners };
}

/** The fixed walls: every non-room lane (and the tunnel), with a permanent gap at each door. Also each door's LEAF: the
 *  wall piece that closes its gap ([x0, y0, x1, y1] from one corner of the gap to the other). */
export function fixedWalls(offset = HW) {
  const ids = EDGES.filter((e) => e.kind === 'lane' || e.kind === 'tunnel').map((e) => e.id);
  const virtual = new Map();
  for (const S of SECTIONS) for (const d of S.doors) {
    const D = NODES[d.node], Rn = NODES[d.rim], L = Math.hypot(Rn.x - D.x, Rn.y - D.y);
    virtual.set(d.node, [[(Rn.x - D.x) / L, (Rn.y - D.y) / L]]);
  }
  for (const n of TUNNEL_ENDS) virtual.set(n, [[NODES[n].lx < 0 ? -1 : 1, 0]]);
  const w = buildWalls(ids, { offset, virtual });
  const leaves = [];
  for (const S of SECTIONS) for (const d of S.doors) {
    const cs = w.corners.get(d.node) || [], a = cs.find((c) => c.to.e === -1), b = cs.find((c) => c.from.e === -1);
    if (a && b && a.p && b.p) leaves.push({ sec: S.id, dir: d.dir, node: d.node, seg: [a.p[0], a.p[1], b.p[0], b.p[1]] });
  }
  return { segs: w.segs, leaves };
}

/** A room's walls for an open set of its edges (base orientation): rim slots that are reached continue out through
 *  their doors (virtual), so the walls meet the corridor's door gap exactly. */
export function roomWalls(sec, openIds, offset = HW) {
  const S = SECTIONS[sec], virtual = new Map();
  for (const d of S.doors) {
    if (!openIds.some((e) => EDGES[e].a === d.rim || EDGES[e].b === d.rim)) continue;
    const Rn = NODES[d.rim];
    virtual.set(d.rim, [[(Rn.x - S.x) / S.rim, (Rn.y - S.y) / S.rim]]);
  }
  return buildWalls(openIds, { offset, virtual }).segs;
}

/** A room's open edge set after k quarter turns of its base arrangement. */
export function openAfter(sec, k) {
  const S = SECTIONS[sec];
  let open = S.base.slice();
  for (let i = 0; i < k; i++) open = open.map((e) => S.emap.get(e).e);
  return open;
}

// ---------------------------------------------------------------------------------------------------------------------
// THE LIGHT: gold nodes along the lanes (the pellets), and the four power diamonds at the shrines' centres.
//   { id, e, s, power }   on a room's edge they ride with it
export function placeLight() {
  const out = [], seen = new Set();
  const put = (e, s, power = false) => { out.push({ id: out.length, e, s, power }); };
  const nodeLight = (n, e) => {
    if (seen.has(n)) return;
    seen.add(n);
    const E = EDGES[e];
    put(e, E.a === n ? 0 : E.L);
  };
  for (const E of EDGES) {
    if (!E.light) continue;
    if (E.kind === 'sec') {
      // a room's lane: the power diamond at a shrine's heart; light spaced along the rest
      const S = SECTIONS[E.sec];
      const O = S.slots.O;
      const n = Math.max(1, Math.round(E.L / DIM.SPACING));
      for (let k = 1; k < n; k++) put(E.id, E.L * k / n);
      if (O != null && (E.a === O || E.b === O) && !seen.has(O)) {
        seen.add(O); put(E.id, E.a === O ? 0 : E.L, S.group === 'shrines');
      }
      if (S.kind === 'heart') { for (const n2 of [E.a, E.b]) if (!seen.has(n2)) { seen.add(n2); put(E.id, E.a === n2 ? 0 : E.L); } }
      continue;
    }
    const n = Math.max(1, Math.round(E.L / DIM.SPACING));
    for (let k = 1; k < n; k++) put(E.id, E.L * k / n);
    for (const nd of [E.a, E.b]) {
      const N = NODES[nd];
      if (N.sec >= 0) continue;
      nodeLight(nd, E.id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// THE SACRED FIGURE (the watermark, measured): what the maze resolves into when all the light is gathered. Clean
// geometry placed where the plate measured it (symmetric: the painting's 1-2 px wobbles are straightened).
function arcPts(cx, cy, r, a0, a1, step = 0.03) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
function buildSacred() {
  const M = MEASURED, P = (x, y) => [CX + x, CY + y], parts = [];
  const push = (kind, pts, r0) => parts.push({ kind, pts, r0: r0 ?? Math.min(...pts.map(([x, y]) => Math.hypot(x - CX, y - CY))) });
  const T = M.triangle, Dm = M.diamonds, Ht = M.heart;
  // the axes
  push('axis', [P(0, T.outer.apex), P(0, -T.outer.apex)], 0);
  push('axis', [P(-365, 0), P(365, 0)], 0);
  // the gate triangles, outer and inner, top and (mirrored) bottom
  for (const sg of [1, -1]) for (const t of [T.outer, T.inner]) {
    push('tri', [P(0, sg * t.apex), P(t.half, sg * t.base), P(-t.half, sg * t.base), P(0, sg * t.apex)]);
  }
  // the small diamonds: top / bottom (each with a small inner diamond), the centre one, the side ones
  const dia = (x, y, h) => [P(x, y - h), P(x + h, y), P(x, y + h), P(x - h, y), P(x, y - h)];
  const ty = Math.abs(Dm.top.y), th = Dm.top.half;
  for (const sg of [1, -1]) { push('dia', dia(0, -sg * ty, th)); push('dia', dia(0, -sg * ty, th * 0.3)); }
  push('dia', dia(0, 0, Dm.centreHalf), 0);
  for (const sg of [1, -1]) push('dia', dia(sg * Math.abs(Dm.side.x), 0, Dm.side.half));
  // the heart's outline, one quarter (top-left) built then mirrored: the side vertex, a 45-degree diagonal up to the
  // shoulder, the shoulder, then the dome (a circle arc, its centre measured a little past the axis) up to the top
  // diamond's side vertex
  const vx = Math.abs(Ht.vertex[0]), shy = (Math.abs(Ht.shoulder[0]) + Math.abs(Ht.shoulder[1])) / 2;
  const dcx = Ht.dome.cx, dcy = -Math.abs(Ht.dome.cy), dr = Ht.dome.r;          // the top-left dome's centre (dcx, dcy)
  const footX = dcx - Math.sqrt(dr * dr - (-shy - dcy) * (-shy - dcy));
  const a0 = Math.atan2(-shy - dcy, footX - dcx), a1 = Math.atan2(-ty - dcy, -th - dcx);
  const quarter = [[-vx, 0], [-(vx - shy), -shy], [footX, -shy], ...arcPts(dcx, dcy, dr, a0, a1).slice(1)];
  for (const sx of [1, -1]) for (const sy of [1, -1]) push('heart', quarter.map(([x, y]) => P(sx * x, sy * y)));
  // the upright vesica: the left boundary is an arc of the circle centred right of the axis, and vice versa
  const V = M.vesica, vd = Math.abs(V.cx), vr = V.r, al = Math.atan2(Math.sqrt(vr * vr - vd * vd), vd);
  push('vesica', arcPts(vd, 0, vr, Math.PI - al, Math.PI + al).map(([x, y]) => P(x, y)));
  push('vesica', arcPts(-vd, 0, vr, -al, al).map(([x, y]) => P(x, y)));
  // the two lying lenses either side of the centre: each an upper arc (circle centred below) and a lower one
  const Ln = M.lens, lx = Math.abs(Ln.cx), ld = Math.abs(Ln.cy), lr = Ln.r, lh = Math.sqrt(lr * lr - ld * ld);
  for (const sx of [1, -1]) for (const cyc of [ld, -ld]) {
    const cxl = sx * lx, tL = Math.atan2(-cyc, -lh), tR = Math.atan2(-cyc, lh);
    push('lens', arcPts(cxl, cyc, lr, Math.min(tL, tR), Math.max(tL, tR)).map(([x, y]) => P(x, y)));
  }
  return parts;
}
export const SACRED = buildSacred();

// ---------------------------------------------------------------------------------------------------------------------
// SHORTEST PATHS. The maze has only a handful of door arrangements, so all-pairs distances are computed once per
// arrangement (a Dijkstra from every node, on a small binary heap) and cached: a query is then a lookup.
//   const A = apspFor(open)      open = Uint8Array per edge; A[i * NODES.length + j] = the shortest open path i -> j
//   pointToNode(A, e, s, j)      from a point on edge e (at s from E.a) to node j
export function dijkstra(sources, open, out, canExpand) {
  const n = NODES.length;
  out.fill(Infinity);
  const heap = [], hd = [];
  const push = (node, d) => {
    heap.push(node); hd.push(d);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hd[p], hd[i]] = [hd[i], hd[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], td = hd[0], ln = heap.pop(), ld = hd.pop();
    if (heap.length) {
      heap[0] = ln; hd[0] = ld;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && hd[l] < hd[m]) m = l;
        if (r < heap.length && hd[r] < hd[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; [hd[m], hd[i]] = [hd[i], hd[m]]; i = m;
      }
    }
    return [top, td];
  };
  for (const [node, d] of sources) if (d < out[node]) { out[node] = d; push(node, d); }
  while (heap.length) {
    const [u, du] = pop();
    if (du > out[u]) continue;
    if (canExpand && !canExpand(u, du)) continue;
    for (const e of NODES[u].edges) {
      if (!open[e]) continue;
      const v = other(e, u), d = du + EDGES[e].L;
      if (d < out[v]) { out[v] = d; push(v, d); }
    }
  }
  void n;
  return out;
}
const APSP = new Map();
export function apspFor(open) {
  let key = '';
  for (let i = 0; i < open.length; i++) key += open[i] ? '1' : '0';
  let A = APSP.get(key);
  if (A) return A;
  const n = NODES.length, row = new Float64Array(n);
  A = new Float64Array(n * n);
  for (let i = 0; i < n; i++) { dijkstra([[i, 0]], open, row); A.set(row, i * n); }
  if (APSP.size > 64) APSP.clear();
  APSP.set(key, A);
  return A;
}
export function pointToNode(A, e, s, j) {
  const E = EDGES[e], n = NODES.length;
  return Math.min(s + A[E.a * n + j], E.L - s + A[E.b * n + j]);
}
