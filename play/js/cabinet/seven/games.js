// THE CABINET WITH NO NAME · the seven, in order (docs/THE_PLAN/CABINET_SEVEN_GAMES.md): what the host needs of each game.
//
//   GAMES[i] = { id, name, load() -> createXGame, bot() -> XBot class, heart: [x, y], hold, controls, read }
//     load / bot    lazy imports: nothing of a game is fetched until the host asks for it
//     heart         frame coords (1266 x 952, y down) of where the picture's light lives: the redraw's heartFrom / heartTo
//                   when js/cabinet/transition/pairs.js has no entry for the pair
//     hold          the won frame before THE REDRAW: the game's own win plays (its card phase, the real clock) until its
//                   win picture has SETTLED, then the frame is held still and the redraw begins from it (9/29: the old
//                   holds, rig.js HOLD, caught several wins mid-morph, e.g. the Resonance's Lissajous before its hexafoil):
//                   { settle } = the card's phaseTime at which the win picture is finished (read off each view: when its last
//                   eased draw-in ends); { words } = when the card's words begin to fade in: where that is before the settle,
//                   the words (the view's sText batch and the dark band behind them, which carry nothing else on a won card)
//                   are hidden from then on (the redraw stands in for the card); { proxy: 'hearth', secs } = the approved
//                   Hearth hold of transition_test.html (the words stay off, both painted animals wake on the wall)
//     controls      the bottom-of-screen hint in the arcade: [[keys, label], ...] (keys are HTML entities / words)
//     pointer       (the Constellation) the mouse aims and clicks fire, as on its own page: the host passes px / py (frame
//                   coords) and FIRE; aimOf(sim) = where the sight is now (a relative mouse starts from there)
//     read(k, st)   one input frame for the game from the arcade's keys (input.js SevenKeys), the same shaping as the game's
//                   own page (hearth.html etc.: taps between frames, fresh presses, the Labyrinth's newest-direction rule)
//
// pairOptions(i, pairs) -> the createRedraw options for game i -> game i + 1 (dot `index` = i lights; dots 0..i-1 are lit)
import { REDRAW_DEFAULTS } from '../transition/redraw.js';

const L = '&larr;', R = '&rarr;', U = '&uarr;', D = '&darr;';

// ---------------- input shaping, per game (copied from each page's readInput; keyboard only: the arcade has no pad here)
const down = (k, c) => k.keys.has(c) || k.since.has(c);
const pressed = (k, set) => k.pressed.filter((c) => set.has(c)).length;
const unit = (f) => { const m = Math.hypot(f.x, f.y); if (m > 1) { f.x /= m; f.y /= m; } return f; };

