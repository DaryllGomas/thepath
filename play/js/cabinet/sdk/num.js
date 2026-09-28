// THE NODE · CABINET ENGINE (JS) · the numeric rules that keep the port bit-exact with the C# SDK.
//
// C# does the sims in `float` (IEEE single). JS numbers are doubles, so every float operation in a
// ported sim is wrapped in f32() (Math.fround). A single + - * / done in double and then rounded to
// float gives exactly the float result (double has >= 2*24+2 bits), so f32(a * b) IS C#'s a * b.
// Rules for porters:
//   float field / literal       ->  f32(0.7)                (never a bare 0.7 for a C# 0.7f)
//   a += b * c   (floats)       ->  a = f32(a + f32(b * c))
//   (int)x                      ->  Math.trunc(x)           (toward zero, like C#)
//   int / int                   ->  idiv(a, b)              (C# integer division truncates)
//   Math.Round(x)               ->  roundEven(x)            (C# rounds half to EVEN, JS Math.round does not)
//   x.ToString("0.0")           ->  fmt(x, 1)  / float: fmt(x, 1, F32)
//   x.ToString("0.###")         ->  fmtOpt(x, 3) / float: fmtOpt(x, 3, F32)
//   n.ToString("D6")            ->  d6(n)
// No DOM and no Node APIs in here: it runs in both.

export const f32 = Math.fround;

export function idiv(a, b) { return Math.trunc(a / b); }

// C# Math.Round(double): MidpointRounding.ToEven
export function roundEven(x) {
    const fl = Math.floor(x);
    const d = x - fl;
    if (d === 0.5) return fl % 2 === 0 ? fl : fl + 1;
    return Math.round(x);
}

// .NET formats a custom pattern from the value rounded to this many significant digits first
export const F64 = 15;      // double: DoublePrecisionCustomFormat
export const F32 = 7;       // float:  SinglePrecisionCustomFormat

// value -> { neg, digits: "ddd", exp } with `sig` significant digits (value = 0.digits * 10^(exp+1))
function sigDigits(v, sig) {
    const neg = v < 0 || Object.is(v, -0);
    const s = Math.abs(v).toExponential(sig - 1);          // "d.ddde+x"
    const e = s.indexOf('e');
    const digits = s.slice(0, e).replace('.', '');
    const exp = parseInt(s.slice(e + 1), 10);
    return { neg, digits, exp };
}

// round a decimal digit string to `keep` digits, half away from zero; returns { digits, exp }
function roundDigits(digits, exp, keep) {
    if (keep >= digits.length) return { digits, exp };
    if (keep < 0) return { digits: '0', exp: 0, zero: true };
    const up = digits.charCodeAt(keep) >= 53;               // '5'
    let d = digits.slice(0, keep).split('').map(Number);
    if (up) {
        let i = d.length - 1;
        while (i >= 0) { if (d[i] < 9) { d[i]++; break; } d[i] = 0; i--; }
        if (i < 0) { d.unshift(1); exp++; }
    }
    if (d.length === 0) return { digits: '0', exp: 0, zero: true };
    return { digits: d.join(''), exp };
}

// x.ToString("0.000...") with `dec` decimals (dec 0 = "0"); trim = the "0.###" form
export function fmtCustom(v, dec, sig = F64, trim = false) {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
    if (v === 0) return dec > 0 && !trim ? '0.' + '0'.repeat(dec) : '0';
    let { neg, digits, exp } = sigDigits(v, sig);
    // keep the digits down to 10^-dec: exp+1 integer digits + dec decimals
    const r = roundDigits(digits, exp, exp + 1 + dec);
    let intPart, frac;
    if (r.zero) { intPart = '0'; frac = ''; }
    else {
        const ds = r.digits, e = r.exp;
        if (e >= 0) {
            const whole = ds.length > e + 1 ? ds.slice(0, e + 1) : ds + '0'.repeat(e + 1 - ds.length);
            intPart = whole;
            frac = ds.length > e + 1 ? ds.slice(e + 1) : '';
        } else {
            intPart = '0';
            frac = '0'.repeat(-e - 1) + ds;
        }
    }
    frac = (frac + '0'.repeat(dec)).slice(0, dec);
    if (trim) frac = frac.replace(/0+$/, '');
    const body = frac.length > 0 ? intPart + '.' + frac : intPart;
    const isZero = /^[0.]*$/.test(body);
    return (neg && !isZero ? '-' : '') + body;
}

export function fmt(v, dec, sig = F64) { return fmtCustom(v, dec, sig, false); }
export function fmtOpt(v, dec, sig = F64) { return fmtCustom(v, dec, sig, true); }

// n.ToString("D6")
export function d6(n) { return dn(n, 6); }
export function dn(n, width) {
    n = Math.trunc(n);
    const s = String(Math.abs(n)).padStart(width, '0');
    return n < 0 ? '-' + s : s;
}

// C#'s unchecked int arithmetic
export function i32(x) { return x | 0; }
export function imulAdd(a, b, c) { return (Math.imul(a, b) + c) | 0; }

// culture-ish string order (the C# Lab sorts stat names with the invariant culture)
const collator = typeof Intl !== 'undefined' ? new Intl.Collator('en') : null;
export function cultureCompare(a, b) { return collator ? collator.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }
