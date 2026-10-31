// THE CABINET'S SOUND · NEBULA RUN (THE JUNCTION's floor). Key: E, the floor's stock voice plus a few board sounds of its own:
// a dry tick for the air gun, a falling whistle for the bomb and a thump where it lands, noise bursts for kills, a hollow pop
// for flak, a crack for lightning, a siren for a boss, a bell for each sector card and tally line. Chip synthesis only. The
// sim's detailed events (round.js _emit) carry the sound; the SDK cues they duplicate (Hit, Miss, Bonus, Tick) stay quiet.
import { hz } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('E4');

const sounds = {
    gun: {
        label: 'The air gun', group: 'play', desc: 'a short dry tick, fast',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('E6'), sweep: { to: 0.4, t: 0.04 }, env: { a: 0.001, d: 0.04, v: 0.035 }, lp: 3200 }],
        max: 2, gap: 0.09, vary: { pitch: 50, level: 0.15 },
    },
    whistle: {
        label: 'A bomb away', group: 'play', desc: 'a falling whistle, as long as the fall',
        layers: [{ wave: 'tri', f: hz('B5'), sweep: { to: 0.45, t: 0.4 }, env: { a: 0.01, d: 0.4, v: 0.06 } }],
        max: 1, gap: 0.2,
    },
    thump: {
        label: 'The bomb lands', group: 'play', desc: 'a low thump with a little grit',
        layers: [{ wave: 'noise', f: 2400, sweep: { to: 0.2, t: 0.2 }, lp: 1400, env: { a: 0.002, d: 0.2, v: 0.08 } },
            { wave: 'tri', f: hz('E2'), sweep: { to: 0.5, t: 0.15 }, env: { a: 0.002, d: 0.16, v: 0.14 } }],
        max: 2, gap: 0.06,
    },
    boom: {
        label: 'Something goes up', group: 'play', desc: 'a noise burst falling away (bigger for big things)',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.18, t: 0.32 }, lp: { f: 3000, to: 500, t: 0.32 }, env: { a: 0.002, d: 0.34, v: 0.1 } },
            { wave: 'tri', f: hz('G2'), sweep: { to: 0.5, t: 0.2 }, env: { a: 0.002, d: 0.2, v: 0.12 } }],
        max: 3, gap: 0.04, vary: { pitch: 90, level: 0.15 },
    },
    pop: {
        label: 'An interceptor down', group: 'play', desc: 'a small bright pop',
        layers: [{ wave: 'noise', f: 9000, sweep: { to: 0.3, t: 0.12 }, lp: 3000, env: { a: 0.001, d: 0.12, v: 0.06 } },
            { wave: 'pulse', duty: 0.25, f: R * 2, sweep: { to: 0.5, t: 0.08 }, env: { a: 0.001, d: 0.08, v: 0.04 }, lp: 3000 }],
        max: 3, gap: 0.03, vary: { pitch: 80, level: 0.15 },
    },
    ping: {
        label: 'Off the shield', group: 'play', desc: 'a hollow metal ping: the dome, the shut iris, the locked eye',
        layers: [{ wave: 'metal', f: 12000, env: { a: 0.001, d: 0.1, v: 0.04 }, lp: 2600 }, { wave: 'tri', f: hz('B5'), env: { a: 0.001, d: 0.12, v: 0.04 } }],
        max: 2, gap: 0.08,
    },
    enemyFire: {
        label: 'An enemy gun', group: 'play', desc: 'a low warbling pop',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A3'), sweep: { to: 0.6, t: 0.12, q: 1 / 60 }, env: { a: 0.003, d: 0.13, v: 0.035 }, lp: 1800 }],
        max: 2, gap: 0.12, vary: { pitch: 100, level: 0.12 },
    },
    flak: {
        label: 'Flak', group: 'play', desc: 'a hollow pop on launch, a crack at the burst',
        layers: [{ wave: 'noise', f: 1200, lp: 900, env: { a: 0.002, d: 0.1, v: 0.06 } }, { wave: 'tri', f: hz('C3'), sweep: { to: 1.6, t: 0.1 }, env: { a: 0.002, d: 0.1, v: 0.08 } }],
        max: 2, gap: 0.1,
    },
    crack: {
        label: 'Lightning, a flak burst', group: 'play', desc: 'a sharp noise crack',
        layers: [{ wave: 'noise', f: 12000, sweep: { to: 0.15, t: 0.3 }, lp: { f: 4000, to: 600, t: 0.3 }, env: { a: 0.001, d: 0.3, v: 0.1 } }],
        max: 2, gap: 0.06,
    },
    warn: {
        label: 'A warning', group: 'play', desc: 'a soft rising buzz: lightning coming, a mine armed, a boss winding up',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('E3'), sweep: { to: 2, t: 0.35 }, env: { a: 0.02, d: 0.35, v: 0.035 }, lp: 1600 }],
        max: 1, gap: 0.25,
    },
    siren: {
        label: 'A boss', group: 'play', desc: 'the boss is in sight: a two-tone siren, twice',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('E4'), seq: [[0, 0], [0.22, 5], [0.44, 0], [0.66, 5]], env: { a: 0.01, d: 0.1, s: 0.8, h: 0.8, r: 0.15, v: 0.06 }, lp: 2400 }],
        max: 1, gap: 1.5,
    },
    bell: {
        label: 'A sector card, a tally line', group: 'play', desc: 'a short bell up the chord',
        layers: [{ wave: 'tri', f: hz('E5'), arp: { n: [0, 4, 7], step: 0.06 }, env: { a: 0.003, d: 0.4, v: 0.12 } }],
        max: 2, gap: 0.1,
    },
};

