// THE NODE · THE JUNCTION · STARVECTOR (the super-scaler) · THE PILOT. Plays through exactly what a player has (one input frame a
// step) and only READS the sim. It looks 1.5 s ahead, scores a grid of places to be (where would each thing that is coming hurt
// you, flying there at your real speed), and goes to the safest, firing all the time. It HOLDS the fire button (auto-fire); in a boss fight it lines up on the weak point the body is not hiding,
// steps out of the telegraphed beams / sweeps / lunges and rolls when one is about to land. Its SKILL is how a person plays:
//   'good'    sees everything, instantly (the attract demo, the "can it be cleared" test)
//   'normal'  an ordinary player: sees most things, a quarter-second late, a little imprecise (the mercy bench)
//   'poor'    a bad run: misses half of what is coming, slow, wobbly
//   'idle'    holds nothing and fires nothing (the credit-5 test: it must still not win)
import { CabinetBotBase, InputFrame } from '../../sdk/index.js';
import { SV } from './sim.js';
import * as Boss from './boss.js';

const SKILLS = {
    good: { aware: 1, delay: 0, noise: 0, margin: 1.0, replan: 0.08, rollAt: 0.28, fire: true },
    normal: { aware: 0.68, delay: 0.36, noise: 0.8, margin: 0.66, replan: 0.2, rollAt: 0.08, fire: true },
    poor: { aware: 0.5, delay: 0.46, noise: 1.1, margin: 0.52, replan: 0.26, rollAt: 0.04, fire: true },
    idle: { aware: 0, delay: 0, noise: 0, margin: 0, replan: 1, rollAt: 0, fire: false },
};
const XS = [-5, -4.2, -3.4, -2.6, -1.8, -1.0, -0.3, 0.3, 1.0, 1.8, 2.6, 3.4, 4.2, 5], YS = [-2.8, -2.1, -1.4, -0.7, 0, 0.7, 1.4];
const SHOOT = new Set(['rock', 'fighter', 'drone', 'turret', 'mine']);

export class StarvectorBot extends CabinetBotBase {
    constructor(skill = 'good') { super(); this.skill = SKILLS[skill] ? skill : 'good'; this.sk = SKILLS[this.skill]; this._tx = 0; this._ty = -1.2; this._t = 0; this._q = []; this._seen = new Map(); }
    get name() { return 'starvector-' + this.skill; }
    reset(seed) { super.reset(seed); this._tx = 0; this._ty = -1.2; this._t = 0; this._q.length = 0; this._seen.clear(); this._lastRoll = 0; }

    think(sim, dt) {
        const sk = this.sk, S = sim.ship; this._t += dt;
        const f = new InputFrame();
        if (!S.alive) return f;
        this._plan = (this._plan || 0) - dt;
        if (this._plan <= 0) {
            this._plan = sk.replan;
            const goal = sk.aware > 0 || sk.fire ? this._choose(sim) : { x: S.x, y: S.y, roll: false };
            this._q.push({ at: this._t + sk.delay, g: goal });
        }
        while (this._q.length && this._q[0].at <= this._t) this._cur = this._q.shift().g;
        const g = this._cur || { x: S.x, y: S.y, roll: false };
        const dx = g.x - S.x, dy = g.y - S.y, dz = 0.12;
        f.x = Math.abs(dx) < dz ? 0 : Math.max(-1, Math.min(1, dx * 2.4));
        f.y = Math.abs(dy) < dz ? 0 : Math.max(-1, Math.min(1, dy * 2.4));
        f.a = sk.fire && S.alive;
        // a barrel roll when something is about to land on you
        if (g.roll && S.rollCool <= 0 && S.invuln <= 0 && this._t - this._lastRoll > 0.9) { f.b = true; this._lastRoll = this._t; }
        return f;
    }

