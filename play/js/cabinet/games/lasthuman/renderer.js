// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE PICTURE.
// Began as the port of LastHumanRenderer.cs; built out 2026-10-18 with the seven waves.
//
// 1983 style: a black floor, chunky sprites authored in DOUBLE-WIDE pixels, a hazard-red arena rail.
//   - HUD band y 8..27: 1UP + score in display digits (x2), WAVE n + the wave's burst pips (on the last
//     wave the mainframe's CORE bar), humans saved (yellow) and men left (cyan), a red dotted rule
//   - the floor 296x192 at (12, 34), a faint dot grid every tile, a two-tone red rail around it
//   - the WAVE CARD: the wave's number and name, the new machine drawn big, two hint lines
//   - machines WARP IN as stretched scanlines that pull together (dim silver -> silver -> solid)
//   - TELEGRAPHS: a mite stream's edge glows red before it pours in; a hatcher swells before it hatches;
//     a roller's turret and a gun pod's barrel light up before they fire; the core's seam glows before
//     the shutters part; a cortex draws a violet thread to the human it is turning
//   - the man faces where he walks; a white gun-arm shows the way A fires (yellow while B locks it)
//   - rescue: a yellow beam and the points (1000 x chain) float up; machines burst into bits; a lost
//     man scatters cyan, then MAN DOWN on a double-framed plate; a crushed human leaves a skull
//   - the TALLY after each wave counts its bonuses in, a row at a time
//   - a little screen shake inside the rail for big hits (the rail and the HUD never move)
// Nothing strobes: the blinks are 1 Hz (YOU, the core bar) and the twinkles (sparks, pylons, a turning
// human) are shape changes at 2.5 Hz or slower; a hit is one white frame or two.
import { PixelFont, SurfaceDraw, d6 } from '../../sdk/index.js';
import { LastHumanPalette, LastHumanSpec } from './spec.js';
import { LastHumanRound, MachineKind, ShotKind, FxKind, Shutter, Dir8 } from './round.js';
import { WAVES, FeatureName } from './waves.js';
import * as Sprites from './sprites.js';

const OX = 12, OY = 34;
const AW = LastHumanRound.AW, AH = LastHumanRound.AH;
const Phase = LastHumanRound.Phase;
const HW = LastHumanRound.BossHW, HH = LastHumanRound.BossHH;

export class LastHumanRenderer {
    constructor() {
        const pal = LastHumanPalette;
        this.pal = pal;
        this.cBg = pal.get('bg'); this.cFloor = pal.get('floor');
        this.cSilverDk = pal.get('silverDk'); this.cSilver = pal.get('silver'); this.cSilverHi = pal.get('silverHi');
        this.cRedDk = pal.get('redDk'); this.cRed = pal.get('red');
        this.cYellowDk = pal.get('yellowDk'); this.cYellow = pal.get('yellow');
        this.cCyanDk = pal.get('cyanDk'); this.cCyan = pal.get('cyan');
        this.cVioletDk = pal.get('violetDk'); this.cViolet = pal.get('violet');
        this.cOrange = pal.get('orange');
        this.ox = OX; this.oy = OY;
    }

