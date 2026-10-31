// THE CABINET'S SOUND · TUNNEL RAT (the digger on THE JUNCTION's floor). Key: F, bouncy. Chip synthesis only, built on the
// floor's stock voice (js/cabinet/sound/palettes/floor.js): a soft crunch for digging, a hiss for the hose, a rising whoomp
// per pump stroke and a bright pop, a hiss before the fire and a roar with it, a rattle for a loose rock and a thud when it
// lands, a little rising jingle on each depth's card, a fanfare for a clear, and a bigger, deeper pump and pop for the queen.
// It reads the sim's own events (sim.events, recordEvents) and never writes to the game.
import { hz } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('F4');

const sounds = {
    dig: {
        label: 'Digging', group: 'play', desc: 'a soft low crunch as the blade cuts earth',
        layers: [{ wave: 'noise', f: 1800, lp: 900, env: { a: 0.002, d: 0.05, v: 0.035 } }],
        max: 1, gap: 0.12, vary: { pitch: 80, level: 0.2 },
    },
    hose: {
        label: 'The hose', group: 'play', desc: 'a quick hiss rising as the hose shoots out',
        layers: [{ wave: 'noise', f: 3000, sweep: { to: 2, t: 0.08 }, lp: 2600, env: { a: 0.002, d: 0.08, v: 0.05 } },
            { wave: 'pulse', duty: 0.25, f: R, sweep: { to: 1.5, t: 0.06 }, env: { a: 0.001, d: 0.05, v: 0.03 }, lp: 2400 }],
        max: 2, gap: 0.08,
    },
    hook: {
        label: 'Hooked', group: 'play', desc: 'a soft thunk: the hose has caught something',
        layers: [{ wave: 'tri', f: R / 2, sweep: { to: 0.7, t: 0.06 }, env: { a: 0.001, d: 0.08, v: 0.12 } }],
        max: 1, gap: 0.08,
    },
    pump: {
        label: 'A pump stroke', group: 'play', desc: 'a rising whoomp, a step higher each stroke',
        layers: [{ wave: 'pulse', duty: 0.5, f: R / 2, sweep: { to: 1.6, t: 0.12 }, env: { a: 0.004, d: 0.12, v: 0.06 }, lp: 1600 },
            { wave: 'noise', f: 1200, lp: 700, env: { a: 0.01, d: 0.1, v: 0.03 } }],
        max: 2, gap: 0.05,
    },
    pop: {
        label: 'A pest pops', group: 'play', desc: 'a bright pop: a noise burst and a blip falling',
        layers: [{ wave: 'noise', f: 6000, sweep: { to: 0.3, t: 0.15 }, lp: 3000, env: { a: 0.001, d: 0.16, v: 0.11 } },
            { wave: 'pulse', duty: 0.25, f: R * 2, sweep: { to: 0.5, t: 0.1 }, env: { a: 0.001, d: 0.1, v: 0.05 }, lp: 3000 }],
        max: 3, gap: 0.04, vary: { pitch: 60, level: 0.1 },
    },
    hiss: {
        label: 'A fire wind-up', group: 'play', desc: 'a hiss opening up: a lizard (or a scorcher, lower) is about to breathe',
        layers: [{ wave: 'noise', f: 2500, lp: { f: 600, to: 2400, t: 0.6 }, env: { a: 0.3, d: 0.4, v: 0.04 } }],
        max: 2, gap: 0.3,
    },
    roar: {
        label: 'Fire', group: 'play', desc: 'a short roar down the tunnel',
        layers: [{ wave: 'noise', f: 900, lp: { f: 1400, to: 500, t: 0.8 }, env: { a: 0.02, d: 0.8, v: 0.08 } },
            { wave: 'tri', f: R / 4, sweep: { to: 0.8, t: 0.6 }, env: { a: 0.02, d: 0.6, v: 0.08 } }],
        max: 2, gap: 0.2,
    },
    ghost: {
        label: 'A ghost / a shade', group: 'play', desc: 'a faint warble: something is moving through the earth',
        layers: [{ wave: 'tri', f: R, sweep: { to: 1.3, t: 0.3 }, vib: { rate: 9, depth: 40 }, env: { a: 0.05, d: 0.3, v: 0.05 } }],
        max: 1, gap: 0.4,
    },
    drill: {
        label: 'A driller boring', group: 'play', desc: 'a low buzz',
        layers: [{ wave: 'metal', f: 2000, lp: 1200, trem: { rate: 18, depth: 0.6 }, env: { a: 0.01, d: 0.2, v: 0.03 } }],
        max: 1, gap: 0.3,
    },
    rattle: {
        label: 'A rock comes loose', group: 'play', desc: 'a dry rattle: the rock wobbles',
        layers: [{ wave: 'metal', f: 9000, lp: 2400, trem: { rate: 12, depth: 0.8 }, env: { a: 0.005, d: 0.3, v: 0.04 } }],
        max: 2, gap: 0.2,
    },
    thud: {
        label: 'A rock lands', group: 'play', desc: 'a deep thump and a crumble',
        layers: [{ wave: 'tri', f: hz('F2'), sweep: { to: 0.5, t: 0.2 }, env: { a: 0.002, d: 0.25, v: 0.2 } },
            { wave: 'noise', f: 2000, sweep: { to: 0.3, t: 0.3 }, lp: 1200, env: { a: 0.002, d: 0.3, v: 0.08 } }],
        max: 2, gap: 0.1,
    },
    jingle: {
        label: 'The depth card', group: 'play', desc: 'a short rising jingle for each depth (higher each time)',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.1, 4], [0.2, 7], [0.3, 12], [0.45, 7], [0.55, 12]], env: { a: 0.003, d: 0.05, s: 0.7, h: 0.6, r: 0.2, v: 0.06 }, lp: 3000 },
            { wave: 'tri', f: R / 2, seq: [[0, 0], [0.3, 5], [0.45, 7]], env: { a: 0.004, d: 0.2, s: 0.6, h: 0.5, r: 0.2, v: 0.12 } }],
        max: 1, gap: 0.8,
    },
    siren: {
        label: 'The queen\'s depth', group: 'play', desc: 'a low two-tone warning on the last card',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A3'), seq: [0, 1, 2, 3, 4, 5].map((i) => [i * 0.25, i % 2 ? -3 : 0]), env: { a: 0.02, d: 0.1, s: 0.85, h: 1.4, r: 0.15, v: 0.06 }, lp: 1800 }],
        max: 1, gap: 2,
    },
    fanfare: {
        label: 'Depth clear', group: 'play', desc: 'a quick climb up the chord and a held top note',
        layers: [{ wave: 'pulse', duty: 0.125, f: R * 2, arp: { n: [0, 4, 7, 12], step: 0.07 }, env: { a: 0.002, d: 0.1, s: 0.7, h: 0.35, r: 0.25, v: 0.06 }, lp: 3200 },
            { wave: 'tri', f: R / 2, env: { a: 0.004, d: 0.5, v: 0.12 } }],
        max: 1, gap: 0.5,
    },
    extra: {
        label: 'Extra rat', group: 'play', desc: 'a bright double arpeggio: a life earned',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 7, 12, 16, 19, 24], step: 0.06 }, env: { a: 0.002, d: 0.1, s: 0.6, h: 0.3, r: 0.2, v: 0.06 }, lp: 3200 }],
        max: 1, gap: 1,
    },
    alarm: {
        label: 'HURRY UP', group: 'play', desc: 'a short rising two-note alarm: the pests speed up',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('C5'), seq: [[0, 0], [0.12, 5], [0.24, 0], [0.36, 5]], env: { a: 0.005, d: 0.05, s: 0.8, h: 0.4, r: 0.1, v: 0.05 }, lp: 2400 }],
        max: 1, gap: 1,
    },
    scurry: {
        label: 'The last one runs', group: 'play', desc: 'a quick scurrying climb (and a falling one when it gets away)',
        layers: [{ wave: 'pulse', duty: 0.125, f: R, arp: { n: [0, 2, 4, 5, 7, 9], step: 0.04 }, env: { a: 0.002, d: 0.05, s: 0.6, h: 0.2, r: 0.08, v: 0.05 }, lp: 3000 }],
        max: 1, gap: 0.4,
    },
    bigPump: {
        label: 'Pumping the queen', group: 'play', desc: 'a deeper whoomp, climbing toward the pop',
        layers: [{ wave: 'pulse', duty: 0.5, f: R / 4, sweep: { to: 1.8, t: 0.16 }, env: { a: 0.004, d: 0.16, v: 0.08 }, lp: 1200 },
            { wave: 'tri', f: R / 4, sweep: { to: 1.8, t: 0.16 }, env: { a: 0.004, d: 0.14, v: 0.1 } }],
        max: 2, gap: 0.05,
    },
    deflate: {
        label: 'The queen shrinks', group: 'play', desc: 'a soft falling squeak: let go and she shrinks back',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, sweep: { to: 0.6, t: 0.15 }, env: { a: 0.003, d: 0.15, v: 0.03 }, lp: 2000 }],
        max: 1, gap: 0.15,
    },
    egg: {
        label: 'An egg', group: 'play', desc: 'a gurgle as she strains, a plop as it drops',
        layers: [{ wave: 'tri', f: R / 2, sweep: { to: 0.5, t: 0.12 }, vib: { rate: 14, depth: 80 }, env: { a: 0.01, d: 0.15, v: 0.1 } }],
        max: 1, gap: 0.3,
    },
    bigPop: {
        label: 'The queen pops', group: 'end', desc: 'a long burst with a low boom under it',
        layers: [{ wave: 'noise', f: 4500, sweep: { to: 0.1, t: 0.9 }, lp: { f: 3000, to: 250, t: 0.9 }, env: { a: 0.002, d: 1.0, v: 0.16 } },
            { wave: 'tri', f: hz('F2'), sweep: { to: 0.4, t: 0.6 }, env: { a: 0.003, d: 0.7, v: 0.22 } }],
        max: 1, gap: 1,
    },
};

