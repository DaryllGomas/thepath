// THE CABINET'S SOUND · THE TUNNEL (level 7, the finale, the Nexus; Tempest). Key: D, home again.
// Round the rim each lane has its own note (a pentatonic ladder up one side and down the other): you hear where you are.
// Each echo breaks with a tiny motif of its own game, and each wave's banner is its game's start call in its own key (the
// machine remembering). The heart wakes as a low pad that grows with the gold light.
// THE LET-GO: everything the game has been doing drops to near silence; a soft held tone rises only while the ring fills
// (only while you are still), and fades if you touch the controls. THE FALL (9 s): a slow rise, two octaves, as you fall
// into the heart, with notes climbing ever closer. THE PASSAGE: one quiet chord, a suspended fourth that resolves.
import { hz, JI, penta } from '../music.js';
import { cabinetVoice, ROOTS, ROOT_SEMIS } from './cabinet.js';
import { TUNE } from '../../games/tunnel/spec.js';

const R = ROOTS.tunnel, D2 = hz('D2'), D3 = hz('D3'), D4 = hz('D4'), D5 = hz('D5'), A2 = hz('A2');
const ECHO_GAME = { ember: 'hearth', star: 'constellation', shard: 'beacon', hunter: 'labyrinth', kite: 'resonance', half: 'resonance', crystal: 'ascent' };
const laneDeg = (lane) => (lane <= 9 ? lane : 18 - lane);          // 18 lanes: up the ladder one way round, down the other

