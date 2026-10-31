// THE NODE · world 1 · VAULT DIGGER on the Cabinet Engine · THE PICTURE.
// Grew out of the port of VaultDiggerRenderer.cs (Staging/Batch2/vaultdigger; VaultArt itself lives in
// spec.js); the build-out (2026-10-18) added the heist: the vault card, the tally, the new tiles, sparks.
//
// Sized for a curved tube seen from 0.8 m: the vault is 18 x 12 tiles of 16 px (288 x 192) at (16, 34),
// filling the safe area under a 20 px HUD band; the runner and the guards are full-tile 16 x 16
// sprites with 2 px limbs; gold is a 14 x 10 stack of bars. Every colour comes from the palette.
//
//   HUD    1UP + the score in display digits x2 | a gold stack + the gold still to take x2 | the vault and
//          its bonus clock (red under 500) | one runner icon per life (three, then +N)
//   CARD   each vault opens on its card over the dimmed vault: VAULT n, the name, a picture of the new
//          thing and its one-line hint (the last vault says so in red)
//   DIG    the brick breaks top-down with chips flying; the open hole is black; in its last 0.8 s the
//          brick grows back bottom-up in three steps
//   TRAP   a trapped guard stands in the hole, arms up; it shakes in its last 0.6 s. A buried guard comes
//          back from the top: a red arrow flashes there first (2.5 Hz)
//   CRACK  cracked brick shows its split; once something has dropped through, only its edges are left
//   BELT   the tread runs the belt's way, chevrons on its face; STRONGROOM bars slide up when the key is taken
//   ALARM  the crown is gone: the vault's frame and the HUD rule flash red (2 Hz)
//   EXIT   the ladder rises out of the top rung by rung, drawn in gold, with EXIT beside it
//   CAUGHT the runner flashes gold/white at 2.5 Hz (under the 3 Hz floor), then lies down; a short shake
//   Cards  READY / CAUGHT / VAULT CLEARED / the tally / HEIST COMPLETE / GAME OVER on double-framed plates
import { f32, idiv, roundEven, d6, dn, PixelFont, SurfaceDraw, Dir4 } from '../../sdk/index.js';
import { VaultDiggerPalette, VaultDiggerSpec, VaultArt } from './spec.js';
import { VaultDiggerSim, VaultMap, Tile, GState } from './sim.js';
import { VAULTS } from './vaults.js';

const T = VaultArt.T;
const OX = 16, OY = 34;
const FW = VaultMap.W * T, FH = VaultMap.H * T;     // 288 x 192
const Phase = VaultDiggerSim.Phase;

function mod1f(v) { return f32(v - Math.trunc(v)); }

export class VaultDiggerRenderer {
    constructor() {
        const pal = VaultDiggerPalette;
        this.pal = pal;
        this.cBg = pal.get('bg'); this.cBrickLo = pal.get('brickLo'); this.cBrick = pal.get('brick'); this.cBrickHi = pal.get('brickHi');
        this.cRock = pal.get('rock'); this.cRockHi = pal.get('rockHi'); this.cLadderLo = pal.get('ladderLo');
        this.cGold = pal.get('gold'); this.cGoldHi = pal.get('goldHi'); this.cGoldLo = pal.get('goldLo');
        this.cRed = pal.get('red'); this.cRedLo = pal.get('redLo'); this.cWhite = pal.get('white'); this.cShade = pal.get('shade'); this.cLadder = pal.get('ladder');
        this.cViolet = pal.get('violet'); this.cGreen = pal.get('green');
        this.goldPoints = VaultDiggerSim.GoldPoints;
        this.dx = 0; this.dy = 0;            // the shake, this frame
        this.cl = [0, 0, 320, 240];          // the clip in force
    }

