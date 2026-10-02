// THE CABINET'S SOUND · measuring a rendered sound (browser or node; no DOM): the numbers behind the hearing-safety rules.
//   analyse(samples, sampleRate) -> {
//     peak      dBFS, the highest sample                      (rule: <= -3)
//     rms       dBFS over the active part (from the first to the last sample above -60 dBFS)
//     lufsM     the loudest 400 ms (momentary loudness, ITU-R BS.1770 K-weighting), LUFS
//     lufsI     integrated loudness (gated), LUFS; null if under 0.4 s
//     hf        the share of the energy above 4 kHz, whole sound (0..1)      hfMax  the most in any loud 400 ms window
//     dur       seconds of the active part                    series (option) per 100 ms: [peak dBFS, momentary LUFS]
//   }
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x === -Infinity ? -999 : null);

function kWeight(x, fs) {
  // BS.1770 stage 1 (the head's high shelf) and stage 2 (the RLB high-pass), for any sample rate
  let K = Math.tan(Math.PI * 1681.974450955533 / fs), Q = 0.7071752369554196;
  const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };   // (the RLB high-pass: 1, -2, 1)
  const y = new Float32Array(x.length);
  const run = (inp, out, c) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < inp.length; i++) { const v = inp[i]; const o = c.b0 * v + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; out[i] = o; } };
  const t = new Float32Array(x.length);
  run(x, t, s1); run(t, y, s2);
  return y;
}

function fftPower(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** Share of energy above `hz` in x[from .. from + N) (Hann window, N a power of two). */
function hfShare(x, from, N, fs, hz = 4000) {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); re[i] = (x[from + i] || 0) * w; }
  fftPower(re, im);
  const cut = Math.round(hz / fs * N);
  let hi = 0, all = 0;
  for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; all += p; if (k >= cut) hi += p; }
  return all > 0 ? hi / all : 0;
}

export function analyse(x, fs, o = {}) {
  let peak = 0, first = -1, last = -1;
  const th = Math.pow(10, -60 / 20);
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a > th) { if (first < 0) first = i; last = i; } }
  if (first < 0) return { peak: -999, rms: -999, lufsM: -999, lufsI: null, hf: 0, hfMax: 0, dur: 0 };
  let ss = 0; for (let i = first; i <= last; i++) ss += x[i] * x[i];
  const rms = Math.sqrt(ss / (last - first + 1));
  // loudness
  const y = kWeight(x, fs), W = Math.round(0.4 * fs), H = Math.round(0.1 * fs);
  const blocks = [];
  if (x.length < W) { let s = 0; for (let i = 0; i < y.length; i++) s += y[i] * y[i]; blocks.push(s / W); }
  else for (let i = 0; i + W <= y.length; i += H) { let s = 0; for (let j = i; j < i + W; j++) s += y[j] * y[j]; blocks.push(s / W); }
  const L = (ms) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-12));
  let mMax = -Infinity; for (const b of blocks) mMax = Math.max(mMax, L(b));
  let lufsI = null;
  if (x.length >= W) {
    const g1 = blocks.filter((b) => L(b) > -70);
    if (g1.length) {
      const m1 = g1.reduce((a, b) => a + b, 0) / g1.length, rel = L(m1) - 10;
      const g2 = g1.filter((b) => L(b) > rel);
      lufsI = L(g2.reduce((a, b) => a + b, 0) / g2.length);
    }
  }
  // the top end: whole sound, and the worst loud 400 ms window
  const N = 4096;
  let hfW = 0, hfA = 0, hfMax = 0, hfAt = 0;
  for (let i = Math.max(0, first - N / 2); i < last; i += N) {
    let e = 0; for (let j = i; j < Math.min(x.length, i + N); j++) e += x[j] * x[j];
    const h = hfShare(x, i, N, fs);
    hfW += h * e; hfA += e;
    if (L(e / N) > -45 && h > hfMax) { hfMax = h; hfAt = i / fs; }
  }
  const out = { peak: r1(db(peak)), rms: r1(db(rms)), lufsM: r1(mMax), lufsI: lufsI === null ? null : r1(lufsI), hf: +(hfA > 0 ? hfW / hfA : 0).toFixed(4),
    hfMax: +hfMax.toFixed(4), hfAt: +hfAt.toFixed(2), dur: +((last - first) / fs).toFixed(3) };
  if (o.series) {
    const S = [], step = Math.round(0.1 * fs);
    for (let i = 0; i < x.length; i += step) {
      let p = 0; for (let j = i; j < Math.min(x.length, i + step); j++) p = Math.max(p, Math.abs(x[j]));
      const b = blocks[Math.min(blocks.length - 1, Math.max(0, Math.round(i / H) - 3))];
      S.push([r1(db(p)), r1(L(b ?? 0))]);
    }
    out.series = S;
  }
  return out;
}
