// THE NODE · THE TUNNEL (cabinet level 7, the finale) · THE CARTRIDGE: spec + factories (id 'tunnel'), as every cabinet game.
//
//   TunnelCartridge.newSim() / newBot() / startRound(seed, credit)   the round and its pilot (the Lab, a bench)
//   TunnelCartridge.newRenderer()     a plain 320x240 PixelSurface picture (the Lab's frames and checks only)
//   TunnelCartridge.createGame(renderer, opts)   THE SHOWPIECE: the layered glowing look on a three.js texture
//                                        (game.js: create -> update(dt, input) -> texture + state + events)
// To put it on the cabinet's registry later: one line in js/cabinet/cartridges.js (not done here).
import { CabinetCartridge, PixelFont } from '../../sdk/index.js';
import { TunnelSpec, TunnelPalette, TUNE } from './spec.js';
import { TunnelRound, TunnelPad } from './round.js';
import { TunnelBot } from './bot.js';
import { FRAME, N, CX, CY, laneAt, vertexAt } from './layout.js';

/** The Lab's picture: the rim, the heart, the echoes, the shots, the ship, the score, LET GO. */
class TunnelSurfaceRenderer {
  draw(sim, s) {
    const P = TunnelPalette, k = 320 / FRAME[0], X = (x) => Math.round(x * k), Y = (y) => Math.round(y * k);
    const rect = (x, y, w, h, c) => { if (x >= 8 && y >= 8 && x + w <= 312 && y + h <= 232) s.rect(x, y, w, h, c); };   // the 8-px safe area
    s.clear(P.get('bg'));
    for (let j = 0; j < N; j++) { const v = vertexAt(j, 1); rect(X(v[0]), Y(v[1]), 1, 1, P.get('web')); }
    rect(X(CX) - 1, Y(CY) - 1, 3, 3, sim.wake > 0.5 ? P.get('gold') : P.get('dim'));
    for (const e of sim.echoes) { const p = laneAt(e.q, e.w); rect(X(p[0]) - 1, Y(p[1]) - 1, 3, 3, P.get('red')); }
    for (const sh of sim.shots) { const p = laneAt(sh.lane, sh.w); rect(X(p[0]), Y(p[1]), 1, 1, P.get('ship')); }
    if (sim.ship.alive) { const p = laneAt(sim.ship.pos, 1); rect(X(p[0]) - 2, Y(p[1]) - 2, 5, 3, P.get('ship')); }
    s.text(String(sim.score), 8, 8, PixelFont.Arcade, P.get('text'));
    if (sim.phase === 'letgo') s.textCentered('LET GO', 160, 40, PixelFont.Arcade, P.get('gold'));
    if (sim.phase === 'card') s.textCentered(sim.result === 2 ? TunnelSpec.roundWonText : TunnelSpec.roundLostText, 160, 110, PixelFont.Arcade, P.get('text'));
  }
}

class TunnelCartridgeClass extends CabinetCartridge {
  constructor() {
    super(TunnelSpec, () => new TunnelRound(), () => new TunnelSurfaceRenderer(), () => new TunnelBot('good'));
  }
  async createGame(renderer, opts = {}) {
    const { createTunnelGame } = await import('./game.js');    // lazy: three.js only when the showpiece is wanted
    return createTunnelGame(renderer, opts);
  }
}

export const TunnelCartridge = new TunnelCartridgeClass();
export { TunnelSpec, TunnelPalette, TunnelRound, TunnelPad, TunnelBot, TUNE };
