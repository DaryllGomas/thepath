// THE NODE · the cabinet with no name · THE PICTURE: the high-resolution glowing canvas (the showpiece).
//
// It only READS the sim (round.js) and draws; it never changes it. One canvas out (the cabinet's CRT texture or
// the standalone page), any 4:3 size (640x480 on the cabinet; the page sizes it to the window). Logical units are
// the cabinet's 320x240, scaled.
//
//   the pipeline (all 2D canvas, no shadowBlur, one stroke() per colour):
//     CUR  this frame's vector lines, drawn additively ('lighter') from per-colour path buckets (school.js Pen)
//     TRAIL phosphor persistence: the last six frames, kept at half resolution in a ring, are added back under
//          CUR with weights decaying by age (tau), so anything that moves leaves a short soft trail. (Not a
//          recursive fade: 8-bit fades never reach black and leave ghosts; a ring of real frames cannot.)
//     BLOOM OUT is box-filtered down 2x, 4x, 8x and the 4x/8x copies are added back, scaled up: the glow
//   THE GEOMETRY grows coherent with resonance: every form of the level's school drifts and turns a little on its
//   own when resonance is low (sim.coherence ~ 0) and locks onto the others as it rises, until the field is one
//   still mandala at full resonance. Forms turn with the rings' own angles, so when the rings stop, all of it stops.
//   SAFETY (a public website): nothing flashes; nothing blinks faster than ~0.3 Hz; no red; no full-screen
//   luminance change faster than ~0.5 s; hits and misses are local, eased (0.4-0.6 s) brightness bumps.
//   REDUCED MOTION: decorative rotation x0.25, wobble x0.3, no breathing, shorter trails, the descent is a gentle
//   1.00 -> 1.08 scale and a crossfade instead of the tunnel, softer pulse lights. (The sim slows its rings too.)
//   THE FLASH: level V, once, when resonance first reaches 4, for 0.85 s the lattice's negative space takes the
//   shape of THE GATE (cut out of the faint school layer only; never highlighted; gameplay layers untouched).
import { drawGateMark } from '../../../marks.js';
import { symbolLines, eachTextStroke, textWidth } from './glyphs.js';
import { Phase, DUR, TABLE_T, CX, CY, dAng } from './round.js';
import { LEVELS, LEVEL_DATA } from './levels.js';
import { NamelessScores, AVR, AVR_SCORE } from './scores.js';
import * as F from './school.js';

const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const d6 = (n) => String(Math.max(0, Math.floor(n))).padStart(6, '0').slice(-6);

export const COLORS = Object.freeze({
    cyan: '#3ee8ff', cyanDeep: '#2a9ec8', teal: '#35e0c0', green: '#5dff9a', gold: '#ffc84a', goldPale: '#ffe6a0',
    magenta: '#d27cff', violet: '#8f7cff', white: '#eafcff', amber: '#ffa040', gate: '#ffe8b8', black: '#000000',
    probe: '#9ff4ff', goldHot: '#ffd968',
});
const C = COLORS;
const BPM = LEVEL_DATA.bpm;
export const GATE_R = 66;                                    // THE GATE's ring radius on the tube (logical px)
export const ATTRACT_CYCLE = 18;
const NAMELESS_TRAILS = 7;

function makeCanvas(w, h) {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return new OffscreenCanvas(w, h);
}

export class NamelessRenderer {
    constructor(canvas, opts = {}) {
        this.out = canvas;
        this.reducedMotion = !!opts.reducedMotion;
        this.table = opts.table || NamelessScores.for(opts.cabinetId || 'nameless');
        this.bloom = opts.bloom !== undefined ? opts.bloom : 1;
        this.pen = new F.PathPen(() => new Path2D());       // the field (school + play), drawn under the field transform
        this.back = new F.PathPen(() => new Path2D());      // the school layer alone (so THE FLASH can cut it)
        this.hud = new F.PathPen(() => new Path2D());       // screen-space overlays
        this.xf = new F.Xf();
        this._echoOn = 0; this.echoGain = 1;              // THE FLASH's strength (tests set 0 to compare)
        this.stats = { frames: 0, ms: 0, avg: 0, max: 0, last: 0 };
        this._alloc(canvas.width, canvas.height);
    }

    _alloc(w, h) {
        this.W = w; this.H = h;
        this.cur = makeCanvas(w, h);
        const tw = Math.max(1, w >> 1), th = Math.max(1, h >> 1);
        this.trail = []; this.trailCtx = []; this.trailAt = [];
        for (let i = 0; i < NAMELESS_TRAILS; i++) { const c = makeCanvas(tw, th); this.trail.push(c); this.trailCtx.push(c.getContext('2d')); this.trailAt.push(-1e9); }
        this.trailHead = 0; this.clock = 0; this._capAcc = 1;
        this.tacc = makeCanvas(tw, th); this.ta = this.tacc.getContext('2d');      // the trails summed at half size
        // the school (faint background geometry) is rasterised at most 540 lines tall and laid in with one blit:
        // it is the costliest layer to stroke and the softest to look at
        this.ss = Math.min(1, 540 / h);
        this.sch = makeCanvas(Math.max(1, Math.round(w * this.ss)), Math.max(1, Math.round(h * this.ss)));
        this.schc = this.sch.getContext('2d');
        this.s0 = makeCanvas(Math.max(1, w >> 1), Math.max(1, h >> 1));
        this.s1 = makeCanvas(Math.max(1, w >> 2), Math.max(1, h >> 2));
        this.s2 = makeCanvas(Math.max(1, w >> 3), Math.max(1, h >> 3));
        this.gc = this.cur.getContext('2d'); this.oc = this.out.getContext('2d');
        this.c0 = this.s0.getContext('2d'); this.c1 = this.s1.getContext('2d'); this.c2 = this.s2.getContext('2d');
        this.k = Math.min(w / 320, h / 240);
        this.ox = (w - 320 * this.k) / 2; this.oy = (h - 240 * this.k) / 2;
    }

    resize(w, h) {
        w = Math.max(64, w | 0); h = Math.max(48, h | 0);
        if (w === this.W && h === this.H) return;
        this.out.width = w; this.out.height = h;
        this._alloc(w, h);
    }

    clearTrails() { for (let i = 0; i < this.trailAt.length; i++) this.trailAt[i] = -1e9; }

