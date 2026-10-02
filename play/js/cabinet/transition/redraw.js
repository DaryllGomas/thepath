// THE REDRAW · the transition between two cabinet games: the lines of the game you beat rearrange themselves into the
// next game's picture, on the glass, with no cut and no black. One machine redrawing itself to show the next piece of
// the map.
//
//   const rd = createRedraw(renderer, fromGame, toGame, { index: 0, duration: 3.6, ... })
//       fromGame / toGame: cabinet games from createXGame() (anything with .kit, a look kit). Drive them to their states
//       first: fromGame showing its WON frame, toGame showing its first READY frame (both views updated, no play after).
//   rd.begin()          capture both pictures, pair the lines (cached while the pictures are the same), mirror the plates
//   rd.update(dt)       advance (dt in seconds; pass dt x 0.25 for slow motion) and render; returns u (0..1)
//   rd.done             u reached 1: the last frame IS toGame's own frame; hand the glass back to it
//   rd.blit(vp?)        draw the redraw's picture to the canvas (like game.blit)
//   rd.handoff()        -> a ProgressRow already attached to toGame's kit, showing the row as the redraw left it
//   rd.end()            drop the mirrors (the games are never modified; nothing to restore in them)
//   rd.plan / rd.stats  the pairing (plan.js) and its numbers; rd.kit the redraw's own look kit
//
// The layers, in the redraw's own look kit (its bloom, persistence and tube ease from the old game's look to the new):
//   the plates    mirrors of both games' painted plates (same textures, same shaders, frozen uniforms). A soft round
//                 wipe grows from the old game's heart: behind it the old plate is gone and the new one is up, so the
//                 cave "dims out as the night sky comes up in its place". The old plate's extra occluders (Hearth's front
//                 stones over the fire's base) fade with it.
//   the pieces    every glow line of both games (capture.js), paired and moved (plan.js): at u = 0 they ARE the old
//                 game's lines, at u = 1 the new game's. Optional painted STRUCTURE (lines traced off each plate: the
//                 cave's rock edges, the sky's figure) lifts off the old plate as the wipe passes and settles into the new.
//                 They are drawn in the kit's crisp layer (no persistence: a fast line must not print a comb of ghost
//                 copies, a stripe field) and moved on the GPU (material.js): the plan is uploaded once, a frame sets u.
// Reusing it for another pair: the capture, the pairing and the mirrors are generic (any two look-kit games with the
// same frame); per pair set heartFrom / heartTo, index (and lit), and optionally a structure trace for each plate
// (tools/transition_trace_cave.py shows how one was made for Hearth; a game whose figure is already data, like the
// Constellation's STROKES, passes it directly).
//   glow & sparks mirrors of both games' glow dots and embers: the old ones fade as the fire's light leaves, the new ones
//                 come up at the end
//   the light     one gold light leaves the old game's heart and drops into dot `index` of the row, which stays lit
// Safety: every change is eased and slow (the wipe edge is 2 x soft px wide and takes ~2.6 s to cross the glass); no
// step, no flash, nothing red; the lines dim a little in flight. Measured by tools/transition_shots.mjs.
import * as THREE from 'three';
import { createLookKit, LineBatch, GlowDots, GlowLineMaterial, star } from '../lookkit/index.js';
import { captureLines, litStrokes, structureStrokes } from './capture.js';
import { buildPlan, STRIDE } from './plan.js';
import { buildPlanAsync } from './planasync.js';
import { RedrawPieceMaterial, pieceMesh } from './material.js';
import { ProgressRow } from './progress.js';

