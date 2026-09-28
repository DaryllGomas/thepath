// THE NODE · world 1 · WARLORD'S ROAD · THE WORLD: one stage of the road and everyone on it (the rules).
//
// A belt: x runs along the road, y is DEPTH (the feet's screen row, LANE_TOP..LANE_BOT), z is height
// above the ground. Actors are drawn sorted by y. The camera scrolls right with the hero and LOCKS at
// each wave until it is beaten (GO!), the last wave is the stage's boss.
//
// THE HERO   A combo (3 cuts, the third knocks down) · B jump (A in the air = the jump cut) · tap the stick
//            twice = run (A = the dash strike, B = the long jump) · walk into a foe = grab (A = throw him
//            over your head, into his friends) · A+B together = MAGIC: every pot at once, a storm that hits
//            everyone on screen, harder the more pots · walk into a riderless lizard = ride it (A = its
//            tail whip); any hit knocks you off.
// FOES       raiders (club), axemen, soldiers (sword + shield: a frontal blow may clang off), skeletons
//            (they climb out of the ground), riders on beaked lizards (hit the rider, the beast is yours),
//            thieves (blue carry magic pots, green carry meat: hit them and it spills), and the bosses:
//            THE HEADSMAN, THE TWIN GIANTS, THE WARLORD (who calls up skeletons as he weakens).
// Knockdowns: a foe flies back, bounces, lies, gets up (untouchable while down). Hitstop on every blow.
// Deterministic: SystemRandom(seed) for every die, plain doubles, fixed sub-steps. The renderer only reads.
import { SystemRandom, SoundCue } from '../../sdk/index.js';
import { Stages } from './stages.js';

export const K = Object.freeze({ Hero: 0, Raider: 1, Axeman: 2, Soldier: 3, Skeleton: 4, Thief: 5, Lizard: 6, Headsman: 7, Giant: 8, Warlord: 9 });
export const S = Object.freeze({
    Idle: 0, Walk: 1, Attack: 2, Hurt: 3, Air: 4, Down: 5, GetUp: 6, Dead: 7, Grabbed: 8, Jump: 9, Run: 10,
    Grab: 11, Throw: 12, Magic: 13, Enter: 14, Flee: 15, Rise: 16, Drop: 17,
});
export const Fx = Object.freeze({ Spark: 0, Big: 1, Dust: 2, Clang: 3, Shock: 4, Pop: 5, Land: 6 });

export const LANE_TOP = 140, LANE_BOT = 198, VIEW_W = 304;
const GRAV = 820;
const WALK_X = 72, WALK_Y = 42, RUN_X = 142, JUMP_VZ = 262;

// attacks: wind/act/rec seconds, damage, reach x0..x1 in front (px), depth tolerance dy, knock = knockdown
export const ATK = Object.freeze({
    a1: { wind: 0.07, act: 0.09, rec: 0.15, dmg: 3, x0: 2, x1: 44, dy: 10, knock: 0, push: 40 },
    a2: { wind: 0.06, act: 0.09, rec: 0.16, dmg: 3, x0: 2, x1: 44, dy: 10, knock: 0, push: 40 },
    a3: { wind: 0.15, act: 0.10, rec: 0.30, dmg: 5, x0: 2, x1: 48, dy: 11, knock: 1, push: 85, launch: 150, shake: 1 },
    jatk: { wind: 0, act: 9, rec: 0, dmg: 4, x0: -4, x1: 40, dy: 10, knock: 1, push: 80, launch: 140 },
    dash: { wind: 0.05, act: 0.30, rec: 0.26, dmg: 4, x0: -2, x1: 35, dy: 10, knock: 1, push: 95, launch: 150, move: 165, shake: 1 },
    whip: { wind: 0.22, act: 0.14, rec: 0.30, dmg: 5, x0: -8, x1: 70, dy: 13, knock: 1, push: 90, launch: 170, shake: 1 },
    club: { wind: 0.44, act: 0.10, rec: 0.45, dmg: 2, x0: 2, x1: 40, dy: 8, knock: 0, push: 50 },
    axe: { wind: 0.54, act: 0.12, rec: 0.50, dmg: 3, x0: 2, x1: 46, dy: 9, knock: 1, push: 110, launch: 130 },
    thrust: { wind: 0.38, act: 0.10, rec: 0.42, dmg: 3, x0: 4, x1: 48, dy: 8, knock: 0, push: 60 },
    bone: { wind: 0.30, act: 0.09, rec: 0.38, dmg: 2, x0: 2, x1: 35, dy: 8, knock: 0, push: 40 },
    lwhip: { wind: 0.42, act: 0.14, rec: 0.50, dmg: 3, x0: -8, x1: 66, dy: 12, knock: 1, push: 130, launch: 150 },
    chop: { wind: 0.62, act: 0.12, rec: 0.60, dmg: 5, x0: 4, x1: 59, dy: 11, knock: 1, push: 140, launch: 160, shake: 2 },
    charge: { wind: 0.50, act: 0.75, rec: 0.55, dmg: 3, x0: -6, x1: 30, dy: 11, knock: 1, push: 150, launch: 150, move: 170 },
    smash: { wind: 0.72, act: 0.12, rec: 0.62, dmg: 5, x0: 6, x1: 66, dy: 12, knock: 1, push: 150, launch: 170, shake: 2 },
    pound: { wind: 0.62, act: 0.16, rec: 0.70, dmg: 3, x0: -110, x1: 110, dy: 22, zmax: 8, knock: 1, push: 90, launch: 120, shake: 3, wave: 1 },
    slash: { wind: 0.40, act: 0.10, rec: 0.22, dmg: 3, x0: 4, x1: 68, dy: 11, knock: 0, push: 60, next: 'slash2' },
    slash2: { wind: 0.20, act: 0.10, rec: 0.55, dmg: 4, x0: 4, x1: 68, dy: 11, knock: 1, push: 140, launch: 160, shake: 1 },
    lunge: { wind: 0.48, act: 0.50, rec: 0.55, dmg: 4, x0: -4, x1: 40, dy: 11, knock: 1, push: 160, launch: 160, move: 210, shake: 1 },
});

// foes: health, walk speed (x, y), attacks, score, hurt half-width
export const KD = Object.freeze({
    [K.Raider]: { hp: 12, sx: 46, sy: 30, atk: ['club'], score: 100, hw: 9, range: 27, mounts: true },
    [K.Axeman]: { hp: 15, sx: 40, sy: 26, atk: ['axe'], score: 150, hw: 10, range: 31, mounts: true },
    [K.Soldier]: { hp: 15, sx: 42, sy: 28, atk: ['thrust'], score: 200, hw: 9, range: 33, block: 0.22 },
    [K.Skeleton]: { hp: 9, sx: 58, sy: 36, atk: ['bone'], score: 120, hw: 8, range: 24 },
    [K.Thief]: { hp: 99, sx: 80, sy: 20, atk: [], score: 50, hw: 7, range: 0 },
    [K.Lizard]: { hp: 99, sx: 62, sy: 36, atk: [], score: 0, hw: 16, range: 0 },
    [K.Headsman]: { hp: 54, sx: 44, sy: 28, atk: ['chop', 'charge'], score: 3000, hw: 12, range: 37, boss: true },
    [K.Giant]: { hp: 44, sx: 34, sy: 22, atk: ['smash', 'pound'], score: 2500, hw: 14, range: 42, boss: true },
    [K.Warlord]: { hp: 54, sx: 52, sy: 32, atk: ['slash', 'lunge'], score: 6000, hw: 13, range: 44, boss: true },
});

