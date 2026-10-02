// THE NODE · THE TUNNEL (cabinet level 7, the finale) · THE GAME, as a host plugs it in: create -> update(dt, input) -> texture.
//
//   const game = await createTunnelGame(renderer, { width: 1024, height: 768, ledger, cabinetId: 'tunnel', renderScale });
//   (renderScale: the picture is drawn at that many times 1024x768 for a sharp big screen; default TUNNEL_LOOK's 1.5.
//   game.setRenderScale(s) changes it, e.g. to match the page's canvas pixels on a resize)
//   each frame:  game.update(dt, { x, a, b, start });
//                x = left / right (-1..1): the ship moves round the rim, lane by lane; a (or b) = FIRE (a press fires at once,
//                held fires lazily); start takes a credit (on the title, FIRE does too). Then put game.texture on the
//                cabinet's glass, or game.blit().
//   game.state   { mode: 'attract' | 'play', phase: 'ready' | 'play' | 'lost' | 'letgo' | 'fall' | 'card', wave, wavesCleared,
//                  waveLeft, wake, ring, lives, score, time, result, hi, last, credit }
//   game.events  this frame's: { kind: 'cue', name } (Coin Start Hit Miss Die Win Bonus Tick) and the round's own ({ kind:
//                'fire' | 'kill' | 'crack' | 'split' | 'hop' | 'rim' | 'crawl' | 'flip' | 'spawn' | 'wave' | 'waveClear' | 'arrive' |
//                'lifeLost' | 'ward' | 'sink' | 'letgo' | 'hint' | 'dissolve' | 'fall' | 'go' | 'again' | 'clear' | 'out' | 'gone' |
//                'lane', ... })
//   game.start(seed?)  a credit (as START does)      game.onRoundOver = (result, summary, { score, credit }) => {}
//   update(dt, input, { bot })   a TunnelBot plays instead of the input (demos, tests)
//
// Attract: the good bot plays a demo round under the title card (the demo never shows THE LET-GO: that is the player's own);
// START takes a credit. The mercy ledger (SDK: per cabinet id, the fifth credit cannot be lost) eases the round per round
// lost. (FIRE is its own button, `a`, handled by the round the way the Resonance does; the SDK's input object reads
// pressed('a') as START, so FIRE never goes through that path.)
import { CabinetState, RoundResult, SoundCueNames, SessionLedger, Mercy, CreditInfo } from '../../sdk/index.js';
import { createLookKit } from '../../lookkit/index.js';
import { TunnelRound, TunnelPad } from './round.js';
import { TunnelBot } from './bot.js';
import { TunnelSpec } from './spec.js';
import { TunnelView, TUNNEL_LOOK } from './view.js';
import { FRAME } from './layout.js';

export async function createTunnelGame(renderer, opts = {}) {
  // (drawn at renderScale x 1024x768: TUNNEL_LOOK's 1.5 unless the host asks for another, e.g. the page's own pixel size)
  const kit = createLookKit(renderer, { ...TUNNEL_LOOK, width: opts.width ?? 1024, height: opts.height ?? 768,
    renderScale: opts.renderScale ?? TUNNEL_LOOK.renderScale });
  const view = new TunnelView(kit);
  view.inCabinet = !!opts.inCabinet;      // the seven-game cabinet (js/cabinet/seven/) asks for its own words on the attract card
  await view.ready;
  const ledger = opts.ledger ?? new SessionLedger();
  const cabinetId = opts.cabinetId ?? 'tunnel';
  const pad = new TunnelPad(), demoPad = new TunnelPad(), botPad = new TunnelPad();
  let mode = 'attract', sim = null, demo = null, demoBot = null, t = 0, demoSeed = opts.demoSeed ?? 7;
  let hi = TunnelSpec.highScoreSeed[0], last = 0;
  const events = [];

  const newDemo = () => {
    demo = new TunnelRound(); const c = new CreditInfo();
    demo.reset(demoSeed++ * 104729, c, Mercy.resolve(TunnelSpec.knobs, c));
    demoBot = new TunnelBot('good'); demoBot.reset(demoSeed); demoPad.clear();
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
    get renderScale() { return kit.renderScale; },
    setRenderScale(s) { if (Math.abs(s - kit.renderScale) > 1e-6) { kit.setSize(kit.width, kit.height, s); kit.resetPersistence(); } },
    events,
    onRoundOver: null,
    get mode() { return mode; },
    /** the round on the glass (the demo in attract) */
    get sim() { return mode === 'attract' ? demo : sim; },
    get state() {
      const s = game.sim;
      return { mode, phase: s.phase, wave: s.wave, wavesCleared: s.wavesCleared, waveLeft: s.waveLeft, wake: s.wake, ring: s.ring,
        lives: s.livesLeft, score: s.score, time: s.levelTime, result: s.result, hi, last, credit: sim ? sim.credit.number : 0 };
    },
    frameToPointer(u, v) { return [u * FRAME[0], v * FRAME[1]]; },
    /** Forget this cabinet's credits and losses (a fresh machine: tests, or a host's 'reset mercy'). */
    resetLedger() { ledger._credits?.clear?.(); ledger._losses?.clear?.(); },
    start(seed) {
      ledger.recordCredit(cabinetId);
      const credit = Mercy.fromLedger(ledger, cabinetId);
      sim = new TunnelRound();
      sim.reset(seed ?? ((Date.now() & 0x7fffffff) | 1), credit, Mercy.resolve(TunnelSpec.knobs, credit));
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
        if (demo.state === CabinetState.Over || demo.phase === 'card' || demo.phase === 'letgo') newDemo();
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
