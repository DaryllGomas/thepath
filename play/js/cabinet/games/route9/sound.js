// THE NODE · world 1 · ROUTE 9 · THE SOUND: paper flicks, spokes and porch bells.
import { floorSound } from '../../sound/palettes/floor.js';
export const SOUND = floorSound('route9', 'ROUTE 9', 392, {
    sounds: {
        flick: { label: 'Paper flick', group: 'play', layers: [
            { wave: 'noise', f: 4200, lp: 2600, env: { a: 0.001, d: 0.09, v: 0.045 } },
            { wave: 'tri', f: 700, sweep: { to: 0.5, t: 0.09 }, env: { a: 0.001, d: 0.1, v: 0.05 } }], gap: 0.08 },
        bell: { label: 'Porch bell', group: 'play', layers: [
            { wave: 'tri', f: 784, seq: [[0,0],[0.08,7]], env: { a: 0.002, d: 0.3, v: 0.09 } }], gap: 0.08 },
        hop: { label: 'Bike jump', group: 'play', layers: [
            { wave: 'pulse', duty: 0.125, f: 196, sweep: { to: 4, t: 0.16 }, lp: 2200, env: { a: 0.002, d: 0.18, v: 0.045 } }], gap: 0.15 },
        smash: { label: 'Glass and spokes', group: 'play', layers: [
            { wave: 'noise', f: 6000, lp: 3400, env: { a: 0.001, d: 0.25, v: 0.09 } },
            { wave: 'tri', f: 98, sweep: { to: 0.4, t: 0.2 }, env: { a: 0.001, d: 0.25, v: 0.13 } }], gap: 0.1 },
        bark: { label: 'Dog warning', group: 'play', layers: [
            { wave: 'pulse', duty: 0.5, f: 130, seq: [[0,0],[0.12,3]], lp: 1000, env: { a: 0.005, d: 0.08, v: 0.05 } }], gap: 0.5 },
    },
    cues: { Start: null, Hit: null, Miss: null, Bonus: null, Die: null, Win: null, Tick: null },
    events: {
        fire: (s,e) => s.play('flick', {pitch: e.heavy ? -4 : 0}),
        delivery: (s,e) => s.play('bell', {pitch: Math.min(7,e.streak)}),
        jump: s => s.play('hop'), crash: s => s.play('smash'), glass: s => s.play('smash', {pitch: 12}),
        dog: s => s.play('bark'), miss: s => s.play('miss'), pickup: s => s.play('bonus'),
        target: s => s.play('bell', {pitch: 12}), stageStart: s => s.play('start'),
        stageClear: s => s.play('bonus'), extraLife: s => s.play('bonus'),
        finale: s => s.play('bark', {pitch: -7}), victory: s => s.play('win'),
    },
});
