// THE NODE · the cabinet with no name · THE 320x240 PIXEL PICTURE (the Lab, the SDK checks, and any host that only
// knows the SDK's CabinetRunner). The showpiece is renderer.js; this draws the SAME scene through the same drawing
// code: a SurfacePen stands in for the canvas pen and rasterises every stroke onto the PixelSurface with the
// palette's colours (an alpha picks the bright or the dim entry; nothing is blended), inside the 8 px safe area.
import { PixelSurface } from '../../sdk/index.js';
import { gateMarkShapes } from '../../../marks.js';
import { NamelessPalette } from './spec.js';
import { NamelessRenderer, COLORS as C, GATE_R } from './renderer.js';
import { Phase, DUR, CX, CY } from './round.js';
import { NamelessScores } from './scores.js';
import { Xf } from './school.js';

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;

// canvas colour + alpha -> a palette entry (or null: too faint to draw)
function pick(pal, color, alpha) {
    if (alpha < 0.08) return null;
    const hi = alpha >= 0.5;
    switch (color) {
        case C.cyan: case C.probe: return pal.get(hi ? 'cyan' : 'cyanDim');
        case C.cyanDeep: return pal.get(alpha >= 0.3 ? 'cyanDim' : 'lattice');
        case C.teal: return pal.get(alpha >= 0.3 ? 'latticeHi' : 'lattice');
        case C.gold: case C.goldPale: case C.goldHot: return pal.get(alpha >= 0.35 ? 'gold' : 'goldDim');
        case C.magenta: case C.violet: return pal.get(hi ? 'magenta' : 'magentaDim');
        case C.white: return pal.get(alpha >= 0.3 ? 'white' : 'cyanDim');
        case C.green: return pal.get(alpha >= 0.3 ? 'green' : 'latticeHi');
        case C.amber: return pal.get('amber');
        case C.gate: return pal.get('gate');
        case C.black: return pal.get('bg');
        default: return pal.get(hi ? 'cyan' : 'cyanDim');
    }
}

class SurfacePen {
    constructor(s, pal) { this.s = s; this.pal = pal; this.c = null; this.fill = false; this.k = 1; }
    begin() { }
    scale(k) { this.k = k; return this; }
    _x(x) { return Math.round(CX + (x - CX) * this.k); }
    _y(y) { return Math.round(CY + (y - CY) * this.k); }
    style(key, color, alpha, width, fill = false) { this.c = pick(this.pal, color, alpha); this.fill = fill; return this; }
    styleQ(key, color, alpha, width, fill = false) { return this.style(key, color, alpha, width, fill); }
    line(x0, y0, x1, y1) { if (this.c) this.s.line(this._x(x0), this._y(y0), this._x(x1), this._y(y1), this.c); }
    poly(pts) { if (!this.c) return; for (let i = 2; i < pts.length; i += 2) this.line(pts[i - 2], pts[i - 1], pts[i], pts[i + 1]); }
    circle(x, y, r) { if (this.c && r > 0) this.s.circle(this._x(x), this._y(y), Math.max(0, Math.round(r * this.k)), this.c, this.fill); }
    arc(x, y, r, a0, a1) {
        if (!this.c) return;
        const n = Math.max(3, Math.ceil(Math.abs(a1 - a0) * r * this.k / 3));
        let px = x + r * Math.cos(a0), py = y + r * Math.sin(a0);
        for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, qx = x + r * Math.cos(a), qy = y + r * Math.sin(a); this.line(px, py, qx, qy); px = qx; py = qy; }
    }
    flush() { }
}

export class NamelessSurfaceRenderer {
    constructor(opts = {}) {
        // the canvas renderer's drawing methods, without its canvas
        this.r = Object.create(NamelessRenderer.prototype);
        this.r.reducedMotion = !!opts.reducedMotion;
        this.r.table = opts.table || NamelessScores.for(opts.cabinetId || 'nameless');
        this.r.xf = new Xf();
        this.r._echoOn = 0; this.r.echoGain = 0;
        this.pal = NamelessPalette;
    }

    draw(sim, s, t) {
        const pal = this.pal;
        s.noClip();
        s.clear(pal.get('bg'));
        if (!sim || !sim.level) return;
        s.clip(PixelSurface.SafeMargin, PixelSurface.SafeMargin, s.width - 2 * PixelSurface.SafeMargin, s.height - 2 * PixelSurface.SafeMargin);
        const P = Phase, p = sim.p, pt = sim.phaseTime, r = this.r, pen = new SurfacePen(s, pal);
        const ending = sim.ending || (p === P.Over && sim.won);
        let S = 1, alpha = 1, field = true;
        if (p === P.Ready) alpha = smooth(pt / ((sim.levelIndex === 0 ? DUR.firstReady : DUR.ready) * 0.55));
        else if (p === P.Descend) { const u = pt / DUR.descend; S = 1 + 2.6 * u * u; alpha = 1 - smooth(u * 1.35); }
        else if (p === P.Dying) alpha = 1 - 0.72 * smooth(pt / DUR.dying);
        else if ((p === P.Card || p === P.Over) && !ending) alpha = 0.16;
        else if (ending && p === P.Vesica) S = 1 - 0.985 * smooth((pt - 0.8) / (DUR.vesica - 0.8));
        else if (ending && p > P.Vesica) field = false;
        if (field && alpha > 0.05) {
            pen.scale(S);
            r._school(pen, sim, alpha * 0.9);
            r._play(pen, sim, alpha);
            pen.scale(1);
        }
        const look = { tau: 0.08 };
        if (p !== P.Descend && (!ending || p <= P.Still)) r._hud(pen, sim, p === P.Dying ? alpha : (p === P.Card || p === P.Over) ? 0.4 : 1);
        if (p === P.Ready) r._numeral(pen, sim, pt);
        if (ending) {
            r._ending(pen, sim, look);
            if (p >= P.Gate) this._gate(pen, sim);
            if (p === P.Over) r._table(pen, 1, sim, 99);
        } else if (p === P.Card || p === P.Over) r._lostCard(pen, sim, p === P.Over ? 9 : pt);
        s.noClip();
    }

    // THE GATE as outlines (the pixel tube has no fill): drawn in, then risen above the table
    _gate(pen, sim) {
        const P = Phase, p = sim.p, pt = sim.phaseTime;
        let progress = 1, R = GATE_R, cy = CY + 0.14 * GATE_R;
        if (p === P.Gate) progress = pt / DUR.gate;
        else if (p >= P.Table) { const u = p === P.Table ? smooth(pt / 0.7) : 1; R = lerp(GATE_R, 26, u); cy = lerp(CY + 0.14 * GATE_R, 50, u); }
        pen.style('gate', C.gate, 1, 1);
        for (const sh of gateMarkShapes(6)) {
            const u = Math.max(0, Math.min(1, (progress - sh.t0) / (sh.t1 - sh.t0)));
            if (u <= 0) continue;
            const n = Math.max(2, Math.round(sh.pts.length * u));
            const pts = [];
            for (let i = 0; i < n; i++) pts.push(CX + sh.pts[i][0] * R, cy + sh.pts[i][1] * R);
            pen.poly(pts);
        }
    }
}
