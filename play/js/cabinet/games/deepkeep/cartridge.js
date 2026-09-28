// THE NODE · world 1 · THE DEEP KEEP on the Cabinet Engine · THE CARTRIDGE: spec + factories.
import { CabinetCartridge } from '../../sdk/index.js';
import { DeepKeepSpec, DeepKeepPalette } from './spec.js';
import { DeepKeepRound } from './round.js';
import { DeepKeepRenderer } from './renderer.js';
import { DeepKeepBot } from './bot.js';
import { Dungeon } from './dungeon.js';

export const DeepKeepCartridge = new CabinetCartridge(
    DeepKeepSpec, () => new DeepKeepRound(), () => new DeepKeepRenderer(), () => new DeepKeepBot());

export { DeepKeepSpec, DeepKeepPalette, DeepKeepRound, DeepKeepRenderer, DeepKeepBot, Dungeon };
