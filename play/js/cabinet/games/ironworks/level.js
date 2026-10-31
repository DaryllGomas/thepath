// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · THE STRUCTURE:
// girders, ladders, joins, belts, lifts and bolts. The five boards' data is in boards.js; a Board is
// built from it fresh for every board a sim plays (it carries that sim's belts, cages and bolts, so two
// sims never share live state).
//
// 320 x 240, y down. A GIRDER is a straight run, sloped or flat, drawn the way the 1981 boards drew it:
// in 8 px tiles, each tile sat at one whole-pixel height, so a walker steps up or down a pixel at every
// tile edge. surface(x) is that stepped top edge (feet level). A girder can also be:
//   a BELT    (belt >= 0)  a conveyor: it carries the climber and drives the ore carts
//   a CAGE    (lift >= 0)  a lift platform: its surface is wherever the cage is (liftY)
//   a storey  (row)        which floor it belongs to (the HIGHEST stat; the bot's sense of up)
// JOINS: two girders edge to edge on the same storey (a gap of 0..16 px). A join is WALKABLE when the gap
// is shut (<= 2 px) and the two edges line up (a cage only at its stop); any lined-up join can be HOPPED.
// A BOLT (rivet) sits in a join's gap: walking into it pulls it (the gap opens for good); a fire-ball
// can cross a bolted join, never an open one.
// LADDERS join girder `lo` to girder `hi`. A BROKEN ladder has its middle rungs missing: the climber
// cannot use it, but a drum can still drop down one.
// Floats are C# floats (f32), as in the rest of the machine.
import { f32, roundEven } from '../../sdk/index.js';

const FloatMax = f32(3.4028234663852886e38);   // C# float.MaxValue

export class Girder {
    constructor(index, x0, x1, yLeft, yRight, o = {}) {
        this.index = index;
        this.x0 = f32(x0); this.x1 = f32(x1); this.yLeft = f32(yLeft); this.yRight = f32(yRight);   // span [x0, x1) and the slope's ends
        this.row = o.row !== undefined ? o.row : index;
        this.roll = o.roll || 0;                // a flat girder's roll direction for drums (0: the slope decides)
        this.belt = o.belt !== undefined ? o.belt : -1;
        this.lift = o.lift !== undefined ? o.lift : -1;
        this.liftY = f32(yLeft);                // a cage's live height (the sim moves it)
        this.leftJ = []; this.rightJ = [];      // joins: { g, gap, bolt } (bolt = index into board.bolts, or -1)
    }

    get isCage() { return this.lift >= 0; }

    // the way a drum rolls on it: +1 right, -1 left, 0 flat
    get downhill() { return this.roll !== 0 ? this.roll : this.yRight > this.yLeft ? 1 : this.yRight < this.yLeft ? -1 : 0; }

    // the stepped top edge under x (feet level). Off the span it keeps the end tile's slope.
    surface(x) {
        if (this.lift >= 0) return this.liftY;
        if (this.yLeft === this.yRight) return roundEven(this.yLeft);
        const T = Girder.Tile;
        const cx = f32(f32(Math.floor(f32(f32(x) / T)) * T) + f32(T * 0.5));
        const y = f32(this.yLeft + f32(f32(f32(this.yRight - this.yLeft) * f32(cx - this.x0)) / f32(this.x1 - this.x0)));
        return roundEven(y);
    }

    contains(x) { return x >= this.x0 && x < this.x1; }
    clamp(x, margin) { return Math.max(f32(this.x0 + margin), Math.min(f32(this.x1 - margin), f32(x))); }
}
Girder.Tile = 8;

export class Ladder {
    constructor(index, x, lo, hi, broken) {
        this.index = index; this.x = f32(x);
        this.lo = lo; this.hi = hi;             // joins girder lo (its foot) to girder hi (its top)
        this.broken = !!broken;
        this.yBottom = 0; this.yTop = 0;        // feet level at the bottom (on lo) and the top (on hi)
    }

    get length() { return f32(this.yBottom - this.yTop); }
}
Ladder.StubLength = f32(8);                     // what is left of a broken ladder at each end

