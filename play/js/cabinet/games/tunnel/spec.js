// THE NODE · THE TUNNEL (cabinet level 7, the finale) · the palette, the TUNING and the SPEC (data only: the round, the bots,
// the view and the Lab read it without an import cycle).
//
// Tempest, reshaped by the story: HOLD THE RIM, then LET GO. You ride the rim of the painted tunnel (EIGHTEEN lanes: the
// painted web has eighteen spokes, measured) and fire down the lanes at the ECHOES of the six games before, climbing out of
// the centre one game a wave: the Hearth's embers, the Constellation's falling stars, the Beacon's ring shards, the
// Labyrinth's hunters, the Resonance's kites, the Ascent's crystals. An echo that reaches the rim crawls along it toward you;
// if it stays in your lane it takes a ship. Each echo you break lets a little gold light flow down its lane into the HEART at
// the centre, and the heart wakes. After the sixth wave the echoes stop and your shots dissolve into light before they land:
// the only way on is to LET GO (a ring round the heart fills while no control is held, drains gently while one is). Then THE
// FALL: you leave the rim and fall down the tunnel into the heart, and it opens into light: THE PASSAGE.
//
// MERCY, per round lost on this cabinet (the SDK's rule: the FIFTH credit cannot be lost):
//   speed    the echoes climb x0.9 per loss (to 0.7)
//   count    x0.88 echoes a wave per loss (to 0.65; three at the least)
//   grab     an echo in your lane takes x1.2 longer to take the ship per loss (to 1.6): more time to shoot it
//   lives    +1 ship per loss (to 5)
//   ward     on the unlosable credit the LAST ship can't be lost (an echo that would take it breaks on a ward of light):
//            the round ends only at the passage. Still played by your own hand. THE RESULT COMES FROM A GAME, NEVER FROM
//            THE CLOCK. (The let-go itself can never be lost, on any credit: nothing there can hurt you.)
import { Palette, CabinetGameSpec, CabinetState, Knob } from '../../sdk/index.js';

