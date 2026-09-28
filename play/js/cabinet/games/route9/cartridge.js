// THE NODE · world 1 · ROUTE 9 on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of Route9Cartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { Route9Spec, Route9Palette } from './spec.js';
import { Route9Sim } from './sim.js';
import { Route9Renderer } from './renderer.js';
import { Route9Bot } from './bot.js';

export const Route9Cartridge = new CabinetCartridge(
    Route9Spec, () => new Route9Sim(), () => new Route9Renderer(), () => new Route9Bot());

export { Route9Spec, Route9Palette, Route9Sim, Route9Renderer, Route9Bot };
