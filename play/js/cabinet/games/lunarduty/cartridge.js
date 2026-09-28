// THE NODE · world 1 · LUNAR DUTY on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of LunarDutyCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { LunarDutySpec, LunarDutyPalette } from './spec.js';
import { LunarDutySim } from './sim.js';
import { LunarDutyRenderer } from './renderer.js';
import { LunarDutyBot } from './bot.js';

export const LunarDutyCartridge = new CabinetCartridge(
    LunarDutySpec, () => new LunarDutySim(), () => new LunarDutyRenderer(), () => new LunarDutyBot());

export { LunarDutySpec, LunarDutyPalette, LunarDutySim, LunarDutyRenderer, LunarDutyBot };
