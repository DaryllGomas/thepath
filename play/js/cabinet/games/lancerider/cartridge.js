// THE NODE · world 1 · LANCE RIDER on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of LanceRiderCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { LanceRiderSpec, LanceRiderPalette } from './spec.js';
import { LanceRiderRound } from './round.js';
import { LanceRiderRenderer } from './renderer.js';
import { LanceRiderBot } from './bot.js';

export const LanceRiderCartridge = new CabinetCartridge(
    LanceRiderSpec, () => new LanceRiderRound(), () => new LanceRiderRenderer(), () => new LanceRiderBot());

export { LanceRiderSpec, LanceRiderPalette, LanceRiderRound, LanceRiderRenderer, LanceRiderBot };
