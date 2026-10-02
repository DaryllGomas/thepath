// THE NODE · THE ASCENT (cabinet level 6) · THE CARTRIDGE: spec + factories (id 'ascent'), as every cabinet game.
//
//   AscentCartridge.newSim() / newBot() / startRound(seed, credit)   the round and its pilot (the Lab, a bench)
//   AscentCartridge.newRenderer()     a plain 320x240 PixelSurface picture (the Lab's frames and checks only)
//   AscentCartridge.createGame(renderer, opts)   THE SHOWPIECE: the layered glowing look on a three.js texture
//                                        (game.js: create -> update(dt, input) -> texture + state + events)
// To put it on the cabinet's registry later: one line in js/cabinet/cartridges.js (not done here).
import { CabinetCartridge, PixelFont } from '../../sdk/index.js';
import { AscentSpec, AscentPalette, TUNE } from './spec.js';
import { AscentRound, AscentPad } from './round.js';
import { AscentBot } from './bot.js';
import { FRAME, ISLANDS } from './layout.js';

/** The Lab's picture: the islands as bars, the pads, the crystals, the lander, the score. */
class AscentSurfaceRenderer {
  draw(sim, s) {
    const P = AscentPalette, k = 320 / FRAME[0], X = (x) => Math.round(x * k), Y = (y) => Math.round(y * k);
    const rect = (x, y, w, h, c) => { if (x >= 8 && y >= 8 && x + w <= 312 && y + h <= 232) s.rect(x, y, w, h, c); };   // the 8-px safe area
    s.clear(P.get('bg'));
    for (const i of sim.islands) {
      const hw = i.def.w / 2;
      rect(X(i.x - hw), Y(i.y), Math.max(2, X(i.def.w)), 2, P.get('gold'));
      rect(X(i.x - hw / 2), Y(i.y) + 2, Math.max(1, X(hw)), Math.max(1, Y(i.def.thick + i.def.pyr) - 2), P.get('cyan'));
      if (i.padOn) rect(X(i.x + i.def.pad.dx) - 2, Y(i.y) - 2, 5, 2, i.lit ? P.get('gold') : P.get('dim'));
    }
    for (const c of sim.crystals) rect(X(c.x) - 2, Y(c.y) - 3, 4, 6, P.get('red'));
    if (sim.lander.alive) rect(X(sim.lander.x) - 3, Y(sim.lander.y) - 3, 6, 6, P.get('lander'));
    s.text(String(sim.score), 8, 8, PixelFont.Arcade, P.get('text'));
    if (sim.phase === 'card') s.textCentered(sim.result === 2 ? AscentSpec.roundWonText : AscentSpec.roundLostText, 160, 110, PixelFont.Arcade, P.get('text'));
  }
}

class AscentCartridgeClass extends CabinetCartridge {
  constructor() {
    super(AscentSpec, () => new AscentRound(), () => new AscentSurfaceRenderer(), () => new AscentBot('good'));
  }
  async createGame(renderer, opts = {}) {
    const { createAscentGame } = await import('./game.js');    // lazy: three.js only when the showpiece is wanted
    return createAscentGame(renderer, opts);
  }
}

export const AscentCartridge = new AscentCartridgeClass();
export { AscentSpec, AscentPalette, AscentRound, AscentPad, AscentBot, TUNE, ISLANDS };
