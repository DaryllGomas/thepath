// THE NODE · world 1 · WARLORD'S ROAD on the Cabinet Engine · THE CARTRIDGE: spec + factories.
import { CabinetCartridge } from '../../sdk/index.js';
import { WarlordsSpec, WarlordsPalette } from './spec.js';
import { WarlordsRound } from './round.js';
import { WarlordsRenderer } from './renderer.js';
import { WarlordsBot } from './bot.js';

export const WarlordsRoadCartridge = new CabinetCartridge(
    WarlordsSpec, () => new WarlordsRound(), () => new WarlordsRenderer(), () => new WarlordsBot());

export { WarlordsSpec, WarlordsPalette, WarlordsRound, WarlordsRenderer, WarlordsBot };
