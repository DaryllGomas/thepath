// THE CABINET'S SOUND · STARVECTOR'S MUSIC: a small step sequencer (1982 style: a pulse lead, a pulse arpeggio, a triangle bass, a noise
// hat / snare, a tri-sweep kick). It does NOT go through chip.play (that has the 12 voice cap shared with the sound effects): it
// schedules raw oscillators / noise buffers into its own gain node on chip's 'calm' bus, a little ahead of the clock (look-ahead
// 0.35 s, driven by the palette's frame()), so it works live and in an OfflineAudioContext alike (it only uses s.now()).
//   frame(s, game): picks the tune from the sim (act tune after the title card, the boss theme from the boss's intro to its death,
//                   silence for the symbol interlude / the death / the freeze, the act tune LOW during the gate run), schedules notes.
//   duckMusic(s): lowers the music under a big effect (chip.duck('calm')) and brings it back about 0.55 s later (restored in frame()).
//   stopMusic(s): fades the tune out (the stop is 40 ms, no click).
import { hz } from '../music.js';

// ---- the tunes. prog = [chord root (semitones above the tonic), 'm' | 'M' | 'p' (phrygian-ish minor: 0 3 7 12 with a b2 colour)] per bar;
// bass / kick / snare / hat = 16-step strings per bar (x root, o octave, f fifth; hats x loud, h soft); lead phrases = 16 eighth-note tokens
// per 2 bars (a number = semitones above the tonic at lead octave, '.' rest, '-' hold), played in order `form` (indexes into phrases).
// The loop is 16 bars: the 8-bar progression twice, the 8 lead phrases of `form` across it.
const TUNES = {
  act1: {   // THE FIELD: cold, driving, E minor, 140 bpm
    bpm: 140, tonic: hz('E2'), leadOct: 2, bars: 8,
    prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-4, 'M'], [-2, 'M'], [-2, 'M'], [-5, 'm'], [-5, 'm']],
    bass: ['x.xxx.x.x.xxx.o.', 'x.xxx.x.x.xxx.o.', 'x.xxx.x.x.xxx.o.', 'x.xxx.x.x.xxx.o.', 'x.xxx.x.x.xxx.o.', 'x.xxx.x.x.xxx.o.', 'x.xxx.x.x.xxx.f.', 'x.xxx.x.x.xxx.f.'],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'h.x.h.x.h.x.h.xh',
    phrases: ['12 . 15 . 19 . 15 12  10 . 12 . 15 - 12 .', '17 . 15 . 12 . 10 12  7 . 10 . 12 - . .', '12 . 15 17 19 - 17 15  14 . 15 . 17 - 15 12', '19 . 17 . 15 . 12 . 10 12 14 15 12 - . .'],
    form: [0, 1, 0, 2, 0, 1, 2, 3], arp: [0, 1, 2, 3, 2, 1], leadDuty: 0.25, arpDuty: 0.125, leadVol: 0.04, arpVol: 0.018,
  },
  act2: {   // THE VEIN: hot, A phrygian, 150 bpm
    bpm: 150, tonic: hz('A2'), leadOct: 2, bars: 8,
    prog: [[0, 'p'], [0, 'p'], [1, 'M'], [1, 'M'], [0, 'p'], [0, 'p'], [-2, 'M'], [-4, 'M']],
    bass: ['xxoxxxoxxxoxxxox', 'xxoxxxoxxxoxxxox', 'xxoxxxoxxxoxxxox', 'xxoxxxoxxxoxxxox', 'xxoxxxoxxxoxxxox', 'xxoxxxoxxxoxxxox', 'xxoxxxoxxxoxxxfx', 'xxoxxxoxxxoxxxfx'],
    kick: 'x..xx..xx..xx.x.', snare: '....x.......x..x', hat: 'xhxhxhxhxhxhxhxh',
    phrases: ['12 . 13 . 12 . 8 . 7 . 8 12 10 - . .', '15 . 13 15 17 - 15 13  12 . 13 . 10 - . .', '20 . 19 . 17 . 15 13  12 - 13 12 8 . 7 .', '17 15 13 12 13 15 17 20  19 - 17 15 13 - . .'],
    form: [0, 1, 0, 2, 0, 1, 2, 3], arp: [0, 2, 1, 3, 2, 3], leadDuty: 0.125, arpDuty: 0.25, leadVol: 0.04, arpVol: 0.018,
  },
  act3: {   // THE STONES: mystic, D dorian, 132 bpm
    bpm: 132, tonic: hz('D2'), leadOct: 2, bars: 8,
    prog: [[0, 'm'], [0, 'm'], [5, 'M'], [5, 'M'], [3, 'M'], [3, 'M'], [-2, 'M'], [0, 'm']],
    bass: ['x.....x.x.....f.', 'x.....x.x.....f.', 'x.....x.x.....f.', 'x.....x.x.....f.', 'x.....x.x.....f.', 'x.....x.x.....f.', 'x.....x.x.....o.', 'x.....x.x.x.x.x.'],
    kick: 'x.....x.x.......', snare: '........x.......', hat: 'h.h.h.h.h.h.h.hh',
    phrases: ['14 . . 17 . 19 - -  21 . 19 . 17 - 14 .', '12 . 14 . 17 . 19 21  22 - 21 - 19 - . .', '19 . 21 . 24 - 22 21  19 . 17 . 14 - . .', '24 . 22 . 21 . 19 17  14 - 17 - 12 - . .'],
    form: [0, 1, 0, 2, 0, 1, 2, 3], arp: [0, 1, 2, 1, 3, 2], leadDuty: 0.25, arpDuty: 0.125, leadVol: 0.038, arpVol: 0.016,
  },
  boss: {   // THE BOSS: urgent, C minor, 164 bpm, a bigger bass line
    bpm: 164, tonic: hz('C2'), leadOct: 3, bars: 8,
    prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [0, 'm'], [1, 'M'], [-2, 'M'], [-1, 'M']],
    bass: ['xxoxxxoxxoxxoxxo', 'xxoxxxoxxoxxoxxo', 'xxoxxxoxxoxxoxxo', 'xxoxxxoxxoxxoxxo', 'xxoxxxoxxoxxoxxo', 'xxoxxxoxxoxxoxxo', 'xxoxxxoxxoxxoxxo', 'xxxxxxxxxxxxxxxx'],
    kick: 'x..xx.x.x..xx.x.', snare: '....x..x....x.x.', hat: 'xxxxxxxxxxxxxxxx',
    phrases: ['15 . 15 . 14 . 12 . 15 - 17 . 15 14 12 .', '20 . 19 . 17 . 15 17  19 - 17 15 14 12 14 15', '12 14 15 17 19 20 22 20  19 17 15 - 14 - . .', '24 . 22 20 19 . 17 15  14 15 17 19 20 - 24 -'],
    form: [0, 1, 0, 2, 0, 1, 2, 3], arp: [0, 1, 2, 3, 1, 2], leadDuty: 0.125, arpDuty: 0.25, leadVol: 0.044, arpVol: 0.02,
  },
};
const MUSIC_GAIN = 1.35;   // the whole tune's level (measured: music alone peaks ~ -12 dBFS, the full mix -6.8: the effects stay on top)
const CHORD = { m: [0, 3, 7, 12], M: [0, 4, 7, 12], p: [0, 3, 7, 12] };
const f2 = (tonic, semis) => tonic * Math.pow(2, semis / 12);

