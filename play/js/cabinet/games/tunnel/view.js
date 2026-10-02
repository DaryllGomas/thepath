// THE NODE · THE TUNNEL · THE PICTURE (three.js, the look kit). Reads the round, never changes it.
//
//   const view = new TunnelView(kit); await view.ready;      kit = createLookKit(renderer, { ...TUNNEL_LOOK })
//   view.update(sim, dt, t, ui)       ui = { mode: 'attract' | 'play', hi, last }
//
// THE HEARTH PRINCIPLE: the painting carries the look; code draws only what moves or lights up (PIPELINES.md section 10).
//   THE PLATE: the tube, the blue tunnel web (18 spokes, the rings), the deep haze and the soft glow at the empty centre. The
//   heart's light warms its centre as it wakes. In THE FALL the plate is re-projected with the camera moving down the tunnel
//   (a true perspective dive into the painting: the painted rings stream outward, the spokes stay put), then it fades while
//   the live rings take over; the bezel never moves (a stable frame). THE PASSAGE: a gold-white light opens from the heart in
//   the vesica's own shape and fills the glass (eased over 2.7 s to a MODERATE gold-white, then settles to a soft glow).
//   (THE PLATE is the full-size painting, tunnel_plate_full.png, mapped onto the frame by the measured PLATE transform.)
//   THE HEART is the painted figure (assets/looktest/tunnel_heart_full.png), drawn only smaller than painted, as two
//   halves (left, right) in register: asleep it is a dim hint; it wakes with every mote of gold light that reaches it (eased),
//   sways a few degrees very slowly (never more: a turned vesica would read as an eye), and is still at the let-go. It never
//   moves toward the player and never turns to one: it is symmetric and centred ("a gate should not look back"). In the fall
//   it grows as you near it, and at the end its halves part (the vesica opens) and the light pours out.
//   live light over the paint: THE CRISP WEB (thin exact lines ON the painted rim, rings 1-2 and spokes, traced from the plate:
//   a sharp core over the paint's soft glow), THE HEART'S CRISP OUTLINE (its vesica, axes, arrowheads, bars and star, measured
//   from the painting, moving with the halves; its fine lattice stays a soft painted glow), THE SHIP'S LIT LANE (Tempest's:
//   its rim edge and two spokes glow brighter and warmer on the painted lines, sliding with the ship, eased), the gold motes
//   flowing down the lanes into the heart, the heart's core light, THE LET-GO's ring (the painted ring round the heart,
//   filling in gold from the top, clockwise; a faint track under it)
//   the crisp layer (kit.overlay, no persistence): the ship (the concept's blue arrow), shots, the six ECHOES (red, one trait
//   each: the ember's gold core, the star's trail, the shard's two lanes and its crack, the hunter's blades, the kite's split,
//   the crystal's flip), breaks (a soft PALE burst and red pieces that only fade), the score (7-segment, top left), ECHO N OF
//   6, ships, banners, cards, LET GO
// Safety: nothing steps or blinks. Every light change is eased; bursts are pale, eased in over 60 ms and out over 0.8 s,
// small; red pieces only fade; the fall's rings pass any point about 2 times a second at the most, at soft contrast; the
// passage's light rises over 2.7 s to a moderate level; no full-screen flash anywhere.
import * as THREE from 'three';
import { GlowLineMaterial, LineBatch, arc, bezier, GlowDots, drawDigits, Backdrop, FillBatch } from '../../lookkit/index.js';
import { FRAME, N, C, CX, CY, RING_W, GLASS, PLATE, CRISP, W_HEART, NA, RADII, mod, laneAt, vertexAt, laneFrame, ringPath, laneDist, fallAt } from './layout.js';
import { HEART_MEASURED as HM } from './heart_measured.js';
import { TUNE } from './spec.js';
import { drawText, textWidth } from '../hearth/font.js';

const ROOT = new URL('../../../../', import.meta.url);
// the full-size paintings (the plate maps onto the frame by PLATE; the heart by HEART below)
export const PLATE_URL = new URL('assets/looktest/tunnel_plate_full.png', ROOT).href;
export const HEART_URL = new URL('assets/looktest/tunnel_heart_full.png', ROOT).href;

export const TUNNEL_LOOK = {
  frame: FRAME,
  // drawn at 1.5 x 1024x768 (1536x1152): the page stretches the picture ~1.6x on a big monitor, and the fine lines, the
  // heart's lattice and the full-size paintings need the pixels (tunnel.html matches the canvas's own pixels, 1.5 to 2)
  renderScale: 1.5,
  overlay: true,              // crisp layer after the phosphor pass: the ship, shots and echoes leave no ghost copies
  // the painting carries its own glow: the kit's bloom only catches the hottest cores (the ship, the bursts, the heart's core)
  bloom: { strength: 0.34, radius: 0.36, threshold: 2.2, tint: [0.62, 0.76, 1.0] },
  phosphor: { tau: [0.03, 0.035, 0.045] },
  // the plate already shows the tube and its bezel: no curvature, no glass edge of the kit's own
  crt: { curve: 0.0, glassCurve: 0.0, glass: [1.5, 1.5], corner: 0.0, vignette: 0.1, scan: 0.02, scanCount: 330,
    exposure: [1, 1, 1], bezel: [0, 0, 0], grain: 0.01 },
};

// HDR light. hot: how white a colour's line core burns
const HOT_BLUE = [2.4, 1.8, 1.25], HOT_RED = [1.2, 2.1, 2.8], HOT_GOLD = [1.0, 1.9, 7.0], HOT_SHIP = [2.2, 1.6, 1.15], HOT_LANE = [1.0, 1.25, 1.6];
const C_ = {
  red: [1.25, 0.13, 0.068], redDim: [0.5, 0.06, 0.04], ember: [1.3, 0.3, 0.06],
  gold: [0.85, 0.5, 0.05], goldHot: [1.15, 0.74, 0.11], goldDim: [0.42, 0.25, 0.03],
  ship: [0.22, 0.52, 1.45], shipHot: [0.5, 0.78, 1.5], shot: [0.55, 0.8, 1.5],
  web: [0.1, 0.34, 1.2], webHot: [0.26, 0.56, 1.45],
  white: [0.8, 0.9, 1.15], pale: [1.0, 0.95, 0.9], score: [0.22, 0.52, 1.3], text: [0.24, 0.52, 1.2],
  letgo: [1.2, 0.95, 0.6],
  // the crisp layer: the painted web's own blue (its line colour, measured: CRISP.rgb), and the heart's gold
  crisp: [0.09, 0.36, 1.25], heartLine: [1.0, 0.6, 0.06],
  // the ship's lane: a warm white (the heart's light on the web), its glow a warm gold
  lane: [1.0, 0.68, 0.26], laneGlow: [1.1, 0.6, 0.12],
};
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
const TAU = Math.PI * 2;

const SOLID = { dash: 1, gap: 0, width: 1, speed: 0 };
const THIN = { dash: 1, gap: 0, width: 0.66, speed: 0 };
const FINE = { dash: 1, gap: 0, width: 0.5, speed: 0 };
const BOLD = { dash: 1, gap: 0, width: 1.3, speed: 0 };

// ---- the heart: the painting's own measurements (tunnel_heart_full.png, 1254 px; heart_measured.js, tools/tunnel_heart_measure.py:
// the figure's centre where its axes cross, (625.8, 608.4); its top and bottom dots 1119 px apart). At rest it is drawn the
// concept's size (213 px top dot to bottom dot in the frame) ----
const HEART = { px: HM.size[0], cx: HM.centre[0] / HM.size[0], cy: HM.centre[1] / HM.size[0], rest: 213 / (HM.bottomDot[1] - HM.topDot[1]) };
// its main lines (the crisp outline): each a polyline in the painting's px, and the half it belongs to (-1 left, +1 right;
// 0 = on the seam: drawn with each half). Lines across the seam are split there. The vesica, its axes, the arrowheads either
// side, the two bars, the star's V's
const HEART_LINES = (() => {
  const out = [], cx = HM.centre[0], L = HM.lines;
  const add = (pts, k) => {                                // split at the seam (x = cx) into the halves' own pieces
    let cur = [pts[0]], side = Math.sign(pts[0][0] - cx) || Math.sign(pts[pts.length - 1][0] - cx);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], sa = a[0] - cx, sb = b[0] - cx;
      if (sa * sb < 0) { const u = sa / (sa - sb), m = [cx, a[1] + (b[1] - a[1]) * u]; cur.push(m); out.push({ pts: cur, side, k }); cur = [m]; side = Math.sign(sb); }
      cur.push(b);
    }
    out.push({ pts: cur, side, k });
  };
  add(HM.vesica.left, 1); add(HM.vesica.right, 1);
  out.push({ pts: L.vertical, side: 0, k: 0.6 });
  add(L.horizontal, 0.6);
  for (const a of L.arrows) add(a, 0.6);
  for (const b of L.bars) add(b, 0.42);
  for (const v of L.star) add(v, 0.42);
  return out;
})();

// ---- THE LIGHT ON THE WEB (the concept's gold points): as the heart wakes, gold points light at the painted junctions, the
// innermost ring first and outward ring by ring toward the rim (the heart's light reaching out to you). A third of the
// junctions, symmetric about the vertical (the top spoke is 4, the bottom 13; spoke j mirrors 8 - j): lit where (the spokes
// from the top + the ring) is a multiple of three, so the vertical carries a point on every ring, as in the concept ----
const NODE_AT = [0.92, 0.78, 0.64, 0.5, 0.36, 0.22, 0.08];            // the wake each ring lights at (ring 0 = the rim)
const NODES = (() => {
  const out = [];
  for (let k = 0; k < RING_W.length; k++) for (let j = 0; j < N; j++) {
    const dt = Math.abs(laneDist(4, j));
    if ((dt + k) % 3 === 0) out.push({ j, k, at: NODE_AT[k] + 0.005 * Math.min(dt, 18 - dt) });
  }
  return out;
})();

