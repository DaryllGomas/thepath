// THE NODE · THE JUNCTION · STARVECTOR · THE BOSSES: one at the end of each act. Rules only (sim side); renderer_fx.js draws them.
//
//   ACT I   IRONCLAD          a huge armoured gunship guarding the ring beacon. Shoot the four turrets off, the core opens, kill it.
//   ACT II  MAGMA WYRM        a lava serpent bursting from the fissure. Its HEAD is the weak point; its body trails BEHIND it (never in front of
//                             the gun's line to the head); its tail sweeps across; it lunges.
//   ACT III THE WAKING STONE  a standing stone, awake. Glowing RUNES are the weak points; it hurls rock shards and slams the ground
//                             (shockwaves with a gap, or roll through).
// Every boss: intro (invulnerable, WARNING), 3 phases by health (a stagger and a bullet clear between them), ONE attack at a time with
// a visible telegraph, a death sequence (chained explosions, hit-stop, slow-mo), then the act's gate comes.
// Parts: { id, kind, x, y, z (world, kept up to date), r, hp, max, armored, guard, main, dead, hit }.
//   guard parts must all die before the armoured MAIN part is exposed; the MAIN part dying kills the boss.
import { SV } from './sim.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export const NAMES = ['', 'IRONCLAD', 'MAGMA WYRM', 'THE WAKING STONE'];
const TYPES = ['', 'gunship', 'serpent', 'guardian'];
const TZ = [0, 22, 17, 20];
// the attack pool of each phase; the telegraph (s) and the time the attack takes after it
const POOL = {
    gunship: [['volley', 'volley', 'beam'], ['volley', 'ring', 'beam', 'volley'], ['volley', 'ring', 'beam2', 'mines', 'beam']],
    serpent: [['spit', 'sweep'], ['spit', 'sweep', 'lunge'], ['spit', 'sweep2', 'lunge', 'erupt']],
    guardian: [['shards', 'slam'], ['shards', 'slam', 'slam2'], ['shards2', 'slam2', 'slam', 'shards']],
};
const TELE = { volley: 0.7, ring: 1.0, beam: 1.1, beam2: 1.2, mines: 0.55, spit: 0.6, sweep: 1.2, sweep2: 1.2, lunge: 1.0, erupt: 0.8, shards: 0.85, shards2: 0.85, slam: 1.25, slam2: 1.25 };
const AFTER = { volley: 0.85, ring: 0.7, beam: 0.7, beam2: 0.8, mines: 0.6, spit: 0.5, sweep: 1.5, sweep2: 2.3, lunge: 1.6, erupt: 0.7, shards: 0.6, shards2: 1.1, slam: 0.8, slam2: 1.9 };
const GAP = [0, 1.15, 0.8, 0.5];

export function spawn(sim, quick) {
    const act = sim.act, d = sim.kn.density, hs = 0.62 + 0.38 * clamp((d - 0.45) / 0.55, 0, 1);
    const b = { k: 'boss', type: TYPES[act], name: NAMES[act], act, x: 0, y: 0.3, z: TZ[act] + 70, tz: TZ[act], dz: 2, vz: 0, t: 0, state: 'intro', introDur: quick ? 0.8 : 3.8, phase: 1, stagger: 0, nextAtk: 1.2,
        atk: null, lastAtk: '', open: false, quick: false, parts: [], segs: [], solids: [], deathT: 0, boomT: 0, rise: 0, hit: 0, pingT: 0, arrived: false, wob: 0, hs };
    b.introT = b.introDur; b.pz = b.z; b.hit = 0;
    const P = (id, kind, dx, dy, r, hp, o = {}) => { const p = { id, kind, dx, dy, x: b.x + dx, y: b.y + dy, z: b.z, r, hp: hp * hs, max: hp * hs, dead: false, hit: 0, isPart: true, boss: b, armored: false, guard: false, main: false, ...o }; b.parts.push(p); return p; };
    if (b.type === 'gunship') {
        P('t1', 'turret', -5.4, 0.1, 1.15, 100, { guard: true }); P('t2', 'turret', 5.4, 0.1, 1.15, 100, { guard: true });
        P('t3', 'turret', -2.7, 1.3, 1.0, 88, { guard: true }); P('t4', 'turret', 2.7, 1.3, 1.0, 88, { guard: true });
        P('core', 'core', 0, -0.1, 1.5, 420, { armored: true, main: true });
    } else if (b.type === 'serpent') {
        P('head', 'head', 0, 0, 2.4, 560, { main: true });
        for (let i = 1; i <= 7; i++) b.segs.push({ i, x: 0, y: 0, z: b.tz, r: 1.4 - i * 0.07 });
    } else {
        P('r1', 'rune', -5.4, 1.5, 0.95, 105, { guard: true }); P('r2', 'rune', 5.4, 1.5, 0.95, 105, { guard: true });
        P('r3', 'rune', -1.5, 2.2, 0.9, 95, { guard: true }); P('r4', 'rune', 1.5, 2.2, 0.9, 95, { guard: true });
        P('heart', 'heart', 0, -0.8, 1.15, 460, { armored: true, main: true });
    }
    b.hpMax = b.parts.reduce((a, p) => a + p.max, 0);
    sim.boss = b; sim.objs.push(b);
    if (quick) makeQuick(sim, b);
    layout(sim, b);
    return b;
}

