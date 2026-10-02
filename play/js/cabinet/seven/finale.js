// THE CABINET WITH NO NAME · THE REVEAL (step 1b, docs/THE_PLAN/CABINET_SEVEN_GAMES.md "1b. The ending hands off"): the Tunnel's
// passage has filled the glass with gold-white light; before the run's win goes to js/ending.js (the clunk, the token, the pull),
// the machine shows itself, in the cabinet's own glass (the look kit, the vector font, the empty tube of the start screen):
//   1. the light gathers down into a vesica (two circles, their lens), the passage's own shape;
//   2. THE GATE (js/marks.js: gateMarkShapes, the exact geometry, never redrawn) draws itself stroke by stroke, and holds;
//   3. it rises to the top and the score table comes up: rows 2-5 in old-arcade initials, the top row blank; then A, V, R
//      come in one at a time and 133700 settles beside them (A·V·R's score, LEET, six digits: canon), the top score;
//   4. a last held beat, and update() returns true: the host reports the win and the ending plays as before.
// SAFETY: every change is eased over 1.5 s or more; nothing flashes; gold only (no red); the vesica is a gate, never an eye.
//
// The contract (index.js): createFinale(ctx) returns null, or { update(dt) -> true when done, texture?, dispose?() }.
//   ctx = { renderer, game (the Tunnel, frozen on its passage frame; game.kit its kit), row, frame [1266, 952],
//           show(texture, fadeSeconds), vp(fn), snd (the arcade's SevenSound, or null) }
import * as THREE from 'three';
import { createLookKit, GlowLineMaterial, LineBatch, Backdrop, arc } from '../lookkit/index.js';
import { drawText, textWidth } from '../games/hearth/font.js';
import { ATTRACT_LOOK, PLATE_URL, FRAME } from './attract.js';
import { ATTRACT_MEASURED as M } from './attract_measured.js';
import { gateMarkShapes } from '../../marks.js';

// ---------------------------------------------------------------- the timeline (seconds from the first frame)
export const REVEAL = {
  glowFrom: [0.0, 2.6],            // the passage's light gathers (its glow contracts to the vesica's)
  lens: [0.5, 2.3],                // the vesica's outline comes up
  vesicaOut: [2.6, 4.4],           // ... and gives way to THE GATE
  gate: [2.0, 5.2],                // THE GATE draws itself
  rise: [5.6, 7.0],                // it rises to the top of the glass
  table: [6.2, 7.8],               // the table comes up (rows 2-5, the empty top row)
  letters: [8.0, 8.7, 9.4],        // A, V, R begin (each eases in over LETTER s)
  score: 9.8,                      // 133700 begins to settle (over LETTER s)
  end: 12.6,                       // a last held beat, then done
};
const LETTER = 1.5;
export const AVR_SCORE = 133700;   // canon: A·V·R 1,337,000 (leet), shown in the six-digit table as 133700
const ROWS = [['JRK', 18400], ['MLS', 15300], ['DWB', 12100], ['TPK', 9600]];   // plausible 1982 initials, all far below A·V·R

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

const GOLD = [0.95, 0.6, 0.16], PALE = [1.05, 0.86, 0.6], DIM = [0.5, 0.32, 0.1], HOT_GOLD = [1.0, 1.9, 7.0];
const GX = M.glass.cx, GY = M.glass.cy;                       // the glass's centre in the frame

function loadTexture(url) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4;
  const ready = new Promise((resolve, reject) => {
    new THREE.ImageLoader().load(url, (img) => { tex.image = img; tex.needsUpdate = true; resolve(); }, undefined, reject);
  });
  return { tex, ready };
}

/** THE GATE's strokes up to `progress` (0..1) as open polylines, by gateMarkShapes' own slices (the order marks.js draws it in). */
function gateStrokes(shapes, progress) {
  const out = [];
  for (const s of shapes) {
    const u = clamp01((progress - s.t0) / (s.t1 - s.t0));
    if (u <= 0) continue;
    const want = u * s.len[s.len.length - 1], pts = [s.pts[0]];
    for (let i = 1; i < s.pts.length; i++) {
      if (s.len[i] <= want) { pts.push(s.pts[i]); continue; }
      const f = (want - s.len[i - 1]) / Math.max(1e-9, s.len[i] - s.len[i - 1]);
      pts.push([s.pts[i - 1][0] + (s.pts[i][0] - s.pts[i - 1][0]) * f, s.pts[i - 1][1] + (s.pts[i][1] - s.pts[i - 1][1]) * f]);
      break;
    }
    out.push(pts);
  }
  return out;
}

