// THE NODE · THE BEACON (cabinet level 3) · THE CARTRIDGE: spec + factories (id 'beacon'), as every cabinet game.
//
//   BeaconCartridge.newSim() / newBot() / startRound(seed, credit)   the round and its pilot (the Lab, a bench)
//   BeaconCartridge.newRenderer()        a plain 320x240 PixelSurface picture (the Lab's frames and checks only)
//   BeaconCartridge.createGame(renderer, opts)   THE SHOWPIECE: the layered glowing look on a three.js texture
//                                        (game.js: create -> update(dt, input) -> texture + state + events)
// To put it on the cabinet's registry later: one line in js/cabinet/cartridges.js (not done here).
import { CabinetCartridge, PixelFont } from '../../sdk/index.js';
import { BeaconSpec, BeaconPalette, TUNE } from './spec.js';
import { BeaconRound, BeaconPad } from './round.js';
import { BeaconBot } from './bot.js';
import { FRAME, CENTRE, RINGS, segAngle, segSpan } from './layout.js';

/** The Lab's picture: the rings (live shields as arcs), the core, the ship, the shots, the shards, the score. */
class BeaconSurfaceRenderer {
  draw(sim, s) {
    const P = BeaconPalette, k = 320 / FRAME[0], X = (x) => Math.round(x * k), Y = (y) => Math.round(y * k);
    s.clear(P.get('bg'));
    RINGS.forEach((ring, i) => {
      sim.rings[i].segs.forEach((seg, j) => {
        if (!seg.alive) return;
        const a0 = segAngle(i, j, sim.rings[i].rot), sp = segSpan(i);
        for (let q = -4; q <= 4; q++) {
          const a = a0 + sp * q / 4;
          s.rect(X(CENTRE[0] + Math.cos(a) * ring.R), Y(CENTRE[1] + Math.sin(a) * ring.R * ring.sy), 1, 1, P.get('ring'));
        }
      });
    });
    s.circle(X(CENTRE[0]), Y(CENTRE[1]), 3, P.get('core'), true);
    const sh = sim.ship;
    if (sh.alive) { s.rect(X(sh.x) - 1, Y(sh.y) - 1, 3, 3, P.get('ship')); s.rect(X(sh.x + Math.cos(sh.a) * 12), Y(sh.y + Math.sin(sh.a) * 12), 1, 1, P.get('ship')); }
    for (const b of sim.shots) s.rect(X(b.x), Y(b.y), 1, 1, P.get('core'));
    for (const d of sim.shards) if (d.dying < 0) s.rect(X(d.x) - 1, Y(d.y) - 1, 2, 2, P.get('red'));
    s.text(String(sim.score), 8, 8, PixelFont.Arcade, P.get('text'));
    if (sim.phase === 'card') {
      s.textCentered(sim.result === 2 ? BeaconSpec.roundWonText : BeaconSpec.roundLostText, 160, 110, PixelFont.Arcade, P.get('text'));
    }
  }
}

class BeaconCartridgeClass extends CabinetCartridge {
  constructor() {
    super(BeaconSpec, () => new BeaconRound(), () => new BeaconSurfaceRenderer(), () => new BeaconBot('good'));
  }
  async createGame(renderer, opts = {}) {
    const { createBeaconGame } = await import('./game.js');     // lazy: three.js only when the showpiece is wanted
    return createBeaconGame(renderer, opts);
  }
}

export const BeaconCartridge = new BeaconCartridgeClass();
export { BeaconSpec, BeaconPalette, BeaconRound, BeaconPad, BeaconBot, TUNE };
