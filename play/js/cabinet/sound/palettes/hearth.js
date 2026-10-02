// THE CABINET'S SOUND · HEARTH (level 1, the cave at Göbekli Tepe; Berzerk-like). Key: D, low and warm.
// The fire is the instrument: soft crackles that thicken as it grows and a low bed under them; wood blips that climb with
// what you carry; the painted animals wake with a growl; BLAZE is a rising major arpeggio; the win is a warm held chord.
import { hz, JI, penta } from '../music.js';
import { cabinetVoice, ROOTS } from './cabinet.js';

const R = ROOTS.hearth, D2 = hz('D2'), D3 = hz('D3'), D4 = hz('D4');

export const HEARTH_SOUND = {
  id: 'hearth', title: 'HEARTH', root: R,
  mix: -0.5,                                          // dB: this game's trim, so the seven sit at about the same loudness (tools/sound_bots.mjs)
  personality: 'the fire: soft crackle that thickens as it grows, wood blips that climb, the animals waking with a growl, a warm low chord',
  sounds: {
    ...cabinetVoice(R),
    fireBed: {
      db: -4,
      loop: true, label: 'The fire (bed)', group: 'loop', drive: 'the fire (0 out .. 1 blaze)',
      desc: 'a low breath of the fire under everything; louder and a little brighter as it grows',
      attack: 0.8, release: 1.2, glide: 0.4,
      layers: [
        { wave: 'noise', f: [260, 700], lp: [220, 560], level: [0.012, 0.07] },
        { wave: 'tri', f: D2, level: [0.0, 0.035], span: [0.3, 1] },
      ],
    },
    crackle: {
      db: 6,
      label: 'Crackle', group: 'play', desc: 'a soft filtered tick of the fire (random; more of them as the fire grows)',
      layers: [{ wave: 'noise', f: 7000, env: { a: 0.001, d: 0.022, v: 0.07 }, lp: 2400 }],
      max: 2, gap: 0.025, vary: { pitch: 500, level: 0.5 },
    },
    pop: {
      db: 3,
      label: 'Crackle (a pop)', group: 'play', desc: 'now and then a lower, rounder pop in the fire',
      layers: [{ wave: 'noise', f: 2600, sweep: { to: 0.5, t: 0.05 }, env: { a: 0.001, d: 0.05, v: 0.08 }, lp: 1500 },
        { wave: 'tri', f: hz('A3'), sweep: { to: 0.6, t: 0.04 }, env: { a: 0.001, d: 0.04, v: 0.05 } }],
      max: 1, gap: 0.08, vary: { pitch: 300, level: 0.4 },
    },
    pickup: {
      db: 5.5,
      label: 'Wood / shard pickup', group: 'play', desc: 'a short wooden blip; each piece you carry sits a step higher',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('A4'), seq: [[0, 0], [0.035, 5]], env: { a: 0.002, d: 0.08, v: 0.1 }, lp: 2600 },
        { wave: 'tri', f: hz('A3'), env: { a: 0.002, d: 0.05, v: 0.08 } }],
      max: 2, gap: 0.05, vary: { pitch: 12 },
    },
    feed: {
      label: 'Feed the fire', group: 'play', desc: 'fuel dropped in: a whoosh up and a small rising arpeggio',
      layers: [
        { wave: 'noise', f: 1200, sweep: { to: 3, t: 0.28 }, lp: { f: 700, to: 2200, t: 0.28 }, env: { a: 0.04, d: 0.3, v: 0.07 } },
        { wave: 'tri', f: D4, arp: { n: [0, 4, 7], step: 0.06 }, env: { a: 0.004, d: 0.12, s: 0.5, h: 0.08, r: 0.12, v: 0.16 } },
        { wave: 'pulse', duty: 0.5, f: hz('D5'), arp: { n: [0, 4, 7], step: 0.06 }, env: { a: 0.004, d: 0.1, s: 0.4, h: 0.06, r: 0.1, v: 0.04 }, lp: 2400 },
      ], max: 2, gap: 0.1,
    },
    feedBig: {
      label: 'Feed the fire (3+ at once)', group: 'play', desc: 'several pieces at once (the multiplier): the arpeggio climbs higher',
      layers: [
        { wave: 'noise', f: 1200, sweep: { to: 3.5, t: 0.4 }, lp: { f: 700, to: 2600, t: 0.4 }, env: { a: 0.05, d: 0.45, v: 0.08 } },
        { wave: 'tri', f: D4, arp: { n: [0, 4, 7, 12, 16], step: 0.06 }, env: { a: 0.004, d: 0.12, s: 0.6, h: 0.22, r: 0.2, v: 0.16 } },
        { wave: 'pulse', duty: 0.25, f: hz('D5'), arp: { n: [0, 4, 7, 12, 16], step: 0.06 }, env: { a: 0.004, d: 0.1, s: 0.5, h: 0.2, r: 0.2, v: 0.045 }, lp: 2800 },
      ], max: 1, gap: 0.15,
    },
    ward: {
      label: 'Ward (push-back ring)', group: 'play', desc: 'A: the ring of light that pushes shades away (it costs a little fire)',
      layers: [
        { wave: 'pulse', duty: 0.5, f: hz('A4'), sweep: { to: 0.5, t: 0.24, q: 1 / 60 }, env: { a: 0.004, d: 0.28, v: 0.1 }, lp: 1800 },
        { wave: 'noise', f: 3000, sweep: { to: 0.3, t: 0.25 }, lp: 1300, env: { a: 0.01, d: 0.26, v: 0.06 } },
      ], max: 2, gap: 0.12,
    },
    wardHit: {
      label: 'Ward hits a shade', group: 'play', desc: 'the ring catches shades: a soft thud under the ward',
      layers: [
        { wave: 'tri', f: hz('A2'), sweep: { to: 0.55, t: 0.12 }, env: { a: 0.003, d: 0.16, v: 0.2 } },
        { wave: 'noise', f: 900, lp: 700, env: { a: 0.002, d: 0.09, v: 0.08 } },
      ], max: 1, gap: 0.12,
    },
    bite: {
      label: 'A shade bites the fire', group: 'play', desc: 'a shade reaches the fire: a hiss down and the fire\'s note dips',
      layers: [
        { wave: 'noise', f: 5000, sweep: { to: 0.25, t: 0.4 }, lp: { f: 2200, to: 450, t: 0.4 }, env: { a: 0.02, d: 0.45, v: 0.09 } },
        { wave: 'tri', f: D3, sweep: { to: 0.75, t: 0.3 }, env: { a: 0.01, d: 0.35, v: 0.12 } },
      ], max: 2, gap: 0.1,
    },
    knocked: {
      label: 'Knocked (fuel scatters)', group: 'play', desc: 'a shade touches you: a thump down and your fuel scatters',
      layers: [
        { wave: 'tri', f: hz('G3'), sweep: { to: 0.5, t: 0.15, q: 1 / 60 }, env: { a: 0.004, d: 0.2, v: 0.2 } },
        { wave: 'noise', f: 2000, lp: 1400, env: { a: 0.004, d: 0.12, v: 0.09 } },
      ], max: 1, gap: 0.2,
    },
    scatter: {
      label: 'Fuel scattering', group: 'play', desc: 'each dropped piece: a tiny click as it lands',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('E5'), sweep: { to: 0.7, t: 0.03 }, env: { a: 0.001, d: 0.04, v: 0.05 }, lp: 2600 }],
      max: 2, gap: 0.03, vary: { pitch: 150 },
    },
    shade: {
      label: 'A shade emerges', group: 'play', desc: 'out of a cave opening: a faint breath',
      layers: [{ wave: 'noise', f: 2200, sweep: { to: 0.6, t: 0.8 }, lp: 800, env: { a: 0.3, d: 0.6, v: 0.035 } }],
      max: 1, gap: 0.6,
    },
    wakeBull: {
      db: -4,
      label: 'The bull wakes', group: 'play', desc: 'the painted bull leaves the wall: a low growl sweeping up',
      layers: [
        { wave: 'tri', f: hz('A1'), sweep: { to: 1.5, t: 0.9 }, env: { a: 0.15, d: 0.3, s: 0.8, h: 0.4, r: 0.45, v: 0.26 }, vib: { rate: 17, depth: 55 } },
        { wave: 'noise', f: 380, lp: 340, env: { a: 0.2, d: 0.3, s: 0.8, h: 0.4, r: 0.4, v: 0.1 }, trem: { rate: 17, depth: 0.7 } },
        { wave: 'pulse', duty: 0.5, f: hz('A2'), sweep: { to: 1.5, t: 0.9 }, lp: 420, env: { a: 0.2, d: 0.3, s: 0.7, h: 0.4, r: 0.4, v: 0.05 } },
      ], max: 1, gap: 1,
    },
    wakeDeer: {
      db: -2,
      label: 'The deer wakes', group: 'play', desc: 'at blaze the deer wakes too: a lighter, higher call',
      layers: [
        { wave: 'tri', f: hz('A2'), sweep: { to: 1.5, t: 0.7 }, env: { a: 0.12, d: 0.3, s: 0.7, h: 0.3, r: 0.4, v: 0.18 }, vib: { rate: 11, depth: 35 } },
        { wave: 'pulse', duty: 0.125, f: hz('A5'), at: 0.5, env: { a: 0.02, d: 0.7, v: 0.03 }, lp: 2400, vib: { rate: 5, depth: 8 } },
      ], max: 1, gap: 1,
    },
    gore: {
      label: 'An animal gores a shade', group: 'play', desc: 'a charging animal breaks a shade: a short thump and a knock',
      layers: [
        { wave: 'noise', f: 1800, sweep: { to: 0.4, t: 0.12 }, lp: 1400, env: { a: 0.002, d: 0.14, v: 0.1 } },
        { wave: 'tri', f: hz('D3'), sweep: { to: 0.6, t: 0.1 }, env: { a: 0.002, d: 0.12, v: 0.14 } },
      ], max: 2, gap: 0.08,
    },
    blaze: {
      label: 'BLAZE', group: 'play', desc: 'the fire reaches blaze: a rising major arpeggio over the root',
      layers: [
        { wave: 'pulse', duty: 0.25, f: D4, arp: { n: [0, 4, 7, 12, 16, 19, 24], step: 0.055 }, env: { a: 0.003, d: 0.05, s: 0.6, h: 0.36, r: 0.3, v: 0.09 }, lp: 3000 },
        { wave: 'tri', f: D3, arp: { n: [0, 7, 12], step: 0.11 }, env: { a: 0.004, d: 0.2, s: 0.6, h: 0.2, r: 0.3, v: 0.18 } },
        { wave: 'noise', f: 1500, sweep: { to: 2, t: 0.4 }, lp: 1400, env: { a: 0.1, d: 0.4, v: 0.04 } },
      ], max: 1, gap: 1,
    },
    overtime: {
      label: 'Overtime', group: 'play', desc: 'the minute is up and the fire is not at blaze: a held, uneasy note',
      layers: [
        { wave: 'pulse', duty: 0.125, f: hz('A3'), env: { a: 0.05, d: 0.1, s: 0.8, h: 0.45, r: 0.35, v: 0.07 }, vib: { rate: 5, depth: 22 }, lp: 1600 },
        { wave: 'tri', f: hz('A2'), env: { a: 0.05, d: 0.1, s: 0.8, h: 0.45, r: 0.35, v: 0.13 } },
      ], max: 1, gap: 1,
    },
    tick: {
      label: 'The last seconds', group: 'play', desc: 'the minute\'s last five seconds: a soft woodblock tick',
      layers: [{ wave: 'tri', f: hz('A5'), env: { a: 0.001, d: 0.035, v: 0.08 } }, { wave: 'noise', f: 9000, lp: 2600, env: { a: 0.001, d: 0.012, v: 0.035 } }],
      max: 1, gap: 0.4,
    },
    win: {
      db: 3.5,
      label: 'THE HEARTH HOLDS', group: 'end', desc: 'the win: up the chord, then a warm held D (triangle-heavy, low)',
      layers: [
        { wave: 'pulse', duty: 0.25, f: D3, arp: { n: [0, 4, 7, 12, 16], step: 0.09 }, env: { a: 0.004, d: 0.08, s: 0.5, h: 0.3, r: 0.2, v: 0.08 }, lp: 2400 },
        { wave: 'tri', f: D3, at: 0.45, env: { a: 0.06, d: 0.5, s: 0.7, h: 1.1, r: 1.6, v: 0.2 } },
        { wave: 'tri', f: D3 * JI.fifth, at: 0.45, env: { a: 0.08, d: 0.5, s: 0.7, h: 1.1, r: 1.6, v: 0.1 } },
        { wave: 'pulse', duty: 0.5, f: D4, at: 0.45, lp: 1400, env: { a: 0.1, d: 0.5, s: 0.6, h: 1.0, r: 1.5, v: 0.04 } },
        { wave: 'pulse', duty: 0.25, f: D4 * JI.third, at: 0.5, lp: 1800, env: { a: 0.12, d: 0.5, s: 0.6, h: 1.0, r: 1.5, v: 0.025 }, vib: { rate: 5, depth: 6, at: 0.4, fade: 0.4 } },
      ], max: 1, gap: 2,
    },
  },
  cues: {
    Coin: (s) => s.play('coin'), Start: (s) => s.play('start'),
    Tick: (s) => s.play('tick'),
    Hit: null, Miss: null, Bonus: null, Win: null, Die: null,   // (the round's own events carry these, more exactly)
  },
  events: {
    pickup: (s, e, g) => s.play('pickup', { pitch: penta(Math.max(0, (g.sim?.player?.carry?.length ?? 1) - 1)) }),
    feed: (s, e) => s.play(e.n >= 3 ? 'feedBig' : 'feed', { pitch: e.n >= 3 ? 0 : penta(Math.min(e.n, 2) - 1) }),
    ward: (s, e) => { s.play('ward'); if (e.hits > 0) s.play('wardHit'); },
    bite: (s) => s.play('bite'),
    knocked: (s, e) => { s.play('knocked'); for (let i = 0; i < Math.min(5, e.lost || 0); i++) s.play('scatter', { delay: 0.06 + i * 0.05, pitch: -i }); },
    shade: (s) => s.play('shade'),
    wake: (s, e) => s.play(e.who === 'deer' ? 'wakeDeer' : 'wakeBull'),
    gore: (s) => s.play('gore'),
    blaze: (s) => s.play('blaze'),
    overtime: (s) => s.play('overtime'),
    clear: (s) => s.play('win'),
    out: (s) => s.play('die'),
  },
  silent: {},
  frame(s, game, dt) {
    const sim = game.sim;
    const fire = sim.phase === 'card' ? (sim.result === 2 ? 1 : 0) : sim.fire;
    s.drive('fireBed', fire);
    const rate = sim.phase === 'play' ? 1.2 + 9 * fire * fire : sim.phase === 'ready' ? 1.5 : 0;
    if (s.rand() < rate * dt) s.play(s.rand() < 0.18 ? 'pop' : 'crackle');
  },
};
