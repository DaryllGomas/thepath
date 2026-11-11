// THE WARP's own sound (Daryll 11-11: the warp had only the cabinet's hum, rising). Built in WebAudio on the game's own context
// and through the listener's input, so the master volume (and 0 = muted) applies; nothing is downloaded, every sound is made
// here from noise and oscillators. Scheduled whole when the pull starts, on the same timetable as the picture (js/warp.js):
//
//   0-9 s     a deep rush that builds: filtered noise opening up, a sub drone rising under it (the cabinet's hum stays on top)
//   5.6-12 s  whooshes as things fly past: each painted pane as it crosses you (left or right, by its wall; warpFlyBys), the two
//             great panes as they slide out past the frame (~10.5 s), THE GATE's rings as they go past the frame (~10.7 s)
//   11.8-15 s rising into the light: the rush brightens, a shimmer of a chord glides up an octave, air above it
//   14.2-18 s a soft bright swell into the white: the chord an octave up, swelling as the frame goes white (15 s), then a long
//             release while the screen stays white; the rush falls away under it
//
//   const s = startWarpSound(ctx, out, { linesEnd })   ->  { stop(fade), info } or null (no audio: nothing breaks)
//   renderWarpSound(OfflineAudioContextClass)          ->  Promise<AudioBuffer> (the same graph, rendered offline: tests)
import { THROUGH, WARP_LEN, warpFlyBys } from './warp.js';

export const WARP_SOUND_LEN = THROUGH + WARP_LEN + 3.2;     // through the white (js/ending.js holds white 3 s, then the end)
const WHITE = THROUGH + WARP_LEN;                             // 15 s: the frame is white

// seeded noise, so every run (and the offline render) is the same sound
function noiseBuffer(ctx, secs, seed) {
  const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;              // pink (Paul Kellet's filter): a rush, not a hiss
    for (let i = 0; i < n; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    // a seamless loop: the last 50 ms fade into the first
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++) { const k = i / f; d[n - f + i] = d[n - f + i] * (1 - k) + d[i] * k; }
  }
  return buf;
}
// a value's path over time: [[t, v], ...] from t0, linear between points (exponential where both ends are > 0 and `exp`)
function path(param, t0, pts, exp = false) {
  param.cancelScheduledValues(0);
  param.setValueAtTime(pts[0][1], t0 + pts[0][0]);
  for (let i = 1; i < pts.length; i++) {
    const [t, v] = pts[i], prev = pts[i - 1][1];
    if (exp && v > 0 && prev > 0) param.exponentialRampToValueAtTime(v, t0 + t); else param.linearRampToValueAtTime(v, t0 + t);
  }
}
const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

