// THE NODE · LAST LIGHT · launch chirps, glass alarms and a heavy carrier hull.
import { floorSound } from '../../sound/palettes/floor.js';
export const SOUND = floorSound('lastlight', 'LAST LIGHT', 220, {
    sounds: {
        fire: { layers: [{ wave: 'pulse', duty: 0.125, f: 660, sweep: { to: 2.5, t: 0.1 }, env: { a: 0.001, d: 0.12, v: 0.055 } }], max: 3, gap: 0.05 },
        explosion: { layers: [{ wave: 'noise', f: 1800, sweep: { to: 0.3, t: 0.3 }, env: { a: 0.003, d: 0.32, v: 0.06 }, lp: 1800 }], max: 3, gap: 0.07 },
        alarm: { layers: [{ wave: 'pulse', duty: 0.5, f: 165, arp: { n: [0, 7, 0, 7], step: 0.12 }, env: { a: 0.003, d: 0.1, s: 0.5, h: 0.35, r: 0.15, v: 0.05 } }], gap: 0.5 },
    },
    events: {
        dry: s => s.play('miss'), shield: s => s.play('hit'), reload: s => s.play('bonus'), bomberDown: s => s.play('explosion'),
        fire: s => s.play('fire'), explosion: s => s.play('explosion'), impact: s => s.play('explosion'),
        hit: s => s.play('hit'), split: s => s.play('alarm'), bomber: s => s.play('alarm'),
        boss: s => s.play('alarm'), bossHit: s => s.play('hit'), bossDown: s => s.play('explosion'),
        extraLife: s => s.play('bonus'), stageStart: s => s.play('start'), stageClear: s => s.play('bonus'),
        domeLost: s => s.play('lifeLost'), siloLost: s => s.play('explosion'), enemyFire: s => s.play('miss'),
    },
    silent: { decoy: 'A harmless trail fades.' },
    cues: { Tick: () => {}, Hit: () => {}, Die: () => {}, Start: () => {} },
});
