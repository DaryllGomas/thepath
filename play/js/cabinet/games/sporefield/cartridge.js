// THE NODE · world 1 · SPORE FIELD on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of SporeFieldCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { SporeFieldSpec, SporeFieldPalette } from './spec.js';
import { SporeFieldRound } from './round.js';
import { SporeFieldRenderer } from './renderer.js';
import { SporeFieldBot } from './bot.js';

export const SporeFieldCartridge = new CabinetCartridge(
    SporeFieldSpec, () => new SporeFieldRound(), () => new SporeFieldRenderer(), () => new SporeFieldBot());

export { SporeFieldSpec, SporeFieldPalette, SporeFieldRound, SporeFieldRenderer, SporeFieldBot };
