// THE NODE · world 1 · SWARM PATROL on the Cabinet Engine · THE PICTURE.
// Port of SwarmPatrolRenderer.cs from Staging/Batch1/swarmpatrol.
//
// A 1981 formation shooter on a landscape tube, palette-limited (black, violet, hot pink, white,
// cyan for the player, and one darker step of violet / pink / cyan for fades and the starfield):
//   - HUD band y 8..27: 1UP + the score in display digits at scale 2 (top-left), WAVE n (top-right)
//   - the field y 30..216, clipped: a slow starfield, the swarm (14x12 drones, 16x12 escorts,
//     16x14 bosses, two wing frames at 1.25 Hz) in ranks over the upper 40% of the field, 2x6
//     bolts, the 16x12 ship, the tractor beam (bands that scroll, never flash)
//   - bottom band: reserve ships (bottom-left), a pennant per wave cleared (bottom-right)
//   - bursts step through white -> pink/violet -> the dim entries, never a blend
//   - countdown in display digits at scale 5; SHIP LOST / WAVE CLEAR / ROUND WON / GAME OVER on
//     double-framed plates; FREE RIDE on the mercy credit; a YOU tag over the ship on wave 1
import { roundEven, PixelFont, SurfaceDraw, d6 } from '../../sdk/index.js';
import { SwarmPatrolPalette, SwarmPatrolSpec } from './spec.js';
import { SwarmPatrolRound } from './round.js';
import { Ship, Pennant, spriteFor } from './sprites.js';