export const TUNE = Object.freeze({
  step: 1 / 60,
  ready: 3.8,                 // the ready card: the goal, readable before play
  readyAgain: 1.4,            // after a ship is lost: a short READY
  lost: 1.7,                  // a ship lost: everything holds while it breaks
  lives: 3,
  // THE SHIP rides the rim lane to lane: a tap moves one lane, holding moves on smoothly (lanes a second)
  ship: { speed: 8.5, start: 12 },          // (lane 12 = the bottom-left of the two bottom lanes; the painted web's lane order)
  // SHOTS go straight down the lane (in depth w: the rim is 1, the heart about 4.4); a press fires at once (taps as fast as
  // `cooldown`), a HELD button fires lazily, every `auto` s (hammering beats holding); `maxLive` in flight at most
  shot: { speed: 8.2, end: 4.3, maxLive: 5, cooldown: 0.085, auto: 0.34, sub: 3, hitW: 0.16 },
  // THE ECHOES. speed: climb (w per s, constant in depth: they seem to speed up as they near you); rest / move: on the rim,
  // how long they pause in a lane and take to cross to the next (toward you, the short way round); pts: breaking one
  //   ember    THE HEARTH: small and quick
  //   star     THE CONSTELLATION: straight and fast, a trail behind it
  //   shard    THE BEACON: an arc across TWO lanes; two hits (the first cracks it)
  //   hunter   THE LABYRINTH: the red tri-blade; hops to the next lane every `hop` s (toward you, mostly)
  //   kite     THE RESONANCE: shot, it splits in two, the halves slide to the lanes either side and climb on (faster)
  //   crystal  THE ASCENT: at the rim it FLIPS lane to lane toward you (Tempest's flipper)
  echoes: {
    ember: { speed: 1.3, rest: 0.24, move: 0.22, pts: 100 },
    star: { speed: 2.1, rest: 0.4, move: 0.28, pts: 150 },
    shard: { speed: 0.64, rest: 0.55, move: 0.4, pts: 150, hp: 2 },
    hunter: { speed: 0.8, rest: 0.34, move: 0.28, pts: 250, hop: [0.7, 1.15], hopT: 0.26, toward: 0.7 },
    kite: { speed: 0.85, rest: 0.44, move: 0.34, pts: 50 },
    half: { speed: 1.1, rest: 0.38, move: 0.3, pts: 150, slide: 0.3 },
    crystal: { speed: 1.4, rest: 0.28, move: 0.28, pts: 200 },
  },
  // the six waves (one game each): the kind, how many, a new one every `every` s (they climb from `spawnW`, fading in).
  // THE ENDING TIGHTENS: waves 5 and 6 come denser and faster (their echoes climb quicker: kite, half, crystal above), so the
  // sudden quiet of THE LET-GO lands harder (bots, 600 runs: the decent hand still clears every round in ~63 s, the sloppy one
  // 77% -> ~59%)
  waves: [
    { kind: 'ember', name: 'THE HEARTH', count: 9, every: 0.72 },
    { kind: 'star', name: 'THE CONSTELLATION', count: 8, every: 0.85 },
    { kind: 'shard', name: 'THE BEACON', count: 5, every: 1.45 },
    { kind: 'hunter', name: 'THE LABYRINTH', count: 6, every: 1.2 },
    { kind: 'kite', name: 'THE RESONANCE', count: 6, every: 1.15 },
    { kind: 'crystal', name: 'THE ASCENT', count: 9, every: 0.8 },
  ],
  waveGap: 1.0,               // between waves: the next one's banner, then its first echo
  spawnW: 4.15,               // where the echoes appear (the heart's own depth is about 4.4)
  fadeIn: 0.35,
  grab: 0.26,                 // an echo in your lane at the rim takes the ship after this long (shoot it first: a crawler
                              // counts as in your lane from halfway across)
  // THE GOLD LIGHT: a broken echo's light flows down its lane (w per s) into the heart; the heart wakes as it fills
  mote: { speed: 1.9, heartW: 4.4 },
  // THE LET-GO: after the sixth wave (a breath of `intro` s while the words come up), the ring fills while NO control is
  // held: it starts `quiet` s after the last touch and eases up to full speed by `settle` s (full in about `fill` s more), so
  // only real stillness fills it (a tap now and then keeps it empty); while anything is held (or was, under `quiet` s ago) it
  // drains at `drain` a second. Shots dissolve at `dissolveW`. If a busy hand has kept the ring near empty for `hintAfter` s
  // of touching, one more line comes up (the ring fills while you are still).
  letgo: { intro: 1.1, quiet: 0.3, settle: 0.9, fill: 2.8, drain: 0.5, dissolveW: 1.7, hintAfter: 4.0 },
  // THE FALL (s): the ship leaves the rim and falls into the heart; the camera dives after it (layout.js fallAt)
  fall: { dur: 9.0 },
  score: { waveClear: 250, passage: 3000, shipLeft: 500 },
  card: { won: 11.0, lost: 5.0 },
});

export const TunnelPalette = new Palette(
  ['bg', 0x02040A], ['web', 0x2C7CF0], ['ship', 0x8CC8FF], ['red', 0xF04830], ['gold', 0xF2C040],
  ['text', 0x5CA8F0], ['dim', 0x0C2040],
).roles('bg', 'text', 'web', 'gold', 'dim');

function buildSpec() {
  const s = new CabinetGameSpec({
    id: 'tunnel',
    name: 'THE TUNNEL',
    publisher: 'THE NODE',
    year: 1981,
    palette: TunnelPalette,
    tagline: 'HOLD THE RIM',
    controls: ['LEFT RIGHT  MOVE', 'SPACE OR Z  FIRE', 'SIX ECHOES CLIMB FROM THE CENTRE'],
    roundWonText: 'THE PASSAGE',
    roundLostText: 'THE HEART SLEEPS',
    highScoreSeed: [16000, 12000, 8500, 5000, 2500],
    knobs: [
      Knob.mul('speed', 1, 0.9, 'x echo climb speed').clamp(0.7, 1),
      Knob.mul('count', 1, 0.88, 'x echoes a wave').clamp(0.65, 1),
      Knob.mul('grab', 1, 1.2, 'x the time an echo in your lane takes to take the ship').clamp(1, 1.6),
      Knob.add('lives', TUNE.lives, 1, 'ships').clamp(TUNE.lives, TUNE.lives + 2),
      Knob.fixed('ward', 0, 'on: the last ship cannot be lost').setOnMercy(1),
    ],
  });
  s.phaseNames.set(CabinetState.Intro, 'ready');
  s.phaseNames.set(CabinetState.Playing, 'play');
  s.phaseNames.set(CabinetState.Interlude, 'lost');
  return s;
}

export const TunnelSpec = buildSpec();