export class HammerSpot {
    constructor(girder, x) { this.girder = girder; this.x = f32(x); }
}

export class Pickup {
    constructor(girder, x, kind) { this.girder = girder; this.x = f32(x); this.kind = kind; }
}
Pickup.Names = ['HARD HAT', 'LUNCH PAIL', 'TOOLBOX'];
Pickup.Points = [300, 500, 800];

export class Bolt {
    constructor(index, gl, gr, x) { this.index = index; this.gl = gl; this.gr = gr; this.x = f32(x); this.pulled = false; this.pullT = 0; }
}

// a conveyor: dir +1 / -1; flips every `flip` s (0 = never) from `at` s into the life
export class Belt {
    constructor(def) {
        this.dir0 = def.dir; this.flip = f32(def.flip || 0); this.at = f32(def.at || 0);
        this.dir = def.dir; this.next = 0; this.warn = false; this.flipT = f32(99);
        this.pos = 0;                           // how far the belt has run (the renderer's treads)
        this.reset();
    }
    reset() { this.dir = this.dir0; this.next = this.flip > 0 ? this.at : f32(1e9); this.warn = false; this.flipT = f32(99); }
}

// a lift cage: ping-pongs between its low stop and its high stop, pausing at each
export class Lift {
    constructor(def) {
        this.g = def.g; this.low = f32(def.low); this.high = f32(def.high); this.at = f32(def.at || 0);
        this.y = this.low; this.moving = 0;     // -1 rising, +1 sinking, 0 paused
        this.stopLeft = 0;                      // s left of the current pause (0 while moving)
    }
    get travel() { return f32(this.low - this.high); }
}

const Tol = f32(3);                             // how close two edges must line up to walk across

export class Board {
    constructor(def) {
        this.def = def;
        this.n = def.n; this.name = def.name; this.hint = def.hint; this.kind = def.kind;
        this.G = def.girders.map((a, i) => new Girder(i, a[0], a[1], a[2], a[3], a[4] || {}));
        this.goal = def.goal;                   // reaching this girder clears the board (-1: the bolts do)
        this.ladders = def.ladders.map((a, i) => {
            const l = new Ladder(i, a[0], a[1], a[2], a[3]);
            l.yBottom = this.G[l.lo].surface(l.x);
            l.yTop = this.G[l.hi].surface(l.x);
            return l;
        });
        this.hammers = (def.hammers || []).map(a => new HammerSpot(a[0], a[1]));
        this.pickups = (def.pickups || []).map(a => new Pickup(a[0], a[1], a[2]));
        this.bolts = (def.bolts || []).map((a, i) => new Bolt(i, a[0], a[1], a[2]));
        this.belts = (def.belts || []).map(b => new Belt(b));
        this.lifts = (def.lifts || []).map(b => new Lift(b));
        this.oil = def.oil || null;
        this.foreman = def.foreman;
        this.banner = def.banner || null;
        this.springs = def.springs || null;
        this.patrols = def.patrols || [];
        this.start = def.start;
        this.tune = def.tune;
        this.rows = 0;
        for (const g of this.G) this.rows = Math.max(this.rows, g.row);
        for (const L of this.lifts) this.G[L.g].liftY = L.low;
        this._buildJoins();
    }

    get boltsLeft() { let n = 0; for (const b of this.bolts) if (!b.pulled) n++; return n; }

    // edge to edge on the same storey: a cage can meet a ledge at either stop
    _buildJoins() {
        const span = g => g.isCage ? [this.lifts[g.lift].high, this.lifts[g.lift].low] : null;
        for (const a of this.G)
            for (const b of this.G) {
                if (a === b || a.index === this.goal || b.index === this.goal) continue;
                const gap = f32(b.x0 - a.x1);
                if (gap < 0 || gap > 16) continue;
                const ra = span(a) || [a.surface(f32(a.x1 - 1)), a.surface(f32(a.x1 - 1))];
                const rb = span(b) || [b.surface(b.x0), b.surface(b.x0)];
                if (ra[0] > f32(rb[1] + Tol) || rb[0] > f32(ra[1] + Tol)) continue;
                let bolt = -1;
                for (const t of this.bolts) if (t.gl === a.index && t.gr === b.index) bolt = t.index;
                a.rightJ.push({ g: b.index, gap, bolt });
                b.leftJ.push({ g: a.index, gap, bolt });
            }
    }

