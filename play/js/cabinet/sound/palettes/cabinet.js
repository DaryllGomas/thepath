// THE CABINET'S SOUND · THE CABINET ITSELF: the machine's own voice, shared by all seven games (the family resemblance),
// plus its start screen (the flower of light) and THE REDRAW between games.
//
// THE CABINET VOICE (what makes seven games one machine):
//   - one scale: every game sits in D major / B minor (the cabinet's key), each on its own root: Hearth D, the Constellation
//     A, the Beacon E, the Labyrinth G, the Resonance B, the Ascent F#, the Tunnel D again (home);
//   - one READY call: root, fifth, octave on a quarter-pulse over a triangle root (every game's start, in its own key);
//   - one way to lose: a soft thump and the root stepping down a minor third, then an octave; one INSERT COIN call (always
//     in the machine's home key, D);
//   - one light that saves you: the mercy ward is the same bell in all seven games, at the same pitch (333 Hz);
//   - the same chain everywhere (js/cabinet/sound/chip.js): pulse / triangle / LFSR noise, the same low-pass, the same grit.
import { hz, semis, JI, penta } from '../music.js';

export const ROOTS = Object.freeze({
  hearth: hz('D4'), constellation: hz('A4'), beacon: hz('E4'), labyrinth: hz('G4'), resonance: hz('B3'), ascent: hz('F#4'), tunnel: hz('D4'),
});
/** Each game's root as semitones from the machine's D (kept within -5..+6: the redraw's settling chord moves by these). */
export const ROOT_SEMIS = Object.freeze({ hearth: 0, constellation: -5, beacon: 2, labyrinth: 5, resonance: -3, ascent: 4, tunnel: 0 });
export const GAME_ORDER = ['hearth', 'constellation', 'beacon', 'labyrinth', 'resonance', 'ascent', 'tunnel'];

const WARD_HZ = 333;
/** The shared family's names (they keep one level on every game: GameSound leaves them out of a game's mix trim). */
export const SHARED = new Set(['coin', 'insertCoin', 'start', 'lifeLost', 'die', 'ward']);

/** The shared family sounds, in a game's key (R = the game's root, Hz). */
export function cabinetVoice(R) {
  return {
    coin: {
      label: 'Coin accepted', group: 'cabinet', desc: 'the on-screen chirp when a credit goes in (the same on every game)',
      layers: [
        { wave: 'pulse', duty: 0.25, f: hz('B5'), seq: [[0, 0], [0.05, 5]], env: { a: 0.002, d: 0.03, s: 0.7, h: 0.05, r: 0.05, v: 0.13 }, lp: 3600 },
        { wave: 'noise', f: 9000, env: { a: 0.001, d: 0.012, v: 0.05 }, lp: 2400 },
        { wave: 'tri', f: hz('E3'), env: { a: 0.002, d: 0.08, v: 0.14 } },
      ], max: 1, gap: 0.15,
    },
    insertCoin: {
      label: 'INSERT COIN', group: 'cabinet', desc: 'after a loss, once the title is back: the machine asks, softly, in its home key',
      layers: [
        { wave: 'pulse', duty: 0.25, f: hz('A4'), seq: [[0, 0], [0.16, -3], [0.32, -7]], env: { a: 0.006, d: 0.05, s: 0.75, h: 0.52, r: 0.35, v: 0.09 },
          vib: { rate: 5.5, depth: 14, at: 0.36, fade: 0.2 }, lp: 2800 },
        { wave: 'tri', f: hz('D3'), at: 0.32, env: { a: 0.01, d: 0.3, s: 0.5, h: 0.2, r: 0.35, v: 0.14 } },
      ], max: 1, gap: 1,
    },
    start: {
      label: 'Ready (the start call)', group: 'cabinet', desc: 'READY -> GO: root, fifth, octave; every game says it, in its own key',
      layers: [
        { wave: 'pulse', duty: 0.25, f: R, arp: { n: [0, 7, 12], step: 0.08 }, env: { a: 0.004, d: 0.05, s: 0.7, h: 0.3, r: 0.22, v: 0.11 },
          vib: { rate: 6, depth: 10, at: 0.2, fade: 0.1 }, lp: 3200 },
        { wave: 'tri', f: R / 2, env: { a: 0.004, d: 0.25, s: 0.4, h: 0.12, r: 0.2, v: 0.2 } },
      ], max: 1, gap: 0.5,
    },
    lifeLost: {
      label: 'A life lost', group: 'cabinet', desc: 'a soft thump, the root down a minor third, then an octave (the cabinet\'s way to lose)',
      layers: [
        { wave: 'noise', f: 1800, sweep: { to: 0.15, t: 0.35 }, lp: { f: 1200, to: 300, t: 0.35 }, env: { a: 0.012, d: 0.4, v: 0.14 } },
        { wave: 'tri', f: R / 2, seq: [[0, 0], [0.12, -3], [0.26, -12]], env: { a: 0.01, d: 0.1, s: 0.8, h: 0.3, r: 0.35, v: 0.2 } },
        { wave: 'pulse', duty: 0.5, f: R, seq: [[0, 0], [0.12, -3], [0.26, -12]], env: { a: 0.01, d: 0.1, s: 0.6, h: 0.2, r: 0.3, v: 0.04 }, lp: 1200 },
      ], max: 1, gap: 0.4,
    },
    die: {
      label: 'Round lost', group: 'end', desc: 'the round is over, lost: the same fall, slower, and it keeps going down',
      layers: [
        { wave: 'noise', f: 1500, sweep: { to: 0.1, t: 1.1 }, lp: { f: 1000, to: 180, t: 1.1 }, env: { a: 0.02, d: 1.2, v: 0.12 } },
        { wave: 'tri', f: R / 2, seq: [[0, 0], [0.2, -3], [0.45, -7], [0.75, -12]], env: { a: 0.02, d: 0.2, s: 0.8, h: 0.8, r: 0.9, v: 0.2 },
          vib: { rate: 4, depth: 12, at: 0.8, fade: 0.3 } },
        { wave: 'pulse', duty: 0.5, f: R, seq: [[0, 0], [0.2, -3], [0.45, -7], [0.75, -12]], env: { a: 0.02, d: 0.2, s: 0.6, h: 0.7, r: 0.8, v: 0.035 }, lp: 1000 },
      ], max: 1, gap: 1,
    },
    ward: {
      label: 'The ward (mercy)', group: 'cabinet', desc: 'the light that saves your last life: the same bell in all seven games',
      layers: [
        { wave: 'tri', f: WARD_HZ, env: { a: 0.006, d: 1.1, v: 0.16 }, vib: { rate: 5, depth: 7, at: 0.1, fade: 0.3 } },
        { wave: 'pulse', duty: 0.125, f: WARD_HZ * JI.fifth, env: { a: 0.01, d: 0.8, v: 0.035 }, lp: 2600 },
        { wave: 'tri', f: WARD_HZ * 3, at: 0.05, env: { a: 0.004, d: 0.35, v: 0.035 } },
      ], max: 1, gap: 0.5,
    },
  };
}

