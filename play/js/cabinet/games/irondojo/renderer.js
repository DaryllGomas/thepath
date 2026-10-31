// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) · THE PICTURE.
// Built out (2026-10-18) from the port of IronDojoRenderer.cs (Staging/Batch3/irondojo); the sprites are in sprites.js.
//
// A floor of the pagoda, side on, scrolling with the fighter. Five halls, one a floor (floors.js `theme`):
//   0 THE RED HALL      the 1985 board's room: dojo-red panels between dark pillars, lanterns, hanging scrolls, tan planks
//   1 THE LANTERN HALL  lacquer in shadow, big paper lanterns glowing on their ropes, a dark plank floor
//   2 THE MIRROR ROOM   tall mirrors in gold frames (your own silhouette moves in them), black lacquer, polished boards
//   3 THE BAMBOO ROOF   out under the night: the moon, stars, far hills, a bamboo grove behind the rail, a tiled roof
//   4 THE GOLDEN HALL   black lacquer and gold, plum curtains, a great sun disk, red pillars with gold caps
// Even floors fight RIGHT: the whole play window is drawn as the sim sees it (always leftward) and then flipped, row by
// row; the words in it (score pop-ups, SHAKE, the floor plaque) are drawn after the flip, at the mirrored x.
//   - HUD band y 8..49: 1UP + the score in display digits x2, the floor TIME (red under ten seconds; a colour change,
//     never a flash), the CHAIN multiplier, FLOOR n and the lives as little headband heads, then ENERGY and, once he
//     wakes, the master's bar
//   - characters are palette sprites at x2 (the giant x3); a struck one shows white for a frame or two
//   - the masters' TELLS: a steady "!" over him for the whole wind-up (gold; red for the iron master's counter, orange
//     for his palm of fire) plus his pose (the stick raised, the ring cocked high or low, the giant's fists overhead)
//   - pots sway on their ropes and cast a shadow that grows as they fall; a glint at the edge ahead means a blade;
//     leaves stream before a gust
//   - THE CARD before each floor: its number, its name, a two-line hint, its master, and the pagoda with the floors
//     climbed, the floor lit and the floors to come. THE TALLY on the stairs. GET READY, KNOCKED OUT, TIME UP, the won
//     card (DOJO CONQUERED, the pagoda all lit) and GAME OVER on double-framed plates. Blinks run at 1 Hz; nothing strobes.
import { f32, d6, dn, idiv, roundEven, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { IronDojoPalette, IronDojoSpec } from './spec.js';
import { IronDojoSprites as S } from './sprites.js';
import { IronDojoSim, Act, FoeKind, FoeState, BossState, BossKind, Atk, ShotKind } from './sim.js';
import { FLOORS, BOSSES, FloorCount } from './floors.js';

const PlayLeft = 8, PlayTop = 52, PlayW = 304, PlayBottom = 232, FloorY = 206;
const K = 2;                                        // sprite scale: chunky pixels for a curved tube at 0.8 m
const Phase = IronDojoSim.Phase;
const C = IronDojoSim.C;
const PunchPoseAt = f32(C.PunchStart * f32(0.6));
const SeamY = [212, 219, 227];
const BandTop = [206, 213, 220, 228];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function snap(v, step) { let m = v % step; if (m < 0) m += step; return v - m; }
function hash(n) { n = Math.imul(n ^ 0x9E3779B9, 0x85EBCA6B); n ^= n >>> 13; n = Math.imul(n, 0xC2B2AE35); return (n ^ (n >>> 16)) >>> 0; }
function tri(x) { const p = x - Math.floor(x); return p < 0.5 ? p * 2 : 2 - p * 2; }

export class IronDojoRenderer {
    constructor() {
        const pal = this.pal = IronDojoPalette;
        this.cBg = pal.get('shadow'); this.cShadowRed = pal.get('shadowRed'); this.cDojo = pal.get('dojoRed'); this.cRed = pal.get('red');
        this.cWood = pal.get('woodDark'); this.cTanDark = pal.get('tanDark'); this.cTan = pal.get('tan'); this.cWhite = pal.get('white');
        this.cGrey = pal.get('grey'); this.cGoldDark = pal.get('goldDark'); this.cGold = pal.get('gold');
        this.cNight = pal.get('night'); this.cNavy = pal.get('navy'); this.cSteel = pal.get('steel'); this.cMoon = pal.get('moon');
        this.cBambooDark = pal.get('bambooDark'); this.cBamboo = pal.get('bamboo'); this.cJade = pal.get('jade');
        this.cPlum = pal.get('plum'); this.cViolet = pal.get('violet'); this.cOrange = pal.get('orange');
        this._u = null; this._uFor = null;          // a 32-bit view of the surface, for the mirror and the shake
        this._plaqueX = -999;
    }

    draw(sim, s, t) {
        s.noClip();
        s.clear(this.cBg);
        const r = sim;
        if (r == null || r.f == null) return;
        t = f32(t);
        const cam = r.cam;

        s.clip(PlayLeft, PlayTop, PlayW, PlayBottom - PlayTop);
        this._drawRoom(s, cam, r, t);
        this._drawPotShadows(s, r);
        this._drawShadows(s, r);
        this._drawPickups(s, r, t);
        this._drawBoss(s, r, t);
        for (const e of r.foes) if (e.s !== FoeState.Hold) this._drawFoe(s, r, e);
        this._drawFighter(s, r, t);
        for (const e of r.foes) if (e.s === FoeState.Hold) this._drawFoe(s, r, e);   // a hug goes over the fighter
        this._drawPots(s, r, t);
        for (const k of r.shots) this._drawShot(s, cam, k, t);
        this._drawGlint(s, r);
        this._drawFx(s, r);
        this._drawWind(s, r, t);
        if (r.mirror) this._mirror(s);
        if (r.shake > 0) this._shake(s, r, t);
        this._drawWorldText(s, r, t);
        s.noClip();

        this._drawHud(s, r);
        this._drawOverlays(s, r, t);
    }

    // ------------------------------------------------------------------ the picture's two post passes
    _view(s) {
        if (this._uFor !== s) { this._u = new Uint32Array(s.data.buffer, s.data.byteOffset, s.width * s.height); this._uFor = s; }
        return this._u;
    }

    // the play window, flipped left for right (an even floor runs the other way)
    _mirror(s) {
        const u = this._view(s), w = s.width;
        for (let y = PlayTop; y < PlayBottom; y++) {
            const row = y * w;
            for (let i = row + PlayLeft, j = row + PlayLeft + PlayW - 1; i < j; i++, j--) { const v = u[i]; u[i] = u[j]; u[j] = v; }
        }
    }

    // a jolt: the play window bumps down and back (a slam, a master falling, a knockout), a few pixels, eased out
    _shake(s, r, t) {
        const amp = Math.min(3, Math.ceil(r.shake * 7));
        const dy = Math.round(amp * (tri(f32(t * 9)) * 2 - 1));
        if (dy === 0) return;
        const u = this._view(s), w = s.width, bg = this.cBg.packed;
        if (dy > 0) {
            for (let y = PlayBottom - 1; y >= PlayTop; y--) {
                const src = y - dy;
                if (src >= PlayTop) u.copyWithin(y * w + PlayLeft, src * w + PlayLeft, src * w + PlayLeft + PlayW);
                else u.fill(bg, y * w + PlayLeft, y * w + PlayLeft + PlayW);
            }
        } else {
            for (let y = PlayTop; y < PlayBottom; y++) {
                const src = y - dy;
                if (src < PlayBottom) u.copyWithin(y * w + PlayLeft, src * w + PlayLeft, src * w + PlayLeft + PlayW);
                else u.fill(bg, y * w + PlayLeft, y * w + PlayLeft + PlayW);
            }
        }
    }

    // screen x of a world x, after the mirror
    _sx(r, worldX) { const x = r.cam.toScreen(worldX); return r.mirror ? 319 - x : x; }

    // ------------------------------------------------------------------ the rooms
    _drawRoom(s, cam, r, t) {
        const camPx = cam.camPx;
        switch (r.fl.theme) {
            case 1: this._roomLantern(s, camPx, t); break;
            case 2: this._roomMirror(s, camPx, r); break;
            case 3: this._roomRoof(s, camPx, t); break;
            case 4: this._roomGold(s, camPx, t); break;
            default: this._roomRed(s, camPx); break;
        }
        this._drawStairs(s, camPx, r.fl.theme);
        this._drawDoor(s, camPx, r.floorLength, r.fl.theme);
    }

    // the 1985 board's room, as it was
    _roomRed(s, camPx) {
        const x0 = PlayLeft;
        s.rect(x0, 52, PlayW, 12, this.cBg);
        s.rect(x0, 62, PlayW, 2, this.cWood);
        for (let wx = snap(camPx - 64, 64); wx < camPx + 336; wx += 64) {
            const sx = wx - camPx;
            s.rect(sx, 52, 8, 10, this.cWood);
            s.rect(sx + 1, 53, 6, 1, this.cTanDark);
        }
        s.rect(x0, 64, PlayW, 84, this.cDojo);
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) {
            const sx = wx - camPx;
            s.frame(sx + 22, 74, 94, 64, this.cShadowRed);
            s.frame(sx + 23, 75, 92, 62, this.cShadowRed);
            s.rect(sx + 26, 78, 86, 1, this.cRed);
        }
        for (let wx = snap(camPx - 384, 384) + 128; wx < camPx + 704; wx += 384) {
            const sx = wx - camPx + 58;
            s.rect(sx - 1, 78, 24, 2, this.cWood);
            s.rect(sx, 80, 22, 50, this.cShadowRed);
            s.frame(sx, 80, 22, 50, this.cGoldDark);
            s.circle(sx + 11, 96, 6, this.cGold, false);
            s.circle(sx + 11, 96, 3, this.cGold, true);
            s.rect(sx + 10, 106, 2, 18, this.cGold);
            s.rect(sx + 6, 112, 10, 2, this.cGold);
        }
        this._pillars(s, camPx, this.cWood, this.cTanDark, this.cBg);
        s.rect(x0, 148, PlayW, 4, this.cWood);
        s.rect(x0, 148, PlayW, 1, this.cTanDark);
        s.rect(x0, 152, PlayW, 52, this.cTanDark);
        for (let wx = snap(camPx - 16, 16); wx < camPx + 336; wx += 16) s.rect(wx - camPx, 152, 1, 52, this.cWood);
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) s.rect(wx - camPx - 7, 148, 14, 58, this.cWood);
        s.rect(x0, 202, PlayW, 4, this.cWood);
        for (let wx = snap(camPx - 256, 256) + 64; wx < camPx + 576; wx += 256) this._lantern(s, wx - camPx, 64);
        this._planks(s, camPx, this.cTan, this.cTanDark, this.cWood);
    }

    _pillars(s, camPx, body, lit, cap) {
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) {
            const sx = wx - camPx;
            s.rect(sx - 7, 64, 14, 142, body);
            s.rect(sx - 5, 64, 2, 142, lit);
            s.rect(sx - 7, 64, 14, 3, cap);
        }
    }

    // the floor: planks, seams widening toward the viewer
    _planks(s, camPx, top, seam, edge) {
        const x0 = PlayLeft;
        s.rect(x0, 206, PlayW, 26, top);
        for (const y of SeamY) s.rect(x0, y, PlayW, 1, seam);
        for (let band = 0; band < BandTop.length; band++) {
            const bh = (band < SeamY.length ? SeamY[band] : 232) - BandTop[band];
            const off = band * 21;
            for (let wx = snap(camPx - 64 - off, 64) + off; wx < camPx + 336; wx += 64) s.rect(wx - camPx, BandTop[band], 1, bh, seam);
        }
        s.rect(x0, 230, PlayW, 2, edge);
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

    // lacquer in shadow, slats and a gold rail, round paper lanterns low on their ropes, a dark floor
    _roomLantern(s, camPx, t) {
        const x0 = PlayLeft;
        s.rect(x0, 52, PlayW, 12, this.cBg);
        for (let wx = snap(camPx - 48, 48); wx < camPx + 336; wx += 48) {
            const sx = wx - camPx;
            s.rect(sx, 52, 6, 12, this.cWood);
            s.rect(sx + 1, 53, 4, 1, this.cGoldDark);
        }
        s.rect(x0, 62, PlayW, 2, this.cGoldDark);
        s.rect(x0, 64, PlayW, 84, this.cShadowRed);
        for (let wx = snap(camPx - 32, 32); wx < camPx + 336; wx += 32) s.rect(wx - camPx + 14, 64, 2, 84, this.cDojo);
        s.rect(x0, 98, PlayW, 2, this.cGoldDark);
        s.rect(x0, 100, PlayW, 1, this.cBg);
        this._pillars(s, camPx, this.cWood, this.cShadowRed, this.cGoldDark);
        s.rect(x0, 148, PlayW, 3, this.cGoldDark);
        s.rect(x0, 151, PlayW, 53, this.cWood);
        for (let wx = snap(camPx - 64, 64); wx < camPx + 336; wx += 64) {
            const sx = wx - camPx;
            s.frame(sx + 12, 158, 40, 38, this.cShadowRed);
            s.rect(sx + 14, 160, 36, 1, this.cTanDark);
        }
        s.rect(x0, 202, PlayW, 4, this.cBg);
        // the big lanterns: round, on ropes of three lengths, a warm core
        for (let wx = snap(camPx - 160, 160) + 80; wx < camPx + 400; wx += 160) {
            const sx = wx - camPx, k = ((wx / 160) | 0) % 3, cy = 84 + (k < 0 ? -k : k) * 10;
            s.rect(sx, 64, 1, cy - 74, this.cTanDark);
            s.rect(sx - 3, cy - 11, 7, 2, this.cGold);
            s.circle(sx, cy, 10, this.cRed, true);
            s.circle(sx, cy, 10, this.cDojo, false);
            s.rect(sx - 9, cy - 4, 19, 1, this.cDojo); s.rect(sx - 9, cy + 4, 19, 1, this.cDojo);
            s.circle(sx, cy, 4, this.cOrange, true);
            s.rect(sx - 1, cy - 1, 3, 3, this.cGold);
            s.rect(sx - 3, cy + 10, 7, 2, this.cGold);
            s.rect(sx, cy + 12, 1, 4, this.cRed);
        }
        this._planks(s, camPx, this.cTanDark, this.cWood, this.cBg);
        s.rect(x0, 206, PlayW, 1, this.cTan);
    }

    // tall mirrors in gold frames on black lacquer; the fighter's silhouette moves in the glass
    _roomMirror(s, camPx, r) {
        const x0 = PlayLeft;
        s.rect(x0, 52, PlayW, 12, this.cBg);
        s.rect(x0, 60, PlayW, 1, this.cSteel);
        s.rect(x0, 62, PlayW, 2, this.cGoldDark);
        s.rect(x0, 64, PlayW, 84, this.cBg);
        const fsx = r.cam.toScreen(r.f.x);
        for (let wx = snap(camPx - 96, 96); wx < camPx + 416; wx += 96) {
            const sx = wx - camPx + 16, mx = sx + 4, my = 74, mw = 56, mh = 70;
            s.rect(sx, 70, 64, 78, this.cGoldDark);
            s.frame(sx, 70, 64, 78, this.cGold);
            s.rect(mx, my, mw, mh, this.cSteel);
            // the reflection: the fighter, a navy silhouette standing on the glass's floor line
            if (fsx > mx - 20 && fsx < mx + mw + 20 && r.f.a !== Act.Climb) {
                s.clip(Math.max(PlayLeft, mx), my, Math.min(mx + mw, PlayLeft + PlayW) - Math.max(PlayLeft, mx), mh);
                const p = this._fighterPose(r.f, 0);
                const flip = r.f.dir < 0, w = p.s.width;
                const bx = flip ? fsx - (w - 1 - p.ax) : fsx - p.ax;
                s.blitTinted(p.s, bx - 1, my + mh - 4 - p.s.height * 2 - Math.trunc(r.f.h * 0.5), this.cNavy, 2, flip);
                s.clip(PlayLeft, PlayTop, PlayW, PlayBottom - PlayTop);
            }
            s.line(mx + 8, my + mh - 1, mx + 30, my + 10, this.cMoon);
            s.line(mx + 14, my + mh - 1, mx + 36, my + 10, this.cMoon);
            s.line(mx + 40, my + 30, mx + 52, my + 4, this.cMoon);
            s.rect(mx, my, mw, 1, this.cMoon);
            s.rect(sx - 1, 69, 3, 3, this.cGold); s.rect(sx + 62, 69, 3, 3, this.cGold);
        }
        for (let wx = snap(camPx - 96, 96) + 88; wx < camPx + 416; wx += 96) {
            const sx = wx - camPx;
            s.rect(sx - 4, 64, 8, 142, this.cBg);
            s.rect(sx - 4, 64, 1, 142, this.cNavy);
            s.rect(sx - 5, 96, 10, 2, this.cGold); s.rect(sx - 5, 140, 10, 2, this.cGold);
        }
        s.rect(x0, 148, PlayW, 3, this.cGold);
        s.rect(x0, 151, PlayW, 53, this.cNavy);
        for (let wx = snap(camPx - 48, 48); wx < camPx + 336; wx += 48) {
            const sx = wx - camPx;
            s.frame(sx + 6, 156, 36, 42, this.cSteel);
            s.rect(sx + 8, 158, 1, 38, this.cBg);
        }
        s.rect(x0, 202, PlayW, 4, this.cBg);
        this._planks(s, camPx, this.cWood, this.cShadowRed, this.cBg);
        s.rect(x0, 206, PlayW, 1, this.cSteel);
        for (let wx = snap(camPx - 96, 96) + 30; wx < camPx + 336; wx += 96) s.rect(wx - camPx, 209, 18, 1, this.cTanDark);
    }

    // out under the night: the moon, stars, far hills, a bamboo grove behind the rail, a tiled roof underfoot
    _roomRoof(s, camPx, t) {
        const x0 = PlayLeft;
        s.rect(x0, 52, PlayW, 154, this.cNight);
        const far = Math.trunc(camPx * 0.12);
        for (let i = 0; i < 40; i++) {
            const h = hash(i * 7 + 3);
            const sx = PlayLeft + ((h % 420) - (far % 420) + 420) % 420 - 50, sy = 56 + ((h >>> 9) % 70);
            s.setPixel(sx, sy, (h & 7) === 0 ? this.cWhite : this.cMoon);
        }
        const mx = 236 - Math.trunc(camPx * 0.05) % 80;
        s.circle(mx, 82, 13, this.cMoon, true);
        s.rect(mx - 4, 76, 3, 2, this.cSteel); s.rect(mx + 3, 86, 4, 2, this.cSteel); s.rect(mx - 6, 88, 2, 2, this.cSteel);
        // the hills (navy), then the grove (two greens, jade leaves), then the rail
        const hp = Math.trunc(camPx * 0.3);
        for (let x = PlayLeft; x < PlayLeft + PlayW; x += 2) {
            const wx = x + hp, hy = 130 + Math.trunc(16 * tri(wx / 190)) + Math.trunc(6 * tri(wx / 47));
            s.rect(x, hy, 2, 206 - hy, this.cNavy);
        }
        const gp = Math.trunc(camPx * 0.6);
        for (let wx = snap(gp - 24, 24); wx < gp + 336; wx += 24) {
            const h = hash(wx), sx = wx - gp + (h % 7), top = 84 + (h >>> 8) % 30;
            const dark = (h & 1) === 0;
            s.rect(sx, top, 3, 206 - top, dark ? this.cBambooDark : this.cBamboo);
            for (let y = top + 10; y < 200; y += 18) s.rect(sx - 1, y, 5, 1, this.cJade);
            const ly = top + 4 + (h >>> 12) % 20;
            s.rect(sx + 3, ly, 6, 2, this.cBamboo); s.rect(sx + 7, ly + 1, 4, 1, this.cJade);
            s.rect(sx - 6, ly + 9, 6, 2, this.cBambooDark);
        }
        s.rect(x0, 170, PlayW, 3, this.cDojo);
        s.rect(x0, 184, PlayW, 2, this.cDojo);
        for (let wx = snap(camPx - 32, 32); wx < camPx + 336; wx += 32) {
            const sx = wx - camPx;
            s.rect(sx, 166, 4, 40, this.cWood);
            s.rect(sx, 166, 4, 2, this.cGold);
        }
        // the roof: red tiles, a gold ridge
        s.rect(x0, 206, PlayW, 26, this.cDojo);
        s.rect(x0, 206, PlayW, 2, this.cGold);
        for (const y of [214, 222]) s.rect(x0, y, PlayW, 1, this.cShadowRed);
        for (let band = 0; band < 3; band++) {
            const y0 = 208 + band * 8, off = band * 5;
            for (let wx = snap(camPx - 12 - off, 10) + off; wx < camPx + 336; wx += 10) s.rect(wx - camPx, y0, 1, band === 2 ? 10 : 6, this.cShadowRed);
        }
        s.rect(x0, 230, PlayW, 2, this.cShadowRed);
    }

    // black lacquer and gold: a great sun disk, plum curtains, red pillars with gold caps
    _roomGold(s, camPx, t) {
        const x0 = PlayLeft;
        s.rect(x0, 52, PlayW, 12, this.cBg);
        for (let wx = snap(camPx - 40, 40); wx < camPx + 336; wx += 40) s.frame(wx - camPx + 2, 53, 36, 9, this.cGoldDark);
        s.rect(x0, 62, PlayW, 2, this.cGold);
        s.rect(x0, 64, PlayW, 84, this.cBg);
        const sp = Math.trunc(camPx * 0.4);
        for (let wx = snap(sp - 220, 220) + 110; wx < sp + 420; wx += 220) {
            const cx = wx - sp;
            s.circle(cx, 104, 30, this.cGoldDark, true);
            s.circle(cx, 104, 30, this.cGold, false);
            s.circle(cx, 104, 22, this.cGold, false);
            s.circle(cx, 104, 9, this.cGold, true);
            for (let k = 0; k < 8; k++) {
                const ax = [0, 1, 1, 1, 0, -1, -1, -1][k], ay = [-1, -1, 0, 1, 1, 1, 0, -1][k];
                s.line(cx + ax * 12, 104 + ay * 12, cx + ax * 20, 104 + ay * 20, this.cGold);
            }
        }
        for (let wx = snap(camPx - 192, 192) + 40; wx < camPx + 420; wx += 192) {
            const sx = wx - camPx;
            for (const side of [0, 1]) {
                const cx = sx + side * 34;
                s.rect(cx, 64, 14, 70, this.cPlum);
                s.rect(cx + 3, 64, 1, 70, this.cViolet); s.rect(cx + 9, 64, 1, 66, this.cViolet);
                s.rect(cx + (side ? 0 : 10), 120, 4, 14, this.cPlum);
                s.rect(cx + (side ? 1 : 10), 134, 3, 4, this.cGold);
            }
            s.rect(sx - 2, 64, 52, 4, this.cGold);
        }
        this._pillars(s, camPx, this.cDojo, this.cRed, this.cGold);
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) s.rect(wx - camPx - 8, 140, 16, 4, this.cGold);
        s.rect(x0, 148, PlayW, 3, this.cGold);
        s.rect(x0, 151, PlayW, 51, this.cPlum);
        for (let wx = snap(camPx - 64, 64); wx < camPx + 336; wx += 64) {
            const sx = wx - camPx;
            s.frame(sx + 10, 156, 44, 40, this.cGoldDark);
            s.rect(sx + 30, 172, 4, 4, this.cGoldDark);
        }
        for (let wx = snap(camPx - 128, 128); wx < camPx + 448; wx += 128) s.rect(wx - camPx - 7, 148, 14, 58, this.cDojo);
        s.rect(x0, 202, PlayW, 4, this.cGoldDark);
        this._planks(s, camPx, this.cWood, this.cGoldDark, this.cBg);
        s.rect(x0, 206, PlayW, 1, this.cGold);
    }

    _drawStairs(s, camPx, theme) {
        // nine steps rise up and to the left from the foot (world x 92) to the ceiling
        const foot = Math.trunc(C.StairsFootX);
        if (foot + 20 - camPx < PlayLeft) { this._plaqueX = -999; return; }
        const body = theme === 2 || theme === 4 ? this.cBg : this.cWood;
        const tread = theme === 2 ? this.cSteel : theme === 4 ? this.cGold : this.cTan;
        for (let k = 0; k < 9; k++) {
            const xr = foot - 12 * k - camPx, xl = xr - 12;
            const top = FloorY - 16 * (k + 1);
            s.rect(xl, top, 12, FloorY - top, body);
            s.rect(xl, top, 12, 3, tread);
            s.rect(xl, top + 3, 12, 1, this.cTanDark);
            s.rect(xr - 1, top, 1, 16, this.cTanDark);
        }
        for (let k = 0; k < 9; k++) {
            const xr = foot - 12 * k - camPx;
            const top = FloorY - 16 * (k + 1) - 22;
            s.line(xr, top + 16, xr - 12, top, this.cGold);
            s.line(xr, top + 17, xr - 12, top + 1, this.cGoldDark);
            if (k % 2 === 0) s.rect(xr - 1, top + 16, 2, 22, this.cGoldDark);
        }
        const ox = foot - 12 * 9 - camPx;
        s.rect(ox - 20, 52, 44, 12, this.cBg);
        this._plaqueX = foot - 62 - camPx;
        s.plate(this._plaqueX, 70, 24, 12, this.cShadowRed, this.cGold);
    }

    _drawDoor(s, camPx, floorLength, theme) {
        const sx = Math.trunc(floorLength) - 56 - camPx;
        if (sx > PlayLeft + PlayW || sx + 48 < PlayLeft) return;
        s.rect(sx - 4, 100, 48, 106, theme === 3 ? this.cDojo : this.cWood);
        s.rect(sx, 106, 40, 100, this.cBg);
        s.rect(sx - 6, 98, 52, 4, theme === 4 ? this.cGold : this.cGoldDark);
        s.rect(sx + 19, 106, 2, 100, this.cShadowRed);
    }

    // ------------------------------------------------------------------ characters
    _drawShadows(s, r) {
        const cam = r.cam;
        if (r.f.a !== Act.Climb) this._shadow(s, cam.toScreen(r.f.x), 16, this._shadowColour(r));
        for (const e of r.foes) if (e.live && e.kind !== FoeKind.Lizard) this._shadow(s, cam.toScreen(e.x), e.kind === FoeKind.Dwarf || e.kind === FoeKind.Snake ? 12 : 16, this._shadowColour(r));
        if (r.b.active || r.cam.onScreen(r.b.x, 40)) this._shadow(s, cam.toScreen(r.b.x), r.b.s === BossState.Down ? 30 : r.b.kind === BossKind.Giant ? 30 : 18, this._shadowColour(r));
    }

    _shadowColour(r) { return r.fl.theme === 0 ? this.cTanDark : r.fl.theme === 3 ? this.cShadowRed : this.cBg; }

    _shadow(s, sx, w, c) {
        s.rect(sx - idiv(w, 2) + 2, FloorY, w - 4, 1, c);
        s.rect(sx - idiv(w, 2), FloorY + 1, w, 2, c);
    }

    // draws a sprite with its anchor column over world x, its bottom at the floor minus height. tint = one colour
    // (a hit flash), dither = 0..16 (a ghost shimmering in: the 4x4 ordered dither, never a flicker)
    _put(s, cam, p, worldX, height, dir, k = K, tint = null, dither = 16) {
        const sx = cam.toScreen(worldX);
        const flip = dir < 0;
        const x0 = flip ? sx - (p.s.width - 1 - p.ax) * k : sx - p.ax * k;
        const y0 = FloorY - roundEven(height) - p.s.height * k;
        if (dither < 16) { this._blitDither(s, p.s, x0, y0, k, flip, dither); return; }
        if (tint != null) s.blitTinted(p.s, x0, y0, tint, k, flip);
        else s.blit(p.s, x0, y0, this.pal, k, flip);
    }

    _blitDither(s, sp, x, y, k, flip, level) {
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                if (BAYER[(i & 3) + ((j & 3) << 2)] >= level) continue;
                const v = sp.at(flip ? sp.width - 1 - i : i, j);
                if (v < 0) continue;
                s.rect(x + i * k, y + j * k, k, k, this.pal.at(v));
            }
    }

    _fighterPose(f, t) {
        switch (f.a) {
            case Act.Walk: return (Math.trunc(f32(f.walkClock / f32(0.13))) & 1) === 0 ? S.FighterWalk1 : S.FighterWalk2;
            case Act.Punch: return f.at < PunchPoseAt ? S.FighterStand : S.FighterPunch;
            case Act.Kick: return f.at < C.KickStart ? S.FighterChamber : S.FighterKick;
            case Act.Duck: return S.FighterDuck;
            case Act.DuckPunch: return S.FighterDuckPunch;
            case Act.DuckKick: return f.at < C.DuckKickStart ? S.FighterDuck : S.FighterDuckKick;
            case Act.Jump: return S.FighterJump;
            case Act.JumpKick: return S.FighterJumpKick;
            case Act.Flinch: return S.FighterFlinch;
            case Act.Grabbed: return (f.wiggles & 1) === 0 ? S.FighterStruggle1 : S.FighterStruggle2;
            case Act.Down: return S.FighterDown;
            case Act.Climb: return (Math.trunc(f32(f.walkClock / f32(0.16))) & 1) === 0 ? S.FighterWalk1 : S.FighterWalk2;
            default: return S.FighterStand;
        }
    }

    _drawFighter(s, r, t) {
        const f = r.f;
        this._put(s, r.cam, this._fighterPose(f, t), f.x, f.h, f.dir, K, f.hurtT > 0 ? this.cRed : null);
    }

    _drawFoe(s, r, e) {
        let p;
        const step = (Math.trunc(f32(e.clock / f32(0.14))) & 1) === 0;
        let dither = 16;
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
            case FoeKind.Snake:
                p = (Math.trunc(f32(e.clock / f32(0.18))) & 1) === 0 ? S.SnakeA : S.SnakeB;
                break;
            case FoeKind.Lizard:
                p = (Math.trunc(f32(e.clock / f32(0.12))) & 1) === 0 ? S.LizardA : S.LizardB;
                break;
            case FoeKind.Ghost:
                if (e.s === FoeState.Windup) p = S.GhostWindup;
                else if (e.s === FoeState.Strike) p = S.GhostStrike;
                else if (e.s === FoeState.Walk) p = step ? S.GhostWalk1 : S.GhostWalk2;
                else p = S.GhostStand;
                if (e.s === FoeState.Shimmer) dither = 1 + Math.trunc(f32(14 * f32(1 - f32(e.t / C.GhostShimmer))));
                else if (e.s === FoeState.Fade) dither = 1 + Math.trunc(f32(e.t * 24));
                break;
            default:
                if (e.s === FoeState.Dying || e.s === FoeState.Hop) p = S.DwarfHop;
                else {
                    let fr = Math.trunc(f32(e.clock / f32(0.1))) & 3;
                    if (e.dir < 0) fr = (4 - fr) & 3;
                    p = S.DwarfRoll[fr];
                }
                break;
        }
        this._put(s, r.cam, p, e.x, e.h, e.dir, K, e.flash > 0 ? this.cWhite : null, dither);
        const sx = r.cam.toScreen(e.x);
        if (e.kind === FoeKind.Grabber && e.s === FoeState.Stunned) {
            const ph = Math.trunc(f32(e.clock * 2)) & 1;
            s.rect(sx - 8 + ph * 12, FloorY - 38, 2, 2, this.cGold);
            s.rect(sx + 4 - ph * 12, FloorY - 40, 2, 2, this.cGold);
        }
        if (e.kind === FoeKind.Ghost && e.s === FoeState.Windup) s.rect(sx - 1, FloorY - 42, 2, 4, this.cMoon);   // his tell: a cold glint over him
        if (e.kind === FoeKind.Lizard && e.live) {                                                                  // a little fire on its breath
            const hx = sx + e.dir * 13, hy = FloorY - roundEven(e.h) - 4;
            s.setPixel(hx, hy, this.cOrange); s.setPixel(hx + e.dir, hy - 1, this.cGold);
        }
    }

    _drawBoss(s, r, t) {
        const b = r.b;
        const cam = r.cam;
        if (!cam.onScreen(b.x, 90)) return;
        const tint = b.flash > 0 ? this.cWhite : null;
        switch (b.kind) {
            case BossKind.Ring: this._drawRing(s, r, b, tint); break;
            case BossKind.Giant: this._drawGiant(s, r, b, tint); break;
            case BossKind.Twin: this._drawTwin(s, r, b, tint); break;
            case BossKind.Master: this._drawMaster(s, r, b, tint, t); break;
            default: this._drawStick(s, r, b, tint); break;
        }
        if (b.s === BossState.Telegraph && b.dur > f32(0.2)) {
            const top = FloorY - (b.kind === BossKind.Giant ? 54 : 34) - 2;
            const c = b.atk === Atk.Counter ? this.cRed : b.atk === Atk.Chi ? this.cOrange : this.cGold;
            s.textCenteredShadow('!', cam.toScreen(b.x), top - 28, PixelFont.Display, c, this.cBg, 2);
        }
    }

    _moving(b) { return b.s === BossState.Approach || b.s === BossState.Retreat; }
    _stepFrame(b) { return (Math.trunc(f32(b.clock / f32(0.16))) & 1) === 0; }

    // THE STICK MASTER (the 1985 board's boss): the stick goes behind the arms for the raise, in front for the rest
    _drawStick(s, r, b, tint) {
        const cam = r.cam, dir = b.dir;
        let p;
        switch (b.s) {
            case BossState.Telegraph: p = S.BossRaise; break;
            case BossState.Swing: case BossState.Recover: p = S.BossStrike; break;
            case BossState.Hurt: p = S.BossHurt; break;
            case BossState.Down: p = S.BossDown; break;
            default: p = this._moving(b) && !this._stepFrame(b) ? S.BossStep : S.BossStand; break;
        }
        const sx = cam.toScreen(b.x);
        const top = FloorY - p.s.height * K;
        if (b.s === BossState.Telegraph) this._stick(s, sx, top, dir, b);
        this._put(s, cam, p, b.x, 0, dir, K, tint);
        if (b.s !== BossState.Telegraph) this._stick(s, sx, top, dir, b);
    }

    _stick(s, sx, top, dir, b) {
        const hx = sx + dir * 10, hy = top + 18;
        let ax, ay, bx, by;
        switch (b.s) {
            case BossState.Telegraph: ax = hx - dir * 14; ay = hy + 10; bx = hx - dir * 22; by = top - 22; break;
            case BossState.Swing: ax = hx - dir * 12; ay = hy; bx = sx + dir * Math.trunc(b.spec.reach); by = hy + 4; break;
            case BossState.Recover: ax = hx - dir * 8; ay = hy - 4; bx = sx + dir * 44; by = FloorY - 2; break;
            case BossState.Hurt: ax = hx - dir * 16; ay = hy + 12; bx = hx + dir * 10; by = top - 12; break;
            case BossState.Down: ax = sx - dir * 26; ay = FloorY - 1; bx = sx + dir * 22; by = FloorY - 1; break;
            default: ax = hx - dir * 12; ay = hy + 12; bx = hx + dir * 26; by = hy - 14; break;
        }
        s.line(ax, ay, bx, by, this.cWood);
        s.line(ax, ay + 1, bx, by + 1, this.cWood);
        s.line(ax + 1, ay, bx + 1, by, this.cTanDark);
        s.rect(ax - 1, ay - 1, 3, 3, this.cGold);
        s.rect(bx - 1, by - 1, 3, 3, this.cGold);
        if (b.s === BossState.Telegraph) { s.rect(bx - 3, by, 7, 1, this.cGold); s.rect(bx, by - 3, 1, 7, this.cGold); }
    }

    // THE RING DANCER: the ring in his hand (cocked high or low on the tell), or gone while it flies
    _drawRing(s, r, b, tint) {
        const cam = r.cam, dir = b.dir;
        let p, hand = null;
        const sx = cam.toScreen(b.x);
        switch (b.s) {
            case BossState.Telegraph:
                if (b.atk === Atk.Throw) { p = b.high ? S.RingHigh : S.RingLow; hand = b.high ? [8, 32] : [12, 12]; }
                else { p = S.RingLow; hand = [14, 12]; }
                break;
            case BossState.Swing: p = S.RingLow; hand = b.atk === Atk.Melee ? [22, 14] : null; break;
            case BossState.Hurt: p = S.RingHurt; break;
            case BossState.Down: p = S.RingDown; break;
            default: p = this._moving(b) && !this._stepFrame(b) ? S.RingStep : S.RingStand; hand = [10, 14]; break;
        }
        this._put(s, cam, p, b.x, 0, dir, K, tint);
        if (hand != null && b.armed && b.s !== BossState.Down) this._ringAt(s, sx + dir * hand[0], FloorY - hand[1], 0);
    }

    _ringAt(s, x, y, spin) {
        s.circle(x, y, 5, this.cGold, false);
        s.circle(x, y, 4, this.cGoldDark, false);
        const a = spin & 3;
        s.setPixel(x + [5, 0, -5, 0][a], y + [0, 5, 0, -5][a], this.cWhite);
    }

    // THE GIANT, at x3
    _drawGiant(s, r, b, tint) {
        let p;
        switch (b.s) {
            case BossState.Telegraph: p = b.atk === Atk.Slam ? S.GiantRaise : S.GiantDraw; break;
            case BossState.Swing: p = b.atk === Atk.Slam ? S.GiantSlam : S.GiantSwat; break;
            case BossState.Recover: p = b.atk === Atk.Slam ? S.GiantSlam : S.GiantStand; break;
            case BossState.Hurt: p = S.GiantHurt; break;
            case BossState.Down: p = S.GiantDown; break;
            default: p = this._moving(b) && !this._stepFrame(b) ? S.GiantStep : S.GiantStand; break;
        }
        this._put(s, r.cam, p, b.x, 0, b.dir, 3, tint);
    }

    // TWIN BLADES: two steel blades drawn to his pose (crossed on guard, raised on the tell, out on the slash)
    _drawTwin(s, r, b, tint) {
        const cam = r.cam, dir = b.dir;
        let p;
        switch (b.s) {
            case BossState.Telegraph: p = S.TwinRaise; break;
            case BossState.Swing: p = b.atk === Atk.Throw ? S.TwinRaise : S.TwinSlash; break;
            case BossState.Recover: p = S.TwinSlash; break;
            case BossState.Hurt: p = S.TwinHurt; break;
            case BossState.Down: p = S.TwinDown; break;
            default: p = this._moving(b) && !this._stepFrame(b) ? S.TwinStep : S.TwinStand; break;
        }
        this._put(s, cam, p, b.x, 0, dir, K, tint);
        const sx = cam.toScreen(b.x), hx = sx + dir * 6, hy = FloorY - 20;
        const blade = (ax, ay, bx, by) => { s.line(ax, ay, bx, by, this.cSteel); s.line(ax, ay - 1, bx, by - 1, this.cMoon); s.rect(ax - 1, ay - 1, 2, 3, this.cGold); };
        switch (b.s) {
            case BossState.Telegraph:
                if (b.atk === Atk.Throw) blade(hx - dir * 2, hy - 8, hx - dir * 4, b.high ? hy - 26 : hy + 6);
                else { blade(hx - dir * 4, hy - 6, hx - dir * 14, hy - 24); blade(hx - dir * 2, hy - 4, hx + dir * 6, hy - 24); }
                if (b.dur > 0) s.rect(hx - dir * 14 - 1, hy - 25, 3, 1, this.cWhite);
                break;
            case BossState.Swing: case BossState.Recover:
                if (b.atk !== Atk.Throw) { blade(hx + dir * 10, hy - 6, hx + dir * 36, hy - 10); blade(hx + dir * 8, hy - 2, hx + dir * 32, hy + 4); }
                break;
            case BossState.Down:
                blade(sx - 20, FloorY - 1, sx - 6, FloorY - 1); blade(sx + 8, FloorY - 1, sx + 22, FloorY - 1);
                break;
            case BossState.Hurt: break;
            default:
                blade(hx - dir * 4, hy + 6, hx + dir * 14, hy - 14); blade(hx + dir * 10, hy + 6, hx - dir * 6, hy - 14);
                break;
        }
    }

    // THE IRON MASTER: at half strength his hands burn; the palm of fire gathers in them on the tell
    _drawMaster(s, r, b, tint, t) {
        const cam = r.cam, dir = b.dir;
        let p;
        switch (b.s) {
            case BossState.Telegraph: p = S.MasterRaise; break;
            case BossState.Swing: case BossState.Recover: p = S.MasterStrike; break;
            case BossState.Hurt: p = S.MasterHurt; break;
            case BossState.Down: p = S.MasterDown; break;
            default: p = this._moving(b) && !this._stepFrame(b) ? S.MasterStep : S.MasterStand; break;
        }
        this._put(s, cam, p, b.x, 0, dir, K, tint);
        if (b.s === BossState.Down) return;
        const sx = cam.toScreen(b.x);
        if (b.s === BossState.Telegraph && b.atk === Atk.Chi) {
            const k = f32(1 - f32(b.t / Math.max(f32(0.05), b.dur)));
            const rad = 2 + Math.trunc(f32(k * 4)), cy = b.high ? FloorY - 30 : FloorY - 10;
            s.circle(sx + dir * 14, cy, rad, this.cOrange, true);
            s.circle(sx + dir * 14, cy, Math.max(1, rad - 2), this.cGold, true);
        }
        else if (b.phase === 2) {
            const ph = Math.trunc(f32(t * 6)) & 1;
            s.setPixel(sx + dir * 13, FloorY - 23 - ph, this.cOrange); s.setPixel(sx + dir * 12, FloorY - 25 + ph, this.cGold);
            s.setPixel(sx - dir * 6, FloorY - 21 - ph, this.cOrange);
        }
    }

    // ------------------------------------------------------------------ what flies
    _drawShot(s, cam, k, t) {
        const sx = cam.toScreen(k.x);
        switch (k.kind) {
            case ShotKind.Ring: this._ringAt(s, sx, FloorY - (k.high ? 26 : 7), Math.trunc(f32(k.t * 16))); return;
            case ShotKind.Blade: {
                const p = (Math.trunc(f32(k.t * 14)) & 1) === 0 ? S.BladeA : S.BladeB;
                s.blit(p.s, sx - 7, FloorY - (k.high ? 26 : 6) - 7, this.pal, 2);
                return;
            }
            case ShotKind.Wave: {
                const h = 6 + (Math.trunc(f32(k.t * 10)) & 3);
                s.rect(sx - 4, FloorY - h, 8, h, this.cTanDark);
                s.rect(sx - 2, FloorY - h - 3, 4, 3, this.cTan);
                s.rect(sx - 7 * k.dir - 2, FloorY - 3, 4, 3, this.cTanDark);
                s.setPixel(sx + k.dir * 5, FloorY - h - 1, this.cTan);
                return;
            }
            case ShotKind.Chi: {
                const cy = FloorY - (k.high ? 26 : 8);
                s.rect(sx - k.dir * 14, cy - 1, 8, 2, this.cOrange);
                s.rect(sx - k.dir * 20, cy, 5, 1, this.cRed);
                s.circle(sx, cy, 6, this.cOrange, true);
                s.circle(sx, cy, 4, this.cGold, true);
                s.rect(sx - 1, cy - 1, 3, 3, this.cWhite);
                return;
            }
        }
        const h = k.high ? 26 : 5;
        const p = S.Knife;
        const y0 = FloorY - Math.trunc(h) - p.s.height * K;
        s.blit(p.s, k.dir > 0 ? sx - p.ax * K : sx - (p.s.width - 1 - p.ax) * K, y0, this.pal, K, k.dir < 0);
    }

    // the pots' shadows, before anyone stands in them
    _drawPotShadows(s, r) {
        for (const p of r.pots) {
            const sx = r.cam.toScreen(p.x);
            const k = p.s === 0 ? f32(p.t / C.PotHang) * 0.5 : f32(0.5 + f32(f32(1 - f32(p.h / C.PotHangH)) * f32(0.5)));
            const w = 4 + Math.trunc(f32(k * 18));
            s.rect(sx - idiv(w, 2), FloorY, w, 2, this._shadowColour(r));
            s.rect(sx - idiv(w, 2) + 2, FloorY + 2, w - 4, 1, this._shadowColour(r));
        }
    }

    _drawPots(s, r, t) {
        for (const p of r.pots) {
            const sway = p.s === 0 ? Math.round(tri(f32(p.t * 3)) * 2 - 1) : 0;
            const sx = r.cam.toScreen(p.x) + sway;
            const y = FloorY - Math.trunc(p.h) - S.Pot.s.height * K;
            if (p.s === 0) s.line(sx, 64, sx, y, this.cTanDark);
            else s.rect(sx, 64, 1, 3, this.cTanDark);                                // the cut rope
            s.blit(S.Pot.s, sx - S.Pot.ax * K, y, this.pal, K);
        }
    }

    _drawPickups(s, r, t) {
        for (const q of r.pickups) {
            const sx = r.cam.toScreen(q.x);
            const left = f32(C.TeaLife - q.t);
            const lvl = left < 2 ? Math.max(1, Math.trunc(f32(left * 8))) : 16;
            this._blitDither(s, S.Tea.s, sx - S.Tea.ax * K, FloorY - S.Tea.s.height * K, K, false, lvl);
            const ph = f32(q.t * 1.5);
            for (let i = 0; i < 2; i++) {
                const k = f32(ph + i * 0.5) - Math.floor(f32(ph + i * 0.5));
                s.setPixel(sx - 2 + i * 4 + Math.round(tri(k * 2)), FloorY - 8 - Math.trunc(k * 10), this.cMoon);
            }
        }
    }

    // a blade on its way: a glint at the edge ahead, at its height, growing
    _drawGlint(s, r) {
        const g = r.glint;
        if (g == null) return;
        const k = f32(1 - f32(g.t / C.GlintTell));
        const x = PlayLeft + 8, y = FloorY - (g.high ? 32 : 12), n = 1 + Math.trunc(f32(k * 4));
        s.rect(x - n, y, n * 2 + 1, 1, this.cMoon);
        s.rect(x, y - n, 1, n * 2 + 1, this.cMoon);
        s.rect(x - 1, y - 1, 3, 3, this.cWhite);
    }

    // the roof's wind: leaves before a gust, streaks while it blows (they run toward the door)
    _drawWind(s, r, t) {
        const w = r.wind;
        if (!r.fl.wind || w.s === 0) return;
        const n = w.s === 1 ? 6 : 16;
        for (let i = 0; i < n; i++) {
            const h = hash(i * 31 + 5);
            const speed = 220 + (h % 160);
            const x = PlayLeft + ((Math.trunc(f32(t * speed)) + (h >>> 4)) % 340) - 20;
            const y = 64 + ((h >>> 10) % 140) + Math.round(3 * tri(f32(t * 1.7 + i * 0.13)));
            if (w.s === 2 && (i & 1) === 0) s.rect(x, y, 10 + (h & 7), 1, this.cMoon);
            else { s.rect(x, y, 2, 1, this.cJade); s.setPixel(x + 1, y + 1, this.cBamboo); }
        }
    }

    _drawFx(s, r) {
        for (const x of r.effects) {
            if (x.kind === 1 || x.kind === 4) continue;                              // words: after the mirror
            const sx = r.cam.toScreen(x.x), sy = FloorY - Math.trunc(x.h);
            switch (x.kind) {
                case 3: s.rect(sx, sy - 2, 2, 2, this.pal.at(x.c)); continue;
                case 5: {
                    const d = 3 + Math.trunc(f32(x.t * 40));
                    s.rect(sx - d - 2, FloorY - 2, 3, 2, this.cTan); s.rect(sx + d, FloorY - 2, 3, 2, this.cTan);
                    if (x.t < f32(0.15)) { s.setPixel(sx - d, FloorY - 4, this.cTan); s.setPixel(sx + d + 1, FloorY - 4, this.cTan); }
                    continue;
                }
                case 6: {
                    const rad = 6 + Math.trunc(f32(x.t * 70));
                    s.circle(sx, sy - 10, rad, this.cGold, false);
                    if (rad > 10) s.circle(sx, sy - 10, rad - 5, this.cWhite, false);
                    continue;
                }
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

    // the words in the play window, at their mirrored x
    _drawWorldText(s, r, t) {
        const arc = PixelFont.Arcade;
        for (const x of r.effects) {
            if (x.kind !== 1 && x.kind !== 4) continue;
            const sx = this._sx(r, x.x), sy = FloorY - Math.trunc(x.h);
            if (x.kind === 1) s.textCenteredShadow(String(x.value), sx, sy - 8, arc, this.cGold, this.cBg);
            else s.textCenteredShadow(x.text, Math.max(PlayLeft + 40, Math.min(PlayLeft + PlayW - 40, sx)), sy - 8, arc, this.pal.at(x.c), this.cBg);
        }
        if (r.f.a === Act.Grabbed && SurfaceDraw.blink(t))
            s.textCenteredShadow('<SHAKE>', this._sx(r, r.f.x), FloorY - 50, arc, this.cGold, this.cBg);
        if (this._plaqueX > -900) {
            const px = r.mirror ? 319 - (this._plaqueX + 23) : this._plaqueX;
            s.text(r.lastFloor ? 'TOP' : (r.floorN + 1) + 'F', px + 2 + (r.lastFloor ? 0 : 4), 73, PixelFont.Small, this.cGold, 1);
        }
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r) {
        const arc = PixelFont.Arcade, dsp = PixelFont.Display;
        s.text('1UP', 10, 9, arc, this.cRed);
        s.text(d6(r.score), 10, 18, dsp, this.cWhite, 2);
        if (r.mult > 1) {
            s.text('CHAIN', 112, 10, PixelFont.Small, this.cGold);
            s.text('X' + r.mult, 112, 19, dsp, this.cGold, 1);
        }
        s.textCentered('TIME', 160, 9, arc, this.cRed);
        const secs = Math.ceil(Math.max(0, r.timer));
        s.textCentered(dn(secs, 2), 160, 18, dsp, secs <= 10 && r.b.alive ? this.cRed : this.cGold, 2);
        s.textRight('FLOOR ' + r.floorN, 310, 9, arc, r.extendFlash > 0 ? this.cGold : this.cRed);
        for (let i = 0; i < r.livesLeft && i < 5; i++)
            s.blit(S.LifeHead, 296 - i * 16, 20, this.pal, 2);
        // energy
        s.text('ENERGY', 10, 39, arc, this.cWhite);
        const fe = r.f, low = fe.energy <= 3;
        for (let i = 0; i < fe.maxEnergy; i++) {
            const x = 50 + i * 8;
            if (i < fe.energy) s.rect(x, 38, 6, 8, low ? this.cRed : this.cWhite);
            else s.frame(x, 38, 6, 8, this.cShadowRed);
        }
        if (r.b.active) {
            const n = Math.min(r.b.maxHP, 16);
            const x0 = 311 - n * 6 + 1;
            s.textRight('BOSS', x0 - 4, 39, arc, this.cGold);
            for (let i = 0; i < n; i++) {
                const x = x0 + i * 6;
                if (i < r.b.hp) s.rect(x, 38, 5, 8, r.b.kind === BossKind.Master && r.b.phase === 2 ? this.cOrange : this.cGold);
                else s.frame(x, 38, 5, 8, this.cGoldDark);
            }
        }
        s.dottedRule(8, 312, 49, 3, this.cDojo);
    }

    // the pagoda: five tiers, the floors climbed in tan, this one lit gold, the rest dark; lit = every floor gold
    _pagoda(s, cx, bottom, current, lit) {
        for (let i = 0; i < FloorCount; i++) {
            const n = i + 1, w = 46 - i * 7, y = bottom - (i + 1) * 17;
            const body = lit || n === current ? this.cGold : n < current ? this.cTan : this.cWood;
            s.rect(cx - idiv(w, 2), y + 4, w, 12, body);
            for (let k = 0; k < 3; k++) s.rect(cx - idiv(w, 2) + 4 + k * idiv(w - 10, 2), y + 7, 2, 6, n === current || lit ? this.cGoldDark : this.cBg);
            s.rect(cx - idiv(w, 2) - 6, y + 1, w + 12, 3, this.cDojo);
            s.rect(cx - idiv(w, 2) - 7, y, 2, 2, this.cGold); s.rect(cx + idiv(w, 2) + 5, y, 2, 2, this.cGold);
            if (n === current && !lit) s.blit(S.LifeHead, cx + idiv(w, 2) + 10, y + 5, this.pal, 1);
        }
        s.rect(cx - 1, bottom - FloorCount * 17 - 8, 2, 8, this.cGold);
        s.rect(cx - idiv(54, 2), bottom, 54, 2, this.cTanDark);
    }

    // ------------------------------------------------------------------ plates
    _drawOverlays(s, r, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, sml = PixelFont.Small;
        const midX = 160, midY = 128;
        const spec = IronDojoSpec;
        if (r.bossBanner > 0 && r.p === Phase.Play) {
            const name = r.b.spec.name;
            const w = arc.measure(name, 2) + 20;
            s.plate(midX - idiv(w, 2), 58, w, 22, this.cBg, this.cGold);
            s.textCentered(name, midX, 62, arc, this.cGold, 2);
        }
        if (r.extendFlash > 0 && (r.p === Phase.Play || r.p === Phase.Climb)) {
            s.textCenteredShadow('EXTRA LIFE!', midX, r.bossBanner > 0 ? 84 : 60, arc, this.cGold, this.cBg, 2);
        }
        switch (r.p) {
            case Phase.Stage: {
                const fl = r.fl;
                s.plate(24, 56, 272, 118, this.cBg, this.cGoldDark);
                s.frame(26, 58, 268, 114, this.cDojo);
                this._pagoda(s, 64, 166, r.floorN, false);
                const cx = 190;
                s.textCentered('FLOOR ' + r.floorN, cx, 64, dsp, this.cGold, 2);
                s.textCentered(fl.name, cx, 86, dsp, this.cWhite, 1);
                for (let i = 0; i < fl.hint.length; i++) s.textCentered(fl.hint[i], cx, 102 + i * 10, arc, this.cTan);
                s.textCentered('GUARDED BY', cx, 128, sml, this.cGrey);
                s.textCentered(BOSSES[fl.boss].name, cx, 136, arc, this.cRed);
                if (r.mercyActive) {
                    s.plate(cx - 70, 152, 140, 15, this.cBg, this.cGold);
                    s.textCentered('FREE RIDE - IRON WILL', cx, 156, arc, this.cGold);
                }
                else if (r.floorN === FloorCount) s.textCentered('THE LAST FLOOR', cx, 156, arc, this.cGold);
                break;
            }
            case Phase.Intro:
                s.textBox('GET READY', midX, midY - 30, dsp, 2, this.cWhite, this.cDojo, this.cBg);
                s.textCenteredShadow((r.livesLeft === 1 ? 'LAST LIFE' : r.livesLeft + ' LIVES LEFT'), midX, midY - 2, arc, this.cGold, this.cBg);
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
            case Phase.Climb: {
                s.plate(52, 58, 216, 96, this.cBg, this.cGold);
                s.textCentered('FLOOR ' + r.floorN + ' CLEAR', midX, 66, dsp, this.cGold, 2);
                for (let i = 0; i < r.tally.length; i++) {
                    const l = r.tally[i];
                    if (r.phaseTime < f32(f32(0.8) + f32(i * f32(0.9)))) break;
                    const y = 92 + i * 14;
                    s.text(l.label, 64, y, arc, this.cWhite);
                    s.textRight(String(l.paid), 256, y, arc, l.paid >= l.value ? this.cGold : this.cTan);
                }
                break;
            }
            case Phase.Card:
            case Phase.Over: {
                const won = r.roundWon;
                if (won) {
                    s.textBox(spec.roundWonText, midX, 62, dsp, 2, this.cGold, this.cGold, this.cBg);
                    s.plate(midX - 100, 86, 200, 96, this.cBg, this.cGold);
                    this._pagoda(s, 104, 174, FloorCount, true);
                    s.textCentered('SCORE', 200, 98, arc, this.cWhite);
                    s.textCentered(d6(r.score), 200, 110, dsp, this.cWhite, 2);
                    s.textCentered('THE PAGODA', 200, 140, arc, this.cGold);
                    s.textCentered('IS YOURS', 200, 150, arc, this.cGold);
                }
                else {
                    s.textBox(spec.roundLostText, midX, midY - 44, dsp, 3, this.cWhite, this.cRed, this.cBg);
                    s.plate(midX - 96, midY - 12, 192, 46, this.cBg, this.cRed);
                    s.textCentered('SCORE ' + d6(r.score), midX, midY - 6, arc, this.cWhite, 2);
                    s.textCentered('FLOOR ' + r.floorN + ' - ' + r.fl.name, midX, midY + 18, arc, this.cGold);
                }
                break;
            }
        }
    }
}
