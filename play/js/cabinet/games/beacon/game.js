// THE NODE · THE BEACON (cabinet level 3) · THE GAME, as a host plugs it in: create -> update(dt, input) -> texture.
//
//   const game = await createBeaconGame(renderer, { width: 1024, height: 768, ledger, cabinetId: 'beacon' });
//   each frame:  game.update(dt, { x, y, a, b, start });
//                x = turn (-1 left .. +1 right), y > 0 = thrust (a stick's up, or the UP key), a (or b) = FIRE, start;
//                buttons HELD (edges are found here). Then put game.texture on the cabinet's glass, or game.blit().
//   game.state   { mode: 'attract' | 'play', phase: 'ready' | 'play' | 'lit' | 'card', lit, ships, score, time, result,
//                  hi, last, credit }
//   game.events  this frame's: { kind: 'cue', name } (Coin Start Hit Miss Die Win Bonus Tick) and the round's own
//                ({ kind: 'fire' | 'chip' | 'break' | 'ringClear' | 'formed' | 'charge' | 'shard' | 'shardKill' | 'shardFade' |
//                  'die' | 'respawn' | 'shield' | 'light' | 'go' | 'clear' | 'out' | 'fizzle', ... })
//   game.start(seed?)  a credit (as START does)      game.onRoundOver = (result, summary, { score, credit }) => {}
//   update(dt, input, { bot })   a BeaconBot plays instead of the input (demos, tests)
//
// Attract: the good bot plays a demo round under the title card; START or FIRE takes a credit. The mercy ledger (SDK: per
// cabinet id, the fifth credit cannot be lost) eases the round per round lost.
import { CabinetState, RoundResult, SoundCueNames, SessionLedger, Mercy, CreditInfo } from '../../sdk/index.js';
import { createLookKit } from '../../lookkit/index.js';
import { BeaconRound, BeaconPad } from './round.js';
import { BeaconBot } from './bot.js';
import { BeaconSpec } from './spec.js';
import { BeaconView, BEACON_LOOK } from './view.js';
import { FRAME } from './layout.js';

export async function createBeaconGame(renderer, opts = {}) {
  const kit = createLookKit(renderer, { ...BEACON_LOOK, width: opts.width ?? 1024, height: opts.height ?? 768 });
  const view = new BeaconView(kit);
  view.inCabinet = !!opts.inCabinet;      // the seven-game cabinet (js/cabinet/seven/) asks for its own words on the attract card
  await view.ready;
  const ledger = opts.ledger ?? new SessionLedger();
  const cabinetId = opts.cabinetId ?? 'beacon';
  const pad = new BeaconPad(), demoPad = new BeaconPad(), botPad = new BeaconPad();
  let mode = 'attract', sim = null, demo = null, demoBot = null, t = 0, demoSeed = opts.demoSeed ?? 7;
  let hi = BeaconSpec.highScoreSeed[0], last = 0;
  const events = [];

  const newDemo = () => {
    demo = new BeaconRound(); const c = new CreditInfo();
    demo.reset(demoSeed++ * 104729, c, Mercy.resolve(BeaconSpec.knobs, c));
    demoBot = new BeaconBot('good'); demoBot.reset(demoSeed); demoPad.clear();
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
      return { mode, phase: s.phase, lit: s.core.lit, ships: s.ships, score: s.score, time: s.levelTime, result: s.result, hi, last,
        credit: sim ? sim.credit.number : 0 };
    },
    frameToPointer(u, v) { return [u * FRAME[0], v * FRAME[1]]; },
    /** Forget this cabinet's credits and losses (a fresh machine: tests, or a host's 'reset mercy'). */
    resetLedger() { ledger._credits?.clear?.(); ledger._losses?.clear?.(); },
    start(seed) {
      ledger.recordCredit(cabinetId);
      const credit = Mercy.fromLedger(ledger, cabinetId);
      sim = new BeaconRound();
      sim.reset(seed ?? ((Date.now() & 0x7fffffff) | 1), credit, Mercy.resolve(BeaconSpec.knobs, credit));
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
        if (demo.state === CabinetState.Over || (demo.phase === 'card' && demo.phaseTime > 3.5)) newDemo();
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