/** a pushover boss (the arcade test's glass): the same fight at a tenth of the health, in and out fast */
export function makeQuick(sim, b) {
    b.quick = true; sim._quick = true;
    for (const p of b.parts) { p.hp *= 0.06; p.max *= 0.06; }
    b.hpMax = b.parts.reduce((a, p) => a + p.max, 0);
    if (b.state === 'intro') b.introT = Math.min(b.introT, 0.7);
    b.introDur = Math.min(b.introDur, 0.8);
}

export const hpNow = (b) => b.parts.reduce((a, p) => a + (p.dead ? 0 : p.hp), 0);
export const hpFrac = (b) => clamp(hpNow(b) / b.hpMax, 0, 1);
/** can a shot hurt this part right now? */
export function exposed(b, p) {
    if (b.state !== 'fight' || p.dead) return false;
    return !p.armored || b.open;
}

// ---------------------------------------------------------------- the step
export function step(sim, dt) {
    const b = sim.boss; if (!b) return;
    const S = sim.ship;
    b.t += dt; b.hit = Math.max(0, b.hit - dt); b.pingT = Math.max(0, b.pingT - dt);
    for (const p of b.parts) p.hit = Math.max(0, p.hit - dt);
    b.open = b.parts.every((p) => !p.guard || p.dead);
    if (b.state === 'intro') {
        b.introT -= dt; const u = clamp(1 - b.introT / b.introDur, 0, 1);
        if (b.type === 'gunship') { b.z = b.tz + (1 - smooth(0, 0.8, u)) * 70; b.x = 0; b.y = 0.3; }
        else { b.z = b.tz; b.rise = smooth(0.05, 0.85, u); b.x = 0; b.y = 0.3; }
        if (!b.arrived && u > (b.type === 'gunship' ? 0.7 : 0.3)) {
            b.arrived = true; sim.shake = Math.max(sim.shake, 1.0); sim.flash = Math.max(sim.flash, 0.3); sim._emit('bossArrive', { act: b.act });
            if (b.type !== 'gunship') for (let i = 0; i < 3; i++) sim._boom((i - 1) * 2.4, -SV.GY + 0.3, b.z - 1, 1.4);
        }
        if (b.introT <= 0) { b.state = 'fight'; b.rise = 1; b.nextAtk = b.quick ? 0.6 : 1.4; }
    } else if (b.state === 'fight') {
        fightMove(sim, b);
        // phase by health: a stagger and a clean screen between them
        const f = hpFrac(b), ph = f > 0.62 ? 1 : f > 0.3 ? 2 : 3;
        if (ph > b.phase) {
            b.phase = ph; b.stagger = 1.15; b.atk = null; b.nextAtk = 1.5; sim.eshots.length = 0; sim.hz.length = 0;
            for (let i = sim.objs.length - 1; i >= 0; i--) if (sim.objs[i].k === 'wave' || sim.objs[i].k === 'mine') sim.objs.splice(i, 1);
            sim.flash = Math.max(sim.flash, 0.4); sim.shake = Math.max(sim.shake, 1.0); sim.hitStop = Math.max(sim.hitStop, 0.06); sim._emit('bossPhase', { phase: ph });
            sim._pop(ph === 3 ? 'ENRAGED' : 'PHASE ' + ph, b.x, b.y + 2.4, b.z - 2, 2);
        }
        if (b.stagger > 0) b.stagger -= dt;
        else if (b.atk) {
            const a = b.atk; a.t += dt; a.k = clamp(a.t / a.tele, 0, 1);
            runAttack(sim, b, a);
            if (a.t >= a.total) { b.atk = null; b.nextAtk = GAP[b.phase] * (0.5 + 0.5 * sim.kn.enemyEvery / 0.7) * (b.quick ? 0.5 : 1); }
        } else if (S.alive) {
            b.nextAtk -= dt;
            if (b.nextAtk <= 0) startAttack(sim, b, pick(sim, b));
        }
    } else if (b.state === 'dying') dying(sim, b, dt);
    layout(sim, b);
}