    draw(sim, s, t) {
        const g = sim;
        this._clip(s, 0, 0, 320, 240);
        s.clear(this.cBg);
        if (g == null || g.map == null) return;
        const P = g.p;

        // a short shake (a catch, a burial, the alarm): the vault moves, the HUD does not
        this.dx = 0; this.dy = 0;
        if (g.shake > 0) { const k = g.shake > f32(0.2) ? 2 : 1; this.dx = Math.trunc(f32(t * 40)) % 2 === 0 ? k : -k; this.dy = Math.trunc(f32(t * 30)) % 2 === 0 ? 1 : 0; }
        const ox = OX + this.dx, oy = OY + this.dy;

        this._clip(s, OX - 2, OY - 2, FW + 4, FH + 4);
        this._drawVault(s, g, t, ox, oy);

        // ---- actors (clipped to the vault so the escape climbs out of sight)
        this._clip(s, OX, OY, FW, FH);
        for (const gd of g.guards) this._drawGuard(s, g, gd, t, ox, oy);
        const gone = (g.roundWon && (P === Phase.Card || P === Phase.Over)) || P === Phase.Tally;   // out of the top
        if (!gone) this._drawRunner(s, g, t, ox, oy);

        // ---- sparks and debris
        for (const f of g.fx) {
            const c = this.pal.get(f.c);
            s.rect(ox + Math.trunc(f.x), oy + Math.trunc(f.y), 2, 2, c);
        }
        this._clip(s, 0, 0, 320, 240);

        // ---- the vault's frame: a flash (the exit, the crown), the alarm (2 Hz red)
        if (g.alarm && P === Phase.Play && SurfaceDraw.blink(t, 2)) { s.frame(OX - 2, OY - 2, FW + 4, FH + 4, this.cRed); s.frame(OX - 1, OY - 1, FW + 2, FH + 2, this.cRedLo); }
        else if (g.flash > 0) s.frame(OX - 2, OY - 2, FW + 4, FH + 4, this.cGoldHi);

        // ---- score popups
        for (const p of g.popups) {
            const txt = String(p.value);
            const px = ox + Math.trunc(f32(p.x * T)) + idiv(T, 2), py = oy + Math.trunc(f32(p.y * T)) - 2 - Math.trunc(f32(p.t * 12));
            s.textCenteredShadow(txt, px, Math.max(OY + 1, py), PixelFont.Arcade, p.value >= this.goldPoints ? this.cGoldHi : this.cWhite, this.cBg, p.big ? 2 : 1);
        }

        this._drawHud(s, g, t);

        // ---- overlays
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + idiv(FH, 2);
        if (g.extraT > 0 && P !== Phase.Card && P !== Phase.Over && SurfaceDraw.blink(t, 2)) {
            s.plate(midX - 64, OY + 4, 128, 17, this.cBg, this.cGold);
            s.textCentered('EXTRA RUNNER', midX, OY + 9, arc, this.cGoldHi);
        }
        if (P === Phase.Vault) this._drawVaultCard(s, g, t);
        else if (P === Phase.Ready) {
            s.textBox('READY', midX, midY - 30, dsp, 3, this.cGoldHi, this.cBrickHi, this.cBg);
            const sub = g.livesLeft === 1 ? 'LAST RUNNER' : g.livesLeft + ' RUNNERS';
            s.plate(midX - 70, midY + 2, 140, 20, this.cBg, this.cBrickHi);
            s.textCentered(sub, midX, midY + 9, arc, this.cWhite);
            this._drawYou(s, g, t);
        } else if (P === Phase.Play && g.phaseTime < f32(1.2) && g.mercyActive) {
            s.plate(midX - 84, OY + FH - 26, 168, 20, this.cBg, this.cGold);
            s.textCentered('FREE RUN  GUARDS NAPPING', midX, OY + FH - 19, arc, this.cGold);
        } else if (P === Phase.Caught && g.phaseTime > f32(0.5)) {
            s.textBox(g.deathByHole ? 'BURIED' : 'CAUGHT', midX, midY - 30, dsp, 3, this.cRed, this.cRed, this.cBg);
            const sub = g.livesLeft - 1 <= 0 ? 'NO RUNNERS LEFT' : (g.livesLeft - 1) + (g.livesLeft - 1 === 1 ? ' RUNNER LEFT' : ' RUNNERS LEFT');
            s.plate(midX - 70, midY + 2, 140, 20, this.cBg, this.cRed);
            s.textCentered(sub, midX, midY + 9, arc, this.cWhite);
        } else if (P === Phase.Escape) {
            s.textBox('VAULT CLEARED', midX, midY - 14, dsp, 2, this.cGoldHi, this.cGold, this.cBg);
        } else if (P === Phase.Tally) this._drawTally(s, g, t);
        else if (P === Phase.Card || P === Phase.Over) this._drawResult(s, g, t);
    }

