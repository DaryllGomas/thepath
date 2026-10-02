// THE REDRAW · capture: what a look-kit scene draws this frame, as strokes (frame coords), read straight from the scene.
//
//   const cap = captureLines(kit, { hudOrder: 40 })
//     cap.strokes   [{ cls: 'live' | 'hud', order, pts: [x0, y0, x1, y1, ...], seg: [{ ca, cb, w, core, halo }] }]
//                   one stroke = a run of segments that join end to start (a polyline, or a closed loop), x right, y down.
//                   ca/cb = HDR colour at the segment's ends with the material's gain folded in (additive light, so gain
//                   is exact); w = width in reference px (material width x the segment's style width); core/halo = the
//                   material's core and halo gains. Dashes are cut exactly where the shader cuts them (the dash phase
//                   includes the crawl: time x speed); the gaps stay in the stroke as dark segments (ca = cb = 0), so a
//                   dashed ring is still ONE stroke.
//     cap.meshes    the other things on the glass (plates, glow dots, embers, fills), for the redraw to mirror
//     cap.lineObjects  the LineSegments2 objects read (the redraw hides them while it stands in for them)
//
// NOTHING in the look kit changes: LineBatch keeps its arrays on the geometry (instanceStart & co.), so this only reads
// buffers a frame already filled. Invisible objects (and invisible parents) are skipped, as the renderer skips them.
import * as THREE from 'three';

const EPS_JOIN = 0.05;          // frame px: segment ends closer than this join into one stroke
const _v = new THREE.Vector3();

/** Visible objects of a scene, in the order the renderer meets them (it sorts by renderOrder later). */
function visibleObjects(root) {
  const out = [];
  root.traverseVisible((o) => { if (o !== root) out.push(o); });
  return out;
}

function lum(c) { return Math.max(c[0], c[1], c[2]); }

export function captureLines(kit, o = {}) {
  const hudOrder = o.hudOrder ?? 40, minLight = o.minLight ?? 0.004;
  const roots = [kit.scene, kit.overlay].filter(Boolean);
  const strokes = [], meshes = [], lineObjects = [];
  for (const root of roots) {
    root.updateMatrixWorld(true);
    for (const obj of visibleObjects(root)) {
      if (obj.isLineSegments2 && obj.geometry.attributes.instanceStyle) {
        lineObjects.push(obj);
        readBatch(obj, obj.renderOrder >= hudOrder ? 'hud' : 'live', strokes, minLight);
      } else if (obj.isMesh || obj.isPoints) meshes.push({ obj, overlay: root === kit.overlay });
    }
  }
  return { strokes, meshes, lineObjects, frame: kit.frame };
}

