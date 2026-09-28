// THE NODE · world 1 · RELIC QUEST on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of RelicQuestGame.cs / RelicQuestSim.cs, Slice B; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { RelicQuestSpec, RelicQuestPalette } from './spec.js';
import { RelicQuestRound } from './round.js';
import { RelicQuestRenderer } from './renderer.js';
import { RelicQuestBot } from './bot.js';
import { RelicQuestMaze } from './maze.js';

export const RelicQuestCartridge = new CabinetCartridge(
    RelicQuestSpec, () => new RelicQuestRound(), () => new RelicQuestRenderer(), () => new RelicQuestBot());

export { RelicQuestSpec, RelicQuestPalette, RelicQuestRound, RelicQuestRenderer, RelicQuestBot, RelicQuestMaze };