    draw(sim, s, t) {
        const r = sim instanceof LastHumanRound ? sim : null;
        s.noClip();
        s.clear(this.cBg);
        if (!r) return;
        const P = r.p;
        // the shake moves the floor's contents, never the rail or the HUD
        const sh = Math.min(3, r.shake);
        this.ox = OX + (sh > 0.3 ? Math.round(Math.sin(r.time * 71) * sh) : 0);
        this.oy = OY + (sh > 0.3 ? Math.round(Math.cos(r.time * 59) * sh) : 0);
        const ox = this.ox, oy = this.oy;

        s.clip(OX, OY, AW, AH);

        // ---- the floor: a faint dot every tile
        for (let y = 8; y < AH; y += 16)
            for (let x = 8; x < AW; x += 16) s.setPixel(ox + x, oy + y, this.cFloor);

        // ---- the mainframe
        if (r.boss != null && !r.boss.gone) this.drawBoss(s, r, r.boss, t);

        // ---- pylons (under everything that walks)
        for (const m of r.machines) {
            if (m.dead || m.kind !== MachineKind.Pylon) continue;
            const set = Sprites.Pylon[m.look % Sprites.Pylon.length];
            this.sprite(s, set[Math.trunc(m.anim * 2.5) & 1], m.x, m.y, false);
        }

        // ---- humans (one being turned: the cortex's violet thread, and a slow flicker to the husk shape)
        for (const c of r.humans) {
            if (!c.free) continue;
            const set = c.look === 0 ? Sprites.Man : Sprites.Woman;
            if (c.conv > 0) {
                if (c.by != null) this.thread(s, c.by.x, c.by.y, c.x, c.y, t);
                const husk = (Math.trunc(c.conv * 2.5) & 1) === 0;
                this.sprite(s, husk ? Sprites.Husk[0] : set[0], c.x, c.y, false);
                continue;
            }
            const walking = c.hx !== 0 || c.hy !== 0;
            const fr = walking && P === Phase.Play ? (Math.trunc(c.anim * 4) & 1) : 0;
            this.sprite(s, set[fr], c.x, c.y, c.hx < 0);
        }

        // ---- machines (warping ones as stretched scanlines; a hit is a white frame)
        const animOn = P === Phase.Play || P === Phase.Down;
        for (const m of r.machines) {
            if (m.dead || m.kind === MachineKind.Pylon) continue;
            const set = this.setOf(m.kind);
            if (m.warp > 0) { this.warp(s, set[0], m.x, m.y, m.warpProgress); continue; }
            let fr = animOn ? (Math.trunc(m.anim * 5) & 1) : 0;
            if (m.kind === MachineKind.Crusher && m.stun > 0) fr = 0;
            if (m.kind === MachineKind.Hatcher) {
                fr = animOn ? (Math.trunc(m.anim * 2) & 1) : 0;
                if (m.hatches < 3 && m.fire < 0.9 && P === Phase.Play) {
                    // about to hatch: it swells
                    const k = 1 - m.fire / 0.9;
                    s.circle(ox + Math.trunc(m.x), oy + Math.trunc(m.y), 7 + Math.trunc(k * 5), k > 0.6 ? this.cOrange : this.cRedDk, false);
                }
            }
            if (m.hit > 0) { this.spriteTint(s, set[fr], m.x, m.y, m.hx < 0, this.cSilverHi); continue; }
            this.sprite(s, set[fr], m.x, m.y, m.kind !== MachineKind.Roller && m.hx < 0);
            if (m.kind === MachineKind.Roller && m.fire < 0.45 && P === Phase.Play) {
                // the turret lights before a shell
                const x = ox + Math.trunc(m.x), y = oy + Math.trunc(m.y);
                s.rect(x - 2, y - 4, 4, 2, this.cSilverHi);
            }
            if (m.kind === MachineKind.Cortex && m.prey != null && m.turning === 0 && P === Phase.Play) {
                // a cortex on its way to a human: a faint mark over the human it wants
                const x = ox + Math.trunc(m.prey.x), y = oy + Math.trunc(m.prey.y) - 10;
                s.setPixel(x, y, this.cViolet); s.setPixel(x - 1, y - 1, this.cVioletDk); s.setPixel(x + 1, y - 1, this.cVioletDk);
            }
        }

        // ---- mite streams: the edge glows red where the next stream comes in
        if (P === Phase.Play || P === Phase.SpawnIn) {
            for (const p of r.pending) {
                if (!p.lead || p.delay > 1.2) continue;
                this.edgeGlow(s, p, 1 - p.delay / 1.2);
            }
        }

        // ---- shots
        for (const sp of r.shots) {
            if (sp.dead) continue;
            const x = ox + Math.trunc(sp.x), y = oy + Math.trunc(sp.y);
            if (sp.kind === ShotKind.Spark) {
                // a red star that turns between + and x (2.5 Hz)
                const plus = (Math.trunc(sp.anim * 2.5) & 1) === 0;
                if (plus) { s.rect(x - 2, y, 5, 1, this.cRed); s.rect(x, y - 2, 1, 5, this.cRed); }
                else {
                    s.setPixel(x - 2, y - 2, this.cRed); s.setPixel(x - 1, y - 1, this.cRed); s.setPixel(x + 1, y + 1, this.cRed); s.setPixel(x + 2, y + 2, this.cRed);
                    s.setPixel(x + 2, y - 2, this.cRed); s.setPixel(x + 1, y - 1, this.cRed); s.setPixel(x - 1, y + 1, this.cRed); s.setPixel(x - 2, y + 2, this.cRed);
                }
                s.setPixel(x, y, this.cSilverHi);
            } else if (sp.kind === ShotKind.Shell) {
                // an orange ball with a dark rim
                s.rect(x - 1, y - 2, 3, 5, this.cRedDk); s.rect(x - 2, y - 1, 5, 3, this.cRedDk);
                s.rect(x - 1, y - 1, 3, 3, this.cOrange);
                s.setPixel(x, y - 1, this.cSilverHi);
            } else {
                // a bolt: a short red dash along its flight, a yellow head
                const sp2 = Math.sqrt(sp.vx * sp.vx + sp.vy * sp.vy) + 1e-3;
                const ux = sp.vx / sp2, uy = sp.vy / sp2;
                s.line(x - Math.round(ux * 5), y - Math.round(uy * 5), x, y, this.cRed);
                s.line(x - Math.round(ux * 5) + 1, y - Math.round(uy * 5), x + 1, y, this.cRed);
                s.rect(x, y, 2, 2, this.cYellow);
            }
        }

        // ---- bullets: a cyan streak with a white head
        for (const b of r.bullets) {
            if (b.dead) continue;
            const ux = Dir8.ux(b.dir), uy = Dir8.uy(b.dir);
            const hx = ox + Math.trunc(b.x), hy = oy + Math.trunc(b.y);
            const tx = ox + Math.trunc(b.x - ux * 6), ty = oy + Math.trunc(b.y - uy * 6);
            const dx = Dir8.DY[b.dir] !== 0 ? 1 : 0, dy = Dir8.DY[b.dir] === 0 ? 1 : 0;
            s.line(tx, ty, hx, hy, this.cCyan); s.line(tx + dx, ty + dy, hx + dx, hy + dy, this.cCyan);
            s.rect(hx, hy, 2, 2, this.cSilverHi);
        }

        // ---- the man
        const gone = P === Phase.Down || ((P === Phase.Result || P === Phase.Over) && !r.roundWon);
        if (!gone) this.drawPlayer(s, r, t);

        // ---- effects
        for (const f of r.fx) this.drawFx(s, f);

        s.noClip();

        // ---- the rail: two red lines and a dark red inner line (white for a beat when something big goes)
        const rail = r.railFlash > 0 ? this.cSilverHi : this.cRed;
        s.frame(OX - 3, OY - 3, AW + 6, AH + 6, rail);
        s.frame(OX - 2, OY - 2, AW + 4, AH + 4, rail);
        s.frame(OX - 1, OY - 1, AW + 2, AH + 2, this.cRedDk);

        this.drawHud(s, r, t);
        this.drawOverlays(s, r, t);
    }

