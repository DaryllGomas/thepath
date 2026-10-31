// THE NODE · world 1 · SHORT ORDER · THE SOUND: shaker hiss, falling food and the order bell.
// No loop under the kitchen: leave room for the Junction's jukebox.
import { floorSound } from '../../sound/palettes/floor.js';

const play = name => s => s.play(name);
export const SOUND = floorSound('shortorder', 'SHORT ORDER', 349.23, {
    personality: 'a busy lunch counter: dry footsteps, a pepper hiss, falling slabs and a bright order bell',
    sounds: {
        pepper: {
            label: 'Pepper shaker', group: 'play', desc: 'a short sandy hiss',
            layers: [{ wave: 'noise', f: 6500, lp: 3400, env: { a: 0.005, d: 0.22, v: 0.07 } }], max: 2, gap: 0.12,
        },
        drop: {
            label: 'Falling ingredient', group: 'play', desc: 'a rubbery downward slide',
            layers: [{ wave: 'tri', f: 520, sweep: { to: 0.3, t: 0.19 }, env: { a: 0.002, d: 0.22, v: 0.10 } }], max: 3, gap: 0.04,
        },
        bell: {
            label: 'Order bell', group: 'play', desc: 'a bright counter bell with a soft fifth',
            layers: [{ wave: 'tri', f: 1396.92, env: { a: 0.002, d: 0.65, v: 0.11 } },
                { wave: 'tri', f: 2095.38, env: { a: 0.002, d: 0.4, v: 0.04 } }], max: 2, gap: 0.15,
        },
        rival: {
            label: 'Rival warning', group: 'play', desc: 'a low two-note challenge',
            layers: [{ wave: 'pulse', duty: 0.25, f: 174.615, seq: [[0, 0], [0.16, 7]], env: { a: 0.003, d: 0.12, s: 0.5, h: 0.22, r: 0.15, v: 0.06 }, lp: 2200 }], max: 1, gap: 0.4,
        },
    },
    // Detailed events own the play sounds; SDK cues still provide coin and result music.
    cues: { Start: () => {}, Hit: () => {}, Miss: () => {}, Bonus: () => {}, Tick: () => {}, Die: () => {} },
    events: {
        stage: play('bell'), ready: play('tick'), go: play('start'), step: play('tick'),
        pepper: play('pepper'), dry: play('miss'), drop: play('drop'), kick: play('hit'),
        land: play('hit'), plate: play('hit'), burger: play('bell'), ride: play('bonus'), crush: play('hit'),
        food: play('tick'), eat: play('bonus'), extra: play('bonus'),
        bossWarn: play('rival'), bossHit: play('hit'), bossOut: play('bonus'),
        clear: play('bell'), tally: play('tick'), ticketTick: play('rival'), late: play('rival'),
        caught: play('lifeLost'),
    },
    silent: { spawn: 'entry is telegraphed visually', lost: 'host out event', win: 'SDK Win cue' },
});
