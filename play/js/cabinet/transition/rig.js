// THE REDRAW · the test rig: any of the seven games driven to its WON frame (held) or its first READY frame, and the six
// pairs by name. Used by transition_test.html and the tools; the arcade host has its own way to reach those states.
//   const g = await loadGame(renderer, 'beacon')     the real game (the Tunnel at its own renderScale)
//   const w = wonHold(name, g, seed)                  drives the good bot to the win; w.frame(dt) -> true when the hold is over
//   readyFrame(g, seed)                               a fresh round at its ready card, view warmed, nothing played
import { CreditInfo, Mercy, SessionLedger } from '../sdk/index.js';

export const GAME_NAMES = ['hearth', 'constellation', 'beacon', 'labyrinth', 'resonance', 'ascent', 'tunnel'];
export const TITLES = { constellation: 'THE CONSTELLATION', beacon: 'THE BEACON', labyrinth: 'THE LABYRINTH', resonance: 'THE RESONANCE', ascent: 'THE ASCENT', tunnel: 'THE TUNNEL' };
export const LINES = { constellation: 'SAVE THE PATTERN', beacon: 'LIGHT THE BEACON', labyrinth: 'GATHER THE LIGHT', resonance: 'TUNE THE SIGNAL', ascent: 'RAISE ATLANTIS', tunnel: 'HOLD THE RIM' };
export const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** seconds of the win card the hold shows (the card's words come in later than this: the redraw stands in for them) */
export const HOLD = { hearth: 1.0, constellation: 1.5, beacon: 0.4, labyrinth: 2.0, resonance: 1.5, ascent: 2.0 };
export const SEED_WON = 7, SEED_READY = 11, STEP = 1 / 60;

const cap = (s) => s[0].toUpperCase() + s.slice(1);

export async function loadGame(renderer, name, opts = {}) {
  const m = await import(`../games/${name}/game.js`);
  const game = await m['create' + cap(name) + 'Game'](renderer, { width: 1024, height: 768, ...opts });
  if (name !== 'hearth') game.rig = { name, R: await import(`../games/${name}/round.js`), B: await import(`../games/${name}/bot.js`), S: await import(`../games/${name}/spec.js`) };
  return game;
}

/** Drives the game's good bot to the win (round only, no drawing, until ~3 s before it), then plays on with the game's own
 *  update to the card; returns { frame(dt) -> bool } that holds the won frame for HOLD[name] s of the win card in fixed 1/60 ticks. */
export function wonHold(name, game, seed = SEED_WON) {
  const { R, B, S } = game.rig;
  const N = cap(name);
  const fresh = () => {
    game.resetLedger(); game.start(seed);
    const bot = new B[N + 'Bot']('good'); bot.reset(seed);
    return bot;
  };
  // pass 1: when does the round reach its card (a throwaway round of the same seed)?
  const led = new SessionLedger(); led.recordCredit(name); const c = Mercy.fromLedger(led, name);
  const probe = new R[N + 'Round'](); probe.reset(seed, c, Mercy.resolve(S[N + 'Spec'].knobs, c));
  const pp = new R[N + 'Pad'](), pb = new B[N + 'Bot']('good'); pb.reset(seed);
  let nCard = 0;
  while (nCard < 60 * 400 && probe.phase !== 'card') { pp.latch(pb.drive(probe, STEP)); probe.step(STEP, pp); nCard++; }
  // pass 2: the real game, its round stepped quietly to 3 s before the card, then with the game's own update (view + render)
  const bot = fresh(), sim = game.sim, pad = new R[N + 'Pad']();
  const quiet = Math.max(0, nCard - 180);
  for (let n = 0; n < quiet; n++) { pad.latch(bot.drive(sim, STEP)); sim.step(STEP, pad); }
  let n = 0;
  while (game.sim.phase !== 'card' && n++ < 60 * 30) game.update(STEP, {}, { bot });     // the last seconds, drawn, up to the card
  const holdTicks = Math.round((HOLD[name] ?? 1.5) * 60);
  let ticks = 0, clock = 0;
  return {
    /** one displayed frame of the hold (fixed ticks catch up with the clock, so every loop ends on the same frame) */
    frame(dt) {
      clock += dt;
      const want = Math.min(holdTicks, Math.floor(clock * 60 + 1e-6));
      while (ticks < want) { game.update(STEP, {}, { bot }); ticks++; }
      return ticks >= holdTicks;
    },
  };
}

/** A fresh round at its ready card: the view warmed (pips, plate loaded), nothing played. */
export function readyFrame(game, seed = SEED_READY, clock = 0) {
  game.resetLedger(); game.start(seed);
  for (let i = 0; i < 40; i++) game.view.update(game.sim, STEP, clock + STEP, { mode: 'play', hi: 0, last: 0 });
}
