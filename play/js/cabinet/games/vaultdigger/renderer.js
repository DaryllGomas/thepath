// THE NODE · world 1 · VAULT DIGGER on the Cabinet Engine · THE PICTURE.
// Port of VaultDiggerRenderer.cs from Staging/Batch2/vaultdigger (VaultArt itself lives in spec.js).
//
// Sized for a curved tube seen from 0.8 m: the vault is 18 x 12 tiles of 16 px (288 x 192) at (16, 34),
// filling the safe area under a 20 px HUD band; the runner and the guards are full-tile 16 x 16
// sprites with 2 px limbs; gold is a 14 x 10 stack of bars. Every colour comes from the palette.
//
//   HUD    1UP + the score in display digits x2 | a gold stack + the gold still to take x2 | one
//          runner icon per life
//   DIG    the brick breaks top-down with chips flying; the open hole is black; in its last 0.8 s the
//          brick grows back bottom-up in three steps
//   TRAP   a trapped guard stands in the hole, arms up; it shakes in its last 0.6 s
//   EXIT   the ladder rises out of the top rung by rung, drawn in gold, with EXIT beside it
//   CAUGHT the runner flashes gold/white at 2.5 Hz (under the 3 Hz floor), then lies down
//   Cards  READY / CAUGHT / VAULT CLEARED / ROUND WON / GAME OVER on double-framed plates
import { f32, idiv, roundEven, d6, dn, PixelFont, SurfaceDraw, Dir4 } from '../../sdk/index.js';
import { VaultDiggerPalette, VaultDiggerSpec, VaultArt } from './spec.js';
import { VaultDiggerSim, VaultMap, Tile, GState } from './sim.js';

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
        this.cGold = pal.get('gold'); this.cGoldHi = pal.get('goldHi'); this.cGoldLo = pal.get('goldLo');
        this.cRed = pal.get('red'); this.cRedLo = pal.get('redLo'); this.cWhite = pal.get('white'); this.cShade = pal.get('shade'); this.cLadder = pal.get('ladder');
        this.goldPoints = VaultDiggerSim.GoldPoints;
    }

    draw(sim, s, t) {
        const g = sim;
        s.noClip();
        s.clear(this.cBg);
        if (g == null || g.map == null) return;
        const P = g.p;
        const m = g.map;

        this._drawVault(s, g, t);

        // ---- actors (clipped to the vault so the escape climbs out of sight)
        s.clip(OX, OY, FW, FH);
        for (const gd of g.guards) this._drawGuard(s, g, gd, t);
        const gone = g.roundWon && (P === Phase.Card || P === Phase.Over);   // out of the top
        if (!gone) this._drawRunner(s, g, t);
        s.noClip();

        // ---- score popups
        for (const p of g.popups) {
            const txt = String(p.value);
            const px = OX + Math.trunc(f32(p.x * T)) + idiv(T, 2), py = OY + Math.trunc(f32(p.y * T)) - 2 - Math.trunc(f32(p.t * 12));
            s.textCenteredShadow(txt, px, py, PixelFont.Arcade, p.value >= this.goldPoints ? this.cGoldHi : this.cWhite, this.cBg);
        }

        this._drawHud(s, g, t);

        // ---- overlays
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        const midX = 160, midY = OY + idiv(FH, 2);
        if (P === Phase.Ready) {
            s.textBox('READY', midX, midY - 30, dsp, 3, this.cGoldHi, this.cBrickHi, this.cBg);
            const sub = g.livesLeft === 1 ? 'LAST RUNNER' : g.livesLeft + ' RUNNERS';
            s.plate(midX - 70, midY + 2, 140, 20, this.cBg, this.cBrickHi);
            s.textCentered(sub, midX, midY + 9, arc, this.cWhite);
            if (g.mercyActive) {
                s.plate(midX - 84, midY + 26, 168, 20, this.cBg, this.cGold);
                s.textCentered('FREE RUN  GUARDS NAPPING', midX, midY + 33, arc, this.cGold);
            }
            // which one is you
            const r = g.runner;
            const hx = OX + r.x * T + idiv(T, 2), hy = OY + r.y * T - 10;
            if (SurfaceDraw.blink(t, 1)) s.textCenteredShadow('YOU', hx, hy, arc, this.cWhite, this.cBg);
        } else if (P === Phase.Caught && g.phaseTime > f32(0.5)) {
            s.textBox(g.deathByHole ? 'BURIED' : 'CAUGHT', midX, midY - 30, dsp, 3, this.cRed, this.cRed, this.cBg);
            const sub = g.livesLeft - 1 <= 0 ? 'NO RUNNERS LEFT' : (g.livesLeft - 1) + (g.livesLeft - 1 === 1 ? ' RUNNER LEFT' : ' RUNNERS LEFT');
            s.plate(midX - 70, midY + 2, 140, 20, this.cBg, this.cRed);
            s.textCentered(sub, midX, midY + 9, arc, this.cWhite);
        } else if (P === Phase.Escape) {
            s.textBox('VAULT CLEARED', midX, midY - 14, dsp, 2, this.cGoldHi, this.cGold, this.cBg);
        } else if (P === Phase.Card || P === Phase.Over) {
            const spec = VaultDiggerSpec;
            const won = g.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, midY - 34, dsp, 3, won ? this.cGoldHi : this.cRed, won ? this.cGold : this.cRed, this.cBg);
            s.plate(midX - 86, midY - 2, 172, 50, this.cBg, won ? this.cGold : this.cRed);
            s.textCentered('SCORE ' + d6(g.score), midX, midY + 5, arc, this.cWhite, 2);
            s.blit(VaultArt.Gold, midX - 52, midY + 25, this.pal);
            s.text(g.goldTaken + '/' + m.goldTotal, midX - 30, midY + 26, dsp, this.cGoldHi, 1);
            s.text('GOLD', midX + 20, midY + 27, arc, this.cGold);
        }
    }

    // ------------------------------------------------------------------ the vault
    _drawVault(s, g, t) {
        const m = g.map;
        for (let y = 0; y < VaultMap.H; y++)
            for (let x = 0; x < VaultMap.W; x++) {
                const px = OX + x * T, py = OY + y * T;
                const i = VaultMap.idx(x, y);
                switch (m.at(x, y)) {
                    case Tile.Brick: this._drawBrick(s, g, x, y, px, py); break;
                    case Tile.Rock: s.blit(VaultArt.Rock, px, py, this.pal); break;
                    case Tile.Ladder: s.blit(VaultArt.Ladder, px, py, this.pal); break;
                    case Tile.Bar: s.blit(VaultArt.Bar, px, py, this.pal); break;
                    case Tile.Exit: if (m.exitOpen) this._drawExit(s, m, x, y, px, py, t); break;
                }
                if (m.gold[i] > 0) {
                    s.blit(VaultArt.Gold, px + 1, py + 6, this.pal);
                    // a slow glint walks over the gold (one flash every 3 s per piece)
                    const inner = f32(f32(t * f32(0.33)) + f32((x * 7 + y * 3) * f32(0.13)));
                    const ph = mod1f(inner);
                    if (ph < f32(0.12)) s.blit(VaultArt.Glint, px + 9, py + 3, this.pal);
                }
            }
    }

    _drawBrick(s, g, x, y, px, py) {
        const m = g.map;
        const i = VaultMap.idx(x, y);
        // being dug: the brick breaks from the top, chips fly
        if (g.digging && g.digX === x && g.digY === y) {
            const k = f32(1 - f32(g.digT / Math.max(f32(0.01), g.digSeconds)));
            const gone = Math.min(T, Math.trunc(f32(f32(k * T) * f32(1.1))));
            s.clip(px, py + gone, T, T - gone);
            s.blit(VaultArt.Brick, px, py, this.pal);
            s.noClip();
            for (let c = 0; c < 6; c++) {
                const cx = px + 2 + ((c * 5 + Math.trunc(f32(k * 9))) % 12);
                const cy = py + gone - 2 - Math.trunc(f32(k * (6 + c * 2)));
                s.rect(cx, cy, 2, 2, c % 2 === 0 ? this.cBrickHi : this.cBrick);
            }
            return;
        }
        const left = m.holeT[i];
        if (left <= 0) { s.blit(VaultArt.Brick, px, py, this.pal); return; }
        // open: black, with its broken lips; the last 0.8 s it grows back from the bottom
        if (left < f32(0.8)) {
            const stage = left < f32(0.27) ? 3 : left < f32(0.53) ? 2 : 1;
            const h = stage * 5;
            s.clip(px, py + T - h, T, h);
            s.blit(VaultArt.Brick, px, py, this.pal);
            s.noClip();
        }
        s.rect(px, py, 2, 2, this.cBrickLo); s.rect(px + T - 2, py, 2, 2, this.cBrickLo);
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
        s.clip(px, py + T - h, T, h);
        s.blit(VaultArt.ExitLadder, px, py, this.pal);
        s.noClip();
        if (y === 0 && shown >= tiles && SurfaceDraw.blink(t, 1)) {
            s.textShadow('EXIT', px + T + 3, py + 4, PixelFont.Arcade, this.cGoldHi, this.cBg);
            s.textShadow('EXIT', px - 27, py + 4, PixelFont.Arcade, this.cGoldHi, this.cBg);
        }
    }

    // ------------------------------------------------------------------ actors
    _drawRunner(s, g, t) {
        const r = g.runner;
        const fig = VaultArt.RunnerFig;
        const px = OX + Math.trunc(roundEven(f32(r.fx * T))), py = OY + Math.trunc(roundEven(f32(f32(r.fy + g.escapeY) * T)));
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
        if (a.moving) return Math.trunc(f32(a.anim * 3)) % 2 === 0 ? fig.run1 : fig.run2;
        return fig.stand;
    }

    _drawGuard(s, g, gd, t) {
        if (gd.s === GState.Dead) return;
        const fig = VaultArt.GuardFig;
        let px = OX + Math.trunc(roundEven(f32(gd.fx * T))), py = OY + Math.trunc(roundEven(f32(gd.fy * T)));
        const flip = gd.face < 0;
        let spr;
        if (gd.s === GState.Trapped) {
            spr = fig.fall;
            if (gd.t < f32(0.6)) px += Math.trunc(f32(gd.t * 8)) % 2 === 0 ? 1 : -1;   // the struggle before it climbs out
        } else if (gd.s === GState.Climb) spr = fig.climb;
        else spr = this._poseFor(g, gd, fig, false);
        const climbFlip = spr === fig.climb && Math.trunc(f32(gd.anim * 3)) % 2 === 1;
        s.blit(spr, px, py, this.pal, 1, spr === fig.climb ? climbFlip : flip);
        if (gd.carry) s.blit(VaultArt.Nugget, px + 5, py + 9, this.pal);
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, g, t) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 8, 13, arc, this.cRed);
        s.text(d6(g.score), 30, 10, dsp, this.cWhite, 2);
        // gold still to take
        s.blit(VaultArt.Gold, 142, 13, this.pal);
        s.text(dn(g.goldLeft, 2), 160, 10, dsp, g.map.exitOpen ? this.cGold : this.cGoldHi, 2);
        // runners left: one icon each
        for (let i = 0; i < g.livesLeft && i < 5; i++)
            s.blit(VaultArt.RunnerFig.stand, 312 - 16 - i * 16, 11, this.pal);
        if (g.mercyActive) s.textRight('FREE', 312 - 16 * Math.max(1, g.livesLeft) - 4, 15, arc, this.cGold);
        s.dottedRule(8, 312, 30, 3, this.cBrickHi);
    }
}