    _choose(sim) {
        const S = sim.ship, V = sim.V, sk = this.sk, spdx = 12.5, spdy = 9.2;
        const marg = sk.margin;
        const B = sim.boss && sim.boss.state !== 'dying' ? sim.boss : null;
        // what is coming (a person misses some of it)
        const th = [];
        for (const o of sim.objs) {
            if (o.deco || o.k === 'gate' || o.k === 'diamond' || o.k === 'boss' || o.z < SV.ZS - 1.2) continue;
            const closing = o.cs !== undefined ? o.cs : V - o.vz; if (closing <= 0) continue;
            const tc = (o.z - SV.ZS) / closing; if (tc > 1.7 || tc < -0.1) continue;
            if (sk.aware < 1) { const key = o; let v = this._seen.get(key); if (v === undefined) { v = this.rng.nextDouble() < sk.aware; this._seen.set(key, v); if (this._seen.size > 400) this._seen.clear(); } if (!v) continue; }
            const p = sim.objAt(o, Math.max(0, tc));
            th.push({ o, tc: Math.max(0, tc), x: p.x, y: p.y, shot: false });
        }
        for (const s of sim.eshots) {
            const closing = V - s.vz; if (closing <= 0) continue; const tc = (s.z - SV.ZS) / closing; if (tc > 1.7 || tc < 0) continue;
            if (sk.aware < 1 && this.rng.nextDouble() > sk.aware) continue;
            th.push({ o: s, tc, x: s.x + s.vx * tc, y: s.y + s.vy * tc, shot: true, rr: 1.05 + s.r });
        }
        // the boss's timed regions (beams, tail sweeps, the lunge)
        const hz = [];
        for (const h of sim.hz) {
            const tin = Math.max(0, h.arm); if (tin > 1.7) continue;
            if (sk.aware < 1) { let v = this._seen.get(h); if (v === undefined) { v = this.rng.nextDouble() < Math.min(1, sk.aware + 0.12); this._seen.set(h, v); } if (!v) continue; }
            const full = h.kind === 'sweep';
            hz.push({ tin, tout: tin + Math.max(0.05, h.dur), x0: full ? -99 : h.x0 - 0.45, x1: full ? 99 : h.x1 + 0.45, y0: h.y0 - 0.5, y1: h.y1 + 0.5 });
        }
        // the gate we are flying to
        const gate = sim.objs.find((o) => (o.k === 'gate' || o.k === 'diamond') && !o.passed && o.z < 130);
        const light = sim.light && sim.stage !== 'symbol' ? sim.light : null;
        // the thing worth shooting: a boss part first, else the nearest target roughly in front
        let tgt = null, bossTgt = false;
        if (B && B.state === 'fight') {
            let bd = 1e9;
            for (const p of B.parts) { if (p.dead || !Boss.exposed(B, p)) continue; const d = Math.hypot(p.x - S.x, p.y - S.y) - p.hp * 0.01; if (d < bd) { bd = d; tgt = p; } }
            bossTgt = !!tgt;
        }
        if (!tgt) for (const o of sim.objs) { if (o.deco || !SHOOT.has(o.k) || o.z < 12 || o.z > 90) continue; if (!tgt || o.z < tgt.z) tgt = o; }
        let best = null, bc = 1e18;
        const nz = sk.noise;
        const roomX = (px, py, h) => px + 0.68 > h.x0 && px - 0.68 < h.x1 && py + 0.44 > h.y0 && py - 0.44 < h.y1;
        for (const cx of XS) for (const cy of YS) {
            const dx = cx - S.x, dy = cy - S.y, dist = Math.hypot(dx, dy), tt = Math.max(Math.abs(dx) / spdx, Math.abs(dy) / spdy);
            let cost = 0;
            // along the way: where will you be when each thing arrives?
            for (const t of th) {
                const k = tt > 0 ? Math.min(1, t.tc / tt) : 1, px = S.x + dx * k, py = S.y + dy * k;
                let hit = false;
                if (t.shot) hit = Math.hypot((t.x - px) / (t.rr / marg), (t.y - py) / (1.2 / marg)) < 1;
                else for (const [ox, oy] of OFFS) { if (sim.hurts(t.o, px + ox * (2 - marg) * 0.6, py + oy * (2 - marg) * 0.6, t.x, t.y)) { hit = true; break; } }
                if (hit) cost += 1000 / (1 + t.tc * 3);
            }
            for (const h of hz) { if (tt < h.tout + 0.05 && roomX(cx, cy, h)) cost += 1100 / (1 + h.tin * 3); }
            cost += dist * 2.2;
            if (gate) cost += Math.hypot(cx - gate.x, cy - gate.y) * (gate.z < 60 ? 6 : 1.2);
            if (light) cost += Math.hypot(cx - light.x, (cy - light.y) * 0.5) * 1.3;
            if (tgt) {
                const off = Math.hypot(tgt.x - cx, (tgt.y - cy) * 1.2);
                if (bossTgt) { if (Boss.laneClear(B, cx, cy, tgt)) cost -= Math.max(0, 3.0 - off) * 8; else cost -= Math.max(0, 1.2 - off) * 1.5; }
                else cost -= Math.max(0, 3 - off) * 3.2;
            }
            cost += (cy > 0.9 ? 1.2 : 0) + Math.abs(cx) * 0.05;
            if (nz > 0) cost += (this.rng.nextDouble() - 0.5) * nz * 6;
            if (cost < bc) { bc = cost; best = { x: cx, y: cy }; }
        }
        // is something landing on me right now? (a roll)
        let roll = false;
        for (const t of th) if (t.tc < sk.rollAt && !t.shot) { if (sim.hurts(t.o, S.x, S.y, t.x, t.y)) roll = true; }
        for (const t of th) if (t.shot && t.tc < sk.rollAt + 0.1 && Math.hypot(t.x - S.x, (t.y - S.y)) < 0.8 + t.rr * 0.5) roll = true;
        for (const h of hz) if (h.tin < sk.rollAt + 0.1 && roomX(S.x, S.y, h)) roll = true;
        best.roll = roll;
        return best;
    }
}
const OFFS = [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.4], [0, -0.4]];
