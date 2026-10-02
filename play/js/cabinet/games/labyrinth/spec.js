// THE NODE · THE LABYRINTH (cabinet level 4) · the palette, the TUNING and the SPEC (data only: the round, the bots, the view
// and the Lab read it without an import cycle).
//
// MERCY, per round lost on this cabinet (the SDK's rule: the FIFTH credit cannot be lost):
//   pace     the pursuers run x0.93 slower per loss (to 0.8)
//   lives    +1 life per loss (to 5)
//   share    the light to gather drops 4 points per loss (85% -> 73%)
//   ward     on the unlosable credit the LAST life can't be lost (a catch throws the ship clear behind a ward and the
//            pursuer is banished): the round ends only when the light is gathered. Still played by your own hand.
//            THE RESULT COMES FROM A GAME, NEVER FROM THE CLOCK.
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TUNE = Object.freeze({
  step: 1 / 60,
  ready: 3.2,                 // the ready card: the goal, readable before play
  readyAgain: 1.5,            // after a catch: a short READY
  caught: 1.8,                // a catch: the ship comes apart, everything holds
  lives: 3,
  share: 0.88,                // gather this share of the light: CLEAR (the rest can stay)
  player: { speed: 245, r: 13, eatR: 16, wantDot: 0.38 },
  // pursuers: a share of the player's speed, rising with play time (ramp per second, capped), slower in the tunnel and
  // when pale; catchR: centre to centre
  pursuer: { speed: 0.82, ramp: 0.0034, maxK: 0.97, tunnel: 0.55, fright: 0.56, r: 13, catchR: 23,
    dissolve: 0.5, reform: 2.4, emerge: 0.8, keepAway: 120 },
  release: [0, 2.0, 6.0, 10.0],   // the Hunter starts outside; the others leave the heart at these play times
  modes: [7, 16, 5, 16, 4],      // scatter, chase, scatter, chase, scatter (s of play), then chase for good
  power: { dur: 6.5, ease: 2.2 },   // pale for dur s; the last `ease` s they warm slowly back to red (never a blink)
  // THE REBUILD: a room group turns every `every` s of play (after `first`): warn (the rooms brighten and shimmer
  // slowly), then (once nothing stands in a doorway, at most holdMax more) the quarter turn, eased
  rebuild: { first: 10.5, every: 11, warn: 1.6, turn: 1.15, holdMax: 1.2, clearR: 18 },
  score: { light: 10, power: 50, banish: [200, 400, 800, 1600], clear: 2000, lifeLeft: 500 },
  card: { won: 8.5, lost: 5.0 },
});

// the SDK palette (the Lab's 320x240 surface); the glowing three.js view uses the same hues as light
export const LabyrinthPalette = new Palette(
  ['bg', 0x020A0A], ['wall', 0x2EE6D0], ['heart', 0x9CB4FF], ['gold', 0xFFC040], ['ship', 0x9CF0FF], ['red', 0xF0302A],
  ['text', 0x7EEAD8], ['dim', 0x0E3A36],
).roles('bg', 'text', 'wall', 'gold', 'dim');

function buildSpec() {
  const s = new CabinetGameSpec({
    id: 'labyrinth',
    name: 'THE LABYRINTH',
    publisher: 'THE NODE',
    year: 1981,
    palette: LabyrinthPalette,
    tagline: 'GATHER THE LIGHT',
    controls: ['ARROWS OR WASD  MOVE', 'PRESS EARLY TO TURN AT THE NEXT JUNCTION'],
    roundWonText: 'THE LABYRINTH OPENS',
    roundLostText: 'THE LABYRINTH CLOSES',
    highScoreSeed: [9000, 7000, 5000, 3500, 2000],
    knobs: [
      Knob.mul('pace', 1, 0.93, 'x pursuer speed').clamp(0.8, 1),
      Knob.add('lives', TUNE.lives, 1, 'lives').clamp(TUNE.lives, TUNE.lives + 2),
      Knob.add('share', TUNE.share, -0.04, 'share of the light to gather').clamp(0.76, TUNE.share),
      Knob.fixed('ward', 0, 'on: the last life cannot be lost').setOnMercy(1),
    ],
  });
  s.phaseNames.set(CabinetState.Intro, 'ready');
  s.phaseNames.set(CabinetState.Playing, 'play');
  s.phaseNames.set(CabinetState.Interlude, 'caught');
  return s;
}

export const LabyrinthSpec = buildSpec();
