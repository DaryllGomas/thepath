// THE NODE · world 1 · WARLORD'S ROAD · THE PICTURE.
//
//   view y 8..203: sky (static) · far range x0.12 · hills x0.4 · the back row + road x1.0 · flames ·
//                  shadows · pickups · everyone, sorted by depth · sparks and dust · the near posts x1.3
//   HUD y 204..231: magic pots, the hero's name and health blocks, lives, stage, score
//   plates: the stage's GO arrow, the boss's name, STAGE CLEAR, the storm of a spell, the result card
//   the MAP card (Intro) and the CAMP by night (Interlude) are whole screens of their own
// Everything is blitted straight into the surface's pixels through a palette LUT (fast enough to run at
// 60 fps beside a 3D scene); every colour is a palette entry. Nothing strobes: blinks are 1-2 Hz, a hit
// flash is one short white frame, the respawn ghost is a still 50 % dither, the dead dissolve in a
// fixed Bayer pattern. The renderer only reads the sim.
import { PixelFont, SurfaceDraw, d6 } from '../../sdk/index.js';
import { WarlordsPalette, C } from './palette.js';
import { CLEAR } from './raster.js';
import { BAYER } from './paint.js';
import { sprite, saddleOffset } from './rig.js';
import { stageArt, VIEW_X, VIEW_Y, VIEW_W, VIEW_H } from './backdrops.js';
import { PotSprite, MeatSprite, HeadIcon, NightMap, campSky, oldMap, MapStops, MapRoute } from './art.js';
import { K, S, Fx, SPELL_DMG } from './world.js';
import { WarlordsRound } from './round.js';
import { Stages } from './stages.js';

const Phase = WarlordsRound.Phase;
const VY1 = VIEW_Y + VIEW_H;          // 204: the HUD starts here
const pal = WarlordsPalette;

function makeLut(map) {
    const lut = new Uint32Array(256);
    for (let i = 0; i < pal.count; i++) lut[i] = pal.at(map ? map[i] : i).packed;
    return lut;
}
const LUT = makeLut(null);
const LUT_NIGHT = makeLut(NightMap);
// a hit brightens a body one step up its ramp (a flash, not a white-out)
const BRIGHT = { skinDk: 'skinLo', skinLo: 'skin', skin: 'skinHi', skinHi: 'white', hairLo: 'hair', hair: 'hairHi', hairHi: 'cream', steelDk: 'steelLo', steelLo: 'steel', steel: 'steelHi', steelHi: 'white',
    leatherLo: 'leather', leather: 'leatherHi', leatherHi: 'furHi', furLo: 'fur', fur: 'furHi', furHi: 'white', blueDk: 'blueLo', blueLo: 'blue', blue: 'blueHi', blueHi: 'white',
    greenDk: 'greenLo', greenLo: 'green', green: 'greenHi', greenHi: 'white', purpleDk: 'purpleLo', purpleLo: 'purple', purple: 'purpleHi', purpleHi: 'white',
    redDk: 'redLo', redLo: 'red', red: 'redHi', redHi: 'white', boneLo: 'bone', bone: 'boneHi', boneHi: 'white', stoneDk: 'stoneLo', stoneLo: 'stone', stone: 'stoneHi', stoneHi: 'white',
    goldLo: 'gold', gold: 'hud', hud: 'white', dirtDk: 'dirtLo', dirtLo: 'dirt', dirt: 'dirtHi', dirtHi: 'cream', cream: 'white' };
const LUT_FLASH = (() => { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i; for (let i = 0; i < pal.count; i++) { const b = BRIGHT[pal.nameOf(i)]; if (b) m[i] = C[b]; } return makeLut(m); })();
const LUT_STORM = (() => {             // the spell darkens the world to a bruised blue
    const m = new Uint8Array(NightMap);
    return makeLut(m);
})();
const LUT_BOSSHIT = (() => { const m = new Uint8Array(256); for (let i = 0; i < 256; i++) m[i] = i === C.ink ? C.ink : C.redHi; return makeLut(m); })();

const LIZ_COSTUME = 'lizard';

// what each stage will ask the rig for: painted during the map card and the camp so play never waits
const WARM_COSTUMES = [
    ['hero', 'raider', 'raider2', 'axeman', 'thiefBlue', 'thiefGreen', 'headsman'],
    ['skeleton', 'soldier', 'giant', 'giantB'],
    ['soldier2', 'warlord'],
];
const WARM_POSES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'w', 's', 'hurt', 'fly', 'down', 'getup', 'ride', 'rideA'];
const HERO_POSES = ['a1w', 'a1s', 'a2w', 'a2s', 'a3w', 'a3s', 'jump', 'jatk', 'run0', 'run1', 'dash', 'grab', 'throw0', 'throw1', 'magic', 'sit', 'kick'];
const LIZ_POSES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'whipW', 'whipS', 'run0', 'run1', 'jump'];

export class WarlordsRenderer {
    constructor() {
        this._u32 = null; this._surf = null;
        this._list = [];
        this.c = {};
        for (let i = 0; i < pal.count; i++) this.c[pal.nameOf(i)] = pal.at(i);
    }

    // paint a little of the next stage each frame (the map card and the camp hold still, so no one sees it)
    _warm(stage) {
        if (!this._warmQ) this._warmQ = new Map();
        let q = this._warmQ.get(stage);
        if (!q) {
            q = [];
            q.push(() => stageArt(stage));
            for (const c of WARM_COSTUMES[stage] || []) for (const p of WARM_POSES) q.push(() => sprite(c, p));
            for (const c of (WARM_COSTUMES[stage] || []).includes('warlord') ? ['warlord'] : []) for (const p of ['w2', 's2']) q.push(() => sprite(c, p));
            if (stage === 0) { for (const p of HERO_POSES) q.push(() => sprite('hero', p)); for (const p of LIZ_POSES) q.push(() => sprite('lizard', p)); q.push(() => sprite('lizardBare', 'idle0')); }
            if (stage === 1) q.push(() => sprite('giant', 'pound'), () => sprite('giantB', 'pound'));
            this._warmQ.set(stage, q);
        }
        const t0 = Date.now();
        while (q.length > 0 && Date.now() - t0 < 6) q.shift()();
    }

    _pix(s) {
        if (this._surf !== s) { this._surf = s; this._u32 = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height); }
        return this._u32;
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.c.bg);
        if (!r || !r.world) return;
        this._pix(s);
        const P = r.p;
        if (P === Phase.Map) { this._drawMap(s, r, t); this._warm(r.stage); return; }
        if (P === Phase.Camp) { this._drawCamp(s, r, t); this._drawHud(s, r, t); this._warm(r.stage + 1); return; }
        this._drawStage(s, r, t);
        this._drawHud(s, r, t);
        this._drawPlates(s, r, t);
        s.noClip();
    }

    // ------------------------------------------------------------------ low-level blits (clip = the view)
    _blitLayer(L, scroll, lut, dx, dy, y0 = VIEW_Y, y1 = VY1) {
        const u = this._u32, cv = L.cv, sw = cv.w, d = cv.d;
        const sx0 = Math.round(scroll) - dx;
        for (let j = 0; j < cv.h; j++) {
            const y = L.y + j + dy;
            if (y < y0 || y >= y1) continue;
            const row = j * sw, o = y * 320;
            for (let x = VIEW_X; x < VIEW_X + VIEW_W; x++) {
                const sx = sx0 + x - VIEW_X;
                if (sx < 0 || sx >= sw) continue;
                const v = d[row + sx];
                if (v !== CLEAR) u[o + x] = lut[v];
            }
        }
    }

    // a sprite with its origin at (x, y); flip = face left; mode: 0 normal, 1 ghost (50 % dither), 2 dissolve (q 0..1)
    _blit(sp, x, y, flip, lut, mode = 0, q = 0, clipY = VY1) {
        const u = this._u32, w = sp.w, d = sp.data;
        const ox = flip ? x - (w - 1 - sp.ax) : x - sp.ax, oy = y - sp.ay;
        const yEnd = Math.min(clipY, VY1);
        const lvl = Math.round(q * 16);
        for (let j = 0; j < sp.h; j++) {
            const yy = oy + j;
            if (yy < VIEW_Y || yy >= yEnd) continue;
            const row = j * w, o = yy * 320;
            for (let i = 0; i < w; i++) {
                const xx = ox + i;
                if (xx < VIEW_X || xx >= VIEW_X + VIEW_W) continue;
                const v = d[row + (flip ? w - 1 - i : i)];
                if (v === CLEAR) continue;
                if (mode === 1 && ((xx + yy) & 1)) continue;
                if (mode === 2 && BAYER[(yy & 3) * 4 + (xx & 3)] < lvl) continue;
                u[o + xx] = lut[v];
            }
        }
    }

    _px(x, y, c) { if (x >= VIEW_X && x < VIEW_X + VIEW_W && y >= VIEW_Y && y < VY1) this._u32[y * 320 + x] = c.packed; }
    _rect(x, y, w, h, c) {
        const x0 = Math.max(VIEW_X, x), x1 = Math.min(VIEW_X + VIEW_W, x + w), y0 = Math.max(VIEW_Y, y), y1 = Math.min(VY1, y + h);
        for (let j = y0; j < y1; j++) this._u32.fill(c.packed, j * 320 + x0, j * 320 + Math.max(x0, x1));
    }
    _line(x0, y0, x1, y1, c) {
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let q = 0; q <= n; q++) this._px(Math.round(x0 + (x1 - x0) * q / n), Math.round(y0 + (y1 - y0) * q / n), c);
    }
    // a dithered ellipse (the arcade's only transparency): shadows, glows
    _shadow(cx, cy, rx, ry, c, phase = 0) {
        for (let j = -ry; j <= ry; j++) {
            const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry + 0.01))));
            for (let i = -hw; i <= hw; i++) if (((cx + i + cy + j + phase) & 1) === 0) this._px(cx + i, cy + j, c);
        }
    }

    // ------------------------------------------------------------------ the stage
    _drawStage(s, r, t) {
        const w = r.world, art = stageArt(w.stageIdx);
        // the camera, with the shake
        let dx = 0, dy = 0;
        const since = w.time - w.shakeT;
        if (since < 0.25 && w.shakeAmp > 0) {
            const a = Math.max(1, Math.round(w.shakeAmp * (1 - since / 0.25)));
            const f = Math.floor(w.time * 30) & 3;
            dx = f === 0 ? a : f === 2 ? -a : 0; dy = f === 1 ? a : f === 3 ? -Math.max(1, a >> 1) : 0;
        }
        const cam = Math.round(w.cam);
        const storm = w.spell != null;
        const lut = storm ? LUT_STORM : LUT;
        this._blitLayer(art.sky, 0, lut, 0, 0);
        if (storm) this._stormSky(w, t);
        this._blitLayer(art.far, cam * art.far.f, lut, dx >> 1, 0);
        this._blitLayer(art.mid, cam * art.mid.f, lut, dx, dy);
        this._blitLayer(art.near, cam, lut, dx, dy);
        // flames in the windows, the roofs, the torches
        for (const [fx, fy, kind] of art.fires) {
            const sx = fx - cam + VIEW_X + dx;
            if (sx < -20 || sx > 340) continue;
            this._flame(sx, fy + dy, kind, t, fx);
        }
        // shadows
        const ox = VIEW_X - cam + dx, oy = dy;
        const all = this._list; all.length = 0;
        all.push(w.hero);
        for (const a of w.actors) if (!(a.kind === K.Lizard && a.rider)) all.push(a);
        for (const a of all) {
            if (a.st === S.Rise && a.t < 0.3) continue;
            const big = a.kind === K.Lizard || a.mount ? 18 : a.boss ? 16 : a.kind === K.Thief ? 7 : 11;
            const k = Math.max(0.4, 1 - a.z / 90);
            this._shadow(Math.round(a.x) + ox, Math.round(a.y) + oy + 1, Math.round(big * k), Math.max(2, Math.round(3 * k)), this.c.ink);
        }
        for (const it of w.items) this._shadow(Math.round(it.x) + ox, Math.round(it.y) + oy + 1, 5, 1, this.c.ink);
        // pickups, everyone by depth, then the sparks
        for (const it of w.items) {
            const bob = it.z > 0 ? 0 : Math.round(Math.sin((w.time + it.x) * 5) * 1) - 1;
            this._blit(it.kind === 0 ? PotSprite : MeatSprite, Math.round(it.x) + ox, Math.round(it.y - it.z) + oy + bob, false, LUT);
        }
        all.sort((a, b) => a.y - b.y || a.id - b.id);
        for (const a of all) this._drawActor(w, a, ox, oy, t);
        this._drawFx(w, ox, oy, t);
        this._blitLayer(art.fore, cam * art.fore.f, lut, Math.round(dx * 1.3), dy);
        if (storm) this._drawSpell(w, ox, oy, t);
    }

    _flame(x, y, kind, t, salt) {
        const big = kind === 2 ? 1.6 : kind === 3 ? 0.8 : 1;
        const f = Math.floor(t * 9 + salt * 0.37) % 4;
        const h = Math.round((9 + (f & 1) * 2 + (f === 2 ? 2 : 0)) * big), w = Math.round(3 * big + 1);
        if (kind === 3) this._shadow(x, y - 4, 7, 5, this.c.fireLo, 1);
        for (let j = 0; j < h; j++) {
            const q = j / h;
            const hw = Math.round(w * Math.pow(1 - q, 0.8) * (1 + 0.25 * Math.sin((j + f * 3) * 0.9)));
            const sway = Math.round(Math.sin(j * 0.5 + f * 1.7 + salt) * q * 2);
            for (let i = -hw; i <= hw; i++) {
                const e = Math.abs(i) / (hw + 0.5);
                const c = q < 0.35 && e < 0.45 ? this.c.fireHi : e < 0.7 && q < 0.7 ? this.c.fire : this.c.fireLo;
                this._px(x + i + sway, y - j, c);
            }
        }
        if (f === 1) this._px(x + Math.round(Math.sin(salt) * 3), y - h - 2, this.c.fire);
    }

    // ------------------------------------------------------------------ actors
    _drawActor(w, a, ox, oy, t) {
        const x = Math.round(a.x) + ox, y = Math.round(a.y - a.z) + oy;
        const flip = a.face < 0;
        let lut = a.flash > 0 ? (a.boss ? LUT_BOSSHIT : LUT_FLASH) : LUT;
        if (w.spell && a !== w.hero && a.kind !== K.Lizard) lut = LUT_STORM;
        let mode = 0, q = 0;
        if (a.st === S.Dead && a.t > 0.9 && a !== w.hero && !a.boss) { mode = 2; q = Math.min(1, (a.t - 0.9) / 0.6); }
        if (a === w.hero && a.inv > 0 && a.st !== S.GetUp && !w.spell && a.inv > 0.95) mode = 1;
        // riders: the beast, then the rider in the saddle
        if (a.mount) {
            const m = a.mount;
            let lp = 'idle0';
            if (a.st === S.Attack && a.atk && (a.atkName === 'whip' || a.atkName === 'lwhip')) lp = a.ph === 0 ? 'whipW' : 'whipS';
            else if (a.st === S.Jump) lp = 'jump';
            else if (a.st === S.Walk || a.st === S.Enter || a.st === S.Run) lp = 'walk' + (Math.floor(a.walk * 2) & 3);
            else lp = (Math.floor(t * 1.6 + a.id) & 1) ? 'idle1' : 'idle0';
            const lflip = lp === 'whipS' ? !flip : flip;
            this._blit(sprite(LIZ_COSTUME, lp), x, y, lflip, m.flash > 0 ? LUT_FLASH : lut === LUT_FLASH ? LUT : lut, mode, q);
            const so = saddleOffset(lp);
            const rx = Math.round(x + (lflip ? -so[0] : so[0])), ry = Math.round(y + so[1]);
            const rp = a.st === S.Attack ? 'rideA' : 'ride';
            this._blit(sprite(a.costume, rp), rx, ry, flip, lut, mode, q);
            return;
        }
        if (a.kind === K.Lizard) {
            let lp = (Math.floor(t * 1.6 + a.id) & 1) ? 'idle1' : 'idle0';
            if (a.st === S.Walk) lp = 'walk' + (Math.floor(a.walk * 2) & 3);
            else if (a.st === S.Flee) lp = 'run' + (Math.floor(a.walk * 2) & 1);
            this._blit(sprite('lizard', lp), x, y, flip, lut, mode, q);
            return;
        }
        const pose = this._pose(a, t);
        if (a.st === S.Rise) {
            // climbing out of the earth: drawn down in the ground, cut at the ground line
            const k = Math.min(1, a.t / 0.9);
            const sp = sprite(a.costume, k < 0.6 ? 'getup' : 'idle0');
            const sink = Math.round((1 - k) * sp.ay);
            this._blit(sp, x, y + sink, flip, lut, 0, 0, y + 1);
            if (k < 0.85) for (let i = -8; i <= 8; i += 2) this._px(x + i, y - (Math.abs(i) < 5 ? 1 : 0), this.c.dirtLo);
            return;
        }
        this._blit(sprite(a.costume, pose), x, y, flip, lut, mode, q);
        if (a === w.hero && a.st === S.Magic) this._heroAura(x, y, t, a.t);
        // stars over a dazed head
        if (a.st === S.GetUp || (a.st === S.Down && a.hp > 0)) {
            const ang = t * 6.28, hy = y - (a.st === S.Down ? 10 : 30) * (a.boss ? 1.3 : 1);
            for (let k = 0; k < 2; k++) { const aa = ang + k * Math.PI; this._star(x + Math.round(Math.cos(aa) * 8), Math.round(hy + Math.sin(aa) * 2)); }
        }
    }

    _pose(a, t) {
        const idle = (Math.floor(t * 1.6 + a.id * 0.5) & 1) ? 'idle1' : 'idle0';
        const walk = 'walk' + (Math.floor(a.walk * 2) & 3);
        switch (a.st) {
            case S.Idle: return a.kind === K.Thief ? walk : a.victory ? 'win' : idle;
            case S.Walk: case S.Enter: case S.Flee: return walk;
            case S.Run: return 'run' + (Math.floor(a.walk * 1.5) & 1);
            case S.Attack: {
                const n = a.atkName, ph = a.ph;
                if (a.kind === K.Hero) {
                    if (n === 'dash') return ph === 0 ? 'run0' : 'dash';
                    if (n === 'a1' || n === 'a2' || n === 'a3') return n + (ph === 0 ? 'w' : 's');
                    return 'a1s';
                }
                if (n === 'charge' || n === 'lunge') return ph === 0 ? 'w2' : 's2';
                if (n === 'slash2') return ph === 0 ? 'w2' : 's2';
                if (n === 'pound') return ph === 0 ? 'w' : 'pound';
                return ph === 0 ? 'w' : 's';
            }
            case S.Hurt: return a.kind === K.Hero && a.hurtFor < 0.1 ? 'getup' : 'hurt';
            case S.Air: return 'fly';
            case S.Down: case S.Dead: return 'down';
            case S.GetUp: return 'getup';
            case S.Grabbed: return 'hurt';
            case S.Jump: return a.pre > 0 ? 'getup' : a.jumpAtk ? 'jatk' : 'jump';
            case S.Grab: return 'grab';
            case S.Throw: return a.t < 0.22 ? 'throw0' : 'throw1';
            case S.Magic: return 'magic';
            case S.Drop: return 'jump';
            default: return idle;
        }
    }

    _star(x, y) {
        this._px(x, y, this.c.white);
        this._px(x - 1, y, this.c.hud); this._px(x + 1, y, this.c.hud); this._px(x, y - 1, this.c.hud); this._px(x, y + 1, this.c.hud);
    }

    _heroAura(x, y, t, at) {
        const r = 22 + Math.round(Math.min(1, at / 0.5) * 8);
        for (let k = 0; k < 24; k++) {
            const a = k / 24 * 6.283 + t * 1.5;
            this._px(x + Math.round(Math.cos(a) * r * 0.7), y - 30 + Math.round(Math.sin(a) * r), k & 1 ? this.c.cyan : this.c.blueHi);
        }
    }

    // ------------------------------------------------------------------ sparks, dust, shock
    _drawFx(w, ox, oy, t) {
        for (const f of w.fx) {
            const age = w.time - f.t0;
            if (age < 0 || age > 0.6) continue;
            const x = Math.round(f.x) + ox, y = Math.round(f.y - f.z) + oy;
            switch (f.kind) {
                case Fx.Spark: case Fx.Big: {
                    if (age > (f.kind === Fx.Big ? 0.22 : 0.15)) break;
                    const big = f.kind === Fx.Big;
                    const L = (big ? 11 : 7) * (0.6 + age * 4);
                    for (let k = 0; k < 8; k++) {
                        const a = k * 0.785 + (big ? 0.2 : 0);
                        const l = (k & 1 ? L * 0.55 : L);
                        const x1 = x + Math.round(Math.cos(a) * l), y1 = y + Math.round(Math.sin(a) * l);
                        this._line(x + Math.round(Math.cos(a) * l * 0.35), y + Math.round(Math.sin(a) * l * 0.35), x1, y1, k & 1 ? this.c.hud : this.c.white);
                    }
                    if (age < 0.07) { this._rect(x - 2, y - 2, 5, 5, this.c.white); if (big) this._rect(x - 4, y - 1, 9, 3, this.c.fireHi); }
                    break;
                }
                case Fx.Clang: {
                    if (age > 0.2) break;
                    for (let k = 0; k < 6; k++) {
                        const a = -1.6 + (k - 2.5) * 0.35 + (f.a > 0 ? 3.14 : 0);
                        const l = 4 + age * 60;
                        this._px(x + Math.round(Math.cos(a) * l), y + Math.round(Math.sin(a) * l) + Math.round(age * age * 200), k & 1 ? this.c.steelHi : this.c.hud);
                    }
                    this._rect(x - 1, y - 3, 3, 7, this.c.steelHi);
                    break;
                }
                case Fx.Dust: case Fx.Land: {
                    if (age > 0.45) break;
                    const n = f.a ? 5 : 3;
                    for (let k = 0; k < n; k++) {
                        const dir = k - (n - 1) / 2;
                        const px = x + Math.round(dir * (6 + age * 50)), py = y - Math.round(2 + age * 14 * (1 - Math.abs(dir) * 0.15));
                        const rr = Math.max(1, Math.round(4 - age * 6));
                        this._shadow(px, py, rr + 1, rr, age < 0.2 ? this.c.dirtHi : this.c.fur, k);
                    }
                    break;
                }
                case Fx.Shock: {
                    if (age > 0.5) break;
                    const reach = Math.round(age * 260);
                    for (const s of [-1, 1]) for (let q = 0; q < 3; q++) {
                        const px = x + s * (reach - q * 8);
                        for (let j = 0; j < 8 - q * 2; j++) this._px(px + s * (j & 1), y - j, j < 3 ? this.c.dirtHi : this.c.fur);
                        this._rect(px - 2, y - 1, 5, 2, this.c.dirtLo);
                    }
                    break;
                }
                case Fx.Pop: {
                    if (age > 0.6) break;
                    const yy = y - 10 - Math.round(age * 30);
                    const col = f.a === 0 ? this.c.blueHi : this.c.redHi;
                    this._text(f.a === 0 ? '+POT' : '+MEAT', x - 8, yy, PixelFont.Small, col);
                    break;
                }
            }
        }
    }

    _text(str, x, y, font, c) { this._surf.clip(VIEW_X, VIEW_Y, VIEW_W, VIEW_H); this._surf.text(str, x, y, font, c); this._surf.noClip(); }

    // ------------------------------------------------------------------ magic: the storm
    _stormSky(w, t) {
        // roiling cloud across the top of the view
        const sp = w.spell, k = Math.min(1, sp.t / 0.4);
        const depth = Math.round(18 + k * 22);
        for (let x = VIEW_X; x < VIEW_X + VIEW_W; x++) {
            const d = depth + Math.round(Math.sin(x * 0.11 + t * 3) * 4 + Math.sin(x * 0.043 - t * 2) * 5);
            for (let y = VIEW_Y; y < VIEW_Y + d; y++) this._px(x, y, ((x + y) & 3) === 0 ? this.c.purpleLo : this.c.purpleDk);
            this._px(x, VIEW_Y + d, this.c.blueLo);
        }
    }

    _drawSpell(w, ox, oy, t) {
        const sp = w.spell, lvl = sp.level;
        // the bolts: one more for every pot, each lands and stays, crackling
        const targets = [];
        for (const a of w.actors) if (a.kind !== K.Lizard && a.kind !== K.Thief && a.hp > -99 && a.x > w.cam - 8 && a.x < w.cam + VIEW_W + 8) targets.push(a);
        const n = Math.max(lvl, targets.length);
        for (let i = 0; i < n; i++) {
            const at = 0.3 + (0.7 * i) / Math.max(1, n);
            if (sp.t < at || sp.t > 1.75) continue;
            let bx, by;
            if (i < targets.length) { bx = Math.round(targets[i].x) + ox; by = Math.round(targets[i].y) + oy; }
            else { bx = VIEW_X + 20 + ((i * 97 + lvl * 31) % 264); by = 150 + ((i * 37) % 44); }
            this._bolt(bx, by, t, i, sp.t > 1.05 ? 2 : 1);
        }
        if (sp.t > 1.05 && sp.t < 1.35) for (const a of targets) this._burst(Math.round(a.x) + ox, Math.round(a.y) + oy - 24, sp.t - 1.05);
        // the name of it
        const names = ['', 'THUNDER', 'THUNDER', 'THUNDERSTORM', 'THUNDERSTORM', 'WRATH OF SKY', 'WRATH OF SKY', 'WRATH OF SKY', 'THE OLD GODS', 'THE OLD GODS'];
        const s = this._surf;
        s.clip(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
        s.textCenteredShadow(names[Math.min(9, lvl)], 160, 62, PixelFont.Display, this.c.cyan, this.c.blueDk, 2);
        s.textCenteredShadow('POWER ' + lvl + '  DAMAGE ' + SPELL_DMG[Math.min(9, lvl)], 160, 82, PixelFont.Arcade, this.c.blueHi, this.c.ink);
        s.noClip();
    }

    _bolt(x, groundY, t, i, thick) {
        const top = VIEW_Y + 20;
        let px = x + Math.round(Math.sin(i * 7.1) * 20), py = top;
        const jit = Math.floor(t * 12) + i * 5;
        const steps = 9;
        for (let k = 1; k <= steps; k++) {
            const ny = top + (groundY - 20 - top) * k / steps;
            const nx = x + (k === steps ? 0 : Math.round((((jit * 31 + k * 17) % 13) - 6) * (1 - k / steps) * 2));
            this._line(px, py, nx, ny, this.c.white);
            this._line(px - 1, py, nx - 1, ny, this.c.cyan);
            this._line(px + 1, py, nx + 1, ny, thick > 1 ? this.c.cyan : this.c.blueHi);
            if (k === 4 || k === 6) this._line(nx, ny, nx + ((k & 2) ? 9 : -9), ny + 8, this.c.blueHi);
            px = nx; py = ny;
        }
        this._shadow(x, groundY - 20, 8, 3, this.c.cyan);
    }

    _burst(x, y, age) {
        const r = Math.round(6 + age * 60);
        for (let k = 0; k < 16; k++) {
            const a = k / 16 * 6.283;
            this._px(x + Math.round(Math.cos(a) * r), y + Math.round(Math.sin(a) * r * 0.8), k & 1 ? this.c.white : this.c.cyan);
        }
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r, t) {
        const w = r.world, c = this.c, e = w.hero;
        s.noClip();
        const y0 = VY1 + 1;
        s.rect(VIEW_X, VY1, VIEW_W, 232 - VY1, c.ink);
        s.rect(VIEW_X, VY1, VIEW_W, 1, c.gold);
        s.rect(VIEW_X, VY1 + 1, VIEW_W, 1, c.goldLo);
        const arc = PixelFont.Arcade, sm = PixelFont.Small, dsp = PixelFont.Display;
        // magic pots
        s.text('MAGIC', 12, y0 + 4, sm, c.blueHi);
        for (let i = 0; i < 9; i++) {
            const px = 34 + i * 9;
            if (i < w.pots) this._blitAny(s, PotSprite, px + 4, y0 + 13, LUT);
            else { s.rect(px + 2, y0 + 5, 5, 6, c.blueDk); }
        }
        // name + health blocks
        s.text('KAEL', 12, y0 + 17, arc, c.cream);
        const blocks = 8, per = e.maxHp / blocks;
        const low = e.hp <= e.maxHp * 0.25;
        for (let i = 0; i < blocks; i++) {
            const bx = 40 + i * 11, by = y0 + 16;
            const fill = Math.max(0, Math.min(1, (e.hp - i * per) / per));
            s.rect(bx, by, 10, 9, c.blueDk);
            if (fill > 0) {
                const fw = Math.max(2, Math.round(9 * fill));
                s.rect(bx + 1, by + 1, fw - 1, 7, low ? c.red : c.blue);
                s.rect(bx + 1, by + 1, fw - 1, 2, low ? c.redHi : c.blueHi);
                s.rect(bx + 1, by + 7, fw - 1, 1, low ? c.redLo : c.blueLo);
            }
        }
        // lives
        this._blitAny(s, HeadIcon, 136, y0 + 25, LUT);
        s.text('X' + Math.max(0, w.lives), 142, y0 + 17, arc, c.cream);
        // stage + score
        s.text('STAGE ' + (Math.min(3, (w.stageIdx | 0) + 1)), 170, y0 + 4, sm, c.fire);
        s.text('SCORE', 170, y0 + 17, sm, c.fire);
        s.textRight(d6(r.score), 310, y0 + 6, dsp, c.hud, 2);
    }

    _blitAny(s, sp, x, y, lut) {
        const u = this._u32;
        for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) {
            const v = sp.data[j * sp.w + i];
            if (v === CLEAR) continue;
            const xx = x - sp.ax + i, yy = y - sp.ay + j;
            if (xx < 8 || xx >= 312 || yy < 8 || yy >= 232) continue;
            u[yy * 320 + xx] = lut[v];
        }
    }

    // ------------------------------------------------------------------ plates over the stage
    _drawPlates(s, r, t) {
        const w = r.world, c = this.c, dsp = PixelFont.Display, arc = PixelFont.Arcade;
        s.clip(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
        const st = Stages[w.stageIdx];
        const P = r.p;
        if (P === Phase.Play) {
            const since = w.time - w.stageStart;
            if (since < 2.2) {
                s.textBox('STAGE ' + (w.stageIdx + 1), 160, 50, dsp, 2, c.hud, c.gold, c.ink);
                s.textCenteredShadow(st.name, 160, 72, arc, c.cream, c.ink);
                if (r.mercyActive) s.textBox('THE OLD GODS WATCH OVER YOU', 160, 96, arc, 1, c.cyan, c.blueLo, c.ink);
            }
            // GO! when a wave is beaten and the road opens
            if (!w.locked && w.waveIdx > 0 && w.waveIdx < st.waves.length && w.time - w.goT < 3.5 && SurfaceDraw.blink(w.time - w.goT, 1.5)) {
                s.textCenteredShadow('GO', 268, 64, dsp, c.hud, c.redLo, 3);
                for (let i = 0; i < 8; i++) s.rect(262 + i, 90 - i, 1, 2 * i + 1, c.hud);
                s.rect(248, 87, 14, 7, c.hud);
            }
            // the boss's name
            if (w.bossName && w.time - w.bossT < 2.6 && !w.spell) {
                const k = Math.min(1, (w.time - w.bossT) / 0.35);
                const x = Math.round(160 + (1 - k) * 200);
                s.textBox(w.bossName, x, 40, dsp, 2, c.redHi, c.red, c.ink);
            }
            // the boss's health
            const b = w.boss;
            if (b && w.bossName && b.hp > 0 && !b.dead) {
                s.text(w.bossName, 14, 12, PixelFont.Small, c.redHi);
                const bw = 120, fill = Math.max(0, Math.round(bw * b.hp / b.maxHp));
                s.rect(14, 19, bw + 2, 5, c.ink); s.rect(15, 20, fill, 3, c.red); s.rect(15, 20, fill, 1, c.redHi);
                // the twin: a second bar
                const twin = w.actors.find(a => a.boss && a !== b && a.hp > 0 && !a.dead);
                if (twin) { s.rect(14, 25, bw + 2, 5, c.ink); const f2 = Math.max(0, Math.round(bw * twin.hp / twin.maxHp)); s.rect(15, 26, f2, 3, c.green); s.rect(15, 26, f2, 1, c.greenHi); }
            }
            if (w.clearT >= 0) {
                s.textBox('STAGE CLEAR', 160, 26, dsp, 3, c.hud, c.gold, c.ink);
                if (w.time - w.clearT > 0.6) s.textCenteredShadow('BONUS ' + (1000 * (r.stagesCleared + 1) + 50 * Math.max(0, Math.round(w.hero.hp))), 160, 58, arc, c.cream, c.ink, 2);
            }
        } else if (P === Phase.Card || P === Phase.Over) {
            const won = r.roundWon;
            s.textBox(won ? 'THE WARLORD FALLS' : 'GAME OVER', 160, 42, dsp, 2, won ? c.hud : c.red, won ? c.gold : c.redLo, c.ink);
            s.plate(76, 64, 168, 44, c.ink, won ? c.gold : c.redLo);
            s.textCentered('SCORE ' + d6(r.score), 160, 71, arc, c.hud, 2);
            s.textCentered(won ? 'THE ROAD IS YOURS' : 'STAGES ' + r.stagesCleared + ' OF 3', 160, 93, arc, won ? c.fireHi : c.cream);
        }
        s.noClip();
    }

    // ------------------------------------------------------------------ the old map (stage card)
    _drawMap(s, r, t) {
        const m = oldMap(), u = this._u32, c = this.c;
        for (let j = 0; j < m.h; j++) {
            const o = (VIEW_Y + j) * 320 + VIEW_X;
            for (let i = 0; i < m.w; i++) { const v = m.d[j * m.w + i]; if (v !== CLEAR) u[o + i] = LUT[v]; }
        }
        const k = r.stage, pt = r.phaseTime;
        // the road travelled so far, in red; the next leg drawn in as the card holds
        const stopIdx = [1, 4, 8];
        const upto = k === 0 ? 0 : stopIdx[k - 1];
        const lead = Math.min(1, pt / 1.6);
        const drawLeg = (a, b, frac) => {
            for (let q = a; q < b; q++) {
                const [x0, y0] = MapRoute[q], [x1, y1] = MapRoute[q + 1];
                const f = q === b - 1 ? frac : 1;
                const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * f);
                for (let z = 0; z <= n; z++) { const L = Math.hypot(x1 - x0, y1 - y0); const x = Math.round(VIEW_X + x0 + (x1 - x0) * z / L), y = Math.round(VIEW_Y + y0 + (y1 - y0) * z / L); s.rect(x - 1, y - 1, 2, 2, c.red); }
            }
        };
        drawLeg(0, upto, 1);
        drawLeg(upto, stopIdx[k], lead);
        // the stops: crossed swords at the next one, blinking at 1 Hz once reached
        for (let i = 0; i < 3; i++) {
            const [x, y] = MapStops[i];
            const sx = VIEW_X + x, sy = VIEW_Y + y;
            if (i < k) { s.rect(sx - 3, sy - 3, 7, 7, c.redLo); s.rect(sx - 2, sy - 2, 5, 5, c.red); continue; }
            if (i === k && (lead < 1 || SurfaceDraw.blink(t, 1))) {
                for (let q = -5; q <= 5; q++) { s.setPixel(sx + q, sy + q, c.ink); s.setPixel(sx + q, sy - q, c.ink); s.setPixel(sx + q + 1, sy + q, c.steelLo); s.setPixel(sx + q + 1, sy - q, c.steelLo); }
                s.rect(sx - 2, sy + 3, 5, 2, c.gold); s.rect(sx - 2, sy - 5, 5, 2, c.gold);
            }
        }
        // the hero's head where he stands
        const [hx, hy] = k === 0 ? MapRoute[0] : MapStops[k - 1];
        this._blitAny(s, HeadIcon, VIEW_X + hx, VIEW_Y + hy - 3, LUT);
        const st = Stages[k];
        s.textBox('STAGE ' + (k + 1), 160, 22, PixelFont.Display, 2, c.redLo, c.dirtLo, c.furHi);
        s.plate(58, 196, 204, 26, c.ink, c.gold);
        s.textCentered(st.name, 160, 201, PixelFont.Arcade, c.hud);
        s.textCentered(['FIRST BLOOD AT THE BURNED VILLAGE', 'THE DEAD WALK THE BLACKWOOD', 'THE WARLORD WAITS'][k], 160, 212, PixelFont.Small, c.cream);
        if (r.mercyActive) s.textCentered('THE OLD GODS WATCH OVER YOU', 160, 182, PixelFont.Arcade, c.blueLo);
    }

    // ------------------------------------------------------------------ the camp by night
    _drawCamp(s, r, t) {
        const w = r.world, art = stageArt(w.stageIdx), c = this.c, u = this._u32;
        const sky = campSky();
        for (let j = 0; j < sky.h; j++) { const o = (VIEW_Y + j) * 320 + VIEW_X; for (let i = 0; i < sky.w; i++) { const v = sky.d[j * sky.w + i]; if (v !== CLEAR) u[o + i] = LUT[v]; } }
        const cam = Math.round(Math.max(0, Stages[w.stageIdx].len - VIEW_W));
        this._blitLayer(art.far, cam * art.far.f, LUT_NIGHT, 0, 0);
        this._blitLayer(art.mid, cam * art.mid.f, LUT_NIGHT, 0, 0);
        this._blitLayer(art.near, cam, LUT_NIGHT, 0, 0);
        // the fire's light on the ground
        const fx = 150, fy = 178;
        this._shadow(fx, fy - 2, 70, 16, c.fireLo, 0);
        this._shadow(fx, fy - 2, 40, 10, c.fire, 1);
        this._shadow(fx, fy - 2, 26, 7, c.fireLo, 1);
        // logs and the fire
        for (let i = -9; i <= 9; i++) { this._px(fx + i, fy + Math.round(i * 0.25), c.leatherLo); this._px(fx + i, fy - Math.round(i * 0.25), c.leather); }
        this._rect(fx - 10, fy + 1, 21, 2, c.dirtDk);
        this._flame(fx, fy, 2, t, 1.3); this._flame(fx - 4, fy, 0, t, 2.1); this._flame(fx + 4, fy, 0, t, 3.7);
        const cp = r.camp, pt = r.phaseTime;
        // the hero by the fire, his sword stuck in the earth, the pack behind him
        const kicking = cp && pt - cp.kickT < 0.3;
        if (kicking) this._blit(sprite('hero', 'kick'), 204, 184, false, LUT);
        else this._blit(sprite('hero', 'sit'), 196, 182, true, LUT);
        this._blit(sprite('lizardBare', 'idle0'), 64, 188, false, LUT_NIGHT);
        this._blitAny(s, MeatSprite, 120, 190, LUT);
        // the pack
        this._shadow(232, 185, 9, 2, c.ink);
        for (let j = -8; j <= 0; j++) { const hw = Math.round(8 * Math.sqrt(1 - ((j + 4) * (j + 4)) / 20)); this._rect(232 - hw, 184 + j, hw * 2 + 1, 1, j < -6 ? c.leatherHi : c.leather); }
        this._px(232, 175, c.leatherLo); this._rect(230, 181, 5, 1, c.leatherLo);
        // the thieves
        if (cp) for (const th of cp.thieves) {
            if (th.st === 0 || th.x > 330) continue;
            const pose = th.st === 3 ? 'hurt' : th.st === 2 ? 'idle' + (Math.floor(pt * 6) & 1) : 'walk' + (Math.floor(pt * 8) & 3);
            this._blit(sprite('thiefBlue', pose), Math.round(th.x), 186 + Math.round(th.y), th.st !== 3 && th.st !== 4, th.st === 3 ? LUT : LUT_NIGHT);
            if (th.st === 3 && pt - th.st0 < 0.8) {
                const k = (pt - th.st0) / 0.8;
                this._blitAny(s, PotSprite, Math.round(th.x - 30 * k), Math.round(160 - 40 * k + 60 * k * k), LUT);
                s.clip(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
                s.text('+1', Math.round(th.x - 20), 140 - Math.round(20 * k), PixelFont.Arcade, c.blueHi);
                s.noClip();
            }
        }
        // plates
        s.clip(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
        s.textBox('CAMP', 160, 26, PixelFont.Display, 2, c.fireHi, c.fireLo, c.ink);
        if (cp && SurfaceDraw.blink(pt, 1)) s.textCenteredShadow('THIEVES! KICK THEM (SPACE)', 160, 52, PixelFont.Arcade, c.cream, c.ink);
        if (cp && cp.gained > 0) s.textCenteredShadow('POTS TAKEN BACK ' + cp.gained, 160, 64, PixelFont.Arcade, c.blueHi, c.ink);
        s.noClip();
    }
}

