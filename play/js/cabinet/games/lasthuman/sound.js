// THE CABINET'S SOUND · LAST HUMAN (Ember Arcade, 1983, on THE JUNCTION's floor). Key: A minor, low and hard: the machines
// have the floor and you are the last one with a gun. Chip synthesis only (js/cabinet/sound/chip.js), built on the floor's
// stock voice (palettes/floor.js): the cabinet family in A, plus the arena's own sounds:
//   the gun is a dry, quiet rattle (it fires twelve times a second, so it stays small); drones pop, the big machines burst;
//   a shot off a crusher clanks; a rescue is a chime that climbs a step with every link of the chain; a crushed human is a
//   crunch and a falling sigh; a cortex turning someone warbles for exactly as long as you have to stop it; mites buzz in;
//   shells ping off the walls; each wave has its card jingle (a step higher every wave); the tally counts in coin-blips.
//   THE MAINFRAME: a siren on its card, a low hum while it lives (rising when it rages), a whine as a gun pod charges, a
//   clank on its armour, a meaty thump on the core, a crunch for each pod, a long fall and one huge boom when it goes.
// It reads game.events (the sim's own: round.js _emit) and never writes to the game.
import { hz, JI } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('A3');
const A2 = hz('A2'), A4 = hz('A4'), E4 = hz('E4'), E5 = hz('E5'), C5 = hz('C5'), A5 = hz('A5');

