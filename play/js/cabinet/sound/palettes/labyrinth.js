// THE CABINET'S SOUND · THE LABYRINTH (level 4, the Vale; Pac-Man-like). Key: G, light and gold.
// Gathering the light is a soft triangle walking the pentatonic, never the same two notes back and forth (no chomp).
// A power diamond is a bright climb; while the hunters are pale a slow wobble plays, quickening as they warm back to red.
// Before a section of the maze turns there is a shimmer (under 3 a second), then the stone slides.
import { hz, JI, penta } from '../music.js';
import { cabinetVoice, ROOTS } from './cabinet.js';
import { TUNE } from '../../games/labyrinth/spec.js';

const R = ROOTS.labyrinth, G2 = hz('G2'), G3 = hz('G3'), G4 = hz('G4');
const RB = TUNE.rebuild, POWER = TUNE.power.dur;

export const LABYRINTH_SOUND = {
  id: 'labyrinth', title: 'THE LABYRINTH', root: R,
  mix: 5.5,                                          // dB: this game's trim, so the seven sit at about the same loudness (tools/sound_bots.mjs)
  personality: 'gathering light: soft pentatonic ticks that wander, a bright diamond, a slow wobble while the hunters flee, stone that slides',
  sounds: {
    ...cabinetVoice(R),
    pellet: {
      db: 6.5,
      label: 'Gather a light', group: 'play', desc: 'each gold node: a soft triangle tick that wanders up and down the pentatonic',
      layers: [{ wave: 'tri', f: hz('G5'), env: { a: 0.001, d: 0.045, v: 0.06 } }],
      max: 2, gap: 0.04, vary: { pitch: 12, level: 0.15, time: 0.006 },
    },
    power: {
      label: 'Power diamond', group: 'play', desc: 'a gold diamond: a bright climb and a swell (the hunters turn pale)',
      layers: [
        { wave: 'pulse', duty: 0.25, f: G4, arp: { n: [0, 4, 7, 12, 16, 19, 24], step: 0.04 }, env: { a: 0.003, d: 0.05, s: 0.5, h: 0.2, r: 0.18, v: 0.07 }, lp: 3000 },
        { wave: 'noise', f: 2500, sweep: { to: 2, t: 0.35 }, lp: 1800, env: { a: 0.08, d: 0.35, v: 0.04 } },
        { wave: 'tri', f: G3, env: { a: 0.004, d: 0.4, v: 0.12 } },
      ], max: 1, gap: 0.3,
    },
    fright: {
      db: -3,
      loop: true, label: 'Hunters fleeing', group: 'loop', drive: 'time left pale (1 just eaten .. 0 they return)',
      desc: 'while they are pale: a slow soft wobble; in the last seconds it quickens as they warm back to red',
      attack: 0.3, release: 0.4, glide: 0.2,
      layers: [
        { wave: 'tri', f: G3, level: [0, 0.055], span: [0.28, 0.4], trem: { rate: 2.5, depth: 0.8 } },
        { wave: 'pulse', duty: 0.125, f: [hz('C5'), hz('D5')], lp: 1400, level: [0, 0.018], span: [0.28, 0.4], vib: { rate: 4, depth: 30 } },
        { wave: 'tri', f: hz('A3'), level: [0.05, 0], span: [0, 0.34], trem: { rate: 5.5, depth: 0.8 } },
      ],
    },
    returning: {
      label: 'Hunters return', group: 'play', desc: 'the pale time is over (they are red again): a low two-note fall',
      layers: [{ wave: 'pulse', duty: 0.5, f: hz('D4'), seq: [[0, 0], [0.12, -5]], env: { a: 0.004, d: 0.1, s: 0.6, h: 0.14, r: 0.15, v: 0.05 }, lp: 1200 },
        { wave: 'tri', f: G2, at: 0.12, env: { a: 0.004, d: 0.3, v: 0.1 } }],
      max: 1, gap: 0.5,
    },
    banish: {
      label: 'Banish a hunter', group: 'play', desc: 'you catch a pale hunter: a quick glide up (higher for each one in a row)',
      layers: [{ wave: 'pulse', duty: 0.25, f: G4, sweep: { to: 2.5, t: 0.18, q: 1 / 60 }, env: { a: 0.002, d: 0.22, v: 0.07 }, lp: 3000 },
        { wave: 'noise', f: 3000, lp: 1800, env: { a: 0.002, d: 0.1, v: 0.035 } }],
      max: 2, gap: 0.08,
    },
    emerge: {
      label: 'A hunter re-forms', group: 'play', desc: 'a hunter comes back out of the heart: a low, quiet sigh down',
      layers: [{ wave: 'tri', f: G3, sweep: { to: 0.75, t: 0.3 }, env: { a: 0.02, d: 0.35, v: 0.06 } },
        { wave: 'noise', f: 900, lp: 550, env: { a: 0.1, d: 0.3, v: 0.02 } }],
      max: 1, gap: 0.3,
    },
    turnAbout: {
      label: 'Hunters turn about', group: 'play', desc: 'scatter / chase changes (they all reverse): one soft low blip',
      layers: [{ wave: 'tri', f: G2, seq: [[0, 0], [0.06, 7]], env: { a: 0.003, d: 0.14, v: 0.08 } }],
      max: 1, gap: 0.5,
    },
    warn: {
      db: -3,
      label: 'A section is about to turn', group: 'play', desc: `a warning shimmer (${RB.warn} s, two notes, slower than 3 a second) before the rooms turn`,
      layers: [
        { wave: 'pulse', duty: 0.125, f: hz('D5'), arp: { n: [0, 5], step: 0.2, loop: true }, env: { a: 0.08, d: 0.1, s: 0.9, h: RB.warn - 0.35, r: 0.2, v: 0.035 }, lp: 2600 },
        { wave: 'tri', f: hz('D4'), env: { a: 0.15, d: 0.1, s: 0.9, h: RB.warn - 0.45, r: 0.25, v: 0.05 }, trem: { rate: 2.5, depth: 0.6 } },
      ], max: 1, gap: 1,
    },
    slide: {
      db: -8.5,
      label: 'The rooms turn (the slide)', group: 'play', desc: `the stone slides a quarter turn (${RB.turn} s): a low grind gliding up a fourth`,
      layers: [
        { wave: 'noise', f: 520, lp: 480, env: { a: 0.08, d: 0.1, s: 0.9, h: RB.turn - 0.25, r: 0.15, v: 0.07 } },
        { wave: 'tri', f: G2, sweep: { to: JI.fourth, t: RB.turn, curve: 'lin', q: 1 / 30 }, env: { a: 0.06, d: 0.1, s: 0.9, h: RB.turn - 0.2, r: 0.12, v: 0.11 } },
      ], max: 1, gap: 1,
    },
    turned: {
      label: 'The rooms lock', group: 'play', desc: 'the turn is done: a soft stone thunk',
      layers: [{ wave: 'tri', f: G2, env: { a: 0.002, d: 0.12, v: 0.15 } }, { wave: 'noise', f: 1400, lp: 850, env: { a: 0.002, d: 0.06, v: 0.06 } },
        { wave: 'pulse', duty: 0.5, f: G3, lp: 1000, env: { a: 0.002, d: 0.08, v: 0.025 } }],
      max: 1, gap: 0.5,
    },
    caught: {
      label: 'Caught', group: 'play', desc: 'a hunter catches you: a soft thump and four steps down (not a spiral)',
      layers: [
        { wave: 'noise', f: 1600, sweep: { to: 0.2, t: 0.3 }, lp: 1000, env: { a: 0.01, d: 0.35, v: 0.1 } },
        { wave: 'tri', f: G4, seq: [[0, 0], [0.12, -3], [0.24, -7], [0.36, -12]], env: { a: 0.006, d: 0.1, s: 0.8, h: 0.4, r: 0.3, v: 0.12 } },
        { wave: 'pulse', duty: 0.25, f: G4, seq: [[0, 0], [0.12, -3], [0.24, -7], [0.36, -12]], env: { a: 0.006, d: 0.1, s: 0.6, h: 0.35, r: 0.25, v: 0.035 }, lp: 1500 },
      ], max: 1, gap: 0.5,
    },
    win: {
      db: -1,
      label: 'THE LABYRINTH OPENS', group: 'end', desc: 'the win: G with an added ninth, climbing, then held open (the doors slide wide)',
      layers: [
        { wave: 'pulse', duty: 0.25, f: G3, arp: { n: [0, 4, 7, 14, 16, 19, 26], step: 0.08 }, env: { a: 0.003, d: 0.07, s: 0.6, h: 0.45, r: 0.4, v: 0.07 }, lp: 3000 },
        { wave: 'tri', f: G2, at: 0.4, env: { a: 0.06, d: 0.5, s: 0.7, h: 1.2, r: 1.5, v: 0.2 } },
        { wave: 'tri', f: G3 * JI.fifth, at: 0.45, env: { a: 0.08, d: 0.5, s: 0.7, h: 1.1, r: 1.4, v: 0.08 } },
        { wave: 'pulse', duty: 0.5, f: G4 * 9 / 8, at: 0.5, lp: 1500, env: { a: 0.12, d: 0.5, s: 0.6, h: 1.0, r: 1.4, v: 0.03 } },
        { wave: 'noise', f: 520, lp: 480, at: 0.2, env: { a: 0.1, d: 0.3, s: 0.6, h: 0.3, r: 0.4, v: 0.04 } },
      ], max: 1, gap: 2,
    },
  },
  cues: {
    Coin: (s) => s.play('coin'),
    Start: null, Tick: null, Bonus: null, Hit: null, Miss: null, Win: null, Die: null,
  },
  events: {
    go: (s) => { if (!s.st.went) { s.st.went = true; s.play('start'); } },
    eat: (s) => {
      // a wandering run on the pentatonic (0..4: G5 to E6): it keeps its direction most of the time, turns now and then, rests on a
      // note sometimes: little scales up and down a corridor, never a two-note see-saw
      let i = s.st.pi ?? 2, d = s.st.pd ?? 1;
      const r = s.rand();
      if (r < 0.22) d = -d; else if (r > 0.9) d = 0; else if (d === 0) d = s.rand() < 0.5 ? 1 : -1;
      i += d;
      if (i < 0) { i = 1; d = 1; } else if (i > 4) { i = 3; d = -1; }
      s.st.pi = i; s.st.pd = d;
      s.play('pellet', { pitch: penta(i) });
    },
    power: (s) => s.play('power'),
    banish: (s, e, g) => s.play('banish', { pitch: [0, 2, 4, 7][Math.min(3, Math.max(0, (g.sim?.powerN ?? 1) - 1))] }),
    emerge: (s) => s.play('emerge'),
    mode: (s) => s.play('turnAbout'),
    warn: (s) => s.play('warn'),
    turn: (s) => s.play('slide'),
    turned: (s) => s.play('turned'),
    caught: (s) => s.play('caught'),
    ward: (s) => s.play('ward'),
    clear: (s) => s.play('win'),
    out: (s) => s.play('die'),
    again: null, expel: null,
  },
  silent: {
    again: 'after a catch, the short READY (the ship is placed again; GO plays the start call)',
    expel: 'the mercy ward banishes the hunter that would have caught you: the ward bell (event "ward") covers it',
  },
  frame(s, game) {
    const sim = game.sim;
    let until = -1;
    for (const q of sim.pursuers) if (q.frightUntil > sim.levelTime) until = Math.max(until, q.frightUntil);
    if (until > 0 && sim.phase === 'play') {
      s.drive('fright', (until - sim.levelTime) / POWER);
      s.level('fright', 1, 0.2);
      s.st.fright = true;
    } else {
      if (s.st.fright) { s.level('fright', 0, 0.3); if (sim.phase === 'play') s.play('returning'); }
      s.st.fright = false;
    }
  },
};
