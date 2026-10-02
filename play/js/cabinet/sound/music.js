// THE CABINET'S SOUND · note names and ratios (tiny helpers for the patches: data stays readable as music).
//
//   hz('D4') = 293.66     hz('F#3')     hz('Bb2')        semis(f, 7) = a fifth above f (equal temperament)
//   JI.fifth = 3/2 ...    the chords of the win cadences use pure ratios (the harmonic series: no beating, gentle)
//   PENTA = [0, 2, 4, 7, 9]   the major pentatonic, in semitones (the cabinet's scale)
const NAMES = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };

/** Note name -> Hz (A4 = 440). 'C#5', 'Eb3', 'A4'. */
export function hz(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('hz: bad note ' + name);
  const s = NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] - 4) * 12;
  return 440 * Math.pow(2, s / 12);
}
export const semis = (f, s) => f * Math.pow(2, s / 12);
export const cents = (ratio) => 1200 * Math.log2(ratio);
export const JI = Object.freeze({ unison: 1, third: 5 / 4, fourth: 4 / 3, fifth: 3 / 2, sixth: 5 / 3, octave: 2, tenth: 5 / 2, twelfth: 3 });
export const PENTA = Object.freeze([0, 2, 4, 7, 9]);
/** The pentatonic degree i (0, 1, 2 ... climbing through octaves) in semitones. */
export const penta = (i) => PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
/** The minor pentatonic (the Resonance's B minor, the relative of the cabinet's D). */
export const PENTA_MINOR = Object.freeze([0, 3, 5, 7, 10]);
export const pentaMinor = (i) => PENTA_MINOR[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
