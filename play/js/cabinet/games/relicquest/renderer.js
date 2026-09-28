// THE NODE · world 1 · RELIC QUEST on the Cabinet Engine · THE PICTURE.
// Port of RelicQuestGame.cs's Draw(), re-laid-out for the 8 px safe area and the concept frames.
//
//   - HUD band y 8..23: the score in big display digits (yellow), the gems left (a ruby and a count),
//     the torches left, and the knights left (a number and a helmet each), as on the concept frames
//   - the maze 19 x 13 blocks of 16 px at (8, 24), filling the tube: gold and green blocks in a
//     checker, each bevelled with a dark mortar gap; gold ones riveted, green ones cracked
//   - gems: cut rubies that catch the light now and then; the relic's plinth in the middle shows the
//     relic's dark shape until the last gem raises it (it rises, then its rays pulse at 1 Hz)
//   - snakes: a long body that slithers through fixed curves along the path it took, a side-view head
//     with an eye, a red tongue flicking at 2 Hz. Coiled (stunned) = dull olive with two stars; asleep
//     (credit 5) = a coil with a Z drifting up
//   - the knight: 14 x 20 outlined, four-step walk, the sword swing with a slash arc, the torch flare ring
//   - nothing strobes: blinks are 1 Hz, the tongue and a stun's last second 2 Hz, a bite is ONE red frame
import { f32, d6, PixelFont, SurfaceDraw } from '../../sdk/index.js';
import { RelicQuestPalette, RelicQuestSpec } from './spec.js';
import { GW, GH, RelicQuestMaze as M, Up, Right, Down, Left } from './maze.js';
import { RelicQuestRound } from './round.js';
import { Knight, KnightDazed, HelmetFly, SnakeHeadSide, SnakeHeadTop, Gem, Relic, RelicGhost, Plinth, LifeIcon, TorchIcon } from './sprites.js';

const T = 16;
const OX = 8, OY = 24;                              // 19 x 16 = 304 wide (8..312), 13 x 16 = 208 tall (24..232)
const MW = GW * T, MH = GH * T;
const Phase = RelicQuestRound.Phase;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

// colour remaps (sprite index -> palette index)
function remap(pairs) {
    const m = new Int8Array(RelicQuestPalette.count);
    for (let i = 0; i < m.length; i++) m[i] = i;
    for (const [a, b] of pairs) m[a] = b;
    return m;
}
const MapStunned = remap([[10, 15], [11, 13], [12, 16], [20, 16]]);             // snake -> grey stone
const MapHurt = remap([[15, 7], [16, 9], [17, 8], [18, 7], [19, 9], [3, 9], [1, 8], [20, 9], [13, 8]]);

export class RelicQuestRenderer {
    constructor() {
        const pal = RelicQuestPalette;
        this.col = [];
        for (let i = 0; i < pal.count; i++) this.col.push(pal.at(i));
        const c = n => pal.get(n);
        this.cBg = c('bg'); this.cGold = c('gold'); this.cGoldHi = c('goldHi'); this.cGoldLo = c('goldLo');
        this.cGreen = c('green'); this.cGreenHi = c('greenHi'); this.cGreenLo = c('greenLo');
        this.cRed = c('red'); this.cRedHi = c('redHi');
        this.cSnake = c('snake'); this.cSnakeHi = c('snakeHi'); this.cSnakeLo = c('snakeLo');
        this.cWhite = c('white'); this.cHud = c('hud'); this.cSteel = c('steel'); this.cSteelLo = c('steelLo');
        this.cOrange = c('orange'); this.cCream = c('cream'); this.cSkin = c('skin'); this.cBrown = c('brown');
        this._pts = [];                                  // snake body samples (reused)
    }

