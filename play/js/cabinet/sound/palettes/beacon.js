// THE CABINET'S SOUND · THE BEACON (level 3, the East; Star Castle-like). Key: E, bold.
// A thrust hiss, a laser zap, shields that tick and break, and under it all a low drone that climbs as the core is laid
// bare (the more shield broken, the higher and brighter). The core gathering light is a rising flutter; lighting it rings
// a big bell; the win is a bold held E.
import { hz, JI, penta } from '../music.js';
import { cabinetVoice, ROOTS } from './cabinet.js';

const R = ROOTS.beacon, E2 = hz('E2'), E3 = hz('E3'), E4 = hz('E4'), E5 = hz('E5');
const W = [0.5, 0.3, 0.2];                          // how much each ring (inner, middle, outer) counts toward "exposed"

export const BEACON_SOUND = {
  id: 'beacon', title: 'THE BEACON', root: R,
  mix: 3.5,                                          // dB: this game's trim, so the seven sit at about the same loudness (tools/sound_bots.mjs)
  personality: 'a siege of light: thrust hiss, laser zaps, shields that tick and break, a drone that climbs as the core is laid bare',
  sounds: {
    ...cabinetVoice(R),
    thrust: {
      db: -6,
      loop: true, label: 'Thrust', group: 'loop', drive: 'thrust (0 .. 1)',
      desc: 'UP: a soft hiss of thrust (it follows the stick)', attack: 0.05, release: 0.2, glide: 0.07,
      layers: [
        { wave: 'noise', f: [2600, 5200], lp: [500, 1300], level: [0, 0.07] },
        { wave: 'tri', f: [hz('E2'), hz('G2')], level: [0, 0.025] },
      ],
    },
    zap: {
      db: 5,
      label: 'Laser zap', group: 'play', desc: 'FIRE: a short stepped zap down (tap or hold)',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('E6'), sweep: { to: 0.3, t: 0.09, q: 1 / 120 }, env: { a: 0.001, d: 0.1, v: 0.065 }, lp: 3400 },
        { wave: 'tri', f: E5, sweep: { to: 0.5, t: 0.06 }, env: { a: 0.001, d: 0.05, v: 0.04 } }],
      max: 2, gap: 0.05, vary: { pitch: 70, level: 0.12, time: 0.008 },
    },
    chip: {
      db: 4,
      label: 'A shield chipped', group: 'play', desc: 'a shot hits a shield that holds: a small metallic tick (inner rings higher)',
      layers: [{ wave: 'metal', f: 17000, env: { a: 0.001, d: 0.05, v: 0.05 }, lp: 2800 }, { wave: 'tri', f: hz('B5'), env: { a: 0.001, d: 0.03, v: 0.035 } }],
      max: 2, gap: 0.04, vary: { pitch: 40, level: 0.2, time: 0.005 },
    },
    segBreak: {
      label: 'A shield segment breaks', group: 'play', desc: 'a shield breaks open (a gap in the ring): a burst and a two-note drop',
      layers: [
        { wave: 'noise', f: 4000, sweep: { to: 0.3, t: 0.25 }, lp: { f: 2400, to: 650, t: 0.25 }, env: { a: 0.004, d: 0.28, v: 0.09 } },
        { wave: 'pulse', duty: 0.25, f: hz('B4'), seq: [[0, 0], [0.05, -5]], env: { a: 0.003, d: 0.18, v: 0.07 }, lp: 2600 },
      ], max: 2, gap: 0.05,
    },
    ringClear: {
      label: 'A whole ring broken', group: 'play', desc: 'a ring broken all the way round (it will reform): a falling cascade',
      layers: [{ wave: 'pulse', duty: 0.125, f: E5, arp: { n: [12, 7, 4, 0, -5], step: 0.05 }, env: { a: 0.003, d: 0.2, s: 0.4, h: 0.1, r: 0.15, v: 0.06 }, lp: 3000 },
        { wave: 'noise', f: 3000, sweep: { to: 0.2, t: 0.4 }, lp: 1400, env: { a: 0.01, d: 0.4, v: 0.05 } }],
      max: 1, gap: 0.3,
    },
    formed: {
      db: 4,
      label: 'A shield reforms', group: 'play', desc: 'a broken shield grows back: a very faint blip up (many come at once, so it is capped)',
      layers: [{ wave: 'tri', f: E5, sweep: { to: 1.12, t: 0.05 }, env: { a: 0.002, d: 0.06, v: 0.022 } }],
      max: 1, gap: 0.07, vary: { pitch: 30, level: 0.3, time: 0.012 },
    },
    coreDrone: {
      db: -5,
      loop: true, label: 'The core (drone)', group: 'loop', drive: 'how exposed the core is (0 all shields .. 1 bare)',
      desc: 'a low drone that climbs a fifth and brightens as the shields around the core are broken',
      attack: 1.2, release: 1.0, glide: 0.5,
      layers: [
        { wave: 'tri', f: [E2, hz('B2')], level: [0.05, 0.11] },
        { wave: 'pulse', duty: 0.5, f: [E3, hz('B3')], lp: [380, 900], level: [0.008, 0.032] },
        { wave: 'pulse', duty: 0.125, f: [E4, hz('B4')], lp: 1300, level: [0, 0.012], span: [0.45, 1] },
      ],
    },
    charge: {
      db: 7,
      loop: true, label: 'The core gathers light', group: 'loop', drive: 'the charge (0 .. 1: then a shard leaves)',
      desc: 'the core lines up on you and gathers light: a rising flutter (shoot or move)',
      attack: 0.05, release: 0.25, glide: 0.05,
      layers: [{ wave: 'pulse', duty: 0.125, f: [E4, hz('E5')], lp: 1900, level: [0, 0.035], trem: { rate: 9, depth: 0.5 } }],
    },
    shardLaunch: {
      label: 'A shard leaves the core', group: 'play', desc: 'the red homing shard is sent: a warbling drop',
      layers: [{ wave: 'pulse', duty: 0.5, f: hz('E5'), sweep: { to: 0.5, t: 0.25, q: 1 / 60 }, env: { a: 0.004, d: 0.28, v: 0.06 }, lp: 1800, vib: { rate: 12, depth: 40 } },
        { wave: 'noise', f: 2000, lp: 1400, env: { a: 0.004, d: 0.15, v: 0.04 } }],
      max: 1, gap: 0.3,
    },
    shardKill: {
      label: 'A shard shot down', group: 'play', desc: 'you shoot a shard: a bright pop',
      layers: [{ wave: 'noise', f: 6000, sweep: { to: 0.4, t: 0.12 }, lp: 2400, env: { a: 0.002, d: 0.12, v: 0.07 } },
        { wave: 'tri', f: hz('E6'), seq: [[0, 0], [0.04, 5]], env: { a: 0.002, d: 0.1, v: 0.05 } }],
      max: 2, gap: 0.05,
    },
    lit: {
      label: 'The core lit', group: 'play', desc: 'a shot threads every ring and reaches the core: a big soft bell and a climb',
      layers: [
        { wave: 'tri', f: E3, env: { a: 0.006, d: 1.8, v: 0.2 } },
        { wave: 'tri', f: E3 * JI.fifth, env: { a: 0.006, d: 1.5, v: 0.09 } },
        { wave: 'pulse', duty: 0.25, f: E4 * JI.third, lp: 2000, env: { a: 0.006, d: 1.2, v: 0.03 } },
        { wave: 'pulse', duty: 0.125, f: E5, arp: { n: [0, 4, 7, 12, 16], step: 0.06 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.25, r: 0.3, v: 0.045 }, lp: 3000 },
        { wave: 'noise', f: 1500, sweep: { to: 2, t: 0.6 }, lp: 1200, env: { a: 0.15, d: 0.6, v: 0.03 } },
      ], max: 1, gap: 0.5,
    },
    shipDie: {
      label: 'Ship lost', group: 'play', desc: 'a shield, the core or a shard takes your ship: a soft crash down',
      layers: [
        { wave: 'noise', f: 3000, sweep: { to: 0.12, t: 0.7 }, lp: { f: 2000, to: 300, t: 0.7 }, env: { a: 0.012, d: 0.75, v: 0.12 } },
        { wave: 'pulse', duty: 0.25, f: E4, sweep: { to: 0.25, t: 0.6, q: 1 / 30 }, env: { a: 0.008, d: 0.6, v: 0.06 }, lp: 1500 },
      ], max: 1, gap: 0.3,
    },
    respawn: {
      label: 'Ship returns', group: 'play', desc: 'your next ship comes in: a quick rise',
      layers: [{ wave: 'tri', f: E4, arp: { n: [0, 7, 12], step: 0.05 }, env: { a: 0.003, d: 0.2, v: 0.08 } }],
      max: 1, gap: 0.3,
    },
    win: {
      db: -1,
      label: 'THE BEACON BURNS', group: 'end', desc: 'the win: a bold climb and a held E with a slow burn under it',
      layers: [
        { wave: 'pulse', duty: 0.25, f: E4, arp: { n: [0, 4, 7, 12, 16], step: 0.08 }, env: { a: 0.003, d: 0.08, s: 0.6, h: 0.4, r: 0.4, v: 0.08 }, lp: 3000 },
        { wave: 'tri', f: hz('E2') * 2, at: 0.35, env: { a: 0.05, d: 0.5, s: 0.7, h: 1.2, r: 1.5, v: 0.2 } },
        { wave: 'tri', f: E3 * JI.fifth, at: 0.4, env: { a: 0.08, d: 0.5, s: 0.7, h: 1.1, r: 1.4, v: 0.09 } },
        { wave: 'pulse', duty: 0.5, f: E4, at: 0.4, lp: 1400, env: { a: 0.1, d: 0.5, s: 0.6, h: 1.0, r: 1.4, v: 0.035 } },
        { wave: 'pulse', duty: 0.25, f: E4 * JI.third, at: 0.45, lp: 1800, env: { a: 0.12, d: 0.5, s: 0.6, h: 1.0, r: 1.4, v: 0.025 } },
        { wave: 'noise', f: 700, lp: 900, at: 0.3, env: { a: 0.5, d: 1.8, v: 0.03 } },
      ], max: 1, gap: 2,
    },
  },
  cues: {
    Coin: (s) => s.play('coin'),
    Start: null, Hit: null, Miss: null, Bonus: null, Tick: null, Win: null, Die: null,
  },
  events: {
    go: (s) => { if (!s.st.went) { s.st.went = true; s.play('start'); } },
    fire: (s) => s.play('zap'),
    chip: (s, e) => s.play('chip', { pitch: 4 * (2 - e.ring) }),
    break: (s, e) => s.play('segBreak', { pitch: [7, 3, 0][e.ring] ?? 0 }),
    ringClear: (s) => s.play('ringClear'),
    formed: (s, e) => s.play('formed', { pitch: 4 * (2 - e.ring) }),
    shard: (s) => s.play('shardLaunch'),
    shardKill: (s) => s.play('shardKill'),
    light: (s, e) => s.play('lit', { pitch: penta(Math.max(0, e.n - 1)) }),
    die: (s) => s.play('shipDie'),
    shield: (s) => s.play('ward'),
    respawn: (s) => s.play('respawn'),
    clear: (s) => s.play('win'),
    out: (s) => s.play('die'),
    charge: null, fizzle: null, shardFade: null,
  },
  silent: {
    charge: 'the charge is a loop that follows core.charge (frame)',
    fizzle: 'a shot running out of range: nothing hit, nothing to hear',
    shardFade: 'a shard fading out (after a light, a death, or its time): the event that caused it has the sound',
  },
  frame(s, game) {
    const sim = game.sim, sh = sim.ship;
    s.drive('thrust', sh.alive && sim.phase !== 'card' ? sh.thrust : 0);
    let e = 0;
    sim.rings.forEach((r, i) => { let dead = 0; for (const q of r.segs) if (!q.alive) dead++; e += W[i] * dead / r.segs.length; });
    const lit = sim.phase === 'lit' ? 1 : 0;
    s.drive('coreDrone', Math.min(1, 0.08 + 0.92 * e + 0.5 * lit));
    s.bend('coreDrone', 200 * Math.min(2, sim.core.lit), 1.2);
    s.drive('charge', sim.phase === 'play' ? sim.core.charge : 0);
  },
};