    // which one is you (the card and READY)
    _drawYou(s, g, t) {
        const r = g.runner;
        const hx = OX + r.x * T + idiv(T, 2), hy = OY + r.y * T - 10;
        if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', hx, Math.max(OY + 1, hy), PixelFont.Arcade, this.cWhite, this.cBg);
    }

    // ------------------------------------------------------------------ the vault
    _drawVault(s, g, t, ox, oy) {
        const m = g.map;
        for (let y = 0; y < VaultMap.H; y++)
            for (let x = 0; x < VaultMap.W; x++) {
                const px = ox + x * T, py = oy + y * T;
                const i = VaultMap.idx(x, y);
                switch (m.tiles[i]) {
                    case Tile.Brick: this._drawBrick(s, g, x, y, px, py); break;
                    case Tile.Rock: s.blit(VaultArt.Rock, px, py, this.pal); break;
                    case Tile.Ladder: s.blit(VaultArt.Ladder, px, py, this.pal); break;
                    case Tile.Bar: s.blit(VaultArt.Bar, px, py, this.pal); break;
                    case Tile.Exit: if (m.exitOpen) this._drawExit(s, m, x, y, px, py, t); break;
                    case Tile.Crack: this._drawCrack(s, m, i, px, py); break;
                    case Tile.BeltL: this._drawBelt(s, px, py, -1, t, g.p === Phase.Play || g.p === Phase.Escape); break;
                    case Tile.BeltR: this._drawBelt(s, px, py, 1, t, g.p === Phase.Play || g.p === Phase.Escape); break;
                    case Tile.Door: this._drawDoor(s, m, px, py); break;
                }
                if (m.gold[i] > 0) {
                    s.blit(VaultArt.Gold, px + 1, py + 6, this.pal);
                    // a slow glint walks over the gold (one flash every 3 s per piece)
                    const inner = f32(f32(t * f32(0.33)) + f32((x * 7 + y * 3) * f32(0.13)));
                    if (mod1f(inner) < f32(0.12)) s.blit(VaultArt.Glint, px + 9, py + 3, this.pal);
                }
                if (i === m.keyAt && !m.keyTaken) {
                    s.blit(VaultArt.Key, px + 1, py + 9, this.pal);
                    if (mod1f(f32(t * f32(0.6))) < f32(0.15)) s.blit(VaultArt.Glint, px + 1, py + 5, this.pal);
                }
                if (i === m.crownAt && !m.crownTaken) {
                    s.blit(VaultArt.Crown, px + 1, py + 8, this.pal);
                    if (mod1f(f32(t * f32(0.8))) < f32(0.2)) s.blit(VaultArt.Glint, px + 9, py + 4, this.pal);
                }
            }
        // the drop-in warning: a buried guard's column, flashing red at the top (2.5 Hz)
        for (const gd of g.guards)
            if (gd.s === GState.Dead && gd.spawnX >= 0 && Math.trunc(f32(t * 5)) % 2 === 0) {
                const px = ox + gd.spawnX * T;
                s.rect(px + 6, oy + 1, 4, 6, this.cRed);
                s.rect(px + 3, oy + 7, 10, 2, this.cRed); s.rect(px + 5, oy + 9, 6, 2, this.cRed); s.rect(px + 7, oy + 11, 2, 2, this.cRed);
            }
    }