function readHearth(k) {                       // hearth.html
  let x = 0, y = 0;
  if (down(k, 'ArrowLeft') || down(k, 'KeyA')) x -= 1;
  if (down(k, 'ArrowRight') || down(k, 'KeyD')) x += 1;
  if (down(k, 'ArrowUp') || down(k, 'KeyW')) y += 1;
  if (down(k, 'ArrowDown') || down(k, 'KeyS')) y -= 1;
  return unit({ x, y, a: down(k, 'Space') || down(k, 'KeyZ'), b: down(k, 'KeyX') || down(k, 'ShiftLeft'), start: down(k, 'Enter') });
}
function readConstellation(k) {                // constellation.html (the mouse is merged in by the host: SevenScreen.pointer)
  let x = 0, y = 0;
  if (down(k, 'ArrowLeft')) x -= 1;
  if (down(k, 'ArrowRight')) x += 1;
  if (down(k, 'ArrowUp')) y += 1;
  if (down(k, 'ArrowDown')) y -= 1;
  return unit({ x, y, a: down(k, 'Space') || down(k, 'KeyZ'), b: down(k, 'KeyX'), l: down(k, 'KeyA'), m: down(k, 'KeyS'), r: down(k, 'KeyD'),
    start: down(k, 'Enter') });
}
const BEACON_FIRE = new Set(['Space', 'KeyZ', 'KeyX']);
function readBeacon(k, st) {                   // beacon.html: a fresh tap on a frame already holding FIRE gets a release frame first
  let x = 0, y = 0;
  if (down(k, 'ArrowLeft') || down(k, 'KeyA')) x -= 1;
  if (down(k, 'ArrowRight') || down(k, 'KeyD')) x += 1;
  if (down(k, 'ArrowUp') || down(k, 'KeyW')) y += 1;
  const a = down(k, 'Space') || down(k, 'KeyZ'), b = down(k, 'KeyX'), start = down(k, 'Enter');
  const freshFire = pressed(k, BEACON_FIRE) > 0;
  x = Math.max(-1, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
  if (freshFire && st.lastA) st.tapGap = true;
  if (st.tapGap) { st.tapGap = false; st.lastA = false; return { x, y, a: false, b: false, start }; }
  st.lastA = a || b;
  return { x, y, a, b, start };
}
const DIRS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
function readLabyrinth(k) {                    // labyrinth.html: the newest direction held wins; y > 0 = DOWN for this round
  const taps = k.pressed.filter((c) => DIRS[c]);
  const code = k.dirs.length ? k.dirs[k.dirs.length - 1] : taps.length ? taps[taps.length - 1] : null;
  const [x, y] = code ? DIRS[code] : [0, 0];
  const start = k.keys.has('Enter') || k.keys.has('Space') || k.pressed.includes('Enter') || k.pressed.includes('Space');
  return { x, y, a: false, start };
}
const FIRE = new Set(['Space', 'KeyZ', 'KeyX']);
function tapFire(k, st, held) {                // resonance.html / tunnel.html: every press is its own shot (a release frame first)
  st.fireTaps = (st.fireTaps || 0) + pressed(k, FIRE);
  let a;
  if (st.fireTaps > 0) { if (st.lastA) a = false; else { a = true; st.fireTaps--; } } else a = held;
  st.lastA = a;
  return a;
}
function readResonance(k, st) {
  let x = 0;
  if (k.keys.has('ArrowLeft') || k.keys.has('KeyA')) x -= 1;
  if (k.keys.has('ArrowRight') || k.keys.has('KeyD')) x += 1;
  const held = k.keys.has('Space') || k.keys.has('KeyZ') || k.keys.has('KeyX');
  const start = k.keys.has('Enter') || k.pressed.includes('Enter');
  return { x: Math.max(-1, Math.min(1, x)), a: tapFire(k, st, held), start };
}
const THRUST = new Set(['ArrowUp', 'KeyW', 'Space', 'KeyZ', 'KeyX']);
function readAscent(k) {                       // ascent.html: thrust is held (a tap between frames is a hop)
  let x = 0;
  if (k.keys.has('ArrowLeft') || k.keys.has('KeyA')) x -= 1;
  if (k.keys.has('ArrowRight') || k.keys.has('KeyD')) x += 1;
  let thrust = false;
  for (const c of THRUST) if (k.keys.has(c)) thrust = true;
  if (pressed(k, THRUST) > 0) thrust = true;
  const start = k.keys.has('Enter') || k.pressed.includes('Enter');
  return { x: Math.max(-1, Math.min(1, x)), y: thrust ? 1 : 0, a: thrust, start };
}
const MOVE_L = new Set(['ArrowLeft', 'KeyA']), MOVE_R = new Set(['ArrowRight', 'KeyD']);
function readTunnel(k, st) {                   // tunnel.html: a tap of LEFT / RIGHT between frames still moves one lane
  let x = 0, y = 0;
  if (k.keys.has('ArrowLeft') || k.keys.has('KeyA')) x -= 1;
  if (k.keys.has('ArrowRight') || k.keys.has('KeyD')) x += 1;
  if (k.keys.has('ArrowUp') || k.keys.has('KeyW')) y += 1;
  if (k.keys.has('ArrowDown') || k.keys.has('KeyS')) y -= 1;
  const held = k.keys.has('Space') || k.keys.has('KeyZ') || k.keys.has('KeyX');
  const start = k.keys.has('Enter') || k.pressed.includes('Enter');
  const lastMove = [...k.pressed].reverse().find((c) => MOVE_L.has(c) || MOVE_R.has(c));
  if (x === 0 && lastMove) x = MOVE_L.has(lastMove) ? -1 : 1;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)), a: tapFire(k, st, held), start };
}

