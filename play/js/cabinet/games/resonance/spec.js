// THE NODE · THE RESONANCE (cabinet level 5) · the palette, the TUNING and the SPEC (data only: the round, the bots, the
// view and the Lab read it without an import cycle).
//
// MERCY, per round lost on this cabinet (the SDK's rule: the FIFTH credit cannot be lost):
//   fall     the shapes come down x0.9 slower per loss (to 0.7)
//   window   the crest's reach (the resonant window) widens x1.08 per loss (to 1.25)
//   lives    +1 life per loss (to 5)
//   target   one clean hit fewer per loss (to 3 fewer)
//   ward     on the unlosable credit the LAST life can't be lost (a shape that lands, or a shard that strikes, breaks on a
//            ward of light): the round ends only when the signal is tuned. Still played by your own hand.
//            THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TUNE = Object.freeze({
  step: 1 / 60,
  ready: 3.6,                 // the ready card: the goal, readable before play (the shapes unspool meanwhile)
  readyAgain: 1.4,            // after a life is lost: a short READY
  lost: 1.7,                  // a life lost: everything holds while it breaks
  lives: 3,
  target: 17,                 // CLEAN (resonant) hits to tune the signal: CLEAR
  // the emitter slides along the painted ground curve (layout.js GROUND); it fires straight up from its barrel's tip
  emitter: { speed: 410, accel: 5200 },
  pulse: { speed: 800, maxLive: 2, cooldown: 0.15, sub: 3 },
  // THE WAVE: y = y0 - A sin(k x - phase), k = 2 pi / lambda, drifting RIGHT at v(t) (v0 -> v1 over `ramp` s of play, eased),
  // its height breathing slowly (A = amp (1 + breath sin(2 pi t / breathPeriod))). Every change is smooth; the crests pass
  // any one point at most v / lambda times a second (0.12 -> 0.23 Hz: far under the 3 Hz line)
  wave: { y0: 425, amp: 64, breath: 0.1, breathPeriod: 13, lambda: 490, v0: 34, v1: 84, ramp: 60, phase0: [0, 6.283] },
  // A shape is RESONANT while a crest passes under it and reaches it: the crest within `base + perHalf * halfWidth` px of it
  // (left or right) and the shape's lowest point no more than `reach` px above the crest's height (the crest node's ray).
  // A shape whose middle falls past `pass` (px below the wave's centre line, x amp) has slipped THROUGH the wave: the crest
  // can't tune it any more; it falls faster (x passed) to the ground, and a hit only breaks it (no points)
  resonance: { base: 20, perHalf: 0.45, reach: 95, pass: 0.5 },
  // THE SHAPES: red kites on dotted threads. h: height (the kite's half-width is 0.335 h); pts: a clean hit (x the chain);
  // fall: px/s hanging (x (1 + ramp * eased play time / 60)); cut loose (an off-phase hit): x loose, faster
  shapes: {
    sizes: { L: { h: 104, pts: 50, fall: 6.2 }, M: { h: 74, pts: 100, fall: 7.3 }, S: { h: 54, pts: 150, fall: 8.5 } },
    ramp: 0.7, loose: 2.1, looseAgain: 1.3, passed: 2.1,   // (x fall: cut loose, again, slipped through)
    want: [7, 8],             // live shapes wanted, early -> late (a new one unspools from the top when there are fewer)
    spawnEvery: 2.8, enter: 1.7, hangY: [90, 175], max: 12,
    split: { spread: 36, time: 0.5 },   // an off-phase split: the halves drift apart this far over this long
    sizeOdds: { L: 0.36, M: 0.4, S: 0.24 },
  },
  // shards: now and then a hanging shape lets a small red shard fall straight down (never aimed): sparse and slow
  shard: { first: 7.0, every: [6.0, 3.8], tell: 0.9, speed: 150, maxLive: 2 },
  score: { chainMax: 8, clear: 2000, lifeLeft: 500, bonusEvery: 4 },
  card: { won: 9.5, lost: 5.0 },
});

// the SDK palette (the Lab's 320x240 surface); the glowing three.js view uses the same hues as light
export const ResonancePalette = new Palette(
  ['bg', 0x02030A], ['wave', 0x8CB8FF], ['node', 0xE8F2FF], ['emitter', 0x5C9CFF], ['red', 0xF03A2E],
  ['text', 0x8CB8FF], ['dim', 0x14284A],
).roles('bg', 'text', 'wave', 'node', 'dim');

function buildSpec() {
  const s = new CabinetGameSpec({
    id: 'resonance',
    name: 'THE RESONANCE',
    publisher: 'THE NODE',
    year: 1981,
    palette: ResonancePalette,
    tagline: 'TUNE THE SIGNAL',
    controls: ['LEFT RIGHT  MOVE', 'SPACE OR Z  FIRE', 'HIT THE SHAPES ON THE CREST'],
    roundWonText: 'THE SIGNAL IS CLEAR',
    roundLostText: 'THE SIGNAL IS LOST',
    highScoreSeed: [12000, 9000, 6500, 4000, 2000],
    knobs: [
      Knob.mul('fall', 1, 0.9, 'x shape fall speed').clamp(0.7, 1),
      Knob.mul('window', 1, 1.08, "x the crest's reach").clamp(1, 1.25),
      Knob.add('lives', TUNE.lives, 1, 'lives').clamp(TUNE.lives, TUNE.lives + 2),
      Knob.add('target', TUNE.target, -1, 'clean hits to tune').clamp(TUNE.target - 3, TUNE.target),
      Knob.fixed('ward', 0, 'on: the last life cannot be lost').setOnMercy(1),
    ],
  });
  s.phaseNames.set(CabinetState.Intro, 'ready');
  s.phaseNames.set(CabinetState.Playing, 'play');
  s.phaseNames.set(CabinetState.Interlude, 'lost');
  return s;
}

export const ResonanceSpec = buildSpec();