    _drawBrick(s, g, x, y, px, py) {
        const m = g.map;
        const i = VaultMap.idx(x, y);
        // being dug: the brick breaks from the top
        if (g.digging && g.digX === x && g.digY === y) {
            const k = f32(1 - f32(g.digT / Math.max(f32(0.01), g.digSeconds)));
            const gone = Math.min(T, Math.trunc(f32(f32(k * T) * f32(1.1))));
            this._clipBlit(s, VaultArt.Brick, px, py, py + gone, T - gone);
            return;
        }
        const left = m.holeT[i];
        if (left <= 0) { s.blit(VaultArt.Brick, px, py, this.pal); return; }
        // open: black, with its broken lips; the last 0.8 s it grows back from the bottom
        if (left < f32(0.8)) {
            const stage = left < f32(0.27) ? 3 : left < f32(0.53) ? 2 : 1;
            const h = stage * 5;
            this._clipBlit(s, VaultArt.Brick, px, py, py + T - h, h);
        }
        s.rect(px, py, 2, 2, this.cBrickLo); s.rect(px + T - 2, py, 2, 2, this.cBrickLo);
    }

    // the clip in force (kept here, so a part-tile can be cut inside it and the clip put back)
    _clip(s, x, y, w, h) { this.cl = [x, y, x + w, y + h]; s.clip(x, y, w, h); }

    // blit a sprite, only the screen rect [x0, x1) x [y0, y1), inside the clip in force
    _cutBlit(s, spr, px, py, x0, y0, x1, y1) {
        const c = this.cl;
        const a = Math.max(c[0], x0), b = Math.max(c[1], y0), e = Math.min(c[2], x1), f = Math.min(c[3], y1);
        if (e <= a || f <= b) return;
        s.clip(a, b, e - a, f - b);
        s.blit(spr, px, py, this.pal);
        s.clip(c[0], c[1], c[2] - c[0], c[3] - c[1]);
    }

    // a tile's rows [y0, y0 + h) only
    _clipBlit(s, spr, px, py, y0, h) { if (h > 0) this._cutBlit(s, spr, px, py, px, y0, px + T, y0 + h); }

    _drawCrack(s, m, i, px, py) {
        if (!m.crackSeen[i]) { s.blit(VaultArt.Crack, px, py, this.pal); return; }
        // given way: only the edges are left, and a few teeth of brick
        this._cutBlit(s, VaultArt.Crack, px, py, px, py, px + 3, py + T);
        this._cutBlit(s, VaultArt.Crack, px, py, px + T - 3, py, px + T, py + T);
        s.rect(px + 3, py, 3, 2, this.cBrickLo); s.rect(px + T - 6, py, 3, 2, this.cBrickLo);
        s.rect(px + 3, py + T - 2, 2, 2, this.cBrickLo); s.rect(px + T - 5, py + T - 2, 2, 2, this.cBrickLo);
    }

    // a conveyor: a steel housing, two rollers, a tread running the belt's way and chevrons on its face
    _drawBelt(s, px, py, dir, t, running) {
        s.rect(px, py + 3, T, T - 3, this.cRock);
        s.rect(px, py + T - 1, T, 1, this.cBg);
        s.rect(px, py, T, 3, this.cLadderLo);
        const ph = running ? Math.trunc(f32(t * f32(35))) % 6 : 0;
        for (let k = -6; k < T + 6; k += 6) {
            const x0 = px + k + (dir > 0 ? ph : -ph);
            const a = Math.max(px, x0), b = Math.min(px + T, x0 + 3);
            if (b > a) s.rect(a, py, b - a, 2, this.cLadder);
        }
        s.circle(px + 4, py + 10, 2, this.cRockHi, true); s.circle(px + 11, py + 10, 2, this.cRockHi, true);
        s.setPixel(px + 4, py + 10, this.cRock); s.setPixel(px + 11, py + 10, this.cRock);
        // the chevron: which way it carries
        const cx = px + 7, cy = py + 5;
        for (let j = 0; j < 3; j++) {
            const off = dir > 0 ? j : -j;
            s.rect(cx + off - (dir > 0 ? 1 : -1), cy + j, 2, 1, this.cBrickHi);
            if (j < 2) s.rect(cx + off - (dir > 0 ? 1 : -1), cy + 4 - j, 2, 1, this.cBrickHi);
        }
    }

