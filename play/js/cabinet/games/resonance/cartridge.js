// THE NODE · THE RESONANCE (cabinet level 5) · THE CARTRIDGE: spec + factories (id 'resonance'), as every cabinet game.
//
//   ResonanceCartridge.newSim() / newBot() / startRound(seed, credit)   the round and its pilot (the Lab, a bench)
//   ResonanceCartridge.newRenderer()     a plain 320x240 PixelSurface picture (the Lab's frames and checks only)
//   ResonanceCartridge.createGame(renderer, opts)   THE SHOWPIECE: the layered glowing look on a three.js texture
//                                        (game.js: create -> update(dt, input) -> texture + state + events)
// To put it on the cabinet's registry later: one line in js/cabinet/cartridges.js (not done here).
import { CabinetCartridge, PixelFont } from '../../sdk/index.js';
import { ResonanceSpec, ResonancePalette, TUNE } from './spec.js';
import { ResonanceRound, ResonancePad } from './round.js';
import { ResonanceBot } from './bot.js';
import { FRAME, WAVE, groundY } from './layout.js';

/** The Lab's picture: the wave as dots, the shapes (white while resonant), the emitter, the pulses, the score. */
class ResonanceSurfaceRenderer {
  draw(sim, s) {
    const P = ResonancePalette, k = 320 / FRAME[0], X = (x) => Math.round(x * k), Y = (y) => Math.round(y * k);
    const rect = (x, y, w, h, c) => { if (x >= 8 && y >= 8 && x + w <= 312 && y + h <= 232) s.rect(x, y, w, h, c); };   // the 8-px safe area
    s.clear(P.get('bg'));
    for (let x = WAVE.x0; x <= WAVE.x1; x += 6) rect(X(x), Y(WAVE.y0 - sim.wave.A * Math.sin(WAVE.k * x - sim.wave.phase)), 1, 1, P.get('wave'));
    for (const q of sim.shapes) if (q.alive) rect(X(q.x) - 1, Y(q.y) - 1, 3, 3, sim.isResonant(q) ? P.get('node') : P.get('red'));
    for (const p of sim.pulses) rect(X(p.x), Y(p.y), 1, 2, P.get('node'));
    for (const d of sim.shards) rect(X(d.x), Y(d.y), 1, 2, P.get('red'));
    if (sim.emitter.alive) rect(X(sim.emitter.x) - 2, Y(groundY(sim.emitter.x)) - 3, 5, 3, P.get('emitter'));
    s.text(String(sim.score), 8, 8, PixelFont.Arcade, P.get('text'));
    if (sim.phase === 'card') {
      s.textCentered(sim.result === 2 ? ResonanceSpec.roundWonText : ResonanceSpec.roundLostText, 160, 110, PixelFont.Arcade, P.get('text'));
    }
  }
}

class ResonanceCartridgeClass extends CabinetCartridge {
  constructor() {
    super(ResonanceSpec, () => new ResonanceRound(), () => new ResonanceSurfaceRenderer(), () => new ResonanceBot('good'));
  }
  async createGame(renderer, opts = {}) {
    const { createResonanceGame } = await import('./game.js');    // lazy: three.js only when the showpiece is wanted
    return createResonanceGame(renderer, opts);
  }
}

export const ResonanceCartridge = new ResonanceCartridgeClass();
export { ResonanceSpec, ResonancePalette, ResonanceRound, ResonancePad, ResonanceBot, TUNE };