const SPAWN = {
    raider: [K.Raider, 'raider'], raider2: [K.Raider, 'raider2'], axeman: [K.Axeman, 'axeman'], soldier: [K.Soldier, 'soldier'],
    soldier2: [K.Soldier, 'soldier2'], skeleton: [K.Skeleton, 'skeleton'], headsman: [K.Headsman, 'headsman'],
    giant: [K.Giant, 'giant'], giantB: [K.Giant, 'giantB'], warlord: [K.Warlord, 'warlord'],
};

// magic: damage by pots spent (1..9)
export const SPELL_DMG = Object.freeze([0, 10, 16, 22, 28, 34, 40, 46, 52, 58]);
export const MAX_POTS = 9;

function actor(id, kind, costume) {
    return {
        id, kind, costume, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, face: 1,
        hp: 1, maxHp: 1, st: S.Idle, t: 0,
        atk: null, atkName: '', ph: 0, atkT: 0, serial: 0, hitSerial: -1, hitAny: false,
        inv: 0, flash: 0, stop: 0, cool: 0, think: 0, hes: 0, hesMax: 0.2, role: 0, gx: 0, gy: 0,
        mount: null, rider: null, claim: 0, freeT: 0, walk: 0, bounces: 0, boss: false, drops: 0, thief: 0,
        hold: null, grabT: 0, dead: false, deadT: 0, onScreen: false, wave: -1, summoned: 0,
        combo: 0, comboQ: false, lastAtkEnd: -9, stag: 0, lastHitT: -9, air: 0, jumpAtk: false, pre: 0,
    };
}

export class World {
    constructor(seed, knobs, credit, cues) {
        this.rng = new SystemRandom(seed === 0 ? 1 : seed);
        this.cues = cues;
        this.credit = credit;
        this.unlosable = !!(credit && credit.unlosable);
        this.enemyDamage = knobs.get('enemyDamage');
        this.attackGap = knobs.get('attackGap');
        this.enemyHp = knobs.get('enemyHp');
        this.bossHp = knobs.get('bossHp');
        this.heroPower = knobs.get('heroPower');
        this.maxAttackers = Math.max(1, Math.trunc(knobs.get('attackers') + 0.001));
        this.heroMaxHp = Math.max(3, Math.trunc(knobs.get('heroHp') + 0.001));
        this.lives = Math.max(1, Math.trunc(knobs.get('lives') + 0.001));
        this.pots = Math.max(0, Math.min(MAX_POTS, Math.trunc(knobs.get('startPots') + 0.001)));
        this.score = 0;
        this.time = 0;
        this._nextId = 1;
        this.hero = actor(0, K.Hero, 'hero');
        this.hero.hp = this.hero.maxHp = this.heroMaxHp;
        this.actors = [];
        this.items = [];
        this.fx = [];
        for (let i = 0; i < 24; i++) this.fx.push({ kind: 0, x: 0, y: 0, z: 0, t0: -99, a: 0 });
        this._fxN = 0;
        this.shakeT = -9; this.shakeAmp = 0;
        this.spell = null;
        // tallies
        this.kills = 0; this.deaths = 0; this.casts = 0; this.potsGot = 0; this.meats = 0; this.rides = 0; this.throws = 0;
        this.hitsLanded = 0; this.hitsTaken = 0; this.blocks = 0;
        this.log = '';
        this.outcome = 0;             // 0 = playing, 1 = lost (no lives), 2 = stage clear
        this._tapDir = 0; this._tapT = -9; this._stickX = 0;
    }

    // ------------------------------------------------------------------ stage
    loadStage(i) {
        this.stageIdx = i;
        this.stage = Stages[i];
        this.cam = 0; this.locked = false; this.waveIdx = 0; this.waveT = 0; this.goT = -9;
        this.waveFoes = []; this.groupIdx = 0; this.thiefT = -1;
        this.actors.length = 0; this.items.length = 0;
        this.spell = null; this.outcome = 0; this.clearT = -1; this.stageDone = false;
        this.bossName = ''; this.bossT = -9; this.boss = null;
        this.stageStart = this.time;
        const h = this.hero;
        h.x = 56; h.y = 172; h.z = 0; h.vx = h.vy = h.vz = 0; h.face = 1;
        h.st = S.Idle; h.t = 0; h.atk = null; h.mount = null; h.hold = null; h.inv = 1.0; h.stop = 0;
        h.combo = 0; h.comboQ = false; h.stag = 0;
        if (h.hp <= 0) h.hp = h.maxHp;
    }

    get heroDown() { const s = this.hero.st; return s === S.Down || s === S.GetUp || s === S.Dead || s === S.Air || s === S.Drop; }