    // the strongroom's bars: a stone lintel and four bars; the key slides them up into it
    _drawDoor(s, m, px, py) {
        s.rect(px, py, T, 3, this.cRock); s.rect(px, py, T, 1, this.cRockHi);
        const up = m.doorOpen ? Math.min(13, Math.trunc(f32(m.doorT * f32(26)))) : 0;
        const h = 13 - up;
        if (h <= 0) return;
        for (let k = 0; k < 4; k++) s.rect(px + 1 + k * 4, py + 3, 2, h, this.cLadder);
        if (h > 6) s.rect(px, py + 8, T, 1, this.cLadderLo);
        if (!m.doorOpen) { s.rect(px + 6, py + 9, 4, 4, this.cGreen); s.setPixel(px + 7, py + 10, this.cBg); s.rect(px + 7, py + 11, 1, 2, this.cBg); }
    }

    _drawExit(s, m, x, y, px, py, t) {
        // rises rung by rung from the bottom exit tile to the top (0.35 s a tile)
        let tiles = 0;
        for (let yy = 0; yy < VaultMap.H; yy++) if (m.at(x, yy) === Tile.Exit) tiles++;
        let fromBottom = 0;
        for (let yy = y + 1; yy < VaultMap.H; yy++) if (m.at(x, yy) === Tile.Exit) fromBottom++;
        const shown = f32(m.exitT / f32(0.35));
        if (shown < fromBottom) return;
        const part = Math.min(1, f32(shown - fromBottom));
        const h = Math.trunc(f32(part * T));
        this._clipBlit(s, VaultArt.ExitLadder, px, py, py + T - h, h);
        if (y === 0 && shown >= tiles && SurfaceDraw.blink(t, 1)) {
            if (x < VaultMap.W - 3) s.textShadow('EXIT', px + T + 3, py + 4, PixelFont.Arcade, this.cGoldHi, this.cBg);
            if (x >= 3) s.textShadow('EXIT', px - 27, py + 4, PixelFont.Arcade, this.cGoldHi, this.cBg);
        }
    }

    // ------------------------------------------------------------------ actors
    _drawRunner(s, g, t, ox, oy) {
        const r = g.runner;
        const fig = VaultArt.RunnerFig;
        const px = ox + Math.trunc(roundEven(f32(r.fx * T))), py = oy + Math.trunc(roundEven(f32(f32(r.fy + g.escapeY) * T)));
        const flip = r.face < 0;
        let spr;
        if (g.p === Phase.Caught) {
            const pt = g.phaseTime;
            if (pt < f32(1.2)) {
                const red = Math.trunc(f32(pt * 5)) % 2 === 0;                 // 2.5 Hz
                spr = (red ? VaultArt.FlashFig : fig).fall;
            } else spr = fig.down;
            s.blit(spr, px, py, this.pal, 1, flip);
            return;
        }
        spr = g.p === Phase.Escape ? fig.climb : this._poseFor(g, r, fig, g.digging);
        const climbFlip = spr === fig.climb && Math.trunc(f32(f32(r.anim * 3) + (g.p === Phase.Escape ? f32(g.phaseTime * 6) : 0))) % 2 === 1;
        s.blit(spr, px, py, this.pal, 1, spr === fig.climb ? climbFlip : flip);
    }

