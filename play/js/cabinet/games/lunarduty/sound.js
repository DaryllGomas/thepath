// THE NODE · LUNAR DUTY · the patrol's chip voice: dry twin guns, spring suspension and beacon bells.
import { floorSound } from '../../sound/palettes/floor.js';

export const SOUND = floorSound('lunarduty', 'LUNAR DUTY', 293.665, {
    sounds: {
        fire: {
            label: 'Twin guns', group: 'play', desc: 'a short falling pulse from both barrels',
            layers: [{ wave: 'pulse', duty: 0.25, f: 1200, sweep: { to: 0.25, t: 0.08 },
                env: { a: 0.001, d: 0.09, v: 0.055 }, lp: 3200 }], max: 2, gap: 0.08,
        },
        jump: {
            label: 'Suspension leap', group: 'play', desc: 'a rising triangle as the wheels leave the road',
            layers: [{ wave: 'tri', f: 180, sweep: { to: 3, t: 0.18 },
                env: { a: 0.002, d: 0.22, v: 0.09 } }], max: 1, gap: 0.2,
        },
        explosion: {
            label: 'Moon dust burst', group: 'play', desc: 'noise and a low hull thump',
            layers: [{ wave: 'noise', f: 3400, sweep: { to: 0.18, t: 0.25 },
                env: { a: 0.002, d: 0.28, v: 0.08 }, lp: 2300 },
                { wave: 'tri', f: 100, sweep: { to: 0.4, t: 0.18 }, env: { a: 0.002, d: 0.2, v: 0.1 } }],
            max: 3, gap: 0.06,
        },
    },
    events: {
        fire: s => s.play('fire'), jump: s => s.play('jump'),
        hit: s => s.play('hit'), explosion: s => s.play('explosion'),
        stageStart: s => s.play('start'), stageClear: s => s.play('bonus'),
        extraLife: s => s.play('bonus'), boss: s => s.play('miss'),
        bossHit: s => s.play('hit'), bossDown: s => s.play('explosion'),
        bomb: s => s.play('tick'), enemyFire: s => s.play('fire'),
        dig: s => s.play('explosion'), crash: s => s.play('explosion'),
    },
});
