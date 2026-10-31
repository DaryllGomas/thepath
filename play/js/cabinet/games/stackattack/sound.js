// THE NODE · world 1 · STACK ATTACK on the Cabinet Engine · THE SOUND (chip patches only). Key: E, bright and dry.
// The floor's stock voice (js/cabinet/sound/palettes/floor.js) with the game's own sounds over it, played from the sim's
// events (sim.events, switched on by the floor's adapter): a dry click for a slide, a blip for a turn, a thud for a lock,
// a whoosh-thud for the hard drop, a climb of one to four notes for one to four rows (the fourth a chord: STACK ATTACK),
// a boom for a bomb, a bell for gold, a grinding rise for the flood and the walls, a stage jingle on every card and a
// fanfare on its tally. The eight SDK cues are covered by the events, so only Coin and Win sound from them.
import { hz, JI } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('E4');

const sounds = {
    shift: {
        label: 'A slide', group: 'play', desc: 'the piece steps a column: a dry little click',
        layers: [{ wave: 'metal', f: 12000, env: { a: 0.001, d: 0.015, v: 0.02 }, lp: 2600 }],
        max: 1, gap: 0.045, vary: { pitch: 30, level: 0.1 },
    },
    turn: {
        label: 'A turn', group: 'play', desc: 'the piece turns: a short blip up',
        layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, sweep: { to: 1.25, t: 0.03 }, env: { a: 0.001, d: 0.04, v: 0.035 }, lp: 3200 }],
        max: 1, gap: 0.04,
    },
    lock: {
        label: 'A lock', group: 'play', desc: 'the piece sets on the stack: a soft low thud',
        layers: [{ wave: 'tri', f: R / 2, sweep: { to: 0.6, t: 0.06 }, env: { a: 0.001, d: 0.08, v: 0.12 } },
            { wave: 'noise', f: 3000, env: { a: 0.001, d: 0.03, v: 0.03 }, lp: 1800 }],
        max: 2, gap: 0.05,
    },
    drop: {
        label: 'The hard drop', group: 'play', desc: 'UP: a quick whoosh down and a heavier thud',
        layers: [{ wave: 'noise', f: 4000, sweep: { to: 0.3, t: 0.08 }, lp: { f: 3500, to: 800, t: 0.08 }, env: { a: 0.001, d: 0.09, v: 0.06 } },
            { wave: 'tri', f: R / 2, at: 0.05, sweep: { to: 0.5, t: 0.08 }, env: { a: 0.001, d: 0.12, v: 0.16 } }],
        max: 1, gap: 0.06,
    },
    rows: {
        label: 'Rows clear', group: 'play', desc: 'a quick climb up the chord: one note a row cleared (the handler cuts it short)',
        layers: [{ wave: 'pulse', duty: 0.125, f: R * 2, arp: { n: [0, 4, 7, 12], step: 0.055 }, env: { a: 0.002, d: 0.08, s: 0.6, h: 0.1, r: 0.1, v: 0.055 }, lp: 3400 },
            { wave: 'tri', f: R, env: { a: 0.002, d: 0.2, v: 0.08 } }],
        max: 2, gap: 0.08,
    },
    attack: {
        label: 'STACK ATTACK', group: 'play', desc: 'four rows at once: the full chord held, a noise sweep up under it',
        layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, arp: { n: [0, 4, 7, 12, 16], step: 0.05 }, env: { a: 0.002, d: 0.1, s: 0.7, h: 0.35, r: 0.3, v: 0.07 }, lp: 3400 },
            { wave: 'tri', f: R / 2, env: { a: 0.004, d: 0.6, v: 0.18 } },
            { wave: 'noise', f: 1200, sweep: { to: 3, t: 0.4 }, lp: { f: 800, to: 4000, t: 0.4 }, env: { a: 0.05, d: 0.4, v: 0.04 } }],
        max: 1, gap: 0.3,
    },
    combo: {
        label: 'A combo', group: 'play', desc: 'locks that clear in a row: a two-note blip, higher each time',
        layers: [{ wave: 'pulse', duty: 0.125, f: R * 2 * JI.fifth, seq: [[0, 0], [0.05, 5]], env: { a: 0.001, d: 0.12, v: 0.045 }, lp: 3300 }],
        max: 1, gap: 0.08,
    },
    boom: {
        label: 'A bomb', group: 'play', desc: 'a bomb goes off: a noise burst falling away over a low thump',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.15, t: 0.35 }, lp: { f: 3200, to: 400, t: 0.35 }, env: { a: 0.002, d: 0.38, v: 0.13 } },
            { wave: 'tri', f: hz('E2'), sweep: { to: 0.5, t: 0.25 }, env: { a: 0.002, d: 0.28, v: 0.18 } }],
        max: 3, gap: 0.05, vary: { pitch: 90, level: 0.12, time: 0.01 },
    },
    gold: {
        label: 'Gold dug out', group: 'play', desc: 'a bright bell and a sparkle up the chord',
        layers: [{ wave: 'tri', f: R * 2, env: { a: 0.004, d: 1.0, v: 0.16 } }, { wave: 'tri', f: R * 2 * JI.fifth, env: { a: 0.006, d: 0.8, v: 0.07 } },
            { wave: 'pulse', duty: 0.125, f: R * 4, arp: { n: [0, 4, 7, 12], step: 0.06 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.15, r: 0.25, v: 0.035 }, lp: 3200 }],
        max: 1, gap: 0.3,
    },
    rumble: {
        label: 'Telegraph: the floor rumbles', group: 'play', desc: 'a row is coming (or the walls are about to move): a low rumble swelling',
        layers: [{ wave: 'tri', f: hz('E2'), env: { a: 0.3, d: 1.0, s: 0.7, v: 0.13 }, vib: { rate: 9, depth: 70 } },
            { wave: 'noise', f: 500, lp: { f: 250, to: 700, t: 0.9 }, env: { a: 0.3, d: 0.9, v: 0.06 } }],
        max: 1, gap: 0.6,
    },
    grind: {
        label: 'A row rises / a wall moves', group: 'play', desc: 'steel grinding: a buzz stepping up over noise',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('E3'), seq: [[0, 0], [0.06, 2], [0.12, 4]], env: { a: 0.005, d: 0.25, v: 0.05 }, lp: 1600 },
            { wave: 'noise', f: 2500, lp: 1400, env: { a: 0.005, d: 0.25, v: 0.07 } }],
        max: 1, gap: 0.2,
    },
    danger: {
        label: 'Danger', group: 'play', desc: 'the stack nears the ceiling: two low warning beeps',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('B3'), seq: [[0, 0], [0.16, 0]], env: { a: 0.004, d: 0.05, s: 0.8, h: 0.24, r: 0.05, v: 0.05 }, lp: 1800, trem: { rate: 6, depth: 0.9 } }],
        max: 1, gap: 1,
    },
    jingle: {
        label: 'The stage card', group: 'play', desc: 'a short four-note phrase as each stage card comes up (a step higher each stage)',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.12, 4], [0.24, 7], [0.36, 12]], env: { a: 0.003, d: 0.08, s: 0.7, h: 0.4, r: 0.25, v: 0.06 }, lp: 3000 },
            { wave: 'tri', f: R / 2, seq: [[0, 0], [0.24, 7]], env: { a: 0.004, d: 0.3, s: 0.5, h: 0.3, r: 0.2, v: 0.12 } }],
        max: 1, gap: 1,
    },
    fanfare: {
        label: 'Stage clear', group: 'play', desc: 'the goal met: a bright fanfare up the chord',
        layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, arp: { n: [0, 4, 7, 12, 7, 12, 16], step: 0.08 }, env: { a: 0.003, d: 0.1, s: 0.6, h: 0.45, r: 0.4, v: 0.06 }, lp: 3300 },
            { wave: 'tri', f: R / 2, env: { a: 0.01, d: 1.0, v: 0.14 } }],
        max: 1, gap: 1,
    },
    extra: {
        label: 'Extra stack', group: 'play', desc: 'an extra life: a quick bright run up two octaves',
        layers: [{ wave: 'pulse', duty: 0.125, f: R * 2, arp: { n: [0, 7, 12, 19, 24], step: 0.05 }, env: { a: 0.002, d: 0.1, s: 0.6, h: 0.2, r: 0.2, v: 0.055 }, lp: 3400 }],
        max: 1, gap: 0.5,
    },
};