// ---- the echoes, in the lane's own frame: u across (the lane is -0.5..0.5 wide), v inward (toward the centre) ----
const EMBER = [[0, -0.3], [0.2, -0.22], [0.28, -0.04], [0.21, 0.16], [0.08, 0.3], [0, 0.5], [-0.08, 0.3], [-0.21, 0.16], [-0.28, -0.04], [-0.2, -0.22]];
const EMBER_IN = [[0, -0.14], [0.1, -0.04], [0.06, 0.14], [0, 0.26]];
const STAR = [[0, -0.46], [0.1, -0.1], [0.46, 0], [0.1, 0.1], [0, 0.46], [-0.1, 0.1], [-0.46, 0], [-0.1, -0.1]];
const GEM = [[-12, -22], [1, -29], [14, -21], [13, 12], [1, 30], [-13, 13]].map(([x, y]) => [x / 64, -y / 64]);
const GEM_IN = [[[-12, -22], [1, -15]], [[1, -15], [14, -21]], [[1, -15], [0, 19]], [[-13, 13], [0, 19]], [[0, 19], [13, 12]], [[0, 19], [1, 30]]]
  .map((s) => s.map(([x, y]) => [x / 64, -y / 64]));
// the Labyrinth's tri-blade (three swept blades round a small ring), unit size
const BLADE = (() => {
  const P = (r, a) => [Math.cos(a) * r / 34, Math.sin(a) * r / 34];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const a = k * TAU / 3 - Math.PI / 2;
    const b1 = P(4.2, a - 0.62), b2 = P(4.2, a + 0.62), tip = P(15.5, a + 0.32);
    out.push([...bezier(b1, P(9, a - 0.5), P(14, a - 0.05), tip, 6), ...bezier(tip, P(11, a + 0.62), P(7.5, a + 0.78), b2, 6).slice(1)]);
  }
  return out;
})();
// the Resonance's kite (half-width 0.335 h, the bar 0.37 of the way down): long end toward YOU (outward, -v)
const KITE = (h) => { const hw = 0.335 * h, a = 0.37 * h, b = 0.63 * h; return [[0, a], [hw, 0], [0, -b], [-hw, 0]]; };
// the ship: the concept's arrow (a folded paper dart seen from behind), in rim-lane widths; its base on the rim, apex inward
const SHIP = {
  outer: [[-0.303, -0.02], [0, 0.377], [0.303, -0.02]],
  lines: [[[-0.069, 0.274], [-0.141, 0.042]], [[0.069, 0.274], [0.141, 0.042]], [[-0.303, -0.02], [-0.141, 0.042]], [[0.303, -0.02], [0.141, 0.042]],
    [[-0.141, 0.042], [0, 0.076], [0.141, 0.042], [0, 0], [-0.141, 0.042]], [[0, 0.377], [0, 0.076]]],
  fill: [[-0.303, -0.02], [0, 0.377], [0.303, -0.02], [0, 0]],
};

// the glass (the tube face), as the kit's shaders see it: the measured superellipse, inset a little
const GLASS_GLSL = /* glsl */`
  float glassMask(vec2 f) {
    vec2 q = abs(f - vec2(${GLASS.cx.toFixed(1)}, ${GLASS.cy.toFixed(1)})) / vec2(${GLASS.a.toFixed(1)}, ${GLASS.b.toFixed(1)});
    float v = pow(q.x, ${GLASS.p.toFixed(2)}) + pow(q.y, ${GLASS.p.toFixed(2)});
    return 1.0 - smoothstep(0.9, 0.985, v);
  }`;
