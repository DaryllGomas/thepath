// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE PICTURE.
// Port of IronDojoRenderer.cs (Staging/Batch3/irondojo); the sprites are in sprites.js.
//
// One floor of a lacquered pagoda, side on, scrolling with the fighter:
//   - HUD band y 8..49: 1UP + the score in display digits x2, the floor TIME in display digits x2
//     (it turns red under ten seconds; a colour change, never a flash), FLOOR 1 and the lives as
//     little headband heads, then ENERGY (10 blocks) and, once he wakes, the BOSS's bar
//   - the play window y 52..231 inside the 8 px safe area: a black ceiling beam with hanging red
//     lanterns, dojo-red wall panels between dark pillars, a tan wainscot at the height the
//     fighters stand (so white gis, black grabbers, red throwers and the gold boss all read
//     against it), a tan plank floor. The stairs to floor 2 rise at the far left end.
//   - characters are palette sprites at scale 2: the fighter 32 px tall, grabbers and throwers
//     32, the tumbling dwarf 18, the boss 34 with a 2 px stick drawn to his pose
//   - the boss's TELL: stick raised overhead, a gold glint at its tip and a gold "!" over him
//     (steady, not blinking) for the whole wind-up
//   - GET READY, KNOCKED OUT, TIME UP, FLOOR CLEAR (+ the time bonus), ROUND WON and GAME OVER on
//     double-framed plates. Blinks run at 1 Hz; nothing strobes.
import { f32, d6, dn, idiv, roundEven, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { IronDojoPalette, IronDojoSpec } from './spec.js';
import { IronDojoSprites as S } from './sprites.js';
import { IronDojoSim, Act, FoeKind, FoeState, BossState } from './sim.js';

const PlayLeft = 8, PlayTop = 52, PlayW = 304, PlayBottom = 232, FloorY = 206;
const K = 2;                                        // sprite scale: chunky pixels for a curved tube at 0.8 m
const Phase = IronDojoSim.Phase;
const C = IronDojoSim.C;
const PunchPoseAt = f32(C.PunchStart * f32(0.6));   // C# const IronDojoSim.PunchStart * 0.6f
const SeamY = [212, 219, 227];
const BandTop = [206, 213, 220, 228];

function snap(v, step) { let m = v % step; if (m < 0) m += step; return v - m; }

export class IronDojoRenderer {
    constructor() {
        const pal = this.pal = IronDojoPalette;
        this.cBg = pal.get('shadow'); this.cShadowRed = pal.get('shadowRed'); this.cDojo = pal.get('dojoRed'); this.cRed = pal.get('red');
        this.cWood = pal.get('woodDark'); this.cTanDark = pal.get('tanDark'); this.cTan = pal.get('tan'); this.cWhite = pal.get('white');
        this.cGrey = pal.get('grey'); this.cGoldDark = pal.get('goldDark'); this.cGold = pal.get('gold');
    }

    draw(sim, s, t) {
        s.noClip();
        s.clear(this.cBg);
        const r = sim;
        if (r == null || r.f == null) return;
        t = f32(t);
        const cam = r.cam;

        s.clip(PlayLeft, PlayTop, PlayW, PlayBottom - PlayTop);
        this._drawRoom(s, cam, r);
        this._drawShadows(s, r);
        this._drawBoss(s, r);
        for (const e of r.foes) if (e.s !== FoeState.Hold) this._drawFoe(s, r, e);
        this._drawFighter(s, r, t);
        for (const e of r.foes) if (e.s === FoeState.Hold) this._drawFoe(s, r, e);   // a hug goes over the fighter
        for (const k of r.knives) this._drawKnife(s, cam, k);
        this._drawFx(s, r);
        s.noClip();

        this._drawHud(s, r);
        this._drawOverlays(s, r, t);
    }

    // ------------------------------------------------------------------ the room
    _drawRoom(s, cam, r) {
        const camPx = cam.camPx;
        const x0 = PlayLeft;
        // ceiling beam and rafters
        s.rect(x0, 52, PlayW, 12, this.cBg);
        s.rect(x0, 62, PlayW, 2, this.cWood);
        for (let wx = snap(camPx - 64, 64); wx < camPx + 336; wx += 64) {
            const sx = wx - camPx;
            s.rect(sx, 52, 8, 10, this.cWood);
            s.rect(sx + 1, 53, 6, 1, this.cTanDark);
        }
        // upper wall: dojo red with inset panels
        s.rect(x0, 64, PlayW, 84, this.cDojo);
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) {
            const sx = wx - camPx;
            s.frame(sx + 22, 74, 94, 64, this.cShadowRed);
            s.frame(sx + 23, 75, 92, 62, this.cShadowRed);
            s.rect(sx + 26, 78, 86, 1, this.cRed);            // a lacquer highlight along the panel top
        }
        // hanging scrolls
        for (let wx = snap(camPx - 384, 384) + 128; wx < camPx + 704; wx += 384) {
            const sx = wx - camPx + 58;                        // centred in a panel, clear of the pillars
            s.rect(sx - 1, 78, 24, 2, this.cWood);
            s.rect(sx, 80, 22, 50, this.cShadowRed);
            s.frame(sx, 80, 22, 50, this.cGoldDark);
            s.circle(sx + 11, 96, 6, this.cGold, false);
            s.circle(sx + 11, 96, 3, this.cGold, true);
            s.rect(sx + 10, 106, 2, 18, this.cGold);
            s.rect(sx + 6, 112, 10, 2, this.cGold);
        }
        // pillars (through the wainscot)
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) {
            const sx = wx - camPx;
            s.rect(sx - 7, 64, 14, 142, this.cWood);
            s.rect(sx - 5, 64, 2, 142, this.cTanDark);
            s.rect(sx - 7, 64, 14, 3, this.cBg);
        }
        // rail + wainscot
        s.rect(x0, 148, PlayW, 4, this.cWood);
        s.rect(x0, 148, PlayW, 1, this.cTanDark);
        s.rect(x0, 152, PlayW, 52, this.cTanDark);
        for (let wx = snap(camPx - 16, 16); wx < camPx + 336; wx += 16) s.rect(wx - camPx, 152, 1, 52, this.cWood);
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) s.rect(wx - camPx - 7, 148, 14, 58, this.cWood);
        s.rect(x0, 202, PlayW, 4, this.cWood);                // baseboard
        // lanterns hang in front of the wall
        for (let wx = snap(camPx - 256, 256) + 64; wx < camPx + 576; wx += 256) this._lantern(s, wx - camPx, 64);
        // the floor: tan planks, seams widening toward the viewer
        s.rect(x0, 206, PlayW, 26, this.cTan);
        for (const y of SeamY) s.rect(x0, y, PlayW, 1, this.cTanDark);
        for (let band = 0; band < BandTop.length; band++) {
            const bh = (band < SeamY.length ? SeamY[band] : 232) - BandTop[band];
            const off = band * 21;
            for (let wx = snap(camPx - 64 - off, 64) + off; wx < camPx + 336; wx += 64) s.rect(wx - camPx, BandTop[band], 1, bh, this.cTanDark);
        }
        s.rect(x0, 230, PlayW, 2, this.cWood);
        this._drawStairs(s, camPx);
        this._drawDoor(s, camPx, r.floorLength);
    }

    _lantern(s, sx, top) {
        s.rect(sx, top, 1, 8, this.cTanDark);
        s.rect(sx - 4, top + 8, 9, 2, this.cGold);
        s.rect(sx - 6, top + 10, 13, 14, this.cRed);
        s.rect(sx - 6, top + 10, 1, 14, this.cDojo);
        s.rect(sx + 6, top + 10, 1, 14, this.cDojo);
        for (let y = top + 13; y < top + 24; y += 4) s.rect(sx - 5, y, 11, 1, this.cDojo);
        s.rect(sx - 4, top + 24, 9, 2, this.cGold);
        s.rect(sx - 1, top + 26, 3, 5, this.cRed);
    }

    _drawStairs(s, camPx) {
        // nine steps rise up and to the left from the foot (world x 92) to the ceiling
        const foot = Math.trunc(C.StairsFootX);
        if (foot + 20 - camPx < PlayLeft) return;
        for (let k = 0; k < 9; k++) {
            const xr = foot - 12 * k - camPx, xl = xr - 12;
            const top = FloorY - 16 * (k + 1);
            s.rect(xl, top, 12, FloorY - top, this.cWood);                // the stair's body
            s.rect(xl, top, 12, 3, this.cTan);                           // tread
            s.rect(xl, top + 3, 12, 1, this.cTanDark);
            s.rect(xr - 1, top, 1, 16, this.cTanDark);                    // riser edge
        }
        // the banister: gold, parallel to the flight
        for (let k = 0; k < 9; k++) {
            const xr = foot - 12 * k - camPx;
            const top = FloorY - 16 * (k + 1) - 22;
            s.line(xr, top + 16, xr - 12, top, this.cGold);
            s.line(xr, top + 17, xr - 12, top + 1, this.cGoldDark);
            if (k % 2 === 0) s.rect(xr - 1, top + 16, 2, 22, this.cGoldDark);
        }
        // the way up: a black opening in the ceiling and the 2F plaque
        const ox = foot - 12 * 9 - camPx;
        s.rect(ox - 20, 52, 44, 12, this.cBg);
        s.plate(foot - 60 - camPx, 70, 20, 12, this.cShadowRed, this.cGold);
        s.text('2F', foot - 57 - camPx, 73, PixelFont.Small, this.cGold, 1);
    }

    _drawDoor(s, camPx, floorLength) {
        const sx = Math.trunc(floorLength) - 56 - camPx;
        if (sx > PlayLeft + PlayW || sx + 48 < PlayLeft) return;
        s.rect(sx - 4, 100, 48, 106, this.cWood);
        s.rect(sx, 106, 40, 100, this.cBg);
        s.rect(sx - 6, 98, 52, 4, this.cGoldDark);
        s.rect(sx + 19, 106, 2, 100, this.cShadowRed);
    }

    // ------------------------------------------------------------------ characters
    _drawShadows(s, r) {
        const cam = r.cam;
        if (r.f.a !== Act.Climb) this._shadow(s, cam.toScreen(r.f.x), 16);
        for (const e of r.foes) if (e.live) this._shadow(s, cam.toScreen(e.x), e.kind === FoeKind.Dwarf ? 12 : 16);
        if (r.b.active || r.cam.onScreen(r.b.x, 40)) this._shadow(s, cam.toScreen(r.b.x), r.b.s === BossState.Down ? 30 : 18);
    }

    _shadow(s, sx, w) {
        s.rect(sx - idiv(w, 2) + 2, FloorY, w - 4, 1, this.cTanDark);
        s.rect(sx - idiv(w, 2), FloorY + 1, w, 2, this.cTanDark);
    }

    // draws a sprite with its anchor column over world x, its bottom at the floor minus height
    _put(s, cam, p, worldX, height, dir) {
        const sx = cam.toScreen(worldX);
        const flip = dir < 0;
        const x0 = flip ? sx - (p.s.width - 1 - p.ax) * K : sx - p.ax * K;
        const y0 = FloorY - roundEven(height) - p.s.height * K;
        s.blit(p.s, x0, y0, this.pal, K, flip);
    }

    _drawFighter(s, r, t) {
        const f = r.f;
        let p;
        switch (f.a) {
            case Act.Walk: p = (Math.trunc(f32(f.walkClock / f32(0.13))) & 1) === 0 ? S.FighterWalk1 : S.FighterWalk2; break;
            case Act.Punch: p = f.at < PunchPoseAt ? S.FighterStand : S.FighterPunch; break;
            case Act.Kick: p = f.at < C.KickStart ? S.FighterChamber : S.FighterKick; break;
            case Act.Duck: p = S.FighterDuck; break;
            case Act.DuckPunch: p = S.FighterDuckPunch; break;
            case Act.DuckKick: p = f.at < C.DuckKickStart ? S.FighterDuck : S.FighterDuckKick; break;
            case Act.Jump: p = S.FighterJump; break;
            case Act.JumpKick: p = S.FighterJumpKick; break;
            case Act.Flinch: p = S.FighterFlinch; break;
            case Act.Grabbed: p = (f.wiggles & 1) === 0 ? S.FighterStruggle1 : S.FighterStruggle2; break;
            case Act.Down: p = S.FighterDown; break;
            case Act.Climb: p = (Math.trunc(f32(f.walkClock / f32(0.16))) & 1) === 0 ? S.FighterWalk1 : S.FighterWalk2; break;
            default: p = S.FighterStand; break;
        }
        this._put(s, r.cam, p, f.x, f.h, f.dir);
        if (f.a === Act.Grabbed && SurfaceDraw.blink(t)) {
            const sx = r.cam.toScreen(f.x);
            s.textCenteredShadow('<SHAKE>', sx, FloorY - 50, PixelFont.Arcade, this.cGold, this.cBg);
        }
    }

    _drawFoe(s, r, e) {
        let p;
        const step = (Math.trunc(f32(e.clock / f32(0.14))) & 1) === 0;
        switch (e.kind) {
            case FoeKind.Grabber:
                if (e.s === FoeState.Dying) p = S.GrabberHit;
                else if (e.s === FoeState.Hold) p = S.GrabberHold;
                else if (e.s === FoeState.Stunned) p = S.GrabberHit;
                else p = step ? S.GrabberWalk1 : S.GrabberWalk2;
                break;
            case FoeKind.Thrower:
                if (e.s === FoeState.Dying) p = S.ThrowerHit;
                else if (e.s === FoeState.Windup) p = e.knifeHigh ? S.ThrowerHigh : S.ThrowerLow;
                else if (e.s === FoeState.Walk) p = step ? S.ThrowerWalk1 : S.ThrowerWalk2;
                else p = S.ThrowerStand;
                break;
            default:
                if (e.s === FoeState.Dying || e.s === FoeState.Hop) p = S.DwarfHop;
                else {
                    let fr = Math.trunc(f32(e.clock / f32(0.1))) & 3;           // a somersault, a quarter turn every 0.1 s
                    if (e.dir < 0) fr = (4 - fr) & 3;
                    p = S.DwarfRoll[fr];
                }
                break;
        }
        this._put(s, r.cam, p, e.x, e.h, e.dir);
        if (e.kind === FoeKind.Grabber && e.s === FoeState.Stunned) {
            const sx = r.cam.toScreen(e.x);
            const ph = Math.trunc(f32(e.clock * 2)) & 1;                        // 2 Hz: the dizzy stars trade places
            s.rect(sx - 8 + ph * 12, FloorY - 38, 2, 2, this.cGold);
            s.rect(sx + 4 - ph * 12, FloorY - 40, 2, 2, this.cGold);
        }
    }

    _drawBoss(s, r) {
        const b = r.b;
        const cam = r.cam;
        if (!cam.onScreen(b.x, 80)) return;
        const dir = b.dir;
        let p;
        switch (b.s) {
            case BossState.Telegraph: p = S.BossRaise; break;
            case BossState.Swing: p = S.BossStrike; break;
            case BossState.Recover: p = S.BossStrike; break;
            case BossState.Hurt: p = S.BossHurt; break;
            case BossState.Down: p = S.BossDown; break;
            case BossState.Approach:
            case BossState.Retreat: p = (Math.trunc(f32(b.clock / f32(0.16))) & 1) === 0 ? S.BossStand : S.BossStep; break;
            default: p = S.BossStand; break;
        }
        const sx = cam.toScreen(b.x);
        const top = FloorY - p.s.height * K;
        // the stick goes behind the arms for the raise, in front for the rest
        if (b.s === BossState.Telegraph) this._stick(s, sx, top, dir, b);
        this._put(s, cam, p, b.x, 0, dir);
        if (b.s !== BossState.Telegraph) this._stick(s, sx, top, dir, b);
        if (b.s === BossState.Telegraph)
            s.textCenteredShadow('!', sx, top - 30, PixelFont.Display, this.cGold, this.cBg, 2);
    }

    // the stick: 2 px of dark wood with a gold ferrule at each end, posed by the boss's state
    _stick(s, sx, top, dir, b) {
        const hx = sx + dir * 10, hy = top + 18;                      // his hands
        let ax, ay, bx, by;
        switch (b.s) {
            case BossState.Telegraph: ax = hx - dir * 14; ay = hy + 10; bx = hx - dir * 22; by = top - 22; break;   // raised overhead, behind
            case BossState.Swing: ax = hx - dir * 12; ay = hy; bx = sx + dir * Math.trunc(C.BossReach); by = hy + 4; break;
            case BossState.Recover: ax = hx - dir * 8; ay = hy - 4; bx = sx + dir * 44; by = FloorY - 2; break;
            case BossState.Hurt: ax = hx - dir * 16; ay = hy + 12; bx = hx + dir * 10; by = top - 12; break;
            case BossState.Down: ax = sx - dir * 26; ay = FloorY - 1; bx = sx + dir * 22; by = FloorY - 1; break;
            default: ax = hx - dir * 12; ay = hy + 12; bx = hx + dir * 26; by = hy - 14; break;              // on guard
        }
        s.line(ax, ay, bx, by, this.cWood);
        s.line(ax, ay + 1, bx, by + 1, this.cWood);
        s.line(ax + 1, ay, bx + 1, by, this.cTanDark);
        s.rect(ax - 1, ay - 1, 3, 3, this.cGold);
        s.rect(bx - 1, by - 1, 3, 3, this.cGold);
        if (b.s === BossState.Telegraph) { s.rect(bx - 3, by, 7, 1, this.cGold); s.rect(bx, by - 3, 1, 7, this.cGold); }   // the glint
    }

    _drawKnife(s, cam, k) {
        const h = k.high ? 26 : 5;
        const p = S.Knife;
        const sx = cam.toScreen(k.x);
        const y0 = FloorY - Math.trunc(h) - p.s.height * K;
        s.blit(p.s, k.dir > 0 ? sx - p.ax * K : sx - (p.s.width - 1 - p.ax) * K, y0, this.pal, K, k.dir < 0);
    }

    _drawFx(s, r) {
        for (const x of r.effects) {
            const sx = r.cam.toScreen(x.x), sy = FloorY - Math.trunc(x.h);
            if (x.kind === 1) {
                s.textCenteredShadow(String(x.value), sx, sy - 8, PixelFont.Arcade, this.cGold, this.cBg);
                continue;
            }
            const c = x.kind === 2 ? this.cGold : this.cWhite;
            const rad = 3 + Math.trunc(f32(x.t * 30));
            s.rect(sx - rad, sy, rad * 2 + 1, 1, c);
            s.rect(sx, sy - rad, 1, rad * 2 + 1, c);
            s.rect(sx - 1, sy - 1, 3, 3, x.kind === 2 ? this.cWhite : this.cGold);
            const d = idiv(rad * 2, 3);
            s.setPixel(sx - d, sy - d, c); s.setPixel(sx + d, sy - d, c); s.setPixel(sx - d, sy + d, c); s.setPixel(sx + d, sy + d, c);
        }
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 10, 9, arc, this.cRed);
        s.text(d6(r.score), 10, 18, dsp, this.cWhite, 2);
        s.textCentered('TIME', 160, 9, arc, this.cRed);
        const secs = Math.ceil(Math.max(0, r.timer));
        s.textCentered(dn(secs, 2), 160, 18, dsp, secs <= 10 && r.b.alive ? this.cRed : this.cGold, 2);
        s.textRight('FLOOR 1', 310, 9, arc, this.cRed);
        for (let i = 0; i < r.livesLeft && i < 5; i++)
            s.blit(S.LifeHead, 296 - i * 18, 20, this.pal, 2);
        // energy
        s.text('ENERGY', 10, 39, arc, this.cWhite);
        for (let i = 0; i < C.MaxEnergy; i++) {
            const x = 50 + i * 9;
            if (i < r.f.energy) s.rect(x, 38, 7, 8, r.f.energy <= 3 ? this.cRed : this.cWhite);
            else s.frame(x, 38, 7, 8, this.cShadowRed);
        }
        if (r.b.active) {
            const n = Math.min(r.b.maxHP, 12);
            const x0 = 311 - n * 9 + 2;                       // right-aligned, clear of the safe margin
            s.textRight('BOSS', x0 - 5, 39, arc, this.cGold);
            for (let i = 0; i < n; i++) {
                const x = x0 + i * 9;
                if (i < r.b.hp) s.rect(x, 38, 7, 8, this.cGold);
                else s.frame(x, 38, 7, 8, this.cGoldDark);
            }
        }
        s.dottedRule(8, 312, 49, 3, this.cDojo);
    }

    // ------------------------------------------------------------------ plates
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = 128;
        const spec = IronDojoSpec;
        switch (r.p) {
            case Phase.Intro:
                if (r.firstIntro) {
                    s.textBox('FLOOR 1', midX, midY - 40, dsp, 3, this.cGold, this.cDojo, this.cBg);
                    s.textCenteredShadow('GET READY', midX, midY - 4, arc, this.cWhite, this.cBg, 2);
                } else {
                    s.textBox('GET READY', midX, midY - 30, dsp, 2, this.cWhite, this.cDojo, this.cBg);
                    s.textCenteredShadow((r.livesLeft === 1 ? 'LAST LIFE' : r.livesLeft + ' LIVES LEFT'), midX, midY - 2, arc, this.cGold, this.cBg);
                }
                if (r.mercyActive) {
                    s.plate(midX - 72, midY + 14, 144, 17, this.cBg, this.cGold);
                    s.textCentered('FREE RIDE - IRON WILL', midX, midY + 19, arc, this.cGold);
                }
                break;
            case Phase.KO:
                if (r.phaseTime > f32(0.4)) {
                    s.textBox('KNOCKED OUT', midX, midY - 36, dsp, 2, this.cWhite, this.cRed, this.cBg);
                    const n = r.livesLeft - 1;
                    const left = n <= 0 ? 'NO LIVES LEFT' : n + (n === 1 ? ' LIFE LEFT' : ' LIVES LEFT');
                    s.textCenteredShadow(left, midX, midY - 8, arc, this.cGold, this.cBg);
                }
                break;
            case Phase.TimeUp:
                s.textBox('TIME UP', midX, midY - 36, dsp, 3, this.cRed, this.cRed, this.cBg);
                break;
            case Phase.Climb:
                s.textBox('FLOOR CLEAR', midX, midY - 40, dsp, 2, this.cGold, this.cGold, this.cBg);
                s.plate(midX - 70, midY - 14, 140, 22, this.cBg, this.cGoldDark);
                s.textCentered('TIME BONUS ' + r.bonusPaid, midX, midY - 7, arc, this.cWhite);
                break;
            case Phase.Card:
            case Phase.Over: {
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 44, dsp, 3, won ? this.cGold : this.cWhite, won ? this.cGold : this.cRed, this.cBg);
                s.plate(midX - 84, midY - 12, 168, 46, this.cBg, won ? this.cGold : this.cRed);
                s.textCentered('SCORE ' + d6(r.score), midX, midY - 6, arc, this.cWhite, 2);
                const line = won ? 'TIME BONUS ' + r.bonus : 'THE STICK MASTER WAITS';
                s.textCentered(line, midX, midY + 18, arc, this.cGold);
                break;
            }
        }
    }
}
