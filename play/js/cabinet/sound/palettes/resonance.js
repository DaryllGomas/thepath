// THE CABINET'S SOUND · THE RESONANCE (level 5, the Signal; Space Invaders + a wave). Key: B minor (the cabinet's relative).
// A soft tone FOLLOWS THE WAVE: its pitch rides the wave's height at your emitter (up on a crest, down in a trough), so you
// can hear the crest coming. A resonant hit is a clear chime that climbs with the chain; an off-phase hit is a detuned
// buzz. The win tunes itself: detuned voices glide together into one clean chord, and B minor opens to B major.
import { hz, JI, pentaMinor } from '../music.js';
import { cabinetVoice, ROOTS } from './cabinet.js';
import { TUNE } from '../../games/resonance/spec.js';

const R = ROOTS.resonance, B2 = hz('B2'), B3 = hz('B3'), B4 = hz('B4');
const K = (2 * Math.PI) / TUNE.wave.lambda;         // the wave: y = y0 - A sin(k x - phase); a crest where sin = 1

export const RESONANCE_SOUND = {
  id: 'resonance', title: 'THE RESONANCE', root: R,
  mix: 5,                                          // dB: this game's trim, so the seven sit at about the same loudness (tools/sound_bots.mjs)
  personality: 'the signal: a tone that rides the wave, clear chimes that climb with the chain, a detuned buzz off-phase, a chord that tunes itself',
  sounds: {
    ...cabinetVoice(R),
    waveTone: {
      db: -4,
      loop: true, label: 'The wave (follows the crest)', group: 'loop', drive: 'the wave\'s height at the emitter (0 trough .. 1 crest)',
      desc: 'its pitch rides the wave at your emitter: it rises as a crest comes over you (an octave, centred on B)',
      attack: 0.8, release: 0.8, glide: 0.09,
      layers: [
        { wave: 'tri', f: [hz('F3') * 1.0, hz('F4')], level: [0.03, 0.055] },
        { wave: 'pulse', duty: 0.125, f: [hz('F4'), hz('F5')], lp: 1400, level: [0, 0.012], span: [0.55, 1], vib: { rate: 5, depth: 6 } },
      ],
    },
    pulse: {
      db: 3.5,
      label: 'Pulse fired', group: 'play', desc: 'FIRE: a short clean blip up',
      layers: [{ wave: 'pulse', duty: 0.5, f: B4, sweep: { to: 1.5, t: 0.05, q: 1 / 60 }, env: { a: 0.002, d: 0.07, v: 0.055 }, lp: 2600 },
        { wave: 'tri', f: B3, env: { a: 0.002, d: 0.05, v: 0.05 } }],
      max: 2, gap: 0.08, vary: { pitch: 40, level: 0.1, time: 0.005 },
    },
    chime: {
      db: 2,
      label: 'Resonant hit (clear chime)', group: 'play', desc: 'a hit on the crest: a clear chime; each one in a chain rings a step higher',
      layers: [
        { wave: 'tri', f: B4, env: { a: 0.002, d: 0.9, v: 0.11 }, vib: { rate: 5, depth: 5, at: 0.1, fade: 0.3 } },
        { wave: 'pulse', duty: 0.125, f: B4 * 2, env: { a: 0.002, d: 0.35, v: 0.028 }, lp: 3200 },
      ], max: 3, gap: 0.05,
    },
    chainBonus: {
      label: 'Chain bonus (every 4th)', group: 'play', desc: 'every fourth clean hit in a row: a little sparkle on top of the chime',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('B4'), at: 0.08, arp: { n: [0, 3, 7, 12], step: 0.05 }, env: { a: 0.003, d: 0.12, s: 0.4, h: 0.08, r: 0.12, v: 0.04 }, lp: 3200 }],
      max: 1, gap: 0.3,
    },
    offphase: {
      label: 'Off-phase hit (detuned buzz)', group: 'play', desc: 'a hit off the crest: a low detuned buzz (it splits the shape, or cuts it loose)',
      layers: [
        { wave: 'pulse', duty: 0.125, f: B2, env: { a: 0.004, d: 0.3, v: 0.07 }, lp: 1500 },
        { wave: 'pulse', duty: 0.125, f: B2, detune: 48, env: { a: 0.004, d: 0.3, v: 0.06 }, lp: 1500 },
        { wave: 'noise', f: 2400, lp: 1100, env: { a: 0.003, d: 0.1, v: 0.04 } },
      ], max: 2, gap: 0.08,
    },
    split: {
      label: 'Split halves drift apart', group: 'play', desc: 'after an off-phase split: two short glides going apart',
      layers: [{ wave: 'tri', f: hz('E4'), sweep: { to: 0.8, t: 0.25 }, at: 0.05, env: { a: 0.004, d: 0.28, v: 0.035 } },
        { wave: 'tri', f: hz('E4'), sweep: { to: 1.25, t: 0.25 }, at: 0.05, env: { a: 0.004, d: 0.28, v: 0.035 } }],
      max: 1, gap: 0.1,
    },
    cut: {
      label: 'Cut loose', group: 'play', desc: 'a small shape\'s thread snaps (it falls faster): a tiny metallic tick',
      layers: [{ wave: 'metal', f: 9000, env: { a: 0.001, d: 0.04, v: 0.045 }, lp: 2400 }, { wave: 'tri', f: hz('D6'), env: { a: 0.001, d: 0.025, v: 0.025 } }],
      max: 1, gap: 0.08,
    },
    broken: {
      label: 'A slipped shape broken', group: 'play', desc: 'a hit on a shape already through the wave (no points): a dull crack',
      layers: [{ wave: 'noise', f: 2000, lp: 1200, env: { a: 0.002, d: 0.1, v: 0.07 } }, { wave: 'tri', f: hz('D3'), env: { a: 0.002, d: 0.08, v: 0.08 } }],
      max: 2, gap: 0.06,
    },
    passed: {
      label: 'Slipped through the wave', group: 'play', desc: 'a shape falls through the wave (the crest can\'t tune it now): a low sink',
      layers: [{ wave: 'tri', f: B3, sweep: { to: 0.5, t: 0.3 }, env: { a: 0.01, d: 0.35, v: 0.06 } }],
      max: 1, gap: 0.2,
    },
    landed: {
      label: 'A shape lands', group: 'play', desc: 'a shape reaches the ground: a low thud',
      layers: [{ wave: 'tri', f: hz('E2'), sweep: { to: 0.7, t: 0.25 }, env: { a: 0.004, d: 0.3, v: 0.2 } },
        { wave: 'noise', f: 800, lp: 500, env: { a: 0.004, d: 0.3, v: 0.1 } }],
      max: 1, gap: 0.2,
    },
    struck: {
      label: 'A shard strikes the emitter', group: 'play', desc: 'a falling shard hits you: a crunch',
      layers: [{ wave: 'noise', f: 4000, sweep: { to: 0.2, t: 0.25 }, lp: 1500, env: { a: 0.003, d: 0.25, v: 0.1 } },
        { wave: 'pulse', duty: 0.25, f: B3, sweep: { to: 0.5, t: 0.25 }, env: { a: 0.003, d: 0.25, v: 0.045 }, lp: 1500 }],
      max: 1, gap: 0.2,
    },
    shardFall: {
      label: 'A shard falls', group: 'play', desc: 'a hanging shape lets a small red shard fall (never aimed): a faint whistle down',
      layers: [{ wave: 'tri', f: hz('B5'), sweep: { to: 0.5, t: 0.5, q: 1 / 60 }, env: { a: 0.01, d: 0.5, v: 0.03 } },
        { wave: 'noise', f: 4000, lp: 1500, env: { a: 0.05, d: 0.3, v: 0.012 } }],
      max: 2, gap: 0.2,
    },
    tell: {
      label: 'A shard gathers (the tell)', group: 'play', desc: 'red light gathers under a shape before its shard drops: a quiet rising flutter',
      layers: [{ wave: 'pulse', duty: 0.125, f: B4, sweep: { to: 1.5, t: 0.9 }, lp: 1500, env: { a: 0.3, d: 0.1, s: 0.8, h: 0.4, r: 0.2, v: 0.025 }, trem: { rate: 8, depth: 0.5 } }],
      max: 1, gap: 0.3,
    },
    shardGround: {
      label: 'A shard hits the ground', group: 'play', desc: 'a missed shard lands: a tiny tick',
      layers: [{ wave: 'noise', f: 3000, lp: 1200, env: { a: 0.001, d: 0.03, v: 0.03 } }],
      max: 1, gap: 0.1,
    },
    spawn: {
      label: 'A shape unspools', group: 'play', desc: 'a new kite comes down its thread from the top: a faint falling glint',
      layers: [{ wave: 'tri', f: hz('F#6'), sweep: { to: 0.7, t: 0.3 }, env: { a: 0.02, d: 0.3, v: 0.014 } }],
      max: 1, gap: 0.3,
    },
    chainBreak: {
      label: 'Chain broken', group: 'play', desc: 'a chain of 3 or more ends: a little fall',
      layers: [{ wave: 'pulse', duty: 0.25, f: B4, seq: [[0, 0], [0.08, -2], [0.16, -5]], env: { a: 0.003, d: 0.1, s: 0.5, h: 0.12, r: 0.1, v: 0.04 }, lp: 2000 }],
      max: 1, gap: 0.3,
    },
    almost: {
      label: 'Almost clear', group: 'play', desc: 'three clean hits to go: a small lift',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('F#5'), arp: { n: [0, 5, 7], step: 0.07 }, env: { a: 0.003, d: 0.12, s: 0.4, h: 0.1, r: 0.15, v: 0.04 }, lp: 3000 }],
      max: 1, gap: 1,
    },
    win: {
      db: -1.5,
      label: 'THE SIGNAL IS CLEAR', group: 'end', desc: 'the win: detuned voices glide into tune, and B minor opens to a settled B major',
      layers: [
        { wave: 'pulse', duty: 0.5, f: B3 * 1.03, sweep: { to: 1 / 1.03, t: 1.4 }, lp: 1600, env: { a: 0.08, d: 0.3, s: 0.8, h: 1.6, r: 1.6, v: 0.04 } },
        { wave: 'pulse', duty: 0.5, f: B3 / 1.03, sweep: { to: 1.03, t: 1.4 }, lp: 1600, env: { a: 0.08, d: 0.3, s: 0.8, h: 1.6, r: 1.6, v: 0.04 } },
        { wave: 'tri', f: B3 * JI.fifth * 1.02, sweep: { to: 1 / 1.02, t: 1.2 }, env: { a: 0.1, d: 0.3, s: 0.8, h: 1.6, r: 1.6, v: 0.07 } },
        { wave: 'tri', f: B2, at: 1.2, env: { a: 0.2, d: 0.4, s: 0.8, h: 1.2, r: 1.8, v: 0.2 } },
        { wave: 'tri', f: B3 * JI.third, at: 1.3, env: { a: 0.3, d: 0.3, s: 0.8, h: 1.0, r: 1.8, v: 0.06 }, vib: { rate: 5, depth: 5, at: 0.5, fade: 0.5 } },
      ], max: 1, gap: 2,
    },
  },
  cues: {
    Coin: (s) => s.play('coin'),
    Start: null, Tick: null, Hit: null, Bonus: null, Miss: null, Win: null, Die: null,
  },
  events: {
    go: (s) => { if (!s.st.went) { s.st.went = true; s.play('start'); } },
    fire: (s) => s.play('pulse'),
    shatter: (s, e) => {                             // up the chain to the 8th, then it rings there
      s.play('chime', { pitch: pentaMinor(Math.min(7, Math.max(0, e.chain - 1))) });
      if (e.chain % TUNE.score.bonusEvery === 0) s.play('chainBonus');
    },
    offphase: (s) => s.play('offphase'),
    split: (s) => s.play('split'),
    cut: (s) => s.play('cut'),
    broken: (s) => s.play('broken'),
    passed: (s) => s.play('passed'),
    landed: (s) => s.play('landed'),
    struck: (s) => s.play('struck'),
    shard: (s) => s.play('shardFall'),
    tell: (s) => s.play('tell'),
    shardGround: (s) => s.play('shardGround'),
    spawn: (s) => s.play('spawn'),
    chainBreak: (s, e) => { if (e.chain >= 3) s.play('chainBreak'); },
    almost: (s) => s.play('almost'),
    lifeLost: (s) => s.play('lifeLost', { delay: 0.15 }),
    ward: (s) => s.play('ward'),
    clear: (s) => s.play('win'),
    out: (s) => s.play('die'),
    again: null, gone: null,
  },
  silent: {
    again: 'after a lost life, the short READY',
    gone: 'a pulse that flew off the top without touching anything',
  },
  frame(s, game) {
    const sim = game.sim;
    const h = Math.sin(K * sim.emitter.x - sim.wave.phase);
    s.drive('waveTone', (h + 1) / 2);
    s.level('waveTone', sim.phase === 'play' ? 1 : sim.phase === 'card' ? 0 : 0.5, 0.5);
  },
};
