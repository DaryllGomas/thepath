// THE CABINET'S SOUND · LANE JUMPER (the crossing game on THE JUNCTION's floor). Key: F, bright and busy: a town at rush hour.
// Chip synthesis only (js/cabinet/sound/chip.js): a little pulse blip for every hop that climbs the pentatonic as the courier
// gains new rows (a crossing is a rising run), a bell for each letter in its slot (each one a step higher), a thunk for a refused
// hop, a different spill for each way to lose a courier (the crash, the splash, the bite, the snap of the jaws, the train)
// before the cabinet's own life-lost fall, and the town's telegraphs: the crossing bell before a train, the weaver's blinker,
// the dog's bark, the snake's hiss, the mudjaw's clack, a slot flap shutting, the ferry's horn. A short jingle opens each stage
// (a step higher each time), a fanfare clears it, and the tally dings as it counts. No music loop: the jukebox plays in the room.
// It reads the sim's own events (sim.events, Starvector's way) and never writes to the game.
import { hz, JI, penta } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('F4');
const STAGE_STEP = [0, 2, 4, 5, 7, 9];          // each stage's jingle sits a step higher

const sounds = {
    hop: {
        label: 'A hop', group: 'play', desc: 'a short pulse blip; onto a new row it climbs the pentatonic, sideways or back it sits low',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.025, 5]], env: { a: 0.001, d: 0.06, v: 0.04 }, lp: 3000 },
            { wave: 'tri', f: R / 2, env: { a: 0.001, d: 0.04, v: 0.04 } }],
        max: 2, gap: 0.04, vary: { level: 0.1 },
    },
    bump: {
        label: 'A refused hop', group: 'play', desc: 'a dull thunk: the wall, a lit slot or a shut flap',
        layers: [{ wave: 'tri', f: hz('C3'), sweep: { to: 0.6, t: 0.08 }, env: { a: 0.001, d: 0.1, v: 0.14 } },
            { wave: 'noise', f: 1400, lp: 900, env: { a: 0.001, d: 0.05, v: 0.05 } }],
        max: 1, gap: 0.12,
    },
    hurry: {
        label: 'HURRY', group: 'play', desc: 'button A: the pedals spin up, a pulse revving over a breath of noise',
        layers: [{ wave: 'pulse', duty: 0.125, f: R, sweep: { to: 2.2, t: 0.22, q: 1 / 60 }, env: { a: 0.004, d: 0.25, v: 0.05 }, lp: 2800 },
            { wave: 'noise', f: 2500, lp: { f: 800, to: 3000, t: 0.2 }, env: { a: 0.02, d: 0.22, v: 0.04 } }],
        max: 1, gap: 0.3,
    },
    slot: {
        label: 'A letter delivered', group: 'play', desc: 'a bell as the letter drops in the slot, a quick climb over it; each slot of a stage a step higher',
        layers: [{ wave: 'tri', f: R * 2, env: { a: 0.003, d: 0.7, v: 0.16 } },
            { wave: 'tri', f: R * 2 * JI.fifth, env: { a: 0.004, d: 0.5, v: 0.06 } },
            { wave: 'pulse', duty: 0.125, f: R * 2, arp: { n: [0, 4, 7], step: 0.05 }, env: { a: 0.002, d: 0.08, s: 0.5, h: 0.1, r: 0.12, v: 0.04 }, lp: 3200 }],
        max: 2, gap: 0.2,
    },
    stamp: {
        label: 'The bonus stamp', group: 'play', desc: 'a glittering run up high: 200 points',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('F5'), arp: { n: [0, 7, 12, 16, 19], step: 0.04 }, env: { a: 0.002, d: 0.06, s: 0.6, h: 0.18, r: 0.1, v: 0.045 }, lp: 3300 },
            { wave: 'metal', f: 12000, env: { a: 0.001, d: 0.12, v: 0.025 }, lp: 3000 }],
        max: 1, gap: 0.2,
    },
    ting: {
        label: 'A stamp appears', group: 'play', desc: 'a faint high ting from the hedge',
        layers: [{ wave: 'tri', f: hz('C6'), env: { a: 0.002, d: 0.25, v: 0.05 } }],
        max: 1, gap: 0.5,
    },
    pop: {
        label: 'A parcel appears', group: 'play', desc: 'a soft rising pop on the river',
        layers: [{ wave: 'tri', f: hz('C5'), sweep: { to: 1.5, t: 0.08 }, env: { a: 0.002, d: 0.14, v: 0.08 } }],
        max: 1, gap: 0.5,
    },
    pickup: {
        label: 'The parcel picked up', group: 'play', desc: 'two notes up, a fourth: got it',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('C5'), seq: [[0, 0], [0.07, 5]], env: { a: 0.002, d: 0.06, s: 0.6, h: 0.08, r: 0.1, v: 0.05 }, lp: 3000 },
            { wave: 'tri', f: hz('C4'), seq: [[0, 0], [0.07, 5]], env: { a: 0.002, d: 0.2, v: 0.08 } }],
        max: 1, gap: 0.2,
    },
    drop: {
        label: 'The parcel lost', group: 'play', desc: 'a little fall: it went down with the courier',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('A4'), seq: [[0, 0], [0.08, -5]], env: { a: 0.002, d: 0.16, v: 0.04 }, lp: 2400 }],
        max: 1, gap: 0.3,
    },
    crash: {
        label: 'A crash', group: 'play', desc: 'a vehicle hits the courier: a noise burst, a metal rattle, a thud',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.15, t: 0.35 }, lp: { f: 3200, to: 400, t: 0.35 }, env: { a: 0.002, d: 0.4, v: 0.14 } },
            { wave: 'metal', f: 7000, sweep: { to: 0.3, t: 0.25 }, lp: 2600, env: { a: 0.002, d: 0.25, v: 0.06 } },
            { wave: 'tri', f: hz('G2'), sweep: { to: 0.5, t: 0.2 }, env: { a: 0.002, d: 0.22, v: 0.16 } }],
        max: 1, gap: 0.3,
    },
    trainHit: {
        label: 'Hit by a train', group: 'play', desc: 'a bigger, longer crash with the low end under it',
        layers: [{ wave: 'noise', f: 4200, sweep: { to: 0.1, t: 0.7 }, lp: { f: 2800, to: 250, t: 0.7 }, env: { a: 0.003, d: 0.75, v: 0.16 } },
            { wave: 'metal', f: 6000, sweep: { to: 0.25, t: 0.4 }, lp: 2400, env: { a: 0.002, d: 0.4, v: 0.06 } },
            { wave: 'tri', f: hz('D2'), sweep: { to: 0.4, t: 0.4 }, env: { a: 0.002, d: 0.45, v: 0.2 } }],
        max: 1, gap: 0.5,
    },
    splash: {
        label: 'A splash', group: 'play', desc: 'into the river: a wet noise falling away and a gurgle',
        layers: [{ wave: 'noise', f: 3000, sweep: { to: 0.3, t: 0.4 }, lp: { f: 2600, to: 500, t: 0.4 }, env: { a: 0.004, d: 0.45, v: 0.12 } },
            { wave: 'tri', f: hz('A3'), sweep: { to: 0.4, t: 0.35 }, env: { a: 0.004, d: 0.35, v: 0.12 }, vib: { rate: 22, depth: 120 } }],
        max: 1, gap: 0.3,
    },
    bite: {
        label: 'Bitten', group: 'play', desc: 'the snake or the dog: a growl and a sharp snap',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('C3'), sweep: { to: 0.7, t: 0.25 }, env: { a: 0.005, d: 0.28, v: 0.07 }, lp: 1400, vib: { rate: 30, depth: 140 } },
            { wave: 'noise', f: 6000, lp: 3500, at: 0.12, env: { a: 0.001, d: 0.07, v: 0.1 } }],
        max: 1, gap: 0.3,
    },
    snapped: {
        label: 'Snapped', group: 'play', desc: 'the mudjaw\'s jaws close on him: a hard clack and a splash',
        layers: [{ wave: 'metal', f: 3000, sweep: { to: 0.4, t: 0.06 }, env: { a: 0.001, d: 0.09, v: 0.1 }, lp: 2400 },
            { wave: 'tri', f: hz('E2'), sweep: { to: 0.6, t: 0.2 }, env: { a: 0.002, d: 0.25, v: 0.18 } },
            { wave: 'noise', f: 2600, at: 0.08, sweep: { to: 0.3, t: 0.35 }, lp: { f: 2200, to: 500, t: 0.35 }, env: { a: 0.004, d: 0.38, v: 0.1 } }],
        max: 1, gap: 0.3,
    },
    timeUp: {
        label: 'Time up', group: 'play', desc: 'the courier\'s clock runs out: three falling beeps',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A4'), seq: [[0, 0], [0.12, -2], [0.24, -5]], env: { a: 0.003, d: 0.05, s: 0.7, h: 0.3, r: 0.1, v: 0.05 }, lp: 2600, trem: { rate: 8.3, depth: 0.9 } }],
        max: 1, gap: 0.5,
    },
    buoy: {
        label: 'The lifebuoy (mercy)', group: 'play', desc: 'credit 5: he treads water on a buoy; a soft bloop',
        layers: [{ wave: 'tri', f: hz('C4'), sweep: { to: 1.3, t: 0.1 }, env: { a: 0.004, d: 0.2, v: 0.08 } }],
        max: 1, gap: 0.6,
    },
    clear: {
        label: 'Stage clear', group: 'play', desc: 'ALL FIVE: a bright climb up the major chord and a held top note over the bass',
        layers: [{ wave: 'pulse', duty: 0.25, f: R * 2, arp: { n: [0, 4, 7, 12, 16], step: 0.08 }, env: { a: 0.003, d: 0.1, s: 0.7, h: 0.5, r: 0.3, v: 0.06 }, lp: 3300, vib: { rate: 5.5, depth: 8, at: 0.4, fade: 0.2 } },
            { wave: 'tri', f: R / 2, seq: [[0, 0], [0.32, 7], [0.48, 12]], env: { a: 0.004, d: 0.2, s: 0.6, h: 0.5, r: 0.3, v: 0.16 } }],
        max: 1, gap: 1,
    },
    ding: {
        label: 'A tally line', group: 'play', desc: 'a bell as each bonus line finishes counting (a step higher each line)',
        layers: [{ wave: 'tri', f: R * 2, env: { a: 0.003, d: 0.45, v: 0.12 } }, { wave: 'pulse', duty: 0.125, f: R * 4, env: { a: 0.002, d: 0.12, v: 0.025 }, lp: 3200 }],
        max: 2, gap: 0.1,
    },
    count: {
        label: 'The tally counting', group: 'play', desc: 'a dry little click while the bonus counts up',
        layers: [{ wave: 'metal', f: 14000, env: { a: 0.001, d: 0.02, v: 0.03 }, lp: 3000 }, { wave: 'pulse', duty: 0.25, f: R * 2, env: { a: 0.001, d: 0.02, v: 0.015 }, lp: 3000 }],
        max: 2, gap: 0.05, vary: { pitch: 40, level: 0.15 },
    },
    extra: {
        label: 'EXTRA COURIER', group: 'play', desc: 'a run up two octaves and a trill: one more bike in the depot',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 4, 7, 12, 16, 19, 24, 19, 24], step: 0.055 }, env: { a: 0.002, d: 0.08, s: 0.7, h: 0.45, r: 0.15, v: 0.05 }, lp: 3300 },
            { wave: 'tri', f: R / 2, env: { a: 0.004, d: 0.6, v: 0.14 } }],
        max: 1, gap: 1,
    },
    bell: {
        label: 'The crossing bell', group: 'play', desc: 'the telegraph before a train: a level-crossing bell ringing for two seconds',
        layers: [{ wave: 'pulse', duty: 0.25, f: hz('B5'), env: { a: 0.005, d: 0.1, s: 0.85, h: 1.8, r: 0.2, v: 0.04 }, lp: 3200, trem: { rate: 5, depth: 1 } },
            { wave: 'tri', f: hz('B4'), env: { a: 0.005, d: 0.1, s: 0.85, h: 1.8, r: 0.2, v: 0.05 }, trem: { rate: 5, depth: 1 } }],
        max: 2, gap: 1.2,
    },
    train: {
        label: 'A train', group: 'play', desc: 'the train comes through: a two-tone horn over a low rumble',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A3'), env: { a: 0.02, d: 0.1, s: 0.85, h: 0.45, r: 0.2, v: 0.04 }, lp: 1600 },
            { wave: 'pulse', duty: 0.5, f: hz('A3') * JI.fourth, env: { a: 0.02, d: 0.1, s: 0.85, h: 0.45, r: 0.2, v: 0.03 }, lp: 1600 },
            { wave: 'noise', f: 500, lp: { f: 300, to: 700, t: 0.8 }, env: { a: 0.1, d: 1.2, v: 0.09 }, trem: { rate: 7, depth: 0.5 } },
            { wave: 'tri', f: hz('A1') * 2, env: { a: 0.1, d: 1.1, v: 0.1 } }],
        max: 2, gap: 0.8,
    },
    horn: {
        label: 'The ferry horn', group: 'play', desc: 'a low, soft hoot as the ferry leaves a bank',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('C3'), env: { a: 0.05, d: 0.1, s: 0.8, h: 0.5, r: 0.3, v: 0.035 }, lp: 900, vib: { rate: 4, depth: 10 } },
            { wave: 'tri', f: hz('C3'), env: { a: 0.05, d: 0.1, s: 0.8, h: 0.5, r: 0.3, v: 0.08 } }],
        max: 1, gap: 2,
    },
    jaws: {
        label: 'The mudjaw opens', group: 'play', desc: 'a wooden clack and a low creak: the jaws are open',
        layers: [{ wave: 'metal', f: 2200, sweep: { to: 0.5, t: 0.05 }, env: { a: 0.001, d: 0.06, v: 0.06 }, lp: 2000 },
            { wave: 'pulse', duty: 0.5, f: hz('E2'), sweep: { to: 1.3, t: 0.3 }, env: { a: 0.02, d: 0.3, v: 0.04 }, lp: 700, vib: { rate: 18, depth: 80 } }],
        max: 1, gap: 0.5,
    },
    hiss: {
        label: 'The snake hisses', group: 'play', desc: 'a thin hiss as you come near it on the median',
        layers: [{ wave: 'noise', f: 9000, lp: 3800, env: { a: 0.06, d: 0.45, v: 0.05 }, trem: { rate: 14, depth: 0.4 } }],
        max: 1, gap: 1.5,
    },
    bark: {
        label: 'The dog barks', group: 'play', desc: 'the telegraph before it gives chase: two short woofs',
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('A3'), sweep: { to: 0.7, t: 0.07 }, env: { a: 0.003, d: 0.08, v: 0.07 }, lp: 1500 },
            { wave: 'pulse', duty: 0.5, f: hz('A3'), at: 0.16, sweep: { to: 0.7, t: 0.07 }, env: { a: 0.003, d: 0.08, v: 0.07 }, lp: 1500 },
            { wave: 'noise', f: 2500, lp: 1200, env: { a: 0.002, d: 0.05, v: 0.04 } }],
        max: 1, gap: 0.6,
    },
    blinker: {
        label: 'The weaver signals', group: 'play', desc: 'a soft tick-tock: the blinker before he changes lanes',
        layers: [{ wave: 'metal', f: 9000, env: { a: 0.001, d: 0.02, v: 0.03 }, lp: 2400 }, { wave: 'metal', f: 7000, at: 0.25, env: { a: 0.001, d: 0.02, v: 0.03 }, lp: 2400 },
            { wave: 'metal', f: 9000, at: 0.5, env: { a: 0.001, d: 0.02, v: 0.03 }, lp: 2400 }],
        max: 1, gap: 0.6,
    },
    flap: {
        label: 'A slot flap', group: 'play', desc: 'Delivery Day: a flap claps shut (lower) or springs open (higher)',
        layers: [{ wave: 'noise', f: 3000, lp: 1800, env: { a: 0.001, d: 0.05, v: 0.07 } }, { wave: 'tri', f: hz('G3'), sweep: { to: 0.7, t: 0.06 }, env: { a: 0.001, d: 0.08, v: 0.1 } }],
        max: 1, gap: 0.2,
    },
    tick: {
        label: 'The clock running out', group: 'play', desc: 'under ten seconds: a short beep every second',
        layers: [{ wave: 'pulse', duty: 0.5, f: R * 2, env: { a: 0.002, d: 0.05, v: 0.035 }, lp: 2800 }],
        max: 1, gap: 0.5,
    },
    jingle: {
        label: 'The stage begins', group: 'play', desc: 'the stage card: a four-note call and a bass (each stage a step higher)',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, seq: [[0, 0], [0.12, 4], [0.24, 7], [0.36, 9], [0.48, 12]], env: { a: 0.003, d: 0.08, s: 0.7, h: 0.55, r: 0.2, v: 0.055 }, lp: 3000 },
            { wave: 'tri', f: R / 2, seq: [[0, 0], [0.24, 7], [0.48, 12]], env: { a: 0.004, d: 0.1, s: 0.7, h: 0.55, r: 0.2, v: 0.14 } }],
        max: 1, gap: 1,
    },
    courier: {
        label: 'The next courier', group: 'play', desc: 'after a delivery: a quick little rise as the next bike sets off',
        layers: [{ wave: 'tri', f: R, arp: { n: [0, 7, 12], step: 0.045 }, env: { a: 0.003, d: 0.18, v: 0.08 } }],
        max: 1, gap: 0.4,
    },
};

