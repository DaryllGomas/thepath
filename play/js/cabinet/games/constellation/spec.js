// THE NODE · THE CONSTELLATION (cabinet level 2) · the palette, the TUNING and the SPEC (data only: the round, the bots,
// the view and the Lab read it without an import cycle).
//
// MERCY, per round lost on this cabinet (the SDK's rule: the FIFTH credit cannot be lost):
//   speed    the shapes fall x0.9 slower per loss (to 0.7)
//   count    x0.9 fewer shapes per wave per loss (to 0.7)
//   ammo     +1 shot per base per wave per loss (to 8)
//   temple   the temple takes +1 more hit per loss (to TUNE.templeHp + 2)
//   shield   on the unlosable credit the temple can't fall and the last base can't go dark (a gold dome turns the
//            shape): the round ends only when the fourth wave is cleared. Still played by your own hand.
//            THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TUNE = Object.freeze({
  step: 1 / 60,
  ready: 2.6,                 // the ready card: the goal, readable before play
  breath: 3.6,                // between waves: the bases reload, the pattern forms
  reloadAt: 0.9,              // into the breath: the pips refill one by one from here
  // the four waves: shapes, the span (s) their salvos are spread over, salvo size, fall speed (px/s), and how many of
  // them split / fall fast / weave
  waves: [
    { n: 10, span: 7.5, salvo: [2, 3], speed: [86, 102], split: 0, fast: 0, weave: 0 },
    { n: 13, span: 8.0, salvo: [2, 4], speed: [92, 110], split: 2, fast: 1, weave: 0 },
    { n: 17, span: 8.5, salvo: [3, 5], speed: [98, 116], split: 2, fast: 2, weave: 2 },
    { n: 21, span: 9.0, salvo: [4, 6], speed: [104, 124], split: 3, fast: 3, weave: 3 },
  ],
  firstSpawn: 0.6,            // into a wave: the first salvo
  fastMul: 1.65,
  split: { y: [250, 420], kids: 3, speedMul: 1.08, spread: 60 },
  weave: { amp: [34, 56], period: [1.5, 2.2] },
  shape: { r: 12, rKid: 9 },  // collision radius (added to a burst's radius)
  shot: { speed: 1080, maxLive: 8 },
  burst: { r: 68, grow: 0.38, hold: 0.42, fade: 0.6 },    // lethal while it grows and holds; then it fades (harmless)
  chain: { r: 32, grow: 0.22, hold: 0.12, fade: 0.45, depth: 5 },   // a shape destroyed bursts too, small: chains
  ammo: 5,                    // shots per base per wave
  templeHp: 4,
  target: { temple: 0.24, deadBase: 0.2 },   // odds a shape goes for the temple; weight of a dark base vs a living one
  crosshair: { speed: 820, accel: 18 },
  score: { kill: 100, chainStep: 50, shotLeft: 25, base: 250, temple: 500, stroke: 150, clear: 2000 },
  card: { won: 6.5, lost: 4.8 },
});

// the SDK palette (the Lab's 320x240 surface); the glowing three.js view uses the same hues as light
export const ConstellationPalette = new Palette(
  ['bg', 0x04070C], ['sky', 0x1A3A6A], ['gold', 0xF0C050], ['shot', 0xFFF0C0], ['red', 0xE8302A],
  ['text', 0xFFC848], ['dim', 0x3A2A10],
).roles('bg', 'text', 'gold', 'shot', 'dim');

function buildSpec() {
  const s = new CabinetGameSpec({
    id: 'constellation',
    name: 'CONSTELLATION',
    publisher: 'THE NODE',
    year: 1981,
    palette: ConstellationPalette,
    tagline: 'SAVE THE PATTERN',
    controls: ['AIM  MOUSE OR STICK', 'FIRE  CLICK OR A (NEAREST BASE)', 'A S D  LEFT MIDDLE RIGHT BASES'],
    roundWonText: 'THE PATTERN HOLDS',
    roundLostText: 'THE PATTERN BREAKS',
    highScoreSeed: [40000, 32000, 24000, 16000, 8000],
    knobs: [
      Knob.mul('speed', 1, 0.9, 'x fall speed').clamp(0.7, 1),
      Knob.mul('count', 1, 0.9, 'x shapes per wave').clamp(0.7, 1),
      Knob.add('ammo', TUNE.ammo, 1, 'shots per base per wave').clamp(TUNE.ammo, 8),
      Knob.add('temple', TUNE.templeHp, 1, 'hits the temple takes').clamp(TUNE.templeHp, TUNE.templeHp + 2),
      Knob.fixed('shield', 0, 'on: the temple and the last base cannot fall').setOnMercy(1),
    ],
  });
  s.phaseNames.set(CabinetState.Intro, 'ready');
  s.phaseNames.set(CabinetState.Playing, 'wave');
  s.phaseNames.set(CabinetState.Interlude, 'breath');
  return s;
}

export const ConstellationSpec = buildSpec();
