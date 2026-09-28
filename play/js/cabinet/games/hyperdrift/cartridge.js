// THE NODE · world 1 · HYPER DRIFT (Redline Coin-Op, 1983) on the Cabinet Engine · THE CARTRIDGE: spec +
// factories (port of HyperDriftCartridge.cs; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { HyperDriftSpec, HyperDriftPalette } from './spec.js';
import { HyperDriftSim } from './sim.js';
import { HyperDriftRenderer } from './renderer.js';
import { HyperDriftBot } from './bot.js';
import { HyperDriftTrack, HyperDriftScroll } from './track.js';
import { HyperDriftSprites } from './sprites.js';

export const HyperDriftCartridge = new CabinetCartridge(
    HyperDriftSpec, () => new HyperDriftSim(), () => new HyperDriftRenderer(), () => new HyperDriftBot());

export { HyperDriftSpec, HyperDriftPalette, HyperDriftSim, HyperDriftRenderer, HyperDriftBot, HyperDriftTrack, HyperDriftScroll, HyperDriftSprites };