const sounds = {
    zap: {
        db: 0, label: 'The gun', group: 'play', desc: 'FIRE: a dry, quiet tick-zap (twelve a second while A is held, so it stays small)',
        layers: [{ wave: 'pulse', duty: 0.25, f: A5, sweep: { to: 0.35, t: 0.045, q: 1 / 120 }, env: { a: 0.001, d: 0.045, v: 0.028 }, lp: 3000 },
            { wave: 'noise', f: 9000, env: { a: 0.001, d: 0.012, v: 0.012 }, lp: 3000 }],
        max: 2, gap: 0.07, vary: { pitch: 60, level: 0.15, time: 0.004 },
    },
    pop: {
        db: 2, label: 'A drone bursts', group: 'play', desc: 'a short noise pop over a soft low thud',
        layers: [{ wave: 'noise', f: 5200, sweep: { to: 0.2, t: 0.16 }, lp: { f: 3200, to: 700, t: 0.16 }, env: { a: 0.001, d: 0.17, v: 0.09 } },
            { wave: 'tri', f: hz('E3'), sweep: { to: 0.5, t: 0.1 }, env: { a: 0.001, d: 0.1, v: 0.08 } }],
        max: 3, gap: 0.035, vary: { pitch: 120, level: 0.15, time: 0.006 },
    },
    tick: {
        label: 'A mite pops', group: 'play', desc: 'a tiny high crackle (they die by the dozen)',
        layers: [{ wave: 'noise', f: 8000, sweep: { to: 0.4, t: 0.06 }, lp: 3400, env: { a: 0.001, d: 0.06, v: 0.06 } }],
        max: 2, gap: 0.04, vary: { pitch: 150, level: 0.2 },
    },
    burst: {
        db: 3, label: 'A big machine bursts', group: 'play', desc: 'a cortex, a roller or a hatcher: a longer burst falling away, a deeper thud',
        layers: [{ wave: 'noise', f: 4600, sweep: { to: 0.14, t: 0.42 }, lp: { f: 3000, to: 320, t: 0.42 }, env: { a: 0.002, d: 0.45, v: 0.13 } },
            { wave: 'tri', f: hz('A2'), sweep: { to: 0.45, t: 0.3 }, env: { a: 0.002, d: 0.32, v: 0.16 } },
            { wave: 'metal', f: 6000, sweep: { to: 0.3, t: 0.25 }, lp: 2400, env: { a: 0.003, d: 0.25, v: 0.04 } }],
        max: 2, gap: 0.06, vary: { pitch: 90, level: 0.12 },
    },
    clank: {
        db: 1, label: 'A shot off armour', group: 'play', desc: 'a hard metallic clank: a crusher shoved, the mainframe\'s plating',
        layers: [{ wave: 'metal', f: 9000, sweep: { to: 0.5, t: 0.05 }, env: { a: 0.001, d: 0.06, v: 0.06 }, lp: 3000 },
            { wave: 'pulse', duty: 0.5, f: E5, env: { a: 0.001, d: 0.04, v: 0.02 }, lp: 2800 }],
        max: 2, gap: 0.08, vary: { pitch: 150, level: 0.15 },
    },
    dent: {
        db: 2, label: 'A hatcher takes a hit', group: 'play', desc: 'a dull hollow thunk (it holds for three)',
        layers: [{ wave: 'tri', f: hz('E3'), sweep: { to: 0.7, t: 0.08 }, env: { a: 0.001, d: 0.1, v: 0.14 } },
            { wave: 'noise', f: 2500, lp: 1600, env: { a: 0.001, d: 0.05, v: 0.05 } }],
        max: 2, gap: 0.06, vary: { pitch: 80 },
    },
    rescue: {
        db: 1, label: 'A human saved', group: 'play', desc: 'a bright climb up the major chord; each link of the chain starts it a step higher',
        layers: [{ wave: 'pulse', duty: 0.125, f: A4, arp: { n: [0, 4, 7, 12], step: 0.055 }, env: { a: 0.002, d: 0.06, s: 0.7, h: 0.18, r: 0.15, v: 0.06 }, lp: 3200 },
            { wave: 'tri', f: hz('A3'), env: { a: 0.002, d: 0.28, v: 0.1 } }],
        max: 2, gap: 0.1,
    },
    crush: {
        db: 2, label: 'A human crushed', group: 'play', desc: 'a crunch under a crusher\'s foot, then a falling sigh',
        layers: [{ wave: 'noise', f: 2200, sweep: { to: 0.25, t: 0.2 }, lp: { f: 1800, to: 400, t: 0.2 }, env: { a: 0.002, d: 0.22, v: 0.12 } },
            { wave: 'pulse', duty: 0.25, f: E4, seq: [[0.08, 0], [0.2, -3], [0.34, -7]], env: { a: 0.01, d: 0.1, s: 0.6, h: 0.3, r: 0.2, v: 0.04 }, lp: 1800 }],
        max: 1, gap: 0.2,
    },
    convert: {
        db: 1, label: 'A cortex turns a human', group: 'play', desc: 'TELEGRAPH: a violet warble that sinks for as long as you have to stop it (1.2 s)',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('C5'), sweep: { to: 0.5, t: 1.2, curve: 'lin' }, env: { a: 0.04, d: 0.1, s: 0.9, h: 1.0, r: 0.1, v: 0.05 }, lp: 2600, vib: { rate: 9, depth: 90 } },
            { wave: 'tri', f: hz('C4'), sweep: { to: 0.5, t: 1.2 }, env: { a: 0.04, d: 0.1, s: 0.8, h: 1.0, r: 0.1, v: 0.06 }, vib: { rate: 9, depth: 60 } }],
        max: 2, gap: 0.3,
    },
    husk: {
        db: 2, label: 'A husk rises', group: 'play', desc: 'too late: a low growl dropping away',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('E3'), sweep: { to: 0.5, t: 0.4 }, env: { a: 0.005, d: 0.42, v: 0.06 }, lp: 1400, vib: { rate: 18, depth: 120 } },
            { wave: 'noise', f: 1200, lp: 900, env: { a: 0.01, d: 0.3, v: 0.05 } }],
        max: 1, gap: 0.25,
    },
    spark: {
        db: 0, label: 'A cortex lobs a spark', group: 'play', desc: 'a soft warbling pop',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('G4'), sweep: { to: 0.6, t: 0.14, q: 1 / 60 }, env: { a: 0.002, d: 0.15, v: 0.04 }, lp: 2000, vib: { rate: 24, depth: 80 } }],
        max: 2, gap: 0.1, vary: { pitch: 100, level: 0.1 },
    },
    shell: {
        db: 2, label: 'A roller fires', group: 'play', desc: 'a short hollow cannon thump',
        layers: [{ wave: 'tri', f: hz('A2'), sweep: { to: 0.5, t: 0.12 }, env: { a: 0.001, d: 0.14, v: 0.16 } },
            { wave: 'noise', f: 3000, sweep: { to: 0.3, t: 0.1 }, lp: 2000, env: { a: 0.001, d: 0.1, v: 0.07 } }],
        max: 2, gap: 0.08, vary: { pitch: 80 },
    },
    ricochet: {
        db: 0, label: 'A shell bounces', group: 'play', desc: 'a little metal ping off the wall',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('E5'), sweep: { to: 1.4, t: 0.05 }, env: { a: 0.001, d: 0.08, v: 0.035 }, lp: 3300 },
            { wave: 'metal', f: 12000, env: { a: 0.001, d: 0.03, v: 0.025 }, lp: 3000 }],
        max: 2, gap: 0.06, vary: { pitch: 120 },
    },
    hatch: {
        db: 2, label: 'A hatcher hatches', group: 'play', desc: 'a wet pop and a rising blurt: a roller is out',
        layers: [{ wave: 'noise', f: 1600, sweep: { to: 0.3, t: 0.15 }, lp: { f: 1600, to: 500, t: 0.15 }, env: { a: 0.002, d: 0.16, v: 0.1 } },
            { wave: 'pulse', duty: 0.25, f: hz('A3'), sweep: { to: 2, t: 0.2 }, env: { a: 0.002, d: 0.22, v: 0.05 }, lp: 2200 }],
        max: 1, gap: 0.15,
    },
    fizzle: {
        label: 'A shot shot down', group: 'play', desc: 'a short hiss: a spark, a shell or a bolt goes out',
        layers: [{ wave: 'noise', f: 6000, lp: { f: 3000, to: 1000, t: 0.1 }, env: { a: 0.001, d: 0.1, v: 0.05 } }],
        max: 2, gap: 0.05,
    },
    pylonZap: {
        db: 2, label: 'A pylon fries a drone', group: 'play', desc: 'an electric crackle: noise chopped fast over a falling buzz',
        layers: [{ wave: 'noise', f: 7000, lp: { f: 5000, to: 1500, t: 0.3 }, env: { a: 0.001, d: 0.3, v: 0.1 }, trem: { rate: 40, depth: 0.9 } },
            { wave: 'pulse', duty: 0.125, f: hz('E4'), sweep: { to: 0.4, t: 0.25 }, env: { a: 0.001, d: 0.25, v: 0.04 }, lp: 2800, vib: { rate: 35, depth: 200 } }],
        max: 1, gap: 0.12,
    },
    warp: {
        db: -1, label: 'A burst warps in', group: 'play', desc: 'a shimmer sliding up: more machines are forming',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('A3'), sweep: { to: 4, t: 0.7 }, env: { a: 0.05, d: 0.7, v: 0.04 }, lp: 2600, trem: { rate: 16, depth: 0.6 } },
            { wave: 'noise', f: 2000, lp: { f: 600, to: 3000, t: 0.7 }, env: { a: 0.1, d: 0.65, v: 0.03 } }],
        max: 1, gap: 0.6,
    },
    swarm: {
        db: 0, label: 'Mites pour in', group: 'play', desc: 'TELEGRAPH (with the red edge): a buzzing swell',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A2'), env: { a: 0.15, d: 0.5, s: 0.6, h: 0.2, r: 0.3, v: 0.05 }, lp: 1600, trem: { rate: 28, depth: 0.7 }, vib: { rate: 6, depth: 40 } },
            { wave: 'noise', f: 3000, lp: { f: 800, to: 2400, t: 0.5 }, env: { a: 0.2, d: 0.6, v: 0.04 }, trem: { rate: 28, depth: 0.6 } }],
        max: 1, gap: 1,
    },
    jingle: {
        db: 0, label: 'The wave card', group: 'play', desc: 'a short minor phrase and its answer; every wave says it a step higher',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.12, 3], [0.24, 7], [0.42, 10], [0.6, 7]], env: { a: 0.004, d: 0.06, s: 0.7, h: 0.75, r: 0.2, v: 0.06 }, lp: 2800 },
            { wave: 'tri', f: R / 2, seq: [[0, 0], [0.42, -2], [0.6, 0]], env: { a: 0.004, d: 0.2, s: 0.6, h: 0.6, r: 0.25, v: 0.14 } }],
        max: 1, gap: 1,
    },
    extra: {
        db: 1, label: 'Extra man', group: 'play', desc: 'a quick bright run up two octaves',
        layers: [{ wave: 'pulse', duty: 0.125, f: A4, arp: { n: [0, 4, 7, 12, 16, 19, 24], step: 0.05 }, env: { a: 0.002, d: 0.08, s: 0.7, h: 0.32, r: 0.2, v: 0.06 }, lp: 3300 },
            { wave: 'tri', f: hz('A3'), env: { a: 0.004, d: 0.5, v: 0.12 } }],
        max: 1, gap: 0.5,
    },
    count: {
        label: 'The tally counts', group: 'play', desc: 'a coin-blip per row (higher each row; a bare row is just a click)',
        layers: [{ wave: 'pulse', duty: 0.25, f: E5, seq: [[0, 0], [0.04, 5]], env: { a: 0.001, d: 0.09, v: 0.05 }, lp: 3300 }],
        max: 2, gap: 0.05,
    },
    cleared: {
        db: 0, label: 'Wave cleared', group: 'play', desc: 'a short major fanfare: root, third, fifth, octave, the bass under it',
        layers: [{ wave: 'pulse', duty: 0.25, f: A4, seq: [[0, 0], [0.1, 4], [0.2, 7], [0.32, 12]], env: { a: 0.004, d: 0.1, s: 0.75, h: 0.5, r: 0.3, v: 0.06 }, lp: 3200 },
            { wave: 'tri', f: R / 2, seq: [[0, 0], [0.32, 7]], env: { a: 0.004, d: 0.3, s: 0.6, h: 0.4, r: 0.3, v: 0.14 } }],
        max: 1, gap: 1,
    },
    // ---------------------------------------------------------------- THE MAINFRAME
    siren: {
        db: 1, label: 'The mainframe: WARNING', group: 'play', desc: 'on its card: a two-tone alarm, about 2.4 seconds',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A4'), seq: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i * 0.3, i % 2 ? -5 : 0]), env: { a: 0.02, d: 0.1, s: 0.85, h: 2.2, r: 0.15, v: 0.06 }, lp: 2000 },
            { wave: 'tri', f: A2, seq: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i * 0.3, i % 2 ? -5 : 0]), env: { a: 0.02, d: 0.1, s: 0.9, h: 2.2, r: 0.15, v: 0.1 } }],
        max: 1, gap: 2,
    },
    charge: {
        db: -2, label: 'A gun pod charges', group: 'play', desc: 'TELEGRAPH (with the barrel glow): a short whine rising',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('A3'), sweep: { to: 3, t: 0.45, curve: 'lin' }, env: { a: 0.03, d: 0.45, s: 0.8, h: 0.02, r: 0.03, v: 0.035 }, lp: 2600, vib: { rate: 14, depth: 40 } }],
        max: 2, gap: 0.25,
    },
    bolt: {
        db: 1, label: 'A gun pod fires', group: 'play', desc: 'a low zap down',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('E4'), sweep: { to: 0.3, t: 0.14 }, env: { a: 0.001, d: 0.15, v: 0.06 }, lp: 2800 },
            { wave: 'noise', f: 5000, sweep: { to: 0.3, t: 0.1 }, lp: 2600, env: { a: 0.001, d: 0.08, v: 0.04 } }],
        max: 2, gap: 0.08, vary: { pitch: 60 },
    },
    fan: {
        db: 2, label: 'The rage fan', group: 'play', desc: 'nine bolts at once: a wide crackling blast',
        layers: [{ wave: 'noise', f: 6000, sweep: { to: 0.2, t: 0.3 }, lp: 3400, env: { a: 0.001, d: 0.3, v: 0.11 } },
            { wave: 'pulse', duty: 0.25, f: hz('A4'), sweep: { to: 0.2, t: 0.28 }, env: { a: 0.001, d: 0.28, v: 0.06 }, lp: 3000 }],
        max: 1, gap: 0.3,
    },
    shutter: {
        db: 1, label: 'The core opens', group: 'play', desc: 'TELEGRAPH (with the glowing seam): a mechanical clatter and a rising whine: shoot now',
        layers: [{ wave: 'metal', f: 3000, env: { a: 0.002, d: 0.25, v: 0.05 }, lp: 2400, trem: { rate: 22, depth: 0.8 } },
            { wave: 'pulse', duty: 0.5, f: hz('A2'), sweep: { to: 4, t: 0.6 }, env: { a: 0.02, d: 0.6, s: 0.6, h: 0.05, r: 0.1, v: 0.05 }, lp: 2000 }],
        max: 1, gap: 0.5,
    },
    thump: {
        db: 3, label: 'A hit on a pod or the core', group: 'play', desc: 'a meaty thump-tick (the core\'s is lower)',
        layers: [{ wave: 'noise', f: 3500, sweep: { to: 0.3, t: 0.07 }, lp: 2400, env: { a: 0.001, d: 0.08, v: 0.09 } },
            { wave: 'tri', f: hz('A3'), sweep: { to: 0.5, t: 0.07 }, env: { a: 0.001, d: 0.08, v: 0.12 } }],
        max: 2, gap: 0.07, vary: { pitch: 100, level: 0.12 },
    },
    crunch: {
        db: 4, label: 'A gun pod is shot off', group: 'play', desc: 'a big crunching explosion with a metal rattle',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.1, t: 0.7 }, lp: { f: 3200, to: 250, t: 0.7 }, env: { a: 0.002, d: 0.75, v: 0.16 } },
            { wave: 'tri', f: hz('F2'), sweep: { to: 0.35, t: 0.5 }, env: { a: 0.002, d: 0.55, v: 0.22 } },
            { wave: 'metal', f: 7000, sweep: { to: 0.3, t: 0.4 }, lp: 2600, env: { a: 0.003, d: 0.4, v: 0.06 }, vib: { rate: 22, depth: 150 } }],
        max: 2, gap: 0.1,
    },
    drop: {
        label: 'Drones drop from its belly', group: 'play', desc: 'two hollow clunks',
        layers: [{ wave: 'tri', f: hz('D3'), seq: [[0, 0], [0.1, -5]], env: { a: 0.001, d: 0.08, s: 0.3, h: 0.1, r: 0.05, v: 0.12 } },
            { wave: 'noise', f: 2000, lp: 1400, env: { a: 0.001, d: 0.05, v: 0.04 } }],
        max: 1, gap: 0.3,
    },
    roar: {
        db: 3, label: 'The mainframe rages', group: 'play', desc: 'a falling growl and a sting: it fires fans now',
        layers: [{ wave: 'tri', f: hz('G2'), sweep: { to: 0.5, t: 0.9 }, env: { a: 0.01, d: 1.0, v: 0.22 }, vib: { rate: 20, depth: 140 } },
            { wave: 'noise', f: 1600, lp: { f: 1500, to: 200, t: 0.9 }, env: { a: 0.02, d: 1.0, v: 0.1 } },
            { wave: 'pulse', duty: 0.125, f: C5, arp: { n: [0, -1, -5, -6], step: 0.1 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.2, r: 0.2, v: 0.045 }, lp: 3000 }],
        max: 1, gap: 1,
    },
    bossDeath: {
        db: 4, label: 'The mainframe begins to die', group: 'play', desc: 'a long descending explosion',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.05, t: 2.4 }, lp: { f: 4000, to: 100, t: 2.4 }, env: { a: 0.01, d: 2.5, v: 0.18 } },
            { wave: 'tri', f: hz('C3'), sweep: { to: 0.2, t: 2.2 }, env: { a: 0.005, d: 2.3, v: 0.24 }, vib: { rate: 8, depth: 60 } }],
        max: 1, gap: 1,
    },
    bossBoom: {
        db: 3, label: 'A blast along the mainframe', group: 'play', desc: 'a short boom; bigger blasts fall lower',
        layers: [{ wave: 'noise', f: 4800, sweep: { to: 0.15, t: 0.35 }, lp: { f: 3000, to: 400, t: 0.35 }, env: { a: 0.002, d: 0.38, v: 0.13 } },
            { wave: 'tri', f: hz('A2'), sweep: { to: 0.4, t: 0.25 }, env: { a: 0.002, d: 0.28, v: 0.18 } }],
        max: 3, gap: 0.08, vary: { pitch: 150, level: 0.15, time: 0.008 },
    },
    bossGone: {
        db: 5, label: 'The mainframe is gone', group: 'play', desc: 'one final enormous boom',
        layers: [{ wave: 'noise', f: 5500, sweep: { to: 0.06, t: 1.6 }, lp: { f: 4500, to: 120, t: 1.6 }, env: { a: 0.002, d: 1.7, v: 0.22 } },
            { wave: 'tri', f: hz('D2'), sweep: { to: 0.3, t: 1.2 }, env: { a: 0.002, d: 1.3, v: 0.28 } },
            { wave: 'metal', f: 6000, sweep: { to: 0.2, t: 0.8 }, lp: 2400, env: { a: 0.003, d: 0.8, v: 0.06 } }],
        max: 1, gap: 2,
    },
    victory: {
        db: 0, label: 'Victory sting', group: 'play', desc: 'after the last blast: a bright major fanfare',
        layers: [{ wave: 'pulse', duty: 0.25, f: A4, arp: { n: [0, 4, 7, 12, 7, 12, 16], step: 0.09 }, env: { a: 0.003, d: 0.1, s: 0.6, h: 0.5, r: 0.5, v: 0.06 }, lp: 3300 },
            { wave: 'tri', f: hz('A2'), env: { a: 0.01, d: 1.4, v: 0.14 } }, { wave: 'tri', f: hz('E3'), at: 0.2, env: { a: 0.01, d: 1.2, v: 0.08 } }],
        max: 1, gap: 2,
    },
    hum: {
        db: -8, loop: true, label: 'The mainframe hums', group: 'loop', drive: 'rage (0.35 while it lives, 1 when it rages)',
        desc: 'a low electric hum under the last wave; it climbs and roughens when the mainframe rages', attack: 0.8, release: 0.6, glide: 0.4,
        layers: [
            { wave: 'tri', f: [hz('A1'), hz('E2')], level: [0.06, 0.1] },
            { wave: 'pulse', duty: 0.5, f: [A2, A2 * 1.5], lp: [300, 900], level: [0.008, 0.025], vib: { rate: 5, depth: 15 } },
            { wave: 'noise', f: 500, lp: [250, 700], level: [0.006, 0.02] },
        ],
    },
};