export const SOUND = floorSound('nebularun', 'NEBULA RUN', R, {
    personality: 'a vertical shooter: a dry gun, a bomb that whistles and thumps, flak pops, lightning cracks, a siren for each boss',
    sounds,
    cues: { Hit: null, Miss: null, Bonus: null, Tick: null },
    events: {
        fire: (s) => s.play('gun'),
        bomb: (s) => s.play('whistle'),
        blast: (s) => s.play('thump'),
        pop: (s) => s.play('pop'),
        boom: (s, e) => s.play('boom', { pitch: e.big ? -5 : 0 }),
        partDown: (s) => s.play('boom', { pitch: -7 }),
        bossDown: (s) => { s.play('boom', { pitch: -9 }); s.play('bonus', { delay: 0.3 }); },
        crash: (s) => s.play('boom', { pitch: -3 }),
        clink: (s) => s.play('tick'),
        ping: (s) => s.play('ping'),
        shield: (s) => s.play('ping', { pitch: -5 }),
        enemyFire: (s) => s.play('enemyFire'),
        flak: (s) => s.play('flak'),
        flakBurst: (s) => s.play('crack', { pitch: 5 }),
        bolt: (s) => s.play('crack'),
        boltWarn: (s) => s.play('warn'),
        mineArm: (s) => s.play('warn', { pitch: 7 }),
        mineBurst: (s) => s.play('crack', { pitch: 3 }),
        charge: (s) => s.play('warn', { pitch: -5 }),
        iris: (s, e) => { if (e.open) s.play('warn', { pitch: 12 }); },
        bossWarn: (s) => s.play('siren'),
        pickup: (s) => s.play('bonus'),
        beacon: (s) => s.play('bonus', { pitch: 7 }),
        extra: (s) => s.play('bonus', { pitch: 12 }),
        genDown: (s) => s.play('miss'),
        card: (s) => s.play('bell'),
        tally: (s, e) => s.play('bell', { pitch: e.i * 2 }),
        sectorClear: (s) => s.play('bonus'),
    },
    silent: {
        cap: 'the pod is seen falling; the pickup has the sound',
        launch: 'the hangar darts are heard when they die',
        respawn: 'the READY is the Start cue',
    },
});
