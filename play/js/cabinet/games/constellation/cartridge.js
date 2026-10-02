// THE NODE · THE CONSTELLATION (cabinet level 2) · THE CARTRIDGE: spec + factories (id 'constellation'), as every
// cabinet game.
//
//   ConstellationCartridge.newSim() / newBot() / startRound(seed, credit)   the round and its pilot (the Lab, a bench)
//   ConstellationCartridge.newRenderer()        a plain 320x240 PixelSurface picture (the Lab's frames and checks only)
//   ConstellationCartridge.createGame(renderer, opts)   THE SHOWPIECE: the layered glowing look on a three.js texture
//                                               (game.js: create -> update(dt, input) -> texture + state + events)
// To put it on the cabinet's registry later: one line in js/cabinet/cartridges.js (not done here).
import { CabinetCartridge, PixelFont } from '../../sdk/index.js';
import { ConstellationSpec, ConstellationPalette, TUNE } from './spec.js';
import { ConstellationRound, ConstellationPad } from './round.js';
import { ConstellationBot } from './bot.js';
import { FRAME, STARS, TEMPLE, GROUND_Y } from './layout.js';

/** The Lab's picture: the ground, the stars (lit or dark), the shapes, the shots and rings, the crosshair, the score. */
class ConstellationSurfaceRenderer {
  draw(sim, s) {
    const P = ConstellationPalette, k = 320 / FRAME[0], X = (x) => Math.round(x * k), Y = (y) => Math.round(y * k);
    s.clear(P.get('bg'));
    s.rect(0, Y(GROUND_Y), 320, 1, P.get('dim'));
    STARS.forEach((st, i) => {
      const alive = sim.stars[i].alive, w = i === TEMPLE ? 8 : 5, h = i === TEMPLE ? 10 : 6;
      s.rect(X(st.x) - w, Y(GROUND_Y) - h, w * 2, h, P.get(alive ? 'gold' : 'dim'));
    });
    for (const sh of sim.shapes) s.rect(X(sh.x) - 1, Y(sh.y) - 1, 3, 3, P.get('red'));
    for (const sh of sim.shots) s.rect(X(sh.x), Y(sh.y), 1, 1, P.get('shot'));
    for (const b of sim.bursts) s.circle(X(b.x), Y(b.y), Math.max(1, Math.round(b.r * k)), P.get('shot'), false);
    s.rect(X(sim.cross.x) - 2, Y(sim.cross.y), 5, 1, P.get('gold'));
    s.rect(X(sim.cross.x), Y(sim.cross.y) - 2, 1, 5, P.get('gold'));
    s.text(String(sim.score), 8, 8, PixelFont.Arcade, P.get('text'));
    if (sim.phase === 'card') {
      s.textCentered(sim.result === 2 ? ConstellationSpec.roundWonText : ConstellationSpec.roundLostText, 160, 110, PixelFont.Arcade, P.get('text'));
    }
  }
}

class ConstellationCartridgeClass extends CabinetCartridge {
  constructor() {
    super(ConstellationSpec, () => new ConstellationRound(), () => new ConstellationSurfaceRenderer(), () => new ConstellationBot('good'));
  }
  async createGame(renderer, opts = {}) {
    const { createConstellationGame } = await import('./game.js');     // lazy: three.js only when the showpiece is wanted
    return createConstellationGame(renderer, opts);
  }
}

export const ConstellationCartridge = new ConstellationCartridgeClass();
export { ConstellationSpec, ConstellationPalette, ConstellationRound, ConstellationPad, ConstellationBot, TUNE };