// ---------------- the seven
const SKY = { box: null };                     // the Constellation's sky (its layout.js SKY: where the sight can go), once loaded
export const GAMES = [
  { id: 'hearth', name: 'HEARTH', heart: REDRAW_DEFAULTS.heartFrom, hold: { proxy: 'hearth', secs: 1.0 },
    load: () => import('../games/hearth/game.js').then((m) => m.createHearthGame),
    bot: () => import('../games/hearth/bot.js').then((m) => m.HearthBot),
    controls: [[[L, R, U, D], 'MOVE'], [['SPACE'], 'WARD']], read: readHearth },
  // (its win: the figure is already lit when the card comes; the words at 1.8 s)
  { id: 'constellation', name: 'THE CONSTELLATION', heart: REDRAW_DEFAULTS.heartTo, hold: { settle: 1.6, words: 1.8 }, pointer: true,
    aimOf: (sim) => (sim && sim.cross ? [sim.cross.x, sim.cross.y] : null), aimBox: () => SKY.box,
    load: () => Promise.all([import('../games/constellation/game.js'), import('../games/constellation/layout.js')])
      .then(([m, L]) => { SKY.box = [L.SKY.x0, L.SKY.y0, L.SKY.x1, L.SKY.y1]; return m.createConstellationGame; }),
    bot: () => import('../games/constellation/bot.js').then((m) => m.ConstellationBot),
    controls: [[['MOUSE', L, R, U, D], 'AIM'], [['CLICK', 'SPACE'], 'FIRE'], [['A', 'S', 'D'], 'LEFT · MIDDLE · RIGHT']], read: readConstellation },
  // (the third lighting draws its figure in: the last star edge ends 0.35 + 1.0 + 0.9 = 2.25 s in; the words at 2.3 s)
  { id: 'beacon', name: 'THE BEACON', heart: [660, 443], hold: { settle: 2.27, words: 2.3 },
    load: () => import('../games/beacon/game.js').then((m) => m.createBeaconGame),
    bot: () => import('../games/beacon/bot.js').then((m) => m.BeaconBot),
    controls: [[[L, R], 'TURN'], [[U], 'THRUST'], [['SPACE'], 'FIRE']], read: readBeacon },
  // (the sacred figure draws outward: its last parts and the rooms' rims close by ~3.35 s; the words at 3.0 s: hidden)
  { id: 'labyrinth', name: 'THE LABYRINTH', heart: [630, 460], hold: { settle: 3.45, words: 3.0 },
    load: () => import('../games/labyrinth/game.js').then((m) => m.createLabyrinthGame),
    bot: () => import('../games/labyrinth/bot.js').then((m) => m.LabyrinthBot),
    controls: [[[L, R, U, D], 'MOVE (PRESS EARLY: IT TURNS AT THE NEXT JUNCTION)']], read: readLabyrinth },
  // (the wave folds into the Lissajous, 0.5-2.7 s, which settles into the still hexafoil, 2.9-4.9 s; the words at 4.4 s: hidden)
  { id: 'resonance', name: 'THE RESONANCE', heart: [631, 430], hold: { settle: 5.0, words: 4.4 },
    load: () => import('../games/resonance/game.js').then((m) => m.createResonanceGame),
    bot: () => import('../games/resonance/bot.js').then((m) => m.ResonanceBot),
    controls: [[[L, R], 'MOVE'], [['SPACE'], 'FIRE (ON THE CREST)']], read: readResonance },
  // (the islands gather, 0.5-3.3 s, and Atlantis rises, 2.7-5.6 s; the words at 4.6 s: hidden)
  { id: 'ascent', name: 'THE ASCENT', heart: [633, 452], hold: { settle: 5.7, words: 4.6 },
    load: () => import('../games/ascent/game.js').then((m) => m.createAscentGame),
    bot: () => import('../games/ascent/bot.js').then((m) => m.AscentBot),
    controls: [[[U, 'SPACE'], 'THRUST'], [[L, R], 'STEER']], read: readAscent },
  { id: 'tunnel', name: 'THE TUNNEL', heart: [630, 442], hold: null,
    load: () => import('../games/tunnel/game.js').then((m) => m.createTunnelGame),
    bot: () => import('../games/tunnel/bot.js').then((m) => m.TunnelBot),
    controls: [[[L, R], 'ROUND THE RIM'], [['SPACE'], 'FIRE']], read: readTunnel },
];
export const GAME_IDS = GAMES.map((g) => g.id);

// the first coin's notice (canon: a photosensitivity notice on the cabinet's first coin)
export const NOTICE_CONTROLS = [[['SPACE'], 'CONTINUE']];
export function readNotice(k) { return k.pressed.some((c) => c === 'Space' || c === 'KeyZ' || c === 'Enter'); }

// THE REDRAW's options for game i -> i + 1. pairs = REDRAW_PAIRS from js/cabinet/transition/pairs.js (when it exists):
// its entry for the pair wins over these defaults, key by key.
export function pairOptions(i, pairs) {
  const A = GAMES[i], B = GAMES[i + 1];
  const base = { index: i, lit: Array.from({ length: i }, (_, k) => k), heartFrom: A.heart, heartTo: B.heart };
  const own = pairs && (pairs[A.id + '>' + B.id] || pairs[i]);
  return own ? { ...base, ...own } : base;
}
