// THE NODE · world 1 · VAULT DIGGER · THE SOUND: the heist's board sounds in A, with the floor's cabinet family.
// Chip patches only. It reads the sim's own events (sim.js _emit),
// so the eight SDK cues stay quiet except the coin, a runner lost and the win.
//   dig a dry crunch   clank the pick rings off stone   gold a bright two-note ping, climbing as the vault empties
//   trap a thunk and a squeak   bury a low crunch   crumble cracked brick giving way   fall a short whistle down
//   card a three-note rise (higher each vault)   exitOpen the ladder's arpeggio   key / crown bells   alarm a siren
//   tally the counting tick   extraLife a quick fanfare
import { hz } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('A4');

export const SOUND = floorSound('vaultdigger', 'VAULT DIGGER', R, {
    personality: 'a dig-and-trap heist: crunching brick, bright gold pings, a thunk for every trapped guard, a siren for the crown',
    sounds: {
        dig: {
            label: 'A dig', group: 'play', desc: 'the brick breaks: a dry noise crunch falling away',
            layers: [{ wave: 'noise', f: 3000, sweep: { to: 0.3, t: 0.16 }, lp: { f: 2600, to: 700, t: 0.16 }, env: { a: 0.002, d: 0.17, v: 0.09 } },
                { wave: 'tri', f: hz('A2'), sweep: { to: 0.6, t: 0.1 }, env: { a: 0.002, d: 0.1, v: 0.08 } }],
            max: 2, gap: 0.08, vary: { pitch: 60, level: 0.12 },
        },
        clank: {
            label: 'Stone will not dig', group: 'play', desc: 'the pick rings off stone: a hard metal tick',
            layers: [{ wave: 'metal', f: 9000, sweep: { to: 0.6, t: 0.05 }, env: { a: 0.001, d: 0.08, v: 0.07 }, lp: 3000 }],
            max: 1, gap: 0.1,
        },
        gold: {
            label: 'Gold', group: 'play', desc: 'a bright two-note ping (it climbs as the vault empties)',
            layers: [{ wave: 'pulse', duty: 0.125, f: R * 2, seq: [[0, 0], [0.05, 7]], env: { a: 0.001, d: 0.14, v: 0.06 }, lp: 3600 },
                { wave: 'tri', f: R, seq: [[0, 0], [0.05, 7]], env: { a: 0.001, d: 0.12, v: 0.06 } }],
            max: 2, gap: 0.05,
        },
        trap: {
            label: 'A guard trapped', group: 'play', desc: 'a soft thunk and a squeak',
            layers: [{ wave: 'tri', f: hz('E2'), sweep: { to: 0.5, t: 0.12 }, env: { a: 0.002, d: 0.14, v: 0.16 } },
                { wave: 'pulse', duty: 0.25, f: hz('E5'), sweep: { to: 1.6, t: 0.08 }, env: { a: 0.01, d: 0.09, v: 0.04 }, lp: 3000 }],
            max: 2, gap: 0.06,
        },
        bury: {
            label: 'A guard buried', group: 'play', desc: 'the brick closes over him: a low crunch',
            layers: [{ wave: 'noise', f: 1800, sweep: { to: 0.2, t: 0.3 }, lp: { f: 1800, to: 300, t: 0.3 }, env: { a: 0.003, d: 0.32, v: 0.11 } },
                { wave: 'tri', f: hz('A1'), sweep: { to: 0.6, t: 0.25 }, env: { a: 0.003, d: 0.28, v: 0.18 } }],
            max: 2, gap: 0.08,
        },
        refill: {
            label: 'A hole closes', group: 'play', desc: 'an empty hole bricks itself up: a faint scrape',
            layers: [{ wave: 'noise', f: 2400, lp: 1400, env: { a: 0.02, d: 0.12, v: 0.025 } }],
            max: 1, gap: 0.1,
        },
        crumble: {
            label: 'Cracked brick gives way', group: 'play', desc: 'a rattle of falling grit',
            layers: [{ wave: 'noise', f: 4000, sweep: { to: 0.4, t: 0.3 }, lp: { f: 3000, to: 900, t: 0.3 }, env: { a: 0.005, d: 0.3, v: 0.08 }, trem: { rate: 30, depth: 0.7 } }],
            max: 1, gap: 0.15,
        },
        fall: {
            label: 'A drop', group: 'play', desc: 'a short whistle sliding down',
            layers: [{ wave: 'pulse', duty: 0.5, f: hz('A5'), sweep: { to: 0.5, t: 0.3 }, env: { a: 0.01, d: 0.3, v: 0.03 }, lp: 2400 }],
            max: 1, gap: 0.2,
        },
        card: {
            label: 'The vault card', group: 'play', desc: 'a three-note rise for each vault (a step higher each time)',
            layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.12, 4], [0.24, 7]], env: { a: 0.004, d: 0.1, s: 0.7, h: 0.35, r: 0.3, v: 0.06 }, lp: 3000 },
                { wave: 'tri', f: R / 2, env: { a: 0.004, d: 0.6, v: 0.1 } }],
            max: 1, gap: 0.5,
        },
        exitOpen: {
            label: 'The exit rises', group: 'play', desc: 'a climbing arpeggio as the ladder grows out of the top',
            layers: [{ wave: 'pulse', duty: 0.125, f: R, arp: { n: [0, 4, 7, 12, 16, 19], step: 0.06 }, env: { a: 0.002, d: 0.1, s: 0.6, h: 0.3, r: 0.2, v: 0.06 }, lp: 3400 }],
            max: 1, gap: 0.5,
        },
        key: {
            label: 'The key', group: 'play', desc: 'a bright bell and the bars sliding up',
            layers: [{ wave: 'tri', f: hz('E5'), env: { a: 0.003, d: 0.8, v: 0.14 } }, { wave: 'noise', f: 1200, at: 0.1, lp: 1200, env: { a: 0.05, d: 0.4, v: 0.03 } }],
            max: 1, gap: 0.5,
        },
        crown: {
            label: 'The crown', group: 'play', desc: 'a big bell with a rising sparkle',
            layers: [{ wave: 'tri', f: hz('A3'), env: { a: 0.004, d: 1.6, v: 0.2 } }, { wave: 'tri', f: hz('E4'), env: { a: 0.004, d: 1.3, v: 0.1 } },
                { wave: 'pulse', duty: 0.125, f: hz('A5'), arp: { n: [0, 4, 7, 12], step: 0.07 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.2, r: 0.3, v: 0.04 }, lp: 3200 }],
            max: 1, gap: 1,
        },
        siren: {
            label: 'The alarm', group: 'play', desc: 'a two-tone siren, about two seconds',
            layers: [{ wave: 'pulse', duty: 0.5, f: hz('E5'), seq: [0, 1, 2, 3, 4, 5].map((i) => [i * 0.3, i % 2 ? -5 : 0]), env: { a: 0.02, d: 0.1, s: 0.8, h: 1.7, r: 0.15, v: 0.05 }, lp: 2200 }],
            max: 1, gap: 2,
        },
        tally: {
            label: 'The tally counts', group: 'play', desc: 'a dry little counting click',
            layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, env: { a: 0.001, d: 0.025, v: 0.03 }, lp: 3000 }],
            max: 2, gap: 0.04,
        },
        tallyLine: {
            label: 'A tally banked', group: 'play', desc: 'the adding machine stamps a line: a metal click and low bell',
            layers: [{ wave: 'metal', f: 6200, lp: 2400, env: { a: 0.001, d: 0.04, v: 0.035 } },
                { wave: 'tri', f: R, env: { a: 0.002, d: 0.18, v: 0.07 } }],
            max: 1, gap: 0.15,
        },
        escape: {
            label: 'Out of the vault', group: 'play', desc: 'the ladder climb answered by three bright cash-register bells',
            layers: [{ wave: 'tri', f: R, seq: [[0, 0], [0.12, 7], [0.24, 12]], env: { a: 0.002, d: 0.1, s: 0.5, h: 0.28, r: 0.5, v: 0.1 } },
                { wave: 'metal', f: 7200, lp: 2800, env: { a: 0.001, d: 0.08, v: 0.025 } }],
            max: 1, gap: 0.8,
        },
        extra: {
            label: 'An extra runner', group: 'play', desc: 'a quick bright fanfare',
            layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 4, 7, 12, 7, 12], step: 0.08 }, env: { a: 0.003, d: 0.1, s: 0.6, h: 0.4, r: 0.3, v: 0.06 }, lp: 3300 }],
            max: 1, gap: 1,
        },
        warn: {
            label: 'A guard is coming back', group: 'play', desc: 'a faint high double blip at the top of the vault',
            layers: [{ wave: 'pulse', duty: 0.25, f: hz('B5'), seq: [[0, 0], [0.1, 0]], env: { a: 0.001, d: 0.05, s: 0.5, h: 0.12, r: 0.03, v: 0.025 }, lp: 3000 }],
            max: 1, gap: 0.3,
        },
    },
    cues: { Start: null, Hit: null, Miss: null, Bonus: null, Tick: null },
    events: {
        card: (s, e) => s.play('card', { pitch: ((e.n | 0) - 1) * 2 }),
        go: (s, e) => { if (e.card && e.n === 1) s.play('start'); },
        dig: (s) => s.play('dig'),
        clank: (s) => s.play('clank'),
        gold: (s, e) => s.play('gold', { pitch: Math.max(0, 12 - (e.left | 0)) }),
        pickpocket: (s) => s.play('gold', { pitch: 5 }),
        trap: (s, e) => { s.play('trap'); if (e.dropped) s.play('gold', { delay: 0.08, pitch: -5 }); },
        bury: (s) => s.play('bury'),
        refill: (s) => s.play('refill'),
        crumble: (s) => s.play('crumble'),
        fall: (s) => s.play('fall'),
        exitOpen: (s) => s.play('exitOpen'),
        key: (s) => s.play('key'),
        crown: (s) => s.play('crown'),
        alarm: (s, e) => { if (e.awake) s.play('siren', { delay: 0.4 }); },
        tally: (s) => s.play('tally'),
        tallyLine: (s, e) => s.play('tallyLine', { pitch: (e.i | 0) * 4 }),
        extraLife: (s) => s.play('extra'),
        guardWarn: (s) => s.play('warn'),
        escape: (s, e) => s.play('escape', { pitch: ((e.n | 0) - 1) * 2 }),
        land: null, ready: null, caught: null, tallyStart: null, climbOut: null, snatch: null, clang: null, guardIn: null,
    },
    silent: {
        land: 'a landing: the fall\'s whistle is enough',
        ready: 'READY after a catch: the runner lost sound (Die) has just played',
        caught: 'the Die cue plays the runner lost sound',
        tallyStart: 'the escape fanfare is still ringing',
        climbOut: 'a guard leaves its hole: the picture shows it (the struggle)',
        snatch: 'a guard picks gold up: the picture shows the nugget',
        clang: 'the warden steps over a hole: kept quiet so the trap sound stays his opposite',
        guardIn: 'the warning blip already played',
    },
});