function pick(sim, b) {
    const pool = POOL[b.type][b.phase - 1].filter((n) => n !== b.lastAtk), r = sim.rng.next(pool.length);
    return pool[r];
}

// ---------------------------------------------------------------- movement and layout
function serpentPath(b, t) {
    const sp = 1 + 0.16 * (b.phase - 1);
    return { x: 4.3 * Math.sin(0.72 * sp * t) + 1.1 * Math.sin(1.9 * t + 1), y: -0.45 + 1.5 * Math.sin(0.55 * sp * t + 1) };
}
function fightMove(sim, b) {
    const t = b.t, sp = 1 + 0.12 * (b.phase - 1);
    if (b.type === 'gunship') { b.x = 3.0 * Math.sin(t * 0.55 * sp); b.y = 0.35 + 0.4 * Math.sin(t * 0.9); b.z = b.tz + 1.4 * Math.sin(t * 0.6); }
    else if (b.type === 'guardian') { b.x = 2.4 * Math.sin(t * 0.38 * sp); b.y = 0.3; b.z = b.tz; if (b.atk && (b.atk.name === 'slam' || b.atk.name === 'slam2')) b.z = b.tz - 2.2 * smooth(0, b.atk.tele, b.atk.t) * (1 - smooth(b.atk.tele, b.atk.tele + 0.6, b.atk.t)); }
    else { const p = serpentPath(b, t); b.x = p.x; b.y = p.y; b.z = b.tz; }
}

function headPos(sim, b) {
    const p = serpentPath(b, b.t), hz = b.tz + 3;
    let x = p.x, y = p.y + b.rise * 0 - (1 - b.rise) * 6.4, z = hz;
    const a = b.atk;
    if (b.state === 'fight' && a && a.name === 'lunge') {
        const T = a.tele, t = a.t;
        if (t < T) { const k = smooth(0, T, t); z = hz + 8 * k; y += 0.9 * k; }
        else if (t < T + 0.4) { const k = smooth(T, T + 0.4, t); x = lerp(x, a.lx, k); y = lerp(y + 0.9, a.ly, k); z = lerp(hz + 8, SV.ZS + 2.4, k); }
        else if (t < T + 0.7) { x = a.lx; y = a.ly; z = SV.ZS + 2.4; }
        else { const k = smooth(T + 0.7, T + 1.5, t); x = lerp(a.lx, x, k); y = lerp(a.ly, y, k); z = lerp(SV.ZS + 2.4, hz, k); }
    }
    return { x, y, z };
}