export const SOUND = floorSound('tunnelrat', 'TUNNEL RAT', R, {
    personality: 'a bouncy digger in F: crunch, hiss, whoomp and pop, a rattle and a thud for the rocks, a jingle a depth, the queen deeper',
    sounds,
    // the sim's own events carry the sounds; the SDK cues stay quiet except the coin and the win
    cues: { Start: null, Hit: null, Miss: null, Die: null, Bonus: null, Tick: null },
    events: {
        card: (s, e) => { s.play('jingle', { pitch: Math.min(7, (e.stage | 0) - 1) }); if (e.queen) s.play('siren', { delay: 0.8 }); },
        go: (s, e) => { if (e.first && !s.st.went) { s.st.went = true; s.play('start'); } },
        dig: (s) => s.play('dig'),
        hose: (s) => s.play('hose'),
        hoseMiss: null,
        hook: (s) => s.play('hook'),
        pump: (s, e) => s.play('pump', { pitch: ((e.n | 0) - 1) * 3 }),
        pop: (s) => s.play('pop'),
        breath: (s, e) => s.play('hiss', { pitch: e.scorch ? -5 : 0 }),
        fire: (s, e) => s.play('roar', { pitch: e.scorch ? -3 : 0 }),
        ghost: (s) => s.play('ghost'),
        shadeOut: (s) => s.play('ghost', { pitch: 5 }),
        drill: (s, e) => s.play('drill', { pitch: e.queen ? -7 : 0 }),
        wobble: (s) => s.play('rattle'),
        rockFall: (s) => s.play('miss'),
        crush: (s, e) => { s.play('pop', { pitch: -5 }); s.play('bonus', { pitch: Math.min(12, ((e.n | 0) - 1) * 4 + (e.chained ? 5 : 0)) }); },
        rockLand: (s) => s.play('thud'),
        vegUp: (s) => s.play('tick', { pitch: 7 }),
        veg: (s) => s.play('bonus', { pitch: 7 }),
        flee: (s) => s.play('scurry'),
        escape: (s) => s.play('scurry', { pitch: -12 }),
        die: (s) => s.play('lifeLost'),
        extraLife: (s) => s.play('extra'),
        hurry: (s) => s.play('alarm'),
        stageClear: (s, e) => s.play(e.queen ? 'bigPop' : 'fanfare'),
        tally: (s, e) => { if (e.value > 0) s.play('tick'); },
        tallyDone: (s, e) => { if (!e.last) s.play('bonus'); },
        queenLay: (s) => s.play('egg'),
        queenEgg: (s) => s.play('egg', { pitch: 5 }),
        queenPump: (s, e) => s.play('bigPump', { pitch: Math.min(12, e.n | 0) }),
        queenShrink: (s) => s.play('deflate'),
        queenWound: (s) => { s.play('thud'); s.play('hit', { pitch: -5 }); },
        queenPop: (s) => s.play('bigPop'),
    },
});