export function createFinale(ctx) {
  if (!ctx || !ctx.renderer || !ctx.game || !ctx.game.kit) return null;
  const { renderer, game, snd } = ctx, tk = game.kit;
  const kit = createLookKit(renderer, { ...ATTRACT_LOOK, width: tk.renderWidth, height: tk.renderHeight, renderScale: 1 });
  const { scene } = kit;
  const plate = loadTexture(PLATE_URL);
  const P = M.plate;

  // the empty tube of the start screen, and the passage's light as one warm glow at the centre (kept inside the glass)
  const backdrop = new Backdrop({
    frame: FRAME, map: plate.tex,
    uniforms: { glow: { value: 1 }, glowR: { value: 400 } },
    shade: /* glsl */`
      vec2 q = vec2((f.x * ${P.scale.toFixed(6)} + ${P.offset[0].toFixed(3)}) / ${P.size[0].toFixed(1)}, 1.0 - (f.y * ${P.scale.toFixed(6)} + ${P.offset[1].toFixed(3)}) / ${P.size[1].toFixed(1)});
      vec3 paint = texture2D(map, q).rgb;
      vec3 x = -log(max(vec3(1.0) - paint, vec3(0.03)));
      vec2 d = f - vec2(${GX.toFixed(2)}, ${GY.toFixed(2)});
      float m = pow(abs(f.x - ${GX.toFixed(2)}) / ${M.glass.a.toFixed(1)}, ${M.glass.p.toFixed(1)}) + pow(abs(f.y - ${GY.toFixed(2)}) / ${M.glass.b.toFixed(1)}, ${M.glass.p.toFixed(1)});
      float inside = 1.0 - smoothstep(0.7, 1.0, m);
      float r2 = dot(d, d);
      x += glow * inside * (vec3(1.0, 0.8, 0.52) * exp(-r2 / (2.0 * glowR * glowR)) + vec3(0.25, 0.18, 0.1) * exp(-r2 / (8.0 * glowR * glowR)));
      return x;`,
  });
  scene.add(backdrop.object);

  const T = (o) => kit.track(new GlowLineMaterial(o));
  const matGate = T({ width: 1.9, coreFrac: 0.3, coreGain: 2.4, haloGain: 0.5, hot: HOT_GOLD });
  const matLens = T({ width: 2.2, coreFrac: 0.28, coreGain: 2.2, haloGain: 0.55, hot: [1.0, 1.6, 4.5] });
  const matText = T({ width: 3.4, coreFrac: 0.3, coreGain: 2.0, haloGain: 0.5, hot: [1.0, 1.4, 3.0] });
  const B = (mat, n, order) => { const b = new LineBatch(mat, n); b.object.renderOrder = order; scene.add(b.object); return b; };
  const bLens = B(matLens, 400, 6), bGate = B(matGate, 900, 7), bText = B(matText, 1400, 8);

  const shapes = gateMarkShapes(3).map((s) => {
    const L = [0];
    for (let i = 1; i < s.pts.length; i++) L.push(L[i - 1] + Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
    return { ...s, len: L };
  });

  const R0 = 160, RT = 40, CYT = 150;                         // THE GATE's ring radius centred (bbox centred on the glass), and small at the top
  const cy0 = GY + 0.14 * R0;

  // the table's geometry (frame px): rank / initials / score columns
  const TH = 40, RH = 24, Y0 = 300, STEP = 92, XR = 330, XL = 420, XS = 930;
  const six = (n) => String(n).padStart(6, '0');
  const rowY = (i) => Y0 + i * STEP - TH / 2;

  let t = 0, ready = false, done = false;
  const fired = {};
  const out = { texture: null, kit, update, dispose() { kit.dispose && kit.dispose(); }, info() { return { t, ready, done }; } };

  const fire = (key, at, fn) => {
    if (fired[key] || t < at) return;
    fired[key] = true;
    if (snd && !snd.paused && snd.cab) { try { fn(snd.cab); } catch (e) { /* sound is never the show */ } }
  };

  function draw() {
    const R = REVEAL;
    // the light: gathers from the passage's fill to the vesica's glow, then a faint warm ground for the Gate and the table
    const gk = smoother(R.glowFrom[0], R.glowFrom[1], t);
    const late = ss(R.vesicaOut[0], R.vesicaOut[1] + 1.5, t);
    backdrop.uniforms.glow.value = lerp(1.5, 0.42, gk) * lerp(1, 0.55, late);
    backdrop.uniforms.glowR.value = lerp(430, 140, gk) * lerp(1, 1.4, late);
    bLens.clear(); bGate.clear(); bText.clear();

    // 1. THE VESICA: two circles draw together (their centres a radius apart), the lens between them the bright line
    const la = ss(R.lens[0], R.lens[1], t) * (1 - ss(R.vesicaOut[0], R.vesicaOut[1], t));
    if (la > 0.002) {
      const rho = lerp(250, 150, smoother(R.glowFrom[0], R.glowFrom[1], t)), d = rho;
      const cA = [GX - d / 2, GY], cB = [GX + d / 2, GY], a60 = Math.PI / 3;
      bLens.loop(arc(cA[0], cA[1], rho, rho, 0, Math.PI * 2, 120).slice(0, 120), mul(DIM, la * 0.7));
      bLens.loop(arc(cB[0], cB[1], rho, rho, 0, Math.PI * 2, 120).slice(0, 120), mul(DIM, la * 0.7));
      // the lens: the right arc of the left circle, back along the left arc of the right circle
      const lens = [...arc(cA[0], cA[1], rho, rho, -a60, a60, 48), ...arc(cB[0], cB[1], rho, rho, Math.PI - a60, Math.PI + a60, 48)];
      bLens.loop(lens, mul(PALE, la));
    }

    // 2. THE GATE draws itself (exact marks.js geometry); 3. it rises and shrinks to the top
    if (t >= R.gate[0]) {
      const gp = ss(0, 1, (t - R.gate[0]) / (R.gate[1] - R.gate[0]));
      const rise = smoother(R.rise[0], R.rise[1], t);
      const Rg = lerp(R0, RT, rise), cy = lerp(cy0, CYT, rise);
      const hold = (1 + 0.3 * ss(R.gate[1], R.gate[1] + 1.6, t) * (1 - rise)) * lerp(1, 0.85, rise);   // a little brighter once complete
      const col = mul(GOLD, hold);
      for (const pts of gateStrokes(shapes, gp)) bGate.line(pts.map(([x, y]) => [GX + x * Rg, cy + y * Rg]), col);
    }

    // 3. the table (in the vector font)
    const ta = ss(R.table[0], R.table[1], t);
    if (ta > 0.002) {
      for (let i = 0; i < 5; i++) drawText(bText, String(i + 1), XR, rowY(i) + (TH - RH) / 2, { h: RH, color: mul(DIM, ta), align: 'right' });
      for (let i = 0; i < 4; i++) {
        const y = rowY(i + 1), c = mul(GOLD, 0.62 * ta);
        drawText(bText, ROWS[i][0].split('').join('·'), XL, y, { h: TH, color: c, align: 'left' });
        drawText(bText, six(ROWS[i][1]), XS, y, { h: TH, color: c, align: 'right' });
      }
      // the top row: an empty slot (three dashes, as a machine waits for initials) until A, V, R come in
      const yT = rowY(0);
      const slot = ta * (1 - ss(R.letters[0], R.letters[0] + LETTER, t));
      if (slot > 0.002) for (let k = 0; k < 3; k++) bText.line([[XL + k * 60, yT + TH + 8], [XL + k * 60 + 44, yT + TH + 8]], mul(DIM, slot));
      const pitch = textWidth('A·V·R', TH) / 5;
      ['A', '·', 'V', '·', 'R'].forEach((ch, k) => {
        const idx = k >> 1;                                                   // the dot comes in with the letter before it
        const a = ss(R.letters[idx], R.letters[idx] + LETTER, t) * ta;
        if (a > 0.002) drawText(bText, ch, XL + k * pitch, yT, { h: TH, color: mul(PALE, a * 1.15), align: 'left' });
      });
      const sa = ss(R.score, R.score + LETTER, t) * ta;
      if (sa > 0.002) drawText(bText, six(AVR_SCORE), XS, yT, { h: TH, color: mul(PALE, sa * 1.15), align: 'right' });
    }
    for (const b of [bLens, bGate, bText]) b.commit();
  }

  function update(dt) {
    if (done) return true;
    if (!ready) {
      if (!plate.tex.image) return false;                      // (the plate is a moment away: the passage's picture holds)
      ready = true;
      const ot = kit.output.texture;
      ot.generateMipmaps = true; ot.minFilter = THREE.LinearMipmapLinearFilter; ot.magFilter = THREE.LinearFilter; ot.anisotropy = 4;
      renderer.initTexture(plate.tex);
      draw(); ctx.vp(() => kit.render(1 / 60));
      ctx.show(kit.texture, 1.6);                              // the passage's light dissolves into the machine's glass
      out.texture = kit.texture;
      return false;
    }
    dt = Math.min(Math.max(+dt || 0, 0), 0.1);
    t += dt;
    const R = REVEAL;
    fire('ves', 0.0, (c) => c.play('revealVesica'));
    fire('gate', R.gate[0], (c) => c.play('revealGate'));
    fire('a', R.letters[0], (c) => c.play('revealTick', { pitch: 0 }));
    fire('v', R.letters[1], (c) => c.play('revealTick', { pitch: 4 }));
    fire('r', R.letters[2], (c) => c.play('revealTick', { pitch: 7 }));
    fire('sc', R.score, (c) => c.play('revealTick', { pitch: 12, level: 0.8 }));
    draw();
    ctx.vp(() => kit.render(Math.max(dt, 1e-4)));
    if (t >= R.end) { done = true; return true; }
    return false;
  }
  return out;
}
