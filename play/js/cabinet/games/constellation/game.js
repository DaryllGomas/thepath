// THE NODE · THE CONSTELLATION (cabinet level 2) · THE GAME, as a host plugs it in: create -> update(dt, input) -> texture.
//
//   const game = await createConstellationGame(renderer, { width: 1024, height: 768, ledger, cabinetId: 'constellation' });
//   each frame:  game.update(dt, { x, y, px, py, a, b, l, m, r, start });
//                x/y = stick in -1..1 (+y = UP); px/py = the pointer in frame coords (1266 x 952; omit or NaN when the
//                mouse isn't the aim); a (or b) = FIRE from the nearest base; l/m/r = fire from the left/middle/right pair;
//                buttons HELD (edges are found here). Then put game.texture on the cabinet's glass, or game.blit().
//   game.state   { mode: 'attract' | 'play', phase: 'ready' | 'wave' | 'breath' | 'card', wave, score, time, result,
//                  bases, temple, lit, hi, last, credit }
//   game.events  this frame's: { kind: 'cue', name } (Coin Start Hit Miss Die Win Bonus Tick) and the round's own
//                ({ kind: 'fire' | 'burst' | 'kill' | 'split' | 'impact' | 'waveStart' | 'waveClear' | 'light' | 'break' |
//                  'reload' | 'dry' | 'clear' | 'out', ... })
//   game.start(seed?)  a credit (as START does)      game.onRoundOver = (result, summary, { score, credit }) => {}
//   game.frameToPointer(u, v)  canvas uv (0..1, y down) -> frame coords, for a host mapping its mouse
//   update(dt, input, { bot })   a ConstellationBot plays instead of the input (demos, tests)
//
// Attract: the good bot plays a demo round under the title card; START, A or a click takes a credit. The mercy ledger
// (SDK: per cabinet id, the fifth credit cannot be lost) eases the round per round lost.
import { CabinetState, RoundResult, SoundCueNames, SessionLedger, Mercy, CreditInfo } from '../../sdk/index.js';
import { createLookKit } from '../../lookkit/index.js';
import { ConstellationRound, ConstellationPad } from './round.js';
import { ConstellationBot } from './bot.js';
import { ConstellationSpec } from './spec.js';
import { ConstellationView, CONSTELLATION_LOOK } from './view.js';
import { FRAME, TEMPLE } from './layout.js';

export async function createConstellationGame(renderer, opts = {}) {
  const kit = createLookKit(renderer, { ...CONSTELLATION_LOOK, width: opts.width ?? 1024, height: opts.height ?? 768 });
  const view = new ConstellationView(kit);
  view.inCabinet = !!opts.inCabinet;      // the seven-game cabinet (js/cabinet/seven/) asks for its own words on the attract card
  await view.ready;
  const ledger = opts.ledger ?? new SessionLedger();
  const cabinetId = opts.cabinetId ?? 'constellation';
  const pad = new ConstellationPad(), demoPad = new ConstellationPad(), botPad = new ConstellationPad();
  let mode = 'attract', sim = null, demo = null, demoBot = null, t = 0, demoSeed = opts.demoSeed ?? 7;
  let hi = ConstellationSpec.highScoreSeed[0], last = 0;
  const events = [];

  const newDemo = () => {
    demo = new ConstellationRound(); const c = new CreditInfo();
    demo.reset(demoSeed++ * 104729, c, Mercy.resolve(ConstellationSpec.knobs, c));
    demoBot = new ConstellationBot('good'); demoBot.reset(demoSeed); demoPad.clear();
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
      const s = game.sim, tp = s.stars[TEMPLE];
      return { mode, phase: s.phase, wave: s.wave + 1, score: s.score, time: s.levelTime, result: s.result, bases: s.basesAlive,
        temple: tp.alive ? tp.hp : 0, lit: s.litCount, hi, last, credit: sim ? sim.credit.number : 0 };
    },
    frameToPointer(u, v) { return [u * FRAME[0], v * FRAME[1]]; },
    /** Forget this cabinet's credits and losses (a fresh machine: tests, or a host's 'reset mercy'). */
    resetLedger() { ledger._credits?.clear?.(); ledger._losses?.clear?.(); },
    start(seed) {
      ledger.recordCredit(cabinetId);
      const credit = Mercy.fromLedger(ledger, cabinetId);
      sim = new ConstellationRound();
      sim.reset(seed ?? ((Date.now() & 0x7fffffff) | 1), credit, Mercy.resolve(ConstellationSpec.knobs, credit));
      mode = 'play'; pad.clear(); botPad.clear();
      events.push({ kind: 'cue', name: 'Coin' });
    },
    update(dt, frame, o = {}) {
      events.length = 0;
      dt = Math.min(Math.max(dt, 0), 0.1);
      t += dt;
      pad.latch(frame);
      if (mode === 'attract' && (pad.pressed('start') || pad.pressed('a') || o.bot)) game.start(o.seed);
      if (mode === 'attract') {
        demoPad.latch(demoBot.drive(demo, dt));
        demo.step(dt, demoPad);
        if (demo.state === CabinetState.Over || (demo.phase === 'card' && demo.phaseTime > 3.0)) newDemo();
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
