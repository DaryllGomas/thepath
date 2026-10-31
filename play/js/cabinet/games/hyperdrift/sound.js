// THE CABINET'S SOUND · HYPER DRIFT (the top-down rally on THE JUNCTION's floor). Key: A, quick and bright.
// Chip synthesis only (js/cabinet/sound/chip.js), built on the floor's stock voice (palettes/floor.js): a low engine
// hum that follows your speed, a tyre squeal for the drift, a crunch for a spin, a burst for a wreck, a whoosh for a
// boost pad, a rising call at the extend gate, a bell for each leg's card, the tally's ticks, and a siren when the
// rival pulls out. It reads the sim's own events (sim.events) and never writes to the game.
import { hz, JI } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('A4');

// the events with no sound of their own (GameSound counts an event as handled when its entry is null)
const SILENT = {
  go: 'the countdown\'s Start cue is its sound (the ready call)',
  hurry: 'the clock\'s Tick cue counts the last ten seconds',
  newCar: 'the Die cue said the car was lost; the next one just drives on',
  outOfTime: 'the Die cue (a life lost) is its sound',
  gameOver: 'the floor\'s own "out" (the round lost) follows at the card',
  champion: 'the Win cue is its sound',
  pass: 'the Bonus cue is its sound',
  hairpin: 'the Bonus cue is its sound',
  bridge: 'a landmark the notice plate shows; nothing to hear',
  works: 'a landmark the notice plate shows; nothing to hear',
  fork: 'a landmark the notice plate shows; nothing to hear',
};