function parsePhrase(str) {
  const toks = str.trim().split(/\s+/), out = []; let cur = null;
  toks.forEach((t, i) => {
    if (t === '.') { cur = null; } else if (t === '-') { if (cur) cur.len++; } else { cur = { step: i * 2, semis: +t, len: 1 }; out.push(cur); }
  });
  return out;
}
for (const k in TUNES) TUNES[k].parsed = TUNES[k].phrases.map(parsePhrase);

// ---------------------------------------------------------------- the engine
function ensure(s) {
  const M = s.st.mus || (s.st.mus = { tune: null, inst: null, level: 1, ducked: false, duckUntil: 0 });
  if (!M.out) { M.out = s.chip.ctx.createGain(); M.out.gain.value = MUSIC_GAIN; M.out.connect(s.chip.bus('calm')); s.chip.duck('calm', 1, 0.05, s.now()); }   // (a new credit: never start ducked)
  return M;
}
function osc(chip, wave, duty, f, t, dur, vol, dest, o = {}) {
  const c = chip.ctx, src = c.createOscillator(); src.setPeriodicWave(chip.wave(wave, duty));
  src.frequency.setValueAtTime(f, t); if (o.to) src.frequency.exponentialRampToValueAtTime(o.to, t + (o.t || dur));
  const g = c.createGain(), G = g.gain; G.setValueAtTime(0, t); G.linearRampToValueAtTime(vol, t + 0.004);
  G.linearRampToValueAtTime(vol * (o.sus ?? 0.7), t + Math.max(0.008, dur * 0.55)); G.linearRampToValueAtTime(0, t + dur);
  src.connect(g); g.connect(dest); src.start(t); src.stop(t + dur + 0.02);
  src.onended = () => { try { g.disconnect(); } catch (e) { /* gone */ } };
}
function noise(chip, rate, t, dur, vol, dest, lp) {
  const c = chip.ctx, hold = chip._holdFor(rate), src = c.createBufferSource(); src.buffer = chip.noise(false, hold); src.loop = true;
  src.playbackRate.value = rate * hold / c.sampleRate; const g = c.createGain(), G = g.gain;
  G.setValueAtTime(vol, t); G.exponentialRampToValueAtTime(0.0005, t + dur);
  let node = src; if (lp) { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = lp; src.connect(b); node = b; }
  node.connect(g); g.connect(dest); src.start(t, (t * 7.31) % 1); src.stop(t + dur + 0.02);
  src.onended = () => { try { g.disconnect(); } catch (e) { /* gone */ } };
}

