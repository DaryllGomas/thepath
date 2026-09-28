// THE NODE · world 1 · IRON DOJO (Ironclad Amusements, 1985) on the Cabinet Engine · THE CARTRIDGE:
// spec + factories (port of IronDojoCartridge.cs; the data lives in spec.js, the sprites in sprites.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { IronDojoSpec, IronDojoPalette } from './spec.js';
import { IronDojoSim } from './sim.js';
import { IronDojoRenderer } from './renderer.js';
import { IronDojoBot } from './bot.js';
import { IronDojoScroll } from './scroll.js';
import { IronDojoSprites } from './sprites.js';

export const IronDojoCartridge = new CabinetCartridge(
    IronDojoSpec, () => new IronDojoSim(), () => new IronDojoRenderer(), () => new IronDojoBot());

export { IronDojoSpec, IronDojoPalette, IronDojoSim, IronDojoRenderer, IronDojoBot, IronDojoScroll, IronDojoSprites };
