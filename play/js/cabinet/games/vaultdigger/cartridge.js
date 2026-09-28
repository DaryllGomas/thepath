// THE NODE · world 1 · VAULT DIGGER on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of VaultDiggerCartridge.cs; the data + sprite art live in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { VaultDiggerSpec, VaultDiggerPalette, VaultArt } from './spec.js';
import { VaultDiggerSim } from './sim.js';
import { VaultDiggerRenderer } from './renderer.js';
import { VaultDiggerBot } from './bot.js';

export const VaultDiggerCartridge = new CabinetCartridge(
    VaultDiggerSpec, () => new VaultDiggerSim(), () => new VaultDiggerRenderer(), () => new VaultDiggerBot());

export { VaultDiggerSpec, VaultDiggerPalette, VaultArt, VaultDiggerSim, VaultDiggerRenderer, VaultDiggerBot };
