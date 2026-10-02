// THE NODE · HEARTH (cabinet level 1) · THE GAME, as a host plugs it in: create -> update(dt, input) -> texture/state/events.
//
//   const game = await createHearthGame(renderer, { width: 1024, height: 768, ledger, cabinetId: 'hearth' });
//   each frame:  game.update(dt, { x, y, a, b, start });   // stick x/y in -1..1 (+y = UP), buttons HELD
//                then put game.texture on the cabinet's glass (a stable sRGB THREE.Texture), or game.blit() to the canvas
//   game.state   { mode: 'attract' | 'play', phase: 'ready' | 'play' | 'card', fire, score, time, overtime, result, hi, last, credit }
//   game.events  this frame's: { kind: 'cue', name } (Coin Start Hit Miss Die Win Bonus Tick) and the round's own
//                ({ kind: 'feed' | 'bite' | 'ward' | 'wake' | 'gore' | 'knocked' | 'overtime' | 'clear' | 'out', ... })
//   game.start(seed?)  a credit (as START does)      game.onRoundOver = (result, summary, { score, credit }) => {}
//   update(dt, input, { bot })   a HearthBot plays instead of the input (demos, tests)
//
// Attract: the good bot plays a demo round under the title card; START (or A) takes a credit. The mercy ledger
// (SDK: per cabinet id, the fifth credit cannot be lost) eases the round per round lost.
import { CabinetInput, CabinetState, RoundResult, SoundCueNames, SessionLedger, Mercy, CreditInfo, Pad } from '../../sdk/index.js';
import { createLookKit } from '../../lookkit/index.js';
import { HearthRound } from './round.js';
import { HearthBot } from './bot.js';
import { HearthSpec } from './spec.js';
import { HearthView, HEARTH_LOOK } from './view.js';

export async function createHearthGame(renderer, opts = {}) {
  const kit = createLookKit(renderer, { ...HEARTH_LOOK, width: opts.width ?? 1024, height: opts.height ?? 768 });
  const view = new HearthView(kit);
  view.inCabinet = !!opts.inCabinet;      // the seven-game cabinet (js/cabinet/seven/) asks for its own words on the attract card
  await view.ready;
  const ledger = opts.ledger ?? new SessionLedger();
  const cabinetId = opts.cabinetId ?? 'hearth';
  const input = new CabinetInput(), demoInput = new CabinetInput(), botInput = new CabinetInput();
  let mode = 'attract', sim = null, demo = null, demoBot = null, t = 0, demoSeed = opts.demoSeed ?? 7;
  let hi = HearthSpec.highScoreSeed[0], last = 0;
  const events = [];

  const newDemo = () => {
    demo = new HearthRound(); const c = new CreditInfo();
    demo.reset(demoSeed++ * 104729, c, Mercy.resolve(HearthSpec.knobs, c));
    demoBot = new HearthBot('good'); demoBot.reset(demoSeed); demoInput.clear();
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
      return { mode, phase: s.phase, fire: s.fire, score: s.score, time: s.levelTime, overtime: s.overtime, result: s.result,
        hi, last, credit: sim ? sim.credit.number : 0 };
    },
    /** Forget this cabinet's credits and losses (a fresh machine: tests, or a host's 'reset mercy'). */
    resetLedger() { ledger._credits?.clear?.(); ledger._losses?.clear?.(); },
    start(seed) {
      ledger.recordCredit(cabinetId);
      const credit = Mercy.fromLedger(ledger, cabinetId);
      sim = new HearthRound();
      sim.reset(seed ?? ((Date.now() & 0x7fffffff) | 1), credit, Mercy.resolve(HearthSpec.knobs, credit));
      mode = 'play'; input.clear(); botInput.clear();
      events.push({ kind: 'cue', name: 'Coin' });
    },
    update(dt, frame, o = {}) {
      events.length = 0;
      dt = Math.min(Math.max(dt, 0), 0.1);
      t += dt;
      input.latch(frame);
      if (mode === 'attract' && (input.pressed(Pad.Start) || input.pressed(Pad.A) || o.bot)) game.start(o.seed);
      if (mode === 'attract') {
        demoInput.latch(demoBot.drive(demo, dt));
        demo.step(dt, demoInput);
        if (demo.state === CabinetState.Over || demo.phase === 'card' && demo.phaseTime > 2.5) newDemo();
      } else {
        let pad = input;
        if (o.bot) { botInput.latch(o.bot.drive(sim, dt)); pad = botInput; }
        sim.step(dt, pad);
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