const QUAD_VERT = /* glsl */`varying vec2 vUv; varying vec2 vF;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vF = vec2(w.x, -w.y); gl_Position = projectionMatrix * viewMatrix * w; }`;
const HEART_FRAG = /* glsl */`
  uniform sampler2D map; uniform float gain, sleep, alpha, uOff, bias, soft;
  varying vec2 vUv; varying vec2 vF;
  ${GLASS_GLSL}
  void main() {
    // (in the fall, as it grows, its fine lattice is softened and dimmed into the light: never a screen-wide lattice)
    vec3 v = texture2D(map, vec2(uOff + vUv.x * 0.5, vUv.y), bias + 2.4 * soft).rgb * (1.0 - 0.72 * soft);
    vec3 c = v * mix(vec3(1.0), vec3(1.0, 0.78, 0.5), sleep) * gain;           // asleep: dimmer and a deeper amber (still gold)
    vec3 x = -log(max(vec3(1.0) - c, vec3(0.03)));                                // the painting -> light
    gl_FragColor = vec4(x * alpha * glassMask(vF), 1.0);
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

/** One half of the heart: a quad whose local origin is the figure's centre (the painting's own centre, not the image's). */
class HeartHalf {
  constructor(tex, side, scene) {
    this.side = side;                                     // -1 left, +1 right
    const g = new THREE.PlaneGeometry(0.5, 1);
    // local x: the left half spans [-cx, 0.5 - cx], the right [0.5 - cx, 1 - cx]; y: [cy - 1, cy] (three is y up)
    g.translate(side < 0 ? 0.25 - HEART.cx : 0.75 - HEART.cx, 0.5 - (1 - HEART.cy), 0);
    this.u = { map: { value: tex }, gain: { value: 0.1 }, sleep: { value: 1 }, alpha: { value: 1 }, uOff: { value: side < 0 ? 0 : 0.5 }, bias: { value: 0.15 }, soft: { value: 0 } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: QUAD_VERT, fragmentShader: HEART_FRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  /** centre (frame px), size (px, the painting's full width), rotation (rad, y down: + is clockwise), the halves' gap (px);
   *  bias: the mip bias that keeps the fine lattice a soft glow (see TunnelView._heart) */
  place(x, y, size, rot, gap, gain, sleep, alpha, soft = 0, bias = 0.15) {
    this.u.soft.value = soft; this.u.bias.value = bias;
    const c = Math.cos(rot), s = Math.sin(rot), off = this.side * gap / 2;
    this.mesh.position.set(x + off * c, -(y + off * s), 0);
    this.mesh.rotation.z = -rot;
    this.mesh.scale.set(size, size, 1);
    this.u.gain.value = gain; this.u.sleep.value = sleep; this.u.alpha.value = alpha;
    this.mesh.visible = alpha > 0.002 && gain > 0.001;
  }
}

export class TunnelView {
  constructor(kit) {
    this.kit = kit;
    // the polish's two balances (measured: the heart's stripe band stays at or under the concept's): how much softer than the
    // painting's own mip the heart's fine lattice is sampled (mip levels, asleep -> fully awake: the brighter it burns, the
    // softer), and the heart outline's brightness
    this.tune = { latticeBias: [0.3, 0.6], heartLines: 0.4 };
    const { scene } = kit;
    // ---- layer 1: the plate ----
    const plate = loadTexture(PLATE_URL), heart = loadTexture(HEART_URL);
    // the dive's lateral scale per direction: the rim's half-extents (an ellipse fits the painted rim to a few px)
    // the painted rings' radii by direction (layout.js RADII), as a small float texture the dive's shader inverts per pixel
    const KR = RING_W.length, radData = new Float32Array(NA * KR * 4);
    for (let k = 0; k < KR; k++) for (let i = 0; i < NA; i++) radData[(k * NA + i) * 4] = RADII[k][i];
    const radii = new THREE.DataTexture(radData, NA, KR, THREE.RGBAFormat, THREE.FloatType);
    radii.minFilter = radii.magFilter = THREE.NearestFilter; radii.needsUpdate = true;
    this.backdrop = new Backdrop({
      frame: FRAME, map: plate.tex,
      uniforms: { radii: { value: radii }, cam: { value: 0 }, plateK: { value: 1 }, plateIn: { value: 1 }, haze: { value: 0 }, light: { value: 0 },
        lightR: { value: 80 }, wakeK: { value: 0 }, dark: { value: 0 }, dim: { value: 1 } },
      shade: /* glsl */`
        vec2 gq = abs(f - vec2(${GLASS.cx.toFixed(1)}, ${GLASS.cy.toFixed(1)})) / vec2(${GLASS.a.toFixed(1)}, ${GLASS.b.toFixed(1)});
        #define plateUV(q) vec2(((q).x * ${PLATE.scale.toFixed(6)} + ${PLATE.offset[0].toFixed(3)}) / ${PLATE.size[0].toFixed(1)}, 1.0 - ((q).y * ${PLATE.scale.toFixed(6)} + ${PLATE.offset[1].toFixed(3)}) / ${PLATE.size[1].toFixed(1)})
        float gm = 1.0 - smoothstep(0.9, 0.985, pow(gq.x, ${GLASS.p.toFixed(2)}) + pow(gq.y, ${GLASS.p.toFixed(2)}));
        vec2 d = f - vec2(${CX.toFixed(1)}, ${CY.toFixed(1)});
        float rho = max(length(d), 0.001);
        vec3 paint = texture2D(map, plateUV(f)).rgb;           // (the full-size plate, through the measured mapping)
        // along this pixel's direction: the painted rings' radii (a 5-degree table, interpolated)
        float th = atan(d.y, d.x);
        float fi = (th + 3.14159265) / 6.28318531 * ${NA}.0;
        float fl = floor(fi), ft = fi - fl;
        int i0 = int(mod(fl, ${NA}.0)), i1 = int(mod(fl + 1.0, ${NA}.0));
        float lastR = mix(texelFetch(radii, ivec2(i0, ${KR - 1}), 0).r, texelFetch(radii, ivec2(i1, ${KR - 1}), 0).r, ft);
        if (cam > 0.0001 && gm > 0.0) {
          // THE DIVE: the painting re-projected with the camera moved 'cam' down the tunnel. Each painted ring k (radius r_k,
          // depth w_k) is now at r_k w_k / (w_k - cam); the pixel lies between two of them, and the painted radius it shows is
          // interpolated between theirs in 1 / r (perspective): the painted rings land exactly where the live rings are drawn.
          // Outside the rim and inside the last ring: perspective from that ring's own offset.
          float WK[${KR}] = float[${KR}](${RING_W.map((w) => w.toFixed(4)).join(', ')});
          float rp = -1.0, prS = 1e9, prR = 0.0;
          for (int k = 0; k < ${KR}; k++) {
            float rk = mix(texelFetch(radii, ivec2(i0, k), 0).r, texelFetch(radii, ivec2(i1, k), 0).r, ft);
            float dk = WK[k] - cam;
            float sk = dk > 0.03 ? rk * WK[k] / dk : 1e9;
            if (k == 0 && rho >= sk) { float X = rk * WK[0]; rp = X / (X / rho + cam); break; }
            if (k > 0 && rho < prS && rho >= sk) { float u = (1.0 / rho - 1.0 / prS) / (1.0 / sk - 1.0 / prS); rp = 1.0 / mix(1.0 / prR, 1.0 / rk, u); break; }
            prS = sk; prR = rk;
          }
          if (rp < 0.0) { float X = prR * WK[${KR - 1}]; rp = X / (X / rho + cam); }
          vec2 src = vec2(${CX.toFixed(1)}, ${CY.toFixed(1)}) + (d / rho) * rp;
          vec3 warped = texture2D(map, plateUV(src)).rgb;
          // the fine rings inside the last measured one fade before they could stream
          warped *= mix(plateIn, 1.0, smoothstep(0.55 * lastR, 1.0 * lastR, rp));
          paint = mix(paint, warped, gm);
        } else if (gm > 0.0) paint *= mix(1.0, mix(plateIn, 1.0, smoothstep(0.55 * lastR, 1.0 * lastR, rho)), gm);
        vec3 x = -log(max(vec3(1.0) - paint, vec3(0.03)));      // the painting -> light (the tone map gives it back)
        x *= mix(1.0, plateK * dim, gm);
        // as the heart wakes its warm light takes the place of the painted blue glow round the centre
        x *= 1.0 - gm * wakeK * 0.55 * exp(-rho * rho / (2.0 * 120.0 * 120.0)) * vec3(0.2, 0.75, 1.0);
        // the heart's light warms the tunnel's centre as it wakes
        x += gm * wakeK * (vec3(0.045, 0.024, 0.004) * exp(-rho * rho / (2.0 * 110.0 * 110.0)) + vec3(0.012, 0.007, 0.001) * exp(-rho * rho / (2.0 * 300.0 * 300.0)));
        // the dive's own haze: a deep blue fog down the tunnel while the painting gives way
        x += gm * haze * (vec3(0.002, 0.008, 0.024) * exp(-rho * rho / (2.0 * 420.0 * 420.0)) + vec3(0.004, 0.009, 0.02) * exp(-rho * rho / (2.0 * 150.0 * 150.0)));
        // THE PASSAGE: the light opens from the heart in the vesica's shape (two circles of radius R, their centres R apart:
        // taller than wide) and fills the glass: a moderate gold-white
        if (light > 0.0) {
          float R = lightR;
          float ves = max(length(d - vec2(0.5 * R, 0.0)), length(d + vec2(0.5 * R, 0.0))) - R;
          float inV = 1.0 - smoothstep(-0.45 * R, 0.1 * R + 30.0, ves);
          vec3 warm = mix(vec3(1.2, 0.93, 0.52), vec3(0.8, 0.48, 0.14), smoothstep(30.0, 520.0, rho));
          x += gm * light * (inV * warm + 0.16 * vec3(0.7, 0.42, 0.12));
        }
        return x * (1.0 - 0.5 * dark);`,
    });
    scene.add(this.backdrop.object);

    // ---- layer 2: the heart (two halves in register) ----
    this.heartL = new HeartHalf(heart.tex, -1, scene);
    this.heartR = new HeartHalf(heart.tex, 1, scene);
    this.ready = Promise.all([plate.ready, heart.ready]);

    // ---- live light over the paint ----
    const T = (o) => kit.track(new GlowLineMaterial(o));
    this.matGold = T({ width: 4.2, coreFrac: 0.16, coreGain: 2.4, haloGain: 0.6, hot: HOT_GOLD });
    this.matRed = T({ width: 3.9, coreFrac: 0.17, coreGain: 2.2, haloGain: 0.85, hot: HOT_RED });
    this.matFrag = T({ width: 4.2, coreFrac: 0.18, coreGain: 2.3, haloGain: 0.8, hot: HOT_RED });
    this.matShip = T({ width: 5.6, coreFrac: 0.22, coreGain: 2.9, haloGain: 1.0, hot: HOT_SHIP });
    this.matShot = T({ width: 5.2, coreFrac: 0.22, coreGain: 2.8, haloGain: 0.9, hot: HOT_SHIP });
    this.matFx = T({ width: 5.0, coreGain: 2.6, haloGain: 0.7, hot: HOT_SHIP });
    this.matRing = T({ width: 3.6, coreFrac: 0.15, coreGain: 2.0, haloGain: 0.45, hot: HOT_BLUE });
    this.matUI = T({ width: 7.0, coreGain: 3.0, haloGain: 0.8, hot: HOT_BLUE });
    this.matText = T({ width: 6.4, coreGain: 2.8, haloGain: 0.8, hot: HOT_BLUE });
    // the crisp layer: thin exact lines ON the painted ones (a sharp core over the paint's soft glow)
    this.matCrisp = T({ width: 1.6, coreFrac: 0.32, coreGain: 2.4, haloGain: 0.12, hot: HOT_BLUE });
    this.matLaneCore = T({ width: 1.9, coreFrac: 0.32, coreGain: 2.6, haloGain: 0.15, hot: HOT_LANE });
    this.matLane = T({ width: 12, coreFrac: 0.05, coreGain: 0.3, haloFrac: 0.5, haloGain: 0.75, hot: HOT_LANE });   // (the lane's warm aura)
    this.matHeart = T({ width: 1.6, coreFrac: 0.32, coreGain: 2.5, haloGain: 0.16, hot: HOT_GOLD });

    const B = (mat, n, order) => { const b = new LineBatch(mat, n); b.object.renderOrder = order; return b; };
    this.sWeb = B(this.matLane, 400, 8); this.sLaneCore = B(this.matLaneCore, 300, 9); this.sGold = B(this.matGold, 700, 10);
    this.dots = kit.track(new GlowDots(500)); this.dots.object.renderOrder = 12;
    // THE CRISP WEB (static: built once, its brightness is the material's gain): the rim, rings 1 and 2 and the 18 spokes (rim to
    // ring 2, fading inward), exactly on the painted lines; subtle, in the paint's own blue
    this.sCrisp = B(this.matCrisp, 700, 7);
    const RK = [0.5, 0.36, 0.26];
    for (let k = 0; k < CRISP.rings.length; k++) for (const pts of CRISP.rings[k]) this.sCrisp.line(pts, mul(C_.crisp, RK[k]), SOLID);
    for (const pts of CRISP.spokes) this.sCrisp.line(pts, mul(C_.crisp, 0.42), SOLID, mul(C_.crisp, 0.12));
    this.sCrisp.commit();
    // the heart's crisp outline (its main lines, on the painted ones; moves with the halves)
    this.sHeart = B(this.matHeart, 400, 2);
    scene.add(this.sCrisp.object, this.sHeart.object, this.sWeb.object, this.sLaneCore.object, this.sGold.object, this.dots.object);
    // the crisp layer
    this.sRing = B(this.matRing, 1600, 7);
    this.fills = new FillBatch(900); this.fills.object.renderOrder = 13;
    this.sRed = B(this.matRed, 2600, 14); this.sFrag = B(this.matFrag, 1200, 15); this.sFx = B(this.matFx, 1400, 16);
    this.sShot = B(this.matShot, 300, 17); this.sShip = B(this.matShip, 300, 19);
    this.crispDots = kit.track(new GlowDots(700)); this.crispDots.object.renderOrder = 21;
    this.band = new FillBatch(96); this.band.object.renderOrder = 30;
    this.sUI = B(this.matUI, 1400, 40); this.sText = B(this.matText, 4000, 41);
    (kit.overlay ?? scene).add(this.sRing.object, this.fills.object, this.sRed.object, this.sFrag.object, this.sFx.object, this.sShot.object,
      this.sShip.object, this.crispDots.object, this.band.object, this.sUI.object, this.sText.object);
    this._reset();
  }

  _reset() {
    this.fx = []; this.banner = null; this.lower = null; this.firstRim = false;
    this.laneK = new Float32Array(N); this.heartK = 0; this.absorbK = 0; this.lostK = 0; this.shipK = 1; this.scoreK = 1; this.letK = 0;
    this.ringK = 0; this.hintK = 0; this.uiIn = 0; this.dimK = 0.4; this.sway = 0; this.swayPh = 0; this.grabK = 0; this.passK = 0;
    this.nodeK = new Float32Array(NODES.length);
  }

  /** One frame. sim = the round being shown (the attract demo or the real one). */
  update(sim, dt, t, ui = {}) {
    if (sim !== this._sim) { this._sim = sim; this._reset(); this.kit.resetPersistence?.(); }
    this._dt = dt; this._t = t;
    const batches = [this.sWeb, this.sLaneCore, this.sHeart, this.sGold, this.sRing, this.sRed, this.sFrag, this.sFx, this.sShot, this.sShip];
    for (const b of batches) b.clear();
    this.dots.clear(); this.crispDots.clear(); this.fills.clear();
    this._events(sim, t);
    this._state(sim, dt, t, ui);
    this._heart(sim, dt, t);
    this._fall(sim, t);
    this._lane(sim, dt);
    this._nodes(sim, dt);
    this._motes(sim, t);
    this._ring(sim, dt, t);
    this._echoes(sim, dt, t);
    this._shots(sim, t);
    this._ship(sim, dt, t);
    this._effects(sim, dt, t);
    for (const b of batches) b.commit();
    this.dots.commit(); this.crispDots.commit(); this.fills.commit();
    this._ui(sim, t, ui);
  }

  // ---------------- events -> effects ----------------
  _events(sim, t) {
    for (const e of sim.events) {
      if (e.kind === 'kill' || e.kind === 'ward') {
        const p = laneAt(e.q ?? e.lane, e.w ?? 1), sc = laneFrame(e.q ?? e.lane, e.w ?? 1).width;
        this.fx.push({ k: 'burst', x: p[0], y: p[1], t0: t, dur: 0.85, seed: e.id, big: clamp01(sc / 150) * 0.9 + 0.25 });
        this._pieces(e, p, sc, t);
        if (e.pts) this.fx.push({ k: 'text', text: '+' + e.pts, x: p[0], y: p[1] - 18 - sc * 0.12, t0: t + 0.05, dur: 1.1, c: C_.white, h: e.w < 1.6 ? 13 : 11 });
        if (e.kind === 'ward') { this.fx.push({ k: 'ring', x: p[0], y: p[1], t0: t, dur: 1.4, r0: 30, r1: 80, c: C_.white }); this.lower = { a: 'A WARD OF LIGHT HOLDS', t0: t, dur: 2.2 }; }
      } else if (e.kind === 'crack') {
        const p = laneAt(e.q + 1, e.w);
        this.fx.push({ k: 'burst', x: p[0], y: p[1], t0: t, dur: 0.6, seed: e.id + 7, big: 0.45 });
        this.fx.push({ k: 'text', text: '+' + e.pts, x: p[0], y: p[1] - 20, t0: t + 0.05, dur: 1.0, c: C_.white, h: 11 });
      } else if (e.kind === 'split') {
        const p = laneAt(e.q, e.w);
        this.fx.push({ k: 'burst', x: p[0], y: p[1], t0: t, dur: 0.6, seed: e.id + 3, big: 0.5 });
      } else if (e.kind === 'dissolve') {
        const p = laneAt(e.lane, e.w);
        for (let i = 0; i < 6; i++) {
          const a = hash1(e.id * 13 + i) * TAU, v = 20 + 40 * hash1(e.id * 7 + i);
          this.fx.push({ k: 'mote', x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: t, dur: 1.0 + 0.6 * hash1(e.id + i) });
        }
      } else if (e.kind === 'lifeLost') {
        const f = laneFrame(sim.ship.pos, 1), sc = this._shipScale(f.width);
        this.fx.push({ k: 'burst', x: f.x, y: f.y, t0: t, dur: 1.0, seed: 90 + e.left, big: 1.0, soft: true });
        const segs = [];
        const P = (u, v) => [f.x + (f.ax * u + f.nx * v) * sc, f.y + (f.ay * u + f.ny * v) * sc];
        const all = [SHIP.outer, ...SHIP.lines];
        for (const ln of all) for (let i = 1; i < ln.length; i++) segs.push([P(...ln[i - 1]), P(...ln[i])]);
        segs.forEach((sg, i) => {
          const mx = (sg[0][0] + sg[1][0]) / 2, my = (sg[0][1] + sg[1][1]) / 2;
          this.fx.push({ k: 'sFrag', a: [sg[0][0] - mx, sg[0][1] - my], b: [sg[1][0] - mx, sg[1][1] - my], x: mx, y: my,
            vx: (mx - f.x) * 3 + (hash1(i * 3 + e.left) - 0.5) * 50, vy: (my - f.y) * 3 + (hash1(i * 7) - 0.5) * 50, vr: (hash1(i * 5 + e.left) - 0.5) * 5, t0: t, dur: 1.5 });
        });
        this.lower = { a: 'TAKEN AT THE RIM · SHOOT THEM BEFORE THEY REACH YOUR LANE', t0: t + 0.2, dur: 2.6 };
      } else if (e.kind === 'wave') {
        this.banner = { a: e.name, b: 'ECHO ' + (e.wave + 1) + ' OF 6', t0: t + 0.1, dur: 2.4 };
      } else if (e.kind === 'waveClear' && e.bonus) {
        this.fx.push({ k: 'text', text: 'ECHO ' + (e.wave + 1) + ' HELD  +' + e.bonus, x: CX, y: 600, t0: t + 0.1, dur: 1.6, c: C_.goldHot, h: 13 });
      } else if (e.kind === 'rim' && !this.firstRim) {
        this.firstRim = true;
        if (!(this.lower && t - this.lower.t0 < this.lower.dur)) this.lower = { a: 'AT THE RIM THEY CRAWL TO YOU · SHOOT THEM IN YOUR LANE', t0: t, dur: 2.8 };
      } else if (e.kind === 'arrive') {
        this.absorbK = Math.min(1.4, this.absorbK + 0.35);
      } else if (e.kind === 'sink') {
        const p = laneAt(e.q, e.w);
        this.fx.push({ k: 'sink', x: p[0], y: p[1], t0: t, dur: 0.8 });
      }
    }
  }
  _pieces(e, p, sc, t) {
    // the echo's outline flies apart as red pieces that only fade (never a flash)
    const n = e.echo === 'ember' ? 4 : e.echo === 'star' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const a = hash1(e.id * 11 + i) * TAU, v = (70 + 110 * hash1(e.id * 5 + i)) * clamp01(sc / 140 + 0.3);
      const L = sc * (0.08 + 0.06 * hash1(e.id * 3 + i));
      this.fx.push({ k: 'piece', x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, L, a0: hash1(e.id * 17 + i) * TAU, vr: (hash1(e.id * 7 + i) - 0.5) * 5, t0: t, dur: 1.1 + 0.4 * hash1(i + e.id) });
    }
  }

  // ---------------- eased state ----------------
  _state(sim, dt, t, ui) {
    const lost = sim.phase === 'card' && sim.result === 1, won = sim.phase === 'card' && sim.result === 2;
    this.lostK += ((lost ? 1 : 0) - this.lostK) * (1 - Math.exp(-dt / 1.1));
    const firstReady = sim.phase === 'ready' && sim.readyDur > 2 && sim.phaseTime < sim.readyDur - 0.5;
    const dimT = ui.mode === 'attract' || firstReady ? 0.45 : 1;
    this.dimK += (dimT - this.dimK) * (1 - Math.exp(-dt / 0.35));
    const letT = sim.phase === 'letgo' ? 1 : 0;
    this.letK += (letT - this.letK) * (1 - Math.exp(-dt / 0.5));
    this.scoreK += ((sim.phase === 'letgo' ? 0.3 : sim.phase === 'fall' || won ? 0 : 1) - this.scoreK) * (1 - Math.exp(-dt / 0.8));
    this.passK = won ? smooth(0.3, 3.4, sim.phaseTime) : 0;                            // the passage's light settles
    const u = this.backdrop.uniforms;
    u.dark.value = this.lostK;
    u.dim.value = this.dimK;
    // the crisp web follows the painting's brightness, and fades in the fall's first second, before the painting dives (so the
    // two never part)
    const falling = sim.phase === 'fall' ? sim.fallT : won ? 99 : -1;
    this.matCrisp.gain = this.dimK * (1 - 0.5 * this.lostK) * (falling < 0 ? 1 : 1 - smooth(0.1, 0.8, falling));
    this.sCrisp.object.visible = this.matCrisp.gain > 0.002;
  }

  // ---------------- THE HEART ----------------
  _heart(sim, dt, t) {
    // awake as the gold light arrives (eased: a mote's arrival is a gentle swell, never a step)
    const target = sim.wake;
    this.heartK += (target - this.heartK) * (1 - Math.exp(-dt / 0.7));
    this.absorbK = Math.max(0, this.absorbK - dt * 0.9);
    const lost = this.lostK;
    const k = this.heartK * (1 - 0.6 * lost);
    // the slow sway: a few degrees at most, more as it wakes; still at the let-go and in the fall
    const still = sim.phase === 'letgo' || sim.phase === 'fall' || (sim.phase === 'card' && sim.result === 2) ? 1 : 0;
    this.swayPh += dt * (0.1 + 0.18 * this.heartK) * TAU / 6;
    const amp = (3.5 * this.heartK) * Math.PI / 180;
    this.sway += (amp * Math.sin(this.swayPh) * (1 - still) - this.sway) * (1 - Math.exp(-dt / 1.2));
    const F = this._F(sim);
    const size = HEART.px * HEART.rest * F.heart;
    const gap = F.open * size * 0.16;
    const gain = (0.1 + 0.92 * Math.pow(k, 0.55) + 0.05 * Math.min(1, this.absorbK)) * this.dimK;
    const alpha = 1 - smooth(0.05, 0.75, F.light);
    const soft = smooth(1.35, 2.6, F.heart);
    // THE FINE LATTICE STAYS A SOFT GLOW: the full-size painting at the render scale would sample it much finer than it was
    // drawn (and add stripe power in the heart); the mip bias keeps its softness the same on screen at any scale, while the
    // crisp outline (below) makes the main shape sharp. (0.15 = the bias it was tuned at: the 1092-px heart at 1024x768)
    const lb = this.tune.latticeBias, bias = 0.15 + Math.log2(this.kit.renderScale * HEART.px / 1092) + lb[0] + (lb[1] - lb[0]) * k;
    this.heartL.place(CX, CY, size, this.sway, gap, gain, 1 - k, alpha, soft, bias);
    this.heartR.place(CX, CY, size, this.sway, gap, gain, 1 - k, alpha, soft, bias);
    this._heartLines(size, this.sway, gap, gain, 1 - k, alpha, k);
    // its core light (steady; it swells a little as motes arrive, and slowly breathes once awake)
    const breathe = 1 + 0.08 * Math.sin(t * 1.3) * k;
    const sc = F.heart;
    this.dots.add(CX, CY, (3.5 + 2.5 * k) * Math.min(sc, 2.5), mul([1.3, 1.15, 0.8], (0.1 + 0.5 * k + 0.2 * Math.min(1, this.absorbK)) * breathe * alpha * this.dimK));
    this.dots.add(CX, CY, (60 + 50 * k) * Math.min(sc, 3), mul([0.07, 0.04, 0.006], (0.2 + 0.9 * k) * alpha * this.dimK));
    // as the halves part, the gap between them fills with light (the vesica opening onto the passage): never a dark
    // slit, which would read as a cat's eye looking back
    if (F.open > 0.001) {
      const hh = size * 0.46, n = 28, lk = smooth(0, 0.3, F.open);
      for (let j = 0; j <= n; j++) {
        const v = -1 + 2 * j / n, w = Math.sqrt(Math.max(0, 1 - v * v));
        this.dots.add(CX, CY + v * hh, Math.max(5, gap * 0.95 * w + 8), mul([1.25, 1.0, 0.62], 0.6 * lk * w * alpha));
      }
    }
    this.backdrop.uniforms.wakeK.value = k * alpha;
  }

  /** THE HEART'S CRISP OUTLINE: its main painted lines (heart_measured.js) drawn exactly on them, placed as the halves are
   *  (the sway, the size, the halves' gap), as bright as the painting (its wake, its sleepy amber) and fading with it as the
   *  light takes over. The fine lattice inside stays the painting's soft glow. */
  _heartLines(size, rot, gap, gain, sleep, alpha, wake) {
    // (fully awake the painted main lines already burn near white: the outline eases back a little there, where it would add
    // only stripe power, not sharpness)
    const a = gain * alpha * (1 - 0.5 * wake);
    if (a < 0.004) return;
    const cs = Math.cos(rot), sn = Math.sin(rot), sc = size / HEART.px, hx = HM.centre[0], hy = HM.centre[1];
    // (asleep: a deeper amber, as the painting's own sleepy tint; its gold core would read olive over the blue haze)
    const col = mul([C_.heartLine[0], C_.heartLine[1] * (1 - 0.42 * sleep), C_.heartLine[2] * (1 - 0.7 * sleep)], this.tune.heartLines * a);
    // (a line on the seam is drawn with each half; while they touch, each at half strength: one line)
    const seam = 0.5 + 0.5 * smooth(0.3, 2.5, gap);
    for (const ln of HEART_LINES) {
      for (const side of ln.side === 0 ? [-1, 1] : [ln.side]) {
        const off = side * gap / 2, ox = CX + off * cs, oy = CY + off * sn;
        const pts = ln.pts.map(([x, y]) => { const lx = (x - hx) * sc, ly = (y - hy) * sc; return [ox + lx * cs - ly * sn, oy + lx * sn + ly * cs]; });
        this.sHeart.line(pts, mul(col, ln.k * (ln.side === 0 ? seam : 1)), SOLID);
      }
    }
  }

  /** The fall's state for this frame (the start of the fall before it, its end state on the win's card). */
  _F(sim) {
    const t = sim.phase === 'fall' ? sim.fallT : sim.phase === 'card' && sim.result === 2 ? TUNE.fall.dur : 0;
    const F = fallAt(t, this._Fo ?? (this._Fo = {}));
    if (sim.phase !== 'fall' && !(sim.phase === 'card' && sim.result === 2)) { F.cam = 0; F.heart = 1; F.open = 0; F.light = 0; F.plate = 1; F.plateIn = 1; F.stream = 0; }
    return F;
  }

  // ---------------- THE FALL: the plate's dive, the live rings streaming past, the passage's light ----------------
  _fall(sim, t) {
    const F = this._F(sim), u = this.backdrop.uniforms;
    u.cam.value = F.cam;
    u.plateK.value = F.plate;
    u.plateIn.value = F.plateIn ?? 1;
    u.haze.value = Math.max(1 - F.plate, 0.6 * (1 - (F.plateIn ?? 1))) * (1 - F.light) * 0.9;
    const settle = this.passK;
    u.light.value = F.light * (1 - 0.7 * settle);
    u.lightR.value = 50 + 470 * Math.pow(F.light, 1.1);
    if (F.stream <= 0.001) return;
    // the live rings: the painted rings' own depths, then on to the heart at the same spacing; each drawn through its 18
    // junctions and 18 lane centres (the painted shape), dim far away, soft near, gone before it leaves the glass
    const depths = [...RING_W]; for (let w = RING_W[RING_W.length - 1] + 0.4; w < W_HEART; w += 0.4) depths.push(w);
    for (const w of depths) {
      const d = w - F.cam;
      if (d < 0.78) continue;
      const near = smooth(0.8, 1.15, d), far = Math.pow(Math.min(1, 1.35 / d), 1.7);
      const g = F.stream * near * far * 0.8;
      if (g < 0.01) continue;
      this.sRing.loop(ringPath(w, F.cam), mul(C_.web, g), THIN);
    }
    // the live spokes: through the junctions, from the near ring to the heart (they stay put: lines along the tunnel)
    const w0 = F.cam + 0.85;
    for (let j = 0; j < N; j++) {
      const pts = [];
      for (let w = Math.max(1, w0); w <= W_HEART; w += 0.2) pts.push(vertexAt(j, w, F.cam));
      if (pts.length > 1) this.sRing.line(pts, mul(C_.web, 0.35 * F.stream), FINE, [0, 0, 0]);
    }
  }

  // ---------------- THE SHIP'S LANE (Tempest's lit lane): its rim edge and its two spokes glow brighter and warmer ----------------
  // on the painted lines themselves (CRISP). The light follows the ship's own position round the rim: a lane's share is 1 at
  // its centre and slides to the next as the ship moves (the two shares always sum to one; a spoke takes both its lanes'
  // shares, so the lit total never dips mid-move), eased a little more on top: never a blink.
  _lane(sim, dt) {
    const s = sim.ship, on = s.alive && (sim.phase === 'play' || sim.phase === 'ready' || sim.phase === 'letgo');
    const e = 1 - Math.exp(-dt / 0.05);
    for (let j = 0; j < N; j++) {
      let d = ((s.pos - j) % N + N) % N; if (d > N / 2) d -= N;
      this.laneK[j] += ((on ? Math.max(0, 1 - Math.abs(d)) : 0) - this.laneK[j]) * e;
    }
    const g0 = (1 - 0.6 * this.letK) * this.dimK;
    const deep = [RING_W[2], RING_W[3], RING_W[4]];
    for (let j = 0; j < N; j++) {
      const k = this.laneK[j] * g0;
      if (k >= 0.01) {
        const rim = CRISP.rings[0][j];
        this.sWeb.line(rim, mul(C_.laneGlow, k), SOLID);
        this.sLaneCore.line(rim, mul(C_.lane, 0.8 * k), SOLID);
      }
      const ks = Math.min(1, this.laneK[mod(j - 1)] + this.laneK[j]) * g0;          // spoke j borders lanes j - 1 and j
      if (ks >= 0.01) {
        const sp = CRISP.spokes[j];
        this.sWeb.line(sp, mul(C_.laneGlow, 0.8 * ks), SOLID, mul(C_.laneGlow, 0.3 * ks));
        this.sLaneCore.line(sp, mul(C_.lane, 0.6 * ks), SOLID, mul(C_.lane, 0.2 * ks));
        // (on down the tunnel, a soft glow fading out by ring 4)
        const tail = [sp[sp.length - 1], ...deep.slice(1).map((w) => vertexAt(j, w))];
        this.sWeb.line(tail, mul(C_.laneGlow, 0.3 * ks), SOLID, [0, 0, 0]);
      }
    }
  }

  // ---------------- the light on the web (the heart's light reaching out, ring by ring) ----------------
  _nodes(sim, dt) {
    const F = this._F(sim), wake = this.heartK, e = 1 - Math.exp(-dt / 0.9);
    const g0 = (1 - 0.7 * this.lostK) * this.dimK * (1 - F.light);
    NODES.forEach((n, i) => {
      this.nodeK[i] += ((wake >= n.at ? 1 : 0) - this.nodeK[i]) * e;
      const k = this.nodeK[i] * g0;
      if (k < 0.01) return;
      const w = RING_W[n.k], d = w - F.cam;
      if (d < 0.8) return;
      const near = smooth(0.9, 1.6, d), p = vertexAt(n.j, w, F.cam), sz = 1 / Math.pow(Math.max(d, 1.2), 0.6);
      this.dots.add(p[0], p[1], 10 * sz, mul([1.6, 1.12, 0.26], 1.2 * k * near));
      this.dots.add(p[0], p[1], 27 * sz, mul([0.42, 0.25, 0.02], k * near));
    });
  }

  // ---------------- the gold light: down the lanes into the heart ----------------
  _motes(sim, t) {
    for (const m of sim.motes) {
      const p = laneAt(m.q, m.w), near = 1 - smooth(TUNE.mote.heartW - 0.5, TUNE.mote.heartW, m.w);
      const born = smooth(0, 0.25, sim.time - m.born);
      const sz = 1.6 / Math.sqrt(m.w);
      this.dots.add(p[0], p[1], 4.2 * sz, mul([1.35, 1.0, 0.45], 0.9 * near * born));
      this.dots.add(p[0], p[1], 13 * sz, mul([0.3, 0.18, 0.03], near * born));
      // a faint trail up the lane behind it
      for (let i = 1; i <= 3; i++) {
        const q = laneAt(m.q, Math.max(1, m.w - i * 0.09));
        this.dots.add(q[0], q[1], (3.2 - 0.6 * i) * sz, mul([1.1, 0.7, 0.2], (0.45 - 0.12 * i) * near * born));
      }
    }
  }

  // ---------------- THE LET-GO's ring: the painted ring round the heart, filling in gold ----------------
  _ring(sim, dt, t) {
    const show = sim.phase === 'letgo' ? 1 : sim.phase === 'fall' ? 1 - smooth(0.2, 1.2, sim.fallT) : 0;
    const target = sim.phase === 'fall' ? 1 : sim.phase === 'letgo' ? sim.ring : 0;
    this.ringK += (target - this.ringK) * (1 - Math.exp(-dt / 0.08));
    if (show < 0.005 || (sim.phase === 'letgo' && this.letK < 0.005)) return;
    const a = show * Math.max(this.letK, sim.phase === 'fall' ? 1 : 0);
    const w = RING_W[5];
    // the path from the top junction, clockwise on the glass (junction 4 is the top spoke; clockwise = falling index)
    const path = [];
    const top = 4;
    for (let i = 0; i <= N; i++) { const j = top - i; path.push(vertexAt(j, w)); if (i < N) path.push(laneAt(j - 1, w)); }
    // the faint track, all the way round
    this.sGold.loop(path.slice(0, -1), mul(C_.goldDim, 0.85 * a), THIN);
    // the filled part (to the fraction's exact point) and its head's soft light
    const f = clamp01(this.ringK);
    if (f > 0.001) {
      let L = 0; const seg = [];
      for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(l); L += l; }
      let left = f * L; const pts = [path[0]];
      for (let i = 1; i < path.length && left > 0; i++) {
        const l = seg[i - 1];
        if (l <= left) { pts.push(path[i]); left -= l; } else { const u = left / l; pts.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * u, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * u]); left = 0; }
      }
      this.sGold.line(pts, mul(C_.goldHot, 1.2 * a), { dash: 1, gap: 0, width: 1.7, speed: 0 });
      const h = pts[pts.length - 1];
      this.dots.add(h[0], h[1], 9, mul([1.4, 1.1, 0.55], 0.8 * a * (f < 0.999 ? 1 : 0.4)));
      if (f >= 0.999) this.dots.add(CX, CY, 170, mul([0.12, 0.08, 0.02], a));
    }
  }

  // ---------------- THE ECHOES ----------------
  _echoes(sim, dt, t) {
    const fade = 1 - 0.7 * this.lostK;
    for (const e of sim.echoes) {
      if (!e.alive) continue;
      const born = smooth(0, TUNE.fadeIn, sim.time - e.born) * fade;
      if (born < 0.01) continue;
      const grab = e.grabT > 0 ? clamp01(e.grabT / (TUNE.grab * sim.k.grab)) : 0;
      const col = mix(C_.red, [1.5, 0.45, 0.3], 0.5 * grab);
      if (e.kind === 'shard') { this._shard(e, born, col, t); continue; }
      // (drawn at the lane's width, but never bigger than the side lanes' rim: the wide top and bottom lanes don't balloon them)
      const f = laneFrame(e.q, e.w), sc = Math.min(f.width, 118);
      const P = (u, v) => [f.x + (f.ax * u + f.nx * v) * sc, f.y + (f.ay * u + f.ny * v) * sc];
      if (e.kind === 'ember') {
        const pts = EMBER.map(([u, v]) => P(u * 0.9, v * 0.9));
        this.fills.poly(pts, [0, 0.002, 0.004, 0.8 * born]);
        this.sRed.loop(pts, mul(mix(col, C_.ember, 0.4), born), SOLID);
        this.sRed.line(EMBER_IN.map(([u, v]) => P(u * 0.9, v * 0.9)), mul(C_.ember, 0.6 * born), THIN);
        const c = P(0, -0.06), br = 0.85 + 0.15 * Math.sin(t * 2.2 + e.id);            // the Hearth's fire: a gold core
        this.crispDots.add(c[0], c[1], 3 + sc * 0.03, mul([1.4, 0.95, 0.35], 0.9 * br * born));
        this.crispDots.add(c[0], c[1], 8 + sc * 0.1, mul([0.3, 0.12, 0.02], born));
      } else if (e.kind === 'star') {
        // the Constellation's falling star: a four-point star and a dotted trail behind it, down the lane
        for (let i = 1; i <= 6; i++) {
          const q = laneAt(e.q, e.w + i * 0.13), k = (1 - i / 7) * born;
          this.crispDots.add(q[0], q[1], (3.4 - 0.3 * i) * Math.sqrt(sc / 90), mul([1.4, 0.55, 0.22], 0.85 * k));
        }
        const pts = STAR.map(([u, v]) => P(u * 0.82, v * 0.82));
        this.fills.poly(pts, [0, 0.002, 0.004, 0.6 * born]);
        this.sRed.loop(pts, mul(col, born), SOLID);
        this.crispDots.add(f.x, f.y, 2.5 + sc * 0.02, mul([1.3, 1.1, 0.9], 0.8 * born));
      } else if (e.kind === 'hunter') {
        // the Labyrinth's red tri-blade, turning slowly
        const spin = t * 1.1 + e.id, cs = Math.cos(spin), sn = Math.sin(spin), k = 0.9;
        for (const bl of BLADE) {
          const pts = bl.map(([x, y]) => P((x * cs - y * sn) * k, (x * sn + y * cs) * k));
          this.sRed.loop(pts, mul(col, 1.1 * born), SOLID);
        }
        this.fills.poly(BLADE[0].slice(0, 1).concat(BLADE[1].slice(0, 1), BLADE[2].slice(0, 1)).map(([x, y]) => P((x * cs - y * sn) * k, (x * sn + y * cs) * k)), [0, 0.002, 0.004, 0.7 * born]);
        this.crispDots.add(f.x, f.y, 2 + sc * 0.012, mul([1.2, 0.3, 0.15], 0.6 * born));
      } else if (e.kind === 'kite' || e.kind === 'half') {
        // the Resonance's kite (its long end toward you); a half is smaller
        const h = e.kind === 'kite' ? 0.8 : 0.56;
        const pts = KITE(h).map(([u, v]) => P(u, v));
        this.fills.poly(pts, [0, 0.002, 0.004, 0.8 * born]);
        this.sRed.loop(pts, mul(col, born), SOLID);
        this.sRed.seg(...P(-0.335 * h, 0), ...P(0.335 * h, 0), mul(col, 0.55 * born), mul(col, 0.55 * born), THIN);
        this.sRed.seg(...P(0, 0.37 * h), ...P(0, -0.63 * h), mul(col, 0.4 * born), mul(col, 0.4 * born), FINE);
        const c = P(0, 0);
        this.crispDots.add(c[0], c[1], 2.2 + sc * 0.012, mul([0.9, 0.9, 1.3], 0.55 * born));        // the Resonance's node
      } else if (e.kind === 'crystal') {
        // the Ascent's crystal: an elongated faceted prism; on the rim it FLIPS over into the next lane
        const fl = e.flip > 0 ? Math.cos(Math.PI * e.flip) : 1, k = 0.95;
        const pts = GEM.map(([u, v]) => P(u * k * fl, v * k));
        this.fills.poly(pts, [0, 0.002, 0.004, 0.8 * born]);
        this.sRed.loop(pts, mul(col, born), SOLID);
        for (const [p, q] of GEM_IN) { const a = P(p[0] * k * fl, p[1] * k), b = P(q[0] * k * fl, q[1] * k); this.sRed.seg(a[0], a[1], b[0], b[1], mul(col, 0.65 * born), mul(col, 0.65 * born), THIN); }
      }
      // its dust: a few red specks drifting slowly round it (the concept's; steady, never twinkling)
      for (let i = 0; i < 4; i++) {
        const a = hash1(e.id * 9 + i) * TAU + t * (0.3 + 0.3 * hash1(e.id + i)), r = 0.32 + 0.14 * hash1(e.id * 5 + i);
        const q = P(Math.cos(a) * r, Math.sin(a) * r);
        this.crispDots.add(q[0], q[1], 1.3 + sc * 0.006, mul([1.2, 0.22, 0.1], 0.5 * born));
      }
      // the grab: a crawler in your lane reaches for the ship (a steady warm glow between them, rising: never a blink)
      if (grab > 0.02) this.crispDots.add(f.x, f.y, 18 + 16 * grab, mul([0.5, 0.12, 0.05], grab * born));
    }
  }
  _shard(e, born, col, t) {
    // the Beacon's ring shard: a band along the ring at its depth, across two lanes (spoke q to spoke q + 2), a thin gold line
    // down its middle; the first hit CRACKS it (a gap at the middle spoke, dimmer)
    const q0 = e.q, cracked = e.hp < 2;
    const edge = (w, a, b, n) => { const out = []; for (let i = 0; i <= n; i++) out.push(laneAt(a + (b - a) * i / n, w)); return out; };
    const w0 = Math.max(1, e.w - 0.05), w1 = e.w + 0.05;
    const halves = cracked ? [[q0 - 0.42, q0 + 0.42], [q0 + 0.58, q0 + 1.42]] : [[q0 - 0.42, q0 + 1.42]];
    const k = cracked ? 0.7 : 1;
    for (const [a, b] of halves) {
      const outer = edge(w0, a, b, 10), inner = edge(w1, a, b, 10);
      const poly = [...outer, ...inner.reverse()];
      for (let i = 1; i + 1 < outer.length; i++) this.fills.poly([outer[i - 1], outer[i], inner[inner.length - i - 1], inner[inner.length - i]], [0, 0.002, 0.004, 0.75 * born]);
      this.sRed.loop(poly, mul(col, k * born), SOLID);
      this.sGold.line(edge(e.w, a + 0.05, b - 0.05, 10), mul(C_.gold, 0.5 * k * born), FINE);
    }
  }

  // ---------------- shots ----------------
  _shots(sim, t) {
    for (const s of sim.shots) {
      const p = laneAt(s.lane, s.w), f = laneFrame(s.lane, s.w), sc = f.width;
      if (s.dissolve) {
        // THE LET-GO: the shot turns to gold light and fades before it lands
        const u = smooth(1.0, TUNE.letgo.dissolveW, s.w);
        this.crispDots.add(p[0], p[1], 3 + 2 * u, mul(mix([0.6, 0.85, 1.5], [1.3, 0.95, 0.45], u), 0.9 * (1 - u * 0.8)));
        this.dots.add(p[0], p[1], 12 * (1 - 0.5 * u), mul([0.25, 0.16, 0.04], u));
        continue;
      }
      // a small bright diamond pointing down the lane, a short trail
      const l = sc * 0.07, wd = sc * 0.035;
      const tip = [p[0] + f.nx * l, p[1] + f.ny * l], back = [p[0] - f.nx * l, p[1] - f.ny * l];
      const L = [p[0] - f.ax * wd, p[1] - f.ay * wd], R = [p[0] + f.ax * wd, p[1] + f.ay * wd];
      this.sShot.loop([tip, R, back, L], mul(C_.shot, 1.1), SOLID);
      this.crispDots.add(p[0], p[1], 2.5 + sc * 0.012, mul([0.7, 0.9, 1.4], 0.8));
      for (let i = 1; i <= 2; i++) { const q = laneAt(s.lane, Math.max(1, s.w - i * 0.09)); this.crispDots.add(q[0], q[1], 1.8, mul([0.4, 0.6, 1.2], 0.5 - 0.18 * i)); }
    }
  }

  // ---------------- the ship ----------------
  _shipScale(width) { return 0.55 * width + 0.45 * 158; }
  _ship(sim, dt, t) {
    const s = sim.ship, F = this._F(sim);
    const falling = sim.phase === 'fall' || (sim.phase === 'card' && sim.result === 2);
    const show = (s.alive && sim.phase !== 'lost') || falling;
    this.shipK += ((show ? 1 : 0) - this.shipK) * (1 - Math.exp(-dt / (show ? 0.25 : 0.03)));
    if (this.shipK < 0.01) return;
    let k = this.shipK * (1 - 0.6 * this.lostK) * this.dimK;
    let f = laneFrame(s.pos, 1), sc = this._shipScale(f.width);
    if (falling) {
      // THE FALL: it leaves the rim and glides ahead of the camera toward the axis, into the heart
      const lateral = [(f.x - CX) * F.shipX, (f.y - CY) * F.shipX], d = Math.max(0.2, F.shipW - F.cam);
      f = { ...f, x: CX + lateral[0] / d, y: CY + lateral[1] / d };
      sc = sc / d;
      k *= F.shipFade;
      if (k < 0.01) return;
    }
    const P = (u, v) => [f.x + (f.ax * u + f.nx * v) * sc, f.y + (f.ay * u + f.ny * v) * sc];
    this.fills.poly(SHIP.fill.map(([u, v]) => P(u, v)), [0, 0.002, 0.006, 0.9 * k]);
    const ward = s.ward > 0 ? smooth(0, 0.5, s.ward) : 0;
    const body = mul(mix(C_.ship, C_.white, 0.4 * ward), 1.2 * k);
    this.sShip.line(SHIP.outer.map(([u, v]) => P(u, v)), body, BOLD);
    for (const ln of SHIP.lines) this.sShip.line(ln.map(([u, v]) => P(u, v)), mul(body, 0.9), SOLID);
    const apex = P(0, 0.377);
    this.crispDots.add(apex[0], apex[1], 3.2 * sc / 150, mul([0.6, 0.85, 1.4], 0.8 * k));
    this.crispDots.add(f.x, f.y, 40 * sc / 150, mul([0.01, 0.03, 0.08], k));
    if (ward > 0) this.sFx.loop(arc(f.x, f.y, 44, 44, 0, TAU, 40).slice(0, 40), mul(C_.white, 0.45 * ward * k), THIN);
  }

  // ---------------- bursts, pieces, rings, words ----------------
  _effects(sim, dt, t) {
    this.fx = this.fx.filter((e) => t - e.t0 < e.dur);
    for (const e of this.fx) {
      const age = t - e.t0, u = age / e.dur, fade = 1 - smooth(0, 1, u);
      if (age < 0) continue;
      if (e.k === 'burst') {
        // a soft PALE starburst: eased in over 60 ms, out over the rest; its rays grow a little as they fade
        const inK = smooth(0, 0.06, age), k = inK * Math.pow(1 - u, 1.5), big = (e.soft ? 0.7 : 0.62) * e.big;
        for (let i = 0; i < 14; i++) {
          const a = i * 2.39996 + hash1(e.seed * 3 + i) * 0.3, long = i % 3 === 0, L = (long ? 70 + 35 * hash1(e.seed + i) : 26 + 22 * hash1(e.seed * 2 + i)) * big;
          const r0 = 1.5 + 5 * u, r1 = r0 + L * (0.7 + 0.3 * u);
          this.sFx.seg(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0, e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1, mul(C_.pale, 1.1 * k), [0, 0, 0], long ? THIN : FINE);
        }
        this.crispDots.add(e.x, e.y, (5 + 3 * u) * Math.max(0.6, e.big), mul([1.3, 1.2, 1.05], 1.1 * k));
        this.crispDots.add(e.x, e.y, (34 + 14 * u) * Math.max(0.5, e.big), mul([0.1, 0.085, 0.07], k));
      } else if (e.k === 'piece') {
        const d = 0.3 * (1 - Math.exp(-age / 0.3)), x = e.x + e.vx * d * 3, y = e.y + e.vy * d * 3, r = e.a0 + e.vr * age;
        const ca = Math.cos(r) * e.L, sa = Math.sin(r) * e.L;
        this.sFrag.seg(x - ca, y - sa, x + ca, y + sa, mul(C_.red, 0.9 * fade), mul(C_.red, 0.9 * fade), THIN);
      } else if (e.k === 'sFrag') {
        const x = e.x + e.vx * age, y = e.y + e.vy * age, r = e.vr * age, ca = Math.cos(r), sa = Math.sin(r);
        const P = (q) => [x + q[0] * ca - q[1] * sa, y + q[0] * sa + q[1] * ca];
        this.sShip.seg(...P(e.a), ...P(e.b), mul(C_.ship, 0.95 * fade), mul(C_.ship, 0.95 * fade), SOLID);
      } else if (e.k === 'ring') {
        const r = e.r0 + (e.r1 - e.r0) * Math.sqrt(u);
        this.sFx.loop(arc(e.x, e.y, r, r, 0, TAU, 40).slice(0, 40), mul(e.c, 0.6 * fade * smooth(0, 0.08, age)), THIN);
      } else if (e.k === 'mote') {
        const d = 0.5 * (1 - Math.exp(-age / 0.5));
        this.dots.add(e.x + e.vx * d, e.y + e.vy * d - 14 * age, 2.4, mul([1.3, 0.95, 0.45], 0.7 * fade * smooth(0, 0.1, age)));
      } else if (e.k === 'sink') {
        this.crispDots.add(e.x, e.y, 10 * (1 - u), mul([0.5, 0.08, 0.04], 0.6 * fade));
      } else if (e.k === 'text') drawScore(this.sFx, e.text, e.x, e.y - 20 * u, { h: e.h ?? 13, color: mul(e.c, 0.95 * fade * smooth(0, 0.12, age)), track: 1 });
    }
  }

  // ---------------- score, echo N of 6, ships, banners, cards, LET GO ----------------
  _ui(sim, t, ui) {
    const s = this.sUI, tx = this.sText; s.clear(); tx.clear();
    this.uiIn = Math.min(1, this.uiIn + (this._dt ?? 1 / 60) / 0.45);
    this.matUI.gain = this.matText.gain = smooth(0, 1, this.uiIn); this.band.material.opacity = smooth(0, 1, this.uiIn);
    const o = this.band; o.clear();
    const cx = CX, won = sim.phase === 'card' && sim.result === 2;
    const band = (y0, y1, a, x0 = 0, x1 = FRAME[0]) => {     // a soft dark band behind card text
      if (a <= 0.001) return;
      for (const [d, k] of [[0, 0.35], [14, 0.65], [28, 1]]) o.poly([[x0, y0 + d], [x1, y0 + d], [x1, y1 - d], [x0, y1 - d]], [0, 0, 0, a * k * 0.5]);
    };
    // the score (7-segment, top left, inside the glass's rounded corner); it dissolves at the let-go (retired, legibly)
    const sk = this.scoreK;
    if (sk > 0.01) {
      drawDigits(s, String(sim.score), 214, 96, { h: 26, w: 16, pitch: 23, slant: 0.14, gap: 1.8, hollow: false,
        color: mul(mix(C_.goldHot, C_.score, sk), 0.95 * Math.min(1, sk * 1.2)), style: { dash: 1, gap: 0, width: 0.9 } });
    }
    if (ui.mode !== 'attract') {
      // ships: small arrows, top right
      if (sim.phase !== 'fall' && !won) for (let i = 0; i < Math.max(0, sim.livesLeft); i++) {
        const x = 1052 - i * 38, y = 116, P = ([u, v]) => [x + u * 58, y - v * 58];
        for (const ln of [SHIP.outer, ...SHIP.lines.slice(0, 2)]) s.line(ln.map(P), mul(C_.ship, 0.7 * sk), SOLID);
      }
      // ECHO N OF 6, and six marks (gold when held)
      if (sim.phase !== 'card' && sim.phase !== 'letgo' && sim.phase !== 'fall' && !(sim.phase === 'ready' && sim.readyDur > 2)) {
        const n = Math.min(6, sim.wavesCleared + 1);
        drawText(tx, 'ECHO ' + n + ' OF 6', 216, 136, { h: 13, color: mul(C_.white, 0.9), track: 1, align: 'left' });
        drawText(tx, sim.waveLeft + ' LEFT IN THIS WAVE', 216, 158, { h: 11, color: mul(C_.text, 0.85), track: 1, align: 'left' });
        for (let i = 0; i < 6; i++) {
          const x = 222 + i * 20, y = 186, held = i < sim.wavesCleared, cur = i === sim.wavesCleared, r = held ? 6 : 5;
          s.loop([[x, y - r], [x + r * 0.75, y], [x, y + r], [x - r * 0.75, y]], held ? C_.goldHot : cur ? mul(C_.white, 0.8) : mul(C_.goldDim, 1.3), held ? SOLID : THIN);
          if (held) this.crispDots.add(x, y, 3.5, mul([1.2, 0.85, 0.3], 0.5));
        }
      }
    }
    // banners (the echo's name as its wave starts; the lower ones: why a ship was lost, the rim, the ward)
    if (ui.mode !== 'attract') {
      for (const [Bn, y] of [[this.banner, 214], [this.lower, 640]]) {
        if (!Bn) continue;
        const u = (t - Bn.t0) / Bn.dur;
        if (u < 0 || u >= 1) continue;
        const a = smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u));
        const wd = Math.max(textWidth(Bn.a, Bn === this.banner ? 30 : 14, 1) + 120, 420);
        band(y - 24, y + (Bn.b ? 76 : 42), a * 0.8, cx - wd / 2, cx + wd / 2);
        drawText(tx, Bn.a, cx, y, { h: Bn === this.banner ? 30 : 14, color: mul(Bn === this.banner ? C_.goldHot : C_.text, a), track: Bn === this.banner ? 2 : 1 });
        if (Bn.b) drawText(tx, Bn.b, cx, y + 44, { h: 14, color: mul(C_.white, 0.9 * a), track: 2 });
      }
    }
    if (ui.mode === 'attract') {
      band(150, 760, 0.9, 170, 1096);
      const breathe = 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
      drawText(tx, 'THE TUNNEL', cx, 196, { h: 60, color: mul(C_.goldHot, 1.05), track: 2 });
      drawText(tx, 'HOLD THE RIM', cx, 296, { h: 20, color: mul(C_.white, 0.9), track: 2 });
      drawText(tx, this.inCabinet ? (this.cabinetStart ?? 'INSERT COIN') : 'PRESS START', cx, 392, { h: 24, color: mul(C_.white, breathe), track: 2 });
      drawText(tx, 'SIX ECHOES CLIMB FROM THE CENTRE, ONE GAME EACH', cx, 480, { h: 14, color: mul(C_.text, 0.95), track: 1 });
      drawText(tx, 'SHOOT THEM DOWN THEIR LANES BEFORE THEY REACH THE RIM', cx, 518, { h: 14, color: mul(C_.text, 0.85), track: 1 });
      drawText(tx, 'AT THE RIM THEY CRAWL TO YOU · SHOOT THEM IN YOUR LANE', cx, 556, { h: 14, color: mul(C_.text, 0.85), track: 1 });
      drawText(tx, 'LEFT RIGHT  MOVE     SPACE  FIRE', cx, 594, { h: 14, color: mul(C_.text, 0.85), track: 1 });
      drawText(tx, 'HI ' + ui.hi + (ui.last ? '   LAST ' + ui.last : ''), cx, 690, { h: 16, color: mul(C_.score, 0.95), track: 2 });
    } else if (sim.phase === 'ready') {
      const first = sim.readyDur > 2;
      const a = smooth(0, 0.3, sim.phaseTime) * (1 - smooth(sim.readyDur - 0.45, sim.readyDur, sim.phaseTime));
      if (first) {
        band(168, 330, a, 170, 1096);
        drawText(tx, 'HOLD THE RIM', cx, 190, { h: 34, color: mul(C_.goldHot, a), track: 3 });
        drawText(tx, 'SIX ECHOES CLIMB FROM THE CENTRE', cx, 250, { h: 18, color: mul(C_.white, a), track: 2 });
        drawText(tx, 'SHOOT THEM DOWN THEIR LANES', cx, 282, { h: 13, color: mul(C_.text, 0.95 * a), track: 1 });
        drawText(tx, 'LEFT RIGHT MOVE · SPACE FIRE', cx, 306, { h: 13, color: mul(C_.text, 0.85 * a), track: 1 });
      } else {
        band(186, 262, a, 380, 886);
        drawText(tx, 'READY', cx, 212, { h: 24, color: mul(C_.white, a), track: 3 });
      }
    } else if (sim.phase === 'letgo' || (sim.phase === 'fall' && sim.fallT < 1.2)) {
      // LET GO: calm, big, impossible to miss (it eases in; it never blinks)
      const a = sim.phase === 'letgo' ? smooth(0.1, 1.0, sim.letgoT) : 1 - smooth(0, 1.0, sim.fallT);
      const breathe = 0.93 + 0.07 * Math.sin(t * 1.1);
      band(150, 300, a * 0.9, 250, 1016);
      drawText(tx, 'LET GO', cx, 168, { h: 64, color: mul(C_.letgo, 1.05 * a * breathe), track: 2 });
      drawText(tx, 'TAKE YOUR HANDS OFF', cx, 260, { h: 18, color: mul(C_.white, 0.9 * a), track: 3 });
      const hk = sim.hint ? 1 : 0;
      this.hintK += (hk - this.hintK) * (1 - Math.exp(-(this._dt ?? 1 / 60) / 0.6));
      if (this.hintK > 0.01) {
        band(578, 636, this.hintK * a * 0.8, 360, 906);
        drawText(tx, 'THE RING FILLS WHILE YOU ARE STILL', cx, 598, { h: 14, color: mul(C_.goldHot, 0.9 * this.hintK * a), track: 1 });
      }
    } else if (sim.phase === 'card') {
      if (won) {
        // THE PASSAGE: a quiet card once the light has settled
        const a = smooth(2.2, 3.4, sim.phaseTime);
        band(612, 792, a * 0.9, 250, 1016);
        drawText(tx, 'THE PASSAGE', cx, 636, { h: 40, color: mul([1.1, 0.9, 0.62], a), track: 3 });
        drawText(tx, 'SCORE ' + sim.score, cx, 718, { h: 18, color: mul([0.9, 0.85, 0.75], 0.9 * a), track: 2 });
      } else {
        const a = smooth(0.9, 1.7, sim.phaseTime);
        band(612, 800, a);
        drawText(tx, 'THE HEART SLEEPS', cx, 636, { h: 36, color: mul(C_.text, a), track: 2 });
        drawText(tx, 'ECHO ' + Math.min(6, sim.wavesCleared + 1) + ' OF 6 · ' + sim.stats.kills + ' ECHOES BROKEN', cx, 700, { h: 15, color: mul(C_.text, 0.9 * a), track: 1 });
        drawText(tx, 'SCORE ' + sim.score, cx, 740, { h: 22, color: mul(C_.score, a), track: 2 });
      }
    }
    s.commit(); tx.commit(); o.commit();
  }
}

/** drawText, with a '+' (the stroke font has none): a plus drawn from two strokes before the number. */
function drawScore(b, text, x, y, o) {
  const plus = text.indexOf('+');
  if (plus < 0) return drawText(b, text, x, y, o);
  const h = o.h ?? 13, pre = text.slice(0, plus), rest = text.slice(plus + 1), pw = h * 0.75, tr = o.track ?? 1;
  const wPre = pre ? textWidth(pre, h, tr) + h * 0.3 : 0, w = textWidth(rest, h, tr), x0 = x - (wPre + pw + w) / 2;
  if (pre) drawText(b, pre, x0, y, { ...o, align: 'left' });
  const cx = x0 + wPre + pw * 0.35, cy = y + h * 0.5, r = h * 0.3;
  b.seg(cx - r, cy, cx + r, cy, o.color, o.color); b.seg(cx, cy - r, cx, cy + r, o.color, o.color);
  return drawText(b, rest, x0 + wPre + pw, y, { ...o, align: 'left' });
}