function layout(sim, b) {
    const S = b.solids; S.length = 0;
    if (b.type === 'gunship') {
        for (const p of b.parts) { p.x = b.x + p.dx; p.y = b.y + p.dy; p.z = b.z - (p.main ? 0.2 : 0.6); }
        if (b.state !== 'dying') {
            for (const p of b.parts) if (!p.dead) S.push({ part: p, x: p.x, y: p.y, z: p.z, dz: 0.9, r: p.r });
            S.push({ block: true, x: b.x, y: b.y, z: b.z, dz: 1.4, w: 3.5, h: 1.8 }); S.push({ block: true, x: b.x, y: b.y + 0.3, z: b.z, dz: 1.4, w: 7.3, h: 0.75 });
        }
    } else if (b.type === 'guardian') {
        for (const p of b.parts) { p.x = b.x + p.dx; p.y = b.y + p.dy; p.z = b.z - 1.2; }
        if (b.state !== 'dying') {
            for (const p of b.parts) if (!p.dead) S.push({ part: p, x: p.x, y: p.y, z: p.z, dz: 0.8, r: p.r });
            S.push({ block: true, x: b.x, y: -0.6, z: b.z, dz: 1.8, w: 2.3, h: 2.9 }); S.push({ block: true, x: b.x, y: 1.5, z: b.z, dz: 1.8, w: 6.6, h: 1.4 });
        }
    } else {
        const h = headPos(sim, b), head = b.parts[0]; head.x = h.x; head.y = h.y; head.z = h.z; b.x = h.x; b.y = h.y;
        b.z = h.z;
        if (b.state === 'intro' || b.state === 'fight') {
            // the body trails the head's path BEHIND it (further from the camera), so the gun always has a clear angle to the head
            for (const s of b.segs) {
                const tau = b.t - s.i * 0.3, q = serpentPath(b, tau);
                s.x = q.x * 0.97 + Math.sin(b.t * 1.3 + s.i * 0.9) * 0.5; s.y = Math.max(-SV.GY + 0.5, q.y - s.i * 0.5) - (1 - b.rise) * (6.4 + s.i * 0.2);
                s.z = b.tz + 3 + s.i * 0.75;      // (the body sinks back toward the fissure: it shows below and behind the head, never in front)
                if (b.state === 'fight' || b.rise > 0.5) S.push({ block: true, x: s.x, y: s.y, z: s.z, dz: 1.0, r: s.r });
            }
        } else for (const s of b.segs) { s.z = b.tz + 3 + s.i * 0.75; }
        if (!head.dead && b.state !== 'dying') S.push({ part: head, x: head.x, y: head.y, z: head.z, dz: 1.0, r: head.r });
    }
    S.sort((a, c) => a.z - c.z);
}

/** does a bolt from (x, y) reach this part, or does the body stand in the way? (the bot) */
export function laneClear(b, x, y, part) {
    for (const q of b.solids) {
        if (q.part === part || q.z >= part.z - 0.05) continue;
        const hit = q.w !== undefined ? Math.abs(x - q.x) < q.w && Math.abs(y - q.y) < q.h : Math.hypot(x - q.x, (y - q.y) * 1.1) < q.r + 0.3;
        if (hit) return false;
    }
    return true;
}

// ---------------------------------------------------------------- being shot
export function shotHit(sim, b, s) {
    for (const q of b.solids) {
        if (!(s.pz <= q.z + q.dz + 0.3 && s.z >= q.z - q.dz - 0.3)) continue;
        const hit = q.w !== undefined ? Math.abs(s.x - q.x) < q.w && Math.abs(s.y - q.y) < q.h : Math.hypot(s.x - q.x, (s.y - q.y) * 1.1) < q.r + 0.3;
        if (!hit) continue;
        if (q.part) hitPart(sim, b, q.part, s.dmg || 1);
        else { sim._spark(s.x, s.y, q.z - q.dz); if (b.pingT <= 0) { b.pingT = 0.09; sim._emit('bossHit', { armored: true }); } }
        return true;
    }
    return false;
}

export function hitPart(sim, b, p, dmg) {
    if (p.dead) return false;
    if (!exposed(b, p)) {
        p.hit = Math.max(p.hit, 0.05); sim._spark(p.x, p.y, p.z - p.r * 0.5);
        if (b.pingT <= 0) { b.pingT = 0.09; sim._emit('bossHit', { armored: true }); }
        return false;
    }
    p.hp -= dmg; p.hit = 0.12; b.hit = 0.1; sim.score += 2;
    if (b.pingT <= 0) { b.pingT = 0.07; sim._emit('bossHit', { armored: false }); }
    sim._spark(p.x + (sim.rng.nextDouble() - 0.5), p.y + (sim.rng.nextDouble() - 0.5), p.z - 0.8);
    if (p.hp <= 0) partDown(sim, b, p);
    return true;
}