    _poseFor(g, a, fig, digging) {
        const m = g.map;
        if (digging) return fig.dig;
        if (a.falling) return fig.fall;
        const lx = a.lx, ly = a.ly;
        const vertical = a.moving && (a.moveDir === Dir4.Up || a.moveDir === Dir4.Down);
        if (m.bar(lx, ly) && !vertical) return a.moving && Math.trunc(f32(a.anim * 3)) % 2 === 1 ? fig.hang2 : fig.hang1;
        if (m.ladder(lx, ly) && (vertical || !m.solid(lx, ly + 1))) return fig.climb;
        if (vertical && m.ladder(a.x, a.y)) return fig.climb;
        if (a.moving && !a.carried) return Math.trunc(f32(a.anim * 3)) % 2 === 0 ? fig.run1 : fig.run2;
        return fig.stand;
    }

    _drawGuard(s, g, gd, t, ox, oy) {
        if (gd.s === GState.Dead) return;
        const fig = gd.warden ? VaultArt.WardenFig : VaultArt.GuardFig;
        let px = ox + Math.trunc(roundEven(f32(gd.fx * T))), py = oy + Math.trunc(roundEven(f32(gd.fy * T)));
        const flip = gd.face < 0;
        let spr;
        if (gd.s === GState.Trapped) {
            spr = fig.fall;
            if (gd.t < f32(0.6)) px += Math.trunc(f32(gd.t * 8)) % 2 === 0 ? 1 : -1;   // the struggle before it climbs out
        } else if (gd.s === GState.Climb) spr = fig.climb;
        else spr = this._poseFor(g, gd, fig, false);
        const climbFlip = spr === fig.climb && Math.trunc(f32(gd.anim * 3)) % 2 === 1;
        s.blit(spr, px, py, this.pal, 1, spr === fig.climb ? climbFlip : flip);
        if (gd.sack && gd.carry) s.blit(VaultArt.Sack, flip ? px + 9 : px - 1, py + 5, this.pal);
        else if (gd.carry) s.blit(VaultArt.Nugget, px + 5, py + 9, this.pal);
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, g, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cRed);
        s.text(d6(g.score), 30, 10, dsp, this.cWhite, 2);
        // gold still to take (and the crown, while it is there)
        s.blit(VaultArt.Gold, 134, 13, this.pal);
        s.text(dn(Math.min(99, g.itemsLeft), 2), 150, 10, dsp, g.map.exitOpen ? this.cGold : this.cGoldHi, 2);
        // the vault and its bonus clock
        s.text('VAULT ' + (g.vault + 1), 190, 9, arc, this.cBrickHi);
        s.text('BONUS', 190, 19, arc, this.cGold);
        s.text(String(g.bonus), 222, 19, arc, g.bonus < 500 && g.p === Phase.Play ? this.cRed : this.cGoldHi);
        // runners left: an icon each (three, then +N)
        const n = g.livesLeft;
        const icons = n > 3 ? 2 : n;
        for (let i = 0; i < icons; i++) s.blit(VaultArt.RunnerFig.stand, 296 - i * 16, 11, this.pal);
        if (n > 3) s.textRight('+' + (n - 2), 278, 15, arc, this.cWhite);
        if (g.mercyActive && n <= 2) s.textRight('FREE', 296 - 16 * Math.max(1, n) + 12, 15, arc, this.cGold);
        s.dottedRule(8, 312, 30, 3, g.alarm && SurfaceDraw.blink(t, 2) ? this.cRed : this.cBrickHi);
    }

    // ------------------------------------------------------------------ the cards
    _drawVaultCard(s, g, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const def = VAULTS[g.vault];
        s.checker(OX, OY, FW, FH, this.cBg, 0);
        const x0 = 32, y0 = OY + 18, w = 256, h = 156;
        s.plate(x0, y0, w, h, this.cBg, this.cBrickHi);
        s.frame(x0 + 2, y0 + 2, w - 4, h - 4, this.cBrickHi);
        const last = g.vault === VAULTS.length - 1;
        s.textCentered(last ? 'THE LAST VAULT' : 'VAULT ' + (g.vault + 1) + ' OF ' + VAULTS.length, 160, y0 + 10, arc, last ? this.cRed : this.cBrickHi);
        const k = arc.measure(def.name, 2) <= w - 16 ? 2 : 1;
        s.textCenteredShadow(def.name, 160, y0 + 24, arc, this.cGoldHi, this.cGoldLo, k);
        s.dottedRule(x0 + 24, x0 + w - 24, y0 + 44, 3, this.cBrickHi);
        this._drawFeature(s, def.feature, 160, y0 + 54, t);
        s.textCentered(def.hint, 160, y0 + 112, arc, this.cWhite);
        const sub = g.livesLeft === 1 ? 'LAST RUNNER' : g.livesLeft + ' RUNNERS';
        s.textCentered(sub + '   BONUS ' + g.bonus, 160, y0 + 132, arc, this.cGold);
        if (g.vault === 0 && SurfaceDraw.blink(t, 1)) s.text('GET READY', 160 - idiv(arc.measure('GET READY'), 2), y0 + h + 4, arc, this.cWhite);
        void dsp;
    }

    // the new thing, as a little picture (about 96 x 48, centred on cx, top at y)
    _drawFeature(s, f, cx, y, t) {
        const A = VaultArt, pal = this.pal;
        const x = cx - 48;
        const brick = (bx, by) => s.blit(A.Brick, bx, by, pal);
        if (f === 'trap') {
            s.blit(VaultDiggerSpec.titleArt, x, y + 6, pal);
        } else if (f === 'stone') {
            // runner on stone, a hole dug through the brick, the gold beneath it
            for (let k = 0; k < 6; k++) if (k !== 3) s.blit(k < 3 ? A.Rock : A.Brick, x + k * T, y + 16, pal);
            s.rect(x + 3 * T, y + 16, 2, 2, this.cBrickLo); s.rect(x + 4 * T - 2, y + 16, 2, 2, this.cBrickLo);
            for (let k = 0; k < 6; k++) s.blit(A.Rock, x + k * T, y + 40, pal);
            s.blit(A.Gold, x + 3 * T + 1, y + 30, pal);
            s.blit(A.RunnerFig.dig, x + 2 * T, y, pal);
        } else if (f === 'sack') {
            for (let k = 0; k < 6; k++) if (k !== 3) brick(x + k * T, y + 32);
            s.rect(x + 3 * T, y + 32, 2, 2, this.cBrickLo); s.rect(x + 4 * T - 2, y + 32, 2, 2, this.cBrickLo);
            s.blit(A.GuardFig.fall, x + 3 * T, y + 30, pal);
            s.blit(A.Gold, x + 3 * T + 1, y + 20, pal);
            s.blit(A.GuardFig.run1, x + 5 * T, y + 16, pal, 1, true);
            s.blit(A.Sack, x + 5 * T + 9, y + 21, pal);
            s.blit(A.RunnerFig.dig, x + T, y + 16, pal);
        } else if (f === 'crack') {
            for (let k = 0; k < 6; k++) s.blit(k === 3 ? A.Crack : A.Brick, x + k * T, y + 20, pal);
            s.blit(A.RunnerFig.fall, x + 3 * T, y + 6 + (Math.trunc(f32(t * 2)) % 2) * 2, pal);
            s.blit(A.RunnerFig.run1, x + T, y + 4, pal);
        } else if (f === 'belt') {
            for (let k = 0; k < 6; k++) this._drawBelt(s, x + k * T, y + 28, 1, t, true);
            s.blit(A.RunnerFig.stand, x + T + (Math.trunc(f32(t * 35)) % 64), y + 12, pal);
            s.blit(A.Gold, x + 4 * T + 1, y + 18, pal);
        } else if (f === 'warden') {
            for (let k = 0; k < 6; k++) if (k !== 2) brick(x + k * T, y + 28);
            s.rect(x + 2 * T, y + 28, 2, 2, this.cBrickLo); s.rect(x + 3 * T - 2, y + 28, 2, 2, this.cBrickLo);
            s.blit(A.WardenFig.run1, x + 2 * T, y + 12, pal, 1, true);
            s.blit(A.Key, x + 5 * T - 2, y + 20, pal);
            this._drawDoor(s, { doorOpen: false, doorT: 0 }, x - 2, y + 12);
        } else if (f === 'crown') {
            s.blit(A.Crown, cx - 13, y + 8, pal, 2);
            if (mod1f(f32(t * f32(0.8))) < f32(0.3)) s.blit(A.Glint, cx + 6, y + 2, pal);
            for (let k = 0; k < 3; k++) s.blit(A.GuardFig.stand, x + k * 12 - 24, y + 26, pal);
            for (let k = 0; k < 2; k++) s.blit(A.GuardFig.stand, x + 96 + 8 + k * 12, y + 26, pal, 1, true);
        }
    }

    _drawTally(s, g, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const T2 = g.tally;
        const x0 = 48, y0 = OY + 28, w = 224, h = 136;
        s.plate(x0, y0, w, h, this.cBg, this.cGold);
        s.frame(x0 + 2, y0 + 2, w - 4, h - 4, this.cGold);
        s.textCentered('VAULT ' + (g.vault + 1) + ' CLEARED', 160, y0 + 10, dsp, this.cGoldHi);
        s.textCentered(VAULTS[g.vault].name, 160, y0 + 24, arc, this.cGold);
        for (let i = 0; i < T2.lines.length; i++) {
            if (i > T2.i) break;
            const L = T2.lines[i], y = y0 + 44 + i * 18;
            s.text(L.label, x0 + 14, y, arc, this.cWhite);
            s.dottedRule(x0 + 14 + arc.measure(L.label) + 4, x0 + w - 62, y + 6, 3, this.cBrickHi);
            s.textRight(String(L.shown), x0 + w - 14, y, dsp, L.value === 0 ? this.cRedLo : this.cGoldHi);
        }
        s.textCentered('SCORE ' + d6(g.score), 160, y0 + h - 22, arc, this.cWhite, 2);
    }

    _drawResult(s, g, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        const spec = VaultDiggerSpec, m = g.map;
        const midX = 160, midY = OY + idiv(FH, 2);
        const won = g.roundWon;
        if (won) {
            s.textBox(spec.roundWonText, midX, midY - 50, dsp, 2, this.cGoldHi, this.cGold, this.cBg);
            s.plate(midX - 96, midY - 22, 192, 74, this.cBg, this.cGold);
            s.blit(VaultArt.Crown, midX - 13, midY - 14, this.pal, 2);
            s.textCentered('SCORE ' + d6(g.score), midX, midY + 10, arc, this.cWhite, 2);
            s.textCentered('ALL ' + VAULTS.length + ' VAULTS   GOLD ' + g.goldTaken, midX, midY + 32, arc, this.cGold);
        } else {
            s.textBox(spec.roundLostText, midX, midY - 40, dsp, 3, this.cRed, this.cRed, this.cBg);
            s.plate(midX - 96, midY - 6, 192, 54, this.cBg, this.cRed);
            s.textCentered('SCORE ' + d6(g.score), midX, midY + 2, arc, this.cWhite, 2);
            s.textCentered('VAULT ' + (g.vault + 1) + '  ' + VAULTS[g.vault].name, midX, midY + 22, arc, this.cGold);
            s.blit(VaultArt.Gold, midX - 30, midY + 33, this.pal);
            s.text(String(g.goldTaken), midX - 10, midY + 35, arc, this.cGoldHi);
            s.text('GOLD', midX + 14, midY + 35, arc, this.cGold);
        }
        void m;
    }
}
