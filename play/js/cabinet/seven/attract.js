// THE CABINET WITH NO NAME · its START screen: THE FLOWER OF LIGHT (Daryll's pick, 9/29: "i think i actually like the first
// one"; docs/CONSOLIDATION/chatgpt/19_chatgpt_cabinet_attract_screen_2026-09-29.md). What glows on the glass whenever nobody
// is playing: no name, no title, no logo, never a game playing itself. One geometric flower, breathing, on the tube.
//
//   const A = await createAttract(renderer, { width: 1024, height: 768, renderScale })
//   A.update(dt, { words })   steps the flower and draws it into A.texture (words: 'INSERT COIN', or '' when a credit is in)
//   A.texture / A.kit         the look kit (the same glass as the seven games: js/cabinet/lookkit/)
//   A.seek(t) / A.info()      tests: the flower at time t; its state (breath, the twist)
//   A.dispose()
//
// THE HEARTH PRINCIPLE (docs/AI_GAMEDEV/PIPELINES.md section 10): the painting carries the look, code draws only what moves.
//   THE PLATE (assets/attract/attract_plate.png): the concept's tube with the flower, the loose motes and the words taken out.
//   THE FLOWER (assets/attract/attract_flower.png): the painted flower alone, as a sprite (the screen-difference from the
//     plate, so plate + flower in light IS the concept at rest). It moves as a whole: it breathes, and it turns a little.
//   THE CRISP LINES (attract_measured.js, fitted to the paint by tools/attract_measure.py): thin exact cores on the painted
//     inner star, its rings and the eight spokes: sharp over the paint's own glow, and the inner star is what turns.
//   Live light: the core's glow, faint rings rippling outward, drifting motes, INSERT COIN.
// HOW IT MOVES:
//   THE BREATH (8 s: in 3.5, out 4.5; 0.125 Hz): the flower swells 2.4% and settles; its centre glows brighter at the top of
//     each breath; INSERT COIN breathes faintly with it, a little behind.
//   THE RIPPLES: at the top of each breath a faint ring leaves the outer circle and drifts outward, fading (one or two at once).
//   THE MOTES drift slowly, each twinkling gently on its own slow cycle (3.5-7 s).
//   THE TURN ("the machine is thinking", every 24-31 s, 8.5 s long): the outer circles (the whole painted flower, its spokes)
//     turn a few degrees one way and come back; the inner star turns the other way one full step (60 degrees) and lands on its
//     own painted lines again. While it turns, the painting's heart softens into its glow so the moving star is the line you see,
//     and it sharpens again as the star lands.
// SAFETY (docs/RESEARCH/01_trance_and_the_ancestral_mind/05_SYNTHESIS.md): every change is eased and slow (the breath 0.125 Hz,
// the twinkles at most 0.29 Hz): nothing flashes, no colour cycles, no dense ring field (the ripples are one or two faint thin
// rings); the centre is a light, never a pupil: it does not track, widen or narrow; nothing looks back.
import * as THREE from 'three';
import { createLookKit, GlowLineMaterial, LineBatch, GlowDots, Backdrop, arc } from '../lookkit/index.js';
import { drawText } from '../games/hearth/font.js';
import { ATTRACT_MEASURED as M } from './attract_measured.js';

const ROOT = new URL('../../../', import.meta.url);
export const PLATE_URL = new URL('assets/attract/attract_plate.png', ROOT).href;
export const FLOWER_URL = new URL('assets/attract/attract_flower.png', ROOT).href;
export const FRAME = M.frame;                                   // [1266, 952], the games' frame (the redraw needs the same)

export const ATTRACT_LOOK = {
  frame: FRAME,
  // the painting carries its own glow: the kit's bloom only catches the hottest cores (the heart, the crisp lines' cores)
  bloom: { strength: 0.3, radius: 0.4, threshold: 2.4, tint: [1.0, 0.86, 0.72] },
  phosphor: { tau: [0.05, 0.045, 0.045] },
  // the plate already shows the tube and its bezel: no curvature, no glass edge of the kit's own
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.08, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.008 },
};