export const SOUND = floorSound('hyperdrift', 'HYPER DRIFT', R, {
  personality: 'a rally in five legs: an engine hum under everything, squeals and crunches, a bell for every leg, a siren for the rival',
  sounds: {
    engine: {
      loop: true, label: 'The engine', group: 'loop', drive: 'your speed (0 .. top speed)',
      desc: 'a low buzz that climbs with the speed (quiet: the jukebox plays in the room)', attack: 0.2, release: 0.4, glide: 0.08,
      layers: [{ wave: 'pulse', duty: 0.25, f: [hz('A1'), hz('E3')], lp: [300, 900], level: [0.012, 0.03] },
        { wave: 'noise', f: [300, 900], lp: 600, level: [0.004, 0.012] }],
    },
    squeal: {
      label: 'Tyres in a drift', group: 'play', desc: 'a short wavering squeal',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('E5'), sweep: { to: 0.85, t: 0.3 }, vib: { rate: 18, depth: 60 }, env: { a: 0.02, d: 0.32, v: 0.035 }, lp: 2600 },
        { wave: 'noise', f: 6000, lp: 2400, env: { a: 0.02, d: 0.3, v: 0.03 } }],
      max: 1, gap: 0.25,
    },
    crunch: {
      label: 'A spin-out', group: 'play', desc: 'a thump and a scrape falling away',
      layers: [{ wave: 'noise', f: 3000, sweep: { to: 0.3, t: 0.3 }, lp: { f: 2200, to: 500, t: 0.3 }, env: { a: 0.002, d: 0.32, v: 0.1 } },
        { wave: 'tri', f: hz('A2'), sweep: { to: 0.6, t: 0.2 }, env: { a: 0.002, d: 0.2, v: 0.12 } }],
      max: 2, gap: 0.1,
    },
    boom: {
      label: 'A wreck', group: 'play', desc: 'a long noise burst with a deep thud',
      layers: [{ wave: 'noise', f: 4200, sweep: { to: 0.1, t: 0.7 }, lp: { f: 2600, to: 240, t: 0.7 }, env: { a: 0.003, d: 0.75, v: 0.15 } },
        { wave: 'tri', f: hz('E2'), sweep: { to: 0.4, t: 0.45 }, env: { a: 0.003, d: 0.45, v: 0.2 } }],
      max: 1, gap: 0.3,
    },
    splash: {
      label: 'A puddle', group: 'play', desc: 'a soft hiss of spray',
      layers: [{ wave: 'noise', f: 7000, lp: { f: 3000, to: 900, t: 0.35 }, env: { a: 0.01, d: 0.35, v: 0.07 } }],
      max: 1, gap: 0.2,
    },
    glass: {
      label: 'On ice', group: 'play', desc: 'a thin glassy ring',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('E6') / 2, sweep: { to: 0.9, t: 0.4 }, env: { a: 0.005, d: 0.4, v: 0.03 }, lp: 3000 }],
      max: 1, gap: 0.4,
    },
    whoosh: {
      label: 'A boost pad', group: 'play', desc: 'noise sweeping up, a fifth climbing with it',
      layers: [{ wave: 'noise', f: 900, sweep: { to: 4, t: 0.35 }, lp: { f: 900, to: 4000, t: 0.35 }, env: { a: 0.02, d: 0.45, v: 0.08 } },
        { wave: 'tri', f: R / 2, seq: [[0, 0], [0.1, 7], [0.2, 12]], env: { a: 0.01, d: 0.4, v: 0.07 } }],
      max: 1, gap: 0.3,
    },
    hop: {
      label: 'The jump', group: 'play', desc: 'a rising swoop off the ramp',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('A3'), sweep: { to: 2, t: 0.4 }, env: { a: 0.005, d: 0.45, v: 0.05 }, lp: 2400 }],
      max: 1, gap: 0.4,
    },
    thud: {
      label: 'A landing, a rock landing', group: 'play', desc: 'a low thud with grit',
      layers: [{ wave: 'tri', f: hz('A1'), sweep: { to: 0.6, t: 0.2 }, env: { a: 0.002, d: 0.25, v: 0.18 } },
        { wave: 'noise', f: 1500, lp: 800, env: { a: 0.002, d: 0.18, v: 0.06 } }],
      max: 2, gap: 0.1,
    },
    whistle: {
      label: 'A rock falling', group: 'play', desc: 'a falling whistle while the shadow grows',
      layers: [{ wave: 'tri', f: hz('E6') / 2, sweep: { to: 0.4, t: 1.1 }, env: { a: 0.05, d: 1.1, v: 0.04 } }],
      max: 2, gap: 0.3,
    },
    blink: {
      label: 'A taxi\'s indicator', group: 'play', desc: 'two dry clicks',
      layers: [{ wave: 'metal', f: 9000, seq: [[0, 0], [0.25, 0]], env: { a: 0.001, d: 0.03, s: 0, h: 0.25, r: 0.03, v: 0.03 }, lp: 2400 }],
      max: 1, gap: 0.5,
    },
    extend: {
      label: 'EXTENDED TIME', group: 'play', desc: 'a quick climb up the major chord, twice',
      layers: [{ wave: 'pulse', duty: 0.125, f: R, arp: { n: [0, 4, 7, 12, 7, 12, 16], step: 0.06 }, env: { a: 0.002, d: 0.1, s: 0.7, h: 0.35, r: 0.15, v: 0.06 }, lp: 3200 },
        { wave: 'tri', f: R / 2, env: { a: 0.002, d: 0.4, v: 0.1 } }],
      max: 1, gap: 0.5,
    },
    bell: {
      label: 'A leg begins', group: 'play', desc: 'the leg card: a bell and a rising triad',
      layers: [{ wave: 'tri', f: R, env: { a: 0.004, d: 1.2, v: 0.15 } }, { wave: 'tri', f: R * JI.fifth, env: { a: 0.006, d: 0.9, v: 0.07 } },
        { wave: 'pulse', duty: 0.125, f: R * 2, arp: { n: [0, 4, 7], step: 0.08 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.2, r: 0.3, v: 0.04 }, lp: 3000 }],
      max: 1, gap: 1,
    },
    flag: {
      label: 'CHECKPOINT', group: 'play', desc: 'the line: a bright fanfare up the chord',
      layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.1, 4], [0.2, 7], [0.3, 12]], env: { a: 0.003, d: 0.1, s: 0.8, h: 0.5, r: 0.3, v: 0.07 }, lp: 3200 },
        { wave: 'tri', f: R / 2, env: { a: 0.003, d: 0.6, v: 0.14 } }],
      max: 1, gap: 1,
    },
    count: {
      label: 'The tally counts', group: 'play', desc: 'a tiny high blip for every few points',
      layers: [{ wave: 'pulse', duty: 0.125, f: R * 2, env: { a: 0.001, d: 0.03, v: 0.025 }, lp: 3300 }],
      max: 2, gap: 0.05,
    },
    oneUp: {
      label: 'EXTRA CAR', group: 'play', desc: 'a quick happy run up two octaves',
      layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 4, 7, 12, 16, 19, 24], step: 0.05 }, env: { a: 0.002, d: 0.08, s: 0.7, h: 0.35, r: 0.2, v: 0.06 }, lp: 3300 }],
      max: 1, gap: 1,
    },
    siren: {
      label: 'THE RIVAL', group: 'play', desc: 'a two-tone call as the rival pulls out (the boss)',
      layers: [{ wave: 'pulse', duty: 0.5, f: hz('E4'), seq: [0, 1, 2, 3, 4, 5].map((i) => [i * 0.22, i % 2 ? -5 : 0]), env: { a: 0.02, d: 0.1, s: 0.85, h: 1.2, r: 0.15, v: 0.05 }, lp: 2000 },
        { wave: 'tri', f: hz('E2'), seq: [0, 1, 2, 3, 4, 5].map((i) => [i * 0.22, i % 2 ? -5 : 0]), env: { a: 0.02, d: 0.1, s: 0.9, h: 1.2, r: 0.15, v: 0.08 } }],
      max: 1, gap: 2,
    },
    lead: {
      label: 'The lead changes', group: 'play', desc: 'two notes: up when you lead, down when the rival does',
      layers: [{ wave: 'tri', f: R, seq: [[0, 0], [0.08, 5]], env: { a: 0.003, d: 0.3, v: 0.1 } }],
      max: 1, gap: 0.4,
    },
  },
  events: {
    card: (s, e) => s.play('bell', { pitch: (e.leg - 1) * 2 }),
    drift: (s) => s.play('squeal'),
    spin: (s) => s.play('crunch'),
    wreck: (s) => { s.play('boom'); s.duck(0.6, 0.4); },
    beaten: (s) => s.play('lead', { pitch: -12 }),
    splash: (s) => s.play('splash'),
    ice: (s) => s.play('glass'),
    boost: (s) => s.play('whoosh'),
    jump: (s) => s.play('hop'),
    land: (s) => s.play('thud'),
    rockWarn: (s) => s.play('whistle'),
    rockLand: (s) => s.play('thud', { pitch: -5 }),
    taxi: (s) => s.play('blink'),
    extend: (s) => s.play('extend'),
    checkpoint: (s) => s.play('flag'),
    goal: (s) => s.play('flag', { pitch: 5 }),
    tallyTick: (s) => s.play('count'),
    tallyBonus: (s, e) => s.play('count', { pitch: 7 + e.n * 2 }),
    extraCar: (s) => s.play('oneUp'),
    rival: (s) => s.play('siren'),
    rivalPass: (s, e) => s.play('lead', { pitch: e.lead ? 0 : -5 }),
    tunnel: (s) => s.play('whoosh', { pitch: -12, level: 0.6 }),
    ...Object.fromEntries(Object.keys(SILENT).map((k) => [k, null])),
  },
  silent: SILENT,
  frame(s, game) {
    const sim = game.sim;
    if (!sim) return;
    const racing = sim.p === 3 || sim.p === 6;                       // Racing, Tally (HyperDriftSim.Phase)
    s.drive('engine', racing ? Math.min(1, sim.v / 200) : 0);
  },
});

export default SOUND;