function build(ctx, out, t0, linesEnd) {
  const nodes = [];
  const keep = (n) => { nodes.push(n); return n; };
  const gain = (v = 0) => { const g = keep(ctx.createGain()); g.gain.value = v; return g; };
  // the bus: a gentle compressor so the whooshes over the rush never clip, then the level into the listener
  const comp = keep(ctx.createDynamicsCompressor());
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
  const master = gain(0.8); comp.connect(master); master.connect(out);
  const noise = noiseBuffer(ctx, 4, 20261111);
  const src = (offset = 0) => { const s = keep(ctx.createBufferSource()); s.buffer = noise; s.loop = true; s.start(t0 + offset, (offset * 0.37) % 3.5); s.stop(t0 + WARP_SOUND_LEN); return s; };

  // ---- the rush: pink noise through a low-pass that opens with the speed, and a resonant band rising inside it
  const rush = src(0), lp = keep(ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.Q.value = 0.8;
  const rushG = gain(0); rush.connect(lp); lp.connect(rushG); rushG.connect(comp);
  path(lp.frequency, t0, [[0, 80], [5.6, 240], [THROUGH, 650], [THROUGH + 2.8, 2000], [WHITE - 0.4, 5200], [WHITE, 6500]], true);
  path(rushG.gain, t0, [[0, 0], [2.5, 0.05], [5.6, 0.13], [THROUGH, 0.3], [THROUGH + 3, 0.5], [WHITE - 0.6, 0.55], [WHITE, 0.16], [WHITE + 0.9, 0.0001], [WHITE + 1.0, 0]]);
  const band = src(1.3), bp = keep(ctx.createBiquadFilter()); bp.type = 'bandpass'; bp.Q.value = 2.5;
  const bandG = gain(0); band.connect(bp); bp.connect(bandG); bandG.connect(comp);
  path(bp.frequency, t0, [[0, 110], [THROUGH, 380], [THROUGH + 3, 1300], [WHITE, 3200]], true);
  path(bandG.gain, t0, [[0, 0], [5.6, 0.07], [THROUGH + 3, 0.28], [WHITE - 0.5, 0.3], [WHITE + 0.6, 0]]);

  // ---- the deep drone under it: two low voices a little apart, rising as time rushes
  const subG = gain(0), subLP = keep(ctx.createBiquadFilter()); subLP.type = 'lowpass'; subLP.frequency.value = 200; subLP.connect(subG); subG.connect(comp);
  for (const [type, f, g] of [['sine', 41, 0.9], ['triangle', 82, 0.35]]) {      // an octave apart: no beating
    const o = keep(ctx.createOscillator()); o.type = type; const og = gain(g); o.connect(og); og.connect(subLP);
    path(o.frequency, t0, [[0, f], [THROUGH, f * 1.34], [WHITE - 0.5, f * 2.0]], true);
    o.start(t0); o.stop(t0 + WARP_SOUND_LEN);
  }
  path(subG.gain, t0, [[0, 0], [4, 0.07], [THROUGH, 0.16], [THROUGH + 3, 0.2], [WHITE - 0.3, 0.12], [WHITE + 0.5, 0]]);

  // ---- the whooshes: a band of noise sweeping up to the moment it passes and down after, panned from its side outward
  let nW = 0; const last = { '-1': -9, '0': -9, '1': -9 };
  const whoosh = (t, side, { pre = 0.28, post = 0.45, f0 = 380, f1 = 2100, f2 = 520, level = 0.4, q = 1.3 } = {}) => {
    const s = keep(ctx.createBufferSource()); s.buffer = noise; s.loop = true;
    const f = keep(ctx.createBiquadFilter()); f.type = 'bandpass'; f.Q.value = q;
    const g = gain(0), p = ctx.createStereoPanner ? keep(ctx.createStereoPanner()) : null;
    s.connect(f); f.connect(g);
    if (p) { g.connect(p); p.connect(comp); path(p.pan, t0, [[t - pre, side * 0.25], [t, side * 0.6], [t + post, side * 0.95]]); } else g.connect(comp);
    path(f.frequency, t0, [[t - pre, f0], [t, f1], [t + post, f2]], true);
    path(g.gain, t0, [[t - pre, 0.0001], [t - pre * 0.15, level], [t + post, 0.0001]], true);
    s.start(t0 + Math.max(0, t - pre), (t * 0.73) % 3.5); s.stop(t0 + t + post + 0.05);
    nW++;
  };
  for (const e of warpFlyBys(linesEnd)) {
    const t = e.t, tw = t - THROUGH;
    if (e.kind === 'rings') {
      // THE GATE goes past: a wide double sweep, left and right, and a low thump under it
      whoosh(t, -1, { pre: 0.9, post: 1.1, f0: 160, f1: 2600, f2: 700, level: 0.5, q: 0.9 });
      whoosh(t + 0.06, 1, { pre: 0.9, post: 1.1, f0: 170, f1: 2500, f2: 680, level: 0.5, q: 0.9 });
      const o = keep(ctx.createOscillator()); o.type = 'sine'; const og = gain(0); o.connect(og); og.connect(comp);
      path(o.frequency, t0, [[t - 0.2, 70], [t + 0.8, 34]], true);
      path(og.gain, t0, [[t - 0.25, 0.0001], [t, 0.45], [t + 0.9, 0.0001]], true);
      o.start(t0 + t - 0.3); o.stop(t0 + t + 1.0);
      continue;
    }
    if (e.kind === 'great') { whoosh(t, e.side, { pre: 0.7, post: 0.9, f0: 220, f1: 1300, f2: 360, level: 0.42, q: 1.0 }); continue; }
    if (tw > 3.4) continue;                                   // by then the light has them; the rush carries it
    if (t - last[e.side] < 0.16) continue;                    // at full speed they come too fast to hear one by one
    last[e.side] = t;
    // quiet while only glints fly (the paintings come on the walls at tw 0.7-1.7: warpLook's bigOn), full as they rush by
    const level = t < 5.6 ? 0.04 : tw < 0.7 ? 0.1 : 0.3 * (1 - 0.6 * sm((tw - 2.0) / 1.4));
    whoosh(t, e.side, { level, pre: tw > 0 ? 0.16 : 0.3, post: tw > 0 ? 0.3 : 0.5 });
  }

  // ---- rising into the light: a chord (A major) glides up an octave, and air above it
  const chord = [220, 277.18, 329.63, 440];
  const shG = gain(0); shG.connect(comp);
  path(shG.gain, t0, [[THROUGH + 2.4, 0], [THROUGH + 4.2, 0.18], [WHITE - 0.4, 0.34], [WHITE + 0.4, 0]]);
  chord.forEach((f, i) => {
    const o = keep(ctx.createOscillator()); o.type = 'sine'; const og = gain(0.25); o.connect(og); og.connect(shG);
    o.detune.value = (i - 1.5) * 4;
    path(o.frequency, t0, [[THROUGH + 2.4, f], [WHITE - 0.2, f * 2]], true);
    o.start(t0 + THROUGH + 2.4); o.stop(t0 + WHITE + 0.5);
  });
  const air = src(2.1), hp = keep(ctx.createBiquadFilter()); hp.type = 'highpass'; hp.Q.value = 0.5;
  const airG = gain(0); air.connect(hp); hp.connect(airG); airG.connect(comp);
  path(hp.frequency, t0, [[THROUGH + 2.0, 2500], [WHITE, 7000]], true);
  path(airG.gain, t0, [[THROUGH + 2.0, 0], [WHITE - 0.3, 0.32], [WHITE + 0.3, 0.12], [WHITE + 2.4, 0]]);

  // ---- the swell into the white: the chord an octave up, soft and bright, then a long release
  const swG = gain(0), swLP = keep(ctx.createBiquadFilter()); swLP.type = 'lowpass'; swLP.frequency.value = 5500;
  swLP.connect(swG); swG.connect(comp);
  path(swG.gain, t0, [[WHITE - 1.0, 0.0001], [WHITE + 0.1, 0.62], [WHITE + 0.9, 0.5], [WHITE + 2.6, 0.02], [WHITE + 3.15, 0.0001]], true);
  chord.forEach((f, i) => {
    for (const det of [-5, 6]) {
      const o = keep(ctx.createOscillator()); o.type = i === 3 ? 'triangle' : 'sine'; o.frequency.value = f * 4; o.detune.value = det;
      const og = gain(0.11); o.connect(og); og.connect(swLP);
      o.start(t0 + WHITE - 1.05); o.stop(t0 + WARP_SOUND_LEN);
    }
  });
  return { master, nodes, whooshes: nW };
}

// live: on the game's context, into the listener (its master volume). Only on a running context, so a sound never plays late.
export function startWarpSound(ctx, out, { linesEnd = 17.5 } = {}) {
  if (!ctx || !out || ctx.state !== 'running') return null;
  try {
    const t0 = ctx.currentTime + 0.02;
    const g = build(ctx, out, t0, linesEnd);
    return {
      info: { at: +t0.toFixed(3), whooshes: g.whooshes, nodes: g.nodes.length, len: WARP_SOUND_LEN },
      stop(fade = 0.3) {
        try { const now = ctx.currentTime; g.master.gain.cancelScheduledValues(now); g.master.gain.setValueAtTime(g.master.gain.value, now); g.master.gain.linearRampToValueAtTime(0, now + fade); } catch (e) { /* gone */ }
        setTimeout(() => { try { g.master.disconnect(); } catch (e) { /* gone */ } }, (fade + 0.1) * 1000);
      },
    };
  } catch (e) { console.warn('[warp] sound', e); return null; }
}

// offline: the same sound, rendered (tools/warp_sound.mjs)
export function renderWarpSound(Offline = globalThis.OfflineAudioContext, sampleRate = 48000) {
  const oc = new Offline(2, Math.ceil(sampleRate * WARP_SOUND_LEN), sampleRate);
  build(oc, oc.destination, 0, 17.5);
  return oc.startRendering();
}