function readBatch(obj, cls, strokes, minLight) {
  const g = obj.geometry, n = g.instanceCount;
  if (!n) return;
  const mat = obj.material, U = mat.uniforms;
  const pos = g.attributes.instanceStart.data.array, col = g.attributes.instanceColorStart.data.array;
  const dist = g.attributes.instanceDistanceStart.data.array, sty = g.attributes.instanceStyle.data.array;
  const gain = U.gain.value, time = U.time.value, dashOffset = mat.dashOffset ?? 0;
  const baseW = mat.baseWidth ?? 11, core = U.coreGain.value, halo = U.haloGain.value, hot = U.hot.value.toArray();   // the material's own hot colour (each game tunes it)
  const M = obj.matrixWorld;
  const P = (x, y) => { _v.set(x, y, 0).applyMatrix4(M); return [_v.x, -_v.y]; };
  let cur = null;                              // the stroke being grown
  const push = (a, b, ca, cb, w) => {
    const dark = lum(ca) < minLight && lum(cb) < minLight;
    const s = { ca: dark ? [0, 0, 0] : ca, cb: dark ? [0, 0, 0] : cb, w, core, halo, hot };
    if (cur && Math.abs(cur.pts[cur.pts.length - 2] - a[0]) < EPS_JOIN && Math.abs(cur.pts[cur.pts.length - 1] - a[1]) < EPS_JOIN
      && Math.abs(cur.seg[cur.seg.length - 1].w - w) < 1e-6) {
      cur.pts.push(b[0], b[1]); cur.seg.push(s);
    } else {
      cur = { cls, order: obj.renderOrder, obj: obj.id, pts: [a[0], a[1], b[0], b[1]], seg: [s] };
      strokes.push(cur);
    }
  };
  for (let i = 0; i < n; i++) {
    const A = P(pos[i * 6], pos[i * 6 + 1]), B = P(pos[i * 6 + 3], pos[i * 6 + 4]);
    const ca = [col[i * 6] * gain, col[i * 6 + 1] * gain, col[i * 6 + 2] * gain];
    const cb = [col[i * 6 + 3] * gain, col[i * 6 + 4] * gain, col[i * 6 + 5] * gain];
    const dash = sty[i * 4], gap = sty[i * 4 + 1], w = baseW * sty[i * 4 + 2], speed = sty[i * 4 + 3];
    const d0 = dist[i * 2], d1 = dist[i * 2 + 1];
    if (!(gap > 0) || d1 - d0 <= 1e-9) { push(A, B, ca, cb, w); continue; }
    // the shader discards where mod(d + dashOffset + time * speed, dash + gap) > dash: cut the segment there
    const per = dash + gap, ph = dashOffset + time * speed;
    const cuts = [0];
    let k = Math.floor((d0 + ph) / per);
    for (; ; k++) {
      for (const edge of [k * per + dash, (k + 1) * per]) {
        const d = edge - ph;
        if (d > d0 + 1e-6 && d < d1 - 1e-6) cuts.push((d - d0) / (d1 - d0));
      }
      if ((k + 1) * per - ph >= d1) break;
    }
    cuts.push(1);
    cuts.sort((x, y) => x - y);
    for (let j = 0; j + 1 < cuts.length; j++) {
      const u0 = cuts[j], u1 = cuts[j + 1];
      if (u1 - u0 < 1e-7) continue;
      const um = (u0 + u1) / 2, dm = d0 + (d1 - d0) * um;
      const on = ((((dm + ph) % per) + per) % per) <= dash;
      const L = (u) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u];
      const C = (u) => [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u];
      push(L(u0), L(u1), on ? C(u0) : [0, 0, 0], on ? C(u1) : [0, 0, 0], w);
    }
  }
}

/** Drops strokes with no light at all (card text at alpha 0, a faded ring), and trims dark segments off both ends. */
export function litStrokes(strokes, minLight = 0.004) {
  const out = [];
  for (const s of strokes) {
    const lit = s.seg.map((q) => lum(q.ca) >= minLight || lum(q.cb) >= minLight);
    let a = lit.indexOf(true); if (a < 0) continue;
    let b = lit.lastIndexOf(true);
    out.push({ ...s, pts: s.pts.slice(a * 2, (b + 2) * 2), seg: s.seg.slice(a, b + 1) });
  }
  return out;
}

/** Plain polylines (painted structure traced off a plate) -> strokes in the same form. eachOwn: every line is its own
 *  shape (a figure's lines), else lines that touch make one shape (a cave's rock network). */
export function structureStrokes(lines, o = {}) {
  const color = o.color ?? [0.9, 0.3, 0.02], w = o.width ?? 6, cls = o.cls ?? 'paint';
  return lines.map((l) => {
    const bright = typeof l[0] === 'number' ? l[0] : 1, pts = typeof l[0] === 'number' ? l.slice(1) : l;
    const c = [color[0] * bright, color[1] * bright, color[2] * bright];
    const flat = []; for (const p of pts) flat.push(p[0], p[1]);
    return { cls, order: -1, obj: o.obj ?? 'structure', eachOwn: !!o.eachOwn, pts: flat, seg: pts.slice(1).map(() => ({ ca: c, cb: c, w, core: o.core ?? 3.5, halo: o.halo ?? 0.8, hot: [1.0, 1.7, 12.0], settle: !!o.settle })) };
  });
}