const DIE = { crash: 'crash', train: 'trainHit', splash: 'splash', swept: 'splash', bitten: 'bite', snapped: 'snapped', timeup: 'timeUp' };

export const SOUND = floorSound('lanejumper', 'LANE JUMPER', R, {
    personality: 'a busy town in F: hop blips that climb the scale as you cross, a bell per letter, a spill for each way to lose, and the town\'s telegraphs (crossing bell, blinker, bark, hiss, clack, flap, horn)',
    sounds,
    // the eight SDK cues: the sim's own events carry the sound; only the coin and the win stay on the cues
    cues: { Coin: (s) => s.play('coin'), Start: null, Hit: null, Miss: null, Die: null, Bonus: null, Tick: null, Win: (s) => { s.lost = false; s.play('win'); } },
    events: {
        card: (s, e) => s.play('jingle', { pitch: STAGE_STEP[(e.stage - 1) % 6] || 0 }),
        go: (s) => s.play('start'),
        next: (s) => s.play('courier'),
        hop: (s, e) => (e.up ? s.play('hop', { pitch: penta(12 - e.row) }) : s.play('hop', { pitch: -5, level: 0.6 })),
        bump: (s) => s.play('bump'),
        hurry: (s) => s.play('hurry'),
        slot: (s, e) => s.play('slot', { pitch: penta(e.n - 1) }),
        stamp: (s) => s.play('stamp'),
        stampUp: (s) => s.play('ting'),
        parcelUp: (s) => s.play('pop'),
        parcel: (s) => s.play('pickup'),
        parcelIn: (s) => s.play('bonus', { delay: 0.15 }),
        parcelLost: (s) => s.play('drop', { delay: 0.3 }),
        die: (s, e) => { s.play(DIE[e.how] || 'crash'); s.play('lifeLost', { delay: 0.45 }); },
        shield: (s) => s.play('ward', { level: 0.6 }),
        buoy: (s) => s.play('buoy'),
        allFive: (s) => s.play('clear', { delay: 0.25 }),
        tally: (s, e) => s.play('ding', { pitch: e.value ? [0, 4, 7][e.line] || 0 : -12, level: e.value ? 1 : 0.5 }),
        count: (s) => s.play('count'),
        extra: (s) => s.play('extra'),
        bell: (s) => s.play('bell'),
        train: (s) => s.play('train'),
        horn: (s) => s.play('horn'),
        jaws: (s) => s.play('jaws'),
        hiss: (s) => s.play('hiss'),
        bark: (s) => s.play('bark'),
        blink: (s) => s.play('blinker'),
        flap: (s, e) => s.play('flap', { pitch: e.shut ? 0 : 7 }),
        lowTime: (s) => s.play('tick'),
    },
    silent: {},
});
