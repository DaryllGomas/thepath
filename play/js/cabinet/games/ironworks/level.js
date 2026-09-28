// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · THE STRUCTURE:
// girders + ladders. Port of IronworksLevel.cs (Staging/Batch3/ironworks).
//
// One screen, 320 x 240, y down. Six sloped red girders (0 = the bottom, 5 = the foreman's) and
// the top platform (index 6) where the banner hangs. Each girder is a straight slope drawn the way
// the 1981 boards drew it: in 8 px tiles, each tile sat at one whole-pixel height, so a walker
// steps up or down a pixel at every tile edge. surface(x) is that stepped top edge (feet level).
//
//   girder   x0..x1     y@x0 -> y@x1   drums roll
//   0        8..312     222 -> 217     left, into the oil drum
//   1        8..280     186 -> 192     right, drop off the right end
//   2        40..312    163 -> 157     left
//   3        8..280     128 -> 134     right
//   4        40..312    105 -> 99      left
//   5        8..280     70  -> 76      right (the foreman throws from its left end)
//   6 (top)  120..216   46             the top platform: reach it and the round is won
//
// Ladders join girder `lower` to `lower + 1`. A BROKEN ladder has its middle rungs missing: the
// climber cannot use it, but a drum can still drop down one.
// Floats are C# floats: f32() everywhere, so the stepped slope matches the C# Lab pixel for pixel.
import { f32, roundEven } from '../../sdk/index.js';

const FloatMax = f32(3.4028234663852886e38);   // C# float.MaxValue

export class Girder {
    constructor(index, x0, x1, yLeft, yRight) {
        this.index = index;
        this.x0 = f32(x0); this.x1 = f32(x1); this.yLeft = f32(yLeft); this.yRight = f32(yRight);   // span [x0, x1) and the slope's ends
    }

    // the way a drum rolls on it: +1 right, -1 left, 0 flat
    get downhill() { return this.yRight > this.yLeft ? 1 : this.yRight < this.yLeft ? -1 : 0; }

    // the stepped top edge under x (feet level). Off the span it keeps the end tile's slope.
    surface(x) {
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
    constructor(index, x, lower, broken) {
        this.index = index; this.x = f32(x);
        this.lower = lower;                     // joins girder lower to lower + 1
        this.broken = broken;
        this.yBottom = 0; this.yTop = 0;        // feet level at the bottom (on lower) and the top (on lower + 1)
    }

    get length() { return f32(this.yBottom - this.yTop); }
}
Ladder.StubLength = f32(8);                     // what is left of a broken ladder at each end

export class HammerSpot {
    constructor(girder, x) { this.girder = girder; this.x = f32(x); }
}

const G = [
    new Girder(0, 8, 312, 222, 217),
    new Girder(1, 8, 280, 186, 192),
    new Girder(2, 40, 312, 163, 157),
    new Girder(3, 8, 280, 128, 134),
    new Girder(4, 40, 312, 105, 99),
    new Girder(5, 8, 280, 70, 76),
    new Girder(6, 120, 216, 46, 46),
];

function buildLadders() {
    const spec = [
        [252, 0, false], [132, 0, true],
        [52, 1, false], [148, 1, true],
        [156, 2, false], [260, 2, false], [92, 2, true],
        [60, 3, false], [196, 3, true],
        [252, 4, false], [116, 4, true],
        [204, 5, false],
    ];
    const list = [];
    for (let i = 0; i < spec.length; i++) {
        const l = new Ladder(i, spec[i][0], spec[i][1], spec[i][2]);
        l.yBottom = G[l.lower].surface(l.x);
        l.yTop = G[l.lower + 1].surface(l.x);
        list.push(l);
    }
    return list;
}

const Ladders = buildLadders();
const Hammers = [new HammerSpot(1, 108), new HammerSpot(4, 180)];

export const IronworksLevel = {
    Girders: 6,                                 // 0..5 sloped; 6 = the top platform
    TopIndex: 6,

    // the playfield's fixed furniture
    StartX: f32(72),                            // the climber starts on girder 0, facing right
    OilX: f32(24),                              // the oil drum: 16 px wide, standing on girder 0
    OilW: f32(16), OilH: f32(18),
    OilIntake: f32(46),                         // a drum rolling left on girder 0 is swallowed at this x
    DropX: f32(32),                             // the first drum of a life falls straight down this column
    ThrowX: f32(52),                            // where the foreman sets a drum rolling on girder 5
    ForemanX: f32(20),                          // his sprite's left edge (24 px wide); the drum stack is left of him
    StackX: f32(8),
    BannerX: f32(124), BannerW: f32(72),        // the banner hangs over the top platform's left part

    G,
    Ladders,
    Hammers,

    // a whole ladder going UP from girder g that a climber standing at x can take (within `grab` px)
    upLadderAt(g, x, grab) {
        for (const l of Ladders) if (!l.broken && l.lower === g && Math.abs(f32(l.x - x)) <= grab) return l;
        return null;
    },

    // a whole ladder going DOWN from girder g (its top is on g)
    downLadderAt(g, x, grab) {
        for (const l of Ladders) if (!l.broken && l.lower + 1 === g && Math.abs(f32(l.x - x)) <= grab) return l;
        return null;
    },

    // the climber's route: the nearest whole ladder up from girder g
    nearestUp(g, x) {
        let best = null, bd = FloatMax;
        for (const l of Ladders)
            if (!l.broken && l.lower === g && Math.abs(f32(l.x - x)) < bd) { bd = Math.abs(f32(l.x - x)); best = l; }
        return best;
    },

    get oilTop() { return f32(G[0].surface(f32(IronworksLevel.OilX + f32(IronworksLevel.OilW * 0.5))) - IronworksLevel.OilH); },
};