const play = (name, o) => (s) => s.play(name, o);

export const SOUND = floorSound('lasthuman', 'LAST HUMAN', R, {
    mix: 1,
    personality: 'a low, hard arena: a quiet rattle of a gun, pops and bursts, a rescue chime that climbs the chain, a cortex\'s warble, a mainframe that hums, clanks and goes out in one huge boom',
    sounds,
    // the sim says it all through its own events: the cues stay quiet except the coin and the win
    cues: { Start: null, Hit: null, Miss: null, Die: null, Bonus: null, Tick: null },
    events: {
        fire: play('zap'),
        boom: (s, e) => s.play(e.of === 'mite' ? 'tick' : e.big ? 'burst' : 'pop'),
        clank: play('clank'),
        dent: play('dent'),
        rescue: (s, e) => s.play('rescue', { pitch: Math.max(0, Math.min(5, (e.chain | 0) - 1)) * 2 }),
        crush: play('crush'),
        convert: play('convert'),
        husk: play('husk'),
        spark: play('spark'),
        shell: play('shell'),
        ricochet: play('ricochet'),
        hatch: play('hatch'),
        fizzle: play('fizzle'),
        pylonZap: play('pylonZap'),
        warp: (s, e) => { if ((e.n | 0) > 1) s.play('warp'); },
        swarm: play('swarm'),
        card: (s, e) => s.play('jingle', { pitch: Math.min(6, Math.max(0, (e.wave | 0) - 1)) }),
        go: play('start'),
        die: (s) => s.play('lifeLost'),
        extra: play('extra'),
        tally: (s, e) => s.play('count', { pitch: e.pts > 0 ? Math.min(7, (e.n | 0)) : -12, level: e.pts > 0 ? 1 : 0.5 }),
        waveClear: play('cleared'),
        shield: (s) => s.play('ward', { level: 0.5 }),
        bossWarn: play('siren'),
        bossTele: play('charge'),
        bossFire: (s, e) => s.play(e.fan ? 'fan' : 'bolt'),
        coreOpen: play('shutter'),
        bossHit: (s, e) => { if (e.armored) s.play('clank'); else s.play('thump', { pitch: e.core ? -5 : 0, level: e.core ? 1.3 : 1 }); },
        podDown: play('crunch'),
        drop: play('drop'),
        bossRage: play('roar'),
        bossDie: (s) => { s.play('bossDeath'); s.stop('hum', 0.4); },
        bossBoom: (s, e) => s.play('bossBoom', { pitch: -Math.min(8, ((e.size || 1) - 0.8) * 4) }),
        bossGone: (s) => { s.play('bossGone'); s.play('victory', { delay: 1.3 }); },
    },
    silent: {},
    // the mainframe's hum: only while it lives (its wave's warp-in and play)
    frame(s, game) {
        const sim = game.sim;
        const b = sim && sim.boss;
        const on = b != null && b.alive && (sim.p === 2 || sim.p === 3);
        if (on) s.drive('hum', b.rage ? 1 : 0.35);
        else if (s.loops.has('hum')) s.stop('hum', 0.6);
    },
});
