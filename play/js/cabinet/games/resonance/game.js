// THE NODE · THE RESONANCE (cabinet level 5) · THE GAME, as a host plugs it in: create -> update(dt, input) -> texture.
//
//   const game = await createResonanceGame(renderer, { width: 1024, height: 768, ledger, cabinetId: 'resonance' });
//   each frame:  game.update(dt, { x, a, b, start });
//                x = left / right (-1..1): the emitter slides along the ground; a (or b) = FIRE (a press sends one pulse
//                straight up, two in flight at most); start (or a) takes a credit. Then put game.texture on the cabinet's
//                glass, or game.blit().
//   game.state   { mode: 'attract' | 'play', phase: 'ready' | 'play' | 'lost' | 'card', tuned, target, chain, lives, score,
//                  time, result, hi, last, credit }
//   game.events  this frame's: { kind: 'cue', name } (Coin Start Hit Miss Die Win Bonus Tick) and the round's own
//                ({ kind: 'fire' | 'shatter' | 'offphase' | 'split' | 'cut' | 'broken' | 'passed' | 'chainBreak' | 'landed' |
//                  'struck' | 'ward' | 'lifeLost' | 'tell' | 'shard' | 'shardGround' | 'spawn' | 'almost' | 'go' | 'again' |
//                  'clear' | 'out' | 'gone', ... })
//   game.start(seed?)  a credit (as START does)      game.onRoundOver = (result, summary, { score, credit }) => {}
//   update(dt, input, { bot })   a ResonanceBot plays instead of the input (demos, tests)
//
// Attract: the good bot plays a demo round under the title card; START takes a credit. The mercy ledger (SDK: per cabinet
// id, the fifth credit cannot be lost) eases the round per round lost.
import { CabinetState, RoundResult, SoundCueNames, SessionLedger, Mercy, CreditInfo } from '../../sdk/index.js';
import { createLookKit } from '../../lookkit/index.js';
import { ResonanceRound, ResonancePad } from './round.js';
import { ResonanceBot } from './bot.js';
import { ResonanceSpec } from './spec.js';
import { ResonanceView, RESONANCE_LOOK } from './view.js';
import { FRAME } from './layout.js';

export async function createResonanceGame(renderer, opts = {}) {
  const kit = createLookKit(renderer, { ...RESONANCE_LOOK, width: opts.width ?? 1024, height: opts.height ?? 768 });
  const view = new ResonanceView(kit);
  view.inCabinet = !!opts.inCabinet;      // the seven-game cabinet (js/cabinet/seven/) asks for its own words on the attract card
  await view.ready;
  const ledger = opts.ledger ?? new SessionLedger();
  const cabinetId = opts.cabinetId ?? 'resonance';
  const pad = new ResonancePad(), demoPad = new ResonancePad(), botPad = new ResonancePad();
  let mode = 'attract', sim = null, demo = null, demoBot = null, t = 0, demoSeed = opts.demoSeed ?? 7;
  let hi = ResonanceSpec.highScoreSeed[0], last = 0;
  const events = [];

  const newDemo = () => {
    demo = new ResonanceRound(); const c = new CreditInfo();
    demo.reset(demoSeed++ * 104729, c, Mercy.resolve(ResonanceSpec.knobs, c));
    demoBot = new ResonanceBot('good'); demoBot.reset(demoSeed); demoPad.clear();
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
      return { mode, phase: s.phase, tuned: s.tuned, target: s.target, chain: s.chain, lives: s.livesLeft, score: s.score,
        time: s.levelTime, result: s.result, hi, last, credit: sim ? sim.credit.number : 0 };
    },
    frameToPointer(u, v) { return [u * FRAME[0], v * FRAME[1]]; },
    /** Forget this cabinet's credits and losses (a fresh machine: tests, or a host's 'reset mercy'). */
    resetLedger() { ledger._credits?.clear?.(); ledger._losses?.clear?.(); },
    start(seed) {
      ledger.recordCredit(cabinetId);
      const credit = Mercy.fromLedger(ledger, cabinetId);
      sim = new ResonanceRound();
      sim.reset(seed ?? ((Date.now() & 0x7fffffff) | 1), credit, Mercy.resolve(ResonanceSpec.knobs, credit));
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