// ---------------------------------------------------------------- the choreography (seconds)
export const BREATH = { period: 8.0, inhale: 3.5, swell: 0.024 };
export const TWIST = { first: 9.0, gaps: [26, 31, 24, 29, 27], dur: 8.5, outerDeg: 5.0, innerDeg: -60.0 };
export const RIPPLE = { r0: 346, r1: 452, life: 6.4, max: 2 };
// the fine outer rings beyond the flower (the concept's faint violet circles; the plate's glass is clean of them): r in frame px
export const OUTER_RINGS = [[416, 0.1], [446, 0.07]];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const DEG = Math.PI / 180;

/** The breath at time t: 0 (settled) .. 1 (the top of the breath). In over 3.5 s, out over 4.5 s, eased both ways. */
export function breathAt(t) {
  const P = BREATH.period, ph = ((t % P) + P) % P;
  return ph < BREATH.inhale ? smoother(ph / BREATH.inhale) : 1 - smoother((ph - BREATH.inhale) / (P - BREATH.inhale));
}
/** The turn at time t: null, or { u (0..1 through it), outer (rad, + = clockwise on the glass), inner (rad), soft (0..1), n } */
export function twistAt(t) {
  let at = TWIST.first, n = 0;
  while (at + TWIST.dur < t) { at += TWIST.gaps[n % TWIST.gaps.length]; n++; }
  if (t < at) return null;
  const u = (t - at) / TWIST.dur;
  const out = Math.sin(Math.PI * smoother(u)); // out and back
  return {
    u, n,
    outer: TWIST.outerDeg * DEG * out * out,
    inner: TWIST.innerDeg * DEG * smoother((u - 0.06) / 0.86),
    soft: smooth(0.0, 0.16, u) * (1 - smooth(0.84, 1.0, u)),
    land: smooth(0.72, 0.94, u),                // the star's vertices settle onto the painted ones (they are not quite regular)
  };
}

// ---------------------------------------------------------------- the pictures
const GLASS = M.glass;
const inGlass = (x, y, k = 1) => Math.pow(Math.abs(x - GLASS.cx) / (GLASS.a * k), GLASS.p) + Math.pow(Math.abs(y - GLASS.cy) / (GLASS.b * k), GLASS.p) < 1;

const FLOWER_FRAG = /* glsl */`
  uniform sampler2D map; uniform float gain, soft, softR, softW; uniform vec2 c0;
  varying vec2 vUv;
  void main() {
    // the painted flower (the screen-difference from the plate); its heart softens into its glow while the star turns
    float r = length((vUv - c0) * ${M.flower.size[0].toFixed(1)});
    float k = soft * (1.0 - smoothstep(softR, softR + softW, r));
    vec3 c = texture2D(map, vUv, 1.8 * k).rgb;
    vec3 x = -log(max(vec3(1.0) - c, vec3(0.03)));            // the painting -> light (the tone map gives it back)
    gl_FragColor = vec4(x * gain * (1.0 - 0.55 * k), 1.0);
  }`;

function loadTexture(url) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  const ready = new Promise((resolve, reject) => {
    new THREE.ImageLoader().load(url, (img) => { tex.image = img; tex.needsUpdate = true; resolve(); }, undefined, reject);
  });
  return { tex, ready };
}

// the crisp colours (HDR): the painted gold's core, the pale inner ring, the violet-white of the ripples
const HOT_GOLD = [1.0, 1.9, 7.0];
const C = {
  gold: [0.9, 0.55, 0.12], pale: [0.95, 0.8, 0.55], violet: [0.62, 0.5, 1.0], ripple: [0.7, 0.58, 1.05],
  words: [1.0, 0.55, 0.15], core: [1.3, 1.05, 0.72], coreHalo: [0.34, 0.2, 0.08],
  moteGold: [1.1, 0.68, 0.24], moteViolet: [0.78, 0.64, 1.1], nodeGlint: [1.3, 0.95, 0.45],
};
const SOLID = { dash: 1, gap: 0, width: 1, speed: 0 };

