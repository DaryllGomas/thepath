// THE CABINET'S SOUND · IRON DOJO (Ironclad Amusements, 1985) on THE JUNCTION's floor. Key: A, the minor pentatonic of a
// temple bell. Chip synthesis only (js/cabinet/sound/chip.js), built on the floor's stock voice (palettes/floor.js):
// a swish for every punch and kick, a thud when one lands, a wooden clack for a parry, a gong when a master wakes and a
// bigger one when he falls, a rising tell on his wind-up, clay shattering, a hiss for a ghost, wind, a chain blip that
// climbs with the multiplier, the floor's jingle on its card and the tally counting up the stairs.
// The sim says it all as events (sim.js _emit); the eight SDK cues stay silent here (the events carry the sound), Coin aside.
import { hz } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('A3');

const sounds = {
    swish: {
        label: 'A punch or a kick', group: 'play', desc: 'a short swish of air (a kick is lower and longer)',
        layers: [{ wave: 'noise', f: 3000, sweep: { to: 2, t: 0.06 }, lp: { f: 1800, to: 3600, t: 0.06 }, env: { a: 0.004, d: 0.07, v: 0.035 } }],
        max: 2, gap: 0.04, vary: { pitch: 80, level: 0.15 },
    },
    thud: {
        label: 'A blow lands', group: 'play', desc: 'a dull thump with a bright snap on top',
        layers: [{ wave: 'tri', f: hz('A2'), sweep: { to: 0.5, t: 0.08 }, env: { a: 0.001, d: 0.1, v: 0.16 } },
            { wave: 'noise', f: 6000, lp: 2600, env: { a: 0.001, d: 0.04, v: 0.06 } },
            { wave: 'pulse', duty: 0.25, f: R * 2, sweep: { to: 0.6, t: 0.05 }, env: { a: 0.001, d: 0.05, v: 0.04 }, lp: 2600 }],
        max: 3, gap: 0.03, vary: { pitch: 90, level: 0.12 },
    },
    clack: {
        label: 'Parried', group: 'play', desc: 'wood on wood: a hard dry clack',
        layers: [{ wave: 'metal', f: 9000, env: { a: 0.001, d: 0.05, v: 0.06 }, lp: 2400 }, { wave: 'pulse', duty: 0.5, f: hz('E4'), env: { a: 0.001, d: 0.04, v: 0.04 }, lp: 2000 }],
        max: 2, gap: 0.06,
    },
    ouch: {
        label: 'You are hit', group: 'play', desc: 'a low buzz falling away',
        layers: [{ wave: 'pulse', duty: 0.5, f: R, sweep: { to: 0.5, t: 0.18, q: 1 / 60 }, env: { a: 0.002, d: 0.2, v: 0.06 }, lp: 1600 },
            { wave: 'noise', f: 2000, lp: 1200, env: { a: 0.002, d: 0.1, v: 0.06 } }],
        max: 2, gap: 0.1,
    },
    squeeze: {
        label: 'Held', group: 'play', desc: 'a grabber squeezes: a soft low pulse',
        layers: [{ wave: 'tri', f: hz('E2'), env: { a: 0.01, d: 0.12, v: 0.08 } }],
        max: 1, gap: 0.2,
    },
    free: {
        label: 'Shaken free', group: 'play', desc: 'a quick rising pair',
        layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, seq: [[0, 0], [0.05, 7]], env: { a: 0.002, d: 0.12, v: 0.05 }, lp: 3000 }],
        max: 1, gap: 0.2,
    },
    hop: {
        label: 'A jump', group: 'play', desc: 'a small rising blip',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('E4'), sweep: { to: 1.6, t: 0.08 }, env: { a: 0.002, d: 0.09, v: 0.035 }, lp: 3000 }],
        max: 1, gap: 0.1,
    },
    knife: {
        label: 'Something thrown', group: 'play', desc: 'a thin falling whistle (knives, blades, the ring)',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('E5'), sweep: { to: 0.6, t: 0.14 }, env: { a: 0.002, d: 0.15, v: 0.03 }, lp: 3000 }],
        max: 2, gap: 0.08,
    },
    crash: {
        label: 'Clay breaks', group: 'play', desc: 'a pot shatters: a short noise burst',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.3, t: 0.2 }, lp: { f: 3200, to: 900, t: 0.2 }, env: { a: 0.001, d: 0.22, v: 0.1 } },
            { wave: 'metal', f: 7000, lp: 2600, env: { a: 0.001, d: 0.08, v: 0.03 } }],
        max: 2, gap: 0.06,
    },
    creak: {
        label: 'A pot sways', group: 'play', desc: 'a creak on the rope: the warning',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A3'), vib: { rate: 18, depth: 80 }, env: { a: 0.02, d: 0.25, v: 0.025 }, lp: 1200 }],
        max: 1, gap: 0.3,
    },
    eerie: {
        label: 'A ghost', group: 'play', desc: 'a cold wavering tone as a ghost steps out of the glass',
        layers: [{ wave: 'tri', f: hz('E4'), vib: { rate: 6, depth: 40 }, sweep: { to: 1.5, t: 0.6 }, env: { a: 0.15, d: 0.6, v: 0.07 } }],
        max: 1, gap: 0.5,
    },
    wind: {
        label: 'Wind', group: 'play', desc: 'a gust: noise swelling and falling',
        layers: [{ wave: 'noise', f: 700, lp: { f: 500, to: 1600, t: 0.8 }, env: { a: 0.4, d: 1.8, v: 0.06 } }],
        max: 1, gap: 1,
    },
    gong: {
        label: 'A master wakes', group: 'play', desc: 'a low gong',
        layers: [{ wave: 'tri', f: hz('A1') * 2, env: { a: 0.004, d: 1.6, v: 0.2 } }, { wave: 'metal', f: 1200, lp: 900, env: { a: 0.004, d: 0.8, v: 0.04 } },
            { wave: 'pulse', duty: 0.5, f: hz('E3'), env: { a: 0.004, d: 1.0, v: 0.03 }, lp: 1200 }],
        max: 1, gap: 1,
    },
    tell: {
        label: 'His wind-up', group: 'play', desc: 'a short rising tone: a master is about to strike',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('A4'), sweep: { to: 1.5, t: 0.25 }, env: { a: 0.01, d: 0.25, v: 0.04 }, lp: 2800 }],
        max: 1, gap: 0.15,
    },
    whoosh: {
        label: 'His blow', group: 'play', desc: 'a heavy swing',
        layers: [{ wave: 'noise', f: 1500, sweep: { to: 2.5, t: 0.12 }, lp: { f: 1000, to: 2800, t: 0.12 }, env: { a: 0.005, d: 0.16, v: 0.07 } }],
        max: 1, gap: 0.08,
    },
    slam: {
        label: 'The giant slams', group: 'play', desc: 'a deep thud and a rumble',
        layers: [{ wave: 'tri', f: hz('A1'), sweep: { to: 0.5, t: 0.5 }, env: { a: 0.002, d: 0.6, v: 0.26 } },
            { wave: 'noise', f: 1200, lp: { f: 1000, to: 200, t: 0.6 }, env: { a: 0.004, d: 0.6, v: 0.12 } }],
        max: 1, gap: 0.3,
    },
    fire: {
        label: 'A palm of fire', group: 'play', desc: 'a roaring whoosh',
        layers: [{ wave: 'noise', f: 2500, lp: { f: 800, to: 2400, t: 0.3 }, env: { a: 0.02, d: 0.4, v: 0.09 } }, { wave: 'tri', f: hz('A2'), sweep: { to: 1.5, t: 0.3 }, env: { a: 0.02, d: 0.35, v: 0.1 } }],
        max: 1, gap: 0.2,
    },
    roar: {
        label: 'The master burns', group: 'play', desc: 'the iron master at half strength: a growl rising',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A2'), sweep: { to: 2, t: 0.6 }, vib: { rate: 14, depth: 60 }, env: { a: 0.05, d: 0.7, v: 0.07 }, lp: 1400 },
            { wave: 'noise', f: 900, lp: 900, env: { a: 0.05, d: 0.6, v: 0.06 } }],
        max: 1, gap: 1,
    },
    bigGong: {
        label: 'A master falls', group: 'play', desc: 'a big gong with the chord over it',
        layers: [{ wave: 'tri', f: hz('A1') * 2, env: { a: 0.004, d: 2.2, v: 0.24 } }, { wave: 'metal', f: 900, lp: 800, env: { a: 0.004, d: 1.2, v: 0.05 } },
            { wave: 'pulse', duty: 0.25, f: R * 2, arp: { n: [0, 3, 7, 12], step: 0.08 }, env: { a: 0.003, d: 0.12, s: 0.6, h: 0.3, r: 0.3, v: 0.05 }, lp: 3000 }],
        max: 1, gap: 1,
    },
    chain: {
        label: 'The chain climbs', group: 'play', desc: 'a two-note blip, higher at each multiplier',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('E5'), seq: [[0, 0], [0.05, 5]], env: { a: 0.001, d: 0.14, v: 0.05 }, lp: 3200 }],
        max: 1, gap: 0.08,
    },
    oneUp: {
        label: 'Extra life', group: 'play', desc: 'a bright rising run',
        layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, arp: { n: [0, 3, 5, 7, 10, 12], step: 0.06 }, env: { a: 0.002, d: 0.1, s: 0.6, h: 0.3, r: 0.2, v: 0.06 }, lp: 3200 }],
        max: 1, gap: 0.5,
    },
    sip: {
        label: 'Tea', group: 'play', desc: 'energy back: a soft chime',
        layers: [{ wave: 'tri', f: hz('E5'), seq: [[0, 0], [0.08, 3], [0.16, 7]], env: { a: 0.003, d: 0.4, v: 0.1 } }],
        max: 1, gap: 0.3,
    },
    jingle: {
        label: 'The floor card', group: 'play', desc: 'a pentatonic phrase, a step higher each floor',
        layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, seq: [[0, 0], [0.14, 3], [0.28, 5], [0.42, 7], [0.56, 10]], env: { a: 0.004, d: 0.1, s: 0.7, h: 0.6, r: 0.3, v: 0.05 }, lp: 2800 },
            { wave: 'tri', f: R, seq: [[0, 0], [0.28, -5], [0.56, 0]], env: { a: 0.004, d: 0.3, s: 0.6, h: 0.5, r: 0.3, v: 0.12 } }],
        max: 1, gap: 1,
    },
    count: {
        label: 'The tally', group: 'play', desc: 'a dry tick as the bonus counts up',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('A5'), env: { a: 0.001, d: 0.025, v: 0.03 }, lp: 3200 }],
        max: 1, gap: 0.05,
    },
};

