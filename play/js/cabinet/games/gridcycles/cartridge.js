// THE NODE · world 1 · GRID CYCLES '82 on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of GridCyclesCartridge.cs, the 9/23 mercy tune; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { GridCyclesSpec, GridCyclesPalette } from './spec.js';
import { GridCyclesRound } from './round.js';
import { GridCyclesRenderer } from './renderer.js';
import { GridCyclesBot } from './bot.js';
import { GridCyclesDuel } from './duel.js';

export const GridCyclesCartridge = new CabinetCartridge(
    GridCyclesSpec, () => new GridCyclesRound(), () => new GridCyclesRenderer(), () => new GridCyclesBot());

export { GridCyclesSpec, GridCyclesPalette, GridCyclesRound, GridCyclesRenderer, GridCyclesBot, GridCyclesDuel };
