// THE NODE · world 1 · SWARM PATROL · THE SOUND (2026-10-18): the floor's stock voice in E, plus a few chip patches of its
// own: a thin zap for the gun, pops and booms, the classic falling whistle of a dive, a warbling tractor beam, a rising
// call for the rescue, a stage jingle, a siren for the queen. Chip synthesis only (js/cabinet/sound/chip.js). The sim's
// own events (round.js _emit) drive it; the SDK cues it also emits are left silent where an event already speaks.
import { hz } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('E4');

const sounds = {
    zap: {
        db: 2, label: 'The gun', group: 'play', desc: 'FIRE: a thin, fast zap down',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('B5'), sweep: { to: 0.3, t: 0.07, q: 1 / 120 }, env: { a: 0.001, d: 0.07, v: 0.045 }, lp: 3400 }],
        max: 2, gap: 0.05, vary: { pitch: 50, level: 0.1 },
    },
    pop: {
        db: 3, label: 'An alien pops', group: 'play', desc: 'a short noise burst with a falling blip',
        layers: [{ wave: 'noise', f: 6000, sweep: { to: 0.2, t: 0.18 }, lp: { f: 3200, to: 700, t: 0.18 }, env: { a: 0.002, d: 0.2, v: 0.1 } },
            { wave: 'pulse', duty: 0.5, f: hz('E5'), sweep: { to: 0.4, t: 0.1 }, env: { a: 0.001, d: 0.1, v: 0.03 }, lp: 2800 }],
        max: 3, gap: 0.04, vary: { pitch: 90, level: 0.15, time: 0.006 },
    },
    boom: {
        db: 4, label: 'A boss or a part goes', group: 'play', desc: 'a deeper burst and a thud',
        layers: [{ wave: 'noise', f: 4200, sweep: { to: 0.12, t: 0.5 }, lp: { f: 2600, to: 300, t: 0.5 }, env: { a: 0.003, d: 0.55, v: 0.15 } },
            { wave: 'tri', f: hz('E2'), sweep: { to: 0.45, t: 0.35 }, env: { a: 0.003, d: 0.4, v: 0.2 } }],
        max: 2, gap: 0.08,
    },
    clank: {
        db: 2, label: 'A shot rings off armour', group: 'play', desc: 'a hard metallic clank',
        layers: [{ wave: 'metal', f: 9000, sweep: { to: 0.5, t: 0.06 }, env: { a: 0.001, d: 0.07, v: 0.06 }, lp: 3000 }],
        max: 2, gap: 0.06, vary: { pitch: 120, level: 0.15 },
    },
    dive: {
        db: 0, label: 'A dive', group: 'play', desc: 'the falling whistle of an alien peeling off the ranks',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('A5'), sweep: { to: 0.35, t: 0.6 }, env: { a: 0.01, d: 0.6, v: 0.03 }, lp: 3000, vib: { rate: 9, depth: 40 } }],
        max: 2, gap: 0.25,
    },
    bolt: {
        db: 0, label: 'An enemy bolt', group: 'play', desc: 'a low pop',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('E3'), sweep: { to: 0.6, t: 0.08 }, env: { a: 0.002, d: 0.08, v: 0.035 }, lp: 1600 }],
        max: 2, gap: 0.08,
    },
    beam: {
        db: 1, label: 'The tractor beam', group: 'play', desc: 'a warbling tone held while the beam is open',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('C4'), seq: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => [i * 0.22, i % 2 ? 3 : 0]), env: { a: 0.05, d: 0.1, s: 0.8, h: 2.5, r: 0.3, v: 0.04 }, lp: 2200, trem: { rate: 7, depth: 0.5 } }],
        max: 1, gap: 1,
    },
    rise: {
        db: 1, label: 'Rescue / extra ship', group: 'play', desc: 'a quick climb up the major chord',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 4, 7, 12, 16], step: 0.06 }, env: { a: 0.002, d: 0.1, s: 0.6, h: 0.25, r: 0.2, v: 0.055 }, lp: 3200 },
            { wave: 'tri', f: R / 2, env: { a: 0.004, d: 0.4, v: 0.1 } }],
        max: 1, gap: 0.3,
    },
    fall: {
        db: 1, label: 'A ship taken or turned', group: 'play', desc: 'the chord stepping down, minor',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [12, 7, 3, 0], step: 0.09 }, env: { a: 0.002, d: 0.1, s: 0.6, h: 0.3, r: 0.25, v: 0.05 }, lp: 2800 }],
        max: 1, gap: 0.3,
    },
    jingle: {
        db: 0, label: 'Stage card', group: 'play', desc: 'a short four-note phrase as each stage is announced',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.12, 4], [0.24, 7], [0.36, 12]], env: { a: 0.003, d: 0.08, s: 0.7, h: 0.5, r: 0.25, v: 0.055 }, lp: 3000 },
            { wave: 'tri', f: R / 2, seq: [[0, 0], [0.24, 7]], env: { a: 0.004, d: 0.3, s: 0.5, h: 0.4, r: 0.3, v: 0.12 } }],
        max: 1, gap: 1,
    },
    siren: {
        db: 1, label: 'The queen comes', group: 'play', desc: 'a two-tone alarm',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A4'), seq: [0, 1, 2, 3, 4, 5].map((i) => [i * 0.3, i % 2 ? -4 : 0]), env: { a: 0.02, d: 0.1, s: 0.85, h: 1.6, r: 0.15, v: 0.06 }, lp: 2000 }],
        max: 1, gap: 2,
    },
    tele: {
        db: 1, label: 'The queen charges', group: 'play', desc: 'a pulse rising to a whine before she attacks',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('E3'), sweep: { to: 3, t: 0.7, curve: 'lin' }, env: { a: 0.05, d: 0.75, v: 0.045 }, lp: 2800 }],
        max: 1, gap: 0.4,
    },
    queenDeath: {
        db: 5, label: 'The queen dies', group: 'play', desc: 'a long falling explosion',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.05, t: 2.4 }, lp: { f: 4000, to: 100, t: 2.4 }, env: { a: 0.01, d: 2.5, v: 0.18 } },
            { wave: 'tri', f: hz('E3'), sweep: { to: 0.2, t: 2.2 }, env: { a: 0.005, d: 2.3, v: 0.22 }, vib: { rate: 8, depth: 60 } }],
        max: 1, gap: 1,
    },
};

