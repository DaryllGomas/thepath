// THE CABINET'S SOUND · THE CHIP: a small 1981-style sound board, built from WebAudio. Every sound the cabinet makes is
// made here, fresh, from a few voices; nothing is a recording.
//
//   const chip = Chip.live()                    a live chip, made inside a click / key handler (the browser's autoplay rule:
//                                               js/cabinet/sound/page.js onGesture() does this); Chip.create() makes one
//                                               anywhere (suspended until chip.unlock() sees a click)
//   const chip = await Chip.offline(seconds)    the same chip rendering into an OfflineAudioContext (previews, tests)
//   chip.play(patch, { when, pitch, level, key })   a one-shot (pitch in semitones; the voice manager may drop or steal)
//   const h = chip.loop(patch, { when, x })     a held sound: h.drive(x) (0..1, what the patch says x means), h.bend(cents),
//                                               h.gain(m), h.stop()
//   chip.output                                 the routable end of the chain (a GainNode). It goes to the speakers until
//                                               chip.route(node) sends it somewhere else (the 3D room's positional audio later)
//   chip.volume = 0..1    chip.crush = true / false (the grit; `grit: false` as an option to start without it)    chip.duck('main', level, seconds)
//
// THE VOICES (as the boards of 1981: square / pulse channels, a triangle for the bass, a noise channel):
//   'pulse'  a band-limited pulse; duty 0.125, 0.25 or 0.5 (any duty works). Lanczos-softened top harmonics.
//   'tri'    the 4-bit STEPPED triangle (32 steps a cycle: the soft buzz of the old bass channel)
//   'noise'  a 15-bit LFSR, long mode (hiss, rumble, bursts); its clock `rate` in Hz is its pitch
//   'metal'  the same LFSR in short mode (a 93-step loop: a pitched, metallic buzz)
// THE PATCH (data: js/cabinet/sound/palettes/*.js):
//   { label, desc, layers: [LAYER...], db: 0 (a trim for the whole sound), max: 2 (this patch's voices at once), gap: 0.03 (s: a retrigger sooner is dropped),
//     vary: { pitch: cents, level: fraction, time: s } (every trigger a little different), bus: 'main' | 'calm' }
//   LAYER = { wave, duty, f (Hz; noise: rate), at (s delay), detune (cents),
//     env: { a, d, s, h, r, v, q } (attack, decay, sustain fraction, hold, release, peak level; q = stepped decay, s a step),
//     sweep: { to (x the base), t, at, curve: 'exp' | 'lin', q (stepped, s a step) } or an array of them, one after another,
//     arp: { n: [semitones], step: s, loop } or seq: [[s, semitones] ...],
//     vib: { rate, depth (cents), at, fade }, trem: { rate, depth (0..1) }, lp: Hz | { f, to, t, at, q } (a low-pass on this layer) }
//   A LOOP PATCH: { loop: true, attack, release, glide, bus, layers: [{ wave, duty, f: Hz | [lo, hi], rate, level: v | [lo, hi],
//     lp, span: [x0, x1], pow, vib, trem, detune }] }: drive(x) moves each layer along its [lo, hi] (f / rate / lp
//     exponentially, level linearly) over its span of x.
// THE CHAIN (hearing safety: docs/concepts/basement_brief/59_cabinet_sound/README.md):
//   voices -> buses (main, calm) -> high-pass 35 Hz -> [crush] -> low-pass 6.8 kHz -> low-pass 7.8 kHz (4th order together)
//   -> high shelf -4 dB above 4 kHz -> mix -> the limiter (a compressor above -10 dBFS, its makeup gain trimmed off: unity
//   below) -> soft ceiling at 0.68 (-3.35 dBFS: nothing can peak above it) -> volume -> output
// THE VOICE MANAGER: at most CHIP.maxVoices one-shots at once and patch.max of any one patch; a new one steals the OLDEST
// (a 12 ms fade, no click). patch.gap drops a retrigger that comes too soon: a rapid repeat never piles up into a buzz.
export const CHIP = Object.freeze({
  maxVoices: 12,
  highpass: 35,
  lowpass: [6800, 7800],
  shelf: { f: 4000, gain: -4 },
  mix: 1.0,
  // the limiter: a fast compressor that only acts above -10 dBFS. Chrome adds a fixed makeup gain to every
  // DynamicsCompressor (measured: +3.66 dB for these settings); `trim` takes it back off, so below the knee the chain is
  // unity gain and a patch's level is what you hear (tools/sound_check.mjs verifies it)
  comp: { threshold: -8, knee: 4, ratio: 12, attack: 0.003, release: 0.25 },
  trim: -3.66,
  ceiling: 0.68, knee: 0.45,
  crush: { bits: 8, hold: 3, mu: 255 },
  volume: 0.8,
  harmonics: 40,
  lookahead: 0.012,
  maxHz: 3400,          // no tone layer may reach above this (its fundamental, with every sweep / arpeggio / pitch step): dropped if so
});

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const dbGain = (db) => (db ? Math.pow(10, db / 20) : 1);
const range = (v, x) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * x : v);
const rangeExp = (v, x) => (Array.isArray(v) ? v[0] * Math.pow(v[1] / v[0], x) : v);
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- the waveforms
function pulseCoeffs(duty, n) {
  const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    const x = Math.PI * k / (n + 1), sigma = Math.sin(x) / x;                 // Lanczos: softens the ring at the edges
    re[k] = sigma * (2 / (Math.PI * k)) * Math.sin(TAU * k * duty);
    im[k] = sigma * (2 / (Math.PI * k)) * (1 - Math.cos(TAU * k * duty));
  }
  return [re, im];
}
function steppedTriCoeffs(n) {
  const M = 4096, x = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    const p = i / M, tri = p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
    x[i] = Math.round((tri + 1) * 7.5) / 7.5 - 1;                           // 16 levels (4 bits), 32 steps a cycle
  }
  const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    let a = 0, b = 0;
    for (let i = 0; i < M; i++) { const w = TAU * k * i / M; a += x[i] * Math.cos(w); b += x[i] * Math.sin(w); }
    re[k] = 2 * a / M; im[k] = 2 * b / M;
  }
  return [re, im];
}
function lfsrSequence(short) {
  const tap = short ? 6 : 1, out = [];
  let reg = 1;
  do {
    out.push(reg & 1 ? 1 : -1);
    const fb = (reg ^ (reg >> tap)) & 1;
    reg = (reg >> 1) | (fb << 14);
  } while (reg !== 1 && out.length < 40000);
  return out;
}
function ceilingCurve(C, K) {
  const n = 8193, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= K ? a : K + (C - K) * Math.tanh((a - K) / (C - K)));
  }
  return c;
}

