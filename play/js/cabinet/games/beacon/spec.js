// THE NODE · THE BEACON (cabinet level 3) · the palette, the TUNING and the SPEC (data only: the round, the bots, the view
// and the Lab read it without an import cycle).
//
// MERCY, per round lost on this cabinet (the SDK's rule: the FIFTH credit cannot be lost):
//   shards   the core's shards fly x0.88 slower per loss, and it fires them that much less often (to 0.64)
//   spin     the rings turn x0.9 slower per loss (to 0.7): gaps stay lined up longer
//   ships    +1 ship per loss (to 5)
//   shield   on the unlosable credit the LAST ship can't be lost (a hit throws it clear behind a shield): the round
//            ends only when the Beacon is lit the third time. Still played by your own hand.
//            THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TUNE = Object.freeze({
  step: 1 / 60,
  ready: 2.8,                 // the ready card: the goal, readable before play
  lit: 3.6,                   // the lighting: the swell, the banner, the rings reform (the ship flies on, safe)
  lights: 3,                  // light the Beacon this many times: CLEAR
  ships: 3,
  ship: { turn: 4.3, thrust: 560, maxSpeed: 430, drag: 0.55, r: 14, respawn: 1.9, invuln: 2.2 },   // r: the drawn kite's size
  shot: { speed: 940, life: 0.74, tap: 0.2, auto: 0.27, maxLive: 3, r: 2.5, sub: 4 },   // a tap fires faster than a hold
  // the rings, inner -> outer (layout.js holds their geometry): hits a shield takes, and the turn (rad/s, before spin-up)
  rings: [{ hp: 5, spin: 0.46 }, { hp: 3, spin: 0.36 }, { hp: 3, spin: 0.28 }],
  // after each lighting the rings turn faster and (later) take more hits: by lighting 0 / 1 / 2 already lit
  escalate: { spin: [1, 1.08, 1.16], hp: [0, 0, 0] },
  regrow: { delay: 1.1, stagger: 0.07, form: 0.6 },   // a cleared ring reforms: after `delay`, shield after shield
  reform: { stagger: 0.045, start: 0.9 },            // after a lighting, every ring reforms (a sweep from the core out)
  core: { aimTurn: [1.25, 1.45, 1.65], lineUp: 0.1, charge: 0.6, cooldown: [3.4, 3.0, 2.7], maxShards: [2, 2, 3], first: 2.2 },
  // a shard leaves the core WIDE (launch: radians off the core's hidden aim, alternating sides), homes loosely at first and tighter
  // with age (turn: [young, old] rad/s by lighting), so it comes at you round the flank, not down your line of fire
  shard: { speed: [80, 140], accel: 26, launch: [1.9, 2.5], turn: [[0.45, 1.7], [0.5, 1.85], [0.55, 2.0]], tighten: 3.0, life: 9.0, fade: 0.5, r: 8, hitR: 11 },
  score: { chip: 10, seg: [100, 75, 50], shard: 150, light: 1000, shipLeft: 500, clear: 2000 },
  card: { won: 7.5, lost: 5.0 },
});

// the SDK palette (the Lab's 320x240 surface); the glowing three.js view uses the same hues as light
export const BeaconPalette = new Palette(
  ['bg', 0x02040A], ['ring', 0x5C9CFF], ['core', 0xE8F2FF], ['ship', 0x9CC8FF], ['red', 0xF03A2E],
  ['text', 0x8CB8FF], ['dim', 0x14284A],
).roles('bg', 'text', 'ring', 'core', 'dim');

function buildSpec() {
  const s = new CabinetGameSpec({
    id: 'beacon',
    name: 'THE BEACON',
    publisher: 'THE NODE',
    year: 1981,
    palette: BeaconPalette,
    tagline: 'LIGHT THE BEACON',
    controls: ['LEFT RIGHT  TURN', 'UP  THRUST', 'FIRE  SPACE OR A'],
    roundWonText: 'THE BEACON BURNS',
    roundLostText: 'THE BEACON GOES DARK',
    highScoreSeed: [16000, 12000, 9000, 6000, 3000],
    knobs: [
      Knob.mul('shards', 1, 0.88, 'x shard speed and fire rate').clamp(0.64, 1),
      Knob.mul('spin', 1, 0.9, 'x ring turn').clamp(0.7, 1),
      Knob.add('ships', TUNE.ships, 1, 'ships').clamp(TUNE.ships, TUNE.ships + 2),
      Knob.fixed('shield', 0, 'on: the last ship cannot be lost').setOnMercy(1),
    ],
  });
  s.phaseNames.set(CabinetState.Intro, 'ready');
  s.phaseNames.set(CabinetState.Playing, 'play');
  s.phaseNames.set(CabinetState.Interlude, 'lit');
  return s;
}

export const BeaconSpec = buildSpec();
