// THE NODE · HEARTH (cabinet level 1) · THE CARTRIDGE: spec + factories (id 'hearth'), as every cabinet game.
//
//   HearthCartridge.newSim() / newBot() / startRound(seed, credit)   the round and its pilot (the Lab, a bench)
//   HearthCartridge.newRenderer()        a plain 320x240 PixelSurface picture (the Lab's frames and checks only)
//   HearthCartridge.createGame(renderer, opts)   THE SHOWPIECE: the layered glowing look on a three.js texture
//                                        (game.js: create -> update(dt, input) -> texture + state + events)
// To put it on the cabinet's registry later: one line in js/cabinet/cartridges.js (not done here).
import { CabinetCartridge, PixelFont } from '../../sdk/index.js';
import { HearthSpec, HearthPalette, TUNE } from './spec.js';
import { HearthRound } from './round.js';
import { HearthBot } from './bot.js';
import { FRAME, HEARTH } from './layout.js';

/** The Lab's picture: the cave floor, the fire as a ring that fills, fuel, shades, the player. */
class HearthSurfaceRenderer {
  draw(sim, s, t) {
    const P = HearthPalette, k = 320 / FRAME[0], X = (x) => Math.round(x * k), Y = (y) => Math.round(y * k);
    s.clear(P.get('bg'));
    const hx = X(HEARTH[0]), hy = Y(HEARTH[1]);
    s.circle(hx, hy, 22, P.get('dim'), false);
    const n = 40, lit = Math.round(n * sim.fire);
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (i / n) * Math.PI * 2;
      s.setPixel(Math.round(hx + Math.cos(a) * 22), Math.round(hy + Math.sin(a) * 10), P.get(i < lit ? 'ring' : 'dim'));
    }
    if (sim.fire > 0) s.circle(hx, hy - 3, Math.max(1, Math.round(5 * sim.fire)), P.get('fire'), true);
    for (const f of sim.shards) s.rect(X(f.x) - 1, Y(f.y) - 1, 2, 2, P.get('gold'));
    for (const sh of sim.shades) if (sh.st !== 'die') s.rect(X(sh.x) - 2, Y(sh.y) - 2, 4, 4, P.get('shade'));
    const pl = sim.player;
    s.rect(X(pl.x) - 2, Y(pl.y) - 2, 4, 4, P.get('player'));
    for (const an of [sim.bull, sim.deer]) if (an.st === 'charge') s.circle(X(an.x), Y(an.y), 6, P.get('gold'), false);
    s.text(String(sim.score), 8, 8, PixelFont.Arcade, P.get('text'));
    if (sim.phase === 'card') s.textCentered(sim.result === 2 ? HearthSpec.roundWonText : HearthSpec.roundLostText, 160, 110, PixelFont.Arcade, P.get('text'));
  }
}

class HearthCartridgeClass extends CabinetCartridge {
  constructor() { super(HearthSpec, () => new HearthRound(), () => new HearthSurfaceRenderer(), () => new HearthBot('good')); }
  async createGame(renderer, opts = {}) {
    const { createHearthGame } = await import('./game.js');     // lazy: three.js only when the showpiece is wanted
    return createHearthGame(renderer, opts);
  }
}

export const HearthCartridge = new HearthCartridgeClass();
export { HearthSpec, HearthPalette, HearthRound, HearthBot, TUNE };
