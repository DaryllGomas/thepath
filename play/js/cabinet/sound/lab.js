// THE CABINET'S SOUND · the lab: render any sound offline and measure it (the audition page and tools/sound_render.mjs).
//   await renderSound('hearth', 'blaze')     -> { data: Float32Array, sampleRate, measure }   (at FULL volume: the worst case)
//   await renderPalette('hearth')            -> [{ name, label, loop, measure, pcm (base64 16-bit) }]
//   DEMOS[name]  how a loop is driven for its preview: [[seconds, x] ...] (straight lines between)
import { Chip } from './chip.js';
import { PALETTES } from './index.js';
import { dbGain } from './chip.js';
import { SHARED } from './palettes/cabinet.js';
import { analyse } from './measure.js';

const B = (inhale, exhale) => {                // one breath of the start screen (in 3.5 s, out 4.5 s, eased like the flower)
  const k = []; const sm = (u) => u * u * u * (u * (u * 6 - 15) + 10);
  for (let t = 0; t <= inhale + exhale + 1e-9; t += 0.1) k.push([+t.toFixed(2), t < inhale ? sm(t / inhale) : 1 - sm((t - inhale) / exhale)]);
  return k;
};
export const DEMOS = {
  attractDrone: [...B(3.5, 4.5), ...B(3.5, 4.5).map(([t, x]) => [+(t + 8.05).toFixed(2), x])],
  attractShimmer: [[0, 0], [1.5, 1], [6.5, 1], [8.5, 0]],
  redraw: [[0, 0], [3.6, 1]],
  fireBed: [[0, 0.15], [4, 1], [6, 0.5]],
  sky: [[0, 0], [3.5, 1], [3.6, 0.2], [5, 0.9]],
  thrust: [[0, 0], [0.15, 1], [1.4, 1], [1.55, 0], [2.3, 0], [2.45, 0.6], [3.4, 0.6], [3.55, 0], [4.2, 0], [4.3, 1], [4.6, 1], [4.7, 0]],
  sideJet: [[0, 0], [0.15, 1], [1.2, 1], [1.35, 0], [2, 0], [2.1, 0.5], [3, 0.5], [3.1, 0]],
  coreDrone: [[0, 0], [5, 1], [6, 1]],
  charge: [[0, 0], [0.6, 1], [0.62, 0], [1.6, 0], [2.2, 1], [2.22, 0]],
  fright: [[0, 1], [6.5, 0]],
  waveTone: [[0, 0.5], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1], [6, 0.5]],
  heart: [[0, 0], [7, 1]],
  letgoTone: [[0, 0], [3.5, 1], [4.5, 1], [5.5, 0.35], [7, 1]],
  fall: [[0, 0], [9, 1]],
};
const DEFAULT_DEMO = [[0, 0], [3, 1], [5, 0]];
export const demoOf = (name) => DEMOS[name] || DEFAULT_DEMO;

/** How long a one-shot lasts (s): its longest layer (delay + envelope). */
export function lengthOf(P) {
  let m = 0;
  for (const L of P.layers || []) { const E = { a: 0.003, d: 0.08, h: 0, r: 0.03, ...(L.env || {}) }; m = Math.max(m, (L.at || 0) + E.a + E.d + E.h + E.r); }
  return m;
}

/** x of a keyframe list at time t. */
export function keyAt(K, t) {
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [t0, x0] = K[i - 1], [t1, x1] = K[i]; return x0 + (x1 - x0) * ((t - t0) / (t1 - t0 || 1)); }
  return K[K.length - 1][1];
}

export async function renderSound(pid, name, o = {}) {
  const P = PALETTES[pid].sounds[name];
  if (!P) throw new Error('no sound ' + pid + '.' + name);
  const sr = o.sampleRate || 48000;
  const K = P.loop ? demoOf(name) : null;
  const len = P.loop ? K[K.length - 1][0] + (P.release ?? 0.5) + 0.4 : lengthOf(P) + 0.3;
  const chip = await Chip.offline(len, { sampleRate: sr, volume: o.volume ?? 1, grit: o.crush ?? true, seed: o.seed ?? 0x5eed });
  if ((o.crush ?? true) && !chip.crushNode) throw new Error('the grit did not load: ' + chip.crushError);
  const t0 = 0.02, mix = SHARED.has(name) || P.group === 'end' ? 1 : dbGain(PALETTES[pid].mix || 0);   // (as GameSound plays it: with the game's trim)
  if (P.loop) {
    const h = chip.loop(P, { when: t0, x: K[0][1], level: mix });
    const end = K[K.length - 1][0];
    for (let t = 1 / 60; t <= end + 1e-9; t += 1 / 60) h.drive(keyAt(K, t), undefined, t0 + t);
    h.stop(P.release ?? 0.5, t0 + end);
  } else chip.play(P, { when: t0, pitch: o.pitch || 0, level: mix });
  const buf = await chip.ctx.startRendering();
  const data = buf.getChannelData(0);
  return { data, sampleRate: sr, measure: analyse(data, sr) };
}

export function toBase64Pcm16(data) {
  const n = data.length, i16 = new Int16Array(n);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, data[i])); i16[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767); }
  const u8 = new Uint8Array(i16.buffer);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function renderPalette(pid, o = {}) {
  const out = [];
  for (const [name, P] of Object.entries(PALETTES[pid].sounds)) {
    const r = await renderSound(pid, name, o);
    out.push({ name, label: P.label, group: P.group, loop: !!P.loop, measure: r.measure, sampleRate: r.sampleRate, pcm: o.pcm === false ? null : toBase64Pcm16(r.data) });
  }
  return out;
}
