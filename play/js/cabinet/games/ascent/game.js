// THE NODE · THE ASCENT (cabinet level 6) · THE GAME, as a host plugs it in: create -> update(dt, input) -> texture.
//
//   const game = await createAscentGame(renderer, { width: 1024, height: 768, ledger, cabinetId: 'ascent' });
//   each frame:  game.update(dt, { x, a, b, start });
//                x = left / right (-1..1): steer; y (up) or a (or b) = THRUST (held); start (or a) takes a credit. Then put game.texture on the cabinet's
//                glass, or game.blit().
//   game.state   { mode: 'attract' | 'play', phase: 'ready' | 'play' | 'lost' | 'card', padsLit, padsTotal, chain, lives, score,
//                  fuel, time, result, hi, last, credit }
//   game.events  this frame's: { kind: 'cue', name } (Coin Start Hit Miss Die Win Bonus Tick) and the round's own ({ kind: 'soft' |
//                'light' | 'open' | 'stomp' | 'hit' | 'lifeLost' | 'ward' | 'dry' | 'bump' | 'takeoff' | 'almost' | 'go' | 'again' | 'clear' | 'out' | 'spawn' | 'gone', ... })
//   game.start(seed?)  a credit (as START does)      game.onRoundOver = (result, summary, { score, credit }) => {}
//   update(dt, input, { bot })   a AscentBot plays instead of the input (demos, tests)
//
// Attract: the good bot plays a demo round under the title card; START takes a credit. The mercy ledger (SDK: per cabinet
// id, the fifth credit cannot be lost) eases the round per round lost.
import { CabinetState, RoundResult, SoundCueNames, SessionLedger, Mercy, CreditInfo } from '../../sdk/index.js';
import { createLookKit } from '../../lookkit/index.js';
import { AscentRound, AscentPad } from './round.js';
import { AscentBot } from './bot.js';
import { AscentSpec } from './spec.js';
import { AscentView, ASCENT_LOOK } from './view.js';
import { FRAME } from './layout.js';

export async function createAscentGame(renderer, opts = {}) {
  const kit = createLookKit(renderer, { ...ASCENT_LOOK, width: opts.width ?? 1024, height: opts.height ?? 768 });
  const view = new AscentView(kit);
  view.inCabinet = !!opts.inCabinet;      // the seven-game cabinet (js/cabinet/seven/) asks for its own words on the attract card
  await view.ready;
  const ledger = opts.ledger ?? new SessionLedger();
  const cabinetId = opts.cabinetId ?? 'ascent';
  const pad = new AscentPad(), demoPad = new AscentPad(), botPad = new AscentPad();
  let mode = 'attract', sim = null, demo = null, demoBot = null, t = 0, demoSeed = opts.demoSeed ?? 7;
  let hi = AscentSpec.highScoreSeed[0], last = 0;
  const events = [];

  const newDemo = () => {
    demo = new AscentRound(); const c = new CreditInfo();
    demo.reset(demoSeed++ * 104729, c, Mercy.resolve(AscentSpec.knobs, c));
    demoBot = new AscentBot('good'); demoBot.reset(demoSeed); demoPad.clear();
  };
  newDemo();
  const drain = (s) => {
    for (let i = 0; i < s.cues.count; i++) events.push({ kind: 'cue', name: SoundCueNames[s.cues.at(i)] });
    for (const e of s.events) events.push(e);
  };

  const game = {
    kit, view,
    get texture() { return kit.texture; },
    blit: (vp) => kit.blit(vp),
    events,
    onRoundOver: null,
    get mode() { return mode; },
    /** the round on the glass (the demo in attract) */
    get sim() { return mode === 'attract' ? demo : sim; },
    get state() {
      const s = game.sim;
      return { mode, phase: s.phase, padsLit: s.padsLit, padsTotal: s.padsTotal, chain: s.chain, lives: s.livesLeft, score: s.score, fuel: s.lander.fuel,
        time: s.levelTime, result: s.result, hi, last, credit: sim ? sim.credit.number : 0 };
    },
    frameToPointer(u, v) { return [u * FRAME[0], v * FRAME[1]]; },
    /** Forget this cabinet's credits and losses (a fresh machine: tests, or a host's 'reset mercy'). */
    resetLedger() { ledger._credits?.clear?.(); ledger._losses?.clear?.(); },
    start(seed) {
      ledger.recordCredit(cabinetId);
      const credit = Mercy.fromLedger(ledger, cabinetId);
      sim = new AscentRound();
      sim.reset(seed ?? ((Date.now() & 0x7fffffff) | 1), credit, Mercy.resolve(AscentSpec.knobs, credit));
      mode = 'play'; pad.clear(); botPad.clear();
      events.push({ kind: 'cue', name: 'Coin' });
    },
    update(dt, frame, o = {}) {
      events.length = 0;
      dt = Math.min(Math.max(dt, 0), 0.1);
      t += dt;
      pad.latch(frame);
      if (mode === 'attract' && (pad.pressed('start') || pad.pressed('a') || o.bot)) { game.start(o.seed); pad.clear(); }
      if (mode === 'attract') {
        demoPad.latch(demoBot.drive(demo, dt));
        demo.step(dt, demoPad);
        if (demo.state === CabinetState.Over || (demo.phase === 'card' && demo.phaseTime > 4.5)) newDemo();
      } else {
        let p = pad;
        if (o.bot) { botPad.latch(o.bot.drive(sim, dt)); p = botPad; }
        sim.step(dt, p);
        drain(sim);
        if (sim.state === CabinetState.Over) {
          const result = sim.result;
          if (result === RoundResult.Lost) ledger.recordLoss(cabinetId);
          last = sim.score; hi = Math.max(hi, sim.score);
          game.onRoundOver?.(result, sim.summary, { score: sim.score, credit: sim.credit.number });
          mode = 'attract'; newDemo();
        }
      }
      view.update(game.sim, dt, t, { mode, hi, last });
      kit.render(dt);
    },
    dispose() { kit.dispose(); },
  };
  return game;
}