    setOf(kind) {
        switch (kind) {
            case MachineKind.Crusher: return Sprites.Crusher;
            case MachineKind.Cortex: return Sprites.Cortex;
            case MachineKind.Husk: return Sprites.Husk;
            case MachineKind.Hatcher: return Sprites.Hatcher;
            case MachineKind.Roller: return Sprites.Roller;
            case MachineKind.Mite: return Sprites.Mite;
            case MachineKind.Pylon: return Sprites.Pylon[0];
            default: return Sprites.Drone;
        }
    }

    drawPlayer(s, r, t) {
        const f = r.face;
        const back = f === 7 || f === 0 || f === 1;
        const set = back ? Sprites.PlayerBack : Sprites.Player;
        const fr = r.moving && r.p === Phase.Play ? (Math.trunc(r.walkAnim * 6) & 1) : 0;
        const cx = this.ox + Math.trunc(r.playerX), cy = this.oy + Math.trunc(r.playerY);
        if (!(r.invuln > 0 && Math.trunc(t * 10) % 2 === 0)) this.sprite(s, set[fr], r.playerX, r.playerY, Dir8.DX[f] < 0);
        // the gun arm: where A fires (yellow while B holds the aim)
        const arm = r.locked && r.p === Phase.Play ? this.cYellow : this.cSilverHi;
        const ux = Dir8.ux(f), uy = Dir8.uy(f);
        const ax0 = cx + Math.round(ux * 4), ay0 = cy + Math.round(uy * 4);
        const ax1 = cx + Math.round(ux * 8), ay1 = cy + Math.round(uy * 8);
        const ex = Dir8.DY[f] !== 0 ? 1 : 0, ey = Dir8.DY[f] === 0 ? 1 : 0;
        s.line(ax0, ay0, ax1, ay1, arm);
        s.line(ax0 + ex, ay0 + ey, ax1 + ex, ay1 + ey, arm);
        if (r.mercyActive) s.circle(cx, cy, 10, this.cCyanDk, false);
    }

    sprite(s, spr, x, y, flip) {
        s.blit(spr, this.ox + Math.trunc(x) - Math.trunc(spr.width / 2), this.oy + Math.trunc(y) - Math.trunc(spr.height / 2), this.pal, 1, flip);
    }

    spriteTint(s, spr, x, y, flip, c) {
        s.blitTinted(spr, this.ox + Math.trunc(x) - Math.trunc(spr.width / 2), this.oy + Math.trunc(y) - Math.trunc(spr.height / 2), c, 1, flip);
    }

