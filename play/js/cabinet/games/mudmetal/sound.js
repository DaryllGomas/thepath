// THE NODE · world 1 · MUD & METAL · THE BOARD'S VOICE.
// A low two-stroke under the race; dry landings, wet fords and the redline warning above it.
// The detailed events own the effects, so the eight panel cues do not double them.
import { floorSound } from '../../sound/palettes/floor.js';

const tone = (f, d, v = 0.07) => ({ wave: 'pulse', duty: 0.25, f, lp: 2600, env: { a: 0.003, d, v } });
const dirt = (f, d, v = 0.08) => ({ wave: 'noise', f, lp: 1800, env: { a: 0.002, d, v } });
const effect = (label, layers, gap = 0.12) => ({ label, group: 'play', layers, max: 2, gap });
export const SOUND = floorSound('mudmetal', 'MUD & METAL', 146.83, {
    personality: 'a rattling two-stroke, dirt thuds, water hiss and a bright redline alarm',
    cues: { Start: null, Hit: null, Miss: null, Die: null, Win: null, Bonus: null, Tick: null },
    sounds: {
        motor: {
            label: 'Two-stroke', group: 'loop', loop: true, attack: 0.1, release: 0.18, glide: 0.08,
            layers: [
                { wave: 'pulse', duty: 0.25, f: [42, 112], lp: [240, 720], level: [0.025, 0.045], trem: { rate: 24, depth: 0.35 } },
                { wave: 'noise', f: 400, lp: [160, 650], level: [0.005, 0.018] },
            ],
        },
        jump: effect('Leaving the lip', [{ ...tone(180, 0.16, 0.035), sweep: { to: 2, t: 0.14 } }, dirt(800, 0.09, 0.03)]),
        land: effect('Clean landing', [dirt(650, 0.09, 0.06), { wave: 'tri', f: 110, env: { a: 0.002, d: 0.1, v: 0.1 } }]),
        roughLand: effect('Rough landing', [dirt(1400, 0.18), tone(80, 0.14, 0.04)]),
        crunch: effect('Rider down', [dirt(3800, 0.4, 0.14), { ...tone(140, 0.32, 0.09), sweep: { to: 0.3, t: 0.3 } }], 0.3),
        wet: effect('Water spray', [{ ...dirt(3200, 0.34, 0.085), lp: { f: 3000, to: 350, t: 0.3 } }], 0.3),
        bog: effect('Mud grabs the tyres', [dirt(300, 0.24, 0.055), tone(65, 0.14, 0.035)], 0.4),
        warning: effect('Watch it', [tone(880, 0.1, 0.05), { ...tone(660, 0.1, 0.04), at: 0.15 }], 0.5),
        stall: effect('Engine stalled', [{ ...tone(120, 0.8, 0.07), sweep: { to: 0.2, t: 0.7 } }, dirt(500, 0.3)], 0.6),
        rev: effect('Engine catches', [{ ...tone(70, 0.2, 0.06), sweep: { to: 2.5, t: 0.18 } }], 0.3),
        gate: effect('Gate drops', [tone(294, 0.2), { ...tone(588, 0.3), at: 0.12 }, dirt(2000, 0.09, 0.05)], 0.5),
        cup: effect('The Redline Cup', [{ ...tone(294, 0.2), arp: { n: [0, 4, 7, 12, 16, 19, 24], step: 0.1 }, env: { a: 0.005, d: 0.15, s: 0.6, h: 0.7, r: 0.5, v: 0.08 } }, { wave: 'tri', f: 147, env: { a: 0.01, d: 1.6, v: 0.14 } }], 2),
    },
    events: {
        card: (s, e) => s.play(e.stage === 6 ? 'warning' : 'start'),
        count: (s, e) => s.play('tick', { pitch: (3 - e.n) * 2 }),
        go: (s) => s.play('gate'),
        takeoff: (s, e) => s.play('jump', { pitch: e.big ? 4 : 0 }),
        clean: (s, e) => s.play('land', { pitch: Math.min(4, e.combo - 1) }),
        rough: (s) => s.play('roughLand'),
        crash: (s, e) => s.play(e.cause === 'splash' ? 'wet' : 'crunch'),
        splash: (s) => s.play('wet'),
        mud: (s) => s.play('bog'), water: (s) => s.play('wet'),
        hot: (s) => s.play('warning'), overheat: (s) => s.play('stall'),
        engineBack: (s) => s.play('rev'), remount: (s) => s.play('rev'),
        shoveWarn: (s) => s.play('warning'), baleNear: (s) => s.play('warning'),
        bump: (s) => s.play('hit'), pass: (s) => s.play('bonus', { level: 0.45 }),
        gap: (s) => s.play('bonus', { level: 0.6 }), lap: (s) => s.play('gate'),
        pos: (s, e) => { if (e.up) s.play('tick', { pitch: 4 }); },
        finish: (s) => s.play('bonus'), tally: (s, e) => s.play(e.record ? 'bonus' : 'tick'),
        extra: (s) => s.play('win', { pitch: 12, level: 0.7 }),
        fail: (s) => s.play('lifeLost'), champion: (s) => s.play('cup'),
    },
    silent: { gameOver: 'the fail call already played; the host supplies out at the result card' },
    frame(s, game) {
        const m = game.sim;
        const riding = game.mode === 'play' && m && m.p === 3 && m.player.stallT <= 0;
        if (riding) s.drive('motor', 0.15 + 0.85 * Math.min(1, m.player.speed / m.turboSpeed));
        else s.stop('motor', 0.18);
    },
    end(s) { s.stop('motor', 0.2); },
});
