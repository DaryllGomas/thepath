// THE CABINET'S SOUND · THE ASCENT (level 6, Atlantis; Lunar Lander + Joust). Key: F#, rising.
// Thrust is a rumble (noise and a low tone) that follows the throttle. Coming down over an island you hear how you are
// doing: soft gold pings when the descent is safe, lower buzzier ones when it is too fast (both under 3 a second, and they
// quicken as the ground comes up). A soft landing settles; a pad lights with a bell a step higher each time; stomping a
// crystal is a glassy cascade; the temple opens with a slow rising sweep; the win rises two octaves.
import { hz, JI, penta } from '../music.js';
import { cabinetVoice, ROOTS } from './cabinet.js';
import { TUNE } from '../../games/ascent/spec.js';

const R = ROOTS.ascent, Fs1 = hz('F#1'), Fs2 = hz('F#2'), Fs3 = hz('F#3'), Fs4 = hz('F#4');

export const ASCENT_SOUND = {
  id: 'ascent', title: 'THE ASCENT', root: R,
  mix: 3.5,                                          // dB: this game's trim, so the seven sit at about the same loudness (tools/sound_bots.mjs)
  personality: 'the rising: a thrust rumble on the throttle, gold pings for a safe descent, glassy crystals, bells as the pads light, a slow rising win',
  sounds: {
    ...cabinetVoice(R),
    thrust: {
      db: -10,
      loop: true, label: 'Thrust rumble', group: 'loop', drive: 'the throttle (0 .. 1)',
      desc: 'UP / SPACE: a rumble of noise and a low tone that follow the throttle', attack: 0.05, release: 0.25, glide: 0.08,
      layers: [
        { wave: 'noise', f: [140, 420], lp: [260, 700], level: [0, 0.09] },
        { wave: 'tri', f: [Fs1, hz('C#2')], level: [0, 0.08] },
        { wave: 'noise', f: [3000, 4500], lp: 1300, level: [0, 0.012] },
      ],
    },
    sideJet: {
      loop: true, label: 'Side jets', group: 'loop', drive: 'steering (0 .. 1)',
      desc: 'LEFT / RIGHT in the air: a thin hiss', attack: 0.05, release: 0.15, glide: 0.06,
      layers: [{ wave: 'noise', f: [2400, 3000], lp: 1000, level: [0, 0.028] }],
    },
    safePing: {
      db: 7,
      label: 'Safe descent', group: 'play', desc: 'coming down slow enough over an island: a soft gold ping (quicker as the ground comes up)',
      layers: [{ wave: 'tri', f: hz('F#5'), env: { a: 0.003, d: 0.12, v: 0.05 } }, { wave: 'tri', f: hz('C#6'), at: 0.03, env: { a: 0.003, d: 0.08, v: 0.015 } }],
      max: 1, gap: 0.2,
    },
    fastPing: {
      db: 6,
      label: 'Too fast', group: 'play', desc: 'coming down too fast over an island: a lower, buzzier pair (slow down!)',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('C5'), seq: [[0, 0], [0.07, -1]], env: { a: 0.003, d: 0.14, v: 0.045 }, lp: 1700 }],
      max: 1, gap: 0.24,
    },
    takeoff: {
      label: 'Take off', group: 'play', desc: 'leaving an island: a quick puff',
      layers: [{ wave: 'noise', f: 700, sweep: { to: 3, t: 0.2 }, lp: { f: 500, to: 1400, t: 0.2 }, env: { a: 0.02, d: 0.2, v: 0.05 } }],
      max: 1, gap: 0.2,
    },
    softLand: {
      label: 'Soft landing', group: 'play', desc: 'set down gently: a settling two-note and a small thud (the tank refills)',
      layers: [{ wave: 'tri', f: hz('C#5'), seq: [[0, 0], [0.07, -7]], env: { a: 0.003, d: 0.08, s: 0.6, h: 0.1, r: 0.15, v: 0.08 } },
        { wave: 'tri', f: Fs2, env: { a: 0.002, d: 0.12, v: 0.12 } }, { wave: 'noise', f: 700, lp: 480, env: { a: 0.002, d: 0.09, v: 0.05 } }],
      max: 1, gap: 0.25,
    },
    padLit: {
      label: 'A pad lights', group: 'play', desc: 'a soft landing on a gold pad: a bell (a step higher for each pad) and the obelisk rises',
      layers: [
        { wave: 'tri', f: Fs4, env: { a: 0.004, d: 1.1, v: 0.1 }, vib: { rate: 5, depth: 6, at: 0.2, fade: 0.3 } },
        { wave: 'pulse', duty: 0.125, f: Fs4 * 2, env: { a: 0.004, d: 0.5, v: 0.025 }, lp: 3000 },
        { wave: 'tri', f: Fs3, sweep: { to: 2, t: 0.6 }, env: { a: 0.05, d: 0.6, v: 0.05 } },
        { wave: 'noise', f: 1000, sweep: { to: 2.5, t: 0.6 }, lp: 900, env: { a: 0.1, d: 0.5, v: 0.025 } },
      ], max: 1, gap: 0.3,
    },
    almost: {
      label: 'Almost there', group: 'play', desc: 'two pads (or one) to go: a small lift',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('C#5'), arp: { n: [0, 5, 7], step: 0.07 }, env: { a: 0.003, d: 0.12, s: 0.4, h: 0.1, r: 0.15, v: 0.035 }, lp: 3000 }],
      max: 1, gap: 1,
    },
    templeOpens: {
      db: -1.5,
      label: 'The temple opens', group: 'play', desc: 'every pad lit: a slow deep sweep rising, then a climb (land on it!)',
      layers: [
        { wave: 'tri', f: Fs1, sweep: { to: 4, t: 1.6 }, env: { a: 0.3, d: 0.3, s: 0.8, h: 1.0, r: 0.9, v: 0.2 } },
        { wave: 'noise', f: 260, lp: 380, env: { a: 0.4, d: 0.3, s: 0.8, h: 0.8, r: 0.8, v: 0.07 } },
        { wave: 'pulse', duty: 0.25, f: Fs4, at: 1.3, arp: { n: [0, 4, 7, 12, 16, 19, 24], step: 0.08 }, env: { a: 0.003, d: 0.08, s: 0.5, h: 0.45, r: 0.3, v: 0.055 }, lp: 3000 },
      ], max: 1, gap: 2,
    },
    stomp: {
      db: 5,
      label: 'Crystal stomped', group: 'play', desc: 'down on a crystal from above: a glassy cascade and a bounce (higher down a chain)',
      layers: [
        { wave: 'pulse', duty: 0.125, f: hz('C#5'), seq: [[0, 12], [0.025, 7], [0.05, 4], [0.075, 0]], env: { a: 0.002, d: 0.16, v: 0.05 }, lp: 3600 },
        { wave: 'metal', f: 19000, env: { a: 0.001, d: 0.06, v: 0.03 }, lp: 3200 },
        { wave: 'tri', f: Fs3, env: { a: 0.002, d: 0.08, v: 0.08 } },
      ], max: 2, gap: 0.06,
    },
    crystalHit: {
      label: 'A crystal hits you', group: 'play', desc: 'a crystal from the side or below: a crack (the crash follows)',
      layers: [{ wave: 'noise', f: 3000, lp: 1500, env: { a: 0.002, d: 0.14, v: 0.08 } }, { wave: 'metal', f: 12000, lp: 2400, env: { a: 0.001, d: 0.08, v: 0.03 } }],
      max: 1, gap: 0.2,
    },
    crash: {
      label: 'Crash', group: 'play', desc: 'a hard landing (or a crystal): a soft crash down',
      layers: [
        { wave: 'noise', f: 3500, sweep: { to: 0.1, t: 0.8 }, lp: { f: 2400, to: 300, t: 0.8 }, env: { a: 0.012, d: 0.85, v: 0.13 } },
        { wave: 'tri', f: Fs2, sweep: { to: 0.5, t: 0.5, q: 1 / 30 }, env: { a: 0.008, d: 0.6, v: 0.15 } },
      ], max: 1, gap: 0.3,
    },
    splash: {
      label: 'Into the sea', group: 'play', desc: 'the sea takes the ship: a long soft splash',
      layers: [
        { wave: 'noise', f: 6000, sweep: { to: 0.3, t: 0.9 }, lp: { f: 2800, to: 500, t: 0.9 }, env: { a: 0.05, d: 1.0, v: 0.1 } },
        { wave: 'tri', f: Fs3, sweep: { to: 0.4, t: 0.5 }, env: { a: 0.01, d: 0.5, v: 0.08 } },
      ], max: 1, gap: 0.3,
    },
    bump: {
      label: 'Bump', group: 'play', desc: 'glancing off an island\'s side or underside (never a death): a soft knock',
      layers: [{ wave: 'tri', f: hz('A2'), env: { a: 0.002, d: 0.08, v: 0.1 } }, { wave: 'noise', f: 1200, lp: 700, env: { a: 0.002, d: 0.05, v: 0.04 } }],
      max: 1, gap: 0.12,
    },
    dry: {
      label: 'Out of fuel (sputter)', group: 'play', desc: 'thrust with an empty tank: a sputter (land to refill)',
      layers: [{ wave: 'noise', f: 900, lp: 650, env: { a: 0.01, d: 0.35, v: 0.06 }, trem: { rate: 14, depth: 1 } }, { wave: 'tri', f: hz('C#2'), env: { a: 0.01, d: 0.3, v: 0.05 } }],
      max: 1, gap: 0.5,
    },
    lowFuel: {
      label: 'Low fuel', group: 'play', desc: 'the tank under a quarter in the air: a quiet two-note call every 1.6 s',
      layers: [{ wave: 'tri', f: Fs4, seq: [[0, 0], [0.12, -12]], env: { a: 0.003, d: 0.08, s: 0.6, h: 0.12, r: 0.1, v: 0.04 } }],
      max: 1, gap: 1.2,
    },
    crystalIn: {
      label: 'A crystal drifts in', group: 'play', desc: 'a new crystal enters from an edge: a faint glassy glint',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('C#6'), sweep: { to: 0.8, t: 0.4 }, lp: 2800, env: { a: 0.1, d: 0.4, v: 0.02 } }],
      max: 1, gap: 0.5,
    },
    win: {
      db: 1.3,
      label: 'ATLANTIS RISES', group: 'end', desc: 'the win: a deep tone rising an octave under a two-octave climb, then a wide held chord',
      layers: [
        { wave: 'tri', f: Fs2, sweep: { to: 2, t: 3.0 }, env: { a: 0.3, d: 0.3, s: 0.8, h: 2.4, r: 1.6, v: 0.17 } },
        { wave: 'pulse', duty: 0.25, f: Fs3, arp: { n: [0, 4, 7, 12, 16, 19, 24, 28, 31], step: 0.11 }, env: { a: 0.003, d: 0.08, s: 0.6, h: 0.9, r: 0.5, v: 0.06 }, lp: 3000 },
        { wave: 'pulse', duty: 0.5, f: Fs4, at: 1.1, lp: 1500, env: { a: 0.2, d: 0.4, s: 0.7, h: 1.4, r: 1.8, v: 0.03 } },
        { wave: 'tri', f: Fs4 * JI.third, at: 1.2, env: { a: 0.2, d: 0.4, s: 0.7, h: 1.3, r: 1.8, v: 0.05 } },
        { wave: 'tri', f: Fs4 * JI.fifth, at: 1.3, env: { a: 0.2, d: 0.4, s: 0.7, h: 1.2, r: 1.8, v: 0.04 } },
        { wave: 'noise', f: 380, lp: 650, env: { a: 1.0, d: 2.2, v: 0.045 } },
      ], max: 1, gap: 2,
    },
  },
  cues: {
    Coin: (s) => s.play('coin'),
    Start: null, Tick: null, Bonus: null, Hit: null, Miss: null, Win: null, Die: null,
  },
  events: {
    go: (s) => { if (!s.st.went) { s.st.went = true; s.play('start'); } },
    takeoff: (s) => s.play('takeoff'),
    soft: (s, e) => s.play(e.ward ? 'ward' : 'softLand'),
    light: (s, e) => s.play('padLit', { pitch: penta(Math.max(0, e.lit - 1)) }),
    almost: (s) => s.play('almost'),
    open: (s) => s.play('templeOpens'),
    stomp: (s, e) => s.play('stomp', { pitch: penta(Math.max(0, e.chain - 1)) }),
    hit: (s) => s.play('crystalHit'),
    bump: (s, e) => s.play('bump', { level: Math.min(1, 0.4 + e.v / 250) }),
    dry: (s) => s.play('dry'),
    spawn: (s) => s.play('crystalIn'),
    ward: (s) => s.play('ward'),
    lifeLost: (s, e) => s.play(e.why === 'sea' ? 'splash' : 'crash'),
    clear: (s) => s.play('win'),
    out: (s) => s.play('die'),
    again: null, gone: null,
  },
  silent: {
    again: 'after a lost ship, the short READY',
    gone: 'the crystals clear away when a ship is lost (the crash has the sound)',
  },
  frame(s, game, dt) {
    const sim = game.sim, l = sim.lander, play = sim.phase === 'play' && l.alive;
    const air = play && l.landed < 0;
    s.st.th = (s.st.th ?? 0) + (((play && l.thrusting) ? 1 : 0) - (s.st.th ?? 0)) * (1 - Math.exp(-dt / 0.06));
    s.drive('thrust', s.st.th);
    s.drive('sideJet', air && l.fuel > 0 ? Math.min(1, Math.abs(l.side)) : 0);
    // the descent: how you are doing over the island below you
    if (air && l.vy > 30) {
      const gb = sim.groundBelow(l.x, l.y), gap = gb ? gb.gap : 999;
      if (gap < 200) {
        const safe = sim.isSoft(l.vy, l.tilt), period = 0.55 - 0.21 * (1 - gap / 200);
        if (s.t - (s.st.pingAt ?? -9) >= period) { s.st.pingAt = s.t; s.play(safe ? 'safePing' : 'fastPing'); }
      }
    }
    // low fuel, in the air
    if (air && l.fuel < TUNE.fuel.low * TUNE.fuel.max && l.fuel > 0 && s.t - (s.st.lowAt ?? -9) >= 1.6) { s.st.lowAt = s.t; s.play('lowFuel'); }
  },
};
