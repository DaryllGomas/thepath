// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · THE PICTURE.
// Started as a port of SwarmPatrolRenderer.cs; built out on 2026-10-18 (stage cards, tallies, the queen, the juice).
//
// A 1981 formation shooter on a landscape tube, palette-limited (spec.js: the board's black, violet, hot pink, white,
// cyan for the player, their dim steps, and the build-out's gold and steel):
//   - HUD band y 8..27: 1UP + the score in display digits at scale 2 (top-left), STAGE n (top-right)
//   - the field y 30..216, clipped: a slow starfield, the swarm (two wing frames at 1.25 Hz) in ranks over the upper
//     half, 2x6 bolts, the 16x12 ship (two of them as a twin), the tractor beam (bands that scroll, never flash), the
//     captive riding over its captor, THE HIVE QUEEN (body, two wings, the eye) with her telegraphs (gold mandibles before
//     a fan, a dotted line and a bracket on the lane before a sting beam)
//   - bottom band: reserve ships (bottom-left), a pennant per stage cleared (gold for a challenge stage, bottom-right)
//   - bursts step through white -> pink/violet -> the dim entries, never a blend; debris shards fly from each (their
//     paths hashed from the burst id, so the picture only reads the sim); score pop-ups rise and go
//   - a little screen shake (the field only; the 8 px border stays black) on a lost ship, a broken wing, the queen
//   - the STAGE CARD (number, name, what is new, drawn with its points, a hint), the TALLY (lines counting up), SHIP
//     LOST / SHIP CAPTURED, the result card with the hit ratio; FREE RIDE on the mercy credit.
// No strobes: blinks are 1-2 Hz; a hit is a 0.1 s white silhouette; the queen's last blast is one stepped flash.
import { roundEven, PixelFont, SurfaceDraw, d6 } from '../../sdk/index.js';
import { SwarmPatrolPalette, SwarmPatrolSpec } from './spec.js';
import { SwarmPatrolRound } from './round.js';
import { StageKind } from './stages.js';
import { HiveQueen } from './queen.js';
import {
    Ship, CaptiveShip, Pennant, PennantGold, spriteFor, Drone, Escort, Boss, Splitter, Mite, Shell, Stinger,
    QueenBody, QueenBodyCharged, EyeShut, EyeOpen, EyeHalf, WingL, WingR, WingLBroken, WingRBroken,
} from './sprites.js';

const Phase = SwarmPatrolRound.Phase, AMode = SwarmPatrolRound.AlienMode;
const FX = 8, FY = 30, FW = 304, FH = 187;      // the field clip: y 30..216
const ShipY = Math.trunc(SwarmPatrolRound.ShipY);
const ShowSprites = [Drone[0], Escort[0], Boss[0], Splitter[0], Mite[0], Shell[0], Stinger[0]];

function R(v) { return Math.trunc(roundEven(v)); }

// deterministic 32-bit hash (xxhash-lite), matching Hash(uint) in the C#
function hash(x) {
    x = x >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
}

export class SwarmPatrolRenderer {
    constructor() {
        const pal = SwarmPatrolPalette;
        this.cBg = pal.get('bg'); this.cViolet = pal.get('violet'); this.cVioletDim = pal.get('violetDim');
        this.cPink = pal.get('pink'); this.cPinkDim = pal.get('pinkDim'); this.cWhite = pal.get('white');
        this.cCyan = pal.get('cyan'); this.cCyanDim = pal.get('cyanDim');
        this.cGold = pal.get('gold'); this.cGoldDim = pal.get('goldDim'); this.cSteel = pal.get('steel'); this.cSteelDim = pal.get('steelDim');
        this.named = { white: this.cWhite, gold: this.cGold, cyan: this.cCyan, pink: this.cPink, violet: this.cViolet };
        this.ox = 0; this.oy = 0;
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null) return;
        const P = r.p;
        const st = r.time;