function partDown(sim, b, p) {
    p.dead = true; p.hp = 0;
    sim._boom(p.x, p.y, p.z - 0.5, p.main ? 2.4 : 1.7);
    sim.hitStop = Math.max(sim.hitStop, p.main ? 0.07 : 0.055); sim.shake = Math.max(sim.shake, p.main ? 1.2 : 0.7); sim.flash = Math.max(sim.flash, p.main ? 0.5 : 0.2);
    const v = (p.main ? 1000 : 300) * sim.mult; sim.score += v; sim._pop('+' + v, p.x, p.y + 0.9, p.z - 1, 2);
    sim.chain += 2; sim.comboT = 2.6; sim._setMult();
    sim._emit('partBreak', { kind: p.kind, main: p.main });
    if (p.main) startDying(sim, b);
}

function startDying(sim, b) {
    b.state = 'dying'; b.deathT = 0; b.boomT = 0; b.atk = null;
    sim.eshots.length = 0; sim.hz.length = 0;
    for (let i = sim.objs.length - 1; i >= 0; i--) if (sim.objs[i].k === 'wave' || sim.objs[i].k === 'mine') sim.objs.splice(i, 1);
    sim.slowDur = b.quick ? 0.8 : 2.0; sim.slowT = sim.slowDur; sim.flash = Math.max(sim.flash, 0.7); sim.shake = Math.max(sim.shake, 1.6); sim.hitStop = Math.max(sim.hitStop, 0.08);
    sim._emit('bossDie', { act: b.act });
}

function dying(sim, b, dt) {
    b.deathT += dt; b.boomT -= dt; const total = b.quick ? 1.0 : 2.5;
    sim.shake = Math.max(sim.shake, 0.8 * (1 - b.deathT / total));
    if (b.boomT <= 0) {
        b.boomT = 0.1 + sim.rng.nextDouble() * 0.06;
        const r = sim.rng, wide = b.type === 'gunship' ? 6 : b.type === 'guardian' ? 5 : 3.5, sz = 0.8 + r.nextDouble() * 1.1;
        const x = b.x + (r.nextDouble() * 2 - 1) * wide, y = b.y + (r.nextDouble() * 2 - 1) * 2, z = (b.type === 'serpent' ? b.tz : b.z) - 1 + r.nextDouble() * 2;
        sim._boom(x, y, z, sz); sim._emit('bossBoom', { size: sz });
        if (r.nextDouble() < 0.25) { sim.hitStop = Math.max(sim.hitStop, 0.04); sim.flash = Math.max(sim.flash, 0.25); }
    }
    if (b.deathT >= total) {
        sim._boom(b.x, b.y, b.z - 1, 3.4); sim._boom(b.x - 2, b.y + 1, b.z, 2.4); sim._boom(b.x + 2, b.y - 1, b.z, 2.4);
        sim.flash = 1; sim.shake = 2; sim.hitStop = 0.09; sim._emit('bossBoom', { size: 3.4 });
        const v = 2000 * b.act * sim.mult; sim.score += v; sim._pop('BOSS DOWN +' + v, 0, 1.2, SV.ZS + 8, 2); sim.bossKills++;
        const i = sim.objs.indexOf(b); if (i >= 0) sim.objs.splice(i, 1);
        sim._bossDefeated();
    }
}

