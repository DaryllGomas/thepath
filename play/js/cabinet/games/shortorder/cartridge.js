// THE NODE · world 1 · SHORT ORDER (Northgate Novelty Co., 1982) · THE CARTRIDGE: spec + factories
// (port of ShortOrderCartridge.cs from Staging/Batch2/shortorder; the data lives in spec.js and art.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { ShortOrderSpec, ShortOrderPalette } from './spec.js';
import { ShortOrderSim } from './round.js';
import { ShortOrderRenderer } from './renderer.js';
import { ShortOrderBot } from './bot.js';
import { ShortOrderMap } from './map.js';

export const ShortOrderCartridge = new CabinetCartridge(
    ShortOrderSpec, () => new ShortOrderSim(), () => new ShortOrderRenderer(), () => new ShortOrderBot());

export { ShortOrderSpec, ShortOrderPalette, ShortOrderSim, ShortOrderRenderer, ShortOrderBot, ShortOrderMap };