export const TUNNEL_SOUND = {
  id: 'tunnel', title: 'THE TUNNEL', root: R,
  mix: 3,                                          // dB: this game's trim, so the seven sit at about the same loudness (tools/sound_bots.mjs)
  personality: 'the finale: a note for every lane, each echo dying with its own game\'s motif, a heart that wakes as a pad, then stillness, the fall, one quiet chord',
  sounds: {
    ...cabinetVoice(R),
    rim: {
      db: 7,
      label: 'Round the rim (a lane)', group: 'play', desc: 'each lane has its own note: a soft stepped click as you move (up the ladder one side, down the other)',
      layers: [{ wave: 'tri', f: D4, env: { a: 0.001, d: 0.032, v: 0.05 } }, { wave: 'noise', f: 11000, lp: 2600, env: { a: 0.001, d: 0.006, v: 0.018 } }],
      max: 2, gap: 0.03, vary: { pitch: 8, time: 0.004 },
    },
    fire: {
      db: 6,
      label: 'Fire down the lane', group: 'play', desc: 'FIRE: a short zap going down into the tunnel',
      layers: [{ wave: 'pulse', duty: 0.25, f: D5, sweep: { to: 0.5, t: 0.07, q: 1 / 120 }, env: { a: 0.001, d: 0.08, v: 0.045 }, lp: 2800 }],
      max: 3, gap: 0.04, vary: { pitch: 40, level: 0.12, time: 0.006 },
    },
    echoEmber: {
      db: 6,
      label: 'Echo broken: an ember (Hearth)', group: 'play', desc: 'a crackle and the blaze arpeggio, tiny',
      layers: [{ wave: 'noise', f: 7000, lp: 2400, env: { a: 0.001, d: 0.03, v: 0.06 } },
        { wave: 'pulse', duty: 0.25, f: D5, arp: { n: [0, 4, 7], step: 0.035 }, env: { a: 0.002, d: 0.12, v: 0.05 }, lp: 3000 }],
      max: 2, gap: 0.04,
    },
    echoStar: {
      db: 6,
      label: 'Echo broken: a falling star (Constellation)', group: 'play', desc: 'a whistle down and a small chime',
      layers: [{ wave: 'tri', f: hz('A5'), sweep: { to: 0.6, t: 0.12, q: 1 / 60 }, env: { a: 0.002, d: 0.14, v: 0.055 } },
        { wave: 'pulse', duty: 0.125, f: hz('E6'), at: 0.1, env: { a: 0.002, d: 0.1, v: 0.025 }, lp: 3400 }],
      max: 2, gap: 0.04,
    },
    echoShard: {
      db: 6,
      label: 'Echo broken: a ring shard (Beacon)', group: 'play', desc: 'a zap and the Beacon\'s two-note drop',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('E6'), sweep: { to: 0.4, t: 0.07, q: 1 / 120 }, env: { a: 0.001, d: 0.08, v: 0.045 }, lp: 3200 },
        { wave: 'tri', f: hz('B4'), seq: [[0, 0], [0.05, -5]], at: 0.05, env: { a: 0.002, d: 0.14, v: 0.06 } }],
      max: 2, gap: 0.04,
    },
    echoHunter: {
      db: 6,
      label: 'Echo broken: a hunter (Labyrinth)', group: 'play', desc: 'two soft gathering ticks',
      layers: [{ wave: 'tri', f: hz('G5'), seq: [[0, 0], [0.045, 4], [0.09, 7]], env: { a: 0.001, d: 0.13, v: 0.06 } }],
      max: 2, gap: 0.04,
    },
    echoKite: {
      db: 6,
      label: 'Echo broken: a kite (Resonance)', group: 'play', desc: 'a clear chime (a split half rings a fifth higher)',
      layers: [{ wave: 'tri', f: hz('B4'), env: { a: 0.002, d: 0.4, v: 0.07 } }, { wave: 'pulse', duty: 0.125, f: hz('B5'), env: { a: 0.002, d: 0.18, v: 0.02 }, lp: 3000 }],
      max: 2, gap: 0.04,
    },
    kiteSplit: {
      db: 5,
      label: 'A kite splits (Resonance)', group: 'play', desc: 'shot, a kite splits in two: a small detuned buzz, the halves slide apart',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('B2'), env: { a: 0.003, d: 0.16, v: 0.05 }, lp: 1400 },
        { wave: 'pulse', duty: 0.125, f: hz('B2'), detune: 45, env: { a: 0.003, d: 0.16, v: 0.045 }, lp: 1400 }],
      max: 2, gap: 0.05,
    },
    echoCrystal: {
      db: 6,
      label: 'Echo broken: a crystal (Ascent)', group: 'play', desc: 'a glassy cascade',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('C#5'), seq: [[0, 12], [0.025, 7], [0.05, 4], [0.075, 0]], env: { a: 0.002, d: 0.14, v: 0.045 }, lp: 3600 },
        { wave: 'tri', f: hz('F#4'), env: { a: 0.002, d: 0.08, v: 0.05 } }],
      max: 2, gap: 0.04,
    },
    crack: {
      db: 5,
      label: 'A shard cracks (first hit)', group: 'play', desc: 'the Beacon\'s shard takes two hits: the first is a metallic tick',
      layers: [{ wave: 'metal', f: 17000, env: { a: 0.001, d: 0.05, v: 0.05 }, lp: 2800 }],
      max: 2, gap: 0.04,
    },
    hop: {
      label: 'A hunter hops a lane', group: 'play', desc: 'a very faint low tick',
      layers: [{ wave: 'tri', f: D3, env: { a: 0.001, d: 0.03, v: 0.025 } }],
      max: 1, gap: 0.12,
    },
    rimArrive: {
      label: 'An echo reaches the rim', group: 'play', desc: 'a low warning buzz: it will crawl toward you (shoot it)',
      layers: [{ wave: 'pulse', duty: 0.5, f: D3, seq: [[0, 0], [0.06, 1]], env: { a: 0.003, d: 0.14, v: 0.05 }, lp: 900 }],
      max: 1, gap: 0.12,
    },
    crawl: {
      label: 'An echo crawls the rim', group: 'play', desc: 'a step along the rim toward you: a dull low tick',
      layers: [{ wave: 'tri', f: A2, env: { a: 0.001, d: 0.035, v: 0.04 } }],
      max: 1, gap: 0.08,
    },
    flip: {
      label: 'A crystal flips the rim', group: 'play', desc: 'the Ascent\'s crystal flips lane to lane: a faint glassy tick',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('C#6'), env: { a: 0.001, d: 0.035, v: 0.025 }, lp: 3000 }],
      max: 1, gap: 0.08,
    },
    sink: {
      label: 'The echoes sink back', group: 'play', desc: 'a ship lost: the wave\'s echoes sink back down the tunnel',
      layers: [{ wave: 'tri', f: D4, sweep: { to: 0.25, t: 0.6 }, env: { a: 0.02, d: 0.6, v: 0.05 } }],
      max: 1, gap: 0.5,
    },
    waveCall: {
      label: 'A wave begins (its game\'s call)', group: 'play', desc: 'each wave\'s banner: the start call of the game it echoes, in that game\'s key',
      layers: [{ wave: 'pulse', duty: 0.25, f: D4, arp: { n: [0, 7, 12], step: 0.08 }, env: { a: 0.004, d: 0.05, s: 0.6, h: 0.2, r: 0.2, v: 0.07 }, lp: 2800 },
        { wave: 'tri', f: D3, env: { a: 0.004, d: 0.25, v: 0.12 } }],
      max: 1, gap: 0.5,
    },
    waveClear: {
      label: 'Wave cleared', group: 'play', desc: 'a soft sparkle',
      layers: [{ wave: 'pulse', duty: 0.125, f: D5, arp: { n: [0, 4, 7], step: 0.05 }, env: { a: 0.003, d: 0.12, s: 0.3, h: 0.06, r: 0.12, v: 0.035 }, lp: 3000 }],
      max: 1, gap: 0.5,
    },
    arrive: {
      db: 4,
      label: 'Gold light reaches the heart', group: 'play', desc: 'a mote flows into the heart: a soft low note, higher as the heart wakes',
      layers: [{ wave: 'tri', f: D3, env: { a: 0.01, d: 0.45, v: 0.04 } }],
      max: 2, gap: 0.08,
    },
    heart: {
      db: -1,
      loop: true, label: 'The heart wakes (pad)', group: 'loop', drive: 'how awake the heart is (0 .. 1)',
      desc: 'a low pad at the centre that grows with each gold light: first a root, then its fifth, its octave, its third',
      attack: 1.0, release: 1.5, glide: 0.8,
      layers: [
        { wave: 'tri', f: D2, level: [0.0, 0.09], trem: { rate: 0.25, depth: 0.25 } },
        { wave: 'pulse', duty: 0.5, f: A2, lp: [300, 900], level: [0, 0.03], span: [0.2, 1] },
        { wave: 'pulse', duty: 0.25, f: D3, lp: [400, 1200], level: [0, 0.018], span: [0.5, 1] },
        { wave: 'tri', f: D3 * JI.third, level: [0, 0.03], span: [0.75, 1], vib: { rate: 4, depth: 5 } },
      ],
    },
    letgoTone: {
      db: -1.5,
      loop: true, bus: 'calm', label: 'LET GO: the held tone', group: 'loop', drive: 'the ring (0 .. 1: full = the fall)',
      desc: 'everything else drops away; this soft tone rises only while you are still (the ring fills) and fades if you touch anything',
      attack: 0.8, release: 2.5, glide: 0.35,
      layers: [
        { wave: 'tri', f: D4, level: [0, 0.075], vib: { rate: 4.5, depth: 4 } },
        { wave: 'tri', f: D4 * JI.fifth, level: [0, 0.04], span: [0.35, 1] },
        { wave: 'pulse', duty: 0.5, f: D5, lp: 1300, level: [0, 0.014], span: [0.7, 1] },
      ],
    },
    hint: {
      label: 'LET GO: the hint', group: 'play', bus: 'calm', desc: 'a busy hand has kept the ring empty: one soft note as the hint line comes up',
      layers: [{ wave: 'tri', f: hz('A4'), env: { a: 0.08, d: 1.4, v: 0.045 } }],
      max: 1, gap: 2,
    },
    dissolve: {
      label: 'LET GO: a shot dissolves', group: 'play', bus: 'calm', desc: 'a shot fired in the let-go turns to light before it lands: the faintest sparkle',
      layers: [{ wave: 'tri', f: hz('D6'), sweep: { to: 1.5, t: 0.2 }, env: { a: 0.01, d: 0.25, v: 0.018 } }],
      max: 1, gap: 0.12,
    },
    fall: {
      db: -2.5,
      loop: true, bus: 'calm', label: 'THE FALL: the rise', group: 'loop', drive: 'the fall (0 leaving the rim .. 1 the heart)',
      desc: 'you fall into the heart (9 s): a slow rise of two octaves, wind growing, a high voice joining near the end',
      attack: 2.5, release: 2.5, glide: 0.4,
      layers: [
        { wave: 'tri', f: [D2, D4], level: [0.025, 0.09] },
        { wave: 'pulse', duty: 0.5, f: [A2, hz('A4')], lp: [450, 1800], level: [0.004, 0.03] },
        { wave: 'noise', f: [300, 2200], lp: [380, 1400], level: [0.0, 0.03] },
        { wave: 'pulse', duty: 0.125, f: [D5, hz('D6')], lp: 2400, level: [0, 0.016], span: [0.5, 1], vib: { rate: 5, depth: 6 } },
      ],
    },
    fallNote: {
      label: 'THE FALL: a note', group: 'play', bus: 'calm', desc: 'notes climbing the pentatonic, closer and closer together as the heart nears (never 3 a second)',
      layers: [{ wave: 'tri', f: D4, env: { a: 0.01, d: 0.7, v: 0.045 } }, { wave: 'pulse', duty: 0.125, f: D5, env: { a: 0.01, d: 0.3, v: 0.01 }, lp: 2600 }],
      max: 3, gap: 0.3,
    },
    passage: {
      db: -3.5,
      label: 'THE PASSAGE', group: 'end', bus: 'calm', desc: 'the win, and the emotional peak: one quiet chord; a suspended fourth resolves to the third',
      layers: [
        { wave: 'tri', f: D3, env: { a: 1.0, d: 0.5, s: 0.85, h: 2.6, r: 3.5, v: 0.12 } },
        { wave: 'tri', f: D3 * JI.fifth, env: { a: 1.1, d: 0.5, s: 0.85, h: 2.5, r: 3.5, v: 0.065 } },
        { wave: 'pulse', duty: 0.5, f: D4, lp: 1400, env: { a: 1.2, d: 0.5, s: 0.85, h: 2.4, r: 3.2, v: 0.025 } },
        { wave: 'tri', f: D4 * JI.fourth, env: { a: 0.9, d: 0.2, s: 1, h: 0.5, r: 0.5, v: 0.05 } },
        { wave: 'tri', f: D4 * JI.third, at: 1.35, env: { a: 0.5, d: 0.3, s: 0.9, h: 2.2, r: 3.4, v: 0.055 }, vib: { rate: 4.5, depth: 5, at: 0.8, fade: 0.8 } },
        { wave: 'pulse', duty: 0.125, f: D5 * JI.fifth, at: 2.2, lp: 2200, env: { a: 0.6, d: 0.4, s: 0.8, h: 1.4, r: 3.0, v: 0.01 } },
      ], max: 1, gap: 3,
    },
  },
  cues: {
    Coin: (s) => s.play('coin'),
    Start: null, Tick: null, Hit: null, Bonus: null, Miss: null, Win: null, Die: null,
  },
  events: {
    go: (s) => { if (!s.st.went) { s.st.went = true; s.play('start'); } },
    lane: (s, e) => s.play('rim', { pitch: penta(laneDeg(e.lane)) }),
    fire: (s, e) => { if (!e.dissolve) s.play('fire'); },
    dissolve: (s) => s.play('dissolve'),
    kill: (s, e) => {
      const k = e.echo;
      s.play(k === 'ember' ? 'echoEmber' : k === 'star' ? 'echoStar' : k === 'shard' ? 'echoShard' : k === 'hunter' ? 'echoHunter'
        : k === 'crystal' ? 'echoCrystal' : 'echoKite', { pitch: k === 'half' ? 7 : 0 });
    },
    crack: (s) => s.play('crack'),
    split: (s) => s.play('kiteSplit'),
    hop: (s) => s.play('hop'),
    rim: (s) => s.play('rimArrive'),
    crawl: (s) => s.play('crawl'),
    flip: (s) => s.play('flip'),
    lifeLost: (s) => s.play('lifeLost'),
    ward: (s) => s.play('ward'),
    sink: (s) => s.play('sink'),
    wave: (s, e) => { if (e.wave > 0) s.play('waveCall', { delay: 0.1, pitch: ROOT_SEMIS[ECHO_GAME[e.echo]] ?? 0 }); },
    waveClear: (s) => s.play('waveClear'),
    arrive: (s, e) => s.play('arrive', { pitch: penta(Math.floor(9 * Math.min(1, e.light / e.need))) }),
    letgo: (s) => { s.duck(0.16, 1.6); s.st.letgo = true; },
    hint: (s) => s.play('hint'),
    fall: (s) => { s.st.fallN = 0; s.st.fallAt = s.t; },
    clear: (s) => { s.stop('fall', 3.0); s.stop('letgoTone', 2.0); s.play('passage', { delay: 0.2 }); },
    out: (s) => s.play('die'),
    again: null, gone: null, spawn: null,
  },
  silent: {
    again: 'after a lost ship, the short READY',
    gone: 'a shot that reached the heart without meeting anything',
    spawn: 'an echo appears deep in the tunnel (many a wave): the wave\'s call and the heart pad carry the scene',
  },
  frame(s, game) {
    const sim = game.sim, ph = sim.phase;
    s.drive('heart', sim.wake);
    if (ph === 'letgo') s.drive('letgoTone', sim.ring);
    if (ph === 'fall') {
      const u = Math.min(1, sim.fallT / TUNE.fall.dur);
      s.drive('fall', u);
      s.level('letgoTone', 0, 4);
      const gap = 1.0 - 0.62 * u;                 // 1 s apart -> 0.38 s (under 3 a second)
      if (u < 0.97 && s.t - (s.st.fallAt ?? -9) >= gap) { s.st.fallAt = s.t; s.st.fallN = (s.st.fallN ?? 0) + 1; s.play('fallNote', { pitch: penta(Math.min(11, s.st.fallN)) - 5 }); }
    }
  },
};
