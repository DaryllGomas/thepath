// THE NODE · CABINET ENGINE (JS) · SystemRandom: an EXACT port of .NET's seeded System.Random.
//
// The C# SDK rolls every die with `new System.Random(seed)`, which in .NET (and Mono) is Knuth's
// subtractive generator (the "Net5CompatSeedImpl"). This class reproduces it value for value, so
// a JS round with seed S plays exactly the round the C# CabinetLab plays with seed S (same bench
// numbers, same frames, same invented high-score initials).
//
//   new SystemRandom(seed)   seeded, deterministic (seed is an int32; int.MinValue handled as .NET does)
//   new SystemRandom()       unseeded (time/Math.random based), like `new System.Random()`
//   next()                   int in [0, 2^31-1)
//   next(max)                int in [0, max)
//   next(min, max)           int in [min, max)
//   nextDouble()             double in [0, 1)
const MBIG = 2147483647, MSEED = 161803398;

export class SystemRandom {
    constructor(seed) {
        if (seed === undefined || seed === null)
            seed = ((Date.now() ^ Math.floor(Math.random() * 0x7FFFFFFF)) & 0x7FFFFFFF) | 0;
        seed |= 0;
        const sa = new Int32Array(56);
        const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed);
        // C# int arithmetic WRAPS (unchecked) and the sign tests see the wrapped value: `| 0` everywhere
        let mj = (MSEED - subtraction) | 0;
        sa[55] = mj;
        let mk = 1, ii = 0;
        for (let i = 1; i < 55; i++) {
            if ((ii += 21) >= 55) ii -= 55;
            sa[ii] = mk;
            mk = (mj - mk) | 0;
            if (mk < 0) mk = (mk + MBIG) | 0;
            mj = sa[ii];
        }
        for (let k = 1; k < 5; k++) {
            for (let i = 1; i < 56; i++) {
                let n = i + 30;
                if (n >= 55) n -= 55;
                let v = (sa[i] - sa[1 + n]) | 0;
                if (v < 0) v = (v + MBIG) | 0;
                sa[i] = v;
            }
        }
        this._sa = sa;
        this._inext = 0;
        this._inextp = 21;
    }

    _internalSample() {
        let a = this._inext, b = this._inextp;
        if (++a >= 56) a = 1;
        if (++b >= 56) b = 1;
        const sa = this._sa;
        let r = (sa[a] - sa[b]) | 0;
        if (r === MBIG) r--;
        if (r < 0) r = (r + MBIG) | 0;
        sa[a] = r;
        this._inext = a; this._inextp = b;
        return r;
    }

    _sample() { return this._internalSample() * (1.0 / MBIG); }

    _largeSample() {
        let result = this._internalSample();
        const negative = this._internalSample() % 2 === 0;       // (.NET's own quirk, kept)
        if (negative) result = -result;
        let d = result;
        d += (MBIG - 1);
        d /= 2 * MBIG - 1;
        return d;
    }

    next(a, b) {
        if (a === undefined) return this._internalSample();
        if (b === undefined) {
            if (a < 0) throw new RangeError('maxValue must be >= 0');
            return Math.trunc(this._sample() * a);
        }
        if (a > b) throw new RangeError('minValue must be <= maxValue');
        const range = b - a;
        if (range <= MBIG) return Math.trunc(this._sample() * range) + a;
        return Math.trunc(this._largeSample() * range) + a;
    }

    nextDouble() { return this._sample(); }
}
