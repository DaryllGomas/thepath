// THE NODE · world 1 · IRONWORKS · THE SOUND: steel knocks, spring jacks and a falling gantry.
// Chip patches only. The sim's events carry the work; Coin, Start and Win keep the cabinet's voice.
import { floorSound } from '../../sound/palettes/floor.js';
import { hz } from '../../sound/music.js';

const R = hz('D4');
const sounds = {
    clang: {
        label: 'Steel on steel', group: 'play', desc: 'a short hollow knock with a metal edge',
        layers: [{ wave: 'tri', f: R / 2, sweep: { to: 0.5, t: 0.1 }, env: { a: 0.001, d: 0.12, v: 0.09 } },
            { wave: 'metal', f: 4800, lp: 2400, env: { a: 0.001, d: 0.08, v: 0.035 } }],
        max: 2, gap: 0.08,
    },
    hop: {
        label: 'Climber hops', group: 'play', desc: 'a rounded upward chirp',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, sweep: { to: 2, t: 0.12 }, lp: 2400, env: { a: 0.002, d: 0.14, v: 0.045 } }],
        max: 1, gap: 0.12,
    },
    spring: {
        label: 'Spring jack', group: 'play', desc: 'a quiet bouncing twang',
        layers: [{ wave: 'pulse', duty: 0.125, f: R / 2, sweep: { to: 2, t: 0.09 }, vib: { rate: 24, depth: 80 }, lp: 2000, env: { a: 0.002, d: 0.16, v: 0.03 } }],
        max: 2, gap: 0.15,
    },
    hiss: {
        label: 'The furnace spits', group: 'play', desc: 'a brief low hiss of burning oil',
        layers: [{ wave: 'noise', f: 4000, lp: { f: 1800, to: 400, t: 0.24 }, env: { a: 0.01, d: 0.25, v: 0.045 } }],
        max: 2, gap: 0.2,
    },
    collapse: {
        label: 'The scaffold gives', group: 'play', desc: 'a descending metal rattle over a low rumble',
        layers: [{ wave: 'noise', f: 3600, lp: { f: 2400, to: 180, t: 1.2 }, env: { a: 0.005, d: 1.3, v: 0.1 } },
            { wave: 'tri', f: R / 2, sweep: { to: 0.25, t: 1.1 }, env: { a: 0.002, d: 1.2, v: 0.14 } },
            { wave: 'metal', f: 5000, lp: 2400, trem: { rate: 18, depth: 0.8 }, env: { a: 0.002, d: 0.8, v: 0.04 } }],
        max: 1, gap: 1,
    },
    card: {
        label: 'A new board', group: 'play', desc: 'a short work whistle rising up the chord',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.14, 4], [0.28, 7], [0.44, 12]], lp: 2800, env: { a: 0.004, d: 0.1, s: 0.6, h: 0.48, r: 0.2, v: 0.05 } }],
        max: 1, gap: 1,
    },
};
const play = (name, o) => (s) => s.play(name, o);

export const SOUND = floorSound('ironworks', 'IRONWORKS', R, {
    sounds,
    cues: { Hit: null, Miss: null, Die: null, Bonus: null, Tick: null },
    events: {
        card: (s, e) => s.play('card', { pitch: (e.board - 1) * 2 }),
        timeWarn: play('miss'), beltWarn: play('miss'), beltFlip: play('clang'),
        lift: (s, e) => s.play('clang', { pitch: e.up ? 5 : -5, level: 0.65 }),
        throw: (s, e) => s.play(e.spring ? 'spring' : 'clang', { level: 0.65 }),
        jump: play('hop'), step: play('tick', { level: 0.35 }),
        bolt: play('clang', { pitch: 12 }), rage: play('miss', { pitch: -7 }),
        land: play('clang', { level: 0.5 }), oil: play('hiss'), fire: play('hiss'),
        springDrop: play('spring', { pitch: -12 }), spring: play('spring'),
        hammer: play('bonus'), pickup: play('bonus'), smash: play('clang', { level: 1.3 }),
        knock: play('clang'), hop: play('hit'), extra: play('bonus', { pitch: 12 }),
        die: play('lifeLost'), collapse: play('collapse'),
        clear: play('bonus'), thud: play('clang', { pitch: -12, level: 1.5 }),
        tally: play('tick'),
    },
    silent: { fall: 'The collapse patch already follows the foreman down.' },
});