    // the warp-in: the sprite's rows start far apart and pull together; dim silver, then silver,
    // then the real colours for the last fifth
    warp(s, spr, x, y, p) {
        const q = 1 - p;
        const stretch = 1 + 9 * q * q;
        const x0 = this.ox + Math.trunc(x) - Math.trunc(spr.width / 2);
        const cy = this.oy + Math.trunc(y);
        for (let j = 0; j < spr.height; j++) {
            if (p < 0.45 && (j & 1) === 1) continue;
            const yy = Math.round(cy + (j + 0.5 - spr.height / 2) * stretch - 0.5);
            for (let i = 0; i < spr.width; i++) {
                const v = spr.at(i, j);
                if (v < 0) continue;
                const c = p < 0.45 ? this.cSilverDk : p < 0.8 ? this.cSilver : this.pal.at(v);
                s.setPixel(x0 + i, yy, c);
            }
        }
    }

    // the violet thread from a cortex to the human it is turning: dots crawling toward the human
    thread(s, x0, y0, x1, y1, t) {
        const dx = x1 - x0, dy = y1 - y0;
        const n = Math.max(2, Math.trunc(Math.sqrt(dx * dx + dy * dy) / 3));
        const off = Math.trunc(t * 12) % 3;
        for (let i = 0; i <= n; i++) {
            if ((i + 3 - off) % 3 !== 0) continue;
            const k = i / n;
            s.rect(this.ox + Math.trunc(x0 + dx * k), this.oy + Math.trunc(y0 + dy * k), 2, 1, this.cViolet);
        }
    }

    // a stream's way in: a red bar along the edge that grows, and a chevron pointing in
    edgeGlow(s, p, k) {
        const x = this.ox + Math.trunc(p.x), y = this.oy + Math.trunc(p.y);
        const len = 6 + Math.trunc(k * 14);
        const c = k > 0.5 ? this.cRed : this.cRedDk;
        switch (p.edge) {
            case 0: s.rect(x - len, OY, len * 2, 2, c); this.chevron(s, x, OY + 4, 0, 1, c); break;
            case 1: s.rect(OX + AW - 2, y - len, 2, len * 2, c); this.chevron(s, OX + AW - 5, y, -1, 0, c); break;
            case 2: s.rect(x - len, OY + AH - 2, len * 2, 2, c); this.chevron(s, x, OY + AH - 5, 0, -1, c); break;
            default: s.rect(OX, y - len, 2, len * 2, c); this.chevron(s, OX + 4, y, 1, 0, c); break;
        }
    }

    chevron(s, x, y, dx, dy, c) {
        for (let i = 0; i < 4; i++) {
            if (dy !== 0) { s.setPixel(x - 3 + i, y + dy * i, c); s.setPixel(x + 3 - i, y + dy * i, c); }
            else { s.setPixel(x + dx * i, y - 3 + i, c); s.setPixel(x + dx * i, y + 3 - i, c); }
        }
    }