// ---------------------------------------------------------------- the chip
export class Chip {
  static async create(o = {}) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    const chip = new Chip(new AC({ latencyHint: 'interactive' }), o);
    await chip.ready;
    return chip;
  }
  /** A live chip made NOW, synchronously: call it inside a click / key handler (the browser's rule) and it starts running at
   *  once; the grit loads in the background (chip.ready) and joins when it is there (until then the chain runs dry). */
  static live(o = {}) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    const chip = new Chip(new AC({ latencyHint: 'interactive' }), o);
    if (chip.ctx.state !== 'running') chip.ctx.resume();
    return chip;
  }
  static async offline(seconds, o = {}) {
    const sr = o.sampleRate || 48000;
    const ctx = new OfflineAudioContext({ numberOfChannels: 1, length: Math.max(1, Math.ceil(seconds * sr)), sampleRate: sr });
    const chip = new Chip(ctx, { ...o, offline: true });
    await chip.ready;
    return chip;
  }

  constructor(ctx, o = {}) {
    this.ctx = ctx;
    this.o = { ...CHIP, ...o };
    this.offline = !!o.offline;
    this.rand = mulberry32(o.seed ?? 0x5eed);
    this._waves = new Map(); this._noise = new Map(); this._seq = {};
    this.voices = []; this.loops = new Set(); this._last = new Map();
    this.stats = { played: 0, dropped: 0, stolen: 0, peakVoices: 0, loops: 0, tooHigh: 0 };
    this.log = null;                                 // [] to record every voice (tests): { key, start, end }
    this.clock = null;                               // offline: the caller's time (s) for now()
    const c = ctx, O = this.o;
    const g = (v) => { const n = c.createGain(); n.gain.value = v; return n; };
    const f = (type, freq, q, gain) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = freq; if (q !== undefined) n.Q.value = q; if (gain !== undefined) n.gain.value = gain; return n; };
    this.buses = { main: g(1), calm: g(1) };
    this.sum = g(1);
    this.buses.main.connect(this.sum); this.buses.calm.connect(this.sum);
    this.hp = f('highpass', O.highpass, 0.7);
    this.dry = g(1); this.wet = g(0);
    this.lp1 = f('lowpass', O.lowpass[0], 0.55); this.lp2 = f('lowpass', O.lowpass[1], 0.55);
    this.shelf = f('highshelf', O.shelf.f, undefined, O.shelf.gain);
    this.pre = g(O.mix);
    this.comp = c.createDynamicsCompressor();
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) this.comp[k].value = O.comp[k];
    this.trim = g(Math.pow(10, O.trim / 20));
    this.clip = c.createWaveShaper(); this.clip.curve = ceilingCurve(O.ceiling, O.knee); this.clip.oversample = 'none';
    this.vol = g(O.volume);
    this.output = g(1);
    this.sum.connect(this.hp); this.hp.connect(this.dry); this.dry.connect(this.lp1);
    this.lp1.connect(this.lp2); this.lp2.connect(this.shelf); this.shelf.connect(this.pre); this.pre.connect(this.comp);
    this.comp.connect(this.trim); this.trim.connect(this.clip); this.clip.connect(this.vol); this.vol.connect(this.output);
    this._dest = c.destination; this.output.connect(this._dest);
    this._crushOn = o.grit !== undefined ? !!o.grit : true;          // (option `grit`: on / off; CHIP.crush holds its settings)
    this.crushNode = null;
    this.ready = this._loadCrush();
  }

  async _loadCrush() {
    try {
      if (!this.ctx.audioWorklet) throw new Error('no AudioWorklet');
      await this.ctx.audioWorklet.addModule(new URL('./crush.worklet.js', import.meta.url).href);
      const n = new AudioWorkletNode(this.ctx, 'chip-crush', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const C = this.o.crush;
      n.parameters.get('bits').value = C.bits; n.parameters.get('hold').value = C.hold; n.parameters.get('mu').value = C.mu;
      this.hp.connect(n); n.connect(this.wet); this.wet.connect(this.lp1);
      this.crushNode = n;
      this.crush = this._crushOn;
    } catch (e) { this.crushNode = null; this.crushError = String(e && e.message || e); }
    return this;
  }

  // ---------------------------------------------------------------- the controls
  now() { return this.offline ? (this.clock ?? 0) : this.ctx.currentTime + this.o.lookahead; }
  get volume() { return this.vol.gain.value; }
  set volume(v) { const t = this.ctx.currentTime; this.vol.gain.cancelScheduledValues(t); this.vol.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), t, 0.03); }
  get crush() { return this._crushOn && !!this.crushNode; }
  set crush(on) {
    this._crushOn = !!on;
    if (!this.crushNode) return;
    const t = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(on ? 1 : 0, t, 0.02); this.dry.gain.setTargetAtTime(on ? 0 : 1, t, 0.02);
  }
  /** Send the chip's output somewhere else (a PannerNode on the cabinet in the 3D room, later). null = the speakers. */
  route(node) { this.output.disconnect(); this._dest = node || this.ctx.destination; this.output.connect(this._dest); }
  /** Lower (or restore) a bus: 'main' carries the games; 'calm' is left alone (the Tunnel's let-go tone). */
  duck(bus, level, seconds = 0.8, when = this.now()) {
    const p = this.buses[bus].gain;
    p.cancelScheduledValues(when); p.setTargetAtTime(level, when, seconds / 3);
  }
  bus(name) { return this.buses[name] || this.buses.main; }
  /** Resume the context on the first click / key / touch (the browser's autoplay rule). */
  unlock(target = globalThis.window) {
    if (this.offline || !target) return;
    const go = () => {
      this.ctx.resume();
      if (this.ctx.state === 'running') for (const e of ['pointerdown', 'keydown', 'touchend']) target.removeEventListener(e, go, true);
    };
    for (const e of ['pointerdown', 'keydown', 'touchend']) target.addEventListener(e, go, true);
  }
  get running() { return this.offline || this.ctx.state === 'running'; }
  /** A level meter on the output (tests, the audition page): { peak, rms } of the last ~21 ms. */
  meter() {
    if (!this._an) { this._an = this.ctx.createAnalyser(); this._an.fftSize = 1024; this.output.connect(this._an); this._buf = new Float32Array(1024); }
    this._an.getFloatTimeDomainData(this._buf);
    let pk = 0, ss = 0; for (const v of this._buf) { pk = Math.max(pk, Math.abs(v)); ss += v * v; }
    return { peak: pk, rms: Math.sqrt(ss / this._buf.length) };
  }

  // ---------------------------------------------------------------- the waveforms (cached)
  wave(kind, duty = 0.5) {
    const key = kind + ':' + duty;
    let w = this._waves.get(key);
    if (!w) {
      const [re, im] = kind === 'tri' ? steppedTriCoeffs(this.o.harmonics) : pulseCoeffs(duty, this.o.harmonics);
      w = this.ctx.createPeriodicWave(re, im);
      this._waves.set(key, w);
    }
    return w;
  }
  /** The LFSR as a looping buffer, each step held `hold` samples (the clock = sampleRate / hold, before playbackRate). */
  noise(short, hold) {
    const key = (short ? 's' : 'l') + hold;
    let b = this._noise.get(key);
    if (!b) {
      const seq = this._seq[short] || (this._seq[short] = lfsrSequence(short));
      const sr = this.ctx.sampleRate, P = seq.length;
      const len = short ? P * hold * Math.max(1, Math.ceil(8192 / (P * hold))) : Math.min(P * hold, Math.ceil(sr * 4));
      b = this.ctx.createBuffer(1, len, sr);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = 0.9 * seq[Math.floor(i / hold) % P];
      this._noise.set(key, b);
    }
    return b;
  }
  _holdFor(rate) { const sr = this.ctx.sampleRate; let h = 1; while (h < 1024 && sr / (h * 2) >= rate) h *= 2; return h; }

  // ---------------------------------------------------------------- one-shots
  play(P, o = {}) {
    if (!P || !P.layers) return null;
    const c = this.ctx, key = o.key || P.key || P.label || 'sound';
    let t = o.when ?? this.now();
    if (!this.offline) t = Math.max(t, c.currentTime + 0.002);
    const last = this._last.get(key);
    if (last !== undefined && t - last < (P.gap ?? 0.02) && t >= last) { this.stats.dropped++; return null; }
    this._last.set(key, t);
    const V = P.vary || {};
    if (V.time) t += this.rand() * V.time;
    const pitch = (o.pitch || 0) * 100 + (V.pitch ? (this.rand() * 2 - 1) * V.pitch : 0);
    const level = (o.level ?? 1) * dbGain(P.db) * (V.level ? 1 + (this.rand() * 2 - 1) * V.level : 1);
    this._prune(t);
    const mine = this.voices.filter((v) => v.key === key && v.start <= t + 1e-6);
    if (mine.length >= (P.max ?? 3)) this._steal(mine[0], t);
    const live = this.voices.filter((v) => v.start <= t + 1e-6);
    if (live.length >= this.o.maxVoices) this._steal(live[0], t);
    const vg = c.createGain(); vg.gain.value = level;
    vg.connect(this.bus(o.bus || P.bus));
    const voice = { key, start: t, end: t, vg, srcs: [] };
    for (const L of P.layers) {
      if (this._topHz(L, pitch) > this.o.maxHz) { this.stats.tooHigh++; continue; }   // hearing safety: never a piercing tone
      voice.end = Math.max(voice.end, this._layer(L, t, pitch, vg, voice.srcs));
    }
    const tail = voice.end + 0.05;
    voice.srcs[0]?.addEventListener?.('ended', () => { try { vg.disconnect(); } catch (e) { /* gone */ } });
    this.voices.push(voice);
    this.stats.played++;
    this.stats.peakVoices = Math.max(this.stats.peakVoices, this.voices.filter((v) => v.start <= t + 1e-6).length + this.loopsSounding());
    if (this.log) this.log.push({ key, start: t, end: tail });
    return voice;
  }

  _layer(L, t0, pitchCents, dest, srcs) {
    const c = this.ctx, sr = c.sampleRate;
    const ts = t0 + (L.at || 0);
    const E = { a: 0.003, d: 0.08, s: 0, h: 0, r: 0.03, v: 0.2, ...(L.env || {}) };
    const tA = ts + E.a, tD = tA + E.d, tH = tD + E.h, tR = tH + E.r, end = tR + 0.006;
    // the source
    let src, param, base;
    const segs = L.sweep ? [].concat(L.sweep) : [];
    if (L.wave === 'noise' || L.wave === 'metal') {
      const rate = L.f ?? 8000;
      let hi = rate, run = rate; for (const s of segs) { run *= s.to ?? 1; hi = Math.max(hi, run); }
      const hold = this._holdFor(hi), buf = this.noise(L.wave === 'metal', hold);
      src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      param = src.playbackRate; base = rate * hold / sr;
      src.start(ts, this.rand() * buf.duration);
    } else {
      src = c.createOscillator(); src.setPeriodicWave(this.wave(L.wave || 'pulse', L.duty ?? 0.5));
      param = src.frequency; base = L.f ?? 440;
      src.start(ts);
    }
    src.stop(end + 0.01);
    srcs.push(src);
    param.setValueAtTime(base, ts);
    // pitch sweeps (one after another; stepped when q is set)
    let from = base, tt = ts;
    for (const S of segs) {
      const t1 = S.at !== undefined ? ts + S.at : tt, t2 = t1 + S.t, to = from * (S.to ?? 1);
      param.setValueAtTime(from, t1);
      if (S.q) {
        for (let k = 1; t1 + k * S.q <= t2 + 1e-9; k++) {
          const u = Math.min(1, (k * S.q) / S.t);
          param.setValueAtTime(S.curve === 'lin' ? from + (to - from) * u : from * Math.pow(to / from, u), t1 + k * S.q);
        }
      } else if (S.curve === 'lin') param.linearRampToValueAtTime(to, t2);
      else param.exponentialRampToValueAtTime(to, t2);
      from = to; tt = t2;
    }
    // the pitch offset, arpeggios / sequences (detune, in cents: they add to the sweep)
    const d0 = pitchCents + (L.detune || 0);
    src.detune.setValueAtTime(d0, ts);
    let seq = L.seq;
    if (L.arp) {
      const A = L.arp, n = A.n, st = A.step, aat = A.at || 0; seq = [];
      for (let i = 0; aat + i * st < end - ts; i++) { if (!A.loop && i >= n.length) break; seq.push([aat + i * st, n[i % n.length]]); }
    }
    if (seq) for (const [st, s] of seq) src.detune.setValueAtTime(d0 + s * 100, ts + st);
    let node = src;
    // a layer low-pass
    if (L.lp) {
      const F = typeof L.lp === 'number' ? { f: L.lp } : L.lp;
      const bq = c.createBiquadFilter(); bq.type = 'lowpass'; bq.Q.value = F.q ?? 0.7;
      bq.frequency.setValueAtTime(F.f, ts);
      if (F.to) { const t1 = ts + (F.at || 0); bq.frequency.setValueAtTime(F.f, t1); bq.frequency.exponentialRampToValueAtTime(F.to, t1 + (F.t || 0.2)); }
      node.connect(bq); node = bq;
    }
    // the envelope
    const g = c.createGain(), G = g.gain, floor = 0.0003;
    G.setValueAtTime(0, ts);
    G.linearRampToValueAtTime(E.v, tA);
    const sus = E.v * E.s;
    if (E.q) {
      const step = (v0, v1, t1, dur) => { const k = Math.max(1, Math.round(dur / E.q)); for (let i = 1; i <= k; i++) G.setValueAtTime(v0 + (v1 - v0) * (i / k), t1 + (i * dur) / k); };
      if (E.d > 0) step(E.v, sus, tA, E.d);
      if (E.r > 0 && sus > 0) step(sus, 0, tH, E.r);
      G.setValueAtTime(0, tR + 0.004);
    } else {
      if (E.d > 0) G.exponentialRampToValueAtTime(Math.max(sus, floor), tD);
      if (E.h > 0) G.setValueAtTime(Math.max(sus, floor), tH);
      if (sus > floor && E.r > 0) G.exponentialRampToValueAtTime(floor, tR);
      G.linearRampToValueAtTime(0, tR + 0.004);
    }
    node.connect(g); node = g;
    // tremolo (a gain in series: 1 - depth/2 .. 1 + depth/2)
    if (L.trem) {
      const tg = c.createGain(); tg.gain.value = 1 - L.trem.depth / 2;
      const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = L.trem.rate;
      const lg = c.createGain(); lg.gain.value = L.trem.depth / 2; lfo.connect(lg); lg.connect(tg.gain);
      lfo.start(ts); lfo.stop(end + 0.01); srcs.push(lfo);
      node.connect(tg); node = tg;
    }
    // vibrato (on detune)
    if (L.vib) {
      const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = L.vib.rate;
      const lg = c.createGain(); const vt = ts + (L.vib.at || 0);
      lg.gain.setValueAtTime(0, ts);
      if (L.vib.fade) { lg.gain.setValueAtTime(0, vt); lg.gain.linearRampToValueAtTime(L.vib.depth, vt + L.vib.fade); }
      else lg.gain.setValueAtTime(L.vib.depth, vt);
      lfo.connect(lg); lg.connect(src.detune);
      lfo.start(ts); lfo.stop(end + 0.01); srcs.push(lfo);
    }
    node.connect(dest);
    return end;
  }

  /** The highest frequency a tone layer reaches (Hz), with a pitch offset (cents); 0 for noise. */
  _topHz(L, cents = 0) {
    if (L.wave === 'noise' || L.wave === 'metal') return 0;
    let run = L.f ?? 440, hi = run;
    for (const S of (L.sweep ? [].concat(L.sweep) : [])) { run *= S.to ?? 1; hi = Math.max(hi, run); }
    let semis = 0;
    if (L.arp) semis = Math.max(0, ...L.arp.n); else if (L.seq) semis = Math.max(0, ...L.seq.map((x) => x[1]));
    return hi * Math.pow(2, (cents + (L.detune || 0)) / 1200 + semis / 12 + (L.vib ? L.vib.depth / 1200 : 0));
  }

  _prune(t) { if (this.voices.length) this.voices = this.voices.filter((v) => v.end > t); }
  _steal(v, t) {
    const G = v.vg.gain;
    if (G.cancelAndHoldAtTime) G.cancelAndHoldAtTime(t); else { G.cancelScheduledValues(t); G.setValueAtTime(G.value, t); }
    G.linearRampToValueAtTime(0, t + 0.012);
    for (const s of v.srcs) { try { s.stop(t + 0.016); } catch (e) { /* already stopped */ } }
    v.end = t + 0.016;
    if (this.log) { const r = this.log.find((x) => x.key === v.key && x.start === v.start); if (r) r.end = v.end; }
    this.voices = this.voices.filter((x) => x !== v);
    this.stats.stolen++;
  }
  /** One-shots sounding at time t (and loops that are audible now). */
  voicesAt(t = this.now()) { let n = 0; for (const v of this.voices) if (v.start <= t && v.end > t) n++; return n + this.loopsSounding(); }
  loopsSounding() { let n = 0; for (const l of this.loops) if (l.sounding) n++; return n; }

  // ---------------------------------------------------------------- loops
  loop(P, o = {}) { return new LoopVoice(this, P, o); }

  /** Stop everything (loops released, one-shots faded). */
  hush(release = 0.3) {
    const t = this.now();
    for (const l of [...this.loops]) l.stop(release, t);
    for (const v of [...this.voices]) if (v.end > t) this._steal(v, Math.max(t, v.start));
  }
}

