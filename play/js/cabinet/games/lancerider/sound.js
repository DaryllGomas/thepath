// THE CABINET'S SOUND · LANCE RIDER (THE JUNCTION's floor). Key: E, a heraldic call over a lava pit.
// Chip synthesis only (pulse / triangle / LFSR noise through the cabinet's chain), laid over the floor's stock voice
// (js/cabinet/sound/palettes/floor.js): a soft wing-beat for every flap, the clang of lances (a bright ring when you win
// the joust, a dull one when they bounce), a climbing pick-up for the eggs that steps up the chain, a hiss for an egg lost
// to the lava, a crack and a chirp when one hatches. The hazards each have their telegraph: the lava gurgles before the
// hand comes up, the stone creaks before it falls, the hawk screams before it streaks across, the beast rumbles before it
// rises, gurgles before it spits and draws a long breath before the fire. A heraldic call for each wave's card (lower
// and darker for the beast's), a fanfare for a clear wave, a tick for every row of the tally and a bell for a bonus, the
// classic climb for an extra rider. Under it all, very quiet, the lava's rumble (louder as you skim it) and, on the last
// wave, the beast's growl. It reads game.events (the round's own events: sim.events) and never writes to the game.
import { hz, JI } from '../../sound/music.js';
import { floorSound } from '../../sound/palettes/floor.js';

const R = hz('E4'), E2 = hz('E2'), E3 = hz('E3'), B3 = hz('B3'), E5 = hz('E5'), B4 = hz('B4');