        // the shake: a whole-pixel jolt of the field, a new one 30 times a second, from the time (never a die)
        this.ox = 0; this.oy = 0;
        if (r.shake > 0.3) {
            const h = hash(Math.trunc(st * 30) * 7919 + 13), a = Math.min(3, Math.ceil(r.shake));
            this.ox = (h % (2 * a + 1)) - a; this.oy = ((h >>> 8) % (2 * a + 1)) - a;
        }
        const ox = this.ox, oy = this.oy;

        s.clip(FX, FY, FW, FH);
        this._drawStars(s, st);

        // the tractor beams and the queen's sting beams go under everything
        for (const a of r.aliens)
            if (a.visible && a.mode === AMode.Beam && a.beamOpen > 0) this._drawBeam(s, a, st);
        const q = r.queen;
        if (q) this._drawQueenBeams(s, r, q, st);
        if (q && !q.gone) this._drawQueen(s, r, q, st);

        // the swarm: the formation flaps in unison at 1.25 Hz
        const frame = Math.trunc(r.formationTime * 2.5) & 1;
        for (const a of r.aliens) {
            if (!a.visible) continue;
            const spr = spriteFor(a, a.mode === AMode.Fall ? Math.trunc(a.t * 6) & 1 : frame);
            let x = R(a.x) + ox, y = R(a.y) + oy;
            if (a.mode === AMode.Prime) {                    // a stinger shivers in its slot; its line drops ahead of it
                x += (Math.trunc(a.t * 16) & 1) ? 1 : -1;
                const k = Math.trunc(a.t * 12);
                for (let d = 12 + (k % 2) * 3; d < 12 + Math.trunc(48 * Math.min(1, a.t / 0.5)); d += 6) s.rect(x - 1, y + d, 2, 2, this.cGold);
            }
            if (a.flash > 0) s.blitTinted(spr, x - Math.trunc(spr.width / 2), y - Math.trunc(spr.height / 2), this.cWhite);
            else s.blit(spr, x - Math.trunc(spr.width / 2), y - Math.trunc(spr.height / 2), SwarmPatrolPalette);
            if (a.carrying && !(r.captured && r.captorId === a.id && P === Phase.ShipLost && r.phaseTime < 1.4))
                s.blit(CaptiveShip, x - 8, R(a.y - SwarmPatrolRound.CaptiveRise) + oy - 6, SwarmPatrolPalette);
        }

        // bolts and shots
        for (const b of r.enemyShots) {                    // bolts: 2x6, pink with a white core
            const x = R(b.x) + ox, y = R(b.y) + oy;
            s.rect(x - 1, y - 3, 2, 6, this.cPink);
            s.rect(x - 1, y - 1, 2, 2, this.cWhite);
        }
        for (const p of r.playerShots) {                   // shots: 2x6, white with a cyan tip
            const x = R(p.x) + ox, y = R(p.y) + oy;
            s.rect(x - 1, y - 3, 2, 6, this.cWhite);
            s.rect(x - 1, y - 4, 2, 1, this.cCyan);
        }

        // the ship (or two), the freed ship coming down, the captured ship going up
        const showShip = r.playerAlive && P !== Phase.Card && P !== Phase.Over && P !== Phase.Finale;
        if (showShip) for (const x of r.shipXs) s.blit(Ship, R(x) - 8 + ox, ShipY - 6 + oy, SwarmPatrolPalette);
        if (r.rescue) this._drawRescue(s, r);
        if (r.captured && P === Phase.ShipLost) this._drawCapturedShip(s, r);

        for (const b of r.bursts) this._drawBurst(s, b);
        for (const o of r.pops) {
            const c = this.named[o.c] || this.cWhite;
            const y = R(o.y - Math.min(12, o.t * 16)) + oy;
            if (o.t > o.life - 0.2 && (Math.trunc(o.t * 10) & 1)) continue;      // the last fifth of a second it thins out
            s.textCentered(o.text, R(o.x) + ox, y, PixelFont.Arcade, c);
        }
        if (r.flash > 0.05) this._drawFlash(s, r.flash);
        s.noClip();

