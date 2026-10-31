// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) · THE TIN KING: stage 7's boss (rules only).
// Added in the 2026-10-18 build-out. The sim (round.js) owns him; this file is his body and his habits.
//
// A big tin wind-up king (40 x 40) with a crown and a key in his back, loose in THE TIN THRONE:
//   MOVES     drifts on the diagonal like a whistler, through every platform, bouncing off the walls,
//             and re-aims at the cub every 1.4-2.4 s (60%)
//   THROWS    every 4.5-5.5 s he stops and winds up (TELEGRAPH 0.9 s: he shakes, his key spins, a "!"
//             shows), then throws a gear at the cub (a fan of 3 once he is angry). A gear kills the
//             cub; any bubble in its way stops it
//   WINDS OUT a little wind-up drops from him every 8.5 s while fewer than 2 are out (3 when angry):
//             bubble and pop them as usual
//   HURT BY   SPARKS only: they are drawn to tin (round.js steers them at him). Each one is a hit; at
//             half his hits he goes ANGRY (red, 40% faster, quicker throws). A plain bubble just
//             plinks off him. Touch him and you lose a life.
//   BEATEN    at 0 he winds down into a giant bubble that floats up under the ceiling: touch it to
//             pop him (10,000), and every little wind-up bursts with him. Clearing his room wins.
// On the unlosable credit he never throws and keeps one wind-up out at most.
import { f32 } from '../../sdk/index.js';
import { SpritePopLevel } from './tiles.js';

export const KState = Object.freeze({ Move: 0, Tele: 1, Trapped: 2, Gone: 3 });

const Tile = SpritePopLevel.Tile;
const InnerL = SpritePopLevel.InnerL, InnerR = SpritePopLevel.InnerR;
const FloorY = SpritePopLevel.FloorRow * Tile;

export class TinKing {
    constructor() {
        this.x = 0; this.y = 0; this.w = 40; this.h = 40;              // top-left, field px
        this.homeX = f32(132); this.homeY = f32(52);
        this.face = -1; this.fy = 1;
        this.hp = 12; this.maxHp = 12;
        this.rage = false;
        this.state = KState.Move;
        this.t = 0;                     // the telegraph's clock
        this.atkT = f32(4); this.minionT = f32(5); this.think = f32(1.5);
        this.flash = 0;                 // a hit's white flash
        this.anim = 0;
        this.throws = 0;
    }
    get cx() { return f32(this.x + f32(this.w * 0.5)); }
    get cy() { return f32(this.y + f32(this.h * 0.5)); }
    get vulnerable() { return this.state === KState.Move || this.state === KState.Tele; }
}

// one step of the king while the room plays; sim gives the cub, the dice, the shots and the minions
export function kingStep(sim, k, dt) {
    k.anim = f32(k.anim + dt);
    if (k.flash > 0) k.flash = f32(k.flash - dt);
    if (!k.vulnerable) return;                                   // in his bubble (the sim carries it) or gone
    const mercy = sim.mercyActive, cub = sim.cub;

    if (k.state === KState.Tele) {
        k.t = f32(k.t - dt);
        if (k.t > 0) return;
        if (!mercy) {
            // the fan of gears, aimed at the cub
            const n = k.rage ? 3 : 1, spread = f32(0.45);
            const base = Math.atan2(f32(cub.cy - k.cy), f32(cub.cx - k.cx));
            const gs = f32(sim.gearSpeed * (k.rage ? f32(1.2) : 1));
            for (let i = 0; i < n; i++) {
                const a = base + (i - (n - 1) * 0.5) * spread;
                const ca = f32(Math.cos(a)), sa = f32(Math.sin(a));
                sim.shots.push({ kind: 1, x: f32(k.cx + f32(ca * 18)), y: f32(k.cy + f32(sa * 18)), vx: f32(ca * gs), vy: f32(sa * gs), r: 4, t: 0, alive: true });
            }
            k.throws++;
            sim._emit('kingThrow', { n, x: k.cx, y: k.cy });
        }
        k.state = KState.Move;
        k.atkT = f32(sim._range(f32(4.5), f32(5.5)) * (k.rage ? f32(0.72) : 1) * (mercy ? f32(1.5) : 1));
        return;
    }

    // drift on the diagonal, re-aiming at the cub now and then
    const sp = f32(f32(sim.kingBase * sim.speedMul) * (k.rage ? f32(1.4) : 1));
    k.think = f32(k.think - dt);
    if (k.think <= 0) {
        k.think = sim._range(f32(1.4), f32(2.4));
        if (!mercy && sim._chance(0.6)) { k.face = cub.cx >= k.cx ? 1 : -1; k.fy = cub.cy >= k.cy ? 1 : -1; }
        else if (sim._chance(0.4)) k.fy = -k.fy;
    }
    k.x = f32(k.x + f32(f32(k.face * sp) * dt));
    k.y = f32(k.y + f32(f32(f32(k.fy * sp) * f32(0.6)) * dt));
    if (k.x < InnerL) { k.x = f32(InnerL); k.face = 1; }
    if (k.x > InnerR - k.w) { k.x = f32(InnerR - k.w); k.face = -1; }
    if (k.y < SpritePopLevel.CeilingY) { k.y = f32(SpritePopLevel.CeilingY); k.fy = 1; }
    if (k.y > FloorY - k.h) { k.y = f32(FloorY - k.h); k.fy = -1; }

    k.atkT = f32(k.atkT - dt);
    if (k.atkT <= 0) {
        k.state = KState.Tele; k.t = mercy ? f32(1.2) : f32(0.9);
        sim._emit('kingTele', { x: k.cx, y: k.cy });
    }
    k.minionT = f32(k.minionT - dt);
    if (k.minionT <= 0) {
        k.minionT = k.rage ? f32(6) : f32(8.5);
        const cap = mercy ? 1 : k.rage ? 3 : 2;
        if (sim.minionsOut < cap) sim._spawnMinion(k);
    }
}
