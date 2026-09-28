// THE NODE · world 1 · MUD & METAL on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of MudMetalCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { MudMetalSpec, MudMetalPalette } from './spec.js';
import { MudMetalSim } from './sim.js';
import { MudMetalRenderer } from './renderer.js';
import { MudMetalBot } from './bot.js';

export const MudMetalCartridge = new CabinetCartridge(
    MudMetalSpec, () => new MudMetalSim(), () => new MudMetalRenderer(), () => new MudMetalBot());

export { MudMetalSpec, MudMetalPalette, MudMetalSim, MudMetalRenderer, MudMetalBot };
