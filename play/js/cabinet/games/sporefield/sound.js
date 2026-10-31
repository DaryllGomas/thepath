// THE NODE · SPORE FIELD · little wings, shell cracks and a garden harvest.
import { floorSound } from '../../sound/palettes/floor.js';
export const SOUND = floorSound('sporefield', 'SPORE FIELD', 330, {
    sounds: {
        fire: { layers: [{ wave: 'pulse', duty: 0.125, f: 1200, sweep: { to: 0.4, t: 0.06 }, env: { a: 0.001, d: 0.07, v: 0.035 } }], max: 2, gap: 0.06 },
        crack: { layers: [{ wave: 'noise', f: 3200, env: { a: 0.001, d: 0.14, v: 0.06 }, lp: 2500 }], max: 3, gap: 0.03 },
    },
    silent: { win: 'the SDK Win cue plays the ending fanfare' },
    cues: { Tick: null, Hit: null, Miss: null, Bonus: null, Die: null },
    events: {
        fire: s => s.play('fire'), mushroom: s => s.play('tick'), head: s => s.play('crack'), split: s => s.play('hit'),
        spider: s => s.play('miss'), flea: s => s.play('tick'), spiderHit: s => s.play('bonus'), fleaHit: s => s.play('bonus'),
        reinforce: s => s.play('start'), stageStart: s => s.play('start'), stageClear: s => s.play('bonus'), boss: s => s.play('miss'),
        armour: s => s.play('tick'), queenHit: s => s.play('crack'), queenGone: s => s.play('bonus'),
        extraLife: s => s.play('bonus'), burst: s => s.play('crack'), death: s => s.play('lifeLost'),
    },
});