export const REDRAW_DEFAULTS = {
  duration: 3.6,                 // s
  index: 0,                      // the dot that lights (the game just beaten)
  lit: [],                       // dots already lit before this one
  heartFrom: [627, 468],         // where the old picture's light lives (Hearth: the fire)
  heartTo: [632, 770],           // where the new picture forms first (the Constellation: the temple)
  wipe: { from: 0.03, to: 0.72, soft: 230, reach: 1000 },
  look: { from: 0.3, to: 0.7 },  // the look kit's bloom / persistence / tube ease across this span
  light: { from: 0.05, to: 0.6, lift: 120 },
  dimOld: [0.0, 0.28], riseNew: [0.72, 1.0],   // the old glow dots / embers fade out, the new ones come up
  row: { count: 7, y: 872, spacing: 64, cx: 633 },
  rowIn: [0.02, 0.2],
  flightDim: 0.22,               // lines dim this much at mid-flight
  paintDim: 0.55,                // lifted paint dims more in flight: the gold lines are the heroes
  scaleAt: 0.5,                  // when the glass changes from the old game's renderScale to the new one's (only if they differ)
  hudOrder: 40,                  // line batches at or above this renderOrder are the HUD (score, timers)
  fromStructure: null, toStructure: null,   // { lines, color, width } painted structure traced off each plate
  plan: {},                      // overrides for plan.js
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };      // smootherstep
const span = (u, a, b) => ease((u - a) / (b - a));

const BACKDROP_MAIN = 'gl_FragColor = vec4(shade(f, vec2(uv.x, 1.0 - uv.y), texture2D(map, uv)), 1.0);';

// ---------------- the look (read from a kit, eased between two) ----------------
function lookOf(k) {
  const c = k.crt.mat.uniforms, skip = new Set(['tDiffuse', 'res', 'linearOut']);
  const crt = {};
  for (const [n, u] of Object.entries(c)) if (!skip.has(n)) crt[n] = u.value?.clone ? u.value.clone() : u.value;
  return {
    strength: k.bloom.strength, radius: k.bloom.radius, threshold: k.bloom.threshold,
    tint: k.bloom.bloomTintColors.map((v) => v.clone()),
    tau: k.composer.passes.includes(k.phosphor) ? k.phosphor.tau.clone() : new THREE.Vector3(1e-4, 1e-4, 1e-4), crt,
  };
}
function lerpInto(dst, a, b, w) {
  if (typeof a === 'number') return a + (b - a) * w;
  if (a.isColor) return dst.setRGB(a.r + (b.r - a.r) * w, a.g + (b.g - a.g) * w, a.b + (b.b - a.b) * w);
  return dst.copy(a).lerp(b, w);
}
function applyLook(kit, A, B, w) {
  kit.bloom.strength = A.strength + (B.strength - A.strength) * w;
  kit.bloom.radius = A.radius + (B.radius - A.radius) * w;
  kit.bloom.threshold = A.threshold + (B.threshold - A.threshold) * w;
  kit.bloom.bloomTintColors.forEach((v, i) => v.copy(A.tint[i]).lerp(B.tint[i], w));
  kit.phosphor.tau.copy(A.tau).lerp(B.tau, w);
  const U = kit.crt.mat.uniforms;
  for (const n of Object.keys(A.crt)) {
    if (!(n in U) || !(n in B.crt)) continue;
    const v = lerpInto(U[n].value, A.crt[n], B.crt[n], w);
    if (typeof v === 'number') U[n].value = v;
  }
}

// ---------------- mirrors of the games' plates, glows and sparks ----------------
function shareTextures(clone, orig) {
  for (const [n, u] of Object.entries(orig.uniforms ?? {})) if (u.value?.isTexture) clone.uniforms[n].value = u.value;
}
/** A Backdrop-shader plate, masked by the wipe. additive: the first plate (over the black clear); else an occluder. */
function maskedPlate(mat, additive) {
  if (!mat.isShaderMaterial || !mat.fragmentShader.includes(BACKDROP_MAIN)) return null;
  const m = mat.clone();
  shareTextures(m, mat);
  Object.assign(m.uniforms, { rdC: { value: new THREE.Vector2() }, rdR: { value: 0 }, rdS: { value: 200 }, rdIn: { value: 0 } });
  const call = 'shade(f, vec2(uv.x, 1.0 - uv.y), texture2D(map, uv))';
  m.fragmentShader = m.fragmentShader
    .replace('void main() {', `uniform vec2 rdC; uniform float rdR, rdS, rdIn;
      float rdMask(vec2 f) { float k = smoothstep(rdR - rdS, rdR + rdS, length(f - rdC)); return mix(k, 1.0 - k, rdIn); }
      void main() {`)
    .replace(BACKDROP_MAIN, additive ? `gl_FragColor = vec4(${call} * rdMask(f), 1.0);` : `gl_FragColor = vec4(${call}, rdMask(f));`);
  m.transparent = true; m.depthTest = false; m.depthWrite = false;
  m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  return m;
}

