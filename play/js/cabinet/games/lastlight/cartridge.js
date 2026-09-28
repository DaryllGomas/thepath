// THE NODE · world 1 · LAST LIGHT on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of LastLightCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { LastLightSpec, LastLightPalette, LastLightBomberSprite } from './spec.js';
import { LastLightRound } from './round.js';
import { LastLightRenderer } from './renderer.js';
import { LastLightBot } from './bot.js';

export const LastLightCartridge = new CabinetCartridge(
    LastLightSpec, () => new LastLightRound(), () => new LastLightRenderer(), () => new LastLightBot());

export { LastLightSpec, LastLightPalette, LastLightBomberSprite, LastLightRound, LastLightRenderer, LastLightBot };