export const SOUND = floorSound('irondojo', 'IRON DOJO', R, {
    personality: 'a pagoda brawler: swishes and thuds, wooden parries, gongs for the masters, clay, wind and a ghost, a jingle a floor',
    sounds,
    cues: { Start: null, Hit: null, Miss: null, Die: null, Win: null, Bonus: null, Tick: null },
    events: {
        card: (s, e) => s.play('jingle', { pitch: [0, 0, 2, 3, 5, 7][e.floor] || 0 }),
        go: (s) => { if (!s.st.went) { s.st.went = true; s.play('start'); } },
        jump: (s) => s.play('hop'),
        swing: (s, e) => s.play('swish', { pitch: e.move === 'punch' ? 0 : -5 }),
        hit: (s) => s.play('thud'),
        smash: (s) => { s.play('thud'); s.play('crash'); },
        parry: (s) => s.play('clack'),
        bossHit: (s) => s.play('thud', { pitch: -5, level: 1.2 }),
        hurt: (s) => s.play('ouch'),
        squeeze: (s) => s.play('squeeze'),
        grab: (s) => s.play('ouch', { pitch: -5 }),
        free: (s) => s.play('free'),
        throw: (s) => s.play('knife'),
        potHang: (s) => s.play('creak'),
        potDrop: null,
        shatter: (s) => s.play('crash'),
        ghost: (s) => s.play('eerie'),
        ghostStrike: (s) => s.play('whoosh', { pitch: 7, level: 0.6 }),
        gustTell: null,
        gust: (s) => s.play('wind'),
        glint: null,
        blade: (s) => s.play('knife', { pitch: -3 }),
        pickup: (s) => s.play('sip'),
        combo: (s, e) => s.play('chain', { pitch: ((e.mult | 0) - 2) * 3 }),
        extend: (s) => s.play('oneUp'),
        warn: (s) => s.play('tick'),
        bossWake: (s) => s.play('gong'),
        bossTell: (s) => s.play('tell'),
        bossSwing: (s) => s.play('whoosh'),
        bossThrow: (s) => s.play('knife', { pitch: -5 }),
        catch: (s) => s.play('clack', { pitch: 5 }),
        slam: (s) => s.play('slam'),
        chi: (s) => s.play('fire'),
        bossPhase: (s) => s.play('roar'),
        bossDown: (s) => s.play('bigGong'),
        floorClear: (s) => s.play('bonus'),
        tally: (s) => s.play('count'),
        down: (s, e) => { if (!e.last) s.play('lifeLost'); },
        timeUp: (s, e) => { if (!e.last) s.play('lifeLost'); },
        win: (s) => { s.lost = false; s.play('win'); },
    },
    silent: {
        potDrop: 'the creak on potHang is its warning; the crash on landing is its sound',
        gustTell: 'the leaves streaming are the tell; the gust itself sounds',
        glint: 'a glint is seen, not heard; the blade whistles when it flies',
        Start: 'the go event plays the start call', Hit: 'the hit / bossHit events carry it', Miss: 'the hurt event carries it',
        Die: 'the down / timeUp events carry it (the last life: the round-lost fall)', Win: 'the win event carries it',
        Bonus: 'floorClear / extend / pickup / bossDown carry it', Tick: 'warn and the card jingle carry it',
    },
});