/** Any other shader mesh of a game (the Ascent's painted islands, fills, bands): the same shader, frozen, its light masked by
 *  the wipe in frame coordinates worked out from gl_FragCoord (so no knowledge of the game's own vertex shader). */
function maskedMesh(mat, size) {
  if (!mat.isShaderMaterial || !/void\s+main\s*\(\s*\)/.test(mat.fragmentShader)) return null;
  const m = mat.clone();
  shareTextures(m, mat);
  Object.assign(m.uniforms, { rdC: { value: new THREE.Vector2() }, rdR: { value: 0 }, rdS: { value: 200 }, rdIn: { value: 0 },
    rdRes: { value: new THREE.Vector2(1, 1) }, rdFrame: { value: new THREE.Vector2(...size) } });
  const normal = mat.blending === THREE.NormalBlending;
  m.fragmentShader = m.fragmentShader.replace(/void\s+main\s*\(\s*\)/, 'void rdGameMain()');
  m.fragmentShader += `
    uniform vec2 rdC, rdRes, rdFrame; uniform float rdR, rdS, rdIn;
    void main() {
      rdGameMain();
      vec2 f = vec2(gl_FragCoord.x / rdRes.x, 1.0 - gl_FragCoord.y / rdRes.y) * rdFrame;
      float k = smoothstep(rdR - rdS, rdR + rdS, length(f - rdC)), w = mix(k, 1.0 - k, rdIn);
      ${normal ? 'gl_FragColor.a *= w;' : 'gl_FragColor.rgb *= w;'}
    }`;
  return m;
}

function mirrorsOf(cap, side) {
  const out = { plates: [], glows: [], extras: [], all: [] };
  const plates = cap.meshes.filter(({ obj }) => obj.isMesh && !obj.isLineSegments2 && obj.material?.isShaderMaterial
    && obj.material.fragmentShader?.includes(BACKDROP_MAIN)).sort((a, b) => a.obj.renderOrder - b.obj.renderOrder);
  plates.forEach(({ obj }, i) => {
    const m = maskedPlate(obj.material, i === 0);
    const mesh = new THREE.Mesh(obj.geometry, m);
    mesh.renderOrder = i === 0 ? (side === 'from' ? -10 : -9.5) : obj.renderOrder;
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(obj.matrixWorld); mesh.frustumCulled = false;
    mesh.userData.occluder = i > 0;
    out.plates.push({ mesh, occluder: i > 0, order: obj.renderOrder }); out.all.push(mesh);
  });
  for (const { obj } of cap.meshes) {
    if (!obj.isMesh || obj.isLineSegments2 || plates.some((p) => p.obj === obj)) continue;
    const m = maskedMesh(obj.material, cap.frame);
    if (!m) continue;
    const mesh = new THREE.Mesh(obj.geometry, m);
    mesh.renderOrder = obj.renderOrder; mesh.matrixAutoUpdate = false; mesh.matrix.copy(obj.matrixWorld); mesh.frustumCulled = false;
    out.extras.push({ mesh, side }); out.all.push(mesh);
  }
  for (const { obj } of cap.meshes) {
    if (!obj.isPoints || !obj.material?.uniforms) continue;
    const m = obj.material.clone(); shareTextures(m, obj.material);
    const pts = new THREE.Points(obj.geometry, m);
    pts.renderOrder = obj.renderOrder; pts.matrixAutoUpdate = false; pts.matrix.copy(obj.matrixWorld); pts.frustumCulled = false;
    out.glows.push({ pts, gain0: m.uniforms.gain?.value ?? 1 }); out.all.push(pts);
  }
  return out;
}

