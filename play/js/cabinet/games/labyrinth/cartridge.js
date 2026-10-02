// THE NODE · THE LABYRINTH (cabinet level 4) · THE CARTRIDGE: spec + factories (id 'labyrinth'), as every cabinet game.
//
//   LabyrinthCartridge.newSim() / newBot() / startRound(seed, credit)   the round and its pilot (the Lab, a bench)
//   LabyrinthCartridge.newRenderer()     a plain 320x240 PixelSurface picture (the Lab's frames and checks only)
//   LabyrinthCartridge.createGame(renderer, opts)   THE SHOWPIECE: the layered glowing look on a three.js texture
//                                        (game.js: create -> update(dt, input) -> texture + state + events)
// To put it on the cabinet's registry later: one line in js/cabinet/cartridges.js (not done here).
import { CabinetCartridge, PixelFont } from '../../sdk/index.js';
import { LabyrinthSpec, LabyrinthPalette, TUNE } from './spec.js';
import { LabyrinthRound, LabyrinthPad } from './round.js';
import { LabyrinthBot } from './bot.js';
import { FRAME, NODES, EDGES } from './layout.js';

/** The Lab's picture: the open lanes as dotted lines, the light, the ship, the pursuers, the score. */
class LabyrinthSurfaceRenderer {
  draw(sim, s) {
    const P = LabyrinthPalette, k = 320 / FRAME[0], X = (x) => Math.round(x * k), Y = (y) => Math.round(y * k);
    s.clear(P.get('bg'));
    for (const E of EDGES) {
      if (!sim.open[E.id] || E.kind === 'wrap') continue;
      const A = NODES[E.a], B = NODES[E.b], n = Math.max(1, Math.ceil(E.L * k));
      for (let i = 0; i <= n; i++) s.rect(X(A.x + (B.x - A.x) * i / n), Y(A.y + (B.y - A.y) * i / n), 1, 1, P.get('dim'));
    }
    const w = [0, 0];
    for (const l of sim.light) if (!l.eaten) { sim.worldAt(l.e, l.s, w); s.rect(X(w[0]), Y(w[1]), l.power ? 2 : 1, l.power ? 2 : 1, P.get('gold')); }
    if (sim.player.alive) s.rect(X(sim.player.x) - 1, Y(sim.player.y) - 1, 3, 3, P.get('ship'));
    for (const q of sim.pursuers) if (q.st === 'active' || q.st === 'emerging') s.rect(X(q.x) - 1, Y(q.y) - 1, 3, 3, P.get('red'));
    s.text(String(sim.score), 8, 8, PixelFont.Arcade, P.get('text'));
    if (sim.phase === 'card') {
      s.textCentered(sim.result === 2 ? LabyrinthSpec.roundWonText : LabyrinthSpec.roundLostText, 160, 110, PixelFont.Arcade, P.get('text'));
    }
  }
}

class LabyrinthCartridgeClass extends CabinetCartridge {
  constructor() {
    super(LabyrinthSpec, () => new LabyrinthRound(), () => new LabyrinthSurfaceRenderer(), () => new LabyrinthBot('good'));
  }
  async createGame(renderer, opts = {}) {
    const { createLabyrinthGame } = await import('./game.js');    // lazy: three.js only when the showpiece is wanted
    return createLabyrinthGame(renderer, opts);
  }
}

export const LabyrinthCartridge = new LabyrinthCartridgeClass();
export { LabyrinthSpec, LabyrinthPalette, LabyrinthRound, LabyrinthPad, LabyrinthBot, TUNE };
