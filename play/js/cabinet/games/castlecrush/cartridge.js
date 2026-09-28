// THE NODE · world 1 · CASTLE CRUSH (Ironclad Amusements, 1981) on the Cabinet Engine · THE CARTRIDGE:
// spec + factories (port of CastleCrushCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { CastleCrushSpec, CastleCrushPalette } from './spec.js';
import { CastleCrushRound } from './round.js';
import { CastleCrushRenderer } from './renderer.js';
import { CastleCrushBot } from './bot.js';

export const CastleCrushCartridge = new CabinetCartridge(
    CastleCrushSpec, () => new CastleCrushRound(), () => new CastleCrushRenderer(), () => new CastleCrushBot());

export { CastleCrushSpec, CastleCrushPalette, CastleCrushRound, CastleCrushRenderer, CastleCrushBot };
