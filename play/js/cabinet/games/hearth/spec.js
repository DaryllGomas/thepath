// THE NODE · HEARTH (cabinet level 1) · the palette, the TUNING and the SPEC (data only: the round, the bots, the
// view and the Lab read it without an import cycle).
//
// MERCY, per round lost on this cabinet (the SDK's rule: the FIFTH credit cannot be lost):
//   burn     the fire burns x0.85 slower per loss (to half)
//   bite     a shade's bite takes x0.85 less per loss (to half)
//   shades   shades drift x0.9 slower per loss (to 0.6)
//   floor    on the unlosable credit the fire never goes out (it holds at a glow): the round ends only when you
//            bring it to blaze. Still played by your own hand. THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TUNE = Object.freeze({
  step: 1 / 60,
  levelSeconds: 60,          // the minute; after it, OVERTIME until the fire blazes or goes out
  fireStart: 0.55,
  wakeBull: 0.68,            // the bull wakes and charges its lane
  blaze: 0.88,               // the deer wakes; hold blaze this long and the hearth holds (clear)
  blazeHold: 12,             // seconds at blaze (was 16; Daryll 9/28: easier to read and to win) (they add up; they drain at half speed below blaze)
  burn: [0.011, 0.0155],     // fire per second, start -> end of the minute
  overtimeBurn: 1.5,
  bite: 0.07,                // a shade reaching the fire
  ward: { cost: 0.025, radius: 115, cooldown: 0.8, push: 420, stun: 1.1 },
  player: { speed: 245, accel: 14, carrySlow: 0.08, carryMax: 5, stun: 0.9, invuln: 1.6, radius: 16 },
  fuel: { cap: 5, every: 1.3, minDist: [150, 330], span: 360, value: [0.06, 0.17], points: [10, 50], pickup: 30 },
  multStep: 0.3,             // n shards dropped at once: x(1 + 0.3 (n - 1))
  shade: { speed: [48, 78], max: [2, 5], every: [5.0, 3.2], huntRadius: 230, hunt: [0.5, 1.1], touch: 32, stun: 0.7, emerge: 1.2 },
  openAt: [0, 0, 12, 24, 36],   // when each opening (layout OPENINGS order) starts sending shades
  animal: { wake: 1.2, passes: 4, pass: 2.6, settle: 1.5, cool: 8, bullReach: 82, deerReach: 72, kill: 50 },
  score: { ward: 10, clear: 1000, perSecondLeft: 20 },
  card: { won: 4.0, lost: 4.0 },
  ready: 1.8,
});

// the SDK palette (the Lab's 320x240 surface); the glowing three.js view uses the same hues as light
export const HearthPalette = new Palette(
  ['bg', 0x0A0503], ['rock', 0x5A2A08], ['ring', 0xE08A1A], ['fire', 0xFFC050], ['gold', 0xF0A030],
  ['player', 0xFFD070], ['shade', 0xE0302A], ['text', 0xFFB028], ['dim', 0x3A1A06],
).roles('bg', 'text', 'fire', 'player', 'dim');

function buildSpec() {
  const s = new CabinetGameSpec({
    id: 'hearth',
    name: 'HEARTH',
    publisher: 'THE NODE',
    year: 1981,
    palette: HearthPalette,
    tagline: 'KEEP THE FIRE',
    controls: ['STICK  MOVE', 'A      WARD (COSTS FIRE)', 'BRING FUEL TO THE FIRE'],
    roundWonText: 'THE HEARTH HOLDS',
    roundLostText: 'THE FIRE WENT OUT',
    highScoreSeed: [6000, 4800, 3600, 2400, 1200],
    knobs: [
      Knob.mul('burn', 1, 0.85, 'x the fire\'s burn').clamp(0.5, 1),
      Knob.mul('bite', 1, 0.85, 'x a shade\'s bite').clamp(0.5, 1),
      Knob.mul('shades', 1, 0.9, 'x shade speed').clamp(0.6, 1),
      Knob.fixed('floor', 0, 'fire floor (> 0: the fire cannot go out)').setOnMercy(0.06),
    ],
  });
  s.phaseNames.set(CabinetState.Intro, 'ready');
  s.phaseNames.set(CabinetState.Playing, 'play');
  return s;
}

export const HearthSpec = buildSpec();