    draw(sim, s, t) {
        const r = sim;
        s.noClip();
        s.clear(this.cBg);
        if (r == null || r.maze == null) return;
        t = f32(t);
        const m = r.maze, P = r.p, pt = r.phaseTime;

        this._drawMaze(s, m, t);
        s.clip(OX, OY, MW, MH);
        const held = P === Phase.Clear || ((P === Phase.Card || P === Phase.Over) && r.roundWon);   // the knight has it
        this._drawRelic(s, m, t, held);
        for (const sn of m.snakes) this._drawSnake(s, m, sn, t);
        this._drawKnight(s, r, m, P, pt, t);
        this._drawTorchFlare(s, m);
        s.noClip();
        this._drawHud(s, r, m, t);
        this._drawOverlay(s, r, m, P, pt, t);
    }

    // ------------------------------------------------------------------ sprites
    // blit a palette sprite with mirror / flip and an optional colour remap
    _stamp(s, sp, x, y, flipX = false, flipY = false, map = null) {
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                let v = sp.at(flipX ? sp.width - 1 - i : i, flipY ? sp.height - 1 - j : j);
                if (v < 0) continue;
                if (map) v = map[v];
                s.setPixel(x + i, y + j, this.col[v]);
            }
    }

    // the same, with a 1 px dark outline round the silhouette: how a sprite reads over busy blocks
    _stampOutlined(s, sp, x, y, flipX = false, map = null) {
        const bg = this.cBg;
        for (let j = 0; j < sp.height; j++)
            for (let i = 0; i < sp.width; i++) {
                if (sp.at(flipX ? sp.width - 1 - i : i, j) < 0) continue;
                s.setPixel(x + i - 1, y + j, bg); s.setPixel(x + i + 1, y + j, bg);
                s.setPixel(x + i, y + j - 1, bg); s.setPixel(x + i, y + j + 1, bg);
            }
        this._stamp(s, sp, x, y, flipX, false, map);
    }

    // ------------------------------------------------------------------ the maze
    _drawMaze(s, m, t) {
        for (let y = 0; y < GH; y++)
            for (let x = 0; x < GW; x++) {
                const px0 = OX + x * T, py0 = OY + y * T;
                if (m.wall[y * GW + x]) this._drawBlock(s, px0, py0, x, y);
                else if (m.gem[y * GW + x]) this._drawGem(s, px0, py0, x, y, t);
            }
    }

    _drawBlock(s, x, y, tx, ty) {
        const gold = ((tx + ty) & 1) === 0;
        const b = gold ? this.cGold : this.cGreen, hi = gold ? this.cGoldHi : this.cGreenHi, lo = gold ? this.cGoldLo : this.cGreenLo;
        s.rect(x + 1, y + 1, T - 2, T - 2, b);
        s.rect(x + 2, y + 1, T - 4, 1, hi); s.rect(x + 1, y + 2, 1, T - 4, hi);        // lit top and left
        s.rect(x + 2, y + T - 2, T - 4, 1, lo); s.rect(x + T - 2, y + 2, 1, T - 4, lo); // shaded bottom and right
        s.rect(x + 3, y + T - 3, T - 5, 1, lo);                                          // a deeper lip under the face
        const bg = this.cBg;
        s.setPixel(x + 1, y + 1, bg); s.setPixel(x + T - 2, y + 1, bg); s.setPixel(x + 1, y + T - 2, bg); s.setPixel(x + T - 2, y + T - 2, bg);
        if (gold) {
            // a riveted plate: a rivet in each corner (dark head, lit rim above it)
            for (const [rx, ry] of [[4, 4], [11, 4], [4, 11], [11, 11]]) { s.setPixel(x + rx, y + ry, lo); s.setPixel(x + rx, y + ry - 1, hi); }
        } else {
            // a diagonal crack across the stone, carved (dark line, lit lip under it)
            const k = (tx * 5 + ty * 3) % 3;
            for (let i = 0; i < 7; i++) {
                s.setPixel(x + 4 + i + (k === 2 ? -1 : 0), y + 11 - i - (k === 1 ? 1 : 0), lo);
                s.setPixel(x + 5 + i + (k === 2 ? -1 : 0), y + 11 - i - (k === 1 ? 1 : 0), hi);
            }
        }
    }

    _drawGem(s, x, y, tx, ty, t) {
        this._stamp(s, Gem, x + 4, y + 5);
        // it catches the light now and then (a 0.25 s glint every ~1.6 s, each gem on its own beat)
        const ph = f32(f32(t * f32(0.62)) + f32(((tx * 7 + ty * 13) % 16) / 16));
        if (f32(ph - Math.floor(ph)) < 0.16) {
            s.setPixel(x + 6, y + 5, this.cWhite); s.setPixel(x + 6, y + 4, this.cWhite); s.setPixel(x + 6, y + 6, this.cWhite);
            s.setPixel(x + 5, y + 5, this.cWhite); s.setPixel(x + 7, y + 5, this.cWhite);
        } else s.setPixel(x + 6, y + 6, this.cRedHi);
    }

    // ------------------------------------------------------------------ the relic
    _drawRelic(s, m, t, held) {
        const x = OX + m.relicX * T, y = OY + m.relicY * T;
        const rx = x + 1, ry = y - 1;
        if (held) { this._stamp(s, Plinth, x + 1, y + 11); return; }
        if (!m.relicUp) {
            this._stamp(s, RelicGhost, rx, ry);
            this._stamp(s, Plinth, x + 1, y + 11);
            return;
        }
        const rise = f32(Math.min(1, f32(m.relicAge / f32(0.6))));
        if (rise < 1) {
            // it rises out of the plinth
            const off = Math.round((1 - rise) * 11);
            s.clip(x - 8, OY, T + 16, (y + 11) - OY);                // nothing below the plinth's top
            this._stamp(s, Relic, rx, ry + off);
            s.clip(OX, OY, MW, MH);
        } else {
            this._rays(s, rx + 6, ry + 5, t);
            this._stamp(s, Relic, rx, ry);
        }
        this._stamp(s, Plinth, x + 1, y + 11);
    }

    // eight spokes round the relic, long and short trading places at 1 Hz
    _rays(s, cx, cy, t) {
        const long = SurfaceDraw.blink(t, 1);
        for (let k = 0; k < 8; k++) {
            const dx = [0, 1, 1, 1, 0, -1, -1, -1][k], dy = [-1, -1, 0, 1, 1, 1, 0, -1][k];
            const diag = dx !== 0 && dy !== 0;
            const r0 = diag ? 7 : 8, len = ((k & 1) === 0) === long ? 5 : 3;
            for (let i = 0; i < len; i++) s.setPixel(cx + dx * (r0 + i), cy + dy * (r0 + i), i === len - 1 ? this.cGoldHi : this.cHud);
        }
    }

    // ------------------------------------------------------------------ the snakes
    _drawSnake(s, m, sn, t) {
        const asleep = m.snakesAsleep;
        let stunned = sn.stun > 0;
        if (stunned && sn.stun < 1) stunned = f32(f32(sn.stun * 2) - Math.floor(f32(sn.stun * 2))) < 0.5;   // waking: 2 Hz
        const cLo = stunned ? this.cSteelLo : this.cSnakeLo, cMid = stunned ? this.cSteel : this.cSnake, cHi = stunned ? this.cWhite : this.cSnakeHi;

        const hx = OX + Math.round(M.px(sn) * T) + 8, hy = OY + Math.round(M.py(sn) * T) + 8;
        const pts = this._bodyPoints(sn, hx, hy, asleep);
        // outline, then the body, then scales: tail first so the neck sits on top
        for (let i = pts.length - 1; i >= 1; i--) this._disc(s, pts[i].x, pts[i].y, pts[i].r + 1, cLo);
        for (let i = pts.length - 1; i >= 1; i--) this._disc(s, pts[i].x, pts[i].y, pts[i].r, cMid);
        for (let i = pts.length - 1; i >= 1; i--) if ((i % 3) === 0 && pts[i].r >= 2) s.setPixel(pts[i].x, pts[i].y - 1, cHi);

        const d = sn.dir >= 0 ? sn.dir : sn.lastDir;
        const map = stunned ? MapStunned : null;
        let tx = 0, ty = 0;                                       // the snout
        if (d === Right) { this._stamp(s, SnakeHeadSide, hx - 4, hy - 3, false, false, map); tx = hx + 7; ty = hy; }
        else if (d === Left) { this._stamp(s, SnakeHeadSide, hx - 6, hy - 3, true, false, map); tx = hx - 7; ty = hy; }
        else if (d === Up) { this._stamp(s, SnakeHeadTop, hx - 4, hy - 5, false, false, map); tx = hx; ty = hy - 6; }
        else { this._stamp(s, SnakeHeadTop, hx - 4, hy - 3, false, true, map); tx = hx; ty = hy + 6; }

        if (asleep) {
            // a Z drifts up from the coil
            const ph = f32(f32(t * f32(0.5)) + f32(sn.sx * f32(0.13)));
            const f = f32(ph - Math.floor(ph));
            s.text('Z', hx + 3, hy - 12 - Math.trunc(f * 8), PixelFont.Small, this.cCream);
            return;
        }
        if (stunned || sn.stun > 0) {
            // two stars circling over the dizzy head, once a second
            const a = f32(t * f32(6.2832));
            for (let k = 0; k < 2; k++) {
                const aa = a + k * Math.PI;
                this._star(s, hx + Math.round(Math.cos(aa) * 7), hy - 9 + Math.round(Math.sin(aa) * 2));
            }
            return;
        }
        // the tongue flicks out and back at 2 Hz
        const ph = f32(f32(t * 2) + f32(sn.sx * f32(0.37)));
        if (f32(ph - Math.floor(ph)) < 0.5) {
            const fx = DX[d], fy = DY[d];
            for (let i = 0; i < 3; i++) s.setPixel(tx + fx * i, ty + fy * i, this.cRed);
            s.setPixel(tx + fx * 3 - fy, ty + fy * 3 - fx, this.cRed);
            s.setPixel(tx + fx * 3 + fy, ty + fy * 3 + fx, this.cRed);
        }
    }

    _star(s, x, y) {
        s.setPixel(x, y, this.cWhite);
        s.setPixel(x - 1, y, this.cHud); s.setPixel(x + 1, y, this.cHud); s.setPixel(x, y - 1, this.cHud); s.setPixel(x, y + 1, this.cHud);
    }

    // body samples every 2 px back from the head along the path the snake took (head -> its tile ->
    // the tiles it came from), displaced sideways by a wave fixed to the ground, so it slithers
    _bodyPoints(sn, hx, hy, asleep) {
        const path = [[hx, hy]];
        const cx = OX + sn.x * T + 8, cy = OY + sn.y * T + 8;
        if (cx !== hx || cy !== hy) path.push([cx, cy]);
        for (const i of sn.hist) path.push([OX + (i % GW) * T + 8, OY + Math.trunc(i / GW) * T + 8]);
        const BodyLen = 50, Step = 2;
        const odo = f32(sn.walk * T);
        const pts = this._pts; pts.length = 0;
        let seg = 0, segPos = 0, last = path[0], dirx = 0, diry = 0;
        for (let dist = 0; dist <= BodyLen; dist += Step) {
            // walk `dist` along the path
            let px = 0, py = 0, onPath = false;
            while (seg < path.length - 1) {
                const a = path[seg], b = path[seg + 1];
                const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
                if (dist - segPos <= len && len > 0) {
                    const f = (dist - segPos) / len;
                    px = a[0] + (b[0] - a[0]) * f; py = a[1] + (b[1] - a[1]) * f;
                    dirx = Math.sign(b[0] - a[0]); diry = Math.sign(b[1] - a[1]);
                    onPath = true; break;
                }
                segPos += len; seg++;
            }
            if (!onPath) {
                // the path ran out (just spawned, or asleep): the rest lies coiled around its end
                last = path[path.length - 1];
                const k = (dist - segPos) / 7;
                px = last[0] + Math.cos(k + 1) * 5; py = last[1] + 1 + Math.sin(k + 1) * 4;
                dirx = 0; diry = 0;
            }
            // the wave, fixed to the ground: zero at the neck, 3 px along the body
            const amp = onPath ? Math.min(1, dist / 10) * 3.2 : 0;
            const w = asleep ? 0 : Math.sin((odo - dist) * 0.2) * amp;
            const r = dist < 34 ? 2 : 1;
            pts.push({ x: Math.round(px - diry * w), y: Math.round(py + dirx * w), r });
        }
        return pts;
    }

    _disc(s, cx, cy, r, c) {
        for (let j = -r; j <= r; j++) {
            let w = 0;
            while ((w + 1) * (w + 1) + j * j <= r * r + (r >> 1)) w++;
            s.rect(cx - w, cy + j, 2 * w + 1, 1, c);
        }
    }

    // ------------------------------------------------------------------ the knight
    // 14 x 20 on a 16 px tile: one column in, feet on the tile's floor, the helmet rising 5 px into
    // the row above (drawn outlined, over the blocks, as on the concept frames)
    _drawKnight(s, r, m, P, pt, t) {
        const k = m.knight;
        const x0 = OX + Math.round(M.px(k) * T) + 1, y0 = OY + Math.round(M.py(k) * T) - 5;
        const flip = k.faceX < 0;
        const lostCard = (P === Phase.Card || P === Phase.Over) && !r.roundWon;
        if (P === Phase.Bitten || lostCard) {
            if (P === Phase.Bitten && pt < f32(0.35)) { this._stampOutlined(s, Knight.stand, x0, y0, flip, MapHurt); return; }   // one red frame
            this._stampOutlined(s, KnightDazed, x0, y0, flip);
            // the helmet goes up and over, and lands behind him
            const q = lostCard ? 1 : f32(Math.min(1, f32(f32(pt - f32(0.35)) / f32(0.7))));
            const side = flip ? 1 : -1;
            const hx = x0 + 3 + Math.round(side * 14 * q), hy = y0 + 2 - Math.round(q * 18) + Math.round(q * q * 24);
            this._stampOutlined(s, HelmetFly, hx, hy, q > 0.5 ? !flip : flip);
            // stars round his head, once a second
            const a = f32(t * f32(6.2832));
            for (let i = 0; i < 3; i++) {
                const aa = a + i * 2.094;
                this._star(s, x0 + 7 + Math.round(Math.cos(aa) * 8), y0 + 2 + Math.round(Math.sin(aa) * 2));
            }
            return;
        }
        if (P === Phase.Clear || ((P === Phase.Card || P === Phase.Over) && r.roundWon)) {
            // he holds the relic over his head, both arms up, and it shines
            this._stampOutlined(s, Knight.stand, x0, y0, flip);
            s.rect(x0 - 1, y0 - 3, 3, 16, this.cBg); s.rect(x0, y0 - 3, 1, 16, this.cSkin);
            s.rect(x0 + 12, y0 - 3, 3, 16, this.cBg); s.rect(x0 + 13, y0 - 3, 1, 16, this.cSkin);
            this._rays(s, x0 + 7, y0 - 9, t);
            this._stampOutlined(s, Relic, x0 + 1, y0 - 14);
            return;
        }
        let sp = Knight.stand;
        if (k.dir >= 0 && P === Phase.Running) {
            const f = Math.trunc(f32(k.walk * 3)) & 3;
            sp = f === 0 ? Knight.walkA : f === 2 ? Knight.walkB : Knight.stand;
        }
        const torchLit = m.torchAge < m.torchSeconds;
        this._stampOutlined(s, sp, x0, y0, flip);
        if (torchLit) this._drawHandTorch(s, x0, y0, flip, t);
        if (m.swing > 0) this._drawSwing(s, m, x0, y0);
        else this._drawSheathed(s, x0, y0, flip);
    }

    // the sword at rest: hilt at his hip, the blade pointing down by his leg
    _drawSheathed(s, x0, y0, flip) {
        const hx = flip ? x0 + 1 : x0 + 12;
        s.rect(hx - 1, y0 + 14, 3, 1, this.cGold);
        s.rect(hx, y0 + 15, 1, 5, this.cSteel);
        s.setPixel(hx, y0 + 13, this.cGoldLo);
    }

    _drawHandTorch(s, x0, y0, flip, t) {
        const hx = flip ? x0 + 12 : x0 + 1;
        s.rect(hx, y0 + 9, 1, 6, this.cBrown);
        const tall = SurfaceDraw.blink(t, 2) ? 1 : 0;
        s.rect(hx - 1, y0 + 6, 3, 3, this.cOrange);
        s.setPixel(hx, y0 + 5 - tall, this.cHud); s.setPixel(hx, y0 + 7, this.cHud);
    }

    // the swing: the blade sweeps raised -> level -> low in front of him, with a slash crescent
    _drawSwing(s, m, x0, y0) {
        const p = f32(1 - f32(m.swing / m.swingTime));             // 0 -> 1 through the swing
        const f = m.swingDir, fx = DX[f], fy = DY[f];
        const cx = x0 + 7, cy = y0 + 12;                            // his middle
        const side = p < 0.34 ? -1 : p < 0.67 ? 0 : 1;              // across the swing
        // the fist, a little out from the body the way he faces
        const hx = cx + (fx !== 0 ? fx * 6 : side * 3), hy = cy + (fy !== 0 ? fy * 8 : 1);
        // blade direction: forward, tilted by the pose
        const bx = fx !== 0 ? fx : side * 0.6, by = fy !== 0 ? fy : side * 0.6;
        const len = Math.hypot(bx, by);
        const ux = bx / len, uy = by / len;
        s.rect(hx - (fy !== 0 ? 1 : 0), hy - (fx !== 0 ? 1 : 0), fy !== 0 ? 3 : 1, fx !== 0 ? 3 : 1, this.cGold);   // crossguard
        for (let i = 1; i <= 10; i++) {
            const px = hx + Math.round(ux * i), py = hy + Math.round(uy * i);
            s.setPixel(px, py, i >= 9 ? this.cWhite : this.cSteel);
            s.setPixel(px + (fx !== 0 ? 0 : 1), py + (fx !== 0 ? -1 : 0), this.cWhite);
        }
        // the slash: a crescent in front of him while the blade sweeps
        if (p > 0.15 && p < 0.95) {
            const R = 15, a0 = Math.atan2(fy, fx);
            for (let a = -64; a <= 64; a += 3) {
                const ang = a0 + a * Math.PI / 180;
                const ox = Math.cos(ang), oy = Math.sin(ang);
                s.setPixel(cx + Math.round(ox * R), cy + Math.round(oy * R), this.cHud);
                s.setPixel(cx + Math.round(ox * (R - 1)), cy + Math.round(oy * (R - 1)), this.cWhite);
                if (Math.abs(a) < 40) s.setPixel(cx + Math.round(ox * (R + 1)), cy + Math.round(oy * (R + 1)), this.cGoldHi);
            }
        }
    }

    _drawTorchFlare(s, m) {
        if (m.torchAge >= 0.5) return;
        const k = m.knight;
        const cx = OX + Math.round(M.px(k) * T) + 8, cy = OY + Math.round(M.py(k) * T) + 8;
        const rad = 10 + Math.trunc(m.torchAge * 220);
        s.circle(cx, cy, rad, this.cOrange, false);
        s.circle(cx, cy, rad - 2, this.cHud, false);
        s.circle(cx, cy, rad - 5, this.cOrange, false);
    }

    // ------------------------------------------------------------------ HUD
    _drawHud(s, r, m, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade;
        s.text(d6(r.score), 12, 9, dsp, this.cHud, 2);
        // gems left: a ruby and a count; RELIC! once they are all taken
        if (!m.relicUp) {
            this._stamp(s, Gem, 126, 12);
            s.text(String(m.gemsLeft).padStart(2, '0'), 140, 9, dsp, this.cRedHi, 2);
        } else {
            this._stamp(s, Relic, 124, 9);
            s.text('!', 140, 9, dsp, SurfaceDraw.blink(t, 1) ? this.cHud : this.cGoldHi, 2);
        }
        s.text('MAZE ' + Math.max(1, m.level), 176, 13, arc, this.cCream);
        // torches left
        for (let i = 0; i < m.torches && i < 3; i++) this._stamp(s, TorchIcon, 222 + i * 8, 11);
        // knights left: the number and a helmet each (as the concept frames)
        const lives = Math.max(0, m.lives);
        for (let i = 0; i < Math.min(lives, 3); i++) this._stamp(s, LifeIcon, 303 - i * 12, 12);
        s.textRight(String(lives), 303 - Math.min(lives, 3) * 12 + 8, 9, dsp, this.cHud, 2);
    }

    // ------------------------------------------------------------------ overlays
    _drawOverlay(s, r, m, P, pt, t) {
        const dsp = PixelFont.Display, arc = PixelFont.Arcade, spec = RelicQuestSpec;
        const midX = 160, midY = OY + Math.trunc(MH / 2);
        const k = m.knight;
        if (P === Phase.Countdown || P === Phase.Ready) {
            if (P === Phase.Countdown) {
                s.textBox('MAZE ' + m.level, midX, midY - 42, dsp, 2, this.cHud, this.cGold, this.cBg);
                const n = r.countdownLeft > 0 ? String(r.countdownLeft) : 'GO';
                s.textCenteredShadow(n, midX, midY - 14, dsp, this.cWhite, this.cBg, 4);
            } else {
                s.textBox('READY!', midX, midY - 30, dsp, 2, this.cHud, this.cGold, this.cBg);
                s.textCenteredShadow(m.lives === 1 ? 'LAST KNIGHT' : m.lives + ' KNIGHTS LEFT', midX, midY - 4, arc, this.cCream, this.cBg);
            }
            if (r.mercyActive) s.textBox('THE SNAKES SLEEP', midX, midY + 30, arc, 1, this.cSnake, this.cGreen, this.cBg);
            // which one is you: an arrow and YOU just right of the knight
            if (SurfaceDraw.blink(t, 1)) {
                const ax = OX + k.x * T + 18, ay = OY + k.y * T + 7;
                s.plate(ax - 1, ay - 5, 30, 11, this.cBg, this.cHud);
                for (let i = 0; i < 4; i++) s.rect(ax + 2 + i, ay - i, 1, 2 * i + 1, this.cHud);
                s.text('YOU', ax + 8, ay - 3, arc, this.cHud);
            }
        } else if (P === Phase.Bitten) {
            s.textBox('BITTEN!', midX, midY - 26, dsp, 3, this.cRed, this.cGreen, this.cBg);
            const txt = m.lives <= 0 ? 'NO KNIGHTS LEFT' : m.lives === 1 ? 'LAST KNIGHT' : m.lives + ' KNIGHTS LEFT';
            s.textCenteredShadow(txt, midX, midY + 6, arc, this.cCream, this.cBg, 1);
        } else if (P === Phase.Clear) {
            // the plates sit above and below the middle: the knight holding the relic stays in view
            s.textBox('MAZE CLEAR', midX, OY + 18, dsp, 3, this.cHud, this.cGold, this.cBg);
            if (pt >= f32(0.4)) {
                s.plate(midX - 70, OY + MH - 46, 140, 34, this.cBg, this.cGold);
                s.textCentered('RELIC BONUS', midX, OY + MH - 41, dsp, this.cCream, 1);
                s.textCentered(String(r.lastBonus), midX, OY + MH - 30, dsp, this.cHud, 2);
            }
        } else if (P === Phase.Card || P === Phase.Over) {
            const won = r.roundWon;
            s.textBox(won ? spec.roundWonText : spec.roundLostText, midX, OY + 18, dsp, 3, won ? this.cHud : this.cRed, won ? this.cGold : this.cRed, this.cBg);
            s.plate(midX - 84, OY + MH - 56, 168, 46, this.cBg, this.cGreen);
            s.textCentered('SCORE ' + d6(r.score), midX, OY + MH - 50, arc, this.cHud, 2);
            s.textCentered('MAZES ' + r.levelsCleared + ' OF ' + r.levelsToWin, midX, OY + MH - 28, arc, won ? this.cGoldHi : this.cCream, 2);
        }
    }
}