    // THE MAINFRAME: the box, its chase lights, the vents, the four gun pods and the core behind its shutters
    drawBoss(s, r, b, t) {
        const ox = this.ox, oy = this.oy;
        const x = ox + Math.trunc(b.x), y = oy + Math.trunc(b.y);
        const x0 = x - HW, y0 = y - HH, w = HW * 2, h = HH * 2;
        const dying = b.dying;
        const edge = b.hit > 0 ? this.cSilverHi : this.cSilverDk;
        s.rect(x0, y0, w, h, this.cSilverDk);
        s.rect(x0 + 2, y0 + 2, w - 4, h - 4, this.cSilver);
        s.frame(x0, y0, w, h, edge);
        // the chase lights along the top
        const lit = Math.trunc(t * 6) % 6;
        for (let i = 0; i < 12; i++) {
            const lx = x0 + 8 + i * 7;
            const on = !dying && (i % 6) === lit;
            s.rect(lx, y0 + 4, 3, 2, on ? this.cRed : this.cRedDk);
        }
        // vents either side of the core
        for (let i = 0; i < 5; i++) {
            s.rect(x0 + 8 + i * 5, y0 + 10, 2, 14, this.cSilverDk);
            s.rect(x + HW - 10 - i * 5, y0 + 10, 2, 14, this.cSilverDk);
        }
        // the lip it hangs the pods from
        s.rect(x0 - 4, y + HH - 2, w + 8, 3, this.cSilverDk);
        if (dying) {
            // cracks open up as it goes
            const k = Math.min(1, b.dieT / 2.4);
            for (let i = 0; i < 6; i++) {
                const cx = x0 + 10 + ((i * 37) % (w - 20)), len = 4 + Math.trunc(k * 10);
                s.line(cx, y0 + 2, cx + ((i & 1) === 0 ? 3 : -3), y0 + 2 + len, this.cRedDk);
            }
        }

        // the pods
        for (const p of b.pods) {
            const px = ox + Math.trunc(b.podX(p)), py = oy + Math.trunc(b.podY);
            if (p.dead) {
                s.rect(px - 4, py - 5, 8, 4, this.cSilverDk);
                s.setPixel(px - 1, py - 1, this.cRedDk); s.setPixel(px + 2, py, this.cRedDk);
                continue;
            }
            const body = p.hit > 0 ? this.cSilverHi : this.cSilver;
            s.rect(px - 5, py - 6, 10, 8, this.cSilverDk);
            s.rect(px - 4, py - 5, 8, 6, body);
            s.rect(px - 1, py + 2, 2, 4, this.cSilverDk);
            // the barrel lights before a bolt
            const glow = !dying && r.p === Phase.Play && p.cd < 0.5;
            s.rect(px - 1, py + 5, 2, 2, glow ? (p.cd < 0.25 ? this.cYellow : this.cRed) : this.cRedDk);
            // hits left: a row of dots
            for (let i = 0; i < p.hp && i < 8; i++) s.setPixel(px - 4 + i, py - 3, this.cRed);
        }

        // the core: a housing, the core itself, and two shutters that slide apart
        const cx = ox + Math.trunc(b.x), cy = oy + Math.trunc(b.coreY);
        s.circle(cx, cy, 10, this.cSilverDk, true);
        const pulse = (Math.trunc(t * 2) & 1) === 0;
        const coreC = b.coreHit > 0 ? this.cSilverHi : dying ? this.cYellow : pulse ? this.cRed : this.cOrange;
        s.circle(cx, cy, 7, coreC, true);
        s.circle(cx, cy, 3, b.coreHit > 0 ? this.cRed : this.cYellow, true);
        let open = 0;
        if (b.shutter === Shutter.Open || dying) open = 1;
        else if (b.shutter === Shutter.Opening) open = Math.max(0, 1 - b.shutterT / 0.6) * 0.25;
        else if (b.shutter === Shutter.Closing) open = b.shutterT / 0.3;
        const gap = Math.trunc(open * 9);
        if (gap < 9) {
            const shut = b.hit > 0 ? this.cSilverHi : this.cSilver;
            s.rect(cx - 9 - gap, cy - 8, 9, 17, shut); s.rect(cx + gap, cy - 8, 9, 17, shut);
            s.rect(cx - 9 - gap, cy - 8, 1, 17, this.cSilverDk); s.rect(cx + gap + 8, cy - 8, 1, 17, this.cSilverDk);
            // the seam glows before they part
            if (b.shutter === Shutter.Opening && !dying) s.rect(cx - 1, cy - 8, 2, 17, (Math.trunc(b.shutterT * 5) & 1) === 0 ? this.cYellow : this.cRed);
        }
    }