const Phase = SwarmPatrolRound.Phase;
const FX = 8, FY = 30, FW = 304, FH = 187;      // the field clip: y 30..216

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
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null) return;
        const P = r.p;
        const st = r.time;

        s.clip(FX, FY, FW, FH);
        this._drawStars(s, st);

        // the tractor beams go under everything
        for (const a of r.aliens)
            if (a.visible && a.mode === SwarmPatrolRound.AlienMode.Beam && a.beamOpen > 0) this._drawBeam(s, a, st);

        // the swarm: the formation flaps in unison at 1.25 Hz
        const frame = Math.trunc(r.formationTime * 2.5) & 1;
        for (const a of r.aliens) {
            if (!a.visible) continue;
            const spr = spriteFor(a, frame);
            s.blit(spr, R(a.x) - Math.trunc(spr.width / 2), R(a.y) - Math.trunc(spr.height / 2), SwarmPatrolPalette);
        }

        // bolts and shots
        for (const b of r.enemyShots) {                    // bolts: 2x6, pink with a white core
            const x = R(b.x), y = R(b.y);
            s.rect(x - 1, y - 3, 2, 6, this.cPink);
            s.rect(x - 1, y - 1, 2, 2, this.cWhite);
        }
        for (const p of r.playerShots) {                   // shots: 2x6, white with a cyan tip
            const x = R(p.x), y = R(p.y);
            s.rect(x - 1, y - 3, 2, 6, this.cWhite);
            s.rect(x - 1, y - 4, 2, 1, this.cCyan);
        }

        // the ship
        const showShip = r.playerAlive && P !== Phase.Card && P !== Phase.Over;
        if (showShip) s.blit(Ship, R(r.playerX) - Math.trunc(Ship.width / 2), Math.trunc(SwarmPatrolRound.ShipY) - Math.trunc(Ship.height / 2), SwarmPatrolPalette);
        if (r.captured && P === Phase.ShipLost) this._drawCapturedShip(s, r);

        for (const b of r.bursts) this._drawBurst(s, b);
        s.noClip();

        this._drawHud(s, r);
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
        const top = R(a.y) + 5, bottom = Math.trunc(SwarmPatrolRound.ShipY) + 6;
        const cx = R(a.x);
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
        const y = SwarmPatrolRound.ShipY + (boss.y + 12 - SwarmPatrolRound.ShipY) * k;
        s.blitTinted(Ship, R(x) - Math.trunc(Ship.width / 2), R(y) - Math.trunc(Ship.height / 2), k < 0.5 ? this.cCyan : this.cPink);
    }

    _drawBurst(s, b) {
        const x = R(b.x), y = R(b.y);
        const t = b.t;
        if (b.kind === 1) {                                 // a dent in a boss: four white sparks
            const d = 5 + Math.trunc(t * 28);
            s.rect(x - d, y - 1, 2, 2, this.cWhite); s.rect(x + d - 1, y - 1, 2, 2, this.cWhite);
            s.rect(x - 1, y - d, 2, 2, this.cPink); s.rect(x - 1, y + d - 1, 2, 2, this.cPink);
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
        // an alien (kind 0) or a boss (kind 3)
        const scale = b.kind === 3 ? 1.8 : 1.35;
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
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 10, 13, arc, this.cPink);
        s.text(d6(r.score), 32, 10, dsp, this.cWhite, 2);
        const w = String(r.wave);
        const wx = 311 - dsp.measure(w, 2);
        s.text(w, wx, 10, dsp, this.cWhite, 2);
        s.textRight('WAVE', wx - 5, 13, arc, this.cViolet);
        s.dottedRule(8, 312, 27, 3, this.cVioletDim);

        // bottom band: reserve ships, then the wave pennants
        s.dottedRule(8, 312, 218, 3, this.cVioletDim);
        const reserve = Math.max(0, r.lives - 1);           // the ships not in play
        for (let i = 0; i < reserve && i < 6; i++) s.blit(Ship, 10 + i * 19, 220, SwarmPatrolPalette);
        for (let i = 0; i < r.wavesCleared && i < SwarmPatrolRound.Waves; i++) s.blit(Pennant, 306 - i * 8, 222, SwarmPatrolPalette);
        if (r.mercyActive) s.textCentered('SHIELD ON', 160, 223, arc, this.cCyan);
    }

    // ------------------------------------------------------------------ overlays
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const spec = SwarmPatrolSpec;
        switch (r.p) {
            case Phase.WaveIntro:
                if (r.wave === 1) {
                    s.textCenteredShadow('WAVE 1', 160, 70, dsp, this.cPink, this.cVioletDim, 3);
                    const n = r.countdownLeft > 0 ? String(r.countdownLeft) : 'GO';
                    s.textCenteredShadow(n, 160, 104, dsp, this.cWhite, this.cVioletDim, 5);
                    if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', R(r.playerX), Math.trunc(SwarmPatrolRound.ShipY) - 22, arc, this.cCyan, this.cBg);
                } else {
                    s.textCenteredShadow('WAVE ' + r.wave, 160, 96, dsp, this.cPink, this.cVioletDim, 3);
                    s.textCentered(r.wave === SwarmPatrolRound.Waves ? 'FINAL WAVE' : 'GET READY', 160, 128, arc, this.cWhite);
                }
                if (r.mercyActive) s.textCenteredShadow('FREE RIDE  SHIELD ON', 160, 160, arc, this.cCyan, this.cBg);
                break;

            case Phase.Ready:
                s.textCenteredShadow('READY', 160, 128, dsp, this.cPink, this.cVioletDim, 2);
                break;

            case Phase.ShipLost:
                if (r.phaseTime >= (r.captured ? 1.3 : 0.6))
                    s.textBox(r.captured ? 'SHIP CAPTURED' : 'SHIP LOST', 160, 150, dsp, 2, this.cWhite, r.captured ? this.cViolet : this.cPink, this.cBg);
                break;

            case Phase.WaveClear:
                s.textBox('WAVE ' + r.wave + ' CLEAR', 160, 112, dsp, 2, this.cWhite, this.cPink, this.cBg);
                s.textCenteredShadow(r.wave < SwarmPatrolRound.Waves ? 'NEXT  WAVE ' + (r.wave + 1) : 'THE SWARM IS BROKEN', 160, 138, arc, this.cViolet, this.cBg);
                break;

            case Phase.Card:
            case Phase.Over: {
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, 160, 84, dsp, 3, won ? this.cCyan : this.cPink, this.cViolet, this.cBg);
                s.plate(160 - 92, 118, 184, 50, this.cBg, this.cViolet);
                s.textCentered('SCORE ' + d6(r.score), 160, 124, arc, this.cWhite, 2);
                s.textCentered('WAVES ' + r.wavesCleared + '/' + SwarmPatrolRound.Waves, 160, 146, dsp, won ? this.cCyan : this.cPink, 2);
                break;
            }
        }
    }
}
