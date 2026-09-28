// THE NODE · world 1 · LANE JUMPER (Redline Coin-Op, 1982) on the Cabinet Engine · THE CARTRIDGE: spec +
// factories (port of LaneJumperCartridge.cs, Staging/Batch2/lanejumper; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { LaneJumperSpec, LaneJumperPalette } from './spec.js';
import { LaneJumperRound } from './round.js';
import { LaneJumperRenderer } from './renderer.js';
import { LaneJumperBot } from './bot.js';
import { LaneField } from './field.js';

export const LaneJumperCartridge = new CabinetCartridge(
    LaneJumperSpec, () => new LaneJumperRound(), () => new LaneJumperRenderer(), () => new LaneJumperBot());

export { LaneJumperSpec, LaneJumperPalette, LaneJumperRound, LaneJumperRenderer, LaneJumperBot, LaneField };