export async function createAttract(renderer, opts = {}) {
  const kit = createLookKit(renderer, { ...ATTRACT_LOOK, width: opts.width ?? 1024, height: opts.height ?? 768,
    ...(opts.renderScale !== undefined ? { renderScale: opts.renderScale } : {}) });
  const { scene } = kit;
  const P = M.plate, [CX, CY] = M.flower.centre;
  const plate = loadTexture(PLATE_URL), flower = loadTexture(FLOWER_URL);

  // ---- layer 1: the plate (the empty tube), and the flower's breath warming the glass round it
  const backdrop = new Backdrop({
    frame: FRAME, map: plate.tex,
    uniforms: { halo: { value: 0 } },
    shade: /* glsl */`
      vec2 q = vec2((f.x * ${P.scale.toFixed(6)} + ${P.offset[0].toFixed(3)}) / ${P.size[0].toFixed(1)}, 1.0 - (f.y * ${P.scale.toFixed(6)} + ${P.offset[1].toFixed(3)}) / ${P.size[1].toFixed(1)});
      vec3 paint = texture2D(map, q).rgb;
      vec3 x = -log(max(vec3(1.0) - paint, vec3(0.03)));      // the painting -> light
      vec2 d = f - vec2(${CX.toFixed(2)}, ${CY.toFixed(2)});
      float rho2 = dot(d, d);
      // the breath's warmth on the glass: a soft halo round the flower (low, slow)
      x += halo * (vec3(0.010, 0.006, 0.013) * exp(-rho2 / (2.0 * 330.0 * 330.0)) + vec3(0.012, 0.007, 0.003) * exp(-rho2 / (2.0 * 150.0 * 150.0)));
      return x;`,
  });
  scene.add(backdrop.object);

  // ---- layer 2: the painted flower (one sprite, its origin at the flower's centre)
  const S = M.flower.size[0], FS = S / P.scale;                  // the sprite's size in frame px
  const cu = (M.flower.centre[0] * P.scale + P.offset[0] - M.flower.origin[0]) / S;
  const cv = (M.flower.centre[1] * P.scale + P.offset[1] - M.flower.origin[1]) / S;   // (from the top)
  const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5 - cu, cv - 0.5, 0);
  const fu = { map: { value: flower.tex }, gain: { value: 1 }, soft: { value: 0 }, softR: { value: 150 }, softW: { value: 34 },
    c0: { value: new THREE.Vector2(cu, 1 - cv) } };
  const flowerMesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: fu,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: FLOWER_FRAG, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }));
  flowerMesh.frustumCulled = false; flowerMesh.renderOrder = 1;
  flowerMesh.position.set(CX, -CY, 0); flowerMesh.scale.set(FS, FS, 1);
  scene.add(flowerMesh);

  // ---- live light
  const T = (o) => kit.track(new GlowLineMaterial(o));
  const matCrisp = T({ width: 1.7, coreFrac: 0.32, coreGain: 2.4, haloGain: 0.14, hot: HOT_GOLD });
  const matStar = T({ width: 2.9, coreFrac: 0.27, coreGain: 2.3, haloGain: 0.6, hot: [1.0, 1.3, 2.6] });
  const matRipple = T({ width: 2.2, coreFrac: 0.26, coreGain: 1.6, haloGain: 0.5, hot: [1.3, 1.4, 1.8] });
  const matWords = T({ width: 5.6, coreGain: 2.4, haloGain: 0.7, hot: [1.0, 1.25, 2.2] });
  const B = (mat, n, order) => { const b = new LineBatch(mat, n); b.object.renderOrder = order; scene.add(b.object); return b; };
  const sOuter = B(matCrisp, 400, 6), sInner = B(matStar, 300, 7), sRipple = B(matRipple, 1400, 5), sWords = B(matWords, 400, 41);
  const coreDots = kit.track(new GlowDots(8)); coreDots.object.renderOrder = 4; scene.add(coreDots.object);
  const glints = kit.track(new GlowDots(16)); glints.object.renderOrder = 8; scene.add(glints.object);
  const motesDots = kit.track(new GlowDots(160)); motesDots.object.renderOrder = 12; scene.add(motesDots.object);

  // the crisp geometry, in the flower's own frame (relative to its centre, at rest)
  const rel = (p) => [p[0] - CX, p[1] - CY];
  const ring = (key) => { const [x, y, r] = M.rings[key]; return { c: rel([x, y]), r }; };
  const R136 = ring('r136'), R67 = ring('r67'), R385 = ring('r385');
  const V = Object.fromEntries(Object.entries(M.star.vertices).map(([k, p]) => [k, rel(p)]));
  const ORDER = ['90', '150', '210', '270', '330', '30'];         // counter-clockwise on the glass: the way the star turns
  const inR = R136.r + 12;                                        // the spokes stop short of the inner star's circle
  const SPOKES = M.spokes.map((s) => {
    const a = rel(s.a), b = rel(s.b), d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(d[0], d[1]);
    // from the outer node inward to where the spoke meets the circle of radius inR
    const ux = d[0] / L, uy = d[1] / L;
    const bb = a[0] * ux + a[1] * uy, cc = a[0] * a[0] + a[1] * a[1] - inR * inR;
    const t = -bb - Math.sqrt(Math.max(0, bb * bb - cc));
    return { a, b: [a[0] + ux * t, a[1] + uy * t], cov: s.cov };
  }).filter((s) => s.cov >= 0.7);

  // the motes: drifting slowly over the glass (outside the flower's brightest heart), each on its own slow twinkle
  const R = rng(opts.seed ?? 1981);
  const motes = [];
  const place = (m, first) => {
    for (let k = 0; k < 60; k++) {
      const x = 90 + R() * (FRAME[0] - 180), y = 60 + R() * (FRAME[1] - 150);
      const dx = x - CX, dy = y - CY, rr = Math.hypot(dx, dy);
      if (!inGlass(x, y, 0.95) || rr < 150 || (Math.abs(x - M.words[0]) < 110 && Math.abs(y - M.words[1]) < 30)) continue;
      m.x = x; m.y = y; break;
    }
    m.born = first ? -99 : m.t;
  };
  for (let i = 0; i < 66; i++) {
    const ang = R() * Math.PI * 2, sp = 2 + R() * 4.5;
    const m = { t: 0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, curl: (R() - 0.5) * 0.12, per: 3.5 + R() * 3.5, ph: R() * 6.283,
      size: 3.0 + R() * R() * 4.6, gain: 0.45 + R() * 0.6, violet: R() < 0.18 };
    place(m, true); motes.push(m);
  }

  const ripples = [];
  let t = 0, lastBreathTop = -1, words = 'INSERT COIN', lastWords = words, wordsK = 1, st = null;

  function xf(p, s, rot) {                                        // the flower's frame -> the glass
    const c = Math.cos(rot), n = Math.sin(rot), x = p[0] * s, y = p[1] * s;
    return [CX + x * c - y * n, CY + x * n + y * c];
  }
  function circle(batch, rg, s, rot, col, style = SOLID, n = 160) {
    const c = xf(rg.c, s, rot);
    batch.loop(arc(c[0], c[1], rg.r * s, rg.r * s, 0, Math.PI * 2, n).slice(0, n), col, style);
  }
  // a ring clipped to the glass: only the runs of it inside the tube face, fading toward its edge
  function glassRing(batch, r, col, style = SOLID, n = 240) {
    const pts = arc(CX, CY, r, r, 0, Math.PI * 2, n);
    const fade = (p) => 1 - smooth(0.55, 0.9, Math.pow(Math.abs(p[0] - GLASS.cx) / GLASS.a, GLASS.p) + Math.pow(Math.abs(p[1] - GLASS.cy) / GLASS.b, GLASS.p));
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i], fa = fade(a), fc = fade(c);
      if (fa <= 0.001 && fc <= 0.001) { d += Math.hypot(c[0] - a[0], c[1] - a[1]); continue; }
      d = batch.seg(a[0], a[1], c[0], c[1], mul(col, fa), mul(col, fc), style, d);
    }
  }

  function step(dt) {
    t += dt;
    const b = breathAt(t), s = 1 + BREATH.swell * b, tw = twistAt(t);
    const outer = tw ? tw.outer : 0, inner = tw ? tw.inner : 0, soft = tw ? tw.soft : 0, land = tw ? tw.land : 0;
    st = { t, b, s, tw, outer, inner, soft };
    // the painted flower
    flowerMesh.scale.set(FS * s, FS * s, 1);
    flowerMesh.rotation.z = -outer;                               // (three is y up: + on the glass is clockwise)
    fu.gain.value = 0.94 + 0.08 * b;
    fu.soft.value = soft;
    backdrop.uniforms.halo.value = 0.5 + 0.5 * b;
    // the crisp outer lines turn with the painting (they are its cores)
    sOuter.clear();
    const og = 0.36 * (0.94 + 0.08 * b);
    circle(sOuter, R385, s, outer, mul(C.gold, og * 0.8));
    for (const sp of SPOKES) sOuter.line([xf(sp.a, s, outer), xf(sp.b, s, outer)], mul(C.gold, og * 0.75), SOLID, mul(C.gold, og * 0.35));
    sOuter.commit();
    // the inner star (and its rings): it turns the other way, one step, and lands on its painted lines
    sInner.clear(); glints.clear();
    const ig = (0.3 + 0.75 * soft) * (0.94 + 0.08 * b);
    circle(sInner, R136, s, inner, mul(C.gold, ig * 0.85));
    circle(sInner, R67, s, inner, mul(C.pale, ig * 0.6), SOLID, 96);
    const pos = {};
    ORDER.forEach((k, i) => {
      let p = [V[k][0], V[k][1]];
      if (tw) {
        // rotated by the turn, then (as it lands) onto the painted vertex one step round
        const rot = xf(p, 1, inner); p = [rot[0] - CX, rot[1] - CY];
        const to = V[ORDER[(i + 1) % 6]];
        p = [p[0] + (to[0] - p[0]) * land, p[1] + (to[1] - p[1]) * land];
      }
      pos[k] = xf(p, s, 0);
    });
    for (const [a, c] of M.star.edges) sInner.line([pos[a], pos[c]], mul(C.gold, ig));
    // while the paint is soft, the star's own node glints ride with it (at rest the painted ones are there)
    if (soft > 0.01) for (const k of ORDER) { glints.add(pos[k][0], pos[k][1], 5, mul(C.nodeGlint, 0.8 * soft)); glints.add(pos[k][0], pos[k][1], 13, mul(C.nodeGlint, 0.12 * soft)); }
    sInner.commit(); glints.commit();
    // the centre's light: brighter at the top of each breath (a light, not a pupil: it never widens or narrows)
    coreDots.clear();
    const cg = 0.3 + 0.7 * b * b;
    coreDots.add(CX, CY, 16, mul(C.core, 0.55 * cg));
    coreDots.add(CX, CY, 60, mul(C.coreHalo, 0.5 * cg));
    coreDots.commit();
    // ripples: one leaves the outer circle at the top of each breath
    const cycle = Math.floor((t - BREATH.inhale) / BREATH.period);
    if (cycle > lastBreathTop && t >= BREATH.inhale) { lastBreathTop = cycle; ripples.push({ t0: t }); while (ripples.length > RIPPLE.max) ripples.shift(); }
    sRipple.clear();
    for (const rp of ripples) {
      const u = (t - rp.t0) / RIPPLE.life;
      if (u < 0 || u >= 1) continue;
      const r = RIPPLE.r0 + (RIPPLE.r1 - RIPPLE.r0) * (1 - (1 - u) * (1 - u));
      const a = smooth(0, 0.14, u) * (1 - smooth(0.35, 1, u)) * 0.5;
      glassRing(sRipple, r, mul(C.ripple, a), { dash: 2.2, gap: 5.5, width: 1, speed: 0 }, 260);
    }
    for (const [r, k] of OUTER_RINGS) glassRing(sRipple, r * s, mul(C.violet, k * (0.9 + 0.1 * b)), SOLID, 260);
    sRipple.commit();
    // motes
    motesDots.clear();
    for (const m of motes) {
      m.t = t;
      const a = Math.atan2(m.vy, m.vx) + m.curl * dt, sp = Math.hypot(m.vx, m.vy);
      m.vx = Math.cos(a) * sp; m.vy = Math.sin(a) * sp;
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (!inGlass(m.x, m.y, 0.93)) place(m, false);
      const tw1 = 0.62 + 0.38 * Math.sin(Math.PI * 2 * t / m.per + m.ph);
      const k = m.gain * tw1 * smooth(0, 1.5, t - m.born) * (0.85 + 0.15 * b);
      const col = m.violet ? C.moteViolet : C.moteGold;
      motesDots.add(m.x, m.y, m.size, mul(col, 1.5 * k));
      motesDots.add(m.x, m.y, m.size * 2.8, mul(col, 0.13 * k));
    }
    motesDots.commit();
    // INSERT COIN: small and faint at the bottom, breathing a little behind the flower
    wordsK += ((words ? 1 : 0) - wordsK) * (1 - Math.exp(-dt / 0.5));
    sWords.clear();
    if (wordsK > 0.01 && (words || lastWords)) {
      const wb = breathAt(t - 0.9);
      drawText(sWords, words || lastWords, M.words[0], M.words[1] - 6.5, { h: 13, color: mul(C.words, (0.42 + 0.18 * wb) * wordsK), track: 0 });
    }
    sWords.commit();
  }

  await Promise.all([plate.ready, flower.ready]);
  step(0);

  const A = {
    kit,
    get texture() { return kit.texture; },
    get t() { return t; },
    update(dt, o = {}) {
      if (o.words !== undefined && o.words !== words) { if (words) lastWords = words; words = o.words; }
      step(Math.min(Math.max(dt, 0), 0.1));
      kit.render(Math.min(Math.max(dt, 1e-4), 0.1));
    },
    /** tests: jump to time t (the motes and ripples are replayed coarsely; the flower is exact) */
    seek(tt) {
      if (tt < t) { t = Math.max(0, tt - 6); ripples.length = 0; lastBreathTop = Math.floor((t - BREATH.inhale) / BREATH.period); }
      while (t < tt - 1e-6) step(Math.min(0.1, tt - t));
      step(0);
      kit.resetPersistence();
      return A.info();
    },
    setRenderScale(sc) { if (Math.abs(sc - kit.renderScale) > 1e-6) { kit.setSize(kit.width, kit.height, sc); kit.resetPersistence(); } },
    info() {
      return { t: +t.toFixed(3), breath: +st.b.toFixed(3), scale: +st.s.toFixed(4), twist: st.tw ? +st.tw.u.toFixed(3) : null,
        outerDeg: +(st.outer / DEG).toFixed(2), innerDeg: +(st.inner / DEG).toFixed(2), soft: +st.soft.toFixed(3), ripples: ripples.length,
        words, renderScale: kit.renderScale };
    },
    dispose() {
      for (const o of [flowerMesh, backdrop.object]) { o.geometry.dispose(); o.material.dispose(); }
      plate.tex.dispose(); flower.tex.dispose();
      for (const b of [sOuter, sInner, sRipple, sWords]) b.geometry.dispose();
      for (const m of [matCrisp, matStar, matRipple, matWords]) m.dispose();
      kit.dispose();
    },
  };
  return A;
}