const sounds = {
    flap: {
        db: -2, label: 'A wing-beat', group: 'play', desc: 'every flap: a soft whump of air, a breath of noise over a low thump',
        layers: [{ wave: 'noise', f: 1400, sweep: { to: 0.4, t: 0.08 }, lp: 1500, env: { a: 0.004, d: 0.08, v: 0.035 } },
            { wave: 'tri', f: E3, sweep: { to: 0.6, t: 0.06 }, env: { a: 0.002, d: 0.05, v: 0.05 } }],
        max: 2, gap: 0.06, vary: { pitch: 120, level: 0.15, time: 0.004 },
    },
    clang: {
        db: 3, label: 'The joust won', group: 'play', desc: 'the higher lance strikes home: a bright metal ring and a rising blip over a crash',
        layers: [{ wave: 'metal', f: 11000, sweep: { to: 0.6, t: 0.12 }, lp: 3200, env: { a: 0.001, d: 0.16, v: 0.07 } },
            { wave: 'pulse', duty: 0.25, f: B4, sweep: { to: 2, t: 0.08 }, env: { a: 0.001, d: 0.12, v: 0.06 }, lp: 3200 },
            { wave: 'noise', f: 5000, sweep: { to: 0.3, t: 0.2 }, lp: { f: 3200, to: 700, t: 0.2 }, env: { a: 0.001, d: 0.22, v: 0.08 } }],
        max: 2, gap: 0.05, vary: { pitch: 60, level: 0.1 },
    },
    bounce: {
        db: 2, label: 'Level lances', group: 'play', desc: 'the lances meet level and both riders bounce: a dull clank, falling',
        layers: [{ wave: 'metal', f: 6000, sweep: { to: 0.5, t: 0.08 }, lp: 2400, env: { a: 0.001, d: 0.09, v: 0.06 } },
            { wave: 'pulse', duty: 0.5, f: E3, sweep: { to: 0.7, t: 0.1 }, env: { a: 0.001, d: 0.1, v: 0.04 }, lp: 1600 }],
        max: 2, gap: 0.08, vary: { pitch: 80, level: 0.12 },
    },
    egg: {
        db: 1, label: 'An egg taken', group: 'play', desc: 'a climbing pick-up; each egg of the chain a step higher (250, 500, 750, 1000)',
        layers: [{ wave: 'pulse', duty: 0.125, f: E5, arp: { n: [0, 4, 7, 12], step: 0.035 }, env: { a: 0.002, d: 0.05, s: 0.6, h: 0.08, r: 0.08, v: 0.055 }, lp: 3300 },
            { wave: 'tri', f: R, arp: { n: [0, 7], step: 0.04 }, env: { a: 0.002, d: 0.14, v: 0.06 } }],
        max: 2, gap: 0.06,
    },
    sizzle: {
        db: 1, label: 'Lost to the lava', group: 'play', desc: 'an egg or a rider into the lava: a hiss falling away with a low pop',
        layers: [{ wave: 'noise', f: 7000, sweep: { to: 0.25, t: 0.45 }, lp: { f: 4000, to: 900, t: 0.45 }, env: { a: 0.005, d: 0.48, v: 0.07 } },
            { wave: 'tri', f: B3, sweep: { to: 0.4, t: 0.12 }, env: { a: 0.002, d: 0.12, v: 0.06 } }],
        max: 2, gap: 0.1, vary: { pitch: 100, level: 0.12 },
    },
    hatch: {
        db: 1, label: 'An egg hatches', group: 'play', desc: 'a shell cracks (a dry tick) and the hatchling chirps up',
        layers: [{ wave: 'noise', f: 9000, env: { a: 0.001, d: 0.03, v: 0.06 }, lp: 3000 },
            { wave: 'pulse', duty: 0.25, f: B4, at: 0.05, seq: [[0, 0], [0.06, 5], [0.12, 9]], env: { a: 0.002, d: 0.06, s: 0.5, h: 0.12, r: 0.05, v: 0.04 }, lp: 3200 }],
        max: 2, gap: 0.15,
    },
    trample: {
        label: 'A hatchling trampled', group: 'play', desc: 'a squashed blip, down',
        layers: [{ wave: 'pulse', duty: 0.5, f: E5, sweep: { to: 0.3, t: 0.1 }, env: { a: 0.001, d: 0.1, v: 0.05 }, lp: 2600 },
            { wave: 'noise', f: 3000, env: { a: 0.001, d: 0.05, v: 0.04 }, lp: 2000 }],
        max: 2, gap: 0.08,
    },
    spawn: {
        db: -3, label: 'A rider rides in', group: 'play', desc: 'a rival materialises on its ledge: a soft shimmer climbing',
        layers: [{ wave: 'tri', f: B3, arp: { n: [0, 7, 12, 19], step: 0.06 }, env: { a: 0.01, d: 0.1, s: 0.6, h: 0.14, r: 0.12, v: 0.05 } },
            { wave: 'noise', f: 6000, lp: 2200, env: { a: 0.05, d: 0.3, v: 0.012 } }],
        max: 2, gap: 0.2,
    },
    gurgle: {
        db: 1, label: 'Telegraph: the lava boils', group: 'play', desc: 'where the hand will come up: a bubbling gurgle swelling (0.55 s)',
        layers: [{ wave: 'noise', f: 900, lp: { f: 400, to: 1400, t: 0.5 }, trem: { rate: 14, depth: 0.8 }, env: { a: 0.08, d: 0.5, s: 0.8, h: 0.05, r: 0.1, v: 0.09 } },
            { wave: 'tri', f: E2, sweep: { to: 1.5, t: 0.55 }, vib: { rate: 11, depth: 60 }, env: { a: 0.05, d: 0.55, v: 0.1 } }],
        max: 1, gap: 0.3,
    },
    handRise: {
        db: 2, label: 'The hand comes up', group: 'play', desc: 'a heavy rush up out of the lava',
        layers: [{ wave: 'noise', f: 600, sweep: { to: 3, t: 0.3 }, lp: { f: 500, to: 2500, t: 0.3 }, env: { a: 0.02, d: 0.35, v: 0.1 } },
            { wave: 'tri', f: E2, sweep: { to: 2, t: 0.3 }, env: { a: 0.01, d: 0.3, v: 0.12 } }],
        max: 1, gap: 0.3,
    },
    grab: {
        db: 3, label: 'The hand has you', group: 'play', desc: 'stone fingers close: a crunch and a low buzz (mash A)',
        layers: [{ wave: 'noise', f: 2500, sweep: { to: 0.3, t: 0.2 }, lp: { f: 2200, to: 400, t: 0.2 }, env: { a: 0.001, d: 0.22, v: 0.12 } },
            { wave: 'pulse', duty: 0.5, f: hz('E2'), vib: { rate: 18, depth: 80 }, env: { a: 0.005, d: 0.1, s: 0.7, h: 0.3, r: 0.2, v: 0.05 }, lp: 900 }],
        max: 1, gap: 0.3,
    },
    struggle: {
        db: 1, label: 'Tearing free', group: 'play', desc: 'each flap in the hand\'s grip: a harder wing-beat, a step higher each time',
        layers: [{ wave: 'noise', f: 1800, sweep: { to: 0.4, t: 0.07 }, lp: 1900, env: { a: 0.002, d: 0.07, v: 0.06 } },
            { wave: 'pulse', duty: 0.25, f: E3, env: { a: 0.002, d: 0.06, v: 0.04 }, lp: 1800 }],
        max: 2, gap: 0.05,
    },
    escape: {
        db: 1, label: 'Torn free', group: 'play', desc: 'out of the hand: a rising whoosh and a bright lift',
        layers: [{ wave: 'noise', f: 900, sweep: { to: 4, t: 0.3 }, lp: { f: 900, to: 3500, t: 0.3 }, env: { a: 0.01, d: 0.32, v: 0.08 } },
            { wave: 'pulse', duty: 0.25, f: R, sweep: { to: 2, t: 0.25 }, env: { a: 0.002, d: 0.25, v: 0.05 }, lp: 3200 }],
        max: 1, gap: 0.3,
    },
    creak: {
        db: 2, label: 'Telegraph: the stone cracks', group: 'play', desc: 'a ledge will fall in 3 s: a dry stony creak and a trickle',
        layers: [{ wave: 'metal', f: 1800, sweep: { to: 0.7, t: 0.4 }, lp: 1600, trem: { rate: 22, depth: 0.7 }, env: { a: 0.02, d: 0.45, v: 0.07 } },
            { wave: 'noise', f: 4000, lp: 2500, trem: { rate: 9, depth: 0.9 }, env: { a: 0.05, d: 0.6, v: 0.04 } }],
        max: 1, gap: 0.4,
    },
    crumble: {
        db: 4, label: 'A ledge falls', group: 'play', desc: 'the stone gives way: a rumbling crash falling into the lava',
        layers: [{ wave: 'noise', f: 3000, sweep: { to: 0.12, t: 0.7 }, lp: { f: 2600, to: 250, t: 0.7 }, env: { a: 0.003, d: 0.75, v: 0.14 } },
            { wave: 'tri', f: hz('B1') * 2, sweep: { to: 0.5, t: 0.5 }, env: { a: 0.003, d: 0.55, v: 0.18 } }],
        max: 1, gap: 0.4,
    },
    screech: {
        db: 1, label: 'Telegraph: the hawk screams', group: 'play', desc: 'the chevrons at the edge: a harsh falling scream (1.1 s before it comes)',
        layers: [{ wave: 'pulse', duty: 0.125, f: hz('E6'), sweep: [{ to: 1.12, t: 0.08 }, { to: 0.6, t: 0.5, at: 0.08 }], vib: { rate: 28, depth: 70 }, env: { a: 0.01, d: 0.1, s: 0.7, h: 0.35, r: 0.15, v: 0.05 }, lp: 3300 },
            { wave: 'noise', f: 6000, lp: 3000, env: { a: 0.02, d: 0.5, v: 0.03 } }],
        max: 1, gap: 0.6,
    },
    hawkPass: {
        db: 2, label: 'The hawk streaks across', group: 'play', desc: 'a long rushing roar of flame, across the whole field',
        layers: [{ wave: 'noise', f: 1200, sweep: [{ to: 3, t: 0.7 }, { to: 0.3, t: 0.9, at: 0.7 }], lp: { f: 1200, to: 3800, t: 0.7 }, env: { a: 0.15, d: 0.4, s: 0.8, h: 0.6, r: 0.5, v: 0.09 } },
            { wave: 'tri', f: B3, sweep: [{ to: 1.5, t: 0.7 }, { to: 0.5, t: 0.9, at: 0.7 }], env: { a: 0.15, d: 0.4, s: 0.6, h: 0.6, r: 0.5, v: 0.05 } }],
        max: 1, gap: 1,
    },
    hawkKill: {
        db: 4, label: 'The hawk lanced', group: 'play', desc: 'lance to beak: a burst of flame and a ringing three-note call',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.15, t: 0.5 }, lp: { f: 3500, to: 400, t: 0.5 }, env: { a: 0.002, d: 0.55, v: 0.14 } },
            { wave: 'pulse', duty: 0.25, f: E5, seq: [[0, 0], [0.1, 4], [0.2, 7]], env: { a: 0.002, d: 0.05, s: 0.7, h: 0.35, r: 0.25, v: 0.06 }, lp: 3300 },
            { wave: 'metal', f: 12000, lp: 3000, env: { a: 0.001, d: 0.2, v: 0.05 } }],
        max: 1, gap: 0.5,
    },
    pair: {
        db: 1, label: 'Both of a pair', group: 'play', desc: 'GLADIATORS: two bright blips, a fifth apart',
        layers: [{ wave: 'pulse', duty: 0.25, f: B4, seq: [[0, 0], [0.09, 7], [0.18, 12]], env: { a: 0.002, d: 0.05, s: 0.7, h: 0.22, r: 0.15, v: 0.06 }, lp: 3300 },
            { wave: 'tri', f: E3, env: { a: 0.002, d: 0.3, v: 0.08 } }],
        max: 1, gap: 0.3,
    },
    oneUp: {
        db: 1, label: 'An extra rider', group: 'play', desc: 'the classic climb, twice: a rider more',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 4, 7, 12, 7, 12, 16, 19], step: 0.065 }, env: { a: 0.002, d: 0.05, s: 0.75, h: 0.48, r: 0.15, v: 0.06 }, lp: 3300 },
            { wave: 'tri', f: E3, seq: [[0, 0], [0.26, 7]], env: { a: 0.004, d: 0.2, s: 0.6, h: 0.3, r: 0.2, v: 0.1 } }],
        max: 1, gap: 1,
    },
    herald: {
        db: 0, label: 'The wave\'s card', group: 'play', desc: 'a heraldic call, root-fifth-octave, as each wave\'s card goes up',
        layers: [{ wave: 'pulse', duty: 0.25, f: B3, seq: [[0, 0], [0.16, 5], [0.32, 9], [0.48, 5], [0.6, 12]], env: { a: 0.004, d: 0.05, s: 0.75, h: 0.75, r: 0.3, v: 0.06 },
            vib: { rate: 5.5, depth: 12, at: 0.6, fade: 0.2 }, lp: 3000 },
            { wave: 'tri', f: E2 * 2, seq: [[0, 0], [0.48, 7], [0.6, 0]], env: { a: 0.004, d: 0.2, s: 0.7, h: 0.6, r: 0.3, v: 0.12 } }],
        max: 1, gap: 1,
    },
    doom: {
        db: 1, label: 'The last wave\'s card', group: 'play', desc: 'THE PIT BEAST: the call again, low and minor, over a rumble',
        layers: [{ wave: 'pulse', duty: 0.5, f: E3, seq: [[0, 0], [0.22, 3], [0.44, 7], [0.66, 6], [0.88, 0]], env: { a: 0.01, d: 0.05, s: 0.8, h: 1.0, r: 0.4, v: 0.05 }, lp: 1600 },
            { wave: 'tri', f: E2, env: { a: 0.05, d: 0.4, s: 0.8, h: 0.9, r: 0.5, v: 0.16 }, vib: { rate: 6, depth: 30 } },
            { wave: 'noise', f: 400, lp: 500, env: { a: 0.3, d: 0.9, v: 0.05 } }],
        max: 1, gap: 2,
    },
    clear: {
        db: 0, label: 'A wave cleared', group: 'play', desc: 'a bright fanfare climbing the major chord, the bass under it',
        layers: [{ wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 4, 7, 12, 16, 12], step: 0.08 }, env: { a: 0.003, d: 0.06, s: 0.7, h: 0.45, r: 0.25, v: 0.06 }, lp: 3300 },
            { wave: 'tri', f: E3, seq: [[0, 0], [0.24, 7], [0.4, 12]], env: { a: 0.004, d: 0.3, s: 0.6, h: 0.3, r: 0.3, v: 0.12 } }],
        max: 1, gap: 1,
    },
    tallyTick: {
        db: -1, label: 'A tally row', group: 'play', desc: 'the count: a dry click and a short blip',
        layers: [{ wave: 'metal', f: 14000, env: { a: 0.001, d: 0.02, v: 0.04 }, lp: 3000 }, { wave: 'pulse', duty: 0.125, f: E5, env: { a: 0.001, d: 0.04, v: 0.035 }, lp: 3200 }],
        max: 2, gap: 0.05,
    },
    tallyBonus: {
        db: 1, label: 'A wave bonus earned', group: 'play', desc: 'SURVIVAL, CLUTCH, STONE, PAIRS: a bell, the octave over it',
        layers: [{ wave: 'tri', f: E5, env: { a: 0.003, d: 0.9, v: 0.12 } }, { wave: 'tri', f: E5 * JI.fifth, at: 0.04, env: { a: 0.004, d: 0.6, v: 0.05 } },
            { wave: 'pulse', duty: 0.125, f: E5, arp: { n: [0, 7, 12], step: 0.06 }, env: { a: 0.002, d: 0.08, s: 0.5, h: 0.12, r: 0.2, v: 0.03 }, lp: 3200 }],
        max: 1, gap: 0.3,
    },
    respawn: {
        label: 'A new rider', group: 'play', desc: 'your next rider materialises: a quick rise',
        layers: [{ wave: 'tri', f: R, arp: { n: [0, 7, 12], step: 0.05 }, env: { a: 0.003, d: 0.2, v: 0.09 } }],
        max: 1, gap: 0.3,
    },
    rumble: {
        db: 3, label: 'Telegraph: the beast comes up', group: 'play', desc: 'the lava boils where it will rise: a deep rumble swelling (1.1 s)',
        layers: [{ wave: 'tri', f: E2, vib: { rate: 9, depth: 90 }, env: { a: 0.3, d: 0.9, s: 0.8, v: 0.2 } },
            { wave: 'noise', f: 500, lp: { f: 250, to: 900, t: 1.0 }, trem: { rate: 12, depth: 0.6 }, env: { a: 0.3, d: 0.9, s: 0.8, v: 0.1 } }],
        max: 1, gap: 0.6,
    },
    roar: {
        db: 4, label: 'The beast rises', group: 'play', desc: 'a falling growl as its head comes out of the lava',
        layers: [{ wave: 'tri', f: hz('A2'), sweep: { to: 0.6, t: 0.9 }, vib: { rate: 18, depth: 120 }, env: { a: 0.02, d: 1.0, v: 0.24 } },
            { wave: 'noise', f: 1600, lp: { f: 1500, to: 300, t: 0.9 }, env: { a: 0.03, d: 0.95, v: 0.12 } },
            { wave: 'pulse', duty: 0.5, f: hz('E2'), sweep: { to: 0.8, t: 0.8 }, lp: 700, vib: { rate: 14, depth: 90 }, env: { a: 0.05, d: 0.8, v: 0.05 } }],
        max: 1, gap: 1,
    },
    sink: {
        db: 1, label: 'The beast goes under', group: 'play', desc: 'a slow wet gurgle down',
        layers: [{ wave: 'noise', f: 800, sweep: { to: 0.4, t: 0.7 }, lp: { f: 900, to: 250, t: 0.7 }, trem: { rate: 10, depth: 0.7 }, env: { a: 0.05, d: 0.75, v: 0.08 } }],
        max: 1, gap: 0.6,
    },
    throat: {
        db: 2, label: 'Telegraph: it gathers to spit', group: 'play', desc: 'its throat glows: a rising gurgle (0.8 s)',
        layers: [{ wave: 'tri', f: hz('A2'), sweep: { to: 2.2, t: 0.75 }, vib: { rate: 20, depth: 140 }, env: { a: 0.05, d: 0.75, s: 0.8, v: 0.12 } },
            { wave: 'noise', f: 1500, lp: { f: 500, to: 2000, t: 0.75 }, trem: { rate: 16, depth: 0.7 }, env: { a: 0.05, d: 0.75, s: 0.8, v: 0.06 } }],
        max: 1, gap: 0.5,
    },
    inhale: {
        db: 2, label: 'Telegraph: it draws breath', group: 'play', desc: 'a long breath in, opening up (1.0 s), before the fire',
        layers: [{ wave: 'noise', f: 2500, lp: { f: 400, to: 4000, t: 0.95 }, env: { a: 0.3, d: 0.7, s: 0.9, h: 0.05, v: 0.11 } },
            { wave: 'tri', f: E2, sweep: { to: 1.7, t: 0.95 }, env: { a: 0.2, d: 0.8, v: 0.08 } }],
        max: 1, gap: 0.5,
    },
    spit: {
        db: 3, label: 'It spits embers', group: 'play', desc: 'a wet pop and the embers sputtering up',
        layers: [{ wave: 'noise', f: 1800, sweep: { to: 0.3, t: 0.2 }, lp: { f: 2000, to: 500, t: 0.2 }, env: { a: 0.002, d: 0.22, v: 0.12 } },
            { wave: 'tri', f: hz('A3'), sweep: { to: 0.35, t: 0.2 }, vib: { rate: 24, depth: 120 }, env: { a: 0.002, d: 0.22, v: 0.12 } }],
        max: 2, gap: 0.1,
    },
    fire: {
        db: 3, label: 'The fire', group: 'play', desc: 'the jet of fire: a roaring hiss held for 1.2 s',
        layers: [{ wave: 'noise', f: 3000, lp: { f: 1800, to: 3200, t: 0.3 }, trem: { rate: 26, depth: 0.35 }, env: { a: 0.02, d: 0.1, s: 0.9, h: 1.05, r: 0.2, v: 0.12 } },
            { wave: 'tri', f: hz('B1') * 2, vib: { rate: 12, depth: 60 }, env: { a: 0.02, d: 0.1, s: 0.9, h: 1.05, r: 0.2, v: 0.12 } }],
        max: 1, gap: 0.5,
    },
    crownHit: {
        db: 5, label: 'A blow on its crown', group: 'play', desc: 'a hard crack on the crown, and a falling howl',
        layers: [{ wave: 'metal', f: 9000, sweep: { to: 0.4, t: 0.15 }, lp: 3000, env: { a: 0.001, d: 0.18, v: 0.08 } },
            { wave: 'noise', f: 5000, sweep: { to: 0.15, t: 0.4 }, lp: { f: 3200, to: 300, t: 0.4 }, env: { a: 0.002, d: 0.42, v: 0.14 } },
            { wave: 'pulse', duty: 0.25, f: hz('B3'), sweep: { to: 0.4, t: 0.7 }, vib: { rate: 9, depth: 80 }, env: { a: 0.01, d: 0.7, v: 0.06 }, lp: 2400 }],
        max: 1, gap: 0.3,
    },
    call: {
        db: 1, label: 'It calls its riders', group: 'play', desc: 'a low horn: two long notes',
        layers: [{ wave: 'pulse', duty: 0.5, f: E3, seq: [[0, 0], [0.3, -2]], env: { a: 0.03, d: 0.1, s: 0.8, h: 0.5, r: 0.2, v: 0.05 }, lp: 1200, vib: { rate: 5, depth: 20 } },
            { wave: 'tri', f: E2, seq: [[0, 0], [0.3, -2]], env: { a: 0.03, d: 0.1, s: 0.8, h: 0.5, r: 0.2, v: 0.12 } }],
        max: 1, gap: 1,
    },
    beastDeath: {
        db: 5, label: 'The beast dies', group: 'play', desc: 'a long descending explosion under a dying howl',
        layers: [{ wave: 'noise', f: 5000, sweep: { to: 0.05, t: 2.2 }, lp: { f: 4000, to: 100, t: 2.2 }, env: { a: 0.01, d: 2.3, v: 0.2 } },
            { wave: 'tri', f: hz('B2'), sweep: { to: 0.2, t: 2.0 }, vib: { rate: 8, depth: 60 }, env: { a: 0.005, d: 2.1, v: 0.24 } }],
        max: 1, gap: 2,
    },
    beastBoom: {
        db: 4, label: 'A blast as it dies', group: 'play', desc: 'a short boom',
        layers: [{ wave: 'noise', f: 4800, sweep: { to: 0.15, t: 0.35 }, lp: { f: 3000, to: 400, t: 0.35 }, env: { a: 0.002, d: 0.38, v: 0.12 } },
            { wave: 'tri', f: hz('A2'), sweep: { to: 0.4, t: 0.25 }, env: { a: 0.002, d: 0.28, v: 0.18 } }],
        max: 3, gap: 0.06, vary: { pitch: 150, level: 0.15, time: 0.008 },
    },
    lavaBed: {
        db: -9, loop: true, label: 'The lava', group: 'loop', drive: 'how low you fly (0 high .. 1 skimming)',
        desc: 'a very quiet rumble under the whole game, louder and brighter as you skim the lava', attack: 0.8, release: 0.8, glide: 0.4,
        layers: [{ wave: 'noise', f: 300, lp: [180, 600], level: [0.012, 0.05] },
            { wave: 'tri', f: [E2 * 0.75, E2], level: [0.02, 0.05] }],
    },
    growl: {
        db: -8, loop: true, label: 'The beast\'s growl', group: 'loop', drive: 'the beast up (0 under .. 1 up)',
        desc: 'the last wave: a low growl while its head is out of the lava', attack: 0.6, release: 0.8, glide: 0.3,
        layers: [{ wave: 'pulse', duty: 0.5, f: hz('E2'), lp: [200, 500], level: [0, 0.03], vib: { rate: 7, depth: 50 } },
            { wave: 'tri', f: E2, level: [0, 0.06], trem: { rate: 3, depth: 0.4 } }],
    },
};

