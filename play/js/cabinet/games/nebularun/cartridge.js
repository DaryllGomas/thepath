// THE NODE · world 1 · NEBULA RUN on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of Staging/Batch4/nebularun/Games/NebulaRun/NebulaRunCartridge.cs; the data lives in spec.js).
//
// Not yet added to js/cabinet/cartridges.js by design (see PORTING.md): the Lab finds an unregistered
// cartridge by its folder, `node lab/lab.mjs all nebularun`. Add the one line to cartridges.js when
// this cabinet is ready to go live.
import { CabinetCartridge } from '../../sdk/index.js';
import { NebulaRunSpec, NebulaRunPalette } from './spec.js';
import { NebulaRunRound } from './round.js';
import { NebulaRunRenderer } from './renderer.js';
import { NebulaRunBot } from './bot.js';
import { NebulaScroll } from './scroll.js';

export const NebulaRunCartridge = new CabinetCartridge(
    NebulaRunSpec, () => new NebulaRunRound(), () => new NebulaRunRenderer(), () => new NebulaRunBot());

export { NebulaRunSpec, NebulaRunPalette, NebulaRunRound, NebulaRunRenderer, NebulaRunBot, NebulaScroll };