export const SOUND = floorSound('stackattack', 'STACK ATTACK', R, {
    personality: 'a bright, dry falling-blocks board: clicks and thuds for the pieces, a climb for each row, booms, a gold bell, grinding steel',
    sounds,
    cues: { Start: null, Hit: null, Miss: null, Die: null, Bonus: null, Tick: null },
    events: {
        card: (s, e) => s.play('jingle', { pitch: e.final ? 7 : (e.stage - 1) }),
        go: (s) => s.play('start'),
        shift: (s) => s.play('shift'),
        turn: (s) => s.play('turn'),
        lock: (s) => s.play('lock'),
        drop: (s) => s.play('drop'),
        lines: (s, e) => { if (e.n >= 4) s.play('attack', { pitch: e.b2b ? 5 : 0 }); else s.play('rows', { pitch: (e.n - 1) * 2 }); },
        combo: (s, e) => s.play('combo', { pitch: Math.min(12, (e.n | 0) * 2) }),
        bomb: (s, e) => { const n = Math.min(3, (e.n | 0) || 1); for (let i = 0; i < n; i++) s.play('boom', { delay: i * 0.08, pitch: -i * 2 }); },
        gold: (s) => s.play('gold'),
        floodWarn: (s) => s.play('rumble'),
        flood: (s) => s.play('grind'),
        squeezeWarn: (s) => s.play('rumble', { pitch: 5 }),
        squeeze: (s) => { s.play('grind', { pitch: -5 }); s.play('boom', { level: 0.6, pitch: -7 }); },
        danger: (s) => s.play('danger'),
        stageClear: (s) => s.play('fanfare'),
        tally: (s, e) => s.play(e.last ? 'bonus' : 'tick'),
        topOut: (s) => s.play('lifeLost'),
        extra: (s) => s.play('extra'),
        wellClear: (s) => s.play('ward'),
    },
});
