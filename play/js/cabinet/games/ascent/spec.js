// THE NODE · THE ASCENT (cabinet level 6) · the palette, the TUNING and the SPEC (data only: the round, the bots, the view
// and the Lab read it without an import cycle).
//
// Lunar Lander + Joust, reshaped by the story: RAISE ATLANTIS. You fly a small lander among floating islands, land SOFT on the
// gold pads to light them, come down on the red crystals from ABOVE to shatter them, and when every pad is lit the temple opens
// and one more soft landing raises Atlantis.
//
// MERCY, per round lost on this cabinet (the SDK's rule: the FIFTH credit cannot be lost):
//   soft     the soft-landing speed limit x1.08 per loss (to 1.3)
//   fuel     the thrust burns x0.9 per loss (to 0.7)
//   crystal  the crystals drift x0.9 slower per loss (to 0.7)
//   lives    +1 ship per loss (to 5)
//   pads     one gold pad fewer per loss (to 2 fewer)
//   ward     on the unlosable credit the LAST ship can't be lost (a hard landing, a crystal or the sea is absorbed by a ward of
//            light and the lander sets down on the temple): the round ends only when Atlantis rises. Still flown by your hand.
//            THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TUNE = Object.freeze({
  step: 1 / 60,
  ready: 3.6,                 // the ready card: the goal, readable before play
  readyAgain: 1.4,            // after a ship is lost: a short READY
  lost: 1.7,                  // a ship lost: everything holds while it breaks
  lives: 3,
  pads: 5,                    // gold pads to light: the temple opens
  // THE LANDER (frame px, seconds). Gravity always pulls down; thrust (Up / W / Space) pushes up while there is fuel; left / right
  // is a side thrust with a little lean (Joust's flap: held thrust is a steady push, a tap is a hop). A little air drag keeps it
  // floaty and precise.
  // (the lander starts standing on the start ledge: layout.js START)
  lander: { r: 19, g: 300, thrust: 620, side: 270, drag: 0.6, maxVx: 210, maxVy: 420, walk: 55 },
  // A SOFT LANDING (on the top of an island): descending slower than `vy` (relative to the island) and roughly level (`tilt` rad).
  // Slower than the limit: gold legs; faster: red-orange legs (steady). Anything else is a hard landing: it costs a ship.
  soft: { vy: 100, tilt: 0.24, warn: 0.9, gentle: 0.45 },
  // FUEL: full = 100. Thrust burns `burn` a second, a side thrust `sideBurn`; any soft landing refills `refill` a second (so a
  // landing is always a full tank within a second). Dry: you fall.
  fuel: { max: 100, burn: 11, sideBurn: 2.2, refill: 160, low: 0.25 },
  // THE CRYSTALS: red drifters that wander and slowly home in on the lander. `want` are alive at once (early -> late), a new one
  // enters from an edge every `every` s. Coming down on one from above shatters it; the side or below costs a ship.
  crystal: { r: 17, speed: 54, home: 0.5, want: [2, 3], first: 2.6, every: 4.0, fade: 0.9, stomp: 250, chainMax: 4, bounce: 210, hover: 9 },
  // the islands drift: slow bobbing and long slides (see layout.js PLACE)
  score: { pad: 500, clear: 2000, shipLeft: 500, fuelBonus: 6 },
  card: { won: 10.0, lost: 5.0 },
  bounds: { x0: 84, x1: 1184, y0: 78, sea: 902 },   // the ship bounces off the sides and the ceiling; the sea takes it
});

export const AscentPalette = new Palette(
  ['bg', 0x02060A], ['gold', 0xF2B830], ['cyan', 0x40C8E0], ['red', 0xE04030], ['lander', 0xD8F4FF],
  ['text', 0x40C8E0], ['dim', 0x0C2A34],
).roles('bg', 'text', 'gold', 'cyan', 'dim');

function buildSpec() {
  const s = new CabinetGameSpec({
    id: 'ascent',
    name: 'THE ASCENT',
    publisher: 'THE NODE',
    year: 1981,
    palette: AscentPalette,
    tagline: 'RAISE ATLANTIS',
    controls: ['UP OR SPACE  THRUST', 'LEFT RIGHT  STEER', 'LAND SOFT ON THE GOLD'],
    roundWonText: 'ATLANTIS RISES',
    roundLostText: 'ATLANTIS SLEEPS',
    highScoreSeed: [14000, 10000, 7000, 4500, 2500],
    knobs: [
      Knob.mul('soft', 1, 1.08, 'x the soft-landing speed limit').clamp(1, 1.3),
      Knob.mul('fuel', 1, 0.9, 'x fuel burn').clamp(0.7, 1),
      Knob.mul('crystal', 1, 0.9, 'x crystal speed').clamp(0.7, 1),
      Knob.add('lives', TUNE.lives, 1, 'ships').clamp(TUNE.lives, TUNE.lives + 2),
      Knob.add('pads', TUNE.pads, -1, 'gold pads to light').clamp(TUNE.pads - 2, TUNE.pads),
      Knob.fixed('ward', 0, 'on: the last ship cannot be lost').setOnMercy(1),
    ],
  });
  s.phaseNames.set(CabinetState.Intro, 'ready');
  s.phaseNames.set(CabinetState.Playing, 'play');
  s.phaseNames.set(CabinetState.Interlude, 'lost');
  return s;
}

export const AscentSpec = buildSpec();