        this._drawHud(s, r, t);
        this._drawOverlays(s, r, t);
    }

    _drawStars(s, st) {
        for (let i = 0; i < 44; i++) {
            const h = hash((i * 2654435761 + 12345) >>> 0);
            const x = FX + 2 + (h % (FW - 4));
            const speed = 10 + ((h >>> 8) % 3) * 8;
            const y0 = (h >>> 12) % FH;
            const y = FY + Math.trunc((y0 + st * speed) % FH);
            const kind = (h >>> 20) % 7;
            const c = kind < 3 ? this.cVioletDim : kind < 5 ? this.cPinkDim : kind === 5 ? this.cCyanDim : this.cViolet;
            if (kind === 6 && !SurfaceDraw.blink(st + (h % 97) / 97, 0.5)) continue;   // a slow twinkle, 0.5 Hz
            s.setPixel(x, y, c);
        }
    }

    _drawBeam(s, a, st) {
        const top = R(a.y) + 5 + this.oy, bottom = ShipY + 6 + this.oy;
        const cx = R(a.x) + this.ox;
        const scroll = Math.trunc(st * 10);                 // bands slide down: < 3 Hz at any pixel
        for (let y = top; y <= bottom; y++) {
            if ((y & 1) === 1) continue;                    // scanned, so the ship still reads through it
            const f = (y - top) / Math.max(1, bottom - top);
            const half = R((2 + f * (SwarmPatrolRound.BeamHalfMax - 2)) * a.beamOpen);
            if (half < 1) continue;
            const band = (Math.trunc(((y - top) - scroll) / 4) % 3 + 3) % 3;
            const c = band === 0 ? this.cViolet : band === 1 ? this.cPink : this.cVioletDim;
            s.rect(cx - half, y, half * 2 + 1, 1, c);
        }
    }

    _drawCapturedShip(s, r) {
        const boss = r.findAlien(r.captorId);
        if (boss == null || !boss.visible) return;
        const k = Math.min(1, r.phaseTime / 1.4);
        if (k >= 1) return;                                 // taken aboard
        const x = r.capturedFromX + (boss.x - r.capturedFromX) * k;
        const y = SwarmPatrolRound.ShipY + (boss.y - SwarmPatrolRound.CaptiveRise - SwarmPatrolRound.ShipY) * k;
        s.blitTinted(Ship, R(x) - 8 + this.ox, R(y) - 6 + this.oy, k < 0.5 ? this.cCyan : this.cPink);
    }

    // the freed ship tumbles down to dock: it rocks a pixel either way, two cyan sparks circle it
    _drawRescue(s, r) {
        const q = r.rescue, x = R(q.x) + this.ox + (Math.trunc(q.t * 6) & 1), y = R(q.y) + this.oy;
        s.blit(Ship, x - 8, y - 6, SwarmPatrolPalette);
        for (let k = 0; k < 2; k++) {
            const a = q.t * 5 + k * Math.PI;
            s.rect(x + R(Math.cos(a) * 12) - 1, y + R(Math.sin(a) * 6) - 1, 2, 2, k ? this.cCyan : this.cWhite);
        }
    }

    // ------------------------------------------------------------------ THE HIVE QUEEN
    _drawQueen(s, r, q, st) {
        let x = R(q.x) + this.ox, y = R(q.y) + this.oy;
        if (q.dying) { const h = hash(Math.trunc(q.deathT * 24) + 99); x += (h % 3) - 1; y += ((h >>> 4) % 3) - 1; }
        const flap = (Math.trunc(r.formationTime * 2.5) & 1) ? -1 : 0;
        const wl = q.wings[0], wr = q.wings[1];
        const wingL = wl.broken ? WingLBroken : WingL, wingR = wr.broken ? WingRBroken : WingR;
        if (wl.flash > 0) s.blitTinted(wingL, x - 35, y - 12 + flap, this.cWhite); else s.blit(wingL, x - 35, y - 12 + flap, SwarmPatrolPalette);
        if (wr.flash > 0) s.blitTinted(wingR, x + 9, y - 12 + flap, this.cWhite); else s.blit(wingR, x + 9, y - 12 + flap, SwarmPatrolPalette);
        s.blit(q.charged ? QueenBodyCharged : QueenBody, x - 11, y - 17, SwarmPatrolPalette);
        const eye = q.eye < 0.3 ? EyeShut : q.eye < 0.75 ? EyeHalf : EyeOpen;
        if (q.coreFlash > 0 || q.armourFlash > 0) s.blitTinted(eye, x - 5, y + 2, q.coreFlash > 0 ? this.cWhite : this.cSteel);
        else s.blit(eye, x - 5, y + 2, SwarmPatrolPalette);
        if (q.hatching) {                                    // the abdomen swells: dots gather at its tip
            const k = Math.min(1, q.atk.t / 0.5);
            for (let i = 0; i < 4; i++) {
                const a = i * (Math.PI / 2) + st * 3;
                s.rect(x + R(Math.cos(a) * (9 - 6 * k)) - 1, y + 19 + R(Math.sin(a) * (4 - 2 * k)), 2, 2, i & 1 ? this.cPink : this.cWhite);
            }
        }
    }

    // a sting beam: telegraphed by a dotted line from her to a bracket on the lane, then a lash of light along it
    _drawQueenBeams(s, r, q, st) {
        const ox = this.ox, oy = this.oy;
        if (q.atk && q.atk.name === 'strike' && q.atk.stage === 0) {
            const qx = R(q.x) + ox, qy = R(q.y) + 18 + oy, k = q.atk.t / HiveQueen.StrikeTele;
            for (const bx0 of q.atk.xs) {
                const bx = R(bx0) + ox, by = ShipY + 6 + oy, n = 24, scroll = Math.trunc(st * 20) % 3;
                for (let i = scroll; i <= n; i += 3) {
                    const u = i / n;
                    s.rect(R(qx + (bx - qx) * u), R(qy + (by - qy) * u), 1, 2, k > 0.6 ? this.cPink : this.cPinkDim);
                }
                const w = 9 - Math.trunc(3 * k);             // the bracket closes in as the strike comes
                const c = k > 0.6 ? this.cWhite : this.cPink;
                s.rect(bx - w, by - 12, 3, 1, c); s.rect(bx - w, by - 12, 1, 12, c); s.rect(bx - w, by - 1, 3, 1, c);
                s.rect(bx + w - 2, by - 12, 3, 1, c); s.rect(bx + w, by - 12, 1, 12, c); s.rect(bx + w - 2, by - 1, 3, 1, c);
            }
        }
        for (const b of q.beams) {
            const x0 = R(b.ox) + ox, y0 = R(b.oy) + oy, x1 = R(b.x) + ox, y1 = ShipY + 8 + oy;
            const fade = b.t > 0.6;
            for (let y = y0; y <= y1; y++) {
                const u = (y - y0) / Math.max(1, y1 - y0);
                const cx = R(x0 + (x1 - x0) * u), half = 1 + R(u * HiveQueen.StrikeHalf);
                s.rect(cx - half, y, half * 2 + 1, 1, fade ? this.cVioletDim : this.cViolet);
                if (half > 1) s.rect(cx - half + 1, y, half * 2 - 1, 1, fade ? this.cPinkDim : this.cPink);
                if (!fade) s.rect(cx - 1, y, 2, 1, this.cWhite);
            }
        }
    }

    _drawBurst(s, b) {
        const x = R(b.x) + this.ox, y = R(b.y) + this.oy;
        const t = b.t;
        if (b.kind === 1 || b.kind === 4) {                 // a dent: four sparks (white/pink on a boss, steel off armour)
            const d = 5 + Math.trunc(t * 28);
            const a = b.kind === 4 ? this.cSteel : this.cWhite, c = b.kind === 4 ? this.cWhite : this.cPink;
            s.rect(x - d, y - 1, 2, 2, a); s.rect(x + d - 1, y - 1, 2, 2, a);
            s.rect(x - 1, y - d, 2, 2, c); s.rect(x - 1, y + d - 1, 2, 2, c);
            return;
        }
        if (b.kind === 2) {                                 // the ship
            if (t < 0.15) { s.rect(x - 8, y - 6, 17, 13, this.cWhite); s.rect(x - 5, y - 3, 11, 7, this.cCyan); return; }
            const rad = 6 + Math.trunc(Math.min(t, 1.0) * 28);
            const late = t > 1.0;
            for (let k = 0; k < 14; k++) {
                const a = k * (Math.PI * 2 / 14) + 0.2;
                const m = rad * (0.55 + (k % 3) * 0.22);
                const bx = x + Math.trunc(Math.cos(a) * m), by = y + Math.trunc(Math.sin(a) * m * 0.8);
                const c = late ? (k % 2 === 0 ? this.cCyanDim : this.cPinkDim) : (k % 3 === 0 ? this.cWhite : k % 3 === 1 ? this.cCyan : this.cPink);
                s.rect(bx - 1, by - 1, 3, 3, c);
            }
            if (t < 0.6) s.rect(x - 3, y - 3, 6, 6, this.cPink);
            return;
        }
        if (b.kind === 7) {                                 // a mite pops: a small white star
            const d = 2 + Math.trunc(t * 20);
            s.rect(x - 1, y - 1, 2, 2, t < 0.12 ? this.cWhite : this.cPinkDim);
            s.rect(x - d, y, 2, 1, this.cPink); s.rect(x + d - 1, y, 2, 1, this.cPink);
            s.rect(x, y - d, 1, 2, this.cPink); s.rect(x, y + d - 1, 1, 2, this.cPink);
            return;
        }
        if (b.kind === 6) {                                 // the queen's last blast: rings, then embers
            for (let ring = 0; ring < 3; ring++) {
                const rt = t - ring * 0.18;
                if (rt <= 0 || rt > 1.1) continue;
                const rad = Math.trunc(6 + rt * 70);
                const c = rt < 0.3 ? this.cWhite : rt < 0.6 ? this.cGold : rt < 0.85 ? this.cPink : this.cPinkDim;
                for (let k = 0; k < 24; k++) {
                    const a = k * (Math.PI / 12) + ring * 0.4;
                    s.rect(x + R(Math.cos(a) * rad) - 1, y + R(Math.sin(a) * rad * 0.7) - 1, 3, 2, c);
                }
            }
            this._debris(s, b, x, y, 20, 90, t);
            return;
        }
        // an alien (kind 0), a boss (kind 3) or a broken wing (kind 5)
        const scale = b.kind === 5 ? 2.4 : b.kind === 3 ? 1.8 : 1.35;
        if (t < 0.08) {
            s.rect(x - 3, y - 3, 7, 7, this.cWhite);
            s.rect(x - 8, y - 1, 3, 2, this.cPink); s.rect(x + 6, y - 1, 3, 2, this.cPink);
            s.rect(x - 1, y - 8, 2, 3, this.cPink); s.rect(x - 1, y + 6, 2, 3, this.cPink);
            return;
        }
        const radius = Math.trunc((3 + t * 26) * scale);
        const dim = t > 0.3;
        for (let k = 0; k < 8; k++) {
            const a = k * (Math.PI / 4) + 0.39;
            const bx = x + R(Math.cos(a) * radius), by = y + R(Math.sin(a) * radius);
            const c = dim ? (k % 2 === 0 ? this.cPinkDim : this.cVioletDim) : (k % 2 === 0 ? this.cPink : this.cViolet);
            s.rect(bx - 1, by - 1, 3, 3, c);
        }
        if (t < 0.18) s.rect(x - 2, y - 2, 4, 4, this.cWhite);
        this._debris(s, b, x, y, b.kind === 0 ? 5 : 9, b.kind === 0 ? 60 : 85, t);
    }

    // shards thrown from a burst: each one's angle and speed hashed from the burst id, falling a little
    _debris(s, b, x, y, n, speed, t) {
        for (let k = 0; k < n; k++) {
            const h = hash(b.id * 131 + k * 7 + 1);
            const a = (h % 628) / 100, v = speed * (0.4 + ((h >>> 10) % 60) / 100);
            const px = x + R(Math.cos(a) * v * t), py = y + R(Math.sin(a) * v * t + 70 * t * t);
            const c = t < 0.15 ? this.cWhite : t < 0.3 ? ((h >>> 20) & 1 ? this.cGold : this.cPink) : (h >>> 21) & 1 ? this.cPinkDim : this.cVioletDim;
            s.setPixel(px, py, c);
            if (t < 0.25) s.setPixel(px + 1, py, c);
        }
    }

    // one stepped flash (the queen's end): a white checker, then violet, then gone; never a blend, never repeated
    _drawFlash(s, f) {
        const c = f > 0.6 ? this.cWhite : f > 0.3 ? this.cViolet : this.cVioletDim;
        s.checker(FX, FY, FW, FH, c, 0);
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 10, 13, arc, this.cPink);
        s.text(d6(r.score), 32, 10, dsp, this.cWhite, 2);
        const w = String(r.stage);
        const wx = 311 - dsp.measure(w, 2);
        s.text(w, wx, 10, dsp, r.def.kind === StageKind.Queen ? this.cGold : this.cWhite, 2);
        s.textRight('STAGE', wx - 5, 13, arc, this.cViolet);
        s.dottedRule(8, 312, 27, 3, this.cVioletDim);

        // the queen's life: a gold strip along the top of the field while she lives
        const q = r.queen;
        if (q && !q.dead) {
            const total = q.wings[0].max + q.wings[1].max + q.coreMax;
            const left = Math.max(0, q.wings[0].hp) + Math.max(0, q.wings[1].hp) + Math.max(0, q.coreHp);
            const w2 = Math.round(120 * left / total);
            s.text('QUEEN', 96, 31, PixelFont.Small, this.cGold);
            s.rect(118, 32, 120, 3, this.cGoldDim);
            s.rect(118, 32, w2, 3, this.cGold);
        }

        // bottom band: reserve ships, then the stage pennants
        s.dottedRule(8, 312, 218, 3, this.cVioletDim);
        const reserve = Math.max(0, r.lives - 1);           // the ships not in play
        for (let i = 0; i < reserve && i < 5; i++) s.blit(Ship, 10 + i * 19, 220, SwarmPatrolPalette);
        const ck = r.clearedKinds;
        for (let i = 0; i < ck.length && i < 8; i++) s.blit(ck[i] === StageKind.Challenge ? PennantGold : Pennant, 306 - (ck.length - 1 - i) * 8, 222, SwarmPatrolPalette);
        if (r.extraFlash > 0 && SurfaceDraw.blink(r.extraFlash, 2)) s.textCentered('EXTRA SHIP', 160, 223, arc, this.cCyan);
        else if (r.mercyActive) s.textCentered('SHIELD ON', 160, 223, arc, this.cCyan);
    }

    // ------------------------------------------------------------------ overlays
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const spec = SwarmPatrolSpec;
        switch (r.p) {
            case Phase.StageCard: this._drawStageCard(s, r, t); break;

            case Phase.Ready:
                s.textCenteredShadow('READY', 160, 150, dsp, this.cPink, this.cVioletDim, 2);
                break;

            case Phase.ShipLost:
                if (r.phaseTime >= (r.captured ? 1.3 : 0.6))
                    s.textBox(r.captured ? 'SHIP CAPTURED' : 'SHIP LOST', 160, 150, dsp, 2, this.cWhite, r.captured ? this.cViolet : this.cPink, this.cBg);
                break;

            case Phase.Tally: this._drawTally(s, r); break;

            case Phase.Finale:
                if (r.phaseTime >= SwarmPatrolRound.FinaleBlast + 0.3) {
                    s.textBox('THE HIVE IS BROKEN', 160, 100, dsp, 2, this.cGold, this.cPink, this.cBg);
                    s.textCenteredShadow('QUEEN BONUS 20000', 160, 130, arc, this.cWhite, this.cBg);
                }
                break;

            case Phase.Card:
            case Phase.Over: {
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, 160, 56, dsp, 3, won ? this.cGold : this.cPink, this.cViolet, this.cBg);
                s.plate(160 - 104, 94, 208, 88, this.cBg, this.cViolet);
                s.textCentered('SCORE ' + d6(r.score), 160, 102, arc, this.cWhite, 2);
                s.textCentered(won ? 'ALL 8 STAGES' : 'STAGE ' + r.stage + ' OF 8', 160, 124, dsp, won ? this.cCyan : this.cPink, 2);
                const pct = r.shotsFired > 0 ? Math.trunc(r.shotsHit * 1000 / r.shotsFired) : 0;
                s.textCentered('SHOTS ' + r.shotsFired + '   HITS ' + r.shotsHit, 160, 148, arc, this.cViolet);
                s.textCentered('HIT RATIO ' + Math.trunc(pct / 10) + '.' + (pct % 10) + '%', 160, 162, arc, this.cGold);
                break;
            }
        }
    }

    _drawStageCard(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, def = r.def;
        const ch = def.kind === StageKind.Challenge, qn = def.kind === StageKind.Queen;
        s.textCenteredShadow('STAGE ' + r.stage, 160, 44, dsp, this.cPink, this.cVioletDim, 3);
        s.textCenteredShadow(def.name, 160, 74, dsp, ch || qn ? this.cGold : this.cWhite, this.cVioletDim, 2);
        let y = 98;
        if (def.show.length > 0) {
            s.text('NEW', 34, y + 2, arc, this.cGold);
            for (const [kind, label, pts] of def.show) {
                const spr = ShowSprites[kind];
                s.blit(spr, 64 - Math.trunc(spr.width / 2), y + 5 - Math.trunc(spr.height / 2), SwarmPatrolPalette);
                s.text(label, 82, y + 2, arc, this.cWhite);
                s.textRight(pts, 288, y + 2, arc, this.cCyan);
                y += 18;
            }
        } else if (ch) {
            s.textCentered('5 FLIGHTS OF 8', 160, y + 2, arc, this.cWhite);
            s.textCentered('100 A HIT    PERFECT 10000', 160, y + 18, arc, this.cCyan);
            y += 36;
        } else if (qn) {                                     // a small picture of her
            s.blit(WingL, 160 - 35, y - 4, SwarmPatrolPalette); s.blit(WingR, 160 + 9, y - 4, SwarmPatrolPalette);
            s.blit(QueenBody, 149, y - 9, SwarmPatrolPalette); s.blit(EyeShut, 155, y + 10, SwarmPatrolPalette);
            y += 34;
        }
        const hy = Math.max(y + 6, 146);
        s.textCenteredShadow(def.hint, 160, hy, arc, this.cCyan, this.cBg);
        if (r.stage === 1) s.textCentered('STICK SLIDES   A FIRES', 160, hy + 13, arc, this.cViolet);
        if (r.mercyActive) s.textCenteredShadow('FREE RIDE  SHIELD ON', 160, 182, arc, this.cCyan, this.cBg);
        else if (r.stage === 1 && SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', R(r.playerX), ShipY - 22, arc, this.cCyan, this.cBg);
    }

    _drawTally(s, r) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, T = r.tally;
        if (!T) return;
        s.textBox(T.challenge ? 'CHALLENGE OVER' : 'STAGE ' + r.stage + ' CLEAR', 160, 58, dsp, 2, this.cWhite, T.challenge ? this.cGold : this.cPink, this.cBg);
        s.plate(48, 82, 224, 18 + T.lines.length * 16, this.cBg, this.cVioletDim);
        for (let i = 0; i < T.shown; i++) {
            const L = T.lines[i], y = 92 + i * 16;
            const since = r.phaseTime - (SwarmPatrolRound.TallyFirst + i * SwarmPatrolRound.TallyStep);
            let text = L.text;
            if (L.bonus > 0 && since < 0.4) text = String(Math.trunc(L.bonus * Math.max(0, since) / 0.4));     // counting up
            const c = L.perfect ? this.cGold : L.bonus > 0 ? this.cCyan : this.cWhite;
            s.text(L.label, 58, y, arc, L.perfect ? this.cGold : this.cViolet);
            s.textRight(text, 262, y, arc, c);
        }
        const last = r.stage + 1 <= 8 ? SwarmPatrolRound.Stages[r.stage] : null;
        if (last && T.shown >= T.lines.length)
            s.textCenteredShadow('NEXT  ' + (last.kind === StageKind.Queen ? 'THE HIVE QUEEN' : 'STAGE ' + last.n), 160, 166, arc, this.cPink, this.cBg);
    }
}
