// THE NODE · world 1 · STARVECTOR on the Cabinet Engine · THE CARTRIDGE: spec + factories
// (port of StarvectorGame.cs + StarvectorSim.cs, Slice B 9/22; the data lives in spec.js).
import { CabinetCartridge } from '../../sdk/index.js';
import { StarvectorSpec, StarvectorPalette } from './spec.js';
import { StarvectorRound } from './round.js';
import { StarvectorRenderer } from './renderer.js';
import { StarvectorBot } from './bot.js';
import { StarvectorField } from './field.js';

export const StarvectorCartridge = new CabinetCartridge(
    StarvectorSpec, () => new StarvectorRound(), () => new StarvectorRenderer(), () => new StarvectorBot());

export { StarvectorSpec, StarvectorPalette, StarvectorRound, StarvectorRenderer, StarvectorBot, StarvectorField };