// ---------------- the redraw ----------------
export function createRedraw(renderer, fromGame, toGame, opts = {}) {
  const o = { ...REDRAW_DEFAULTS, ...opts, wipe: { ...REDRAW_DEFAULTS.wipe, ...opts.wipe }, look: { ...REDRAW_DEFAULTS.look, ...opts.look },
    light: { ...REDRAW_DEFAULTS.light, ...opts.light }, row: { ...REDRAW_DEFAULTS.row, ...opts.row } };
  const kA = fromGame.kit, kB = toGame.kit;
  if (kA.frame[0] !== kB.frame[0] || kA.frame[1] !== kB.frame[1]) console.warn('redraw: the two games use different frames');
  let LA = lookOf(kA), LB = lookOf(kB);      // re-read at begin(): a game's bloom / tube can move with its state (the Beacon's swells as it lights)
  // overlay: the moving pieces are drawn in the kit's crisp layer (after the phosphor persistence, still bloomed): a line
  // moving fast must not print a comb of ghost copies of itself (that would be a stripe field), as the Constellation's
  // falling shapes don't. Static lines look the same in either layer, so the first and last frames still match.
  // renderScale (the look kit's optional supersampling, e.g. the Tunnel's 1.5): the redraw's glass is drawn at the old
  // game's scale and switches to the new game's at u = scaleAt, where the old glows are out and the new not yet in (so
  // the switch, which clears the persistence, is not seen); the last frame is then at the new game's own size. Two games
  // at the same scale (all the others: 1) make no change at all.
  const sA = kA.renderScale ?? 1, sB = kB.renderScale ?? 1, scaled = Math.abs(sA - sB) > 1e-6 || sA !== 1;
  const kit = createLookKit(renderer, { frame: kA.frame, width: kA.width, height: kA.height, overlay: true,
    ...(scaled ? { renderScale: sA } : {}),
    bloom: { strength: LA.strength, radius: LA.radius, threshold: LA.threshold }, phosphor: { tau: LA.tau.toArray() } });
  const mat = kit.track(new RedrawPieceMaterial({ flightDim: o.flightDim, paintDim: o.paintDim }));
  const matLight = kit.track(new GlowLineMaterial({ width: 8 }));
  let under = null, over = null, lightLines = new LineBatch(matLight, 64);
  lightLines.object.renderOrder = 24; kit.overlay.add(lightLines.object);
  const lightDots = kit.track(new GlowDots(8)); lightDots.object.renderOrder = 24; kit.overlay.add(lightDots.object);
  const row = new ProgressRow(o.row).attach(kit);

  let prepared = null;
  // both pictures as strokes (+ their meshes), and the order below which the old lines go under the old plate's occluders
  function gather() {
    const cA = captureLines(kA, { hudOrder: o.hudOrder }), cB = captureLines(kB, { hudOrder: o.hudOrder });
    const from = litStrokes(cA.strokes), to = litStrokes(cB.strokes);
    if (o.fromStructure) from.push(...structureStrokes(o.fromStructure.lines, o.fromStructure));
    if (o.toStructure) to.push(...structureStrokes(o.toStructure.lines, o.toStructure));
    const occ = cA.meshes.filter(({ obj }) => obj.isMesh && !obj.isLineSegments2 && obj.material?.isShaderMaterial
      && obj.material.fragmentShader?.includes(BACKDROP_MAIN)).map(({ obj }) => obj.renderOrder).sort((a, b) => a - b).slice(1);
    return { cA, cB, from, to, underOrder: occ.length ? Math.min(...occ) : -Infinity };
  }
  const planOpts = (underOrder) => ({ heartFrom: o.heartFrom, heartTo: o.heartTo, underOrder,
    front: { from: o.wipe.from, to: o.wipe.to, reach: o.wipe.reach, lead: 0.03 }, ...o.plan });
  let plan = null, sig = '', mirrors = null, t = 0, u = 0, rowState = [], curScale = sA;
  // point sizes of the mirrored glows / embers follow the scale (they are clones, so the kit does not track them)
  function setScale(sc) {
    if (!scaled) return;
    if (Math.abs(sc - curScale) > 1e-6) { curScale = sc; kit.setSize(kit.width, kit.height, sc); kit.resetPersistence(); }
    if (mirrors) for (const M of [mirrors.A, mirrors.B]) for (const q of M.glows) if (q.pts.material.uniforms.pxScale) q.pts.material.uniforms.pxScale.value = kit.renderHeight / 768;
  }
  // the ahead-of-time half of begin(): see rd.warm(). Sets the plan, the piece meshes and the mirrors (in the kit's scenes).
  let staged = null;
  function stage(gpu) {
    const t0 = performance.now();
    const mk = [], M = (n) => mk.push([n, +(performance.now() - t0).toFixed(1)]);
    const { cA, cB, from, to, underOrder } = gather(); M('gather');
    const mA = mirrorsOf(cA, 'from'), mB = mirrorsOf(cB, 'to');
    const s = signature(from) + '|' + signature(to) + '|' + underOrder;
    M('mirrors'); rd.stale = false;
    if (s !== sig || !plan) {
      if (prepared && prepared.plan && prepared.sig === s) { plan = prepared.plan; plan.refresh(from, to); plan.prepared = true; }
      else { rd.stale = !!prepared; plan = buildPlan(from, to, planOpts(underOrder)); plan.prepared = false; }
      sig = s;
      for (const m of [under, over]) if (m) { kit.overlay.remove(m); m.geometry.dispose(); }
      // the pieces live on the GPU: uploaded once here, moved by one uniform (u) each frame
      under = pieceMesh(plan, (i) => plan.pieces[i * STRIDE + 1] > 0, mat);
      over = pieceMesh(plan, (i) => !(plan.pieces[i * STRIDE + 1] > 0), mat);
      under.renderOrder = underOrder === -Infinity ? 10 : underOrder - 0.05; over.renderOrder = 12;
      kit.overlay.add(under, over);
    } else {                                 // same pictures: keep the pairing, take the light as it is now
      plan.refresh(from, to);
      for (const [m, pick] of [[under, (i) => plan.pieces[i * STRIDE + 1] > 0], [over, (i) => !(plan.pieces[i * STRIDE + 1] > 0)]]) {
        const fresh = pieceMesh(plan, pick, mat);
        m.geometry.dispose(); m.geometry = fresh.geometry;
      }
    }
    prepared = null; M('meshes');
    rd.end();
    mirrors = { A: mA, B: mB };
    // the old plate's occluders (drawn over lines below them: Hearth's front stones over the fire's base) go in the
    // crisp layer with the pieces, between the 'under' and 'over' batches, so the first frame still matches
    for (const m of [...mA.all, ...mB.all]) (m.userData.occluder ? kit.overlay : kit.scene).add(m);
    setScale(sA);
    const st = { mA, mB, marks: mk, ready: false, done: null };
    st.done = !gpu ? Promise.resolve(true) : (async () => {
      try {
        const prev = renderer.getRenderTarget();
        let pr;
        renderer.setRenderTarget(kit.output);                    // (the programs' colour-space key is the target's)
        try { pr = Promise.all([renderer.compileAsync(kit.scene, kit.camera), kit.overlay ? renderer.compileAsync(kit.overlay, kit.camera) : null]); }
        finally { renderer.setRenderTarget(prev); }
        await pr;
        M('compiled');
        rd._apply(0, 0); kit.render(1 / 60); M('warm draw');       // (buffers, targets and programs on the GPU; the picture is redrawn by begin())
      } catch (e) { console.warn('[redraw] warm', e); }
      st.ready = true; return true;
    })();
    if (!gpu) st.ready = true;
    return st;
  }
  const rd = {
    kit, get plan() { return plan; }, get stats() { return plan?.stats; }, get u() { return u; }, get done() { return u >= 1; },
    options: o,

    /** Ahead of begin(), while the old game's won frame is held STILL (the host freezes it): captures both pictures and starts the
     *  pairing in a Web Worker (planasync.js), so begin() finds the plan built and costs a few ms instead of 70-300. begin()
     *  checks the pictures are the same ones (signature); if they moved it builds on the spot as it always did (rd.stats.stale). */
    prepare() {
      const g = gather(), s = signature(g.from) + '|' + signature(g.to) + '|' + g.underOrder;
      if (plan && s === sig) { prepared = null; return; }            // the same pictures as the plan on hand: nothing to build
      const job = prepared = { sig: s, plan: null, t0: performance.now(), ms: 0 };
      buildPlanAsync(g.from, g.to, planOpts(g.underOrder)).then((p) => { job.plan = p; job.ms = performance.now() - job.t0; });
    },
    /** true when nothing is pending: prepare() was not called, the plan is built, or it needed none */
    get planReady() { return !prepared || !!prepared.plan; },
    get preparedMs() { return prepared && prepared.plan ? +prepared.ms.toFixed(1) : prepared ? null : 0; },

    /** begin()'s heavy half, done ahead of time (the host does it in the still stretch once the plan is in): reads the pictures,
     *  adopts the plan, builds the pieces' meshes and the plate / glow mirrors, and gets the GPU ready to draw them (shaders
     *  compiled without blocking, then one warm draw into the redraw's own kit). Nothing on the glass changes.
     *  Returns a promise; rd.warmed says when it's done. begin() calls it itself if the host didn't. */
    warm() {
      if (!staged) staged = stage(true);
      return staged.done;
    },
    get warmed() { return !!(staged && staged.ready); },

    begin() {
      const t0 = performance.now();
      if (!staged) staged = stage();
      const st = staged; staged = null;
      const { mA, mB } = st;
      const mk = rd.marks = [...st.marks, ['begin']];
      const M = (n) => mk.push([n, +(performance.now() - t0).toFixed(1)]);
      LA = lookOf(kA); LB = lookOf(kB);
      applyLook(kit, LA, LA, 0);
      mirrors = { A: mA, B: mB };
      setScale(sA);
      rowState = Array.from({ length: row.count }, (_, i) => (o.lit.includes(i) ? 1 : 0));
      t = 0; u = 0;
      kit.resetPersistence();
      rd._apply(0, 0); M('apply');
      // the old game's glass has a few frames of persistence behind it (its embers leave short trails): draw the last
      // three held frames again (the sparks' clock stepped back) so the first frame of the redraw carries the same trails
      const clocks = mA.glows.map((g) => g.pts.material.uniforms.time).filter(Boolean);
      const now = clocks.map((c) => c.value), step = 1 / 60;
      for (let k = 3; k >= 0; k--) { clocks.forEach((c, i) => { c.value = now[i] - k * step; }); kit.render(step); M('render' + k); }
      plan.beginMs = +(performance.now() - t0).toFixed(1);
      return plan;
    },

    update(dt) {
      if (!plan) return 1;
      t += Math.max(0, dt);
      u = Math.min(1, t / o.duration);
      rd._apply(u, dt);
      kit.render(Math.min(Math.max(dt, 1e-4), 0.1));
      return u;
    },

    /** Everything for progress u (no rendering): the look, the wipe, the glows, the pieces, the light, the row. */
    _apply(uu, dt) {
      if (scaled) setScale(uu >= o.scaleAt ? sB : sA);
      applyLook(kit, LA, LB, span(uu, o.look.from, o.look.to));
      const W = o.wipe, R = -W.soft + (W.reach + 2 * W.soft) * span(uu, W.from, W.to);
      for (const [side, M] of [['from', mirrors.A], ['to', mirrors.B]]) {
        for (const p of M.plates) {
          const U = p.mesh.material.uniforms;
          U.rdC.value.set(...o.heartFrom); U.rdR.value = R; U.rdS.value = W.soft; U.rdIn.value = side === 'from' ? 0 : 1;
        }
        for (const x of M.extras) {
          const U = x.mesh.material.uniforms;
          U.rdC.value.set(...o.heartFrom); U.rdR.value = R; U.rdS.value = W.soft; U.rdIn.value = side === 'from' ? 0 : 1;
          U.rdRes.value.set(kit.renderWidth, kit.renderHeight);
        }
        const g = side === 'from' ? 1 - span(uu, o.dimOld[0], o.dimOld[1]) : span(uu, o.riseNew[0], o.riseNew[1]);
        for (const q of M.glows) {
          const U = q.pts.material.uniforms;
          if (U.gain) U.gain.value = q.gain0 * g;
          if (U.time && side === 'from') U.time.value += dt;
          q.pts.visible = g > 0.001;
        }
      }
      mat.u = uu;
      drawLight(uu);
    },

    blit(vp) { kit.blit(vp); },

    /** A progress row attached to toGame's kit, lit as the redraw left it (the new game shows it from here on). */
    handoff(existing) {
      const r = existing ?? new ProgressRow(o.row).attach(kB);
      r.draw(rowState, 1);
      return r;
    },

    end() {
      if (!mirrors) return;
      for (const m of [...mirrors.A.all, ...mirrors.B.all]) { m.removeFromParent(); m.material.dispose(); }
      mirrors = null;
    },
    dispose() { rd.end(); kit.dispose(); },
  };

  // the gold light: out of the old heart, up a little, over and down into its dot; a short fading tail behind it
  function lightAt(s) {
    const P0 = o.heartFrom, P3 = row.pos(o.index), L = o.light.lift;
    const P1 = [P0[0] + (P3[0] - P0[0]) * 0.1, P0[1] - L], P2 = [P3[0], P3[1] - 260];
    const w = 1 - s;
    return [w * w * w * P0[0] + 3 * w * w * s * P1[0] + 3 * w * s * s * P2[0] + s * s * s * P3[0],
      w * w * w * P0[1] + 3 * w * w * s * P1[1] + 3 * w * s * s * P2[1] + s * s * s * P3[1]];
  }
  function drawLight(uu) {
    const L = o.light, s = span(uu, L.from, L.to);
    const born = ease((uu - L.from) / 0.08), merged = 1 - ease((uu - L.to) / 0.1);
    const g = born * merged;
    lightLines.clear(); lightDots.clear();
    rowState[o.index] = Math.max(o.lit.includes(o.index) ? 1 : 0, span(uu, L.to - 0.04, L.to + 0.12));
    if (g > 0.002) {
      const [x, y] = lightAt(s);
      lightDots.add(x, y, 38, [0.32 * g, 0.17 * g, 0.03 * g]);
      lightDots.add(x, y, 11, [1.5 * g, 0.95 * g, 0.3 * g]);
      star(lightLines, x, y, 16 * g, [1.3 * g, 0.8 * g, 0.16 * g], 4, 0.4);
      // the tail: where the light was over the last 0.16 of its path, fading
      if (s > 0.001 && s < 1) {
        let prev = [x, y];
        for (let k = 1; k <= 22; k++) {
          const sk = Math.max(0, s - k * 0.011), p = lightAt(sk), f = g * (1 - k / 23) ** 1.5;
          lightLines.seg(prev[0], prev[1], p[0], p[1], [1.2 * f, 0.7 * f, 0.14 * f], [1.2 * f * 0.9, 0.7 * f * 0.9, 0.14 * f * 0.9]);
          prev = p;
          if (sk <= 0) break;
        }
      }
    }
    lightLines.commit(); lightDots.commit();
    row.draw(rowState, span(uu, o.rowIn[0], o.rowIn[1]));
  }

  return rd;
}

function signature(strokes) {
  let h = strokes.length, n = 0;
  for (const s of strokes) { n += s.seg.length; for (let i = 0; i < s.pts.length; i += 7) h = (h * 31 + Math.round(s.pts[i] * 8)) | 0; }
  return h + ':' + n;
}