    _lined(a, side, b) {
        const ya = a.surface(side > 0 ? f32(a.x1 - 1) : a.x0), yb = b.surface(side > 0 ? b.x0 : f32(b.x1 - 1));
        return Math.abs(f32(ya - yb));
    }

    // the girder a climber walks onto past girder g's edge (side +1 right / -1 left), or -1
    walkJoin(g, side) {
        const a = this.G[g];
        for (const j of side > 0 ? a.rightJ : a.leftJ)
            if (j.gap <= 2 && j.bolt < 0 && this._lined(a, side, this.G[j.g]) <= Tol) return j.g;
        return -1;
    }

    // the girder a hop can carry the climber onto (any lined-up join), or -1
    hopJoin(g, side) {
        const a = this.G[g];
        for (const j of side > 0 ? a.rightJ : a.leftJ)
            if (this._lined(a, side, this.G[j.g]) <= f32(6)) return j.g;
        return -1;
    }

    // a fire-ball walks across a shut join or a bolted one (never onto a cage)
    fireJoin(g, side) {
        const a = this.G[g];
        if (a.isCage) return -1;
        for (const j of side > 0 ? a.rightJ : a.leftJ) {
            const b = this.G[j.g];
            if (b.isCage) continue;
            if ((j.gap <= 2 && j.bolt < 0) || (j.bolt >= 0 && !this.bolts[j.bolt].pulled)) return j.g;
        }
        return -1;
    }

    // the bolt in the join on that side of g that is still in, or null
    boltAt(g, side) {
        for (const j of side > 0 ? this.G[g].rightJ : this.G[g].leftJ)
            if (j.bolt >= 0 && !this.bolts[j.bolt].pulled) return this.bolts[j.bolt];
        return null;
    }

    // how close a climber may stand to that end: right up to it where something joins, else 5 px
    margin(g, side) { return (side > 0 ? this.G[g].rightJ : this.G[g].leftJ).length > 0 ? f32(3) : f32(5); }

    // a whole ladder going UP from girder g that a climber standing at x can take (within `grab` px)
    upLadderAt(g, x, grab) {
        for (const l of this.ladders) if (!l.broken && l.lo === g && Math.abs(f32(l.x - x)) <= grab) return l;
        return null;
    }

    // a whole ladder going DOWN from girder g (its top is on g)
    downLadderAt(g, x, grab) {
        for (const l of this.ladders) if (!l.broken && l.hi === g && Math.abs(f32(l.x - x)) <= grab) return l;
        return null;
    }

    // the nearest whole ladder up from girder g
    nearestUp(g, x) {
        let best = null, bd = FloatMax;
        for (const l of this.ladders)
            if (!l.broken && l.lo === g && Math.abs(f32(l.x - x)) < bd) { bd = Math.abs(f32(l.x - x)); best = l; }
        return best;
    }

    // a falling thing at x crossed from y0 down to y1: the girder it lands on (not `from`, never a cage), or -1
    landing(x, y0, y1, from) {
        const xx = Math.max(f32(8.5), Math.min(f32(311.5), f32(x)));
        let best = -1, by = FloatMax;
        for (const g of this.G) {
            if (g.index === from || g.isCage || g.index === this.goal || !g.contains(xx)) continue;
            const s = g.surface(xx);
            if (s > y0 && s <= y1 && s < by) { by = s; best = g.index; }
        }
        return best;
    }

    // the oil drum's (or the furnace's) top edge
    get oilTop() {
        const o = this.oil;
        return f32(this.G[o.g].surface(f32(o.x + f32(o.w * 0.5))) - o.h);
    }
}
