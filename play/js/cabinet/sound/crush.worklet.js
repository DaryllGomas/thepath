// THE CABINET'S SOUND · the grit: a gentle rate + bit crush (an AudioWorklet; the chip loads it, js/cabinet/sound/chip.js).
// Rate: every sample is held for `hold` samples (48 kHz / 3 = a 16 kHz DAC). Bits: the level is rounded to 2^(bits-1)
// steps in a mu-law (companded) scale, as the old 8-bit telephone-style DACs did: the grit sits a fixed distance under the
// sound at ANY level (a plain linear crush turns quiet sounds into fizz). Both run before the chip's low-pass, which takes
// the fizz back off the top.
class ChipCrush extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 2, maxValue: 16, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 3, minValue: 1, maxValue: 32, automationRate: 'k-rate' },
      { name: 'mu', defaultValue: 255, minValue: 1, maxValue: 4096, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.n = 0; this.v = [0, 0]; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || inp.length === 0) { for (const ch of out) ch.fill(0); return true; }
    const hold = Math.max(1, Math.round(params.hold[0])), steps = Math.pow(2, params.bits[0] - 1), mu = params.mu[0], lmu = Math.log1p(mu);
    const len = out[0].length;
    let n = this.n;
    for (let i = 0; i < len; i++) {
      if (n <= 0) {
        for (let c = 0; c < out.length; c++) {
          const x = Math.max(-1, Math.min(1, (inp[c] || inp[0])[i])), a = Math.abs(x);
          const y = Math.round((Math.log1p(mu * a) / lmu) * steps) / steps;           // compress, round
          this.v[c] = Math.sign(x) * (Math.expm1(y * lmu) / mu);                      // expand
        }
        n = hold;
      }
      for (let c = 0; c < out.length; c++) out[c][i] = this.v[c];
      n--;
    }
    this.n = n;
    return true;
  }
}
registerProcessor('chip-crush', ChipCrush);
