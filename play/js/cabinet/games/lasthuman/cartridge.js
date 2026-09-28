// THE NODE · world 1 · LAST HUMAN on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of LastHumanCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { LastHumanSpec, LastHumanPalette } from './spec.js';
import { LastHumanRound } from './round.js';
import { LastHumanRenderer } from './renderer.js';
import { LastHumanBot } from './bot.js';

export const LastHumanCartridge = new CabinetCartridge(
    LastHumanSpec, () => new LastHumanRound(), () => new LastHumanRenderer(), () => new LastHumanBot());

export { LastHumanSpec, LastHumanPalette, LastHumanRound, LastHumanRenderer, LastHumanBot };