// ---------------------------------------------------------------- attacks
function startAttack(sim, b, name) {
    const S = sim.ship, r = sim.rng, T = TELE[name], a = b.atk = { name, t: 0, tele: T, total: T + AFTER[name], k: 0, n: 0, done: 0 };
    b.lastAtk = name; sim._emit('bossAtk', { name, stage: 'tele' });
    const side = r.nextDouble() < 0.5 ? -1 : 1;
    switch (name) {
        case 'ring': a.safeX = clamp(S.x + side * 3.4, -4.6, 4.6); a.safeY = clamp(S.y + (r.nextDouble() - 0.5) * 1.4, -2.2, 1.6); break;
        case 'beam': { const x = clamp(S.x + side * (0.9 + r.nextDouble() * 1.0), -SV.XMAX, SV.XMAX); a.xs = [x]; sim.hz.push(beam(x, 0.85, T, 0.55)); break; }
        case 'beam2': { const c = clamp(S.x + (r.nextDouble() - 0.5) * 2, -2.4, 2.4); a.xs = [c - 3.1, c + 3.1]; for (const x of a.xs) sim.hz.push(beam(x, 0.85, T, 0.6)); break; }
        case 'sweep': case 'sweep2': {
            const dir = side, y1 = clamp(S.y + (r.nextDouble() - 0.5) * 1.2, -2.1, 1.7); a.dir = dir; a.ys = [y1];
            sim.hz.push(sweep(y1, dir, T, 1.4, 0));
            if (name === 'sweep2') { const y2 = y1 > -0.2 ? clamp(y1 - 2.7, -2.5, 1.7) : clamp(y1 + 2.7, -2.5, 1.9); a.ys.push(y2); sim.hz.push(sweep(y2, -dir, T + 0.95, 1.3, 0)); }
            break; }
        case 'slam': case 'slam2': a.gx = clamp(S.x + (r.nextDouble() - 0.5) * 4.5, -4, 4); a.gx2 = clamp(-a.gx + (r.nextDouble() - 0.5) * 2, -4, 4); break;
        default: break;
    }
}
const beam = (x, w, arm, dur) => ({ kind: 'beam', x, arm, dur, total: dur, t: 0, active: false, x0: x - w, x1: x + w, y0: -9, y1: 9 });
const sweep = (yc, dir, arm, dur, t) => ({ kind: 'sweep', yc, dir, arm, dur, total: dur, t, active: false, from: -dir * 10.5, to: dir * 10.5, w: 1.7, cx: -dir * 10.5, x0: -99, x1: -98, y0: yc - 0.95, y1: yc + 0.95 });

function aimAt(sim, spread = 0, k = 0.6) {
    const S = sim.ship, e = sim.kn.aimError * k;
    return { x: clamp(S.x + S.vx * 0.2 + (sim.rng.nextDouble() * 2 - 1) * e + spread, -7, 7), y: clamp(S.y + S.vy * 0.2 + (sim.rng.nextDouble() * 2 - 1) * e * 0.6, -3.4, 3.2) };
}