    drawFx(s, f) {
        const p = f.life > 0 ? f.t / f.life : 1;
        const x = this.ox + Math.trunc(f.x), y = this.oy + Math.trunc(f.y);
        switch (f.kind) {
            case FxKind.Debris: {
                const [ca, cb, cl] = this.debrisColours(f.of);
                const a = p > 0.6 ? cl : ca, b = p > 0.6 ? this.cRedDk : cb;
                const big = f.of === MachineKind.Hatcher || f.of === -1;
                const rad = 2 + p * (big ? 30 : f.of === MachineKind.Mite ? 12 : 22);
                const n = big ? 14 : f.of === MachineKind.Mite ? 6 : 10;
                for (let k = 0; k < n; k++) {
                    const ang = k * (6.2832 / n) + (f.seed % 100) * 0.01;
                    const m = rad * (0.6 + (k % 3) * 0.2);
                    s.rect(x + Math.trunc(Math.cos(ang) * m), y + Math.trunc(Math.sin(ang) * m), 2, 2, (k & 1) === 0 ? a : b);
                }
                if (big && p < 0.2) s.circle(x, y, 3 + Math.trunc(p * 40), this.cYellow, false);
                break;
            }
            case FxKind.ManDown: {
                const e0 = 1 - Math.min(1, p * 1.6);
                const e = 1 - e0 * e0;
                const rad = 3 + 36 * e;
                for (let k = 0; k < 20; k++) {
                    const ang = k * 0.31416 + (f.seed % 100) * 0.01;
                    const m = rad * (0.55 + (k % 4) * 0.15);
                    const c = p < 0.5 ? ((k & 1) === 0 ? this.cCyan : this.cSilverHi) : ((k & 1) === 0 ? this.cCyanDk : this.cCyan);
                    s.rect(x + Math.trunc(Math.cos(ang) * m), y + Math.trunc(Math.sin(ang) * m), 2, 2, c);
                }
                if (p < 0.25) s.circle(x, y, 2 + Math.trunc(p * 40), this.cSilverHi, false);
                break;
            }
            case FxKind.Beam: {
                // the human goes up in a column of light that shrinks to their feet
                const c = p < 0.5 ? this.cYellow : this.cYellowDk;
                const hgt = Math.trunc(10 * (1 - p)) + 2;
                for (let k = -1; k <= 1; k++) s.rect(x + k * 4, y - hgt, k === 0 ? 2 : 1, hgt + 7, c);
                break;
            }
            case FxKind.Popup: {
                const txt = String(f.value);
                let c = p < 0.7 ? this.cYellow : this.cYellowDk;
                if (f.of === MachineKind.Cortex) c = p < 0.7 ? this.cRed : this.cRedDk;
                else if (f.of === MachineKind.Husk) c = p < 0.7 ? this.cViolet : this.cVioletDk;
                else if (f.of === MachineKind.Hatcher || f.of === MachineKind.Roller || f.of === -1) c = p < 0.7 ? this.cOrange : this.cRedDk;
                const py = Math.max(OY + 1, y - 24 - Math.trunc(p * 8));    // clear of the beam and the man, never off the floor
                s.textCentered(txt, x, py, PixelFont.Arcade, c);
                break;
            }
            case FxKind.Fizzle:
                s.setPixel(x - 1, y - 1, this.cRedDk); s.setPixel(x + 1, y + 1, this.cRedDk); s.setPixel(x + 1, y - 1, this.cRedDk); s.setPixel(x - 1, y + 1, this.cRedDk);
                break;
            case FxKind.Clank:
                s.rect(x - 1, y - 1, 2, 2, this.cSilverHi);
                break;
            case FxKind.Skull: {
                const spr = Sprites.Skull;
                if (p < 0.6) s.blit(spr, x - Math.trunc(spr.width / 2), y - 2, this.pal);
                else s.blitTinted(spr, x - Math.trunc(spr.width / 2), y - 2, this.cRedDk);
                break;
            }
            case FxKind.Zap: {
                // a pylon's discharge: four jagged arms
                const c = p < 0.5 ? this.cSilverHi : this.cYellow;
                const len = 4 + Math.trunc(p * 8);
                for (let k = 0; k < 4; k++) {
                    const ux = k === 0 ? 1 : k === 1 ? -1 : 0, uy = k === 2 ? 1 : k === 3 ? -1 : 0;
                    const mx = x + ux * (len >> 1) + uy * 2, my = y + uy * (len >> 1) + ux * 2;
                    s.line(x, y, mx, my, c); s.line(mx, my, x + ux * len, y + uy * len, c);
                }
                break;
            }
            case FxKind.Ring:
                s.circle(x, y, 2 + Math.trunc(p * 14), p < 0.5 ? this.cOrange : this.cRedDk, false);
                break;
        }
    }

    debrisColours(of) {
        switch (of) {
            case MachineKind.Cortex: return [this.cRed, this.cSilverHi, this.cRedDk];
            case MachineKind.Husk: return [this.cViolet, this.cRed, this.cVioletDk];
            case MachineKind.Hatcher: return [this.cOrange, this.cRed, this.cRedDk];
            case MachineKind.Roller: return [this.cSilver, this.cOrange, this.cSilverDk];
            case MachineKind.Mite: return [this.cRed, this.cSilverHi, this.cRedDk];
            case MachineKind.Pylon: return [this.cYellow, this.cSilverHi, this.cYellowDk];
            case -1: return [this.cOrange, this.cYellow, this.cSilverDk];
            default: return [this.cSilver, this.cRed, this.cSilverDk];
        }
    }

