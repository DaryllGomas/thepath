// THE NODE · world 1 · TUNNEL RAT on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of TunnelRatCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { TunnelRatSpec, TunnelRatPalette } from './spec.js';
import { TunnelRatSim } from './sim.js';
import { TunnelRatRenderer } from './renderer.js';
import { TunnelRatBot } from './bot.js';

export const TunnelRatCartridge = new CabinetCartridge(
    TunnelRatSpec, () => new TunnelRatSim(), () => new TunnelRatRenderer(), () => new TunnelRatBot());

export { TunnelRatSpec, TunnelRatPalette, TunnelRatSim, TunnelRatRenderer, TunnelRatBot };
