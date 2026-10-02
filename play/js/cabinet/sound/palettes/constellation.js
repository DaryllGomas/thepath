// THE CABINET'S SOUND · THE CONSTELLATION (level 2, Egypt's night sky; Missile Command-like). Key: A, high and starry.
// Shots rise as soft whooshes; the falling shapes whistle down (one voice follows the lowest, the most dangerous); bursts are
// soft noise; a quiet two-note alert when one is coming for the temple; the sky figure lights note by note on a wave clear.
import { hz, JI, penta } from '../music.js';
import { cabinetVoice, ROOTS } from './cabinet.js';

const R = ROOTS.constellation, A2 = hz('A2'), A3 = hz('A3'), A4 = hz('A4');
const TEMPLE = 3;                                   // (games/constellation/layout.js TEMPLE: the fourth star)

export const CONSTELLATION_SOUND = {
  id: 'constellation', title: 'THE CONSTELLATION', root: R,
  mix: 3.5,                                          // dB: this game's trim, so the seven sit at about the same loudness (tools/sound_bots.mjs)
  personality: 'the night sky: shots rise like breath, the shapes whistle down, soft bursts, the figure lights up note by note',
  sounds: {
    ...cabinetVoice(R),
    shot: {
      label: 'Counter-shot', group: 'play', desc: 'FIRE: a soft rising whoosh as the gold shot arcs up',
      layers: [
        { wave: 'noise', f: 1100, sweep: { to: 4, t: 0.32 }, lp: { f: 800, to: 3000, t: 0.32 }, env: { a: 0.05, d: 0.3, v: 0.07 } },
        { wave: 'pulse', duty: 0.125, f: A4, sweep: { to: 2, t: 0.3 }, lp: 1800, env: { a: 0.03, d: 0.3, v: 0.03 } },
      ], max: 3, gap: 0.05, vary: { pitch: 90, level: 0.15 },
    },
    whistle: {
      label: 'A star falls (appears)', group: 'play', desc: 'a shape enters the sky: a short faint whistle down',
      layers: [
        { wave: 'tri', f: hz('A5'), sweep: { to: 0.6, t: 0.6, q: 1 / 60 }, env: { a: 0.05, d: 0.6, v: 0.04 } },
        { wave: 'noise', f: 6000, lp: 1600, env: { a: 0.1, d: 0.45, v: 0.015 } },
      ], max: 2, gap: 0.22, vary: { pitch: 150 },
    },
    sky: {
      db: 1,
      loop: true, label: 'The falling stars (whistle)', group: 'loop', drive: 'how far down the lowest shape is (0 top .. 1 landing)',
      desc: 'one whistle for the whole salvo: its pitch falls as the lowest (most dangerous) shape falls; louder with more shapes',
      attack: 0.4, release: 0.6, glide: 0.18,
      layers: [
        { wave: 'tri', f: [hz('E6'), hz('E4')], level: [0.012, 0.03], vib: { rate: 6, depth: 10 } },
        { wave: 'noise', f: [3200, 1100], lp: [1500, 700], level: [0.004, 0.012] },
      ],
    },
    burst: {
      label: 'Burst', group: 'play', desc: 'a counter-shot bursts into its ring: a soft noise burst (chain bursts smaller and higher)',
      layers: [
        { wave: 'noise', f: 2400, sweep: { to: 0.35, t: 0.5 }, lp: { f: 1700, to: 450, t: 0.5 }, env: { a: 0.01, d: 0.55, v: 0.1 } },
        { wave: 'tri', f: A2, sweep: { to: 0.6, t: 0.2 }, env: { a: 0.006, d: 0.22, v: 0.08 } },
      ], max: 3, gap: 0.04, vary: { pitch: 120 },
    },
    kill: {
      db: 5,
      label: 'A shape shatters', group: 'play', desc: 'a shape caught in a ring: a small crystal cascade, higher down a chain',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('A5'), seq: [[0, 0], [0.03, -5], [0.06, -12]], env: { a: 0.002, d: 0.14, v: 0.06 }, lp: 3600 },
        { wave: 'tri', f: hz('A4'), env: { a: 0.002, d: 0.1, v: 0.05 } }],
      max: 3, gap: 0.03,
    },
    ground: {
      label: 'A shape hits the sand', group: 'play', desc: 'it lands on a dark star or the ground: a dull thud',
      layers: [
        { wave: 'tri', f: hz('G2'), sweep: { to: 0.6, t: 0.2 }, env: { a: 0.004, d: 0.26, v: 0.15 } },
        { wave: 'noise', f: 1500, lp: 850, env: { a: 0.004, d: 0.2, v: 0.08 } },
      ], max: 2, gap: 0.06,
    },
    baseLost: {
      label: 'A base goes dark', group: 'play', desc: 'a gold star is hit: its note falls and goes out',
      layers: [
        { wave: 'pulse', duty: 0.25, f: A3, seq: [[0, 0], [0.1, -3], [0.2, -7]], env: { a: 0.006, d: 0.1, s: 0.6, h: 0.2, r: 0.2, v: 0.08 }, lp: 1800 },
        { wave: 'noise', f: 2200, sweep: { to: 0.3, t: 0.5 }, lp: 1100, env: { a: 0.01, d: 0.5, v: 0.1 } },
        { wave: 'tri', f: A2, sweep: { to: 0.5, t: 0.5 }, env: { a: 0.006, d: 0.5, v: 0.15 } },
      ], max: 1, gap: 0.2,
    },
    templeHit: {
      label: 'The temple is hit', group: 'play', desc: 'the temple takes a hit: a low, soft gong',
      layers: [
        { wave: 'tri', f: A2, env: { a: 0.01, d: 1.1, v: 0.2 }, vib: { rate: 4, depth: 14 } },
        { wave: 'pulse', duty: 0.5, f: A2 * JI.fifth, lp: 800, env: { a: 0.01, d: 0.8, v: 0.05 } },
        { wave: 'noise', f: 1100, lp: 650, env: { a: 0.006, d: 0.3, v: 0.08 } },
      ], max: 1, gap: 0.3,
    },
    templeAlert: {
      label: 'The temple is threatened', group: 'play', desc: 'a shape is coming down on the temple: a quiet two-note alert (at most every 0.7 s)',
      layers: [{ wave: 'pulse', duty: 0.125, f: A4, seq: [[0, 0], [0.15, -5]], env: { a: 0.004, d: 0.08, s: 0.6, h: 0.12, r: 0.1, v: 0.05 }, lp: 2400 }],
      max: 1, gap: 0.6,
    },
    light: {
      db: 3,
      label: 'The figure lights (a stroke)', group: 'play', desc: 'a wave cleared: each line of the sacred figure lights with its own note, climbing',
      layers: [
        { wave: 'tri', f: A4, env: { a: 0.004, d: 0.6, v: 0.08 }, vib: { rate: 5, depth: 6, at: 0.1, fade: 0.2 } },
        { wave: 'pulse', duty: 0.125, f: hz('A5'), env: { a: 0.004, d: 0.3, v: 0.022 }, lp: 3000 },
      ], max: 3, gap: 0.08,
    },
    waveClear: {
      label: 'Wave cleared', group: 'play', desc: 'the salvo is gone: a small bright tally before the figure lights',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('A4'), arp: { n: [0, 4, 7, 12], step: 0.05 }, env: { a: 0.003, d: 0.1, s: 0.3, h: 0.1, r: 0.2, v: 0.05 }, lp: 3200 }],
      max: 1, gap: 1,
    },
    waveStart: {
      label: 'Next wave', group: 'play', desc: 'the next salvo is coming (waves 2-4): the start call\'s first two notes, low',
      layers: [{ wave: 'pulse', duty: 0.25, f: A3, arp: { n: [0, 7], step: 0.09 }, env: { a: 0.004, d: 0.1, s: 0.5, h: 0.1, r: 0.15, v: 0.07 }, lp: 2200 },
        { wave: 'tri', f: A2, env: { a: 0.004, d: 0.3, v: 0.14 } }],
      max: 1, gap: 1,
    },
    reload: {
      db: 3,
      label: 'Reload (a pip)', group: 'play', desc: 'between waves the bases refill a pip at a time: tiny counting ticks, climbing',
      layers: [{ wave: 'tri', f: hz('E5'), env: { a: 0.001, d: 0.022, v: 0.035 } }],
      max: 1, gap: 0.045, vary: { pitch: 25, level: 0.2, time: 0.004 },
    },
    dry: {
      label: 'Out of shots', group: 'play', desc: 'FIRE with no shots left in reach: a dull click',
      layers: [{ wave: 'tri', f: hz('D3'), sweep: { to: 0.8, t: 0.06 }, env: { a: 0.002, d: 0.08, v: 0.12 } },
        { wave: 'noise', f: 900, lp: 600, env: { a: 0.002, d: 0.04, v: 0.06 } }],
      max: 1, gap: 0.12,
    },
    strokeBreak: {
      label: 'A lit line breaks', group: 'play', desc: 'its star falls, so its line of the figure goes out: a sour, sinking pair',
      layers: [
        { wave: 'pulse', duty: 0.25, f: A4, sweep: { to: 0.8, t: 0.4 }, env: { a: 0.006, d: 0.45, v: 0.045 }, lp: 1800 },
        { wave: 'pulse', duty: 0.25, f: A4 * 1.045, sweep: { to: 0.8, t: 0.4 }, env: { a: 0.006, d: 0.45, v: 0.035 }, lp: 1800 },
      ], max: 1, gap: 0.15,
    },
    split: {
      label: 'A splitter splits', group: 'play', desc: 'a big shape breaks into smaller ones mid-air: a pop and two short whistles',
      layers: [{ wave: 'noise', f: 5000, lp: 2400, env: { a: 0.002, d: 0.05, v: 0.06 } },
        { wave: 'tri', f: hz('E6'), seq: [[0, 0], [0.06, -7]], sweep: { to: 0.8, t: 0.12 }, env: { a: 0.003, d: 0.13, v: 0.05 } }],
      max: 1, gap: 0.1,
    },
    win: {
      db: 0,
      label: 'THE PATTERN HOLDS', group: 'end', desc: 'the win: a starry climb with its own echo, over a held A',
      layers: [
        { wave: 'pulse', duty: 0.125, f: A4, arp: { n: [0, 4, 7, 11, 12, 16, 19, 24], step: 0.07 }, env: { a: 0.003, d: 0.06, s: 0.6, h: 0.5, r: 0.5, v: 0.06 }, lp: 3400 },
        { wave: 'pulse', duty: 0.125, f: A4, at: 0.21, arp: { n: [0, 4, 7, 11, 12, 16, 19, 24], step: 0.07 }, env: { a: 0.003, d: 0.06, s: 0.6, h: 0.5, r: 0.5, v: 0.025 }, lp: 2400 },
        { wave: 'tri', f: A2, at: 0.3, env: { a: 0.08, d: 0.5, s: 0.7, h: 1.2, r: 1.4, v: 0.2 } },
        { wave: 'pulse', duty: 0.5, f: A2 * 3, at: 0.5, lp: 1200, env: { a: 0.1, d: 0.5, s: 0.6, h: 1.0, r: 1.3, v: 0.035 } },
        { wave: 'tri', f: A2 * 5, at: 0.6, env: { a: 0.1, d: 0.5, s: 0.6, h: 0.9, r: 1.3, v: 0.05 }, vib: { rate: 5, depth: 6 } },
      ], max: 1, gap: 2,
    },
  },
  cues: {
    Coin: (s) => s.play('coin'),
    Start: null, Bonus: null, Tick: null, Hit: null, Miss: null, Win: null, Die: null,   // (waveStart / waveClear / reload / kill ... carry them)
  },
  events: {
    waveStart: (s, e) => s.play(e.wave === 0 ? 'start' : 'waveStart'),
    fire: (s) => s.play('shot'),
    spawn: (s) => s.play('whistle'),
    burst: (s, e) => s.play('burst', { level: e.chain > 0 ? 0.55 : 1, pitch: 3 * Math.min(3, e.chain) }),
    kill: (s, e) => s.play('kill', { pitch: penta(Math.min(3, e.chain)) }),
    impact: (s, e) => s.play(e.effect === 'base' ? 'baseLost' : e.effect === 'temple' ? 'templeHit' : e.effect === 'shield' ? 'ward' : 'ground'),
    split: (s) => s.play('split'),
    break: (s) => s.play('strokeBreak'),
    dry: (s) => s.play('dry'),
    waveClear: (s) => { s.play('waveClear'); s.st.lit = 0; },
    light: (s, e, g) => {                           // the stroke lights at e.at (scheduled by the round, a moment later)
      const k = s.st.lit = (s.st.lit || 0) + 1, w = g.sim ? g.sim.wave : 0;
      s.play('light', { delay: Math.max(0, e.at - (g.sim ? g.sim.time : 0)), pitch: penta(w + k - 1) });
    },
    reload: (s) => { const n = s.st.reload = (s.st.reload || 0) + 1; s.play('reload', { pitch: Math.min(12, Math.floor(n / 2)) }); },
    clear: (s) => s.play('win'),
    out: (s) => s.play('die'),
  },
  silent: {},
  frame(s, game) {
    const sim = game.sim;
    if (sim.phase !== 'breath') s.st.reload = 0;
    if (sim.phase !== 'wave' || sim.shapes.length === 0) { s.level('sky', 0, 0.3); return; }
    let prog = 0, tti = 9;
    for (const sh of sim.shapes) {
      prog = Math.max(prog, sh.d / sh.dist);
      if (sh.target === TEMPLE && sim.stars[TEMPLE].alive) tti = Math.min(tti, (sh.dist - sh.d) / sh.speed);
    }
    s.drive('sky', prog);
    s.level('sky', Math.min(1, 0.35 + sim.shapes.length / 5), 0.3);
    if (tti < 2.4 && s.t - (s.st.alertAt ?? -9) > 0.7) { s.st.alertAt = s.t; s.play('templeAlert'); }
  },
};