export const SOUND = floorSound('swarmpatrol', 'SWARM PATROL', R, {
    personality: 'a 1981 formation shooter: a thin zap, pops and booms, falling dive whistles, a warbling beam, a siren for the queen',
    sounds,
    cues: { Start: null, Hit: null, Miss: null, Die: null, Bonus: null, Tick: null },
    events: {
        stage: (s, e) => s.play('jingle', { pitch: e.challenge ? 5 : 0 }),
        queenWarn: (s) => s.play('siren', { delay: 0.5 }),
        go: (s) => s.play('start'),
        fire: (s) => s.play('zap'),
        kill: (s, e) => s.play(e.big ? 'boom' : 'pop'),
        dent: (s) => s.play('hit'), clank: (s) => s.play('clank'),
        dive: (s) => s.play('dive'), prime: (s) => s.play('tick'), strike: (s) => s.play('dive', { pitch: 7 }),
        bolt: (s) => s.play('bolt'), beam: (s) => s.play('beam'),
        capture: (s) => { s.play('beam', { pitch: 5 }); s.play('lifeLost'); },
        release: (s) => s.play('bonus'), rescue: (s) => s.play('rise'),
        turncoat: (s) => s.play('fall'), captiveLost: (s) => s.play('fall'),
        split: (s) => s.play('pop', { pitch: 7 }),
        shipLost: (s) => { s.play('boom'); s.play('lifeLost'); }, twinLost: (s) => s.play('boom'),
        extraShip: (s) => s.play('rise', { pitch: 5 }),
        stageClear: (s) => s.play('bonus'), tally: (s, e) => s.play(e.bonus > 0 ? 'hit' : 'tick'),
        perfect: (s) => s.play('win'), flight: (s) => s.play('bonus'),
        queenArrive: (s) => s.play('boom'), queenTele: (s) => s.play('tele'), queenFire: (s) => s.play('bolt', { pitch: -5 }),
        queenHit: (s) => s.play('hit'), wingBreak: (s) => s.play('boom'), queenPhase: (s) => s.play('fall'),
        eye: (s, e) => { if (e.open) s.play('tick'); },
        card: null,
        queenDie: (s) => s.play('queenDeath'), queenBoom: (s) => s.play('pop'), queenGone: (s) => s.play('boom'),
    },
    silent: { card: 'the result card: the Win cue (won) or the floor\'s out (lost) speaks for it' },
});
