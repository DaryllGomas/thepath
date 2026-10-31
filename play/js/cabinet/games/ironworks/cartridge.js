// THE NODE · world 1 · IRONWORKS (Ironclad Amusements, 1981) on the Cabinet Engine · THE CARTRIDGE:
// spec + factories (port of IronworksCartridge.cs from Staging/Batch3/ironworks; the data lives in spec.js,
// the five boards in boards.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { IronworksSpec, IronworksPalette, DrumSpeedBase } from './spec.js';
import { IronworksSim } from './sim.js';
import { IronworksRenderer } from './renderer.js';
import { IronworksBot } from './bot.js';
import { Board, Girder, Ladder, HammerSpot, Pickup, Bolt } from './level.js';
import { BOARDS } from './boards.js';
import { IronworksSprites } from './sprites.js';

export const IronworksCartridge = new CabinetCartridge(
    IronworksSpec, () => new IronworksSim(), () => new IronworksRenderer(), () => new IronworksBot());

export {
    IronworksSpec, IronworksPalette, DrumSpeedBase, IronworksSim, IronworksRenderer, IronworksBot,
    Board, BOARDS, Girder, Ladder, HammerSpot, Pickup, Bolt, IronworksSprites,
};
