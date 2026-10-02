// THE CABINET'S SOUND · STARVECTOR (the super-scaler on THE JUNCTION's floor). Key: C, bold and bright: the hardest machine in the room.
// Chip synthesis only (pulse / triangle / LFSR noise through the cabinet's chain): a thin zap for the twin guns, a soft engine
// hum under everything, noise bursts for the rocks and the fighters, a whoosh for the barrel roll, a bell for each act, and a
// bigger bell for each symbol (the circle, the triangle, the square climb a triad). The freeze is a long held chord that fades
// out under the initials. It reads game.events (the sim's own events: sim.events) and never writes to the game.
import { hz, JI, penta } from '../music.js';
import { cabinetVoice } from './cabinet.js';
import { musicFrame, duckMusic, stopMusic, holdMusic } from './starvector_music.js';

const R = hz('C4'), C2 = hz('C2'), C3 = hz('C3'), C5 = hz('C5'), E5 = hz('E5'), G4 = hz('G4'), G5 = hz('G5'), C6 = hz('C6');

export const STARVECTOR_SOUND = {
  id: 'starvector', title: 'STARVECTOR', root: R,
  mix: 2,
  personality: 'a bright super-scaler: twin zaps, an engine hum, bursts and a whoosh, a bell for each act and each symbol, a held chord at the freeze',
  sounds: {
    ...cabinetVoice(R),
    zap: {
      db: 3, label: 'The twin guns', group: 'play', desc: 'FIRE: a thin, fast zap down (two guns, so it is short and bright)',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('C6'), sweep: { to: 0.28, t: 0.07, q: 1 / 120 }, env: { a: 0.001, d: 0.075, v: 0.05 }, lp: 3600 },
        { wave: 'tri', f: hz('G4'), sweep: { to: 0.5, t: 0.05 }, env: { a: 0.001, d: 0.04, v: 0.03 } }],
      max: 2, gap: 0.05, vary: { pitch: 60, level: 0.12, time: 0.006 },
    },
    boom: {
      db: 4, label: 'A rock or a fighter bursts', group: 'play', desc: 'a short noise burst falling away, with a low thud',
      layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.18, t: 0.3 }, lp: { f: 3000, to: 500, t: 0.3 }, env: { a: 0.002, d: 0.32, v: 0.12 } },
        { wave: 'tri', f: hz('G2'), sweep: { to: 0.5, t: 0.2 }, env: { a: 0.002, d: 0.2, v: 0.14 } }],
      max: 3, gap: 0.04, vary: { pitch: 90, level: 0.15, time: 0.01 },
    },
    boomBig: {
      db: 4, label: 'A big rock breaks', group: 'play', desc: 'a longer, deeper burst',
      layers: [{ wave: 'noise', f: 4200, sweep: { to: 0.1, t: 0.6 }, lp: { f: 2400, to: 260, t: 0.6 }, env: { a: 0.004, d: 0.62, v: 0.16 } },
        { wave: 'tri', f: hz('E2'), sweep: { to: 0.4, t: 0.4 }, env: { a: 0.004, d: 0.4, v: 0.2 } }],
      max: 2, gap: 0.08,
    },
    ping: {
      db: 3, label: 'A shot lands, it holds', group: 'play', desc: 'a small metallic tick',
      layers: [{ wave: 'metal', f: 16000, env: { a: 0.001, d: 0.04, v: 0.05 }, lp: 2800 }, { wave: 'tri', f: hz('B5'), env: { a: 0.001, d: 0.03, v: 0.03 } }],
      max: 3, gap: 0.03, vary: { pitch: 80, level: 0.2, time: 0.005 },
    },
    enemyFire: {
      db: 1, label: 'An enemy gun', group: 'play', desc: 'a low warbling pop (red shots are coming)',
      layers: [{ wave: 'pulse', duty: 0.5, f: hz('G3'), sweep: { to: 0.55, t: 0.16, q: 1 / 60 }, env: { a: 0.003, d: 0.18, v: 0.05 }, lp: 1800, vib: { rate: 22, depth: 60 } }],
      max: 2, gap: 0.08, vary: { pitch: 120, level: 0.12 },
    },
    roll: {
      db: 3, label: 'The barrel roll', group: 'play', desc: 'a whoosh: noise sweeping up and over, a triangle riding it',
      layers: [{ wave: 'noise', f: 900, sweep: { to: 4, t: 0.3 }, lp: { f: 900, to: 4200, t: 0.3 }, env: { a: 0.02, d: 0.5, s: 0.4, h: 0.1, r: 0.2, v: 0.09 } },
        { wave: 'tri', f: hz('C4'), seq: [[0, 0], [0.12, 7], [0.26, 12], [0.4, 19]], env: { a: 0.01, d: 0.1, s: 0.7, h: 0.3, r: 0.2, v: 0.06 } }],
      max: 1, gap: 0.4,
    },
    near: {
      db: 3, label: 'A close one', group: 'play', desc: 'a tiny rising blip: something grazed past while you rolled',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('G5'), sweep: { to: 1.5, t: 0.05 }, env: { a: 0.001, d: 0.06, v: 0.04 }, lp: 3400 }],
      max: 1, gap: 0.15,
    },
    lava: {
      db: 2, label: 'A lava burst', group: 'play', desc: 'a low roar rising',
      layers: [{ wave: 'noise', f: 400, lp: { f: 300, to: 900, t: 0.5 }, env: { a: 0.2, d: 0.7, v: 0.08 } }, { wave: 'tri', f: hz('C2'), sweep: { to: 1.5, t: 0.5 }, env: { a: 0.1, d: 0.6, v: 0.12 } }],
      max: 2, gap: 0.3,
    },
    chime: {
      db: 0, label: 'The act begins', group: 'play', desc: 'a bell for each act (a rising triad: C, E, G), and the title card',
      layers: [{ wave: 'tri', f: C5, env: { a: 0.004, d: 1.4, v: 0.18 } }, { wave: 'tri', f: C5 * JI.fifth, env: { a: 0.006, d: 1.1, v: 0.08 } },
        { wave: 'pulse', duty: 0.125, f: C6, arp: { n: [0, 4, 7, 12], step: 0.07 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.2, r: 0.3, v: 0.04 }, lp: 3000 }],
      max: 1, gap: 1,
    },
    symbol: {
      db: -1, label: 'A symbol lights', group: 'end', desc: 'a big bell and a climb: the circle, the triangle, the square, each a step higher',
      layers: [
        { wave: 'tri', f: C3, env: { a: 0.006, d: 2.2, v: 0.22 } },
        { wave: 'tri', f: C3 * JI.fifth, env: { a: 0.006, d: 1.8, v: 0.1 } },
        { wave: 'pulse', duty: 0.25, f: C5 * JI.third, lp: 2400, env: { a: 0.006, d: 1.4, v: 0.04 } },
        { wave: 'pulse', duty: 0.125, f: C5, arp: { n: [0, 4, 7, 12, 16, 19], step: 0.07 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.3, r: 0.4, v: 0.05 }, lp: 3200 },
        { wave: 'noise', f: 1500, sweep: { to: 2, t: 0.7 }, lp: 1500, env: { a: 0.2, d: 0.7, v: 0.03 } },
      ], max: 1, gap: 1,
    },
    pass: {
      db: 1, label: 'Through a gate', group: 'play', desc: 'a soft rising two-note chime as a frame passes you',
      layers: [{ wave: 'tri', f: G4, seq: [[0, 0], [0.07, 5]], env: { a: 0.003, d: 0.4, v: 0.12 } }, { wave: 'pulse', duty: 0.125, f: G5, at: 0.05, env: { a: 0.002, d: 0.25, v: 0.04 }, lp: 3000 }],
      max: 2, gap: 0.2,
    },
    respawn: {
      label: 'A new ship', group: 'play', desc: 'your next ship comes in: a quick rise',
      layers: [{ wave: 'tri', f: hz('C4'), arp: { n: [0, 7, 12], step: 0.05 }, env: { a: 0.003, d: 0.2, v: 0.09 } }],
      max: 1, gap: 0.3,
    },
    freeze: {
      db: -2, label: 'The image freezes', group: 'end', desc: 'a long held chord that swells, then thins away under the initials',
      layers: [
        { wave: 'tri', f: C2 * 2, env: { a: 0.08, d: 0.6, s: 0.8, h: 2.4, r: 2.6, v: 0.24 } },
        { wave: 'tri', f: C3 * JI.fifth, at: 0.05, env: { a: 0.1, d: 0.6, s: 0.8, h: 2.2, r: 2.4, v: 0.12 } },
        { wave: 'pulse', duty: 0.5, f: C5, at: 0.1, lp: 1400, env: { a: 0.15, d: 0.6, s: 0.6, h: 2.0, r: 2.2, v: 0.04 } },
        { wave: 'pulse', duty: 0.25, f: C5 * JI.third, at: 0.15, lp: 1800, env: { a: 0.18, d: 0.6, s: 0.6, h: 1.8, r: 2.0, v: 0.03 } },
        { wave: 'noise', f: 800, lp: 900, env: { a: 0.4, d: 2.0, v: 0.03 } },
      ], max: 1, gap: 4,
    },

    // ---------------------------------------------------------------- the fight pass: combos, the shield, the bosses
    chainBoom: {
      db: 5, label: 'A chained blast', group: 'play', desc: 'a fat boom with a crackle tail: the missile blast takes the next one with it',
      layers: [{ wave: 'noise', f: 4500, sweep: { to: 0.12, t: 0.5 }, lp: { f: 3200, to: 300, t: 0.5 }, env: { a: 0.002, d: 0.55, v: 0.16 } },
        { wave: 'tri', f: hz('D2'), sweep: { to: 0.4, t: 0.35 }, env: { a: 0.002, d: 0.38, v: 0.22 } },
        { wave: 'metal', f: 6000, sweep: { to: 0.3, t: 0.3 }, lp: 2400, env: { a: 0.003, d: 0.3, v: 0.05 } }],
      max: 3, gap: 0.05, vary: { pitch: 120, level: 0.12, time: 0.01 },
    },
    combo: {
      db: 1, label: 'The multiplier rises', group: 'play', desc: 'a quick two-note rising blip (higher with each multiplier)',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('E5'), seq: [[0, 0], [0.05, 5]], env: { a: 0.001, d: 0.14, v: 0.05 }, lp: 3300 }, { wave: 'tri', f: hz('E4'), seq: [[0, 0], [0.05, 5]], env: { a: 0.001, d: 0.12, v: 0.05 } }],
      max: 1, gap: 0.08,
    },
    formation: {
      db: 1, label: 'FORMATION bonus', group: 'play', desc: 'a bright rising arpeggio: the whole squadron is down',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('C5'), arp: { n: [0, 4, 7, 12, 16], step: 0.055 }, env: { a: 0.002, d: 0.12, s: 0.5, h: 0.2, r: 0.2, v: 0.06 }, lp: 3300 },
        { wave: 'tri', f: hz('C3'), env: { a: 0.004, d: 0.5, v: 0.12 } }],
      max: 1, gap: 0.3,
    },
    crackle: {
      db: 3, label: 'The shield takes a hit', group: 'play', desc: 'an electric crackle: noise bursts over a falling buzz',
      layers: [{ wave: 'noise', f: 7000, lp: { f: 5000, to: 1200, t: 0.3 }, env: { a: 0.001, d: 0.3, v: 0.12 }, trem: { rate: 40, depth: 0.9 } },
        { wave: 'metal', f: 5000, sweep: { to: 0.25, t: 0.25 }, lp: 3000, env: { a: 0.001, d: 0.25, v: 0.06 } },
        { wave: 'pulse', duty: 0.125, f: hz('A4'), sweep: { to: 0.4, t: 0.2 }, env: { a: 0.001, d: 0.2, v: 0.06 }, lp: 2800, vib: { rate: 35, depth: 200 } }],
      max: 1, gap: 0.2,
    },
    shieldUp: {
      db: 0, label: 'The shield is back', group: 'play', desc: 'a soft rising chime',
      layers: [{ wave: 'tri', f: hz('G4'), seq: [[0, 0], [0.09, 4], [0.18, 7]], env: { a: 0.005, d: 0.5, v: 0.1 } }, { wave: 'pulse', duty: 0.125, f: hz('G5'), at: 0.18, env: { a: 0.002, d: 0.3, v: 0.03 }, lp: 3000 }],
      max: 1, gap: 0.5,
    },
    siren: {
      db: 1, label: 'WARNING', group: 'play', desc: 'a two-tone alarm for the boss: about 2.4 seconds',
      layers: [{ wave: 'pulse', duty: 0.5, f: hz('A4'), seq: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i * 0.3, i % 2 ? -4 : 0]), env: { a: 0.02, d: 0.1, s: 0.85, h: 2.2, r: 0.15, v: 0.07 }, lp: 2000 },
        { wave: 'tri', f: hz('A2'), seq: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i * 0.3, i % 2 ? -4 : 0]), env: { a: 0.02, d: 0.1, s: 0.9, h: 2.2, r: 0.15, v: 0.1 } }],
      max: 1, gap: 2,
    },
    bossArrive: {
      db: 4, label: 'The boss lands', group: 'play', desc: 'a huge thud and a rumbling roar',
      layers: [{ wave: 'tri', f: hz('A1'), sweep: { to: 0.5, t: 0.9 }, env: { a: 0.004, d: 1.1, v: 0.28 } },
        { wave: 'noise', f: 1800, sweep: { to: 0.15, t: 1.1 }, lp: { f: 1400, to: 150, t: 1.1 }, env: { a: 0.01, d: 1.2, v: 0.16 } },
        { wave: 'pulse', duty: 0.5, f: hz('E2'), sweep: { to: 0.7, t: 0.8 }, lp: 700, vib: { rate: 14, depth: 90 }, env: { a: 0.05, d: 0.9, v: 0.06 } }],
      max: 1, gap: 1,
    },
    teleCharge: {
      db: 2, label: 'Telegraph: a weapon charges', group: 'play', desc: 'a pulse rising to a high whine (volley, ring, beams, mines)',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('C4'), sweep: { to: 4, t: 0.9, curve: 'lin' }, env: { a: 0.05, d: 1.0, s: 0.8, h: 0.1, r: 0.05, v: 0.06 }, lp: 3000, vib: { rate: 12, depth: 40 } },
        { wave: 'tri', f: hz('C3'), sweep: { to: 3, t: 0.9 }, env: { a: 0.05, d: 0.95, s: 0.8, v: 0.07 } }],
      max: 1, gap: 0.4,
    },
    teleHiss: {
      db: 2, label: 'Telegraph: a hiss', group: 'play', desc: 'noise opening up: lava gathers (spit, eruption)',
      layers: [{ wave: 'noise', f: 2500, lp: { f: 500, to: 4500, t: 0.7 }, env: { a: 0.1, d: 0.75, s: 0.9, v: 0.1 } }, { wave: 'tri', f: hz('E2'), sweep: { to: 1.6, t: 0.6 }, env: { a: 0.05, d: 0.7, v: 0.07 } }],
      max: 1, gap: 0.4,
    },
    teleRumble: {
      db: 3, label: 'Telegraph: the ground shakes', group: 'play', desc: 'a low rumble swelling (the stone slams and throws)',
      layers: [{ wave: 'tri', f: hz('C2'), env: { a: 0.3, d: 1.2, s: 0.8, v: 0.18 }, vib: { rate: 9, depth: 80 } }, { wave: 'noise', f: 500, lp: { f: 250, to: 800, t: 1.0 }, env: { a: 0.3, d: 1.1, s: 0.8, v: 0.1 } }],
      max: 1, gap: 0.4,
    },
    teleWhoosh: {
      db: 2, label: 'Telegraph: a low whoosh', group: 'play', desc: 'a long breath sliding down (the tail sweeps, the head rears)',
      layers: [{ wave: 'noise', f: 1200, lp: { f: 3000, to: 400, t: 1.0 }, env: { a: 0.2, d: 1.0, s: 0.7, v: 0.1 } }, { wave: 'tri', f: hz('A3'), sweep: { to: 0.4, t: 1.0 }, env: { a: 0.1, d: 1.0, v: 0.08 } }],
      max: 1, gap: 0.4,
    },
    fireBlast: {
      db: 3, label: 'Boss attack: a blast', group: 'play', desc: 'a punchy noise crack with a falling zap',
      layers: [{ wave: 'noise', f: 6000, sweep: { to: 0.2, t: 0.2 }, lp: 3500, env: { a: 0.001, d: 0.2, v: 0.12 } }, { wave: 'pulse', duty: 0.25, f: hz('G5'), sweep: { to: 0.15, t: 0.18 }, env: { a: 0.001, d: 0.18, v: 0.06 }, lp: 3200 }],
      max: 2, gap: 0.1,
    },
    fireBeam: {
      db: 3, label: 'Boss attack: a beam', group: 'play', desc: 'a hard buzzing blast held for half a second',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('A3'), env: { a: 0.005, d: 0.1, s: 0.9, h: 0.45, r: 0.12, v: 0.09 }, lp: 2600, vib: { rate: 30, depth: 60 } },
        { wave: 'noise', f: 5000, lp: 3000, env: { a: 0.005, d: 0.1, s: 0.8, h: 0.45, r: 0.12, v: 0.08 } }, { wave: 'tri', f: hz('A2'), env: { a: 0.005, d: 0.1, s: 0.9, h: 0.45, r: 0.12, v: 0.12 } }],
      max: 1, gap: 0.3,
    },
    fireSpit: {
      db: 3, label: 'Boss attack: a spit', group: 'play', desc: 'a wet pop and a bubbling drop',
      layers: [{ wave: 'noise', f: 1800, sweep: { to: 0.3, t: 0.2 }, lp: { f: 2000, to: 500, t: 0.2 }, env: { a: 0.002, d: 0.22, v: 0.12 } }, { wave: 'tri', f: hz('A3'), sweep: { to: 0.35, t: 0.2 }, env: { a: 0.002, d: 0.22, v: 0.14 }, vib: { rate: 24, depth: 120 } }],
      max: 2, gap: 0.1,
    },
    fireSlam: {
      db: 5, label: 'Boss attack: a slam', group: 'play', desc: 'a heavy thud and a stone crack',
      layers: [{ wave: 'tri', f: hz('E2'), sweep: { to: 0.35, t: 0.4 }, env: { a: 0.002, d: 0.5, v: 0.28 } }, { wave: 'noise', f: 3000, sweep: { to: 0.15, t: 0.35 }, lp: { f: 2500, to: 250, t: 0.35 }, env: { a: 0.002, d: 0.4, v: 0.16 } }, { wave: 'metal', f: 4000, sweep: { to: 0.3, t: 0.2 }, lp: 2000, env: { a: 0.002, d: 0.2, v: 0.05 } }],
      max: 1, gap: 0.3,
    },
    fireSweep: {
      db: 3, label: 'Boss attack: a sweep', group: 'play', desc: 'a fast whip-crack whoosh',
      layers: [{ wave: 'noise', f: 1500, sweep: { to: 4, t: 0.2 }, lp: { f: 1000, to: 5000, t: 0.2 }, env: { a: 0.005, d: 0.4, v: 0.13 } }, { wave: 'tri', f: hz('A3'), sweep: { to: 0.3, t: 0.4 }, env: { a: 0.002, d: 0.4, v: 0.1 } }],
      max: 1, gap: 0.3,
    },
    clank: {
      db: 2, label: 'A shot rings off armour', group: 'play', desc: 'a hard metallic clank',
      layers: [{ wave: 'metal', f: 9000, sweep: { to: 0.5, t: 0.06 }, env: { a: 0.001, d: 0.07, v: 0.07 }, lp: 3000 }, { wave: 'pulse', duty: 0.5, f: hz('E5'), env: { a: 0.001, d: 0.05, v: 0.03 }, lp: 3000 }],
      max: 2, gap: 0.07, vary: { pitch: 150, level: 0.15 },
    },
    hitTick: {
      db: 3, label: 'A shot lands on the boss', group: 'play', desc: 'a meatier thump-tick ',
      layers: [{ wave: 'noise', f: 3500, sweep: { to: 0.3, t: 0.07 }, lp: 2400, env: { a: 0.001, d: 0.08, v: 0.1 } }, { wave: 'tri', f: hz('A3'), sweep: { to: 0.5, t: 0.07 }, env: { a: 0.001, d: 0.08, v: 0.12 } }],
      max: 2, gap: 0.07, vary: { pitch: 100, level: 0.12 },
    },
    crunch: {
      db: 5, label: 'A part is shot off', group: 'play', desc: 'a big crunching explosion with a metal rattle',
      layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.1, t: 0.7 }, lp: { f: 3200, to: 250, t: 0.7 }, env: { a: 0.002, d: 0.75, v: 0.18 } }, { wave: 'tri', f: hz('F2'), sweep: { to: 0.35, t: 0.5 }, env: { a: 0.002, d: 0.55, v: 0.26 } },
        { wave: 'metal', f: 7000, sweep: { to: 0.3, t: 0.4 }, lp: 2600, env: { a: 0.003, d: 0.4, v: 0.07 }, vib: { rate: 22, depth: 150 } }],
      max: 2, gap: 0.1,
    },
    roar: {
      db: 4, label: 'The boss changes phase', group: 'play', desc: 'a falling growl and a sting',
      layers: [{ wave: 'tri', f: hz('G2'), sweep: { to: 0.5, t: 0.9 }, env: { a: 0.01, d: 1.0, v: 0.24 }, vib: { rate: 20, depth: 140 } }, { wave: 'noise', f: 1600, lp: { f: 1500, to: 200, t: 0.9 }, env: { a: 0.02, d: 1.0, v: 0.12 } },
        { wave: 'pulse', duty: 0.125, f: hz('E5'), arp: { n: [0, -1, -5, -6], step: 0.1 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.2, r: 0.2, v: 0.05 }, lp: 3000 }],
      max: 1, gap: 1,
    },
    bossDeath: {
      db: 5, label: 'The boss begins to die', group: 'play', desc: 'a long descending explosion',
      layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.05, t: 2.2 }, lp: { f: 4000, to: 100, t: 2.2 }, env: { a: 0.01, d: 2.3, v: 0.2 } }, { wave: 'tri', f: hz('C3'), sweep: { to: 0.2, t: 2.0 }, env: { a: 0.005, d: 2.1, v: 0.26 }, vib: { rate: 8, depth: 60 } }],
      max: 1, gap: 1,
    },
    bossBoom: {
      db: 4, label: 'A chained death blast', group: 'play', desc: 'a short boom; bigger blasts fall lower (pitch from the size)',
      layers: [{ wave: 'noise', f: 4800, sweep: { to: 0.15, t: 0.35 }, lp: { f: 3000, to: 400, t: 0.35 }, env: { a: 0.002, d: 0.38, v: 0.14 } }, { wave: 'tri', f: hz('A2'), sweep: { to: 0.4, t: 0.25 }, env: { a: 0.002, d: 0.28, v: 0.2 } }],
      max: 3, gap: 0.06, vary: { pitch: 150, level: 0.15, time: 0.008 },
    },
    bossGone: {
      db: 6, label: 'The boss is gone', group: 'play', desc: 'one final enormous boom',
      layers: [{ wave: 'noise', f: 5500, sweep: { to: 0.06, t: 1.6 }, lp: { f: 4500, to: 120, t: 1.6 }, env: { a: 0.002, d: 1.7, v: 0.24 } }, { wave: 'tri', f: hz('D2'), sweep: { to: 0.3, t: 1.2 }, env: { a: 0.002, d: 1.3, v: 0.3 } },
        { wave: 'metal', f: 6000, sweep: { to: 0.2, t: 0.8 }, lp: 2400, env: { a: 0.003, d: 0.8, v: 0.06 } }],
      max: 1, gap: 2,
    },
    victory: {
      db: 0, label: 'Victory sting', group: 'play', desc: 'a short bright major fanfare after the boss',
      layers: [{ wave: 'pulse', duty: 0.25, f: hz('C5'), arp: { n: [0, 4, 7, 12, 7, 12, 16], step: 0.09 }, env: { a: 0.003, d: 0.1, s: 0.6, h: 0.5, r: 0.5, v: 0.06 }, lp: 3300 },
        { wave: 'tri', f: hz('C3'), env: { a: 0.01, d: 1.4, v: 0.14 } }, { wave: 'tri', f: hz('G3'), at: 0.2, env: { a: 0.01, d: 1.2, v: 0.08 } }],
      max: 1, gap: 2,
    },
    engine: {
      db: -8, loop: true, label: 'The engine', group: 'loop', drive: 'throttle (0 .. 1: more as you bank and dive)',
      desc: 'a soft hum under the whole flight, rising with the speed of the act', attack: 0.4, release: 0.5, glide: 0.2,
      layers: [
        { wave: 'tri', f: [C2, hz('E2')], level: [0.05, 0.1] },
        { wave: 'noise', f: 600, lp: [300, 1100], level: [0.012, 0.04] },
        { wave: 'pulse', duty: 0.5, f: [C3, hz('G3')], lp: [380, 900], level: [0.004, 0.02] },
      ],
    },
    light: {
      db: -10, loop: true, label: 'The little light', group: 'loop', drive: 'near (0 .. 1)',
      desc: 'Act III: a faint, warm shimmer that follows the little light ahead', attack: 1.2, release: 1.2, glide: 0.5,
      layers: [{ wave: 'tri', f: [hz('G4'), hz('C5')], level: [0.0, 0.03], trem: { rate: 5, depth: 0.4 } }],
    },
  },
  cues: { Coin: (s) => s.play('coin'), Start: null, Hit: null, Miss: null, Bonus: null, Tick: null, Win: null, Die: null },
  events: {
    start: (s) => { if (!s.st.went) { s.st.went = true; s.play('start'); } },
    card: null,
    chime: (s, e) => s.play('chime', { pitch: [0, 0, 4, 7][e.act] || 0 }),
    fire: (s) => s.play('zap'),
    boom: (s, e) => { s.play(e.big ? 'boomBig' : 'boom'); if (e.big) duckMusic(s, 0.5); },
    ping: (s) => s.play('ping'),
    enemyFire: (s) => s.play('enemyFire'),
    roll: (s) => s.play('roll'),
    near: (s, e) => s.play('near', { pitch: e && e.big ? 5 : 0 }),
    lava: (s) => s.play('lava'),
    shield: (s) => { s.play('crackle'); s.play('ward', { level: 0.6 }); duckMusic(s); },
    shieldUp: (s) => s.play('shieldUp'),
    die: (s) => { s.play('lifeLost'); duckMusic(s, 0.25); },
    respawn: (s) => s.play('respawn'),
    pass: (s) => s.play('pass'),
    symbol: (s, e) => { s.play('symbol', { pitch: [0, 0, 4, 7][e.n] || 0 }); duckMusic(s, 0.2); },
    freeze: (s) => { s.play('freeze'); s.stop('engine', 1.4); s.stop('light', 1.2); stopMusic(s); },
    out: (s) => s.play('die'),
    chain: (s, e) => { const n = Math.min(3, (e.n | 0) || 1); for (let i = 0; i < n; i++) s.play('chainBoom', { delay: 0.04 + i * 0.07, pitch: -i }); },
    combo: (s, e) => s.play('combo', { pitch: ((e.mult | 0) - 2) * 2 }),
    formation: (s) => s.play('formation'),
    bossWarn: (s) => { s.play('siren'); duckMusic(s, 0.2); },
    bossArrive: (s) => { s.play('bossArrive'); duckMusic(s, 0.25); },
    bossAtk: (s, e) => {
      const n = e.name;
      if (e.stage === 'tele') {
        if (/^(volley|ring|beam|beam2|mines)$/.test(n)) s.play('teleCharge');
        else if (/^(spit|erupt)$/.test(n)) s.play('teleHiss');
        else if (/^(slam|slam2|shards|shards2)$/.test(n)) s.play('teleRumble');
        else s.play('teleWhoosh');
      } else if (/^(beam|beam2)$/.test(n)) s.play('fireBeam');
      else if (/^(spit|erupt)$/.test(n)) s.play('fireSpit');
      else if (/^(slam|slam2)$/.test(n)) s.play('fireSlam');
      else if (/^(sweep|sweep2|lunge)$/.test(n)) s.play('fireSweep');
      else s.play('fireBlast');
    },
    bossHit: (s, e) => { if (e.armored) s.play('clank'); else s.play('hitTick', { level: e.missile ? 1.4 : 1, pitch: e.missile ? -4 : 0 }); },
    partBreak: (s, e) => { s.play('crunch', { pitch: e.main ? -3 : 0, level: e.main ? 1.3 : 1 }); duckMusic(s, 0.3); },
    bossPhase: (s) => { s.play('roar'); duckMusic(s, 0.25); },
    bossDie: (s) => { s.play('bossDeath'); duckMusic(s, 0.1); },
    bossBoom: (s, e) => s.play('bossBoom', { pitch: -Math.min(8, ((e.size || 1) - 0.8) * 3) }),
    bossGone: (s) => { s.play('bossGone'); s.play('victory', { delay: 1.3 }); holdMusic(s, 2.8); },
  },
  silent: { card: 'the act\'s title card: the bell (chime) is its sound, and the first act has the start call' },
  frame(s, game) {
    const sim = game.sim; if (!sim || sim.frozen) return;
    const throttle = sim.ship.alive ? 0.35 + 0.25 * Math.min(1, Math.abs(sim.ship.bank) + Math.abs(sim.ship.pitch)) + (sim.act - 1) * 0.12 : 0;
    s.drive('engine', throttle);
    s.drive('light', sim.act === 3 && sim.light ? 1 : 0);
    musicFrame(s, game);
  },
  end(s) { stopMusic(s); },
};