function runAttack(sim, b, a) {
    const S = sim.ship, r = sim.rng, name = a.name, T = a.tele;
    switch (name) {
        case 'volley': {
            // a burst: rounds 0.28 s apart, every live turret firing (the core itself when the turrets are gone)
            const rounds = b.phase + 1, shooters = b.parts.filter((p) => p.kind === 'turret' && !p.dead);
            while (a.done < rounds && a.t >= T + a.done * 0.28) {
                const list = shooters.length ? shooters : [b.parts.find((p) => p.main)];
                for (const p of list) {
                    const n = shooters.length ? (b.phase === 1 ? 2 : Math.abs(p.dx) < 3 ? 3 : 2) : 3;
                    for (let q = 0; q < n; q++) { const t = aimAt(sim, (q - (n - 1) / 2) * 1.9); sim.bossShot(p.x, p.y, p.z, t.x, t.y, 23 + 2 * b.phase); }
                }
                a.done++; sim._emit('enemyFire'); if (a.done === 1) sim._emit('bossAtk', { name, stage: 'fire' });
            }
            break; }
        case 'ring': if (!a.fired && a.t >= T) {
            a.fired = true; sim._emit('bossAtk', { name, stage: 'fire' });
            const c = b.parts.find((p) => p.main), n = 14;
            for (let i = 0; i < n; i++) { const th = (i / n) * 6.283; sim.bossShot(c.x, c.y, c.z, a.safeX + Math.cos(th) * 3.5, a.safeY + Math.sin(th) * 2.3, 20); }
        } break;
        case 'mines': if (!a.fired && a.t >= T) {
            a.fired = true; sim._emit('bossAtk', { name, stage: 'fire' });
            const c = b.parts.find((p) => p.main);
            for (let i = 0; i < 3; i++) {
                const tx = clamp(S.x + (i - 1) * 2.6, -5, 5), ty = clamp(S.y + (r.nextDouble() - 0.5), -2.5, 2), tt = (c.z - SV.ZS) / 14;
                sim._add({ k: 'mine', x: c.x + (i - 1) * 1.2, y: c.y, z: c.z - 1, r: 0.95, hp: 1, vx: (tx - c.x - (i - 1) * 1.2) / tt, vy: (ty - c.y) / tt, cs: 14 + (sim.V - SV.SPEED[sim.act] * sim.kn.speed) * 0 });
            }
        } break;
        case 'beam': case 'beam2': if (!a.fired && a.t >= T) { a.fired = true; sim._emit('bossAtk', { name, stage: 'fire' }); sim.shake = Math.max(sim.shake, 0.5); } break;
        case 'spit': if (!a.fired && a.t >= T) {
            a.fired = true; sim._emit('bossAtk', { name, stage: 'fire' });
            const h = b.parts[0], n = b.phase === 1 ? 3 : b.phase === 2 ? 5 : 7;
            for (let i = 0; i < n; i++) { const t = aimAt(sim, (i - (n - 1) / 2) * 2.3); sim.bossShot(h.x, h.y, h.z, t.x, t.y, 20, 0.85, 2, 'glob'); }
        } break;
        case 'sweep': case 'sweep2': if (!a.fired && a.t >= T) { a.fired = true; sim._emit('bossAtk', { name, stage: 'fire' }); sim.shake = Math.max(sim.shake, 0.4); } break;
        case 'lunge':
            if (!a.locked && a.t >= T * 0.4) { a.locked = true; a.lx = clamp(S.x, -5, 5); a.ly = clamp(S.y, -2.6, 2.1); sim.hz.push({ kind: 'lunge', arm: T + 0.15 - a.t, dur: 0.45, total: 0.45, t: 0, active: false, x0: a.lx - 1.9, x1: a.lx + 1.9, y0: a.ly - 1.6, y1: a.ly + 1.6, lx: a.lx, ly: a.ly }); }
            if (!a.fired && a.t >= T) { a.fired = true; sim._emit('bossAtk', { name, stage: 'fire' }); sim.shake = Math.max(sim.shake, 0.7); }
            break;
        case 'erupt': if (!a.fired && a.t >= T) {
            a.fired = true; sim._emit('bossAtk', { name, stage: 'fire' });
            for (let i = 0; i < 3; i++) sim._lava((i - 1) * 3.3 + (r.nextDouble() - 0.5) * 1.4, 52 + i * 11);
        } break;
        case 'shards': case 'shards2': {
            const fans = name === 'shards2' ? 3 : 1, n = b.phase === 1 ? 5 : 7;
            while (a.done < fans && a.t >= T + a.done * 0.6) {
                const d = a.done, from = [-4.6, 4.6];
                for (let i = 0; i < n; i++) {
                    const t = aimAt(sim, (i - (n - 1) / 2) * 2.5 + (d ? 1.1 : 0)), fx = from[(i + d) % 2];
                    sim.bossShot(b.x + fx, b.y + 1.9, b.z - 1.5, t.x, t.y, 21, 0.95, 3, 'shard');
                }
                a.done++; sim._emit('bossAtk', { name, stage: 'fire' });
            }
            break; }
        case 'slam': case 'slam2':
            if (!a.fired && a.t >= T) { a.fired = true; wave(sim, b, a.gx, 1.9); sim.shake = Math.max(sim.shake, 0.8); sim._emit('bossAtk', { name, stage: 'fire' }); }
            if (name === 'slam2' && !a.fired2 && a.t >= T + 0.9) { a.fired2 = true; wave(sim, b, a.gx2, 2.7); sim.shake = Math.max(sim.shake, 0.8); sim._emit('bossAtk', { name, stage: 'fire' }); }
            break;
    }
}

function wave(sim, b, gx, hgt) {
    sim._add({ k: 'wave', x: 0, y: -SV.GY, z: b.z - 1.5, top: -SV.GY + hgt, hgt, gx, gw: 1.35, cs: 26, dz: 0.8 });
}