// the start screen's breath (8 s) and turn: the drone follows the flower, never the other way round
const D2 = hz('D2'), A2 = hz('A2'), D3 = hz('D3');

export const CABINET_SOUND = {
  id: 'cabinet', title: 'THE CABINET', root: hz('D4'),
  personality: 'the machine itself: a low drone that breathes with the flower, a shimmer while it turns, the coin chirp, the redraw rising and settling into the next game\'s key',
  sounds: {
    ...cabinetVoice(hz('D4')),
    attractDrone: {
      db: -5,
      loop: true, label: 'Start screen: the breath', group: 'loop', drive: 'the breath (0 settled .. 1 the top)',
      desc: 'a low drone breathing with the flower (8 s: in 3.5, out 4.5); it opens and brightens at the top of each breath',
      attack: 1.5, release: 1.5, glide: 0.3,
      layers: [
        { wave: 'tri', f: D2, level: [0.07, 0.11] },
        { wave: 'pulse', duty: 0.5, f: A2, lp: [320, 760], level: [0.018, 0.04] },
        { wave: 'pulse', duty: 0.25, f: D3, lp: [420, 1000], level: [0.0, 0.016], span: [0.35, 1] },
        { wave: 'noise', f: [240, 420], lp: [300, 520], level: [0.004, 0.012] },
      ],
    },
    attractShimmer: {
      db: 6,
      loop: true, label: 'Start screen: the turn', group: 'loop', drive: 'the turn (0 still .. 1 turning)',
      desc: 'a faint shimmer while the flower counter-turns (every 24-31 s, 8.5 s long)',
      attack: 0.5, release: 1.2, glide: 0.4,
      layers: [
        { wave: 'pulse', duty: 0.125, f: hz('D5'), lp: 2000, level: [0, 0.014], trem: { rate: 0.9, depth: 0.7 } },
        { wave: 'tri', f: hz('A5'), level: [0, 0.012], vib: { rate: 5, depth: 6 }, trem: { rate: 0.6, depth: 0.6 } },
        { wave: 'tri', f: hz('E6'), level: [0, 0.006], span: [0.3, 1], trem: { rate: 1.3, depth: 0.8 } },
      ],
    },
    starLand: {
      db: 3,
      label: 'Start screen: the star lands', group: 'cabinet', desc: 'the inner star settles back on its painted lines: one soft chime',
      layers: [
        { wave: 'tri', f: hz('D5'), env: { a: 0.02, d: 1.6, v: 0.045 }, vib: { rate: 4.5, depth: 5, at: 0.2, fade: 0.4 } },
        { wave: 'pulse', duty: 0.125, f: hz('A5'), at: 0.04, env: { a: 0.02, d: 1.0, v: 0.014 }, lp: 2400 },
      ], max: 1, gap: 2,
    },
    redraw: {
      db: 5,
      loop: true, label: 'The redraw: the rise', group: 'loop', drive: 'the redraw (0 .. 1)',
      desc: 'THE REDRAW (3.6 s): a shimmer rising under the moving lines; it settles as the next game forms',
      attack: 0.3, release: 0.6, glide: 0.08,
      layers: [
        { wave: 'pulse', duty: 0.125, f: [hz('D4'), hz('D6')], lp: [1100, 2800], level: [0.004, 0.022], trem: { rate: 6, depth: 0.5 } },
        { wave: 'tri', f: [hz('A3'), hz('A5')], level: [0.02, 0.03], vib: { rate: 5, depth: 8 } },
        { wave: 'noise', f: [1500, 6000], lp: [800, 2200], level: [0.004, 0.012] },
      ],
    },
    redrawStep: {
      db: 6,
      label: 'The redraw: a step', group: 'cabinet', desc: 'the rise is made of little steps up the pentatonic, faster as it goes',
      layers: [{ wave: 'pulse', duty: 0.125, f: hz('D4'), env: { a: 0.002, d: 0.14, v: 0.03 }, lp: 3000 },
        { wave: 'tri', f: hz('D4'), at: 0.09, env: { a: 0.002, d: 0.1, v: 0.012 } }],
      max: 3, gap: 0.04,
    },
    redrawChime: {
      label: 'The redraw: the gold light lands', group: 'cabinet', desc: 'the gold light drops into its dot: a soft chime, one step higher for each game beaten',
      layers: [
        { wave: 'tri', f: hz('D5'), env: { a: 0.004, d: 1.3, v: 0.1 }, vib: { rate: 5, depth: 6, at: 0.15, fade: 0.3 } },
        { wave: 'pulse', duty: 0.25, f: hz('D6'), env: { a: 0.004, d: 0.5, v: 0.02 }, lp: 3000 },
        { wave: 'tri', f: hz('A5'), at: 0.07, env: { a: 0.004, d: 0.9, v: 0.035 } },
      ], max: 1, gap: 0.5,
    },
    // THE REVEAL (js/cabinet/seven/finale.js): the machine shows itself after the Tunnel. Quiet, slow, reverent; the same chip.
    revealVesica: {
      label: 'The reveal: the vesica gathers', group: 'cabinet', desc: 'a low tone swelling slowly as the light gathers into the vesica (about 3 s)',
      layers: [
        { wave: 'tri', f: hz('D3'), env: { a: 1.7, d: 0.6, s: 0.6, h: 1.0, r: 1.4, v: 0.13 }, vib: { rate: 4.5, depth: 6, at: 1.2, fade: 0.8 } },
        { wave: 'tri', f: hz('A3'), at: 0.5, env: { a: 1.6, d: 0.6, s: 0.6, h: 0.8, r: 1.4, v: 0.05 } },
        { wave: 'pulse', duty: 0.5, f: hz('D4'), at: 0.9, lp: 1300, env: { a: 1.4, d: 0.5, s: 0.6, h: 0.6, r: 1.2, v: 0.014 } },
      ], max: 1, gap: 4,
    },
    revealGate: {
      label: 'The reveal: the Gate draws itself', group: 'cabinet', desc: 'a quiet line rising up the pentatonic, one step at a time, as the Gate draws (about 3 s)',
      layers: [
        { wave: 'pulse', duty: 0.125, f: hz('D4'), seq: [[0, 0], [0.5, 2], [1.0, 4], [1.5, 7], [2.0, 9], [2.5, 12]],
          env: { a: 0.5, d: 0.3, s: 0.7, h: 2.6, r: 0.9, v: 0.03 }, lp: 2200, vib: { rate: 5, depth: 6, at: 0.6, fade: 0.5 } },
        { wave: 'tri', f: hz('D3'), env: { a: 0.6, d: 0.3, s: 0.6, h: 2.6, r: 1.0, v: 0.08 } },
      ], max: 1, gap: 4,
    },
    revealTick: {
      label: 'The reveal: a letter goes in', group: 'cabinet', desc: 'a soft tick as each initial fills the top row (pitch up the pentatonic per letter)',
      layers: [
        { wave: 'pulse', duty: 0.25, f: hz('D5'), env: { a: 0.003, d: 0.12, v: 0.05 }, lp: 2600 },
        { wave: 'tri', f: hz('D4'), env: { a: 0.003, d: 0.35, v: 0.07 } },
      ], max: 2, gap: 0.12,
    },
    redrawSettle: {
      label: 'The redraw: the new game forms', group: 'cabinet', desc: 'the rise settles on a quiet chord in the NEXT game\'s key',
      layers: [
        { wave: 'tri', f: hz('D3'), env: { a: 0.06, d: 0.4, s: 0.6, h: 0.5, r: 1.0, v: 0.13 } },
        { wave: 'tri', f: hz('D3') * JI.fifth, env: { a: 0.08, d: 0.4, s: 0.6, h: 0.5, r: 1.0, v: 0.06 } },
        { wave: 'pulse', duty: 0.5, f: hz('D4') * JI.third, lp: 1400, env: { a: 0.1, d: 0.4, s: 0.6, h: 0.4, r: 0.9, v: 0.022 } },
      ], max: 1, gap: 0.5,
    },
  },
  cues: {}, events: {}, silent: {},
};

/** The chime's pitch for dot `index` (0 = Hearth beaten ... 6): up the pentatonic from D5. */
export const dotPitch = (index) => penta(index);
export { semis };