function scheduleStep(chip, T, inst, step, t, dest) {
  const spb = 60 / T.bpm / 4, song = Math.floor(step / 16) % (T.bars * 2), bar = song % T.bars, st = step % 16, ch = T.prog[bar], chord = CHORD[ch[1]], tonic = T.tonic;
  // bass (triangle)
  const b = T.bass[bar][st];
  if (b !== '.') { const semi = ch[0] + (b === 'o' ? 12 : b === 'f' ? 7 : 0); osc(chip, 'tri', 0.5, f2(tonic, semi), t, spb * (b === 'x' && T.bpm > 160 ? 0.85 : 0.95), 0.075, dest, { sus: 0.85 }); }
  // arp (pulse 12.5 / 25, two octaves up)
  const ai = T.arp[st % T.arp.length], arpSemi = ch[0] + chord[ai % chord.length] + 24 + (ai >= 4 ? 12 : 0);
  osc(chip, 'pulse', T.arpDuty, f2(tonic, arpSemi), t, spb * 0.8, T.arpVol, dest, { sus: 0.4 });
  // lead
  const phrase = T.parsed[T.form[Math.floor(song / 2) % T.form.length]], local = (song % 2) * 16 + st;
  for (const n of phrase) if (n.step === local) osc(chip, 'pulse', T.leadDuty, f2(tonic * Math.pow(2, T.leadOct - 1), n.semis), t, spb * 2 * n.len * 0.92, T.leadVol, dest, { sus: 0.75 });
  // drums
  if (T.kick[st] === 'x') osc(chip, 'tri', 0.5, 150, t, 0.11, 0.12, dest, { to: 42, t: 0.09, sus: 0.3 });
  if (T.snare[st] === 'x') { noise(chip, 5200, t, 0.13, 0.038, dest, 4200); osc(chip, 'tri', 0.5, 210, t, 0.06, 0.03, dest, { to: 120, t: 0.05 }); }
  const h = T.hat[st]; if (h !== '.') noise(chip, 9500, t, h === 'x' ? 0.035 : 0.022, h === 'x' ? 0.014 : 0.009, dest, 7000);
}

export function stopMusic(s) {
  const M = s.st.mus; if (!M || !M.inst) return;
  const now = s.now(), g = M.inst.gain; g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.012);   // (the notes already scheduled run out silent)
  M.inst = null; M.tune = null;
}
function startMusic(s, key, level) {
  const M = ensure(s), now = s.now();
  stopMusic(s);
  const g = s.chip.ctx.createGain(); g.gain.value = level; g.connect(M.out);
  M.inst = { gain: g, step: 0, next: now + 0.06 }; M.tune = key; M.level = level;
}
/** lower the music under a big effect; frame() brings it back ~0.55 s later */
export function duckMusic(s, level = 0.35) {
  const M = ensure(s), now = s.now(); M.duckUntil = now + 0.55;
  if (!M.ducked) { M.ducked = true; s.chip.duck('calm', level, 0.1, now); }
}

/** which tune should be playing (null = silence) */
function want(s, sim) {
  const M = ensure(s), now = s.now();
  if (!sim || sim.frozen || sim.cardT > 0 || sim.stage === 'symbol' || sim.stage === 'diamond' || sim.stage === 'frozen') return null;
  if (M.holdUntil && now < M.holdUntil) return null;
  const b = sim.boss;
  if (b) { if (b.state === 'dying' || sim.warnT > 0) return null; return { key: 'boss', level: 1 }; }
  if (sim.bossDone) return { key: 'act' + sim.act, level: 0.45 };
  return { key: 'act' + sim.act, level: 1 };
}

export function musicFrame(s, game) {
  const sim = game.sim, M = ensure(s), now = s.now();
  if (M.ducked && now > M.duckUntil) { M.ducked = false; s.chip.duck('calm', 1, 0.4, now); }
  const w = want(s, sim);
  if (!w) { if (M.inst) stopMusic(s); return; }
  if (!M.inst || M.tune !== w.key) startMusic(s, w.key, w.level);
  else if (M.level !== w.level) { M.level = w.level; M.inst.gain.gain.setTargetAtTime(w.level, now, 0.3); }
  const I = M.inst, T = TUNES[w.key], spb = 60 / T.bpm / 4;
  if (I.next < now - 0.12) I.next = now + 0.03;                        // fell behind (a stall): skip ahead
  while (I.next < now + 0.35) { scheduleStep(s.chip, T, I, I.step, I.next, I.gain); I.step++; I.next += spb; }
}
export const holdMusic = (s, secs) => { ensure(s).holdUntil = s.now() + secs; };
