// THE NODE · world 1 · SPRITE POP (Wavecrest Interactive, 1986) on the Cabinet Engine · THE CARTRIDGE:
// spec + factories (port of SpritePopCartridge.cs, Staging/Batch2/spritepop; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { SpritePopSpec, SpritePopPalette } from './spec.js';
import { SpritePopSim } from './round.js';
import { SpritePopRenderer } from './renderer.js';
import { SpritePopBot } from './bot.js';
import { SpritePopLevel } from './tiles.js';

export const SpritePopCartridge = new CabinetCartridge(
    SpritePopSpec, () => new SpritePopSim(), () => new SpritePopRenderer(), () => new SpritePopBot());

export { SpritePopSpec, SpritePopPalette, SpritePopSim, SpritePopRenderer, SpritePopBot, SpritePopLevel };