// ---------------------------------------------------------------- a held sound
class LoopVoice {
  constructor(chip, P, o = {}) {
    const c = chip.ctx, t = o.when ?? chip.now();
    this.chip = chip; this.P = P; this.key = o.key || P.label || 'loop'; this.stopped = false; this.levelNow = 0;
    this.out = c.createGain(); this.out.gain.setValueAtTime(0, t); this.out.gain.linearRampToValueAtTime(1, t + (P.attack ?? 0.25));
    this.base = dbGain(P.db) * (o.level ?? 1);
    this.mul = c.createGain(); this.mul.gain.value = this.base;
    this.out.connect(this.mul); this.mul.connect(chip.bus(o.bus || P.bus));
    this.layers = P.layers.map((L) => this._build(L, t));
    this.x = -1;
    this.drive(o.x ?? 0, 0, t);
    chip.loops.add(this);
    chip.stats.loops++;
  }
  _build(L, t) {
    const c = this.chip.ctx, sr = c.sampleRate, out = { L, srcs: [] };
    let src;
    if (L.wave === 'noise' || L.wave === 'metal') {
      const hi = Array.isArray(L.f) ? Math.max(...L.f) : (L.f ?? 4000);
      out.hold = this.chip._holdFor(hi);
      const buf = this.chip.noise(L.wave === 'metal', out.hold);
      src = c.createBufferSource(); src.buffer = buf; src.loop = true; out.param = src.playbackRate; out.scale = out.hold / sr;
      src.start(t, this.chip.rand() * buf.duration);
    } else {
      src = c.createOscillator(); src.setPeriodicWave(this.chip.wave(L.wave || 'pulse', L.duty ?? 0.5));
      out.param = src.frequency; out.scale = 1;
      src.start(t);
    }
    out.src = src; out.srcs.push(src);
    src.detune.setValueAtTime(L.detune || 0, t);
    let node = src;
    if (L.lp) { const bq = c.createBiquadFilter(); bq.type = 'lowpass'; bq.Q.value = L.q ?? 0.7; bq.frequency.value = rangeExp(L.lp, 0); node.connect(bq); node = bq; out.lp = bq; }
    const g = c.createGain(); g.gain.value = 0; node.connect(g); node = g; out.g = g;
    if (L.trem) {
      const tg = c.createGain(); tg.gain.value = 1 - L.trem.depth / 2;
      const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = L.trem.rate;
      const lg = c.createGain(); lg.gain.value = L.trem.depth / 2; lfo.connect(lg); lg.connect(tg.gain); lfo.start(t); out.srcs.push(lfo);
      node.connect(tg); node = tg;
    }
    if (L.vib) {
      const lfo = c.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = L.vib.rate;
      const lg = c.createGain(); lg.gain.value = L.vib.depth; lfo.connect(lg); lg.connect(src.detune); lfo.start(t); out.srcs.push(lfo);
      out.vib = lg;
    }
    node.connect(this.out);
    return out;
  }
  /** Move every layer along its range: x 0..1 (each layer maps it over its own span). */
  drive(x, glide = this.P.glide ?? 0.06, when = this.chip.now()) {
    if (this.stopped) return;
    x = clamp01(x);
    // live, a burst of calls at one moment (a test stepping many frames at once) would pile automation events on one
    // instant: keep the first, skip the rest until the clock moves (the next frame's call brings it up to date)
    if (!this.chip.offline && this._when !== undefined && Math.abs(when - this._when) < 0.004) return;
    if (this.x >= 0 && Math.abs(x - this.x) < 1e-4) return;           // (no change: the last glide is still on its way)
    this._when = when;
    const tau = Math.max(0.001, glide / 3), first = this.x < 0;
    let lv = 0;
    for (const Y of this.layers) {
      const L = Y.L, sp = L.span || [0, 1];
      const u = Math.pow(clamp01((x - sp[0]) / (sp[1] - sp[0] || 1)), L.pow ?? 1);
      const set = (p, v) => { if (first) p.setValueAtTime(v, when); else p.setTargetAtTime(v, when, tau); };
      const level = range(L.level ?? 0.1, u);
      set(Y.g.gain, level); lv += level;
      set(Y.param, rangeExp(L.f ?? (Y.scale === 1 ? 220 : 4000), u) * Y.scale);
      if (Y.lp) set(Y.lp.frequency, rangeExp(L.lp, u));
    }
    this.x = x; this.levelNow = lv;
  }
  /** Bend every layer (cents), on top of its own detune. */
  bend(cents, glide = this.P.glide ?? 0.06, when = this.chip.now()) {
    if (this.stopped || this._bend === cents) return;
    this._bend = cents;
    for (const Y of this.layers) Y.src.detune.setTargetAtTime((Y.L.detune || 0) + cents, when, Math.max(0.001, glide / 3));
  }
  /** A level multiplier over the whole loop (a duck, a swell). */
  gain(m, glide = 0.1, when = this.chip.now()) {
    if (this.stopped || this._mul === m) return;
    this.mul.gain.setTargetAtTime(m * this.base, when, Math.max(0.001, glide / 3)); this._mul = m;
  }
  get sounding() { return !this.stopped && this.levelNow * (this._mul ?? 1) > 1e-3; }
  stop(release = this.P.release ?? 0.5, when = this.chip.now()) {
    if (this.stopped) return;
    this.stopped = true;
    const G = this.out.gain;
    if (G.cancelAndHoldAtTime) G.cancelAndHoldAtTime(when); else { G.cancelScheduledValues(when); G.setValueAtTime(G.value, when); }
    G.linearRampToValueAtTime(0, when + release);
    for (const Y of this.layers) for (const s of Y.srcs) { try { s.stop(when + release + 0.05); } catch (e) { /* gone */ } }
    this.chip.loops.delete(this);
  }
}