    // view: { mode: 'attract' | 'notice' | 'round', sim, t (attract/notice clock), reduced (notice toggle state) }
    render(view, dt) {
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        const g = this.gc;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H);
        g.lineJoin = 'round'; g.lineCap = 'round';
        let look = { tau: 0.08, trail: 0.45 };
        if (view.mode === 'round' && view.sim && view.sim.level) look = this._round(view.sim);
        else if (view.mode === 'notice') look = this._notice(view.t || 0, !!view.reduced);
        else look = this._attract(view.t || 0);
        this._composite(Math.max(0, Math.min(0.1, dt || 1 / 60)), look);
        if (t0) {
            const ms = performance.now() - t0, s = this.stats;
            s.frames++; s.last = ms; s.ms += ms; s.max = Math.max(s.max, ms);
            s.avg = s.avg ? s.avg * 0.97 + ms * 0.03 : ms;
        }
    }

    // ------------------------------------------------------------------ compositing
    _base(k = 1, cx = CX, cy = CY) {
        // logical -> pixels, optionally scaled by k about (cx, cy)
        const s = this.k * k;
        this.gc.setTransform(s, 0, 0, s, this.ox + cx * this.k * (1 - k), this.oy + cy * this.k * (1 - k));
    }

    // logical -> pixels on another context whose canvas is `scale` x the output (the school layer)
    _baseOn(ctx, k, scale) {
        const s = this.k * k * scale;
        ctx.setTransform(s, 0, 0, s, (this.ox + CX * this.k * (1 - k)) * scale, (this.oy + CY * this.k * (1 - k)) * scale);
    }

    _composite(dt, look) {
        const W = this.W, H = this.H, o = this.oc;
        this.clock += dt;
        // keep this frame in the ring (at most 60 a second, so the trail is the same length at any frame rate)
        this._capAcc += dt;
        if (this._capAcc >= 1 / 60 - 1e-4) {
            this._capAcc = 0;
            this.trailHead = (this.trailHead + 1) % this.trail.length;
            const tc = this.trailCtx[this.trailHead];
            tc.globalCompositeOperation = 'copy'; tc.globalAlpha = 1;
            tc.drawImage(this.cur, 0, 0, this.trail[this.trailHead].width, this.trail[this.trailHead].height);
            this.trailAt[this.trailHead] = this.clock;
        }
        const tau = this.reducedMotion ? Math.min(look.tau, 0.05) : look.tau;
        const k = (this.reducedMotion ? 0.3 : look.trail) * 0.5;
        o.globalCompositeOperation = 'copy'; o.globalAlpha = 1;
        o.drawImage(this.cur, 0, 0);
        // sum the older frames at half size, then lay them under once (one full-size blend, not six)
        const ta = this.ta;
        ta.globalCompositeOperation = 'copy'; ta.globalAlpha = 1; ta.fillStyle = '#000'; ta.fillRect(0, 0, this.tacc.width, this.tacc.height);
        ta.globalCompositeOperation = 'lighter';
        let any = false;
        for (let i = 0; i < this.trail.length; i++) {
            if (i === this.trailHead) continue;                    // this frame is drawn sharp, above
            const age = this.clock - this.trailAt[i];
            if (age <= 0 || age > 0.5) continue;
            const w = k * Math.exp(-age / Math.max(0.01, tau));
            if (w < 0.01) continue;
            ta.globalAlpha = w; ta.drawImage(this.trail[i], 0, 0); any = true;
        }
        o.globalCompositeOperation = 'lighter';
        if (any) { o.globalAlpha = 1; o.drawImage(this.tacc, 0, 0, W, H); }
        if (this.bloom > 0) {
            const c0 = this.c0, c1 = this.c1, c2 = this.c2;
            c0.globalCompositeOperation = 'copy'; c0.drawImage(this.out, 0, 0, this.s0.width, this.s0.height);
            c1.globalCompositeOperation = 'copy'; c1.drawImage(this.s0, 0, 0, this.s1.width, this.s1.height);
            c2.globalCompositeOperation = 'copy'; c2.drawImage(this.s1, 0, 0, this.s2.width, this.s2.height);
            const b = this.bloom * (look.bloom !== undefined ? look.bloom : 1);
            o.globalAlpha = 0.42 * b; o.drawImage(this.s1, 0, 0, W, H);
            o.globalAlpha = 0.55 * b; o.drawImage(this.s2, 0, 0, W, H);
        }
        o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    }

    // ------------------------------------------------------------------ small drawing helpers (into a pen)
    _glyph(pen, name, x, y, size, sx = 1) {
        for (const pl of symbolLines(name)) {
            const pts = new Array(pl.length);
            for (let i = 0; i < pl.length; i += 2) { pts[i] = x + pl[i] * size * sx; pts[i + 1] = y + pl[i + 1] * size; }
            pen.poly(pts, false);
        }
    }

    _text(pen, s, x, y, size, align = 'left') {
        if (align === 'center') x -= textWidth(s, size) / 2;
        else if (align === 'right') x -= textWidth(s, size);
        eachTextStroke(s, x, y, size, (pts) => pen.poly(pts, false));
    }

    _diamond(pen, x, y, r) { pen.poly([x, y - r, x + r * 0.8, y, x, y + r, x - r * 0.8, y, x, y - r], false); }

    // the moving parts' wobble: 0 when the field is coherent (and during THE FLASH, and in stillness)
    _wobble(sim) {
        const c = sim.coherence;
        let w = (1 - c) * (1 - c * 0.35);
        if (this.reducedMotion) w *= 0.3;
        return w * sim.spinNow;
    }

    // ------------------------------------------------------------------ THE SCHOOL (per level)
    _school(pen, sim, alphaK) {
        const L = sim.level, t = sim.time, coh = sim.coherence, xf = this.xf, rm = this.reducedMotion;
        const w = this._wobble(sim) * (1 - this._echoOn);
        const rA = (i) => (sim.rings[Math.min(i, sim.rings.length - 1)].angle * DEG) * (rm ? 0.25 : 1);
        const wob = (i, amp = 1) => ({
            rot: w * amp * 0.35 * Math.sin(t * (0.23 + i * 0.07) + i * 1.9),
            dx: w * amp * 6 * Math.sin(t * (0.31 + i * 0.05) + i * 2.3), dy: w * amp * 6 * Math.cos(t * (0.27 + i * 0.06) + i * 1.3),
            k: 1 + w * amp * 0.05 * Math.sin(t * (0.19 + i * 0.04) + i),
        });
        const place = (i, rot, amp = 1) => { const q = wob(i, amp); return xf.set(CX, CY, rot + q.rot, q.k, q.dx, q.dy); };
        const A = (base) => Math.min(1, (base + (0.22 + 0.2 * base) * coh) * alphaK);
        const ph = L.phase ? sim.phaseAB : 0;
        for (const f of L.school) {
            switch (f) {
                case 'point':
                    pen.style('pt', C.white, A(0.5), 0.6, true); pen.circle(CX, CY, 1.3);
                    break;
                case 'seed':
                    pen.style('seed', C.teal, A(0.2), 0.55);
                    F.seedOfLife(pen, place(1, rA(1) + TAU / 12), 29);
                    if (coh > 0.45) { pen.style('seed2', C.teal, A(0.12) * smooth((coh - 0.45) * 3), 0.5); F.flower(pen, place(2, rA(1) + TAU / 12), 29 / 2, 2, 1, false); }
                    break;
                case 'hexagram':
                    pen.style('hexg', C.gold, A(0.16), 0.55);
                    F.hexagram(pen, place(3, -rA(0) * 0.5), 100);
                    break;
                case 'division':
                    pen.style('div', C.cyanDeep, A(0.2), 0.5);
                    F.radial(pen, place(4, rA(0), 0.5), coh > 0.5 ? 12 : 6, 60, 97);
                    break;
                case 'vesicas':
                    pen.style('ves', C.magenta, A(0.14), 0.55);
                    for (let i = 0; i < 3; i++) F.vesica(pen, place(5 + i, rA(1) * 0.6 + i * TAU / 6), 50, 0);
                    break;
                case 'flower19':
                    pen.style('fl19', C.teal, A(0.16), 0.5);
                    F.flower(pen, place(8, rA(0) * 0.4 + TAU / 12), 62 / 3, 2, 0.4 + 0.6 * coh);
                    break;
                case 'intersections': {
                    pen.style('ix', C.white, A(0.35), 0.5, true);
                    const q = place(8, rA(0) * 0.4 + TAU / 12), r = 62 / 3;
                    for (const [x, y] of F.hexLattice(2)) for (let k = 0; k < 6; k++) {
                        if (k > 2 * coh * 6) break;
                        const a = k * TAU / 6 + TAU / 12;
                        const px = (x + Math.cos(a) / Math.sqrt(3)) * r, py = (y + Math.sin(a) / Math.sqrt(3)) * r;
                        if (px * px + py * py < 58 * 58) pen.circle(q.x(px, py), q.y(px, py), 0.55);
                    }
                    break;
                }
                case 'polygons': {
                    pen.style('poly', C.green, A(0.2), 0.55);
                    const turns = [0, 1, 2, 3, 4, 5].map((i) => (i % 2 ? -1 : 1) * rA(i % 3) * (0.5 + i * 0.12) * (1 - coh * 0.7));
                    F.nestedPolygons(pen, place(11, 0, 0.6), 30, 97, 6, turns);
                    break;
                }
                case 'spirals':
                    pen.style('spir', C.gold, A(0.18), 0.55);
                    F.goldenSpiral(pen, place(12, rA(0) * 0.7), 98, 1, 0);
                    F.goldenSpiral(pen, place(13, rA(0) * 0.7), 98, -1, Math.PI);
                    break;
                case 'phyllotaxis':
                    pen.style('phy', C.teal, A(0.35), 0.5, true);
                    F.phyllotaxis(pen, place(14, -rA(2) * 0.8, 0.4), Math.round(24 + 120 * coh), 2.9, 0.62);
                    break;
                case 'metatron': {
                    const l5 = L.number === 5, d = l5 ? 50 : 36;
                    pen.style('metc', C.teal, A(l5 ? 0.1 : 0.17), 0.5);
                    F.metatron(pen, place(15, rA(1) * 0.5), d, false, true);
                    pen.style('metl', C.cyanDeep, A(l5 ? 0.09 : 0.16), 0.45);
                    F.metatron(pen, place(15, rA(1) * 0.5), d, true, false, l5 ? 1 : 0.35 + 0.65 * coh);
                    break;
                }
                case 'startetra':
                    pen.style('star6', C.gold, A(0.2), 0.6);
                    F.hexagram(pen, place(16, -rA(0) * 0.5), 72);
                    pen.style('cube', C.magenta, A(0.16), 0.5);
                    F.cubeY(pen, place(17, -rA(0) * 0.5), 36);
                    break;
                case 'mirroraxis':
                    pen.style('axis', C.white, A(0.08), 0.45);
                    pen.line(CX - 108, CY, CX + 108, CY);
                    break;
                case 'sriyantra': {
                    const a = A(0.3) * (0.6 + 0.4 * ph);
                    pen.style('sri', C.magenta, a, 0.55);
                    F.sriYantra(pen, place(18, 0, 0.3), 37, 0.35 + 0.65 * coh, false);
                    break;
                }
                case 'flower37':
                    pen.style('fl37', C.teal, A(0.15) * (1 - 0.45 * ph), 0.5);
                    F.flower(pen, place(19, rA(1) * 0.35 + TAU / 12), 72 / 4, 3, 0.35 + 0.65 * coh);
                    break;
                case 'lotus':
                    pen.style('lot', C.gold, A(0.16), 0.55);
                    F.lotus(pen, place(20, -rA(2) * 0.5), 16, 46, 60, -Math.PI / 2);
                    break;
            }
        }
    }

    // ------------------------------------------------------------------ THE ROUND
    _round(sim) {
        const P = Phase, p = sim.p, pt = sim.phaseTime, g = this.gc, rm = this.reducedMotion;
        const ending = sim.ending;
        const look = { tau: 0.08, trail: 0.45, bloom: 1 };
        let S = 1, alpha = 1, lens = null, outsideA = 1, showHud = true, drawField = true;
        // THE FLASH window (level V, renderer only)
        this._echoOn = 0;
        if (sim.echoAt > 0 && sim.p === P.Play) { const e = (sim.time - sim.echoAt) / 0.85; if (e > 0 && e < 1) this._echoOn = Math.sin(Math.PI * e); }

        if (p === P.Ready) {
            const dur = sim.levelIndex === 0 ? DUR.firstReady : DUR.ready;
            alpha = smooth(pt / (dur * 0.55));
        } else if (p === P.Descend) {
            const u = pt / DUR.descend;
            S = rm ? 1 + 0.08 * u : 1 + 2.6 * u * u;
            alpha = 1 - smooth(u * 1.35);
            look.tau = rm ? 0.05 : 0.16; look.trail = 0.75;
        } else if (p === P.Dying) {
            alpha = 1 - 0.72 * smooth(pt / DUR.dying);
        } else if (p === P.Card && !ending) {
            alpha = 0.16;
        } else if (ending) {
            if (p === P.Align) { look.tau = 0.1; }
            else if (p === P.Still) { look.tau = 0.03; }
            else if (p === P.Vesica) {
                const u1 = smooth((pt - 0.8) / (DUR.vesica - 0.8));
                S = 1 - 0.985 * u1;
                if (pt > 0.8) { lens = 46; outsideA = 1 - smooth(u1 * 1.7); }
                look.tau = 0.12; look.trail = 0.7;
            } else { drawField = false; }
            if (p >= P.Align) showHud = p <= P.Still;
        }

        // ---- the field (school + rings + nodes + probe + core), under the field transform
        if (drawField && alpha > 0.002) {
            const back = this.back, pen = this.pen;
            back.begin(); pen.begin();
            this._school(back, sim, alpha * (1 + 0.8 * this._echoOn * this.echoGain));   // THE FLASH: the forms lock and swell a little
            this._play(pen, sim, alpha);
            // the school onto its own (smaller) layer; THE FLASH cuts that layer only
            const sc = this.schc;
            sc.setTransform(1, 0, 0, 1, 0, 0); sc.globalAlpha = 1; sc.globalCompositeOperation = 'source-over';
            sc.clearRect(0, 0, this.sch.width, this.sch.height);
            sc.lineJoin = 'round'; sc.lineCap = 'round';
            this._baseOn(sc, S, this.ss);
            sc.globalCompositeOperation = 'lighter';
            back.flush(sc, 1);
            if (this._echoOn > 0 && this.echoGain > 0) this._echo(this._echoOn * this.echoGain, S);
            const flushField = (a) => {
                g.setTransform(1, 0, 0, 1, 0, 0);
                g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a);
                g.drawImage(this.sch, 0, 0, this.W, this.H);
                g.globalAlpha = 1;
                this._base(S);
                pen.flush(g, a);
            };
            if (lens) {
                const pts = F.lensPoints(lens, lens, 28);
                const lensPath = () => { g.beginPath(); g.moveTo(CX + pts[0], CY + pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(CX + pts[i], CY + pts[i + 1]); g.closePath(); };
                // outside the lens: fading; inside: whole
                g.save(); this._base(1); g.beginPath(); g.rect(-400, -400, 1200, 1200); g.moveTo(CX + pts[0], CY + pts[1]);
                for (let i = 2; i < pts.length; i += 2) g.lineTo(CX + pts[i], CY + pts[i + 1]); g.closePath(); g.clip('evenodd');
                flushField(outsideA); g.restore();
                g.save(); this._base(1); lensPath(); g.clip(); flushField(1); g.restore();
            } else flushField(1);
        }

        // ---- the tunnel (the descent), screen space
        if (p === P.Descend && !rm) this._tunnel(sim, pt / DUR.descend);

        // ---- screen-space overlays: HUD, the ending, cards
        const h = this.hud;
        h.begin();
        if (showHud && p !== P.Descend) this._hud(h, sim, p === P.Dying ? alpha : p === P.Card ? 0.35 : 1);
        if (p === P.Ready) this._numeral(h, sim, pt);
        if (ending) this._ending(h, sim, look);
        else if (p === P.Card) this._lostCard(h, sim, pt);
        this._base(1);
        g.globalCompositeOperation = 'lighter';
        h.flush(g, 1);
        if (ending && p >= P.Gate) this._gate(sim);
        g.globalCompositeOperation = 'source-over';
        return look;
    }

    // THE FLASH: cut the Gate's silhouette out of the school layer (negative space), eased in and out
    _echo(e, S) {
        const g = this.schc;
        g.save();
        g.globalCompositeOperation = 'destination-out';
        this._baseOn(g, 1, this.ss);
        drawGateMark(g, CX, CY + 0.14 * 58, 58, { progress: 1, fill: Math.min(1, e), lineWidth: 2.4, alpha: Math.min(1, e), color: '#000', fillColor: '#000' });
        g.restore();
    }

    // rings, clock, map accents, nodes, probe, core, pulse lights
    _play(pen, sim, alphaK) {
        const P = Phase, p = sim.p, t = sim.time, L = sim.level, rm = this.reducedMotion;
        const open = p === P.Open, ready = p === P.Ready;
        const readyU = ready ? clamp01(sim.phaseTime / ((sim.levelIndex === 0 ? DUR.firstReady : DUR.ready) * 0.8)) : 1;
        const want = sim.want, inner = sim.rings.length - 1;
        const guideRing = sim.guide >= 1 && p === P.Play ? this._guideTarget(sim) : null;
        const breath = rm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.1);

        // rings (drawn in from the probe's angle during Ready)
        for (let i = 0; i < sim.rings.length; i++) {
            const ring = sim.rings[i], mine = i === sim.probe.ring;
            let a = mine ? 0.95 : 0.42;
            if (open) a = i === inner ? 0.55 + 0.4 * breath : 0.3;
            if (sim.ending) a = 0.7 + 0.3 * sim.coherence;
            if (guideRing && guideRing.ring === i && !mine) a += 0.22 * breath;
            pen.style('ring' + i, mine && !sim.ending ? C.cyan : C.cyanDeep, a * alphaK, mine ? 0.85 : 0.6);
            if (readyU < 1) { const a0 = sim.probe.a * DEG; pen.arc(CX, CY, ring.r, a0, a0 + TAU * smooth(readyU)); }
            else pen.circle(CX, CY, ring.r);
            // tick marks turn with the ring
            pen.style('tick', C.cyanDeep, 0.4 * alphaK * readyU, 0.5);
            const n = 24, a0 = ring.angle * DEG;
            for (let k = 0; k < n; k++) {
                const ang = a0 + k * TAU / n, c = Math.cos(ang), s = Math.sin(ang), r0 = ring.r + 1.2, r1 = ring.r + (k % 3 === 0 ? 3.4 : 2.2);
                pen.line(CX + c * r0, CY + s * r0, CX + c * r1, CY + s * r1);
            }
        }

        // the clock: a thin arc outside the rings, emptying clockwise from the top; amber for the last ten seconds
        if (sim.timed && sim.timeMax > 0 && !sim.ending) {
            const f = clamp01(sim.timeLeft / sim.timeMax), low = sim.timeLeft < 10 && p === P.Play;
            pen.style('clock', low ? C.amber : C.teal, (low ? 0.85 : 0.6) * alphaK * readyU, 1.1);
            const end = -Math.PI / 2 + TAU * f * readyU;
            if (f > 0.001) { pen.arc(CX, CY, 111, -Math.PI / 2, end); pen.line(CX + Math.cos(end) * 108.5, CY + Math.sin(end) * 108.5, CX + Math.cos(end) * 113.5, CY + Math.sin(end) * 113.5); }
            pen.style('clockBed', C.cyanDeep, 0.12 * alphaK * readyU, 0.5);
            pen.circle(CX, CY, 111);
        }

        // THE HIDDEN MAP (placeholder data): seven faint accents that brighten on their beats
        if (L.map && !sim.ending && readyU >= 1) {
            const beat = t * BPM / 60;
            const slots = L.map.slots, ex = Math.min(slots.length, L.map.exposed);
            for (let i = 0; i < ex; i++) {
                const s = slots[i], ph = (beat / s.interval) % 1;
                const pulse = rm ? 0.3 : Math.exp(-ph * 4) * (0.4 + 0.2 * s.accent);
                const ang = (s.position + s.direction * sim.rings[0].angle * 0.5 - 90) * DEG;
                // brightness goes in through a per-slot bucket so each keeps its own alpha
                pen.style('map' + i, C.goldPale, (0.12 + 0.3 * pulse) * alphaK, 0.5);
                this._diamond(pen, CX + Math.cos(ang) * 117, CY + Math.sin(ang) * 117, 1.4);
            }
        }

        // nodes
        const pr = sim.probe, tol = sim.tolFor(pr.ring);
        const twinA = L.mirror ? sim.twinAngle() : null;
        let aligned = -1, alignedTwin = -1;
        if (p === P.Play) {
            aligned = sim.nearest(pr.ring, pr.a, tol);
            if (twinA !== null) alignedTwin = sim.nearest(pr.ring, twinA, tol);
        }
        for (let i = 0; i < sim.nodes.length; i++) {
            const n = sim.nodes[i];
            const appear = ready ? smooth((readyU - 0.35 - i * 0.04) * 4) : 1;
            if (appear <= 0) continue;
            let ang = n.a;
            const wAge = t - n.wrongAt;
            if (wAge >= 0 && wAge < 0.4) ang += 5 * Math.sin(Math.PI * wAge / 0.4);          // it slips out of phase and back
            const x = CX + n.r * Math.cos(ang * DEG), y = CY + n.r * Math.sin(ang * DEG);
            const hAge = t - n.hitAt, hit = hAge >= 0 && hAge < 0.6;
            const isAl = i === aligned || i === alignedTwin;
            let a = (n.travel ? 0.5 : 0.88) * appear * alphaK;
            let size = 6.3;
            if (hit) size *= 1 + (rm ? 0.1 : 0.22) * Math.sin(Math.PI * hAge / 0.6);
            if (sim.ending) a = (0.75 + 0.25 * sim.coherence) * alphaK;
            const col = isAl ? C.goldHot : wAge >= 0 && wAge < 0.4 ? C.magenta : C.gold;
            pen.styleQ(isAl ? 'nodeAl' : wAge >= 0 && wAge < 0.4 ? 'nodeW' : 'node', col, isAl ? Math.min(1, a + 0.15) : a, isAl ? 1.15 : 0.8);
            if (L.phase && !n.travel && sim.phaseAB > 0 && sim.phaseAB < 1) {
                // the face turns: A narrows away, B opens
                const u = sim.phaseAB;
                if (u < 0.5) this._glyph(pen, n.sym, x, y, size, Math.cos(Math.PI * u));
                else this._glyph(pen, n.symB, x, y, size, -Math.cos(Math.PI * u));
            } else this._glyph(pen, sim.symOf(n), x, y, size);
            if (n.travel) {
                pen.style('migr', C.gold, 0.18 * alphaK, 0.45);
                const r0 = sim.rings[n.travel.from].r, r1 = sim.rings[n.travel.to].r, c = Math.cos(ang * DEG), s = Math.sin(ang * DEG);
                for (let k = 0; k < 5; k++) { const u0 = k / 5, u1 = u0 + 0.1; pen.line(CX + c * lerp(r0, r1, u0), CY + s * lerp(r0, r1, u0), CX + c * lerp(r0, r1, u1), CY + s * lerp(r0, r1, u1)); }
            }
            if (sim.guide >= 2 && guideRing && guideRing.node === i) {
                pen.style('guide', C.goldPale, (0.2 + 0.2 * breath) * alphaK, 0.5);
                pen.circle(x, y, 10.5);
            }
        }

        // pulse lights: local, eased, never full-screen
        for (const e of sim.events) {
            const age = t - e.t;
            if (age < 0 || age > 0.6) continue;
            const u = age / 0.6, r = sim.rings[e.ring] ? sim.rings[e.ring].r : 60;
            let x, y;
            if (e.node >= 0) { const n = sim.nodes[e.node]; x = CX + n.r * Math.cos(n.a * DEG); y = CY + n.r * Math.sin(n.a * DEG); }
            else { x = CX + r * Math.cos(e.a * DEG); y = CY + r * Math.sin(e.a * DEG); }
            const soft = rm ? 0.5 : 1;
            if (e.kind === 'hit') { pen.styleQ('rip', C.goldPale, 0.65 * (1 - u) * soft * alphaK, 0.6); pen.circle(x, y, 6 + 13 * smooth(u)); }
            else if (e.kind === 'wrong') { pen.styleQ('ripW', C.magenta, 0.45 * (1 - u) * soft * alphaK, 0.55); pen.circle(x, y, 6 + 6 * smooth(u)); }
            else { pen.styleQ('ripM', C.cyanDeep, 0.35 * (1 - u) * soft * alphaK, 0.5); pen.circle(x, y, 2 + 5 * smooth(u)); }
        }

        // the probe (and its twin on level IV)
        if (!sim.ending || sim.p <= P.Still) {
            let r = sim.rings[pr.ring].r;
            const sAge = t - pr.shiftAt;
            if (sAge >= 0 && sAge < 0.15) r = lerp(sim.rings[pr.fromRing].r, r, smooth(sAge / 0.15));
            if (p === P.Descend) r = lerp(sim.rings[inner].r, 0, smooth(sim.phaseTime / 0.5));
            const pa = readyU;
            if (aligned >= 0) {
                const n = sim.nodes[aligned];
                pen.style('aim', C.goldHot, 0.3 * alphaK, 0.45);
                pen.line(CX + (r - 7) * Math.cos(pr.a * DEG), CY + (r - 7) * Math.sin(pr.a * DEG), CX + (n.r + 7) * Math.cos(n.a * DEG), CY + (n.r + 7) * Math.sin(n.a * DEG));
            }
            this._probe(pen, 'probe', pr.a, r, C.probe, alphaK * pa, 1.0);
            if (twinA !== null && !sim.ending) this._probe(pen, 'twin', twinA, r, C.probe, 0.55 * alphaK * pa, 0.7, false);
        }

        // the core: the symbol wanted now, the resonance pips round it; open: a well of circles
        this._core(pen, sim, alphaK, readyU);
    }

    _probe(pen, key, angDeg, r, col, a, w, filled = true) {
        const c = Math.cos(angDeg * DEG), s = Math.sin(angDeg * DEG);
        const tipR = Math.max(0, r - 7.5), baseR = r + 4, hw = 5.2;
        const tx = CX + c * tipR, ty = CY + s * tipR, bx = CX + c * baseR, by = CY + s * baseR;
        const tri = [tx, ty, bx - s * hw, by + c * hw, bx + s * hw, by - c * hw, tx, ty];
        if (filled) { pen.style(key + 'Fill', col, a * 0.38, 0, true); pen.poly(tri, true); }
        pen.style(key, col, a, w);
        pen.poly(tri, false);
    }

    _guideTarget(sim) {
        let best = null, bd = 1e9;
        for (let i = 0; i < sim.nodes.length; i++) {
            const n = sim.nodes[i];
            if (n.travel || sim.symOf(n) !== sim.want) continue;
            const shifts = (n.ring - sim.probe.ring + sim.rings.length) % sim.rings.length;
            const d = shifts * 50 + Math.abs(dAng(sim.probe.a, n.a));
            if (d < bd) { bd = d; best = { ring: n.ring, node: i }; }
        }
        return best;
    }

    _core(pen, sim, alphaK, readyU) {
        const P = Phase, p = sim.p, t = sim.time, n = sim.seq.length;
        const coreR = 14, pipR = 19.5;
        const openU = p === P.Open ? smooth((t - sim.openAt) / 0.9) : 0;
        const full = sim.ending;
        // backing disc: the core reads over any school form behind it
        pen.style('coreBack', C.black, 0.85 * alphaK, 0, true, 'source-over');
        pen.circle(CX, CY, coreR + 1.5);
        pen.style('core', C.cyanDeep, 0.55 * alphaK * readyU, 0.6);
        pen.circle(CX, CY, coreR + openU * 6);
        if (p === P.Play || (p === P.Ready && readyU > 0.6) || p === P.Dying) {
            const w = sim.want;
            if (w) { pen.style('want', C.white, (p === P.Ready ? smooth((readyU - 0.6) * 3) : 1) * alphaK, 1.0); this._glyph(pen, w, CX, CY, 10.5); }
        }
        if (openU > 0 || p === P.Descend) {
            // the well: circles falling inward, slowly
            const ph = (t * (this.reducedMotion ? 0.15 : 0.45)) % 1;
            for (let k = 0; k < 6; k++) {
                const r = (coreR + openU * 6) * Math.pow(0.72, k + ph);
                pen.style('well' + k, C.cyan, (0.15 + 0.1 * k) * openU * alphaK, 0.5);
                pen.circle(CX, CY, r);
            }
        }
        if (full) {
            pen.style('bindu', C.white, 0.9 * alphaK, 0.6, true);
            pen.circle(CX, CY, 1.4);
        }
        // the resonance meter: one arc segment per symbol this level, lit (green) as resonance builds
        const gap = 0.16;
        for (let k = 0; k < n; k++) {
            const a0 = -Math.PI / 2 + k * TAU / n + gap / 2, a1 = a0 + TAU / n - gap;
            const lit = k < sim.idx || full;
            pen.style(lit ? 'meterOn' : 'meterOff', lit ? C.green : C.cyanDeep, (lit ? 0.95 : 0.35) * alphaK * readyU, lit ? 1.5 : 0.7);
            pen.arc(CX, CY, pipR, a0, a1);
        }
    }

    _hud(h, sim, a) {
        const L = sim.level, t = sim.time;
        h.style('hudScore', C.cyan, 0.8 * a, 0.7);
        this._text(h, d6(sim.score), 12, 10, 7);
        if (t - sim.bonusAt < 2.2 && sim.lastBonus > 0) {
            h.style('hudBonus', C.gold, 0.8 * a * (1 - smooth((t - sim.bonusAt - 1.4) / 0.8)), 0.6);
            this._text(h, '+' + sim.lastBonus, 12, 21, 5);
        }
        h.style('hudLevel', C.gold, 0.85 * a, 0.8);
        this._text(h, L.numeral, 308, 10, 9, 'right');
        // the sequence, top to bottom down the right edge
        const n = sim.seq.length, x = 300, y0 = 36, step = 21;
        for (let k = 0; k < n; k++) {
            const y = y0 + k * step, done = k < sim.idx, now = k === sim.idx && !sim.ending;
            h.style(done ? 'seqDone' : now ? 'seqNow' : 'seqNext', done ? C.green : now ? C.white : C.cyanDeep, (done ? 0.7 : now ? 1 : 0.42) * a, now ? 0.9 : 0.65);
            this._glyph(h, sim.seq[k], x, y, now ? 6 : 5);
            if (now) { h.style('seqBr', C.white, 0.6 * a, 0.6); h.line(x - 11, y - 7, x - 11, y + 7); h.line(x + 11, y - 7, x + 11, y + 7); }
        }
    }

    _numeral(h, sim, pt) {
        const dur = sim.levelIndex === 0 ? DUR.firstReady : DUR.ready;
        const u = pt / dur, a = u < 0.15 ? smooth(u / 0.15) : 1 - smooth((u - 0.55) / 0.35);
        if (a <= 0) return;
        h.style('numeral', C.gold, 0.9 * a, 1.1);
        this._text(h, sim.level.numeral, CX, CY - 9, 18, 'center');
    }

    _lostCard(h, sim, pt) {
        const a = smooth(pt / 0.8);
        h.style('lostScore', C.white, 0.9 * a, 0.9);
        this._text(h, d6(sim.score), CX, 58, 12, 'center');
        this._table(h, a, null, 0);
    }

    // ------------------------------------------------------------------ the tunnel (the descent)
    _tunnel(sim, u) {
        const h = this.hud;
        h.begin();
        const n = 9, fade = Math.sin(Math.PI * clamp01(u));
        for (let k = 0; k < n; k++) {
            const z = ((k / n) + u * 1.6) % 1, r = 3 * Math.pow(60, z);
            const a = fade * Math.sin(Math.PI * clamp01(r / 170)) * 0.55;
            if (a <= 0.01) continue;
            h.styleQ('tun' + (k % 3 === 0 ? 'm' : 'c'), k % 3 === 0 ? C.magenta : C.cyan, a, 0.6);
            F.polygon(h, this.xf.set(CX, CY, u * 0.8 + k * 0.1), 6, r, -Math.PI / 2);
        }
        this._base(1);
        this.gc.globalCompositeOperation = 'lighter';
        h.flush(this.gc, 1);
    }

    // ------------------------------------------------------------------ THE WIN (steps 3-5 of the sequence)
    _ending(h, sim, look) {
        const P = Phase, p = sim.p, pt = sim.phaseTime;
        const rho = 46;
        if (p === P.Vesica) {
            // 3. two circles open into a vesica; the geometry contracts through its almond (drawn in the field pass)
            const d = rho * smooth(pt / 0.8), a = smooth(pt / 0.5);
            h.style('vesica', C.magenta, 0.85 * a, 0.8);
            h.circle(CX - d / 2, CY, rho); h.circle(CX + d / 2, CY, rho);
            if (pt > 0.8) {
                const pts = F.lensPoints(rho, rho, 28);
                h.style('lens', C.white, 0.35 * smooth((pt - 0.8) / 0.6), 0.6);
                const q = new Array(pts.length);
                for (let i = 0; i < pts.length; i += 2) { q[i] = CX + pts[i]; q[i + 1] = CY + pts[i + 1]; }
                h.poly(q, true);
            }
        } else if (p === P.Vanish) {
            // the vesica closes to a point
            const u = smooth(pt / DUR.vanish), r = rho * (1 - 0.94 * u), d = r * (1 - u);
            h.style('vesica', C.magenta, 0.85 * (1 - u * 0.8), 0.8);
            h.circle(CX - d / 2, CY, r); h.circle(CX + d / 2, CY, r);
            h.style('bindu', C.white, 0.8, 0.6, true); h.circle(CX, CY, 1.3);
        } else if (p === P.Gate) {
            h.style('bindu', C.white, 0.8 * (1 - smooth(pt / 0.6)), 0.6, true); h.circle(CX, CY, 1.3);
        }
        if (p === P.Table || p === P.Card) {
            const u = p === P.Card ? 99 : pt;
            this._table(h, smooth((u - 0.2) / 0.6), sim, u);
        }
        if (p >= P.Gate) look.tau = 0.05;
    }

    // THE GATE: draws itself (Gate), holds and comes up solid (Hold), then rises above the table (Table, Card)
    _gate(sim) {
        const P = Phase, p = sim.p, pt = sim.phaseTime, g = this.gc;
        let progress = 1, fill = 0.85, R = GATE_R, cy = CY + 0.14 * GATE_R;
        if (p === P.Gate) { progress = pt / DUR.gate; fill = 0; }
        else if (p === P.Hold) { fill = 0.85 * smooth(pt / 1.2); }
        else {
            const u = p === P.Card ? 1 : smooth(pt / 0.7);
            R = lerp(GATE_R, 26, u); cy = lerp(CY + 0.14 * GATE_R, 50, u);
        }
        this._base(1);
        g.globalCompositeOperation = 'lighter';
        drawGateMark(g, CX, cy, R, { progress, fill, color: C.gate, fillColor: C.gate, lineWidth: 0.85, glow: 2.2, alpha: 0.95 });
    }

    // the score table: blank top row; on the win it fills (score, then A·V·R one letter every 0.4 s)
    _table(h, a, sim, u) {
        if (a <= 0) return;
        const rows = this.table ? this.table.rows : [];
        const size = 8, y0 = 104, step = 20, xL = 110, xR = 210;
        h.style('rank', C.cyanDeep, 0.45 * a, 0.6);
        for (let i = 0; i < 5; i++) this._text(h, String(i + 1), 92, y0 + i * step + 1.5, 6);
        h.style('slot', C.cyanDeep, 0.3 * a, 0.5);
        if (!(sim && sim.ending) && rows[0] && rows[0].blank) { for (let k = 0; k < 3; k++) h.line(xL + k * 8, y0 + 9.5, xL + k * 8 + 5, y0 + 9.5); }
        for (let i = 0; i < 5 && i < rows.length; i++) {
            const y = y0 + i * step, r = rows[i];
            if (i === 0 && sim && sim.ending) {
                // the win row: typed in
                const typed = clamp01((u - TABLE_T.appear) / (TABLE_T.scoreEnd - TABLE_T.appear));
                const digits = Math.floor(typed * 6 + 1e-6);
                h.style('rowTop', C.gate, a, 0.9);
                const sc = d6(AVR_SCORE);                    // A·V·R's own score (scores.js), not the player's
                if (digits > 0) this._text(h, sc.slice(0, digits), xR - textWidth(sc, size), y, size);
                let letters = 0;
                for (let k = 0; k < 3; k++) if (u >= TABLE_T.letter0 + k * TABLE_T.letterStep) letters = k + 1;
                const word = ['', 'A', 'A·V', 'A·V·R'][letters];
                if (word) this._text(h, word, xL, y, size);
                continue;
            }
            if (i === 0 && r.blank) continue;                  // the impossible row: nothing at all
            const top = i === 0;
            h.style(top ? 'rowTop' : r.player ? 'rowYou' : 'row', top ? C.gate : r.player ? C.white : C.cyan, (top ? 1 : r.player ? 0.85 : 0.5) * a, 0.75);
            this._text(h, r.initials === AVR ? 'A·V·R' : r.initials, xL, y, size);
            this._text(h, d6(r.score), xR, y, size, 'right');
        }
    }

    // ------------------------------------------------------------------ THE NOTICE (first coin)
    _notice(t, reduced) {
        const h = this.hud, g = this.gc;
        h.begin();
        h.style('nring', C.cyanDeep, 0.14, 0.5); h.circle(CX, CY, 96);
        h.style('ntext', C.white, 0.9, 0.75);
        this._text(h, 'MOVING GEOMETRIC PATTERNS', CX, 74, 6.5, 'center');
        h.style('ntext2', C.cyan, 0.8, 0.7);
        this._text(h, 'B   REDUCED MOTION   ' + (reduced ? 'ON' : 'OFF'), CX, 106, 6, 'center');
        h.style('ntext3', C.gold, 0.85, 0.75);
        this._text(h, 'A   CONTINUE', CX, 128, 6, 'center');
        this._base(1);
        g.globalCompositeOperation = 'lighter';
        h.flush(g, 1);
        return { tau: 0.05, trail: 0.3, bloom: 0.8 };
    }

    // ------------------------------------------------------------------ THE ATTRACT LOOP: the machine breathing
    // 0-4 a point, a circle breathes out of it; 4-8 radial lines, a triangle, a square, an octagon draw
    // themselves and start to turn (outer clockwise, middle still, inner counter-clockwise); 8-12 eight symbols
    // arrive one per beat (108 BPM) and align for an instant; 12-15 the geometry recedes behind the score
    // table (top row blank); 15-18 the rings collapse to the centre. INSERT COIN breathes (never blinks).
    _attract(t) {
        const h = this.pen, g = this.gc, rm = this.reducedMotion, xf = this.xf;
        const u = ((t % ATTRACT_CYCLE) + ATTRACT_CYCLE) % ATTRACT_CYCLE;
        h.begin();
        const spin = rm ? 0.25 : 1;
        const rot = (sign, rate) => sign * rate * spin * DEG * Math.max(0, u - 4);
        let S = 1, A = 1;
        if (u >= 12 && u < 15) { S = lerp(1, 0.74, smooth((u - 12) / 0.8)); A = lerp(1, 0.32, smooth((u - 12) / 0.8)); }
        if (u >= 15) { const c = smooth((u - 15) / 2.6); S = lerp(0.74, 0.02, c); A = lerp(0.32, 0.6, c) * (1 - smooth((u - 17.4) / 0.6)); }
        const breath = rm ? 0.5 : 0.5 + 0.5 * Math.sin(u * TAU / 4.5);
        // the point
        h.style('apt', C.white, 0.55 + 0.25 * breath, 0.6, true); h.circle(CX, CY, 1.4);
        // breathing circles
        if (u < 15) {
            const r1 = 6 + 40 * smooth(u / 4), r2 = u > 2 ? 6 + 26 * smooth((u - 2) / 3) : 0;
            h.style('abreath', C.teal, (0.18 + 0.14 * breath) * A, 0.55);
            h.circle(CX, CY, r1); if (r2) h.circle(CX, CY, r2);
        }
        if (u >= 4) {
            const q = smooth((u - 4) / 2);
            h.style('arad', C.cyanDeep, 0.3 * A, 0.5);
            F.radial(h, xf.set(CX, CY, rot(1, 1.5)), u > 6 ? 8 : 4, 8, 8 + 88 * q);
            const drawPoly = (n, R, t0, key, col, r) => {
                const w = smooth((u - t0) / 1.0);
                if (w <= 0) return;
                h.style(key, col, 0.55 * A, 0.6);
                const x = xf.set(CX, CY, r), pts = [];
                const steps = Math.max(2, Math.ceil(n * w * 8));
                for (let i = 0; i <= steps; i++) {
                    const s = (i / steps) * n * w, k = Math.floor(s), f = s - k;
                    const a0 = -Math.PI / 2 + k * TAU / n, a1 = -Math.PI / 2 + (k + 1) * TAU / n;
                    const px = lerp(R * Math.cos(a0), R * Math.cos(a1), f), py = lerp(R * Math.sin(a0), R * Math.sin(a1), f);
                    pts.push(x.x(px, py), x.y(px, py));
                }
                h.poly(pts, false);
            };
            drawPoly(3, 34, 4.5, 'atri', C.magenta, rot(-1, 3));
            drawPoly(4, 52, 5.5, 'asq', C.gold, 0);
            drawPoly(8, 70, 6.5, 'aoct', C.cyan, rot(1, 2));
            h.style('aring', C.cyanDeep, 0.35 * A * smooth((u - 6) / 2), 0.6);
            h.circle(CX, CY, 84);
            // the seed of life, faint, behind
            h.style('aseed', C.teal, 0.12 * A * smooth((u - 5) / 3), 0.5);
            F.seedOfLife(h, xf.set(CX, CY, rot(-1, 1)), 19);
        }
        if (u >= 8) {
            // eight symbols, one per beat, aligning for an instant at ~11.4 s
            const beat = 60 / BPM, syms = ['diamond', 'triangle', 'circle', 'square', 'hexagon', 'pentagon', 'spiral', 'diamond'];
            const align = Math.exp(-Math.pow((u - 11.4) / 0.9, 2));
            for (let i = 0; i < 8; i++) {
                const born = 8 + i * beat, w = smooth((u - born) / 0.45);
                if (w <= 0) continue;
                const off = (1 - align) * (rm ? 3 : 9) * Math.sin(u * 0.7 + i * 1.7);
                const ang = (-90 + i * 45 + off) * DEG + rot(1, 2);
                h.styleQ('anode', align > 0.6 ? C.goldPale : C.gold, (0.75 + 0.2 * align) * w * A, 0.8);
                this._glyph(h, syms[i], CX + 84 * Math.cos(ang), CY + 84 * Math.sin(ang), 6);
            }
        }
        this._base(S);
        g.globalCompositeOperation = 'lighter';
        h.flush(g, 1);

        // the table and INSERT COIN, in screen space
        const o = this.hud;
        o.begin();
        if (u >= 12 && u < 15.2) {
            const ta = smooth((u - 12.1) / 0.6) * (1 - smooth((u - 14.4) / 0.7));
            this._table(o, ta, null, 0);
        }
        o.style('coin', C.gold, rm ? 0.8 : 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(t * TAU / 3.4)), 0.8);
        this._text(o, 'INSERT COIN', CX, 214, 7, 'center');
        this._base(1);
        g.globalCompositeOperation = 'lighter';
        o.flush(g, 1);
        return { tau: 0.12, trail: 0.55, bloom: 1 };
    }
}