const events = {
    stage: (s, e) => s.play(e.boss ? 'doom' : 'herald'),
    go: (s) => s.play('start'),
    flap: (s) => s.play('flap'),
    joust: (s, e) => s.play('clang', { pitch: (e.tier | 0) * 2 }),
    bounce: (s) => s.play('bounce'),
    die: (s, e) => { s.play('lifeLost'); if (e.cause === 'BURNED' || e.cause === 'THE BEAST') s.play('sizzle', { level: 1.3 }); else if (e.cause === 'THE HAND') s.play('grab', { pitch: -5 }); else s.play('bounce', { pitch: -7 }); },
    egg: (s, e) => s.play('egg', { pitch: [0, 0, 2, 4, 7][Math.min(4, e.chain | 0)] }),
    eggLost: (s) => s.play('sizzle'),
    hatch: (s) => s.play('hatch'),
    trample: (s) => s.play('trample'),
    spawn: (s) => s.play('spawn'),
    rivalBurn: (s) => s.play('sizzle', { pitch: -3 }),
    handWarn: (s, e) => s.play('gurgle', { level: e.player ? 1 : 0.6 }),
    handRise: (s) => s.play('handRise'),
    grab: (s, e) => s.play('grab', { level: e.player ? 1 : 0.6 }),
    struggle: (s, e) => s.play('struggle', { pitch: Math.min(8, (e.n | 0) * 2) }),
    escape: (s) => s.play('escape'),
    crack: (s) => s.play('creak'),
    crumble: (s) => s.play('crumble'),
    hawkWarn: (s) => s.play('screech'),
    hawk: (s) => s.play('hawkPass'),
    hawkKill: (s) => s.play('hawkKill'),
    pair: (s) => s.play('pair'),
    extraLife: (s) => s.play('oneUp'),
    waveClear: (s) => s.play('clear'),
    tally: (s, e) => { if (e.special) s.play('tallyBonus'); else if (e.miss) s.play('miss'); else s.play('tallyTick'); },
    respawn: (s) => s.play('respawn'),
    ward: (s) => s.play('ward'),
    beastWarn: (s) => s.play('rumble'),
    beastRise: (s) => s.play('roar'),
    beastSink: (s) => s.play('sink'),
    spitWarn: (s) => s.play('throat'),
    breathWarn: (s) => s.play('inhale'),
    spit: (s) => s.play('spit'),
    breath: (s) => s.play('fire'),
    beastHit: (s, e) => s.play('crownHit', { pitch: Math.max(0, 6 - (e.left | 0)) }),
    beastCall: (s) => s.play('call'),
    beastDie: (s) => { s.play('crownHit', { pitch: 4 }); s.play('beastDeath', { delay: 0.1 }); s.stop('growl', 1.5); },
    beastBoom: (s) => s.play('beastBoom'),
    victory: (s) => s.play('win'),
    mount: null,
};

export const SOUND = floorSound('lancerider', 'LANCE RIDER', R, {
    personality: 'a heraldic call over a lava pit: wing-beats, the clang of lances, eggs that climb the chain, a gurgle before the hand, a scream before the hawk, the beast\'s roar',
    sounds,
    events,
    // the round says everything through its own events; the eight SDK cues stay quiet (Coin keeps the stock chirp)
    cues: { Start: null, Hit: null, Miss: null, Die: null, Win: null, Bonus: null, Tick: null },
    silent: { mount: 'a hatchling climbs onto its bird: the hatch already sounded' },
    frame(s, game) {
        const sim = game.sim;
        if (!sim || !sim.player) return;
        const playing = sim.p === 2;                                       // Phase.Playing
        const low = playing && sim.player.mode === 1 ? Math.max(0, Math.min(1, (sim.player.y - 150) / 60)) : 0;
        s.drive('lavaBed', low);
        const b = sim.beast;
        if (b != null) s.drive('growl', playing && b.state >= 2 && b.state <= 5 ? b.rise : 0);
    },
});