    // ------------------------------------------------------------------ time
    // pad = { x, y (+1 = up), aP, bP (pressed this step), aH, bH (held) }
    step(dt, pad) {
        const n = Math.max(1, Math.ceil(dt * 60 - 1e-6));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            this._step(h, pad);
            if (i === 0 && pad) pad = { x: pad.x, y: pad.y, aP: false, bP: false, aH: pad.aH, bH: pad.bH };
            if (this.outcome !== 0) break;
        }
    }

    _step(h, pad) {
        this.time += h;
        this._h = h;
        const hero = this.hero;
        if (this.spell) {
            this._stepSpell(h);
            this._stepHero(h, pad);
            return;
        }
        this._stepHero(h, pad);
        for (let i = 0; i < this.actors.length; i++) this._stepActor(this.actors[i], h);
        this._separate(h);
        this._stepItems(h);
        this._camera(h);
        this._waves(h);
        // compact
        let w = 0;
        for (let i = 0; i < this.actors.length; i++) { const a = this.actors[i]; if (!a.dead) this.actors[w++] = a; }
        this.actors.length = w;
        if (this.clearT < 0 && this.outcome === 0 && this.stageDone) { this.clearT = this.time; }
        if (this.clearT >= 0 && this.time - this.clearT > 2.6 && hero.st !== S.Air) this.outcome = 2;
    }

    // ------------------------------------------------------------------ the hero
    _stepHero(h, pad) {
        const e = this.hero;
        if (e.inv > 0) e.inv -= h;
        if (e.flash > 0) e.flash -= h;
        if (e.stop > 0) { e.stop -= h; return; }
        e.t += h;
        const px = pad ? pad.x : 0, py = pad ? pad.y : 0;
        const aP = !!(pad && pad.aP), bP = !!(pad && pad.bP);
        const sx = px > 0.5 ? 1 : px < -0.5 ? -1 : 0, sy = py > 0.5 ? -1 : py < -0.5 ? 1 : 0;   // sy: screen (down +)
        // double tap -> run
        let tapRun = false;
        if (sx !== 0 && this._stickX !== sx) {
            if (this._tapDir === sx && this.time - this._tapT < 0.3) tapRun = true;
            this._tapDir = sx; this._tapT = this.time;
        }
        this._stickX = sx;
        // STAGE CLEAR: the hero steps down and raises his blade; the stick is let go
        if (this.clearT >= 0 && (e.st === S.Idle || e.st === S.Walk || e.st === S.Run)) {
            if (e.mount) { const m = e.mount; e.mount = null; m.rider = null; m.st = S.Idle; m.t = 0; m.freeT = 0; e.x += e.x - this.cam < 80 ? 30 : -30; }
            e.st = S.Idle; e.vx = e.vy = 0; e.victory = true;
            return;
        }
        e.victory = false;
        const mounted = !!e.mount;
        const wx = mounted ? 58 : WALK_X, wy = mounted ? 36 : WALK_Y;

        switch (e.st) {
            case S.Idle: case S.Walk: {
                if (e.hold) { e.hold.st = S.Hurt; e.hold.t = 0; e.hold = null; }
                if (aP && bP) { if (this._tryMagic()) break; }
                if (aP) { this._heroAttack(mounted ? 'whip' : (this.time - e.lastAtkEnd < 0.45 ? ['a1', 'a2', 'a3'][e.combo] : 'a1')); break; }
                if (bP) { e.st = S.Jump; e.t = 0; e.pre = 0.08; e.jumpAtk = false; e.vz = 0; e.air = 0; e.vx = sx * wx * 1.05; break; }
                if (tapRun && !mounted) { e.st = S.Run; e.t = 0; e.face = sx; break; }
                e.vx = sx * wx; e.vy = sy * wy;
                if (sx !== 0) e.face = sx;
                e.st = sx !== 0 || sy !== 0 ? S.Walk : S.Idle;
                this._moveHero(h);
                if (e.st === S.Walk) e.walk += h * (Math.abs(e.vx) + Math.abs(e.vy) * 0.8) / 16;
                if (!mounted) { this._tryGrab(h, sx); if (e.st === S.Idle || e.st === S.Walk) this._tryMount(); }
                break;
            }
            case S.Run: {
                if (aP && bP) { if (this._tryMagic()) break; }
                if (aP) { this._heroAttack('dash'); break; }
                if (bP) { e.st = S.Jump; e.t = 0; e.pre = 0.03; e.jumpAtk = false; e.vx = e.face * RUN_X * 0.9; break; }
                if (sx !== e.face) { e.st = S.Idle; e.t = 0; e.vx = 0; break; }
                e.vx = e.face * RUN_X; e.vy = sy * wy;
                this._moveHero(h);
                e.walk += h * RUN_X / 14;
                this._tryMount();
                break;
            }
            case S.Attack: this._stepHeroAttack(h, aP, bP); break;
            case S.Jump: {
                if (e.pre > 0) {
                    if (aP && this._tryMagic()) break;
                    e.pre -= h;
                    if (e.pre <= 0) { e.vz = mounted ? JUMP_VZ * 0.8 : JUMP_VZ; e.air = 0; }
                    break;
                }
                if (aP && !e.jumpAtk) { e.jumpAtk = true; e.serial++; e.atk = ATK.jatk; e.atkName = 'jatk'; e.hitAny = false; }
                e.air += h;
                e.vz -= GRAV * h; e.z += e.vz * h;
                this._moveHero(h, true);
                if (e.jumpAtk) this._heroHits(ATK.jatk);
                if (e.z <= 0) {
                    e.z = 0; e.vz = 0; e.vx = 0;
                    if (e.jumpAtk && !e.hitAny) this._cue(SoundCue.Miss);
                    e.jumpAtk = false; e.atk = null;
                    e.st = S.Hurt; e.t = 0; e.hurtFor = 0.08;             // a short landing
                    this._fx(Fx.Land, e.x, e.y, 0, 0);
                }
                break;
            }
            case S.Hurt:
                e.vx *= Math.max(0, 1 - 8 * h);
                this._moveHero(h);
                if (e.t >= (e.hurtFor || 0.34)) { e.st = S.Idle; e.t = 0; }
                break;
            case S.Air: this._stepAir(e, h); break;
            case S.Down:
                if (e.hp <= 0) { e.st = S.Dead; e.t = 0; break; }
                if (e.t >= 0.8) { e.st = S.GetUp; e.t = 0; }
                break;
            case S.GetUp:
                if (e.t >= 0.36) { e.st = S.Idle; e.t = 0; e.inv = 0.9; }
                break;
            case S.Dead:
                if (e.t >= 1.5) {
                    if (this.lives > 1) this._respawn();
                    else if (this.outcome === 0) this.outcome = 1;
                }
                break;
            case S.Drop:
                e.vz -= GRAV * 0.6 * h; e.z += e.vz * h;
                if (e.z <= 0) { e.z = 0; e.vz = 0; e.st = S.Idle; e.t = 0; this._fx(Fx.Land, e.x, e.y, 0, 1); this._shake(2); this._burst(); }
                break;
            case S.Grab: {
                const f = e.hold;
                if (!f || f.dead || f.st !== S.Grabbed) { e.hold = null; e.st = S.Idle; e.t = 0; break; }
                f.x = e.x + e.face * 16; f.y = e.y + 0.5; f.face = -e.face;
                if (aP) { e.st = S.Throw; e.t = 0; this.throws++; break; }
                if (e.t >= 0.95) { f.st = S.Hurt; f.t = 0; f.vx = e.face * 60; e.hold = null; e.st = S.Idle; e.t = 0; }
                break;
            }
            case S.Throw: {
                const f = e.hold;
                if (f && !f.dead && f.st === S.Grabbed) {
                    const q = Math.min(1, e.t / 0.22);
                    f.x = e.x + e.face * (15 - 26 * q); f.z = 34 * Math.sin(q * Math.PI * 0.9); f.y = e.y + 0.5;
                    if (e.t >= 0.22) {
                        f.st = S.Air; f.t = 0; f.vx = -e.face * 150; f.vz = 150; f.bounces = 0; f.thrown = true; f.thrownBy = e.id;
                        f.face = e.face; e.hold = null;
                        this._cue(SoundCue.Hit);
                    }
                }
                if (e.t >= 0.5) { e.st = S.Idle; e.t = 0; e.hold = null; }
                break;
            }
            case S.Magic:
                if (e.t >= 1.95) { e.st = S.Idle; e.t = 0; }
                break;
        }
        if (e.mount) { const m = e.mount; m.x = e.x; m.y = e.y; m.z = e.z; m.face = e.face; }
    }

    _moveHero(h, air = false) {
        const e = this.hero;
        e.x += e.vx * h; e.y += (air ? 0 : e.vy) * h;
        const lo = this.cam + 16, hi = this.cam + VIEW_W - 16;
        if (e.x < lo) e.x = lo;
        if (e.x > hi) e.x = hi;
        if (e.x > this.stage.len - 16) e.x = this.stage.len - 16;
        if (e.y < LANE_TOP) e.y = LANE_TOP;
        if (e.y > LANE_BOT) e.y = LANE_BOT;
    }

    _heroAttack(name) {
        const e = this.hero;
        e.st = S.Attack; e.t = 0; e.atk = ATK[name]; e.atkName = name; e.ph = 0; e.atkT = 0; e.serial++; e.hitAny = false; e.comboQ = false;
        e.vx = 0; e.vy = 0;
        if (name === 'a1') e.combo = 0;
    }

    _stepHeroAttack(h, aP, bP) {
        const e = this.hero, a = e.atk;
        e.atkT += h;
        if (e.ph === 0) {
            if (bP && e.atkName === 'a1' && e.atkT < 0.09 && this._tryMagic()) return;
            if (e.atkT >= a.wind) { e.ph = 1; e.atkT = 0; }
        } else if (e.ph === 1) {
            if (a.move) { e.vx = e.face * a.move * (1 - e.atkT / a.act * 0.5); this._moveHero(h); }
            this._heroHits(a);
            if (aP) e.comboQ = true;
            if (e.atkT >= a.act) { e.ph = 2; e.atkT = 0; if (!e.hitAny) this._cue(SoundCue.Miss); }
        } else {
            if (aP) e.comboQ = true;
            if (e.comboQ && e.atkT >= 0.04 && (e.atkName === 'a1' || e.atkName === 'a2')) {
                e.combo = e.atkName === 'a1' ? 1 : 2;
                this._heroAttack(e.atkName === 'a1' ? 'a2' : 'a3');
                return;
            }
            if (e.atkT >= a.rec) {
                e.lastAtkEnd = this.time;
                e.combo = e.atkName === 'a1' ? 1 : e.atkName === 'a2' ? 2 : 0;
                e.st = S.Idle; e.t = 0; e.atk = null;
            }
        }
    }

    // the hero's blow lands on every foe inside its reach (once per swing)
    _heroHits(a) {
        const e = this.hero;
        for (let i = 0; i < this.actors.length; i++) {
            const f = this.actors[i];
            if (f.kind === K.Lizard || f.hitSerial === e.serial) continue;
            if (!this._vulnerable(f)) continue;
            if (Math.abs(f.y - e.y) > a.dy) continue;
            if (e.z <= 0 && f.z > 30) continue;
            if (e.z > 0 && (f.z > 44 || e.z > 60)) continue;
            const hw = f.mount ? 18 : KD[f.kind].hw;
            const rel = (f.x - e.x) * e.face;
            if (rel < a.x0 - hw || rel > a.x1 + hw) continue;
            f.hitSerial = e.serial;
            this._strike(e, f, a);
        }
    }

    _strike(e, f, a) {
        // the soldier's shield: a frontal blow may clang off
        const kd = KD[f.kind];
        if (kd.block && (f.st === S.Idle || f.st === S.Walk) && f.face === -e.face && this.rng.nextDouble() < kd.block) {
            this.blocks++;
            this._fx(Fx.Clang, (e.x + f.x) / 2, f.y, 30, e.face);
            this._cue(SoundCue.Miss);
            e.stop = 0.08; f.stop = 0.08; f.cool = Math.min(f.cool, 0.15); f.face = -e.face;
            e.hitAny = true;
            return;
        }
        e.hitAny = true;
        this.hitsLanded++;
        if (f.kind === K.Thief) { this._hitThief(f, e); return; }
        const dmg = Math.max(1, Math.round(a.dmg * this.heroPower));
        f.hp -= dmg;
        this.score += dmg * 10;
        f.flash = 0.1;
        const heavy = !!a.knock;
        e.stop = heavy ? 0.075 : 0.05; f.stop = e.stop;
        this._fx(heavy ? Fx.Big : Fx.Spark, f.x - e.face * 4, f.y, f.z + (f.boss ? 40 : 30), e.face);
        if (a.shake) this._shake(a.shake);
        this._cue(SoundCue.Hit);
        // knocked off a mount
        if (f.mount) { this._dismount(f, e.face); if (f.hp <= 0) this._kill(f); return; }
        if (f.st === S.Grabbed) return;
        if (f.hp <= 0) { this._launch(f, e.face, 150, 190); this._kill(f); return; }
        if (heavy && (!f.boss || this.rng.nextDouble() < 0.45)) this._launch(f, e.face, a.push || 85, a.launch || 150);
        else if (f.boss && (f.st === S.Attack && f.ph >= 1)) { /* a boss mid-blow shrugs off a light cut */ }
        else { f.st = S.Hurt; f.t = 0; f.hurtFor = f.boss ? (heavy ? 0.3 : 0.2) : 0.32; f.vx = e.face * (a.push || 40); f.atk = null; f.cool = Math.max(f.cool, 0.25); }
    }

    _kill(f) {
        if (f.counted) return;
        f.counted = true;
        this.kills++;
        this.score += KD[f.kind].score;
        if (f.boss) { this._shake(3); this._cue(SoundCue.Bonus); }
    }

    _launch(f, dir, push, vz) {
        if (f.hold) { f.hold.st = S.Hurt; f.hold.t = 0; f.hold = null; }
        f.st = S.Air; f.t = 0; f.vx = dir * push; f.vz = vz; f.bounces = 0; f.atk = null; f.z = Math.max(f.z, 0.5);
        f.face = -dir;
    }

    _vulnerable(f) {
        if (f.inv > 0 || f.dead) return false;
        const s = f.st;
        return !(s === S.Down || s === S.GetUp || s === S.Dead || s === S.Air || s === S.Rise || s === S.Grabbed || s === S.Drop);
    }

    _tryGrab(h, sx) {
        const e = this.hero;
        if (sx === 0) { e.grabIntent = 0; return; }
        for (const f of this.actors) {
            if (f.kind === K.Lizard || f.kind === K.Thief || f.boss || f.mount || f.z > 0) continue;
            if (!(f.st === S.Idle || f.st === S.Walk || f.st === S.Hurt || (f.st === S.Attack && f.ph === 0))) continue;
            const rel = (f.x - e.x) * sx;
            if (rel > 4 && rel < 19 && Math.abs(f.y - e.y) < 6) {
                e.grabIntent = (e.grabIntent || 0) + h;
                if (e.grabIntent >= 0.12) {
                    e.grabIntent = 0; e.face = sx;
                    e.st = S.Grab; e.t = 0; e.hold = f; e.vx = e.vy = 0;
                    f.st = S.Grabbed; f.t = 0; f.atk = null; f.face = -sx;
                }
                return;
            }
        }
        e.grabIntent = 0;
    }

    _tryMount() {
        const e = this.hero;
        if (e.z > 0 || e.mount || e.hold) return;
        for (const m of this.actors) {
            if (m.kind !== K.Lizard || m.rider || m.st === S.Flee || m.dead) continue;
            if (Math.abs(m.x - e.x) < 16 && Math.abs(m.y - e.y) < 7) {
                e.mount = m; m.rider = e; m.claim = 0; e.x = m.x; e.y = m.y; e.st = S.Idle; e.t = 0; e.vx = e.vy = 0;
                this.rides++;
                this._cue(SoundCue.Bonus);
                return;
            }
        }
    }

    _dismount(r, dir) {
        const m = r.mount;
        if (!m) return;
        r.mount = null; m.rider = null; m.st = S.Idle; m.t = 0; m.freeT = 0; m.atk = null; m.vx = 0; m.vy = 0; m.z = 0;
        m.x = r.x; m.y = r.y;
        this._launch(r, dir, 90, 170);
        r.z = 22;
    }

    _tryMagic() {
        const e = this.hero;
        if (this.pots <= 0 || this.spell) return false;
        const level = this.pots;
        this.pots = 0;
        this.casts++;
        e.st = S.Magic; e.t = 0; e.atk = null; e.vx = e.vy = 0; e.z = 0; e.pre = 0;
        if (e.hold) { e.hold.st = S.Hurt; e.hold.t = 0; e.hold = null; }
        this.spell = { t: 0, level, done: false, x: e.x };
        this._cue(SoundCue.Bonus);
        this.log += 'M' + level + ' ';
        return true;
    }

    _stepSpell(h) {
        const sp = this.spell;
        sp.t += h;
        if (!sp.done && sp.t >= 1.05) {
            sp.done = true;
            const dmg = Math.round(SPELL_DMG[Math.min(MAX_POTS, sp.level)] * this.heroPower);
            this._shake(3);
            for (const f of this.actors) {
                if (f.kind === K.Lizard || f.kind === K.Thief || f.dead || f.hp <= 0) continue;
                if (f.x < this.cam - 8 || f.x > this.cam + VIEW_W + 8) continue;
                if (f.st === S.Grabbed || f.st === S.Rise) { f.st = S.Idle; }
                f.hp -= dmg; f.flash = 0.2;
                this.score += dmg * 10;
                if (f.mount) { this._dismount(f, f.x < this.hero.x ? -1 : 1); }
                else this._launch(f, f.x < this.hero.x ? -1 : 1, 70, 180);
                if (f.hp <= 0) this._kill(f);
            }
            this._cue(SoundCue.Hit);
        }
        if (sp.t >= 1.9) this.spell = null;
    }

    _respawn() {
        const e = this.hero;
        this.lives--;
        e.hp = e.maxHp; e.st = S.Drop; e.t = 0; e.z = 110; e.vz = 0; e.inv = 2.4; e.stag = 0;
        e.y = Math.max(LANE_TOP + 8, Math.min(LANE_BOT - 8, e.y));
    }

    // the landing of a respawn knocks everyone near back (no damage)
    _burst() {
        const e = this.hero;
        for (const f of this.actors) {
            if (f.kind === K.Lizard || f.kind === K.Thief || !this._vulnerable(f)) continue;
            if (Math.abs(f.x - e.x) < 90 && Math.abs(f.y - e.y) < 30) {
                if (f.mount) this._dismount(f, f.x < e.x ? -1 : 1);
                else this._launch(f, f.x < e.x ? -1 : 1, 90, 140);
            }
        }
    }

    // a foe's blow reaches the hero
    _hurtHero(f, a) {
        const e = this.hero;
        if (e.inv > 0 || this.heroDown || e.st === S.Magic || e.st === S.Throw) return false;
        if (e.z > (a.zmax !== undefined ? a.zmax : 26)) return false;
        const dmg = this.enemyDamage <= 0 ? 0 : Math.max(0.5, a.dmg * this.enemyDamage);
        e.hp -= dmg;
        this.hitsTaken++;
        e.flash = 0.1;
        const dir = f.x < e.x ? 1 : -1;
        this._fx(a.knock ? Fx.Big : Fx.Spark, e.x - dir * 4, e.y, e.z + 30, dir);
        this._cue(SoundCue.Hit);
        if (a.shake) this._shake(a.shake);
        f.stop = 0.06; e.stop = 0.06;
        if (this.time - e.lastHitT < 1.3) e.stag++; else e.stag = 1;
        e.lastHitT = this.time;
        if (e.hold) { e.hold.st = S.Hurt; e.hold.t = 0; e.hold = null; }
        e.atk = null; e.jumpAtk = false;
        if (e.mount) {
            const m = e.mount;
            e.mount = null; m.rider = null; m.st = S.Idle; m.t = 0; m.freeT = 0; m.z = 0;
            this._launch(e, dir, 80, 170); e.z = 22;
        } else if (e.hp < 0.25) this._launch(e, dir, 110, 200);
        else if (a.knock || e.stag >= 3) this._launch(e, dir, a.push || 110, a.launch || 150);
        else { e.st = S.Hurt; e.t = 0; e.hurtFor = 0.34; e.vx = dir * (a.push || 50); }
        if (e.hp < 0.25) {
            e.hp = 0; this.deaths++;
            this._cue(SoundCue.Die);
            this.log += 'D' + Math.round(this.time - this.stageStart) + ' ';
        }
        return true;
    }

    // ------------------------------------------------------------------ foes
    _stepActor(f, h) {
        if (f.inv > 0) f.inv -= h;
        if (f.flash > 0) f.flash -= h;
        if (f.stop > 0) { f.stop -= h; return; }
        f.t += h;
        if (f.cool > 0) f.cool -= h;
        const x0 = f.x;
        if (f.kind === K.Lizard) { this._stepLizard(f, h); return; }
        if (f.kind === K.Thief) { this._stepThief(f, h); return; }
        switch (f.st) {
            case S.Enter: {
                const tx = f.enterX;
                f.vx = Math.sign(tx - f.x) * (f.mount ? KD[K.Lizard].sx : KD[f.kind].sx);
                f.face = f.vx >= 0 ? 1 : -1;
                f.x += f.vx * h;
                f.walk += h * Math.abs(f.vx) / 16;
                if ((f.vx >= 0 && f.x >= tx) || (f.vx < 0 && f.x <= tx)) { f.st = S.Idle; f.t = 0; f.think = 0; f.cool = 0.4 + this.rng.nextDouble() * 0.6; }
                break;
            }
            case S.Rise:
                if (f.t >= 0.9) { f.st = S.Idle; f.t = 0; f.cool = 0.5; }
                break;
            case S.Idle: case S.Walk: this._ai(f, h); break;
            case S.Attack: this._stepFoeAttack(f, h); break;
            case S.Hurt:
                f.vx *= Math.max(0, 1 - 8 * h);
                f.x += f.vx * h;
                if (f.t >= (f.hurtFor || 0.32)) { f.st = S.Idle; f.t = 0; }
                break;
            case S.Air: this._stepAir(f, h); break;
            case S.Down:
                if (f.hp <= 0) { f.st = S.Dead; f.t = 0; break; }
                if (f.t >= (f.boss ? 0.8 : 0.62)) { f.st = S.GetUp; f.t = 0; }
                break;
            case S.GetUp:
                if (f.t >= 0.3) { f.st = S.Idle; f.t = 0; f.inv = f.boss ? 0.6 : 0.25; f.think = 0; }
                break;
            case S.Dead:
                if (f.t >= 1.6 && !f.boss) f.dead = true;          // a boss stays down where he fell
                break;
            case S.Grabbed:
                if (this.hero.hold !== f) { f.st = S.Hurt; f.t = 0; }
                break;
        }
        if (f.mount) { const m = f.mount; m.x = f.x; m.y = f.y; m.z = f.z; m.face = f.face; m.st = f.st === S.Attack ? S.Attack : (Math.abs(f.x - x0) > 0.01 || f.st === S.Walk ? S.Walk : S.Idle); m.walk = f.walk; m.ph = f.ph; }
        // keep the belt
        if (f.y < LANE_TOP) f.y = LANE_TOP;
        if (f.y > LANE_BOT) f.y = LANE_BOT;
        if (f.st !== S.Enter && f.st !== S.Flee) {
            const lo = this.cam - 50, hi = this.cam + VIEW_W + 50;
            if (f.x < lo) f.x = lo;
            if (f.x > hi) f.x = hi;
        }
        const vis = f.x > this.cam + 4 && f.x < this.cam + VIEW_W - 4;
        if (vis) f.onScreen = true;
    }

    _stepAir(f, h) {
        f.vz -= GRAV * h;
        f.z += f.vz * h;
        f.x += f.vx * h;
        if (f.thrown) {
            // a thrown body bowls over whoever it meets
            for (const g of this.actors) {
                if (g === f || g.kind === K.Lizard || g.kind === K.Thief || !this._vulnerable(g)) continue;
                if (Math.abs(g.x - f.x) < 20 && Math.abs(g.y - f.y) < 10 && f.z < 40) {
                    g.hp -= 2; this.score += 20; g.flash = 0.1;
                    this._fx(Fx.Big, g.x, g.y, 30, f.vx > 0 ? 1 : -1);
                    this._cue(SoundCue.Hit);
                    if (g.mount) this._dismount(g, f.vx > 0 ? 1 : -1);
                    else this._launch(g, f.vx > 0 ? 1 : -1, 110, 150);
                    if (g.hp <= 0) this._kill(g);
                }
            }
        }
        if (f === this.hero) this._clampHeroX();
        else {
            // while the camera is locked the screen edges are walls: a flying body stops at them
            const m = this.locked ? 12 : -40;
            if (f.x < this.cam + m) { f.x = this.cam + m; f.vx = Math.abs(f.vx) * 0.3; }
            else if (f.x > this.cam + VIEW_W - m) { f.x = this.cam + VIEW_W - m; f.vx = -Math.abs(f.vx) * 0.3; }
        }
        if (f.z <= 0) {
            f.z = 0;
            if (f.bounces === 0 && f.vz < -120) {
                f.bounces = 1; f.vz = 90; f.vx *= 0.45;
                this._fx(Fx.Dust, f.x, f.y, 0, 0);
                if (f.thrown) {
                    f.thrown = false; const dmg = Math.round(5 * this.heroPower); f.hp -= dmg; this.score += dmg * 10;
                    this._shake(2); this._cue(SoundCue.Hit);
                    if (f.hp <= 0) this._kill(f);
                }
            } else {
                f.vx = 0; f.vz = 0; f.st = S.Down; f.t = 0; f.thrown = false;
                this._fx(Fx.Dust, f.x, f.y, 0, 1);
            }
        }
    }

    _clampHeroX() {
        const e = this.hero;
        const lo = this.cam + 16, hi = this.cam + VIEW_W - 16;
        if (e.x < lo) e.x = lo;
        if (e.x > hi) e.x = hi;
    }

    _heroOpen() {
        const e = this.hero;
        return !this.heroDown && e.inv < 1.2 && e.st !== S.Magic && e.hp > 0;
    }

    _ai(f, h) {
        const e = this.hero, kd = KD[f.kind];
        f.think -= h;
        if (f.think <= 0) { f.think = 0.22 + this.rng.nextDouble() * 0.3; this._plan(f); }
        const open = this._heroOpen();
        // strike?
        if (f.role === 1 && open && f.cool <= 0) {
            const name = this._pickAttack(f);
            if (name) {
                f.hes += h;
                if (f.hes >= f.hesMax) {
                    f.hes = 0; f.hesMax = 0.06 + this.rng.nextDouble() * 0.3;
                    f.face = e.x >= f.x ? 1 : -1;
                    f.st = S.Attack; f.t = 0; f.atk = ATK[name]; f.atkName = name; f.ph = 0; f.atkT = 0; f.hitAny = false; f.vx = f.vy = 0;
                    return;
                }
            } else f.hes = 0;
        }
        // walk to the goal
        const sx = f.mount ? KD[K.Lizard].sx : kd.sx, sy = f.mount ? KD[K.Lizard].sy : kd.sy;
        const dx = f.gx - f.x, dy = f.gy - f.y;
        f.vx = Math.abs(dx) > 3 ? Math.sign(dx) * sx : 0;
        f.vy = Math.abs(dy) > 2 ? Math.sign(dy) * sy : 0;
        f.x += f.vx * h; f.y += f.vy * h;
        f.st = f.vx !== 0 || f.vy !== 0 ? S.Walk : S.Idle;
        if (f.st === S.Walk) f.walk += h * (Math.abs(f.vx) + Math.abs(f.vy)) / 16;
        if (f.role === 3 && f.claimed) {
            f.face = f.vx > 0 ? 1 : f.vx < 0 ? -1 : f.face;
            const m = f.claimed;
            if (m.dead || m.rider || m.st === S.Flee) { f.claimed = null; f.role = 0; }
            else if (Math.abs(m.x - f.x) < 10 && Math.abs(m.y - f.y) < 6) {
                f.mount = m; m.rider = f; m.claim = 0; f.claimed = null; f.role = 0; f.x = m.x; f.y = m.y;
            }
        } else if (Math.abs(e.x - f.x) > 3) f.face = e.x > f.x ? 1 : -1;
    }

    _pickAttack(f) {
        const e = this.hero;
        const dx = e.x - f.x, adx = Math.abs(dx), ady = Math.abs(e.y - f.y);
        if (f.mount) { const a = ATK.lwhip; return ady <= a.dy * 0.75 && adx >= 6 && adx <= a.x1 - 6 ? 'lwhip' : null; }
        const list = KD[f.kind].atk;
        if (f.kind === K.Headsman && ady < 8 && adx > 80 && adx < 200 && this.rng.nextDouble() < 1.2 * this._h) return 'charge';
        if (f.kind === K.Warlord && ady < 8 && adx > 76 && adx < 200 && this.rng.nextDouble() < 1.5 * this._h) return 'lunge';
        if (f.kind === K.Giant && ady < 18 && adx < 96 && this.rng.nextDouble() < 0.7 * this._h) return 'pound';
        const a = ATK[list[0]];
        if (ady <= a.dy * 0.75 && adx >= a.x0 + 2 && adx <= a.x1 - 4) return list[0];
        return null;
    }

    _plan(f) {
        const e = this.hero, kd = KD[f.kind];
        let side = f.x < e.x ? -1 : 1;
        if (!this._heroOpen()) {
            f.role = f.role === 3 ? 3 : 0;
            if (f.role !== 3) { f.gx = e.x + side * (64 + this.rng.nextDouble() * 34); f.gy = LANE_TOP + this.rng.nextDouble() * (LANE_BOT - LANE_TOP); }
            this._keepOnScreen(f);
            return;
        }
        if (f.role === 3 && f.claimed) { f.gx = f.claimed.x; f.gy = f.claimed.y; return; }
        // a riderless lizard nearby: go and take it
        if (kd.mounts && !f.mount) {
            for (const m of this.actors) {
                if (m.kind !== K.Lizard || m.rider || m.claim || m.st === S.Flee || m.dead) continue;
                if (Math.abs(m.x - f.x) < 150 && this.rng.nextDouble() < 0.3) {
                    f.role = 3; f.claimed = m; m.claim = f.id; f.gx = m.x; f.gy = m.y;
                    return;
                }
            }
        }
        let engaged = 0, onLeft = 0, onRight = 0;
        for (const g of this.actors) {
            if (g === f || g.role !== 1 || g.kind === K.Lizard || g.kind === K.Thief) continue;
            engaged++;
            if (g.x < e.x) onLeft++; else onRight++;
        }
        if (f.role !== 1 && engaged < this.maxAttackers && this.rng.nextDouble() < 0.75) f.role = 1;
        else if (f.role === 1 && engaged >= this.maxAttackers && !f.boss) f.role = 2;
        if (f.boss) f.role = 1;
        if (f.role === 1) {
            // flank: take the empty side sometimes
            if (side < 0 && onLeft > 0 && onRight === 0 && this.rng.nextDouble() < 0.4) side = 1;
            else if (side > 0 && onRight > 0 && onLeft === 0 && this.rng.nextDouble() < 0.4) side = -1;
            const range = f.mount ? 34 : kd.range;
            f.gx = e.x + side * range; f.gy = e.y + (this.rng.nextDouble() - 0.5) * 4;
        } else {
            f.role = 2;
            f.gx = e.x + side * (70 + this.rng.nextDouble() * 40);
            f.gy = Math.max(LANE_TOP, Math.min(LANE_BOT, e.y + (this.rng.nextDouble() - 0.5) * 60));
        }
        this._keepOnScreen(f);
    }

    _keepOnScreen(f) {
        const lo = this.cam + 20, hi = this.cam + VIEW_W - 20;
        if (f.gx < lo) f.gx = lo + this.rng.nextDouble() * 20;
        if (f.gx > hi) f.gx = hi - this.rng.nextDouble() * 20;
        if (f.gy < LANE_TOP) f.gy = LANE_TOP;
        if (f.gy > LANE_BOT) f.gy = LANE_BOT;
    }

    _stepFoeAttack(f, h) {
        const a = f.atk;
        f.atkT += h;
        if (f.ph === 0) {
            if (f.atkT >= a.wind) { f.ph = 1; f.atkT = 0; f.hitAny = false; if (a.wave) { this._fx(Fx.Shock, f.x + f.face * 30, f.y, 0, f.face); this._shake(a.shake || 2); } }
        } else if (f.ph === 1) {
            if (a.move) {
                f.x += f.face * a.move * h;
                f.walk += h * a.move / 16;
                if (f.x < this.cam + 10 || f.x > this.cam + VIEW_W - 10) { f.x = Math.max(this.cam + 10, Math.min(this.cam + VIEW_W - 10, f.x)); f.atkT = a.act; }
            }
            if (!f.hitAny) {
                const e = this.hero;
                const hw = e.mount ? 16 : 8;
                const rel = (e.x - f.x) * f.face;
                const inX = a.wave ? Math.abs(e.x - f.x) <= a.x1 : rel >= a.x0 - hw && rel <= a.x1 + hw;
                if (inX && Math.abs(e.y - f.y) <= a.dy && this._hurtHero(f, a)) f.hitAny = true;
            }
            if (f.atkT >= a.act) { f.ph = 2; f.atkT = 0; }
        } else if (f.atkT >= a.rec) {
            if (a.next && f.hitAny === false && this.rng.nextDouble() < 0.5) { f.st = S.Idle; f.t = 0; }
            if (a.next && f.st === S.Attack) { f.atk = ATK[a.next]; f.atkName = a.next; f.ph = 0; f.atkT = 0; f.hitAny = false; return; }
            f.st = S.Idle; f.t = 0; f.atk = null;
            f.cool = this.attackGap * (f.boss ? 0.8 : 1) * (0.7 + this.rng.nextDouble() * 0.6);
            f.think = 0;
        }
    }

    // ------------------------------------------------------------------ the thief
    _stepThief(f, h) {
        switch (f.st) {
            case S.Walk: case S.Flee: case S.Enter: {
                const sp = f.st === S.Flee ? 130 : KD[K.Thief].sx;
                f.x += f.face * sp * h;
                f.walk += h * sp / 13;
                if (f.onScreen && (f.x < this.cam - 30 || f.x > this.cam + VIEW_W + 30)) f.dead = true;
                if (f.x > this.cam + 4 && f.x < this.cam + VIEW_W - 4) f.onScreen = true;
                if (f.t > 12) f.dead = true;
                break;
            }
            case S.Hurt:
                f.x += f.vx * h; f.vx *= Math.max(0, 1 - 6 * h);
                if (f.t >= 0.42) { f.st = f.drops >= 2 ? S.Flee : S.Walk; f.t = 0; }
                break;
        }
    }

    _hitThief(f, e) {
        this._cue(SoundCue.Hit);
        this._fx(Fx.Spark, f.x, f.y, 18, e.face);
        f.flash = 0.1; e.stop = 0.04;
        if (f.drops < 2) {
            f.drops++;
            this.items.push({ kind: f.thief, x: f.x, y: f.y, z: 16, vx: e.face * 30 + (this.rng.nextDouble() - 0.5) * 30, vz: 150, age: 0 });
            this.score += KD[K.Thief].score;
        }
        f.st = S.Hurt; f.t = 0; f.vx = e.face * 60;
        f.face = e.face;
    }

    _stepItems(h) {
        const e = this.hero;
        let w = 0;
        for (let i = 0; i < this.items.length; i++) {
            const it = this.items[i];
            it.age += h;
            if (it.z > 0 || it.vz > 0) {
                it.vz -= GRAV * h; it.z += it.vz * h; it.x += it.vx * h;
                if (it.z <= 0) { it.z = 0; it.vz = it.vz < -90 ? -it.vz * 0.3 : 0; it.vx *= 0.5; }
            }
            if (it.x < this.cam + 18 && this.locked) it.x = this.cam + 18;
            if (it.x > this.cam + VIEW_W - 18) it.x = this.cam + VIEW_W - 18;
            if (it.y < LANE_TOP) it.y = LANE_TOP;
            if (it.y > LANE_BOT) it.y = LANE_BOT;
            let keep = true;
            if (it.age > 0.35 && it.z < 8 && e.z < 20 && !this.heroDown && Math.abs(it.x - e.x) < 14 && Math.abs(it.y - e.y) < 9) {
                keep = false;
                if (it.kind === 0) { this.pots = Math.min(MAX_POTS, this.pots + 1); this.potsGot++; }
                else { e.hp = Math.min(e.maxHp, e.hp + 8); this.meats++; }
                this.score += 200;
                this._cue(SoundCue.Bonus);
                this._fx(Fx.Pop, it.x, it.y, 10, it.kind);
            }
            if (it.x < this.cam - 20) keep = false;
            if (keep) this.items[w++] = it;
        }
        this.items.length = w;
    }

    // ------------------------------------------------------------------ the lizard
    _stepLizard(m, h) {
        if (m.rider) return;                             // the rider moves it
        m.freeT += h;
        switch (m.st) {
            case S.Flee:
                m.x += m.face * 110 * h; m.walk += h * 110 / 16;
                if (m.x < this.cam - 60 || m.x > this.cam + VIEW_W + 60) m.dead = true;
                break;
            default: {
                if (m.freeT > 12 && !m.claim) { m.st = S.Flee; m.face = m.x < this.cam + VIEW_W / 2 ? -1 : 1; break; }
                // amble about
                if (m.t > 2.2) { m.t = 0; m.gx = m.x + (this.rng.nextDouble() - 0.5) * 50; m.gy = Math.max(LANE_TOP, Math.min(LANE_BOT, m.y + (this.rng.nextDouble() - 0.5) * 30)); }
                const lo = this.cam + 24, hi = this.cam + VIEW_W - 24;
                if (m.gx < lo) m.gx = lo;
                if (m.gx > hi) m.gx = hi;
                const dx = (m.gx || m.x) - m.x, dy = (m.gy || m.y) - m.y;
                m.vx = Math.abs(dx) > 3 ? Math.sign(dx) * 26 : 0; m.vy = Math.abs(dy) > 2 ? Math.sign(dy) * 16 : 0;
                m.x += m.vx * h; m.y += m.vy * h;
                if (m.vx !== 0) m.face = Math.sign(m.vx);
                m.st = m.vx !== 0 || m.vy !== 0 ? S.Walk : S.Idle;
                if (m.st === S.Walk) m.walk += h * 26 / 16;
                if (m.y < LANE_TOP) m.y = LANE_TOP;
                if (m.y > LANE_BOT) m.y = LANE_BOT;
            }
        }
    }

    // ------------------------------------------------------------------ crowding
    _separate(h) {
        const A = this.actors;
        for (let i = 0; i < A.length; i++) {
            const a = A[i];
            if (a.kind === K.Thief || a.st === S.Air || a.st === S.Dead || a.st === S.Grabbed || a.rider) continue;
            for (let j = i + 1; j < A.length; j++) {
                const b = A[j];
                if (b.kind === K.Thief || b.st === S.Air || b.st === S.Dead || b.st === S.Grabbed || b.rider) continue;
                const dx = b.x - a.x, dy = b.y - a.y;
                if (Math.abs(dx) < 16 && Math.abs(dy) < 6) {
                    const s = dy >= 0 ? 1 : -1;
                    a.y -= s * 24 * h; b.y += s * 24 * h;
                    const t = dx >= 0 ? 1 : -1;
                    a.x -= t * 10 * h; b.x += t * 10 * h;
                }
            }
        }
    }

    // ------------------------------------------------------------------ the camera and the waves
    _camera(h) {
        if (this.locked) return;
        const st = this.stage;
        const nextAt = this.waveIdx < st.waves.length ? st.waves[this.waveIdx].at : st.len - VIEW_W;
        const target = Math.min(this.hero.x - 140, nextAt, st.len - VIEW_W);
        if (target > this.cam) this.cam += Math.min(target - this.cam, 150 * h);
        if (this.waveIdx < st.waves.length && this.cam >= st.waves[this.waveIdx].at - 0.01) this._startWave();
    }

    _startWave() {
        const w = this.stage.waves[this.waveIdx];
        this.cam = w.at;
        this.locked = true; this.waveT = this.time; this.groupIdx = 0; this.waveFoes = [];
        this.thiefT = w.thief ? this.time + 2.2 : -1;
        if (w.boss) { this.bossName = w.boss; this.bossT = this.time; this.log += 'B' + Math.round(this.time - this.stageStart) + ' '; }
        this._spawnGroup(w.groups[0]);
        this.groupIdx = 1;
    }

    _spawnGroup(g) {
        let k = 0;
        for (const [what, side] of g.foes) { this._spawn(what, side, k); k++; }
    }

    _spawn(what, side, k) {
        const cam = this.cam, e = this.hero;
        const y = LANE_TOP + 6 + this.rng.nextDouble() * (LANE_BOT - LANE_TOP - 12);
        if (what === 'rider') {
            const f = this._newFoe(K.Raider, this.rng.nextDouble() < 0.5 ? 'raider' : 'raider2');
            const m = actor(this._nextId++, K.Lizard, 'lizard');
            m.hp = m.maxHp = 99;
            f.mount = m; m.rider = f;
            this._place(f, side === 'L' ? 'L' : 'R', y, k);
            m.x = f.x; m.y = f.y; m.face = f.face;
            this.actors.push(m, f);
            return f;
        }
        const [kind, cz] = SPAWN[what];
        const f = this._newFoe(kind, cz);
        if (side === 'rise') {
            f.st = S.Rise; f.t = 0;
            let x = cam + 40 + this.rng.nextDouble() * (VIEW_W - 80);
            if (Math.abs(x - e.x) < 50) x = e.x + (x < e.x ? -60 : 60);
            f.x = Math.max(cam + 30, Math.min(cam + VIEW_W - 30, x)); f.y = y; f.face = f.x < e.x ? 1 : -1;
        } else this._place(f, side, y, k);
        this.actors.push(f);
        return f;
    }

    _newFoe(kind, costume) {
        const f = actor(this._nextId++, kind, costume);
        const kd = KD[kind];
        f.boss = !!kd.boss;
        const hp = Math.max(1, Math.round(kd.hp * (f.boss ? this.bossHp : this.enemyHp)));
        f.hp = f.maxHp = hp;
        f.wave = this.waveIdx;
        f.cool = 0.6 + this.rng.nextDouble() * 0.8;
        f.hesMax = 0.1 + this.rng.nextDouble() * 0.3;
        this.waveFoes.push(f);
        if (f.boss && !this.boss) this.boss = f;
        return f;
    }

    _place(f, side, y, k) {
        const cam = this.cam;
        f.st = S.Enter; f.t = 0; f.y = y;
        if (side === 'L') { f.x = cam - 30 - k * 26; f.enterX = cam + 30 + k * 12; f.face = 1; }
        else { f.x = cam + VIEW_W + 30 + k * 26; f.enterX = cam + VIEW_W - 36 - k * 12; f.face = -1; }
    }

    _waves(h) {
        if (!this.locked) return;
        const w = this.stage.waves[this.waveIdx];
        let standing = 0;
        for (const f of this.waveFoes) if (f.hp > 0 && !f.dead) standing++;
        if (this.groupIdx < w.groups.length && standing <= w.groups[this.groupIdx].when) {
            this._spawnGroup(w.groups[this.groupIdx]); this.groupIdx++;
            return;
        }
        if (this.thiefT > 0 && this.time >= this.thiefT) {
            this.thiefT = -1;
            const f = actor(this._nextId++, K.Thief, w.thief === 'green' ? 'thiefGreen' : 'thiefBlue');
            f.thief = w.thief === 'green' ? 1 : 0; f.hp = f.maxHp = 99;
            const fromLeft = this.hero.x > this.cam + VIEW_W / 2;
            f.x = fromLeft ? this.cam - 20 : this.cam + VIEW_W + 20; f.face = fromLeft ? 1 : -1;
            f.y = LANE_TOP + 8 + this.rng.nextDouble() * (LANE_BOT - LANE_TOP - 16);
            f.st = S.Walk; f.t = 0;
            this.actors.push(f);
        }
        // the warlord calls the dead as he weakens
        const b = this.boss;
        if (b && b.kind === K.Warlord && b.hp > 0) {
            const q = b.hp / b.maxHp;
            if ((q < 0.66 && b.summoned === 0) || (q < 0.33 && b.summoned === 1)) {
                b.summoned++;
                this._spawn('skeleton', 'rise', 0);
            }
        }
        if (standing === 0 && this.groupIdx >= w.groups.length) {
            this.locked = false;
            if (w.boss) { this.stageDone = true; this.log += 'S' + (this.stageIdx + 1) + '@' + Math.round(this.time - this.stageStart) + 's '; }
            this.waveIdx++;
            this.goT = this.time;
            if (!w.boss) this._cue(SoundCue.Tick);
            // a lizard left standing wanders off once the road moves on
            for (const m of this.actors) if (m.kind === K.Lizard && !m.rider) m.freeT = Math.max(m.freeT, 9);
        }
    }

    // ------------------------------------------------------------------ fx
    _fx(kind, x, y, z, a) {
        const f = this.fx[this._fxN];
        this._fxN = (this._fxN + 1) % this.fx.length;
        f.kind = kind; f.x = x; f.y = y; f.z = z; f.a = a; f.t0 = this.time;
    }

    _shake(amp) { if (amp >= this.shakeAmp || this.time - this.shakeT > 0.2) { this.shakeAmp = amp; this.shakeT = this.time; } }

    _cue(c) { if (this.cues) this.cues.emit(c); }
}