    drawHud(s, r, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        // left: 1UP and the score, big
        s.text('1UP', 8, 13, arc, this.cRed);
        s.text(d6(r.score), 30, 10, dsp, this.cSilverHi, 2);
        // centre: WAVE n, then the wave's bursts as pips (the mainframe's wave: its core)
        s.text('WAVE', 134, 13, arc, this.cSilver);
        s.text(String(r.waveNo), 162, 10, dsp, this.cRed, 2);
        const b = r.boss;
        if (b != null) {
            const left = b.gone ? 0 : Math.max(0, b.coreHp) / b.coreMax;
            const warn = left < 0.34 && !b.gone && !SurfaceDraw.blink(t, 1);
            s.frame(182, 11, 44, 13, this.cRedDk);
            s.rect(184, 13, Math.trunc(40 * left), 9, warn ? this.cOrange : this.cRed);
        } else {
            for (let i = 0; i < r.burstCount; i++) {
                const x = 182 + i * 7;
                if (i < r.burstsStarted) s.rect(x, 11, 5, 13, this.cRed); else s.frame(x, 11, 5, 13, this.cRedDk);
            }
        }
        // right: humans saved, then men left
        s.blit(Sprites.Woman[0], 232, 11, this.pal);
        s.text(String(r.saved), 246, 10, dsp, this.cYellow, 2);
        s.blit(Sprites.Player[0], 282, 11, this.pal);
        s.textRight(String(Math.min(9, r.men)), 312, 10, dsp, this.cCyan, 2);
        s.dottedRule(8, 312, 28, 3, this.cRedDk);
    }

    drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + AH / 2;
        switch (r.p) {
            case Phase.Card: this.drawCard(s, r, t); break;
            case Phase.SpawnIn:
                s.textCenteredShadow('GET READY', midX, midY - 44, dsp, this.cSilverHi, this.cRedDk, 3);
                if (r.regroup) s.textCenteredShadow('MEN LEFT ' + r.men, midX, midY + 26, dsp, this.cCyan, this.cBg, 2);
                else s.textCenteredShadow('WAVE ' + r.waveNo + ' - ' + r.waveDef.name, midX, midY + 26, arc, this.cYellow, this.cBg);
                if (r.mercyActive) s.textCenteredShadow('FREE RIDE - SHIELD ON', midX, midY + 46, arc, this.cCyan, this.cBg);
                if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', OX + Math.trunc(r.playerX), OY + Math.trunc(r.playerY) - 18, arc, this.cCyan, this.cBg);
                break;
            case Phase.Play:
                if (r.bannerTime < 1.8) s.textCenteredShadow(r.waveDef.name === 'THE SWARM' ? 'SWARM INCOMING' : 'MORE INCOMING', midX, OY + 8, dsp, this.cRed, this.cBg, 2);
                if (r.extraTime < 2.2) s.textCenteredShadow('EXTRA MAN', midX, OY + AH - 22, dsp, this.cCyan, this.cBg, 2);
                if (r.boss != null && r.boss.dying) s.textCenteredShadow('THE MAINFRAME IS DOWN', midX, OY + AH - 40, arc, this.cYellow, this.cBg, 1);
                break;
            case Phase.Down:
                s.textBox('MAN DOWN', midX, midY - 30, dsp, 3, this.cSilverHi, this.cRed, this.cBg);
                s.plate(midX - 60, midY + 6, 120, 22, this.cBg, this.cCyan);
                s.textCentered(r.men > 0 ? 'MEN LEFT ' + r.men : 'NO MEN LEFT', midX, midY + 10, dsp, this.cCyan, 1);
                break;
            case Phase.Tally: this.drawTally(s, r, t); break;
            case Phase.Result:
            case Phase.Over: {
                const spec = LastHumanSpec;
                const won = r.roundWon;
                s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 40, dsp, won ? 2 : 3, won ? this.cYellow : this.cRed, this.cRed, this.cBg);
                s.plate(midX - 100, midY - 6, 200, 60, this.cBg, this.cRed);
                s.textCentered('SCORE ' + d6(r.score), midX, midY + 1, arc, this.cSilverHi, 2);
                s.textCentered(won ? 'ALL SEVEN WAVES CLEARED' : 'WAVE ' + r.waveNo + ' - ' + r.waveDef.name, midX, midY + 21, arc, won ? this.cCyan : this.cSilver);
                s.textCentered('HUMANS SAVED ' + r.saved, midX, midY + 33, arc, this.cYellow);
                s.textCentered('MACHINES ' + r.kills, midX, midY + 43, arc, this.cSilver);
                if (won) s.textCenteredShadow('THE LAST HUMANS LIVE ON', midX, OY + AH - 18, arc, this.cYellow, this.cBg);
                break;
            }
        }
    }

    // THE WAVE CARD: its number and name, the new machine big, its two hint lines
    drawCard(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const def = r.waveDef, midX = 160;
        const y0 = OY + 20;
        s.plate(midX - 112, y0, 224, 148, this.cBg, this.cRed);
        s.frame(midX - 110, y0 + 2, 220, 144, this.cRedDk);
        const last = r.wave + 1 >= WAVES.length;
        s.textCenteredShadow(last ? 'FINAL WAVE' : 'WAVE ' + r.waveNo, midX, y0 + 9, dsp, last ? this.cRed : this.cSilverHi, this.cRedDk, 2);
        s.textCentered(def.name, midX, y0 + 31, arc, this.cYellow, 2);
        s.dottedRule(midX - 90, midX + 90, y0 + 50, 3, this.cRedDk);
        this.drawFeature(s, def, midX, y0 + 58, t);
        s.textCentered(FeatureName[def.feature] || '', midX, y0 + 98, arc, this.cSilver);
        s.textCentered(def.hint[0], midX, y0 + 114, arc, this.cSilverHi);
        s.textCentered(def.hint[1], midX, y0 + 125, arc, this.cSilverHi);
        if (r.mercyActive) s.textCentered('FREE RIDE - SHIELD ON', midX, y0 + 137, PixelFont.Small, this.cCyan);
        else if (r.wave === 0) s.textCentered('HOLD B TO LOCK YOUR AIM', midX, y0 + 137, PixelFont.Small, this.cCyan);
    }

    // the featured machine, drawn at x2 in a 32 px tall box centred on cx (top y)
    drawFeature(s, def, cx, y, t) {
        const pal = this.pal;
        const big = (spr, x) => s.blit(spr, x - spr.width, y + 32 - spr.height * 2, pal, 2);
        const fr = Math.trunc(t * 3) & 1;
        switch (def.feature) {
            case 'crusher': big(Sprites.Crusher[fr], cx); break;
            case 'pylon': big(Sprites.Pylon[0][fr], cx - 26); big(Sprites.Pylon[1][fr], cx); big(Sprites.Pylon[2][fr], cx + 26); break;
            case 'cortex':
                big(Sprites.Cortex[fr], cx - 20);
                s.text('>', cx - 3, y + 14, PixelFont.Arcade, this.cViolet);
                big(Sprites.Husk[fr], cx + 20);
                break;
            case 'hatcher':
                big(Sprites.Hatcher[fr], cx - 20);
                s.text('>', cx - 3, y + 14, PixelFont.Arcade, this.cOrange);
                big(Sprites.Roller[fr], cx + 22);
                break;
            case 'mite':
                for (let i = 0; i < 5; i++) big(Sprites.Mite[(fr + i) & 1], cx - 32 + i * 16 + ((i & 1) === 0 ? 0 : 0));
                break;
            case 'mainframe': {
                // a little mainframe: the box, the lights, the pods, the core
                const x0 = cx - 40;
                s.rect(x0, y + 2, 80, 20, this.cSilverDk); s.rect(x0 + 2, y + 4, 76, 16, this.cSilver);
                for (let i = 0; i < 9; i++) s.rect(x0 + 6 + i * 8, y + 6, 3, 2, (i % 3) === (Math.trunc(t * 4) % 3) ? this.cRed : this.cRedDk);
                for (const dx of [-32, -16, 16, 32]) { s.rect(cx + dx - 4, y + 22, 8, 5, this.cSilverDk); s.rect(cx + dx - 1, y + 27, 2, 3, this.cRed); }
                s.circle(cx, y + 16, 7, this.cSilverDk, true); s.circle(cx, y + 16, 5, this.cRed, true); s.circle(cx, y + 16, 2, this.cYellow, true);
                break;
            }
            default: big(Sprites.Drone[fr], cx - 18); big(Sprites.Woman[0], cx + 18); break;
        }
    }

    // THE TALLY: WAVE n CLEARED, then the rows counted in one at a time
    drawTally(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160;
        s.textBox('WAVE ' + r.waveNo + ' CLEARED', midX, OY + 30, dsp, 2, this.cYellow, this.cRed, this.cBg);
        const rows = r.tally, h = 18 + rows.length * 14;
        const y0 = OY + 62;
        s.plate(midX - 104, y0, 208, h, this.cBg, this.cRedDk);
        for (let i = 0; i < rows.length && i < r.tallyShown; i++) {
            const row = rows[i], y = y0 + 10 + i * 14;
            const c = i === 0 ? this.cYellow : row.label === 'THE MAINFRAME' ? this.cOrange : this.cSilverHi;
            s.text(row.label, midX - 94, y, arc, c);
            s.textRight(row.pts > 0 ? '+' + row.pts : row.text, midX + 94, y, arc, row.pts > 0 ? this.cCyan : c);
        }
        if (r.tallyShown >= rows.length) {
            const next = r.wave + 1 < WAVES.length ? 'NEXT  ' + WAVES[r.wave + 1].name : 'THE LAST HUMANS ARE SAFE';
            s.textCenteredShadow(next, midX, y0 + h + 10, arc, this.cSilver, this.cBg);
        }
    }
}
